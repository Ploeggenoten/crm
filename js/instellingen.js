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
function sectieTeam(){
  const profielen = (CRM.state.profiles||[]).slice().sort((a,b)=>String(a.naam||'').localeCompare(String(b.naam||'')));
  const rij = p => {
    const bekend = ROLLEN.some(([k]) => k === p.rol);
    return `<tr>
      <td><b>${h(p.naam||'—')}</b>${p.email?`<div class="rowsub">${h(p.email)}</div>`:''}</td>
      <td class="n"><select data-rol="${h(p.id)}" style="width:auto;min-width:170px">
        ${bekend ? '' : `<option value="${h(p.rol||'')}" selected>${h(p.rol||'—')} (huidig)</option>`}
        ${ROLLEN.map(([k,l])=>`<option value="${k}" ${p.rol===k?'selected':''}>${l}</option>`).join('')}
      </select></td></tr>`;
  };
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Team en rollen</div></div>
    <div class="card-b">
      ${profielen.length ? `<div class="tblwrap"><table class="tbl">
        <thead><tr><th>Gebruiker</th><th class="n">Rol</th></tr></thead>
        <tbody>${profielen.map(rij).join('')}</tbody></table></div>`
      : CRM.ui.leeg('Geen gebruikers gevonden','Profielen verschijnen na de eerste login.')}
      <div class="note info" style="margin-top:14px"><b>Nieuwe collega uitnodigen:</b> Supabase-dashboard →
        Authentication → Users → <i>Invite user</i> met het @ploeggenoten.nl-adres. Na de eerste login verschijnt
        het profiel hier vanzelf — zet dan de rol goed. Beheerders mogen rollen wijzigen; financiële cijfers
        blijven altijd alleen voor de eigenaar zichtbaar.</div>
    </div></div>`;
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
    mount.innerHTML = `<div class="in-wrap">${sectieTargets()}${sectieTeam()}${sectieData()}${sectieSysteem()}</div>`;
    CRM.$$('[data-target]', mount).forEach(inp => inp.onchange = async () => {
      const v = Math.max(0, +inp.value || 0);
      await zetTarget(inp.dataset.target, v);
      CRM.render();                                  // verschil-kolom meteen bijwerken
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
    mount.querySelector('#in_export').onclick = exportJson;
    mount.querySelector('#in_import').onchange = e => {
      const f = e.target.files && e.target.files[0];
      if(f) importJson(f, mount.querySelector('#in_impstatus'));
      e.target.value = '';
    };
  }
});
})();
