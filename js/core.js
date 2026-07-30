/* ═══════════════════════════════════════════════════════════════
   PLOEGGENOTEN CRM — CORE
   Auth, rollen, gedeelde datalaag, router, UI-helpers.
   Dit is het CONTRACT voor alle modules. Modules mogen hier NIETS
   aan wijzigen — alleen gebruiken via het globale object `CRM`.
   ═══════════════════════════════════════════════════════════════ */

const SUPABASE_URL  = 'https://gyhrwjdlwamyjhxtdypw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aHJ3amRsd2FteWpoeHRkeXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODgwMzUsImV4cCI6MjA5NzM2NDAzNX0.M2huzUfbYtcOqimYIkcuGW-6BCion4HqJVn7TxtkZ9c';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, { auth:{ persistSession:true, autoRefreshToken:true } });

/* Alleen deze e-mailadressen zien financiële cijfers (fee, omzet, marge).
   De harde beveiliging zit in Supabase RLS op de fin_*-tabellen; dit is
   de UI-laag zodat het team die schermen niet eens ziet. */
const ADMIN_EMAILS = ['tjeerd@ploeggenoten.nl'];

/* Demo-modus: alleen op localhost met ?demo — slaat de login over en
   draait op testdata (js/demo.js). Doet in productie niets. */
const DEMO = ['localhost','127.0.0.1'].includes(location.hostname)
             && new URLSearchParams(location.search).has('demo');

const CRM = window.CRM = {
  sb, demo:DEMO,
  user:null, profile:null,
  modules:{},           // key -> {title, icon, group, render, adminOnly, badge}
  view:null,            // huidige module-key
  state:{               // gedeelde data (via CRM.load())
    cands:[], clients:[], vacs:[], profiles:[], targets:[],
    leads:[], activiteiten:[], taken:[], documenten:[], kansen:[], contacten:[],
    _loaded:false
  },
  _rt:null, _subs:[]
};

/* ─── Rollen ──────────────────────────────────────────────────── */
CRM.isAdmin = () => !!(CRM.user && ADMIN_EMAILS.includes((CRM.user.email||'').toLowerCase()))
                    || CRM.profile?.rol === 'admin' && ADMIN_EMAILS.includes((CRM.user?.email||'').toLowerCase());
/* Financiële cijfers: strikt alleen Tjeerd. */
CRM.canSeeMoney = () => !!(CRM.user && ADMIN_EMAILS.includes((CRM.user.email||'').toLowerCase()));
/* Beheerder van instellingen (mag ook een teamlid zijn met rol admin). */
CRM.canManage = () => CRM.canSeeMoney() || CRM.profile?.rol === 'admin';
CRM.me = () => CRM.profile?.naam || CRM.user?.email || '';

/* ─── Kleine helpers ──────────────────────────────────────────── */
const h = CRM.h = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
CRM.$  = (sel,root) => (root||document).querySelector(sel);
CRM.$$ = (sel,root) => Array.from((root||document).querySelectorAll(sel));
CRM.uid = () => 'c' + Date.now() + Math.floor(Math.random()*1000);
CRM.todayISO = () => new Date().toLocaleDateString('sv-SE');   // lokale datum, geen UTC-verschuiving
CRM.debounce = (fn,ms=250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

/* Datum/geld — ALTIJD via deze helpers zodat de hele app gelijk oogt. */
CRM.fmtDate = iso => {
  if(!iso) return '';
  const d = new Date(iso); if(isNaN(d)) return String(iso);
  return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'});
};
CRM.fmtDateShort = iso => {
  if(!iso) return '';
  const d = new Date(iso); if(isNaN(d)) return String(iso);
  return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
};
CRM.fmtDay = iso => {
  if(!iso) return '';
  const d = new Date(iso); if(isNaN(d)) return String(iso);
  return d.toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'});
};
CRM.dagenGeleden = iso => {
  if(!iso) return null;
  const d = new Date(iso); if(isNaN(d)) return null;
  return Math.floor((new Date().setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)) / 86400000);
};
CRM.geleden = iso => {                       // "3 dagen geleden"
  const n = CRM.dagenGeleden(iso);
  if(n==null) return '';
  if(n===0) return 'vandaag'; if(n===1) return 'gisteren';
  if(n<0) return 'over ' + Math.abs(n) + ' dagen';
  if(n<31) return n + ' dagen geleden';
  if(n<365) return Math.round(n/30) + ' mnd geleden';
  return Math.round(n/365) + ' jaar geleden';
};
CRM.euro = (n,dec=0) => (n==null||isNaN(n)) ? '—' :
  '€' + Number(n).toLocaleString('nl-NL',{minimumFractionDigits:dec,maximumFractionDigits:dec});
CRM.pct = (n,dec=0) => (n==null||isNaN(n)) ? '—' : Number(n).toLocaleString('nl-NL',{minimumFractionDigits:dec,maximumFractionDigits:dec}) + '%';

/* Initialen + stabiele kleur per naam (avatars). */
CRM.initialen = naam => String(naam||'?').trim().split(/\s+/).filter(w=>!/^(van|de|der|den|het|te|ter|du|la|le)$/i.test(w))
  .slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
const AVA_KLEUREN = ['#4a7c15','#2f6b9a','#7e5aa6','#a86a1a','#2f8f5b','#b0483a','#5a7a8a','#8a6a2a','#6a5a9a','#3d7a6a'];
CRM.avaKleur = naam => AVA_KLEUREN[Math.abs(String(naam||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0)) % AVA_KLEUREN.length];
CRM.avatar = (naam,klasse='') =>
  `<div class="ava ${klasse}" style="background:${CRM.avaKleur(naam)}">${h(CRM.initialen(naam))}</div>`;

/* ─── Toast ───────────────────────────────────────────────────── */
let _tt;
CRM.toast = (msg, soort='') => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'on ' + soort;
  clearTimeout(_tt); _tt = setTimeout(()=>{ t.className = soort; }, 3200);
};
CRM.fout = (msg,err) => { console.error(msg,err); CRM.toast(msg + (err?.message ? ' — '+err.message : ''), 'err'); };

/* ─── Drawer (detailpaneel rechts) ────────────────────────────── */
CRM.drawer = {
  open(html, opts={}){
    let scrim = document.getElementById('scrim'), dr = document.getElementById('drawer');
    if(!scrim){
      scrim = document.createElement('div'); scrim.id='scrim'; scrim.className='scrim';
      document.body.appendChild(scrim);
      scrim.onclick = () => CRM.drawer.close();
    }
    if(!dr){ dr = document.createElement('div'); dr.id='drawer'; dr.className='drawer'; document.body.appendChild(dr); }
    dr.innerHTML = html;
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>{ scrim.classList.add('on'); dr.classList.add('on'); });
    CRM.$$('[data-close]', dr).forEach(b => b.onclick = () => CRM.drawer.close());
    if(opts.onOpen) opts.onOpen(dr);
    CRM.drawer._onClose = opts.onClose || null;
    return dr;
  },
  close(){
    const scrim = document.getElementById('scrim'), dr = document.getElementById('drawer');
    if(scrim) scrim.classList.remove('on');
    if(dr) dr.classList.remove('on');
    document.body.style.overflow='';
    const cb = CRM.drawer._onClose; CRM.drawer._onClose = null;
    if(cb) setTimeout(cb, 200);
  },
  el(){ return document.getElementById('drawer'); }
};

/* ─── Modaal + bevestiging ────────────────────────────────────── */
CRM.modal = {
  open(html, opts={}){
    let scrim = document.getElementById('mscrim'), m = document.getElementById('modal');
    if(!scrim){ scrim = document.createElement('div'); scrim.id='mscrim'; scrim.className='scrim'; document.body.appendChild(scrim); }
    if(!m){ m = document.createElement('div'); m.id='modal'; m.className='modal'; document.body.appendChild(m); }
    scrim.style.zIndex = 42; m.style.zIndex = 43;
    scrim.onclick = () => { if(opts.sluitbaar !== false) CRM.modal.close(); };
    m.innerHTML = html;
    requestAnimationFrame(()=>{ scrim.classList.add('on'); m.classList.add('on'); });
    CRM.$$('[data-mclose]', m).forEach(b => b.onclick = () => CRM.modal.close());
    if(opts.onOpen) opts.onOpen(m);
    return m;
  },
  close(){
    const scrim = document.getElementById('mscrim'), m = document.getElementById('modal');
    if(scrim) scrim.classList.remove('on');
    if(m) m.classList.remove('on');
  }
};
CRM.bevestig = (vraag, tekst='') => new Promise(res => {
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(vraag)}</div></div>
    ${tekst ? `<div class="modal-b"><p class="sub" style="margin:0">${h(tekst)}</p></div>` : '<div style="height:8px"></div>'}
    <div class="modal-f">
      <button class="btn ghost" id="bv_nee">Annuleren</button>
      <button class="btn" id="bv_ja">Ja, doorgaan</button>
    </div>`, {onOpen(m){
      m.querySelector('#bv_nee').onclick = ()=>{ CRM.modal.close(); res(false); };
      m.querySelector('#bv_ja').onclick  = ()=>{ CRM.modal.close(); res(true);  };
    }});
});
/* Kleine invoer-prompt (vervangt window.prompt — die oogt onprofessioneel). */
CRM.vraag = (titel, opts={}) => new Promise(res => {
  const multi = opts.multiline;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(titel)}</div></div>
    <div class="modal-b">
      ${opts.hint?`<p class="sub" style="margin:0 0 10px">${h(opts.hint)}</p>`:''}
      ${multi ? `<textarea id="vr_in" placeholder="${h(opts.placeholder||'')}">${h(opts.waarde||'')}</textarea>`
              : `<input type="text" id="vr_in" placeholder="${h(opts.placeholder||'')}" value="${h(opts.waarde||'')}">`}
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="vr_ok">${h(opts.knop||'Opslaan')}</button>
    </div>`, {onOpen(m){
      const inp = m.querySelector('#vr_in'); setTimeout(()=>inp.focus(),60);
      const ok = ()=>{ const v = inp.value.trim(); CRM.modal.close(); res(v||null); };
      m.querySelector('#vr_ok').onclick = ok;
      if(!multi) inp.onkeydown = e => { if(e.key==='Enter') ok(); };
      m.querySelector('[data-mclose]').onclick = ()=>{ CRM.modal.close(); res(null); };
    }});
});

/* ─── Herbruikbare stukjes markup ─────────────────────────────── */
CRM.ui = {
  leeg: (titel, tekst='', knop='') => `<div class="empty"><span class="ico">◌</span><b>${h(titel)}</b><p>${h(tekst)}</p>${knop||''}</div>`,
  laden: (tekst='Laden…') => `<div class="loading">${h(tekst)}</div>`,
  kpi: (label, waarde, detail='', klasse='') =>
    `<div class="kpi ${klasse}"><div class="label">${h(label)}</div><div class="big">${waarde}</div>${detail?`<div class="kd">${detail}</div>`:''}</div>`,
  chip: (tekst, kleur='') => `<span class="chip ${kleur}">${h(tekst)}</span>`,
  bar: (pct, kleur='') => `<div class="bar"><i class="${kleur}" style="width:${Math.max(0,Math.min(100,pct))}%"></i></div>`,
  /* Tijdlijn-item: {ico, titel, wanneer, tekst} */
  tijdlijn: items => items.length ? `<div class="tl">${items.map(i=>`
    <div class="tl-i"><div class="tl-ic">${i.ico||'•'}</div><div class="tl-c">
      <div class="tl-top"><b>${h(i.titel)}</b><span class="tl-when">${h(i.wanneer||'')}</span></div>
      ${i.tekst?`<div class="tl-txt">${h(i.tekst)}</div>`:''}
    </div></div>`).join('')}</div>` : CRM.ui.leeg('Nog niets vastgelegd','')
};

/* ─── Data laden ──────────────────────────────────────────────── */
/* Bestaande tabellen van het pijplijnbord/marketingbord blijven de bron
   van waarheid. Nieuwe CRM-tabellen (crm_*) kunnen ontbreken zolang het
   schema nog niet gedraaid is — dan degraderen we netjes naar leeg. */
async function veilig(promise, naam){
  try{
    const r = await promise;
    if(r.error){
      if(/does not exist|schema cache|relation/i.test(r.error.message||'')){ CRM.state['_mist_'+naam]=true; return []; }
      console.warn('Laden '+naam, r.error); return [];
    }
    return r.data || [];
  }catch(e){ console.warn('Laden '+naam, e); return []; }
}

CRM.load = async (force=false) => {
  if(CRM.state._loaded && !force) return CRM.state;
  const [cands, clients, vacs, profiles, targets, leads, acts, taken, docs, kansen, contacten] = await Promise.all([
    veilig(sb.from('candidates').select('*'), 'candidates'),
    veilig(sb.from('clients').select('*'), 'clients'),
    veilig(sb.from('vacatures').select('*'), 'vacatures'),
    veilig(sb.from('profiles').select('*'), 'profiles'),
    veilig(sb.from('targets').select('*'), 'targets'),
    veilig(sb.from('crm_leads').select('*').order('binnen_op',{ascending:false}), 'crm_leads'),
    veilig(sb.from('crm_activiteiten').select('*').order('op',{ascending:false}).limit(2000), 'crm_activiteiten'),
    veilig(sb.from('crm_taken').select('*').order('datum'), 'crm_taken'),
    veilig(sb.from('crm_documenten').select('*').order('op',{ascending:false}), 'crm_documenten'),
    veilig(sb.from('crm_kansen').select('*').order('created_at',{ascending:false}), 'crm_kansen'),
    veilig(sb.from('crm_contacten').select('*').order('naam'), 'crm_contacten')
  ]);
  Object.assign(CRM.state, {cands, clients, vacs, profiles, targets, leads, activiteiten:acts, taken, documenten:docs, kansen, contacten, _loaded:true});
  return CRM.state;
};
CRM.herlaad = async () => { await CRM.load(true); CRM.render(); };

/* Kandidaat-mapping — identiek aan het pijplijnbord zodat beide apps
   dezelfde rijen begrijpen. */
CRM.rowToCand = r => ({
  id:r.id, naam:r.naam, klant:r.klant, functie:r.functie, type:r.type||'', fase:r.fase,
  datum:r.datum||'', tijd:r.tijd||'', start:r.start||'', since:r.since||'', bron:r.bron||'',
  geplaatstOp:r.geplaatst_op||'', gestoptOp:r.gestopt_op||'', garantieMnd:r.garantie_mnd||0,
  maandloon:r.maandloon||null, toeslagPct:r.toeslag_pct||null, reden:r.reden||'',
  volgendeActie:r.volgende_actie||'', actieDatum:r.actie_datum||'', noShows:r.no_shows||0,
  notities:Array.isArray(r.notities)?r.notities:[], historie:Array.isArray(r.historie)?r.historie:[],
  afvalType:r.afval_type||'', afvalCat:r.afval_categorie||'', stopDoor:r.stop_door||'',
  stopCat:r.stop_categorie||'', recyclebaar:r.recyclebaar==null?null:!!r.recyclebaar,
  intake:(r.intake&&typeof r.intake==='object')?r.intake:null,
  vtPct:r.vt_pct==null?null:Number(r.vt_pct), ejuPct:r.eju_pct==null?null:Number(r.eju_pct),
  overigPct:r.overig_pct==null?null:Number(r.overig_pct), herstartVan:r.herstart_van||'',
  ooId:r.oo_id||null, vervangt:r.vervangt||'', rec:r.rec||'', note:r.note||'',
  telefoon:r.telefoon||'', email:r.email||'', woonplaats:r.woonplaats||'', vacatureId:r.vacature_id||null,
  cv:(r.cv&&typeof r.cv==='object')?r.cv:null, leadId:r.lead_id||''
});
CRM.candToRow = c => ({
  id:c.id, naam:c.naam, klant:c.klant||'', functie:c.functie||'', type:c.type||'', fase:c.fase,
  datum:c.datum||'', tijd:c.tijd||'', start:c.start||'', since:c.since||CRM.todayISO(), bron:c.bron||'',
  geplaatst_op:c.geplaatstOp||'', gestopt_op:c.gestoptOp||'', garantie_mnd:c.garantieMnd||0,
  maandloon:c.maandloon||null, toeslag_pct:c.toeslagPct||null, reden:c.reden||'',
  volgende_actie:c.volgendeActie||null, actie_datum:c.actieDatum||null, no_shows:c.noShows||0,
  notities:c.notities||[], historie:c.historie||[],
  afval_type:c.afvalType||'', afval_categorie:c.afvalCat||'', stop_door:c.stopDoor||'',
  stop_categorie:c.stopCat||'', recyclebaar:c.recyclebaar==null?null:!!c.recyclebaar,
  intake:c.intake||null, vt_pct:c.vtPct==null?null:c.vtPct, eju_pct:c.ejuPct==null?null:c.ejuPct,
  overig_pct:c.overigPct==null?null:c.overigPct, herstart_van:c.herstartVan||'',
  oo_id:c.ooId||null, vervangt:c.vervangt||'', rec:c.rec||'', note:c.note||'',
  telefoon:c.telefoon||'', email:c.email||'', woonplaats:c.woonplaats||'',
  vacature_id:c.vacatureId||null, cv:c.cv||null, lead_id:c.leadId||''
});

/* ─── Activiteiten (gedeeld: sales, klant, kandidaat) ─────────── */
/* soort: notitie|bel|mail|whatsapp|gesprek|taak|fase|doc|systeem
   entiteit: klant|kandidaat|lead|vacature   ref: naam of id       */
CRM.logActiviteit = async (entiteit, ref, soort, tekst, extra={}) => {
  const rij = { id:CRM.uid(), entiteit, ref:String(ref||''), soort, tekst:tekst||'',
                door:CRM.me(), op:new Date().toISOString(), extra };
  CRM.state.activiteiten.unshift(rij);
  const {error} = await sb.from('crm_activiteiten').insert(rij);
  if(error){ console.warn('activiteit opslaan', error); }
  return rij;
};
CRM.activiteitenVoor = (entiteit, ref) =>
  CRM.state.activiteiten.filter(a => a.entiteit===entiteit && String(a.ref)===String(ref));

/* ─── Router ──────────────────────────────────────────────────── */
CRM.registerModule = (key, def) => { CRM.modules[key] = Object.assign({key}, def); };

CRM.ga = (key, params={}) => {
  const m = CRM.modules[key];
  if(!m) return;
  if(m.adminOnly && !CRM.canSeeMoney()) return;
  CRM.view = key; CRM.params = params;
  const hash = '#' + key + (params.id ? '/'+encodeURIComponent(params.id) : '');
  if(location.hash !== hash) history.replaceState(null,'',hash);
  CRM.render();
  if(window.innerWidth <= 900) document.querySelector('nav.side')?.classList.remove('open');
};

CRM.render = () => {
  const m = CRM.modules[CRM.view];
  if(!m) return;
  document.title = 'Ploeggenoten CRM · ' + m.title;
  const head = document.getElementById('pagehead'), mount = document.getElementById('viewmount');
  head.innerHTML = `<button class="menubtn" id="menubtn">☰</button>
    <div class="ph-t"><div class="h1">${h(m.title)}</div>${m.onderschrift?`<div class="sub">${h(m.onderschrift)}</div>`:''}</div>
    <div class="row tight" id="pageacties"></div>`;
  document.getElementById('menubtn').onclick = () => document.querySelector('nav.side').classList.toggle('open');
  mount.className = 'view' + (m.volleBreedte ? ' pad0' : '');
  mount.innerHTML = CRM.ui.laden();
  navActief();
  const toonFout = e => {
    console.error('Module '+CRM.view, e);
    mount.innerHTML = `<div class="note err">Deze module gaf een fout: ${h(e.message)}<br><span class="meta">Details staan in de console.</span></div>`;
  };
  try{
    const r = m.render(mount, document.getElementById('pageacties'), CRM.params||{});
    if(r && typeof r.catch === 'function') r.catch(toonFout);   // async modules
  }catch(e){
    console.error('Module '+CRM.view, e);
    mount.innerHTML = `<div class="note err">Deze module gaf een fout: ${h(e.message)}<br><span class="meta">Details staan in de console.</span></div>`;
  }
};

/* Knoppen in de paginakop plaatsen vanuit een module. */
CRM.pageActies = html => { const el = document.getElementById('pageacties'); if(el) el.innerHTML = html; return el; };

/* ─── Navigatie opbouwen ──────────────────────────────────────── */
const NAV_GROEPEN = [
  {titel:'Overzicht', keys:['dashboard']},
  {titel:'Commercie', keys:['sales','klanten']},
  {titel:'Recruitment', keys:['recruitment','kandidaten']},
  {titel:'Groei', keys:['marketing','performance']},
  {titel:'Alleen voor jou', keys:['finance']}
];
function bouwNav(){
  const wrap = document.getElementById('navscroll');
  wrap.innerHTML = NAV_GROEPEN.map(g => {
    const items = g.keys.map(k=>CRM.modules[k]).filter(m => m && (!m.adminOnly || CRM.canSeeMoney()));
    if(!items.length) return '';
    return (g.titel?`<div class="navgroup">${h(g.titel)}</div>`:'<div style="height:4px"></div>') +
      items.map(m => `<a class="nav${m.adminOnly?' adm':''}" data-go="${m.key}">
        <span class="ic">${m.icon||'•'}</span><span>${h(m.title)}</span><span class="cnt" data-cnt="${m.key}" style="display:none"></span></a>`).join('');
  }).join('');
  CRM.$$('[data-go]', wrap).forEach(a => a.onclick = () => CRM.ga(a.dataset.go));
  navActief(); navBadges();
}
function navActief(){
  CRM.$$('nav.side a.nav').forEach(a => a.classList.toggle('on', a.dataset.go === CRM.view));
}
/* Modules kunnen een teller tonen: CRM.badge('recruitment', 7) */
CRM.badge = (key, n) => {
  const el = document.querySelector(`[data-cnt="${key}"]`);
  if(!el) return;
  if(n>0){ el.textContent = n; el.style.display=''; } else el.style.display='none';
};
function navBadges(){
  Object.values(CRM.modules).forEach(m => { if(m.badge) try{ CRM.badge(m.key, m.badge()); }catch(e){} });
}
CRM.navBadges = navBadges;

/* ─── Realtime ────────────────────────────────────────────────── */
function realtime(){
  if(CRM._rt) return;
  CRM._rt = sb.channel('crm')
    .on('postgres_changes',{event:'*',schema:'public',table:'candidates'}, () => sync('candidates'))
    .on('postgres_changes',{event:'*',schema:'public',table:'crm_leads'},  () => sync('crm_leads'))
    .on('postgres_changes',{event:'*',schema:'public',table:'crm_activiteiten'}, () => sync('crm_activiteiten'))
    .on('postgres_changes',{event:'*',schema:'public',table:'crm_taken'},  () => sync('crm_taken'))
    .subscribe();
}
const sync = CRM.debounce(async tabel => {
  const map = {candidates:'cands', crm_leads:'leads', crm_activiteiten:'activiteiten', crm_taken:'taken'};
  const veld = map[tabel]; if(!veld) return;
  const d = await veilig(sb.from(tabel).select('*'), tabel);
  CRM.state[veld] = d;
  navBadges();
  if(CRM.modules[CRM.view]?.herlaadBijSync !== false) CRM.render();
}, 700);

/* ─── Auth ────────────────────────────────────────────────────── */
async function start(user){
  CRM.user = user;
  document.getElementById('loginscreen').style.display = 'none';
  document.getElementById('app').classList.add('on');
  const {data:prof} = await sb.from('profiles').select('*').eq('id', user.id).single();
  CRM.profile = prof || {naam:user.email, rol:'user'};
  document.getElementById('whoname').textContent = CRM.profile.naam || user.email;
  document.getElementById('whorol').textContent  = CRM.canSeeMoney() ? 'Eigenaar' : (CRM.profile.rol==='admin'?'Beheerder':'Teamlid');
  document.getElementById('whoava').textContent  = CRM.initialen(CRM.profile.naam || user.email);
  bouwNav();
  await CRM.load();
  bouwNav();
  const hash = (location.hash||'').replace('#','').split('/');
  const key = CRM.modules[hash[0]] ? hash[0] : 'dashboard';
  CRM.ga(key, hash[1] ? {id:decodeURIComponent(hash[1])} : {});
  realtime();
}
function toonLogin(){
  CRM.user=null; CRM.profile=null;
  document.getElementById('loginscreen').style.display='flex';
  document.getElementById('app').classList.remove('on');
}
CRM._bouwNav = bouwNav;

let _bezig=false;
if(!DEMO) sb.auth.onAuthStateChange(async (event, session) => {
  if(event==='SIGNED_IN' || event==='TOKEN_REFRESHED'){
    if(_bezig) return; _bezig=true; await start(session.user);
  } else if(event==='INITIAL_SESSION'){
    if(!session?.user){ toonLogin(); return; }
    if(_bezig) return; _bezig=true; await start(session.user);
  } else if(event==='SIGNED_OUT' || !session?.user){ _bezig=false; toonLogin(); }
});

window.addEventListener('DOMContentLoaded', () => {
  if(!DEMO) document.getElementById('loginscreen').style.display='flex';
  document.getElementById('loginform').onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('login_err'); err.textContent='';
    const {error} = await sb.auth.signInWithPassword({
      email:document.getElementById('login_email').value.trim(),
      password:document.getElementById('login_pw').value
    });
    if(error) err.textContent = 'Inloggen mislukt: ' + error.message;
  };
  document.getElementById('login_reset').onclick = async () => {
    const email = document.getElementById('login_email').value.trim();
    const err = document.getElementById('login_err');
    if(!email){ err.textContent='Vul eerst je e-mailadres in'; return; }
    const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo:location.href});
    err.textContent = error ? error.message : '✓ Mail met herstellink verstuurd';
  };
  document.getElementById('logoutbtn').onclick = async () => {
    try{ await sb.auth.signOut(); }catch(e){}
    location.reload();
  };
  window.addEventListener('hashchange', () => {
    const hash = (location.hash||'').replace('#','').split('/');
    if(CRM.modules[hash[0]] && hash[0] !== CRM.view) CRM.ga(hash[0], hash[1]?{id:decodeURIComponent(hash[1])}:{});
  });
  document.addEventListener('keydown', e => {
    if(e.key==='Escape'){ if(document.getElementById('modal')?.classList.contains('on')) CRM.modal.close(); else CRM.drawer.close(); }
  });
});
