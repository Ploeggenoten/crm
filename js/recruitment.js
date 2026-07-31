/* ═══════════════════════════════════════════════════════════════
   MODULE: RECRUITMENT — DE RECRUITMENTPIJPLIJN EN DE UITVAL
   Twee tabbladen:
     A. Recruitmentpijplijn — van binnenkomst tot en met de videocall
        (tabel crm_leads), als bord óf als lijst
     B. Uitval — afgevallen/gestopt, heraanbieden en vervanging

   Sinds 31 juli 2026 is de keten in tweeën geknipt, met de overdracht
   bij 'Voorgesteld' (zie de toelichting bovenaan js/data.js):

     RECRUITMENTPIJPLIJN (dit bestand) — crm_leads, hoog volume, draait
       om snelheid. De laatste stap maakt er een kandidaat van, die op
       fase 'Intake' klaarstaat om voorgesteld te worden.
     KLANTTRAJECTEN (js/pijplijn.js) — candidates vanaf 'Voorgesteld',
       laag volume, draait om diepte.

   Waar het hier om gaat: alles wat op Nieuw staat moet weg. Niet naar
   een oordeel toe, maar naar een vólgende status — ook "geen gehoor"
   is vooruitgang, want dan weet je dat er gebeld is.

   De gedeelde bewerk-drawer en fasewissel-poortwachters leven hier
   en zijn beschikbaar als CRM.kandidaatBewerk / CRM.kandidaatFase;
   overige gedeelde bord-logica via CRM._rcDeel (onderaan).
   Doel blijft: geen vervuiling. Een sollicitant komt ALTIJD binnen
   op status 'Nieuw' en wordt pas kandidaat als de gegevens compleet zijn.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Modulestatus (blijft bewaard tussen renders) ─────────────── */
const S = {
  tab:'leads',
  l:{q:'', status:'', bron:'', vac:'', mijn:false, zvac:false},
  u:{f:'alles'}
};

/* ─── Bord of lijst ───────────────────────────────────────────────
   Allebei, omdat het werk twee vormen heeft. Wie een middag afbelt wil
   een lijst: veel regels tegelijk, telefoonnummers onder elkaar, en in
   één oogopslag wie er het langst ligt. Wie stuurt wil een bord: waar
   stapelt het op, waar komt niemand meer aan toe.

   De LIJST is de standaard. De pijplijn heeft zeven werkstatussen en er
   komen honderden reacties per week binnen; zeven kolommen van vijftig
   kaarten is geen overzicht maar behang, en de eerste vraag van de dag
   ("wie moet ik nu bellen") beantwoordt een lijst nu eenmaal sneller.
   Het bord is één klik weg en die keuze blijft bewaard — dus wie liever
   op het bord werkt, krijgt het bord ook morgen weer. */
const WEERGAVE_KEY = 'crm_rc_weergave';
const weergave    = () => { try{ return localStorage.getItem(WEERGAVE_KEY) === 'bord' ? 'bord' : 'lijst'; }catch(e){ return 'lijst'; } };
const zetWeergave = v => { try{ localStorage.setItem(WEERGAVE_KEY, v); }catch(e){} };

/* ─── Hoe lang ligt iets er al? ───────────────────────────────────
   Een lead reageert op een advertentie die diezelfde dag voorbijkwam.
   De kans dat je iemand nog aan de lijn krijgt zakt per dag: dag één is
   normaal, daarna word je één van de bureaus die "ook nog belde".
   Twee grenzen, bewust ruim uit elkaar zodat het verschil betekenis heeft:

     vanaf 1 dag   — let op: de dag van binnenkomst is voorbij
     vanaf 3 dagen — te lang: er is een weekend overheen gegaan en de
                     meesten hebben inmiddels ergens anders iets

   Kalenderdagen, geen werkdagen. Een sollicitant die vrijdagavond
   reageert en maandag pas wordt gebeld heeft drie dagen gewacht — dat
   het bureau dicht was verandert daar niets aan.
   Beide grenzen staan hier als getal, zodat ze op één plek te verzetten zijn. */
const NIEUW_LETOP  = 1;
const NIEUW_TELANG = 3;
const leadDagen     = l => CRM.dagenGeleden(l && l.binnen_op);
const ouderdomKlas  = n => n == null ? '' : n >= NIEUW_TELANG ? 'red' : n >= NIEUW_LETOP ? 'amber' : '';

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

/* ─── Vacaturekoppeling ───────────────────────────────────────────
   Hierop leunt de hele marketingmeting: leads per plaatsing, per klant
   én per vacature. Een lead zonder vacature is een gat in dat cijfer.
   Gekoppeld betekent: er is een vacature-id dat ook écht bestaat. Een id
   dat naar een verwijderde vacature wijst telt níét als koppeling — de
   marketingmodule kan er niets mee, dus zo'n lead hoort net zo goed in
   de bijwerklijst. Wel benoemen we dat verschil in beeld, anders lijkt
   het alsof iemand vergeten is te koppelen. */
const vacVan      = l => vacById(l && l.vacature_id);
const isGekoppeld = l => !!vacVan(l);
const vacWeg      = l => !!(l && l.vacature_id) && !vacVan(l);
/* Wat er op de kaart/rij staat als er geen geldige vacature is: de losse
   functie- en klantvelden die bij de import of het formulier zijn ingevuld. */
const losFunctie  = l => String((l && l.functie) || '').trim();

/* Een status die niet (meer) in CRM.LEAD_STATUS staat. Kan voorkomen na een
   hernoeming of een import met een eigen statuskolom. Zulke leads vallen uit
   elke kolom en elk filter — daarom tellen we ze apart en melden we ze. */
const statusBestaat = s => CRM.LEAD_STATUS.some(x => x.k === s);

/* Dezelfde persoon die twee keer solliciteert — op een tweede advertentie, of
   een paar weken later opnieuw. We voegen niets samen: welke van de twee de
   goede is, is een beslissing van de recruiter. Maar we laten het wél zien,
   anders belt de een 's ochtends en de ander 's middags dezelfde persoon.
   Eén keer per hertekening opgebouwd; per rij opnieuw zoeken werd bij duizenden
   leads onnodig duur. */
let DUB = new Map();
function bouwDubbel(){
  DUB = new Map();
  leads().forEach(l => {
    const t = telNorm(l.telefoon);
    if(t) DUB.set(t, (DUB.get(t) || 0) + 1);
  });
}
const dubbelAantal = l => { const t = telNorm(l && l.telefoon); return t ? (DUB.get(t) || 1) : 1; };

/* Een lead zonder naam komt voor: een formulier dat alleen een nummer
   doorgeeft, of een import met een lege kolom. Zonder deze terugval staat er
   een lege regel waar je niet op kunt klikken. */
const leadNaam = l => String((l && l.naam) || '').trim() || 'Naam onbekend';

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
/* Wanneer was er voor het laatst écht contact? Welke activiteitsoorten als
   contact tellen komt uit js/opvolging.js (CRM.opvolging.CONTACT) — het
   dashboard en de kandidatenlijst lezen dezelfde lijst. Drie kopieën van
   hetzelfde rijtje lopen vroeg of laat uit elkaar, en dan zegt het ene scherm
   iets anders dan het andere. De terugval geldt alleen als opvolging.js
   (nog) niet geladen is. */
const CONTACT_SOORTEN = () => (CRM.opvolging && CRM.opvolging.CONTACT) || ['bel','gesprek','whatsapp','mail','bezoek'];
function laatsteContact(leadId){
  const soorten = CONTACT_SOORTEN();
  const a = CRM.activiteitenVoor('lead', leadId)
    .filter(x => soorten.includes(x.soort))
    .sort((x,y) => String(y.op||'').localeCompare(String(x.op||'')))[0];
  return a ? a.op : null;
}

/* Wanneer kwam deze sollicitant op 'Videocall gehad' te staan? Dat moment
   staat in de activiteitenlijn — pasStatusToe schrijft elke statuswissel weg.
   Het is nadrukkelijk niet hetzelfde als het moment van doorschieten: dat kan
   dagen later zijn. De kandidatenkaart krijgt deze datum mee, zodat daar niet
   uit "er staat een intake" hoeft te worden afgeleid dát er een gesprek was. */
function videocallGehadOp(lead){
  const treffer = CRM.activiteitenVoor('lead', lead && lead.id)
    .filter(a => / → Videocall gehad$/.test(String(a.tekst||'')))
    .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')))[0];
  if(treffer && treffer.op) return String(treffer.op).slice(0,10);
  /* Terugval, in volgorde van betrouwbaarheid: de geplande calldatum, anders
     vandaag. Een datum die een dag naast zit is bruikbaarder dan geen datum. */
  return (lead && lead.opvolgen_op) ? String(lead.opvolgen_op).slice(0,10) : CRM.todayISO();
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

  /* De werkvoorraad van deze module: alles wat nog een eerste actie nodig heeft. */
  const nieuwLijst = L.filter(l => l.status === 'Nieuw');
  const perOuderdom = {vandaag:0, letop:0, telang:0};
  nieuwLijst.forEach(l => {
    const n = leadDagen(l);
    if(n == null || n < NIEUW_LETOP) perOuderdom.vandaag++;
    else if(n < NIEUW_TELANG) perOuderdom.letop++;
    else perOuderdom.telang++;
  });
  const oudste = nieuwLijst.reduce((m,l) => { const n = leadDagen(l); return n != null && n > m ? n : m; }, 0);

  const binnenVandaag = L.filter(l => String(l.binnen_op||'').slice(0,10) === vandaag).length;
  const open = L.filter(l => CRM.LEAD_OPEN.includes(l.status));
  const stil = open.filter(l => (CRM.dagenGeleden(l.laatst_actie || l.binnen_op) || 0) > 2).length;
  const zonderVac = open.filter(l => !isGekoppeld(l)).length;
  /* Videocalls: geplande calls bij de leads plus de kandidaten die al zijn
     doorgeschoten en op fase Intake staan met een datum deze week. */
  const calls = L.filter(l => l.status === 'Videocall gepland' && inWeek(l.opvolgen_op)).length
              + K.filter(c => CRM.faseIs(c.fase, 'Intake') && inWeek(c.datum)).length;
  /* Het getal waar de AM op zit te wachten: kaart compleet, intake gehad, nog
     niet voorgesteld. Dit is precies de brug naar de Klanttrajecten. */
  const klaar = K.filter(CRM.klaarOmVoorTeStellen);

  const startsWeek = K.filter(c => CRM.PLACED.includes(c.fase) && c.start && inWeek(c.start));
  const vroeg = K.filter(c => ['Voorgesteld','O&O sessie','Eerste gesprek'].includes(c.fase)).length;
  return {nieuwLijst, perOuderdom, oudste, binnenVandaag, stil, zonderVac, calls, klaar,
          startsWeek, vroeg};
}
/* De cijferbalk gaat over déze pijplijn: instroom en doorloop. De
   plaatsingscijfers (netto deze maand tegen het target) stonden hier ook, maar
   die horen bij de Klanttrajecten — ze staan boven dat bord én op het
   dashboard. Twee plekken is genoeg; drie maakt het alleen maar makkelijker om
   ze uit elkaar te laten lopen. */
function tekenBar(){
  const el = document.getElementById('rc_bar'); if(!el) return;
  const c = cijfers();
  const it = (lbl, waarde, extra='', klasse='') =>
    `<div class="rc-it ${klasse}"><div class="label">${h(lbl)}</div>
       <div class="rc-v num">${waarde}</div>${extra?`<div class="meta">${extra}</div>`:''}</div>`;
  const nN = c.nieuwLijst.length, nT = c.perOuderdom.telang;
  el.innerHTML =
    it('Op Nieuw', nN,
       nN ? (nT ? `${nT} ligt er ${NIEUW_TELANG} dagen of langer` : `oudste: ${c.oudste === 0 ? 'vandaag binnen' : c.oudste + ' dag' + (c.oudste===1?'':'en')}`)
          : 'niets blijft liggen',
       nT ? 'amber' : '') +
    it('Vandaag binnen', c.binnenVandaag, 'nieuwe reacties') +
    it('Zonder vacature', c.zonderVac, 'lopend, niet meetbaar per campagne', c.zonderVac ? 'amber' : '') +
    it('Videocalls deze week', c.calls, 'gepland en gehad') +
    it('Klaar om voor te stellen', c.klaar.length, 'intake gehad, wacht op de AM', c.klaar.length ? 'goed' : '');
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
    <button class="tab ${S.tab==='leads'?'on':''}" data-t="leads">Recruitmentpijplijn <span class="cnt num">${open}</span></button>
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
   TAB A — DE RECRUITMENTPIJPLIJN (crm_leads)
   ═══════════════════════════════════════════════════════════════ */
function leadsGefilterd(negeerStatus){
  const f = S.l, q = norm(f.q);
  return leads().filter(l => {
    if(!negeerStatus && f.status && l.status !== f.status) return false;
    if(f.bron && l.bron !== f.bron) return false;
    if(f.vac && String(l.vacature_id) !== f.vac) return false;
    if(f.zvac && isGekoppeld(l)) return false;
    if(f.mijn && l.eigenaar !== CRM.me()) return false;
    if(q){
      const hooi = [l.naam, l.telefoon, l.email, l.woonplaats, l.klant, l.functie, l.kwalificatie].map(norm).join(' ');
      if(!hooi.includes(q) && (!telNorm(q) || telNorm(l.telefoon).indexOf(telNorm(q)) !== 0)) return false;
    }
    return true;
  }).sort((a,b) => String(b.binnen_op||'').localeCompare(String(a.binnen_op||'')));
}
/* Oudste eerst — de volgorde waarin je ze wegwerkt. */
const oudsteEerst = arr => arr.slice().sort((a,b) => String(a.binnen_op||'').localeCompare(String(b.binnen_op||'')));

function tekenLeads(el){
  const bronnen = Array.from(new Set(leads().map(l => l.bron).filter(Boolean))).sort();
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b) => vacLabel(a).localeCompare(vacLabel(b)));
  const w = weergave();
  el.innerHTML = `
    <div class="rc-pad">
      <div id="rc_nieuwbalk"></div>
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
        <label class="check"><input type="checkbox" id="rc_zvac" ${S.l.zvac?'checked':''}> Zonder vacature</label>
        <label class="check"><input type="checkbox" id="rc_mijn" ${S.l.mijn?'checked':''}> Mijn sollicitanten</label>
        <div class="spacer"></div>
        <span class="meta" id="rc_telling"></span>
        <div class="seg" id="rc_weer">
          <button data-w="lijst" class="${w==='lijst'?'on':''}">Lijst</button>
          <button data-w="bord" class="${w==='bord'?'on':''}">Bord</button>
        </div>
      </div>
      <div class="rc-chips" id="rc_stchips"></div>
      <div id="rc_waarsch"></div>
      <div id="rc_lijst"></div>
    </div>`;

  const q = el.querySelector('#rc_q');
  q.oninput = CRM.debounce(() => { S.l.q = q.value; tekenWerk(); }, 200);
  el.querySelector('#rc_bron').onchange = e => { S.l.bron = e.target.value; tekenWerk(); };
  el.querySelector('#rc_vac').onchange  = e => { S.l.vac  = e.target.value; tekenWerk(); };
  el.querySelector('#rc_zvac').onchange = e => { S.l.zvac = e.target.checked; tekenWerk(); };
  el.querySelector('#rc_mijn').onchange = e => { S.l.mijn = e.target.checked; tekenWerk(); };
  CRM.$$('#rc_weer button', el).forEach(b => b.onclick = () => {
    if(weergave() === b.dataset.w) return;
    zetWeergave(b.dataset.w);
    /* Op het bord zijn de kolommen de statussen, dus een statusfilter zou daar
       alleen maar zeven van de acht kolommen leegtrekken. Hem laten staan tot
       je terugschakelt naar de lijst is nog verwarrender: dan verandert het
       beeld ineens zonder dat je iets hebt aangeraakt. Dus wissen. */
    if(b.dataset.w === 'bord') S.l.status = '';
    CRM.$$('#rc_weer button', el).forEach(x => x.classList.toggle('on', x === b));
    tekenWerk();
  });
  tekenWerk();
}

/* ─── De werkstapel op Nieuw ──────────────────────────────────────
   Het hart van dit scherm: wat ligt er, en hoe lang al. De staaf maakt
   het verschil zichtbaar tussen een ochtend achterstand en een week
   achterstand — twaalf leads van vandaag is een normale ochtend,
   twaalf leads van vier dagen oud is een probleem. */
function tekenNieuwbalk(){
  const el = document.getElementById('rc_nieuwbalk'); if(!el) return;
  /* Op de huidige filters, want dat is de stapel die je nú kunt wegwerken. */
  const nieuw = leadsGefilterd(true).filter(l => l.status === 'Nieuw');
  const groep = {vandaag:[], letop:[], telang:[]};
  nieuw.forEach(l => {
    const n = leadDagen(l);
    if(n == null || n < NIEUW_LETOP) groep.vandaag.push(l);
    else if(n < NIEUW_TELANG) groep.letop.push(l);
    else groep.telang.push(l);
  });
  if(!nieuw.length){
    const totaal = leads().length;
    el.innerHTML = totaal
      ? `<div class="rc-nieuw klaar"><span class="rc-nieuwop">✓</span>
           <div><b>Niets staat meer op Nieuw</b>
             <span class="meta">Elke binnengekomen reactie heeft een volgende status gekregen.</span></div></div>`
      : '';
    return;
  }
  const pct = n => Math.round(n / nieuw.length * 100);
  const deel = (n, klasse, titel) => n ? `<i class="${klasse}" style="width:${pct(n)}%" title="${h(titel)}"></i>` : '';
  const telang = groep.telang.length, letop = groep.letop.length, vers = groep.vandaag.length;
  el.innerHTML = `
    <div class="rc-nieuw ${telang ? 'let' : ''}">
      <div class="rc-nieuwtel"><b class="num">${nieuw.length}</b><span>op Nieuw</span></div>
      <div class="rc-nieuwstaafwrap">
        <div class="rc-nieuwstaaf">
          ${deel(vers,  'vers',   vers + ' van vandaag')}
          ${deel(letop, 'letop',  letop + ' van gisteren of eergisteren')}
          ${deel(telang,'telang', telang + ' van ' + NIEUW_TELANG + ' dagen of ouder')}
        </div>
        <div class="rc-nieuwtxt">
          <span><i class="vers"></i>${vers} vandaag</span>
          <span><i class="letop"></i>${letop} 1–${NIEUW_TELANG-1} dagen</span>
          <span class="${telang ? 'op' : ''}"><i class="telang"></i>${telang} ${NIEUW_TELANG} dagen of langer</span>
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn" id="rc_werkaf">Wegwerken →</button>
    </div>`;
  el.querySelector('#rc_werkaf').onclick = () => wegwerkModus();
}

function tekenStatusChips(){
  const el = document.getElementById('rc_stchips'); if(!el) return;
  /* Op het bord zíjn de kolommen de statussen — dan is een tweede rij met
     dezelfde tellers alleen maar dubbelop. */
  if(weergave() === 'bord'){ el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  const basis = leadsGefilterd(true);
  const tel = s => basis.filter(l => l.status === s).length;
  el.innerHTML =
    `<button class="chip btn-like ${S.l.status===''?'on':''}" data-s="">Alle <b class="num">${basis.length}</b></button>` +
    CRM.LEAD_STATUS.map(s => `
      <button class="chip btn-like ${S.l.status===s.k?'on':''}" data-s="${h(s.k)}">
        <i class="dot" style="background:${s.c}"></i>${h(s.k)} <b class="num">${tel(s.k)}</b>
      </button>`).join('');
  CRM.$$('[data-s]', el).forEach(b => b.onclick = () => { S.l.status = b.dataset.s; tekenWerk(); });
}

/* Het werkvlak: bord of lijst, met dezelfde filters en dezelfde acties.
   Heette tekenLijst toen er alleen een lijst was. */
function tekenWerk(){
  bouwDubbel();
  tekenNieuwbalk();
  tekenStatusChips();
  /* De meldingen staan boven het werkvlak en niet eronder: ze gelden voor bord
     én lijst, en een lijst van tweehonderd regels duwt een voetnoot buiten beeld. */
  const w = document.getElementById('rc_waarsch');
  if(w){ w.innerHTML = waarschuwingenHtml(); koppelStrook(w); }
  const wrap = document.getElementById('rc_lijst'); if(!wrap) return;
  const rijen = weergave() === 'bord' ? leadsGefilterd(true) : leadsGefilterd();
  const telling = document.getElementById('rc_telling');
  if(telling) telling.textContent = rijen.length + ' van ' + leads().length + ' sollicitanten';

  if(!rijen.length){
    /* Onderscheid maken tussen "nog niets binnengekomen" en "je filters
       verbergen alles" — anders stuurt de lege staat je naar filters die
       je helemaal niet hebt aanstaan. */
    wrap.className = '';
    wrap.innerHTML = leads().length
      ? CRM.ui.leeg('Geen sollicitanten met deze filters',
          'Er staan er wel ' + leads().length + ' in het systeem. Verruim je zoekterm, bron, vacature of status.')
      : CRM.ui.leeg('Nog geen sollicitanten binnen',
          'Reacties via Meta, Indeed of het formulier komen hier binnen. Je kunt er ook zelf een toevoegen met + Sollicitant, of een lijst importeren.');
    return;
  }
  if(weergave() === 'bord') tekenLeadBord(wrap, rijen);
  else tekenLeadTabel(wrap, rijen);
}
/* Oude naam, nog gebruikt vanuit de import- en cv-flows. */
const tekenLijst = () => tekenWerk();

function tekenLeadTabel(wrap, rijen){
  const toon = rijen.slice(0,200);
  wrap.className = '';
  wrap.innerHTML = `
    <div class="tblwrap">
      <table class="tbl rc-tbl">
        <thead><tr>
          <th style="width:24px"></th><th>Sollicitant</th><th>Contact</th><th>Bron</th>
          <th>Reageerde op</th><th>Agent</th><th style="width:236px">Status</th><th>Eigenaar</th><th class="n">Binnen</th>
        </tr></thead>
        <tbody>${toon.map(rijHtml).join('')}</tbody>
      </table>
    </div>
    ${rijen.length > 200 ? `<p class="meta" style="margin:10px 2px">Eerste 200 van ${rijen.length} getoond — verfijn je filter.</p>` : ''}
    ${klaarRegelHtml()}`;

  bindKlaar(wrap);
  CRM.$$('tr.clickable', wrap).forEach(tr => tr.onclick = () => openLead(tr.dataset.id));
  CRM.$$('select.rc-stsel', wrap).forEach(sel => {
    sel.onclick = e => e.stopPropagation();
    sel.onchange = e => { e.stopPropagation(); zetStatus(leadById(sel.dataset.id), sel.value); };
  });
  CRM.$$('a.rc-tel', wrap).forEach(a => a.onclick = e => e.stopPropagation());
  bindLeadActies(wrap);
}

function rijHtml(l){
  const v = vacVan(l);
  const bel = belPogingen(l.id);
  const wa = waLink(l.telefoon);
  const dg = leadDagen(l);
  const nieuw = l.status === 'Nieuw';
  const stil = CRM.LEAD_OPEN.includes(l.status) && (CRM.dagenGeleden(l.laatst_actie || l.binnen_op) || 0) > 2;
  const dub = dubbelAantal(l);
  return `<tr class="clickable ${nieuw && dg >= NIEUW_TELANG ? 'rc-telang' : ''}" data-id="${h(l.id)}">
    <td><span class="rc-prio" title="Prioriteit ${h(l.prioriteit||'onbekend')}" style="background:${prioKleur(l.prioriteit)}"></span></td>
    <td>
      <div class="rc-naam">${h(leadNaam(l))}</div>
      <div class="rowsub">${h(l.woonplaats||'—')}${l.cv?' · cv':''}${dub > 1 ? ` · <span class="rc-dub" title="Ditzelfde telefoonnummer staat ${dub}× in de lijst — mogelijk twee keer gesolliciteerd">${dub}× in de lijst</span>` : ''}</div>
    </td>
    <td>
      ${l.telefoon ? `<a class="rc-tel num" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">${h(l.telefoon)}</a>
        ${wa?`<a class="rc-tel rc-wa" href="${h(wa)}" target="_blank" rel="noopener" title="WhatsApp">wa</a>`:''}` : '<span class="meta">geen nummer</span>'}
      ${bel ? `<div class="rowsub">${bel}× gebeld</div>` : ''}
    </td>
    <td><span class="chip">${h(l.bron||'—')}</span>${l.campagne?`<div class="rowsub trunc" style="max-width:118px">${h(l.campagne)}</div>`:''}</td>
    <td>${vacCelHtml(l, v)}</td>
    <td>
      ${l.score != null ? `<span class="chip ${l.score>=70?'green':l.score>=45?'amber':''} num">${h(l.score)}</span>` : ''}
      <div class="rowsub trunc" style="max-width:150px">${h(l.kwalificatie||'')}</div>
    </td>
    <td>
      <div class="rc-stwrap" style="--sc:${CRM.leadKleur(l.status)}">
        <select class="rc-stsel" data-id="${h(l.id)}">
          ${statusBestaat(l.status) ? '' : `<option value="${h(l.status)}" selected>${h(l.status||'(geen status)')} — bestaat niet meer</option>`}
          ${CRM.LEAD_STATUS.map(s=>`<option value="${h(s.k)}" ${l.status===s.k?'selected':''}>${h(s.k)}</option>`).join('')}
        </select>
      </div>
    </td>
    <td>${l.eigenaar ? `<span class="chip">${h(l.eigenaar)}</span>` : '<span class="meta">—</span>'}</td>
    <td class="n"><span class="num ${nieuw && ouderdomKlas(dg) ? 'rc-oud-'+ouderdomKlas(dg) : stil?'rc-stil':''}"
      title="Binnengekomen ${h(CRM.fmtDate(l.binnen_op)||'onbekend')}">${h(uurGeleden(l.binnen_op) || '—')}</span></td>
  </tr>`;
}

/* De cel "Reageerde op". Drie toestanden die echt verschillen:
   gekoppeld · nooit gekoppeld · gekoppeld aan iets wat niet meer bestaat. */
function vacCelHtml(l, v){
  if(v) return `<div>${h(v.functie)}</div><div class="rowsub">${h(v.klant)}</div>`;
  if(vacWeg(l)) return `<div><span class="chip amber">vacature bestaat niet meer</span></div>
    ${losFunctie(l) ? `<div class="rowsub">was: ${h(losFunctie(l))}</div>` : ''}
    <button class="btn ghost sm rc-koppel" data-koppel="${h(l.id)}">Opnieuw koppelen</button>`;
  return `${losFunctie(l) ? `<div class="rowsub">${h(losFunctie(l))}${l.klant?' · '+h(l.klant):''}</div>` : ''}
    <button class="btn ghost sm rc-koppel" data-koppel="${h(l.id)}">Koppel vacature</button>`;
}

/* Hier stonden vier snelknoppen (geen gehoor / potentieel / geen interesse /
   niet geschikt) onder elke lead op Nieuw. Eruit gehaald op 31 jul 2026: ze
   deden precies wat de statuslijst ernaast al doet, namen twee regels in een
   smalle kolom en braken af over twee regels. Snel wegwerken hoort in de
   wegwerkmodus (knop "Wegwerken →"), waar één toets per lead genoeg is —
   dat is sneller dan klikken in een lijst, en het houdt de lijst leesbaar. */

function bindLeadActies(wrap){
  CRM.$$('[data-koppel]', wrap).forEach(b => b.onclick = e => {
    e.stopPropagation();
    koppelVacature(leadById(b.dataset.koppel));
  });
  CRM.$$('[data-lstat]', wrap).forEach(b => b.onclick = e => {
    e.stopPropagation();
    statusPicker(b.dataset.lstat);
  });
}

/* Melding onder de lijst/het bord: hoeveel lopende leads missen een vacature.
   Zonder die koppeling weet Tjeerd niet hoeveel leads een advertentie oplevert,
   en dat is precies het cijfer waar de marketing op stuurt. */
function koppelStrook(wrap){
  const el = wrap.querySelector('#rc_zondervac'); if(!el) return;
  el.querySelector('button').onclick = () => {
    S.l.zvac = true; S.l.status = '';
    const box = document.getElementById('rc_zvac'); if(box) box.checked = true;
    tekenWerk();
  };
}

function waarschuwingenHtml(){
  /* Al aan het bijwerken? Dan niet ook nog eens de melding erbij die zegt dat
     je moet gaan bijwerken. */
  if(S.l.zvac) return '';
  const open = leads().filter(l => CRM.LEAD_OPEN.includes(l.status));
  const zonder = open.filter(l => !isGekoppeld(l));
  const weg    = zonder.filter(vacWeg).length;
  /* Statussen die niet meer bestaan (hernoeming, import met eigen statuskolom).
     Zulke leads vallen uit elke kolom en elk statusfilter; niet melden zou
     betekenen dat ze stilletjes verdwijnen. */
  const vreemd = leads().filter(l => !statusBestaat(l.status));
  let uit = '';
  if(zonder.length) uit += `<div class="note warn" id="rc_zondervac" style="margin-bottom:14px">
    <b>${zonder.length} lopende ${zonder.length===1?'sollicitant is':'sollicitanten zijn'} niet aan een vacature gekoppeld</b>${
      weg ? ` — waarvan ${weg} aan een vacature die niet meer bestaat` : ''}.
    Zonder koppeling tellen ze niet mee bij leads per vacature en per klant, en dat is de meting waar de advertenties op worden bijgestuurd.
    <button class="btn ghost sm" style="margin-left:8px">Toon ze</button></div>`;
  if(vreemd.length) uit += `<div class="note warn" style="margin-bottom:14px">
    ${vreemd.length} ${vreemd.length===1?'sollicitant staat':'sollicitanten staan'} op een status die niet meer bestaat
    (${h(Array.from(new Set(vreemd.map(l => l.status || '(leeg)'))).join(', '))}).
    ${vreemd.length===1?'Die valt':'Die vallen'} buiten de kolommen — kies in de lijst een geldige status.</div>`;
  return uit;
}

/* ─── De afsluiting: klaar om voor te stellen ─────────────────────
   Wie de videocall heeft gehad is hier klaar. De kandidaatkaart staat op
   fase 'Intake' en verschijnt daarmee bewust níét op het bord van de
   Klanttrajecten — dat bord begint bij 'Voorgesteld'. Zonder deze regel
   zou die kandidaat nergens meer te zien zijn: de recruiter is klaar en
   de AM weet niet dat er iemand klaarstaat. */
function klaarKandidaten(){
  return CRM.kandidaten().filter(CRM.klaarOmVoorTeStellen)
    .sort((a,b) => String(b.since||'').localeCompare(String(a.since||'')));
}
/* De hele voorraad staat bij Kandidaten onder het statusfilter
   'gekwalificeerd' — precies wat hier uit rolt. Daarheen doorklikken zorgt dat
   de recruiter en de AM naar hetzelfde lijstje kijken in plaats van naar twee
   verschillende tellingen. */
const naarVoorraad = () => CRM.ga('kandidaten', {status:'gekwalificeerd'});

function klaarRegelHtml(){
  const k = klaarKandidaten();
  if(!k.length) return `<div class="rc-klaar leeg"><b>Klaar om voor te stellen</b>
    <span class="meta">Nog niemand. Wie de videocall heeft gehad komt hier te staan, klaar voor de AM.</span></div>`;
  const toon = k.slice(0,24);
  return `<div class="rc-klaar">
    <div class="rc-klaarkop"><b>Klaar om voor te stellen</b><span class="num">${k.length}</span>
      <span class="meta">intake gehad · wacht op een klant — daarna gaat het verder bij Klanttrajecten</span>
      <button class="btn ghost sm" data-voorraad>Hele voorraad →</button></div>
    <div class="rc-klaarrij">${toon.map(c => `<button class="rc-naamchip" data-klaar="${h(c.id)}">${h(c.naam)}<em>${
      h(c.functie || '—')}${c.intake && c.intake.cijfer ? ' · ' + h(c.intake.cijfer) + '/10' : ''}</em></button>`).join('')}
      ${k.length > toon.length ? `<button class="btn ghost sm" data-voorraad>+ ${k.length - toon.length} meer</button>` : ''}</div>
  </div>`;
}
function bindKlaar(wrap){
  CRM.$$('[data-klaar]', wrap).forEach(b => b.onclick = () => CRM.ga('kandidaten', {id:b.dataset.klaar}));
  CRM.$$('[data-voorraad]', wrap).forEach(b => b.onclick = () => naarVoorraad());
}

/* ═══════════════════════════════════════════════════════════════
   HET BORD — kolommen per status, slepen, teller per kolom
   Opzet 1-op-1 die van de Klanttrajecten (js/pijplijn.js): dezelfde
   .board/.bcol/.bcard uit base.css en dezelfde smalle strook ernaast
   voor de eindstations. Zo voelt het bord van de recruiter hetzelfde
   als dat van de AM, zonder dat de twee modules elkaars code aanraken.
   ═══════════════════════════════════════════════════════════════ */
/* Kolommen = het werk. De drie eindstations staan in de strook ernaast:
   ze zijn geen fase waar je doorheen loopt, maar een plek waar iets stopt.
   'Doorgeschoten' krijgt ook geen kolom — dat is de overdracht, en die
   staat als laatste kolom met de kandidaten die klaarstaan. */
const BORD_MAX = 50;                    // kaarten per kolom; de rest achter een teller

function tekenLeadBord(wrap, rijen){
  wrap.className = 'rc-leadbord';
  wrap.innerHTML = `<div class="rc-bordwrap"><div class="board" id="rc_board"></div>
    <div class="rc-uit" id="rc_eind"></div></div>`;
  const board = wrap.querySelector('#rc_board');

  const kolommen = CRM.LEAD_OPEN.map(k => {
    const st = CRM.LEAD_STATUS.find(s => s.k === k) || {k, c:'#8a927c'};
    const kaarten = k === 'Nieuw'
      ? oudsteEerst(rijen.filter(l => l.status === k))     // oudste bovenaan: die moet eerst weg
      : rijen.filter(l => l.status === k);
    const toon = kaarten.slice(0, BORD_MAX);
    let kop = '';
    if(k === 'Nieuw'){
      const oud = kaarten.filter(l => (leadDagen(l) || 0) >= NIEUW_TELANG).length;
      if(oud) kop = `<div class="rc-letnote num">${oud}× ${NIEUW_TELANG} dagen of langer — bel die eerst</div>`;
    }
    if(k === 'Videocall gepland'){
      const geen = kaarten.filter(l => !l.opvolgen_op).length;
      if(geen) kop = `<div class="rc-letnote num">${geen}× zonder datum</div>`;
    }
    return `<div class="bcol" data-status="${h(k)}" style="--ph:${st.c}">
      <div class="bcol-h"><b>${h(k)}</b><span class="cnt num">${kaarten.length}</span></div>
      <div class="bcol-b">${kop}${toon.map(leadKaartHtml).join('') || `<div class="rc-leegkol">${h(leegTekst(k))}</div>`}
        ${kaarten.length > toon.length ? `<div class="rc-meer num">+ ${kaarten.length - toon.length} meer — filter of zoek om ze te zien</div>` : ''}
      </div></div>`;
  }).join('');

  /* Afsluitende kolom: geen leads maar kandidaten. Bewust een andere kop en
     geen sleepdoel — hier houdt de recruitmentpijplijn op. */
  const klaar = klaarKandidaten();
  const klaarKol = `<div class="bcol rc-overdracht" style="--ph:${CRM.faseKleur('Intake')}">
    <div class="bcol-h"><b>Klaar om voor te stellen</b><span class="cnt num">${klaar.length}</span></div>
    <div class="bcol-b">
      <div class="rc-overnote">Kandidaatkaart compleet, intake gehad. Vanaf hier gaat het verder bij <b>Klanttrajecten</b>.
        <button class="btn ghost sm" data-voorraad style="margin-top:8px;width:100%;justify-content:center">Hele voorraad →</button></div>
      ${klaar.slice(0,BORD_MAX).map(c => `<div class="bcard" data-klaar="${h(c.id)}">
        <div class="bc-t"><div class="bc-n">${h(c.naam)}<div class="bc-s">${h(c.functie||'—')}${c.klant?' @ '+h(c.klant):''}</div></div>
        ${c.rec?`<span class="rc-rec" title="${h(c.rec)}">${h(CRM.initialen(c.rec))}</span>`:''}</div>
        <div class="bc-f">${c.intake && c.intake.cijfer
            ? `<span class="chip ${c.intake.cijfer<7?'amber':'green'} num">intake ${h(c.intake.cijfer)}/10</span>`
            : intakeDone(c) ? '<span class="chip green">intake ✓</span>'
            : '<span class="chip amber" title="De videocall is geweest, de vragenlijst is nog niet ingevuld">intake nog invullen</span>'}
          ${c.intake && c.intake.videocallOp ? `<span class="chip num" title="Datum van de videocall">call ${h(CRM.fmtDateShort(c.intake.videocallOp))}</span>` : ''}
          ${c.woonplaats?`<span class="chip">${h(c.woonplaats)}</span>`:''}</div>
      </div>`).join('') || `<div class="rc-leegkol">Nog niemand klaar.</div>`}
    </div></div>`;
  board.innerHTML = kolommen + klaarKol;

  /* Smalle strook: de eindstations. Slepen naar hier sluit een lead af. */
  const eind = wrap.querySelector('#rc_eind');
  const alle = leads();
  const door = alle.filter(l => l.status === 'Doorgeschoten').length;
  eind.innerHTML = `<div class="label" style="padding:0 4px 6px">Eindstations</div>` +
    CRM.LEAD_EIND.filter(s => s !== 'Doorgeschoten').map(s => {
      const n = rijen.filter(l => l.status === s).length;
      return `<div class="rc-uitzone" data-status="${h(s)}" style="--ph:${CRM.leadKleur(s)}">
        <b>${h(s)}</b><span class="num">${n}</span><span class="meta">sleep hierheen</span></div>`;
    }).join('') +
    `<div class="rc-uitzone geenslepen" style="--ph:${CRM.leadKleur('Doorgeschoten')}">
      <b>Doorgeschoten</b><span class="num">${door}</span>
      <span class="meta">via de knop op de kaart — er komt een kandidaat van</span></div>` +
    `<button class="btn ghost sm" id="rc_naarlijst" style="width:100%;justify-content:center">Als lijst tonen →</button>`;
  eind.querySelector('#rc_naarlijst').onclick = () => { zetWeergave('lijst'); tekenBody(); };

  /* Klikken = het detailpaneel; slepen = status wijzigen. */
  CRM.$$('.bcard[data-id]', board).forEach(k => {
    k.ondragstart = e => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('drag'); };
    k.ondragend   = () => k.classList.remove('drag');
    k.onclick = e => { if(!e.target.closest('button,a')) openLead(k.dataset.id); };
  });
  bindKlaar(board);
  bindLeadActies(board);
  CRM.$$('.bcol[data-status], .rc-uitzone[data-status]', wrap).forEach(zone => {
    zone.ondragover  = e => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = e => {
      e.preventDefault(); zone.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      if(id) zetStatus(leadById(id), zone.dataset.status);
    };
  });
}

const leegTekst = k => ({
  'Nieuw':'Nieuwe reacties komen hier binnen.',
  'Gebeld — geen gehoor':'Niemand aan de lijn gemist.',
  'Potentieel':'Nog niemand als potentieel bestempeld.',
  'CV opgevraagd':'Geen openstaande cv-verzoeken.',
  'CV binnen':'Nog geen cv ontvangen.',
  'Videocall gepland':'Geen calls ingepland.',
  'Videocall gehad':'Nog geen calls gehad.'
})[k] || '—';

function leadKaartHtml(l){
  const v = vacVan(l);
  const dg = leadDagen(l);
  const nieuw = l.status === 'Nieuw';
  const bel = belPogingen(l.id);
  const dub = dubbelAantal(l);
  const wa = waLink(l.telefoon);
  const chips = [];
  if(nieuw && dg != null && dg >= NIEUW_LETOP)
    chips.push(`<span class="chip ${ouderdomKlas(dg)} num" title="Staat sinds ${h(CRM.fmtDate(l.binnen_op)||'?')} op Nieuw">${dg}d op Nieuw</span>`);
  if(l.bron) chips.push(`<span class="chip">${h(l.bron)}</span>`);
  if(l.woonplaats) chips.push(`<span class="chip" title="Woonplaats">${h(l.woonplaats)}</span>`);
  if(!v) chips.push(`<span class="chip amber" title="${vacWeg(l)?'De gekoppelde vacature bestaat niet meer':'Nog niet aan een vacature gekoppeld'}">${vacWeg(l)?'vacature weg':'geen vacature'}</span>`);
  if(l.cv) chips.push(`<span class="chip">cv</span>`);
  if(bel) chips.push(`<span class="chip num" title="Belpogingen">${bel}× gebeld</span>`);
  if(dub > 1) chips.push(`<span class="chip purple num" title="Ditzelfde telefoonnummer staat ${dub}× in de lijst">${dub}× in de lijst</span>`);
  return `<div class="bcard rc-leadkaart" draggable="true" data-id="${h(l.id)}">
    <div class="bc-t">
      <div class="bc-n">${h(leadNaam(l))}
        <div class="bc-s">${v ? h(v.functie) + ' · ' + h(v.klant) : (losFunctie(l) ? h(losFunctie(l)) : '<em>nog geen vacature</em>')}</div></div>
      ${l.eigenaar?`<span class="rc-rec" title="${h(l.eigenaar)}">${h(CRM.initialen(l.eigenaar))}</span>`:''}
    </div>
    ${chips.length?`<div class="bc-f">${chips.join('')}</div>`:''}
    <div class="rc-kaarttel">${l.telefoon
      ? `<a class="rc-tel num" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">${h(l.telefoon)}</a>${
          wa?`<a class="rc-tel rc-wa" href="${h(wa)}" target="_blank" rel="noopener" title="WhatsApp">wa</a>`:''}`
      : `<span class="meta">geen telefoonnummer</span>`}</div>
    ${!v ? `<button class="btn ghost sm rc-koppel" data-koppel="${h(l.id)}">Koppel vacature</button>` : ''}
    <button class="btn ghost sm rc-move" data-lstat="${h(l.id)}">Verplaatsen naar status…</button>
  </div>`;
}

/* ─── Status kiezen in plaats van slepen (mobiel, en de kaart) ── */
function statusPicker(id){
  const l = leadById(id); if(!l) return;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(leadNaam(l))} verplaatsen</div>
      <p class="sub" style="margin:6px 0 0">Kies de nieuwe status.</p></div>
    <div class="modal-b"><div class="rc-fasepick">
      ${CRM.LEAD_STATUS.map(s => `<button data-s="${h(s.k)}" class="${l.status===s.k?'nu':''}">
        <i class="dot" style="background:${s.c}"></i>${h(s.k)}${l.status===s.k?'<span class="meta">huidige status</span>':''}</button>`).join('')}
    </div></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      CRM.$$('[data-s]', m).forEach(b => b.onclick = () => {
        CRM.modal.close();
        if(b.dataset.s !== l.status) zetStatus(l, b.dataset.s);
      });
    }});
}

/* ─── Vacature koppelen ───────────────────────────────────────────
   Een lead die via een advertentie binnenkomt heeft zijn vacature al; een
   lead die je zelf toevoegt of importeert vaak niet. Koppelen moet daarom
   twee klikken kosten, niet zeven: de drie best passende vacatures staan
   als knop klaar (op functiewoorden en reisafstand, CRM.matchScore), met
   de volledige lijst eronder voor als het er geen van drieën is. */
/* `naAfloop` wordt precies één keer aangeroepen: met de gekozen vacature als
   het gelukt is, met null als er is geannuleerd. De wegwerkmodus hangt daaraan
   om zichzelf daarna weer op te bouwen — zonder die garantie blijft die modus
   half open achter. */
function koppelVacature(lead, naAfloop){
  if(!lead) return;
  const alle = (CRM.state.vacs||[]).slice();
  const open = alle.filter(v => !v.status || v.status === 'Open');
  const pool = open.length ? open : alle;
  /* Een lead heeft dezelfde velden die matchScore nodig heeft: woonplaats,
     functie en eventueel een ingelezen cv. */
  const sug = pool.map(v => ({v, score:CRM.matchScore({woonplaats:lead.woonplaats, functie:lead.functie || (lead.cv&&lead.cv.functie), cv:lead.cv}, v)}))
    .filter(x => x.score >= 30).sort((a,b) => b.score - a.score).slice(0,3);
  const gesorteerd = alle.slice().sort((a,b) => vacLabel(a).localeCompare(vacLabel(b)));
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Vacature koppelen</div>
      <p class="sub" style="margin:6px 0 0">${h(leadNaam(lead))}${lead.woonplaats?' · '+h(lead.woonplaats):''}${
        losFunctie(lead)?' · zoekt: '+h(losFunctie(lead)):''}</p></div>
    <div class="modal-b">
      ${vacWeg(lead) ? `<div class="note warn" style="margin-bottom:12px">De eerder gekoppelde vacature bestaat niet meer. Kies een bestaande.</div>` : ''}
      ${sug.length ? `<div class="f-row"><label>Past waarschijnlijk</label>
        <div class="rc-sug">${sug.map(x => `<button data-v="${h(x.v.id)}">
          <b>${h(x.v.functie)}</b><small>${h(x.v.klant)}${x.v.locatie?' · '+h(x.v.locatie):''}</small>
          <span class="num">${x.score}%</span></button>`).join('')}</div>
        <span class="hint">Op functiewoorden en reisafstand — controleer het zelf.</span></div>` : ''}
      <div class="f-row"><label for="kv_vac">${sug.length?'Of kies uit alle vacatures':'Vacature'}</label>
        <select id="kv_vac"><option value="">— kies de vacature —</option>
          ${gesorteerd.map(v=>`<option value="${h(v.id)}" ${String(lead.vacature_id)===String(v.id)?'selected':''}>${h(vacLabel(v))}</option>`).join('')}</select>
        <span class="hint">Hierop rust de meting leads per vacature en per klant.</span></div>
      <div class="note err" id="kv_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="kv_ok">Koppelen</button></div>`, {
      onClose(){ if(naAfloop) naAfloop(null); },
      onOpen(m){
      const doe = async id => {
        const v = vacById(id);
        if(!v){ const e = m.querySelector('#kv_err'); e.style.display=''; e.textContent = 'Kies een vacature.'; return; }
        CRM.modal._onClose = null;              // het vervolg regelen we hieronder zelf
        CRM.modal.close();
        const ok = await bewaarLead(lead, {vacature_id:v.id, klant:v.klant, functie:v.functie});
        if(ok){
          await CRM.logActiviteit('lead', lead.id, 'systeem', `Gekoppeld aan ${v.functie} · ${v.klant}`);
          CRM.toast(`Gekoppeld aan ${v.functie} · ${v.klant}`, 'ok');
          tekenBar(); tekenWerk();
          if(document.getElementById('drawer')?.classList.contains('on')) openLead(lead.id);
        }
        if(naAfloop) naAfloop(ok ? v : null);
      };
      CRM.$$('.rc-sug button', m).forEach(b => b.onclick = () => doe(b.dataset.v));
      m.querySelector('#kv_ok').onclick = () => doe(m.querySelector('#kv_vac').value);
    }});
}

/* ═══════════════════════════════════════════════════════════════
   WEGWERKEN — de belronde
   Wie veertig leads afbelt wil per lead één handeling en door. Daarom
   niet een venster per sollicitant, maar één venster dat blijft staan
   en zichzelf doorschuift: bellen, uitkomst kiezen, volgende.
   Elke uitkomst is één toets (of één klik) en slaat meteen op — er is
   geen "opslaan"-knop, want die vergeet je bij de dertigste.
   Oudste eerst, want die liggen er het langst.
   ═══════════════════════════════════════════════════════════════ */
const WW_KEUZES = [
  {t:'1', s:'Gebeld — geen gehoor',           lbl:'Geen gehoor'},
  {t:'2', s:'Potentieel',                     lbl:'Potentieel'},
  {t:'3', s:'CV opgevraagd',                  lbl:'CV opgevraagd'},
  {t:'4', s:'Videocall gepland',              lbl:'Videocall plannen'},
  {t:'5', s:'Geen interesse',                 lbl:'Geen interesse'},
  {t:'6', s:'Niet geschikt',                  lbl:'Niet geschikt'},
  {t:'7', s:'Potentieel — andere vacature',   lbl:'Andere vacature'}
];

function wegwerkModus(){
  /* Een momentopname van de stapel. Bewust niet meelopen met de filters
     terwijl je bezig bent: als de lijst onder je handen verspringt raak je
     kwijt waar je was. */
  const stapel = oudsteEerst(leadsGefilterd(true).filter(l => l.status === 'Nieuw'));
  if(!stapel.length) return CRM.toast('Er staat niets op Nieuw','ok');
  let i = 0, gedaan = 0, over = 0;
  let aan = true;

  const opToets = e => {
    if(!aan || !CRM.modal._aan) return;
    const el = document.activeElement;
    /* Typen in het notitieveld mag geen status wijzigen. Escape/Enter haalt de
       focus er weer af, zodat de cijfertoetsen daarna weer werken. */
    if(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)){
      if(e.key === 'Enter' || e.key === 'Escape'){ e.preventDefault(); el.blur(); }
      return;
    }
    const k = WW_KEUZES.find(x => x.t === e.key);
    if(k){ e.preventDefault(); return kies(k.s); }
    if(e.key === 'ArrowRight' || e.key === 's'){ e.preventDefault(); return volgende(true); }
    if(e.key === 'b'){ const a = document.querySelector('#ww_bel'); if(a){ e.preventDefault(); a.click(); } }
  };

  function volgende(overgeslagen){
    if(overgeslagen) over++;
    i++; teken();
  }
  async function kies(status){
    const l = stapel[i]; if(!l) return;
    const inp = document.getElementById('ww_note');
    const notitie = inp ? inp.value.trim() : '';
    const ok = await pasStatusToe(l, status, notitie);
    if(ok) gedaan++;
    i++; teken();
  }

  function teken(){
    const box = document.getElementById('ww_in'); if(!box) return;
    const l = stapel[i];
    if(!l){
      box.innerHTML = `
        <div class="modal-h"><div class="h2">Stapel weggewerkt</div></div>
        <div class="modal-b">
          <div class="note ok" style="margin:0">${gedaan} van de ${stapel.length} ${gedaan===1?'sollicitant heeft':'sollicitanten hebben'} een nieuwe status gekregen${
            over ? `, ${over} ${over===1?'is':'zijn'} overgeslagen en ${over===1?'staat':'staan'} nog op Nieuw` : ''}.</div>
        </div>
        <div class="modal-f"><div class="spacer"></div><button class="btn" id="ww_klaar">Sluiten</button></div>`;
      box.querySelector('#ww_klaar').onclick = () => CRM.modal.close();
      return;
    }
    const v = vacVan(l);
    const dg = leadDagen(l);
    const bel = belPogingen(l.id);
    const contact = laatsteContact(l.id);
    const dub = dubbelAantal(l);
    const wa = waLink(l.telefoon);
    const pct = Math.round(i / stapel.length * 100);
    box.innerHTML = `
      <div class="modal-h">
        <div class="row" style="justify-content:space-between;align-items:baseline">
          <div class="h2">Wegwerken</div>
          <span class="meta num">${i+1} van ${stapel.length}</span>
        </div>
        ${CRM.ui.bar(pct)}
      </div>
      <div class="modal-b">
        <div class="rc-wwkop">
          <div>
            <div class="rc-wwnaam">${h(leadNaam(l))}</div>
            <div class="sub">${h(l.woonplaats || 'woonplaats onbekend')} · ${h(l.bron || 'onbekende bron')}${
              l.campagne ? ' · ' + h(l.campagne) : ''}</div>
          </div>
          <span class="chip ${ouderdomKlas(dg)} num" title="Binnengekomen ${h(CRM.fmtDate(l.binnen_op)||'onbekend')}">${
            dg == null ? 'datum onbekend' : dg === 0 ? 'vandaag binnen' : dg + ' dag' + (dg===1?'':'en') + ' op Nieuw'}</span>
        </div>
        <div class="rc-wwbel">
          ${l.telefoon
            ? `<a class="btn" id="ww_bel" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">Bel ${h(l.telefoon)}</a>
               ${wa ? `<a class="btn ghost" href="${h(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`
            : `<span class="note warn" style="margin:0">Geen telefoonnummer — appen of mailen kan wel, bellen niet. Vul het nummer aan op de kaart.</span>`}
          ${l.email ? `<a class="btn ghost" href="mailto:${h(l.email)}">E-mail</a>` : ''}
        </div>
        <div class="rc-wwinfo">
          <div class="rc-kv"><span class="label">Reageerde op</span><span>${
            v ? h(v.functie) + ' · ' + h(v.klant)
              : `<span class="chip amber">${vacWeg(l) ? 'vacature bestaat niet meer' : 'geen vacature'}</span>
                 <button class="btn ghost sm" id="ww_koppel" style="margin-left:8px">Koppelen</button>`}</span></div>
          ${l.kwalificatie ? `<div class="rc-kv"><span class="label">Kwalificatie</span><span>${h(l.kwalificatie)}</span></div>` : ''}
          ${l.agent_notitie ? `<div class="rc-kv"><span class="label">Agent</span><span>${h(l.agent_notitie)}</span></div>` : ''}
          ${bel || contact ? `<div class="rc-kv"><span class="label">Eerder</span><span>${
            bel ? bel + '× gebeld' : ''}${bel && contact ? ' · ' : ''}${
            contact ? 'laatste contact ' + h(CRM.geleden(contact) || CRM.fmtDate(contact)) : ''}</span></div>` : ''}
          ${dub > 1 ? `<div class="rc-kv"><span class="label">Let op</span><span>Ditzelfde nummer staat ${dub}× in de lijst — mogelijk twee keer gesolliciteerd.</span></div>` : ''}
        </div>
        <div class="f-row" style="margin-top:14px"><label for="ww_note">Notitie (optioneel)</label>
          <input type="text" id="ww_note" placeholder="Bijv. belt maandag terug">
          <span class="hint">Terwijl je hier typt werken de cijfertoetsen niet — Enter zet ze weer aan.</span></div>
        <div class="rc-wwkeuze">${WW_KEUZES.map(k =>
          `<button data-s="${h(k.s)}"><kbd>${k.t}</kbd>${h(k.lbl)}</button>`).join('')}</div>
      </div>
      <div class="modal-f">
        <button class="btn ghost" id="ww_over">Overslaan <kbd>→</kbd></button>
        <div class="spacer"></div>
        <span class="meta">${gedaan} weggewerkt</span>
        <button class="btn ghost" data-mclose>Stoppen</button>
      </div>`;
    CRM.$$('[data-s]', box).forEach(b => b.onclick = () => kies(b.dataset.s));
    box.querySelector('#ww_over').onclick = () => volgende(true);
    const kb = box.querySelector('#ww_koppel');
    if(kb) kb.onclick = () => {
      /* Koppelen tussendoor: het koppelvenster komt over de belronde heen. Eerst
         de toetsen loskoppelen — anders zou een 3 in dat venster hier alsnog een
         status zetten. Daarna komt dezelfde sollicitant terug, nu mét vacature
         (of ongewijzigd, als er is geannuleerd). */
      aan = false;
      document.removeEventListener('keydown', opToets);
      koppelVacature(l, () => setTimeout(start, 60));
    };
    const mc = box.querySelector('[data-mclose]');
    if(mc) mc.onclick = () => CRM.modal.close();
  }

  function start(){
    aan = true;
    document.addEventListener('keydown', opToets);
    CRM.modal.open(`<div id="ww_in"></div>`, {
      onClose(){
        aan = false;
        document.removeEventListener('keydown', opToets);
        tekenBar(); tekenTabs(); tekenWerk(); CRM.navBadges();
      },
      onOpen(m){
        teken();
        /* De modal geeft de focus standaard aan het eerste veld; hier zou dat
           het notitieveld of de bel-link zijn en dan slikken die de
           cijfertoetsen in. Focus daarom op het venster zelf. */
        setTimeout(() => { if(m.isConnected) m.focus({preventScroll:true}); }, 80);
      }
    });
  }
  start();
}

/* ─── Status wijzigen ─────────────────────────────────────────────
   De schrijfactie zelf, zonder schermwerk: de wegwerkmodus roept deze
   tientallen keren achter elkaar aan en moet daar niet elke keer het hele
   bord voor hertekenen. */
async function pasStatusToe(lead, nieuw, notitie){
  if(!lead || lead.status === nieuw) return false;
  const oud = lead.status;
  const geenGehoor = nieuw === 'Gebeld — geen gehoor';
  const poging = belPogingen(lead.id) + 1;
  const patch = {status:nieuw, laatst_actie:new Date().toISOString()};
  if(notitie) patch.notities = (Array.isArray(lead.notities) ? lead.notities : [])
    .concat([{op:new Date().toISOString(), door:CRM.me(), tekst:notitie}]);
  const ok = await bewaarLead(lead, patch);
  if(!ok) return false;
  await CRM.logActiviteit('lead', lead.id, geenGehoor ? 'bel' : 'systeem',
    geenGehoor ? `Gebeld, geen gehoor (poging ${poging})` : `Status: ${oud || 'geen status'} → ${nieuw}`);
  if(notitie) await CRM.logActiviteit('lead', lead.id, 'notitie', notitie);
  return true;
}

async function zetStatus(lead, nieuw){
  if(!lead || lead.status === nieuw) return;
  /* Een lead wordt geen kandidaat door in een lijstje 'Doorgeschoten' te
     kiezen: er moet een kandidaatkaart komen, met complete gegevens. Het
     formulier zet de status zélf zodra dat gelukt is. */
  if(nieuw === 'Doorgeschoten'){ tekenWerk(); return doorschietForm(lead); }
  const geenGehoor = nieuw === 'Gebeld — geen gehoor';
  const poging = belPogingen(lead.id) + 1;
  const ok = await pasStatusToe(lead, nieuw);
  if(!ok) return;
  CRM.toast(geenGehoor ? `Belpoging ${poging} genoteerd` : 'Status bijgewerkt', 'ok');
  tekenBar(); tekenTabs(); tekenWerk(); CRM.navBadges();
  /* De videocall wil je meteen in de agenda hebben — anders staat er een
     status zonder afspraak en belt niemand meer terug. */
  if(nieuw === 'Videocall gepland') return videocallPlannen(lead);
  /* Videocall gehad is de laatste stap van deze pijplijn. Geen modal die je
     overvalt, wel een aanbod: één klik naar het doorschietformulier. */
  if(nieuw === 'Videocall gehad'){
    toastLink('Videocall gehad — maak er een kandidaat van', 'Doorschieten →', () => doorschietForm(lead));
    return;
  }
  if(document.getElementById('drawer')?.classList.contains('on')) openLead(lead.id);
}

/* Bij "Videocall gepland": datum/tijd vastleggen en desgewenst meteen in de
   eigen agenda zetten (Outlook of vooringevulde deeplink). */
function videocallPlannen(l){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Videocall plannen</div>
      <p class="sub" style="margin:6px 0 0">${h(leadNaam(l))} — de videocall ís de intake, dus plan er een half uur voor.</p></div>
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
      await CRM.logActiviteit('lead', l.id, 'systeem', `Videocall gepland op ${CRM.fmtDate(datum)} ${tijd}`);
      if(agenda){
        try{
          const r = await CRM.outlook.maakAfspraak({
            titel:`Videointake — ${leadNaam(l)}`, datum, tijd, duurMin:30, teams:true,
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
  const v = vacVan(l);
  const notities = Array.isArray(l.notities) ? l.notities : [];
  const doorgeschoten = l.status === 'Doorgeschoten' && l.kandidaat_id;
  const dg = leadDagen(l);
  bouwDubbel();     // het paneel kan ook via een deeplink openen, vóór de lijst
  const tijdlijn = notities.map(n => ({titel:n.door||'Notitie', wanneer:CRM.fmtDate(n.op), tekst:n.tekst}))
    .concat(CRM.activiteitenVoor('lead', l.id).map(a => ({
      titel:a.door||'Systeem',
      wanneer:CRM.fmtDate(a.op), tekst:a.tekst})));

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="flex:1;min-width:0">
        <div class="h2">${h(leadNaam(l))}</div>
        <div class="sub">${h(l.woonplaats||'—')} · ${h(l.bron||'onbekende bron')}${l.campagne?' · '+h(l.campagne):''}</div>
        <div class="row tight" style="margin-top:8px">
          <span class="chip"><i class="dot" style="background:${CRM.leadKleur(l.status)}"></i>${h(l.status||'geen status')}</span>
          ${l.status === 'Nieuw' && dg != null && dg >= NIEUW_LETOP
            ? `<span class="chip ${ouderdomKlas(dg)} num">${dg} dag${dg===1?'':'en'} op Nieuw</span>` : ''}
          ${dubbelAantal(l) > 1 ? `<span class="chip purple num" title="Zelfde telefoonnummer">${dubbelAantal(l)}× in de lijst</span>` : ''}
          ${l.prioriteit?`<span class="chip">Prioriteit ${h(l.prioriteit)}</span>`:''}
          ${l.score!=null?`<span class="chip num">Score ${h(l.score)}</span>`:''}
          ${belPogingen(l.id)?`<span class="chip">${belPogingen(l.id)}× gebeld</span>`:''}
          ${laatsteContact(l.id)?`<span class="chip" title="Laatste keer bellen, appen, mailen of spreken">contact ${h(CRM.geleden(laatsteContact(l.id)))}</span>`:''}
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
        <div class="card"><div class="card-h"><div class="h2">Reageerde op</div><div class="spacer"></div>
          <button class="btn ghost sm" id="rc_koppelbtn">${v?'Andere vacature':'Koppelen'}</button></div><div class="card-b">
          ${v ? `<div class="rc-kv"><span class="label">Vacature</span><span>${h(v.functie)}</span></div>
                 <div class="rc-kv"><span class="label">Klant</span><span>${h(v.klant)}</span></div>
                 <div class="rc-kv"><span class="label">Locatie</span><span>${h(v.locatie||'—')}</span></div>`
              : `<p class="note warn" style="margin:0 0 8px">${vacWeg(l)
                    ? 'De gekoppelde vacature bestaat niet meer, dus deze reactie telt nergens meer mee.'
                    : 'Nog niet aan een vacature gekoppeld.'}
                  Zolang dat zo blijft telt deze sollicitant niet mee bij leads per vacature en per klant.</p>
                 ${losFunctie(l)?`<div class="rc-kv"><span class="label">Ingevuld</span><span>${h(losFunctie(l))}${l.klant?' · '+h(l.klant):''}</span></div>`:''}`}
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
        ${statusBestaat(l.status) ? '' : `<option value="${h(l.status)}" selected>${h(l.status||'(geen status)')} — bestaat niet meer</option>`}
        ${CRM.LEAD_STATUS.map(s=>`<option value="${h(s.k)}" ${l.status===s.k?'selected':''}>${h(s.k)}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      ${doorgeschoten
        ? `<button class="btn" id="rc_naarkand">Open kandidaatkaart →</button>`
        : `<button class="btn" id="rc_door">→ Kandidaat maken</button>`}
    </div>`, {onOpen(dr){
      dr.querySelector('#rc_cvbtn').onclick = () => cvModal(l);
      dr.querySelector('#rc_koppelbtn').onclick = () => koppelVacature(l);
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
/* ─── De overdracht: van lead naar kandidaat ──────────────────────
   De laatste stap van deze pijplijn. Hij hoort ná 'Videocall gehad' te
   komen — de call ís de intake — en levert een kandidaatkaart op fase
   'Intake'. Die kaart staat bewust níét op het bord van de
   Klanttrajecten: dat bord begint bij 'Voorgesteld'. Wat hier ontstaat
   is een kandidaat die klaarstaat om aan een klant voorgesteld te
   worden, en die staat als afsluitende regel onderaan dit scherm.

   Het formulier bleef daarom een poortwachter tegen vervuiling (naam,
   telefoon, woonplaats, functie, bron, vacature), maar vraagt niet
   langer om een nieuwe videocall in te plannen — die heeft al
   plaatsgevonden. In plaats daarvan leggen we vast wanneer de call was
   en gaat de intake-vragenlijst meteen open. */
function doorschietForm(lead){
  if(!lead) return;
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

  /* Doorschieten vanaf een vroege status kan — soms weet je het na één
     gesprek al — maar dan zeggen we er wel bij dat de volgorde wordt
     overgeslagen. Zonder die opmerking sluipt er een kandidaat in zonder dat
     er ooit een videocall is geweest. */
  const vroeg = !['Videocall gehad','Videocall gepland','CV binnen'].includes(lead.status);
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Kandidaat maken van ${h(leadNaam(lead))}</div>
      <p class="sub" style="margin:6px 0 0">De kaart komt op fase <b>Intake</b> en staat daarmee klaar om voorgesteld te worden. Maak de gegevens eerst compleet — half ingevulde kandidaten vervuilen het systeem.</p></div>
    <div class="modal-b">
      ${vroeg ? `<div class="note warn" style="margin-bottom:12px">Deze sollicitant staat nog op <b>${h(lead.status||'geen status')}</b>. Normaal komt deze stap ná de videocall — die is immers de intake.</div>` : ''}
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
          <option value="">— kies de vacature waarop is gereageerd —</option>
          ${vacs.map(x=>`<option value="${h(x.id)}" ${String(lead.vacature_id)===String(x.id)?'selected':''}>${h(vacLabel(x))}</option>`).join('')}
        </select>
        <span class="hint">Nodig om marketing- en recruitmentprestaties aan elkaar te koppelen.</span></div>
      <div class="f-grid">
        <div class="f-row"><label for="ds_datum">Datum videocall</label>
          <input type="date" id="ds_datum" value="${h(videocallGehadOp(lead))}">
          <span class="hint">De call die is geweest — gaat mee naar de kandidaatkaart.</span></div>
        <div class="f-row"><label for="ds_rec">Recruiter</label>
          <input type="text" id="ds_rec" value="${h(lead.eigenaar || CRM.me())}"></div>
      </div>
      <label class="check"><input type="checkbox" id="ds_intake" checked> Intakeformulier meteen openen</label>
      <div class="note err" id="ds_err" style="display:none"></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ds_ok">Kandidaat aanmaken</button>
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
        if(ontbreekt.length){
          err.style.display = ''; err.textContent = 'Nog invullen: ' + ontbreekt.join(', ') + '.';
          return;
        }
        const x = vacById(vacSel.value);
        const vandaag = CRM.todayISO();
        const cand = {
          id: CRM.uid(), naam:g('naam'), telefoon:g('telefoon'), email:g('email'),
          woonplaats:g('woonplaats'), functie:g('functie'), klant:(x && x.klant) || lead.klant || '',
          type:'W&S', bron:g('bron'), fase:'Intake', datum:g('datum'), tijd:'',
          since:vandaag, rec:g('rec') || CRM.me(), vacatureId:vacSel.value, leadId:lead.id,
          cv:lead.cv || null, note:lead.kwalificatie || '',
          /* De videocall ís de intake, dus de kaart begint met één vaststaand
             feit: wanneer dat gesprek was. De rest van de vragenlijst vult de
             recruiter hierna in (intakeForm laat dit veld staan). */
          intake:{videocallOp:g('datum'), op:vandaag, door:g('rec') || CRM.me()},
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
        await CRM.logActiviteit('lead', lead.id, 'systeem', `Kandidaat aangemaakt — videocall ${CRM.fmtDate(cand.datum)}`);
        await CRM.logActiviteit('kandidaat', cand.id, 'gesprek', `Videocall gehad op ${CRM.fmtDate(cand.datum)} — kandidaat aangemaakt vanuit sollicitant (${cand.bron})`);
        const nuIntake = m.querySelector('#ds_intake').checked;
        CRM.modal.close(); CRM.drawer.close();
        tekenBar(); tekenTabs(); tekenBody(); CRM.navBadges();
        CRM.toast(`${cand.naam} staat klaar om voor te stellen`, 'ok');
        /* De intake is wat een kandidaat verkoopbaar maakt. Invullen terwijl
           het gesprek nog vers is levert een beter verhaal op dan een week
           later. Wie dat niet wil, gaat naar de volledige kaart. */
        if(nuIntake) intakeForm(cand.id);
        else CRM.ga('kandidaten', {id:cand.id});
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
      <p class="sub" style="margin:6px 0 0">Hoe wil je de sollicitant toevoegen?</p></div>
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
        ${opt('vac','Koppel aan een vacature','Komt als Nieuw in de recruitmentpijplijn bij die vacature — jij of een collega pakt het daar op.', true)}
        ${opt('golden','Golden candidate','Goede kandidaat, maar nu geen passende vacature. Krijgt de gouden ster ★ en blijft vindbaar via Kandidaten → filter "Golden candidates ★". Komt bewust niet op het bord.', false)}
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
        toastLink(`${gg.naam} staat als Nieuw in de recruitmentpijplijn`, 'Openen →', () => openLead(rij.id));
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
/* Soort afvaller: kwam de kaart ooit tot 'In de wacht' of verder, dan offer afgewezen. */
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

/* `alles()` tekent de eigen schermdelen van Recruitment opnieuw. Die bestaan
   alleen als Recruitment ook echt in beeld is. De fasewissel en het
   uitvalformulier worden óók vanaf het pijplijnbord aangeroepen (slepen naar
   de uitvalstrook) en vanaf de kandidatenkaart — dan moet de module die op dat
   moment openstaat verversen, anders blijft de kaart daar in zijn oude kolom
   staan en lijkt het alsof er niets is opgeslagen. */
function alles(){
  if(CRM.view !== 'recruitment') return CRM.render();
  tekenBar(); tekenTabs(); tekenBody(); CRM.navBadges();
}

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
  /* Een plaatsing is feest, voor iedereen die nu ingelogd is — en voor wie
     later inlogt (js/feest.js). Hier en nergens anders: élke fasewissel komt
     langs deze functie, of hij nu van het bord komt (slepen), uit de
     fase-picker of uit het formulier. Eén regel dekt alle ingangen, ook een
     die er later bij komt.

     De toets is "PLACED in, PLACED niet uit" en niet `fase === 'Contract
     getekend'`: een getekend contract met een startdatum van vandaag of
     eerder gaat meteen door naar Gestart, en dát is ook de plaatsing.
     Andersom viert Contract getekend → Gestart niet nog een keer.
     `c` is hier nog de kandidaat van vóór de wissel, dus c.fase is de oude. */
  if(CRM.PLACED.includes(fase) && !CRM.PLACED.includes(c.fase) && CRM.feest)
    CRM.feest.getekend({id:c.id, kandidaat:c.naam, klant:c.klant,
                        functie:c.functie, door:CRM.me()});
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
    : 'Zet de afspraak erbij, dan weet iedereen waar de kandidaat aan toe is.';
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
            <span class="hint">Datum van tekenen — nodig om als stopper te tellen.</span></div>
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
  /* Datum van uitval: bij een stop de stopdatum, bij een afvaller de dag dat de
     kaart op Afgevallen kwam (since). Een afvaller met een stopdatum is een fout in de
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
        : 'Komt op Intake te staan: klaar om voor te stellen, maar nog niet bij een klant. Zodra je die bij een klant voorstelt verschijnt hij op Klanttrajecten.'}</p></div>
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
        /* Meteen naar de volledige kandidatenkaart (wens Tjeerd, 31 jul 2026).
           Er stond hier een toast met een link, maar die verdwijnt na ruim drie
           seconden — miste je hem, dan moest je de kandidaat opnieuw opzoeken.
           Juist na het inlezen van een CV wil de AM zien of alles goed staat
           vóór de volgende stap, dus dat mag geen klik zijn die je kunt missen. */
        CRM.toast(`${cand.naam} staat in Intake — controleer de gegevens`, 'ok');
        CRM.ga('kandidaten', {id:cand.id});
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
      ${ta('samenvatting','Samenvatting voor de klant','drie feitelijke zinnen die de kandidaat verkopen')}
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
          /* De datum van de videocall komt uit de recruitmentpijplijn en wordt
             hier niet opnieuw gevraagd — maar hij mag ook niet verdwijnen
             zodra iemand de vragenlijst opslaat. */
          videocallOp:it.videocallOp || '',
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

/* VERZOEK AAN COORDINATOR: js/kandidaten.js leest in render() alleen
   `params.id`. De afsluitende regel/kolom hier ("Klaar om voor te stellen")
   navigeert met `CRM.ga('kandidaten', {status:'gekwalificeerd'})`, zodat de
   recruiter en de AM gegarandeerd naar hetzelfde lijstje kijken. Zolang die
   parameter niet gelezen wordt valt het terug op het opgeslagen filter van de
   gebruiker — dat staat standaard óók op 'gekwalificeerd', dus het klopt
   meestal, maar niet voor wie zijn filter ooit heeft omgezet.               */
/* VERZOEK AAN COORDINATOR: js/demo.js zet vier leads op de status
   'Intake gepland'. Die status bestaat niet meer (zie CRM.LEAD_STATUS in
   data.js). Ze vallen daardoor buiten elke bordkolom; dit scherm meldt ze nu
   apart zodat ze niet stilzwijgend verdwijnen, maar in de demo hoort dat
   'Videocall gepland' te zijn. Verder liggen alle demo-leads hoogstens twee
   dagen op Nieuw (binnen_op = nu − i × 1,5 uur), waardoor het signaal
   "blijft te lang liggen" in de demo nooit aangaat. Een handvol leads met een
   binnen_op van 4 tot 12 dagen geleden maakt dat testbaar.                  */
/* VERZOEK AAN CORE: crm_leads mist een kolom `belpogingen int default 0`.
   Zolang die er niet is leiden we het aantal belpogingen af uit
   crm_activiteiten (soort = 'bel'). Dat werkt, maar een teller in de rij
   zou sneller zijn zodra er duizenden leads in staan. */
/* VERZOEK AAN CORE: demo.js heeft geen ooSessions-testdata; O&O-sessies zijn
   in demo pas zichtbaar nadat je er zelf een aanmaakt (blijft in het geheugen). */
})();
