# Wat het onderzoek oplevert — en wat ik zou doen

Vier onderzoekslijnen, samengevat tot besluiten. De onderliggende rapporten
staan ernaast: `ats-kern.md`, `crm-klantzijde.md`, en het compliance-deel.

---

## Het cijfer dat alles verandert

**1.000 leads per week, 75 plaatsingen per jaar. Dat is 0,14%.**
De branchebenchmark ligt rond 0,6%, en rond 95 sollicitanten per aanname.

Je zit dus een factor vier tot vijf onder wat gebruikelijk is — niet omdat je
pijplijn slecht is, maar omdat één recruiter 200 telefoonnummers per dag niet
kan bellen. Het lek zit in de **eerste 48 uur**, niet in het traject daarna.

Dat is belangrijk, want een klassiek ATS is juist gebouwd voor de fase ná het
eerste contact. "Wat elk pakket heeft" is hier dus een slechte boodschappen-
lijst. De vraag is niet *hoe beheren we kandidaten*, maar *hoe raken we van
1.000 nummers naar 40 gesprekken zonder dat er iemand doorheen valt*.

---

## Wat ik zou bouwen, in deze volgorde

### 1. Ontdubbelen op telefoonnummer
Het telefoonnummer is jullie enige unieke veld — geen e-mail, geen cv. De
meeste ATS'en ontdubbelen op e-mail en zijn hier dus nutteloos. Zonder dit
staat dezelfde persoon na drie campagnes drie keer in het systeem, en zie je
niet dat hij al twee keer eerder reageerde. Dat laatste is een koopsignaal
dat je nu weggooit.

Beste verhouding opbrengst/werk van de hele lijst. **Vandaag gedaan** — zie
onderaan.

### 2. Werkvoorraad met pogingteller
"Gebeld — geen gehoor" is nu een rustplaats. Het hoort een teller te zijn met
een volgend moment: poging 1 vanochtend, poging 2 morgen op een ánder
tijdstip, poging 3 de dag erna. Wie in 2-ploegen zit en om 10:00 niet opneemt,
neemt om 16:00 misschien wel op.

Jij zei het zelf: na drie belletjes nemen ze vaak wel op. Nu is er niets dat
die derde poging afdwingt.

Vereist twee kolommen op `crm_leads` (`belpogingen`, `laatst_actie`) — die
staan al als verzoek in de code.

### 3. Acht knock-outvelden als gegeven, niet als vrije tekst
Vervoer, ploegendienst, taal, VCA/heftruck, startdatum, huisvesting nodig
ja/nee, rijbewijs, woon-werkafstand. Nu staan die deels in vrije tekst en
deels nergens. Als data kun je vóór het bellen al zien wie kansloos is voor
deze vacature — bij 200 nummers per dag is dat het verschil.

### 4. Eerste bericht binnen minuten
Reactiesnelheid is in volume-recruitment de grootste enkele factor. Een
automatisch eerste WhatsApp-bericht binnen minuten na de reactie is
waarschijnlijk meer waard dan alles hierboven samen. Wacht op de AI-bot.

---

## Wat ik expliciet NIET zou bouwen

Uit het ATS-onderzoek, met redenen:

- **CV-parsing uitbreiden.** Jullie krijgen geen cv's. Recruiters melden dat
  parsing juist vervuiling oplevert.
- **AI-matching op cv-tekst** — zelfde reden.
- **Boolean zoeken in profieldatabases.** Heftruckchauffeurs staan niet op
  LinkedIn.
- **Scorecards en interviewkits.** Gebouwd voor panels van acht; jullie zijn
  met vier.
- **Werkenbij-pagina en multiposting.** Jullie kanaal is Meta, niet vacature-
  banken.
- **Klantportaal.** 25 klanten in productie en logistiek loggen niet in.
- **Samengestelde gezondheidsscore per klant.** Bij 25 klanten betekenisloos;
  vijf losse stoplichten werken beter.

---

## De klantzijde: één gat springt eruit

**"Intake" betekent in dit systeem uitsluitend kandidaat-intake.** Er bestaat
nergens een opdracht-intake met de contactpersoon: wat vraagt de klant
precies, welke werktijden, welk tarief, wie beslist, wanneer moet het rond
zijn. Dat is het grootste gat aan de klantzijde.

Verder: `crm_afspraken` is verder uitgewerkt dan gebruikelijk (fee per
functiegroep, garantietermijn, exclusiviteit) maar het is dode data — de
garantieklok telt niet af en er wordt nergens vergeleken tussen afgesproken
en werkelijk gehanteerde fee.

En `crm_trajecten` bewaart al alles voor herplaatsing (reden, hoogste fase,
naar welke klant) maar er gebeurt niets mee. Eén query, één lijst — de
goedkoopste verbetering in het hele rapport.

---

## Wet- en regelgeving: dit vraagt een besluit van jou

Het compliance-onderzoek levert een lijst die groter is dan dit CRM. De kern:

**Een ATS en een backoffice zijn in Nederland twee systemen, en die scheiding
is juridisch, niet technisch.** Vrijwel elk uitzendbureau draait twee pakketten
met een koppeling ertussen. Dit CRM is de voorkant. Verloning, urenregistratie
en facturatie horen daar niet in — dat is geen tekortkoming maar een keuze die
de markt ook maakt.

**Wat wél in de voorkant hoort en er nu niet in zit:**

| Wat | Waarom het niet kan wachten |
|---|---|
| Identiteitscontrole vóór eerste werkdag, met verloopdatum | Geen kopie = **anoniementarief 52%** |
| Scheiding inschrijving/plaatsing in de gegevens | Bij inschrijving mág je geen BSN of pasfoto vragen; bij plaatsing moet het |
| Bewaartermijn sollicitanten: 4 weken, of 1 jaar mét aantoonbare toestemming | Vraagt om een toestemmingsregistratie met datum, niet om een vinkje |
| Certificaten met vervaldatum (VCA, heftruck, reachtruck) | Verlopen certificaat = verzekering vervalt. Blokkeert plaatsing |
| RI&E-doorgeleiding per opdracht | Wettelijke plicht van de uitlener, met bewijs van ontvangst |

**Twee regimewijzigingen die eraan komen:**

- **Per 1-1-2026: gelijkwaardige beloning** vervangt inlenersbeloning. Niet
  alleen loon — het hele arbeidsvoorwaardenpakket moet gelijkwaardig zijn in
  waarde. De uitvraag bij de inlener is een gestandaardiseerde vragenlijst van
  dertig pagina's die je moet vastleggen, versiebeheren en jaarlijks opnieuw
  toetsen bij opdrachten langer dan een jaar.
- **Wtta: 1-11-2026 aanmelden overgangsregeling, 1-1-2028 handhaving met
  inleenverbod.** €100.000 waarborgsom per rechtspersoon.

⚠️ **Laat dit door je accountant of branchevereniging toetsen voordat we er
iets op bouwen.** Het onderzoek is zorgvuldig maar de bronnen spreken elkaar
op punten tegen — met name over wannéér de faseverkorting ingaat (2026, 2027
of 2028). Dat staat in het rapport per punt benoemd. Ik ga geen wetgeving in
code gieten op basis van tegenstrijdige bronnen.

---

## Vandaag gedaan

- Hele keten getest: vacature → lead → kandidaat → intake → voorstellen →
  gesprekken → plaatsing. Negen stappen, niets brak.
- Performance rechtgezet (conversietrechter telde 33 plaatsingen waar er 17
  waren; bronnen toonden 192% conversie).
- Twee stille fouten: onzichtbaar venster op een achtergrondtab, en een
  vacaturekoppeling die zonder melding werd overschreven.
- Ontdubbelen op telefoonnummer.
