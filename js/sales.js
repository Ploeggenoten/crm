/* ═══════════════════════════════════════════════════════════════
   MODULE: SALES — klantpijplijn, activiteiten, taken, documenten,
   kansen en de LinkedIn-leadverkenner.
   Bron van waarheid: clients.fase (salesfase) + crm_kansen.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;

/* ─── Voorkeuren onthouden (crm_sales_*) ───────────────────────── */
const V = {
  get(sleutel, standaard){
    try{ const r = localStorage.getItem('crm_sales_'+sleutel); return r===null ? standaard : JSON.parse(r); }
    catch(e){ return standaard; }
  },
  zet(sleutel, waarde){ try{ localStorage.setItem('crm_sales_'+sleutel, JSON.stringify(waarde)); }catch(e){} }
};

let tab      = V.get('tab','pijplijn');          // pijplijn | kansen
let weergave = V.get('weergave','bord');         // bord | lijst
let zoek     = V.get('zoek','');
let mijn     = V.get('mijn',false);
let eigFilter= V.get('eigenaar','');
let sortering= V.get('sort',{veld:'naam',op:1});
let sleepend = null;                             // naam van de kaart die gesleept wordt

const HANGT_NA = 21;                             // dagen in dezelfde fase = "blijft hangen"
const DOC_SOORTEN = ['SWO','offerte','overig'];
const KANS_BRONNEN = ['LinkedIn','Netwerk','Inbound','Referral','Koud gebeld','Beurs','Anders'];

/* ─── Kleine hulpjes ───────────────────────────────────────────── */
/* Klanten uit de oude database hebben nog geen salesfase. Wie al
   vacatures heeft is een lopende klant, de rest zetten we op Lead. */
const faseVan = k => k.fase || (CRM.vacaturesVan(k.naam).length ? 'Afgerond' : 'Lead');
const openVacatures = naam => CRM.vacaturesVan(naam).filter(v => (v.status||'Open')==='Open').length;
const kansenVan  = naam => (CRM.state.kansen||[]).filter(o => o.klant===naam);
const openKansen = naam => kansenVan(naam).filter(o => (o.status||'open')==='open');
const takenVan   = naam => (CRM.state.taken||[]).filter(t => t.entiteit==='klant' && t.ref===naam);
const contactenVan = naam => (CRM.state.contacten||[]).filter(c => c.klant===naam);
const docsVan    = naam => (CRM.state.documenten||[]).filter(d => d.entiteit==='klant' && d.ref===naam);
const volgendeTaak = naam => takenVan(naam).filter(t=>!t.klaar).sort((a,b)=>String(a.datum||'9').localeCompare(String(b.datum||'9')))[0] || null;
const eigenaren = () => [...new Set(CRM.state.clients.map(c=>c.eigenaar).filter(Boolean))].sort();

/* ─── Formulier-modaal (hergebruikt voor kans en taak) ─────────── */
function formModal(titel, velden, knop='Opslaan'){
  return new Promise(res => {
    const body = velden.map(v => {
      const id = 'fm_'+v.k;
      let inp;
      if(v.type==='select')
        inp = `<select id="${id}">${v.opts.map(o=>{
          const w = o.v!==undefined?o.v:o, l = o.l!==undefined?o.l:o;
          return `<option value="${h(w)}"${String(v.waarde)===String(w)?' selected':''}>${h(l)}</option>`;
        }).join('')}</select>`;
      else if(v.type==='textarea')
        inp = `<textarea id="${id}" placeholder="${h(v.ph||'')}">${h(v.waarde||'')}</textarea>`;
      else
        inp = `<input type="${v.type||'text'}" id="${id}" value="${h(v.waarde==null?'':v.waarde)}" placeholder="${h(v.ph||'')}">`;
      return `<div class="f-row"${v.breed?' style="grid-column:1/-1"':''}>
        <label for="${id}">${h(v.lbl)}</label>${inp}
        ${v.hint?`<span class="hint">${h(v.hint)}</span>`:''}</div>`;
    }).join('');
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">${h(titel)}</div></div>
      <div class="modal-b"><div class="f-grid">${body}</div></div>
      <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="fm_ok">${h(knop)}</button></div>`,
      {onOpen(m){
        m.querySelector('#fm_ok').onclick = () => {
          const uit = {}; velden.forEach(v => uit[v.k] = (m.querySelector('#fm_'+v.k).value||'').trim());
          CRM.modal.close(); res(uit);
        };
        m.querySelector('[data-mclose]').onclick = () => { CRM.modal.close(); res(null); };
        setTimeout(()=>m.querySelector('#fm_'+velden[0].k)?.focus(), 60);
      }});
  });
}

/* ─── Opslaan ──────────────────────────────────────────────────── */
async function zetFase(naam, nieuw){
  const k = CRM.klant(naam);
  if(!k || faseVan(k)===nieuw) return;
  const oud = faseVan(k);
  k.fase = nieuw; k.fase_sinds = CRM.todayISO();
  if(!CRM.demo){
    const {error} = await CRM.sb.from('clients').update({fase:nieuw, fase_sinds:k.fase_sinds}).eq('naam', naam);
    if(error){ k.fase = oud; teken(); return CRM.fout('Fase opslaan mislukt', error); }
  }
  CRM.logActiviteit('klant', naam, 'fase', `Fase gewijzigd: ${oud} → ${nieuw}`);
  CRM.toast(`${naam} → ${nieuw}`, 'ok');
  teken();
}

async function bewaarKlant(naam, wijzigingen){
  const k = CRM.klant(naam);
  if(!k) return false;
  Object.assign(k, wijzigingen);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('clients').update(wijzigingen).eq('naam', naam);
    if(error){ CRM.fout('Opslaan mislukt', error); return false; }
  }
  CRM.toast('Opgeslagen','ok');
  return true;
}

async function bewaarKans(rij){
  CRM.state.kansen.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_kansen').insert(rij);
    if(error){ CRM.state.kansen.shift(); return CRM.fout('Kans opslaan mislukt', error); }
  }
  CRM.logActiviteit('klant', rij.klant, 'notitie', `Kans toegevoegd: ${rij.titel}`);
  CRM.toast('Kans toegevoegd','ok');
}

async function zetKansStatus(id, status){
  const o = CRM.state.kansen.find(x=>x.id===id); if(!o) return;
  const oud = o.status; o.status = status;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_kansen').update({status}).eq('id', id);
    if(error){ o.status = oud; return CRM.fout('Bijwerken mislukt', error); }
  }
  CRM.toast(status==='gewonnen'?'Kans gewonnen':'Kans gesloten','ok');
  teken();
}

async function bewaarTaak(rij){
  CRM.state.taken.push(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_taken').insert(rij);
    if(error){ CRM.state.taken.pop(); return CRM.fout('Taak opslaan mislukt', error); }
  }
  CRM.toast('Taak toegevoegd','ok'); CRM.navBadges();
}

async function taakKlaar(id, klaar){
  const t = CRM.state.taken.find(x=>x.id===id); if(!t) return;
  t.klaar = klaar;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_taken').update({klaar}).eq('id', id);
    if(error){ t.klaar = !klaar; return CRM.fout('Taak bijwerken mislukt', error); }
  }
  CRM.navBadges();
}

/* Activiteit vastleggen + laatst_contact van de klant bijwerken. */
async function legVast(naam, soort){
  const s = CRM.ACT_SOORTEN[soort] || {lbl:soort};
  const tekst = await CRM.vraag(s.lbl + ' vastleggen bij ' + naam, {
    multiline:true, knop:'Vastleggen',
    placeholder: soort==='bel' ? 'Waar ging het gesprek over?' : 'Korte samenvatting…'
  });
  if(!tekst) return;
  await CRM.logActiviteit('klant', naam, soort, tekst);
  if(soort!=='notitie') await bewaarKlant(naam, {laatst_contact: CRM.todayISO()});
  else CRM.toast('Vastgelegd','ok');
  const dr = CRM.drawer.el();
  if(dr && dr.classList.contains('on')) tekenDrawer(dr, naam);
}

/* ─── KPI's ────────────────────────────────────────────────────── */
/* De KPI's volgen de actieve filters — zo krijgt een AM met "Mijn klanten"
   aan meteen zijn eigen cijfers te zien. */
function kpiHTML(alle){
  const maand = new Date().toISOString().slice(0,7);
  const actief = alle.filter(k=>CRM.SALES_ACTIEF.includes(faseVan(k)));
  const nieuw  = alle.filter(k=>faseVan(k)==='Lead' && String(k.fase_sinds||'').slice(0,7)===maand);
  const gespr  = alle.filter(k=>faseVan(k)==='Gesprek ingepland');
  const klant  = alle.filter(k=>faseVan(k)==='Afgerond');
  const conv   = alle.length ? Math.round(klant.length / alle.length * 100) : 0;

  /* Doorlooptijd = hoe lang de lopende trajecten al in hun huidige fase staan. */
  const dagen = actief.map(k=>CRM.dagenGeleden(k.fase_sinds)).filter(n=>n!=null);
  const gem = dagen.length ? Math.round(dagen.reduce((a,b)=>a+b,0)/dagen.length) : null;
  const hangen = actief.filter(k=>{ const d=CRM.dagenGeleden(k.fase_sinds); return d!=null && d>HANGT_NA; }).length;

  const inBeeld = new Set(alle.map(k=>k.naam));
  const open = (CRM.state.kansen||[]).filter(o=>(o.status||'open')==='open' && inBeeld.has(o.klant));
  const posities = open.reduce((s,o)=>s+(Number(o.aantal)||0),0);
  const gewogen  = open.reduce((s,o)=>s+((Number(o.waarde)||0)*(Number(o.kans_pct)||0)/100),0);

  const tegels = [
    CRM.ui.kpi('Actieve trajecten', `<span class="num">${actief.length}</span>`,
      hangen ? `<span style="color:var(--amber)">${hangen} langer dan ${HANGT_NA} dagen stil</span>` : 'allemaal in beweging', 'accent'),
    CRM.ui.kpi('Nieuwe leads deze maand', `<span class="num">${nieuw.length}</span>`, 'sinds ' + CRM.fmtDate(maand+'-01')),
    CRM.ui.kpi('Gesprekken ingepland', `<span class="num">${gespr.length}</span>`, 'kennismakingen in de agenda'),
    CRM.ui.kpi('Conversie naar klant', `<span class="num">${conv}%</span>`, `${klant.length} van ${alle.length} bedrijven in beeld`),
    CRM.ui.kpi('Gem. tijd in fase', gem==null?'—':`<span class="num">${gem}</span> <span style="font-size:16px;font-weight:500">dgn</span>`, 'over lopende trajecten'),
    CRM.canSeeMoney()
      ? CRM.ui.kpi('Gewogen kanswaarde', `<span class="num">${CRM.euro(gewogen)}</span>`, `${open.length} open kansen`)
      : CRM.ui.kpi('Open posities', `<span class="num">${posities}</span>`, `${open.length} open kansen`)
  ];
  return `<div class="grid c3 s-kpi">${tegels.join('')}</div>`;
}

/* ─── Bord ─────────────────────────────────────────────────────── */
function kaartHTML(k){
  const d = CRM.dagenGeleden(k.fase_sinds);
  const actief = CRM.SALES_ACTIEF.includes(faseVan(k));
  const hangt = actief && d!=null && d>HANGT_NA;
  const vac = openVacatures(k.naam);
  const kans = openKansen(k.naam).length;
  const taak = volgendeTaak(k.naam);
  return `<div class="bcard" draggable="true" data-klant="${h(k.naam)}">
    <div class="bc-t">${CRM.avatar(k.naam,'sm')}
      <div style="flex:1;min-width:0">
        <div class="bc-n trunc">${h(k.naam)}</div>
        <div class="bc-s trunc">${h(k.eigenaar||'geen eigenaar')}${k.locatie?' · '+h(k.locatie):''}</div>
      </div></div>
    <div class="bc-f">
      ${vac?`<span class="chip">${vac} vacature${vac===1?'':'s'}</span>`:''}
      ${kans?`<span class="chip blue">${kans} kans${kans===1?'':'en'}</span>`:''}
      ${d==null?'':`<span class="chip${hangt?' amber':''}" title="Dagen in deze fase"><span class="num">${d}</span> dgn</span>`}
    </div>
    ${taak?`<div class="s-taak trunc" title="${h(taak.tekst)}">✅ ${h(taak.tekst)} <span class="meta num">${h(CRM.fmtDateShort(taak.datum))}</span></div>`:''}
  </div>`;
}

function bordHTML(klanten){
  return `<div class="board" id="s_board">${CRM.SALES_FASES.map(f => {
    const in_ = klanten.filter(k => faseVan(k)===f.k);
    return `<div class="bcol" data-fase="${h(f.k)}">
      <div class="bcol-h" style="--ph:${f.c}"><b>${h(f.k)}</b><span class="cnt num">${in_.length}</span></div>
      <div class="bcol-b" data-drop="${h(f.k)}">
        ${in_.length ? in_.map(kaartHTML).join('') : `<div class="s-kolomleeg">${h(f.hint||'Nog leeg')}</div>`}
      </div></div>`;
  }).join('')}</div>`;
}

function bindBord(root){
  CRM.$$('.bcard', root).forEach(c => {
    c.ondragstart = e => { sleepend = c.dataset.klant; c.classList.add('drag');
      e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', sleepend); };
    c.ondragend = () => { c.classList.remove('drag'); CRM.$$('.bcol', root).forEach(x=>x.classList.remove('over')); };
    c.onclick = () => openKlant(c.dataset.klant);
  });
  CRM.$$('.bcol-b', root).forEach(b => {
    const kol = b.closest('.bcol');
    b.ondragover  = e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; kol.classList.add('over'); };
    b.ondragleave = e => { if(!b.contains(e.relatedTarget)) kol.classList.remove('over'); };
    b.ondrop = e => { e.preventDefault(); kol.classList.remove('over');
      const naam = e.dataTransfer.getData('text/plain') || sleepend;
      sleepend = null;
      if(naam) zetFase(naam, b.dataset.drop);
    };
  });
}

/* ─── Lijst ────────────────────────────────────────────────────── */
const LIJST_KOLOMMEN = [
  {k:'naam',  lbl:'Bedrijf'},
  {k:'fase',  lbl:'Fase'},
  {k:'eigenaar', lbl:'Eigenaar'},
  {k:'branche',  lbl:'Branche'},
  {k:'laatst_contact', lbl:'Laatste contact'},
  {k:'kansen', lbl:'Open kansen', n:true}
];
function lijstWaarde(k, veld){
  if(veld==='fase')   return CRM.SALES_FASES.findIndex(f=>f.k===faseVan(k));
  if(veld==='kansen') return openKansen(k.naam).length;
  if(veld==='laatst_contact') return k.laatst_contact || '';
  return String(k[veld]||'').toLowerCase();
}
function lijstHTML(klanten){
  if(!klanten.length) return CRM.ui.leeg('Geen bedrijven gevonden','Pas je zoekopdracht of filters aan.',
    '<button class="btn ghost" data-wis>Filters wissen</button>');
  const rijen = [...klanten].sort((a,b)=>{
    const x = lijstWaarde(a, sortering.veld), y = lijstWaarde(b, sortering.veld);
    return (x>y?1:x<y?-1:0) * sortering.op;
  });
  return `<div class="tblwrap"><table class="tbl">
    <thead><tr>${LIJST_KOLOMMEN.map(c=>`<th class="sortable${c.n?' n':''}" data-sort="${c.k}">${h(c.lbl)}${
      sortering.veld===c.k?` ${sortering.op>0?'↑':'↓'}`:''}</th>`).join('')}</tr></thead>
    <tbody>${rijen.map(k=>{
      const d = CRM.dagenGeleden(k.fase_sinds);
      const hangt = CRM.SALES_ACTIEF.includes(faseVan(k)) && d!=null && d>HANGT_NA;
      return `<tr class="clickable" data-klant="${h(k.naam)}">
        <td><div class="row tight" style="flex-wrap:nowrap">${CRM.avatar(k.naam,'sm')}
          <div style="min-width:0"><div style="font-weight:600">${h(k.naam)}</div>
          <div class="rowsub">${h(k.locatie||'')}</div></div></div></td>
        <td><span class="s-fase"><i style="background:${CRM.salesKleur(faseVan(k))}"></i>${h(faseVan(k))}</span>
          ${hangt?`<div class="rowsub" style="color:var(--amber)"><span class="num">${d}</span> dagen stil</div>`:''}</td>
        <td>${h(k.eigenaar||'—')}</td>
        <td>${h(k.branche||'—')}</td>
        <td class="num">${k.laatst_contact?h(CRM.fmtDate(k.laatst_contact)):'—'}
          ${k.laatst_contact?`<div class="rowsub">${h(CRM.geleden(k.laatst_contact))}</div>`:''}</td>
        <td class="n num">${openKansen(k.naam).length||'—'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

/* ─── Kansen-weergave ──────────────────────────────────────────── */
function kansenHTML(){
  const alle = (CRM.state.kansen||[]).filter(o=>{
    if(mijn && !CRM.isVanMij(o)) return false;
    if(eigFilter && o.eigenaar!==eigFilter) return false;
    if(zoek){ const q = zoek.toLowerCase();
      if(!(String(o.klant)+' '+o.titel+' '+(o.functie||'')).toLowerCase().includes(q)) return false; }
    return true;
  });
  const open = alle.filter(o=>(o.status||'open')==='open');
  if(!alle.length) return CRM.ui.leeg('Nog geen kansen',
    'Een kans is een concrete opdracht die je bij een klant ziet liggen: hoeveel posities, welke functie en wanneer die dicht moet.',
    '<button class="btn" data-nieuwekans>+ Eerste kans toevoegen</button>');

  const posities = open.reduce((s,o)=>s+(Number(o.aantal)||0),0);
  const gewogen  = open.reduce((s,o)=>s+((Number(o.waarde)||0)*(Number(o.kans_pct)||0)/100),0);
  const totaal   = open.reduce((s,o)=>s+(Number(o.waarde)||0),0);

  const samenvatting = CRM.canSeeMoney()
    ? `<div class="grid c3 s-kpi">
        ${CRM.ui.kpi('Open kansen', `<span class="num">${open.length}</span>`, `${posities} posities`)}
        ${CRM.ui.kpi('Pijplijnwaarde', `<span class="num">${CRM.euro(totaal)}</span>`, 'onvoorwaardelijk')}
        ${CRM.ui.kpi('Gewogen waarde', `<span class="num">${CRM.euro(gewogen)}</span>`, 'naar kans-percentage', 'accent')}</div>`
    : `<div class="grid c3 s-kpi">
        ${CRM.ui.kpi('Open kansen', `<span class="num">${open.length}</span>`, 'bij ' + new Set(open.map(o=>o.klant)).size + ' bedrijven')}
        ${CRM.ui.kpi('Open posities', `<span class="num">${posities}</span>`, 'te vullen plekken', 'accent')}
        ${CRM.ui.kpi('Gem. kans', `<span class="num">${open.length?Math.round(open.reduce((s,o)=>s+(Number(o.kans_pct)||0),0)/open.length):0}%</span>`, 'inschatting van de AM')}</div>`;

  return samenvatting + `
    <div class="tblwrap" style="margin-top:16px"><table class="tbl">
      <thead><tr>
        <th>Klant</th><th>Kans</th><th>Functie</th><th class="n">Posities</th>
        ${CRM.canSeeMoney()?'<th class="n">Waarde</th><th class="n">Gewogen</th>':''}
        <th class="n">Kans</th><th>Sluit op</th><th>Eigenaar</th><th>Bron</th><th></th>
      </tr></thead>
      <tbody>${alle.map(o=>{
        const dicht = (o.status||'open')!=='open';
        const dagen = CRM.dagenGeleden(o.sluit_datum);
        return `<tr class="clickable${dicht?' s-dicht':''}" data-kansklant="${h(o.klant)}">
          <td style="font-weight:600">${h(o.klant)}</td>
          <td>${h(o.titel)}${o.contactpersoon?`<div class="rowsub">${h(o.contactpersoon)}</div>`:''}</td>
          <td>${h(o.functie||'—')}</td>
          <td class="n num">${Number(o.aantal)||0}</td>
          ${CRM.canSeeMoney()?`<td class="n num">${CRM.euro(o.waarde)}</td>
            <td class="n num">${CRM.euro((Number(o.waarde)||0)*(Number(o.kans_pct)||0)/100)}</td>`:''}
          <td class="n num">${Number(o.kans_pct)||0}%</td>
          <td class="num">${o.sluit_datum?h(CRM.fmtDate(o.sluit_datum)):'—'}
            ${dagen!=null&&dagen>0&&!dicht?'<div class="rowsub" style="color:var(--red)">verlopen</div>':''}</td>
          <td>${h(o.eigenaar||'—')}</td>
          <td>${h(o.bron||'—')}</td>
          <td>${dicht?`<span class="chip ${o.status==='gewonnen'?'green':''}">${h(o.status)}</span>`
            :`<div class="row tight" style="flex-wrap:nowrap">
              <button class="btn sm ghost" data-kanswin="${h(o.id)}" title="Gewonnen">✓</button>
              <button class="btn sm sub" data-kansverlies="${h(o.id)}" title="Verloren">✕</button></div>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
}

async function nieuweKans(vasteKlant){
  const klanten = [...CRM.state.clients].map(c=>c.naam).sort();
  if(!klanten.length) return CRM.toast('Voeg eerst een bedrijf toe aan de pijplijn','err');
  const velden = [
    {k:'klant', lbl:'Klant', type:'select', opts:klanten, waarde: vasteKlant||klanten[0], breed:true},
    {k:'titel', lbl:'Titel van de kans', ph:'Bijv. 2 lassers Q3', breed:true},
    {k:'functie', lbl:'Functie', ph:'Lasser'},
    {k:'aantal', lbl:'Aantal posities', type:'number', waarde:1},
    {k:'kans_pct', lbl:'Kans (%)', type:'number', waarde:50},
    {k:'sluit_datum', lbl:'Verwachte sluitdatum', type:'date'},
    {k:'bron', lbl:'Bron', type:'select', opts:KANS_BRONNEN},
    {k:'contactpersoon', lbl:'Contactpersoon', ph:'Wie is je ingang?'}
  ];
  if(CRM.canSeeMoney())
    velden.splice(4, 0, {k:'waarde', lbl:'Geschatte fee (€)', type:'number', ph:'0', hint:'Alleen jij ziet bedragen.'});

  const uit = await formModal(vasteKlant?('Kans bij '+vasteKlant):'Nieuwe kans', velden, 'Kans opslaan');
  if(!uit) return;
  if(!uit.titel){ CRM.toast('Geef de kans een titel','err'); return; }
  const klant = CRM.klant(uit.klant);
  await bewaarKans({
    id: CRM.uid(), klant: uit.klant, titel: uit.titel, omschrijving:'',
    functie: uit.functie||'', aantal: Number(uit.aantal)||1,
    waarde: CRM.canSeeMoney() ? (uit.waarde===''?null:Number(uit.waarde)) : null,
    kans_pct: Number(uit.kans_pct)||50, fase: klant?faseVan(klant):'Nieuw',
    bron: uit.bron||'', linkedin_url:'', contactpersoon: uit.contactpersoon||'',
    eigenaar: CRM.me(), sluit_datum: uit.sluit_datum||null, status:'open', reden:''
  });
  const dr = CRM.drawer.el();
  if(dr && dr.classList.contains('on') && vasteKlant) tekenDrawer(dr, vasteKlant);
  else teken();
}

/* ─── Detailpaneel per klant ───────────────────────────────────── */
let dTab = 'overzicht';

function openKlant(naam){
  const k = CRM.klant(naam);
  if(!k) return CRM.toast('Bedrijf niet gevonden','err');
  dTab = 'overzicht';
  CRM.drawer.open('<div class="drawer-b" id="sd_root"></div>', {onOpen(dr){ tekenDrawer(dr, naam); }});
}

function tekenDrawer(dr, naam){
  const k = CRM.klant(naam); if(!k) return;
  const acts = CRM.activiteitenVoor('klant', naam);
  const taken = takenVan(naam);
  const telling = {
    activiteiten: acts.length,
    taken: taken.filter(t=>!t.klaar).length,
    documenten: docsVan(naam).length,
    kansen: openKansen(naam).length
  };
  dr.innerHTML = `
    <div class="drawer-h">
      ${CRM.avatar(naam,'lg')}
      <div style="min-width:0;flex:1">
        <div class="h2" style="font-size:19px">${h(naam)}</div>
        <div class="row tight" style="margin-top:6px">
          <span class="s-fase"><i style="background:${CRM.salesKleur(faseVan(k))}"></i>${h(faseVan(k))}</span>
          <span class="meta">${h(k.eigenaar||'geen eigenaar')}${k.branche?' · '+h(k.branche):''}${k.locatie?' · '+h(k.locatie):''}</span>
        </div>
      </div>
      <button class="btn sub x" data-close title="Sluiten">✕</button>
    </div>
    <div class="drawer-b">
      <div class="tabs" id="sd_tabs">
        ${[['overzicht','Overzicht',null],['activiteiten','Activiteiten',telling.activiteiten],
           ['taken','Taken',telling.taken],['documenten','Documenten',telling.documenten],
           ['kansen','Kansen',telling.kansen]]
          .map(([k2,lbl,n])=>`<button class="tab${dTab===k2?' on':''}" data-dtab="${k2}">${h(lbl)}${
            n?`<span class="cnt num">${n}</span>`:''}</button>`).join('')}
      </div>
      <div id="sd_body"></div>
    </div>
    <div class="drawer-f">
      <button class="btn ghost" data-volledig>Volledige klantkaart openen →</button>
      <div class="spacer"></div>
      <label class="meta" for="sd_fase">Fase</label>
      <select id="sd_fase" style="width:auto;min-width:190px">${
        CRM.SALES_FASES.map(f=>`<option value="${h(f.k)}"${faseVan(k)===f.k?' selected':''}>${h(f.k)}</option>`).join('')}</select>
    </div>`;

  CRM.$$('[data-close]', dr).forEach(b=>b.onclick=()=>CRM.drawer.close());
  CRM.$$('[data-dtab]', dr).forEach(b=>b.onclick=()=>{ dTab=b.dataset.dtab; tekenDrawer(dr, naam); });
  dr.querySelector('[data-volledig]').onclick = () => { CRM.drawer.close(); CRM.ga('klanten',{id:naam}); };
  dr.querySelector('#sd_fase').onchange = e => { zetFase(naam, e.target.value).then(()=>tekenDrawer(dr,naam)); };

  const body = dr.querySelector('#sd_body');
  body.innerHTML = tabInhoud(naam);
  bindTab(body, dr, naam);
}

function tabInhoud(naam){
  const k = CRM.klant(naam);
  if(dTab==='overzicht'){
    const cts = contactenVan(naam);
    const vacs = CRM.vacaturesVan(naam);
    const d = CRM.dagenGeleden(k.fase_sinds);
    return `
      <div class="card"><div class="card-h"><div class="h2">Kerngegevens</div>
        <button class="btn sm ghost" data-bewerk>Opslaan</button></div>
        <div class="card-b"><div class="f-grid">
          <div class="f-row"><label for="kg_eigenaar">Eigenaar (AM)</label>
            <input type="text" id="kg_eigenaar" value="${h(k.eigenaar||'')}" list="sd_eigenaren">
            <datalist id="sd_eigenaren">${eigenaren().map(e=>`<option value="${h(e)}">`).join('')}</datalist></div>
          <div class="f-row"><label for="kg_branche">Branche</label><input type="text" id="kg_branche" value="${h(k.branche||'')}"></div>
          <div class="f-row"><label for="kg_locatie">Plaats</label><input type="text" id="kg_locatie" value="${h(k.locatie||'')}"></div>
          <div class="f-row"><label for="kg_telefoon">Telefoon</label><input type="tel" id="kg_telefoon" value="${h(k.telefoon||'')}"></div>
          <div class="f-row"><label for="kg_email">E-mail</label><input type="email" id="kg_email" value="${h(k.email||'')}"></div>
          <div class="f-row"><label for="kg_website">Website</label><input type="text" id="kg_website" value="${h(k.website||'')}"></div>
          <div class="f-row" style="grid-column:1/-1"><label for="kg_note">Notitie</label>
            <textarea id="kg_note" placeholder="Wat moet je onthouden over dit bedrijf?">${h(k.note||'')}</textarea></div>
        </div>
        <div class="row" style="gap:18px;border-top:1px solid var(--line);padding-top:14px;margin-top:2px">
          <div><div class="label">In deze fase</div><div class="num">${d==null?'—':d+' dagen'}</div></div>
          <div><div class="label">Laatste contact</div><div class="num">${k.laatst_contact?h(CRM.fmtDate(k.laatst_contact)):'—'}</div></div>
          <div><div class="label">Open vacatures</div><div class="num">${openVacatures(naam)}</div></div>
          <div><div class="label">Klant sinds</div><div class="num">${k.sinds?h(CRM.fmtDate(k.sinds)):'—'}</div></div>
        </div></div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Contactpersonen</div>
        <span class="meta">${cts.length} bekend</span></div>
        <div class="card-b" style="padding-top:6px">${
          cts.length ? cts.map(c=>`<div class="s-ct">${CRM.avatar(c.naam,'sm')}
            <div style="flex:1;min-width:0"><b>${h(c.naam)}</b>${c.hoofd?' <span class="chip green">hoofdcontact</span>':''}
              <div class="meta">${h(c.functie||'')}</div></div>
            <div class="meta num" style="text-align:right">${h(c.telefoon||'')}<br>${h(c.email||'')}</div></div>`).join('')
          : CRM.ui.leeg('Nog geen contactpersoon','Contactpersonen beheer je op de volledige klantkaart.',
              '<button class="btn ghost" data-volledig2>Klantkaart openen →</button>')}</div></div>

      ${vacs.length?`<div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Vacatures</div></div>
        <div class="card-b" style="padding-top:6px">${vacs.map(v=>`<div class="s-ct">
          <div style="flex:1"><b>${h(v.functie)}</b><div class="meta">${h(v.locatie||'')} · ${h(v.status||'Open')}</div></div>
          <span class="chip"><span class="num">${v.aantal||1}</span> plek${(v.aantal||1)===1?'':'ken'}</span></div>`).join('')}</div></div>`:''}`;
  }

  if(dTab==='activiteiten'){
    const items = CRM.activiteitenVoor('klant', naam)
      .slice().sort((a,b)=>String(b.op).localeCompare(String(a.op)))
      .map(a=>{ const s = CRM.ACT_SOORTEN[a.soort]||{ico:'•',lbl:a.soort};
        return {ico:s.ico, titel:s.lbl+(a.door?' · '+a.door:''), wanneer:CRM.geleden(a.op), tekst:a.tekst}; });
    return `<div class="row tight s-actbar">
        ${[['bel','📞 Gebeld'],['mail','✉️ Mail'],['gesprek','🤝 Gesprek'],['notitie','📝 Notitie']]
          .map(([s,l])=>`<button class="btn ghost sm" data-act="${s}">${l}</button>`).join('')}
      </div>
      <div class="card"><div class="card-b">${
        items.length ? CRM.ui.tijdlijn(items)
        : CRM.ui.leeg('Nog geen activiteit','Leg vast wat je met dit bedrijf hebt gedaan — dan weet je collega het ook.')
      }</div></div>`;
  }

  if(dTab==='taken'){
    const t = takenVan(naam).slice().sort((a,b)=>(a.klaar?1:0)-(b.klaar?1:0) || String(a.datum||'9').localeCompare(String(b.datum||'9')));
    return `<div class="row tight s-actbar"><button class="btn sm" data-nieuwetaak>+ Taak toevoegen</button></div>
      <div class="card"><div class="card-b" style="padding-top:8px">${
        t.length ? t.map(x=>{
          const laat = !x.klaar && x.datum && CRM.dagenGeleden(x.datum)>0;
          return `<label class="s-taakrij${x.klaar?' af':''}">
            <input type="checkbox" data-taak="${h(x.id)}"${x.klaar?' checked':''}>
            <span style="flex:1;min-width:0">${h(x.tekst)}
              <span class="meta num"> · ${x.datum?h(CRM.fmtDateShort(x.datum)):'geen datum'}${x.voor?' · '+h(x.voor):''}</span></span>
            ${x.prioriteit==='Hoog'&&!x.klaar?'<span class="chip amber">hoog</span>':''}
            ${laat?'<span class="chip red">te laat</span>':''}</label>`;
        }).join('')
        : CRM.ui.leeg('Geen taken','Zet hier je vervolgstap zodat dit traject niet stil komt te liggen.',
            '<button class="btn" data-nieuwetaak>+ Eerste taak</button>')
      }</div></div>`;
  }

  if(dTab==='documenten'){
    const docs = docsVan(naam);
    return `<div class="row tight s-actbar">
        <select id="doc_soort" style="width:auto">${DOC_SOORTEN.map(s=>`<option>${h(s)}</option>`).join('')}</select>
        <label class="btn sm ghost" for="doc_file">📎 Bestand kiezen</label>
        <input type="file" id="doc_file" style="display:none">
        ${CRM.demo?'<span class="meta">Demo: uploads worden niet echt opgeslagen.</span>':''}
      </div>
      <div class="card"><div class="card-b" style="padding-top:8px">${
        docs.length ? DOC_SOORTEN.map(s=>{
          const g = docs.filter(d=>(d.soort||'overig')===s);
          if(!g.length) return '';
          return `<div class="label" style="margin:10px 0 6px">${h(s)}</div>` + g.map(d=>`<div class="s-ct">
            <div style="flex:1;min-width:0"><b class="trunc">${h(d.naam)}</b>
              <div class="meta">${h(d.door||'')} · ${h(CRM.geleden(d.op))}${d.grootte?` · ${Math.round(d.grootte/1024)} kB`:''}</div></div>
            <a class="btn sm ghost" href="${h(d.url)}" target="_blank" rel="noopener">Openen</a></div>`).join('');
        }).join('')
        : CRM.ui.leeg('Nog geen documenten','Zet hier de SWO, de offerte en andere afspraken — dan staat alles bij de klant zelf.')
      }</div></div>`;
  }

  /* kansen */
  const os = kansenVan(naam);
  return `<div class="row tight s-actbar"><button class="btn sm" data-nieuwekans>+ Kans toevoegen</button></div>
    <div class="card"><div class="card-b" style="padding-top:8px">${
      os.length ? os.map(o=>`<div class="s-ct">
        <div style="flex:1;min-width:0"><b>${h(o.titel)}</b>
          <div class="meta">${h(o.functie||'—')} · <span class="num">${Number(o.aantal)||0}</span> posities · kans <span class="num">${Number(o.kans_pct)||0}%</span>
          ${o.sluit_datum?' · sluit '+h(CRM.fmtDateShort(o.sluit_datum)):''}</div></div>
        ${CRM.canSeeMoney()?`<div class="num" style="font-weight:600">${CRM.euro(o.waarde)}</div>`:''}
        <span class="chip${(o.status||'open')==='gewonnen'?' green':''}">${h(o.status||'open')}</span></div>`).join('')
      : CRM.ui.leeg('Geen kansen bij dit bedrijf','Noteer wat hier te halen valt: functie, aantal posities en wanneer je het rond wilt hebben.',
          '<button class="btn" data-nieuwekans>+ Eerste kans</button>')
    }</div></div>`;
}

function bindTab(body, dr, naam){
  CRM.$$('[data-volledig2]', body).forEach(b=>b.onclick=()=>{ CRM.drawer.close(); CRM.ga('klanten',{id:naam}); });

  const bew = body.querySelector('[data-bewerk]');
  if(bew) bew.onclick = async () => {
    const w = {
      eigenaar: body.querySelector('#kg_eigenaar').value.trim(),
      branche:  body.querySelector('#kg_branche').value.trim(),
      locatie:  body.querySelector('#kg_locatie').value.trim(),
      telefoon: body.querySelector('#kg_telefoon').value.trim(),
      email:    body.querySelector('#kg_email').value.trim(),
      website:  body.querySelector('#kg_website').value.trim(),
      note:     body.querySelector('#kg_note').value.trim()
    };
    if(await bewaarKlant(naam, w)){ tekenDrawer(dr, naam); teken(); }
  };

  CRM.$$('[data-act]', body).forEach(b=>b.onclick=()=>legVast(naam, b.dataset.act));

  CRM.$$('[data-taak]', body).forEach(c=>c.onchange=async ()=>{
    await taakKlaar(c.dataset.taak, c.checked); tekenDrawer(dr, naam); teken();
  });
  CRM.$$('[data-nieuwetaak]', body).forEach(b=>b.onclick=async ()=>{
    const uit = await formModal('Nieuwe taak bij '+naam, [
      {k:'tekst', lbl:'Wat moet er gebeuren?', ph:'Bijv. nabellen over de SWO', breed:true},
      {k:'datum', lbl:'Datum', type:'date', waarde:CRM.todayISO()},
      {k:'prioriteit', lbl:'Prioriteit', type:'select', opts:[{v:'',l:'Normaal'},{v:'Hoog',l:'Hoog'}]},
      {k:'voor', lbl:'Voor wie', waarde:CRM.me()}
    ], 'Taak opslaan');
    if(!uit || !uit.tekst) return;
    await bewaarTaak({id:CRM.uid(), tekst:uit.tekst, datum:uit.datum||null, klaar:false,
      entiteit:'klant', ref:naam, voor:uit.voor||CRM.me(), door:CRM.me(), prioriteit:uit.prioriteit||''});
    tekenDrawer(dr, naam); teken();
  });

  CRM.$$('[data-nieuwekans]', body).forEach(b=>b.onclick=()=>nieuweKans(naam));

  const file = body.querySelector('#doc_file');
  if(file) file.onchange = async () => {
    const f = file.files[0]; if(!f) return;
    const soort = body.querySelector('#doc_soort').value;
    await uploadDoc(naam, f, soort);
    tekenDrawer(dr, naam);
  };
}

async function uploadDoc(naam, bestand, soort){
  const rij = {id:CRM.uid(), entiteit:'klant', ref:naam, naam:bestand.name, soort,
               url:'', grootte:bestand.size, door:CRM.me(), op:new Date().toISOString()};
  if(CRM.demo){
    rij.url = URL.createObjectURL(bestand);
    CRM.state.documenten.unshift(rij);
    CRM.toast('Demo: bestand alleen in dit venster zichtbaar');
    return;
  }
  const pad = `klant/${naam.replace(/[^\w.-]+/g,'_')}/${Date.now()}_${bestand.name.replace(/[^\w.-]+/g,'_')}`;
  const up = await CRM.sb.storage.from('crm-docs').upload(pad, bestand, {upsert:false});
  if(up.error) return CRM.fout('Uploaden mislukt', up.error);
  rij.url = CRM.sb.storage.from('crm-docs').getPublicUrl(pad).data.publicUrl;
  const {error} = await CRM.sb.from('crm_documenten').insert(rij);
  if(error) return CRM.fout('Document opslaan mislukt', error);
  CRM.state.documenten.unshift(rij);
  CRM.logActiviteit('klant', naam, 'doc', `Document toegevoegd: ${bestand.name} (${soort})`);
  CRM.toast('Document opgeslagen','ok');
}

/* ─── LinkedIn-leadverkenner ───────────────────────────────────── */
/* Eerlijk: er is nog géén koppeling met LinkedIn. De zoekvelden staan
   klaar, maar zoeken kan pas als er een export of API-sleutel is. Wat
   nu wél werkt is de plak-/CSV-import onderaan. */
let gevonden = [];   // {naam, branche, plaats}

function openLinkedIn(){
  gevonden = [];
  CRM.drawer.open(paneelHTML(), {onOpen: bindLinkedIn});
}

function paneelHTML(){
  return `
    <div class="drawer-h">
      <div style="min-width:0;flex:1">
        <div class="h2" style="font-size:19px">Leads zoeken op LinkedIn</div>
        <div class="sub">Bedrijven vinden en als lead in je pijplijn zetten</div>
      </div>
      <button class="btn sub x" data-close title="Sluiten">✕</button>
    </div>
    <div class="drawer-b">
      <div class="note info">
        <b>Live zoeken op LinkedIn kan nu nog niet.</b><br>
        LinkedIn geeft geen open toegang tot zoekresultaten. Om deze knop echt te laten
        zoeken is één van deze twee nodig:
        <ul style="margin:8px 0 0;padding-left:18px">
          <li>een <b>export uit LinkedIn Sales Navigator</b> (CSV met bedrijfsnamen), of</li>
          <li>een <b>scraping-dienst met API-sleutel</b> (bijv. PhantomBuster, Apify of Proxycurl) —
              die sleutel moet dan in de app worden gezet.</li>
        </ul>
        <span style="display:block;margin-top:8px">Tot die tijd zie je hieronder geen verzonnen
        bedrijven, maar kun je wel een lijst plakken die je zelf hebt.</span>
      </div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Zoekopdracht</div>
        <span class="chip">nog niet actief</span></div>
        <div class="card-b"><div class="f-grid">
          <div class="f-row"><label for="li_branche">Branche</label>
            <input type="text" id="li_branche" placeholder="Voedingsmiddelen, logistiek…"></div>
          <div class="f-row"><label for="li_regio">Regio</label>
            <input type="text" id="li_regio" placeholder="Zuid-Holland, straal 30 km"></div>
          <div class="f-row"><label for="li_functie">Functietitel contactpersoon</label>
            <input type="text" id="li_functie" placeholder="Operations manager, HR-manager"></div>
          <div class="f-row"><label for="li_grootte">Bedrijfsgrootte</label>
            <input type="text" id="li_grootte" placeholder="50–500 medewerkers"></div>
        </div>
        <button class="btn" id="li_zoek" disabled>🔎 Zoeken op LinkedIn</button>
        <span class="hint" style="margin-left:10px">Werkt zodra de koppeling er is. Je zoekopdracht wordt bewaard.</span>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Lijst inlezen</div></div>
        <div class="card-b">
          <div class="f-row"><label for="li_plak">Plak bedrijfsnamen of CSV</label>
            <textarea id="li_plak" style="min-height:130px" placeholder="Eén bedrijf per regel. Optioneel met branche en plaats, gescheiden door ; of komma:&#10;&#10;Van der Windt Verpakking; Verpakkingen; Honselersdijk&#10;Bakker Barendrecht; AGF; Barendrecht&#10;Verhoeven Metaal"></textarea>
            <span class="hint">Werkt met een kolomkop-regel uit Sales Navigator en met een simpele lijst namen.</span></div>
          <button class="btn ghost" id="li_lees">Lijst inlezen</button>
        </div></div>

      <div id="li_uit" style="margin-top:16px"></div>
    </div>`;
}

function bindLinkedIn(dr){
  CRM.$$('[data-close]', dr).forEach(b=>b.onclick=()=>CRM.drawer.close());
  ['branche','regio','functie','grootte'].forEach(v=>{
    const el = dr.querySelector('#li_'+v);
    el.value = V.get('li_'+v,'');
    el.oninput = () => V.zet('li_'+v, el.value);
  });
  dr.querySelector('#li_zoek').onclick = () => CRM.toast('Er is nog geen LinkedIn-koppeling','err');
  dr.querySelector('#li_lees').onclick = () => {
    const ruw = dr.querySelector('#li_plak').value;
    gevonden = leesLijst(ruw);
    if(!gevonden.length){ CRM.toast('Geen bedrijfsnamen gevonden','err'); return; }
    tekenGevonden(dr);
  };
  tekenGevonden(dr);
}

function leesLijst(ruw){
  const uit = [];
  const gezien = new Set();
  String(ruw||'').split(/\r?\n/).forEach(regel => {
    const delen = regel.split(/[;\t,]/).map(s=>s.trim());
    const naam = delen[0];
    if(!naam) return;
    if(/^(bedrijf|company|company name|account|organisatie|naam)$/i.test(naam)) return;  // kolomkop
    const sleutel = CRM.normKlant(naam);
    if(!sleutel || gezien.has(sleutel)) return;
    gezien.add(sleutel);
    uit.push({naam, branche:delen[1]||'', plaats:delen[2]||''});
  });
  return uit;
}

function tekenGevonden(dr){
  const el = dr.querySelector('#li_uit');
  if(!gevonden.length){
    el.innerHTML = `<div class="card"><div class="card-b">${
      CRM.ui.leeg('Nog geen resultaten','Zodra de koppeling er is verschijnen gevonden bedrijven hier. Tot dan: plak hierboven een lijst.')
    }</div></div>`;
    return;
  }
  const bestaatAl = g => CRM.state.clients.find(c => CRM.zelfdeKlant(c.naam, g.naam));
  const nieuw = gevonden.filter(g => !bestaatAl(g));
  el.innerHTML = `<div class="card"><div class="card-h">
      <div class="h2">Gevonden bedrijven</div><span class="meta">${gevonden.length} regels</span>
      <div class="spacer"></div>
      ${nieuw.length?`<button class="btn sm" id="li_alles">Alle ${nieuw.length} als lead toevoegen</button>`:''}
    </div><div class="card-b" style="padding-top:8px">${gevonden.map((g,i)=>{
      const al = bestaatAl(g);
      return `<div class="s-ct">
        <div style="flex:1;min-width:0"><b class="trunc">${h(g.naam)}</b>
          <div class="meta">${h([g.branche,g.plaats].filter(Boolean).join(' · ')||'geen extra gegevens')}</div></div>
        ${al ? `<span class="chip">staat al in ${h(faseVan(al))}</span>`
             : `<button class="btn sm ghost" data-lead="${i}">→ als lead toevoegen</button>`}</div>`;
    }).join('')}</div></div>`;

  CRM.$$('[data-lead]', el).forEach(b=>b.onclick=()=>maakLead(dr, gevonden[Number(b.dataset.lead)]));
  const alles = el.querySelector('#li_alles');
  if(alles) alles.onclick = async () => {
    const doen = gevonden.filter(g => !bestaatAl(g));
    if(!doen.length) return CRM.toast('Deze bedrijven staan er al in','err');
    if(!await CRM.bevestig(`${doen.length} bedrijven als lead toevoegen?`,'Ze komen in de kolom Lead te staan, met jou als eigenaar.')) return;
    for(const g of doen) await maakLead(null, g, true);
    tekenGevonden(dr); teken();
    CRM.toast(`${doen.length} leads toegevoegd`,'ok');
  };
}

async function maakLead(dr, g, stil){
  if(!g) return;
  if(CRM.state.clients.find(c=>CRM.zelfdeKlant(c.naam, g.naam))){
    if(!stil) CRM.toast('Dit bedrijf staat er al in','err');
    return;
  }
  const rij = {naam:g.naam, fase:'Lead', eigenaar:CRM.me(), branche:g.branche||'', locatie:g.plaats||'',
               fase_sinds:CRM.todayISO(), laatst_contact:null, telefoon:'', email:'', website:'',
               note:'Toegevoegd via de LinkedIn-leadverkenner'};
  CRM.state.clients.push(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('clients').insert(rij);
    if(error){ CRM.state.clients.pop(); return CRM.fout('Lead opslaan mislukt', error); }
  }
  CRM.logActiviteit('klant', g.naam, 'systeem', 'Als lead toegevoegd via de LinkedIn-leadverkenner');
  if(!stil){
    CRM.toast(g.naam + ' staat nu in Lead','ok');
    if(dr) tekenGevonden(dr);
    teken();
  }
}

/* ─── Hoofdweergave ────────────────────────────────────────────── */
let mountEl = null, actiesEl = null;

function gefilterd(){
  const q = zoek.trim().toLowerCase();
  return CRM.state.clients.filter(k => {
    if(mijn && !CRM.isVanMij(k)) return false;
    if(eigFilter && k.eigenaar !== eigFilter) return false;
    if(q && !(`${k.naam} ${k.branche||''} ${k.locatie||''} ${k.eigenaar||''}`).toLowerCase().includes(q)) return false;
    return true;
  });
}

function tekenActies(){
  if(!actiesEl) return;
  actiesEl.innerHTML = `
    <div class="searchbox"><input type="search" id="s_zoek" placeholder="Zoek bedrijf, branche of plaats" value="${h(zoek)}"></div>
    <select id="s_eig" style="width:auto;min-width:140px">
      <option value="">Alle eigenaren</option>
      ${eigenaren().map(e=>`<option value="${h(e)}"${eigFilter===e?' selected':''}>${h(e)}</option>`).join('')}
    </select>
    <span class="chip btn-like${mijn?' on':''}" id="s_mijn">Mijn klanten</span>
    <div class="seg" id="s_seg"${tab==='kansen'?' style="display:none"':''}>
      <button data-w="bord" class="${weergave==='bord'?'on':''}">Bord</button>
      <button data-w="lijst" class="${weergave==='lijst'?'on':''}">Lijst</button>
    </div>`;

  const inp = actiesEl.querySelector('#s_zoek');
  inp.oninput = CRM.debounce(()=>{ zoek = inp.value; V.zet('zoek',zoek); tekenInhoud(); }, 220);
  actiesEl.querySelector('#s_eig').onchange = e => { eigFilter = e.target.value; V.zet('eigenaar',eigFilter); tekenInhoud(); };
  actiesEl.querySelector('#s_mijn').onclick = () => { mijn = !mijn; V.zet('mijn',mijn); tekenActies(); tekenInhoud(); };
  CRM.$$('#s_seg button', actiesEl).forEach(b=>b.onclick=()=>{ weergave=b.dataset.w; V.zet('weergave',weergave); tekenActies(); tekenInhoud(); });
}

function tekenInhoud(){
  if(!mountEl) return;
  const klanten = gefilterd();
  const kansenN = (CRM.state.kansen||[]).filter(o=>(o.status||'open')==='open').length;

  const kop = `<div class="s-wrap">
    <div class="s-top">
      <div class="tabs">
        <button class="tab${tab==='pijplijn'?' on':''}" data-tab="pijplijn">Klantpijplijn<span class="cnt num">${klanten.length}</span></button>
        <button class="tab${tab==='kansen'?' on':''}" data-tab="kansen">Kansen<span class="cnt num">${kansenN}</span></button>
      </div>
      <div class="row tight s-acts">
        <button class="btn ghost" data-linkedin>🔎 Leads zoeken op LinkedIn</button>
        <button class="btn" data-nieuwekans>+ Nieuwe kans</button>
      </div>
    </div>`;

  if(tab==='kansen'){
    mountEl.innerHTML = kop + kansenHTML() + '</div>';
  } else if(weergave==='lijst'){
    mountEl.innerHTML = kop + kpiHTML(klanten) + '<div style="height:16px"></div>' + lijstHTML(klanten) + '</div>';
  } else {
    const leegBord = !klanten.length;
    mountEl.innerHTML = kop + kpiHTML(klanten) + '</div>' +
      (leegBord
        ? `<div class="s-wrap">${CRM.ui.leeg('Geen bedrijven in beeld',
            zoek||mijn||eigFilter ? 'Je filters verbergen alles. Wis ze om de hele pijplijn te zien.'
                                  : 'Voeg je eerste bedrijven toe via de leadverkenner.',
            zoek||mijn||eigFilter ? '<button class="btn ghost" data-wis>Filters wissen</button>'
                                  : '<button class="btn" data-linkedin>🔎 Leads zoeken</button>')}</div>`
        : bordHTML(klanten));
  }
  bindInhoud();
}

function bindInhoud(){
  CRM.$$('[data-tab]', mountEl).forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; V.zet('tab',tab); tekenActies(); tekenInhoud(); });
  CRM.$$('[data-linkedin]', mountEl).forEach(b=>b.onclick=openLinkedIn);
  CRM.$$('[data-nieuwekans]', mountEl).forEach(b=>b.onclick=()=>nieuweKans(null));
  CRM.$$('[data-wis]', mountEl).forEach(b=>b.onclick=()=>{
    zoek=''; mijn=false; eigFilter='';
    V.zet('zoek',''); V.zet('mijn',false); V.zet('eigenaar','');
    tekenActies(); tekenInhoud();
  });
  CRM.$$('[data-klant]', mountEl).forEach(r=>{ if(!r.classList.contains('bcard')) r.onclick=()=>openKlant(r.dataset.klant); });
  CRM.$$('[data-kansklant]', mountEl).forEach(r=>r.onclick=e=>{
    if(e.target.closest('button')) return;
    openKlant(r.dataset.kansklant);
  });
  CRM.$$('[data-kanswin]', mountEl).forEach(b=>b.onclick=e=>{ e.stopPropagation(); zetKansStatus(b.dataset.kanswin,'gewonnen'); });
  CRM.$$('[data-kansverlies]', mountEl).forEach(b=>b.onclick=e=>{ e.stopPropagation(); zetKansStatus(b.dataset.kansverlies,'verloren'); });
  CRM.$$('th[data-sort]', mountEl).forEach(t=>t.onclick=()=>{
    if(sortering.veld===t.dataset.sort) sortering.op = -sortering.op;
    else sortering = {veld:t.dataset.sort, op:1};
    V.zet('sort',sortering); tekenInhoud();
  });
  const bord = mountEl.querySelector('#s_board');
  if(bord) bindBord(bord);
}

function teken(){ tekenInhoud(); CRM.navBadges(); }

/* ─── Registratie ──────────────────────────────────────────────── */
CRM.registerModule('sales', {
  title:'Sales', icon:'◈', onderschrift:'Klantpijplijn, kansen en activiteiten',
  volleBreedte:true,
  badge(){
    const vandaag = CRM.todayISO();
    return (CRM.state.taken||[]).filter(t => t.entiteit==='klant' && !t.klaar && t.datum && t.datum<=vandaag).length;
  },
  render(mount, acties, params){
    mountEl = mount; actiesEl = acties;
    tekenActies();
    tekenInhoud();
    if(params && params.id && CRM.klant(params.id)) setTimeout(()=>openKlant(params.id), 60);
  }
});

})();

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN CORE
   0. BELANGRIJK — bug in css/base.css: `.scrim` heeft geen
      `pointer-events:none` zolang hij niet `.on` is. Zodra één module
      een modaal of drawer heeft geopend en weer gesloten, blijft er een
      onzichtbaar vlak over het hele scherm liggen en is de app niet
      meer klikbaar. Gevonden bij het testen van sales (een gesloten
      "Nieuwe lead"-modaal van recruitment blokkeerde het hele bord).
      Graag in base.css zetten:
          .scrim{pointer-events:none}
          .scrim.on{pointer-events:auto}
      Zolang dat niet gebeurd is staat dezelfde regel als noodverband
      bovenin css/sales.css — die mag weg zodra base.css klopt.
   1. `crm_contacten` wordt niet door `CRM.load()` opgehaald en
      `CRM.state.contacten` staat niet in de begintoestand. In demo
      vult demo.js het wel. Graag toevoegen aan CRM.load() en aan
      CRM.state, anders blijft het tabblad Contactpersonen in
      productie altijd leeg. (Sales leest nu defensief
      `CRM.state.contacten || []`.)
   2. De tabel `clients` heeft geen aanmaakdatum en geen fase-historie.
      Daardoor is "nieuwe leads deze maand" nu afgeleid van
      `fase_sinds` en is de conversie lead→klant een momentopname
      (aandeel bedrijven in fase 'Afgerond'), niet een echte
      cohort-conversie. Voorstel: kolom `aangemaakt date default now()`
      op clients, plus `fase_historie jsonb default '[]'` die bij elke
      fasewissel wordt aangevuld — dan kunnen sales én performance
      echte doorlooptijden per fase tonen.
   3. `CRM.registerModule` kent geen `group`; de navigatiegroepen staan
      hard in core.js. Prima zo, alleen ter info genoteerd.
   ═══════════════════════════════════════════════════════════════ */
