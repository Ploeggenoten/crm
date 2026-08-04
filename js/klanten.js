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
  /* fase stond hier niet bij: het filter werd wél weggeschreven maar bij
     een herlaad nooit teruggezet, terwijl de andere filters dat wel doen. */
  fase:     P.get('fase',''),
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

/* ─── Verjaardag van een contactpersoon ───────────────────────────
   ALTIJD alleen dag en maand — nooit het jaartal en nooit de leeftijd.
   Bij een zakelijk contact is die leeftijd niet ter zake, en om iemand
   te feliciteren heb je hem ook niet nodig. Het jaartal blíjft wel in
   de database staan (een datumkolom heeft nu eenmaal een jaar), dus we
   rekenen hier met de sleutel 'MM-DD' en formatteren met een vást jaar:
   zo komt het echte geboortejaar nergens in de DOM terecht.
   Privacy: dit is een persoonsgegeven. Het hoort op de klantkaart en in
   de takenlijst — niet in exports, documentgeneratoren of tooltips die
   verder gedeeld worden. */
const mmdd = iso => { const m = /^\d{4}-(\d{2}-\d{2})/.exec(String(iso||'')); return m ? m[1] : ''; };
const dagMaand = iso => {
  const md = mmdd(iso); if(!md) return '';
  /* 2000 is een schrikkeljaar, dus 29 februari bestaat en verschuift niet. */
  const d = new Date(2000, Number(md.slice(0,2)) - 1, Number(md.slice(3)));
  return isNaN(d) ? '' : d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
};
const schrikkeljaar = j => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
/* Lokale datum als YYYY-MM-DD — zelfde route als CRM.todayISO(), dus geen
   UTC-verschuiving die een verjaardag een dag laat verspringen. */
const isoVan = d => d.toLocaleDateString('sv-SE');

/* De kolom crm_contacten.geboortedatum komt pas in de database nadat
   supabase/schema.sql opnieuw is gedraaid. Zolang hij er niet is, tonen we
   het veld niet en sturen we het niet mee bij opslaan — anders faalt de hele
   update en kan er níéts meer aan een contactpersoon gewijzigd worden.
   `select *` levert de kolom als sleutel op zodra hij bestaat, dus daar
   kunnen we op afgaan (zelfde vangnet als heeftVestigingVelden verderop). */
const heeftGeboortedatum = () => {
  const rij = (CRM.state.contacten || []).find(Boolean);
  return !!rij && 'geboortedatum' in rij;
};
const EVAL_CRIT = [
  {k:'samenwerking',   lbl:'Samenwerking'},
  {k:'communicatie',   lbl:'Communicatie'},
  {k:'betaalgedrag',   lbl:'Betaalgedrag'},
  {k:'terugkoppeling', lbl:'Kwaliteit terugkoppeling'},
  {k:'besluitvorming', lbl:'Doorlooptijd besluitvorming'}
];
const VAC_STATUS = ['Open','On hold','Vervuld','Gesloten'];

/* ─── Vacature-informatie voor de website ─────────────────────────
   Bij een nieuwe vacature krijgt de marketeer een melding. Zo'n melding
   is alleen iets waard als er ook staat wát er op de site moet komen —
   anders begint het heen-en-weer over werktijden en certificaten alsnog.
   Daarom vraagt het vacaturevenster naast functie en aantal ook de
   dingen die je in een vacaturetekst voor productie, logistiek en
   industrie echt nodig hebt.

   Ze staan in een apart, ingeklapt blok. Een AM die snel een opdracht
   wil vastleggen scrollt niet eerst langs zeven velden; wie de info wél
   heeft klikt één keer. De teller in de samenvatting maakt zichtbaar
   hoeveel er nog mist, en diezelfde teller gaat mee in de melding.
   Dezelfde opzet als CRM.volledigheid bij kandidaten: één lijst met
   labels, zodat het venster, de vacaturekaart en de melding nooit iets
   anders zeggen. */
const VAC_CONTRACT = ['Uitzicht op vast','Direct in dienst bij de klant',
  'Tijdelijk of seizoenswerk','Uitzenden zonder uitzicht op vast'];
const VAC_BEREIK = ['Goed met het OV','Met OV te doen, eigen vervoer handiger',
  'Alleen met eigen vervoer','Op fietsafstand'];
const VAC_WEB = ['Nog niet online','Staat online','Niet nodig'];

const VAC_INFOVELDEN = [
  {k:'werktijden',     lbl:'Werktijden'},
  {k:'ploegendienst',  lbl:'Ploegendienst'},
  {k:'contractvorm',   lbl:'Contractvorm'},
  {k:'eisen',          lbl:'Ervaring en certificaten'},
  {k:'bereikbaarheid', lbl:'Bereikbaarheid'},
  {k:'over_bedrijf',   lbl:'Over het bedrijf'},
  {k:'waarom_hier',    lbl:'Waarom hier werken'},
  /* Het salaris staat al bovenin het venster, maar telt hier wel mee:
     zonder loonindicatie krijgt een vacature in deze branches nauwelijks
     reacties, dus voor de website is het geen bijzaak. */
  {k:'salaris',        lbl:'Salarisindicatie', vul:v => v.sal_min != null || v.sal_max != null}
];
const vacInfo = v => {
  const r = v || {};
  const mist = VAC_INFOVELDEN.filter(f => f.vul ? !f.vul(r) : !String(r[f.k]||'').trim());
  const totaal = VAC_INFOVELDEN.length;
  return {mist, klaar: totaal - mist.length, totaal,
          pct: Math.round((totaal - mist.length) / totaal * 100)};
};
/* Alle acht labels achter elkaar is een muur tekst die niemand leest — en in
   een melding helemaal. Noem er hooguit een paar en tel de rest op. */
const mistTekst = (info, max = 3) => {
  const lbls = info.mist.map(x => x.lbl.toLowerCase());
  if(lbls.length <= max) return lbls.join(', ');
  return lbls.slice(0, max).join(', ') + ` en nog ${lbls.length - max}`;
};

/* De kolommen hiervoor (en die van de websitestand) komen pas in de database
   nadat de wijziging onderaan dit bestand gedraaid is. Zolang ze er niet zijn
   tonen we de velden niet en sturen we ze niet mee — anders sneuvelt de hele
   opslag en kan er niets meer aan een vacature gewijzigd worden. In demo is er
   geen database, dus daar mag alles. */
const heeftVacInfoVelden = () => {
  if(CRM.demo) return true;
  const rij = (CRM.state.vacs || []).find(Boolean);
  return !!rij && 'werktijden' in rij && 'web_status' in rij;
};
/* Blok 9 (3 aug 2026): de kaartvelden — tekstblokken, uurloon, afwijkende
   fee. Zelfde patroon als hierboven: pas meesturen als de kolommen bestaan,
   anders weigert PostgREST de hele insert en lijkt opslaan stuk. */
const heeftVacKaartVelden = () => {
  if(CRM.demo) return true;
  const rij = (CRM.state.vacs || []).find(Boolean);
  return !!rij && 'openingszin' in rij && 'fee_pct' in rij;
};

/* Wie is marketeer? Altijd uit de profielen, nooit op naam: er kan er een
   tweede bijkomen en een rol kan wisselen. Geen marketeer in het team
   levert een lege lijst op — dan gaat er gewoon geen melding uit. */
const marketeers = () => (CRM.state.profiles || [])
  .filter(p => (p.functie||'') === 'marketeer' && p.naam)
  .map(p => p.naam);

/* CRM.meld slaat een melding aan jezelf over. Zet de marketeer zelf een
   vacature op, dan krijgt diegene dus terecht niets. Geeft terug hoeveel
   meldingen er echt uit zijn gegaan, zodat de toast niet iets belooft wat
   niet gebeurd is. */
async function meldMarketeers(soortTekst, klant){
  const wie = marketeers();
  if(!wie.length) return 0;
  let uit = 0;
  for(const naam of wie){
    /* entiteit 'klant': de doorklik in het dashboard en in Teams komt dan uit
       op de klantkaart, en die opent op het tabblad Vacatures. */
    const m = await CRM.meld(naam, 'vacature', soortTekst, klant ? 'klant' : '', klant || '');
    if(m) uit++;
  }
  return uit;
}
async function meldNieuweVacature(k, v){
  const info  = vacInfo(v);
  const klant = k?.naam || v.klant || '';
  const waar  = v.locatie || k?.locatie || '';
  const plek  = (Number(v.aantal)||1) > 1 ? ` (${Number(v.aantal)||1} plekken)` : '';
  const am    = v.eigenaar || k?.eigenaar || 'de accountmanager';
  const tekst = `Nieuwe vacature${klant ? ' bij ' + klant : ''}: ${v.functie}${plek}`
    + (waar ? ` in ${waar}` : '') + '. Graag op de website zetten. '
    + (info.mist.length
        ? `Nog niet compleet: ${mistTekst(info)} ${info.mist.length===1?'ontbreekt':'ontbreken'}. Vraag dat na bij ${am}.`
        : 'Alle informatie voor de tekst staat erbij.');
  return meldMarketeers(tekst, klant);
}
async function meldInfoAangevuld(k, v){
  const klant = k?.naam || v.klant || '';
  return meldMarketeers(
    `De informatie voor de vacature ${v.functie}${klant ? ' bij ' + klant : ''} is aangevuld. `
    + 'Alles wat je voor de tekst nodig hebt staat er nu in.', klant);
}
/* De lus terug: de AM die de vacature aanmeldde hoort te weten dat hij online
   staat, anders blijft het gissen. Zet de AM hem zelf online, dan slaat
   CRM.meld de melding aan zichzelf over. */
async function meldOnline(k, v){
  const naar  = v.eigenaar || k?.eigenaar || '';
  const klant = k?.naam || v.klant || '';
  if(!naar) return;
  await CRM.meld(naar, 'vacature',
    `${CRM.me()} heeft de vacature ${v.functie}${klant ? ' bij ' + klant : ''} op de website gezet.`,
    klant ? 'klant' : '', klant || '');
}

/* Contactpersonen worden (nog) niet door core geladen — hier eenmalig ophalen. */
let _contGeladen = false;
function zorgContacten(){
  if(!Array.isArray(CRM.state.contacten))  CRM.state.contacten  = [];
  if(!Array.isArray(CRM.state.documenten)) CRM.state.documenten = [];
  /* In demo is er geen database en dus ook geen kolom om op te controleren.
     Eén keer de sleutel zetten zodat heeftGeboortedatum() daar 'ja' zegt en
     het veld gewoon te proberen is; de waarde blijft leeg tot je hem invult. */
  if(CRM.demo) for(const c of CRM.state.contacten) if(!('geboortedatum' in c)) c.geboortedatum = null;
  if(CRM.demo || _contGeladen) return;
  _contGeladen = true;
  CRM.sb.from('crm_contacten').select('*').then(r => {
    if(r.error){ console.warn('crm_contacten laden', r.error); return; }
    CRM.state.contacten = r.data || [];
    if(CRM.view === 'klanten') CRM.render();
  });
}

/* ─── Rekenmotor js/fee.js ────────────────────────────────────────
   Staat als scripttag in index.html en is er dan gewoon. Dit is het
   vangnet voor het geval die regel sneuvelt: zonder de motor blijft
   het afsprakenblok anders stilzwijgend weg en snapt niemand waarom.
   De motor is puur rekenwerk zonder afhankelijkheden, dus de volgorde
   van laden maakt niet uit. */
function zorgFee(){
  if(CRM.fee || document.getElementById('js_fee_motor')) return;
  const s = document.createElement('script');
  s.id = 'js_fee_motor'; s.src = 'js/fee.js';
  s.onload = () => { if(CRM.view === 'klanten') CRM.render(); };
  s.onerror = () => console.warn('js/fee.js kon niet geladen worden');
  document.head.appendChild(s);
}

/* ─── Commerciële afspraken (crm_afspraken) ───────────────────────
   PRIVACY — de grens ligt hier sinds 31 jul 2026 anders. Deze tabel
   bevat de fee-percentages per klant, en die mag het hele team LEZEN
   (besluit Tjeerd: "de fee mag zichtbaar zijn voor iedereen, omzet per
   klant ook prima"). WIJZIGEN blijft aan de eigenaar: een percentage is
   een onderhandelingsresultaat, geen veld dat je even bijwerkt.
   In de database volgt het dezelfde lijn (policy afspraken_team).
   Winst, marge, cashflow en banksaldo zitten in de fin_*-tabellen en
   blijven wél volledig afgeschermd. */
let _afsprGeladen = false, _afsprTabelMist = false;
const TABEL_WEG = e => /does not exist|schema cache|relation/i.test(e && e.message || '');
function zorgAfspraken(){
  if(!Array.isArray(CRM.state.afspraken)) CRM.state.afspraken = [];
  if(!CRM.magOpbrengstZien() || _afsprGeladen) return;
  _afsprGeladen = true;
  /* In demo bestaat de tabel nog niet — dan lokaal, zodat opslaan en
     teruglezen wél te testen is. */
  /* In demo: alleen aanvullen als er nog niets staat. js/demo.js zet hier
     voorbeeldafspraken neer, en die mogen niet overschreven worden door een
     lege lijst uit localStorage — dan toont de fee overal een streepje. */
  if(CRM.demo){
    const bewaard = P.get('afspraken', null);
    if(Array.isArray(bewaard) && bewaard.length) CRM.state.afspraken = bewaard;
    else if(!CRM.state.afspraken.length) CRM.state.afspraken = [];
    return;
  }
  CRM.sb.from('crm_afspraken').select('*').then(r => {
    if(r.error){
      if(TABEL_WEG(r.error)) _afsprTabelMist = true;
      else console.warn('crm_afspraken laden', r.error);
      return;
    }
    CRM.state.afspraken = r.data || [];
    if(CRM.view === 'klanten') CRM.render();
  });
}

/* ─── Index: één keer per render, niet één keer per klant ─────────
   cijfers() en laatsteContact() draaien voor élke rij in het overzicht
   (222 relaties in productie). Zonder index betekende dat 222 × alle
   kandidaten omzetten (349) en 222 × alle activiteiten (2000) door-
   lopen — bij elke toetsaanslag in het zoekveld opnieuw. Nu bouwen we
   drie mappen op klantnaam en is een rij een simpele lookup. */
let _idx = null, _idxStempel = '';
const stempel = () => [CRM.state.cands.length, CRM.state.vacs.length,
  CRM.state.activiteiten.length, CRM.state.clients.length,
  /* Contactpersonen erbij: die worden asynchroon geladen (core én de eigen
     fallback hierboven), dus zonder deze teller bleef een index die vóór het
     laden is gebouwd hangen op een lege contactenlijst. */
  (CRM.state.contacten||[]).length].join('/');
function verversIndex(){ _idx = null; }
function index(){
  const s = stempel();
  if(_idx && _idxStempel === s) return _idx;
  const bij = (map, sleutel, waarde) => {
    const l = map.get(sleutel); if(l) l.push(waarde); else map.set(sleutel, [waarde]);
  };
  const kand = new Map(), vac = new Map(), act = new Map(), actKand = new Map(), cont = new Map();
  CRM.kandidaten().forEach(c => bij(kand, c.klant, c));
  (CRM.state.vacs||[]).forEach(v => bij(vac, v.klant, v));
  (CRM.state.contacten||[]).forEach(c => bij(cont, c.klant, c));
  (CRM.state.activiteiten||[]).forEach(a => {
    if(a.entiteit === 'klant')         bij(act,     String(a.ref), a);
    else if(a.entiteit === 'kandidaat') bij(actKand, String(a.ref), a);
  });
  _idx = {kand, vac, act, actKand, cont}; _idxStempel = s;
  return _idx;
}
const LEEG = [];
/* Contactpersonen van één klant — via dezelfde index, dus geen scan over
   alle contacten per rij. */
const contactenVan = naam => index().cont.get(naam) || LEEG;

/* Laatste contactmoment: nieuwste van clients.laatst_contact en de activiteiten. */
function laatsteContact(k){
  let uitAct = null;
  for(const a of (index().act.get(k.naam) || LEEG))
    if(a.op && (!uitAct || a.op > uitAct)) uitAct = a.op;
  const uitK = k.laatst_contact || null;
  if(!uitAct) return uitK;
  if(!uitK)   return uitAct;
  return new Date(uitAct) > new Date(uitK) ? uitAct : uitK;
}

/* Kerncijfers van één klant — de kaart toont er nog maar een paar,
   de rest leeft in Performance › Per klant.
   Let op: 'lopend' vereist een ÉCHTE fase. Kandidaten uit de oude
   ATS-import hebben fase '' en zitten in geen enkel traject; zonder
   die check tellen ze allemaal mee als "in traject" (zelfde valkuil
   als CRM.isActiefLopend in js/data.js beschrijft). */
function cijfers(naam){
  const i = index();
  const cs = i.kand.get(naam) || LEEG;
  const vs = i.vac.get(naam)  || LEEG;
  const open   = vs.filter(v => (v.status||'Open') === 'Open');
  const lopend = cs.filter(c => !!c.fase && !CRM.DONE.includes(c.fase));
  const nu     = cs.filter(c => CRM.PLACED.includes(c.fase));
  const ooit   = cs.filter(c => CRM.PLACED.includes(c.fase) || c.fase === 'Gestopt' || c.geplaatstOp);
  return {cs, vs, open, lopend, nu, ooit};
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
  verversIndex();
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
  verversIndex();
  if(!CRM.demo){
    const {error} = await CRM.sb.from(tabel).delete().eq('id', id);
    if(error) return CRM.fout('Verwijderen mislukt', error);
  }
  CRM.toast('Verwijderd','ok');
}

/* Afspraken apart: eigen tabel, eigen afscherming, en in demo geen
   database maar localStorage (de tabel bestaat daar niet). */
async function bewaarAfspraak(rij, bestaat){
  /* Lezen mag het team, schrijven niet — zie de toelichting bij
     zorgAfspraken(). De database weigert het ook. */
  if(!CRM.canSeeMoney()) return;
  const lijst = CRM.state.afspraken || (CRM.state.afspraken = []);
  const i = lijst.findIndex(r => String(r.id) === String(rij.id));
  if(i >= 0) Object.assign(lijst[i], rij); else lijst.unshift(rij);
  if(CRM.demo){ P.set('afspraken', lijst); CRM.toast('Opgeslagen','ok'); return; }
  const nu = new Date().toISOString();
  const q = bestaat
    ? CRM.sb.from('crm_afspraken').update(Object.assign({}, rij, {updated_at:nu})).eq('id', rij.id)
    : CRM.sb.from('crm_afspraken').insert(rij);
  const {error} = await q;
  if(error){
    if(TABEL_WEG(error)) return CRM.toast('Tabel crm_afspraken bestaat nog niet — draai eerst supabase/schema.sql','err');
    return CRM.fout('Opslaan mislukt', error);
  }
  CRM.toast('Opgeslagen','ok');
}
async function verwijderAfspraak(id){
  if(!CRM.canSeeMoney()) return;
  CRM.state.afspraken = (CRM.state.afspraken || []).filter(r => String(r.id) !== String(id));
  if(CRM.demo){ P.set('afspraken', CRM.state.afspraken); CRM.toast('Verwijderd','ok'); return; }
  const {error} = await CRM.sb.from('crm_afspraken').delete().eq('id', id);
  if(error) return CRM.fout('Verwijderen mislukt', error);
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
  /* Doorklik naar het overzicht van alle contactpersonen. Staat hier en niet
     in het menu: het hoort bij Relaties, en de zijbalk heeft al twaalf items. */
  if(CRM.contactKaart) CRM.contactKaart.lijstKnop(acties);

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
          <!-- <button>, geen <span>: dit zijn filters die je aan- en uitzet,
               dus ze horen in de tabvolgorde te staan en aria-pressed hoort
               de stand te vertellen. -->
          <button type="button" class="chip btn-like${F.mijn?' on':''}" id="kl_mijn" aria-pressed="${F.mijn}">Mijn relaties</button>
          <button type="button" class="chip btn-like${F.actief?' on':''}" id="kl_act" aria-pressed="${F.actief}">Alleen klanten (actief)</button>
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
  /* currentTarget, niet target: bij een <button> kan de klik op een tekstknoop
     of een span binnenin landen en dan zette de oude code de klasse op het
     verkeerde element (chip bleef "uit" staan terwijl het filter aan was). */
  const knopFilter = (sel, sleutel) => {
    const b = mount.querySelector(sel);
    b.onclick = () => {
      zet(sleutel, !F[sleutel]);
      b.classList.toggle('on', F[sleutel]);
      b.setAttribute('aria-pressed', String(F[sleutel]));
      lijst(mount);
    };
  };
  knopFilter('#kl_mijn','mijn');
  knopFilter('#kl_act','actief');
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
  }).map(k => {
    const lc = laatsteContact(k);
    /* Dagen hier één keer uitrekenen: de sortering vergeleek anders per
       paar vier keer een datum en dat is bij 222 relaties zonde. */
    const d = CRM.dagenGeleden(lc);
    return {k, c:cijfers(k.naam), lc, d: d == null ? 9999 : d};
  });

  const srt = {
    naam:      (a,b) => a.k.naam.localeCompare(b.k.naam,'nl'),
    contact:   (a,b) => b.d - a.d || a.k.naam.localeCompare(b.k.naam,'nl'),
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
        <tr${CRM.ui.frand(k.fase ? CRM.salesKleur(k.fase) : '', 'clickable')} data-k="${h(k.naam)}">
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
      /* De rand links is de gedeelde kleurtaal (zie .frand in base.css): op
         een grid van tweehonderd relaties zie je zo in één blik wie prospect
         is en wie klant, zonder de fasechip te lezen. Zonder fase geen rand. */
      return `<div${CRM.ui.frand(k.fase ? CRM.salesKleur(k.fase) : '', 'card kl-kaart')} data-k="${h(k.naam)}">
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
    <button class="btn ghost sm" id="k_bewerk">Gegevens bewerken</button>
    ${CRM.pva ? '<button class="btn ghost sm" id="k_pva">Plan van aanpak</button>' : ''}
    ${CRM.swo ? '<button class="btn ghost sm" id="k_swo">Samenwerkingsovereenkomst</button>' : ''}`;
  acties.querySelector('#k_terug').onclick  = () => CRM.ga('klanten');
  acties.querySelector('#k_bewerk').onclick = () => klantModal(k);
  /* Documentgeneratoren (js/pva.js, js/swo.js). Ze openen als paneel over de
     kaart heen, dus je blijft in de context van deze klant. */
  acties.querySelector('#k_pva')?.addEventListener('click', () => CRM.pva.open({klant:k.naam}));
  acties.querySelector('#k_swo')?.addEventListener('click', () => CRM.swo.open({klant:k.naam}));

  mount.innerHTML = `
    <div class="stack">
      ${kopHtml(k, c)}
      <div class="kl-dossier">
        <aside class="kl-rail">
          ${/* Notities staan bovenaan. Ze stonden onderaan de zijbalk, onder de
               gegevens, de afspraak, de contactpersonen en de taken — dus je
               moest scrollen om te zien waar een collega mee bezig was. Terwijl
               dát het eerste is wat je wilt weten als je een kaart opent van een
               relatie waar Tjerk en Rajesh allebei aan werken.
               (Tjeerd, 3 aug 2026: "iedereen moet direct zien waar iedereen mee
               bezig is in de eerste oogopslag.") */
            notitiesBlokHtml()}
          ${gegevensHtml(k)}
          ${afspraakBlokHtml()}
          ${CRM.contactKaart ? CRM.contactKaart.railHtml(k.naam) : contactBlokHtml()}
          ${afsprakenBlokHtml()}
          ${takenBlokHtml()}
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
  /* Mailen: met Outlook-koppeling schrijf je de mail hier (en wordt hij
     vanzelf gelogd); zonder koppeling leg je vast wat je buiten het CRM
     hebt gemaild. Handmatig loggen blijft in de tab Activiteiten. */
  mount.querySelector('#k_mail').onclick    = () => {
    const hoofd = (CRM.state.contacten||[]).filter(x => x.klant === k.naam && x.email)
      .sort((a,b) => (b.hoofd?1:0) - (a.hoofd?1:0))[0];
    const adres = k.email || (hoofd && hoofd.email) || '';
    if(CRM.mailUI.actief() && adres){
      CRM.mailUI.opstellen({aan:adres, wie:k.naam, set:'klant',
        ctx:{voornaam: hoofd && !k.email ? voornaamVan(hoofd.naam) : '', klant:k.naam},
        entiteit:'klant', ref:k.naam,
        na(){ tabActief = 'activiteiten'; CRM.render(); }});
      return;
    }
    logVia(k,'mail','Waarover ging de mail?');
  };
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

  /* Rail: contactpersonen. Elke regel is nu een knop naar de eigen kaart van
     die persoon — daar staat de geschiedenis, wie er via hem is aangenomen en
     hoe lang je hem niet gesproken hebt. Zie js/contactkaart.js. */
  if(CRM.contactKaart) CRM.contactKaart.bindRail(mount, k.naam);
  else {
    const ctLijst = mount.querySelector('#ct_lijst');
    const ctZoek  = mount.querySelector('#ct_zoek');
    ctZoek.oninput = () => { contactZoek = ctZoek.value; contactLijst(ctLijst, k); };
    mount.querySelector('#ct_nieuw').onclick = () => contactModal(k, null);
    contactLijst(ctLijst, k);
  }

  /* Rail: commerciële afspraken (alleen achter CRM.canSeeMoney) */
  railAfspraak(mount, k);

  /* Rail: komende afspraken (alleen met gekoppelde Outlook) */
  railAfspraken(mount, k);

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

/* ─── Rail: komende afspraken uit Outlook ─────────────────────────
   Alleen als deze gebruiker zijn Outlook gekoppeld heeft; anders
   blijft het blok weg (geen loze belofte op het scherm). ───────── */
function afsprakenBlokHtml(){
  if(!CRM.outlook?.verbonden?.()) return '';
  return `<div class="card kl-railkaart kl-r-ag" id="ag_kaart" hidden>
    <div class="card-h"><div class="h2">Komende afspraken</div></div>
    <div class="card-b" id="ag_lijst"></div></div>`;
}

/* De matching (klantnaam of contact-e-mail in de afspraak) zit sinds
   3 aug 2026 in CRM.opvolging.agendaIndex — het Sales-bord leest hem ook,
   en met één gedeelde regel én één gedeelde cache kunnen de kaart en het
   bord nooit iets anders beweren over dezelfde klant. */
function railAfspraken(root, k){
  const kaart = root.querySelector('#ag_kaart'); if(!kaart) return;
  const lijst = kaart.querySelector('#ag_lijst');

  Promise.resolve(CRM.opvolging.agendaIndex(30)).then(idx => {
    if(!idx) return;
    const raak = (idx.get(k.naam) || []).slice(0, 5);
    if(!raak.length){ kaart.hidden = true; return; }
    kaart.hidden = false;
    lijst.innerHTML = `<div class="kl-afspraken">${raak.map(e => {
      const dt = new Date(e.start);
      const wanneer = isNaN(dt) ? '' : CRM.fmtDateShort(e.start) + ' · ' +
        dt.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
      const waar = e.online ? 'Teams' : (e.locatie || '');
      return `<div class="kl-afspraak">
        <b class="trunc">${h(e.titel||'Afspraak')}</b>
        <div class="meta num">${h(wanneer)}${waar ? ' · ' + h(waar) : ''}</div>
      </div>`;
    }).join('')}</div>`;
  }).catch(e => console.warn('agenda klantkaart', e));
}
/* Na het inplannen: het blokje bijwerken als de klantkaart openstaat.
   Eerst de gedeelde cache legen, anders toont de kaart de zojuist
   ingeplande afspraak pas na vijf minuten. */
function verversAfspraken(k){
  CRM.opvolging.agendaVervers?.();
  if(klantOpen === k.naam && document.getElementById('ag_kaart')) railAfspraken(document, k);
}

/* ─── Rail: gegevens — compacte kaart met de klantvelden ───────── */
function gegevensHtml(k){
  const web = veiligeUrl(k.website);
  let webTekst = '';
  if(web){ try{ webTekst = new URL(web).hostname.replace(/^www\./,''); }catch(e){ webTekst = 'Website'; } }
  const rij = (lbl, val) => `<div class="kl-gg-rij"><span class="kl-gg-lbl">${h(lbl)}</span>
    <span class="kl-gg-val trunc">${val || '<span class="meta">—</span>'}</span></div>`;
  return `<div class="card kl-railkaart kl-r-gg">
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

/* ═══════════════════════════════════════════════════════════════
   RAIL: COMMERCIËLE AFSPRAKEN
   De brug tussen de samenwerkingsovereenkomst en de facturatie: hier
   staat wat er commercieel is afgesproken, zodat het systeem na een
   getekend contract zelf kan rekenen in plaats van iemand met het
   Word-document erbij.

   PRIVACY: dit hele blok — en élke euro en élk percentage erin —
   staat achter CRM.magOpbrengstZien(). Zonder rechten wordt de kaart niet
   getekend, niets opgehaald en niets berekend. Wat een AM wél moet
   zien (welke velden er nog ontbreken) komt uit
   CRM.fee.watMist(), en dat is bewust bedrag- en percentageloos.
   ═══════════════════════════════════════════════════════════════ */
const feeAan = () => CRM.magOpbrengstZien() && !!CRM.fee;

function afspraakBlokHtml(){
  if(!feeAan()) return '';
  return `<div class="card kl-railkaart kl-r-af" id="af_kaart">
    <div class="card-h"><div class="h2">Commerciële afspraken</div><span class="spacer"></span>
      <button class="btn sub sm" id="af_beheer">Beheren</button></div>
    <div class="card-b" id="af_body"></div></div>`;
}

/* Alle afspraken van deze klant, nieuwste ingangsdatum eerst. */
function afsprakenVan(naam){
  if(!feeAan()) return [];
  const n = String(naam||'').trim().toLowerCase();
  return (CRM.state.afspraken || [])
    .filter(a => String(a.klant||'').trim().toLowerCase() === n)
    .slice().sort((x,y) => String(y.ingang||y.created_at||'').localeCompare(String(x.ingang||x.created_at||'')));
}
const soortLbl = k => (CRM.fee.SOORTEN.find(s => s.k === k) || {lbl:k||'—'}).lbl;
const garantieLbl = k => (CRM.fee.GARANTIESOORTEN.find(s => s.k === k) || {lbl:k||'—'}).lbl;
const factuurLbl = k => (CRM.fee.FACTUURMOMENTEN.find(s => s.k === k) || {lbl:k||'—'}).lbl;
/* "23%" of "20 – 25%" — één regel die het tariefbeeld samenvat. */
function feeBereik(a){
  const p = a.fee_regels.map(r => r.pct).filter(x => x != null);
  if(a.fee_standaard != null) p.push(a.fee_standaard);
  if(!p.length) return '';
  const min = Math.min(...p), max = Math.max(...p);
  return min === max ? CRM.pct(min, min % 1 ? 1 : 0)
    : CRM.pct(min, min % 1 ? 1 : 0) + ' – ' + CRM.pct(max, max % 1 ? 1 : 0);
}
function looptijdTekst(a){
  if(!a.ingang && !a.einde) return 'Zonder einddatum';
  if(a.ingang && a.einde) return CRM.fmtDate(a.ingang) + ' – ' + CRM.fmtDate(a.einde);
  return a.ingang ? 'Vanaf ' + CRM.fmtDate(a.ingang) : 'Tot ' + CRM.fmtDate(a.einde);
}

function railAfspraak(mount, k){
  if(!feeAan()) return;
  const body = mount.querySelector('#af_body'); if(!body) return;
  const beheer = mount.querySelector('#af_beheer');
  if(beheer) beheer.onclick = () => afspraakDrawer(k);

  const alle = afsprakenVan(k.naam);
  const huidig = CRM.fee.voorKlant(k.naam);
  if(!huidig){
    body.innerHTML = (_afsprTabelMist
        ? '<div class="note warn kl-af-note">De tabel <code>crm_afspraken</code> bestaat nog niet — draai eerst supabase/schema.sql.</div>'
        : '<p class="meta kl-af-leeg">Nog niets vastgelegd. Zonder afspraak kan het systeem na een getekend contract niet zelf rekenen.</p>')
      + `<button class="btn ghost sm kl-railknop" id="af_nieuw">+ Afspraak vastleggen</button>`;
    const nw = body.querySelector('#af_nieuw');
    if(nw) nw.onclick = () => afspraakDrawer(k, null, true);
    return;
  }

  const a = CRM.fee.normaliseer(huidig);
  const rij = (lbl, val) => `<div class="kl-gg-rij"><span class="kl-gg-lbl">${h(lbl)}</span>
    <span class="kl-gg-val trunc">${val || '<span class="meta">—</span>'}</span></div>`;
  const bereik = feeBereik(a);
  const verlopen = !CRM.fee.geldigOp(huidig, CRM.todayISO()) || !a.actief;
  const ouder = alle.length - 1;

  body.innerHTML = `
    ${verlopen ? '<div class="note warn kl-af-note">Deze afspraak loopt vandaag niet — leg de nieuwe voorwaarden vast.</div>' : ''}
    <div class="kl-gg">
      ${rij('Dienstverlening', h(soortLbl(a.soort)))}
      ${rij('Fee', bereik ? `<span class="num">${h(bereik)}</span>` : '')}
      ${rij('Functiegroepen', a.fee_regels.length ? `<span class="num">${a.fee_regels.length}</span>` : '<span class="meta">alleen standaard</span>')}
      ${rij('Factuurmoment', h(factuurLbl(a.factuurmoment)))}
      ${rij('Betaaltermijn', `<span class="num">${a.betaaltermijn}</span> dagen`)}
      ${rij('Garantie', a.garantie_soort === 'geen' ? h(garantieLbl(a.garantie_soort))
          : `<span class="num">${a.garantie_mnd}</span> mnd · ${h(garantieLbl(a.garantie_soort))}`)}
      ${rij('Exclusiviteit', a.exclusiviteit_wkn != null ? `<span class="num">${a.exclusiviteit_wkn}</span> wkn` : '')}
      ${rij('Looptijd', h(looptijdTekst(a)))}
    </div>
    ${ouder > 0 ? `<p class="meta kl-af-ouder">${ouder} eerdere afspraak${ouder===1?'':'en'} in het archief</p>` : ''}`;
}

/* ─── Beheerpaneel: formulier + voorbeeldberekening + historie ──── */
function afspraakDrawer(k, id, nieuw){
  if(!feeAan()) return;
  const alle = afsprakenVan(k.naam);
  const huidig = id ? alle.find(a => String(a.id) === String(id))
                    : (nieuw ? null : (CRM.fee.voorKlant(k.naam) || alle[0] || null));
  const bestaat = !!huidig;
  /* Op een kopie werken: annuleren mag niets veranderd hebben. */
  const a = huidig ? JSON.parse(JSON.stringify(huidig)) : CRM.fee.leegAfspraak(k.naam);
  a.klant = k.naam;
  if(!Array.isArray(a.fee_regels)) a.fee_regels = [];
  if(!a.grondslag || typeof a.grondslag !== 'object') a.grondslag = {};
  const g = a.grondslag;
  const nr = v => v == null || v === '' ? '' : h(String(v));

  const opt = (lijst, gekozen) => lijst.map(s =>
    `<option value="${h(s.k)}"${s.k === gekozen ? ' selected' : ''}>${h(s.lbl)}</option>`).join('');

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="min-width:0;flex:1">
        <div class="h2" style="font-size:17px">Commerciële afspraken</div>
        <div class="meta" style="margin-top:3px">${h(k.naam)}${bestaat ? '' : ' · nieuwe afspraak'}</div>
      </div>
      <button class="btn ghost sm x" data-close>Sluiten</button>
    </div>
    <div class="drawer-b">
      <p class="sub kl-af-intro">Wat hier staat, gebruikt het systeem om na een getekend contract
        zelf de fee te berekenen. De grondslag volgt de tekst van de samenwerkingsovereenkomst.</p>

      <div class="card kl-af-sec"><div class="card-h"><div class="h2">Dienstverlening en looptijd</div></div>
        <div class="card-b"><div class="f-grid">
          <div class="f-row"><label for="af_soort">Soort dienstverlening</label>
            <select id="af_soort">${opt(CRM.fee.SOORTEN, a.soort || 'ws')}</select></div>
          <div class="f-row"><label for="af_ingang">Ingangsdatum</label>
            <input type="date" id="af_ingang" value="${nr(String(a.ingang||'').slice(0,10))}"></div>
          <div class="f-row"><label for="af_einde">Einddatum <span class="meta">(leeg = doorlopend)</span></label>
            <input type="date" id="af_einde" value="${nr(String(a.einde||'').slice(0,10))}"></div>
          <div class="f-row"><label for="af_excl">Exclusiviteit (weken)</label>
            <input type="number" id="af_excl" min="0" step="1" value="${nr(a.exclusiviteit_wkn)}"></div>
        </div>
        <label class="check"><input type="checkbox" id="af_actief"${a.actief === false ? '' : ' checked'}> Deze afspraak is actief</label>
        </div></div>

      <div class="card kl-af-sec"><div class="card-h"><div class="h2">Fee per functiegroep</div><span class="spacer"></span>
          <button class="btn sub sm" id="af_regel_add">+ Regel</button></div>
        <div class="card-b">
          <div id="af_regels" class="kl-af-regels"></div>
          <div class="f-row kl-af-std"><label for="af_std">Standaardpercentage <span class="meta">(als geen functiegroep past)</span></label>
            <input type="number" id="af_std" min="0" max="100" step="0.1" value="${nr(a.fee_standaard)}"></div>
        </div></div>

      <div class="card kl-af-sec"><div class="card-h"><div class="h2">Grondslag</div></div>
        <div class="card-b">
          <p class="meta kl-af-uitleg">Volgens de overeenkomst: twaalf maal het bruto maandsalaris, vakantiegeld,
            een vaste dertiende maand of eindejaarsuitkering en vaste ploegen- of functietoeslagen.
            Variabele bonussen, overwerk en onkostenvergoedingen tellen niet mee.</p>
          <div class="f-grid">
            <div class="f-row"><label for="af_mnd">Aantal maandsalarissen</label>
              <input type="number" id="af_mnd" min="1" max="24" step="1" value="${nr(g.maanden != null ? g.maanden : 12)}"></div>
            <div class="f-row"><label for="af_vt">Vakantiegeld (%) <span class="meta">(leeg = volg de kandidaat)</span></label>
              <input type="number" id="af_vt" min="0" max="100" step="0.01" value="${nr(g.vt_pct != null ? g.vt_pct : 8)}"></div>
          </div>
          <label class="check"><input type="checkbox" id="af_g_tos"${g.toeslag === false ? '' : ' checked'}> Vaste ploegen- of functietoeslagen tellen mee</label>
          <label class="check"><input type="checkbox" id="af_g_eju"${g.eju === false ? '' : ' checked'}> Vaste dertiende maand of eindejaarsuitkering telt mee</label>
          <label class="check"><input type="checkbox" id="af_g_ovg"${g.overig === false ? '' : ' checked'}> Overige vaste, structurele toeslagen tellen mee</label>
        </div></div>

      <div class="card kl-af-sec"><div class="card-h"><div class="h2">Facturatie en garantie</div></div>
        <div class="card-b"><div class="f-grid">
          <div class="f-row"><label for="af_fm">Factuurmoment</label>
            <select id="af_fm">${opt(CRM.fee.FACTUURMOMENTEN, a.factuurmoment || 'contract')}</select></div>
          <div class="f-row"><label for="af_bt">Betaaltermijn (dagen)</label>
            <input type="number" id="af_bt" min="0" max="180" step="1" value="${nr(a.betaaltermijn != null ? a.betaaltermijn : 30)}"></div>
          <div class="f-row"><label for="af_gs">Garantieregeling</label>
            <select id="af_gs">${opt(CRM.fee.GARANTIESOORTEN, a.garantie_soort || 'vervanging')}</select></div>
          <div class="f-row"><label for="af_gm">Garantieduur (maanden)</label>
            <input type="number" id="af_gm" min="0" max="24" step="1" value="${nr(a.garantie_mnd != null ? a.garantie_mnd : 2)}"></div>
        </div>
        <div class="f-row"><label for="af_note">Notitie <span class="meta">(afwijkingen, wie akkoord gaf)</span></label>
          <textarea id="af_note" rows="2">${h(a.notitie||'')}</textarea></div>
        </div></div>

      <div class="card kl-af-sec kl-af-vb"><div class="card-h"><div class="h2">Voorbeeldberekening</div></div>
        <div class="card-b">
          <p class="meta kl-af-uitleg">Vul een maandloon in en zie meteen wat de grondslag en de fee worden —
            zo merk je een verkeerd ingevulde afspraak nu, niet bij de eerste plaatsing.</p>
          <div class="f-grid kl-af-vbin">
            <div class="f-row"><label for="vb_loon">Bruto maandsalaris</label>
              <input type="number" id="vb_loon" min="0" step="50" value="2960"></div>
            <div class="f-row"><label for="vb_functie">Functie</label>
              <input type="text" id="vb_functie" value="${h((a.fee_regels[0] && (a.fee_regels[0].functiegroep||'')) || '')}" placeholder="Bijv. Procesoperator"></div>
            <div class="f-row"><label for="vb_tos">Ploegentoeslag (%)</label>
              <input type="number" id="vb_tos" min="0" max="100" step="0.5" value="15"></div>
            <div class="f-row"><label for="vb_eju">Dertiende maand (%)</label>
              <input type="number" id="vb_eju" min="0" max="100" step="0.01" value="8.33"></div>
          </div>
          <div id="vb_uit"></div>
        </div></div>

      <div class="card kl-af-sec"><div class="card-h"><div class="h2">Eerdere afspraken</div></div>
        <div class="card-b" id="af_hist"></div></div>
    </div>
    <div class="drawer-f">
      ${bestaat ? '<button class="btn sub" id="af_weg">Verwijderen</button>' : ''}
      <span class="spacer"></span>
      <button class="btn ghost" data-close>Annuleren</button>
      <button class="btn" id="af_ok">Opslaan</button>
    </div>`, {onOpen(dr){

      /* ── Fee-regels: rijen toevoegen en verwijderen ───────────── */
      const regelsEl = dr.querySelector('#af_regels');
      const tekenRegels = () => {
        regelsEl.innerHTML = a.fee_regels.length ? a.fee_regels.map((r,i) => `
          <div class="kl-af-regel">
            <input type="text" data-rf="${i}" value="${h(r.functiegroep || r.functie || '')}" placeholder="Functiegroep, bijv. Operator (verlading en proces)">
            <input type="number" data-rp="${i}" min="0" max="100" step="0.1" value="${nr(r.pct)}" placeholder="%">
            <button class="btn sub sm" data-rweg="${i}" title="Regel verwijderen" aria-label="Regel verwijderen">×</button>
          </div>`).join('')
          : '<p class="meta kl-af-leeg">Nog geen functiegroepen — dan geldt het standaardpercentage voor alles.</p>';
        regelsEl.querySelectorAll('[data-rf]').forEach(inp => inp.oninput = () => {
          a.fee_regels[+inp.dataset.rf].functiegroep = inp.value; traag();
        });
        regelsEl.querySelectorAll('[data-rp]').forEach(inp => inp.oninput = () => {
          a.fee_regels[+inp.dataset.rp].pct = inp.value === '' ? null : Number(inp.value); traag();
        });
        regelsEl.querySelectorAll('[data-rweg]').forEach(b => b.onclick = () => {
          a.fee_regels.splice(+b.dataset.rweg, 1); tekenRegels(); voorbeeld();
        });
      };
      dr.querySelector('#af_regel_add').onclick = () => {
        a.fee_regels.push({functiegroep:'', pct:a.fee_standaard != null ? a.fee_standaard : 23});
        tekenRegels(); voorbeeld();
      };

      /* ── Formulier terug in het object ────────────────────────── */
      const v = sel => dr.querySelector(sel);
      const num = sel => { const x = v(sel).value; return x === '' ? null : Number(x); };
      function lees(){
        a.soort = v('#af_soort').value;
        a.ingang = v('#af_ingang').value || null;
        a.einde  = v('#af_einde').value || null;
        a.exclusiviteit_wkn = num('#af_excl');
        a.actief = v('#af_actief').checked;
        a.fee_standaard = num('#af_std');
        a.grondslag = {
          maanden: num('#af_mnd') || 12,
          vt_pct:  num('#af_vt'),
          toeslag: v('#af_g_tos').checked,
          eju:     v('#af_g_eju').checked,
          overig:  v('#af_g_ovg').checked
        };
        a.factuurmoment  = v('#af_fm').value;
        a.betaaltermijn  = num('#af_bt') != null ? num('#af_bt') : 30;
        a.garantie_soort = v('#af_gs').value;
        a.garantie_mnd   = num('#af_gm') != null ? num('#af_gm') : 0;
        a.notitie        = v('#af_note').value.trim();
        a.fee_regels     = a.fee_regels
          .map(r => ({functiegroep:String(r.functiegroep || r.functie || '').trim(), pct:r.pct == null || r.pct === '' ? null : Number(r.pct)}));
      }

      /* ── Voorbeeldberekening ──────────────────────────────────── */
      function voorbeeld(){
        lees();
        const vandaag = CRM.todayISO();
        const proef = {
          naam:'Voorbeeld', klant:k.naam, functie:v('#vb_functie').value.trim(),
          maandloon: num('#vb_loon'), toeslagPct: num('#vb_tos'),
          vtPct: null, ejuPct: num('#vb_eju'), overigPct: 0,
          geplaatstOp: vandaag, start: vandaag
        };
        const r = CRM.fee.bereken(proef, a);
        const uit = dr.querySelector('#vb_uit');
        if(!r.grondslag.compleet){
          uit.innerHTML = '<p class="meta kl-af-leeg">Vul een bruto maandsalaris in om de berekening te zien.</p>';
          return;
        }
        const regels = r.grondslag.opbouw.map(o => `<tr><td>${h(o.label)}${
            o.pct ? ` <span class="meta num">${h(CRM.pct(o.pct, o.pct % 1 ? 2 : 0))}</span>` : ''}</td>
          <td class="num n">${h(CRM.euro(o.bedrag))}</td></tr>`).join('');
        const buiten = r.grondslag.buiten.map(b =>
          `<tr class="kl-af-buiten"><td>${h(b.label)} <span class="meta">${h(b.reden)}</span></td><td class="num n">—</td></tr>`).join('');
        uit.innerHTML = `
          <div class="tblwrap"><table class="tbl kl-af-tbl">
            <tbody>${regels}${buiten}</tbody>
            <tfoot>
              <tr class="kl-af-tot"><td>Grondslag (bruto jaarsalaris)</td><td class="num n">${h(CRM.euro(r.grondslag.jaarSalaris))}</td></tr>
              <tr class="kl-af-fee"><td>Fee${r.pct != null ? ` <span class="num">${h(CRM.pct(r.pct, r.pct % 1 ? 1 : 0))}</span>` : ''}</td>
                <td class="num n">${r.fee != null ? h(CRM.euro(r.fee)) : '—'}</td></tr>
            </tfoot>
          </table></div>
          <p class="meta kl-af-waarom">${h(r.uitleg)}</p>
          <p class="meta kl-af-waarom">Factuur ${h(String(factuurLbl(r.factuurmoment)).toLowerCase())} · betaaltermijn
            <span class="num">${r.betaaltermijn}</span> dagen${r.vervaldatum ? ' · vervalt ' + h(CRM.fmtDate(r.vervaldatum)) : ''}${
            r.garantieTot ? ' · garantie tot ' + h(CRM.fmtDate(r.garantieTot)) : ''}</p>
          ${r.waarschuwingen.map(w => `<div class="note warn kl-af-note">${h(w)}</div>`).join('')}`;
      }
      const traag = CRM.debounce(voorbeeld, 220);

      dr.querySelectorAll('.drawer-b input, .drawer-b select, .drawer-b textarea')
        .forEach(el => { el.oninput = traag; el.onchange = voorbeeld; });

      /* ── Historie ─────────────────────────────────────────────── */
      const hist = dr.querySelector('#af_hist');
      const andere = alle.filter(x => String(x.id) !== String(a.id));
      hist.innerHTML = andere.length ? `<div class="kl-af-hist">${andere.map(x => {
        const n = CRM.fee.normaliseer(x);
        const loopt = n.actief && CRM.fee.geldigOp(x, CRM.todayISO());
        const bereik = feeBereik(n);
        return `<div class="kl-af-hrij">
          <div style="min-width:0">
            <b class="trunc">${h(soortLbl(n.soort))}${bereik ? ' · ' : ''}<span class="num">${h(bereik)}</span></b>
            <div class="meta num">${h(looptijdTekst(n))}${n.door ? ' · ' + h(n.door) : ''}</div>
          </div>
          <span class="spacer"></span>
          ${loopt ? '<span class="chip green">Loopt</span>' : '<span class="chip">Afgelopen</span>'}
          <button class="btn sub sm" data-open="${h(String(x.id))}">Openen</button>
        </div>`;
      }).join('')}</div>` : '<p class="meta kl-af-leeg">Dit is de eerste vastgelegde afspraak met deze klant.</p>';
      hist.querySelectorAll('[data-open]').forEach(b => b.onclick = () => afspraakDrawer(k, b.dataset.open));

      /* ── Opslaan / verwijderen ────────────────────────────────── */
      dr.querySelector('#af_ok').onclick = async () => {
        lees();
        a.fee_regels = a.fee_regels.filter(r => r.functiegroep || r.pct != null);
        if(a.fee_standaard == null && !a.fee_regels.some(r => r.pct != null))
          return CRM.toast('Vul minstens één percentage in','err');
        if(a.ingang && a.einde && a.einde < a.ingang)
          return CRM.toast('De einddatum ligt vóór de ingangsdatum','err');
        if(!a.door) a.door = CRM.me();
        CRM.drawer.close();
        await bewaarAfspraak(Object.assign({}, a), bestaat);
        CRM.logActiviteit('klant', k.naam, 'systeem',
          bestaat ? 'Commerciële afspraak bijgewerkt' : 'Commerciële afspraak vastgelegd');
        CRM.render();
      };
      const weg = dr.querySelector('#af_weg');
      if(weg) weg.onclick = async () => {
        if(!await CRM.bevestig('Afspraak verwijderen?', 'De vastgelegde voorwaarden voor ' + k.naam + ' verdwijnen.')) return;
        CRM.drawer.close();
        await verwijderAfspraak(a.id);
        CRM.render();
      };

      tekenRegels();
      voorbeeld();
    }});
}

/* ─── Rail: contactpersonen — altijd in beeld naast de tabs ────── */
function contactBlokHtml(){
  return `<div class="card kl-railkaart kl-r-ct">
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
  return `<div class="card kl-railkaart kl-r-tk">
    <div class="card-h"><div class="h2">Open taken</div><span class="spacer"></span>
      <button class="btn sm" id="rt_nieuw">+ Taak</button></div>
    <div class="card-b" id="rt_lijst"></div></div>`;
}

/* ─── Rail: notities — het gezamenlijke geheugen van de relatie ── */
function notitiesBlokHtml(){
  return `<div class="card kl-railkaart kl-r-nt">
    <div class="card-h"><div class="h2">Notities</div></div>
    <div class="card-b">
      <!-- Wat er al staat, komt eerst. Het invoerveld stond bovenaan en de
           notities eronder, dus je zag als eerste een leeg vak in plaats van
           wat een collega had opgeschreven. Bij een klant waar Tjerk en
           Rajesh allebei aan werken is dat precies het verkeerde om: je wilt
           lézen voordat je schrijft. (Tjeerd, 3 aug 2026: "notities moeten
           meteen te zien zijn, ook als andere AM's erin hebben gewerkt.") -->
      <div id="rn_lijst"></div>
      <div class="f-row kl-ntinvoer">
        <textarea id="rn_tekst" rows="2" placeholder="Korte notitie… (@naam meldt een collega)"></textarea>
        <button class="btn sm" id="rn_opslaan" style="align-self:flex-end">Opslaan</button>
      </div>
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

/* Wie is er deze maand jarig bij deze klant? Dát is het moment waarop een AM
   belt — daarom staat het boven de contactpersonenlijst en niet weggestopt in
   een dossier. Alleen dag en maand; het jaartal blijft in de database.
   Staat de kolom nog niet in de database, dan komt hier niets: dan hoort er
   ook niets te staan. Geen enkele verjaardag deze maand → geen blok (de lege
   staat van de lijst eronder vertelt de rest). */
function jarigBlokHtml(contacten){
  if(!heeftGeboortedatum()) return '';
  const vandaag = CRM.todayISO();
  const maandNu = vandaag.slice(5,7), dagNu = vandaag.slice(8,10);
  const rij = contacten
    .map(c => ({c, md: mmdd(c.geboortedatum)}))
    .filter(x => x.md.slice(0,2) === maandNu)
    .sort((a,b) => a.md.localeCompare(b.md) || String(a.c.naam).localeCompare(String(b.c.naam),'nl'));
  if(!rij.length) return '';
  return `<div class="kl-jarig">
    <span class="kl-jarig-kop">Jarig deze maand</span>
    ${rij.map(({c, md}) => {
      const dag = md.slice(3);
      const wanneer = dag === dagNu ? 'vandaag'
        : (dag < dagNu ? 'was ' : '') + dagMaand(c.geboortedatum);
      return `<div class="kl-jarig-rij${dag === dagNu ? ' nu' : ''}" data-ct="${h(c.id)}"
        title="Open het dossier van ${h(c.naam)}">
        <b class="trunc">${h(c.naam)}</b><span class="num">${h(wanneer)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function contactLijst(el, k){
  if(!el) return;
  const q = contactZoek.trim().toLowerCase();
  const alle = contactenVan(k.naam).slice()
    .sort((a,b) => (b.hoofd?1:0) - (a.hoofd?1:0) || String(a.naam).localeCompare(String(b.naam),'nl'));
  const rij = q ? alle.filter(x => (String(x.naam)+' '+String(x.functie||'')).toLowerCase().includes(q)) : alle;
  /* Boven de lijst, dus ook zichtbaar als het zoekveld de jarige wegfiltert
     of de lijst mobiel is ingeklapt. */
  const jarig = jarigBlokHtml(alle);

  /* Zoekveld alleen tonen als er iets te zoeken valt — bij nul of twee
     contactpersonen is het een dood bedieningselement in een smalle rail. */
  const zoekBox = document.querySelector('.kl-r-ct .kl-ctzoek');
  if(zoekBox) zoekBox.hidden = alle.length < 4 && !q;

  if(!alle.length){
    el.innerHTML = CRM.ui.leeg('Nog geen contactpersonen','Leg vast met wie je bij deze klant schakelt.');
    return;
  }
  if(!rij.length){
    el.innerHTML = jarig + CRM.ui.leeg('Geen contactpersoon gevonden','Probeer een ander zoekwoord.');
    el.querySelectorAll('[data-ct]').forEach(r => r.onclick = () => contactDrawer(k, r.dataset.ct));
    return;
  }
  /* Mobiel: ingeklapt tot de eerste drie, met "toon alle". */
  const mobiel = window.matchMedia && window.matchMedia('(max-width:900px)').matches;
  const inklappen = mobiel && !contactAlles && !q && rij.length > 3;
  const toon = inklappen ? rij.slice(0,3) : rij;
  el.innerHTML = jarig + `<div class="kl-contacten">${toon.map(x => {
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
  /* Verjaardag: alleen dag en maand, en alleen als de kolom er is én iemand
     hem heeft ingevuld. Vandaag jarig krijgt een chip, want dan bel je nú. */
  const jarigOp = heeftGeboortedatum() ? dagMaand(ct.geboortedatum) : '';
  const jarigNu = !!jarigOp && mmdd(ct.geboortedatum) === CRM.todayISO().slice(5);
  const links = [
    ct.telefoon ? `<a class="num" href="tel:${h(String(ct.telefoon).replace(/\s/g,''))}">${h(ct.telefoon)}</a>` : '',
    ct.email    ? `<a href="mailto:${h(ct.email)}">${h(ct.email)}</a>` : '',
    veiligeUrl(ct.linkedin) ? `<a href="${h(veiligeUrl(ct.linkedin))}" target="_blank" rel="noopener">LinkedIn</a>` : ''
  ].filter(Boolean).join('<span class="kl-sep">·</span>');

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="min-width:0;flex:1">
        <div class="row tight" style="gap:10px"><div class="h2" style="font-size:17px">${h(ct.naam)}</div>
          ${ct.hoofd?'<span class="chip green">Hoofdcontact</span>':''}
          ${jarigNu?'<span class="chip green">Jarig vandaag</span>':''}</div>
        <div class="meta" style="margin-top:3px">${h([ct.functie, k.naam].filter(Boolean).join(' · '))}${
          jarigOp && !jarigNu ? ` · jarig op <span class="num">${h(jarigOp)}</span>` : ''}</div>
        ${links ? `<div class="kl-contact">${links}</div>` : '<div class="kl-contact meta">Nog geen contactgegevens</div>'}
      </div>
      <button class="btn ghost sm x" data-close>Sluiten</button>
    </div>
    <div class="drawer-b">
      <div class="row tight" style="margin-bottom:18px">
        <button class="btn ghost sm" id="cd_notitie">Notitie</button>
        <button class="btn ghost sm" id="cd_verslag">Gespreksverslag</button>
        ${ct.email ? '<button class="btn ghost sm" id="cd_mail">Mailen</button>' : ''}
        ${outlookAan() && (ct.email || ct.telefoon)
          ? '<button class="btn ghost sm" id="cd_outlook" title="Zet deze persoon in je Outlook-adresboek, dan ziet je telefoon wie er belt">Naar Outlook</button>' : ''}
        <button class="btn ghost sm" id="cd_plan">Inplannen</button>
        <button class="btn sm" id="cd_taak">+ Taak</button>
        <span class="spacer"></span>
        <button class="btn sub sm" id="cd_bewerk">Bewerken</button>
      </div>
      ${ct.note ? `<div class="note info" style="margin-bottom:16px">${h(ct.note)}</div>` : ''}
      <div class="label" style="margin-bottom:10px">Notities & gespreksverslagen</div>
      ${CRM.ui.tijdlijn(items)}
      ${CRM.mailUI.blokHtml(ct.email, 'cd_mailblok')}
    </div>`, {onOpen(dr){
      /* Mail pas ophalen nu de drawer echt openstaat — nooit in de lijst. */
      CRM.mailUI.laad(dr, ct.email, 'cd_mailblok');
      const mailKnop = dr.querySelector('#cd_mail');
      if(mailKnop) mailKnop.onclick = () => mailAanContact(k, ct);
      const olKnop = dr.querySelector('#cd_outlook');
      if(olKnop) olKnop.onclick = () => CRM.naarOutlook(olKnop, {
        naam: ct.naam, email: ct.email, telefoon: ct.telefoon,
        bedrijf: k.naam, functie: ct.functie
      });
      /* Het mailadres in de kop opent hetzelfde venster (of blijft mailto). */
      CRM.mailUI.bindLinks(dr.querySelector('.drawer-h'), mailOptiesContact(k, ct));
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
      /* Inplannen mét deze persoon al aangevinkt. */
      dr.querySelector('#cd_plan').onclick = () => planModal(k, {
        contactIds:[ct.id], titel:`Gesprek — ${ct.naam} (${k.naam})`,
        na(){ contactLijstVerversen(k); }
      });
      dr.querySelector('#cd_taak').onclick = () => {
        CRM.taakModal({entiteit:'klant', ref:k.naam, refLabel:`${ct.naam} (${k.naam})`});
      };
      dr.querySelector('#cd_bewerk').onclick = () =>
        contactModal(k, ct, verwijderd => { if(verwijderd) CRM.drawer.close(); else contactDrawer(k, ct.id); });
    }});
}

/* Mailen met een contactpersoon: met Outlook-koppeling een opstelvenster,
   zonder koppeling gewoon mailto. Na versturen wordt het gesprek gelogd en
   ververst de drawer (en dus ook het mailblok). */
function mailOptiesContact(k, ct){
  return {
    aan: ct.email || '',
    wie: `${ct.naam} — ${k.naam}`,
    set: 'klant',
    ctx: { voornaam: voornaamVan(ct.naam), klant: k.naam },
    entiteit: 'contact', ref: String(ct.id),
    na(){ contactLijstVerversen(k); contactDrawer(k, ct.id); }
  };
}
function mailAanContact(k, ct){ CRM.mailUI.opstellen(mailOptiesContact(k, ct)); }

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
  const jarig = heeftGeboortedatum();
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${ct?'Contactpersoon bewerken':'Nieuwe contactpersoon'}</div></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Naam</label><input type="text" id="c_naam" value="${h(n.naam)}"></div>
        <div class="f-row"><label>Functie</label><input type="text" id="c_functie" value="${h(n.functie)}"></div>
        <div class="f-row"><label>Telefoon</label><input type="tel" id="c_tel" value="${h(n.telefoon)}"></div>
        <div class="f-row"><label>E-mail</label><input type="email" id="c_mail" value="${h(n.email)}"></div>
        ${jarig ? `<div class="f-row"><label for="c_gb">Geboortedatum</label>
          <input type="date" id="c_gb" value="${h(String(n.geboortedatum||'').slice(0,10))}">
          <span class="hint">Alleen dag en maand komen in beeld — nooit het jaartal of de leeftijd.</span></div>` : ''}
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
        /* Geboortedatum alleen meesturen als de kolom bestaat; anders sneuvelt
           de hele update en kan er niets meer aan deze persoon gewijzigd
           worden. Leeg veld = leegmaken, dus expliciet null. */
        if(jarig) rij.geboortedatum = m.querySelector('#c_gb').value || null;
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

/* ═══════════════════════════════════════════════════════════════
   VOOR HET DASHBOARD: wie is er jarig?

   CRM.contactVerjaardagen(datum, dagen) → [{contact, klant, eigenaar,
                                             wanneer, dagen, dagMaand}]

   • datum   ISO 'YYYY-MM-DD'; leeg of ongeldig = vandaag.
   • dagen   hoeveel dagen je vooruit kijkt, 0 (standaard) = alleen die dag.
   • wanneer de verjaardag in het jáár van de vraag ('2026-08-12') — nooit
             het geboortejaar. dagMaand is de kant-en-klare weergave ('12 aug')
             zodat een aanroeper de ruwe datum niet hoeft aan te raken.
   • contact bevat alléén wat je nodig hebt om te feliciteren
             ({id, naam, functie, telefoon, email}) — bewust zónder
             geboortedatum, zodat het geboortejaar deze module niet verlaat.

   Let op: bij een 29-februari-kind in een gewoon jaar is `wanneer` de 28e
   (dán zet je de taak) terwijl `dagMaand` '29 feb' blijft — dat is zijn
   verjaardag, en zo staat het ook op de klantkaart.

   Gesorteerd op datum, daarbinnen op naam. Bestaat de kolom nog niet in de
   database, dan heeft geen enkele rij een geboortedatum en komt er netjes
   een lege lijst uit — de aanroeper hoeft daar niets voor te doen. */
CRM.contactVerjaardagen = function(datum, dagen){
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(datum||'')) ? String(datum) : CRM.todayISO();
  const venster = Math.max(0, Math.min(366, Math.floor(Number(dagen)) || 0));
  const jarigen = (CRM.state.contacten || []).filter(c => mmdd(c.geboortedatum));
  const uit = [];
  if(!jarigen.length) return uit;
  const [jr, mnd, dg] = start.split('-').map(Number);
  for(let i = 0; i <= venster; i++){
    const d = new Date(jr, mnd - 1, dg + i);
    const iso = isoVan(d), md = iso.slice(5);
    const opDag = jarigen.filter(c => {
      const g = mmdd(c.geboortedatum);
      /* 29 februari: in een gewoon jaar vieren we hem op de 28e, anders zou
         die persoon drie jaar op vier van de lijst vallen. */
      return g === md || (g === '02-29' && md === '02-28' && !schrikkeljaar(d.getFullYear()));
    }).sort((a,b) => String(a.naam).localeCompare(String(b.naam),'nl'));
    for(const c of opDag){
      const kl = CRM.klant(c.klant);
      uit.push({
        contact: {id:c.id, naam:c.naam || '', functie:c.functie || '',
                  telefoon:c.telefoon || '', email:c.email || ''},
        klant: c.klant || '',
        eigenaar: (kl && kl.eigenaar) || '',
        wanneer: iso, dagen: i, dagMaand: dagMaand(c.geboortedatum)
      });
    }
  }
  return uit;
};

/* ─── Signalen — alleen tonen wat echt speelt ─────────────────── */
function signalenHtml(k, c, lc){
  const s = [];
  const d = CRM.dagenGeleden(lc);
  if(d == null)   s.push('Er is nog nooit contact vastgelegd bij deze klant.');
  else if(d > 30) s.push(`Al <b class="num">${d}</b> dagen geen contact — tijd voor een belletje.`);

  /* Oude vacatures samen in één regel: een klant met acht stilstaande
     vacatures kreeg anders acht losse bullets en dan leest niemand het. */
  const oud = c.open.map(v => ({v, dg: CRM.dagenGeleden(v.aangemaakt)}))
    .filter(x => x.dg != null && x.dg > 30).sort((a,b) => b.dg - a.dg);
  if(oud.length === 1)
    s.push(`Vacature <b>${h(oud[0].v.functie)}</b> staat <b class="num">${oud[0].dg}</b> dagen open.`);
  else if(oud.length > 1)
    s.push(`<b class="num">${oud.length}</b> vacatures staan langer dan 30 dagen open — langste: <b>${h(oud[0].v.functie)}</b> (<b class="num">${oud[0].dg}</b> dagen).`);

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
    /* Deze tab was de enige zonder teller (stond hard op 0). Daardoor moest
       je hem openklikken om te zien of er íets was vastgelegd, terwijl het
       detailpaneel in Sales die teller wél laat zien. */
    ['activiteiten','Activiteiten & notities',
      acts.length + (CRM.state.contacten||[]).filter(x => x.klant === k.naam)
        .reduce((n,ct) => n + CRM.activiteitenVoor('contact', ct.id).length, 0)],
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
/* ─── O&O-sessies van deze klant ──────────────────────────────────
   Een sessie hoort bij de klánt, niet bij één vacature: er zitten geregeld
   kandidaten voor meerdere functies in dezelfde sessie. De knop stond eerst
   boven het bord Klanttrajecten (waar je niets hoort aan te maken) en daarna
   even op de vacature (te smal). Hier hoort hij.

   Welke functies een sessie beslaat leiden we af uit wie erin zit, niet uit
   een veld. Zo kan het label nooit iets anders zeggen dan de werkelijkheid,
   en werkt "meerdere functies in één sessie" zonder databasewijziging.
   (Tjeerd, 2 aug 2026: "via de klantenkaart kan ik matchen voor welke
   vacature(s) we de O&O sessie doen, soms meerdere functies in 1 sessie".) */
function ooBlokHtml(k){
  const D = CRM._rcDeel || {};
  if(!D.ooSessies || !D.ooModal) return '';
  /* Alleen bij een relatie waar ook echt iets loopt. Bij een lead of prospect
     staat er geen vacature en geen kandidaat, en dan is een lege
     O&O-sectie ("nog geen sessies") ruis op een kaart die juist over
     acquisitie gaat. Hij verschijnt zodra er een vacature is, of zodra er al
     een sessie voor deze klant bestaat. (Tjeerd, 3 aug 2026: "O&O sessie mag
     weg in de kaart" — bij een lead, waar hij niets toevoegt.) */
  const heeftVacature = (CRM.state.vacs||[]).some(v => v.klant === k.naam);
  const heeftSessie   = D.ooSessies().some(s => s.klant === k.naam);
  if(!heeftVacature && !heeftSessie) return '';
  const vandaag = CRM.todayISO();
  const sessies = D.ooSessies()
    .filter(s => s.klant === k.naam)
    .sort((a,b) => String(a.datum||'').localeCompare(String(b.datum||'')));
  const komend = sessies.filter(s => !s.datum || s.datum >= vandaag);
  /* NIET D.sessLeden(): die telt alleen wie op dit moment op fase 'O&O sessie'
     staat. Dat is de goede maat bij het plannen ("zitten er al vier in?"),
     maar niet hier: zodra de sessie is geweest schuift iedereen door naar
     Eerste gesprek en zou een geslaagde sessie er als leeg bij staan.
     sessDeelnemers/sessFuncties komen uit js/recruitment.js, zodat deze kaart
     en het sessievenster gegarandeerd hetzelfde zeggen. */
  const regel = s => {
    const leden = D.sessDeelnemers ? D.sessDeelnemers(s.id) : [];
    const functies = D.sessFuncties ? [D.sessFuncties(s.id)].filter(Boolean) : [];
    const verleden = s.datum && s.datum < vandaag;
    return `<button type="button" class="kl-oorij${verleden?' weg':''}" data-oo="${h(s.id)}">
      <span class="kl-oodat num">${h(s.datum ? CRM.fmtDateShort(s.datum) : 'geen datum')}</span>
      <span class="kl-oowat"><b>${h(functies.join(' · ') || s.functie || 'nog geen kandidaten')}</b>
        ${s.locatie ? `<span class="meta">${h(s.locatie)}</span>` : ''}</span>
      <span class="kl-ooaantal num${leden.length >= 4 ? ' goed' : ''}"
        title="${verleden ? 'Deelnemers aan deze sessie' : 'Streef naar vier kandidaten per sessie'}"
        >${leden.length}${verleden ? '' : '/4'}</span>
    </button>`;
  };
  return `<div class="kl-oo">
    <div class="kl-tabkop"><div class="h2">O&amp;O-sessies</div>
      <span class="meta">${komend.length ? komend.length + ' gepland' : 'niets gepland'}</span>
      <span class="spacer"></span>
      <button class="btn ghost sm" id="k_oonieuw">+ Sessie plannen</button></div>
    ${sessies.length ? `<div class="kl-oolijst">${sessies.map(regel).join('')}</div>`
      : `<p class="meta" style="margin:0">Nog geen sessies voor deze klant. Plan er een en koppel er kandidaten aan — die komen dan op fase O&amp;O sessie te staan.</p>`}
  </div>`;
}

function ooBlokBind(el, k){
  const D = CRM._rcDeel || {};
  const nieuw = el.querySelector('#k_oonieuw');
  if(nieuw) nieuw.onclick = () => D.ooModal(null, {klant:k.naam, locatie:k.locatie || ''});
  el.querySelectorAll('[data-oo]').forEach(b => b.onclick = () => D.ooModal(b.dataset.oo));
}

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
      CRM.ui.leeg('Nog geen vacatures','Voeg de eerste opdracht van deze klant toe.')}
    ${ooBlokHtml(k)}`;

  ooBlokBind(el, k);
  el.querySelector('#v_nieuw').onclick = () => vacatureModal(k, null);
  el.querySelectorAll('[data-vbew]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    vacatureModal(k, c.vs.find(v => String(v.id) === b.dataset.vbew));
  });
  /* Overleg over déze vacature inplannen — zelfde venster, ander onderwerp. */
  el.querySelectorAll('[data-vplan]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    const v = c.vs.find(x => String(x.id) === b.dataset.vplan); if(!v) return;
    planModal(k, {titel:`Overleg ${v.functie} — ${k.naam}`});
  });
  /* Aanvullen opent hetzelfde venster, maar met het informatieblok al open —
     je klikte er tenslotte juist op om dat in te vullen. */
  el.querySelectorAll('[data-vinfo]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    vacatureModal(k, c.vs.find(v => String(v.id) === b.dataset.vinfo), {infoOpen:true});
  });
  el.querySelectorAll('[data-vweb]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    websiteModal(k, c.vs.find(v => String(v.id) === b.dataset.vweb));
  });
  el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => {
    e.preventDefault(); CRM.ga('kandidaten',{id:a.dataset.kand});
  });
}

function vacatureHtml(v, k){
  const dg = CRM.dagenGeleden(v.aangemaakt);
  const open = (v.status||'Open') === 'Open';
  const kandidaten = (index().kand.get(k.naam) || LEEG).filter(c =>
    String(c.vacatureId||'') === String(v.id) || (!c.vacatureId && c.functie === v.functie));
  /* Ook hier: fase '' = geïmporteerd, niet in traject. */
  const lopend = kandidaten.filter(c => !!c.fase && !CRM.DONE.includes(c.fase));
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
      ${webChip(v, open, dg)}
      <button class="btn sub sm" data-vplan="${h(String(v.id))}">Inplannen</button>
      <button class="btn sub sm" data-vbew="${h(String(v.id))}">Bewerken</button>
    </summary>
    <div class="kl-vac-b">
      ${webBlokHtml(v, open)}
      ${v.omschrijving ? `<p class="sub" style="margin:0 0 10px">${h(v.omschrijving)}</p>` : ''}
      ${kandidaten.length ? `<div class="kl-kandlijst">${kandidaten.map(c=>kandRegel(c)).join('')}</div>`
        : '<p class="meta" style="margin:0">Nog geen kandidaten gekoppeld aan deze vacature.</p>'}
    </div></details>`;
}

/* Chip in de samenvatting. Bewust karig: de samenvattingsregel heeft al drie
   chips, en kleur hoort betekenis te hebben. Dus alleen als het iets zégt —
   hij staat online, of hij staat er na een week nog steeds niet op. De
   tussenstand ("net aangemeld") leest de AM in het blok eronder.
   Alleen bij een open vacature: een vervulde vacature hoort er juist af. */
const WEB_TRAAG_DAGEN = 7;
function webChip(v, open, dg){
  if(!heeftVacInfoVelden()) return '';
  const st = v.web_status || 'Nog niet online';
  /* Staat een vervulde vacature nog online, dan is dat juist wél nieuws:
     dan komen er reacties op iets wat niet meer bestaat. */
  if(st === 'Staat online')
    return `<span class="chip${open?' green':' amber'}">${open?'op de website':'staat nog online'}</span>`;
  if(st === 'Niet nodig' || !open) return '';
  if(dg == null || dg < WEB_TRAAG_DAGEN) return '';
  return `<span class="chip amber">nog niet online · <span class="num">${dg}</span> dgn</span>`;
}

/* Het blok waar de twee kanten van de lus samenkomen: hoeveel informatie de
   marketeer al heeft, en of de vacature online staat. De AM leest hier of er
   nog iets nagevraagd wordt; de marketeer legt hier vast dat het gedaan is. */
function webBlokHtml(v, open){
  if(!heeftVacInfoVelden()) return '';
  const st = v.web_status || 'Nog niet online';
  /* Bij een vervulde of gesloten vacature valt er niets meer te plaatsen —
     dan hoort dit blok er ook niet te staan. Enige uitzondering: hij staat
     nog online. Dat moet iemand er juist afhalen. */
  if(!open && st !== 'Staat online') return '';
  const info = vacInfo(v);
  const id   = h(String(v.id));
  /* Groen als het compleet is, anders oranje. Geen rood: een half ingevulde
     vacature is werk in uitvoering, geen fout. */
  const kl   = info.mist.length ? 'amber' : 'green';
  const url  = veiligeUrl(v.web_url || '');
  let regel;
  if(st === 'Staat online'){
    regel = `Staat online${v.web_online_op ? ' sinds ' + h(CRM.fmtDateShort(v.web_online_op)) : ''}`
      + (v.web_door ? `, gezet door ${h(v.web_door)}` : '') + '.'
      + (open ? '' : ` De vacature is ${h((v.status||'').toLowerCase())} — hij kan van de site af.`)
      + (url ? ` <a href="${h(url)}" target="_blank" rel="noopener noreferrer">Bekijk de pagina</a>` : '');
  }else if(st === 'Niet nodig'){
    regel = 'Deze vacature hoeft niet op de website.';
  }else{
    regel = 'Nog niet online. ' + (info.mist.length
      ? `De marketeer mist nog: ${h(mistTekst(info))}.`
      : 'Alle informatie voor de tekst staat erin.');
  }
  return `<div class="kl-vweb">
    <div class="kl-vweb-kop">
      <span class="label">Voor de website</span>
      <div class="bar kl-vweb-bar"><i class="${kl}" style="width:${info.pct}%"></i></div>
      <span class="meta"><span class="num">${info.klaar}</span> van <span class="num">${info.totaal}</span></span>
      <span class="spacer"></span>
      <button class="btn sub sm" data-vinfo="${id}">${info.mist.length?'Info aanvullen':'Info bekijken'}</button>
      <button class="btn sub sm" data-vweb="${id}">Websitestand</button>
    </div>
    <div class="meta kl-vweb-m">${regel}</div>
  </div>`;
}

function laatsteKandContact(c){
  let nieuwste = null;
  const kijk = op => { if(op && (!nieuwste || op > nieuwste)) nieuwste = op; };
  (index().actKand.get(String(c.id)) || LEEG).forEach(a => kijk(a.op));
  (c.notities || LEEG).forEach(n => kijk(n.op));
  return nieuwste || c.since || null;
}
function kandRegel(c){
  const lc = laatsteKandContact(c);
  const d  = CRM.dagenGeleden(lc);
  return `<a class="kl-kand" data-kand="${h(String(c.id))}" href="#kandidaten/${encodeURIComponent(c.id)}">
    <div class="kl-kand-wie"><b class="trunc">${h(c.naam)}</b>
      <div class="meta trunc">${h(c.functie||'—')}${c.woonplaats?' · '+h(c.woonplaats):''}</div></div>
    ${c.fase
      ? `<span class="chip"><i class="dot" style="background:${CRM.faseKleur(c.fase)}"></i>${h(c.fase)}</span>`
      /* Geïmporteerde kandidaten hebben geen fase; een lege chip met alleen
         een stip zegt niets — benoem het gewoon. */
      : '<span class="chip">zonder fase</span>'}
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
      : CRM.ui.leeg('Nog geen kandidaten','Zodra je iemand voorstelt bij deze klant verschijnt die hier.')}`;

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
  const lbl = (CRM.ACT_SOORTEN[soort]||{}).lbl || 'Activiteit';
  const tekst = await CRM.vraag(lbl, {multiline:true, hint, knop:'Vastleggen'});
  if(!tekst) return;
  await CRM.logActiviteit('klant', k.naam, soort, tekst);
  CRM.verwerkTags(tekst, 'klant', k.naam);
  if(soort !== 'notitie') await bewaarKlant(k.naam, {laatst_contact: CRM.todayISO()});
  /* Ná bewaarKlant: die meldt "Opgeslagen", dezelfde tekst als bij het
     bewaren van de klantgegevens. Zeg liever wát er is vastgelegd. */
  CRM.toast(`${lbl} vastgelegd bij ${k.naam}`, 'ok');
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
          <!-- Geen <a href> meer: sinds de documentenmap dicht staat bewaren we
               het PAD, niet een url. De ondertekende link ontstaat pas bij de
               klik (CRM.opslag.open), verloopt vanzelf en staat dus nergens in
               de DOM waar hij gekopieerd of gedeeld kan worden. -->
          <td>${d.url ? `<button class="lnk" data-docopen="${h(d.id)}">${h(d.naam)}</button>` : h(d.naam)}</td>
          <td class="sub">${h(d.soort||'—')}</td>
          <td class="sub num">${h(CRM.fmtDate(d.op))}</td>
          <td class="sub">${h(d.door||'—')}</td>
          <td class="n"><button class="btn sub sm" data-dweg="${h(d.id)}">Verwijderen</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : CRM.ui.leeg('Nog geen documenten','Koppel de SWO, offerte of andere afspraken zodat iedereen ze terugvindt.')}
    ${CRM.bestandenUI ? CRM.bestandenUI.blokHtml(k.naam, 'kl_bestanden') : ''}`;

  if(CRM.bestandenUI) CRM.bestandenUI.laad(el, k.naam, 'kl_bestanden');
  el.querySelector('#d_nieuw').onclick = () => docModal(k);
  el.querySelectorAll('[data-docopen]').forEach(b => b.onclick = async () => {
    const rij = (CRM.state.documenten||[]).find(x => String(x.id) === b.dataset.docopen);
    if(!rij) return;
    const oud = b.textContent; b.textContent = 'Even…'; b.disabled = true;
    try{ await CRM.opslag.open(rij.url); }
    finally{ b.textContent = oud; b.disabled = false; }
  });
  el.querySelectorAll('[data-dweg]').forEach(b => b.onclick = async () => {
    if(!await CRM.bevestig('Document loskoppelen?', '', {gevaarlijk:true, knop:'Ja, loskoppelen'})) return;
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

/* ═══════════════════════════════════════════════════════════════
   AFSPRAAK INPLANNEN — één venster voor de hele app.
   De klantkaart, het contactpersoon-dossier, een vacature én het
   salesbord roepen hetzelfde venster aan via CRM.klantInplannen(),
   zodat "even inplannen" overal hetzelfde werkt.
   ═══════════════════════════════════════════════════════════════ */
/* Soort afspraak zet slimme standaarden; alles blijft aanpasbaar. */
const AFSPRAAK_SOORTEN = [
  {k:'Kennismaking',   duur:45, teams:false, opLocatie:true},
  {k:'Vervolggesprek', duur:45, teams:false, opLocatie:true},
  {k:'Bedrijfsbezoek', duur:60, teams:false, opLocatie:true},
  {k:'Evaluatie',      duur:45, teams:false, opLocatie:true},
  {k:'Online',         duur:30, teams:true,  opLocatie:false}
];
const DUREN = [15,30,45,60,90];
const plusDagen = (iso, n) => {
  const d = new Date(String(iso||'') + 'T12:00:00');
  if(isNaN(d)) return CRM.todayISO();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
const geldigMail = s => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s||'').trim());

/* opts: {contactIds:[id], titel, soort, na()} */
function planModal(klant, opts = {}){
  const k = typeof klant === 'string' ? CRM.klant(klant) : klant;
  if(!k) return CRM.toast('Klant niet gevonden','err');

  const conts = (CRM.state.contacten||[]).filter(x => x.klant === k.naam)
    .sort((a,b) => (b.hoofd?1:0)-(a.hoofd?1:0) || String(a.naam).localeCompare(String(b.naam),'nl'));
  const gekozenIds = new Set((opts.contactIds||[]).map(String));
  const aanStart = ct => !!ct.email && (gekozenIds.size ? gekozenIds.has(String(ct.id)) : !!ct.hoofd);
  const iemandAan = conts.some(aanStart);

  const soortStart = opts.soort || (opts.titel ? '' : 'Kennismaking');
  const soortDef   = AFSPRAAK_SOORTEN.find(s => s.k === soortStart) || null;
  const titelStart = opts.titel || `${soortStart||'Afspraak'} — ${k.naam}`;
  const datumStart = plusDagen(CRM.todayISO(), 1);

  const deelHtml = [
    ...conts.map(ct => `
      <label class="kl-deel${ct.email?'':' uit'}">
        <input type="checkbox" data-ct="${h(String(ct.id))}" value="${h(ct.email||'')}"
          ${aanStart(ct)?'checked':''}${ct.email?'':' disabled'}>
        <span class="kl-deel-wie">
          <b class="trunc">${h(ct.naam)}</b>
          <span class="meta trunc">${h([ct.functie||'', ct.email||'geen e-mailadres'].filter(Boolean).join(' · '))}</span>
        </span>
        ${ct.hoofd?'<span class="chip green">Hoofd</span>':''}
      </label>`),
    k.email ? `
      <label class="kl-deel">
        <input type="checkbox" data-alg="1" value="${h(k.email)}"${iemandAan?'':' checked'}>
        <span class="kl-deel-wie">
          <b class="trunc">${h(k.naam)}</b>
          <span class="meta trunc">algemeen e-mailadres · ${h(k.email)}</span>
        </span>
      </label>` : ''
  ].filter(Boolean).join('');

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Inplannen</div>
      <p class="sub" style="margin:6px 0 0">${h(k.naam)}</p></div>
    <div class="modal-b">
      <div class="kl-soorten" id="kp_soort">${AFSPRAAK_SOORTEN.map(s =>
        `<button type="button" class="chip btn-like${s.k===soortStart?' on':''}" data-s="${h(s.k)}">${h(s.k)}</button>`).join('')}</div>

      <div class="f-row"><label>Onderwerp</label><input type="text" id="kp_titel" value="${h(titelStart)}"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="kp_datum" value="${h(datumStart)}"></div>
        <div class="f-row"><label>Tijd</label><input type="time" id="kp_tijd" value="10:00"></div>
        <div class="f-row"><label>Duur</label><select id="kp_duur">${DUREN.map(n =>
          `<option value="${n}"${n===(soortDef?soortDef.duur:45)?' selected':''}>${n} minuten</option>`).join('')}</select></div>
        <div class="f-row"><label>Locatie</label><input type="text" id="kp_loc"
          value="${h(soortDef && !soortDef.opLocatie ? '' : (k.locatie||''))}"></div>
      </div>
      <label class="check"><input type="checkbox" id="kp_teams"${soortDef&&soortDef.teams?' checked':''}> Teams-videocall</label>

      <div class="f-row" style="margin-top:14px"><label>Wie nodig je uit?</label>
        ${deelHtml ? `<div class="kl-deelnemers">${deelHtml}</div>`
          : '<p class="meta" style="margin:0 0 8px">Nog geen contactpersonen bij deze klant — vul hieronder een adres in.</p>'}
        <input type="text" id="kp_extra" placeholder="naam@bedrijf.nl, collega@bedrijf.nl">
        <span class="hint">Extra e-mailadressen, gescheiden door een komma.</span>
      </div>

      <div class="f-row"><label>Notitie</label>
        <textarea id="kp_body" placeholder="Voor in de uitnodiging…"></textarea></div>

      <label class="check"><input type="checkbox" id="kp_opvolg"> Zet ook een opvolgtaak</label>
      <div class="f-row kl-opvolg" id="kp_opvolgrij" hidden style="margin-top:8px">
        <label>Nabellen op</label>
        <input type="date" id="kp_opvolgdatum" value="${h(plusDagen(datumStart, 7))}" style="max-width:180px">
      </div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="kp_ok">Inplannen</button></div>`, {onOpen(m){

    const $ = s => m.querySelector(s);
    const titelEl = $('#kp_titel'), datumEl = $('#kp_datum'), duurEl = $('#kp_duur');
    const locEl = $('#kp_loc'), teamsEl = $('#kp_teams');
    const opvolgEl = $('#kp_opvolg'), opvolgRij = $('#kp_opvolgrij'), opvolgDatum = $('#kp_opvolgdatum');
    let opvolgAangeraakt = false;

    /* Soort kiezen: onderwerp voorvullen + duur, locatie en Teams zetten. */
    m.querySelectorAll('#kp_soort [data-s]').forEach(b => b.onclick = () => {
      const s = AFSPRAAK_SOORTEN.find(x => x.k === b.dataset.s); if(!s) return;
      m.querySelectorAll('#kp_soort [data-s]').forEach(x => x.classList.toggle('on', x === b));
      titelEl.value = `${s.k} — ${k.naam}`;
      duurEl.value  = String(s.duur);
      teamsEl.checked = s.teams;
      locEl.value = s.opLocatie ? (k.locatie||'') : '';
    });

    datumEl.onchange = () => { if(!opvolgAangeraakt) opvolgDatum.value = plusDagen(datumEl.value, 7); };
    opvolgDatum.onchange = () => { opvolgAangeraakt = true; };
    opvolgEl.onchange = () => { opvolgRij.hidden = !opvolgEl.checked; };

    $('#kp_ok').onclick = async () => {
      const gekozen = [...m.querySelectorAll('.kl-deel input:checked')];
      const uitContacten = gekozen.filter(c => c.dataset.ct)
        .map(c => conts.find(x => String(x.id) === c.dataset.ct)).filter(Boolean);
      const extra = $('#kp_extra').value.split(/[,;]/).map(s => s.trim()).filter(geldigMail);
      const d = {
        titel: titelEl.value.trim(),
        datum: datumEl.value, tijd: $('#kp_tijd').value || '10:00',
        duurMin: Number(duurEl.value) || 45,
        locatie: locEl.value.trim(),
        teams: teamsEl.checked,
        body: $('#kp_body').value.trim(),
        deelnemers: [...new Set(gekozen.map(c => c.value).filter(Boolean).concat(extra))]
      };
      if(!d.titel) return CRM.toast('Vul een onderwerp in','err');
      if(!d.datum) return CRM.toast('Kies een datum','err');
      const opvolg = opvolgEl.checked ? (opvolgDatum.value || plusDagen(d.datum, 7)) : null;
      CRM.modal.close();

      try{
        const r = await CRM.outlook.maakAfspraak(d);
        CRM.toast(r.via === 'graph' ? 'In je agenda gezet' : 'Outlook geopend — klik daar op Opslaan','ok');

        const wie = uitContacten.map(c => c.naam).join(', ');
        const regel = `Afspraak ingepland: ${d.titel} op ${CRM.fmtDate(d.datum)} ${d.tijd}`
          + (wie ? ` — met ${wie}` : '') + (d.locatie ? ` (${d.locatie})` : d.teams ? ' (Teams)' : '');
        await CRM.logActiviteit('klant', k.naam, 'gesprek', regel, {afspraak:{datum:d.datum, tijd:d.tijd, titel:d.titel}});
        /* Ook in het dossier van iedereen die je uitnodigt. */
        for(const ct of uitContacten)
          await CRM.logActiviteit('contact', String(ct.id), 'gesprek', regel, {afspraak:{datum:d.datum, tijd:d.tijd, titel:d.titel}});
        if(r.online) await CRM.logActiviteit('klant', k.naam, 'notitie', 'Teams-link: ' + r.online);

        /* Laatste contact alleen bijwerken als de afspraak niet in de
           toekomst ligt — anders lijkt een klant "vers" terwijl je hem
           nog moet spreken. */
        if(d.datum <= CRM.todayISO()) await bewaarKlant(k.naam, {laatst_contact: d.datum});

        if(opvolg) await opvolgtaak(k, d, opvolg);
        verversAfspraken(k);
        CRM.render();
        if(typeof opts.na === 'function') opts.na();
      }catch(e){ CRM.fout('Inplannen mislukt', e); }
    };
  }});
}

/* Opvolgtaak zonder extra venster: dezelfde rij als CRM.taakModal maakt. */
async function opvolgtaak(k, d, datum){
  const rij = {
    id: CRM.uid(), tekst: 'Nabellen na ' + d.titel, datum, klaar: false,
    entiteit: 'klant', ref: k.naam, voor: CRM.me(), door: CRM.me(),
    prioriteit: '', created_at: new Date().toISOString()
  };
  CRM.state.taken.push(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_taken').insert(rij);
    if(error){ CRM.fout('Opvolgtaak opslaan mislukt', error); return; }
  }
  if(CRM.outlook?.verbonden?.())
    CRM.outlook.maakTaak({titel: rij.tekst, datum, notities: k.naam}).catch(()=>{});
  CRM.navBadges?.();
  CRM.toast('Opvolgtaak gezet voor ' + CRM.fmtDate(datum), 'ok');
}

/* Voor sales.js en andere modules: hetzelfde venster, geen tweede modal. */
CRM.klantInplannen = (klant, opts) => planModal(klant, opts || {});

/* ─── Klantgegevens bewerken ──────────────────────────────────── */
/* De vestigingskolommen (adres/postcode/plaats/kvk) komen pas in de database
   nadat supabase/schema.sql opnieuw is gedraaid. Zolang ze er niet zijn,
   mogen we ze ook niet meesturen bij het opslaan — dan faalt de hele update
   en kan er niets meer aan een klant gewijzigd worden. `select *` levert de
   kolom als sleutel op zodra hij bestaat, dus daar kunnen we op afgaan. */
const heeftVestigingVelden = () => {
  const rij = (CRM.state.clients || []).find(Boolean);
  return !!rij && 'adres' in rij;
};

function klantModal(k){
  const vest = heeftVestigingVelden();
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Klantgegevens</div></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Fase</label><select id="g_fase">
          <option value=""${!k.fase?' selected':''}>Zonder fase</option>
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
      <!-- Vestigingsgegevens: staan op de partijkaart van elke samenwerkings-
           overeenkomst. Eén keer hier invullen scheelt ze per contract
           opnieuw intypen. -->
      ${vest ? `
      <div class="label" style="margin-top:18px">Vestigingsgegevens</div>
      <p class="sub" style="margin:2px 0 10px">Worden overgenomen in de samenwerkingsovereenkomst.</p>
      <div class="f-grid">
        <div class="f-row"><label>Adres</label><input type="text" id="g_adres" value="${h(k.adres||'')}" placeholder="Straat en huisnummer"></div>
        <div class="f-row"><label>Postcode</label><input type="text" id="g_pc" value="${h(k.postcode||'')}" placeholder="1234 AB"></div>
        <div class="f-row"><label>Plaats</label><input type="text" id="g_pl" value="${h(k.plaats||'')}"></div>
        <div class="f-row"><label>KvK-nummer</label><input type="text" id="g_kvk" value="${h(k.kvk||'')}" inputmode="numeric"></div>
      </div>` : ''}
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="g_ok">Opslaan</button></div>`, {onOpen(m){
    m.querySelector('#g_ok').onclick = async () => {
      const oudeFase = k.fase || '';
      const nieuweFase = m.querySelector('#g_fase').value;
      const w = {
        fase:nieuweFase, eigenaar:m.querySelector('#g_eig').value.trim(),
        branche:m.querySelector('#g_br').value.trim(), locatie:m.querySelector('#g_loc').value.trim(),
        telefoon:m.querySelector('#g_tel').value.trim(), email:m.querySelector('#g_mail').value.trim(),
        website:m.querySelector('#g_web').value.trim(), laatst_contact:m.querySelector('#g_lc').value || null
      };
      if(vest) Object.assign(w, {
        adres:m.querySelector('#g_adres').value.trim(), postcode:m.querySelector('#g_pc').value.trim(),
        plaats:m.querySelector('#g_pl').value.trim(), kvk:m.querySelector('#g_kvk').value.trim()
      });
      /* Fase wisselen hier moet hetzelfde doen als op het bord en in de
         zijrail: de teller "dagen in fase" opnieuw laten lopen en de wissel
         vastleggen. Anders klopt de doorlooptijd niet meer en staat er
         nergens wie de fase heeft veranderd. */
      const faseGewisseld = nieuweFase !== oudeFase;
      if(faseGewisseld) w.fase_sinds = CRM.todayISO();
      /* Team los opslaan: de kolom kan ontbreken zolang de aanvulling-SQL
         niet gedraaid is — dan mag de rest van de wijziging niet sneuvelen. */
      const team = m.querySelector('#g_team').value.trim();
      CRM.modal.close();
      await bewaarKlant(k.naam, w);
      if(faseGewisseld)
        CRM.logActiviteit('klant', k.naam, 'fase', `Fase gewijzigd: ${oudeFase||'—'} → ${nieuweFase||'—'}`);
      if(team !== (k.team||'')) await bewaarTeam(k, team);
      CRM.render();
    };
  }});
}

/* ─── Vacature toevoegen / bewerken ───────────────────────────── */
/* k mag null zijn: dan vraagt het venster zelf om de klant. Zo kun je ook
   vanaf het scherm Vacatures een nieuwe opdracht aanmaken, en niet alleen
   vanaf de kaart van één klant. (Tjeerd, 3 aug 2026.) */
function vacatureSnel(k){
  const kiesKlant = !k;
  const klanten = (CRM.state.clients||[]).map(x=>x.naam).filter(Boolean).sort((a,b)=>a.localeCompare(b,'nl'));
  if(kiesKlant && !klanten.length) return CRM.toast('Maak eerst een klant aan bij Relaties','err');
  k = k || CRM.klant(klanten[0]) || {naam:klanten[0], locatie:'', eigenaar:CRM.me()};
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe vacature</div>
      <p class="sub" style="margin:6px 0 0">Alleen het begin — daarna sta je op de vacaturekaart en vul je daar alles in.</p></div>
    <div class="modal-b">
      ${kiesKlant ? `<div class="f-row"><label for="vs_klant">Klant</label>
        <select id="vs_klant">${klanten.map(x =>
          `<option${x===k.naam?' selected':''}>${h(x)}</option>`).join('')}</select></div>` : `<p class="sub" style="margin:0 0 10px"><b>${h(k.naam)}</b></p>`}
      <div class="f-grid">
        <div class="f-row"><label>Functie</label><input type="text" id="vs_functie" placeholder="Bijv. CNC Draaier"></div>
        <div class="f-row"><label>Aantal posities</label><input type="number" id="vs_aantal" min="1" value="1"></div>
      </div>
      <div class="note err" id="vs_err" style="display:none"></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="vs_ok">Aanmaken — kaart invullen →</button>
    </div>`, {onOpen(m){
    setTimeout(()=>m.querySelector('#vs_functie').focus(), 60);
    m.querySelector('#vs_ok').onclick = async () => {
      const functie = m.querySelector('#vs_functie').value.trim();
      if(!functie){ const e=m.querySelector('#vs_err'); e.style.display=''; e.textContent='Vul de functie in.'; return; }
      const kSel = m.querySelector('#vs_klant');
      if(kSel && kSel.value){ k = CRM.klant(kSel.value) || {naam:kSel.value}; }
      const rij = {klant:k.naam, functie, locatie:k.locatie||'', aantal:Number(m.querySelector('#vs_aantal').value)||1,
        status:'Open', type:'W&S', eigenaar:k.eigenaar||CRM.me(), aangemaakt:CRM.todayISO(),
        sal_min:null, sal_max:null, omschrijving:''};
      /* In productie genereert de database het uuid; in demo maken we er zelf
         een, anders is de kaart niet te openen. */
      if(CRM.demo) rij.id = k.naam + '::' + functie;
      CRM.modal.close();
      await bewaarRij('vacatures','vacs', rij, false);
      await CRM.logActiviteit('klant', k.naam, 'systeem', 'Vacature ' + functie + ' aangemaakt');
      await meldNieuweVacature(k, rij);
      /* Meteen naar de kaart — daar gebeurt het invullen. */
      if(rij.id) CRM.ga('hot', {id:String(rij.id)});
      else CRM.render();
    };
  }});
}

function vacatureModal(k, v, opts){
  /* NIEUW aanmaken is sinds 4 aug 2026 een klein venster: klant + functie,
     en dan stá je op de vacaturekaart en vul je dáár alles in — de kaart is
     inline bewerkbaar. (Tjeerd: "ik wil dat het de kaart meteen aanmaakt en
     dat je de vacaturekaart meteen kan invullen.") Het grote formulier
     hieronder blijft bestaan voor Bewerken vanaf de klantkaart. */
  if(!v) return vacatureSnel(k, opts);
  const extra = heeftVacInfoVelden();
  const kaart = heeftVacKaartVelden();
  const kiesKlant = !k;
  const klanten = (CRM.state.clients||[]).map(x=>x.naam).filter(Boolean).sort((a,b)=>a.localeCompare(b,'nl'));
  if(kiesKlant && !klanten.length) return CRM.toast('Maak eerst een klant aan bij Relaties','err');
  k = k || CRM.klant(klanten[0]) || {naam:klanten[0], locatie:'', eigenaar:CRM.me()};
  const n = v || {id:'', klant:k.naam, functie:'', locatie:k.locatie||'', aantal:1,
    sal_min:null, sal_max:null, type:'W&S', status:'Open', eigenaar:k.eigenaar||CRM.me(),
    aangemaakt:CRM.todayISO(), omschrijving:''};
  const kies = (lijst, nu) => '<option value=""></option>' +
    lijst.map(s => `<option${nu===s?' selected':''}>${h(s)}</option>`).join('');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${v?'Vacature bewerken':'Nieuwe vacature'}</div>
      ${kiesKlant ? '' : `<p class="sub" style="margin:6px 0 0">${h(k.naam)}</p>`}</div>
    <div class="modal-b">
      ${kiesKlant ? `<div class="f-row"><label for="v_klant">Klant</label>
        <select id="v_klant">${klanten.map(x =>
          `<option${x===k.naam?' selected':''}>${h(x)}</option>`).join('')}</select>
        <div class="hint">De locatie en de accountmanager komen uit de klantkaart zodra je kiest.</div></div>` : ''}
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
        ${kaart ? `
        <div class="f-row"><label>Uurloon vanaf</label><input type="number" step="0.01" id="v_umin" value="${n.uurloon_min==null?'':n.uurloon_min}"></div>
        <div class="f-row"><label>Uurloon tot</label><input type="number" step="0.01" id="v_umax" value="${n.uurloon_max==null?'':n.uurloon_max}"></div>
        <div class="f-row"><label>Uren per week</label><input type="text" id="v_uren" value="${h(n.uren||'')}" placeholder="40"></div>
        <div class="f-row"><label>Vakantiegeld %</label><input type="number" step="0.1" id="v_vt" value="${n.vt_pct==null?'':n.vt_pct}" placeholder="8"></div>
        <div class="f-row"><label>Ploegentoeslag %</label><input type="number" step="0.1" id="v_toesl" value="${n.toeslag_pct==null?'':n.toeslag_pct}"></div>
        <div class="f-row"><label>13e mnd / eju %</label><input type="number" step="0.1" id="v_eju" value="${n.eju_pct==null?'':n.eju_pct}"></div>
        <div class="f-row"><label>Reiskosten</label><input type="text" id="v_reis" value="${h(n.reiskosten||'')}" placeholder="€0,23 / km"></div>` : ''}
      </div>
      <div class="f-row"><label>Omschrijving</label>
        <textarea id="v_oms" placeholder="Wat je collega's over deze opdracht moeten weten.">${h(n.omschrijving||'')}</textarea>
        ${extra ? '<span class="hint">Werktijden, certificaten en vervoer horen hieronder — dan komen ze bij de marketeer terecht.</span>' : ''}</div>
      ${extra ? `
      <details class="vacinfo" id="v_info"${opts && opts.infoOpen ? ' open':''}>
        <summary>
          <div style="min-width:0;flex:1">
            <b>Informatie voor de vacaturetekst</b>
            <div class="meta" id="v_infomist"></div>
          </div>
          <span class="chip" id="v_infotel"></span>
        </summary>
        <div class="vacinfo-b">
          <div class="f-grid">
            <div class="f-row"><label>Werktijden</label>
              <input type="text" id="v_tijden" value="${h(n.werktijden||'')}" placeholder="06:00–14:30, ma t/m vr"></div>
            <div class="f-row"><label>Ploegendienst</label>
              <select id="v_ploeg">${kies(CRM.PLOEGEN||[], n.ploegendienst||'')}</select></div>
            <div class="f-row"><label>Contractvorm</label>
              <select id="v_contract">${kies(VAC_CONTRACT, n.contractvorm||'')}</select></div>
            <div class="f-row"><label>Bereikbaarheid</label>
              <select id="v_bereik">${kies(VAC_BEREIK, n.bereikbaarheid||'')}</select></div>
          </div>
          <div class="f-row"><label>Ervaring en certificaten</label>
            <input type="text" id="v_eisen" value="${h(n.eisen||'')}" placeholder="Heftruckcertificaat, VCA, ervaring in de voedingsindustrie">
            <span class="hint">Staat er niets? Zet dan "geen ervaring nodig" — dat is ook informatie.</span></div>
          <div class="f-row"><label>Wat voor bedrijf is het</label>
            <textarea id="v_bedrijf" rows="2" placeholder="Familiebedrijf, 80 medewerkers, maakt maaltijdsalades voor supermarkten.">${h(n.over_bedrijf||'')}</textarea></div>
          <div class="f-row"><label>Waarom zou je hier willen werken</label>
            <textarea id="v_waarom" rows="2" placeholder="Vast team, warme sfeer, heftruckcertificaat op kosten van de zaak.">${h(n.waarom_hier||'')}</textarea></div>
        </div>
      </details>` :
      `<p class="meta" style="margin:0">De extra velden voor de website verschijnen zodra de databasewijziging gedraaid is.</p>`}
      ${kaart ? `
      <details class="vacinfo">
        <summary><div style="min-width:0;flex:1"><b>Vacaturetekst — de blokken van de website</b>
          <div class="meta">Openingszin, de baan en wat je krijgt. Eén punt per regel; het salaris komt er vanzelf bij uit de velden hierboven.</div></div></summary>
        <div class="vacinfo-b">
          <div class="f-row"><label>Openingszin</label>
            <input type="text" id="v_open" value="${h(n.openingszin||'')}" placeholder="Je hoeft nog niet alles te kunnen. Je leert het vak van ervaren monteurs.">
            <span class="hint">De regel die op de website direct onder de functietitel staat.</span></div>
          <div class="f-row"><label>Dit is de baan</label>
            <textarea id="v_baan" rows="4" placeholder="Meelopen met onderhoud en reparaties\nMachines demonteren, reviseren en weer opbouwen">${h(n.de_baan||'')}</textarea>
            <span class="hint">Eén punt per regel — wordt op de website een opsomming.</span></div>
          <div class="f-row"><label>Wat krijg je</label>
            <textarea id="v_krijg" rows="4" placeholder="Een leermeester die je het vak echt leert\nOpleidingen en certificaten betaald">${h(n.wat_krijg_je||'')}</textarea>
            <span class="hint">Zonder de salarisregel — die komt automatisch uit het maandloon, zodat de site nooit iets anders zegt dan het CRM.</span></div>
        </div>
      </details>
      ${CRM.magOpbrengstZien() ? `
      <details class="vacinfo">
        <summary><div style="min-width:0;flex:1"><b>Afwijkende afspraak voor deze vacature</b>
          <div class="meta">Leeg = de klantafspraak geldt. Vul alleen in wat voor déze vacature anders is.</div></div></summary>
        <div class="vacinfo-b"><div class="f-grid">
          <div class="f-row"><label>Fee %</label><input type="number" step="0.5" id="v_fee" value="${n.fee_pct==null?'':n.fee_pct}"></div>
          <div class="f-row"><label>Garantie (mnd)</label><input type="number" id="v_gar" value="${n.garantie_mnd==null?'':n.garantie_mnd}"></div>
          <div class="f-row"><label>Betaaltermijn (dgn)</label><input type="number" id="v_bet" value="${n.betaaltermijn_dgn==null?'':n.betaaltermijn_dgn}"></div>
          <div class="f-row"><label>Contactpersoon</label><select id="v_contactp">
            <option value=""></option>
            ${(CRM.state.contacten||[]).filter(ct=>ct.klant===k.naam).map(ct=>
              `<option value="${h(String(ct.id))}"${String(n.contact_id||'')===String(ct.id)?' selected':''}>${h(ct.naam)}</option>`).join('')}
          </select><span class="hint">Voor déze vacature — kan een ander zijn dan het hoofdcontact.</span></div>
        </div></div>
      </details>` : ''}` : ''}
    </div>
    <div class="modal-f">
      ${v?'<button class="btn sub" id="v_weg">Verwijderen</button>':''}
      <span class="spacer"></span>
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="v_ok">Opslaan</button>
    </div>`, {onOpen(m){
    const w = id => { const el = m.querySelector('#'+id); return el ? el.value.trim() : ''; };
    /* De marketingvelden en het salaris uitlezen als één vacature-achtig
       object, zodat de teller in dit venster exact hetzelfde rekent als de
       vacaturekaart en de melding aan de marketeer. */
    const nu = () => ({
      werktijden:w('v_tijden'), ploegendienst:w('v_ploeg'), contractvorm:w('v_contract'),
      eisen:w('v_eisen'), bereikbaarheid:w('v_bereik'),
      over_bedrijf:w('v_bedrijf'), waarom_hier:w('v_waarom'),
      sal_min: w('v_smin')==='' ? null : Number(w('v_smin')),
      sal_max: w('v_smax')==='' ? null : Number(w('v_smax'))
    });
    /* Meelopende teller: je ziet tijdens het invullen wat er nog mist, ook
       met het blok dichtgeklapt. Zonder die teller is een ingeklapt blok
       makkelijk te vergeten. */
    const tel = m.querySelector('#v_infotel'), mistEl = m.querySelector('#v_infomist');
    function verversTeller(){
      if(!tel) return;
      const inf = vacInfo(nu());
      tel.textContent = `${inf.klaar}/${inf.totaal}`;
      tel.className = 'chip' + (inf.mist.length ? (inf.klaar ? ' amber' : '') : ' green');
      mistEl.textContent = inf.mist.length
        ? 'Nog nodig: ' + mistTekst(inf)
        : 'Compleet — de marketeer kan hiermee vooruit.';
    }
    if(tel){
      verversTeller();
      ['v_tijden','v_ploeg','v_contract','v_eisen','v_bereik','v_bedrijf','v_waarom','v_smin','v_smax']
        .forEach(id => { const el = m.querySelector('#'+id); if(el) el.oninput = el.onchange = verversTeller; });
    }
    m.querySelector('#v_ok').onclick = async () => {
      const functie = m.querySelector('#v_functie').value.trim();
      if(!functie) return CRM.toast('Vul een functie in','err');
      const smin = m.querySelector('#v_smin').value, smax = m.querySelector('#v_smax').value;
      /* Vóór het overschrijven vastleggen: was de informatie hiervóór nog
         niet compleet? Alleen dán is aanvullen nieuws voor de marketeer. */
      const wasOnvolledig = extra && vacInfo(n).mist.length > 0;
      /* Bij het aanmaken vanaf Vacatures staat de klant in het venster zelf. */
      const kSel = m.querySelector('#v_klant');
      if(kSel && kSel.value){ k = CRM.klant(kSel.value) || {naam:kSel.value}; }
      const rij = Object.assign({}, n, {
        klant:k.naam, functie, locatie:m.querySelector('#v_loc').value.trim(),
        aantal:Number(m.querySelector('#v_aantal').value)||1,
        status:m.querySelector('#v_status').value, type:m.querySelector('#v_type').value,
        aangemaakt:m.querySelector('#v_sinds').value || CRM.todayISO(),
        sal_min: smin === '' ? null : Number(smin),
        sal_max: smax === '' ? null : Number(smax),
        omschrijving:m.querySelector('#v_oms').value.trim()
      });
      /* Alleen meesturen als de kolommen bestaan — zie heeftVacKaartVelden. */
      if(kaart){
        const getalOf = id => { const x = w(id); return x === '' ? null : Number(x); };
        Object.assign(rij, {
          uurloon_min: getalOf('v_umin'), uurloon_max: getalOf('v_umax'),
          uren: w('v_uren'), vt_pct: getalOf('v_vt'), toeslag_pct: getalOf('v_toesl'),
          eju_pct: getalOf('v_eju'), reiskosten: w('v_reis'),
          openingszin: w('v_open'),
          de_baan: (m.querySelector('#v_baan') ? m.querySelector('#v_baan').value : '').trim(),
          wat_krijg_je: (m.querySelector('#v_krijg') ? m.querySelector('#v_krijg').value : '').trim()
        });
        if(CRM.magOpbrengstZien()) Object.assign(rij, {
          fee_pct: getalOf('v_fee'), garantie_mnd: getalOf('v_gar'),
          betaaltermijn_dgn: getalOf('v_bet'), contact_id: w('v_contactp')
        });
      }
      /* Alleen meesturen als de kolommen bestaan — zie heeftVacInfoVelden. */
      if(extra) Object.assign(rij, nu(), {
        web_status:   n.web_status || 'Nog niet online',
        web_url:      n.web_url || '',
        web_online_op:n.web_online_op || null,
        web_door:     n.web_door || ''
      });
      /* In productie is vacatures.id een uuid met database-default — geen
         eigen id meesturen bij nieuw; in demo wél (geen database). */
      if(!rij.id && CRM.demo) rij.id = k.naam + '::' + functie;
      CRM.modal.close();
      await bewaarRij('vacatures','vacs', rij, !!v);
      if(!v){
        await CRM.logActiviteit('klant', k.naam, 'systeem', 'Vacature ' + functie + ' aangemaakt');
        /* De marketeer moet weten dat er iets te plaatsen valt. Bij bewerken
           niet opnieuw melden — dan zou elke tikfout een bericht opleveren. */
        const uit = await meldNieuweVacature(k, rij);
        if(uit) CRM.toast(vacInfo(rij).mist.length
          ? 'Opgeslagen — de marketeer heeft een melding, mét wat er nog mist'
          : 'Opgeslagen — de marketeer heeft een melding', 'ok');
      }else if(wasOnvolledig && extra && !vacInfo(rij).mist.length
               && (rij.web_status||'Nog niet online') === 'Nog niet online'){
        /* De andere kant van de lus: de AM heeft nagevraagd wat ontbrak, dus
           de marketeer kan nu verder. Eén keer, niet bij elke wijziging. */
        if(await meldInfoAangevuld(k, rij))
          CRM.toast('Opgeslagen — de marketeer weet dat de info compleet is','ok');
      }
      CRM.render();
    };
    const weg = m.querySelector('#v_weg');
    if(weg) weg.onclick = async () => {
      if(!await CRM.bevestig('Vacature verwijderen?', n.functie)) return;
      CRM.modal.close(); await verwijderRij('vacatures','vacs', n.id); CRM.render();
    };
  }});
}

/* ─── Websitestand van een vacature ───────────────────────────────
   Hiermee sluit de lus. De marketeer legt vast dat de vacature online
   staat; de AM die hem aanmeldde krijgt daar een melding van en ziet het
   daarna op de vacature zelf. Bewust geen workflow met stappen en
   goedkeuringen: drie standen, een datum en een link is genoeg.
   Iedereen mag het invullen — soms zet de AM een vacature zelf online,
   en dan hoort daar geen drempel voor te staan. */
function websiteModal(k, v){
  if(!v || !heeftVacInfoVelden()) return;
  const st   = v.web_status || 'Nog niet online';
  const info = vacInfo(v);
  const am   = v.eigenaar || k.eigenaar || '';
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Vacature op de website</div>
      <p class="sub" style="margin:6px 0 0">${h(v.functie)} — ${h(k.naam)}</p></div>
    <div class="modal-b">
      ${info.mist.length ? `<div class="note warn" style="margin:0 0 16px">Nog niet alles is bekend:
        ${h(mistTekst(info))}.${am ? ` Vraag dat eerst na bij ${h(am)}.` : ''}</div>` : ''}
      <div class="f-row"><label>Stand</label><select id="w_st">
        ${VAC_WEB.map(s=>`<option${st===s?' selected':''}>${h(s)}</option>`).join('')}</select></div>
      <div class="f-grid">
        <div class="f-row"><label>Online sinds</label>
          <input type="date" id="w_op" value="${h(String(v.web_online_op||'').slice(0,10))}"></div>
        <div class="f-row"><label>Link naar de pagina</label>
          <input type="url" id="w_url" value="${h(v.web_url||'')}" placeholder="https://ploeggenoten.nl/vacatures/…"></div>
      </div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="w_ok">Opslaan</button>
    </div>`, {onOpen(m){
    m.querySelector('#w_ok').onclick = async () => {
      const nieuw = m.querySelector('#w_st').value;
      const url   = m.querySelector('#w_url').value.trim();
      /* Online zonder datum is vandaag; staat de vacature niet online, dan
         hoort er ook geen datum of naam bij te blijven staan. */
      const op = nieuw === 'Staat online'
        ? (m.querySelector('#w_op').value || CRM.todayISO()) : '';
      const wasOnline = st === 'Staat online';
      const rij = Object.assign({}, v, {
        web_status: nieuw, web_url: url, web_online_op: op || null,
        web_door: nieuw === 'Staat online' ? (v.web_door || CRM.me()) : ''
      });
      CRM.modal.close();
      await bewaarRij('vacatures','vacs', rij, true);
      if(nieuw === 'Staat online' && !wasOnline){
        await CRM.logActiviteit('klant', k.naam, 'systeem',
          `Vacature ${v.functie} staat op de website`);
        await meldOnline(k, rij);
      }
      CRM.render();
    };
  }});
}

/* ═══════════════════════════════════════════════════════════════
   MAIL (Outlook) — gedeelde bouwstenen
   Wordt óók door js/kandidaten.js gebruikt; daarom aan CRM gehangen
   in plaats van twee keer geschreven (zie VERZOEK AAN CORE onderaan).
   Spelregels:
   · alleen zichtbaar als déze gebruiker Outlook verbonden heeft;
   · alleen correspondentie met één adres, nooit het hele postvak;
   · fragmenten zijn kort (de motor kapt op 220 tekens), nooit hele bodies;
   · pas laden als het blok echt in beeld staat — nooit in lijstweergaven;
   · nooit automatisch versturen: de gebruiker klikt zelf op Versturen.
   ═══════════════════════════════════════════════════════════════ */
const mailAan = () => !!(CRM.outlook && CRM.outlook.beschikbaar?.() && CRM.outlook.verbonden?.());
/* Zelfde voorwaarde, maar dan voor contacten en documenten: alleen als
   déze gebruiker zijn Microsoft-account gekoppeld heeft. */
const outlookAan = () => !!(CRM.outlook && CRM.outlook.beschikbaar?.() && CRM.outlook.verbonden?.());
const voornaamVan = n => String(n||'').trim().split(/\s+/)[0] || '';

/* Sjablonen: klein en nuchter, je-vorm, met de namen die we al weten
   ingevuld en [haakjes] waar de gebruiker zelf iets moet kiezen. */
const SJABLONEN = {
  klant: [
    { lbl:'Kandidaat voorstellen',
      onderwerp: c => 'Kandidaat voor ' + (c.functie || 'jullie vacature'),
      tekst: c => `Beste ${c.voornaam || '[naam]'},

Ik heb een kandidaat die past bij ${c.functie ? 'de functie ' + c.functie : 'jullie openstaande functie'}: ${c.kandidaat || '[naam kandidaat]'}.

In het kort:
- ervaring: [in één regel]
- beschikbaar: [datum]
- woonplaats: [plaats]

Zal ik het cv sturen, of plan ik meteen een kennismaking in?

Met vriendelijke groet,
${c.mij || ''}` },
    { lbl:'Terugkoppeling na gesprek',
      onderwerp: () => 'Terugkoppeling na het gesprek',
      tekst: c => `Beste ${c.voornaam || '[naam]'},

Dank voor het gesprek. Hierbij de terugkoppeling.

Besproken:
- [punt]
- [punt]

Afgesproken vervolgstap: [stap], uiterlijk [datum].

Klopt dit met jouw beeld? Laat het weten, dan pak ik het verder op.

Met vriendelijke groet,
${c.mij || ''}` }
  ],
  kandidaat: [
    { lbl:'Uitnodiging intake',
      onderwerp: () => 'Uitnodiging voor een kennismaking',
      tekst: c => `Hoi ${c.voornaam || '[naam]'},

Goed dat we contact hebben. Ik wil je graag beter leren kennen: wat je zoekt, wat je kunt en wanneer je kunt starten.

Schikt [dag] om [tijd] je? Het gesprek duurt ongeveer drie kwartier en gaat [via video / op kantoor]. Komt dat niet uit, geef dan twee momenten door die wel passen.

Tot dan.

Met vriendelijke groet,
${c.mij || ''}` },
    { lbl:'Voorstel besproken bij klant',
      onderwerp: c => 'Je profiel is besproken bij ' + (c.klant || '[klant]'),
      tekst: c => `Hoi ${c.voornaam || '[naam]'},

Ik heb je profiel besproken bij ${c.klant || '[klant]'}${c.functie ? ' voor de functie ' + c.functie : ''}.

Stand van zaken: [reactie van de klant].

Vervolgstap: [stap]. Zodra ik meer weet, hoor je het van mij. Heb je in de tussentijd vragen, bel me gerust.

Met vriendelijke groet,
${c.mij || ''}` }
  ]
};

/* Eén rustige regel per mail; klikbaar naar Outlook (alleen https). */
function mailRegelHtml(m){
  const url = /^https:\/\//i.test(String(m.link||'')) ? String(m.link) : '';
  /* Uitgaand herkennen aan meer dan het exacte accountadres: wie via een
     alias verstuurt (tjeerd@… terwijl het inlogadres anders luidt) zag
     zijn eigen mail als "ontvangen" staan — dezelfde aliaskwestie als bij
     de Outlook-koppeling zelf. Alles wat van ons eigen domein komt is
     verstuurd. (Mail aan Donna, 4 aug 2026.) */
  const eigenDomein = String(CRM.user?.email || '').split('@')[1] || '';
  const uitgaand = m.uitgaand
    || (eigenDomein && String(m.van || '').toLowerCase().endsWith('@' + eigenDomein));
  const richting = uitgaand
    ? 'verstuurd'
    : 'ontvangen' + (m.vanNaam ? ' van ' + m.vanNaam : '');
  const binnen = `<b class="trunc">${h(m.onderwerp || '(geen onderwerp)')}</b>
      <div class="meta">${h(richting)} · <span class="num">${h(CRM.geleden(m.op) || '')}</span></div>
      ${m.fragment ? `<p class="ml-frag">${h(String(m.fragment).slice(0,220))}</p>` : ''}`;
  return url
    ? `<a class="ml-i" href="${h(url)}" target="_blank" rel="noopener" title="Openen in Outlook">${binnen}</a>`
    : `<div class="ml-i">${binnen}</div>`;
}

CRM.mailUI = {
  actief: mailAan,

  /* Leeg blok. Geen koppeling of geen adres → lege string: dan staat er
     niets op het scherm dat we toch niet kunnen waarmaken. */
  blokHtml(adres, id = 'ml_blok'){
    if(!mailAan() || !adres) return '';
    return `<div class="card ml-kaart" id="${h(id)}">
      <div class="card-h"><div class="h2">Mailwisseling</div>
        <span class="spacer"></span><span class="meta trunc ml-adres">${h(adres)}</span></div>
      <div class="card-b ml-b"><p class="meta ml-leeg">Mail ophalen…</p></div></div>`;
  },

  /* Vult het blok. Alleen aanroepen als de kaart/drawer daadwerkelijk open is. */
  laad(root, adres, id = 'ml_blok'){
    if(!mailAan() || !adres || !root) return;
    const kaart = root.querySelector('#' + id);
    if(!kaart) return;
    const body = kaart.querySelector('.ml-b');
    Promise.resolve(CRM.outlook.mailMet(adres, 10)).then(rijen => {
      if(!Array.isArray(rijen) || !rijen.length){
        body.innerHTML = '<p class="meta ml-leeg">Geen mailwisseling gevonden met dit adres.</p>';
        return;
      }
      body.innerHTML = `<div class="ml-lijst">${rijen.map(mailRegelHtml).join('')}</div>`;
    }).catch(e => {
      console.warn('mailblok', e);
      body.innerHTML = '<p class="meta ml-leeg">Mail kon niet worden opgehaald.</p>';
    });
  },

  /* Mail opstellen. Zonder koppeling: gewone mailto, zoals altijd.
     opts: {aan, cc, onderwerp, tekst, wie, set:'klant'|'kandidaat',
            ctx:{voornaam,mij,klant,functie,kandidaat}, entiteit, ref, na} */
  opstellen(opts = {}){
    const aan = String(opts.aan || '').trim();
    if(!mailAan()){
      const q = opts.onderwerp ? '?subject=' + encodeURIComponent(opts.onderwerp) : '';
      window.location.href = 'mailto:' + encodeURIComponent(aan) + q;
      return;
    }
    const set = SJABLONEN[opts.set] || [];
    const ctx = Object.assign({mij: CRM.me()}, opts.ctx || {});
    const adressen = s => String(s||'').split(/[;,]/).map(x => x.trim()).filter(Boolean);

    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Mail opstellen</div>
        ${opts.wie ? `<p class="sub" style="margin:6px 0 0">${h(opts.wie)}</p>` : ''}</div>
      <div class="modal-b">
        ${set.length ? `<div class="f-row"><label for="ml_sj">Sjabloon</label>
          <select id="ml_sj"><option value="">Leeg bericht</option>${
            set.map((s,i) => `<option value="${i}">${h(s.lbl)}</option>`).join('')}</select></div>` : ''}
        <div class="f-grid">
          <div class="f-row"><label for="ml_aan">Aan</label>
            <input type="text" id="ml_aan" value="${h(aan)}"></div>
          <div class="f-row"><label for="ml_cc">CC</label>
            <input type="text" id="ml_cc" value="" placeholder="optioneel"></div>
        </div>
        <div class="f-row"><label for="ml_ond">Onderwerp</label>
          <input type="text" id="ml_ond" value="${h(opts.onderwerp || '')}"></div>
        <div class="f-row"><label for="ml_tekst">Bericht</label>
          <textarea id="ml_tekst" class="ml-tekst">${h(opts.tekst || '')}</textarea></div>
        <p class="meta ml-vanaf">Wordt verstuurd vanaf jouw Outlook-account.</p>
      </div>
      <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="ml_send">Versturen</button></div>`, {onOpen(m){
      const sj  = m.querySelector('#ml_sj');
      const ond = m.querySelector('#ml_ond');
      const tk  = m.querySelector('#ml_tekst');
      setTimeout(() => (sj || tk).focus(), 60);

      if(sj) sj.onchange = async () => {
        const s = set[Number(sj.value)];
        if(!s){ return; }
        if(tk.value.trim() && !await CRM.bevestig('Sjabloon toepassen?',
              'De tekst die je nu hebt getypt wordt vervangen.')){
          sj.value = ''; return;
        }
        ond.value = s.onderwerp(ctx);
        tk.value  = s.tekst(ctx);
        tk.focus();
      };

      m.querySelector('#ml_send').onclick = async ev => {
        const knop = ev.currentTarget;
        const lijstAan = adressen(m.querySelector('#ml_aan').value);
        const tekst = tk.value.trim();
        const onderwerp = ond.value.trim();
        if(!lijstAan.length) return CRM.toast('Vul eerst een ontvanger in','err');
        if(!tekst) return CRM.toast('Schrijf eerst een bericht','err');
        knop.disabled = true; knop.textContent = 'Versturen…';
        try{
          await CRM.outlook.stuurMail({aan:lijstAan, cc:adressen(m.querySelector('#ml_cc').value),
                                       onderwerp, tekst});
          CRM.modal.close();
          CRM.toast('Mail verstuurd','ok');
          if(opts.entiteit && opts.ref){
            await CRM.logActiviteit(opts.entiteit, String(opts.ref), 'mail',
              'Mail verstuurd: ' + (onderwerp || '(geen onderwerp)'));
          }
          if(typeof opts.na === 'function') opts.na();
        }catch(e){
          knop.disabled = false; knop.textContent = 'Versturen';
          CRM.fout('Versturen mislukt', e);
        }
      };
    }});
  },

  /* Een bestaande mailto-link slim maken: met koppeling opent hij het
     opstelvenster, zonder koppeling blijft het gewoon mailto. */
  bindLinks(root, opts = {}){
    if(!mailAan() || !root) return;
    root.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      a.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        CRM.mailUI.opstellen(Object.assign({}, opts,
          {aan: decodeURIComponent(a.getAttribute('href').slice(7).split('?')[0])}));
      };
    });
  }
};

/* ═══════════════════════════════════════════════════════════════
   BESTANDEN UIT ONEDRIVE EN SHAREPOINT — gedeeld met kandidaten.js.
   Zoeken, niet kopiëren: er wordt niets gedownload en niets in het
   CRM opgeslagen. We laten alleen zien wat er al staat en linken
   erheen. Zonder koppeling verschijnt het blok helemaal niet.
   ═══════════════════════════════════════════════════════════════ */
function bestandRegelHtml(b){
  const url = /^https:\/\//i.test(String(b.webUrl||'')) ? String(b.webUrl) : '';
  const meta = [b.waar || '', b.gewijzigd ? 'gewijzigd ' + CRM.geleden(b.gewijzigd) : '']
    .filter(Boolean).join(' · ');
  const binnen = `<b class="trunc">${h(b.naam)}</b>
    ${meta ? `<div class="meta">${h(meta)}</div>` : ''}`;
  return url
    ? `<a class="ob-i" href="${h(url)}" target="_blank" rel="noopener" title="Openen in OneDrive of SharePoint">${binnen}</a>`
    : `<div class="ob-i">${binnen}</div>`;
}

CRM.bestandenUI = {
  actief: outlookAan,

  /* Leeg blok. Geen koppeling of geen zoekterm → lege string. */
  blokHtml(term, id = 'ob_blok'){
    if(!outlookAan() || !String(term||'').trim()) return '';
    return `<div class="card ob-kaart" id="${h(id)}">
      <div class="card-h"><div class="h2">In OneDrive en SharePoint</div>
        <span class="spacer"></span><span class="meta trunc ob-term">${h(term)}</span></div>
      <div class="card-b ob-b"><p class="meta ob-leeg">Bestanden zoeken…</p></div></div>`;
  },

  /* Vult het blok. Alleen aanroepen als de kaart echt openstaat. */
  laad(root, term, id = 'ob_blok'){
    if(!outlookAan() || !String(term||'').trim() || !root) return;
    const kaart = root.querySelector('#' + id);
    if(!kaart) return;
    const body = kaart.querySelector('.ob-b');
    Promise.resolve(CRM.outlook.zoekBestanden(term, 12)).then(rijen => {
      if(!Array.isArray(rijen)){
        /* null = zoeken lukte niet; een lege lijst = niets gevonden. */
        body.innerHTML = '<p class="meta ob-leeg">Zoeken lukte niet.</p>';
        return;
      }
      if(!rijen.length){
        body.innerHTML = '<p class="meta ob-leeg">Niets gevonden in OneDrive of SharePoint.</p>';
        return;
      }
      body.innerHTML = `<div class="ob-lijst">${rijen.slice(0,8).map(bestandRegelHtml).join('')}</div>
        <a class="btn sub sm ob-meer" href="${h(CRM.outlook.zoekLink(term))}"
           target="_blank" rel="noopener">Meer in OneDrive</a>`;
    }).catch(e => {
      console.warn('bestandenblok', e);
      body.innerHTML = '<p class="meta ob-leeg">Zoeken lukte niet.</p>';
    });
  }
};

/* ═══════════════════════════════════════════════════════════════
   CONTACTPERSOON NAAR OUTLOOK — gedeeld met kandidaten.js.
   Zodat de telefoon laat zien wie er belt. Eén persoon per klik;
   bulk gaat via Instellingen.
   ═══════════════════════════════════════════════════════════════ */
CRM.naarOutlook = async function(knop, gegevens){
  if(!outlookAan()) return;
  if(!gegevens.email && !gegevens.telefoon)
    return CRM.toast('Geen e-mailadres of telefoonnummer om op te slaan','err');
  const oud = knop ? knop.textContent : '';
  if(knop){ knop.disabled = true; knop.textContent = 'Bezig…'; }
  const r = await CRM.outlook.zetContact(gegevens);
  if(knop){ knop.disabled = false; knop.textContent = oud; }
  if(!r) return CRM.toast('Opslaan in je Outlook-contacten lukte niet','err');
  CRM.toast(r.nieuw ? 'Toegevoegd aan je Outlook-contacten' : 'Bijgewerkt in je Outlook-contacten','ok');
};

/* ─── Registratie ─────────────────────────────────────────────── */
/* Het vacatureformulier wordt ook vanaf het scherm Vacatures gebruikt. Eén
   venster, één opslagroute — anders bestaan er twee formulieren voor
   hetzelfde ding en lopen de velden vroeg of laat uit elkaar. Zonder klant
   vraagt het venster er zelf om. */
CRM.vacatureModal = (klantNaam, v, opts) =>
  vacatureModal(klantNaam ? (CRM.klant(klantNaam) || {naam:klantNaam}) : null, v, opts);

CRM.registerModule('klanten', {
  title:'Relaties', icon:'▣', onderschrift:'Van lead tot klant — relatiekaarten en accountbeheer',
  render(mount, acties, params){
    zorgContacten();
    zorgFee();               // rekenmotor js/fee.js
    zorgAfspraken();         // alleen als deze gebruiker geld mag zien
    verversIndex();          // data kan buiten deze module gewijzigd zijn
    if(params && params.id) kaart(mount, acties, String(params.id));
    else overzicht(mount, acties);
  }
});
})();

/* VERZOEK AAN CORE — crm_afspraken in CRM.load():
   deze module haalt `crm_afspraken` zelf op (zorgAfspraken()) omdat de
   tabel bewust buiten de team-policy valt: alleen Tjeerd mag hem lezen.
   Zodra core een geld-tak in CRM.load() krijgt (naast de fin_*-tabellen
   van het financebord) hoort hij daar thuis — mét dezelfde harde
   voorwaarde `CRM.canSeeMoney()` vóór de query, niet erna. Voor een
   teamlid mag de query niet eens vertrekken. */

/* VERZOEK AAN CORE:
   1. `crm_contacten` wordt inmiddels wél door CRM.load() opgehaald — de
      eigen fallback hierboven (zorgContacten) kan weg zodra dat overal
      bevestigd is.
   2. js/outlook.js — `composeUrl()` zet geen gasten in de deeplink. Zonder
      gekoppelde Outlook (en in demo) vallen de aangevinkte contactpersonen
      dus stil weg. De Outlook-deeplink kent daarvoor `to=` (komma-gescheiden
      adressen); graag toevoegen aan composeUrl + maakAfspraak/composeLink,
      dan werkt "wie nodig je uit" ook zonder koppeling.
   3. js/outlook.js — `agenda()` haalt geen `attendees` op ($select). Daardoor
      kan de klantkaart komende afspraken alleen matchen op klantnaam in het
      onderwerp of de locatie, niet op het e-mailadres van een contactpersoon.
      Graag `attendees` meenemen en als `deelnemers:[email]` teruggeven — deze
      module leest dat veld al defensief uit. */

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN COORDINATOR — databasewijziging (vacature → website)
   Onderstaande kolommen horen in supabase/nog-te-draaien.sql en daarna
   in supabase/schema.sql. Zolang ze er niet zijn draait alles gewoon
   door: heeftVacInfoVelden() verbergt de velden en stuurt ze niet mee.

   -- Informatie die de marketeer nodig heeft voor de vacaturetekst.
   alter table vacatures add column if not exists werktijden     text default '';
   alter table vacatures add column if not exists ploegendienst  text default '';
   alter table vacatures add column if not exists contractvorm   text default '';
   alter table vacatures add column if not exists eisen          text default '';
   alter table vacatures add column if not exists bereikbaarheid text default '';
   alter table vacatures add column if not exists over_bedrijf   text default '';
   alter table vacatures add column if not exists waarom_hier    text default '';

   -- Staat de vacature op de website? Sluit de lus terug naar de AM.
   alter table vacatures add column if not exists web_status    text default 'Nog niet online';
   alter table vacatures add column if not exists web_url       text default '';
   alter table vacatures add column if not exists web_online_op date;
   alter table vacatures add column if not exists web_door      text default '';
   ═══════════════════════════════════════════════════════════════ */

/* VERZOEK AAN COORDINATOR — js/dashboard.js, kolomRechts() (regel ~1022).
   De marketeer krijgt nu een melding in "Voor jou", maar heeft geen lijst van
   vacatures die nog online moeten. Voorstel: in de marketeer-tak van
   kolomRechts() een blok "Nog op de website zetten" tussen postenHTML() en
   waakhondBlok(), gevuld met:

     (CRM.state.vacs||[])
       .filter(v => (v.status||'Open')==='Open'
                 && (v.web_status||'Nog niet online')==='Nog niet online')
       .sort((a,b) => String(a.aangemaakt).localeCompare(String(b.aangemaakt)))

   Per regel: functie, klant en CRM.dagenGeleden(v.aangemaakt); klik naar
   CRM.ga('klanten',{id:v.klant}). Een vacature ouder dan 7 dagen in oranje —
   die grens staat hier als WEB_TRAAG_DAGEN en hoort op één plek te leven.

   Verder: het is beter als er een echte agenda-achtige herinnering komt zodra
   een open vacature een week niet online staat. Dat kan pas als er een plek is
   die dagelijks draait; CRM.opvolging.registreerBron(fn) is daar de aangewezen
   plek voor, maar dat bestand is niet van deze module. */

/* VERZOEK AAN CORE — js/core.js, teamsMelding() (regel ~487) en de
   meldingklik in js/dashboard.js (regel ~1213): allebei kennen ze alleen
   entiteit 'klant' | 'kandidaat' | 'lead' | 'taak'. Meldingen over een
   vacature landen daarom op de klantkaart en niet op de vacature zelf. Dat
   werkt (de kaart opent op het tabblad Vacatures), maar bij een klant met
   acht vacatures moet je nog zoeken. Graag entiteit 'vacature' toevoegen,
   met ref = het vacature-id, en doorsturen als #klanten/<klant>?vac=<id>. */

/* VERZOEK AAN CORE: de mail-bouwstenen (`CRM.mailUI` bovenaan de registratie in
   dit bestand + de `.ml-*`-stijl onderaan css/klanten.css) worden gedeeld met
   js/kandidaten.js. Ze staan hier alleen omdat een module geen core mag
   aanraken; ze horen thuis in js/core.js en css/base.css.
   Hetzelfde geldt inmiddels voor `CRM.bestandenUI` (OneDrive/SharePoint-blok,
   `.ob-*`-stijl) en `CRM.naarOutlook` (contactpersoon naar het adresboek):
   ook die worden door de kandidatenkaart gebruikt en horen in core. */
