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
const GEWERKT = ["loon normale uren", "loon overwerkuren"];

const KOP = /Omschrijving\s+Uren\/eenh\.[\s\S]*?ALPHEN AAN DEN RIJN/g;
const VOET = /(Factuurnummer\s+\d+\.\s*Transporteren pagina\s+\d+|Getransporteerd van pagina\s+\d+)\s+-?[\d.]*\d,\d{2}/g;
const BLOK = new RegExp(
  "Factuur (?<fnr>\\d+) (?<pnaam>[^,]+?\\([^)]+\\)), Reg\\.nr\\. (?<reg>\\d+), (?<functie>.+?)(?= Week |$)" +
  "|Week (?<wk>\\d+)-(?<jr>\\d{4}) (?<dat>\\d{2}-\\d{2}-\\d{4}) (?<soort>[^:]+?): (?<uren>-?\\d+:\\d+)," +
  "(?<rest>[\\s\\S]*?) (?<basis>-?[\\d.]*\\d,\\d{2}) 2 (?<bedrag>-?[\\d.]*\\d,\\d{2})",
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
    if (g.fnr) {
      const nm = g.pnaam.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      kop = {
        deelfactuur: g.fnr, regnr: g.reg, functie: (g.functie || "").trim(),
        naam: nm ? nm[1].trim() : g.pnaam.trim(), roepnaam: nm ? nm[2].trim() : "",
      };
      continue;
    }
    if (!kop) continue;                       // regel zonder kop: overslaan, niet gokken
    const soort = (g.soort || "").trim();
    const uit = (p: RegExp) => { const x = g.rest.match(p); return x ? getal(x[1]) : null; };
    const uren = urenVan(g.uren);
    const [d, mm, jj] = g.dat.split("-");
    const uurloon = uit(/uurloon \u20ac ([\d.,]+)/), tarief = uit(/(?:basis)?tarief \u20ac ([\d.,]+)/);
    regels.push({
      factuur, factuurdatum, bron: "pdf", ...kop,
      week: Number(g.wk), jaar: Number(g.jr), weekmaandag: maandagVan(Number(g.jr), Number(g.wk)),
      datum: `${jj}-${mm}-${d}`, soort,
      uren: GEWERKT.includes(soort.toLowerCase()) ? uren : 0, uren_regel: uren,
      uurloon, tarief, factor: uit(/factor ([\d.,]+)/), klant: "",
      // Omzet naar de klant staat niet apart op de factuur maar volgt uit
      // tarief x uren - daarmee is de marge ook als percentage te zien.
      klantbedrag: (tarief != null && uren) ? rond(tarief * uren) : null,
      marge: -getal(g.bedrag),
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

  // -- Stand teruglezen (voor de routine-samenvatting) ----------
  if (body.stand) {
    const { data: weken } = await service.from("fin_flex_weken").select("*").order("week", { ascending: false }).limit(20);
    const { data: krachten } = await service.from("fin_flex_week_kracht").select("*").order("week", { ascending: false }).limit(120);
    const { data: facturen } = await service.from("fin_flex_regels").select("factuur").limit(5000);
    return new Response(
      JSON.stringify({
        ok: true,
        weken: weken ?? [],
        krachten: krachten ?? [],
        facturen: [...new Set((facturen ?? []).map((r) => String(r.factuur)))],
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

  const facturen = [...new Set(regels.map((r) => String(r.factuur ?? "")).filter(Boolean))];
  if (!facturen.length) {
    return new Response(JSON.stringify({ error: "regels zonder factuurnummer" }), { status: 400 });
  }

  // Eerst weg, dan opnieuw: dat maakt een tweede import onschadelijk.
  for (const f of facturen) await service.from("fin_flex_regels").delete().eq("factuur", f);

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

  const weken = await herberekenWeken(service, [...new Set(rijen.map((r) => String(r.week)))]);
  const kracht = await herberekenKrachten(service);

  return new Response(
    JSON.stringify({ ok: true, facturen, regels: rijen.length, weken, ...kracht }),
    { headers: { "Content-Type": "application/json" } },
  );
});

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
  const { data: regels } = await service.from("fin_flex_regels")
    .select("regnr,naam,roepnaam,functie,klant,uren,marge,week,soort,uurloon,tarief,factor");
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
    // 1) op registratienummer - dat verandert nooit
    let pl = (plaatsingen ?? []).find((x) => x.regnr && String(x.regnr) === p.regnr);
    // 2) anders op roepnaam binnen de kandidaatnaam
    if (!pl && p.roepnaam) {
      const roep = woorden(p.roepnaam)[0];
      const kandidaten = (plaatsingen ?? []).filter((x) => woorden(x.kandidaat).includes(roep));
      // Meer dan een Sven? Dan niet gokken, maar laten koppelen.
      if (kandidaten.length === 1) pl = kandidaten[0];
    }
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
