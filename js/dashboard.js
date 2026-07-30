/* ═══════════════════════════════════════════════════════════════
   MODULE: DASHBOARD — de startpagina
   Eén blik = weten wat er vandaag speelt en hoe we ervoor staan.
   Rustig, weinig kleur, alles klikt door naar de juiste module.
   Bedragen staan strikt achter CRM.canSeeMoney().
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h   = CRM.h;
const DAG = 86400000;
const dISO   = t => new Date(t).toLocaleDateString('sv-SE');
const kort   = s => String(s||'').slice(0,10);
const actief = c => !['Afgevallen','Gestopt'].includes(c.fase);

const VANDAAG = () => CRM.todayISO();
const MORGEN  = () => dISO(Date.now()+DAG);

/* Taken die in deze sessie zijn afgevinkt — tellen mee in de voortgang,
   ook als hun datum vóór vandaag lag (achterstallige taak alsnog gedaan). */
const sessieAf = new Set();

/* Maandag t/m zondag van de huidige week. */
function weekBereik(){
  const d = new Date(); d.setHours(0,0,0,0);
  const van = new Date(d.getTime() - ((d.getDay()+6)%7)*DAG);
  return { van:dISO(van), tot:dISO(new Date(van.getTime()+6*DAG)) };
}
const inBereik = (x,van,tot) => { const s = kort(x); return !!s && s>=van && s<=tot; };

/* ─── Financiële cijfers (alleen Tjeerd) ──────────────────────────
   De fin_*-tabellen horen bij de finance-app en hebben hun eigen,
   striktere RLS. Lukt het lezen niet, dan tonen we simpelweg niets —
   geen foutmelding, want voor het team hoort hier niets te staan. */
let _fin = null;
async function finLezen(){
  if(_fin) return _fin;
  if(!CRM.canSeeMoney()) return (_fin = {ok:false});
  /* In demo blijft de echte database buiten beeld — anders staan er
     bij een nog actieve sessie zomaar echte omzetcijfers op een testscherm. */
  if(CRM.demo) return (_fin = {ok:false});
  try{
    const [p,i] = await Promise.all([
      CRM.sb.from('fin_placements').select('id,klant,fee_excl,contract_datum,gestopt_op'),
      CRM.sb.from('fin_installments').select('placement_id,bedrag_excl,geplande_datum,factuurdatum,status')
    ]);
    if(p.error || i.error) return (_fin = {ok:false});
    const placements = p.data||[], termijnen = i.data||[];
    if(!placements.length && !termijnen.length) return (_fin = {ok:false});
    return (_fin = {ok:true, placements, termijnen});
  }catch(e){ return (_fin = {ok:false}); }
}

/* ═══ MIJN DAG ═══════════════════════════════════════════════════ */
function mijnDag(){
  const nu = VANDAAG(), mor = MORGEN(), mij = CRM.me();
  const cs = CRM.kandidaten();
  const G = { afspraken:[], taken:[], leads:[], acties:[], nazorg:[] };

  /* Afspraken vandaag en morgen (kandidaten met datum/tijd). */
  cs.filter(c => actief(c) && (kort(c.datum)===nu || kort(c.datum)===mor))
    .sort((a,b)=> String(a.datum+a.tijd).localeCompare(String(b.datum+b.tijd)))
    .forEach(c => G.afspraken.push({
      titel:c.naam,
      sub:(c.functie||'') + (c.klant?' · '+c.klant:''),
      wanneer:(kort(c.datum)===nu?'Vandaag':'Morgen') + (c.tijd?' '+c.tijd:''),
      urgent: kort(c.datum)===nu,
      go:{mod:'kandidaten', id:c.id}
    }));

  /* Taken van mij: vandaag en achterstallig. */
  (CRM.state.taken||[])
    .filter(t => !t.klaar && (!t.voor || t.voor===mij) && kort(t.datum) && kort(t.datum) <= nu)
    .sort((a,b)=>String(a.datum).localeCompare(String(b.datum)))
    .forEach(t => {
      const over = kort(t.datum) < nu;
      /* Kandidaat-refs zijn ids — laat de naam zien, niet 'demo9'. */
      const refNaam = t.entiteit==='kandidaat' ? ((CRM.kandidaat(t.ref)||{}).naam || t.ref) : (t.ref||'');
      /* Taak van een collega gekregen: stil "van Tjerk" erbij. */
      const van = (t.door && t.door !== mij) ? 'van ' + String(t.door).split(/\s+/)[0] : '';
      G.taken.push({
        titel:t.tekst, sub:[refNaam, van].filter(Boolean).join(' · '),
        wanneer: over ? 'Achterstallig · '+CRM.fmtDateShort(t.datum) : 'Vandaag',
        urgent: over, taak:t,
        go: t.entiteit==='klant' ? {mod:'klanten', id:t.ref}
          : t.entiteit==='kandidaat' ? {mod:'kandidaten', id:t.ref}
          : t.entiteit==='lead' ? {mod:'recruitment', id:t.ref} : null
      });
    });

  /* Leads die opvolging nodig hebben. */
  (CRM.state.leads||[])
    .filter(l => CRM.LEAD_OPEN.includes(l.status))
    .map(l => {
      const gepland = !!kort(l.opvolgen_op) && kort(l.opvolgen_op) <= nu;
      const oud     = l.status==='Nieuw' && (CRM.dagenGeleden(l.binnen_op)||0) >= 2;
      return (gepland||oud) ? {l, gepland, dagen:CRM.dagenGeleden(l.binnen_op)||0} : null;
    })
    .filter(Boolean)
    .sort((a,b)=>b.dagen-a.dagen)
    .forEach(x => G.leads.push({
      titel:x.l.naam,
      sub:(x.l.functie||'') + (x.l.bron?' · '+x.l.bron:''),
      wanneer: x.gepland ? 'Opvolgen ingepland' : 'Binnen ' + CRM.geleden(x.l.binnen_op),
      urgent: x.dagen >= 3,
      go:{mod:'recruitment', id:x.l.id}
    }));

  /* Kandidaten met een volgende actie die over datum is. */
  cs.filter(c => actief(c) && c.volgendeActie && kort(c.actieDatum) && kort(c.actieDatum) < nu)
    .sort((a,b)=>String(a.actieDatum).localeCompare(String(b.actieDatum)))
    .forEach(c => G.acties.push({
      titel:c.volgendeActie, sub:c.naam + (c.fase?' · '+c.fase:''),
      wanneer:'Stond op ' + CRM.fmtDateShort(c.actieDatum), urgent:true,
      kandidaat:c, go:{mod:'kandidaten', id:c.id}
    }));

  /* Nazorg: dag 3, 14 en 30 na de startdatum van gestarte kandidaten. */
  cs.filter(c => c.fase==='Gestart').forEach(c => {
    const start = kort(c.start) || kort(c.geplaatstOp);
    const n = CRM.dagenGeleden(start);
    if(n==null || n < 0) return;
    const mijlpaal = [3,14,30].find(m => n===m || n===m+1);
    if(!mijlpaal) return;
    G.nazorg.push({
      titel:'Nazorg dag '+mijlpaal+' — '+c.naam,
      sub:(c.klant||'') + (c.functie?' · '+c.functie:''),
      wanneer:'Gestart ' + CRM.geleden(start), urgent:false,
      go:{mod:'kandidaten', id:c.id}
    });
  });

  G.totaal = G.afspraken.length + G.taken.length + G.leads.length + G.acties.length + G.nazorg.length;
  return G;
}

/* Eén regel uit "Mijn dag" — tekst, geen plaatjes. Regels zonder afvinkbare
   taak krijgen een klein neutraal stipje zodat de kolom blijft uitlijnen. */
function dagRegel(it){
  const vink = it.taak      ? `<input type="checkbox" class="dag-vink" data-taak="${h(it.taak.id)}" title="Afvinken">`
             : it.kandidaat ? `<input type="checkbox" class="dag-vink" data-cactie="${h(it.kandidaat.id)}" title="Afvinken">`
             : `<span class="dag-stip${it.urgent?' urgent':''}"></span>`;
  const klik = it.go ? ` data-mod="${h(it.go.mod)}" data-id="${h(it.go.id||'')}"` : '';
  return `<div class="dag-item${it.go?' klik':''}${it.urgent?' urgent':''}"${klik}>
    ${vink}
    <div class="dag-t"><b>${h(it.titel)}</b>${it.sub?`<span class="dag-s">${h(it.sub)}</span>`:''}</div>
    <span class="dag-w num">${h(it.wanneer||'')}</span>
  </div>`;
}

/* Welke groepen staan uitgeklapt? Bewaard per gebruiker in localStorage. */
const UITKLAP_KEY = 'crm_dash_uitklap';
function uitklapLezen(){
  try{ const v = JSON.parse(localStorage.getItem(UITKLAP_KEY)); return (v && typeof v==='object') ? v : null; }
  catch(e){ return null; }
}
function uitklapBewaren(st){
  try{ localStorage.setItem(UITKLAP_KEY, JSON.stringify(st)); }catch(e){}
}

/* ═══ MELDINGEN — collegiale berichten, geen alarmen ═════════════ */
function meldingenBlok(){
  const ms = CRM.mijnMeldingen();
  if(!ms.length) return '';
  return `<div class="dash-sec"><div class="label sec-kop">Voor jou</div>
    <div class="card meld-card"><div class="card-b meld-b">
      ${ms.slice(0,6).map(m => `<div class="meld-rij" data-meld="${h(m.id)}" data-ent="${h(m.entiteit||'')}" data-ref="${h(m.ref||'')}">
        <span class="meld-stip"></span>
        <div class="meld-t"><span class="meld-tekst">${h(m.tekst)}</span>
          <span class="meld-w meta num">${h(CRM.geleden(m.created_at))}</span></div>
        <button type="button" class="meld-af" data-af="${h(m.id)}" title="Gezien, afhandelen">✓</button>
      </div>`).join('')}
      ${ms.length>6?`<div class="meta" style="padding:6px 0 2px">en nog ${ms.length-6} …</div>`:''}
    </div></div></div>`;
}

/* Bij klik op een taak-melding: de groep "Mijn taken" openen en tonen. */
function toonTakenGroep(){
  const g = document.querySelector('.dag-groep[data-groep="taken"]');
  if(!g) return;
  g.classList.remove('dicht');
  const kop = g.querySelector('.dag-kop');
  if(kop) kop.setAttribute('aria-expanded','true');
  const chev = g.querySelector('.dag-chev');
  if(chev) chev.textContent = '▾';
  g.scrollIntoView({behavior:'smooth', block:'center'});
  g.classList.add('flits');
  setTimeout(()=>g.classList.remove('flits'), 1400);
}

/* ═══ DAGFOCUS — voortgang van mijn taken vandaag ════════════════ */
function taakCijfers(){
  const nu = VANDAAG(), mij = CRM.me();
  const mijn = (CRM.state.taken||[]).filter(t => !t.voor || t.voor===mij);
  const open = mijn.filter(t => !t.klaar && kort(t.datum) && kort(t.datum) <= nu).length;
  const af   = mijn.filter(t => t.klaar && (kort(t.datum)===nu || sessieAf.has(String(t.id)))).length;
  return {open, af, totaal: open+af};
}
function voortgangHTML(){
  const c = taakCijfers();
  if(!c.totaal) return '';
  const pct = Math.round(c.af/c.totaal*100);
  return `<div class="dag-vg" id="dag_vg">
    <span class="meta num" id="dag_vgt">${c.af} van ${c.totaal} ${c.totaal===1?'taak':'taken'} afgerond vandaag</span>
    <div class="bar dag-vgbar"><i id="dag_vgb" style="width:${pct}%"></i></div>
  </div>`;
}
function vernieuwVoortgang(){
  const c = taakCijfers();
  const t = document.getElementById('dag_vgt'), b = document.getElementById('dag_vgb');
  if(!t || !b) return;
  t.textContent = `${c.af} van ${c.totaal} ${c.totaal===1?'taak':'taken'} afgerond vandaag`;
  b.style.width = (c.totaal ? Math.round(c.af/c.totaal*100) : 0) + '%';
}

function dagBlok(G){
  const groepen = [
    ['afspraken','Afspraken'], ['taken','Mijn taken'], ['acties','Actie over datum'],
    ['leads','Leads opvolgen'], ['nazorg','Nazorg']
  ].filter(([k]) => G[k].length);

  const taakKnop = `<button class="btn ghost sm" id="dag_nieuw">+ Taak</button>`;

  if(!groepen.length){
    return `<div class="card dag-card"><div class="card-h"><div class="h2">Mijn dag</div>
        ${voortgangHTML()}<span class="spacer"></span>${taakKnop}</div>
      <div class="card-b">${CRM.ui.leeg('Niets openstaand','Geen afspraken, taken of achterstallige acties voor vandaag. Mooi moment om nieuwe leads te bellen.')}</div></div>`;
  }

  /* Standaard: de eerste twee groepen met inhoud open, de rest dicht.
     Een eerder gekozen stand (localStorage) wint van de standaard. */
  const bewaard = uitklapLezen();
  const open = k => {
    if(bewaard && k in bewaard) return !!bewaard[k];
    return groepen.findIndex(([g]) => g===k) < 2;
  };

  return `<div class="card dag-card">
    <div class="card-h"><div class="h2">Mijn dag</div>
      <span class="chip">${G.totaal} ${G.totaal===1?'punt':'punten'}</span>
      ${voortgangHTML()}
      <span class="spacer"></span>
      ${CRM.outlook.beschikbaar() && !CRM.outlook.verbonden()
        ? '<button class="btn ghost sm" id="dash_outlook">Outlook verbinden</button>' : ''}
      <button class="btn ghost sm" id="dag_nieuw">+ Taak</button></div>
    <div class="card-b dag-b">
      ${groepen.map(([k,lbl]) => {
        const op = open(k);
        return `<div class="dag-groep${op?'':' dicht'}" data-groep="${h(k)}">
        <button type="button" class="dag-kop" data-klap="${h(k)}" aria-expanded="${op}">
          <span class="dag-chev">${op?'▾':'▸'}</span>
          <span class="label">${h(lbl)}</span><span class="meta num">${G[k].length}</span>
        </button>
        <div class="dag-inhoud">
          ${G[k].slice(0,8).map(dagRegel).join('')}
          ${G[k].length>8?`<div class="dag-meer meta">en nog ${G[k].length-8} …</div>`:''}
        </div>
      </div>`;}).join('')}
    </div></div>`;
}

/* ═══ KERNCIJFERS — aantallen, voor iedereen zichtbaar ═══════════ */
function kerncijfers(){
  const cs = CRM.kandidaten();
  const wk = weekBereik();
  const {getekend, gestopt, netto} = CRM.plaatsingenMaand();
  const target   = CRM.maandTarget();
  const pijplijn = cs.filter(c => actief(c) && !CRM.PLACED.includes(c.fase)).length;
  const lopend   = cs.filter(c => CRM.PLACED.includes(c.fase)).length;
  const nieuweLeads = (CRM.state.leads||[]).filter(l => inBereik(l.binnen_op, wk.van, wk.tot)).length;
  const vacs = (CRM.state.vacs||[]).filter(v => (v.status||'Open')==='Open');
  const posities = vacs.reduce((s,v)=>s+(Number(v.aantal)||1),0);
  const pct = target>0 ? Math.round(netto/target*100) : 0;

  return `<div class="grid c4 dash-kpis">
    ${CRM.ui.kpi('Plaatsingen deze maand', `<span class="num">${netto}</span><span class="kpi-van"> / ${target}</span>`,
      `${CRM.ui.bar(pct, pct>=100?'green':(pct>=60?'':'amber'))}
       <span class="meta num">${getekend.length} getekend · ${gestopt.length} gestopt</span>`, 'accent')}
    ${CRM.ui.kpi('In de pijplijn', `<span class="num">${pijplijn}</span>`,
      `<span class="meta num">${lopend} geplaatst en lopend</span>`)}
    ${CRM.ui.kpi('Nieuwe leads deze week', `<span class="num">${nieuweLeads}</span>`,
      `<span class="meta">${h(CRM.fmtDateShort(wk.van))} — ${h(CRM.fmtDateShort(wk.tot))}</span>`)}
    ${CRM.ui.kpi('Open vacatures', `<span class="num">${vacs.length}</span>`,
      `<span class="meta num">${posities} posities te vullen</span>`)}
  </div>`;
}

/* ═══ ALLEEN VOOR TJEERD: omzet ══════════════════════════════════ */
function geldBlok(fin){
  if(!fin || !fin.ok || !CRM.canSeeMoney()) return '';
  const mk = new Date().toLocaleDateString('sv-SE').slice(0,7);
  const bet = t => Number(t.bedrag_excl)||0;

  const gefactureerd = (fin.termijnen||[]).filter(t =>
    ['gefactureerd','betaald'].includes(t.status) && kort(t.factuurdatum || t.geplande_datum).slice(0,7)===mk);
  const omzet = gefactureerd.reduce((s,t)=>s+bet(t),0);

  const open = (fin.termijnen||[]).filter(t => t.status==='te_factureren' || t.status==='gefactureerd');
  const openWaarde   = open.reduce((s,t)=>s+bet(t),0);
  const teFactureren = open.filter(t=>t.status==='te_factureren').reduce((s,t)=>s+bet(t),0);

  return `<div class="dash-sec"><div class="label sec-kop">Alleen voor jou</div>
    <div class="grid c4 dash-geld">
      ${CRM.ui.kpi('Gefactureerd deze maand', `<span class="num">${h(CRM.euro(omzet))}</span>`,
        `<span class="meta num">${gefactureerd.length} termijnen</span>`, 'accent')}
      ${CRM.ui.kpi('Openstaande waarde', `<span class="num">${h(CRM.euro(openWaarde))}</span>`,
        `<span class="meta num">${h(CRM.euro(teFactureren))} nog te factureren</span>`)}
    </div></div>`;
}

/* ═══ WAT LOOPT ER — compact per module ══════════════════════════ */
function watLooptEr(){
  const cs = CRM.kandidaten(), wk = weekBereik();
  const kansen  = (CRM.state.kansen||[]).filter(k => (k.status||'open')==='open');
  const klanten = CRM.state.clients||[];
  const inTraject   = klanten.filter(k => CRM.SALES_ACTIEF.includes(k.fase)).length;
  const voorstellen = klanten.filter(k => ['Voorstel gedaan','SWO gestuurd','Onderhandeling'].includes(k.fase)).length;

  const leads = CRM.state.leads||[];
  const openLeads = leads.filter(l => CRM.LEAD_OPEN.includes(l.status)).length;
  const pijplijn  = cs.filter(actief).length;
  const gesprekken= cs.filter(c => actief(c) && inBereik(c.datum, wk.van, wk.tot)).length;

  const leadsWeek = leads.filter(l => inBereik(l.binnen_op, wk.van, wk.tot));
  const perBron = {};
  leadsWeek.forEach(l => { const b = l.bron||'Onbekend'; perBron[b] = (perBron[b]||0)+1; });
  const beste = Object.entries(perBron).sort((a,b)=>b[1]-a[1])[0];
  const opgepakt = leads.length ? Math.round(leads.filter(l=>l.status!=='Nieuw').length / leads.length * 100) : 0;

  const kaart = (mod, titel, cijfers) => `<div class="card mod-kaart" data-mod="${h(mod)}">
    <div class="card-b">
      <div class="mod-kop"><span class="label">${h(titel)}</span><span class="mod-link">bekijken →</span></div>
      <div class="mod-cijfers">${cijfers.map(([n,l])=>
        `<div><div class="mod-n num">${h(String(n))}</div><div class="meta">${h(l)}</div></div>`).join('')}</div>
    </div></div>`;

  return `<div class="dash-sec"><div class="label sec-kop">Wat loopt er</div>
    <div class="grid c3">
      ${kaart('sales','Sales',[[kansen.length,'open kansen'],[inTraject,'klanten in traject'],[voorstellen,'voorstellen uit']])}
      ${kaart('recruitment','Recruitment',[[openLeads,'open leads'],[pijplijn,'in de pijplijn'],[gesprekken,'gesprekken deze week']])}
      ${kaart('marketing','Marketing',[[leadsWeek.length,'leads deze week'],[beste?beste[0]:'—','beste bron'],[opgepakt+'%','leads opgepakt']])}
    </div></div>`;
}

/* ═══ SIGNALEN — alleen wat echt speelt, max 5 ═══════════════════ */
/* Sinds wanneer staat een kandidaat in zijn huidige fase? */
function faseSinds(c){
  const eigen = (c.historie||[]).filter(x => x.fase===c.fase);
  if(eigen.length) return kort(eigen[eigen.length-1].op);
  return kort(c.since);
}

function signalen(){
  const cs = CRM.kandidaten(), sig = [];
  const vroeg = cs.filter(c => ['Voorselectie','Voorgesteld'].includes(c.fase)).length;

  if(vroeg < 3) sig.push({t:'De instroom is laag',
    s:`Maar ${vroeg} ${vroeg===1?'kandidaat staat':'kandidaten staan'} in voorselectie of voorgesteld. Over twee weken merk je dat in de plaatsingen.`,
    mod:'recruitment'});

  const stil = cs.filter(c => actief(c) && (CRM.dagenGeleden(faseSinds(c))||0) > 10);
  if(stil.length) sig.push({t:`${stil.length} ${stil.length===1?'kandidaat staat':'kandidaten staan'} langer dan 10 dagen stil`,
    s:'Zelfde fase, geen beweging. Nabellen of doorzetten naar de volgende stap.', mod:'recruitment'});

  const koud = (CRM.state.clients||[]).filter(k =>
    ['Afgerond'].concat(CRM.SALES_ACTIEF).includes(k.fase) && (CRM.dagenGeleden(k.laatst_contact)||0) > 30);
  if(koud.length) sig.push({t:`${koud.length} ${koud.length===1?'klant heeft':'klanten hebben'} ruim 30 dagen geen contact gehad`,
    s: koud.slice(0,3).map(k=>k.naam).join(', ') + (koud.length>3?' en meer':''), mod:'klanten'});

  const wees = (CRM.state.leads||[]).filter(l => CRM.LEAD_OPEN.includes(l.status) && !String(l.eigenaar||'').trim());
  if(wees.length) sig.push({t:`${wees.length} ${wees.length===1?'lead heeft':'leads hebben'} geen eigenaar`,
    s:'Niemand pakt ze op. Verdeel ze even.', mod:'recruitment'});

  const dun = cs.filter(c => actief(c) && CRM.volledigheid(c).pct < 60);
  if(dun.length) sig.push({t:`${dun.length} ${dun.length===1?'kandidaat mist':'kandidaten missen'} basisgegevens`,
    s:'Telefoon, woonplaats of bron ontbreekt — dat maakt matchen en meten onbetrouwbaar.', mod:'kandidaten'});

  if(!sig.length) return '';
  return `<div class="dash-sec"><div class="label sec-kop">Signalen</div>
    <div class="card"><div class="card-b sig-b">
      ${sig.slice(0,5).map(x=>`<div class="sig klik" data-mod="${h(x.mod)}">
        <span class="sig-dot"></span>
        <div class="sig-t"><b>${h(x.t)}</b><div class="sub">${h(x.s)}</div></div>
        <span class="sig-pijl">→</span></div>`).join('')}
    </div></div></div>`;
}

/* ═══ SAMENVATTENDE ZIN ══════════════════════════════════════════ */
function dagZin(G){
  const d = [];
  const nu = G.afspraken.filter(a => a.wanneer.indexOf('Vandaag')===0).length;
  if(nu) d.push(`${nu} ${nu===1?'gesprek':'gesprekken'} vandaag`);
  const over = G.taken.filter(t=>t.urgent).length;
  if(over) d.push(`${over} ${over===1?'taak staat':'taken staan'} over datum`);
  else if(G.taken.length) d.push(`${G.taken.length} ${G.taken.length===1?'taak':'taken'} voor vandaag`);
  if(G.leads.length) d.push(`${G.leads.length} ${G.leads.length===1?'lead wacht':'leads wachten'} op opvolging`);
  if(G.acties.length) d.push(`${G.acties.length} ${G.acties.length===1?'kandidaat wacht':'kandidaten wachten'} op je actie`);
  if(!d.length) return 'Geen openstaande punten. Rustige dag om vooruit te werken.';
  return d.slice(0,3).join(', ').replace(/,([^,]*)$/, ' en$1') + '.';
}

function groet(){
  const u = new Date().getHours();
  return u < 6 ? 'Goedenacht' : u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond';
}

/* ═══ AFVINKEN ═══════════════════════════════════════════════════
   Geen volledige herteken: de rij wordt direct doorgestreept-gedempt
   en de voortgangsbalk loopt op. Dat voelt af, zonder gespring.     */
function rijAf(cb){
  if(!cb) return;
  cb.checked = true; cb.disabled = true;
  const rij = cb.closest('.dag-item');
  if(rij){ rij.classList.add('af'); rij.classList.remove('urgent','klik'); rij.onclick = null; }
}

async function taakAfvinken(id, cb){
  const t = (CRM.state.taken||[]).find(x => String(x.id)===String(id));
  if(!t) return;
  t.klaar = true;
  sessieAf.add(String(t.id));
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_taken').update({klaar:true}).eq('id', t.id);
    if(error){
      t.klaar = false; sessieAf.delete(String(t.id));
      if(cb) cb.checked = false;
      return CRM.fout('Afvinken mislukt', error);
    }
  }
  rijAf(cb);
  vernieuwVoortgang();
  CRM.toast('Taak afgerond','ok');
  CRM.navBadges();
}

async function actieAfvinken(id, cb){
  const rij = (CRM.state.cands||[]).find(c => String(c.id)===String(id));
  if(!rij) return;
  const oud = {a:rij.volgende_actie, d:rij.actie_datum};
  rij.volgende_actie = ''; rij.actie_datum = null;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update({volgende_actie:null, actie_datum:null}).eq('id', rij.id);
    if(error){
      rij.volgende_actie = oud.a; rij.actie_datum = oud.d;
      if(cb) cb.checked = false;
      return CRM.fout('Afvinken mislukt', error);
    }
  }
  rijAf(cb);
  CRM.toast('Actie afgerond','ok');
  CRM.navBadges();
}

/* ═══ REGISTRATIE ════════════════════════════════════════════════ */
CRM.registerModule('dashboard', {
  title:'Dashboard', icon:'◧', onderschrift:'Overzicht van vandaag',
  /* Zijbalkteller: ongelezen meldingen + mijn open taken van vandaag. */
  badge(){ try{
    const nu = CRM.todayISO(), mij = CRM.me();
    const openTaken = (CRM.state.taken||[]).filter(t =>
      !t.klaar && (!t.voor || t.voor===mij) && kort(t.datum) && kort(t.datum) <= nu).length;
    return CRM.mijnMeldingen().length + openTaken;
  }catch(e){ return 0; } },

  render(mount, acties){
    const G = mijnDag();
    const naam = String(CRM.me()||'').split(/\s+/)[0] || '';

    if(acties) acties.innerHTML = `<button class="btn ghost sm" id="dash_ver">Vernieuwen</button>`;

    mount.innerHTML = `
      <div class="dash">
        <section class="dash-hero">
          <div class="meta num dash-datum">${h(new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</div>
          <div class="h1">${h(groet())}${naam?', '+h(naam):''}</div>
          <p class="dash-zin">${h(dagZin(G))}</p>
        </section>

        ${meldingenBlok()}
        ${dagBlok(G)}
        ${kerncijfers()}
        <div id="dash_geld"></div>
        ${watLooptEr()}
        ${signalen()}
      </div>`;

    const ver = document.getElementById('dash_ver');
    if(ver) ver.onclick = () => CRM.herlaad();

    /* + Taak: het gedeelde taakvenster (voor jezelf óf een collega). */
    const nieuw = document.getElementById('dag_nieuw');
    if(nieuw) nieuw.onclick = async () => {
      const rij = await CRM.taakModal({});
      if(rij && CRM.view==='dashboard') CRM.render();
    };

    /* Meldingen: ✓ handelt af, klik op de regel navigeert naar de bron. */
    CRM.$$('[data-af]', mount).forEach(b => b.onclick = async e => {
      e.stopPropagation();
      await CRM.meldingGelezen(b.dataset.af);
      const rij = b.closest('.meld-rij'), card = b.closest('.dash-sec');
      if(rij) rij.remove();
      if(card && !card.querySelector('.meld-rij')) card.remove();
    });
    CRM.$$('.meld-rij', mount).forEach(r => {
      r.onclick = e => {
        if(e.target.closest('[data-af]')) return;
        const ent = r.dataset.ent, ref = r.dataset.ref;
        if(ent==='klant') CRM.ga('klanten',{id:ref});
        else if(ent==='kandidaat') CRM.ga('kandidaten',{id:ref});
        else if(ent==='lead') CRM.ga('recruitment',{id:ref});
        else toonTakenGroep();
      };
    });

    /* Outlook: verbinden-knop, en bij een verbonden account de afspraken van
       vandaag stilletjes bijmengen in de groep Afspraken. */
    const ob = document.getElementById('dash_outlook');
    if(ob) ob.onclick = async () => { if(await CRM.outlook.verbind()) CRM.render(); };
    if(CRM.outlook.beschikbaar() && CRM.outlook.verbonden()){
      CRM.outlook.agenda(1).then(items => {
        if(!items || !items.length || CRM.view!=='dashboard') return;
        const rijen = items.map(e => {
          const tijd = String(e.start||'').slice(11,16);
          return `<div class="dag-item">
            <span class="dag-stip"></span>
            <div class="dag-t"><b>${h(e.titel||'(zonder onderwerp)')}</b>
              <span class="dag-s">Outlook${e.locatie?' · '+h(e.locatie):''}${
                e.online?` · <a href="${h(e.online)}" target="_blank" rel="noopener">Teams</a>`:''}</span></div>
            <span class="dag-w num">${h(tijd)}</span>
          </div>`;
        }).join('');
        const groep = mount.querySelector('.dag-groep[data-groep="afspraken"] .dag-inhoud');
        if(groep) groep.insertAdjacentHTML('afterbegin', rijen);
        else {
          const b = mount.querySelector('.dag-b');
          if(b) b.insertAdjacentHTML('afterbegin', `<div class="dag-groep">
            <button type="button" class="dag-kop" disabled style="cursor:default">
              <span class="dag-chev">▾</span><span class="label">Agenda vandaag</span>
              <span class="meta num">${items.length}</span></button>
            <div class="dag-inhoud">${rijen}</div></div>`);
        }
      }).catch(()=>{});
    }

    /* Doorklikken naar de juiste module. */
    CRM.$$('[data-mod]', mount).forEach(el => {
      el.onclick = e => {
        if(e.target.classList && e.target.classList.contains('dag-vink')) return;
        CRM.ga(el.dataset.mod, el.dataset.id ? {id:el.dataset.id} : {});
      };
    });

    /* Groepen in- en uitklappen; de stand wordt onthouden. */
    CRM.$$('[data-klap]', mount).forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const k = btn.dataset.klap;
        const groep = btn.closest('.dag-groep');
        const dicht = groep.classList.toggle('dicht');
        btn.setAttribute('aria-expanded', String(!dicht));
        const chev = btn.querySelector('.dag-chev');
        if(chev) chev.textContent = dicht ? '▸' : '▾';
        const st = uitklapLezen() || {};
        st[k] = !dicht;
        uitklapBewaren(st);
      };
    });

    /* Direct afvinken. */
    CRM.$$('.dag-vink', mount).forEach(cb => {
      cb.onclick = e => e.stopPropagation();
      cb.onchange = () => {
        if(cb.dataset.taak) taakAfvinken(cb.dataset.taak, cb);
        else if(cb.dataset.cactie) actieAfvinken(cb.dataset.cactie, cb);
      };
    });

    /* Omzet nalezen — alleen voor Tjeerd, en alleen als het lukt. */
    if(CRM.canSeeMoney()){
      finLezen().then(fin => {
        const el = document.getElementById('dash_geld');
        if(el && CRM.view==='dashboard') el.innerHTML = geldBlok(fin);
      }).catch(()=>{});
    }
  }
});

})();
