# Leadradar activeren — alle stappen op een rij

Doel: de Leadradar in *Sales* vult zichzelf elke ochtend met bedrijven die nú
blue-collar personeel werven. Alles gratis (Supabase free tier + Adzuna gratis
tier, ~12 calls per nacht van de 250 gratis).

Volg de 4 stappen hieronder in Supabase. Je hoeft geen code te typen — alleen
kopiëren-plakken. Sleutels typ jíj (ik zet geen sleutels in code).

---

## Stap 1 — Databasetabel ✅ (al gedaan)

Je hebt het schema al met succes gedraaid. De tabel `crm_leadradar` bestaat nu.
(Mocht je twijfelen: opnieuw draaien kan geen kwaad, alles is `if not exists`.)

---

## Stap 2 — Gratis Adzuna-sleutel

1. Ga naar **https://developer.adzuna.com** → **Register** (of Sign up).
2. Bevestig je e-mail.
3. Log in → onder **"API access details"** (of je dashboard) staan twee waarden:
   - **Application ID** (kort, cijfers/letters)
   - **Application Key** (langere sleutel)
4. Laat dit tabblad open, je hebt ze zo nodig.

> Gratis tier = 250 aanroepen per dag. Wij gebruiken er ~12 per nacht.

---

## Stap 3 — De functie deployen + sleutels plakken

### 3a. Function aanmaken
1. Supabase-dashboard → project **gyhrwjdlwamyjhxtdypw** → linkermenu **Edge Functions**.
2. **Create a new function** (of *New function*) → naam exact: **`lead-radar`**.
3. Open in een ander tabblad de functiecode (raw):
   **https://raw.githubusercontent.com/Ploeggenoten/crm/main/supabase/functions/lead-radar/index.ts**
   → selecteer alles (Ctrl/Cmd+A) → kopieer.
4. Plak het in de code-editor van de nieuwe function (verwijder eerst de
   voorbeeldcode die er staat) → **Deploy**.

### 3b. Secrets plakken
Edge Functions → **Secrets** (of *Manage secrets*) → voeg toe:

| Naam | Waarde |
|---|---|
| `ADZUNA_APP_ID` | jouw Application ID uit stap 2 |
| `ADZUNA_APP_KEY` | jouw Application Key uit stap 2 |

`CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`
zijn er waarschijnlijk al (die gebruikt de marketing-sync ook, zelfde project).
Staat `CRON_SECRET` er niet? Voeg hem dan toe met waarde:

```
VERWIJDERD-GEROTEERD-31JUL2026
```

### 3c. Testen (optioneel maar aan te raden)
Open een terminal en draai:

```bash
curl -X POST "https://gyhrwjdlwamyjhxtdypw.supabase.co/functions/v1/lead-radar" \
  -H "x-cron-key: VERWIJDERD-GEROTEERD-31JUL2026" \
  -H "Content-Type: application/json" -d '{}'
```

Goed antwoord ziet er zo uit: `{"ok":true,"gevonden":..,"nieuw":..,"bijgewerkt":..}`.
Daarna staan de eerste bedrijven in *Sales → Leadradar*.

---

## Stap 4 — Dagelijkse cron aanzetten

Supabase → **SQL Editor** → **New query** → plak en **Run**:

```sql
select cron.schedule(
  'lead-radar-ochtend',
  '15 5 * * *',                       -- 07:15 NL-zomertijd
  $$select net.http_post(
      url:='https://gyhrwjdlwamyjhxtdypw.supabase.co/functions/v1/lead-radar',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-key','VERWIJDERD-GEROTEERD-31JUL2026',
        'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aHJ3amRsd2FteWpoeHRkeXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODgwMzUsImV4cCI6MjA5NzM2NDAzNX0.M2huzUfbYtcOqimYIkcuGW-6BCion4HqJVn7TxtkZ9c'),
      body:='{}'::jsonb) $$
);
```

> Waarom die extra `Authorization`-regel: de functie heeft "Verify JWT" aan,
> dus Supabase eist een header. De publieke anon-sleutel volstaat om de
> poortwachter te passeren; de `x-cron-key` doet daarna de echte autorisatie.

Controleren of hij staat: `select * from cron.job;`
Later uitzetten kan met: `select cron.unschedule('lead-radar-ochtend');`

---

## Klaar

Vanaf nu vult de radar zichzelf elke ochtend (Adzuna). De wekelijkse
Claude-ochtendroutine verrijkt die bedrijven daarna met contactprofiel, opener,
LinkedIn-connectieverzoek en concept-mail — klaar voor jouw beoordeling in
*Sales → Leadradar*.

Naast de automatische radar kun je met de **Chrome-extensie** (map `extensie/`,
zie `extensie/LEES-MIJ.md`) zélf leads toevoegen vanaf LinkedIn/Sales Navigator —
zowel sales-leads als kandidaat-leads.
