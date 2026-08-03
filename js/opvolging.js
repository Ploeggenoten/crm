/* ═══════════════════════════════════════════════════════════════
   PLOEGGENOTEN CRM — OPVOLGING
   Eén plek waar staat WANNEER er contact hoort te zijn met een
   kandidaat. Geen menu-item: dit is een bibliotheek, net als data.js
   en fee.js. Het dashboard, het pijplijnbord, de kandidatenkaart en
   Performance lezen hier hun ritme uit, zodat ze niet langer ieder
   hun eigen antwoord berekenen.

   Waarom het hier hoort en niet in vier modules:
   tot nu toe rekende het dashboard vanaf de plaatsingsdatum met een
   dag speling (dag 3/4, 14/15, 30/31) en rekenden bord, kaart en
   Performance vanaf de startdatum op de exacte dag. Dezelfde kandidaat
   kreeg dus op twee schermen twee verschillende antwoorden. Nu niet meer.

   Zes ritmes:
     1. NAZORG       — vanaf de startdag tot één jaar erna
     2. WARM HOUDEN  — getekend maar nog niet gestart: wekelijks
     3. VERJAARDAG   — op de dag zelf, alleen dag en maand
     4. FELICITATIE  — mail klaarzetten bij fase 'Contract getekend'
     5. AFSPRAAK     — herinnering de dag vóór een gesprek
     6. KLANTUPDATES — elke vrijdag vanaf 12:00 de klanten van de AM

   De eerste vijf hangen aan één kandidaat. De zesde niet: dat is een
   werkritme van de AM zelf, één taak over al zijn klanten tegelijk.

   Niets hiervan wordt opgeslagen. Alle momenten worden gerekend uit
   de startdatum (of, bij de vrijdagronde, uit de kalender); duizenden
   rijen in crm_taken zouden alleen maar dubbelingen opleveren.
   "Gedaan" leiden we af uit de activiteiten.

   GEEN GELD: er zit niets in dit bestand achter CRM.canSeeMoney(),
   want er staat geen bedrag in.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;

/* ─── Datumrekenen ────────────────────────────────────────────────
   Alles gaat via een LOKALE datum met een anker op 12:00 's middags.
   `new Date('2026-03-29')` wordt door de browser als UTC-middernacht
   gelezen; in Nederland is dat 01:00 of 02:00 lokaal, en precies op de
   nacht van de zomertijd schuift dat een dag. Met een anker op het
   midden van de dag kan geen enkele tijdzonesprong (±1 uur) de datum
   nog over de grens duwen.                                         */
const isoLoc = d => d.toLocaleDateString('sv-SE');
const parse = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? '' : iso));
  if(!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0);
  return isNaN(d) ? null : d;
};
const dag = iso => String(iso == null ? '' : iso).slice(0,10);
const plusDagen = (iso, n) => { const d = parse(iso); if(!d) return ''; d.setDate(d.getDate() + n); return isoLoc(d); };
/* Kalendermaanden, met de maandgrens netjes afgekapt: 31 januari + 1
   maand is 28 (of 29) februari, niet 3 maart. Zonder deze clamp schuift
   een kandidaat die op de 31e start elke maand een paar dagen op. */
const plusMaanden = (iso, n) => {
  const d = parse(iso); if(!d) return '';
  const dagNr = d.getDate();
  const doel = new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0, 0);
  const laatste = new Date(doel.getFullYear(), doel.getMonth() + 1, 0, 12, 0, 0, 0).getDate();
  doel.setDate(Math.min(dagNr, laatste));
  return isoLoc(doel);
};
const vandaag = () => CRM.todayISO();
const eerste = naam => String(naam || '').trim().split(/\s+/)[0] || '';
const hoofdletter = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/* Einde van de eerste werkweek.
   Tjeerd zei "einde van de week". Dat is de vrijdag van de week waarin
   iemand start — maar niet als die vrijdag op of vlak na de startdag valt:
   wie op donderdag begint heeft op vrijdag twee dagen gewerkt, en dat
   moment is dan al de check-in "de dag erna". Wie op vrijdag begint zou
   zichzelf op de startdag moeten bellen. En wie in het weekend start
   (inwerken op zaterdag komt in productie voor) heeft die vrijdag al
   gehad. Daarom één regel die alle zeven gevallen dekt: de eerstvolgende
   vrijdag die MINSTENS TWEE DAGEN na de startdag ligt.
     ma → +4   di → +3   wo → +2   do → +8
     vr → +7   za → +6   zo → +5                                    */
function eindeEersteWeek(start){
  const d = parse(start); if(!d) return '';
  let n = (5 - d.getDay() + 7) % 7;      // getDay: zo=0 … vr=5
  if(n < 2) n += 7;
  return plusDagen(start, n);
}

/* ─── Wat telt als contact ────────────────────────────────────────
   Een notitie of een fasewissel is geen contact; bellen, appen, mailen,
   een gesprek of een bezoek op locatie wél.                         */
const CONTACT = ['bel','gesprek','whatsapp','mail','bezoek'];

/* Hoe lang blijft een moment op het dashboard staan als het niet gedaan
   is? Nooit langer dan een week: anders groeit er een lijst met
   achterstallige check-ins van maanden terug die iedereen wegklikt.
   Een gemist moment verdwijnt van het dashboard maar blijft wél
   zichtbaar op de kandidatenkaart — daar hoort de eerlijkheid. */
const MAX_OPEN_DAGEN = 7;

/* ─── Index op de activiteiten ────────────────────────────────────
   Elk ritmemoment moet weten of er al contact is geweest, en dat antwoord
   komt uit de activiteiten. Dat gebeurde per kandidaat met
   CRM.activiteitenVoor(), en die loopt élke keer de hele lijst af. Bij
   duizend kandidaten en tienduizend activiteiten is dat tien miljoen
   vergelijkingen per hertekening — plus een sortering per kandidaat.
   Nu bouwen we de lijstjes één keer en is een kandidaat een opzoeking.
   Zelfde patroon als js/contactkaart.js (idx) en js/recruitment.js
   (bouwDubbel).

   ONGELDIG WORDEN — een index die blijft hangen is erger dan geen index.
   De stempel telt de activiteiten en kijkt naar de eerste en de laatste
   rij. Er wordt vooraan bijgeschreven (CRM.logActiviteit doet unshift) en
   bij het wissen van een kandidaat verdwijnen er rijen uit het midden;
   allebei veranderen de lengte. Wisselt een kandidaat van fase, dan raakt
   dat de activiteiten niet — die index mag dan gewoon blijven staan, want
   het ritme zelf wordt bij elke aanroep opnieuw gerekend.

   VOLGORDE — de kandidaatlijstjes worden hier één keer oplopend op `op`
   gesorteerd, precies zoals bepaalGedaan dat eerst per kandidaat deed.
   De klantlijstjes NIET: klantRegel pakt daar de eerste treffer uit en
   die hoort dezelfde te zijn als bij CRM.activiteitenVoor(), dus houden
   we de volgorde van CRM.state.activiteiten aan.                     */
const LEEG = [];
let _actIdx = null, _actStempel = '';
function actStempel(){
  const a = CRM.state.activiteiten || [];
  return a.length + '|' + (a.length ? a[0].id + '|' + a[a.length-1].id : '');
}
function actIndex(){
  const s = actStempel();
  if(_actIdx && _actStempel === s) return _actIdx;
  const kand = new Map(), klant = new Map();
  (CRM.state.activiteiten || []).forEach(a => {
    const m = a.entiteit === 'kandidaat' ? kand : a.entiteit === 'klant' ? klant : null;
    if(!m) return;
    const sleutel = String(a.ref);
    const lijst = m.get(sleutel);
    if(lijst) lijst.push(a); else m.set(sleutel, [a]);
  });
  kand.forEach(l => l.sort((a,b) => String(a.op || '').localeCompare(String(b.op || ''))));
  _actIdx = {kand, klant};
  _actStempel = s;
  return _actIdx;
}
/* De lijstjes zijn gedeeld bezit: lezen mag, wijzigen niet. Wie sorteert of
   splitst maakt eerst een kopie (filter en slice doen dat vanzelf). */
const actsVanKandidaat = id   => actIndex().kand.get(String(id)) || LEEG;
const actsVanKlant     = naam => actIndex().klant.get(String(naam)) || LEEG;

/* ═══ 1. NAZORG ═══════════════════════════════════════════════════
   Tjeerds eigen woorden: "startdag zelf een appje, dag 1, einde van de
   week, na 2 weken, 1 maand en dan maandelijks" — tot één jaar na de
   startdatum, daarna stopt het.                                     */
function nazorgMomenten(start){
  const M = [
    {key:'nz:start', datum:start,                  kanaal:'whatsapp', kort:'startdag',
     titel:'Startdag — stuur een appje',
     hint:'Kort en persoonlijk. Vandaag geen belletje: de kandidaat staat op de vloer.'},
    {key:'nz:d1',    datum:plusDagen(start,1),     kanaal:'bel',      kort:'dag 1',
     titel:'De dag na de start — hoe ging dag één?',
     hint:'Eerste indruk, ontvangst, en of duidelijk was waar te melden.'},
    {key:'nz:week',  datum:eindeEersteWeek(start), kanaal:'bel',      kort:'einde week 1',
     titel:'Einde van de eerste werkweek',
     hint:'Rooster, inwerken, klik met de ploeg. Vrijdag is het moment.'},
    {key:'nz:w2',    datum:plusDagen(start,14),    kanaal:'bel',      kort:'2 weken',
     titel:'Twee weken aan het werk',
     hint:'Hier komt twijfel meestal voor het eerst naar boven.'}
  ];
  for(let m = 1; m <= 12; m++){
    M.push({
      key:'nz:m' + m, datum:plusMaanden(start, m), kanaal:'bel',
      kort: m === 12 ? '1 jaar' : 'maand ' + m,
      titel: m === 1 ? 'Eén maand aan het werk'
           : m === 12 ? 'Eén jaar aan het werk — laatste check-in'
           : 'Maand ' + m + ' — maandelijkse check-in',
      hint: m === 12 ? 'Sluit het jaar af. Hierna stopt het ritme.'
                     : 'Hoe gaat het, en hoe gaat het met de klant?'
    });
  }
  return M.map(m => Object.assign({soort:'nazorg'}, m));
}

/* ═══ 2. WARM HOUDEN ══════════════════════════════════════════════
   Getekend, maar de start is pas over weken. Precies het moment waarop
   een tegenbod binnenkomt. Eén keer per week vanaf het tekenen tot de
   startdatum; daarna neemt de nazorg het over.
   Zonder startdatum loopt het ritme door, maar niet oneindig: na twaalf
   weken houdt het op. Dan is er iets anders aan de hand dan opvolging. */
const WARM_MAX_WEKEN = 12;
/* Het ritme past zich aan de aanloop aan.

   Het was altijd wekelijks. Bij een korte aanloop klopt dat — twee, drie
   belletjes en hij begint. Maar iemand die in mei tekent en op 1 september
   begint kreeg vijftien wekelijkse momenten, en die worden geen van alle
   afgevinkt. Op het scherm Plaatsingen stonden dan vijftien rode regels
   "gemist" onder één kaart. Dat is geen achterstand van vijftien dingen; het
   maakt het wóórd "gemist" waardeloos, ook op de plekken waar het er wél toe
   doet. (Tjeerd, 3 aug 2026: "alleen al deze info is teveel ruis.")

   Vanaf zes weken aanloop dus geen wekelijkse reeks meer maar vier vaste
   momenten: kort na het tekenen, halverwege, twee weken vóór de start en de
   laatste week. Dat is precies waar een tegenbod binnenkomt of iemand
   afhaakt — en het is wél bij te houden.

   De sleutels blijven 'warm:<weeknummer vanaf tekenen>', zodat een moment
   dat iemand eerder heeft afgevinkt afgevinkt blijft. */
function warmMomenten(getekendOp, start){
  const M = [];
  const dagen = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const voegToe = (datum, tekst) => {
    if(!datum) return;
    if(start && datum >= start) return;     // vanaf de startdag doet de nazorg het
    const w = Math.max(1, Math.round(dagen(getekendOp, datum) / 7));
    if(M.some(x => x.key === 'warm:' + w)) return;
    M.push({soort:'warm', key:'warm:' + w, datum, kanaal:'bel', kort:'week ' + w,
      titel:'Warm houden — ' + tekst,
      hint: start ? 'De start is pas ' + CRM.fmtDate(start) + '. Even laten merken dat we er zijn.'
                  : 'Startdatum is nog niet bekend — vraag er meteen naar.'});
  };

  const aanloop = start ? dagen(getekendOp, start) : null;

  /* Geen startdatum, of een korte aanloop: wekelijks, zoals het was. Bij een
     onbekende start houdt het na twaalf weken op — dan is er iets anders aan
     de hand dan opvolging. */
  if(aanloop == null || aanloop <= 42){
    const max = aanloop == null ? WARM_MAX_WEKEN : Math.ceil(aanloop / 7);
    for(let w = 1; w <= max; w++) voegToe(plusDagen(getekendOp, w * 7), 'week ' + w + ' na het tekenen');
    return M;
  }

  voegToe(plusDagen(getekendOp, 7),                  'eerste week na het tekenen');
  voegToe(plusDagen(getekendOp, Math.round(aanloop/2)), 'halverwege de aanloop');
  voegToe(plusDagen(start, -14),                     'twee weken vóór de start');
  voegToe(plusDagen(start, -3),                      'laatste check vóór de eerste dag');
  return M.sort((a,b) => String(a.datum).localeCompare(String(b.datum)));
}

/* ═══ 3. VERJAARDAG ═══════════════════════════════════════════════
   Voor wie? Niet iedereen in het bestand — een felicitatie van een
   bureau dat je twee jaar geleden afwees is ongemakkelijk, geen warm
   gebaar. Wél voor iedereen met wie we NU een levende relatie hebben:
     - aan het werk via ons (fase Gestart, niet gestopt) — dit is het
       product: wij plaatsen niet en verdwijnen;
     - in een lopend traject (Intake t/m Contract getekend) — we spreken
       elkaar toch al die weken.
   Niet voor: afgevallen, gestopt, en kandidaten zonder fase (los
   geïmporteerd bestand, golden zonder traject).
   Nooit het jaartal of de leeftijd tonen — alleen dag en maand.      */
function jarigDoelgroep(c){
  const f = CRM.faseNorm(c.fase);
  if(!f) return false;
  if(f === 'Afgevallen' || f === 'Gestopt') return false;
  if(c.gestoptOp) return false;
  return true;
}
/* candidates.geboortedatum wordt inmiddels gewoon gemapt in CRM.rowToCand
   (js/core.js), dus we lezen hem rechtstreeks van de kandidaat. Hier stond
   een omweg langs de ruwe rij in CRM.state.cands voor de tijd dat dat nog
   niet zo was; die zocht per kandidaat de hele lijst af — bij duizend
   kandidaten een miljoen vergelijkingen voor een veld dat er al staat. */
function geboortedatum(c){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c.geboortedatum == null ? '' : c.geboortedatum));
  return m ? m[0] : '';
}
const schrikkel = j => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
/* De verjaardag in een bepaald kalenderjaar. 29 februari bestaat niet elk
   jaar; die vieren we dan op 28 februari — nooit stilzwijgend op 1 maart,
   want dan staat de taak een dag te laat. */
function verjaardagIn(gb, jaar){
  const md = gb.slice(5);
  if(md === '02-29' && !schrikkel(jaar)) return jaar + '-02-28';
  return jaar + '-' + md;
}
function verjaardagMomenten(c, peil){
  const gb = geboortedatum(c);
  if(!gb || !jarigDoelgroep(c)) return [];
  const jaar = Number(String(peil).slice(0,4));
  const dagMaand = parse(gb) ? parse(gb).toLocaleDateString('nl-NL',{day:'numeric',month:'long'}) : '';
  return [jaar, jaar + 1].map(j => ({
    soort:'verjaardag', key:'jarig:' + j, datum:verjaardagIn(gb, j), kanaal:'whatsapp',
    kort:'verjaardag', titel:'Jarig — ' + dagMaand,
    hint:'Eén appje. Kost niets, wordt onthouden.'
  })).filter(m => !!m.datum);
}

/* ═══ 4. FELICITATIEMAIL ══════════════════════════════════════════
   Zodra iemand op fase 'Contract getekend' staat, hoort de mail
   klaar te staan — ingevuld, maar NIET verstuurd. Uitdrukkelijke
   afspraak met Tjeerd: de AM leest hem na en drukt zelf op versturen. */
function felicitatieMoment(c){
  if(!CRM.faseIs(c.fase, 'Contract getekend')) return [];
  const datum = dag(c.geplaatstOp) || dag(c.since) || vandaag();
  /* Geen week venster zoals bij de check-ins: dit is geen moment maar een
     toestand. Zolang iemand op 'Contract getekend' staat en nog geen
     felicitatie heeft gehad, hoort die mail klaar te staan — ook als het
     tekenen drie weken geleden was. Hij verdwijnt vanzelf zodra hij
     verstuurd is of zodra de kandidaat op Gestart komt. Twee maanden is
     ruim genoeg: een langere periode tussen tekenen en starten komt niet
     voor, en oneindig openhouden zou een dode regel opleveren. */
  return [{soort:'mail', key:'mail:felicitatie', datum, kanaal:'mail', kort:'felicitatie',
    openTotVast: plusDagen(datum, 60),
    titel:'Felicitatiemail nakijken en versturen',
    hint:'Staat volledig ingevuld klaar. Jij drukt op versturen, niet het systeem.'}];
}

/* ═══ 5. HERINNERING VÓÓR EEN AFSPRAAK ════════════════════════════
   Tjeerd: "eerste gesprekken, tweede gesprekken, meeloopdagen, contract
   ondertekenen etc. Dat zij in hun dashboard te zien krijgen 1 dag van
   tevoren, succes met je gesprek."

   "Succes met je gesprek" is gericht aan de KANDIDAAT, niet aan de AM.
   Dit is daarom één taak die twee dingen doet: de AM ziet dat er morgen
   iets staat, én er ligt een kort berichtje klaar dat hij met één klik
   naar de kandidaat stuurt. Niets gaat automatisch de deur uit.

   O&O sessie hoort er wél bij. Het is een echte afspraak met datum en
   tijd op de kaart, bij de klant op locatie, waar de kandidaat wordt
   bekeken — precies zo spannend als een tweede gesprek. Hem overslaan zou
   willekeurig zijn; wat hem anders maakt is de toon, niet het moment.

   WANNEER: de herinnering hoort bij de dag vóór de afspraak, maar hij
   blijft ook op de dag zelf staan — dan als "vandaag om 14:00". Een
   succeswens op de ochtend van het gesprek is niet te laat, die is juist
   op zijn plek. Wat niet mag is dat hij ná de afspraak blijft hangen;
   daarom sluit het venster de dag erna.

   WEEKEND: een afspraak op maandag zou een herinnering op zondag geven,
   en niemand kijkt zondag op zijn dashboard. Die schuift daarom terug naar
   de vrijdag ervoor — dat is precies de dag waarop je een maandagafspraak
   voorbereidt. Omdat het venster doorloopt tot na de afspraak, staat hij
   op maandagochtend nog steeds klaar als er vrijdag niets van kwam.

   VERZET: er wordt niets opgeslagen. De herinnering wordt elke keer uit
   `c.datum` gerekend, dus een verzette afspraak verplaatst hem vanzelf —
   en omdat de datum in de sleutel zit, telt een appje voor de oude datum
   niet als gedaan voor de nieuwe.                                       */
const AFSPRAAK_FASES = {
  'Eerste gesprek': {
    kort:'eerste gesprek', wat:'is het eerste gesprek', actie:'stuur een succesje',
    hint:'Kort berichtje. De kandidaat is zenuwachtig, jij niet.',
    tekst:(v,k,w) => `Hoi ${v}, ${w} heb je je gesprek bij ${k}. Succes! Wees vooral jezelf, `
      + `daar hebben ze je voor uitgenodigd. Laat je me daarna even weten hoe het ging?`
  },
  'Tweede gesprek': {
    kort:'tweede gesprek', wat:'is het tweede gesprek', actie:'stuur een succesje',
    hint:'Laatste stap. Even laten merken dat je meeleeft.',
    tekst:(v,k,w) => `Hoi ${v}, ${w} sta je weer bij ${k}. Dit is de laatste stap. `
      + `Succes — en bel of app me erna even, dan hoor ik hoe het zat.`
  },
  'Meeloopdag': {
    kort:'meeloopdag', wat:'is de meeloopdag', actie:'stuur een berichtje',
    hint:'Werkkleding en op tijd komen: dáár gaat het bij een meeloopdag mis.',
    tekst:(v,k,w) => `Hoi ${v}, ${w} loop je mee bij ${k}. Trek werkkleding en stevige `
      + `schoenen aan en zorg dat je ruim op tijd bent. Kijk vooral goed rond — het is `
      + `ook jouw dag om te bepalen of het bij je past. Veel succes, ik hoor het graag!`
  },
  'O&O sessie': {
    kort:'O&O-sessie', wat:'is de O&O-sessie', actie:'stuur een succesje',
    hint:'Voorbereiden hoeft niet; dat mag je gerust zeggen.',
    tekst:(v,k,w) => `Hoi ${v}, ${w} is de sessie bij ${k}. Je hoeft je niet voor te `
      + `bereiden, ze willen vooral zien wie je bent. Succes — tot daarna!`
  },
  'Contract ondertekenen': {
    kort:'ondertekenen', wat:'wordt het contract getekend', actie:'laat het even weten',
    hint:'Identiteitsbewijs meenemen. Kleine moeite, groot gedoe als het vergeten wordt.',
    tekst:(v,k,w) => `Hoi ${v}, ${w} teken je je contract bij ${k}. Neem je `
      + `identiteitsbewijs mee. Mooi moment, we zijn er klaar voor — tot dan!`
  }
};
/* Zaterdag en zondag terug naar de vrijdag ervoor. */
function werkdagVoor(iso){
  const d = parse(iso); if(!d) return iso;
  const wd = d.getDay();
  if(wd === 6) return plusDagen(iso, -1);   // zaterdag → vrijdag
  if(wd === 0) return plusDagen(iso, -2);   // zondag   → vrijdag
  return iso;
}
function afspraakMomenten(c){
  const def = AFSPRAAK_FASES[CRM.faseNorm(c.fase)];
  const afspraak = dag(c.datum);
  if(!def || !afspraak || c.gestoptOp) return [];
  return [{
    soort:'afspraak', key:'afspraak:' + afspraak,
    datum: werkdagVoor(plusDagen(afspraak, -1)),
    afspraakOp: afspraak, tijd: String(c.tijd || '').slice(0,5),
    kanaal:'whatsapp', kort:def.kort, hint:def.hint,
    /* De titel noemt het moment zelf en zegt niet klakkeloos "morgen":
       door de weekendregel herinnert een afspraak op maandag al op vrijdag. */
    titel: hoofdletter(wanneerLbl(afspraak)) + ' ' + def.wat + ' — ' + def.actie,
    wanneer: wanneerLbl(afspraak),
    /* Venster: t/m de dag van de afspraak zelf, daarna weg. */
    openTotVast: plusDagen(afspraak, 1)
  }];
}
/* Wanneer is de afspraak, in gewone taal? Meestal "morgen", maar door de
   weekendregel kan een herinnering op vrijdag over een afspraak van maandag
   gaan — dan mag er geen "morgen" staan. Eén functie voor het berichtje én
   voor de regel op het dashboard, zodat die twee nooit iets anders beweren. */
function wanneerLbl(iso){
  const nu = vandaag();
  if(iso === nu) return 'vandaag';
  if(iso === plusDagen(nu, 1)) return 'morgen';
  return CRM.fmtDay(iso);              // bv. "ma 3 aug"
}
/* Het berichtje zelf. `w` is het moment inclusief tijd. */
function afspraakTekst(c, m){
  const def = AFSPRAAK_FASES[CRM.faseNorm(c.fase)];
  if(!def) return '';
  const w = wanneerLbl(m.afspraakOp) + (m.tijd ? ' om ' + m.tijd : '');
  return def.tekst(eerste(c.naam) || 'daar', String(c.klant || 'de klant').trim(), w);
}

/* ─── "Gedaan" afleiden uit de activiteiten ───────────────────────
   Niet uit een afvinkveld. Twee redenen: een telefoontje dat de AM toch
   al logde telt dan vanzelf mee, en bestaande plaatsingen beginnen niet
   allemaal op rood. Dezelfde afleiding als die al in js/kandidaten.js
   stond, alleen nu met een sleutel per moment in plaats van een dagnummer. */

/* Oude markeringen blijven werken. Tot vandaag legde de kandidatenkaart
   `extra.nazorg = 3 | 14 | 30` weg. Die dagen bestaan in het nieuwe ritme
   niet meer; we hangen ze op het moment dat er inhoudelijk het dichtst
   bij ligt, zodat een al gedane check-in niet ineens weer openstaat. */
const OUD_NAAR_KEY = {3:'nz:week', 14:'nz:w2', 30:'nz:m1'};
function merk(a){
  const e = (a && a.extra) || {};
  if(e.opvolging) return String(e.opvolging);
  const n = Number(e.nazorg);
  if(n && OUD_NAAR_KEY[n]) return OUD_NAAR_KEY[n];
  const m = /^nazorg dag (\d+)\b/i.exec(String((a && a.tekst) || ''));
  if(m && OUD_NAAR_KEY[Number(m[1])]) return OUD_NAAR_KEY[Number(m[1])];
  /* Felicitatiemails van vóór dit bestand: onderwerp begon met "Gefeliciteerd". */
  if(a && a.soort === 'mail' && /^felicitatiemail\b/i.test(String(a.tekst || ''))) return 'mail:felicitatie';
  return '';
}

function bepaalGedaan(c, momenten){
  /* Al oplopend op `op` gesorteerd door de index hierboven — dezelfde
     volgorde als de sortering die hier eerst per kandidaat stond. */
  const acts = actsVanKandidaat(c.id);
  const gebruikt = new Set();

  /* Ronde 1 — expliciet vastgelegde check-ins. Die zijn hard bewijs. */
  momenten.forEach(m => {
    const vast = acts.find(a => !gebruikt.has(a.id) && merk(a) === m.key);
    if(vast){ m.gedaan = true; m.bewijs = vast; m.bron = 'vast'; gebruikt.add(vast.id); }
  });

  /* Ronde 2 — écht contact binnen het venster van dit moment.
     Een activiteit die al ÉÉN moment is, telt nooit als een ander: leg je
     de check-in van week 1 achteraf vast op dag 20, dan valt dat gesprek
     toevallig ook in het venster van "2 weken" en zou die zichzelf anders
     ook afvinken. Eén gesprek is één check-in. */
  momenten.forEach(m => {
    if(m.gedaan) return;
    const con = acts.find(a => !gebruikt.has(a.id) && !merk(a) && CONTACT.includes(a.soort)
      && dag(a.op) >= m.datum && dag(a.op) < m.vensterEind);
    if(con){ m.gedaan = true; m.bewijs = con; m.bron = 'contact'; gebruikt.add(con.id); }
  });
}

/* Vensters zetten: tot het volgende moment (voor het laatste: twee weken).
   `openTot` is korter — dat bepaalt hoe lang iets op het dashboard staat. */
function zetVensters(momenten){
  momenten.sort((a,b) => String(a.datum).localeCompare(String(b.datum)));
  momenten.forEach((m, i) => {
    const volgend = momenten[i+1];
    m.vensterEind = volgend ? volgend.datum : plusDagen(m.datum, 14);
    /* Sommige momenten hebben een eigen einde: een afspraakherinnering loopt
       tot de dag ná de afspraak, niet tot het volgende ritmemoment. */
    if(m.openTotVast && m.openTotVast < m.vensterEind) m.vensterEind = m.openTotVast;
    /* Een verjaardag is één dag. Morgen feliciteren is geen feliciteren. */
    /* Een eigen einde gaat vóór op het venster van het volgende moment.
       De felicitatiemail moet klaar blijven staan zolang iemand op
       'Contract getekend' staat, ook al valt er ondertussen een
       warm-houd-belletje in — dát belletje is niet de felicitatie. */
    m.openTot = m.openTotVast || (() => {
      const grens = m.soort === 'verjaardag' ? plusDagen(m.datum, 1)
                                             : plusDagen(m.datum, MAX_OPEN_DAGEN);
      return (m.vensterEind && m.vensterEind < grens) ? m.vensterEind : grens;
    })();
  });
  return momenten;
}

/* ═══ 6. VRIJDAGMIDDAG — DE KLANTUPDATE-RONDE ═════════════════════
   Tjeerd: "Elke vrijdag vanaf 12.00 moet de AM een taak in zijn lijst
   krijgen dat hij elke klant even updates geeft. Ook een mooi moment om
   meer vacatures op te halen."

   Dit is het eerste moment in dit bestand dat NIET aan een kandidaat hangt.
   Het is een werkritme van de AM: één taak, al zijn klanten eronder. Daarom
   staat er ook maar één regel op het dashboard en zit de lijst in het
   detailpaneel — twintig losse regels op een vrijdagmiddag is geen agenda
   meer maar een muur, en een muur klikt iedereen weg.

   VAN WIE IS DE TAAK — klanten hangen aan hun AM in `clients.eigenaar`
   (hetzelfde veld dat CRM.isVanMij en het klantenfilter lezen). Staat daar
   niemand op, dan is de klant van iedereen: precies dezelfde regel die dit
   bestand hierboven al voor kandidaten zonder recruiter hanteert. Zo valt
   een klant zonder AM nergens tussen wal en schip.
   Tjeerd krijgt hier bewust NIET alle klanten van het team te zien. Het
   dashboard is de eigen dag — de belronde van Tjerk staat niet in Tjeerds
   lijst, net zomin als Tjerks nazorg dat doet. Het teamoverzicht hoort in
   Performance, niet in iemands takenlijst.

   WANNEER — de ronde staat op de vrijdag en gaat om 12:00 open. Vóór
   twaalven hoort hij er niet: dan is het nog geen tijd, en een taak die er
   de hele ochtend al staat is om twaalf uur geen signaal meer.
   Hij blijft staan t/m maandag. Waarom niet langer, en waarom niet korter:
     - korter (alleen vrijdag) betekent dat wie om drie uur begint en er acht
       van de twintig haalt, de rest kwijt is;
     - langer (de MAX_OPEN_DAGEN van zeven dagen die de check-ins gebruiken)
       zou de ronde tot de volgende vrijdag laten doorlopen, en dan staan er
       twee rondes tegelijk open — precies de stapel die MAX_OPEN_DAGEN moest
       voorkomen;
     - zaterdag en zondag werkt niemand (dezelfde aanname als de weekendregel
       bij de afspraakherinnering hierboven), dus in de praktijk krijgt de
       ronde vrijdagmiddag plus maandagochtend. Daarna is het geen "week
       afsluiten" meer en komt de volgende vrijdag al in zicht.
   In de weekweergave staat hij áltijd op zijn vrijdag, ook maandagochtend
   vooruit — daar is het een planning, geen taak, en dan is de klok niet aan
   de orde.

   FEESTDAGEN — hier gebeurt met opzet niets mee. De app kent nergens een
   feestdagenkalender, en er hier een beginnen levert een tweede waarheid op
   over wat een werkdag is die niemand bijhoudt — het soort verdubbeling waar
   dit bestand nu juist voor bestaat. Productie en logistiek draaien op de
   meeste feestdagen gewoon door, en een AM die vrij is ziet de taak die dag
   simpelweg niet: die schuift dan mee naar maandag. Wil Tjeerd het later
   wél, dan hoort dat in één gedeelde helper in core (zie het verzoek
   onderaan), niet in dit blok.                                            */
const KLANT_KEY   = 'klantupdate';
const RONDE_UUR   = 12;   // vanaf 12:00 op de vrijdag
const RONDE_DAGEN = 3;    // vrijdag + zaterdag + zondag + maandag

/* De vrijdag waar deze dag bij hoort, of leeg als de dag buiten de ronde
   valt. getDay: zo=0 … vr=5, dus (dag+2)%7 geeft vr 0, za 1, zo 2, ma 3 en
   di t/m do 4, 5 en 6 — de dagen waarop de ronde voorbij is. */
function rondeVrijdag(iso){
  const d = parse(iso); if(!d) return '';
  const off = (d.getDay() + 2) % 7;
  return off <= RONDE_DAGEN ? plusDagen(iso, -off) : '';
}
const isVrijdag = iso => { const d = parse(iso); return !!d && d.getDay() === 5; };
/* Is het al twaalf uur geweest? Alleen te beantwoorden over vandaag; voor
   elke andere dag zegt de klok niets en gaan we ervan uit dat het moment
   er is (voorbij) of nog komt (vooruitblik). */
const naTwaalf = iso => iso !== vandaag() || new Date().getHours() >= RONDE_UUR;

/* Het laatste échte contact met deze klant. Twee bronnen: de activiteiten
   (alleen de soorten die als contact tellen — een notitie of een fasewissel
   is geen belletje) en het veld `laatst_contact` op de klantkaart, dat de AM
   met de hand zet als hij buiten het CRM om gebeld heeft. Leeg = nooit. */
function laatsteKlantContact(k, acts){
  let uit = dag(k.laatst_contact) || '';
  (acts || actsVanKlant(k.naam)).forEach(a => {
    if(!CONTACT.includes(a.soort)) return;
    const d = dag(a.op);
    if(d > uit) uit = d;
  });
  return uit;
}

/* De hoofdcontactpersoon, met terugval op de klant zelf. Een klant zónder
   contactpersoon mag niet uit de ronde vallen: dan bel je het algemene
   nummer, en als dat er ook niet is zeggen we dat gewoon. */
function hoofdContact(k, ix){
  const lijst = ix ? (ix.contacten.get(k.naam) || LEEG)
                   : (CRM.state.contacten || []).filter(c => c.klant === k.naam);
  const c = lijst.find(x => x.hoofd) || lijst[0] || null;
  return {
    naam:    c ? String(c.naam || '').trim() : '',
    functie: c ? String(c.functie || '').trim() : '',
    tel:     (c && String(c.telefoon || '').trim()) || String(k.telefoon || '').trim(),
    algemeen: !c
  };
}

/* Eén klant in de ronde: alles wat de AM nodig heeft om te bellen zonder
   zich eerst in te lezen. */
function klantRegel(k, vrijdag, tot, ix){
  const acts  = actsVanKlant(k.naam);
  const sleutel = KLANT_KEY + ':' + vrijdag;

  /* Gedaan, in dezelfde volgorde als bij de check-ins hierboven: eerst een
     expliciet vastgelegde ronde, anders écht contact binnen het venster. */
  let bewijs = acts.find(a => String(((a && a.extra) || {}).opvolging || '') === sleutel) || null;
  let bron   = bewijs ? 'vast' : '';
  if(!bewijs){
    bewijs = acts.filter(a => CONTACT.includes(a.soort) && dag(a.op) >= vrijdag && dag(a.op) <= tot)
                 .sort((a,b) => String(b.op).localeCompare(String(a.op)))[0] || null;
    if(bewijs) bron = 'contact';
  }
  const uitKaart = dag(k.laatst_contact);
  if(!bewijs && uitKaart && uitKaart >= vrijdag && uitKaart <= tot) bron = 'kaart';

  const mensen = ix ? (ix.kandidaten.get(k.naam) || LEEG) : CRM.kandidatenVan(k.naam);
  return {
    naam:  k.naam,
    klant: k,
    gedaan: !!bron, bewijs, bron,
    laatst: laatsteKlantContact(k, acts),
    /* Aan het werk = wie er nú staat. Getekend-maar-nog-niet-gestart apart:
       daar gaat het gesprek over een startdatum, niet over hoe het gaat. */
    /* "Aan het werk" betekent: is al begonnen. De fase alleen is niet genoeg —
       iemand kan op Gestart staan met een startdatum die nog moet komen, en
       dan zei dit venster tegen de AM "3 aan het werk" terwijl datzelfde
       dashboard eronder "startdag — stuur een appje · za 8 aug" toonde. Bel
       je de klant met die lijst, dan hebben ze er nog geen één gezien. */
    werkt: mensen.filter(c => CRM.faseIs(c.fase, 'Gestart') && !c.gestoptOp
      && (!c.start || String(c.start).slice(0,10) <= CRM.todayISO())),
    /* Getekend, of gestart-maar-nog-niet-begonnen: allebei "komt eraan". */
    start: mensen.filter(c => !c.gestoptOp && (
      CRM.faseIs(c.fase, 'Contract getekend') ||
      (CRM.faseIs(c.fase, 'Gestart') && c.start && String(c.start).slice(0,10) > CRM.todayISO()))),
    vacs:  CRM.vacaturesVan(k.naam).filter(v => (v.status || 'Open') === 'Open'),
    contact: hoofdContact(k, ix)
  };
}

/* De ronde in één doorloop indexeren. CRM.kandidatenVan() bouwt intern de
   hele kandidatenlijst opnieuw op (CRM.kandidaten() is niet gecacht), dus
   per klant aanroepen betekende bij honderd klanten honderdduizend
   opgebouwde kandidaatobjecten voor één vrijdagregel. Hetzelfde gold voor
   de contactpersonen. Deze index leeft precies zolang als de ronde die hem
   nodig heeft — hij wordt bij elke tekenronde opnieuw gebouwd en kan dus
   niet achterlopen op de gegevens. */
function rondeIndex(){
  const kandidaten = new Map(), contacten = new Map();
  const bij = (m, sleutel, waarde) => {
    const l = m.get(sleutel); if(l) l.push(waarde); else m.set(sleutel, [waarde]);
  };
  CRM.kandidaten().forEach(c => bij(kandidaten, c.klant, c));
  (CRM.state.contacten || []).forEach(ct => bij(contacten, ct.klant, ct));
  return {kandidaten, contacten};
}

/* Welke klanten? Niet alles wat in de database staat. CRM.actieveKlanten()
   is het antwoord dat de rest van de app al geeft op "is dit een lopende
   relatie": een klant met een lopende of geplaatste kandidaat, of een
   getekende samenwerking (sales-fase 'Afgerond'). Leads en prospects horen
   er niet bij — "hoe gaat het met de mensen die bij jullie werken" is geen
   vraag die je aan een prospect stelt. Hier een eigen definitie verzinnen
   zou precies de dubbele waarheid opleveren die dit bestand opruimt.       */
function rondeKlanten(mij, vrijdag){
  const tot = plusDagen(vrijdag, RONDE_DAGEN);
  const ix = rondeIndex();
  return (CRM.actieveKlanten() || [])
    .filter(k => !(mij && k.eigenaar && k.eigenaar !== mij))
    .map(k => klantRegel(k, vrijdag, tot, ix))
    /* Bovenaan wie je het langst niet gesproken hebt, en daarboven nog wie
       je nog nóóit gesproken hebt. Wie deze week al aan de lijn hing zakt
       vanzelf naar onderen: die kost hooguit een half belletje. */
    .sort((a,b) =>
         (a.gedaan ? 1 : 0) - (b.gedaan ? 1 : 0)
      || (a.laatst ? 1 : 0) - (b.laatst ? 1 : 0)
      || String(a.laatst).localeCompare(String(b.laatst))
      || String(a.naam).localeCompare(String(b.naam), 'nl'));
}

function ronde(mij, vrijdag){
  const klanten = rondeKlanten(mij, vrijdag);
  return {vrijdag, klanten, teDoen: klanten.filter(k => !k.gedaan),
          sleutel: KLANT_KEY + ':' + vrijdag};
}

/* De twee doelen staan allebei in de titel. Dat is geen stijlkeuze: het
   ophalen van vacatures is voor Tjeerd de halve reden van deze ronde, en
   wat niet in de regel staat gebeurt op vrijdagmiddag niet. */
function klantItem(r){
  const n = r.teDoen.length;
  return {
    soort:'klantupdate', key:r.sleutel, datum:r.vrijdag,
    kanaal:'bel', kort:'klantupdates',
    entiteit:'klant', ref:'', mod:'klanten', id:'', naam:'',
    titel: n === 1
      ? 'klantupdate: bel ' + r.teDoen[0].naam + ' bij en vraag welke vacatures eraan komen'
      : 'klantupdates: bel ' + n + ' klanten bij en haal nieuwe vacatures op',
    sub: r.teDoen.slice(0,3).map(k => k.naam).join(', ') + (n > 3 ? ' …' : ''),
    vrijdag: r.vrijdag, aantal: n, totaal: r.klanten.length
  };
}

/* Voor het dashboard van vandaag. */
function klantUpdateOpen(mij, nu){
  const vrijdag = rondeVrijdag(nu);
  if(!vrijdag) return [];
  if(vrijdag === nu && !naTwaalf(nu)) return [];   // vrijdagochtend: nog geen tijd
  const r = ronde(mij, vrijdag);
  if(!r.klanten.length || !r.teDoen.length) return [];
  const it = klantItem(r);
  it.open = true;
  it.urgent = vrijdag < nu;      // na vrijdag is het uitgesteld werk
  return [it];
}

/* Voor de weekweergave. Eén regel per vrijdag in het bereik, op zijn eigen
   dag — dus maandag zie je vrijdag al staan. De klok telt hier niet mee:
   een planning die 's ochtends verdwijnt en om twaalf uur terugkomt is geen
   planning. Een ronde die haar maandag achter zich heeft laten we vallen.
   Op maandag staat de ronde van afgelopen vrijdag daarom wél in de dagbaan
   (dat is werk van vandaag) maar niet in de week: die vrijdag ligt in de
   vórige week en heeft in dit raster geen kolom. */
function klantUpdateTussen(mij, van, tot){
  const uit = [], nu = vandaag();
  let d = van;
  for(let i = 0; i < 400 && d && d <= tot; i++, d = plusDagen(d, 1)){
    if(!isVrijdag(d) || plusDagen(d, RONDE_DAGEN) < nu) continue;
    const r = ronde(mij, d);
    if(!r.klanten.length || !r.teDoen.length) continue;
    const it = klantItem(r);
    it.open   = d < nu || (d === nu && naTwaalf(nu));
    it.urgent = d < nu;
    uit.push(it);
  }
  return uit;
}

/* ─── Het detailpaneel: de belronde zelf ──────────────────────────
   Eén klant per regel met genoeg op het scherm om meteen te bellen: wie er
   werkt, hoeveel vacatures er openstaan, wanneer je elkaar voor het laatst
   sprak en welke vraag er bij deze klant hoort. Afvinken gebeurt door vast
   te leggen wat eruit kwam — dezelfde afspraak als bij de check-ins: een
   vinkje zonder inhoud vertelt de volgende week niets.                   */
function vacatureVraag(r){
  if(r.vacs.length === 1)
    return 'Er staat één vacature open (' + r.vacs[0].functie + '). Vraag hoe het ermee staat en wat er verder nog aankomt.';
  if(r.vacs.length > 1)
    return 'Er staan ' + r.vacs.length + ' vacatures open. Loop ze langs en vraag wat er verder nog aankomt.';
  if(r.werkt.length)
    return 'Geen openstaande vacature. Vraag waar ze de komende weken mensen tekortkomen.';
  return 'Er werkt op dit moment niemand van ons. Vraag wat er op de planning staat.';
}
const namenLijst = (cs, max = 4) => cs.slice(0, max).map(c => c.naam).join(', ')
  + (cs.length > max ? ' en ' + (cs.length - max) + ' anderen' : '');

function klantFeiten(r){
  const f = [];
  f.push(r.werkt.length
    ? (r.werkt.length === 1 ? '1 aan het werk: ' : r.werkt.length + ' aan het werk: ') + namenLijst(r.werkt)
    : 'niemand van ons aan het werk');
  if(r.start.length) f.push(r.start.length === 1
    ? '1 getekend, moet nog starten' : r.start.length + ' getekend, moeten nog starten');
  f.push(r.vacs.length === 0 ? 'geen openstaande vacature'
       : r.vacs.length === 1 ? '1 openstaande vacature'
       : r.vacs.length + ' openstaande vacatures');
  f.push(r.laatst ? 'laatst contact ' + CRM.geleden(r.laatst) : 'nog nooit contact vastgelegd');
  return f;
}

function klantStatusHtml(r, vrijdag){
  if(r.gedaan){
    const wat = r.bron === 'vast' ? 'vastgelegd'
      : r.bron === 'kaart' ? 'contact'   // alleen het veld op de klantkaart
      : String((CRM.ACT_SOORTEN[(r.bewijs || {}).soort] || {}).lbl || 'contact').toLowerCase();
    const op = r.bewijs ? CRM.fmtDateShort(r.bewijs.op) : CRM.fmtDateShort(r.klant.laatst_contact);
    return `<span class="chip green">${h(wat)} ${h(op)}</span>`;
  }
  if(!r.laatst) return '<span class="chip amber">nog nooit contact</span>';
  /* Deze week al gesproken: blijft in de lijst — de vacaturevraag is nog
     niet gesteld — maar staat onderaan en zegt eerlijk dat het kort mag. */
  if(r.laatst >= plusDagen(vrijdag, -4)) return '<span class="chip">deze week al gesproken</span>';
  return '';
}

function klantRijHtml(r, i, vrijdag){
  const c = r.contact;
  const wie = c.naam
    ? h(c.naam) + (c.functie ? ' <span class="meta">(' + h(c.functie) + ')</span>' : '')
    : c.tel ? '<span class="meta">algemeen nummer</span>'
            : '<span class="meta">geen contactpersoon vastgelegd</span>';
  const tel = c.tel ? ` · <a href="tel:${h(String(c.tel).replace(/\s/g,''))}" class="num">${h(c.tel)}</a>` : '';
  return `<div class="ovk-r${r.gedaan ? ' af' : ''}">
    <div class="ovk-top">
      <button type="button" class="ovk-naam" data-ovkkaart="${h(r.naam)}"
        title="Open de klantkaart">${h(r.naam)}</button>
      ${klantStatusHtml(r, vrijdag)}
      <span class="spacer"></span>
      ${r.gedaan ? '' : `<button type="button" class="btn ghost sm" data-ovkopen="${i}">Vastleggen</button>`}
    </div>
    <div class="ovk-feit meta">${h(klantFeiten(r).join(' · '))}</div>
    <div class="ovk-contact">${wie}${tel}</div>
    ${r.gedaan ? '' : `<div class="ovk-vraag">${h(vacatureVraag(r))}</div>`}
    <div class="ovk-noteer" id="ovk_n${i}">
      <textarea rows="3" placeholder="Wat kwam eruit? Noteer ook welke vacatures eraan komen."></textarea>
      <div class="ovk-noteer-f">
        <button type="button" class="btn ghost sm" data-ovkweg="${i}">Annuleren</button>
        <button type="button" class="btn sm" data-ovkleg="${i}">Vastleggen</button>
      </div>
    </div>
  </div>`;
}

function rondeHtml(r){
  const gedaan = r.klanten.length - r.teDoen.length;
  const pct = r.klanten.length ? Math.round(gedaan / r.klanten.length * 100) : 0;
  return `<div class="drawer-h">
      <div class="ovk-h">
        <div class="h2">Klantupdates — vrijdag ${h(CRM.fmtDate(r.vrijdag))}</div>
        <p class="sub" style="margin:5px 0 0">Vertel hoe het met onze mensen gaat, en vraag welke
          vacatures eraan komen. Dat tweede is de helft van het rondje.</p>
      </div>
      <button class="btn ghost sm x" data-close>Sluiten</button>
    </div>
    <div class="drawer-b">
      ${r.klanten.length ? `<div class="ovk-kop">
        <span class="meta num">${gedaan} van ${r.klanten.length} gedaan</span>
        ${CRM.ui.bar(pct, pct >= 100 ? 'green' : '')}
      </div>
      <div class="ovk-lijst">${r.klanten.map((k,i) => klantRijHtml(k, i, r.vrijdag)).join('')}</div>
      <p class="meta ovk-uit">Bovenaan staat wie je het langst niet gesproken hebt. Een klant geldt als
        gedaan zodra je hier iets vastlegt, of zodra er deze ronde langs een andere weg contact is
        geweest — je hoeft niets dubbel te doen.</p>`
      : CRM.ui.leeg('Geen klanten in je lijst',
          'Er staat geen enkele lopende klant op jouw naam. Zodra een klant aan jou wordt gekoppeld, staat hij hier vrijdag vanzelf.')}
    </div>`;
}

function klantRondeVenster(vrijdag, na){
  const mij = CRM.me();
  const dat = dag(vrijdag) || rondeVrijdag(vandaag()) || vandaag();
  const r = ronde(mij, dat);

  /* Na het vastleggen wordt de lijst opnieuw doorgerekend maar NIET opnieuw
     gesorteerd: een regel die je net afvinkt hoort niet onder je muis weg te
     springen terwijl je de volgende belt. De volgorde van het openen blijft. */
  const ververs = () => {
    const nieuw = ronde(mij, dat);
    const idx = new Map(nieuw.klanten.map(k => [k.naam, k]));
    r.klanten = r.klanten.map(k => idx.get(k.naam) || k);
    r.teDoen  = r.klanten.filter(k => !k.gedaan);
  };

  const bind = dr => {
    CRM.$$('[data-close]', dr).forEach(b => b.onclick = () => CRM.drawer.close());
    CRM.$$('[data-ovkkaart]', dr).forEach(b => b.onclick = () => {
      const naam = b.dataset.ovkkaart;
      CRM.drawer.close();
      CRM.ga('klanten', {id:naam});
    });
    CRM.$$('[data-ovkopen]', dr).forEach(b => b.onclick = () => {
      const box = dr.querySelector('#ovk_n' + b.dataset.ovkopen);
      if(!box) return;
      const aan = box.classList.toggle('open');
      b.textContent = aan ? 'Sluiten' : 'Vastleggen';
      if(aan) box.querySelector('textarea').focus();
    });
    CRM.$$('[data-ovkweg]', dr).forEach(b => b.onclick = () => {
      const box = dr.querySelector('#ovk_n' + b.dataset.ovkweg);
      if(!box) return;
      box.classList.remove('open');
      const knop = dr.querySelector('[data-ovkopen="' + b.dataset.ovkweg + '"]');
      if(knop) knop.textContent = 'Vastleggen';
    });
    CRM.$$('[data-ovkleg]', dr).forEach(b => b.onclick = async () => {
      const k = r.klanten[Number(b.dataset.ovkleg)];
      if(!k || k.gedaan) return;
      const ta = dr.querySelector('#ovk_n' + b.dataset.ovkleg + ' textarea');
      const tekst = String(ta ? ta.value : '').trim();
      b.disabled = true;
      try{
        await CRM.logActiviteit('klant', k.naam, 'bel',
          'Klantupdate ' + CRM.fmtDate(dat) + (tekst ? ' — ' + tekst : ''),
          {opvolging:r.sleutel});
      }catch(e){ b.disabled = false; return CRM.fout('Vastleggen mislukt', e); }
      CRM.toast('Vastgelegd','ok');
      teken();
      if(typeof na === 'function') na(); else CRM.render();
    });
  };

  /* Opnieuw tekenen in het bestaande paneel: heropenen zou de animatie
     overdoen en de lijst terugspringen naar boven, midden in een belronde. */
  function teken(){
    ververs();
    const dr = CRM.drawer.el();
    if(!dr) return;
    const body = dr.querySelector('.drawer-b');
    const scroll = body ? body.scrollTop : 0;
    dr.innerHTML = rondeHtml(r);
    const nieuwBody = dr.querySelector('.drawer-b');
    if(nieuwBody) nieuwBody.scrollTop = scroll;
    bind(dr);
  }

  CRM.drawer.open(rondeHtml(r), {onOpen:bind});
}

/* De vrijdagse klantupdate-ronde opent zijn eigen venster. Dat liep eerst via
   een klikonderschepping op de dashboardregels, omdat het dashboard geen
   ingang bood voor een opvolgmoment zonder kandidaat. Sinds de herindeling
   roept het dashboard `CRM.opvolging.venster(key, na)` gewoon rechtstreeks
   aan — de onderschepping keek naar `.tl2-item`-regels die niet meer
   bestaan en is daarom weggehaald. */

/* ═══ PUBLIEKE API ════════════════════════════════════════════════ */
const OPV = CRM.opvolging = {

  /* Wat als contact telt. Gedeeld, want de kandidatenlijst filtert en
     sorteert op dezelfde vraag ("hoe lang niet gesproken"). Stond daar
     eerst als eigen kopie van vijf woorden — twee lijsten die gelijk
     moeten blijven gaan een keer uit elkaar lopen, en dan beweren het
     dashboard en de kandidatenlijst iets anders over dezelfde persoon. */
  CONTACT,

  /* Alle momenten van deze kandidaat, met datum en of het gedaan is.
     peil = de dag waarop je kijkt (default vandaag).
     Terug: {momenten, open, gemist, volgende, gedaanAantal, totaal, actief} */
  voorKandidaat(c, peil){
    const nu = dag(peil) || vandaag();
    if(!c) return leegResultaat();
    /* Van een geanonimiseerde kaart zijn naam, nummer en e-mail bewust
       gewist. Nazorg blijven plannen betekent dan een belronde naar iemand
       die je niet meer kunt bellen, en een felicitatiemail zonder adres.
       Erger: de taak zegt "bel deze kandidaat" over iemand die net om
       verwijdering heeft gevraagd. */
    if(CRM.kandVerwijder?.isGeanonimiseerd?.(c)) return leegResultaat();
    const f = CRM.faseNorm(c.fase);
    let momenten = [];

    /* Nazorg — alleen bij een lopende plaatsing met een startdatum. */
    if(f === 'Gestart' && dag(c.start) && !c.gestoptOp)
      momenten = momenten.concat(nazorgMomenten(dag(c.start)));

    /* Warm houden — getekend, nog niet gestart. */
    if(f === 'Contract getekend' && !c.gestoptOp){
      const getekend = dag(c.geplaatstOp) || dag(c.since);
      if(getekend) momenten = momenten.concat(warmMomenten(getekend, dag(c.start)));
      momenten = momenten.concat(felicitatieMoment(c));
    }

    /* Herinnering vóór een geplande afspraak — geldt in de gespreksfases,
       dus juist waar de nazorg nog niet loopt. */
    if(f !== 'Afgevallen' && f !== 'Gestopt')
      momenten = momenten.concat(afspraakMomenten(c));

    /* Verjaardag — los van de fase-ritmes, wel met eigen doelgroep. */
    momenten = momenten.concat(verjaardagMomenten(c, nu));

    if(!momenten.length) return leegResultaat();

    zetVensters(momenten);
    bepaalGedaan(c, momenten);
    momenten.forEach(m => {
      m.kandidaatId = c.id; m.naam = c.naam;
      m.open   = !m.gedaan && m.datum <= nu && nu < m.openTot;
      m.gemist = !m.gedaan && m.openTot <= nu;
      m.komt   = !m.gedaan && m.datum > nu;
    });

    const telbaar = momenten.filter(m => m.soort === 'nazorg' || m.soort === 'warm');
    /* `volgende` is wat er nog KOMT of nu openstaat — niet het oudste gat.
       Anders wijst een plaatsing van dertien maanden geleden naar de
       startdag van vorig jaar als "volgende check-in", en dat klopt niet:
       die is niet volgend, die is voorbij. */
    const volgende = momenten.find(m => m.open || m.komt) || null;
    return {
      momenten, actief:true,
      open:    momenten.filter(m => m.open),
      gemist:  momenten.filter(m => m.gemist),
      volgende,
      gedaanAantal: telbaar.filter(m => m.gedaan).length,
      totaal: telbaar.length,
      klaar: telbaar.length > 0 && telbaar.every(m => m.gedaan),
      /* Het hele ritme ligt achter ons: niets open, niets aanstaand. */
      voorbij: !volgende
    };
  },

  /* Wat er op `datum` te doen is voor `mij`. Voor het dashboard.
     Levert platte items op; wie ze wil groeperen doet dat zelf.
     Item: {key, soort, kanaal, titel, sub, datum, entiteit, ref, naam,
            mod, id, urgent}                                          */
  openVoor(mij, datum){
    const nu = dag(datum) || vandaag();
    const uit = [];
    CRM.kandidaten().forEach(c => {
      /* Kandidaten hangen aan hun recruiter. Staat er niemand op, dan is
         het van iedereen — zelfde regel als bij de taken op het dashboard. */
      if(mij && c.rec && c.rec !== mij) return;
      const r = OPV.voorKandidaat(c, nu);
      r.open.forEach(m => uit.push(Object.assign({
        entiteit:'kandidaat', ref:c.id, naam:c.naam, mod:'kandidaten', id:c.id,
        sub:[c.naam, c.klant].filter(Boolean).join(' · '),
        urgent: m.datum < nu || m.soort === 'verjaardag'
      }, m)));
    });
    /* De vrijdagronde hangt niet aan een kandidaat maar aan de AM zelf. */
    klantUpdateOpen(mij, nu).forEach(x => uit.push(x));
    /* Uitbreidpunt: andere modules kunnen hun eigen opvolging toevoegen
       (bv. verjaardagen van contactpersonen vanuit js/klanten.js) met
       CRM.opvolging.registreerBron(fn). fn(mij, datum) geeft dezelfde
       itemvorm terug; entiteit/mod/ref bepaalt de module zelf. */
    OPV.bronnen.forEach(fn => {
      try{ (fn(mij, nu) || []).forEach(x => x && uit.push(x)); }
      catch(e){ console.warn('opvolging-bron faalde', e); }
    });
    uit.sort((a,b) => String(a.datum).localeCompare(String(b.datum))
                   || String(a.naam || '').localeCompare(String(b.naam || '')));
    return uit;
  },

  /* Alles wat in het bereik [van, tot] valt en nog niet gedaan is.
     Voor de weekweergave van het dashboard: wie volgende week gebeld moet
     worden, wil je nú al zien staan — niet pas op de dag zelf.
     `openVoor` blijft de smalle vraag ("wat moet er vandaag gebeuren"),
     dit is de brede. */
  tussen(mij, van, tot){
    const v = dag(van), t = dag(tot);
    if(!v || !t || t < v) return [];
    const uit = [];
    CRM.kandidaten().forEach(c => {
      if(mij && c.rec && c.rec !== mij) return;
      /* Peildatum is VANDAAG, ook als je naar een andere week kijkt: of iets
         open staat of gemist is, gaat over nu. Zou je vanaf maandag rekenen,
         dan heet een check-in van woensdag "komt nog" terwijl hij vandaag
         gewoon open staat. */
      const r = OPV.voorKandidaat(c, vandaag());
      r.momenten.forEach(m => {
        if(m.gedaan || m.datum < v || m.datum > t) return;
        uit.push(Object.assign({
          entiteit:'kandidaat', ref:c.id, naam:c.naam, mod:'kandidaten', id:c.id,
          sub:[c.naam, c.klant].filter(Boolean).join(' · '),
          urgent: m.gemist || m.soort === 'verjaardag'
        }, m));
      });
    });
    /* De vrijdagronde krijgt het hele bereik in één keer: hij weet zelf welke
       vrijdagen erin vallen, en per dag vragen zou dezelfde ronde vier keer
       opleveren (vrijdag, zaterdag, zondag, maandag horen bij één vrijdag). */
    klantUpdateTussen(mij, v, t).forEach(x => uit.push(x));
    /* Externe bronnen kennen alleen de vraag "wat staat er op déze dag";
       voor een bereik stellen we die vraag per dag. Een week is zeven
       aanroepen — goedkoop, en de bron hoeft er niets voor te leren. */
    if(OPV.bronnen.length){
      for(let d = v; d <= t; d = plusDagen(d, 1)){
        OPV.bronnen.forEach(fn => {
          try{ (fn(mij, d) || []).forEach(x => x && uit.push(x)); }
          catch(e){ console.warn('opvolging-bron faalde', e); }
        });
      }
    }
    uit.sort((a,b) => String(a.datum).localeCompare(String(b.datum))
                   || String(a.naam || '').localeCompare(String(b.naam || '')));
    return uit;
  },

  bronnen: [],
  registreerBron(fn){ if(typeof fn === 'function') OPV.bronnen.push(fn); },

  /* ─── Felicitatiemail ──────────────────────────────────────────
     Terug: {aan, onderwerp, tekst, ontbreekt, blokkerend, velden}
     `ontbreekt`  = regels die zijn weggevallen (mail is te versturen)
     `blokkerend` = gaten midden in een zin (mail is NIET te versturen) */
  mailFelicitatie(c, opts){
    return bouwMail(c, opts || {});
  },

  /* Een check-in vastleggen: schrijft één activiteit met de markering,
     zodat het moment daarna vanzelf als gedaan geldt. */
  async vastleggen(c, key, soort, tekst){
    const m = (OPV.voorKandidaat(c).momenten || []).find(x => x.key === key);
    const kanaal = soort || (m && m.kanaal) || 'bel';
    await CRM.logActiviteit('kandidaat', c.id, kanaal,
      (m ? m.titel + ' — ' : '') + (tekst || ''), {opvolging:key});
  },

  /* De tekst van het berichtje vóór een afspraak, los opvraagbaar. */
  berichtAfspraak(c, key){
    const m = (OPV.voorKandidaat(c).momenten || [])
      .find(x => x.soort === 'afspraak' && (!key || x.key === key));
    return m ? {kanaal:m.kanaal, tekst:afspraakTekst(c, m), moment:m} : null;
  },

  /* Eén ingang voor "doe iets met dit moment", zodat het dashboard en de
     kandidatenkaart niet allebei hoeven te weten welk venster erbij hoort. */
  actie(c, key, na){
    if(!c) return;
    if(key === 'mail:felicitatie') return mailVenster(c, na);
    if(String(key).startsWith('afspraak:')) return berichtVenster(c, key, na);
    return checkInVenster(c, key, na);
  },

  /* Een venster openen dat niet aan één kandidaat hangt. Nu alleen de
     vrijdagse klantupdate-ronde; `key` heeft de vorm 'klantupdate:JJJJ-MM-DD'.
     Geeft false terug als de sleutel onbekend is, zodat een aanroeper kan
     terugvallen op zijn eigen gedrag. */
  venster(key, na){
    const m = /^klantupdate:(\d{4}-\d{2}-\d{2})$/.exec(String(key == null ? '' : key));
    if(!m) return false;
    klantRondeVenster(m[1], na);
    return true;
  },

  /* De klantupdate-ronde van een bepaalde vrijdag, voor wie hem zelf wil
     tonen (bv. Klanten of Performance). Leeg vrijdag = de ronde van nu. */
  klantRonde(mij, vrijdag){
    const dat = dag(vrijdag) || rondeVrijdag(vandaag());
    return dat ? ronde(mij === undefined ? CRM.me() : mij, dat) : null;
  },

  /* Kleine leesbare stukjes voor de andere modules. */
  kaartHtml, bindKaart, chipHtml, mailVenster, berichtVenster, klantRondeVenster,
  /* Voor Performance: iedereen met een open of aanstaand moment. */
  lopend(mij, datum){
    const nu = dag(datum) || vandaag();
    const uit = [];
    CRM.kandidaten().forEach(c => {
      if(mij && c.rec && c.rec !== mij) return;
      const r = OPV.voorKandidaat(c, nu);
      if(!r.actief || r.klaar) return;
      /* Wat er nú open staat, en anders het eerstvolgende ritmemoment. Een
         verjaardag die er over vier maanden aankomt hoort niet in een
         kolom die gaat over lopende opvolging. */
      const v = r.open[0] || r.momenten.find(m => m.komt && m.soort !== 'verjaardag');
      if(!v) return;
      uit.push({c, moment:v, nu:v.open === true, gedaan:r.gedaanAantal, totaal:r.totaal});
    });
    return uit.sort((a,b) => (b.nu?1:0) - (a.nu?1:0)
      || String(a.moment.datum).localeCompare(String(b.moment.datum)));
  }
};

function leegResultaat(){
  return {momenten:[], actief:false, open:[], gemist:[], volgende:null,
          gedaanAantal:0, totaal:0, klaar:false};
}

/* ═══ DE FELICITATIEMAIL ══════════════════════════════════════════
   De tekst staat hier letterlijk zoals Tjeerd hem heeft aangeleverd;
   alleen de plaatshouders worden vervangen. Niets automatisch versturen.

   OMGAAN MET LEGE VELDEN — de keuze en waarom:
   `werklocatie` is bij vrijwel alle vacatures in productie leeg en
   `startdatum` ontbreekt regelmatig. Twee soorten gaten, twee antwoorden:

   1. Gaten in het LIJSTJE (startdatum, functie-regel, werklocatie) →
      de regel VALT WEG. "Werklocatie: —" naar iemand die net getekend
      heeft is pijnlijk; een lijstje van twee regels is dat niet. Valt
      het hele lijstje weg, dan gaat de aankondigingszin er ook uit,
      anders staat er een dubbele punt zonder vervolg. De AM ziet vóór
      het versturen precies welke regels zijn weggevallen.
   2. Gaten MIDDEN IN EEN ZIN (voornaam, bedrijf, functie in de lopende
      tekst, naam van de AM) → de mail is NIET te versturen. Daar valt
      niets weg zonder de zin te breken, en "je gaat aan de slag bij  als
      " is erger dan een dag wachten. De knop blijft uit tot het klopt.

   Het telefoonnummer van de AM staat nergens in het schema (profiles
   heeft naam, rol, functie, e-mail en foto, geen telefoon). Daarom vult
   de AM het één keer in het venster in en onthouden we het lokaal, per
   gebruiker. Zie het verzoek aan core onderaan dit bestand.           */

const TEL_KEY = 'crm_am_telefoon';
function amTelefoon(){ try{ return localStorage.getItem(TEL_KEY) || ''; }catch(e){ return ''; } }
function zetAmTelefoon(v){ try{ localStorage.setItem(TEL_KEY, String(v || '').trim()); }catch(e){} }

/* Werklocatie: eerst de vacature, dan het adres van de klant — precies de
   keten die het pijplijnbord ook op de kaart zet. Vinden we niets, dan
   valt de regel weg (zie hierboven). */
function werklocatieVan(c){
  const v = (CRM.state.vacs || []).find(x => String(x.id) === String(c.vacatureId));
  const k = CRM.klant(c.klant) || {};
  const uit = (v && v.locatie) || k.plaats || k.locatie || '';
  const bron = (v && v.locatie) ? 'vacature' : (k.plaats || k.locatie) ? 'klantgegevens' : '';
  return {waarde:String(uit || '').trim(), bron};
}

function bouwMail(c, opts = {}){
  const tel = opts.telefoon != null ? String(opts.telefoon).trim() : amTelefoon();
  const loc = werklocatieVan(c);
  const v = (CRM.state.vacs || []).find(x => String(x.id) === String(c.vacatureId));
  const velden = {
    voornaam:       eerste(c.naam),
    bedrijf:        String(c.klant || '').trim(),
    functie:        String(c.functie || (v && v.functie) || '').trim(),
    startdatum:     dag(c.start) ? CRM.fmtDate(c.start) : '',
    werklocatie:    loc.waarde,
    accountmanager: String(c.rec || CRM.me() || '').trim(),
    telefoonnummer_am: tel
  };

  /* Gaten midden in een zin — hier valt niets weg. */
  const blokkerend = [];
  if(!velden.voornaam)       blokkerend.push({veld:'voornaam',   uitleg:'De kandidaat heeft geen naam op de kaart.'});
  if(!velden.bedrijf)        blokkerend.push({veld:'bedrijf',    uitleg:'Vul de klant in op de kandidatenkaart.'});
  if(!velden.functie)        blokkerend.push({veld:'functie',    uitleg:'Vul de functie in op de kandidatenkaart of de vacature.'});
  if(!velden.accountmanager) blokkerend.push({veld:'accountmanager', uitleg:'Geen recruiter op de kaart en geen naam in je profiel.'});

  /* Gaten in het lijstje en de ondertekening — die regels vallen weg. */
  const ontbreekt = [];
  if(!velden.startdatum)        ontbreekt.push({veld:'startdatum',  uitleg:'De regel "Startdatum" valt weg. Vul de startdatum in op de kandidatenkaart.'});
  if(!velden.werklocatie)       ontbreekt.push({veld:'werklocatie', uitleg:'De regel "Werklocatie" valt weg. Vul de locatie in bij de vacature.'});
  if(!velden.telefoonnummer_am) ontbreekt.push({veld:'telefoonnummer', uitleg:'Je telefoonnummer valt weg onder je naam. Vul het hieronder in — het wordt onthouden.'});

  /* Het lijstje. Alleen regels die een waarde hebben. */
  const lijst = [
    velden.startdatum  ? 'Startdatum: ' + velden.startdatum : '',
    velden.functie     ? 'Functie: ' + velden.functie : '',
    velden.werklocatie ? 'Werklocatie: ' + velden.werklocatie : ''
  ].filter(Boolean);

  const onderwerp = velden.bedrijf
    ? 'Gefeliciteerd — je contract bij ' + velden.bedrijf + ' is rond'
    : 'Gefeliciteerd — je contract is rond';

  const tekst = [
    'Hoi ' + velden.voornaam + ',',
    '',
    'Gefeliciteerd, het is officieel. Je contract is getekend en je hoort er nu echt bij.',
    '',
    'Wij hebben er alle vertrouwen in dat je op je plek gaat zitten bij ' + velden.bedrijf +
      ' als ' + velden.functie + '. Je hebt jezelf laten zien in het traject, en nu begint het echte werk. ' +
      'Mooi dat je onderdeel wordt van de ploeg.',
    ''
  ].concat(lijst.length ? ['Even het belangrijkste op een rij:', ''].concat(lijst, ['']) : [])
   .concat([
    'Ik neem sowieso nog persoonlijk contact met je op om de laatste details door te nemen, zoals hoe laat je precies verwacht wordt en wat je meeneemt. Heb je daarvoor al vragen, of zit je ergens mee? Bel of app me gerust, ik ben er voor je.',
    '',
    'We kijken ernaar uit om met je te bouwen.',
    '',
    'Tot snel,',
    '',
    velden.accountmanager,
    'Ploeggenoten'
  ]).concat(velden.telefoonnummer_am ? [velden.telefoonnummer_am] : []).join('\n');

  return {aan:String(c.email || '').trim(), onderwerp, tekst, velden, ontbreekt, blokkerend,
          locatieBron:loc.bron};
}

/* Het venster. De AM leest de mail na, vult desnoods zijn nummer in en
   drukt zelf op versturen. Er gaat niets weg zonder die klik. */
function mailVenster(c, na){
  const teken = () => {
    const m = bouwMail(c);
    const kanVersturen = !m.blokkerend.length && !!m.aan;
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Felicitatiemail</div>
        <p class="sub" style="margin:6px 0 0">${h(c.naam)}${c.klant ? ' · ' + h(c.klant) : ''}</p></div>
      <div class="modal-b">
        ${!m.aan ? `<div class="note err">Deze kandidaat heeft geen e-mailadres op de kaart.
          Vul het in bij Kandidaatgegevens, dan kun je de mail versturen.</div>` : ''}
        ${m.blokkerend.length ? `<div class="note err"><b>Nog niet te versturen.</b>
          <ul class="ov-gaten">${m.blokkerend.map(x =>
            `<li><b>${h(x.veld)}</b> — ${h(x.uitleg)}</li>`).join('')}</ul></div>` : ''}
        ${m.ontbreekt.length ? `<div class="note warn"><b>Deze regels vallen weg.</b>
          <ul class="ov-gaten">${m.ontbreekt.map(x =>
            `<li><b>${h(x.veld)}</b> — ${h(x.uitleg)}</li>`).join('')}</ul></div>` : ''}
        ${m.locatieBron === 'klantgegevens' ? `<div class="note info">De werklocatie komt uit de
          klantgegevens, niet uit de vacature. Klopt hij niet, pas hem dan aan in de tekst.</div>` : ''}
        <div class="f-grid">
          <div class="f-row"><label for="ov_aan">Aan</label>
            <input type="text" id="ov_aan" value="${h(m.aan)}" placeholder="nog geen e-mailadres"></div>
          <div class="f-row"><label for="ov_tel">Jouw telefoonnummer</label>
            <input type="text" id="ov_tel" value="${h(m.velden.telefoonnummer_am)}"
              placeholder="06 12 34 56 78" autocomplete="tel"></div>
        </div>
        <div class="f-row"><label for="ov_ond">Onderwerp</label>
          <input type="text" id="ov_ond" value="${h(m.onderwerp)}"></div>
        <div class="f-row"><label for="ov_tekst">Bericht</label>
          <textarea id="ov_tekst" class="ov-mailtekst" rows="18">${h(m.tekst)}</textarea></div>
        <p class="meta">${olVerbonden()
          ? 'Wordt verstuurd vanaf jouw Outlook-account.'
          : 'Outlook is niet verbonden — de mail wordt klaargezet in je eigen mailprogramma.'}</p>
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="ov_send"${kanVersturen ? '' : ' disabled'}>Versturen</button>
      </div>`, {onOpen(mo){
      const tel  = mo.querySelector('#ov_tel');
      const tk   = mo.querySelector('#ov_tekst');
      const ond  = mo.querySelector('#ov_ond');
      const aan  = mo.querySelector('#ov_aan');
      const send = mo.querySelector('#ov_send');

      /* Nummer ingevuld → de ondertekening klopt weer. Opnieuw tekenen zodat
         de waarschuwing verdwijnt in plaats van te blijven liegen. */
      tel.onchange = () => {
        const nieuw = tel.value.trim();
        if(nieuw === m.velden.telefoonnummer_am) return;
        zetAmTelefoon(nieuw);
        CRM.modal._onClose = null; CRM.modal.close(); teken();
      };
      const kijk = () => { send.disabled = !aan.value.trim() || !tk.value.trim() || m.blokkerend.length > 0; };
      aan.oninput = kijk; tk.oninput = kijk;

      send.onclick = async () => {
        const adres = aan.value.trim(), onderwerp = ond.value.trim(), tekst = tk.value;
        if(!adres) return CRM.toast('Vul eerst een e-mailadres in','err');
        if(!tekst.trim()) return CRM.toast('De mail is leeg','err');
        send.disabled = true; send.textContent = 'Versturen…';
        try{
          await verstuurMail(c, {aan:adres, onderwerp, tekst});
          CRM.modal._onClose = null; CRM.modal.close();
          if(typeof na === 'function') na();
          CRM.render();
        }catch(e){
          send.disabled = false; send.textContent = 'Versturen';
          CRM.fout('Versturen mislukt', e);
        }
      };
    }});
  };
  teken();
}

const olVerbonden = () => {
  try{ return !!(CRM.outlook && CRM.outlook.beschikbaar && CRM.outlook.beschikbaar()
                 && CRM.outlook.verbonden && CRM.outlook.verbonden()); }
  catch(e){ return false; }
};

/* Versturen. Met Outlook via CRM.outlook.stuurMail, anders via de route die
   de rest van de app ook gebruikt: een mailto met onderwerp én tekst, zodat
   de AM hem in het eigen mailprogramma ziet staan. In beide gevallen loggen
   we één activiteit met de markering — daarna verdwijnt de taak en
   feliciteert niemand een tweede keer. */
async function verstuurMail(c, m){
  if(CRM.demo){
    await CRM.logActiviteit('kandidaat', c.id, 'mail',
      'Felicitatiemail verstuurd — ' + m.onderwerp, {opvolging:'mail:felicitatie'});
    CRM.toast('Demo — de mail is niet echt verstuurd','ok');
    return;
  }
  if(olVerbonden()){
    await CRM.outlook.stuurMail({aan:[m.aan], onderwerp:m.onderwerp, tekst:m.tekst});
    await CRM.logActiviteit('kandidaat', c.id, 'mail',
      'Felicitatiemail verstuurd — ' + m.onderwerp, {opvolging:'mail:felicitatie'});
    CRM.toast('Felicitatiemail verstuurd','ok');
    return;
  }
  const url = 'mailto:' + encodeURIComponent(m.aan)
    + '?subject=' + encodeURIComponent(m.onderwerp)
    + '&body=' + encodeURIComponent(m.tekst);
  window.open(url, '_blank');
  await CRM.logActiviteit('kandidaat', c.id, 'mail',
    'Felicitatiemail klaargezet in je mailprogramma — ' + m.onderwerp, {opvolging:'mail:felicitatie'});
  CRM.toast('Mail klaargezet in je mailprogramma','ok');
}

/* ═══ HET BERICHTJE VÓÓR EEN AFSPRAAK ═════════════════════════════
   Klaarzetten, niet versturen. De AM leest het na, past het desnoods aan
   en kiest zelf het kanaal — WhatsApp als er een nummer is, mail als er
   een adres is. Daarna leggen we het vast, zodat de herinnering weg is en
   niemand hetzelfde appje twee keer stuurt.                            */
const waLink = (t, tekst) => {
  let n = String(t || '').replace(/[^0-9]/g,'');
  if(n.startsWith('06')) n = '31' + n.slice(1);
  if(n.startsWith('00')) n = n.slice(2);
  if(!n) return '';
  return 'https://wa.me/' + n + (tekst ? '?text=' + encodeURIComponent(tekst) : '');
};

function berichtVenster(c, key, na){
  const m = (OPV.voorKandidaat(c).momenten || []).find(x => x.key === key);
  if(!m) return CRM.toast('Deze afspraak staat niet meer gepland','err');
  const tel  = String(c.telefoon || '').trim();
  const mail = String(c.email || '').trim();
  const standaard = afspraakTekst(c, m);
  const wanneer = m.wanneer || wanneerLbl(m.afspraakOp);

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Berichtje klaarzetten</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)} · ${h(CRM.faseNorm(c.fase))}
        ${h(wanneer)}${m.tijd ? ' om ' + h(m.tijd) : ''}${c.klant ? ' bij ' + h(c.klant) : ''}</p></div>
    <div class="modal-b">
      ${!tel && !mail ? `<div class="note err">Deze kandidaat heeft geen telefoonnummer
        en geen e-mailadres. Vul er een in op de kaart, dan is de kandidaat bereikbaar.</div>` : ''}
      <div class="f-row"><label for="ov_btekst">Bericht</label>
        <textarea id="ov_btekst" class="ov-bericht" rows="6">${h(standaard)}</textarea></div>
      <p class="meta">Er gaat niets vanzelf de deur uit. Jij kiest het kanaal en drukt zelf op verzenden.</p>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn sub" id="ov_bnoteer">Alleen vastleggen</button>
      ${mail ? `<button class="btn sub" id="ov_bmail">Mailen</button>` : ''}
      ${tel  ? `<button class="btn" id="ov_bwa">Openen in WhatsApp</button>` : ''}
    </div>`, {onOpen(mo){
    const tk = mo.querySelector('#ov_btekst');
    const klaar = async (kanaal, tekst) => {
      CRM.modal._onClose = null; CRM.modal.close();
      await CRM.logActiviteit('kandidaat', c.id, kanaal,
        m.titel + ' — ' + tekst, {opvolging:key});
      if(typeof na === 'function') na(); else CRM.render();
    };
    const wa = mo.querySelector('#ov_bwa');
    if(wa) wa.onclick = () => {
      const tekst = tk.value.trim(); if(!tekst) return CRM.toast('Het bericht is leeg','err');
      if(!CRM.demo) window.open(waLink(tel, tekst), '_blank', 'noopener');
      CRM.toast(CRM.demo ? 'Demo — WhatsApp niet geopend' : 'WhatsApp geopend met je bericht','ok');
      klaar('whatsapp', tekst);
    };
    const ml = mo.querySelector('#ov_bmail');
    if(ml) ml.onclick = async () => {
      const tekst = tk.value.trim(); if(!tekst) return CRM.toast('Het bericht is leeg','err');
      const onderwerp = m.titel.replace(/^Morgen /, '').replace(/ — .*$/, '');
      try{
        if(!CRM.demo && olVerbonden())
          await CRM.outlook.stuurMail({aan:[mail], onderwerp, tekst});
        else if(!CRM.demo)
          window.open('mailto:' + encodeURIComponent(mail) + '?subject=' + encodeURIComponent(onderwerp)
            + '&body=' + encodeURIComponent(tekst), '_blank');
      }catch(e){ return CRM.fout('Versturen mislukt', e); }
      CRM.toast(CRM.demo ? 'Demo — mail niet verstuurd' : 'Mail onderweg','ok');
      klaar('mail', tekst);
    };
    mo.querySelector('#ov_bnoteer').onclick = () => klaar('notitie', tk.value.trim() || m.titel);
  }});
}

/* Het gewone vastleg-venster voor een check-in (nazorg, warm houden,
   verjaardag). Kort: één tekstveld, geen keuzes. */
async function checkInVenster(c, key, na){
  const m = (OPV.voorKandidaat(c).momenten || []).find(x => x.key === key);
  const tekst = await CRM.vraag(m ? m.titel : 'Check-in vastleggen', {
    hint: m ? m.hint : 'Leg vast wat je hoort — ook als alles goed gaat.',
    multiline:true, knop:'Vastleggen', placeholder:'Wat kwam eruit?'
  });
  if(tekst === null) return;
  await OPV.vastleggen(c, key, m && m.kanaal, tekst);
  CRM.toast('Vastgelegd','ok');
  if(typeof na === 'function') na(); else CRM.render();
}

/* ═══ MARKUP VOOR DE ANDERE MODULES ═══════════════════════════════ */

const SOORT_LBL = {nazorg:'Nazorg', warm:'Warm houden', verjaardag:'Verjaardag',
                   mail:'Felicitatiemail', afspraak:'Vóór de afspraak'};
const KNOP_LBL  = {mail:'Mail openen', afspraak:'Bericht klaarzetten'};
const KANAAL_LBL = {whatsapp:'appje', bel:'bellen', mail:'mailen', gesprek:'gesprek'};

/* Chip voor het pijplijnbord: kort, één regel, geen uitleg. */
function chipHtml(c){
  const r = OPV.voorKandidaat(c);
  if(!r.actief) return '';
  const open = r.open[0];
  if(open) return `<span class="chip red num" title="${h(SOORT_LBL[open.soort] || 'Opvolging')} — ${h(open.titel)}">${
      open.soort === 'verjaardag' ? 'jarig vandaag'
    : open.soort === 'afspraak'   ? 'stuur een succesje'
    : h(open.kort) + ' · nu'}</span>`;
  /* Vooruitblik alleen voor de ritmes die het bord niet al toont. Een
     aanstaande afspraak staat er al mét datum en tijd, en een verjaardag
     over drie maanden op een bordkaart is geen informatie maar ruis. */
  const v = r.momenten.find(m => m.komt && m.soort !== 'afspraak' && m.soort !== 'verjaardag');
  /* Ritme helemaal netjes doorlopen → één groene chip. Ritme voorbij met
     gaten erin → géén chip: die kaart hoeft het bord niet elke dag te
     herinneren aan een jaar dat niet meer bij te sturen is. Dat staat wel
     op de kandidatenkaart zelf. */
  if(!v) return r.klaar ? `<span class="chip green">nazorgjaar rond</span>` : '';
  return `<span class="chip num" title="${h(SOORT_LBL[v.soort] || 'Opvolging')} — ${h(v.titel)}">${
    h(v.kort)} · ${h(CRM.fmtDateShort(v.datum))}</span>`;
}

/* Het blok op de kandidatenkaart. Toont wat openstaat, wat eraan komt en
   — ingeklapt — het hele ritme, zodat de AM ziet dat er niets zoekraakt. */
function kaartHtml(c){
  const r = OPV.voorKandidaat(c);
  if(!r.actief) return '';
  const kop = r.open.length ? '<span class="chip amber">' + r.open.length + ' open</span>'
    : r.klaar ? '<span class="chip green">ritme afgerond</span>'
    : r.volgende ? `<span class="chip">volgende ${h(CRM.fmtDateShort(r.volgende.datum))}</span>`
    : '<span class="chip">ritme voorbij</span>';

  /* Standaard alleen wat ertoe doet: alles wat open of gemist is, plus de
     eerstvolgende drie. De rest zit achter "toon het hele ritme". */
  const kern = new Set();
  r.momenten.forEach(m => { if(m.open || m.gemist) kern.add(m.key); });
  r.momenten.filter(m => m.komt).slice(0,3).forEach(m => kern.add(m.key));
  if(!kern.size && r.momenten.length) kern.add(r.momenten[r.momenten.length-1].key);

  const pct = r.totaal ? Math.round(r.gedaanAantal / r.totaal * 100) : 0;
  return `<div class="card ov-kaart">
    <div class="card-h"><div class="h2">Opvolging</div>${kop}
      <span class="spacer"></span>
      ${r.totaal ? `<span class="meta num">${r.gedaanAantal} van ${r.totaal} gedaan</span>` : ''}</div>
    <div class="card-b">
      ${r.totaal ? CRM.ui.bar(pct, pct >= 100 ? 'green' : '') : ''}
      <div class="ov-lijst" id="ov_lijst">${r.momenten.map(m => momentRij(m, kern.has(m.key))).join('')}</div>
      ${r.momenten.length > kern.size
        ? `<button type="button" class="btn sub sm ov-meer" id="ov_meer">Toon het hele ritme</button>` : ''}
      <p class="meta ov-uit">${h(ritmeUitleg(r))}</p>
    </div></div>`;
}

function ritmeUitleg(r){
  const heeft = s => r.momenten.some(m => m.soort === s);
  if(heeft('nazorg')) return 'Startdag, dag erna, einde eerste week, na twee weken, na een maand en daarna maandelijks tot een jaar na de start.';
  if(heeft('warm'))   return 'Eén keer per week tot de startdatum. Daarna neemt de nazorg het over.';
  if(heeft('afspraak')) return 'De dag vóór een gesprek of meeloopdag ligt er een berichtje klaar. Verzet je de afspraak, dan schuift het mee.';
  return 'Eén appje op de verjaardag — dag en maand, verder niets.';
}

function momentRij(m, zichtbaar){
  const status = m.gedaan
    ? `<span class="ov-ok">✓ ${h(bewijsTekst(m))}</span>`
    : m.open   ? `<span class="ov-open">nog niet gedaan</span>`
    : m.gemist ? `<span class="ov-gemist">gemist</span>`
    : `<span class="meta">${h(CRM.geleden(m.datum))}</span>`;
  const knop = (m.open || m.gemist)
    ? `<button type="button" class="btn ghost sm" data-ovkey="${h(m.key)}">${
        h(KNOP_LBL[m.soort] || 'Vastleggen')}</button>`
    : '';
  return `<div class="ov-r${m.gedaan ? ' af' : m.open ? ' open' : m.gemist ? ' gemist' : ''}${zichtbaar ? '' : ' verborgen'}">
    <span class="ov-r-k">${h(m.kort)}</span>
    <span class="num ov-r-d">${h(CRM.fmtDay(m.datum))}</span>
    <span class="ov-r-t">${h(m.titel)}<em class="ov-r-kan">${h(KANAAL_LBL[m.kanaal] || m.kanaal)}</em></span>
    ${status}${knop}</div>`;
}

function bewijsTekst(m){
  const a = m.bewijs; if(!a) return 'gedaan';
  const lbl = String((CRM.ACT_SOORTEN[a.soort] || {}).lbl || a.soort).toLowerCase();
  return (m.bron === 'vast' ? 'vastgelegd' : lbl) + ' op ' + CRM.fmtDateShort(a.op);
}

/* Knoppen aan het blok hangen. `na` wordt aangeroepen als er iets is
   vastgelegd, zodat de aanroepende module opnieuw kan tekenen. */
function bindKaart(root, c, na){
  if(!root) return;
  const lijst = root.querySelector('#ov_lijst');
  const meer  = root.querySelector('#ov_meer');
  if(meer && lijst) meer.onclick = () => {
    const aan = lijst.classList.toggle('alles');
    meer.textContent = aan ? 'Toon alleen wat speelt' : 'Toon het hele ritme';
  };
  root.querySelectorAll('[data-ovkey]').forEach(b => b.onclick = () =>
    OPV.actie(c, b.dataset.ovkey, na));
}

})();

/* VERZOEK AAN CORE:
   1. `candidates.geboortedatum` staat in supabase/schema.sql maar wordt
      niet gemapt in CRM.rowToCand/candToRow. Dit bestand leest hem daarom
      rechtstreeks uit de ruwe rij in CRM.state.cands. Graag toevoegen:
        rowToCand:  geboortedatum:r.geboortedatum||''
        candToRow:  geboortedatum:c.geboortedatum||null
      Zodra dat er staat werkt alles hier ongewijzigd verder.
   2. `profiles` heeft geen telefoonkolom, terwijl de felicitatiemail
      ondertekend hoort te worden met het nummer van de AM. Nu vult de AM
      het één keer in het mailvenster in en bewaren we het lokaal
      (localStorage 'crm_am_telefoon'), dus per browser. Graag:
        alter table profiles add column if not exists telefoon text default '';
      Dan kan dit bestand CRM.profile.telefoon lezen en vervalt de
      lokale opslag.
   3. HET DASHBOARD MOET OPVOLGING KUNNEN OPENEN DIE NIET AAN EEN KANDIDAAT
      HANGT. js/dashboard.js maakt van elk onbekend opvolgingssoort netjes
      één regel (de tak `items.filter(i => !['nazorg',…].includes(i.soort))`),
      maar geeft `opvActie` daar niet door, en de klikafhandeling doet
      `CRM.kandidaat(id)` — een klantronde heeft geen kandidaat-id. Graag:
        a) in opvolgingBlokken() en in bouwWeek() `opvActie:i.key` meegeven
           voor items met een eigen venster (of simpelweg altijd);
        b) in de klikafhandeling eerst `CRM.opvolging.venster(key)` proberen
           en pas daarna de kandidaat opzoeken:
             if(CRM.opvolging.venster(key, () => CRM.render())) return;
             const k = CRM.kandidaat(id); if(k) return CRM.opvolging.actie(…);
      Zolang dat er niet is, vangt dit bestand de klik zelf op via een
      capture-listener op document die de eigen regel herkent aan de sleutel
      in `data-ses` (zie het blok bij ritme 6). Die listener mag weg zodra
      a) en b) er staan; er verandert dan niets aan wat de gebruiker ziet.
   4. VERJAARDAGEN VAN CONTACTPERSONEN. js/klanten.js heeft
      `CRM.contactVerjaardagen(datum, dagen)` maar meldt zich niet aan bij
      `CRM.opvolging.registreerBron(fn)`. Daardoor staan die verjaardagen
      nergens op het dashboard. Eén regel in js/klanten.js volstaat.
   5. FEESTDAGEN (alleen als Tjeerd erom vraagt). De vrijdagronde slaat
      feestdagen bewust niet over, omdat de app geen feestdagenkalender kent.
      Komt die wens er, dan hoort hij als één gedeelde helper in core —
      bijvoorbeeld `CRM.werkdag(iso)` — en niet als een tweede lijstje in
      een module. Dit bestand kan hem dan meteen gebruiken.
   6b. GEBOORTEDATUM — punt 1 hierboven is inmiddels ingewilligd
      (js/core.js, CRM.rowToCand regel 407). Dit bestand leest hem sinds
      31 juli 2026 rechtstreeks van de kandidaat; de omweg langs de ruwe
      rij in CRM.state.cands is weg. Punt 1 mag geschrapt worden.
   7. CRM.kandidaten() HEEFT GEEN CACHE (js/data.js:145):
      `CRM.state.cands.map(CRM.rowToCand)` bouwt bij elke aanroep duizend
      objecten opnieuw op. Het dashboard roept hem 112× per hertekening
      aan — 112.000 objecten voor gegevens die niet veranderd zijn. Dit
      bestand vangt dat binnen de vrijdagronde zelf op (rondeIndex), maar
      dat lost het alleen hier op. Voorstel voor js/data.js:
        let _kc = null, _kcStempel = '';
        const kcStempel = () => CRM.state.cands.length + '|' + CRM._dataVersie;
        CRM.kandidaten = () => {
          const s = kcStempel();
          if(_kc && _kcStempel === s) return _kc;
          _kc = CRM.state.cands.map(CRM.rowToCand); _kcStempel = s;
          return _kc;
        };
      Een lengte alleen is niet genoeg: een fasewissel verandert een veld,
      niet het aantal. Er is dus één teller nodig die overal wordt
      opgehoogd waar CRM.state.cands wordt gewijzigd (CRM._dataVersie++,
      of een CRM.raakteData()-helper in core). Zonder die teller liever
      géén cache — een lijst die blijft hangen na een fasewissel is erger
      dan een trage lijst.
   8. CRM.fmtDate / fmtDateShort / fmtDay / euro / pct (js/core.js:75-114)
      maken bij ÉLKE aanroep een nieuwe Intl-formatter, want
      `toLocaleDateString('nl-NL', {...})` bouwt er intern eentje op.
      Gemeten: 10.000× fmtDate = 301 ms, met één gedeelde formatter 6 ms.
      Voorstel (drie regels, ongewijzigde uitkomst):
        const FMT_DATE  = new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric'});
        const FMT_KORT  = new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'});
        const FMT_DAG   = new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short'});
      en in de helpers `FMT_DATE.format(d)` in plaats van
      `d.toLocaleDateString(...)`. Idem voor CRM.euro met één
      Intl.NumberFormat per aantal decimalen. Dit bestand roept fmtDate,
      fmtDateShort en fmtDay honderden keren per hertekening aan; het is
      vijftig keer winst voor een handvol regels in core.
   9. js/opvolging.js moet in index.html geladen worden NA js/data.js en
      js/outlook.js en VÓÓR js/dashboard.js, js/kandidaten.js, js/pijplijn.js
      en js/performance.js — net als js/fee.js. Alle gebruikers zijn
      defensief geschreven (`if(!CRM.opvolging) …`), dus zonder die regel
      breekt er niets; er staat dan alleen geen opvolging op het scherm. */
