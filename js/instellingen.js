/* ═══════════════════════════════════════════════════════════════
   MODULE: INSTELLINGEN (alleen voor Tjeerd)
   Pariteit met het bord-beheer: targets per maand (openCijfers/
   targets-tabel), profielen en rollen (openAdmin), export/import
   JSON (bord-compatibel) en een systeemoverzicht.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Targets ─────────────────────────────────────────────────── */
/* Het CRM leest de default onder '__default__', het oude bord onder
   '__default'. We schrijven allebei zodat beide apps synchroon blijven. */
const DEFAULT_KEYS = ['__default__','__default'];

function targetRij(maand){
  return CRM.state.targets.find(t => t.maand === maand);
}
async function zetTarget(maand, aantal){
  const sleutels = DEFAULT_KEYS.includes(maand) ? DEFAULT_KEYS : [maand];
  for(const k of sleutels){
    const t = targetRij(k);
    if(t) t.aantal = aantal; else CRM.state.targets.push({maand:k, aantal});
    if(!CRM.demo){
      const {error} = await CRM.sb.from('targets').upsert({maand:k, aantal});
      if(error) return CRM.fout('Target opslaan mislukt', error);
    }
  }
  CRM.toast(`Target ${DEFAULT_KEYS.includes(maand) ? 'standaard' : maand} → ${aantal}`, 'ok');
}

function maandLijst(){
  const nu = new Date();
  const maanden = new Set();
  for(let i = -2; i <= 5; i++){
    const d = new Date(nu.getFullYear(), nu.getMonth() + i, 1);
    maanden.add(d.toLocaleDateString('sv-SE').slice(0,7));
  }
  CRM.state.targets.forEach(t => { if(!DEFAULT_KEYS.includes(t.maand)) maanden.add(t.maand); });
  return Array.from(maanden).sort();
}
const MND = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const maandLabel = mk => { const [j,m] = mk.split('-'); const n = MND[+m-1]||mk; return n.charAt(0).toUpperCase()+n.slice(1)+' '+j; };

function sectieTargets(){
  const dflt = targetRij('__default__') || targetRij('__default');
  const mkNu = CRM.todayISO().slice(0,7);
  return `<div class="card"><div class="card-h"><div class="h2">Maandtargets</div>
      <div class="spacer"></div><span class="meta">netto plaatsingen per maand</span></div>
    <div class="card-b">
      <div class="in-target">
        <span class="label">Standaard (elke maand zonder eigen target)</span>
        <input type="number" min="0" data-target="__default__" value="${dflt ? h(dflt.aantal) : 8}">
      </div>
      <div class="tblwrap" style="margin-top:12px"><table class="tbl">
        <thead><tr><th>Maand</th><th class="n">Target</th><th class="n">Netto behaald</th><th class="n">Verschil</th></tr></thead>
        <tbody>${maandLijst().map(mk => {
          const t = targetRij(mk);
          const eff = t ? t.aantal : (dflt ? dflt.aantal : 8);
          const voorbij = mk <= mkNu;
          const pm = voorbij ? CRM.plaatsingenMaand(mk) : null;
          return `<tr class="${mk===mkNu?'in-nu':''}">
            <td>${h(maandLabel(mk))}${mk===mkNu?' <span class="chip green">nu</span>':''}${t?'':' <span class="meta">(standaard)</span>'}</td>
            <td class="n"><input type="number" min="0" data-target="${h(mk)}" value="${h(eff)}" class="in-tinp num"></td>
            <td class="n num">${pm ? pm.netto : '—'}</td>
            <td class="n num">${pm ? CRM.plusMin(pm.netto - eff) : '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="meta" style="margin:10px 2px 0">Netto = getekend − gestopt in die maand, dezelfde definitie als op het bord en in Recruitment.</p>
    </div></div>`;
}

/* ─── Team en rollen (openAdmin van het bord) ─────────────────── */
const ROLLEN = [['am','Account Manager'],['admin','Beheerder']];
/* Functie stuurt de dashboard-variant (marketeer krijgt een eigen kolom). */
const FUNCTIES = [['am','AM'],['recruiter','Recruiter'],['marketeer','Marketeer']];
function sectieTeam(){
  const profielen = (CRM.state.profiles||[]).slice().sort((a,b)=>String(a.naam||'').localeCompare(String(b.naam||'')));
  const rij = p => {
    const bekend = ROLLEN.some(([k]) => k === p.rol);
    return `<tr>
      <td><b>${h(p.naam||'—')}</b>${p.email?`<div class="rowsub">${h(p.email)}</div>`:''}</td>
      <td class="n"><select data-functie="${h(p.id)}" style="width:auto;min-width:130px">
        ${FUNCTIES.map(([k,l])=>`<option value="${k}" ${(p.functie||'am')===k?'selected':''}>${l}</option>`).join('')}
      </select></td>
      <td class="n"><select data-rol="${h(p.id)}" style="width:auto;min-width:170px">
        ${bekend ? '' : `<option value="${h(p.rol||'')}" selected>${h(p.rol||'—')} (huidig)</option>`}
        ${ROLLEN.map(([k,l])=>`<option value="${k}" ${p.rol===k?'selected':''}>${l}</option>`).join('')}
      </select></td></tr>`;
  };
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Team en rollen</div></div>
    <div class="card-b">
      ${profielen.length ? `<div class="tblwrap"><table class="tbl">
        <thead><tr><th>Gebruiker</th><th class="n">Functie</th><th class="n">Rol</th></tr></thead>
        <tbody>${profielen.map(rij).join('')}</tbody></table></div>`
      : CRM.ui.leeg('Geen gebruikers gevonden','Profielen verschijnen na de eerste login.')}
      <div class="note info" style="margin-top:14px"><b>Nieuwe collega uitnodigen:</b> Supabase-dashboard →
        Authentication → Users → <i>Invite user</i> met het @ploeggenoten.nl-adres. Na de eerste login verschijnt
        het profiel hier vanzelf — zet dan de rol goed. Beheerders mogen rollen wijzigen; financiële cijfers
        blijven altijd alleen voor de eigenaar zichtbaar.</div>
    </div></div>`;
}

/* ═══════════════════════════════════════════════════════════════
   MICROSOFT-KOPPELING
   De koppeling is per persoon: Tjeerd verbindt zijn eigen account,
   Bryan het zijne. Niemand kijkt via het CRM in andermans agenda of
   postvak. Is er geen app-registratie (of draaien we in demo), dan
   verschijnen deze blokken helemaal niet.
   ═══════════════════════════════════════════════════════════════ */
const msKlaar    = () => !!(CRM.outlook && CRM.outlook.beschikbaar?.());
const msVerbonden = () => !!(msKlaar() && CRM.outlook.verbonden?.());

/* Wat kan de koppeling, in gewone taal. De sleutel komt overeen met
   wat CRM.outlook.zelftest() teruggeeft. */
const MS_ONDERDELEN = [
  ['agenda',     'Agenda',     'Je komende afspraken zien en er vanuit het CRM een inplannen.'],
  ['taken',      'Taken',      'Een taak uit het CRM komt ook in Microsoft To Do te staan.'],
  ['mail',       'Mail',       'De mailwisseling met één klant of kandidaat terugzien op de kaart.'],
  ['contacten',  'Contacten',  'Contactpersonen in je adresboek zetten, zodat je telefoon laat zien wie er belt.'],
  ['documenten', 'Documenten', 'Zoeken in OneDrive en SharePoint. Er wordt niets gekopieerd of opgeslagen.'],
  ['teams',      'Teams',      'Meldingen naar een collega sturen in Teams.']
];

function msRegelHtml([sleutel, lbl, uitleg]){
  return `<div class="in-msrij" data-ms="${h(sleutel)}">
    <span class="in-msvink" aria-hidden="true">–</span>
    <span class="in-mswat"><b>${h(lbl)}</b><span class="meta">${h(uitleg)}</span></span>
  </div>`;
}

function sectieMicrosoft(){
  if(!msKlaar()) return '';
  const verbonden = msVerbonden();
  const adres = verbonden ? (CRM.outlook.accountNaam?.() || '') : '';
  const teamsUit = (() => { try{ return localStorage.getItem('crm_teams_uit') === '1'; }catch(e){ return false; } })();
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Microsoft-koppeling</div>
      <div class="spacer"></div><span class="meta">alleen voor jouw eigen account</span></div>
    <div class="card-b">
      <div class="in-msstatus">
        <div class="in-msnu">
          <b>${verbonden ? 'Verbonden' : 'Niet verbonden'}</b>
          <div class="meta">${verbonden
            ? 'als <span class="num">' + h(adres) + '</span>'
            : 'Verbind je Microsoft-account om agenda, mail, contacten en documenten in het CRM te gebruiken.'}</div>
        </div>
        <div class="row tight">
          ${verbonden
            ? '<button class="btn ghost sm" id="in_msuit">Verbreken</button>'
            : '<button class="btn sm" id="in_msaan">Verbinden</button>'}
        </div>
      </div>
      ${verbonden ? `<div class="in-msonderdelen" id="in_mslijst">${MS_ONDERDELEN.map(msRegelHtml).join('')}</div>
      <p class="meta in-mscheck">Onderdelen controleren…</p>
      <label class="in-msschakel"><input type="checkbox" id="in_teamsuit" ${teamsUit?'':'checked'}>
        <span><b>Teams-meldingen</b><span class="meta">Krijgt een collega een taak van je, dan stuurt het CRM hem een bericht in Teams. Zet uit als je dat liever niet hebt.</span></span></label>` : ''}
    </div></div>`;
}

/* Zelftest: per onderdeel één lichte aanroep. Faalt er één, dan blijft
   het streepje staan — geen paniekmelding, wel eerlijk. */
function msZelftest(mount){
  const lijst = mount.querySelector('#in_mslijst');
  const regel = mount.querySelector('.in-mscheck');
  if(!lijst || !CRM.outlook.zelftest) return;
  Promise.resolve(CRM.outlook.zelftest()).then(uit => {
    if(!uit){ if(regel) regel.textContent = 'Onderdelen konden niet worden gecontroleerd.'; return; }
    let mis = 0;
    lijst.querySelectorAll('[data-ms]').forEach(r => {
      const ok = !!uit[r.dataset.ms];
      if(!ok) mis++;
      const vink = r.querySelector('.in-msvink');
      vink.textContent = ok ? '✓' : '–';
      vink.classList.toggle('aan', ok);
      r.classList.toggle('uit', !ok);
    });
    if(regel) regel.textContent = mis
      ? `${mis} onderdeel${mis===1?'':'en'} doet het nog niet — meestal ontbreekt daarvoor een machtiging in Entra.`
      : 'Alle onderdelen doen het.';
  }).catch(e => {
    console.warn('zelftest', e);
    if(regel) regel.textContent = 'Onderdelen konden niet worden gecontroleerd.';
  });
}

/* ─── Outlook-contacten: alles in één keer synchroniseren ─────────
   Rustig aan, één voor één met een korte pauze: Microsoft knijpt bij
   bulkwerk de kraan dicht. Gaat het toch mis, dan stoppen we netjes
   met een melding in plaats van door te blijven proberen. */
const pauzeMs = ms => new Promise(r => setTimeout(r, ms));
let syncBezig = false;

function sectieContacten(){
  if(!msVerbonden()) return '';
  const alle = CRM.state.contacten || [];
  const bruikbaar = alle.filter(c => String(c.email||'').trim() || String(c.telefoon||'').trim());
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Outlook-contacten</div>
      <div class="spacer"></div><span class="meta"><span class="num">${bruikbaar.length}</span> van <span class="num">${alle.length}</span> met gegevens</span></div>
    <div class="card-b">
      <p class="sub" style="margin:0 0 12px">Zet alle contactpersonen uit het CRM in je eigen Outlook-adresboek.
        Belt iemand je, dan laat je telefoon meteen zien wie het is en bij welk bedrijf hij werkt.
        Bestaat de persoon al, dan wordt hij bijgewerkt — er komt niets dubbel te staan.</p>
      <div class="row"><button class="btn" id="in_ctsync">Alle contactpersonen synchroniseren</button></div>
      <div id="in_ctstatus" style="margin-top:12px"></div>
    </div></div>`;
}

async function syncContacten(knop, statusEl){
  if(syncBezig) return;
  const alle = CRM.state.contacten || [];
  const doen = alle.filter(c => String(c.email||'').trim() || String(c.telefoon||'').trim());
  const zonder = alle.length - doen.length;
  if(!doen.length){
    statusEl.innerHTML = '<div class="note info">Geen contactpersonen met een e-mailadres of telefoonnummer.</div>';
    return;
  }
  syncBezig = true;
  const oud = knop.textContent;
  knop.disabled = true; knop.textContent = 'Bezig…';
  let nieuw = 0, bij = 0, mislukt = 0, achterElkaar = 0, gestopt = '', gedaan = 0;
  for(let i = 0; i < doen.length; i++){
    const c = doen[i];
    statusEl.innerHTML = `<div class="note info">Bezig: <span class="num">${i+1}</span> van
      <span class="num">${doen.length}</span> — ${h(c.naam || 'zonder naam')}</div>`;
    let r = null;
    try{
      r = await CRM.outlook.zetContact({naam:c.naam, email:c.email, telefoon:c.telefoon,
                                        bedrijf:c.klant, functie:c.functie});
    }catch(e){
      console.warn('contacten synchroniseren', e);
      gestopt = e && e.message ? e.message : 'onbekende fout';
      break;
    }
    gedaan++;
    if(r && r.nieuw){ nieuw++; achterElkaar = 0; }
    else if(r){ bij++; achterElkaar = 0; }
    else {
      mislukt++; achterElkaar++;
      if(achterElkaar >= 3){ gestopt = 'drie contactpersonen achter elkaar mislukt'; break; }
    }
    await pauzeMs(180);
  }
  syncBezig = false;
  knop.disabled = false; knop.textContent = oud;
  const delen = [
    `<span class="num">${nieuw}</span> nieuw`,
    `<span class="num">${bij}</span> bijgewerkt`,
    mislukt ? `<span class="num">${mislukt}</span> mislukt` : '',
    zonder ? `<span class="num">${zonder}</span> overgeslagen zonder gegevens` : ''
  ].filter(Boolean).join(' · ');
  statusEl.innerHTML = gestopt
    ? `<div class="note warn">Gestopt na <span class="num">${gedaan}</span> van
        <span class="num">${doen.length}</span>: ${h(gestopt)}. Tot dan: ${delen}.
        Probeer het straks nog eens — je kunt gewoon opnieuw beginnen.</div>`
    : `<div class="note ok">Klaar: ${delen}.</div>`;
}

/* ─── Export / import (bord-compatibel JSON) ──────────────────── */
function exportJson(){
  const st = CRM.state;
  const targets = {}; let dflt = 8;
  st.targets.forEach(t => {
    if(DEFAULT_KEYS.includes(t.maand)) dflt = t.aantal;
    else targets[t.maand] = t.aantal;
  });
  const data = {
    app:'ploeggenoten-crm', geexporteerd_op:new Date().toISOString(),
    /* Bord-compatibel blok: het oude pijplijnbord kan dit bestand importeren. */
    cands: st.cands.map(CRM.rowToCand),
    clients: st.clients.map(c => ({naam:c.naam, contact:c.contact||'', locatie:c.locatie||''})),
    vacs: st.vacs.map(v => [v.klant, v.functie, v.type||'', v.aangemaakt||null]),
    sessions: st.ooSessions||[],
    targets, target:{maand:dflt},
    /* CRM-eigen data (het bord negeert dit blok). */
    crm: {leads:st.leads, activiteiten:st.activiteiten, taken:st.taken,
          documenten:st.documenten, kansen:st.kansen, contacten:st.contacten}
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ploeggenoten-crm-' + CRM.todayISO() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  CRM.toast('Export gedownload','ok');
}

async function importJson(file, statusEl){
  let d;
  try{ d = JSON.parse(await file.text()); }
  catch(e){ statusEl.innerHTML = '<div class="note err">Dit is geen geldig JSON-bestand.</div>'; return; }
  if(!d || !Array.isArray(d.cands) || !Array.isArray(d.vacs)){
    statusEl.innerHTML = '<div class="note err">Onbekend formaat — verwacht een export van het bord of van dit CRM (met cands en vacs).</div>';
    return;
  }
  const ja = await CRM.bevestig('Bord-data vervangen?',
    `Dit vervangt kandidaten (${d.cands.length}), klanten, vacatures, O&O-sessies en targets in de database. Leads en overige CRM-data blijven staan.`);
  if(!ja) return;
  statusEl.innerHTML = '<div class="note info">Bezig met importeren…</div>';
  const candRows = d.cands.map(c => CRM.candToRow(Object.assign({since:CRM.todayISO()}, c)));
  const clientRows = (d.clients||[]).map(c => ({naam:c.naam, contact:c.contact||'', locatie:c.locatie||''}));
  const vacRows = d.vacs.map(v => Array.isArray(v)
    ? {klant:v[0], functie:v[1], type:v[2]||'', aangemaakt:v[3]||null}
    : {klant:v.klant, functie:v.functie, type:v.type||'', aangemaakt:v.aangemaakt||null});
  const sessRows = (d.sessions||[]).map(s => ({id:s.id, klant:s.klant, functie:s.functie, datum:s.datum, locatie:s.locatie||''}));
  const targetRows = Object.entries(d.targets||{}).map(([maand,aantal]) => ({maand, aantal}));
  const dflt = d.target && d.target.maand != null ? d.target.maand : 8;
  DEFAULT_KEYS.forEach(k => targetRows.push({maand:k, aantal:dflt}));

  if(CRM.demo){
    Object.assign(CRM.state, {cands:candRows, clients:clientRows, vacs:vacRows, ooSessions:sessRows, targets:targetRows});
    statusEl.innerHTML = '<div class="note ok">Import geladen (demo: alleen in het geheugen).</div>';
    CRM.render(); return;
  }
  try{
    await Promise.all([
      CRM.sb.from('candidates').delete().neq('id','__never__'),
      CRM.sb.from('clients').delete().neq('naam','__never__'),
      CRM.sb.from('vacatures').delete().neq('klant','__never__'),
      CRM.sb.from('oo_sessions').delete().neq('id','__never__'),
      CRM.sb.from('targets').delete().neq('maand','__never__')
    ]);
    const stap = async (tabel, rijen) => {
      if(!rijen.length) return;
      const {error} = await CRM.sb.from(tabel).insert(rijen);
      if(error) throw new Error(tabel + ': ' + error.message);
    };
    await stap('candidates', candRows);
    await stap('clients', clientRows);
    await stap('vacatures', vacRows);
    await stap('oo_sessions', sessRows);
    await stap('targets', targetRows);
    statusEl.innerHTML = '<div class="note ok">Import geslaagd.</div>';
    await CRM.herlaad();
  }catch(e){
    statusEl.innerHTML = `<div class="note err">Import mislukt: ${h(e.message)} — controleer de database voor je verder werkt.</div>`;
    console.error('import', e);
  }
}

function sectieData(){
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Export en import</div></div>
    <div class="card-b">
      <p class="sub" style="margin:0 0 12px">De export bevat alle bord-data (kandidaten, klanten, vacatures, O&amp;O-sessies,
        targets) in het formaat dat ook het oude pijplijnbord kan inlezen, plus de CRM-data als extra blok.
        Import vervangt alleen de bord-data.</p>
      <div class="row">
        <button class="btn" id="in_export">Export JSON downloaden</button>
        <label class="btn ghost" style="cursor:pointer">Import JSON…
          <input type="file" id="in_import" accept=".json,application/json" style="display:none"></label>
      </div>
      <div id="in_impstatus" style="margin-top:12px"></div>
    </div></div>`;
}

/* ─── Systeem: welke tabellen zijn bereikbaar ─────────────────── */
const TABELLEN = [
  ['candidates','Kandidaten (bord)'], ['clients','Klanten (bord)'], ['vacatures','Vacatures (bord)'],
  ['targets','Targets (bord)'], ['oo_sessions','O&O-sessies (bord)'], ['profiles','Profielen'],
  ['crm_leads','Leads'], ['crm_activiteiten','Activiteiten'], ['crm_taken','Taken'],
  ['crm_documenten','Documenten'], ['crm_kansen','Kansen'], ['crm_contacten','Contacten'], ['crm_meldingen','Meldingen']
];
function sectieSysteem(){
  const rij = ([tabel, lbl]) => {
    const mist = !!CRM.state['_mist_'+tabel];
    return `<div class="in-sysrij"><span>${h(lbl)} <span class="meta num">${h(tabel)}</span></span>
      <span class="chip ${mist?'red':'green'}">${mist?'ontbreekt':'bereikbaar'}</span></div>`;
  };
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Systeem</div>
      <div class="spacer"></div><span class="meta">${CRM.demo?'demo-modus — database wordt niet aangeraakt':'live database'}</span></div>
    <div class="card-b">
      <div class="in-sys">${TABELLEN.map(rij).join('')}</div>
      <p class="meta" style="margin:12px 2px 0">Ontbreekt er een crm_-tabel, draai dan supabase/schema.sql in de SQL-editor.
        De bord-tabellen zijn gedeeld met het oude pijplijnbord en de finance-app.</p>
    </div></div>`;
}

/* ─── Module ──────────────────────────────────────────────────── */
CRM.registerModule('instellingen', {
  title:'Instellingen', icon:'⚙', onderschrift:'Targets, team, export en systeem',
  adminOnly:true,
  render(mount){
    mount.innerHTML = `<div class="in-wrap">${sectieTargets()}${sectieTeam()}${sectieMicrosoft()}${sectieContacten()}${sectieData()}${sectieSysteem()}</div>`;
    CRM.$$('[data-target]', mount).forEach(inp => inp.onchange = async () => {
      const v = Math.max(0, +inp.value || 0);
      await zetTarget(inp.dataset.target, v);
      CRM.render();                                  // verschil-kolom meteen bijwerken
    });
    CRM.$$('[data-functie]', mount).forEach(sel => sel.onchange = async () => {
      const p = (CRM.state.profiles||[]).find(x => String(x.id) === String(sel.dataset.functie));
      if(!p) return;
      p.functie = sel.value;
      if(!CRM.demo){
        const {error} = await CRM.sb.from('profiles').update({functie:sel.value}).eq('id', p.id);
        if(error) return CRM.fout('Functie opslaan mislukt', error);
      }
      CRM.toast(`Functie van ${p.naam||'gebruiker'} → ${sel.value}`, 'ok');
    });
    CRM.$$('[data-rol]', mount).forEach(sel => sel.onchange = async () => {
      const p = (CRM.state.profiles||[]).find(x => String(x.id) === String(sel.dataset.rol));
      if(!p) return;
      p.rol = sel.value;
      if(!CRM.demo){
        const {error} = await CRM.sb.from('profiles').update({rol:sel.value}).eq('id', p.id);
        if(error) return CRM.fout('Rol opslaan mislukt', error);
      }
      CRM.toast(`Rol van ${p.naam||'gebruiker'} → ${sel.value}`, 'ok');
    });
    /* ─── Microsoft-koppeling ───────────────────────────────── */
    const msAan = mount.querySelector('#in_msaan');
    if(msAan) msAan.onclick = async () => {
      msAan.disabled = true;
      const ok = await CRM.outlook.verbind();
      msAan.disabled = false;
      if(ok) CRM.render();
    };
    const msUit = mount.querySelector('#in_msuit');
    if(msUit) msUit.onclick = async () => {
      if(!await CRM.bevestig('Koppeling verbreken?',
        'Agenda, mail, contacten en documenten verdwijnen dan uit het CRM. Je kunt altijd opnieuw verbinden.')) return;
      await CRM.outlook.verbreek();
      CRM.render();
    };
    const teamsBox = mount.querySelector('#in_teamsuit');
    if(teamsBox) teamsBox.onchange = () => {
      try{
        if(teamsBox.checked) localStorage.removeItem('crm_teams_uit');
        else localStorage.setItem('crm_teams_uit','1');
      }catch(e){ console.warn('teams-vlag', e); }
      CRM.toast(teamsBox.checked ? 'Teams-meldingen staan aan' : 'Teams-meldingen staan uit','ok');
    };
    if(mount.querySelector('#in_mslijst')) msZelftest(mount);

    /* ─── Outlook-contacten ─────────────────────────────────── */
    const ctSync = mount.querySelector('#in_ctsync');
    if(ctSync) ctSync.onclick = () => syncContacten(ctSync, mount.querySelector('#in_ctstatus'));

    mount.querySelector('#in_export').onclick = exportJson;
    mount.querySelector('#in_import').onchange = e => {
      const f = e.target.files && e.target.files[0];
      if(f) importJson(f, mount.querySelector('#in_impstatus'));
      e.target.value = '';
    };
  }
});
})();
