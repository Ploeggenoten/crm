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

**Nooit aanpassen:** `index.html`, `css/base.css`, `js/core.js`, `js/data.js`,
`js/demo.js`, `supabase/schema.sql`. Mis je daar iets, zet het dan onderaan je
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

Regels:
- Anton (`--disp`) alleen voor koppen en kleine hoofdletterlabels. **Nooit voor
  datums of cijfers** — die in Inter met `class="num"`.
- Alleen kleuren uit de variabelen in `:root`. Geen felle/neon kleuren.
- Kleur is betekenis, geen decoratie: hooguit één accent per scherm.
- Veel witruimte, rustige dichtheid. Liever een lege staat dan een vol scherm.

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
CRM.canSeeMoney()                  // ALLEEN dan fee/omzet/marge tonen
CRM.me() / CRM.isVanMij(obj)       // filter "mijn klanten/leads"
```

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

Fee, omzet, marge en alles uit `fin_*` **alleen** tonen achter
`if(CRM.canSeeMoney())`. Het team mag die cijfers niet zien. Toon in plaats
daarvan aantallen (plaatsingen, gesprekken) — die zijn voor iedereen.

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
