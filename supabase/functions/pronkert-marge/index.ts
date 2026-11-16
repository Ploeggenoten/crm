// ===============================================================
// PRONKERT-MARGE - margefactuur van de backoffice in het CRM zetten.
//
// De weekroutine leest de factuur (PDF of Excel) en stuurt de regels hierheen.
// Deze functie doet het schrijfwerk, zodat de service-sleutel binnen Supabase
// blijft: op de Mac van Tjeerd staat alleen CRON_SECRET, precies zoals bij
// lead-radar.
//
// Werkwijze - alles wordt AFGELEID, nooit opgeteld:
//   1. alle regels van dit factuurnummer worden eerst verwijderd, daarna
//      opnieuw weggeschreven  -> dezelfde factuur twee keer insturen verandert
//      niets;
//   2. per geraakte week wordt fin_flex_weken herrekend uit fin_flex_regels;
//   3. per flexkracht worden gewerkte_uren en marge_werkelijk herrekend uit
//      alle regels die bij hem horen.
// Een correctie op een oude week (dat gebeurt: factuur 268245 boekte eerst vijf
// dagen terug en factureerde ze opnieuw) komt zo vanzelf goed terecht.
//
// Aanroepen:
//   POST { tekst:"...", droog:true }          -> lezen zonder op te slaan (voorbeeld)
//   POST { tekst:"..." }                      -> lezen en opslaan
//   POST { regels:[...] }                     -> al elders gelezen regels opslaan
//   POST { stand:true }                     -> huidige weken + krachten teruglezen
//   POST { koppel:{regnr, plaatsing_id} }   -> onbekende flexkracht vastzetten
//   POST { stekkerdoos:true, regels:[...], droog? } -> Stekkerdoos-overzicht
//        inboeken: vervangt de geraakte weken helemaal (zie importStekkerdoos)
// De cron-routine stuurt header x-cron-key: CRON_SECRET; het CRM stuurt het
// bearer-token van de ingelogde eigenaar.
// ===============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const EIGENAAR = "tjeerd@ploeggenoten.nl";
const rond = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// -- De factuur lezen -------------------------------------------
// De tekstlaag van de PDF, of een geplakte tekst uit dezelfde factuur.
// Een lezer voor het CRM en voor de routine: zo kan het voorbeeldscherm nooit
// iets anders tonen dan er wordt opgeslagen.

const getal = (s: string) => Number(String(s).replace(/\./g, "").replace(",", "."));
const urenVan = (s: string) => {
  const neg = s.trim().startsWith("-");
  const [u, m] = s.trim().replace(/^-/, "").split(":");
  const w = Number(u) + Number(m) / 60;
  return neg ? -w : w;
};

// Maandag van een ISO-week. 4 januari valt altijd in week 1 - vanaf dat
// ankerpunt terugrekenen is de kortste manier die ook rond de jaarwisseling klopt.
function maandagVan(jaar: number, week: number) {
  const vier = new Date(Date.UTC(jaar, 0, 4));
  const dag = (vier.getUTCDay() + 6) % 7;                 // maandag = 0
  const maandagW1 = new Date(vier.getTime() - dag * 864e5);
  return new Date(maandagW1.getTime() + (week - 1) * 7 * 864e5).toISOString().slice(0, 10);
}

// Eindejaarsuitkering en arbeidstijdverkorting leveren wel marge op, maar zijn
// geen gewerkte uren - ze mogen de kosteloze-overnamegrens niet opsouperen.
//
// Op deelwoord toetsen, niet op de hele naam: de twee factuurvormen noemen
// dezelfde uursoort anders. Vorm A schrijft "Loon overwerkuren", vorm B
// "Overwerkuren 150%" - zonder "Loon" en met het toeslagpercentage erachter.
// Een exacte lijst ving die tweede niet, waardoor Alains 8,5 overwerkuren in
// week 35 wegvielen uit de urentelling (6 sep 2026).
// Ploegentoeslag is ook gewerkte tijd: bij Rick staan zijn uren in week 41
// alleen als "Ploegentoeslag" op de factuur, zonder losse normale-urenregel.
// Zonder deze term telde hij 0 uur terwijl de marge wel binnenkwam (28 okt 2026).
const GEWERKT = ["normale uren", "overwerkuren", "ploegentoeslag"];
const isGewerkt = (soort: string) => {
  const s = String(soort ?? "").trim().toLowerCase();
  return GEWERKT.some((u) => s.includes(u));
};

const KOP = /Omschrijving\s+Uren\/eenh\.[\s\S]*?ALPHEN AAN DEN RIJN/g;
const VOET = /(Factuurnummer\s+\d+\.\s*Transporteren pagina\s+\d+|Getransporteerd van pagina\s+\d+)\s+-?[\d.]*\d,\d{2}/g;
// Er komen TWEE factuurvormen binnen, en dat blijft zo: Tjeerd heeft de tweede
// er bewust bij gevraagd omdat die voor hem beter leesbaar is. Ze verschillen in
// waar de uren staan, en dus in wat het getal vóór de btw-code betekent:
//
//   vorm A - uren in de omschrijving, kolom Uren/eenh. is altijd 1,00:
//     "Week 31-2026 27-07-2026 Loon normale uren: 8:00, uurloon EUR 16,09 ...
//      factor 1,7880   1,00   -78,80 2   -78,80"
//   vorm B - uren in de kolom Uren/eenh., met de marge PER EENHEID ernaast:
//     "Week 35-2026 24-08-2026 Loon normale uren, uurloon EUR 20,03 ...
//      factor 1,7760   8,00   -11,50 2   -92,00"
//
// In beide vormen is het laatste bedrag de regelmarge; alleen het urenveld
// verschilt. Vorm A staat als eerste in de alternatie, zodat een regel met
// ": 8:00," daar terechtkomt en niet half door vorm B wordt opgeslokt.
//
//   vorm C (sinds factuur 272159, 18 okt 2026) - als vorm B, maar de kop mist
//     "Factuur <nr>" en de regel mist de datum na de week:
//     "R. Jansen (Rick), Reg.nr. 123, Operator Week 41-2026 Ploegentoeslag, ..."
//   Daarom zijn kopnummer en datum optioneel; de naam moet dan wel met een
//   hoofdletter beginnen, zodat er geen losse tekst voor de kop wordt opgeslokt.
const BLOK = new RegExp(
  "(?:Factuur (?<fnr>\\d+) )?(?<pnaam>[A-Z][^,()]*?\\([^)]+\\)), Reg\\.nr\\. (?<reg>\\d+), (?<functie>.+?)(?= Week |$)" +
  "|Week (?<wk>\\d+)-(?<jr>\\d{4}) (?<dat>\\d{2}-\\d{2}-\\d{4}) (?<soort>[^:]+?): (?<uren>-?\\d+:\\d+)," +
  "(?<rest>[\\s\\S]*?) (?<basis>-?[\\d.]*\\d,\\d{2}) 2 (?<bedrag>-?[\\d.]*\\d,\\d{2})" +
  "|Week (?<nwk>\\d+)-(?<njr>\\d{4}) (?:(?<ndat>\\d{2}-\\d{2}-\\d{4}) )?(?<nsoort>[^:,]+?)," +
  "(?<nrest>[\\s\\S]*?) (?<naantal>-?[\\d.]*\\d,\\d{2}) (?<nper>-?[\\d.]*\\d,\\d{2}) 2 (?<nbedrag>-?[\\d.]*\\d,\\d{2})",
  "g",
);

export function leesFactuur(ruw: string) {
  const tekst = String(ruw || "").replace(/\s+/g, " ");
  const factuur = (tekst.match(/Factuurnummer:\s*(\d+)/) ?? [])[1] ?? "";
  const fd = tekst.match(/Factuurdatum:\s*(\d{2})-(\d{2})-(\d{4})/);
  const factuurdatum = fd ? `${fd[3]}-${fd[2]}-${fd[1]}` : null;
  const tot = tekst.match(/Totaal\s+(-?[\d.]*\d,\d{2})/);
  const totaal = tot ? -getal(tot[1]) : null;    // op de factuur staat het negatief (credit)

  const schoon = tekst.replace(KOP, " ").replace(VOET, " ").replace(/\s+/g, " ");
  const regels: Record<string, unknown>[] = [];
  let kop: Record<string, string> | null = null;

  for (const m of schoon.matchAll(BLOK)) {
    const g = m.groups!;
    if (g.pnaam) {
      const nm = g.pnaam.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      kop = {
        deelfactuur: g.fnr || factuur, regnr: g.reg, functie: (g.functie || "").trim(),
        naam: nm ? nm[1].trim() : g.pnaam.trim(), roepnaam: nm ? nm[2].trim() : "",
      };
      continue;
    }
    if (!kop) continue;                       // regel zonder kop: overslaan, niet gokken
    // Welke vorm we te pakken hebben zie je aan welke groepen gevuld zijn:
    // vorm A vult 'soort', vorm B/C vullen 'nsoort' (C zonder datum).
    const isA = g.soort != null;
    const soort = ((isA ? g.soort : g.nsoort) || "").trim();
    const rest = (isA ? g.rest : g.nrest) || "";
    const uren = isA ? urenVan(g.uren) : getal(g.naantal);
    const wk = isA ? g.wk : g.nwk, jr = isA ? g.jr : g.njr;
    const bedrag = isA ? g.bedrag : g.nbedrag;
    const uit = (p: RegExp) => { const x = rest.match(p); return x ? getal(x[1]) : null; };
    const dat = isA ? g.dat : g.ndat;   // vorm C: geen datum -> maandag van de week
    const maandag = maandagVan(Number(jr), Number(wk));
    const uurloon = uit(/uurloon \u20ac ([\d.,]+)/), tarief = uit(/(?:basis)?tarief \u20ac ([\d.,]+)/);
    regels.push({
      factuur, factuurdatum, bron: "pdf", vorm: isA ? "A" : (dat ? "B" : "C"), ...kop,
      week: Number(wk), jaar: Number(jr), weekmaandag: maandag,
      datum: dat ? `${dat.slice(6)}-${dat.slice(3, 5)}-${dat.slice(0, 2)}` : maandag, soort,
      uren: isGewerkt(soort) ? uren : 0, uren_regel: uren,
      uurloon, tarief, factor: uit(/factor ([\d.,]+)/), klant: "",
      // Omzet naar de klant staat niet apart op de factuur maar volgt uit
      // tarief x uren - daarmee is de marge ook als percentage te zien.
      // Bij overwerk staat er een toeslagpercentage op de regel: de klant
      // betaalt dan basistarief x dat percentage. Laat je dat weg, dan valt de
      // klantomzet te laag uit (bij Alain in week 30 met 9,42 euro).
      klantbedrag: (tarief != null && uren)
        ? rond(tarief * uren * ((uit(/toeslag ([\d.,]+)%/) ?? 100) / 100)) : null,
      marge: -getal(bedrag),
    });
  }

  const som = rond(regels.reduce((s, r) => s + Number(r.marge), 0));
  const waarschuwing = (totaal != null && Math.abs(som - totaal) > 0.005)
    ? `De som van de regels (\u20ac${som.toFixed(2)}) wijkt af van het factuurtotaal (\u20ac${totaal.toFixed(2)}). ` +
      `Factuur ${factuur} is niet verwerkt - kijk er zelf even naar.`
    : (!regels.length ? "Geen factuurregels herkend in deze tekst." : null);

  return { factuur, factuurdatum, totaal, som, regels, waarschuwing };
}

// Regels samenvatten per week en per flexkracht (voor het voorbeeldscherm).
function perWeek(regels: Record<string, unknown>[]) {
  const weken = new Map<string, Record<string, unknown>>();
  for (const r of regels) {
    const wk = String(r.weekmaandag);
    const w = weken.get(wk) ?? { week: wk, weeknr: r.week, bedrag: 0, uren: 0, krachten: new Map() };
    const sleutel = persoonSleutel(r);
    const k = (w.krachten as Map<string, Record<string, unknown>>).get(sleutel) ??
      { naam: r.naam, roepnaam: r.roepnaam, regnr: r.regnr, functie: r.functie,
        uren: 0, marge: 0, klantomzet: 0, _nu: 0, _loon: 0, _tar: 0, _fac: 0 };
    k.uren = Number(k.uren) + Number(r.uren);
    k.marge = Number(k.marge) + Number(r.marge);
    k.klantomzet = Number(k.klantomzet) + (Number(r.klantbedrag) || 0);
    // Factoren wegen over de normale uren: overwerk en reserveringen lopen op
    // een eigen, lagere factor en zouden het beeld vertroebelen.
    if (String(r.soort).trim().toLowerCase() === "loon normale uren" && Number(r.uren)) {
      k._nu = Number(k._nu) + Number(r.uren);
      k._loon = Number(k._loon) + (Number(r.uurloon) || 0) * Number(r.uren);
      k._tar = Number(k._tar) + (Number(r.tarief) || 0) * Number(r.uren);
      k._fac = Number(k._fac) + (Number(r.factor) || 0) * Number(r.uren);
    }
    (w.krachten as Map<string, Record<string, unknown>>).set(sleutel, k);
    w.bedrag = Number(w.bedrag) + Number(r.marge);
    w.uren = Number(w.uren) + Number(r.uren);
    weken.set(wk, w);
  }
  return [...weken.values()].map((w) => ({
    week: w.week, weeknr: w.weeknr, bedrag: rond(Number(w.bedrag)), uren: rond(Number(w.uren)),
    krachten: [...(w.krachten as Map<string, Record<string, unknown>>).values()].map((k) => {
      // De factor op de regel is de INKOOPfactor van Pronkert (uurloon x factor
      // = wat zij ons rekenen); het tarief is wat de klant betaalt. Daaruit
      // volgt de klantfactor, en het verschil is de marge - in factor in plaats
      // van in euro's, precies zoals de afspraak met de klant is opgeschreven.
      const nu = Number(k._nu) || 0;
      const loon = nu ? Number(k._loon) / nu : null;
      const tar = nu ? Number(k._tar) / nu : null;
      const fac = nu ? Number(k._fac) / nu : null;
      const { _nu, _loon, _tar, _fac, ...rest } = k;
      return {
        ...rest, uren: rond(Number(k.uren)), marge: rond(Number(k.marge)),
        klantomzet: rond(Number(k.klantomzet)),
        marge_per_uur: Number(k.uren) ? rond(Number(k.marge) / Number(k.uren)) : null,
        marge_pct: Number(k.klantomzet) ? Number(k.marge) / Number(k.klantomzet) : null,
        uurloon_gem: loon != null ? rond(loon) : null,
        inkoopfactor: fac || null,
        inkooptarief: (loon != null && fac) ? rond(loon * fac) : null,
        klanttarief: tar != null ? rond(tar) : null,
        klantfactor: (loon && tar != null) ? Math.round((tar / loon) * 1e4) / 1e4 : null,
        margefactor: (loon && tar != null && fac) ? Math.round((tar / loon - fac) * 1e4) / 1e4 : null,
      };
    }),
  })).sort((a, b) => String(a.week).localeCompare(String(b.week)));
}

// 'Sven' herkennen in 'Sven van Katwijk'. Bewust op hele woorden: 'Ana' mag
// niet matchen binnen 'Ananias'.
const woorden = (s: string) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter(Boolean);

// Factuurregel of persoon aan een plaatsing knopen. E\u00e9n plek, zodat het
// vullen van de klantnaam en het bijwerken van de plaatsing niet uit elkaar
// kunnen lopen: wat de een koppelt, koppelt de ander ook.
// deno-lint-ignore no-explicit-any
function zoekPlaatsing(
  plaatsingen: any[],
  p: { regnr?: unknown; roepnaam?: unknown },
): any {
  const regnr = String(p.regnr ?? "");
  // 1) op registratienummer - dat verandert nooit
  let pl = plaatsingen.find((x) => x.regnr && String(x.regnr) === regnr);
  // 2) anders op roepnaam binnen de kandidaatnaam
  if (!pl) {
    const roep = woorden(String(p.roepnaam ?? ""))[0];
    if (roep) {
      const kandidaten = plaatsingen.filter((x) => woorden(String(x.kandidaat)).includes(roep));
      // Meer dan een Sven? Dan niet gokken, maar laten koppelen.
      if (kandidaten.length === 1) pl = kandidaten[0];
    }
  }
  return pl ?? null;
}

// -- Klantnaam uit de plaatsing ---------------------------------
// De klantnaam staat NIET op de margefactuur en WEL op het marge-overzicht van
// Sasja - maar dat komt onregelmatig, en soms helemaal niet: van week 29 heeft
// ze er nooit een gestuurd. Hij staat echter ook gewoon in het CRM, vast aan de
// plaatsing, en daar wisselt hij niet: Sven zit bij Van Vliet, Alain bij Burg
// Siroop (Tjeerd, 6 sep 2026). Dus halen we hem bij het inboeken meteen daar
// vandaan, en is het overzicht van Sasja nog puur controle.
// Alleen lege velden: een klantnaam die al ergens vandaan kwam blijft staan.
// Met `overschrijf` trekt hij ook al gevulde velden gelijk. Dat is nodig omdat
// dezelfde klant in twee schrijfwijzen bestaat: het CRM zegt 'Van Vliet
// Zoetwaren', het overzicht van Pronkert 'Van Vliet B.V.'. Twee spellingen
// tellen bij groeperen als twee klanten, en het CRM is de bron.
async function vulKlantUitPlaatsing(
  service: ReturnType<typeof createClient>,
  weken: string[],
  overschrijf = false,
) {
  const { data: plaatsingen } = await service.from("fin_flex_plaatsingen")
    .select("id,kandidaat,klant,regnr");
  const { data: rijen } = await service.from("fin_flex_regels")
    .select("id,regnr,naam,roepnaam,klant").in("week", weken);
  let bij = 0;
  for (const r of rijen ?? []) {
    const huidig = String(r.klant ?? "").trim();
    if (huidig && !overschrijf) continue;
    const pl = zoekPlaatsing(plaatsingen ?? [], r);
    const klant = String(pl?.klant ?? "").trim();
    if (!klant || klant === huidig) continue;
    await service.from("fin_flex_regels").update({ klant }).eq("id", r.id);
    bij++;
  }
  return bij;
}

// Een flexkracht = een sleutel, ongeacht de bron. NIET op registratienummer
// groeperen: dat staat wel op de PDF-factuur en niet op het Excel-marge-
// overzicht, waardoor dezelfde persoon in tweeen viel en zijn uren en marge
// elkaar overschreven (10 aug 2026, bij het terugladen van week 15-31).
// De naam staat op beide bronnen identiek: 'S. van Nicolaas (Sven)'.
const persoonSleutel = (r: Record<string, unknown>) =>
  woorden(`${r.naam ?? ""} ${r.roepnaam ?? ""}`).join("-");

Deno.serve(async (req) => {
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Toegang: de cron-sleutel van de routine, of Tjeerd zelf ingelogd in het CRM.
  // Marge is finance-informatie, dus hier geen "elke ingelogde gebruiker".
  if (req.headers.get("x-cron-key") !== Deno.env.get("CRON_SECRET")) {
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await anon.auth.getUser();
    if (!user || user.email !== EIGENAAR) {
      return new Response(JSON.stringify({ error: "geen toegang" }), { status: 403 });
    }
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* leeg mag */ }

  // -- Een onbekende flexkracht handmatig vastzetten ------------
  if (body.koppel) {
    const k = body.koppel as { regnr?: string; plaatsing_id?: string | number };
    if (!k.regnr || !k.plaatsing_id) {
      return new Response(JSON.stringify({ error: "regnr en plaatsing_id verplicht" }), { status: 400 });
    }
    await service.from("fin_flex_plaatsingen").update({ regnr: String(k.regnr) }).eq("id", k.plaatsing_id);
    await herberekenKrachten(service);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }

  // -- Klantnamen gelijktrekken met het CRM ---------------------
  // Eenmalig nodig toen de klantnaam uit de plaatsing ging komen: de oude weken
  // stonden nog op de spelling van Pronkert. Blijft bruikbaar - hernoem je een
  // klant in het CRM, dan haal je de historie hiermee bij.
  // Raakt alleen het klantveld; bedragen, uren en koppelingen blijven zoals ze
  // zijn, en een regel zonder te vinden plaatsing houdt gewoon wat hij had.
  if (body.klant_uit_crm) {
    const { data: alle } = await service.from("fin_flex_regels").select("week").limit(5000);
    const weken = [...new Set((alle ?? []).map((r) => String(r.week)))];
    const bijgewerkt = await vulKlantUitPlaatsing(service, weken, true);
    return new Response(JSON.stringify({ ok: true, bijgewerkt, weken: weken.length }),
      { headers: { "Content-Type": "application/json" } });
  }

  // -- Stand teruglezen (voor de routine-samenvatting) ----------
  if (body.stand) {
    const { data: weken } = await service.from("fin_flex_weken").select("*").order("week", { ascending: false }).limit(20);
    const { data: krachten } = await service.from("fin_flex_week_kracht").select("*").order("week", { ascending: false }).limit(400);
    const { data: facturen } = await service.from("fin_flex_regels").select("factuur").limit(5000);
    // Voor de prognose in de weekroutine: wie er loopt (start, gestopt) en
    // het maanddoel dat Tjeerd in Finance -> Flex invult.
    const { data: plaatsingen } = await service.from("fin_flex_plaatsingen").select("*");
    const { data: doel } = await service.from("fin_settings").select("value").eq("key", "flex_doel_pm").limit(1);
    return new Response(
      JSON.stringify({
        ok: true,
        // Aan deze versie ziet pronkert.sh dat de stekkerdoos-modus bestaat.
        // Een oudere functie zou dezelfde aanroep als gewone regels opslaan
        // en de week dubbel tellen - dus zonder versie: niet insturen.
        versie: STEKKERDOOS_VERSIE,
        weken: weken ?? [],
        krachten: krachten ?? [],
        facturen: [...new Set((facturen ?? []).map((r) => String(r.factuur)))],
        plaatsingen: plaatsingen ?? [],
        doel_pm: doel?.length ? Number(doel[0].value) || null : null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // -- Een margefactuur lezen (en meestal ook opslaan) ----------
  // Twee ingangen: kale tekst (de routine of het plakscherm in het CRM) of
  // regels die elders al gelezen zijn (bv. het Excel-overzicht).
  let regels = (body.regels ?? []) as Record<string, unknown>[];
  if (body.tekst) {
    const gelezen = leesFactuur(String(body.tekst));
    // Klopt de som niet met het factuurtotaal, dan slaan we niets op. Liever
    // een melding dan een half verwerkte week die niemand meer terugvindt.
    if (gelezen.waarschuwing) {
      return new Response(
        JSON.stringify({ ok: false, waarschuwing: gelezen.waarschuwing, factuur: gelezen.factuur,
          totaal: gelezen.totaal, som: gelezen.som, weken: perWeek(gelezen.regels) }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    if (body.droog) {   // voorbeeldscherm: laten zien wat eruit komt, nog niets wegschrijven
      return new Response(
        JSON.stringify({ ok: true, droog: true, factuur: gelezen.factuur,
          factuurdatum: gelezen.factuurdatum, totaal: gelezen.totaal,
          aantal_regels: gelezen.regels.length, weken: perWeek(gelezen.regels) }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    regels = gelezen.regels;
  }

  if (!Array.isArray(regels) || !regels.length) {
    return new Response(JSON.stringify({ error: "geen regels meegestuurd" }), { status: 400 });
  }

  if (body.stekkerdoos) {
    return new Response(JSON.stringify(await importStekkerdoos(service, regels, !!body.droog)),
      { headers: { "Content-Type": "application/json" } });
  }

  const facturen = [...new Set(regels.map((r) => String(r.factuur ?? "")).filter(Boolean))];
  if (!facturen.length) {
    return new Response(JSON.stringify({ error: "regels zonder factuurnummer" }), { status: 400 });
  }

  // BOTSING TUSSEN DE TWEE BRONNEN. Dezelfde week komt bij Pronkert in twee
  // vormen binnen: de margefactuur (een nummer voor alles, bv. 267947) en het
  // Excel-marge-overzicht (een nummer per flexkracht, bv. 267817/267845/267876).
  // Zonder controle zou week 30 twee keer meetellen: 2.679,70 in plaats van
  // 1.339,85.
  //
  // Die twee vormen zijn aan elkaar te knopen via het DEELFACTUURNUMMER: op de
  // PDF is dat de kop 'Factuur 267817 S. van Nicolaas (Sven), Reg.nr. ...', op
  // het Excel-overzicht is het de kolom Factuurnummer. Beide lezers vullen
  // `deelfactuur`, dus dat nummer - niet de week - is waarop dubbel werk te
  // herkennen is. Deze functie dedupliceert daarop: alles wat onder dezelfde
  // deelfactuur al in de tabel staat gaat er eerst uit en komt daarna opnieuw
  // in, ongeacht via welke bron het binnenkwam.
  //
  // Op de week sleutelen was te grof (31 aug 2026): Pronkert splitst een week
  // over meerdere margefacturen als niet alle flexkrachten tegelijk verloond
  // zijn. Week 34 stond op 268867 (alleen Alain) en 269171 (Sven + Artur);
  // de oude controle zag "week 34 bestaat al" en weigerde 844,50 euro, terwijl
  // er niets dubbels was. Weigeren op de week laat dus echte marge liggen.
  const weekLijst = [...new Set(regels.map((r) => String(r.weekmaandag ?? r.week)))];
  const deelIn = new Set(regels.map((r) => String(r.deelfactuur ?? "")).filter(Boolean));
  // Alles waaronder dit bestand bekend kan staan: het overkoepelende nummer en
  // elk deelnummer eronder. Een rij in de tabel hoort bij dit bestand zodra een
  // van haar twee nummers hierin voorkomt.
  const ids = new Set([...facturen, ...deelIn]);
  const hoortBijDitBestand = (r: Record<string, unknown>) =>
    ids.has(String(r.factuur ?? "")) || ids.has(String(r.deelfactuur ?? ""));

  const { data: bestaand } = await service.from("fin_flex_regels")
    .select("factuur,deelfactuur,week,marge,bron,naam,roepnaam").in("week", weekLijst);

  // STEKKERDOOS IS LEIDEND (Tjeerd, 16 nov 2026). Staat een flexkracht in een
  // week al via Stekkerdoos in de tabel, dan boekt de PDF hem niet opnieuw:
  // de nummers verschillen (PDF 273357 tegenover deelnummers 273165, 273224,
  // ...), dus zonder deze toets telde hij dubbel. De PDF-bedragen komen
  // terug als controle, zodat de routine een verschil nog wel ziet.
  const sdSom = new Map<string, number>();
  for (const r of bestaand ?? []) {
    if (r.bron !== "stekkerdoos") continue;
    const k = `${r.week}|${persoonSleutel(r)}`;
    sdSom.set(k, (sdSom.get(k) ?? 0) + Number(r.marge || 0));
  }
  const controle: Record<string, unknown>[] = [];
  if (sdSom.size && !body.verrijk) {
    const pdfSom = new Map<string, number>();
    regels = regels.filter((r) => {
      const k = `${r.weekmaandag ?? r.week}|${persoonSleutel(r)}`;
      if (!sdSom.has(k)) return true;
      pdfSom.set(k, (pdfSom.get(k) ?? 0) + Number(r.marge || 0));
      return false;
    });
    for (const [k, pdf] of pdfSom) {
      const [week, persoon] = k.split("|");
      const sd = rond(sdSom.get(k) ?? 0);
      controle.push({ week, persoon, pdf: rond(pdf), stekkerdoos: sd, gelijk: Math.abs(rond(pdf) - sd) < 0.01 });
    }
    if (!regels.length) {
      return new Response(JSON.stringify({ ok: true, al_via_stekkerdoos: true, facturen, controle }),
        { headers: { "Content-Type": "application/json" } });
    }
  }
  // Andere facturen in dezelfde weken zijn geen fout meer, maar wel het melden
  // waard: zo blijft in de weekmelding zichtbaar dat een week uit meer dan een
  // factuur is opgebouwd.
  const naast = (bestaand ?? []).filter((r) => !hoortBijDitBestand(r));
  const andere = [...new Set(naast.map((r) => String(r.factuur)))];
  const naastTotaal = rond(naast.reduce((s, r) => s + Number(r.marge || 0), 0));

  // Verrijken: niets bijboeken, alleen invullen wat op de margefactuur ontbreekt.
  // De klantnaam staat namelijk WEL op het Excel-overzicht en NIET op de PDF.
  if (body.verrijk) {
    let bij = 0;
    const perPersoon = new Map<string, { week: string; klant: string }>();
    for (const r of regels) {
      const klant = String(r.klant ?? "").trim();
      if (klant) perPersoon.set(`${r.weekmaandag ?? r.week}|${persoonSleutel(r)}`, { week: String(r.weekmaandag ?? r.week), klant });
    }
    const { data: rijen } = await service.from("fin_flex_regels")
      .select("id,week,naam,roepnaam,klant").in("week", weekLijst);
    for (const rij of rijen ?? []) {
      if (String(rij.klant ?? "").trim()) continue;
      const t = perPersoon.get(`${rij.week}|${persoonSleutel(rij)}`);
      if (!t) continue;
      await service.from("fin_flex_regels").update({ klant: t.klant }).eq("id", rij.id);
      bij++;
    }
    return new Response(JSON.stringify({ ok: true, verrijkt: bij, weekLijst }),
      { headers: { "Content-Type": "application/json" } });
  }

  // Eerst weg, dan opnieuw: dat maakt een tweede import onschadelijk. Beide
  // kolommen langs, want hetzelfde deelnummer staat bij een PDF-import in
  // `deelfactuur` en bij een Excel-import in allebei. Zo verdwijnt de oude
  // versie ook als dezelfde uren nu via de andere bron binnenkomen - dat is
  // precies het geval waarin week 30 anders dubbel zou tellen.
  // Stekkerdoos-regels blijven altijd staan: die dragen het PDF-nummer in
  // `factuur` mee, en zouden hier anders door hun eigen PDF worden weggegooid.
  const idLijst = [...ids];
  const nietSd = "bron.is.null,bron.neq.stekkerdoos";
  await service.from("fin_flex_regels").delete().in("factuur", idLijst).or(nietSd);
  await service.from("fin_flex_regels").delete().in("deelfactuur", idLijst).or(nietSd);
  if (body.vervang) for (const f of andere) await service.from("fin_flex_regels").delete().eq("factuur", f).or(nietSd);

  const rijen = regels.map((r) => ({
    factuur: String(r.factuur ?? ""), deelfactuur: String(r.deelfactuur ?? ""),
    factuurdatum: r.factuurdatum || null,
    week: r.weekmaandag ?? r.week, weeknr: r.week ?? null, jaar: r.jaar ?? null,
    datum: r.datum || null,
    regnr: String(r.regnr ?? ""), naam: String(r.naam ?? ""), roepnaam: String(r.roepnaam ?? ""),
    functie: String(r.functie ?? ""), klant: String(r.klant ?? ""), soort: String(r.soort ?? ""),
    uren: Number(r.uren) || 0, uren_regel: Number(r.uren_regel) || 0,
    uurloon: r.uurloon ?? null, tarief: r.tarief ?? null, factor: r.factor ?? null,
    klantbedrag: r.klantbedrag ?? null,
    marge: Number(r.marge) || 0, bron: String(r.bron ?? "pdf"),
  }));

  // In blokken: een insert van duizenden regels loopt tegen een tijdslimiet aan.
  for (let i = 0; i < rijen.length; i += 500) {
    const { error } = await service.from("fin_flex_regels").insert(rijen.slice(i, i + 500));
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Eerst de klantnaam erbij, dan pas herrekenen: de weekstand en de plaatsing
  // lezen die regels terug en tonen anders een week zonder klant.
  const geraakteWeken = [...new Set(rijen.map((r) => String(r.week)))];
  const klant_uit_crm = await vulKlantUitPlaatsing(service, geraakteWeken);
  const weken = await herberekenWeken(service, geraakteWeken);
  const kracht = await herberekenKrachten(service);

  return new Response(
    JSON.stringify({
      ok: true, facturen, regels: rijen.length, klant_uit_crm, weken, ...kracht,
      ...(controle.length ? { controle } : {}),
      ...(andere.length
        ? { naast_deze_factuur: andere, naast_geboekt: naastTotaal,
            let_op: `Deze week${weekLijst.length > 1 ? "en bevatten" : " bevat"} ook regels van ` +
              `factuur ${andere.join(", ")} (${naastTotaal.toFixed(2)} euro). Die zijn blijven staan; ` +
              `het weektotaal is de som van beide.` }
        : {}),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});

// -- Stekkerdoos-overzicht inboeken -----------------------------
// Sinds 16 nov 2026 is het marge-overzicht van Pronkerts nieuwe portaal
// (app.uitzendstekkerdoos.nl/marge/<token>/gegevens) de leidende bron: per dag,
// per looncomponent, met de klant erbij, en per week tot op de cent gelijk aan
// de facturen. Het maakte ook een leesfout van de PDF-lezer zichtbaar (wk 43/44:
// Ricks regels van factuur 272988 stonden bij Alain).
//
// De routine stuurt telkens het HELE overzicht (alle weken van het jaar). Per
// geraakte week gaat alles eruit en komt het overzicht ervoor in de plaats -
// een tweede keer insturen verandert dus niets, en een correctie van Pronkert
// op een oude week komt vanzelf mee.
//
// Wat het overzicht NIET heeft, nemen we over uit wat er al stond:
//   - uurloon en inkoopfactor (alleen op de PDF): nodig voor de factoranalyse
//     en de controle tegen de klantafspraak. Eerst dezelfde week + persoon +
//     uursoort, anders de laatst bekende van die persoon voor die uursoort.
//   - regnr (koppelt aan de plaatsing) en het PDF-factuurnummer. Dat laatste
//     komt in `factuur`, het deelnummer van Stekkerdoos in `deelfactuur`; zo
//     herkent de routine de PDF als verwerkt en boekt hij hem niet nog eens.
// De klant komt uit de plaatsing (CRM-spelling leidend); alleen wie geen
// plaatsing heeft krijgt de naam van een collega bij dezelfde klant, en
// anders de spelling van Pronkert.
const STEKKERDOOS_VERSIE = "2026-11-16b";   // b: flexplaatsingen bijhouden

async function importStekkerdoos(
  service: ReturnType<typeof createClient>,
  regels: Record<string, unknown>[],
  droog: boolean,
) {
  const weekLijst = [...new Set(regels.map((r) => String(r.weekmaandag ?? "")).filter(Boolean))];
  if (!weekLijst.length || regels.some((r) => !r.weekmaandag || !r.naam)) {
    return { ok: false, error: "regels zonder weekmaandag of naam" };
  }

  const alle: Record<string, unknown>[] = [];
  for (let van = 0; ; van += 1000) {   // PostgREST geeft per keer max 1000 rijen
    const { data } = await service.from("fin_flex_regels")
      .select("week,naam,roepnaam,regnr,soort,uurloon,factor,factuur,bron,marge,uren")
      .order("id").range(van, van + 999);
    alle.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const { data: plaatsingen } = await service.from("fin_flex_plaatsingen").select("id,kandidaat,klant,regnr");

  const soortVan = (r: Record<string, unknown>) => String(r.soort ?? "").trim().toLowerCase();
  const wps = new Map<string, Record<string, unknown>>();          // week|persoon|soort
  const ps = new Map<string, Record<string, unknown>>();           // persoon|soort, laatste week
  const preg = new Map<string, string>();                          // persoon -> regnr
  const pfac = new Map<string, string>();                          // week|persoon -> PDF-nummer
  for (const r of alle) {
    const p = persoonSleutel(r), wk = String(r.week);
    if (r.uurloon != null || r.factor != null) {
      wps.set(`${wk}|${p}|${soortVan(r)}`, r);
      const oud = ps.get(`${p}|${soortVan(r)}`);
      if (!oud || String(oud.week) <= wk) ps.set(`${p}|${soortVan(r)}`, r);
    }
    if (r.regnr) preg.set(p, String(r.regnr));
    if (r.factuur && !pfac.has(`${wk}|${p}`)) pfac.set(`${wk}|${p}`, String(r.factuur));
  }

  // Pronkert-klantnaam -> CRM-klantnaam, geleerd van wie wel een plaatsing heeft.
  const klantMap = new Map<string, string>();
  const rijen = regels.map((r) => {
    const p = persoonSleutel(r), wk = String(r.weekmaandag);
    const regnr = String(r.regnr || preg.get(p) || "");
    const pl = zoekPlaatsing(plaatsingen ?? [], { regnr, roepnaam: r.roepnaam });
    const klantPl = String(pl?.klant ?? "").trim();
    if (klantPl && r.klant_bron) klantMap.set(String(r.klant_bron), klantPl);
    const bron = wps.get(`${wk}|${p}|${soortVan(r)}`) ?? ps.get(`${p}|${soortVan(r)}`);
    return {
      factuur: pfac.get(`${wk}|${p}`) ?? String(r.deelfactuur ?? ""),
      deelfactuur: String(r.deelfactuur ?? ""),
      factuurdatum: r.factuurdatum || null,
      week: wk, weeknr: r.week ?? null, jaar: r.jaar ?? null, datum: r.datum || null,
      regnr, naam: String(r.naam ?? ""), roepnaam: String(r.roepnaam ?? ""),
      functie: String(r.functie ?? ""), klant: klantPl, _klant_bron: String(r.klant_bron ?? ""),
      soort: String(r.soort ?? ""),
      uren: Number(r.uren) || 0, uren_regel: Number(r.uren_regel) || 0,
      uurloon: bron?.uurloon ?? null, factor: bron?.factor ?? null, tarief: r.tarief ?? null,
      klantbedrag: r.klantbedrag ?? null,
      marge: Number(r.marge) || 0, bron: "stekkerdoos",
    };
  });
  for (const r of rijen) {
    if (!r.klant) r.klant = klantMap.get(r._klant_bron) ?? r._klant_bron;
  }

  // Vergelijking met wat er stond: per week en per flexkracht.
  const som = (lijst: Record<string, unknown>[], sleutel: (r: Record<string, unknown>) => string) => {
    const m = new Map<string, { marge: number; uren: number }>();
    for (const r of lijst) {
      const k = sleutel(r), x = m.get(k) ?? { marge: 0, uren: 0 };
      x.marge += Number(r.marge || 0); x.uren += Number(r.uren || 0); m.set(k, x);
    }
    return m;
  };
  const oud = alle.filter((r) => weekLijst.includes(String(r.week)));
  const wkOud = som(oud, (r) => String(r.week)), wkNieuw = som(rijen, (r) => String(r.week));
  const pOud = som(oud, (r) => `${r.week}|${r.naam} (${r.roepnaam})`);
  const pNieuw = som(rijen, (r) => `${r.week}|${r.naam} (${r.roepnaam})`);
  const weken = weekLijst.sort().map((w) => ({
    week: w, was: rond(wkOud.get(w)?.marge ?? 0), wordt: rond(wkNieuw.get(w)?.marge ?? 0),
  })).map((x) => ({ ...x, gelijk: Math.abs(x.was - x.wordt) < 0.01 }));
  const personen = [...new Set([...pOud.keys(), ...pNieuw.keys()])].sort().map((k) => {
    const [week, persoon] = k.split("|");
    const a = pOud.get(k), b = pNieuw.get(k);
    return { week, persoon, was: rond(a?.marge ?? 0), wordt: rond(b?.marge ?? 0),
      uren_was: rond(a?.uren ?? 0), uren_wordt: rond(b?.uren ?? 0) };
  }).filter((x) => Math.abs(x.was - x.wordt) >= 0.01 || Math.abs(x.uren_was - x.uren_wordt) >= 0.05);
  const zonderFactor = [...new Set(rijen.filter((r) => isGewerkt(r.soort) && r.uren && r.uurloon == null)
    .map((r) => `${r.naam} (${r.roepnaam})`))];

  const verslag = { weken: weken.filter((w) => !w.gelijk), personen, zonder_uurloon: zonderFactor,
    aantal_weken: weekLijst.length, aantal_regels: rijen.length,
    totaal: rond(rijen.reduce((s, r) => s + r.marge, 0)) };
  if (droog) {
    return { ok: true, droog: true, ...verslag,
      flexplaatsingen: await flexPlaatsingenBijwerken(service, rijen, plaatsingen ?? [], true) };
  }

  // Eerst alles van deze weken weg, dan het overzicht erin.
  for (let i = 0; i < weekLijst.length; i += 50) {
    const { error } = await service.from("fin_flex_regels").delete().in("week", weekLijst.slice(i, i + 50));
    if (error) return { ok: false, error: "verwijderen mislukt: " + error.message };
  }
  const schoon = rijen.map(({ _klant_bron, ...r }) => r);
  for (let i = 0; i < schoon.length; i += 500) {
    const { error } = await service.from("fin_flex_regels").insert(schoon.slice(i, i + 500));
    if (error) {
      return { ok: false, error: "opslaan mislukt na verwijderen: " + error.message +
        " - stuur het overzicht direct opnieuw in, dan staat alles weer goed" };
    }
  }
  const flexplaatsingen = await flexPlaatsingenBijwerken(service, rijen, plaatsingen ?? [], false);
  const herrekend = await herberekenWeken(service, weekLijst);
  const kracht = await herberekenKrachten(service);
  return { ok: true, ...verslag, flexplaatsingen, herrekend, ...kracht };
}

// -- Flexplaatsingen bijhouden vanuit Stekkerdoos ----------------
// Tjeerd, 16 nov 2026: Kevin en Noadja werken via Pronkert maar stonden niet als
// flex in Finance. "Neem ze direct mee als flexplaatsing, zodat ik het weet en
// het niet telkens hoef in te vullen - maar tel het niet als extra plaatsing,
// die zitten al in de netto plaatsingen op de teller."
// Dat laatste klopt vanzelf: de teller (dashboard) en de getekende waarde in
// Finance tellen kandidaten van het bord, niet fin_flex_plaatsingen. Deze rijen
// krijgen daarom bewust GEEN pipeline_candidate_id.
//
// Wat het doet, elke import opnieuw:
//   - wie in de laatste twee weken van het overzicht werkte en aan geen enkele
//     flexplaatsing te koppelen is, krijgt er een (met de merknotitie);
//   - rijen MET die merknotitie houdt het overzicht bij: klant gelijk aan
//     Stekkerdoos, en gestopt zodra iemand drie weken achter elkaar ontbreekt
//     (gestopt_op = laatste werkdag). Komt hij later terug, dan gaat gestopt_op
//     er weer af. Plaatsingen die Tjeerd zelf aanmaakte blijven ongemoeid.
const AUTO_NOTE = "Automatisch uit Stekkerdoos - telt niet als nieuwe plaatsing";

async function flexPlaatsingenBijwerken(
  service: ReturnType<typeof createClient>,
  rijen: Record<string, unknown>[],
  plaatsingenKort: Record<string, unknown>[],
  droog: boolean,
) {
  const { data: alleP } = await service.from("fin_flex_plaatsingen").select("*");
  const plaatsingen = alleP ?? plaatsingenKort;
  const weken = [...new Set(rijen.map((r) => String(r.week)))].sort();
  const laatste = weken[weken.length - 1];
  const recent2 = new Set(weken.slice(-2)), recent3 = new Set(weken.slice(-3));

  const per = new Map<string, { naam: string; roep: string; regnr: string; klant: string; functie: string;
    eerste: string; laatsteDag: string; weken: Set<string> }>();
  for (const r of rijen) {
    if (!(Number(r.marge) || Number(r.uren))) continue;
    const k = persoonSleutel(r);
    const p = per.get(k) ?? { naam: String(r.naam), roep: String(r.roepnaam), regnr: String(r.regnr ?? ""),
      klant: String(r.klant ?? ""), functie: String(r.functie ?? ""), eerste: String(r.datum ?? r.week),
      laatsteDag: String(r.datum ?? r.week), weken: new Set<string>() };
    p.weken.add(String(r.week));
    const dag = String(r.datum ?? r.week);
    if (dag < p.eerste) p.eerste = dag;
    if (dag > p.laatsteDag) { p.laatsteDag = dag; if (r.klant) p.klant = String(r.klant); }
    if (!p.regnr && r.regnr) p.regnr = String(r.regnr);
    per.set(k, p);
  }

  const aangemaakt: Record<string, unknown>[] = [], bijgewerkt: Record<string, unknown>[] = [];
  for (const p of per.values()) {
    const pl = zoekPlaatsing(plaatsingen, { regnr: p.regnr, roepnaam: p.roep });
    if (!pl) {
      if (![...p.weken].some((w) => recent2.has(w))) continue;   // oud en al weg: niet opgraven
      // 'K. Montoya' + 'Kevin' -> 'Kevin Montoya'; voorletters vallen weg.
      const achter = p.naam.split(/\s+/).filter((w) => !/^([A-Za-z]\.)+$/.test(w)).join(" ");
      const rij = { kandidaat: `${p.roep} ${achter}`.trim(), klant: p.klant, regnr: p.regnr, start: p.eerste,
        uren_pw: 40, concept: false, note: AUTO_NOTE, pipeline_candidate_id: null };
      if (!droog) {
        const { error } = await service.from("fin_flex_plaatsingen").insert(rij);
        if (error) { aangemaakt.push({ ...rij, fout: error.message }); continue; }
        plaatsingen.push(rij);       // zo matcht een tweede rij van dezelfde persoon niet opnieuw
      }
      aangemaakt.push(rij);
      continue;
    }
    if (pl.note !== AUTO_NOTE) continue;                          // met de hand gemaakt: niet aankomen
    const velden: Record<string, unknown> = {};
    if (p.klant && p.klant !== pl.klant) velden.klant = p.klant;
    const weg = laatste && ![...p.weken].some((w) => recent3.has(w)) && weken.length >= 3;
    if (weg && !pl.gestopt_op) velden.gestopt_op = p.laatsteDag;
    if (!weg && pl.gestopt_op) velden.gestopt_op = null;
    if (!Object.keys(velden).length) continue;
    if (!droog) await service.from("fin_flex_plaatsingen").update(velden).eq("id", pl.id);
    bijgewerkt.push({ kandidaat: pl.kandidaat, ...velden });
  }
  return { aangemaakt, bijgewerkt };
}

// -- Weektotalen opnieuw uit de regels halen --------------------
async function herberekenWeken(service: ReturnType<typeof createClient>, weken: string[]) {
  const uit: Record<string, unknown>[] = [];
  for (const w of weken) {
    const { data } = await service.from("fin_flex_regels")
      .select("marge,uren,regnr,naam,roepnaam").eq("week", w);
    const rijen = data ?? [];
    const bedrag = rond(rijen.reduce((s, r) => s + Number(r.marge || 0), 0));
    const uren = rond(rijen.reduce((s, r) => s + Number(r.uren || 0), 0));
    const krachten = new Set(rijen.filter((r) => Number(r.marge) || Number(r.uren))
      .map((r) => String(r.regnr || r.naam + r.roepnaam))).size;
    // Upsert met de hand: fin_flex_weken heeft `week` als sleutel.
    const { data: bestaand } = await service.from("fin_flex_weken").select("week").eq("week", w).limit(1);
    const velden = { bedrag, flexkrachten: krachten, note: "Pronkert margefactuur", bron: "pronkert-marge" };
    if (bestaand?.length) await service.from("fin_flex_weken").update(velden).eq("week", w);
    else await service.from("fin_flex_weken").insert({ week: w, ...velden });
    uit.push({ week: w, bedrag, uren, flexkrachten: krachten });
  }
  return uit.sort((a, b) => String(a.week).localeCompare(String(b.week)));
}

// -- Gewerkte uren en verdiende marge per flexkracht ------------
// Afgeleid uit alle regels, dus nooit dubbel geteld. Wie niet te koppelen is,
// komt terug als 'onbekend' - die slaan we niet stilzwijgend over.
async function herberekenKrachten(service: ReturnType<typeof createClient>) {
  // Per 1000: PostgREST kapt een select daar af, en sinds Stekkerdoos (een
  // regel per dag in plaats van per week) zijn het er al gauw meer.
  const regels: Record<string, unknown>[] = [];
  for (let van = 0; ; van += 1000) {
    const { data } = await service.from("fin_flex_regels")
      .select("regnr,naam,roepnaam,functie,klant,uren,marge,week,soort,uurloon,tarief,factor")
      .order("id").range(van, van + 999);
    regels.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const { data: plaatsingen } = await service.from("fin_flex_plaatsingen")
    .select("id,kandidaat,klant,regnr");

  const personen = new Map<string, {
    regnr: string; naam: string; roepnaam: string; functie: string; klant: string;
    uren: number; marge: number; laatste: string;
    nu: number; loon: number; tar: number; fac: number;
  }>();
  const isNormaal = (r: Record<string, unknown>) =>
    String(r.soort).trim().toLowerCase() === "loon normale uren" && Number(r.uren);

  for (const r of regels ?? []) {
    const sleutel = persoonSleutel(r);
    const p = personen.get(sleutel) ?? {
      regnr: "", naam: String(r.naam ?? ""), roepnaam: String(r.roepnaam ?? ""),
      functie: String(r.functie ?? ""), klant: String(r.klant ?? ""), uren: 0, marge: 0, laatste: "",
      nu: 0, loon: 0, tar: 0, fac: 0,
    };
    p.uren += Number(r.uren) || 0;
    p.marge += Number(r.marge) || 0;
    if (!p.klant && r.klant) p.klant = String(r.klant);
    if (!p.regnr && r.regnr) p.regnr = String(r.regnr);
    if (isNormaal(r) && String(r.week) > p.laatste) p.laatste = String(r.week);
    personen.set(sleutel, p);
  }

  // Tariefopbouw uit de LAATSTE week met normale uren, niet uit het gemiddelde
  // over maanden: op de plaatsing hoort te staan wat er nu geldt. Overwerk en de
  // reserveringen lopen op een eigen, lagere factor en blijven er buiten.
  for (const r of regels ?? []) {
    const p = personen.get(persoonSleutel(r));
    if (!p || !isNormaal(r) || String(r.week) !== p.laatste) continue;
    const u = Number(r.uren);
    p.nu += u;
    p.loon += (Number(r.uurloon) || 0) * u;
    p.tar += (Number(r.tarief) || 0) * u;
    p.fac += (Number(r.factor) || 0) * u;
  }

  const bijgewerkt: Record<string, unknown>[] = [];
  const onbekend: Record<string, unknown>[] = [];
  for (const p of personen.values()) {
    const pl = zoekPlaatsing(plaatsingen ?? [], p);
    if (!pl) {
      onbekend.push({ regnr: p.regnr, naam: p.naam, roepnaam: p.roepnaam, functie: p.functie,
        klant: p.klant, uren: rond(p.uren), marge: rond(p.marge), laatste_week: p.laatste });
      continue;
    }
    const velden: Record<string, unknown> = { gewerkte_uren: rond(p.uren), marge_werkelijk: rond(p.marge) };
    if (!pl.regnr && p.regnr) velden.regnr = p.regnr;   // eenmalig vastzetten, daarna nooit meer zoeken
    // De factuur is leidend (afspraak Tjeerd, 10 aug 2026): uurloon, inkoop- en
    // klantfactor overschrijven wat er met de hand is ingevuld. Anders rekent de
    // app vooruit met 1,8 terwijl Pronkert 1,776 factureert - dan staat elke
    // voorspelde marge en overname-waarde net verkeerd.
    if (p.nu) {
      const loon = p.loon / p.nu, tar = p.tar / p.nu, fac = p.fac / p.nu;
      if (loon) velden.uurloon = rond(loon);
      if (fac) velden.inkoop_factor = Math.round(fac * 1e4) / 1e4;
      if (loon && tar) velden.klantfactor = Math.round((tar / loon) * 1e4) / 1e4;
    }
    // PostgREST weigert de hele update zodra er een kolom in staat die de tabel
    // niet kent (bv. `regnr` als de migratie nog niet gedraaid is). Dan liever
    // de kern wegschrijven met melding dan alles laten vallen.
    let { error } = await service.from("fin_flex_plaatsingen").update(velden).eq("id", pl.id);
    let beperkt = false;
    if (error) {
      beperkt = true;
      await service.from("fin_flex_plaatsingen")
        .update({ gewerkte_uren: rond(p.uren), marge_werkelijk: rond(p.marge) }).eq("id", pl.id);
    }
    bijgewerkt.push({ id: pl.id, kandidaat: pl.kandidaat, uren: rond(p.uren), marge: rond(p.marge),
      uurloon: velden.uurloon ?? null, inkoop_factor: velden.inkoop_factor ?? null,
      klantfactor: velden.klantfactor ?? null,
      ...(beperkt ? { let_op: "alleen uren en marge bijgewerkt - kolom onbekend, migratie gedraaid?" } : {}) });
  }
  return { krachten: bijgewerkt, onbekend };
}
