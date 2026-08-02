# De klantzijde van een recruitment-CRM

Onderzoek, 2 augustus 2026. Voor Ploeggenoten: vier man, ±25 klanten,
productie/logistiek/industrie, elke AM zijn eigen klanten, uitzenden én W&S.

Dit rapport gaat over alles rond de opdrachtgever — niet over de kandidaat.

---

## Hoe je dit leest

Twintig capabilities, gesorteerd op wat ze dít bureau opleveren. Niet op wat
Bullhorn belangrijk vindt. Bij elk staat het bewijs, en waar ik redeneer in
plaats van citeer staat dat er expliciet bij.

De sortering volgt één vuistregel: **geld dat weglekt en boetes die vallen gaan
vóór inzicht, en inzicht gaat vóór netheid.** Bij 25 klanten is één weggelopen
klant 4% van je basis; bij 25 klanten is een dashboard met achttien grafieken
tijdverspilling. Die twee dingen bepalen de hele volgorde.

Onderaan staat wat je **niet** moet bouwen. Dat deel is net zo belangrijk.

## Wat er al staat (om niet dubbel te bouwen)

Uit `supabase/schema.sql`, `supabase/nog-te-draaien.sql` en `js/klanten.js`:

- `clients` — fase, eigenaar, branche, sinds, laatst_contact, fase_historie, KvK,
  vestigingsadres.
- `crm_contacten` — contactpersonen per klant, hoofdcontact, verjaardag.
- `crm_afspraken` — fee-regels per functiegroep, grondslag, betaaltermijn,
  factuurmoment, `garantie_mnd`, `garantie_soort`, `exclusiviteit_wkn`, ingang/einde.
  **Dit is verder dan de meeste bureaus komen.** Het knelpunt zit niet in het
  vastleggen maar in het *bewaken* (zie 6, 8, 11).
- `crm_kansen`, `crm_activiteiten`, `crm_taken`, `crm_stukken` (SWO/PvA),
  `crm_trajecten` (kandidaat afgesloten bij klant A, met `naar_klant`).
- Klantkaart met tabs: vacatures, kandidaten, activiteiten, evaluaties, documenten.
- `vacatures` — locatie, aantal, salarisrange, werktijden, ploegendienst,
  contractvorm, eisen, bereikbaarheid, hot/deadline/doel, websitestand.

Belangrijkste observatie: **"intake" betekent in dit systeem kandidaat-intake**
(`js/intake.js`, `intakeForm()` in `js/recruitment.js` — vijftien vragen over de
kandidaat). Er is nergens een intake mét de opdrachtgever. Dat is capability 1.

---

## De twintig

### 1. Opdracht-intake: een verplicht uitvraagformulier bij de vacature, niet bij de kandidaat

**Wat.** Een vast formulier dat de AM invult mét de contactpersoon voordat een
vacature op "Open" mag — met naast de functie-inhoud vier kwalificatievelden:
wie beslist, welke procedure (aantal gesprekken, wie schuift aan), welke datum
moet het rond zijn, en werken er andere bureaus aan.

**Waarom.** Rajesh werft op opdrachten die Tjeerd of Tjerk hebben opgehaald. Elk
gat in die overdracht kost hem uren die niemand terugziet. Bij 25 klanten en één
recruiter is misgelopen werving de duurste post die er is. Nu staan er wel
inhoudelijke vacaturevelden (`werktijden`, `eisen`, `bereikbaarheid`) maar geen
enkel veld over hóe de opdracht loopt.

**Bewijs.** Top Echelon noemt vier kwalificatiecomponenten — urgentie met echte
data, een vast tijdschema per fase, een toezegging van de hiring manager, en
concrete verwachtingen — en waarschuwt letterlijk tegen vage antwoorden als
"ASAP". Werf& en HetRecruitingKantoor geven de inhoudelijke kant: waarom staat
de vacature open, wat moet er in 100 dagen af, wat is onaantrekkelijk aan de
baan. Liberty Staffing: de kwaliteit van de job order is een van de grootste
factoren in de fill rate. *Mijn eigen toevoeging is de scheiding tussen
inhoud en procedure* — de Nederlandse bronnen gaan bijna alleen over inhoud
(voor de vacaturetekst), de Amerikaanse bijna alleen over commitment.

**Impact hoog / inspanning midden.** Eén formulier, één statusregel ("Open kan
pas als intake af is"), en de bestaande `crm_stukken`-structuur kan het dragen.

---

### 2. Het arbeidsvoorwaardenpakket per klant als gegevens, met bron en datum

**Wat.** Per klant en per functiegroep vastleggen: loongebouw en schaal,
periodieken, ploegen- en onregelmatigheidstoeslagen, ADV, reiskosten,
thuiswerkvergoeding, eindejaarsuitkering, vakantiedagen — plus wie het heeft
aangeleverd, wanneer, en wanneer het opnieuw uitgevraagd moet worden.

**Waarom.** Sinds 1 januari 2026 is inlenersbeloning vervangen door
*gelijkwaardige arbeidsvoorwaarden*: het totale pakket moet minstens evenveel
waard zijn als dat van vast personeel. Dat is een rekensom die je alleen kunt
maken als je het complete pakket van die klant hebt. Voor een bureau in productie
en industrie — ploegentoeslagen, onregelmatigheid, ADV — is dit precies waar het
misgaat. Eén verkeerd toegepaste ploegentoeslag over een half jaar bij een klant
met acht uitzendkrachten is een nabetaling die een kwartaalmarge opeet.

**Bewijs.** Artikel 12a Waadi maakt de **opdrachtgever** wettelijk verantwoordelijk
om die informatie volledig en correct aan te leveren (SUSA). Dat is precies
waarom je het gedateerd en met naam wilt opslaan: het is jouw bewijs. SUSA noemt
als risico's loonscorrecties met terugwerkende kracht, reputatieschade en extra
zorgplicht bij doorlening. Randstad en Robert Half bevestigen de cao-wijziging
per 2026.

**Impact hoog / inspanning midden.** Een `crm_klantvoorwaarden`-tabel met een
`aangeleverd_door`, `aangeleverd_op` en `hercontrole_op`, plus een taak die
vanzelf terugkomt.

---

### 3. Tariefkaart per klant: brutoloon → omrekenfactor → uurtarief → marge

**Wat.** Per klant en functie het afgesproken uurtarief naast de gehanteerde
omrekenfactor, zodat het systeem laat zien wat er onder aan de streep overblijft
— en waarschuwt als een tarief onder de kostprijsfactor duikt.

**Waarom.** `crm_afspraken` dekt W&S goed (fee-regels, grondslag) maar heeft voor
uitzenden alleen `soort = 'uitzenden'` en verder niets. Terwijl daar de marge het
smalst en het meest volatiel is. In 2026 stijgt de StiPP-premie fors en gaan
uitzendkrachten 5 tot 10% per uur duurder worden; een tarief dat in 2025 gezond
was, is dat in 2026 niet meer. Bij 25 klanten is dit één keer per klant
narekenen — maar zonder de gegevens in het systeem gebeurt dat één keer per jaar
in een spreadsheet, en niet bij de eerstvolgende plaatsing.

**Bewijs.** Flexpedia: basisomrekenfactor fase A met StiPP-basispensioen 1,7986
in 2026. Recruitmenttraining.pro noemt een gemiddelde factor van 1,9–2,6, een
StiPP-premie van 23,4% (werkgeversdeel 15,9%, was 8–12%) en een bureaumarge van
10–25% van het uurtarief. **Let op: die 23,4% kwam ik in één bron tegen; laat dat
door de boekhouder bevestigen voordat je het in het systeem hardcodeert.** De
opbouw zelf (reserveringen, werkgeverspremies, pensioen, marge) staat in
meerdere bronnen gelijk.

**Impact hoog / inspanning midden.**

---

### 4. Klantradar: één scherm dat verslechterende relaties zichtbaar maakt vóór de opzegging

**Wat.** Per klant een handvol signalen naast elkaar, met kleur: dagen sinds
laatste contact, aantal open opdrachten zonder voorstel, gemiddelde
terugkoppeltijd van de klant, plaatsingen dit kwartaal versus vorig, en of er nog
een opdracht binnenkwam sinds de laatste.

**Waarom.** Dit is de kern van je vraag. Bij 25 klanten kun je geen churn-model
bouwen — te weinig data, en Tjeerd en Tjerk kennen hun klanten persoonlijk. Maar
juist daarom werkt een radar: hij hoeft niets te voorspellen, alleen te laten
zien wat je zelf al zou zien als je alle 25 op één ochtend langsliep. **Dit is
grotendeels mijn eigen redenering** — de gepubliceerde health-score-modellen zijn
gebouwd voor SaaS-portefeuilles van honderden accounts en zijn hier overkill.

**Bewijs.** Wat wél uit bronnen komt zijn de signalen zelf: betalingen die van 10
naar 30+ dagen gaan, beslissers die kwartaalgesprekken overslaan en juniors
sturen, antwoorden die van dezelfde dag naar drie dagen gaan en korter en
formeler worden, verzoeken om minder af te nemen (FirstDistro, Swydo).
ClearlyRated: 39% van de klanten die naar een ander bureau overstappen doet dat
om service failures, niet om prijs. De meest genoemde redenen om detractor te
worden: te weinig kandidaten, slecht passende kandidaten, of niet reageren op
vragen. Dat zijn stuk voor stuk dingen die je in je eigen systeem kunt meten.

**Impact hoog / inspanning midden.** Bouw hem als vijf kolommen met stoplichten,
geen samengestelde score. Een score van 68 zegt Tjerk niets; "21 dagen geen
contact, 2 open opdrachten, 0 voorstellen" zegt hem alles.

---

### 5. De 1040-uursklok en de overnameregeling per klant

**Wat.** Per uitzendkracht bijhouden hoeveel uren er bij die klant gewerkt zijn
tegen de afgesproken drempel, met een melding zodra de klant iemand in dienst wil
nemen vóórdat die drempel gehaald is — en het bedrag dat daar dan bij hoort.

**Waarom.** Dit is direct geld dat anders op tafel blijft liggen. Een klant belt
"we willen Marek overnemen", de AM zegt "prima", en niemand kijkt na hoeveel uren
hij heeft gemaakt. Bij een bureau van vier man zonder back office gebeurt dat
gegarandeerd.

**Bewijs.** Artikel 9a Waadi verbiedt belemmering van indiensttreding — direct
(concurrentiebeding met de uitzendkracht) én indirect (verbod in de
inleenovereenkomst). Lid 2 staat wel een *redelijke vergoeding* toe voor de
gemaakte kosten. Gangbare praktijk volgens meerdere advocatenkantoren: een
vergoeding zolang er nog geen 1.040 uren bij die klant gewerkt zijn, naar rato
van 1.040 min de gewerkte uren. Let op: de redelijkheid wordt per geval
beoordeeld — een vast bedrag zonder relatie tot gemaakte kosten houdt geen stand.

**Impact hoog / inspanning laag.** Een extra veld in `crm_afspraken`
(`overname_uren`, `overname_grondslag`) plus een teller op de plaatsing.

---

### 6. Garantietermijn als lopende klok met zichtbaar risico

**Wat.** `garantie_mnd` en `garantie_soort` staan er al, maar doen niets. Maak er
een aftellende termijn per plaatsing van, met een lijstje "nog in garantie" en
het bedrag dat je terug zou moeten geven als het misgaat.

**Waarom.** Bij W&S is de garantieperiode het venster waarin je fee nog geen fee
is. Als niemand weet wie er nog in garantie loopt, wordt nazorg pas geregeld
nadat de kandidaat is weggelopen. Voor een bureau met vier man is nazorg het
goedkoopste dat er is — één telefoontje in week 3 — en dat telefoontje wordt
alleen gepleegd als hij op een lijst staat.

**Bewijs.** Nederlandse bureau-voorwaarden variëren sterk in wat er dan gebeurt:
vervanging, gedeeltelijke restitutie (bijvoorbeeld de helft terug als er binnen
drie maanden geen vervanger is), soms alleen geldig als de factuur volledig is
betaald (CareerValue, CTRL-F, Active). *Dat er zoveel varianten zijn is precies
het argument om het per klant als gegeven vast te leggen in plaats van als tekst
in een Word-bestand — die redenering is van mij, maar `crm_afspraken` laat zien
dat die conclusie al getrokken is.*

**Impact hoog / inspanning laag.** De gegevens zijn er al; alleen het scherm
ontbreekt.

---

### 7. Herplaatsing: afgewezen bij klant A staat morgen bij klant B op tafel

**Wat.** Een scherm dat kandidaten die in de laatste weken zijn afgevallen naast
de open vacatures van de ándere klanten legt, met de afwijsreden erbij zodat de
recruiter ziet of het aan de persoon lag of aan de klik.

**Waarom.** Dit is de goedkoopste plaatsing die er bestaat: de kandidaat is al
gesproken, al gescreend, al gemotiveerd. Bij 25 klanten in dezelfde sector
overlappen de functieprofielen bovendien sterk — heftruck is heftruck. En de
infrastructuur ligt er al: `crm_trajecten` bewaart afgesloten trajecten met
`reden`, `hoogste_fase`, `naar_klant` en `naar_vacature`. Er wordt alleen niets
mee gedaan aan de voorkant. Er is ook al een `golden`-vlag op kandidaten.

**Bewijs.** Staffing Industry Analysts en Gem beschrijven de silver-medalist-pool
als een van de goedkoopste bronnen: de hiring manager moest één van meerdere
goede kandidaten kiezen, de rest is niet ongeschikt maar tweede. Voor bureaus
specifiek: contractor redeployment en herhaalplaatsingen dragen de omzet, en CRM
is nodig om die pool over maanden warm te houden.

**Impact hoog / inspanning laag.** De data staat er. Dit is een query en een lijst.

---

### 8. Terugkoppelklok: hoe snel reageert déze klant op voorstellen

**Wat.** Per voorstel de tijd meten tot de klant reageert, en het gemiddelde per
klant tonen op de klantkaart.

**Waarom.** Twee vliegen. Het is de scherpste operationele klacht van kandidaten
("ik hoor niks") en tegelijk het eerlijkste signaal over hoe serieus een klant
een opdracht neemt. Een klant die drie weken over een cv doet, heeft geen
urgentie — en die opdracht hoort onderaan Rajesh' lijst, niet bovenaan. *De
koppeling tussen trage feedback en lage prioriteit in de werving is mijn eigen
redenering; wat in de bronnen staat is dat trage feedback een churnsignaal is en
dat commitment van de hiring manager een kwalificatiecriterium is.*

**Bewijs.** FirstDistro/Swydo noemen oplopende responstijden expliciet als
churnsignaal. Top Echelon maakt commitment van de hiring manager tot
kwalificatiecriterium. Firefish en ATZ verkopen hiring-manager-portals juist op
de belofte dat gestructureerde feedback zichtbaar maakt "wat vastzit".

**Impact midden-hoog / inspanning laag.** Twee timestamps op het voorstel.

---

### 9. Veiligheids- en werkplekdossier per klantlocatie

**Wat.** Per klant én per locatie: aard van de werkzaamheden en risico's, of de
RI&E is opgevraagd, welke PBM de klant levert en welke jij, wie de
veiligheidsinstructie geeft, wanneer de laatste werkplekinspectie was, en welke
certificaten er gevraagd worden (VCA-basis, heftruck, reachtruck).

**Waarom.** Dit is de sector-specifieke capability die generieke CRM's missen en
die voor productie/logistiek/industrie het meest telt. Werk je voor
VCA-gecertificeerde klanten, dan is VCU vaak een harde inkoopeis en hoort
werkplekinspectie tot de verplichtingen. Zonder dossier ben je bij de eerste
audit — of het eerste ongeval — afhankelijk van wat iemand zich herinnert.

**Bewijs.** VCU is bedoeld voor uitzendbureaus die mensen naar risicovolle
werkplekken sturen (bouw, industrie, techniek); werkplekinspecties en
-evaluaties horen tot de eisen; de RI&E kan bij de inlener opgevraagd worden
(CertificeringsAdvies, TÜV Nord, Normec). VCU is niet wettelijk verplicht maar
wordt door opdrachtgevers en in aanbestedingen geëist. Los daarvan is de inlener
naast het bureau aansprakelijk voor schade tijdens het werk en wettelijk
aansprakelijk voor arbeidsongevallen (Schravenmade Advocaten) — reden te meer om
de afspraken zwart op wit per locatie te hebben.

**Impact hoog / inspanning midden.** Let op: dit hoort aan de **locatie** te
hangen, niet aan de klant. Eén klant met drie hallen heeft drie risicoprofielen.

---

### 10. Contactpersoon-dekking: wie kennen we hier eigenlijk

**Wat.** Per klant zichtbaar maken hoeveel contactpersonen je hebt, wie de
beslisser is, wanneer je elk van hen voor het laatst sprak, en een waarschuwing
bij klanten waar alles op één persoon leunt.

**Waarom.** Bij 25 klanten is dit een reëel en concreet risico: de
productieleider met wie Tjerk al vier jaar belt vertrekt, en de relatie is weg.
`crm_contacten` heeft al `hoofd` en per-contact-gegevens; wat ontbreekt is de
uitsnede die het risico toont. Bovendien scheelt het bij de overdracht tussen
AM's — nu zit die kennis in twee hoofden.

**Bewijs.** Bullhorn modelleert dit als aparte entiteiten: ClientCorporation is
het bedrijf, ClientContact is elke persoon die je wilt volgen — expliciet "een
hiring manager, HR-medewerker, directielid of andere werknemer", met een eigen
`owner` per contact. Dat een beslisser die zich terugtrekt en juniors stuurt een
churnsignaal is, staat in de churn-literatuur (FirstDistro).

**Impact midden-hoog / inspanning laag.**

---

### 11. Marge-afwijkingssignaal: wat is afgesproken versus wat is gefactureerd

**Wat.** Bij elke plaatsing de gehanteerde fee of het gehanteerde tarief naast de
afspraak in `crm_afspraken` leggen, en afwijkingen tonen.

**Waarom.** Afspraken verwateren in gesprekken. "Doe deze even voor 18%" wordt
een gewoonte en niemand merkt het tot het jaar om is. Bij een bureau waar één
persoon (Tjeerd) de fee-afspraken beheert en drie mensen plaatsingen afronden, is
dit precies de plek waar het schuurt — zeker nu de fee sinds 31 juli 2026
zichtbaar is voor iedereen maar alleen Tjeerd hem mag wijzigen (zie README).

**Bewijs.** *Dit is mijn eigen redenering, gebaseerd op de architectuur die er
al ligt.* De ondersteunende observatie uit de bronnen is dat Bullhorn `feeArrangement`
op ClientCorporation zet en billing-instructies in effectief-gedateerde
`BillingProfileVersion`-records bewaart — dus expliciet vastlegt welke voorwaarde
in welke periode gold. Dat is dezelfde gedachte als `ingang`/`einde` in
`crm_afspraken`; de vergelijking met de werkelijkheid ontbreekt nog.

**Impact midden-hoog / inspanning laag.**

---

### 12. Betaalgedrag en kredietplafond per klant

**Wat.** Per klant: afgesproken betaaltermijn, feitelijke gemiddelde betaaltermijn,
openstaand bedrag, en een zelf ingesteld plafond waarboven het systeem
waarschuwt voordat je nog een uitzendkracht plaatst.

**Waarom.** Bij uitzenden loop je voor op je klant: je betaalt loon voor je
gefactureerd hebt, laat staan geïnd. Eén klant met tien uitzendkrachten die
omvalt, kan een bureau van vier man raken. Voor W&S is het risico kleiner maar
het signaal even nuttig.

**Bewijs.** Kredietverzekeraars stellen per debiteur een limiet vast en eisen
doorgaans een maximale betaaltermijn van 90 dagen, zorgvuldig debiteurenbeheer en
tijdige melding bij achterstand. Oplopende betaaltermijnen (van 10 naar 30+
dagen) staan ook in de churn-literatuur als vroegsignaal — een klant die je later
betaalt is vaak een klant die aan het afscheid nemen is.

**Impact midden / inspanning midden.** De koppeling met de finance-app bestaat
al; hier hoeft alleen het per-klant-beeld te komen, zonder bedragen te lekken
naar wie ze niet mag zien.

---

### 13. Positie per opdracht: exclusief, gedeeld, of vechten met vier bureaus

**Wat.** Op de vacature vastleggen of je exclusief werkt, hoeveel bureaus er nog
meer op zitten, en of je als eerste of als vierde bent gebeld — en dat
meewegen in de prioritering van Rajesh' werk.

**Waarom.** Dit bepaalt de verwachte opbrengst per gewerkt uur meer dan wat ook.
Een gedeelde opdracht waar drie bureaus op zitten is statistisch een kwart
opdracht. `crm_afspraken.exclusiviteit_wkn` bestaat al op klantniveau, maar
exclusiviteit is in de praktijk een afspraak per opdracht.

**Bewijs.** Bij contingency werken doorgaans meerdere bureaus tegelijk aan
dezelfde rol en sturen ze allemaal meerdere cv's; bij retained/exclusief werk je
als enige extern. Fees weerspiegelen dat verschil direct: retained 30–35%,
contingency doorgaans rond 20% (TalentRise, BANKW). Nederlandse
bureauvoorwaarden zeggen vaak expliciet dat exclusiviteit *niet* geldt tenzij
uitdrukkelijk overeengekomen (CareerValue).

**Impact midden / inspanning laag.** Eén veld en een filter.

---

### 14. Wtta-dossier: bewijs van toelating richting je klanten

**Wat.** Per klant bijhouden welk compliance-bewijs je wanneer hebt aangeleverd
(toelating, SNA/NEN 4400, VCU, G-rekening-gegevens, verzekering), met
verloopdatums en een taak die vanzelf terugkomt.

**Waarom.** Vanaf 1 januari 2027 mogen uitleners alleen nog met toelating
uitlenen, en vanaf 1 januari 2028 mogen **inleners** alleen nog met toegelaten
uitleners werken — met boetes tot €90.000 voor de inlener. Je klanten gaan hier
in 2027 om vragen, allemaal, in dezelfde paar maanden. Wie dat dan met één klik
kan leveren, komt professioneel over bij precies de klanten die op dat moment
hun leveranciersbestand aan het opschonen zijn. Wie het per e-mail moet gaan
zoeken, valt af.

**Bewijs.** Wtta: inwerkingtreding 1 januari 2027, handhaving door de
Arbeidsinspectie vanaf 1 januari 2028; registratie bij de NAU vóór 1 januari
2027; inleners moeten verifiëren in het openbare register; boete tot €90.000
(Rijksoverheid, Nederlandse Arbeidsinspectie, Houthoff, Datachecker).

**Impact midden / inspanning laag.** Nu laag geprioriteerd omdat het pas in 2027
speelt — maar het is een agendapunt, geen bouwwerk: begin met een documentenmap
per klant en een datum.

---

### 15. Kwartaalgesprek met vaste agenda en vastgelegde uitkomst

**Wat.** Een terugkerende afspraak per A-klant met een korte vaste agenda
(volume komend kwartaal, wat ging goed en fout, tarieven, wie beslist er nu) en
de uitkomst als notitie op de klantkaart.

**Waarom.** Vier man, 25 klanten: dat is per AM ongeveer één gesprek per week als
je de grootste tien doet. Volstrekt haalbaar, en het verschil tussen reageren op
aanvragen en sturen op een portefeuille. `crm_taken` en `crm_activiteiten` kunnen
dit dragen zonder nieuwe tabel.

**Bewijs.** Dat beslissers wegblijven bij kwartaalgesprekken geldt als
churnsignaal (FirstDistro) — wat impliceert dat het gesprek bestaat. *Dat vier
man met 25 klanten dit kunnen volhouden is mijn eigen rekensom.*

**Impact midden / inspanning laag.**

---

### 16. Eén korte tevredenheidsvraag na elke plaatsing

**Wat.** Twee weken na de start één vraag aan de hiring manager ("hoe waarschijnlijk
is het dat je ons aanbeveelt?") plus een open veld, opgeslagen bij de klant.

**Waarom.** Bij 25 klanten is dit geen statistiek maar een aanleiding om te
bellen. De waarde zit in het open veld, niet in het cijfer. Op de klantkaart
zitten al "evaluaties" — dit is de klantkant daarvan.

**Bewijs.** De branche-NPS voor staffingklanten staat op 45; 50+ geldt als goed,
70+ als top (ClearlyRated). Klanten van bekroonde bureaus zijn 50% vaker volledig
tevreden. **Kritisch: bij 25 klanten is een NPS statistisch betekenisloos** —
drie detractors verschuiven je score met tientallen punten. Bouw het als
signaallijst, niet als score, en zet het benchmarkgetal er niet bij.

**Impact midden / inspanning laag.**

---

### 17. Portefeuillebalans: hoeveel hangt er aan je grootste klant

**Wat.** Eén weergave: omzet en plaatsingen per klant als aandeel van het totaal,
per AM.

**Waarom.** Met 25 klanten en vier man is concentratie het stilste risico dat er
is. Als klant nummer één 30% van de omzet is, is de vraag niet of de relatie
goed is maar wat er gebeurt als hun inkoop verandert. Ook nuttig als
verdelingsgesprek tussen Tjeerd en Tjerk.

**Bewijs.** *Eigen redenering.* Wat uit de bronnen komt is de kostenkant van
churn — dat het verliezen van een bestaande klant duurder is dan het binnenhalen
van een nieuwe (ClearlyRated) — wat bij een kleine portefeuille zwaarder weegt
naarmate één klant groter is.

**Impact midden / inspanning laag.** Deels afgedekt door de Performance-module;
controleer eerst wat daar al staat voordat je bouwt.

---

### 18. Vacature-doorlooptijd per klant, niet per recruiter

**Wat.** Time-to-fill en het aantal voorstellen per plaatsing uitgesplitst per
klant, met de reden bij niet-vervulde opdrachten.

**Waarom.** Dit is het gesprek met de klant, niet met Rajesh. "Bij jullie hebben
we gemiddeld vier voorstellen nodig en bij de rest twee" is een openingszin voor
een tariefgesprek of een eisen-gesprek. Zonder deze uitsplitsing wordt een
moeilijke klant altijd een recruiterprobleem.

**Bewijs.** Submit-to-interview ligt in staffing gemiddeld op ongeveer 3:1;
interview-to-hire rond 27%; time-to-fill in productie loopt op tot 55 dagen
(SHRM 2025 via CareerPlug, iSmartRecruit). Behandel die getallen als grove
oriëntatie — het zijn Amerikaanse cijfers over andere functieniveaus.

**Impact midden / inspanning laag.**

---

### 19. De klantkaart als één A4 dat je vlak voor een gesprek openslaat

**Wat.** Bovenaan de klantkaart een blok van tien regels: eigenaar, laatste
contact, open opdrachten, plaatsingen dit jaar, actieve uitzendkrachten,
fee-afspraak, betaalgedrag, wie in garantie loopt, laatste evaluatie, en de
eerstvolgende afspraak.

**Waarom.** De kaart heeft nu vijf tabs. Dat is prima om in te werken en
ongeschikt om in de auto op te slaan vijf minuten voor een bezoek. De informatie
staat er al; het gaat om de samenvatting bovenaan. *Eigen redenering, maar in
lijn met de opmerking in `js/klanten.js` dat de kaart "bewust rustig" is —
dit is die gedachte doorgetrokken.*

**Impact midden / inspanning laag.**

---

### 20. Klantnotitie met verplicht vervolg

**Wat.** Bij het loggen van een klantcontact standaard de vraag: wat is de
volgende stap en wanneer. Geen datum invullen kan, maar dan verschijnt de klant
in de radar bij 4.

**Waarom.** Dit is de goedkoopste discipline die er is, en de enige die bij vier
man daadwerkelijk het verschil maakt tussen een CRM en een logboek.
`crm_activiteiten` en `crm_taken` bestaan al naast elkaar — dit koppelt ze.

**Bewijs.** Carerix bouwt zijn hele relatiebeheer om het registreren van
contactmomenten (bellen, mail, WhatsApp, bezoek) met automatische koppeling aan
het juiste dossier; OTYS koppelt aan elke relatie een activiteitenlijst met
herinneringen. *Dat de herinnering verplicht moet zijn in plaats van optioneel is
mijn eigen conclusie.*

**Impact midden / inspanning laag.**

---

## Wat je niet moet bouwen

Standaardfunctionaliteit uit de grote pakketten die hier weinig tot niets
toevoegt. Ik noem ze expliciet omdat ze er in elke featurelijst staan en tijd
zullen opeisen.

**Klantportaal / hiring-manager-portal.** Firefish, ATZ en anderen verkopen dit
als kernfunctie: de klant logt in, ziet shortlists, geeft gestructureerde
feedback. Bij 25 klanten in productie en logistiek gaat niemand inloggen. De
productieleider reageert op WhatsApp of neemt de telefoon op. Bouw in plaats
daarvan capability 8: meet de terugkoppeltijd van zijn appjes en mailtjes. Een
portaal met drie actieve gebruikers is een onderhoudslast, geen dienstverlening.

**Een uitgebreide sales-pijplijn met veel fases en gewogen forecasting.**
`crm_kansen` heeft al `kans_pct`, `waarde` en `sluit_datum`. Dat is genoeg. Een
forecast op 25 klanten is een gevoel met een decimaal erachter. Tjeerd weet welke
deal gaat komen; het systeem hoeft dat niet uit te rekenen.

**Moederbedrijf-/dochterhiërarchieën.** Bullhorn heeft `parentClientCorporation`
en `childClientCorporations`. Dat is er voor bureaus die aan concerns leveren
met raamcontracten op holdingniveau. Voor dit klantenbestand: los het op met een
veld "onderdeel van" als het ooit speelt.

**Volledige mailbox-synchronisatie.** De verleiding is groot omdat er al een
Outlook-koppeling ligt. Maar alle mail automatisch aan klanten hangen levert
ruis op waar niemand doorheen leest, plus een AVG-vraagstuk over wat je precies
bewaart. Beter: handmatig een mail vastpinnen als hij ertoe doet.

**Automatische verrijking en dedupe-diensten.** Kost geld (tegen de afspraak) en
is bij 25 klanten sneller met de hand gedaan.

**Een samengestelde klant-gezondheidsscore.** De literatuur adviseert 10 tot 15
gewogen signalen. Dat werkt bij honderden accounts en niet bij 25 waar de AM de
naam van de bedrijfsleider uit zijn hoofd kent. Vijf losse stoplichten (zie 4)
geven hetzelfde inzicht en zijn uitlegbaar. Een score van 68 is dat niet.

**Activiteitenquota en bel-scores per medewerker.** Werkt in call-center-achtige
bureaus met twintig recruiters. In een team van vier ondermijnt het vertrouwen
meer dan het oplevert.

---

## Kort samengevat

De vijf dingen die er voor Ploeggenoten het meest uit springen:

1. **Opdracht-intake mét de klant** — het grootste gat in het huidige systeem;
   "intake" betekent nu uitsluitend kandidaat.
2. **Arbeidsvoorwaardenpakket per klant vastleggen** — wettelijke
   verantwoordelijkheid van de opdrachtgever, jouw naheffing als het misgaat.
3. **Tariefkaart en marge bij uitzenden** — 2026 verandert de kostprijs; de
   W&S-kant is goed geregeld, de uitzendkant nauwelijks.
4. **Klantradar met vijf stoplichten** — geen model, gewoon zichtbaar maken wat
   je zelf ook zou zien.
5. **Herplaatsing activeren** — `crm_trajecten` bewaart al de gegevens; er wordt
   alleen nog niets mee gedaan.

En één ding om niet te doen: geen klantportaal.

---

## Bronnen

Systeemarchitectuur en objecten
- [Bullhorn REST API Entity Reference](https://bullhorn.github.io/rest-api-docs/entityref.html)
- [Bullhorn Platform](https://www.bullhorn.com/products/bullhorn-platform/)
- [Bullhorn & Staffing Glossary — Broad & Madison](https://www.broadandmadison.com/bullhorn-staffing-glossary)
- [Carerix — CRM voor recruitment](https://carerix.com/themas/crm-voor-recruitment/)
- [Carerix — software voor uitzendbureaus](https://carerix.com/software-voor-uitzendbureaus/)
- [OTYS CRM-module](https://www.otys.be/voor-wie/corporate-recruitment)
- [Firefish — Hiring Manager Portal](https://www.firefishsoftware.com/product/hiring-manager-portal)
- [ATZ — Recruitment client portal](https://atzcrm.com/blog/recruitment-client-portal/)

Vacature-intake en opdrachtkwalificatie
- [Werf& — de 10 belangrijkste vragen bij een vacature-intake](https://www.werf-en.nl/de-10-belangrijkste-vragen-bij-een-vacature-intake/)
- [HetRecruitingKantoor — de tien belangrijkste vragen](https://hetrecruitingkantoor.nl/recruitment-basics/de-tien-belangrijkste-vragen-van-de-vacature-intake/)
- [OnePS — 45 vragen aan een opdrachtgever](https://www.oneps.nl/45-vragen-die-je-als-recruiter-kunt-stellen-aan-een-klant/)
- [Top Echelon — Job Orders: qualifying search assignments](https://topechelon.com/placement-process/job-orders-the-recruiters-guide-to-qualifying-search-assignments/)
- [Liberty Staffing — The Perfect Job Order](https://www.libertystaffingusa.com/the-perfect-job-order-a-simple-checklist-to-speed-up-fill-rates/)

Beloning, tarieven en marge
- [SUSA — van inlenersbeloning naar gelijkwaardige arbeidsvoorwaarden (Waadi art. 12a)](https://www.susa.nl/werkgevers/kennisbank/blog/van-inlenersbeloning-naar-gelijkwaardige-arbeidsvoorwaarden-in-de-abu-cao-2026-zo-pak-je-het-goed-aan)
- [Randstad — verplichtingen voor inleners](https://www.randstad.nl/werkgevers/werkpocket/aannemen-en-contracten/personeel-aannemen/verplichtingen-voor-inleners)
- [Robert Half — ABU-cao 2026](https://www.roberthalf.com/nl/nl/inzichten/management-tips/abu-cao-voor-uitzendkrachten)
- [Recruitmenttraining.pro — omrekenfactor 2026](https://recruitmenttraining.pro/nieuws/kosten-uitzendkracht-omrekenfactor/)
- [Flexpedia — kostprijscalculator 2026](https://www.flexpedia.nl/tarieven/uitzenden/kostprijscalculator-2026/)

Commerciële afspraken en juridisch
- [MKB Juristen — artikel 9a Waadi en het belemmeringsverbod](https://mkbjuristen.nl/blog/financieel/tiende-verjaardag-van-artikel-9a-waadi/)
- [Snijders Advocaten — het belemmeringsverbod](https://www.snijders-advocaten.nl/actueel/het-belemmeringsverbod/)
- [CareerValue — werving- en selectievoorwaarden](https://www.careervalue.nl/wervingsvoorwaarden/werving-selectie-voorwaarden/)
- [TalentRise — contingent vs retained search](https://www.talentrise.com/contingent-vs-retained-search-whats-the-difference/)
- [Flexhub — de inleenovereenkomst voor uitzendbureaus](https://flexhub.nl/kennisbank/de-inleenovereenkomst-voor-uitzendbureaus/)
- [Schravenmade Advocaten — uitzendkrachten en arbeidsomstandigheden](https://schravenmade.nl/inschakeling-van-uitzendkrachten-arbeidsomstandigheden/)

Compliance en veiligheid
- [Rijksoverheid — Wtta](https://www.rijksoverheid.nl/themas/werk/hervormingen-arbeidsmarkt/aanpak-missstanden-bij-uitzendbureaus-en-andere-uitleners)
- [Nederlandse Arbeidsinspectie — Wtta](https://www.nlarbeidsinspectie.nl/onderwerpen/wet-toelating-terbeschikkingstelling-van-arbeidskrachten/wet-toelating-terbeschikkingstelling-van-arbeidskrachten1)
- [Houthoff — overzicht Wtta](https://www.houthoff.com/nl/insights/news/overview-of-the-provision-of-personnel-accreditation-act/)
- [Datachecker — Wtta toelatingsplicht per 2027](https://datachecker.nl/blog/wtta-wet-toelatingsplicht-uitzendbureaus/)
- [CertificeringsAdvies — wat is VCU](https://certificeringsadvies.nl/wat-is-vcu/)
- [TÜV Nord — VCU-certificering](https://www.tuv.nl/nl/diensten-en-certificeringen/veiligheids-en-arbocertificeringen/vcu-certificering/)

Accountmanagement, churn en KPI's
- [ClearlyRated — the cost of client churn in staffing](https://knowledge.clearlyrated.com/blog/the-cost-of-client-churn-in-staffing-and-how-to-stop-it/)
- [ClearlyRated — service quality in staffing firms](https://www.clearlyrated.com/blog/service-quality-in-staffing-firms)
- [ClearlyRated — NPS-benchmarks staffing](https://www.clearlyrated.ai/industry-benchmark/nps-benchmarks-for-the-staffing-industry)
- [FirstDistro — customer health score, churn risk signals](https://firstdistro.com/learn/customer-health-score)
- [Swydo — client churn KPIs](https://www.swydo.com/blog/client-churn-kpis/)
- [altLINE — 20 staffing agency KPIs](https://altline.sobanco.com/staffing-agency-kpis/)
- [Oorwin — fill rate in staffing](https://oorwin.ai/glossary/fill-rate-in-staffing/)
- [CareerPlug — recruiting metrics & benchmarks 2025](https://www.careerplug.com/recruiting-metrics-and-kpis/)
- [iSmartRecruit — recruiting KPIs](https://www.ismartrecruit.com/blog-recruiting-kpis-for-recruiters)

Herplaatsing
- [Staffing Industry Analysts — silver is the new gold](https://www.staffingindustry.com/Publications/CWS-3.0/Archive/2014/July-2014/July-2-2014/Silver-is-the-new-gold-Leveraging-your-second-place-candidates)
- [LinkedIn Talent Blog — recruiting silver medalists](https://www.linkedin.com/business/talent/blog/talent-acquisition/recruiting-silver-medalists)
- [Gem — rediscover & re-engage silver medalists](https://www.gem.com/blog/silver-medalists-candidate-rediscovery)

Debiteuren
- [De Kredietverzekeraars — kredietverzekering uitzendbureau](https://www.dekredietverzekeraars.nl/branches/kredietverzekering-uitzendbureau/)
- [Bibby — financiering voor uitzendbureaus](https://www.bibbyfinancialservices.nl/financiering-voor-uitzendbureaus-en-recruitmentbedrijven)
