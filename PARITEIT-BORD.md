# Pariteit met het pijplijnbord — checklist

Eis van Tjeerd: ALLE functionaliteit en data van het oude pijplijnbord
(~/ploeggenoten-pijplijnbord/index.html) moet in het CRM zitten — "echt alles,
alleen dan in het CRM-jasje". De data staat al in dezelfde Supabase (candidates,
clients, vacatures, targets, oo_sessions, profiles), dus dit gaat om FUNCTIES.
Nieuwe stijl, zelfde vermogen. Afvinken per regel; niets schrappen zonder
expliciet besluit van Tjeerd.

## Bord & kaarten
- [x] Kanban alle fases, slepen, fase-picker voor mobiel (openPhasePicker) — recruitment.js: fasePicker(), knop op elke kaart, alleen ≤900px zichtbaar; getest op 375px
- [x] Kaartinfo: naam, functie@klant, type W&S/Flex, recruiter, bron — chips op de kaart; "type?"-waarschuwing bij plaatsing zonder type
- [x] Afspraak datum+tijd op kaart; vandaag/morgen visueel (groene schaduw), gemist rood — .bcard.vandaag (groen kader, huisstijl = dunne rand i.p.v. schaduw), gemist = rode regel "— gemist"
- [x] Volgende-actie veld + herinnering (rood over datum) — bc-act.over
- [x] No-show knop + teller — knop in de bewerk-drawer (wist afspraak, telt, notitie), rode chip op kaart
- [x] Aging-badge (≥4 dgn in fase, rood ≥10) — uitgezonderd 'In de wacht' — amber ≥4 / rood ≥10; In de wacht toont neutrale chip
- [x] ♻ herstart-tag op kaart (herstartVan) — paarse tekst-chip "herstart" (geen emoji)
- [x] Nazorg-tags dag 3/14/30 in Gestart-kolom + dashboard-chips ("BEL NU") — kaartchip "check-in vandaag · dag X" + signaalstrook-rij "Nazorg dag 3·14·30" met "bel vandaag"-chips, klikbaar naar kandidaat
- [x] Compact/ruim-weergaveknop (localStorage) — sleutel crm_rc_compact, knop in de paginakop
- [x] Groeperen/filteren per recruiter, klant, type — filters klant/recruiter/type/vacature/mijn + "Groepeer per klant"-toggle (klantgroepen in kolommen)
- [x] Week-view "deze week starts" + startnotities (wdiv/startnote) — weekscheidingen (Week N · data) in gesprek/contract/gestart-kolommen, startnote "Deze week: X starts" boven Gestart

## Tellers & signalen
- [x] Netto plaatsingen-teller: X getekend − Y gestopt, met naamchips (in CRM-stijl) — KPI met CRM.plusMin (−4 rood / +3 olijf) + signaalstrook met klikbare naamchips getekend (groen) en gestopt (rood)
- [x] Maandtarget bewerkbaar (targets-tabel, __default__) — Instellingen: tabel per maand + standaardregel; default wordt naar __default__ ÉN __default geschreven (bord leest de tweede)
- [x] ⚠ instroom laag-signaal (<3 in vroege fases) — amberen chip in de signaalstrook

## Kandidaten-instroom (Voorselectie → Intake)

> **BEWUSTE AFWIJKING VAN HET BORD — besluit Tjeerd, 30 juli 2026.**
> De fase **Voorselectie bestaat niet meer**; de eerste pijplijnfase heet
> **Intake** en staat wél gewoon als eerste kolom op het bord. Reden: als een
> sollicitant interessant is, heeft een aparte screeningsstap geen waarde. Je
> zet meteen de volledige kandidatenkaart op en plant van daaruit de videocall
> via Teams. Het losse tabblad is daarmee overbodig geworden.
> Lees hieronder overal "Intake" waar "Voorselectie" staat. De migratie van
> bestaande rijen staat in `supabase/migratie-intake.sql`; tot die gedraaid is
> leest de code de oude waarde als synoniem, zodat niemand uit beeld valt.

- [x] ~~Kandidaten-tab = fase Voorselectie buiten het bord~~ — VERVALLEN: Intake is de eerste bordkolom, geen apart tabblad meer
- [x] Poortwachter: call-datum verplicht bij nieuw/wissel naar Voorselectie — nieuweKandidaatModal + faseWissel + drawer-opslaan eisen call-datum
- [x] Video-intakeformulier volledig (blokken A-F + samenvatting; opslag intake jsonb met op/door) — veldnamen identiek aan het bord (situatie/trajecten/jaZegt/…/nietLager/tien/drijfveer/risicos/klaar) + extra veld samenvatting (bestond al in het CRM, blijft gevuld)
- [x] Intake-chip met cijfer op kaart (amber <7); teller zonder-intake — chip op kaart + KPI "Intake nog te doen" in de tab
- [x] "→ Voorstellen" met confirm als intake ontbreekt — CRM.bevestig-dialoog

## Poortwachters bij fasewissel
- [x] Bron verplicht bij opslaan — drawer-opslaan blokkeert zonder bron
- [x] Maandloon verplicht bij contract-fases — faseWissel-modal én drawer vragen/eisen het
- [x] Startdatum bij getekend/gestart; verwachte startdatum bij 'In de wacht' — beide afgedwongen; start ≤ vandaag promoveert automatisch naar Gestart (ook bij render, zoals het bord)
- [x] Reden/formulier bij Afgevallen/Gestopt (ook bij verslepen) — drop op uitvalstrook/kolomkeuze routeert altijd door het uitvalformulier

## Salaris-componenten (bewerk-paneel)
- [x] maandloon, toeslagPct (ploegen), vtPct (default 8), ejuPct, overigPct — Salaris-kaart in de bewerk-drawer; kolomnamen exact candToRow (finance leest ze)
- [x] Live totaalJaarSalaris-berekening in het paneel (formule: jr×(1+ploeg)×(1+vt) + jr×eju + jr×overig) — live bij typen; nagerekend in de browser: 2960/15%/8% → €44.116, +8,33% EJU → €47.075 ✓

## Uitval (openUitval/openUitvalForm)
- [x] Uitval-tab met Afgevallen+Gestopt buiten het bord + smalle drop-strook — eigen tab + strook rechts naast het bord met tellers en "Uitval openen →"
- [x] afvalType niet_gekwalificeerd|offer_afgewezen (auto via verst-bereikte fase) + categorieën — furthestPhaseIdx 1-op-1 overgenomen; "auto"-chip als het type is afgeleid
- [x] stopDoor kandidaat|klant|anders + categorieën; toelichting; recyclebaar-checkbox — incl. gestopt-op + plaatsingsdatum met waarschuwing als die leeg blijft (telt anders niet als stopper)
- [x] Stats: offer-acceptatie, top-redenen, stops ≤30/31-90/>90 dgn — formules identiek (ooit ≥'In de wacht' óf offer_afgewezen; vervangers uitgesloten)
- [x] Vervangings-workflow (vervangt-veld, vervanger aanmaken) — "vervanging nodig" (garantieregels van het bord) + "+ Vervanger"-knop, vervangt-veld in de drawer, statuschips vervangen/onderweg
- [x] ♻ heraanbieden (openReactivate): NIEUWE kaart in Voorselectie met herstartVan, oude blijft staan; beschikbare-pool-lijst — getest: oude kaart kreeg ALLEEN een notitie erbij (fase/datums onaangeroerd); nieuwe kaart met loon/toeslagen/intake mee + herstart-chip; knop verdwijnt daarna ("heraangeboden bij X"); recyclebaar-filter = de pool
- [x] 🪪-correctieknop: fase/datums corrigeren, save routeert door stopformulier — "Corrigeren" opent de drawer (met geplaatst-op/gestopt-op-velden bij uitval/plaatsing); opslaan zonder categorie routeert door het uitvalformulier — getest
- [x] ✎ uitvalgegevens bijwerken achteraf — "Bijwerken" opent het uitvalformulier in edit-modus (ook voor oude kandidaten zonder categorie)

## Cijfers (openCijfers)
- [x] Uitkomsten: aangenomen/afgevallen/gestopt/lopend + ratio — → performance (leeft daar; recruitment houdt geen data achter: alles staat in candidates)
- [x] Doorstroom-trechter per fase (verst-bereikte fase; Afgevallen/Gestopt tellen niet) — → performance (conversietrechter aanwezig, zelfde verste-fase-principe)
- [x] Aanname-ratio per klant; redenen afvallen/stoppen — → performance (klantentabel + redenen)
- [x] Beschikbare pool met heraanbieden-knop — leeft in het CRM in de Uitval-tab: recyclebaar-toggle + "Opnieuw aanbieden" per rij (zelfde functie als de pool in openCijfers)
(→ mag in het CRM in Performance leven, als de cijfers er allemaal staan)

## O&O sessies (openOO, oo_sessions-tabel, ooId op kandidaat)
- [x] Sessies aanmaken/beheren; kandidaten aan sessie koppelen; sessieweergave op bord/kaart — ooModal: sessie kiezen/nieuw, klant/functie/datum/locatie (kolommen identiek aan het bord), leden aan-/afvinken, snel-toevoegen, verwijderen; O&O-kolom toont sessiekoppen (n/4 met kleur) + leden + "Zonder sessie"; sessie-chip in de drawer. Getest: sessie aangemaakt, 2 kandidaten gekoppeld (fase/oo_id/datum gezet). Let op: demo.js heeft geen oo_sessions-testdata.

## Beheer (openManage/openAdmin)
- [x] Klanten toevoegen/bewerken/verwijderen (upsert op naam — kolommen niet slopen) — → klanten (leeft in klanten.js)
- [x] Vacatures beheren incl. aangemaakt-datum + "Xd open"-chip — → klanten (vacatureModal met "Open sinds" + dagen-open)
- [x] Targets beheren per maand — → instellingen (tabel met netto behaald + verschil via CRM.plusMin)
- [x] Profielen/rollen-beheer (admin): rol wijzigen, uitnodig-instructie — → instellingen (rol-select per profiel + invite-instructie)
- [x] Export/import JSON (admin) — → instellingen; export is bord-compatibel (cands camelCase, vacs als arrays, sessions, targets+target) met crm-blok als extra; import vervangt alleen bord-data na bevestiging

## Finance-koppelingcontract (NIET breken)
- [x] Alle kolommen die candToRow schrijft blijven identiek (finance leest ze:
      maandloon/toeslag_pct/vt_pct/eju_pct/overig_pct/geplaatst_op/gestopt_op/
      herstart_van/vervangt/type/bron/rec/historie/intake/…) — alle schrijfacties gaan via CRM.candToRow of patches met exact deze kolomnamen
- [x] Heractiveren maakt ALTIJD een nieuwe kaart (nooit oude stop wissen) — getest: diff op de oude kaart was uitsluitend `notities`
- [x] Plaatsing telt vanaf 'Contract getekend'; netto-definitie ongewijzigd — teller gebruikt CRM.plaatsingenMaand uit core (getekend − gestopt deze maand)

---
Verificatie 30 jul 2026 (?demo=1 en ?demo=team, eigen browsertab, console schoon):
compact/ruim, heractiveren, salaris-live-totaal, O&O-sessie, correctieflow,
fase-picker op 375px, instellingen onzichtbaar voor teamleden — allemaal getest.
Bewuste afwijking: index.html kreeg twee regels erbij (link/script voor
instellingen.css/.js) omdat de module anders niet kan laden — gemeld aan de
coördinator.
