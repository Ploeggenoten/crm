# Wat moet een ATS kunnen — voor Ploeggenoten

Onderzoek, 2 augustus 2026. Bronnen onderaan, met per punt een eerlijk oordeel
over hoe hard ze zijn.

---

## De rekensom die de hele prioritering bepaalt

Zet de getallen naast elkaar, want ze veranderen wat een ATS hier moet zijn.

- ~1.000 leads per week = ~52.000 per jaar = ~200 per werkdag.
- Doel 75 plaatsingen in 2026. Dat is **0,14% van lead tot plaatsing**, oftewel
  ongeveer **700 leads per plaatsing**.
- Ter vergelijking: de brancheteller voor sollicitatie-tot-aanname ligt rond
  0,6%, ongeveer 95 sollicitanten per aanname. Dat is een andere orde van
  grootte. Meta-leads zijn geen sollicitanten — het zijn drie tikjes op een
  telefoon.
- Eén recruiter. 200 nummers per dag bellen is bij een gebruikelijke
  bereikkans van rond de 10% op de eerste poging al vier tot zes uur puur
  draaien, zonder intakes, zonder terugbellen, zonder administratie.

**Conclusie: het lek zit niet in de pijplijn, het zit in de eerste 48 uur na
binnenkomst.** Een klassiek ATS is gebouwd voor de fase ná de sollicitatie —
kandidaat door de stappen slepen, feedback verzamelen, rapporteren. Precies die
fase is hier het minst het probleem. Wat hier telt is triage bij volume:
ontdubbelen, direct reageren, automatisch kwalificeren, en de schaarse
beluren van één recruiter op de juiste 40 nummers per dag richten.

Die redenering is van mij, opgebouwd uit jullie eigen getallen plus de
benchmarks hieronder. Het is geen citaat uit een rapport.

---

## Wat elk modern ATS heeft, en waarom

Kijk je naar Bullhorn, Loxo, Ashby, Recruitee, Homerun, Carerix, OTYS en
JobDiva, dan zit in álle acht dezelfde kern:

1. Kandidatendatabase met zoeken
2. Vacature-/opdrachtbeheer
3. Aanpasbare pijplijnfases
4. CV-parsing
5. Vacaturepublicatie en werkenbij-pagina
6. E-mailsjablonen en communicatie vanuit het systeem
7. Agenda- en gesprekplanning
8. Samenwerking: notities, taken, eigenaarschap
9. Rapportage
10. AVG/beveiliging

Waarom juist deze tien? Omdat ze allemaal zijn ontworpen rond hetzelfde
uitgangspunt: *een kandidaat solliciteert met een CV op een vacature en wordt
door een team beoordeeld*. Elk van de tien is een stap in dat verhaal. Bij
volumewerving met blue-collar kandidaten klopt dat uitgangspunt maar half —
er is geen CV, er is geen team dat beoordeelt, en de kandidaat solliciteert op
vier bureaus tegelijk. Daarom is "wat elk pakket heeft" hier een slechte
boodschappenlijst.

---

## De lijst

Gesorteerd op wat dit bureau er het meeste aan heeft. Bij elk punt:
**wat · waarom hier · bewijs · impact/inspanning**.

---

### 1. Automatisch eerste contact binnen minuten, via WhatsApp — niet bellen

**Wat.** Elke binnenkomende lead krijgt binnen enkele minuten automatisch een
bericht: welke vacature, één of twee kwalificerende vragen, en een manier om te
reageren.

**Waarom hier.** Dit is het enige antwoord op de rekensom hierboven. Eén
recruiter kan 200 leads per dag niet bellen, maar wel de 30 terugbellen die
zelf hebben geantwoord. Het draait de trechter om: in plaats van dat Rajesh
kwalificeert, kwalificeert de kandidaat zichzelf. En omdat een Meta-lead in
drie tikjes is ingevuld, is de intentie laag en de houdbaarheid kort — dezelfde
persoon vult die dag nog twee andere formulieren in.

**Bewijs.** Het MIT/InsideSales-onderzoek van Oldroyd (3 jaar data, 6 bedrijven,
15.000+ leads, 100.000+ belpogingen) vond dat contact binnen 5 minuten 21× meer
kwalificaties oplevert dan wachten tot 30 minuten. Dat is het hardste cijfer in
dit hele rapport, maar let op: het komt uit B2B-sales, niet uit recruitment, en
het is uit 2007. De HBR-audit van 2.241 bedrijven (2011) laat zien hoe zeldzaam
snelheid is: gemiddelde reactietijd 42 uur, 23% reageert nooit. Workable's
"two-day rule" zegt hetzelfde in recruitmenttermen — de meeste kandidaten die
een baan aannemen, hoorden binnen twee dagen iets. De SMS-cijfers die
leveranciers rondstrooien (98% open rate, 45% response) zijn marketing zonder
methodologie; niet op vertrouwen, wel als richting.

**Impact/inspanning.** Impact hoog — dit is het punt met het grootste verschil.
Inspanning midden tot hoog: WhatsApp Business API loopt via een BSP, kost in
Nederland ruwweg €0,05–0,15 per gesprek plus een platformabonnement, en
sjablonen moeten vooraf door Meta worden goedgekeurd (1–3 werkdagen). Bij 1.000
leads per week is dat €50–150 per week aan gesprekskosten — reken dat af tegen
wat de advertenties nu kosten, niet tegen nul. Dit botst met "alles gratis" en
dat is een bewuste afweging waard.

---

### 2. Ontdubbelen op telefoonnummer, genormaliseerd

**Wat.** Elk nummer wordt bij binnenkomst omgezet naar één vorm (E.164: +316…)
en gematcht tegen alles wat er al is. Een bestaande lead krijgt geen nieuwe
kaart maar een nieuwe regel op de bestaande tijdlijn.

**Waarom hier.** Het telefoonnummer is het énige unieke veld dat jullie hebben.
Zonder normalisatie zijn `06-12345678`, `0612345678`, `+31612345678` en
`0031 6 12 34 56 78` vier verschillende kandidaten. Bij 52.000 leads per jaar en
herhaald adverteren op dezelfde doelgroep vul je je database met dezelfde
mensen. Twee gevolgen die allebei direct geld kosten: Rajesh belt mensen die
vorige maand al "nee" zeiden, en de kosten-per-plaatsing per advertentie
kloppen niet omdat de noemer is opgeblazen.

**Bewijs.** Ontdubbelen zit in elk ATS, maar meestal op e-mailadres — Workable
matcht zelfs uitsluitend op e-mail. Dat is hier per definitie waardeloos, want
jullie krijgen geen e-mailadres. Dat telefoonnormalisatie plus fuzzy
naammatching de juiste techniek is, staat beschreven in leveranciersdocumentatie
(Manatal, 100hires, DataTrim): hard genoeg voor het *hoe*, niet voor het
*hoeveel*. Dat het in de praktijk misgaat is wél door echte gebruikers
opgetekend: een Bullhorn-gebruiker op Capterra schrijft dat het systeem haar
regelmatig bestanden laat samenvoegen. De vaak geciteerde "13 uur per recruiter
per jaar aan dubbelen" komt uit een leveranciersblog zonder methode — niet
gebruiken.

**Impact/inspanning.** Impact hoog, inspanning laag. **Dit is de beste
verhouding op de hele lijst.** Een normalisatiefunctie en een unieke index in
Supabase, plus een samenvoegscherm. Doe dit eerst.

---

### 3. Eén werkvoorraad met verplichte uitkomst en automatisch geplande
volgende poging

**Wat.** Geen lijst maar een wachtrij: het systeem bepaalt wie vandaag gebeld
wordt, elke poging wordt geteld en gelogd, en na "geen gehoor" plant het zelf de
volgende poging op een ander tijdstip.

**Waarom hier.** Jullie hebben de statuslijst al ("Nieuw" als werkvoorraad, met
opvolgdatum en eigenaar — goed bedacht). Wat ontbreekt is de *pogingteller* en
het automatisch herplannen. Als je een lead na één keer geen gehoor laat liggen,
gooi je het grootste deel van je advertentiegeld weg: je hebt betaald voor het
nummer en het één keer geprobeerd. Even belangrijk is de bovenkant: bij 200
leads per dag moet het systeem een *plafond* stellen — de beste 40, niet alle
200 — anders werkt niemand de lijst ooit af en wordt "Nieuw" alsnog een archief.

**Bewijs.** Cognism's dataset (2025) claimt 93% van de gesprekken bij de derde
poging en 98,6% bij de vijfde; Bullhorn's eigen blog noemt dinsdag als beste
beldag en nog 5% kans op de tiende poging. Beide zijn leveranciersdata zonder
publieke methodologie — richtinggevend, niet bewijzend. De koppeling met
advertentiekosten is mijn eigen redenering.

**Impact/inspanning.** Impact hoog, inspanning laag tot midden. Grotendeels een
uitbreiding van wat er al staat.

---

### 4. Knock-outvelden als data, niet als notitie

**Wat.** Zes tot acht velden die in productie en logistiek bepalen of iemand
plaatsbaar is, vastgelegd als velden waarop je kunt filteren: eigen vervoer
(en zo niet: reisafstand/woonplaats), bereid tot ploegendienst, taalniveau
NL/EN, certificaten (VCA, heftruck, reachtruck), beschikbaar vanaf welke datum,
huisvesting nodig ja/nee, en full-time/parttime.

**Waarom hier.** Een CV zegt in dit segment vrijwel niets; deze zes velden
zeggen alles. Staan ze in een vrije notitie, dan kun je niet matchen, niet
filteren en de pool niet hergebruiken (punt 5 valt dan om). Bovendien kunnen
precies deze vragen door de WhatsApp-flow van punt 1 worden gesteld, vóórdat er
één minuut recruitertijd in gaat.

**Bewijs.** Nederlandse uitzendbureaus in dit segment noemen consistent deze
criteria: ploegendienst en voldoende NL of EN, vervoer regelen voor wie het niet
heeft, VCA als belangrijkste certificaat in productie, heftruckcertificaat als
harde eis voor magazijnwerk. Dat zijn commerciële sites (Prestatie, Faam,
OrangeJobs), dus zwak als bron, maar ze zeggen alle drie hetzelfde en het is
verifieerbaar tegen jullie eigen vacatures. Dat een blue-collar-trechter kort
moet zijn is beter onderbouwd: vier tot zes invoerschermen, onder de twee
minuten totaal, daarboven zakt de voltooiing in — ook dat komt van een
leverancier (Heyflow), maar sluit aan bij het bredere punt dat white-collar
processen op blue-collar rollen structureel meer uitval geven.

**Impact/inspanning.** Impact hoog, inspanning laag. Velden plus filters. De
kunst is beperken: acht velden, niet twintig.

---

### 5. De eigen kandidatenpool doorzoeken vóór je adverteert

**Wat.** Bij een nieuwe vacature eerst een gerichte zoekopdracht op de bestaande
pool met de velden uit punt 4, inclusief iedereen die eerder afviel om een reden
die nu niet meer telt.

**Waarom hier.** Jullie kopen elke week 1.000 leads en plaatsen er anderhalf.
De overige 998 zijn betaald en liggen stil. Binnen een kwartaal is die pool
groter dan wat Meta in een week levert — en die mensen zijn al eens
gekwalificeerd. Voor productie en logistiek is dat extra sterk omdat mensen
tussen opdrachten door weer beschikbaar komen; verloop van 70–100% per jaar is
in dit segment normaal.

**Bewijs.** Bullhorn's GRID 2026 (bijna 2.300 respondenten wereldwijd) meldt dat
de meest frequente herplaatsers twee keer zo vaak tot de sterkste omzetgroeiers
behoren, en dat 85% van de bureaus mét een herplaatsingsplan onder de 20 dagen
time-to-place zit. Het is leveranciersonderzoek, maar groot, jaarlijks herhaald
en consistent — de beste beschikbare bron in deze branche. De rondzingende
cijfers "46% tot 71% van alle plaatsingen komt uit de bestaande database" komen
uit leveranciersblogs zonder methode; de richting klopt, het getal niet
vertrouwen.

**Waarschuwing.** Dit werkt alléén als punt 4 er is. Zoeken is precies wat in
bestaande ATS'en het vaakst stuk is: Capterra staat vol met recruiters die hun
eigen database niet doorzoekbaar krijgen — "de zoekopdrachten zijn onnauwkeurig"
(Bullhorn), "geeft geen accurate resultaten bij meer dan één filter tegelijk"
(Bullhorn), "moeilijk booleaans zoeken" (OTYS, van een Nederlandse
bureau-eigenaar). Een database die je niet kunt doorzoeken is geen bezit.

**Impact/inspanning.** Impact hoog, inspanning midden.

---

### 6. Bevestiging en herinneringen rond afspraken — vooral de eerste werkdag

**Wat.** Automatische bevestiging bij het maken van een afspraak, herinnering
24 uur en 1 uur vooraf, en een aparte reeks tussen tekenen en de eerste
werkdag: adres, tijd, contactpersoon, wat mee te nemen.

**Waarom hier.** Een no-show op de eerste werkdag is de duurste uitval die er
is — alle kosten zijn gemaakt, de fee is bijna verdiend, en je beschadigt de
klantrelatie in plaats van alleen je eigen dag. Bij plaatsing bij productie- en
logistiekklanten die je vaker wilt bedienen, telt dat dubbel.

**Bewijs.** Hier moet ik voorzichtig zijn. Het rondzingende Nederlandse cijfer
"28% verscheen nooit op de eerste werkdag" (Flexnieuws, juli 2025) heb ik
opgezocht: **het artikel noemt geen bron, geen steekproef, geen methode.** Niet
citeren. Internationaal is het beter: Criteria's kandidaat-ervaringsonderzoek
komt op 22% dag-één-no-shows, en 89% van de werkgevers zegt het mee te maken —
enquêtedata, dus zwak-tot-midden. De claim dat geautomatiseerde bevestiging
no-shows met 25–40% terugbrengt komt uit leverancierscases (JobTalk AI, een
Amerikaans light-industrial-bureau) — dat is verkoopmateriaal, geen bewijs. Wat
overeind blijft: het effect bestaat, de grootte kent niemand.

**Impact/inspanning.** Impact hoog, inspanning laag — als punt 1 er staat, is
dit dezelfde infrastructuur met een andere trigger.

---

### 7. Kosten per plaatsing per advertentie en per vacature

**Wat.** De keten advertentie → lead → gesprek → intake → voorgesteld → gestart,
doorgerekend naar euro's per plaatsing, per advertentie en per vacaturesoort.

**Waarom hier.** Dit is de enige knop waarmee Bryan het budget kan sturen. Bij
700 leads per plaatsing is het verschil tussen een advertentie van 400 en één
van 1.100 leads per plaatsing het hele verdienmodel. Jullie hebben de keten al
in de Marketing-module; wat het scherper maakt is dat het per advertentie moet,
op ontdubbelde leads (punt 2), anders meet je je eigen dubbeltellingen.

**Bewijs.** Eigen redenering, plus één richtinggevend extern gegeven: Meta's
instant forms converteren volgens marktdata rond de 2% naar afspraak, tegen
~17% voor leads via een landingspagina. Dat is een leveranciersgetal en niet
generaliseerbaar, maar het maakt wel het punt: *hoe* je de lead binnenhaalt
verandert de kwaliteit met een factor, en zonder meting per advertentie zie je
dat nooit.

**Impact/inspanning.** Impact hoog, inspanning laag tot midden — het meeste
staat er al.

---

### 8. Beschikbaarheid en startdatum als eersteklas veld

**Wat.** "Beschikbaar vanaf" als datumveld op elke kandidaat, met een vaste
lijst "wie kan maandag starten".

**Waarom hier.** Klanten in productie en logistiek vragen zelden om de béste
kandidaat; ze vragen om drie mensen die maandag om 6 uur klaarstaan. Een ATS dat
sorteert op geschiktheid en niet op beschikbaarheid, beantwoordt de verkeerde
vraag. Het is ook het veld dat het snelst veroudert — reden om het bij elk
contactmoment opnieuw te vragen (kan automatisch, via punt 1).

**Bewijs.** Eigen redenering, ondersteund door wat Nederlandse bureaus zelf als
plaatsingsfactoren noemen: directe beschikbaarheid, complete papieren, en
actuele vraag — met een geldig heftruckcertificaat "vaak binnen 48 uur aan de
slag". Commerciële bron, maar het beschrijft de praktijk die jullie kennen.

**Impact/inspanning.** Impact midden-hoog, inspanning laag.

---

### 9. Volledige tijdlijn per kandidaat, inclusief álle berichten

**Wat.** Elk gesprek, elk WhatsApp-bericht, elke belpoging en elke notitie op
één tijdlijn in het systeem — niet in de privételefoon van de recruiter.

**Waarom hier.** Nu is WhatsApp een snelkoppeling: je klikt en verlaat het CRM.
Dat betekent dat de gespreksgeschiedenis van 52.000 kandidaten in één telefoon
zit. Bij vier mensen en één recruiter is dat een enkelvoudig faalpunt — bij
ziekte, vakantie of vertrek is het weg, en je kunt een kandidaat niet overdragen
aan Tjerk zonder te bellen en te vragen "wat had je ook alweer afgesproken".

**Bewijs.** Recruitmenttech.nl (Nederlandse vakpers, redelijk betrouwbaar) zegt
precies dit: los WhatsApp-gebruik mist workflow, en integratie in het ATS maakt
gesprekken overdraagbaar tussen teamleden. Hetzelfde artikel wijst op de
AVG-kant: de organisatie moet vastleggen wie toegang heeft, waarom berichten
bewaard worden en wanneer ze verdwijnen — dat is jullie verantwoordelijkheid,
niet die van de koppeling. Carerix, OTYS, Mysolution en Ubeeo hebben dit
allemaal ingebouwd; het is dus een verwachting in de Nederlandse markt, geen
luxe.

**Impact/inspanning.** Impact hoog, inspanning midden. Komt grotendeels gratis
mee met punt 1.

---

### 10. Niet-bellen-lijst: opt-out, blokkade en herhaalde no-show

**Wat.** Eén lijst met redenen: kandidaat heeft afgemeld, klant wil deze persoon
niet meer, twee keer niet komen opdagen. Het systeem weigert die nummers in de
werkvoorraad en in elke automatische reeks.

**Waarom hier.** Bij 52.000 leads per jaar en herhaald adverteren op dezelfde
doelgroep bél je gegarandeerd mensen die al nee hebben gezegd. Dat kost tijd en
reputatie. En zodra punt 1 er staat is het geen keuze meer: bij WhatsApp
Business is een werkende opt-out een harde eis, geen nette gewoonte.

**Bewijs.** De opt-in/opt-out-eis bij WhatsApp Business API is geen discussie —
proactieve berichten vereisen expliciete toestemming en vooraf goedgekeurde
sjablonen. De rest is eigen redenering.

**Impact/inspanning.** Impact midden-hoog, inspanning laag.

---

### 11. Wekelijkse trechter met verhoudingen per stap, per bron en per persoon

**Wat.** Niet de totalen, maar de conversie *tussen* elke stap, per week
uitgezet: lead → bereikt → gekwalificeerd → intake → voorgesteld → gestart.

**Waarom hier.** Bij 0,14% eindconversie is het totaal betekenisloos; de enige
bruikbare vraag is *in welke stap lek ik deze week meer dan vorige week*. Jullie
Performance-module telt uitkomsten; wat je nodig hebt zijn ratio's die een
verslechtering laten zien vóórdat het aantal plaatsingen daalt — dat aantal
loopt weken achter.

**Bewijs.** Bullhorn GRID 2026: 56% van de sterkste groeiers zit onder de 10
dagen time-to-place, 72% stelt meerdere kandidaten per opdracht voor. Voor de
absolute ijkpunten: ~95 sollicitanten per aanname en ~0,6% sollicitatie-naar-
aanname branchebreed. Beide zijn samengestelde benchmarks van derden, dus
grofmazig — bruikbaar om te zien dat 700 leads per plaatsing extreem is, niet om
op te sturen.

**Let op de valkuil.** Rapportage is precies waar gekochte ATS'en volgens echte
gebruikers het meest teleurstellen: "je moet 2–3 rapporten draaien om de volledige
prestatie van één recruiter te zien", "de rapportage — je moet feitelijk een apart
product kopen", "geen native ad-hocrapportage" (allemaal Capterra, Bullhorn).
Dat is precies het voordeel van zelf bouwen: jullie hebben de ruwe data al.

**Impact/inspanning.** Impact midden-hoog, inspanning laag.

---

### 12. Vacature-intake met dezelfde velden als de knock-outs

**Wat.** Bij het aannemen van een opdracht dezelfde acht velden vastleggen als
bij de kandidaat: ploegen, certificaten, taal, vervoer/bereikbaarheid,
startdatum, aantal, tarief.

**Waarom hier.** Matchen werkt alleen als beide kanten dezelfde taal spreken.
Nu zit de vacature-eis waarschijnlijk in een omschrijving; dan kun je punt 5
niet uitvoeren. Bijkomend voordeel: het dwingt de accountmanager om bij intake
door te vragen, wat de mismatch aan de voorkant verkleint.

**Bewijs.** Eigen redenering. De onderliggende observatie — dat ATS'en
doorgaans zijn gebouwd voor één lineair intern wervingsproces terwijl bureaus
anders werken — komt uit een leveranciersanalyse (Moravio) en is dus zwak, maar
sluit aan bij de OTYS- en Loxo-reviews over koppelingen die niet passen.

**Impact/inspanning.** Impact midden-hoog, inspanning laag tot midden.

---

### 13. Kandidaat plant zelf de videocall

**Wat.** In plaats van heen-en-weer appen: een link met beschikbare
tijdvakken uit de agenda van de recruiter.

**Waarom hier.** Het heen-en-weer over een tijdstip is per kandidaat vijf tot
tien minuten en meerdere onderbrekingen. Bij het volume dat jullie draaien is
dat de tweede grootste tijdvreter na het bellen zelf.

**Bewijs.** Zwak, en ik wil daar eerlijk over zijn. Het patroon is bewezen op
enorme schaal — Paradox/Olivia bij McDonald's, 65% kortere time-to-hire, met
zelfplannen en SMS-herinneringen als kern — maar dat is een enterprise-case bij
duizenden vestigingen, en het cijfer komt van de leverancier. Voor een bureau
van vier mensen is de analogie zwak. Wat wél overtuigt is dat het mechanisme
simpel is en het bouwwerk klein.

**Impact/inspanning.** Impact midden, inspanning midden (agenda-integratie).

---

### 14. Meertalige sjablonen

**Wat.** Elk automatisch bericht in NL, EN en de talen die je feitelijk
tegenkomt (Pools, Roemeens), met een taalveld op de kandidaat.

**Waarom hier.** Arbeidsmigranten zijn in productie en logistiek geen
uitzondering. Een automatisch bericht in het Nederlands aan iemand die dat niet
leest, telt in je cijfers als "niet gereageerd" — je meet dan taal, geen
interesse.

**Bewijs.** Meertaligheid wordt in blue-collar-wervingsliteratuur consequent als
knelpunt genoemd, maar altijd zonder cijfers; Nederlandse bureaus melden dat ze
screenen in de moedertaal van de kandidaat. Zwakke bronnen, sterke
plausibiliteit. Dat het je meting vervuilt, is mijn eigen redenering.

**Impact/inspanning.** Impact midden, inspanning laag — sjablonen per taal, geen
nieuwe techniek.

---

### 15. Mobiel bruikbaar voor de recruiter

**Wat.** Bellen, status zetten en een notitie inspreken vanaf de telefoon.

**Waarom hier.** Rajesh belt. Vijftig nummers per dag afwerken achter een laptop
terwijl je met je telefoon belt, is twee apparaten en dubbel werk — precies het
moment waarop mensen stoppen met loggen en het systeem leegloopt.

**Bewijs.** Dat mobiel gebruik hoort bij volumewerving wordt breed beweerd maar
zelden onderbouwd (wurknow noemt het zonder één cijfer). Wel echt: Homerun-
gebruikers op Capterra klagen expliciet dat het niet mobielvriendelijk is en de
agenda "erg klein en priegelig". Dat het niet-loggen daaruit voortkomt, is mijn
redenering.

**Impact/inspanning.** Impact midden, inspanning midden.

---

### 16. Klik-om-te-bellen met automatische pogingregistratie

**Wat.** Bellen vanuit de kaart, waarbij de poging en de uitkomst zonder extra
handeling worden vastgelegd.

**Waarom hier.** Niet vanwege snelheid, maar omdat punt 3 valt of staat met
volledige pogingdata. Als loggen handwerk is, wordt het overgeslagen op precies
de drukste dagen.

**Bewijs.** Wees hier sceptisch: alles wat over dialers wordt geclaimd — "60–100
gesprekken per uur", "drie keer zoveel live gesprekken", "verdubbelde
contactratio" — komt uit verkoopmateriaal van dialerleveranciers, zonder één
controleerbare meting. **Dat is verkooppraat.** De enige reden om dit te bouwen
is de datakwaliteit, niet de beloofde productiviteitssprong.

**Impact/inspanning.** Impact midden, inspanning midden-hoog en het kost geld
(telefonie-integratie). Laag op de lijst zetten.

---

### 17. AVG: bewaartermijn en automatisch opschonen

**Wat.** Per kandidaat een bewaartermijn met automatische verwijdering, plus een
knop om op verzoek alles van één persoon te wissen of te exporteren.

**Waarom hier.** Bij 52.000 records per jaar is dit geen theoretisch risico
meer. De gangbare praktijk in Nederland is sollicitatiegegevens vier weken na
afronding te verwijderen, of tot een jaar met toestemming van de kandidaat.
Handmatig gaat dat bij dit volume niet gebeuren, en zodra je WhatsApp-berichten
gaat opslaan (punt 9) hoort de inhoud van die gesprekken er ook onder te vallen.

**Bewijs.** Ik geef dit als eigen kennis van de Nederlandse praktijk en het
sluit aan bij wat recruitmenttech.nl over bewaren en verwijderen schrijft —
**laat de exacte termijnen vóór ingebruikname naast de tekst van de Autoriteit
Persoonsgegevens leggen.** Zet er geen automatische verwijdering op voordat dat
gecheckt is; onbedoeld wissen is erger dan te lang bewaren.

**Impact/inspanning.** Impact midden — het levert niets op, het voorkomt iets.
Inspanning laag.

---

### 18. No-show als eigen uitvalreden, met terugkoppeling naar de bron

**Wat.** "Niet komen opdagen" niet wegstoppen onder een algemene categorie, maar
apart tellen op intake, op kennismaking bij de klant, en op de eerste werkdag.

**Waarom hier.** Jullie registreren uitval al met reden — goed. Maar no-show is
een ander soort probleem dan afgewezen worden: het is een *procesfout* van
jullie kant (te lang gewacht, te weinig contact, verkeerde verwachting), en het
is de enige uitvalreden die je met punt 6 direct kunt beïnvloeden. Zit het onder
"kandidaat", dan zie je het effect van je herinneringen nooit.

**Bewijs.** Eigen redenering, op basis van de uitvalstructuur die al in het CRM
zit.

**Impact/inspanning.** Impact midden, inspanning laag.

---

### 19. Dossiercheck vóór plaatsing

**Wat.** Een vaste checklist per plaatsing van wat er binnen moet zijn voordat
iemand kan starten — identiteitsbewijs, ondertekende overeenkomst, de gegevens
die de verloning nodig heeft.

**Waarom hier.** Nederlandse bureaus noemen "complete papieren" naast directe
beschikbaarheid als de bepalende factor voor hoe snel iemand kan starten. Bij
volume is dit het soort werk dat op vrijdagmiddag misgaat.

**Bewijs.** **Dit punt is onaf.** Wat precies verplicht is verschilt sterk
tussen uitzenden en werving-en-selectie, en de Nederlandse regels rond
toelating van uitleners en identiteitscontrole zijn recent gewijzigd. Ik heb dit
niet tot op de bron kunnen dichtzetten. Behandel de inhoud als "nog uitzoeken",
niet als advies — maar de *behoefte* aan een startchecklist staat los van de
juridische details.

**Impact/inspanning.** Impact onduidelijk tot midden-hoog, inspanning laag —
maar zoek eerst uit wat er in jullie constructie werkelijk moet.

---

### 20. Overdraagbaarheid van je eigen data

**Wat.** Kunnen exporteren wat er in zit, in bruikbare vorm, zonder hulp van
buiten.

**Waarom hier.** Dit is een functie die alleen opvalt als je hem mist. Het staat
laag omdat jullie hem gratis hebben: eigen Supabase, eigen code. Maar het is
wel de belangrijkste reden om níét over te stappen naar een pakket zodra dit
groeit — en het is het meest gedocumenteerde nadeel van bestaande ATS'en. Een
Nederlandse OTYS-gebruiker beschrijft op Capterra ronduit vendor lock-in doordat
de leverancier weigerde te koppelen; de veel geciteerde "$5.000–10.000 om je
eigen kandidaten bij Bullhorn te exporteren" heb ik nagetrokken en is
**niet te verifiëren** — het komt uit een concurrentenpagina zonder bron.

**Impact/inspanning.** Impact laag op de korte termijn, hoog als optie.
Inspanning nul; niet weggeven.

---

## Wat je bewust NIET moet bouwen

Dit zijn standaardfuncties in élk ATS. Ze staan er omdat het pakket ook aan
uitzendbureaus voor kantoorfuncties en aan interne HR-afdelingen verkocht moet
worden. Voor jullie voegen ze weinig toe.

**CV-parsing.** Zit in elk pakket, maar jullie kandidaten hebben in de regel geen
CV — en waar wel, is de kwaliteit slecht. Recruiters op Capterra zeggen het
onomwonden: "wanneer systemen CV's parsen, verhaspelt het namen, huidige functie
en werkgever" en "CV-parsing slaat nergens op". Een leveranciersblog noemt zelf
70% nauwkeurigheid als goed nieuws. Jullie hebben het al (`cvparse.js`); laat het
staan voor de uitzonderingen, investeer er niets meer in. Acht gestructureerde
velden (punt 4) verslaan een geparseerd CV in dit segment ruimschoots.

**AI-matching en kandidaatscores.** Werkt op CV-tekst. Geen CV, geen matching.
Regelgebaseerd filteren op je eigen velden is hier accurater én uitlegbaar —
recruiters wantrouwen scores zonder onderbouwing en dat is terecht.

**Boolean-zoeken in externe profieldatabases.** Loxo's 1,2 miljard profielen
zijn indrukwekkend en volstrekt irrelevant: productiemedewerkers en
heftruckchauffeurs staan niet op LinkedIn of GitHub. Jullie sourcingkanaal is
Meta, en dat werkt.

**Scorecards, interviewkits en beoordelingsformulieren voor een panel.** Gebouwd
voor interne teams waar vier mensen dezelfde kandidaat beoordelen. Bij vier
medewerkers totaal is dit administratie zonder ontvanger.

**Assessments en video-interviewplatforms.** Voor deze functies overbodig. Een
videocall met een gewone link volstaat; jullie doen dat al.

**Werkenbij-pagina en multiposting naar vacaturebanken.** Niet waardeloos — het
is gratis organisch verkeer — maar het is niet je knelpunt, en het is een
substantieel bouwproject. Pas relevant als de Meta-kraan dichtgaat.

**Diversiteitsrapportage.** Amerikaanse wetgeving. Hier niet aan de orde.

**Een rapportagebouwer.** De verleiding is groot om iets te maken waarmee je
"alles" kunt uitvragen. Met vier gebruikers is een vast weekoverzicht (punt 11)
meer waard dan een bouwer die niemand gebruikt.

---

## Waar kleine bureaus in de praktijk op stuklopen

Uit ruim honderd echte Capterra-reviews van bureaus met 2–50 medewerkers, over
Bullhorn, Loxo, JobDiva, OTYS, Recruitee en Homerun. Dit is de sterkste
bronnenlaag in het rapport: geverifieerde gebruikers, met bedrijfsgrootte
zichtbaar. Relevant voor jullie omdat het laat zien welke risico's je met
zelfbouw omzeilt — en welke je alsnog zelf kunt introduceren.

1. **Prijs per gebruiker met een minimumafname.** "Duur voor start-ups omdat de
   prijs op het aantal gebruikers is gebaseerd." Een gebruiker uitzetten
   verlaagt de rekening niet.
2. **Stilzwijgende verlenging.** "Zeg 60 dagen voor het einde op of het
   contract verlengt." Terugkerend thema, met prijsverhogingen bij verlenging.
3. **Alles is een module.** "Niets is geïntegreerd en alles kost extra." Het
   basisproduct is een voorproefje.
4. **Rapportage pas bij bijbetaling.** "Je moet 2–3 rapporten draaien om de
   prestatie van één recruiter te zien."
5. **Traagheid en uitloggen.** "Het kost me ongeveer 5 minuten om binnen te
   komen." "Werk ik 30 minuten niet, dan is het bevroren."
6. **Zoeken dat je eigen kandidaten niet vindt.** Zie punt 5 hierboven — het
   meest schadelijke, want dan gaan recruiters terug naar externe kanalen.
7. **Parsing die records vervuilt bij binnenkomst.** Bron van zowel dubbelen
   als onvindbaarheid.
8. **Migratie die halverwege blijft steken.** "Data is niet overgezet maar in
   het luchtledige achtergelaten" — en dan wil de leverancier betaald worden om
   het af te maken.
9. **Support afhankelijk van je contractgrootte.** "Hun support is niet best
   tenzij je op enterpriseniveau zit."
10. **Te complex voor een klein team.** "Het systeem is veel te complex en
    onintuïtief voor ons bedrijf" — van een OTYS-gebruiker, Nederlandse markt.
11. **Ontwikkeling gericht op enterprise.** "90% van hun ontwikkeltijd gaat naar
    enterprise, dat is frustrerend."

**Twee eerlijke kanttekeningen.** (a) De veelgehoorde stelling "recruiters
voeren niets in en het ATS wordt een kerkhof" heb ik nergens met primair bewijs
kunnen onderbouwen — het staat alleen in leveranciersblogs. De *mechanismen* die
dat zouden veroorzaken zijn wel gedocumenteerd (punten 5, 7, 14 hierboven), maar
de conclusie zelf is een hypothese. (b) Carerix heeft nul bruikbare publieke
reviews; wat over Carerix rondzingt komt van concurrenten. Reddit was voor dit
onderzoek niet bereikbaar, dus de forumkant ontbreekt.

---

## Als je maar drie dingen doet

1. **Ontdubbelen op genormaliseerd telefoonnummer** (punt 2). Klein werk,
   direct effect op zowel beltijd als op de betrouwbaarheid van al je cijfers.
2. **Automatisch eerste bericht binnen minuten** (punt 1). Dit is het enige dat
   de verhouding van 200 leads op 1 recruiter oplost. Kost geld; reken het af
   tegen het advertentiebudget.
3. **Acht knock-outvelden als data** (punt 4). Zonder dit werkt hergebruik van
   de pool niet, werkt matching niet, en blijft elke lead een telefoonnummer met
   een aantekening.

Punt 3 en 6 komen daar vlak achteraan, en zijn allebei klein werk bovenop wat er
al staat.

---

## Bronnen

**Redelijk hard**
- MIT/InsideSales, Oldroyd — Lead Response Management Study (2007): 3 jaar data,
  15.000+ leads, 100.000+ belpogingen. 5 minuten vs 30 minuten = 21× kwalificatie.
- Harvard Business Review (2011) — audit van 2.241 Amerikaanse bedrijven:
  gemiddelde reactietijd 42 uur, 23% reageert nooit.
- Capterra-reviews, geverifieerde gebruikers met bedrijfsgrootte:
  Bullhorn (https://www.capterra.com/p/140531/Bullhorn-Recruiting-Software/reviews/),
  OTYS (https://www.capterra.com/p/181619/OTYS-Recruitment/reviews/),
  Loxo (https://capterra.com/p/165046/Loxo/reviews/),
  JobDiva (https://capterra.com/p/129831/JobDiva/reviews/),
  Recruitee (https://www.capterra.com/p/140650/Recruitee/reviews/),
  Homerun (https://www.capterra.com/p/147299/Homerun/reviews/).
- Recruitmenttech.nl over WhatsApp in Nederlandse ATS'en:
  https://www.recruitmenttech.nl/tech/welke-ats-ondersteunt-whatsapp/

**Groot maar van een leverancier — bruikbaar, met korrel zout**
- Bullhorn GRID 2026 Industry Trends (≈2.300 respondenten):
  https://www.bullhorn.com/grid/2026-industry-trends/report/
- Workable, "the two-day rule of recruiting".
- Criteria / candidate experience-onderzoek: 22% dag-één-no-show.

**Zwak — als richting gebruikt, niet als bewijs**
- SMS- en dialerstatistieken van aanbieders (98% open rate, 60–100 gesprekken
  per uur, 3× meer live gesprekken). Geen methodologie, verkoopmateriaal.
- JobTalk AI-case "40% minder no-shows"; Paradox/McDonald's "65% kortere
  time-to-hire".
- Nederlandse bureausites over screeningcriteria (Prestatie, Faam, OrangeJobs).
- Meta-conversiebenchmarks (instant form ~2% vs landingspagina ~17%).

**Nagetrokken en afgekeurd**
- "28% verscheen nooit op de eerste werkdag" (Flexnieuws, juli 2025) — artikel
  noemt geen bron, geen steekproef, geen methode. Niet gebruiken.
- "$5.000–10.000 exportkosten bij Bullhorn" — komt van een concurrentenpagina,
  geen genoemde review of onderzoek erachter.
- "13 uur per recruiter per jaar kwijt aan dubbele records" — leveranciersblog
  zonder methode.
- Carerix-citaten die rondgaan in vergelijkingsartikelen — afkomstig van
  concurrenten, niet verifieerbaar.

**Openstaand**
- De Nederlandse compliance-kant (punt 19) en de exacte AVG-bewaartermijnen
  (punt 17) heb ik niet tot op de officiële bron kunnen dichtzetten. Doe dat
  voordat je er iets omheen bouwt.
