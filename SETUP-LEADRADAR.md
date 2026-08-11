# Leadradar activeren — bedrijven vinden die nú werven

De Leadradar zoekt elke ochtend automatisch naar bedrijven in productie,
logistiek en industrie die op dit moment zelf personeel werven (operators,
productiemedewerkers, heftruckchauffeurs, teamleiders, orderpickers,
verladers, …). Die bedrijven verschijnen in Sales als beoordeelbare leads:
één klik en ze staan als Lead in je pijplijn.

## Wat is de bron — en waarom niet "gewoon Indeed/LinkedIn"?

Indeed en LinkedIn hebben geen open koppeling: hun API's zijn gesloten voor
dit soort gebruik en geautomatiseerd uitlezen verbieden ze. Wat wél netjes en
betrouwbaar kan:

1. **Adzuna** (vacature-aggregator met gratis API, dekt heel NL en indexeert
   veel van wat óók op Indeed en bedrijfssites staat) → dagelijkse automatische
   zoekopdracht per functiegroep. Dit is de motor.
2. **Claude-research-routine** (wekelijks, optioneel): een geplande agent die
   openbaar web afzoekt — werkenbij-pagina's, nieuwsberichten, openbare
   LinkedIn-posts — en vondsten in dezelfde radar schrijft met bron
   "claude-research". Zet je aan zodra je hem wilt; vraag Claude ernaar.

Uitzendbureaus, detacheerders en jullie eigen relaties worden automatisch
weggefilterd (de radar kent de clients-tabel).

**Werkgebied**: sinds 11 augustus 2026 zoekt de radar alleen binnen 40 km
hemelsbreed van Alphen aan den Rijn — dezelfde harde grens die de
ochtendroutine aanhoudt. Daarvóór werd heel Nederland afgezocht en liepen er
bedrijven binnen uit Zierikzee, Warmenhuizen en Ravenstein, waar je toch nooit
naartoe belt. Verhuist het werkgebied, pas dan `WERKGEBIED` en `STRAAL_KM`
bovenin `supabase/functions/lead-radar/index.ts` aan en deploy opnieuw.

## Eenmalige setup (±5 minuten)

1. **Gratis Adzuna-sleutel**: ga naar https://developer.adzuna.com → Register
   → bevestig je mail → onder "API access details" staan je **Application ID**
   en **Application Key**.

   Over het verbruik: Adzuna's documentatie noemt 250 aanroepen per dag, hun
   developerpagina circa 1.000 per maand. Die spreken elkaar tegen, dus de
   functie rekent op de strengste van de twee en stopt bij 24 aanroepen per
   run (~720 per maand bij één run per nacht). Wat er overblijft is voor de
   keren dat iemand in Sales op "Nu zoeken" drukt — die tellen mee. In het
   antwoord van de functie zie je `calls`, `budget` en `afgekapt` staan.
2. **Secrets plakken**: Supabase-dashboard → Edge Functions → Secrets →
   voeg toe: `ADZUNA_APP_ID` en `ADZUNA_APP_KEY` (zelf plakken — Claude typt
   geen sleutels).
3. **Function aanmaken**: Edge Functions → New function → naam `lead-radar` →
   plak de inhoud van `supabase/functions/lead-radar/index.ts` (raw van
   GitHub) → Deploy. (Zelfde werkwijze als meta-sync destijds.)
4. **Dagelijkse cron**: SQL Editor →

```sql
select cron.schedule('lead-radar-ochtend', '15 5 * * *',  -- 07:15 NL-zomertijd
  $$select net.http_post(
      url:='https://gyhrwjdlwamyjhxtdypw.supabase.co/functions/v1/lead-radar',
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-cron-key', '<CRON_SECRET>'),
      body:='{}'::jsonb) $$);
```

   (Vervang `<CRON_SECRET>` door de bestaande CRON_SECRET-waarde die ook de
   marketing-sync gebruikt.)

Daarna vult de radar zichzelf en zie je in Sales → Leadradar elke ochtend de
nieuwe werven-nu-bedrijven, gesorteerd op aantal vacatures.
