/* ═══════════════════════════════════════════════════════════════
   MODULE: RECRUITMENT — INSTROOM EN UITVAL
   Twee tabbladen:
     A. Inkomende sollicitanten — instroom uit Meta, Indeed, WhatsApp
        of handmatig (tabel crm_leads; heette in de UI eerst "Leads")
     B. Uitval — afgevallen/gestopt, heraanbieden en vervanging
   Het pijplijnbord is een eigen module geworden (js/pijplijn.js) en
   begint sinds 30 jul 2026 bij de fase Intake: de werkvoorraad waar de
   videocall gepland wordt. Het losse tabblad daarvoor is vervallen —
   de videocall-lijst is gewoon de eerste kolom op het bord.
   De gedeelde bewerk-drawer en fasewissel-poortwachters leven hier
   en zijn beschikbaar als CRM.kandidaatBewerk / CRM.kandidaatFase;
   overige gedeelde bord-logica via CRM._rcDeel (onderaan).
   Doel blijft: geen vervuiling. Een sollicitant komt ALTIJD binnen
   op status 'Nieuw' en gaat pas de pijplijn in als hij compleet is.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Modulestatus (blijft bewaard tussen renders) ─────────────── */
const S = {
  tab:'leads',
  l:{q:'', status:'', bron:'', vac:'', mijn:false},
  u:{f:'alles'}
};

const GESPREK_FASES = ['O&O sessie','Eerste gesprek','Tweede gesprek','Meeloopdag'];
const CONTRACT_FASES = ['Contract ondertekenen','Contract getekend','Gestart'];
const UITVAL = ['Afgevallen','Gestopt'];
const KAND_BRONNEN = ['Indeed','LinkedIn','Meta','WhatsApp','Website','Referral','Eigen werving','Anders'];
const AFVAL_LBL = {niet_gekwalificeerd:'Niet gekwalificeerd', offer_afgewezen:'Offer afgewezen'};
const STOP_LBL  = {kandidaat:'door kandidaat', klant:'door klant', anders:'anders'};

/* ─── Kleine helpers ──────────────────────────────────────────── */
const leads    = () => CRM.state.leads || [];
const leadById = id => leads().find(l => String(l.id) === String(id));
const vacById  = id => (CRM.state.vacs||[]).find(v => String(v.id) === String(id));
const vacLabel = v => v ? (v.functie + ' · ' + v.klant) : '';
const norm     = s => String(s||'').toLowerCase();
const telNorm  = t => String(t||'').replace(/\D/g,'').replace(/^0031/,'').replace(/^31/,'').replace(/^0/,'');
const waLink   = t => { const n = telNorm(t); return n ? 'https://wa.me/31'+n : ''; };
const uurGeleden = iso => {
  if(!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if(isNaN(ms)) return '';
  if(ms < 3600000) return Math.max(1,Math.round(ms/60000)) + ' min';
  if(ms < 86400000) return Math.round(ms/3600000) + ' uur';
  return CRM.geleden(iso);
};
/* Alleen kleuren uit :root — geen losse hexcodes in een module. */
const prioKleur = p => ({Hoog:'var(--red)', Midden:'var(--amber)', Laag:'var(--muted)'})[p] || 'var(--line-2)';

/* Toast met doorklik-link (de core-toast kan alleen tekst). */
function toastLink(tekst, label, fn){
  CRM.toast(tekst,'ok');
  const t = document.getElementById('toast');
  if(!t) return;
  const a = document.createElement('a');
  a.textContent = label; a.href = '#'; a.style.marginLeft = '10px'; a.style.fontWeight = '600';
  a.onclick = e => { e.preventDefault(); fn(); };
  t.appendChild(a);
}

/* Belpogingen leiden we af uit de activiteiten — geen extra kolom nodig. */
function belPogingen(leadId){
  return CRM.activiteitenVoor('lead', leadId).filter(a => a.soort === 'bel').length;
}

/* ─── Opslaan ─────────────────────────────────────────────────── */
async function bewaarLead(lead, patch){
  Object.assign(lead, patch);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_leads').update(patch).eq('id', lead.id);
    if(error){ CRM.fout('Opslaan mislukt', error); return false; }
  }
  return true;
}
async function bewaarKand(id, patch){            // patch in DB-kolomnamen
  const rij = CRM.state.cands.find(r => String(r.id) === String(id));
  if(!rij) return false;
  Object.assign(rij, patch);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update(patch).eq('id', id);
    if(error){ CRM.fout('Opslaan mislukt', error); return false; }
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   MODULE-REGISTRATIE
   ═══════════════════════════════════════════════════════════════ */
CRM.registerModule('recruitment', {
  title:'Recruitment', icon:'◉', onderschrift:'Instroom en uitval',
  volleBreedte:true,
  badge(){ return leads().filter(l => l.status === 'Nieuw').length; },
  render(mount, acties, params){
    if(!['leads','uitval'].includes(S.tab)) S.tab = 'leads';
    mount.innerHTML = `
      <div class="rc">
        <div class="rc-bar" id="rc_bar"></div>
        <div class="rc-strook" id="rc_strook"></div>
        <div class="rc-tabwrap"><div class="tabs" id="rc_tabs"></div></div>
        <div id="rc_body"></div>
      </div>`;
    tekenBar();
    tekenTabs();
    tekenBody();
    tekenActies(acties);
    if(params && params.id && leadById(params.id)){ S.tab = 'leads'; openLead(params.id); }
  }
});

function tekenActies(acties){
  const el = acties || document.getElementById('pageacties');
  if(!el) return;
  if(S.tab === 'leads'){
    el.innerHTML = `<button class="btn ghost sm" id="rc_import">⬇ Importeren</button>
                    <button class="btn sm" id="rc_nieuw">+ Sollicitant</button>`;
    el.querySelector('#rc_import').onclick = importModal;
    el.querySelector('#rc_nieuw').onclick  = nieuweSollicitantKeuze;
  } else {
    el.innerHTML = `<span class="meta">Uitval leeft buiten het bord — sleep op de Pijplijn een kaart naar de uitvalstrook</span>`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   DAGELIJKSE CIJFERS
   ═══════════════════════════════════════════════════════════════ */
function weekGrens(){
  const nu = new Date(), dag = (nu.getDay() + 6) % 7;             // maandag = 0
  const ma = new Date(nu); ma.setDate(nu.getDate() - dag); ma.setHours(0,0,0,0);
  const zo = new Date(ma); zo.setDate(ma.getDate() + 7);
  return [ma, zo];
}
function cijfers(){
  const vandaag = CRM.todayISO();
  const L = leads(), K = CRM.kandidaten();
  const [ma, zo] = weekGrens();
  const inWeek = iso => { if(!iso) return false; const d = new Date(iso); return !isNaN(d) && d >= ma && d < zo; };

  const nieuw = L.filter(l => String(l.binnen_op||'').slice(0,10) === vandaag).length;
  const stil  = L.filter(l => CRM.LEAD_OPEN.includes(l.status) &&
                  (CRM.dagenGeleden(l.laatst_actie || l.binnen_op) || 0) > 2).length;
  const intakes = L.filter(l => l.status === 'Intake gepland' && inWeek(l.opvolgen_op)).length
                + K.filter(c => CRM.faseIs(c.fase, 'Intake') && inWeek(c.datum)).length;
  /* c.fase truthy: golden candidates zonder fase tellen niet als pijplijn. */
  const pijplijn = K.filter(c => c.fase && !CRM.DONE.includes(c.fase)).length;
  const startsWeek = K.filter(c => CRM.PLACED.includes(c.fase) && c.start && inWeek(c.start));
  const vroeg = K.filter(c => ['Voorgesteld','O&O sessie','Eerste gesprek'].includes(c.fase)).length;
  const pm = CRM.plaatsingenMaand(), target = CRM.maandTarget();
  return {nieuw, stil, intakes, pijplijn, netto:pm.netto, target, pm, startsWeek, vroeg};
}
function tekenBar(){
  const el = document.getElementById('rc_bar'); if(!el) return;
  const c = cijfers();
  const it = (lbl, waarde, extra='', klasse='') =>
    `<div class="rc-it ${klasse}"><div class="label">${h(lbl)}</div>
       <div class="rc-v num">${waarde}</div>${extra?`<div class="meta">${extra}</div>`:''}</div>`;
  el.innerHTML =
    it('Nieuw vandaag', c.nieuw, 'binnengekomen sollicitanten') +
    it('Zonder opvolging', c.stil, 'langer dan 2 dagen', c.stil ? 'amber' : '') +
    it('Intakes deze week', c.intakes, 'gepland') +
    it('In de pijplijn', c.pijplijn, 'lopende kandidaten') +
    it('Netto deze maand', `${CRM.plusMin(c.netto)}<span class="rc-van">/ ${c.target}</span>`,
       `${c.pm.getekend.length} getekend${c.pm.gestopt.length ? ' · ' + CRM.plusMin(-c.pm.gestopt.length) + ' gestopt' : ''}`,
       c.netto >= c.target ? 'goed' : '');
  tekenStrook(c);
}

/* Signaalstrook onder de cijfers — bewust compact gehouden (wens Tjeerd):
   alleen wat vandaag actie vraagt. De maandlijsten (getekend/gestopt) en het
   nazorg-overzicht staan in Performance; nazorg-acties in Mijn dag. */
function tekenStrook(c){
  const el = document.getElementById('rc_strook'); if(!el) return;
  c = c || cijfers();
  const naamchip = (k, extra, klasse='') =>
    `<button class="rc-naamchip ${klasse}" data-open="${h(k.id)}">${h(k.naam)}<em>${h(extra)}</em></button>`;
  const rijen = [];
  if(c.startsWeek.length) rijen.push(`<div class="rc-strookrij"><span class="label">Deze week starten</span>${
    c.startsWeek.slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''))
      .map(k=>naamchip(k, `${CRM.fmtDay(k.start)}${k.klant?' · '+k.klant:''}`)).join('')}</div>`);
  if(c.vroeg < 3) rijen.push(`<div class="rc-strookrij"><span class="chip amber">Instroom laag: ${c.vroeg} kandidaat${c.vroeg===1?'':'en'} in Voorgesteld/O&amp;O/Eerste gesprek — over ± 6 weken droogte</span></div>`);
  el.innerHTML = rijen.join('');
  el.style.display = rijen.length ? '' : 'none';
  /* Naar de volledige kandidatenkaart — niet meer het smalle bewerkpaneel. */
  CRM.$$('[data-open]', el).forEach(b => b.onclick = () => CRM.ga('kandidaten',{id:b.dataset.open}));
}


/* ═══════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════ */
function tekenTabs(){
  const el = document.getElementById('rc_tabs'); if(!el) return;
  const K = CRM.kandidaten();
  const open = leads().filter(l => CRM.LEAD_OPEN.includes(l.status)).length;
  const uit  = K.filter(c => UITVAL.includes(c.fase)).length;
  el.innerHTML = `
    <button class="tab ${S.tab==='leads'?'on':''}" data-t="leads">Inkomende sollicitanten <span class="cnt num">${open}</span></button>
    <button class="tab ${S.tab==='uitval'?'on':''}" data-t="uitval">Uitval <span class="cnt num">${uit}</span></button>`;
  CRM.$$('[data-t]', el).forEach(b => b.onclick = () => {
    S.tab = b.dataset.t; tekenTabs(); tekenBody(); tekenActies();
  });
}
function tekenBody(){
  const el = document.getElementById('rc_body');
  if(!el){
    /* Vanuit gedeelde flows (fasewissel, intake, no-show, uitval) aangeroepen
       terwijl een ánder scherm openstaat. De Pijplijn haakt in met een
       gerichte hertekening; de kandidatenkaart tekent zichzelf opnieuw,
       zodat fase, chips en trajectvelden meteen kloppen. */
    if(CRM.view === 'pijplijn' && typeof CRM._pijplijnVernieuw === 'function') CRM._pijplijnVernieuw();
    else if(CRM.view === 'kandidaten') CRM.render();
    return;
  }
  if(S.tab === 'leads') tekenLeads(el);
  else tekenUitval(el);
}

/* ═══════════════════════════════════════════════════════════════
   TAB A — INKOMENDE SOLLICITANTEN (crm_leads)
   ═══════════════════════════════════════════════════════════════ */
function leadsGefilterd(negeerStatus){
  const f = S.l, q = norm(f.q);
  return leads().filter(l => {
    if(!negeerStatus && f.status && l.status !== f.status) return false;
    if(f.bron && l.bron !== f.bron) return false;
    if(f.vac && String(l.vacature_id) !== f.vac) return false;
    if(f.mijn && l.eigenaar !== CRM.me()) return false;
    if(q){
      const hooi = [l.naam, l.telefoon, l.email, l.woonplaats, l.klant, l.functie, l.kwalificatie].map(norm).join(' ');
      if(!hooi.includes(q) && (!telNorm(q) || telNorm(l.telefoon).indexOf(telNorm(q)) !== 0)) return false;
    }
    return true;
  }).sort((a,b) => String(b.binnen_op||'').localeCompare(String(a.binnen_op||'')));
}

function tekenLeads(el){
  const bronnen = Array.from(new Set(leads().map(l => l.bron).filter(Boolean))).sort();
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b) => vacLabel(a).localeCompare(vacLabel(b)));
  el.innerHTML = `
    <div class="rc-pad">
      <div class="rc-fil">
        <div class="searchbox" style="flex:1;max-width:280px">
          <input type="search" id="rc_q" placeholder="Zoek op naam, telefoon of plaats" value="${h(S.l.q)}">
        </div>
        <select id="rc_bron" style="width:auto;min-width:130px">
          <option value="">Alle bronnen</option>
          ${bronnen.map(b=>`<option value="${h(b)}" ${S.l.bron===b?'selected':''}>${h(b)}</option>`).join('')}
        </select>
        <select id="rc_vac" style="width:auto;min-width:200px">
          <option value="">Alle vacatures</option>
          ${vacs.map(v=>`<option value="${h(v.id)}" ${S.l.vac===String(v.id)?'selected':''}>${h(vacLabel(v))}</option>`).join('')}
        </select>
        <label class="check"><input type="checkbox" id="rc_mijn" ${S.l.mijn?'checked':''}> Mijn sollicitanten</label>
        <div class="spacer"></div>
        <span class="meta" id="rc_telling"></span>
      </div>
      <div class="rc-chips" id="rc_stchips"></div>
      <div id="rc_lijst"></div>
    </div>`;

  const q = el.querySelector('#rc_q');
  q.oninput = CRM.debounce(() => { S.l.q = q.value; tekenLijst(); }, 200);
  el.querySelector('#rc_bron').onchange = e => { S.l.bron = e.target.value; tekenLijst(); };
  el.querySelector('#rc_vac').onchange  = e => { S.l.vac  = e.target.value; tekenLijst(); };
  el.querySelector('#rc_mijn').onchange = e => { S.l.mijn = e.target.checked; tekenLijst(); };
  tekenLijst();
}

function tekenStatusChips(){
  const el = document.getElementById('rc_stchips'); if(!el) return;
  const basis = leadsGefilterd(true);
  const tel = s => basis.filter(l => l.status === s).length;
  el.innerHTML =
    `<button class="chip btn-like ${S.l.status===''?'on':''}" data-s="">Alle <b class="num">${basis.length}</b></button>` +
    CRM.LEAD_STATUS.map(s => `
      <button class="chip btn-like ${S.l.status===s.k?'on':''}" data-s="${h(s.k)}">
        <i class="dot" style="background:${s.c}"></i>${h(s.k)} <b class="num">${tel(s.k)}</b>
      </button>`).join('');
  CRM.$$('[data-s]', el).forEach(b => b.onclick = () => { S.l.status = b.dataset.s; tekenLijst(); });
}

function tekenLijst(){
  tekenStatusChips();
  const wrap = document.getElementById('rc_lijst'); if(!wrap) return;
  const rijen = leadsGefilterd();
  const telling = document.getElementById('rc_telling');
  if(telling) telling.textContent = rijen.length + ' van ' + leads().length + ' sollicitanten';

  if(!rijen.length){
    /* Onderscheid maken tussen "nog niets binnengekomen" en "je filters
       verbergen alles" — anders stuurt de lege staat je naar filters die
       je helemaal niet hebt aanstaan. */
    wrap.innerHTML = leads().length
      ? CRM.ui.leeg('Geen sollicitanten met deze filters',
          'Er staan er wel ' + leads().length + ' in het systeem. Verruim je zoekterm, bron, vacature of status.')
      : CRM.ui.leeg('Nog geen sollicitanten binnen',
          'Zodra er iemand reageert via Meta, Indeed of het formulier komt hij hier binnen. Je kunt er ook zelf een toevoegen met + Sollicitant, of een lijst importeren.');
    return;
  }
  const toon = rijen.slice(0,200);
  wrap.innerHTML = `
    <div class="tblwrap">
      <table class="tbl rc-tbl">
        <thead><tr>
          <th style="width:24px"></th><th>Sollicitant</th><th>Contact</th><th>Bron</th>
          <th>Reageerde op</th><th>Agent</th><th style="width:206px">Status</th><th>Eigenaar</th><th class="n">Binnen</th>
        </tr></thead>
        <tbody>${toon.map(rijHtml).join('')}</tbody>
      </table>
    </div>
    ${rijen.length > 200 ? `<p class="meta" style="margin:10px 2px">Eerste 200 van ${rijen.length} getoond — verfijn je filter.</p>` : ''}`;

  CRM.$$('tr.clickable', wrap).forEach(tr => tr.onclick = () => openLead(tr.dataset.id));
  CRM.$$('select.rc-stsel', wrap).forEach(sel => {
    sel.onclick = e => e.stopPropagation();
    sel.onchange = e => { e.stopPropagation(); zetStatus(leadById(sel.dataset.id), sel.value); };
  });
  CRM.$$('a.rc-tel', wrap).forEach(a => a.onclick = e => e.stopPropagation());
}

function rijHtml(l){
  const v = vacById(l.vacature_id);
  const bel = belPogingen(l.id);
  const wa = waLink(l.telefoon);
  const stil = CRM.LEAD_OPEN.includes(l.status) && (CRM.dagenGeleden(l.laatst_actie || l.binnen_op) || 0) > 2;
  return `<tr class="clickable" data-id="${h(l.id)}">
    <td><span class="rc-prio" title="Prioriteit ${h(l.prioriteit||'onbekend')}" style="background:${prioKleur(l.prioriteit)}"></span></td>
    <td>
      <div class="rc-naam">${h(l.naam)}</div>
      <div class="rowsub">${h(l.woonplaats||'—')}${l.cv?' · cv':''}</div>
    </td>
    <td>
      ${l.telefoon ? `<a class="rc-tel num" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">${h(l.telefoon)}</a>
        ${wa?`<a class="rc-tel rc-wa" href="${h(wa)}" target="_blank" rel="noopener" title="WhatsApp">wa</a>`:''}` : '<span class="meta">—</span>'}
      ${bel ? `<div class="rowsub">${bel}× gebeld</div>` : ''}
    </td>
    <td><span class="chip">${h(l.bron||'—')}</span>${l.campagne?`<div class="rowsub trunc" style="max-width:118px">${h(l.campagne)}</div>`:''}</td>
    <td>${v ? `<div>${h(v.functie)}</div><div class="rowsub">${h(v.klant)}</div>`
             : (l.functie ? `<div>${h(l.functie)}</div><div class="rowsub">${h(l.klant||'—')}</div>`
                          : '<span class="meta">niet gekoppeld</span>')}</td>
    <td>
      ${l.score != null ? `<span class="chip ${l.score>=70?'green':l.score>=45?'amber':''} num">${h(l.score)}</span>` : ''}
      <div class="rowsub trunc" style="max-width:150px">${h(l.kwalificatie||'')}</div>
    </td>
    <td>
      <div class="rc-stwrap" style="--sc:${CRM.leadKleur(l.status)}">
        <select class="rc-stsel" data-id="${h(l.id)}">
          ${CRM.LEAD_STATUS.map(s=>`<option value="${h(s.k)}" ${l.status===s.k?'selected':''}>${h(s.k)}</option>`).join('')}
        </select>
      </div>
    </td>
    <td>${l.eigenaar ? `<span class="chip">${h(l.eigenaar)}</span>` : '<span class="meta">—</span>'}</td>
    <td class="n"><span class="num ${stil?'rc-stil':''}">${h(uurGeleden(l.binnen_op))}</span></td>
  </tr>`;
}

/* ─── Status snel wijzigen ────────────────────────────────────── */
async function zetStatus(lead, nieuw){
  if(!lead || lead.status === nieuw) return;
  const oud = lead.status;
  const geenGehoor = nieuw === 'Gebeld — geen gehoor';
  const poging = belPogingen(lead.id) + 1;
  const ok = await bewaarLead(lead, {status:nieuw, laatst_actie:new Date().toISOString()});
  if(!ok) return;
  await CRM.logActiviteit('lead', lead.id, geenGehoor ? 'bel' : 'systeem',
    geenGehoor ? `Gebeld, geen gehoor (poging ${poging})` : `Status: ${oud} → ${nieuw}`);
  CRM.toast(geenGehoor ? `Belpoging ${poging} genoteerd` : 'Status bijgewerkt', 'ok');
  tekenBar(); tekenTabs(); tekenLijst(); CRM.navBadges();
  if(nieuw === 'Intake gepland') return intakePlannen(lead);
  if(document.getElementById('drawer')?.classList.contains('on')) openLead(lead.id);
}

/* Bij "Intake gepland": datum/tijd vastleggen en desgewenst meteen in de
   eigen agenda zetten (Outlook of vooringevulde deeplink). */
function intakePlannen(l){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Intake plannen</div>
      <p class="sub" style="margin:6px 0 0">${h(l.naam)}</p></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="ip_datum" value="${h(l.opvolgen_op||CRM.todayISO())}"></div>
        <div class="f-row"><label>Tijd</label><input type="time" id="ip_tijd" value="10:00"></div>
      </div>
      <label class="check"><input type="checkbox" id="ip_agenda" checked> Zet ook in mijn agenda</label>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Overslaan</button>
      <button class="btn" id="ip_ok">Vastleggen</button></div>`, {onOpen(m){
    m.querySelector('#ip_ok').onclick = async () => {
      const datum = m.querySelector('#ip_datum').value, tijd = m.querySelector('#ip_tijd').value || '10:00';
      if(!datum) return CRM.toast('Kies een datum','err');
      const agenda = m.querySelector('#ip_agenda').checked;
      CRM.modal.close();
      await bewaarLead(l, {opvolgen_op:datum});
      await CRM.logActiviteit('lead', l.id, 'systeem', `Intake gepland op ${CRM.fmtDate(datum)} ${tijd}`);
      if(agenda){
        try{
          const r = await CRM.outlook.maakAfspraak({
            titel:`Videointake — ${l.naam}`, datum, tijd, duurMin:30, teams:true,
            deelnemers:[l.email].filter(Boolean),
            body:`Video-intake${l.functie?' voor '+l.functie:''}${l.klant?' bij '+l.klant:''}.`
          });
          if(r.via==='deeplink') CRM.toast('Outlook geopend — klik daar op Opslaan','ok');
          else CRM.toast('In je agenda gezet','ok');
        }catch(e){ CRM.fout('Agenda-afspraak mislukt', e); }
      }
      tekenBar(); tekenLijst();
      if(document.getElementById('drawer')?.classList.contains('on')) openLead(l.id);
    };
  }});
}
/* ─── Leaddetail ──────────────────────────────────────────────── */
function qaHtml(antwoorden){
  if(!antwoorden || typeof antwoorden !== 'object') return '';
  const paren = Array.isArray(antwoorden)
    ? antwoorden.map(a => [a.vraag || a.q || 'Vraag', a.antwoord || a.a || ''])
    : Object.entries(antwoorden);
  if(!paren.length) return '';
  return `<table class="rc-qa">${paren.map(([k,v]) => `
    <tr><th>${h(String(k).replace(/_/g,' '))}</th>
        <td>${h(v && typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}</table>`;
}
function cvHtml(cv){
  if(!cv) return `<p class="meta" style="margin:0">Nog geen cv gekoppeld.</p>`;
  const lijst = (t, arr) => (arr && arr.length)
    ? `<div class="rc-kv"><span class="label">${h(t)}</span><div class="row tight">${arr.map(x=>`<span class="chip">${h(x)}</span>`).join('')}</div></div>` : '';
  return `
    ${cv.functie ? `<div class="rc-kv"><span class="label">Functie</span><span>${h(cv.functie)}</span></div>` : ''}
    ${cv.ervaringJaren ? `<div class="rc-kv"><span class="label">Ervaring</span><span class="num">${h(cv.ervaringJaren)} jaar</span></div>` : ''}
    ${lijst('Talen', cv.talen)}
    ${lijst('Certificaten', cv.certificaten || cv.skills)}
    ${(cv.werk && cv.werk.length) ? `<div class="rc-kv"><span class="label">Werkverleden</span>
        <div>${cv.werk.map(w=>`<div class="sub">${h(w)}</div>`).join('')}</div></div>` : ''}
    ${cv.op ? `<div class="meta" style="margin-top:8px">Ingelezen ${h(CRM.fmtDate(cv.op))}${cv.door?' door '+h(cv.door):''}</div>` : ''}`;
}

function openLead(id){
  const l = leadById(id); if(!l) return;
  const v = vacById(l.vacature_id);
  const notities = Array.isArray(l.notities) ? l.notities : [];
  const doorgeschoten = l.status === 'Doorgeschoten' && l.kandidaat_id;
  const tijdlijn = notities.map(n => ({titel:n.door||'Notitie', wanneer:CRM.fmtDate(n.op), tekst:n.tekst}))
    .concat(CRM.activiteitenVoor('lead', l.id).map(a => ({
      titel:a.door||'Systeem',
      wanneer:CRM.fmtDate(a.op), tekst:a.tekst})));

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="flex:1;min-width:0">
        <div class="h2">${h(l.naam)}</div>
        <div class="sub">${h(l.woonplaats||'—')} · ${h(l.bron||'onbekende bron')}${l.campagne?' · '+h(l.campagne):''}</div>
        <div class="row tight" style="margin-top:8px">
          <span class="chip"><i class="dot" style="background:${CRM.leadKleur(l.status)}"></i>${h(l.status)}</span>
          ${l.prioriteit?`<span class="chip">Prioriteit ${h(l.prioriteit)}</span>`:''}
          ${l.score!=null?`<span class="chip num">Score ${h(l.score)}</span>`:''}
          ${belPogingen(l.id)?`<span class="chip">${belPogingen(l.id)}× gebeld</span>`:''}
        </div>
      </div>
      <button class="btn sub x" data-close>✕</button>
    </div>
    <div class="drawer-b">
      <div class="grid c2">
        <div class="card"><div class="card-h"><div class="h2">Contact</div></div><div class="card-b">
          <div class="rc-kv"><span class="label">Telefoon</span><span>${l.telefoon
            ? `<a class="num" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">${h(l.telefoon)}</a>${waLink(l.telefoon)?` · <a href="${h(waLink(l.telefoon))}" target="_blank" rel="noopener">WhatsApp</a>`:''}`
            : '<span class="meta">ontbreekt</span>'}</span></div>
          <div class="rc-kv"><span class="label">E-mail</span><span>${l.email?`<a href="mailto:${h(l.email)}">${h(l.email)}</a>`:'<span class="meta">ontbreekt</span>'}</span></div>
          <div class="rc-kv"><span class="label">Woonplaats</span><span>${h(l.woonplaats||'—')}</span></div>
          <div class="rc-kv"><span class="label">Eigenaar</span><span>${h(l.eigenaar||'—')}</span></div>
          <div class="rc-kv"><span class="label">Binnen</span><span class="num">${h(CRM.fmtDate(l.binnen_op))} · ${h(uurGeleden(l.binnen_op))} geleden</span></div>
        </div></div>
        <div class="card"><div class="card-h"><div class="h2">Reageerde op</div></div><div class="card-b">
          ${v ? `<div class="rc-kv"><span class="label">Vacature</span><span>${h(v.functie)}</span></div>
                 <div class="rc-kv"><span class="label">Klant</span><span>${h(v.klant)}</span></div>
                 <div class="rc-kv"><span class="label">Locatie</span><span>${h(v.locatie||'—')}</span></div>`
              : `<p class="note warn" style="margin:0">Nog niet aan een vacature gekoppeld. Koppel hem bij het doorschieten — dan blijft de marketing meetbaar.</p>`}
          ${l.kwalificatie?`<div class="rc-kv"><span class="label">Kwalificatie</span><span>${h(l.kwalificatie)}</span></div>`:''}
        </div></div>
      </div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">WhatsApp-agent</div></div>
        <div class="card-b">
          ${l.agent_notitie?`<p class="sub" style="margin:0 0 12px">${h(l.agent_notitie)}</p>`:''}
          ${qaHtml(l.antwoorden) || '<p class="meta" style="margin:0">Geen vragen en antwoorden vastgelegd.</p>'}
        </div></div>

      <div class="card" style="margin-top:16px">
        <div class="card-h"><div class="h2">CV</div><div class="spacer"></div>
          <button class="btn ghost sm" id="rc_cvbtn">CV toevoegen</button></div>
        <div class="card-b">${cvHtml(l.cv)}</div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Opvolging</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="rc_opv">Opvolgdatum</label><input type="date" id="rc_opv" value="${h(l.opvolgen_op||'')}"></div>
            <div class="f-row"><label for="rc_eig">Eigenaar (AM)</label><input type="text" id="rc_eig" value="${h(l.eigenaar||'')}" placeholder="Naam"></div>
          </div>
          <div class="f-row"><label for="rc_note">Notitie toevoegen</label>
            <textarea id="rc_note" placeholder="Wat is er besproken?"></textarea>
            <span class="hint">@naam om een collega te melden</span></div>
          <button class="btn ghost sm" id="rc_noteok">Notitie opslaan</button>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Geschiedenis</div></div>
        <div class="card-b">${CRM.ui.tijdlijn(tijdlijn)}</div></div>
    </div>
    <div class="drawer-f" style="flex-wrap:wrap;row-gap:8px">
      <select id="rc_dst" style="width:auto;min-width:210px">
        ${CRM.LEAD_STATUS.map(s=>`<option value="${h(s.k)}" ${l.status===s.k?'selected':''}>${h(s.k)}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      ${doorgeschoten
        ? `<button class="btn" id="rc_naarkand">Open kandidaatkaart →</button>`
        : `<button class="btn" id="rc_door">→ Doorschieten naar pijplijn</button>`}
    </div>`, {onOpen(dr){
      dr.querySelector('#rc_cvbtn').onclick = () => cvModal(l);
      dr.querySelector('#rc_dst').onchange  = e => zetStatus(l, e.target.value);
      const door = dr.querySelector('#rc_door');  if(door) door.onclick = () => doorschietForm(l);
      const nk   = dr.querySelector('#rc_naarkand');
      if(nk) nk.onclick = () => { CRM.drawer.close(); CRM.ga('kandidaten',{id:l.kandidaat_id}); };
      dr.querySelector('#rc_opv').onchange = async e => {
        await bewaarLead(l, {opvolgen_op:e.target.value || null}); CRM.toast('Opvolgdatum gezet','ok'); tekenBar(); tekenLijst();
      };
      dr.querySelector('#rc_eig').onchange = async e => {
        await bewaarLead(l, {eigenaar:e.target.value.trim()}); CRM.toast('Eigenaar bijgewerkt','ok'); tekenLijst();
      };
      dr.querySelector('#rc_noteok').onclick = async () => {
        const t = dr.querySelector('#rc_note').value.trim(); if(!t) return;
        const lijst = notities.concat([{op:new Date().toISOString(), door:CRM.me(), tekst:t}]);
        await bewaarLead(l, {notities:lijst, laatst_actie:new Date().toISOString()});
        await CRM.logActiviteit('lead', l.id, 'notitie', t);
        CRM.verwerkTags(t, 'lead', l.id);
        CRM.toast('Notitie opgeslagen','ok'); tekenBar(); tekenLijst(); openLead(l.id);
      };
    }});
}
/* ─── Doorschieten naar de pijplijn (poortwachter tegen vervuiling) ── */
function doorschietForm(lead){
  const v = vacById(lead.vacature_id);
  const concept = {
    naam:lead.naam||'', telefoon:lead.telefoon||'', woonplaats:lead.woonplaats||'',
    functie:(v && v.functie) || lead.functie || '', bron:lead.bron||''
  };
  const vol = CRM.volledigheid(concept);
  const mist = new Set(vol.mist.map(m => m.k));
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b)=>vacLabel(a).localeCompare(vacLabel(b)));
  const rij = (id, lbl, waarde, type='text') => `
    <div class="f-row ${mist.has(id)?'rc-mist':''}">
      <label for="ds_${id}">${h(lbl)}${mist.has(id)?' <span class="rc-req">ontbreekt</span>':''}</label>
      <input type="${type}" id="ds_${id}" value="${h(waarde)}">
    </div>`;

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Doorschieten naar de pijplijn</div>
      <p class="sub" style="margin:6px 0 0">${h(lead.naam)} komt in fase <b>Intake</b>. Maak de gegevens eerst compleet — half ingevulde kandidaten vervuilen het systeem.</p></div>
    <div class="modal-b">
      <div class="rc-vol">
        <div class="row" style="justify-content:space-between"><span class="label">Volledigheid</span>
          <span class="num">${vol.pct}%</span></div>
        ${CRM.ui.bar(vol.pct, vol.pct>=80?'green':vol.pct>=50?'amber':'red')}
      </div>
      <div class="f-grid" style="margin-top:14px">
        ${rij('naam','Naam', concept.naam)}
        ${rij('telefoon','Telefoonnummer', concept.telefoon, 'tel')}
        ${rij('woonplaats','Woonplaats', concept.woonplaats)}
        ${rij('functie','Gezochte functie', concept.functie)}
        <div class="f-row"><label for="ds_email">E-mail (aanbevolen)</label>
          <input type="email" id="ds_email" value="${h(lead.email||'')}"></div>
        <div class="f-row ${mist.has('bron')?'rc-mist':''}"><label for="ds_bron">Bron</label>
          <select id="ds_bron">${CRM.LEAD_BRONNEN.map(b=>`<option ${concept.bron===b?'selected':''}>${h(b)}</option>`).join('')}</select></div>
      </div>
      <div class="f-row"><label for="ds_vac">Vacature bevestigen</label>
        <select id="ds_vac">
          <option value="">— kies de vacature waarop hij reageerde —</option>
          ${vacs.map(x=>`<option value="${h(x.id)}" ${String(lead.vacature_id)===String(x.id)?'selected':''}>${h(vacLabel(x))}</option>`).join('')}
        </select>
        <span class="hint">Nodig om marketing- en recruitmentprestaties aan elkaar te koppelen.</span></div>
      <div class="f-grid">
        <div class="f-row"><label for="ds_datum">Datum video-intake</label>
          <input type="date" id="ds_datum" value="${h(lead.opvolgen_op||'')}"></div>
        <div class="f-row"><label for="ds_tijd">Tijd</label>
          <input type="time" id="ds_tijd" value="10:00"></div>
      </div>
      <div class="f-row"><label for="ds_rec">Recruiter</label>
        <input type="text" id="ds_rec" value="${h(lead.eigenaar || CRM.me())}"></div>
      <label class="check"><input type="checkbox" id="ds_agenda" checked> Zet de video-intake ook in mijn agenda</label>
      <div class="note err" id="ds_err" style="display:none"></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ds_ok">Doorschieten</button>
    </div>`, {onOpen(m){
      const vacSel = m.querySelector('#ds_vac');
      vacSel.onchange = () => {
        const x = vacById(vacSel.value);
        if(x && !m.querySelector('#ds_functie').value.trim()) m.querySelector('#ds_functie').value = x.functie;
      };
      m.querySelector('#ds_ok').onclick = async () => {
        const g = id => m.querySelector('#ds_'+id).value.trim();
        const err = m.querySelector('#ds_err');
        const ontbreekt = [];
        ['naam','telefoon','woonplaats','functie'].forEach(k => { if(!g(k)) ontbreekt.push(k); });
        if(!g('bron')) ontbreekt.push('bron');
        if(!vacSel.value) ontbreekt.push('vacature');
        if(!g('datum')) ontbreekt.push('datum video-intake');
        if(!g('tijd')) ontbreekt.push('tijd video-intake');
        if(ontbreekt.length){
          err.style.display = ''; err.textContent = 'Nog invullen: ' + ontbreekt.join(', ') + '.';
          return;
        }
        const x = vacById(vacSel.value);
        const vandaag = CRM.todayISO();
        const cand = {
          id: CRM.uid(), naam:g('naam'), telefoon:g('telefoon'), email:g('email'),
          woonplaats:g('woonplaats'), functie:g('functie'), klant:(x && x.klant) || lead.klant || '',
          type:'W&S', bron:g('bron'), fase:'Intake', datum:g('datum'), tijd:g('tijd'),
          since:vandaag, rec:g('rec') || CRM.me(), vacatureId:vacSel.value, leadId:lead.id,
          cv:lead.cv || null, note:lead.kwalificatie || '',
          historie:[{fase:'Intake', op:vandaag}],
          notities:(Array.isArray(lead.notities)?lead.notities:[]).concat(
            lead.agent_notitie ? [{op:lead.binnen_op||new Date().toISOString(), door:'WhatsApp-agent', tekst:lead.agent_notitie}] : [])
        };
        const rij = CRM.candToRow(cand);
        CRM.state.cands.unshift(rij);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('candidates').insert(rij);
          if(error){ CRM.state.cands.shift(); err.style.display=''; err.textContent = 'Opslaan mislukt: ' + error.message; return; }
        }
        await bewaarLead(lead, {status:'Doorgeschoten', kandidaat_id:cand.id, laatst_actie:new Date().toISOString()});
        await CRM.logActiviteit('lead', lead.id, 'systeem', `Doorgeschoten naar de pijplijn — video-intake ${CRM.fmtDate(cand.datum)} ${cand.tijd}`);
        await CRM.logActiviteit('kandidaat', cand.id, 'systeem', `Aangemaakt vanuit lead (${cand.bron}) — video-intake ${CRM.fmtDate(cand.datum)} ${cand.tijd}`);
        if(m.querySelector('#ds_agenda').checked){
          try{
            const r = await CRM.outlook.maakAfspraak({
              titel:`Videointake — ${cand.naam}`, datum:cand.datum, tijd:cand.tijd,
              duurMin:30, teams:true, deelnemers:[cand.email].filter(Boolean),
              body:`Video-intake voor ${cand.functie||'vacature'}${cand.klant?' bij '+cand.klant:''}.`
            });
            if(r.via==='deeplink') CRM.toast('Outlook geopend — klik daar op Opslaan','ok');
            if(r.online) await CRM.logActiviteit('kandidaat', cand.id, 'notitie', 'Teams-link: ' + r.online);
          }catch(e){ console.warn('agenda', e); }
        }
        CRM.modal.close(); CRM.drawer.close();
        tekenBar(); tekenTabs(); tekenBody(); CRM.navBadges();
        toastLink(`${cand.naam} staat in Intake`, 'Open kandidaatkaart →', () => CRM.ga('kandidaten',{id:cand.id}));
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   + SOLLICITANT — zelf iemand toevoegen, in drie stappen:
   1. route kiezen (handmatig of CV inlezen)
   2. kerngegevens (naam + telefoon verplicht, volledigheidsbalk)
   3. bestemming: koppelen aan een vacature (status Nieuw), golden
      candidate (candidates, zónder pijplijnfase) of alleen opslaan.
   ═══════════════════════════════════════════════════════════════ */
function nieuweSollicitantKeuze(){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe sollicitant</div>
      <p class="sub" style="margin:6px 0 0">Hoe wil je hem toevoegen?</p></div>
    <div class="modal-b">
      <div class="rc-route">
        <button id="ns_hand"><b>Handmatig invullen</b><small>Typ de gegevens zelf in het formulier.</small></button>
        <button id="ns_cv"><b>CV inlezen</b><small>PDF of tekstbestand — de velden worden voorgevuld, jij controleert.</small></button>
      </div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      m.querySelector('#ns_hand').onclick = () => { CRM.modal.close(); sollicitantForm({}); };
      m.querySelector('#ns_cv').onclick   = () => { CRM.modal.close(); sollicitantCvStap(); };
    }});
}

/* Stap 1b — CV kiezen en parsen (zelfde parser als de lead-CV-flow). */
function sollicitantCvStap(){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">CV inlezen</div>
      <p class="sub" style="margin:6px 0 0">PDF of tekstbestand. Het bestand wordt in je browser gelezen — er gaat niets naar een externe dienst. Je controleert alles in het formulier hierna.</p></div>
    <div class="modal-b">
      <input type="file" id="ns_file" accept=".pdf,.txt,.md,text/plain,application/pdf">
      <div id="ns_uit" style="margin-top:14px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ns_door" disabled>Verder naar het formulier →</button></div>`, {onOpen(m){
      let gevonden = null;
      m.querySelector('#ns_file').onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        const uit = m.querySelector('#ns_uit');
        uit.innerHTML = CRM.ui.laden('CV lezen…');
        try{
          const tekst = /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
            ? await pdfTekst(f) : await f.text();
          if(!tekst.trim()){
            gevonden = null;
            uit.innerHTML = `<div class="note warn">Er kwam geen tekst uit dit bestand — waarschijnlijk een gescande pdf (een plaatje). Ga verder en vul het formulier handmatig in.</div>`;
            m.querySelector('#ns_door').disabled = false;
            return;
          }
          gevonden = parseCV(tekst);
          uit.innerHTML = `
            <p class="label" style="margin-bottom:8px">Gevonden in het CV</p>
            <div class="rc-kv"><span class="label">Telefoon</span><span class="num">${h(gevonden.telefoon)||'<span class="meta">—</span>'}</span></div>
            <div class="rc-kv"><span class="label">E-mail</span><span>${h(gevonden.email)||'<span class="meta">—</span>'}</span></div>
            <div class="rc-kv"><span class="label">Woonplaats</span><span>${h(gevonden.woonplaats)||'<span class="meta">—</span>'}</span></div>
            <div class="rc-kv"><span class="label">Functie</span><span>${h(gevonden.functie)||'<span class="meta">—</span>'}</span></div>
            ${gevonden.talen.length?`<div class="rc-kv"><span class="label">Talen</span><span>${h(gevonden.talen.join(', '))}</span></div>`:''}
            ${gevonden.certificaten.length?`<div class="rc-kv"><span class="label">Certificaten</span><span>${h(gevonden.certificaten.join(', '))}</span></div>`:''}
            ${gevonden.mist.length ? `<div class="note warn" style="margin-top:10px">Niet gevonden: ${h(gevonden.mist.join(', '))}. Vul dat in het formulier aan.</div>`
                                   : `<div class="note ok" style="margin-top:10px">Alles gevonden — loop het formulier nog even na.</div>`}`;
          m.querySelector('#ns_door').disabled = false;
        }catch(err){
          uit.innerHTML = `<div class="note err">Lezen mislukt: ${h(err.message)}</div>`;
        }
      };
      m.querySelector('#ns_door').onclick = () => {
        CRM.modal.close();
        const p = gevonden || {};
        const heeftCv = !!(p.functie || (p.werk&&p.werk.length) || (p.talen&&p.talen.length) || (p.certificaten&&p.certificaten.length));
        sollicitantForm({
          telefoon:p.telefoon||'', email:p.email||'', woonplaats:p.woonplaats||'', functie:p.functie||'',
          cv: heeftCv ? {functie:p.functie||'', ervaringJaren:p.ervaringJaren==null?null:p.ervaringJaren,
                         talen:p.talen||[], certificaten:p.certificaten||[], werk:p.werk||[],
                         op:new Date().toISOString(), door:CRM.me()} : null
        });
      };
    }});
}

/* Stap 2 — kerngegevens met volledigheidsbalk (zelfde meetlat als de
   doorschiet-poortwachter: CRM.volledigheid). */
function sollicitantForm(pre){
  pre = pre || {};
  const rij = (id, lbl, val, type, hint) => `
    <div class="f-row"><label for="nsf_${id}">${h(lbl)}</label>
      <input type="${type||'text'}" id="nsf_${id}" value="${h(val||'')}">${hint?`<span class="hint">${h(hint)}</span>`:''}</div>`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe sollicitant</div>
      <p class="sub" style="margin:6px 0 0">Naam en telefoon zijn verplicht. De rest is aanbevolen — half ingevulde kandidaten vervuilen het systeem.</p></div>
    <div class="modal-b">
      <div class="rc-vol" id="ns_vol"></div>
      <div class="f-grid" style="margin-top:14px">
        ${rij('naam','Naam','')}
        ${rij('tel','Telefoonnummer', pre.telefoon, 'tel')}
        ${rij('mail','E-mail (aanbevolen)', pre.email, 'email')}
        ${rij('plaats','Woonplaats (aanbevolen)', pre.woonplaats)}
        ${rij('functie','Gezochte functie (aanbevolen)', pre.functie)}
        <div class="f-row"><label for="nsf_bron">Bron (aanbevolen)</label>
          <select id="nsf_bron">${CRM.LEAD_BRONNEN.map(b=>`<option ${b==='Handmatig'?'selected':''}>${h(b)}</option>`).join('')}</select></div>
      </div>
      ${pre.cv ? `<div class="note ok" style="margin-top:4px">Het ingelezen CV wordt aan deze sollicitant gekoppeld.</div>` : ''}
      <div class="note err" id="ns_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ns_ok">Verder →</button></div>`, {onOpen(m){
      const g = id => m.querySelector('#nsf_'+id).value.trim();
      const vol = () => {
        const v = CRM.volledigheid({naam:g('naam'), telefoon:g('tel'), woonplaats:g('plaats'),
          functie:g('functie'), bron:m.querySelector('#nsf_bron').value, email:g('mail'), cv:pre.cv||null});
        m.querySelector('#ns_vol').innerHTML = `
          <div class="row" style="justify-content:space-between"><span class="label">Volledigheid</span>
            <span class="num">${v.pct}%</span></div>
          ${CRM.ui.bar(v.pct, v.pct>=80?'green':v.pct>=50?'amber':'red')}`;
      };
      ['naam','tel','mail','plaats','functie'].forEach(id => m.querySelector('#nsf_'+id).oninput = vol);
      m.querySelector('#nsf_bron').onchange = vol;
      vol();
      setTimeout(()=>m.querySelector('#nsf_naam').focus(), 60);
      m.querySelector('#ns_ok').onclick = () => {
        const err = m.querySelector('#ns_err');
        const zeg = t => { err.style.display=''; err.textContent = t; };
        if(!g('naam')) return zeg('Vul de naam in.');
        if(!g('tel'))  return zeg('Vul het telefoonnummer in — zonder nummer kun je niet bellen.');
        const gg = {naam:g('naam'), telefoon:g('tel'), email:g('mail'), woonplaats:g('plaats'),
                    functie:g('functie'), bron:m.querySelector('#nsf_bron').value, cv:pre.cv||null};
        CRM.modal.close();
        sollicitantBestemming(gg);
      };
    }});
}

/* Stap 3 — bestemming kiezen. */
function sollicitantBestemming(gg){
  const vacs = (CRM.state.vacs||[]).filter(v => !v.status || v.status === 'Open')
    .slice().sort((a,b)=>vacLabel(a).localeCompare(vacLabel(b)));
  const opt = (val, lbl, sub, checked) => `
    <label class="rc-opt ${checked?'sel':''}"><input type="radio" name="ns_best" value="${h(val)}" ${checked?'checked':''}>
      <span><b>${h(lbl)}</b><small>${h(sub)}</small></span></label>`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Waar hoort ${h(gg.naam)} thuis?</div></div>
    <div class="modal-b">
      <div class="rc-radio">
        ${opt('vac','Koppel aan een vacature','Komt als Nieuw in Inkomende sollicitanten bij die vacature — jij of een collega werkt hem daar weg.', true)}
        ${opt('golden','Golden candidate','Goede kandidaat, maar nu geen passende vacature. Krijgt de gouden ster ★ en blijft vindbaar via Kandidaten → filter "Golden candidates ★". Hij komt bewust niet op het bord.', false)}
        ${opt('lijst','Alleen opslaan als sollicitant','Komt als Nieuw in de lijst, zonder vacature. Koppelen kan later alsnog.', false)}
      </div>
      <div class="f-row" id="ns_vacwrap" style="margin-top:12px"><label for="ns_vac">Open vacature</label>
        <select id="ns_vac"><option value="">— kies de vacature —</option>
          ${vacs.map(v=>`<option value="${h(v.id)}">${h(vacLabel(v))}</option>`).join('')}</select></div>
      <div class="note err" id="ns_err2" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ns_ok2">Opslaan</button></div>`, {onOpen(m){
      const keuze = () => m.querySelector('input[name=ns_best]:checked').value;
      const sync = () => {
        CRM.$$('.rc-opt', m).forEach(o => o.classList.toggle('sel', o.querySelector('input').checked));
        m.querySelector('#ns_vacwrap').style.display = keuze() === 'vac' ? '' : 'none';
      };
      CRM.$$('.rc-radio input', m).forEach(r => r.onchange = sync);
      sync();
      m.querySelector('#ns_ok2').onclick = async () => {
        const err = m.querySelector('#ns_err2');
        const k = keuze();
        if(k === 'golden'){
          const cand = await maakGoldenCandidate(gg);
          if(!cand) return;
          CRM.modal.close();
          alles();
          toastLink(`${gg.naam} opgeslagen als golden candidate`, 'Open kandidaatkaart →',
            () => CRM.ga('kandidaten',{id:cand.id}));
          return;
        }
        let v = null;
        if(k === 'vac'){
          v = vacById(m.querySelector('#ns_vac').value);
          if(!v){ err.style.display=''; err.textContent = 'Kies de vacature — of kies een andere bestemming.'; return; }
        }
        const rij = await maakSollicitantRij(gg, v);
        if(!rij) return;
        CRM.modal.close();
        S.tab = 'leads'; alles(); tekenActies();
        toastLink(`${gg.naam} staat als Nieuw in Inkomende sollicitanten`, 'Openen →', () => openLead(rij.id));
      };
    }});
}

/* Zelfde route als instroom van buiten: een crm_leads-rij op status Nieuw. */
async function maakSollicitantRij(gg, v){
  const rij = {
    id:CRM.uid(), naam:gg.naam, telefoon:gg.telefoon, email:gg.email||'',
    woonplaats:gg.woonplaats||'', bron:gg.bron||'Handmatig', campagne:'',
    vacature_id:v?v.id:'', klant:v?v.klant:'', functie:v?v.functie:(gg.functie||''),
    status:'Nieuw', prioriteit:'', kwalificatie:'', score:null, agent_notitie:'',
    antwoorden:null, cv:gg.cv||null, eigenaar:CRM.me(), binnen_op:new Date().toISOString(),
    opvolgen_op:null, kandidaat_id:'', notities:[]
  };
  CRM.state.leads.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_leads').insert(rij);
    if(error){ CRM.state.leads.shift(); CRM.fout('Opslaan mislukt', error); return null; }
  }
  await CRM.logActiviteit('lead', rij.id, 'systeem',
    v ? `Handmatig toegevoegd en gekoppeld aan ${v.functie} · ${v.klant}` : 'Handmatig toegevoegd');
  return rij;
}

/* Golden candidate: direct een candidates-rij, mét golden-vlag en zónder
   pijplijnfase (fase '' — faseIdx is dan -1, het bord toont hem terecht
   niet). Terugvindbaar via Kandidaten → filter Golden ★, en de
   Pijplijn meldt onder de filters hoeveel er geparkeerd staan. */
async function maakGoldenCandidate(gg){
  const vandaag = CRM.todayISO();
  const cand = {
    id:CRM.uid(), naam:gg.naam, telefoon:gg.telefoon, email:gg.email||'',
    woonplaats:gg.woonplaats||'', functie:gg.functie||'', klant:'', type:'',
    bron:gg.bron||'Handmatig', fase:'', since:vandaag, rec:CRM.me(),
    cv:gg.cv||null, historie:[], notities:[]
  };
  const rij = CRM.candToRow(cand);
  rij.golden = true;                        // kolom candidates.golden (schema.sql)
  CRM.state.cands.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').insert(rij);
    if(error){ CRM.state.cands.shift(); CRM.fout('Opslaan mislukt', error); return null; }
  }
  await CRM.logActiviteit('kandidaat', cand.id, 'systeem',
    'Aangemaakt als golden candidate — goede kandidaat, nu geen passende vacature');
  return cand;
}
/* ═══════════════════════════════════════════════════════════════
   CV INLEZEN — pdf.js lazy laden, regels/regex, gebruiker bevestigt
   ═══════════════════════════════════════════════════════════════ */
let _pdfjs = null;
function laadPdfJs(){
  if(_pdfjs) return _pdfjs;
  _pdfjs = new Promise((res, rej) => {
    if(window.pdfjsLib) return res(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = () => {
      try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; }catch(e){}
      res(window.pdfjsLib);
    };
    s.onerror = () => { _pdfjs = null; rej(new Error('pdf.js kon niet geladen worden')); };
    document.head.appendChild(s);
  });
  return _pdfjs;
}
async function pdfTekst(file){
  const lib = await laadPdfJs();
  const doc = await lib.getDocument({data:await file.arrayBuffer()}).promise;
  let uit = '';
  for(let p = 1; p <= Math.min(doc.numPages, 10); p++){
    const items = (await (await doc.getPage(p)).getTextContent()).items;
    let vorigeY = null, regel = ''; const regels = [];
    items.forEach(it => {
      const y = it.transform[5];
      if(vorigeY !== null && Math.abs(y - vorigeY) > 3){ if(regel.trim()) regels.push(regel.trim()); regel = ''; }
      regel += it.str + ' '; vorigeY = y;
    });
    if(regel.trim()) regels.push(regel.trim());
    uit += regels.join('\n') + '\n';
  }
  return uit;
}

const TALEN = ['Nederlands','Engels','Duits','Frans','Spaans','Pools','Roemeens','Bulgaars','Hongaars',
               'Turks','Arabisch','Portugees','Italiaans','Oekraïens','Russisch','Slowaaks','Tsjechisch'];
const CERT_REGELS = [
  [/heftruck|vorkheftruck|forklift/i, 'Heftruckcertificaat'],
  [/reachtruck|reach truck/i, 'Reachtruck'],
  [/\bept\b|elektrische pallet/i, 'EPT'],
  [/\bvca\b/i, 'VCA'],
  [/hoogwerker/i, 'Hoogwerker'],
  [/\bbhv\b/i, 'BHV'],
  [/lascertificaat|lasdiploma|\bnen\s?9606\b/i, 'Lascertificaat']
];

function parseCV(tekst){
  const t = String(tekst || '');
  const regels = t.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  const uit = {telefoon:'', email:'', woonplaats:'', talen:[], certificaten:[], werk:[], ervaringJaren:null, functie:''};

  const em = t.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  if(em) uit.email = em[0];

  const tel = t.match(/(?:\+31|0031|0)\s?6[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/)
           || t.match(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s.-]?){9,12}/);
  if(tel) uit.telefoon = tel[0].trim().replace(/\s{2,}/g,' ');

  /* Postcode + plaats, maar alleen op dezelfde regel (anders pakt hij het
     woord van de volgende regel erbij). */
  const pc = t.match(/\b\d{4}[ \t]?[A-Za-z]{2}\b[ \t,]+([A-Z][\wäöüéèëïñ'’-]{2,24}(?:[ \t][A-Z][\wäöüéèë'’-]{2,24})?)/);
  if(pc) uit.woonplaats = pc[1].trim();
  if(!uit.woonplaats){
    const plaatsen = Array.from(new Set([].concat(
      (CRM.state.cands||[]).map(c => c.woonplaats),
      (CRM.state.vacs||[]).map(v => v.locatie),
      leads().map(l => l.woonplaats)).filter(Boolean)));
    const gevonden = plaatsen.find(p => new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b','i').test(t));
    if(gevonden) uit.woonplaats = gevonden;
  }

  TALEN.forEach(x => { if(new RegExp('\\b'+x+'\\b','i').test(t)) uit.talen.push(x); });
  CERT_REGELS.forEach(([re, lbl]) => { if(re.test(t)) uit.certificaten.push(lbl); });
  const rb = t.match(/rijbewijs[^\n]{0,40}/i);
  if(rb){
    const cats = (rb[0].match(/\b(A[MB]?|BE?|C[E]?|D|CE)\b/g)||[]).join('/');
    uit.certificaten.push('Rijbewijs' + (cats ? ' ' + cats : ''));
  }

  const jaarRe = /(19|20)\d{2}\s*[–—\-\/tot ]{1,6}\s*((19|20)\d{2}|heden|nu)/i;
  const jaren = [];
  regels.forEach((r, i) => {
    if(jaarRe.test(r) && r.length < 140){
      let regel = r;
      if(regel.replace(jaarRe,'').replace(/[^a-zA-Z]/g,'').length < 4 && regels[i+1]) regel = r + ' — ' + regels[i+1];
      if(uit.werk.length < 8) uit.werk.push(regel);
    }
    (r.match(/(19|20)\d{2}/g)||[]).forEach(j => jaren.push(+j));
  });
  if(jaren.length){
    const vroegst = Math.min.apply(null, jaren.filter(j => j >= 1960 && j <= new Date().getFullYear()));
    if(isFinite(vroegst)) uit.ervaringJaren = Math.max(0, Math.min(45, new Date().getFullYear() - vroegst));
  }
  const functies = Array.from(new Set((CRM.state.vacs||[]).map(v => v.functie).filter(Boolean)));
  const fg = functies.find(f => new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(t));
  if(fg) uit.functie = fg;
  else if(uit.werk.length) uit.functie = uit.werk[0].replace(jaarRe,'').replace(/^[\s\-–—:]+/,'').slice(0,60).trim();

  uit.mist = [];
  if(!uit.telefoon) uit.mist.push('telefoonnummer');
  if(!uit.email) uit.mist.push('e-mailadres');
  if(!uit.woonplaats) uit.mist.push('woonplaats');
  if(!uit.werk.length) uit.mist.push('werkverleden met jaartallen');
  if(!uit.talen.length) uit.mist.push('talen');
  if(!uit.certificaten.length) uit.mist.push('certificaten');
  return uit;
}

function cvModal(lead){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">CV toevoegen</div>
      <p class="sub" style="margin:6px 0 0">PDF of tekstbestand. Het bestand wordt in je browser gelezen — er gaat niets naar een externe dienst. Je bevestigt zelf wat wordt overgenomen.</p></div>
    <div class="modal-b">
      <input type="file" id="cv_file" accept=".pdf,.txt,.md,text/plain,application/pdf">
      <div id="cv_uit" style="margin-top:14px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Sluiten</button>
      <button class="btn" id="cv_ok" disabled>Overnemen</button></div>`, {onOpen(m){
      const uit = m.querySelector('#cv_uit'), ok = m.querySelector('#cv_ok');
      let gevonden = null;
      m.querySelector('#cv_file').onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        uit.innerHTML = CRM.ui.laden('CV lezen…');
        try{
          const tekst = /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
            ? await pdfTekst(f) : await f.text();
          if(!tekst.trim()){
            uit.innerHTML = `<div class="note warn">Er kwam geen tekst uit dit bestand. Waarschijnlijk is het een gescande pdf (een plaatje). Vul de gegevens dan handmatig in.</div>`;
            return;
          }
          gevonden = parseCV(tekst);
          uit.innerHTML = `
            <p class="label" style="margin-bottom:8px">Gevonden — controleer en pas aan</p>
            <div class="f-grid">
              <div class="f-row"><label for="cv_tel">Telefoon</label><input type="tel" id="cv_tel" value="${h(gevonden.telefoon)}"></div>
              <div class="f-row"><label for="cv_mail">E-mail</label><input type="email" id="cv_mail" value="${h(gevonden.email)}"></div>
              <div class="f-row"><label for="cv_plaats">Woonplaats</label><input type="text" id="cv_plaats" value="${h(gevonden.woonplaats)}"></div>
              <div class="f-row"><label for="cv_functie">Functie</label><input type="text" id="cv_functie" value="${h(gevonden.functie)}"></div>
              <div class="f-row"><label for="cv_jaren">Ervaring (jaren)</label><input type="number" id="cv_jaren" min="0" max="45" value="${gevonden.ervaringJaren==null?'':gevonden.ervaringJaren}"></div>
              <div class="f-row"><label for="cv_talen">Talen</label><input type="text" id="cv_talen" value="${h(gevonden.talen.join(', '))}"></div>
            </div>
            <div class="f-row"><label for="cv_cert">Certificaten</label><input type="text" id="cv_cert" value="${h(gevonden.certificaten.join(', '))}"></div>
            <div class="f-row"><label for="cv_werk">Werkverleden</label>
              <textarea id="cv_werk" style="min-height:92px">${h(gevonden.werk.join('\n'))}</textarea></div>
            ${gevonden.mist.length ? `<div class="note warn">Niet gevonden in dit cv: ${h(gevonden.mist.join(', '))}. Vul dat zelf aan.</div>` : `<div class="note ok">Alles gevonden. Loop het nog even na.</div>`}
            <label class="check" style="margin-top:10px"><input type="checkbox" id="cv_over" checked>
              Lege velden van de lead aanvullen (bestaande waarden blijven staan)</label>`;
          ok.disabled = false;
        }catch(err){
          uit.innerHTML = `<div class="note err">Lezen mislukt: ${h(err.message)}</div>`;
        }
      };
      ok.onclick = async () => {
        if(!gevonden) return;
        const g = id => { const el = m.querySelector('#cv_'+id); return el ? el.value.trim() : ''; };
        const lijst = s => s.split(/[,;]/).map(x=>x.trim()).filter(Boolean);
        const cv = {
          functie:g('functie'), ervaringJaren:g('jaren') ? +g('jaren') : null,
          talen:lijst(g('talen')), certificaten:lijst(g('cert')),
          werk:g('werk').split(/\n/).map(x=>x.trim()).filter(Boolean),
          op:new Date().toISOString(), door:CRM.me()
        };
        const patch = {cv};
        if(m.querySelector('#cv_over')?.checked){
          if(!lead.telefoon && g('tel')) patch.telefoon = g('tel');
          if(!lead.email && g('mail')) patch.email = g('mail');
          if(!lead.woonplaats && g('plaats')) patch.woonplaats = g('plaats');
        }
        await bewaarLead(lead, patch);
        await CRM.logActiviteit('lead', lead.id, 'doc', 'CV ingelezen en gecontroleerd');
        CRM.modal.close(); CRM.toast('CV opgeslagen','ok');
        tekenLijst(); openLead(lead.id);
      };
    }});
}
/* ═══════════════════════════════════════════════════════════════
   IMPORT — CSV plakken of bestand, kolommen koppelen, dubbelen zien
   ═══════════════════════════════════════════════════════════════ */
function kiesDelim(regel){
  const tel = c => (regel.split(c).length - 1);
  return [['\t',tel('\t')], [';',tel(';')], [',',tel(',')]].sort((a,b)=>b[1]-a[1])[0][0];
}
function parseCSV(tekst){
  const eerste = tekst.split(/\r?\n/)[0] || '';
  const delim = kiesDelim(eerste);
  const rijen = []; let rij = [], veld = '', inQ = false;
  for(let i = 0; i < tekst.length; i++){
    const c = tekst[i];
    if(inQ){
      if(c === '"'){ if(tekst[i+1] === '"'){ veld += '"'; i++; } else inQ = false; }
      else veld += c;
    }
    else if(c === '"') inQ = true;
    else if(c === delim){ rij.push(veld); veld = ''; }
    else if(c === '\n'){ rij.push(veld); rijen.push(rij); rij = []; veld = ''; }
    else if(c !== '\r') veld += c;
  }
  if(veld !== '' || rij.length){ rij.push(veld); rijen.push(rij); }
  return rijen.map(r => r.map(v => v.trim())).filter(r => r.some(v => v !== ''));
}

const IMP_VELDEN = [
  {k:'naam',        lbl:'Naam',            hints:['naam','name','volledige naam','full name']},
  {k:'telefoon',    lbl:'Telefoon',        hints:['tel','phone','mobiel','nummer','whatsapp']},
  {k:'email',       lbl:'E-mail',          hints:['mail','email','e-mail']},
  {k:'woonplaats',  lbl:'Woonplaats',      hints:['plaats','woonplaats','stad','city']},
  {k:'bron',        lbl:'Bron',            hints:['bron','source','platform','kanaal']},
  {k:'campagne',    lbl:'Campagne',        hints:['campagne','campaign','adset','advertentie']},
  {k:'vacature',    lbl:'Vacature',        hints:['vacature','functie','job','positie','role']},
  {k:'klant',       lbl:'Klant',           hints:['klant','bedrijf','client','opdrachtgever']},
  {k:'status',      lbl:'Status',          hints:['status']},
  {k:'prioriteit',  lbl:'Prioriteit',      hints:['prio','priority']},
  {k:'score',       lbl:'Score',           hints:['score','kwalificatiescore','rating']},
  {k:'kwalificatie',lbl:'Kwalificatie',    hints:['kwalificatie','qualificatie','oordeel','samenvatting']},
  {k:'agent_notitie',lbl:'Notitie agent',  hints:['notitie','note','opmerking','agent','toelichting']},
  {k:'eigenaar',    lbl:'Eigenaar (AM)',   hints:['eigenaar','owner','am','recruiter']}
];

/* Kop raden: hele woorden vergelijken, anders matcht "naam" op "eigenaar". */
function kopScore(kop, veld){
  const k = norm(kop).replace(/[^a-z0-9]+/g,' ').trim();
  if(!k) return 0;
  const woorden = k.split(' ');
  let best = 0;
  veld.hints.forEach(hint => {
    if(k === hint) best = Math.max(best, 3);
    else if(woorden.includes(hint)) best = Math.max(best, 2);
    else if(hint.length >= 5 && k.includes(hint)) best = Math.max(best, 1);
  });
  return best;
}

function importModal(){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Sollicitanten importeren</div>
      <p class="sub" style="margin:6px 0 0">Plak de rijen uit de Google Sheet (met kopregel), of kies een CSV-bestand.</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="im_txt">CSV plakken</label>
        <textarea id="im_txt" style="min-height:130px;font-family:ui-monospace,monospace;font-size:12px"
          placeholder="naam;telefoon;woonplaats;bron;vacature&#10;Jan Jansen;06 12345678;Gouda;Meta;Productiemedewerker"></textarea></div>
      <div class="row"><input type="file" id="im_file" accept=".csv,.tsv,.txt,text/csv" style="width:auto">
        <div class="spacer"></div>
        <button class="btn ghost sm" id="im_lees">Kolommen koppelen →</button></div>
      <div class="note err" id="im_err" style="display:none;margin-top:12px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      const ta = m.querySelector('#im_txt');
      m.querySelector('#im_file').onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        ta.value = await f.text();
      };
      m.querySelector('#im_lees').onclick = () => {
        const rijen = parseCSV(ta.value);
        const err = m.querySelector('#im_err');
        if(rijen.length < 2){
          err.style.display = ''; err.textContent = 'Ik zie geen kopregel plus minstens één datarij.'; return;
        }
        koppelStap(rijen);
      };
    }});
}

function koppelStap(rijen){
  const kop = rijen[0], data = rijen.slice(1);
  /* Elke kolom hoogstens één keer koppelen — de beste match wint. */
  const keuze = {}, bezet = new Set();
  const kandidaten = [];
  IMP_VELDEN.forEach(v => kop.forEach((k,i) => {
    const s = kopScore(k, v);
    if(s > 0) kandidaten.push({veld:v.k, idx:i, score:s});
  }));
  IMP_VELDEN.forEach(v => keuze[v.k] = -1);
  kandidaten.sort((a,b) => b.score - a.score).forEach(c => {
    if(keuze[c.veld] === -1 && !bezet.has(c.idx)){ keuze[c.veld] = c.idx; bezet.add(c.idx); }
  });
  const opties = idx => kop.map((k,i)=>`<option value="${i}" ${idx===i?'selected':''}>${h(k || 'kolom '+(i+1))}</option>`).join('');

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Kolommen koppelen</div>
      <p class="sub" style="margin:6px 0 0">${data.length} rijen gevonden. Controleer welke kolom waar hoort.</p></div>
    <div class="modal-b">
      <div class="rc-map">
        ${IMP_VELDEN.map(v => `
          <label>${h(v.lbl)}${v.k==='naam'?' <span class="rc-req">verplicht</span>':''}</label>
          <select data-v="${v.k}"><option value="-1">— niet importeren —</option>${opties(keuze[v.k])}</select>`).join('')}
      </div>
      <div id="im_prev" style="margin-top:16px"></div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="im_skip" checked>
        Dubbelen op telefoonnummer overslaan</label>
      <div class="note err" id="im_err2" style="display:none;margin-top:10px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="im_ok">Importeren</button></div>`, {onOpen(m){
      const sels = CRM.$$('select[data-v]', m);
      const lees = () => { const k = {}; sels.forEach(s => k[s.dataset.v] = +s.value); return k; };
      const preview = () => {
        const k = lees();
        const bestaandTel = new Set(leads().map(l => telNorm(l.telefoon)).filter(Boolean));
        (CRM.state.cands||[]).forEach(c => { const t = telNorm(c.telefoon); if(t) bestaandTel.add(t); });
        const gezien = new Set();
        let dub = 0;
        const voorbeeld = data.slice(0,4).map(r => {
          const tel = k.telefoon >= 0 ? r[k.telefoon] : '';
          const t = telNorm(tel);
          const isDub = t && (bestaandTel.has(t) || gezien.has(t));
          if(t) gezien.add(t);
          return {naam:k.naam>=0?r[k.naam]:'', tel, plaats:k.woonplaats>=0?r[k.woonplaats]:'',
                  bron:k.bron>=0?r[k.bron]:'', vac:k.vacature>=0?r[k.vacature]:'', dub:isDub};
        });
        data.forEach(r => {
          const t = telNorm(k.telefoon>=0 ? r[k.telefoon] : '');
          if(t && bestaandTel.has(t)) dub++;
        });
        m.querySelector('#im_prev').innerHTML = `
          <p class="label" style="margin-bottom:8px">Voorbeeld</p>
          <div class="tblwrap"><table class="tbl"><thead><tr>
            <th>Naam</th><th>Telefoon</th><th>Plaats</th><th>Bron</th><th>Vacature</th></tr></thead>
            <tbody>${voorbeeld.map(v=>`<tr>
              <td>${h(v.naam)||'<span class="meta">leeg</span>'}${v.dub?' <span class="chip amber">dubbel</span>':''}</td>
              <td class="num">${h(v.tel)}</td><td>${h(v.plaats)}</td><td>${h(v.bron)}</td><td>${h(v.vac)}</td></tr>`).join('')}
            </tbody></table></div>
          ${dub ? `<p class="meta" style="margin:8px 2px">${dub} van de ${data.length} rijen bestaat al (zelfde telefoonnummer).</p>` : ''}`;
      };
      sels.forEach(s => s.onchange = preview);
      preview();

      m.querySelector('#im_ok').onclick = async () => {
        const k = lees(), err = m.querySelector('#im_err2');
        if(k.naam < 0){ err.style.display=''; err.textContent = 'Koppel in elk geval de kolom met de naam.'; return; }
        const skip = m.querySelector('#im_skip').checked;
        const bestaand = new Set(leads().map(l => telNorm(l.telefoon)).filter(Boolean));
        const statussen = CRM.LEAD_STATUS.map(s => s.k);
        const nieuw = [], nu = new Date().toISOString();
        let over = 0;
        data.forEach(r => {
          const veld = key => k[key] >= 0 ? String(r[k[key]] || '').trim() : '';
          const naam = veld('naam'); if(!naam) return;
          const tel = veld('telefoon'), tn = telNorm(tel);
          if(skip && tn && bestaand.has(tn)){ over++; return; }
          if(tn) bestaand.add(tn);
          const vacTekst = veld('vacature'), klantTekst = veld('klant');
          let v = vacById(vacTekst);
          if(!v && vacTekst){
            v = (CRM.state.vacs||[]).find(x => norm(x.functie) === norm(vacTekst) &&
                  (!klantTekst || CRM.zelfdeKlant(x.klant, klantTekst)))
             || (CRM.state.vacs||[]).find(x => norm(vacTekst).includes(norm(x.functie)));
          }
          const st = veld('status');
          const score = veld('score');
          nieuw.push({
            id:CRM.uid() + Math.floor(Math.random()*1e4), naam, telefoon:tel, email:veld('email'),
            woonplaats:veld('woonplaats'), bron:veld('bron') || 'Import', campagne:veld('campagne'),
            vacature_id:v ? v.id : '', klant:v ? v.klant : klantTekst, functie:v ? v.functie : vacTekst,
            status: statussen.includes(st) ? st : 'Nieuw',
            prioriteit:veld('prioriteit'), kwalificatie:veld('kwalificatie'),
            score: score && !isNaN(+score) ? +score : null,
            agent_notitie:veld('agent_notitie'), antwoorden:null, cv:null,
            eigenaar:veld('eigenaar') || CRM.me(), binnen_op:nu, opvolgen_op:null,
            kandidaat_id:'', notities:[]
          });
        });
        if(!nieuw.length){
          err.style.display=''; err.textContent = 'Er bleef niets over om te importeren' + (over?` (${over} dubbele rijen overgeslagen).`:'.');
          return;
        }
        CRM.state.leads.unshift(...nieuw);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('crm_leads').insert(nieuw);
          if(error){ CRM.state.leads.splice(0, nieuw.length); err.style.display=''; err.textContent = 'Opslaan mislukt: ' + error.message; return; }
        }
        CRM.modal.close();
        CRM.toast(`${nieuw.length} sollicitant${nieuw.length===1?'':'en'} geïmporteerd${over?` · ${over} dubbele${over===1?'':' rijen'} overgeslagen`:''}`,'ok');
        S.l.status = ''; tekenBar(); tekenTabs(); tekenLijst(); CRM.navBadges();
      };
    }});
}
/* ═══════════════════════════════════════════════════════════════
   GEDEELDE BORD-LOGICA
   Formules 1-op-1 uit het pijplijnbord (zie PARITEIT-BORD.md).
   Het bord zelf is verhuisd naar js/pijplijn.js; deze helpers
   blijven hier omdat Uitval en de bewerk-drawer ze ook gebruiken.
   Pijplijn krijgt ze via CRM._rcDeel (onderaan).
   ═══════════════════════════════════════════════════════════════ */
const daysTo = d => { const n = CRM.dagenGeleden(d); return n == null ? null : -n; };

/* Verst bereikte funnel-fase; Afgevallen/Gestopt tellen niet als 'ver gekomen'. */
function furthestPhaseIdx(c){
  const eind = CRM.faseIdx('Afgevallen');
  const idx = f => { const i = CRM.faseIdx(f); return i >= eind ? -1 : i; };
  let m = idx(c.fase);
  (c.historie||[]).forEach(x => { const i = idx(x && x.fase); if(i > m) m = i; });
  if(c.geplaatstOp){ const g = idx('Contract getekend'); if(g > m) m = g; }
  return m;
}
/* Soort afvaller: kwam hij ooit tot 'In de wacht' of verder, dan offer afgewezen. */
const afvalTypeVan = c => c.afvalType ||
  (furthestPhaseIdx(c) >= CRM.faseIdx('In de wacht') ? 'offer_afgewezen' : 'niet_gekwalificeerd');

/* Totaal jaarsalaris uit componenten. VT default 8% (zat voorheen impliciet in
   de jaarfactor 12,96). VT rekent over loon incl. ploegentoeslag; EJU en overig
   over het kale jaarloon. Identiek aan het bord — de finance-app rekent hiermee. */
function totaalJaarSalaris(loon, ploeg, vt, eju, overig){
  if(!loon) return null;
  const jr = loon * 12;
  return jr*(1+(ploeg||0)/100)*(1+((vt==null||vt==='')?8:+vt)/100) + jr*((eju||0)/100) + jr*((overig||0)/100);
}

/* Garantie en vervanging (zelfde regels als het bord). */
const isoLoc = dt => dt.toLocaleDateString('sv-SE');
function addMonths(d, n){ if(!d) return ''; const x = new Date(d); x.setMonth(x.getMonth()+(n||0)); return isoLoc(x); }
const withinGarantie = c => { const ref = c.start || c.geplaatstOp; if(!ref || !c.gestoptOp) return true; return c.gestoptOp <= addMonths(ref, c.garantieMnd); };
const owesReplacement = c => c.fase === 'Gestopt' && c.garantieMnd > 0 && withinGarantie(c);
const garantieEnd = c => c.garantieMnd > 0 ? addMonths(c.start || c.geplaatstOp, c.garantieMnd) : '';
const repOf = c => CRM.kandidaten().find(x => x.vervangt === c.id);
const herstartOf = c => CRM.kandidaten().find(x => x.herstartVan === c.id);

const intakeDone = c => !!(c.intake && (c.intake.cijfer
  || String(c.intake.drijfveer||'').trim() || String(c.intake.jaZegt||'').trim()
  || String(c.intake.samenvatting||'').trim()));

const ooSessies = () => CRM.state.ooSessions || [];
const ooSessie  = id => ooSessies().find(s => String(s.id) === String(id));
const sessLeden = id => CRM.kandidaten().filter(c => String(c.ooId) === String(id) && c.fase === 'O&O sessie');

function alles(){ tekenBar(); tekenTabs(); tekenBody(); CRM.navBadges(); }

/* Contract getekend + startdatum bereikt → automatisch Gestart (zoals het bord). */
async function promoteerStarts(){
  const vandaag = CRM.todayISO();
  const rijp = CRM.kandidaten().filter(c => c.fase === 'Contract getekend' && c.start && c.start <= vandaag);
  for(const c of rijp){
    await bewaarKand(c.id, {fase:'Gestart', since:vandaag,
      historie:(c.historie||[]).concat([{fase:'Gestart', op:vandaag}])});
    CRM.logActiviteit('kandidaat', c.id, 'fase', 'Automatisch naar Gestart — startdatum bereikt');
  }
  return rijp.length;
}

/* ─── Fasewissel + poortwachters (regels van het bord) ────────── */
async function bewaarFase(c, fase, extra){
  const vandaag = CRM.todayISO();
  const hist = (c.historie||[]).concat([{fase, op:vandaag}]);
  const patch = Object.assign({fase, historie:hist, since:vandaag}, extra || {});
  if(CRM.PLACED.includes(fase)){
    if(!c.geplaatstOp && patch.geplaatst_op === undefined) patch.geplaatst_op = vandaag;
  } else if(fase !== 'Gestopt' && c.geplaatstOp){
    patch.geplaatst_op = '';                  // teruggezet vóór 'Contract getekend' → geen spookplaatsing
  }
  if(fase === 'Gestopt'){ if(!c.gestoptOp && patch.gestopt_op === undefined) patch.gestopt_op = vandaag; }
  else if(c.gestoptOp) patch.gestopt_op = '';
  /* Haal je iemand terug uít de uitval, dan mag de uitvalreden niet blijven
     plakken — anders staat de kaart weer te lopen én telt hij nog als afvaller
     of stopper mee in de uitvalcijfers. */
  if(fase !== 'Afgevallen' && (c.afvalType || c.afvalCat)){ patch.afval_type = ''; patch.afval_categorie = ''; }
  if(fase !== 'Gestopt' && (c.stopDoor || c.stopCat)){ patch.stop_door = ''; patch.stop_categorie = ''; }
  if(fase !== 'O&O sessie' && c.ooId) patch.oo_id = null;
  const ok = await bewaarKand(c.id, patch);
  if(!ok) return;
  await CRM.logActiviteit('kandidaat', c.id, 'fase', `${c.fase} → ${fase}`);
  CRM.toast(`${c.naam}: ${fase}`,'ok');
  alles();
}

async function faseWissel(id, fase){
  const c = CRM.kandidaat(id);
  if(!c || !fase || CRM.faseIs(c.fase, fase)) return;
  if(UITVAL.includes(fase)) return uitvalForm(c, fase);

  /* Verhuisd van het oude tabblad Voorselectie (knop "→ Voorstellen"):
     iemand aan de klant voorstellen zonder video-intake is een bewuste keuze,
     geen ongelukje. Nu de fase op het bord staat geldt de vraag ook bij
     slepen en bij de fase-picker. */
  if(CRM.faseIs(fase, 'Voorgesteld') && CRM.faseIs(c.fase, 'Intake') && !intakeDone(c)){
    const toch = await CRM.bevestig(`${c.naam} heeft nog geen video-intake gehad`, 'Toch voorstellen aan de klant?');
    if(!toch) return;
  }

  /* Welke poortwachters gelden voor de doelfase? */
  const vraagCall  = CRM.faseIs(fase, 'Intake') && !c.datum;
  const vraagDatum = GESPREK_FASES.includes(fase);
  const vraagVerw  = fase === 'In de wacht';
  const vraagLoon  = CONTRACT_FASES.includes(fase) && !c.maandloon;
  const vraagStart = CRM.PLACED.includes(fase);
  if(!vraagCall && !vraagDatum && !vraagVerw && !vraagLoon && !vraagStart) return bewaarFase(c, fase);

  /* "fee" is een financieel begrip en blijft bij wie geld mag zien; voor het
     team benoemen we waarom het veld nodig is zonder onze omzet erbij te halen. */
  const feeUitleg = CRM.canSeeMoney() ? 'de automatische fee-berekening' : 'de contract- en factuurgegevens';
  const uitleg = vraagStart ? `Startdatum en maandloon zijn verplicht — daar rekenen plaatsingen en ${feeUitleg} mee.`
    : vraagVerw ? 'Zet de verwachte startdatum erbij — dan rekent de forecast ermee.'
    : vraagLoon ? `Het bruto maandloon is nodig voor ${feeUitleg}.`
    : vraagCall ? 'Intake is de videocall-lijst: alleen kandidaten mét geplande call.'
    : 'Zet de afspraak erbij, dan weet iedereen waar hij aan toe is.';
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(c.naam)} → ${h(fase)}</div>
      <p class="sub" style="margin:6px 0 0">${h(uitleg)}</p></div>
    <div class="modal-b">
      ${vraagDatum || vraagCall ? `<div class="f-grid">
          <div class="f-row"><label for="fw_datum">${vraagCall?'Datum videocall':'Datum afspraak'}</label>
            <input type="date" id="fw_datum" value="${h(c.datum||'')}"></div>
          <div class="f-row"><label for="fw_tijd">Tijd</label><input type="time" id="fw_tijd" value="${h(c.tijd||'10:00')}"></div>
        </div>` : ''}
      ${vraagVerw ? `<div class="f-row"><label for="fw_start">Verwachte startdatum</label>
          <input type="date" id="fw_start" value="${h(c.start||'')}"></div>` : ''}
      ${vraagStart ? `<div class="f-row"><label for="fw_start">Startdatum</label>
          <input type="date" id="fw_start" value="${h(c.start||'')}"></div>` : ''}
      ${vraagLoon || vraagStart ? `<div class="f-row"><label for="fw_loon">Bruto maandloon (€)</label>
          <input type="number" id="fw_loon" min="0" step="50" value="${c.maandloon?h(c.maandloon):''}"></div>` : ''}
      <div class="f-row"><label for="fw_actie">Volgende actie (optioneel)</label>
        <input type="text" id="fw_actie" value="${h(c.volgendeActie||'')}" placeholder="Bijv. bevestiging sturen"></div>
      <div class="note err" id="fw_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="fw_ok">Verplaatsen</button></div>`, {onOpen(m){
      m.querySelector('#fw_ok').onclick = async () => {
        const err = m.querySelector('#fw_err');
        const zeg = t => { err.style.display=''; err.textContent = t; };
        const val = id => { const e = m.querySelector('#fw_'+id); return e ? e.value : ''; };
        const extra = {volgende_actie: val('actie').trim() || null};
        if(vraagDatum || vraagCall){
          if(!val('datum')) return zeg(vraagCall ? 'Plan eerst de videocall — zonder datum geen Intake.' : 'Zonder datum weten we niet wanneer het gesprek is.');
          extra.datum = val('datum'); extra.tijd = val('tijd') || '';
        }
        if(vraagVerw){
          if(!val('start')) return zeg('De verwachte startdatum is hier verplicht — de forecast rekent ermee.');
          extra.start = val('start');
        }
        if(vraagStart){
          if(!val('start')) return zeg('Een startdatum is verplicht bij een getekend contract.');
          extra.start = val('start');
        }
        if(vraagLoon || vraagStart){
          if(!val('loon')) return zeg('Vul het bruto maandloon in — nodig voor ' + feeUitleg + '.');
          extra.maandloon = +val('loon');
        }
        let doel = fase;
        if(fase === 'Contract getekend' && extra.start && extra.start <= CRM.todayISO()) doel = 'Gestart';
        CRM.modal.close();
        await bewaarFase(c, doel, extra);
      };
    }});
}
/* ═══════════════════════════════════════════════════════════════
   UITVAL — formulier, tabblad, heraanbieden, vervanging
   ═══════════════════════════════════════════════════════════════ */
/* Uitvalformulier — zelfde structuur als het bord (openUitvalForm):
   soort/door als keuze, reden per categorie, datums bij een stop,
   recyclebaar-vinkje. edit=true werkt gegevens achteraf bij. */
function uitvalForm(c, doel){
  const edit = c.fase === doel;
  const afgevallen = doel === 'Afgevallen';
  const sug = afgevallen ? afvalTypeVan(c) : null;
  const curType = c.afvalType || sug || 'niet_gekwalificeerd';
  const curDoor = c.stopDoor || 'kandidaat';
  const opts = (arr, sel) => arr.map(x => `<option ${x===sel?'selected':''}>${h(x)}</option>`).join('');
  const radio = (naam, val, cur, lbl, sub) => `
    <label class="rc-opt ${cur===val?'sel':''}"><input type="radio" name="${naam}" value="${h(val)}" ${cur===val?'checked':''}>
      <span><b>${h(lbl)}</b>${sub?`<small>${h(sub)}</small>`:''}</span></label>`;
  /* Zonder bruikbare historie is er geen "verst gekomen" — dan viel de kaart
     terug op de huidige fase en stond er letterlijk "verst gekomen: Afgevallen".
     Liever niets tonen dan iets onzinnigs. */
  const verst = CRM.PHASES[furthestPhaseIdx(c)]?.k || '';
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${edit?'Uitvalgegevens bijwerken':h(c.naam)+' → '+h(doel)}</div>
      <p class="sub" style="margin:6px 0 0">${h(c.klant||'—')} · ${h(c.functie||'—')}${afgevallen&&verst?` · verst gekomen: <b>${h(verst)}</b>`:''}</p></div>
    <div class="modal-b">
      ${afgevallen ? `
        <div class="f-row"><label>Soort afvaller</label>
          <div class="rc-radio">
            ${radio('uv_type','niet_gekwalificeerd',curType,'Niet gekwalificeerd','viel af in O&O / gesprekken / meeloopdag')}
            ${radio('uv_type','offer_afgewezen',curType,'Offer afgewezen','was gekwalificeerd, accepteerde het aanbod niet')}
          </div></div>
        <div class="f-row"><label for="uv_cat">Reden</label><select id="uv_cat">${opts(CRM.AFVAL_CATS[curType], c.afvalCat)}</select></div>`
      : `
        <div class="f-row"><label>Gestopt door</label>
          <div class="rc-radio">
            ${radio('uv_door','kandidaat',curDoor,'Kandidaat zelf','zegde zelf op / vertrok')}
            ${radio('uv_door','klant',curDoor,'Klant','beëindigde het contract')}
            ${radio('uv_door','anders',curDoor,'Anders','')}
          </div></div>
        <div class="f-row"><label for="uv_cat">Reden</label><select id="uv_cat">${opts(CRM.STOP_CATS[curDoor], c.stopCat)}</select></div>
        <div class="f-grid">
          <div class="f-row"><label for="uv_datum">Gestopt op</label>
            <input type="date" id="uv_datum" value="${h(c.gestoptOp||CRM.todayISO())}">
            <span class="hint">De maand bepaalt bij welke maand de stop aftelt.</span></div>
          <div class="f-row"><label for="uv_plaats">Plaatsingsdatum</label>
            <input type="date" id="uv_plaats" value="${h(c.geplaatstOp||c.start||'')}">
            <span class="hint">Toen hij tekende — nodig om als stopper te tellen.</span></div>
        </div>`}
      <div class="f-row"><label for="uv_txt">Toelichting (optioneel)</label>
        <input type="text" id="uv_txt" value="${h(c.reden||'')}" placeholder="Korte toelichting — daar leren we van"></div>
      <label class="check"><input type="checkbox" id="uv_rec" ${(c.recyclebaar==null?(afgevallen&&curType==='offer_afgewezen'):c.recyclebaar)?'checked':''}>
        Recyclebaar — later heraanbieden bij een andere klant of functie</label>
      <div class="note err" id="uv_err" style="display:none;margin-top:10px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="uv_ok">${edit?'Bijwerken':afgevallen?'Afmelden':'Stop vastleggen'}</button></div>`, {onOpen(m){
      const cat = m.querySelector('#uv_cat');
      const sync = () => {
        if(afgevallen){
          const t = m.querySelector('input[name=uv_type]:checked').value;
          cat.innerHTML = opts(CRM.AFVAL_CATS[t], null);
          m.querySelector('#uv_rec').checked = c.recyclebaar == null ? t === 'offer_afgewezen' : c.recyclebaar;
        } else {
          const d = m.querySelector('input[name=uv_door]:checked').value;
          cat.innerHTML = opts(CRM.STOP_CATS[d], null);
        }
        CRM.$$('.rc-opt', m).forEach(o => o.classList.toggle('sel', o.querySelector('input').checked));
      };
      CRM.$$('.rc-radio input', m).forEach(r => r.onchange = sync);
      m.querySelector('#uv_ok').onclick = async () => {
        const d = {cat:cat.value, txt:m.querySelector('#uv_txt').value.trim(), rec:m.querySelector('#uv_rec').checked};
        if(!d.cat){ const e = m.querySelector('#uv_err'); e.style.display=''; e.textContent='Kies een reden.'; return; }
        if(afgevallen) d.type = m.querySelector('input[name=uv_type]:checked').value;
        else {
          d.door = m.querySelector('input[name=uv_door]:checked').value;
          d.datum = m.querySelector('#uv_datum').value || CRM.todayISO();
          d.plaats = m.querySelector('#uv_plaats').value;
        }
        CRM.modal.close();
        if(!afgevallen && !d.plaats){
          const toch = await CRM.bevestig('Geen plaatsingsdatum ingevuld',
            'Dan telt deze stop niet mee bij "gestopt deze maand". Toch doorgaan?');
          if(!toch) return uitvalForm(c, doel);
        }
        await pasUitvalToe(c, doel, d, edit);
      };
    }});
}

async function pasUitvalToe(c, doel, d, edit){
  const vandaag = CRM.todayISO();
  const patch = {};
  if(!edit){
    patch.fase = doel; patch.since = vandaag;
    patch.historie = (c.historie||[]).concat([{fase:doel, op:vandaag}]);
    if(doel === 'Afgevallen') patch.geplaatst_op = '';         // geen spookplaatsing
    if(c.ooId) patch.oo_id = null;
  }
  if(doel === 'Afgevallen'){
    patch.afval_type = d.type; patch.afval_categorie = d.cat;
    patch.stop_door = ''; patch.stop_categorie = '';
    /* Een afvaller heeft per definitie geen stopdatum: hij is nooit geplaatst.
       Bleef die staan (bijwerken van een oude kaart, of import), dan telde de
       kaart in twee werelden mee. Ook bij bijwerken wissen we hem dus. */
    patch.gestopt_op = '';
  } else {
    patch.stop_door = d.door; patch.stop_categorie = d.cat;
    patch.gestopt_op = d.datum || c.gestoptOp || vandaag;
    if(d.plaats) patch.geplaatst_op = d.plaats;
    patch.afval_type = ''; patch.afval_categorie = '';
  }
  patch.reden = d.txt || ''; patch.recyclebaar = !!d.rec;
  const ok = await bewaarKand(c.id, patch);
  if(!ok) return;
  await CRM.logActiviteit('kandidaat', c.id, edit ? 'notitie' : 'fase',
    `${edit ? 'Uitvalgegevens bijgewerkt' : c.fase + ' → ' + doel}: ${d.cat}${d.txt ? ' — ' + d.txt : ''}`);
  if(d.txt) CRM.verwerkTags(d.txt, 'kandidaat', c.id);
  CRM.toast(`${c.naam} — ${doel === 'Afgevallen' ? AFVAL_LBL[d.type||afvalTypeVan(c)] : 'gestopt (' + STOP_LBL[d.door] + ')'}`, 'ok');
  alles();
}

/* ─── Tabblad Uitval (openUitval van het bord) ────────────────── */
function tekenUitval(el){
  const K = CRM.kandidaten();
  const afg = K.filter(c => c.fase === 'Afgevallen');
  const stp = K.filter(c => c.fase === 'Gestopt');
  const nk = afg.filter(c => afvalTypeVan(c) === 'niet_gekwalificeerd');
  const oa = afg.filter(c => afvalTypeVan(c) === 'offer_afgewezen');
  /* repOf/herstartOf lopen elk zelf door álle kandidaten. Per rij twee keer
     aanroepen liep bij 350 kandidaten op tot tienduizenden vergelijkingen —
     daarom één keer indexeren. */
  const vervangerVan = {}, herstartVanaf = {};
  K.forEach(x => {
    if(x.vervangt)    vervangerVan[String(x.vervangt)]    = x;
    if(x.herstartVan) herstartVanaf[String(x.herstartVan)] = x;
  });
  /* Offer-acceptatie: iedereen die ooit 'In de wacht' of verder kwam, óf als
     offer-afwijzer is gemarkeerd. Vervangers tellen niet mee (geen dubbeling).
     Een lege fase (import uit het oude ATS) is géén positie in de funnel: die
     kandidaten hebben nooit een aanbod gehad en mogen dit percentage dus niet
     kleuren — ook niet als er per ongeluk een geplaatst-datum op staat. */
  const offerIdx = CRM.faseIdx('In de wacht');
  const offers = K.filter(c => c.fase && (furthestPhaseIdx(c) >= offerIdx || c.afvalType === 'offer_afgewezen') && !c.vervangt);
  const geacc = offers.filter(c => c.geplaatstOp || CRM.PLACED.includes(c.fase)).length;
  const accPct = offers.length ? Math.round(geacc / offers.length * 100) : null;
  const stopDuur = b => stp.filter(c => {
    const ref = c.start || c.geplaatstOp;
    if(!ref || !c.gestoptOp) return false;
    const dgn = Math.round((new Date(c.gestoptOp) - new Date(ref)) / 864e5);
    return b === '30' ? dgn <= 30 : b === '90' ? dgn > 30 && dgn <= 90 : dgn > 90;
  }).length;
  const topRedenen = (arr, fn) => {
    const per = {};
    arr.forEach(c => { const r = fn(c) || '—'; per[r] = (per[r]||0) + 1; });
    return Object.entries(per).sort((a,b) => b[1]-a[1]).slice(0,3).map(([r,n]) => `${h(r)} (${n})`).join(' · ') || '—';
  };
  /* Datum van uitval: bij een stop de stopdatum, bij een afvaller de dag dat hij
     op Afgevallen kwam (since). Een afvaller met een stopdatum is een fout in de
     data — die datum mag hier niet de sortering of de kolom sturen. */
  const uitvalDatum = c => (c.fase === 'Gestopt' ? (c.gestoptOp || c.since) : c.since) || '';
  const scheef = c => c.fase === 'Afgevallen' && !!c.gestoptOp;
  const f = S.u.f;
  const lijst = (f==='nk' ? nk : f==='oa' ? oa : f==='stop' ? stp : afg.concat(stp)).slice()
    .sort((a,b) => String(uitvalDatum(b)).localeCompare(String(uitvalDatum(a))));
  const nScheef = afg.filter(scheef).length;
  const tabs = [['alles',`Alles (${afg.length+stp.length})`],['nk',`Niet gekwalificeerd (${nk.length})`],
                ['oa',`Offer afgewezen (${oa.length})`],['stop',`Gestopt (${stp.length})`]];

  const rij = c => {
    const isStop = c.fase === 'Gestopt';
    const herstart = herstartVanaf[String(c.id)];
    const rep = isStop ? vervangerVan[String(c.id)] : null;
    const lbl = isStop
      ? `Gestopt ${STOP_LBL[c.stopDoor]||'—'}${c.stopCat?' · '+h(c.stopCat):''}`
      : `${AFVAL_LBL[afvalTypeVan(c)]}${c.afvalCat?' · '+h(c.afvalCat):''}${c.afvalType?'':' <span class="chip" title="Automatisch bepaald uit de fase-historie">auto</span>'}`;
    const verv = isStop ? (rep
        ? (CRM.PLACED.includes(rep.fase)
            ? `<span class="chip green">vervangen door ${h(rep.naam)}</span>`
            : `<span class="chip amber">vervanger: ${h(rep.naam)} · ${h(rep.fase)}</span>`)
        : owesReplacement(c)
            ? `<span class="chip red">vervanging nodig</span> <button class="btn ghost sm" data-rep="${h(c.id)}">+ Vervanger</button>`
            : `<span class="meta">buiten garantie</span>`)
      : (c.vervangt ? '<span class="meta">was zelf vervanger</span>' : '');
    return `<tr>
      <td><b>${h(c.naam)}</b><div class="rowsub">${h(c.klant||'—')} · ${h(c.functie||'—')}</div></td>
      <td>${lbl}${c.reden?`<div class="rowsub">"${h(c.reden)}"</div>`:''}
        ${scheef(c)?`<div><span class="chip amber" title="Deze kaart staat op Afgevallen maar heeft nog een stopdatum (${h(CRM.fmtDate(c.gestoptOp))}). Een afvaller is nooit geplaatst geweest — werk hem bij, dan wordt de datum gewist.">stopdatum op een afvaller</span></div>`:''}
        ${herstart?`<div><span class="chip purple" title="Nieuw traject loopt op een nieuwe kaart — deze uitkomst blijft meetellen">heraangeboden bij ${h(herstart.klant)}</span></div>`:''}</td>
      <td>${h(CRM.PHASES[furthestPhaseIdx(c)]?.k||'—')}</td>
      <td class="n"><span class="num">${h(CRM.fmtDateShort(uitvalDatum(c))||'—')}</span></td>
      <td>${verv}</td>
      <td class="n" style="white-space:nowrap">
        <button class="chip btn-like ${c.recyclebaar?'on':''}" data-uvrec="${h(c.id)}" title="Recyclebaar aan/uit">recyclebaar${c.recyclebaar?' ✓':''}</button>
        ${c.recyclebaar && !herstart ? `<button class="btn sm" data-react="${h(c.id)}">Opnieuw aanbieden</button>` : ''}
        <button class="btn ghost sm" data-uvedit="${h(c.id)}" title="Soort en reden achteraf bijwerken">Bijwerken</button>
        <button class="btn ghost sm" data-uvkaart="${h(c.id)}" title="Volledige kaart: fase en datums corrigeren">Corrigeren</button>
      </td></tr>`;
  };

  el.innerHTML = `<div class="rc-pad">
    <div class="grid c4" style="margin-bottom:14px">
      ${CRM.ui.kpi('Totaal uitval', afg.length+stp.length, `${nk.length} niet gekwalificeerd · ${oa.length} offer afgewezen`)}
      ${CRM.ui.kpi('Offer-acceptatie', accPct==null?'—':accPct+'%', `${geacc} van ${offers.length} kwamen tot een aanbod`, accPct!=null&&accPct<60?'':'')}
      ${CRM.ui.kpi('Gestopt na plaatsing', stp.length, `≤30 dgn: ${stopDuur('30')} · 31–90: ${stopDuur('90')} · >90: ${stopDuur('+')}`)}
      ${CRM.ui.kpi('Recyclebare pool', afg.concat(stp).filter(c=>c.recyclebaar).length, 'kandidaten om her aan te bieden')}
    </div>
    <div class="note info" style="margin-bottom:14px">Top-redenen — niet gekwalificeerd: <b>${topRedenen(nk, c=>c.afvalCat)}</b> ·
      offer afgewezen: <b>${topRedenen(oa, c=>c.afvalCat)}</b> · gestopt: <b>${topRedenen(stp, c=>c.stopCat)}</b>.
      Offer-afwijzers zijn volledig gekwalificeerd — je beste pool voor heraanbieden.</div>
    ${nScheef ? `<div class="note warn" style="margin-bottom:14px">${nScheef} ${nScheef===1?'kaart staat':'kaarten staan'} op <b>Afgevallen</b>
      maar ${nScheef===1?'heeft':'hebben'} nog een stopdatum. Dat kan niet allebei: een afvaller is nooit geplaatst geweest.
      Klik bij zo'n rij op <b>Bijwerken</b> en sla op — dan wordt de stopdatum gewist.</div>` : ''}
    <div class="rc-chips">${tabs.map(([k,l]) => `<button class="chip btn-like ${f===k?'on':''}" data-uvtab="${k}">${l}</button>`).join('')}</div>
    <div class="tblwrap"><table class="tbl">
      <thead><tr><th>Kandidaat</th><th>Uitval</th><th>Verst gekomen</th><th class="n">Datum</th><th>Vervanging</th><th class="n">Acties</th></tr></thead>
      <tbody>${lijst.slice(0,200).map(rij).join('') || `<tr><td colspan="6"><span class="meta">Niets in deze categorie.</span></td></tr>`}</tbody>
    </table></div>
    ${lijst.length > 200 ? `<p class="meta" style="margin:10px 2px">De 200 meest recente van ${lijst.length} worden getoond.</p>` : ''}
    <p class="meta" style="margin:10px 2px">Heraanbieden maakt altijd een <b>nieuwe kaart</b> in Intake; de oude blijft als
      afvaller of stopper geregistreerd — die uitkomst blijft in alle cijfers en in de finance-app meetellen.</p>
  </div>`;

  CRM.$$('[data-uvtab]', el).forEach(b => b.onclick = () => { S.u.f = b.dataset.uvtab; tekenUitval(el); });
  CRM.$$('[data-uvrec]', el).forEach(b => b.onclick = async () => {
    const c = CRM.kandidaat(b.dataset.uvrec); if(!c) return;
    await bewaarKand(c.id, {recyclebaar: !c.recyclebaar});
    tekenUitval(el);
  });
  CRM.$$('[data-react]', el).forEach(b => b.onclick = () => heractiveren(b.dataset.react));
  CRM.$$('[data-uvedit]', el).forEach(b => b.onclick = () => { const c = CRM.kandidaat(b.dataset.uvedit); if(c) uitvalForm(c, c.fase); });
  CRM.$$('[data-uvkaart]', el).forEach(b => b.onclick = () => CRM.ga('kandidaten',{id:b.dataset.uvkaart}));
  CRM.$$('[data-rep]', el).forEach(b => b.onclick = () => {
    const s = CRM.kandidaat(b.dataset.rep); if(!s) return;
    nieuweKandidaatModal({klant:s.klant, functie:s.functie, type:s.type, vervangt:s.id, vervangtNaam:s.naam});
  });
}

/* ─── Heraanbieden (openReactivate): NIEUWE kaart, oude blijft ── */
function heractiveren(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const bestaand = herstartOf(c);
  if(bestaand) return CRM.toast(`${c.naam} is al heraangeboden bij ${bestaand.klant}`, 'err');
  const klanten = Array.from(new Set(
    (CRM.state.clients||[]).map(x=>x.naam).concat((CRM.state.vacs||[]).map(v=>v.klant)).filter(Boolean))).sort();
  const vacsVan = k => (CRM.state.vacs||[]).filter(v => v.klant === k);
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Opnieuw aanbieden</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)} — eerder: ${h(c.klant||'—')} · ${h(c.functie||'—')}${c.reden?' ('+h(c.reden)+')':''}</p></div>
    <div class="modal-b">
      <div class="note info">Er komt een <b>nieuwe kaart</b> in Intake. De oude kaart blijft onaangeroerd op
        ${h(c.fase)} staan — die uitkomst blijft in alle cijfers en in de finance-app meetellen.</div>
      <div class="f-grid" style="margin-top:14px">
        <div class="f-row"><label for="ra_klant">Klant</label>
          <select id="ra_klant">${klanten.map(k=>`<option ${k===c.klant?'selected':''}>${h(k)}</option>`).join('')}</select></div>
        <div class="f-row"><label for="ra_func">Vacature</label><select id="ra_func"></select></div>
      </div>
      <div class="note err" id="ra_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ra_ok">Nieuwe kaart aanmaken</button></div>`, {onOpen(m){
      const kSel = m.querySelector('#ra_klant'), fSel = m.querySelector('#ra_func');
      const vul = () => {
        const fs = vacsVan(kSel.value);
        fSel.innerHTML = fs.length
          ? fs.map(v=>`<option value="${h(v.id)}" ${v.functie===c.functie?'selected':''}>${h(v.functie)}</option>`).join('')
          : '<option value="">— geen vacature bij deze klant —</option>';
      };
      kSel.onchange = vul; vul();
      m.querySelector('#ra_ok').onclick = async () => {
        const v = vacById(fSel.value);
        if(!v){ const e = m.querySelector('#ra_err'); e.style.display=''; e.textContent='Kies een vacature — zonder vacature geen traject.'; return; }
        const vandaag = CRM.todayISO(), nu = new Date().toISOString();
        const nieuw = {
          id:CRM.uid(), naam:c.naam, klant:v.klant, functie:v.functie, type:v.type||'',
          fase:'Intake', datum:'', tijd:'', start:'', since:vandaag, bron:c.bron||'',
          geplaatstOp:'', gestoptOp:'', garantieMnd:0,
          maandloon:c.maandloon, toeslagPct:c.toeslagPct, vtPct:c.vtPct, ejuPct:c.ejuPct, overigPct:c.overigPct,
          reden:'', rec:c.rec || CRM.me(), note:'', ooId:null, vervangt:'', volgendeActie:'', actieDatum:null, noShows:0,
          telefoon:c.telefoon, email:c.email, woonplaats:c.woonplaats, vacatureId:v.id, cv:c.cv||null,
          ster:c.ster, beschikbaar:c.beschikbaar, ploegen:c.ploegen, talen:c.talen, rijbewijs:c.rijbewijs, vervoer:c.vervoer,
          notities:[{op:nu, door:CRM.me(), tekst:`Heraangeboden vanuit ${c.klant||'—'} (${c.fase==='Gestopt'?'gestopt':'afgevallen'}${c.reden?': '+c.reden:''})`}],
          historie:[{fase:'Intake', op:vandaag}],
          intake:c.intake||null, herstartVan:c.id,
          afvalType:'', afvalCat:'', stopDoor:'', stopCat:'', recyclebaar:null
        };
        const rijNieuw = CRM.candToRow(nieuw);
        CRM.state.cands.unshift(rijNieuw);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('candidates').insert(rijNieuw);
          if(error){ CRM.state.cands.shift(); return CRM.fout('Opslaan mislukt', error); }
        }
        /* Alleen een notitie op de oude kaart — fase, datums en uitkomst blijven staan. */
        await bewaarKand(c.id, {notities:(c.notities||[]).concat([{op:nu, door:CRM.me(),
          tekst:`Heraangeboden bij ${v.klant} — nieuw traject op een nieuwe kaart; deze kaart blijft als ${c.fase==='Gestopt'?'stopper':'afvaller'} geregistreerd`}])});
        await CRM.logActiviteit('kandidaat', nieuw.id, 'systeem', `Nieuwe kaart via heraanbieden — eerder ${c.fase.toLowerCase()} bij ${c.klant||'—'}`);
        await CRM.logActiviteit('kandidaat', c.id, 'systeem', `Heraangeboden bij ${v.klant} (nieuwe kaart, oude uitkomst blijft staan)`);
        CRM.modal.close();
        alles(); tekenActies();
        /* De nieuwe kaart staat op het bord (kolom Intake), dus wijs daarheen. */
        toastLink(`${c.naam} — nieuwe kaart in Intake bij ${v.klant}; oude blijft als ${c.fase==='Gestopt'?'stopper':'afvaller'} tellen`,
          'Naar de pijplijn →', () => CRM.ga('pijplijn'));
      };
    }});
}

/* ─── Nieuwe kandidaat / vervanger (poortwachter: call + bron) ── */
function nieuweKandidaatModal(prefill){
  prefill = prefill || {};
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b)=>vacLabel(a).localeCompare(vacLabel(b)));
  const voorVac = prefill.klant ? vacs.find(v => v.klant===prefill.klant && v.functie===prefill.functie) : null;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${prefill.vervangt?'Vervanger aanmaken':'Nieuwe kandidaat'}</div>
      <p class="sub" style="margin:6px 0 0">${prefill.vervangt
        ? `Vervanger voor ${h(prefill.vervangtNaam||'')} — telt niet dubbel in het target.`
        : 'Komt in Intake: de eerste kolom op het bord. Plan de videocall er meteen bij.'}</p></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label for="nk_naam">Naam</label><input type="text" id="nk_naam"></div>
        <div class="f-row"><label for="nk_tel">Telefoon</label><input type="tel" id="nk_tel"></div>
        <div class="f-row"><label for="nk_plaats">Woonplaats</label><input type="text" id="nk_plaats"></div>
        <div class="f-row"><label for="nk_bron">Bron</label>
          <select id="nk_bron"><option value="">— kies —</option>${KAND_BRONNEN.map(b=>`<option>${h(b)}</option>`).join('')}</select></div>
      </div>
      <div class="f-row"><label for="nk_vac">Vacature</label>
        <select id="nk_vac"><option value="">— kies de vacature —</option>
          ${vacs.map(v=>`<option value="${h(v.id)}" ${voorVac&&String(voorVac.id)===String(v.id)?'selected':''}>${h(vacLabel(v))}</option>`).join('')}</select></div>
      <div class="f-grid">
        <div class="f-row"><label for="nk_datum">Datum videocall</label><input type="date" id="nk_datum"></div>
        <div class="f-row"><label for="nk_tijd">Tijd</label><input type="time" id="nk_tijd" value="10:00"></div>
        <div class="f-row"><label for="nk_rec">Recruiter</label><input type="text" id="nk_rec" value="${h(CRM.me())}"></div>
      </div>
      <div class="note err" id="nk_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="nk_ok">Toevoegen</button></div>`, {onOpen(m){
      m.querySelector('#nk_ok').onclick = async () => {
        const g = id => m.querySelector('#nk_'+id).value.trim();
        const err = m.querySelector('#nk_err');
        const zeg = t => { err.style.display=''; err.textContent = t; };
        if(!g('naam')) return zeg('Een naam is het minimum.');
        if(!g('bron')) return zeg('Vul de bron in — nodig voor kanaal-inzicht.');
        const v = vacById(m.querySelector('#nk_vac').value);
        if(!v) return zeg('Kies de vacature.');
        if(!g('datum')) return zeg('Plan eerst de videocall — alleen kandidaten mét call komen in Intake.');
        const vandaag = CRM.todayISO();
        const cand = {
          id:CRM.uid(), naam:g('naam'), telefoon:g('tel'), woonplaats:g('plaats'),
          functie:v.functie, klant:v.klant, type:prefill.type || v.type || 'W&S',
          bron:g('bron'), fase:'Intake', datum:g('datum'), tijd:g('tijd')||'',
          since:vandaag, rec:g('rec') || CRM.me(), vacatureId:v.id,
          vervangt:prefill.vervangt || '', historie:[{fase:'Intake', op:vandaag}],
          notities: prefill.vervangt ? [{op:new Date().toISOString(), door:CRM.me(),
            tekst:`Aangemaakt als vervanger voor ${prefill.vervangtNaam||prefill.vervangt}`}] : []
        };
        const rijC = CRM.candToRow(cand);
        CRM.state.cands.unshift(rijC);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('candidates').insert(rijC);
          if(error){ CRM.state.cands.shift(); return zeg('Opslaan mislukt: ' + error.message); }
        }
        await CRM.logActiviteit('kandidaat', cand.id, 'systeem',
          prefill.vervangt ? `Aangemaakt als vervanger voor ${prefill.vervangtNaam||''}` : `Handmatig toegevoegd — videocall ${CRM.fmtDate(cand.datum)} ${cand.tijd}`);
        CRM.modal.close();
        alles();   // ververst ook het bord als de Pijplijn openstaat (zie tekenBody)
        toastLink(`${cand.naam} staat in Intake`, 'Open kandidaatkaart →', () => CRM.ga('kandidaten',{id:cand.id}));
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   BEWERK-DRAWER — volledige kaartbewerking (pariteit met openEdit)
   Fase, afspraak, contractgegevens, salaris-componenten met live
   totaal-jaarsalaris, vervanging, no-show en notities.
   ═══════════════════════════════════════════════════════════════ */
function snelBewerk(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const v = vacById(c.vacatureId);
  const kanIntake = CRM.faseIn(c.fase, ['Intake','Voorgesteld']);
  const toonDatums = CRM.PLACED.includes(c.fase) || UITVAL.includes(c.fase) || !!c.geplaatstOp || !!c.gestoptOp;
  const sess = c.ooId ? ooSessie(c.ooId) : null;
  const gestopten = CRM.kandidaten().filter(x => x.fase === 'Gestopt' && x.id !== c.id);
  const bronnen = Array.from(new Set(KAND_BRONNEN.concat(c.bron ? [c.bron] : []).filter(Boolean)));
  const tijdlijn = (c.notities||[]).map(n => ({titel:n.door||'Notitie', wanneer:CRM.fmtDate(n.op||n.t), tekst:n.tekst}))
    .concat(CRM.activiteitenVoor('kandidaat', c.id).map(a => ({
      titel:a.door||'Systeem', wanneer:CRM.fmtDate(a.op), tekst:a.tekst})));

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="flex:1;min-width:0">
        <div class="h2">${h(c.naam)}</div>
        <div class="sub">${h(c.functie||'—')}${c.klant?' @ '+h(c.klant):''}${c.woonplaats?' · '+h(c.woonplaats):''}</div>
        <div class="row tight" style="margin-top:8px">
          <span class="chip"><i class="dot" style="background:${c.fase?CRM.faseKleur(c.fase):'var(--line-2)'}"></i>${h(CRM.faseNorm(c.fase) || 'geen fase')}</span>
          ${c.rec?`<span class="chip">${h(c.rec)}</span>`:''}
          ${c.herstartVan?`<span class="chip purple" title="Heraangeboden — eerdere uitkomst staat op de oude kaart">herstart</span>`:''}
          ${c.vervangt?`<span class="chip blue">vervanger</span>`:''}
          ${sess?`<span class="chip">O&amp;O ${h(CRM.fmtDateShort(sess.datum))} · ${h(sess.klant)}</span>`:''}
          ${c.intake && c.intake.cijfer!=null?`<span class="chip ${c.intake.cijfer<7?'amber':'green'} num">Intake ${h(c.intake.cijfer)}/10</span>`:''}
          ${c.noShows?`<span class="chip red num">${h(c.noShows)}× no-show</span>`:''}
        </div>
      </div>
      <button class="btn sub x" data-close>✕</button>
    </div>
    <div class="drawer-b">
      <div class="card"><div class="card-h"><div class="h2">Traject</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="sb_fase">Fase</label>
              <select id="sb_fase">${
                /* Zonder fase (import uit het oude ATS) hoort er ook een lege
                   keuze te staan. Anders kiest de browser stilzwijgend de
                   eerste optie en zou opslaan de kandidaat zomaar de pijplijn
                   in duwen — of het formulier onbruikbaar blokkeren. */
                c.fase ? '' : `<option value="" selected>— nog geen fase —</option>`
              }${CRM.PHASES.map(p=>`<option ${CRM.faseIs(c.fase,p.k)?'selected':''}>${h(p.k)}</option>`).join('')}</select>
              ${c.fase ? '' : `<span class="hint">Deze kandidaat komt uit het oude ATS en staat nergens op het bord. Kies een fase zodra je het traject start.</span>`}</div>
            <div class="f-row"><label for="sb_type">Type</label>
              <select id="sb_type"><option value="">—</option>
                <option ${c.type==='W&S'?'selected':''}>W&amp;S</option><option ${c.type==='Flex'?'selected':''}>Flex</option></select></div>
            <div class="f-row"><label for="sb_bron">Bron</label>
              <select id="sb_bron"><option value="">— kies —</option>
                ${bronnen.map(b=>`<option ${c.bron===b?'selected':''}>${h(b)}</option>`).join('')}</select></div>
            <div class="f-row"><label for="sb_rec">Recruiter</label><input type="text" id="sb_rec" value="${h(c.rec||'')}"></div>
            <div class="f-row"><label for="sb_datum">Afspraakdatum</label><input type="date" id="sb_datum" value="${h(c.datum||'')}"></div>
            <div class="f-row"><label for="sb_tijd">Tijd</label><input type="time" id="sb_tijd" value="${h(c.tijd||'')}"></div>
            <div class="f-row"><label for="sb_actiedat">Actiedatum</label><input type="date" id="sb_actiedat" value="${h(c.actieDatum||'')}"></div>
          </div>
          <div class="f-row"><label for="sb_actie">Volgende actie</label>
            <input type="text" id="sb_actie" value="${h(c.volgendeActie||'')}" placeholder="Bijv. bellen over de meeloopdag"></div>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Contract &amp; plaatsing</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="sb_start">Startdatum</label><input type="date" id="sb_start" value="${h(c.start||'')}">
              <span class="hint">Bij Meeloopdag/Offer: de verwachte start.</span></div>
            <div class="f-row"><label for="sb_garantie">Garantie (maanden)</label>
              <input type="number" id="sb_garantie" min="0" max="12" value="${h(c.garantieMnd||0)}"></div>
            ${toonDatums?`
            <div class="f-row"><label for="sb_plaats">Geplaatst op (getekend)</label><input type="date" id="sb_plaats" value="${h(c.geplaatstOp||'')}"></div>
            <div class="f-row"><label for="sb_stopdat">Gestopt op</label><input type="date" id="sb_stopdat" value="${h(c.gestoptOp||'')}"></div>`:''}
          </div>
          <div class="f-row"><label for="sb_verv">Vervangt (gestopte kandidaat)</label>
            <select id="sb_verv"><option value="">—</option>
              ${gestopten.map(x=>`<option value="${h(x.id)}" ${c.vervangt===x.id?'selected':''}>${h(x.naam)} (${h(x.klant||'—')})</option>`).join('')}</select>
            <span class="hint">Een vervanger telt niet dubbel in het target.</span></div>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Salaris</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="sb_loon">Bruto maandloon (€)</label>
              <input type="number" id="sb_loon" min="0" step="50" value="${c.maandloon!=null?h(c.maandloon):''}"></div>
            <div class="f-row"><label for="sb_toeslag">Ploegentoeslag (%)</label>
              <input type="number" id="sb_toeslag" min="0" max="100" step="0.5" value="${c.toeslagPct!=null?h(c.toeslagPct):''}"></div>
            <div class="f-row"><label for="sb_vt">Vakantietoeslag (%)</label>
              <input type="number" id="sb_vt" min="0" max="100" step="0.5" placeholder="8" value="${c.vtPct!=null?h(c.vtPct):''}">
              <span class="hint">Leeg = 8% (zoals de oude jaarfactor 12,96).</span></div>
            <div class="f-row"><label for="sb_eju">Eindejaarsuitkering (%)</label>
              <input type="number" id="sb_eju" min="0" max="100" step="0.5" value="${c.ejuPct!=null?h(c.ejuPct):''}"></div>
            <div class="f-row"><label for="sb_overig">Overig (%)</label>
              <input type="number" id="sb_overig" min="0" max="100" step="0.5" value="${c.overigPct!=null?h(c.overigPct):''}"></div>
          </div>
          <div class="rc-totsal" id="sb_totsal"></div>
        </div></div>

      ${v?`<div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Gekoppelde vacature</div></div>
        <div class="card-b"><div class="rc-kv"><span class="label">Vacature</span><span>${h(v.functie)}</span></div>
          <div class="rc-kv"><span class="label">Klant</span><span>${h(v.klant)}</span></div>
          <div class="rc-kv"><span class="label">Locatie</span><span>${h(v.locatie||'—')}</span></div></div></div>`:''}

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Notitie</div></div>
        <div class="card-b">
          <div class="f-row"><label for="sb_note">Notitie toevoegen</label>
            <textarea id="sb_note" placeholder="Kort en feitelijk"></textarea>
            <span class="hint">@naam om een collega te melden</span></div>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Geschiedenis</div></div>
        <div class="card-b">${CRM.ui.tijdlijn(tijdlijn)}</div></div>
      <div class="note err" id="sb_err" style="display:none;margin-top:14px"></div>
    </div>
    <!-- flex-wrap: op 375px past deze rij knoppen niet naast elkaar; zonder
         wrap liep "Volledige kandidaatkaart" buiten beeld en was hij op een
         telefoon niet te bereiken. -->
    <div class="drawer-f" style="flex-wrap:wrap;row-gap:8px">
      <button class="btn" id="sb_ok">Opslaan</button>
      <button class="btn ghost" id="sb_plan">Inplannen</button>
      ${kanIntake?`<button class="btn ghost" id="sb_intake">Video-intake</button>`:''}
      <button class="btn ghost" id="sb_noshow" title="Afspraak wissen en no-show tellen">No-show</button>
      <div class="spacer"></div>
      <button class="btn ghost" id="sb_volledig">Volledige kandidaatkaart →</button>
    </div>`, {onOpen(dr){
      const upd = () => {
        const el = dr.querySelector('#sb_totsal'); if(!el) return;
        const loon = +dr.querySelector('#sb_loon').value || 0;
        if(!loon){ el.innerHTML = '<span class="meta">Vul het maandloon in voor het totaal-jaarsalaris.</span>'; return; }
        const tot = totaalJaarSalaris(loon, +dr.querySelector('#sb_toeslag').value || 0,
          dr.querySelector('#sb_vt').value, +dr.querySelector('#sb_eju').value || 0, +dr.querySelector('#sb_overig').value || 0);
        /* Het salaris van de kandidaat is een arbeidsvoorwaarde en mag het team
           zien (zelfde afweging als op de kandidaatkaart). De fee is dat níet —
           dat is onze omzet. Die verwijzing tonen we daarom alleen aan wie
           financiële cijfers mag zien. */
        el.innerHTML = `Totaal jaarsalaris ≈ <b class="num">${CRM.euro(Math.round(tot))}</b>
          <span class="meta">incl. toeslagen${CRM.canSeeMoney() ? ' — basis voor de fee in de finance-app' : ''}</span>`;
      };
      ['loon','toeslag','vt','eju','overig'].forEach(k => dr.querySelector('#sb_'+k).oninput = upd);
      upd();
      dr.querySelector('#sb_volledig').onclick = () => { CRM.drawer.close(); CRM.ga('kandidaten',{id:c.id}); };
      dr.querySelector('#sb_plan').onclick = () => planAfspraak(c);
      const ib = dr.querySelector('#sb_intake'); if(ib) ib.onclick = () => intakeForm(c.id);
      dr.querySelector('#sb_noshow').onclick = async () => {
        if(await noShow(c.id)) snelBewerk(c.id);
      };
      dr.querySelector('#sb_ok').onclick = async () => {
        const g = id => { const e = dr.querySelector('#sb_'+id); return e ? e.value : ''; };
        const err = dr.querySelector('#sb_err');
        const zeg = t => { err.style.display=''; err.textContent = t; err.scrollIntoView({block:'nearest'}); };
        const doel = g('fase');
        const patch = {
          datum:g('datum')||'', tijd:g('tijd')||'',
          volgende_actie:g('actie').trim()||null, actie_datum:g('actiedat')||null,
          type:g('type').replace('&amp;','&')||'', bron:g('bron')||'', rec:g('rec').trim(),
          start:g('start')||'', garantie_mnd:+g('garantie')||0, vervangt:g('verv')||'',
          maandloon:g('loon')!==''?+g('loon'):null, toeslag_pct:g('toeslag')!==''?+g('toeslag'):null,
          vt_pct:g('vt')!==''?+g('vt'):null, eju_pct:g('eju')!==''?+g('eju'):null,
          overig_pct:g('overig')!==''?+g('overig'):null
        };
        if(toonDatums){ patch.geplaatst_op = g('plaats')||''; patch.gestopt_op = g('stopdat')||''; }
        /* Poortwachters — zelfde regels als het bord. */
        if(!patch.bron) return zeg('Vul de bron in (Meta/Indeed/referral…) — nodig voor kanaal-inzicht.');
        if(CRM.faseIs(doel,'Intake') && !CRM.faseIs(c.fase,'Intake') && !patch.datum)
          return zeg('Plan eerst de videocall: vul de afspraakdatum in — alleen kandidaten mét call komen in Intake.');
        if(GESPREK_FASES.includes(doel) && !CRM.faseIs(doel, c.fase) && !patch.datum)
          return zeg('Zet de afspraakdatum erbij — zonder datum weten we niet wanneer het gesprek is.');
        if(doel === 'In de wacht' && !patch.start)
          return zeg('Zet de verwachte startdatum erbij — dan rekent de forecast ermee.');
        if(CONTRACT_FASES.includes(doel) && !patch.maandloon)
          return zeg('Vul het bruto maandloon in — nodig voor ' +
            (CRM.canSeeMoney() ? 'de automatische fee' : 'de contract- en factuurgegevens') + '.');
        if(CRM.PLACED.includes(doel) && !patch.start)
          return zeg('Vul de startdatum in — die bepaalt de eerste factuurdatum.');
        const note = g('note').trim();
        if(note) patch.notities = (c.notities||[]).concat([{op:new Date().toISOString(), door:CRM.me(), tekst:note}]);
        const ok = await bewaarKand(c.id, patch);
        if(!ok) return;
        if(note){
          await CRM.logActiviteit('kandidaat', c.id, 'notitie', note);
          CRM.verwerkTags(note, 'kandidaat', c.id);
        }
        if(!CRM.faseIs(doel, c.fase)){
          CRM.drawer.close();
          const na = CRM.kandidaat(c.id);
          if(UITVAL.includes(doel)) return uitvalForm(na, doel);
          let ef = doel;
          if(CRM.PLACED.includes(doel) && patch.start) ef = patch.start <= CRM.todayISO() ? 'Gestart' : 'Contract getekend';
          return bewaarFase(na, ef);
        }
        /* Correctieflow: kaart blijft Afgevallen/Gestopt maar mist de categorie →
           route de wijziging alsnog door het uitvalformulier. */
        const na = CRM.kandidaat(c.id);
        if(UITVAL.includes(doel) && !(doel === 'Afgevallen' ? na.afvalCat : na.stopCat)){
          CRM.drawer.close();
          return uitvalForm(na, doel);
        }
        CRM.toast('Opgeslagen','ok');
        alles(); snelBewerk(c.id);
      };
    }});
}

/* ─── No-show: afspraak wissen en tellen ──────────────────────────
   Eén implementatie; de kandidatenkaart en de snel-bewerken-drawer
   gebruiken allebei deze. Geeft true terug als het is doorgevoerd. */
async function noShow(id){
  const c = CRM.kandidaat(id); if(!c) return false;
  const ja = await CRM.bevestig(`${c.naam} als no-show markeren?`, 'De afspraak wordt gewist en de no-show geteld.');
  if(!ja) return false;
  await bewaarKand(c.id, {no_shows:(c.noShows||0)+1, datum:'', tijd:'',
    notities:(c.notities||[]).concat([{op:new Date().toISOString(), door:CRM.me(),
      tekst:'No-show' + (c.datum ? ' (afspraak ' + c.datum + ')' : '')}])});
  await CRM.logActiviteit('kandidaat', c.id, 'notitie', 'No-show geregistreerd');
  CRM.toast(`${c.naam} — no-show geregistreerd`, 'ok');
  alles();
  return true;
}

/* ─── Fase-picker (tikken in plaats van slepen) ───────────────────
   Woont hier, naast faseWissel, zodat het bord én de kandidatenkaart
   dezelfde picker mét dezelfde poortwachters gebruiken. */
function fasePicker(id){
  const c = CRM.kandidaat(id); if(!c) return;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(c.naam)} verplaatsen</div>
      <p class="sub" style="margin:6px 0 0">Kies de nieuwe fase.</p></div>
    <div class="modal-b"><div class="rc-fasepick">
      ${CRM.PHASES.map(p => `<button data-f="${h(p.k)}" class="${CRM.faseIs(c.fase,p.k)?'nu':''}">
        <i class="dot" style="background:${p.c}"></i>${h(p.k)}${CRM.faseIs(c.fase,p.k)?'<span class="meta">huidige fase</span>':''}</button>`).join('')}
    </div></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      CRM.$$('[data-f]', m).forEach(b => b.onclick = () => {
        CRM.modal.close();
        if(!CRM.faseIs(b.dataset.f, c.fase)) faseWissel(c.id, b.dataset.f);
      });
    }});
}

/* ─── Afspraak inplannen vanuit de pijplijn-drawer ────────────── */
function planAfspraak(c){
  const titel = CRM.faseIs(c.fase,'Intake')
    ? `Videointake — ${c.naam}`
    : `Gesprek — ${c.naam}${c.klant?' @ '+c.klant:''}`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Inplannen</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)}</p></div>
    <div class="modal-b">
      <div class="f-row"><label>Onderwerp</label><input type="text" id="pa_titel" value="${h(titel)}"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="pa_datum" value="${h(String(c.datum||'').slice(0,10)||CRM.todayISO())}"></div>
        <div class="f-row"><label>Tijd</label><input type="time" id="pa_tijd" value="${h(c.tijd||'10:00')}"></div>
        <div class="f-row"><label>Duur</label><select id="pa_duur">
          <option value="30">30 minuten</option>
          <option value="45" selected>45 minuten</option>
          <option value="60">60 minuten</option></select></div>
      </div>
      <label class="check"><input type="checkbox" id="pa_teams"> Teams-videocall</label>
      <div class="f-row" style="margin-top:10px"><label>Notitie</label>
        <textarea id="pa_body" placeholder="Voor in de uitnodiging…"></textarea></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="pa_ok">Inplannen</button></div>`, {onOpen(m){
    m.querySelector('#pa_ok').onclick = async () => {
      const d = {
        titel:m.querySelector('#pa_titel').value.trim(),
        datum:m.querySelector('#pa_datum').value, tijd:m.querySelector('#pa_tijd').value || '10:00',
        duurMin:Number(m.querySelector('#pa_duur').value)||45,
        teams:m.querySelector('#pa_teams').checked,
        body:m.querySelector('#pa_body').value.trim(),
        deelnemers:[c.email].filter(Boolean)
      };
      if(!d.titel) return CRM.toast('Vul een onderwerp in','err');
      if(!d.datum) return CRM.toast('Kies een datum','err');
      CRM.modal.close();
      try{
        const r = await CRM.outlook.maakAfspraak(d);
        CRM.toast(r.via==='graph' ? 'In je agenda gezet' : 'Outlook geopend — klik daar op Opslaan','ok');
        await CRM.logActiviteit('kandidaat', c.id, 'gesprek',
          `Afspraak ingepland: ${d.titel} op ${CRM.fmtDate(d.datum)} ${d.tijd}`);
        if(r.online) await CRM.logActiviteit('kandidaat', c.id, 'notitie', 'Teams-link: ' + r.online);
        await bewaarKand(c.id, {datum:d.datum, tijd:d.tijd});
        tekenBody(); snelBewerk(c.id);
      }catch(e){ CRM.fout('Inplannen mislukt', e); }
    };
  }});
}

/* ═══════════════════════════════════════════════════════════════
   VIDEO-INTAKE — volledige vragenlijst (blokken A–F, zoals het bord)
   Veldnamen identiek aan het bord zodat bestaande intakes gewoon
   openen en de data uitwisselbaar blijft.
   ═══════════════════════════════════════════════════════════════ */
function intakeForm(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const it = c.intake || {};
  const ta = (k, vraag, ph) => `<div class="f-row"><label for="in_${k}">${h(vraag)}</label>
    <textarea id="in_${k}" rows="2" placeholder="${h(ph||'')}">${h(it[k]||'')}</textarea></div>`;
  const chips = (k, ops, sel) => `<div class="rc-inchips" data-veld="${h(k)}">${
    ops.map(o=>`<button type="button" class="chip btn-like ${sel===o?'on':''}" data-w="${h(o)}">${h(o)}</button>`).join('')}</div>`;
  const blok = t => `<div class="label" style="margin:18px 0 10px;border-top:1px solid var(--line);padding-top:14px">${h(t)}</div>`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Video-intake · ${h(c.naam)}</div>
      <p class="sub" style="margin:6px 0 0">${h(c.klant||'—')} · ${h(c.functie||'—')}${c.datum?' · videocall '+h(CRM.fmtDay(c.datum))+(c.tijd?' '+h(c.tijd):''):''}${it.op?' · laatst bijgewerkt '+h(CRM.fmtDate(it.op))+(it.door?' door '+h(it.door):''):''}</p></div>
    <div class="modal-b" style="max-height:70vh;overflow-y:auto">
      <div class="label" style="margin-bottom:10px">A · Situatie &amp; urgentie</div>
      ${ta('situatie','Wat is er veranderd waardoor je nu openstaat? Wat mis je in je huidige/vorige werk?','de reden achter de reden — vraag door')}
      <div class="f-row"><label>Loop je ook bij andere bureaus of bedrijven?</label>
        ${chips('trajecten',['nee','ja'],it.trajecten)}
        <textarea id="in_trajectenTxt" rows="1" placeholder="zo ja: waar, en hoe ver in het proces?" style="margin-top:8px;${it.trajecten==='ja'?'':'display:none'}">${h(it.trajectenTxt||'')}</textarea></div>
      ${blok('B · Drijfveren')}
      ${ta('jaZegt','Stel je krijgt een aanbod: wat maakt dat je ja zegt — behalve het geld?')}
      ${ta('droombaan','Wat maakt een baan voor jou een droombaan?')}
      ${ta('blijven','Wat zou je huidige werkgever moeten veranderen zodat je tóch blijft?','ontmaskert de echte drijfveer en de tegenbod-gevoeligheid')}
      ${blok('C · Werkbeeld')}
      ${ta('werkbeeld','Wat weet je van dit soort werk — tempo, fysiek, omgeving? Waar verwacht je aan te moeten wennen?','voorkomt uitval in de eerste 30 dagen')}
      ${blok('D · Toekomst en ontwikkeling')}
      ${ta('jaar13','Waar wil je over 1 jaar staan? En over 3 jaar?')}
      ${ta('leren','Wat wil je leren of ontwikkelen in je volgende stap?')}
      ${blok('E · Risico-check')}
      ${ta('blokkade','Is er iets of iemand die je zou tegenhouden om ja te zeggen op een passend aanbod?','partner, reistijd, twijfel…')}
      <div class="f-row"><label>Verwacht je een tegenbod als je opzegt?</label>${chips('tegenbod',['nee','misschien','ja'],it.tegenbod)}</div>
      <div class="f-row"><label>Heb je je onvrede al eens bij je leidinggevende aangekaart?</label>${chips('aangekaart',['ja','nee'],it.aangekaart)}</div>
      ${blok('F · Commitment')}
      <div class="f-row"><label>Als het aanbod klopt: hoe graag maak je deze overstap? (1–10)</label>
        <div class="rc-schaal">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" class="rc-cijfer ${+it.cijfer===n?'on':''}" data-c="${n}">${n}</button>`).join('')}</div></div>
      ${ta('nietLager','Waarom geen twee punten lager?','hier komt het echte verhaal')}
      ${ta('tien','Wat zou het een 10 maken?','je onderhandel-checklist bij het offer')}
      ${blok('Samenvatting AM')}
      ${ta('drijfveer','Echte drijfveer (één zin)')}
      ${ta('risicos','Afhaakrisico’s')}
      ${ta('samenvatting','Samenvatting voor de klant','drie feitelijke zinnen die hem verkopen')}
      <div class="f-row"><label>Klaar om voor te stellen?</label>${chips('klaar',['ja','nog niet'],it.klaar)}</div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Sluiten</button>
      <button class="btn" id="in_ok">Intake opslaan</button></div>`, {onOpen(m){
      CRM.$$('.rc-inchips', m).forEach(g => CRM.$$('.chip', g).forEach(b => b.onclick = () => {
        CRM.$$('.chip', g).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        if(g.dataset.veld === 'trajecten') m.querySelector('#in_trajectenTxt').style.display = b.dataset.w === 'ja' ? '' : 'none';
      }));
      CRM.$$('.rc-cijfer', m).forEach(b => b.onclick = () => {
        CRM.$$('.rc-cijfer', m).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
      m.querySelector('#in_ok').onclick = async () => {
        const chip = k => { const b = m.querySelector(`.rc-inchips[data-veld=${k}] .chip.on`); return b ? b.dataset.w : ''; };
        const cij = m.querySelector('.rc-cijfer.on');
        const g = k => m.querySelector('#in_'+k).value.trim();
        const intake = {
          situatie:g('situatie'), trajecten:chip('trajecten'), trajectenTxt:g('trajectenTxt'),
          jaZegt:g('jaZegt'), droombaan:g('droombaan'), blijven:g('blijven'), werkbeeld:g('werkbeeld'),
          jaar13:g('jaar13'), leren:g('leren'), blokkade:g('blokkade'),
          tegenbod:chip('tegenbod'), aangekaart:chip('aangekaart'),
          cijfer:cij ? +cij.dataset.c : null, nietLager:g('nietLager'), tien:g('tien'),
          drijfveer:g('drijfveer'), risicos:g('risicos'), samenvatting:g('samenvatting'), klaar:chip('klaar'),
          op:CRM.todayISO(), door:CRM.me()
        };
        await bewaarKand(c.id, {intake});
        await CRM.logActiviteit('kandidaat', c.id, 'gesprek',
          `Video-intake afgenomen${intake.cijfer ? ' — commitment ' + intake.cijfer + '/10' : ''}`);
        CRM.modal.close();
        CRM.toast(`Intake opgeslagen${intake.cijfer ? ' — ' + intake.cijfer + '/10' : ''}`, 'ok');
        tekenBody();
        if(document.getElementById('drawer')?.classList.contains('on')) snelBewerk(c.id);
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   O&O-SESSIES — aanmaken, beheren, kandidaten koppelen (oo_sessions)
   Schrijft dezelfde kolommen als het bord: id, klant, functie,
   datum, locatie. Kandidaten koppelen via oo_id.
   ═══════════════════════════════════════════════════════════════ */
function ooModal(sid){
  const sessies = ooSessies();
  const s = sid ? ooSessie(sid) : null;
  const klanten = Array.from(new Set(
    (CRM.state.clients||[]).map(x=>x.naam).concat((CRM.state.vacs||[]).map(v=>v.klant)).filter(Boolean))).sort();
  const vacsVan = k => (CRM.state.vacs||[]).filter(v => v.klant === k);
  let pending = [];                      // snel toegevoegde kandidaten, pas bij Opslaan naar de database

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">O&amp;O-sessie</div>
      <p class="sub" style="margin:6px 0 0">Plan de sessie en koppel de kandidaten — streef naar 4 per sessie.</p></div>
    <div class="modal-b" style="max-height:70vh;overflow-y:auto">
      <div class="f-row"><label for="oo_sel">Sessie</label>
        <select id="oo_sel"><option value="__new">+ Nieuwe sessie</option>
          ${sessies.slice().sort((a,b)=>String(a.datum||'').localeCompare(String(b.datum||''))).map(x =>
            `<option value="${h(x.id)}" ${s&&String(s.id)===String(x.id)?'selected':''}>${h(CRM.fmtDay(x.datum)||'?')} · ${h(x.klant)} – ${h(x.functie)} (${sessLeden(x.id).length})</option>`).join('')}
        </select></div>
      <div class="f-grid">
        <div class="f-row"><label for="oo_klant">Klant</label>
          <select id="oo_klant">${klanten.map(k=>`<option>${h(k)}</option>`).join('')}</select></div>
        <div class="f-row"><label for="oo_func">Functie</label><select id="oo_func"></select></div>
        <div class="f-row"><label for="oo_datum">Datum</label><input type="date" id="oo_datum"></div>
        <div class="f-row"><label for="oo_loc">Locatie</label><input type="text" id="oo_loc" placeholder="Bijv. Bodegraven"></div>
      </div>
      <div class="f-row"><label>Kandidaten in deze sessie</label><div id="oo_lijst"></div></div>
      <div class="f-row"><label>Snel een kandidaat toevoegen</label>
        <div class="row tight">
          <input type="text" id="oo_nnaam" placeholder="Naam" style="flex:1">
          <select id="oo_nbron" style="width:auto">${KAND_BRONNEN.map(b=>`<option>${h(b)}</option>`).join('')}</select>
          <button class="btn ghost sm" id="oo_nadd">Toevoegen</button>
        </div>
        <span class="hint">Wordt pas opgeslagen als je de sessie opslaat.</span></div>
      <div class="note err" id="oo_err" style="display:none"></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost danger" id="oo_del" style="display:none">Sessie verwijderen</button>
      <div class="spacer"></div>
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="oo_ok">Sessie opslaan</button>
    </div>`, {onOpen(m){
      const sel = m.querySelector('#oo_sel'), kSel = m.querySelector('#oo_klant'), fSel = m.querySelector('#oo_func');
      let huidige = s ? s.id : null;
      const vulFunc = keuze => {
        const fs = vacsVan(kSel.value).map(v => v.functie);
        fSel.innerHTML = fs.length ? fs.map(f=>`<option ${f===keuze?'selected':''}>${h(f)}</option>`).join('') : '<option value="">(geen vacature)</option>';
      };
      const locVan = k => (CRM.state.clients||[]).find(x=>x.naam===k)?.locatie || '';
      const vulLijst = () => {
        const pool = CRM.kandidaten().filter(c =>
          (c.klant === kSel.value && !CRM.DONE.includes(c.fase)) || (huidige && String(c.ooId) === String(huidige)));
        const items = pool.concat(pending);
        m.querySelector('#oo_lijst').innerHTML = items.length ? items.map(c => `
          <label class="check rc-oolid"><input type="checkbox" value="${h(c.id)}"
            ${(huidige && String(c.ooId)===String(huidige)) || c._pending ? 'checked' : ''}>
            <span><b>${h(c.naam)}</b> <span class="meta">${h(c.functie||'—')} · ${h(CRM.faseNorm(c.fase))}${c.bron?' · '+h(c.bron):''}${c._pending?' · nieuw':''}</span></span></label>`).join('')
          : '<p class="meta" style="margin:0">Nog geen kandidaten voor deze klant.</p>';
      };
      const vulVelden = () => {
        const x = huidige ? ooSessie(huidige) : null;
        m.querySelector('#oo_del').style.display = x ? '' : 'none';
        kSel.value = x ? x.klant : (klanten[0]||'');
        vulFunc(x ? x.functie : '');
        m.querySelector('#oo_datum').value = x ? (x.datum||'') : '';
        m.querySelector('#oo_loc').value = x ? (x.locatie||'') : locVan(kSel.value);
        vulLijst();
      };
      sel.onchange = () => { huidige = sel.value === '__new' ? null : sel.value; pending = []; vulVelden(); };
      kSel.onchange = () => { vulFunc(''); if(!m.querySelector('#oo_loc').value) m.querySelector('#oo_loc').value = locVan(kSel.value); vulLijst(); };
      if(!s) sel.value = '__new';
      vulVelden();

      m.querySelector('#oo_nadd').onclick = () => {
        const naam = m.querySelector('#oo_nnaam').value.trim();
        if(!naam) return m.querySelector('#oo_nnaam').focus();
        pending.push({id:CRM.uid()+Math.floor(Math.random()*1e3), naam, klant:kSel.value, functie:fSel.value||'',
          bron:m.querySelector('#oo_nbron').value, fase:'O&O sessie', _pending:true});
        m.querySelector('#oo_nnaam').value = '';
        vulLijst();
      };

      m.querySelector('#oo_del').onclick = async () => {
        if(!huidige) return;
        const n = sessLeden(huidige).length;
        const ja = await CRM.bevestig('O&O-sessie verwijderen?', n ? `${n} ${n===1?'kandidaat raakt':'kandidaten raken'} los van de sessie (de kaarten blijven staan).` : '');
        if(!ja) return;
        for(const c of CRM.kandidaten().filter(x => String(x.ooId) === String(huidige)))
          await bewaarKand(c.id, {oo_id:null});
        CRM.state.ooSessions = ooSessies().filter(x => String(x.id) !== String(huidige));
        if(!CRM.demo) await CRM.sb.from('oo_sessions').delete().eq('id', huidige);
        CRM.modal.close(); CRM.toast('Sessie verwijderd','ok'); alles();
      };

      m.querySelector('#oo_ok').onclick = async () => {
        const err = m.querySelector('#oo_err');
        const datum = m.querySelector('#oo_datum').value;
        if(!datum){ err.style.display=''; err.textContent = 'Kies de datum van de sessie.'; return; }
        const gegevens = {klant:kSel.value, functie:fSel.value||'', datum, locatie:m.querySelector('#oo_loc').value.trim()};
        let sessieId = huidige;
        if(!sessieId){
          sessieId = 's' + Date.now();
          const rijS = Object.assign({id:sessieId}, gegevens);
          CRM.state.ooSessions = ooSessies().concat([rijS]);
          if(!CRM.demo){
            const {error} = await CRM.sb.from('oo_sessions').upsert(rijS);
            if(error){ CRM.state.ooSessions = ooSessies().filter(x=>x.id!==sessieId); err.style.display=''; err.textContent = 'Opslaan mislukt: ' + error.message; return; }
          }
        } else {
          Object.assign(ooSessie(sessieId), gegevens);
          if(!CRM.demo){
            const {error} = await CRM.sb.from('oo_sessions').upsert(Object.assign({id:sessieId}, gegevens));
            if(error){ err.style.display=''; err.textContent = 'Opslaan mislukt: ' + error.message; return; }
          }
        }
        const vandaag = CRM.todayISO();
        const aangevinkt = CRM.$$('#oo_lijst input:checked', m).map(i => i.value);
        /* Nieuwe (pending) kandidaten eerst echt aanmaken. */
        for(const p of pending){
          if(!aangevinkt.includes(p.id)) continue;
          const cand = {id:p.id, naam:p.naam, klant:p.klant, functie:p.functie,
            type:(vacsVan(p.klant).find(v=>v.functie===p.functie)||{}).type || '',
            bron:p.bron, fase:'O&O sessie', datum, since:vandaag, rec:CRM.me(), ooId:sessieId,
            historie:[{fase:'O&O sessie', op:vandaag}]};
          const rijC = CRM.candToRow(cand);
          CRM.state.cands.unshift(rijC);
          if(!CRM.demo){
            const {error} = await CRM.sb.from('candidates').insert(rijC);
            if(error){ CRM.state.cands.shift(); CRM.fout('Kandidaat opslaan mislukt', error); }
          }
          CRM.logActiviteit('kandidaat', cand.id, 'systeem', `Aangemaakt in O&O-sessie ${gegevens.klant} · ${CRM.fmtDate(datum)}`);
        }
        /* Bestaande kandidaten koppelen of loskoppelen. */
        for(const c of CRM.kandidaten()){
          if(pending.some(p => p.id === c.id)) continue;
          if(aangevinkt.includes(c.id)){
            const patch = {oo_id:sessieId, datum};
            if(c.fase !== 'O&O sessie'){
              patch.fase = 'O&O sessie'; patch.since = vandaag;
              patch.historie = (c.historie||[]).concat([{fase:'O&O sessie', op:vandaag}]);
            }
            await bewaarKand(c.id, patch);
          } else if(String(c.ooId) === String(sessieId)){
            await bewaarKand(c.id, {oo_id:null});
          }
        }
        CRM.modal.close();
        CRM.toast('O&O-sessie opgeslagen','ok');
        alles();
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   GEDEELD MET DE PIJPLIJN- EN KANDIDATEN-MODULE (beide laden ná dit
   bestand). De poortwachters leven híer — het bord en de
   kandidatenkaart roepen ze aan, zodat de regels maar op één plek
   bestaan. Een klik op een bordkaart opent de vólledige
   kandidatenkaart; snelBewerk is sinds 30 jul 2026 nog slechts de
   expliciete actie "Snel bewerken".
   ═══════════════════════════════════════════════════════════════ */
CRM.kandidaatBewerk = id => snelBewerk(id);                 // snel-bewerken-drawer
CRM.kandidaatFase   = (id, doelFase) => faseWissel(id, doelFase); // fasewissel + poortwachters (incl. uitvalformulier)
CRM.kandidaatFasePicker = id => fasePicker(id);             // fase kiezen i.p.v. slepen (mobiel + kandidatenkaart)
CRM.kandidaatNoShow = id => noShow(id);                     // afspraak wissen + no-show tellen
CRM.kandidaatUitval = (id, fase) => {                       // afmelden of uitvalgegevens corrigeren
  const c = CRM.kandidaat(id);
  if(c) uitvalForm(c, UITVAL.includes(fase) ? fase : (UITVAL.includes(c.fase) ? c.fase : 'Afgevallen'));
};
CRM.kandidaatIntake  = id => intakeForm(id);                // video-intakeformulier
CRM.kandidaatPlannen = id => { const c = CRM.kandidaat(id); if(c) planAfspraak(c); };
CRM._rcDeel = {
  intakeForm, ooModal, promoteerStarts, weekGrens,
  ooSessies, ooSessie, sessLeden, intakeDone,
  garantieEnd, owesReplacement, repOf, totaalJaarSalaris,
  /* "+ Kandidaat" stond op het vervallen tabblad Voorselectie; die knop hoort
     nu op het bord, want de kandidaat komt in de eerste kolom (Intake). */
  nieuweKandidaat: nieuweKandidaatModal,
  /* Vanuit de uitvalstrook op het bord terug naar het Uitval-tabblad. */
  openUitval(){ S.tab = 'uitval'; CRM.ga('recruitment'); }
};

/* VERZOEK AAN CORE: crm_leads mist een kolom `belpogingen int default 0`.
   Zolang die er niet is leiden we het aantal belpogingen af uit
   crm_activiteiten (soort = 'bel'). Dat werkt, maar een teller in de rij
   zou sneller zijn zodra er duizenden leads in staan. */
/* VERZOEK AAN CORE: demo.js heeft geen ooSessions-testdata; O&O-sessies zijn
   in demo pas zichtbaar nadat je er zelf een aanmaakt (blijft in het geheugen). */
})();
