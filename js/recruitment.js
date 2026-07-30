/* ═══════════════════════════════════════════════════════════════
   MODULE: RECRUITMENT
   Twee samenhangende weergaven:
     A. Leads    — de fase VÓÓR de pijplijn (crm_leads)
     B. Pijplijn — het ATS-bord op candidates
   Doel: geen vervuiling. Een lead gaat pas de pijplijn in als hij
   compleet is en er een video-intake staat.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Modulestatus (blijft bewaard tussen renders) ─────────────── */
const S = {
  tab:'leads',
  l:{q:'', status:'', bron:'', vac:'', mijn:false},
  b:{q:'', klant:'', rec:'', vac:'', mijn:false}
};

const GESPREK_FASES = ['O&O sessie','Eerste gesprek','Tweede gesprek','Meeloopdag'];
const UITVAL = ['Afgevallen','Gestopt'];
const bordFases = () => CRM.PHASES.filter(p => !UITVAL.includes(p.k));

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
  title:'Recruitment', icon:'◉', onderschrift:'Leads, intake en pijplijn',
  volleBreedte:true,
  badge(){ return leads().filter(l => l.status === 'Nieuw').length; },
  render(mount, acties, params){
    mount.innerHTML = `
      <div class="rc">
        <div class="rc-bar" id="rc_bar"></div>
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
    el.innerHTML = `<button class="btn ghost sm" id="rc_import">⬇ Leads importeren</button>
                    <button class="btn sm" id="rc_nieuw">+ Lead</button>`;
    el.querySelector('#rc_import').onclick = importModal;
    el.querySelector('#rc_nieuw').onclick  = nieuweLeadModal;
  } else {
    el.innerHTML = `<span class="meta">Sleep een kaart naar een andere fase</span>`;
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
                + K.filter(c => c.fase === 'Voorselectie' && inWeek(c.datum)).length;
  const pijplijn = K.filter(c => !CRM.DONE.includes(c.fase)).length;
  const pm = CRM.plaatsingenMaand(), target = CRM.maandTarget();
  return {nieuw, stil, intakes, pijplijn, netto:pm.netto, target};
}
function tekenBar(){
  const el = document.getElementById('rc_bar'); if(!el) return;
  const c = cijfers();
  const it = (lbl, waarde, extra='', klasse='') =>
    `<div class="rc-it ${klasse}"><div class="label">${h(lbl)}</div>
       <div class="rc-v num">${waarde}</div>${extra?`<div class="meta">${extra}</div>`:''}</div>`;
  el.innerHTML =
    it('Nieuw vandaag', c.nieuw, 'binnengekomen leads') +
    it('Zonder opvolging', c.stil, 'langer dan 2 dagen', c.stil ? 'amber' : '') +
    it('Intakes deze week', c.intakes, 'gepland') +
    it('In de pijplijn', c.pijplijn, 'lopende kandidaten') +
    it('Netto deze maand', `${c.netto}<span class="rc-van">/ ${c.target}</span>`, 'plaatsingen vs target',
       c.netto >= c.target ? 'goed' : '');
}

/* ═══════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════ */
function tekenTabs(){
  const el = document.getElementById('rc_tabs'); if(!el) return;
  const open = leads().filter(l => CRM.LEAD_OPEN.includes(l.status)).length;
  const inP  = CRM.kandidaten().filter(c => !CRM.DONE.includes(c.fase)).length;
  el.innerHTML = `
    <button class="tab ${S.tab==='leads'?'on':''}" data-t="leads">Leads <span class="cnt num">${open}</span></button>
    <button class="tab ${S.tab==='bord'?'on':''}" data-t="bord">Pijplijn <span class="cnt num">${inP}</span></button>`;
  CRM.$$('[data-t]', el).forEach(b => b.onclick = () => {
    S.tab = b.dataset.t; tekenTabs(); tekenBody(); tekenActies();
  });
}
function tekenBody(){
  const el = document.getElementById('rc_body'); if(!el) return;
  if(S.tab === 'leads') tekenLeads(el); else tekenBord(el);
}

/* ═══════════════════════════════════════════════════════════════
   TAB A — LEADS
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
        <label class="check"><input type="checkbox" id="rc_mijn" ${S.l.mijn?'checked':''}> Mijn leads</label>
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
  if(telling) telling.textContent = rijen.length + ' van ' + leads().length + ' leads';

  if(!rijen.length){
    wrap.innerHTML = CRM.ui.leeg('Geen leads gevonden',
      'Pas je filters aan, of importeer nieuwe leads uit de sheet.');
    return;
  }
  const toon = rijen.slice(0,200);
  wrap.innerHTML = `
    <div class="tblwrap">
      <table class="tbl rc-tbl">
        <thead><tr>
          <th style="width:24px"></th><th>Kandidaat</th><th>Contact</th><th>Bron</th>
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
    <td><span class="chip">${h(l.bron||'—')}</span>${l.campagne?`<div class="rowsub trunc" style="max-width:150px">${h(l.campagne)}</div>`:''}</td>
    <td>${v ? `<div>${h(v.functie)}</div><div class="rowsub">${h(v.klant)}</div>`
             : (l.functie ? `<div>${h(l.functie)}</div><div class="rowsub">${h(l.klant||'—')}</div>`
                          : '<span class="meta">niet gekoppeld</span>')}</td>
    <td>
      ${l.score != null ? `<span class="chip ${l.score>=70?'green':l.score>=45?'amber':''} num">${h(l.score)}</span>` : ''}
      <div class="rowsub trunc" style="max-width:190px">${h(l.kwalificatie||'')}</div>
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
    <div class="drawer-f">
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
      <p class="sub" style="margin:6px 0 0">${h(lead.naam)} komt in fase <b>Voorselectie</b>. Maak de gegevens eerst compleet — half ingevulde kandidaten vervuilen het systeem.</p></div>
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
          type:'W&S', bron:g('bron'), fase:'Voorselectie', datum:g('datum'), tijd:g('tijd'),
          since:vandaag, rec:g('rec') || CRM.me(), vacatureId:vacSel.value, leadId:lead.id,
          cv:lead.cv || null, note:lead.kwalificatie || '',
          historie:[{fase:'Voorselectie', op:vandaag}],
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
        toastLink(`${cand.naam} staat in Voorselectie`, 'Open kandidaatkaart →', () => CRM.ga('kandidaten',{id:cand.id}));
      };
    }});
}

/* ─── Handmatig een lead toevoegen ────────────────────────────── */
function nieuweLeadModal(){
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b)=>vacLabel(a).localeCompare(vacLabel(b)));
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe lead</div></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label for="nl_naam">Naam</label><input type="text" id="nl_naam"></div>
        <div class="f-row"><label for="nl_tel">Telefoon</label><input type="tel" id="nl_tel"></div>
        <div class="f-row"><label for="nl_plaats">Woonplaats</label><input type="text" id="nl_plaats"></div>
        <div class="f-row"><label for="nl_bron">Bron</label>
          <select id="nl_bron">${CRM.LEAD_BRONNEN.map(b=>`<option ${b==='Handmatig'?'selected':''}>${h(b)}</option>`).join('')}</select></div>
      </div>
      <div class="f-row"><label for="nl_vac">Reageerde op</label>
        <select id="nl_vac"><option value="">— geen vacature —</option>
          ${vacs.map(v=>`<option value="${h(v.id)}">${h(vacLabel(v))}</option>`).join('')}</select></div>
      <div class="note err" id="nl_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="nl_ok">Toevoegen</button></div>`, {onOpen(m){
      m.querySelector('#nl_ok').onclick = async () => {
        const naam = m.querySelector('#nl_naam').value.trim();
        if(!naam){ const e = m.querySelector('#nl_err'); e.style.display=''; e.textContent='Een naam is het minimum.'; return; }
        const v = vacById(m.querySelector('#nl_vac').value);
        const rij = {
          id:CRM.uid(), naam, telefoon:m.querySelector('#nl_tel').value.trim(), email:'',
          woonplaats:m.querySelector('#nl_plaats').value.trim(), bron:m.querySelector('#nl_bron').value,
          campagne:'', vacature_id:v?v.id:'', klant:v?v.klant:'', functie:v?v.functie:'',
          status:'Nieuw', prioriteit:'', kwalificatie:'', score:null, agent_notitie:'',
          antwoorden:null, cv:null, eigenaar:CRM.me(), binnen_op:new Date().toISOString(),
          opvolgen_op:null, kandidaat_id:'', notities:[]
        };
        CRM.state.leads.unshift(rij);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('crm_leads').insert(rij);
          if(error){ CRM.state.leads.shift(); return CRM.fout('Opslaan mislukt', error); }
        }
        CRM.modal.close(); CRM.toast('Lead toegevoegd','ok');
        tekenBar(); tekenTabs(); tekenLijst(); CRM.navBadges();
      };
    }});
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
    <div class="modal-h"><div class="h2">Leads importeren</div>
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
        CRM.toast(`${nieuw.length} lead${nieuw.length===1?'':'s'} geïmporteerd${over?` · ${over} dubbele${over===1?'':' rijen'} overgeslagen`:''}`,'ok');
        S.l.status = ''; tekenBar(); tekenTabs(); tekenLijst(); CRM.navBadges();
      };
    }});
}
/* ═══════════════════════════════════════════════════════════════
   TAB B — HET PIJPLIJNBORD
   ═══════════════════════════════════════════════════════════════ */
function kandGefilterd(){
  const f = S.b, q = norm(f.q);
  return CRM.kandidaten().filter(c => {
    if(f.klant && c.klant !== f.klant) return false;
    if(f.rec && c.rec !== f.rec) return false;
    if(f.vac && String(c.vacatureId) !== f.vac) return false;
    if(f.mijn && c.rec !== CRM.me()) return false;
    if(q && !norm([c.naam, c.functie, c.klant, c.woonplaats].join(' ')).includes(q)) return false;
    return true;
  });
}
function dagenInFase(c){
  const laatste = (c.historie && c.historie.length) ? c.historie[c.historie.length-1].op : c.since;
  const n = CRM.dagenGeleden(laatste);
  return n == null ? null : Math.max(0, n);
}

function tekenBord(el){
  const klanten = Array.from(new Set(CRM.kandidaten().map(c=>c.klant).filter(Boolean))).sort();
  const recs = Array.from(new Set(CRM.kandidaten().map(c=>c.rec).filter(Boolean))).sort();
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b)=>vacLabel(a).localeCompare(vacLabel(b)));
  el.innerHTML = `
    <div class="rc-pad rc-pad-b">
      <div class="rc-fil">
        <div class="searchbox" style="flex:1;max-width:250px">
          <input type="search" id="rb_q" placeholder="Zoek kandidaat" value="${h(S.b.q)}"></div>
        <select id="rb_klant" style="width:auto;min-width:160px"><option value="">Alle klanten</option>
          ${klanten.map(k=>`<option ${S.b.klant===k?'selected':''}>${h(k)}</option>`).join('')}</select>
        <select id="rb_rec" style="width:auto;min-width:140px"><option value="">Alle recruiters</option>
          ${recs.map(r=>`<option ${S.b.rec===r?'selected':''}>${h(r)}</option>`).join('')}</select>
        <select id="rb_vac" style="width:auto;min-width:200px"><option value="">Alle vacatures</option>
          ${vacs.map(v=>`<option value="${h(v.id)}" ${S.b.vac===String(v.id)?'selected':''}>${h(vacLabel(v))}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="rb_mijn" ${S.b.mijn?'checked':''}> Mijn kandidaten</label>
      </div>
    </div>
    <div class="rc-bordwrap"><div class="board" id="rb_board"></div><div class="rc-uit" id="rb_uit"></div></div>`;

  const q = el.querySelector('#rb_q');
  q.oninput = CRM.debounce(() => { S.b.q = q.value; tekenKolommen(); }, 200);
  el.querySelector('#rb_klant').onchange = e => { S.b.klant = e.target.value; tekenKolommen(); };
  el.querySelector('#rb_rec').onchange   = e => { S.b.rec   = e.target.value; tekenKolommen(); };
  el.querySelector('#rb_vac').onchange   = e => { S.b.vac   = e.target.value; tekenKolommen(); };
  el.querySelector('#rb_mijn').onchange  = e => { S.b.mijn  = e.target.checked; tekenKolommen(); };
  tekenKolommen();
}

function kaartHtml(c){
  const over = c.actieDatum && (CRM.dagenGeleden(c.actieDatum) || 0) > 0;
  const dg = dagenInFase(c);
  const v = vacById(c.vacatureId);
  const kanIntake = ['Voorselectie','Voorgesteld'].includes(c.fase);
  return `<div class="bcard" draggable="true" data-id="${h(c.id)}">
    <div class="bc-t">
      <div class="bc-n">${h(c.naam)}
        <div class="bc-s">${h(c.functie || (v?v.functie:'') || '—')}${c.klant?' @ '+h(c.klant):''}</div></div>
      ${c.rec?`<span class="rc-rec" title="${h(c.rec)}">${h(CRM.initialen(c.rec))}</span>`:''}
    </div>
    <div class="bc-f">
      ${c.datum?`<span class="chip num">${h(CRM.fmtDateShort(c.datum))}${c.tijd?' '+h(c.tijd):''}</span>`:''}
      ${c.intake && c.intake.cijfer!=null ? `<span class="chip ${c.intake.cijfer<7?'amber':'green'} num" title="Intakecijfer">${h(c.intake.cijfer)}/10</span>`:''}
      ${c.noShows?`<span class="chip red num" title="No-shows">${h(c.noShows)}× no-show</span>`:''}
      ${dg!=null?`<span class="chip num" title="Dagen in deze fase">${dg}d</span>`:''}
    </div>
    ${c.volgendeActie?`<div class="bc-act ${over?'over':''}">${h(c.volgendeActie)}${c.actieDatum?` <span class="num">· ${h(CRM.fmtDateShort(c.actieDatum))}</span>`:''}</div>`:''}
    ${kanIntake?`<button class="btn ghost sm rc-intakebtn" data-intake="${h(c.id)}">Video-intake</button>`:''}
  </div>`;
}

function tekenKolommen(){
  const board = document.getElementById('rb_board'), uit = document.getElementById('rb_uit');
  if(!board) return;
  const alle = kandGefilterd();
  board.innerHTML = bordFases().map(p => {
    const kaarten = alle.filter(c => c.fase === p.k);
    return `<div class="bcol" data-fase="${h(p.k)}" style="--ph:${p.c}">
      <div class="bcol-h"><b>${h(p.k)}</b><span class="cnt num">${kaarten.length}</span></div>
      <div class="bcol-b">${kaarten.map(kaartHtml).join('') ||
        `<div class="rc-leegkol">${p.k==='Voorselectie'?'Schiet leads door vanuit het tabblad Leads':'—'}</div>`}</div>
    </div>`;
  }).join('');
  uit.innerHTML = `<div class="label" style="padding:0 4px 6px">Uitval</div>` + UITVAL.map(f => {
    const n = alle.filter(c => c.fase === f).length;
    return `<div class="rc-uitzone" data-fase="${h(f)}" style="--ph:${CRM.faseKleur(f)}">
      <b>${h(f)}</b><span class="num">${n}</span>
      <span class="meta">sleep hierheen</span></div>`;
  }).join('');

  CRM.$$('.bcard', board).forEach(k => {
    k.ondragstart = e => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('drag'); };
    k.ondragend   = () => k.classList.remove('drag');
    k.onclick = e => {
      if(e.target.closest('[data-intake]')) return;
      snelBewerk(k.dataset.id);
    };
  });
  CRM.$$('[data-intake]', board).forEach(b => b.onclick = e => { e.stopPropagation(); intakeForm(b.dataset.intake); });
  CRM.$$('.bcol, .rc-uitzone', document.getElementById('rb_board').parentElement).forEach(zone => {
    zone.ondragover  = e => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = e => {
      e.preventDefault(); zone.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      if(id) faseWissel(id, zone.dataset.fase);
    };
  });
}

/* ─── Fasewissel met vriendelijke poortwachters ───────────────── */
async function bewaarFase(c, fase, extra){
  const vandaag = CRM.todayISO();
  const hist = (c.historie||[]).concat([{fase, op:vandaag}]);
  const patch = Object.assign({fase, historie:hist, since:c.since || vandaag}, extra || {});
  if(CRM.PLACED.includes(fase) && !c.geplaatstOp) patch.geplaatst_op = vandaag;
  if(fase === 'Gestopt' && !c.gestoptOp) patch.gestopt_op = vandaag;
  const ok = await bewaarKand(c.id, patch);
  if(!ok) return;
  await CRM.logActiviteit('kandidaat', c.id, 'fase', `${c.fase} → ${fase}`);
  CRM.toast(`${c.naam}: ${fase}`,'ok');
  tekenBar(); tekenTabs(); tekenKolommen();
}

function faseWissel(id, fase){
  const c = CRM.kandidaat(id);
  if(!c || !fase || c.fase === fase) return;
  if(UITVAL.includes(fase)) return uitvalForm(c, fase);
  const vraagtDatum = GESPREK_FASES.includes(fase);
  const vraagtStart = fase === 'Contract getekend';
  if(!vraagtDatum && !vraagtStart) return bewaarFase(c, fase);

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(c.naam)} → ${h(fase)}</div>
      <p class="sub" style="margin:6px 0 0">${vraagtStart
        ? 'Leg de startdatum vast — daar rekenen we de plaatsingen mee.'
        : 'Zet de afspraak erbij, dan weet iedereen waar hij aan toe is.'}</p></div>
    <div class="modal-b">
      ${vraagtStart
        ? `<div class="f-row"><label for="fw_start">Startdatum</label><input type="date" id="fw_start" value="${h(c.start||'')}"></div>`
        : `<div class="f-grid">
             <div class="f-row"><label for="fw_datum">Datum afspraak</label><input type="date" id="fw_datum" value="${h(c.datum||'')}"></div>
             <div class="f-row"><label for="fw_tijd">Tijd</label><input type="time" id="fw_tijd" value="${h(c.tijd||'10:00')}"></div>
           </div>`}
      <div class="f-row"><label for="fw_actie">Volgende actie (optioneel)</label>
        <input type="text" id="fw_actie" value="${h(c.volgendeActie||'')}" placeholder="Bijv. bevestiging sturen"></div>
      <div class="note err" id="fw_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="fw_ok">Verplaatsen</button></div>`, {onOpen(m){
      m.querySelector('#fw_ok').onclick = async () => {
        const err = m.querySelector('#fw_err');
        const extra = {volgende_actie: m.querySelector('#fw_actie').value.trim() || null};
        if(vraagtStart){
          const s = m.querySelector('#fw_start').value;
          if(!s){ err.style.display=''; err.textContent='Een startdatum is verplicht bij een getekend contract.'; return; }
          extra.start = s;
        } else {
          const d = m.querySelector('#fw_datum').value, t = m.querySelector('#fw_tijd').value;
          if(!d){ err.style.display=''; err.textContent='Zonder datum weten we niet wanneer het gesprek is.'; return; }
          extra.datum = d; extra.tijd = t || '';
        }
        CRM.modal.close();
        await bewaarFase(c, fase, extra);
      };
    }});
}

function uitvalForm(c, fase){
  const afgevallen = fase === 'Afgevallen';
  const groepen = afgevallen ? CRM.AFVAL_CATS : CRM.STOP_CATS;
  const eersteGroep = Object.keys(groepen)[0];
  const lbl = k => ({niet_gekwalificeerd:'Niet gekwalificeerd', offer_afgewezen:'Offer afgewezen',
                     kandidaat:'Door de kandidaat', klant:'Door de klant', anders:'Anders'})[k] || k;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(c.naam)} → ${h(fase)}</div>
      <p class="sub" style="margin:6px 0 0">Vertel kort waarom. Daar leren we van bij de volgende kandidaat.</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="uv_groep">${afgevallen?'Wanneer viel hij af?':'Wie stopte?'}</label>
        <select id="uv_groep">${Object.keys(groepen).map(k=>`<option value="${h(k)}">${h(lbl(k))}</option>`).join('')}</select></div>
      <div class="f-row"><label for="uv_cat">Reden</label><select id="uv_cat"></select></div>
      <div class="f-row"><label for="uv_toe">Toelichting (optioneel)</label>
        <textarea id="uv_toe" placeholder="Wat gebeurde er precies?"></textarea></div>
      ${afgevallen?`<label class="check"><input type="checkbox" id="uv_recycle" checked> Later opnieuw benaderen (recyclebaar)</label>`:''}
      <div class="note err" id="uv_err" style="display:none;margin-top:10px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn danger" id="uv_ok">Vastleggen</button></div>`, {onOpen(m){
      const groep = m.querySelector('#uv_groep'), cat = m.querySelector('#uv_cat');
      const vul = () => { cat.innerHTML = (groepen[groep.value]||groepen[eersteGroep]).map(x=>`<option>${h(x)}</option>`).join(''); };
      groep.onchange = vul; vul();
      m.querySelector('#uv_ok').onclick = async () => {
        if(!cat.value){ const e = m.querySelector('#uv_err'); e.style.display=''; e.textContent='Kies een reden.'; return; }
        const toe = m.querySelector('#uv_toe').value.trim();
        const extra = afgevallen
          ? {afval_type:groep.value, afval_categorie:cat.value, reden:toe,
             recyclebaar: m.querySelector('#uv_recycle').checked}
          : {stop_door:groep.value, stop_categorie:cat.value, reden:toe};
        CRM.modal.close();
        await bewaarFase(c, fase, extra);
        await CRM.logActiviteit('kandidaat', c.id, 'notitie', `${fase}: ${cat.value}${toe?' — '+toe:''}`);
        if(toe) CRM.verwerkTags(toe, 'kandidaat', c.id);
      };
    }});
}
/* ─── Snelle bewerk-drawer (de volledige kaart zit in js/kandidaten.js) ── */
function snelBewerk(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const v = vacById(c.vacatureId);
  const kanIntake = ['Voorselectie','Voorgesteld'].includes(c.fase);
  const tijdlijn = (c.notities||[]).map(n => ({titel:n.door||'Notitie', wanneer:CRM.fmtDate(n.op), tekst:n.tekst}))
    .concat(CRM.activiteitenVoor('kandidaat', c.id).map(a => ({
      titel:a.door||'Systeem',
      wanneer:CRM.fmtDate(a.op), tekst:a.tekst})));

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="flex:1;min-width:0">
        <div class="h2">${h(c.naam)}</div>
        <div class="sub">${h(c.functie||'—')}${c.klant?' @ '+h(c.klant):''}${c.woonplaats?' · '+h(c.woonplaats):''}</div>
        <div class="row tight" style="margin-top:8px">
          <span class="chip"><i class="dot" style="background:${CRM.faseKleur(c.fase)}"></i>${h(c.fase)}</span>
          ${c.rec?`<span class="chip">${h(c.rec)}</span>`:''}
          ${c.bron?`<span class="chip">${h(c.bron)}</span>`:''}
          ${c.maandloon?`<span class="chip num">${CRM.euro(c.maandloon)} p/m</span>`:''}
          ${c.intake && c.intake.cijfer!=null?`<span class="chip ${c.intake.cijfer<7?'amber':'green'} num">Intake ${h(c.intake.cijfer)}/10</span>`:''}
        </div>
      </div>
      <button class="btn sub x" data-close>✕</button>
    </div>
    <div class="drawer-b">
      <div class="note info">Dit is de snelle bewerking. Alle details, documenten en matches staan op de volledige kandidaatkaart.</div>
      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Snel bijwerken</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="sb_fase">Fase</label>
              <select id="sb_fase">${CRM.PHASES.map(p=>`<option ${c.fase===p.k?'selected':''}>${h(p.k)}</option>`).join('')}</select></div>
            <div class="f-row"><label for="sb_datum">Afspraakdatum</label><input type="date" id="sb_datum" value="${h(c.datum||'')}"></div>
            <div class="f-row"><label for="sb_tijd">Tijd</label><input type="time" id="sb_tijd" value="${h(c.tijd||'')}"></div>
            <div class="f-row"><label for="sb_actiedat">Actiedatum</label><input type="date" id="sb_actiedat" value="${h(c.actieDatum||'')}"></div>
          </div>
          <div class="f-row"><label for="sb_actie">Volgende actie</label>
            <input type="text" id="sb_actie" value="${h(c.volgendeActie||'')}" placeholder="Bijv. bellen over de meeloopdag"></div>
          <div class="f-row"><label for="sb_note">Notitie toevoegen</label>
            <textarea id="sb_note" placeholder="Kort en feitelijk"></textarea>
            <span class="hint">@naam om een collega te melden</span></div>
          <div class="row"><button class="btn" id="sb_ok">Opslaan</button>
            <button class="btn ghost" id="sb_plan">Inplannen</button>
            ${kanIntake?`<button class="btn ghost" id="sb_intake">Video-intake invullen</button>`:''}</div>
        </div></div>
      ${v?`<div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Gekoppelde vacature</div></div>
        <div class="card-b"><div class="rc-kv"><span class="label">Vacature</span><span>${h(v.functie)}</span></div>
          <div class="rc-kv"><span class="label">Klant</span><span>${h(v.klant)}</span></div>
          <div class="rc-kv"><span class="label">Locatie</span><span>${h(v.locatie||'—')}</span></div></div></div>`:''}
      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Geschiedenis</div></div>
        <div class="card-b">${CRM.ui.tijdlijn(tijdlijn)}</div></div>
    </div>
    <div class="drawer-f">
      <div class="spacer"></div>
      <button class="btn ghost" id="sb_volledig">Volledige kandidaatkaart →</button>
    </div>`, {onOpen(dr){
      dr.querySelector('#sb_volledig').onclick = () => { CRM.drawer.close(); CRM.ga('kandidaten',{id:c.id}); };
      dr.querySelector('#sb_plan').onclick = () => planAfspraak(c);
      const ib = dr.querySelector('#sb_intake'); if(ib) ib.onclick = () => intakeForm(c.id);
      dr.querySelector('#sb_ok').onclick = async () => {
        const g = id => dr.querySelector('#sb_'+id).value;
        const nieuweFase = g('fase');
        const patch = {datum:g('datum')||'', tijd:g('tijd')||'',
                       volgende_actie:g('actie').trim()||null, actie_datum:g('actiedat')||null};
        const note = g('note').trim();
        if(note){
          patch.notities = (c.notities||[]).concat([{op:new Date().toISOString(), door:CRM.me(), tekst:note}]);
        }
        await bewaarKand(c.id, patch);
        if(note){
          await CRM.logActiviteit('kandidaat', c.id, 'notitie', note);
          CRM.verwerkTags(note, 'kandidaat', c.id);
        }
        if(nieuweFase !== c.fase){
          CRM.drawer.close();
          faseWissel(c.id, nieuweFase);
        } else {
          CRM.toast('Opgeslagen','ok'); tekenKolommen(); snelBewerk(c.id);
        }
      };
    }});
}

/* ─── Afspraak inplannen vanuit de pijplijn-drawer ────────────── */
function planAfspraak(c){
  const titel = c.fase==='Voorselectie'
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
        tekenKolommen(); snelBewerk(c.id);
      }catch(e){ CRM.fout('Inplannen mislukt', e); }
    };
  }});
}

/* ─── Video-intakeformulier ───────────────────────────────────── */
const INTAKE_BLOKKEN = [
  {k:'situatie',   lbl:'Situatie nu',        hint:'Waar werkt hij nu, welk contract, welk rooster?'},
  {k:'drijfveren', lbl:'Drijfveren',         hint:'Waarom wil hij weg? Wat moet er beter?'},
  {k:'werkbeeld',  lbl:'Beeld van het werk', hint:'Weet hij wat het werk inhoudt? Fysiek, ploegen, temperatuur.'},
  {k:'toekomst',   lbl:'Toekomst',           hint:'Wat wil hij over een jaar? Vast contract, doorgroeien?'},
  {k:'risicos',    lbl:'Risico’s / tegenbod', hint:'Andere gesprekken, vervoer, taal, tegenbod huidige werkgever.'}
];
function intakeForm(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const it = c.intake || {};
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Video-intake · ${h(c.naam)}</div>
      <p class="sub" style="margin:6px 0 0">Kort en eerlijk invullen. Dit is wat de klant straks van ons verwacht te horen.</p></div>
    <div class="modal-b">
      ${INTAKE_BLOKKEN.map(b=>`
        <div class="f-row"><label for="it_${b.k}">${h(b.lbl)}</label>
          <textarea id="it_${b.k}" placeholder="${h(b.hint)}">${h(it[b.k]||'')}</textarea></div>`).join('')}
      <div class="f-grid">
        <div class="f-row"><label for="it_cijfer">Commitment (1–10)</label>
          <input type="number" id="it_cijfer" min="1" max="10" value="${it.cijfer!=null?h(it.cijfer):''}"></div>
        <div class="f-row"><label for="it_waarom">Waarom dat cijfer?</label>
          <input type="text" id="it_waarom" value="${h(it.waarom||'')}"></div>
      </div>
      <div class="f-row"><label for="it_samenvatting">Samenvatting voor de klant</label>
        <textarea id="it_samenvatting" placeholder="Drie zinnen die hem verkopen — feitelijk, geen verkooppraat.">${h(it.samenvatting || it.drijfveer || '')}</textarea></div>
      <div class="note err" id="it_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="it_ok">Intake opslaan</button></div>`, {onOpen(m){
      m.querySelector('#it_ok').onclick = async () => {
        const g = k => m.querySelector('#it_'+k).value.trim();
        const cijfer = g('cijfer') ? +g('cijfer') : null;
        const err = m.querySelector('#it_err');
        if(cijfer == null || cijfer < 1 || cijfer > 10){
          err.style.display=''; err.textContent = 'Geef een commitmentcijfer tussen 1 en 10.'; return;
        }
        if(!g('samenvatting')){ err.style.display=''; err.textContent = 'Vul een korte samenvatting in — die gebruiken we in het voorstel.'; return; }
        const intake = {op:new Date().toISOString(), door:CRM.me(), cijfer, waarom:g('waarom'),
                        samenvatting:g('samenvatting')};
        INTAKE_BLOKKEN.forEach(b => intake[b.k] = g(b.k));
        await bewaarKand(c.id, {intake});
        await CRM.logActiviteit('kandidaat', c.id, 'gesprek', `Video-intake afgenomen — commitment ${cijfer}/10`);
        CRM.modal.close(); CRM.toast('Intake opgeslagen','ok');
        tekenKolommen();
        if(document.getElementById('drawer')?.classList.contains('on')) snelBewerk(c.id);
      };
    }});
}

/* VERZOEK AAN CORE: crm_leads mist een kolom `belpogingen int default 0`.
   Zolang die er niet is leiden we het aantal belpogingen af uit
   crm_activiteiten (soort = 'bel'). Dat werkt, maar een teller in de rij
   zou sneller zijn zodra er duizenden leads in staan. */
})();
