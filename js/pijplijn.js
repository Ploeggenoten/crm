/* ═══════════════════════════════════════════════════════════════
   MODULE: PIJPLIJN — het ATS-bord als eigen menu-item
   Kanban vanaf Intake, met uitvalstrook, week-indeling in de
   kolommen, groeperen per klant, compact-weergave en de mobiele
   fase-picker. Gedrag en formules 1-op-1 het pijplijnbord
   (PARITEIT-BORD.md); verhuisd vanuit js/recruitment.js.

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
/* Alleen de uitval leeft buiten het bord (in Recruitment). Intake is wél een
   echte pijplijnfase — de werkvoorraad waar de videocall gepland wordt — en
   staat daarom als eerste kolom gewoon op het bord. */
const bordFases = () => CRM.PHASES.filter(p => !UITVAL.includes(p.k));
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

/* ─── Filteren ────────────────────────────────────────────────── */
function kandGefilterd(){
  const q = norm(P.q);
  return CRM.kandidaten().filter(c => {
    if(P.klant && c.klant !== P.klant) return false;
    if(P.rec && c.rec !== P.rec) return false;
    if(P.vac && String(c.vacatureId) !== P.vac) return false;
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
  title:'Pijplijn', icon:'▥', onderschrift:'Het bord — van Intake tot Gestart',
  volleBreedte:true,
  render(mount, acties){
    if(!CRM._rcDeel || !CRM.kandidaatBewerk){
      mount.innerHTML = `<div class="note err">De recruitment-module is niet geladen — de pijplijn kan niet zonder.</div>`;
      return;
    }
    /* Gedeelde flows (drawer, fasewissel, intake) vernieuwen het bord
       via deze haak — zie tekenBody() in recruitment.js. */
    CRM._pijplijnVernieuw = () => { tekenBalk(); tekenKolommen(); };

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
          <div id="pp_geenfase" class="rc-geenfase"></div>
        </div>
        <div class="rc-bordwrap ${isCompact()?'compact':''}"><div class="board" id="rb_board"></div><div class="rc-uit" id="rb_uit"></div></div>
      </div>`;

    const q = mount.querySelector('#rb_q');
    q.oninput = CRM.debounce(() => { P.q = q.value; tekenKolommen(); }, 200);
    mount.querySelector('#rb_klant').onchange = e => { P.klant = e.target.value; tekenKolommen(); };
    mount.querySelector('#rb_rec').onchange   = e => { P.rec   = e.target.value; tekenKolommen(); };
    mount.querySelector('#rb_type').onchange  = e => { P.type  = e.target.value.replace('&amp;','&'); tekenKolommen(); };
    mount.querySelector('#rb_vac').onchange   = e => { P.vac   = e.target.value; tekenKolommen(); };
    mount.querySelector('#rb_mijn').onchange  = e => { P.mijn  = e.target.checked; tekenKolommen(); };
    mount.querySelector('#rb_groep').onchange = e => { P.groep = e.target.checked; tekenKolommen(); };

    tekenActies(acties);
    tekenBalk();
    tekenKolommen();
    herstelPositie();
    D().promoteerStarts().then(n => { if(n){ tekenBalk(); tekenKolommen(); } });
  }
});

function tekenActies(acties){
  const el = acties || document.getElementById('pageacties');
  if(!el) return;
  el.innerHTML = `<button class="btn ghost sm" id="pp_dicht">${isCompact()?'Ruime weergave':'Compacte weergave'}</button>
                  <button class="btn ghost sm" id="pp_oo">+ O&amp;O-sessie</button>
                  <button class="btn sm" id="pp_kand">+ Kandidaat</button>`;
  el.querySelector('#pp_dicht').onclick = () => {
    localStorage.setItem('crm_rc_compact', isCompact() ? '0' : '1');
    tekenActies(); pasDichtheidToe();
  };
  el.querySelector('#pp_oo').onclick = () => D().ooModal(null);
  /* Kwam van het vervallen tabblad Voorselectie: een kandidaat aanmaken start
     in de eerste kolom van dit bord, dus hoort de knop hier. */
  el.querySelector('#pp_kand').onclick = () => D().nieuweKandidaat();
}

/* ─── Netto-KPI-regel boven het bord ──────────────────────────── */
function tekenBalk(){
  const el = document.getElementById('pp_bar'); if(!el) return;
  const K = CRM.kandidaten();
  /* c.fase truthy: golden candidates zonder fase horen niet op het bord. */
  const lopend = K.filter(c => c.fase && !CRM.DONE.includes(c.fase));
  const gesprek = lopend.filter(c => ['O&O sessie','Eerste gesprek','Tweede gesprek','Meeloopdag'].includes(c.fase)).length;
  const [ma, zo] = D().weekGrens();
  const startsWeek = K.filter(c => CRM.PLACED.includes(c.fase) && c.start &&
    new Date(c.start) >= ma && new Date(c.start) < zo).length;
  const pm = CRM.plaatsingenMaand(), target = CRM.maandTarget();
  const it = (lbl, waarde, extra='', klasse='') =>
    `<div class="rc-it ${klasse}"><div class="label">${h(lbl)}</div>
       <div class="rc-v num">${waarde}</div>${extra?`<div class="meta">${extra}</div>`:''}</div>`;
  el.innerHTML =
    it('Op het bord', lopend.length, 'vanaf Intake') +
    it('In gesprek', gesprek, 'O&amp;O t/m meeloopdag') +
    it('Starts deze week', startsWeek, 'geplande startdatums') +
    it('Netto deze maand', `${CRM.plusMin(pm.netto)}<span class="rc-van">/ ${target}</span>`,
       `${pm.getekend.length} getekend${pm.gestopt.length ? ' · ' + CRM.plusMin(-pm.gestopt.length) + ' gestopt' : ''}`,
       pm.netto >= target ? 'goed' : '');
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
  const kanIntake = CRM.faseIn(c.fase, ['Intake','Voorgesteld']);
  const chips = [];
  if(c.type) chips.push(`<span class="chip">${h(c.type)}</span>`);
  else if(placed) chips.push(`<span class="chip amber" title="Type W&S of Flex ontbreekt — nodig voor de facturatie">type?</span>`);
  if(c.bron) chips.push(`<span class="chip">${h(c.bron)}</span>`);
  if(c.herstartVan) chips.push(`<span class="chip purple" title="Heraangeboden — de eerdere uitkomst blijft op de oude kaart geregistreerd">herstart</span>`);
  if(c.vervangt) chips.push(`<span class="chip blue" title="Vervanger voor een gestopte plaatsing">vervanger</span>`);
  if(c.noShows) chips.push(`<span class="chip red num" title="No-shows">${h(c.noShows)}× no-show</span>`);
  if(dg != null && dg >= 4 && !CRM.DONE.includes(c.fase)){
    if(c.fase === 'In de wacht') chips.push(`<span class="chip num" title="In de wacht telt niet als blijven hangen">${dg}d</span>`);
    else chips.push(`<span class="chip ${dg>=10?'red':'amber'} num" title="Dagen in deze fase">${dg}d in fase</span>`);
  }
  if(d.intakeDone(c)){ const ic = c.intake.cijfer;
    chips.push(`<span class="chip ${ic&&ic<7?'amber':'green'} num" title="${ic&&ic<7?'Afhaakrisico — commitment '+h(ic)+'/10':'Intake gedaan'}">intake ${ic?h(ic)+'/10':'✓'}</span>`);
  }
  if(placed && c.garantieMnd > 0){ const ge = d.garantieEnd(c);
    if(ge && ge >= CRM.todayISO()) chips.push(`<span class="chip green num" title="Garantietermijn">garantie t/m ${h(CRM.fmtDateShort(ge))}</span>`);
  }
  if(c.fase === 'Gestart' && c.start && !c.gestoptOp){
    const nd = CRM.dagenGeleden(c.start);
    if(nd != null && nd >= 0 && nd <= 32){
      const cp = [3,14,30].find(x => x >= nd);
      if([3,14,30].includes(nd)) chips.push(`<span class="chip red num" title="Nazorg-belritme dag 3·14·30">check-in vandaag · dag ${nd}</span>`);
      else if(cp) chips.push(`<span class="chip num" title="Nazorg-belritme dag 3·14·30">dag ${nd} · check-in dag ${cp}</span>`);
    }
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
    ${kanIntake?`<button class="btn ghost sm rc-intakebtn" data-intake="${h(c.id)}">Video-intake</button>`:''}
    <button class="btn ghost sm rc-move" data-move="${h(c.id)}">Verplaatsen naar fase…</button>
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
  const wees = list.filter(c => !c.ooId || !d.ooSessie(c.ooId));
  if(wees.length) uit += `<div class="rc-wdiv">Zonder sessie</div>` + wees.map(kaartHtml).join('');
  return uit;
}

function tekenKolommen(){
  const board = document.getElementById('rb_board'), uit = document.getElementById('rb_uit');
  if(!board) return;
  const d = D();
  const alle = kandGefilterd();
  /* Intake staat er ook in: het is de videocall-lijst, dus de weekindeling
     laat meteen zien welke calls wanneer staan — en zet alles zónder datum
     bij elkaar onder "Nog te plannen". */
  const WEEKCOLS = ['Intake','Eerste gesprek','Tweede gesprek','Meeloopdag','Contract ondertekenen','Contract getekend','Gestart'];
  const nm = c => String(c.naam||'');
  const byDate = (a,b) => {
    const x = a.datum||'', y = b.datum||'';
    if(!x && !y) return nm(a).localeCompare(nm(b));
    if(!x) return 1; if(!y) return -1;
    return x < y ? -1 : x > y ? 1 : nm(a).localeCompare(nm(b));
  };
  board.innerHTML = bordFases().map(p => {
    /* faseIs i.p.v. ===: kandidaten die nog op de oude waarde 'Voorselectie'
       staan horen gewoon in de Intake-kolom (zie CRM.faseNorm in data.js). */
    let kaarten = alle.filter(c => CRM.faseIs(c.fase, p.k)).sort(byDate);
    if(p.k === 'Contract getekend' || p.k === 'Gestart')
      kaarten = kaarten.slice().sort((a,b) => { const x = a.start||'9999', y = b.start||'9999'; return x<y?-1:x>y?1:nm(a).localeCompare(nm(b)); });
    let binnen;
    if(p.k === 'O&O sessie') binnen = ooKolom(kaarten);
    else if(P.groep) binnen = klantGroepen(kaarten);
    else if(WEEKCOLS.includes(p.k)) binnen = weekGroepen(kaarten, p.k);
    else binnen = kaarten.map(kaartHtml).join('');
    if(p.k === 'Gestart'){
      const [ma, zo] = d.weekGrens();
      const dz = kaarten.filter(c => c.start && new Date(c.start) >= ma && new Date(c.start) < zo).length;
      binnen = `<div class="rc-startnote num">Deze week: ${dz} start${dz===1?'':'s'}</div>` + binnen;
    }
    /* Verhuisd van het oude tabblad Voorselectie: zonder geplande call
       vervuilt de lijst, dus dat signaal blijft bovenaan de kolom staan. */
    if(p.k === 'Intake'){
      const geenCall = kaarten.filter(c => !c.datum).length;
      if(geenCall) binnen = `<div class="rc-letnote num">${geenCall}× zonder geplande videocall</div>` + binnen;
    }
    const leeg = p.k === 'Intake' ? 'Nieuwe sollicitanten komen hier binnen — plan de videocall erbij'
      : p.k === 'Voorgesteld' ? 'Stel kandidaten voor vanuit Intake' : '—';
    return `<div class="bcol" data-fase="${h(p.k)}" style="--ph:${p.c}">
      <div class="bcol-h"><b>${h(p.k)}</b><span class="cnt num">${kaarten.length}</span></div>
      <div class="bcol-b">${binnen || `<div class="rc-leegkol">${h(leeg)}</div>`}</div>
    </div>`;
  }).join('');

  /* Wie valt buiten het bord? Kandidaten zonder fase (import uit het oude ATS)
     en kandidaten met een fase die niet meer bestaat, staan in géén enkele
     kolom. Die mogen niet stilletjes blijven liggen, dus we melden ze altijd —
     niet alleen als er toevallig een filter aanstaat. Golden candidates staan
     bewust zonder fase geparkeerd; die tellen we apart en zonder alarm. */
  const zonderFase = alle.filter(c => !c.fase);
  const goldenLos  = zonderFase.filter(c => c.golden).length;
  const losseKand  = zonderFase.length - goldenLos;
  const onbekend   = alle.filter(c => c.fase && CRM.faseIdx(c.fase) < 0).length;
  const filterActief = !!(P.q || P.klant || P.rec || P.vac || P.type || P.mijn);
  const waar = filterActief ? 'in je selectie' : 'in het systeem';
  const delen = [];
  if(losseKand) delen.push(`${losseKand} ${losseKand===1?'kandidaat heeft':'kandidaten hebben'} geen fase
    en ${losseKand===1?'staat':'staan'} dus niet op het bord`);
  if(onbekend) delen.push(`${onbekend} ${onbekend===1?'kandidaat staat':'kandidaten staan'} op een fase die niet meer bestaat`);
  if(goldenLos) delen.push(`${goldenLos} golden candidate${goldenLos===1?'':'s'} ${goldenLos===1?'staat':'staan'} bewust geparkeerd`);
  const hint = document.getElementById('pp_geenfase');
  if(hint){
    hint.innerHTML = delen.length
      ? `<span class="meta">${delen.join(' · ')} ${h(waar)} — <a href="#kandidaten">bekijk ze bij Kandidaten</a>.</span>` : '';
  }

  /* Smalle uitvalstrook naast het bord: cijfers + sleepdoelen. */
  const K = CRM.kandidaten();
  const nAfg = K.filter(c => c.fase === 'Afgevallen').length;
  const nStp = K.filter(c => c.fase === 'Gestopt').length;
  /* Vervangers in één doorloop indexeren — d.repOf() loopt zelf opnieuw
     door alle kandidaten, dus per gestopte kandidaat opnieuw aanroepen
     werd bij 350 rijen onnodig duur. */
  const vervangt = new Set(K.map(c => c.vervangt).filter(Boolean).map(String));
  const nVerv = K.filter(c => d.owesReplacement(c) && !vervangt.has(String(c.id))).length;
  uit.innerHTML = `<div class="label" style="padding:0 4px 6px">Uitval</div>` + UITVAL.map(f => {
    const n = f === 'Afgevallen' ? nAfg : nStp;
    return `<div class="rc-uitzone" data-fase="${h(f)}" style="--ph:${CRM.faseKleur(f)}">
      <b>${h(f)}</b><span class="num">${n}</span>
      <span class="meta">sleep hierheen</span></div>`;
  }).join('') +
  (nVerv ? `<div class="rc-uitverv"><span class="chip red num">${nVerv}× vervanging nodig</span></div>` : '') +
  `<button class="btn ghost sm" id="rb_uitopen" style="width:100%;justify-content:center">Uitval openen →</button>`;
  uit.querySelector('#rb_uitopen').onclick = () => d.openUitval();

  CRM.$$('.bcard', board).forEach(k => {
    k.ondragstart = e => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('drag'); };
    k.ondragend   = () => k.classList.remove('drag');
    /* Klik = de VOLLEDIGE kandidatenkaart (wens Tjeerd, 30 jul 2026), niet
       meer het smalle bewerkpaneel van het oude pijplijnbord. Positie eerst
       bewaren, zodat "← Terug naar het bord" je precies terugzet. */
    k.onclick = e => {
      if(e.target.closest('[data-intake],[data-move]')) return;
      bewaarPositie(k.dataset.id);
      CRM.ga('kandidaten', {id:k.dataset.id});
    };
  });
  CRM.$$('[data-intake]', board).forEach(b => b.onclick = e => { e.stopPropagation(); d.intakeForm(b.dataset.intake); });
  CRM.$$('[data-move]', board).forEach(b => b.onclick = e => { e.stopPropagation(); CRM.kandidaatFasePicker(b.dataset.move); });
  CRM.$$('[data-oo]', board).forEach(b => b.onclick = e => { e.stopPropagation(); d.ooModal(b.dataset.oo); });
  CRM.$$('.bcol, .rc-uitzone', board.parentElement).forEach(zone => {
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

/* De fase-picker zelf woont in recruitment.js, naast faseWissel en de
   poortwachters — bord en kandidatenkaart gebruiken dezelfde
   (CRM.kandidaatFasePicker). */

/* VERZOEK AAN CORE: de vacatures-tabel heeft in productie voor alle 50 rijen
   een lege `locatie`. Daardoor valt bij CRM.matchScore() de reisafstand altijd
   terug op naamvergelijking en scoort elke match puur op functiewoorden. Het
   bord merkt dat niet, maar de Sourcing-kaart en de matchpercentages worden er
   minder waard van. Vacatures een locatie geven (of overnemen van de klant)
   maakt CRM.afstandKm() pas echt bruikbaar.                                   */
})();
