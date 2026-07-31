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
  "machinebediende", "inpakmedewerker", "logistiek medewerker"
];

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
  // onszelf / directe concurrent
  "ploeggenoten", "pronkert"
];

// Naampatronen die vrijwel altijd op een bureau/bemiddelaar wijzen.
// Fragmenten (geen woordgrens) omdat NL-bureaunamen vaak samengesteld zijn
// (Perflexxion, Dujob, Apluspersoneel, NLwerkt, …).
const AGENCY_RE = /(uitzend|detach|payroll|flex|werving|recruit|staffing|resourc|bemiddel|interim|secondment|inhuur|\bzzp\b|personeel|professional|\btalent|banenpagina|vacature|jobboard|jobbird|job\b|jobs|solliciteren|werkgeversdienst|employment agency|human\s?resources?|hr[-\s]?services|payrolling|contracting|planit|werkt\b|matchmak|\bprocess\s?jobs|\bhr\b)/i;

const isBureau = (naam: string) => {
  const n = naam.toLowerCase();
  return UITSLUITEN.some((u) => n.includes(u)) || AGENCY_RE.test(n);
};

// Een eindbedrijf werft voor z'n eigen vestiging; een bureau strooit over veel
// steden. 3+ verschillende plaatsen is een sterk bureau-signaal.
const telPlaatsen = (s: string) =>
  new Set(String(s || "").split(/[,;]/).map((p) => p.trim().toLowerCase()).filter(Boolean)).size;

const norm = (s: string) => s.toLowerCase().replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?)\b/g, "").replace(/[^a-z0-9]/g, "").trim();

Deno.serve(async (req) => {
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
    if (!user) return new Response(JSON.stringify({ error: "geen toegang" }), { status: 403 });
  }

  // ── Extra modi voor de Claude-ochtendroutine ────────────────
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* leeg is prima */ }

  // Modus 'lijst': huidige radar teruggeven (voor de ochtendbriefing).
  if (body.lijst) {
    const { data } = await service.from("crm_leadradar").select("*")
      .neq("status", "genegeerd").order("laatst_gezien", { ascending: false }).limit(120);
    return new Response(JSON.stringify({ ok: true, rijen: data ?? [] }),
      { headers: { "Content-Type": "application/json" } });
  }

  // Modus 'import': onderzoeksvondsten en/of conceptteksten opslaan.
  // rows: [{bedrijf, plaats?, functies?, vacatures?, url?, bron?, notitie?, concepten?}]
  if (Array.isArray(body.import)) {
    const vandaag = new Date().toISOString().slice(0, 10);
    let nieuw = 0, bijgewerkt = 0;
    for (const r of body.import as Record<string, unknown>[]) {
      const naam = String(r.bedrijf ?? "").trim();
      if (!naam) continue;
      const { data: bestaand } = await service.from("crm_leadradar")
        .select("id,status").ilike("bedrijf", naam).limit(1);
      const velden: Record<string, unknown> = { laatst_gezien: vandaag };
      for (const k of ["plaats", "functies", "url", "salaris_ind", "notitie", "concepten"])
        if (r[k] != null) velden[k] = r[k];
      if (r.vacatures != null) velden.vacatures = Number(r.vacatures) || 1;
      if (bestaand?.length) {
        if (bestaand[0].status !== "genegeerd") {
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
    return new Response(JSON.stringify({ ok: true, nieuw, bijgewerkt }),
      { headers: { "Content-Type": "application/json" } });
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
    return new Response(JSON.stringify({ ok: true, opgeschoond: weg }),
      { headers: { "Content-Type": "application/json" } });
  }

  // Modus 'osm': échte productie/logistiek-bedrijven uit OpenStreetMap (gratis,
  // geen sleutel). Geen wervingssignaal, wel gegarandeerd EINDBEDRIJVEN: fabrieken,
  // magazijnen en distributiecentra. Regio = ISO3166-2 (NL-ZH, NL-NH, NL-UT, NL-NB …).
  if (body.osm) {
    const regio = String(body.regio ?? "Zuid-Holland");   // provincienaam (admin_level 4)
    const max = Math.min(Number(body.max ?? 60), 150);
    const ql = `[out:json][timeout:90];
area["name"="${regio}"]["admin_level"="4"]->.a;
(
  nwr["man_made"="works"]["name"](area.a);
  nwr["office"="logistics"]["name"](area.a);
  nwr["building"="warehouse"]["name"]["website"](area.a);
  nwr["building"="industrial"]["name"]["website"](area.a);
  nwr["industrial"]["name"]["operator"](area.a);
);
out center tags 2500;`;
    let elements: Record<string, unknown>[] = [];
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(ql),
      });
      if (!r.ok) return new Response(JSON.stringify({ error: "overpass status " + r.status }), { status: 502 });
      const j = await r.json();
      elements = (j.elements ?? []) as Record<string, unknown>[];
    } catch (e) {
      return new Response(JSON.stringify({ error: "overpass onbereikbaar", detail: String(e) }), { status: 502 });
    }

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
    const gezien = new Set<string>();
    let nieuw = 0, overgeslagen = 0;
    for (const el of elements) {
      if (nieuw >= max) break;
      const t = (el.tags ?? {}) as Record<string, string>;
      const naam = String(t.name ?? "").trim();
      if (!naam || naam.length < 3) { overgeslagen++; continue; }
      const nn = norm(naam);
      if (!nn || gezien.has(nn) || bekend2.has(nn)) { overgeslagen++; continue; }
      if (isBureau(naam) || gebiedRe.test(naam)) { overgeslagen++; continue; }
      gezien.add(nn);
      const magazijn = t.building === "warehouse" || t.office === "logistics";
      const plaats = t["addr:city"] ?? t["addr:place"] ?? t["addr:suburb"] ?? "";
      const website = t.website ?? t["contact:website"] ?? "";
      const { error } = await service.from("crm_leadradar").insert({
        id: "lr" + Date.now() + Math.floor(Math.random() * 10000),
        bedrijf: naam, plaats: String(plaats),
        functies: magazijn ? "Magazijn / distributie" : "Productie / fabriek",
        vacatures: 0, bron: "osm", url: String(website),
        gevonden_op: vandaag2, laatst_gezien: vandaag2, status: "nieuw",
      });
      if (!error) nieuw++; else overgeslagen++;
    }
    return new Response(JSON.stringify({ ok: true, regio, gescand: elements.length, nieuw, overgeslagen }),
      { headers: { "Content-Type": "application/json" } });
  }

  const APP_ID = Deno.env.get("ADZUNA_APP_ID"), APP_KEY = Deno.env.get("ADZUNA_APP_KEY");
  if (!APP_ID || !APP_KEY)
    return new Response(JSON.stringify({ error: "secrets ADZUNA_APP_ID/ADZUNA_APP_KEY ontbreken" }), { status: 500 });

  // Bestaande klanten/relaties uitsluiten
  const { data: clients } = await service.from("clients").select("naam");
  const bekend = new Set((clients ?? []).map((c) => norm(c.naam)));

  type Vondst = { plaatsen: Set<string>; functies: Set<string>; n: number; url: string; sal: string };
  const bedrijven = new Map<string, Vondst & { naam: string }>();

  for (const q of QUERIES) {
    const url = `https://api.adzuna.com/v1/api/jobs/nl/search/1?app_id=${APP_ID}&app_key=${APP_KEY}` +
      `&results_per_page=50&what=${encodeURIComponent(q)}&max_days_old=7&sort_by=date&content-type=application/json`;
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const d = await r.json();
      for (const job of d.results ?? []) {
        const naam = (job.company?.display_name ?? "").trim();
        if (!naam) continue;
        const nn = norm(naam);
        if (!nn || bekend.has(nn)) continue;
        if (isBureau(naam)) continue;
        const b = bedrijven.get(nn) ?? { naam, plaatsen: new Set(), functies: new Set(), n: 0, url: "", sal: "" };
        b.n++;
        b.functies.add(q);
        const plaats = job.location?.area?.slice(-1)[0] ?? job.location?.display_name ?? "";
        if (plaats) b.plaatsen.add(plaats);
        if (!b.url) b.url = job.redirect_url ?? "";
        if (!b.sal && job.salary_min) b.sal = `€${Math.round(job.salary_min)}–${Math.round(job.salary_max ?? job.salary_min)}`;
        bedrijven.set(nn, b);
      }
    } catch (e) { console.error("adzuna", q, e); }
  }

  const vandaag = new Date().toISOString().slice(0, 10);
  let nieuw = 0, bijgewerkt = 0;
  for (const [nn, b] of bedrijven) {
    // 3+ steden = bureau-signaal: een eindfabriek werft voor de eigen vestiging.
    if (b.plaatsen.size >= 3) continue;
    const { data: bestaand } = await service.from("crm_leadradar").select("id,status,vacatures").ilike("bedrijf", b.naam).limit(1);
    if (bestaand?.length) {
      // Genegeerde bedrijven met rust laten; anders 'laatst gezien' + telling verversen
      if (bestaand[0].status !== "genegeerd") {
        await service.from("crm_leadradar").update({
          laatst_gezien: vandaag, vacatures: b.n,
          functies: [...b.functies].slice(0, 6).join(", "),
          plaats: [...b.plaatsen].slice(0, 3).join(", ")
        }).eq("id", bestaand[0].id);
        bijgewerkt++;
      }
    } else {
      await service.from("crm_leadradar").insert({
        id: "lr" + Date.now() + Math.floor(Math.random() * 10000),
        bedrijf: b.naam, plaats: [...b.plaatsen].slice(0, 3).join(", "),
        functies: [...b.functies].slice(0, 6).join(", "), vacatures: b.n,
        bron: "adzuna", url: b.url, salaris_ind: b.sal,
        gevonden_op: vandaag, laatst_gezien: vandaag, status: "nieuw"
      });
      nieuw++;
    }
  }

  return new Response(JSON.stringify({ ok: true, gevonden: bedrijven.size, nieuw, bijgewerkt }),
    { headers: { "Content-Type": "application/json" } });
});
