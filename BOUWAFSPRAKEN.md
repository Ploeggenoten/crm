# Bouwafspraken — Ploeggenoten CRM

Meerdere agents bouwen tegelijk aan deze app. Deze afspraken houden het
één samenhangend systeem in plaats van zeven losse schermen.

## 1. Bestanden — raak alleen die van jou aan

| Module | Jouw bestanden |
|---|---|
| Dashboard | `js/dashboard.js`, `css/dashboard.css` |
| Sales | `js/sales.js`, `css/sales.css` |
| Klanten | `js/klanten.js`, `css/klanten.css` |
| Recruitment | `js/recruitment.js`, `css/recruitment.css` |
| Kandidaten | `js/kandidaten.js`, `css/kandidaten.css` |
| Marketing | `js/marketing.js`, `css/marketing.css` |
| Performance | `js/performance.js`, `css/performance.css` |
| Finance | `js/finance.js`, `css/finance.css` |
| Pijplijnbord | `js/pijplijn.js`, `css/pijplijn.css` |
| Hot vacatures | `js/hot.js`, `css/hot.css` |
| Source | `js/source.js`, `css/source.css` |
| Instellingen | `js/instellingen.js`, `css/instellingen.css` |

Daarnaast drie bestanden zonder eigen scherm. Ze horen bij niemand in het
bijzonder en worden door meerdere modules gebruikt — wijzig ze alleen als je
er expliciet eigenaar van bent gemaakt:

| Gedeeld | Wat het is |
|---|---|
| `js/fee.js` (`CRM.fee`) | Leidt uit de klantafspraak en de salariscomponenten de grondslag en de fee af. Eén rekenregel, zodat Finance, de kandidatenkaart en Performance nooit een ander bedrag tonen. |
| `js/opvolging.js` (`CRM.opvolging`) | Wanneer er contact hoort te zijn: nazorg tot een jaar, warm houden vóór de startdatum, verjaardagen, felicitatiemail en de herinnering vóór een afspraak. Dashboard, bord, kaart en Performance lezen hier allemaal uit. Uitbreiden kan zonder dit bestand aan te raken, via `CRM.opvolging.registreerBron(fn)`. |
| `js/cv.js`, `js/swo.js`, `js/pva.js` | De drie documentgeneratoren (kandidaatprofiel, samenwerkingsovereenkomst, plan van aanpak). Geen menu-item: ze openen vanaf een kaart. |

**Nooit aanpassen:** `index.html`, `css/base.css`, `js/core.js`, `js/data.js`,
`js/demo.js`, `js/outlook.js`, `supabase/schema.sql`. Mis je daar iets, zet het dan onderaan je
eigen bestand onder `/* VERZOEK AAN CORE: ... */` — de coördinator verwerkt het.

## 2. Registreren

```js
CRM.registerModule('sales', {
  title:'Sales', icon:'◈', onderschrift:'Klantpijplijn en kansen',
  volleBreedte:false,          // true = geen padding (voor borden)
  adminOnly:false,             // true = alleen Tjeerd
  badge(){ return aantalOpenTaken; },   // optioneel: teller in de zijbalk
  render(mount, acties, params){ ... }  // acties = knoppenbalk in de paginakop
});
```

`render` krijgt: `mount` (het contentgebied), `acties` (element rechts in de
paginakop voor knoppen) en `params` (bv. `{id:'...'}` uit de URL `#sales/123`).

## 3. Gebruik het design-system — verzin geen eigen stijl

Beschikbaar in `css/base.css` (lees dat bestand eerst):
`.card .card-h .card-b .card-f`, `.kpi`, `.btn .btn.ghost .btn.sub .btn.sm`,
`.chip` (+ `.green .red .amber .blue .purple`), `.tabs .tab`, `.seg`,
`.tblwrap table.tbl`, `.board .bcol .bcard` (pijplijnborden),
`.tl` (tijdlijn), `.grid.c2/.c3/.c4`, `.note.info/.warn/.err/.ok`,
`.bar`, `.empty`, `.ava`, `.f-row .f-grid`, `.searchbox`, `.label .h1 .h2 .sub .meta`.

Regels (huisstijlbrief Tjeerd, 30 jul 2026):
- **Anton (`--disp`) alleen voor paginatitels (`.h1`) en grote kerncijfers
  (`.big`).** Al het functionele — knoppen, labels, tabellen, tussenkoppen —
  is Inter. Datums en kleine cijfers: Inter met `class="num"`.
- Knoppen zijn pill-vormig en ALTIJD Inter 600/700. Nooit Anton op een knop.
- Lime (`--lime`) ALLEEN op donkere vlakken (`.btn.dark`); nooit als accent op
  de lichte achtergrond. Oranje (`--oranje`) = secundaire actie/waarschuwing.
- Alleen kleuren uit de variabelen in `:root`. Geen felle/neon kleuren.
- Dunne randen in plaats van schaduwen. Spacing in veelvouden van 4px.
- Kleur is betekenis, geen decoratie: hooguit één accent per scherm.
- Veel witruimte, rustige dichtheid. Liever een lege staat dan een vol scherm.
- Handschrift-accent `.hand` (Caveat): hooguit 1–2 per pagina, spaarzaam.
- **Cijfers met lading**: positieve waarden in olijf, negatieve in rood — gebruik
  `CRM.plusMin(n, fmt?)` of de klassen `.pos`/`.neg`. Neutrale cijfers blijven
  gewoon donker (kleur alleen als het richting uitdrukt).

## 4. Helpers (uit `js/core.js` en `js/data.js`)

```js
CRM.h(tekst)                       // ALTIJD gebruiken bij het bouwen van HTML
CRM.fmtDate / fmtDateShort / fmtDay / geleden / dagenGeleden
CRM.euro(bedrag) / CRM.pct(n) / CRM.avatar(naam) / CRM.initialen(naam)
CRM.toast(tekst,'ok'|'err') / CRM.fout(tekst, err)
CRM.drawer.open(html,{onOpen}) / CRM.drawer.close()   // detailpaneel rechts
CRM.modal.open(html,{onOpen}) / CRM.bevestig(vraag) / CRM.vraag(titel,opts)
CRM.ui.leeg(titel,tekst,knop) / CRM.ui.laden() / CRM.ui.kpi(...) / CRM.ui.tijdlijn(items)
CRM.ga('kandidaten',{id:'c123'})   // naar een andere module navigeren
CRM.state                          // cands, clients, vacs, leads, activiteiten, taken, kansen, documenten, contacten
CRM.kandidaten() / CRM.kandidaat(id) / CRM.klant(naam) / CRM.vacaturesVan(klant)
CRM.PHASES / CRM.SALES_FASES / CRM.LEAD_STATUS / CRM.ACT_SOORTEN
CRM.logActiviteit(entiteit, ref, soort, tekst)   // klant|kandidaat|lead|vacature
CRM.activiteitenVoor(entiteit, ref)
CRM.matchScore(kandidaat, vacature) / CRM.besteMatches(kandidaat)
CRM.volledigheid(kandidaat)        // tegen vervuiling
CRM.magOpbrengstZien()             // fee per plaatsing + omzet per klant — HELE TEAM
CRM.canSeeMoney()                  // winst, marge, cashflow, banksaldo — ALLEEN de eigenaar
CRM.me() / CRM.isVanMij(obj)       // filter "mijn klanten/leads"
CRM.fee(kandidaat, klant)          // grondslag + fee, één rekenregel
CRM.opvolging.openVoor(mij) / .tussen(van, tot) / .registreerBron(fn)
CRM.faseNorm(f) / CRM.faseIs(c, f) / CRM.faseIn(c, lijst)   // 'Voorselectie' heet nu 'Intake'
```

Zoek je "wie moet ik vandaag bellen", bouw dat dan niet zelf: vraag het aan
`CRM.opvolging`. Toen elke module dat apart uitrekende zei het dashboard iets
anders dan de kandidatenkaart, en dan gelooft niemand het meer.

## 5. Data opslaan

Schrijf naar Supabase met `CRM.sb.from('tabel')…` en werk daarna `CRM.state`
bij, zodat het scherm meteen klopt. In demo-modus (`CRM.demo === true`) mag je
**niet** naar de database schrijven — pas alleen `CRM.state` aan en toon een
toast. Patroon:

```js
async function bewaar(rij){
  CRM.state.kansen.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_kansen').insert(rij);
    if(error) return CRM.fout('Opslaan mislukt', error);
  }
  CRM.toast('Opgeslagen','ok'); CRM.render();
}
```

Tabellen: `candidates`, `clients`, `vacatures`, `targets`, `profiles` (bestaand)
en `crm_leads`, `crm_activiteiten`, `crm_taken`, `crm_documenten`, `crm_kansen`,
`crm_contacten` (nieuw, zie `supabase/schema.sql`).

## 6. Geld en privacy

Sinds 31 juli 2026 zijn er **twee** poorten. Pak de juiste:

| | Wat | Wie |
|---|---|---|
| `CRM.magOpbrengstZien()` | Fee per plaatsing, omzet per klant | Iedereen die is ingelogd |
| `CRM.canSeeMoney()` | Winst, marge, cashflow, banksaldo, gefactureerde omzet, alles uit `fin_*` | Alleen de eigenaar |

Besluit Tjeerd: "fee mag zichtbaar zijn voor iedereen, omzet per klant ook
prima. Alleen winst etc en cashflow en allemaal andere cijfers zijn voor
finance bij mij." Zonder de fee stuurt een accountmanager op aantallen in
plaats van op opbrengst.

**Lezen open, schrijven dicht:** het team ziet de fee, maar alleen de eigenaar
kan een fee-afspraak wijzigen (`crm_afspraken`). Een percentage per klant is
een onderhandelingsresultaat, geen veld dat je even bijwerkt. De database doet
hetzelfde.

Kun je iets niet tonen, toon dan het aantal (plaatsingen, gesprekken) — dat is
voor iedereen.

## 7. Nederlands

Alle knoppen, labels en meldingen in het Nederlands, in de je-vorm. Codenamen
en commentaar ook in het Nederlands.

## 8. Zelf controleren vóór je klaar bent

Dev-server draait op **http://localhost:8130/?demo=1** (testdata, geen login).
Je bent pas klaar als je met de browser-tools:
1. je module hebt geopend (`#<jouwmodule>` in de URL),
2. `read_console_messages` geen fouten toont,
3. een screenshot hebt gemaakt die er rustig en professioneel uitziet,
4. de belangrijkste interactie hebt getest (kaart openen, filter, opslaan).

Gebruik een **eigen browsertab** (`tabs_create` → `navigate`) zodat je andere
agents niet stoort. Sluit je tab als je klaar bent.
