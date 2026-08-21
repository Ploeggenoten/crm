/* ═══════════════════════════════════════════════════════════════
   PLOEGGENOTEN CRM — FEEST
   Confetti en een bericht op élk scherm zodra er een kandidaat
   getekend heeft. Geen menu-item: dit is een bibliotheek, net als
   js/fee.js en js/opvolging.js.

   Waarom dit bestaat: een plaatsing is waar het bedrijf om draait en
   gebeurt zo'n dertig keer per jaar. Dat is zeldzaam genoeg om er iets
   van te maken, en zeldzaam genoeg dat het niet gaat vervelen. Een
   collega die het ziet gebeuren moet meteen weten wie hij moet
   feliciteren — daarom staat de naam van de recruiter erbij.

   ÉÉN INGANG:
     CRM.feest.getekend({id, kandidaat, klant, functie, door})
   Die viert het lokaal én stuurt het rond. Alles is optioneel; met een
   leeg object krijg je nog steeds een net bericht.

   ─── Op élk scherm, en blijven staan ────────────────────────────
   De canvas en de berichtenlaag hangen aan document.body, niet in
   #viewmount. Dat is niet toevallig: CRM.render() gooit #viewmount bij
   elke navigatie leeg, dus alles wat daarbinnen staat verdwijnt zodra
   iemand naar een andere module klikt. In de schil overleeft het feest
   een modulewissel, een herteken-beurt en een geopende modal — het
   hoort bij de app, niet bij het scherm waar je toevallig in zit.

   Het BERICHT heeft geen tijdslimiet. Het blijft staan tot iemand het
   wegklikt (knop, klik op de kaart, of Escape), want dertig keer per
   jaar mag je vragen dat het gezien wordt. De CONFETTI regent wél uit:
   na ruim vijf seconden is de lucht leeg, wordt de canvas uit de
   pagina gehaald en stopt de animatielus. Een lus laten draaien voor
   deeltjes die niemand meer ziet kost de hele dag rekenkracht.

   ─── Wie later inlogt ziet het óók (de inhaalslag) ──────────────
   Broadcast bereikt alleen wie op dát moment de app open heeft. Dat is
   te weinig: wie 's middags begint moet de plaatsing van die ochtend
   nog zien. Daarvoor is GEEN tabel nodig en GEEN schemawijziging.

   Een plaatsing staat namelijk al ergens: in `candidates`, als fase in
   CRM.PLACED plus een datum in `geplaatstOp`. Bij het opstarten kijkt
   deze module dus gewoon in CRM.state welke recente plaatsingen deze
   browser nog niet heeft weggeklikt, en toont die alsnog. Dat lost
   meteen iets op wat de broadcast niet kon: een gemiste uitzending
   (verbinding weg, tabblad dicht, laptop toe) maakte een plaatsing
   voorgoed onzichtbaar. Nu niet meer — de gebeurtenis is niet langer
   de enige bron, de gegevens zelf zijn dat.

   Waarom geen eigen tabel: die zou hetzelfde feit een tweede keer
   opslaan (een rij in crm_feest naast de plaatsing in candidates), en
   twee bronnen voor één waarheid lopen altijd uit elkaar. Bovendien
   kost het een migratie, RLS-beleid en een extra recht, allemaal voor
   iets wat we al weten.

   Drie keuzes daarbinnen, met reden:
     · VENSTER: drie dagen. `geplaatstOp` is een DATUM zonder tijd, dus
       uren zijn er niet; het moet in dagen. Drie dagen is precies het
       gat in een Nederlandse werkweek: wie vrijdagmiddag tekent, wordt
       maandagochtend nog gevierd. Langer niet — na twee weken vakantie
       hoor je niet met tien knallen begroet te worden, en confetti over
       iets wat allang in de weekstart is besproken leest als een storing.
     · MEERDERE GEMIST: stapelen, niet samenvatten. De kern van het
       bericht is wíé je moet feliciteren; samenvatten tot "3
       plaatsingen" gooit precies dat weg. Het stapelmechanisme bestaat
       al (vanaf drie kaarten compact), en met dertig plaatsingen per
       jaar en een venster van drie dagen zijn er in de praktijk hooguit
       twee. Eén knal en één Peter voor de hele stapel, geen drie.
     · WEGGEKLIKT BLIJFT WEGGEKLIKT, ook na herladen. Dat staat per
       browser in localStorage — alleen het kandidaat-id en de datum,
       geen persoonsgegevens. Zolang je niet wegklikt komt het bericht
       na een herlaad terug: het is dan nog steeds niet gezien.

   ─── Keuze: broadcast, geen tabel ───────────────────────────────
   Supabase Realtime kan twee dingen, en sinds 21 aug 2026 gebruiken we
   ze allebei. De hoofdroute is een eigen broadcast-kanaal ('crm-feest'):
   een gebeurtenis is dan precies wat hij is — iets wat nu gebeurt — met
   alle tekst erin (tellers uitgerekend door de afzender, "binnengehaald
   door" erbij). Maar broadcast bereikt alleen wie op dat moment een
   levende websocket heeft, en in de praktijk bleef hij weleens stil:
   collega's zagen het feest pas na een refresh. Daarom luistert dit
   kanaal er nu óók naar de rijwijziging op `candidates` zelf (die staat
   sinds 14 aug in de realtime-publicatie — daardoor beweegt het bord
   bij collega's al live mee, dus die route komt aantoonbaar aan). De
   rij kent de doener niet, maar wél de AM (`rec`) — en dat is toch al
   de naam die de eer krijgt. Dubbel of bij het opstarten vieren kan
   niet: de drie regels hieronder gelden voor beide routes, en de
   pg-route telt bovendien alleen een plaatsing van vandaag.

   ─── Drie regels tegen confetti op het verkeerde moment ─────────
   1. NIET DUBBEL. Elke gebeurtenis krijgt een eigen id. Wie hem zelf
      afvuurt heeft hem al gezien en negeert hem als hij terugkomt.
   2. NIET BIJ HET OPSTARTEN. Elke gebeurtenis draagt een tijdstempel;
      alles ouder dan drie minuten wordt genegeerd. Broadcast bewaart
      niets, dus dit is de tweede grendel op dezelfde deur.
   3. NIET BIJ HET HERSTELLEN VAN EEN FOUT. Sleept iemand per ongeluk
      naar Contract getekend, meteen terug en dan opnieuw, dan is dat
      één plaatsing. Dezelfde kandidaat viert daarom hoogstens eens per
      tien minuten. Tien minuten dekt het wegklikken-en-opnieuw ruim,
      en een tweede échte plaatsing van dezelfde persoon binnen tien
      minuten bestaat niet.

   Werkt de verbinding niet, dan zie je gewoon je eigen confetti. Geen
   foutmelding, geen lege plek — nooit.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;

/* ─── Tijden (ms) ───────────────────────────────────────────────
   Opbouw en afloop in plaats van één klap. Let op het verschil:
   de CONFETTI regent uit en ruimt zichzelf op — deeltjes die de hele
   dag blijven vallen kosten rekenkracht en gaan vervelen. Het BERICHT
   heeft geen tijd: dat blijft staan tot iemand het wegklikt. */
const T = {
  regen:      900,    // zolang blijven er nieuwe deeltjes bijkomen
  confetti:  5200,    // daarna is de lucht leeg en gaat de canvas weg
  kaartIn:     220,   // het bericht komt iets ná de knal op
  /* Wanneer het feest overgaat in de nasleep: het bericht glijdt van het
     midden naar rechtsboven. Ná de confetti (5,2 s) en ná Peter (de
     video duurt 5,04 s plus het uitfaden), zodat het moment af is
     voordat het scherm weer van het werk wordt. */
  rust:      6600
};
const VERS_MS    = 3 * 60 * 1000;    // ouder dan dit = geen feest (regel 2)
const HERHAAL_MS = 10 * 60 * 1000;   // zelfde kandidaat niet nog eens (regel 3)
/* Inhaalslag: hoe ver terug kijken bij het opstarten. Zie de uitleg
   bovenaan — drie dagen dekt het weekend, langer wordt oud nieuws. */
const INHAAL_DAGEN = 3;
const OPSLAG = 'pg_feest_gezien';    // weggeklikte plaatsingen, per browser
const BEWAAR_DAGEN = 21;             // daarna mag het uit de opslag
/* Noodrem, geen ontwerpkeuze: berichten worden nooit weggehaald om
   ruimte te maken (dan zou iemand een plaatsing missen). Bij dertig
   plaatsingen per jaar staan er nooit zes tegelijk open; deze grens
   bestaat alleen zodat een kapotte afzender het scherm niet vol zet. */
const MAX_KAARTEN = 6;

/* ─── Kleuren ───────────────────────────────────────────────────
   De merkkleuren uit css/base.css plus drie feestkleuren, zodat het
   van Ploeggenoten is en niet van een willekeurige website. De
   merkkleuren wegen zwaarder (het getal achter de kleur), anders
   overstemmen de uitschieters het geheel. */
const KLEUREN = [
  ['#c8f135', 5],   // lime
  ['#3d6400', 3],   // olive
  ['#6fa03c', 4],   // olive-l
  ['#d4522a', 3],   // oranje
  ['#a8862d', 2],   // gold
  ['#f4f6ec', 4],   // crème — de papierstrookjes
  ['#f2c14e', 2],   // feestgeel
  ['#7e5aa6', 1]    // paars, hooguit een enkele
];
const KLEURPOT = KLEUREN.flatMap(([kleur, gewicht]) => Array(gewicht).fill(kleur));

/* ─── Staat ─────────────────────────────────────────────────────── */
let canvas = null, ctx = null, laag = null;
let deeltjes = [], wachtrij = [];
let lus = null, startTijd = 0, vorigeTijd = 0, eind = 0, dpr = 1;
let kanaal = null, verbonden = false;
const gezien = new Map();    // gebeurtenis-id -> tijdstip (regel 1)
const recent = new Map();    // kandidaatsleutel -> tijdstip (regel 3)

let peter = null;            // het videovak; bestaat alleen tijdens een feest

/* Alleen voor het meten van de framerate tijdens het bouwen; kost
   niets en maakt "hoeveel deeltjes kan dit hebben" een meting in
   plaats van een gevoel. */
const meting = {frames:0, ms:0, fps:0, deeltjes:0};

/* ═══════════════════════════════════════════════════════════════
   WEGGEKLIKT ONTHOUDEN
   Alleen kandidaat-id's met de datum waarop ze zijn weggeklikt. Geen
   namen, geen klanten — er hoeft niets persoonlijks in de opslag van
   een browser te staan. Alles zit in try/catch: in een privévenster
   gooit localStorage, en dan hoort het feest gewoon door te gaan
   (je ziet een bericht dan alleen vaker dan nodig).
   ═══════════════════════════════════════════════════════════════ */
function gezienLees(){
  try{ const o = JSON.parse(localStorage.getItem(OPSLAG) || '{}'); return (o && typeof o === 'object') ? o : {}; }
  catch(e){ return {}; }
}
function gezienSchrijf(o){ try{ localStorage.setItem(OPSLAG, JSON.stringify(o)); }catch(e){} }
const gezienHeeft = id => !!(id && gezienLees()[String(id)]);
function gezienZet(id){
  if(!id) return;
  const o = gezienLees();
  o[String(id)] = CRM.todayISO();
  /* Meteen opruimen wat ouder is dan de bewaartermijn: zonder dit groeit
     dit lijstje jarenlang door voor kandidaten die allang uit beeld zijn. */
  const grens = dagenTerug(BEWAAR_DAGEN);
  Object.keys(o).forEach(k => { if(String(o[k]) < grens) delete o[k]; });
  gezienSchrijf(o);
}
/* Lokale datum n dagen terug, als YYYY-MM-DD — dezelfde vorm als
   geplaatstOp, zodat een gewone tekstvergelijking klopt. */
function dagenTerug(n){
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toLocaleDateString('sv-SE');
}

/* ═══════════════════════════════════════════════════════════════
   DE TELLERS
   Twee getallen: wat het team deze maand heeft staan, en hoeveel
   daarvan van deze accountmanager zijn.

   WELK GETAL — `getekend`, niet `netto`. CRM.plaatsingenMaand() geeft
   allebei terug, maar netto trekt de stoppers van de maand eraf. Een
   plaatsing vieren en er dan een getal bij zetten dat lager uitvalt
   omdat iemand anders vorige week is gestopt, is geen feest maar een
   correctie. Getekend is bovendien wat hier gevierd wordt: een
   handtekening die is gezet. Voor sturing bestaat het bord al.

   DE NET GEZETTE PLAATSING TELT MEE. Dat is de hele lol van een teller
   die oploopt. bewaarKand() past de rij in CRM.state.cands aan vóórdat
   bewaarFase ons aanroept, dus normaal zit hij er al in — maar we
   controleren het en tellen er zelf één bij als hij ontbreekt. Zo blijft
   dit ook kloppen als de volgorde daar ooit verandert.

   WIE IS DE AM — het veld `rec` op de kandidaat, hetzelfde veld waar
   js/performance.js per persoon op groepeert. Is dat leeg, dan tonen we
   die tweede teller niet; een verkeerd getal is erger dan geen getal. */
function tellers(id, maand, am){
  const mk = maand || CRM.todayISO().slice(0,7);
  let getekend = [];
  try{ getekend = (CRM.plaatsingenMaand(mk) || {}).getekend || []; }catch(e){ getekend = []; }
  const erbij = id && !getekend.some(c => String(c.id) === String(id)) ? 1 : 0;
  const naam = String(am || '').trim();
  const vanAM = naam
    ? getekend.filter(c => String(c.rec || '').trim() === naam).length +
      (erbij && String((CRM.kandidaat(id) || {}).rec || '').trim() === naam ? 1 : 0)
    : null;
  return {totaal: getekend.length + erbij, amTotaal: vanAM, maand: mk};
}

const MAANDEN = ['januari','februari','maart','april','mei','juni','juli',
                 'augustus','september','oktober','november','december'];
/* "deze maand" klopt alleen als het ook echt deze maand is. Wie op
   1 augustus de plaatsing van 31 juli inhaalt, hoort "in juli" te zien
   staan bij een getal dat over juli gaat. */
function maandLabel(mk){
  const nu = CRM.todayISO().slice(0,7);
  if(!mk || mk === nu) return 'deze maand';
  const m = /^(\d{4})-(\d{2})$/.exec(mk);
  return m ? 'in ' + MAANDEN[+m[2] - 1] : 'die maand';
}

/* Alleen de roepnaam onder de tweede teller — "waarvan door Tjeerd van
   Elk" past niet en leest niet. */
const voornaam = n => String(n || '').trim().split(/\s+/)[0] || '';

/* ═══════════════════════════════════════════════════════════════
   DE FEE
   Tjeerd wil het bedrag bij de plaatsing zien, en het hoeft niet
   afgeschermd te worden: iedereen die het feest ziet mag de fee zien.

   Het wordt berekend door de AFZENDER en meegestuurd in de uitzending.
   Dat is hier geen luiheid maar noodzaak: de fee-percentages staan in
   `crm_afspraken`, en die tabel is in de database afgeschermd op het
   e-mailadres van Tjeerd (supabase/schema.sql blok 8b,
   `afspraken_owner_only`). De browser van een collega krijgt daar nul
   rijen terug, dus CRM.fee.voorKlant() geeft null en bereken() komt op
   `fee: null` uit. Bij de ontvanger uitrekenen zou dus bij iedereen
   behalve Tjeerd een leeg bedrag opleveren.

   Gevolg, en dat hoort Tjeerd te weten: het team ziet de fee ALLEEN als
   Tjeerd zelf de plaatsing afrondt. Sleept een AM de kaart naar Contract
   getekend, dan kan diens browser het bedrag niet berekenen en gaat er
   niets mee — dan viert iedereen hetzelfde feest zonder bedrag.

   Er gaat bewust alléén het bedrag mee, niet het percentage en niet de
   grondslag. Uit die twee is namelijk het jaarsalaris van de kandidaat
   terug te rekenen, en dat is iets anders dan onze fee; dat hoeft niet
   over een kanaal te gaan waar het hele team op zit.

   Geen bedrag? Dan geen regel. Geen "€ 0", geen "€ —", geen lege plek:
   dat komt in het echt regelmatig voor (nog geen afspraak vastgelegd,
   of het maandloon staat nog niet op de kaart) en een feest met een nul
   erin is erger dan een feest zonder bedrag. */
function feeVan(id){
  if(!id || !CRM.fee || !CRM.fee.bereken || !CRM.fee.voorKlant) return null;
  const c = CRM.kandidaat(id);
  if(!c) return null;
  try{
    const afspraak = CRM.fee.voorKlant(c.klant, c.geplaatstOp);
    const r = CRM.fee.bereken(c, afspraak);   // bereken() zoekt de afspraak niet zelf op
    return (r && typeof r.fee === 'number' && isFinite(r.fee) && r.fee > 0) ? r.fee : null;
  }catch(e){ return null; }
}

function feeRegel(ev){
  const bedrag = Number(ev && ev.fee);
  if(!isFinite(bedrag) || bedrag <= 0) return '';
  return '<div class="feest-fee"><span>Fee van deze plaatsing</span>' +
         '<b class="num">' + h(CRM.euro(bedrag)) + '</b></div>';
}

const rustig = () => {
  try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch(e){ return false; }
};

/* Hoeveel deeltjes. Geschaald op schermoppervlak, want op het
   teamscherm (±2000px) valt dezelfde hoeveelheid weg en op een
   telefoon wordt het een muur. Op 2000×1150 komt dat uit op ruim 200.

   Die 200 is gemeten, niet gegokt: op het teamscherm bleef de lus bij
   520 deeltjes tegelijk nog steeds op de volle beeldschermfrequentie
   (100 fps, gemeten met CRM.feest._meting()). Er is dus ruim een
   factor twee lucht. Het getal staat op wat er goed uitziet, niet op
   wat er nog nét bij kan — meer strookjes maken het niet feestelijker,
   alleen drukker. */
function aantalDeeltjes(){
  const opp = window.innerWidth * window.innerHeight;
  return Math.max(60, Math.min(220, Math.round(opp / 11000)));
}

/* ═══════════════════════════════════════════════════════════════
   DE CONFETTI
   ═══════════════════════════════════════════════════════════════ */

const rnd  = (a, b) => a + Math.random() * (b - a);
const kies = arr => arr[Math.floor(Math.random() * arr.length)];

/* Eén deeltje. Drie soorten, want deeltjes die allemaal even snel
   recht naar beneden vallen zien er goedkoop uit:
     strook — papiersnipper, tolt en klapt om
     lint   — smal en lang, valt traag, zwiept ver heen en weer
     stip   — rond, valt het snelst, geeft diepte
   `flip` is de truc die het echt maakt: de breedte krimpt met de
   cosinus van de tol, alsof je een plat strookje ziet omdraaien. */
function maakDeeltje(x, y, vx, vy){
  const soort = Math.random() < .18 ? 'stip' : (Math.random() < .3 ? 'lint' : 'strook');
  const traag = soort === 'lint' ? .62 : soort === 'stip' ? 1.25 : 1;
  return {
    soort,
    x, y,
    vx, vy,
    zwaarte: (soort === 'stip' ? .34 : .22) * rnd(.85, 1.15),
    rem:     soort === 'lint' ? .972 : .982,
    val:     rnd(3.0, 5.5) * traag,          // eindsnelheid, per deeltje anders
    b:       soort === 'lint' ? rnd(2.5, 4) : soort === 'stip' ? rnd(2.6, 4.6) : rnd(6, 10),
    hg:      soort === 'lint' ? rnd(14, 22) : rnd(6, 11),
    tol:     rnd(0, Math.PI * 2),
    tolv:    rnd(-.22, .22) * (soort === 'lint' ? .5 : 1),
    flip:    rnd(0, Math.PI * 2),
    flipv:   rnd(.06, .17),
    /* Zijwaartse drift: een fase die doorloopt (zwFase), hoe snel hij
       doorloopt (zwSnel) en hoe ver hij uitslaat (zwWijd). Linten
       zwiepen het verst — dat is wat een lint een lint maakt. */
    zwFase:  rnd(0, Math.PI * 2),
    zwSnel:  rnd(.02, .05),
    zwWijd:  soort === 'lint' ? rnd(.9, 1.9) : soort === 'stip' ? rnd(.1, .35) : rnd(.25, .8),
    kleur:   kies(KLEURPOT)
  };
}

/* De knal. Twee kanonnen onderin plus een regen van boven: de knal
   geeft het moment, de regen geeft het uitregenen.

   `op` is het moment waarop een deeltje in beeld komt, gemeten op
   dezelfde klok als `verstreken` in frame(). De wachtrij wordt hier
   één keer op tijd gesorteerd en daarna alleen nog vooraan leeggehaald.
   Bij een tweede plaatsing komt er een set bíj (met `vanaf` verschoven
   naar nu) — de eerste wordt niet weggegooid. */
function vulWachtrij(vanaf){
  const w = window.innerWidth, hgt = window.innerHeight;
  const totaal = aantalDeeltjes();
  const uitKanon = Math.round(totaal * .42);

  for(let i = 0; i < uitKanon; i++){
    const links = i % 2 === 0;
    const hoek = (links ? rnd(-1.35, -0.55) : rnd(-2.59, -1.79));   // omhoog, naar binnen
    const kracht = rnd(11, 22);
    wachtrij.push({
      op: vanaf + rnd(0, 90),
      d: maakDeeltje(
        links ? rnd(-10, w * .12) : rnd(w * .88, w + 10),
        hgt * rnd(.96, 1.04),
        Math.cos(hoek) * kracht,
        Math.sin(hoek) * kracht
      )
    });
  }
  for(let i = uitKanon; i < totaal; i++){
    wachtrij.push({
      op: vanaf + rnd(0, T.regen),
      d: maakDeeltje(rnd(-20, w + 20), rnd(-90, -10), rnd(-1.4, 1.4), rnd(1, 4))
    });
  }
  wachtrij.sort((a, b) => a.op - b.op);
}

function zorgCanvas(){
  if(canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'feest-canvas';
  canvas.setAttribute('aria-hidden', 'true');   // pure decoratie, het bericht is de inhoud
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  maatCanvas();
  window.addEventListener('resize', maatCanvas);
}

/* devicePixelRatio afgekapt op 2: op een retina-teamscherm van 2000px
   zou 3 een canvas van 6000px breed geven die elk frame gewist moet
   worden. Confetti heeft die scherpte niet nodig. */
function maatCanvas(){
  if(!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.round(window.innerWidth  * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
}

function ruimCanvasOp(){
  window.removeEventListener('resize', maatCanvas);
  if(canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  canvas = null; ctx = null; deeltjes = []; wachtrij = [];
  if(lus){ cancelAnimationFrame(lus); lus = null; }
}

/* Tabblad naar de achtergrond: requestAnimationFrame staat dan stil en
   de canvas zou als leeg vlak blijven hangen tot iemand terugkomt. Hier
   meteen opruimen; het bericht blijft staan en heeft zijn eigen timer,
   dus wie terugkomt ziet de plaatsing en geen halve animatie. */
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden' && canvas) ruimCanvasOp();
});

/* Twee plaatsingen kort na elkaar mogen elkaar niet slopen. Daarom
   loopt er maar één lus en één klok: een tweede knal schuift zijn
   deeltjes in dezelfde wachtrij en verlengt het einde. De eerste knal
   loopt gewoon door. */
function startConfetti(){
  if(rustig()) return;              // dan alleen het bericht
  zorgCanvas();
  const nu = performance.now();
  if(!lus){ startTijd = nu; vorigeTijd = nu; eind = 0; meting.frames = 0; meting.ms = 0; }
  const vanaf = nu - startTijd;
  vulWachtrij(vanaf);
  eind = Math.max(eind, vanaf + T.confetti);
  if(!lus) lus = requestAnimationFrame(frame);
}

function frame(nu){
  const stap = nu - vorigeTijd;
  vorigeTijd = nu;

  /* Achtergrondtabblad (of een zware jank): requestAnimationFrame heeft
     stilgestaan. Zonder deze uitgang zou alles wat in de wachtrij stond
     bij terugkomst in één keer losbarsten — een halve animatie die een
     minuut later alsnog knalt. Dan liever meteen ophouden; het bericht
     blijft staan, en dat is waar het om gaat. */
  if(stap > 400){ ruimCanvasOp(); return; }

  const verstreken = nu - startTijd;
  const dt = Math.min(stap, 34) / 16.6667;    // in "frames", afgetopt

  /* Uit de wachtrij halen wat aan de beurt is. De rij staat al op tijd
     gesorteerd, dus alleen vooraan kijken volstaat. */
  while(wachtrij.length && wachtrij[0].op <= verstreken) deeltjes.push(wachtrij.shift().d);

  const w = window.innerWidth, hgt = window.innerHeight;
  const doorzicht = Math.max(0, Math.min(1, (eind - verstreken) / 700));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);

  for(let i = deeltjes.length - 1; i >= 0; i--){
    const p = deeltjes[i];
    p.vy = (p.vy + p.zwaarte * dt) * Math.pow(p.rem, dt);
    if(p.vy > p.val) p.vy += (p.val - p.vy) * .06 * dt;    // naar de eindsnelheid toe
    p.vx *= Math.pow(p.rem, dt);
    p.zwFase += p.zwSnel * dt;
    p.x += (p.vx + Math.sin(p.zwFase) * p.zwWijd) * dt;
    p.y += p.vy * dt;
    p.tol  += p.tolv * dt;
    p.flip += p.flipv * dt;

    if(p.y > hgt + 70 || p.x < -120 || p.x > w + 120){ deeltjes.splice(i, 1); continue; }

    ctx.save();
    ctx.globalAlpha = doorzicht;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.tol);
    ctx.fillStyle = p.kleur;
    if(p.soort === 'stip'){
      ctx.beginPath(); ctx.arc(0, 0, p.b / 2, 0, Math.PI * 2); ctx.fill();
    }else{
      /* Nooit helemaal plat: een strookje dat exact op zijn kant staat
         verdwijnt een frame lang, en dat flikkert. */
      const plat = Math.max(.18, Math.abs(Math.cos(p.flip)));
      ctx.scale(plat, 1);
      ctx.fillRect(-p.b / 2, -p.hg / 2, p.b, p.hg);
    }
    ctx.restore();
  }

  meting.frames++; meting.ms += stap;
  if(meting.ms >= 500){
    meting.fps = Math.round(meting.frames / (meting.ms / 1000));
    meting.deeltjes = deeltjes.length;
    meting.frames = 0; meting.ms = 0;
  }

  if(verstreken > eind || (!deeltjes.length && !wachtrij.length)){ ruimCanvasOp(); return; }
  lus = requestAnimationFrame(frame);
}

/* ═══════════════════════════════════════════════════════════════
   PETER PLOEG MET HET CONFETTIKANON
   Een filmpje van 4,5 MB. Dat mag NIET meelopen met het opstarten van
   de app — dat is meer dan alle javascript en css bij elkaar, elke dag
   opnieuw, voor iets wat dertig keer per jaar gebeurt. Het <video>
   bestaat daarom pas op het moment dat er gevierd wordt: geen element
   in de pagina, geen src, `preload="none"`, dus geen byte over de lijn
   tot dat moment.

   DE ACHTERGROND ER ECHT UIT — de video heeft geen alfakanaal maar een
   gebroken witte achtergrond. De eerste poging was `mix-blend-mode:
   multiply`; dat lijkt te werken op een lichte pagina, maar het kleurt
   Peter mee met alles wat eronder ligt en de rechthoek blijft zichtbaar
   als een lichte vlek. Dat leest als een sticker.

   Nu wordt de achtergrond er per beeld uit gesleuteld:
     1. verborgen <video> → drawImage naar een canvas op werkformaat;
     2. getImageData, en de alpha op 0 waar de pixel dicht bij de
        achtergrondkleur ligt;
     3. putImageData terug. De canvas is wat je ziet.

   Drie keuzes die het verschil maken tussen een uitknipsel en iets dat
   in de app hoort:

   · DE ACHTERGRONDKLEUR WORDT BEMONSTERD, niet ingetypt. Vier hoekblokjes
     uit het EERSTE beeld, en daarvan de mediaan. Gemeten waarom het het
     eerste beeld moet zijn: halverwege de video vliegt de confetti door
     het kader en dan meten de hoeken (230,221,205) in plaats van
     (236,232,223). Wie elk beeld opnieuw meet, verschuift zijn eigen
     sleutel. De mediaan vangt bovendien één vervuilde hoek op.

   · GEEN HARDE DREMPEL maar een zachte overgang: onder GRENS_UIT
     helemaal doorzichtig, boven GRENS_AAN helemaal dekkend, daartussen
     oplopend. Een harde drempel geeft een witte rafelrand langs zijn
     haarpunten, en dán zie je pas echt dat er iets uitgeknipt is.

   · VLAKVULLING VANAF DE RAND, geen drempel over het hele beeld. Dit is
     de belangrijkste. Peter houdt een ZILVERKLEURIG kanon vast en hij
     lacht met witte tanden; die liggen qua kleur vlak bij de
     achtergrond. Een drempel over het hele beeld slaat daar gaten in.
     Door alleen weg te halen wat via de rand bereikbaar is, blijft alles
     wat ómsloten wordt door Peter zelf gewoon staan. Gecontroleerd op
     vier echte beelden uit de video: kanon heel, tanden heel,
     haarpunten scherp, en de studioschaduw onder zijn schoenen weg.
   ═══════════════════════════════════════════════════════════════ */
/* Werkformaat van de sleutel-canvas. 828×1108 (het bronformaat) per beeld
   doorrekenen is bijna een miljoen pixels en dat haalt geen enkele laptop;
   op dit formaat is het gemeten 5 ms per beeld, en het is ongeveer de
   grootte waarop Peter ook getoond wordt. */
const KW = 360, KH = 482;
const GRENS_UIT = 12, GRENS_AAN = 95;     // gemeten, zie hierboven

function toonPeter(){
  if(peter || rustig()) return;      // één Peter per feest; nooit bij minder beweging
  /* Staat het tabblad op de achtergrond, dan slaan we Peter helemaal
     over. Browsers pauzeren een beeld-zonder-geluid dat niet zichtbaar
     is toch (dat is precies de AbortError "video-only background media
     was paused to save power"), dus het zou 4,5 MB ophalen voor iets
     wat niemand ziet. Het bericht en de cijfers blijven staan; die zijn
     er nog als je terugkomt. */
  if(document.visibilityState === 'hidden') return;

  const vak = document.createElement('div');
  vak.className = 'feest-peter';
  vak.setAttribute('aria-hidden', 'true');   // decoratie; het bericht is de inhoud
  const doek = document.createElement('canvas');
  doek.width = KW; doek.height = KH;
  vak.appendChild(doek);
  peter = vak;

  const ctx2 = doek.getContext('2d', {willReadFrequently:true});
  /* 'low' scheelt gemeten bijna 2 ms per beeld bij het verkleinen van
     828 px naar 360 px, en het verschil is op een bewegend figuur niet
     te zien. */
  ctx2.imageSmoothingQuality = 'low';

  const gezien = new Uint8Array(KW * KH);
  const stapel = new Int32Array(KW * KH);
  let bg = null;                    // de bemonsterde achtergrondkleur
  let kosten = 0, sla = false;      // eenvoudige rem op trage machines

  /* Vier hoekblokjes, per hoek het gemiddelde, daarvan de mediaan. */
  function meetAchtergrond(d){
    const blok = (ox, oy) => {
      let r = 0, g = 0, b = 0;
      for(let y = 0; y < 10; y++) for(let x = 0; x < 10; x++){
        const i = (((oy + y) * KW) + ox + x) << 2; r += d[i]; g += d[i+1]; b += d[i+2];
      }
      return [r/100, g/100, b/100];
    };
    const h4 = [blok(0,0), blok(KW-10,0), blok(0,KH-10), blok(KW-10,KH-10)];
    return [0,1,2].map(k => { const s = h4.map(v => v[k]).sort((a,b) => a-b); return (s[1] + s[2]) / 2; });
  }

  /* Eén beeld sleutelen. `bron` is de video of, als terugval, de poster. */
  function sleutel(bron){
    const t0 = performance.now();
    ctx2.drawImage(bron, 0, 0, KW, KH);
    const beeld = ctx2.getImageData(0, 0, KW, KH), d = beeld.data;
    if(!bg) bg = meetAchtergrond(d);
    const [br, bgr, bb] = bg;
    const uit2 = GRENS_UIT * GRENS_UIT, aan2 = GRENS_AAN * GRENS_AAN;
    const schaal = 255 / (GRENS_AAN - GRENS_UIT);
    gezien.fill(0);
    let sp = 0;
    /* Zaadjes: de hele rand van het beeld. */
    for(let x = 0; x < KW; x++){ stapel[sp++] = x; stapel[sp++] = (KH-1)*KW + x; }
    for(let y = 1; y < KH-1; y++){ stapel[sp++] = y*KW; stapel[sp++] = y*KW + KW-1; }
    while(sp > 0){
      const p = stapel[--sp];
      if(gezien[p]) continue;
      const i = p << 2;
      const dr = d[i] - br, dg = d[i+1] - bgr, db = d[i+2] - bb;
      const q = dr*dr + dg*dg + db*db;
      if(q >= aan2) continue;                 // hier houdt de achtergrond op
      gezien[p] = 1;
      d[i+3] = q <= uit2 ? 0 : ((Math.sqrt(q) - GRENS_UIT) * schaal) | 0;
      const px = p % KW, py = (p / KW) | 0;
      if(px > 0)      stapel[sp++] = p - 1;
      if(px < KW - 1) stapel[sp++] = p + 1;
      if(py > 0)      stapel[sp++] = p - KW;
      if(py < KH - 1) stapel[sp++] = p + KW;
      if(sp > stapel.length - 6) sp = stapel.length - 7;   // kan niet, maar dan wel veilig
    }
    ctx2.putImageData(beeld, 0, 0);
    kosten = kosten ? kosten * .7 + (performance.now() - t0) * .3 : performance.now() - t0;
  }

  const video = document.createElement('video');
  video.muted = true;                 // geluid uit: iemand kan in gesprek zijn
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  /* De video zelf komt nooit in beeld; alleen de gesleutelde canvas. Hij
     moet wél in de pagina staan, anders weigeren browsers hem af te
     spelen. */
  video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
  video.src = 'assets/peter-confetti.mp4';
  vak.appendChild(video);

  /* Werkt de video niet (codec, netwerk, streng beleid), dan één keer de
     poster door dezelfde sleutel halen. Nooit een leeg vak, nooit een
     foutmelding — en ook in de terugval geen witte rechthoek. */
  let naarPosterGedaan = false;
  const naarPoster = () => {
    if(naarPosterGedaan || !vak.parentNode) return;
    naarPosterGedaan = true;
    const img = new Image();
    img.onload = () => { if(vak.parentNode){ bg = null; sleutel(img); } };
    img.src = 'assets/peter-confetti-poster.png';
    setTimeout(wegPeter, 4200);
  };
  video.onerror = naarPoster;
  video.onended = () => setTimeout(wegPeter, 400);   // even blijven staan, dan weg

  /* Per gedecodeerd videobeeld sleutelen — niet per schermbeeld. De video
     loopt op ~25 beelden per seconde en het scherm op 60 tot 120; zonder
     dit zou hetzelfde beeld drie keer opnieuw doorgerekend worden.
     `sla` slaat om de beurt een beeld over zodra het rekenen te lang
     duurt, zodat een tragere machine de confetti niet laat haperen. */
  const perBeeld = () => {
    if(!vak.parentNode) return;
    if(kosten > 7 && (sla = !sla)){ volgende(); return; }
    sleutel(video);
    volgende();
  };
  const volgende = () => {
    if(!vak.parentNode) return;
    if(video.requestVideoFrameCallback) vak._f = video.requestVideoFrameCallback(perBeeld);
    else vak._f = requestAnimationFrame(perBeeld);
  };
  video.onloadeddata = volgende;

  document.body.appendChild(vak);
  /* Met een timer en niet met requestAnimationFrame: rAF staat stil in
     een achtergrondtabblad, en dan zou Peter op doorzichtig blijven
     staan tot hij zichzelf weer opruimt. */
  setTimeout(() => vak.classList.add('in'), 20);

  /* play() afwijzen betekent niet meteen "kapot". De afwijzing komt ook
     als de browser het beeld even pauzeert omdat het net niet zichtbaar
     is. Daarom niet op de afwijzing zelf overstappen op de poster, maar
     een tel later kijken of er écht niets loopt. */
  const spelen = video.play();
  if(spelen && typeof spelen.catch === 'function') spelen.catch(() => {});
  vak._c = setTimeout(() => {
    if(!vak.parentNode) return;
    if(video.error || (video.paused && !video.currentTime)) naarPoster();
  }, 1300);

  /* Noodrem: gaat er iets mis waar geen `error` of `ended` op volgt
     (video die blijft hangen), dan gaat Peter na acht seconden alsnog
     weg in plaats van te blijven staan. */
  vak._t = setTimeout(wegPeter, 8000);
}

function wegPeter(){
  if(!peter) return;
  const vak = peter; peter = null;
  clearTimeout(vak._t); clearTimeout(vak._c);
  const video = vak.querySelector('video');
  if(vak._f && video && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vak._f);
  else if(vak._f) cancelAnimationFrame(vak._f);
  if(video){ try{ video.pause(); video.removeAttribute('src'); video.load(); }catch(e){} }
  vak.classList.remove('in');
  setTimeout(() => { if(vak.parentNode) vak.parentNode.removeChild(vak); }, 500);
}

/* ═══════════════════════════════════════════════════════════════
   HET BERICHT
   ═══════════════════════════════════════════════════════════════ */

/* De onthulling: het getal telt op naar zijn eindwaarde.
   De duur schaalt mee met de afstand — een teller die op 1 uitkomt is
   in een kwart seconde klaar, want daar hoort geen tromgeroffel bij;
   een 12 mag er iets langer over doen. Bij `prefers-reduced-motion`
   staat het getal er meteen. */
function telOp(el, doel, wacht){
  const eindWaarde = Math.max(0, Math.round(Number(doel) || 0));
  if(rustig() || eindWaarde === 0){ el.textContent = eindWaarde; return; }
  el.textContent = '0';
  const duur = Math.max(260, Math.min(1100, eindWaarde * 90));
  const begin = performance.now() + (wacht || 0);
  const stap = nu => {
    const p = Math.max(0, Math.min(1, (nu - begin) / duur));
    el.textContent = Math.round(eindWaarde * (1 - Math.pow(1 - p, 3)));
    if(p < 1) requestAnimationFrame(stap);
  };
  requestAnimationFrame(stap);
  /* requestAnimationFrame staat stil in een achtergrondtabblad. Zonder
     dit vangnet zou de teller op een half getal blijven hangen voor wie
     precies op dat moment wegklikt naar een ander tabblad. */
  setTimeout(() => { el.textContent = eindWaarde; }, (wacht || 0) + duur + 500);
}

/* De laag met het bericht. Die blijft leeg in de pagina staan zodra de
   module geladen is, en wordt niet weer weggehaald.

   Dat is met opzet: een aria-live-gebied dat pas ontstaat op hetzelfde
   moment als de inhoud erin, wordt door veel voorleessoftware niet
   voorgelezen — het gebied moet er al zijn vóór er iets in verschijnt.
   Het kost een lege div zonder achtergrond die geen klik opvangt, en
   het is het verschil tussen een bericht dat bestaat en een bericht
   dat alleen te zien is. */
function zorgLaag(){
  if(laag) return laag;
  laag = document.createElement('div');
  laag.className = 'feest-laag';
  laag.setAttribute('role', 'status');
  laag.setAttribute('aria-live', 'polite');
  laag.setAttribute('aria-atomic', 'true');
  document.body.appendChild(laag);
  /* Bij het draaien van een telefoon of het versmallen van een venster
     verandert de verhouding tussen kaart en Peter; opnieuw meten. */
  window.addEventListener('resize', () => { if(laag && laag.children.length) meetRuimte(laag); });
  return laag;
}
if(document.body) zorgLaag();
else document.addEventListener('DOMContentLoaded', zorgLaag);

/* De zin over waar en als wat. Alle velden zijn optioneel, dus alles
   wordt overgeslagen wat er niet is — nooit "bij — als —". */
function bijZin(ev){
  const stukken = [];
  if(ev.klant)   stukken.push('bij <b>'   + h(ev.klant)   + '</b>');
  if(ev.functie) stukken.push('als <b>'   + h(ev.functie) + '</b>');
  if(!stukken.length) return 'Er is getekend. Een nieuwe plaatsing staat op het bord.';
  return 'Tekende ' + stukken.join(' ') + '.';
}

/* Een tweede plaatsing terwijl de eerste nog staat: STAPELEN, niet
   vervangen en niet samenvoegen.
     · vervangen valt af — dan mist iemand de eerste plaatsing, en dat
       is precies wat dit systeem moet voorkomen;
     · samenvoegen tot "2 plaatsingen" valt af — de kern van het
       bericht is wie je moet feliciteren, en dat gaat verloren zodra
       je het samenvat;
     · stapelen kost ruimte, en dát is oplosbaar: alleen de NIEUWSTE
       kaart staat er voluit, alles daarboven vouwt samen tot één regel
       met naam, accountmanager en kruisje (zie css/feest.css). Klik je
       de volle kaart weg, dan klapt de regel eronder open. Zo staat
       elke plaatsing er met naam, verdwijnt er nooit één ongezien, en
       kost een stapel toch niet meer dan een hoek van het scherm.
   Nieuwste onderaan, zodat de eerdere berichten niet verspringen
   onder de muis van iemand die net wil wegklikken. */
function toonKaart(ev){
  const wrap = zorgLaag();
  while(wrap.children.length >= MAX_KAARTEN) wrap.removeChild(wrap.firstElementChild);

  const naam = (ev.kandidaat || '').trim();
  const am   = String(ev.am || ev.door || '').trim();
  const mLbl = maandLabel(ev.maand);
  /* Tellers: de afzender rekent ze uit en stuurt ze mee. Elke browser
     zelf laten rekenen zou verschillende getallen op verschillende
     schermen geven — `candidates` staat niet in de realtime-publicatie,
     dus wie de app een uur geleden heeft geopend heeft oudere gegevens.
     Bij de inhaalslag rékent deze browser wel zelf, want dan zijn de
     gegevens net opgehaald en dus vers. */
  const totaal   = Number(ev.totaal);
  const amTotaal = Number(ev.amTotaal);
  const heeftTotaal = Number.isFinite(totaal);
  /* Een 0 naast iemands naam op een feestkaart is het enige dat dit een
     scorebord kan laten lijken — en het klopt dan meestal ook niet: de
     zojuist gevierde plaatsing telt mee, dus wie de eer krijgt staat
     altijd op minstens 1. Blijft er toch een 0 over (geen `rec` op de
     kandidaat, dus teruggevallen op wie de handeling deed), dan tonen we
     alleen het teamgetal. */
  const heeftAM     = Number.isFinite(amTotaal) && amTotaal > 0 && !!am;

  const kaart = document.createElement('div');
  kaart.className = 'feest-kaart';
  /* Volgorde: eerst het bericht, dán pas de sluitknop. De knop staat
     visueel toch absoluut in de hoek, en voorleessoftware leest de
     laag van boven naar beneden — dan hoor je de plaatsing en niet
     eerst "Bericht sluiten". */
  kaart.innerHTML =
    '<div class="feest-over">Contract getekend</div>' +
    '<div class="feest-naam' + (naam.length > 22 ? ' lang' : '') + '">' +
      (naam ? h(naam) : 'Getekend!') + '</div>' +
    '<div class="feest-bij">' + bijZin(ev) + '</div>' +
    /* De accountmanager staat er niet als voetnoot bij maar als de
       tweede kop van de kaart: dit is een compliment aan een persoon,
       geen systeemmelding. Wie het feest van een ander ziet, weet
       binnen één blik wie er gefeliciteerd moet worden. */
    (am ? '<div class="feest-am">' + CRM.avatar(am) +
          '<div class="feest-am-t"><span>Binnengehaald door</span><b>' + h(am) + '</b></div>' +
          '</div>' : '') +
    (heeftTotaal
      ? '<div class="feest-tellers' + (heeftAM ? '' : ' een') + '">' +
          '<div class="feest-tel"><div class="feest-tel-n num" data-tel="' + totaal + '">0</div>' +
            '<span>plaatsing' + (totaal === 1 ? '' : 'en') + ' ' + h(mLbl) + '</span></div>' +
          (heeftAM
            ? '<div class="feest-tel"><div class="feest-tel-n num" data-tel="' + amTotaal + '" data-na="200">0</div>' +
              '<span>waarvan door ' + h(voornaam(am)) + '</span></div>'
            : '') +
        '</div>'
      : '') +
    /* Het bedrag komt mee in de gebeurtenis (zie feeVan/feeRegel). Kon
       de afzender het niet berekenen, dan is dit een lege string: geen
       regel, geen streepje, geen lege plek. */
    feeRegel(ev) +
    '<span class="feest-hand" aria-hidden="true">Proost!</span>' +
    '<button class="feest-sluit" type="button">Gezien — sluiten</button>' +
    '<button class="feest-x" type="button" aria-label="Bericht sluiten">×</button>';
  wrap.appendChild(kaart);

  /* De tellers staan alleen op de NIEUWSTE kaart, en ze worden bij de
     oudere echt WEGGEHAALD in plaats van verborgen. Het maandtotaal is
     op elke kaart hetzelfde getal — drie keer "9 plaatsingen deze maand"
     onder elkaar leest als een fout. En als je straks de bovenste
     wegklikt en de kaart eronder klapt open, zou die anders een
     verouderd totaal laten zien van het moment waarop híj gemaakt werd.
     Liever geen getal dan een getal dat niet meer klopt.
     De naam van de accountmanager en de fee blijven wél op elke kaart:
     die zijn per plaatsing verschillend en veranderen niet meer. */
  CRM.$$('.feest-tellers', wrap).forEach(el => { if(el.closest('.feest-kaart') !== kaart) el.remove(); });
  meetRuimte(wrap);

  /* De onthulling begint pas als de kaart er staat, anders telt hij op
     achter een doorzichtig vlak en heeft niemand het gezien. */
  setTimeout(() => {
    CRM.$$('[data-tel]', kaart).forEach(el => telOp(el, el.dataset.tel, +el.dataset.na || 0));
  }, T.kaartIn + 320);

  /* Opbouw in plaats van één klap: eerst de knal, dan komt het bericht
     op. De vertraging moet ook een tik zijn zodat de browser twee
     toestanden ziet — in hetzelfde frame aanhaken én de klasse zetten
     geeft helemaal geen overgang. */
  const tIn = setTimeout(() => kaart.classList.add('in'), T.kaartIn);

  /* GEEN timer die dit bericht opruimt. Een plaatsing gebeurt dertig
     keer per jaar; het mag staan tot iemand het gezien heeft. Weg gaat
     het alleen door de knop, een klik op de kaart, of Escape. */
  const weg = () => {
    if(!kaart.parentNode) return;
    clearTimeout(tIn);
    /* Weggeklikt is weggeklikt, ook na een herlaadbeurt: hier — en
       alleen hier — gaat het kandidaat-id de opslag in. Niet al bij het
       tónen, want dan zou iemand die net vernieuwt het bericht kwijt
       zijn zonder het gezien te hebben. */
    gezienZet(ev.id);
    kaart.classList.add('uit');
    setTimeout(() => {
      if(kaart.parentNode) kaart.parentNode.removeChild(kaart);
      if(laag) meetRuimte(laag);
    }, 380);
  };
  kaart._sluit = weg;
  kaart.onclick = weg;                                   // wegklikken mag overal op de kaart
  kaart.querySelector('.feest-x').onclick     = e => { e.stopPropagation(); weg(); };
  kaart.querySelector('.feest-sluit').onclick = e => { e.stopPropagation(); weg(); };
}

function sluitAlles(){
  if(laag) Array.from(laag.children).forEach(k => k._sluit && k._sluit());
  ruimCanvasOp();
  wegPeter();          /* wegklikken sluit het hele feest, niet de helft */
}

/* Escape sluit het feest — maar niet als er een modal of een drawer
   openstaat, want die hebben in js/core.js voorrang op dezelfde toets.
   Eén druk hoort één ding te sluiten.

   Dit móet in de capture-fase (de `true` achteraan). De listener van
   core hangt ook op document en staat er eerder, dus in de gewone
   volgorde had core de modal al gesloten voordat wij mochten kijken —
   en dan zag deze regel geen modal meer en ging het feest er in
   dezelfde toetsaanslag overheen mee. */
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if(!laag || !laag.children.length) return;
  if(CRM.modal && CRM.modal._aan) return;
  if(document.querySelector('.drawer.on, .scrim.on')) return;
  sluitAlles();
}, true);

/* ═══════════════════════════════════════════════════════════════
   ONTDUBBELEN
   ═══════════════════════════════════════════════════════════════ */

function opschonen(nu){
  gezien.forEach((t, k) => { if(nu - t > VERS_MS * 2) gezien.delete(k); });
  recent.forEach((t, k) => { if(nu - t > HERHAAL_MS * 2) recent.delete(k); });
}

/* De sleutel waarop een kandidaat "dezelfde" is. Het id is het beste;
   zonder id valt het terug op de naam, want een naamloze kandidaat
   krijgt dan tenminste nog de gebeurtenis-sleutel als rem. */
const kandSleutel = ev =>
  ev.ck || (ev.id ? 'id:' + ev.id : (ev.kandidaat ? 'naam:' + String(ev.kandidaat).trim().toLowerCase() : ''));

/* Mag deze gebeurtenis gevierd worden? Eén functie voor lokaal én voor
   wat er binnenkomt, zodat beide kanten precies dezelfde regels volgen.

   Een eigen id en een tijdstempel zijn verplicht. getekend() zet ze
   altijd, dus dat kost niets — en het betekent dat iets wat wél op het
   kanaal langskomt maar niet van deze module is, nooit tot confetti
   leidt. Zonder tijdstempel valt regel 2 anders stil, en dan is een
   oude of onbekende boodschap ineens weer feest. */
function magVieren(ev){
  const nu = Date.now();
  opschonen(nu);

  if(!ev.eid || !ev.ts) return false;
  if(gezien.has(ev.eid)) return false;                           // regel 1
  gezien.set(ev.eid, nu);
  if(nu - ev.ts > VERS_MS) return false;                         // regel 2

  const sleutel = kandSleutel(ev);                               // regel 3
  if(sleutel){
    const eerder = recent.get(sleutel);
    if(eerder && nu - eerder < HERHAAL_MS) return false;
    recent.set(sleutel, nu);
  }
  return true;
}

/* Hoeveel ruimte houdt Peter over?

   De mededeling staat in de feeststand bóven hem, en die kan hoog zijn:
   een lange naam, de tellers, en bij een inhaalslag soms twee kaarten
   onder elkaar. Een vaste hoogte voor Peter leverde dan een stapel op
   die tot over zijn hoofd liep — je zag alleen nog schoenen, en dat
   ziet er kapot uit.

   Dus meten, niet gokken: eerst hoeveel de kaarten nodig hebben, dan
   krijgt Peter wat overblijft, met een bovengrens. Blijft er te weinig
   over om hem nog te herkennen, dan gaat hij helemaal weg — een halve
   Peter achter een kaart is slechter dan geen Peter. Het bericht en de
   cijfers zijn het belangrijkst, en die blijven altijd heel. */
function meetRuimte(wrap){
  if(!wrap || !wrap.children.length) return;
  const kaarten = Array.from(wrap.children);
  const hoog = kaarten.reduce((s, k) => s + k.getBoundingClientRect().height, 0)
             + (kaarten.length - 1) * 12;
  const vh = window.innerHeight, breed = window.innerWidth > 520;
  const max = Math.min(vh * (breed ? .48 : .34), breed ? 430 : 300);
  let peterH = Math.min(max, vh - hoog - 76 - 28);
  if(peterH < 190) peterH = 0;         // hieronder is het geen Peter meer
  document.documentElement.style.setProperty('--feest-peter-h', Math.round(peterH) + 'px');
  if(!peterH) wegPeter();
}

/* ─── Van feest naar rust ──────────────────────────────────────────
   De laag wisselt van "midden in beeld" naar "rechtsboven". Flexbox kan
   die verhuizing niet zelf animeren (uitlijning is geen animeerbare
   eigenschap), dus doen we het met FLIP: eerst meten waar de kaarten
   staan, dan de stand omzetten, opnieuw meten, en het verschil als
   transform terugzetten die we daarna naar nul laten lopen. Resultaat:
   de kaart glijdt zichtbaar naar zijn hoek in plaats van te verspringen,
   zodat duidelijk is dat het hetzelfde bericht is.

   Een nieuwe plaatsing tijdens de nasleep zet alles weer naar het
   midden: dat is een nieuw moment, en dan hoort de hele stapel weer
   midden in beeld te staan. Dezelfde functie, andere kant op. */
function zetStand(rust){
  if(!laag || laag.classList.contains('rust') === rust) return;
  clearTimeout(laag._tRust);
  const kaarten = Array.from(laag.children);
  const voor = kaarten.map(k => k.getBoundingClientRect());
  laag.classList.toggle('rust', rust);
  /* Niet glijden als niemand het ziet. Bij `prefers-reduced-motion`
     spreekt dat vanzelf; op een achtergrondtabblad is het bovendien
     schadelijk: css-overgangen lopen daar niet door, dus de kaart zou
     met een halve verschuiving blijven staan tot iemand terugkomt. */
  if(rustig() || document.visibilityState === 'hidden') return;
  kaarten.forEach((k, i) => {
    const na = k.getBoundingClientRect();
    const dx = Math.round(voor[i].left - na.left), dy = Math.round(voor[i].top - na.top);
    if(!dx && !dy) return;
    k.style.transition = 'none';
    k.style.transform  = 'translate(' + dx + 'px,' + dy + 'px)';
    /* Met een timer en niet met rAF: in een achtergrondtabblad zou de
       kaart anders met die transform blijven staan. */
    setTimeout(() => {
      k.style.transition = 'transform .75s cubic-bezier(.5,0,.15,1)';
      k.style.transform  = '';
      setTimeout(() => { k.style.transition = ''; }, 800);
    }, 20);
  });
}

function vier(ev){
  startConfetti();
  toonPeter();
  /* Elk nieuw feest begint in het midden en valt daarna terug in rust.
     De klok wordt hier gewist én opnieuw gezet, ook als de stand al op
     midden staat: bij twee plaatsingen kort na elkaar zou de eerste
     klok anders de tweede halverwege naar de hoek trekken. */
  const wrap = zorgLaag();
  clearTimeout(wrap._tRust);
  zetStand(false);
  toonKaart(ev);
  wrap._tRust = setTimeout(() => zetStand(true), T.rust);
}

/* ═══════════════════════════════════════════════════════════════
   ROND STUREN — broadcast op een eigen kanaal
   ═══════════════════════════════════════════════════════════════ */

function verbind(){
  if(kanaal || !CRM.sb) return;
  try{
    kanaal = CRM.sb.channel('crm-feest', {config:{broadcast:{self:false, ack:false}}});
    kanaal.on('broadcast', {event:'getekend'}, bericht => {
      const ev = bericht && bericht.payload;
      if(ev && typeof ev === 'object' && !gezienHeeft(ev.id) && magVieren(ev)) vier(ev);
    });
    /* Vangnet naast de broadcast: de rijwijziging zelf. Sinds 14 aug 2026
       staat `candidates` in de realtime-publicatie (daardoor beweegt het
       bord bij collega's al live mee), en die route komt aantoonbaar aan
       waar de broadcast in de praktijk weleens stil bleef — dan zag een
       collega het feest pas na een handmatige refresh (Tjeerd, 21 aug
       2026: "dit moet bij iedereen live zijn als die sleept").
       Dubbel vieren kan niet: wie de broadcast wél ontving, wordt door
       regel 3 van magVieren (zelfde kandidaat binnen tien minuten)
       tegengehouden — net als de doener zelf, die lokaal al vierde.
       Alleen een plaatsing van vandáág telt: een bewerking aan een oude
       plaatsing (loon aanvullen) is geen nieuw feest. */
    kanaal.on('postgres_changes', {event:'UPDATE', schema:'public', table:'candidates'}, p => {
      const r = p && p.new;
      if(!r || !CRM.PLACED || !CRM.PLACED.includes(r.fase)) return;
      if(!r.geplaatst_op || String(r.geplaatst_op) < (CRM.todayISO ? CRM.todayISO() : '')) return;
      if(gezienHeeft(r.id)) return;
      const am = String(r.rec || '').trim();
      const t  = tellers(String(r.id), null, am);
      const ev = {
        eid: 'pg' + Date.now() + Math.random().toString(36).slice(2),
        ts:  Date.now(), id: String(r.id),
        kandidaat: r.naam || '', klant: r.klant || '', functie: r.functie || '',
        am, door: am, maand: t.maand, totaal: t.totaal, amTotaal: t.amTotaal,
        fee: feeVan(String(r.id))
      };
      ev.ck = kandSleutel(ev);
      if(magVieren(ev)) vier(ev);
    });
    kanaal.subscribe(status => { verbonden = (status === 'SUBSCRIBED'); });
  }catch(e){
    /* Geen verbinding is geen ramp en al helemaal geen foutmelding:
       je ziet dan gewoon je eigen confetti. */
    kanaal = null; verbonden = false;
  }
}

/* Versturen langs de weg die op dat moment openstaat.

   Staat de websocket-verbinding, dan gaat het daarlangs. Staat hij nog
   niet (de eerste seconden na het laden, of na een haperende
   verbinding), dan doet send() dat stiekem via de REST-route én zet er
   een waarschuwing in de console bij. Die waarschuwing is terecht: je
   hoort te weten wélke weg je neemt. Dus kiezen we zelf, en dan blijft
   de console schoon. httpSend bestaat niet in elke versie van de
   bibliotheek, vandaar de terugval. */
function stuur(ev){
  if(!kanaal) return;
  try{
    const bericht = {type:'broadcast', event:'getekend', payload:ev};
    const r = (!verbonden && typeof kanaal.httpSend === 'function')
      ? kanaal.httpSend(bericht)
      : kanaal.send(bericht);
    if(r && typeof r.catch === 'function') r.catch(() => {});
  }catch(e){ /* stil — zie hierboven */ }
}

/* Iets later verbinden dan het laden van de pagina: bij het opstarten
   staan de gegevens ophalen en het scherm tekenen voorop, en er valt
   toch niets te missen (broadcast bewaart geen geschiedenis). */
if(document.readyState === 'complete') setTimeout(verbind, 1200);
else window.addEventListener('load', () => setTimeout(verbind, 1200));

/* ═══════════════════════════════════════════════════════════════
   DE INHAALSLAG — wie later inlogt ziet het alsnog
   Leest de plaatsingen van de afgelopen dagen uit CRM.state en toont
   wat deze browser nog niet heeft weggeklikt. Geen tabel, geen
   realtime, geen extra recht: het staat al in `candidates`.
   ═══════════════════════════════════════════════════════════════ */
function inhalen(){
  let nieuw = [];
  try{
    const grens = dagenTerug(INHAAL_DAGEN);
    nieuw = CRM.kandidaten()
      .filter(c => c.geplaatstOp && String(c.geplaatstOp) >= grens &&
                   CRM.PLACED.includes(c.fase) && !gezienHeeft(c.id))
      .sort((a, b) => String(a.geplaatstOp).localeCompare(String(b.geplaatstOp)));
  }catch(e){ return; }                       // liever niets dan een storing
  if(!nieuw.length) return;

  /* Eén knal en één Peter voor de hele inhaalslag, ook bij twee
     plaatsingen: vier keer achter elkaar hetzelfde filmpje starten is
     geen feest maar een storing. vier() doet de knal; de rest krijgt
     alleen een kaart erbij. */
  nieuw.slice(0, MAX_KAARTEN).forEach((c, i) => {
    const am = String(c.rec || '').trim();
    const mk = String(c.geplaatstOp).slice(0, 7);
    const t  = tellers(null, mk, am);
    const ev = {
      eid: 'inhaal:' + c.id, ts: Date.now(),
      id: String(c.id), kandidaat: c.naam || '', klant: c.klant || '', functie: c.functie || '',
      am, door: am, maand: mk, totaal: t.totaal, amTotaal: t.amTotaal,
      fee: feeVan(c.id)
    };
    ev.ck = kandSleutel(ev);
    /* Ook de inhaalslag gaat langs magVieren. Niet voor de versheid —
       die is hier al bepaald door het venster van drie dagen — maar voor
       regel 3: komt er vlak na het opstarten alsnog een uitzending over
       dezelfde kandidaat binnen, dan viert die niet nóg een keer. */
    if(!magVieren(ev)) return;
    if(i === 0) vier(ev); else toonKaart(ev);
  });
}

/* Pas beginnen als de app zélf staat. Confetti over een scherm dat nog
   aan het laden is voelt als een storing, en vóór CRM.load() zijn er
   ook helemaal geen kandidaten om in te kijken. Daarom wachten op
   `_loaded` én op een gekozen module, en dan nog een adempauze zodat
   het scherm eerst getekend is. Na een halve minuut geven we het op:
   laadt de app niet, dan is confetti het probleem niet. */
(function wachtOpApp(){
  let pogingen = 0;
  const tik = setInterval(() => {
    if(++pogingen > 75) return clearInterval(tik);        // ~30 s
    if(!CRM.state || !CRM.state._loaded || !CRM.view) return;
    clearInterval(tik);
    setTimeout(inhalen, 900);
  }, 400);
})();

/* ═══════════════════════════════════════════════════════════════
   INGANG
   ═══════════════════════════════════════════════════════════════ */
CRM.feest = {
  /* Er is getekend. Viert het hier en stuurt het naar iedereen die op
     dit moment ingelogd is. Alle velden zijn optioneel.
       id        — kandidaat-id: nodig om niet twee keer te vieren, om
                   het weggeklikt te kunnen onthouden, en om de net
                   gezette plaatsing in de tellers mee te krijgen
       kandidaat — naam op de kaart
       klant     — bij wie
       functie   — als wat
       am        — de accountmanager die dit binnenhaalde (`c.rec`);
                   dít is de naam op de kaart en de naam die de tweede
                   teller telt
       door      — wie de handeling deed (standaard: jij); wordt gebruikt
                   als er geen `am` bekend is */
  getekend(opts){
    const o = opts || {};
    const id = o.id != null ? String(o.id) : '';
    /* Wie krijgt de eer: de accountmanager op de kandidaat (`rec`), niet
       degene die toevallig de kaart versleept. Verplaatst Bryan de kaart
       van Tjeerd, dan is het nog steeds de plaatsing van Tjeerd — en de
       teller eronder telt datzelfde veld, dus naam en getal moeten wel
       over dezelfde persoon gaan.

       We zoeken `rec` zelf op als de aanroeper hem niet meestuurt. Dat
       scheelt de aanroeper werk en, belangrijker, het kan hier niet
       misgaan: één plek waar staat wie de eer krijgt. Staat er geen AM
       op de kandidaat, dan valt het terug op wie het deed. */
    const recVan = id ? String((CRM.kandidaat(id) || {}).rec || '').trim() : '';
    const am = String(o.am || recVan || o.door || (CRM.me ? CRM.me() : '') || '').trim();
    const t  = tellers(id, null, am);
    const ev = {
      eid: CRM.uid ? CRM.uid() : 'f' + Date.now() + Math.random().toString(36).slice(2),
      ts:  Date.now(),
      id,
      kandidaat: o.kandidaat || '',
      klant:     o.klant     || '',
      functie:   o.functie   || '',
      am,
      door:      o.door != null ? o.door : (CRM.me ? CRM.me() : ''),
      maand:     t.maand,
      totaal:    t.totaal,
      amTotaal:  t.amTotaal,
      /* De afzender rekent de fee uit; de ontvangers tonen wat er
         binnenkomt. Lukt het hier niet (geen leesrecht op de afspraken,
         of het maandloon staat er nog niet in), dan gaat er niets mee en
         viert iedereen zonder bedrag. Zie de toelichting bij feeVan. */
      fee:       o.fee != null ? o.fee : feeVan(id)
    };
    ev.ck = kandSleutel(ev);
    /* De afzender beoordeelt zelf óók: is dit een herstelde vergissing,
       dan gaat hij niet de deur uit en ziet niemand hem — precies de
       bedoeling van regel 3. */
    if(!magVieren(ev)) return false;
    vier(ev);
    stuur(ev);
    return true;
  },

  /* Alleen tonen, niets rondsturen. Voor als iets lokaals gevierd moet
     worden zonder het hele team lastig te vallen. */
  lokaal(opts){
    const o = opts || {};
    const am = String(o.am || o.door || (CRM.me ? CRM.me() : '') || '').trim();
    const t  = tellers(o.id != null ? String(o.id) : '', null, am);
    const id = o.id != null ? String(o.id) : '';
    vier({id, kandidaat:o.kandidaat || '', klant:o.klant || '', functie:o.functie || '',
          am, door:am, maand:t.maand, totaal:t.totaal, amTotaal:t.amTotaal,
          fee:o.fee != null ? o.fee : feeVan(id)});
  },

  sluit: sluitAlles,

  /* Meetpunt voor het bouwen en voor later nakijken: framerate, het
     aantal deeltjes, en of Peter meedraait. */
  _meting: () => ({fps:meting.fps, deeltjes:meting.deeltjes, gepland:aantalDeeltjes(),
                   kanaal: !!kanaal, verbonden, rustig:rustig(), peter: !!peter,
                   stand: laag && laag.classList.contains('rust') ? 'rust' : 'feest',
                   berichten: laag ? laag.children.length : 0}),
  /* Alleen voor het testen: meteen naar de nasleepstand. */
  _rust: () => zetStand(true),
  /* Alleen voor het testen: de inhaalslag opnieuw draaien, en de
     "weggeklikt"-opslag legen. */
  _inhalen: inhalen,
  _vergeet: () => { try{ localStorage.removeItem(OPSLAG); }catch(e){} }
};

})();

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN COORDINATOR
   ═══════════════════════════════════════════════════════════════

   1. index.html — AL GEDAAN (regel 27 en 94). Niets meer nodig.

   2. js/recruitment.js — AL GEDAAN (regel 2135 in bewaarFase). Die regel
      klopt en mag zo blijven:

        if(CRM.PLACED.includes(fase) && !CRM.PLACED.includes(c.fase) && CRM.feest)
          CRM.feest.getekend({id:c.id, kandidaat:c.naam, klant:c.klant,
                              functie:c.functie, door:CRM.me()});

      Er is bewust GEEN `am:c.rec` bijgezet, ook al gaat de kaart over de
      accountmanager. Deze module zoekt `rec` zelf op aan de hand van het
      id dat er al in zit — één plek waar staat wie de eer krijgt, en het
      kan bij de aanroeper niet meer misgaan. Getest: Tjeerd versleept de
      kaart van een kandidaat van Tjerk, en de kaart zegt "binnengehaald
      door Tjerk" met Tjerk zijn teller eronder.

      Waarom deze plek de juiste is (blijft gelden):
        · js/pijplijn.js (slepen), de fase-picker en de kandidatenkaart
          komen alle drie uit bij faseWissel → bewaarFase. Eén regel dekt
          alles, en een vierde ingang kan het feest later niet missen.
        · `c` is daar nog de kandidaat van vóór de wissel (CRM.kandidaat
          maakt een kopie), dus `c.fase` is de oude fase.
        · De test is "PLACED in, PLACED niet uit" en niet
          `fase === 'Contract getekend'`: een getekend contract met een
          startdatum van vandaag of eerder gaat meteen door naar Gestart,
          en dát is ook de plaatsing. Andersom viert Contract getekend →
          Gestart niet nog een keer.
        · promoteerStarts() schrijft via bewaarKand en komt hier niet
          langs. Terecht: een verstrijkende kalender is geen plaatsing.

   3. Niets in supabase/schema.sql. Deze module gebruikt broadcast op
      een eigen kanaal ('crm-feest'), geen tabel — zie de toelichting
      bovenaan dit bestand. Blok 9 hoeft niet uitgebreid te worden en
      `candidates` blijft buiten de publicatie.

   4. Niets in js/core.js. Het eigen kanaal staat los van CRM._rt.
      Mócht core later broadcast willen bundelen op het bestaande
      kanaal 'crm', dan is de enige wijziging hier de regel in
      verbind() — de rest van dit bestand blijft zoals het is.

   5. Niets in de modules. Canvas en berichtenlaag hangen aan
      document.body, dus buiten #viewmount: het feest overleeft een
      CRM.render(), een modulewissel en een geopende modal, en geen
      enkele module hoeft er iets voor te doen of vrij te houden.
   ═══════════════════════════════════════════════════════════════ */
