/* ═══════════════════════════════════════════════════════════════
   MODULE: PLAATSINGEN

   Waarom dit scherm bestaat, en waarom het géén bord is.

   Op het Klanttrajecten-bord gaat elke kolom over vóóruitgang: iemand
   staat op Tweede gesprek en de vraag is wat de volgende stap is. Ná de
   handtekening beweegt er niets meer — er is één datum en een aftelling.
   Een kanban-kolom is de verkeerde vorm voor een aftelling: hij vraagt om
   slepen, en er valt niets te slepen. Bovendien liep de kolom 'Gestart'
   nooit leeg, dus hoe beter het ging hoe voller het bord werd.

   De vraag van de accountmanager verandert daar ook. Niet "wat is de
   volgende stap" maar "is deze persoon klaar voor maandag, en heb ik hem
   sinds het tekenen nog gesproken". Dat is een checklist per persoon, en
   die ordent op TIJD — niet op fase.

   'Contract getekend' en 'Gestart' zijn daarom van het bord gehaald. Dit
   scherm is vanaf dat moment de ENIGE plek waar die mensen nog staan.
   Daar volgt één harde eis uit: er mag niemand doorheen vallen. Sinds het
   scherm filters heeft (3 aug 2026) is die eis strenger geworden, niet
   losser: een filter dat stilletjes iemand wegneemt is hier de
   gevaarlijkste fout die er is — wie je niet ziet, bel je niet. Daarom
   zegt de regel onder de tijdlijn altijd hoeveel plaatsingen er buiten
   beeld vallen en waarom, en staat wie géén datum heeft apart bovenaan in
   plaats van nergens.

   GEEN EIGEN RITME. Wat er vóór en na de start moet gebeuren staat in
   js/opvolging.js — nazorg, warm houden, felicitatie. Dit scherm toont
   daar alleen nog het signaal van (een gemist moment in de
   waarschuwingskolom); afvinken gebeurt op de kandidatenkaart, waar de
   momenten met hun knoppen staan. Zou dit scherm zijn eigen momenten
   verzinnen, dan zegt het iets anders dan het dashboard over dezelfde
   persoon, en dan gelooft niemand meer een van beide.

   GEEN FEE. Bewuste keuze, ook al mag het (CRM.magOpbrengstZien()). Dit
   scherm beantwoordt één vraag: is deze persoon klaar om te beginnen.
   Een bedrag helpt daar niet bij, maar trekt wel de aandacht weg van de
   openstaande belletjes — en dat is precies het enige waar hier kleur op
   mag zitten. De fee staat op de kandidatenkaart, één klik verderop.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;

/* ─── Datumrekenen ────────────────────────────────────────────────
   Anker op 12:00 's middags, net als js/opvolging.js. `new Date('2026-03-29')`
   leest de browser als UTC-middernacht; in Nederland is dat 01:00 of 02:00
   lokaal, en precies in de nacht van de zomertijd schuift dat een dag. Vanaf
   het midden van de dag kan geen enkele tijdzonesprong de datum nog over de
   grens duwen. Een startdatum die een dag verspringt is hier niet cosmetisch:
   dan staat iemand in "later gepland" terwijl hij vandaag op de vloer wordt
   verwacht. */
const dag = v => String(v == null ? '' : v).slice(0,10);
const parse = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dag(iso));
  if(!m) return null;
  const d = new Date(+m[1], +m[2]-1, +m[3], 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
};
const isoLoc = d => d.toLocaleDateString('sv-SE');
const plusDagen = (iso, n) => { const d = parse(iso); if(!d) return ''; d.setDate(d.getDate()+n); return isoLoc(d); };
const maandagVan = iso => { const d = parse(iso); if(!d) return ''; d.setDate(d.getDate() - ((d.getDay()+6)%7)); return isoLoc(d); };
const vandaag = () => CRM.todayISO();

/* Verschil in hele dagen tussen twee ISO-datums. Positief = `b` ligt later. */
function dagenTussen(a, b){
  const x = parse(a), y = parse(b);
  if(!x || !y) return null;
  return Math.round((y - x) / 86400000);
}
function isoWeek(iso){
  const d = parse(iso); if(!d) return 0;
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay()+6)%7) + 3);
  const ft = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((x - ft)/864e5 - 3 + ((ft.getUTCDay()+6)%7)) / 7);
}
/* Zelfde vorm als de weekkoppen op het pijplijnbord ("Week 33 · 11 aug–17 aug").
   Bewust letterlijk hetzelfde: wie van het bord hierheen komt hoort dezelfde
   week te herkennen, niet een tweede manier om een week te benoemen. */
function weekLabel(iso){
  const ma = parse(maandagVan(iso));
  if(!ma) return '';
  const zo = new Date(ma); zo.setDate(ma.getDate()+6);
  const f = d => d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
  return 'Week ' + isoWeek(iso) + ' · ' + f(ma) + '–' + f(zo);
}

/* ─── Schermstand ────────────────────────────────────────────────
   Tot 3 aug 2026 bestond dit scherm uit zes gestapelde blokken (zonder datum ·
   deze week · later gepland · net gestart · aan het werk · gestopt), elk met
   een eigen kop, uitleg en teller. Je moest dus zes keer beslissen of iets jou
   aanging, en filteren kon alleen op een zoekterm.

   Nu is het één doorlopende tijdlijn met filters ervoor. De indeling die het
   systeem bedacht is vervangen door de indeling die jij kiest.
   (Tjeerd, 3 aug 2026: "het moet veel overzichtelijker zijn — filteren op een
   klant, op vacatures van de klant, op de tijdlijn.")

   TWEE DATUMS, EN DIE VERSCHILLEN. `geplaatstOp` is de dag dat er getekend is;
   `start` is de eerste werkdag. Daar kan een half jaar tussen zitten. Welke
   van de twee de tijdlijn draagt is een keuze van de gebruiker, en diezelfde
   keuze bepaalt waar de periodefilter op slaat — anders zou je op de ene datum
   filteren en naar de andere kijken. */
const AS_KEY = 'crm_pl_as', W_KEY = 'crm_pl_weergave';
const bewaard = (sleutel, geldig, standaard) => {
  try{ const v = localStorage.getItem(sleutel); return geldig.includes(v) ? v : standaard; }
  catch(e){ return standaard; }
};
const onthoud = (sleutel, waarde) => { try{ localStorage.setItem(sleutel, waarde); }catch(e){} };

const S = {
  zoek:'', mijn:false,
  klant:'', vacature:'',
  /* Waar de periodefilter op slaat, en waar de tijdlijn op hangt. In de tabel
     staan bèide datums als kolom — de schakelaar die je dwong te kiezen is
     daar niet meer nodig, want je wilt juist het verschil zien. */
  periodeOp: bewaard(AS_KEY, ['start','plaatsing'], 'start'),
  periode:'alles',       // alles | week | maand | kwartaal | eigen
  van:'', tot:'',
  gestopt:false,         // gestopte plaatsingen meetonen
  weergave: bewaard(W_KEY, ['tabel','tijdlijn'], 'tabel'),
  /* Een chip uit de actiestrook zet dit; het is een filter bóvenop de rest.
     Bewust een aparte sleutel en geen samenraapsel van gewone filters: je moet
     hem in één klik weer weg kunnen halen, en je moet kunnen zien dát hij
     aanstaat. */
  focus:'',              // '' | zonder | nazorg
  groep:'geen',          // geen | maand | klant
  sort:{kol:'start', op:1}
};
const M = { mount:null };

/* Welke datum draagt de tijdlijn, en welke is de andere? De tweede tonen we
   klein onder de eerste zodra hij afwijkt: dat verschil is precies waar dit
   scherm over gaat en het stond nergens. */
const asDatum     = c => dag(S.periodeOp === 'plaatsing' ? c.geplaatstOp : c.start);
const andersDatum = c => dag(S.periodeOp === 'plaatsing' ? c.start : c.geplaatstOp);
const AS_LABEL    = () => S.periodeOp === 'plaatsing' ? 'plaatsingsdatum' : 'startdatum';

/* ─── Periode ────────────────────────────────────────────────────
   De presets rekenen vanaf vandaag. 'alles' geeft lege grenzen terug en dan
   filtert er niets — belangrijk, want een periode die stilletjes iets
   wegfiltert is op dit scherm de gevaarlijkste fout die er is: iemand die je
   niet ziet, bel je niet. Daarom zegt de teller onderaan altijd hoeveel er
   buiten het filter vallen. */
function periodeGrenzen(){
  const nu = vandaag();
  if(S.periode === 'week'){
    const ma = maandagVan(nu);
    return {van: ma, tot: plusDagen(ma, 6)};
  }
  if(S.periode === 'maand') return {van: nu.slice(0,8) + '01', tot: eindeMaand(nu)};
  if(S.periode === 'kwartaal') return {van: nu, tot: plusMaanden(nu, 3)};
  if(S.periode === 'eigen')   return {van: S.van || '', tot: S.tot || ''};
  return {van:'', tot:''};
}
function eindeMaand(iso){
  const d = parse(iso); if(!d) return '';
  return isoLoc(new Date(d.getFullYear(), d.getMonth()+1, 0));
}
function plusMaanden(iso, n){
  const d = parse(iso); if(!d) return '';
  d.setMonth(d.getMonth()+n);
  return isoLoc(d);
}

/* ─── Toestand en kleur ──────────────────────────────────────────
   Dit scherm bedacht de gekleurde rand ("de kaarten van de kandidaten moeten
   een kleur krijgen, zo zie je beter wie er geplaatst is" — Tjeerd, 3 aug
   2026). Sinds diezelfde dag geldt hij overal (.frand in css/base.css) en
   staat de tekenlogica daar; hier blijft alleen wat er per persoon uit komt.

   De regel is de TIJD en niet de fase: dit scherm groepeert op datum, en dan
   moet de rand hetzelfde zeggen als de kop erboven. Kaarten worden vaak naar
   'Gestart' gesleept zodra het contract rond is, weken vóór de eerste
   werkdag — op de fase afgaan zou hier dus liegen.

   Eén functie, zodat de lijst en de tabel er nooit anders over kunnen denken;
   de tabel had helemaal geen kleur en dat was precies de reden om het hier
   samen te trekken. */
const PL_RAND = {
  werkt: 'var(--green)',   // aan het werk — startdatum is geweest
  komt:  '#5b8bbf',        // getekend, moet nog beginnen (kleur van Voorgesteld)
  weg:   'var(--line-2)'   // gestopt
};
const toestandVan = r =>
  r.c.gestoptOp ? 'weg' : (r.start && r.start <= vandaag()) ? 'werkt' : 'komt';
/* Een gemist contactmoment is het enige waar je vandaag nog iets aan kunt
   doen; dat wint van de toestand (rood, via .fr-let). Een kapotte datum niet:
   dan wéten we niet of er iets gemist is. */
/* ROOD IS VOOR WAT JE VANDAAG NOG KUNT DOEN, niet voor wat voorbij is.
   Dit stond op `gemist` en dat bleek bij honderd plaatsingen rampzalig: op
   vrijwel elke historische regel stond dezelfde zin ("9× contactmoment
   gemist") in rood, ook op mensen die pas over vijftig dagen beginnen — dat
   zijn dan gemiste warm-houd-momenten. Een venster dat vijf maanden geleden
   dichtviel kún je niet meer inhalen; het elke dag als alarm tonen leert het
   team rood te negeren, en dan is het signaal weg op de dag dat het telt.
   `open` is wat er nú openstaat. Dát is het alarm. `gemist` blijft zichtbaar
   als feit in de waarschuwingskolom, gedempt, achter de dingen die je nog
   wél kunt rechtzetten. */
const heeftMissers = r => !!(r.open.length && !r.kapotteDatum);

/* ─── Indexen, één keer per hertekening ──────────────────────────
   Bij 350 kandidaten en een paar duizend activiteiten is "wanneer sprak ik
   deze persoon voor het laatst" de duurste vraag op dit scherm: via
   CRM.activiteitenVoor() loopt hij per kandidaat de hele lijst af. Eén keer
   indexeren maakt er een opzoeking van. Zelfde patroon als js/opvolging.js
   (actIndex) en js/hot.js (index).

   De index leeft precies zolang als de tekenronde die hem nodig heeft: hij
   wordt aan het begin van teken() gebouwd en daarna niet meer aangeraakt. Een
   index die tussen twee rondes blijft hangen is erger dan geen index — dan
   toont het scherm een contactmoment dat je net hebt vastgelegd nog niet. */
let IX = null;
function bouwIndex(){
  const contactSoorten = new Set((CRM.opvolging && CRM.opvolging.CONTACT) || ['bel','gesprek','whatsapp','mail','bezoek']);
  const laatsteContact = new Map();
  (CRM.state.activiteiten || []).forEach(a => {
    if(a.entiteit !== 'kandidaat' || !contactSoorten.has(a.soort)) return;
    const sleutel = String(a.ref), d = dag(a.op);
    const b = laatsteContact.get(sleutel);
    if(!b || d > b) laatsteContact.set(sleutel, d);
  });
  const metContactpersoon = new Set();
  (CRM.state.contacten || []).forEach(ct => { if(ct.klant) metContactpersoon.add(ct.klant); });
  IX = {laatsteContact, metContactpersoon};
}

/* ─── De indeling ────────────────────────────────────────────────
   Op tijd, niet op fase. De volgorde van de tests hieronder ís de indeling,
   dus die volgorde is de beslissing:

   1. gestopt   — een gestopte plaatsing is geen plaatsing meer. Hij staat wél
                  apart onderaan (niet verstopt): wie hier niets zag zou gaan
                  denken dat de persoon nog werkt, en dat is de ene fout die
                  dit scherm nooit mag maken.
   2. geenDatum — getekend zonder startdatum. Dit is het gat dat je nergens
                  ziet en dat je een klant kost, dus het gaat vóór alles wat
                  wél een datum heeft. Onleesbare datums vallen hier ook in:
                  een datum die de browser niet kan lezen is in de praktijk
                  hetzelfde als geen datum, en hem in een weekgroep proppen
                  levert een kop "Week NaN" op.
   3. dezeWeek  — start tussen maandag en zondag van deze week. Gaat vóór
                  "net gestart", ook als iemand maandag al begonnen is: de
                  vraag van deze week ("is dit goed gegaan, is er al gebeld")
                  hoort bij de week zelf, niet bij een lijst van dertig dagen.
   4. later     — start na deze zondag.
   5. netGestart— de eerste 30 dagen ná de start (en vóór deze maandag).
   6. werk      — de rest. Naslag.

   Er is geen zevende geval: elke kandidaat in CRM.PLACED valt in precies één
   van deze zes. Dat is nagerekend in de rapportage en hoort zo te blijven.

   Filteren op fase gaat via CRM.faseIn, nooit met ===: in productie staan nog
   kaarten op oude fasewaarden die CRM.faseNorm vertaalt. */
/* Alle plaatsingen — de bron van dit scherm. Eén definitie, zodat de tellers,
   de tijdlijn en de badge het nooit oneens kunnen zijn over wie erbij hoort. */
const allePlaatsingen = () => CRM.kandidaten().filter(c => CRM.faseIn(c.fase, CRM.PLACED));

/* De tijdlijn. Geeft terug wat er getekend moet worden én wat er buiten beeld
   valt, want dat tweede moet het scherm kunnen zeggen.

   `zonderDatum` staat apart en bovenaan: iemand zonder de gekozen datum kán
   niet op een tijdlijn staan, en juist dat gat is waar dit scherm voor
   bestaat. Onleesbare datums vallen hier ook in — een datum die de browser
   niet kan lezen is in de praktijk hetzelfde als geen datum, en in een
   weekgroep proppen levert een kop "Week NaN" op. */
function tijdlijn(){
  const g = periodeGrenzen();
  const alles = allePlaatsingen();
  const zonderDatum = [], opTijd = [];
  let buitenPeriode = 0, verborgenGestopt = 0;

  const nu = vandaag();
  const heeftOpenNazorg = c => {
    const anoniem = !!(CRM.kandVerwijder && CRM.kandVerwijder.isGeanonimiseerd && CRM.kandVerwijder.isGeanonimiseerd(c));
    const opv = (!anoniem && CRM.opvolging) ? CRM.opvolging.voorKandidaat(c, nu) : null;
    return !!(opv && opv.open.length);
  };
  alles.forEach(c => {
    if(c.gestoptOp && !S.gestopt){ verborgenGestopt++; return; }
    if(!past(c)) return;
    if(S.focus === 'zonder' && parse(dag(c.start))) return;
    if(S.focus === 'nazorg' && !heeftOpenNazorg(c)) return;
    const d = asDatum(c);
    if(!parse(d)){ zonderDatum.push(c); return; }
    if((g.van && d < g.van) || (g.tot && d > g.tot)){ buitenPeriode++; return; }
    opTijd.push(c);
  });

  const opNaam = (a,b) => String(a.naam||'').localeCompare(String(b.naam||''), 'nl');
  opTijd.sort((a,b) => asDatum(a).localeCompare(asDatum(b)) || opNaam(a,b));
  zonderDatum.sort(opNaam);

  return {
    opTijd, zonderDatum, buitenPeriode, verborgenGestopt,
    totaal: alles.length,
    zichtbaar: opTijd.length + zonderDatum.length,
    gefilterd: !!(S.zoek.trim() || S.mijn || S.klant || S.vacature || S.focus || S.periode !== 'alles' || !S.gestopt)
  };
}

/* De keuzelijsten vullen zich met wat er écht op dit scherm staat, niet met
   de hele database: een klant zonder plaatsingen in de lijst zetten levert
   een filter op dat gegarandeerd niets oplevert. De vacaturelijst volgt de
   gekozen klant — dat was de vraag ("op vacatures van de klant"). */
function keuzeKlanten(){
  return [...new Set(allePlaatsingen().map(c => c.klant).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b,'nl'));
}
/* Een kandidaat hangt aan een vacature via vacatureId; staat die er niet, dan
   is de functie op de kaart het enige dat we hebben. Beide worden hier tot
   dezelfde tekst gemaakt, zodat filteren op "Operator" ook werkt bij kaarten
   die nooit aan een vacature zijn gekoppeld. */
function vacatureVan(c){
  const v = c.vacatureId && CRM.state.vacs
    ? CRM.state.vacs.find(x => String(x.id) === String(c.vacatureId)) : null;
  return String((v && v.functie) || c.functie || '').trim();
}
function keuzeVacatures(){
  return [...new Set(allePlaatsingen()
    .filter(c => !S.klant || c.klant === S.klant)
    .map(vacatureVan).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b,'nl'));
}

/* De fee van één plaatsing. Poort is CRM.magOpbrengstZien() en niet
   canSeeMoney(): dat laatste is de bankcijfer-grens (Finance), terwijl de fee
   per plaatsing sinds 31 juli 2026 bewust voor het hele team zichtbaar is.
   Zonder klantafspraak of zonder bruto maandsalaris komt er geen bedrag uit —
   dan is `reden` gevuld en tonen we díé, want een lege cel is een gat en een
   reden is een to-do. Alles in een try: de feeberekening leunt op afspraken
   die in productie onvolledig kunnen zijn, en dit scherm mag daar nooit op
   omvallen. */
function feeVan(c){
  if(!CRM.magOpbrengstZien() || !CRM.fee) return null;
  try{
    const r = CRM.fee.bereken(c, CRM.fee.voorKlant(c.klant, c.geplaatstOp || c.start));
    if(r.fee != null) return {bedrag:r.fee, reden:''};
    return {bedrag:null, reden: r.reden || (r.mist && r.mist.length ? r.mist[0] : '') || r.uitleg || 'geen fee te berekenen'};
  }catch(e){ return {bedrag:null, reden:'fee kon niet berekend worden'}; }
}

/* ─── Eén regel klaarmaken ───────────────────────────────────────
   Alles wat een regel nodig heeft in één object, zodat de HTML-functies niets
   meer hoeven uit te rekenen en niemand per ongeluk twee keer hetzelfde
   berekent. */
function regel(c, groep){
  const nu = vandaag();
  const s = dag(c.start);
  const anoniem = !!(CRM.kandVerwijder && CRM.kandVerwijder.isGeanonimiseerd && CRM.kandVerwijder.isGeanonimiseerd(c));
  /* Van een geanonimiseerde kaart zijn naam en nummer bewust gewist. Het
     ritme opvragen levert daar leeg op (js/opvolging.js doet die controle
     zelf), maar we vragen het hier niet eens: belwerk plannen naar iemand die
     net om verwijdering heeft gevraagd is het soort fout dat je maar één keer
     maakt. De persoon blijft wél in de telling staan — hij is nog steeds een
     lopende plaatsing. */
  const opv = (!anoniem && CRM.opvolging) ? CRM.opvolging.voorKandidaat(c, nu) : null;
  /* Een datum die de browser niet kan lezen (import, met de hand getypt) telt
     hier als géén datum — anders zou "niet-een-d" als startdag op het scherm
     komen, en dan lijkt er een datum te staan terwijl er niets staat. Het
     verschil met echt leeg blijft wel zichtbaar in de blokkerregel: bij een
     onleesbare datum is het veld ingevuld en moet je hem corrigeren, niet
     opvragen bij de klant. */
  const leesbaar = !!parse(s);
  /* De datum waar de tijdlijn op hangt, en de andere. Ze zijn allebei nodig:
     de as bepaalt wáár de regel staat, de toestand (werkt / komt / weg) blijft
     altijd op de échte startdatum rusten. Zou de toestand meebewegen met de
     as, dan zou iemand die in mei getekend heeft en in september begint bij
     'plaatsingsdatum' groen kleuren alsof hij al werkt. */
  const asD = dag(asDatum(c)), anD = dag(andersDatum(c));
  return {
    c, groep, anoniem, start: leesbaar ? s : '', kapotteDatum: !!s && !leesbaar,
    asDatum: parse(asD) ? asD : '',
    /* Alleen tonen als hij er is én afwijkt — anders staat dezelfde datum
       twee keer onder elkaar. */
    andersDatum: (parse(anD) && anD !== asD) ? anD : '',
    /* Voor het tellen en het label: staat de start nog vóór ons? */
    voorStart: !leesbaar || s > nu,
    dagen: leesbaar ? dagenTussen(s, nu) : null,   // positief = al begonnen
    open:   opv ? opv.open   : [],
    gemist: opv ? opv.gemist : [],
    volgende: opv ? opv.volgende : null,
    laatsteContact: IX.laatsteContact.get(String(c.id)) || '',
    fee: feeVan(c),
    blokkers: blokkers(c, leesbaar ? s : '', anoniem, !!s && !leesbaar)
  };
}

/* ─── Wat zit er écht in de weg ──────────────────────────────────
   Terughoudend, met opzet. Dit is géén volledigheidsscore: die staat al op de
   kandidatenkaart (CRM.volledigheid) en levert hier alleen maar een rij
   gele vlaggetjes op die iedereen na twee dagen wegkijkt. Wat hier staat zijn
   vier dingen die een start daadwerkelijk laten mislukken:

     - geen startdatum   → er is niets om je op voor te bereiden;
     - geen klant        → je weet niet waar hij heen moet;
     - geen contactpersoon bij die klant → je weet niet bij wie hij zich meldt,
       en dat is de klassieke eerste-dag-ramp;
     - geen telefoonnummer → je kunt hem vóór de start niet bereiken.

   Alleen vóór de start. Wie al aan het werk is heeft de eerste dag overleefd;
   een ontbrekend telefoonnummer is dan een administratief gebrek en geen
   blokkade, en het hoort niet in een lijst te staan die urgentie uitstraalt. */
function blokkers(c, start, anoniem, kapotteDatum){
  const uit = [];
  if(anoniem) return uit;
  const nu = vandaag();
  if(start && start <= nu) return uit;
  if(kapotteDatum) uit.push('startdatum is onleesbaar — corrigeer hem op de kaart');
  else if(!start) uit.push('geen startdatum');
  if(!String(c.klant || '').trim()) uit.push('geen klant op de kaart');
  else if(!IX.metContactpersoon.has(c.klant)) uit.push('geen contactpersoon bij ' + c.klant);
  if(!String(c.telefoon || '').trim()) uit.push('geen telefoonnummer');
  return uit;
}

/* ─── Zoeken en filteren ─────────────────────────────────────────
   Alles behalve de periode; die zit in tijdlijn(), omdat daar de gekozen
   datum-as bekend is. */
function past(c){
  if(S.mijn && CRM.me() && c.rec !== CRM.me()) return false;
  if(S.klant && c.klant !== S.klant) return false;
  if(S.vacature && vacatureVan(c) !== S.vacature) return false;
  const q = S.zoek.trim().toLowerCase();
  if(!q) return true;
  return [c.naam, c.klant, c.functie, c.rec].some(v => String(v||'').toLowerCase().includes(q));
}

/* ─── Presentatie van een datum ──────────────────────────────────
   CRM.geleden() geeft "over 3 dagen" / "gisteren" / "vandaag" en wordt op het
   hele scherm gebruikt. Hier niet zelf iets formuleren: het dashboard zegt
   dan "over 3 dagen" waar dit scherm "nog 3 dagen" zegt over dezelfde datum. */
function startTekst(r){
  if(!r.asDatum){
    if(r.kapotteDatum) return '<span class="pl-geen">datum onleesbaar</span>';
    return `<span class="pl-geen">geen ${h(AS_LABEL())}</span>`;
  }
  const dgn = dagenTussen(r.asDatum, vandaag());   // positief = geweest
  const klasse = dgn === 0 ? ' nu' : (dgn < 0 && dgn >= -3) ? ' bijna' : '';
  /* De tweede datum eronder, klein. Dit is de hele reden dat de as een keuze
     is: tekenen en beginnen zijn twee verschillende dagen en soms zit er een
     half jaar tussen. Wie naar de startdatum kijkt wil kunnen zien hoe lang
     die persoon al vastligt, en andersom. */
  const ander = r.andersDatum
    ? `<span class="pl-ander">${h(S.periodeOp === 'plaatsing' ? 'start' : 'getekend')} ${h(CRM.fmtDateShort(r.andersDatum))}</span>`
    : '';
  return `<span class="pl-start${klasse}"><span class="num">${h(CRM.fmtDay(r.asDatum))}</span>`
       + `<span class="pl-af">${h(CRM.geleden(r.asDatum))}</span></span>${ander}`;
}

/* ─── De waarschuwingskolom ──────────────────────────────────────
   Eén kolom, en er staat alleen iets in als er iets mis is. Dat was de keuze:
   een kale regel houdt de lijst leesbaar, maar de signalen mochten niet
   verdwijnen. Dus precies één melding per regel — de ergste — en de rest in
   de tooltip. Twee waarschuwingen naast elkaar en je leest er geen meer.

   De volgorde ís de rangorde:
     1. een gemist contactmoment — het enige dat je vandaag nog kunt inhalen;
     2. een blokker vóór de start (geen datum, geen contactpersoon, geen
        nummer) — die kosten je de eerste werkdag;
     3. fase en datum die elkaar tegenspreken — een administratief gebrek,
        geen alarm, dus gedempt en als laatste.
   Alleen bij een ontbrekende startdatum staat er een knop: dat is het enige
   veld dat je vanaf dit scherm kunt invullen, en iemand daarvoor naar de
   kandidatenkaart sturen betekent in de praktijk dat het niet gebeurt. */
function waarschuwing(r){
  const c = r.c, nu = vandaag();
  /* Volgorde is rangorde. Wat nu openstaat gaat voorop — dat is het enige
     contactmoment waar je vandaag nog iets aan kunt doen. Blokkers vóór de
     start daarna. Wat gemist is staat achteraan en alleen als aantal: het is
     naslag, geen opdracht. */
  const alle = [];
  if(r.open.length)   alle.push(`${r.open.length} contactmoment${r.open.length===1?'':'en'} open`);
  r.blokkers.forEach(b => alle.push(b));
  if(r.gemist.length) alle.push(`${r.gemist.length}× eerder gemist`);
  if(CRM.faseIs(c.fase, 'Contract getekend') && r.start && r.start <= nu)
    alle.push('staat nog op Contract getekend');
  else if(CRM.faseIs(c.fase, 'Gestart') && r.start && r.start > nu)
    alle.push('staat op Gestart, maar de startdatum ligt nog voor ons');
  if(!alle.length) return '';

  const geenStart = !r.start && !r.kapotteDatum;
  /* Staat de rij in het blok "Zonder startdatum", dan zegt de datumkolom dat
     al met zoveel woorden. Hem hier hérhalen levert twee keer dezelfde tekst
     op één regel op; de knop blijft wel staan, want dat is het enige veld dat
     je vanaf dit scherm kunt invullen. Bij de plaatsingsdatum-as gaat de
     datumkolom over een ándere datum, dus daar blijft de melding staan. */
  const zichtbaar = (geenStart && !r.asDatum && S.periodeOp === 'start')
    ? alle.filter(t => t !== 'geen startdatum') : alle;
  const knop = geenStart
    ? ` <button type="button" class="btn ghost sm" data-startdatum="${h(c.id)}">Invullen</button>` : '';
  if(!zichtbaar.length) return knop ? `<span class="pl-let">${knop}</span>` : '';

  const ernstig = !!r.open.length;
  const titel = zichtbaar.length > 1 ? ` title="${h(zichtbaar.join(' · '))}"` : '';
  return `<span class="pl-let${ernstig ? ' erg' : ''}"${titel}>${h(zichtbaar[0])}${
    zichtbaar.length > 1 ? ` <span class="pl-letn num">+${zichtbaar.length-1}</span>` : ''}${knop}</span>`;
}

/* Eén persoon, één regel. Vier kolommen die over de hele lijst uitlijnen, zodat
   je verticaal kunt scannen: wie · waar · wat er mis is · wanneer.
   Recruiter, laatst gesproken en de opvolgmomenten stonden hier ook; die zijn
   naar de kandidatenkaart verhuisd, één klik verderop.
   (Tjeerd, 3 aug 2026: "het moet heel duidelijk en overzichtelijk zijn.") */
function rijHtml(r){
  const c = r.c;
  const sub = [c.functie, c.klant].filter(Boolean).join(' @ ') || '—';
  const kleur = toestandVan(r);
  const missers = heeftMissers(r);
  return `<div${CRM.ui.frand(PL_RAND[kleur], `pl-r pl-${kleur}${missers ? ' mis' : ''}`, !!missers)} data-kaart="${h(c.id)}" role="button" tabindex="0">
    <span class="pl-naam trunc">${h(c.naam || '—')}</span>
    <span class="pl-sub trunc">${h(sub)}</span>
    <span class="pl-letkol">${waarschuwing(r)}</span>
    <span class="pl-datkol">${startTekst(r)}</span>
  </div>`;
}

/* ─── De tijdlijn tekenen ────────────────────────────────────────
   Eén doorlopende lijst met scheiders ertussen. Twee dingen maken hem
   leesbaar en die zijn allebei nodig:

   SCHAAL. Bij een korte periode wil je weken zien ("wie start er volgende
   week"), bij een jaar wil je maanden — anders krijg je tweeënvijftig
   koppen met soms één naam eronder. De grens ligt op tien weken, gemeten
   over wat er daadwerkelijk in beeld staat en niet over de gekozen periode:
   filter je op één klant, dan zijn dat misschien vier plaatsingen verspreid
   over een jaar, en dan zijn maanden het juiste raster.

   VANDAAG. Zonder markering is een doorlopende lijst stuurloos — je ziet wel
   datums maar niet waar het heden zit, en dat is precies de scheiding tussen
   "hier kan ik niets meer aan doen" en "hier moet ik iets voor regelen".
   De streep komt vóór de eerste regel die vandaag of later valt, en alleen
   als er ook iets vóór staat. */
function tijdlijnHtml(rijen){
  if(!rijen.length) return '';
  const nu = vandaag();
  const eerste = rijen[0].asDatum, laatste = rijen[rijen.length-1].asDatum;
  const spanDagen = Math.abs(dagenTussen(eerste, laatste) || 0);
  const perMaand = spanDagen > 70;

  const sleutel = r => perMaand ? r.asDatum.slice(0,7) : maandagVan(r.asDatum);
  const label   = r => perMaand ? maandLabel(r.asDatum) : weekLabel(r.asDatum);

  /* Vooraf tellen per groep; anders telt hij binnen de lus voor elke regel
     opnieuw de hele lijst af (dat was het geval bij de oude weekgroepen). */
  const tellen = new Map();
  rijen.forEach(r => { const k = sleutel(r); tellen.set(k, (tellen.get(k)||0)+1); });

  const heeftVerleden = rijen.some(r => r.asDatum < nu);
  let uit = '', huidig = null, streepGezet = !heeftVerleden;
  rijen.forEach(r => {
    const k = sleutel(r);
    if(k !== huidig){
      huidig = k;
      uit += `<div class="pl-wdiv"><span>${h(label(r))}</span><b class="num">${h(tellen.get(k))}</b></div>`;
    }
    if(!streepGezet && r.asDatum >= nu){
      streepGezet = true;
      uit += `<div class="pl-nu"><span>vandaag</span></div>`;
    }
    uit += rijHtml(r);
  });
  return uit;
}

function maandLabel(iso){
  const d = parse(iso); if(!d) return '';
  const m = ['januari','februari','maart','april','mei','juni','juli',
             'augustus','september','oktober','november','december'][d.getMonth()];
  return m + ' ' + d.getFullYear();
}

const geenHtml = tekst => `<p class="pl-leeg meta">${h(tekst)}</p>`;

/* ─── De actiestrook ─────────────────────────────────────────────
   Drie klikbare chips die NOOIT met je filter meebewegen. Dat is met opzet:
   dit scherm is de enige plek waar getekende kandidaten nog staan, dus er moet
   één plek zijn die onafhankelijk van je filter zegt of er iemand omvalt.
   Ze vervangen de vier KPI-tegels die hier stonden. Die waren bedoeld als
   samenvatting, maar hun echte functie was alarm — en een alarm is een regel,
   geen banner van negentig pixels. De samenvatting staat nu in de cijferstrook
   eronder, die wél meebeweegt. */
function actiestrookHtml(){
  const nu = vandaag(), ma = maandagVan(nu), zo = plusDagen(ma, 6);
  const lopend = allePlaatsingen().filter(c => !c.gestoptOp);
  const dezeWeek = lopend.filter(c => { const d = dag(c.start); return d >= ma && d <= zo; }).length;
  const zonder   = lopend.filter(c => !parse(dag(c.start))).length;
  let nazorg = 0;
  lopend.forEach(c => {
    const anoniem = !!(CRM.kandVerwijder && CRM.kandVerwijder.isGeanonimiseerd && CRM.kandVerwijder.isGeanonimiseerd(c));
    const opv = (!anoniem && CRM.opvolging) ? CRM.opvolging.voorKandidaat(c, nu) : null;
    if(opv && opv.open.length) nazorg++;
  });
  const chip = (n, tekst, actie, klasse) =>
    `<button type="button" class="pl-act${n?'':' leeg'}${klasse?' '+klasse:''}${S.focus===actie?' aan':''}" data-act="${h(actie)}"${n?'':' disabled'} aria-pressed="${S.focus===actie}">
      <span class="num">${n}</span> ${h(tekst)}</button>`;
  return `<div class="pl-acts">
    ${chip(dezeWeek, dezeWeek === 1 ? 'start deze week' : 'starten deze week', 'week')}
    ${chip(zonder, 'zonder startdatum', 'zonder', zonder ? 'amber' : '')}
    ${chip(nazorg, 'nazorg open nu', 'nazorg', nazorg ? 'rood' : '')}
  </div>`;
}

/* ─── De cijferstrook ────────────────────────────────────────────
   Vier getallen over de SELECTIE die je nu ziet. Daarmee zijn "totaal",
   "deze maand" en "per klant" geen aparte schermen maar drie standen van
   hetzelfde filter — dat was de vraag van Tjeerd (3 aug 2026).

   WAT HIER NIET HOORT. Performance rekent verhoudingen en trends (conversie,
   per recruiter, per maand); Finance rekent euro's die daadwerkelijk bewogen
   hebben (gefactureerd, betaald, marge). Dit scherm telt mensen in een
   toestand. Zou het hier ook trends of facturen gaan rekenen, dan spreken twee
   schermen elkaar binnen een week tegen over dezelfde maand. */
function cijfersHtml(T, rijen){
  const nu = vandaag();
  const werkt  = rijen.filter(r => r.start && r.start <= nu && !r.c.gestoptOp).length;
  const gestopt= rijen.filter(r => !!r.c.gestoptOp).length;
  const pct    = rijen.length ? Math.round(gestopt / rijen.length * 100) : 0;

  const geld = CRM.magOpbrengstZien();
  const metFee = rijen.filter(r => r.fee && r.fee.bedrag != null);
  const som = metFee.reduce((t, r) => t + r.fee.bedrag, 0);
  const gem = metFee.length ? Math.round(som / metFee.length) : null;
  const zonderFee = rijen.length - metFee.length;

  /* Zonder geldrecht geen lege kolom laten staan maar een ander getal dat op
     dit scherm net zo hard telt. */
  const vierde = geld
    ? CRM.ui.kpi('Fee', `<span class="num">${CRM.euro(som)}</span>`,
        !metFee.length ? 'geen fee te berekenen'
          : `gemiddeld <span class="num">${CRM.euro(gem)}</span>${zonderFee ? ` · ${zonderFee} zonder fee` : ''}`)
    : CRM.ui.kpi('Moet nog starten', `<span class="num">${rijen.length - werkt - gestopt}</span>`,
        'getekend, eerste werkdag nog voor ons');

  return `<div class="grid c4 pl-kpi">
    ${CRM.ui.kpi('Plaatsingen', `<span class="num">${rijen.length}</span>`, h(selectieTekst()))}
    ${CRM.ui.kpi('Aan het werk', `<span class="num">${werkt}</span>`, 'eerste werkdag is geweest')}
    ${CRM.ui.kpi('Gestopt', `<span class="num">${gestopt}</span>`,
      gestopt ? `<span class="num">${pct}%</span> van deze selectie` : 'niemand gestopt in deze selectie')}
    ${vierde}
  </div>`;
}

/* De selectie in gewone taal. Zonder deze regel liegt een cijfer van 3: je
   ziet niet dat je op één klant en één kwartaal filtert. */
function selectieTekst(){
  const uit = [];
  if(S.klant)    uit.push(S.klant);
  if(S.vacature) uit.push(S.vacature);
  if(S.mijn)     uit.push('van mij');
  if(S.focus === 'zonder') uit.push('alleen zonder startdatum');
  if(S.focus === 'nazorg') uit.push('alleen met openstaande nazorg');
  uit.push(periodeTekst());
  if(!S.gestopt) uit.push('zonder gestopte');
  return uit.join(' · ');
}

/* ─── De tabel ───────────────────────────────────────────────────
   Zeven kolommen, en elke kolom moet zijn plek verdienen. Naam en klant
   dragen allebei een tweede regel (recruiter, functie) omdat dat feiten zijn
   die bij elkaar horen en anders een eigen kolom zouden opeisen.
   Getekend en Start staan náást elkaar: die twee kunnen maanden uit elkaar
   liggen en juist dat verschil is wat je wilt zien — daarom is de
   as-schakelaar hier vervallen. */
const KOLOMMEN = [
  {k:'naam',     lbl:'Naam'},
  {k:'klant',    lbl:'Klant'},
  {k:'getekend', lbl:'Getekend', n:true},
  {k:'start',    lbl:'Start',    n:true},
  {k:'nazorg',   lbl:'Nazorg',   n:true, sorteer:false},
  {k:'let',      lbl:'Let op',   sorteer:false},
  {k:'fee',      lbl:'Fee',      n:true}
];
const SORTEER = {
  naam:     r => String(r.c.naam||'').toLowerCase(),
  klant:    r => String(r.c.klant||'').toLowerCase(),
  getekend: r => dag(r.c.geplaatstOp) || '9999',
  start:    r => r.start || '9999',
  fee:      r => (r.fee && r.fee.bedrag != null) ? r.fee.bedrag : -1
};

function gesorteerd(rijen){
  const f = SORTEER[S.sort.kol] || SORTEER.start;
  const op = S.sort.op;
  return rijen.slice().sort((a,b) => {
    const x = f(a), y = f(b);
    if(x < y) return -1*op;
    if(x > y) return  1*op;
    return String(a.c.naam||'').localeCompare(String(b.c.naam||''), 'nl');
  });
}

function nazorgCel(r){
  const open = r.open.length, gemist = r.gemist.length;
  if(!open && !gemist) return '<span class="meta">—</span>';
  const titel = [open ? open + ' open' : '', gemist ? gemist + ' eerder gemist' : ''].filter(Boolean).join(' · ');
  return `<span class="pl-naz${open ? ' open' : ''}" title="${h(titel)}">
    <span class="num">${open || gemist}</span>${open ? '' : '<i>·</i>'}</span>`;
}

function rijTabelHtml(r){
  const c = r.c, nu = vandaag();
  const geld = CRM.magOpbrengstZien();
  const onder = [c.rec || '', c.vervangt ? 'vervangt ' + c.vervangt : ''].filter(Boolean).join(' · ');
  const startExtra = r.start
    ? (r.start > nu ? CRM.geleden(r.start) : (c.garantieMnd ? 'garantie ' + c.garantieMnd + ' mnd' : CRM.geleden(r.start)))
    : '';
  const feeCel = !geld ? ''
    : (r.fee && r.fee.bedrag != null)
      ? `<span class="num">${h(CRM.euro(r.fee.bedrag))}</span>`
      : `<span class="meta pl-feeleeg" title="${h((r.fee && r.fee.reden) || '')}">${h((r.fee && r.fee.reden) || '—')}</span>`;
  const mis = heeftMissers(r);
  return `<tr${CRM.ui.frand(PL_RAND[toestandVan(r)], 'clickable', mis)} data-kaart="${h(c.id)}">
    <td><b>${h(c.naam || '—')}</b>${onder ? `<div class="rowsub">${h(onder)}</div>` : ''}</td>
    <td>${h(c.klant || '—')}${c.functie ? `<div class="rowsub">${h(c.functie)}</div>` : ''}</td>
    <td class="n num">${h(c.geplaatstOp ? CRM.fmtDateShort(c.geplaatstOp) : '—')}</td>
    <td class="n">${r.start ? `<span class="num">${h(CRM.fmtDateShort(r.start))}</span>${
      startExtra ? `<div class="rowsub">${h(startExtra)}</div>` : ''}`
      : `<span class="pl-geen">geen datum</span>`}</td>
    <td class="n">${nazorgCel(r)}</td>
    <td>${waarschuwing(r)}</td>
    ${geld ? `<td class="n">${feeCel}</td>` : ''}
  </tr>`;
}

/* Groepskop in de tabel. Zelfde vorm als de weekscheiders in de tijdlijn, dus
   een groep ziet er in beide weergaven hetzelfde uit. Rechts het aantal en —
   als je het mag zien — de fee-som: dát is het "overzicht per klant". */
function groepKopHtml(label, rijen, kolommen){
  const geld = CRM.magOpbrengstZien();
  const som = rijen.reduce((t, r) => t + ((r.fee && r.fee.bedrag) || 0), 0);
  return `<tr class="pl-grp"><td colspan="${kolommen}">
    <span>${h(label)}</span>
    <b class="num">${rijen.length}${geld && som ? ' · ' + CRM.euro(som) : ''}</b>
  </td></tr>`;
}

function tabelHtml(rijen){
  const geld = CRM.magOpbrengstZien();
  const kols = KOLOMMEN.filter(k => k.k !== 'fee' || geld);
  const pijl = k => S.sort.kol !== k ? '' : (S.sort.op < 0 ? ' ↓' : ' ↑');
  const kop = kols.map(k => k.sorteer === false
    ? `<th class="${k.n?'n':''}">${h(k.lbl)}</th>`
    : `<th class="sortable ${k.n?'n':''}" data-sort="${h(k.k)}"
         aria-sort="${S.sort.kol===k.k ? (S.sort.op<0?'descending':'ascending') : 'none'}">${h(k.lbl)}${pijl(k.k)}</th>`).join('');

  const gs = gesorteerd(rijen);
  let body = '';
  if(S.groep === 'geen'){
    /* De vandaag-scheider alleen als je op startdatum sorteert: in elke andere
       sortering staat hij op een willekeurige plek en betekent hij niets. */
    const toonNu = S.sort.kol === 'start' && S.sort.op > 0;
    const nu = vandaag();
    let gezet = !toonNu || !gs.some(r => r.start && r.start < nu);
    gs.forEach(r => {
      if(!gezet && r.start && r.start >= nu){
        gezet = true;
        body += `<tr class="pl-nurij"><td colspan="${kols.length}"><span>vandaag</span></td></tr>`;
      }
      body += rijTabelHtml(r);
    });
  }else{
    const sleutel = r => S.groep === 'klant'
      ? (r.c.klant || '— zonder klant')
      : (r.start ? maandLabel(r.start) : '— zonder startdatum');
    const volgorde = [], groepen = new Map();
    gs.forEach(r => { const k = sleutel(r);
      if(!groepen.has(k)){ groepen.set(k, []); volgorde.push(k); }
      groepen.get(k).push(r); });
    volgorde.forEach(k => {
      body += groepKopHtml(k, groepen.get(k), kols.length);
      groepen.get(k).forEach(r => { body += rijTabelHtml(r); });
    });
  }

  return `<div class="tblwrap"><table class="tbl pl-tbl">
    <thead><tr>${kop}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ─── Tekenen ────────────────────────────────────────────────────
   De strook met acties staat buiten #pl_lijsten omdat hij niet met het filter
   meebeweegt; alles daaronder wordt bij elke filterwijziging opnieuw gevuld. */
function teken(){
  const wrap = M.mount && M.mount.querySelector('#pl_lijsten');
  if(!wrap) return;
  bouwIndex();
  const T = tijdlijn();
  const rijen = T.opTijd.map(c => regel(c));
  const rGeen = T.zonderDatum.map(c => regel(c));

  const acts = M.mount.querySelector('#pl_acts');
  if(acts) acts.innerHTML = actiestrookHtml();

  /* In de tabel horen de mensen zonder datum gewoon in de lijst thuis — daar
     is een kolom voor, en apart zetten zou ze uit je sortering en je fee-som
     halen. In de tijdlijn kán dat niet: daar is geen plek zonder datum. */
  const alles = S.weergave === 'tabel' ? rijen.concat(rGeen) : rijen;

  let uit = '';
  if(S.weergave === 'tijdlijn' && rGeen.length) uit += `<section class="card pl-sec pl-zonder">
    <div class="card-h"><div class="h2">Zonder ${h(AS_LABEL())}</div>
      <span class="chip num">${rGeen.length}</span></div>
    <div class="card-b">
      <p class="sub pl-uit">Deze plaatsingen hebben geen ${h(AS_LABEL())}, dus ze staan nergens op de tijdlijn — en daarmee op geen enkele lijst waar iemand ’s ochtends naar kijkt. Vul de datum in, dan schuiven ze vanzelf op hun plek.</p>
      ${rGeen.map(rijHtml).join('')}
    </div></section>`;

  uit += `<section class="card pl-sec pl-tl">
    <div class="card-h"><div class="h2">${S.weergave === 'tabel' ? 'Plaatsingen' : 'Tijdlijn op ' + h(AS_LABEL())}</div>
      <span class="chip num">${alles.length}</span>
      <span class="spacer"></span>
      <div class="seg" id="pl_weergave" role="group" aria-label="Weergave">
        <button type="button" data-w="tabel"${S.weergave==='tabel'?' class="on"':''}>Tabel</button>
        <button type="button" data-w="tijdlijn"${S.weergave==='tijdlijn'?' class="on"':''}>Tijdlijn</button>
      </div></div>
    ${alles.length
      ? (S.weergave === 'tabel'
          ? tabelHtml(alles)
          : `<div class="card-b">${tijdlijnHtml(rijen)}</div>`)
      : `<div class="card-b">${geenHtml(T.gefilterd
          ? 'Niemand binnen deze filters. Verruim de periode of haal een filter weg.'
          : 'Er staat nog geen plaatsing in het systeem.')}</div>`}
  </section>`;

  wrap.innerHTML = uit;

  const kpi = M.mount.querySelector('#pl_kpi');
  if(kpi) kpi.innerHTML = cijfersHtml(T, alles);

  /* De optelsom onderaan. Geen sierstuk maar de controle waar dit scherm op
     staat of valt: alles op fase 'Contract getekend' of 'Gestart' hoort
     hierboven te staan, want er is geen ander scherm meer waar die mensen op
     voorkomen. Een filter dat stilletjes iemand wegneemt is hier de
     gevaarlijkste fout die er is — wie je niet ziet, bel je niet. */
  const weg = [];
  if(T.buitenPeriode)    weg.push(T.buitenPeriode + ' buiten de periode');
  if(T.verborgenGestopt) weg.push(T.verborgenGestopt + ' gestopt');
  const rest = T.totaal - T.zichtbaar - T.buitenPeriode - T.verborgenGestopt;
  if(rest > 0) weg.push(rest + ' door je filters');
  wrap.insertAdjacentHTML('beforeend', `<p class="pl-tel meta num">${
    weg.length
      ? h(T.zichtbaar + ' van ' + T.totaal + ' plaatsingen in beeld — ' + weg.join(' · ') + ' niet.')
      : h(T.totaal + ' plaatsingen, allemaal in beeld.')
  }</p>`);
}

/* Wat de periodefilter nu betekent, in gewone taal. */
function periodeTekst(){
  const g = periodeGrenzen();
  if(!g.van && !g.tot) return 'alle datums';
  if(g.van && g.tot)   return CRM.fmtDateShort(g.van) + ' t/m ' + CRM.fmtDateShort(g.tot);
  if(g.van)            return 'vanaf ' + CRM.fmtDateShort(g.van);
  return 'tot en met ' + CRM.fmtDateShort(g.tot);
}

/* ─── Startdatum invullen ────────────────────────────────────────
   De enige schrijfactie op dit scherm, en hij staat er niet voor niets: een
   getekende kandidaat zonder startdatum is precies het gat waar dit scherm
   voor bestaat, en die naar de kandidatenkaart sturen om daar één veld te
   vullen betekent in de praktijk dat het niet gebeurt.
   In demo-modus gaat er niets naar de database — alleen CRM.state. */
function startdatumVenster(id){
  const c = CRM.kandidaat(id);
  if(!c) return;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Startdatum invullen</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)}${c.klant ? ' · ' + h(c.klant) : ''}</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="pl_dat">Eerste werkdag</label>
        <input type="date" id="pl_dat" value="">
        <span class="hint">Zodra deze datum er staat, komt de kandidaat op de juiste lijst en loopt het warm-houden vanzelf mee.</span></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="pl_ok">Opslaan</button>
    </div>`, {onOpen(mo){
    const inp = mo.querySelector('#pl_dat');
    mo.querySelector('#pl_ok').onclick = async () => {
      const iso = dag(inp.value);
      if(!parse(iso)) return CRM.toast('Kies een geldige datum','err');
      CRM.modal.close();
      await bewaarStart(c, iso);
    };
  }});
}

async function bewaarStart(c, iso){
  const rij = (CRM.state.cands || []).find(x => String(x.id) === String(c.id));
  const oud = rij ? rij.start : '';
  if(rij) rij.start = iso;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update({start:iso}).eq('id', c.id);
    if(error){ if(rij) rij.start = oud; teken(); return CRM.fout('Opslaan mislukt', error); }
  }
  /* Vastleggen dát het is gezet, niet alleen de waarde: bij een kandidaat die
     al weken zonder datum stond is de vraag later "wanneer wisten we dit". */
  try{ await CRM.logActiviteit('kandidaat', c.id, 'notitie', 'Startdatum gezet op ' + CRM.fmtDate(iso)); }
  catch(e){ console.warn('activiteit startdatum', e); }
  CRM.toast('Startdatum opgeslagen','ok');
  teken();
  CRM.navBadges && CRM.navBadges();
}

/* ─── Klikken ────────────────────────────────────────────────────
   Gedelegeerd op de wrapper: de lijsten worden herhaaldelijk opnieuw gevuld,
   en losse handlers per regel zouden daar elke keer opnieuw aan moeten. */
function bind(){
  const acts = M.mount.querySelector('#pl_acts');
  /* De chips zetten een filter in plaats van zelf een lijst te tonen: zo is er
     één lijst en één waarheid, en zie je na het klikken meteen waaróm je die
     mensen ziet (de selectieregel onder het eerste cijfer zegt het). */
  acts.onclick = e => {
    const b = e.target.closest('[data-act]');
    if(!b) return;
    S.klant = ''; S.vacature = ''; S.gestopt = false; S.groep = 'geen';
    const a = b.dataset.act;
    S.focus = (a === 'week') ? '' : a;
    S.periode = (a === 'week') ? 'week' : 'alles';
    if(a === 'week') S.periodeOp = 'start';
    S.sort = {kol:'start', op:1};
    S.weergave = 'tabel'; onthoud(W_KEY, 'tabel');
    tekenFilters(); teken();
  };

  const wrap = M.mount.querySelector('#pl_lijsten');
  wrap.onclick = e => {
    const w = e.target.closest('#pl_weergave button');
    if(w){ if(S.weergave !== w.dataset.w){ S.weergave = w.dataset.w; onthoud(W_KEY, S.weergave); teken(); } return; }

    const th = e.target.closest('th[data-sort]');
    if(th){
      const k = th.dataset.sort;
      /* Tweede klik keert om; een nieuwe kolom begint oplopend, behalve bij
         fee — daar wil je vrijwel altijd het hoogste bedrag bovenaan. */
      S.sort = (S.sort.kol === k) ? {kol:k, op:-S.sort.op} : {kol:k, op: k === 'fee' ? -1 : 1};
      teken();
      return;
    }

    const sd = e.target.closest('[data-startdatum]');
    if(sd){ e.stopPropagation(); startdatumVenster(sd.dataset.startdatum); return; }

    const kaart = e.target.closest('[data-kaart]');
    if(kaart) CRM.ga('kandidaten', {id:kaart.dataset.kaart});
  };
  /* Een regel is een knop, dus hij hoort ook op Enter en spatie te openen. */
  wrap.onkeydown = e => {
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const kaart = e.target.closest('[data-kaart]');
    if(!kaart) return;
    e.preventDefault();
    CRM.ga('kandidaten', {id:kaart.dataset.kaart});
  };
}

/* ─── Module ─────────────────────────────────────────────────── */
CRM.registerModule('plaatsingen', {
  title:'Plaatsingen', icon:'◉',
  onderschrift:'Wie er start, wie net begonnen is en wie er werkt',
  /* De badge telt wat er vandaag mis kan gaan: mensen die deze week nog
     moeten beginnen plus getekende kandidaten zonder startdatum. Bewust niet
     alle openstaande contactmomenten — die staan al op het dashboard, en
     hetzelfde werk twee keer tellen maakt beide getallen waardeloos. */
  badge(){
    try{
      const nu = vandaag(), maandag = maandagVan(nu), zondag = plusDagen(maandag, 6);
      let n = 0;
      CRM.kandidaten().forEach(c => {
        if(!CRM.faseIn(c.fase, CRM.PLACED) || c.gestoptOp) return;
        const s = dag(c.start);
        if(!parse(s)) n++;
        else if(s >= nu && s <= zondag) n++;
      });
      return n;
    }catch(e){ return 0; }
  },
  render(mount, acties){
    M.mount = mount;
    mount.innerHTML = `${CRM.laadfoutHtml()}
      <div class="pl-wrap">
        <div id="pl_acts"></div>
        <div id="pl_kpi"></div>
        <div class="card pad pl-fil" id="pl_filters"></div>
        <div class="stack" id="pl_lijsten"></div>
      </div>`;

    if(acties) acties.innerHTML = `
      <div class="searchbox"><input type="search" id="pl_zoek" placeholder="Zoek naam, klant of functie"
        value="${h(S.zoek)}" aria-label="Zoeken in plaatsingen"></div>`;

    const zoek = document.getElementById('pl_zoek');
    if(zoek) zoek.oninput = CRM.debounce(() => { S.zoek = zoek.value; teken(); }, 200);
    const herlaad = document.getElementById('crm_herlaad');
    if(herlaad) herlaad.onclick = () => CRM.herlaad();

    tekenFilters();
    bind();
    teken();
  }
});

/* ─── De filterbalk ──────────────────────────────────────────────
   Alles op één regel, in de volgorde waarin je een vraag stelt: welke datum
   tel ik · welke periode · welke klant · welke vacature van die klant · en
   dan de twee schakelaars.

   De vacaturelijst hangt aan de klant, dus hij wordt opnieuw opgebouwd zodra
   je een klant kiest. Stond er een vacature geselecteerd die bij de nieuwe
   klant niet bestaat, dan valt die weg — anders zit je naar een leeg scherm
   te kijken door een filter dat je niet meer ziet staan.

   De balk hertekent zichzelf niet bij elke toetsaanslag: dat kost je de focus
   midden in het typen van een datum. Alleen de klantkeuze bouwt hem opnieuw
   op, want alleen dan verandert er iets aan de keuzes zelf. */
function tekenFilters(){
  const el = M.mount && M.mount.querySelector('#pl_filters');
  if(!el) return;
  const klanten = keuzeKlanten(), vacs = keuzeVacatures();
  const opt = (waarde, label, gekozen) =>
    `<option value="${h(waarde)}"${gekozen === waarde ? ' selected' : ''}>${h(label)}</option>`;

  el.innerHTML = `
    <div class="row pl-filrij">
      <select id="pl_periode" style="width:auto" aria-label="Periode">
        ${opt('alles','Alle datums',S.periode)}
        ${opt('week','Deze week',S.periode)}
        ${opt('maand','Deze maand',S.periode)}
        ${opt('kwartaal','Komende 3 maanden',S.periode)}
        ${opt('eigen','Eigen periode…',S.periode)}
      </select>
      ${S.periode==='eigen' ? `<span class="row tight pl-eigen">
        <input type="date" id="pl_van" value="${h(S.van)}" aria-label="Van">
        <span class="meta">t/m</span>
        <input type="date" id="pl_tot" value="${h(S.tot)}" aria-label="Tot en met">
      </span>` : ''}
      <select id="pl_klant" style="width:auto" aria-label="Klant">
        ${opt('','Alle klanten',S.klant)}
        ${klanten.map(k => opt(k,k,S.klant)).join('')}
      </select>
      <select id="pl_op" style="width:auto" aria-label="Periode slaat op">
        ${opt('start','periode op: startdatum',S.periodeOp)}
        ${opt('plaatsing','periode op: plaatsingsdatum',S.periodeOp)}
      </select>
      <select id="pl_vac" style="width:auto" aria-label="Vacature">
        ${opt('', S.klant ? 'Alle vacatures van deze klant' : 'Alle vacatures', S.vacature)}
        ${vacs.map(v => opt(v,v,S.vacature)).join('')}
      </select>
      <select id="pl_groep" style="width:auto" aria-label="Groeperen">
        ${opt('geen','Niet groeperen',S.groep)}
        ${opt('klant','Groepeer op klant',S.groep)}
        ${opt('maand','Groepeer op maand',S.groep)}
      </select>
      <span class="spacer"></span>
      ${CRM.me() ? `<button type="button" class="chip btn-like${S.mijn?' on':''}" data-tog="mijn"
        aria-pressed="${S.mijn}">Alleen van mij</button>` : ''}
      <button type="button" class="chip btn-like${S.gestopt?' on':''}" data-tog="gestopt"
        aria-pressed="${S.gestopt}">Gestopte tonen</button>
      <button type="button" class="btn ghost sm" id="pl_wis">Wissen</button>
    </div>`;

  el.querySelector('#pl_op').onchange = e => {
    S.periodeOp = e.target.value; onthoud(AS_KEY, S.periodeOp); teken();
  };
  el.querySelector('#pl_groep').onchange = e => { S.groep = e.target.value; teken(); };
  el.querySelector('#pl_periode').onchange = e => {
    S.periode = e.target.value;
    tekenFilters(); teken();
  };
  const van = el.querySelector('#pl_van'), tot = el.querySelector('#pl_tot');
  if(van) van.onchange = () => { S.van = van.value; teken(); };
  if(tot) tot.onchange = () => { S.tot = tot.value; teken(); };
  el.querySelector('#pl_klant').onchange = e => {
    S.klant = e.target.value;
    if(S.vacature && !keuzeVacatures().includes(S.vacature)) S.vacature = '';
    tekenFilters(); teken();
  };
  el.querySelector('#pl_vac').onchange = e => { S.vacature = e.target.value; teken(); };
  CRM.$$('[data-tog]', el).forEach(b => b.onclick = () => {
    const k = b.dataset.tog;
    S[k] = !S[k];
    b.classList.toggle('on', S[k]);
    b.setAttribute('aria-pressed', String(S[k]));
    teken();
  });
  el.querySelector('#pl_wis').onclick = () => {
    S.klant = ''; S.vacature = ''; S.periode = 'alles'; S.van = ''; S.tot = '';
    S.mijn = false; S.gestopt = false; S.zoek = ''; S.groep = 'geen'; S.focus = '';
    const z = document.getElementById('pl_zoek'); if(z) z.value = '';
    tekenFilters(); teken();
  };
}

})();

/* VERZOEK AAN CORE: ---------------------------------------------------------
   1. `CRM.PLACED` bevat de twee fases ná de handtekening, maar er is geen
      gedeelde helper voor "dit is een lopende plaatsing" (in PLACED én niet
      gestopt). Die vraag wordt nu in js/data.js, js/opvolging.js, js/finance.js
      en hier elk apart uitgeschreven als `CRM.faseIn(c.fase, CRM.PLACED) &&
      !c.gestoptOp`. Eén `CRM.loopt(c)` in data.js zou voorkomen dat die vier
      een keer uit elkaar lopen — precies het soort verdubbeling waar
      js/opvolging.js voor is gemaakt.

   2. Weekrekenen (maandagVan / isoWeek / weekLabel) staat nu letterlijk in
      js/pijplijn.js en in dit bestand, met dezelfde uitkomst. Zodra een derde
      module weekkoppen wil, is dat drie keer. Kandidaat voor core.js naast
      CRM.fmtDay/CRM.geleden: `CRM.week.maandag(iso)`, `CRM.week.label(iso)`.

   3. `CRM.geleden()` geeft voor de toekomst "over 3 dagen" maar heeft geen
      "morgen" — die staat er alleen voor het verleden ("gisteren"). Op dit
      scherm is "over 1 dagen" de tekst die je het vaakst leest, want dat is
      de dag waarop een AM iemand nog moet voorbereiden. Voorstel: in core
      naast `n===1 → 'gisteren'` ook `n===-1 → 'morgen'`.

   4. Er is geen gedeelde manier om één veld van een kandidaat weg te
      schrijven; elke module bouwt zijn eigen `CRM.sb.from('candidates')
      .update({...})` mét demo-controle (js/kandidaten.js, js/recruitment.js,
      js/source.js en nu ook dit bestand). Vier kopieën van dezelfde
      demo-guard is drie te veel: `CRM.bewaarKandidaat(id, patch)` in data.js
      zou dat op één plek zetten.
   -------------------------------------------------------------------------- */
