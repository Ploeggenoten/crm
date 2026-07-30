# Pariteit met het pijplijnbord — checklist

Eis van Tjeerd: ALLE functionaliteit en data van het oude pijplijnbord
(~/ploeggenoten-pijplijnbord/index.html) moet in het CRM zitten — "echt alles,
alleen dan in het CRM-jasje". De data staat al in dezelfde Supabase (candidates,
clients, vacatures, targets, oo_sessions, profiles), dus dit gaat om FUNCTIES.
Nieuwe stijl, zelfde vermogen. Afvinken per regel; niets schrappen zonder
expliciet besluit van Tjeerd.

## Bord & kaarten
- [ ] Kanban alle fases, slepen, fase-picker voor mobiel (openPhasePicker)
- [ ] Kaartinfo: naam, functie@klant, type W&S/Flex, recruiter, bron
- [ ] Afspraak datum+tijd op kaart; vandaag/morgen visueel (groene schaduw), gemist rood
- [ ] Volgende-actie veld + herinnering (rood over datum)
- [ ] No-show knop + teller
- [ ] Aging-badge (≥4 dgn in fase, rood ≥10) — uitgezonderd 'In de wacht'
- [ ] ♻ herstart-tag op kaart (herstartVan)
- [ ] Nazorg-tags dag 3/14/30 in Gestart-kolom + dashboard-chips ("BEL NU")
- [ ] Compact/ruim-weergaveknop (localStorage)
- [ ] Groeperen/filteren per recruiter, klant, type
- [ ] Week-view "deze week starts" + startnotities (wdiv/startnote)

## Tellers & signalen
- [ ] Netto plaatsingen-teller: X getekend − Y gestopt, met naamchips (✍ getekend / 🛑 gestopt zonder emoji, in CRM-stijl)
- [ ] Maandtarget bewerkbaar (targets-tabel, __default__)
- [ ] ⚠ instroom laag-signaal (<3 in vroege fases)

## Kandidaten-instroom (Voorselectie)
- [ ] Kandidaten-tab = fase Voorselectie buiten het bord (pijplijn start bij Voorgesteld)
- [ ] Poortwachter: call-datum verplicht bij nieuw/wissel naar Voorselectie
- [ ] Video-intakeformulier volledig (blokken A-F + samenvatting; opslag intake jsonb met op/door)
- [ ] Intake-chip met cijfer op kaart (amber <7); teller zonder-intake
- [ ] "→ Voorstellen" met confirm als intake ontbreekt

## Poortwachters bij fasewissel
- [ ] Bron verplicht bij opslaan
- [ ] Maandloon verplicht bij contract-fases
- [ ] Startdatum bij getekend/gestart; verwachte startdatum bij 'In de wacht'
- [ ] Reden/formulier bij Afgevallen/Gestopt (ook bij verslepen)

## Salaris-componenten (bewerk-paneel)
- [ ] maandloon, toeslagPct (ploegen), vtPct (default 8), ejuPct, overigPct
- [ ] Live totaalJaarSalaris-berekening in het paneel (formule: jr×(1+ploeg)×(1+vt) + jr×eju + jr×overig)

## Uitval (openUitval/openUitvalForm)
- [ ] Uitval-tab met Afgevallen+Gestopt buiten het bord + smalle drop-strook
- [ ] afvalType niet_gekwalificeerd|offer_afgewezen (auto via verst-bereikte fase) + categorieën
- [ ] stopDoor kandidaat|klant|anders + categorieën; toelichting; recyclebaar-checkbox
- [ ] Stats: offer-acceptatie, top-redenen, stops ≤30/31-90/>90 dgn
- [ ] Vervangings-workflow (vervangt-veld, vervanger aanmaken)
- [ ] ♻ heraanbieden (openReactivate): NIEUWE kaart in Voorselectie met herstartVan, oude blijft staan; beschikbare-pool-lijst
- [ ] 🪪-correctieknop: fase/datums corrigeren, save routeert door stopformulier
- [ ] ✎ uitvalgegevens bijwerken achteraf

## Cijfers (openCijfers)
- [ ] Uitkomsten: aangenomen/afgevallen/gestopt/lopend + ratio
- [ ] Doorstroom-trechter per fase (verst-bereikte fase; Afgevallen/Gestopt tellen niet)
- [ ] Aanname-ratio per klant; redenen afvallen/stoppen
- [ ] Beschikbare pool met heraanbieden-knop
(→ mag in het CRM in Performance leven, als de cijfers er allemaal staan)

## O&O sessies (openOO, oo_sessions-tabel, ooId op kandidaat)
- [ ] Sessies aanmaken/beheren; kandidaten aan sessie koppelen; sessieweergave op bord/kaart

## Beheer (openManage/openAdmin)
- [ ] Klanten toevoegen/bewerken/verwijderen (upsert op naam — kolommen niet slopen)
- [ ] Vacatures beheren incl. aangemaakt-datum + "Xd open"-chip
- [ ] Targets beheren per maand
- [ ] Profielen/rollen-beheer (admin): rol wijzigen, uitnodig-instructie
- [ ] Export/import JSON (admin)

## Finance-koppelingcontract (NIET breken)
- [ ] Alle kolommen die candToRow schrijft blijven identiek (finance leest ze:
      maandloon/toeslag_pct/vt_pct/eju_pct/overig_pct/geplaatst_op/gestopt_op/
      herstart_van/vervangt/type/bron/rec/historie/intake/…)
- [ ] Heractiveren maakt ALTIJD een nieuwe kaart (nooit oude stop wissen)
- [ ] Plaatsing telt vanaf 'Contract getekend'; netto-definitie ongewijzigd
