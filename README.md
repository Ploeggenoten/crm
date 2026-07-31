# Ploeggenoten CRM

Eén systeem voor sales, recruitment, marketing en cijfers. Draait op dezelfde
Supabase als het pijplijnbord, de finance-app en het marketingbord — de data
staat dus maar op één plek.

**Live:** https://ploeggenoten.github.io/crm/
**Deploy:** `git push origin main` (GitHub Pages)
**Lokaal:** dev-server op poort 8130 · demo zonder inloggen: http://localhost:8130/?demo=1

## Modules

| Module | Waarvoor |
|---|---|
| Dashboard | Wat moet ik vandaag doen; hoe staan we ervoor |
| Sales | Klantpijplijn, activiteiten, taken, documenten, kansen |
| Klanten | Klantkaart: vacatures, kandidaten, evaluaties, contactpersonen |
| Recruitment | Leads-inbox (vóór de pijplijn) + het ATS-bord |
| Kandidaten | Kandidatenkaart: profiel, CV, intake, matches met vacatures |
| Marketing | Meta-prestaties en de keten advertentie → lead → plaatsing |
| Performance | Plaatsingen, duurzaamheid, per recruiter, per bron |
| Finance | **Alleen Tjeerd.** Dagelijkse samenvatting; rekenwerk blijft in de finance-app |

## Privacy: waarom het team geen geld ziet

Twee grenzen, onafhankelijk van elkaar:

1. **Database.** De `fin_*`-tabellen hebben row level security waardoor alleen
   het account van Tjeerd ze kan lezen. Een teamlid dat de code aanpast of de
   API rechtstreeks aanroept, krijgt nul rijen terug.
2. **Interface.** `CRM.canSeeMoney()` staat alleen aan voor de e-mailadressen in
   `ADMIN_EMAILS` (js/core.js). De Finance-module staat op `adminOnly` en
   verschijnt niet eens in de zijbalk; bedragen elders worden vervangen door
   aantallen.

Sinds 31 juli 2026 zijn er **twee** poorten, en het verschil is een bewuste
keuze van Tjeerd: "fee mag zichtbaar zijn voor iedereen, omzet per klant ook
prima. Alleen winst etc en cashflow en allemaal andere cijfers zijn voor
finance bij mij."

- `CRM.magOpbrengstZien()` — de fee per plaatsing en de omzet per klant.
  Iedereen die is ingelogd. Zonder dat cijfer stuurt een accountmanager op
  aantallen in plaats van op opbrengst.
- `CRM.canSeeMoney()` — winst, marge, cashflow, banksaldo, gefactureerde
  omzet en alles uit `fin_*`. Alleen de eigenaar.

Lezen open, schrijven dicht: het team ziet de fee, maar alleen de eigenaar kan
een fee-afspraak wijzigen. Een percentage per klant is een
onderhandelingsresultaat, geen veld dat je even bijwerkt.

## Eerste installatie

1. **Schema draaien.** Open Supabase → SQL Editor, plak `supabase/schema.sql`
   en voer uit. Veilig opnieuw te draaien; bestaande data blijft ongemoeid.
   Dit voegt de `crm_*`-tabellen toe en breidt `candidates`, `clients` en
   `vacatures` uit met een paar kolommen.
2. **Redirect-URL.** Supabase → Authentication → URL Configuration: voeg
   `https://ploeggenoten.github.io/crm/` toe aan de redirect-URL's, zodat de
   "wachtwoord vergeten"-mail hier terugkomt.
3. **Team laten inloggen.** Iedereen gebruikt het eigen bestaande account van het
   pijplijnbord — er is geen aparte registratie.

## Voor ontwikkelaars

Statische app, geen build-stap. `index.html` laadt `js/core.js` (auth, router,
datalaag, UI-helpers), `js/data.js` (fases, berekeningen) en daarna één bestand
per module die zich registreert met `CRM.registerModule()`.

Werkafspraken bij het uitbreiden staan in [BOUWAFSPRAKEN.md](BOUWAFSPRAKEN.md).
Kort: gebruik het design-system in `css/base.css`, verzin geen eigen kleuren,
schrijf alles in het Nederlands, en zet cijfers en datums in Inter met
`class="num"` — nooit in Anton.

`js/demo.js` vult de app met testdata wanneer je lokaal `?demo=1` gebruikt.
Handig om schermen te bekijken zonder in te loggen; het raakt de database nooit
aan. Met `?demo=team` bekijk je de app door de ogen van een teamlid — gebruik
dat om te controleren dat er geen bedragen lekken.
