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

let tab      = V.get('tab','pijplijn');          // pijplijn | opvolg | activiteit | radar | vondsten
if(!['pijplijn','opvolg','activiteit','radar'].includes(tab)) tab = 'pijplijn';
let weergave = V.get('weergave','bord');         // bord | lijst
/* Stiltefilter: '' | c14 | c30 | a14 | a30 — (c)ontact of (a)ctiviteit,
   met het aantal dagen. Tjeerd (4 aug 2026): "filterknoppen met 30 dagen
   niet gesproken, 30 dagen geen activiteit, 14 dagen etc." */
let stilF    = V.get('stil','');
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
/* Documenten worden nooit als kant-en-klare link in de HTML gezet: de
   opslagmap is niet publiek, dus de link wordt pas bij de klik gemaakt.
   CRM.opslag doet dat én weigert alles wat geen bestand is (javascript:,
   data:). Hier alleen bepalen of er überhaupt iets te openen valt. */
const heeftBestand = d => CRM.opslag.duiding(d && d.url).soort !== 'leeg'
                       && CRM.opslag.duiding(d && d.url).soort !== 'geweigerd';

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
   aan meteen de eigen cijfers te zien. */
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

  /* De kanswaarde-tegel is met de kansen mee verdwenen; in de plaats staat
     de werkvoorraad die Tjeerd dagelijks wil bijhouden: open opvolgingen,
     met de verlopen taken als signaal. */
  const opv = openOpvolgingen();
  const verlopen = opv.filter(t => t.datum && t.datum < CRM.todayISO()).length;

  const tegels = [
    CRM.ui.kpi('Actieve trajecten', `<span class="num">${actief.length}</span>`,
      hangen ? `<span style="color:var(--amber)">${hangen} langer dan ${HANGT_NA} dagen stil</span>` : 'allemaal in beweging', 'accent'),
    CRM.ui.kpi('Gesprekken ingepland', `<span class="num">${gespr.length}</span>`,
      gem==null ? 'kennismakingen in de agenda' : `kennismakingen · gemiddeld <span class="num">${gem}</span> dgn in fase`),
    CRM.ui.kpi('Conversie naar klant', `<span class="num">${conv}%</span>`, `${klant.length} van ${alle.length} bedrijven in beeld`),
    CRM.ui.kpi('Open opvolgingen', `<span class="num">${opv.length}</span>`,
      verlopen ? `<span style="color:var(--red)">${verlopen} verlopen</span>` : 'niets verlopen')
  ];
  return `<div class="grid c3 s-kpi">${tegels.join('')}</div>`;
}

/* ─── Bord ─────────────────────────────────────────────────────── */
/* Laatst écht gesproken, per klant. Alleen contactsoorten tellen mee — een
   notitie, een fasewissel of een systeemregel is geen gesprek. Dezelfde
   lijst als het dashboard, Plaatsingen en de kandidatenlijst gebruiken
   (CRM.opvolging.CONTACT), want twee schermen die iets anders beweren over
   wanneer je iemand voor het laatst sprak, is precies de fout die op
   31 juli 2026 al een keer is rechtgezet.
   In één keer over alle activiteiten, niet per kaart: het bord tekent tot
   250 kaarten en er staan tot 2.000 activiteiten in het geheugen. */
function contactIndex(){
  const soort = new Set(CRM.opvolging.CONTACT);
  /* Een gesprek mét Donna ís een gesprek met Spanbeton. Contactmomenten
     worden óók op de contactpersoon vastgelegd (contactkaart), en die
     telden hier niet mee — dus zei het bord "nog nooit gesproken" over
     een klant waar gisteren nog een gespreksverslag bij lag. */
  const klantVan = new Map((CRM.state.contacten||[]).map(x => [String(x.id), x.klant]));
  const m = new Map();
  for(const a of (CRM.state.activiteiten || [])){
    if(!soort.has(a.soort)) continue;
    const naam = a.entiteit === 'klant' ? a.ref
               : a.entiteit === 'contact' ? klantVan.get(String(a.ref)) : '';
    if(!naam) continue;
    /* a.op en niets anders — exact zoals 'Blijft liggen' (contactVan) en de
       klantenlijst het doen. Zou hier ook extra.datum meetellen, dan noemt
       het bord een andere dag dan de lijst eronder over dezelfde klant. */
    const dag = lokaleDag(a.op);
    if(!dag) continue;
    const v = m.get(naam);
    if(!v || dag > v) m.set(naam, dag);
  }
  /* clients.laatst_contact is het veld dat een AM met de hand bijwerkt; het
     mag winnen als het jonger is dan wat er in de log staat. */
  for(const k of CRM.state.clients){
    const veld = lokaleDag(k.laatst_contact);
    if(veld && (!m.get(k.naam) || veld > m.get(k.naam))) m.set(k.naam, veld);
  }
  return m;
}

/* Naast contact ("echt gesproken") staat sinds 4 aug 2026 een tweede
   begrip: ACTIVITEIT — élke vastlegging bij de klant of een van zijn
   contactpersonen. Tjeerd: "activiteit moet gekoppeld zijn aan dingen die
   ik invoer op de klantenkaart of contactpersoonkaart, zoals een notitie
   of taak." Een kaart met een verse notitie is een traject waar iemand
   mee bezig is, ook als het laatste gesprek langer geleden was — dat
   verschil wil je op het bord zien én erop kunnen filteren. */
function activiteitIndex(){
  const klantVan = new Map((CRM.state.contacten||[]).map(x => [String(x.id), x.klant]));
  const m = new Map();                             // naam → {dag, wat}
  const zet = (naam, dag, wat) => {
    if(!naam || !dag) return;
    const v = m.get(naam);
    if(!v || dag > v.dag) m.set(naam, {dag, wat});
  };
  for(const a of (CRM.state.activiteiten || [])){
    const naam = a.entiteit === 'klant' ? a.ref
               : a.entiteit === 'contact' ? klantVan.get(String(a.ref)) : '';
    zet(naam, lokaleDag(a.op), ((CRM.ACT_SOORTEN||{})[a.soort]||{}).lbl || a.soort || 'activiteit');
  }
  /* Een taak aanmaken is óók bezig zijn met de klant. */
  for(const t of (CRM.state.taken || [])){
    const naam = t.entiteit === 'klant' ? t.ref
               : t.entiteit === 'contact' ? klantVan.get(String(t.ref)) : '';
    zet(naam, lokaleDag(t.created_at), 'taak');
  }
  /* En gesproken hébben is per definitie ook activiteit: zonder deze regel
     toonde het filter "30 dagen geen activiteit" bedrijven waar vorige
     week nog gebeld was — omdat dat contact alleen in het veld
     laatst_contact stond en niet in de activiteitenlog. */
  for(const k of (CRM.state.clients || []))
    zet(k.naam, lokaleDag(k.laatst_contact), 'contact');
  return m;
}

/* De onderste regel van een bordkaart: waarom staat dit stil?
   Tot 3 aug 2026 stonden er naam, eigenaar en het aantal dagen in de fase.
   Dat vertelt dát iets stilstaat, niet waarom — en dus moest een AM elke
   kaart openen om te weten of hij moest bellen of ergens op wachtte. De twee
   dingen die dat beantwoorden staan er nu bij: wanneer je deze klant voor
   het laatst sprak, en wat de afgesproken volgende stap is.
   De belangrijkste regel is de LEGE: staat er geen vervolgstap gepland, dan
   zeggen we dat met zoveel woorden. Een kaart zonder taak zag er tot nu toe
   precies zo uit als een kaart waar alles onder controle is. */
function waaromHTML(k, lc, act, vandaag){
  const actief = CRM.SALES_ACTIEF.includes(faseVan(k));
  const dgn = lc ? dagenTussen(lc, vandaag) : null;
  /* Op Lead zwijgen we over contact: 117 geïmporteerde bedrijven waar nooit
     iemand mee gesproken heeft, zouden allemaal rood kleuren en dan betekent
     rood op dit bord niets meer. Dezelfde uitzondering als bij 'Blijft
     liggen' en bij de teller bovenaan. */
  const meldContact = actief && faseVan(k) !== 'Lead';
  const stil = meldContact && (dgn == null || dgn >= STIL_CONTACT);
  const taak = volgendeTaak(k.naam);

  /* Twee regels, twee begrippen (Tjeerd, 4 aug 2026): CONTACT is echt
     gesproken — bel, mail, WhatsApp, bezoek. ACTIVITEIT is de laatste keer
     dat íemand iets heeft vastgelegd: notitie, taak, verslag. Een verse
     notitie betekent "hier wordt aan gewerkt", ook als het laatste gesprek
     ouder is. De activiteitregel staat alleen op de kaart als hij iets
     tóevoegt — anders zegt hij twee keer hetzelfde als contact. */
  const aDgn = act ? dagenTussen(act.dag, vandaag) : null;
  const activiteitRegel = (act && (lc == null || act.dag > lc))
    ? `<div class="s-w-r"><span class="s-w-l">activiteit</span>
        <span class="s-w-v trunc">${h(act.wat)} · ${aDgn === 0 ? 'vandaag'
          : `${aDgn} ${aDgn===1?'dag':'dagen'} geleden`}</span></div>`
    : '';

  const contactRegel = !meldContact ? ''
    : `<div class="s-w-r${stil?' let':''}">
        <span class="s-w-l">contact</span>
        <span class="s-w-v">${dgn == null ? 'nog nooit'
          : dgn === 0 ? 'vandaag' : `${dgn} ${dgn===1?'dag':'dagen'} geleden`}</span>
      </div>`;

  /* "Niets gepland" alleen zeggen als het ook echt een probleem ís. Op elke
     kaart zonder taak stond het eerst — en dan staat er op negen van de tien
     kaarten dezelfde zin, waarmee hij niets meer betekent. Een traject dat
     gisteren in beweging kwam heeft geen taak nodig; een traject dat drie
     weken stilligt zonder afspraak wél. Dus: alleen als de kaart al hangt of
     al te lang niet gesproken is. */
  const hangt = actief && faseVan(k) !== 'Lead'
             && (CRM.dagenGeleden(k.fase_sinds) || 0) > HANGT_NA;
  /* De klasse s-w-stap is het haakje voor agendaOpBord(): staat er in de
     Outlook-agenda een afspraak met deze klant, dan vervangt die deze
     regel — de taak is dan de terugval, niet andersom. */
  /* Datum voorop, net als bij de agenda-afspraak hieronder: achteraan
     verdween hij bij het afkappen van een lange taaktekst. */
  const stapRegel = taak
    ? `<div class="s-w-r s-w-stap"><span class="s-w-l">volgende stap</span>
        <span class="s-w-v trunc" title="${h(taak.tekst)}">${
          taak.datum ? `<span class="num">${h(CRM.fmtDateShort(taak.datum))}</span> ` : ''}${h(taak.tekst)}</span></div>`
    : ((stil || hangt) ? `<div class="s-w-r geen s-w-stap"><span class="s-w-l">volgende stap</span>
        <span class="s-w-v">niets gepland</span></div>` : '');

  return (activiteitRegel || contactRegel || stapRegel)
    ? `<div class="s-waarom">${activiteitRegel}${contactRegel}${stapRegel}</div>` : '';
}

function kaartHTML(k, lc, act, vandaag){
  const d = CRM.dagenGeleden(k.fase_sinds);
  const actief = CRM.SALES_ACTIEF.includes(faseVan(k));
  const hangt = actief && faseVan(k) !== 'Lead' && d!=null && d>HANGT_NA;
  const vac = openVacatures(k.naam);
  /* Kansen zijn als apart begrip afgeschaft (Tjeerd, 4 aug 2026: "alles
     wat ik in het systeem zet is een kans") — geen chip meer. */
  const kans = 0;
  const waarom = waaromHTML(k, lc, act, vandaag);
  /* De merkkop draagt naam + dagen; "X dgn stil" in rood is het enige alarm
     en het staat maar op de kaarten die het verdienen. Alles daaronder is
     het lijf — en een geïmporteerde lead zonder gesprek, taak of vacature
     hééft geen lijf. Dat is de hele oplossing voor 223 identieke kaarten. */
  const lijf = [
    (k.eigenaar || k.locatie) ? `<div class="bc-s trunc">${h(k.eigenaar||'geen eigenaar')}${k.locatie?' · '+h(k.locatie):''}</div>` : '',
    waarom,
    (vac || kans) ? `<div class="bc-f">
      ${vac?`<span class="chip">${vac} vacature${vac===1?'':'s'}</span>`:''}
      ${kans?`<span class="chip blue">${kans} kans${kans===1?'':'en'}</span>`:''}</div>` : ''
  ].filter(Boolean).join('');
  /* Op een kaart zónder lijf is de eigenaar het enige dat verloren zou gaan;
     die verhuist dan als gedempte toevoeging in de kop. */
  /* Leeg = er is écht niets voor het lijf — ook geen eigenaar of plaats.
     Leads houden zo hun eigenaar-regel ("ik moet alles kunnen zien vanuit
     de kaart"); alleen een kaart zonder enige inhoud is een kale kop. */
  const leeg = !waarom && !vac && !kans && !k.eigenaar && !k.locatie;
  /* Alle kaarten dezelfde opzet (besluit Tjeerd, 4 aug 2026, na drie kleur-
     rondes): leads dragen gewoon minder in het lijf, geen aparte microvorm. */
  const mini = false;
  /* Geen dagen op de kaart — "teveel ruis" (Tjeerd, 4 aug 2026, definitief
     na één dag heen en weer). Stilstand zie je via het stil-filter in de
     balk, de teller boven het bord en de lijstweergave. */
  const dgn = '';
  /* Ook een microlead toont zijn kern: eigenaar en plaats als tweede regel
     ín de kop. Minder dan de andere fases, niet niets. */
  return `<div class="bcard bck${leeg ? '' : ' vol'}" draggable="true" data-klant="${h(k.naam)}">
    <div class="bc-kop"><b>${h(k.naam)}</b>${dgn}</div>
    ${leeg ? '' : `<div class="bc-lijf">${lijf}</div>`}
  </div>`;
}

function bordHTML(klanten){
  const contact = contactIndex();
  const act = activiteitIndex();
  const vandaag = CRM.todayISO();
  return `<div class="board" id="s_board">${CRM.SALES_FASES.map(f => {
    const in_ = klanten.filter(k => faseVan(k)===f.k);
    return `<div class="bcol" data-fase="${h(f.k)}">
      <div class="bcol-h" style="--ph:${f.c}"><b>${h(f.k)}</b><span class="cnt num">${in_.length}</span></div>
      <div class="bcol-b" data-drop="${h(f.k)}">
        ${in_.length ? in_.map(k => {
            /* Sinds Tjeerds bord één keer een lege Lead-kolom toonde terwijl
               er 118 in zaten: een kaart die om wélke reden dan ook niet wil
               renderen, wordt een kale naamkaart in plaats van een exception
               die de hele kolom (of het bord) leegtrekt. */
            try{ return kaartHTML(k, contact.get(k.naam) || '', act.get(k.naam) || null, vandaag); }
            catch(e){ console.error('kaart', k && k.naam, e);
              return `<div class="bcard bck" data-klant="${h(k.naam)}"><div class="bc-kop"><b>${h(k.naam||'?')}</b></div></div>`; }
          }).join('')
                     : `<div class="s-kolomleeg">${h(f.hint||'Nog leeg')}</div>`}
      </div></div>`;
  }).join('')}</div>`;
}

/* ─── De agenda op het bord ──────────────────────────────────────
   Tjeerd (3 aug 2026): "Ik schiet een meeting met Arcelor Mittal in mijn
   agenda en het systeem ziet dat. Alleen dit moet ik ook meteen in mijn
   sales pijplijn zien." De klantkaart las de Outlook-agenda al; het bord
   zei op dezelfde klant "niets gepland". Nu leest het bord dezelfde bron
   (CRM.opvolging.agendaIndex — één Graph-aanroep voor het hele bord, met
   cache) en toont per kaart de eerstvolgende afspraak als volgende stap.
   De handmatige taak blijft de terugval, en zonder Outlook-koppeling of
   bij een Graph-fout verandert er niets aan het bord — geen foutmelding,
   het bord wist het gewoon al niet beter. */
async function agendaOpBord(){
  if(!(CRM.outlook?.verbonden?.())) return;
  let idx = null;
  try{ idx = await CRM.opvolging.agendaIndex(30); }catch(e){ idx = null; }
  /* Klaar met wachten? Alleen bijwerken als Sales nog op het scherm staat
     én het bord er nog hangt (de gebruiker kan intussen gewisseld zijn). */
  if(!idx || CRM.view !== 'sales' || !mountEl.querySelector('#s_board')) return;
  CRM.$$('.bcard', mountEl).forEach(kaart => {
    const e = (idx.get(kaart.dataset.klant) || [])[0];
    if(!e) return;
    const dt = new Date(e.start);
    const wanneer = isNaN(dt) ? '' : CRM.fmtDateShort(e.start) + ' · ' +
      dt.toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'});
    /* De datum stáát voorop. Achteraan viel hij weg zodra de titel werd
       afgekapt ("Afspraak Arcelor Mittal De…") — en juist het wanneer is
       wat je in één oogopslag wilt zien (Tjeerd, 3 aug 2026). */
    const regel = `<div class="s-w-r s-w-stap"><span class="s-w-l">volgende stap</span>
      <span class="s-w-v trunc" title="${h(e.titel||'Afspraak')}${wanneer ? ' — ' + h(wanneer) : ''}">${
        wanneer ? `<span class="num">${h(wanneer)}</span> ` : ''}${h(e.titel||'Afspraak')}</span></div>`;
    const stap = kaart.querySelector('.s-w-stap');
    const blok = kaart.querySelector('.s-waarom');
    if(stap) stap.outerHTML = regel;
    else if(blok) blok.insertAdjacentHTML('beforeend', regel);
    else kaart.insertAdjacentHTML('beforeend', `<div class="s-waarom">${regel}</div>`);
  });
}

function bindBord(root){
  CRM.$$('.bcard', root).forEach(c => {
    c.ondragstart = e => { sleepend = c.dataset.klant; c.classList.add('drag');
      e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', sleepend); };
    c.ondragend = () => { c.classList.remove('drag'); CRM.$$('.bcol', root).forEach(x=>x.classList.remove('over')); };
    /* Rechtstreeks naar de klantkaart. Er zat een tussenpaneel met een halve
       samenvatting en onderaan de knop "Volledige klantkaart openen →" — een
       extra klik voor iets wat je toch altijd wilde zien, en het toonde
       minder dan de kaart zelf. (Tjeerd, 3 aug 2026: "als ik op een kaart
       druk, meteen de klantkaart zien, niet eerst dit scherm.") */
    c.onclick = () => CRM.ga('klanten', {id: c.dataset.klant});
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
  {k:'laatst_contact', lbl:'Laatste contact'}
];
function lijstWaarde(k, veld){
  if(veld==='fase')   return CRM.SALES_FASES.findIndex(f=>f.k===faseVan(k));
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
      /* Dezelfde streep links als op de klantenlijst en de kandidatenlijst
         (.frand in base.css): fasekleur, amber zodra het traject stilvalt. */
      return `<tr${CRM.ui.frand(hangt ? 'var(--amber)' : CRM.salesKleur(faseVan(k)), 'clickable')} data-klant="${h(k.naam)}">
        <td><div style="font-weight:600">${h(k.naam)}</div>
          <div class="rowsub">${h(k.locatie||'')}</div></td>
        <td><span class="s-fase"><i style="background:${CRM.salesKleur(faseVan(k))}"></i>${h(faseVan(k))}</span>
          ${hangt?`<div class="rowsub" style="color:var(--amber)"><span class="num">${d}</span> dagen stil</div>`:''}</td>
        <td>${h(k.eigenaar||'—')}</td>
        <td>${h(k.branche||'—')}</td>
        <td class="num">${k.laatst_contact?h(CRM.fmtDate(k.laatst_contact)):'—'}
          ${k.laatst_contact?`<div class="rowsub">${h(CRM.geleden(k.laatst_contact))}</div>`:''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

/* ─── Opvolgingen ─────────────────────────────────────────────────
   De dagelijkse werklijst (Tjeerd, 4 aug 2026: "een apart tabblad met
   opvolgingen, die moet ik dagelijks bijhouden"): alle open taken die aan
   een klant of een contactpersoon hangen, gegroepeerd op urgentie.
   Verlopen bovenaan — dat is wat je vandaag als eerste inhaalt. */
function openOpvolgingen(){
  const klantVan = new Map((CRM.state.contacten||[]).map(x => [String(x.id), x.klant]));
  return (CRM.state.taken||[]).filter(t => !t.klaar).map(t => {
    const klant = t.entiteit === 'klant' ? t.ref
                : t.entiteit === 'contact' ? klantVan.get(String(t.ref)) : '';
    return klant ? Object.assign({}, t, {klantNaam: klant}) : null;
  }).filter(Boolean)
    .filter(t => !mijn || t.voor === CRM.me())
    .sort((a,b) => String(a.datum||'9999').localeCompare(String(b.datum||'9999')));
}
function opvolgHTML(){
  const alle = openOpvolgingen();
  if(!alle.length) return CRM.ui.leeg('Geen open opvolgingen',
    mijn ? 'Er staat niets open op jouw naam. Zet "Mijn klanten" uit om die van collega\'s te zien.'
         : 'Elke afspraak die je maakt — "volgende week terugbellen" — hoort hier als taak te staan.',
    '<button class="btn" data-nieuwtaak>+ Opvolgtaak</button>');
  const vandaag = CRM.todayISO();
  const week = (() => { const d = new Date(); d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); })();
  const groepen = [
    ['Verlopen',     alle.filter(t => t.datum && t.datum < vandaag), 'let'],
    ['Vandaag',      alle.filter(t => t.datum === vandaag), ''],
    ['Deze week',    alle.filter(t => t.datum && t.datum > vandaag && t.datum <= week), ''],
    ['Later',        alle.filter(t => t.datum && t.datum > week), ''],
    ['Zonder datum', alle.filter(t => !t.datum), '']
  ].filter(([,ts]) => ts.length);
  return `<div class="card"><div class="card-b" style="padding-top:6px">${groepen.map(([lbl, ts, extra]) => `
    <div class="label" style="margin:12px 0 6px${extra?';color:var(--red)':''}">${h(lbl)} · <span class="num">${ts.length}</span></div>
    ${ts.map(t => `<div class="s-ct">
      <label class="check" style="margin:0"><input type="checkbox" data-opvink="${h(t.id)}"></label>
      <div style="flex:1;min-width:0">
        <b class="trunc">${h(t.tekst)}</b>
        <div class="meta">${t.datum ? `<span class="num">${h(CRM.fmtDateShort(t.datum))}${t.tijd?' '+h(t.tijd):''}</span> · ` : ''}${h(t.voor||'')}</div>
      </div>
      <button class="btn sm ghost" data-opklant="${h(t.klantNaam)}">${h(t.klantNaam)}</button>
    </div>`).join('')}`).join('')}</div></div>`;
}
function bindOpvolg(){
  CRM.$$('[data-opvink]', mountEl).forEach(c => c.onchange = async () => {
    await taakKlaar(c.dataset.opvink, c.checked);
    tekenInhoud();
  });
  CRM.$$('[data-opklant]', mountEl).forEach(b => b.onclick = () => openKlant(b.dataset.opklant));
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
        ${CRM.ui.kpi('Pijplijnwaarde', `<span class="num">${CRM.euro(totaal)}</span>`, 'ongewogen — de volle waarde van alle open kansen')}
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
  /* Geen kansen-tab meer: kansen zijn als apart begrip afgeschaft
     (Tjeerd, 4 aug 2026). */
  const telling = {
    activiteiten: acts.length,
    taken: taken.filter(t=>!t.klaar).length,
    documenten: docsVan(naam).length
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
           ['taken','Taken',telling.taken],['documenten','Documenten',telling.documenten]]
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
            ${heeftBestand(d) ? `<button class="btn sm ghost" data-docopen="${h(d.id)}">Openen</button>
              <button class="btn sm ghost" data-docdl="${h(d.id)}">Bewaren</button>` : '<span class="meta">geen bestand</span>'}</div>`).join('');
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

  /* Openen/bewaren gaat via een klik, niet via een href: pas op dat moment
     wordt er een tijdelijke ondertekende link gemaakt. In de HTML staat
     alleen het id van de regel, dus geen enkele link in het scherm. */
  const docVan = id => docsVan(naam).find(d => String(d.id) === String(id));
  const openDoc = async (b, alsDownload) => {
    const d = docVan(b.dataset.docopen || b.dataset.docdl);
    if(!d) return CRM.toast('Dit document staat niet meer in de lijst — ververs de pagina.','err');
    const tekst = b.textContent;
    b.disabled = true; b.textContent = 'Even…';
    await CRM.opslag.open(d.url, alsDownload ? {download: d.naam || 'document'} : {});
    b.disabled = false; b.textContent = tekst;
  };
  CRM.$$('[data-docopen]', body).forEach(b => b.onclick = () => openDoc(b, false));
  CRM.$$('[data-docdl]',   body).forEach(b => b.onclick = () => openDoc(b, true));

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
  const up = await CRM.sb.storage.from(CRM.opslag.map).upload(pad, bestand, {upsert:false});
  if(up.error) return CRM.toast(CRM.opslag.foutTekst(up.error), 'err');
  /* Het PAD bewaren, geen url. De map is niet publiek (er komen CV's, ID's
     en contracten in), dus een publieke url bestaat niet meer; en een
     ondertekende url in de database veroudert en lekt. De link wordt pas
     bij het openen gemaakt — zie CRM.opslag in js/core.js. */
  rij.url = pad;
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
/* Welke rijen hun belteksten open hebben staan. In het geheugen, niet in
   de opslag: bij een verse sessie begin je met een rustige tabel. */
const rOpen = new Set();
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
    ['Kartonnage Van Deursen','Delft','machinebediende',1,'adzuna','€2.800–3.200','genegeerd','Te klein, één vestiging'],
    /* Zelf toegevoegd (tab "Zelf gevonden"): via de extensie op een website,
       op LinkedIn, en met plakken. Eén ervan staat óók in de demo-pijplijn,
       zodat de dubbel-melding zichtbaar is. */
    ['Diepvries Depot Rijnmond','Schiedam','orderpicker, heftruckchauffeur',3,'website','€2.600–3.000','nieuw','Van website diepvriesdepot.nl · 3 passende vacatures op deze pagina'],
    ['Grondstoffen Verwerking Maasvlakte','Rotterdam','procesoperator',2,'website','','nieuw','Van website · Contactpersoon: R. de Wit (Manager Productie)'],
    ['Van Vliet Zoetwaren B.V.','Katwijk','productiemedewerker',1,'linkedin','','nieuw','Contactpersoon: HR-manager · LinkedIn'],
    ['Transportbedrijf Van Kooten','Alblasserdam','chauffeur, verlader',2,'handmatig','','nieuw','Branche: Transport']
  ].map(([bedrijf,plaats,functies,vacatures,bron,sal,status,notitie],i)=>({
    id:'lrdemo'+i, bedrijf, plaats, functies, vacatures, bron,
    url:'https://www.adzuna.nl/land/ad/demo'+i, salaris_ind:sal,
    gevonden_op:d(-(i%9)), laatst_gezien:d(-(i%3)),
    status, status_door: status==='nieuw'?'':'Tjeerd', notitie,
    /* De ochtendroutine levert bij haar eigen vondsten belteksten mee;
       in demo tonen we dat bij de claude-research-rijen. */
    concepten: bron==='claude-research' ? demoConcepten(bedrijf, plaats, functies) : null
  }));
}

function demoConcepten(bedrijf, plaats, functies){
  const f = String(functies||'personeel').split(',')[0].trim();
  return {
    contactprofiel:`Zoek op LinkedIn bij ${bedrijf} op 'HR-adviseur', 'Corporate Recruiter' of aan de `
      + `lijnkant 'Productiemanager' en 'Teamleider Productie'. Niet de directie.`,
    opener:`Hoi, Tjeerd van Ploeggenoten. Ik zag dat jullie in ${plaats} een ${f} zoeken. `
      + `Lukt het invullen daarvan een beetje?`,
    connectie:`Hoi, ik zag jullie vacature voor ${f} in ${plaats}. Vanuit Ploeggenoten werk ik `
      + `dagelijks met mensen voor productie en logistiek in die regio. Leek me nuttig om te connecten.`,
    mail:`Hoi,\n\nIk zag dat jullie in ${plaats} een ${f} zoeken. Die functie is op dit moment `
      + `lastig te vullen, zeker als je iemand wilt die blijft.\n\nIk ben Tjeerd van Ploeggenoten. Wij `
      + `bemiddelen mensen voor productie, logistiek en industrie in deze regio. Liever twee kandidaten `
      + `die passen dan tien die je zelf moet filteren.\n\nZal ik eens kijken wie ik nu beschikbaar heb, `
      + `of hebben jullie het al rond?\n\nGroet,\nTjeerd\nPloeggenoten`
  };
}

/* Twee soorten vondsten in één tabel, maar niet in één tab (Tjeerd, 4 aug 2026:
   "anders moet ik ze helemaal zoeken"). Wat jíj zelf toevoegt — via de
   extensie op LinkedIn of een website, of met plakken — hoort bij elkaar;
   de Leadradar houdt alleen wat de motor 's ochtends zelf vindt. */
const ZELF_BRONNEN = ['website','linkedin','handmatig'];
const isZelf = r => ZELF_BRONNEN.includes(r.bron||'');

const radarNieuwN  = () => radar.filter(r=>!isZelf(r) && (r.status||'nieuw')==='nieuw').length;
const vondstNieuwN = () => radar.filter(r=> isZelf(r) && (r.status||'nieuw')==='nieuw').length;

/* Staat dit bedrijf al in de klantpijplijn? Dan wil je dat zien vóór je
   het nog een keer als lead opvoert. */
const alKlant = bedrijf => CRM.state.clients.find(c=>CRM.zelfdeKlant(c.naam, bedrijf));

function radarRijen(zelf){
  const q = rZoek.trim().toLowerCase();
  const rang = {nieuw:0, toegevoegd:1, genegeerd:2};
  return radar.filter(r=>{
    if(isZelf(r) !== !!zelf) return false;
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

const BRON_LBL = {adzuna:'Adzuna', 'claude-research':'Claude-research', handmatig:'Handmatig',
                  osm:'OpenStreetMap', website:'Website', linkedin:'LinkedIn'};
const bronChip = b => {
  const kleur = b==='claude-research' ? ' purple' : ZELF_BRONNEN.includes(b) ? ' blue' : '';
  return `<span class="chip${kleur}">${h(BRON_LBL[b]||b||'—')}</span>`;
};

function radarHTML(zelf){
  const delen = [];
  if(radarStatus===''){
    laadRadar().then(()=>{ if(tab==='radar'||tab==='vondsten') tekenInhoud(); });
    return CRM.ui.laden(zelf ? 'Vondsten laden…' : 'Radar laden…');
  }
  if(CRM.demo) delen.push(`<div class="note info" style="margin-bottom:14px">Demo-data — deze bedrijven zijn verzonnen; er wordt niets opgeslagen.</div>`);
  if(radarStatus==='mist')
    delen.push(`<div class="note warn" style="margin-bottom:14px"><b>De radartabel bestaat nog niet.</b>
      Draai eerst supabase/schema.sql in de SQL-editor en volg daarna SETUP-LEADRADAR.md om de
      dagelijkse zoekmotor aan te zetten.</div>`);

  delen.push(`<div class="sub" style="margin-bottom:14px;max-width:680px">${zelf
    ? `Bedrijven die jíj zelf hebt toegevoegd — met de CRM-knop op LinkedIn of op een
       bedrijfswebsite, of door een lijst te plakken. Ze blijven hier staan tot je ze
       beoordeelt, zodat ze niet ondersneeuwen tussen de automatische vondsten.`
    : `De radar zoekt elke ochtend naar bedrijven in productie, logistiek en industrie die nú
       zelf personeel werven. Beoordeel ze hier: één klik en het bedrijf staat als lead in je
       pijplijn.`}</div>`);

  const eigen = radar.filter(r=>isZelf(r) === !!zelf);
  const week = eigen.filter(r=>{ const dg = CRM.dagenGeleden(r.gevonden_op); return dg!=null && dg>=0 && dg<=7; }).length;
  const toegevoegd = eigen.filter(r=>r.status==='toegevoegd').length;
  /* Op de eigen tab is "staat al in de pijplijn" het nuttigste getal: dat is
     precies het dubbele werk dat je wilt zien vóór je gaat bellen. */
  const dubbel = zelf ? eigen.filter(r=>(r.status||'nieuw')==='nieuw' && alKlant(r.bedrijf)).length : 0;
  delen.push(`<div class="grid c3 s-kpi">
    ${CRM.ui.kpi('Nieuw te beoordelen', `<span class="num">${zelf?vondstNieuwN():radarNieuwN()}</span>`, 'wachten op jouw oordeel', 'accent')}
    ${zelf
      ? CRM.ui.kpi('Al in de pijplijn', `<span class="num">${dubbel}</span>`, dubbel?'dubbel — hier al klant':'geen dubbelen gevonden')
      : CRM.ui.kpi('Deze week gevonden', `<span class="num">${week}</span>`, 'bedrijven die nu werven')}
    ${CRM.ui.kpi('Toegevoegd als lead', `<span class="num">${toegevoegd}</span>`, zelf?'totaal vanuit je eigen vondsten':'totaal via de radar')}
  </div>`);

  const telStatus = s => eigen.filter(r=>(r.status||'nieuw')===s).length;
  /* <button>, geen <span>: dit is een filter dat je aan- en uitzet, dus je
     moet er met Tab bij kunnen en aria-pressed moet de stand vertellen. */
  const chips = [['nieuw','Nieuw'],['toegevoegd','Toegevoegd'],['genegeerd','Genegeerd'],['alles','Alles']]
    .map(([k,l])=>`<button type="button" class="chip btn-like${rFilter===k?' on':''}" data-rstatus="${k}"
      aria-pressed="${rFilter===k}">${l}${
      k==='alles'?'':` <span class="num">${telStatus(k)}</span>`}</button>`).join('');
  const bronnen = [...new Set(eigen.map(r=>r.bron).filter(Boolean))].sort();
  delen.push(`<div class="row r-bar">
    ${chips}
    <div class="spacer"></div>
    ${bronnen.length>1?`<select id="r_bron" style="width:auto;min-width:130px">
      <option value="">Alle bronnen</option>
      ${bronnen.map(b=>`<option value="${h(b)}"${rBron===b?' selected':''}>${h(BRON_LBL[b]||b)}</option>`).join('')}
    </select>`:''}
    <div class="searchbox"><input type="search" id="r_zoek" placeholder="Zoek bedrijf, plaats of functie" value="${h(rZoek)}"></div>
  </div>`);

  delen.push(radarTabelHTML(radarRijen(zelf), zelf, eigen.length));

  delen.push(zelf
    ? `<div class="note info" style="margin-top:18px"><b>Hoe komt hier iets bij?</b> Klik op LinkedIn
       rechtsonder op "Naar CRM", of gebruik op een bedrijfssite het extensie-icoon → "Lees deze
       pagina uit". De extensie waarschuwt daar al als een bedrijf hier of in je pijplijn staat;
       glipt er toch een dubbele doorheen, dan zie je dat in de kolom Bedrijf.</div>`
    : `<div class="note info" style="margin-top:18px">
       <b>Waarom geen live LinkedIn- of Indeed-zoekactie?</b> Beide hebben geen open API en verbieden
       geautomatiseerd uitlezen. De radar gebruikt daarom Adzuna (open vacature-API die veel van
       hetzelfde aanbod indexeert) en optioneel een wekelijkse Claude-research-routine — zie
       SETUP-LEADRADAR.md. Een export uit LinkedIn Sales Navigator lees je in via "Handmatig
       toevoegen"; die komt in de tab Zelf gevonden.</div>`);
  return delen.join('');
}

/* De ochtendroutine schrijft per bedrijf vier kant-en-klare teksten weg in
   het veld `concepten`. Die stonden tot nu toe alleen in de database — je
   kon er in het CRM niet bij. Hier klap je ze open naast het bedrijf:
   lezen, kopiëren, bellen. */
const heeftConcepten = r => {
  const c = r && r.concepten;
  return !!(c && (c.opener || c.connectie || c.mail || c.contactprofiel));
};

/* Kopiëren met een terugval — zelfde aanpak als in intake.js: draait de app
   zonder https (dev-server), dan bestaat de clipboard-api niet en doen we
   het via een verborgen tekstvak. */
async function kopieerTekst(tekst){
  try{
    if(navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(tekst); return true; }
    throw new Error('geen clipboard-api');
  }catch(e){
    const ta = document.createElement('textarea');
    ta.value = tekst; ta.setAttribute('readonly','');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let gelukt = false;
    try{ gelukt = document.execCommand('copy'); }catch(e2){}
    ta.remove();
    return gelukt;
  }
}

/* Alles in één blok, voor wie liever in zijn eigen notitieblok plakt. */
function conceptTekst(r){
  const c = r.concepten || {};
  return [
    `${r.bedrijf}${r.plaats?` — ${r.plaats}`:''}`,
    c.contactprofiel ? 'WIE JE ZOEKT\n' + c.contactprofiel : '',
    c.opener         ? 'OPENINGSZIN\n' + c.opener : '',
    c.connectie      ? 'LINKEDIN-CONNECTIEVERZOEK\n' + c.connectie : '',
    c.mail           ? 'EERSTE MAIL\n' + c.mail : ''
  ].filter(Boolean).join('\n\n');
}

function conceptHTML(r){
  const c = r.concepten || {};
  const blok = (veld, label, extra) => {
    const tekst = String(c[veld]||'').trim();
    if(!tekst) return '';
    return `<div class="r-blok">
      <div class="r-kop"><span class="r-lbl">${label}</span>${extra||''}
        <button class="btn sm ghost" data-rkop="${h(r.id)}|${veld}">Kopieer</button></div>
      <p>${h(tekst)}</p></div>`;
  };
  const prof = String(c.contactprofiel||'').trim();
  /* De 280 is LinkedIns limiet voor een connectieverzoek met notitie —
     eroverheen en je verzoek gaat er zónder tekst uit. */
  const n = String(c.connectie||'').trim().length;
  const teller = n ? `<span class="r-tel${n>280?' rood':''}">${n}/280</span>` : '';
  return `<div class="r-con">
    ${prof?`<div class="r-blok"><div class="r-kop"><span class="r-lbl">Wie je zoekt</span></div>
      <p>${h(prof)}</p></div>`:''}
    ${blok('opener','Openingszin aan de telefoon')}
    ${blok('connectie','LinkedIn-connectieverzoek', teller)}
    ${blok('mail','Eerste mail')}
    <div class="r-alles"><button class="btn sm ghost" data-rkop="${h(r.id)}|alles">Alles kopiëren</button></div>
  </div>`;
}

function radarTabelHTML(rijen, zelf, totaal){
  if(!totaal && radarStatus==='ok')
    return `<div class="card"><div class="card-b">${zelf
      ? CRM.ui.leeg('Je hebt zelf nog niets toegevoegd',
          'Gebruik op LinkedIn de knop "Naar CRM", of op een bedrijfssite het extensie-icoon → "Lees deze pagina uit". Een lijst plakken kan met "Handmatig toevoegen".')
      : CRM.ui.leeg('De radar heeft nog niets gevonden',
          'Draai de eerste zoekactie met "Nu zoeken", of wacht op de ochtendrun.')}</div></div>`;
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
      /* Dubbel in beeld brengen op de plek waar je kijkt: naast de naam.
         Niet blokkeren — soms wíl je een tweede ingang bij dezelfde klant. */
      const bestaand = st==='nieuw' ? alKlant(r.bedrijf) : null;
      const conc = heeftConcepten(r), open = rOpen.has(r.id);
      return `<tr${st!=='nieuw'?' class="s-dicht"':''}>
        <td><div style="font-weight:600">${h(r.bedrijf)}${url?` <a href="${h(url)}" target="_blank" rel="noopener" title="Vacature bekijken" class="r-link">↗</a>`:''}</div>
          ${bestaand?`<div class="rowsub"><span class="chip amber">staat al in de pijplijn${
            bestaand.fase?` — ${h(bestaand.fase)}`:''}</span> <button class="btn sm ghost" data-rpijp="${h(bestaand.naam)}">open klant →</button></div>`:''}
          ${r.notitie?`<div class="rowsub">${h(r.notitie)}</div>`:''}
          ${conc?`<div class="rowsub"><button class="btn sm ghost" data-rcon="${h(r.id)}"
            aria-expanded="${open}">${open?'▾':'▸'} Belteksten</button></div>`:''}</td>
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
        }</td></tr>${conc && open
          ? `<tr class="r-conrij"><td class="r-cel" colspan="8">${conceptHTML(r)}</td></tr>` : ''}`;
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
  CRM.toast(`${r.bedrijf} staat nu als lead in je klantpijplijn — "pijplijn →" opent de kaart`, 'ok');
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
        <span class="hint">Werkt met een kolomkop-regel uit Sales Navigator en met een simpele lijst namen. De bedrijven komen als "nieuw" in de tab <b>Zelf gevonden</b>. Namen die al in het CRM staan worden overgeslagen.</span></div>
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
        /* Wat je zelf inleest hoort bij je eigen vondsten — daar ook naartoe,
           anders zoek je ze alsnog tussen de radar-rijen. */
        tab = 'vondsten'; V.zet('tab', tab); tekenActies();
        CRM.toast(`${nieuw.length} bedrijven bij Zelf gevonden gezet${over.length?` — ${over.length} overgeslagen (al bekend)`:''}`,'ok');
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

/* ═══════════════════════════════════════════════════════════════
   ACTIVITEIT — stuurcijfers over wat er gedáán is
   ───────────────────────────────────────────────────────────────
   Het bord en de kansen vertellen wat er ligt en wat het waard is.
   Dat zijn uitkomsten: over drie maanden weet je of je genoeg deed.
   Dit tabblad telt het wérk — gesprekken, afspraken, voorstellen,
   opgehaalde vacatures, nieuwe bedrijven — met een datum en een naam
   erbij, zodat je maandagochtend ziet of het tempo klopt.

   Alles komt uit vastgelegd gedrag: crm_activiteiten en aanmaak-
   datums. Wat niet is vastgelegd, tellen we niet en verzinnen we
   niet: dan staat er een streepje mét de reden. Zie ook de
   VERZOEK AAN COORDINATOR onderaan dit bestand.
   ═══════════════════════════════════════════════════════════════ */

let pKeuze   = V.get('periode','week');
let maatKeuze= V.get('maat','contact');

const PERIODEN = [
  {k:'week',     lbl:'Deze week',    eenh:'week'},
  {k:'maand',    lbl:'Deze maand',   eenh:'maand'},
  {k:'kwartaal', lbl:'Dit kwartaal', eenh:'kwartaal'}
];
/* De maten die je in de weekgrafiek kunt uitzetten. Zelfde sleutels als
   de tellers hieronder, zodat er nergens een tweede definitie ontstaat. */
const MATEN = [
  {k:'contact',  lbl:'Contact',     eenh:'contactmomenten'},
  {k:'afspraak', lbl:'Afspraken',   eenh:'ingeplande afspraken'},
  {k:'voorstel', lbl:'Voorstellen', eenh:'verstuurde voorstellen'},
  {k:'nieuw',    lbl:'Bedrijven',   eenh:'nieuwe bedrijven'},
  {k:'vac',      lbl:'Vacatures',   eenh:'opgehaalde vacatures'}
];
if(!PERIODEN.some(p=>p.k===pKeuze))  pKeuze   = 'week';
if(!MATEN.some(m=>m.k===maatKeuze))  maatKeuze = 'contact';

const GRAF_WEKEN    = 12;   // lengte van de weekgrafiek
const STIL_VOORSTEL = 14;   // dagen dat een voorstel mag liggen
const STIL_CONTACT  = 21;   // dagen zonder contact bij een lopend traject
const LOG_LIMIET    = 2000; // CRM.load() haalt maximaal dit aantal activiteiten op

/* ─── Datumrekenwerk ───────────────────────────────────────────── */
/* Een activiteit heeft een tijdstempel in UTC (toISOString), een
   aanmaakdatum is al een lokale datum. Zonder omrekenen valt alles wat
   in de zomer na 22:00 wordt vastgelegd op de dag ervóór, en klopt
   "deze week" op maandagochtend niet. */
function lokaleDag(waarde){
  const s = String(waarde==null?'':waarde).trim();
  if(!s) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('sv-SE');
}
function schuifDag(iso, n){
  const d = new Date(iso+'T12:00:00');          // middag: geen zomertijdsprong
  if(isNaN(d)) return iso;
  d.setDate(d.getDate()+n);
  return d.toLocaleDateString('sv-SE');
}
function dagenTussen(van, tot){
  const a = new Date(van+'T12:00:00'), b = new Date(tot+'T12:00:00');
  if(isNaN(a) || isNaN(b)) return 0;
  return Math.round((b-a)/86400000);
}
function maandagVan(iso){
  const d = new Date(iso+'T12:00:00');
  if(isNaN(d)) return '';
  d.setDate(d.getDate() - ((d.getDay()+6)%7));  // zondag (0) telt als dag 6
  return d.toLocaleDateString('sv-SE');
}
const binnen = (dag, van, tot) => !!dag && dag>=van && dag<=tot;

/* De lopende periode loopt tot vandaag en is dus nog niet vol. Vergelijken
   met een héle vorige week zegt op maandagochtend niets — je zou altijd
   achterlopen. De vergelijkperiode loopt daarom even veel dagen als er nu
   verstreken zijn: maandag vergelijk je met maandag. */
function periode(){
  const tot = CRM.todayISO();
  const nu  = new Date(tot+'T12:00:00');
  let van, vvan;
  if(pKeuze==='week'){
    van  = schuifDag(tot, -((nu.getDay()+6)%7));
    vvan = schuifDag(van, -7);
  }else if(pKeuze==='maand'){
    van  = new Date(nu.getFullYear(), nu.getMonth(),   1).toLocaleDateString('sv-SE');
    vvan = new Date(nu.getFullYear(), nu.getMonth()-1, 1).toLocaleDateString('sv-SE');
  }else{
    const q = Math.floor(nu.getMonth()/3)*3;
    van  = new Date(nu.getFullYear(), q,   1).toLocaleDateString('sv-SE');
    vvan = new Date(nu.getFullYear(), q-3, 1).toLocaleDateString('sv-SE');
  }
  const verstreken = dagenTussen(van, tot);
  return {van, tot, vvan, vtot: schuifDag(vvan, verstreken), dagen: verstreken+1,
          eenh: (PERIODEN.find(p=>p.k===pKeuze)||PERIODEN[0]).eenh};
}

/* Een fasewissel wordt als tekst vastgelegd: "Fase gewijzigd: A → B".
   Zowel dit bestand als js/klanten.js schrijven precies die vorm, dus de
   doelfase staat achter de laatste pijl. We accepteren alleen een naam die
   écht een salesfase is — zo kan er nooit iets anders in de telling
   sluipen als de tekst ooit verandert. Geen match = niet meegeteld. */
const FASE_NAAR = /→\s*([^→]+)$/;
function faseUitTekst(tekst){
  const m = FASE_NAAR.exec(String(tekst||''));
  if(!m) return '';
  const f = m[1].trim();
  return CRM.SALES_FASES.some(x => x.k === f) ? f : '';
}

/* ─── Tellen ───────────────────────────────────────────────────── */
/* Alles in één doorloop over de activiteiten, de klanten en de vacatures.
   Per klant apart filteren zou 250 × 3.000 vergelijkingen kosten en dat
   merk je bij het typen in het zoekveld. */
function stuurcijfers(){
  const p = periode();
  const klanten   = gefilterd();
  const zichtbaar = new Set(klanten.map(k => k.naam));
  const contactSoort = new Set(CRM.opvolging.CONTACT);   // dezelfde lijst als het dashboard

  const leeg = () => ({contact:0, afspraak:0, voorstel:0, getekend:0, nieuw:0, vac:0});
  const nu = leeg(), eerder = leeg();
  const persoon = new Map();          // wie deed het, alleen deze periode
  const weken   = new Map();          // maandag-ISO → tellers
  const beweging= new Map();          // fase → aantal binnengekomen deze periode
  const laatsteContact = new Map();   // klantnaam → laatste dag met écht contact

  const vanaf12 = schuifDag(maandagVan(p.tot), -(GRAF_WEKEN-1)*7);
  const bak = (m, sleutel) => { let b = m.get(sleutel); if(!b){ b = leeg(); m.set(sleutel, b); } return b; };

  const tel = (veld, dag, wie) => {
    if(binnen(dag, p.van, p.tot)){ nu[veld]++; bak(persoon, wie || 'onbekend')[veld]++; }
    else if(binnen(dag, p.vvan, p.vtot)) eerder[veld]++;
    if(binnen(dag, vanaf12, p.tot)) bak(weken, maandagVan(dag))[veld]++;
  };

  let oudsteLog = '', faseRegels = 0, afspraakRegels = 0;
  for(const a of (CRM.state.activiteiten || [])){
    if(a.entiteit !== 'klant') continue;
    const dag = lokaleDag(a.op);
    if(!dag) continue;
    if(!oudsteLog || dag < oudsteLog) oudsteLog = dag;

    const naam = String(a.ref || '');
    const isContact  = contactSoort.has(a.soort);
    const isAfspraak = !!(a.extra && a.extra.afspraak);
    if(a.soort === 'fase')  faseRegels++;
    if(isAfspraak)          afspraakRegels++;
    /* Laatste contact voor élke klant bijhouden, ook buiten het filter:
       "blijft liggen" kijkt verder terug dan de gekozen periode. */
    if(isContact){ const v = laatsteContact.get(naam); if(!v || dag > v) laatsteContact.set(naam, dag); }

    if(!zichtbaar.has(naam)) continue;
    if(isContact)  tel('contact',  dag, a.door);
    if(isAfspraak) tel('afspraak', dag, a.door);
    if(a.soort === 'fase'){
      const naar = faseUitTekst(a.tekst);
      if(naar === 'Voorstel gedaan' || naar === 'SWO gestuurd') tel('voorstel', dag, a.door);
      if(naar === 'Afgerond') tel('getekend', dag, a.door);
      if(naar && binnen(dag, p.van, p.tot)) beweging.set(naar, (beweging.get(naar)||0) + 1);
    }
  }

  /* Nieuwe bedrijven: clients.aangemaakt. Rijen uit de oude import hebben
     dat veld niet — die tellen nergens mee en worden apart gemeld. */
  let zonderAanmaak = 0;
  for(const k of klanten){
    const dag = lokaleDag(k.aangemaakt);
    if(!dag){ zonderAanmaak++; continue; }
    tel('nieuw', dag, k.eigenaar);
  }

  /* Opgehaalde vacatures: vacatures.aangemaakt. Zelfde verhaal. */
  let vacs = 0, vacZonder = 0;
  for(const v of (CRM.state.vacs || [])){
    if(!zichtbaar.has(v.klant)) continue;
    vacs++;
    const dag = lokaleDag(v.aangemaakt);
    if(!dag){ vacZonder++; continue; }
    tel('vac', dag, v.eigenaar);
  }

  return {p, nu, eerder, persoon, weken, beweging, laatsteContact, klanten,
          zonderAanmaak, metAanmaak: klanten.length - zonderAanmaak,
          vacs, vacZonder, oudsteLog, faseRegels, afspraakRegels};
}

/* ─── Tegels ───────────────────────────────────────────────────── */
function vergelijk(nu, eerder, p){
  const zelfde = p.dagen === 1 ? 'de dag ervoor' : `dezelfde ${p.dagen} dagen ervoor`;
  if(!nu && !eerder) return `niets, en ${zelfde} ook niet`;
  return `${CRM.plusMin(nu - eerder)} t.o.v. <span class="num">${eerder}</span> ${zelfde}`;
}

/* Een tegel die niets kan tonen krijgt een streepje mét de reden. Een
   nul die "niet gemeten" betekent leest als een slechte week, en daar ga
   je dan op sturen — dat is erger dan geen cijfer. */
function tegel(label, waarde, detail, klasse){
  return CRM.ui.kpi(label, waarde, detail, klasse||'');
}
function metingTegels(M){
  const p = M.p;
  const t = [];

  t.push(tegel('Contactmomenten', `<span class="num">${M.nu.contact}</span>`,
    vergelijk(M.nu.contact, M.eerder.contact, p), 'accent'));

  t.push(tegel('Afspraken ingepland', `<span class="num">${M.nu.afspraak}</span>`,
    M.afspraakRegels ? vergelijk(M.nu.afspraak, M.eerder.afspraak, p)
                     : 'telt mee zodra je "Inplannen" gebruikt'));

  t.push(tegel('Voorstellen verstuurd', `<span class="num">${M.nu.voorstel}</span>`,
    M.faseRegels ? vergelijk(M.nu.voorstel, M.eerder.voorstel, p)
                 : 'nog geen fasewissel vastgelegd'));

  t.push(M.metAanmaak
    ? tegel('Nieuwe bedrijven', `<span class="num">${M.nu.nieuw}</span>`,
        vergelijk(M.nu.nieuw, M.eerder.nieuw, p))
    : tegel('Nieuwe bedrijven', '<span class="meta">—</span>',
        'geen enkel bedrijf heeft een aanmaakdatum'));

  t.push(M.vacs > M.vacZonder
    ? tegel('Vacatures opgehaald', `<span class="num">${M.nu.vac}</span>`,
        vergelijk(M.nu.vac, M.eerder.vac, p))
    : tegel('Vacatures opgehaald', '<span class="meta">—</span>',
        M.vacs ? `${M.vacs} vacatures, geen met aanmaakdatum` : 'nog geen vacatures in beeld'));

  t.push(tegel('Nieuwe klanten', `<span class="num">${M.nu.getekend}</span>`,
    M.faseRegels ? vergelijk(M.nu.getekend, M.eerder.getekend, p)
                 : 'nog geen fasewissel vastgelegd'));

  return `<div class="grid c3 s-kpi s-kpi6">${t.join('')}</div>`;
}

/* ─── Weekgrafiek ──────────────────────────────────────────────── */
/* Staafjes van HTML: geen bibliotheek, en boven elke staaf staat het
   getal — een balk zonder getal is een plaatje. */
function weekGrafiek(M){
  const maat = MATEN.find(m => m.k === maatKeuze) || MATEN[0];
  const nuWeek = maandagVan(M.p.tot);
  const kolommen = [];
  for(let i = GRAF_WEKEN-1; i >= 0; i--){
    const ma = schuifDag(nuWeek, -i*7);
    kolommen.push({ma, n: (M.weken.get(ma) || {})[maat.k] || 0});
  }
  const max = Math.max(...kolommen.map(k => k.n), 1);
  const totaal = kolommen.reduce((s,k) => s+k.n, 0);

  const knoppen = MATEN.map(m =>
    `<button data-maat="${h(m.k)}" class="${maatKeuze===m.k?'on':''}">${h(m.lbl)}</button>`).join('');

  const strook = kolommen.map(k => {
    const loopt = k.ma === nuWeek;
    const hoog  = k.n ? Math.max(3, Math.round(k.n / max * 100)) : 0;
    return `<div class="s-gkol${loopt?' loopt':''}"
        title="Week van ${h(CRM.fmtDate(k.ma))} — ${k.n} ${h(maat.eenh)}${loopt?' (loopt nog)':''}">
      <div class="s-gtop num${k.n?'':' nul'}">${k.n}</div>
      <div class="s-gbar"><i style="height:${hoog}%"></i></div>
      <div class="s-glbl"><b class="num">${h(String(Number(k.ma.slice(8,10))))}</b><span>${
        h(new Date(k.ma+'T12:00:00').toLocaleDateString('nl-NL',{month:'short'}))}</span></div>
    </div>`;
  }).join('');

  return `<div class="card s-kaart">
    <div class="card-h"><div class="h2">Per week</div>
      <div class="s-maatwrap"><div class="seg s-maat">${knoppen}</div></div></div>
    <div class="card-b">
      <div class="s-strook"><div class="s-kolommen">${strook}</div></div>
      <div class="meta" style="margin-top:12px">Staafhoogte en getal = ${h(maat.eenh)} in die week ·
        het getal onder de staaf is de maandag · <span class="num">${totaal}</span> in ${GRAF_WEKEN} weken ·
        de laatste week loopt nog en is dus lager dan hij wordt.</div>
    </div></div>`;
}

/* ─── Wie doet wat ─────────────────────────────────────────────── */
function persoonTabel(M){
  const rijen = [...M.persoon.entries()]
    .map(([naam, t]) => ({naam, t}))
    .filter(r => r.t.contact || r.t.afspraak || r.t.voorstel || r.t.nieuw || r.t.vac || r.t.getekend)
    .sort((a,b) => b.t.contact - a.t.contact || String(a.naam).localeCompare(String(b.naam),'nl'));

  const inhoud = rijen.length ? `<div class="tblwrap"><table class="tbl">
      <thead><tr><th>Wie</th><th class="n">Contact</th><th class="s-balkkop"></th>
        <th class="n">Afspraken</th><th class="n">Voorstellen</th>
        <th class="n">Bedrijven</th><th class="n">Vacatures</th></tr></thead>
      <tbody>${(() => {
        const max = Math.max(...rijen.map(r => r.t.contact), 1);
        return rijen.map(r => `<tr>
          <td style="font-weight:600">${h(r.naam)}</td>
          <td class="n num">${r.t.contact}</td>
          <td class="s-balk">${CRM.ui.bar(r.t.contact / max * 100)}</td>
          <td class="n num">${r.t.afspraak || '<span class="meta">—</span>'}</td>
          <td class="n num">${r.t.voorstel || '<span class="meta">—</span>'}</td>
          <td class="n num">${r.t.nieuw    || '<span class="meta">—</span>'}</td>
          <td class="n num">${r.t.vac      || '<span class="meta">—</span>'}</td>
        </tr>`).join('');
      })()}</tbody></table></div>`
    : CRM.ui.leeg(`Nog niets vastgelegd in deze ${h(M.p.eenh)}`,
        'Zodra iemand een gesprek, een mail of een afspraak vastlegt bij een bedrijf, verschijnt die naam hier.');

  return `<div class="card s-kaart"><div class="card-h"><div class="h2">Wie doet wat</div>
      <span class="meta">deze ${h(M.p.eenh)}</span></div>
    <div class="card-b">${inhoud}
      <div class="meta" style="margin-top:12px">Contact, afspraken en voorstellen staan op naam van
        wie het vastlegde. Bedrijven en vacatures staan op naam van de eigenaar.</div>
    </div></div>`;
}

/* ─── Trechter ─────────────────────────────────────────────────── */
/* Twee getallen naast elkaar: hoeveel bedrijven staan er nú in een fase,
   en hoeveel zijn er deze periode in binnengekomen. Waar het tweede
   getal opdroogt terwijl het eerste hoog blijft, zit de trechter dicht. */
function trechter(M){
  const nuPer = new Map();
  M.klanten.forEach(k => { const f = faseVan(k); nuPer.set(f, (nuPer.get(f)||0) + 1); });
  const maxNu  = Math.max(...CRM.SALES_FASES.map(f => nuPer.get(f.k)||0), 1);
  const totIn  = [...M.beweging.values()].reduce((s,n) => s+n, 0);

  const rijen = CRM.SALES_FASES.map(f => {
    const staat = nuPer.get(f.k) || 0;
    const in_   = M.beweging.get(f.k) || 0;
    return `<tr${staat||in_?'':' class="s-dicht"'}>
      <td><span class="s-fase"><i style="background:${CRM.salesKleur(f.k)}"></i>${h(f.k)}</span></td>
      <td class="n num">${staat || '<span class="meta">—</span>'}</td>
      <td class="s-balk">${CRM.ui.bar(staat / maxNu * 100)}</td>
      <td class="n num">${M.faseRegels ? (in_ || '<span class="meta">—</span>') : '<span class="meta">?</span>'}</td>
    </tr>`;
  }).join('');

  const onder = M.faseRegels
    ? `<span class="num">${totIn}</span> fasewissels deze ${h(M.p.eenh)}. Een fase waar niemand
       binnenkomt terwijl er wel bedrijven staan, is de plek waar het stokt.`
    : `Er is nog geen enkele fasewissel vastgelegd. Zodra je een kaart op het bord verplaatst
       of de fase in de kaart wijzigt, vult de rechterkolom zich vanzelf.`;

  return `<div class="card s-kaart"><div class="card-h"><div class="h2">Trechter</div>
      <span class="meta">${M.klanten.length} bedrijven in beeld</span></div>
    <div class="card-b"><div class="tblwrap"><table class="tbl">
      <thead><tr><th>Fase</th><th class="n">Staat nu</th><th class="s-balkkop"></th>
        <th class="n">Erbij deze ${h(M.p.eenh)}</th></tr></thead>
      <tbody>${rijen}</tbody></table></div>
      <div class="meta" style="margin-top:12px">${onder}</div>
    </div></div>`;
}

/* ─── Wat blijft liggen ────────────────────────────────────────── */
/* Drie vragen met elk één duidelijke vervolgstap. Klikken opent de kaart. */
function blijftLiggen(M){
  const vandaag = M.p.tot;
  const contactVan = k => {
    const uitLog = M.laatsteContact.get(k.naam) || '';
    const uitVeld = lokaleDag(k.laatst_contact);
    return uitLog > uitVeld ? uitLog : uitVeld;      // lege string verliest van elke datum
  };

  const voorstellen = [], stil = [], verlopen = [];
  for(const k of M.klanten){
    const f = faseVan(k);
    if(!CRM.SALES_ACTIEF.includes(f)) continue;
    const inFase = CRM.dagenGeleden(k.fase_sinds);
    if((f === 'Voorstel gedaan' || f === 'SWO gestuurd') && inFase != null && inFase >= STIL_VOORSTEL)
      voorstellen.push({k, n:inFase, tekst:`${inFase} dagen in fase ${f}`});
    /* Leads doen niet mee: 117 geïmporteerde bedrijven waar je nooit mee
       gesproken hebt zouden deze lijst volledig overspoelen. */
    if(f === 'Lead') continue;
    const lc = contactVan(k);
    const dagen = lc ? dagenTussen(lc, vandaag) : null;
    if(dagen == null) stil.push({k, n:9999, tekst:'nog nooit contact vastgelegd'});
    else if(dagen >= STIL_CONTACT) stil.push({k, n:dagen, tekst:`${dagen} dagen niet gesproken`});
  }
  for(const o of (CRM.state.kansen || [])){
    if((o.status||'open') !== 'open') continue;
    if(!M.klanten.some(k => k.naam === o.klant)) continue;
    const d = lokaleDag(o.sluit_datum);
    if(!d || d >= vandaag) continue;
    verlopen.push({k:{naam:o.klant}, n:dagenTussen(d, vandaag),
                   tekst:`${o.titel} — sluitdatum ${dagenTussen(d, vandaag)} dagen voorbij`});
  }

  const blok = (titel, uitleg, lijst) => {
    if(!lijst.length) return `<div class="s-liglok"><div class="label">${h(titel)}</div>
      <p class="meta" style="margin:4px 0 0">Niets — ${h(uitleg)}</p></div>`;
    const top = lijst.sort((a,b) => b.n - a.n).slice(0, 6);
    return `<div class="s-liglok"><div class="label">${h(titel)} <span class="num">${lijst.length}</span></div>
      ${top.map(r => `<button type="button" class="s-ligrij" data-ligklant="${h(r.k.naam)}">
        <b class="trunc">${h(r.k.naam)}</b><span class="meta trunc">${h(r.tekst)}</span></button>`).join('')}
      ${lijst.length > top.length ? `<div class="meta" style="margin-top:6px">en nog ${lijst.length-top.length}</div>` : ''}</div>`;
  };

  return `<div class="card s-kaart"><div class="card-h"><div class="h2">Blijft liggen</div></div>
    <div class="card-b s-lig">
      ${blok(`Voorstel ligt ${STIL_VOORSTEL}+ dagen`, 'elk voorstel is nog vers', voorstellen)}
      ${blok(`${STIL_CONTACT}+ dagen niet gesproken`, 'elk lopend traject is recent gesproken', stil)}
      ${blok('Kans over de sluitdatum', 'geen kans staat over tijd', verlopen)}
    </div></div>`;
}

/* ─── Het tabblad ──────────────────────────────────────────────── */
function activiteitHTML(){
  const M = stuurcijfers();
  const p = M.p;

  const seg = `<div class="seg" id="s_per">${PERIODEN.map(x =>
    `<button data-per="${h(x.k)}" class="${pKeuze===x.k?'on':''}">${h(x.lbl)}</button>`).join('')}</div>`;

  /* Eerlijk zijn over hoe ver de meting terugkijkt. De activiteitenlijst is
     zo oud als het CRM, niet zo oud als het bedrijf; en er komen maximaal
     2.000 regels binnen. Zonder deze regels lijkt een lege vorige maand een
     slechte maand in plaats van een maand zonder metingen. */
  const noten = [];
  if(M.oudsteLog && M.oudsteLog > p.vvan)
    noten.push(`De activiteitenlijst begint op ${CRM.fmtDate(M.oudsteLog)}; over de tijd daarvóór is er niets vastgelegd.`);
  if((CRM.state.activiteiten||[]).length >= LOG_LIMIET)
    noten.push(`Er worden maximaal ${LOG_LIMIET} activiteiten ingeladen — oudere regels tellen niet mee.`);
  if(M.zonderAanmaak)
    noten.push(`Van de ${M.klanten.length} bedrijven in beeld hebben er ${M.zonderAanmaak} geen aanmaakdatum; die tellen niet mee bij "nieuwe bedrijven".`);
  if(M.vacZonder)
    noten.push(`Van de ${M.vacs} vacatures hebben er ${M.vacZonder} geen aanmaakdatum; die tellen niet mee bij "vacatures opgehaald".`);

  return `<div class="s-meting">
    <div class="row s-perbar">${seg}
      <div class="spacer"></div>
      <span class="meta">${h(CRM.fmtDate(p.van))} t/m ${h(CRM.fmtDate(p.tot))} ·
        dag <span class="num">${p.dagen}</span> van deze ${h(p.eenh)}</span>
    </div>
    ${metingTegels(M)}
    <div class="meta s-tegeluitleg">Een ingeplande afspraak wordt als gesprek vastgelegd en telt dus
      ook als contactmoment — de zes tegels vormen samen geen totaal.</div>
    ${noten.length ? `<div class="note info s-noot">${noten.map(n => `<div>${h(n)}</div>`).join('')}</div>` : ''}
    ${weekGrafiek(M)}
    ${persoonTabel(M)}
    <div class="grid c2 s-onder">${trechter(M)}${blijftLiggen(M)}</div>
  </div>`;
}

function bindActiviteit(){
  CRM.$$('[data-per]', mountEl).forEach(b => b.onclick = () => {
    pKeuze = b.dataset.per; V.zet('periode', pKeuze); tekenInhoud();
  });
  CRM.$$('[data-maat]', mountEl).forEach(b => b.onclick = () => {
    maatKeuze = b.dataset.maat; V.zet('maat', maatKeuze); tekenInhoud();
  });
  CRM.$$('[data-ligklant]', mountEl).forEach(b => b.onclick = () => openKlant(b.dataset.ligklant));
}

/* ─── Hoofdweergave ────────────────────────────────────────────── */
let mountEl = null, actiesEl = null;

function gefilterd(){
  const q = zoek.trim().toLowerCase();
  /* Het stiltefilter kijkt naar dezelfde indexen als de bordkaarten, zodat
     het filter en de regel op de kaart nooit iets anders beweren. "Geen
     contact/activiteit" (datum onbekend) telt mee als oneindig stil — dat
     zijn juist de bedrijven die je met dit filter zoekt. */
  let stilTest = null;
  if(stilF){
    const dagen = +stilF.slice(1);
    const idx = stilF[0] === 'a' ? activiteitIndex() : contactIndex();
    const vandaag = CRM.todayISO();
    stilTest = k => {
      const v = idx.get(k.naam);
      const dag = v && (v.dag || v);
      const d = dag ? dagenTussen(dag, vandaag) : null;
      return d == null || d >= dagen;
    };
  }
  return CRM.state.clients.filter(k => {
    if(mijn && !CRM.isVanMij(k)) return false;
    if(eigFilter && k.eigenaar !== eigFilter) return false;
    if(q && !(`${k.naam} ${k.branche||''} ${k.locatie||''} ${k.eigenaar||''}`).toLowerCase().includes(q)) return false;
    if(stilTest && !stilTest(k)) return false;
    return true;
  });
}

function tekenActies(){
  if(!actiesEl) return;
  /* De Leadradar heeft eigen filters in de tab zelf; de pijplijnfilters
     hierboven zouden daar niets doen en alleen verwarren. */
  if(tab==='radar' || tab==='vondsten'){ actiesEl.innerHTML = ''; return; }
  actiesEl.innerHTML = `
    <div class="searchbox"><input type="search" id="s_zoek" placeholder="Zoek bedrijf, branche of plaats" value="${h(zoek)}"></div>
    <select id="s_eig" style="width:auto;min-width:140px">
      <option value="">Alle eigenaren</option>
      ${eigenaren().map(e=>`<option value="${h(e)}"${eigFilter===e?' selected':''}>${h(e)}</option>`).join('')}
    </select>
    <button type="button" class="chip btn-like${mijn?' on':''}" id="s_mijn" aria-pressed="${mijn}">Mijn klanten</button>
    <select id="s_stil" style="width:auto"${stilF?' class="on"':''}>
      <option value="">Alle bedrijven</option>
      <option value="c14"${stilF==='c14'?' selected':''}>14+ dgn geen contact</option>
      <option value="c30"${stilF==='c30'?' selected':''}>30+ dgn geen contact</option>
      <option value="a14"${stilF==='a14'?' selected':''}>14+ dgn geen activiteit</option>
      <option value="a30"${stilF==='a30'?' selected':''}>30+ dgn geen activiteit</option>
    </select>
    <div class="seg" id="s_seg"${tab==='opvolg'||tab==='activiteit'?' style="display:none"':''}>
      <button data-w="bord" class="${weergave==='bord'?'on':''}">Bord</button>
      <button data-w="lijst" class="${weergave==='lijst'?'on':''}">Lijst</button>
    </div>`;

  const inp = actiesEl.querySelector('#s_zoek');
  inp.oninput = CRM.debounce(()=>{ zoek = inp.value; V.zet('zoek',zoek); tekenInhoud(); }, 220);
  actiesEl.querySelector('#s_eig').onchange = e => { eigFilter = e.target.value; V.zet('eigenaar',eigFilter); tekenInhoud(); };
  actiesEl.querySelector('#s_stil').onchange = e => { stilF = e.target.value; V.zet('stil',stilF); tekenInhoud(); };
  actiesEl.querySelector('#s_mijn').onclick = () => { mijn = !mijn; V.zet('mijn',mijn); tekenActies(); tekenInhoud(); };
  CRM.$$('#s_seg button', actiesEl).forEach(b=>b.onclick=()=>{ weergave=b.dataset.w; V.zet('weergave',weergave); tekenActies(); tekenInhoud(); });
}

function tekenInhoud(){
  if(!mountEl) return;
  const klanten = gefilterd();
  /* De tab Kansen is vervallen (Tjeerd, 4 aug 2026: "alles wat ik in het
     systeem zet is namelijk een kans") en Opvolgingen kwam ervoor in de
     plaats: de open klanttaken, dagelijks bij te houden. */
  const opvolgN = openOpvolgingen().filter(t => !t.datum || t.datum <= CRM.todayISO()).length;

  const radarN = radarNieuwN();
  const vondstN = vondstNieuwN();
  const kop = `<div class="s-wrap">
    <div class="s-top">
      <div class="tabs">
        <button class="tab${tab==='pijplijn'?' on':''}" data-tab="pijplijn">Klantpijplijn<span class="cnt num">${klanten.length}</span></button>
        <button class="tab${tab==='opvolg'?' on':''}" data-tab="opvolg">Opvolgingen${opvolgN?`<span class="cnt num">${opvolgN}</span>`:''}</button>
        <button class="tab${tab==='activiteit'?' on':''}" data-tab="activiteit">Activiteit</button>
        <button class="tab${tab==='radar'?' on':''}" data-tab="radar">Leadradar${radarN?`<span class="cnt num">${radarN}</span>`:''}</button>
        <button class="tab${tab==='vondsten'?' on':''}" data-tab="vondsten">Zelf gevonden${vondstN?`<span class="cnt num">${vondstN}</span>`:''}</button>
      </div>
      <div class="row tight s-acts">${tab==='vondsten'
        ? `<button class="btn ghost" data-rhand>Handmatig toevoegen</button>`
        : tab==='radar'
        ? `<button class="btn ghost" data-rhand>Handmatig toevoegen</button>
           <button class="btn" data-rzoek${rZoeken?' disabled':''}>${rZoeken?'Bezig met zoeken…':'↻ Nu zoeken'}</button>`
        /* Op Activiteit kijk je naar wat er al gebeurd is; daar hoort geen
           knop die iets nieuws maakt. */
        : tab==='activiteit' ? ''
        : `<button class="btn" data-nieuwtaak>+ Opvolgtaak</button>`}
      </div>
    </div>`;

  if(tab==='radar'){
    mountEl.innerHTML = kop + radarHTML(false) + '</div>';
  } else if(tab==='vondsten'){
    mountEl.innerHTML = kop + radarHTML(true) + '</div>';
  } else if(tab==='activiteit'){
    mountEl.innerHTML = kop + activiteitHTML() + '</div>';
  } else if(tab==='opvolg'){
    mountEl.innerHTML = kop + opvolgHTML() + '</div>';
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
    /* Ná de render, zonder erop te wachten: het bord staat er meteen en de
       afspraken schuiven in zodra de agenda binnen is (uit cache: direct). */
    if(!leegBord) agendaOpBord();
    /* En stil de verzonden mail verwerken: heeft die het veld
       laatst_contact ergens bijgewerkt, dan tekent het bord zich één keer
       opnieuw met de verse "gesproken"-regels. De cache in opvolging.js
       zorgt dat dit hooguit eens per vijf minuten écht iets doet — geen
       renderlus. */
    if(!leegBord && CRM.opvolging.contactUitMail)
      CRM.opvolging.contactUitMail().then(gewijzigd => {
        if(gewijzigd && CRM.view === 'sales') tekenInhoud();
      }).catch(()=>{});
  }
  bindInhoud();
}

function bindInhoud(){
  CRM.$$('[data-tab]', mountEl).forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; V.zet('tab',tab); tekenActies(); tekenInhoud(); });
  CRM.$$('[data-radar]', mountEl).forEach(b=>b.onclick=()=>{ tab='radar'; V.zet('tab',tab); tekenActies(); tekenInhoud(); });
  /* Het gedeelde taakvenster — mét de snelkeuzes morgen/1w/2w/1m. */
  CRM.$$('[data-nieuwtaak]', mountEl).forEach(b=>b.onclick=async ()=>{
    const rij = await CRM.taakModal({});
    if(rij) tekenInhoud();
  });
  bindRadar();
  if(tab==='activiteit') bindActiviteit();
  if(tab==='opvolg') bindOpvolg();
  CRM.$$('[data-wis]', mountEl).forEach(b=>b.onclick=()=>{
    zoek=''; mijn=false; eigFilter=''; stilF='';
    V.zet('zoek',''); V.zet('mijn',false); V.zet('eigenaar',''); V.zet('stil','');
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
  if(tab!=='radar' && tab!=='vondsten') return;
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
  /* Belteksten open/dicht. Meerdere tegelijk open mag: je vergelijkt soms
     twee bedrijven voor je besluit wie je eerst belt. */
  CRM.$$('[data-rcon]', mountEl).forEach(b=>b.onclick=()=>{
    const id = b.dataset.rcon;
    rOpen.has(id) ? rOpen.delete(id) : rOpen.add(id);
    tekenInhoud();
  });
  CRM.$$('[data-rkop]', mountEl).forEach(b=>b.onclick=async ()=>{
    const [id, veld] = b.dataset.rkop.split('|');
    const r = radar.find(x=>x.id===id); if(!r) return;
    const tekst = veld==='alles' ? conceptTekst(r) : String((r.concepten||{})[veld]||'');
    if(!tekst) return CRM.toast('Deze tekst is leeg','err');
    const gelukt = await kopieerTekst(tekst);
    CRM.toast(gelukt ? (veld==='alles' ? 'Alle teksten gekopieerd' : 'Gekopieerd')
                     : 'Kopiëren lukte niet — selecteer de tekst zelf',
              gelukt ? 'ok' : 'err');
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
  title:'Sales', icon:'◈', onderschrift:'Klantpijplijn, opvolgingen en leadradar',
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
   2b. Het tabblad Activiteit telt "vacatures opgehaald" uit
      `vacatures.aangemaakt`. Die kolom staat NIET in supabase/schema.sql
      (alleen js/klanten.js schrijft hem bij nieuwe vacatures) en is leeg
      bij alles wat geïmporteerd is. Zie de SQL onderaan dit blok. Zolang
      de kolom leeg is toont het scherm een streepje met de reden, geen 0.
   2c. `clients.fase_historie` bestaat in het schema maar wordt door
      niemand geschreven. Sales leidt fase-overgangen daarom af uit de
      activiteitenregels ("Fase gewijzigd: A → B"). Dat werkt, maar het
      is tekst. Als `zetFase` in sales.js en klanten.js `fase_historie`
      zouden aanvullen, kan die tekstlezing weg.
   2d. `CRM.load()` haalt maximaal 2.000 activiteiten op. Voor "deze week"
      en "deze maand" is dat ruim genoeg; voor een kwartaalvergelijking
      op termijn niet. Het scherm meldt de grens zodra hij geraakt wordt.
   4. `crm_leadradar` zit niet in CRM.load()/CRM.state; sales haalt de
      tabel zelf op (met dezelfde nette degradatie als core's veilig()).
      Als meer modules de radar willen tonen (bv. dashboard-teller),
      graag toevoegen aan CRM.load() plus realtime-kanaal.

   ─── SQL VOOR DE COORDINATOR ───────────────────────────────────
   Nodig voor "vacatures opgehaald" (punt 2b). De kolom bestaat in
   productie al bij vacatures die via de app zijn aangemaakt, maar
   staat niet in het schema en ontbreekt bij de import:

     alter table vacatures add column if not exists aangemaakt date;
     -- Bestaande rijen niet raden: leeg laten is eerlijker dan een
     -- verzonnen datum. Het scherm meldt hoeveel rijen geen datum hebben.
     -- Alleen voor nieuwe rijen een standaard:
     alter table vacatures alter column aangemaakt set default current_date;

   Voor de demo (js/demo.js, niet van sales): KLANTEN krijgen nu geen
   `aangemaakt` mee, waardoor de tegel "nieuwe bedrijven" in demo altijd
   een streepje toont. Eén veld erbij in de KLANTEN-map maakt die tegel
   ook in de demo echt:  aangemaakt: d(-(20 + i*7))
   ═══════════════════════════════════════════════════════════════ */
