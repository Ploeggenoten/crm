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
    leads:[], activiteiten:[], taken:[], documenten:[], kansen:[], contacten:[], meldingen:[], ooSessions:[],
    _loaded:false
  },
  _rt:null, _subs:[]
};

/* ─── Rollen ──────────────────────────────────────────────────── */
CRM.isAdmin = () => !!(CRM.user && ADMIN_EMAILS.includes((CRM.user.email||'').toLowerCase()))
                    || CRM.profile?.rol === 'admin' && ADMIN_EMAILS.includes((CRM.user?.email||'').toLowerCase());
/* ─── Twee soorten geld, twee poorten ─────────────────────────
   Besluit Tjeerd, 31 jul 2026: "fee mag zichtbaar zijn voor iedereen,
   omzet per klant ook prima. Alleen winst etc en cashflow en allemaal
   andere cijfers zijn voor finance bij mij."

   OPBRENGST — wat een plaatsing heeft opgeleverd: de fee per plaatsing en
   de omzet per klant. Dat is het resultaat van het werk van het team, en
   dat mogen ze zien. Zonder dat cijfer weet een AM niet wat een plaatsing
   waard is en stuurt hij op aantallen in plaats van op opbrengst.

   BEDRIJFSCIJFERS — winst, marge, cashflow, banksaldo, kostprijs,
   facturatie: alleen de eigenaar. Dat zijn de fin_*-tabellen, die ook op
   databaseniveau op zijn e-mailadres zijn afgeschermd.

   Let op het verschil met de vorige situatie: hiervóór verborg één
   schakelaar álles wat met geld te maken had. Wie hier iets aan verandert,
   moet weten welke van de twee hij te pakken heeft. */
CRM.canSeeMoney = () => !!(CRM.user && ADMIN_EMAILS.includes((CRM.user.email||'').toLowerCase()));

/* Mag deze gebruiker de opbrengst van het werk zien (fee, omzet per klant)?
   Iedereen die is ingelogd. De echte grens ligt in de database: sinds
   31 jul 2026 is `crm_afspraken` team-leesbaar, `fin_*` niet. */
CRM.magOpbrengstZien = () => !!(CRM.user || CRM.demo);
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
/* Cijfer met lading: positief olijf, negatief rood, nul neutraal.
   fmt is optioneel (bv. CRM.euro); default gewoon het getal met +/−. */
CRM.plusMin = (n, fmt) => {
  const v = Number(n)||0;
  const klass = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const tekst = fmt ? fmt(v) : (v > 0 ? '+' : '') + v.toLocaleString('nl-NL');
  return `<span class="num ${klass}">${tekst}</span>`;
};
CRM.pct = (n,dec=0) => (n==null||isNaN(n)) ? '—' : Number(n).toLocaleString('nl-NL',{minimumFractionDigits:dec,maximumFractionDigits:dec}) + '%';

/* Initialen + stabiele kleur per naam (avatars). */
CRM.initialen = naam => String(naam||'?').trim().split(/\s+/).filter(w=>!/^(van|de|der|den|het|te|ter|du|la|le)$/i.test(w))
  .slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
const AVA_KLEUREN = ['#4a7c15','#2f6b9a','#7e5aa6','#a86a1a','#2f8f5b','#b0483a','#5a7a8a','#8a6a2a','#6a5a9a','#3d7a6a'];
CRM.avaKleur = naam => AVA_KLEUREN[Math.abs(String(naam||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0)) % AVA_KLEUREN.length];
/* Avatar: mét foto/logo als die er is, anders initialen. Kandidaten krijgen
   in lijsten GEEN avatar meer (te druk, expliciete wens) — gebruik dit dus
   alleen voor klanten (logo) en gebruikers (profielfoto). */
CRM.avatar = (naam,klasse='',foto='') => foto
  ? `<div class="ava ${klasse} foto"><img src="${h(foto)}" alt="" loading="lazy"></div>`
  : `<div class="ava ${klasse}" style="background:${CRM.avaKleur(naam)}">${h(CRM.initialen(naam))}</div>`;
/* Klanten krijgen géén beeldje — geen initialen en geen logo (wens Tjeerd:
   lijsten zijn tekst). De functie blijft bestaan zodat modules niet breken. */
CRM.klantAvatar = () => '';

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
    dr.setAttribute('role','dialog'); dr.setAttribute('aria-modal','true');
    if(!dr.hasAttribute('tabindex')) dr.tabIndex = -1;
    document.body.style.overflow='hidden';
    CRM.drawer._focusTerug = document.activeElement;
    cancelAnimationFrame(CRM.drawer._frame);
    CRM.drawer._frame = requestAnimationFrame(()=>{
      CRM.drawer._frame = null; scrim.classList.add('on'); dr.classList.add('on'); focusIn(dr);
    });
    CRM.$$('[data-close]', dr).forEach(b => b.onclick = () => CRM.drawer.close());
    if(opts.onOpen) opts.onOpen(dr);
    CRM.drawer._onClose = opts.onClose || null;
    return dr;
  },
  close(){
    cancelAnimationFrame(CRM.drawer._frame); CRM.drawer._frame = null;
    const scrim = document.getElementById('scrim'), dr = document.getElementById('drawer');
    if(scrim) scrim.classList.remove('on');
    if(dr) dr.classList.remove('on');
    document.body.style.overflow='';
    const terug = CRM.drawer._focusTerug; CRM.drawer._focusTerug = null;
    if(terug && terug.isConnected) terug.focus({preventScroll:true});
    const cb = CRM.drawer._onClose; CRM.drawer._onClose = null;
    if(cb) setTimeout(cb, 200);
  },
  el(){ return document.getElementById('drawer'); }
};

/* ─── Modaal + bevestiging ────────────────────────────────────── */
/* Het openen gebeurt in een animatieframe zodat de overgang loopt. Dat frame
   werd nooit geannuleerd bij sluiten: viel close() ertussen — of stond de tab
   op de achtergrond, waar animatieframes stilstaan — dan zette dat late frame
   de modal alsnog open, over het scherm heen. Vandaar het frame-id.
   Daarnaast nemen paneel en modaal nu de focus over en geven hem terug: zonder
   dat liep Tab door de pagina áchter het scherm, waar je de focusring niet
   ziet en dus blind formuliervelden bedient. */
let _mFrame = null, _mFocusTerug = null;
function focusIn(el){
  const eerste = el.querySelector('input,select,textarea,button,[href],[tabindex]:not([tabindex="-1"])');
  (eerste || el).focus({preventScroll:true});
}
CRM.modal = {
  open(html, opts={}){
    let scrim = document.getElementById('mscrim'), m = document.getElementById('modal');
    if(!scrim){ scrim = document.createElement('div'); scrim.id='mscrim'; scrim.className='scrim'; document.body.appendChild(scrim); }
    if(!m){ m = document.createElement('div'); m.id='modal'; m.className='modal'; document.body.appendChild(m); }
    scrim.style.zIndex = 42; m.style.zIndex = 43;
    scrim.onclick = () => { if(opts.sluitbaar !== false) CRM.modal.close(); };
    m.innerHTML = html;
    m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
    if(!m.hasAttribute('tabindex')) m.tabIndex = -1;
    _mFocusTerug = document.activeElement;
    cancelAnimationFrame(_mFrame);
    _mFrame = requestAnimationFrame(()=>{ _mFrame = null; scrim.classList.add('on'); m.classList.add('on'); focusIn(m); });
    CRM.$$('[data-mclose]', m).forEach(b => b.onclick = () => CRM.modal.close());
    /* Sluit de modal op een andere manier dan via de knoppen — Escape, een klik
       op de achtergrond — dan moet een wachtende `await` alsnog verder. Zonder
       dit bleef alles ná de await voorgoed hangen. */
    CRM.modal._onClose = opts.onClose || null;
    /* Eigen vlag in plaats van "heeft de klasse .on". Die klasse wordt in een
       animatieframe gezet, en in een tab op de achtergrond loopt dat frame
       niet. Escape keek naar de klasse en concludeerde dan dat er niets
       openstond — waardoor een wachtende await voorgoed bleef hangen. */
    CRM.modal._aan = true;
    /* Klikken doorlaten zetten we hier, niet in de .on-klasse: die wordt in
       een animatieframe gezet en dat frame loopt niet in een tab op de
       achtergrond. Een venster dat je wél ziet maar niet kunt aanklikken is
       erger dan de fout die we hiermee oplossen. */
    m.style.pointerEvents = 'auto';
    if(opts.onOpen) opts.onOpen(m);
    return m;
  },
  close(){
    cancelAnimationFrame(_mFrame); _mFrame = null;
    CRM.modal._aan = false;
    const scrim = document.getElementById('mscrim'), m = document.getElementById('modal');
    if(scrim) scrim.classList.remove('on');
    if(m){
      m.classList.remove('on');
      /* Onzichtbaar is niet weg: het venster blijft na het sluiten staan met
         alleen opacity 0, en ving dan alle klikken op in een blok van 520px
         bij 90vh midden op het scherm. De knop eronder reageerde niet meer,
         terwijl er niets te zien was. Dit raakte elk scherm in de app. */
      m.style.pointerEvents = 'none';
    }
    const naSluiten = CRM.modal._onClose; CRM.modal._onClose = null;
    if(naSluiten) naSluiten();
    /* Focus terug naar waar hij vandaan kwam, maar alleen als hij nog in het
       document staat — een hertekening kan het element hebben vervangen. */
    if(_mFocusTerug && _mFocusTerug.isConnected) _mFocusTerug.focus({preventScroll:true});
    _mFocusTerug = null;
  }
};
/* opts: {knop, gevaarlijk}. `gevaarlijk` maakt de bevestigknop merkoranje en
   noemt hem naar de handeling, zodat wissen er niet hetzelfde uitziet als een
   onschuldige vraag. Escape of een klik naast de modal geldt als annuleren. */
CRM.bevestig = (vraag, tekst='', opts={}) => new Promise(res => {
  const knop = opts.knop || (opts.gevaarlijk ? 'Ja, verwijderen' : 'Ja, doorgaan');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(vraag)}</div></div>
    ${tekst ? `<div class="modal-b"><p class="sub" style="margin:0">${h(tekst)}</p></div>` : '<div style="height:8px"></div>'}
    <div class="modal-f">
      <button class="btn ghost" id="bv_nee">Annuleren</button>
      <button class="btn${opts.gevaarlijk ? ' danger' : ''}" id="bv_ja">${h(knop)}</button>
    </div>`, {
      onClose(){ res(false); },
      onOpen(m){
        m.querySelector('#bv_nee').onclick = ()=>{ CRM.modal._onClose = null; CRM.modal.close(); res(false); };
        m.querySelector('#bv_ja').onclick  = ()=>{ CRM.modal._onClose = null; CRM.modal.close(); res(true);  };
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
    </div>`, {
      onClose(){ res(null); },
      onOpen(m){
      const inp = m.querySelector('#vr_in'); setTimeout(()=>inp.focus(),60);
      const sluit = v => { CRM.modal._onClose = null; CRM.modal.close(); res(v); };
      const ok = ()=> sluit(inp.value.trim() || null);
      m.querySelector('#vr_ok').onclick = ok;
      if(!multi) inp.onkeydown = e => { if(e.key==='Enter') ok(); };
      m.querySelector('[data-mclose]').onclick = ()=> sluit(null);
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
  const [cands, clients, vacs, profiles, targets, leads, acts, taken, docs, kansen, contacten, meldingen, ooSessions] = await Promise.all([
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
    veilig(sb.from('crm_contacten').select('*').order('naam'), 'crm_contacten'),
    veilig(sb.from('crm_meldingen').select('*').order('created_at',{ascending:false}).limit(200), 'crm_meldingen'),
    veilig(sb.from('oo_sessions').select('*'), 'oo_sessions')
  ]);
  Object.assign(CRM.state, {cands, clients, vacs, profiles, targets, leads, activiteiten:acts, taken, documenten:docs, kansen, contacten, meldingen, ooSessions, _loaded:true});
  return CRM.state;
};
CRM.herlaad = async () => { await CRM.load(true); CRM.render(); };

/* Kandidaat-mapping — identiek aan het pijplijnbord zodat beide apps
   dezelfde rijen begrijpen. */
CRM.rowToCand = r => ({
  id:r.id, naam:r.naam, klant:r.klant, functie:r.functie, type:r.type||'', fase:r.fase,
  datum:r.datum||'', tijd:r.tijd||'', start:r.start||'', since:r.since||'', bron:r.bron||'',
  geplaatstOp:r.geplaatst_op||'', gestoptOp:r.gestopt_op||'', garantieMnd:r.garantie_mnd||0,
  /* Nul is een ingevulde waarde, geen lege. Met `||null` was een kandidaat
     zónder ploegentoeslag niet te onderscheiden van eentje waarbij het veld
     nog leeg is, en bleef de feeberekening eeuwig om die toeslag vragen.
     Zelfde vorm als vt_pct/eju_pct twee regels verderop. */
  maandloon:r.maandloon==null?null:Number(r.maandloon),
  toeslagPct:r.toeslag_pct==null?null:Number(r.toeslag_pct), reden:r.reden||'',
  volgendeActie:r.volgende_actie||'', actieDatum:r.actie_datum||'', noShows:r.no_shows||0,
  notities:Array.isArray(r.notities)?r.notities:[], historie:Array.isArray(r.historie)?r.historie:[],
  afvalType:r.afval_type||'', afvalCat:r.afval_categorie||'', stopDoor:r.stop_door||'',
  stopCat:r.stop_categorie||'', recyclebaar:r.recyclebaar==null?null:!!r.recyclebaar,
  intake:(r.intake&&typeof r.intake==='object')?r.intake:null,
  vtPct:r.vt_pct==null?null:Number(r.vt_pct), ejuPct:r.eju_pct==null?null:Number(r.eju_pct),
  overigPct:r.overig_pct==null?null:Number(r.overig_pct), herstartVan:r.herstart_van||'',
  /* Persoonsgegevens met een eigen bewaartermijn: geboortedatum voor de
     verjaardagstaak, foto als PAD in de afgeschermde map crm-docs. */
  geboortedatum:r.geboortedatum||'', foto:r.foto||'',
  geanonimiseerdOp:r.geanonimiseerd_op||null,
  ooId:r.oo_id||null, vervangt:r.vervangt||'', rec:r.rec||'', note:r.note||'',
  telefoon:r.telefoon||'', email:r.email||'', woonplaats:r.woonplaats||'', vacatureId:r.vacature_id||null,
  cv:(r.cv&&typeof r.cv==='object')?r.cv:null, leadId:r.lead_id||'',
  ster:Number(r.ster)||0, beschikbaar:r.beschikbaar||'', ploegen:r.ploegen||'',
  talen:r.talen||'', rijbewijs:r.rijbewijs||'', vervoer:r.vervoer||'', golden:!!r.golden
});
CRM.candToRow = c => ({
  id:c.id, naam:c.naam, klant:c.klant||'', functie:c.functie||'', type:c.type||'', fase:c.fase,
  datum:c.datum||'', tijd:c.tijd||'', start:c.start||'', since:c.since||CRM.todayISO(), bron:c.bron||'',
  geplaatst_op:c.geplaatstOp||'', gestopt_op:c.gestoptOp||'', garantie_mnd:c.garantieMnd||0,
  /* Zelfde reden als bij het lezen: een ingevulde 0 moet een 0 blijven,
     anders wist opslaan stilletjes "geen ploegentoeslag" weer uit. */
  maandloon:c.maandloon==null||c.maandloon===''?null:Number(c.maandloon),
  toeslag_pct:c.toeslagPct==null||c.toeslagPct===''?null:Number(c.toeslagPct), reden:c.reden||'',
  volgende_actie:c.volgendeActie||null, actie_datum:c.actieDatum||null, no_shows:c.noShows||0,
  notities:c.notities||[], historie:c.historie||[],
  afval_type:c.afvalType||'', afval_categorie:c.afvalCat||'', stop_door:c.stopDoor||'',
  stop_categorie:c.stopCat||'', recyclebaar:c.recyclebaar==null?null:!!c.recyclebaar,
  intake:c.intake||null, vt_pct:c.vtPct==null?null:c.vtPct, eju_pct:c.ejuPct==null?null:c.ejuPct,
  overig_pct:c.overigPct==null?null:c.overigPct, herstart_van:c.herstartVan||'',
  geboortedatum:c.geboortedatum||null, foto:c.foto||'',
  geanonimiseerd_op:c.geanonimiseerdOp||null,
  oo_id:c.ooId||null, vervangt:c.vervangt||'', rec:c.rec||'', note:c.note||'',
  telefoon:c.telefoon||'', email:c.email||'', woonplaats:c.woonplaats||'',
  vacature_id:c.vacatureId||null, cv:c.cv||null, lead_id:c.leadId||'',
  ster:c.ster||0, beschikbaar:c.beschikbaar||'', ploegen:c.ploegen||'',
  talen:c.talen||'', rijbewijs:c.rijbewijs||'', vervoer:c.vervoer||'', golden:!!c.golden
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
  let m = CRM.modules[key];
  if(!m) return;
  if(m.adminOnly && !CRM.canSeeMoney()){ key = 'dashboard'; m = CRM.modules.dashboard; params = {}; }
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
  /* Zachte binnenkomer bij elke paginawissel (rustig, 140ms). */
  mount.classList.remove('v-in'); void mount.offsetWidth; mount.classList.add('v-in');
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
  {titel:'Recruitment', keys:['recruitment','pijplijn','hot','kandidaten','source']},
  {titel:'Groei', keys:['marketing','performance']},
  {titel:'Alleen voor jou', keys:['finance','instellingen']}
];
/* Strakke lijn-iconen voor de zijbalk (geen emoji): 18px, stroke = tekstkleur. */
const NAV_ICONEN = {
  dashboard:   '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sales:       '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
  klanten:     '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M4 21h16M16 9h3a1 1 0 0 1 1 1v11M8 7h4M8 11h4M8 15h4"/>',
  recruitment: '<path d="M12 3v4M12 7l-6 5v9h12v-9l-6-5zM9 21v-5h6v5"/>',
  pijplijn:    '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/>',
  hot:         '<path d="M12 3c1 4-4 5.5-4 10a4 4 0 0 0 8 0c0-2-1-3.5-2-4.5 0 2-1 2.5-2 3-0.5-2.5 1-5.5 0-8.5z"/>',
  kandidaten:  '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.5-3.6 2.8-5.5 5.5-5.5S14 16.4 14.5 20M15.5 5.5a3.2 3.2 0 1 1 0 5.4M16.5 14.8c2.2.5 3.6 2.3 4 5.2"/>',
  source:      '<path d="M12 21s-6.5-5.6-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.4"/>',
  marketing:   '<path d="M3 11v3l4 1 2 5 2.5-1-1.5-4 10 3V4L7 9.5 3 11z"/>',
  performance: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  finance:     '<circle cx="12" cy="12" r="8.5"/><path d="M15 9a4 4 0 1 0 0 6M8.5 11h5M8.5 13.5h5"/>',
  instellingen:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'
};
const navIcoon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONEN[k]||'<circle cx="12" cy="12" r="8"/>'}</svg>`;

function bouwNav(){
  const wrap = document.getElementById('navscroll');
  wrap.innerHTML = NAV_GROEPEN.map(g => {
    const items = g.keys.map(k=>CRM.modules[k]).filter(m => m && (!m.adminOnly || CRM.canSeeMoney()));
    if(!items.length) return '';
    return (g.titel?`<div class="navgroup">${h(g.titel)}</div>`:'<div style="height:4px"></div>') +
      items.map(m => `<a class="nav${m.adminOnly?' adm':''}" data-go="${m.key}">
        ${navIcoon(m.key)}<span>${h(m.title)}</span><span class="cnt" data-cnt="${m.key}" style="display:none"></span></a>`).join('');
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

/* ─── Meldingen (taak toegewezen, @-tag) ──────────────────────── */
CRM.teamNamen = () => CRM.state.profiles.map(p => p.naam).filter(Boolean);

CRM.meld = async (voor, soort, tekst, entiteit='', ref='') => {
  if(!voor || voor === CRM.me()) return null;      // jezelf hoef je niet te melden
  const rij = { id:CRM.uid(), voor, van:CRM.me(), soort, tekst, entiteit, ref,
                gelezen:false, created_at:new Date().toISOString() };
  CRM.state.meldingen.unshift(rij);
  if(!CRM.demo){
    const {error} = await sb.from('crm_meldingen').insert(rij);
    if(error) console.warn('melding opslaan', error);
    /* Ook in Teams laten landen — daar kijkt het team de hele dag.
       Best effort: lukt het niet, dan blijft de CRM-melding staan. */
    teamsMelding(voor, tekst, entiteit, ref);
  }
  return rij;
};

/* Teams-bericht bij een melding. Adres komt uit het profiel van de collega;
   het bericht gaat namens de ingelogde gebruiker (jij wees de taak toe). */
function teamsMelding(voor, tekst, entiteit, ref){
  try{
    if(!CRM.outlook?.verbonden?.()) return;
    if(localStorage.getItem('crm_teams_uit') === '1') return;
    const p = (CRM.state.profiles||[]).find(x => x.naam === voor);
    const adres = p?.email || p?.mail;
    if(!adres) return;
    const url = location.origin + location.pathname +
      (entiteit && ref ? '#' + ({klant:'klanten',kandidaat:'kandidaten',lead:'recruitment',taak:'dashboard'}[entiteit] || 'dashboard') +
        (entiteit==='taak' ? '' : '/' + encodeURIComponent(ref)) : '#dashboard');
    const body = `${h(tekst)}<br><a href="${h(url)}">Openen in het CRM</a>`;
    CRM.outlook.teamsBericht(adres, body);
  }catch(e){ console.warn('teamsMelding', e); }
}
CRM.mijnMeldingen = (ongelezen=true) =>
  CRM.state.meldingen.filter(m => m.voor === CRM.me() && (!ongelezen || !m.gelezen));
CRM.meldingGelezen = async (id) => {
  const m = CRM.state.meldingen.find(m => m.id === id);
  if(m) m.gelezen = true;
  if(!CRM.demo) await sb.from('crm_meldingen').update({gelezen:true}).eq('id', id);
  navBadges();
};

/* @-tags in notities/activiteiten: "@Tjerk kijk jij hiernaar?" → melding
   voor Tjerk. Matcht op voornaam uit profiles, hoofdletterongevoelig. */
CRM.verwerkTags = (tekst, entiteit='', ref='') => {
  const namen = CRM.teamNamen();
  const getagd = new Set();
  String(tekst||'').replace(/@([\wÀ-ž-]+)/g, (_, naam) => {
    const wie = namen.find(n => n.toLowerCase() === naam.toLowerCase()
                             || n.toLowerCase().startsWith(naam.toLowerCase()));
    if(wie && wie !== CRM.me()) getagd.add(wie);
    return _;
  });
  getagd.forEach(wie => CRM.meld(wie, 'tag',
    `${CRM.me()} noemde je: "${String(tekst).slice(0,120)}"`, entiteit, ref));
  return [...getagd];
};

/* ─── Gedeeld taakvenster — DE manier om een taak te maken ──────
   Elke module gebruikt dit (geen eigen taakformulieren), zodat
   toewijzen aan een collega, prioriteit en Outlook overal werkt.
   opts: {entiteit, ref, refLabel, tekst, datum, voor}              */
CRM.taakModal = (opts = {}) => new Promise(res => {
  const team = CRM.teamNamen();
  const outlookOk = CRM.outlook?.verbonden?.();
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe taak</div>
      ${opts.refLabel ? `<div class="meta" style="margin-top:2px">bij ${h(opts.refLabel)}</div>` : ''}</div>
    <div class="modal-b">
      <div class="f-row"><label>Wat moet er gebeuren?</label>
        <input type="text" id="tk_tekst" value="${h(opts.tekst||'')}" placeholder="Bijv. terugbellen over het voorstel">
        <div class="hint">Tip: noem een collega met @naam in een notitie om diegene een melding te sturen.</div></div>
      <div class="f-grid">
        <div class="f-row"><label>Voor wie</label>
          <select id="tk_voor">${team.map(n =>
            `<option value="${h(n)}"${n===CRM.me()?' selected':''}>${h(n)}${n===CRM.me()?' (ik)':''}</option>`).join('')}
          </select></div>
        <div class="f-row"><label>Datum</label>
          <input type="date" id="tk_datum" value="${h(opts.datum || CRM.todayISO())}"></div>
        <div class="f-row"><label>Prioriteit</label>
          <select id="tk_prio"><option value="">Normaal</option><option value="Hoog">Hoog</option></select></div>
      </div>
      ${outlookOk ? `<label class="check"><input type="checkbox" id="tk_outlook" checked> Ook in mijn Outlook To Do</label>` : ''}
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="tk_save">Taak aanmaken</button>
    </div>`, {onOpen(m){
      const inp = m.querySelector('#tk_tekst'); setTimeout(()=>inp.focus(),60);
      m.querySelector('[data-mclose]').onclick = () => { CRM.modal.close(); res(null); };
      m.querySelector('#tk_save').onclick = async () => {
        const tekst = inp.value.trim();
        if(!tekst){ inp.focus(); return; }
        const voor = m.querySelector('#tk_voor').value;
        const rij = { id:CRM.uid(), tekst, datum:m.querySelector('#tk_datum').value || null,
          klaar:false, entiteit:opts.entiteit||'', ref:String(opts.ref||''),
          voor, door:CRM.me(), prioriteit:m.querySelector('#tk_prio').value,
          created_at:new Date().toISOString() };
        CRM.state.taken.push(rij);
        if(!CRM.demo){
          const {error} = await sb.from('crm_taken').insert(rij);
          if(error){ CRM.fout('Taak opslaan mislukt', error); return; }
        }
        if(voor !== CRM.me())
          CRM.meld(voor, 'taak', `${CRM.me()} heeft je een taak gegeven: "${tekst}"${opts.refLabel?` (bij ${opts.refLabel})`:''}`, 'taak', rij.id);
        if(outlookOk && m.querySelector('#tk_outlook')?.checked && voor === CRM.me())
          CRM.outlook.maakTaak({titel:tekst, datum:rij.datum, notities:opts.refLabel||''}).catch(()=>{});
        CRM.modal.close();
        CRM.toast(voor === CRM.me() ? 'Taak aangemaakt' : `Taak aangemaakt voor ${voor} — die krijgt een melding`, 'ok');
        navBadges();
        res(rij);
      };
    }});
});

/* ─── Opslag: bestanden uit de map 'crm-docs' ─────────────────────
   Die map is NIET publiek (zie supabase/schema.sql, blok 10). Er zitten
   CV's, identiteitsbewijzen en contracten in, dus er bestaat bewust geen
   vaste url naar een bestand. In de database bewaren we het PAD; pas als
   iemand een bestand opent maakt deze helper een tijdelijke ondertekende
   link, die vanzelf verloopt.

   Alles loopt via dit ene object, zodat er niet op drie plekken iets
   anders gebeurt. Er komen vier soorten waarden binnen:
     pad        'klant/Acme_BV/1699_swo.pdf'   → ondertekenen
     oude url   'https://…/object/public/crm-docs/…' → pad eruit halen
     extern     'https://…sharepoint.com/…'    → laten staan, handmatig
                                                  gekoppeld bestand
     blob:      demo-modus, alleen dit venster
   Al het andere (javascript:, data:, …) wordt geweigerd. ────────── */
const OPSLAG_MAP    = 'crm-docs';
const OPSLAG_GELDIG = 3600;                 // seconden dat een link werkt
const OPSLAG_MARGE  = 60000;                // ms speling voor we hergebruiken
const _opslagCache  = new Map();            // sleutel -> {url, tot}

/* Supabase-fouten omzetten naar iets dat een mens kan lezen én oplossen. */
function opslagFoutTekst(err){
  const m    = String(err?.message || err?.error || err || '');
  const code = String(err?.statusCode ?? err?.status ?? '');
  if(/bucket not found/i.test(m) || /bucket/i.test(m) && /not found|exist/i.test(m))
    return 'De documentmap bestaat nog niet in Supabase. Draai supabase/schema.sql in de SQL-editor — blok 10 maakt de map aan. Daarna werkt uploaden en openen meteen.';
  if(/jwt|session|token is expired|invalid claim/i.test(m))
    return 'Je sessie is verlopen. Log opnieuw in en probeer het nog een keer.';
  if(code==='403' || code==='401' || /unauthor|not allowed|permission|policy|forbidden|violates row-level/i.test(m))
    return 'Je hebt geen toegang tot dit bestand. Log opnieuw in; blijft het misgaan, vraag Tjeerd om je account te controleren.';
  if(code==='404' || /not found|does not exist|no such/i.test(m))
    return 'Dit bestand staat niet meer in de opslag. Waarschijnlijk is het verwijderd — koppel het opnieuw.';
  if(/failed to fetch|network|load failed/i.test(m))
    return 'Geen verbinding met de opslag. Controleer je internetverbinding en probeer het opnieuw.';
  return 'Kon geen link naar dit bestand maken' + (m ? ' — ' + m : '') + '.';
}

CRM.opslag = {
  map: OPSLAG_MAP,
  foutTekst: opslagFoutTekst,

  /* Wat voor waarde is dit? Geeft {soort, pad, url}. */
  duiding(waarde){
    const s = String(waarde == null ? '' : waarde).trim();
    if(!s) return {soort:'leeg', pad:'', url:''};
    if(/^blob:/i.test(s)) return {soort:'blob', pad:'', url:s};
    if(/^https?:\/\//i.test(s)){
      /* Oude rij met een volledige url naar onze eigen map: pad eruit halen.
         Die url is met een dichte map toch niets meer waard. */
      const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/crm-docs\/([^?#]+)/i);
      if(m){ try{ return {soort:'pad', pad:decodeURIComponent(m[1]), url:''}; }
             catch(e){ return {soort:'pad', pad:m[1], url:''}; } }
      return {soort:'extern', pad:'', url:s};
    }
    /* Een waarde mét schema die hierboven niet langskwam is géén pad:
       javascript:, data:, file: — die gaan er niet doorheen. */
    if(/^[a-z][a-z0-9+.-]*:/i.test(s)) return {soort:'geweigerd', pad:'', url:''};
    return {soort:'pad', url:'', pad: s.replace(/^\/+/,'').replace(/^crm-docs\//i,'')};
  },

  /* Het pad binnen de map, of '' als het geen eigen bestand is. */
  pad(waarde){ const d = this.duiding(waarde); return d.soort==='pad' ? d.pad : ''; },

  /* Tijdelijke ondertekende link. Geeft {url, fout}; `fout` is al een
     leesbare Nederlandse melding, klaar om te tonen.
     opts.download = bestandsnaam → de browser bewaart in plaats van tonen. */
  async link(waarde, opts={}){
    const d = this.duiding(waarde);
    if(d.soort === 'leeg')      return {url:'', fout:'Er hoort geen bestand bij deze regel.'};
    if(d.soort === 'geweigerd') return {url:'', fout:'Deze link is geweigerd: hij wijst niet naar een bestand.'};
    if(d.soort === 'blob' || d.soort === 'extern') return {url:d.url, fout:''};

    const sleutel = (opts.download ? 'dl:' : 'toon:') + d.pad;
    const c = _opslagCache.get(sleutel);
    if(c && c.tot > Date.now() + OPSLAG_MARGE) return {url:c.url, fout:''};

    try{
      const {data, error} = await sb.storage.from(OPSLAG_MAP)
        .createSignedUrl(d.pad, OPSLAG_GELDIG, opts.download ? {download:opts.download} : undefined);
      if(error) return {url:'', fout: opslagFoutTekst(error)};
      const url = data?.signedUrl || data?.signedURL || '';
      if(!url) return {url:'', fout:'De opslag gaf geen link terug voor dit bestand.'};
      _opslagCache.set(sleutel, {url, tot: Date.now() + OPSLAG_GELDIG*1000});
      return {url, fout:''};
    }catch(e){ return {url:'', fout: opslagFoutTekst(e)}; }
  },

  /* Een eerder gemaakte link vergeten — na een upload op hetzelfde pad,
     of als hij geweigerd wordt. Zonder argument: alles. */
  wis(waarde){
    if(waarde == null){ _opslagCache.clear(); return; }
    const p = this.pad(waarde);
    if(p){ _opslagCache.delete('toon:' + p); _opslagCache.delete('dl:' + p); }
  },

  /* Klikafhandelaar voor een document. Asynchroon mag hier: de gebruiker
     heeft net geklikt en wacht toch al op het bestand. */
  async open(waarde, opts={}){
    const {url, fout} = await this.link(waarde, opts);
    if(fout){ CRM.toast(fout, 'err'); return false; }
    /* Laatste hek: alleen echte http(s)- of blob-links openen. */
    if(!/^(https?:\/\/|blob:)/i.test(url)){
      CRM.toast('Deze link is geweigerd: hij wijst niet naar een bestand.', 'err'); return false;
    }
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if(!w) CRM.toast('Je browser blokkeerde het nieuwe tabblad. Sta pop-ups toe voor deze pagina.', 'err');
    return true;
  },

  /* Een al bekende, nog geldige link — synchroon, dus bruikbaar in HTML.
     Geeft '' als er nog ondertekend moet worden. */
  srcNu(waarde){
    const d = this.duiding(waarde);
    if(d.soort === 'blob' || d.soort === 'extern') return d.url;
    if(d.soort !== 'pad') return '';
    const c = _opslagCache.get(d.pad);
    return (c && c.tot > Date.now() + OPSLAG_MARGE) ? c.url : '';
  },

  /* AFBEELDINGEN. Een `src` moet er staan op het moment dat we tekenen,
     maar ondertekenen kost een netwerkronde. Daarom in twee stappen:
     de renderplek tekent gewoon zijn terugval (initialen) en zet er
     `data-opslagfoto="<pad>"` op; daarna vult deze functie de foto in.
     Zit de link al in de sessiecache, dan kan de renderplek hem via
     srcNu() meteen meegeven en gebeurt er hier niets — geen geknipper
     bij een tweede keer tekenen. Lukt het niet, dan blijven de initialen
     staan met de reden in de tooltip: nooit een kapot plaatje. */
  async vulAfbeeldingen(root){
    const r = root || document;
    const els = [];
    if(r.nodeType === 1 && r.hasAttribute && r.hasAttribute('data-opslagfoto')) els.push(r);
    els.push(...CRM.$$('[data-opslagfoto]', r));
    for(const el of els){
      const waarde = el.getAttribute('data-opslagfoto');
      el.removeAttribute('data-opslagfoto');          // niet twee keer doen
      const terugval = el.innerHTML;                  // de initialen
      const {url, fout} = await this.link(waarde);
      if(fout || !/^(https?:\/\/|blob:)/i.test(url)){
        el.title = fout || 'Deze foto kon niet geladen worden.';
        continue;
      }
      const img = new Image();
      img.alt = ''; img.loading = 'lazy';
      img.onerror = () => {                           // verlopen of ingetrokken
        this.wis(waarde);
        el.classList.remove('foto'); el.innerHTML = terugval;
        el.title = 'De link naar deze foto is verlopen. Ververs de pagina om hem opnieuw op te halen.';
      };
      img.src = url;
      el.classList.add('foto'); el.innerHTML = ''; el.appendChild(img);
    }
  }
};

/* ─── Eigen profielfoto ───────────────────────────────────────── */
CRM.tekenEigenAvatar = () => {
  const el = document.getElementById('whoava'); if(!el) return;
  const foto = CRM.profile?.foto_url || '';
  const nu   = foto ? CRM.opslag.srcNu(foto) : '';
  el.title = 'Profielfoto wijzigen';
  if(nu){ el.innerHTML = `<img src="${h(nu)}" alt="">`; return; }
  el.innerHTML = h(CRM.initialen(CRM.profile?.naam || CRM.user?.email || '?'));
  if(foto){ el.setAttribute('data-opslagfoto', foto); CRM.opslag.vulAfbeeldingen(el); }
};
CRM.accountModal = () => {
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Jouw profiel</div></div>
    <div class="modal-b">
      <div class="row" style="gap:14px;margin-bottom:14px">
        <div class="ava lg ${CRM.opslag.srcNu(CRM.profile?.foto_url)?'foto':''}" id="pf_prev"
             style="background:${CRM.avaKleur(CRM.me())}"${
          CRM.profile?.foto_url && !CRM.opslag.srcNu(CRM.profile.foto_url) ? ` data-opslagfoto="${h(CRM.profile.foto_url)}"` : ''}>${
          CRM.opslag.srcNu(CRM.profile?.foto_url) ? `<img src="${h(CRM.opslag.srcNu(CRM.profile.foto_url))}" alt="">` : h(CRM.initialen(CRM.me()))}</div>
        <div><b>${h(CRM.me())}</b><div class="meta">${h(CRM.user?.email||'')}</div></div>
      </div>
      <div class="f-row"><label>Profielfoto</label>
        <input type="file" id="pf_file" accept="image/*">
        <div class="hint">Vierkante foto werkt het best. Wordt zichtbaar voor het hele team.</div>
      </div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Sluiten</button>
      <button class="btn" id="pf_save" disabled>Opslaan</button>
    </div>`, {onOpen(m){
      const file = m.querySelector('#pf_file'), save = m.querySelector('#pf_save'), prev = m.querySelector('#pf_prev');
      CRM.opslag.vulAfbeeldingen(m);     // ondertekende link voor de voorvertoning
      let gekozen = null;
      file.onchange = () => {
        gekozen = file.files[0] || null; save.disabled = !gekozen;
        if(gekozen){ prev.classList.add('foto'); prev.innerHTML = `<img src="${URL.createObjectURL(gekozen)}" alt="">`; }
      };
      save.onclick = async () => {
        if(!gekozen) return;
        save.disabled = true; save.textContent = 'Bezig…';
        const herstel = () => { save.disabled = false; save.textContent = 'Opslaan'; };
        try{
          let waarde;
          if(CRM.demo){ waarde = URL.createObjectURL(gekozen); }
          else{
            const ext = ((gekozen.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')) || 'jpg';
            const pad = `profielen/${CRM.user.id}.${ext}`;
            const {error} = await sb.storage.from(CRM.opslag.map).upload(pad, gekozen, {upsert:true});
            if(error){ CRM.toast(CRM.opslag.foutTekst(error), 'err'); herstel(); return; }
            /* We bewaren het PAD, niet een url. De map is niet publiek, dus
               een publieke url werkt niet; en een ondertekende url in de
               database veroudert en lekt. De link wordt bij het tonen
               gemaakt, door CRM.opslag. */
            const {error:e2} = await sb.from('profiles').update({foto_url:pad}).eq('id', CRM.user.id);
            if(e2) throw e2;
            CRM.opslag.wis(pad);      // oude link bij hetzelfde pad vergeten
            waarde = pad;
          }
          CRM.profile.foto_url = waarde;
          CRM.tekenEigenAvatar();
          CRM.modal.close(); CRM.toast('Profielfoto bijgewerkt','ok');
        }catch(e){ CRM.fout('Foto opslaan mislukt', e); herstel(); }
      };
    }});
};

/* ─── Realtime ────────────────────────────────────────────────── */
function realtime(){
  if(CRM._rt) return;
  CRM._rt = sb.channel('crm')
    .on('postgres_changes',{event:'*',schema:'public',table:'candidates'}, () => sync('candidates'))
    .on('postgres_changes',{event:'*',schema:'public',table:'crm_leads'},  () => sync('crm_leads'))
    .on('postgres_changes',{event:'*',schema:'public',table:'crm_activiteiten'}, () => sync('crm_activiteiten'))
    .on('postgres_changes',{event:'*',schema:'public',table:'crm_taken'},  () => sync('crm_taken'))
    .on('postgres_changes',{event:'*',schema:'public',table:'crm_meldingen'}, () => sync('crm_meldingen'))
    .subscribe();
}
const sync = CRM.debounce(async tabel => {
  const map = {candidates:'cands', crm_leads:'leads', crm_activiteiten:'activiteiten', crm_taken:'taken', crm_meldingen:'meldingen'};
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
  CRM.tekenEigenAvatar();
  document.getElementById('whoava').onclick = () => CRM.accountModal();
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
  /* Alleen tonen als er (nog) geen gebruiker is — de sessie kan al hersteld
     zijn vóór DOMContentLoaded nu de bibliotheek lokaal (sneller) laadt. */
  if(!DEMO && !CRM.user) document.getElementById('loginscreen').style.display='flex';
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
    if(!CRM.modules[hash[0]]) return;
    const nieuwId = hash[1] ? decodeURIComponent(hash[1]) : undefined;
    // Ook renderen als alleen het id wijzigt binnen dezelfde module
    if(hash[0] !== CRM.view || nieuwId !== (CRM.params||{}).id)
      CRM.ga(hash[0], nieuwId ? {id:nieuwId} : {});
  });
  document.addEventListener('keydown', e => {
    if(e.key==='Escape'){ if(CRM.modal._aan) CRM.modal.close(); else CRM.drawer.close(); }
  });
});
