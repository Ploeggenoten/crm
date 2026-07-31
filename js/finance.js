/* ═══════════════════════════════════════════════════════════════
   MODULE: FINANCE — alleen zichtbaar voor Tjeerd.
   Complete overzet van de losse finance-app (~/ploeggenoten-finance)
   in het rustige CRM-jasje: Vandaag, Advies, Plaatsingen & termijnen,
   Facturatie, Flex, Cashflow, Winst & doelen en Kosten.

   Het REKENWERK is 1-op-1 overgenomen uit js/calc.js van de finance-app
   (zie de kopjes "bron: calc.js"). Bewerken (facturen afvinken, fees
   bevestigen, instellingen) blijft in de finance-app — dit is een
   leesscherm dat exact dezelfde getallen laat zien.

   Privacy: de fin_*-tabellen hebben RLS waardoor alleen Tjeerd ze kan
   lezen. Deze module is bovendien adminOnly én iedere query zit achter
   CRM.canSeeMoney(), zodat een teamlid de tabellen niet eens bevraagt.
   Drie grenzen: navigatie, render en database.
   ═══════════════════════════════════════════════════════════════ */

(function(){
'use strict';

const FIN_APP = 'https://ploeggenoten.github.io/ploeggenoten-finance/';
/* De finance-app heeft (nog) geen hash-router; de hash is onschadelijk
   en maakt de bedoeling per knop duidelijk. */
const finLink = (view, lbl, klasse='btn ghost sm') =>
  `<a class="${klasse}" href="${FIN_APP}${view?'#'+view:''}" target="_blank" rel="noopener">${CRM.h(lbl)} ↗</a>`;

/* ─── Opmaak & datums ─────────────────────────────────────────
   Geld altijd via CRM.euro zodat de finance-module er hetzelfde
   uitziet als de rest van het CRM. Percentages komen als fractie
   binnen (0.35) en gaan er als "35,0%" uit; niet-eindige waarden
   worden een streepje in plaats van NaN%.                        */
const eur  = n => (n==null || !isFinite(Number(n))) ? '—' : CRM.euro(Number(n));
const eur2 = n => (n==null || !isFinite(Number(n))) ? '—' : CRM.euro(Number(n), 2);
const pctF = (x, dec=1) => (x==null || !isFinite(Number(x))) ? '—' : CRM.pct(Number(x)*100, dec);
const num  = (n, dec=1) => (n==null || !isFinite(Number(n))) ? '—'
  : Number(n).toLocaleString('nl-NL', {minimumFractionDigits:dec, maximumFractionDigits:dec});
/* Deling die nooit NaN of Infinity oplevert. */
const deel = (a, b) => (Number(b) ? Number(a)/Number(b) : null);

const MND = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const todayISO = () => CRM.todayISO();
/* mk = maandsleutel 'YYYY-MM-01' — precies zoals de finance-app hem gebruikt,
   zodat vergelijkingen met fin_costs_budget.vanaf_maand kloppen. */
const monthKey = iso => iso ? String(iso).slice(0,7) + '-01' : null;
const mkLabel  = mk => { const [y,m] = String(mk).split('-').map(Number);
  return (MND[m-1]||'?') + " '" + String(y).slice(2); };
function addDays(iso, n){
  const d = new Date(String(iso).slice(0,10) + 'T12:00:00');
  if(isNaN(d)) return null;
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}
function addMonths(iso, n){
  const [y,m,dd] = String(iso).slice(0,10).split('-').map(Number);
  if(!y || !m) return null;
  const d = new Date(Date.UTC(y, m-1+n, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dd||1, last));
  return d.toISOString().slice(0,10);
}
const daysBetween = (a, b) => {
  if(!a || !b) return null;
  const x = new Date(String(a).slice(0,10)), y = new Date(String(b).slice(0,10));
  if(isNaN(x) || isNaN(y)) return null;
  return Math.round((y - x) / 864e5);
};
const dOf = iso => iso ? CRM.fmtDate(String(iso).slice(0,10)) : '—';
const dKort = iso => iso ? CRM.fmtDateShort(String(iso).slice(0,10)) : '—';

/* De finance-app noemt de termijnkolom `bedrag_excl`, niet `bedrag`. */
const bedragVan = i => Number(i && i.bedrag_excl || 0);

/* ─── Data laden (fouttolerant per tabel) ─────────────────────── */
let _fin = null, _finFout = null, _mist = [];

function legeFin(){
  return { placements:[], installments:[], saldi:[], settings:{}, yukiOpen:[],
           flexWeken:[], flexPl:[], flexAfspr:[], budget:[], actuals:[],
           tarieven:[], loans:[], loanPayments:[], tx:[], dismissed:[] };
}

async function veiligQ(tabel, orderCol, asc=true){
  try{
    let q = CRM.sb.from(tabel).select('*');
    if(orderCol) q = q.order(orderCol, {ascending:asc});
    const r = await q;
    if(r.error){ _mist.push(tabel); if(!_finFout) _finFout = r.error; return null; }
    return r.data || [];
  }catch(e){ _mist.push(tabel); if(!_finFout) _finFout = e; return null; }
}

async function finLaad(force=false){
  /* Interne testhaak: zet in de console `CRM._finMock = {placements:[…],…}`
     en roep CRM.render() aan om de renderpaden zonder echte data te testen. */
  if(CRM._finMock) return Object.assign(legeFin(), {demo:false}, CRM._finMock);
  if(_fin && !force) return _fin;
  /* Harde grens: zonder geldrecht wordt er géén fin_-tabel bevraagd. */
  if(!CRM.canSeeMoney()) return null;
  if(CRM.demo){ _fin = Object.assign(legeFin(), {demo:true}); return _fin; }

  _mist = []; _finFout = null;
  const [pl, inst, sal, st, yo, fw, fp, fa, bud, act, trf, ln, lp, tx, dis] = await Promise.all([
    veiligQ('fin_placements','id'),        veiligQ('fin_installments','geplande_datum'),
    veiligQ('fin_bank_saldo','datum',false),veiligQ('fin_settings'),
    veiligQ('fin_yuki_open','datum'),      veiligQ('fin_flex_weken','week'),
    veiligQ('fin_flex_plaatsingen','id'),  veiligQ('fin_flex_afspraken','klant'),
    veiligQ('fin_costs_budget','vanaf_maand'), veiligQ('fin_costs_actual','maand'),
    veiligQ('fin_tarieven','klant'),       veiligQ('fin_loans','id'),
    veiligQ('fin_loan_payments','datum'),  veiligQ('fin_bank_tx','datum',false),
    veiligQ('fin_dismissed_candidates')
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
    actuals:      act||[],
    tarieven:     trf||[],
    loans:        ln||[],
    loanPayments: lp||[],
    tx:           tx||[],
    dismissed:    dis||[]
  };
  return _fin;
}

/* Instelling ophalen — zelfde semantiek als S() in de finance-app. */
const S = (f, key, fallback=null) => {
  const v = f && f.settings ? f.settings[key] : undefined;
  return (v === undefined || v === null) ? fallback : v;
};
const Sn = (f, key, fallback=0) => { const v = Number(S(f, key, fallback)); return isFinite(v) ? v : fallback; };

/* ─── Bordkandidaten & targets ────────────────────────────────
   De finance-app leest de tabel `candidates` rechtstreeks; het CRM heeft
   dezelfde rijen al in CRM.state.cands staan. We gebruiken de RUWE rijen
   (snake_case) zodat elke formule letterlijk overeenkomt met calc.js.
   Enige aanpassing: de eerste fase heet in het CRM 'Intake' waar de
   finance-app nog 'Voorselectie' kent — dat loopt via CRM.faseNorm.     */
const cands = () => (CRM.state && CRM.state.cands) ? CRM.state.cands : [];
const faseVan = c => CRM.faseNorm ? CRM.faseNorm(c && c.fase) : (c && c.fase);
const PLACED_FASES = ['Contract getekend','Gestart'];
const isPlaced = c => PLACED_FASES.includes(faseVan(c));
/* flex = detachering (oud label); accepteer beide zodat resterende data niet lekt */
const isFlexType = t => { const x = String(t||'').toLowerCase(); return x==='flex' || x==='detachering'; };

/* Maandtarget zoals het bord hem kent. De finance-app zoekt '__default',
   het CRM schrijft '__default__' (instellingen.js schrijft allebei) —
   hier accepteren we beide, anders valt het target stil terug op 8. */
function boardTarget(mk7){
  const T = (CRM.state && CRM.state.targets) || [];
  const s = T.find(x => x.maand === mk7);
  if(s) return Number(s.aantal) || 0;
  const d = T.find(x => x.maand === '__default__') || T.find(x => x.maand === '__default');
  return d ? (Number(d.aantal) || 0) : 8;
}

/* ═══════════════════════════════════════════════════════════════
   REKENKERN — letterlijk overgezet uit ~/ploeggenoten-finance/js/calc.js.
   Iedere functie krijgt `f` (de geladen finance-data) als eerste argument;
   verder is de logica regel voor regel gelijk aan de bron-app.
   ═══════════════════════════════════════════════════════════════ */

/* bron: calc.js instOf() */
const instOf = (f, pid) => f.installments.filter(i => i.placement_id === pid)
  .slice().sort((a,b) => (a.termijn_nr||0) - (b.termijn_nr||0));

/* bron: calc.js vervaldatum() — factuurdatum (of geplande datum) + betaaltermijn */
function vervaldatum(inst, p){
  const basis = inst.factuurdatum || inst.geplande_datum;
  return basis ? addDays(basis, Number(p && p.betaaltermijn_dgn) || 14) : null;
}

/* bron: calc.js placementStats() */
function placementStats(f, p){
  const ins = instOf(f, p.id);
  const som = fn => ins.filter(fn).reduce((t,i) => t + bedragVan(i), 0);
  const gefact    = som(i => i.status==='gefactureerd' || i.status==='betaald');
  const betaald   = som(i => i.status==='betaald');
  const open      = som(i => i.status==='gefactureerd');
  const nog       = som(i => i.status==='te_factureren');
  const vervallen = som(i => i.status==='vervallen');
  const nActief = ins.filter(i => i.status!=='vervallen').length;
  const nGefact = ins.filter(i => i.status==='gefactureerd' || i.status==='betaald').length;
  const next    = ins.find(i => i.status==='te_factureren');
  let status = 'Nog niets gefactureerd', kleur = '';
  if(nGefact > 0 && nog > 0){ status = 'Deels gefactureerd'; kleur = 'blue'; }
  else if(nGefact > 0 && nog === 0){ status = 'Volledig gefactureerd'; kleur = 'green'; }
  if(p.gestopt_op){ status += ' · gestopt'; kleur = vervallen > 0 ? 'red' : kleur; }
  return {ins, gefact, betaald, open, nog, vervallen, nActief, nGefact, next, status, kleur};
}

/* bron: calc.js garantie() */
function garantie(f, p){
  const start = p.contract_datum;
  if(!p.garantie_mnd || !start) return {actief:false, tot:null, vervangingNodig:false};
  const tot = addMonths(start, Number(p.garantie_mnd));
  const actief = !p.gestopt_op && todayISO() <= tot;
  const vervangingNodig = !!p.gestopt_op && p.gestopt_op <= tot && !p.vervangen_door;
  return {actief, tot, vervangingNodig};
}

/* bron: calc.js stopImpact() — welke termijnen horen te vervallen na een stop */
function stopImpact(f, p){
  if(!p.gestopt_op) return [];
  const grens = addMonths(p.gestopt_op, Sn(f,'stop_achterstand_mnd',1));
  return instOf(f, p.id).filter(i =>
    i.status==='te_factureren' && i.geplande_datum && i.geplande_datum > grens);
}

/* bron: calc.js kpis() */
function kpis(f){
  const t = todayISO(), mk7 = t.slice(0,7);
  const all = f.installments;
  const som = fn => all.filter(fn).reduce((s,i) => s + bedragVan(i), 0);
  const feeTot = f.placements.reduce((s,p) => s + Number(p.fee_excl||0), 0);
  /* Omzet deze maand = wat er deze maand is GEFACTUREERD (factuurdatum),
     niet wat er gepland stond. Dat is de definitie van de bron-app. */
  const omzetDezeMaand = som(i => String(i.factuurdatum||'').slice(0,7)===mk7
    && (i.status==='gefactureerd' || i.status==='betaald'));
  const paidKnown = all.filter(i => i.status==='betaald' && i.factuurdatum && i.betaaldatum);
  const dso = paidKnown.length
    ? Math.round(paidKnown.reduce((s,i) => s + (daysBetween(i.factuurdatum, i.betaaldatum)||0), 0) / paidKnown.length)
    : null;
  const plYtd = f.placements.filter(p => String(p.contract_datum||'').slice(0,4) === t.slice(0,4));
  const gemFee = plYtd.length ? plYtd.reduce((s,p) => s + Number(p.fee_excl||0), 0) / plYtd.length : 0;
  const gestopt = f.placements.filter(p => p.gestopt_op).length;
  return {
    feeTot,
    nogTeFactureren: som(i => i.status==='te_factureren'),
    openstaand:      som(i => i.status==='gefactureerd'),
    vervallen:       som(i => i.status==='vervallen'),
    omzetDezeMaand, dso,
    plaatsingenYtd: plYtd.length, gemFee,
    stopPct: f.placements.length ? gestopt / f.placements.length : 0,
    nGestopt: gestopt
  };
}

/* bron: calc.js perKlantStats() */
function perKlantStats(f){
  const per = {};
  for(const p of f.placements){
    const st = placementStats(f, p);
    const k = per[p.klant] = per[p.klant] ||
      {klant:p.klant, n:0, fee:0, gefact:0, betaald:0, open:0, nog:0, vervallen:0, gestopt:0};
    k.n++; k.fee += Number(p.fee_excl||0);
    k.gefact += st.gefact; k.betaald += st.betaald; k.open += st.open;
    k.nog += st.nog; k.vervallen += st.vervallen;
    if(p.gestopt_op) k.gestopt++;
  }
  const rows = Object.values(per).map(k => ({...k, netto: k.fee - k.vervallen}));
  const totNetto = rows.reduce((s,r) => s + r.netto, 0) || 1;
  /* winst-indicatie: bedrijfsbrede marge (liefst live uit Yuki) naar omzet-aandeel */
  const omzetY = Sn(f,'yuki_omzet_ytd',0);
  const marge = omzetY > 0 ? Sn(f,'yuki_winst_ytd',0) / omzetY : null;
  rows.forEach(r => { r.aandeel = r.netto/totNetto; r.winstIndicatie = marge!=null ? r.netto*marge : null; });
  return rows.sort((a,b) => b.netto - a.netto);
}

/* bron: calc.js concentratie() */
function concentratie(f){
  const per = {};
  for(const p of f.placements){
    const st = placementStats(f, p);
    per[p.klant] = (per[p.klant]||0) + (Number(p.fee_excl||0) - st.vervallen);
  }
  const tot = Object.values(per).reduce((a,b) => a+b, 0) || 1;
  const rows = Object.entries(per).map(([klant,bedrag]) => ({klant, bedrag, aandeel: bedrag/tot}))
    .sort((a,b) => b.bedrag - a.bedrag);
  return {rows, top1: rows[0]||null, top3: rows.slice(0,3).reduce((s,r) => s + r.aandeel, 0)};
}

/* ─── Kosten per maand (bron: calc.js budgetVoorMaand/actueelVoorMaand) ───
   Budgetposten gelden van `vanaf_maand` t/m `tot_maand` (null = doorlopend).
   Vergelijken op 'YYYY-MM' is toleranter dan op de volle datum en geeft
   voor 'YYYY-MM-01'-rijen exact dezelfde uitkomst.                        */
function budgetVoorMaand(f, mk){
  const m7 = String(mk).slice(0,7);
  return f.budget
    .filter(b => String(b.vanaf_maand||'').slice(0,7) <= m7
              && (!b.tot_maand || String(b.tot_maand).slice(0,7) >= m7))
    .reduce((s,b) => s + Number(b.bedrag_pm||0), 0);
}
/* Werkelijke kosten: de Yuki-sync schrijft één regel 'Werkelijk totaal (Yuki)'
   per afgesloten maand — die is dan leidend boven de losse posten. */
function actueelInfo(f, mk){
  const m7 = String(mk).slice(0,7);
  const rows = f.actuals.filter(a => String(a.maand||'').slice(0,7) === m7);
  const yuki = rows.find(a => a.categorie === 'Werkelijk totaal (Yuki)');
  if(yuki) return {bedrag: Number(yuki.bedrag)||0, yuki:true, rows};
  if(!rows.length) return null;
  return {bedrag: rows.reduce((s,a) => s + Number(a.bedrag||0), 0), yuki:false, rows};
}
const actueelVoorMaand = (f, mk) => { const a = actueelInfo(f, mk); return a ? a.bedrag : null; };
/* Kosten die de projectie gebruikt: werkelijk waar bekend, anders budget. */
const kostenVoorMaand = (f, mk) => { const a = actueelVoorMaand(f, mk); return a==null ? budgetVoorMaand(f, mk) : a; };

/* ─── Flex (bron: calc.js flexStats / flexPlBerekening / flexPlStats) ─── */
function flexAfspraakVoor(f, klant){
  return f.flexAfspr.find(a => CRM.zelfdeKlant(a.klant, klant)) || null;
}
function flexPlBerekening(f, fp){
  const afspr = flexAfspraakVoor(f, fp.klant);
  const inkoopDefault = Sn(f,'flex_inkoop_factor',1.8) || 1.8;
  const klantfactor = Number(fp.klantfactor) || (afspr ? Number(afspr.factor) : null);
  const inkoop = Number(fp.inkoop_factor) || (afspr ? Number(afspr.inkoop_factor) : inkoopDefault) || inkoopDefault;
  const overnameUren = fp.overname_uren != null ? Number(fp.overname_uren)
                     : (afspr ? Number(afspr.overname_uren) : null);
  const uurloon = Number(fp.uurloon) || null;
  const urenPw  = Number(fp.uren_pw) || 40;
  const compleet = !!(klantfactor && uurloon);
  const margePerUur = compleet ? (klantfactor - inkoop) * uurloon : null;
  const gewerkteUren = fp.gewerkte_uren != null ? Number(fp.gewerkte_uren) : null;
  /* werkelijke marge uit de Pronkert-facturen (incl. overwerk) — leidend boven het model */
  const margeWerkelijk = fp.marge_werkelijk != null ? Number(fp.marge_werkelijk) : null;
  return {
    klantfactor, inkoop, uurloon, urenPw, overnameUren, compleet, margePerUur,
    gewerkteUren, margeWerkelijk,
    margePerWeek:  compleet ? margePerUur * urenPw : null,
    margePerMaand: compleet ? margePerUur * urenPw * 52/12 : null,
    overnameWaarde: (compleet && overnameUren) ? margePerUur * overnameUren : null,
    resterendUren: (overnameUren && gewerkteUren!=null) ? Math.max(0, overnameUren - gewerkteUren) : null,
    verdiend: margeWerkelijk != null ? margeWerkelijk
            : (compleet && gewerkteUren != null ? margePerUur * gewerkteUren : null)
  };
}
function flexPlStats(f){
  const actief  = f.flexPl.filter(x => !x.gestopt_op);
  const gestopt = f.flexPl.filter(x =>  x.gestopt_op);
  const rows        = actief.map(x => ({f:x, ...flexPlBerekening(f, x)}));
  const gestoptRows = gestopt.map(x => ({f:x, ...flexPlBerekening(f, x)}));
  const compleet = rows.filter(r => r.compleet);
  return {
    rows, gestoptRows,
    nActief: actief.length, nGestopt: gestopt.length,
    nCompleet: compleet.length, nConcept: rows.filter(r => r.f.concept).length,
    margePerMaand: compleet.reduce((s,r) => s + (r.margePerMaand||0), 0),
    overnamePotentieel: compleet.reduce((s,r) => s + (r.overnameWaarde||0), 0),
    verdiendTotaal: [...rows, ...gestoptRows].reduce((s,r) => s + (r.verdiend||0), 0),
    verdiendAfgerond: gestoptRows.reduce((s,r) => s + (r.verdiend||0), 0)
  };
}
/* Wekelijkse marge-uitkering Pronkert: run-rate = gemiddelde laatste 4 weken × 52/12 */
function flexStats(f){
  const wk = f.flexWeken.slice().sort((a,b) => String(a.week).localeCompare(String(b.week)));
  const som = arr => arr.reduce((s,w) => s + Number(w.bedrag||0), 0);
  const last4 = wk.slice(-4), prev4 = wk.slice(-8,-4);
  const avg4 = last4.length ? som(last4)/last4.length : 0;
  const avgPrev4 = prev4.length ? som(prev4)/prev4.length : null;
  const trendPct = (avgPrev4) ? (avg4 - avgPrev4)/avgPrev4 : null;
  const laatste = wk[wk.length-1] || null;
  const ytd = som(wk.filter(w => String(w.week||'').slice(0,4) === todayISO().slice(0,4)));
  return {weken:wk, laatste, avg4, avgPrev4, trendPct, maandRunRate: avg4*52/12, ytd};
}
const flexInMaand = (f, mk) => f.flexWeken
  .filter(w => monthKey(w.week) === monthKey(mk))
  .reduce((s,w) => s + Number(w.bedrag||0), 0);

/* ─── Belastingpotjes (bron: calc.js potjes()) ─────────────────
   Indicatief, factuurstelsel. Btw = ontvangen btw dit kwartaal − voorbelasting.
   Vpb = % over winst YTD, waar mogelijk verankerd op het Yuki-cijfer.        */
function potjes(f){
  const t = todayISO(), y = +t.slice(0,4), q = Math.floor((+t.slice(5,7) - 1)/3);
  const qStart = `${y}-${String(q*3+1).padStart(2,'0')}-01`;
  const btwPct = Sn(f,'btw_pct',0.21);
  const inQ = f.installments.filter(i => i.factuurdatum && i.factuurdatum >= qStart && i.factuurdatum <= t
    && (i.status==='gefactureerd' || i.status==='betaald'));
  const flexQ = f.flexWeken.filter(w => w.week >= qStart && w.week <= t)
    .reduce((s,w) => s + Number(w.bedrag||0), 0);
  const btwOntvangen = inQ.reduce((s,i) => s + bedragVan(i)*btwPct, 0) + flexQ*btwPct;
  const mndInQ = (+t.slice(5,7) - 1) % 3 + 1;
  const voorbelasting = Sn(f,'voorbelasting_pm',0) * mndInQ;
  const btwPot = Math.max(0, btwOntvangen - voorbelasting);

  const ankerWinst = Sn(f,'yuki_winst_ytd',0);
  const ankerDatum = S(f,'yuki_winst_datum',null);
  const start = (ankerDatum && String(ankerDatum).slice(0,4) === String(y)) ? String(ankerDatum) : `${y}-01-01`;
  const basisWinst = (ankerDatum && start === String(ankerDatum)) ? ankerWinst : 0;
  const omzetYtd = basisWinst
    + f.installments.filter(i => i.factuurdatum && i.factuurdatum > start
        && (i.status==='gefactureerd' || i.status==='betaald')).reduce((s,i) => s + bedragVan(i), 0)
    + f.flexWeken.filter(w => w.week > start && String(w.week).slice(0,4) === String(y))
        .reduce((s,w) => s + Number(w.bedrag||0), 0);
  /* het deel van de TVE-uitkering boven de fee is RC-aflossing (balans), géén kosten */
  const rcAfbouwPm = Math.max(0, Sn(f,'mgmt_uitkering_pm',0) - Sn(f,'mgmt_fee_pm',0));
  let kostenYtd = 0;
  for(let m=0; m<12; m++){
    const mk = `${y}-${String(m+1).padStart(2,'0')}-01`;
    if(mk > monthKey(t)) break;
    if(mk <= monthKey(start)) continue;   // maanden t/m het anker zitten al in de ankerwinst
    kostenYtd += kostenVoorMaand(f, mk) - rcAfbouwPm;
  }
  const winstYtd = omzetYtd - kostenYtd;
  const vpbPot = Math.max(0, winstYtd * Sn(f,'vpb_pct',0.19));
  return {btwPot, btwOntvangen, voorbelasting, vpbPot, winstYtd, omzetYtd, kostenYtd};
}

/* bron: calc.js yukiBewaking() — klopt de app-administratie met de boekhouding? */
function yukiBewaking(f){
  if(!S(f,'yuki_synced_at')) return null;
  const btw = 1 + Sn(f,'btw_pct',0.21);
  const appOpenIncl = f.installments.filter(i => i.status==='gefactureerd')
    .reduce((s,i) => s + bedragVan(i)*btw, 0);
  const yukiDeb = Sn(f,'yuki_debiteuren',0);
  return {appOpenIncl, yukiDeb, verschil: appOpenIncl - yukiDeb,
          crediteuren: Sn(f,'yuki_crediteuren_open',0)};
}

/* ─── Plaatsingen zoals het bord ze telt (bron: calc.js boardPlaatsingen) ───
   Geplaatst in de maand (W&S + flex), minus wie deze maand gestopt is
   (garantievervangers tellen niet mee). LET OP: dit wijkt bewust af van
   CRM.plaatsingenMaand(), dat iemand die dezelfde maand tekende én stopte
   twee keer aftrekt en dan op −1 uitkomt. Hier telt hij als 0, gelijk aan
   de finance-app en de teller op het pijplijnbord.                       */
function boardPlaatsingen(mk7){
  const cs = cands();
  const gross = cs.filter(c => String(c.geplaatst_op||'').slice(0,7) === mk7);
  const ws   = gross.filter(c => c.type === 'W&S').length;
  const flex = gross.filter(c => isFlexType(c.type)).length;
  const onb  = gross.length - ws - flex;
  const stopM = cs.filter(c => faseVan(c) === 'Gestopt'
    && String(c.gestopt_op||'').slice(0,7) === mk7 && c.geplaatst_op && !(c.vervangt||'')).length;
  return {gross: gross.length, ws, flex, onb, stopM, netto: gross.length - stopM};
}

/* bron: calc.js targetInfo() */
function targetInfo(f){
  const mk7 = todayISO().slice(0,7);
  const bp = boardPlaatsingen(mk7);
  const aantalTarget = boardTarget(mk7);
  const gemFee = kpis(f).gemFee || 8500;
  const omzetTarget = Sn(f,'target_omzet_pm',0) || (aantalTarget ? aantalTarget*gemFee : null);
  return {aantalTarget, plaatsingen: bp.netto, board: bp, gemFee, omzetTarget, maand: mk7};
}

/* bron: calc.js recruiterVoortgang() */
function recruiterVoortgang(f){
  const mk7 = todayISO().slice(0,7);
  const tgt = targetInfo(f).aantalTarget;
  const per = {}, actief = new Set();
  for(const c of cands()){
    const rec = (String(c.rec||'').trim()) || 'Samen';
    if(!['Afgevallen','Gestopt'].includes(faseVan(c))) actief.add(rec);
    if(String(c.geplaatst_op||'').slice(0,7) === mk7 && !(c.vervangt||'')) per[rec] = (per[rec]||0)+1;
  }
  const recs = [...new Set([...Object.keys(per), ...actief])].filter(r => r && r !== 'Samen');
  if(!recs.length) recs.push(...Object.keys(per));
  const overrides = S(f,'recruiter_targets',{}) || {};
  const nRec = recs.length || 1;
  const rows = recs.map(rec => {
    const gedaan = per[rec] || 0;
    const doel = overrides[rec] != null ? Number(overrides[rec]) : (tgt ? Math.round(tgt/nRec) : 0);
    return {rec, gedaan, doel, gelijkVerdeeld: overrides[rec] == null};
  }).sort((a,b) => b.gedaan - a.gedaan || String(a.rec).localeCompare(String(b.rec)));
  return {rows, tgt, maand: mk7, somDoel: rows.reduce((s,r) => s + r.doel, 0)};
}

/* ─── Gewogen pijplijn-forecast (bron: calc.js) ──────────────── */
const FASE_KANSEN_DEFAULT = {
  /* Intake/Voorselectie telt bewust NIET mee (te vroeg om te wegen) */
  'Voorgesteld': .05, 'O&O sessie': .10,
  'Eerste gesprek': .20, 'Tweede gesprek': .40, 'Meeloopdag': .50,
  'In de wacht': .50, 'Offer': .65, 'Contract ondertekenen': .75
};
const FASE_LEAD_WKN = {
  'Voorgesteld':8, 'Intake':8, 'O&O sessie':6,
  'Eerste gesprek':6, 'Tweede gesprek':5, 'Meeloopdag':4,
  'In de wacht':8, 'Offer':3, 'Contract ondertekenen':2
};
/* Funnelvolgorde; 'Intake' staat waar de finance-app 'Voorselectie' heeft. */
const FUNNEL = ['Intake','Voorgesteld','O&O sessie','Eerste gesprek','Tweede gesprek',
  'Meeloopdag','In de wacht','Offer','Contract ondertekenen','Contract getekend','Gestart'];
const PLAATSING_IDX = FUNNEL.indexOf('Contract getekend');

function furthestIdx(c){
  let idx = FUNNEL.indexOf(faseVan(c));
  if(Array.isArray(c.historie)) for(const hh of c.historie){
    const i = FUNNEL.indexOf(CRM.faseNorm ? CRM.faseNorm(hh && hh.fase) : (hh && hh.fase));
    if(i > idx) idx = i;
  }
  if(c.geplaatst_op && idx < PLAATSING_IDX) idx = PLAATSING_IDX;
  return idx;
}
const isResolvedCand = c => ['Contract getekend','Gestart','Afgevallen','Gestopt'].includes(faseVan(c)) || !!c.geplaatst_op;
const reachedPlacement = c => !!c.geplaatst_op || furthestIdx(c) >= PLAATSING_IDX;

/* Tarief opzoeken (bron: calc.js tariefVoor): eerst klant+functie, dan klant-standaard */
function tariefVoor(f, bordKlant, functie){
  const rijen = f.tarieven.filter(r => CRM.zelfdeKlant(r.klant, bordKlant));
  if(!rijen.length) return null;
  const nf = String(functie||'').toLowerCase();
  const opFunctie = rijen.find(r => r.functie && nf &&
    (nf.includes(String(r.functie).toLowerCase()) || String(r.functie).toLowerCase().includes(nf)));
  const standaard = rijen.find(r => !r.functie);
  const rij = opFunctie || standaard || rijen[0];
  return {pct: Number(rij.tarief_pct), rij};
}
/* bron: calc.js jaarSalaris() — VT default 8%, over loon incl. ploegentoeslag */
function jaarSalaris(c, loon){
  const ploeg = Number(c.toeslag_pct||0);
  const vt = (c.vt_pct == null || c.vt_pct === '') ? 8 : Number(c.vt_pct);
  const eju = Number(c.eju_pct||0), overig = Number(c.overig_pct||0);
  const jr = loon*12;
  return jr * (1+ploeg/100) * (1+vt/100) + jr*eju/100 + jr*overig/100;
}
/* bron: calc.js feeBerekening() — alleen het bedrag; de wizard blijft in de finance-app */
function feeBerekening(f, c){
  const tarief = tariefVoor(f, c.klant, c.functie);
  const loonNote = String(c.note||'').match(/\b([2-6]\d{3})\b/);
  const loon = Number(c.maandloon) || (loonNote ? Number(loonNote[1]) : null);
  if(loon && tarief) return {fee: Math.round(jaarSalaris(c, loon) * tarief.pct), zeker:true};
  if(loon) return {fee: Math.round(jaarSalaris(c, loon) * Sn(f,'fee_pct',0.22)), zeker:false};
  return null;
}

/* bron: calc.js pipelineForecast() */
function pipelineForecast(f){
  const kansen = Object.assign({}, FASE_KANSEN_DEFAULT, S(f,'fase_kansen',{}) || {});
  const k = kpis(f);
  const fee = k.gemFee || 8500;
  const behoud = 1 - (k.stopPct || 0);
  const t = todayISO();
  const linked = new Set(f.placements.map(p => p.pipeline_candidate_id).filter(Boolean));
  const rows = cands().filter(c =>
      kansen[faseVan(c)] > 0 && !isFlexType(c.type) && !(c.vervangt||'') && !linked.has(c.id))
    .map(c => {
      const kans = kansen[faseVan(c)];
      const plaatsing = (c.start && c.start > t) ? String(c.start).slice(0,10)
                      : addDays(t, (FASE_LEAD_WKN[faseVan(c)] || 6) * 7);
      const cash = monthKey(addDays(plaatsing, 30));   // factuur + betaaltermijn ≈ 1 mnd later
      const fb = c.maandloon ? feeBerekening(f, c) : null;
      const cFee = (fb && fb.fee) ? fb.fee : fee;
      return {c, kans, fee:cFee, feeEcht: !!(fb && fb.fee), gewogen: cFee*kans,
              netto: cFee*kans*behoud, plaatsing, cashMaand: cash};
    })
    .sort((a,b) => b.kans - a.kans);
  const perMaand = {}, perMaandAantal = {}, perMaandPlaatsMaand = {};
  for(const r of rows){
    perMaand[r.cashMaand] = (perMaand[r.cashMaand]||0) + r.gewogen;
    perMaandAantal[r.cashMaand] = (perMaandAantal[r.cashMaand]||0) + r.kans;
    const pm = monthKey(r.plaatsing);
    perMaandPlaatsMaand[pm] = (perMaandPlaatsMaand[pm]||0) + r.kans;
  }
  return {rows,
    totaal: rows.reduce((s,r) => s + r.gewogen, 0),
    totaalNetto: rows.reduce((s,r) => s + r.netto, 0),
    behoud, perMaand, perMaandAantal, perMaandPlaatsMaand,
    verwachtAantal: rows.reduce((s,r) => s + r.kans, 0)};
}

/* bron: calc.js conversieKeten() */
function conversieKeten(filter){
  filter = filter || {};
  let resolved = cands().filter(c => !isFlexType(c.type) && !(c.vervangt||'') && isResolvedCand(c));
  if(filter.klant) resolved = resolved.filter(c => c.klant === filter.klant);
  if(filter.rec)   resolved = resolved.filter(c => String(c.rec||'').trim() === filter.rec);
  const idxO = FUNNEL.indexOf('In de wacht');
  const isOffer = c => furthestIdx(c) >= idxO || c.afval_type === 'offer_afgewezen' || reachedPlacement(c);
  const voorstellen = resolved.length;
  const offers = resolved.filter(isOffer).length;
  const geplaatst = resolved.filter(reachedPlacement);
  const plaats = geplaatst.length;
  const blijft = geplaatst.filter(c => !c.gestopt_op).length;
  const duurzaam = geplaatst.filter(c => {
    if(!c.gestopt_op) return true;
    const ref = c.start || c.geplaatst_op, g = Number(c.garantie_mnd) || 0;
    return !!(ref && g && c.gestopt_op > addMonths(ref, g));
  }).length;
  const r = (a,b) => b > 0 ? a/b : null;
  return {voorstellen, offers, plaats, blijft, duurzaam,
    voorPerOffer: r(voorstellen, offers), offerPerPlaatsing: r(offers, plaats),
    voorPerPlaatsing: r(voorstellen, plaats), voorPerBlijver: r(voorstellen, blijft),
    pctOffer: r(offers, voorstellen), pctPlaats: r(plaats, offers),
    pctBlijft: r(blijft, plaats), pctDuurzaam: r(duurzaam, plaats),
    lijsten: {voorstellen: resolved, offers: resolved.filter(isOffer), plaats: geplaatst,
              blijft: geplaatst.filter(c => !c.gestopt_op)}};
}

/* bron: calc.js kanaalStats() / teamStats() */
function kanaalStats(f){
  const per = {};
  for(const p of f.placements){
    const c = cands().find(x => x.id === p.pipeline_candidate_id);
    const bron = (String(c && c.bron || 'Onbekend').trim()) || 'Onbekend';
    const st = placementStats(f, p);
    per[bron] = per[bron] || {n:0, omzet:0};
    per[bron].n++; per[bron].omzet += Number(p.fee_excl||0) - st.vervallen;
  }
  return Object.entries(per).map(([bron,v]) => ({bron, ...v})).sort((a,b) => b.omzet - a.omzet);
}
function teamStats(f){
  const per = {}; let ttfSom = 0, ttfN = 0;
  for(const p of f.placements){
    const c = cands().find(x => x.id === p.pipeline_candidate_id);
    if(!c) continue;
    const rec = (String(c.rec||'Samen').trim()) || 'Samen';
    per[rec] = per[rec] || {n:0, omzet:0};
    per[rec].n++; per[rec].omzet += Number(p.fee_excl||0) - placementStats(f, p).vervallen;
    if(c.since && c.geplaatst_op && c.geplaatst_op > c.since){
      const d = daysBetween(c.since, c.geplaatst_op); if(d != null){ ttfSom += d; ttfN++; }
    }
  }
  return {recruiters: Object.entries(per).map(([rec,v]) => ({rec, ...v})).sort((a,b) => b.omzet - a.omzet),
          timeToFill: ttfN ? Math.round(ttfSom/ttfN) : null};
}

/* bron: calc.js tariefAdvies() */
function tariefAdvies(f){
  const t = todayISO(), y = t.slice(0,4);
  const verstrekenMnd = Math.max(1, +t.slice(5,7) - 1 + (+t.slice(8,10))/30);
  const per = {};
  for(const p of f.placements){
    if(String(p.contract_datum||'').slice(0,4) !== y) continue;
    const st = placementStats(f, p);
    const k = per[p.klant] = per[p.klant] || {klant:p.klant, n:0, netto:0, gestopt:0};
    k.n++; k.netto += Number(p.fee_excl||0) - st.vervallen;
    if(p.gestopt_op) k.gestopt++;
  }
  const rows = Object.values(per).map(k => {
    const tr = tariefVoor(f, k.klant, '');
    return {...k, pct: tr ? tr.pct : null, jaarNetto: k.netto*12/verstrekenMnd};
  });
  const met = rows.filter(r => r.pct && r.netto > 0);
  const totNetto = met.reduce((s,r) => s + r.netto, 0) || 1;
  const bench = met.length ? met.reduce((s,r) => s + r.pct*r.netto, 0)/totNetto : null;
  rows.forEach(r => {
    r.bench = bench;
    r.potentie = (r.pct && bench && r.pct < bench - 0.002) ? r.jaarNetto*(bench - r.pct)/r.pct : 0;
  });
  return {rows: rows.sort((a,b) => b.potentie - a.potentie || b.netto - a.netto), bench};
}

/* ─── Actielijst (bron: calc.js acties(), inboxCandidates(), stopSignalen()) ─── */
function inboxCandidates(f){
  const linked    = new Set(f.placements.map(p => p.pipeline_candidate_id).filter(Boolean));
  const dismissed = new Set(f.dismissed.map(d => d.candidate_id));
  const byName    = new Set(f.placements.map(p => String(p.kandidaat||'').trim().toLowerCase()).filter(Boolean));
  return cands().filter(c =>
    (isPlaced(c) || (c.geplaatst_op && faseVan(c) === 'Gestopt')) &&
    !isFlexType(c.type) && !(c.vervangt||'') &&
    !linked.has(c.id) && !dismissed.has(c.id) &&
    (c.herstart_van ? true : !byName.has(String(c.naam||'').trim().toLowerCase())));
}
function stopSignalen(f){
  const out = [];
  for(const p of f.placements){
    if(p.gestopt_op || !p.pipeline_candidate_id) continue;
    const c = cands().find(x => x.id === p.pipeline_candidate_id);
    if(c && c.gestopt_op) out.push({p, c});
  }
  return out;
}
function acties(f){
  const t = todayISO(), warnDgn = Sn(f,'waarschuwing_dgn',21);
  const list = [];
  for(const p of f.placements){
    if(p.concept){
      list.push({soort:'concept', urg:2, p,
        txt:`Nieuwe plaatsing ${p.id} vanaf het bord — fee geschat op ${eur(p.fee_excl)}. Bevestig de fee én het factuurschema`});
      continue;
    }
    const st = placementStats(f, p);
    for(const i of st.ins){
      if(i.status==='te_factureren' && i.geplande_datum){
        const dd = daysBetween(t, i.geplande_datum);
        if(dd == null) continue;
        if(dd < 0)        list.push({soort:'factureren', urg:2, p, i, txt:`Factuurdatum ${dOf(i.geplande_datum)} GEMIST (${-dd} dgn)`});
        else if(dd === 0) list.push({soort:'factureren', urg:2, p, i, txt:'Vandaag factureren'});
        else if(dd <= warnDgn) list.push({soort:'factureren', urg:1, p, i, txt:`Factureren over ${dd} dgn (${dOf(i.geplande_datum)})`});
      }
      if(i.status==='gefactureerd'){
        const vv = vervaldatum(i, p);
        const late = vv ? (daysBetween(vv, t) || 0) : 0;
        if(late > 0) list.push({soort:'te_laat', urg:2, p, i, txt:`Betaling ${late} dgn te laat (vervallen ${dOf(vv)})`});
      }
    }
    const g = garantie(f, p);
    if(g.vervangingNodig) list.push({soort:'vervanging', urg:2, p,
      txt:`Vervanging leveren — gestopt ${dOf(p.gestopt_op)} binnen garantie`});
    const si = stopImpact(f, p);
    if(si.length) list.push({soort:'stop', urg:1, p,
      txt:`${si.length} termijn(en) laten vervallen na stop (${eur(si.reduce((s,i) => s + bedragVan(i), 0))})`});
    if(p.pipeline_candidate_id){
      const cc = cands().find(x => x.id === p.pipeline_candidate_id);
      if(cc && !['Contract getekend','Gestart','Gestopt'].includes(faseVan(cc)) && (st.gefact > 0 || st.betaald > 0))
        list.push({soort:'terug', urg:2, p,
          txt:`${p.kandidaat} staat op het bord terug op "${faseVan(cc)}" (niet meer getekend), maar er is al gefactureerd — controleer`});
    }
  }
  for(const c of inboxCandidates(f))
    list.push({soort:'afronden', urg:1, c, txt:`${c.naam} (${c.klant||'?'}) — plaatsing afronden`});
  for(const {p, c} of stopSignalen(f))
    list.push({soort:'stop_signaal', urg:2, p, c,
      txt:`${p.kandidaat} staat op het bord als gestopt (${dOf(c.gestopt_op)}) — verwerken`});
  const saldo = f.saldi[0];
  const saldoOud = saldo ? daysBetween(saldo.datum, t) : null;
  if(!saldo || (saldoOud != null && saldoOud > 14))
    list.push({soort:'saldo', urg:1, txt: saldo ? `Banksaldo ${saldoOud} dgn oud — werk bij` : 'Vul je banksaldo in'});
  if(f.flexWeken.length){
    const laatste = f.flexWeken.reduce((a,w) => (w.week > a ? w.week : a), '');
    const dgn = laatste ? (daysBetween(laatste, t) || 0) : 999;
    if(dgn > 21) list.push({soort:'flex', urg:1,
      txt:`Al ${Math.floor(dgn/7)} weken geen flex-marge geïmporteerd — check de Pronkert-facturen`});
  }
  return list.sort((a,b) => b.urg - a.urg);
}

/* ─── Cashflow-projectie (bron: calc.js projectie()) ───────────
   Alle bedragen INCL. btw, want dat is wat er op de bank komt/afgaat.
   Ontvangst = geplande factuurdatum + betaaltermijn. Btw-afdracht in
   jan/apr/jul/okt over het vorige kwartaal, minus voorbelasting.       */
function projectie(f, maanden, scenario){
  maanden = maanden || 12;
  const k0 = kpis(f);
  const gemFee = k0.gemFee || Sn(f,'scenario_gem_fee',8500) || 8500;
  const behoudDefault = 1 - (k0.stopPct || 0);
  const sc = Object.assign({
    bron: 'pijplijn',
    plaatsingenPm: boardTarget(todayISO().slice(0,7)),
    omzetPm: Sn(f,'scenario_omzet_pm',25000),
    blijfkans: behoudDefault,
    omzetDipPct: 0, extraHirePm: 0, extraHireVanaf: 1, aflossenAan: true,
    flexFactor: 1
  }, scenario || {});
  const t = todayISO();
  const btwPct = Sn(f,'btw_pct',0.21);
  const start = f.saldi[0] ? Number(f.saldi[0].saldo) || 0 : 0;
  const m0 = monthKey(t);
  const keys = [], labels = [];
  for(let i=0; i<maanden; i++){ const k = addMonths(m0, i); keys.push(k); labels.push(mkLabel(k)); }
  const bucket = Object.fromEntries(keys.map(k =>
    [k, {inFact:0, inScenario:0, inFlex:0, uitKosten:0, uitBtw:0, uitLening:0}]));
  const put = (k, veld, v) => {
    if(!isFinite(v)) return;
    if(bucket[k]) bucket[k][veld] += v;
    else if(k && k < m0 && veld.startsWith('in')) bucket[m0][veld] += v;
  };

  /* 1. verwachte ontvangsten uit het echte factuurschema (incl. btw) */
  for(const p of f.placements){
    for(const i of instOf(f, p.id)){
      if(i.status==='te_factureren' && i.geplande_datum){
        put(monthKey(addDays(i.geplande_datum, Number(p.betaaltermijn_dgn) || 14)), 'inFact', bedragVan(i)*(1+btwPct));
      } else if(i.status==='gefactureerd'){
        const vv = vervaldatum(i, p) || t;
        put(monthKey(vv < t ? addDays(t, 14) : vv), 'inFact', bedragVan(i)*(1+btwPct));
      }
    }
  }
  /* 2. scenario: nieuwe W&S-omzet (facturen volgen ~1 mnd later, incl. btw) */
  const blijf = Math.max(0, Math.min(1, sc.blijfkans));
  const targetPm = sc.plaatsingenPm * gemFee * blijf;
  if(sc.bron === 'pijplijn' && cands().length){
    const pf = pipelineForecast(f);
    const horizon = Object.keys(pf.perMaand).sort().pop() || m0;
    keys.forEach((k,i) => {
      if(pf.perMaand[k]) put(k, 'inScenario', pf.perMaand[k]*blijf*(1-sc.omzetDipPct)*(1+btwPct));
      else if(k > horizon && i >= 1) put(k, 'inScenario', targetPm*(1-sc.omzetDipPct)*(1+btwPct));
    });
  } else if(sc.bron === 'target'){
    keys.forEach((k,i) => { if(i >= 1) put(k, 'inScenario', targetPm*(1-sc.omzetDipPct)*(1+btwPct)); });
  } else if(sc.bron === 'geen'){
    /* extra scenario van het CRM: helemaal geen nieuwe W&S-omzet (= runway-lijn) */
  } else {
    const omzet = sc.omzetPm*(1-sc.omzetDipPct);
    keys.forEach((k,i) => { if(i >= 1) put(k, 'inScenario', omzet*(1+btwPct)); });
  }
  /* 2b. flex: doorlopende weekmarge (run-rate × factor, incl. btw) */
  const flexPm = flexStats(f).maandRunRate * sc.flexFactor;
  keys.forEach(k => put(k, 'inFlex', flexPm*(1+btwPct)));
  /* 3. kosten: werkelijk waar bekend, anders budget (+ evt. extra hire) */
  keys.forEach((k,i) => {
    let kost = kostenVoorMaand(f, k);
    if(i >= sc.extraHireVanaf) kost += sc.extraHirePm;
    put(k, 'uitKosten', kost);
  });
  /* 4. btw-afdracht: in jan/apr/jul/okt de btw van het vorige kwartaal */
  const voorb = Sn(f,'voorbelasting_pm',0);
  keys.forEach(k => {
    const m = +String(k).slice(5,7);
    if(![1,4,7,10].includes(m)) return;
    let btwQ = 0;
    for(let j=3; j>=1; j--){
      const pk = addMonths(k, -j), b = bucket[pk];
      if(b) btwQ += (b.inFact + b.inScenario + b.inFlex)*btwPct/(1+btwPct);
      else {
        const fact = f.installments.filter(x => x.factuurdatum && monthKey(x.factuurdatum) === pk
          && (x.status==='gefactureerd' || x.status==='betaald')).reduce((s,x) => s + bedragVan(x), 0);
        btwQ += (fact + flexInMaand(f, pk))*btwPct;
      }
    }
    put(k, 'uitBtw', Math.max(0, btwQ - voorb*3));
  });
  /* 5. geplande aflossingen */
  if(sc.aflossenAan) for(const lp of f.loanPayments){
    if(lp.gepland && lp.datum >= t) put(monthKey(lp.datum), 'uitLening', Number(lp.bedrag)||0);
  }

  let saldo = start;
  const rows = keys.map((k,i) => {
    const b = bucket[k];
    const inTot  = b.inFact + b.inScenario + b.inFlex;
    const uitTot = b.uitKosten + b.uitBtw + b.uitLening;
    saldo += inTot - uitTot;
    return {key:k, label:labels[i], ...b, inTot, uitTot, saldo};
  });
  const laagste = rows.length ? rows.reduce((a,r) => r.saldo < a.saldo ? r : a, rows[0])
                              : {saldo:start, label:'—'};
  /* runway zónder nieuwe W&S-omzet: saldo + zeker factuurschema + flex vs. kosten */
  let rSaldo = start, runway = 0;
  for(const k of keys){
    const b = bucket[k];
    rSaldo += b.inFact + b.inFlex - (b.uitKosten + b.uitBtw + b.uitLening);
    if(rSaldo < 0) break;
    runway++;
  }
  return {rows, start, eind: rows.length ? rows[rows.length-1].saldo : start,
          laagste, negatief: rows.find(r => r.saldo < 0) || null,
          runway, scenario: sc, gemFee, blijfkans: blijf, behoudDefault};
}

/* bron: calc.js btwVoorKwartaal() / weekProjectie() — 13-weken kaspositie */
function btwVoorKwartaal(f, qEndMk7){
  const btwPct = Sn(f,'btw_pct',0.21);
  const y = qEndMk7.slice(0,4), em = +qEndMk7.slice(5,7);
  let ontv = 0;
  for(let j=2; j>=0; j--){
    const m = em - j; if(m < 1) continue;
    const mk7 = `${y}-${String(m).padStart(2,'0')}`;
    ontv += f.installments.filter(x => String(x.factuurdatum||'').slice(0,7) === mk7
      && (x.status==='gefactureerd' || x.status==='betaald')).reduce((s,x) => s + bedragVan(x), 0) * btwPct;
    ontv += flexInMaand(f, mk7 + '-01') * btwPct;
  }
  return Math.max(0, ontv - Sn(f,'voorbelasting_pm',0)*3);
}
function weekProjectie(f, weken){
  weken = weken || 13;
  const t = todayISO();
  const btwPct = Sn(f,'btw_pct',0.21);
  const start = f.saldi[0] ? Number(f.saldi[0].saldo) || 0 : 0;
  const weeks = [];
  for(let i=0; i<weken; i++) weeks.push({i, start: addDays(t, i*7), eind: addDays(t, i*7+6), in:0, uit:0, items:[]});
  const idx = iso => { const d = daysBetween(t, iso); return d == null ? -1 : (d < 0 ? 0 : Math.floor(d/7)); };
  const add = (iso, kant, bedrag, label) => {
    const wi = idx(iso);
    if(wi >= 0 && wi < weken && bedrag && isFinite(bedrag)){
      weeks[wi][kant] += bedrag;
      weeks[wi].items.push({label, bedrag: kant==='uit' ? -bedrag : bedrag});
    }
  };
  for(const p of f.placements) for(const inst of instOf(f, p.id)){
    if(inst.status==='betaald' || inst.status==='vervallen') continue;
    let dat = null;
    if(inst.status==='te_factureren' && inst.geplande_datum) dat = addDays(inst.geplande_datum, Number(p.betaaltermijn_dgn)||14);
    else if(inst.status==='gefactureerd'){ const vv = vervaldatum(inst, p) || t; dat = vv < t ? addDays(t, 14) : vv; }
    if(dat) add(dat, 'in', bedragVan(inst)*(1+btwPct), `${p.kandidaat} · ${p.klant}`);
  }
  const flexWk = flexStats(f).maandRunRate * 12/52 * (1+btwPct);
  weeks.forEach(w => { if(flexWk){ w.in += flexWk; w.items.push({label:'Flex-marge', bedrag:flexWk}); } });
  const vasteWk = budgetVoorMaand(f, monthKey(t)) * 12/52;
  weeks.forEach(w => { if(vasteWk){ w.uit += vasteWk; w.items.push({label:'Vaste lasten', bedrag:-vasteWk}); } });
  for(let m=0; m<4; m++){
    const mk = addMonths(monthKey(t), m), maand = +String(mk).slice(5,7);
    if(![1,4,7,10].includes(maand)) continue;
    const laatsteDag = addDays(addMonths(mk, 1), -1);
    if(laatsteDag < t) continue;
    const qEnd = String(addMonths(mk, -1)).slice(0,7);
    add(laatsteDag, 'uit', btwVoorKwartaal(f, qEnd), `Btw-afdracht Q${Math.floor((+qEnd.slice(5,7)-1)/3)+1}`);
  }
  for(const lp of f.loanPayments) if(lp.gepland && lp.datum >= t) add(lp.datum, 'uit', Number(lp.bedrag)||0, 'Aflossing');
  let saldo = start;
  weeks.forEach(w => { w.netto = w.in - w.uit; saldo += w.netto; w.saldo = saldo; });
  const laagste = weeks.reduce((a,w) => w.saldo < a.saldo ? w : a, weeks[0]);
  return {start, weken, weeks, laagste, eind: weeks[weken-1].saldo};
}

/* bron: calc.js breakEven() — plaatsingen/maand die de kosten dekken */
function breakEven(f){
  const k = kpis(f);
  const gemFee = k.gemFee || 8500;
  const behoud = 1 - (k.stopPct || 0);
  const m0 = monthKey(todayISO());
  let kost = 0, n = 0;
  for(let i=0; i<12; i++){ kost += kostenVoorMaand(f, addMonths(m0, i)); n++; }
  const kostPm = n ? kost/n : 0;
  const flexPm = flexStats(f).maandRunRate;
  const perPlaatsing = gemFee * behoud;
  const nodig = perPlaatsing > 0 ? Math.max(0, (kostPm - flexPm)/perPlaatsing) : null;
  return {kostPm, flexPm, perPlaatsing, gemFee, behoud, nodig};
}

/* bron: calc.js investeringsRuimte() / uitkeerRuimte() */
function investeringsRuimte(f){
  const saldo = f.saldi[0] ? Number(f.saldi[0].saldo) || 0 : 0;
  const pot = potjes(f);
  const vrij = saldo - pot.btwPot - pot.vpbPot;
  const vaste = budgetVoorMaand(f, monthKey(todayISO()));
  const euroBuffer = Sn(f,'cash_buffer_min',10000);
  const proj = projectie(f, 12);
  const laagste = proj.laagste.saldo;
  return {saldo, vrij, vaste, euroBuffer, laagste, laagsteLabel: proj.laagste.label,
    ruimteNu: Math.max(0, laagste - euroBuffer),
    bufferMnd: vaste ? vrij/vaste : 0,
    netto6: proj.rows.slice(0,6).reduce((s,r) => s + (r.inTot - r.uitTot), 0)/6,
    runway: proj.runway, proj};
}
function uitkeerRuimte(f, extra){
  extra = extra || 0;
  const proj = projectie(f, 12);
  const buffer = Sn(f,'cash_buffer_min',10000);
  const vpb = potjes(f).vpbPot;
  const laagste = proj.laagste.saldo;
  return {laagste, laagsteLabel: proj.laagste.label, buffer, vpb,
    ruimte: Math.max(0, laagste - buffer - vpb),
    naExtra: laagste - extra, veiligNaExtra: laagste - extra >= buffer + vpb};
}
function investeringsCheck(f, opts){
  opts = opts || {};
  const eenmalig = Number(opts.eenmalig)||0, maandlast = Number(opts.maandlast)||0,
        extraOmzetPm = Number(opts.extraOmzetPm)||0;
  const r = investeringsRuimte(f);
  const gemFee = kpis(f).gemFee || Sn(f,'scenario_gem_fee',8500) || 8500;
  const projNa = projectie(f, 12, {extraHirePm: maandlast, extraHireVanaf: 0});
  const laagsteNa = projNa.laagste.saldo - eenmalig;
  const nettoPerMnd = extraOmzetPm - maandlast;
  const tekort = Math.max(0, r.euroBuffer - laagsteNa);
  return {r, eenmalig, maandlast, extraOmzetPm, gemFee,
    laagsteVoor: r.laagste, laagsteNa,
    bufferVoorMnd: r.bufferMnd,
    bufferNaMnd: r.vaste ? (r.vrij - eenmalig)/(r.vaste + maandlast) : 0,
    breakEvenVoor: gemFee ? r.vaste/gemFee : null,
    breakEvenNa: gemFee ? (r.vaste + maandlast)/gemFee : null,
    nettoPerMnd, payback: (eenmalig > 0 && nettoPerMnd > 0) ? eenmalig/nettoPerMnd : null,
    haalbaarNu: laagsteNa >= r.euroBuffer, tekort,
    maandenTot: tekort > 0 ? (r.netto6 > 0 ? Math.ceil(tekort/r.netto6) : null) : 0,
    runwayNa: projNa.runway};
}

/* bron: calc.js jaardoelGps() / omzetDoel() / winstDoorrekening() */
function jaardoelGps(f){
  const doel = Sn(f,'doel_winst_jaar',0) || null;
  const pot = potjes(f), k = kpis(f);
  const gemFee = k.gemFee || 8500;
  const blijf = 1 - (k.stopPct || 0);
  const flexPm = flexStats(f).maandRunRate;
  const t = todayISO(), m = +t.slice(5,7);
  const mndRest = 12 - m + 1;
  const kostenOver = n => { let s = 0; for(let i=0; i<n; i++) s += kostenVoorMaand(f, addMonths(monthKey(t), i)); return s; };
  const maak = (nMnd, teGaanWinst) => {
    const kosten = kostenOver(nMnd);
    const omzetNodig = Math.max(0, teGaanWinst) + kosten;
    const flexBij = flexPm * nMnd;
    const wsNodig = Math.max(0, omzetNodig - flexBij);
    const perPlaatsing = gemFee * blijf;
    const plaats = perPlaatsing > 0 ? wsNodig/perPlaatsing : null;
    return {nMnd, kosten, omzetNodig, flexBij, wsNodig, plaats, perMnd: plaats != null ? plaats/nMnd : null};
  };
  const verstreken = Math.max(0.5, m - 1 + (+t.slice(8,10))/30);
  return {doel, winstYtd: pot.winstYtd, teGaan: doel != null ? doel - pot.winstYtd : null,
    restJaar: doel != null ? maak(mndRest, doel - pot.winstYtd) : null,
    rolling: doel != null ? maak(12, doel) : null,
    tempo: k.plaatsingenYtd/verstreken, gemFee, blijf, flexPm, mndRest};
}
function omzetDoel(f){
  const t = todayISO(), jaar = t.slice(0,4), m = +t.slice(5,7);
  const k = kpis(f), gemFee = k.gemFee || 8500;
  const omzetYtd = Sn(f,'yuki_omzet_ytd',0)
    || f.installments.filter(i => String(i.factuurdatum||'').slice(0,4) === jaar
        && (i.status==='gefactureerd' || i.status==='betaald')).reduce((s,i) => s + bedragVan(i), 0);
  const winstYtd = potjes(f).winstYtd;
  const flexJaar = flexStats(f).maandRunRate*12;
  const doel = Sn(f,'doel_omzet_jaar',400000);
  const wsNodig = Math.max(0, doel - flexJaar);
  const plaatsingenNodig = gemFee > 0 ? wsNodig/gemFee : null;
  const verstreken = Math.max(0.5, m - 1 + (+t.slice(8,10))/30);
  const nogTeFact = k.nogTeFactureren, openstaand = k.openstaand;
  const blijfk = 1 - (k.stopPct || 0);
  const potT1 = f.installments.filter(i => i.status==='te_factureren' && i.termijn_nr === 1)
    .reduce((s,i) => s + bedragVan(i), 0);
  const nogTeFactVoorzichtig = potT1 + Math.max(0, nogTeFact - potT1)*blijfk;
  return {jaar, doel, omzetYtd, winstYtd, gemFee, flexJaar, wsNodig, plaatsingenNodig,
    perMnd: plaatsingenNodig != null ? plaatsingenNodig/12 : null,
    nogTeFact, openstaand, ontvangen: Math.max(0, omzetYtd - openstaand),
    voorzichtigFactor: nogTeFact > 0 ? nogTeFactVoorzichtig/nogTeFact : 1,
    nogTeFactVoorzichtig, gecontracteerd: omzetYtd + nogTeFact,
    gecontracteerdVoorzichtig: omzetYtd + nogTeFactVoorzichtig,
    plaatsingenYtd: k.plaatsingenYtd, omzetRunRate: omzetYtd/verstreken*12,
    pctDoel: doel ? Math.min(1, omzetYtd/doel) : 0, blijf: blijfk};
}
function winstDoorrekening(f){
  const t = todayISO(), k = kpis(f);
  const actuals = (f.actuals||[]).filter(a => a.categorie === 'Werkelijk totaal (Yuki)' && a.bedrag != null)
    .slice().sort((a,b) => String(a.maand).localeCompare(String(b.maand)));
  const laatste = actuals[actuals.length-1];
  const override = Sn(f,'kosten_pm_override',0);
  const basisKosten = override > 0 ? override : (laatste ? Number(laatste.bedrag)||0 : budgetVoorMaand(f, monthKey(t)));
  const extraLoon = Sn(f,'extra_loon_pm',0);
  const kostenMaand = basisKosten + extraLoon;
  const kostenBron = override > 0 ? 'handmatig ingesteld'
    : (laatste ? `werkelijk ${mkLabel(laatste.maand)} (Yuki)` : 'budget (nog geen Yuki-realisatie)');
  const kostenJaar = kostenMaand*12;
  const doel = Sn(f,'doel_omzet_jaar',400000);
  const gemFee = k.gemFee || 8604;
  const blijf = 1 - (k.stopPct || 0);
  const flexJaar = flexStats(f).maandRunRate*12;
  const plaatsingenVoorDoel = gemFee > 0 ? (doel - flexJaar)/gemFee : null;
  const herinvest = Sn(f,'herinvest_jaar',0);
  const vpbVan = w => { const x = Math.max(0, w); return x <= 200000 ? x*0.19 : 200000*0.19 + (x-200000)*0.258; };
  const winstVoorVpb = doel - kostenJaar - herinvest;
  const vpb = vpbVan(winstVoorVpb);
  const vpbZonderHerinvest = vpbVan(doel - kostenJaar);
  const nettoWinst = winstVoorVpb - vpb;
  const leningOpen = f.loans[0]
    ? (Number(f.loans[0].hoofdsom)||0) - f.loanPayments.filter(lp => !lp.gepland).reduce((s,l) => s + (Number(l.bedrag)||0), 0)
    : 0;
  const leningAflossing = Math.min(Math.max(0, leningOpen), 30000);
  const vrij = nettoWinst - leningAflossing;
  const v = Math.max(0, vrij);
  const box2 = v <= 68843 ? v*0.245 : 68843*0.245 + (v-68843)*0.31;
  const mktPm = (f.budget||[]).filter(b => /marketing/i.test(String(b.categorie||'')))
    .reduce((s,b) => s + (Number(b.bedrag_pm)||0), 0);
  const mktPerPl = (plaatsingenVoorDoel > 0) ? mktPm*12/plaatsingenVoorDoel : 0;
  const uitvalPerPl = k.plaatsingenYtd > 0 ? k.vervallen/k.plaatsingenYtd : 0;
  const directPerPl = mktPerPl + uitvalPerPl;
  return {kostenMaand, basisKosten, extraLoon, kostenBron, kostenJaar, override, actuals,
    laatsteMaand: laatste ? laatste.maand : null,
    doel, gemFee, blijf, stopPct: k.stopPct, flexJaar, plaatsingenVoorDoel, plaatsingenYtd: k.plaatsingenYtd,
    herinvest, vpbZonderHerinvest, vpbBesparing: vpbZonderHerinvest - vpb,
    winstmarge: doel > 0 ? winstVoorVpb/doel : 0, nettoMarge: doel > 0 ? nettoWinst/doel : 0,
    mktPerPl, uitvalPerPl, directPerPl,
    marginaleWinstPl: gemFee - directPerPl,
    marginaleMargePl: gemFee > 0 ? (gemFee - directPerPl)/gemFee : 0,
    winstVoorVpb, vpb, nettoWinst, leningOpen, leningAflossing, vrij, box2,
    dividendNetto: vrij - box2,
    winstYtd: potjes(f).winstYtd, saldoNu: f.saldi[0] ? Number(f.saldi[0].saldo)||0 : 0};
}

/* bron: calc.js cfoBriefing() — 3–4 zinnen "wat een adviseur zou zeggen" */
function cfoBriefing(f){
  const r = investeringsRuimte(f), wk = weekProjectie(f, 13), bel = belastingAdvies(f), pot = potjes(f);
  const top = adviesEngine(f).filter(a => a.urg >= 2);
  const z = [];
  const reservering = pot.btwPot + pot.vpbPot;
  const belAlert = (r.saldo > 0 && reservering > 0)
    ? (r.saldo < reservering
        ? {k:'warn', t:`Je belastingreservering (${eur(reservering)} btw+Vpb) is gróter dan je banksaldo (${eur(r.saldo)}) — je btw/Vpb loopt vóór op je cash. Houd uitgaven vast tot dit gedekt is.`}
        : (r.vrij < reservering*0.3
            ? {k:'warn', t:`Van je saldo (${eur(r.saldo)}) is ${eur(reservering)} al belasting (btw+Vpb) — er blijft maar ${eur(r.vrij)} vrij over. Reserveer dat apart en geef het niet uit.`}
            : null))
    : null;
  z.push(r.bufferMnd >= 3
    ? {k:'ok', t:`Je staat er gezond bij: ${num(r.bufferMnd)} maanden buffer en ${eur(r.vrij)} vrij besteedbaar na belastingpotjes.`}
    : {k:'warn', t:`Let op je buffer: ${num(r.bufferMnd)} maand vaste lasten — onder de norm van 3. Vul die aan vóór grote uitgaven.`});
  if(wk.laagste) z.push(wk.laagste.saldo < r.euroBuffer
    ? {k:'warn', t:`Krapste moment komende 13 weken: week van ${dOf(wk.laagste.start)}, saldo zakt naar ${eur(wk.laagste.saldo)} — plan grote uitgaven daaromheen.`}
    : {k:'ok', t:`Je kas blijft de komende 13 weken boven je buffer (laagste ${eur(wk.laagste.saldo)}).`});
  z.push(r.ruimteNu > 5000
    ? {k:'kans', t:`Ruimte om te investeren: ~${eur(r.ruimteNu)} bovenop je buffer.`}
    : {k:'warn', t:`Nog geen investeringsruimte — je zit tegen je buffer aan. Focus op incasso en omzet.`});
  if(bel.loonIngevuldOk && bel.loonTekort > 0)
    z.push({k:'warn', t:`DGA-loon loopt achter op het gebruikelijk loon (tekort ~${eur(bel.loonTekort)}) — bespreek vóór 31 dec met je boekhouder.`});
  else if(top[0])
    z.push({k: top[0].cat === 'gevaar' ? 'warn' : 'kans', t:`Belangrijkst deze week: ${top[0].titel} — ${top[0].actie || top[0].tekst}`});
  if(belAlert) z.unshift(belAlert);
  return z.slice(0,4);
}

/* ═══════════════════════════════════════════════════════════════
   ADVIES-MOTOR — overgezet uit ~/ploeggenoten-finance/js/advies.js.
   Elke regel is een heuristiek met branchedrempels.
   Categorieën: gevaar | kans | sterkte. urg: 3 = direct, 1 = goed om te weten.
   ═══════════════════════════════════════════════════════════════ */

/* Tarieven 2026 — signalering & rekenhulp, géén belastingadvies. */
const FISCAAL = {
  jaar: 2026,
  gebruikelijkLoon: 58000,
  vpb:  {laag:0.19, grens:200000, hoog:0.258},
  box2: {laag:0.245, grens:68843, hoog:0.31},
  box1: {schijf1:0.3582, grens1:38441, top:0.495}
};

function belastingAdvies(f){
  const t = todayISO(), y = +t.slice(0,4), mnd = +t.slice(5,7), dag = +t.slice(8,10);
  const pot = potjes(f), F = FISCAAL;
  const kw = Math.floor((mnd-1)/3) + 1;
  const kwStartMnd = (kw-1)*3 + 1;
  const dagenInKw = (mnd - kwStartMnd)*30 + dag;
  const kwLabel = `Q${kw} ${y} (${MND[kwStartMnd-1]}–${MND[kwStartMnd+1]})`;
  const winst = pot.winstYtd;
  const loonPm = Sn(f,'dga_loon_pm',0);
  const startMnd = Sn(f,'dga_start_maand',0);
  const maandenHeelJaar = startMnd ? (12 - startMnd + 1) : 0;
  const loonHeelJaar = loonPm * maandenHeelJaar;
  return {
    F, winst,
    vpbTarief: winst > F.vpb.grens ? F.vpb.hoog : F.vpb.laag,
    vpbReservering: Math.max(0, winst) * F.vpb.laag,   // conservatief op laag tarief
    btwKwartaal: pot.btwPot, btwOntvangen: pot.btwOntvangen, voorbelasting: pot.voorbelasting,
    kwLabel, dagenInKw,
    loonPm, startMnd, loonHeelJaar,
    loonTekort: Math.max(0, F.gebruikelijkLoon - loonHeelJaar),
    loonIngevuldOk: loonPm > 0 && startMnd > 0,
    mndTotEind: 12 - mnd,
    bvRouteTarief: 1 - (1 - F.vpb.laag)*(1 - F.box2.laag)
  };
}
/* Netto-calculator: salaris (box 1) vs. dividend (Vpb + box 2). */
const progVpb  = w => { const g = FISCAAL.vpb; return w <= g.grens ? w*g.laag : g.grens*g.laag + (w-g.grens)*g.hoog; };
const progBox1 = (van, tot) => { const b = FISCAAL.box1,
  fn = x => x <= b.grens1 ? x*b.schijf1 : b.grens1*b.schijf1 + (x-b.grens1)*b.top; return fn(tot) - fn(van); };
const progBox2 = (van, tot) => { const b = FISCAAL.box2,
  fn = x => x <= b.grens ? x*b.laag : b.grens*b.laag + (x-b.grens)*b.hoog; return fn(tot) - fn(van); };
function salarisDividendCalc(winst, huidigBox1){
  winst = Math.max(0, Number(winst)||0); huidigBox1 = Math.max(0, Number(huidigBox1)||0);
  const box1Extra = progBox1(huidigBox1, huidigBox1 + winst);
  const nettoSalaris = winst - box1Extra;
  const vpb = progVpb(winst), naVpb = winst - vpb, box2 = progBox2(0, naVpb), nettoDividend = naVpb - box2;
  return {winst, huidigBox1, box1Extra, nettoSalaris, vpb, box2, nettoDividend,
    beste: nettoSalaris >= nettoDividend ? 'salaris' : 'dividend',
    verschil: Math.abs(nettoSalaris - nettoDividend),
    pctSalaris: winst ? nettoSalaris/winst : 0, pctDividend: winst ? nettoDividend/winst : 0};
}

/* Kerncijfers zoals een adviseur ze op een A4 zet (bron: advies.js adviseurCijfers) */
function adviseurCijfers(f){
  const t = todayISO(), k = kpis(f), con = concentratie(f), pot = potjes(f), fx = flexStats(f);
  const proj = projectie(f, 12, {flexFactor:1});
  const vaste = budgetVoorMaand(f, monthKey(t));
  const saldo = f.saldi[0] ? Number(f.saldi[0].saldo)||0 : 0;
  const vrij = saldo - pot.btwPot - pot.vpbPot;
  const eerste = f.placements.map(p => p.contract_datum).filter(Boolean).sort()[0];
  const mndActief = eerste ? Math.max(1, (daysBetween(eerste, t)||0)/30.4) : 1;
  return [
    ['Vaste lasten p/m', eur(vaste), 'incl. fee & lonen (budget)'],
    ['Break-even', num(vaste/Math.max(1, k.gemFee)) + ' plaatsingen/m', `bij gem. fee ${eur(k.gemFee)}`],
    ['Run-rate', num(f.placements.length/mndActief) + ' plaatsingen/m',
      `${f.placements.length} sinds ${eerste ? dOf(eerste) : '—'}`],
    ['Cashbuffer', (vaste ? num(vrij/vaste) : '—') + ' mnd', `vrij besteedbaar ${eur(vrij)} / norm 3–6 mnd`],
    ['Runway (zonder nieuwe W&S)', (proj.runway >= 12 ? '12+' : proj.runway) + ' mnd', 'factuurschema + flex − kosten'],
    ['DSO', k.dso == null ? '—' : k.dso + ' dgn', 'gem. dagen factuur → betaald'],
    ['Uitval', pctF(k.stopPct), `${eur(k.vervallen)} vervallen omzet`],
    ['Grootste klant', con.top1 ? pctF(con.top1.aandeel) : '—',
      con.top1 ? con.top1.klant + ' (norm < 25–30%)' : ''],
    ['Flex-dekkingsgraad', vaste ? pctF(fx.maandRunRate/vaste) : '—',
      `${eur(fx.maandRunRate)}/m recurring vs. vaste lasten`],
    ['Btw + Vpb opzij te zetten', eur(pot.btwPot + pot.vpbPot), 'zit nog "verstopt" in je banksaldo']
  ];
}

function adviesEngine(f){
  const items = [];
  const t = todayISO(), mk = monthKey(t), mnd = +t.slice(5,7);
  const k = kpis(f), con = concentratie(f), pot = potjes(f), fx = flexStats(f);
  const proj = projectie(f, 12, {flexFactor:1});
  const vaste = budgetVoorMaand(f, mk);
  const saldo = f.saldi[0] ? Number(f.saldi[0].saldo)||0 : 0;
  const vrij = saldo - pot.btwPot - pot.vpbPot;
  const add = (cat, urg, titel, cijfer, tekst, actie) => items.push({cat, urg, titel, cijfer, tekst, actie});

  const eerste = f.placements.map(p => p.contract_datum).filter(Boolean).sort()[0];
  const mndActief = eerste ? Math.max(1, (daysBetween(eerste, t)||0)/30.4) : 1;
  const plPm = f.placements.length/mndActief;
  const gemFee = k.gemFee || (f.placements.length
    ? f.placements.reduce((s,p) => s + Number(p.fee_excl||0), 0)/f.placements.length : 0);
  const flexDekking = vaste ? fx.maandRunRate/vaste : 0;

  /* ── GEVAREN ── */
  const buffer = vaste ? vrij/vaste : 0;
  if(buffer < 3) add('gevaar', 3, 'Cashbuffer onder de branchenorm', num(buffer) + ' mnd',
    `Vrij besteedbaar (na btw/Vpb-potjes) is ${eur(vrij)} — dat dekt ${num(buffer)} maand vaste lasten (${eur(vaste)}/m). Adviseurs hanteren voor W&S-bureaus minimaal 3, liever 6 maanden: omzet is eenmalig en valt in vakantieperiodes stil.`,
    `Bouw de buffer naar minimaal ${eur(vaste*3)}. Stel grote uitgaven en extra aflossingen uit tot je daar zit.`);

  const btwRow = proj.rows.find(r => r.uitBtw > 0);
  if(btwRow && btwRow.uitBtw > Math.max(5000, saldo*0.15))
    add('gevaar', btwRow.uitBtw > vrij*0.5 ? 3 : 2, 'Btw-klap in aantocht', eur(btwRow.uitBtw) + ' · ' + btwRow.label,
      `In ${btwRow.label} moet er ${eur(btwRow.uitBtw)} btw worden afgedragen. Dit is geen winst maar doorgeefgeld — toch verdampt hier menig bureau zijn "buffer" aan.`,
      `Zet het btw-potje (${eur(pot.btwPot)} en groeiend) apart, bijv. op een spaarrekening, en raak het niet aan.`);

  if(con.top1 && con.top1.aandeel > 0.25){
    const nogTeFact = f.placements.filter(p => p.klant === con.top1.klant)
      .reduce((s,p) => { const st = placementStats(f, p); return s + st.nog + st.open; }, 0);
    add('gevaar', con.top1.aandeel > 0.35 ? 3 : 2, 'Klantconcentratie te hoog',
      pctF(con.top1.aandeel) + ' bij ' + con.top1.klant,
      `${con.top1.klant} is ${pctF(con.top1.aandeel)} van je pijplijn (norm: geen klant boven 25–30%). Er staat daar nog ${eur(nogTeFact)} open of te factureren. Eén vacaturestop of conflict raakt je direct — en het maakt je onaantrekkelijk bij financiering.`,
      `Maak spreiding een target: de volgende ${Math.ceil(f.placements.length*0.3)} plaatsingen bij andere klanten. Gebruik de goede naam bij ${con.top1.klant} als referentie voor soortgelijke bedrijven.`);
    if(con.top3 > 0.7) add('gevaar', 2, 'Top-3 klanten dragen bijna alles', pctF(con.top3),
      `Je drie grootste klanten zijn samen ${pctF(con.top3)} van de pijplijn.`,
      `Richt acquisitie op minimaal 2 nieuwe logo's per kwartaal.`);
  }

  const teLaat = acties(f).filter(a => a.soort === 'te_laat');
  if(teLaat.length){
    const bedrag = teLaat.reduce((s,a) => s + bedragVan(a.i||{}), 0);
    add('gevaar', 2, 'Betalingen lopen achter', `${teLaat.length}× · ${eur(bedrag)}`,
      `${teLaat.length} facturen (${eur(bedrag)} excl. btw) zijn over de vervaldatum. In recruitment went een klant snel aan te laat betalen — en jij financiert het.`,
      `Vast belritme: dag 1 na vervallen een vriendelijke mail, dag 7 bellen. Overweeg bij nieuwe klanten 50% bij tekenen.`);
  }

  if(k.stopPct > 0.2) add('gevaar', 2, 'Hoog uitvalpercentage kandidaten', pctF(k.stopPct) + ' gestopt',
    `${pctF(k.stopPct)} van je plaatsingen stopt — je verloor al ${eur(k.vervallen)} aan vervallen termijnen. In productie/logistiek valt het meeste uit in de eerste 30 dagen.`,
    `Bel kandidaat én klant standaard na dag 3, 14 en 30. Kleine moeite, en het beschermt je gespreide termijnen.`);

  const kw3 = proj.rows.slice(0,3);
  const kw3Uit = kw3.reduce((s,r) => s + r.uitTot, 0);
  const kw3In  = kw3.reduce((s,r) => s + r.inFact + r.inFlex, 0);
  const dekking3m = kw3Uit > 0 ? kw3In/kw3Uit : 1;
  if(dekking3m < 1) add('gevaar', 2, 'Komende 3 maanden niet gedekt zonder nieuwe deals',
    Math.round(dekking3m*100) + '% gedekt',
    `Het bestaande factuurschema + flex dekt ${Math.round(dekking3m*100)}% van de verwachte uitgaven de komende 3 maanden. Zonder nieuwe plaatsingen teer je in op je buffer.`,
    `Plan het aantal deals dat het gat dicht: bij een gemiddelde fee van ${eur(gemFee)} is dat er ${Math.ceil((kw3Uit - kw3In)/Math.max(1, gemFee))} in dit kwartaal.`);

  const rcTve = f.loans.find(l => /tve/i.test(String(l.naam||'')));
  if(rcTve){
    const feePm = Sn(f,'mgmt_fee_pm',0), uitkPm = Sn(f,'mgmt_uitkering_pm',0);
    const afbouwPm = uitkPm - feePm;
    if(afbouwPm > 0){
      const mndKlaar = Math.ceil((Number(rcTve.hoofdsom)||0)/afbouwPm);
      add('sterkte', 1, 'RC-schuld aan TVE wordt netjes afgebouwd', eur(rcTve.hoofdsom),
        `Je keert ${eur(uitkPm)}/m uit terwijl de fee ${eur(feePm)}/m is — het verschil (${eur(afbouwPm)}/m) lost de rekening-courant af. In dit tempo is de RC over ±${mndKlaar} maanden weg.`, null);
    } else {
      add('gevaar', 1, 'Rekening-courant TVE loopt op', eur(rcTve.hoofdsom) + '+',
        `Je management fee (${eur(feePm)}/m) wordt niet (volledig) uitbetaald en stapelt op in RC. Fiscaal kan een oplopende RC-DGA door de Belastingdienst als (verkapte) uitdeling worden gezien.`,
        `Bespreek met je boekhouder: periodiek uitkeren, verrekenen, of een RC-overeenkomst met rente vastleggen.`);
    }
  }

  if(mnd === 6 || mnd === 7) add('gevaar', 1, 'Zomerdip W&S komt eraan', 'jul–aug',
    `Beslissers zijn op vakantie: deals die nu niet rond zijn schuiven zes weken door. Klassieke valkuil: in september pas weer zaaien en in oktober-november een omzetgat.`,
    `Vul de pijplijn nú voor september; plan interviews vóór de vakanties. Flex loopt wél door — extra reden die tak te voeden.`);
  if(mnd === 10 || mnd === 11) add('gevaar', 1, 'December-effect', 'nov–dec',
    `Budgetten zijn op en niemand start vlak voor de feestdagen; januari is juist piekmaand (nieuwe budgetten, jobswitch-golf).`,
    `Verkoop nu startdata in januari en zorg dat facturatie vóór de jaarwisseling de deur uit is.`);

  if(fx.maandRunRate === 0)
    add('gevaar', 2, 'Alle omzet is eenmalig', '0% recurring',
      `Zonder flex-inkomsten begint elke maand op nul: W&S-fees zijn eenmalig. Dat maakt je kwetsbaar voor een stille maand.`,
      `Bouw de flexpoot via Pronkert uit — elke flexkracht is wekelijkse marge die je vaste lasten draagt.`);

  const bw = yukiBewaking(f);
  if(bw && Math.abs(bw.verschil) > 750){
    const richting = bw.verschil > 0
      ? `De app verwacht ${eur(bw.appOpenIncl)} aan openstaande facturen (incl. btw), maar Yuki's debiteuren staan op ${eur(bw.yukiDeb)}. Mogelijk is een factuur al betaald of is een geplande factuur nooit in Yuki gezet.`
      : `Yuki's debiteuren (${eur(bw.yukiDeb)}) zijn hóger dan wat de app verwacht (${eur(bw.appOpenIncl)}). Er staat dus omzet in de boekhouding die de app niet kent — bijv. een flex-factuur aan Pronkert of een losse factuur buiten het plaatsingenschema.`;
    add('gevaar', 2, 'App en boekhouding lopen uiteen', eur(Math.abs(bw.verschil)) + ' verschil', richting,
      `Loop de open posten na; de betaald-suggesties op Vandaag lossen het meestal al op.`);
  }

  const tgt = targetInfo(f);
  if(tgt.aantalTarget){
    const gap = tgt.aantalTarget - tgt.plaatsingen;
    const dagenOver = daysBetween(t, addMonths(monthKey(t), 1));
    if(gap > 0 && dagenOver != null && dagenOver <= 12)
      add('gevaar', 2, 'Maandtarget onder druk', `${tgt.plaatsingen}/${tgt.aantalTarget} · nog ${dagenOver} dgn`,
        `Het bord-target is ${tgt.aantalTarget} plaatsingen deze maand; je staat op ${tgt.plaatsingen}. Het gat van ${gap} plaatsing(en) ≈ ${eur(gap*gemFee)} omzet.`,
        `Kijk in de gewogen pijplijn wie het dichtst bij zit en geef die deals voorrang.`);
    else if(gap <= 0) add('sterkte', 1, 'Maandtarget gehaald', `${tgt.plaatsingen}/${tgt.aantalTarget}`,
      `Target van het bord is binnen — alles erbij is bonus.`, null);
  }

  const kanalen = kanaalStats(f);
  const kTot = kanalen.reduce((s,k2) => s + k2.omzet, 0);
  if(kanalen.length && kTot > 0){
    const top = kanalen[0];
    if(top.bron !== 'Onbekend' && top.omzet/kTot > 0.6)
      add('gevaar', 1, 'Werving leunt zwaar op één kanaal', `${top.bron} · ${pctF(top.omzet/kTot)}`,
        `${top.bron} is goed voor ${pctF(top.omzet/kTot)} van je plaatsingsomzet. Als dat kanaal duurder wordt of dichtgaat (algoritme, beleid), raakt dat direct je dealflow.`,
        `Houd een tweede kanaal warm (referrals zijn gratis: vraag elke geplaatste kandidaat en tevreden klant om één naam).`);
  }

  /* ── KANSEN ── */
  if(buffer > 6){
    const overschot = vrij - vaste*6;
    const moeder = f.loans.find(l => /moeder/i.test(String(l.naam||'')));
    const opties = [];
    if(moeder) opties.push(`de lening van je moeder (deels) aflossen bespaart ${moeder.rente_pct}% = ${eur((Number(moeder.hoofdsom)||0)*(Number(moeder.rente_pct)||0)/100)}/jaar aan rente`);
    opties.push(`een extra recruiter (±${eur(4300)}/m) is al rendabel bij ${num(4300/Math.max(1, gemFee))} plaatsing per maand`);
    opties.push(`advertentiebudget opschalen`);
    add('kans', 2, 'Overtollige cash aan het werk zetten', eur(overschot) + ' boven norm',
      `Je zit ${eur(overschot)} boven de 6-maands buffernorm. Geld op de betaalrekening rendeert niet.`,
      `Opties: ${opties.join('; ')}.`);
  }

  const mktBudget = f.budget.find(b => /marketing|verkoop/i.test(String(b.categorie||'')));
  if(mktBudget && plPm > 0){
    const cpp = Number(mktBudget.bedrag_pm||0)/plPm;
    if(cpp < gemFee*0.3) add('kans', 2, 'Marketing rendeert — overweeg opschalen', `${eur(cpp)} per plaatsing`,
      `Je geeft ±${eur(mktBudget.bedrag_pm)}/m uit aan marketing en doet ${num(plPm)} plaatsingen/m → ${eur(cpp)} per plaatsing, tegen een gemiddelde fee van ${eur(gemFee)}. Een verhouding onder de 30% is ruimte om te schalen.`,
      `Test +50% advertentiebudget voor één kwartaal en meet of de cost-per-placement onder ${eur(gemFee*0.3)} blijft.`);
  }

  const ver = f.installments.filter(i => i.status==='te_factureren' && i.geplande_datum
      && (daysBetween(t, i.geplande_datum)||0) > 60).reduce((s,i) => s + bedragVan(i), 0);
  if(ver > k.nogTeFactureren*0.4 && ver > 5000)
    add('kans', 2, 'Veel omzet zit ver in de toekomst', eur(ver) + ' > 60 dgn',
      `${eur(ver)} van je ${eur(k.nogTeFactureren)} nog te factureren staat meer dan 2 maanden weg (gespreide termijnen). Jij financiert feitelijk je klanten.`,
      `Nieuwe deals: 50% bij tekenen, rest gespreid. Bestaande spreidingen: bied 3% korting bij ineens voldoen.`);

  if(gemFee && gemFee < 8000) add('kans', 2, 'Gemiddelde fee onder benchmark', eur(gemFee),
    `Voor productie/logistiek is 20–25% van het bruto jaarsalaris (±€38–45k) gangbaar: €7.600–11.000 per plaatsing. Jij zit op ${eur(gemFee)}.`,
    `Verhoog je tarief bij nieuwe klanten; onderbouw met schaarste en je garantieregeling.`);

  if(fx.maandRunRate > 0 && flexDekking < 1){
    const perKracht = (fx.laatste && fx.laatste.flexkrachten) ? fx.avg4/fx.laatste.flexkrachten : null;
    add('kans', 2, 'Flex kan je vaste lasten dragen', pctF(flexDekking) + ' gedekt',
      `Flex levert nu ${eur(fx.maandRunRate)}/m (run-rate) — dat dekt ${pctF(flexDekking)} van je vaste lasten (${eur(vaste)}).${perKracht ? ` Gemiddeld is dat ${eur(perKracht)}/week per flexkracht.` : ''}`,
      `${perKracht ? `Met ±${Math.ceil((vaste - fx.maandRunRate)/(perKracht*52/12))} extra flexkrachten` : 'Met meer flexkrachten'} draaien je vaste lasten volledig op recurring marge — dan is elke W&S-fee pure winst.`);
  }

  const perKlant = {};
  f.placements.forEach(p => { perKlant[p.klant] = (perKlant[p.klant]||0) + 1; });
  const repeat = Object.values(perKlant).filter(n => n > 1).length;
  const totKlant = Object.keys(perKlant).length;
  if(totKlant >= 4 && repeat/totKlant >= 0.4)
    add('kans', 1, 'Sterke herhaalklanten — verzilver dat', `${repeat}/${totKlant} klanten`,
      `${repeat} van je ${totKlant} klanten plaatste meer dan eens. Terugkerende klanten zijn je goedkoopste omzet.`,
      `Bied je top-klanten een raamafspraak: vast tarief of staffelkorting in ruil voor exclusiviteit of een volumecommitment.`);

  /* ── STERKTES ── */
  if(pot.omzetYtd > 0){
    const marge = pot.winstYtd/Math.max(1, pot.omzetYtd);
    if(marge > 0.35) add('sterkte', 1, 'Uitstekende winstmarge', pctF(marge),
      `Winst-indicatie ${eur(pot.winstYtd)} op ${eur(pot.omzetYtd)} omzet. Boven de 35% is voor een W&S-bureau zeer gezond (veel bureaus blijven onder 20%).`, null);
  }
  if(buffer >= 3 && buffer <= 6) add('sterkte', 1, 'Gezonde cashbuffer', num(buffer) + ' mnd vaste lasten',
    `Vrij besteedbaar dekt ${num(buffer)} maanden — netjes binnen de 3–6-norm.`, null);
  if(k.dso != null && k.dso <= 21) add('sterkte', 1, 'Klanten betalen vlot', k.dso + ' dgn DSO',
    `Gemiddelde betaalduur van ${k.dso} dagen is uitstekend (branche zit vaak op 40+).`, null);
  if(gemFee >= 8000) add('sterkte', 1, 'Fee-niveau op/boven benchmark', eur(gemFee) + ' gem.',
    `Je gemiddelde fee zit in de bovenkant van de markt voor productie & logistiek.`, null);
  if(fx.maandRunRate > 0 && flexDekking >= 1) add('sterkte', 2, 'Vaste lasten volledig gedekt door flex', pctF(flexDekking),
    `Je flex-marge (${eur(fx.maandRunRate)}/m) dekt al je vaste lasten. Elke W&S-fee is daarmee winst — een luxepositie.`, null);
  if(k.stopPct <= 0.1 && f.placements.length >= 10) add('sterkte', 1, 'Lage uitval', pctF(k.stopPct),
    `Je kandidaten blijven zitten — dat zegt iets over je matching én het beschermt je gespreide termijnen.`, null);

  /* ── UITVAL-INTELLIGENTIE (bord: afval_type / stop_door / categorieën) ── */
  {
    const cds = cands();
    const d90 = addDays(t, -90);
    const afg = cds.filter(c => faseVan(c) === 'Afgevallen' && !(c.vervangt||''));
    const oa = afg.filter(c => c.afval_type === 'offer_afgewezen');
    const oa90 = oa.filter(c => String(c.since||'') >= d90);
    const offerFases = ['In de wacht','Offer','Contract ondertekenen','Contract getekend','Gestart'];
    const inHist = (c, fases) => fases.includes(faseVan(c))
      || (Array.isArray(c.historie) && c.historie.some(hh => fases.includes(CRM.faseNorm ? CRM.faseNorm(hh && hh.fase) : (hh && hh.fase))))
      || !!c.geplaatst_op;
    const offers = cds.filter(c => !(c.vervangt||'') && inHist(c, offerFases));
    const acc = offers.filter(c => c.geplaatst_op || ['Contract getekend','Gestart','Gestopt'].includes(faseVan(c))).length;
    const accPct = offers.length >= 5 ? acc/offers.length : null;
    if(accPct != null && accPct < 0.6)
      add('gevaar', 2, 'Offer-acceptatie te laag', pctF(accPct),
        `Van je ${offers.length} kandidaten die het offer-stadium bereikten, tekende maar ${acc}. Elk afgewezen offer is een volledig doorlopen traject (~5 weken + ${eur(gemFee*(1-k.stopPct))} misgelopen netto-fee).`,
        `Open Uitval op het bord en kijk naar de redenen — daar staat waar de deal stukloopt.`);
    const perReden = {};
    oa90.forEach(c => { const r = c.afval_categorie || '?'; perReden[r] = (perReden[r]||0) + 1; });
    const topR = Object.entries(perReden).sort((a,b) => b[1] - a[1])[0];
    if(topR && topR[1] >= 2 && topR[0] === 'Salaris te laag')
      add('kans', 2, 'Offers stranden op salaris', `${topR[1]}× in 90 dgn`,
        `Kandidaten wijzen het aanbod af omdat het loon tegenvalt. Dat is laat in het traject — het duurste moment om erachter te komen.`,
        `Bespreek de loonbandbreedte al vóór de meeloopdag, en toets bij de klant of er rek zit vóór je een offer laat doen.`);
    else if(topR && topR[1] >= 2)
      add('kans', 1, 'Terugkerende offer-afwijsreden', `${topR[0]} · ${topR[1]}× in 90 dgn`,
        `Meerdere offers strandden om dezelfde reden ("${topR[0]}").`,
        `Maak dit onderdeel van het tweede gesprek, zodat het niet pas bij het offer opduikt.`);
    const stops = cds.filter(c => faseVan(c) === 'Gestopt' && c.gestopt_op && (c.start || c.geplaatst_op));
    const vroeg = stops.filter(c => (daysBetween(c.start || c.geplaatst_op, c.gestopt_op) ?? 999) <= 30);
    if(vroeg.length >= 2)
      add('gevaar', 2, 'Uitval in de eerste 30 dagen', `${vroeg.length} van ${stops.length} stops`,
        `Stoppen kort na de start is de duurste uitval: garantie, vervanging en een klant die twijfelt. Redenen: ${[...new Set(vroeg.map(c => c.stop_categorie).filter(Boolean))].join(', ') || 'nog niet vastgelegd'}.`,
        `Houd het nazorg-ritme (dag 3/14/30 op het bord) strak — elke voorkomen stop is ~${eur(gemFee)} + vervangingswerk.`);
    const perKlantStop = {};
    stops.filter(c => c.stop_door === 'klant').forEach(c => { const kl = c.klant || '?'; perKlantStop[kl] = (perKlantStop[kl]||0) + 1; });
    const topK = Object.entries(perKlantStop).sort((a,b) => b[1] - a[1])[0];
    if(topK && topK[1] >= 2)
      add('gevaar', 2, 'Klant beëindigt herhaaldelijk', `${topK[0]} · ${topK[1]}×`,
        `${topK[0]} zette meerdere keren het contract stop. Óf de matching past niet bij deze klant, óf er speelt iets bij de klant zelf.`,
        `Plan een gesprek: wat verwacht ${topK[0]} precies? Scherp het profiel aan vóór je de volgende kandidaat voorstelt.`);
    const rec = cds.filter(c => ['Afgevallen','Gestopt'].includes(faseVan(c)) && c.recyclebaar === true);
    if(rec.length >= 3)
      add('kans', 2, 'Recyclebare kandidaten wachten', `${rec.length} in de pool`,
        `Er staan ${rec.length} kandidaten klaar die je eerder goedkeurde (o.a. offer-afwijzers — volledig gekwalificeerd). Heraanbieden bij een andere klant is sneller én goedkoper dan nieuwe instroom werven.`,
        `Open Uitval op het bord en loop de recyclebaar-lijst na: wie past bij een openstaande vacature?`);
  }

  return items.sort((a,b) => b.urg - a.urg);
}

/* ═══ UI-helpers ═══════════════════════════════════════════════ */
const H = CRM.h;
const kaart = (titel, body, opts) => { opts = opts || {};
  return `<div class="card">
    <div class="card-h"><div class="h2">${H(titel)}</div>${opts.acties||''}</div>
    <div class="card-b"${opts.plat ? ' style="padding:0"' : ''}>${body}</div>
    ${opts.voet ? `<div class="card-f"><span class="meta">${H(opts.voet)}</span></div>` : ''}
  </div>`;
};
const tabel = (koppen, rijen, leegTekst) => rijen
  ? `<div class="tblwrap" style="border:none"><table class="tbl"><thead><tr>${koppen}</tr></thead><tbody>${rijen}</tbody></table></div>`
  : `<div style="padding:18px 22px">${CRM.ui.leeg(leegTekst || 'Niets gevonden','')}</div>`;
/* +/− met huisstijlkleur: positief olijf, negatief rood. */
const signEur = n => { const v = Number(n)||0;
  return `<span class="num ${v>0?'pos':v<0?'neg':''}">${v<0?'−':'+'}${eur(Math.abs(v))}</span>`; };
const chip = (t, kl) => `<span class="chip ${kl||''}">${H(t)}</span>`;
/* Een telling (plaatsingen) met huisstijl-minteken en +/− kleuring. */
const telSpan = n => { const v = Number(n)||0;
  return `<span class="num ${v<0?'neg':''}">${v<0?'−'+Math.abs(v):v}</span>`; };

const TERMIJN_ST = {
  te_factureren:{lbl:'te factureren', cls:'amber'},
  gefactureerd:{lbl:'gefactureerd',   cls:'blue'},
  betaald:{lbl:'betaald',             cls:'green'},
  vervallen:{lbl:'vervallen',         cls:'red'}
};
const stChip = s => { const d = TERMIJN_ST[s] || {lbl:s||'—', cls:''}; return chip(d.lbl, d.cls); };

function plStatus(f, p, ins){
  if(p.concept) return {lbl:'concept — fee bevestigen', cls:'amber'};
  const act  = ins.filter(i => i.status!=='vervallen');
  const nGef = act.filter(i => i.status==='gefactureerd' || i.status==='betaald').length;
  const nBet = act.filter(i => i.status==='betaald').length;
  if(!act.length)       return {lbl:'geen termijnen', cls:''};
  if(nBet===act.length) return {lbl:'volledig betaald', cls:'green'};
  if(nGef===act.length) return {lbl:'volledig gefactureerd', cls:'blue'};
  if(nGef>0)            return {lbl:'deels gefactureerd', cls:'blue'};
  return {lbl:'nog niets gefactureerd', cls:''};
}

/* Eenvoudige SVG-lijngrafiek. Kleuren komen uit base.css-tokens. */
function lineChart(labels, series, opts){
  opts = opts || {};
  const W = 900, Hh = opts.height || 230, padL = 62, padR = 12, padT = 12, padB = 26;
  const all = series.flatMap(s => s.values).filter(v => isFinite(v));
  if(!labels.length || !all.length) return CRM.ui.leeg('Nog geen reeks om te tekenen','');
  let min = Math.min(0, ...all), max = Math.max(0, ...all);
  if(max === min) max = min + 1;
  const span = max - min; min -= span*0.06; max += span*0.06;
  const x = i => padL + (W-padL-padR)*(labels.length < 2 ? 0.5 : i/(labels.length-1));
  const y = v => padT + (Hh-padT-padB)*(1 - (v-min)/(max-min));
  let g = '';
  for(let s=0; s<=4; s++){
    const v = min + (max-min)*s/4, yy = y(v);
    const lbl = Math.abs(max) >= 5000 ? Math.round(v/1000) + 'k' : String(Math.round(v));
    g += `<line x1="${padL}" y1="${yy}" x2="${W-padR}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>`
       + `<text x="${padL-6}" y="${yy+4}" text-anchor="end" font-size="10" fill="var(--muted)">${H(lbl)}</text>`;
  }
  if(min < 0) g += `<line x1="${padL}" y1="${y(0)}" x2="${W-padR}" y2="${y(0)}" stroke="var(--red)" stroke-dasharray="4 3" stroke-width="1"/>`;
  labels.forEach((l,i) => {
    if(labels.length > 14 && i % 2) return;
    g += `<text x="${x(i)}" y="${Hh-6}" text-anchor="middle" font-size="10" fill="var(--muted)">${H(l)}</text>`;
  });
  for(const s of series){
    const pts = s.values.map((v,i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"${s.dash?' stroke-dasharray="5 4"':''}/>`;
    s.values.forEach((v,i) => {
      g += `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${s.color}"><title>${H(labels[i]+': '+eur(v))}</title></circle>`;
    });
  }
  const legend = series.map(s =>
    `<span class="fin-lg"><i style="background:${s.color}"></i>${H(s.label)}</span>`).join('');
  return `<div class="fin-chart"><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg></div>
    <div class="fin-legend">${legend}</div>`;
}

/* ─── Module-state (blijft staan tussen tabwissels) ───────────── */
let _tab = 'vandaag', _zoek = '', _filter = 'alle';
let _factStatus = 'actueel', _factKlant = '', _factGroep = 'maand';
let _cfScenario = 'pijplijn', _ketStap = '';
let _sd = null;                       // netto-calculator salaris vs. dividend
const _open = new Set();              // uitgeklapte plaatsingen

const TABS = [
  {k:'vandaag',     lbl:'Vandaag'},
  {k:'advies',      lbl:'Advies'},
  {k:'plaatsingen', lbl:'Plaatsingen & termijnen'},
  {k:'facturatie',  lbl:'Facturatie'},
  {k:'flex',        lbl:'Flex'},
  {k:'cashflow',    lbl:'Cashflow'},
  {k:'winst',       lbl:'Winst & doelen'},
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

  const k = kpis(f), pot = potjes(f), con = concentratie(f), fx = flexStats(f), tgt = targetInfo(f);
  const saldo = f.saldi[0];
  const vrij = saldo ? (Number(saldo.saldo)||0) - pot.btwPot - pot.vpbPot : null;
  const lijst = acties(f);
  const bw = yukiBewaking(f);
  const brief = cfoBriefing(f);

  const ICO = {factureren:'🧾', te_laat:'⏰', vervanging:'🔁', stop:'✂️', afronden:'📥',
               stop_signaal:'🛑', saldo:'🏦', flex:'🟢', concept:'✨', terug:'↩️'};
  const actieItems = lijst.map(a => {
    const wie = a.p ? `${a.p.kandidaat||'—'} · ${a.p.klant||'—'}`
              : (a.c ? `${a.c.naam||'—'} · ${a.c.klant||''}` : 'Algemeen');
    const bedrag = a.i ? ` · ${eur(bedragVan(a.i))} excl. btw` : '';
    return {ico: ICO[a.soort] || '•', titel: a.txt, tekst: wie + bedrag,
            wanneer: a.urg >= 2 ? 'urgent' : ''};
  });

  const briefIco = {ok:'🟢', warn:'🟠', kans:'🟡'};
  const briefHtml = `<div class="fin-brief">
    <div class="fin-brief-h">🧭 Je CFO deze week <span class="meta">— ${H(dOf(todayISO()))}</span></div>
    ${brief.map(z => `<div class="fin-brief-r"><span>${briefIco[z.k]||'•'}</span><span>${H(z.t)}</span></div>`).join('')}
  </div>`;

  const rij = (l, v) => `<div class="fin-pot"><span>${H(l)}</span><b>${v}</b></div>`;
  const potHtml = [
    rij('Btw-potje dit kwartaal (indicatief)', eur(pot.btwPot)),
    rij(`Vpb-reservering YTD (${pctF(Sn(f,'vpb_pct',0.19), 0)})`, eur(pot.vpbPot)),
    rij('Samen opzij te zetten', eur(pot.btwPot + pot.vpbPot)),
    rij('Winst-indicatie YTD' + (S(f,'yuki_synced_at') ? ' (live uit Yuki)' : ''), eur(pot.winstYtd)),
    (bw && bw.crediteuren > 0) ? rij('Nog te betalen inkoopfacturen (Yuki)', eur(bw.crediteuren)) : ''
  ].join('');

  const risicoHtml = [
    rij('Grootste klant', con.top1 ? H(con.top1.klant) + ' · ' + pctF(con.top1.aandeel) : '—'),
    rij('Top-3 klanten', pctF(con.top3 || 0)),
    (con.top1 && con.top1.aandeel > 0.35)
      ? `<div style="margin-top:8px">${chip('⚠ hoge afhankelijkheid van ' + con.top1.klant, 'red')}</div>` : '',
    rij('Stop-percentage plaatsingen', pctF(k.stopPct)),
    rij('Vervallen omzet (stops)', eur(k.vervallen)),
    rij('DSO (gem. betaalduur)', k.dso == null ? '—' : k.dso + ' dgn')
  ].join('');

  el.innerHTML = `
    ${briefHtml}
    <div class="grid c4" style="margin:18px 0">
      ${CRM.ui.kpi('Banksaldo', saldo ? eur(saldo.saldo) : '—',
        saldo ? `stand van ${H(dOf(saldo.datum))} · vrij besteedbaar na potjes: <b>${eur(vrij)}</b>`
              : 'nog geen saldo bekend', 'accent')}
      ${CRM.ui.kpi('Openstaand (gefact., niet betaald)', eur(k.openstaand),
        (bw && bw.yukiDeb) ? `Yuki meldt ${eur(bw.yukiDeb)} open (incl. btw)` : 'excl. btw')}
      ${CRM.ui.kpi('Deze maand' + (tgt.aantalTarget ? ' · target bord' : ''),
        tgt.aantalTarget ? `${telSpan(tgt.plaatsingen)} <span style="font-size:15px;color:var(--muted)">/ ${tgt.aantalTarget}</span>` : eur(k.omzetDezeMaand),
        tgt.aantalTarget
          ? `plaatsingen · gefactureerd ${eur(k.omzetDezeMaand)}${tgt.omzetTarget ? ' van ~'+eur(tgt.omzetTarget) : ''}`
          : `gefactureerd; nog te factureren: ${eur(k.nogTeFactureren)}`)}
      ${CRM.ui.kpi('Flex (run-rate p/m)', fx.maandRunRate ? eur(fx.maandRunRate) : '—',
        fx.laatste ? `laatste week ${eur(fx.laatste.bedrag)}` : 'nog geen weken ingevoerd')}
    </div>

    <div class="grid c2">
      ${kaart(`Acties (${lijst.length})`,
        actieItems.length ? CRM.ui.tijdlijn(actieItems)
                          : `<div class="note ok">Geen openstaande acties — alles is bij.</div>`,
        {acties: lijst.length ? finLink('vandaag','Afhandelen in de finance-app') : ''})}
      <div class="stack">
        ${kaart('Belastingpotjes', potHtml, {voet:'Btw = ontvangen btw dit kwartaal − voorbelasting. Vpb = percentage over de winst YTD (waar mogelijk verankerd op Yuki). Doorgeefgeld: reserveer het apart.'})}
        ${kaart('Risico’s', risicoHtml)}
      </div>
    </div>

    <div class="grid c2" style="margin-top:16px">
      ${kaart('Deze maand getekend', maandGetekendHtml(f))}
      ${kaart('Wat een adviseur checkt',
        tabel('<th>Kengetal</th><th class="n">Waarde</th><th>Toelichting</th>',
          adviseurCijfers(f).map(([l,v,s]) => `<tr><td>${H(l)}</td><td class="n"><b class="num">${H(v)}</b></td><td class="meta">${H(s)}</td></tr>`).join('')),
        {plat:true})}
    </div>

    <div class="note info" style="margin-top:18px">
      Alle cijfers hier komen uit dezelfde formules als de finance-app. Bewerken —
      facturen afvinken, fee bevestigen, instellingen — doe je in de finance-app.
    </div>`;
}

/* Kandidaten die deze maand tekenden/stopten, geteld zoals het bord. */
function maandGetekendHtml(f){
  const mk7 = todayISO().slice(0,7);
  const cs = cands();
  const getekend = cs.filter(c => String(c.geplaatst_op||'').slice(0,7) === mk7);
  const gestopt  = cs.filter(c => faseVan(c) === 'Gestopt'
    && String(c.gestopt_op||'').slice(0,7) === mk7 && c.geplaatst_op && !(c.vervangt||''));
  return `
    ${getekend.length ? tabel('<th>Kandidaat</th><th>Type</th><th class="n">Geplaatst</th>',
      getekend.map(c => `<tr>
        <td><b>${H(c.naam)}</b><div class="rowsub">${H([c.functie, c.klant].filter(Boolean).join(' · '))}</div></td>
        <td>${chip(c.type || '?', c.type === 'W&S' ? 'blue' : 'purple')}</td>
        <td class="n"><span class="num meta">${H(dKort(c.geplaatst_op))}</span></td></tr>`).join('')
      ) : CRM.ui.leeg('Nog niets getekend deze maand','')}
    ${gestopt.length ? `<div class="note warn" style="margin-top:12px">
      ${gestopt.length} gestopt deze maand: ${H(gestopt.map(c => c.naam).join(', '))}</div>` : ''}
    <p class="meta" style="margin:12px 0 0">Netto telling = getekend deze maand − gestopt deze maand,
      exact zoals het pijplijnbord en de finance-app het rekenen.</p>`;
}

/* ═══ TAB: PLAATSINGEN & TERMIJNEN ═════════════════════════════ */
function tabPlaatsingen(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen plaatsingen in demo',
    'Hier zie je normaal alle W&S-plaatsingen met hun factuurschema, status per termijn en totalen.'); return; }

  const k = kpis(f);
  const jaar = todayISO().slice(0,4);
  const betaaldJaar = f.installments.filter(i => i.status==='betaald'
    && String(i.betaaldatum||'').slice(0,4) === jaar).reduce((s,i) => s + bedragVan(i), 0);
  const klantRows = perKlantStats(f);
  const tot = klantRows.reduce((t,r) => ({
    n:t.n+r.n, fee:t.fee+r.fee, gefact:t.gefact+r.gefact, betaald:t.betaald+r.betaald,
    open:t.open+r.open, nog:t.nog+r.nog, vervallen:t.vervallen+r.vervallen,
    netto:t.netto+r.netto, w:t.w+(r.winstIndicatie||0)
  }), {n:0,fee:0,gefact:0,betaald:0,open:0,nog:0,vervallen:0,netto:0,w:0});

  el.innerHTML = `
    <div class="grid c4" style="margin-bottom:18px">
      ${CRM.ui.kpi('Pipeline aan open termijnen', eur(k.nogTeFactureren), 'nog te factureren (excl. btw)')}
      ${CRM.ui.kpi('Gefactureerd — openstaand', eur(k.openstaand), 'verstuurd, nog niet betaald', 'accent')}
      ${CRM.ui.kpi('Betaald dit jaar', eur(betaaldJaar), `ontvangen in ${jaar}`)}
      ${CRM.ui.kpi('Vervallen door stops', eur(k.vervallen), `${pctF(k.stopPct)} van de plaatsingen stopte`)}
    </div>

    <div class="stack">
      ${kaart('Per klant',
        klantRows.length ? tabel(
          '<th>Klant</th><th class="n">Plaats.</th><th class="n">Fee totaal</th><th class="n">Gefactureerd</th>'
          + '<th class="n">Betaald</th><th class="n">Open</th><th class="n">Nog te fact.</th>'
          + '<th class="n">Vervallen</th><th class="n">Netto omzet</th><th class="n">Winst-indicatie</th>',
          klantRows.map(r => `<tr>
            <td><b>${H(r.klant)}</b>${r.gestopt ? `<div class="rowsub">${r.gestopt}× gestopt</div>` : ''}</td>
            <td class="n num">${r.n}</td>
            <td class="n num">${eur(r.fee)}</td>
            <td class="n num">${eur(r.gefact)}</td>
            <td class="n num">${eur(r.betaald)}</td>
            <td class="n">${r.open ? `<span class="num" style="color:var(--amber)">${eur(r.open)}</span>` : '<span class="meta">—</span>'}</td>
            <td class="n num">${r.nog ? eur(r.nog) : '<span class="meta">—</span>'}</td>
            <td class="n">${r.vervallen ? `<span class="num neg">${eur(r.vervallen)}</span>` : '<span class="meta">—</span>'}</td>
            <td class="n"><b class="num">${eur(r.netto)}</b> <span class="meta">(${pctF(r.aandeel)})</span></td>
            <td class="n num">${r.winstIndicatie != null ? eur(r.winstIndicatie) : '<span class="meta">—</span>'}</td></tr>`).join('')
          + `<tr><td><b>Totaal</b></td><td class="n num"><b>${tot.n}</b></td>
             <td class="n num"><b>${eur(tot.fee)}</b></td><td class="n num"><b>${eur(tot.gefact)}</b></td>
             <td class="n num"><b>${eur(tot.betaald)}</b></td><td class="n num"><b>${eur(tot.open)}</b></td>
             <td class="n num"><b>${eur(tot.nog)}</b></td><td class="n num"><b>${eur(tot.vervallen)}</b></td>
             <td class="n num"><b>${eur(tot.netto)}</b></td>
             <td class="n num"><b>${tot.w ? eur(tot.w) : '—'}</b></td></tr>`
        ) : CRM.ui.leeg('Nog geen plaatsingen','Zodra een kandidaat tekent, verschijnt de klant hier.'),
        {plat: !!klantRows.length,
         voet:'Netto omzet = fee − vervallen termijnen. Winst-indicatie = netto omzet × je bedrijfsbrede winstmarge (uit Yuki); kosten worden niet per klant geregistreerd, dus dit is naar rato.'})}

      <div class="card">
        <div class="card-h">
          <div class="h2">Alle plaatsingen (W&amp;S)</div>
          <div class="searchbox"><input type="search" id="fin_pl_zoek" placeholder="Zoek kandidaat, klant of functie" value="${H(_zoek)}"></div>
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
      </div>
    </div>`;

  el.querySelector('#fin_pl_filter').value = _filter;
  el.querySelector('#fin_pl_zoek').addEventListener('input', CRM.debounce(e => {
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
      if(z && ![p.kandidaat, p.klant, p.functie].some(v => String(v||'').toLowerCase().includes(z))) return false;
      if(_filter==='alle') return true;
      if(_filter==='concept') return !!p.concept;
      if(_filter==='gestopt') return !!p.gestopt_op;
      return instOf(f, p.id).some(i => i.status === _filter);
    })
    .sort((a,b) => String(b.contract_datum||b.eerste_factuurdatum||'')
      .localeCompare(String(a.contract_datum||a.eerste_factuurdatum||'')));

  if(!rows.length){
    wrap.innerHTML = `<div style="padding:18px 22px">${CRM.ui.leeg('Geen plaatsingen gevonden',
      (z || _filter!=='alle') ? 'Pas je zoekopdracht of filter aan.'
        : 'Zodra een kandidaat een contract tekent, verschijnt de plaatsing hier.')}</div>`;
    return;
  }

  const btw = 1 + Sn(f,'btw_pct',0.21);
  wrap.innerHTML = `<div class="tblwrap" style="border:none;border-radius:0 0 var(--r-l) var(--r-l)">
    <table class="tbl">
      <thead><tr><th style="width:26px"></th><th>Kandidaat</th><th class="n">Fee excl.</th>
        <th>Status</th><th class="n">Termijnen</th><th class="n">Open</th><th class="n">Volgende termijn</th></tr></thead>
      <tbody>
      ${rows.map(p => {
        const ins = instOf(f, p.id);
        const st  = plStatus(f, p, ins);
        const ps  = placementStats(f, p);
        const g   = garantie(f, p);
        const act = ins.filter(i => i.status!=='vervallen');
        const nGef = act.filter(i => i.status==='gefactureerd' || i.status==='betaald').length;
        const next = ins.find(i => i.status==='te_factureren');
        const open = _open.has(p.id);
        return `
        <tr class="clickable fin-plrow" data-pid="${H(p.id)}">
          <td class="num" style="color:var(--muted)">${open?'▾':'▸'}</td>
          <td><b>${H(p.kandidaat || '—')}</b>
            <div class="rowsub">${H([p.functie, p.klant].filter(Boolean).join(' · '))}${
              p.gestopt_op ? ` · <span style="color:var(--red)">gestopt ${H(dKort(p.gestopt_op))}</span>` : ''}</div></td>
          <td class="n"><span class="num">${p.fee_excl!=null ? eur(p.fee_excl) : '—'}</span></td>
          <td>${chip(st.lbl, st.cls)}${g.vervangingNodig ? ' ' + chip('vervangen!','red')
             : g.actief ? ' ' + chip('garantie tot ' + dKort(g.tot), 'purple') : ''}</td>
          <td class="n"><span class="num">${nGef}/${act.length || p.aantal_termijnen || 0}</span> <span class="meta">gefact.</span></td>
          <td class="n">${ps.open ? `<span class="num" style="color:var(--amber)">${eur(ps.open)}</span>` : '<span class="meta">—</span>'}</td>
          <td class="n">${next ? `<span class="num">${eur(bedragVan(next))}</span><div class="rowsub num">${H(dKort(next.geplande_datum))}</div>`
                               : '<span class="meta">—</span>'}</td>
        </tr>
        ${open ? `<tr class="fin-plsub"><td></td><td colspan="6">
          ${ins.length ? `<table class="tbl fin-termijnen"><thead>
            <tr><th>#</th><th class="n">Excl. btw</th><th class="n">Incl. btw</th><th class="n">Gepland</th>
              <th>Status</th><th class="n">Gefactureerd</th><th class="n">Vervalt</th><th class="n">Betaald</th></tr></thead><tbody>
            ${ins.map(i => {
              const vv = vervaldatum(i, p);
              const laat = i.status==='gefactureerd' && vv && vv < todayISO() ? daysBetween(vv, todayISO()) : 0;
              return `<tr>
              <td class="num">${H(i.termijn_nr)}</td>
              <td class="n num">${eur(bedragVan(i))}</td>
              <td class="n num meta">${eur(bedragVan(i)*btw)}</td>
              <td class="n num">${i.geplande_datum ? H(dKort(i.geplande_datum)) : '—'}</td>
              <td>${stChip(i.status)}${laat ? ' ' + chip(laat + ' dgn te laat','red') : ''}</td>
              <td class="n num">${i.factuurdatum ? H(dKort(i.factuurdatum)) : '—'}</td>
              <td class="n num">${vv && i.status!=='betaald' && i.status!=='vervallen' ? H(dKort(vv)) : '—'}</td>
              <td class="n num">${i.betaaldatum ? H(dKort(i.betaaldatum)) : '—'}</td>
            </tr>`; }).join('')}</tbody></table>`
            : `<div class="meta" style="padding:8px 0">Nog geen factuurschema — ${p.concept ? 'bevestig de fee in de finance-app.' : 'geen termijnen gevonden.'}</div>`}
          <div class="meta" style="margin-top:10px">Betaaltermijn ${H(Number(p.betaaltermijn_dgn)||14)} dagen${
            p.garantie_mnd ? ` · garantie ${H(p.garantie_mnd)} mnd` : ''}${
            p.note ? ` · ${H(p.note)}` : ''}</div>
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

/* ═══ TAB: FACTURATIE ══════════════════════════════════════════
   Overgezet uit ~/ploeggenoten-finance/js/facturatie.js. De bron-app
   groepeert per MAAND met een klantfilter; hier kun je bovendien op
   klant groeperen, zodat "wat staat er bij deze klant open" in één
   blik klopt. Bedragen excl. én incl. btw, met "GEMIST" voor een
   gepasseerde factuurdatum en "X dgn te laat" na de vervaldatum.    */
function tabFacturatie(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen facturatie in demo',
    'Hier zie je normaal het volledige termijnschema per maand of per klant, met btw, te late en gemiste termijnen.'); return; }

  const btw = 1 + Sn(f,'btw_pct',0.21);
  const t = todayISO();
  const klanten = [...new Set(f.placements.map(p => p.klant).filter(Boolean))].sort();
  const plById = Object.fromEntries(f.placements.map(p => [p.id, p]));

  let items = f.installments.map(i => { const p = plById[i.placement_id]; return p ? {i, p} : null; })
    .filter(Boolean);
  if(_factKlant) items = items.filter(x => x.p.klant === _factKlant);
  if(_factStatus === 'actueel') items = items.filter(x => x.i.status !== 'vervallen' && x.i.status !== 'betaald');
  else if(_factStatus !== 'alles') items = items.filter(x => x.i.status === _factStatus);
  items.sort((a,b) => String(a.i.geplande_datum||'9999').localeCompare(String(b.i.geplande_datum||'9999')));

  /* Samenvatting over de ongefilterde set — dit is het "hoe sta ik ervoor". */
  const alle = f.installments;
  const som = fn => alle.filter(fn).reduce((s,i) => s + bedragVan(i), 0);
  const gemist = alle.filter(i => i.status==='te_factureren' && i.geplande_datum && i.geplande_datum < t);
  const teLaat = alle.filter(i => {
    if(i.status !== 'gefactureerd') return false;
    const p = plById[i.placement_id]; if(!p) return false;
    const vv = vervaldatum(i, p); return vv && vv < t;
  });

  /* Groepering */
  const groepen = {};
  for(const x of items){
    const key = _factGroep === 'klant'
      ? (x.p.klant || 'Zonder klant')
      : (x.i.geplande_datum ? monthKey(x.i.geplande_datum) : 'zonder');
    (groepen[key] = groepen[key] || []).push(x);
  }
  const volgorde = Object.keys(groepen).sort((a,b) =>
    _factGroep === 'klant'
      ? String(a).localeCompare(String(b))
      : (a === 'zonder' ? 1 : b === 'zonder' ? -1 : String(a).localeCompare(String(b))));

  const blokken = volgorde.map(key => {
    const xs = groepen[key];
    const totExcl = xs.reduce((s,x) => s + bedragVan(x.i), 0);
    const titel = _factGroep === 'klant' ? key : (key === 'zonder' ? 'Zonder datum' : mkLabel(key));
    const rows = xs.map(({i, p}) => {
      const vv = vervaldatum(i, p);
      const late = (i.status==='gefactureerd' && vv && vv < t) ? daysBetween(vv, t) : 0;
      const missed = i.status==='te_factureren' && i.geplande_datum && i.geplande_datum < t;
      const st = {
        te_factureren: missed ? chip('GEMIST','red') : chip('te factureren','amber'),
        gefactureerd:  late ? chip(late + ' dgn te laat','red') : chip('wacht op betaling','blue'),
        betaald:       chip('betaald','green'),
        vervallen:     chip('vervallen','red')
      }[i.status] || chip(i.status || '—');
      return `<tr${i.status==='vervallen' ? ' style="opacity:.55"' : ''}>
        <td class="num">${i.geplande_datum ? H(dKort(i.geplande_datum)) : '—'}</td>
        <td><b>${H(p.id)}</b> <span class="meta">t${H(i.termijn_nr)}</span></td>
        <td>${H(p.kandidaat || '—')}${_factGroep === 'klant' ? '' : `<div class="rowsub">${H(p.klant||'')}</div>`}</td>
        <td class="n num">${eur(bedragVan(i))}</td>
        <td class="n num meta">${eur(bedragVan(i)*btw)}</td>
        <td class="n num">${vv && i.status!=='betaald' && i.status!=='vervallen' ? H(dKort(vv)) : '—'}</td>
        <td>${st}</td></tr>`;
    }).join('');
    return kaart(titel, tabel(
      '<th class="n">Gepland</th><th>Termijn</th><th>Kandidaat</th><th class="n">Excl. btw</th>'
      + '<th class="n">Incl. btw</th><th class="n">Vervalt</th><th>Status</th>', rows),
      {plat:true, acties:`<span class="meta">${xs.length} termijn(en) · ${eur(totExcl)} excl. · ${eur(totExcl*btw)} incl. btw</span>`});
  }).join('');

  el.innerHTML = `
    <div class="grid c4" style="margin-bottom:18px">
      ${CRM.ui.kpi('Te factureren', eur(som(i => i.status==='te_factureren')),
        gemist.length ? `<span class="neg">${gemist.length} termijn(en) gemist</span> · ${eur(gemist.reduce((s,i)=>s+bedragVan(i),0))}`
                      : 'geen gemiste factuurdatums', gemist.length ? '' : 'accent')}
      ${CRM.ui.kpi('Wacht op betaling', eur(som(i => i.status==='gefactureerd')),
        teLaat.length ? `<span class="neg">${teLaat.length} over de vervaldatum</span> · ${eur(teLaat.reduce((s,i)=>s+bedragVan(i),0))}`
                      : 'alles binnen de betaaltermijn')}
      ${CRM.ui.kpi('Betaald', eur(som(i => i.status==='betaald')), 'volledig afgerekend (excl. btw)')}
      ${CRM.ui.kpi('Vervallen', eur(som(i => i.status==='vervallen')), 'termijnen die door een stop niet meer komen')}
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-h">
        <div class="h2">Termijnschema</div>
        <div class="seg" id="fin_fact_groep">
          <button data-g="maand"${_factGroep==='maand'?' class="on"':''}>Per maand</button>
          <button data-g="klant"${_factGroep==='klant'?' class="on"':''}>Per klant</button>
        </div>
        <select id="fin_fact_status" style="width:auto">
          <option value="actueel">Actueel (open + te factureren)</option>
          <option value="te_factureren">Te factureren</option>
          <option value="gefactureerd">Wacht op betaling</option>
          <option value="betaald">Betaald</option>
          <option value="vervallen">Vervallen</option>
          <option value="alles">Alles</option>
        </select>
        <select id="fin_fact_klant" style="width:auto">
          <option value="">Alle klanten</option>
          ${klanten.map(kl => `<option value="${H(kl)}">${H(kl)}</option>`).join('')}
        </select>
        ${finLink('facturatie','Afvinken in de finance-app')}
      </div>
      <div class="card-f"><span class="meta">${items.length} termijn(en) in beeld ·
        totaal ${eur(items.reduce((s,x) => s + bedragVan(x.i), 0))} excl. btw.
        "GEMIST" = de geplande factuurdatum is voorbij maar er is nog niet gefactureerd.
        "X dgn te laat" = de vervaldatum (factuurdatum + betaaltermijn van die klant) is verstreken.</span></div>
    </div>

    <div class="stack">${blokken || CRM.ui.leeg('Niets gevonden met dit filter','Kies een andere status of klant.')}</div>`;

  const stSel = el.querySelector('#fin_fact_status'); stSel.value = _factStatus;
  const klSel = el.querySelector('#fin_fact_klant'); klSel.value = _factKlant;
  stSel.onchange = e => { _factStatus = e.target.value; tabFacturatie(el, f); };
  klSel.onchange = e => { _factKlant = e.target.value; tabFacturatie(el, f); };
  el.querySelectorAll('#fin_fact_groep button').forEach(b => b.onclick = () => {
    _factGroep = b.dataset.g; tabFacturatie(el, f);
  });
}

/* ═══ TAB: FLEX ════════════════════════════════════════════════ */
function tabFlex(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen flex-gegevens in demo',
    'Hier zie je normaal de flexkrachten met marge per uur, gewerkte uren, overname-waarde en de wekelijkse marge-uitkering van Pronkert.'); return; }

  const st = flexPlStats(f), fx = flexStats(f);
  const vaste = budgetVoorMaand(f, monthKey(todayISO()));
  const dekking = vaste ? fx.maandRunRate/vaste : null;
  const weken = fx.weken.slice(-13);
  const maxW = Math.max(1, ...weken.map(w => Number(w.bedrag||0)));

  const rij = (r, afgerond) => `
    <tr>
      <td><b>${H(r.f.kandidaat)}</b>
        <div class="rowsub">${H(r.f.klant)}${afgerond && r.f.gestopt_op ? ' · gestopt ' + H(dKort(r.f.gestopt_op)) : ''}${
          r.f.concept ? ' · concept' : ''}</div></td>
      <td class="n num">${r.uurloon != null ? eur2(r.uurloon) : '—'}</td>
      <td class="n num">${r.klantfactor ? num(r.klantfactor, 2) : '—'} <span class="meta">− ${num(r.inkoop, 2)}</span></td>
      <td class="n num">${r.margePerUur != null ? eur2(r.margePerUur) : '<span class="meta">factor?</span>'}</td>
      <td class="n num">${r.gewerkteUren != null ? Math.round(r.gewerkteUren) + ' u' : '—'}</td>
      <td class="n">${r.verdiend != null ? `<span class="num pos">${eur(r.verdiend)}</span>${
        r.margeWerkelijk != null ? ' <span class="meta" title="werkelijke marge uit de Pronkert-facturen">✓</span>' : ''}`
        : '<span class="meta">—</span>'}</td>
      ${afgerond ? '' : `<td class="n">${r.resterendUren != null
        ? `<b class="num">nog ${Math.round(r.resterendUren)} u</b>${r.overnameWaarde != null ? `<div class="rowsub">waarde ${eur(r.overnameWaarde)}</div>` : ''}`
        : (r.overnameWaarde != null ? `<b class="num">${eur(r.overnameWaarde)}</b>` : '<span class="meta">overname-uren?</span>')}</td>`}
    </tr>`;

  const kopActief = '<th>Flexkracht</th><th class="n">Uurloon</th><th class="n">Factor</th>'
    + '<th class="n">Marge/uur</th><th class="n">Gewerkte uren</th><th class="n">Verdiend</th><th class="n">Tot kosteloze overname</th>';
  const kopKlaar  = '<th>Flexkracht</th><th class="n">Uurloon</th><th class="n">Factor</th>'
    + '<th class="n">Marge/uur</th><th class="n">Gewerkte uren</th><th class="n">Verdiend</th>';

  const trendTxt = fx.trendPct == null ? 'nog geen vorige periode om mee te vergelijken'
    : `${fx.trendPct >= 0 ? '▲ +' : '▼ '}${pctF(Math.abs(fx.trendPct))} vs. de 4 weken ervoor`;

  el.innerHTML = `
    <div class="grid c4" style="margin-bottom:18px">
      ${CRM.ui.kpi('Laatste week' + (fx.laatste ? ' · ' + dKort(fx.laatste.week) : ''),
        fx.laatste ? eur(fx.laatste.bedrag) : '—',
        (fx.laatste && fx.laatste.flexkrachten) ? `${fx.laatste.flexkrachten} flexkrachten` : 'uitbetaalde marge, excl. btw')}
      ${CRM.ui.kpi('Gemiddeld (4 weken)', eur(fx.avg4), trendTxt)}
      ${CRM.ui.kpi('Run-rate p/m', eur(fx.maandRunRate), 'gemiddelde laatste 4 weken × 52 ÷ 12', 'accent')}
      ${CRM.ui.kpi('Dekking vaste lasten', dekking == null ? '—' : pctF(dekking),
        vaste ? `recurring marge vs. ${eur(vaste)}/m` : 'nog geen budget ingesteld')}
    </div>

    <div class="grid c4" style="margin-bottom:18px">
      ${CRM.ui.kpi('Actief lopend', `<span class="num">${st.nActief}</span>`,
        st.nConcept ? `${st.nConcept} nog aan te vullen` : (st.nGestopt ? `${st.nGestopt} afgerond` : 'via Pronkert'))}
      ${CRM.ui.kpi('Verwachte marge p/m', eur(st.margePerMaand), 'op contracturen (model)')}
      ${CRM.ui.kpi('Overname-potentieel', eur(st.overnamePotentieel), 'marge tot de kosteloze overname')}
      ${CRM.ui.kpi('Verdiend over gewerkte uren', eur(st.verdiendTotaal),
        st.nGestopt ? `incl. ${eur(st.verdiendAfgerond)} afgerond` : 'werkelijk gemaakt')}
    </div>

    <div class="stack">
      ${kaart('Actief lopend',
        st.rows.length ? tabel(kopActief, st.rows.map(r => rij(r,false)).join(''))
          : CRM.ui.leeg('Geen actieve flexkrachten','Ze verschijnen automatisch vanuit het bord (Contract getekend, type Flex).'),
        {plat: !!st.rows.length, acties: finLink('flex','Openen in finance-app'),
         voet:'Marge/uur = (klantfactor − inkoopfactor Pronkert) × uurloon. Verdiend = werkelijke marge uit de Pronkert-facturen (✓) of anders marge/uur × gewerkte uren. Tot kosteloze overname = afgesproken overname-uren − gewerkte uren.'})}

      ${st.gestoptRows.length ? kaart('Afgerond / gestopt — verdiende marge',
        tabel(kopKlaar, st.gestoptRows.map(r => rij(r,true)).join('')), {plat:true}) : ''}

      ${kaart('Wekelijkse marge (Pronkert)',
        weken.length ? `<div class="fin-bars">
          ${weken.map(w => `<div class="fb" title="week van ${H(dOf(w.week))}: ${H(eur(w.bedrag))}${
            w.flexkrachten ? ' · ' + w.flexkrachten + ' flexkrachten' : ''}">
            <i style="height:${Math.max(2, (Number(w.bedrag||0)/maxW)*100)}%"></i>
            <span class="num">${H(dKort(w.week))}</span></div>`).join('')}
        </div>
        <p class="meta" style="margin-top:12px">Flex-omzet dit jaar (YTD): <b>${eur(fx.ytd)}</b>.
          Sven wordt wekelijks gefactureerd, Alain per 4 weken — recente weken kunnen tijdelijk lager
          lijken tot die factuur binnen is. De cashflow rekent met het gemiddelde van de laatste 4 weken.</p>`
        : CRM.ui.leeg('Nog geen weekfacturen verwerkt','Importeer de Pronkert-margefacturen in de finance-app.'),
        {acties:`<span class="meta">laatste ${weken.length} weken</span>`})}
    </div>`;
}

/* ═══ TAB: CASHFLOW ════════════════════════════════════════════
   Volledige projectie uit calc.js: ontvangsten op betaaldatum (incl. btw),
   flex-run-rate, kosten (werkelijk waar bekend), btw-afdracht per kwartaal
   en geplande aflossingen. Plus de 13-weken kaspositie.                  */
const CF_SCENARIOS = {
  pijplijn: {lbl:'Verwacht · pijplijn', bron:'pijplijn'},
  target:   {lbl:'Op target',           bron:'target'},
  tegen:    {lbl:'Tegenvaller (−2/mnd)',bron:'target', min:2},
  geen:     {lbl:'Zonder nieuwe W&S',   bron:'geen'}
};
function tabCashflow(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen cashflow in demo',
    'Hier zie je normaal de 12-maands saldo-projectie met btw-afdracht en aflossingen, plus de 13-weken kaspositie.'); return; }

  const tgt = boardTarget(todayISO().slice(0,7));
  const mk = key => {
    const s = CF_SCENARIOS[key];
    return {bron: s.bron, plaatsingenPm: Math.max(0, tgt - (s.min||0))};
  };
  const proj      = projectie(f, 12, mk(_cfScenario));
  const sTarget   = projectie(f, 12, mk('target'));
  const sPijplijn = projectie(f, 12, mk('pijplijn'));
  const sDown     = projectie(f, 12, mk('tegen'));
  const be = breakEven(f), pot = potjes(f), pf = pipelineForecast(f);
  const saldo = f.saldi[0];
  const vrij = saldo ? (Number(saldo.saldo)||0) - pot.btwPot - pot.vpbPot : null;
  const bp = boardPlaatsingen(todayISO().slice(0,7));
  const wp = weekProjectie(f, 13);

  const chart = lineChart(proj.rows.map(r => r.label), [
    {label:'Huidig scenario', color:'var(--olive)',   values: proj.rows.map(r => r.saldo)},
    {label:'Op target',       color:'var(--green)',   values: sTarget.rows.map(r => r.saldo)},
    {label:'Tegenvaller',     color:'var(--amber)',   values: sDown.rows.map(r => r.saldo), dash:true}
  ], {height:250});

  const maandRijen = proj.rows.map(r => `<tr>
    <td><b>${H(r.label)}</b></td>
    <td class="n num">${eur(r.inFact)}</td>
    <td class="n num" style="color:var(--purple)">${r.inFlex ? eur(r.inFlex) : '—'}</td>
    <td class="n num meta">${r.inScenario ? eur(r.inScenario) : '—'}</td>
    <td class="n num">${eur(r.uitKosten)}</td>
    <td class="n num">${r.uitBtw ? eur(r.uitBtw) : '—'}</td>
    <td class="n num">${r.uitLening ? eur(r.uitLening) : '—'}</td>
    <td class="n">${signEur(r.inTot - r.uitTot)}</td>
    <td class="n"><span class="num ${r.saldo < 0 ? 'neg' : ''}" style="font-weight:700">${eur(r.saldo)}</span></td>
  </tr>`).join('');

  const weekRijen = wp.weeks.map(w => `<tr${w === wp.laagste ? ' class="fin-laagst"' : ''}>
    <td><b>${H(dKort(w.start))}</b>${w === wp.laagste ? ' ' + chip('laagst','amber') : ''}</td>
    <td class="n num">${w.in ? eur(w.in) : '—'}</td>
    <td class="n num">${w.uit ? eur(w.uit) : '—'}</td>
    <td class="n">${signEur(w.netto)}</td>
    <td class="n"><span class="num ${w.saldo < 0 ? 'neg' : ''}" style="font-weight:700">${eur(w.saldo)}</span></td>
  </tr>`).join('');

  const scenKaart = (key, p) => `<div class="kpi${key===_cfScenario?' accent':''}">
    <div class="label">${H(CF_SCENARIOS[key].lbl)}</div>
    <div class="big"><span class="num ${p.eind < 0 ? 'neg' : ''}">${eur(p.eind)}</span></div>
    <div class="kd">eindsaldo na 12 mnd · laagste ${eur(p.laagste.saldo)} (${H(p.laagste.label||'—')})</div>
  </div>`;

  el.innerHTML = `
    <div class="grid c4" style="margin-bottom:18px">
      ${CRM.ui.kpi('Startsaldo' + (saldo ? ' · ' + dKort(saldo.datum) : ''),
        saldo ? eur(saldo.saldo) : '—',
        saldo ? `vrij na belastingpotjes: <b>${eur(vrij)}</b>` : 'nog geen banksaldo bekend', 'accent')}
      ${CRM.ui.kpi('Laagste punt (dit scenario)',
        `<span class="num ${proj.laagste.saldo < 0 ? 'neg' : ''}">${eur(proj.laagste.saldo)}</span>`,
        H(proj.laagste.label || '—') + (proj.negatief ? ' · <span class="neg">projectie duikt onder nul</span>' : ''))}
      ${CRM.ui.kpi('Runway zónder nieuwe W&S', (proj.runway >= 12 ? '12+' : proj.runway) + ' mnd',
        'factuurschema + flex − kosten, btw en aflossing')}
      ${CRM.ui.kpi('Deze maand · target bord', `${telSpan(bp.netto)} <span style="font-size:15px;color:var(--muted)">/ ${tgt}</span>`,
        `${bp.ws} W&amp;S · ${bp.flex} flex${bp.onb ? ' · '+bp.onb+' ?' : ''}${bp.stopM ? ' · −'+bp.stopM+' gestopt' : ''}`)}
    </div>

    <div class="grid c4" style="margin-bottom:18px">
      ${scenKaart('pijplijn', sPijplijn)}
      ${scenKaart('target', sTarget)}
      ${scenKaart('tegen', sDown)}
      ${CRM.ui.kpi('Break-even', be.nodig == null ? '—' : num(be.nodig) + ' pl./mnd',
        `kosten ${eur(be.kostPm)}/m − flex ${eur(be.flexPm)}, gedeeld door fee ${eur(be.gemFee)} × blijfkans ${pctF(be.behoud, 0)}`)}
    </div>

    <div class="stack">
      ${kaart('Saldo-projectie — 12 maanden', chart, {acties:`
        <div class="seg" id="fin_cf_scen">
          ${Object.keys(CF_SCENARIOS).map(k =>
            `<button data-s="${k}"${k===_cfScenario?' class="on"':''}>${H(CF_SCENARIOS[k].lbl)}</button>`).join('')}
        </div>`,
        voet:`Blijfkans ${pctF(proj.blijfkans, 0)} (historisch: ${kpis(f).nGestopt} van ${f.placements.length} plaatsingen gestopt). Pijplijn levert nu gewogen ${num(pf.verwachtAantal)} plaatsingen in beeld.`})}

      ${kaart('Maandtabel', tabel(
        '<th>Maand</th><th class="n">In: facturen</th><th class="n">In: flex</th><th class="n">In: scenario</th>'
        + '<th class="n">Uit: kosten</th><th class="n">Btw-afdracht</th><th class="n">Aflossing</th>'
        + '<th class="n">Netto</th><th class="n">Saldo</th>', maandRijen), {plat:true,
        voet:'Alle bedragen INCL. btw — dit is wat er op de bank komt en afgaat. Ontvangst = geplande factuurdatum + betaaltermijn van die klant; te late betalingen: aanname binnen 2 weken. Btw-afdracht in jan/apr/jul/okt over het vorige kwartaal, minus geschatte voorbelasting.'})}

      ${kaart('13-weken cashflow — grip op de timing', tabel(
        '<th>Week vanaf</th><th class="n">In</th><th class="n">Uit</th><th class="n">Netto</th><th class="n">Saldo eind</th>',
        weekRijen), {plat:true,
        acties:`<span class="meta">krapste moment: week van ${H(dOf(wp.laagste.start))} → ${H(eur(wp.laagste.saldo))}</span>`,
        voet:'Vaste lasten zijn per week uitgesmeerd; btw-afdrachten en aflossingen staan op hun echte datum. Nieuwe, nog niet-gefactureerde W&S-omzet zit hier bewust NIET in — dit is je zekere kaspositie.'})}
    </div>

    <div class="note info" style="margin-top:16px">
      Scenario’s zijn hier ter vergelijking; de wat-als-schuiven (extra hire, omzetdip, flexfactor,
      opgeslagen prognoses) staan in de finance-app. ${finLink('cashflow','Wat-als in de finance-app','btn ghost sm')}
    </div>`;

  el.querySelectorAll('#fin_cf_scen button').forEach(b => b.onclick = () => {
    _cfScenario = b.dataset.s; tabCashflow(el, f);
  });
}

/* ═══ TAB: KOSTEN ══════════════════════════════════════════════ */
function tabKosten(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen kosten in demo',
    'Hier zie je normaal het kostenbudget per post naast de werkelijke kosten uit Yuki, met verschil per maand en de bankmutaties.'); return; }

  const mk0 = monthKey(todayISO());
  const maanden = [...Array(6)].map((_,i) => addMonths(mk0, -5+i));
  const postenNu = f.budget
    .filter(b => String(b.vanaf_maand||'').slice(0,7) <= mk0.slice(0,7)
              && (!b.tot_maand || String(b.tot_maand).slice(0,7) >= mk0.slice(0,7)))
    .slice().sort((a,b) => (Number(b.bedrag_pm)||0) - (Number(a.bedrag_pm)||0));
  const allePosten = f.budget.slice()
    .sort((a,b) => String(b.vanaf_maand||'').localeCompare(String(a.vanaf_maand||''))
                || (Number(b.bedrag_pm)||0) - (Number(a.bedrag_pm)||0));

  /* Bankmutaties per maand uit de CSV-import (fin_bank_tx). */
  const txPerMaand = {};
  for(const x of f.tx){
    const k = monthKey(x.datum); if(!k) continue;
    txPerMaand[k] = txPerMaand[k] || {in:0, uit:0, n:0};
    txPerMaand[k].n++;
    if(Number(x.bedrag) > 0) txPerMaand[k].in += Number(x.bedrag); else txPerMaand[k].uit += -Number(x.bedrag);
  }
  const txRijen = Object.entries(txPerMaand).sort((a,b) => String(b[0]).localeCompare(String(a[0]))).slice(0,6)
    .map(([k,v]) => `<tr><td><b>${H(mkLabel(k))}</b><div class="rowsub">${v.n} mutatie(s)</div></td>
      <td class="n"><span class="num pos">${eur(v.in)}</span></td>
      <td class="n"><span class="num neg">${eur(v.uit)}</span></td>
      <td class="n">${signEur(v.in - v.uit)}</td></tr>`).join('');

  el.innerHTML = `
    <div class="grid c3" style="margin-bottom:18px">
      ${CRM.ui.kpi('Vaste lasten deze maand', eur(budgetVoorMaand(f, mk0)),
        `${postenNu.length} budgetpost(en) actief`, 'accent')}
      ${CRM.ui.kpi('Kosten YTD (werkelijk of budget)', eur(potjes(f).kostenYtd),
        'zoals de winst-indicatie hem rekent')}
      ${CRM.ui.kpi('Break-even', (() => { const be = breakEven(f);
        return be.nodig == null ? '—' : num(be.nodig) + ' pl./mnd'; })(),
        'plaatsingen per maand die deze kosten dekken')}
    </div>

    <div class="stack">
      ${kaart('Budget vs. werkelijk — laatste 6 maanden', tabel(
        '<th>Maand</th><th class="n">Budget</th><th class="n">Werkelijk</th><th class="n">Verschil</th>',
        maanden.map(m => {
          const bud = budgetVoorMaand(f, m);
          const act = actueelInfo(f, m);
          /* Verschil = budget − werkelijk: negatief (rood) is overschrijding.
             De finance-app draait dit teken om (werkelijk − budget); dezelfde
             uitkomst, maar hier volgen we de plus/min-regel van het CRM. */
          const diff = act ? bud - act.bedrag : null;
          return `<tr>
            <td><b>${H(mkLabel(m))}</b>${m === mk0 ? '<div class="rowsub">lopende maand</div>' : ''}</td>
            <td class="n num">${eur(bud)}</td>
            <td class="n">${act ? `<span class="num">${eur(act.bedrag)}</span>${
              act.yuki ? ' <span class="meta" title="Werkelijk totaal (Yuki) — leidend">✓ Yuki</span>' : ''}`
              : '<span class="meta">nog niet bekend</span>'}</td>
            <td class="n">${diff == null ? '<span class="meta">—</span>' : signEur(diff)}</td>
          </tr>`;
        }).join('')), {plat:true, acties: finLink('kosten','Openen in finance-app'),
        voet:'Werkelijk = de regel "Werkelijk totaal (Yuki)" waar aanwezig (✓, automatisch per afgesloten maand), anders de som van de handmatige posten. Verschil = budget min werkelijk: negatief (rood) betekent overschrijding.'})}

      ${kaart('Budgetposten', tabel(
        '<th>Post</th><th class="n">Per maand</th><th class="n">Geldig</th><th>Status</th>',
        allePosten.map(b => {
          const geldigNu = String(b.vanaf_maand||'').slice(0,7) <= mk0.slice(0,7)
            && (!b.tot_maand || String(b.tot_maand).slice(0,7) >= mk0.slice(0,7));
          return `<tr${geldigNu ? '' : ' style="opacity:.6"'}>
            <td><b>${H(b.categorie)}</b>${b.note ? `<div class="rowsub">${H(b.note)}</div>` : ''}</td>
            <td class="n num">${eur(b.bedrag_pm)}</td>
            <td class="n"><span class="num meta">${H(mkLabel(b.vanaf_maand))} — ${
              b.tot_maand ? H(mkLabel(b.tot_maand)) : 'doorlopend'}</span></td>
            <td>${geldigNu ? chip('actief','green') : chip('buiten deze maand','')}</td></tr>`;
        }).join(''), 'Geen budgetposten'),
        {plat: !!allePosten.length,
         acties:`<span class="meta">totaal ${eur(budgetVoorMaand(f, mk0))} p/m actief</span>`})}

      ${kaart('Bankmutaties (uit de CSV-import)',
        txRijen ? tabel('<th>Maand</th><th class="n">Bij</th><th class="n">Af</th><th class="n">Netto</th>', txRijen)
          : CRM.ui.leeg('Nog geen transacties geïmporteerd','Importeer een bank-CSV op de Cashflow-pagina van de finance-app.'),
        {plat: !!txRijen,
         voet:'Handig om je werkelijke kosten en saldo te staven tegen wat de app verwacht.'})}
    </div>`;
}

/* ═══ TAB: ADVIES ══════════════════════════════════════════════ */
function tabAdvies(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen advies in demo',
    'De advies-motor rekent op je echte cijfers: buffer, btw-klap, klantconcentratie, uitval, fee-niveau en flex-dekking.'); return; }

  const items = adviesEngine(f);
  const cijfers = adviseurCijfers(f);
  const ta = tariefAdvies(f);
  const pf = pipelineForecast(f);
  const kanalen = kanaalStats(f);
  const kTot = kanalen.reduce((s,x) => s + x.omzet, 0) || 1;
  const team = teamStats(f);
  const rv = recruiterVoortgang(f);
  const behoefte = targetInfo(f).aantalTarget || 8;

  const ICO = {gevaar:'🔴', kans:'🟡', sterkte:'🟢'};
  const KL  = {gevaar:'red', kans:'amber', sterkte:'green'};
  const advKaart = it => `<div class="fin-adv u${it.urg}">
    <div class="fin-adv-i">${ICO[it.cat] || '•'}</div>
    <div class="fin-adv-b">
      <div class="fin-adv-t"><b>${H(it.titel)}</b>${it.cijfer ? ' ' + chip(it.cijfer, KL[it.cat]) : ''}</div>
      <p>${H(it.tekst)}</p>
      ${it.actie ? `<p class="fin-adv-a">👉 ${H(it.actie)}</p>` : ''}
    </div></div>`;
  const sectie = (cat, titel) => {
    const xs = items.filter(i => i.cat === cat);
    return kaart(`${titel} (${xs.length})`,
      xs.length ? `<div class="fin-advlijst">${xs.map(advKaart).join('')}</div>`
                : `<div class="note ok">Niets gevonden — dat is hier goed nieuws.</div>`);
  };

  el.innerHTML = `
    <div class="note info" style="margin-bottom:16px">
      Live berekend uit je eigen cijfers, met branchenormen voor werving &amp; selectie en flex.
      Elke kaart: wat er speelt, waarom het telt, en wat een adviseur zou doen.
    </div>

    ${kaart('De cijfers die een adviseur checkt', tabel(
      '<th>Kengetal</th><th class="n">Waarde</th><th>Toelichting</th>',
      cijfers.map(([l,v,s]) => `<tr><td>${H(l)}</td><td class="n"><b class="num">${H(v)}</b></td><td class="meta">${H(s)}</td></tr>`).join('')
    ), {plat:true})}

    <div class="stack" style="margin-top:16px">
      ${sectie('gevaar','🔴 Gevaren')}
      ${sectie('kans','🟡 Kansen')}
      ${sectie('sterkte','🟢 Sterktes')}

      ${belastingKaart(f)}

      ${ta.rows.length ? kaart('Tarief-adviseur — wat levert elke klant echt op', tabel(
        `<th>Klant</th><th class="n">Plaatsingen ${H(todayISO().slice(0,4))}</th><th class="n">Netto omzet</th>`
        + '<th class="n">Tarief</th><th class="n">Jouw gemiddelde</th><th class="n">Rek (op jaarbasis)</th>',
        ta.rows.map(r => `<tr>
          <td><b>${H(r.klant)}</b>${r.gestopt ? ' ' + chip(r.gestopt + '× gestopt','red') : ''}</td>
          <td class="n num">${r.n}</td>
          <td class="n num">${eur(r.netto)}</td>
          <td class="n">${r.pct ? `<b class="num">${pctF(r.pct)}</b>` : chip('geen tarief','amber')}</td>
          <td class="n num meta">${ta.bench ? pctF(ta.bench) : '—'}</td>
          <td class="n">${r.potentie > 500 ? `<b class="num" style="color:var(--amber)">+${eur(r.potentie)}</b>`
            : (r.pct ? '<span class="meta">marktconform</span>' : '<span class="meta">—</span>')}</td></tr>`).join('')
      ), {plat:true, voet: (ta.rows[0] && ta.rows[0].potentie > 500)
        ? `${ta.rows[0].klant} zit op ${pctF(ta.rows[0].pct)} waar je gewogen gemiddelde ${pctF(ta.bench)} is — naar het gemiddelde is dat ~${eur(ta.rows[0].potentie)} per jaar bij gelijk volume. Neem het mee in het volgende contractgesprek.`
        : 'Geen klant zit noemenswaardig onder je gemiddelde tarief — netjes.'}) : ''}

      ${kaart('Wat zit er in de pijplijn — live van het bord',
        pf.rows.length ? tabel(
          '<th>Kandidaat</th><th>Klant</th><th>Fase</th><th class="n">Kans</th><th class="n">Fee</th>'
          + '<th class="n">Bruto gewogen</th><th class="n">Netto (na uitval)</th><th class="n">Cash verwacht</th>',
          pf.rows.map(r => `<tr>
            <td><b>${H(r.c.naam)}</b></td>
            <td>${H(r.c.klant || '—')}</td>
            <td>${chip(faseVan(r.c), r.kans >= .5 ? 'green' : r.kans >= .25 ? 'amber' : '')}</td>
            <td class="n num">${Math.round(r.kans*100)}%</td>
            <td class="n num">${eur(r.fee)}${r.feeEcht ? '' : ' <span class="meta">~</span>'}</td>
            <td class="n num meta">${eur(r.gewogen)}</td>
            <td class="n"><b class="num">${eur(r.netto)}</b></td>
            <td class="n num">${H(mkLabel(r.cashMaand))}</td></tr>`).join('')
        ) : CRM.ui.leeg('Geen actieve kandidaten in de W&S-funnel','Zodra er kandidaten op het bord staan, verschijnt hier de gewogen forecast.'),
        {plat: !!pf.rows.length,
         acties:`<span class="meta">gewogen <b>${num(pf.verwachtAantal)}</b> plaatsingen · bruto ${eur(pf.totaal)} → netto ${eur(pf.totaalNetto)} excl. btw</span>`,
         voet:`Kans per fase: voorgesteld 5% · O&O 10% · 1e gesprek 20% · 2e gesprek 40% · meeloopdag 50% · in de wacht 50% · offer 65% · ondertekenen 75% (Intake telt niet mee). Bruto = kans × fee. Netto = ook na verwachte uitval (nu blijft ${Math.round(pf.behoud*100)}%). Om ${behoefte} plaatsing(en) per maand te halen moet de pijplijn dat tempo blijven voeden — nu staat er gewogen ${num(pf.verwachtAantal)} op de rol.`})}

      ${ketenKaart()}

      <div class="grid c2">
        ${kaart('Wervingskanalen',
          kanalen.length ? tabel('<th>Kanaal</th><th class="n">Plaatsingen</th><th class="n">Omzet (na uitval)</th><th class="n">Aandeel</th>',
            kanalen.map(x => `<tr><td><b>${H(x.bron)}</b></td><td class="n num">${x.n}</td>
              <td class="n num">${eur(x.omzet)}</td><td class="n num">${pctF(x.omzet/kTot)}</td></tr>`).join(''))
            : CRM.ui.leeg('Nog geen bronnen gekoppeld',''),
          {plat: !!kanalen.length,
           voet:'Bron per kandidaat komt van het pijplijnbord. Leg dit naast je advertentie-uitgaven (Kosten → Marketing) om te zien welk kanaal opschalen verdient.'})}

        ${kaart('Team & snelheid', `
          ${rv.rows.length ? `<div class="meta" style="margin-bottom:8px">Deze maand · maandtarget ${H(rv.tgt == null ? '—' : rv.tgt)}${
            rv.rows.some(r => r.gelijkVerdeeld) ? ' — gelijk verdeeld' : ''}</div>
          ${tabel('<th>Recruiter</th><th class="n">Deze maand</th><th class="n">Doel</th><th>Voortgang</th>',
            rv.rows.map(r => { const p = r.doel ? Math.min(100, Math.round(r.gedaan/r.doel*100)) : 0;
              const hit = r.doel && r.gedaan >= r.doel;
              return `<tr><td><b>${H(r.rec)}</b></td>
                <td class="n"><span class="num ${hit?'pos':''}">${r.gedaan}</span></td>
                <td class="n num">${r.doel}</td>
                <td style="min-width:110px">${CRM.ui.bar(p, hit ? 'green' : '')}</td></tr>`; }).join(''))}` : ''}
          ${team.recruiters.length ? `<div class="meta" style="margin:14px 0 8px">Omzet YTD (na uitval)</div>
          ${tabel('<th>Recruiter</th><th class="n">Plaatsingen</th><th class="n">Omzet</th>',
            team.recruiters.map(r => `<tr><td><b>${H(r.rec)}</b></td><td class="n num">${r.n}</td>
              <td class="n num">${eur(r.omzet)}</td></tr>`).join(''))}`
            : CRM.ui.leeg('Nog geen recruiters gekoppeld','')}
          ${team.timeToFill != null ? `<div class="fin-pot" style="margin-top:12px"><span>Gem. doorlooptijd bord → plaatsing</span><b>${team.timeToFill} dgn</b></div>` : ''}`)}
      </div>
    </div>`;

  wireBelasting(el, f);
  el.querySelectorAll('[data-ketstap]').forEach(b => b.onclick = () => {
    _ketStap = (_ketStap === b.dataset.ketstap) ? '' : b.dataset.ketstap;
    tabAdvies(el, f);
  });
}

/* Belasting & DGA — signalering en rekenhulp, géén belastingadvies. */
function belastingKaart(f){
  const bel = belastingAdvies(f), F = bel.F;
  if(!_sd) _sd = {bedrag:25000, box1: Math.round(bel.loonHeelJaar || F.gebruikelijkLoon)};
  const rij = (l, v, sub) => `<div class="fin-pot"><span>${H(l)}${sub?`<br><span class="meta">${H(sub)}</span>`:''}</span><b>${v}</b></div>`;
  return kaart('Belasting & DGA — je twee belastingen uit elkaar', `
    <div class="grid c2">
      <div class="fin-blok accent">
        <div class="label">Btw · dit kwartaal ${H(bel.kwLabel)}</div>
        <div class="big">${eur(bel.btwKwartaal)}</div>
        <p class="meta">Opgebouwd t/m dag ${H(bel.dagenInKw)} van het kwartaal. Dit is een <b>lopende teller</b>,
          geen rekening — doorgeefgeld (21% van klanten − voorbelasting ${eur(bel.voorbelasting)}), los van winst,
          kosten en DGA-loon. De aangifte die je nú betaalt is het vórige, afgesloten kwartaal.</p>
      </div>
      <div class="fin-blok amber">
        <div class="label">Vpb · winstbelasting ${H(F.jaar)}</div>
        <div class="big">${eur(bel.vpbReservering)}</div>
        <p class="meta">Reserveren over winst YTD ${eur(bel.winst)} (19%). Bepaald over je <b>hele jaar</b>
          op 31 december — hier drukken DGA-loon en kosten op, niet op de btw.</p>
      </div>
    </div>

    <div class="fin-blok" style="margin-top:14px">
      <b>Gebruikelijkloon-check DGA</b>
      ${bel.loonIngevuldOk
        ? `<p class="meta">Op dit tempo boek je over ${H(F.jaar)} <b>${eur(bel.loonHeelJaar)}</b> aan DGA-loon
             (${eur(bel.loonPm)}/mnd × ${H(12 - bel.startMnd + 1)} mnd vanaf ${H(MND[bel.startMnd-1])}).
             Norm ${H(F.jaar)} = <b>${eur(F.gebruikelijkLoon)}</b>.
             ${bel.loonTekort > 0
               ? `<span class="neg">Tekort ~${eur(bel.loonTekort)}.</span> Bespreek met je boekhouder of je over heel ${H(F.jaar)} moet bijboeken — het gebruikelijk loon geldt voor het hele jaar dat je DGA bent, niet vanaf je startmaand.`
               : 'Je zit op of boven de norm — netjes.'}</p>`
        : `<p class="meta">Bruto DGA-loon en startmaand staan nog niet ingevuld
             (Instellingen in de finance-app). Zodra dat er staat, checkt dit blok of je aan het
             gebruikelijk loon van ${eur(F.gebruikelijkLoon)} komt.</p>`}
    </div>

    <div class="fin-blok" style="margin-top:14px">
      <b>Meer loon uitkeren of in de BV laten (dividend)?</b>
      ${tabel('<th>Route</th><th class="n">Belastingdruk (indicatie ' + H(F.jaar) + ')</th>',
        `<tr><td>Loon uitkeren — box 1</td><td class="n num">${pctF(F.box1.schijf1)} tot ${eur(F.box1.grens1)} · ${pctF(F.box1.top)} daarboven</td></tr>
         <tr><td>In BV laten → later dividend (box 2)</td><td class="n num">${pctF(bel.bvRouteTarief)} tot ${eur(F.box2.grens)} · ${pctF(1-(1-F.vpb.laag)*(1-F.box2.hoog))} daarboven</td></tr>`)}
      <p class="meta" style="margin-top:10px">Vuistregel: de eerste ±${eur(F.box1.grens1)} salaris is vaak iets
        voordeliger dan in de BV laten; dáárboven wint dividend meestal. Het is een verschuiving, geen gratis besparing.</p>
      <div style="border-top:1px dashed var(--line);margin-top:12px;padding-top:12px">
        <b>Netto-calculator</b> <span class="meta">— wat houd je echt over?</span>
        <div id="fin_sd">${sdHtml()}</div>
      </div>
    </div>

    <div class="fin-blok" style="margin-top:14px">
      <b>Nog ${H(bel.mndTotEind)} maand${bel.mndTotEind === 1 ? '' : 'en'} om ${H(F.jaar)} te sturen</b>
      <p class="meta">Vpb gaat over je jaarwinst op 31 december — vóór die datum kun je ${H(F.jaar)} nog
        beïnvloeden. Bespreek met je boekhouder: gebruikelijk loon kloppend maken · investeringsaftrek (KIA)
        vóór 31 dec · timing van kosten die je tóch moet maken · dividendruimte dit jaar of volgend jaar.</p>
    </div>`,
    {voet:'Signalering en rekenhulp, géén belastingadvies. Tarieven 2026; jouw situatie kan afwijken — de knopen hak je met je boekhouder door.'});
}
function sdHtml(){
  const c = salarisDividendCalc(_sd.bedrag, _sd.box1);
  return `
    <div class="grid c2" style="margin:10px 0">
      <label class="meta">Bedrag uit de BV halen (winst) €
        <input id="sd_bedrag" type="number" min="0" step="1000" value="${H(_sd.bedrag)}"></label>
      <label class="meta">Je huidige bruto jaarinkomen box 1 €
        <input id="sd_box1" type="number" min="0" step="1000" value="${H(_sd.box1)}"></label>
    </div>
    <div class="grid c2">
      <div class="fin-blok${c.beste==='salaris' ? ' accent' : ''}">
        <div class="label">Als salaris (box 1)${c.beste==='salaris' ? ' ✓' : ''}</div>
        <div class="big">${eur(c.nettoSalaris)}</div>
        <p class="meta">netto (${Math.round(c.pctSalaris*100)}%) · belasting box 1 ${eur(c.box1Extra)}</p>
      </div>
      <div class="fin-blok${c.beste==='dividend' ? ' accent' : ''}">
        <div class="label">Als dividend (Vpb + box 2)${c.beste==='dividend' ? ' ✓' : ''}</div>
        <div class="big">${eur(c.nettoDividend)}</div>
        <p class="meta">netto (${Math.round(c.pctDividend*100)}%) · Vpb ${eur(c.vpb)} + box 2 ${eur(c.box2)}</p>
      </div>
    </div>
    <p class="meta" style="margin-top:10px">Voordeligst: <b>${H(c.beste)}</b> — scheelt netto ~<b>${eur(c.verschil)}</b>
      op ${eur(c.winst)}. Indicatie zónder heffingskortingen en zónder het gebruikelijk-loon-minimum.</p>`;
}
function wireBelasting(el){
  const wrap = el.querySelector('#fin_sd'); if(!wrap) return;
  const bind = (id, veld) => { const inp = wrap.querySelector(id); if(!inp) return;
    inp.oninput = e => {
      _sd[veld] = Math.max(0, Number(e.target.value) || 0);
      wrap.innerHTML = sdHtml(); wireBelasting(el);
    };
  };
  bind('#sd_bedrag','bedrag'); bind('#sd_box1','box1');
}

/* Conversie-keten: voorstel → offer → plaatsing → blijver. */
function ketenKaart(){
  const ck = conversieKeten();
  if(!ck.voorstellen) return kaart('Conversie-keten',
    CRM.ui.leeg('Nog geen afgeronde trajecten op het bord',''));
  const f1 = x => x == null ? '—' : num(x);
  const p  = x => x == null ? '—' : pctF(x, 0);
  const stap = (key, n, lbl) => `<button class="fin-stap${_ketStap===key?' on':''}" data-ketstap="${key}">
    <span class="fin-stap-n">${H(n)}</span><span class="fin-stap-l">${H(lbl)}</span></button>`;
  const lijst = _ketStap && ck.lijsten[_ketStap] ? ck.lijsten[_ketStap] : null;
  const titelMap = {voorstellen:'Voorgesteld (in procedure genomen)', offers:'Offer-stadium bereikt',
                    plaats:'Plaatsing (getekend)', blijft:'Blijft (niet gestopt)'};
  return kaart('Conversie-keten — van voorstel tot blijvende plaatsing', `
    <div class="grid c4" style="margin-bottom:14px">
      ${CRM.ui.kpi('Voorstellen → 1 offer', f1(ck.voorPerOffer),
        `${ck.offers} van ${ck.voorstellen} halen het offer-stadium (${p(ck.pctOffer)})`)}
      ${CRM.ui.kpi('Offers → 1 plaatsing', f1(ck.offerPerPlaatsing),
        `${ck.plaats} van ${ck.offers} tekenen (${p(ck.pctPlaats)})`)}
      ${CRM.ui.kpi('Plaatsingen → 1 blijver', ck.blijft ? f1(deel(ck.plaats, ck.blijft)) : '—',
        `${ck.blijft} van ${ck.plaats} blijven (${p(ck.pctBlijft)})`)}
      ${CRM.ui.kpi('Voorstellen per blijver', f1(ck.voorPerBlijver),
        `duurzaam (tijd afgemaakt): ${ck.duurzaam} van ${ck.plaats} (${p(ck.pctDuurzaam)})`, 'accent')}
    </div>
    <div class="fin-keten">
      ${stap('voorstellen', ck.voorstellen, 'voorgesteld')}
      <span class="fin-pijl">→ ${H(p(ck.pctOffer))}</span>
      ${stap('offers', ck.offers, 'offer-stadium')}
      <span class="fin-pijl">→ ${H(p(ck.pctPlaats))}</span>
      ${stap('plaats', ck.plaats, 'getekend')}
      <span class="fin-pijl">→ ${H(p(ck.pctBlijft))}</span>
      ${stap('blijft', ck.blijft, 'blijft')}
    </div>
    ${lijst ? `<div style="margin-top:14px"><div class="meta" style="margin-bottom:6px">${H(titelMap[_ketStap])} — ${lijst.length}</div>
      ${tabel('<th>Kandidaat</th><th>Klant</th><th>Functie</th><th>Recruiter</th><th>Uitkomst</th>',
        lijst.slice().sort((a,b) => String(a.klant||'').localeCompare(String(b.klant||''))
          || String(a.naam||'').localeCompare(String(b.naam||'')))
          .map(c => {
            let uit;
            if(c.geplaatst_op || ['Contract getekend','Gestart'].includes(faseVan(c))){
              uit = (faseVan(c) === 'Gestopt' || c.gestopt_op)
                ? chip('gestopt' + (c.stop_categorie ? ' · ' + c.stop_categorie : ''), 'red')
                : chip('geplaatst' + (faseVan(c) === 'Gestart' ? ' · gestart' : ''), 'green');
            } else if(c.afval_type === 'offer_afgewezen'){
              uit = chip('offer afgewezen' + (c.afval_categorie ? ' · ' + c.afval_categorie : ''), 'amber');
            } else {
              uit = chip('afgevallen' + (c.afval_categorie ? ' · ' + c.afval_categorie : ''), '');
            }
            return `<tr><td><b>${H(c.naam)}</b></td><td>${H(c.klant||'—')}</td>
              <td>${H(c.functie||'—')}</td><td>${H(String(c.rec||'').trim() || '—')}</td><td>${uit}</td></tr>`;
          }).join(''), 'Niemand in deze stap')}</div>`
      : `<p class="meta" style="margin-top:10px">Klik op een stap voor de namen.</p>`}`,
    {voet:'Uit je afgeronde trajecten op het bord (fase-historie + uitval-registratie). Offer-stadium = ooit In de wacht, Offer of Contract ondertekenen bereikt. Wordt scherper naarmate de fase-historie vult.'});
}

/* ═══ TAB: WINST & DOELEN ══════════════════════════════════════
   Overgezet uit renderWinstDoelen() van de finance-app: jaardoel-GPS,
   winst-doorrekening (omzet → winst → na Vpb → na lening → vrij) en de
   investeringsbeslisser. Instellingen (omzetdoel, kostenbasis) blijven
   in de finance-app; hier lees je de doorrekening.                     */
function tabWinst(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen winstdoorrekening in demo',
    'Hier zie je normaal je omzetdoel, de winst-brug tot wat je overhoudt en de investeringsbeslisser.'); return; }

  const od = omzetDoel(f), gps = jaardoelGps(f), w = winstDoorrekening(f);
  const ic = investeringsCheck(f, {}), uk = uitkeerRuimte(f);
  const be = breakEven(f);

  const brug = [
    ['Omzet (doel)', w.doel, ''],
    [`− Kosten (${eur(w.kostenMaand)}/mnd × 12)`, -w.kostenJaar, ''],
    ...(w.herinvest > 0 ? [['− Herinvesteren (extra aftrekbare kosten)', -w.herinvest, '']] : []),
    ['= Winst vóór Vpb', w.winstVoorVpb, 'sum'],
    ['− Vpb (19% tot €200k, 25,8% erboven)', -w.vpb, ''],
    ['= Netto winst (na Vpb)', w.nettoWinst, 'sum'],
    ['− Aflossing lening', -w.leningAflossing, ''],
    ['= Vrij: uitkeren of investeren', w.vrij, 'sum']
  ].map(([l,v,k]) => `<tr${k==='sum'?' class="fin-sum"':''}>
      <td>${H(l)}</td><td class="n"><span class="num ${v<0?'neg':''}">${v<0?'−':''}${eur(Math.abs(v))}</span></td></tr>`).join('');

  const gpsBlok = (titel, b) => b ? `<div class="fin-blok">
      <b>${H(titel)}</b>
      <div class="fin-pot"><span>Omzet nodig (excl. btw)</span><b>${eur(b.omzetNodig)}</b></div>
      <div class="fin-pot"><span>waarvan kosten te dekken</span><b class="meta">${eur(b.kosten)}</b></div>
      <div class="fin-pot"><span>Flex dekt (run-rate)</span><b>${eur(b.flexBij)}</b></div>
      <div class="fin-pot"><span>W&amp;S nodig</span><b>${eur(b.wsNodig)}</b></div>
      <div class="fin-pot"><span>= Plaatsingen</span><b>${num(b.plaats)} <span class="meta">(${num(b.perMnd)}/mnd)</span></b></div>
    </div>` : '';

  el.innerHTML = `
    <div class="grid c4" style="margin-bottom:18px">
      ${CRM.ui.kpi(`Omzet YTD ${H(od.jaar)}`, eur(od.omzetYtd),
        `${pctF(od.pctDoel, 0)} van het doel ${eur(od.doel)} · op dit tempo ${eur(od.omzetRunRate)}/jaar`, 'accent')}
      ${CRM.ui.kpi('Gecontracteerd', eur(od.gecontracteerd),
        `voorzichtig (na uitval op latere termijnen): ${eur(od.gecontracteerdVoorzichtig)}`)}
      ${CRM.ui.kpi('Ontvangen (kas)', eur(od.ontvangen),
        `${eur(od.openstaand)} gefactureerd maar nog niet betaald`)}
      ${CRM.ui.kpi('Plaatsingen nodig voor het doel',
        od.plaatsingenNodig == null ? '—' : num(od.plaatsingenNodig, 0),
        `${num(od.perMnd)} per maand bij gem. fee ${eur(od.gemFee)} · nu ${od.plaatsingenYtd} YTD`)}
    </div>

    <div class="stack">
      ${kaart('Jaardoel-GPS', gps.doel == null
        ? CRM.ui.leeg('Nog geen winstdoel ingesteld','Zet "doel_winst_jaar" in de finance-app om deze GPS te vullen.')
        : `<div class="fin-pot"><span>Winstdoel dit jaar</span><b>${eur(gps.doel)}</b></div>
           <div class="fin-pot"><span>Winst YTD (indicatie)</span><b>${eur(gps.winstYtd)}</b></div>
           <div class="fin-pot"><span>Nog te gaan</span><b>${eur(gps.teGaan)}</b></div>
           <div class="grid c2" style="margin-top:12px">
             ${gpsBlok(`T/m 31 december (${gps.mndRest} mnd)`, gps.restJaar)}
             ${gpsBlok('Komende 12 maanden', gps.rolling)}
           </div>
           <p class="meta" style="margin-top:10px">Huidig tempo: <b>${num(gps.tempo)}</b> plaatsingen/maand
             (dit jaar). Break-even ligt op ${be.nodig == null ? '—' : num(be.nodig)} plaatsingen/maand.</p>`)}

      ${kaart('Winst-doorrekening — van omzet tot wat je overhoudt', `
        <p class="meta">Kostenbasis <b>${eur(w.basisKosten)}</b>${
          w.extraLoon > 0 ? ` + ${eur(w.extraLoon)} extra loon = <b>${eur(w.kostenMaand)}</b>` : ''}/mnd ·
          bron: <b>${H(w.kostenBron)}</b>.</p>
        ${tabel('<th>Stap</th><th class="n">Bedrag</th>', brug)}
        <div class="grid c2" style="margin-top:14px">
          ${CRM.ui.kpi('Winstmarge (vóór Vpb)', pctF(w.winstmarge),
            `${eur(w.winstVoorVpb)} winst ÷ ${eur(w.doel)} omzet`)}
          ${CRM.ui.kpi('Netto winstmarge (na Vpb)', pctF(w.nettoMarge),
            `${eur(w.nettoWinst)} netto ÷ ${eur(w.doel)} omzet`, 'accent')}
        </div>
        <div class="fin-blok" style="margin-top:14px">
          <b>Wat levert 1 extra plaatsing op?</b>
          ${tabel('<th>Post</th><th class="n">Bedrag</th>',
            `<tr><td>Gemiddelde fee</td><td class="n num">${eur(w.gemFee)}</td></tr>
             <tr><td>− Marketing/sourcing per plaatsing</td><td class="n"><span class="num neg">−${eur(w.mktPerPl)}</span></td></tr>
             <tr><td>− Uitval-risico (${Math.round(w.stopPct*100)}% stopt)</td><td class="n"><span class="num neg">−${eur(w.uitvalPerPl)}</span></td></tr>
             <tr class="fin-sum"><td>= Marginale winst per extra plaatsing</td><td class="n"><b class="num pos">${eur(w.marginaleWinstPl)}</b> <span class="meta">(${Math.round(w.marginaleMargePl*100)}%)</span></td></tr>`)}
          <p class="meta" style="margin-top:10px">Je gemiddelde marge (~${Math.round(w.winstmarge*100)}%) bevat
            álle vaste kosten. Eén <b>extra</b> plaatsing kost alleen sourcing + uitvalrisico — je vaste kosten
            zijn al betaald. Daarom is de marginale marge ~${Math.round(w.marginaleMargePl*100)}%.</p>
        </div>
        <div class="grid c2" style="margin-top:14px">
          ${CRM.ui.kpi('Als dividend uitkeren (box 2)', eur(w.dividendNetto), `netto privé, na box 2 ${eur(w.box2)}`)}
          ${CRM.ui.kpi('Of herinvesteren in het bedrijf', eur(w.vrij), 'volledig herinvesteren (geen box 2)')}
        </div>`,
        {voet:'Btw staat hier bewust niet in — dat is doorgeefgeld en verlaagt je winst niet. De lening is geen kostenpost maar een balanspost; hij verlaagt wél je vrije cash. Omzetdoel en kostenbasis stel je in de finance-app in.'})}

      ${kaart('Uitkeer-planner & investeringsruimte', `
        <div class="fin-pot"><span>Laagste cashpunt komende 12 mnd</span><b>${eur(uk.laagste)} <span class="meta">(${H(uk.laagsteLabel||'—')})</span></b></div>
        <div class="fin-pot"><span>Aan te houden: buffer + Vpb-pot</span><b>${eur(uk.buffer)} + ${eur(uk.vpb)}</b></div>
        <div class="fin-pot"><span>Nu veilig uit te keren / af te lossen</span><b class="${uk.ruimte>0?'pos':'neg'}">${eur(uk.ruimte)}</b></div>
        <div class="fin-pot"><span>Cashbuffer in maanden vaste lasten</span><b>${num(ic.bufferVoorMnd)} mnd <span class="meta">(norm 3–6)</span></b></div>
        <div class="fin-pot"><span>Runway zónder nieuwe W&amp;S</span><b>${ic.r.runway >= 12 ? '12+' : ic.r.runway} mnd</b></div>
        <div class="fin-pot"><span>Break-even vóór extra lasten</span><b>${ic.breakEvenVoor == null ? '—' : num(ic.breakEvenVoor) + ' pl./mnd'}</b></div>`,
        {voet:'Ruimte = laagste projectie-saldo − veiligheidsbuffer − Vpb-reservering. Geplande aflossingen zitten al in de projectie. De wat-als-schuiven (extra uitkeren, investering doorrekenen) staan in de finance-app.',
         acties: finLink('cashflow','Investering doorrekenen in de finance-app')})}
    </div>`;
}

/* ═══ Registratie ══════════════════════════════════════════════ */
const RENDERERS = {
  vandaag: tabVandaag, advies: tabAdvies, plaatsingen: tabPlaatsingen,
  facturatie: tabFacturatie, flex: tabFlex, cashflow: tabCashflow,
  winst: tabWinst, kosten: tabKosten
};

CRM.registerModule('finance', {
  title:'Finance', icon:'€',
  onderschrift:'Alle cijfers uit de finance-app — dezelfde formules, dezelfde uitkomsten',
  adminOnly:true,

  async render(mount, acties){
    /* Riem én bretels: de navigatie verbergt de module al en de router
       weigert hem, maar geld tonen we nooit zonder expliciete check —
       finLaad() doet daarnaast geen enkele query zonder dit recht. */
    if(!CRM.canSeeMoney()){
      mount.innerHTML = `<div class="note warn">Deze module is alleen zichtbaar voor de eigenaar.</div>`;
      if(acties) acties.innerHTML = '';
      return;
    }
    acties.innerHTML = `
      <button class="btn sub" id="fin_verniew" title="Cijfers opnieuw ophalen">↻ Vernieuwen</button>
      <a class="btn ghost" href="${FIN_APP}" target="_blank" rel="noopener">Finance-app openen ↗</a>`;
    const vBtn = document.getElementById('fin_verniew');
    if(vBtn) vBtn.onclick = async () => { _fin = null; CRM.toast('Financiële cijfers vernieuwen…'); CRM.render(); };

    mount.innerHTML = CRM.ui.laden('Financiële gegevens ophalen…');
    let f = null, laadFout = null;
    try{ f = await finLaad(); }
    catch(e){ laadFout = e; }

    if(!f){
      const boodschap = (laadFout && laadFout.message) || (_finFout && _finFout.message)
        || (_finFout ? String(_finFout) : 'Onbekende fout');
      mount.innerHTML = `<div class="note warn"><b>Financiële gegevens niet geladen.</b><br>
        ${H(boodschap)}<br>
        <span class="meta">Dit is verwacht als je niet als eigenaar bent ingelogd — de fin_-tabellen zijn met RLS afgeschermd.</span></div>`;
      return;
    }

    const mistNote = (!f.demo && _mist.length)
      ? `<div class="note warn" style="margin-bottom:14px">Niet alles kon geladen worden:
          <b>${H(_mist.join(', '))}</b> — die onderdelen tonen een lege staat. De rest klopt gewoon.</div>` : '';

    mount.innerHTML = `
      ${mistNote}
      <div class="tabs" id="fin_tabs">
        ${TABS.map(t => `<button class="tab${t.k===_tab?' on':''}" data-t="${t.k}">${H(t.lbl)}</button>`).join('')}
      </div>
      <div id="fin_body"></div>`;

    const body = mount.querySelector('#fin_body');
    const toon = () => {
      mount.querySelectorAll('#fin_tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.t === _tab));
      try{ RENDERERS[_tab](body, f); }
      catch(e){
        console.error('Finance-tab ' + _tab, e);
        body.innerHTML = `<div class="note err"><b>Dit tabblad gaf een fout.</b><br>
          ${H((e && e.message) || String(e))}<br>
          <span class="meta">De andere tabbladen werken gewoon; de volledige stacktrace staat in de console.</span></div>`;
      }
    };
    mount.querySelectorAll('#fin_tabs .tab').forEach(b => b.onclick = () => { _tab = b.dataset.t; toon(); });
    toon();
  }
});

})();
