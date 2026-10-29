/* ═══════════════════════════════════════════════════════════════
   MODULE: FINANCE — alleen zichtbaar voor Tjeerd.
   Complete overzet van de losse finance-app (~/ploeggenoten-finance)
   in het rustige CRM-jasje: Vandaag, Advies, Plaatsingen & termijnen,
   Facturatie, Flex, Cashflow, Winst & doelen en Kosten.

   Het REKENWERK is 1-op-1 overgenomen uit js/calc.js van de finance-app
   (zie de kopjes "bron: calc.js"). Sinds 27 okt 2026 verhuist ook het
   BEWERKEN hierheen, stap voor stap: plaatsingen afronden, termijnen
   afvinken/verzetten, fee bevestigen en stoppen kan al hier (zie
   "BEWERKEN"). Cashflow, kosten en instellingen volgen.

   Privacy: de fin_*-tabellen hebben RLS waardoor alleen Tjeerd ze kan
   lezen. Deze module is bovendien adminOnly én iedere query zit achter
   CRM.canSeeMoney(), zodat een teamlid de tabellen niet eens bevraagt.
   Drie grenzen: navigatie, render en database.
   ═══════════════════════════════════════════════════════════════ */

(function(){
'use strict';

const FIN_APP = 'https://ploeggenoten.github.io/ploeggenoten-finance/';

/* ─── Getallen uit de database ────────────────────────────────
   Een bedrag kan als tekst binnenkomen: PostgREST levert `numeric`
   soms als string, en een handmatig gevulde rij bevat zomaar
   "1.200,50" of "€ 4.000". Ging dat via Number() dan werd het NaN,
   sijpelde die NaN door elke som en toonde het scherm een streepje
   of — erger — €0 waar duizenden euro's hoorden te staan. Stil fout.
   getal() leest daarom zowel de Nederlandse als de Engelse notatie
   en valt terug op `fallback` als er echt geen getal in zit.        */
function getal(v, fallback = 0){
  if(v == null || v === '') return fallback;
  if(typeof v === 'number') return isFinite(v) ? v : fallback;
  if(typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v).trim().replace(/[\s ]/g,'').replace(/[€$]/g,'');
  if(!s) return fallback;
  /* Een punt gevolgd door precies drie cijfers is in deze administratie een
     duizendtalscheiding ("1.200" = twaalfhonderd). Een factor of percentage
     schrijf je als "1,8" of "0.22" en valt daar dus buiten. Blijft er twijfel,
     dan meldt de datacheck het veld sowieso — zie vuilGetal(). */
  if(s.includes(',')) s = s.replace(/\./g,'').replace(',', '.');       // 1.200,50 → 1200.50
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');    // 1.200 → 1200
  const n = Number(s);
  return isFinite(n) ? n : fallback;
}
/* Zelfde lezer, maar "niets ingevuld" blijft null i.p.v. 0 — voor velden
   waar leeg iets anders betekent dan nul (uurloon, klantfactor, uren). */
const getalOfNull = v => { const n = getal(v, NaN); return isFinite(n) ? n : null; };
/* Verdacht bedrag: gevuld, géén getal, en ook niet het nette "4500.00" dat
   PostgREST voor een numeric-kolom teruggeeft. Dus: "1.200,50", "€ 4.000",
   "n.v.t." — precies de waarden waar stil een verkeerd totaal uit rolt. */
const RUW_GETAL = /^-?\d+(\.\d+)?$/;
const vuilGetal = v => v != null && v !== '' && typeof v !== 'number'
  && !RUW_GETAL.test(String(v).trim());
/* En hard fout: er zit helemaal geen getal in. Telt hier als 0. */
const leesbaarGetal = v => getalOfNull(v) != null;

/* ─── Opmaak & datums ─────────────────────────────────────────
   Geld altijd via CRM.euro zodat de finance-module er hetzelfde
   uitziet als de rest van het CRM. Percentages komen als fractie
   binnen (0.35) en gaan er als "35,0%" uit; niet-eindige waarden
   worden een streepje in plaats van NaN%.                        */
const eur  = n => (n==null || !isFinite(Number(n))) ? '—' : CRM.euro(Number(n));
const eur2 = n => (n==null || !isFinite(Number(n))) ? '—' : CRM.euro(Number(n), 2);
/* Zelfde bedrag, maar met het huisstijl-minteken vóór het euroteken
   (CRM.euro maakt er anders "€-1.234" van). Voor alles wat negatief
   kan worden: winst-indicatie, nog-te-gaan, verschillen.            */
const eurN = n => (n==null || !isFinite(Number(n))) ? '—'
  : (Number(n) < 0 ? '−' + CRM.euro(Math.abs(Number(n))) : CRM.euro(Number(n)));
const pctF = (x, dec=1) => (x==null || !isFinite(Number(x))) ? '—' : CRM.pct(Number(x)*100, dec);
/* Percentage als heel getal, voor de zinnen in de adviesteksten. Nooit "NaN%". */
const pct0 = x => (x==null || !isFinite(Number(x))) ? '—' : Math.round(Number(x)*100) + '%';
const num  = (n, dec=1) => (n==null || !isFinite(Number(n))) ? '—'
  : Number(n).toLocaleString('nl-NL', {minimumFractionDigits:dec, maximumFractionDigits:dec});
/* Deling die nooit NaN of Infinity oplevert. */
const deel = (a, b) => (Number(b) ? Number(a)/Number(b) : null);
/* Groeperen op klantnaam: een lege naam werd als objectsleutel de tekst
   "null" en stond zo letterlijk als klantnaam op het scherm. */
const klantLabel = k => String(k==null?'':k).trim() || 'Zonder klant';
/* Leeg tekstveld → streepje. Voorkomt "null" en "undefined" in zinnen. */
const tekst = (v, leeg='—') => { const x = String(v==null?'':v).trim(); return x || leeg; };

const MND = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const todayISO = () => CRM.todayISO();
/* mk = maandsleutel 'YYYY-MM-01' — precies zoals de finance-app hem gebruikt,
   zodat vergelijkingen met fin_costs_budget.vanaf_maand kloppen. */
const monthKey = iso => iso ? String(iso).slice(0,7) + '-01' : null;
/* Een lege of onleesbare maand werd "? 'N"; nu gewoon een streepje. */
const mkLabel  = mk => {
  const [y,m] = String(mk==null?'':mk).split('-').map(Number);
  if(!(y >= 1900) || !(m >= 1 && m <= 12)) return '—';
  return MND[m-1] + " '" + String(y).slice(2);
};
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
const bedragVan = i => getal(i && i.bedrag_excl, 0);

/* ─── Data laden (fouttolerant per tabel) ─────────────────────── */
let _fin = null, _finFout = null, _mist = [];

function legeFin(){
  return { placements:[], installments:[], saldi:[], settings:{}, yukiOpen:[],
           flexWeken:[], flexPl:[], flexAfspr:[], flexRegels:[], budget:[], actuals:[],
           tarieven:[], loans:[], loanPayments:[], tx:[], dismissed:[] };
}

/* ─── Fouten vertalen ─────────────────────────────────────────
   Deze module leunt volledig op tabellen buiten het CRM. Gaat daar iets
   mis, dan komt er een Engelse databasezin terug ("relation … does not
   exist", "Failed to fetch") waar niemand iets mee kan. Hier maken we er
   één Nederlandse zin van MET wat je eraan doet; de technische tekst
   blijft eronder staan zodat hij nog te diagnosticeren is.            */
function foutSoort(e){
  const code = String((e && e.code) || '');
  const msg  = String((e && e.message) || e || '').toLowerCase();
  if(code === '42P01' || /does not exist|schema cache|could not find the table|pgrst205/.test(msg)) return 'geen_tabel';
  if(code === '42501' || code === 'PGRST301' || e?.status === 401 || e?.status === 403
     || /permission denied|not authorized|jwt|row-level security|rls/.test(msg)) return 'geen_rechten';
  if(e instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed|timeout|aborted/.test(msg)
     || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'geen_verbinding';
  return 'onbekend';
}
const FOUT_UITLEG = {
  geen_tabel: {
    kop: 'De financiële tabellen staan nog niet in deze database.',
    wat: 'Het CRM zoekt de tabellen die met fin_ beginnen, maar die bestaan hier (nog) niet. '
       + 'Draai het schema uit de finance-app één keer in Supabase, dan verschijnen de cijfers vanzelf.'
  },
  geen_rechten: {
    kop: 'Je account mag de financiële tabellen niet lezen.',
    wat: 'De fin_-tabellen zijn met RLS afgeschermd voor de eigenaar. Log in met tjeerd@ploeggenoten.nl; '
       + 'ben je dat al, log dan één keer uit en opnieuw in — je sessie kan verlopen zijn.'
  },
  geen_verbinding: {
    kop: 'Geen verbinding met de database.',
    wat: 'De cijfers konden niet opgehaald worden. Controleer je internetverbinding en probeer het opnieuw; '
       + 'er is niets misgegaan met je gegevens.'
  },
  onbekend: {
    kop: 'De financiële gegevens konden niet opgehaald worden.',
    wat: 'Probeer het opnieuw. Blijft het misgaan, open dan de finance-app zelf — staan de cijfers daar wél, '
       + 'dan zit het probleem in deze koppeling en niet in je administratie.'
  }
};
function foutBlok(e, tabellen){
  const soort = foutSoort(e), u = FOUT_UITLEG[soort];
  const tech = (e && e.message) ? String(e.message) : (e ? String(e) : '');
  /* Bij een gedeeltelijke storing is de tabellijst nuttig; valt alles weg,
     dan is die lijst alleen maar ruis. */
  const lijst = (tabellen && tabellen.length)
    ? (tabellen.length > 6 ? 'alle financiële tabellen' : tabellen.join(', ')) : '';
  return `<div class="note warn">
    <b>${H(u.kop)}</b><br>${H(u.wat)}
    ${lijst ? `<br><span class="meta">Het gaat om: ${H(lijst)}.</span>` : ''}
    ${tech ? `<br><span class="meta">Technische melding: ${H(tech)}</span>` : ''}
    <div style="margin-top:10px" class="row tight">
      <button class="btn sub" id="fin_opnieuw">Opnieuw proberen</button>
      <a class="btn ghost" href="${FIN_APP}" target="_blank" rel="noopener">Finance-app openen ↗</a>
    </div>
  </div>`;
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
  const [pl, inst, sal, st, yo, fw, fp, fa, bud, act, trf, ln, lp, tx, dis, fr] = await Promise.all([
    veiligQ('fin_placements','id'),        veiligQ('fin_installments','geplande_datum'),
    veiligQ('fin_bank_saldo','datum',false),veiligQ('fin_settings'),
    veiligQ('fin_yuki_open','datum'),      veiligQ('fin_flex_weken','week'),
    veiligQ('fin_flex_plaatsingen','id'),  veiligQ('fin_flex_afspraken','klant'),
    veiligQ('fin_costs_budget','vanaf_maand'), veiligQ('fin_costs_actual','maand'),
    veiligQ('fin_tarieven','klant'),       veiligQ('fin_loans','id'),
    veiligQ('fin_loan_payments','datum'),  veiligQ('fin_bank_tx','datum',false),
    veiligQ('fin_dismissed_candidates'),
    /* Regels van de Pronkert-margefacturen. Bestaat de tabel nog niet (migratie
       niet gedraaid), dan geeft veiligQ null terug en werkt de rest gewoon door. */
    veiligQ('fin_flex_regels','week')
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
    flexRegels:   fr||[],
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
const Sn = (f, key, fallback=0) => getal(S(f, key, fallback), fallback);

/* ─── Bordkandidaten & targets ────────────────────────────────
   De finance-app leest de tabel `candidates` rechtstreeks; het CRM heeft
   dezelfde rijen al in CRM.state.cands staan. We gebruiken de RUWE rijen
   (snake_case) zodat elke formule letterlijk overeenkomt met calc.js.
   Enige aanpassing: de eerste fase heet in het CRM 'Intake' waar de
   finance-app nog 'Voorselectie' kent — dat loopt via CRM.faseNorm.     */
/* _candFilter: alleen tijdens het tekenen van Plaatsingen met een klantfilter
   (tabPlaatsingen) — daarbuiten altijd alle kandidaten. */
let _candFilter = null;
const cands = () => { const a = (CRM.state && CRM.state.cands) ? CRM.state.cands : []; return _candFilter ? a.filter(_candFilter) : a; };
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
  if(s) return getal(s.aantal);
  const d = T.find(x => x.maand === '__default__') || T.find(x => x.maand === '__default');
  return d ? getal(d.aantal) : 8;
}

/* ═══════════════════════════════════════════════════════════════
   REKENKERN — letterlijk overgezet uit ~/ploeggenoten-finance/js/calc.js.
   Iedere functie krijgt `f` (de geladen finance-data) als eerste argument;
   verder is de logica regel voor regel gelijk aan de bron-app.
   ═══════════════════════════════════════════════════════════════ */

/* bron: calc.js instOf() */
const instOf = (f, pid) => f.installments.filter(i => i.placement_id === pid)
  .slice().sort((a,b) => (a.termijn_nr||0) - (b.termijn_nr||0));

/* bron: calc.js vervaldatum() — factuurdatum (of geplande datum) + betaaltermijn.
   De factuurdatum telt alleen als de termijn écht gefactureerd is: een
   achtergebleven datum op een termijn die terug op "te factureren" staat
   trok de verwachte betaling naar voren (Torin, 27 okt 2026). */
function vervaldatum(inst, p){
  const echt = inst.status === 'gefactureerd' || inst.status === 'betaald';
  const basis = (echt && inst.factuurdatum) || inst.geplande_datum;
  return basis ? addDays(basis, getal(p && p.betaaltermijn_dgn) || 14) : null;
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
  const tot = addMonths(start, getal(p.garantie_mnd));
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
  const feeTot = f.placements.reduce((s,p) => s + getal(p.fee_excl), 0);
  /* Omzet deze maand = wat er deze maand is GEFACTUREERD (factuurdatum),
     niet wat er gepland stond. Dat is de definitie van de bron-app. */
  const omzetDezeMaand = som(i => String(i.factuurdatum||'').slice(0,7)===mk7
    && (i.status==='gefactureerd' || i.status==='betaald'));
  const paidKnown = all.filter(i => i.status==='betaald' && i.factuurdatum && i.betaaldatum);
  const dso = paidKnown.length
    ? Math.round(paidKnown.reduce((s,i) => s + (daysBetween(i.factuurdatum, i.betaaldatum)||0), 0) / paidKnown.length)
    : null;
  const plYtd = f.placements.filter(p => String(p.contract_datum||'').slice(0,4) === t.slice(0,4));
  const gemFee = plYtd.length ? plYtd.reduce((s,p) => s + getal(p.fee_excl), 0) / plYtd.length : 0;
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
    const kl = klantLabel(p.klant);
    const k = per[kl] = per[kl] ||
      {klant:kl, n:0, fee:0, gefact:0, betaald:0, open:0, nog:0, vervallen:0, gestopt:0};
    k.n++; k.fee += getal(p.fee_excl);
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
    const kl = klantLabel(p.klant);
    per[kl] = (per[kl]||0) + (getal(p.fee_excl) - st.vervallen);
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
    .reduce((s,b) => s + getal(b.bedrag_pm), 0);
}
/* Werkelijke kosten: de Yuki-sync schrijft één regel 'Werkelijk totaal (Yuki)'
   per afgesloten maand — die is dan leidend boven de losse posten. */
function actueelInfo(f, mk){
  const m7 = String(mk).slice(0,7);
  const rows = f.actuals.filter(a => String(a.maand||'').slice(0,7) === m7);
  const yuki = rows.find(a => a.categorie === 'Werkelijk totaal (Yuki)');
  if(yuki) return {bedrag: getal(yuki.bedrag), yuki:true, rows};
  if(!rows.length) return null;
  return {bedrag: rows.reduce((s,a) => s + getal(a.bedrag), 0), yuki:false, rows};
}
const actueelVoorMaand = (f, mk) => { const a = actueelInfo(f, mk); return a ? a.bedrag : null; };
/* Kosten die de projectie gebruikt: werkelijk waar bekend, anders budget. */
const kostenVoorMaand = (f, mk) => { const a = actueelVoorMaand(f, mk); return a==null ? budgetVoorMaand(f, mk) : a; };

/* ─── Flex (bron: calc.js flexStats / flexPlBerekening / flexPlStats) ─── */
function flexAfspraakVoor(f, klant){
  /* Exact, of op woorden: "Omefa" hoort bij "Omefa European plastics & tooling". */
  return f.flexAfspr.find(a => CRM.zelfdeKlant(a.klant, klant))
    || f.flexAfspr.find(a => { const w = naamWoorden(a.klant), k = naamWoorden(klant);
         return w.length && k.length && (w.every(x => k.includes(x)) || k.every(x => w.includes(x))); })
    || null;
}
function flexPlBerekening(f, fp){
  const afspr = flexAfspraakVoor(f, fp.klant);
  const inkoopDefault = Sn(f,'flex_inkoop_factor',1.8) || 1.8;
  const klantfactor = getalOfNull(fp.klantfactor) || (afspr ? getalOfNull(afspr.factor) : null);
  /* De bron-app laat `inkoop` NaN worden zodra er wél een klantafspraak is
     maar de inkoopfactor daarin leeg staat; marge/uur werd dan NaN. Hier valt
     hij in dat geval terug op de standaardfactor uit de instellingen. */
  const inkoop = getalOfNull(fp.inkoop_factor) || (afspr ? getalOfNull(afspr.inkoop_factor) : inkoopDefault) || inkoopDefault;
  const overnameUren = fp.overname_uren != null ? getalOfNull(fp.overname_uren)
                     : (afspr ? getalOfNull(afspr.overname_uren) : null);
  const uurloon = getalOfNull(fp.uurloon) || null;
  const urenPw  = getal(fp.uren_pw) || 40;
  const compleet = !!(klantfactor && uurloon);
  const margePerUur = compleet ? (klantfactor - inkoop) * uurloon : null;
  const gewerkteUren = fp.gewerkte_uren != null ? getalOfNull(fp.gewerkte_uren) : null;
  /* werkelijke marge uit de Pronkert-facturen (incl. overwerk) — leidend boven het model */
  const margeWerkelijk = fp.marge_werkelijk != null ? getalOfNull(fp.marge_werkelijk) : null;
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
/* ─── Wat kwam er per week per flexkracht binnen ────────────────
   Uit fin_flex_regels: elke regel van elke margefactuur van Pronkert. Alles
   wordt hier AFGELEID (som), nooit opgeteld bij een vorige stand — een factuur
   die opnieuw wordt ingelezen kan de cijfers dus niet verdubbelen.
   Reserveringen (eindejaarsuitkering, atv) leveren wél marge maar géén uren;
   dat onderscheid is bij het inlezen al gemaakt in de kolom `uren`.        */
/* Eén flexkracht = één sleutel, ongeacht de bron. NIET op registratienummer:
   dat staat wél op de PDF-factuur en níét op het Excel-marge-overzicht, waardoor
   dezelfde persoon in tweeën viel (Sven kwam binnen als 32 u én als 114 u).
   De naam staat op beide bronnen identiek: 'S. van Nicolaas (Sven)'. */
const flexSleutel = r => String(`${r.naam||''} ${r.roepnaam||''}`)
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .split(/[^a-z0-9]+/).filter(Boolean).join('-');

function flexPerWeekKracht(f, nWeken){
  const weken = new Map(), krachten = new Map();
  (f.flexRegels||[]).forEach(r => {
    const wk = String(r.week||'').slice(0,10); if(!wk) return;
    const sleutel = flexSleutel(r);
    const naam = tekst(r.roepnaam,'') || tekst(r.naam,'') || '?';
    const w = weken.get(wk) || {week:wk, bedrag:0, uren:0, per:new Map()};
    const cel = w.per.get(sleutel) || {naam, uren:0, marge:0};
    cel.uren  += getal(r.uren);   cel.marge += getal(r.marge);
    w.per.set(sleutel, cel);
    w.bedrag += getal(r.marge);   w.uren += getal(r.uren);
    weken.set(wk, w);
    const k = krachten.get(sleutel) || {sleutel, naam, regnr:tekst(r.regnr,''),
                                        functie:tekst(r.functie,''), uren:0, marge:0, laatste:''};
    k.uren += getal(r.uren); k.marge += getal(r.marge);
    if(wk > k.laatste) k.laatste = wk;
    krachten.set(sleutel, k);
  });
  const rijen = [...weken.values()].sort((a,b) => b.week.localeCompare(a.week))
                                   .slice(0, nWeken || 13);
  /* Alleen kolommen tonen voor wie in de getoonde periode ook echt werkte. */
  const inBeeld = new Set(); rijen.forEach(w => w.per.forEach((v,k) => { if(v.marge||v.uren) inBeeld.add(k); }));
  const kolommen = [...krachten.values()].filter(k => inBeeld.has(k.sleutel))
    .sort((a,b) => b.laatste.localeCompare(a.laatste) || b.marge - a.marge);
  return {rijen, kolommen, krachten:[...krachten.values()], nWeken:weken.size};
}

/* ─── Wat de margefactuur over de tariefopbouw zegt ─────────────
   Op elke factuurregel staat: uurloon, factor en tarief. Die factor is de
   INKOOPfactor van Pronkert — uurloon × factor is wat zíj ons per uur rekenen.
   Het tarief is wat de klant per uur betaalt. Daaruit volgt alles:

     inkooptarief = uurloon × inkoopfactor
     klantfactor  = klanttarief ÷ uurloon
     margefactor  = klantfactor − inkoopfactor      ← de marge in factor
     marge/uur    = margefactor × uurloon

   Gewogen over de normale uren: overwerk en de reserveringen (eindejaars-
   uitkering, atv) lopen op een eigen, lagere factor en zouden het beeld
   vertroebelen. Hun marge telt wél mee in het bedrag en het percentage.   */
const _flexFactorenCache = new WeakMap();
function flexFactoren(f){
  const sleutel = f.flexRegels || [];
  if(_flexFactorenCache.has(sleutel)) return _flexFactorenCache.get(sleutel);
  const uit = flexFactorenBereken(f);
  _flexFactorenCache.set(sleutel, uit);
  return uit;
}
function flexFactorenBereken(f){
  const per = new Map();
  (f.flexRegels||[]).forEach(r => {
    const sleutel = flexSleutel(r);
    const k = per.get(sleutel) || {sleutel, naam: tekst(r.roepnaam,'') || tekst(r.naam,'') || '?',
      regnr:'', functie: tekst(r.functie,''), klant: tekst(r.klant,''),
      uren:0, marge:0, klantomzet:0, weken:new Map(), laatste:''};
    const wk = String(r.week||'').slice(0,10);
    k.uren += getal(r.uren); k.marge += getal(r.marge); k.klantomzet += getal(r.klantbedrag);
    if(!k.klant && tekst(r.klant,'')) k.klant = tekst(r.klant,'');
    if(!k.regnr && tekst(r.regnr,'')) k.regnr = tekst(r.regnr,'');
    /* Tariefopbouw per week bijhouden en straks de LAATSTE week nemen: op de
       kaart hoort te staan wat er nú geldt, niet een gemiddelde over maanden
       waarin een tariefwijziging wegvalt. */
    if(String(r.soort||'').trim().toLowerCase() === 'loon normale uren' && getal(r.uren)){
      const u = getal(r.uren);
      const w = k.weken.get(wk) || {nu:0, loon:0, tar:0, fac:0};
      w.nu += u; w.loon += getal(r.uurloon)*u; w.tar += getal(r.tarief)*u; w.fac += getal(r.factor)*u;
      k.weken.set(wk, w);
      if(wk > k.laatste) k.laatste = wk;
    }
    per.set(sleutel, k);
  });
  /* Dezelfde koppelregel als de Edge Function: eerst het registratienummer,
     anders de roepnaam — en alleen als die bij precies één plaatsing hoort. */
  const woorden = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
                        .split(/[^a-z0-9]+/).filter(Boolean);
  const zoekPl = k => {
    const opNr = (f.flexPl||[]).find(x => x.regnr && String(x.regnr) === k.regnr);
    if(opNr) return opNr;
    const roep = woorden(k.naam)[0];
    const kandidaten = (f.flexPl||[]).filter(x => woorden(x.kandidaat).includes(roep));
    return kandidaten.length === 1 ? kandidaten[0] : null;
  };
  return [...per.values()].map(k => {
    const nw = k.weken.get(k.laatste) || {nu:0, loon:0, tar:0, fac:0};
    const loon = nw.nu ? nw.loon/nw.nu : null, tar = nw.nu ? nw.tar/nw.nu : null,
          fac  = nw.nu ? nw.fac/nw.nu : null;
    const klantfactor = (loon && tar != null) ? tar/loon : null;
    /* Een eerdere week met een andere inkoopfactor = Pronkert heeft zijn opslag
       aangepast. Dat mag niet stil gebeuren, dus het krijgt een chip. */
    const eerder = [...k.weken.entries()].filter(([w]) => w !== k.laatste)
      .map(([, v]) => v.nu ? v.fac/v.nu : null).filter(x => x);
    const gewijzigd = (fac && eerder.length && eerder.some(x => Math.abs(x - fac) > 0.005))
      ? eerder[eerder.length-1] : null;
    const pl = zoekPl(k);
    return {
      plaatsing: pl,
      plInkoop: pl ? getalOfNull(pl.inkoop_factor) : null,
      sleutel:k.sleutel, naam:k.naam, regnr:k.regnr, functie:k.functie, klant:k.klant,
      uren:k.uren, marge:k.marge, klantomzet:k.klantomzet, laatste:k.laatste,
      uurloon: loon, inkoopfactor: fac || null, klanttarief: tar,
      inkooptarief: (loon != null && fac) ? loon*fac : null,
      klantfactor, margefactor: (klantfactor != null && fac) ? klantfactor - fac : null,
      margePerUur: k.uren ? k.marge/k.uren : null,
      margePct: k.klantomzet ? k.marge/k.klantomzet : null,
      /* Wijkt de factor van de laatste factuur af van het gemiddelde, dan is er
         iets veranderd aan de afspraak — dat mag niet stilletjes gebeuren. */
      factorGewijzigd: (fac && k.facLaatst && Math.abs(k.facLaatst - fac) > 0.005) ? k.facLaatst : null
    };
  }).sort((a,b) => b.laatste.localeCompare(a.laatste) || b.marge - a.marge);
}

/* Wekelijkse marge-uitkering Pronkert: run-rate = gemiddelde laatste 4 weken × 52/12 */
function flexStats(f){
  const wk = f.flexWeken.slice().sort((a,b) => String(a.week).localeCompare(String(b.week)));
  const som = arr => arr.reduce((s,w) => s + getal(w.bedrag), 0);
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
  .reduce((s,w) => s + getal(w.bedrag), 0);

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
    .reduce((s,w) => s + getal(w.bedrag), 0);
  const btwOntvangen = inQ.reduce((s,i) => s + bedragVan(i)*btwPct, 0) + flexQ*btwPct;
  const mndInQ = (+t.slice(5,7) - 1) % 3 + 1;
  const voorbelasting = Sn(f,'voorbelasting_pm',0) * mndInQ;
  const btwPot = Math.max(0, btwOntvangen - voorbelasting);

  const ankerWinst = Sn(f,'yuki_winst_ytd',0);
  const ankerDatum = S(f,'yuki_winst_datum',null);
  /* Zonder Yuki-anker voor dit jaar begint de telling óp 1 januari: eerder
     vielen januari-kosten en facturen van 1 januari weg (`> start`,
     `<= start`), waardoor winst en vpb-potje te hoog uitkwamen (audit
     27 okt 2026). Mét anker zitten die dagen al in de ankerwinst. */
  const metAnker = !!(ankerDatum && String(ankerDatum).slice(0,4) === String(y));
  const start = metAnker ? String(ankerDatum) : `${y}-01-01`;
  const basisWinst = metAnker ? ankerWinst : 0;
  const naStart = d => metAnker ? d > start : d >= start;
  const omzetYtd = basisWinst
    + f.installments.filter(i => i.factuurdatum && naStart(i.factuurdatum)
        && (i.status==='gefactureerd' || i.status==='betaald')).reduce((s,i) => s + bedragVan(i), 0)
    + f.flexWeken.filter(w => naStart(String(w.week||'')) && String(w.week).slice(0,4) === String(y))
        .reduce((s,w) => s + getal(w.bedrag), 0);
  /* het deel van de TVE-uitkering boven de fee is RC-aflossing (balans), géén kosten */
  const rcAfbouwPm = Math.max(0, Sn(f,'mgmt_uitkering_pm',0) - Sn(f,'mgmt_fee_pm',0));
  let kostenYtd = 0;
  for(let m=0; m<12; m++){
    const mk = `${y}-${String(m+1).padStart(2,'0')}-01`;
    if(mk > monthKey(t)) break;
    if(metAnker && mk <= monthKey(start)) continue;   // maanden t/m het anker zitten al in de ankerwinst
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
  /* Een garantievervanger telde hier als plaatsing (alleen op geplaatst_op)
     terwijl hij bij de stops wél werd uitgesloten. Elke kosteloze vervanging
     verhoogde het cijfer daardoor structureel met 1, en Finance kwam op −3
     waar het bord −4 zei. Dezelfde uitsluiting als hieronder bij stopM. */
  /* Een korte ZZP-klus (< 6 mnd, geen telt_als_plaatsing) telt hier bewust
     niet mee — anders vertroebelt hij het gemiddelde waarmee break-even en
     het target worden berekend (Tjeerd, 25 aug 2026). Zie CRM.zzpTeltAlsPlaatsing. */
  const gross = cs.filter(c => String(c.geplaatst_op||'').slice(0,7) === mk7
    && !(c.vervangt||'') && (c.type !== 'ZZP' || CRM.zzpTeltAlsPlaatsing(c)));
  const ws   = gross.filter(c => c.type === 'W&S').length;
  const flex = gross.filter(c => isFlexType(c.type)).length;
  const zzp  = gross.filter(c => c.type === 'ZZP').length;
  const onb  = gross.length - ws - flex - zzp;
  const stopM = cs.filter(c => faseVan(c) === 'Gestopt'
    && String(c.gestopt_op||'').slice(0,7) === mk7 && c.geplaatst_op && !(c.vervangt||'')
    && (c.type !== 'ZZP' || CRM.zzpTeltAlsPlaatsing(c))).length;
  return {gross: gross.length, ws, flex, zzp, onb, stopM, netto: gross.length - stopM};
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
    const doel = overrides[rec] != null ? getal(overrides[rec]) : (tgt ? Math.round(tgt/nRec) : 0);
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
  'Voorgesteld':8, 'Klaar om voor te stellen':8, 'O&O sessie':6,
  'Eerste gesprek':6, 'Tweede gesprek':5, 'Meeloopdag':4,
  'In de wacht':8, 'Offer':3, 'Contract ondertekenen':2
};
/* Funnelvolgorde; 'Intake' staat waar de finance-app 'Voorselectie' heeft. */
const FUNNEL = ['Klaar om voor te stellen','Voorgesteld','O&O sessie','Eerste gesprek','Tweede gesprek',
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

/* Tarief opzoeken (bron: calc.js tariefVoor): eerst klant+functie, dan klant-standaard.
   Blijft bestaan als TERUGVAL — zie feePct() hieronder. */
function tariefVoor(f, bordKlant, functie){
  const rijen = (f.tarieven||[]).filter(r => CRM.zelfdeKlant(r.klant, bordKlant));
  if(!rijen.length) return null;
  const nf = String(functie||'').toLowerCase();
  const opFunctie = rijen.find(r => r.functie && nf &&
    (nf.includes(String(r.functie).toLowerCase()) || String(r.functie).toLowerCase().includes(nf)));
  const standaard = rijen.find(r => !r.functie);
  const rij = opFunctie || standaard || rijen[0];
  return {pct: getalOfNull(rij.tarief_pct), rij};
}

/* ═══════════════════════════════════════════════════════════════
   ÉÉN REKENREGEL VOOR DE FEE — 31 jul 2026
   Hier stond een eigen jaarSalaris() (bron: calc.js) naast die in
   js/fee.js. Ze waren het niet eens: fee.js volgt de grondslagvlaggen
   uit de klantafspraak (telt de dertiende maand mee of niet, rekent
   over 12 of 13 maanden), deze rekende altijd 12 maanden en telde
   altijd alles mee. Bij 2960 met 15% ploegentoeslag, 8% VT en 8,33%
   eindejaarsuitkering, bij een klant waar de EJU níét meetelt:
   fee.js € 44.115,84 tegen finance € 47.074,66 — bij 23% is dat
   € 681 verschil op één plaatsing. Dezelfde kandidaat kreeg dus een
   ander bedrag op zijn kaart dan in de forecast.

   Daarom rekent Finance nu via CRM.fee. Dat is een BEWUSTE AFWIJKING
   van ~/ploeggenoten-finance/js/calc.js: die app kent crm_afspraken
   niet en blijft altijd 12 maanden met alles erin rekenen. Zolang de
   finance-app niet meeverhuist, wijkt de forecast hier dus af van de
   forecast dáár — bij elke klant waarvan de afspraak niet de volle
   standaardgrondslag is. Zie het rapport; dit is Tjeerds keuze.
   ═══════════════════════════════════════════════════════════════ */

/* De ruwe candidates-rij is snake_case, CRM.fee leest camelCase. Niet zelf
   overtypen: CRM.rowToCand is de mapping die het hele CRM gebruikt. */
const feeKand = c => CRM.rowToCand(c);

/* De afspraak hoort bij de DATUM VAN TEKENEN, niet bij vandaag — anders
   rekent een plaatsing van vorig jaar met het tarief van dit jaar. */
const afspraakVan = c => CRM.fee.voorKlant(c.klant, c.geplaatst_op || c.start || null);

/* Welk percentage geldt, als FRACTIE (0,23) — de eenheid die de rest van
   deze module en calc.js gebruiken.

   Twee bronnen houden een percentage per klant bij:
     crm_afspraken.fee_standaard / fee_regels — hele getallen (23), per
       functiegroep, hoort bij de getekende SWO, leesbaar voor het team;
     fin_tarieven.tarief_pct — fracties (0,23), los onderhouden in de
       finance-app, alleen voor Tjeerd.
   De afspraak wint: dat is wat er getekend is. fin_tarieven blijft als
   terugval staan zolang die tabel nog apart bijgehouden wordt, zodat een
   klant zonder afspraak niet ineens zonder tarief valt. Het vlakke
   fee_pct uit fin_settings is en blijft een schatting (zeker:false). */
function feePct(f, c){
  const a = afspraakVan(c);
  if(a){
    const p = CRM.fee.pctVoor(feeKand(c), a);
    if(p.pct != null) return {pct: p.pct/100, bron:'afspraak', zeker:true, uitleg:p.uitleg, afspraak:a};
  }
  const t = tariefVoor(f, c.klant, c.functie);
  if(t && t.pct != null)
    return {pct: t.pct, bron:'tarief', zeker:true, afspraak:a,
            uitleg:'Geen commerciële afspraak gevonden — tarief uit fin_tarieven gebruikt.'};
  return {pct: Sn(f,'fee_pct',0.22), bron:'standaard', zeker:false, afspraak:a,
          uitleg:'Geen tarief bekend voor deze klant — vlak standaardpercentage, dus een schatting.'};
}

/* Waar de twee bronnen elkaar tegenspreken. Niet om automatisch op te lossen:
   een percentage per klant is een onderhandelingsresultaat. Wel om te tonen,
   want zolang het stil blijft rekent de ene helft van het systeem anders dan
   de andere. */
function tariefConflicten(f){
  const uit = [];
  for(const rij of (f.tarieven||[])){
    const a = CRM.fee.voorKlant(rij.klant, null);
    if(!a) continue;
    const p = CRM.fee.pctVoor({functie: rij.functie || ''}, a);
    if(p.pct == null) continue;
    const tarief = getalOfNull(rij.tarief_pct);
    if(tarief == null) continue;
    if(Math.abs(p.pct/100 - tarief) > 0.0005)
      uit.push({klant: rij.klant, functie: rij.functie || '', afspraak: p.pct/100, tarief});
  }
  return uit;
}

/* Het bruto jaarsalaris waarover de fee rekent — nu via CRM.fee.grondslag,
   met de grondslagvlaggen van de klantafspraak. Zonder afspraak is de
   uitkomst identiek aan de oude formule hier (12 maanden, VT 8% over loon
   incl. ploegentoeslag, EJU en overig over het kale jaarloon). */
function jaarSalaris(c, loon, afspraak){
  const k = Object.assign(feeKand(c), {maandloon: loon});
  const gr = CRM.fee.grondslag(k, afspraak !== undefined ? afspraak : afspraakVan(c));
  return gr.compleet ? gr.jaarSalaris : 0;
}

/* Alleen het bedrag; de fee-wizard blijft in de finance-app.
   WEG: het maandloon uit een vrij notitieveld raden met
   /\b([2-6]\d{3})\b/. Dat was hier al onbereikbaar — de enige aanroeper
   (pipelineForecast) roept deze functie alleen aan als c.maandloon
   gevuld is — dus er verandert geen bedrag door het te schrappen, en er
   raakt geen plaatsing zijn fee kwijt. Wat wél weg is: het risico dat
   een postcode of een jaartal uit een notitie ononderscheidbaar als
   maandloon de forecast in rolt. Wie een loon kent, vult het veld. */
function feeBerekening(f, c){
  const loon = getalOfNull(c.maandloon);
  if(!loon) return null;
  const p = feePct(f, c);
  return {fee: Math.round(jaarSalaris(c, loon, p.afspraak) * p.pct),
          zeker: p.zeker, bron: p.bron, uitleg: p.uitleg};
}

/* bron: calc.js pipelineForecast() */
function pipelineForecast(f){
  const kansen = Object.assign({}, FASE_KANSEN_DEFAULT, S(f,'fase_kansen',{}) || {});
  const k = kpis(f);
  const fee = k.gemFee || 8500;
  const behoud = 1 - (k.stopPct || 0);
  const t = todayISO();
  const linked = new Set(f.placements.map(p => p.pipeline_candidate_id).filter(Boolean));
  /* Flex en een kosteloze vervanging leveren geen fee op. Die twee regels
     stonden hier los overgeschreven (`!isFlexType(c.type) && !c.vervangt`);
     ze komen nu uit CRM.fee, zodat er niet opnieuw een derde plek ontstaat
     die er anders over denkt. isFlexType blijft ernaast staan omdat het CRM
     ook het oude label 'detachering' nog in de data heeft. */
  const rows = cands().filter(c =>
      kansen[faseVan(c)] > 0 && !isFlexType(c.type)
      && !CRM.fee.geenFeeReden(c) && !linked.has(c.id))
    .map(c => {
      const kans = kansen[faseVan(c)];
      const plaatsing = (c.start && c.start > t) ? String(c.start).slice(0,10)
                      : addDays(t, (FASE_LEAD_WKN[faseVan(c)] || 6) * 7);
      const cash = monthKey(addDays(plaatsing, 30));   // factuur + betaaltermijn ≈ 1 mnd later
      const fb = c.maandloon ? feeBerekening(f, c) : null;
      const cFee = (fb && fb.fee) ? fb.fee : fee;
      /* `zeker` is false zodra de fee uit het vlakke standaardpercentage
         rolt in plaats van uit een echt klanttarief. Die vlag werd berekend
         maar nergens gebruikt, waardoor een geschat bedrag zonder ~-teken
         als hard getal in de forecast stond. */
      return {c, kans, fee:cFee, feeEcht: !!(fb && fb.fee && fb.zeker), gewogen: cFee*kans,
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
    const ref = c.start || c.geplaatst_op, g = getal(c.garantie_mnd);
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
    per[bron].n++; per[bron].omzet += getal(p.fee_excl) - st.vervallen;
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
    per[rec].n++; per[rec].omzet += getal(p.fee_excl) - placementStats(f, p).vervallen;
    if(c.since && c.geplaatst_op && c.geplaatst_op > c.since){
      const d = daysBetween(c.since, c.geplaatst_op); if(d != null){ ttfSom += d; ttfN++; }
    }
  }
  /* ZZP-klusmarge telt mee in de omzet van de AM op wiens naam de ZZP'er
     staat (regel Tjeerd, 21 aug 2026): gewerkt × marge per afgeronde klus,
     geplande klussen nog niet — alleen wat er echt verdiend is. */
  for(const k of (CRM.state.klussen || [])){
    if(k.gewerkt == null || k.gewerkt === '' || k.marge == null) continue;
    const c = CRM.kandidaat(k.kandidaat_id);
    const rec = (String((c && c.rec)||'Samen').trim()) || 'Samen';
    per[rec] = per[rec] || {n:0, omzet:0};
    per[rec].omzet += getal(k.gewerkt) * getal(k.marge);
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
    const kl = klantLabel(p.klant);
    const k = per[kl] = per[kl] || {klant:kl, n:0, netto:0, gestopt:0};
    k.n++; k.netto += getal(p.fee_excl) - st.vervallen;
    if(p.gestopt_op) k.gestopt++;
  }
  const rows = Object.values(per).map(k => {
    /* Zelfde volgorde als de forecast (afspraak vóór fin_tarieven), anders
       staat in de ene kaart 22% en in de andere 23% voor dezelfde klant.
       Een geschat percentage telt hier niet als tarief — dan hoort er
       "geen tarief" te staan, niet een cijfer dat niemand heeft afgesproken. */
    const tp = feePct(f, {klant: k.klant, functie: ''});
    return {...k, pct: tp.zeker ? tp.pct : null, pctBron: tp.bron,
            jaarNetto: k.netto*12/verstrekenMnd};
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
    /* Zelfde gedeelde uitzondering als in de forecast: geen fee = niets
       af te ronden. Zie CRM.fee.geenFeeReden. */
    !isFlexType(c.type) && !CRM.fee.geenFeeReden(c) &&
    !linked.has(c.id) && !dismissed.has(c.id) &&
    /* Een geanonimiseerde kandidaat heeft geen naam meer, dus de koppeling
       op naam hieronder kan hem nooit terugvinden. Zonder deze regel duikt
       elke geanonimiseerde plaatsing opnieuw op als "nog te koppelen" —
       de bedragen kloppen, maar de actielijst loopt vol met werk dat niet
       te doen is. */
    !CRM.kandVerwijder?.isGeanonimiseerd?.(c) &&
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
  /* ZZP-klussen waarvan de laatste werkdag is geweest en die nog niet
     gefactureerd zijn — dé afspraak uit het ZZP-ontwerp (Tjeerd, 21 aug
     2026): na de laatste werkdag automatisch een melding dat er
     gefactureerd mag worden. De klussen komen uit crm_klussen (CRM.state);
     afvinken gebeurt hier, met de knop in de actielijst. */
  for(const kz of (CRM.state.klussen || [])){
    if(kz.gefactureerd || !kz.eind || kz.eind >= t) continue;
    const kand = CRM.kandidaat(kz.kandidaat_id);
    const som = (kz.gewerkt != null && kz.gewerkt !== '' && kz.marge != null)
      ? getal(kz.gewerkt) * getal(kz.marge) : null;
    list.push({soort:'zzp_factuur', urg:2, zzp:kz,
      txt:`ZZP-klus van ${(kand && kand.naam) || '?'} bij ${kz.klant || '—'} is afgelopen — marge factureren${
        som != null ? `: ${eur(som)} (${kz.gewerkt} ${kz.eenheid==='uur'?'uur':'dgn'} × ${eur(getal(kz.marge))})`
                    : ' (vul eerst de gewerkte ' + (kz.eenheid==='uur'?'uren':'dagen') + ' in op de kandidaatkaart)'}`});
  }
  for(const p of f.placements){
    if(p.concept){
      list.push({soort:'concept', urg:2, p,
        txt:`Fee (${eur(getalOfNull(p.fee_excl))}) en factuurschema bevestigen`});
      continue;
    }
    const st = placementStats(f, p);
    const hold = opHold(f, p.id);
    for(const i of st.ins){
      if(hold) break;                    // bewust on hold: geen factuur- of betaalactie
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
          txt:`Op het bord terug naar "${tekst(faseVan(cc), 'onbekend')}", maar er is al gefactureerd — controleer`});
    }
  }
  for(const c of inboxCandidates(f))
    list.push({soort:'afronden', urg:1, c, txt:'Plaatsing afronden' + (c.geplaatst_op ? ` — getekend ${dOf(c.geplaatst_op)}` : '')});
  for(const {p, c} of stopSignalen(f))
    list.push({soort:'stop_signaal', urg:2, p, c,
      txt:`Op het bord gestopt (${dOf(c.gestopt_op)}) — verwerken`});
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
  const start = f.saldi[0] ? getal(f.saldi[0].saldo) : 0;
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
        put(monthKey(addDays(i.geplande_datum, getal(p.betaaltermijn_dgn) || 14)), 'inFact', bedragVan(i)*(1+btwPct));
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
    if(lp.gepland && lp.datum >= t) put(monthKey(lp.datum), 'uitLening', getal(lp.bedrag));
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
  const start = f.saldi[0] ? getal(f.saldi[0].saldo) : 0;
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
  for(const p of f.placements) for(const inst of (opHold(f, p.id) ? [] : instOf(f, p.id))){
    if(inst.status==='betaald' || inst.status==='vervallen') continue;
    let dat = null;
    if(inst.status==='te_factureren' && inst.geplande_datum) dat = addDays(inst.geplande_datum, getal(p.betaaltermijn_dgn)||14);
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
  for(const lp of f.loanPayments) if(lp.gepland && lp.datum >= t) add(lp.datum, 'uit', getal(lp.bedrag), 'Aflossing');
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
  const saldo = f.saldi[0] ? getal(f.saldi[0].saldo) : 0;
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
  const basisKosten = override > 0 ? override : (laatste ? getal(laatste.bedrag) : budgetVoorMaand(f, monthKey(t)));
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
    ? getal(f.loans[0].hoofdsom) - f.loanPayments.filter(lp => !lp.gepland).reduce((s,l) => s + getal(l.bedrag), 0)
    : 0;
  const leningAflossing = Math.min(Math.max(0, leningOpen), 30000);
  const vrij = nettoWinst - leningAflossing;
  const v = Math.max(0, vrij);
  const box2 = v <= 68843 ? v*0.245 : 68843*0.245 + (v-68843)*0.31;
  const mktPm = (f.budget||[]).filter(b => /marketing/i.test(String(b.categorie||'')))
    .reduce((s,b) => s + getal(b.bedrag_pm), 0);
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
    winstYtd: potjes(f).winstYtd, saldoNu: f.saldi[0] ? getal(f.saldi[0].saldo) : 0};
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
    ? {k:'ok', t:`Je staat er gezond bij: ${num(r.bufferMnd)} maanden buffer en ${eurN(r.vrij)} vrij besteedbaar na belastingpotjes.`}
    : {k:'warn', t:`Let op je buffer: ${num(r.bufferMnd)} maand vaste lasten — onder de norm van 3. Vul die aan vóór grote uitgaven.`});
  if(wk.laagste) z.push(wk.laagste.saldo < r.euroBuffer
    ? {k:'warn', t:`Krapste moment komende 13 weken: week van ${dOf(wk.laagste.start)}, saldo zakt naar ${eurN(wk.laagste.saldo)} — plan grote uitgaven daaromheen.`}
    : {k:'ok', t:`Je kas blijft de komende 13 weken boven je buffer (laagste ${eurN(wk.laagste.saldo)}).`});
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
  const saldo = f.saldi[0] ? getal(f.saldi[0].saldo) : 0;
  const vrij = saldo - pot.btwPot - pot.vpbPot;
  const eerste = f.placements.map(p => p.contract_datum).filter(Boolean).sort()[0];
  const mndActief = eerste ? Math.max(1, (daysBetween(eerste, t)||0)/30.4) : 1;
  return [
    ['Vaste lasten p/m', eur(vaste), 'incl. fee & lonen (budget)'],
    ['Break-even', num(vaste/Math.max(1, k.gemFee)) + ' plaatsingen/m', `bij gem. fee ${eur(k.gemFee)}`],
    ['Run-rate', num(f.placements.length/mndActief) + ' plaatsingen/m',
      `${f.placements.length} sinds ${eerste ? dOf(eerste) : '—'}`],
    ['Cashbuffer', (vaste ? num(vrij/vaste) : '—') + ' mnd', `vrij besteedbaar ${eurN(vrij)} / norm 3–6 mnd`],
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
  const saldo = f.saldi[0] ? getal(f.saldi[0].saldo) : 0;
  const vrij = saldo - pot.btwPot - pot.vpbPot;
  const add = (cat, urg, titel, cijfer, tekst, actie) => items.push({cat, urg, titel, cijfer, tekst, actie});

  const eerste = f.placements.map(p => p.contract_datum).filter(Boolean).sort()[0];
  const mndActief = eerste ? Math.max(1, (daysBetween(eerste, t)||0)/30.4) : 1;
  const plPm = f.placements.length/mndActief;
  const gemFee = k.gemFee || (f.placements.length
    ? f.placements.reduce((s,p) => s + getal(p.fee_excl), 0)/f.placements.length : 0);
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
    const nogTeFact = f.placements.filter(p => klantLabel(p.klant) === con.top1.klant)
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
    pct0(dekking3m) + ' gedekt',
    `Het bestaande factuurschema + flex dekt ${pct0(dekking3m)} van de verwachte uitgaven de komende 3 maanden. Zonder nieuwe plaatsingen teer je in op je buffer.`,
    `Plan het aantal deals dat het gat dicht: bij een gemiddelde fee van ${eur(gemFee)} is dat er ${Math.ceil((kw3Uit - kw3In)/Math.max(1, gemFee))} in dit kwartaal.`);

  const rcTve = f.loans.find(l => /tve/i.test(String(l.naam||'')));
  if(rcTve){
    const feePm = Sn(f,'mgmt_fee_pm',0), uitkPm = Sn(f,'mgmt_uitkering_pm',0);
    const afbouwPm = uitkPm - feePm;
    if(afbouwPm > 0){
      const mndKlaar = Math.ceil(getal(rcTve.hoofdsom)/afbouwPm);
      add('sterkte', 1, 'RC-schuld aan TVE wordt netjes afgebouwd', eur(getal(rcTve.hoofdsom)),
        `Je keert ${eur(uitkPm)}/m uit terwijl de fee ${eur(feePm)}/m is — het verschil (${eur(afbouwPm)}/m) lost de rekening-courant af. In dit tempo is de RC over ±${mndKlaar} maanden weg.`, null);
    } else {
      add('gevaar', 1, 'Rekening-courant TVE loopt op', eur(getal(rcTve.hoofdsom)) + '+',
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
    if(moeder) opties.push(`de lening van je moeder (deels) aflossen bespaart ${num(getal(moeder.rente_pct))}% = ${eur(getal(moeder.hoofdsom)*getal(moeder.rente_pct)/100)}/jaar aan rente`);
    opties.push(`een extra recruiter (±${eur(4300)}/m) is al rendabel bij ${num(4300/Math.max(1, gemFee))} plaatsing per maand`);
    opties.push(`advertentiebudget opschalen`);
    add('kans', 2, 'Overtollige cash aan het werk zetten', eur(overschot) + ' boven norm',
      `Je zit ${eur(overschot)} boven de 6-maands buffernorm. Geld op de betaalrekening rendeert niet.`,
      `Opties: ${opties.join('; ')}.`);
  }

  const mktBudget = f.budget.find(b => /marketing|verkoop/i.test(String(b.categorie||'')));
  if(mktBudget && plPm > 0){
    const cpp = getal(mktBudget.bedrag_pm)/plPm;
    if(cpp < gemFee*0.3) add('kans', 2, 'Marketing rendeert — overweeg opschalen', `${eur(cpp)} per plaatsing`,
      `Je geeft ±${eur(getal(mktBudget.bedrag_pm))}/m uit aan marketing en doet ${num(plPm)} plaatsingen/m → ${eur(cpp)} per plaatsing, tegen een gemiddelde fee van ${eur(gemFee)}. Een verhouding onder de 30% is ruimte om te schalen.`,
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
  f.placements.forEach(p => { const kl = klantLabel(p.klant); perKlant[kl] = (perKlant[kl]||0) + 1; });
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
    const rec = cds.filter(c => ['Afgevallen','Gestopt'].includes(faseVan(c)) && c.bemiddelbaar !== false);
    if(rec.length >= 3)
      add('kans', 2, 'Beschikbare kandidaten wachten', `${rec.length} in de pool`,
        `Er staan ${rec.length} kandidaten klaar die je eerder goedkeurde (o.a. offer-afwijzers — volledig gekwalificeerd). Heraanbieden bij een andere klant is sneller én goedkoper dan nieuwe instroom werven.`,
        `Open Uitval op het bord en filter op Beschikbaar: wie past bij een openstaande vacature?`);
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

/* De kleur van de streep links (.frand in css/base.css). Op de rest van de app
   draagt die de fase; een plaatsing in Finance heeft geen fase maar wel een
   toestand die precies zo verloopt, dus de schaal blijft dezelfde:

     grijs  er is nog niets gefactureerd
     amber  concept — de fee staat nog niet vast
     blauw  onderweg: deels of volledig gefactureerd, nog niet binnen
     groen  volledig betaald

   ROOD WINT bij een factuur die over de vervaldatum is of een plaatsing die
   om een vervanger vraagt. Dat is hier de letterlijke invulling van "iets dat
   vandaag rechtgezet moet worden": onbetaald geld dat over tijd is, is het
   enige op dit scherm waar nog een telefoontje aan vastzit.

   De kleuren volgen de chip in de statuskolom (plStatus.cls), zodat de streep
   en het woord ernaast nooit iets anders kunnen zeggen. */
const FIN_RAND = {amber:'var(--amber)', blue:'var(--blue)', green:'var(--green)', '':'#9aa3b2'};
function plRand(f, p, ins){
  const teLaat = ins.some(i => {
    if(i.status !== 'gefactureerd') return false;
    const vv = vervaldatum(i, p);
    return !!vv && vv < todayISO();
  });
  if(teLaat || garantie(f, p).vervangingNodig) return {kleur:'', let_:true};
  return {kleur: FIN_RAND[plStatus(f, p, ins).cls] || FIN_RAND[''], let_:false};
}

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
    const rv = Math.abs(max) >= 5000 ? Math.round(v/1000) : Math.round(v);
    const lbl = (rv < 0 ? '\u2212' + Math.abs(rv) : String(rv)) + (Math.abs(max) >= 5000 ? 'k' : '');
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

const TABS = [
  {k:'vandaag',     lbl:'Vandaag'},
  {k:'plaatsingen', lbl:'Plaatsingen'},
  {k:'facturatie',  lbl:'Facturatie'},
  {k:'geld',        lbl:'Geld'}
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

/* ═══ OPZET ════════════════════════════════════════════════════
   Vier tabbladen: Vandaag · Plaatsingen · Geld · Flex, plus ⚙ voor de
   instellingen (Tjeerd, 27 okt 2026: "zo overzichtelijk mogelijk, niet
   te groot — naar de adviezen kijk ik nooit"). Geen grote KPI-tegels
   meer maar één smalle cijferbalk per scherm, en dan meteen het werk.
   Advies, scenario's en analyses zijn eruit; de rekenkern hierboven
   blijft staan voor wat de schermen nog gebruiken.                   */

/* Smalle cijferbalk: [label, waarde-html, onderschrift-html]. */
function strip(cellen){
  return `<div class="fin-strip">${cellen.filter(Boolean).map(([l, v, s]) =>
    `<div><div class="l">${H(l)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}</div>`;
}

/* ═══ TAB: VANDAAG ═════════════════════════════════════════════
   Eén vraag: wat moet ik nu doen, en hoe staat de bank ervoor. Elke
   regel in Te doen heeft zijn eigen knop — niets linkt meer naar de
   finance-app.                                                        */
const TODO_KNOP = {
  factureren:   ['Gefactureerd ✓', 'fact'],
  te_laat:      ['Betaald ✓', 'paid'],
  afronden:     ['Afronden', 'afronden'],
  concept:      ['Bekijken', 'paneel'],
  vervanging:   ['Bekijken', 'paneel'],
  terug:        ['Bekijken', 'paneel'],
  stop:         ['Laten vervallen', 'stopverwerk'],
  stop_signaal: ['Verwerken', 'stop'],
  saldo:        ['Bijwerken', 'saldo'],
  flex:         ['Naar Flex', 'flex'],
  zzp_factuur:  ['Gefactureerd ✓', 'zzp'],
  afronden_groep: ['Naar Plaatsingen', 'plaatsingen'],
  kosten:       ['Bekijken', 'geld']
};

function tabVandaag(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen financiële gegevens in demo',
    'Log in met je eigen account om banksaldo, facturatie en je takenlijst te zien.'); return; }

  const k = kpis(f), pot = potjes(f), con = concentratie(f);
  const t = todayISO(), mk7 = t.slice(0,7);
  const saldo = f.saldi[0];
  const vrij = saldo ? getal(saldo.saldo) - pot.btwPot - pot.vpbPot : null;
  /* Meer dan twee af te ronden plaatsingen worden één regel met een knop
     naar Plaatsingen — anders verdrinkt de rest van het werk erin. */
  const ruw = acties(f);
  const afTeRonden = ruw.filter(a => a.soort === 'afronden');
  const lijst = afTeRonden.length > 2
    ? [...ruw.filter(a => a.soort !== 'afronden'),
       {soort:'afronden_groep', urg:1, txt:`${afTeRonden.length} plaatsingen af te ronden`,
        sub: afTeRonden.slice(0,3).map(a => tekst(a.c.naam)).join(', ') + (afTeRonden.length > 3 ? ' …' : '')}]
    : ruw;
  /* Kosten gestegen t.o.v. de maanden ervoor: daar wil je bewust van zijn. */
  const kb = kostenBewaking(f);
  if(kb && (kb.dVast >= 250 || kb.stijgers.length)){
    const top = kb.stijgers.slice(0, 2).map(p => `${p.n || p.c} +${eur(p.delta)}`).join(', ');
    lijst.push({soort:'kosten', urg: kb.dVast >= 250 ? 2 : 1,
      txt: `Kosten ${mkLabel(kb.laatst.mk7 + '-01')}: vast ${kb.dVast >= 0 ? '+' : '−'}${eur(Math.abs(kb.dVast))}, variabel ${kb.dVar >= 0 ? '+' : '−'}${eur(Math.abs(kb.dVar))} t.o.v. gemiddeld`,
      sub: top ? 'Gestegen: ' + top : ''});
  }
  const nTeLaat = lijst.filter(a => a.soort === 'te_laat').length;
  const concepten = new Set(f.placements.filter(p => p.concept).map(p => p.id));
  const teFactNu = f.installments.filter(i => i.status === 'te_factureren' && !concepten.has(i.placement_id)
    && i.geplande_datum && String(i.geplande_datum).slice(0,7) <= mk7).reduce((s,i) => s + bedragVan(i), 0);

  const regel = (a, n) => {
    const wie = a.p ? `${tekst(a.p.kandidaat)} · ${klantLabel(a.p.klant)}`
              : a.c ? `${tekst(a.c.naam)} · ${klantLabel(a.c.klant)}`
              : a.zzp ? 'ZZP · ' + klantLabel(a.zzp.klant) : '';
    const [lbl, doe] = TODO_KNOP[a.soort] || [];
    const hoofd = doe === 'fact' || doe === 'paid' || doe === 'afronden' || doe === 'zzp';
    const kop = wie || a.txt, onder = wie ? a.txt : (a.sub || '');
    return `<div class="fin-todo${a.urg >= 2 ? ' urg' : ''}">
      <div class="t"><b>${H(kop)}</b>${onder ? `<div class="w">${H(onder)}</div>` : ''}</div>
      ${a.i ? `<div class="bd num">${eur(bedragVan(a.i))}</div>` : ''}
      ${lbl ? `<button class="btn ${hoofd ? '' : 'ghost '}sm" data-todo="${n}">${H(lbl)}</button>` : ''}
    </div>`;
  };
  const waarschuwing = (con.top1 && con.top1.aandeel > 0.35)
    ? `<div class="fin-todo"><div class="t">${H(klantLabel(con.top1.klant))} is ${pct0(con.top1.aandeel)} van je W&amp;S-omzet
        <div class="w">Hoge afhankelijkheid van één klant</div></div></div>` : '';

  el.innerHTML = `
    ${strip([
      ['Banksaldo', saldo ? eur(getal(saldo.saldo)) : '—',
        `${saldo ? 'stand ' + H(dKort(saldo.datum)) + ' · ' : ''}<button type="button" class="lnk" id="fv_saldo">${saldo ? 'bijwerken' : 'invullen'}</button>`],
      ['Vrij besteedbaar', eurN(vrij), 'na het btw- en vpb-potje'],
      ['Openstaand', eur(k.openstaand), nTeLaat ? `<span class="neg">${nTeLaat} te laat</span>` : 'niets te laat'],
      ['Te factureren', eur(teFactNu), 't/m deze maand']
    ])}
    <div class="card">
      <div class="card-h"><div class="h2">Te doen</div><span class="meta">${lijst.length || ''}</span></div>
      <div class="card-b" style="padding:0">${lijst.map(regel).join('') + waarschuwing
        || '<div class="fin-todo"><div class="t meta">Niets te doen — alles is bij.</div></div>'}</div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-h"><div class="h2">Opzij zetten</div><span class="meta">doorgeefgeld — niet vrij te besteden</span></div>
      <div class="card-b">
        <div class="fin-pot"><span>Btw dit kwartaal</span><b>${eur(pot.btwPot)}</b></div>
        <div class="fin-pot"><span>Vpb over de winst tot nu (${pct0(Sn(f,'vpb_pct',0.19))})</span><b>${eur(pot.vpbPot)}</b></div>
        <div class="fin-pot"><span><b>Samen</b></span><b>${eur(pot.btwPot + pot.vpbPot)}</b></div>
      </div>
    </div>`;

  const herteken = () => tabVandaag(el, f);
  el.querySelector('#fv_saldo').onclick = () => saldoVenster(f, herteken);
  el.querySelectorAll('[data-todo]').forEach(b => b.onclick = () => {
    const a = lijst[+b.dataset.todo]; if(!a) return;
    const doe = (TODO_KNOP[a.soort] || [])[1];
    if(doe === 'fact') return finDoe(b, () => markeer(a.i, 'gefactureerd'), `Termijn ${a.i.termijn_nr} gefactureerd`, herteken);
    if(doe === 'paid') return finDoe(b, () => markeer(a.i, 'betaald'), `Termijn ${a.i.termijn_nr} betaald`, herteken);
    if(doe === 'afronden') return plFormulier(f, {c: a.c}, herteken);
    if(doe === 'paneel') return plPaneel(f, a.p.id, herteken);
    if(doe === 'stop') return stopVenster(f, a.p, herteken, a.c && a.c.gestopt_op);
    if(doe === 'stopverwerk') return finDoe(b, async () => {
      for(const i of stopImpact(f, a.p)) await markeer(i, 'vervallen');
    }, 'Termijnen na de stop vervallen', herteken);
    if(doe === 'saldo') return saldoVenster(f, herteken);
    if(doe === 'flex'){ _tab = 'plaatsingen'; _plSoort = 'flex'; return CRM.render(); }
    if(doe === 'plaatsingen'){ _tab = 'plaatsingen'; return CRM.render(); }
    if(doe === 'geld'){ _tab = 'geld'; return CRM.render(); }
    if(doe === 'zzp'){
      /* De klus leeft in crm_klussen (CRM-data, team-RLS), niet in fin_*. */
      return finDoe(b, async () => {
        if(!CRM.demo && !CRM._finMock){
          const {error} = await CRM.sb.from('crm_klussen').update({gefactureerd:true}).eq('id', a.zzp.id);
          if(error) throw error;
        }
        a.zzp.gefactureerd = true;
      }, 'Klus staat op gefactureerd', herteken);
    }
  });
}

/* ─── Venster: banksaldo bijwerken ─────────────────────────────────
   Een leeg veld is geen €0 (Number('') === 0): dat overschreef in de
   finance-app het saldo van vandaag. Hier dus eerst kijken of er iets
   staat. Eén saldo per dag (upsert op datum).                          */
function saldoVenster(f, klaar){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Banksaldo bijwerken</div></div>
    <div class="modal-b"><div class="f-grid">
      <div class="f-row"><label for="bs_datum">Datum</label><input type="date" id="bs_datum" value="${H(todayISO())}"></div>
      <div class="f-row"><label for="bs_saldo">Saldo (€)</label><input type="number" id="bs_saldo" step="0.01" placeholder="bijv. 42350"></div>
    </div></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="bs_ok">Opslaan</button></div>`, {
    onClose(){ klaar(); },
    onOpen(m){
      const q = s => m.querySelector(s);
      setTimeout(() => q('#bs_saldo').focus(), 60);
      q('#bs_ok').onclick = () => {
        const ruw = q('#bs_saldo').value.trim(), datum = q('#bs_datum').value;
        if(ruw === '' || !isFinite(Number(ruw))) return CRM.toast('Vul een bedrag in', 'err');
        if(!datum) return CRM.toast('Kies een datum', 'err');
        const rij = {datum, saldo: Number(ruw)};
        finDoe(q('#bs_ok'), async () => {
          await finSchrijf('fin_bank_saldo', q2 => q2.upsert(rij, {onConflict:'datum'}));
          f.saldi = [rij, ...f.saldi.filter(s => s.datum !== datum)]
            .sort((a,b) => String(b.datum).localeCompare(String(a.datum)));
        }, 'Banksaldo bijgewerkt', ok => { if(ok){ CRM.modal._onClose = null; CRM.modal.close(); klaar(); } });
      };
    }});
}

/* ═══ BEWERKEN — plaatsingen en termijnen ═══════════════════════
   Stap 1 van het overzetten van de finance-app naar het CRM (Tjeerd,
   27 okt 2026: "akkoord voor het overzetten … alleen voor mij"). Het CRM
   rekent de fee vóór (maandloon + commerciële afspraak); wat hier wordt
   vastgelegd in fin_placements / fin_installments is de officiële fee en
   het officiële factuurschema.

   Elke schrijfactie gaat eerst naar de database en past daarna de al
   geladen gegevens (f) ter plekke aan — het scherm klopt dan meteen,
   zonder alles opnieuw op te halen. Mislukt de database, dan blijft f
   ongemoeid. Met CRM._finMock (de testhaak uit finLaad) blijft alles in
   het geheugen: er gaat dan niets naar de database.                   */
let _mockId = 900000;
async function finSchrijf(tabel, bouw){
  if(CRM._finMock) return null;
  const {data, error} = await bouw(CRM.sb.from(tabel));
  if(error) throw error;
  return data;
}
async function instWijzig(inst, patch){
  await finSchrijf('fin_installments', q => q.update(patch).eq('id', inst.id));
  Object.assign(inst, patch);
}
async function instErbij(f, rows){
  if(!rows.length) return [];
  const data = await finSchrijf('fin_installments', q => q.insert(rows).select());
  const nieuw = data || rows.map(r => Object.assign({id: ++_mockId}, r));
  f.installments.push(...nieuw);
  return nieuw;
}
async function instWeg(f, ids){
  if(!ids.length) return;
  await finSchrijf('fin_installments', q => q.delete().in('id', ids));
  const weg = new Set(ids);
  f.installments = f.installments.filter(i => !weg.has(i.id));
}
async function plWijzig(p, patch){
  patch = Object.assign({updated_at: new Date().toISOString()}, patch);
  await finSchrijf('fin_placements', q => q.update(patch).eq('id', p.id));
  Object.assign(p, patch);
}

/* ─── Facturatie on hold ───────────────────────────────────────────
   Soms factureer je bewust (nog) niet: de kandidaat is ziek, of er loopt
   iets met de klant. Dat is geen gemiste factuur en geen te late betaling
   (Tjeerd, 27 okt 2026). Een plaatsing on hold telt dus niet als gemist
   of te laat, staat niet in Te doen en niet in de kasprojectie, maar wél
   zichtbaar in een eigen groep met de reden en een knop Hervatten.
   Opgeslagen als één sleutel in fin_settings ({P020: {reden, sinds}}),
   zodat er geen databasewijziging nodig is.                          */
const HOLD_KEY = 'facturatie_on_hold';
const holdLijst = f => { const v = S(f, HOLD_KEY, null); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; };
const opHold = (f, pid) => holdLijst(f)[pid] || null;
async function zetHold(f, p, reden){
  const nieuw = Object.assign({}, holdLijst(f));
  if(reden) nieuw[p.id] = {reden, sinds: todayISO()}; else delete nieuw[p.id];
  await finSchrijf('fin_settings', q => q.upsert({key: HOLD_KEY, value: nieuw}));
  f.settings[HOLD_KEY] = nieuw;
}
async function vraagHold(f, p, klaar){
  const reden = await CRM.vraag(`Facturatie van ${tekst(p.kandidaat)} on hold`, {
    hint: 'Je factureert bewust (nog) niet. Waarom? Dan weet je het straks nog.',
    placeholder: 'Kandidaat ziek', knop: 'On hold zetten'});
  if(!reden) return klaar && klaar();
  finDoe(null, () => zetHold(f, p, reden), `${tekst(p.kandidaat)} staat on hold`, () => klaar && klaar());
}

/* Gefactureerd / betaald afvinken — zelfde regels als de ✓-knoppen in de
   finance-app: de datum is vandaag, en wie direct op betaald springt
   krijgt de geplande datum als factuurdatum. */
async function markeer(inst, status, datum){
  const patch = {status};
  if(status === 'gefactureerd') patch.factuurdatum = datum || todayISO();
  if(status === 'betaald'){
    patch.betaaldatum = datum || todayISO();
    if(!inst.factuurdatum) patch.factuurdatum = inst.geplande_datum || todayISO();
  }
  if(status === 'te_factureren' || status === 'vervallen'){ patch.factuurdatum = null; patch.betaaldatum = null; }
  await instWijzig(inst, patch);
}

/* bron: plaatsingen.js genSchema() — de afrondingscent gaat naar de laatste termijn. */
function genSchema(preset, fee, start, o={}){
  const rows = [], n = o.n || 1, tussen = o.tussen || 1;
  const r2 = x => Math.round(x * 100) / 100;
  if(preset === '1x') rows.push({nr:1, bedrag:r2(fee), datum:start});
  else if(preset === 'nx'){
    const per = r2(fee / n);
    for(let i = 0; i < n; i++)
      rows.push({nr:i+1, bedrag: i === n-1 ? r2(fee - per*(n-1)) : per, datum: addMonths(start, i*tussen)});
  }else if(preset === '5050'){
    const helft = r2(fee / 2);
    rows.push({nr:1, bedrag:helft, datum:start});
    rows.push({nr:2, bedrag:r2(fee - helft), datum: addMonths(start, o.naMnd || 3)});
  }
  return rows;
}

/* Hele schema opnieuw zetten — alleen zolang er nog niets gefactureerd is.
   Start: de gekozen datum, anders waar termijn 1 nú staat (niet de bij
   aanmaken opgeslagen eerste_factuurdatum — daardoor sprong Torins schema
   terug naar de contractdatum, 27 okt 2026). Lukt het invoegen niet, dan
   zetten we het oude schema terug in plaats van een plaatsing zonder
   termijnen achter te laten. */
async function zetSchema(f, p, preset, o){
  const oud = instOf(f, p.id);
  if(oud.some(i => i.status === 'gefactureerd' || i.status === 'betaald'))
    throw new Error('Er is al gefactureerd op deze plaatsing — pas losse termijnen aan met ✎.');
  const start = o.start || (oud[0] && oud[0].geplande_datum) || p.eerste_factuurdatum || p.contract_datum || todayISO();
  const schema = genSchema(preset, getal(p.fee_excl), start, o);
  const rij = r => ({placement_id:p.id, termijn_nr:r.nr, bedrag_excl:r.bedrag, geplande_datum:r.datum, status:'te_factureren'});
  await instWeg(f, oud.map(i => i.id));
  try{ await instErbij(f, schema.map(rij)); }
  catch(e){
    await instErbij(f, oud.map(({id, ...rest}) => rest)).catch(() => {});
    throw e;
  }
  await plWijzig(p, {aantal_termijnen: schema.length, maanden_tussen: o.tussen || o.naMnd || 1, eerste_factuurdatum: start});
}

/* Wat er nog niet gefactureerd is, gelijk verdelen over de open termijnen
   (fee − al gefactureerd/betaald). De afrondingscent naar de laatste. */
async function verdeelOpen(f, p){
  const ins = instOf(f, p.id);
  const vast = ins.filter(i => i.status === 'gefactureerd' || i.status === 'betaald')
    .reduce((s,i) => s + bedragVan(i), 0);
  const rest = Math.max(0, getal(p.fee_excl) - vast);
  const slots = ins.filter(i => i.status === 'te_factureren')
    .sort((a,b) => String(a.geplande_datum||'').localeCompare(String(b.geplande_datum||'')));
  if(!slots.length) return 0;
  const deel = Math.floor(rest / slots.length * 100) / 100;
  for(let k = 0; k < slots.length; k++){
    const bedrag = k === slots.length - 1 ? Math.round((rest - deel*(slots.length-1)) * 100) / 100 : deel;
    if(bedrag !== bedragVan(slots[k])) await instWijzig(slots[k], {bedrag_excl: bedrag});
  }
  return slots.length;
}

const volgPlId = f => {
  const nums = f.placements.map(x => parseInt(String(x.id||'').replace(/\D/g,''), 10)).filter(n => !isNaN(n));
  return 'P' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
};

/* Eén plek voor "doe iets en teken opnieuw". De knop gaat op slot zolang
   de database bezig is: een dubbelklik op "+ termijn" gaf in de
   finance-app twee termijnen met hetzelfde nummer. */
async function finDoe(knop, werk, okTekst, daarna){
  if(knop){ if(knop.disabled) return; knop.disabled = true; }
  let gelukt = false;
  try{ await werk(); gelukt = true; if(okTekst) CRM.toast(okTekst, 'ok'); }
  catch(e){ CRM.fout('Opslaan mislukt', e); }
  finally{ if(knop) knop.disabled = false; if(daarna) daarna(gelukt); }
}

/* ─── Schema in één zin ────────────────────────────────────────────
   "[7] termijnen, elke [1] maand, vanaf [24 sep]" met de datums en
   bedragen er live onder — in plaats van een keuzelijst met drie soorten
   schema's en verborgen velden (Tjeerd, 27 okt 2026: "schema opzetten is
   niet makkelijk"). 50/50 na 3 maanden = 2 termijnen, elke 3 maanden.
   Voorstel: zoals de vorige plaatsing bij dezelfde klant.            */
function schemaVoorstel(f, klant, behalve){
  const naam = String(klant||'').trim().toLowerCase();
  const vorige = f.placements.filter(x => x.id !== behalve && naam && String(x.klant||'').trim().toLowerCase() === naam
      && instOf(f, x.id).length)
    .sort((a,b) => String(b.contract_datum||'').localeCompare(String(a.contract_datum||'')))[0];
  if(!vorige) return {n:1, tussen:1, bron:''};
  return {n: instOf(f, vorige.id).length, tussen: getal(vorige.maanden_tussen) || 1, bron: vorige.id};
}
function schemaZinHtml(pre, v, start){
  return `<div class="fin-schema">
      <input id="${pre}_n" type="number" min="1" max="24" value="${H(v.n)}"><span>termijn(en), elke</span>
      <input id="${pre}_tussen" type="number" min="1" max="12" value="${H(v.tussen)}"><span>maand(en), vanaf</span>
      <input id="${pre}_start" type="date" value="${H(start)}">
    </div>
    ${v.bron ? `<div class="hint">Voorstel: zoals de vorige plaatsing bij deze klant (${H(v.bron)}).</div>` : ''}
    <div class="fin-schema-vb" id="${pre}_vb"></div>`;
}
function schemaUitZin(q, pre, fee){
  const n = Math.max(1, Math.round(getal(q('#' + pre + '_n').value) || 1));
  const tussen = Math.max(1, Math.round(getal(q('#' + pre + '_tussen').value) || 1));
  const start = q('#' + pre + '_start').value || todayISO();
  const rows = genSchema('nx', fee, start, {n, tussen});
  q('#' + pre + '_vb').innerHTML = fee
    ? rows.map(r => `<span>${H(dKort(r.datum))} <b class="num">${eur2(r.bedrag)}</b></span>`).join('')
    : '<span class="meta">Vul eerst de fee in.</span>';
  return {n, tussen, start, rows};
}

/* ─── Paneel: één plaatsing beheren ─────────────────────────────── */
function plPaneel(f, pid, herteken){
  const p = f.placements.find(x => x.id === pid);
  if(!p) return CRM.toast('Deze plaatsing bestaat niet meer', 'err');
  const st = placementStats(f, p), g = garantie(f, p);
  const btw = 1 + Sn(f,'btw_pct',0.21), t = todayISO();
  const opnieuw = () => { herteken && herteken(); plPaneel(f, pid, herteken); };

  /* Wat het CRM zelf zou rekenen, naast wat er vastligt — "met het CRM
     weten we altijd wat het maandloon en de fee-berekening is; wat ik in
     finance zet is officieel" (Tjeerd, 27 okt 2026). */
  const c = p.pipeline_candidate_id ? cands().find(x => x.id === p.pipeline_candidate_id) : null;
  const vs = c ? feeBerekening(f, c) : null;
  const verschil = vs && vs.fee ? vs.fee - getal(p.fee_excl) : 0;
  const voorstelHtml = !c ? '' : vs
    ? `<div class="fin-pot"><span>CRM rekent voor${vs.zeker ? '' : ' (schatting)'}</span><b>${eur(vs.fee)}</b></div>
       ${Math.abs(verschil) >= 1 ? `<p class="meta" style="margin:6px 0 0">${verschil > 0 ? 'Vastgelegd is ' + eur(verschil) + ' lager' : 'Vastgelegd is ' + eur(-verschil) + ' hoger'}
         dan wat maandloon en afspraak opleveren. ${H(vs.uitleg || '')}</p>` : ''}`
    : `<p class="meta" style="margin:6px 0 0">Geen maandloon op de kandidaatkaart — vul het daar in, dan rekent het CRM de fee voor.</p>`;

  const rijen = st.ins.map(i => {
    const vv = vervaldatum(i, p);
    const laat = i.status === 'gefactureerd' && vv && vv < t ? daysBetween(vv, t) : 0;
    const gemist = i.status === 'te_factureren' && i.geplande_datum && i.geplande_datum < t;
    const k = [];
    if(i.status === 'te_factureren') k.push(`<button class="btn sm" data-ia="fact" data-iid="${H(i.id)}">Gefactureerd ✓</button>`);
    if(i.status === 'gefactureerd')  k.push(`<button class="btn sm" data-ia="paid" data-iid="${H(i.id)}">Betaald ✓</button>`);
    if(i.status === 'vervallen'){
      k.push(`<button class="btn ghost sm" data-ia="herstel" data-iid="${H(i.id)}" title="Terug naar te factureren">↺ Herstel</button>`);
      k.push(`<button class="btn ghost sm" data-ia="weg" data-iid="${H(i.id)}" title="Termijn verwijderen">Verwijder</button>`);
    }else{
      k.push(`<button class="btn ghost sm" data-ia="edit" data-iid="${H(i.id)}" title="Bedrag, datum of status aanpassen">✎</button>`);
      if(i.status !== 'betaald') k.push(`<button class="btn ghost sm" data-ia="verval" data-iid="${H(i.id)}" title="Laten vervallen">✕</button>`);
    }
    return `<tr${i.status === 'vervallen' ? ' style="opacity:.55"' : ''}>
      <td class="num">${H(tekst(i.termijn_nr, '?'))}</td>
      <td class="num">${i.status === 'te_factureren'
        ? `<span class="fin-ed" data-ed="datum" data-iid="${H(i.id)}" title="Klik om de datum te wijzigen">${i.geplande_datum ? H(dKort(i.geplande_datum)) : '—'}</span>`
        : (i.geplande_datum ? H(dKort(i.geplande_datum)) : '—')}</td>
      <td class="n">${i.status === 'te_factureren'
        ? `<span class="fin-ed num" data-ed="bedrag" data-iid="${H(i.id)}" title="Klik om het bedrag te wijzigen">${eur2(bedragVan(i))}</span>`
        : `<span class="num">${eur2(bedragVan(i))}</span>`}<div class="rowsub num">${eur2(bedragVan(i)*btw)} incl.</div></td>
      <td>${stChip(i.status)}${gemist ? ' ' + chip('gemist','red') : ''}${laat ? ' ' + chip(laat + ' dgn te laat','red') : ''}</td>
      <td class="num meta">${i.factuurdatum && i.status !== 'te_factureren' ? 'gefact. ' + H(dKort(i.factuurdatum)) : ''}${
        i.betaaldatum && i.status === 'betaald' ? '<br>betaald ' + H(dKort(i.betaaldatum)) : ''}${
        vv && i.status === 'gefactureerd' ? 'vervalt ' + H(dKort(vv)) : ''}</td>
      <td class="n" style="white-space:nowrap">${k.join(' ')}</td></tr>`;
  }).join('');

  const startVoor = (st.ins[0] && st.ins[0].geplande_datum) || p.eerste_factuurdatum || p.contract_datum || t;
  const nNu = st.ins.length;
  /* Schema (opnieuw) zetten kan zolang er nog niets gefactureerd is. */
  const nogNiets = !st.ins.some(i => i.status === 'gefactureerd' || i.status === 'betaald');
  const svP = nNu > 1 ? {n: nNu, tussen: getal(p.maanden_tussen) || 1, bron:''} : schemaVoorstel(f, p.klant, p.id);
  const schemaKaart = !(p.concept || nogNiets) ? '' : `
    <div class="card" style="margin-top:14px${p.concept ? ';border-left:3px solid var(--amber)' : ''}">
      <div class="card-h"><div class="h2">Factuurschema</div><span class="spacer"></span>
        <span class="meta">fee ${eur2(getalOfNull(p.fee_excl))} excl.</span></div>
      <div class="card-b">
        ${schemaZinHtml('fd', svP, startVoor)}
        <div class="row tight" style="margin-top:10px"><span class="meta">Vervangt het huidige schema. Stopt de kandidaat, dan vervallen de termijnen erna vanzelf.</span>
          <span class="spacer"></span><button class="btn sm" id="fd_zet">Termijnen zetten</button></div>
      </div></div>`;

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="min-width:0;flex:1">
        <div class="h2" style="font-size:17px">${H(tekst(p.kandidaat))} <span class="meta">· ${H(p.id)}</span></div>
        <div class="meta" style="margin-top:3px">${H([p.functie, p.klant].filter(Boolean).join(' · '))}</div>
      </div>
      <button class="btn ghost sm x" data-close>Sluiten</button>
    </div>
    <div class="drawer-b">
      <div class="row tight" style="flex-wrap:wrap;gap:6px;margin-bottom:14px">
        ${p.concept ? chip('concept — fee nog bevestigen','amber') : ''}
        ${chip(st.status, st.kleur)}
        ${p.gestopt_op ? chip('gestopt ' + dKort(p.gestopt_op), 'red') : ''}
        ${g.actief ? chip('garantie t/m ' + dKort(g.tot), 'purple') : ''}
        ${g.vervangingNodig ? chip('vervanging leveren', 'red') : ''}
        ${p.vervangen_door ? chip('vervangen door ' + p.vervangen_door, 'green') : ''}
        ${opHold(f, p.id) ? chip(`facturatie on hold sinds ${dKort(opHold(f, p.id).sinds)} · ${opHold(f, p.id).reden}`, 'amber') : ''}
      </div>
      <div class="grid c4">
        ${CRM.ui.kpi('Fee (vastgelegd)', eur(getalOfNull(p.fee_excl)), 'excl. btw', 'accent')}
        ${CRM.ui.kpi('Gefactureerd', eur(st.gefact), 'excl. btw')}
        ${CRM.ui.kpi('Openstaand', eur(st.open), 'verstuurd, niet betaald')}
        ${CRM.ui.kpi('Nog te factureren', eur(st.nog), st.vervallen ? eur(st.vervallen) + ' vervallen' : 'excl. btw')}
      </div>
      ${voorstelHtml ? `<div style="margin-top:12px">${voorstelHtml}</div>` : ''}
      ${schemaKaart}
      <div class="card" style="margin-top:14px">
        <div class="card-h"><div class="h2">Termijnen</div><span class="spacer"></span>
          <button class="btn ghost sm" id="fd_plus" title="Termijn toevoegen en de rest van de fee gelijk verdelen">+ termijn</button></div>
        <div class="card-b" style="padding:0">${rijen
          ? `<div class="tblwrap" style="border:none"><table class="tbl"><thead><tr><th>#</th><th>Gepland</th>
              <th class="n">Bedrag</th><th>Status</th><th>Datums</th><th></th></tr></thead><tbody>${rijen}</tbody></table></div>`
          : `<div style="padding:18px 22px">${CRM.ui.leeg('Nog geen factuurschema', p.concept ? 'Kies hierboven hoe je factureert.' : 'Voeg een termijn toe.')}</div>`}</div>
      </div>
      <p class="meta" style="margin:12px 2px 0">Contract ${H(dOf(p.contract_datum))} · betaaltermijn ${H(getal(p.betaaltermijn_dgn) || 14)} dagen${
        p.garantie_mnd ? ` · garantie ${H(num(getal(p.garantie_mnd), 0))} mnd` : ''}${p.note ? ` · ${H(p.note)}` : ''}</p>
    </div>
    <div class="drawer-f">
      <button class="btn ghost sm" id="fd_del">Verwijderen</button>
      <span class="spacer"></span>
      <button class="btn ghost sm" id="fd_edit">Bewerken</button>
      ${g.vervangingNodig ? `<button class="btn ghost sm" id="fd_verv">Vervanging geleverd…</button>` : ''}
      ${opHold(f, p.id) ? `<button class="btn ghost sm" id="fd_hold">Facturatie hervatten</button>`
        : `<button class="btn ghost sm" id="fd_hold">Facturatie on hold…</button>`}
      <button class="btn ghost sm" id="fd_stop">${p.gestopt_op ? 'Stop aanpassen…' : 'Kandidaat gestopt…'}</button>
      ${p.concept ? `<button class="btn" id="fd_ok">✓ Fee klopt — bevestigen</button>` : ''}
    </div>`, {onOpen(dr){
    const q = s => dr.querySelector(s);
    const instVan = b => f.installments.find(i => String(i.id) === b.dataset.iid);

    dr.querySelectorAll('[data-ia]').forEach(b => b.onclick = async () => {
      const inst = instVan(b); if(!inst) return;
      const a = b.dataset.ia;
      if(a === 'edit') return termijnBewerken(f, p, inst, opnieuw);
      if(a === 'weg' && !await CRM.bevestig(`Termijn ${inst.termijn_nr} verwijderen?`,
        'Hij verdwijnt helemaal uit het schema.', {gevaarlijk:true})) return opnieuw();
      finDoe(b, async () => {
        if(a === 'fact')    await markeer(inst, 'gefactureerd');
        if(a === 'paid')    await markeer(inst, 'betaald');
        if(a === 'verval')  await markeer(inst, 'vervallen');
        if(a === 'herstel') await markeer(inst, 'te_factureren');
        if(a === 'weg')     await instWeg(f, [inst.id]);
      }, {fact:`Termijn ${inst.termijn_nr} gefactureerd`, paid:`Termijn ${inst.termijn_nr} betaald`,
          verval:`Termijn ${inst.termijn_nr} vervallen`, herstel:'Termijn hersteld', weg:'Termijn verwijderd'}[a], opnieuw);
    });

    if(q('#fd_n')){
      const fee = getal(p.fee_excl);
      const lees = () => schemaUitZin(q, 'fd', fee);
      ['#fd_n','#fd_tussen','#fd_start'].forEach(sel => q(sel).addEventListener('input', lees));
      lees();
      q('#fd_zet').onclick = () => { const sz = lees();
        finDoe(q('#fd_zet'), () => zetSchema(f, p, 'nx', {n: sz.n, tussen: sz.tussen, start: sz.start}), 'Factuurschema gezet', opnieuw); };
    }
    /* Datum of bedrag direct in de tabel aanpassen. */
    dr.querySelectorAll('.fin-ed').forEach(sp => sp.onclick = e => {
      e.stopPropagation();
      const inst = f.installments.find(i => String(i.id) === sp.dataset.iid);
      if(inst) regelBewerken(sp, f, p, inst, sp.dataset.ed, opnieuw);
    });
    q('#fd_plus').onclick = () => finDoe(q('#fd_plus'), async () => {
      const open = instOf(f, p.id).filter(i => i.status === 'te_factureren');
      if(!open.some(i => bedragVan(i) === 0)){
        const laatste = open.filter(i => i.geplande_datum).sort((a,b) => a.geplande_datum.localeCompare(b.geplande_datum)).pop();
        const nr = Math.max(0, ...instOf(f, p.id).map(i => getal(i.termijn_nr))) + 1;
        await instErbij(f, [{placement_id:p.id, termijn_nr:nr, bedrag_excl:0, status:'te_factureren',
          geplande_datum: laatste ? addMonths(laatste.geplande_datum, 1) : todayISO()}]);
      }
      const n = await verdeelOpen(f, p);
      CRM.toast(`Fee gelijk verdeeld over ${n} open termijn${n === 1 ? '' : 'en'}`, 'ok');
    }, '', opnieuw);
    if(q('#fd_ok')) q('#fd_ok').onclick = () => finDoe(q('#fd_ok'),
      () => plWijzig(p, {concept:false}), `${p.id} bevestigd — dit is nu de officiële fee`, opnieuw);
    q('#fd_edit').onclick = () => plFormulier(f, {p}, opnieuw);
    if(q('#fd_stop')) q('#fd_stop').onclick = () => stopVenster(f, p, opnieuw);
    q('#fd_hold').onclick = () => opHold(f, p.id)
      ? finDoe(q('#fd_hold'), () => zetHold(f, p, null), `Facturatie van ${tekst(p.kandidaat)} hervat`, opnieuw)
      : vraagHold(f, p, opnieuw);
    if(q('#fd_verv')) q('#fd_verv').onclick = async () => {
      const wie = await CRM.vraag('Wie is de vervanger?', {hint:'Naam of plaatsingsnummer van de kosteloze vervanging.', knop:'Vastleggen'});
      if(!wie) return opnieuw();
      finDoe(null, () => plWijzig(p, {vervangen_door: wie}), 'Vervanging vastgelegd', opnieuw);
    };
    q('#fd_del').onclick = async () => {
      if(!await CRM.bevestig(`${p.id} verwijderen?`,
        `De plaatsing van ${tekst(p.kandidaat)} én al haar termijnen verdwijnen uit Finance.`, {gevaarlijk:true})) return opnieuw();
      finDoe(null, async () => {
        await instWeg(f, instOf(f, p.id).map(i => i.id));
        await finSchrijf('fin_placements', q2 => q2.delete().eq('id', p.id));
        f.placements = f.placements.filter(x => x.id !== p.id);
        /* Anders maakt de inbox hem meteen weer aan als af te ronden. */
        if(p.pipeline_candidate_id) await niemandFactureren(f, p.pipeline_candidate_id);
      }, 'Plaatsing verwijderd', ok => { if(ok){ CRM.drawer.close(); herteken && herteken(); } else opnieuw(); });
    };
  }});
}

async function niemandFactureren(f, candId){
  await finSchrijf('fin_dismissed_candidates', q => q.upsert({candidate_id: candId}));
  if(!f.dismissed.some(d => d.candidate_id === candId)) f.dismissed.push({candidate_id: candId});
}

/* ─── Venster: één termijn bewerken ────────────────────────────────
   Met "latere termijnen meeschuiven": een gespreid schema is gepland
   vanaf de eerste factuur — verzet je die, dan gaan de rest mee. */
function termijnBewerken(f, p, inst, klaar){
  const latere = instOf(f, p.id).filter(i => getal(i.termijn_nr) > getal(inst.termijn_nr) && i.status === 'te_factureren');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Termijn ${H(tekst(inst.termijn_nr,'?'))} bewerken</div>
      <p class="sub" style="margin:6px 0 0">${H(tekst(p.kandidaat))} · ${H(tekst(p.klant))}</p></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label for="te_bedrag">Bedrag excl. btw</label>
          <input type="number" id="te_bedrag" step="0.01" value="${H(bedragVan(inst))}"></div>
        <div class="f-row"><label for="te_datum">Geplande datum</label>
          <input type="date" id="te_datum" value="${H(inst.geplande_datum || '')}"></div>
        <div class="f-row"><label for="te_status">Status</label>
          <select id="te_status">${Object.keys(TERMIJN_ST).map(s =>
            `<option value="${s}"${s === inst.status ? ' selected' : ''}>${H(TERMIJN_ST[s].lbl)}</option>`).join('')}</select></div>
        <div class="f-row" id="te_factrij"><label for="te_fact">Factuurdatum</label>
          <input type="date" id="te_fact" value="${H(inst.factuurdatum || '')}"></div>
        <div class="f-row" id="te_paidrij"><label for="te_paid">Betaaldatum</label>
          <input type="date" id="te_paid" value="${H(inst.betaaldatum || '')}"></div>
      </div>
      ${latere.length ? `<label class="check" style="margin-top:6px"><input type="checkbox" id="te_schuif" checked>
        De ${latere.length} latere open termijn${latere.length === 1 ? '' : 'en'} maandelijks laten meeschuiven vanaf deze datum
        <span class="meta">(termijn ${H(latere.map(i => i.termijn_nr).join(', '))} — gefactureerd of betaald blijft staan)</span></label>` : ''}
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="te_ok">Opslaan</button></div>`, {
    onClose(){ klaar(); },
    onOpen(m){
      const q = s => m.querySelector(s);
      /* Alleen de datumvelden tonen die bij de status horen: een factuur-
         datum op een termijn die nog "te factureren" is, verschoof de
         verwachte betaling in de cashflow (Torin, 27 okt 2026). */
      const sync = () => {
        const s = q('#te_status').value;
        /* style.display, niet hidden: .f-row zet display:flex en wint dan van [hidden]. */
        q('#te_factrij').style.display = (s === 'gefactureerd' || s === 'betaald') ? '' : 'none';
        q('#te_paidrij').style.display = s === 'betaald' ? '' : 'none';
      };
      q('#te_status').onchange = sync; sync();
      q('#te_ok').onclick = () => {
        const status = q('#te_status').value, datum = q('#te_datum').value || null;
        const gefact = status === 'gefactureerd' || status === 'betaald';
        const patch = {
          bedrag_excl: getal(q('#te_bedrag').value), geplande_datum: datum, status,
          factuurdatum: gefact ? (q('#te_fact').value || inst.factuurdatum || todayISO()) : null,
          betaaldatum: status === 'betaald' ? (q('#te_paid').value || inst.betaaldatum || todayISO()) : null
        };
        const schuif = q('#te_schuif') && q('#te_schuif').checked && datum && datum !== inst.geplande_datum;
        const wasDatum = inst.geplande_datum;
        finDoe(q('#te_ok'), async () => {
          await instWijzig(inst, patch);
          if(schuif) for(const i of latere)
            await instWijzig(i, {geplande_datum: addMonths(datum, getal(i.termijn_nr) - getal(inst.termijn_nr))});
          if(getal(inst.termijn_nr) === 1 && datum && datum !== wasDatum)
            await plWijzig(p, {eerste_factuurdatum: datum});
        }, schuif ? `Opgeslagen — ${latere.length} termijn${latere.length === 1 ? '' : 'en'} meegeschoven` : 'Termijn opgeslagen',
        ok => { if(ok){ CRM.modal._onClose = null; CRM.modal.close(); klaar(); } });
      };
    }});
}

/* Welke stops al besloten zijn ({P048: '2026-10-29'}): fin_settings, geen
   databasewijziging. Een stop zonder besluit met nog open termijnen komt
   bovenaan Facturatie te staan tot je kiest (Tjeerd, 29 okt 2026).    */
const STOP_KEY = 'stop_besloten';
const stopBesloten = f => { const v = S(f, STOP_KEY, null); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; };
async function zetStopBesloten(f, p){
  const nieuw = Object.assign({}, stopBesloten(f), {[p.id]: p.gestopt_op || todayISO()});
  await finSchrijf('fin_settings', q => q.upsert({key: STOP_KEY, value: nieuw}));
  f.settings[STOP_KEY] = nieuw;
}
/* Afwijkende klantfactor die Tjeerd gecontroleerd heeft ({naam: {factor, op}}).
   Een andere functie bij dezelfde klant kan een eigen factor hebben (Liselotte
   2,40 naast Lucindy 2,50 bij Omefa, 29 okt 2026). Wijzigt de factor later,
   dan komt de melding terug.                                          */
const FACTOR_OK_KEY = 'factorcontrole_ok';
const factorOk = f => { const v = S(f, FACTOR_OK_KEY, null); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; };
const factorAfwijking = (f, r) => (r.afwijking || []).filter(x => {
  const ok = factorOk(f)[r.naam];
  return !(ok && /factureert Pronkert/.test(x) && Math.abs(getal(ok.factor) - getal(r.klantfactor)) < 0.005);
});
async function zetFactorOk(f, r){
  const nieuw = Object.assign({}, factorOk(f), {[r.naam]: {factor: r.klantfactor, op: todayISO()}});
  await finSchrijf('fin_settings', q => q.upsert({key: FACTOR_OK_KEY, value: nieuw}));
  f.settings[FACTOR_OK_KEY] = nieuw;
}
function stopTeBeslissen(f){
  const bes = stopBesloten(f);
  return f.placements.filter(p => p.gestopt_op && !p.concept && bes[p.id] !== p.gestopt_op && !opHold(f, p.id)
    && instOf(f, p.id).some(i => i.status === 'te_factureren' || i.status === 'gefactureerd'));
}

/* ─── Venster: kandidaat gestopt ───────────────────────────────────
   Per open termijn kies je zelf: factureren (eventueel een ander bedrag)
   of laten vallen — of je zet de hele facturatie on hold als je het nog
   niet weet (Tjeerd, 29 okt 2026: "als iemand gestopt is moet ik kunnen
   kiezen: facturatie laten vallen, on hold, aanpassen"). Voorstel: wat
   ná de stopdatum + de ingestelde maanden valt, vervalt. Ook te openen
   voor wie al gestopt is (stop aanpassen).                            */
function stopVenster(f, p, klaar, voorstelDatum){
  const g = garantie(f, p), mnd = Sn(f,'stop_achterstand_mnd',1);
  const open = instOf(f, p.id).filter(i => i.status === 'te_factureren' || i.status === 'gefactureerd' || (p.gestopt_op && i.status === 'vervallen'))
    .sort((a,b) => (a.termijn_nr||0) - (b.termijn_nr||0));
  const hold = opHold(f, p.id);
  const standaard = (i, datum) => { if(i.status === 'gefactureerd') return 'fact';
    const grens = addMonths(datum, mnd); return i.geplande_datum && i.geplande_datum > grens ? 'vallen' : 'fact'; };
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${p.gestopt_op ? 'Stop aanpassen' : 'Kandidaat gestopt'} · ${H(tekst(p.kandidaat))}</div>
      <p class="sub" style="margin:6px 0 0">${H(klantLabel(p.klant))} · ${H(p.id)} · fee ${H(eur(getal(p.fee_excl)))}</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="sv_datum">Gestopt op</label>
        <input type="date" id="sv_datum" value="${H(p.gestopt_op || voorstelDatum || todayISO())}"></div>
      <p class="meta" style="margin:4px 0 10px">${g.tot ? `Garantie loopt t/m ${H(dOf(g.tot))} — stopt hij daarvoor, dan lever je een kosteloze vervanging.`
        : 'Geen garantie op deze plaatsing.'}</p>
      ${open.length ? `
      <div class="h2" style="font-size:14px;margin:6px 0 6px">Wat doe je met de open termijnen?</div>
      <div style="margin-bottom:6px">
        <button type="button" class="btn ghost sm" data-alle="vallen">Alles laten vallen</button>
        <button type="button" class="btn ghost sm" data-alle="fact">Alles factureren</button>
        <button type="button" class="btn ghost sm" data-alle="std">Voorstel (na stop + ${H(mnd)} mnd vervalt)</button>
      </div>
      <table class="tbl"><tbody>${open.map(i => `<tr data-iid="${H(i.id)}">
        <td class="num">t${H(tekst(i.termijn_nr,'?'))}</td>
        <td class="num">${H(dKort(i.geplande_datum))}${i.status === 'gefactureerd' ? `<div class="rowsub">al gefactureerd ${H(dKort(i.factuurdatum))}</div>` : ''}</td>
        <td class="n"><input type="number" step="0.01" class="sv_bedrag" value="${H(bedragVan(i))}" style="width:110px"${i.status === 'gefactureerd' ? ' disabled' : ''}></td>
        <td><select class="sv_keuze">${i.status === 'gefactureerd'
          ? '<option value="fact">Laten staan (wordt betaald)</option><option value="vallen">Laten vallen (crediteren)</option>'
          : '<option value="fact">Factureren</option><option value="vallen">Laten vallen</option>'}</select></td></tr>`).join('')}
      </tbody></table>` : '<p class="meta">Geen open termijnen meer.</p>'}
      <label class="check" style="margin-top:12px"><input type="checkbox" id="sv_hold"${hold ? ' checked' : ''}>
        Facturatie on hold — ik weet het nog niet (niets wordt gefactureerd tot je hervat)</label>
      <div class="f-row" id="sv_holdwrap" style="${hold ? '' : 'display:none'}"><label for="sv_reden">Reden</label>
        <input id="sv_reden" value="${H(hold ? hold.reden : '')}" placeholder="Gestopt — overleg met klant"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn danger" id="sv_ok">Verwerken</button></div>`, {
    onClose(){ klaar(); },
    onOpen(m){
      const q = s2 => m.querySelector(s2);
      const rijen = [...m.querySelectorAll('tr[data-iid]')].map(tr => ({tr, i: open.find(x => String(x.id) === tr.dataset.iid)}));
      const zetStd = () => rijen.forEach(r => { r.tr.querySelector('.sv_keuze').value =
        (r.i.status === 'vervallen' && p.gestopt_op) ? 'vallen' : standaard(r.i, q('#sv_datum').value || todayISO()); });
      zetStd();
      q('#sv_datum').oninput = () => { if(!p.gestopt_op) zetStd(); };
      m.querySelectorAll('[data-alle]').forEach(b => b.onclick = () => {
        if(b.dataset.alle === 'std') return zetStd();
        rijen.forEach(r => r.tr.querySelector('.sv_keuze').value = b.dataset.alle);
      });
      q('#sv_hold').onchange = e => { q('#sv_holdwrap').style.display = e.target.checked ? '' : 'none'; };
      q('#sv_ok').onclick = () => {
        const datum = q('#sv_datum').value;
        if(!datum) return CRM.toast('Kies de stopdatum', 'err');
        const holdAan = q('#sv_hold').checked, reden = q('#sv_reden').value.trim();
        if(holdAan && !reden) return CRM.toast('Vul een reden in voor on hold', 'err');
        let nVal = 0, nFact = 0;
        finDoe(q('#sv_ok'), async () => {
          if(p.gestopt_op !== datum) await plWijzig(p, {gestopt_op: datum});
          for(const r of rijen){
            const keuze = r.tr.querySelector('.sv_keuze').value;
            const bedrag = getalOfNull(r.tr.querySelector('.sv_bedrag').value);
            if(keuze === 'vallen'){ if(r.i.status !== 'vervallen') await markeer(r.i, 'vervallen'); nVal++; }
            else {
              const patch = {};
              if(r.i.status === 'vervallen') patch.status = 'te_factureren';
              if(bedrag != null && bedrag !== bedragVan(r.i)) patch.bedrag_excl = bedrag;
              if(Object.keys(patch).length) await instWijzig(r.i, patch);
              nFact++;
            }
          }
          if(holdAan && (!opHold(f, p.id) || opHold(f, p.id).reden !== reden)) await zetHold(f, p, reden);
          if(!holdAan && opHold(f, p.id)) await zetHold(f, p, null);
          await zetStopBesloten(f, p);
        }, null, ok => {
          if(!ok) return;
          CRM.toast(`${tekst(p.kandidaat)} gestopt — ${nFact} te factureren, ${nVal} laten vallen${holdAan ? ', facturatie on hold' : ''}`, 'ok');
          CRM.modal._onClose = null; CRM.modal.close(); klaar();
        });
      };
    }});
}

/* ─── Venster: plaatsing afronden (vanuit het bord), nieuw of bewerken ──
   Bij afronden staat de fee die het CRM uitrekent (maandloon × afspraak)
   al ingevuld, met de uitleg erbij. Wat je opslaat is officieel. */
function plFormulier(f, {c = null, p = null} = {}, klaar){
  const bewerk = !!p;
  const ruw = c ? CRM.fee.voorKlant(c.klant, c.geplaatst_op || c.start || null) : null;
  const af = ruw ? CRM.fee.normaliseer(ruw) : null;
  const vs = c ? feeBerekening(f, c) : null;
  const startVoorstel = c ? ((af && af.factuurmoment === 'start' && c.start) ? c.start : (c.geplaatst_op || c.start || todayISO())) : todayISO();
  const svF = schemaVoorstel(f, c ? c.klant : '', null);
  const klanten = [...new Set([...f.placements.map(x => x.klant), ...((CRM.state && CRM.state.clients) || []).map(k => k.naam)]
    .filter(Boolean))].sort((a,b) => a.localeCompare(b, 'nl'));
  const w = (v, alt='') => H(v == null || v === '' ? alt : v);

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${bewerk ? 'Plaatsing bewerken · ' + H(p.id) : c ? 'Plaatsing afronden' : 'Nieuwe plaatsing'}</div>
      ${c ? `<p class="sub" style="margin:6px 0 0">Vanuit het bord: <b>${H(tekst(c.naam))}</b> · ${H(faseVan(c) || '')}${
        c.geplaatst_op ? ' · getekend ' + H(dOf(c.geplaatst_op)) : ''}</p>` : ''}</div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label for="pf_id">Nummer</label>
          <input id="pf_id" value="${w(p && p.id, volgPlId(f))}"${bewerk ? ' disabled' : ''}></div>
        <div class="f-row"><label for="pf_klant">Klant</label>
          <input id="pf_klant" list="pf_klanten" value="${w(p ? p.klant : c && c.klant)}">
          <datalist id="pf_klanten">${klanten.map(k => `<option value="${H(k)}">`).join('')}</datalist></div>
        <div class="f-row"><label for="pf_kand">Kandidaat</label>
          <input id="pf_kand" value="${w(p ? p.kandidaat : c && c.naam)}"></div>
        <div class="f-row"><label for="pf_functie">Functie</label>
          <input id="pf_functie" value="${w(p ? p.functie : c && c.functie)}"></div>
        <div class="f-row"><label for="pf_fee">Fee excl. btw</label>
          <input id="pf_fee" type="number" step="0.01" value="${w(p ? getalOfNull(p.fee_excl) : vs && vs.fee)}">
          ${vs ? `<span class="hint">CRM rekent ${H(eur(vs.fee))}${vs.zeker ? '' : ' — schatting'}: ${H(vs.uitleg || '')}</span>`
            : c ? `<span class="hint">Geen maandloon op de kandidaatkaart — de fee kan het CRM dan niet voorrekenen.</span>` : ''}</div>
        <div class="f-row"><label for="pf_contract">Contract getekend</label>
          <input id="pf_contract" type="date" value="${w(p ? p.contract_datum : c && c.geplaatst_op, todayISO())}"></div>
        <div class="f-row"><label for="pf_betaal">Betaaltermijn (dagen)</label>
          <input id="pf_betaal" type="number" value="${w(p ? p.betaaltermijn_dgn : af && af.betaaltermijn, Sn(f,'default_betaaltermijn',14))}"></div>
        <div class="f-row"><label for="pf_gar">Garantie (maanden)</label>
          <input id="pf_gar" type="number" value="${w(p ? p.garantie_mnd : af && af.garantie_soort !== 'geen' ? af.garantie_mnd : c && c.garantie_mnd, 0)}"></div>
      </div>
      <div class="f-row"><label for="pf_note">Notitie</label><input id="pf_note" value="${w(p && p.note)}"></div>
      ${bewerk ? '' : `
      <div class="h2" style="font-size:14px;margin:14px 0 8px">Factuurschema</div>
      ${schemaZinHtml('pf', svF, startVoorstel)}
      ${af ? `<div class="hint">Afspraak met de klant: factureren ${af.factuurmoment === 'start' ? 'bij de start van de kandidaat' : 'bij contract getekend'} — de startdatum is daarop gezet.</div>` : ''}`}
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="pf_ok">${bewerk ? 'Opslaan' : 'Plaatsing vastleggen'}</button></div>`, {
    onClose(){ klaar && klaar(); },
    onOpen(m){
      const q = s => m.querySelector(s);
      let schema = [];
      const voorbeeld = () => { if(!bewerk) schema = schemaUitZin(q, 'pf', getal(q('#pf_fee').value)).rows; };
      if(!bewerk){
        ['#pf_fee','#pf_n','#pf_tussen','#pf_start'].forEach(sel => q(sel).addEventListener('input', voorbeeld));
        voorbeeld();
      }
      q('#pf_ok').onclick = () => {
        const rij = {
          klant: q('#pf_klant').value.trim(), kandidaat: q('#pf_kand').value.trim(),
          functie: q('#pf_functie').value.trim(), fee_excl: getal(q('#pf_fee').value),
          contract_datum: q('#pf_contract').value || null,
          betaaltermijn_dgn: getal(q('#pf_betaal').value) || 14,
          garantie_mnd: getal(q('#pf_gar').value), note: q('#pf_note').value.trim() || null
        };
        const id = bewerk ? p.id : q('#pf_id').value.trim();
        if(!id || !rij.klant) return CRM.toast('Nummer en klant zijn verplicht', 'err');
        if(!rij.fee_excl) return CRM.toast('Vul de fee in', 'err');
        if(!bewerk && f.placements.some(x => x.id === id)) return CRM.toast(`${id} bestaat al — kies een ander nummer`, 'err');
        finDoe(q('#pf_ok'), async () => {
          if(bewerk){
            const oudeFee = getal(p.fee_excl);
            await plWijzig(p, rij);
            /* Fee aangepast: wat nog open staat opnieuw verdelen, met de
               al gefactureerde termijnen ervan af — anders liep het totaal
               boven de fee uit. */
            if(oudeFee !== rij.fee_excl) await verdeelOpen(f, p);
            return;
          }
          const nieuw = Object.assign({id}, rij, {
            aantal_termijnen: schema.length || 1, eerste_factuurdatum: (schema[0] && schema[0].datum) || null,
            bron: c ? 'pipeline' : 'app', pipeline_candidate_id: (c && c.id) || null, concept: false,
            updated_at: new Date().toISOString()});
          await finSchrijf('fin_placements', q2 => q2.insert(nieuw));
          f.placements.push(nieuw);
          /* Termijnen lukken niet? Dan de plaatsing ook terugdraaien —
             een plaatsing zonder schema valt overal stil uit de cijfers. */
          try{
            await instErbij(f, schema.map(r => ({placement_id:id, termijn_nr:r.nr, bedrag_excl:r.bedrag,
              geplande_datum:r.datum, status:'te_factureren'})));
          }catch(e){
            await finSchrijf('fin_placements', q2 => q2.delete().eq('id', id)).catch(() => {});
            f.placements = f.placements.filter(x => x.id !== id);
            throw e;
          }
        }, bewerk ? 'Plaatsing opgeslagen' : `${id} vastgelegd — dit is de officiële fee`,
        ok => { if(ok){ CRM.modal._onClose = null; CRM.modal.close(); klaar && klaar(); } });
      };
    }});
}

/* ═══ TAB: PLAATSINGEN ═════════════════════════════════════════
   Alle plaatsingen — W&S én flex — op één plek, met per maand wat ze
   écht opleveren (Tjeerd, 27 okt 2026: "een hele tab met alle plaatsingen,
   met een maandelijks overzicht wat we binnenkrijgen, flex en W&S samen
   maar ook apart; en echt een aparte tab Facturatie"). Termijnen
   afvinken gebeurt in de tab Facturatie.                              */
let _plSoort = 'alles', _inboxAlles = false;

function binnenKaart(f, soort){
  const t = todayISO(), nu7 = t.slice(0,7);
  const mnd = [-3,-2,-1,0,1,2,3,4,5,6].map(i => String(addMonths(monthKey(t), i)).slice(0,7));
  const fk = flexKasstroom(f);
  /* Flex in drie stukken: al gefactureerd/binnen, verwacht van wie al werkt,
     en wie getekend heeft maar nog niet startte. Die laatste telt NIET in het
     totaal — daar is nog geen uur gewerkt (niet rijk rekenen). */
  const kolom = soort === 'ws' ? ['W&S']
    : soort === 'flex' ? ['Gefactureerd', 'Verwacht · werkt al', 'Nog niet gestart', 'Totaal flex']
    : ['W&S', 'Flex', 'Nog niet gestart', 'Totaal'];
  const bedrag = (x, extra) => x ? `<span class="num${extra || ''}">${eur(x)}</span>` : '<span class="meta">—</span>';
  const rij = mk7 => {
    const b = binnenMaand(f, mk7), m = fk.maand(mk7), prog = mk7 > nu7, nu = mk7 === nu7;
    const ws = b.wsEcht + b.wsVerwacht, flex = b.flexEcht + b.flexVerwacht;
    const sub = (echt, verwacht) => nu && verwacht && echt ? `<div class="rowsub">${eur(echt)} al binnen</div>` : '';
    const cellen = soort === 'ws'
      ? `<td class="n">${bedrag(ws)}${sub(b.wsEcht, b.wsVerwacht)}</td>`
      : soort === 'flex'
      ? `<td class="n">${bedrag(m.binnen + m.gefactureerd)}${m.binnen && m.gefactureerd ? `<div class="rowsub">${eur(m.binnen)} al binnen</div>` : ''}</td>
         <td class="n">${bedrag(m.verwacht)}</td>
         <td class="n">${bedrag(m.nieuw, ' meta')}</td>
         <td class="n"><b class="num">${eur(flex)}</b></td>`
      : `<td class="n">${bedrag(ws)}${sub(b.wsEcht, b.wsVerwacht)}</td>
         <td class="n">${bedrag(flex)}${sub(b.flexEcht, b.flexVerwacht)}</td>
         <td class="n">${bedrag(m.nieuw, ' meta')}</td>
         <td class="n"><b class="num">${eur(b.totaal)}</b>${m.nieuw ? `<div class="rowsub">${eur(b.totaal + m.nieuw)} als de nieuwe starten</div>` : ''}</td>`;
    return `<tr class="${prog ? 'fin-prog' : ''}${nu ? ' fin-nu' : ''}">
      <td><b>${H(mkLabel(mk7 + '-01'))}</b> <span class="meta">${nu ? 'deze maand' : prog ? 'verwacht' : 'binnen'}</span></td>${cellen}</tr>`;
  };
  const inn = nogTeInnen(f);
  const r = fk.real;
  const ritme = `Flex: elke margefactuur ±${fk.termijn} dagen na de factuurdatum (zondag van de werkweek); vooruit met ${pct0(r.pct)} van de contracturen${
    r.voldoende ? ` (gemeten over ${r.weken} volle werkweken)` : ' (nog te weinig weken gemeten)'} en zonder feestdagen, tot de overname.`;
  return kaart('Wat komt er binnen per maand',
    tabel('<th>Maand</th>' + kolom.map(k => `<th class="n">${H(k)}</th>`).join(''),
      mnd.map(rij).join('')),
    {plat:true, acties: inn.n && soort !== 'flex' ? `<span class="meta">nog te innen (te laat): <b class="neg num">${eur(inn.bedrag)}</b></span>` : '',
     voet: (soort === 'flex' ? '' : 'Excl. btw. W&S: betaalde termijnen, vooruit op de vervaldatum; te laat betaald telt pas als het binnen is. ')
       + ritme + ' "Nog niet gestart" = getekend, nog geen uur gewerkt — telt niet in het totaal.'});
}

/* ─── Kaart: flex-portefeuille ──────────────────────────────────────
   Wat elke flexkracht oplevert als hij zijn looptijd volmaakt (Tjeerd,
   28 okt 2026): al verdiend (margefacturen) + nog te verdienen (marge per
   uur × resterende uren) = totaal. Actief en nieuw geplaatst bovenaan;
   wie stopte staat in een eigen kaart (gestoptKaart).                 */
function portefeuilleKaart(f, pf){
  if(!pf.length) return kaart('Flex-portefeuille', CRM.ui.leeg('Geen lopende flexkrachten', 'Ze verschijnen vanzelf vanuit het bord (Contract getekend, type Flex).'));
  const t = todayISO();
  const rijen = pf.map(r => {
    const eigen = eigenFactuur(f, r.naam, r.klant);
    const verdiend = eigen ? eigen.marge : 0;
    const nieuw = !eigen || !(eigen.uren > 0);
    return {...r, verdiend, nieuwGroep: nieuw, totaalLooptijd: r.compleet ? verdiend + r.rest : null};
  });
  const actief = rijen.filter(r => !r.nieuwGroep), nieuw = rijen.filter(r => r.nieuwGroep);
  const rij = r => `<tr${r.compleet ? '' : ' class="fin-onvolledig"'}>
      <td><b>${H(r.naam)}</b> <button type="button" class="lnk" data-flexvul="${H(r.naam)}">${r.compleet ? 'wijzig' : 'aanvullen'}</button>
        <div class="rowsub">${H(klantLabel(r.klant))}${r.nieuwGroep && r.start ? (r.start > t ? ' · start ' + H(dKort(r.start)) : ' · gestart ' + H(dKort(r.start)) + ', nog geen factuur') : ''}</div></td>
      <td class="n num">${r.margeUur ? eur2(r.margeUur) : '—'}${r.margeUur ? `<div class="rowsub" title="${H(r.echt
          ? 'Werkelijke marge per gewerkt uur uit de eigen margefacturen (leidend).' + (r.margeVoorspeld ? ' Voorspeld was ' + eur2(r.margeVoorspeld) + '.' : '')
          : 'Voorspelling: uurloon ' + eur2(r.uurloon) + (r.uurloonBron ? ' (' + r.uurloonBron + ')' : '') + ' × (klantfactor ' + num(r.klantfactor, 2) + ' uit ' + r.klantfactorBron + ' − inkoop ' + num(r.inkoop, 3) + ' uit ' + r.inkoopBron + ')')}">${
          r.echt ? 'factuur' : `voorspeld · ${num(r.klantfactor, 2)} − ${num(r.inkoop, 2)}`}</div>` : ''}</td>
      <td class="n num">${Math.round(r.gewerkt)} / ${r.overname ? Math.round(r.overname) + ' u' : '?'}
        ${r.overname ? `<div class="fin-waardebar" style="margin-top:4px"><i style="width:${Math.min(100, r.gewerkt / r.overname * 100)}%"></i></div>` : ''}</td>
      <td class="n">${r.verdiend ? `<span class="num pos">${eur(r.verdiend)}</span>` : '<span class="meta">—</span>'}</td>
      <td class="n">${r.compleet ? `<span class="num">${eur(r.rest)}</span>` : '<span class="meta">mist gegevens</span>'}</td>
      <td class="n">${r.totaalLooptijd != null ? `<b class="num">${eur(r.totaalLooptijd)}</b>` : '<span class="meta">—</span>'}</td>
      <td class="n num">${r.compleet && r.einde ? H(dKort(r.einde)) : '—'}</td></tr>`;
  const som = (arr, k) => arr.reduce((x, r) => x + (r[k] || 0), 0);
  const kopRij = (titel, arr) => arr.length ? `<tr class="fin-groep"><td colspan="7"><b>${titel}</b> <span class="meta">${arr.length}</span></td></tr>` + arr.map(rij).join('') : '';
  const totaal = `<tr class="fin-scheiding"><td colspan="7"></td></tr>
    <tr><td><b>Totaal</b><div class="rowsub">${rijen.filter(r => !r.compleet).length ? rijen.filter(r => !r.compleet).length + ' zonder volledige gegevens telt niet mee' : 'actief + nieuw'}</div></td><td></td><td></td>
      <td class="n"><b class="num pos">${eur(som(rijen, 'verdiend'))}</b></td><td class="n"><b class="num">${eur(som(rijen, 'rest'))}</b></td>
      <td class="n"><b class="num">${eur(som(rijen, 'totaalLooptijd'))}</b></td><td></td></tr>`;
  return kaart(`Flex-portefeuille · ${actief.length} actief${nieuw.length ? ' · ' + nieuw.length + ' nieuw' : ''}`,
    tabel('<th>Flexkracht</th><th class="n">Marge/uur</th><th class="n">Gewerkt / looptijd</th><th class="n">Al verdiend</th><th class="n">Nog te verdienen</th><th class="n">Totaal bij volle looptijd</th><th class="n">Overname ±</th>',
      kopRij('Actief', actief) + kopRij('Nieuw geplaatst', nieuw) + totaal),
    {plat:true, voet:'Al verdiend = de marge op de margefacturen. Nog te verdienen = marge per uur × de uren tot de kosteloze overname (potentieel, nog niet binnen). "Voorspeld" = uurloon × (klantfactor − inkoopfactor); zodra iemands eigen margefactuur binnen is geldt de werkelijke marge per uur. Overname ± rekent met de gemeten realisatie en zonder feestdagen.'});
}

/* ─── Kaart: gestopt ───────────────────────────────────────────────
   Apart van de lopende mensen: wat ze in totaal hebben opgeleverd en wat
   er van hun laatste weken nog binnenkomt. */
function gestoptKaart(f){
  const stops = [...f.flexPl.filter(x => x.gestopt_op).map(x => ({n: flexWoorden(x.kandidaat), naam: tekst(x.kandidaat), klant: x.klant, d: String(x.gestopt_op).slice(0,10)})),
                 ...cands().filter(c => isFlexType(c.type) && c.gestopt_op).map(c => ({n: flexWoorden(c.naam), naam: tekst(c.naam), klant: c.klant, d: String(c.gestopt_op).slice(0,10)}))];
  const t = todayISO(), kas = flexKasstroom(f);
  const rijen = flexFactoren(f).map(k => {
    const roep = flexWoorden(k.naam)[0];
    const st = roep && stops.find(x => x.n.includes(roep));
    if(!st) return null;
    const p = kas.personen.find(x => x.sleutel === k.sleutel);
    const onderweg = p ? p.posten.filter(x => x.datum > t).reduce((a, x) => a + x.bedrag, 0) : 0;
    return {naam: st.naam, klant: st.klant || k.klant, gestopt: st.d, uren: k.uren, verdiend: k.marge, onderweg};
  }).filter(Boolean).sort((a,b) => b.gestopt.localeCompare(a.gestopt));
  if(!rijen.length) return '';
  return kaart(`Gestopt · ${rijen.length}`, tabel('<th>Flexkracht</th><th class="n">Gestopt</th><th class="n">Gewerkt</th><th class="n">Opgeleverd</th><th class="n">Komt nog binnen</th>',
    rijen.map(r => `<tr><td><b>${H(r.naam)}</b><div class="rowsub">${H(klantLabel(r.klant))}</div></td>
      <td class="n num">${H(dKort(r.gestopt))}</td><td class="n num">${Math.round(r.uren)} u</td>
      <td class="n"><span class="num pos">${eur(r.verdiend)}</span></td>
      <td class="n">${r.onderweg ? `<span class="num">${eur(r.onderweg)}</span>` : '<span class="meta">—</span>'}</td></tr>`).join('')),
    {plat:true, voet:'Opgeleverd = marge op de margefacturen. Komt nog binnen = gefactureerd maar nog niet betaald, plus de laatste dagen tot de stopdatum die nog niet gefactureerd zijn.'});
}

/* ─── Kaart: per flexkracht per maand ───────────────────────────────
   Iemand start → eerste factuur → eerste geld → wat er daarna elke
   maand binnenkomt, tot de overname. Wie stopte staat erin zolang er nog
   geld van hem onderweg is. */
function flexKalenderKaart(f){
  const t = todayISO(), nu7 = t.slice(0,7);
  const fk = flexKasstroom(f);
  const mnd = [0,1,2,3,4,5].map(i => String(addMonths(monthKey(t), i)).slice(0,7));
  const komt = p => p.posten.filter(x => x.mk7 >= nu7 && x.soort !== 'binnen');
  const rijen = fk.personen.filter(p => p.mist || komt(p).length)
    .map(p => {
      const toekomst = komt(p);
      const eerste = toekomst.slice().sort((a,b) => a.datum.localeCompare(b.datum))[0];
      const perMaand = mk7 => toekomst.filter(x => x.mk7 === mk7).reduce((s,x) => s + x.bedrag, 0);
      const status = p.gestopt ? `gestopt ${dKort(p.gestopt)} · laatste dagen komen nog`
        : p.nieuw ? `start ${dKort(p.start)}` : p.start ? 'werkt' : 'startdatum onbekend';
      const marge = p.margeUur ? `${eur2(p.margeUur)}/u ${p.echt ? 'factuur' : 'voorspeld'}` : '';
      return {p, eerste, totaal: toekomst.reduce((s,x) => s + x.bedrag, 0), html: `<tr${p.mist ? ' class="fin-onvolledig"' : ''}>
        <td><b>${H(p.naam)}</b>${p.sleutel.startsWith('pf:') && !p.gestopt ? ` <button type="button" class="lnk" data-flexvul="${H(p.naam)}">${p.mist ? 'aanvullen' : 'wijzig'}</button>` : ''}<div class="rowsub">${H([klantLabel(p.klant), status, marge].filter(Boolean).join(' · '))}</div></td>
        <td class="n">${p.mist ? '<span class="meta">mist gegevens</span>' : eerste ? `<span class="num">${H(dKort(eerste.datum))}</span>${
          p.nieuw && eerste.week ? `<div class="rowsub">1e week ${H(dKort(eerste.week))}</div>` : ''}` : '—'}</td>
        ${mnd.map(mk7 => { const v = perMaand(mk7); return `<td class="n">${v ? `<span class="num${p.nieuw ? ' meta' : ''}">${eur(v)}</span>` : '<span class="meta">—</span>'}</td>`; }).join('')}
        <td class="n">${p.einde && !p.gestopt ? H(dKort(p.einde)) : '—'}</td></tr>`};
    })
    .sort((a,b) => (a.p.mist ? 1 : 0) - (b.p.mist ? 1 : 0) || (a.p.nieuw ? 1 : 0) - (b.p.nieuw ? 1 : 0) || b.totaal - a.totaal);
  if(!rijen.length) return '';
  const som = mk7 => { const m = fk.maand(mk7); return m.gefactureerd + m.verwacht; };
  const somNieuw = mk7 => fk.maand(mk7).nieuw;
  const voet = `<tr class="fin-scheiding"><td colspan="${mnd.length + 3}"></td></tr>
    <tr><td><b>Totaal flex</b><div class="rowsub">wie al werkt</div></td><td></td>${mnd.map(mk7 => `<td class="n"><b class="num">${eur(som(mk7))}</b></td>`).join('')}<td></td></tr>
    ${mnd.some(mk7 => somNieuw(mk7)) ? `<tr><td>+ nog niet gestart</td><td></td>${mnd.map(mk7 => `<td class="n"><span class="num meta">${somNieuw(mk7) ? eur(somNieuw(mk7)) : '—'}</span></td>`).join('')}<td></td></tr>` : ''}`;
  return kaart('Flex per persoon — wanneer komt het geld binnen',
    tabel(`<th>Flexkracht</th><th class="n">Eerste geld</th>${mnd.map(mk7 => `<th class="n">${H(mkLabel(mk7 + '-01'))}</th>`).join('')}<th class="n">Overname ±</th>`,
      rijen.map(r => r.html).join('') + voet),
    {plat:true, voet:`Per week: werkdagen zonder feestdagen × uren per week ÷ 5 × ${pct0(fk.real.pct)} (gemeten realisatie) × marge per uur. Factuur op de zondag van de werkweek, geld ±${fk.termijn} dagen later — de termijn staat onder ⚙. Al gefactureerd telt met het echte factuurbedrag. Na de overname rekenen we niets meer.`});
}

/* ─── Filter op klant (Tjeerd, 29 okt 2026: "overzichtelijker") ─────
   Eén keuze bovenaan Plaatsingen; alles op het tabblad volgt: cijferbalk,
   binnen per maand, W&S-lijst, flex. Klantnamen worden gegroepeerd zoals
   overal in het CRM (CRM.normKlant). Flex-factuurregels horen bij de klant
   van de kandidaat op het bord (roepnaam), anders de naam op de factuur. */
let _plKlant = '';
const klantSleutel = k => CRM.normKlant ? CRM.normKlant(k) : String(k||'').toLowerCase();
function plKlanten(f){
  const namen = new Map();
  const erbij = k => { const s2 = klantSleutel(k); if(s2 && !namen.has(s2)) namen.set(s2, String(k).trim()); };
  f.placements.forEach(p => erbij(p.klant));
  f.flexPl.forEach(p => erbij(p.klant));
  cands().filter(c => isFlexType(c.type) && (isPlaced(c) || c.gestopt_op)).forEach(c => erbij(c.klant));
  return [...namen.entries()].sort((a,b) => a[1].localeCompare(b[1], 'nl'));
}
function filterOpKlant(f, sl){
  const hoort = k => klantSleutel(k) === sl;
  const pl = f.placements.filter(p => hoort(p.klant)), ids = new Set(pl.map(p => p.id));
  const regelKlant = r => { const k = bordKlant({naam: r.roepnaam || r.naam}); return k || r.klant; };
  return Object.assign({}, f, {
    placements: pl,
    installments: f.installments.filter(i => ids.has(i.placement_id)),
    flexPl: f.flexPl.filter(p => hoort(p.klant)),
    flexRegels: (f.flexRegels || []).filter(r => hoort(regelKlant(r))),
    flexWeken: []                                   // oude weektotalen hebben geen klant
  });
}

function tabPlaatsingen(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen plaatsingen in demo',
    'Hier zie je normaal al je plaatsingen — W&S en flex — met wat ze per maand opleveren.'); return; }
  const klanten = plKlanten(f);
  if(_plKlant && !klanten.some(([s2]) => s2 === _plKlant)) _plKlant = '';
  if(!_plKlant) return tabPlaatsingenTeken(el, f, f, klanten);
  const fv = filterOpKlant(f, _plKlant);
  _candFilter = c => klantSleutel(c.klant) === _plKlant;
  try{ tabPlaatsingenTeken(el, f, fv, klanten); } finally { _candFilter = null; }
}

function tabPlaatsingenTeken(el, fAlles, f, klanten){

  const t = todayISO(), nu7 = t.slice(0,7);
  const b0 = binnenMaand(f, nu7);
  const komend = [1,2,3].map(i => binnenMaand(f, String(addMonths(monthKey(t), i)).slice(0,7)));
  const pf = flexPortefeuille(f), pfOk = pf.filter(r => r.compleet);
  const lopendWs = f.placements.filter(p => !p.gestopt_op && instOf(f, p.id).some(i => i.status === 'te_factureren' || i.status === 'gefactureerd')).length;
  const nogWs = f.installments.filter(i => (i.status === 'te_factureren' || i.status === 'gefactureerd')
    && !opHold(f, i.placement_id) && !(f.placements.find(p => p.id === i.placement_id) || {}).concept).reduce((s,i) => s + bedragVan(i), 0);
  const nogFlex = pfOk.reduce((s,r) => s + r.rest, 0);
  const som = (arr, k) => arr.reduce((s,x) => s + x[k], 0);
  const kies = (ws, flex) => _plSoort === 'ws' ? ws : _plSoort === 'flex' ? flex : ws + flex;

  const inbox = inboxCandidates(f);
  const inboxZicht = _inboxAlles ? inbox : inbox.slice(0, 4);
  const inboxHtml = inbox.length && _plSoort !== 'flex' ? kaart(`Af te ronden (${inbox.length})`, tabel(
    '<th>Kandidaat</th><th class="n">CRM rekent</th><th></th>',
    inboxZicht.map(c => { const vs = feeBerekening(f, c); return `<tr>
      <td><b>${H(tekst(c.naam))}</b><div class="rowsub">${H([c.functie, c.klant].filter(Boolean).join(' · '))}${
        c.geplaatst_op ? ' · getekend ' + H(dKort(c.geplaatst_op)) : ''}</div></td>
      <td class="n">${vs ? `<span class="num">${eur(vs.fee)}</span>${vs.zeker ? '' : '<div class="rowsub">schatting</div>'}`
                         : '<span class="meta">geen maandloon</span>'}</td>
      <td class="n" style="white-space:nowrap"><button class="btn sm" data-afronden="${H(c.id)}">Afronden</button>
        <button class="btn ghost sm" data-nietfact="${H(c.id)}" title="Hier wordt niet voor gefactureerd">Niet factureren</button></td>
    </tr>`; }).join('') + (inbox.length > 4 ? `<tr><td colspan="3"><button type="button" class="lnk" id="fin_inbox_meer">${
      _inboxAlles ? 'Minder tonen' : `Toon alle ${inbox.length}`}</button></td></tr>` : '')), {plat:true}) : '';

  el.innerHTML = `
    <div class="fin-toolbar">
      <div class="seg" id="fin_pl_soort">
        <button data-s="alles"${_plSoort === 'alles' ? ' class="on"' : ''}>Alles</button>
        <button data-s="ws"${_plSoort === 'ws' ? ' class="on"' : ''}>W&amp;S</button>
        <button data-s="flex"${_plSoort === 'flex' ? ' class="on"' : ''}>Flex</button>
      </div>
      <select id="fin_pl_klant" style="width:auto;max-width:260px" title="Filter op klant">
        <option value="">Alle klanten</option>
        ${klanten.map(([s2, n]) => `<option value="${H(s2)}"${s2 === _plKlant ? ' selected' : ''}>${H(n)}</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <button class="btn sub sm" id="fin_pl_nieuw">+ W&amp;S-plaatsing</button>
    </div>
    ${strip([
      ['Binnen deze maand', eur(kies(b0.wsEcht, b0.flexEcht)), 'echt ontvangen, excl. btw'],
      ['Verwacht komende 3 mnd', eur(kies(som(komend,'wsVerwacht'), som(komend,'flexVerwacht'))), 'wat er al ligt, geen nieuwe plaatsingen'],
      ['Lopend', `<span class="num">${kies(lopendWs, pf.length)}</span>`, _plSoort === 'ws' ? 'W&S met open termijnen' : _plSoort === 'flex' ? 'flexkrachten' : `${lopendWs} W&S · ${pf.length} flex`],
      ['Nog te ontvangen', eur(kies(nogWs, nogFlex)), _plSoort === 'flex' ? 'potentieel, t/m de overnames' : 'W&S: open termijnen' + (_plSoort === 'alles' ? ' · flex: t/m overname' : '')]
    ])}
    <div class="stack">
      ${binnenKaart(f, _plSoort)}
      ${inboxHtml}
      ${_plSoort !== 'flex' ? `<div class="card">
        <div class="card-h"><div class="h2">W&amp;S-plaatsingen</div>
          <div class="searchbox"><input type="search" id="fin_pl_zoek" placeholder="Zoek kandidaat, klant of functie" value="${H(_zoek)}"></div>
          <select id="fin_pl_filter" style="width:auto">
            <option value="alle">Alle</option>
            <option value="concept">Concept (fee bevestigen)</option>
            <option value="te_factureren">Met open termijnen</option>
            <option value="gefactureerd">Wacht op betaling</option>
            <option value="gestopt">Gestopt</option>
          </select>
        </div>
        <div class="card-b" style="padding:0"><div id="fin_pl_tbl"></div></div>
      </div>` : ''}
      ${_plSoort !== 'ws' ? '<div id="fin_flexdeel"></div>' : ''}
    </div>`;

  const herteken = () => tabPlaatsingen(el, fAlles);
  el.querySelectorAll('#fin_pl_soort button').forEach(b => b.onclick = () => { _plSoort = b.dataset.s; herteken(); });
  el.querySelector('#fin_pl_klant').onchange = e => { _plKlant = e.target.value; herteken(); };
  el.querySelector('#fin_pl_nieuw').onclick = () => plFormulier(fAlles, {}, herteken);
  const meer = el.querySelector('#fin_inbox_meer');
  if(meer) meer.onclick = () => { _inboxAlles = !_inboxAlles; herteken(); };
  el.querySelectorAll('[data-afronden]').forEach(b => b.onclick = () => {
    const c = cands().find(x => String(x.id) === b.dataset.afronden);
    if(c) plFormulier(fAlles, {c}, herteken);
  });
  el.querySelectorAll('[data-nietfact]').forEach(b => b.onclick = async () => {
    const c = cands().find(x => String(x.id) === b.dataset.nietfact); if(!c) return;
    if(!await CRM.bevestig(`${tekst(c.naam)} niet factureren?`,
      'Hij verdwijnt uit deze lijst en wordt geen plaatsing in Finance.', {knop:'Niet factureren'})) return;
    finDoe(b, () => niemandFactureren(fAlles, c.id), `${tekst(c.naam)} staat op niet factureren`, herteken);
  });
  const sel = el.querySelector('#fin_pl_filter');
  if(sel){
    sel.value = [...sel.options].some(o => o.value === _filter) ? _filter : 'alle';
    /* de lijst werkt op de échte gegevens (panelen schrijven erin); het
       klantfilter zit in tekenPlTabel zelf */
    el.querySelector('#fin_pl_zoek').addEventListener('input', CRM.debounce(e => { _zoek = e.target.value; tekenPlTabel(el, fAlles); }, 200));
    sel.onchange = e => { _filter = e.target.value; tekenPlTabel(el, fAlles); };
    tekenPlTabel(el, fAlles);
  }
  const flexDeel = el.querySelector('#fin_flexdeel');
  if(flexDeel) tabFlex(flexDeel, f, _plSoort === 'alles');
}

/* ═══ TAB: FACTURATIE ══════════════════════════════════════════
   Eigen tab (Tjeerd, 27 okt 2026). "Op actie" is de werkbak; "Per maand"
   het termijnschema per maand.                                        */
let _plWeergave = 'actie';
function tabFacturatie(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen facturatie in demo',
    'Hier zie je normaal wat je moet factureren, wie te laat betaalt en wat er aankomt.'); return; }
  _netAf.clear(); _gemistOpen = null; _finDag = todayISO();
  const k = kpis(f), t = todayISO();
  const plById = Object.fromEntries(f.placements.map(p => [p.id, p]));
  const nGemist = f.installments.filter(i => i.status === 'te_factureren' && i.geplande_datum && i.geplande_datum < t
    && !opHold(f, i.placement_id) && plById[i.placement_id] && !plById[i.placement_id].concept).length;
  const nTeLaat = f.installments.filter(i => {
    if(i.status !== 'gefactureerd' || opHold(f, i.placement_id)) return false;
    const vv = plById[i.placement_id] && vervaldatum(i, plById[i.placement_id]);
    return vv && vv < t;
  }).length;
  el.innerHTML = `
    ${_plWeergave === 'actie' ? '' : strip([
      ['Nog te factureren', eur(k.nogTeFactureren), nGemist ? `<span class="neg">${nGemist} datum gemist</span>` : 'niets gemist'],
      ['Openstaand', eur(k.openstaand), nTeLaat ? `<span class="neg">${nTeLaat} te laat</span>` : 'niets te laat'],
      ['Vervallen door stops', eur(k.vervallen), `${pctF(k.stopPct, 0)} van de plaatsingen stopte`]
    ])}
    <div class="fin-toolbar">
      <div class="seg" id="fin_fa_weergave">
        <button data-w="actie"${_plWeergave === 'actie' ? ' class="on"' : ''}>Op actie</button>
        <button data-w="maand"${_plWeergave === 'maand' ? ' class="on"' : ''}>Per maand</button>
      </div>
    </div>
    <div id="fin_fa_view"></div>`;
  const herteken = () => tabFacturatie(el, f);
  el.querySelectorAll('#fin_fa_weergave button').forEach(b => b.onclick = () => { _plWeergave = b.dataset.w; herteken(); });
  const view = el.querySelector('#fin_fa_view');
  if(_plWeergave === 'maand') return facturatieLijst(view, f, herteken);
  return actieLijst(view, f, herteken);
}

function tekenPlTabel(el, f){
  const wrap = el.querySelector('#fin_pl_tbl'); if(!wrap) return;
  const z = _zoek.trim().toLowerCase();
  const rows = f.placements
    .filter(p => {
      if(_plKlant && klantSleutel(p.klant) !== _plKlant) return false;
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
        const rand = plRand(f, p, ins);
        return `
        <tr${CRM.ui.frand(rand.kleur, 'clickable fin-plrow', rand.let_)} data-pid="${H(p.id)}">
          <td class="num" style="color:var(--muted)">›</td>
          <td><b>${H(tekst(p.kandidaat))}</b>
            <div class="rowsub">${H([p.functie, p.klant].filter(Boolean).join(' · '))}${
              p.gestopt_op ? ` · <span style="color:var(--red)">gestopt ${H(dKort(p.gestopt_op))}</span>` : ''}</div></td>
          <td class="n"><span class="num">${eur(getalOfNull(p.fee_excl))}</span></td>
          <td>${chip(st.lbl, st.cls)}${g.vervangingNodig ? ' ' + chip('vervangen','red')
             : g.actief ? ' ' + chip('garantie tot ' + dKort(g.tot), 'purple') : ''}</td>
          <td class="n"><span class="num">${nGef}/${act.length || p.aantal_termijnen || 0}</span> <span class="meta">gefact.</span></td>
          <td class="n">${ps.open ? `<span class="num" style="color:var(--amber)">${eur(ps.open)}</span>` : '<span class="meta">—</span>'}</td>
          <td class="n">${next ? `<span class="num">${eur(bedragVan(next))}</span><div class="rowsub num">${H(dKort(next.geplande_datum))}</div>`
                               : '<span class="meta">—</span>'}</td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;

  /* Klik = het beheerpaneel: termijnen afvinken, schema zetten, fee
     bevestigen, stoppen. Het oude uitklappen toonde alleen. */
  wrap.querySelectorAll('.fin-plrow').forEach(tr => tr.onclick = () =>
    plPaneel(f, tr.dataset.pid, () => tabPlaatsingen(el, f)));
}

/* ═══ WEERGAVE: OP ACTIE ════════════════════════════════════════
   Gekozen na een ontwerpronde met drie versies en negen beoordelaars
   (27 okt 2026): de termijnen staan niet per maand maar naar wat Tjeerd
   moet DOEN — eerst factureren, dan achter te late betalingen aan; wat
   gewoon loopt is één dichte regel. Zijn keuzes: "Nu factureren" kijkt
   t/m deze zondag, "te laat" = de dag na de vervaldatum.

   Eén bron: deelIn() zet elke termijn in precies één groep. Vooruitblik,
   groepskoppen en de rekencheck lezen alleen daaruit, zodat de getallen
   nooit iets anders zeggen dan de lijst. Blijft er een termijn over die
   nergens past, dan staat er een rode regel — niets valt stil weg.     */
const ACTIE_GROEPEN = [
  {k:'nu',          lbl:'Nu factureren',              open:true,  rand:'olijf'},
  {k:'laat',        lbl:'Te laat betaald',            open:true,  rand:'rood'},
  {k:'hold',        lbl:'On hold',                    open:false},
  {k:'wacht',       lbl:'Wacht op betaling',          open:false},
  {k:'komend',      lbl:'Komende 30 dagen',           open:false},
  {k:'later',       lbl:'Later',                      open:false},
  {k:'afgerond',    lbl:'Betaald deze maand',         open:false},
  {k:'geannuleerd', lbl:'Geannuleerd / garantie — geen factuur', open:false}
];
const CONCEPT_VOORLOOP_DGN = 7;
let _actieOpen = new Set(), _actieZoek = '';
const _netAf = new Map();      // inst.id → {groep, vorige, tekst} — gedimd laten staan tot de volgende volledige render
let _gemistOpen = null;        // inst.id waarvan de datumkeuze open staat

const zondagVan = iso => { const d = new Date(iso + 'T12:00:00'); return addDays(iso, (7 - d.getDay()) % 7); };

function deelIn(f, t){
  const plById = Object.fromEntries(f.placements.map(p => [p.id, p]));
  const zondag = zondagVan(t), mk7 = t.slice(0,7);
  const g = Object.fromEntries(ACTIE_GROEPEN.map(x => [x.k, []]));
  const over = []; let afgehandeld = 0;
  for(const i of f.installments){
    const p = plById[i.placement_id];
    if(!p){ over.push(i); continue; }
    const x = {i, p};
    if(i.status === 'betaald'){
      if(String(i.betaaldatum||'').slice(0,7) === mk7){ x.datum = i.betaaldatum; g.afgerond.push(x); } else afgehandeld++;
      continue;
    }
    if(i.status === 'vervallen'){ x.datum = i.geplande_datum; g.geannuleerd.push(x); continue; }
    const hold = opHold(f, p.id);
    if(hold && (i.status === 'te_factureren' || i.status === 'gefactureerd')){
      x.hold = hold; x.datum = i.status === 'gefactureerd' ? vervaldatum(i, p) : i.geplande_datum;
      g.hold.push(x); continue;
    }
    if(i.status === 'gefactureerd'){
      if(!i.factuurdatum){ x.reden = 'datum'; g.nu.push(x); continue; }
      x.datum = vervaldatum(i, p);
      if(x.datum < t){ x.dagen = daysBetween(x.datum, t); g.laat.push(x); } else g.wacht.push(x);
      continue;
    }
    if(i.status === 'te_factureren'){
      x.datum = i.geplande_datum;
      if(!i.geplande_datum){ x.reden = 'datum'; g.nu.push(x); continue; }
      const over_ = daysBetween(t, i.geplande_datum);
      if(p.concept){
        if(over_ <= CONCEPT_VOORLOOP_DGN){ x.reden = 'concept'; g.nu.push(x); }
        else (over_ <= 30 ? g.komend : g.later).push(x);
        continue;
      }
      if(i.geplande_datum <= zondag){ if(over_ < 0) x.dagen = -over_; g.nu.push(x); continue; }
      (over_ <= 30 ? g.komend : g.later).push(x);
      continue;
    }
    over.push(i);
  }
  const opDatum = (a,b) => String(a.datum||'').localeCompare(String(b.datum||''));
  g.nu.sort((a,b) => (a.datum ? 1 : 0) - (b.datum ? 1 : 0) || opDatum(a,b));
  g.laat.sort((a,b) => b.dagen - a.dagen);
  g.wacht.sort(opDatum); g.komend.sort(opDatum); g.later.sort(opDatum); g.hold.sort(opDatum);
  g.afgerond.sort((a,b) => opDatum(b,a)); g.geannuleerd.sort((a,b) => opDatum(b,a));
  /* Rekencheck: elke termijn telt precies één keer. */
  const geteld = Object.values(g).reduce((s,a) => s + a.length, 0) + over.length + afgehandeld;
  return {g, over, zondag, klopt: geteld === f.installments.length};
}

/* Vooruitblik in één regel: wat komt er de komende 8 weken binnen (incl.
   btw), gemeten zoals de kas-projectie: gefactureerd op de vervaldatum,
   te factureren op geplande datum + betaaltermijn. Concept apart. */
function vooruitblik(f, d, t){
  const btw = 1 + Sn(f,'btw_pct',0.21), eind = addDays(t, 56);
  let zeker = 0, concept = 0;
  for(const x of [...d.g.wacht, ...d.g.komend, ...d.g.later, ...d.g.nu]){
    const binnen = x.i.status === 'gefactureerd' ? x.datum
      : (x.i.geplande_datum ? addDays(x.i.geplande_datum, getal(x.p.betaaltermijn_dgn) || 14) : null);
    if(!binnen || binnen > eind) continue;
    if(x.p.concept) concept += bedragVan(x.i) * btw; else zeker += bedragVan(x.i) * btw;
  }
  const achter = [...d.g.laat, ...d.g.nu.filter(x => x.dagen)].reduce((s,x) => s + bedragVan(x.i) * btw, 0);
  return {zeker, concept, achter};
}

function actieLijst(el, f, herteken){
  const t = todayISO();
  const d = deelIn(f, t), vb = vooruitblik(f, d, t);
  const z = _actieZoek.trim().toLowerCase();
  const past = x => !z || [x.p.klant, x.p.kandidaat, x.p.id].some(v => String(v||'').toLowerCase().includes(z));

  /* Gedimde regels blijven in de groep waar ze stonden. */
  const netIds = new Set(_netAf.keys());
  const regelsVan = k => {
    const eigen = d.g[k].filter(x => !netIds.has(x.i.id));
    const gedimd = [..._netAf.values()].filter(n => n.groep === k).map(n => n.x);
    return [...eigen, ...gedimd].filter(past);
  };

  const status = x => {
    if(x.hold) return chip('on hold · ' + x.hold.reden, 'amber');
    if(x.reden === 'concept') return chip('concept — fee bevestigen', '');
    if(x.reden === 'datum')   return chip('datum ontbreekt', '');
    if(x.i.status === 'gefactureerd') return x.dagen ? chip(x.dagen + ' d te laat', 'red') : `<span class="meta">vervalt</span>`;
    if(x.i.status === 'te_factureren'){
      if(x.dagen) return chip('gemist ' + x.dagen + ' d', 'red');
      const over_ = daysBetween(t, x.i.geplande_datum);
      return over_ === 0 ? chip('vandaag', '') : `<span class="meta">over ${over_} d</span>`;
    }
    if(x.i.status === 'betaald') return `<span class="meta">betaald</span>`;
    return `<span class="meta">geen factuur</span>`;
  };
  /* On hold rechtstreeks vanuit de lijst (Tjeerd, 29 okt 2026: "kandidaat
     ziek, ik factureer niet — on hold-knop bij de facturatielijst"). */
  const holdKnop = x => (!x.hold && x.reden !== 'concept' && (x.i.status === 'te_factureren' || x.i.status === 'gefactureerd'))
    ? ` <button class="btn ghost sm fin-ac-hold" data-ac="hold" title="Facturatie van ${H(tekst(x.p.kandidaat))} on hold zetten (bijv. ziek)">⏸</button>`
      + (x.i.status === 'te_factureren' ? ` <button class="btn ghost sm" data-ac="vallen" title="Deze termijn niet factureren (laten vallen)">✕</button>` : '') : '';
  const knop = x => {
    if(x.hold) return `<button class="btn ghost sm" data-ac="hervat">Hervatten</button>`;
    if(x.p.gestopt_op && stopTeBeslissen(f).includes(x.p)) return `<button class="btn sm" data-ac="stop">Gestopt — kiezen…</button>`;
    if(x.reden === 'concept') return `<button class="btn ghost sm" data-ac="paneel">Fee bevestigen</button>`;
    if(x.i.status === 'te_factureren') return `<button class="btn sm" data-ac="fact">Gefactureerd ✓</button>`;
    if(x.i.status === 'gefactureerd' && !x.i.factuurdatum) return `<button class="btn ghost sm" data-ac="paneel">Datum invullen</button>`;
    if(x.i.status === 'gefactureerd') return `<button class="btn sm" data-ac="paid">Betaald ✓</button>`;
    return '';
  };
  const bewerkbaar = x => x.i.status === 'te_factureren' && !_netAf.has(x.i.id);
  const regel = (x, groep) => {
    const n = _netAf.get(x.i.id);
    const datumCel = x.datum ? H(dKort(x.datum)) : '—';
    const keuze = _gemistOpen === x.i.id ? `<tr class="fin-ac-keuze"><td colspan="6">
        gefactureerd op
        <button class="btn ghost sm" data-kies="${H(x.i.geplande_datum)}">${H(dKort(x.i.geplande_datum))} (gepland)</button>
        <button class="btn ghost sm" data-kies="${H(t)}">vandaag</button>
        <input type="date" class="fin-ac-datum" max="${H(t)}" value="">
        <span class="meta fin-ac-vv"></span>
        <button class="btn ghost sm" data-kies="annuleer">Annuleren</button>
        <span class="meta" style="margin-left:10px">of</span> <button class="btn ghost sm" data-kies="hold">bewust niet — on hold</button></td></tr>` : '';
    return `<tr class="fin-ac-rij${n ? ' gedimd' : ''}" data-iid="${H(x.i.id)}" data-pid="${H(x.p.id)}" data-groep="${groep}">
      <td class="num">${bewerkbaar(x) ? `<span class="fin-ed" data-ed="datum" title="Klik om de datum te wijzigen">${datumCel}</span>` : datumCel}</td>
      <td class="fin-ac-wie">${H(klantLabel(x.p.klant))} <span class="meta">· ${H(tekst(x.p.kandidaat))}</span>${x.p.gestopt_op ? ` ${chip('gestopt ' + dKort(x.p.gestopt_op), 'amber')}` : ''}</td>
      <td class="num meta">${H(x.p.id)} t${H(tekst(x.i.termijn_nr,'?'))}</td>
      <td class="n num">${bewerkbaar(x) ? `<span class="fin-ed" data-ed="bedrag" title="Klik om het bedrag te wijzigen">${eur(bedragVan(x.i))}</span>` : eur(bedragVan(x.i))}</td>
      <td>${n ? `<span class="pos">✓ ${H(n.tekst)}</span>` : status(x)}</td>
      <td class="n" style="white-space:nowrap">${n ? `<button type="button" class="lnk" data-ac="ongedaan">ongedaan</button>` : knop(x) + holdKnop(x)}</td>
    </tr>${keuze}`;
  };

  const zoekt = !!z;
  const blokken = ACTIE_GROEPEN.map(gr => {
    const rijen = regelsVan(gr.k);
    const som = rijen.reduce((s,x) => s + bedragVan(x.i), 0);
    const open = gr.open || _actieOpen.has(gr.k) || (zoekt && rijen.length);
    if(!rijen.length && !gr.open) return '';
    const eerst = rijen.find(x => x.datum);
    const vooruit = ['wacht','komend','later'].includes(gr.k);
    const sub = gr.k === 'nu' ? ` · t/m ${H(dKort(d.zondag))}`
      : gr.k === 'laat' ? ' · langst open bovenaan'
      : gr.k === 'hold' ? ' · ' + H([...new Set(rijen.map(x => tekst(x.p.kandidaat) + ' (' + x.hold.reden + ')'))].join(', '))
      : (!open && eerst && vooruit) ? ` · eerstvolgende ${H(dKort(eerst.datum))}` : '';
    const kop = `<tr class="fin-ac-grp${gr.rand ? ' ' + gr.rand : ''}" data-grp="${gr.k}">
      <td colspan="4">${gr.open ? '' : (open ? '▾ ' : '▸ ')}<b>${H(gr.lbl)}</b><span class="meta">${sub}</span></td>
      <td colspan="2" class="n meta">${rijen.length} · ${eur(som)}</td></tr>`;
    if(!rijen.length) return kop + `<tr><td colspan="6" class="meta fin-ac-leeg">✓ niets ${gr.k === 'nu' ? 'te factureren t/m ' + H(dKort(d.zondag)) : 'te laat'}</td></tr>`;
    return kop + (open ? rijen.map(x => regel(x, gr.k)).join('') : '');
  }).join('');

  el.innerHTML = `
    <div class="fin-ac">
      <div class="fin-ac-top">
        <div class="searchbox"><input type="search" id="fin_ac_zoek" placeholder="Zoek klant, kandidaat of P-nummer" value="${H(_actieZoek)}"></div>
        <span class="meta">Binnen 8 weken verwacht <b class="num">${eur(vb.zeker)}</b> incl. btw${vb.concept ? ` (+ ${eur(vb.concept)} concept)` : ''}
          · te laat + gemist <b class="num${vb.achter ? ' neg' : ''}">${eur(vb.achter)}</b>
          · <button type="button" class="lnk" id="fin_ac_kas">kas per week</button></span>
      </div>
      ${(() => { const sb = stopTeBeslissen(f); if(!sb.length) return '';
        return `<div class="card" style="margin-bottom:10px;border-color:var(--amber,#d9a441)"><div class="tblwrap" style="border:none"><table class="tbl fin-ac-tbl"><tbody>
          <tr class="fin-ac-grp"><td colspan="4"><b>Gestopt — kies wat je factureert</b><span class="meta"> · factureren, bedrag aanpassen, laten vallen of on hold</span></td>
            <td colspan="2" class="n meta">${sb.length}</td></tr>
          ${sb.map(p => { const o = instOf(f, p.id).filter(i => i.status === 'te_factureren' || i.status === 'gefactureerd');
            return `<tr><td class="num">${H(dKort(p.gestopt_op))}</td>
              <td class="fin-ac-wie">${H(klantLabel(p.klant))} <span class="meta">· ${H(tekst(p.kandidaat))}</span></td>
              <td class="num meta">${H(p.id)}</td>
              <td class="n num">${eur(o.reduce((s2,i) => s2 + bedragVan(i), 0))}</td>
              <td><span class="meta">${o.length} open termijn${o.length === 1 ? '' : 'en'}${o.some(i => i.status === 'gefactureerd') ? ' · waarvan al gefactureerd' : ''}</span></td>
              <td class="n"><button class="btn sm" data-stopkies="${H(p.id)}">Kiezen…</button></td></tr>`; }).join('')}
        </tbody></table></div></div>`; })()}
      ${!d.klopt || d.over.length ? `<div class="note err" style="margin-bottom:10px">${d.over.length} termijn${d.over.length === 1 ? '' : 'en'} niet in te delen
        (geen plaatsing of onbekende status) — controleer: ${H(d.over.map(i => (i.placement_id||'?') + ' t' + (i.termijn_nr||'?')).join(', '))}</div>` : ''}
      <div class="card"><div class="tblwrap" style="border:none"><table class="tbl fin-ac-tbl">
        <colgroup><col style="width:84px"><col><col style="width:100px"><col style="width:104px"><col style="width:200px"><col style="width:220px"></colgroup>
        <tbody>${blokken}</tbody></table></div></div>
    </div>`;

  const opnieuw = () => actieLijst(el, f, herteken);
  const zoek = el.querySelector('#fin_ac_zoek');
  zoek.addEventListener('input', CRM.debounce(e => { _actieZoek = e.target.value; opnieuw();
    const z2 = el.querySelector('#fin_ac_zoek'); if(z2){ z2.focus(); z2.setSelectionRange(z2.value.length, z2.value.length); } }, 250));
  el.querySelector('#fin_ac_kas').onclick = () => { _tab = 'geld'; CRM.render(); };
  el.querySelectorAll('[data-stopkies]').forEach(b => b.onclick = () => {
    const p = f.placements.find(x => x.id === b.dataset.stopkies);
    if(p) stopVenster(f, p, () => { _netAf.clear(); herteken(); });
  });
  el.querySelectorAll('.fin-ac-grp').forEach(tr => tr.onclick = () => {
    const k = tr.dataset.grp, gr = ACTIE_GROEPEN.find(x => x.k === k);
    if(gr.open) return;
    if(_actieOpen.has(k)) _actieOpen.delete(k); else _actieOpen.add(k);
    opnieuw();
  });

  const vind = tr => {
    const id = tr.dataset.iid;
    const n = [..._netAf.entries()].find(([k]) => String(k) === id);
    if(n) return n[1].x;
    for(const k of Object.keys(d.g)){ const x = d.g[k].find(y => String(y.i.id) === id); if(x) return x; }
    return null;
  };
  const afvinken = async (x, status, datum, groep, knopEl) => {
    const vorige = {status: x.i.status, factuurdatum: x.i.factuurdatum ?? null, betaaldatum: x.i.betaaldatum ?? null};
    await finDoe(knopEl, () => markeer(x.i, status, datum), null, ok => {
      if(ok){
        const tekstNa = status === 'betaald' ? 'betaald' : 'gefactureerd · vervalt ' + dKort(vervaldatum(x.i, x.p));
        _netAf.set(x.i.id, {groep, vorige, tekst: tekstNa, x});
      }
      _gemistOpen = null; opnieuw();
    });
  };

  el.querySelectorAll('.fin-ac-rij').forEach(tr => {
    const x = vind(tr); if(!x) return;
    tr.onclick = e => {
      if(e.target.closest('button, input, .fin-ed')) return;
      plPaneel(f, x.p.id, () => { _netAf.clear(); herteken(); });
    };
    tr.querySelectorAll('[data-ac]').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const a = b.dataset.ac;
      if(a === 'paneel') return plPaneel(f, x.p.id, () => { _netAf.clear(); herteken(); });
      if(a === 'hervat') return finDoe(b, () => zetHold(f, x.p, null), `${tekst(x.p.kandidaat)} hervat`, () => opnieuw());
      if(a === 'hold') return vraagHold(f, x.p, opnieuw);
      if(a === 'stop') return stopVenster(f, x.p, () => { _netAf.clear(); herteken(); });
      if(a === 'vallen'){
        if(!await CRM.bevestig(`Termijn ${x.i.termijn_nr} van ${tekst(x.p.kandidaat)} laten vallen?`,
          `${eur(bedragVan(x.i))} wordt niet gefactureerd. Terugzetten kan in het plaatsingspaneel (herstellen).`, {knop:'Laten vallen'})) return;
        return finDoe(b, () => markeer(x.i, 'vervallen'), `Termijn ${x.i.termijn_nr} laten vallen`, () => opnieuw());
      }
      if(a === 'paid') return afvinken(x, 'betaald', null, tr.dataset.groep, b);
      if(a === 'fact'){
        /* Gemist: de echte factuurdatum kiezen, niet stil "vandaag". */
        if(x.dagen && x.i.status === 'te_factureren'){ _gemistOpen = x.i.id; return opnieuw(); }
        return afvinken(x, 'gefactureerd', null, tr.dataset.groep, b);
      }
      if(a === 'ongedaan'){
        const n = _netAf.get(x.i.id); if(!n) return;
        return finDoe(b, () => instWijzig(x.i, n.vorige), 'Teruggezet', ok => { if(ok) _netAf.delete(x.i.id); opnieuw(); });
      }
    });
    tr.querySelectorAll('.fin-ed').forEach(sp => sp.onclick = e => {
      e.stopPropagation();
      regelBewerken(sp, f, x.p, x.i, sp.dataset.ed, opnieuw);
    });
  });

  /* Datumkeuze voor een gemiste termijn. */
  const keuze = el.querySelector('.fin-ac-keuze');
  if(keuze){
    const x = vind(keuze.previousElementSibling);
    const vvEl = keuze.querySelector('.fin-ac-vv');
    const toonVv = iso => { vvEl.textContent = iso ? '→ vervalt ' + dKort(addDays(iso, getal(x.p.betaaltermijn_dgn) || 14)) : ''; };
    const inp = keuze.querySelector('.fin-ac-datum');
    inp.oninput = () => toonVv(inp.value);
    inp.onchange = () => {
      if(!inp.value) return;
      if(inp.value > t) return CRM.toast('Een factuurdatum kan niet in de toekomst liggen', 'err');
      afvinken(x, 'gefactureerd', inp.value, keuze.previousElementSibling.dataset.groep, null);
    };
    keuze.querySelectorAll('[data-kies]').forEach(b => {
      b.onmouseenter = () => !['annuleer','hold'].includes(b.dataset.kies) && toonVv(b.dataset.kies);
      b.onclick = () => {
        if(b.dataset.kies === 'annuleer'){ _gemistOpen = null; return opnieuw(); }
        if(b.dataset.kies === 'hold'){ _gemistOpen = null; return vraagHold(f, x.p, opnieuw); }
        afvinken(x, 'gefactureerd', b.dataset.kies, keuze.previousElementSibling.dataset.groep, b);
      };
    });
  }
}

/* ─── Datum of bedrag in de regel zelf aanpassen ────────────────────
   "Termijnen aanpassen moet makkelijker" (Tjeerd, 27 okt 2026): klik op
   de datum of het bedrag, typ, Enter. Bij een andere datum volgt één
   vraag: de latere open termijnen van deze plaatsing ook opschuiven?  */
function regelBewerken(cel, f, p, inst, veld, klaar){
  const oud = veld === 'datum' ? (inst.geplande_datum || '') : bedragVan(inst);
  cel.innerHTML = veld === 'datum'
    ? `<input type="date" class="fin-ed-in" value="${H(oud)}">`
    : `<input type="number" step="0.01" class="fin-ed-in" value="${H(oud)}" style="text-align:right">`;
  const inp = cel.querySelector('input');
  inp.focus(); if(inp.select) try{ inp.select(); }catch(e){}
  let klaarGezet = false;
  const opslaan = async () => {
    if(klaarGezet) return; klaarGezet = true;
    const nieuw = veld === 'datum' ? inp.value : getal(inp.value);
    if(nieuw === '' || nieuw == null || nieuw === oud) return klaar();
    if(veld === 'bedrag'){
      return finDoe(null, () => instWijzig(inst, {bedrag_excl: nieuw}), 'Bedrag aangepast', () => klaar());
    }
    const latere = instOf(f, p.id).filter(i => getal(i.termijn_nr) > getal(inst.termijn_nr)
      && i.status === 'te_factureren' && i.geplande_datum);
    const schuif = latere.length && oud ? await schuifVraag(latere, oud, nieuw) : false;
    if(schuif === null) return klaar();
    finDoe(null, async () => {
      await instWijzig(inst, {geplande_datum: nieuw});
      if(schuif) for(const i of latere) await instWijzig(i, {geplande_datum: verschuif(i.geplande_datum, oud, nieuw)});
      if(getal(inst.termijn_nr) === 1) await plWijzig(p, {eerste_factuurdatum: nieuw});
    }, schuif ? `Datum aangepast — ${latere.length} latere termijn${latere.length === 1 ? '' : 'en'} mee` : 'Datum aangepast', () => klaar());
  };
  inp.onkeydown = e => { if(e.key === 'Enter') opslaan(); if(e.key === 'Escape'){ klaarGezet = true; klaar(); } };
  inp.onblur = () => setTimeout(opslaan, 120);
  inp.onclick = e => e.stopPropagation();
}

/* Zelfde verschuiving voor de latere termijnen: blijft de dag van de
   maand gelijk (24 sep → 24 okt), dan hele maanden — anders dagen. */
function verschuif(iso, oud, nieuw){
  if(String(oud).slice(8,10) === String(nieuw).slice(8,10)){
    const mnd = (+nieuw.slice(0,4) - +oud.slice(0,4)) * 12 + (+nieuw.slice(5,7) - +oud.slice(5,7));
    return addMonths(iso, mnd);
  }
  return addDays(iso, daysBetween(oud, nieuw));
}

/* Ja / Nee / Annuleren — CRM.bevestig kent maar twee knoppen. */
function schuifVraag(latere, oud, nieuw){
  return new Promise(res => {
    const voorbeeld = latere.slice(0,4).map(i => `${dKort(i.geplande_datum)} → ${dKort(verschuif(i.geplande_datum, oud, nieuw))}`).join(' · ');
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Latere termijnen ook opschuiven?</div></div>
      <div class="modal-b"><p class="sub" style="margin:0">${latere.length} latere open termijn${latere.length === 1 ? '' : 'en'}:
        ${H(voorbeeld)}${latere.length > 4 ? ' …' : ''}</p></div>
      <div class="modal-f"><button class="btn ghost" id="sv_stop">Annuleren</button><span class="spacer"></span>
        <button class="btn ghost" id="sv_nee">Nee, alleen deze</button><button class="btn" id="sv_ja">Ja, schuif mee</button></div>`, {
      onClose(){ res(null); },
      onOpen(m){
        const kies = v => { CRM.modal._onClose = null; CRM.modal.close(); res(v); };
        m.querySelector('#sv_ja').onclick = () => kies(true);
        m.querySelector('#sv_nee').onclick = () => kies(false);
        m.querySelector('#sv_stop').onclick = () => kies(null);
      }});
  });
}

/* Na een nacht met het tabblad open: bij terugkomen opnieuw indelen als
   de datum veranderd is, zodat een termijn van gisteren als "gemist"
   bovenaan staat. */
let _finDag = null;
document.addEventListener('visibilitychange', () => {
  if(document.hidden || !_finDag || _finDag === todayISO()) return;
  if(String(location.hash).includes('finance')){ _netAf.clear(); CRM.render(); }
});

/* ─── Weergave "Per maand" (was de Facturatie-tab) ──────────────
   Hetzelfde termijnschema, gegroepeerd per maand of per klant, met de
   afvinkknoppen per regel. De cijferbalk staat al boven in Plaatsingen. */
function facturatieLijst(el, f, herteken){
  el.classList.add('fin-pm');

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
      const hold = opHold(f, p.id) && (i.status === 'te_factureren' || i.status === 'gefactureerd');
      const st = hold ? chip('on hold · ' + opHold(f, p.id).reden, 'amber') : {
        te_factureren: missed ? chip('GEMIST','red') : chip('te factureren','amber'),
        gefactureerd:  late ? chip(late + ' dgn te laat','red') : chip('wacht op betaling','blue'),
        betaald:       chip('betaald','green'),
        vervallen:     chip('vervallen','red')
      }[i.status] || chip(i.status || '—');
      const knop = hold ? '' : i.status==='te_factureren' ? `<button class="btn sm" data-fa="fact" data-iid="${H(i.id)}">Gefactureerd ✓</button>`
                 : i.status==='gefactureerd'  ? `<button class="btn sm" data-fa="paid" data-iid="${H(i.id)}">Betaald ✓</button>` : '';
      return `<tr class="clickable" data-pid="${H(p.id)}"${i.status==='vervallen' ? ' style="opacity:.55"' : ''}>
        <td class="num">${i.geplande_datum ? H(dKort(i.geplande_datum)) : '—'}</td>
        <td><b>${H(tekst(p.id))}</b> <span class="meta">t${H(tekst(i.termijn_nr, '?'))}</span></td>
        <td>${H(tekst(p.kandidaat))}${_factGroep === 'klant' ? '' : `<div class="rowsub">${H(klantLabel(p.klant))}</div>`}</td>
        <td class="n num">${eur(bedragVan(i))}</td>
        <td class="n num meta">${eur(bedragVan(i)*btw)}</td>
        <td class="n num">${vv && i.status!=='betaald' && i.status!=='vervallen' ? H(dKort(vv)) : '—'}</td>
        <td>${st}</td><td class="n" style="white-space:nowrap">${knop}</td></tr>`;
    }).join('');
    return kaart(titel, tabel(
      '<th class="n">Gepland</th><th>Termijn</th><th>Kandidaat</th><th class="n">Excl. btw</th>'
      + '<th class="n">Incl. btw</th><th class="n">Vervalt</th><th>Status</th><th></th>', rows),
      {plat:true, acties:`<span class="meta">${xs.length} termijn(en) · ${eur(totExcl)} excl. · ${eur(totExcl*btw)} incl. btw</span>`});
  }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-h">
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
      </div>
      <div class="card-f"><span class="meta">${items.length} termijn(en) · ${eur(items.reduce((s,x) => s + bedragVan(x.i), 0))} excl. btw</span></div>
    </div>

    <div class="stack">${blokken || CRM.ui.leeg('Niets gevonden met dit filter','Kies een andere status of klant.')}</div>`;

  const stSel = el.querySelector('#fin_fact_status'); stSel.value = _factStatus;
  const klSel = el.querySelector('#fin_fact_klant'); klSel.value = _factKlant;
  stSel.onchange = e => { _factStatus = e.target.value; facturatieLijst(el, f, herteken); };
  klSel.onchange = e => { _factKlant = e.target.value; facturatieLijst(el, f, herteken); };
  /* Afvinken kan hier rechtstreeks; een klik op de rij zelf opent de
     plaatsing. De knop houdt zijn klik voor zichzelf (stopPropagation op de
     knop zelf — niet op de cel, dat was precies de fout in de finance-app
     waardoor deze knoppen daar niets deden). */
  el.querySelectorAll('[data-fa]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const inst = f.installments.find(i => String(i.id) === b.dataset.iid); if(!inst) return;
    finDoe(b, () => markeer(inst, b.dataset.fa === 'fact' ? 'gefactureerd' : 'betaald'),
      b.dataset.fa === 'fact' ? `Termijn ${inst.termijn_nr} gefactureerd` : `Termijn ${inst.termijn_nr} betaald`, herteken);
  });
  el.querySelectorAll('tr[data-pid]').forEach(tr => tr.onclick = () => plPaneel(f, tr.dataset.pid, herteken));
}

/* ═══ TAB: FLEX ════════════════════════════════════════════════
   Wat levert flex op, wie loopt er, en wanneer mag de klant iemand
   kosteloos overnemen. De tariefopbouw-analyse en de staafgrafiek zijn
   eruit (27 okt 2026, "niet te groot"); de week-per-persoon-tabel blijft,
   want dat is de vraag die elke week speelt.                         */
function tabFlex(el, f, compact){
  if(f.demo){ el.innerHTML = demoLeeg('Geen flex-gegevens in demo',
    'Hier zie je normaal de flexkrachten met marge per uur, gewerkte uren, overname en de wekelijkse marge van Pronkert.'); return; }

  const st = flexPlStats(f), fx = flexStats(f);
  const pwk = flexPerWeekKracht(f, 8);
  const knopInlezen = '<button class="btn ghost sm" id="fin_marge_in">Margefactuur inlezen</button>';

  /* Bijna aan de kosteloze overname: dáár stopt de marge. Onder de 15% van
     de afgesproken uren is het tijd om met de klant te praten. */
  const bijnaOver = st.rows.filter(r => r.resterendUren != null && r.overnameUren
    && r.resterendUren / r.overnameUren <= 0.15);

  const rij = r => `<tr>
      <td><b>${H(tekst(r.f.kandidaat))}</b><div class="rowsub">${H(klantLabel(r.f.klant))}${r.f.concept ? ' · nog aanvullen' : ''}</div></td>
      <td class="n num">${r.margePerUur != null ? eur2(r.margePerUur) : '<span class="meta">factor?</span>'}</td>
      <td class="n num">${r.gewerkteUren != null ? Math.round(r.gewerkteUren) + ' u' : '—'}</td>
      <td class="n">${r.verdiend != null ? `<span class="num pos">${eur(r.verdiend)}</span>` : '<span class="meta">—</span>'}</td>
      <td class="n">${r.resterendUren != null ? `<span class="num">nog ${Math.round(r.resterendUren)} u</span>`
        : '<span class="meta">—</span>'}</td>
    </tr>`;

  const perWeek = () => {
    if(!pwk.rijen.length) return kaart('Per week', CRM.ui.leeg('Nog geen margefacturen ingelezen',
      'De weekroutine leest ze elke vrijdag om 17:00 uit de mail. Je kunt er ook zelf een inlezen.'), {acties: knopInlezen});
    const cel = c => c ? `<span class="num">${eur(c.marge)}</span><div class="rowsub num">${num(c.uren,1)} u</div>`
                       : '<span class="meta">—</span>';
    const kop = '<th>Week</th>' + pwk.kolommen.map(k => `<th class="n">${H(k.naam)}</th>`).join('') + '<th class="n">Totaal</th>';
    const rijen = pwk.rijen.map(w => `<tr><td class="num">${H(dKort(w.week))}</td>
      ${pwk.kolommen.map(k => `<td class="n">${cel(w.per.get(k.sleutel))}</td>`).join('')}
      <td class="n"><b class="num">${eur(w.bedrag)}</b></td></tr>`).join('');
    return kaart('Per week', tabel(kop, rijen), {plat:true, acties: knopInlezen});
  };

  /* Flex-marge naast wat het bedrijf kost (Tjeerd, 27 okt 2026: "wat
     we per maand binnenkrijgen en wat eruit gaat, zodat ik kan sturen").
     Kosten = Nmbrs waar bekend, anders de begroting voor die maand. */
  const kostenVan = mk7 => { const n = nmbrsMaanden(f).find(x => x.mk7 === mk7 && !x.lopend);
    return n ? {b: n.kosten, bron: 'Nmbrs'} : {b: budgetVoorMaand(f, mk7 + '-01'), bron: 'begroting'}; };
  const kostenNu = kostenVan(String(addMonths(monthKey(todayISO()), 1)).slice(0,7)).b || budgetVoorMaand(f, monthKey(todayISO()));
  const dekt = kostenNu ? fx.maandRunRate / kostenNu : null;
  const perKracht = margePerFlexkracht(f);
  const tekortFlex = Math.max(0, kostenNu - fx.maandRunRate);
  /* Overnamedatum uit de kasstroom (met gemeten realisatie en feestdagen),
     zodat portefeuille en kalender dezelfde datum tonen. */
  const kasEinde = new Map(flexKasstroom(f).personen.filter(p => p.einde).map(p => [p.naam, p.einde]));
  const pf = flexPortefeuille(f).map(r => kasEinde.has(r.naam) ? {...r, einde: kasEinde.get(r.naam)} : r);
  const pfOk = pf.filter(r => r.compleet), pfMist = pf.filter(r => !r.compleet);
  const nogTe = pfOk.reduce((s2,r) => s2 + r.rest, 0);
  const laatsteEinde = pfOk.reduce((m2,r) => (r.einde || '') > m2 ? r.einde : m2, '');
  const maanden = [5,4,3,2,1,0].map(i => String(addMonths(monthKey(todayISO()), -i)).slice(0,7));
  const maandRijen = maanden.map(mk7 => {
    const marge = binnenMaand(f, mk7).flexEcht, k = kostenVan(mk7), lopendM = mk7 === todayISO().slice(0,7);
    return `<tr><td><b>${H(mkLabel(mk7 + '-01'))}</b>${lopendM ? ' <span class="meta">loopt</span>' : ''}</td>
      <td class="n num pos">${eur(marge)}</td>
      <td class="n num">${eur(k.b)} <span class="meta">${k.bron}</span></td>
      <td class="n"><b class="num">${k.b ? pct0(marge / k.b) : '—'}</b></td></tr>`;
  }).join('');

  el.innerHTML = `
    ${compact ? '' : strip([
      ['Flex per maand', eur(fx.maandRunRate), 'gem. laatste 4 weken × 52 ÷ 12'],
      ['Dekt van je kosten', dekt == null ? '—' : pct0(dekt), `van ${eur(kostenNu)} per maand`],
      ['Flexkrachten', `<span class="num">${pf.length}</span>`, `≈ ${eur(perKracht)} marge per kracht per maand`],
      ['Nog te verdienen', eur(nogTe), pfMist.length ? `<span class="neg">${pfMist.length} zonder volledige gegevens — niet meegeteld</span>`
        : pfOk.length ? `potentieel, t/m de overnames (${H(mkLabel(laatsteEinde))})` : 'geen lopende flexkrachten']
    ])}
    ${bijnaOver.length ? `<div class="note warn" style="margin-bottom:14px"><b>Bijna kosteloos over te nemen:</b>
      ${bijnaOver.map(r => `${H(tekst(r.f.kandidaat))} bij ${H(klantLabel(r.f.klant))} (nog ${Math.round(r.resterendUren)} u)`).join(' · ')}.
      Nu is het moment voor een vervolgafspraak.</div>` : ''}
    <div class="stack">
      ${(() => { const los = factuurZonderPortefeuille(f, pf); const afw = pf.map(r => ({...r, afwijking: factorAfwijking(f, r)})).filter(r => r.afwijking.length);
        if(!los.length && !afw.length) return '';
        return kaart('Controle tegen de margefacturen',
          los.map(k => `<div class="fin-todo urg"><div class="t"><b>${H(k.naam)}</b> <span class="meta">· ${H(k.klant || '')}</span>
              <div class="w">Werkt volgens de margefactuur (laatst week van ${H(dKort(k.laatste))}, ${eur2(k.margePerUur)}/u), maar staat niet in je portefeuille — zet hem op het bord als Flex (Contract getekend of Gestart).</div></div></div>`).join('')
          + afw.map(r => `<div class="fin-todo urg"><div class="t"><b>${H(r.naam)}</b> <span class="meta">· ${H(klantLabel(r.klant))}</span>
              <div class="w">${H(r.afwijking.join(' · '))}. Controleer uurloon, factuurtarief en de afspraak Uitzenden.</div></div>
              ${r.mist.some(m => m.waar === 'klant') || r.afwijking.some(x => /afspraak|percentage/.test(x)) ? `<button class="btn ghost sm" data-naarklant="${H(r.klantId)}">Klantkaart</button>` : ''}
              ${r.afwijking.some(x => /factureert Pronkert/.test(x)) ? `<button class="btn sm" data-factorok="${H(r.naam)}" title="Factor gecontroleerd — melding weg zolang deze factor blijft">Klopt</button>` : ''}
              ${r.cid ? `<button class="btn ghost sm" data-naarkand="${H(r.cid)}">Kandidaatkaart</button>` : ''}</div>`).join(''),
          {plat:true});
      })()}
      ${false ? `<div class="note info" style="margin-bottom:12px">
          Overname-uren per klant vastleggen: ${H(Object.entries(OVERNAME_TJEERD).map(([k,u]) => k + ' ' + u).join(' · '))}.
          <button class="btn sm" id="fin_overname_vast" style="margin-left:8px">Vastleggen</button></div>` : ''}
      ${pfMist.length ? kaart(`Voor een exacte marge mist nog (${pfMist.length})`,
        pfMist.map(r => `<div class="fin-todo urg"><div class="t"><b>${H(r.naam)}</b> <span class="meta">· ${H(klantLabel(r.klant))}</span>
            <div class="w">${H(r.mist.filter(m => !m.klein).map(m => m.wat).join(' · ') || r.mist.map(m => m.wat).join(' · '))}</div></div>
          <button class="btn sm" data-flexvul="${H(r.naam)}">Aanvullen</button></div>`).join(''),
        {plat:true, voet:'Zonder deze gegevens rekent het CRM niets — ze tellen niet mee in de prognose. Met Aanvullen vul je startdatum, salaris, uren, tarief en looptijd hier in; de inkoopfactor rekent het CRM zelf uit (collega bij dezelfde klant, anders de kostprijstool met de CAO van de klant).'}) : ''}
      ${portefeuilleKaart(f, pf)}
      ${flexKalenderKaart(f)}
      ${gestoptKaart(f)}
      ${compact ? '' : kaart('Flex binnen naast je kosten', tabel('<th>Maand</th><th class="n">Uitbetaald door Pronkert</th><th class="n">Kosten bedrijf</th><th class="n">Flex dekt</th>', maandRijen),
        {plat:true, voet:`Wat Pronkert in die maand uitbetaalt: elke margefactuur ±${flexKasstroom(f).termijn} dagen na de factuurdatum. Verdiend dit jaar (werkweken): ${eur(fx.ytd)}.`})}
      ${compact ? '' : perWeek()}
    </div>`;

  el.querySelectorAll('#fin_marge_in').forEach(b => b.onclick = () => openMargeImport(f));
  const ov = el.querySelector('#fin_overname_vast');
  if(ov) ov.onclick = () => finDoe(ov, () => overnameBewaren(f, Object.assign({}, OVERNAME_TJEERD)),
    'Overname-uren per klant vastgelegd', ok => ok && tabFlex(el, f, compact));
  el.querySelectorAll('[data-naarkand]').forEach(b => b.onclick = () => CRM.ga('kandidaten', {id: b.dataset.naarkand}));
  el.querySelectorAll('[data-factorok]').forEach(b => b.onclick = () => {
    const r = flexPortefeuille(f).find(x => x.naam === b.dataset.factorok);
    if(r) finDoe(b, () => zetFactorOk(f, r), `Factor ${num(r.klantfactor, 2)} voor ${r.naam} goedgekeurd`, ok => ok && tabFlex(el, f, compact));
  });
  el.querySelectorAll('[data-flexvul]').forEach(b => b.onclick = () => {
    const r = flexPortefeuille(f).find(x => x.naam === b.dataset.flexvul);
    if(r) flexAanvullen(f, r, () => CRM.render());
  });
  el.querySelectorAll('[data-naarklant]').forEach(b => b.onclick = () => CRM.ga('klanten', {id: b.dataset.naarklant}));
}

/* ─── Margefactuur inlezen ──────────────────────────────────────
   Normaal doet de weekroutine dit vanzelf (elke vrijdag 17:00, uit de mail). Dit
   scherm is de terugval: open de PDF, selecteer alles, plak het hier.

   De tekst gaat naar dezelfde Edge Function die de routine gebruikt, zodat het
   voorbeeld nooit iets anders kan tonen dan wat er wordt opgeslagen. Eerst een
   droogloop — je ziet per week en per persoon wat eruit komt — en pas na jouw
   akkoord wordt er geschreven. Zelfde volgorde als de overeenkomst-lezer op de
   klantkaart en de cv-lezer.                                              */
async function margeFunctie(body){
  const {data:{session}} = await CRM.sb.auth.getSession();
  if(!session) throw new Error('geen actieve sessie — log opnieuw in');
  /* De functie heet in Supabase `dynamic-worker` (naam die het dashboard zelf
     verzon bij deploy-via-editor); de code staat in supabase/functions/pronkert-marge/. */
  const resp = await fetch(SUPABASE_URL + '/functions/v1/dynamic-worker', {
    method:'POST',
    headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token},
    body: JSON.stringify(body)
  });
  const uit = await resp.json().catch(() => ({}));
  if(resp.status === 404 || resp.status === 503)
    throw Object.assign(new Error('nog niet gedeployed'), {setup:true});
  if(!resp.ok){
    /* uit.error kan een string of een object zijn — nooit rechtstreeks in een
       melding plakken, anders leest de gebruiker "[object Object]". */
    const reden = typeof uit.error === 'string' ? uit.error : (uit.error && uit.error.message) || '';
    throw new Error(reden || ('de functie gaf status ' + resp.status));
  }
  return uit;
}

function margeVoorbeeldHtml(uit){
  if(uit.waarschuwing) return `<div class="note err">${H(uit.waarschuwing)}</div>`;
  const weken = uit.weken || [];
  if(!weken.length) return `<div class="note warn">Geen factuurregels herkend. Weet je zeker dat je de héle tekst van de margefactuur hebt geplakt?</div>`;
  return `<div class="note ok" style="margin-bottom:12px">
      Factuur <b>${H(uit.factuur || '—')}</b>${uit.factuurdatum ? ' van ' + H(dOf(uit.factuurdatum)) : ''} —
      ${uit.aantal_regels || 0} regels, totaal <b>${eur(uit.totaal)}</b> marge.
      De optelling van de regels komt exact uit op het factuurtotaal.
    </div>
    ${weken.map(w => `<div style="margin-bottom:10px">
      <div><b>Week ${H(String(w.weeknr))}</b> <span class="meta">(maandag ${H(dOf(w.week))})</span> —
        <b class="num pos">${eur(w.bedrag)}</b> <span class="meta num">over ${num(w.uren,2)} uur</span></div>
      <table class="tbl" style="margin-top:6px"><tbody>
        ${(w.krachten||[]).map(k => `<tr>
          <td>${H(k.roepnaam || k.naam)} <span class="meta">${H(k.functie||'')}</span></td>
          <td class="n num">${num(k.uren,2)} u</td>
          <td class="n num pos">${eur(k.marge)}</td>
          <td class="n meta num">${k.marge_per_uur != null ? eur2(k.marge_per_uur) + '/uur' : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>`).join('')}`;
}

function openMargeImport(f){
  if(CRM.demo) return CRM.toast('In demo-modus lezen we geen echte facturen in');
  let gelezen = null;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Margefactuur van Pronkert inlezen</div></div>
    <div class="modal-b">
      <p class="sub" style="margin:0 0 10px">Open de PDF, selecteer alles (⌘A) en plak het hieronder.
        Je ziet eerst wat eruit komt; opslaan doe je daarna zelf.
        Dezelfde factuur twee keer inlezen kan geen kwaad — de cijfers worden opnieuw berekend, niet opgeteld.</p>
      <textarea id="fin_marge_ta" rows="7" spellcheck="false" placeholder="Plak hier de tekst van de margefactuur…"></textarea>
      <div id="fin_marge_uit" style="margin-top:12px"></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn ghost" id="fin_marge_lees">Lezen</button>
      <button class="btn" id="fin_marge_op" disabled>Opslaan</button>
    </div>`, {
      onOpen(m){
        const ta = m.querySelector('#fin_marge_ta'), uitEl = m.querySelector('#fin_marge_uit');
        const opslaan = m.querySelector('#fin_marge_op'), lezen = m.querySelector('#fin_marge_lees');
        setTimeout(() => ta && ta.focus(), 60);

        const melding = (kl, tekst) => { uitEl.innerHTML = `<div class="note ${kl}">${H(tekst)}</div>`; };
        const nietGedeployed = () => melding('warn',
          'De functie pronkert-marge staat nog niet in Supabase. Eenmalig deployen — zie supabase/functions/pronkert-marge.');

        lezen.onclick = async () => {
          const tekst = (ta.value || '').trim();
          if(tekst.length < 50) return melding('warn','Plak eerst de tekst van de factuur.');
          lezen.disabled = true; uitEl.innerHTML = CRM.ui.laden();
          try{
            gelezen = await margeFunctie({tekst, droog:true});
            uitEl.innerHTML = margeVoorbeeldHtml(gelezen);
            opslaan.disabled = !!gelezen.waarschuwing || !(gelezen.weken||[]).length;
          }catch(e){
            gelezen = null; opslaan.disabled = true;
            if(e.setup) nietGedeployed(); else melding('err','Lezen mislukt: ' + (e.message||''));
          }
          lezen.disabled = false;
        };

        opslaan.onclick = async () => {
          if(!gelezen) return;
          opslaan.disabled = true;
          try{
            const uit = await margeFunctie({tekst: (ta.value||'').trim()});
            CRM.modal.close();
            const n = (uit.weken||[]).length, onb = (uit.onbekend||[]).length;
            CRM.toast(`${n} ${n===1?'week':'weken'} bijgewerkt` +
              (onb ? ` — ${onb} flexkracht${onb===1?'':'en'} nog niet gekoppeld` : ''), 'ok');
            await finLaad(true); CRM.render();
          }catch(e){
            opslaan.disabled = false;
            if(e.setup) nietGedeployed(); else CRM.fout('Opslaan mislukt', e);
          }
        };
      }
    });
}

/* ═══════════════════════════════════════════════════════════════
   BETAALD AAN META — de bank naast wat Meta zelf rapporteert
   ───────────────────────────────────────────────────────────────
   Meta rapporteert zijn eigen uitgaven en het CRM toont die in
   Marketing. Of die cijfers kloppen, weet je pas als je ze naast de
   bankrekening legt: wat is er écht afgeschreven?

   Waarom niet uit Yuki? De Yuki-koppeling (yuki-sync) haalt per
   afgesloten maand één regel op — "Werkelijk totaal (Yuki)" in
   fin_costs_actual, de som van álle kostenrekeningen. Daar zit geen
   uitsplitsing per leverancier in, dus daar valt Meta niet uit te
   halen. De enige bron met leveranciersnamen is fin_bank_tx.

   Privacy: fin_bank_tx staat op Tjeerds e-mailadres afgeschermd en
   dat blijft zo — daar staat élke banktransactie in. Alleen het
   MAANDTOTAAL gaat naar mkt_meta_betaald, dat het team wél mag lezen.
   Zie metaRijenVoorTeam(): daar komt niets anders in dan maand,
   bedrag, aantal regels en wie het bijwerkte.
   ═══════════════════════════════════════════════════════════════ */

/* Zoektermen. Bewust géén losse "meta": Ploeggenoten werft voor
   productie en industrie, dus "Metaalunie", "Metaal & Techniek" en
   "metaalbewerking" staan gewoon op het afschrift. Aanpasbaar via de
   knop Zoektermen; de lijst gaat naar fin_settings.meta_zoektermen. */
const META_TERMEN_STANDAARD = [
  'meta platforms', 'meta ireland', 'meta ads',
  'facebook', 'facebk', 'fb.me/ads', 'instagram'
];
const META_SETTING = 'meta_zoektermen';

function metaTermen(f){
  const ruw = S(f, META_SETTING, null);
  const lijst = Array.isArray(ruw) ? ruw
    : (typeof ruw === 'string' ? ruw.split(/[,;\n]/) : null);
  if(!lijst) return META_TERMEN_STANDAARD.slice();
  const schoon = [...new Set(lijst.map(t => String(t==null?'':t).trim().toLowerCase()).filter(Boolean))];
  return schoon.length ? schoon : META_TERMEN_STANDAARD.slice();
}

/* Staat de term op een woordgrens? "meta" in "meta platforms" wel, in
   "metaalunie" niet. Termen met leestekens (fb.me/ads) toetsen we
   alleen aan de kant waar ze met een letter of cijfer beginnen/eindigen. */
const META_TEKEN = /[a-z0-9]/;
function opWoordgrens(hooi, term, i){
  const voor = i > 0 ? hooi[i-1] : '';
  const na   = hooi[i+term.length] || '';
  const okVoor = !META_TEKEN.test(term[0]) || !voor || !META_TEKEN.test(voor);
  const okNa   = !META_TEKEN.test(term[term.length-1]) || !na || !META_TEKEN.test(na);
  return okVoor && okNa;
}

/* Eén transactie tegen de termenlijst. Een treffer op een woordgrens
   wint van een treffer middenin een woord, zodat de melding klopt met
   de sterkste reden waarom deze regel meedoet. */
function metaMatch(tx, termen){
  const velden = [['tegenpartij', String((tx && tx.tegenpartij) || '').toLowerCase()],
                  ['omschrijving', String((tx && tx.omschrijving) || '').toLowerCase()]];
  let beste = null;
  for(const term of termen){
    if(!term) continue;
    for(const [veld, hooi] of velden){
      const i = hooi.indexOf(term);
      if(i < 0) continue;
      const treffer = {term, veld, grens: opWoordgrens(hooi, term, i)};
      if(treffer.grens) return treffer;
      if(!beste) beste = treffer;
    }
  }
  return beste;
}

/* Uitgesloten transacties — een verkeerd gematchte regel is erger dan
   een gemiste, dus je kunt er hier eentje uitzetten. Blijft lokaal:
   het is een oordeel over bankregels die niemand anders mag zien. */
const META_UIT_KEY = 'crm_fin_meta_uit';
function metaUitLijst(){
  try{ const a = JSON.parse(localStorage.getItem(META_UIT_KEY) || '[]');
       return new Set(Array.isArray(a) ? a.map(String) : []); }catch(e){ return new Set(); }
}
function metaUitBewaar(set){
  try{ localStorage.setItem(META_UIT_KEY, JSON.stringify([...set])); }catch(e){}
}
/* Stabiele sleutel: id als de import die geeft, anders de hash, anders
   de inhoud zelf — zodat een uitsluiting een herimport overleeft. */
const metaTxId = x => String(
  (x && x.id != null && x.id !== '') ? x.id :
  (x && x.hash) ? x.hash :
  [x && x.datum, x && x.bedrag, x && x.omschrijving, x && x.tegenpartij].join('|'));

/* ─── Meta-cijfers erbij laden ────────────────────────────────
   mkt_meta_stats (wat Meta zelf rapporteert) en mkt_meta_betaald
   (wat het team al te zien krijgt). Apart van finLaad(): het zijn
   marketingtabellen, en een storing daar mag het kostenscherm niet
   in de "financiële tabellen onbereikbaar"-melding duwen.          */
let _meta = null, _metaBezig = null, _metaAlles = false;
const META_LIMIET = 20000;         // ruim boven het aantal dagregels
const META_MAANDEN = 13;           // twaalf hele maanden + de lopende

async function metaLaad(force){
  if(!CRM.canSeeMoney()) return {stats:[], betaald:[], mist:[], fout:null, geenRecht:true};
  if(_meta && !force) return _meta;
  if(_metaBezig) return _metaBezig;
  if(CRM.demo){ _meta = {stats:[], betaald:[], mist:[], fout:null, demo:true}; return _meta; }

  _metaBezig = (async () => {
    const uit = {stats:[], betaald:[], mist:[], fout:null, vol:false};
    const vanaf = addMonths(monthKey(todayISO()), -(META_MAANDEN-1));
    try{
      const r = await CRM.sb.from('mkt_meta_stats').select('datum,uitgegeven')
        .gte('datum', vanaf).limit(META_LIMIET);
      if(r.error) throw r.error;
      uit.stats = r.data || [];
      uit.vol = uit.stats.length >= META_LIMIET;
    }catch(e){ uit.mist.push('mkt_meta_stats'); uit.fout = e; }
    try{
      const r = await CRM.sb.from('mkt_meta_betaald')
        .select('maand,bedrag,bron,regels,bijgewerkt,door').order('maand', {ascending:false});
      if(r.error) throw r.error;
      uit.betaald = r.data || [];
    }catch(e){ uit.mist.push('mkt_meta_betaald'); if(!uit.fout) uit.fout = e; }
    _meta = uit;
    return uit;
  })();
  try{ return await _metaBezig; }
  finally{ _metaBezig = null; }
}

/* ─── De analyse ──────────────────────────────────────────────
   Levert de gevonden bankregels én het beeld per maand. Geen enkele
   deling zonder noemer, geen maandtotaal van €0 waar simpelweg niets
   gevonden is: dat blijft null en dus een streepje op het scherm.   */
function metaAnalyse(f, md){
  const termen = metaTermen(f);
  const uitgezet = metaUitLijst();
  const tx = (f && Array.isArray(f.tx)) ? f.tx : [];
  const mk0 = monthKey(todayISO());

  const gevonden = [];
  let zonderDatum = 0, onleesbaar = 0;
  for(const x of tx){
    const m = metaMatch(x, termen);
    if(!m) continue;
    const mk = monthKey(x.datum);
    const bedrag = getal(x.bedrag, 0);
    const twijfel = [];
    if(!m.grens)   twijfel.push('de zoekterm staat middenin een woord');
    if(bedrag > 0) twijfel.push('dit is een bijschrijving, geen betaling');
    if(!mk){ zonderDatum++; twijfel.push('deze regel heeft geen leesbare datum'); }
    /* Een bedrag dat geen getal is telt als €0 en verdwijnt daarmee stil
       uit het maandtotaal. Precies de fout waar je niets van merkt. */
    if(!leesbaarGetal(x.bedrag)){ onleesbaar++; twijfel.push('het bedrag is niet als getal te lezen en telt hier als €0'); }
    gevonden.push({
      id: metaTxId(x), tx: x, mk, bedrag,
      afgeschreven: -bedrag,          // betalen = negatief op de rekening
      term: m.term, veld: m.veld, twijfel,
      viaOms: m.veld === 'omschrijving' && !!String(x.tegenpartij || '').trim(),
      uit: uitgezet.has(metaTxId(x))
    });
  }
  gevonden.sort((a,b) => String(b.tx.datum||'').localeCompare(String(a.tx.datum||'')));

  const perMaand = new Map();
  const rij = mk => {
    if(!perMaand.has(mk)) perMaand.set(mk, {mk, som:0, regels:0, twijfel:0, uitgesloten:0,
      gerapporteerd:null, statDagen:new Set(), opgeslagen:null, loopt: mk === mk0});
    return perMaand.get(mk);
  };
  for(const g of gevonden){
    if(!g.mk) continue;
    const r = rij(g.mk);
    if(g.uit){ r.uitgesloten++; continue; }
    r.regels++; r.som += g.afgeschreven;
    if(g.twijfel.length) r.twijfel++;
  }
  for(const s of (md.stats || [])){
    const mk = monthKey(s && s.datum); if(!mk) continue;
    const r = rij(mk);
    r.gerapporteerd = (r.gerapporteerd || 0) + getal(s.uitgegeven, 0);
    r.statDagen.add(String(s.datum).slice(0,10));
  }
  for(const b of (md.betaald || [])){
    const mk = monthKey(b && b.maand); if(!mk) continue;
    rij(mk).opgeslagen = b;
  }

  const maanden = [...perMaand.values()]
    .map(r => {
      /* Niets gevonden is niet hetzelfde als €0 betaald. */
      const betaald = r.regels ? r.som : null;
      const verschil = (betaald != null && r.gerapporteerd != null) ? betaald - r.gerapporteerd : null;
      const afwijking = (verschil != null && r.gerapporteerd > 0) ? verschil / r.gerapporteerd : null;
      const opg = r.opgeslagen;
      const gedeeld = opg ? getal(opg.bedrag, 0) : null;
      /* Wijkt het opgeslagen bedrag af van wat we nú berekenen? */
      const verouderd = (gedeeld != null && betaald != null)
        && Math.abs(gedeeld - betaald) >= 0.01;
      return Object.assign({}, r, {betaald, verschil, afwijking, gedeeld, verouderd,
                                   statDagen: r.statDagen.size});
    })
    .sort((a,b) => String(b.mk).localeCompare(String(a.mk)));

  const zichtbaar = maanden.slice(0, META_MAANDEN);
  /* Vergelijken doen we alleen over maanden waar we van allebei iets
     weten — anders zet je een halve optelling naast een hele. */
  const beide = zichtbaar.filter(m => m.betaald != null && m.gerapporteerd != null);
  const totBetaald = beide.reduce((s,m) => s + m.betaald, 0);
  const totGerapp  = beide.reduce((s,m) => s + m.gerapporteerd, 0);

  return {
    termen, gevonden, maanden, zichtbaar, zonderDatum, onleesbaar,
    meegeteld: gevonden.filter(g => !g.uit && g.mk).length,
    uitgesloten: gevonden.filter(g => g.uit).length,
    /* Alleen regels die écht in een maandtotaal terechtkomen. Een regel
       zonder datum telt nergens mee en krijgt zijn eigen melding — die
       hier meetellen zou het aantal "twijfelachtig" opblazen. */
    twijfelN: gevonden.filter(g => !g.uit && g.mk && g.twijfel.length).length,
    txTotaal: tx.length,
    beideN: beide.length,
    totBetaald: beide.length ? totBetaald : null,
    totGerapp:  beide.length ? totGerapp  : null,
    totVerschil: beide.length ? totBetaald - totGerapp : null,
    totAfwijking: totGerapp > 0 ? (totBetaald - totGerapp) / totGerapp : null,
    teDelen: maanden.filter(m => m.regels > 0)
  };
}

/* Wat er — en niets anders dan dat — naar mkt_meta_betaald gaat.
   Geen omschrijving, geen tegenpartij, geen bedrag per transactie:
   alleen de maand, het totaal, hoeveel regels erachter zitten en wie
   het bijwerkte. Deze functie is de enige plek die die rijen bouwt. */
function metaRijenVoorTeam(an){
  const nu = new Date().toISOString();
  const wie = String(CRM.me() || '').slice(0, 80);
  return an.teDelen.map(m => ({
    maand: m.mk,
    bedrag: Math.round(m.betaald * 100) / 100,
    bron: 'bank',
    regels: m.regels,
    bijgewerkt: nu,
    door: wie
  }));
}

/* ═══ NMBRS: MAAND VOOR MAAND ═══════════════════════════════════
   "Ik wil de kosten inzichtelijker, zodat we exact weten waar we naartoe
   gaan en wat we moeten plaatsen … telkens live in Nmbrs kijken" (Tjeerd,
   27 okt 2026). De koppeling (supabase/functions/yuki-sync, v3) zet de
   hele winst-en-verliesrekening per post per maand in fin_settings
   (yuki_pl_maanden). Hier wordt dat:
   • werkelijk per maand: omzet, vaste en variabele kosten, resultaat;
   • vooruit (prognose): W&S-termijnen die gepland staan + flex-gemiddelde
     − begrote kosten, met "wat moet je erbij plaatsen";
   • kostenbewaking: welke post steeg t.o.v. de maanden ervoor.
   Vast/variabel wordt op de naam van de post bepaald (zie POST_VAST).   */
const POST_VAST = /salaris|loon|lonen|premie|sociale|ziekengeld|verzuim|vakantiegeld|pensioen|management|outsourc|zzp|huur|huisvesting|gas|water|elektra|energie|verzeker|lease|wegenbelasting|contribut|abonnement|automatiser|software|administratie|accountant|bank|rente|telefoon|internet|afschrijving/i;
const postSoort = (code, naam) => String(code||'').startsWith('8') ? 'omzet' : (POST_VAST.test(String(naam||'')) ? 'vast' : 'variabel');

/* Werkelijke maanden uit Nmbrs, oud → nieuw. */
function nmbrsMaanden(f){
  const pl = S(f, 'yuki_pl_maanden', null);
  if(!pl || typeof pl !== 'object') return [];
  const t = todayISO();
  return Object.keys(pl).sort().map(mk7 => {
    const posten = (pl[mk7] || []).map(r => ({c: r.c, n: r.n, b: getal(r.b), soort: postSoort(r.c, r.n)}));
    const som = s => posten.filter(p => p.soort === s).reduce((a,p) => a + p.b, 0);
    const omzet = -som('omzet'), vast = som('vast'), variabel = som('variabel');
    return {mk7, posten, omzet, vast, variabel, kosten: vast + variabel, resultaat: omzet - vast - variabel,
            lopend: mk7 === t.slice(0,7)};
  });
}

/* Wat levert één flexkracht gemiddeld per maand op? Uit de lopende
   flexplaatsingen; zonder gegevens een voorzichtige €1.400. */
function margePerFlexkracht(f){
  /* Gemiddelde echte marge per maand van de flexkrachten met volledige
     gegevens; pas zonder één complete flexkracht een voorzichtige €1.400. */
  const ok = flexPortefeuille(f).filter(r => r.compleet);
  if(ok.length) return ok.reduce((s,r) => s + r.margeUur * r.urenPw * 52/12, 0) / ok.length;
  const st = flexPlStats(f);
  return (st.nCompleet && st.margePerMaand) ? st.margePerMaand / st.nCompleet : 1400;
}

/* Kostenbewaking: de laatste afgesloten maand per post naast het gemiddelde
   van de drie maanden ervoor. Signaal bij +15% én minstens €150, of een
   nieuwe post van €150+. Vaste lasten krijgen voorrang in de lijst. */
function kostenBewaking(f){
  const mnd = nmbrsMaanden(f).filter(m => !m.lopend);
  if(mnd.length < 2) return null;
  const laatst = mnd[mnd.length - 1], ervoor = mnd.slice(-4, -1);
  const gem = (code) => ervoor.reduce((s,m) => s + ((m.posten.find(p => p.c === code) || {}).b || 0), 0) / ervoor.length;
  const stijgers = laatst.posten.filter(p => p.soort !== 'omzet').map(p => {
    const g = gem(p.c), d = p.b - g;
    return {...p, gem: g, delta: d, pct: g > 0 ? d / g : null};
  }).filter(p => p.delta >= 150 && (p.pct == null || p.pct >= 0.15))
    .sort((a,b) => (a.soort === 'vast' ? 0 : 1) - (b.soort === 'vast' ? 0 : 1) || b.delta - a.delta);
  const gemVast = ervoor.reduce((s,m) => s + m.vast, 0) / ervoor.length;
  const gemVar  = ervoor.reduce((s,m) => s + m.variabel, 0) / ervoor.length;
  return {laatst, ervoor, stijgers, gemVast, gemVar,
          dVast: laatst.vast - gemVast, dVar: laatst.variabel - gemVar};
}

/* ─── Nmbrs live: verversen bij openen ─────────────────────────────
   De koppeling draaide alleen als de oude finance-app openstond. Nu:
   opent Tjeerd Finance en is de laatste stand ouder dan een uur, dan
   haalt het CRM op de achtergrond de verse cijfers op. Lukt dat niet,
   dan hoogstens één nieuwe poging per tien minuten.                  */
let _syncBezig = false, _syncPoging = 0;
async function nmbrsSync(stil){
  if(_syncBezig || CRM.demo || CRM._finMock || !CRM.sb) return false;
  _syncBezig = true; _syncPoging = Date.now();
  try{
    const {data, error} = await CRM.sb.functions.invoke('yuki-sync');
    if(error) throw error;
    if(data && data.error) throw new Error(data.error);
    _fin = null;
    if(!stil) CRM.toast('Nmbrs bijgewerkt', 'ok');
    if(String(location.hash).includes('finance')) CRM.render();
    return true;
  }catch(e){
    if(stil) console.warn('Nmbrs-sync', e); else CRM.fout('Nmbrs bijwerken mislukt', e);
    return false;
  }finally{ _syncBezig = false; }
}
function nmbrsVers(f){
  const ts = S(f, 'yuki_synced_at', null);
  const oud = !ts || (Date.now() - new Date(ts).getTime()) > 3600e3;
  if(oud && Date.now() - _syncPoging > 600e3) nmbrsSync(true);
}
const nmbrsStand = f => {
  const ts = S(f, 'yuki_synced_at', null);
  if(!ts) return 'nog niet opgehaald';
  const d = new Date(ts);
  return (String(ts).slice(0,10) === todayISO() ? 'vandaag ' : dKort(String(ts).slice(0,10)) + ' ')
    + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
};

/* ═══ FLEX-WAARDE EN GETEKENDE WAARDE ═══════════════════════════
   "We focussen heel erg op plaatsingen, maar dat geeft weinig grip: nu
   lijkt het alsof we een slechte maand hebben gedraaid, terwijl we veel
   flex hebben gedraaid — en die mensen lopen 1560 of 1040 uur" (Tjeerd,
   27 okt 2026). Daarom sturen op GETEKENDE WAARDE: W&S-fee + wat een
   flexkracht oplevert tot de kosteloze overname. Zijn keuzes:
   • flex-waarde = uurloon × (klantfactor − inkoopfactor) × overname-uren;
     ontbreekt iets, dan de streefwaarde (€12.000);
   • na de overname stopt de marge (voorzichtig).                     */

/* Waarde van één flexkracht — ZONDER gokken.
   VOORSPELLING tot de eerste eigen margefactuur binnen is; daarna is de
   FACTUUR leidend, altijd (Tjeerd, 27 okt 2026: "doe dit als voorspelling,
   en zodra de echte margefactuur binnen is, die is leidend en altijd leidend").
   Bronnen, in volgorde:
   • uurloon:      flexplaatsing → kandidaatkaart (uurloon, of maandloon
                   omgerekend: × 3 ÷ 13 weken ÷ uren per week)
   • klantfactor:  flexplaatsing → factuurtarief op de kandidaatkaart ÷ uurloon
                   → afspraak Uitzenden → flex-afspraak → factuur van een collega
   • inkoopfactor: per klant ALTIJD dezelfde, los van het uurloon ("een
                   inkoopprijs is altijd hetzelfde als die van een andere
                   kandidaat"): factuur van een collega bij dezelfde klant (ook
                   als die gestopt is) → handmatig vastgelegd (flex-afspraak)
                   → flexplaatsing → kostprijsberekening CAO + fase
   • overname:     flexplaatsing → afspraak Uitzenden → flex-afspraak → per klant
   Ontbreekt iets, dan GEEN marge: telt nergens mee, `mist` zegt wat er moet. */
function flexWaarde(f, fp, c, alleenVoorspelling){
  const mist = [];
  const klant = (fp && fp.klant) || (c && c.klant) || '';
  let urenPw = (fp && getalOfNull(fp.uren_pw)) || (c && getalOfNull(c.uren)) || null;

  /* uurloon */
  let uurloon = (fp && getalOfNull(fp.uurloon)) || (c && getalOfNull(c.uurloon)) || null, uurloonBron = '';
  if(!uurloon && c && getalOfNull(c.maandloon)){
    uurloon = getalOfNull(c.maandloon) * 3 / 13 / (urenPw || 40);
    uurloonBron = 'maandloon ' + eur(getalOfNull(c.maandloon)) + ' omgerekend';
  }

  /* afspraken en facturen van de klant */
  const ruw = CRM.fee.voorKlant(klant, (c && c.geplaatst_op) || (fp && fp.start) || null, 'uitzenden');
  const a = ruw ? CRM.fee.normaliseer(ruw) : null;
  const fa = flexAfspraakVoor(f, klant);
  const fiKlant = inkoopUitFacturen(f, klant);

  /* klantfactor — een factor ligt tussen 1,2 en 4. Daarbuiten is het geen
     factor maar bijv. een W&S-percentage (23) dat bij de afspraak Uitzenden
     terechtkwam: Lucindy rekende zo €398,85 marge per uur (27 okt 2026).
     Zo'n waarde wordt geweigerd en gemeld, nooit doorgerekend. */
  let klantfactor = null, klantfactorBron = '';
  const geweigerd = [];
  const probeer = (x, bron) => {
    if(klantfactor || x == null || !isFinite(x) || x <= 0) return;
    if(x >= 1.2 && x <= 4){ klantfactor = x; klantfactorBron = bron; }
    else geweigerd.push(`${num(x, 2)} uit ${bron}`);
  };
  probeer(fp && getalOfNull(fp.klantfactor), 'flexplaatsing');
  const tarief = c && getalOfNull(c.tarief);
  if(tarief && uurloon) probeer(tarief / uurloon, 'factuurtarief kandidaatkaart');
  if(ruw){ const pv = CRM.fee.pctVoor(c ? feeKand(c) : {functie: (fp && fp.functie) || ''}, ruw);
    if(pv && pv.pct) probeer(Number(pv.pct), 'afspraak Uitzenden'); }
  if(fa) probeer(getalOfNull(fa.factor), 'flex-afspraak');
  if(fiKlant) probeer(fiKlant.klantfactor, 'margefactuur ' + fiKlant.naam);

  /* inkoopfactor */
  let inkoop = null, inkoopBron = '';
  if(fiKlant){ inkoop = fiKlant.factor; inkoopBron = 'margefactuur ' + fiKlant.naam + ' (zelfde klant)'; }
  if(!inkoop && fa && getalOfNull(fa.inkoop_factor)){ inkoop = getalOfNull(fa.inkoop_factor); inkoopBron = 'vastgelegd (flex-afspraak)'; }
  if(!inkoop && fp && getalOfNull(fp.inkoop_factor)){ inkoop = getalOfNull(fp.inkoop_factor); inkoopBron = 'flexplaatsing'; }
  const kl = ((CRM.state && CRM.state.clients) || []).find(k => CRM.zelfdeKlant ? CRM.zelfdeKlant(k.naam, klant) : k.naam === klant);
  if(!inkoop && uurloon && CRM.kostprijsfactor){
    const cao = (ruw && ruw.cao) || (a && a.cao) || (kl && kl.cao), fase = (ruw && ruw.contractfase) || (a && a.contractfase) || 'Fase 1/2';
    const kp = cao ? CRM.kostprijsfactor(cao, fase, uurloon) : null;
    if(kp){ inkoop = kp.kostprijsfactor; inkoopBron = 'kostprijs ' + cao + ', ' + fase; }
  }

  /* overname */
  const overname = (fp && getalOfNull(fp.overname_uren)) || (a && a.overname_uren) || (fa && getalOfNull(fa.overname_uren))
    || overnameKlant(f, klant) || null;

  /* de voorspelling */
  const margeVoorspeld = (uurloon && klantfactor && inkoop) ? (klantfactor - inkoop) * uurloon : null;

  /* de werkelijkheid: eigen margefacturen — leidend zodra ze er zijn */
  const eigen = alleenVoorspelling ? null : eigenFactuur(f, (fp && fp.kandidaat) || (c && c.naam) || '', klant);
  const echt = eigen && eigen.margePerUur ? eigen.margePerUur : null;
  const gewerkt = (fp && flexPlBerekening(f, fp).gewerkteUren) || (eigen && eigen.uren) || 0;

  if(!echt){
    if(!uurloon) mist.push({wat:'bruto uurloon (of maandloon)', waar:'kandidaat'});
    if(!klantfactor) mist.push({wat:'klantfactor (afspraak Uitzenden of factuurtarief)', waar:'klant'});
    geweigerd.forEach(g => mist.push({wat:`klantfactor ${g} is geen factor (een factor ligt tussen 1,2 en 4 — staat hier een fee-percentage?)`, waar:'klant'}));
    if(!inkoop && uurloon) mist.push({wat:'inkoopfactor (CAO bij de klant, of vastleggen onder ⚙)', waar:'klant'});
  }
  if(!overname) mist.push({wat:'overname-uren', waar:'klant'});
  if(!urenPw) mist.push({wat:'uren per week (40 aangenomen)', waar:'kandidaat', klein:true});
  urenPw = urenPw || 40;

  const margeUur = echt || margeVoorspeld;
  const compleet = !!(margeUur && overname);
  const restUren = overname ? Math.max(0, overname - gewerkt) : null;
  /* Controle: wijkt de ingevulde klantfactor af van wat Pronkert bij een
     collega bij dezelfde klant factureert? */
  const afwijking = (!echt && fiKlant && klantfactor && fiKlant.klantfactor && klantfactorBron !== 'margefactuur ' + fiKlant.naam
      && Math.abs(klantfactor - fiKlant.klantfactor) > 0.05)
    ? [`klantfactor ${num(klantfactor, 2)}, bij ${fiKlant.naam} factureert Pronkert ${num(fiKlant.klantfactor, 2)}`] : [];
  geweigerd.forEach(g => afwijking.push(`klantfactor ${g} is geen factor (tussen 1,2 en 4) — staat daar een fee-percentage? Niet meegerekend`));
  return {uurloon, uurloonBron, klantfactor, klantfactorBron, inkoop, inkoopBron, afwijking, overname, urenPw, gewerkt, restUren,
          margeUur, margeVoorspeld, echt: !!echt, compleet, mist, klantId: kl ? kl.naam : klant,
          totaal: compleet ? margeUur * overname : null,
          rest: compleet ? margeUur * restUren : null,
          bron: !compleet ? 'onvolledig' : (echt ? 'factuur' : 'voorspelling'),
          einde: restUren ? addDays(todayISO(), Math.round(restUren / urenPw * 7)) : null};
}

/* ─── Flexkracht aanvullen, vanuit Finance ─────────────────────────
   "Na de plaatsing wil ik al weten welke marge ik de komende tijd
   binnenkrijg" (Tjeerd, 28 okt 2026). Wat je moet weten: startdatum,
   salaris, uren, tarief en de looptijd (overname-uren). De inkoopfactor
   vul je NIET in — die rekent het CRM uit: de factuur van een collega bij
   dezelfde klant (Artur bij Thermon), anders de kostprijstool van Pronkert
   met de CAO van de klant. Gaat naar de kandidaat (en de flexplaatsing als
   die er is); de looptijd naar de overname-uren van de klant.        */
function flexAanvullen(f, r, klaar){
  const c = r.cid ? cands().find(x => String(x.id) === String(r.cid)) : null;
  const fp = r.fpId ? f.flexPl.find(x => x.id === r.fpId) : null;
  const w = v => H(v == null ? '' : v);
  const kfVast = r.klantfactorBron && r.klantfactorBron !== 'factuurtarief kandidaatkaart' && r.klantfactorBron !== 'flexplaatsing' ? r.klantfactor : null;
  const real = flexKasstroom(f).real.pct, T = flexKasstroom(f).termijn;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${H(r.naam)}</div><div class="meta" style="margin-top:3px">${H(klantLabel(r.klant))} · flex</div></div>
    <div class="modal-b"><div class="f-grid">
      <div class="f-row"><label for="fv_start">Startdatum</label><input id="fv_start" type="date" value="${w(String(r.start || (c && c.start) || '').slice(0,10))}"></div>
      <div class="f-row"><label for="fv_uren">Uren per week</label><input id="fv_uren" type="number" step="0.5" value="${w((fp && fp.uren_pw) || (c && c.uren) || '')}" placeholder="40"></div>
      <div class="f-row"><label for="fv_uurloon">Bruto uurloon (€)</label><input id="fv_uurloon" type="number" step="0.01" value="${w(r.uurloon ? Math.round(r.uurloon * 100) / 100 : '')}"></div>
      <div class="f-row"><label for="fv_maand">of bruto maandloon (€)</label><input id="fv_maand" type="number" step="1" placeholder="rekent het uurloon uit"></div>
      <div class="f-row"><label for="fv_tarief">Factuurtarief per uur (€)</label><input id="fv_tarief" type="number" step="0.01" value="${w(c && c.tarief || '')}"
        placeholder="${kfVast ? 'leeg = factor ' + num(kfVast, 2) + ' uit ' + H(r.klantfactorBron) : 'wat de klant per uur betaalt'}"></div>
      <div class="f-row"><label for="fv_ovn">Looptijd tot kosteloze overname (uren)</label><input id="fv_ovn" type="number" step="10" value="${w(r.overname || '')}">
        <div class="meta" style="margin-top:4px">Geldt voor iedereen bij ${H(klantLabel(r.klant))}.</div></div>
    </div>
    <div class="note info" id="fv_uit" style="margin-top:12px"></div></div>
    <div class="modal-f"><span class="spacer"></span><button class="btn ghost" data-mclose>Annuleren</button><button class="btn" id="fv_ok">Opslaan</button></div>`, {
    onClose(){},
    onOpen(m){
      const q = s2 => m.querySelector(s2), v = id => getalOfNull(q(id).value);
      const reken = () => {
        const uren = v('#fv_uren') || 40;
        if(v('#fv_maand')) q('#fv_uurloon').value = (v('#fv_maand') * 3 / 13 / uren).toFixed(2);
        const ul = v('#fv_uurloon'), tf = v('#fv_tarief'), ovn = v('#fv_ovn'), start = q('#fv_start').value;
        const kf = tf && ul ? tf / ul : kfVast;
        /* inkoop: wat het CRM al weet; zonder collega-factuur de kostprijstool met dit uurloon */
        let ink = r.inkoop, inkBron = r.inkoopBron;
        if(ul && /^kostprijs/.test(inkBron || '') && CRM.kostprijsfactor){
          const ruw = CRM.fee.voorKlant(r.klant, start || null, 'uitzenden');
          const kl = ((CRM.state && CRM.state.clients) || []).find(k => CRM.zelfdeKlant ? CRM.zelfdeKlant(k.naam, r.klant) : k.naam === r.klant);
          const cao = (ruw && ruw.cao) || (kl && kl.cao);
          const kp = cao ? CRM.kostprijsfactor(cao, (ruw && ruw.contractfase) || 'Fase 1/2', ul) : null;
          if(kp) ink = kp.kostprijsfactor;
        }
        const regels = [];
        regels.push(ink ? `Inkoopfactor <b>${num(ink, 3)}</b> <span class="meta">— ${H(inkBron)}</span>`
          : '<b>Inkoopfactor onbekend:</b> er werkte nog niemand bij deze klant en de klant heeft geen CAO. Zet de CAO op de klantkaart, dan rekent de kostprijstool van Pronkert hem uit.');
        if(kf && (kf < 1.2 || kf > 4)) regels.push(`<span class="neg">Tarief ÷ uurloon = factor ${num(kf, 2)} — een factor ligt tussen 1,2 en 4.</span>`);
        else if(ul && kf && ink){
          const mu = ul * (kf - ink), pm = mu * uren * real * 52 / 12;
          const zo = start ? addDays(maandagVan(start), 6) : null;
          regels.push(`Marge <b>${eur2(mu)}</b> per uur (factor ${num(kf, 2)} − ${num(ink, 2)}) · ±<b>${eur(pm)}</b> per maand bij ${pct0(real)} van ${num(uren, 0)} u`
            + (zo ? `<br>Eerste factuur ${H(dKort(zo))}, eerste geld rond <b>${H(dKort(addDays(zo, T)))}</b>` : '')
            + (ovn ? ` · tot de overname ±<b>${eur(mu * ovn)}</b>` : ''));
        } else regels.push('<span class="meta">Vul uurloon (of maandloon) en tarief in om de marge te zien.</span>');
        q('#fv_uit').innerHTML = regels.join('<br>');
      };
      ['#fv_start','#fv_uren','#fv_uurloon','#fv_maand','#fv_tarief','#fv_ovn'].forEach(id => q(id).oninput = reken);
      q('#fv_uurloon').addEventListener('input', () => { q('#fv_maand').value = ''; });
      reken();
      q('#fv_ok').onclick = () => {
        const start = q('#fv_start').value || null, uren = v('#fv_uren'), ul = v('#fv_uurloon'), tf = v('#fv_tarief'), ovn = v('#fv_ovn');
        if(!start) return CRM.toast('Vul de startdatum in', 'err');
        if(!(ul > 0)) return CRM.toast('Vul het bruto uurloon of maandloon in', 'err');
        if(!(uren > 0)) return CRM.toast('Vul de uren per week in', 'err');
        if(tf && (tf / ul < 1.2 || tf / ul > 4)) return CRM.toast('Tarief ÷ uurloon ligt niet tussen 1,2 en 4 — controleer de bedragen', 'err');
        if(!tf && !kfVast) return CRM.toast('Vul het factuurtarief in — er is nog geen klantfactor bekend', 'err');
        if(!(ovn > 0)) return CRM.toast('Vul de looptijd (overname-uren) in', 'err');
        finDoe(q('#fv_ok'), async () => {
          if(c){
            const patch = {start, uren, uurloon: Math.round(ul * 100) / 100};
            if(tf) patch.tarief = tf;
            Object.assign(c, patch);
            if(!CRM.demo && !CRM._finMock){
              const {error} = await CRM.sb.from('candidates').update(patch).eq('id', c.id);
              if(error) throw error;
              if(CRM.logActiviteit) CRM.logActiviteit('kandidaat', c.id, 'systeem', 'Flex-gegevens aangevuld in Finance');
            }
          }
          if(fp){
            const pp = {start, uren_pw: uren, uurloon: Math.round(ul * 100) / 100};
            if(tf) pp.klantfactor = Math.round(tf / ul * 10000) / 10000;
            await finSchrijf('fin_flex_plaatsingen', q2 => q2.update(pp).eq('id', fp.id));
            Object.assign(fp, pp);
          }
          if(ovn !== r.overname){
            const lijst = Object.assign({}, overnameLijst(f));
            const sleutel = Object.keys(lijst).find(k => { const kw = naamWoorden(k), w2 = naamWoorden(r.klant); return kw.length && kw.every(x => w2.includes(x)); })
              || String(r.klant || '').trim();
            lijst[sleutel] = ovn;
            await overnameBewaren(f, lijst);
          }
        }, `${r.naam} bijgewerkt`, ok => { if(ok){ CRM.modal.close(); klaar(); } });
      };
    }});
}

/* ─── Overname-uren per klant ───────────────────────────────────────
   Na zoveel gewerkte uren mag de klant een flexkracht kosteloos overnemen.
   Tjeerd, 27 okt 2026: Burg Siroop 1560, Omefa 1560, Thermon 1200,
   Staalduinen 1560, Proponent 1200. Opgeslagen in fin_settings (één
   sleutel, geen databasewijziging); aan te passen onder ⚙ Instellingen.
   Klantnamen matchen op woorden ("Omefa" ↔ "Omefa European plastics &
   tooling"). Een afspraak Uitzenden of flexplaatsing gaat voor.       */
const OVERNAME_KEY = 'flex_overname_per_klant';
const OVERNAME_TJEERD = {'Burg Siroop':1560, 'Omefa':1560, 'Thermon':1200, 'Staalduinen':1560, 'Proponent':1200};
const naamWoorden = x => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['b.v','bv','the','van','der','den'].includes(w));
/* Niets vastgelegd → Tjeerds eigen lijst (27 okt 2026) geldt; het Vastleggen-
   knopje stond er wel, maar zonder klik bleef bij Thermon "overname ?" staan. */
const overnameLijst = f => { const v = S(f, OVERNAME_KEY, null);
  return (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) ? v : Object.assign({}, OVERNAME_TJEERD); };
function overnameKlant(f, klant){
  const w = naamWoorden(klant);
  for(const [k, u] of Object.entries(overnameLijst(f))){
    const kw = naamWoorden(k);
    if(kw.length && kw.every(x => w.includes(x)) && getal(u)) return getal(u);
  }
  return null;
}
async function overnameBewaren(f, lijst){
  await finSchrijf('fin_settings', q => q.upsert({key: OVERNAME_KEY, value: lijst}));
  f.settings[OVERNAME_KEY] = lijst;
}

/* De echte inkoopfactor van Pronkert bij een klant, uit de margefactuur
   van een flexkracht die daar al werkt. Pronkert rekent per klant met een
   vast factorschema (bijv. BEROEPS1 bij Staalduinen: 1,764), los van het
   uurloon — dus een nieuwe kandidaat bij dezelfde klant krijgt dezelfde
   factor. Exacter dan het CAO-model: bij Staalduinen gaf dat 1,831 en
   daarmee 11% te weinig marge (week 42, Radjkoemar). Klantnamen verschillen
   per bron ("Transport gebrs. van Staalduinen B.V." vs "Staalduinen"):
   alle woorden van de CRM-naam moeten in de Pronkert-naam staan.       */
function inkoopUitFacturen(f, klant){
  const woorden = x => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['b.v','bv','the','van','der','den'].includes(w));
  const zoek = woorden(klant);
  if(!zoek.length) return null;
  /* De klant van een factuurpersoon: de flexplaatsing, de klantnaam op de
     factuur, of anders de kandidaat op het bord met die roepnaam — ook als
     hij gestopt is (Artur bij Thermon: zijn factor geldt voor Danny en Maureen). */
  const kandidaten = flexFactoren(f).filter(k => k.inkoopfactor && (
    (k.plaatsing && k.plaatsing.klant && (CRM.zelfdeKlant ? CRM.zelfdeKlant(k.plaatsing.klant, klant) : k.plaatsing.klant === klant))
    || [k.klant, bordKlant(k)].some(kk => { const w = woorden(kk); return w.length && zoek.every(z => w.includes(z)); })));
  if(!kandidaten.length) return null;
  const k = kandidaten.sort((a,b) => String(b.laatste).localeCompare(String(a.laatste)))[0];
  return {factor: k.inkoopfactor, klantfactor: k.klantfactor, naam: k.naam, week: k.laatste};
}

/* Klant van iemand op de margefactuur zonder klantnaam: de kandidaat op het
   bord met die roepnaam (ook als hij gestopt is). */
function bordKlant(k){
  const roep = flexWoorden(k.naam)[0];
  const c = roep && cands().find(x => isFlexType(x.type) && flexWoorden(x.naam).includes(roep) && x.klant);
  return c ? c.klant : '';
}

/* De eigen regels van een flexkracht in de margefacturen: op roepnaam,
   en bij dezelfde klant als die bekend is. */
function eigenFactuur(f, naam, klant){
  const woorden = x => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w => w.length > 1);
  const n = woorden(naam);
  if(!n.length) return null;
  const zoekKlant = woorden(klant).filter(w => w.length > 2 && !['b.v','bv','van','der','den'].includes(w));
  return flexFactoren(f).find(k => {
    const roep = woorden(k.naam)[0];
    if(!roep || !n.includes(roep)) return false;
    if(!zoekKlant.length) return true;
    const kk = woorden((k.plaatsing && k.plaatsing.klant) || k.klant || bordKlant(k));
    return zoekKlant.every(z => kk.includes(z));
  }) || null;
}

/* Wie de laatste drie weken op een margefactuur stond, maar niet in de
   portefeuille: die marge mist dan in de prognose. Gekoppeld op roepnaam. */
function factuurZonderPortefeuille(f, pf){
  const grens = addDays(todayISO(), -21);
  const woorden = x => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w => w.length > 1);
  const namen = pf.map(r => woorden(r.naam));
  /* Wie gestopt is (op het bord of in Finance) hoort er terecht niet meer in. */
  const gestopt = [...f.flexPl.filter(x => x.gestopt_op).map(x => x.kandidaat),
                   ...cands().filter(c => c.gestopt_op || faseVan(c) === 'Gestopt').map(c => c.naam)].map(woorden);
  return flexFactoren(f).filter(k => k.laatste && k.laatste >= grens && k.uren > 0)
    .filter(k => { const roep = woorden(k.naam)[0]; return !gestopt.some(n => n.includes(roep)); })
    .filter(k => { const roep = woorden(k.naam)[0]; return roep && !namen.some(n => n.includes(roep)); });
}

/* Alle flexkrachten die nu lopen: de flexplaatsingen in Finance, plus wie
   op het bord als Flex getekend heeft maar nog niet in Finance staat. */
function flexPortefeuille(f){
  const rijen = [], gekoppeld = new Set(), namen = new Set();
  for(const fp of f.flexPl.filter(x => !x.gestopt_op)){
    const c = fp.pipeline_candidate_id ? cands().find(x => x.id === fp.pipeline_candidate_id) : null;
    if(c && c.gestopt_op) continue;
    if(fp.pipeline_candidate_id) gekoppeld.add(fp.pipeline_candidate_id);
    namen.add(String(fp.kandidaat||'').trim().toLowerCase());
    rijen.push({naam: tekst(fp.kandidaat), klant: fp.klant, cid: c && c.id, fpId: fp.id, start: fp.start || (c && (c.start || c.geplaatst_op)), ...flexWaarde(f, fp, c)});
  }
  for(const c of cands()){
    if(!isFlexType(c.type) || !isPlaced(c) || c.gestopt_op) continue;
    if(gekoppeld.has(c.id) || namen.has(String(c.naam||'').trim().toLowerCase())) continue;
    rijen.push({naam: tekst(c.naam), klant: c.klant, cid: c.id, start: c.start || c.geplaatst_op, nieuw: true, ...flexWaarde(f, null, c)});
  }
  return rijen.sort((a,b) => (a.compleet ? 0 : 1) - (b.compleet ? 0 : 1) || String(a.einde||'9999').localeCompare(String(b.einde||'9999')));
}

/* Getekende waarde in een maand: W&S-fees (netto, na vervallen termijnen)
   + flex-waarde van wie die maand tekende. Wie stopte, telt mee met wat
   er werkelijk verdiend is. Board-kandidaten die nog niet in Finance zijn
   afgerond tellen mee met de fee die het CRM voorrekent. */
function getekendeWaarde(f, mk7){
  let ws = 0, flex = 0, nWs = 0, nFlex = 0, nOnbekend = 0;
  const gekoppeld = new Set(f.placements.map(p => p.pipeline_candidate_id).filter(Boolean));
  for(const p of f.placements){
    if(String(p.contract_datum||'').slice(0,7) !== mk7) continue;
    ws += getal(p.fee_excl) - placementStats(f, p).vervallen; nWs++;
  }
  for(const c of cands()){
    if(String(c.geplaatst_op||'').slice(0,7) !== mk7) continue;
    if(isFlexType(c.type)){
      const fp = f.flexPl.find(x => x.pipeline_candidate_id === c.id);
      const w = flexWaarde(f, fp, c);
      if(c.gestopt_op){ flex += (fp && flexPlBerekening(f, fp).verdiend) || 0; nFlex++; }
      else if(w.compleet){ flex += w.totaal; nFlex++; }
      else nOnbekend++;
    }else if(!gekoppeld.has(c.id) && !CRM.fee.geenFeeReden(c) && (c.type || 'W&S') !== 'ZZP' && !c.vervangt){
      const vs = feeBerekening(f, c);
      if(vs && vs.fee){ ws += vs.fee; nWs++; }
    }
  }
  return {mk7, ws, flex, totaal: ws + flex, nWs, nFlex, nOnbekend};
}

/* ─── Kaart: getekende waarde ─────────────────────────────────────── */
function waardeKaart(f){
  const t = todayISO();
  const maanden = [5,4,3,2,1,0].map(i => String(addMonths(monthKey(t), -i)).slice(0,7));
  const nodigVan = mk7 => { const n = nmbrsMaanden(f).find(x => x.mk7 === mk7 && !x.lopend);
    return n ? n.kosten : budgetVoorMaand(f, mk7 + '-01'); };
  const rijen = maanden.map(mk7 => {
    const w = getekendeWaarde(f, mk7), nodig = nodigVan(mk7), nu = mk7 === t.slice(0,7);
    const pct = nodig ? Math.min(100, w.totaal / nodig * 100) : 0;
    return `<tr${nu ? ' class="fin-nu"' : ''}>
      <td><b>${H(mkLabel(mk7 + '-01'))}</b>${nu ? ' <span class="meta">loopt</span>' : ''}</td>
      <td class="n num">${eur(w.ws)} <span class="meta">${w.nWs}×</span></td>
      <td class="n num">${eur(w.flex)} <span class="meta">${w.nFlex}×</span>${w.nOnbekend ? `<div class="rowsub">+ ${w.nOnbekend} zonder volledige gegevens</div>` : ''}</td>
      <td class="n"><b class="num">${eur(w.totaal)}</b></td>
      <td class="n num meta">${eur(nodig)}</td>
      <td style="width:22%"><div class="fin-waardebar${w.totaal >= nodig ? ' ok' : ''}"><i style="width:${pct}%"></i></div></td></tr>`;
  }).join('');
  return kaart('Potentieel — getekende waarde (nog niet binnen)', tabel(
    '<th>Maand</th><th class="n">W&amp;S</th><th class="n">Flex t/m overname</th><th class="n">Totaal</th><th class="n">Nodig</th><th></th>', rijen),
    {plat:true, voet:'Wat je in een maand tekent, ook als het geld later binnenkomt: W&S-fee + flex-marge tot de kosteloze overname (uurloon × (klantfactor − inkoopfactor) × overname-uren). Flexkrachten zonder volledige gegevens tellen niet mee — zie Flex. "Nodig" = je kosten in die maand.'});
}

/* ═══ FLEX-KASSTROOM: wanneer komt welk geld binnen ═══════════════
   "Iemand start — wanneer komt er dan geld binnen, en hoeveel per maand?"
   (Tjeerd, 28 okt 2026). Het ritme van Pronkert:
     werkweek (ma–vr) → margefactuur gedateerd op de zondag van die week,
     per mail een week later → uitbetaling ±30 dagen na de factuurdatum.
   Werk uit de laatste week van oktober komt dus pas begin december binnen.
   De termijn staat onder ⚙ (flex_betaaltermijn, standaard 30 dagen).

   Per post (één factuur of één voorspelde week) één betaaldatum:
   • binnen       — factuur, betaaldatum voorbij (volgens het ritme; de bank
                    bevestigt het niet apart)
   • gefactureerd — factuur, betaaldatum nog niet bereikt
   • verwacht     — gewerkt of nog te werken, nog niet gefactureerd, door
                    iemand die al begonnen is
   • nieuw        — wie getekend heeft maar nog niet gestart is: apart, want
                    daar is nog geen uur gewerkt
   Vooruit rekent het met de GEMETEN realisatie (gewerkte ÷ contracturen
   uit alle margefacturen: ziekte, vakantie) en de feestdagen eraf — niet
   rijk rekenen. Tot de kosteloze overname; daarna niets meer.           */
const FLEX_BETAAL_KEY = 'flex_betaaltermijn';
const _feestCache = {};
function feestdagen(j){
  if(_feestCache[j]) return _feestCache[j];
  /* Pasen (Meeus/Jones/Butcher) */
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4,
        g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 19 * l) / 433),
        mnd = Math.floor((h + l - 7 * m + 90) / 25), dag = (h + l - 7 * m + 33 * mnd + 19) % 32;
  const pasen = `${j}-${String(mnd).padStart(2,'0')}-${String(dag).padStart(2,'0')}`;
  const koning = new Date(j + '-04-27T12:00:00').getDay() === 0 ? `${j}-04-26` : `${j}-04-27`;
  const lijst = [`${j}-01-01`, addDays(pasen, 1), koning, addDays(pasen, 39), addDays(pasen, 50), `${j}-12-25`, `${j}-12-26`];
  if(j % 5 === 0) lijst.push(`${j}-05-05`);                       // Bevrijdingsdag: in lustrumjaren vrij
  return (_feestCache[j] = new Set(lijst));
}
const isFeestdag = d => feestdagen(+String(d).slice(0,4)).has(String(d).slice(0,10));
const maandagVan = iso => { const d = new Date(String(iso).slice(0,10) + 'T12:00:00'); return addDays(iso, -((d.getDay() + 6) % 7)); };
/* werkdagen (ma–vr, geen feestdag) van `van` t/m `tot` */
function werkdagen(van, tot){
  let n = 0;
  for(let d = van; d && d <= tot; d = addDays(d, 1)){
    const wd = new Date(d + 'T12:00:00').getDay();
    if(wd >= 1 && wd <= 5 && !isFeestdag(d)) n++;
  }
  return n;
}
const flexWoorden = x => String(x||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^a-z0-9]+/).filter(w => w.length > 1);

/* Contracturen per week van iemand op de margefactuur (op roepnaam). */
function contractUren(f, pf, roep){
  if(!roep) return null;
  const r = pf.find(x => flexWoorden(x.naam).includes(roep));
  if(r && r.urenPw) return r.urenPw;
  const fp = f.flexPl.find(x => flexWoorden(x.kandidaat).includes(roep) && getalOfNull(x.uren_pw));
  if(fp) return getalOfNull(fp.uren_pw);
  const c = cands().find(x => isFlexType(x.type) && flexWoorden(x.naam).includes(roep) && getalOfNull(x.uren));
  return c ? getalOfNull(c.uren) : null;
}

/* Iedereen die op een margefactuur staat: per persoon de gewerkte uren per
   week en de eerste/laatste factuurweek. */
function flexPersonen(f){
  const per = new Map();
  for(const r of f.flexRegels || []){
    const wk = String(r.week||'').slice(0,10); if(!wk) continue;
    const sl = flexSleutel(r);
    const p = per.get(sl) || {sleutel: sl, naam: tekst(r.roepnaam,'') || tekst(r.naam,''), klant: tekst(r.klant,''),
      roep: flexWoorden(r.roepnaam || r.naam)[0], weken: new Map(), eerste: wk, laatste: wk};
    p.weken.set(wk, (p.weken.get(wk) || 0) + getal(r.uren));
    if(wk < p.eerste) p.eerste = wk; if(wk > p.laatste) p.laatste = wk;
    if(!p.klant && tekst(r.klant,'')) p.klant = tekst(r.klant,'');
    per.set(sl, p);
  }
  return [...per.values()];
}

/* Gemeten realisatie: hoeveel van de contracturen er echt gewerkt wordt.
   Alleen volle weken: niet de startweek, niet de stopweek, niet een week
   met een feestdag (die gaan in de prognose apart van de dagen af). Een
   week zonder factuurregel tussen de eerste en de laatste = 0 uur (vakantie,
   ziek). Wie geen bekende contracturen heeft telt niet mee. Nooit boven 100%. */
function flexRealisatie(f, pf, stopVan){
  let uren = 0, contract = 0, n = 0;
  for(const p of flexPersonen(f)){
    const cu = contractUren(f, pf, p.roep);
    if(!cu) continue;
    const stop = stopVan(p.roep);
    for(let wk = addDays(p.eerste, 7); wk <= p.laatste; wk = addDays(wk, 7)){
      if(stop && addDays(wk, 4) >= stop) break;
      if(werkdagen(wk, addDays(wk, 4)) < 5) continue;
      uren += p.weken.get(wk) || 0; contract += cu; n++;
    }
  }
  const gemeten = contract ? uren / contract : null;
  return {pct: n >= 6 && gemeten ? Math.min(1, gemeten) : 1, gemeten, weken: n, voldoende: n >= 6};
}

const _kasCache = new WeakMap();
function flexKasstroom(f){
  const t = todayISO();
  const stempel = t + JSON.stringify([S(f, FLEX_BETAAL_KEY, null), overnameLijst(f), (f.flexPl||[]).length,
    (f.flexRegels||[]).length, f.flexAfspr, f.flexPl,
    cands().filter(c => isFlexType(c.type)).map(c => [c.id, c.fase, c.klant, c.uurloon, c.uren, c.tarief, c.maandloon, c.start, c.gestopt_op])]);
  const c0 = _kasCache.get(f);
  if(c0 && c0.stempel === stempel) return c0.uit;

  const T = Math.round(getal(S(f, FLEX_BETAAL_KEY, 30))) || 30;
  const betaal = fd => addDays(fd, T);
  const stops = [...f.flexPl.filter(x => x.gestopt_op).map(x => ({n: flexWoorden(x.kandidaat), d: String(x.gestopt_op).slice(0,10)})),
                 ...cands().filter(c => c.gestopt_op).map(c => ({n: flexWoorden(c.naam), d: String(c.gestopt_op).slice(0,10)}))];
  const stopVan = roep => { const s2 = roep && stops.find(x => x.n.includes(roep)); return s2 ? s2.d : null; };
  const pf = flexPortefeuille(f);
  const real = flexRealisatie(f, pf, stopVan);
  const posten = [];
  const personen = new Map();          // sleutel → persoonsregel voor de kalender
  const persoon = (sleutel, basis) => { if(!personen.has(sleutel)) personen.set(sleutel, {sleutel, ...basis, posten: []}); return personen.get(sleutel); };
  const boek = (p, post) => { posten.push(post); if(p) p.posten.push(post); };

  /* 1. wat al gefactureerd is: per persoon per factuur één betaling */
  const fac = new Map();
  for(const r of f.flexRegels || []){
    const wk = String(r.week||'').slice(0,10); if(!wk) continue;
    const fd = String(r.factuurdatum || addDays(wk, 6)).slice(0,10);
    const k = flexSleutel(r) + '|' + (r.factuur || wk);
    const x = fac.get(k) || {sleutel: flexSleutel(r), naam: tekst(r.roepnaam,'') || tekst(r.naam,''), roep: flexWoorden(r.roepnaam || r.naam)[0],
      klant: tekst(r.klant,''), factuur: r.factuur, fd, bedrag: 0};
    x.bedrag += getal(r.marge); if(fd < x.fd) x.fd = fd;
    fac.set(k, x);
  }
  /* Een pf-regel hoort bij een factuurpersoon als zijn roepnaam in de CRM-naam staat. */
  const pfVan = roep => roep ? pf.find(r => flexWoorden(r.naam).includes(roep)) : null;
  for(const x of fac.values()){
    const r = pfVan(x.roep), b = betaal(x.fd);
    const p = persoon(r ? 'pf:' + r.naam : x.sleutel, {naam: r ? r.naam : x.naam, klant: r ? r.klant : (x.klant || bordKlant(x)), cid: r && r.cid});
    boek(p, {datum: b, mk7: b.slice(0,7), bedrag: x.bedrag, soort: b <= t ? 'binnen' : 'gefactureerd', factuurdatum: x.fd, factuur: x.factuur});
  }
  /* oude weken die alleen als weektotaal bestaan (vóór de factuurregels) */
  const metRegels = new Set((f.flexRegels||[]).map(r => String(r.week||'').slice(0,10)));
  for(const w of f.flexWeken){
    const wk = String(w.week||'').slice(0,10); if(!wk || metRegels.has(wk)) continue;
    const b = betaal(addDays(wk, 6));
    boek(null, {datum: b, mk7: b.slice(0,7), bedrag: getal(w.bedrag), soort: b <= t ? 'binnen' : 'gefactureerd', factuurdatum: addDays(wk, 6)});
  }

  /* 2. vooruit: per week de voorspelde marge, met de betaaldatum erbij */
  const fp0 = flexPersonen(f);
  const horizon = addMonths(t, 24);
  const vooruit = (p, {roep, start, stop, margeUur, urenPw, rest, nieuw}) => {
    const laatste = (fp0.find(x => x.roep && x.roep === roep) || {}).laatste;
    let ma = laatste ? addDays(laatste, 7) : maandagVan(start);
    for(let i = 0; i < 130 && rest > 0.01 && ma <= horizon; i++, ma = addDays(ma, 7)){
      if(stop && ma > stop) break;
      const van = start && start > ma ? start : ma;
      const tot = stop && stop < addDays(ma, 4) ? stop : addDays(ma, 4);
      const uren = Math.min(rest, werkdagen(van, tot) * urenPw / 5 * real.pct);
      if(uren <= 0) continue;
      rest -= uren;
      let b = betaal(addDays(ma, 6)); if(b < t) b = t;    // te laat gefactureerd: komt nu
      const soort = nieuw ? 'nieuw' : 'verwacht';
      boek(p, {datum: b, mk7: b.slice(0,7), bedrag: uren * margeUur, uren, week: ma, soort});
    }
    return addDays(ma, -3);                                // ±vrijdag van de laatste week
  };
  const mist = [];
  for(const r of pf){
    const roep = flexWoorden(r.naam)[0];
    const start = String(r.start || '').slice(0,10) || null;
    const p = persoon('pf:' + r.naam, {naam: r.naam, klant: r.klant, cid: r.cid});
    Object.assign(p, {margeUur: r.margeUur, echt: r.echt, urenPw: r.urenPw, start, overname: r.overname,
      nieuw: !!(start && start > t), compleet: r.compleet});
    if(!r.margeUur || !r.overname){ mist.push(r); p.mist = true; continue; }
    if(!start && !(fp0.find(x => x.roep === roep))){ mist.push(r); p.mist = true; p.geenStart = true; continue; }
    /* overname gaat over gewerkte uren; wat al gewerkt maar nog niet gefactureerd is telt mee in de loop */
    p.einde = vooruit(p, {roep, start, stop: null, margeUur: r.margeUur, urenPw: r.urenPw, rest: r.restUren, nieuw: p.nieuw});
  }
  /* wie gestopt is maar nog niet helemaal gefactureerd: de laatste dagen komen nog */
  for(const x of fp0){
    const stop = stopVan(x.roep);
    if(!stop || addDays(x.laatste, 7) > stop) continue;
    const k = flexFactoren(f).find(k2 => flexWoorden(k2.naam)[0] === x.roep);
    if(!k || !k.margePerUur) continue;
    const p = persoon(x.sleutel, {naam: x.naam, klant: x.klant || bordKlant(x)});
    p.gestopt = stop;
    vooruit(p, {roep: x.roep, start: null, stop, margeUur: k.margePerUur, urenPw: contractUren(f, pf, x.roep) || 40, rest: 1e9, nieuw: false});
  }

  const uit = {posten, personen: [...personen.values()], real, termijn: T, mist,
    maand: mk7 => {
      const s = {binnen: 0, gefactureerd: 0, verwacht: 0, nieuw: 0};
      posten.forEach(x => { if(x.mk7 === mk7) s[x.soort] += x.bedrag; });
      return s;
    }};
  _kasCache.set(f, {stempel, uit});
  return uit;
}

/* Wat komt er in een maand ECHT binnen — "we moeten onszelf niet rijk
   rekenen; ik moet exact weten wat we binnenkrijgen" (Tjeerd, 27 okt 2026).
   • W&S: termijnen met een betaaldatum in die maand (werkelijk ontvangen);
     vooruit: de vervaldatum (gefactureerd) of geplande datum + betaaltermijn
     (nog te factureren). Te late betalingen tellen NIET mee in de
     prognose — die staan apart als "nog te innen".
   • Flex: Pronkert betaalt elke margefactuur ±30 dagen na de factuurdatum
     (zondag van de werkweek). Vooruit: de huidige flexkrachten tot hun
     overname; wie getekend heeft maar nog niet startte staat apart.
   Alles excl. btw, zoals Nmbrs. Concepten en on hold tellen niet mee.  */
function binnenMaand(f, mk7){
  const t = todayISO(), nu7 = t.slice(0,7);
  const plById = Object.fromEntries(f.placements.map(p => [p.id, p]));
  let wsEcht = 0, wsVerwacht = 0;
  for(const i of f.installments){
    const p = plById[i.placement_id]; if(!p) continue;
    if(i.status === 'betaald'){
      if(String(i.betaaldatum||'').slice(0,7) === mk7) wsEcht += bedragVan(i);
      continue;
    }
    if(p.concept || opHold(f, p.id) || mk7 < nu7) continue;
    let op = null;
    if(i.status === 'gefactureerd' && i.factuurdatum){ const vv = vervaldatum(i, p); if(vv >= t) op = vv; }
    else if(i.status === 'te_factureren' && i.geplande_datum){ const vv = addDays(i.geplande_datum, getal(p.betaaltermijn_dgn) || 14); if(vv >= t) op = vv; }
    if(op && op.slice(0,7) === mk7) wsVerwacht += bedragVan(i);
  }
  /* Flex: per factuur ±30 dagen na de factuurdatum (zie flexKasstroom).
     Wie nog niet gestart is staat apart (flexNieuw) en telt niet in het totaal. */
  const fk = flexKasstroom(f).maand(mk7);
  const flexEcht = fk.binnen, flexVerwacht = fk.gefactureerd + fk.verwacht, flexNieuw = fk.nieuw;
  return {mk7, wsEcht, wsVerwacht, flexEcht, flexVerwacht, flexNieuw, flexGefactureerd: fk.gefactureerd,
          echt: wsEcht + flexEcht, verwacht: wsVerwacht + flexVerwacht, totaal: wsEcht + flexEcht + wsVerwacht + flexVerwacht};
}

/* Te late betalingen: wel van ons, maar nog niet binnen — apart, niet in de prognose. */
function nogTeInnen(f){
  const t = todayISO();
  const plById = Object.fromEntries(f.placements.map(p => [p.id, p]));
  const rij = f.installments.filter(i => {
    const p = plById[i.placement_id];
    if(!p || i.status !== 'gefactureerd' || opHold(f, p.id)) return false;
    const vv = vervaldatum(i, p); return vv && vv < t;
  });
  return {n: rij.length, bedrag: rij.reduce((s,i) => s + bedragVan(i), 0)};
}

/* ─── Kaart: maand voor maand — wat komt er echt binnen ──────────── */
let _alleMaanden = false;
function maandKaart(f){
  const t = todayISO(), nu7 = t.slice(0,7), jaar = t.slice(0,4);
  const nm = nmbrsMaanden(f);
  const kostenVan = mk7 => { const n = nm.find(x => x.mk7 === mk7 && !x.lopend);
    return n ? {b: n.kosten, bron: 'Nmbrs'} : {b: budgetVoorMaand(f, mk7 + '-01'), bron: 'begroting'}; };
  const alleTerug = [];
  for(let i = 1; i <= 12; i++){ const m = String(addMonths(monthKey(t), -i)).slice(0,7); if(m.slice(0,4) === jaar) alleTerug.unshift(m); }
  const terug = _alleMaanden ? alleTerug : alleTerug.slice(-3);
  const vooruit = [1,2,3,4,5,6].map(i => String(addMonths(monthKey(t), i)).slice(0,7));
  const fee = kpis(f).gemFee || 8500, perKracht = margePerFlexkracht(f);
  const inn = nogTeInnen(f);

  const rij = mk7 => {
    const b = binnenMaand(f, mk7), k = kostenVan(mk7);
    const prog = mk7 > nu7, nu = mk7 === nu7;
    const ws = b.wsEcht + b.wsVerwacht, flex = b.flexEcht + b.flexVerwacht;
    const saldo = b.totaal - k.b;
    const omzet = (nm.find(x => x.mk7 === mk7) || {}).omzet;
    const nodig = prog && saldo < 0
      ? `<span class="neg num">${eurN(saldo)}</span><div class="rowsub">≈ ${Math.ceil(-saldo / fee)} W&amp;S of ${Math.ceil(-saldo / perKracht)} flex erbij</div>`
      : `<span class="num ${saldo < 0 ? 'neg' : 'pos'}">${eurN(saldo)}</span>`;
    return `<tr class="${prog ? 'fin-prog' : ''}${nu ? ' fin-nu' : ''}">
      <td><b>${H(mkLabel(mk7 + '-01'))}</b>${nu ? ' <span class="meta">tot nu</span>' : prog ? ' <span class="meta">verwacht</span>' : ''}</td>
      <td class="n num">${eur(ws)}</td>
      <td class="n num">${eur(flex)}${b.flexNieuw ? `<div class="rowsub">+ ${eur(b.flexNieuw)} nog niet gestart</div>` : ''}</td>
      <td class="n"><b class="num">${eur(b.totaal)}</b>${omzet != null ? `<div class="rowsub">omzet Nmbrs ${eur(omzet)}</div>` : ''}</td>
      <td class="n num">${eur(k.b)} <span class="meta">${k.bron === 'Nmbrs' ? '' : 'begroot'}</span></td>
      <td class="n">${nodig}</td></tr>`;
  };
  const kop = '<th>Maand</th><th class="n">Binnen W&amp;S</th><th class="n">Binnen flex</th><th class="n">Totaal binnen</th><th class="n">Kosten</th><th class="n">Over / tekort</th>';
  const body = tabel(kop,
    (alleTerug.length > 3 ? `<tr><td colspan="6"><button type="button" class="lnk" id="fin_allemaanden">${
      _alleMaanden ? 'Alleen de laatste maanden' : `Eerdere maanden (${alleTerug.length - 3})`}</button></td></tr>` : '')
    + terug.map(rij).join('') + rij(nu7) + `<tr class="fin-scheiding"><td colspan="6"></td></tr>` + vooruit.map(rij).join(''));
  return kaart('Wat komt er echt binnen', body, {plat:true,
    acties:`${inn.n ? `<span class="meta">nog te innen (te laat): <b class="neg num">${eur(inn.bedrag)}</b> · </span>` : ''}<span class="meta">Nmbrs ${H(nmbrsStand(f))}</span> <button class="btn ghost sm" id="fin_nmbrs">↻ Nmbrs</button>`,
    voet:`Excl. btw. Binnen W&S = betaalde termijnen (vooruit: op de vervaldatum). Binnen flex = uitbetaling Pronkert, ±${flexKasstroom(f).termijn} dagen na elke margefactuur (vooruit: je huidige flexkrachten tot hun overname, met de gemeten realisatie; wie nog niet startte telt niet mee). Te late betalingen tellen niet mee tot ze binnen zijn. "Om kosten te dekken" rekent met je gemiddelde fee (${eur(fee)}) en ${eur(perKracht)} marge per flexkracht per maand.`});
}

/* ─── Kaart: kostenbewaking ───────────────────────────────────────── */
let _allePosten = false;
function bewakingKaart(f){
  const kb = kostenBewaking(f);
  if(!kb) return '';
  const lbl = mkLabel(kb.laatst.mk7 + '-01');
  const verschil = (d) => `<span class="num ${d > 0 ? 'neg' : 'pos'}">${d > 0 ? '+' : '−'}${eur(Math.abs(d))}</span>`;
  const kop = `<div class="fin-pot"><span>Vaste kosten ${H(lbl)}</span><b>${eur(kb.laatst.vast)} ${verschil(kb.dVast)}</b></div>
    <div class="fin-pot"><span>Variabele kosten ${H(lbl)}</span><b>${eur(kb.laatst.variabel)} ${verschil(kb.dVar)}</b></div>`;
  const stijg = kb.stijgers.length
    ? kb.stijgers.slice(0, 6).map(p => `<div class="fin-todo urg"><div class="t"><b>${H(p.n || p.c)}</b>
        <div class="w">${p.soort === 'vast' ? 'vaste last' : 'variabel'} · gemiddeld ${eur(p.gem)}</div></div>
        <div class="bd">${eur(p.b)} ${verschil(p.delta)}</div></div>`).join('')
    : `<div class="fin-todo"><div class="t meta">Geen post duidelijk gestegen t.o.v. de drie maanden ervoor.</div></div>`;
  /* Alle posten: laatste vier afgesloten maanden naast elkaar. */
  const mnd = [...kb.ervoor, kb.laatst];
  const codes = [...new Set(mnd.flatMap(m => m.posten.filter(p => p.soort !== 'omzet').map(p => p.c)))];
  const naam = c => (mnd.flatMap(m => m.posten).find(p => p.c === c) || {}).n || c;
  const alle = _allePosten ? tabel('<th>Post</th>' + mnd.map(m => `<th class="n">${H(mkLabel(m.mk7 + '-01'))}</th>`).join(''),
    codes.map(c => ({c, n: naam(c), soort: postSoort(c, naam(c)), laatst: (kb.laatst.posten.find(p => p.c === c) || {}).b || 0}))
      .sort((a,b) => (a.soort === 'vast' ? 0 : 1) - (b.soort === 'vast' ? 0 : 1) || b.laatst - a.laatst)
      .map(r => `<tr><td>${H(r.n)} <span class="meta">${r.soort === 'vast' ? 'vast' : 'variabel'}</span></td>${
        mnd.map(m => { const p = m.posten.find(x => x.c === r.c); return `<td class="n num">${p ? eur(p.b) : '—'}</td>`; }).join('')}</tr>`).join('')) : '';
  return kaart(`Kosten — ${lbl} t.o.v. de drie maanden ervoor`,
    `<div style="padding:12px 18px 4px">${kop}</div>${stijg}${alle}
     <div class="fin-werkelijk"><button type="button" class="lnk" id="fin_alleposten">${_allePosten ? 'Minder tonen' : 'Alle posten per maand'}</button></div>`,
    {plat:true});
}

/* ═══ TAB: GELD ════════════════════════════════════════════════
   Cashflow, kosten en het jaardoel op één scherm: hoe staat de bank er
   de komende 13 weken voor, ligt het jaardoel op koers, en wat kost het
   bedrijf per maand. De 12-maands scenario's, de break-even- en
   investeringsrekensommen zijn eruit (27 okt 2026).

   Jaardoel — twee fouten uit de audit hier rechtgezet:
   • "nog te factureren" telt alleen termijnen die dít jaar gepland staan;
     eerder telde een termijn van februari 2027 mee voor het doel van 2026.
   • conceptplaatsingen (fee nog niet bevestigd) tellen niet mee.        */
function tabGeld(el, f){
  if(f.demo){ el.innerHTML = demoLeeg('Geen geldgegevens in demo',
    'Hier zie je normaal je maanden uit Nmbrs, de prognose, je kosten en wat je moet plaatsen.'); return; }

  const t = todayISO(), jaar = t.slice(0,4), m = +t.slice(5,7), d = +t.slice(8,10), mk = monthKey(t);
  const saldo = f.saldi[0];
  const wp = weekProjectie(f, 13);
  const fx = flexStats(f), od = omzetDoel(f), k = kpis(f);
  const echt = nmbrsMaanden(f).filter(x => !x.lopend);
  const vorige = echt[echt.length - 1] || null;
  const kb = kostenBewaking(f);

  /* ── jaardoel ── */
  const concepten = new Set(f.placements.filter(p => p.concept).map(p => p.id));
  /* Omzet dit jaar: de som van de Nmbrs-maanden als die er zijn (bevat flex al). */
  const nmJaar = nmbrsMaanden(f).filter(x => x.mk7.slice(0,4) === jaar);
  const gerealiseerd = nmJaar.length ? nmJaar.reduce((s,x) => s + x.omzet, 0)
    : od.omzetYtd + (Sn(f,'yuki_omzet_ytd',0) > 0 ? 0 : fx.ytd);
  const nogDitJaar = f.installments.filter(i => i.status === 'te_factureren' && !concepten.has(i.placement_id)
    && !opHold(f, i.placement_id) && String(i.geplande_datum||'').slice(0,4) === jaar).reduce((s,i) => s + bedragVan(i), 0);
  const restMnd = Math.max(0, 12 - m + 1 - d/30);
  const flexRest = fx.maandRunRate * restMnd;
  const doel = od.doel;
  const tekort = Math.max(0, doel - gerealiseerd - nogDitJaar - flexRest);
  const gemFee = k.gemFee || 8500;
  const plNodig = tekort > 0 ? Math.ceil(tekort / gemFee) : 0;
  const pctW = x => Math.max(0, Math.min(100, doel ? x / doel * 100 : 0));
  const doelHtml = `
    <div class="fin-doelbar" title="gefactureerd · gepland · flex rest van het jaar">
      <i style="width:${pctW(gerealiseerd)}%"></i><i class="b" style="width:${pctW(nogDitJaar)}%"></i><i class="c" style="width:${pctW(flexRest)}%"></i></div>
    <div class="fin-pot"><span><span class="fin-dot a"></span>Omzet dit jaar${nmJaar.length || Sn(f,'yuki_omzet_ytd',0) > 0 ? ' (Nmbrs)' : ''}</span><b>${eur(gerealiseerd)}</b></div>
    <div class="fin-pot"><span><span class="fin-dot b"></span>Nog te factureren dit jaar</span><b>${eur(nogDitJaar)}</b></div>
    <div class="fin-pot"><span><span class="fin-dot c"></span>Flex rest van het jaar (verwacht)</span><b>${eur(flexRest)}</b></div>
    <div class="fin-pot"><span><b>${tekort > 0 ? 'Nog nodig' : 'Doel gehaald met wat er ligt'}</b></span>
      <b>${tekort > 0 ? `${eur(tekort)} <span class="meta">≈ ${plNodig} plaatsing${plNodig === 1 ? '' : 'en'}</span>` : '✓'}</b></div>
    <p class="meta" style="margin:8px 0 0">Doel ${eur(doel)} · gemiddelde fee dit jaar ${eur(gemFee)} ·
      <button type="button" class="lnk" data-inst>doel aanpassen</button></p>`;

  /* ── kas 13 weken ── */
  const kasRijen = wp.weeks.map(w => `<tr${w === wp.laagste ? ' class="fin-laagst"' : ''}>
    <td class="num">${H(dKort(w.start))}${w === wp.laagste ? ' ' + chip('krapst','amber') : ''}</td>
    <td class="n num">${w.in ? eur(w.in) : '—'}</td>
    <td class="n num">${w.uit ? eur(w.uit) : '—'}</td>
    <td class="n"><b class="num${w.saldo < 0 ? ' neg' : ''}">${eurN(w.saldo)}</b></td></tr>`).join('');

  /* ── begroting (vaste lasten) ── */
  const lopend = f.budget.filter(b => !b.tot_maand || String(b.tot_maand).slice(0,7) >= mk.slice(0,7))
    .sort((a,b) => String(a.vanaf_maand||'').localeCompare(String(b.vanaf_maand||'')) || getal(b.bedrag_pm) - getal(a.bedrag_pm));
  const budgetNu = budgetVoorMaand(f, mk);
  const periode = b => {
    const van = String(b.vanaf_maand||'').slice(0,7), tot = b.tot_maand ? String(b.tot_maand).slice(0,7) : '';
    if(van > mk.slice(0,7)) return 'vanaf ' + mkLabel(van + '-01');
    return tot ? 't/m ' + mkLabel(tot + '-01') : '';
  };
  const lastRijen = lopend.map(b => `<tr class="clickable" data-budget="${H(b.id)}">
    <td><b>${H(tekst(b.categorie))}</b> <span class="meta">${postSoort('', b.categorie) === 'vast' ? 'vast' : 'variabel'}</span>${b.note ? `<div class="rowsub">${H(b.note)}</div>` : ''}</td>
    <td class="meta">${H(periode(b))}</td>
    <td class="n num">${eur(getal(b.bedrag_pm))}</td></tr>`).join('');
  const voorstelKlaar = f.budget.some(b => String(b.categorie||'') === BEGROTING_NOV[0].categorie && String(b.vanaf_maand||'').slice(0,7) === BEGROTING_VANAF.slice(0,7));

  el.innerHTML = `
    ${strip([
      ['Banksaldo', saldo ? eur(getal(saldo.saldo)) : '—', saldo ? 'stand ' + H(dKort(saldo.datum)) : 'nog niet ingevuld'],
      (() => { const b = binnenMaand(f, t.slice(0,7)); return ['Binnen ' + mkLabel(mk), eur(b.echt),
        b.wsVerwacht ? `+ ${eur(b.wsVerwacht)} verwacht deze maand` : 'echt ontvangen, excl. btw']; })(),
      vorige ? ['Resultaat ' + mkLabel(vorige.mk7 + '-01'), `<span class="${vorige.resultaat < 0 ? 'neg' : ''}">${eurN(vorige.resultaat)}</span>`,
        `omzet ${eur(vorige.omzet)} · kosten ${eur(vorige.kosten)}`] : ['Resultaat', '—', 'wacht op Nmbrs'],
      kb ? ['Kosten ' + mkLabel(kb.laatst.mk7 + '-01'), eur(kb.laatst.kosten),
        `${(kb.dVast + kb.dVar) > 0 ? '<span class="neg">+' : '<span class="pos">−'}${eur(Math.abs(kb.dVast + kb.dVar))}</span> t.o.v. gemiddeld`]
        : ['Begrote kosten', eur(budgetNu), 'per maand'],
    ])}
    <div class="stack">
      ${maandKaart(f)}
      ${bewakingKaart(f)}
      ${waardeKaart(f)}
      <div class="grid c2 fin-geld">
        ${kaart('Kas komende 13 weken', tabel('<th>Week van</th><th class="n">In</th><th class="n">Uit</th><th class="n">Saldo</th>', kasRijen),
          {plat:true, voet:'Incl. btw. Alleen wat vastligt: termijnen, flex-gemiddelde, vaste lasten, btw-afdracht en aflossing.'})}
        <div class="stack">
          ${kaart(`Jaardoel ${jaar}`, doelHtml)}
          ${kaart('Begroting per maand', (lastRijen ? tabel('<th>Post</th><th></th><th class="n">Per maand</th>', lastRijen)
              : `<div style="padding:18px 22px">${CRM.ui.leeg('Nog geen begroting','Voeg je maandelijkse kosten toe.')}</div>`)
            + (voorstelKlaar ? '' : `<div class="fin-werkelijk"><button type="button" class="btn sm" id="fin_begroting_nov">Nieuwe begroting vanaf ${H(mkLabel(BEGROTING_VANAF))} klaarzetten…</button></div>`),
            {plat:true, acties:'<button class="btn ghost sm" id="fin_budget_nieuw">+ Post</button>',
             voet:'Dit is wat je verwacht uit te geven; de prognose rekent hiermee. Wat je écht uitgeeft komt uit Nmbrs (Kosten, hierboven).'})}
        </div>
      </div>
    </div>
    <div id="fin_meta_blok" style="margin-top:16px">${CRM.ui.laden('Betalingen aan Meta ophalen…')}</div>`;

  const herteken = () => tabGeld(el, f);
  el.querySelectorAll('[data-inst]').forEach(b => b.onclick = () => instellingenPaneel(f));
  el.querySelector('#fin_budget_nieuw').onclick = () => budgetVenster(f, null, herteken);
  el.querySelectorAll('[data-budget]').forEach(tr => tr.onclick = () =>
    budgetVenster(f, f.budget.find(b => String(b.id) === tr.dataset.budget), herteken));
  const nm = el.querySelector('#fin_nmbrs'); if(nm) nm.onclick = () => nmbrsSync(false);
  const ap = el.querySelector('#fin_alleposten'); if(ap) ap.onclick = () => { _allePosten = !_allePosten; herteken(); };
  const am = el.querySelector('#fin_allemaanden'); if(am) am.onclick = () => { _alleMaanden = !_alleMaanden; herteken(); };
  const bn = el.querySelector('#fin_begroting_nov'); if(bn) bn.onclick = () => begrotingVoorstel(f, herteken);
  metaBlok(el, f);
}

/* ─── Nieuwe begroting vanaf november 2026 ──────────────────────────
   Uit de loonstroken van oktober en de Nmbrs-vergelijking per maand
   (27 okt 2026): Rajesh volledig in dienst (€3.390), Daan van Elk als ZZP
   (€4.500), lonen incl. 8% vakantiegeld en ±21,5% werkgeverslasten.
   Eén klik: lopende posten stoppen eind oktober, deze gaan in per
   november. Daarna gewoon per post aan te passen.                    */
const BEGROTING_VANAF = '2026-11-01';
const BEGROTING_NOV = [
  {categorie:'Lonen (Bryan, Tjerk, Rajesh)', bedrag_pm:11580, note:'€8.940 bruto + 8% vakantiegeld + ±21,5% werkgeverslasten'},
  {categorie:'Management fee TVE', bedrag_pm:6000, note:null},
  {categorie:'Daan van Elk (ZZP)', bedrag_pm:4500, note:null},
  {categorie:'Huisvesting (huur, energie)', bedrag_pm:930, note:null},
  {categorie:'Auto\'s (verzekering, brandstof)', bedrag_pm:1200, note:'gemiddelde apr–okt'},
  {categorie:'Ziekteverzuimverzekering', bedrag_pm:211, note:null},
  {categorie:'Marketing en advertenties', bedrag_pm:8230, note:'gemiddelde laatste 3 maanden'},
  {categorie:'Kantoor en overig', bedrag_pm:1700, note:'kantoor, IT, administratie, lunches'}
];
function begrotingVoorstel(f, klaar){
  const stoppen = f.budget.filter(b => !b.tot_maand || String(b.tot_maand).slice(0,7) >= BEGROTING_VANAF.slice(0,7));
  const eindOud = addDays(BEGROTING_VANAF, -1).slice(0,7) + '-01';
  const tot = BEGROTING_NOV.reduce((s,b) => s + b.bedrag_pm, 0);
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe begroting vanaf ${H(mkLabel(BEGROTING_VANAF))}</div>
      <p class="sub" style="margin:6px 0 0">Uit je loonstroken van oktober en de Nmbrs-cijfers per maand.</p></div>
    <div class="modal-b">
      ${BEGROTING_NOV.map(b => `<div class="fin-pot"><span>${H(b.categorie)}${b.note ? `<div class="meta" style="font-size:12px">${H(b.note)}</div>` : ''}</span><b>${eur(b.bedrag_pm)}</b></div>`).join('')}
      <div class="fin-pot"><span><b>Totaal per maand</b></span><b>${eur(tot)}</b></div>
      ${stoppen.length ? `<p class="meta" style="margin:12px 0 0">${stoppen.length} huidige post${stoppen.length === 1 ? '' : 'en'} stop${stoppen.length === 1 ? 't' : 'pen'} eind oktober
        (${H(stoppen.map(b => b.categorie).join(', '))}); de geschiedenis blijft bewaard.</p>` : ''}
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button><button class="btn" id="bg_ok">Klaarzetten</button></div>`, {
    onClose(){ klaar(); },
    onOpen(m){
      m.querySelector('#bg_ok').onclick = () => finDoe(m.querySelector('#bg_ok'), async () => {
        for(const b of stoppen){
          await finSchrijf('fin_costs_budget', q => q.update({tot_maand: eindOud}).eq('id', b.id));
          b.tot_maand = eindOud;
        }
        const rijen = BEGROTING_NOV.map(b => Object.assign({vanaf_maand: BEGROTING_VANAF, tot_maand: null}, b));
        const data = await finSchrijf('fin_costs_budget', q => q.insert(rijen).select());
        f.budget.push(...(data || rijen.map(r => Object.assign({id: ++_mockId}, r))));
      }, 'Begroting vanaf november staat klaar', ok => { if(ok){ CRM.modal._onClose = null; CRM.modal.close(); klaar(); } });
    }});
}

/* ─── Venster: vaste last ───────────────────────────────────────── */
function budgetVenster(f, b, klaar){
  const mnd = iso => iso ? String(iso).slice(0,7) : '';
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${b ? 'Vaste last bewerken' : 'Nieuwe vaste last'}</div></div>
    <div class="modal-b"><div class="f-grid">
      <div class="f-row"><label for="bv_cat">Post</label><input id="bv_cat" value="${H(b ? b.categorie || '' : '')}" placeholder="bijv. Software"></div>
      <div class="f-row"><label for="bv_bedrag">Bedrag per maand (€)</label><input id="bv_bedrag" type="number" step="0.01" value="${H(b ? getal(b.bedrag_pm) : '')}"></div>
      <div class="f-row"><label for="bv_van">Vanaf</label><input id="bv_van" type="month" value="${H(mnd(b && b.vanaf_maand) || todayISO().slice(0,7))}"></div>
      <div class="f-row"><label for="bv_tot">Tot en met <span class="meta">(leeg = doorlopend)</span></label><input id="bv_tot" type="month" value="${H(mnd(b && b.tot_maand))}"></div>
    </div>
    <div class="f-row"><label for="bv_note">Notitie</label><input id="bv_note" value="${H(b ? b.note || '' : '')}"></div></div>
    <div class="modal-f">${b ? '<button class="btn ghost" id="bv_weg">Verwijderen</button><span class="spacer"></span>' : ''}
      <button class="btn ghost" data-mclose>Annuleren</button><button class="btn" id="bv_ok">Opslaan</button></div>`, {
    onClose(){ klaar(); },
    onOpen(m){
      const q = s => m.querySelector(s);
      const sluit = ok => { if(ok){ CRM.modal._onClose = null; CRM.modal.close(); klaar(); } };
      q('#bv_ok').onclick = () => {
        const rij = {categorie: q('#bv_cat').value.trim(), bedrag_pm: getal(q('#bv_bedrag').value),
          vanaf_maand: (q('#bv_van').value || todayISO().slice(0,7)) + '-01',
          tot_maand: q('#bv_tot').value ? q('#bv_tot').value + '-01' : null, note: q('#bv_note').value.trim() || null};
        if(!rij.categorie) return CRM.toast('Geef de post een naam', 'err');
        finDoe(q('#bv_ok'), async () => {
          if(b){ await finSchrijf('fin_costs_budget', q2 => q2.update(rij).eq('id', b.id)); Object.assign(b, rij); }
          else{
            const data = await finSchrijf('fin_costs_budget', q2 => q2.insert(rij).select());
            f.budget.push((data && data[0]) || Object.assign({id: ++_mockId}, rij));
          }
        }, 'Vaste last opgeslagen', sluit);
      };
      if(q('#bv_weg')) q('#bv_weg').onclick = () => finDoe(q('#bv_weg'), async () => {
        await finSchrijf('fin_costs_budget', q2 => q2.delete().eq('id', b.id));
        f.budget = f.budget.filter(x => x !== b);
      }, 'Vaste last verwijderd', sluit);
    }});
}

/* ─── Paneel: instellingen (⚙) ──────────────────────────────────────
   Alleen wat de vier schermen gebruiken. W&S-fees staan niet hier maar
   per klant bij Commerciële afspraken — dat is de getekende bron.     */
const INST_VELDEN = [
  ['doel_omzet_jaar',       'Omzetdoel dit jaar (€)',                   'eur', 400000,
    'Waar de balk "Jaardoel" onder Geld naartoe telt.'],
  ['btw_pct',               'Btw (%)',                                  'pct', 0.21,
    'Voor de bedragen incl. btw en het btw-potje. Normaal 21.'],
  ['vpb_pct',               'Vpb-reservering (% van de winst)',         'pct', 0.19,
    'Hoeveel van je winst je opzij zet voor de vennootschapsbelasting (19% tot €200.000 winst).'],
  ['voorbelasting_pm',      'Btw op je kosten per maand (€)',           'eur', 0,
    'De btw die je zelf betaalt op inkopen; die mag je aftrekken, dus het btw-potje wordt kleiner.'],
  ['default_betaaltermijn', 'Standaard betaaltermijn (dagen)',          'int', 14,
    'Voor een nieuwe plaatsing zonder afspraak met de klant. Met afspraak geldt die van de afspraak.'],
  ['waarschuwing_dgn',      'Factuur vooraf melden (dagen)',            'int', 21,
    'Bij 21 zie je een factuur al 21 dagen vóór de datum op Vandaag staan.'],
  ['stop_achterstand_mnd',  'Termijnen behouden na een stop (maanden)', 'int', 1,
    'Stopt een kandidaat, dan factureer je nog deze maanden na de stopdatum; de termijnen daarna vervallen.'],
  ['flex_inkoop_factor',    'Standaard inkoopfactor flex (Pronkert)',   'num', 1.8,
    'Wat Pronkert per uur rekent (× uurloon) als een flex-afspraak geen eigen inkoopfactor heeft.'],
  ['flex_betaaltermijn',    'Pronkert betaalt na factuurdatum (dagen)', 'int', 30,
    'Elke margefactuur wordt zoveel dagen na de factuurdatum (zondag van de werkweek) uitbetaald. Hiermee rekent "wat komt er binnen" voor flex.']
];
function instellingenPaneel(f){
  const toon = (key, type, std) => {
    const v = S(f, key, null);
    if(v == null || v === '') return type === 'pct' ? Math.round(std * 1000) / 10 : std;
    return type === 'pct' ? Math.round(getal(v) * 1000) / 10 : getal(v);
  };
  const afspr = f.flexAfspr.slice().sort((a,b) => String(a.klant||'').localeCompare(String(b.klant||''), 'nl'));
  CRM.drawer.open(`
    <div class="drawer-h"><div style="flex:1"><div class="h2" style="font-size:17px">Instellingen</div>
      <div class="meta" style="margin-top:3px">Finance — alleen voor jou</div></div>
      <button class="btn ghost sm x" data-close>Sluiten</button></div>
    <div class="drawer-b">
      ${kaart('Doelen en percentages', `<div class="f-grid">${INST_VELDEN.map(([key, lbl, type, std, uitleg]) =>
        `<div class="f-row"><label for="in_${key}">${H(lbl)}</label>
          <input type="number" step="any" id="in_${key}" data-key="${key}" data-type="${type}" value="${H(toon(key, type, std))}">
          <span class="hint">${H(uitleg)}</span></div>`).join('')}</div>
        <div class="row tight"><span class="spacer"></span><button class="btn sm" id="in_ok">Opslaan</button></div>`)}
      <div style="margin-top:14px">${kaart('Flex-afspraken per klant', afspr.length
        ? tabel('<th>Klant</th><th class="n">Klantfactor</th><th class="n">Inkoop</th><th class="n">Overname na</th>',
            afspr.map(a => `<tr class="clickable" data-fa="${H(a.id)}"><td><b>${H(tekst(a.klant))}</b></td>
              <td class="n num">${a.factor != null ? num(getal(a.factor), 2) : '—'}</td>
              <td class="n num">${a.inkoop_factor != null && a.inkoop_factor !== '' ? num(getal(a.inkoop_factor), 2) : '<span class="meta">standaard</span>'}</td>
              <td class="n num">${a.overname_uren ? H(a.overname_uren) + ' u' : '—'}</td></tr>`).join(''))
        : `<div style="padding:18px 22px">${CRM.ui.leeg('Nog geen flex-afspraken','')}</div>`,
        {plat:true, acties:'<button class="btn ghost sm" id="in_fa_nieuw">+ Afspraak</button>'})}</div>
      <div style="margin-top:14px">${kaart('Overname-uren per klant (flex)', `<div class="f-grid">${
        [...Object.entries(overnameLijst(f)), ['', '']].map(([k, u], i) => `<div class="f-row"><label>Klant</label>
          <input data-ovk="${i}" value="${H(k)}" placeholder="bijv. Thermon"></div>
          <div class="f-row"><label>Uren tot kosteloze overname</label>
          <input data-ovu="${i}" type="number" step="1" value="${H(u)}" placeholder="1560"></div>`).join('')}</div>
        <div class="row tight"><span class="meta">Leeg een klant om hem te verwijderen.</span><span class="spacer"></span>
          <button class="btn sm" id="in_ov_ok">Opslaan</button></div>`)}</div>
      <p class="meta" style="margin:14px 2px 0">W&amp;S-fees leg je per klant vast onder Commerciële afspraken op de klantkaart.
        Nmbrs (banksaldo, kosten per post, omzet) ververst vanzelf zodra je Finance opent — laatst: ${H(nmbrsStand(f))}.</p>
    </div>`, {onOpen(dr){
    const opnieuw = () => instellingenPaneel(f);
    dr.querySelector('#in_ok').onclick = () => {
      const wijz = [];
      dr.querySelectorAll('[data-key]').forEach(inp => {
        const ruw = inp.value.trim(); if(ruw === '') return;
        const v = inp.dataset.type === 'pct' ? getal(ruw) / 100 : getal(ruw);
        if(getal(S(f, inp.dataset.key, null), NaN) !== v) wijz.push({key: inp.dataset.key, value: v});
      });
      if(!wijz.length) return CRM.toast('Niets gewijzigd');
      finDoe(dr.querySelector('#in_ok'), async () => {
        await finSchrijf('fin_settings', q => q.upsert(wijz));
        wijz.forEach(w => { f.settings[w.key] = w.value; });
      }, 'Instellingen opgeslagen', ok => { if(ok){ CRM.drawer.close(); CRM.render(); } });
    };
    dr.querySelector('#in_ov_ok').onclick = () => {
      const lijst = {};
      dr.querySelectorAll('[data-ovk]').forEach(inp => {
        const k = inp.value.trim(), u = getal(dr.querySelector(`[data-ovu="${inp.dataset.ovk}"]`).value);
        if(k && u) lijst[k] = u;
      });
      finDoe(dr.querySelector('#in_ov_ok'), () => overnameBewaren(f, lijst), 'Overname-uren opgeslagen', ok => ok && opnieuw());
    };
    dr.querySelector('#in_fa_nieuw').onclick = () => flexAfspraakVenster(f, null, opnieuw);
    dr.querySelectorAll('[data-fa]').forEach(tr => tr.onclick = () =>
      flexAfspraakVenster(f, f.flexAfspr.find(a => String(a.id) === tr.dataset.fa), opnieuw));
  }});
}

/* ─── Venster: flex-afspraak per klant ──────────────────────────────
   De inkoopfactor mag leeg (dan geldt de standaard uit de instellingen) —
   maar nooit als 0 opgeslagen: met inkoop 0 werd de hele klantprijs als
   marge gerekend (audit 27 okt 2026).                                  */
function flexAfspraakVenster(f, a, klaar){
  const klanten = [...new Set(((CRM.state && CRM.state.clients) || []).map(k => k.naam).filter(Boolean))].sort((x,y) => x.localeCompare(y, 'nl'));
  const w = v => H(v == null ? '' : v);
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${a ? 'Flex-afspraak bewerken' : 'Nieuwe flex-afspraak'}</div></div>
    <div class="modal-b"><div class="f-grid">
      <div class="f-row"><label for="fa_klant">Klant</label><input id="fa_klant" list="fa_klanten" value="${w(a && a.klant)}">
        <datalist id="fa_klanten">${klanten.map(k => `<option value="${H(k)}">`).join('')}</datalist></div>
      <div class="f-row"><label for="fa_factor">Klantfactor</label><input id="fa_factor" type="number" step="0.01" value="${w(a && a.factor)}" placeholder="bijv. 2,35"></div>
      <div class="f-row"><label for="fa_inkoop">Inkoopfactor Pronkert <span class="meta">(leeg = standaard)</span></label>
        <input id="fa_inkoop" type="number" step="0.0001" value="${w(a && a.inkoop_factor)}"></div>
      <div class="f-row"><label for="fa_ovn">Kosteloze overname na (uren)</label><input id="fa_ovn" type="number" step="1" value="${w(a && a.overname_uren)}"></div>
    </div></div>
    <div class="modal-f">${a ? '<button class="btn ghost" id="fa_weg">Verwijderen</button><span class="spacer"></span>' : ''}
      <button class="btn ghost" data-mclose>Annuleren</button><button class="btn" id="fa_ok">Opslaan</button></div>`, {
    onClose(){ klaar(); },
    onOpen(m){
      const q = s => m.querySelector(s);
      const sluit = ok => { if(ok){ CRM.modal._onClose = null; CRM.modal.close(); klaar(); } };
      q('#fa_ok').onclick = () => {
        const inkoop = getalOfNull(q('#fa_inkoop').value);
        const rij = {klant: q('#fa_klant').value.trim(), factor: getalOfNull(q('#fa_factor').value),
          inkoop_factor: inkoop ? inkoop : null, overname_uren: getalOfNull(q('#fa_ovn').value)};
        if(!rij.klant || !rij.factor) return CRM.toast('Klant en klantfactor zijn verplicht', 'err');
        finDoe(q('#fa_ok'), async () => {
          if(a){ await finSchrijf('fin_flex_afspraken', q2 => q2.update(rij).eq('id', a.id)); Object.assign(a, rij); }
          else{
            const data = await finSchrijf('fin_flex_afspraken', q2 => q2.insert(rij).select());
            f.flexAfspr.push((data && data[0]) || Object.assign({id: ++_mockId}, rij));
          }
        }, 'Flex-afspraak opgeslagen', sluit);
      };
      if(q('#fa_weg')) q('#fa_weg').onclick = () => finDoe(q('#fa_weg'), async () => {
        await finSchrijf('fin_flex_afspraken', q2 => q2.delete().eq('id', a.id));
        f.flexAfspr = f.flexAfspr.filter(x => x !== a);
      }, 'Flex-afspraak verwijderd', sluit);
    }});
}

/* ─── Betaald aan Meta: het scherm ────────────────────────────
   Twee dingen tegelijk: het verschil per maand (daar gaat het om) en
   de gevonden bankregels (zodat je kunt zien of de herkenning klopt).
   Wat het NIET doet: bedragen omrekenen. Verlegde btw en het moment
   van afschrijven verklaren allebei een verschil; welke van de twee
   het is, kan dit scherm niet weten — dus zegt het dat gewoon.       */

/* Waarom bank en Meta niet gelijk hóéven te lopen. Staat onder elke
   variant van het blok: zonder deze twee zinnen trek je de verkeerde
   conclusie uit een verschil van een paar honderd euro. */
const META_UITLEG = `
  <div class="note info" style="margin-top:14px">
    <b>Een verschil is niet meteen een fout.</b>
    <div class="fin-meta-uitleg">
      <p><b>Btw.</b> Meta factureert aan Nederlandse bedrijven meestal met verlegde btw:
      op de factuur staat 0% en jij geeft de btw zelf aan. Wat er van de rekening gaat ligt
      dan dicht bij het bedrag exclusief btw — precies wat Meta hier rapporteert. Staat er op
      jouw facturen wél btw, dan is het bankbedrag ongeveer 21% hoger. Er wordt hier niets
      omgerekend: je ziet wat er staat.</p>
      <p><b>Timing.</b> Meta schrijft af zodra je een drempelbedrag haalt, of maandelijks
      achteraf. Uitgaven van eind juli kunnen dus begin augustus van de rekening gaan.
      Kijk daarom niet naar één maand, maar naar de rij maanden achter elkaar: loopt het
      structureel uit elkaar, dan klopt er iets niet.</p>
    </div>
  </div>`;

/* Dit blok rekent tot op de cent. Elders in finance staan bedragen in hele
   euro's, maar hier gaat het om het VERSCHIL tussen twee bronnen: rond je af,
   dan klopt "1.556 − 1.712 = −157" niet meer met wat er in de kolommen staat,
   en dan ga je twijfelen aan het scherm in plaats van aan de cijfers. */
/* Het verschil krijgt bewust GEEN olijf/rood. Elders in het CRM betekent
   groen "goed", en "er is meer van de rekening gegaan dan Meta rapporteert"
   is niet goed — het is alleen een richting. Kleur zou hier een oordeel
   suggereren dat dit scherm niet kan vellen. Alleen het teken dus. */
const signEur2 = n => { const v = Number(n) || 0;
  return `<span class="num">${v<0?'−':'+'}${eur2(Math.abs(v))}</span>`; };

function metaFoutNote(md){
  /* Zoveel dagregels dat we tegen de leeslimiet aan lopen: dan is "wat Meta
     rapporteert" mogelijk niet compleet, en dat moet je weten vóór je een
     verschil gaat verklaren. */
  const volNote = md.vol ? `<div class="note warn" style="margin-bottom:14px">
    <b>Er zijn meer Meta-dagregels dan dit scherm in één keer leest.</b><br>
    De kolom "Meta rapporteert" kan daardoor te laag uitvallen. Het bedrag van de bankrekening klopt wél.
  </div>` : '';
  if(!md.mist || !md.mist.length) return volNote;
  const tech = md.fout && md.fout.message ? String(md.fout.message) : '';
  const geenStats = md.mist.includes('mkt_meta_stats');
  return `${volNote}<div class="note warn" style="margin-bottom:14px">
    <b>${H(md.mist.join(' en '))} kon niet gelezen worden.</b><br>
    ${geenStats
      ? 'Wat Meta zelf rapporteert ontbreekt daardoor; de bedragen van de bankrekening hieronder kloppen wél.'
      : 'Wat het team te zien krijgt kon niet opgehaald worden. Bijwerken kan daardoor mislukken.'}
    ${tech ? `<br><span class="meta">Technische melding: ${H(tech)}</span>` : ''}
  </div>`;
}

function metaTermenRegel(an){
  return `<div class="fin-meta-termen">
    <span class="label">Gezocht op</span>
    ${an.termen.map(t => chip(t)).join(' ')}
  </div>`;
}

/* Eén gevonden bankregel. `datum`, `tegenpartij` en `omschrijving`
   blijven hier — dit scherm is alleen voor Tjeerd. Naar het team gaat
   uitsluitend het maandtotaal (zie metaRijenVoorTeam). */
function metaTxRij(g){
  const twijfel = !!g.twijfel.length;
  const oms = tekst(g.tx.omschrijving, '');
  return `<tr${g.uit ? ' class="fin-meta-uit"' : ''}>
    <td><span class="num">${H(dKort(g.tx.datum))}</span></td>
    <td><b>${H(tekst(g.tx.tegenpartij, 'geen tegenpartij'))}</b>
      ${oms ? `<div class="rowsub">${H(oms.length > 90 ? oms.slice(0,90) + '…' : oms)}</div>` : ''}</td>
    <td class="n">${g.bedrag > 0
      ? `<span class="num pos">+${eur2(g.bedrag)}</span>`
      : `<span class="num">${eur2(g.afgeschreven || 0)}</span>`}</td>
    <td>${chip(g.term, twijfel ? 'amber' : '')}
      <div class="rowsub">${H(g.veld === 'tegenpartij' ? 'in de tegenpartij' : 'in de omschrijving')}</div></td>
    <td>${twijfel
      ? `${chip('controleer','amber')}<div class="rowsub">${H(g.twijfel.join(' · '))}</div>`
      : (g.viaOms
        ? `<span class="meta">herkend aan de omschrijving, niet aan de tegenpartij</span>`
        : `<span class="meta">—</span>`)}</td>
    <td class="n"><label class="fin-meta-vink">
      <input type="checkbox" data-metatx="${H(g.id)}"${g.uit ? '' : ' checked'}>
      <span>${g.uit ? 'telt niet mee' : 'telt mee'}</span></label></td>
  </tr>`;
}

function metaMaandRij(m){
  const detail = [];
  if(m.regels)      detail.push(m.regels + ' transactie' + (m.regels === 1 ? '' : 's'));
  if(m.uitgesloten) detail.push(m.uitgesloten + ' uitgezet');
  if(m.loopt)       detail.push('loopt nog');
  const gedeeld = m.opgeslagen
    ? `<span class="num">${eur2(m.gedeeld)}</span>
       <div class="rowsub">${H(tekst(m.opgeslagen.door, 'onbekend'))} · ${H(dKort(m.opgeslagen.bijgewerkt))}${
         m.verouderd ? ' · wijkt af van de berekening hiernaast' : ''}</div>`
    : '<span class="meta">nog niet gedeeld</span>';
  return `<tr>
    <td><b>${H(mkLabel(m.mk))}</b>${detail.length ? `<div class="rowsub">${H(detail.join(' · '))}</div>` : ''}</td>
    <td class="n">${m.betaald == null
      ? '<span class="meta">niets gevonden</span>'
      : `<b class="num">${eur2(m.betaald)}</b>${m.twijfel ? ' ' + chip(m.twijfel + '× controleer','amber') : ''}`}</td>
    <td class="n">${m.gerapporteerd == null
      ? '<span class="meta">geen Meta-cijfers</span>'
      : `<span class="num">${eur2(m.gerapporteerd)}</span><div class="rowsub">${m.statDagen} dag${m.statDagen === 1 ? '' : 'en'} gerapporteerd</div>`}</td>
    <td class="n">${m.verschil == null
      ? '<span class="meta">—</span>'
      : `${signEur2(m.verschil)}${m.afwijking != null ? `<div class="rowsub">${H(pct0(Math.abs(m.afwijking)))} ${m.verschil >= 0 ? 'meer' : 'minder'} betaald</div>` : ''}`}</td>
    <td>${gedeeld}</td>
  </tr>`;
}

function metaKaart(f, md, an){
  const acties = `<div class="row tight">
    <button class="btn ghost sm" id="fin_meta_term">Zoektermen</button>
    <button class="btn sub sm" id="fin_meta_bij"${an.teDelen.length ? '' : ' disabled title="Er is nog geen maandtotaal om te delen"'}>Bijwerken voor het team</button>
  </div>`;
  const voet = 'Alleen het maandtotaal, het aantal regels en jouw naam gaan naar het team — nooit een '
             + 'omschrijving, tegenpartij of los bedrag. '
             + (an.gevonden.length
                ? 'De banktransacties hieronder blijven op dit scherm.'
                : 'Banktransacties blijven altijd op dit scherm.');

  /* Geen bankexport, geen gegevens. */
  if(!an.txTotaal){
    return kaart('Betaald aan Meta', `
      ${metaFoutNote(md)}
      ${metaTermenRegel(an)}
      <div class="note warn" style="margin-top:12px">
        <b>Er staat nog geen bankafschrift in de database.</b><br>
        Zonder banktransacties valt er niets te controleren: het CRM kan alleen zien wat er aan Meta
        betaald is als de mutaties zijn ingelezen. Importeer een bank-CSV op de Cashflow-pagina van de
        finance-app; daarna verschijnt hier per maand wat er werkelijk is afgeschreven.
        <div style="margin-top:10px" class="row tight">
          <a class="btn sub" href="${FIN_APP}#cashflow" target="_blank" rel="noopener">Bank-CSV importeren in de finance-app ↗</a>
        </div>
      </div>
      ${an.zichtbaar.some(m => m.gerapporteerd != null) ? `
        <div style="margin-top:14px">
          <div class="label" style="margin-bottom:6px">Wat Meta zelf rapporteert</div>
          ${tabel('<th>Maand</th><th class="n">Meta rapporteert</th><th class="n">Dagen</th>',
            an.zichtbaar.filter(m => m.gerapporteerd != null).map(m => `<tr>
              <td><b>${H(mkLabel(m.mk))}</b></td>
              <td class="n num">${eur2(m.gerapporteerd)}</td>
              <td class="n num meta">${m.statDagen}</td></tr>`).join(''))}
        </div>` : ''}
      ${META_UITLEG}`, {acties, voet});
  }

  /* Wel transacties, geen enkele herkend. */
  if(!an.gevonden.length){
    return kaart('Betaald aan Meta', `
      ${metaFoutNote(md)}
      ${metaTermenRegel(an)}
      <div class="note warn" style="margin-top:12px">
        <b>Geen enkele banktransactie herkend als Meta.</b><br>
        Er zijn ${H(String(an.txTotaal))} transactie${an.txTotaal === 1 ? '' : 's'} doorzocht op tegenpartij én
        omschrijving, maar geen daarvan bevat een van de zoektermen hierboven. Dat kan twee dingen betekenen:
        er is niets aan Meta betaald in deze periode, of jouw bank schrijft het anders op.
        Kijk in de finance-app hoe de afschrijving er letterlijk staat en voeg dat stuk tekst toe als zoekterm.
        <div style="margin-top:10px" class="row tight">
          <button class="btn sub" id="fin_meta_term2">Zoektermen aanpassen</button>
        </div>
      </div>
      ${an.zichtbaar.some(m => m.gerapporteerd != null) ? `
        <div style="margin-top:14px">
          <div class="label" style="margin-bottom:6px">Wat Meta zelf rapporteert</div>
          ${tabel('<th>Maand</th><th class="n">Meta rapporteert</th><th class="n">Dagen</th>',
            an.zichtbaar.filter(m => m.gerapporteerd != null).map(m => `<tr>
              <td><b>${H(mkLabel(m.mk))}</b></td>
              <td class="n num">${eur2(m.gerapporteerd)}</td>
              <td class="n num meta">${m.statDagen}</td></tr>`).join(''))}
        </div>` : ''}
      ${META_UITLEG}`, {acties, voet});
  }

  /* Het normale geval. */
  /* Ingekort tot 25 regels, maar élke twijfelachtige regel blijft staan:
     die zijn juist de reden dat deze lijst er is. De datumvolgorde blijft
     intact, zodat je niet ineens naar een andere sortering kijkt. */
  const toonTx = (() => {
    if(_metaAlles) return an.gevonden;
    const houden = new Set();
    let n = 0;
    for(const g of an.gevonden){
      if(g.twijfel.length) houden.add(g);
      else if(n < 25){ houden.add(g); n++; }
    }
    return an.gevonden.filter(g => houden.has(g));
  })();
  const conclusie = (an.totAfwijking == null)
    ? 'Er is nog geen maand waarin we van allebei iets weten — zodra dat er is, staat hier of de cijfers uit elkaar lopen.'
    : (Math.abs(an.totAfwijking) < 0.05
        ? `Over ${an.beideN} maand${an.beideN === 1 ? '' : 'en'} loopt het ${pct0(Math.abs(an.totAfwijking))} uit elkaar. Dat is klein genoeg om aan btw en het moment van afschrijven toe te schrijven: de cijfers van Meta zijn bruikbaar.`
        : `Over ${an.beideN} maand${an.beideN === 1 ? '' : 'en'} is er ${pct0(Math.abs(an.totAfwijking))} ${an.totVerschil > 0 ? 'méér van de rekening gegaan dan Meta rapporteert' : 'minder van de rekening gegaan dan Meta rapporteert'}. Kijk of dat aan btw of aan het afschrijfmoment ligt voordat je op deze cijfers stuurt.`);

  /* Netto-ROAS op bankwerkelijkheid (3 sep 2026, Performance-conceptplan A3):
     wat ging er écht van de rekening, en wat tekenden de Meta-plaatsingen in
     diezelfde maanden aan fees. Bewust één regel en bewust hiér — het
     cohortrendement (fee tegenover de spend van de instroommaand) staat op
     Performance; dit is de kasstroomkant, alleen voor de eigenaar. */
  const nettoRegel = (() => {
    if(!CRM.canSeeMoney() || an.totBetaald == null || !an.beideN) return '';
    const mks = new Set(an.maanden.filter(m => m.betaald != null && m.gerapporteerd != null).map(m => m.mk));
    let feeSom = 0, nPl = 0, zonderFee = 0;
    for(const c of CRM.kandidaten()){
      if(String(c.bron||'') !== 'Meta' || !CRM.teltAlsPlaatsing(c)) continue;
      const mk = String(c.geplaatstOp||'').slice(0,7);
      if(!mks.has(mk)) continue;
      nPl++;
      const f = CRM.fee.bereken(c, CRM.fee.voorKlant(c.klant, c.geplaatstOp || null));
      if(f && f.fee != null) feeSom += f.fee; else zonderFee++;
    }
    if(!nPl) return `<p class="sub" style="margin:10px 0 0">Netto over deze maanden: ${H(eur2(an.totBetaald))} naar Meta
      en nog geen Meta-plaatsing getekend — netto-ROAS: nog geen. Dat hoeft geen slecht nieuws te zijn: de leads
      van deze maanden kunnen nog lopen (het cohortrendement staat op Performance).</p>`;
    const netto = feeSom - an.totBetaald;
    return `<p class="sub" style="margin:10px 0 0"><b>Netto over dezelfde maanden:</b> ${H(eur2(an.totBetaald))} van de
      rekening naar Meta, tegenover ${H(eur2(feeSom))} aan fees uit ${nPl} Meta-plaatsing${nPl===1?'':'en'} die in die
      maanden tekende${nPl===1?'':'n'}${zonderFee ? ` (${zonderFee} zonder fee apart gehouden, telt niet als €0)` : ''} —
      netto ${netto >= 0 ? '+' : '−'}${H(eur2(Math.abs(netto)))}. Let op: dit vergelijkt kasmaanden, geen cohorten —
      wie in juli tekende kwam vaak eerder binnen. Het eerlijke cohortrendement per campagne staat op Performance.</p>`;
  })();

  return kaart('Betaald aan Meta', `
    ${metaFoutNote(md)}
    <div class="grid c3" style="margin-bottom:16px">
      ${CRM.ui.kpi('Van de rekening', H(eur2(an.totBetaald)),
        H(`${an.beideN} maand${an.beideN === 1 ? '' : 'en'} waarin we van allebei iets weten`), 'accent')}
      ${CRM.ui.kpi('Meta rapporteert zelf', H(eur2(an.totGerapp)), H('dezelfde maanden, uit mkt_meta_stats'))}
      ${CRM.ui.kpi('Verschil', an.totVerschil == null ? '—' : signEur2(an.totVerschil),
        H(an.totAfwijking == null ? 'nog niet te vergelijken' : pct0(Math.abs(an.totAfwijking)) + ' van wat Meta rapporteert'))}
    </div>

    ${metaTermenRegel(an)}
    <p class="sub" style="margin:10px 0 0">${H(conclusie)}</p>
    ${nettoRegel}

    ${an.twijfelN ? `<div class="note warn" style="margin-top:12px">
      <b>${H(String(an.twijfelN))} van de meegetelde transacties ${an.twijfelN === 1 ? 'is' : 'zijn'} twijfelachtig.</b><br>
      Ze staan hieronder met een oranje merkteken. Controleer ze voordat je het maandtotaal met het team deelt —
      één verkeerd gematchte regel is vervelender dan een gemiste.
    </div>` : ''}
    ${an.zonderDatum ? `<div class="note warn" style="margin-top:12px">
      <b>${H(String(an.zonderDatum))} herkende transactie${an.zonderDatum === 1 ? '' : 's'} zonder leesbare datum.</b><br>
      Die tellen in geen enkele maand mee. Corrigeer de datum in de finance-app.
    </div>` : ''}
    ${an.onleesbaar ? `<div class="note warn" style="margin-top:12px">
      <b>Bij ${H(String(an.onleesbaar))} herkende transactie${an.onleesbaar === 1 ? '' : 's'} is het bedrag niet als getal te lezen.</b><br>
      ${an.onleesbaar === 1 ? 'Die telt' : 'Die tellen'} hier als €0 en ${an.onleesbaar === 1 ? 'maakt' : 'maken'} het maandtotaal dus te laag.
      Corrigeer het bedrag in de finance-app voordat je dit met het team deelt.
    </div>` : ''}

    <div style="margin-top:16px">
      <div class="label" style="margin-bottom:6px">Per maand</div>
      ${tabel('<th>Maand</th><th class="n">Van de rekening</th><th class="n">Meta rapporteert</th>'
            + '<th class="n">Verschil</th><th>In het teamscherm</th>',
        an.zichtbaar.map(metaMaandRij).join(''))}
      ${an.maanden.length > an.zichtbaar.length
        ? `<p class="meta" style="margin:8px 2px 0">Er zijn ${H(String(an.maanden.length - an.zichtbaar.length))} oudere maand(en); dit scherm toont de laatste ${H(String(META_MAANDEN))}.</p>`
        : ''}
    </div>

    <div style="margin-top:18px">
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <span class="label">Gevonden transacties</span>
        <span class="meta">${H(String(an.meegeteld))} van ${H(String(an.txTotaal))} bankregels telt mee${
          an.uitgesloten ? ' · ' + H(String(an.uitgesloten)) + ' door jou uitgezet' : ''}</span>
      </div>
      ${tabel('<th>Datum</th><th>Tegenpartij</th><th class="n">Afgeschreven</th>'
            + '<th>Herkend op</th><th>Let op</th><th class="n">Meetellen</th>',
        toonTx.map(metaTxRij).join(''))}
      ${an.gevonden.length > toonTx.length
        ? `<div style="margin-top:10px"><button class="btn ghost sm" id="fin_meta_meer">Alle ${H(String(an.gevonden.length))} transacties tonen</button></div>`
        : (_metaAlles && an.gevonden.length > 25
          ? `<div style="margin-top:10px"><button class="btn ghost sm" id="fin_meta_minder">Alleen de laatste 25 tonen</button></div>`
          : '')}
    </div>

    ${META_UITLEG}`, {acties, voet});
}

/* De zoektermen aanpassen. Ze gaan naar fin_settings (owner-only), zodat
   de lijst niet in de code verstopt zit én op elk apparaat hetzelfde is. */
function metaTermenModal(f, nasleep){
  const huidig = metaTermen(f);
  const eigen = S(f, META_SETTING, null) != null;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Zoektermen voor Meta-betalingen</div></div>
    <div class="modal-b">
      <p class="sub" style="margin:0 0 10px">Eén term per regel. Een bankregel telt mee zodra de tegenpartij
        óf de omschrijving een van deze termen bevat; hoofdletters maken niet uit.</p>
      <textarea id="fin_meta_ta" rows="8" spellcheck="false">${H(huidig.join('\n'))}</textarea>
      <p class="meta" style="margin:10px 0 0">Zet er geen losse "meta" in: dan matcht ook Metaalunie en
        Metaal &amp; Techniek, en die staan bij jullie gewoon op het afschrift. Termen als "meta platforms"
        en "facebk" zijn specifiek genoeg.</p>
      ${eigen ? '' : '<p class="meta" style="margin:6px 0 0">Je gebruikt nu de standaardlijst.</p>'}
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn ghost" id="fin_meta_std">Standaardlijst herstellen</button>
      <button class="btn" id="fin_meta_ok">Bewaren</button>
    </div>`, {
      onOpen(m){
        const ta = m.querySelector('#fin_meta_ta');
        setTimeout(() => ta && ta.focus(), 60);
        m.querySelector('#fin_meta_std').onclick = () => {
          ta.value = META_TERMEN_STANDAARD.join('\n');
        };
        m.querySelector('#fin_meta_ok').onclick = async () => {
          const lijst = [...new Set(ta.value.split(/[\n,;]/)
            .map(t => t.trim().toLowerCase()).filter(Boolean))];
          if(!lijst.length){ CRM.toast('Vul minstens één zoekterm in','err'); return; }
          CRM.modal._onClose = null; CRM.modal.close();
          await metaTermenBewaren(f, lijst);
          if(nasleep) nasleep();
        };
      }});
}

async function metaTermenBewaren(f, lijst){
  if(!CRM.canSeeMoney()) return;
  /* Meteen in het geheugen, zodat het scherm klopt ook als het
     opslaan straks misgaat — dan zegt de melding dat erbij. */
  f.settings = f.settings || {};
  f.settings[META_SETTING] = lijst;
  if(_fin){ _fin.settings = _fin.settings || {}; _fin.settings[META_SETTING] = lijst; }
  if(CRM.demo){ CRM.toast('Demo-modus — de zoektermen worden niet opgeslagen','err'); return; }
  const {error} = await CRM.sb.from('fin_settings')
    .upsert([{key: META_SETTING, value: lijst}], {onConflict:'key'});
  if(error) return CRM.fout('Zoektermen opslaan mislukt', error);
  CRM.toast(lijst.length + ' zoekterm' + (lijst.length === 1 ? '' : 'en') + ' bewaard', 'ok');
}

/* Bijwerken = een schrijfactie, dus altijd van een klik en altijd met
   een bevestiging waarin staat wat er precies gedeeld wordt. */
async function metaBijwerken(f, an, nasleep){
  if(!CRM.canSeeMoney()) return;
  const rijen = metaRijenVoorTeam(an);
  if(!rijen.length){ CRM.toast('Er is nog geen maandtotaal om te delen','err'); return; }
  const totaal = rijen.reduce((s,r) => s + r.bedrag, 0);
  const ok = await CRM.bevestig(
    `${rijen.length} ${rijen.length === 1 ? 'maandtotaal' : 'maandtotalen'} delen met het team?`,
    `Het team ziet straks per maand alleen het bedrag en het aantal transacties — samen ${eur2(totaal)} over `
    + `${mkLabel(rijen[rijen.length-1].maand)} t/m ${mkLabel(rijen[0].maand)}. `
    + `Losse banktransacties, omschrijvingen en tegenpartijen blijven op dit scherm.`
    + (an.twijfelN ? ` Let op: ${an.twijfelN} meegetelde transactie${an.twijfelN === 1 ? '' : 's'} staat nog als twijfelachtig gemarkeerd.` : ''),
    {knop:'Ja, bijwerken'});
  if(!ok) return;

  if(CRM.demo){ CRM.toast('Demo-modus — er wordt niets weggeschreven','err'); return; }
  const {error} = await CRM.sb.from('mkt_meta_betaald').upsert(rijen, {onConflict:'maand'});
  if(error) return CRM.fout('Bijwerken mislukt', error);
  /* Lokaal meteen bijwerken zodat de kolom "In het teamscherm" klopt. */
  if(_meta){
    const rest = (_meta.betaald || []).filter(b => !rijen.some(r => r.maand === monthKey(b.maand)));
    _meta.betaald = rijen.concat(rest).sort((a,b) => String(b.maand).localeCompare(String(a.maand)));
  }
  CRM.toast(`${rijen.length} maand${rijen.length === 1 ? '' : 'en'} bijgewerkt — het team ziet nu ${eur2(totaal)}`, 'ok');
  if(nasleep) nasleep();
}

async function metaBlok(el, f){
  const doel = el.querySelector('#fin_meta_blok');
  if(!doel) return;
  /* Vierde grens naast navigatie, render en finLaad: zonder geldrecht
     wordt fin_bank_tx hier niet eens aangeraakt. */
  if(!CRM.canSeeMoney()){ doel.innerHTML = ''; return; }
  try{
    const md = await metaLaad();
    if(!doel.isConnected) return;      // je bent inmiddels naar een ander tabblad
    const an = metaAnalyse(f, md);
    doel.innerHTML = metaKaart(f, md, an);

    const opnieuw = () => metaBlok(el, f);
    const term = () => metaTermenModal(f, opnieuw);
    const t1 = doel.querySelector('#fin_meta_term');  if(t1) t1.onclick = term;
    const t2 = doel.querySelector('#fin_meta_term2'); if(t2) t2.onclick = term;
    const bij = doel.querySelector('#fin_meta_bij');
    if(bij) bij.onclick = () => metaBijwerken(f, an, opnieuw);
    const meer = doel.querySelector('#fin_meta_meer');
    if(meer) meer.onclick = () => { _metaAlles = true; opnieuw(); };
    const minder = doel.querySelector('#fin_meta_minder');
    if(minder) minder.onclick = () => { _metaAlles = false; opnieuw(); };
    doel.querySelectorAll('[data-metatx]').forEach(cb => cb.onchange = () => {
      const set = metaUitLijst();
      if(cb.checked) set.delete(cb.dataset.metatx); else set.add(cb.dataset.metatx);
      metaUitBewaar(set);
      opnieuw();
    });
  }catch(e){
    console.error('Finance — blok Betaald aan Meta', e);
    if(!doel.isConnected) return;
    doel.innerHTML = `<div class="note err">
      <b>Het blok "Betaald aan Meta" kon niet opgebouwd worden.</b><br>
      De rest van dit tabblad klopt gewoon. Vernieuw de cijfers met de knop rechtsboven.<br>
      <span class="meta">Technische melding: ${H((e && e.message) || String(e))}</span></div>`;
  }
}

/* ═══ Registratie ══════════════════════════════════════════════ */
const RENDERERS = {
  vandaag: tabVandaag, plaatsingen: tabPlaatsingen, facturatie: tabFacturatie, geld: tabGeld
};

CRM.registerModule('finance', {
  title:'Finance', icon:'€',
  onderschrift:'Wat er te doen is, je plaatsingen, je geld en flex — alleen voor jou',
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
      <button class="btn ghost" id="fin_inst">⚙ Instellingen</button>
      <button class="btn sub" id="fin_verniew" title="Cijfers opnieuw ophalen">↻ Vernieuwen</button>`;
    const vBtn = document.getElementById('fin_verniew');
    if(vBtn) vBtn.onclick = async () => { _fin = null; _meta = null; CRM.toast('Financiële cijfers vernieuwen…'); CRM.render(); };

    /* Een oud tabblad (advies, cashflow, …) uit een eerdere sessie bestaat niet meer. */
    if(_tab === 'flex'){ _tab = 'plaatsingen'; _plSoort = 'flex'; }
    if(!RENDERERS[_tab]) _tab = 'vandaag';
    mount.innerHTML = CRM.ui.laden('Financiële gegevens ophalen…');
    let f = null, laadFout = null;
    try{ f = await finLaad(); }
    catch(e){ laadFout = e; }

    /* Niets geladen → één leesbare Nederlandse zin met wat je eraan doet,
       nooit een kale databasefout. De technische tekst staat eronder. */
    if(!f){
      mount.innerHTML = foutBlok(laadFout || _finFout, _mist);
      const btn = mount.querySelector('#fin_opnieuw');
      if(btn) btn.onclick = () => { _fin = null; _meta = null; CRM.render(); };
      return;
    }

    /* Deels geladen → dezelfde uitleg, maar de rest van het scherm blijft staan. */
    const mistNote = (!f.demo && _mist.length)
      ? `<div style="margin-bottom:14px">${foutBlok(_finFout, _mist)}
          <p class="meta" style="margin:8px 2px 0">Alleen deze onderdelen ontbreken; alle andere cijfers
            hieronder zijn wél volledig berekend.</p></div>`
      : '';

    /* Bedragen die als tekst in de database staan worden hieronder gewoon
       gelezen ("1.200,50" → 1200,50), maar we melden het wél: zo'n veld is
       bijna altijd een importfout, en wat er niét uit te lezen valt telt
       als €0 — dat is precies het soort stille fout dat je niet wilt.     */
    const velden = f.demo ? [] : [
      ...f.installments.map(i => ({v:i.bedrag_excl, waar:`termijn ${i.placement_id||'?'} t${i.termijn_nr||'?'}`})),
      ...f.placements.map(p   => ({v:p.fee_excl,   waar:`fee van ${p.id||'?'}`})),
      ...f.budget.map(b       => ({v:b.bedrag_pm,  waar:`budgetpost ${tekst(b.categorie,'zonder naam')}`})),
      ...f.flexWeken.map(w    => ({v:w.bedrag,     waar:`flexweek ${tekst(w.week,'zonder datum')}`})),
      ...f.saldi.map(s        => ({v:s.saldo,      waar:`banksaldo ${tekst(s.datum,'zonder datum')}`}))
    ].filter(x => vuilGetal(x.v));
    const onleesbaar = velden.filter(x => !leesbaarGetal(x.v));
    const vuilNote = velden.length
      ? `<div class="note warn" style="margin-bottom:14px">
          <b>${velden.length} bedrag${velden.length===1?'':'en'} ${velden.length===1?'staat':'staan'} als tekst in de database.</b><br>
          ${onleesbaar.length
            ? `Daarvan ${onleesbaar.length===1
                 ? 'is er één niet als getal te lezen; die telt hier als €0'
                 : 'zijn er ' + onleesbaar.length + ' niet als getal te lezen; die tellen hier als €0'}.
               Corrigeer ze in de finance-app, anders klopt het totaal niet.`
            : `Ze zijn hier zo goed mogelijk als getal gelezen (1.200,50 wordt €1.201), maar controleer ze in de finance-app.`}
          <br><span class="meta">${H(velden.slice(0,8).map(x => x.waar).join(' · '))}${velden.length>8?' …':''}</span>
        </div>`
      : '';

    mount.innerHTML = `
      ${mistNote}${vuilNote}
      <div class="tabs" id="fin_tabs">
        ${TABS.map(t => `<button class="tab${t.k===_tab?' on':''}" data-t="${t.k}">${H(t.lbl)}</button>`).join('')}
      </div>
      <div id="fin_body"></div>`;

    if(!f.demo) nmbrsVers(f);
    const iBtn = document.getElementById('fin_inst');
    if(iBtn) iBtn.onclick = () => instellingenPaneel(f);
    const opnieuw = mount.querySelector('#fin_opnieuw');
    if(opnieuw) opnieuw.onclick = () => { _fin = null; _meta = null; CRM.render(); };

    const body = mount.querySelector('#fin_body');
    const toon = () => {
      mount.querySelectorAll('#fin_tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.t === _tab));
      try{ RENDERERS[_tab](body, f); }
      catch(e){
        console.error('Finance-tab ' + _tab, e);
        body.innerHTML = `<div class="note err">
          <b>Dit tabblad kon niet worden opgebouwd.</b><br>
          De andere tabbladen werken gewoon. Vernieuw de cijfers met de knop rechtsboven; blijft het misgaan,
          bekijk dit scherm dan in de finance-app zelf.<br>
          <span class="meta">Technische melding: ${H((e && e.message) || String(e))}</span></div>`;
      }
    };
    mount.querySelectorAll('#fin_tabs .tab').forEach(b => b.onclick = () => { _tab = b.dataset.t; toon(); });
    toon();
  }
});

/* ─── Flex-overname voor de eindkalender (js/plaatsingen.js) ─────
   Restant-uren tot kosteloze overname per actieve flexkracht, plus de
   verwachte datum (restant ÷ uren per week). Rekenwerk blijft hier — één
   plek (flexPlBerekening); Plaatsingen vraagt het alleen op. Alleen voor
   de eigenaar: de fin_*-tabellen zijn met RLS afgeschermd, dus bij een
   teamlid komt er gewoon niets terug. */
CRM.finFlexOvername = async () => {
  if(!CRM.canSeeMoney || !CRM.canSeeMoney()) return [];
  const [fp, fa, st] = await Promise.all([
    veiligQ('fin_flex_plaatsingen','id'),
    veiligQ('fin_flex_afspraken','klant'),
    veiligQ('fin_settings', null)
  ]);
  if(!fp) return [];
  const f = { flexPl: fp, flexAfspr: fa||[],
              settings: Object.fromEntries((st||[]).map(r=>[r.key, r.value])) };
  return fp.filter(x => !x.gestopt_op && !x.concept).map(x => {
    const b = flexPlBerekening(f, x);
    if(b.resterendUren == null || b.resterendUren <= 0) return null;
    const wkn = b.urenPw ? b.resterendUren / b.urenPw : null;
    let verwacht = null;
    if(wkn != null){ const d = new Date(); d.setDate(d.getDate() + Math.round(wkn*7));
      verwacht = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
    /* fin_flex_plaatsingen bewaart de naam in 'kandidaat', niet 'naam' —
       daardoor stond er in het overname-blok altijd "?" (27 okt 2026). */
    return {naam: x.kandidaat || x.naam || '?', klant: x.klant || '', resterendUren: b.resterendUren,
            overnameUren: b.overnameUren, verwacht};
  }).filter(Boolean).sort((a,b) => String(a.verwacht||'9999').localeCompare(String(b.verwacht||'9999')));
};

})();
