// ═══════════════════════════════════════════════════════════════
// LEAD-RADAR — dagelijkse zoektocht naar bedrijven die nu
// blue-collar personeel werven (potentiële klanten voor Ploeggenoten).
//
// Bron: Adzuna API (gratis, dekt NL, aggregeert o.a. bedrijfssites en
// grote vacaturebanken). Secrets: ADZUNA_APP_ID + ADZUNA_APP_KEY
// (registreren op developer.adzuna.com — zie SETUP-LEADRADAR.md).
//
// Werking: zoekt per doelquery de nieuwste vacatures (max 7 dgn oud),
// groepeert op bedrijf, filtert uitzenders/concullega's en bestaande
// klanten eruit, en upsert het resultaat in crm_leadradar.
// Aanroepen: door pg_cron met header x-cron-key = CRON_SECRET, of
// handmatig door een ingelogde teamgebruiker (Authorization: Bearer).
// ═══════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const QUERIES = [
  "productiemedewerker", "operator productie", "procesoperator",
  "heftruckchauffeur", "orderpicker", "magazijnmedewerker",
  "teamleider productie", "teamleider logistiek", "verlader",
  "machinebediende", "inpakmedewerker", "logistiek medewerker",
  // Uitgebreid 11 aug 2026: dit zijn dezelfde functies onder een andere naam.
  // Ze kostten niets extra's zolang we binnen de call-limiet blijven, en ze
  // vangen vacatures die de twaalf hierboven lieten liggen.
  "expeditiemedewerker", "assemblagemedewerker", "productiemedewerker voedsel",
  "vorkheftruckchauffeur", "voorman productie", "medewerker magazijn"
];

// ─── Werkgebied ──────────────────────────────────────────────────
// Tot 11 aug 2026 zocht deze functie heel Nederland af. Daardoor stroomde de
// radar vol met bedrijven in Zierikzee, Warmenhuizen en Ravenstein — buiten
// het werkgebied, dus geen belwerk. Adzuna kan zelf op straal filteren, en dat
// kost geen extra aanroepen: het scheelt alleen maar ruis.
// De 40 km is dezelfde harde grens die de ochtendroutine aanhoudt (7 aug 2026).
const WERKGEBIED = "Alphen aan den Rijn";
// Oplopende stralen. 40 km blijft het werkgebied — daar wonen de kandidaten en
// daar hoort het belwerk. Maar een dag met nauwelijks vondsten is een lege
// belijst, en dan is een bedrijf op 70 km alsnog beter dan niets. Hij verruimt
// dus alleen als het dagdoel niet gehaald wordt, en stopt zodra dat wel zo is.
// (Tjeerd, 11 aug 2026 — verzacht daarmee de harde 40 km-grens van 7 aug.)
// 12 aug 2026 (Tjeerd): "doe maar 60 km range". 40 km was te krap om er 30
// bruikbare leads per dag uit te halen; 60 km haalt het hele Rotterdamse
// havengebied binnen (Botlek 35, Europoort 38, Maasvlakte 46) plus Moerdijk,
// Utrecht-oost en zuidelijk Noord-Holland. 100 km blijft de noodstraal voor
// een dag die anders leeg blijft.
const STRALEN = [60, 100];
const STRAAL_KM = STRALEN[0];        // het werkgebied zelf, voor de meldingen
const DOEL_PER_RUN = 30;             // leads per run: nieuw + opnieuw wervend

// Buiten het werkgebied zoeken kost per straal opnieuw aanroepen. Achttien
// termen × drie stralen past niet binnen de gratis tier, dus verder weg zoekt
// hij alleen met de termen die het meeste opleveren.
const KERN_QUERIES = [
  "productiemedewerker", "magazijnmedewerker", "orderpicker",
  "heftruckchauffeur", "logistiek medewerker", "operator productie"
];

// ─── Aanroepbudget ───────────────────────────────────────────────
// De gratis Adzuna-tier is krap en de bronnen spreken elkaar tegen (250 per
// dag volgens hun documentatie, circa 1.000 per maand volgens hun eigen
// developerpagina). We rekenen op de strengste van de twee: 1.000 per maand is
// ~33 per dag. 18 termen op 40 km kost 18 aanroepen; verruimen kost er per
// straal 6 bij (de KERN-termen). Een dag die tot 100 km moet doorzoeken komt zo
// op 30. Haalt hij het doel binnen 40 km, dan stopt hij bij 18 en blijft er
// ruimte over voor de keren dat iemand in Sales op "Nu zoeken" drukt — die
// aanroepen tellen namelijk mee.
const MAX_CALLS = 30;
const PER_PAGE = 50;
const MAX_PAGINAS = 3;

// Uitzenders / detacheerders / platformen — geen leads, dat zijn wij zelf of
// concurrenten. Twee lagen: (1) een concrete namenlijst, (2) een
// patroon-filter AGENCY_RE dat het gros van de bureaunamen wegvangt.
const UITSLUITEN = [
  // grote uitzend-/detacheerorganisaties NL
  "randstad", "adecco", "manpower", "olympia", "youngcapital", "young capital",
  "tempo-team", "tempo team", "sd worx", "asa talent", "asa ", "timing", "unique",
  "start people", "startpeople", "otto work", "otto workforce", "covebo", "eu-flex", "euflex",
  "abiant", "luba", "actief werkt", "in person", "inperson", "jobmatch",
  "tigris", "driessen", "continu", "maandag", "yacht", "brunel", "hays", "gi group",
  "gigroup", "trigion", "dactylo", "e&a", "flexcraft", "teamflex", "flexforce",
  "workx", "workflex", "adver-online", "adver online", "jobbird", "jobrepublic",
  "undutchables", "projob", "proned", "olympia uitzend", "vhb", "werktalent",
  "werk talent", "flexteam", "flexpedia", "personato", "peak", "peakz", "endeavour",
  "salarisdienst", "carrière", "carriere uitzend", "dpa", "nl flex", "nlflex",
  "flexforce", "match", "matchd", "flexibility", "please", "please payroll",
  "vialumina", "vialuminis", "goflex", "go flex", "seasons", "sync ",
  // platforms / vacaturebanken
  "werkzoeken", "indeed", "monsterboard", "nationale vacaturebank", "jooble",
  "joblift", "vacaturevoordeel", "nvb banen", "werk.nl", "linkedin", "glassdoor",
  // bureaus met merknaam zonder bureau-woord (herkend uit eerdere runs)
  "logistic force", "pdz", "processionals", "profield", "attract", "jigler",
  "talect", "digiplein", "sectorinstituut", "raaak", "wr.nl",
  // 12 aug 2026: deze kwamen er in de run van 11 aug alsnog doorheen omdat
  // hun naam geen enkel bureau-woord bevat. Los per stuk toegevoegd.
  "michael page", "page personnel", "robert half", "robert walters",
  "innova search", "search & selection", "search en selection",
  "jobforce", "job force", "leukebaan", "leuke baan", "switchup", "switch up",
  "mvp solutions", "verbindt", "omwerven", "joof", "nivo werkt", "nivowerkt",
  "employable", "vacat.nl", "techniekwerkt", "techniek werkt", "simplyhired",
  "bebee", "glassdoor", "adzuna", "prestatie", "wanted uitzend",
  // onszelf / directe concurrent
  "ploeggenoten", "pronkert"
];

// Naampatronen die vrijwel altijd op een bureau/bemiddelaar wijzen.
// Fragmenten (geen woordgrens) omdat NL-bureaunamen vaak samengesteld zijn
// (Perflexxion, Dujob, Apluspersoneel, NLwerkt, …).
// 12 aug 2026 uitgebreid: 'job\b' liet Jobforce door (geen woordgrens na job),
// en search/selection/baan/banen/headhunt ontbraken helemaal. Let op dat
// 'talent' hier NIET los mag staan: Watertalent en Luchttalent zijn juist
// bronnen, geen bureaus - die vangen we af voordat isBureau draait.
const AGENCY_RE = /(uitzend|detach|payroll|flex|werving|recruit|staffing|resourc|bemiddel|interim|secondment|inhuur|\bzzp\b|personeel|professional|\btalent|banenpagina|vacature|jobboard|jobbird|job\b|jobs|jobf|solliciteren|werkgeversdienst|employment agency|human\s?resources?|hr[-\s]?services|payrolling|contracting|planit|werkt\b|matchmak|\bprocess\s?jobs|\bhr\b|search\s*(&|en)\s*selecti|\bselectie\b|headhunt|\bbanen\b|\bbaan\b|executive\s?search|consultanc)/i;

const isBureau = (naam: string) => {
  const n = naam.toLowerCase();
  return UITSLUITEN.some((u) => n.includes(u)) || AGENCY_RE.test(n);
};

// Een eindbedrijf werft voor z'n eigen vestiging; een bureau strooit over veel
// steden. 3+ verschillende plaatsen is een sterk bureau-signaal.
const telPlaatsen = (s: string) =>
  new Set(String(s || "").split(/[,;]/).map((p) => p.trim().toLowerCase()).filter(Boolean)).size;

const norm = (s: string) => s.toLowerCase().replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?)\b/g, "").replace(/[^a-z0-9]/g, "").trim();

// ─── CORS ────────────────────────────────────────────────────────
// Zonder deze headers kan het CRM deze functie niet aanroepen. Een
// cross-origin POST mét Authorization-header laat de browser voorafgaan door
// een OPTIONS-preflight, en die liep hier dood op een functie die alleen POST
// kende. De fetch faalde dan met "Failed to fetch", en Sales toont bij precies
// die fout "de zoekfunctie is nog niet gedeployed" — een misleidende melding,
// want hij stond er wél. De nachtelijke cron merkte er niets van: die praat
// server-naar-server en kent geen preflight.
// (Tjeerd, 11 aug 2026: "Nu zoeken" gaf dit terwijl de deploy geslaagd was.)
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const antwoord = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json" }
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const cronKey = req.headers.get("x-cron-key");
  const auth = req.headers.get("Authorization") ?? "";
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Toegang: cron-sleutel óf ingelogde teamgebruiker
  if (cronKey !== Deno.env.get("CRON_SECRET")) {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return antwoord({ error: "geen toegang" }, 403);
  }

  // ── Extra modi voor de Claude-ochtendroutine ────────────────
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* leeg is prima */ }

  // Modus 'lijst': huidige radar teruggeven (voor de ochtendbriefing).
  // De limiet stond op 120. Bij 30 leads per dag is de radar binnen een week
  // groter dan dat, en dan ontdubbelt de ochtendroutine tegen een halve lijst
  // en doet ze onderzoek over dat al gedaan is. (12 aug 2026)
  if (body.lijst) {
    const { data } = await service.from("crm_leadradar").select("*")
      .neq("status", "genegeerd").order("laatst_gezien", { ascending: false }).limit(5000);
    return antwoord({ ok: true, rijen: data ?? [] });
  }

  // Modus 'namen': alles waar de ochtendroutine tegen moet ontdubbelen, in één
  // lichte respons. Niet alleen de radar: ook bestaande klanten en de
  // contactpersonen-bedrijven, zodat er nooit een belscript wordt geschreven
  // voor een relatie die Tjeerd al heeft. (12 aug 2026, op zijn verzoek)
  if (body.namen) {
    const [radar, klanten, contacten, kansen] = await Promise.all([
      service.from("crm_leadradar").select("bedrijf,status,plaats,vacatures,functies").limit(5000),
      service.from("clients").select("naam").limit(5000),
      service.from("crm_contacten").select("klant").limit(5000),
      service.from("crm_kansen").select("klant").limit(5000),
    ]);
    const uniek = (xs: unknown[]) =>
      [...new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))];
    return antwoord({
      ok: true,
      radar: radar.data ?? [],
      klanten: uniek((klanten.data ?? []).map((r: Record<string, unknown>) => r.naam)),
      relaties: uniek([
        ...(contacten.data ?? []).map((r: Record<string, unknown>) => r.klant),
        ...(kansen.data ?? []).map((r: Record<string, unknown>) => r.klant),
      ]),
    });
  }

  // Modus 'import': onderzoeksvondsten en/of conceptteksten opslaan.
  // rows: [{bedrijf, plaats?, functies?, vacatures?, url?, bron?, notitie?, concepten?}]
  if (Array.isArray(body.import)) {
    const vandaag = new Date().toISOString().slice(0, 10);
    let nieuw = 0, bijgewerkt = 0;
    const alerts: string[] = [];
    for (const r of body.import as Record<string, unknown>[]) {
      const naam = String(r.bedrijf ?? "").trim();
      if (!naam) continue;
      const { data: bestaand } = await service.from("crm_leadradar")
        .select("id,status,vacatures,functies").ilike("bedrijf", naam).limit(1);
      const velden: Record<string, unknown> = { laatst_gezien: vandaag };
      for (const k of ["plaats", "functies", "url", "salaris_ind", "notitie", "concepten"])
        if (r[k] != null) velden[k] = r[k];
      if (r.vacatures != null) velden.vacatures = Number(r.vacatures) || 1;
      if (bestaand?.length) {
        if (bestaand[0].status !== "genegeerd") {
          // Nieuwe vacature bij een bedrijf dat we al kennen is een belsignaal:
          // ze wierven al en breiden nu uit. Dat wil Tjeerd zien zonder de hele
          // radar door te lopen, dus het wordt een melding. (12 aug 2026)
          const oudAantal = Number(bestaand[0].vacatures ?? 0);
          const nieuwAantal = Number(velden.vacatures ?? oudAantal);
          const oudeFuncties = new Set(String(bestaand[0].functies ?? "")
            .split(/[,;]/).map((p) => p.trim().toLowerCase()).filter(Boolean));
          const verseFuncties = String(velden.functies ?? "")
            .split(/[,;]/).map((p) => p.trim()).filter(Boolean)
            .filter((f) => !oudeFuncties.has(f.toLowerCase()));
          if (nieuwAantal > oudAantal || verseFuncties.length) {
            const wat = verseFuncties.length
              ? `nieuwe functie${verseFuncties.length > 1 ? "s" : ""}: ${verseFuncties.join(", ")}`
              : `van ${oudAantal} naar ${nieuwAantal} vacatures`;
            await service.from("crm_meldingen").insert({
              id: "md" + Date.now() + Math.floor(Math.random() * 10000),
              voor: "Tjeerd", van: "Leadradar", soort: "systeem",
              tekst: `${naam} werft opnieuw — ${wat}.`,
              entiteit: "lead", ref: String(bestaand[0].id),
            });
            alerts.push(`${naam}: ${wat}`);
          }
          await service.from("crm_leadradar").update(velden).eq("id", bestaand[0].id);
          bijgewerkt++;
        }
      } else {
        await service.from("crm_leadradar").insert({
          id: "lr" + Date.now() + Math.floor(Math.random() * 10000),
          bedrijf: naam, bron: String(r.bron ?? "claude-research"),
          gevonden_op: vandaag, status: "nieuw", ...velden
        });
        nieuw++;
      }
    }
    return antwoord({ ok: true, nieuw, bijgewerkt, alerts });
  }

  // Modus 'opschonen': bestaande bureau-rijen uit de radar filteren.
  // Zet ze op 'genegeerd' (omkeerbaar, verdwijnt uit de Nieuw-lijst) — raakt
  // handmatig toegevoegde rijen niet aan.
  if (body.opschonen) {
    const { data: alle } = await service.from("crm_leadradar")
      .select("id,bedrijf,bron,status,plaats").neq("status", "genegeerd");
    let weg = 0;
    for (const r of alle ?? []) {
      if (r.bron === "handmatig") continue;
      if (isBureau(String(r.bedrijf ?? "")) || telPlaatsen(String(r.plaats ?? "")) >= 3) {
        await service.from("crm_leadradar")
          .update({ status: "genegeerd", status_door: "filter-bureau" }).eq("id", r.id);
        weg++;
      }
    }
    return antwoord({ ok: true, opgeschoond: weg });
  }

  // Modus 'osm': échte productie/logistiek-bedrijven uit OpenStreetMap (gratis,
  // geen sleutel). Geen wervingssignaal, wel gegarandeerd EINDBEDRIJVEN: fabrieken,
  // magazijnen en distributiecentra. Regio = ISO3166-2 (NL-ZH, NL-NH, NL-UT, NL-NB …).
  if (body.osm) {
    const regio = String(body.regio ?? "Zuid-Holland");
    const max = Math.min(Number(body.max ?? 60), 150);
    // Bounding box per provincie (zuid,west,noord,oost). Veel sneller dan
    // filteren op de provincie-polygoon (die time-out't onder Overpass-drukte).
    const BBOX: Record<string, string> = {
      "Zuid-Holland": "51.65,3.85,52.35,4.95",
      "Noord-Holland": "52.15,4.45,53.20,5.35",
      "Utrecht": "51.95,4.85,52.30,5.55",
      "Noord-Brabant": "51.30,4.15,51.85,6.05",
      "Gelderland": "51.75,5.05,52.45,6.85",
      "Flevoland": "52.25,5.20,52.80,6.05",
      "Overijssel": "52.15,5.85,52.75,7.10",
      "Limburg": "50.75,5.55,51.60,6.25",
    };
    const bbox = BBOX[regio] ?? BBOX["Zuid-Holland"];
    const ql = `[out:json][timeout:40][bbox:${bbox}];
(
  nwr["man_made"="works"]["name"];
  nwr["office"="logistics"]["name"];
  nwr["building"="warehouse"]["name"]["website"];
);
out center tags 600;`;
    // Overpass weigert anonieme/Deno-requests (406) — dus een nette User-Agent.
    // Twee servers: valt de eerste uit (drukte → 504), dan de reserve.
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];
    const osmHeaders = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Ploeggenoten-CRM-Leadradar/1.0 (+https://ploeggenoten.github.io/crm/)",
      "Accept": "application/json",
    };
    let elements: Record<string, unknown>[] = [];
    let gelukt = false, laatst = 0;
    for (const ep of endpoints) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60000);   // max 60s per server
        const r = await fetch(ep, { method: "POST", headers: osmHeaders, body: "data=" + encodeURIComponent(ql), signal: ctrl.signal });
        clearTimeout(timer);
        laatst = r.status;
        if (r.ok) { const j = await r.json(); elements = (j.elements ?? []) as Record<string, unknown>[]; gelukt = true; break; }
      } catch (_e) { /* time-out of fout → volgende server proberen */ }
    }
    if (!gelukt) return antwoord({ error: "overpass onbereikbaar", status: laatst }, 502);

    // Dedup tegen bestaande klanten én bestaande radar-rijen.
    const { data: clients2 } = await service.from("clients").select("naam");
    const bekend2 = new Set((clients2 ?? []).map((c) => norm(c.naam)));
    const { data: radarNu } = await service.from("crm_leadradar").select("bedrijf");
    for (const rr of radarNu ?? []) bekend2.add(norm(String(rr.bedrijf ?? "")));

    // Namen die een terrein/gebied beschrijven i.p.v. een bedrijf.
    // Terrein-/gebiedsnamen én generieke gebouwen (historische loodsen, gemalen,
    // trafo's, musea) i.p.v. echte bedrijven.
    const gebiedRe = /industrieterrein|bedrijventerrein|bedrijvenpark|industriepark|industriegebied|\bhaven\b|\bterrein\b|\bzone\b|logistiek park|business park|\bloods\b|pakhuis|\bmagazijn\b|schuur|kruit|visafslag|remise|\bsilo\b|opslag|^dc ?\d|gemaal|rioolwater|waterzuiver|\btrafo\b|substation|umformer|\bmolen\b|museum|\bkerk\b/i;
    const vandaag2 = new Date().toISOString().slice(0, 10);
    const stempel = Date.now();
    const gezien = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    let overgeslagen = 0;
    for (const el of elements) {
      if (rows.length >= max) break;
      const t = (el.tags ?? {}) as Record<string, string>;
      const naam = String(t.name ?? "").trim();
      if (!naam || naam.length < 3) { overgeslagen++; continue; }
      const nn = norm(naam);
      if (!nn || gezien.has(nn) || bekend2.has(nn)) { overgeslagen++; continue; }
      if (isBureau(naam) || gebiedRe.test(naam)) { overgeslagen++; continue; }
      gezien.add(nn);
      const magazijn = t.building === "warehouse" || t.office === "logistics";
      rows.push({
        id: "lr" + stempel + "-" + rows.length,
        bedrijf: naam, plaats: String(t["addr:city"] ?? t["addr:place"] ?? t["addr:suburb"] ?? ""),
        functies: magazijn ? "Magazijn / distributie" : "Productie / fabriek",
        vacatures: 0, bron: "osm", url: String(t.website ?? t["contact:website"] ?? ""),
        gevonden_op: vandaag2, laatst_gezien: vandaag2, status: "nieuw",
      });
    }
    // Eén bulk-insert (veel lichter dan tientallen losse). Valt die door één
    // dubbele naam om, dan proberen we de rijen alsnog een voor een.
    let nieuw = 0;
    if (rows.length) {
      const { error } = await service.from("crm_leadradar").insert(rows);
      if (!error) { nieuw = rows.length; }
      else {
        for (const row of rows) { const { error: e2 } = await service.from("crm_leadradar").insert(row); if (!e2) nieuw++; }
      }
    }
    return antwoord({ ok: true, regio, gescand: elements.length, nieuw, overgeslagen });
  }

  const APP_ID = Deno.env.get("ADZUNA_APP_ID"), APP_KEY = Deno.env.get("ADZUNA_APP_KEY");
  if (!APP_ID || !APP_KEY)
    return antwoord({ error: "secrets ADZUNA_APP_ID/ADZUNA_APP_KEY ontbreken" }, 500);

  // Bestaande klanten/relaties uitsluiten
  const { data: clients } = await service.from("clients").select("naam");
  const bekend = new Set((clients ?? []).map((c) => norm(c.naam)));

  type Vondst = { plaatsen: Set<string>; functies: Set<string>; n: number; url: string; sal: string; straal: number };
  const bedrijven = new Map<string, Vondst & { naam: string }>();

  // Bestaande radar-rijen vooraf ophalen: nodig om tijdens het zoeken al te
  // kunnen tellen hoeveel leads deze run oplevert, zonder per bedrijf de
  // database te bevragen.
  const { data: bestaandeRijen } = await service.from("crm_leadradar")
    .select("id,bedrijf,status").limit(5000);
  // Sleutel op kleine letters: dat is precies wat de ilike hiervoor deed, en
  // wat de unieke index crm_leadradar_bedrijf op lower(bedrijf) afdwingt.
  const perNaam = new Map<string, { id: string; status: string }>();
  for (const r of bestaandeRijen ?? [])
    perNaam.set(String(r.bedrijf ?? "").toLowerCase().trim(),
                { id: String(r.id), status: String(r.status ?? "") });

  // Hoeveel leads levert wat we tot nu toe hebben? Tjeerd (11 aug 2026) rekent
  // "alles wat vandaag werft" mee: een nieuw bedrijf én een bedrijf dat al in de
  // radar staat maar nu opnieuw vacatures heeft. Genegeerde bedrijven tellen
  // niet mee — die heeft hij bewust weggezet.
  const telLeads = () => {
    let n = 0;
    for (const [, b] of bedrijven) {
      if (b.plaatsen.size >= 3) continue;
      const best = perNaam.get(b.naam.toLowerCase().trim());
      if (best && best.status === "genegeerd") continue;
      n++;
    }
    return n;
  };

  // Doorbladeren tot de vangst opdroogt. Eén pagina van 50 was voor brede
  // termen als "magazijnmedewerker" te weinig: alles voorbij de vijftigste
  // vacature zag de radar simpelweg nooit. Een volgende pagina halen we alleen
  // op als de vorige helemaal vol zat — een halfvolle pagina is de laatste.
  // Tijdslimiet naast de call-limiet. Een trage Adzuna kan de functie anders
  // over zijn maximale looptijd trekken, en dan krijgt het CRM nooit antwoord:
  // de knop blijft draaien en er verschijnt geen melding. Liever een halve
  // oogst mét antwoord dan een volle die nooit aankomt — wat we tot hier
  // verzameld hebben, wordt gewoon weggeschreven.
  const START = Date.now();
  const MAX_MS = 45_000;
  let calls = 0, budgetOp = false, tijdOp = false;

  // Eén pagina ophalen en verwerken. Geeft terug hoeveel vacatures erop stonden
  // (-1 bij een fout), zodat de aanroeper weet of er een volgende pagina is.
  const haalPagina = async (q: string, pagina: number, straal: number): Promise<number> => {
    const url = `https://api.adzuna.com/v1/api/jobs/nl/search/${pagina}?app_id=${APP_ID}&app_key=${APP_KEY}` +
      `&results_per_page=${PER_PAGE}&what=${encodeURIComponent(q)}` +
      `&where=${encodeURIComponent(WERKGEBIED)}&distance=${straal}` +
      `&max_days_old=7&sort_by=date&content-type=application/json`;
    try {
      calls++;
      const r = await fetch(url);
      if (!r.ok) return -1;
      const d = await r.json();
      const treffers = d.results ?? [];
      for (const job of treffers) {
        const naam = (job.company?.display_name ?? "").trim();
        if (!naam) continue;
        const nn = norm(naam);
        if (!nn || bekend.has(nn)) continue;
        if (isBureau(naam)) continue;
        const b = bedrijven.get(nn) ?? { naam, plaatsen: new Set(), functies: new Set(), n: 0, url: "", sal: "", straal };
        b.n++;
        b.functies.add(q);
        const plaats = job.location?.area?.slice(-1)[0] ?? job.location?.display_name ?? "";
        if (plaats) b.plaatsen.add(plaats);
        if (!b.url) b.url = job.redirect_url ?? "";
        if (!b.sal && job.salary_min) b.sal = `€${Math.round(job.salary_min)}–${Math.round(job.salary_max ?? job.salary_min)}`;
        bedrijven.set(nn, b);
      }
      return treffers.length;
    } catch (e) { console.error("adzuna", q, pagina, straal, e); return -1; }
  };

  // BREEDTE VÓÓR DIEPTE, en LOKAAL VÓÓR VER.
  //
  // Breedte: eerst van élke zoekterm pagina 1, pas daarna tweede pagina's van de
  // termen die helemaal vol zaten. De versie daarvóór werkte term voor term
  // helemaal af, en dan was het budget op na ongeveer tien van de achttien
  // termen — de laatste acht kwamen elke run opnieuw niet aan bod.
  //
  // Ver: de radar begint binnen 40 km, want daar wonen de kandidaten. Levert dat
  // te weinig op, dan verruimt hij naar 60 en zo nodig 100 km, en hij stopt
  // zodra het dagdoel gehaald is. Tjeerd (11 aug 2026): "als er 0 binnenkomt,
  // wil ik dat die verder kijkt dan de radius — minimaal 30 leads per dag."
  // Buiten de eerste straal zoekt hij alleen met de KERN-termen: achttien termen
  // per straal past niet binnen het gratis Adzuna-budget, en de brede termen
  // leveren verreweg de meeste bedrijven op.
  const doelGehaald = () => telLeads() >= DOEL_PER_RUN;
  let bereikteStraal = STRALEN[0];
  for (const straal of STRALEN) {
    if (doelGehaald() || budgetOp || tijdOp) break;
    bereikteStraal = straal;
    const termen = straal === STRALEN[0] ? QUERIES : KERN_QUERIES;
    let actief = termen.map((q) => ({ q, pagina: 1 }));
    for (let ronde = 1; ronde <= MAX_PAGINAS && actief.length; ronde++) {
      const volgende: { q: string; pagina: number }[] = [];
      for (const item of actief) {
        if (Date.now() - START > MAX_MS) { tijdOp = true; break; }
        if (calls >= MAX_CALLS) { budgetOp = true; break; }
        const aantal = await haalPagina(item.q, item.pagina, straal);
        // Precies vol = er is vrijwel zeker een volgende pagina.
        if (aantal === PER_PAGE) volgende.push({ q: item.q, pagina: item.pagina + 1 });
      }
      // Diepte alleen als het doel nog niet gehaald is: een tweede pagina kost
      // evenveel als een hele extra zoekterm.
      if (budgetOp || tijdOp || doelGehaald()) break;
      actief = volgende;
    }
  }

  // ── Wegschrijven ────────────────────────────────────────────────
  // Hiervóór deed deze lus per bedrijf eerst een select en daarna nog een
  // insert of update: twee netwerkrondjes per bedrijf, allemaal netjes op
  // elkaar wachtend. Met twaalf zoekopdrachten van één pagina bleef dat net
  // binnen de tijd. Met achttien zoekopdrachten en meerdere pagina's kwamen er
  // zoveel bedrijven bij dat de functie eruit liep en "Nu zoeken" bleef hangen
  // zonder ooit iets terug te geven. (Tjeerd, 11 aug 2026: "doet er heel lang
  // over en doet niets.")
  // Nu: één select voor álle bestaande rijen, één batch-insert voor de nieuwe,
  // en de updates in blokken tegelijk.
  const vandaag = new Date().toISOString().slice(0, 10);
  const teMaken: Record<string, unknown>[] = [];
  const teWijzigen: { id: string; velden: Record<string, unknown> }[] = [];
  for (const [, b] of bedrijven) {
    // 3+ steden = bureau-signaal: een eindfabriek werft voor de eigen vestiging.
    if (b.plaatsen.size >= 3) continue;
    const velden = {
      laatst_gezien: vandaag, vacatures: b.n,
      functies: [...b.functies].slice(0, 6).join(", "),
      plaats: [...b.plaatsen].slice(0, 3).join(", ")
    };
    const bestaand = perNaam.get(b.naam.toLowerCase().trim());
    if (bestaand) {
      // Genegeerde bedrijven met rust laten.
      if (bestaand.status !== "genegeerd") teWijzigen.push({ id: bestaand.id, velden });
    } else {
      teMaken.push({
        id: "lr" + Date.now() + "-" + teMaken.length,   // teller, geen random:
        bedrijf: b.naam, bron: "adzuna", url: b.url,    // Date.now() is binnen
        salaris_ind: b.sal, gevonden_op: vandaag,       // één batch voor elke
        status: "nieuw",                                // rij hetzelfde
        // Buiten het werkgebied? Dan hoort dat op de kaart te staan, anders bel
        // je een bedrijf waar je kandidaten niet naartoe krijgt zonder dat je
        // het doorhad.
        notitie: b.straal > STRAAL_KM
          ? `Gevonden binnen ${b.straal} km van Alphen aan den Rijn — dus buiten het werkgebied van ${STRAAL_KM} km. `
            + `De radar keek verder omdat er binnen de straal te weinig te halen viel.`
          : "",
        ...velden
      });
    }
  }

  let nieuw = 0, bijgewerkt = 0;
  if (teMaken.length) {
    const { error } = await service.from("crm_leadradar").insert(teMaken);
    if (error) {
      // Eén rotte rij mag de rest niet meeslepen — dan alsnog per stuk.
      for (const rij of teMaken) {
        const { error: e2 } = await service.from("crm_leadradar").insert(rij);
        if (!e2) nieuw++;
      }
    } else nieuw = teMaken.length;
  }
  for (let i = 0; i < teWijzigen.length; i += 20) {
    const blok = teWijzigen.slice(i, i + 20);
    await Promise.all(blok.map((w) =>
      service.from("crm_leadradar").update(w.velden).eq("id", w.id)));
    bijgewerkt += blok.length;
  }

  // calls + budgetOp meegeven: de gratis tier is krap genoeg om te willen zien
  // hoeveel er per run opgaat, en of een run vroegtijdig is afgekapt.
  const leads = nieuw + bijgewerkt;
  return antwoord({
    ok: true, gevonden: bedrijven.size, nieuw, bijgewerkt,
    leads, doel: DOEL_PER_RUN, doel_gehaald: leads >= DOEL_PER_RUN,
    straal_km: bereikteStraal, verruimd: bereikteStraal > STRAAL_KM,
    calls, budget: MAX_CALLS, afgekapt: budgetOp || tijdOp,
    reden: tijdOp ? "tijd" : budgetOp ? "budget" : "",
    duur_ms: Date.now() - START,
    werkgebied: `${WERKGEBIED} +${STRAAL_KM}km`
  });
});
