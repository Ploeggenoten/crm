/* ═══════════════════════════════════════════════════════════════
   MODULE: PERFORMANCE — het cijfermatige overzicht
   Plaatsingen, duurzaamheid, recruiters, trechter, uitval, bron.
   Definities zijn identiek aan het pijplijnbord (CRM.plaatsingenMaand).
   Euro's staan strikt achter CRM.canSeeMoney().
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;
const kort   = s => String(s||'').slice(0,10);
const actief = c => !['Afgevallen','Gestopt'].includes(c.fase);
const GARANTIE_STD = 3;                       /* maanden, als garantie_mnd leeg is */

/* ─── Periode ────────────────────────────────────────────────── */
let periode = 'maand', eigenVan = '', eigenTot = '';
let recSort   = {k:'plaatsingen', dir:-1};
let klantSort = {k:'plaatsingen', dir:-1};

const dag = (j,m,d) => new Date(j,m,d).toLocaleDateString('sv-SE');
function bereik(){
  const nu = new Date(), j = nu.getFullYear(), m = nu.getMonth();
  switch(periode){
    case 'vorige':   return {van:dag(j,m-1,1), tot:dag(j,m,0),    lbl:'vorige maand'};
    case 'kwartaal': {const q=Math.floor(m/3)*3; return {van:dag(j,q,1), tot:dag(j,q+3,0), lbl:'dit kwartaal'};}
    case 'jaar':     return {van:dag(j,0,1),   tot:dag(j,11,31),  lbl:'dit jaar'};
    case 'eigen':    return {van:eigenVan||dag(j,m,1), tot:eigenTot||dag(j,m+1,0), lbl:'gekozen periode'};
    default:         return {van:dag(j,m,1),   tot:dag(j,m+1,0),  lbl:'deze maand'};
  }
}
const inP = (x,p) => { const s = kort(x); return !!s && s>=p.van && s<=p.tot; };

/* ─── Kleine rekenhulpjes ────────────────────────────────────── */
function dagenTussen(a,b){
  const x = new Date(kort(a)), y = new Date(kort(b));
  if(isNaN(x)||isNaN(y)) return null;
  return Math.round((y-x)/86400000);
}
const gem = arr => arr.length ? Math.round(arr.reduce((s,n)=>s+n,0)/arr.length) : null;

/* Percentage met eerlijke n bij kleine aantallen. */
function pctTxt(deel, totaal, grens=10){
  if(!totaal) return '<span class="meta">—</span>';
  const p = Math.round(deel/totaal*100);
  return `<span class="num">${p}%</span>` + (totaal < grens ? ` <span class="meta num">n=${totaal}</span>` : '');
}

/* Laatste beweging in de historie — proxy voor "wanneer viel hij af". */
function laatsteBeweging(c){
  const hist = c.historie||[];
  if(hist.length){
    const op = hist.map(x=>kort(x.op)).filter(Boolean).sort();
    if(op.length) return op[op.length-1];
  }
  return kort(c.since);
}

/* Duurzaam = niet gestopt, of gestopt ná de garantieperiode. */
function garantieEind(c){
  if(!kort(c.geplaatstOp)) return null;
  const d = new Date(kort(c.geplaatstOp));
  if(isNaN(d)) return null;
  d.setMonth(d.getMonth() + (Number(c.garantieMnd)||GARANTIE_STD));
  return d.toLocaleDateString('sv-SE');
}
function duurzaam(c){
  if(c.fase !== 'Gestopt') return true;
  const eind = garantieEind(c);
  if(!eind || !kort(c.gestoptOp)) return true;
  return kort(c.gestoptOp) > eind;
}

/* Verste fase die een kandidaat ooit bereikte (0..10, eindfases tellen niet mee). */
const FUNNEL = CRM.PHASES.filter(p => !['Afgevallen','Gestopt'].includes(p.k));
function verste(c){
  const idxs = [];
  (c.historie||[]).forEach(x => { const i = CRM.faseIdx(x.fase); if(i>=0 && i<FUNNEL.length) idxs.push(i); });
  const cur = CRM.faseIdx(c.fase);
  if(cur>=0 && cur<FUNNEL.length) idxs.push(cur);
  if(c.fase==='Gestopt') idxs.push(CRM.faseIdx('Gestart'));
  if(kort(c.geplaatstOp)) idxs.push(CRM.faseIdx('Contract getekend'));
  return idxs.length ? Math.max.apply(null, idxs) : -1;
}

/* ─── Basisverzamelingen voor de gekozen periode ─────────────── */
function cijfers(p){
  const cs = CRM.kandidaten();
  const getekend = cs.filter(c => inP(c.geplaatstOp,p) && CRM.PLACED.includes(c.fase));
  const gestopt  = cs.filter(c => c.fase==='Gestopt' && inP(c.gestoptOp,p));
  /* Cohort voor duurzaamheid: iedereen die in deze periode getekend heeft,
     inclusief wie later gestopt is. */
  const cohort = cs.filter(c => inP(c.geplaatstOp,p) && (CRM.PLACED.includes(c.fase) || c.fase==='Gestopt'));
  const instroom  = cs.filter(c => inP(c.since,p));
  const afgevallen= cs.filter(c => c.fase==='Afgevallen' && inP(laatsteBeweging(c),p));
  return {cs, getekend, gestopt, cohort, instroom, afgevallen, netto:getekend.length-gestopt.length};
}

/* ═══ 1. PLAATSINGEN ═════════════════════════════════════════════ */
function blokPlaatsingen(p, D){
  const ws   = D.getekend.filter(c => (c.type||'W&S')!=='Flex').length;
  const flex = D.getekend.filter(c => c.type==='Flex').length;
  const duur = D.cohort.filter(duurzaam);
  const gestoptCohort = D.cohort.filter(c => c.fase==='Gestopt');
  const tijdTotStop = gestoptCohort.map(c => dagenTussen(c.geplaatstOp, c.gestoptOp)).filter(n => n!=null && n>=0);
  const gemStop = gem(tijdTotStop);

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Plaatsingen</span>
      <span class="meta">${h(p.lbl)} · ${h(CRM.fmtDateShort(p.van))} — ${h(CRM.fmtDateShort(p.tot))}</span></div>
    <div class="grid c4">
      ${CRM.ui.kpi('Getekend', `<span class="num">${D.getekend.length}</span>`,
        `<span class="meta num">${ws} W&amp;S · ${flex} Flex</span>`, 'accent')}
      ${CRM.ui.kpi('Netto', `<span class="num">${D.netto>0?'+':''}${D.netto}</span>`,
        `<span class="meta num">${D.getekend.length} getekend − ${D.gestopt.length} gestopt</span>`)}
      ${CRM.ui.kpi('Duurzaam', D.cohort.length ? pctTxt(duur.length, D.cohort.length) : '<span class="meta">—</span>',
        `<span class="meta num">${duur.length} van ${D.cohort.length} nog aan het werk of voorbij de garantie</span>`)}
      ${CRM.ui.kpi('Tijd tot stop', gemStop!=null ? `<span class="num">${gemStop}</span><span class="pf-eh"> dagen</span>` : '<span class="meta">—</span>',
        gemStop!=null ? `<span class="meta num">gemiddeld, over ${tijdTotStop.length} gestopte plaatsingen</span>`
                      : '<span class="meta">niemand uit deze lichting is gestopt</span>')}
    </div>
    <p class="pf-uitleg meta">Netto volgt exact de definitie van het bord: getekend in de periode min gestopt in de periode.
      Duurzaamheid kijkt naar de lichting die in deze periode tekende — met een garantie van ${GARANTIE_STD} maanden als er niets is ingevuld.</p>
  </section>`;
}

/* ═══ 2. TREND — 12 maanden ══════════════════════════════════════ */
function blokTrend(){
  const nu = new Date();
  const rijen = [];
  for(let i=11;i>=0;i--){
    const d = new Date(nu.getFullYear(), nu.getMonth()-i, 1);
    const mk = d.toLocaleDateString('sv-SE').slice(0,7);
    const m = CRM.plaatsingenMaand(mk);
    rijen.push({mk, lbl:d.toLocaleDateString('nl-NL',{month:'short'}), lang:d.toLocaleDateString('nl-NL',{month:'long',year:'numeric'}),
                get:m.getekend.length, stop:m.gestopt.length, netto:m.netto, target:CRM.maandTarget(mk)});
  }
  const max = Math.max(1, ...rijen.map(r => Math.max(r.get, r.stop, r.target)));
  const H = 150;
  const px = n => Math.max(n>0?3:0, Math.round(n/max*H));

  if(!rijen.some(r => r.get || r.stop))
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Trend per maand</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Nog geen historie','Zodra er plaatsingen zijn vastgelegd verschijnt hier de trend van de laatste twaalf maanden.')}</div></div></section>`;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Trend per maand</span>
      <span class="pf-leg"><i class="get"></i>getekend <i class="stop"></i>gestopt <i class="tick"></i>target</span></div>
    <div class="card"><div class="card-b">
      <div class="pf-kols">
        ${rijen.map(r => `<div class="pf-kol" title="${h(r.lang)}: ${r.get} getekend, ${r.stop} gestopt, netto ${r.netto}, target ${r.target}">
          <div class="pf-area" style="height:${H}px">
            <span class="pf-tick" style="bottom:${px(r.target)}px"></span>
            <i class="get" style="height:${px(r.get)}px"></i>
            <i class="stop" style="height:${px(r.stop)}px"></i>
          </div>
          <div class="pf-net num ${r.netto>=r.target?'goed':(r.netto<0?'slecht':'')}">${r.netto>0?'+':''}${r.netto}</div>
          <div class="pf-mnd">${h(r.lbl)}</div>
        </div>`).join('')}
      </div>
      <p class="pf-uitleg meta">De onderste regel is netto (getekend − gestopt). Het streepje in elke kolom is het maandtarget.</p>
    </div></div>
  </section>`;
}

/* ═══ 3. PER RECRUITER ═══════════════════════════════════════════ */
function recruiterRijen(p, D){
  const namen = Array.from(new Set(D.cs.map(c => (c.rec||'').trim()).filter(Boolean)));
  return namen.map(naam => {
    const mijn      = D.cs.filter(c => (c.rec||'').trim()===naam);
    const getekend  = D.getekend.filter(c => (c.rec||'').trim()===naam);
    const gestopt   = D.gestopt.filter(c => (c.rec||'').trim()===naam);
    const cohort    = D.cohort.filter(c => (c.rec||'').trim()===naam);
    const duur      = cohort.filter(duurzaam);
    const looptijden= getekend.map(c => dagenTussen(c.since, c.geplaatstOp)).filter(n => n!=null && n>=0);
    return {
      naam,
      plaatsingen: getekend.length,
      netto: getekend.length - gestopt.length,
      duurN: duur.length, duurT: cohort.length,
      pijplijn: mijn.filter(c => actief(c) && !CRM.PLACED.includes(c.fase)).length,
      looptijd: gem(looptijden),
      gesprekken: mijn.filter(c => inP(c.datum, p)).length
    };
  });
}

function blokRecruiters(p, D){
  const rijen = recruiterRijen(p, D);
  if(!rijen.length)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Per recruiter</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Geen recruiter vastgelegd','Vul het veld recruiter bij kandidaten in om prestaties per persoon te kunnen volgen.')}</div></div></section>`;

  const waarde = (r,k) => k==='naam' ? r.naam
    : k==='duur' ? (r.duurT ? r.duurN/r.duurT : -1)
    : k==='looptijd' ? (r.looptijd==null ? 9999 : r.looptijd)
    : r[k];
  rijen.sort((a,b)=>{
    const x = waarde(a,recSort.k), y = waarde(b,recSort.k);
    if(typeof x === 'string') return recSort.dir * x.localeCompare(y);
    return recSort.dir * (x - y);
  });
  const maxP = Math.max(1, ...rijen.map(r=>r.plaatsingen));

  const kop = (k,lbl,cls='') => `<th class="sortable ${cls}" data-rs="${k}">${h(lbl)}${recSort.k===k?(recSort.dir<0?' ↓':' ↑'):''}</th>`;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Per recruiter</span><span class="meta">${h(p.lbl)}</span></div>
    <div class="tblwrap"><table class="tbl pf-tbl">
      <thead><tr>
        ${kop('naam','Recruiter')}
        ${kop('plaatsingen','Plaatsingen','n')}
        <th></th>
        ${kop('netto','Netto','n')}
        ${kop('duur','Duurzaam','n')}
        ${kop('pijplijn','In pijplijn','n')}
        ${kop('looptijd','Doorlooptijd','n')}
        ${kop('gesprekken','Gesprekken','n')}
      </tr></thead>
      <tbody>${rijen.map(r=>`<tr>
        <td><b>${h(r.naam)}</b></td>
        <td class="n num">${r.plaatsingen}</td>
        <td class="pf-balk">${CRM.ui.bar(Math.round(r.plaatsingen/maxP*100))}</td>
        <td class="n num">${r.netto>0?'+':''}${r.netto}</td>
        <td class="n">${r.duurT ? pctTxt(r.duurN, r.duurT) : '<span class="meta">—</span>'}</td>
        <td class="n num">${r.pijplijn}</td>
        <td class="n num">${r.looptijd!=null ? r.looptijd+' dgn' : '<span class="meta">—</span>'}</td>
        <td class="n num">${r.gesprekken}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

/* ═══ 4. CONVERSIETRECHTER ═══════════════════════════════════════ */
function blokTrechter(p, D){
  const cohort = D.instroom;
  if(cohort.length < 3)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Conversietrechter</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Te weinig instroom in deze periode',
        `Er stroomden ${cohort.length} kandidaten in. Kies een langere periode voor een betrouwbaar beeld.`)}</div></div></section>`;

  const verstes = cohort.map(verste);
  const tel = FUNNEL.map((f,i) => ({fase:f.k, kleur:f.c, n:verstes.filter(v => v>=i).length}));
  const start = tel[0].n || 1;
  const plaatsingen = tel[CRM.faseIdx('Contract getekend')].n;
  const voorgesteld = tel[CRM.faseIdx('Voorgesteld')].n;
  const offers      = tel[CRM.faseIdx('Offer')].n;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Conversietrechter</span>
      <span class="meta">${cohort.length} kandidaten ingestroomd in ${h(p.lbl)}</span></div>
    <div class="card"><div class="card-b">
      <div class="pf-funnel">
        ${tel.map((t,i)=>{
          const door = i<tel.length-1 ? tel[i+1].n : null;
          return `<div class="pf-fr">
            <div class="pf-fl">${h(t.fase)}</div>
            <div class="pf-fb"><i style="width:${Math.round(t.n/start*100)}%"></i>
              <span class="pf-fn num">${t.n}</span></div>
            <div class="pf-fd meta num">${door!=null && t.n ? Math.round(door/t.n*100)+'% door' : ''}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="pf-ratios">
        <div><span class="label">Voorstellen per plaatsing</span>
          <b class="num">${plaatsingen ? (voorgesteld/plaatsingen).toFixed(1) : '—'}</b>
          <span class="meta num">${voorgesteld} voorgesteld · ${plaatsingen} geplaatst</span></div>
        <div><span class="label">Offers per plaatsing</span>
          <b class="num">${plaatsingen ? (offers/plaatsingen).toFixed(1) : '—'}</b>
          <span class="meta num">${offers} offers · ${plaatsingen} geplaatst</span></div>
      </div>
      <p class="pf-uitleg meta">Een kandidaat telt bij elke fase die hij ooit bereikte (uit de historie).
        Afgevallen en Gestopt zijn geen trechterpositie — daar telt de verste fase die hij haalde.</p>
    </div></div>
  </section>`;
}

/* ═══ 5. UITVAL ══════════════════════════════════════════════════ */
function topReden(lijst, veld){
  const t = {};
  lijst.forEach(c => { const r = (c[veld]||'').trim() || 'Niet ingevuld'; t[r] = (t[r]||0)+1; });
  return Object.entries(t).sort((a,b)=>b[1]-a[1]);
}

function blokUitval(p, D){
  const af = D.afgevallen, st = D.gestopt;
  if(!af.length && !st.length)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Uitval</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Geen uitval in deze periode','Niemand viel af en niemand stopte. Kies een langere periode voor meer context.')}</div></div></section>`;

  const afTop = topReden(af,'afvalCat'), stTop = topReden(st,'stopCat');
  const bakken = [{lbl:'≤ 30 dagen', n:0},{lbl:'31 – 90 dagen', n:0},{lbl:'> 90 dagen', n:0},{lbl:'Onbekend', n:0}];
  st.forEach(c => {
    const d = dagenTussen(c.geplaatstOp, c.gestoptOp);
    if(d==null || d<0) bakken[3].n++;
    else if(d<=30) bakken[0].n++;
    else if(d<=90) bakken[1].n++;
    else bakken[2].n++;
  });

  const lijst = (titel, rijen, totaal) => `<div class="card"><div class="card-h"><div class="h2">${h(titel)}</div>
      <span class="chip">${totaal}</span></div>
    <div class="card-b">${rijen.length ? `<div class="pf-redenen">${rijen.slice(0,6).map(([r,n])=>`
      <div class="pf-reden"><span class="pf-rl">${h(r)}</span>
        <span class="pf-rb">${CRM.ui.bar(Math.round(n/totaal*100))}</span>
        <span class="pf-rn num">${n}</span></div>`).join('')}</div>`
      : CRM.ui.leeg('Nog geen reden vastgelegd','Vul bij het afvallen of stoppen van een kandidaat de reden in — dan zie je hier waar het structureel misgaat.')}
    </div></div>`;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Uitval</span><span class="meta">${h(p.lbl)}</span></div>
    <div class="grid c3">
      ${lijst('Redenen afvallen', afTop, af.length)}
      ${lijst('Redenen stoppen', stTop, st.length)}
      <div class="card"><div class="card-h"><div class="h2">Hoe lang bleven ze</div><span class="chip">${st.length}</span></div>
        <div class="card-b">${st.length ? `<div class="pf-redenen">${bakken.filter(b=>b.n).map(b=>`
          <div class="pf-reden"><span class="pf-rl">${h(b.lbl)}</span>
            <span class="pf-rb">${CRM.ui.bar(Math.round(b.n/st.length*100))}</span>
            <span class="pf-rn num">${b.n}</span></div>`).join('')}</div>`
          : CRM.ui.leeg('Niemand gestopt','')}
        </div></div>
    </div>
  </section>`;
}

/* ═══ 6. PER KLANT ═══════════════════════════════════════════════ */
function blokKlanten(p, D){
  const namen = Array.from(new Set(D.cs.map(c => (c.klant||'').trim()).filter(Boolean)));
  const rijen = namen.map(naam => {
    const mijn      = D.cs.filter(c => (c.klant||'').trim()===naam);
    const inPer     = mijn.filter(c => inP(c.since,p) || inP(c.geplaatstOp,p) || inP(c.gestoptOp,p));
    const getekend  = D.getekend.filter(c => (c.klant||'').trim()===naam);
    const cohort    = D.cohort.filter(c => (c.klant||'').trim()===naam);
    const duur      = cohort.filter(duurzaam);
    const voorgesteld = inPer.filter(c => verste(c) >= CRM.faseIdx('Voorgesteld')).length;
    const klantWees = inPer.filter(c => c.fase==='Afgevallen' && /klant wees af|meeloopdag niet goed/i.test(c.afvalCat||'')).length;
    const looptijden= getekend.map(c => dagenTussen(c.since, c.geplaatstOp)).filter(n=>n!=null && n>=0);
    return {naam, actief:inPer.length, plaatsingen:getekend.length, voorgesteld,
            duurN:duur.length, duurT:cohort.length, klantWees, looptijd:gem(looptijden)};
  }).filter(r => r.actief || r.plaatsingen);

  if(!rijen.length)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Per klant</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Geen klantactiviteit in deze periode',
        'Er liep bij geen enkele klant een traject. Kies hierboven een langere periode.')}</div></div></section>`;

  const waarde = (r,k) => k==='naam' ? r.naam
    : k==='aanname' ? (r.voorgesteld ? r.plaatsingen/r.voorgesteld : -1)
    : k==='duur' ? (r.duurT ? r.duurN/r.duurT : -1)
    : k==='looptijd' ? (r.looptijd==null ? 9999 : r.looptijd)
    : r[k];
  rijen.sort((a,b)=>{
    const x = waarde(a,klantSort.k), y = waarde(b,klantSort.k);
    if(typeof x === 'string') return klantSort.dir * x.localeCompare(y);
    return klantSort.dir * (x - y);
  });

  const kop = (k,lbl,cls='') => `<th class="sortable ${cls}" data-ks="${k}">${h(lbl)}${klantSort.k===k?(klantSort.dir<0?' ↓':' ↑'):''}</th>`;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Per klant</span><span class="meta">${h(p.lbl)}</span></div>
    <div class="tblwrap"><table class="tbl pf-tbl">
      <thead><tr>
        ${kop('naam','Klant')}
        ${kop('voorgesteld','Voorgesteld','n')}
        ${kop('plaatsingen','Plaatsingen','n')}
        ${kop('aanname','Aanname-ratio','n')}
        ${kop('duur','Duurzaam','n')}
        ${kop('looptijd','Doorlooptijd','n')}
        <th>Let op</th>
      </tr></thead>
      <tbody>${rijen.map(r=>{
        const afwijzend = r.voorgesteld>=5 && r.plaatsingen/r.voorgesteld < 0.2;
        const vaakWeg   = r.voorgesteld>=4 && r.klantWees/r.voorgesteld >= 0.4;
        return `<tr class="clickable" data-klant="${h(r.naam)}">
          <td><b>${h(r.naam)}</b></td>
          <td class="n num">${r.voorgesteld}</td>
          <td class="n num">${r.plaatsingen}</td>
          <td class="n">${r.voorgesteld ? pctTxt(r.plaatsingen, r.voorgesteld) : '<span class="meta">—</span>'}</td>
          <td class="n">${r.duurT ? pctTxt(r.duurN, r.duurT) : '<span class="meta">—</span>'}</td>
          <td class="n num">${r.looptijd!=null ? r.looptijd+' dgn' : '<span class="meta">—</span>'}</td>
          <td>${vaakWeg ? '<span class="chip amber">wijst vaak af</span>'
             : afwijzend ? '<span class="chip">lage aanname</span>' : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </section>`;
}

/* ═══ 7. PER BRON — marketing ↔ recruitment ══════════════════════ */
function blokBron(p, D){
  const leads = (CRM.state.leads||[]).filter(l => inP(l.binnen_op, p));
  const bronnen = Array.from(new Set([
    ...leads.map(l => (l.bron||'').trim()),
    ...D.instroom.map(c => (c.bron||'').trim()),
    ...D.getekend.map(c => (c.bron||'').trim())
  ].filter(Boolean)));

  if(!bronnen.length)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Per bron</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Geen bron vastgelegd','Vul het veld bron bij leads en kandidaten in om marketing aan plaatsingen te koppelen.')}</div></div></section>`;

  const rijen = bronnen.map(b => ({
    bron: b,
    leads: leads.filter(l => (l.bron||'').trim()===b).length,
    kand:  D.instroom.filter(c => (c.bron||'').trim()===b).length,
    plaats:D.getekend.filter(c => (c.bron||'').trim()===b).length
  })).sort((a,b)=> (b.leads+b.kand*3+b.plaats*10) - (a.leads+a.kand*3+a.plaats*10));

  const tot = rijen.reduce((s,r)=>({leads:s.leads+r.leads, kand:s.kand+r.kand, plaats:s.plaats+r.plaats}), {leads:0,kand:0,plaats:0});

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Per bron</span>
      <span class="meta">van advertentie tot plaatsing · ${h(p.lbl)}</span></div>
    <div class="tblwrap"><table class="tbl pf-tbl">
      <thead><tr><th>Bron</th><th class="n">Leads</th><th class="n">Kandidaten</th>
        <th class="n">→ kandidaat</th><th class="n">Plaatsingen</th><th class="n">→ plaatsing</th></tr></thead>
      <tbody>${rijen.map(r=>`<tr>
        <td><b>${h(r.bron)}</b></td>
        <td class="n num">${r.leads}</td>
        <td class="n num">${r.kand}</td>
        <td class="n">${r.leads ? pctTxt(r.kand, r.leads) : '<span class="meta">—</span>'}</td>
        <td class="n num">${r.plaats}</td>
        <td class="n">${r.kand ? pctTxt(r.plaats, r.kand) : '<span class="meta">—</span>'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Totaal</b></td><td class="n num">${tot.leads}</td><td class="n num">${tot.kand}</td>
        <td class="n">${tot.leads ? pctTxt(tot.kand, tot.leads) : '—'}</td>
        <td class="n num">${tot.plaats}</td>
        <td class="n">${tot.kand ? pctTxt(tot.plaats, tot.kand) : '—'}</td></tr></tfoot>
    </table></div>
    <p class="pf-uitleg meta">Leads zijn binnengekomen reacties, kandidaten zijn de leads die de pijplijn in gingen.
      Beide gemeten binnen de gekozen periode, dus een lead uit vorige maand die nu plaatst telt hier niet mee.</p>
  </section>`;
}

/* ═══ 8. OMZET — alleen Tjeerd ═══════════════════════════════════ */
let _fin = null;
async function finLezen(){
  if(_fin) return _fin;
  if(!CRM.canSeeMoney()) return (_fin = {ok:false});
  /* In demo blijft de echte database buiten beeld — anders staan er
     bij een nog actieve sessie zomaar echte omzetcijfers op een testscherm. */
  if(CRM.demo) return (_fin = {ok:false});
  try{
    const [p,i] = await Promise.all([
      CRM.sb.from('fin_placements').select('id,klant,kandidaat,fee_excl,contract_datum,gestopt_op'),
      CRM.sb.from('fin_installments').select('placement_id,bedrag_excl,geplande_datum,factuurdatum,status')
    ]);
    if(p.error || i.error) return (_fin = {ok:false});
    const placements = p.data||[], termijnen = i.data||[];
    if(!placements.length && !termijnen.length) return (_fin = {ok:false});
    return (_fin = {ok:true, placements, termijnen});
  }catch(e){ return (_fin = {ok:false}); }
}

function blokOmzet(p, fin){
  if(!CRM.canSeeMoney() || !fin || !fin.ok) return '';
  const bet = t => Number(t.bedrag_excl)||0;
  const inPeriode = (fin.termijnen||[]).filter(t => inP(t.factuurdatum || t.geplande_datum, p));
  const gefactureerd = inPeriode.filter(t => ['gefactureerd','betaald'].includes(t.status));
  const omzet = gefactureerd.reduce((s,t)=>s+bet(t),0);
  const betaald = inPeriode.filter(t => t.status==='betaald').reduce((s,t)=>s+bet(t),0);

  const getekendFee = (fin.placements||[]).filter(pl => inP(pl.contract_datum, p));
  const feeTotaal = getekendFee.reduce((s,pl)=>s+(Number(pl.fee_excl)||0),0);
  const gemFee = getekendFee.length ? Math.round(feeTotaal/getekendFee.length) : null;

  const perKlant = {};
  getekendFee.forEach(pl => { perKlant[pl.klant] = (perKlant[pl.klant]||0) + (Number(pl.fee_excl)||0); });
  const top = Object.entries(perKlant).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxK = top.length ? top[0][1] : 1;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Omzet</span><span class="meta">alleen voor jou · ${h(p.lbl)}</span></div>
    <div class="grid c4">
      ${CRM.ui.kpi('Gefactureerd', `<span class="num">${h(CRM.euro(omzet))}</span>`,
        `<span class="meta num">${gefactureerd.length} termijnen</span>`, 'accent')}
      ${CRM.ui.kpi('Waarvan betaald', `<span class="num">${h(CRM.euro(betaald))}</span>`, '')}
      ${CRM.ui.kpi('Getekende fee', `<span class="num">${h(CRM.euro(feeTotaal))}</span>`,
        `<span class="meta num">${getekendFee.length} plaatsingen</span>`)}
      ${CRM.ui.kpi('Gemiddelde fee', gemFee!=null ? `<span class="num">${h(CRM.euro(gemFee))}</span>` : '<span class="meta">—</span>', '')}
    </div>
    ${top.length ? `<div class="card"><div class="card-h"><div class="h2">Grootste klanten</div></div>
      <div class="card-b"><div class="pf-redenen">${top.map(([k,v])=>`
        <div class="pf-reden"><span class="pf-rl">${h(k)}</span>
          <span class="pf-rb">${CRM.ui.bar(Math.round(v/maxK*100))}</span>
          <span class="pf-rn num">${h(CRM.euro(v))}</span></div>`).join('')}</div></div></div>` : ''}
  </section>`;
}

/* ═══ PERIODEKIEZER ══════════════════════════════════════════════ */
const KEUZES = [['maand','Deze maand'],['vorige','Vorige maand'],['kwartaal','Dit kwartaal'],['jaar','Dit jaar'],['eigen','Eigen bereik']];

function kiezerHTML(p){
  return `<div class="pf-kiezer">
    <div class="seg">${KEUZES.map(([k,l])=>`<button data-per="${k}" class="${periode===k?'on':''}">${h(l)}</button>`).join('')}</div>
    ${periode==='eigen' ? `<div class="row tight pf-eigen">
      <input type="date" id="pf_van" value="${h(p.van)}"><span class="meta">t/m</span>
      <input type="date" id="pf_tot" value="${h(p.tot)}"></div>` : ''}
  </div>`;
}

/* ═══ REGISTRATIE ════════════════════════════════════════════════ */
function teken(mount, acties){
  const p = bereik(), D = cijfers(p);

  if(acties) acties.innerHTML = kiezerHTML(p);

  mount.innerHTML = `<div class="pf">
    ${blokPlaatsingen(p, D)}
    ${blokTrend()}
    ${blokRecruiters(p, D)}
    ${blokTrechter(p, D)}
    ${blokUitval(p, D)}
    ${blokKlanten(p, D)}
    ${blokBron(p, D)}
    <div id="pf_omzet"></div>
  </div>`;

  /* Periodekiezer */
  if(acties){
    CRM.$$('[data-per]', acties).forEach(b => b.onclick = () => {
      periode = b.dataset.per; teken(mount, acties);
    });
    const van = document.getElementById('pf_van'), tot = document.getElementById('pf_tot');
    if(van) van.onchange = () => { eigenVan = van.value; teken(mount, acties); };
    if(tot) tot.onchange = () => { eigenTot = tot.value; teken(mount, acties); };
  }

  /* Sorteren */
  CRM.$$('[data-rs]', mount).forEach(th => th.onclick = () => {
    const k = th.dataset.rs;
    recSort = {k, dir: recSort.k===k ? -recSort.dir : (k==='naam' ? 1 : -1)};
    teken(mount, acties);
  });
  CRM.$$('[data-ks]', mount).forEach(th => th.onclick = () => {
    const k = th.dataset.ks;
    klantSort = {k, dir: klantSort.k===k ? -klantSort.dir : (k==='naam' ? 1 : -1)};
    teken(mount, acties);
  });
  CRM.$$('[data-klant]', mount).forEach(tr => tr.onclick = () => CRM.ga('klanten', {id:tr.dataset.klant}));

  /* Omzet nalezen — alleen voor Tjeerd, en alleen als het lukt. */
  if(CRM.canSeeMoney()){
    finLezen().then(fin => {
      const el = document.getElementById('pf_omzet');
      if(el && CRM.view==='performance') el.innerHTML = blokOmzet(p, fin);
    }).catch(()=>{});
  }
}

CRM.registerModule('performance', {
  title:'Performance', icon:'▲', onderschrift:'Prestaties en cijfers',
  render(mount, acties){ teken(mount, acties); }
});

})();
