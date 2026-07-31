/* ═══════════════════════════════════════════════════════════════
   MODULE: SALES — klantpijplijn, activiteiten, taken, documenten,
   kansen en de Leadradar (bedrijven die nú personeel werven).
   Bron van waarheid: clients.fase (salesfase) + crm_kansen +
   crm_leadradar (gevuld door de Edge Function 'lead-radar').
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

let tab      = V.get('tab','pijplijn');          // pijplijn | kansen | radar
if(!['pijplijn','kansen','radar'].includes(tab)) tab = 'pijplijn';
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
/* Alleen echte weblinks openen — een `javascript:`-URL in een documentveld
   mag niet uitgevoerd worden als iemand erop klikt. */
const veiligeUrl = u => {
  const s = String(u||'').trim();
  return /^(https?:|blob:)/i.test(s) ? s : '';
};

/* ─── Formulier-modaal (kans en inplannen; taken gaan via CRM.taakModal) ── */
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
      else if(v.type==='check')
        return `<div class="f-row" style="grid-column:1/-1">
          <label class="check"><input type="checkbox" id="${id}"${v.waarde?' checked':''}> ${h(v.lbl)}</label></div>`;
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
          const uit = {}; velden.forEach(v => uit[v.k] = v.type==='check'
            ? m.querySelector('#fm_'+v.k).checked
            : (m.querySelector('#fm_'+v.k).value||'').trim());
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
  const oud = faseVan(k), oudSinds = k.fase_sinds;
  k.fase = nieuw; k.fase_sinds = CRM.todayISO();
  if(!CRM.demo){
    const {error} = await CRM.sb.from('clients').update({fase:nieuw, fase_sinds:k.fase_sinds}).eq('naam', naam);
    /* Ook fase_sinds terugdraaien — anders staat er na een mislukte
       wissel "0 dagen" in de oude fase en lijkt het traject vers. */
    if(error){ k.fase = oud; k.fase_sinds = oudSinds; teken(); return CRM.fout('Fase opslaan mislukt', error); }
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
    hint:'@naam om een collega te melden',
    placeholder: soort==='bel' ? 'Waar ging het gesprek over?' : 'Korte samenvatting…'
  });
  if(!tekst) return;
  await CRM.logActiviteit('klant', naam, soort, tekst);
  CRM.verwerkTags(tekst, 'klant', naam);
  if(soort!=='notitie') await bewaarKlant(naam, {laatst_contact: CRM.todayISO()});
  /* Ná bewaarKlant, want die roept zelf "Opgeslagen" — en dat is precies
     dezelfde melding als bij het bewaren van de kerngegevens. Je zag dus
     niet of je telefoontje was vastgelegd of dat er iets anders gebeurde.
     Nu staat er wát er is vastgelegd en bij wie. */
  CRM.toast(`${s.lbl} vastgelegd bij ${naam}`, 'ok');
  const dr = CRM.drawer.el();
  if(dr && dr.classList.contains('on')) tekenDrawer(dr, naam);
}

/* ─── KPI's ────────────────────────────────────────────────────── */
/* De KPI's volgen de actieve filters — zo krijgt een AM met "Mijn klanten"
   aan meteen zijn eigen cijfers te zien. */
function kpiHTML(alle){
  const actief = alle.filter(k=>CRM.SALES_ACTIEF.includes(faseVan(k)));
  const gespr  = alle.filter(k=>faseVan(k)==='Gesprek ingepland');
  const klant  = alle.filter(k=>faseVan(k)==='Afgerond');
  const conv   = alle.length ? Math.round(klant.length / alle.length * 100) : 0;

  /* Doorlooptijd hoort bij de tegel waar hij onder staat: hoe lang de
     ingeplande gesprekken al in díe fase staan. Eerder werd hier het
     gemiddelde over álle actieve trajecten getoond — inclusief de bak
     geïmporteerde leads — onder het label "gesprekken ingepland".
     Negatieve waarden (fase_sinds in de toekomst) tellen niet mee. */
  const dagen = gespr.map(k=>CRM.dagenGeleden(k.fase_sinds)).filter(n=>n!=null && n>=0);
  const gem = dagen.length ? Math.round(dagen.reduce((a,b)=>a+b,0)/dagen.length) : null;
  /* 'Stil' telt niet in de fase Lead — anders domineert de bak geïmporteerde
     leads dit signaal en zie je echte stilvallers niet meer. */
  const hangen = actief.filter(k=>{ if(faseVan(k)==='Lead') return false;
    const d=CRM.dagenGeleden(k.fase_sinds); return d!=null && d>HANGT_NA; }).length;

  const inBeeld = new Set(alle.map(k=>k.naam));
  const open = (CRM.state.kansen||[]).filter(o=>(o.status||'open')==='open' && inBeeld.has(o.klant));
  const posities = open.reduce((s,o)=>s+(Number(o.aantal)||0),0);
  const gewogen  = open.reduce((s,o)=>s+((Number(o.waarde)||0)*(Number(o.kans_pct)||0)/100),0);

  const tegels = [
    CRM.ui.kpi('Actieve trajecten', `<span class="num">${actief.length}</span>`,
      hangen ? `<span style="color:var(--amber)">${hangen} langer dan ${HANGT_NA} dagen stil</span>` : 'allemaal in beweging', 'accent'),
    CRM.ui.kpi('Gesprekken ingepland', `<span class="num">${gespr.length}</span>`,
      gem==null ? 'kennismakingen in de agenda' : `kennismakingen · gemiddeld <span class="num">${gem}</span> dgn in fase`),
    CRM.ui.kpi('Conversie naar klant', `<span class="num">${conv}%</span>`, `${klant.length} van ${alle.length} bedrijven in beeld`),
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
  /* In de fase Lead is lang liggen normaal (117 stuks na de import) — daar
     blijft de teller neutraal, anders is heel het bord oranje en betekent
     oranje niets meer. Amber alleen bij actieve trajecten die stilvallen. */
  const hangt = actief && faseVan(k) !== 'Lead' && d!=null && d>HANGT_NA;
  const vac = openVacatures(k.naam);
  const kans = openKansen(k.naam).length;
  const taak = volgendeTaak(k.naam);
  return `<div class="bcard" draggable="true" data-klant="${h(k.naam)}">
    <div class="bc-t">
      <div style="flex:1;min-width:0">
        <div class="bc-n trunc">${h(k.naam)}</div>
        <div class="bc-s trunc">${h(k.eigenaar||'geen eigenaar')}${k.locatie?' · '+h(k.locatie):''}</div>
      </div></div>
    <div class="bc-f">
      ${vac?`<span class="chip">${vac} vacature${vac===1?'':'s'}</span>`:''}
      ${kans?`<span class="chip blue">${kans} kans${kans===1?'':'en'}</span>`:''}
      ${d==null?'':`<span class="chip${hangt?' amber':''}" title="Dagen in deze fase"><span class="num">${d}</span> dgn</span>`}
    </div>
    ${taak?`<div class="s-taak trunc" title="${h(taak.tekst)}">${h(taak.tekst)} <span class="meta num">${h(CRM.fmtDateShort(taak.datum))}</span></div>`:''}
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
      const hangt = CRM.SALES_ACTIEF.includes(faseVan(k)) && faseVan(k) !== 'Lead' && d!=null && d>HANGT_NA;
      return `<tr class="clickable" data-klant="${h(k.naam)}">
        <td><div style="font-weight:600">${h(k.naam)}</div>
          <div class="rowsub">${h(k.locatie||'')}</div></td>
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
      <button class="btn ghost" data-plan>Inplannen</button>
      <div class="spacer"></div>
      <label class="meta" for="sd_fase">Fase</label>
      <select id="sd_fase" style="width:auto;min-width:190px">${
        CRM.SALES_FASES.map(f=>`<option value="${h(f.k)}"${faseVan(k)===f.k?' selected':''}>${h(f.k)}</option>`).join('')}</select>
    </div>`;

  CRM.$$('[data-close]', dr).forEach(b=>b.onclick=()=>CRM.drawer.close());
  CRM.$$('[data-dtab]', dr).forEach(b=>b.onclick=()=>{ dTab=b.dataset.dtab; tekenDrawer(dr, naam); });
  dr.querySelector('[data-volledig]').onclick = () => { CRM.drawer.close(); CRM.ga('klanten',{id:naam}); };
  dr.querySelector('[data-plan]').onclick = () => planKennismaking(k, () => tekenDrawer(dr, naam));
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
          cts.length ? cts.map(c=>`<div class="s-ct">
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
      .map(a=>{ const s = CRM.ACT_SOORTEN[a.soort]||{lbl:a.soort};
        return {titel:s.lbl+(a.door?' · '+a.door:''), wanneer:CRM.geleden(a.op), tekst:a.tekst}; });
    return `<div class="row tight s-actbar">
        ${[['bel','Gebeld'],['mail','Mail'],['gesprek','Gesprek'],['notitie','Notitie']]
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
        <label class="btn sm ghost" for="doc_file">Bestand kiezen</label>
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
            ${veiligeUrl(d.url) ? `<a class="btn sm ghost" href="${h(veiligeUrl(d.url))}" target="_blank" rel="noopener">Openen</a>` : '<span class="meta">geen link</span>'}</div>`).join('');
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
  /* Het gedeelde taakvenster van core — toewijzen aan een collega,
     prioriteit en Outlook zitten daar al in. */
  CRM.$$('[data-nieuwetaak]', body).forEach(b=>b.onclick=async ()=>{
    const rij = await CRM.taakModal({entiteit:'klant', ref:naam, refLabel:naam});
    if(rij){ tekenDrawer(dr, naam); teken(); }
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

/* ─── Afspraak inplannen ───────────────────────────────────────────
   Eén venster voor de hele app: js/klanten.js levert het via
   CRM.klantInplannen (contactpersonen aanvinken, soort afspraak,
   opvolgtaak). Hier dus géén tweede formulier. ─────────────────── */
function planKennismaking(k, na){
  if(typeof CRM.klantInplannen !== 'function')
    return CRM.toast('Inplannen is nu niet beschikbaar','err');
  CRM.klantInplannen(k, {na});
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

/* ─── Leadradar ────────────────────────────────────────────────
   De Edge Function 'lead-radar' vult crm_leadradar dagelijks met
   bedrijven die nu blue-collar personeel werven. Core laadt die
   tabel (nog) niet — deze module haalt hem zelf op en degradeert
   netjes als de tabel nog niet bestaat.                          */
let radar = [];              // rijen uit crm_leadradar
let radarStatus = '';        // '' = nog niet geladen | 'ok' | 'mist'
let radarBezigMet = null;    // lopende laad-belofte
let rFilter = V.get('r_status','nieuw');   // nieuw | toegevoegd | genegeerd | alles
if(!['nieuw','toegevoegd','genegeerd','alles'].includes(rFilter)) rFilter = 'nieuw';
let rZoek = '', rBron = '';
let rZoeken = false;         // "Nu zoeken" loopt

/* Alleen echte weblinks in de tabel — een vacature-URL uit de database
   mag nooit een javascript:-URL zijn die bij een klik uitvoert. */
const veiligeHttp = u => {
  const s = String(u||'').trim();
  return /^https?:\/\//i.test(s) ? s : '';
};

function laadRadar(force){
  if(radarStatus==='ok' && !force) return Promise.resolve();
  if(radarBezigMet) return radarBezigMet;
  radarBezigMet = (async () => {
    if(CRM.demo){ if(!radar.length) radar = demoRadar(); radarStatus = 'ok'; return; }
    try{
      const r = await CRM.sb.from('crm_leadradar').select('*').order('laatst_gezien',{ascending:false});
      if(r.error){
        if(!/does not exist|schema cache|relation/i.test(r.error.message||''))
          console.warn('Laden crm_leadradar', r.error);
        radarStatus = 'mist'; radar = []; return;
      }
      radar = r.data || []; radarStatus = 'ok';
    }catch(e){ console.warn('Laden crm_leadradar', e); radarStatus = 'mist'; radar = []; }
  })().finally(()=>{ radarBezigMet = null; });
  return radarBezigMet;
}

/* Demo: verzonnen maar echt-aandoende NL productie/logistiek-bedrijven.
   Alleen in het geheugen — er wordt niets naar de database geschreven. */
function demoRadar(){
  const d = n => new Date(Date.now()+n*86400000).toLocaleDateString('sv-SE');
  return [
    ['Koelvers Logistiek Bleiswijk','Bleiswijk','orderpicker, heftruckchauffeur',6,'adzuna','€2.500–2.900','nieuw',''],
    ['Bakkerij Duinrand','Katwijk','productiemedewerker, inpakmedewerker',5,'adzuna','€2.400–2.800','nieuw',''],
    ['Staalservice Rijnmond','Rotterdam','machinebediende, lasser',4,'adzuna','€3.100–3.700','nieuw',''],
    ['Verspakket Westland','Naaldwijk','productiemedewerker, orderpicker',4,'adzuna','','nieuw',''],
    ['Drankenhandel Van Rijnsoever','Gouda','verlader, logistiek medewerker',3,'adzuna','€2.600–3.000','nieuw',''],
    ['Plastiflex Verpakkingen','Waddinxveen','operator productie',3,'claude-research','','nieuw',''],
    ['Kaasrijperij De Gouwe','Bodegraven','productiemedewerker',3,'adzuna','€2.500–2.850','nieuw',''],
    ['AGF Sorteercentrum Zuidplas','Moordrecht','productiemedewerker, teamleider logistiek',3,'adzuna','€2.500–3.000','nieuw',''],
    ['Metaalwaren Slingerland','Sliedrecht','machinebediende, teamleider productie',2,'adzuna','€3.000–3.600','nieuw',''],
    ['Vriesvers Distributie','Barendrecht','orderpicker, heftruckchauffeur',2,'adzuna','€2.550–2.950','nieuw',''],
    ['Houtindustrie Alblas','Papendrecht','productiemedewerker',2,'claude-research','','nieuw',''],
    ['Zuivelfabriek Weidezicht','Woerden','procesoperator',2,'adzuna','€3.200–3.800','nieuw',''],
    ['PalletPoint Ridderkerk','Ridderkerk','verlader, magazijnmedewerker',1,'adzuna','','nieuw',''],
    ['Snackfood Partners','Zoetermeer','inpakmedewerker',1,'adzuna','€2.400–2.700','nieuw',''],
    ['Retour Matras','Waddinxveen','productiemedewerker, verlader',2,'adzuna','','toegevoegd',''],
    ['Kartonnage Van Deursen','Delft','machinebediende',1,'adzuna','€2.800–3.200','genegeerd','Te klein, één vestiging']
  ].map(([bedrijf,plaats,functies,vacatures,bron,sal,status,notitie],i)=>({
    id:'lrdemo'+i, bedrijf, plaats, functies, vacatures, bron,
    url:'https://www.adzuna.nl/land/ad/demo'+i, salaris_ind:sal,
    gevonden_op:d(-(i%9)), laatst_gezien:d(-(i%3)),
    status, status_door: status==='nieuw'?'':'Tjeerd', notitie
  }));
}

const radarNieuwN = () => radar.filter(r=>(r.status||'nieuw')==='nieuw').length;

function radarRijen(){
  const q = rZoek.trim().toLowerCase();
  const rang = {nieuw:0, toegevoegd:1, genegeerd:2};
  return radar.filter(r=>{
    const st = r.status||'nieuw';
    if(rFilter!=='alles' && st!==rFilter) return false;
    if(rBron && (r.bron||'')!==rBron) return false;
    if(q && !(`${r.bedrijf} ${r.plaats||''} ${r.functies||''}`).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b)=>
    (rang[a.status||'nieuw']??3) - (rang[b.status||'nieuw']??3)
    || (Number(b.vacatures)||0) - (Number(a.vacatures)||0)
    || String(a.bedrijf).localeCompare(String(b.bedrijf)));
}

const BRON_LBL = {adzuna:'Adzuna', 'claude-research':'Claude-research', handmatig:'Handmatig'};
const bronChip = b => {
  const kleur = b==='claude-research' ? ' purple' : b==='handmatig' ? ' blue' : '';
  return `<span class="chip${kleur}">${h(BRON_LBL[b]||b||'—')}</span>`;
};

function radarHTML(){
  const delen = [];
  if(radarStatus===''){
    laadRadar().then(()=>{ if(tab==='radar') tekenInhoud(); });
    return CRM.ui.laden('Radar laden…');
  }
  if(CRM.demo) delen.push(`<div class="note info" style="margin-bottom:14px">Demo-data — deze bedrijven zijn verzonnen; er wordt niets opgeslagen.</div>`);
  if(radarStatus==='mist')
    delen.push(`<div class="note warn" style="margin-bottom:14px"><b>De radartabel bestaat nog niet.</b>
      Draai eerst supabase/schema.sql in de SQL-editor en volg daarna SETUP-LEADRADAR.md om de
      dagelijkse zoekmotor aan te zetten.</div>`);

  delen.push(`<div class="sub" style="margin-bottom:14px;max-width:680px">De radar zoekt elke ochtend
    naar bedrijven in productie, logistiek en industrie die nú zelf personeel werven.
    Beoordeel ze hier: één klik en het bedrijf staat als lead in je pijplijn.</div>`);

  const week = radar.filter(r=>{ const dg = CRM.dagenGeleden(r.gevonden_op); return dg!=null && dg>=0 && dg<=7; }).length;
  const toegevoegd = radar.filter(r=>r.status==='toegevoegd').length;
  delen.push(`<div class="grid c3 s-kpi">
    ${CRM.ui.kpi('Nieuw te beoordelen', `<span class="num">${radarNieuwN()}</span>`, 'wachten op jouw oordeel', 'accent')}
    ${CRM.ui.kpi('Deze week gevonden', `<span class="num">${week}</span>`, 'bedrijven die nu werven')}
    ${CRM.ui.kpi('Toegevoegd als lead', `<span class="num">${toegevoegd}</span>`, 'totaal via de radar')}
  </div>`);

  const telStatus = s => radar.filter(r=>(r.status||'nieuw')===s).length;
  /* <button>, geen <span>: dit is een filter dat je aan- en uitzet, dus je
     moet er met Tab bij kunnen en aria-pressed moet de stand vertellen. */
  const chips = [['nieuw','Nieuw'],['toegevoegd','Toegevoegd'],['genegeerd','Genegeerd'],['alles','Alles']]
    .map(([k,l])=>`<button type="button" class="chip btn-like${rFilter===k?' on':''}" data-rstatus="${k}"
      aria-pressed="${rFilter===k}">${l}${
      k==='alles'?'':` <span class="num">${telStatus(k)}</span>`}</button>`).join('');
  const bronnen = [...new Set(radar.map(r=>r.bron).filter(Boolean))].sort();
  delen.push(`<div class="row r-bar">
    ${chips}
    <div class="spacer"></div>
    ${bronnen.length>1?`<select id="r_bron" style="width:auto;min-width:130px">
      <option value="">Alle bronnen</option>
      ${bronnen.map(b=>`<option value="${h(b)}"${rBron===b?' selected':''}>${h(BRON_LBL[b]||b)}</option>`).join('')}
    </select>`:''}
    <div class="searchbox"><input type="search" id="r_zoek" placeholder="Zoek bedrijf, plaats of functie" value="${h(rZoek)}"></div>
  </div>`);

  delen.push(radarTabelHTML(radarRijen()));

  delen.push(`<div class="note info" style="margin-top:18px">
    <b>Waarom geen live LinkedIn- of Indeed-zoekactie?</b> Beide hebben geen open API en verbieden
    geautomatiseerd uitlezen. De radar gebruikt daarom Adzuna (open vacature-API die veel van
    hetzelfde aanbod indexeert) en optioneel een wekelijkse Claude-research-routine — zie
    SETUP-LEADRADAR.md. Een export uit LinkedIn Sales Navigator kun je wel gewoon inlezen via
    "Handmatig toevoegen" hierboven.</div>`);
  return delen.join('');
}

function radarTabelHTML(rijen){
  if(!radar.length && radarStatus==='ok')
    return `<div class="card"><div class="card-b">${CRM.ui.leeg('De radar heeft nog niets gevonden',
      'Draai de eerste zoekactie met "Nu zoeken", of wacht op de ochtendrun. Een eigen lijst inlezen kan via "Handmatig toevoegen".')}</div></div>`;
  if(!rijen.length)
    return `<div class="card"><div class="card-b">${CRM.ui.leeg('Niets binnen deze filters',
      'Pas de status, bron of zoekopdracht aan.',
      '<button class="btn ghost" data-rwis>Filters wissen</button>')}</div></div>`;
  return `<div class="tblwrap"><table class="tbl">
    <thead><tr>
      <th>Bedrijf</th><th>Plaats</th><th>Functies</th><th class="n">Vacatures</th>
      <th>Salarisindicatie</th><th>Bron</th><th>Gevonden</th><th></th>
    </tr></thead>
    <tbody>${rijen.map(r=>{
      const st = r.status||'nieuw';
      const url = veiligeHttp(r.url);
      const fns = String(r.functies||'').split(',').map(s=>s.trim()).filter(Boolean);
      return `<tr${st!=='nieuw'?' class="s-dicht"':''}>
        <td><div style="font-weight:600">${h(r.bedrijf)}${url?` <a href="${h(url)}" target="_blank" rel="noopener" title="Vacature bekijken" class="r-link">↗</a>`:''}</div>
          ${r.notitie?`<div class="rowsub">${h(r.notitie)}</div>`:''}</td>
        <td>${h(r.plaats||'—')}</td>
        <td>${fns.length?`<div class="r-func">${fns.slice(0,3).map(f=>`<span class="chip">${h(f)}</span>`).join('')}${
          fns.length>3?`<span class="meta">+${fns.length-3}</span>`:''}</div>`:'—'}</td>
        <td class="n num">${Number(r.vacatures)||1}</td>
        <td class="num">${h(r.salaris_ind||'—')}</td>
        <td>${bronChip(r.bron)}</td>
        <td><span class="num">${h(CRM.geleden(r.gevonden_op)||'—')}</span>
          ${r.laatst_gezien && r.laatst_gezien!==r.gevonden_op?`<div class="rowsub">gezien ${h(CRM.geleden(r.laatst_gezien))}</div>`:''}</td>
        <td>${
          st==='nieuw' ? `<div class="row tight r-acties">
              <button class="btn sm" data-rlead="${h(r.id)}">→ Lead</button>
              <button class="btn sm sub" data-rneg="${h(r.id)}">Negeren</button></div>`
          : st==='toegevoegd' ? `<div class="row tight r-acties">
              <span class="chip green">toegevoegd</span>
              <button class="btn sm ghost" data-rpijp="${h(r.bedrijf)}">pijplijn →</button></div>`
          : `<div class="row tight r-acties">
              <span class="chip">genegeerd</span>
              <button class="btn sm sub" data-rher="${h(r.id)}">Herstellen</button></div>`
        }</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

/* Status van een radar-rij wijzigen (+ tellers en tab-badge verversen). */
async function zetRadarStatus(id, status, notitie){
  const r = radar.find(x=>x.id===id); if(!r) return false;
  const oud = {status:r.status, status_door:r.status_door, notitie:r.notitie};
  r.status = status; r.status_door = CRM.me();
  if(notitie!=null) r.notitie = notitie;
  if(!CRM.demo){
    const w = {status, status_door:CRM.me()};
    if(notitie!=null) w.notitie = notitie;
    const {error} = await CRM.sb.from('crm_leadradar').update(w).eq('id', id);
    if(error){ Object.assign(r, oud); tekenInhoud(); CRM.fout('Status opslaan mislukt', error); return false; }
  }
  teken();
  return true;
}

/* "→ Lead": bedrijf als client in fase Lead zetten + radar-rij afvinken. */
async function radarNaarLead(id){
  const r = radar.find(x=>x.id===id); if(!r) return;
  const bestaand = CRM.state.clients.find(c=>CRM.zelfdeKlant(c.naam, r.bedrijf));
  if(bestaand){
    await zetRadarStatus(id, 'toegevoegd', 'Stond al in de pijplijn ('+faseVan(bestaand)+')');
    return CRM.toast(`${r.bedrijf} staat al in de pijplijn (${faseVan(bestaand)})`);
  }
  const vandaag = CRM.todayISO();
  const nVac = Number(r.vacatures)||1;
  const rij = {
    naam:r.bedrijf, fase:'Lead', eigenaar:CRM.me(), branche:'',
    locatie:String(r.plaats||'').split(',')[0].trim(),
    aangemaakt:vandaag, fase_sinds:vandaag, laatst_contact:null,
    telefoon:'', email:'', website:'',
    note:`Gevonden via de Leadradar (${BRON_LBL[r.bron]||r.bron||'onbekende bron'}): ${nVac} vacature${nVac===1?'':'s'} voor ${r.functies||'onbekende functies'}.`
  };
  CRM.state.clients.push(rij);
  if(!CRM.demo){
    let {error} = await CRM.sb.from('clients').upsert(rij, {onConflict:'naam'});
    if(error && /aangemaakt/i.test(error.message||'')){
      /* Oudere database zonder aangemaakt-kolom: zonder dat veld opnieuw. */
      const zonder = Object.assign({}, rij); delete zonder.aangemaakt;
      ({error} = await CRM.sb.from('clients').upsert(zonder, {onConflict:'naam'}));
    }
    if(error){ CRM.state.clients.pop(); return CRM.fout('Lead opslaan mislukt', error); }
  }
  CRM.logActiviteit('klant', r.bedrijf, 'systeem',
    `Gevonden via Leadradar: ${nVac} vacature${nVac===1?'':'s'} voor ${r.functies||'onbekende functies'}`);
  await zetRadarStatus(id, 'toegevoegd');
  CRM.toast(`${r.bedrijf} staat nu als lead op het pijplijnbord — "pijplijn →" opent de kaart`, 'ok');
}

/* Negeren: de motor slaat genegeerde bedrijven voortaan over. */
async function radarNegeren(id){
  const r = radar.find(x=>x.id===id); if(!r) return;
  const reden = await CRM.vraag('Negeren — '+r.bedrijf, {
    knop:'Negeren', placeholder:'Bijv. te klein, verkeerde regio (mag leeg blijven)',
    hint:'De radar slaat dit bedrijf voortaan over. Een reden is optioneel maar helpt je collega’s.'
  });
  if(await zetRadarStatus(id, 'genegeerd', reden||''))
    CRM.toast(`${r.bedrijf} genegeerd — de radar slaat dit bedrijf voortaan over`);
}

/* "↻ Nu zoeken": de Edge Function direct aanroepen. */
async function radarZoeken(){
  if(CRM.demo) return CRM.toast('In demo-modus zoekt de radar niet echt — log in om dit te gebruiken');
  if(rZoeken) return;
  rZoeken = true; tekenInhoud();
  try{
    const {data:{session}} = await CRM.sb.auth.getSession();
    if(!session) throw new Error('geen actieve sessie — log opnieuw in');
    const resp = await fetch(SUPABASE_URL + '/functions/v1/lead-radar', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token},
      body:'{}'
    });
    const uit = await resp.json().catch(()=>({}));
    if(resp.status===404 || resp.status===503)
      throw Object.assign(new Error('nog niet gedeployed'), {setup:true});
    /* uit.error kan een string of een object zijn — nooit rechtstreeks in
       een melding plakken, anders leest de gebruiker "[object Object]". */
    if(!resp.ok){
      const reden = typeof uit.error === 'string' ? uit.error
                  : (uit.error && uit.error.message) || uit.message || '';
      throw new Error(reden || ('de zoekfunctie gaf status ' + resp.status));
    }
    await laadRadar(true);
    CRM.toast(`Zoeken klaar: ${uit.nieuw??0} nieuw, ${uit.bijgewerkt??0} bijgewerkt`, 'ok');
  }catch(e){
    if(e.setup || /Failed to fetch|NetworkError/i.test(e.message||''))
      CRM.toast('De zoekfunctie lead-radar is nog niet gedeployed — zie SETUP-LEADRADAR.md voor de eenmalige setup','err');
    else CRM.fout('Zoeken mislukt', e);
  }
  rZoeken = false;
  teken();
}

/* Handmatig toevoegen: de vertrouwde plak/CSV-import, nu als radar-bron. */
function handmatigToevoegen(){
  if(!CRM.demo && radarStatus==='mist')
    return CRM.toast('De radartabel bestaat nog niet — draai eerst supabase/schema.sql (zie SETUP-LEADRADAR.md)','err');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Handmatig toevoegen</div></div>
    <div class="modal-b">
      <div class="f-row"><label for="hm_plak">Plak bedrijfsnamen of CSV</label>
        <textarea id="hm_plak" style="min-height:140px" placeholder="Eén bedrijf per regel. Optioneel met branche en plaats, gescheiden door ; of komma:&#10;&#10;Van der Windt Verpakking; Verpakkingen; Honselersdijk&#10;Bakker Barendrecht; AGF; Barendrecht&#10;Verhoeven Metaal"></textarea>
        <span class="hint">Werkt met een kolomkop-regel uit Sales Navigator en met een simpele lijst namen. De bedrijven komen als "nieuw" in de radar, bron Handmatig.</span></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="hm_ok">Inlezen</button>
    </div>`, {onOpen(m){
      setTimeout(()=>m.querySelector('#hm_plak').focus(), 60);
      m.querySelector('#hm_ok').onclick = async () => {
        const lijst = leesLijst(m.querySelector('#hm_plak').value);
        if(!lijst.length) return CRM.toast('Geen bedrijfsnamen gevonden','err');
        const vandaag = CRM.todayISO();
        const nieuw = [], over = [];
        lijst.forEach(g => {
          const bekend = radar.some(x=>CRM.zelfdeKlant(x.bedrijf, g.naam))
                      || CRM.state.clients.some(c=>CRM.zelfdeKlant(c.naam, g.naam));
          if(bekend) return over.push(g);
          nieuw.push({id:CRM.uid(), bedrijf:g.naam, plaats:g.plaats||'', functies:'', vacatures:1,
            bron:'handmatig', url:'', salaris_ind:'', gevonden_op:vandaag, laatst_gezien:vandaag,
            status:'nieuw', status_door:CRM.me(), notitie:g.branche?('Branche: '+g.branche):''});
        });
        if(!nieuw.length) return CRM.toast('Deze bedrijven staan al in de radar of de pijplijn','err');
        if(!CRM.demo){
          const {error} = await CRM.sb.from('crm_leadradar').insert(nieuw);
          if(error) return CRM.fout('Opslaan mislukt', error);
        }
        radar = nieuw.concat(radar);
        CRM.modal.close();
        rFilter = 'nieuw'; V.zet('r_status', rFilter);
        CRM.toast(`${nieuw.length} bedrijven in de radar gezet${over.length?` — ${over.length} overgeslagen (al bekend)`:''}`,'ok');
        teken();
      };
    }});
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
  /* De Leadradar heeft eigen filters in de tab zelf; de pijplijnfilters
     hierboven zouden daar niets doen en alleen verwarren. */
  if(tab==='radar'){ actiesEl.innerHTML = ''; return; }
  actiesEl.innerHTML = `
    <div class="searchbox"><input type="search" id="s_zoek" placeholder="Zoek bedrijf, branche of plaats" value="${h(zoek)}"></div>
    <select id="s_eig" style="width:auto;min-width:140px">
      <option value="">Alle eigenaren</option>
      ${eigenaren().map(e=>`<option value="${h(e)}"${eigFilter===e?' selected':''}>${h(e)}</option>`).join('')}
    </select>
    <button type="button" class="chip btn-like${mijn?' on':''}" id="s_mijn" aria-pressed="${mijn}">Mijn klanten</button>
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

  const radarN = radarNieuwN();
  const kop = `<div class="s-wrap">
    <div class="s-top">
      <div class="tabs">
        <button class="tab${tab==='pijplijn'?' on':''}" data-tab="pijplijn">Klantpijplijn<span class="cnt num">${klanten.length}</span></button>
        <button class="tab${tab==='kansen'?' on':''}" data-tab="kansen">Kansen<span class="cnt num">${kansenN}</span></button>
        <button class="tab${tab==='radar'?' on':''}" data-tab="radar">Leadradar${radarN?`<span class="cnt num">${radarN}</span>`:''}</button>
      </div>
      <div class="row tight s-acts">${tab==='radar'
        ? `<button class="btn ghost" data-rhand>Handmatig toevoegen</button>
           <button class="btn" data-rzoek${rZoeken?' disabled':''}>${rZoeken?'Bezig met zoeken…':'↻ Nu zoeken'}</button>`
        /* Hier stond ook nog een knop "Leadradar", vlak naast de tab die
           precies hetzelfde doet en er precies hetzelfde heet. Twee keer
           dezelfde weg naast elkaar laat je aarzelen of ze wel hetzelfde
           doen, en hij trok aandacht weg van de enige echte actie op dit
           scherm. De tab blijft; de knop is weg. */
        : `<button class="btn" data-nieuwekans>+ Nieuwe kans</button>`}
      </div>
    </div>`;

  if(tab==='radar'){
    mountEl.innerHTML = kop + radarHTML() + '</div>';
  } else if(tab==='kansen'){
    mountEl.innerHTML = kop + kansenHTML() + '</div>';
  } else if(weergave==='lijst'){
    mountEl.innerHTML = kop + kpiHTML(klanten) + '<div style="height:16px"></div>' + lijstHTML(klanten) + '</div>';
  } else {
    const leegBord = !klanten.length;
    mountEl.innerHTML = kop + kpiHTML(klanten) + '</div>' +
      (leegBord
        ? `<div class="s-wrap">${CRM.ui.leeg('Geen bedrijven in beeld',
            zoek||mijn||eigFilter ? 'Je filters verbergen alles. Wis ze om de hele pijplijn te zien.'
                                  : 'De Leadradar vindt bedrijven die nu personeel werven — begin daar.',
            zoek||mijn||eigFilter ? '<button class="btn ghost" data-wis>Filters wissen</button>'
                                  : '<button class="btn" data-radar>Naar de Leadradar</button>')}</div>`
        : bordHTML(klanten));
  }
  bindInhoud();
}

function bindInhoud(){
  CRM.$$('[data-tab]', mountEl).forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; V.zet('tab',tab); tekenActies(); tekenInhoud(); });
  CRM.$$('[data-radar]', mountEl).forEach(b=>b.onclick=()=>{ tab='radar'; V.zet('tab',tab); tekenActies(); tekenInhoud(); });
  CRM.$$('[data-nieuwekans]', mountEl).forEach(b=>b.onclick=()=>nieuweKans(null));
  bindRadar();
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

function bindRadar(){
  /* De knoppen Handmatig/Nu zoeken staan in de kop en bestaan alleen op de radar-tab. */
  CRM.$$('[data-rzoek]', mountEl).forEach(b=>b.onclick=radarZoeken);
  CRM.$$('[data-rhand]', mountEl).forEach(b=>b.onclick=handmatigToevoegen);
  if(tab!=='radar') return;
  CRM.$$('[data-rstatus]', mountEl).forEach(c=>c.onclick=()=>{ rFilter=c.dataset.rstatus; V.zet('r_status',rFilter); tekenInhoud(); });
  const rb = mountEl.querySelector('#r_bron');
  if(rb) rb.onchange = e => { rBron = e.target.value; tekenInhoud(); };
  const rz = mountEl.querySelector('#r_zoek');
  if(rz) rz.oninput = CRM.debounce(()=>{
    rZoek = rz.value; tekenInhoud();
    /* De hele tab is opnieuw getekend — focus terug in het zoekveld. */
    const el = mountEl.querySelector('#r_zoek');
    if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, 220);
  CRM.$$('[data-rwis]', mountEl).forEach(b=>b.onclick=()=>{
    rZoek=''; rBron=''; rFilter='alles'; V.zet('r_status',rFilter); tekenInhoud();
  });
  CRM.$$('[data-rlead]', mountEl).forEach(b=>b.onclick=()=>radarNaarLead(b.dataset.rlead));
  CRM.$$('[data-rneg]',  mountEl).forEach(b=>b.onclick=()=>radarNegeren(b.dataset.rneg));
  CRM.$$('[data-rher]',  mountEl).forEach(b=>b.onclick=()=>zetRadarStatus(b.dataset.rher,'nieuw',''));
  CRM.$$('[data-rpijp]', mountEl).forEach(b=>b.onclick=()=>{
    const kl = CRM.state.clients.find(c=>CRM.zelfdeKlant(c.naam, b.dataset.rpijp));
    tab='pijplijn'; V.zet('tab',tab); tekenActies(); tekenInhoud();
    if(kl) setTimeout(()=>openKlant(kl.naam), 60);
    else CRM.toast('Dit bedrijf staat niet (meer) in de pijplijn','err');
  });
}

function teken(){ tekenInhoud(); CRM.navBadges(); }

/* ─── Registratie ──────────────────────────────────────────────── */
CRM.registerModule('sales', {
  title:'Sales', icon:'◈', onderschrift:'Klantpijplijn, kansen en leadradar',
  volleBreedte:true,
  badge(){
    const vandaag = CRM.todayISO();
    return (CRM.state.taken||[]).filter(t => t.entiteit==='klant' && !t.klaar && t.datum && t.datum<=vandaag).length;
  },
  render(mount, acties, params){
    mountEl = mount; actiesEl = acties;
    tekenActies();
    tekenInhoud();
    /* Radar alvast laden zodat de tab-badge meteen klopt, ook als je
       op de pijplijn binnenkomt. */
    laadRadar().then(()=>{ if(mountEl) tekenInhoud(); });
    if(params && params.id && CRM.klant(params.id)) setTimeout(()=>openKlant(params.id), 60);
  }
});

})();

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN CORE
   0. [OPGELOST] De gesloten `.scrim` ving alle muiskliks op waardoor de
      app na één modaal onklikbaar werd. css/base.css zet nu zelf
      `pointer-events:none` op `.scrim` en `auto` op `.scrim.on`; het
      noodverband in css/sales.css is daarmee verwijderd.
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
   4. `crm_leadradar` zit niet in CRM.load()/CRM.state; sales haalt de
      tabel zelf op (met dezelfde nette degradatie als core's veilig()).
      Als meer modules de radar willen tonen (bv. dashboard-teller),
      graag toevoegen aan CRM.load() plus realtime-kanaal.
   ═══════════════════════════════════════════════════════════════ */
