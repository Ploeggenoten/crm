# Margefacturen van Pronkert automatisch inlezen

Elke vrijdag stuurt Pronkert een margefactuur (`no-reply@pronkert.nl`, onderwerp
"Factuur …"). Daarop staat per flexkracht per dag wat wij aan die uren verdienen.
Dit is de keten die dat zelf in het CRM zet.

```
mail (vrijdag)  →  weekroutine (zaterdag)  →  Edge Function  →  Supabase  →  Finance → Flex
```

Drie onderdelen:

| Waar | Wat |
|---|---|
| `routines/pronkert_marge.py` | Lezer voor de PDF én het Excel-marge-overzicht. Wordt gebruikt voor terugladen van oude weken en om lokaal te controleren. |
| `routines/pronkert.sh` | Praat met de Edge Function. Haalt `CRON_SECRET` uit `~/.claude/ploeggenoten-secrets.env`. |
| `supabase/functions/pronkert-marge/` | Leest de factuur én schrijft weg. De service-sleutel blijft binnen Supabase. |

De weekroutine zelf staat in `~/.claude/scheduled-tasks/weekritueel-pronkert-flex/`.

## Eenmalig instellen

**1. Migratie draaien.** Plak `supabase/migratie-flex-marge.sql` in de SQL-editor
van Supabase en voer uit. Dat maakt `fin_flex_regels` (één rij per factuurregel),
zet `regnr` op `fin_flex_plaatsingen` en maakt de view `fin_flex_week_kracht`.
Veilig opnieuw te draaien.

**2. Edge Function deployen.** Code uit `supabase/functions/pronkert-marge/index.ts`.
Ze gebruikt de secrets die er al staan: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`, `CRON_SECRET`.

> **De functie heet in Supabase `dynamic-worker`.** Die naam verzon het dashboard
> zelf bij "Deploy via editor" en is zo gebleven (10 aug 2026). De map heet wél
> `pronkert-marge`, want dat is wat hij doet. Hernoem de functie niet zonder hem
> opnieuw te deployen én de URL bij te werken in `routines/pronkert.sh` en in
> `margeFunctie()` in `js/finance.js` — anders valt de weekroutine stil met een 404.

Controle daarna:

```sh
bash ~/ploeggenoten-crm/routines/pronkert.sh stand
```

Krijg je `HTTP:200` met een lijst weken, dan staat de keten. `HTTP:404` = nog niet
gedeployed.

**3. Oude weken terugladen** (optioneel, eenmalig). De facturen van week 15 t/m 31
zijn al gelezen en gecontroleerd — 183 regels, 17 weken, € 10.286,09 totaal:

```sh
bash ~/ploeggenoten-crm/routines/pronkert.sh regels <pad>/backfill-flex-wk15-31.json
```

Zo'n bestand maak je opnieuw met:

```sh
cd ~/ploeggenoten-crm/routines
python3 pronkert_marge.py <facturen…> --json > /pad/buiten/de/repo/backfill.json
```

> Zet dat bestand **nooit** in deze map: de repo is openbaar en er staan namen,
> uurlonen en registratienummers in. `.gitignore` vangt `routines/*.json` af, maar
> reken daar niet op.

## Hoe het daarna loopt

De weekroutine draait zaterdagochtend, vraagt de Edge Function welke
factuurnummers al verwerkt zijn, zoekt in Outlook de facturen die daar niet bij
zitten, en stuurt de tekstlaag van elke nieuwe factuur in. Tjeerd krijgt één
melding met het bedrag per week, de uitsplitsing per flexkracht en de nieuwe
run-rate. Er valt niets aan te klikken.

Handmatig kan ook: **Finance → Flex → Margefactuur inlezen**. Open de PDF,
selecteer alles, plak. Je ziet eerst wat eruit komt; opslaan doe je daarna zelf.

## Waarom het niet dubbel kan tellen

Elke factuurregel wordt bewaard in `fin_flex_regels`. Het weekbedrag, de
gewerkte uren en de verdiende marge worden daaruit **afgeleid** — nooit opgeteld
bij een vorige stand. Een factuur opnieuw insturen levert exact hetzelfde
resultaat op. Regels van een factuurnummer dat al bestaat, worden eerst
verwijderd en dan opnieuw geschreven.

Dat is niet theoretisch: op factuur 268245 (2 aug) waren vijf dagen van Sven
eerst teruggeboekt en daarna opnieuw gefactureerd. Met alleen een weektotaal is
zo'n correctie niet terug te vinden.

## Twee bronnen voor dezelfde week — pas op met dubbeltellen

Pronkert stuurt dezelfde week in twee vormen: de **margefactuur** (PDF, één
nummer voor alles, bv. 267947) en het **marge-overzicht** (Excel, een nummer per
flexkracht, bv. 267817/267845/267876). Dedupliceren gaat op factuurnummer, dus
zonder controle zou week 30 twee keer meetellen: € 2.679,70 in plaats van
€ 1.339,85.

De functie weigert daarom een bestand waarvan de week al onder een ánder
factuurnummer in het systeem staat, en zegt wat er al geboekt is. Twee uitwegen:

* `{"vervang": true}` — gooi de bestaande regels van die week weg en neem deze.
* `{"verrijk": true}` — boek niets bij, vul alleen de klantnaam aan. Die staat
  namelijk wél op het Excel-overzicht en niet op de PDF.

Verder is de PDF genoeg: marge, uren, uurloon, inkoop- en klantfactor en de
klantomzet komen er tot op de cent hetzelfde uit als op het overzicht
(gecontroleerd op week 30).

## Wat er wel en niet als "uur" telt

Alleen `Loon normale uren` en `Loon overwerkuren` zijn gewerkte uren.
Eindejaarsuitkering en arbeidstijdverkorting leveren wél marge op (die telt dus
mee in euro's), maar zijn geen uren — ze mogen de kosteloze-overnamegrens van de
klant niet opsouperen.

## Controle achteraf

De functie telt alle regels op en vergelijkt dat met het factuurtotaal. Wijkt het
af, dan wordt er **niets** opgeslagen en komt er een waarschuwing terug. Zelf
narekenen in de SQL-editor:

```sql
select week, sum(marge), sum(uren) from fin_flex_regels group by week order by week desc;
select * from fin_flex_week_kracht order by week desc, roepnaam;
```

## Namen matchen

De factuur schrijft `S. van Nicolaas (Sven)`, het CRM `Sven van Katwijk`. Er wordt
eerst op registratienummer gematcht (dat verandert nooit), anders op roepnaam —
en alleen als die bij precies één plaatsing hoort. Lukt het niet, dan komt de
persoon terug als `onbekend` in het antwoord en meldt de routine dat. Vastzetten
doe je één keer:

```sh
# regnr aan een plaatsing hangen; daarna matcht elke volgende factuur vanzelf
curl … -d '{"koppel":{"regnr":"7653911","plaatsing_id":12}}'
```
