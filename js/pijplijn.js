/* ═══════════════════════════════════════════════════════════════
   MODULE: KLANTTRAJECTEN — wat er loopt bij de klant
   (bestandsnaam en modulesleutel blijven `pijplijn`; alleen de naam
   die de gebruiker ziet is per 31 juli 2026 Klanttrajecten)

   Sinds de splitsing in twee pijplijnen (zie js/data.js) begint dit
   scherm bij 'Voorgesteld'. Alles daarvóór — binnenkomst, cv, videocall,
   intake — is de recruitmentpijplijn en woont in js/recruitment.js.
   Wie hier staat is compleet: kaart, cv, intake en videocall gehad.

   Twee weergaven op dezelfde kandidaten en dezelfde filters:
     BORD  — kanban met uitvalstrook, week-indeling in de kolommen,
             groeperen per klant, compact-weergave en de mobiele
             fase-picker. Laat zien wáár het vastloopt.
     LIJST — dezelfde selectie als tabel, standaard gesorteerd op
             langst in dezelfde fase. Laat zien wát het langst stilstaat.
   Gedrag en formules 1-op-1 het pijplijnbord (PARITEIT-BORD.md);
   verhuisd vanuit js/recruitment.js.

   Gedeelde logica komt uit recruitment.js (laadt vóór dit bestand):
     CRM.kandidaatBewerk(id)        — bewerk-drawer
     CRM.kandidaatFase(id, fase)    — fasewissel + poortwachters
     CRM._rcDeel                    — intake, O&O, garantie, weekgrens
   Zo bestaan de poortwachters en de finance-regels maar één keer.
   Bewust géén badge in de zijbalk — dit scherm is werk, geen alarm.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;
const D = () => CRM._rcDeel || {};

/* ─── Filters (blijven bewaard tussen renders) ─────────────────── */
const P = {q:'', klant:'', rec:'', vac:'', type:'', mijn:false, groep:false};

/* Wegwerken van een bord is fijnmazig werk: je klikt een kaart aan, bekijkt
   de kandidatenkaart en wilt daarna precies terug waar je was. De filters
   zitten al in P (die overleeft een render); hier bewaren we de
   scrollpositie van de pagina en van het bord zelf. */
let pos = null;
function bewaarPositie(id){
  const board = document.getElementById('rb_board');   // dit is de horizontale scroller
  pos = {y: window.scrollY || 0, x: board ? board.scrollLeft : 0, id: String(id||'')};
}
function herstelPositie(){
  if(!pos) return;
  const p = pos; pos = null;
  /* Meteen én nog één keer na een tick: de kolommen staan er al, maar een
     enkele browser rekent de breedte pas na de eerstvolgende layout uit.
     Bewust géén requestAnimationFrame — die staat stil in een achtergrondtab. */
  const zet = () => {
    const board = document.getElementById('rb_board');
    if(board) board.scrollLeft = p.x;
    window.scrollTo(0, p.y);
  };
  zet(); setTimeout(zet, 0);
}
/* De kandidatenkaart biedt "← Terug naar het bord" aan voor precies de
   kandidaat die vanaf het bord is aangeklikt. */
CRM.pijplijnTerug = id => !!pos && pos.id === String(id);

const UITVAL = ['Afgevallen','Gestopt'];
/* Waar het bord ophoudt: bij de handtekening.
   Elke kolom hier gaat over vóóruitgang — iemand staat op Tweede gesprek en
   de vraag is wat de volgende stap is. Na het tekenen beweegt er niets meer:
   er is één datum en een aftelling, en dat is geen kanban maar een agenda.
   'Gestart' liep bovendien nooit leeg, dus hoe beter het ging hoe voller dit
   bord werd. Die twee fases staan sinds 1 augustus 2026 in de module
   Plaatsingen, waar de vraag ook een andere is: niet "wat is de volgende
   stap" maar "is deze persoon klaar voor maandag". De tellers boven het bord
   (netto deze maand, starts deze week) blijven wél staan — die gaan over de
   opbrengst van dit bord, niet over werk dat hier nog ligt.
   (Besluit Tjeerd, 1 aug 2026, na "te chaotisch, het staat allemaal in het
   bord en in de recruitmentpijplijn".) */
const NA_BORD = CRM.PLACED;                    // Contract getekend, Gestart
/* CRM.PHASES begint bij 'Voorgesteld' — Intake is er per 31 juli 2026 uit
   gehaald en staat in CRM.VOOR_BORD. De eerste kolom is daarmee Voorgesteld
   en de laatste 'Contract ondertekenen'; nergens in dit bestand mag nog van
   'Intake is de eerste kolom' worden uitgegaan. */
const bordFases = () => CRM.PHASES.filter(p => !UITVAL.includes(p.k) && !NA_BORD.includes(p.k));
/* Staat deze kandidaat op het bord? faseIdx < 0 betekent 'nog niet
   voorgesteld' (Intake, geen fase, of een fase die niet meer bestaat).
   Uitval en getekend/gestart hebben wél een fase maar geen kolom meer.
   De lijstweergave gebruikt dezelfde regel, zodat bord en lijst gegarandeerd
   dezelfde mensen tonen — anders zou de lijst mensen laten zien die je op het
   bord nergens kunt terugvinden. */
const opBord = c => { const f = CRM.faseNorm(c.fase);
  return CRM.faseIdx(f) >= 0 && !UITVAL.includes(f) && !NA_BORD.includes(f); };
const vacById   = id => (CRM.state.vacs||[]).find(v => String(v.id) === String(id));
const vacLabel  = v => v ? (v.functie + ' · ' + v.klant) : '';
const norm      = s => String(s||'').toLowerCase();
const daysTo    = d => { const n = CRM.dagenGeleden(d); return n == null ? null : -n; };

/* Hoe lang staat deze kaart al in de HUIDIGE fase?
   Eerder werd blind het laatste historie-item gepakt. Dat item hoort vaak bij
   een vórige fase (historie loopt achter, of is uit het oude ATS geïmporteerd),
   waardoor élke kaart een veel te hoge "Xd in fase" kreeg en het rode
   stilstand-signaal niets meer betekende. Nu: het meest recente historie-item
   dát bij de huidige fase hoort — staat dezelfde fase er twee keer in, dan telt
   de laatste keer. Geen passend item? Dan is `since` de waarheid. */
function dagenInFase(c){
  let laatste = null;
  (c.historie||[]).forEach(x => {
    if(x && CRM.faseIs(x.fase, c.fase) && x.op && (!laatste || String(x.op) > String(laatste))) laatste = x.op;
  });
  const n = CRM.dagenGeleden(laatste || c.since);
  return n == null ? null : Math.max(0, n);
}

/* ─── Wanneer staat een traject te lang stil? ─────────────────────
   Hier stond één grens voor alle fases: vier dagen oranje, tien dagen rood.
   Dat zegt te weinig. Een openstaand aanbod dat vier dagen ligt is een
   probleem; een O&O-sessie die over anderhalve week staat gepland is dat
   niet. Eén getal voor allebei betekent dat je het signaal na een week
   negeert, en dan hangt het er voor niets.

   Per fase dus een eigen grens, met de reden erbij — die staat in de tooltip
   zodat niemand hoeft te raden waarom vier dagen erg is en drie niet.
   `null` = deze fase kent geen stilstand. Wachten hoort er dan bij: 'In de
   wacht' is een bewuste parkeerplek, en tussen een getekend contract en de
   startdatum zit nu eenmaal een opzegtermijn. */
const FASE_NORM = {
  'Voorgesteld':           {let:3,  actie:7,  waarom:'De klant heeft het profiel. Blijft een reactie uit, dan bel jij — wachten kost de kandidaat aan een ander bureau.'},
  'O&O sessie':            {let:10, actie:21, waarom:'Een sessie wordt vooruit gepland. Pas als iemand er na tien dagen nog geen sessie heeft, staat het traject echt stil.'},
  'Eerste gesprek':        {let:3,  actie:7,  waarom:'Na een eerste gesprek hoort binnen drie dagen een vervolg of een afwijzing te komen. Stilte leest de kandidaat als een nee.'},
  'Tweede gesprek':        {let:3,  actie:7,  waarom:'Twee gesprekken gehad betekent dat beide kanten het willen weten. Drie dagen zonder besluit is uitstel, geen zorgvuldigheid.'},
  'Meeloopdag':            {let:2,  actie:5,  waarom:'Na een meeloopdag weten beide partijen het meestal dezelfde dag nog. Twijfel die blijft hangen wordt een afzegging.'},
  'In de wacht':           null,
  'Offer':                 {let:2,  actie:4,  waarom:'Een openstaand aanbod koelt af. Elke dag stilte is een dag waarin een tegenbod kan komen.'},
  'Contract ondertekenen': {let:3,  actie:7,  waarom:'Tekenen is een formaliteit. Blijft de handtekening uit, dan is er iets anders aan de hand — en dat wil je horen vóór de startdatum.'},
  'Contract getekend':     null,
  'Gestart':               null
};
/* Geeft null terug of {klas, waarom} voor het aantal dagen in de fase. */
function stilstandFase(fase, dg){
  if(dg == null) return null;
  const n = FASE_NORM[CRM.faseNorm(fase)];
  if(!n || dg < n.let) return null;
  return {klas: dg >= n.actie ? 'red' : 'amber', waarom:n.waarom};
}

/* Weekindeling voor de week-view in de kolommen.
   Echte data bevat af en toe een onleesbare datum (import, handmatig
   getypt). Zonder controle levert dat een kolomkop "Week NaN · Invalid
   Date" op — daarom overal eerst geldigDatum(). */
const geldigDatum = d => { if(!d) return false; const t = new Date(d); return !isNaN(t.getTime()); };
function mondayOf(d){ const t = new Date(d); const dow = (t.getDay()+6)%7; t.setDate(t.getDate()-dow); t.setHours(0,0,0,0); return t; }
const isoLoc = dt => dt.toLocaleDateString('sv-SE');
const weekKey = d => isoLoc(mondayOf(d));
function isoWeek(d){
  const dt = new Date(d), x = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const dag = (x.getUTCDay()+6)%7; x.setUTCDate(x.getUTCDate()-dag+3);
  const ft = new Date(Date.UTC(x.getUTCFullYear(),0,4));
  return 1 + Math.round(((x-ft)/864e5 - 3 + ((ft.getUTCDay()+6)%7)) / 7);
}
function weekLabel(d){
  const ma = mondayOf(d), zo = new Date(ma); zo.setDate(ma.getDate()+6);
  const f = dt => dt.toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
  return 'Week ' + isoWeek(d) + ' · ' + f(ma) + '–' + f(zo);
}
const isDezeWeek = d => weekKey(d) === weekKey(CRM.todayISO());

/* Compact/ruim-weergave — zelfde sleutel als voorheen, dus de
   voorkeur van de gebruiker blijft behouden. */
const isCompact = () => localStorage.getItem('crm_rc_compact') === '1';
function pasDichtheidToe(){ const b = document.querySelector('.rc-bordwrap'); if(b) b.classList.toggle('compact', isCompact()); }

/* De kolommen moeten tot onder aan het scherm lopen en daarbinnen scrollen —
   niet de hele pagina laten meeschuiven. Hoe hoog ze mogen worden hangt af van
   wat erboven staat, en dat verschilt nu per situatie (de regel "klaar om voor
   te stellen" staat er niet altijd). Daarom meten in plaats van gokken. */
function pasKolomHoogteToe(){
  const board = document.getElementById('rb_board');
  if(!board) return;
  /* Op smal staan de kolommen ónder elkaar; dan is "tot onder aan het scherm"
     zinloos en scrol je gewoon door de pagina. Daar geldt de vaste regel uit
     de CSS. */
  if(window.innerWidth <= 900){ board.style.removeProperty('--bcolmax'); return; }
  /* +50px = de onderrand van het bord (30px padding) plus wat lucht, zodat de
     pagina zelf niet alsnog een schuifbalk krijgt. */
  const top = board.getBoundingClientRect().top + (window.scrollY || 0);
  board.style.setProperty('--bcolmax', `calc(100vh - ${Math.round(top + 50)}px)`);
}

/* ─── Bord of lijst ────────────────────────────────────────────────
   Onthouden per gebruiker in localStorage, net als de compact-stand
   hierboven en de filters van Kandidaten (crm_kand_filters) — het is een
   voorkeur van deze persoon op dit apparaat, geen gegeven dat in de
   database hoort.

   Het BORD is de standaard. Twee redenen: het is wat het team kent en
   waar het dagelijkse werk gebeurt (slepen naar de volgende fase, de
   O&O-sessies, de uitvalstrook), en het beantwoordt de vraag waar iemand
   voor openslaat — waar loopt het vast. De lijst is een gerichte
   tweede blik: sorteren en vergelijken over de fases heen. Wie hem
   nodig heeft, kiest hem, en dan blijft die keuze staan. */
const WKEY = 'crm_pp_weergave';
const weergave    = () => { try{ return localStorage.getItem(WKEY) === 'lijst' ? 'lijst' : 'bord'; }catch(e){ return 'bord'; } };
const zetWeergave = v => { try{ localStorage.setItem(WKEY, v); }catch(e){} };

/* Sorteerstand van de lijst. Bewust NIET in localStorage: de weergavekeuze
   is een gewoonte, de sortering is een vraag van dit moment. Standaard
   'langst in dezelfde fase, aflopend' — anders zet de lijst alleen dezelfde
   kaarten onder elkaar en voegt hij niets toe aan het bord. */
const SORT_STD = {kol:'dagen', op:'af'};
const L = {kol:SORT_STD.kol, op:SORT_STD.op};

/* Hoort deze kandidaat bij deze vacature? Op vacature_id, met terugval op
   klant+functie — precies zoals js/hot.js het doet. Zonder die terugval viel
   de hele import uit het oude ATS (geen vacature_id) buiten élke keuze van het
   vacaturefilter, terwijl het bord filterde op de functienaam die iedereen wél
   heeft. */
function bijVacature(c, vacId){
  const v = vacById(vacId);
  if(!v) return false;
  if(c.vacatureId) return String(c.vacatureId) === String(v.id);
  return !!v.klant && !!v.functie && c.klant === v.klant && c.functie === v.functie;
}

/* ─── Filteren ────────────────────────────────────────────────── */
function kandGefilterd(){
  const q = norm(P.q);
  return CRM.kandidaten().filter(c => {
    if(P.klant && c.klant !== P.klant) return false;
    if(P.rec && c.rec !== P.rec) return false;
    if(P.vac && !bijVacature(c, P.vac)) return false;
    if(P.type && (c.type||'') !== P.type) return false;
    if(P.mijn && c.rec !== CRM.me()) return false;
    if(q && !norm([c.naam, c.functie, c.klant, c.woonplaats].join(' ')).includes(q)) return false;
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════
   MODULE-REGISTRATIE
   ═══════════════════════════════════════════════════════════════ */
CRM.registerModule('pijplijn', {
  /* De sleutel blijft 'pijplijn' (index.html, navigatie, links vanuit andere
     modules); wat de gebruiker leest is Klanttrajecten. */
  title:'Klanttrajecten', icon:'▥', onderschrift:'Lopende trajecten bij klanten — van Voorgesteld tot Gestart',
  volleBreedte:true,
  render(mount, acties){
    if(!CRM._rcDeel || !CRM.kandidaatBewerk){
      mount.innerHTML = `<div class="note err">De recruitment-module is niet geladen — de klanttrajecten kunnen niet zonder.</div>`;
      return;
    }
    /* Gedeelde flows (drawer, fasewissel, intake) vernieuwen dit scherm
       via deze haak — zie tekenBody() in recruitment.js. */
    CRM._pijplijnVernieuw = () => { tekenBalk(); tekenInhoud(); };

    const K = CRM.kandidaten();
    const klanten = Array.from(new Set(K.map(c=>c.klant).filter(Boolean))).sort();
    const recs = Array.from(new Set(K.map(c=>c.rec).filter(Boolean))).sort();
    const vacs = (CRM.state.vacs||[]).slice().sort((a,b)=>vacLabel(a).localeCompare(vacLabel(b)));
    mount.innerHTML = `
      <div class="rc">
        <div class="rc-bar" id="pp_bar"></div>
        <div class="rc-pad rc-pad-b">
          <div class="rc-fil">
            <div class="searchbox" style="flex:1;max-width:230px">
              <input type="search" id="rb_q" placeholder="Zoek kandidaat" value="${h(P.q)}"></div>
            <select id="rb_klant" style="width:auto;min-width:150px"><option value="">Alle klanten</option>
              ${klanten.map(k=>`<option ${P.klant===k?'selected':''}>${h(k)}</option>`).join('')}</select>
            <select id="rb_rec" style="width:auto;min-width:130px"><option value="">Alle recruiters</option>
              ${recs.map(r=>`<option ${P.rec===r?'selected':''}>${h(r)}</option>`).join('')}</select>
            <select id="rb_type" style="width:auto;min-width:110px"><option value="">Alle types</option>
              <option ${P.type==='W&S'?'selected':''}>W&amp;S</option>
              <option ${P.type==='Flex'?'selected':''}>Flex</option></select>
            <select id="rb_vac" style="width:auto;min-width:190px"><option value="">Alle vacatures</option>
              ${vacs.map(v=>`<option value="${h(v.id)}" ${P.vac===String(v.id)?'selected':''}>${h(vacLabel(v))}</option>`).join('')}</select>
            <label class="check"><input type="checkbox" id="rb_mijn" ${P.mijn?'checked':''}> Mijn kandidaten</label>
            <label class="check"><input type="checkbox" id="rb_groep" ${P.groep?'checked':''}> Groepeer per klant</label>
          </div>
          <div id="pp_klaar" class="pp-klaar"></div>
          <div id="pp_geenfase" class="rc-geenfase"></div>
        </div>
        <div id="pp_weergave"></div>
      </div>`;

    const q = mount.querySelector('#rb_q');
    q.oninput = CRM.debounce(() => { P.q = q.value; tekenInhoud(); }, 200);
    mount.querySelector('#rb_klant').onchange = e => { P.klant = e.target.value; tekenInhoud(); };
    mount.querySelector('#rb_rec').onchange   = e => { P.rec   = e.target.value; tekenInhoud(); };
    mount.querySelector('#rb_type').onchange  = e => { P.type  = e.target.value.replace('&amp;','&'); tekenInhoud(); };
    mount.querySelector('#rb_vac').onchange   = e => { P.vac   = e.target.value; tekenInhoud(); };
    mount.querySelector('#rb_mijn').onchange  = e => { P.mijn  = e.target.checked; tekenInhoud(); };
    mount.querySelector('#rb_groep').onchange = e => { P.groep = e.target.checked; tekenInhoud(); };

    tekenActies(acties);
    tekenBalk();
    tekenWeergave();
    herstelPositie();
    D().promoteerStarts().then(n => { if(n){ tekenBalk(); tekenInhoud(); } });
  }
});

function tekenActies(acties){
  const el = acties || document.getElementById('pageacties');
  if(!el) return;
  const lijst = weergave() === 'lijst';
  /* De schakelaar staat vooraan: het is de eerste keuze die je maakt, en
     .seg is de vorm die het design-system daarvoor heeft. De compact-knop
     hoort alleen bij het bord — in de lijst doet hij niets. */
  el.innerHTML = `<div class="seg" id="pp_weerg" role="group" aria-label="Weergave">
      <button data-w="bord" class="${lijst?'':'on'}" aria-pressed="${lijst?'false':'true'}">Bord</button>
      <button data-w="lijst" class="${lijst?'on':''}" aria-pressed="${lijst?'true':'false'}">Lijst</button>
    </div>
    ${lijst?'':`<button class="btn ghost sm" id="pp_dicht">${isCompact()?'Ruime weergave':'Compacte weergave'}</button>`}`;
  /* Hier stonden "+ O&O-sessie" en "+ Kandidaat". Allebei weg per 2 aug 2026.

     Dit scherm laat zien wat er bij klanten loopt; het is geen plek om dingen
     aan te maken. Een kandidaat ontstaat bij Recruitment (uit een lead, of
     met "+ Sollicitant"), en een O&O-sessie hoort bij de vacature waarvoor
     hij georganiseerd wordt — niet bij een bord dat toevallig een kolom met
     die naam heeft.

     Het onderliggende punt is groter dan twee knoppen: zolang je hier dingen
     kunt aanmaken, is de fase iets wat je zélf ergens neerzet. Terwijl de
     fase een gevolg hoort te zijn van wat er met de kandidaat gebeurt.
     (Tjeerd, 2 aug 2026: "een O&O sessie toevoegen in klanttrajecten en een
     kandidaat toevoegen daar, dit hoort niet. Deze fase moet zich aanpassen
     aan de handelingen die je doet bij een kandidaat.") */
  CRM.$$('#pp_weerg button', el).forEach(b => b.onclick = () => {
    if(weergave() === b.dataset.w) return;
    zetWeergave(b.dataset.w);
    tekenActies(); tekenWeergave();
  });
  const dicht = el.querySelector('#pp_dicht');
  if(dicht) dicht.onclick = () => {
    localStorage.setItem('crm_rc_compact', isCompact() ? '0' : '1');
    tekenActies(); pasDichtheidToe();
  };
}

/* Container wisselen (bord ↔ lijst). Bij alleen een filterwijziging is
   tekenInhoud() genoeg — dan blijft de scrollpositie van het bord staan. */
function tekenWeergave(){
  const el = document.getElementById('pp_weergave');
  if(!el) return;
  el.innerHTML = weergave() === 'lijst'
    ? `<div class="rc-pad pp-lijstwrap" id="pp_lijst"></div>`
    : `<div class="rc-bordwrap ${isCompact()?'compact':''}"><div class="board" id="rb_board"></div></div>
       <p class="pp-uitregel" id="rb_uit"></p>`;
  tekenInhoud();
}
function tekenInhoud(){
  if(weergave() === 'lijst') tekenLijst(); else tekenKolommen();
  /* Ná de kolommen: deze regel staat erbóven en bepaalt dus mee hoe hoog ze
     mogen worden. */
  tekenBuitenBord();
  pasKolomHoogteToe();
}
/* Eén listener voor de hele module; doet niets zolang er geen bord staat. */
window.addEventListener('resize', CRM.debounce(pasKolomHoogteToe, 150));

/* ─── Netto-KPI-regel boven het bord ──────────────────────────── */
function tekenBalk(){
  const el = document.getElementById('pp_bar'); if(!el) return;
  const K = CRM.kandidaten();
  /* "In traject" moet exact zijn wat je in de kolommen (of in de lijst) ziet.
     Kandidaten zonder fase staan er niet op, en een kandidaat met een fase die
     niet meer bestaat evenmin — die kreeg hier eerder wél een plek in het
     getal, waardoor de KPI hoger stond dan de som van de kolomtellers. Ze
     vallen niet weg: de regels onder de filters noemen ze apart. */
  const lopend = K.filter(c => c.fase && CRM.faseIdx(c.fase) >= 0 && !CRM.DONE.includes(c.fase));
  const gesprek = lopend.filter(c => ['O&O sessie','Eerste gesprek','Tweede gesprek','Meeloopdag'].includes(c.fase)).length;
  const [ma, zo] = D().weekGrens();
  const startsWeek = K.filter(c => CRM.PLACED.includes(c.fase) && c.start &&
    new Date(c.start) >= ma && new Date(c.start) < zo).length;
  const pm = CRM.plaatsingenMaand(), target = CRM.maandTarget();
  const it = (lbl, waarde, extra='', klasse='') =>
    `<div class="rc-it ${klasse}"><div class="label">${h(lbl)}</div>
       <div class="rc-v num">${waarde}</div>${extra?`<div class="meta">${extra}</div>`:''}</div>`;
  /* De starts staan sinds 1 aug 2026 niet meer op dit bord maar in
     Plaatsingen. Het getal blijft hier — het is de opbrengst van dit bord —
     maar het moet je wel brengen waar die mensen nu wél staan, anders wijst
     een teller naar een kolom die er niet meer is. */
  el.innerHTML =
    it('In traject', lopend.length, 'vanaf Voorgesteld') +
    it('In gesprek', gesprek, 'O&amp;O t/m meeloopdag') +
    it('Starts deze week', startsWeek, '<button class="lnk" id="pp_naarpl">bekijk bij Plaatsingen →</button>') +
    it('Netto deze maand', `${CRM.plusMin(pm.netto)}<span class="rc-van">/ ${target}</span>`,
       `${pm.getekend.length} getekend${pm.gestopt.length ? ' · ' + CRM.plusMin(-pm.gestopt.length) + ' gestopt' : ''}`,
       pm.netto >= target ? 'goed' : '');
  const naarPl = el.querySelector('#pp_naarpl');
  if(naarPl) naarPl.onclick = () => CRM.ga('plaatsingen');
}

/* ─── Kaart (1-op-1 het bord) ─────────────────────────────────── */
function kaartHtml(c){
  const d = D();
  const v = vacById(c.vacatureId);
  const placed = CRM.PLACED.includes(c.fase);
  const dd = placed ? c.start : c.datum;
  const dt = dd ? daysTo(dd) : null;
  const isVandaag = dd && !placed && dt === 0;
  const isMorgen  = dd && !placed && dt === 1;
  const gemist    = dd && !placed && dt < 0;
  const over = c.actieDatum && (CRM.dagenGeleden(c.actieDatum) || 0) > 0;
  const dg = dagenInFase(c);
  /* GEEN intake-knop meer op dit bord. Hij stond hier voor het geval iemand
     op Voorgesteld belandde zonder vastgelegde intake — maar dat gaf de
     verkeerde boodschap: alsof je de intake nog even kunt doen nádat het cv
     bij de klant ligt. De intake hoort ervóór, en sinds 2 aug 2026 laat de
     poort in faseWissel() je er ook niet meer zomaar langs.

     Ontbreekt de intake bij iemand die hier tóch staat (de oude import, of
     een bewust doorgezette kandidaat), dan wordt dat gemeld als signaal op
     de kaart — zie 'intake?' hieronder. Vastleggen doe je op de
     kandidaatkaart, waar de rest van de gegevens ook staat.
     (Tjeerd, 2 aug 2026: "hier is al een videointake gedaan. We stellen ze
     pas voor als dit voldaan is.") */
  const intakeMist = CRM.faseIs(c.fase, 'Voorgesteld') && !d.intakeDone(c);
  const chips = [];
  if(intakeMist) chips.push(`<span class="chip amber" title="Deze kandidaat staat bij de klant zonder vastgelegde video-intake. Vastleggen doe je op de kandidaatkaart.">intake?</span>`);
  if(c.type) chips.push(`<span class="chip">${h(c.type)}</span>`);
  else if(placed) chips.push(`<span class="chip amber" title="Type W&S of Flex ontbreekt — nodig voor de facturatie">type?</span>`);
  if(c.bron) chips.push(`<span class="chip">${h(c.bron)}</span>`);
  /* Locatiechip van het bord (locOf): waar de klant zit. Bij twee vestigingen
     van dezelfde klant is dat het verschil tussen wel en niet reizen, dus die
     hoort op de kaart te staan. Vacaturelocatie gaat vóór — die is specifieker
     dan het adres van de klant. */
  { const loc = (v && v.locatie) || (CRM.klant(c.klant) || {}).locatie || '';
    if(loc) chips.push(`<span class="chip" title="Locatie">${h(loc)}</span>`); }
  if(c.herstartVan) chips.push(`<span class="chip purple" title="Heraangeboden — de eerdere uitkomst blijft op de oude kaart geregistreerd">herstart</span>`);
  if(c.vervangt) chips.push(`<span class="chip blue" title="Vervanger voor een gestopte plaatsing">vervanger</span>`);
  if(c.noShows) chips.push(`<span class="chip red num" title="No-shows">${h(c.noShows)}× no-show</span>`);
  { const sf = stilstandFase(c.fase, dg);
    if(sf) chips.push(`<span class="chip ${sf.klas} num" title="${h(dg + ' dagen in deze fase. ' + sf.waarom)}">${dg}d in fase</span>`);
    else if(dg != null && dg >= 14 && !CRM.DONE.includes(c.fase) && !FASE_NORM[CRM.faseNorm(c.fase)])
      /* Fases zonder norm ('In de wacht', na het tekenen) horen niet te
         kleuren — maar hoe lang iets er staat mag je wel zien. */
      chips.push(`<span class="chip num" title="Dagen in deze fase — wachten hoort hier bij het werk">${dg}d</span>`); }
  if(d.intakeDone(c)){ const ic = c.intake.cijfer;
    chips.push(`<span class="chip ${ic&&ic<7?'amber':'green'} num" title="${ic&&ic<7?'Afhaakrisico — commitment '+h(ic)+'/10':'Intake gedaan'}">intake ${ic?h(ic)+'/10':'✓'}</span>`);
  }
  if(placed && c.garantieMnd > 0){ const ge = d.garantieEnd(c);
    if(ge && ge >= CRM.todayISO()) chips.push(`<span class="chip green num" title="Garantietermijn">garantie t/m ${h(CRM.fmtDateShort(ge))}</span>`);
  }
  /* Opvolging: het ritme stond hier hardgecodeerd als dag 3·14·30 en werd
     op drie andere plekken nét anders herhaald. Nu één bron —
     js/opvolging.js — die ook het warm houden vóór de start en de
     verjaardag meeneemt. Zonder dat bestand blijft de kaart gewoon leeg. */
  if(CRM.opvolging){
    const oc = CRM.opvolging.chipHtml(c);
    if(oc) chips.push(oc);
  }
  let when = '';
  if(dd){
    const lbl = placed ? ((c.fase==='Gestart' && dd <= CRM.todayISO()) ? 'Gestart' : 'Start') : 'Afspraak';
    const cls = isVandaag ? 'vandaag' : isMorgen ? 'morgen' : gemist ? 'gemist' : placed ? 'start' : '';
    const txt = isVandaag ? 'vandaag' : isMorgen ? 'morgen' : CRM.fmtDay(dd);
    when = `<div class="rc-when ${cls}"><span class="num">${h(lbl)} · ${h(txt)}${(!placed && c.tijd) ? ' ' + h(c.tijd) : ''}${gemist ? ' — gemist' : ''}</span></div>`;
  }
  const verw = (['Meeloopdag','Offer','Contract ondertekenen'].includes(c.fase) && c.start)
    ? `<div class="rc-when verw"><span class="num">Verwachte start · ${h(CRM.fmtDay(c.start))}</span></div>` : '';
  return `<div class="bcard ${isVandaag?'vandaag':''} ${gemist?'gemist':''}" draggable="true" data-id="${h(c.id)}">
    <div class="bc-t">
      <div class="bc-n">${h(c.naam)}
        <div class="bc-s">${h(c.functie || (v?v.functie:'') || '—')}${c.klant?' @ '+h(c.klant):''}</div></div>
      ${c.rec?`<span class="rc-rec" title="${h(c.rec)}">${h(CRM.initialen(c.rec))}</span>`:''}
    </div>
    ${chips.length?`<div class="bc-f">${chips.join('')}</div>`:''}
    ${when}${verw}
    ${c.volgendeActie?`<div class="bc-act ${over?'over':''}">${h(c.volgendeActie)}${c.actieDatum?` <span class="num">· ${h(CRM.fmtDateShort(c.actieDatum))}</span>`:''}</div>`:''}
    <button class="btn ghost sm rc-move" data-move="${h(c.id)}">Volgende stap…</button>
  </div>`;
}

/* ─── Kolominhoud: weekgroepen, klantgroepen, O&O-sessies ─────── */
function weekGroepen(list, fase){
  const dateFn = c => ['Contract ondertekenen','Contract getekend','Gestart'].includes(fase) ? c.start : c.datum;
  const naam = c => String(c.naam||'');
  const asc = fase !== 'Gestart';
  const met = list.filter(c => geldigDatum(dateFn(c))).slice().sort((a,b) => {
    const x = dateFn(a), y = dateFn(b);
    if(x === y) return naam(a).localeCompare(naam(b));
    return asc ? (x < y ? -1 : 1) : (x < y ? 1 : -1);
  });
  const zonder = list.filter(c => !dateFn(c));
  const onleesbaar = list.filter(c => dateFn(c) && !geldigDatum(dateFn(c)));
  let uit = '', cw = null;
  met.forEach(c => {
    const d = dateFn(c), wk = weekKey(d);
    if(wk !== cw){
      cw = wk;
      const n = met.filter(x => weekKey(dateFn(x)) === wk).length;
      uit += `<div class="rc-wdiv ${isDezeWeek(d)?'nu':''}">${h(weekLabel(d))} · ${n}</div>`;
    }
    uit += kaartHtml(c);
  });
  if(zonder.length) uit += `<div class="rc-wdiv">Nog te plannen</div>` + zonder.map(kaartHtml).join('');
  if(onleesbaar.length) uit += `<div class="rc-wdiv">Datum onleesbaar — corrigeer de kaart</div>` + onleesbaar.map(kaartHtml).join('');
  return uit;
}
function klantGroepen(list){
  const volgorde = [], groepen = {};
  list.forEach(c => { const k = c.klant || '—'; if(!groepen[k]){ groepen[k] = []; volgorde.push(k); } groepen[k].push(c); });
  return volgorde.map(k =>
    `<div class="rc-grp"><span>${h(k)}</span><b class="num">${groepen[k].length}</b></div>` +
    groepen[k].map(kaartHtml).join('')).join('');
}
function ooKolom(list){
  const d = D();
  const sess = d.ooSessies().slice()
    .filter(s => !P.klant || s.klant === P.klant)
    .sort((a,b) => String(a.datum||'9999').localeCompare(String(b.datum||'9999')));
  const getoond = new Set(sess.map(s => String(s.id)));
  let uit = '', cw = null;
  sess.forEach(s => {
    if(geldigDatum(s.datum)){
      const wk = weekKey(s.datum);
      if(wk !== cw){ cw = wk; uit += `<div class="rc-wdiv ${isDezeWeek(s.datum)?'nu':''}">${h(weekLabel(s.datum))}</div>`; }
    }
    const n = d.sessLeden(s.id).length;
    uit += `<button class="rc-sess ${n>=4?'goed':n===3?'matig':'laag'}" data-oo="${h(s.id)}" title="Sessie beheren">
      <span>${h(s.klant||'?')} · ${h(s.functie||'')}<small>${h(CRM.fmtDay(s.datum)||'geen datum')}${s.locatie?' · '+h(s.locatie):''}</small></span>
      <b class="num">${n}/4</b></button>`;
    uit += list.filter(c => String(c.ooId) === String(s.id)).map(kaartHtml).join('');
  });
  /* Alles wat hierboven géén sessiekop kreeg, komt onderaan te staan. Eerder
     was dit `!c.ooId || !ooSessie(c.ooId)`: een kandidaat met een sessie bij
     een ándere klant dan het klantfilter viel dan tussen wal en schip — die
     sessie werd niet getoond én de kaart gold niet als wees, dus die verdween
     uit de kolom terwijl de teller er wél op stond. */
  const wees = list.filter(c => !c.ooId || !getoond.has(String(c.ooId)));
  if(wees.length) uit += `<div class="rc-wdiv">Zonder sessie</div>` + wees.map(kaartHtml).join('');
  return uit;
}

function tekenKolommen(){
  const board = document.getElementById('rb_board'), uit = document.getElementById('rb_uit');
  if(!board) return;
  const d = D();
  const alle = kandGefilterd();
  /* Kolommen met een week-indeling: alles waar een dátum aan hangt, zodat je
     ziet welke gesprekken en starts wanneer staan — en wat er nog helemaal
     niet gepland is, onder "Nog te plannen". 'Intake' stond hier ook in toen
     dat nog de eerste kolom was, en 'Contract getekend'/'Gestart' tot 1 aug
     2026; beide staan niet meer op dit bord. */
  const WEEKCOLS = ['Eerste gesprek','Tweede gesprek','Meeloopdag','Contract ondertekenen'];
  const nm = c => String(c.naam||'');
  const byDate = (a,b) => {
    const x = a.datum||'', y = b.datum||'';
    if(!x && !y) return nm(a).localeCompare(nm(b));
    if(!x) return 1; if(!y) return -1;
    return x < y ? -1 : x > y ? 1 : nm(a).localeCompare(nm(b));
  };
  board.innerHTML = bordFases().map(p => {
    /* faseIs i.p.v. ===: een kandidaat kan op een oude fasewaarde staan zolang
       de migratie niet gedraaid is. CRM.faseNorm (data.js) vertaalt die naar de
       huidige naam, zodat zo iemand toch in de goede kolom belandt. */
    const kaarten = alle.filter(c => CRM.faseIs(c.fase, p.k)).sort(byDate);
    let binnen;
    if(p.k === 'O&O sessie') binnen = ooKolom(kaarten);
    else if(P.groep) binnen = klantGroepen(kaarten);
    else if(WEEKCOLS.includes(p.k)) binnen = weekGroepen(kaarten, p.k);
    else binnen = kaarten.map(kaartHtml).join('');
    /* Voorgesteld is sinds de splitsing de eerste kolom. Wie hier nog geen
       afspraak heeft staan, wacht op de klant — dat is precies het signaal
       waar een AM op moet sturen, dus het staat bovenaan de kolom.
       (Dezelfde vorm als de oude "zonder geplande videocall"-melding, die bij
       de Intake-kolom hoorde en met die kolom is vertrokken.) */
    /* Hoeveel er in déze kolom over de grens van deze fase heen is. Elke fase
       kan een wachtkamer worden en elke fase heeft een eigen grens — zonder
       deze regel moet je per kolom alle kaarten langs om dat te zien. */
    { const stil = kaarten.filter(c => stilstandFase(c.fase, dagenInFase(c))).length;
      const nrm = FASE_NORM[p.k];
      if(stil) binnen = `<div class="rc-letnote num" title="${h(nrm ? nrm.waarom : '')}">${stil}× staat hier te lang</div>` + binnen; }
    if(p.k === 'Voorgesteld'){
      const wacht = kaarten.filter(c => !c.datum).length;
      if(wacht) binnen = `<div class="rc-letnote num">${wacht}× nog geen afspraak gepland</div>` + binnen;
    }
    const leeg = p.k === 'Voorgesteld'
      ? 'Hier komt iemand te staan zodra je die bij een klant voorstelt — vanuit de recruitmentpijplijn'
      : '—';
    return `<div class="bcol" data-fase="${h(p.k)}" style="--ph:${p.c}">
      <div class="bcol-h"><b>${h(p.k)}</b><span class="cnt num">${kaarten.length}</span></div>
      <div class="bcol-b">${binnen || `<div class="rc-leegkol">${h(leeg)}</div>`}</div>
    </div>`;
  }).join('');

  /* Uitval: één regel onder het bord, geen kolom ernaast meer.
     Die kolom was een sleepdoel uit het oude pijplijnbord en nam een zesde
     van de breedte in beslag voor twee getallen. Belangrijker: hij stelde
     uitval voor als een fase waar je iemand naartoe schuift, terwijl de fase
     hoort te volgen uit wat de kandidaat bij de klant overkomt. Afvallen doe
     je nu waar de reden vandaan komt — op de kaart, via de fasekeuze, die om
     een categorie vraagt. Op het bord blijft alleen de stand staan.
     (Tjeerd, 31 jul 2026: "het pijplijnbord is meer een visualisatie, maar de
     fases zijn leidend vanuit de statussen die een kandidaat met een klant
     krijgt".) */
  const K = CRM.kandidaten();
  const nAfg = K.filter(c => c.fase === 'Afgevallen').length;
  const nStp = K.filter(c => c.fase === 'Gestopt').length;
  /* Vervangers in één doorloop indexeren — d.repOf() loopt zelf opnieuw
     door alle kandidaten, dus per gestopte kandidaat opnieuw aanroepen
     werd bij 350 rijen onnodig duur. */
  const vervangt = new Set(K.map(c => c.vervangt).filter(Boolean).map(String));
  const nVerv = K.filter(c => d.owesReplacement(c) && !vervangt.has(String(c.id))).length;
  if(uit){
    uit.innerHTML = `<span class="meta">Uitval: <b class="num">${nAfg}</b> afgevallen · <b class="num">${nStp}</b> gestopt</span>
      ${nVerv ? `<span class="chip red num">${nVerv}× vervanging nodig</span>` : ''}
      <button class="lnk" id="rb_uitopen">Uitval openen →</button>`;
    uit.querySelector('#rb_uitopen').onclick = () => d.openUitval();
  }

  CRM.$$('.bcard', board).forEach(k => {
    k.ondragstart = e => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('drag'); };
    k.ondragend   = () => k.classList.remove('drag');
    /* Klik = de VOLLEDIGE kandidatenkaart (wens Tjeerd, 30 jul 2026), niet
       meer het smalle bewerkpaneel van het oude pijplijnbord. Positie eerst
       bewaren, zodat "← Terug naar het bord" je precies terugzet. */
    k.onclick = e => {
      if(e.target.closest('[data-move]')) return;
      bewaarPositie(k.dataset.id);
      CRM.ga('kandidaten', {id:k.dataset.id});
    };
  });
  CRM.$$('[data-move]', board).forEach(b => b.onclick = e => { e.stopPropagation(); CRM.kandidaatFasePicker(b.dataset.move); });
  CRM.$$('[data-oo]', board).forEach(b => b.onclick = e => { e.stopPropagation(); d.ooModal(b.dataset.oo); });
  /* Alleen nog de kolommen zijn sleepdoel — de uitvalstrook is weg. */
  CRM.$$('.bcol', board).forEach(zone => {
    zone.ondragover  = e => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = e => {
      e.preventDefault(); zone.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      if(id) CRM.kandidaatFase(id, zone.dataset.fase);
    };
  });
  pasDichtheidToe();
}

/* ═══════════════════════════════════════════════════════════════
   WIE STAAT ER NIET OP DIT SCHERM?
   Dit bord begint bij Voorgesteld. Alles ervóór — mensen die de intake
   gehad hebben maar nog aan geen enkele klant zijn voorgesteld — komt
   dus in géén kolom voor. Dat is precies de groep waar de AM iets mee
   kan: klaarstaande mensen die alleen nog aan een vacature gekoppeld
   moeten worden. Ze mogen daarom niet onzichtbaar worden.

   Twee regels, met opzet gescheiden:
     1. Klaar om voor te stellen — werkvoorraad, klikbaar, met aantal.
     2. Wat er mis is met de rest — geen intake, of een fase die niet
        meer bestaat. Rustig, in meta-tekst, want dat is opruimwerk.
   ═══════════════════════════════════════════════════════════════ */
function tekenBuitenBord(){
  const klaarEl = document.getElementById('pp_klaar');
  const hint    = document.getElementById('pp_geenfase');
  if(!klaarEl && !hint) return;

  const alle = kandGefilterd();
  /* Buiten het bord = geen positie in CRM.PHASES. Uitval valt hier niet onder:
     Afgevallen en Gestopt stáán in PHASES, ze krijgen alleen geen kolom. Hun
     stand staat in de regel onder het bord. */
  const buiten = alle.filter(c => CRM.faseIdx(c.fase) < 0);
  /* Een fase die niet meer bestaat is een datafout, geen werkvoorraad — die
     eerst apart zetten, zodat zo iemand niet stilzwijgend als "klaar" wordt
     meegeteld. */
  const onbekendIds = new Set(buiten.filter(c => c.fase && !CRM.faseIs(c.fase, 'Intake')).map(c => String(c.id)));
  const onbekend = onbekendIds.size;
  const rest   = buiten.filter(c => !onbekendIds.has(String(c.id)));
  const klaar  = rest.filter(CRM.klaarOmVoorTeStellen);
  const golden = klaar.filter(c => c.golden).length;
  /* Wat overblijft: een kaart zonder fase en zonder intake. Dat is de import
     uit het oude ATS — niet klaar om voor te stellen, wel op te ruimen. */
  const geenIntake = rest.length - klaar.length;

  const filterActief = !!(P.q || P.klant || P.rec || P.vac || P.type || P.mijn);
  const waar = filterActief ? 'in je selectie' : 'in het systeem';

  if(klaarEl){
    /* Eén regel, geen kader. Dit stond eerst als knop over de volle breedte;
       dat las als een grijze doos in plaats van als informatie, en het week af
       van de regel eronder die precies hetzelfde soort mededeling doet.
       Een zin met een link erin valt genoeg op en houdt de kop rustig. */
    klaarEl.innerHTML = klaar.length ? `
      <p class="pp-klaarregel">
        <b class="num">${klaar.length}</b> ${klaar.length===1?'kandidaat is':'kandidaten zijn'}
        <b>klaar om voor te stellen</b> — intake gehad, nog aan geen klant gekoppeld${
          golden ? `, waarvan ${golden} met een gouden ster` : ''}.
        <button class="lnk" id="pp_klaarknop">Bekijk ze bij Kandidaten →</button>
      </p>` : '';
    const knop = klaarEl.querySelector('#pp_klaarknop');
    /* Meegegeven filterstand, zodat Kandidaten meteen op deze groep kan
       openen. Kent die module de sleutel (nog) niet, dan land je gewoon op
       het kandidatenoverzicht — dat is geen doodlopende klik. */
    if(knop) knop.onclick = () => CRM.ga('kandidaten', {status:'klaar'});
  }

  if(hint){
    const delen = [];
    if(geenIntake) delen.push(`${geenIntake} ${geenIntake===1?'kandidaat heeft':'kandidaten hebben'} nog geen fase en geen intake`);
    if(onbekend)   delen.push(`${onbekend} ${onbekend===1?'kandidaat staat':'kandidaten staan'} op een fase die niet meer bestaat`);
    hint.innerHTML = delen.length
      ? `<span class="meta">${delen.join(' · ')} ${h(waar)} — <a href="#kandidaten">bekijk ze bij Kandidaten</a>.</span>` : '';
  }
}

/* ═══════════════════════════════════════════════════════════════
   LIJSTWEERGAVE
   Dezelfde kandidaten en dezelfde filters als het bord, maar dan als
   tabel. Wat het toevoegt: op het bord zie je per kolom hoe druk het is,
   maar niet wie er over de kolommen heen het langst stilstaat — daar
   moet je dan elke kolom voor langs. De lijst zet dat standaard bovenaan
   en laat je verder sorteren op klant, fase, afspraak en AM.
   ═══════════════════════════════════════════════════════════════ */

/* Datum die er voor deze kandidaat toe doet: bij een plaatsing de start,
   anders de eerstvolgende afspraak. Zelfde regel als op de kaart. */
const eerstDatum = c => (CRM.PLACED.includes(CRM.faseNorm(c.fase)) ? c.start : c.datum) || '';
const vacTekst   = c => { const v = vacById(c.vacatureId); return (v && v.functie) || c.functie || ''; };

const LIJST_KOL = [
  {k:'naam',  lbl:'Kandidaat',    std:'op'},
  {k:'klant', lbl:'Klant',        std:'op'},
  {k:'vac',   lbl:'Vacature',     std:'op'},
  {k:'fase',  lbl:'Fase',         std:'op'},
  {k:'dagen', lbl:'In fase',      std:'af', num:true},
  {k:'eerst', lbl:'Eerstvolgende',std:'op'},
  {k:'am',    lbl:'AM',           std:'op'}
];
/* Sorteersleutels. Lege waarden krijgen bewust een sleutel die ze achteraan
   zet bij oplopend sorteren: een kandidaat zonder klant of zonder afspraak is
   geen 'A', maar een gat in de gegevens. */
const LIJST_SLEUTEL = {
  naam:  c => String(c.naam||'').toLowerCase(),
  klant: c => String(c.klant||'zzzz').toLowerCase(),
  vac:   c => (vacTekst(c) || 'zzzz').toLowerCase(),
  fase:  c => CRM.faseIdx(c.fase),
  dagen: c => { const n = dagenInFase(c); return n == null ? -1 : n; },
  eerst: c => eerstDatum(c) || '9999-99-99',
  am:    c => String(c.rec||'zzzz').toLowerCase()
};

function lijstGesorteerd(){
  const sleutel = LIJST_SLEUTEL[L.kol] || LIJST_SLEUTEL.dagen;
  const richting = L.op === 'af' ? -1 : 1;
  const naam = c => String(c.naam||'').toLowerCase();
  return kandGefilterd().filter(opBord).sort((a,b) => {
    const x = sleutel(a), y = sleutel(b);
    if(x < y) return -1*richting;
    if(x > y) return  1*richting;
    return naam(a).localeCompare(naam(b), 'nl');   // altijd dezelfde volgorde bij gelijkspel
  });
}

function lijstRij(c){
  const dg = dagenInFase(c);
  /* Exact dezelfde norm als de chip op de kaart (FASE_NORM), zodat bord en
     lijst hetzelfde zeggen over stilstand — inclusief de reden in de tooltip. */
  const sf = stilstandFase(c.fase, dg);
  const dgCls = !sf ? '' : sf.klas === 'red' ? 'pp-stil' : 'pp-let';
  const dd = eerstDatum(c);
  const placed = CRM.PLACED.includes(CRM.faseNorm(c.fase));
  let eerst = `<span class="pp-mist">nog te plannen</span>`;
  if(dd && geldigDatum(dd)){
    const dt = daysTo(dd);
    const cls = placed ? 'start' : dt === 0 ? 'vandaag' : dt === 1 ? 'morgen' : dt < 0 ? 'gemist' : '';
    const wat = placed ? 'Start' : 'Afspraak';
    const txt = (!placed && dt === 0) ? 'vandaag' : (!placed && dt === 1) ? 'morgen' : CRM.fmtDay(dd);
    eerst = `<span class="pp-eerst ${cls}"><span class="num">${h(txt)}</span>
      <small>${h(wat)}${(!placed && c.tijd) ? ' · ' + h(c.tijd) : ''}${(!placed && dt < 0) ? ' — gemist' : ''}</small></span>`;
  }else if(dd){
    eerst = `<span class="pp-mist">datum onleesbaar</span>`;
  }
  const leeg = t => `<span class="pp-mist">${h(t)}</span>`;
  return `<tr class="clickable" data-id="${h(c.id)}">
    <td><b>${h(c.naam)}</b>${c.woonplaats?`<div class="rowsub">${h(c.woonplaats)}</div>`:''}</td>
    <td>${c.klant ? h(c.klant) : leeg('geen klant')}</td>
    <td>${vacTekst(c) ? h(vacTekst(c)) : leeg('geen vacature')}</td>
    <td><button class="pp-fase" data-move="${h(c.id)}" title="Naar een andere fase verplaatsen">
      <i class="dot" style="background:${CRM.faseKleur(c.fase)}"></i>${h(CRM.faseNorm(c.fase))}</button></td>
    <td class="n"><span class="num ${dgCls}"${sf?` title="${h(sf.waarom)}"`:''}>${dg == null ? '—' : dg + 'd'}</span></td>
    <td>${eerst}</td>
    <td>${c.rec ? h(c.rec) : leeg('—')}</td>
  </tr>`;
}

function tekenLijst(){
  const wrap = document.getElementById('pp_lijst');
  if(!wrap) return;
  const d = D();
  const rijen = lijstGesorteerd();

  const pijl = k => L.kol !== k ? '' : (L.op === 'af' ? ' ↓' : ' ↑');
  const kop = LIJST_KOL.map(k =>
    `<th class="sortable ${k.num?'n':''}" data-sort="${k.k}"
       aria-sort="${L.kol===k.k ? (L.op==='af'?'descending':'ascending') : 'none'}">${h(k.lbl)}${pijl(k.k)}</th>`).join('');

  let body;
  if(!rijen.length){
    body = '';
  }else if(P.groep){
    /* Groeperen per klant werkt hier hetzelfde als op het bord: de sortering
       blijft staan, er komt alleen een kop per klant tussen. */
    const volgorde = [], groepen = {};
    rijen.forEach(c => { const k = c.klant || '— geen klant'; if(!groepen[k]){ groepen[k] = []; volgorde.push(k); } groepen[k].push(c); });
    body = volgorde.map(k =>
      `<tr class="pp-grprij"><td colspan="${LIJST_KOL.length}">${h(k)} <span class="num">· ${groepen[k].length}</span></td></tr>` +
      groepen[k].map(lijstRij).join('')).join('');
  }else{
    body = rijen.map(lijstRij).join('');
  }

  /* Uitleg alleen als er iets te sorteren valt — bij een lege selectie is het
     een zin over niets. */
  const stdSort = L.kol === SORT_STD.kol && L.op === SORT_STD.op;
  const uitleg = !rijen.length ? ''
    : stdSort
    ? 'Gesorteerd op langst in dezelfde fase — bovenaan staat wat het langst stilstaat. Klik een kolomkop om anders te sorteren.'
    : 'Klik een kolomkop om anders te sorteren.';

  const K = CRM.kandidaten();
  const nAfg = K.filter(c => c.fase === 'Afgevallen').length;
  const nStp = K.filter(c => c.fase === 'Gestopt').length;

  wrap.innerHTML = `
    <div class="pp-lijstkop">
      <span class="meta">${h(rijen.length)} ${rijen.length===1?'traject':'trajecten'} in beeld</span>
      <span class="meta">${h(uitleg)}</span>
    </div>
    ${rijen.length ? `<div class="tblwrap"><table class="tbl pp-tbl">
      <thead><tr>${kop}</tr></thead><tbody>${body}</tbody></table></div>`
      : CRM.ui.leeg('Geen lopende trajecten',
          'Met deze filters staat er niemand tussen Voorgesteld en Gestart.')}
    <div class="pp-lijstvoet">
      <span class="meta">Uitval: <b class="num">${nAfg}</b> afgevallen · <b class="num">${nStp}</b> gestopt</span>
      <button class="btn ghost sm" id="pp_uitopen">Uitval openen →</button>
    </div>`;

  wrap.querySelector('#pp_uitopen').onclick = () => d.openUitval();
  CRM.$$('th[data-sort]', wrap).forEach(th => th.onclick = () => {
    const k = th.dataset.sort;
    const def = (LIJST_KOL.find(x => x.k === k) || {}).std || 'op';
    /* Zelfde kolom nog eens = omdraaien; een nieuwe kolom start in de richting
       die voor die kolom logisch is (dagen aflopend, namen oplopend). */
    if(L.kol === k) L.op = L.op === 'op' ? 'af' : 'op';
    else { L.kol = k; L.op = def; }
    tekenLijst();
  });
  CRM.$$('tr[data-id]', wrap).forEach(tr => tr.onclick = e => {
    if(e.target.closest('[data-move]')) return;
    bewaarPositie(tr.dataset.id);
    CRM.ga('kandidaten', {id:tr.dataset.id});
  });
  CRM.$$('[data-move]', wrap).forEach(b => b.onclick = e => { e.stopPropagation(); CRM.kandidaatFasePicker(b.dataset.move); });
}

/* De fase-picker zelf woont in recruitment.js, naast faseWissel en de
   poortwachters — bord, lijst en kandidatenkaart gebruiken dezelfde
   (CRM.kandidaatFasePicker). */

/* VERZOEK AAN KANDIDATEN (31 jul 2026): de stilstandnorm staat sinds vandaag
   per fase in FASE_NORM hierboven, met de reden erbij, in plaats van vlak 4/10
   dagen voor alles. De kandidatenkaart toont dezelfde "dagen in fase" met de
   oude vlakke grenzen; zolang dat zo blijft zegt de kaart iets anders dan het
   bord over dezelfde kandidaat. FASE_NORM is bewust één object — geef een
   seintje, dan zet ik hem in CRM._rcDeel zodat jullie hem kunnen lezen.      */

/* VERZOEK AAN CORE: de vacatures-tabel heeft in productie voor alle 50 rijen
   een lege `locatie`. Daardoor valt bij CRM.matchScore() de reisafstand altijd
   terug op naamvergelijking en scoort elke match puur op functiewoorden. Het
   bord merkt dat niet, maar de Sourcing-kaart en de matchpercentages worden er
   minder waard van. Vacatures een locatie geven (of overnemen van de klant)
   maakt CRM.afstandKm() pas echt bruikbaar.                                   */

/* VERZOEK AAN COORDINATOR (naamswijziging Pijplijn → Klanttrajecten,
   31 juli 2026). De modulesleutel blijft 'pijplijn'; alleen de zichtbare naam
   verandert. Wat hier niet aangepast kon worden:

   1. js/kandidaten.js r.589-600 — de knop "← Terug naar het bord". Je komt nu
      net zo goed uit de lijstweergave, dus "← Terug naar Klanttrajecten" dekt
      het beter.
   2. js/recruitment.js r.1752 — de modaltekst bij een nieuwe kandidaat zegt
      "Komt in Intake: de eerste kolom op het bord". Intake is geen kolom van
      dit bord meer; die kandidaat komt in de recruitmentpijplijn terecht.
      Zolang dat er staat lijkt het alsof de kaart verdwijnt.
   3. js/finance.js r.841/876/1591 — het scenario heet daar `bron:'pijplijn'`.
      Interne sleutel, hoeft niet mee, maar de labels eromheen ("van het
      bord") kunnen verwarrend worden nu er twee borden zijn.
   4. De verwijzingen naar "het bord" in js/opvolging.js, js/dashboard.js en
      js/finance.js gaan bijna allemaal over dít scherm. Ze kloppen nog, maar
      het woord dekt sinds de splitsing twee schermen.

   VERZOEK AAN KANDIDATEN: de regel "klaar om voor te stellen" hierboven
   navigeert met CRM.ga('kandidaten', {status:'klaar'}). Bedoeling: het
   kandidatenoverzicht opent gefilterd op CRM.klaarOmVoorTeStellen (intake
   gehad, faseIdx === -1, niet afgevallen/gestopt). Kent die module de sleutel
   niet, dan land je gewoon op het volledige overzicht — geen fout, wel een
   halve klik. Let op: CRM.ga zet alleen `id` in de hash, dus zo'n filterstand
   overleeft geen herlaad. Zou core een tweede parameter in de hash kunnen
   meenemen, dan wordt zo'n doorklik ook deelbaar.                            */
})();
