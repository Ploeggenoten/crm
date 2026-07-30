/* ═══════════════════════════════════════════════════════════════
   MODULE: KLANTEN
   Overzicht van alle klanten + de klantkaart: het scherm waar een
   accountmanager alles van één klant ziet. De kaart is bewust
   rustig: essentie bovenaan, contactpersonen direct eronder,
   snelacties binnen handbereik. De cijferbrij staat in Performance.
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
const maandJaar = iso => {
  if(!iso) return '';
  const d = new Date(iso); if(isNaN(d)) return String(iso);
  return d.toLocaleDateString('nl-NL',{month:'short',year:'numeric'});
};
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

/* Kerncijfers van één klant — de kaart toont er nog maar een paar,
   de rest leeft in Performance › Per klant. */
function cijfers(naam){
  const cs = CRM.kandidaten().filter(c => c.klant === naam);
  const vs = CRM.vacaturesVan(naam);
  const open   = vs.filter(v => (v.status||'Open') === 'Open');
  const lopend = cs.filter(c => !CRM.DONE.includes(c.fase));
  const nu     = cs.filter(c => CRM.PLACED.includes(c.fase));
  const ooit   = cs.filter(c => CRM.PLACED.includes(c.fase) || c.fase === 'Gestopt' || c.geplaatstOp);
  const vg     = cs.filter(wasVoorgesteld);
  return {cs, vs, open, lopend, nu, ooit, vg};
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
/* Team opslaan — clients.team bestaat pas na supabase/import-aanvulling.sql.
   Ontbreekt de kolom nog, dan lokaal bijhouden en netjes uitleggen in
   plaats van een kale databasefout. */
async function bewaarTeam(k, team){
  const i = CRM.state.clients.findIndex(c => c.naam === k.naam);
  if(i >= 0) CRM.state.clients[i].team = team;
  k.team = team;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('clients').update({team}).eq('naam', k.naam);
    if(error){
      if(/team.*(column|schema)|column.*team|schema cache/i.test(error.message||''))
        return CRM.toast('Kolom "team" bestaat nog niet — draai eerst supabase/import-aanvulling.sql','err');
      return CRM.fout('Opslaan mislukt', error);
    }
  }
  CRM.toast('Opgeslagen','ok');
}
async function bewaarRij(tabel, veld, rij, bestaat){
  const lijst = CRM.state[veld];
  const i = lijst.findIndex(r => String(r.id) === String(rij.id));
  if(i >= 0) Object.assign(lijst[i], rij); else lijst.unshift(rij);
  if(!CRM.demo){
    if(bestaat){
      const {error} = await CRM.sb.from(tabel).update(rij).eq('id', rij.id);
      if(error) return CRM.fout('Opslaan mislukt', error);
    }else{
      /* Bij nieuw: het door de database gegenereerde id (uuid) terughalen,
         anders is de rij lokaal niet te bewerken tot de volgende reload. */
      const {data, error} = await CRM.sb.from(tabel).insert(rij).select().single();
      if(error) return CRM.fout('Opslaan mislukt', error);
      if(data) Object.assign(rij, data);
    }
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
      <button data-w="kaart"   class="${F.weergave==='kaart'?'on':''}">Kaart</button>
    </div>`;
  acties.querySelectorAll('#kl_seg button').forEach(b => b.onclick = () => { zet('weergave', b.dataset.w); CRM.render(); });

  /* Kaartweergave: de kaart-engine (js/source.js) tekent hier. Deze module
     bouwt zelf géén kaart — alleen de aanroep, met nette terugval. */
  if(F.weergave === 'kaart'){
    mount.innerHTML = '<div id="kl_kaart" class="kl-kaartwrap"></div>';
    const el = mount.querySelector('#kl_kaart');
    if(typeof CRM.kaartRender === 'function') CRM.kaartRender(el, {lens:'klanten'});
    else el.innerHTML = CRM.ui.leeg('Kaart wordt geladen…','De kaartweergave is nog niet beschikbaar.');
    return;
  }

  const eigenaren = uniek(CRM.state.clients.map(c=>c.eigenaar));
  const branches  = uniek(CRM.state.clients.map(c=>c.branche));

  mount.innerHTML = `
    <div class="stack">
      <div class="card pad">
        <div class="row kl-fil">
          <div class="searchbox" style="flex:1;max-width:300px">
            <input type="search" id="kl_zoek" autocomplete="off" placeholder="Zoek op naam, plaats of branche…" value="${h(F.zoek)}">
          </div>
          <select id="kl_fase" style="width:auto">
            <option value="">Alle fases</option>
            ${CRM.SALES_FASES.map(f=>`<option value="${h(f.k)}"${F.fase===f.k?' selected':''}>${h(f.k)}</option>`).join('')}
            <option value="__geen"${F.fase==='__geen'?' selected':''}>Zonder fase</option>
          </select>
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
          <span class="chip btn-like${F.mijn?' on':''}" id="kl_mijn">Mijn relaties</span>
          <span class="chip btn-like${F.actief?' on':''}" id="kl_act">Alleen klanten (actief)</span>
          <span class="spacer"></span>
          <span class="meta num" id="kl_telling"></span>
        </div>
      </div>
      <div id="kl_lijst"></div>
    </div>`;

  const zoekEl = mount.querySelector('#kl_zoek');
  zoekEl.oninput = CRM.debounce(() => { zet('zoek', zoekEl.value); lijst(mount); }, 200);
  mount.querySelector('#kl_fase').onchange = e => { zet('fase',     e.target.value); lijst(mount); };
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
    if(F.fase === '__geen'){ if(k.fase) return false; }
    else if(F.fase && k.fase !== F.fase) return false;
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
  if(tel) tel.textContent = rijen.length + (rijen.length === 1 ? ' relatie' : ' relaties');

  if(!rijen.length){
    wrap.innerHTML = CRM.ui.leeg('Geen relaties gevonden','Pas je zoekopdracht of filters aan.');
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
      return `<div class="card kl-kaart" data-k="${h(k.naam)}" style="--fk:${CRM.salesKleur(k.fase)}">
        <div class="kl-kkop">
          <div class="kl-kop">
            <div style="min-width:0;flex:1">
              <div class="kl-naam trunc">${h(k.naam)}</div>
              <div class="meta trunc">${h([k.branche,k.locatie].filter(Boolean).join(' · ')||'—')}</div>
            </div>
          </div>
          <div class="row tight" style="margin-top:8px">${faseChip(k.fase)}
            ${k.eigenaar?`<span class="chip">${h(k.eigenaar)}</span>`:''}</div>
        </div>
        <div class="card-b kl-klijf">
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
   KLANTKAART — dossier met zijrail: kop bovenaan, links een vaste
   rail (gegevens · contactpersonen · open taken) die in beeld
   blijft, rechts de werkruimte met de tabs.
   ═══════════════════════════════════════════════════════════════ */
const TABS = ['vacatures','kandidaten','activiteiten','evaluaties','documenten'];
let klantOpen = null, tabActief = 'vacatures', groepeer = P.get('groepeer','fase');
let contactZoek = '', contactAlles = false;

function kaart(mount, acties, naam){
  const k = CRM.klant(naam);
  if(!k){
    acties.innerHTML = '';
    mount.innerHTML = CRM.ui.leeg('Klant niet gevonden', naam + ' staat niet in het systeem.',
      '<button class="btn ghost" id="kl_terug">Terug naar overzicht</button>');
    mount.querySelector('#kl_terug').onclick = () => CRM.ga('klanten');
    return;
  }
  if(klantOpen !== naam){ klantOpen = naam; tabActief = 'vacatures'; contactZoek = ''; contactAlles = false; }
  if(!TABS.includes(tabActief)) tabActief = 'vacatures';

  const c = cijfers(naam);

  acties.innerHTML = `
    <button class="btn ghost sm" id="k_terug">← Overzicht</button>
    <button class="btn ghost sm" id="k_bewerk">Gegevens bewerken</button>`;
  acties.querySelector('#k_terug').onclick  = () => CRM.ga('klanten');
  acties.querySelector('#k_bewerk').onclick = () => klantModal(k);

  mount.innerHTML = `
    <div class="stack">
      ${kopHtml(k, c)}
      <div class="kl-dossier">
        <aside class="kl-rail">
          ${gegevensHtml(k)}
          ${contactBlokHtml()}
          ${takenBlokHtml()}
          ${notitiesBlokHtml()}
        </aside>
        <div class="kl-werk">
          ${signalenHtml(k, c, laatsteContact(k))}
          <div>
            <div class="tabs" id="k_tabs">${tabsHtml(k, c)}</div>
            <div id="k_tabinhoud"></div>
          </div>
        </div>
      </div>
    </div>`;

  /* Snelacties in de kop */
  mount.querySelector('#k_bel').onclick     = () => logVia(k,'bel','Wat is er besproken?');
  mount.querySelector('#k_mail').onclick    = () => logVia(k,'mail','Waarover ging de mail?');
  mount.querySelector('#k_plan').onclick    = () => planModal(k);
  mount.querySelector('#k_notitie').onclick = () => logVia(k,'notitie','Wat wil je onthouden? Tip: @collega stuurt diegene een melding.');
  mount.querySelector('#k_taak').onclick    = () => nieuweTaak(k);

  /* Rail: gegevens bewerken */
  mount.querySelector('#gg_bewerk').onclick = () => klantModal(k);

  /* Rail: fase wisselen — zelfde gedrag als het salesbord:
     fase + fase_sinds bijwerken en de wissel loggen. */
  const faseBtn = mount.querySelector('#gg_fase');
  if(faseBtn) faseBtn.onclick = () => {
    const sel = document.createElement('select');
    sel.className = 'kl-fasesel';
    sel.innerHTML = `<option value=""${!k.fase?' selected':''}>Zonder fase</option>` +
      CRM.SALES_FASES.map(f => `<option value="${h(f.k)}"${k.fase===f.k?' selected':''}>${h(f.k)}</option>`).join('');
    faseBtn.replaceWith(sel); sel.focus();
    let klaar = false;
    const sluit = async bewaren => {
      if(klaar) return; klaar = true;
      const nieuw = sel.value;
      if(bewaren && nieuw !== (k.fase||'')){
        const oud = k.fase || '—';
        await bewaarKlant(k.naam, {fase:nieuw, fase_sinds:CRM.todayISO()});
        CRM.logActiviteit('klant', k.naam, 'fase', `Fase gewijzigd: ${oud} → ${nieuw||'—'}`);
      }
      CRM.render();
    };
    sel.onchange  = () => sluit(true);
    sel.onblur    = () => sluit(false);
    sel.onkeydown = e => { if(e.key === 'Escape'){ e.preventDefault(); sluit(false); } };
  };

  /* Rail: team — inline bewerken in dezelfde stijl als de kandidaatvelden. */
  const teamEl = mount.querySelector('#gg_team');
  if(teamEl){
    const startTeam = () => {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'kl-gg-inp'; inp.value = k.team || '';
      teamEl.replaceWith(inp); inp.focus(); inp.select();
      let klaar = false;
      const sluit = async bewaren => {
        if(klaar) return; klaar = true;
        if(bewaren){
          const nieuw = inp.value.trim();
          if(nieuw !== (k.team||'')) await bewaarTeam(k, nieuw);
        }
        inp.replaceWith(teamEl);
        teamEl.textContent = k.team || 'invullen…';
        teamEl.classList.toggle('leeg', !k.team);
      };
      inp.onblur = () => sluit(true);
      inp.onkeydown = e => {
        if(e.key === 'Enter'){ e.preventDefault(); sluit(true); }
        if(e.key === 'Escape'){ e.preventDefault(); sluit(false); }
      };
    };
    teamEl.onclick = startTeam;
    teamEl.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); startTeam(); } };
  }

  /* Rail: contactpersonen — live zoeken zonder het hele scherm te hertekenen */
  const ctLijst = mount.querySelector('#ct_lijst');
  const ctZoek  = mount.querySelector('#ct_zoek');
  ctZoek.oninput = () => { contactZoek = ctZoek.value; contactLijst(ctLijst, k); };
  mount.querySelector('#ct_nieuw').onclick = () => contactModal(k, null);
  contactLijst(ctLijst, k);

  /* Rail: open taken */
  mount.querySelector('#rt_nieuw').onclick = () => nieuweTaak(k);
  railTaken(mount.querySelector('#rt_lijst'), k);

  /* Rail: notities — altijd zichtbaar zodat AM's van elkaar weten wat er
     gezegd is, ongeacht in welke tab je werkt. */
  railNotities(mount, k);

  mount.querySelectorAll('#k_tabs .tab').forEach(b => b.onclick = () => {
    tabActief = b.dataset.t;
    mount.querySelectorAll('#k_tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === tabActief));
    tabInhoud(mount, k);
  });
  tabInhoud(mount, k);
}

/* Kop: naam + fase, één gedempte feitenregel, contactlinks en snelacties. */
function kopHtml(k, c){
  const feiten = [
    c.ooit.length ? `<span class="num">${c.ooit.length}</span> plaatsing${c.ooit.length===1?'':'en'}` : '',
    c.open.length ? `<span class="num">${c.open.length}</span> open vacature${c.open.length===1?'':'s'}` : '',
    k.sinds ? `klant sinds <span class="num">${h(maandJaar(k.sinds))}</span>` : ''
  ].filter(Boolean).join('<span class="kl-sep"> · </span>');
  const contact = [
    k.telefoon ? `<a href="tel:${h(String(k.telefoon).replace(/\s/g,''))}" class="num">${h(k.telefoon)}</a>` : '',
    k.email    ? `<a href="mailto:${h(k.email)}">${h(k.email)}</a>` : '',
    veiligeUrl(k.website) ? `<a href="${h(veiligeUrl(k.website))}" target="_blank" rel="noopener">Website</a>` : ''
  ].filter(Boolean).join('<span class="kl-sep">·</span>');
  return `<div class="card"><div class="card-b kl-hero">
      <div style="min-width:0;flex:1">
        <div class="row tight" style="gap:10px;align-items:center">
          <div class="h1" style="font-size:24px">${h(k.naam)}</div>
          ${faseChip(k.fase)}
        </div>
        <div class="meta" style="margin-top:7px">${h([k.eigenaar?'AM '+k.eigenaar:'', k.locatie, k.branche].filter(Boolean).join(' · ')||'')}</div>
        ${feiten ? `<div class="meta kl-feiten">${feiten}</div>` : ''}
        ${contact ? `<div class="kl-contact">${contact}</div>` : ''}
      </div>
      <div class="row tight kl-snel">
        <button class="btn ghost sm" id="k_bel">Bellen</button>
        <button class="btn ghost sm" id="k_mail">Mailen</button>
        <button class="btn ghost sm" id="k_plan">Inplannen</button>
        <button class="btn ghost sm" id="k_notitie">Notitie</button>
        <button class="btn sm" id="k_taak">+ Taak</button>
      </div>
    </div></div>`;
}

/* ─── Rail: gegevens — compacte kaart met de klantvelden ───────── */
function gegevensHtml(k){
  const web = veiligeUrl(k.website);
  let webTekst = '';
  if(web){ try{ webTekst = new URL(web).hostname.replace(/^www\./,''); }catch(e){ webTekst = 'Website'; } }
  const rij = (lbl, val) => `<div class="kl-gg-rij"><span class="kl-gg-lbl">${h(lbl)}</span>
    <span class="kl-gg-val trunc">${val || '<span class="meta">—</span>'}</span></div>`;
  return `<div class="card kl-railkaart">
    <div class="card-h"><div class="h2">Gegevens</div><span class="spacer"></span>
      <button class="btn sub sm" id="gg_bewerk">Bewerken</button></div>
    <div class="card-b kl-gg">
      ${rij('Fase', `<button type="button" class="chip btn-like kl-fasechip" id="gg_fase"
        title="Klik om de fase te wisselen"><i class="dot" style="background:${CRM.salesKleur(k.fase)}"></i>${h(k.fase||'Zonder fase')}</button>`)}
      ${rij('Telefoon', k.telefoon ? `<a class="num" href="tel:${h(String(k.telefoon).replace(/\s/g,''))}">${h(k.telefoon)}</a>` : '')}
      ${rij('E-mail',   k.email ? `<a href="mailto:${h(k.email)}" title="${h(k.email)}">${h(k.email)}</a>` : '')}
      ${rij('Website',  web ? `<a href="${h(web)}" target="_blank" rel="noopener">${h(webTekst)}</a>` : '')}
      ${rij('Branche',  k.branche ? h(k.branche) : '')}
      ${rij('Plaats',   k.locatie ? h(k.locatie) : '')}
      ${rij('Sinds',    k.sinds ? `<span class="num">${h(maandJaar(k.sinds))}</span>` : '')}
      ${rij('Eigenaar', k.eigenaar ? h(k.eigenaar) : '')}
      ${rij('Team', `<span class="kl-gg-w${k.team?'':' leeg'}" id="gg_team" tabindex="0" role="button"
        title="Klik om te wijzigen">${k.team ? h(k.team) : 'invullen…'}</span>`)}
      ${rij('Aangemaakt', k.aangemaakt ? `<span class="num">${h(CRM.fmtDate(k.aangemaakt))}</span>` : '')}
    </div></div>`;
}

/* ─── Rail: contactpersonen — altijd in beeld naast de tabs ────── */
function contactBlokHtml(){
  return `<div class="card kl-railkaart">
    <div class="card-h"><div class="h2">Contactpersonen</div></div>
    <div class="card-b">
      <div class="searchbox kl-ctzoek">
        <input type="search" id="ct_zoek" autocomplete="off" placeholder="Zoek op naam of functie…" value="${h(contactZoek)}">
      </div>
      <div id="ct_lijst"></div>
      <button class="btn ghost sm kl-railknop" id="ct_nieuw">+ Contactpersoon</button>
    </div></div>`;
}

/* ─── Rail: open taken — dé takenplek van de klantkaart ────────── */
function takenBlokHtml(){
  return `<div class="card kl-railkaart">
    <div class="card-h"><div class="h2">Open taken</div><span class="spacer"></span>
      <button class="btn sm" id="rt_nieuw">+ Taak</button></div>
    <div class="card-b" id="rt_lijst"></div></div>`;
}

/* ─── Rail: notities — het gezamenlijke geheugen van de relatie ── */
function notitiesBlokHtml(){
  return `<div class="card kl-railkaart">
    <div class="card-h"><div class="h2">Notities</div></div>
    <div class="card-b">
      <div class="f-row" style="margin-bottom:10px">
        <textarea id="rn_tekst" rows="2" placeholder="Korte notitie… (@naam meldt een collega)"></textarea>
        <button class="btn sm" id="rn_opslaan" style="align-self:flex-end">Opslaan</button>
      </div>
      <div id="rn_lijst"></div>
    </div></div>`;
}

function railNotities(mount, k){
  const el = mount.querySelector('#rn_lijst'); if(!el) return;
  const teken = () => {
    /* Notities én gespreksverslagen, ook die bij contactpersonen van deze
       relatie — iedereen ziet hetzelfde beeld. */
    const ctIds = new Set((CRM.state.contacten||[]).filter(x => x.klant === k.naam).map(c => String(c.id)));
    const alle = CRM.state.activiteiten
      .filter(a => (a.entiteit==='klant' && a.ref===k.naam && ['notitie','gesprek'].includes(a.soort))
                || (a.entiteit==='contact' && ctIds.has(String(a.ref)) && ['notitie','gesprek'].includes(a.soort)))
      .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));
    const top = alle.slice(0, 5);
    el.innerHTML = top.length ? top.map(a => `
      <div class="rn-item">
        <div class="rn-tekst">${h(a.tekst)}</div>
        <div class="meta num">${h(a.door||'—')} · ${h(CRM.geleden(a.op))}${a.extra?.verslag?' · verslag':''}</div>
      </div>`).join('') + (alle.length > 5
        ? `<button class="btn sub sm" id="rn_alle">Alle ${alle.length} in de tijdlijn →</button>` : '')
      : `<div class="meta">Nog geen notities — wat hier staat ziet het hele team.</div>`;
    const alleBtn = el.querySelector('#rn_alle');
    if(alleBtn) alleBtn.onclick = () => {
      tabActief = 'activiteiten';
      mount.querySelectorAll('#k_tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === 'activiteiten'));
      tabInhoud(mount, k);
    };
  };
  const inp = mount.querySelector('#rn_tekst');
  mount.querySelector('#rn_opslaan').onclick = async () => {
    const tekst = inp.value.trim(); if(!tekst) return;
    await CRM.logActiviteit('klant', k.naam, 'notitie', tekst);
    CRM.verwerkTags(tekst, 'klant', k.naam);
    inp.value = '';
    teken();
    CRM.toast('Notitie opgeslagen','ok');
  };
  teken();
}

function railTaken(el, k){
  if(!el) return;
  const taken = (CRM.state.taken||[]).filter(t => t.entiteit === 'klant' && t.ref === k.naam && !t.klaar)
    .sort((a,b) => String(a.datum||'').localeCompare(String(b.datum||'')));
  if(!taken.length){
    el.innerHTML = '<p class="meta" style="margin:0">Geen open taken bij deze klant.</p>';
    return;
  }
  el.innerHTML = `<div class="kl-taken">${taken.map(t => {
    const wie = [t.voor ? 'voor ' + t.voor : '', t.door && t.door !== t.voor ? 'van ' + t.door : '']
      .filter(Boolean).join(' · ');
    return `<label class="kl-taak">
      <input type="checkbox" data-taak="${h(t.id)}">
      <div style="flex:1;min-width:0"><b>${h(t.tekst)}</b>
        <div class="meta"><span class="num">${h(CRM.fmtDate(t.datum))}</span>${wie ? ' · ' + h(wie) : ''}</div></div>
      ${t.prioriteit==='Hoog'?'<span class="chip amber">Hoog</span>':''}
    </label>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-taak]').forEach(cb => cb.onchange = async () => {
    const t = CRM.state.taken.find(x => String(x.id) === cb.dataset.taak);
    if(!t) return;
    await bewaarRij('crm_taken','taken', Object.assign({}, t, {klaar:true}), true);
    CRM.navBadges();
    railTaken(el, k);
  });
}

/* Contactpersonenlijst op de pagina verversen (bv. na een nieuw verslag). */
function contactLijstVerversen(k){
  const el = document.getElementById('ct_lijst');
  if(el) contactLijst(el, k);
}

/* Laatste contactmoment met déze persoon (uit de contact-activiteiten). */
function laatsteContactPersoon(ct){
  const ops = CRM.activiteitenVoor('contact', ct.id)
    .map(a => (a.extra && a.extra.datum) || a.op).filter(Boolean).sort();
  return ops.length ? ops[ops.length-1] : null;
}

function contactLijst(el, k){
  if(!el) return;
  const q = contactZoek.trim().toLowerCase();
  const alle = (CRM.state.contacten||[]).filter(x => x.klant === k.naam)
    .sort((a,b) => (b.hoofd?1:0) - (a.hoofd?1:0) || String(a.naam).localeCompare(String(b.naam),'nl'));
  const rij = q ? alle.filter(x => (String(x.naam)+' '+String(x.functie||'')).toLowerCase().includes(q)) : alle;

  if(!alle.length){
    el.innerHTML = CRM.ui.leeg('Nog geen contactpersonen','Leg vast met wie je bij deze klant schakelt.');
    return;
  }
  if(!rij.length){
    el.innerHTML = CRM.ui.leeg('Geen contactpersoon gevonden','Probeer een ander zoekwoord.');
    return;
  }
  /* Mobiel: ingeklapt tot de eerste drie, met "toon alle". */
  const mobiel = window.matchMedia && window.matchMedia('(max-width:900px)').matches;
  const inklappen = mobiel && !contactAlles && !q && rij.length > 3;
  const toon = inklappen ? rij.slice(0,3) : rij;
  el.innerHTML = `<div class="kl-contacten">${toon.map(x => {
    const lc = laatsteContactPersoon(x);
    return `
    <div class="kl-ct" data-ct="${h(x.id)}" title="Open het dossier van ${h(x.naam)}">
      <div class="kl-ct-wie">
        <div class="row tight"><b>${h(x.naam)}</b>${x.hoofd?'<span class="chip green">Hoofdcontact</span>':''}</div>
        <div class="meta">${h(x.functie||'—')}</div>
      </div>
      <div class="kl-ct-links kl-contact">
        ${x.telefoon?`<a class="num" href="tel:${h(String(x.telefoon).replace(/\s/g,''))}">${h(x.telefoon)}</a>`:''}
        ${x.telefoon&&x.email?'<span class="kl-sep">·</span>':''}
        ${x.email?`<a href="mailto:${h(x.email)}">${h(x.email)}</a>`:''}
        ${!x.telefoon&&!x.email?'<span class="meta">geen gegevens</span>':''}
      </div>
      <span class="meta num kl-ct-lc">${lc ? 'laatste contact: '+h(CRM.geleden(lc)) : 'nog geen verslag'}</span>
    </div>`;}).join('')}</div>
    ${inklappen ? `<button class="btn ghost sm kl-railknop" id="ct_alle">Toon alle <span class="num">${rij.length}</span></button>` : ''}`;

  /* Hele rij klikbaar → dossier; telefoon/mail-links blijven gewoon werken. */
  el.querySelectorAll('[data-ct]').forEach(r => r.onclick = () => contactDrawer(k, r.dataset.ct));
  el.querySelectorAll('.kl-ct a').forEach(a => a.onclick = e => e.stopPropagation());
  const alleBtn = el.querySelector('#ct_alle');
  if(alleBtn) alleBtn.onclick = () => { contactAlles = true; contactLijst(el, k); };
}

/* ─── Contactpersoon-dossier (drawer): gegevens + notities +
       gespreksverslagen + taak, alles per persoon ──────────────── */
function contactDrawer(k, ctId){
  const ct = (CRM.state.contacten||[]).find(x => String(x.id) === String(ctId));
  if(!ct) return;
  const acts = CRM.activiteitenVoor('contact', ct.id).slice()
    .sort((a,b) => new Date((b.extra&&b.extra.datum)||b.op) - new Date((a.extra&&a.extra.datum)||a.op));
  const items = acts.map(a => {
    const wanneer = (a.extra && a.extra.datum) || a.op;
    return {
      ico: (CRM.ACT_SOORTEN[a.soort]||{}).ico || '•',
      titel: (a.extra && a.extra.verslag ? 'Gespreksverslag' : (CRM.ACT_SOORTEN[a.soort]||{}).lbl || a.soort)
             + (a.door ? ' · ' + a.door : ''),
      wanneer: CRM.fmtDate(wanneer) + ' · ' + CRM.geleden(wanneer),
      tekst: a.tekst
    };
  });
  const links = [
    ct.telefoon ? `<a class="num" href="tel:${h(String(ct.telefoon).replace(/\s/g,''))}">${h(ct.telefoon)}</a>` : '',
    ct.email    ? `<a href="mailto:${h(ct.email)}">${h(ct.email)}</a>` : '',
    veiligeUrl(ct.linkedin) ? `<a href="${h(veiligeUrl(ct.linkedin))}" target="_blank" rel="noopener">LinkedIn</a>` : ''
  ].filter(Boolean).join('<span class="kl-sep">·</span>');

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="min-width:0;flex:1">
        <div class="row tight" style="gap:10px"><div class="h2" style="font-size:17px">${h(ct.naam)}</div>
          ${ct.hoofd?'<span class="chip green">Hoofdcontact</span>':''}</div>
        <div class="meta" style="margin-top:3px">${h([ct.functie, k.naam].filter(Boolean).join(' · '))}</div>
        ${links ? `<div class="kl-contact">${links}</div>` : '<div class="kl-contact meta">Nog geen contactgegevens</div>'}
      </div>
      <button class="btn ghost sm x" data-close>Sluiten</button>
    </div>
    <div class="drawer-b">
      <div class="row tight" style="margin-bottom:18px">
        <button class="btn ghost sm" id="cd_notitie">Notitie</button>
        <button class="btn ghost sm" id="cd_verslag">Gespreksverslag</button>
        <button class="btn sm" id="cd_taak">+ Taak</button>
        <span class="spacer"></span>
        <button class="btn sub sm" id="cd_bewerk">Bewerken</button>
      </div>
      ${ct.note ? `<div class="note info" style="margin-bottom:16px">${h(ct.note)}</div>` : ''}
      <div class="label" style="margin-bottom:10px">Notities & gespreksverslagen</div>
      ${CRM.ui.tijdlijn(items)}
    </div>`, {onOpen(dr){
      dr.querySelector('#cd_notitie').onclick = async () => {
        const tekst = await CRM.vraag('Notitie bij ' + ct.naam,
          {multiline:true, hint:'Tip: @collega stuurt diegene een melding.', knop:'Vastleggen'});
        if(!tekst) return;
        await CRM.logActiviteit('contact', String(ct.id), 'notitie', tekst);
        CRM.verwerkTags(tekst, 'contact', String(ct.id));
        CRM.toast('Vastgelegd','ok');
        contactLijstVerversen(k);
        contactDrawer(k, ct.id);
      };
      dr.querySelector('#cd_verslag').onclick = () => verslagModal(k, ct);
      dr.querySelector('#cd_taak').onclick = () => {
        CRM.taakModal({entiteit:'klant', ref:k.naam, refLabel:`${ct.naam} (${k.naam})`});
      };
      dr.querySelector('#cd_bewerk').onclick = () =>
        contactModal(k, ct, verwijderd => { if(verwijderd) CRM.drawer.close(); else contactDrawer(k, ct.id); });
    }});
}

/* Gespreksverslag: groter tekstvak + datum (standaard vandaag). */
function verslagModal(k, ct){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Gespreksverslag</div>
      <p class="sub" style="margin:6px 0 0">${h(ct.naam)} — ${h(k.naam)}</p></div>
    <div class="modal-b">
      <div class="f-row"><label>Datum van het gesprek</label>
        <input type="date" id="vg_datum" value="${h(CRM.todayISO())}" style="max-width:180px"></div>
      <div class="f-row"><label>Verslag</label>
        <textarea id="vg_tekst" style="min-height:180px" placeholder="Wat is er besproken, welke afspraken zijn gemaakt, wat is de volgende stap…&#10;&#10;Tip: @collega stuurt diegene een melding."></textarea></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="vg_ok">Verslag opslaan</button></div>`, {onOpen(m){
    setTimeout(()=>m.querySelector('#vg_tekst').focus(), 60);
    m.querySelector('#vg_ok').onclick = async () => {
      const tekst = m.querySelector('#vg_tekst').value.trim();
      if(!tekst) return CRM.toast('Schrijf eerst het verslag','err');
      const datum = m.querySelector('#vg_datum').value || CRM.todayISO();
      CRM.modal.close();
      await CRM.logActiviteit('contact', String(ct.id), 'gesprek', tekst, {verslag:true, datum});
      CRM.verwerkTags(tekst, 'contact', String(ct.id));
      CRM.toast('Gespreksverslag vastgelegd','ok');
      contactLijstVerversen(k);
      contactDrawer(k, ct.id);
    };
  }});
}

function contactModal(k, ct, na){
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
      <div class="f-row"><label>LinkedIn</label><input type="url" id="c_li" value="${h(n.linkedin||'')}" placeholder="https://linkedin.com/in/…"></div>
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
          linkedin:m.querySelector('#c_li').value.trim(),
          note:m.querySelector('#c_note').value.trim(), hoofd:m.querySelector('#c_hoofd').checked
        });
        if(!rij.naam) return CRM.toast('Vul een naam in','err');
        CRM.modal.close();
        /* Hooguit één hoofdcontact per klant. */
        if(rij.hoofd) for(const x of CRM.state.contacten.filter(x => x.klant === k.naam && x.hoofd && String(x.id)!==String(rij.id)))
          await bewaarRij('crm_contacten','contacten', Object.assign({}, x, {hoofd:false}), true);
        await bewaarRij('crm_contacten','contacten', rij, !!ct);
        CRM.render();
        if(na) na(false);
      };
      const weg = m.querySelector('#c_weg');
      if(weg) weg.onclick = async () => {
        if(!await CRM.bevestig('Contactpersoon verwijderen?', n.naam)) return;
        CRM.modal.close(); await verwijderRij('crm_contacten','contacten', n.id); CRM.render();
        if(na) na(true);
      };
    }});
}

/* ─── Signalen — alleen tonen wat echt speelt ─────────────────── */
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

/* ─── Tabs: vijf, geen dubbelingen ────────────────────────────── */
function tabsHtml(k, c){
  const acts  = CRM.activiteitenVoor('klant', k.naam);
  const docs  = (CRM.state.documenten||[]).filter(x => x.entiteit === 'klant' && x.ref === k.naam);
  const evals = acts.filter(a => a.extra && a.extra.evaluatie);
  return [
    ['vacatures','Vacatures', c.vs.length],
    ['kandidaten','Kandidaten', c.cs.length],
    ['activiteiten','Activiteiten & notities', 0],
    ['evaluaties','Evaluaties', evals.length],
    ['documenten','Documenten', docs.length]
  ].map(([kk,lbl,n]) => `<button class="tab${tabActief===kk?' on':''}" data-t="${kk}">${h(lbl)}${n?`<span class="cnt num">${n}</span>`:''}</button>`).join('');
}

function tabInhoud(mount, k){
  const el = mount.querySelector('#k_tabinhoud');
  const c  = cijfers(k.naam);
  const fn = {
    vacatures:    () => tabVacatures(el, k, c),
    kandidaten:   () => tabKandidaten(el, k, c),
    activiteiten: () => tabActiviteiten(el, k),
    evaluaties:   () => tabEvaluaties(el, k),
    documenten:   () => tabDocumenten(el, k)
  }[tabActief];
  if(fn) fn(); else el.innerHTML = '';
}

/* ─── Tab: vacatures ──────────────────────────────────────────── */
function tabVacatures(el, k, c){
  const alle = c.vs.slice().sort((a,b) =>
    String(a.status||'Open').localeCompare(String(b.status||'Open')) ||
    String(a.functie).localeCompare(String(b.functie),'nl'));
  el.innerHTML = `
    <div class="kl-tabkop"><div class="h2">Vacatures</div>
      <span class="meta num">${alle.length} totaal · ${c.open.length} open</span>
      <span class="spacer"></span>
      <button class="btn sm" id="v_nieuw">Vacature toevoegen</button></div>
    ${alle.length ? alle.map(v => vacatureHtml(v, k)).join('') :
      CRM.ui.leeg('Nog geen vacatures','Voeg de eerste opdracht van deze klant toe.')}`;

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
    <div class="kl-kand-wie"><b class="trunc">${h(c.naam)}</b>
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
  el.innerHTML = `
    <div class="kl-tabkop"><div class="h2">Kandidaten</div>
      <span class="meta num">${c.cs.length} totaal · ${c.lopend.length} lopend</span>
      <span class="spacer"></span>
      <div class="seg" id="k_grp">
        <button data-g="fase" class="${groepeer==='fase'?'on':''}">Per fase</button>
        <button data-g="vacature" class="${groepeer==='vacature'?'on':''}">Per vacature</button>
      </div></div>
    ${Object.keys(groepen).length ? Object.keys(groepen).map(g => `
        <div class="kl-groep"><div class="label">${h(g)} <span class="num">${groepen[g].length}</span></div>
          <div class="kl-kandlijst">${groepen[g].map(x=>kandRegel(x)).join('')}</div></div>`).join('')
      : CRM.ui.leeg('Nog geen kandidaten','Zodra je iemand voorstelt bij deze klant verschijnt hij hier.')}`;

  el.querySelectorAll('#k_grp button').forEach(b => b.onclick = () => {
    groepeer = b.dataset.g; P.set('groepeer', groepeer); tabKandidaten(el, k, c);
  });
  el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => { e.preventDefault(); CRM.ga('kandidaten',{id:a.dataset.kand}); });
}

/* ─── Tab: activiteiten & notities ────────────────────────────────
   Taken staan hier bewust NIET meer — de zijrail is dé takenplek.
   Afgeronde taken die als activiteit gelogd zijn verschijnen wel
   gewoon in de tijdlijn. ─────────────────────────────────────── */
function tabActiviteiten(el, k){
  /* Klant-activiteiten + de notities/gespreksverslagen van al haar
     contactpersonen, gemengd op datum — zo blijft het klantbeeld compleet. */
  const conts = (CRM.state.contacten||[]).filter(x => x.klant === k.naam);
  const alle = CRM.activiteitenVoor('klant', k.naam).map(a => ({a, ct:null}))
    .concat(conts.flatMap(ct => CRM.activiteitenVoor('contact', ct.id).map(a => ({a, ct}))))
    .sort((x,y) => new Date(y.a.op) - new Date(x.a.op));
  const items = alle.map(({a, ct}) => {
    const wanneer = (a.extra && a.extra.datum) || a.op;
    return {
      ico: (CRM.ACT_SOORTEN[a.soort]||{}).ico || '•',
      titel: (a.extra && a.extra.verslag ? 'Gespreksverslag' : (CRM.ACT_SOORTEN[a.soort]||{}).lbl || a.soort)
             + (ct ? ' met ' + ct.naam : '') + (a.door ? ' · ' + a.door : ''),
      wanneer: CRM.fmtDate(wanneer) + ' · ' + CRM.geleden(wanneer),
      tekst: (a.extra && a.extra.evaluatie) ? evalSamenvatting(a.extra.evaluatie) : a.tekst
    };
  });
  el.innerHTML = `<div class="stack">
    <div class="card">
      <div class="card-h"><div class="h2">Activiteiten & notities</div><span class="spacer"></span>
        <div class="row tight">${['bel','mail','whatsapp','gesprek','bezoek','notitie'].map(s =>
          `<button class="btn ghost sm" data-log="${s}">${h((CRM.ACT_SOORTEN[s]||{}).lbl||s)}</button>`).join('')}</div>
      </div>
      <div class="card-b">${CRM.ui.tijdlijn(items)}</div>
    </div>
    <div class="card">
      <div class="card-h"><div class="h2">Accountnotitie</div></div>
      <div class="card-b">
        <div class="f-row" style="margin-bottom:10px"><textarea id="n_note" placeholder="Vaste afspraken, tarieven, voorkeuren, wie beslist…">${h(k.note||'')}</textarea></div>
        <button class="btn ghost sm" id="n_bewaar">Opslaan</button>
      </div>
    </div>
  </div>`;

  el.querySelectorAll('[data-log]').forEach(b => b.onclick = () => logVia(k, b.dataset.log, 'Wat leg je vast? Tip: @collega stuurt diegene een melding.'));
  el.querySelector('#n_bewaar').onclick = () => bewaarKlant(k.naam, {note: el.querySelector('#n_note').value.trim()});
}

/* Activiteit of notitie vastleggen. @collega in de tekst geeft die
   collega automatisch een melding (CRM.verwerkTags). */
async function logVia(k, soort, hint){
  const tekst = await CRM.vraag((CRM.ACT_SOORTEN[soort]||{}).lbl || 'Activiteit',
    {multiline:true, hint, knop:'Vastleggen'});
  if(!tekst) return;
  await CRM.logActiviteit('klant', k.naam, soort, tekst);
  CRM.verwerkTags(tekst, 'klant', k.naam);
  if(soort !== 'notitie') await bewaarKlant(k.naam, {laatst_contact: CRM.todayISO()});
  else CRM.toast('Vastgelegd','ok');
  CRM.render();
}

/* Taak aanmaken — ALTIJD via het gedeelde taakvenster (collega-toewijzing,
   prioriteit, Outlook en meldingen zitten daar al in). De nieuwe taak
   verschijnt direct in de zijrail. */
function nieuweTaak(k){
  CRM.taakModal({entiteit:'klant', ref:k.naam, refLabel:k.naam}).then(rij => {
    if(rij){ CRM.navBadges(); CRM.render(); }
  });
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

  el.innerHTML = `
    <div class="kl-tabkop"><div class="h2">Evaluaties</div>
      ${totaal!=null?`<span class="chip${totaal>=4?' green':totaal>=3?'':' amber'}">Gemiddeld <span class="num">${totaal.toFixed(1)}</span> / 5</span>`:''}
      <span class="spacer"></span>
      <button class="btn sm" id="ev_nieuw">Evaluatie invullen</button></div>
    ${evals.length ? `
      <div class="card kl-evverloop"><div class="card-b">
        <div class="label">Verloop gemiddelde</div>
        <div class="kl-evrij">${evals.slice().reverse().map(e => {
          const g = gem(e) || 0;
          return `<div class="kl-evtick">
            ${CRM.ui.bar(g/5*100, g>=4?'green':g>=3?'':'amber')}
            <span class="num">${g?g.toFixed(1):'—'}</span>
            <span class="meta num">${h(CRM.fmtDateShort(e.datum))}</span></div>`;
        }).join('')}</div>
      </div></div>
      ${evals.map(e => evalHtml(e)).join('')}`
      : CRM.ui.leeg('Nog geen evaluatie','Beoordeel periodiek hoe de samenwerking loopt — dat maakt het gesprek met deze klant concreet.')}`;
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
  el.innerHTML = `
    <div class="kl-tabkop"><div class="h2">Documenten</div><span class="spacer"></span>
      <button class="btn sm" id="d_nieuw">Document koppelen</button></div>
    ${docs.length ? `<div class="tblwrap"><table class="tbl"><thead><tr>
        <th>Document</th><th>Soort</th><th>Toegevoegd</th><th>Door</th><th></th></tr></thead><tbody>
        ${docs.map(d => `<tr>
          <td>${veiligeUrl(d.url) ? `<a href="${h(veiligeUrl(d.url))}" target="_blank" rel="noopener">${h(d.naam)}</a>` : h(d.naam)}</td>
          <td class="sub">${h(d.soort||'—')}</td>
          <td class="sub num">${h(CRM.fmtDate(d.op))}</td>
          <td class="sub">${h(d.door||'—')}</td>
          <td class="n"><button class="btn sub sm" data-dweg="${h(d.id)}">Verwijderen</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : CRM.ui.leeg('Nog geen documenten','Koppel de SWO, offerte of andere afspraken zodat iedereen ze terugvindt.')}`;

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
        <div class="f-row"><label>Team</label><input type="text" id="g_team" value="${h(k.team||'')}" placeholder="Bijv. Tjeerd of Tjerk"></div>
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
      /* Team los opslaan: de kolom kan ontbreken zolang de aanvulling-SQL
         niet gedraaid is — dan mag de rest van de wijziging niet sneuvelen. */
      const team = m.querySelector('#g_team').value.trim();
      CRM.modal.close();
      await bewaarKlant(k.naam, w);
      if(team !== (k.team||'')) await bewaarTeam(k, team);
      CRM.render();
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
      /* In productie is vacatures.id een uuid met database-default — geen
         eigen id meesturen bij nieuw; in demo wél (geen database). */
      if(!rij.id && CRM.demo) rij.id = k.naam + '::' + functie;
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
  title:'Relaties', icon:'▣', onderschrift:'Van lead tot klant — relatiekaarten en accountbeheer',
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
