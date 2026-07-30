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

// Uitzenders / bureaus / platformen — geen leads, dat zijn wij zelf of concurrenten.
const UITSLUITEN = [
  "uitzend", "recruitment", "werving", "detacher", "flexwerk", "payroll",
  "randstad", "adecco", "manpower", "olympia", "youngcapital", "young capital",
  "tempo-team", "tempo team", "sd worx", "asa talent", "timing", "unique",
  "start people", "startpeople", "otto work", "covebo", "eu-flex", "euflex",
  "abiant", "luba", "actief werkt", "in person", "inperson", "jobmatch",
  "werkzoeken", "indeed", "monsterboard", "nationale vacaturebank", "jooble",
  "ploeggenoten", "pronkert"
];

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
        if (UITSLUITEN.some((u) => naam.toLowerCase().includes(u))) continue;
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
