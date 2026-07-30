/* ═══════════════════════════════════════════════════════════════
   MODULE: FINANCE — alleen zichtbaar voor Tjeerd.
   Toont álle relevante data uit de finance-app in het rustige
   CRM-jasje: Vandaag, Plaatsingen & termijnen, Flex, Cashflow en
   Kosten. Het REKENWERK en de instellingen blijven in de
   finance-app — bewerken en wat-als gebeurt dáár.

   Privacy: de fin_*-tabellen hebben RLS waardoor alleen Tjeerd ze
   kan lezen. Deze module is bovendien adminOnly, dus het team ziet
   hem niet eens staan. Dubbele grens: database én interface.
   ═══════════════════════════════════════════════════════════════ */

(function(){
'use strict';

const FIN_APP = 'https://ploeggenoten.github.io/ploeggenoten-finance/';
/* De finance-app heeft (nog) geen hash-router; de hash is onschadelijk
   en maakt de bedoeling per knop duidelijk. */
const finLink = (view, lbl, klasse='btn ghost sm') =>
  `<a class="${klasse}" href="${FIN_APP}${view?'#'+view:''}" target="_blank" rel="noopener">${CRM.h(lbl)} ↗</a>`;

const MND = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const mkLabel = mk => { const [y,m] = String(mk).split('-').map(Number); return MND[m-1] + " '" + String(y).slice(2); };
const mkPlus  = (mk,n) => { const [y,m] = String(mk).split('-').map(Number);
  return new Date(Date.UTC(y, m-1+n, 1)).toISOString().slice(0,7); };

/* Let op: de finance-app noemt de termijnkolom `bedrag_excl`, niet `bedrag`. */
const bedragVan = i => Number(i.bedrag_excl||0);

/* ─── Data laden (fouttolerant per tabel) ─────────────────────── */
let _fin = null, _finFout = null, _mist = [];

function legeFin(){
  return { placements:[], installments:[], saldi:[], settings:{}, yukiOpen:[],
           flexWeken:[], flexPl:[], flexAfspr:[], budget:[], actuals:[] };
}

async function veiligQ(tabel){
  try{
    const r = await CRM.sb.from(tabel).select('*');
    if(r.error){ _mist.push(tabel); if(!_finFout) _finFout = r.error; return null; }
    return r.data || [];
  }catch(e){ _mist.push(tabel); if(!_finFout) _finFout = e; return null; }
}

async function finLaad(force=false){
  /* Interne testhaak: zet in de console `CRM._finMock = {placements:[…],…}`
     en roep CRM.render() aan om de renderpaden zonder echte data te testen. */
  if(CRM._finMock) return Object.assign(legeFin(), {demo:false}, CRM._finMock);
  if(_fin && !force) return _fin;
  if(CRM.demo){ _fin = Object.assign(legeFin(), {demo:true}); return _fin; }

  _mist = []; _finFout = null;
  const [pl, inst, sal, st, yo, fw, fp, fa, bud, act] = await Promise.all([
    veiligQ('fin_placements'),   veiligQ('fin_installments'), veiligQ('fin_bank_saldo'),
    veiligQ('fin_settings'),     veiligQ('fin_yuki_open'),    veiligQ('fin_flex_weken'),
    veiligQ('fin_flex_plaatsingen'), veiligQ('fin_flex_afspraken'),
    veiligQ('fin_costs_budget'), veiligQ('fin_costs_actual')
  ]);
  /* Alle kerntabellen geblokkeerd (RLS) of onbereikbaar → helemaal geen data. */
  if(pl===null && inst===null && sal===null){ _fin = null; return _fin; }
  _fin = {
    demo:false,
    placements:   pl||[],
    installments: inst||[],
    saldi:        (sal||[]).slice().sort((a,b)=>String(b.datum).localeCompare(String(a.datum))),
    settings:     Object.fromEntries((st||[]).map(r=>[r.key, r.value])),
    /* fin_yuki_open heeft een `soort`-kolom: debiteur | crediteur. */
    yukiOpen:     yo||[],
    flexWeken:    (fw||[]).slice().sort((a,b)=>String(a.week).localeCompare(String(b.week))),
    flexPl:       fp||[],
    flexAfspr:    fa||[],
    budget:       bud||[],
    actuals:      act||[]
  };
  return _fin;
}

/* ─── Afleidingen (zelfde definities als de finance-app) ──────── */
const insVan = (f, pid) => f.installments.filter(i=>i.placement_id===pid)
  .slice().sort((a,b)=>(a.termijn_nr||0)-(b.termijn_nr||0));

const TERMIJN_ST = {
  te_factureren:{lbl:'te factureren', cls:''},
  gefactureerd:{lbl:'gefactureerd',  cls:'blue'},
  betaald:{lbl:'betaald',            cls:'green'},
  vervallen:{lbl:'vervallen',        cls:'red'}
};
const stChip = s => { const d = TERMIJN_ST[s]||{lbl:s,cls:''};
  return `<span class="chip ${d.cls}">${CRM.h(d.lbl)}</span>`; };

function plStatus(p, ins){
  if(p.concept) return {lbl:'concept — fee bevestigen', cls:'amber'};
  const act  = ins.filter(i=>i.status!=='vervallen');
  const nGef = act.filter(i=>i.status==='gefactureerd'||i.status==='betaald').length;
  const nBet = act.filter(i=>i.status==='betaald').length;
  if(!act.length)              return {lbl:'geen termijnen', cls:''};
  if(nBet===act.length)        return {lbl:'volledig betaald', cls:'green'};
  if(nGef===act.length)        return {lbl:'volledig gefactureerd', cls:'blue'};
  if(nGef>0)                   return {lbl:'deels gefactureerd', cls:'blue'};
  return {lbl:'nog niets gefactureerd', cls:''};
}

/* Flex: marge/uur = (klantfactor − inkoopfactor) × uurloon.
   `marge_werkelijk` (uit de Pronkert-facturen) is leidend als hij gevuld is. */
function flexAfspraakVoor(f, klant){
  return f.flexAfspr.find(a => CRM.zelfdeKlant(a.klant, klant)) || null;
}
function flexBer(f, fp){
  const afspr  = flexAfspraakVoor(f, fp.klant);
  const inkoopDefault = Number(f.settings.flex_inkoop_factor ?? 1.8);
  const klantfactor = Number(fp.klantfactor) || (afspr ? Number(afspr.factor) : null);
  const inkoop  = Number(fp.inkoop_factor) || (afspr ? Number(afspr.inkoop_factor) : inkoopDefault) || inkoopDefault;
  const uurloon = Number(fp.uurloon) || null;
  const urenPw  = Number(fp.uren_pw) || 40;
  const compleet = !!(klantfactor && uurloon);
  const margePerUur = compleet ? (klantfactor - inkoop) * uurloon : null;
  const uren = fp.gewerkte_uren != null ? Number(fp.gewerkte_uren) : null;
  const margeWerkelijk = fp.marge_werkelijk != null ? Number(fp.marge_werkelijk) : null;
  return {
    klantfactor, inkoop, uurloon, urenPw, compleet, margePerUur, uren, margeWerkelijk,
    margePerMaand: compleet ? margePerUur * urenPw * 52/12 : null,
    verdiend: margeWerkelijk != null ? margeWerkelijk
            : (compleet && uren != null ? margePerUur * uren : null)
  };
}
/* Run-rate weekfacturen: gemiddelde van de laatste 4 weken × 52/12. */
function flexRunRate(f){
  const last4 = f.flexWeken.slice(-4);
  if(!last4.length) return 0;
  return last4.reduce((s,w)=>s+Number(w.bedrag||0),0) / last4.length * 52/12;
}

/* Kosten per maand: budgetposten gelden van `vanaf_maand` t/m `tot_maand`
   (null = doorlopend) — dus per maand filteren, niet alleen 'geldig nu'. */
const budgetVoorMaand = (f, mk) => f.budget
  .filter(b => String(b.vanaf_maand).slice(0,7) <= mk && (!b.tot_maand || String(b.tot_maand).slice(0,7) >= mk))
  .reduce((s,b)=>s+Number(b.bedrag_pm||0),0);
/* Werkelijke kosten: de Yuki-sync schrijft één regel 'Werkelijk totaal (Yuki)'
   per afgesloten maand — die is dan leidend boven de losse posten. */
function actueelVoorMaand(f, mk){
  const rows = f.actuals.filter(a => String(a.maand).slice(0,7)===mk);
  const yuki = rows.find(a => a.categorie === 'Werkelijk totaal (Yuki)');
  if(yuki) return {bedrag:Number(yuki.bedrag), yuki:true};
  if(!rows.length) return null;
  return {bedrag:rows.reduce((s,a)=>s+Number(a.bedrag||0),0), yuki:false};
}

/* ─── Module-state (blijft staan tussen tabwissels) ───────────── */
let _tab = 'vandaag', _zoek = '', _filter = 'alle';
const _open = new Set();       // uitgeklapte plaatsingen

const TABS = [
  {k:'vandaag',     lbl:'Vandaag'},
  {k:'plaatsingen', lbl:'Plaatsingen & termijnen'},
  {k:'flex',        lbl:'Flex'},
  {k:'cashflow',    lbl:'Cashflow'},
  {k:'kosten',      lbl:'Kosten'}
];

function demoLeeg(titel, tekst){
  return `
    <div class="note info" style="margin-bottom:16px">
      <b>Demo-modus.</b> Financiële cijfers komen uit de beveiligde fin_-tabellen en worden
      alleen geladen wanneer je echt bent ingelogd als eigenaar. In de demo blijft dit tabblad
      bewust leeg — dit zijn echte bedrijfscijfers.
    </div>
    ${CRM.ui.leeg(titel, tekst, `<a class="btn ghost" href="${FIN_APP}" target="_blank" rel="noopener">Finance-app openen ↗</a>`)}`;
}

/* ═══ TAB: VANDAAG ═════════════════════════════════════════════ */
function tabVandaag(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen financiële gegevens in demo',
    'Log in met je eigen account om banksaldo, facturatie en signalen te zien.'); return; }

  const mk    = CRM.todayISO().slice(0,7);
  const saldo = f.saldi[0];
  const gefactureerd = f.installments.filter(i => i.status==='gefactureerd');
  const openBedrag   = gefactureerd.reduce((s,i)=>s+bedragVan(i),0);
  const maandIns     = f.installments.filter(i => String(i.geplande_datum||'').slice(0,7)===mk && i.status!=='vervallen');
  const omzetMaand   = maandIns.reduce((s,i)=>s+bedragVan(i),0);
  const omzetMaandGefact = maandIns.filter(i=>i.status!=='te_factureren').reduce((s,i)=>s+bedragVan(i),0);
  const teFactureren = f.installments.filter(i => i.status==='te_factureren' && String(i.geplande_datum||'') <= CRM.todayISO());
  const concepten    = f.placements.filter(p => p.concept);
  /* Yuki bevat debiteuren én crediteuren; hier telt wat klanten nog moeten betalen. */
  const yukiDeb      = f.yukiOpen.filter(r => r.soort==='debiteur').reduce((s,r)=>s+Number(r.open_bedrag||0),0);
  const pl     = CRM.plaatsingenMaand(mk);
  const target = CRM.maandTarget(mk);
  const plById = Object.fromEntries(f.placements.map(p=>[p.id,p]));

  /* Late betalers: gefactureerd, factuur ruim 30 dagen oud, geplande datum ver voorbij. */
  const laat = gefactureerd.filter(i => {
    const d = CRM.dagenGeleden(i.factuurdatum || i.geplande_datum);
    return d != null && d > 30;
  }).sort((a,b)=>String(a.factuurdatum||'').localeCompare(String(b.factuurdatum||'')));

  const acts = [];
  if(concepten.length) acts.push({ico:'✍️', titel:`${concepten.length} plaatsing${concepten.length>1?'en':''} nog te bevestigen`,
    tekst:concepten.map(p=>p.kandidaat||p.klant).join(', ')+' — fee en factuurschema invullen in de finance-app.'});
  if(teFactureren.length) acts.push({ico:'🧾', titel:`${teFactureren.length} termijn${teFactureren.length>1?'en':''} klaar om te factureren`,
    tekst:CRM.euro(teFactureren.reduce((s,i)=>s+bedragVan(i),0)) + ' aan facturen die vandaag of eerder gepland stonden.'});
  laat.forEach(i => {
    const p = plById[i.placement_id];
    acts.push({ico:'⏰', titel:`Late betaler: ${p ? p.klant : 'onbekende klant'}`,
      tekst:`${CRM.euro(bedragVan(i))} · termijn ${i.termijn_nr}${p?.kandidaat ? ' van '+p.kandidaat : ''} — gefactureerd ${CRM.geleden(i.factuurdatum || i.geplande_datum)}.`});
  });
  const laatsteFlex = f.flexWeken.length ? f.flexWeken[f.flexWeken.length-1].week : null;
  if(laatsteFlex && CRM.dagenGeleden(laatsteFlex) > 21) acts.push({ico:'📄', titel:'Flex-week ontbreekt',
    tekst:`Laatste verwerkte Pronkert-week is ${CRM.fmtDate(laatsteFlex)} — dat is ${CRM.dagenGeleden(laatsteFlex)} dagen geleden.`});
  if(!laatsteFlex && f.flexPl.length) acts.push({ico:'📄', titel:'Nog geen flex-weken verwerkt',
    tekst:'Er staan flexkrachten in de finance-app, maar er is nog geen margefactuur geïmporteerd.'});

  el.innerHTML = `
    <div class="grid c4" style="margin-bottom:18px">
      ${CRM.ui.kpi('Banksaldo', saldo ? CRM.euro(saldo.saldo) : '—',
        saldo ? `stand van ${CRM.fmtDate(saldo.datum)}` : 'nog geen saldo bekend', 'accent')}
      ${CRM.ui.kpi('Gepland deze maand', CRM.euro(omzetMaand),
        omzetMaand ? `waarvan ${CRM.euro(omzetMaandGefact)} al gefactureerd of betaald` : 'geen termijnen gepland')}
      ${CRM.ui.kpi('Openstaand', CRM.euro(openBedrag),
        yukiDeb ? `Yuki meldt ${CRM.euro(yukiDeb)} open (incl. btw)` : `${gefactureerd.length} factu${gefactureerd.length===1?'ur':'ren'} verstuurd`)}
      ${CRM.ui.kpi('Plaatsingen', `<span class="num${pl.netto<0?' neg':pl.netto>0?' pos':''}">${pl.netto}</span> <span style="font-size:15px;color:var(--muted)">/ ${target}</span>`,
        `${pl.getekend.length} getekend · ${pl.gestopt.length} gestopt`)}
    </div>

    <div class="grid c2">
      <div class="card">
        <div class="card-h"><div class="h2">Wat vraagt aandacht</div></div>
        <div class="card-b">
          ${acts.length ? CRM.ui.tijdlijn(acts.map(a=>({ico:a.ico, titel:a.titel, tekst:a.tekst, wanneer:''})))
                        : `<div class="note ok">Niets open — facturatie, flex en plaatsingen zijn bij.</div>`}
          ${acts.length ? `<div style="margin-top:14px">${finLink('vandaag','Afhandelen in de finance-app','btn')}</div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-h"><div class="h2">Deze maand getekend</div></div>
        <div class="card-b">
          ${pl.getekend.length ? `<div class="tblwrap" style="border:none">
            <table class="tbl"><tbody>
            ${pl.getekend.map(c=>`<tr>
              <td><b>${CRM.h(c.naam)}</b><div class="rowsub">${CRM.h(c.functie)} · ${CRM.h(c.klant)}</div></td>
              <td class="n"><span class="num meta">${CRM.fmtDateShort(c.geplaatstOp)}</span></td></tr>`).join('')}
            </tbody></table></div>`
            : CRM.ui.leeg('Nog niets getekend deze maand','')}
          ${pl.gestopt.length ? `<div class="note warn" style="margin-top:12px">
            ${pl.gestopt.length} gestopt deze maand: ${pl.gestopt.map(c=>CRM.h(c.naam)).join(', ')}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="note info" style="margin-top:18px">
      Het rekenwerk — facturen zetten, fee bevestigen, wat-als-scenario's en de advies-engine —
      gebeurt in de finance-app. Dit scherm toont de cijfers; bewerken doe je daar.
    </div>`;
}

/* ═══ TAB: PLAATSINGEN & TERMIJNEN ═════════════════════════════ */
function tabPlaatsingen(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen plaatsingen in demo',
    'Hier zie je normaal alle W&S-plaatsingen met hun factuurschema, status per termijn en totalen.'); return; }

  const alle = f.installments;
  const jaar = CRM.todayISO().slice(0,4);
  const pipelineOpen = alle.filter(i=>i.status==='te_factureren').reduce((s,i)=>s+bedragVan(i),0);
  const openstaand   = alle.filter(i=>i.status==='gefactureerd').reduce((s,i)=>s+bedragVan(i),0);
  const betaaldJaar  = alle.filter(i=>i.status==='betaald' && String(i.betaaldatum||'').slice(0,4)===jaar)
                           .reduce((s,i)=>s+bedragVan(i),0);

  el.innerHTML = `
    <div class="grid c3" style="margin-bottom:18px">
      ${CRM.ui.kpi('Pipeline aan open termijnen', CRM.euro(pipelineOpen), 'nog te factureren (excl. btw)')}
      ${CRM.ui.kpi('Gefactureerd — openstaand', CRM.euro(openstaand), 'verstuurd, nog niet betaald', 'accent')}
      ${CRM.ui.kpi('Betaald dit jaar', CRM.euro(betaaldJaar), `ontvangen in ${jaar}`)}
    </div>

    <div class="card">
      <div class="card-h">
        <div class="h2">Alle plaatsingen (W&S)</div>
        <div class="searchbox"><input type="search" id="fin_pl_zoek" placeholder="Zoek kandidaat, klant of functie" value="${CRM.h(_zoek)}"></div>
        <select id="fin_pl_filter" style="width:auto">
          <option value="alle">Alle statussen</option>
          <option value="concept">Concept (fee bevestigen)</option>
          <option value="te_factureren">Met open termijnen</option>
          <option value="gefactureerd">Met gefactureerde termijnen</option>
          <option value="betaald">Met betaalde termijnen</option>
          <option value="vervallen">Met vervallen termijnen</option>
          <option value="gestopt">Gestopt</option>
        </select>
        ${finLink('plaatsingen','Openen in finance-app')}
      </div>
      <div class="card-b" style="padding:0"><div id="fin_pl_tbl"></div></div>
    </div>`;

  el.querySelector('#fin_pl_filter').value = _filter;
  el.querySelector('#fin_pl_zoek').addEventListener('input', CRM.debounce(e=>{
    _zoek = e.target.value; tekenPlTabel(el, f);
  }, 200));
  el.querySelector('#fin_pl_filter').onchange = e => { _filter = e.target.value; tekenPlTabel(el, f); };
  tekenPlTabel(el, f);
}

function tekenPlTabel(el, f){
  const wrap = el.querySelector('#fin_pl_tbl'); if(!wrap) return;
  const z = _zoek.trim().toLowerCase();
  const rows = f.placements
    .filter(p => {
      if(z && ![p.kandidaat,p.klant,p.functie].some(v=>String(v||'').toLowerCase().includes(z))) return false;
      if(_filter==='alle') return true;
      if(_filter==='concept') return !!p.concept;
      if(_filter==='gestopt') return !!p.gestopt_op;
      return insVan(f, p.id).some(i=>i.status===_filter);
    })
    .sort((a,b)=>String(b.contract_datum||b.eerste_factuurdatum||'').localeCompare(String(a.contract_datum||a.eerste_factuurdatum||'')));

  if(!rows.length){
    wrap.innerHTML = CRM.ui.leeg('Geen plaatsingen gevonden',
      z || _filter!=='alle' ? 'Pas je zoekopdracht of filter aan.' : 'Zodra een kandidaat een contract tekent, verschijnt de plaatsing hier.');
    return;
  }

  wrap.innerHTML = `<div class="tblwrap" style="border:none;border-radius:0 0 var(--r-l) var(--r-l)">
    <table class="tbl">
      <thead><tr><th style="width:26px"></th><th>Kandidaat</th><th class="n">Fee excl.</th>
        <th>Status</th><th class="n">Termijnen</th><th class="n">Volgende termijn</th></tr></thead>
      <tbody>
      ${rows.map(p => {
        const ins = insVan(f, p.id);
        const st = plStatus(p, ins);
        const act = ins.filter(i=>i.status!=='vervallen');
        const nGef = act.filter(i=>i.status==='gefactureerd'||i.status==='betaald').length;
        const next = ins.find(i=>i.status==='te_factureren');
        const open = _open.has(p.id);
        return `
        <tr class="clickable fin-plrow" data-pid="${CRM.h(p.id)}">
          <td class="num" style="color:var(--muted)">${open?'▾':'▸'}</td>
          <td><b>${CRM.h(p.kandidaat || '—')}</b>
            <div class="rowsub">${CRM.h([p.functie, p.klant].filter(Boolean).join(' · '))}${p.gestopt_op?` · <span style="color:var(--red)">gestopt ${CRM.fmtDateShort(p.gestopt_op)}</span>`:''}</div></td>
          <td class="n"><span class="num">${p.fee_excl!=null ? CRM.euro(p.fee_excl) : '—'}</span></td>
          <td><span class="chip ${st.cls}">${CRM.h(st.lbl)}</span></td>
          <td class="n"><span class="num">${nGef}/${act.length||p.aantal_termijnen||0}</span> <span class="meta">gefact.</span></td>
          <td class="n">${next ? `<span class="num">${CRM.euro(bedragVan(next))}</span><div class="rowsub num">${CRM.fmtDateShort(next.geplande_datum)}</div>` : '<span class="meta">—</span>'}</td>
        </tr>
        ${open ? `<tr class="fin-plsub"><td></td><td colspan="5">
          ${ins.length ? `<table class="tbl fin-termijnen"><thead>
            <tr><th>#</th><th class="n">Bedrag excl.</th><th class="n">Gepland</th><th>Status</th><th class="n">Gefactureerd</th><th class="n">Betaald</th></tr></thead><tbody>
            ${ins.map(i=>`<tr>
              <td class="num">${i.termijn_nr}</td>
              <td class="n num">${CRM.euro(bedragVan(i))}</td>
              <td class="n num">${i.geplande_datum ? CRM.fmtDateShort(i.geplande_datum) : '—'}</td>
              <td>${stChip(i.status)}</td>
              <td class="n num">${i.factuurdatum ? CRM.fmtDateShort(i.factuurdatum) : '—'}</td>
              <td class="n num">${i.betaaldatum ? CRM.fmtDateShort(i.betaaldatum) : '—'}</td>
            </tr>`).join('')}</tbody></table>`
            : `<div class="meta" style="padding:8px 0">Nog geen factuurschema — ${p.concept ? 'bevestig de fee in de finance-app.' : 'geen termijnen gevonden.'}</div>`}
          <div style="margin:10px 0 4px">${finLink('plaatsingen','Deze plaatsing openen in de finance-app')}</div>
        </td></tr>` : ''}`;
      }).join('')}
      </tbody></table></div>`;

  wrap.querySelectorAll('.fin-plrow').forEach(tr => tr.onclick = () => {
    const id = tr.dataset.pid;
    if(_open.has(id)) _open.delete(id); else _open.add(id);
    tekenPlTabel(el, f);
  });
}

/* ═══ TAB: FLEX ════════════════════════════════════════════════ */
function tabFlex(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen flex-gegevens in demo',
    'Hier zie je normaal de flexkrachten met marge per uur, gewerkte uren en de wekelijkse marge-uitkering van Pronkert.'); return; }

  const actief  = f.flexPl.filter(p=>!p.gestopt_op).map(p=>({p, b:flexBer(f,p)}));
  const gestopt = f.flexPl.filter(p=> p.gestopt_op).map(p=>({p, b:flexBer(f,p)}));
  const compleet = actief.filter(r=>r.b.compleet);
  const margePm = compleet.reduce((s,r)=>s+r.b.margePerMaand,0);
  const verdiendTotaal = [...actief,...gestopt].reduce((s,r)=>s+(r.b.verdiend||0),0);
  const runRate = flexRunRate(f);
  const weken = f.flexWeken.slice(-13);
  const maxW = Math.max(1, ...weken.map(w=>Number(w.bedrag||0)));

  const rij = (r, afgerond) => `
    <tr>
      <td><b>${CRM.h(r.p.kandidaat)}</b>
        <div class="rowsub">${CRM.h(r.p.klant)}${afgerond && r.p.gestopt_op ? ' · gestopt '+CRM.fmtDateShort(r.p.gestopt_op) : ''}${r.p.concept ? ' · <span style="color:var(--amber)">concept</span>' : ''}</div></td>
      <td class="n num">${r.b.uurloon!=null ? CRM.euro(r.b.uurloon,2) : '—'}</td>
      <td class="n num">${r.b.margePerUur!=null ? CRM.euro(r.b.margePerUur,2) : '<span class="meta">factor?</span>'}</td>
      <td class="n num">${r.b.uren!=null ? Math.round(r.b.uren)+' u' : '—'}</td>
      <td class="n">${r.b.verdiend!=null ? `<span class="num">${CRM.euro(r.b.verdiend)}</span>${r.b.margeWerkelijk!=null?' <span class="meta" title="werkelijke marge uit de Pronkert-facturen">✓</span>':''}` : '<span class="meta">—</span>'}</td>
    </tr>`;

  const tabel = (rows, afgerond) => `<div class="tblwrap" style="border:none">
    <table class="tbl"><thead><tr><th>Flexkracht</th><th class="n">Uurloon</th><th class="n">Marge/uur</th>
      <th class="n">Gewerkte uren</th><th class="n">Verdiend</th></tr></thead>
    <tbody>${rows.map(r=>rij(r,afgerond)).join('')}</tbody></table></div>`;

  el.innerHTML = `
    <div class="grid c4" style="margin-bottom:18px">
      ${CRM.ui.kpi('Actieve flexkrachten', `<span class="num">${actief.length}</span>`,
        gestopt.length ? `${gestopt.length} afgerond` : '')}
      ${CRM.ui.kpi('Verwachte marge p/m', CRM.euro(margePm), 'op contracturen (model)', 'accent')}
      ${CRM.ui.kpi('Run-rate p/m', CRM.euro(runRate), 'gemiddelde van de laatste 4 Pronkert-weken')}
      ${CRM.ui.kpi('Verdiend totaal', CRM.euro(verdiendTotaal), 'werkelijke marge waar bekend, anders model')}
    </div>

    <div class="stack">
      <div class="card">
        <div class="card-h"><div class="h2">Actief</div>${finLink('flex','Openen in finance-app')}</div>
        <div class="card-b" style="padding:${actief.length?'0':'20px 24px'}">
          ${actief.length ? tabel(actief,false) : CRM.ui.leeg('Geen actieve flexkrachten','Zodra een flexkracht start, verschijnt hij hier.')}
        </div>
        ${actief.length?`<div class="card-f"><span class="meta">Marge/uur = (klantfactor − inkoopfactor Pronkert) × uurloon. Verdiend = werkelijke marge uit de Pronkert-facturen (✓) of anders marge/uur × gewerkte uren.</span></div>`:''}
      </div>

      ${gestopt.length ? `<div class="card">
        <div class="card-h"><div class="h2">Afgerond</div></div>
        <div class="card-b" style="padding:0">${tabel(gestopt,true)}</div>
      </div>` : ''}

      <div class="card">
        <div class="card-h"><div class="h2">Wekelijkse marge (Pronkert)</div>
          <span class="meta">laatste ${weken.length} weken · run-rate ${CRM.euro(runRate)} p/m</span></div>
        <div class="card-b">
          ${weken.length ? `<div class="fin-bars">
            ${weken.map(w=>`<div class="fb" title="week van ${CRM.fmtDate(w.week)}: ${CRM.euro(w.bedrag)}${w.flexkrachten?` · ${w.flexkrachten} flexkrachten`:''}">
              <i style="height:${Math.max(2, Number(w.bedrag||0)/maxW*100)}%"></i>
              <span class="num">${CRM.fmtDateShort(w.week)}</span></div>`).join('')}
          </div>`
          : CRM.ui.leeg('Nog geen weekfacturen verwerkt','Importeer de Pronkert-margefacturen in de finance-app.')}
        </div>
      </div>
    </div>`;
}

/* ═══ TAB: CASHFLOW ════════════════════════════════════════════ */
function tabCashflow(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen cashflow in demo',
    'Hier zie je normaal een 6-maands vooruitblik: geplande termijnen, flex run-rate, kostenlijn en saldo-projectie.'); return; }

  const mk0 = CRM.todayISO().slice(0,7);
  const maanden = [...Array(6)].map((_,i)=>mkPlus(mk0,i));
  const flexPm = flexRunRate(f);
  const saldoStart = f.saldi[0] ? Number(f.saldi[0].saldo) : null;
  /* Inkomsten = nog niet betaalde, niet vervallen termijnen op hun geplande datum.
     Achterstallige open termijnen (gepland vóór deze maand) tellen in maand 1. */
  const openIns = f.installments.filter(i=>i.status==='te_factureren'||i.status==='gefactureerd');
  const achterstallig = openIns.filter(i=>String(i.geplande_datum||'').slice(0,7) < mk0).reduce((s,i)=>s+bedragVan(i),0);

  let lopend = saldoStart ?? 0;
  const rijen = maanden.map((m,idx) => {
    const ws = openIns.filter(i=>String(i.geplande_datum||'').slice(0,7)===m).reduce((s,i)=>s+bedragVan(i),0)
             + (idx===0 ? achterstallig : 0);
    const kosten = budgetVoorMaand(f, m);
    const netto = ws + flexPm - kosten;
    lopend += netto;
    return {m, ws, kosten, netto, saldo:lopend, metAchterstallig:idx===0 && achterstallig>0};
  });

  el.innerHTML = `
    <div class="grid c3" style="margin-bottom:18px">
      ${CRM.ui.kpi('Startpunt', saldoStart!=null ? CRM.euro(saldoStart) : '—',
        f.saldi[0] ? `banksaldo van ${CRM.fmtDate(f.saldi[0].datum)}` : 'nog geen banksaldo bekend', 'accent')}
      ${CRM.ui.kpi('Flex run-rate', CRM.euro(flexPm), 'per maand, meegeteld in elke maand')}
      ${CRM.ui.kpi('Verwacht saldo over 6 mnd', `<span class="num${rijen[rijen.length-1].saldo<0?' neg':''}">${CRM.euro(rijen[rijen.length-1].saldo)}</span>`,
        rijen.some(r=>r.saldo<0) ? 'let op: de projectie duikt onder nul' : 'op basis van geplande termijnen en budget')}
    </div>

    <div class="card">
      <div class="card-h"><div class="h2">Vooruitblik 6 maanden</div>
        ${finLink('cashflow','Scenario’s en wat-als in de finance-app','btn ghost sm')}</div>
      <div class="card-b" style="padding:0">
        <div class="tblwrap" style="border:none">
        <table class="tbl">
          <thead><tr><th>Maand</th><th class="n">W&amp;S-termijnen</th><th class="n">Flex (run-rate)</th>
            <th class="n">Kosten (budget)</th><th class="n">Netto</th><th class="n">Verwacht saldo</th></tr></thead>
          <tbody>
          ${rijen.map(r=>`<tr>
            <td><b>${mkLabel(r.m)}</b>${r.metAchterstallig?`<div class="rowsub">incl. ${CRM.euro(achterstallig)} achterstallig</div>`:''}</td>
            <td class="n num">${CRM.euro(r.ws)}</td>
            <td class="n num">${CRM.euro(flexPm)}</td>
            <td class="n num">−${CRM.euro(r.kosten).replace('€','€')}</td>
            <td class="n num ${r.netto<0?'neg':r.netto>0?'pos':''}">${r.netto<0?'−':'+'}${CRM.euro(Math.abs(r.netto))}</td>
            <td class="n"><span class="num${r.saldo<0?' neg':''}" style="font-weight:700">${CRM.euro(r.saldo)}</span></td>
          </tr>`).join('')}
          </tbody></table></div>
      </div>
      <div class="card-f"><span class="meta">Indicatief, bedragen excl. btw. Leningen, btw-afdracht en belastingen zitten er niet in —
        het volledige cashflowmodel met scenario's staat in de finance-app.</span></div>
    </div>`;
}

/* ═══ TAB: KOSTEN ══════════════════════════════════════════════ */
function tabKosten(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen kosten in demo',
    'Hier zie je normaal het kostenbudget per post naast de werkelijke kosten uit Yuki, met verschil per maand.'); return; }

  const mk0 = CRM.todayISO().slice(0,7);
  const maanden = [...Array(6)].map((_,i)=>mkPlus(mk0,-5+i));
  const postenNu = f.budget
    .filter(b => String(b.vanaf_maand).slice(0,7) <= mk0 && (!b.tot_maand || String(b.tot_maand).slice(0,7) >= mk0))
    .slice().sort((a,b)=>Number(b.bedrag_pm)-Number(a.bedrag_pm));

  el.innerHTML = `
    <div class="stack">
      <div class="card">
        <div class="card-h"><div class="h2">Budget vs. werkelijk — laatste 6 maanden</div>
          ${finLink('kosten','Openen in finance-app')}</div>
        <div class="card-b" style="padding:0">
          <div class="tblwrap" style="border:none">
          <table class="tbl">
            <thead><tr><th>Maand</th><th class="n">Budget</th><th class="n">Werkelijk</th><th class="n">Verschil</th></tr></thead>
            <tbody>
            ${maanden.map(m=>{
              const bud = budgetVoorMaand(f, m);
              const act = actueelVoorMaand(f, m);
              /* Verschil = budget min werkelijk: positief = onder budget (olijf),
                 negatief = overschrijding (rood) — huisstijlregel plus/min. */
              const diff = act ? bud - act.bedrag : null;
              return `<tr>
                <td><b>${mkLabel(m)}</b>${m===mk0?'<div class="rowsub">lopende maand</div>':''}</td>
                <td class="n num">${CRM.euro(bud)}</td>
                <td class="n">${act ? `<span class="num">${CRM.euro(act.bedrag)}</span>${act.yuki?' <span class="meta" title="Werkelijk totaal (Yuki) — leidend">✓ Yuki</span>':''}` : '<span class="meta">nog niet bekend</span>'}</td>
                <td class="n">${diff==null ? '<span class="meta">—</span>' :
                  `<span class="num ${diff<0?'neg':diff>0?'pos':''}">${diff<0?'−':'+'}${CRM.euro(Math.abs(diff))}</span>`}</td>
              </tr>`;
            }).join('')}
            </tbody></table></div>
        </div>
        <div class="card-f"><span class="meta">Werkelijk = de regel 'Werkelijk totaal (Yuki)' waar aanwezig (✓, automatisch per afgesloten maand), anders de som van handmatige posten. Verschil = budget min werkelijk: negatief betekent overschrijding.</span></div>
      </div>

      <div class="card">
        <div class="card-h"><div class="h2">Budgetposten (geldig deze maand)</div>
          <span class="meta">totaal ${CRM.euro(budgetVoorMaand(f, mk0))} p/m</span></div>
        <div class="card-b" style="padding:${postenNu.length?'0':'20px 24px'}">
          ${postenNu.length ? `<div class="tblwrap" style="border:none">
            <table class="tbl">
              <thead><tr><th>Post</th><th class="n">Per maand</th><th class="n">Geldig</th></tr></thead>
              <tbody>${postenNu.map(b=>`<tr>
                <td><b>${CRM.h(b.categorie)}</b>${b.note?`<div class="rowsub">${CRM.h(b.note)}</div>`:''}</td>
                <td class="n num">${CRM.euro(b.bedrag_pm)}</td>
                <td class="n"><span class="num meta">${mkLabel(String(b.vanaf_maand).slice(0,7))} — ${b.tot_maand ? mkLabel(String(b.tot_maand).slice(0,7)) : 'doorlopend'}</span></td>
              </tr>`).join('')}</tbody></table></div>`
          : CRM.ui.leeg('Geen budgetposten','Zet het kostenbudget op in de finance-app.')}
        </div>
      </div>
    </div>`;
}

/* ═══ Registratie ══════════════════════════════════════════════ */
const RENDERERS = { vandaag:tabVandaag, plaatsingen:tabPlaatsingen, flex:tabFlex, cashflow:tabCashflow, kosten:tabKosten };

CRM.registerModule('finance', {
  title:'Finance', icon:'€', onderschrift:'Alle cijfers uit de finance-app — rekenwerk en instellingen blijven daar',
  adminOnly:true,

  async render(mount, acties){
    /* Riem én bretels: de router blokkeert dit al, maar geld tonen we
       nooit zonder expliciete check. */
    if(!CRM.canSeeMoney()){
      mount.innerHTML = `<div class="note warn">Deze module is alleen zichtbaar voor de eigenaar.</div>`;
      return;
    }
    acties.innerHTML = `
      <button class="btn sub" id="fin_verniew" title="Cijfers opnieuw ophalen">↻ Vernieuwen</button>
      <a class="btn ghost" href="${FIN_APP}" target="_blank" rel="noopener">Finance-app openen ↗</a>`;
    document.getElementById('fin_verniew').onclick = async () => {
      _fin = null; CRM.toast('Financiële cijfers vernieuwen…'); CRM.render();
    };

    mount.innerHTML = CRM.ui.laden('Financiële gegevens ophalen…');
    const f = await finLaad();

    if(!f){
      mount.innerHTML = `<div class="note warn"><b>Financiële gegevens niet geladen.</b><br>
        ${CRM.h(_finFout?.message || 'Onbekende fout')}<br>
        <span class="meta">Dit is verwacht als je niet als eigenaar bent ingelogd — de fin_-tabellen zijn met RLS afgeschermd.</span></div>`;
      return;
    }

    const mistNote = (!f.demo && _mist.length)
      ? `<div class="note warn" style="margin-bottom:14px">Niet alles kon geladen worden: <b>${_mist.map(CRM.h).join(', ')}</b> —
          die onderdelen tonen een lege staat. De rest klopt gewoon.</div>` : '';

    mount.innerHTML = `
      ${mistNote}
      <div class="tabs" id="fin_tabs">
        ${TABS.map(t=>`<button class="tab${t.k===_tab?' on':''}" data-t="${t.k}">${CRM.h(t.lbl)}</button>`).join('')}
      </div>
      <div id="fin_body"></div>`;

    const body = mount.querySelector('#fin_body');
    const toon = () => {
      mount.querySelectorAll('#fin_tabs .tab').forEach(b=>b.classList.toggle('on', b.dataset.t===_tab));
      try{ RENDERERS[_tab](body, f); }
      catch(e){
        console.error('Finance-tab '+_tab, e);
        body.innerHTML = `<div class="note err">Dit tabblad gaf een fout: ${CRM.h(e.message)}<br>
          <span class="meta">De andere tabbladen werken gewoon; details staan in de console.</span></div>`;
      }
    };
    mount.querySelectorAll('#fin_tabs .tab').forEach(b => b.onclick = () => { _tab = b.dataset.t; toon(); });
    toon();
  }
});

})();

/* VERZOEK AAN CORE: als een niet-admin een adminOnly-hash opent (bv. #finance
   als teamlid), weigert CRM.ga terecht — maar er wordt daarna geen fallback
   gerenderd, dus het contentgebied blijft leeg. Voorstel: in start()/hashchange
   terugvallen op 'dashboard' wanneer CRM.ga de module weigert. */
