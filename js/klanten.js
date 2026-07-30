/* ═══════════════════════════════════════════════════════════════
   MODULE: KLANTEN
   Overzicht van alle klanten + de klantkaart: het scherm waar een
   accountmanager alles van één klant ziet — vacatures, kandidaten,
   activiteiten, contactpersonen, evaluaties, documenten en taken.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Voorkeuren onthouden (crm_klanten_*) ────────────────────── */
const P = {
  get(k,d){ try{ const v = localStorage.getItem('crm_klanten_'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('crm_klanten_'+k, JSON.stringify(v)); }catch(e){} }
};
const F = {
  zoek:     P.get('zoek',''),
  weergave: P.get('weergave','kaarten'),
  eigenaar: P.get('eigenaar',''),
  branche:  P.get('branche',''),
  mijn:     P.get('mijn',false),
  actief:   P.get('actief',false),
  sort:     P.get('sort','naam')
};
function zet(k,v){ F[k]=v; P.set(k,v); }

/* ─── Kleine helpers ──────────────────────────────────────────── */
const uniek = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'nl'));
/* Alleen http(s) doorlaten: een geplakte `javascript:`-link mag nooit uitgevoerd
   worden. Een adres zonder protocol krijgt netjes https:// ervoor. */
const veiligeUrl = u => {
  const s = String(u||'').trim();
  if(!s) return '';
  if(/^https?:\/\//i.test(s)) return s;
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? '' : 'https://' + s;
};
const faseChip = fase => fase
  ? `<span class="chip"><i class="dot" style="background:${CRM.salesKleur(fase)}"></i>${h(fase)}</span>` : '';
const EVAL_CRIT = [
  {k:'samenwerking',   lbl:'Samenwerking'},
  {k:'communicatie',   lbl:'Communicatie'},
  {k:'betaalgedrag',   lbl:'Betaalgedrag'},
  {k:'terugkoppeling', lbl:'Kwaliteit terugkoppeling'},
  {k:'besluitvorming', lbl:'Doorlooptijd besluitvorming'}
];
const VAC_STATUS = ['Open','On hold','Vervuld','Gesloten'];

/* Contactpersonen worden (nog) niet door core geladen — hier eenmalig ophalen. */
let _contGeladen = false;
function zorgContacten(){
  if(!Array.isArray(CRM.state.contacten))  CRM.state.contacten  = [];
  if(!Array.isArray(CRM.state.documenten)) CRM.state.documenten = [];
  if(CRM.demo || _contGeladen) return;
  _contGeladen = true;
  CRM.sb.from('crm_contacten').select('*').then(r => {
    if(r.error){ console.warn('crm_contacten laden', r.error); return; }
    CRM.state.contacten = r.data || [];
    if(CRM.view === 'klanten') CRM.render();
  });
}

/* Laatste contactmoment: nieuwste van clients.laatst_contact en de activiteiten. */
function laatsteContact(k){
  const acts = CRM.activiteitenVoor('klant', k.naam).map(a=>a.op).filter(Boolean).sort();
  const uitAct = acts.length ? acts[acts.length-1] : null;
  const uitK   = k.laatst_contact || null;
  if(!uitAct) return uitK;
  if(!uitK)   return uitAct;
  return new Date(uitAct) > new Date(uitK) ? uitAct : uitK;
}

const wasVoorgesteld = c => (c.historie||[]).some(x => x.fase === 'Voorgesteld')
  || (CRM.faseIdx(c.fase) >= 1 && CRM.faseIdx(c.fase) <= 10);

/* Alle kerncijfers van één klant op één plek. */
function cijfers(naam){
  const cs = CRM.kandidaten().filter(c => c.klant === naam);
  const vs = CRM.vacaturesVan(naam);
  const open   = vs.filter(v => (v.status||'Open') === 'Open');
  const lopend = cs.filter(c => !CRM.DONE.includes(c.fase));
  const nu     = cs.filter(c => CRM.PLACED.includes(c.fase));
  const ooit   = cs.filter(c => CRM.PLACED.includes(c.fase) || c.fase === 'Gestopt' || c.geplaatstOp);
  const vg     = cs.filter(wasVoorgesteld);
  const doorloop = ooit.map(c => {
    if(!c.geplaatstOp || !c.since) return null;
    const d = Math.round((new Date(c.geplaatstOp) - new Date(c.since)) / 86400000);
    return (d >= 0 && d < 400) ? d : null;
  }).filter(d => d != null);
  return {
    cs, vs, open, lopend, nu, ooit, vg,
    openPosities: open.reduce((s,v)=>s+(Number(v.aantal)||1),0),
    ratio: vg.length ? Math.round(ooit.length / vg.length * 100) : null,
    ttp:   doorloop.length ? Math.round(doorloop.reduce((a,b)=>a+b,0) / doorloop.length) : null
  };
}

/* ─── Opslaan ─────────────────────────────────────────────────── */
async function bewaarKlant(naam, wijziging){
  const i = CRM.state.clients.findIndex(c => c.naam === naam);
  if(i < 0) return;
  Object.assign(CRM.state.clients[i], wijziging);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('clients').update(wijziging).eq('naam', naam);
    if(error) return CRM.fout('Opslaan mislukt', error);
  }
  CRM.toast('Opgeslagen','ok');
}
async function bewaarRij(tabel, veld, rij, bestaat){
  const lijst = CRM.state[veld];
  const i = lijst.findIndex(r => String(r.id) === String(rij.id));
  if(i >= 0) Object.assign(lijst[i], rij); else lijst.unshift(rij);
  if(!CRM.demo){
    const {error} = bestaat
      ? await CRM.sb.from(tabel).update(rij).eq('id', rij.id)
      : await CRM.sb.from(tabel).insert(rij);
    if(error) return CRM.fout('Opslaan mislukt', error);
  }
  CRM.toast('Opgeslagen','ok');
}
async function verwijderRij(tabel, veld, id){
  CRM.state[veld] = CRM.state[veld].filter(r => String(r.id) !== String(id));
  if(!CRM.demo){
    const {error} = await CRM.sb.from(tabel).delete().eq('id', id);
    if(error) return CRM.fout('Verwijderen mislukt', error);
  }
  CRM.toast('Verwijderd','ok');
}

/* ═══════════════════════════════════════════════════════════════
   OVERZICHT
   ═══════════════════════════════════════════════════════════════ */
function overzicht(mount, acties){
  acties.innerHTML = `<div class="seg" id="kl_seg">
      <button data-w="kaarten" class="${F.weergave==='kaarten'?'on':''}">Kaarten</button>
      <button data-w="tabel"   class="${F.weergave==='tabel'?'on':''}">Tabel</button>
    </div>`;
  acties.querySelectorAll('#kl_seg button').forEach(b => b.onclick = () => { zet('weergave', b.dataset.w); CRM.render(); });

  const eigenaren = uniek(CRM.state.clients.map(c=>c.eigenaar));
  const branches  = uniek(CRM.state.clients.map(c=>c.branche));

  mount.innerHTML = `
    <div class="stack">
      <div class="card pad">
        <div class="row kl-fil">
          <div class="searchbox" style="flex:1;max-width:300px">
            <input type="search" id="kl_zoek" autocomplete="off" placeholder="Zoek op naam, plaats of branche…" value="${h(F.zoek)}">
          </div>
          <select id="kl_eig" style="width:auto">
            <option value="">Alle eigenaren</option>
            ${eigenaren.map(e=>`<option value="${h(e)}"${F.eigenaar===e?' selected':''}>${h(e)}</option>`).join('')}
          </select>
          <select id="kl_br" style="width:auto">
            <option value="">Alle branches</option>
            ${branches.map(b=>`<option value="${h(b)}"${F.branche===b?' selected':''}>${h(b)}</option>`).join('')}
          </select>
          <select id="kl_sort" style="width:auto">
            <option value="naam"${F.sort==='naam'?' selected':''}>Sorteer op naam</option>
            <option value="contact"${F.sort==='contact'?' selected':''}>Langst geen contact</option>
            <option value="vacatures"${F.sort==='vacatures'?' selected':''}>Meeste open vacatures</option>
            <option value="traject"${F.sort==='traject'?' selected':''}>Meeste lopende kandidaten</option>
          </select>
          <span class="chip btn-like${F.mijn?' on':''}" id="kl_mijn">Mijn klanten</span>
          <span class="chip btn-like${F.actief?' on':''}" id="kl_act">Alleen actieve klanten</span>
          <span class="spacer"></span>
          <span class="meta num" id="kl_telling"></span>
        </div>
      </div>
      <div id="kl_lijst"></div>
    </div>`;

  const zoekEl = mount.querySelector('#kl_zoek');
  zoekEl.oninput = CRM.debounce(() => { zet('zoek', zoekEl.value); lijst(mount); }, 200);
  mount.querySelector('#kl_eig').onchange  = e => { zet('eigenaar', e.target.value); lijst(mount); };
  mount.querySelector('#kl_br').onchange   = e => { zet('branche',  e.target.value); lijst(mount); };
  mount.querySelector('#kl_sort').onchange = e => { zet('sort',     e.target.value); lijst(mount); };
  mount.querySelector('#kl_mijn').onclick  = e => { zet('mijn',   !F.mijn);   e.target.classList.toggle('on', F.mijn);   lijst(mount); };
  mount.querySelector('#kl_act').onclick   = e => { zet('actief', !F.actief); e.target.classList.toggle('on', F.actief); lijst(mount); };
  lijst(mount);
}

function gefilterd(){
  const actieveNamen = new Set(CRM.actieveKlanten().map(c=>c.naam));
  const q = String(F.zoek||'').trim().toLowerCase();
  const rijen = CRM.state.clients.filter(k => {
    if(F.eigenaar && k.eigenaar !== F.eigenaar) return false;
    if(F.branche  && k.branche  !== F.branche)  return false;
    if(F.mijn     && !CRM.isVanMij(k))          return false;
    if(F.actief   && !actieveNamen.has(k.naam)) return false;
    if(q && ![k.naam,k.locatie,k.branche,k.eigenaar,k.fase].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).map(k => ({k, c:cijfers(k.naam), lc:laatsteContact(k)}));

  const srt = {
    naam:      (a,b) => a.k.naam.localeCompare(b.k.naam,'nl'),
    contact:   (a,b) => ((CRM.dagenGeleden(b.lc) == null ? 9999 : CRM.dagenGeleden(b.lc)) - (CRM.dagenGeleden(a.lc) == null ? 9999 : CRM.dagenGeleden(a.lc))),
    vacatures: (a,b) => b.c.open.length - a.c.open.length || a.k.naam.localeCompare(b.k.naam,'nl'),
    traject:   (a,b) => b.c.lopend.length - a.c.lopend.length || a.k.naam.localeCompare(b.k.naam,'nl')
  }[F.sort];
  if(srt) rijen.sort(srt);
  return rijen;
}

function lijst(mount){
  const rijen = gefilterd();
  const wrap = mount.querySelector('#kl_lijst');
  const tel  = mount.querySelector('#kl_telling');
  if(tel) tel.textContent = rijen.length + (rijen.length === 1 ? ' klant' : ' klanten');

  if(!rijen.length){
    wrap.innerHTML = CRM.ui.leeg('Geen klanten gevonden','Pas je zoekopdracht of filters aan.');
    return;
  }

  if(F.weergave === 'tabel'){
    wrap.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr>
        <th>Klant</th><th>Branche</th><th>Locatie</th><th>Fase</th><th>Eigenaar</th>
        <th class="n">Open vac.</th><th class="n">In traject</th><th class="n">Geplaatst</th><th>Laatste contact</th>
      </tr></thead><tbody>${rijen.map(({k,c,lc}) => `
        <tr class="clickable" data-k="${h(k.naam)}">
          <td><b>${h(k.naam)}</b></td>
          <td class="sub">${h(k.branche||'—')}</td>
          <td class="sub">${h(k.locatie||'—')}</td>
          <td>${faseChip(k.fase)}</td>
          <td class="sub">${h(k.eigenaar||'—')}</td>
          <td class="n">${c.open.length}</td>
          <td class="n">${c.lopend.length}</td>
          <td class="n">${c.nu.length}</td>
          <td class="sub num">${h(CRM.geleden(lc)||'nooit')}</td>
        </tr>`).join('')}</tbody></table></div>`;
  } else {
    wrap.innerHTML = `<div class="grid c3">${rijen.map(({k,c,lc}) => {
      const d = CRM.dagenGeleden(lc);
      return `<div class="card kl-kaart" data-k="${h(k.naam)}"><div class="card-b">
        <div class="kl-kop">
          <div style="min-width:0;flex:1">
            <div class="kl-naam trunc">${h(k.naam)}</div>
            <div class="meta trunc">${h([k.branche,k.locatie].filter(Boolean).join(' · ')||'—')}</div>
          </div>
        </div>
        <div class="row tight" style="margin-top:10px">${faseChip(k.fase)}
          ${k.eigenaar?`<span class="chip">${h(k.eigenaar)}</span>`:''}</div>
        <div class="kl-stats">
          <div><b class="num">${c.open.length}</b><span>open vacatures</span></div>
          <div><b class="num">${c.lopend.length}</b><span>in traject</span></div>
          <div><b class="num">${c.nu.length}</b><span>geplaatst</span></div>
        </div>
        <div class="kl-foot">
          <span class="meta">Laatste contact</span>
          <span class="meta num${d!=null&&d>30?' let':''}">${h(CRM.geleden(lc)||'nooit')}</span>
        </div>
      </div></div>`;
    }).join('')}</div>`;
  }
  wrap.querySelectorAll('[data-k]').forEach(el => el.onclick = () => CRM.ga('klanten',{id:el.dataset.k}));
}

/* ═══════════════════════════════════════════════════════════════
   KLANTKAART
   ═══════════════════════════════════════════════════════════════ */
let klantOpen = null, tabActief = 'vacatures', groepeer = P.get('groepeer','fase');

function kaart(mount, acties, naam){
  const k = CRM.klant(naam);
  if(!k){
    acties.innerHTML = '';
    mount.innerHTML = CRM.ui.leeg('Klant niet gevonden', naam + ' staat niet in het systeem.',
      '<button class="btn ghost" id="kl_terug">Terug naar overzicht</button>');
    mount.querySelector('#kl_terug').onclick = () => CRM.ga('klanten');
    return;
  }
  if(klantOpen !== naam){ klantOpen = naam; tabActief = 'vacatures'; }

  const c  = cijfers(naam);
  const lc = laatsteContact(k);

  acties.innerHTML = `
    <button class="btn ghost sm" id="k_terug">← Overzicht</button>
    <button class="btn ghost sm" id="k_bel">Bellen</button>
    <button class="btn ghost sm" id="k_mail">Mailen</button>
    <button class="btn ghost sm" id="k_notitie">Notitie</button>
    <button class="btn ghost sm" id="k_plan">Inplannen</button>
    <button class="btn sm" id="k_taak">Taak</button>`;
  acties.querySelector('#k_terug').onclick   = () => CRM.ga('klanten');
  acties.querySelector('#k_plan').onclick    = () => planModal(k);
  acties.querySelector('#k_bel').onclick     = () => logVia(k,'bel','Wat is er besproken?');
  acties.querySelector('#k_mail').onclick    = () => logVia(k,'mail','Waarover ging de mail?');
  acties.querySelector('#k_notitie').onclick = () => logVia(k,'notitie','Wat wil je onthouden?');
  acties.querySelector('#k_taak').onclick    = () => taakModal(k.naam);

  mount.innerHTML = `
    <div class="stack">
      ${kopHtml(k, lc)}
      ${kpiHtml(k, c)}
      ${signalenHtml(k, c, lc)}
      <div>
        <div class="tabs" id="k_tabs">${tabsHtml(k, c)}</div>
        <div id="k_tabinhoud"></div>
      </div>
    </div>`;

  mount.querySelectorAll('#k_tabs .tab').forEach(b => b.onclick = () => {
    tabActief = b.dataset.t;
    mount.querySelectorAll('#k_tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === tabActief));
    tabInhoud(mount, k);
  });
  mount.querySelector('#k_bewerk').onclick = () => klantModal(k);
  tabInhoud(mount, k);
}

function kopHtml(k, lc){
  const d = CRM.dagenGeleden(lc);
  const contact = [
    k.telefoon ? `<a href="tel:${h(String(k.telefoon).replace(/\s/g,''))}" class="num">${h(k.telefoon)}</a>` : '',
    k.email    ? `<a href="mailto:${h(k.email)}">${h(k.email)}</a>` : '',
    veiligeUrl(k.website) ? `<a href="${h(veiligeUrl(k.website))}" target="_blank" rel="noopener">Website</a>` : ''
  ].filter(Boolean).join('<span class="kl-sep">·</span>');
  return `<div class="card"><div class="card-b kl-hero">
      <div style="min-width:0;flex:1">
        <div class="h1" style="font-size:24px">${h(k.naam)}</div>
        <div class="row tight" style="margin-top:8px">
          ${faseChip(k.fase)}
          ${k.branche  ? `<span class="chip">${h(k.branche)}</span>`  : ''}
          ${k.locatie  ? `<span class="chip">${h(k.locatie)}</span>`  : ''}
          ${k.eigenaar ? `<span class="chip">AM ${h(k.eigenaar)}</span>` : ''}
          ${k.sinds    ? `<span class="chip">Klant sinds <span class="num">${h(CRM.fmtDate(k.sinds))}</span></span>` : ''}
          <span class="chip${d!=null&&d>30?' amber':''}">Laatste contact <span class="num">${h(CRM.geleden(lc)||'nooit')}</span></span>
        </div>
        ${contact ? `<div class="kl-contact">${contact}</div>` : '<div class="kl-contact meta">Nog geen contactgegevens ingevuld</div>'}
      </div>
      <button class="btn ghost sm" id="k_bewerk">Gegevens bewerken</button>
    </div></div>`;
}

function kpiHtml(k, c){
  let geld = '';
  if(CRM.canSeeMoney()){
    const kansen = (CRM.state.kansen||[]).filter(x => x.klant === k.naam && x.status === 'open');
    const som = kansen.reduce((s,x)=>s+(Number(x.waarde)||0),0);
    geld = CRM.ui.kpi('Open kanswaarde', `<span class="num">${CRM.euro(som)}</span>`,
      `<span class="num">${kansen.length}</span> open kans${kansen.length===1?'':'en'}`, 'accent');
  }
  return `<div class="grid c4">
    ${CRM.ui.kpi('Geplaatst ooit',    `<span class="num">${c.ooit.length}</span>`, 'sinds de start van de samenwerking')}
    ${CRM.ui.kpi('Actief geplaatst',  `<span class="num">${c.nu.length}</span>`,   'werken nu bij deze klant')}
    ${CRM.ui.kpi('Open vacatures',    `<span class="num">${c.open.length}</span>`, `<span class="num">${c.openPosities}</span> posities gevraagd`)}
    ${CRM.ui.kpi('In lopend traject', `<span class="num">${c.lopend.length}</span>`, 'kandidaten onderweg')}
    ${CRM.ui.kpi('Tijd tot plaatsing', c.ttp!=null?`<span class="num">${c.ttp}</span>`:'—', c.ttp!=null?'dagen gemiddeld':'nog te weinig data')}
    ${CRM.ui.kpi('Aanname-ratio', c.ratio!=null?`<span class="num">${CRM.pct(c.ratio)}</span>`:'—',
        c.ratio!=null?`<span class="num">${c.ooit.length}</span> van <span class="num">${c.vg.length}</span> voorgesteld`:'nog niemand voorgesteld')}
    ${geld}
  </div>`;
}

/* Signalen — alleen tonen wat echt speelt. */
function signalenHtml(k, c, lc){
  const s = [];
  const d = CRM.dagenGeleden(lc);
  if(d == null)   s.push('Er is nog nooit contact vastgelegd bij deze klant.');
  else if(d > 30) s.push(`Al <b class="num">${d}</b> dagen geen contact — tijd voor een belletje.`);

  c.open.forEach(v => {
    const dg = CRM.dagenGeleden(v.aangemaakt);
    if(dg != null && dg > 30) s.push(`Vacature <b>${h(v.functie)}</b> staat <b class="num">${dg}</b> dagen open.`);
  });

  const garantie = c.cs.filter(x => {
    if(x.fase !== 'Gestopt' || !x.gestoptOp || !x.geplaatstOp) return false;
    const mnd = (new Date(x.gestoptOp) - new Date(x.geplaatstOp)) / 2592000000;
    return mnd >= 0 && mnd <= (x.garantieMnd || 2);
  });
  if(garantie.length)
    s.push(`<b class="num">${garantie.length}</b> kandidaat${garantie.length===1?'':'en'} gestopt binnen de garantieperiode (${garantie.map(x=>h(x.naam)).join(', ')}).`);

  const afgewezen = c.cs.filter(x => x.afvalCat === 'Klant wees af');
  if(afgewezen.length >= 3)
    s.push(`Deze klant wees <b class="num">${afgewezen.length}</b> voorgestelde kandidaten af — scherper voorselecteren of verwachtingen bijstellen.`);

  if(!s.length) return '';
  return `<div class="card"><div class="card-h"><div class="h2">Signalen</div>
      <span class="chip amber num">${s.length}</span></div>
    <div class="card-b"><ul class="kl-sig">${s.map(x=>`<li>${x}</li>`).join('')}</ul></div></div>`;
}

function tabsHtml(k, c){
  const acts  = CRM.activiteitenVoor('klant', k.naam);
  const cont  = (CRM.state.contacten||[]).filter(x => x.klant === k.naam);
  const docs  = (CRM.state.documenten||[]).filter(x => x.entiteit === 'klant' && x.ref === k.naam);
  const evals = acts.filter(a => a.extra && a.extra.evaluatie);
  const taken = (CRM.state.taken||[]).filter(t => t.entiteit === 'klant' && t.ref === k.naam);
  return [
    ['vacatures','Vacatures', c.vs.length],
    ['kandidaten','Kandidaten', c.cs.length],
    ['activiteiten','Activiteiten', acts.length],
    ['contacten','Contactpersonen', cont.length],
    ['evaluaties','Evaluaties', evals.length],
    ['documenten','Documenten', docs.length],
    ['notities','Notities & taken', taken.filter(t=>!t.klaar).length]
  ].map(([kk,lbl,n]) => `<button class="tab${tabActief===kk?' on':''}" data-t="${kk}">${h(lbl)}${n?`<span class="cnt num">${n}</span>`:''}</button>`).join('');
}

function tabInhoud(mount, k){
  const el = mount.querySelector('#k_tabinhoud');
  const c  = cijfers(k.naam);
  const fn = {
    vacatures:    () => tabVacatures(el, k, c),
    kandidaten:   () => tabKandidaten(el, k, c),
    activiteiten: () => tabActiviteiten(el, k),
    contacten:    () => tabContacten(el, k),
    evaluaties:   () => tabEvaluaties(el, k),
    documenten:   () => tabDocumenten(el, k),
    notities:     () => tabNotities(el, k)
  }[tabActief];
  if(fn) fn(); else el.innerHTML = '';
}

/* ─── Tab: vacatures ──────────────────────────────────────────── */
function tabVacatures(el, k, c){
  const alle = c.vs.slice().sort((a,b) =>
    String(a.status||'Open').localeCompare(String(b.status||'Open')) ||
    String(a.functie).localeCompare(String(b.functie),'nl'));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Vacatures</div>
      <span class="meta num">${alle.length} totaal · ${c.open.length} open</span>
      <span class="spacer"></span>
      <button class="btn sm" id="v_nieuw">Vacature toevoegen</button></div>
    <div class="card-b">${alle.length ? alle.map(v => vacatureHtml(v, k)).join('') :
      CRM.ui.leeg('Nog geen vacatures','Voeg de eerste opdracht van deze klant toe.')}</div></div>`;

  el.querySelector('#v_nieuw').onclick = () => vacatureModal(k, null);
  el.querySelectorAll('[data-vbew]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    vacatureModal(k, c.vs.find(v => String(v.id) === b.dataset.vbew));
  });
  el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => {
    e.preventDefault(); CRM.ga('kandidaten',{id:a.dataset.kand});
  });
}

function vacatureHtml(v, k){
  const dg = CRM.dagenGeleden(v.aangemaakt);
  const open = (v.status||'Open') === 'Open';
  const kandidaten = CRM.kandidaten().filter(c => c.klant === k.naam &&
    (String(c.vacatureId||'') === String(v.id) || (!c.vacatureId && c.functie === v.functie)));
  const lopend = kandidaten.filter(c => !CRM.DONE.includes(c.fase));
  const sal = (v.sal_min || v.sal_max)
    ? `<span class="chip num">${CRM.euro(v.sal_min)} – ${CRM.euro(v.sal_max)}</span>` : '';
  return `<details class="kl-vac"${open?' open':''}>
    <summary>
      <div style="min-width:0;flex:1">
        <b>${h(v.functie)}</b>
        <div class="meta">${h(v.locatie||k.locatie||'—')} · <span class="num">${Number(v.aantal)||1}</span> gevraagd · <span class="num">${lopend.length}</span> in traject</div>
      </div>
      ${sal}
      <span class="chip${open?' green':''}">${h(v.status||'Open')}</span>
      ${open && dg!=null ? `<span class="chip${dg>30?' amber':''}">open <span class="num">${dg}</span> dgn</span>` : ''}
      <button class="btn sub sm" data-vbew="${h(String(v.id))}">Bewerken</button>
    </summary>
    <div class="kl-vac-b">
      ${v.omschrijving ? `<p class="sub" style="margin:0 0 10px">${h(v.omschrijving)}</p>` : ''}
      ${kandidaten.length ? `<div class="kl-kandlijst">${kandidaten.map(c=>kandRegel(c)).join('')}</div>`
        : '<p class="meta" style="margin:0">Nog geen kandidaten gekoppeld aan deze vacature.</p>'}
    </div></details>`;
}

function laatsteKandContact(c){
  const alle = CRM.activiteitenVoor('kandidaat', c.id).map(a=>a.op)
    .concat((c.notities||[]).map(n=>n.op)).filter(Boolean).sort();
  return alle.length ? alle[alle.length-1] : (c.since || null);
}
function kandRegel(c){
  const lc = laatsteKandContact(c);
  const d  = CRM.dagenGeleden(lc);
  return `<a class="kl-kand" data-kand="${h(String(c.id))}" href="#kandidaten/${encodeURIComponent(c.id)}">
    <div style="min-width:0;flex:1"><b class="trunc">${h(c.naam)}</b>
      <div class="meta trunc">${h(c.functie||'—')}${c.woonplaats?' · '+h(c.woonplaats):''}</div></div>
    <span class="chip"><i class="dot" style="background:${CRM.faseKleur(c.fase)}"></i>${h(c.fase)}</span>
    ${c.rec?`<span class="meta kl-rec">${h(c.rec)}</span>`:''}
    <span class="meta num kl-when${d!=null&&d>=14?' let':''}">${h(CRM.geleden(lc)||'—')}</span>
  </a>`;
}

/* ─── Tab: kandidaten ─────────────────────────────────────────── */
function tabKandidaten(el, k, c){
  const groepen = {};
  if(groepeer === 'vacature'){
    c.cs.forEach(x => {
      const v = c.vs.find(v => String(v.id) === String(x.vacatureId||''));
      const key = v ? v.functie : (x.functie || 'Zonder vacature');
      (groepen[key] = groepen[key] || []).push(x);
    });
  } else {
    CRM.PHASES.forEach(p => { const g = c.cs.filter(x => x.fase === p.k); if(g.length) groepen[p.k] = g; });
    const rest = c.cs.filter(x => !CRM.PHASES.some(p => p.k === x.fase));
    if(rest.length) groepen['Overig'] = rest;
  }
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Kandidaten</div>
      <span class="meta num">${c.cs.length} totaal · ${c.lopend.length} lopend</span>
      <span class="spacer"></span>
      <div class="seg" id="k_grp">
        <button data-g="fase" class="${groepeer==='fase'?'on':''}">Per fase</button>
        <button data-g="vacature" class="${groepeer==='vacature'?'on':''}">Per vacature</button>
      </div></div>
    <div class="card-b">${Object.keys(groepen).length ? Object.keys(groepen).map(g => `
        <div class="kl-groep"><div class="label">${h(g)} <span class="num">${groepen[g].length}</span></div>
          <div class="kl-kandlijst">${groepen[g].map(x=>kandRegel(x)).join('')}</div></div>`).join('')
      : CRM.ui.leeg('Nog geen kandidaten','Zodra je iemand voorstelt bij deze klant verschijnt hij hier.')}</div></div>`;

  el.querySelectorAll('#k_grp button').forEach(b => b.onclick = () => {
    groepeer = b.dataset.g; P.set('groepeer', groepeer); tabKandidaten(el, k, c);
  });
  el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => { e.preventDefault(); CRM.ga('kandidaten',{id:a.dataset.kand}); });
}

/* ─── Tab: activiteiten ───────────────────────────────────────── */
function tabActiviteiten(el, k){
  const acts = CRM.activiteitenVoor('klant', k.naam).slice().sort((a,b) => new Date(b.op) - new Date(a.op));
  const items = acts.map(a => ({
    titel: ((CRM.ACT_SOORTEN[a.soort]||{}).lbl || a.soort) + (a.door ? ' · ' + a.door : ''),
    wanneer: CRM.fmtDate(a.op) + ' · ' + CRM.geleden(a.op),
    tekst: (a.extra && a.extra.evaluatie) ? evalSamenvatting(a.extra.evaluatie) : a.tekst
  }));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Activiteiten</div><span class="spacer"></span>
      <div class="row tight">${['bel','mail','whatsapp','gesprek','bezoek','notitie'].map(s =>
        `<button class="btn ghost sm" data-log="${s}">${h((CRM.ACT_SOORTEN[s]||{}).lbl||s)}</button>`).join('')}</div>
    </div>
    <div class="card-b">${CRM.ui.tijdlijn(items)}</div></div>`;
  el.querySelectorAll('[data-log]').forEach(b => b.onclick = () => logVia(k, b.dataset.log, 'Wat leg je vast?'));
}

async function logVia(k, soort, hint){
  const tekst = await CRM.vraag((CRM.ACT_SOORTEN[soort]||{}).lbl || 'Activiteit',
    {multiline:true, hint, knop:'Vastleggen'});
  if(!tekst) return;
  await CRM.logActiviteit('klant', k.naam, soort, tekst);
  if(soort !== 'notitie') await bewaarKlant(k.naam, {laatst_contact: CRM.todayISO()});
  else CRM.toast('Vastgelegd','ok');
  CRM.render();
}

/* ─── Tab: contactpersonen ────────────────────────────────────── */
function tabContacten(el, k){
  const rij = (CRM.state.contacten||[]).filter(x => x.klant === k.naam)
    .sort((a,b) => (b.hoofd?1:0) - (a.hoofd?1:0) || String(a.naam).localeCompare(String(b.naam),'nl'));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Contactpersonen</div><span class="spacer"></span>
      <button class="btn sm" id="ct_nieuw">Contactpersoon toevoegen</button></div>
    <div class="card-b">${rij.length ? `<div class="kl-contacten">${rij.map(x => `
      <div class="kl-ct">
        <div style="min-width:0;flex:1">
          <div class="row tight"><b>${h(x.naam)}</b>${x.hoofd?'<span class="chip green">Hoofdcontact</span>':''}</div>
          <div class="meta">${h(x.functie||'—')}</div>
          <div class="kl-contact">
            ${x.telefoon?`<a class="num" href="tel:${h(String(x.telefoon).replace(/\s/g,''))}">${h(x.telefoon)}</a>`:''}
            ${x.telefoon&&x.email?'<span class="kl-sep">·</span>':''}
            ${x.email?`<a href="mailto:${h(x.email)}">${h(x.email)}</a>`:''}
          </div>
          ${x.note?`<div class="sub" style="margin-top:6px">${h(x.note)}</div>`:''}
        </div>
        <div class="row tight">
          ${x.hoofd?'':`<button class="btn sub sm" data-hoofd="${h(x.id)}">Maak hoofdcontact</button>`}
          <button class="btn sub sm" data-ctbew="${h(x.id)}">Bewerken</button>
        </div>
      </div>`).join('')}</div>`
      : CRM.ui.leeg('Nog geen contactpersonen','Leg vast met wie je bij deze klant schakelt.')}</div></div>`;

  el.querySelector('#ct_nieuw').onclick = () => contactModal(k, null);
  el.querySelectorAll('[data-ctbew]').forEach(b => b.onclick = () =>
    contactModal(k, CRM.state.contacten.find(x => String(x.id) === b.dataset.ctbew)));
  el.querySelectorAll('[data-hoofd]').forEach(b => b.onclick = async () => {
    for(const x of CRM.state.contacten.filter(x => x.klant === k.naam && x.hoofd))
      await bewaarRij('crm_contacten','contacten', Object.assign({}, x, {hoofd:false}), true);
    const c = CRM.state.contacten.find(x => String(x.id) === b.dataset.hoofd);
    await bewaarRij('crm_contacten','contacten', Object.assign({}, c, {hoofd:true}), true);
    CRM.render();
  });
}

function contactModal(k, ct){
  const n = ct || {id:CRM.uid(), klant:k.naam, naam:'', functie:'', telefoon:'', email:'', linkedin:'', hoofd:false, note:''};
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${ct?'Contactpersoon bewerken':'Nieuwe contactpersoon'}</div></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Naam</label><input type="text" id="c_naam" value="${h(n.naam)}"></div>
        <div class="f-row"><label>Functie</label><input type="text" id="c_functie" value="${h(n.functie)}"></div>
        <div class="f-row"><label>Telefoon</label><input type="tel" id="c_tel" value="${h(n.telefoon)}"></div>
        <div class="f-row"><label>E-mail</label><input type="email" id="c_mail" value="${h(n.email)}"></div>
      </div>
      <div class="f-row"><label>Notitie</label><textarea id="c_note">${h(n.note)}</textarea></div>
      <label class="check"><input type="checkbox" id="c_hoofd"${n.hoofd?' checked':''}> Hoofdcontact bij deze klant</label>
    </div>
    <div class="modal-f">
      ${ct?'<button class="btn sub" id="c_weg">Verwijderen</button>':''}
      <span class="spacer"></span>
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="c_ok">Opslaan</button>
    </div>`, {onOpen(m){
      m.querySelector('#c_ok').onclick = async () => {
        const rij = Object.assign({}, n, {
          naam:m.querySelector('#c_naam').value.trim(), functie:m.querySelector('#c_functie').value.trim(),
          telefoon:m.querySelector('#c_tel').value.trim(), email:m.querySelector('#c_mail').value.trim(),
          note:m.querySelector('#c_note').value.trim(), hoofd:m.querySelector('#c_hoofd').checked
        });
        if(!rij.naam) return CRM.toast('Vul een naam in','err');
        CRM.modal.close();
        await bewaarRij('crm_contacten','contacten', rij, !!ct);
        CRM.render();
      };
      const weg = m.querySelector('#c_weg');
      if(weg) weg.onclick = async () => {
        if(!await CRM.bevestig('Contactpersoon verwijderen?', n.naam)) return;
        CRM.modal.close(); await verwijderRij('crm_contacten','contacten', n.id); CRM.render();
      };
    }});
}

/* ─── Tab: evaluaties ─────────────────────────────────────────── */
function gem(ev){
  const w = EVAL_CRIT.map(c => Number((ev.cijfers||{})[c.k])).filter(n => n > 0);
  return w.length ? w.reduce((a,b)=>a+b,0) / w.length : null;
}
function evalSamenvatting(ev){
  const g = gem(ev);
  return 'Evaluatie samenwerking' + (g ? ' — gemiddeld ' + g.toFixed(1) + ' / 5' : '')
    + (ev.goed  ? '\nWat gaat goed: '  + ev.goed  : '')
    + (ev.beter ? '\nWat kan beter: ' + ev.beter : '');
}
function tabEvaluaties(el, k){
  const evals = CRM.activiteitenVoor('klant', k.naam).filter(a => a.extra && a.extra.evaluatie)
    .map(a => a.extra.evaluatie)
    .sort((a,b) => String(b.datum||'').localeCompare(String(a.datum||'')));
  const alle   = evals.map(gem).filter(n => n != null);
  const totaal = alle.length ? (alle.reduce((a,b)=>a+b,0) / alle.length) : null;

  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Evaluaties</div>
      ${totaal!=null?`<span class="chip${totaal>=4?' green':totaal>=3?'':' amber'}">Gemiddeld <span class="num">${totaal.toFixed(1)}</span> / 5</span>`:''}
      <span class="spacer"></span>
      <button class="btn sm" id="ev_nieuw">Evaluatie invullen</button></div>
    <div class="card-b">
      ${evals.length ? `
        <div class="kl-evverloop">
          <div class="label">Verloop gemiddelde</div>
          <div class="kl-evrij">${evals.slice().reverse().map(e => {
            const g = gem(e) || 0;
            return `<div class="kl-evtick">
              ${CRM.ui.bar(g/5*100, g>=4?'green':g>=3?'':'amber')}
              <span class="num">${g?g.toFixed(1):'—'}</span>
              <span class="meta num">${h(CRM.fmtDateShort(e.datum))}</span></div>`;
          }).join('')}</div>
        </div>
        ${evals.map(e => evalHtml(e)).join('')}`
        : CRM.ui.leeg('Nog geen evaluatie','Beoordeel periodiek hoe de samenwerking loopt — dat maakt het gesprek met deze klant concreet.')}
    </div></div>`;
  el.querySelector('#ev_nieuw').onclick = () => evalModal(k);
}

function evalHtml(e){
  const g = gem(e);
  return `<div class="kl-eval">
    <div class="row" style="margin-bottom:10px">
      <b class="num">${h(CRM.fmtDate(e.datum))}</b>
      <span class="meta">door ${h(e.door||'—')}</span>
      <span class="spacer"></span>
      ${g!=null?`<span class="chip${g>=4?' green':g>=3?'':' amber'}"><span class="num">${g.toFixed(1)}</span> / 5</span>`:''}
    </div>
    <div class="kl-evcrit">${EVAL_CRIT.map(c => {
      const w = Number((e.cijfers||{})[c.k]) || 0;
      return `<div class="kl-evc"><span class="sub">${h(c.lbl)}</span>
        ${CRM.ui.bar(w/5*100, w>=4?'green':w>=3?'':'amber')}
        <span class="num">${w||'—'}</span></div>`;
    }).join('')}</div>
    ${e.goed  ? `<div class="kl-evtxt"><span class="label">Wat gaat goed</span><p>${h(e.goed)}</p></div>`  : ''}
    ${e.beter ? `<div class="kl-evtxt"><span class="label">Wat kan beter</span><p>${h(e.beter)}</p></div>` : ''}
  </div>`;
}

function evalModal(k){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Evaluatie samenwerking</div>
      <p class="sub" style="margin:6px 0 0">${h(k.naam)} — cijfer van 1 (slecht) tot 5 (uitstekend).</p></div>
    <div class="modal-b">
      ${EVAL_CRIT.map(c => `<div class="f-row kl-evinput"><label>${h(c.lbl)}</label>
        <select id="ev_${c.k}">${[5,4,3,2,1].map(n=>`<option value="${n}"${n===4?' selected':''}>${n}</option>`).join('')}</select></div>`).join('')}
      <div class="f-row"><label>Wat gaat goed</label><textarea id="ev_goed" placeholder="Snelle terugkoppeling, korte lijnen…"></textarea></div>
      <div class="f-row"><label>Wat kan beter</label><textarea id="ev_beter" placeholder="Besluitvorming duurt lang…"></textarea></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="ev_datum" value="${h(CRM.todayISO())}"></div>
        <div class="f-row"><label>Door</label><input type="text" id="ev_door" value="${h(CRM.me())}"></div>
      </div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ev_ok">Evaluatie opslaan</button></div>`, {onOpen(m){
    m.querySelector('#ev_ok').onclick = async () => {
      const cijfers = {};
      EVAL_CRIT.forEach(c => { cijfers[c.k] = Number(m.querySelector('#ev_'+c.k).value); });
      const ev = {
        datum: m.querySelector('#ev_datum').value || CRM.todayISO(),
        door:  m.querySelector('#ev_door').value.trim() || CRM.me(),
        cijfers,
        goed:  m.querySelector('#ev_goed').value.trim(),
        beter: m.querySelector('#ev_beter').value.trim()
      };
      CRM.modal.close();
      await CRM.logActiviteit('klant', k.naam, 'notitie', evalSamenvatting(ev), {evaluatie:ev});
      CRM.toast('Evaluatie vastgelegd','ok');
      tabActief = 'evaluaties'; CRM.render();
    };
  }});
}

/* ─── Tab: documenten ─────────────────────────────────────────── */
function tabDocumenten(el, k){
  const docs = (CRM.state.documenten||[]).filter(x => x.entiteit === 'klant' && x.ref === k.naam)
    .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Documenten</div><span class="spacer"></span>
      <button class="btn sm" id="d_nieuw">Document koppelen</button></div>
    <div class="card-b">${docs.length ? `<div class="tblwrap"><table class="tbl"><thead><tr>
        <th>Document</th><th>Soort</th><th>Toegevoegd</th><th>Door</th><th></th></tr></thead><tbody>
        ${docs.map(d => `<tr>
          <td>${veiligeUrl(d.url) ? `<a href="${h(veiligeUrl(d.url))}" target="_blank" rel="noopener">${h(d.naam)}</a>` : h(d.naam)}</td>
          <td class="sub">${h(d.soort||'—')}</td>
          <td class="sub num">${h(CRM.fmtDate(d.op))}</td>
          <td class="sub">${h(d.door||'—')}</td>
          <td class="n"><button class="btn sub sm" data-dweg="${h(d.id)}">Verwijderen</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : CRM.ui.leeg('Nog geen documenten','Koppel de SWO, offerte of andere afspraken zodat iedereen ze terugvindt.')}</div></div>`;

  el.querySelector('#d_nieuw').onclick = () => docModal(k);
  el.querySelectorAll('[data-dweg]').forEach(b => b.onclick = async () => {
    if(!await CRM.bevestig('Document loskoppelen?')) return;
    await verwijderRij('crm_documenten','documenten', b.dataset.dweg); CRM.render();
  });
}
function docModal(k){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Document koppelen</div></div>
    <div class="modal-b">
      <div class="f-row"><label>Naam</label><input type="text" id="d_naam" placeholder="SWO ${h(k.naam)}"></div>
      <div class="f-row"><label>Soort</label><select id="d_soort">
        ${['SWO','Offerte','Plan van aanpak','Contract','Overig'].map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="f-row"><label>Link</label><input type="url" id="d_url" placeholder="https://…">
        <span class="hint">Plak de link naar het bestand (Drive, SharePoint of Supabase-opslag).</span></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="d_ok">Koppelen</button></div>`, {onOpen(m){
    m.querySelector('#d_ok').onclick = async () => {
      const rij = {id:CRM.uid(), entiteit:'klant', ref:k.naam,
        naam:m.querySelector('#d_naam').value.trim(), soort:m.querySelector('#d_soort').value,
        url:m.querySelector('#d_url').value.trim(), door:CRM.me(), op:new Date().toISOString()};
      if(!rij.naam || !rij.url) return CRM.toast('Naam en link zijn nodig','err');
      CRM.modal.close();
      await bewaarRij('crm_documenten','documenten', rij, false);
      CRM.render();
    };
  }});
}

/* ─── Tab: notities & taken ───────────────────────────────────── */
function tabNotities(el, k){
  const taken = (CRM.state.taken||[]).filter(t => t.entiteit === 'klant' && t.ref === k.naam)
    .sort((a,b) => (a.klaar?1:0)-(b.klaar?1:0) || String(a.datum||'').localeCompare(String(b.datum||'')));
  const notities = CRM.activiteitenVoor('klant', k.naam)
    .filter(a => a.soort === 'notitie' && !(a.extra && a.extra.evaluatie))
    .sort((a,b) => new Date(b.op) - new Date(a.op));

  el.innerHTML = `<div class="grid c2">
    <div class="card">
      <div class="card-h"><div class="h2">Accountnotitie</div></div>
      <div class="card-b">
        <div class="f-row"><textarea id="n_note" placeholder="Vaste afspraken, tarieven, voorkeuren, wie beslist…">${h(k.note||'')}</textarea></div>
        <button class="btn sm" id="n_bewaar">Notitie opslaan</button>
        <div style="height:22px"></div>
        <div class="label" style="margin-bottom:10px">Losse notities</div>
        ${CRM.ui.tijdlijn(notities.map(a => ({titel:a.door||'—',
          wanneer:CRM.fmtDate(a.op)+' · '+CRM.geleden(a.op), tekst:a.tekst})))}
      </div>
    </div>
    <div class="card">
      <div class="card-h"><div class="h2">Taken</div><span class="spacer"></span>
        <button class="btn sm" id="t_nieuw">Taak toevoegen</button></div>
      <div class="card-b">${taken.length ? `<div class="kl-taken">${taken.map(t => `
        <label class="kl-taak${t.klaar?' klaar':''}">
          <input type="checkbox" data-taak="${h(t.id)}"${t.klaar?' checked':''}>
          <div style="flex:1;min-width:0"><b>${h(t.tekst)}</b>
            <div class="meta"><span class="num">${h(CRM.fmtDate(t.datum))}</span>${t.voor?' · '+h(t.voor):''}</div></div>
          ${t.prioriteit==='Hoog'?'<span class="chip amber">Hoog</span>':''}
        </label>`).join('')}</div>` : CRM.ui.leeg('Geen taken','Alles afgehandeld bij deze klant.')}</div>
    </div>
  </div>`;

  el.querySelector('#n_bewaar').onclick = () => bewaarKlant(k.naam, {note: el.querySelector('#n_note').value.trim()});
  el.querySelector('#t_nieuw').onclick  = () => taakModal(k.naam);
  el.querySelectorAll('[data-taak]').forEach(cb => cb.onchange = async () => {
    const t = CRM.state.taken.find(x => String(x.id) === cb.dataset.taak);
    await bewaarRij('crm_taken','taken', Object.assign({}, t, {klaar:cb.checked}), true);
    CRM.render();
  });
}

function taakModal(ref){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe taak</div></div>
    <div class="modal-b">
      <div class="f-row"><label>Wat moet er gebeuren?</label><input type="text" id="t_tekst" placeholder="Bellen over de openstaande vacature"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="t_datum" value="${h(CRM.todayISO())}"></div>
        <div class="f-row"><label>Voor wie</label><input type="text" id="t_voor" value="${h(CRM.me())}"></div>
      </div>
      <label class="check"><input type="checkbox" id="t_hoog"> Hoge prioriteit</label>
      ${CRM.outlook.verbonden()?'<label class="check"><input type="checkbox" id="t_todo" checked> Ook in mijn Outlook To Do</label>':''}
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="t_ok">Taak opslaan</button></div>`, {onOpen(m){
    m.querySelector('#t_ok').onclick = async () => {
      const rij = {id:CRM.uid(), tekst:m.querySelector('#t_tekst').value.trim(),
        datum:m.querySelector('#t_datum').value || CRM.todayISO(), klaar:false,
        entiteit:'klant', ref, voor:m.querySelector('#t_voor').value.trim(), door:CRM.me(),
        prioriteit:m.querySelector('#t_hoog').checked ? 'Hoog' : ''};
      if(!rij.tekst) return CRM.toast('Omschrijf de taak','err');
      const todo = m.querySelector('#t_todo');
      CRM.modal.close();
      await bewaarRij('crm_taken','taken', rij, false);
      if(todo && todo.checked)
        CRM.outlook.maakTaak({titel:rij.tekst, datum:rij.datum, notities:'Klant: '+ref}).catch(()=>{});
      tabActief = 'notities'; CRM.render();
    };
  }});
}

/* ─── Kennismaking inplannen (Outlook of vooringevulde deeplink) ── */
function planModal(k){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Inplannen</div>
      <p class="sub" style="margin:6px 0 0">${h(k.naam)}</p></div>
    <div class="modal-b">
      <div class="f-row"><label>Onderwerp</label><input type="text" id="kp_titel" value="${h('Kennismaking — '+k.naam)}"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="kp_datum" value="${h(CRM.todayISO())}"></div>
        <div class="f-row"><label>Tijd</label><input type="time" id="kp_tijd" value="10:00"></div>
        <div class="f-row"><label>Duur</label><select id="kp_duur">
          <option value="30">30 minuten</option>
          <option value="45" selected>45 minuten</option>
          <option value="60">60 minuten</option></select></div>
        <div class="f-row"><label>Locatie</label><input type="text" id="kp_loc" value="${h(k.locatie||'')}"></div>
      </div>
      <label class="check"><input type="checkbox" id="kp_teams"> Teams-videocall</label>
      <div class="f-row" style="margin-top:10px"><label>Notitie</label>
        <textarea id="kp_body" placeholder="Voor in de uitnodiging…"></textarea></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="kp_ok">Inplannen</button></div>`, {onOpen(m){
    m.querySelector('#kp_ok').onclick = async () => {
      const d = {
        titel:m.querySelector('#kp_titel').value.trim(),
        datum:m.querySelector('#kp_datum').value, tijd:m.querySelector('#kp_tijd').value || '10:00',
        duurMin:Number(m.querySelector('#kp_duur').value)||45,
        locatie:m.querySelector('#kp_loc').value.trim(),
        teams:m.querySelector('#kp_teams').checked,
        body:m.querySelector('#kp_body').value.trim(),
        deelnemers:[k.email].filter(Boolean)
      };
      if(!d.titel) return CRM.toast('Vul een onderwerp in','err');
      if(!d.datum) return CRM.toast('Kies een datum','err');
      CRM.modal.close();
      try{
        const r = await CRM.outlook.maakAfspraak(d);
        CRM.toast(r.via==='graph' ? 'In je agenda gezet' : 'Outlook geopend — klik daar op Opslaan','ok');
        await CRM.logActiviteit('klant', k.naam, 'gesprek',
          `Afspraak ingepland: ${d.titel} op ${CRM.fmtDate(d.datum)} ${d.tijd}`);
        if(r.online) await CRM.logActiviteit('klant', k.naam, 'notitie', 'Teams-link: ' + r.online);
        CRM.render();
      }catch(e){ CRM.fout('Inplannen mislukt', e); }
    };
  }});
}

/* ─── Klantgegevens bewerken ──────────────────────────────────── */
function klantModal(k){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Klantgegevens</div></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Fase</label><select id="g_fase">
          ${CRM.SALES_FASES.map(f=>`<option value="${h(f.k)}"${k.fase===f.k?' selected':''}>${h(f.k)}</option>`).join('')}</select></div>
        <div class="f-row"><label>Eigenaar (AM)</label><input type="text" id="g_eig" value="${h(k.eigenaar||'')}"></div>
        <div class="f-row"><label>Branche</label><input type="text" id="g_br" value="${h(k.branche||'')}"></div>
        <div class="f-row"><label>Locatie</label><input type="text" id="g_loc" value="${h(k.locatie||'')}"></div>
        <div class="f-row"><label>Telefoon</label><input type="tel" id="g_tel" value="${h(k.telefoon||'')}"></div>
        <div class="f-row"><label>E-mail</label><input type="email" id="g_mail" value="${h(k.email||'')}"></div>
        <div class="f-row"><label>Website</label><input type="url" id="g_web" value="${h(k.website||'')}"></div>
        <div class="f-row"><label>Laatste contact</label><input type="date" id="g_lc" value="${h(k.laatst_contact||'')}"></div>
      </div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="g_ok">Opslaan</button></div>`, {onOpen(m){
    m.querySelector('#g_ok').onclick = async () => {
      const w = {
        fase:m.querySelector('#g_fase').value, eigenaar:m.querySelector('#g_eig').value.trim(),
        branche:m.querySelector('#g_br').value.trim(), locatie:m.querySelector('#g_loc').value.trim(),
        telefoon:m.querySelector('#g_tel').value.trim(), email:m.querySelector('#g_mail').value.trim(),
        website:m.querySelector('#g_web').value.trim(), laatst_contact:m.querySelector('#g_lc').value || null
      };
      CRM.modal.close(); await bewaarKlant(k.naam, w); CRM.render();
    };
  }});
}

/* ─── Vacature toevoegen / bewerken ───────────────────────────── */
function vacatureModal(k, v){
  const n = v || {id:'', klant:k.naam, functie:'', locatie:k.locatie||'', aantal:1,
    sal_min:null, sal_max:null, type:'W&S', status:'Open', eigenaar:k.eigenaar||CRM.me(),
    aangemaakt:CRM.todayISO(), omschrijving:''};
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${v?'Vacature bewerken':'Nieuwe vacature'}</div>
      <p class="sub" style="margin:6px 0 0">${h(k.naam)}</p></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Functie</label><input type="text" id="v_functie" value="${h(n.functie)}"></div>
        <div class="f-row"><label>Locatie</label><input type="text" id="v_loc" value="${h(n.locatie)}"></div>
        <div class="f-row"><label>Aantal posities</label><input type="number" id="v_aantal" min="1" value="${Number(n.aantal)||1}"></div>
        <div class="f-row"><label>Status</label><select id="v_status">
          ${VAC_STATUS.map(s=>`<option${(n.status||'Open')===s?' selected':''}>${s}</option>`).join('')}</select></div>
        <div class="f-row"><label>Type</label><select id="v_type">
          ${['W&S','Flex','Detachering'].map(s=>`<option${(n.type||'W&S')===s?' selected':''}>${s}</option>`).join('')}</select></div>
        <div class="f-row"><label>Open sinds</label><input type="date" id="v_sinds" value="${h(String(n.aangemaakt||'').slice(0,10))}"></div>
        <div class="f-row"><label>Maandloon vanaf</label><input type="number" id="v_smin" value="${n.sal_min==null?'':n.sal_min}"></div>
        <div class="f-row"><label>Maandloon tot</label><input type="number" id="v_smax" value="${n.sal_max==null?'':n.sal_max}"></div>
      </div>
      <div class="f-row"><label>Omschrijving</label><textarea id="v_oms" placeholder="Ploegendienst, VCA gewenst, eigen vervoer nodig…">${h(n.omschrijving||'')}</textarea></div>
    </div>
    <div class="modal-f">
      ${v?'<button class="btn sub" id="v_weg">Verwijderen</button>':''}
      <span class="spacer"></span>
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="v_ok">Opslaan</button>
    </div>`, {onOpen(m){
    m.querySelector('#v_ok').onclick = async () => {
      const functie = m.querySelector('#v_functie').value.trim();
      if(!functie) return CRM.toast('Vul een functie in','err');
      const smin = m.querySelector('#v_smin').value, smax = m.querySelector('#v_smax').value;
      const rij = Object.assign({}, n, {
        klant:k.naam, functie, locatie:m.querySelector('#v_loc').value.trim(),
        aantal:Number(m.querySelector('#v_aantal').value)||1,
        status:m.querySelector('#v_status').value, type:m.querySelector('#v_type').value,
        aangemaakt:m.querySelector('#v_sinds').value || CRM.todayISO(),
        sal_min: smin === '' ? null : Number(smin),
        sal_max: smax === '' ? null : Number(smax),
        omschrijving:m.querySelector('#v_oms').value.trim()
      });
      if(!rij.id) rij.id = k.naam + '::' + functie;
      CRM.modal.close();
      await bewaarRij('vacatures','vacs', rij, !!v);
      if(!v) await CRM.logActiviteit('klant', k.naam, 'systeem', 'Vacature ' + functie + ' aangemaakt');
      CRM.render();
    };
    const weg = m.querySelector('#v_weg');
    if(weg) weg.onclick = async () => {
      if(!await CRM.bevestig('Vacature verwijderen?', n.functie)) return;
      CRM.modal.close(); await verwijderRij('vacatures','vacs', n.id); CRM.render();
    };
  }});
}

/* ─── Registratie ─────────────────────────────────────────────── */
CRM.registerModule('klanten', {
  title:'Klanten', icon:'▣', onderschrift:'Klantkaarten en accountbeheer',
  render(mount, acties, params){
    zorgContacten();
    if(params && params.id) kaart(mount, acties, String(params.id));
    else overzicht(mount, acties);
  }
});
})();

/* VERZOEK AAN CORE: `crm_contacten` wordt nog niet door CRM.load() opgehaald en
   `contacten` staat niet in CRM.state. Deze module haalt de tabel nu zelf
   eenmalig op; graag toevoegen aan CRM.load() zodat alle modules dezelfde
   lijst delen. */
