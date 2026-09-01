/* ═══════════════════════════════════════════════════════════════
   SAMENWERKINGSOVEREENKOMST-GENERATOR

   Tjeerd maakte elke SWO met de hand in Word. Hier maakt hij hem
   vanuit de template, met links de invulvelden en rechts een live
   A4-voorbeeld dat exact de opmaak van de getekende overeenkomst
   met Bunge aanhoudt (referentie: 12 pagina's PDF).

   Publieke functie:
     CRM.swo.open({klant, stukId})        // beide optioneel
     CRM.swo.stukken(klant)               // eerder gemaakte SWO's

   Uitgangspunten:
   - In de database gaan ALLEEN de ingevulde velden (crm_stukken.velden).
     De opmaak zit hier en in css/swo.css, zodat een huisstijlwijziging
     vanzelf meegaat in alle oude stukken.
   - Elk artikel kan aan/uit en de lopende tekst is te bewerken. Van
     een artikel bewaren we alleen de AFWIJKING; blijft het standaard,
     dan volgt het voortaan de template.
   - Alles wat de gebruiker typt gaat door CRM.h(). Dit document gaat
     naar buiten; één ongeëscapete klantnaam is een lek.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;
const t = v => String(v == null ? '' : v).trim();

/* ═══════════════════════════════════════════════════════════════
   1. STANDAARDWAARDEN
   ═══════════════════════════════════════════════════════════════ */

const PG = {
  naam:'Ploeggenoten B.V.',
  adres:'J. Keplerweg 10L',
  pcplaats:'2408 AC Alphen aan den Rijn',
  /* 99634236 is het juiste nummer (bevestigd door Tjeerd, 31 jul 2026).
     In de getekende overeenkomst met Bunge staat 99598817 — dat is fout. */
  kvk:'99634236',
  email:'tjeerd@ploeggenoten.nl',
  telefoon:'+31 6 13 555 372'
};

const VOORWAARDEN = {
  ingangsdatum:'',
  looptijd:'één jaar',
  opzegtermijn:'één maand',
  exclusiviteit:'drie (3) weken',
  proeftijd:'twee (2) maanden',
  proeftijdUitzenden:'twee (2) maanden',
  betaaltermijn:'30 dagen',
  overnameUren:'1.560',
  plaats:'Alphen aan den Rijn'
};

const TARIEVEN = [
  {functie:'Operator (verlading en proces)', pct:'23%'},
  {functie:'Shiftleaders',                   pct:'23%'},
  {functie:'Monteurs',                       pct:'23%'},
  {functie:'Managers (QFS, Safety, Productie, Plant)', pct:'23%'}
];

const TARIEVEN_UITZENDEN = [
  {functie:'Productiemedewerker', factor:'2,3'},
  {functie:'Magazijnmedewerker',  factor:'2,3'},
  {functie:'Operator',            factor:'2,35'},
  {functie:'Teamleider',          factor:'2,4'},
  {functie:'Productiemanager',    factor:'2,4'}
];

/* vorm: 'ws' | 'uitzenden' | 'beide' — bepaalt titel en welke
   onderdelen van de DELEN-lijst meedoen (zie vormPast()). */
function doctitelStandaard(vorm){
  if(vorm === 'uitzenden') return 'Samenwerkingsovereenkomst Uitzenden/Detachering';
  if(vorm === 'beide') return 'Samenwerkingsovereenkomst';
  return 'Samenwerkingsovereenkomst W&S';
}
const DOCTITEL = doctitelStandaard('ws');

/* ═══════════════════════════════════════════════════════════════
   2. DE TEMPLATE
   Elk deel heeft een sleutel, een kop-soort en lopende tekst in een
   kleine regel-taal (zie HINT onderaan de artikelenlijst):
     ##  groene tussenkop      ###  zwarte vetkop     #!  klein label
     -   opsomming             >    uitspraak         >>  citaatblok
     !   label | uitspraak     +    pijler            =   kaderblok
     @   donkere stap          @@   lime stap
     {partijen} {tarieven} {ondertekening} {ingangsdatum-regel}
   Inline: **vet**, *groen cursief*, {veld}, {art:sleutel}
   ═══════════════════════════════════════════════════════════════ */

const DELEN = [
/* ─── Partijen ────────────────────────────────────────────────── */
{k:'partijen', groep:'Partijen', kop:'sectie', titel:'Partijen bij deze overeenkomst', tekst: v => {
  const soort = v.vorm === 'uitzenden' ? 'uitzenden en detachering'
    : v.vorm === 'beide' ? 'werving & selectie en uitzenden/detachering' : 'werving & selectie';
  const label = v.vorm === 'uitzenden' ? 'Uitzenden & Detachering'
    : v.vorm === 'beide' ? 'Werving, Selectie & Uitzenden' : 'Werving & Selectie';
  return `Deze samenwerkingsovereenkomst voor ${soort} wordt aangegaan tussen onderstaande partijen.
{partijen}
{ingangsdatum-regel}
! ${label} | Wij leveren geen **cv's**, maar *duurzame* plaatsingen.`;
}},

/* ─── Hoofdstuk 1: onze manier van samenwerken ────────────────── */
{k:'h1-opener', groep:'Hoofdstuk 1', kop:'hoofdstuk', hoofdstuk:'Hoofdstuk 1', nieuwePagina:true,
 titel:'Onze **manier** van *samenwerken*', tekst:
`Ploeggenoten is **geen uitzendbureau** en **geen leadgeneratiebureau**. Wij zijn een recruitmentbureau met *marketing als motor*, gebouwd vanuit de werkvloer van productie, logistiek en industrie.
Onze samenwerking rust op twee pijlers die elkaar versterken.
+ Pijler 01 | Marketing | die de juiste mensen bereikt — ook wie niet actief zoekt.
+ Pijler 02 | Recruitment | dat alleen de juiste mensen doorlaat.
>> Wij sturen *geen leads*.
>> Wij sturen **kandidaten**.`},

{k:'h1-marketing', groep:'Hoofdstuk 1', kop:'sub', titel:'Marketing als *superkracht*', tekst:
`De meeste bureaus zetten een vacature op Indeed en wachten af tot er iemand reageert. Daarmee bereik je alleen de mensen die op dat moment toevallig zoeken — een klein hoekje van de markt.
**Wij draaien het om.** Met gerichte campagnes bereiken wij juist de mensen die niet actief zoeken, maar zich wél herkennen zodra ze het juiste filmpje van jouw bedrijf voorbij zien komen. Dat verlaagt niet alleen je uitval, het bouwt ook aan je employer branding in de regio.
> Een standaard bureau zet Indeed uit en wacht af. **Wij halen de mensen** *zelf*.`},

{k:'h1-proces', groep:'Hoofdstuk 1', kop:'label', nieuwePagina:true, titel:'Zo ziet dat proces eruit', tekst:
`@ 01 | Script en concept | We bedenken per vacature een scenario dat past bij de doelgroep en bij jouw werkvloer. Geen standaard praatje, maar een verhaal dat aansluit op wat een blue-collar kandidaat *daadwerkelijk triggert*.
@ 02 | Professionele videocontent op locatie | We komen bij je langs en filmen met professionele apparatuur: het echte werk, het tempo, de omgeving en de ploeg. Een eerlijk beeld, geen geregisseerde reclame. Elke video maken we in **vijf verschillende hooks** — vijf openingen, elk gericht op een specifiek deel van de doelgroep.
@ 03 | Editing naar wens | Alle content monteren we af in overleg met jou. Jij bepaalt mee hoe je bedrijf naar buiten komt.
@ 04 | Meta-strategie op maat | We bouwen een complete campagnestrategie op Instagram en Facebook: budgettering, targeting per regio en functietype, en doorlopende iteraties. We meten wat werkt, sturen bij, en halen er steeds meer rendement uit. Wij weten precies wat een blue-collar doelgroep nodig heeft om in beweging te komen.
### Waarom dit beter is dan een leadgeneratiebureau
Een leadgeneratiebureau levert je een lijst met namen — en die lijst is vaak waardeloos. Ze hebben geen verstand van de werkvloer en kennen jouw markt niet. Jij betaalt voor leads die nergens op uitlopen.
Wij sturen geen leads. Wij filteren ze volledig zelf en presenteren pas kandidaten die aan **alle gestelde eisen** voldoen. Omdat wij ons puur richten op productie en logistiek en die markt door en door kennen, durven wij ook achter ons werk te staan: onze dienstverlening is *no cure, no pay* — je betaalt voor resultaat, niet voor moeite.
>> **No cure, no pay.**
>> *Je betaalt voor resultaat, niet voor moeite.*`},

{k:'h1-recruitment', groep:'Hoofdstuk 1', kop:'sub', nieuwePagina:true, titel:'Recruitment op het *hoogste niveau*', tekst:
`Bereiken is het halve werk. Het andere halve werk is zorgen dat alleen de juiste mensen jouw kant op komen — *en dat ze blijven*. Daar nemen wij het volledige proces uit handen.
Wij zijn **specialist in productie en logistiek**. We kennen de dynamiek van deze sector als geen ander — van FMCG en pharma tot aan de verlading in de havens. Dat is een doelgroep die je niet op afstand bedient: het vraagt dat je dicht op de bal zit, snel schakelt en de taal van de werkvloer spreekt. Precies dat is hoe wij werken.
> Geen stapel cv's. **Één moment waarop** *alles samenkomt*.`},

{k:'h1-stappen', groep:'Hoofdstuk 1', kop:'label', titel:'Ons recruitmentproces in vaste, heldere stappen', tekst:
`@@ 1 | Screening | Iedere kandidaat die via onze campagnes binnenkomt, filteren wij zelf op de eisen die ertoe doen — **voordat jij er tijd in steekt**. Jij krijgt geen stapel cv's, maar een voorselectie die we al hebben getoetst.
@@ 2 | Intake | We toetsen achtergrond, beschikbaarheid en motivatie, en checken of de kandidaat past bij de functie en de werkvloer.
@@ 3 | Persoonlijk gesprek | We spreken de kandidaat persoonlijk om houding, mentaliteit en teamfit te beoordelen — de soft skills die op de vloer het verschil maken.
@@ 4 | Begeleiding naar contract | We begeleiden de kandidaat richting de contractfase en regelen het traject tot de handtekening.
@@ 5 | Start en evaluatie | Na de start blijven we betrokken: we volgen hoe het loopt, signaleren knelpunten vroegtijdig en evalueren met kandidaat én opdrachtgever. Plaatsen en verdwijnen doen we niet — we bouwen samen aan continuïteit.`},

{k:'h1-ontdek', groep:'Hoofdstuk 1', kop:'geen', nieuwePagina:true, titel:'Ontdek & Ontmoet', tekst:
`= Één moment in plaats van een molen aan gesprekken | Ontdek *& Ontmoet* | Vertrouw je op onze expertise en heb je geen zin in losse sollicitaties, dan is Ontdek & Ontmoet de slimste route. Wij comprimeren het eerste én tweede gesprek tot één sessie van ongeveer twee uur, waarbij meerdere kandidaten tegelijk aanwezig zijn. Onder onze begeleiding krijgen ze een korte introductie en een rondleiding, samen met de teamleider of productiemanager. | Kandidaten ervaren direct het werk en de ploeg; jij ziet houding, motivatie en teamfit — nog vóór cv's een rol spelen. Het voorkomt mismatches, verkort het wervingsproces en verhoogt de kwaliteit van de instroom.
### LinkedIn-sourcing voor specialistische functies
Gaat het om een functie die je niet via Meta vindt, dan zetten we gerichte sourcing op LinkedIn in. Zo dekken we zowel de brede instroom als de specialistische rollen.
### Mensen die blijven staan
Wie het werk, het tempo en de ploeg vooraf heeft gezien, weet precies waar de baan uit bestaat. Dat is het verschil tussen iemand die na twee weken afhaakt en iemand die *onderdeel wordt van de ploeg*.
>> Wij plaatsen niet en verdwijnen.
>> Wij **bouwen mee** aan de *ploeg*.`},

/* ─── Hoofdstuk 2: de overeenkomst ────────────────────────────── */
{k:'h2-opener', groep:'Overeenkomst', kop:'sectie', nieuwePagina:true, titel:'2. Overeenkomst', tekst:''},

{k:'2-duur', groep:'Overeenkomst', kop:'artikel', titel:'Duur van de overeenkomst', tekst:
`Deze overeenkomst gaat in op {ingangsdatum}. De overeenkomst wordt aangegaan voor {looptijd} en kan door beide partijen schriftelijk worden opgezegd met een opzegtermijn van {opzegtermijn}, tenzij anders overeengekomen.`},

{k:'2-tarieven', groep:'Overeenkomst', kop:'artikel', vorm:'ws', titel:'Tarieven en diensten', tekst:
`De Werving & Selectie-fee wordt berekend over het bruto jaarsalaris van de geplaatste kandidaat. De grondslag bestaat uit:
- twaalf (12) maal het overeengekomen bruto maandsalaris;
- vakantiegeld (8%);
- een vaste, structurele dertiende maand of eindejaarsuitkering, voor zover contractueel of op grond van de cao vast toegekend;
- vaste, structurele ploegen- of functietoeslagen, voor zover contractueel of op grond van de cao vast toegekend.
Niet tot de grondslag behoren: variabele of discretionaire bonussen, resultaatafhankelijke beloning, overwerkvergoeding, onkosten- en reiskostenvergoedingen en overige incidentele of niet-structurele beloningen.
De Werving & Selectie-fee wordt vastgesteld op basis van:
- functie en complexiteit;
- cao en arbeidsvoorwaarden;
- gewenste dienstverlening;
- mate van begeleiding en betrokkenheid.
{tarieven}
Binnen deze dienstverlening verzorgt Ploeggenoten de volledige werving en selectie van kandidaten, waaronder sourcing, online campagnes, vacaturecontent, intakegesprekken, begeleiding tijdens het proces en ondersteuning bij onboarding.
Het doel is het realiseren van duurzame plaatsingen met de juiste combinatie van ervaring, motivatie en cultuurfit.`},

{k:'2-exclusiviteit', groep:'Overeenkomst', kop:'artikel', titel:'Exclusiviteit bij campagnes', tekst:
`Bij inzet van recruitmentcampagnes via Ploeggenoten geldt een exclusiviteitsperiode van {exclusiviteit} na livegang van de campagne.
Kandidaten die aantoonbaar via campagnes of content van Ploeggenoten zijn binnengekomen, worden gedurende deze periode uitsluitend via Ploeggenoten behandeld.
Rechtstreekse werving of inzet van andere bureaus blijft toegestaan voor kandidaten die niet afkomstig zijn uit campagnes van Ploeggenoten.`},

{k:'2-vervanging', groep:'Overeenkomst', kop:'artikel', vorm:'ws', titel:'Vervangingsregeling', tekst:
`Indien een door Ploeggenoten geplaatste kandidaat binnen de overeengekomen proeftijd van {proeftijd} uit dienst treedt, ongeacht of dit op initiatief van Opdrachtgever of de kandidaat gebeurt, heeft Opdrachtgever recht op éénmalige kosteloze vervanging voor dezelfde functie.
De vervangingsregeling geldt uitsluitend voor de betreffende plaatsing en vacature en geeft geen recht op restitutie, creditering of verrekening van reeds gefactureerde bedragen.`},

{k:'2-vervanging-uitzenden', groep:'Overeenkomst', kop:'artikel', vorm:'uitzenden', titel:'Vervangingsregeling', tekst:
`Indien een door Ploeggenoten ter beschikking gestelde medewerker binnen de overeengekomen proeftijd van {proeftijd-uitzenden} niet langer werkzaam is bij Opdrachtgever, ongeacht of dit op initiatief van Opdrachtgever of de medewerker gebeurt, heeft Opdrachtgever recht op éénmalige kosteloze vervanging voor dezelfde functie.
De vervangingsregeling geldt uitsluitend voor de betreffende plaatsing en geeft geen recht op restitutie, creditering of verrekening van reeds gefactureerde bedragen.`},

{k:'2-facturatie', groep:'Overeenkomst', kop:'artikel', vorm:'ws', titel:'Facturatie en betaling', tekst:
`Voor facturatie van Werving & Selectie hanteert Ploeggenoten een betaaltermijn van {betaaltermijn} na factuurdatum.
De facturatie vindt plaats wanneer de kandidaat het contract heeft getekend.`},

{k:'2-facturatie-uitzenden', groep:'Overeenkomst', kop:'artikel', vorm:'uitzenden', titel:'Facturatie en betaling', tekst:
`Facturatie vindt wekelijks plaats op basis van goedgekeurde uren via Pronkert. Betaaltermijn: 14 dagen na factuurdatum.`},

{k:'2-arbeidsvoorwaarden', groep:'Overeenkomst', kop:'artikel', vorm:'uitzenden', titel:'Arbeidsvoorwaarden en gelijkwaardige beloning', tekst:
`Ploeggenoten handelt conform alle geldende wet- en regelgeving, waaronder het principe van gelijkwaardige beloning zoals bedoeld in de Wet Toezicht Terbeschikkingstelling van Arbeid (WTTA). Opdrachtgever verstrekt tijdig alle gegevens die noodzakelijk zijn voor correcte inschaling en beloning.
De verloning en personeelsadministratie worden uitgevoerd via het gecertificeerde backofficebureau Pronkert, dat werkt conform de ABU-voorwaarden.`},

{k:'2-terbeschikkingstelling', groep:'Overeenkomst', kop:'artikel', vorm:'uitzenden', titel:'Terbeschikkingstelling van medewerkers', tekst:
`Voor iedere plaatsing worden de afspraken vastgelegd in deze overeenkomst en eventuele bijlagen of inleenbevestigingen. Ploeggenoten zet zich maximaal in om tijdig en zorgvuldig geschikte kandidaten te leveren. De algemene voorwaarden van Ploeggenoten zijn van toepassing.
De medewerkers verrichten hun werkzaamheden onder leiding en toezicht van Opdrachtgever.`},

{k:'2-veiligheid-werkplek', groep:'Overeenkomst', kop:'artikel', vorm:'uitzenden', titel:'Veiligheid en werkplek', tekst:
`Opdrachtgever draagt zorg voor een veilige werkplek, naleving van de Arbowet en duidelijke veiligheidsinstructies. Benodigde persoonlijke beschermingsmiddelen (PBM's) worden door Opdrachtgever verstrekt, tenzij anders overeengekomen.`},

{k:'2-overname-medewerkers', groep:'Overeenkomst', kop:'artikel', vorm:'uitzenden', titel:'Overname van medewerkers', tekst:
`Kosteloze overname is mogelijk na {overname-uren} gewerkte uren. Bij eerdere overname geldt een vergoeding van 30% van het bruto resterende factuurbedrag. Dit geldt ook bij indiensttreding via derden binnen 12 maanden na de laatste inleenopdracht.`},

{k:'2-retainer', groep:'Overeenkomst', kop:'artikel', vorm:'alle', titel:'Retainer fee managementfuncties', tekst:
`Voor management-, sleutel- of specialistische functies werkt Ploeggenoten met een retainer fee van €1.500,- exclusief btw ter dekking van campagne-, search- en recruitmentwerkzaamheden.
De retainer fee wordt bij succesvolle plaatsing volledig verrekend met de overeengekomen recruitment fee.
De retainer fee is verschuldigd voorafgaand aan de opstart van de werkzaamheden en wordt niet gerestitueerd, ongeacht de uitkomst van de opdracht.
Deze regeling is uitsluitend van toepassing indien partijen dit vooraf schriftelijk zijn overeengekomen.`},

{k:'2-veiligheid', groep:'Overeenkomst', kop:'artikel', titel:'Veiligheid bij bezoeken op locatie', tekst:
`Bij bezoeken, rondleidingen en Ontdek & Ontmoet-sessies op locatie draagt Opdrachtgever zorg voor:
- een veilige omgeving;
- naleving van de Arbowet;
- duidelijke veiligheidsinstructies.
Benodigde persoonlijke beschermingsmiddelen (PBM's) worden voor deze bezoeken door Opdrachtgever verstrekt, tenzij anders overeengekomen.`},

{k:'2-vertrouwelijkheid', groep:'Overeenkomst', kop:'artikel', titel:'Vertrouwelijkheid', tekst:
`In dit artikel wordt verstaan onder:
**"Vertrouwelijke Informatie":** alle informatie, in welke vorm dan ook, die Opdrachtnemer in het kader van de Overeenkomst van of over Opdrachtgever, haar medewerkers, kandidaten of gelieerde ondernemingen verkrijgt, waaronder begrepen bedrijfs-, personeels-, kandidaat- en persoonsgegevens, prijzen, tarieven, werkwijzen en overige niet-openbare informatie. Hieronder valt niet informatie die reeds openbaar is, buiten toedoen van Opdrachtnemer openbaar wordt, of die Opdrachtnemer rechtmatig en zonder geheimhoudingsplicht van een derde heeft verkregen.
**"Medewerkers":** de werknemers, ingehuurde arbeidskrachten, onderaannemers en freelancers van Opdrachtnemer die bij de uitvoering van de Overeenkomst betrokken zijn.
**"Klant":** een aan Opdrachtgever gelieerde onderneming (groepsmaatschappij in de zin van artikel 2:24b BW).
Beide partijen behandelen alle in het kader van deze Overeenkomst verkregen informatie vertrouwelijk en verwerken persoonsgegevens uitsluitend in overeenstemming met de Algemene verordening gegevensbescherming (AVG) en overige toepasselijke privacywetgeving. Onverminderd het voorgaande gelden voor Opdrachtnemer de volgende verplichtingen.
**{art:2-vertrouwelijkheid}.1** Behoudens wettelijke verplichtingen tot verstrekking, is Opdrachtnemer verplicht:
(a) geen Vertrouwelijke Informatie openbaar te maken, tenzij daarvoor door Opdrachtgever voorafgaande schriftelijke toestemming is verleend. Indien zulke toestemming wordt verleend, zal Opdrachtnemer deze derde een geheimhoudingsplicht opleggen die niet minder vergaand is dan de verplichtingen op grond van dit artikel {art:2-vertrouwelijkheid} (Vertrouwelijkheid) van de Overeenkomst;
(b) geen Vertrouwelijke Informatie te gebruiken voor enig ander doel dan het uitvoeren van de contractuele verplichtingen jegens Opdrachtgever;
(c) Vertrouwelijke Informatie uitsluitend ter beschikking te stellen aan Medewerkers die (i) zijn gebonden aan een geheimhoudingsplicht die het Opdrachtnemer mogelijk maakt zich te houden aan de geheimhoudingsverplichtingen jegens Opdrachtgever en (ii) voor wie het noodzakelijk is kennis te nemen van dergelijke Vertrouwelijke Informatie teneinde Opdrachtnemer in staat te stellen haar verplichtingen jegens Opdrachtgever (of de Klant) na te komen;
(d) Vertrouwelijke Informatie vertrouwelijk te houden op basis van dezelfde mate van zorgvuldigheid die Opdrachtnemer betracht om haar eigen vertrouwelijke informatie te beschermen, dan wel die van Opdrachtnemer verwacht mag worden, zijnde in ieder geval een in de branche gebruikelijke mate van zorgvuldigheid;
(e) indien sprake is van software, deze software niet te "reverse engineeren" zonder de expliciete voorafgaande schriftelijke toestemming van Opdrachtgever;
(f) indien Opdrachtnemer rechtens gehouden is Vertrouwelijke Informatie te verstrekken aan een rechter, arbiter, bestuursorgaan, toezichthouder of een vergelijkbare derde, zulke Vertrouwelijke Informatie slechts openbaar te maken na Opdrachtgever te hebben geïnformeerd (voor zover een dergelijke kennisgeving wettelijk is toegestaan) en Opdrachtgever in de gelegenheid te hebben gesteld om vertrouwelijke behandeling van de te verstrekken Vertrouwelijke Informatie te verkrijgen of om een beschermende maatregel te verkrijgen om de vertrouwelijkheid van de Vertrouwelijke Informatie te waarborgen.
**{art:2-vertrouwelijkheid}.2** Opdrachtnemer is tot geheimhouding van de Vertrouwelijke Informatie gehouden voor de duur van 5 (vijf) jaren na de dag waarop deze Overeenkomst eindigt of tot het moment dat de desbetreffende informatie niet langer kwalificeert als Vertrouwelijke Informatie.
**{art:2-vertrouwelijkheid}.3** Opdrachtnemer zal zonder voorafgaande schriftelijke toestemming van Opdrachtgever in publicaties of reclame-uitingen geen melding maken van de Overeenkomst.
**{art:2-vertrouwelijkheid}.4** In geval van beëindiging van de Overeenkomst zal Opdrachtnemer op eerste verzoek van Opdrachtgever alle informatie en gegevens die met de Overeenkomst verband houden aan Opdrachtgever (of, naar keuze van Opdrachtgever, aan Klant) ter beschikking stellen of vernietigen, tenzij schriftelijk anders is overeengekomen.
**{art:2-vertrouwelijkheid}.5** Opdrachtnemer zal de verplichtingen uit dit artikel eveneens schriftelijk opleggen aan de Medewerkers. Een overtreding van deze verplichting door een Medewerker wordt beschouwd als een overtreding van Opdrachtnemer zelf.
**{art:2-vertrouwelijkheid}.6** Opdrachtgever heeft te allen tijde het recht Opdrachtnemer te verzoeken alle aan Opdrachtnemer door haar dan wel namens haar verstrekte informatie en/of kopieën daarvan te vernietigen dan wel te retourneren.`},

{k:'2-tarieven-uitzenden', groep:'Overeenkomst', kop:'artikel', vorm:'uitzenden', titel:'Tarieven, factor en diensten', tekst:
`De tarieven worden uitgedrukt in een omrekenfactor op het brutoloon en zijn exclusief btw.
{tarieven-uitzenden}
Binnen deze factor voert Ploeggenoten onder andere de volgende diensten uit:
- volledige wervingsstrategie op no cure, no pay-basis;
- actieve en gerichte online werving via Meta, LinkedIn en jobboards;
- professionele foto- en videocontent op locatie;
- Ontdek & Ontmoet sessies;
- begeleiding tijdens onboarding;
- periodieke evaluaties met kandidaat en opdrachtgever;
- vroegtijdige signalering van knelpunten of onvrede.`},

{k:'2-voordracht', groep:'Overeenkomst', kop:'artikel', vorm:'ws', titel:'Werving, selectie en voordracht', tekst:
`Voor iedere opdracht worden de afspraken vastgelegd in deze overeenkomst en eventuele bijlagen of opdrachtbevestigingen. Ploeggenoten zet zich maximaal in om tijdig en zorgvuldig geschikte kandidaten voor te dragen. De algemene voorwaarden van Ploeggenoten zijn van toepassing.
De geselecteerde kandidaat treedt rechtstreeks in dienst van Opdrachtgever. Ploeggenoten is uitsluitend belast met werving en selectie, is geen werkgever van de kandidaat en stelt geen arbeidskrachten ter beschikking in de zin van de Wet allocatie arbeidskrachten door intermediairs (Waadi).`},

{k:'2-beeldmateriaal', groep:'Overeenkomst', kop:'artikel', titel:'Beeldmateriaal en toestemming', tekst:
`Opname van videocontent op locatie en het gebruik van naam, logo of herkenbaar beeldmateriaal van Opdrachtgever in campagnes vinden uitsluitend plaats na voorafgaande schriftelijke toestemming van Opdrachtgever. Campagnes kunnen desgewenst anoniem of generiek worden uitgevoerd, zonder vermelding van Opdrachtgever. Deze bepaling geldt onverminderd het bepaalde in artikel {art:2-vertrouwelijkheid}.`},

{k:'2-aard', groep:'Overeenkomst', kop:'artikel', titel:'Aard van de overeenkomst', tekst:
`Deze Overeenkomst is een overeenkomst van opdracht in de zin van artikel 7:400 BW e.v. Partijen verklaren uitdrukkelijk dat noch deze Overeenkomst, noch de relatie die ontstaat ten gevolge van het verrichten van de werkzaamheden door Opdrachtnemer in het kader van deze Overeenkomst of de opdracht, een arbeidsovereenkomst inhoudt in de zin van artikel 7:610 BW e.v., noch beoogt in te houden.`},

{k:'2-zelfstandig', groep:'Overeenkomst', kop:'artikel', titel:'Zelfstandige uitvoering', tekst:
`Opdrachtnemer is bij het uitvoeren van de overeengekomen werkzaamheden geheel zelfstandig en deelt de werkzaamheden zelfstandig in. Opdrachtnemer verricht de werkzaamheden naar eigen inzicht en zonder toezicht en leiding van Opdrachtgever. Wel vindt, voor zover dat voor de uitvoering van de opdracht nodig is, afstemming met Opdrachtgever plaats in geval van samenwerking met anderen, zodat deze optimaal zal verlopen. Ook kan Opdrachtgever aanwijzingen en instructies geven omtrent het beoogde doel van de opdracht, voor zover dit niet de wijze van uitvoeren van de opdracht raakt.`},

{k:'2-beeindiging', groep:'Overeenkomst', kop:'artikel', titel:'Beëindiging', tekst:
`Bij beëindiging blijven lopende verplichtingen en plaatsingen van kracht tot correcte afronding.`},

{k:'2-recht', groep:'Overeenkomst', kop:'artikel', titel:'Toepasselijk recht', tekst:
`Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement waar Ploeggenoten is gevestigd.`},

/* ─── Ondertekening ───────────────────────────────────────────── */
{k:'ondertekening', groep:'Ondertekening', kop:'sectie', nieuwePagina:true, titel:'3. Ondertekening', tekst:
`Aldus overeengekomen en in tweevoud opgemaakt te {plaats}. Door ondertekening verklaren beide partijen kennis te hebben genomen van en in te stemmen met de inhoud van deze overeenkomst.
{ondertekening}`}
];

const DEEL = {};
DELEN.forEach(d => { DEEL[d.k] = d; });

/* ═══════════════════════════════════════════════════════════════
   3. MODEL — precies wat er in crm_stukken.velden gaat
   ═══════════════════════════════════════════════════════════════ */

function leegModel(){
  return {
    omslag:true,
    vorm:'ws',                            /* 'ws' | 'uitzenden' | 'beide' */
    doctitel:DOCTITEL,
    og:{naam:'', adres:'', pcplaats:'', kvk:'', contact:'', email:'', telefoon:''},
    pg:Object.assign({}, PG),
    voorwaarden:Object.assign({}, VOORWAARDEN, {ingangsdatum:CRM.todayISO()}),
    tarieven:TARIEVEN.map(r => Object.assign({}, r)),
    tarievenUitzenden:TARIEVEN_UITZENDEN.map(r => Object.assign({}, r)),
    tekenaars:{
      pg:[{naam:'Tjeerd van Elk', functie:'Eigenaar'}],
      og:[{naam:'', functie:''}]
    },
    /* Alleen AFWIJKINGEN: {aan:false} en/of {tekst:'...'}. Wat hier niet
       in staat volgt automatisch de template. */
    delen:{}
  };
}

/* Standaard-uitzettingen voor een GLASHELDER NIEUW stuk (niet voor het
   herladen van een bestaand stuk — anders zou een expliciet weer
   aangezet artikel na herladen alsnog uit staan, zie normaliseer()). */
function nieuwStukDelen(){
  return {'2-vervanging-uitzenden':{aan:false}, '2-retainer':{aan:false}};
}

/* Model uit een klant vullen. Alles blijft overschrijfbaar. */
function vulUitKlant(v, klantNaam){
  const naam = t(klantNaam);
  if(!naam) return v;
  const kl = (CRM.klant && CRM.klant(naam)) || (CRM.state.clients || []).find(c => c.naam === naam) || {};
  const cts = (CRM.state.contacten || []).filter(c => c.klant === naam);
  const ct = cts.find(c => c.hoofd) || cts[0] || null;
  v.og.naam     = naam;
  v.og.pcplaats = t(kl.locatie);
  v.og.contact  = ct ? t(ct.naam) : '';
  v.og.email    = t(ct && ct.email)    || t(kl.email);
  v.og.telefoon = t(ct && ct.telefoon) || t(kl.telefoon);
  if(ct && t(ct.naam)) v.tekenaars.og = [{naam:t(ct.naam), functie:t(ct.functie)}];
  return v;
}

/* Oude stukken kunnen velden missen als de template groeit. */
function normaliseer(raw){
  const v = leegModel();
  if(!raw || typeof raw !== 'object') return v;
  if(raw.omslag != null) v.omslag = !!raw.omslag;
  if(['ws','uitzenden','beide'].includes(raw.vorm)) v.vorm = raw.vorm;
  if(raw.doctitel) v.doctitel = String(raw.doctitel);
  Object.assign(v.og, raw.og || {});
  Object.assign(v.pg, raw.pg || {});
  Object.assign(v.voorwaarden, raw.voorwaarden || {});
  /* Geen .length-eis: een bewust leeggemaakte tabel (alle rijen
     verwijderd) moet ook echt leeg blijven na herladen. */
  if(Array.isArray(raw.tarieven))
    v.tarieven = raw.tarieven.map(r => ({functie:t(r.functie), pct:t(r.pct)}));
  if(Array.isArray(raw.tarievenUitzenden))
    v.tarievenUitzenden = raw.tarievenUitzenden.map(r => ({functie:t(r.functie), factor:t(r.factor)}));
  if(raw.tekenaars){
    if(Array.isArray(raw.tekenaars.pg) && raw.tekenaars.pg.length) v.tekenaars.pg = raw.tekenaars.pg.map(r => ({naam:t(r.naam), functie:t(r.functie)}));
    if(Array.isArray(raw.tekenaars.og) && raw.tekenaars.og.length) v.tekenaars.og = raw.tekenaars.og.map(r => ({naam:t(r.naam), functie:t(r.functie)}));
  }
  if(raw.delen && typeof raw.delen === 'object'){
    Object.keys(raw.delen).forEach(k => { if(DEEL[k]) v.delen[k] = raw.delen[k]; });
  }
  return v;
}

/* Een deel telt mee als het bij de gekozen vorm hoort: 'alle' (of geen
   vorm-tag) altijd, 'ws'/'uitzenden' alleen bij die vorm of bij 'beide'. */
function vormPast(v, k){
  const vv = DEEL[k].vorm || 'alle';
  return vv === 'alle' || v.vorm === vv || v.vorm === 'beide';
}
/* Standaardtekst kan afhangen van de vorm (bv. de partijen-alinea die
   nooit "werving & selectie" mag noemen in een zuiver Uitzenden-stuk). */
const standaardTekst = (v,k) => typeof DEEL[k].tekst === 'function' ? DEEL[k].tekst(v) : DEEL[k].tekst;
const deelAan   = (v,k) => vormPast(v,k) && !(v.delen[k] && v.delen[k].aan === false);
const deelTekst = (v,k) => (v.delen[k] && v.delen[k].tekst != null) ? v.delen[k].tekst : standaardTekst(v,k);
const deelAfwijkend = (v,k) => !!(v.delen[k] && v.delen[k].tekst != null && v.delen[k].tekst !== standaardTekst(v,k));

function zetDeel(v, k, patch){
  const cur = Object.assign({}, v.delen[k] || {}, patch);
  if(cur.tekst === standaardTekst(v,k)) delete cur.tekst;
  if(cur.aan !== false) delete cur.aan;
  if(Object.keys(cur).length) v.delen[k] = cur; else delete v.delen[k];
}

/* ═══════════════════════════════════════════════════════════════
   4. TEKST → HTML
   Volgorde is bewust: eerst escapen, dan opmaak, dan pas de waarden
   invullen (ook geëscaped). Zo kan geen enkele klantwaarde markup of
   HTML worden.
   ═══════════════════════════════════════════════════════════════ */

const LEEG = '<span class="swo-leeg"></span>';

function nummers(v){
  const map = {}; let n = 0;
  DELEN.forEach(d => { if(d.kop === 'artikel' && deelAan(v, d.k)) map[d.k] = '2.' + (++n); });
  return map;
}

function datumNL(iso){
  const s = t(iso);
  if(!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (m[3] + '-' + m[2] + '-' + m[1]) : s;
}

function waarde(v, sleutel){
  const w = v.voorwaarden;
  switch(sleutel){
    case 'ingangsdatum':  return datumNL(w.ingangsdatum);
    case 'looptijd':      return t(w.looptijd);
    case 'opzegtermijn':  return t(w.opzegtermijn);
    case 'exclusiviteit': return t(w.exclusiviteit);
    case 'proeftijd':     return t(w.proeftijd);
    case 'proeftijd-uitzenden': return t(w.proeftijdUitzenden);
    case 'betaaltermijn': return t(w.betaaltermijn);
    case 'overname-uren': return t(w.overnameUren);
    case 'plaats':        return t(w.plaats);
    case 'opdrachtgever': return t(v.og.naam);
    case 'opdrachtnemer': return t(v.pg.naam);
    default: return null;
  }
}

/* Inline: escapen → **vet** / *groen cursief* → waarden invullen. */
function rijk(s, ctx){
  let out = h(s == null ? '' : s);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/\*([^*]+)\*/g, '<i class="swo-acc">$1</i>');
  return out.replace(/\{(art:)?([a-z0-9_-]+)\}/gi, (m, art, sleutel) => {
    if(art){
      const nr = ctx.nrs[sleutel];
      return nr ? h(nr) : h(DEEL[sleutel] ? DEEL[sleutel].titel : sleutel);
    }
    const w = waarde(ctx.v, sleutel);
    if(w == null) return m;                 /* onbekend: laat staan, niet stilletjes slikken */
    return w ? h(w) : LEEG;
  });
}
/* Tekst zonder opmaak, voor labels in de instellingenkolom. */
const kaal = s => String(s == null ? '' : s).replace(/\*/g, '');

/* ─── Blokken die uit de velden komen ─────────────────────────── */
function partijkaart(label, p, hierna){
  const r = w => t(w) ? h(t(w)) : LEEG;
  return `<div class="swo-partij">
    <div class="swo-partij-l">${h(label)}</div>
    <div class="swo-partij-n">${t(p.naam) ? h(t(p.naam)) : LEEG}</div>
    <div class="swo-partij-r">${r(p.adres)}</div>
    <div class="swo-partij-r">${r(p.pcplaats)}</div>
    <div class="swo-partij-r">KvK: ${r(p.kvk)}</div>
    ${t(p.contact) ? `<div class="swo-partij-r">${h(t(p.contact))}</div>` : ''}
    <div class="swo-partij-r">${r(p.email)}</div>
    <div class="swo-partij-r">${r(p.telefoon)}</div>
    <div class="swo-partij-h">Hierna: ${hierna}</div>
  </div>`;
}

function blokPartijen(v){
  return `<div class="swo-partijen">
    ${partijkaart('Opdrachtnemer', v.pg, '<b>Ploeggenoten</b> of <b>Opdrachtnemer</b>')}
    ${partijkaart('Opdrachtgever', v.og, '<b>Opdrachtgever</b>')}
  </div>`;
}

function blokTarievenWS(v){
  const rijen = (v.tarieven || []).filter(r => t(r.functie) || t(r.pct));
  if(!rijen.length) return '';
  return `<table class="swo-tabel"><thead><tr>
      <th>Functiegroep</th><th>W&amp;S-fee</th>
    </tr></thead><tbody>
      ${rijen.map(r => `<tr><td>${t(r.functie) ? h(t(r.functie)) : LEEG}</td><td>${t(r.pct) ? h(t(r.pct)) : LEEG}</td></tr>`).join('')}
    </tbody></table>`;
}

function blokTarievenUitzenden(v){
  const rijen = (v.tarievenUitzenden || []).filter(r => t(r.functie) || t(r.factor));
  if(!rijen.length) return '';
  return `<table class="swo-tabel"><thead><tr>
      <th>Functiegroep</th><th>Factor</th>
    </tr></thead><tbody>
      ${rijen.map(r => `<tr><td>${t(r.functie) ? h(t(r.functie)) : LEEG}</td><td>${t(r.factor) ? h(t(r.factor)) : LEEG}</td></tr>`).join('')}
    </tbody></table>`;
}

/* metVandaag: Ploeggenoten tekent op het moment dat dit document wordt
   gemaakt, dus die datum staat er meteen bij. De opdrachtgever tekent
   later fysiek — dat vakje blijft leeg. Tjeerd's eigen handtekening
   verschijnt alleen bij zijn naam, niet bij een andere ondertekenaar
   die eventueel namens Ploeggenoten wordt toegevoegd. */
function tekenBlok(lijst, metVandaag){
  const rijen = (lijst && lijst.length ? lijst : [{naam:'', functie:''}]);
  return rijen.map(p => {
    const isTjeerd = metVandaag && t(p.naam).toLowerCase() === 'tjeerd van elk';
    return `<div class="swo-teken">
      <div class="swo-teken-v">Naam:&nbsp;<i>${t(p.naam) ? h(t(p.naam)) : ''}</i></div>
      <div class="swo-teken-v">Functie:&nbsp;<i>${t(p.functie) ? h(t(p.functie)) : ''}</i></div>
      <div class="swo-teken-s">${isTjeerd ? `<img class="swo-handtekening" src="assets/handtekening-tjeerd.png" alt="Handtekening ${h(t(p.naam))}">` : ''}</div>
      <div class="swo-teken-c">Handtekening &nbsp;·&nbsp; Datum${metVandaag ? ':&nbsp;' + h(datumNL(CRM.todayISO())) : ''}</div>
    </div>`;
  }).join('');
}

function blokOndertekening(v){
  return `<div class="swo-tekenen">
    <div>
      <div class="swo-teken-l">Opdrachtnemer</div>
      <div class="swo-teken-n">${t(v.pg.naam) ? h(t(v.pg.naam)) : LEEG}</div>
      ${tekenBlok(v.tekenaars.pg, true)}
    </div>
    <div>
      <div class="swo-teken-l">Opdrachtgever</div>
      <div class="swo-teken-n">${t(v.og.naam) ? h(t(v.og.naam)) : LEEG}</div>
      ${tekenBlok(v.tekenaars.og, false)}
    </div>
  </div>`;
}

/* ─── Regel-taal → atomen ─────────────────────────────────────── */
/* Een atoom is één ondeelbaar blok op de pagina.
   samen:true = mag niet als laatste op een pagina staan (kop bij tekst). */
function parse(tekst, ctx){
  const regels = String(tekst == null ? '' : tekst).split('\n');
  const at = [];
  let i = 0;
  const R = s => rijk(s, ctx);

  while(i < regels.length){
    const rl = regels[i];
    const s = rl.trim();
    if(!s){ i++; continue; }

    /* Opsomming */
    if(/^-\s/.test(s)){
      const items = [];
      while(i < regels.length && /^-\s/.test(regels[i].trim())){ items.push(regels[i].trim().slice(2)); i++; }
      at.push({html:`<ul class="swo-lijst">${items.map(x => `<li>${R(x)}</li>`).join('')}</ul>`});
      continue;
    }
    /* Citaatblok (groen vlak) */
    if(/^>>\s?/.test(s)){
      const rr = [];
      while(i < regels.length && /^>>\s?/.test(regels[i].trim())){ rr.push(regels[i].trim().replace(/^>>\s?/, '')); i++; }
      at.push({html:`<div class="swo-citaat">${rr.map(R).join('<br>')}</div>`});
      continue;
    }
    /* Uitspraak met limebalk */
    if(/^>\s?/.test(s)){
      const rr = [];
      while(i < regels.length && /^>\s?/.test(regels[i].trim()) && !/^>>/.test(regels[i].trim())){ rr.push(regels[i].trim().replace(/^>\s?/, '')); i++; }
      at.push({html:`<div class="swo-uitspraak">${rr.map(R).join('<br>')}</div>`});
      continue;
    }
    /* Genummerde stappen */
    if(/^@@?\s/.test(s)){
      const licht = /^@@\s/.test(s);
      const stappen = [];
      while(i < regels.length){
        const q = regels[i].trim();
        if(!(licht ? /^@@\s/ : /^@\s/).test(q) || (!licht && /^@@\s/.test(q))) break;
        const d = q.replace(/^@@?\s/, '').split('|');
        stappen.push({nr:t(d[0]), titel:t(d[1]), tekst:t(d.slice(2).join('|'))});
        i++;
      }
      at.push({html:`<div class="swo-stappen ${licht ? 'licht' : 'donker'}">${
        stappen.map(x => `<div class="swo-stap"><div class="swo-stap-n">${h(x.nr)}</div>
          <div class="swo-stap-t"><b>${R(x.titel)}</b><span>${R(x.tekst)}</span></div></div>`).join('')
      }</div>`});
      continue;
    }
    /* Pijlerkaarten, twee naast elkaar */
    if(/^\+\s/.test(s)){
      const p = [];
      while(i < regels.length && /^\+\s/.test(regels[i].trim())){
        const d = regels[i].trim().slice(2).split('|');
        p.push({label:t(d[0]), titel:t(d[1]), tekst:t(d.slice(2).join('|'))});
        i++;
      }
      at.push({html:`<div class="swo-pijlers">${
        p.map(x => `<div class="swo-pijler"><div class="swo-pijler-l">${h(x.label)}</div>
          <div class="swo-pijler-n">${R(x.titel)}</div><div class="swo-pijler-t">${R(x.tekst)}</div></div>`).join('')
      }</div>`});
      continue;
    }
    /* Kaderblok */
    if(/^=\s/.test(s)){
      const d = s.slice(2).split('|');
      at.push({html:`<div class="swo-kader">
        <div class="swo-kader-l">${h(t(d[0]))}</div>
        <div class="swo-kader-n">${R(t(d[1]))}</div>
        ${d.slice(2).map(x => `<div class="swo-p">${R(t(x))}</div>`).join('')}
      </div>`});
      i++; continue;
    }
    /* Statement met label en lime lijn */
    if(/^!\s/.test(s)){
      const d = s.slice(2).split('|');
      at.push({html:`<div class="swo-statement">
        <div class="swo-statement-l">${h(t(d[0]))}</div>
        <div class="swo-statement-t">${R(t(d.slice(1).join('|')))}</div>
      </div>`});
      i++; continue;
    }
    /* Koppen */
    if(/^###\s/.test(s)){ at.push({html:`<div class="swo-sub2">${R(s.slice(4))}</div>`, samen:true}); i++; continue; }
    if(/^##\s/.test(s)){  at.push({html:`<div class="swo-sub">${R(s.slice(3))}</div>`, samen:true}); i++; continue; }
    if(/^#!\s/.test(s)){  at.push({html:`<div class="swo-label">${h(t(s.slice(3)))}</div>`, samen:true}); i++; continue; }
    /* Blokken uit de velden */
    if(s === '{partijen}'){        at.push({html:blokPartijen(ctx.v)}); i++; continue; }
    if(s === '{tarieven}'){        at.push({html:blokTarievenWS(ctx.v)}); i++; continue; }
    if(s === '{tarieven-uitzenden}'){ at.push({html:blokTarievenUitzenden(ctx.v)}); i++; continue; }
    if(s === '{ondertekening}'){   at.push({html:blokOndertekening(ctx.v)}); i++; continue; }
    if(s === '{ingangsdatum-regel}'){
      const d = datumNL(ctx.v.voorwaarden.ingangsdatum);
      at.push({html:`<div class="swo-ingang"><b>Ingangsdatum</b><span>${d ? h(d) : LEEG}</span></div>`});
      i++; continue;
    }
    /* Gewone alinea. Sub-bepalingen die met (a) of (i) beginnen springen
       in, precies zoals in de getekende overeenkomst. */
    const inspring = /^\((?:[a-z]|i{1,3}v?|vi{0,3})\)\s/i.test(s);
    at.push({html:`<div class="swo-p${inspring ? ' swo-in' : ''}">${R(s)}</div>`});
    i++;
  }
  return at.filter(a => a.html);
}

/* ─── Alle atomen van het hele document ───────────────────────── */
function bouwAtomen(v){
  const ctx = {v, nrs:nummers(v)};
  const at = [];
  DELEN.forEach(d => {
    if(!deelAan(v, d.k)) return;
    const eigen = [];
    if(d.kop === 'sectie')
      eigen.push({html:`<div class="swo-sectie">${rijk(d.titel, ctx)}</div>`, samen:true});
    else if(d.kop === 'hoofdstuk')
      eigen.push({html:`<div class="swo-hoofdstuk"><span class="swo-hl">${h(d.hoofdstuk || '')}</span>
        <div class="swo-ht">${rijk(d.titel, ctx)}</div></div>`, samen:true});
    else if(d.kop === 'sub')
      eigen.push({html:`<div class="swo-sub">${rijk(d.titel, ctx)}</div>`, samen:true});
    else if(d.kop === 'label')
      eigen.push({html:`<div class="swo-label">${h(kaal(d.titel))}</div>`, samen:true});
    else if(d.kop === 'artikel')
      eigen.push({html:`<div class="swo-art">${h(ctx.nrs[d.k] || '')} ${rijk(d.titel, ctx)}</div>`, samen:true});

    const body = parse(deelTekst(v, d.k), ctx);
    if(!eigen.length && !body.length) return;
    if(d.nieuwePagina && at.length) (eigen[0] || body[0]).breek = true;
    at.push.apply(at, eigen.concat(body));
  });
  return at;
}

/* ═══════════════════════════════════════════════════════════════
   5. VEL EN PAGINAVERDELING
   ═══════════════════════════════════════════════════════════════ */

function omslagHtml(v){
  const og = t(v.og.naam);
  const d  = datumNL(v.voorwaarden.ingangsdatum);
  return `<article class="swo-vel omslag"><div class="swo-omslag-in">
    <img src="assets/logo-lime.png" alt="Ploeggenoten">
    <div class="swo-claim">
      <div class="swo-claim-1">SAME<span>N</span></div>
      <div class="swo-claim-2">in de ploeg.</div>
      <div class="swo-claim-3">ZO BLIJF<span>T</span></div>
      <div class="swo-claim-4">het draaien.</div>
      <div class="swo-omslag-doc">
        <b>${h(t(v.doctitel) || DOCTITEL)}</b>
        ${og ? h(og) : 'Opdrachtgever nog niet ingevuld'}${d ? ' &nbsp;·&nbsp; ingangsdatum ' + h(d) : ''}
      </div>
    </div>
  </div></article>`;
}

function kopHtml(v){
  return `<header class="swo-kop">
    <img src="assets/logo-dark.png" alt="Ploeggenoten">
    <div class="swo-kop-r">${h(t(v.doctitel) || DOCTITEL)}</div>
  </header>`;
}
function voetHtml(v, nr){
  return `<footer class="swo-voet">
    <div>${h(t(v.pg.naam) || PG.naam)} &nbsp;|&nbsp; KvK ${h(t(v.pg.kvk) || PG.kvk)} &nbsp;|&nbsp; ${h(t(v.pg.email) || PG.email)}</div>
    <div class="swo-voet-r">Pagina ${nr}</div>
  </footer>`;
}
function slotVoetHtml(v){
  return `<footer class="swo-voet">
    <div>${h(t(v.pg.naam) || PG.naam)} &nbsp;|&nbsp; ${h(t(v.voorwaarden.plaats) || VOORWAARDEN.plaats)}</div>
    <div class="swo-voet-r">${h(t(v.pg.email) || PG.email)} &nbsp;|&nbsp; ${h(t(v.pg.telefoon) || PG.telefoon)}</div>
  </footer>`;
}

/* Verdeel de atomen over pagina's op basis van gemeten hoogtes. */
function verdeel(atomen, hoogtes, H){
  const paginas = []; let cur = [], y = 0;
  const groepHoogte = i => {
    let tot = 0, j = i;
    while(j < atomen.length){ tot += hoogtes[j]; if(!atomen[j].samen) break; j++; }
    return tot > H ? hoogtes[i] : tot;      /* past nooit? dan niet eindeloos doorschuiven */
  };
  for(let i = 0; i < atomen.length; i++){
    if(atomen[i].breek && cur.length){ paginas.push(cur); cur = []; y = 0; }
    const nodig = atomen[i].samen ? groepHoogte(i) : hoogtes[i];
    if(cur.length && y + nodig > H){ paginas.push(cur); cur = []; y = 0; }
    cur.push(i); y += hoogtes[i];
  }
  if(cur.length) paginas.push(cur);
  return paginas.length ? paginas : [[]];
}

/* ═══════════════════════════════════════════════════════════════
   6. OPSLAG — eigen kleine laad/bewaar-helpers (niets in core.js)
   ═══════════════════════════════════════════════════════════════ */

const DEMO_KEY = 'crm_stukken_demo';
function demoAlles(){
  try{ return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]') || []; }catch(e){ return []; }
}
function demoZet(lijst){
  try{ localStorage.setItem(DEMO_KEY, JSON.stringify(lijst)); }catch(e){}
}

async function stukkenVoor(klant){
  if(CRM.demo){
    return demoAlles().filter(s => s.soort === 'swo' && (!klant || s.klant === klant))
      .sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }
  let q = CRM.sb.from('crm_stukken').select('*').eq('soort','swo').order('updated_at',{ascending:false}).limit(50);
  if(klant) q = q.eq('klant', klant);
  const {data, error} = await q;
  if(error){ console.warn('stukken laden', error); return []; }
  return data || [];
}

async function stukLaden(id){
  if(CRM.demo) return demoAlles().find(s => s.id === id) || null;
  const {data, error} = await CRM.sb.from('crm_stukken').select('*').eq('id', id).maybeSingle();
  if(error){ CRM.fout('Overeenkomst laden mislukt', error); return null; }
  return data;
}

async function stukBewaren(stuk){
  stuk.updated_at = new Date().toISOString();
  if(CRM.demo){
    const alles = demoAlles();
    const i = alles.findIndex(s => s.id === stuk.id);
    if(i >= 0) alles[i] = stuk; else alles.unshift(stuk);
    demoZet(alles);
    return true;
  }
  const {error} = await CRM.sb.from('crm_stukken').upsert(stuk);
  if(error){ CRM.fout('Opslaan mislukt', error); return false; }
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   7. HET VENSTER
   ═══════════════════════════════════════════════════════════════ */

let paneelEl = null, sluitHandler = null, schaalWaarnemer = null, printTimer = null;

function schaalBij(){
  /* In printstand staat het vel op ware grootte; dan niet schalen — anders
     blijft de printmaat na afloop als schermschaal hangen. */
  if(!paneelEl || paneelEl.classList.contains('swo-print')) return;
  const wrap = paneelEl.querySelector('.swog-preview');
  const schaal = paneelEl.querySelector('.swog-schaal');
  const bladen = paneelEl.querySelector('.swog-bladen');
  if(!wrap || !schaal || !bladen) return;
  const pad = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
  /* Breedte van het VEL meten, niet van de wikkel: die krimpt straks mee
     met de schaal en dan zou de volgende meting steeds kleiner worden. */
  const eerste = bladen.firstElementChild;
  const breed = (eerste && eerste.offsetWidth) || 794;
  /* Passend op breedte én op één hele pagina in de hoogte — anders zie je
     bij een document van twaalf pagina's nooit een volledig vel. */
  const paginaH = (eerste && eerste.offsetHeight) || 1123;
  /* Op een laag venster (telefoon) zou "hele pagina passend" het vel
     onleesbaar klein maken; dan alleen op breedte passen en scrollen. */
  const hoogtePas = wrap.clientHeight > 420 ? (wrap.clientHeight - pad * 2) / paginaH : Infinity;
  const s = Math.min(1, Math.max(.16,
    Math.min((wrap.clientWidth - pad * 2) / breed, hoogtePas)));
  schaal.style.transform = 'scale(' + s + ')';
  /* De wikkel krijgt de GESCHAALDE maat, anders houdt het voorbeeld op
     smalle schermen een horizontale schuifbalk over. */
  schaal.style.width  = (breed * s) + 'px';
  schaal.style.height = (bladen.offsetHeight * s) + 'px';
}

function open(opts){
  opts = opts || {};
  sluit(true);

  const wrap = document.createElement('div');
  wrap.id = 'swogen'; wrap.className = 'swog';
  wrap.innerHTML = `
    <div class="swog-scrim"></div>
    <div class="swog-paneel" role="dialog" aria-modal="true" aria-label="Samenwerkingsovereenkomst opmaken">
      <header class="swog-kop">
        <div>
          <div class="h2">Samenwerkingsovereenkomst</div>
          <div class="meta" id="swo_kopsub">Nieuwe overeenkomst</div>
        </div>
        <button class="btn sub" id="swo_x" aria-label="Sluiten">✕</button>
      </header>
      <div class="swog-body">
        <aside class="swog-zij" id="swo_zij"></aside>
        <div class="swog-preview">
          <div class="swog-schaal"><div class="swog-bladen" id="swo_bladen"></div></div>
          <div class="swog-meet" id="swo_meet"></div>
        </div>
      </div>
      <footer class="swog-voet">
        <span class="meta" id="swo_stand">—</span>
        <span class="spacer"></span>
        <button class="btn ghost" id="swo_print">Afdrukken / opslaan als PDF</button>
        <button class="btn" id="swo_bewaar">Opslaan</button>
      </footer>
    </div>`;
  document.body.appendChild(wrap);
  paneelEl = wrap;
  document.body.style.overflow = 'hidden';

  const bladenEl = wrap.querySelector('#swo_bladen');
  const meetEl   = wrap.querySelector('#swo_meet');
  const zijEl    = wrap.querySelector('#swo_zij');
  const standEl  = wrap.querySelector('#swo_stand');
  const subEl    = wrap.querySelector('#swo_kopsub');

  /* ─── Toestand ──────────────────────────────────────────────── */
  let v = vulUitKlant(leegModel(), opts.klant);
  if(!opts.stukId) Object.assign(v.delen, nieuwStukDelen());
  let stuk = {
    id:CRM.uid(), soort:'swo', klant:t(opts.klant), kandidaat_id:'',
    titel:'', velden:null, versie:0, status:'concept', door:CRM.me(),
    created_at:new Date().toISOString(), updated_at:new Date().toISOString()
  };
  let openArt = null;                 /* welk artikel staat open in de bewerker */

  /* ─── Tekenen ───────────────────────────────────────────────── */
  function teken(){
    const atomen = bouwAtomen(v);

    /* Meten in een echt vel buiten de schaling: dan kloppen de hoogtes. */
    meetEl.innerHTML = `<article class="swo-vel">${kopHtml(v)}
      <div class="swo-inhoud" id="swo_meetin">${atomen.map(a => `<div class="swo-atoom">${a.html}</div>`).join('')}</div>
      ${voetHtml(v, 1)}</article>`;
    const inhoud = meetEl.querySelector('#swo_meetin');
    /* Ruime marge (was 6px): Safari rendert tekst bij het afdrukken net
       iets hoger dan op het scherm gemeten. Bij een marge van 6px paste
       de laatste regel soms net niet meer op het vel — Safari's printer
       laat overflow:hidden dan niet stil verdwijnen, maar reserveert er
       een extra, vrijwel lege pagina voor (Chrome doet dat niet). */
    const H = Math.max(80, inhoud.clientHeight - 45);
    const kids = Array.from(inhoud.children);
    const hoogtes = kids.map(el => el.getBoundingClientRect().height);

    const paginas = verdeel(atomen, hoogtes, H);
    const totaal = paginas.length + (v.omslag ? 1 : 0);
    let nr = v.omslag ? 1 : 0;
    const vellen = paginas.map((idxs, p) => {
      nr++;
      const slot = (p === paginas.length - 1);
      return `<article class="swo-vel${slot ? ' slot' : ''}">${kopHtml(v)}
        <div class="swo-inhoud">${idxs.map(i => `<div class="swo-atoom">${atomen[i].html}</div>`).join('')}</div>
        ${slot ? slotVoetHtml(v) : voetHtml(v, nr)}</article>`;
    });
    bladenEl.innerHTML = (v.omslag ? omslagHtml(v) : '') + vellen.join('');
    meetEl.innerHTML = '';

    const zichtbaarStand = DELEN.filter(d => vormPast(v, d.k));
    const uit = zichtbaarStand.filter(d => !deelAan(v, d.k)).length;
    const afw = zichtbaarStand.filter(d => deelAfwijkend(v, d.k)).length;
    standEl.textContent = totaal + ' pagina' + (totaal === 1 ? '' : "'s")
      + (uit ? ' · ' + uit + ' onderdeel' + (uit === 1 ? '' : 'en') + ' uit' : '')
      + (afw ? ' · ' + afw + ' aangepast t.o.v. de standaard' : ' · volledig standaard');
    subEl.textContent = (t(v.og.naam) || 'Nog geen opdrachtgever')
      + (stuk.versie ? ' · versie ' + stuk.versie : ' · nieuw');
    /* Meteen schalen (rAF loopt niet in een achtergrondtab) en daarna nog
       eens, als het logo geladen is en de hoogtes definitief zijn. */
    schaalBij();
    requestAnimationFrame(schaalBij);
  }
  const tekenTraag = CRM.debounce(teken, 180);

  /* ─── Instellingenkolom ─────────────────────────────────────── */
  function veld(id, lbl, val, extra){
    return `<div class="f-row"><label for="${id}">${h(lbl)}</label>
      <input id="${id}" ${extra || ''} value="${h(val || '')}"></div>`;
  }

  function zijHtml(){
    const w = v.voorwaarden;
    const metWS = v.vorm === 'ws' || v.vorm === 'beide';
    const metUitzenden = v.vorm === 'uitzenden' || v.vorm === 'beide';
    return `
    <div class="swog-blok">
      <div class="label" style="margin-bottom:6px">Soort overeenkomst</div>
      <div class="seg" id="swo_vorm" style="width:100%">
        <button type="button" data-vorm="ws" class="${v.vorm === 'ws' ? 'on' : ''}" style="flex:1">W&amp;S</button>
        <button type="button" data-vorm="uitzenden" class="${v.vorm === 'uitzenden' ? 'on' : ''}" style="flex:1">Uitzenden</button>
        <button type="button" data-vorm="beide" class="${v.vorm === 'beide' ? 'on' : ''}" style="flex:1">Beide</button>
      </div>
    </div>

    <div class="swog-blok">
      <label class="swog-schuif">
        <input type="checkbox" id="swo_omslag" ${v.omslag ? 'checked' : ''}>
        <span class="swog-schuif-b"></span>
        <span class="swog-schuif-t"><b>Omslagpagina</b>
          <span class="meta">Uit = alleen het contract</span></span>
      </label>
    </div>

    <details class="swog-blok" open><summary>Opdrachtgever</summary><div class="swog-inh">
      ${veld('swo_og_naam','Bedrijfsnaam', v.og.naam, 'placeholder="Bunge Netherlands B.V."')}
      ${veld('swo_og_adres','Adres', v.og.adres, 'placeholder="Coenhavenweg 3"')}
      ${veld('swo_og_pc','Postcode + plaats', v.og.pcplaats, 'placeholder="1013 BK Amsterdam"')}
      ${veld('swo_og_kvk','KvK-nummer', v.og.kvk, 'inputmode="numeric"')}
      ${veld('swo_og_contact','Contactpersoon', v.og.contact)}
      ${veld('swo_og_email','E-mail', v.og.email, 'type="email"')}
      ${veld('swo_og_tel','Telefoon', v.og.telefoon)}
    </div></details>

    <details class="swog-blok"><summary>Ploeggenoten <span class="swog-tel">vast, wel te wijzigen</span></summary><div class="swog-inh">
      ${veld('swo_pg_naam','Bedrijfsnaam', v.pg.naam)}
      ${veld('swo_pg_adres','Adres', v.pg.adres)}
      ${veld('swo_pg_pc','Postcode + plaats', v.pg.pcplaats)}
      ${veld('swo_pg_kvk','KvK-nummer', v.pg.kvk)}
      ${veld('swo_pg_email','E-mail', v.pg.email)}
      ${veld('swo_pg_tel','Telefoon', v.pg.telefoon)}
    </div></details>

    <details class="swog-blok" open><summary>Voorwaarden</summary><div class="swog-inh">
      ${veld('swo_w_datum','Ingangsdatum', w.ingangsdatum, 'type="date"')}
      ${veld('swo_w_looptijd','Looptijd', w.looptijd)}
      ${veld('swo_w_opzeg','Opzegtermijn', w.opzegtermijn)}
      ${veld('swo_w_excl','Exclusiviteitsperiode bij campagnes', w.exclusiviteit)}
      ${metWS ? veld('swo_w_proef','Proeftijd vervangingsregeling (W&S)', w.proeftijd) : ''}
      ${metUitzenden ? veld('swo_w_proefuz','Proeftijd vervangingsregeling (Uitzenden)', w.proeftijdUitzenden) : ''}
      ${metWS ? veld('swo_w_betaal','Betaaltermijn (W&S)', w.betaaltermijn) : ''}
      ${metUitzenden ? veld('swo_w_overname','Uren-drempel kosteloze overname (Uitzenden)', w.overnameUren) : ''}
      ${veld('swo_w_plaats','Plaats van ondertekening', w.plaats)}
    </div></details>

    ${metWS ? `<details class="swog-blok" open><summary>Fee per functiegroep (W&amp;S) <span class="swog-tel">${v.tarieven.length} rij${v.tarieven.length === 1 ? '' : 'en'}</span></summary>
      <div class="swog-inh" id="swo_tar"></div></details>` : ''}

    ${metUitzenden ? `<details class="swog-blok" open><summary>Factor per functiegroep (Uitzenden) <span class="swog-tel">${v.tarievenUitzenden.length} rij${v.tarievenUitzenden.length === 1 ? '' : 'en'}</span></summary>
      <div class="swog-inh" id="swo_taruz"></div></details>` : ''}

    <details class="swog-blok"><summary>Ondertekenaars</summary><div class="swog-inh" id="swo_tek"></div></details>

    <details class="swog-blok" open><summary>Artikelen <span class="swog-tel" id="swo_arttel"></span></summary>
      <div class="swog-inh" id="swo_art"></div></details>

    <details class="swog-blok"><summary>Eerdere overeenkomsten</summary>
      <div class="swog-inh" id="swo_eerder"><span class="meta">Laden…</span></div></details>`;
  }

  /* Tarieven (W&S: fee-percentage; Uitzenden: omrekenfactor) */
  function tekenTarievenRij(elId, lijst, veldnaam, placeholder, label){
    const el = zijEl.querySelector(elId); if(!el) return;
    el.innerHTML = lijst.map((r, i) => `<div class="swog-rij">
        <input data-tar="functie" data-i="${i}" value="${h(r.functie)}" placeholder="Functiegroep" aria-label="Functiegroep">
        <input class="kort" data-tar="${veldnaam}" data-i="${i}" value="${h(r[veldnaam])}" placeholder="${h(placeholder)}" aria-label="${h(label)}">
        <button class="swog-weg" data-tarweg="${i}" title="Rij verwijderen" aria-label="Rij verwijderen">✕</button>
      </div>`).join('')
      + `<button class="btn ghost sm swog-erbij" id="${elId.slice(1)}_erbij">+ Functiegroep</button>`;
    el.querySelectorAll('input[data-tar]').forEach(inp => inp.oninput = () => {
      lijst[+inp.dataset.i][inp.dataset.tar] = inp.value; tekenTraag();
    });
    el.querySelectorAll('[data-tarweg]').forEach(b => b.onclick = () => {
      lijst.splice(+b.dataset.tarweg, 1);
      tekenTarievenRij(elId, lijst, veldnaam, placeholder, label); teken();
    });
    const erbij = el.querySelector('#' + elId.slice(1) + '_erbij');
    if(erbij) erbij.onclick = () => {
      lijst.push({functie:'', [veldnaam]:''});
      tekenTarievenRij(elId, lijst, veldnaam, placeholder, label); teken();
      const rijen = el.querySelectorAll('input[data-tar="functie"]');
      if(rijen.length) rijen[rijen.length - 1].focus();
    };
  }
  function tekenTarieven(){
    if(v.vorm === 'ws' || v.vorm === 'beide') tekenTarievenRij('#swo_tar', v.tarieven, 'pct', '23%', 'Fee');
    if(v.vorm === 'uitzenden' || v.vorm === 'beide') tekenTarievenRij('#swo_taruz', v.tarievenUitzenden, 'factor', '2,3', 'Factor');
  }
  /* Ondertekenaars */
  function tekenTekenaars(){
    const el = zijEl.querySelector('#swo_tek'); if(!el) return;
    const groep = (kant, titel) => `<div class="label" style="margin-bottom:6px">${h(titel)}</div>` +
      v.tekenaars[kant].map((p, i) => `<div class="swog-rij">
        <input data-tek="naam" data-kant="${kant}" data-i="${i}" value="${h(p.naam)}" placeholder="Naam" aria-label="Naam">
        <input data-tek="functie" data-kant="${kant}" data-i="${i}" value="${h(p.functie)}" placeholder="Functie" aria-label="Functie">
        <button class="swog-weg" data-tekweg="${kant}:${i}" title="Verwijderen" aria-label="Ondertekenaar verwijderen">✕</button>
      </div>`).join('') +
      `<button class="btn ghost sm swog-erbij" data-tekerbij="${kant}">+ Ondertekenaar</button>`;
    el.innerHTML = groep('pg','Namens Ploeggenoten') +
      '<div style="height:14px"></div>' + groep('og','Namens de opdrachtgever');
    el.querySelectorAll('input[data-tek]').forEach(inp => inp.oninput = () => {
      v.tekenaars[inp.dataset.kant][+inp.dataset.i][inp.dataset.tek] = inp.value; tekenTraag();
    });
    el.querySelectorAll('[data-tekweg]').forEach(b => b.onclick = () => {
      const [kant, i] = b.dataset.tekweg.split(':');
      v.tekenaars[kant].splice(+i, 1);
      if(!v.tekenaars[kant].length) v.tekenaars[kant].push({naam:'', functie:''});
      tekenTekenaars(); teken();
    });
    el.querySelectorAll('[data-tekerbij]').forEach(b => b.onclick = () => {
      v.tekenaars[b.dataset.tekerbij].push({naam:'', functie:''}); tekenTekenaars(); teken();
    });
  }

  /* Artikelen: aan/uit, bewerken, terug naar standaard */
  function tekenArtikelen(){
    const el = zijEl.querySelector('#swo_art'); if(!el) return;
    const nrs = nummers(v);
    let groep = '';
    const zichtbaar = DELEN.filter(d => vormPast(v, d.k));
    el.innerHTML = zichtbaar.map(d => {
      const aan = deelAan(v, d.k), afw = deelAfwijkend(v, d.k);
      const kopregel = d.groep !== groep ? (groep = d.groep,
        `<div class="label" style="margin:12px 0 2px">${h(d.groep)}</div>`) : '';
      return kopregel + `<div class="swog-art">
        <div class="swog-art-k">
          <input type="checkbox" data-aan="${h(d.k)}" ${aan ? 'checked' : ''} aria-label="${h(kaal(d.titel))} tonen">
          <div class="swog-art-t${aan ? '' : ' uit'}">
            ${nrs[d.k] ? `<span class="swog-nr">${h(nrs[d.k])}</span>` : ''}${h(kaal(d.titel))}
          </div>
          <div class="swog-art-b">
            <button class="btn sub" data-bew="${h(d.k)}">${openArt === d.k ? 'Sluiten' : 'Bewerken'}</button>
            ${afw ? `<button class="btn sub" data-std="${h(d.k)}" title="Terug naar de standaardtekst">Standaard</button>` : ''}
          </div>
        </div>
        ${afw ? '<span class="chip amber">Afwijkend van de standaard</span>' : ''}
        ${openArt === d.k ? `<div class="swog-bewerk">
          <textarea data-tekst="${h(d.k)}" spellcheck="false">${h(deelTekst(v, d.k))}</textarea>
          <div class="swog-hint">Eén regel = één blok. <code>##</code> groene kop ·
            <code>###</code> vette kop · <code>#!</code> klein label · <code>-</code> opsomming ·
            <code>&gt;</code> uitspraak · <code>&gt;&gt;</code> citaatblok ·
            <code>**vet**</code> · <code>*groen cursief*</code> ·
            velden als <code>{ingangsdatum}</code>, <code>{looptijd}</code>, <code>{betaaltermijn}</code>.</div>
        </div>` : ''}
      </div>`;
    }).join('');

    const uit = zichtbaar.filter(d => !deelAan(v, d.k)).length;
    const afw = zichtbaar.filter(d => deelAfwijkend(v, d.k)).length;
    const tel = zijEl.querySelector('#swo_arttel');
    if(tel) tel.textContent = (zichtbaar.length - uit) + ' van ' + zichtbaar.length + (afw ? ' · ' + afw + ' aangepast' : '');

    el.querySelectorAll('[data-aan]').forEach(inp => inp.onchange = () => {
      zetDeel(v, inp.dataset.aan, {aan:inp.checked}); tekenArtikelen(); teken();
    });
    el.querySelectorAll('[data-bew]').forEach(b => b.onclick = () => {
      openArt = (openArt === b.dataset.bew) ? null : b.dataset.bew;
      tekenArtikelen();
      const ta = el.querySelector('textarea[data-tekst]');
      if(ta) ta.focus();
    });
    el.querySelectorAll('[data-std]').forEach(b => b.onclick = () => {
      zetDeel(v, b.dataset.std, {tekst:standaardTekst(v, b.dataset.std)});
      tekenArtikelen(); teken();
      CRM.toast('Standaardtekst teruggezet', 'ok');
    });
    const ta = el.querySelector('textarea[data-tekst]');
    if(ta) ta.oninput = CRM.debounce(() => {
      zetDeel(v, ta.dataset.tekst, {tekst:ta.value});
      teken();
      /* Alleen de chip/knop bijwerken zou de cursor uit het veld halen —
         dus de lijst pas opnieuw tekenen als de bewerker dichtgaat. */
      const tl = zijEl.querySelector('#swo_arttel');
      const a2 = zichtbaar.filter(d => deelAfwijkend(v, d.k)).length;
      const u2 = zichtbaar.filter(d => !deelAan(v, d.k)).length;
      if(tl) tl.textContent = (zichtbaar.length - u2) + ' van ' + zichtbaar.length + (a2 ? ' · ' + a2 + ' aangepast' : '');
    }, 250);
  }

  /* Eerder gemaakte overeenkomsten */
  async function tekenEerder(){
    const el = zijEl.querySelector('#swo_eerder'); if(!el) return;
    const lijst = (await stukkenVoor(stuk.klant)).filter(s => s.id !== stuk.id);
    if(!lijst.length){
      el.innerHTML = `<span class="meta">${stuk.klant ? 'Nog geen eerdere overeenkomst voor ' + h(stuk.klant) + '.' : 'Nog geen overeenkomsten opgeslagen.'}</span>`;
      return;
    }
    el.innerHTML = lijst.map(s => `<button class="swog-stuk" data-stuk="${h(s.id)}">
        <span>${h(s.titel || s.klant || 'Overeenkomst')}<br><span class="meta">v${h(s.versie)} · ${h(s.status || 'concept')}</span></span>
        <span class="meta">${h(CRM.fmtDateShort ? CRM.fmtDateShort(s.updated_at) : '')}</span>
      </button>`).join('');
    el.querySelectorAll('[data-stuk]').forEach(b => b.onclick = () => laadStuk(b.dataset.stuk));
  }

  async function laadStuk(id){
    const s = await stukLaden(id);
    if(!s){ CRM.toast('Overeenkomst niet gevonden', 'err'); return; }
    stuk = Object.assign({}, s);
    v = normaliseer(s.velden);
    openArt = null;
    zijEl.innerHTML = zijHtml(); bindZij();
    teken();
    CRM.toast('Overeenkomst geladen (versie ' + s.versie + ')', 'ok');
  }

  function bindZij(){
    const koppel = (id, zet) => {
      const el = zijEl.querySelector('#' + id);
      if(el) el.oninput = () => { zet(el.value); tekenTraag(); };
    };
    const om = zijEl.querySelector('#swo_omslag');
    if(om) om.onchange = () => { v.omslag = om.checked; teken(); };

    zijEl.querySelectorAll('[data-vorm]').forEach(b => b.onclick = () => {
      if(v.vorm === b.dataset.vorm) return;
      const oudeDoctitel = doctitelStandaard(v.vorm);
      v.vorm = b.dataset.vorm;
      if(!t(v.doctitel) || v.doctitel === oudeDoctitel) v.doctitel = doctitelStandaard(v.vorm);
      openArt = null;
      zijEl.innerHTML = zijHtml(); bindZij(); teken();
    });

    koppel('swo_og_naam',    x => v.og.naam = x);
    koppel('swo_og_adres',   x => v.og.adres = x);
    koppel('swo_og_pc',      x => v.og.pcplaats = x);
    koppel('swo_og_kvk',     x => v.og.kvk = x);
    koppel('swo_og_contact', x => v.og.contact = x);
    koppel('swo_og_email',   x => v.og.email = x);
    koppel('swo_og_tel',     x => v.og.telefoon = x);
    koppel('swo_pg_naam',    x => v.pg.naam = x);
    koppel('swo_pg_adres',   x => v.pg.adres = x);
    koppel('swo_pg_pc',      x => v.pg.pcplaats = x);
    koppel('swo_pg_kvk',     x => v.pg.kvk = x);
    koppel('swo_pg_email',   x => v.pg.email = x);
    koppel('swo_pg_tel',     x => v.pg.telefoon = x);
    koppel('swo_w_datum',    x => v.voorwaarden.ingangsdatum = x);
    koppel('swo_w_looptijd', x => v.voorwaarden.looptijd = x);
    koppel('swo_w_opzeg',    x => v.voorwaarden.opzegtermijn = x);
    koppel('swo_w_excl',     x => v.voorwaarden.exclusiviteit = x);
    koppel('swo_w_proef',    x => v.voorwaarden.proeftijd = x);
    koppel('swo_w_proefuz',  x => v.voorwaarden.proeftijdUitzenden = x);
    koppel('swo_w_betaal',   x => v.voorwaarden.betaaltermijn = x);
    koppel('swo_w_overname', x => v.voorwaarden.overnameUren = x);
    koppel('swo_w_plaats',   x => v.voorwaarden.plaats = x);

    tekenTarieven(); tekenTekenaars(); tekenArtikelen(); tekenEerder();
  }

  /* ─── Opslaan ───────────────────────────────────────────────── */
  async function bewaar(){
    const knop = wrap.querySelector('#swo_bewaar');
    knop.disabled = true;
    stuk.klant  = t(v.og.naam) || stuk.klant;
    stuk.titel  = (t(v.doctitel) || doctitelStandaard(v.vorm)) + (stuk.klant ? ' — ' + stuk.klant : '');
    stuk.velden = v;
    stuk.versie = (stuk.versie || 0) + 1;
    stuk.door   = CRM.me();
    const ok = await stukBewaren(stuk);
    knop.disabled = false;
    if(!ok){ stuk.versie--; return; }
    CRM.toast('Opgeslagen als versie ' + stuk.versie + (CRM.demo ? ' (demo — lokaal)' : ''), 'ok');
    if(stuk.klant){
      try{
        await CRM.logActiviteit('klant', stuk.klant, 'doc',
          'Samenwerkingsovereenkomst opgemaakt (versie ' + stuk.versie + ').');
      }catch(e){ console.warn('activiteit loggen', e); }
    }
    subEl.textContent = (t(v.og.naam) || 'Nog geen opdrachtgever') + ' · versie ' + stuk.versie;
    tekenEerder();
  }

  /* ─── Knoppen en afsluiten ──────────────────────────────────── */
  zijEl.innerHTML = zijHtml();
  bindZij();

  wrap.querySelector('.swog-scrim').onclick = () => sluit();
  wrap.querySelector('#swo_x').onclick = () => sluit();
  wrap.querySelector('#swo_print').onclick = () => afdrukken(stuk);
  wrap.querySelector('#swo_bewaar').onclick = bewaar;

  sluitHandler = e => { if(e.key === 'Escape' && e.target.tagName !== 'TEXTAREA') sluit(); };
  document.addEventListener('keydown', sluitHandler);

  if(window.ResizeObserver){
    schaalWaarnemer = new ResizeObserver(() => schaalBij());
    schaalWaarnemer.observe(wrap.querySelector('.swog-preview'));
  }else{
    window.addEventListener('resize', schaalBij);
  }

  teken();
  /* Pas als de webfonts er zijn kloppen de hoogtes; opnieuw indelen. */
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if(paneelEl === wrap) teken(); });

  if(opts.stukId) laadStuk(opts.stukId);
}

function sluit(stil){
  const el = document.getElementById('swogen');
  if(sluitHandler){ document.removeEventListener('keydown', sluitHandler); sluitHandler = null; }
  if(schaalWaarnemer){ try{ schaalWaarnemer.disconnect(); }catch(e){} schaalWaarnemer = null; }
  else window.removeEventListener('resize', schaalBij);
  if(el) el.remove();
  paneelEl = null;
  if(!stil) document.body.style.overflow = '';
}

/* ─── Afdrukken ───────────────────────────────────────────────── */
/* Zelfde aanpak als de CV-generator: de printregels hangen aan
   .swog.swo-print (css/swo.css) zodat je ze ook op het scherm kunt
   controleren. De klasse gaat er meteen weer af. */
/* @page geldt voor het hele document en kan niet per module worden
   afgebakend; css/cv.css zet daar margin:12mm. Dit vel brengt zijn eigen
   marges mee, dus zetten we margin:0 alleen zolang DIT vel geprint wordt. */
function paginaMargeAan(){
  if(document.getElementById('swo-print-page')) return;
  const st = document.createElement('style');
  st.id = 'swo-print-page';
  st.textContent = '@page{size:A4;margin:0}';
  document.head.appendChild(st);
}
function paginaMargeUit(){
  const st = document.getElementById('swo-print-page');
  if(st) st.remove();
}
function printAan(){ if(paneelEl){ paginaMargeAan(); paneelEl.classList.add('swo-print'); } }
function printUit(){
  clearTimeout(printTimer); printTimer = null;
  paginaMargeUit();
  if(paneelEl){ paneelEl.classList.remove('swo-print'); schaalBij(); }
}
window.addEventListener('beforeprint', printAan);
window.addEventListener('afterprint', printUit);

async function afdrukken(stuk){
  if(!paneelEl) return;
  printAan();
  printTimer = setTimeout(printUit, 8000);
  try{ window.print(); }catch(e){ CRM.fout('Afdrukken lukte niet', e); }
  printUit();
  if(stuk && stuk.klant){
    try{ await CRM.logActiviteit('klant', stuk.klant, 'doc', 'Samenwerkingsovereenkomst afgedrukt / als PDF opgeslagen.'); }
    catch(e){ console.warn('activiteit loggen', e); }
  }
}

CRM.swo = {open, sluit, stukken:stukkenVoor};
})();

/* VERZOEK AAN CORE:
   1. index.html moet <link rel="stylesheet" href="css/swo.css"> en
      <script src="js/swo.js"></script> laden (na core.js).
   2. Tjeerd moet supabase/schema.sql draaien; zonder crm_stukken werkt
      opslaan alleen in demo-modus (localStorage).
   3. De omslagpagina van de getekende Bunge-versie is een foto met de
      mascotte. Dat beeld is geen asset in deze repo; de omslag is nu
      opgebouwd uit assets/logo-lime.png en de huisstijlkleuren. Lever
      het originele omslagbeeld aan (bv. assets/swo-omslag.jpg), dan is
      het in css/swo.css één regel: background-image op .swo-vel.omslag.
   4. Aanroepen vanaf de klantkaart:
        CRM.swo.open({klant: k.naam})          // nieuwe overeenkomst
        CRM.swo.open({stukId: rij.id})         // bestaande openen
        await CRM.swo.stukken(k.naam)          // lijst voor op de kaart
*/
