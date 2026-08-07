/* ═══════════════════════════════════════════════════════════════
   CONTACTPERSONEN — overzicht + kaart per persoon

   In dit vak is de relatie met de persoon vaak sterker dan die met het
   bedrijf: een productieleider die naar een andere fabriek vertrekt
   neemt zijn vertrouwen mee. Tot nu toe stond een contactpersoon als
   één regel in de zijbalk van de relatiekaart en was er nergens een
   overzicht van álle contactpersonen. Dit bestand voegt twee dingen toe:

     #contacten        — doorzoekbare lijst van iedereen, met het filter
                         dat vacatures oplevert: "lang niet gesproken".
     #contacten/<id>   — de kaart van één persoon.

   GEEN eigen menu-item. De zijbalk wordt in js/core.js opgebouwd uit
   NAV_GROEPEN, en dat bestand mag een module niet aanraken; bovendien
   staan er al twaalf items in vijf groepen en hoort dit inhoudelijk bij
   Relaties. De module is dus alleen geregistreerd om te kunnen routeren
   (eigen URL per persoon, deelbaar en te bookmarken) en wordt bereikt
   vanaf het relatie-overzicht en vanaf elke relatiekaart. Zolang je hier
   staat blijft 'Relaties' in de zijbalk oplichten.

   AFLEIDING versus VASTGELEGD FEIT. `crm_contacten` kent alleen een
   koppeling naar de klant, op naam. Er is geen veld dat een vacature,
   een kandidaat of een taak aan een persoon hangt. Alles wat dit scherm
   daarover toont is dus afgeleid via de relatie, en dat staat er ook bij
   — nooit een afleiding tonen alsof het een vastgelegd feit is. Bestaat
   de kolom `contact_id` wél (zie het verzoek onderaan), dan gebruikt dit
   bestand hem vanzelf en verdwijnt de afleiding.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Voorkeuren onthouden (crm_ct_*) ─────────────────────────── */
const P = {
  get(k,d){ try{ const v = localStorage.getItem('crm_ct_'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('crm_ct_'+k, JSON.stringify(v)); }catch(e){} }
};
const F = {
  zoek:   P.get('zoek',''),
  klant:  P.get('klant',''),
  hoofd:  P.get('hoofd',false),
  stil:   P.get('stil',''),        // '', '30', '90', 'nooit'
  sort:   P.get('sort','stil')
};
function zet(k,v){ F[k]=v; P.set(k,v); }

/* ─── Kleine helpers ──────────────────────────────────────────── */
/* Alleen http(s) doorlaten: een geplakte `javascript:`-link mag nooit
   uitgevoerd worden. Adres zonder protocol krijgt https:// ervoor. */
const veiligeUrl = u => {
  const s = String(u||'').trim();
  if(!s) return '';
  if(/^https?:\/\//i.test(s)) return s;
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? '' : 'https://' + s;
};
const telHref = t => 'tel:' + String(t||'').replace(/[^\d+]/g,'');
/* Voornaam: de eerste losse naam, tussenvoegsels tellen niet mee. */
const voornaamVan = naam => String(naam||'').trim().split(/\s+/)[0] || '';
const uniek = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'nl'));

/* Verjaardag: ALTIJD alleen dag en maand, nooit het jaartal en nooit de
   leeftijd. Bij een zakelijk contact doet die leeftijd niet ter zake en om
   iemand te feliciteren heb je hem niet nodig. Het jaartal blíjft in de
   database staan (een datumkolom heeft nu eenmaal een jaar), dus we rekenen
   met de sleutel 'MM-DD' en formatteren met een vást jaar — zo komt het
   geboortejaar nergens in de DOM terecht. Dezelfde regel als op de
   relatiekaart; die versie staat in js/klanten.js en is daar privé. */
const mmdd = iso => { const m = /^\d{4}-(\d{2}-\d{2})/.exec(String(iso||'')); return m ? m[1] : ''; };
const dagMaand = iso => {
  const md = mmdd(iso); if(!md) return '';
  /* 2000 is een schrikkeljaar, dus 29 februari bestaat en verschuift niet. */
  const d = new Date(2000, Number(md.slice(0,2)) - 1, Number(md.slice(3)));
  return isNaN(d) ? '' : d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
};
/* De kolom crm_contacten.geboortedatum komt pas in de database nadat
   supabase/schema.sql opnieuw is gedraaid. Zolang hij er niet is tonen we het
   veld niet en sturen we het niet mee bij opslaan — anders faalt de hele
   update en kan er níéts meer aan een contactpersoon gewijzigd worden. */
const heeftGeboortedatum = () => {
  const rij = (CRM.state.contacten || []).find(Boolean);
  return !!rij && 'geboortedatum' in rij;
};
/* Dagen tot de eerstvolgende verjaardag; null als er geen datum is. */
function dagenTotJarig(ct){
  const md = mmdd(ct && ct.geboortedatum); if(!md) return null;
  const nu = new Date(); nu.setHours(0,0,0,0);
  let d = new Date(nu.getFullYear(), Number(md.slice(0,2))-1, Number(md.slice(3)));
  if(d < nu) d = new Date(nu.getFullYear()+1, Number(md.slice(0,2))-1, Number(md.slice(3)));
  return Math.round((d - nu) / 86400000);
}

/* Contactpersonen worden door CRM.load() opgehaald. Kom je hier via een
   directe link (#contacten/…) vóórdat dat rond is, dan halen we ze één keer
   zelf op — zelfde vangnet als op de relatiekaart. */
let _geladen = false;
function zorgContacten(){
  if(!Array.isArray(CRM.state.contacten)) CRM.state.contacten = [];
  if(CRM.demo || _geladen || CRM.state.contacten.length) return;
  _geladen = true;
  CRM.sb.from('crm_contacten').select('*').then(r => {
    if(r.error){ console.warn('crm_contacten laden', r.error); return; }
    CRM.state.contacten = r.data || [];
    if(CRM.view === 'contacten') CRM.render();
  });
}

/* ═══════════════════════════════════════════════════════════════
   INDEX — één keer per gegevenswijziging, niet één keer per rij

   Het overzicht moet voor élke contactpersoon weten wanneer er voor het
   laatst contact was, en dat antwoord komt deels uit de activiteiten van
   de relatie. Zonder index betekent dat: aantal contactpersonen × alle
   activiteiten, bij elke toetsaanslag in het zoekveld. Nu bouwen we de
   mappen één keer en is een rij een opzoeking.
   ═══════════════════════════════════════════════════════════════ */
let _idx = null, _stempel = '';
const stempelNu = () => [
  (CRM.state.activiteiten||[]).length, (CRM.state.contacten||[]).length,
  (CRM.state.taken||[]).length, (CRM.state.clients||[]).length
].join('/');
const LEEG = [];
function idx(){
  const s = stempelNu();
  if(_idx && _stempel === s) return _idx;
  const perKlant = new Map(), perContact = new Map(), ctPerKlant = new Map();
  const bij = (m, sleutel, waarde) => { const l = m.get(sleutel); l ? l.push(waarde) : m.set(sleutel, [waarde]); };
  (CRM.state.activiteiten||[]).forEach(a => {
    if(a.entiteit === 'klant')        bij(perKlant,   String(a.ref), a);
    else if(a.entiteit === 'contact') bij(perContact, String(a.ref), a);
  });
  (CRM.state.contacten||[]).forEach(c => bij(ctPerKlant, String(c.klant||''), c));
  _idx = {perKlant, perContact, ctPerKlant, lc:new Map()};
  _stempel = s;
  return _idx;
}
/* Na eigen schrijfwerk: de index mag niet blijven hangen op oude gegevens. */
function verversIndex(){ _idx = null; }

const contactById   = id => (CRM.state.contacten||[]).find(c => String(c.id) === String(id)) || null;
const contactenVan  = klant => idx().ctPerKlant.get(String(klant||'')) || LEEG;

/* Wanneer een activiteit hoort: een gespreksverslag draagt de datum van het
   gesprek (extra.datum), de rest de datum van vastleggen. */
const wanneerVan = a => (a.extra && a.extra.datum) || a.op || '';

/* ─── Activiteiten bij een persoon ────────────────────────────────
   VAST: rechtstreeks vastgelegd op deze persoon (entiteit 'contact').
   AFGELEID: staat bij de relatie en noemt deze persoon bij naam. Dat is
   een gok, geen registratie, en wordt op het scherm ook zo genoemd. De
   voornaam gebruiken we alleen als niemand anders bij dezelfde relatie zo
   heet — anders schrijven we een gesprek aan de verkeerde persoon toe. */
const vasteActs = ct => idx().perContact.get(String(ct.id)) || LEEG;

const woordIn = (tekst, woord) =>
  new RegExp('(^|[^\\p{L}\\p{N}])' + woord.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '([^\\p{L}\\p{N}]|$)','iu').test(tekst);

function afgeleideActs(ct){
  const naam = String(ct.naam||'').trim();
  if(!naam || !ct.klant) return LEEG;
  const vol  = naam.toLowerCase();
  const voor = voornaamVan(naam).toLowerCase();
  const voornaamUniek = voor.length > 2 &&
    contactenVan(ct.klant).filter(x => voornaamVan(x.naam).toLowerCase() === voor).length === 1;
  const bij = idx().perKlant.get(String(ct.klant)) || LEEG;
  return bij.filter(a => {
    const t = String(a.tekst||'').toLowerCase();
    if(!t) return false;
    return t.includes(vol) || (voornaamUniek && woordIn(t, voor));
  });
}

/* Laatste contactmoment. `vast` is een vastgelegd feit, `afgeleid` een
   vermelding bij de relatie. Een verslag met een datum in de toekomst telt
   niet mee: dat gesprek heeft nog niet plaatsgevonden. */
function laatsteContact(ct){
  const cache = idx().lc, sleutel = String(ct.id);
  if(cache.has(sleutel)) return cache.get(sleutel);
  const nu = CRM.todayISO();
  const nieuwste = lijst => {
    let uit = null;
    for(const a of lijst){
      const w = String(wanneerVan(a)).slice(0,10);
      if(w && w <= nu && (!uit || w > uit)) uit = w;
    }
    return uit;
  };
  const r = { vast: nieuwste(vasteActs(ct)), afgeleid: nieuwste(afgeleideActs(ct)) };
  /* Waar het overzicht op sorteert en filtert: het laatste moment dat we
     ergens kunnen aanwijzen, vastgelegd of afgeleid. */
  r.beste = [r.vast, r.afgeleid].filter(Boolean).sort().pop() || null;
  r.dagen = r.beste == null ? null : CRM.dagenGeleden(r.beste);
  cache.set(sleutel, r);
  return r;
}

/* ─── Opslaan ─────────────────────────────────────────────────── */
async function bewaarContact(rij, bestaat){
  const lijst = CRM.state.contacten;
  const i = lijst.findIndex(r => String(r.id) === String(rij.id));
  if(i >= 0) Object.assign(lijst[i], rij); else lijst.unshift(rij);
  verversIndex();
  if(!CRM.demo){
    if(bestaat){
      const {error} = await CRM.sb.from('crm_contacten').update(rij).eq('id', rij.id);
      if(error) return CRM.fout('Opslaan mislukt', error);
    }else{
      const {data, error} = await CRM.sb.from('crm_contacten').insert(rij).select().single();
      if(error) return CRM.fout('Opslaan mislukt', error);
      if(data) Object.assign(rij, data);
    }
  }
  CRM.toast('Opgeslagen','ok');
}
async function verwijderContact(id){
  CRM.state.contacten = (CRM.state.contacten||[]).filter(r => String(r.id) !== String(id));
  verversIndex();
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_contacten').delete().eq('id', id);
    if(error) return CRM.fout('Verwijderen mislukt', error);
  }
  CRM.toast('Verwijderd','ok');
}

/* ═══════════════════════════════════════════════════════════════
   OVERZICHT — "met wie heb ik al drie maanden niet gesproken"
   Dat is de vraag die vacatures oplevert, en die kon je nergens
   stellen. Daarom staat het stilte-filter vooraan en sorteert de
   lijst standaard op langst geen contact.
   ═══════════════════════════════════════════════════════════════ */
function overzicht(mount, acties){
  const alle = (CRM.state.contacten||[]).slice();
  acties.innerHTML = `<button class="btn ghost sm" id="ct_terug">← Relaties</button>
    <button class="btn sm" id="ct_nieuw">+ Contactpersoon</button>`;
  acties.querySelector('#ct_terug').onclick = () => CRM.ga('klanten');
  acties.querySelector('#ct_nieuw').onclick = () => bewerk('', null);

  if(!alle.length){
    mount.innerHTML = CRM.ui.leeg('Nog geen contactpersonen',
      'Leg op een relatiekaart vast met wie je bij die klant schakelt. Ze komen hier vanzelf bij te staan.',
      '<button class="btn ghost" id="ct_leegnaar">Naar Relaties</button>');
    mount.querySelector('#ct_leegnaar').onclick = () => CRM.ga('klanten');
    return;
  }

  const klanten = uniek(alle.map(c => c.klant));
  mount.innerHTML = `
    <div class="stack">
      <div class="card pad">
        <div class="row ck-fil">
          <div class="searchbox" style="flex:1;max-width:320px">
            <input type="search" id="cf_zoek" autocomplete="off"
                   placeholder="Zoek op naam, functie, relatie of e-mail…" value="${h(F.zoek)}">
          </div>
          <select id="cf_klant" style="width:auto">
            <option value="">Alle relaties</option>
            ${klanten.map(k=>`<option value="${h(k)}"${F.klant===k?' selected':''}>${h(k)}</option>`).join('')}
          </select>
          <select id="cf_stil" style="width:auto">
            <option value="">Alle contactmomenten</option>
            <option value="30"${F.stil==='30'?' selected':''}>Langer dan 30 dagen niet gesproken</option>
            <option value="90"${F.stil==='90'?' selected':''}>Langer dan 90 dagen niet gesproken</option>
            <option value="nooit"${F.stil==='nooit'?' selected':''}>Nooit contact vastgelegd</option>
          </select>
          <button class="chip btn-like${F.hoofd?' on':''}" id="cf_hoofd" aria-pressed="${F.hoofd?'true':'false'}">Alleen hoofdcontact</button>
          <select id="cf_sort" style="width:auto">
            <option value="stil"${F.sort==='stil'?' selected':''}>Langst geen contact</option>
            <option value="naam"${F.sort==='naam'?' selected':''}>Naam</option>
            <option value="klant"${F.sort==='klant'?' selected':''}>Relatie</option>
            <option value="jarig"${F.sort==='jarig'?' selected':''}>Eerstvolgende verjaardag</option>
          </select>
          <span class="spacer"></span>
          <span class="meta num" id="cf_telling"></span>
        </div>
      </div>
      <div id="ct_lijst"></div>
    </div>`;

  const zoekEl = mount.querySelector('#cf_zoek');
  zoekEl.oninput = CRM.debounce(() => { zet('zoek', zoekEl.value); tekenLijst(mount); }, 180);
  mount.querySelector('#cf_klant').onchange = e => { zet('klant', e.target.value); tekenLijst(mount); };
  mount.querySelector('#cf_stil').onchange  = e => { zet('stil',  e.target.value); tekenLijst(mount); };
  mount.querySelector('#cf_sort').onchange  = e => { zet('sort',  e.target.value); tekenLijst(mount); };
  mount.querySelector('#cf_hoofd').onclick  = e => {
    zet('hoofd', !F.hoofd);
    e.currentTarget.classList.toggle('on', F.hoofd);
    e.currentTarget.setAttribute('aria-pressed', F.hoofd ? 'true' : 'false');
    tekenLijst(mount);
  };
  tekenLijst(mount);
}

function gefilterd(){
  const q = F.zoek.trim().toLowerCase();
  let rij = (CRM.state.contacten||[]).filter(c => {
    if(F.klant && c.klant !== F.klant) return false;
    if(F.hoofd && !c.hoofd) return false;
    if(q){
      const hooi = [c.naam, c.functie, c.klant, c.email, c.telefoon].join(' ').toLowerCase();
      if(!hooi.includes(q)) return false;
    }
    if(F.stil){
      const d = laatsteContact(c).dagen;
      if(F.stil === 'nooit'){ if(d != null) return false; }
      else if(d != null && d <= Number(F.stil)) return false;
    }
    return true;
  });
  const opNaam = (a,b) => String(a.naam||'').localeCompare(String(b.naam||''),'nl');
  const sorteer = {
    /* Nooit contact staat bovenaan: dat is de langste stilte die er is. */
    stil: (a,b) => {
      const da = laatsteContact(a).dagen, db = laatsteContact(b).dagen;
      if(da == null && db == null) return opNaam(a,b);
      if(da == null) return -1;
      if(db == null) return 1;
      return db - da || opNaam(a,b);
    },
    naam:  opNaam,
    klant: (a,b) => String(a.klant||'').localeCompare(String(b.klant||''),'nl')
                    || (b.hoofd?1:0) - (a.hoofd?1:0) || opNaam(a,b),
    jarig: (a,b) => {
      const da = dagenTotJarig(a), db = dagenTotJarig(b);
      if(da == null && db == null) return opNaam(a,b);
      if(da == null) return 1;
      if(db == null) return -1;
      return da - db || opNaam(a,b);
    }
  };
  return rij.sort(sorteer[F.sort] || opNaam);
}

/* Eén regel voor de stilte, in dezelfde woorden als op de kaart. */
/* De kleur van de streep links (.frand in base.css). Op elk ander scherm
   draagt die de fase, maar een contactpersoon hééft geen fase — het enige
   dat hier verloopt is de tijd sinds je hem sprak, en dat is precies waar
   dit overzicht op sorteert. Dus loopt de schaal over de tijd, met dezelfde
   grenzen als de tekst in de kolom ernaast (30 en 90 dagen), zodat de kleur
   en het getal nooit iets anders zeggen.

   "Nooit" krijgt bewust GEEN rand. Van de 188 geïmporteerde contactpersonen
   staat bij vrijwel niemand een gesprek vastgelegd, en dat betekent niet dat
   er nooit gebeld is — het betekent dat we het niet weten. Kleurden die
   allemaal rood, dan was het hele scherm rood en zei rood niets meer; precies
   dezelfde reden waarom de fase Lead op het salesbord buiten de tellingen
   valt. Het woord "nooit" staat al in amber in de kolom ernaast, dus het
   signaal is er wel. Rood is voor wat we wél weten: langer dan 90 dagen
   geleden gesproken. */
function stilteRand(ct){
  const d = laatsteContact(ct).dagen;
  if(d == null) return {kleur:'', let_:false};                 // onbekend, geen rand
  if(d > 90)    return {kleur:'', let_:true};                  // rood wint
  if(d > 30)    return {kleur:'var(--amber)', let_:false};
  return {kleur:'var(--green)', let_:false};
}

function stilteHtml(ct){
  const lc = laatsteContact(ct);
  if(lc.dagen == null) return '<span class="ck-stil nooit">nooit</span>';
  const klasse = lc.dagen > 90 ? ' nooit' : lc.dagen > 30 ? ' lang' : '';
  return `<span class="ck-stil${klasse} num">${lc.dagen === 0 ? 'vandaag' : lc.dagen + ' dagen'}</span>`
    + (lc.vast ? '' : '<span class="meta ck-afg" title="Afgeleid: deze persoon wordt genoemd in een activiteit bij de relatie, er staat niets bij de persoon zelf">afgeleid</span>');
}

function tekenLijst(mount){
  const el = mount.querySelector('#ct_lijst'); if(!el) return;
  const rij = gefilterd();
  const tel = mount.querySelector('#cf_telling');
  const totaal = (CRM.state.contacten||[]).length;
  if(tel) tel.textContent = rij.length === totaal
    ? `${totaal} contactperso${totaal===1?'on':'nen'}`
    : `${rij.length} van ${totaal}`;

  if(!rij.length){
    el.innerHTML = CRM.ui.leeg('Geen contactpersoon gevonden','Pas je zoekterm of filters aan.');
    return;
  }
  /* De kolom Jarig alleen als de database hem heeft — anders staat er een
     kolom vol streepjes waar niemand ooit iets in kan zetten. */
  const jarigKolom = heeftGeboortedatum();
  el.innerHTML = `<div class="tblwrap"><table class="tbl ck-tbl${jarigKolom?' metjarig':''}">
    <thead><tr>
      <th>Naam</th><th>Functie</th><th>Relatie</th><th>Bereikbaar</th>
      <th>Laatste contact</th>${jarigKolom?'<th>Jarig</th>':''}
    </tr></thead><tbody>
    ${rij.map(c => {
      const jarig = jarigKolom ? dagMaand(c.geboortedatum) : '';
      const dagen = dagenTotJarig(c);
      const rand = stilteRand(c);
      return `<tr${CRM.ui.frand(rand.kleur, 'clickable', rand.let_)} data-ct="${h(c.id)}">
        <td><b>${h(c.naam)}</b>${c.hoofd?' <span class="chip green">Hoofdcontact</span>':''}
          <span class="ck-mobfunctie">${h(c.functie||'—')}</span></td>
        <td>${h(c.functie||'—')}</td>
        <td>${h(c.klant||'—')}</td>
        <td class="ck-bereik">${[
          /* Een link, geen platte tekst: tel: opent FaceTime en die zet het
             gesprek door naar de iPhone — zelfde telHref als de rail. */
          c.telefoon ? `<a class="num" href="${h(telHref(c.telefoon))}">${h(c.telefoon)}</a>` : '',
          c.email ? `<span class="trunc">${h(c.email)}</span>` : ''
        ].filter(Boolean).join('') || '<span class="meta">geen gegevens</span>'}</td>
        <td>${stilteHtml(c)}</td>
        ${jarigKolom ? `<td class="num">${jarig
          ? h(jarig) + (dagen === 0 ? ' <span class="chip green">vandaag</span>'
              : dagen != null && dagen <= 14 ? ` <span class="chip green">over ${dagen} dgn</span>` : '')
          : '<span class="meta">—</span>'}</td>` : ''}
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
  /* De rij opent de contactkaart — behálve als je op de bellink klikt:
     anders belt één klik én navigeert hij weg van waar je was. */
  el.querySelectorAll('[data-ct]').forEach(r => r.onclick = e => {
    if(e.target.closest('a')) return;
    open(r.dataset.ct);
  });
}

/* ═══════════════════════════════════════════════════════════════
   DE KAART VAN ÉÉN PERSOON
   ═══════════════════════════════════════════════════════════════ */
let kaartOpen = null, tijdlijnAlles = false;

function open(id){ CRM.ga('contacten', {id:String(id)}); }

/* Is er een vastgelegde koppeling naar een contactpersoon? Die kolom
   bestaat vandaag nog niet (zie het verzoek onderaan). Zodra hij er is
   herkennen we hem hier en verdwijnt de afleiding vanzelf. */
const heeftKoppeling = rij => !!rij && 'contact_id' in rij;
const vanContact = (rij, id) => String((rij && rij.contact_id) || '') === String(id);

/* Wat er bij deze relatie loopt. `vast` zegt of de lijst op een
   vastgelegde koppeling berust of via de relatie is afgeleid. */
function werkVan(ct){
  const vacs  = ct.klant ? CRM.vacaturesVan(ct.klant) : [];
  const cands = ct.klant ? CRM.kandidaten().filter(c => c.klant === ct.klant) : [];
  const ruw   = id => (CRM.state.cands||[]).find(r => String(r.id) === String(id)) || null;

  const vacGekoppeld  = vacs.filter(v => vanContact(v, ct.id));
  const candGekoppeld = cands.filter(c => vanContact(ruw(c.id), ct.id));
  const vacVast  = heeftKoppeling(vacs[0])  && vacGekoppeld.length  > 0;
  const candVast = heeftKoppeling(ruw((cands[0]||{}).id)) && candGekoppeld.length > 0;

  return {
    vacs:  vacVast  ? vacGekoppeld  : vacs,
    cands: candVast ? candGekoppeld : cands,
    vacVast, candVast
  };
}

function kaart(mount, acties, id){
  const ct = contactById(id);
  if(!ct){
    acties.innerHTML = '';
    mount.innerHTML = CRM.ui.leeg('Contactpersoon niet gevonden',
      'Deze persoon staat niet (meer) in het systeem.',
      '<button class="btn ghost" id="ck_terug">Naar alle contactpersonen</button>');
    mount.querySelector('#ck_terug').onclick = () => CRM.ga('contacten');
    return;
  }
  if(kaartOpen !== String(ct.id)){ kaartOpen = String(ct.id); tijdlijnAlles = false; }

  const klant = ct.klant ? CRM.klant(ct.klant) : null;
  const lc    = laatsteContact(ct);
  const werk  = werkVan(ct);

  acties.innerHTML = `
    <button class="btn ghost sm" id="ck_alle">← Contactpersonen</button>
    ${klant ? `<button class="btn ghost sm" id="ck_klant">Relatiekaart</button>` : ''}
    <button class="btn ghost sm" id="ck_bewerk">Gegevens bewerken</button>`;
  acties.querySelector('#ck_alle').onclick = () => CRM.ga('contacten');
  acties.querySelector('#ck_klant')?.addEventListener('click', () => CRM.ga('klanten', {id:ct.klant}));
  acties.querySelector('#ck_bewerk').onclick = () => bewerk(ct.klant, ct);

  mount.innerHTML = `
    <div class="stack">
      ${heroHtml(ct, klant)}
      ${kpiHtml(ct, lc, werk)}
      <div class="ck-dossier">
        <aside class="ck-rail">
          ${gegevensHtml(ct, klant)}
          ${vervolgHtml(ct)}
        </aside>
        <div class="ck-werk">
          <div class="ck-kol">
            ${vastlegHtml(ct)}
            ${signalenHtml(ct, klant, lc)}
            ${tijdlijnHtml(ct)}
          </div>
          <div class="ck-kol">
            ${/* Mail bovenaan de kolom: het gesprek van vandaag zegt meer
                 over deze relatie dan de jaarcijfers eronder — en onderaan
                 werd het blok simpelweg niet gezien (Tjeerd, 4 aug 2026). */''}
            ${CRM.mailUI ? CRM.mailUI.blokHtml(ct.email, 'ck_mailblok') : ''}
            ${werkHtml(ct, werk)}
            ${jaarHtml(ct, werk)}
          </div>
        </div>
      </div>
    </div>`;

  bindKaart(mount, ct, klant);
}

/* Kop: wie is dit, waar hoort deze persoon, en de knoppen die echt iets
   doen — bellen en mailen voorop. */
function heroHtml(ct, klant){
  const jarigOp = heeftGeboortedatum() ? dagMaand(ct.geboortedatum) : '';
  const jarigNu = !!jarigOp && mmdd(ct.geboortedatum) === CRM.todayISO().slice(5);
  const klantDeel = ct.klant
    ? (klant ? `<a href="#klanten/${encodeURIComponent(ct.klant)}" class="ck-klantlink">${h(ct.klant)}</a>`
             : `<span title="Deze relatie staat niet (meer) in het systeem">${h(ct.klant)}</span>`)
    : '';
  const links = [
    ct.telefoon ? `<a class="num" href="${h(telHref(ct.telefoon))}">${h(ct.telefoon)}</a>` : '',
    ct.email    ? `<a href="mailto:${h(ct.email)}">${h(ct.email)}</a>` : '',
    veiligeUrl(ct.linkedin) ? `<a href="${h(veiligeUrl(ct.linkedin))}" target="_blank" rel="noopener">LinkedIn</a>` : ''
  ].filter(Boolean).join('<span class="ck-sep">·</span>');

  const outlookAan = !!(CRM.outlook && CRM.outlook.beschikbaar?.() && CRM.outlook.verbonden?.());
  return `<div class="card"><div class="card-b ck-hero">
      <div class="ck-hero-t">
        <div class="row tight" style="gap:10px;align-items:center">
          <div class="h1 ck-naam">${h(ct.naam)}</div>
          ${ct.hoofd ? '<span class="chip green">Hoofdcontact</span>' : ''}
          ${jarigNu ? '<span class="chip green">Jarig vandaag</span>' : ''}
        </div>
        <div class="meta ck-wie">${[
          h(ct.functie || 'functie onbekend'), klantDeel
        ].filter(Boolean).join('<span class="ck-sep"> · </span>')}</div>
        ${links ? `<div class="ck-contact">${links}</div>`
                : '<div class="ck-contact meta">Geen telefoonnummer of e-mailadres vastgelegd</div>'}
      </div>
      <div class="row tight ck-snel">
        ${ct.telefoon ? `<a class="btn ghost sm" id="ck_bel" href="${h(telHref(ct.telefoon))}">Bellen</a>` : ''}
        ${ct.email ? '<button class="btn ghost sm" id="ck_mail">Mailen</button>' : ''}
        <button class="btn ghost sm" id="ck_notitie">Notitie</button>
        <button class="btn ghost sm" id="ck_verslag">Gespreksverslag</button>
        <button class="btn sm" id="ck_taak">+ Taak</button>
        ${outlookAan && (ct.email || ct.telefoon)
          ? '<button class="btn sub sm" id="ck_outlook" title="Zet deze persoon in je Outlook-adresboek, dan ziet je telefoon wie er belt">Naar Outlook</button>' : ''}
      </div>
    </div></div>`;
}

/* ─── Snel vastleggen ─────────────────────────────────────────────
   Tjeerd (3 aug 2026): "dat ik bovenaan een notitie kan maken die meer
   prominent aanwezig is en dat ik snel een opvolgtaak kan maken." De
   notitieknop zat verstopt tussen vijf knopjes in de kop en opende eerst
   nog een venster — twee stappen vóór je kon typen. Dit blok staat
   bovenaan de tijdlijn en ís meteen het invoerveld; de opvolgtaak zit
   ernaast zodat vastleggen en opvolgen één beweging is. */
function vastlegHtml(ct){
  return `<div class="card ck-vastleg"><div class="card-b">
    ${/* Dezelfde knoppenrij als op de relatiekaart — gebeld, geen gehoor,
         voicemail, WhatsApp, gemaild, notitie, taak (naam: Tjeerd, 7 aug
         2026). Eén bron in js/klanten.js, dus ze kunnen niet uit elkaar
         lopen. Hier hoeft niet gevraagd te worden mét wie: je staat al op
         de kaart van die persoon. */
      CRM.uitkomsten ? CRM.uitkomsten.html() : ''}
    <textarea id="ck_snelnotitie" rows="2"
      placeholder="Wat is er besproken of afgesproken met ${h(ct.naam)}?"></textarea>
    <div class="row tight" style="margin-top:8px">
      <button class="btn sm" id="ck_snelbewaar">Notitie opslaan</button>
      <button class="btn ghost sm" id="ck_snelopvolg">Opslaan + opvolgtaak</button>
      <span class="spacer"></span>
      <button class="lnk" id="ck_snelverslag">uitgebreid gespreksverslag →</button>
    </div>
  </div></div>`;
}

/* Kerncijfers. "Laatste contact" staat vooraan omdat dat het getal is
   waar een accountmanager op stuurt. */
function kpiHtml(ct, lc, werk){
  const vast = vasteActs(ct), afg = afgeleideActs(ct);
  const verslagen = vast.filter(a => a.extra && a.extra.verslag).length;

  let lcWaarde = '<span class="big">—</span>', lcDetail = 'nog niets vastgelegd';
  if(lc.beste != null){
    const d = CRM.dagenGeleden(lc.beste);
    lcWaarde = `<span class="big">${d === 0 ? 'vandaag' : d}</span>${d === 0 ? '' : '<span class="ck-eenheid">dagen geleden</span>'}`;
    lcDetail = (lc.vast === lc.beste ? 'vastgelegd op ' : 'afgeleid uit een activiteit bij de relatie · ')
             + CRM.fmtDate(lc.beste);
  }
  const open = werk.vacs.filter(v => (v.status||'Open') === 'Open');
  const traject = werk.cands.filter(c => !!c.fase && !CRM.DONE.includes(c.fase));

  return `<div class="grid c4 ck-kpi">
    <div class="kpi accent"><div class="label">Laatste contact</div>
      <div class="ck-lc">${lcWaarde}</div><div class="kd">${h(lcDetail)}</div></div>
    ${CRM.ui.kpi('Contactmomenten', `<span class="big">${vast.length}</span>`,
      verslagen ? `waarvan <span class="num">${verslagen}</span> gespreksverslag${verslagen===1?'':'en'}`
                : (afg.length ? `plus <span class="num">${afg.length}</span> afgeleid uit de relatie` : 'vastgelegd bij deze persoon'))}
    ${CRM.ui.kpi('Open vacatures', `<span class="big">${open.length}</span>`,
      werk.vacVast ? 'aan deze persoon gekoppeld' : 'bij deze relatie · afgeleid')}
    ${CRM.ui.kpi('In traject', `<span class="big">${traject.length}</span>`,
      werk.candVast ? 'via deze persoon' : 'bij deze relatie · afgeleid')}
  </div>`;
}

/* Rail: de gegevens zelf. Label links, waarde rechts — zelfde ritme als
   het gegevensblok op de relatiekaart. */
function gegevensHtml(ct, klant){
  const rij = (lbl, val) => `<div class="ck-gg-rij"><span class="ck-gg-lbl">${h(lbl)}</span>
    <span class="ck-gg-val">${val}</span></div>`;
  const leeg = '<span class="meta">—</span>';
  const jarigOp = heeftGeboortedatum() ? dagMaand(ct.geboortedatum) : '';
  return `<div class="card kl-railkaart ck-railkaart">
    <div class="card-h"><div class="h2">Gegevens</div><span class="spacer"></span>
      <button class="btn sub sm" id="ck_gbewerk">Bewerken</button></div>
    <div class="card-b">
      <div class="ck-gg">
        ${rij('Functie', ct.functie ? h(ct.functie) : leeg)}
        ${rij('Relatie', ct.klant
          ? (klant ? `<a href="#klanten/${encodeURIComponent(ct.klant)}">${h(ct.klant)}</a>`
                   : `${h(ct.klant)} <span class="chip amber">onbekend</span>`)
          : leeg)}
        ${rij('Rol', ct.hoofd ? '<span class="chip green">Hoofdcontact</span>' : '<span class="meta">contactpersoon</span>')}
        ${rij('Telefoon', ct.telefoon ? `<a class="num" href="${h(telHref(ct.telefoon))}">${h(ct.telefoon)}</a>` : leeg)}
        ${rij('E-mail', ct.email ? `<a href="mailto:${h(ct.email)}">${h(ct.email)}</a>` : leeg)}
        ${rij('LinkedIn', veiligeUrl(ct.linkedin)
          ? `<a href="${h(veiligeUrl(ct.linkedin))}" target="_blank" rel="noopener">profiel</a>` : leeg)}
        ${heeftGeboortedatum() ? rij('Jarig', jarigOp ? `<span class="num">${h(jarigOp)}</span>` : leeg) : ''}
      </div>
      ${ct.note ? `<p class="ck-note">${h(ct.note)}</p>` : ''}
    </div></div>`;
}

/* Rail: vervolg — de verjaardag en wat er nog open staat.
   Taken hangen in dit systeem aan de relatie, niet aan een persoon (er is
   geen kolom voor). Daarom tonen we de open taken van de relatie die déze
   persoon noemen als afgeleid, met daaronder de rest als telling. Zo
   verdwijnt er niets en doen we niet alsof de koppeling bestaat. */
function vervolgHtml(ct){
  const dagen = dagenTotJarig(ct);
  const jarigOp = heeftGeboortedatum() ? dagMaand(ct.geboortedatum) : '';
  const jarig = jarigOp ? (dagen === 0
      ? `<div class="ck-jarig nu"><b>Vandaag jarig</b><span class="meta">Even bellen — dat is het moment.</span></div>`
      : dagen != null && dagen <= 30
        ? `<div class="ck-jarig"><b>Jarig op <span class="num">${h(jarigOp)}</span></b><span class="meta">over <span class="num">${dagen}</span> dagen</span></div>`
        : '') : '';

  const naam = String(ct.naam||'').toLowerCase();
  const voor = voornaamVan(ct.naam).toLowerCase();
  const alle = (CRM.state.taken||[]).filter(t =>
    !t.klaar && t.entiteit === 'klant' && String(t.ref) === String(ct.klant||''));
  const mijn = alle.filter(t => {
    const s = String(t.tekst||'').toLowerCase();
    return naam && (s.includes(naam) || (voor.length > 2 && woordIn(s, voor)));
  });
  const rest = alle.length - mijn.length;

  const lijst = mijn.length
    ? `<div class="ck-taken">${mijn.sort((a,b)=>String(a.datum||'').localeCompare(String(b.datum||'')))
        .map(t => `<label class="ck-taak"><input type="checkbox" data-taak="${h(t.id)}">
          <span><b>${h(t.tekst)}</b><span class="meta"><span class="num">${h(CRM.fmtDate(t.datum))}</span>${
            t.voor ? ' · voor ' + h(t.voor) : ''}${
            t.prioriteit === 'Hoog' ? ' <span class="chip amber">Hoog</span>' : ''}</span></span>
          </label>`).join('')}</div>
       <p class="meta ck-afleiding">Afgeleid: deze taken staan bij ${h(ct.klant||'de relatie')} en noemen deze persoon.</p>`
    : `<p class="meta" style="margin:0">Geen open taak die deze persoon noemt.</p>`;

  return `<div class="card kl-railkaart ck-railkaart">
    <div class="card-h"><div class="h2">Vervolg</div><span class="spacer"></span>
      <button class="btn sm" id="ck_rtaak">+ Taak</button></div>
    <div class="card-b">
      ${jarig}
      ${lijst}
      ${rest > 0 ? `<button class="btn sub sm ck-railknop" id="ck_meertaken">Nog <span class="num">${rest}</span> open taak${rest===1?'':'en'} bij ${h(ct.klant)}</button>` : ''}
    </div></div>`;
}

/* Signalen: alleen tonen wat echt speelt, in de woorden van een AM. */
function signalenHtml(ct, klant, lc){
  const s = [];
  if(lc.beste == null)
    s.push('Er is nog nooit contact met deze persoon vastgelegd.');
  else{
    const d = CRM.dagenGeleden(lc.beste);
    if(d > 90) s.push(`Al <b class="num">${d}</b> dagen niet gesproken — dit is precies het gesprek dat vacatures oplevert.`);
    else if(d > 30) s.push(`Al <b class="num">${d}</b> dagen geen contact — tijd voor een belletje.`);
    if(!lc.vast && lc.afgeleid)
      s.push('Bij deze persoon staat niets vastgelegd; wat we weten komt uit activiteiten bij de relatie. Leg een gespreksverslag vast, dan klopt het beeld.');
  }
  if(!ct.telefoon && !ct.email)
    s.push('Geen telefoonnummer en geen e-mailadres — deze persoon is nu niet te bereiken vanuit het systeem.');
  if(ct.klant && !klant)
    s.push(`De relatie <b>${h(ct.klant)}</b> staat niet in het systeem. Controleer de schrijfwijze; de koppeling loopt op naam.`);
  if(!ct.klant)
    s.push('Deze persoon hangt aan geen enkele relatie.');
  if(!s.length) return '';
  return `<div class="card"><div class="card-h"><div class="h2">Signalen</div>
      <span class="chip amber num">${s.length}</span></div>
    <div class="card-b"><ul class="ck-sig">${s.map(x=>`<li>${x}</li>`).join('')}</ul></div></div>`;
}

/* De geschiedenis met deze persoon. Vastgelegd en afgeleid door elkaar op
   datum, want zo is het gesprek ook verlopen — maar wel uit elkaar te
   houden: afgeleide regels dragen een merkteken. */
function tijdlijnHtml(ct){
  const vast = vasteActs(ct).map(a => ({a, afgeleid:false}));
  const afg  = afgeleideActs(ct).map(a => ({a, afgeleid:true}));
  const alle = vast.concat(afg)
    .sort((x,y) => String(wanneerVan(y.a)).localeCompare(String(wanneerVan(x.a))));
  const toon = tijdlijnAlles ? alle : alle.slice(0, 8);

  const items = toon.map(({a, afgeleid}) => {
    const w = wanneerVan(a);
    const soort = (a.extra && a.extra.verslag) ? 'Gespreksverslag'
                : (CRM.ACT_SOORTEN[a.soort]||{}).lbl || a.soort;
    return `<div class="tl-i"><div class="tl-ic">${h((CRM.ACT_SOORTEN[a.soort]||{}).ico || '•')}</div>
      <div class="tl-c">
        <div class="tl-top"><b>${h(soort)}${a.door ? ' · ' + h(a.door) : ''}</b>
          ${afgeleid ? '<span class="chip ck-afgchip" title="Deze activiteit staat bij de relatie en noemt deze persoon bij naam. Niet vastgelegd bij de persoon zelf.">afgeleid</span>' : ''}
          <span class="tl-when">${h(CRM.fmtDate(w))} · ${h(CRM.geleden(w))}${a.extra && a.extra.bewerkt ? ' · bewerkt' : ''}</span>
          ${!afgeleid && CRM.magBewerken?.(a)
            ? `<button type="button" class="lnk tl-bewerk" data-ckbewerk="${h(a.id)}" title="Notitie aanpassen">bewerk</button>` : ''}</div>
        ${a.tekst ? `<div class="tl-txt">${h(a.tekst)}</div>` : ''}
      </div></div>`;
  }).join('');

  return `<div class="card"><div class="card-h"><div class="h2">Geschiedenis</div>
      <span class="spacer"></span>
      <span class="meta num">${vast.length} vastgelegd${afg.length ? ' · ' + afg.length + ' afgeleid' : ''}</span></div>
    <div class="card-b">
      ${alle.length ? `<div class="tl">${items}</div>` : CRM.ui.leeg('Nog niets vastgelegd',
        'Leg een gespreksverslag of notitie vast, dan bouwt het geheugen van deze relatie zich vanzelf op.')}
      ${alle.length > 8 ? `<button class="btn sub sm ck-meer" id="ck_meer">${
        tijdlijnAlles ? 'Toon alleen de laatste 8' : `Toon alle ${alle.length}`}</button>` : ''}
    </div></div>`;
}

/* Wat er via deze persoon loopt: open vacatures en lopende trajecten.
   Zonder vastgelegde koppeling is dit alles wat bij de relatie loopt —
   dat staat er met zoveel woorden bij, want een afleiding mag nooit als
   feit op het scherm staan. */
function werkHtml(ct, werk){
  if(!ct.klant) return '';
  const open    = werk.vacs.filter(v => (v.status||'Open') === 'Open');
  const traject = werk.cands.filter(c => !!c.fase && !CRM.DONE.includes(c.fase))
    .sort((a,b) => CRM.faseIdx(b.fase) - CRM.faseIdx(a.fase));

  const vacRij = v => {
    const dg = CRM.dagenGeleden(v.aangemaakt);
    return `<div class="ck-rij"><b class="trunc">${h(v.functie||'Vacature')}</b>
      <span class="meta">${[v.locatie, dg != null ? dg + ' dagen open' : ''].filter(Boolean).join(' · ')}</span></div>`;
  };
  const candRij = c => `<a class="ck-rij klik" href="#kandidaten/${encodeURIComponent(c.id)}">
      <b class="trunc">${h(c.naam)}</b>
      <span class="meta">${h(c.functie||'')}</span>
      <span class="chip" style="border-color:${h(CRM.faseKleur(c.fase))}"><i class="dot" style="background:${h(CRM.faseKleur(c.fase))}"></i>${h(CRM.faseNorm(c.fase))}</span>
    </a>`;

  return `<div class="card"><div class="card-h"><div class="h2">Via deze persoon</div>
      <span class="chip${werk.vacVast && werk.candVast ? ' green' : ''}">${
        werk.vacVast && werk.candVast ? 'vastgelegd' : 'afgeleid'}</span></div>
    <div class="card-b">
      ${(werk.vacVast && werk.candVast) ? '' : `<p class="note info ck-afleiding-blok">Er is geen veld dat een vacature of een kandidaat aan een contactpersoon koppelt. Wat hieronder staat loopt bij <b>${h(ct.klant)}</b> — of deze persoon er zelf over gaat, weet het systeem niet.</p>`}
      <div class="label ck-sublabel">Open vacatures</div>
      ${open.length ? `<div class="ck-lijst">${open.map(vacRij).join('')}</div>`
                    : '<p class="meta ck-geen">Geen open vacatures bij deze relatie.</p>'}
      <div class="label ck-sublabel">In gesprek of onderweg</div>
      ${traject.length ? `<div class="ck-lijst">${traject.slice(0,8).map(candRij).join('')}</div>${
          traject.length > 8 ? `<p class="meta ck-geen">en nog <span class="num">${traject.length-8}</span> anderen.</p>` : ''}`
        : '<p class="meta ck-geen">Er loopt op dit moment niemand.</p>'}
    </div></div>`;
}

/* Wie deze relatie dit jaar aannam en wie ze afwezen. Dat zegt meer over
   wat er gezocht wordt dan welke functieomschrijving dan ook — en het is
   het gesprek dat je met deze persoon voert. */
function jaarHtml(ct, werk){
  if(!ct.klant) return '';
  const jaar = CRM.todayISO().slice(0,4);
  const cs = werk.cands;
  const aangenomen = cs.filter(c => String(c.geplaatstOp||'').slice(0,4) === jaar)
    .sort((a,b) => String(b.geplaatstOp).localeCompare(String(a.geplaatstOp)));
  /* Afgewezen dóór de klant — niet: kandidaat haakte zelf af. Er is geen
     afwijsdatum in de gegevens, dus we gebruiken de datum van de laatste
     fasewissel (`since`); dat is het moment waarop de kaart daar terechtkwam. */
  const AFWIJS = ['Klant wees af','Meeloopdag niet goed'];
  const afgewezenAlles = cs.filter(c => AFWIJS.includes(c.afvalCat));
  const afgewezen = afgewezenAlles.filter(c => String(c.since||'').slice(0,4) === jaar)
    .sort((a,b) => String(b.since).localeCompare(String(a.since)));

  const rij = (c, wanneer, extra) => `<a class="ck-rij klik" href="#kandidaten/${encodeURIComponent(c.id)}">
      <b class="trunc">${h(c.naam)}</b>
      <span class="meta">${h([c.functie, extra].filter(Boolean).join(' · '))}</span>
      <span class="meta num ck-rij-d">${h(CRM.fmtDateShort(wanneer))}</span></a>`;

  return `<div class="card"><div class="card-h"><div class="h2">Dit jaar bij deze relatie</div>
      <span class="chip">afgeleid</span></div>
    <div class="card-b">
      <div class="label ck-sublabel">Aangenomen in <span class="num">${h(jaar)}</span> · ${aangenomen.length}</div>
      ${aangenomen.length ? `<div class="ck-lijst">${aangenomen.slice(0,6).map(c => rij(c, c.geplaatstOp)).join('')}</div>`
        : '<p class="meta ck-geen">Dit jaar nog niemand aangenomen.</p>'}
      <div class="label ck-sublabel">Afgewezen door de klant · ${afgewezen.length}</div>
      ${afgewezen.length ? `<div class="ck-lijst">${afgewezen.slice(0,6).map(c => rij(c, c.since, c.afvalCat)).join('')}</div>`
        : `<p class="meta ck-geen">Dit jaar niemand afgewezen${
            afgewezenAlles.length ? `, eerder <span class="num">${afgewezenAlles.length}</span>` : ''}.</p>`}
    </div></div>`;
}

/* ─── Knoppen van de kaart ────────────────────────────────────── */
function mailOpties(ct){
  return {
    aan: ct.email || '',
    wie: `${ct.naam}${ct.klant ? ' — ' + ct.klant : ''}`,
    set: 'klant',
    ctx: { voornaam: voornaamVan(ct.naam), klant: ct.klant || '' },
    entiteit: 'contact', ref: String(ct.id),
    na(){ CRM.render(); }
  };
}

function bindKaart(mount, ct, klant){
  const opnieuw = () => { verversIndex(); CRM.render(); };

  if(CRM.mailUI){
    CRM.mailUI.laad(mount, ct.email, 'ck_mailblok');
    /* Het adres in de kop en in de rail opent hetzelfde opstelvenster. */
    CRM.mailUI.bindLinks(mount, mailOpties(ct));
    const mailKnop = mount.querySelector('#ck_mail');
    if(mailKnop) mailKnop.onclick = () => CRM.mailUI.opstellen(mailOpties(ct));
  }
  const ol = mount.querySelector('#ck_outlook');
  if(ol && CRM.naarOutlook) ol.onclick = () => CRM.naarOutlook(ol, {
    naam: ct.naam, email: ct.email, telefoon: ct.telefoon,
    bedrijf: ct.klant, functie: ct.functie
  });

  mount.querySelector('#ck_notitie').onclick = async () => {
    const tekst = await CRM.vraag('Notitie bij ' + ct.naam,
      {multiline:true, hint:'Tip: @collega stuurt diegene een melding.', knop:'Vastleggen'});
    if(!tekst) return;
    await CRM.logActiviteit('contact', String(ct.id), 'notitie', tekst);
    CRM.verwerkTags(tekst, 'contact', String(ct.id));
    CRM.toast('Vastgelegd','ok');
    opnieuw();
  };
  mount.querySelector('#ck_verslag').onclick = () => verslagModal(ct, opnieuw);

  /* Een taak hoort in dit systeem bij de relatie: het dashboard, de
     relatiekaart en de meldingen lezen allemaal entiteit 'klant'. Een taak
     op een contact-id zou daar als een kaal id verschijnen. De naam van de
     persoon staat in de kop van het venster én, als je hem overneemt, in de
     taaktekst — daar vindt de kaart hem straks weer terug. */
  const taak = () => CRM.taakModal({
    entiteit:'klant', ref: ct.klant || '',
    refLabel: `${ct.naam}${ct.klant ? ' (' + ct.klant + ')' : ''}`,
    tekst: ct.naam + ' '
  }).then(r => { if(r) opnieuw(); });
  mount.querySelector('#ck_taak').onclick  = taak;
  mount.querySelector('#ck_rtaak').onclick = taak;

  /* Een opgeslagen notitie aanpassen — het venster is gedeeld met de
     klantkaart (CRM.bewerkActiviteit, js/klanten.js). */
  CRM.$$('[data-ckbewerk]', mount).forEach(b => b.onclick = () => {
    const a = (CRM.state.activiteiten||[]).find(x => String(x.id) === b.dataset.ckbewerk);
    if(a && CRM.bewerkActiviteit) CRM.bewerkActiviteit(a, opnieuw);
  });

  /* Bellen vanaf de kaart telt als belpoging. Tjeerd (4 aug 2026): het
     systeem moet "zelf herkennen dat ik contact heb gehad" — wie hier op
     Bellen drukt, is aan het bellen, en dat hoort in "laatste contact"
     zonder dat er nog een formulier tussen zit. De tel:-link doet gewoon
     zijn werk; wij leggen alleen stil het moment vast. */
  const belKnop = mount.querySelector('#ck_bel');
  if(belKnop) belKnop.addEventListener('click', () => {
    CRM.logActiviteit('contact', String(ct.id), 'bel', 'Belpoging vanaf de kaart');
    setTimeout(opnieuw, 400);
  });

  /* De gedeelde uitkomstknoppen. De relatie waar deze persoon bij hoort
     gaat mee, zodat "laatste contact" van die relatie ook meeloopt. */
  if(CRM.uitkomsten){
    const kl = (CRM.state.clients||[]).find(x => x.naam === ct.klant) || {naam: ct.klant};
    CRM.uitkomsten.bind(mount, kl, opnieuw, {contact: ct});
  }

  /* Snel vastleggen. Opslaan + opvolgtaak bewaart éérst de notitie: ook
     als de taak daarna wordt geannuleerd is het gesprek vastgelegd — de
     notitie is het geheugen, de taak alleen het vervolg. */
  { const veld = mount.querySelector('#ck_snelnotitie');
    const bewaarNotitie = async () => {
      const tekst = (veld.value || '').trim();
      if(!tekst){ CRM.toast('Schrijf eerst je notitie','err'); return false; }
      await CRM.logActiviteit('contact', String(ct.id), 'notitie', tekst);
      return true;
    };
    mount.querySelector('#ck_snelbewaar').onclick = async () => {
      if(await bewaarNotitie()){ CRM.toast('Notitie vastgelegd','ok'); opnieuw(); }
    };
    mount.querySelector('#ck_snelopvolg').onclick = async () => {
      if(!(await bewaarNotitie())) return;
      CRM.toast('Notitie vastgelegd','ok');
      taak();
    };
    mount.querySelector('#ck_snelverslag').onclick = () => verslagModal(ct, opnieuw);
    /* Cmd/Ctrl+Enter = opslaan, net als overal in de app. */
    veld.onkeydown = e => {
      if((e.metaKey || e.ctrlKey) && e.key === 'Enter') mount.querySelector('#ck_snelbewaar').click();
    };
  }

  mount.querySelector('#ck_gbewerk').onclick = () => bewerk(ct.klant, ct);
  const meer = mount.querySelector('#ck_meer');
  if(meer) meer.onclick = () => { tijdlijnAlles = !tijdlijnAlles; CRM.render(); };
  const meerT = mount.querySelector('#ck_meertaken');
  if(meerT) meerT.onclick = () => CRM.ga('klanten', {id:ct.klant});

  mount.querySelectorAll('[data-taak]').forEach(cb => cb.onchange = async () => {
    const t = (CRM.state.taken||[]).find(x => String(x.id) === cb.dataset.taak);
    if(!t) return;
    t.klaar = true;
    if(!CRM.demo){
      const {error} = await CRM.sb.from('crm_taken').update({klaar:true}).eq('id', t.id);
      if(error){ t.klaar = false; return CRM.fout('Opslaan mislukt', error); }
    }
    CRM.toast('Taak afgevinkt','ok');
    CRM.navBadges();
    opnieuw();
  });
}

/* Gespreksverslag: groter tekstvak + de datum van het gesprek zelf. */
function verslagModal(ct, na){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Gespreksverslag</div>
      <p class="sub" style="margin:6px 0 0">${h(ct.naam)}${ct.klant ? ' — ' + h(ct.klant) : ''}</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="cv_datum">Datum van het gesprek</label>
        <input type="date" id="cv_datum" value="${h(CRM.todayISO())}" style="max-width:180px"></div>
      <div class="f-row"><label for="cv_tekst">Verslag</label>
        <textarea id="cv_tekst" style="min-height:180px" placeholder="Wat is er besproken, welke afspraken zijn gemaakt, wat is de volgende stap…&#10;&#10;Tip: @collega stuurt diegene een melding."></textarea></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="cv_ok">Verslag opslaan</button></div>`, {onOpen(m){
    setTimeout(()=>m.querySelector('#cv_tekst').focus(), 60);
    m.querySelector('#cv_ok').onclick = async () => {
      const tekst = m.querySelector('#cv_tekst').value.trim();
      if(!tekst) return CRM.toast('Schrijf eerst het verslag','err');
      const datum = m.querySelector('#cv_datum').value || CRM.todayISO();
      CRM.modal.close();
      await CRM.logActiviteit('contact', String(ct.id), 'gesprek', tekst, {verslag:true, datum});
      CRM.verwerkTags(tekst, 'contact', String(ct.id));
      CRM.toast('Gespreksverslag vastgelegd','ok');
      if(na) na();
    };
  }});
}

/* ═══════════════════════════════════════════════════════════════
   BEWERKEN EN TOEVOEGEN
   Eén venster voor beide, en het is de enige plek waar een
   contactpersoon geschreven wordt — of je hem nu vanaf de
   relatiekaart, de lijst of de kaart zelf opent.
   ═══════════════════════════════════════════════════════════════ */
function bewerk(klantnaam, ct, na){
  const n = ct || {id:CRM.uid(), klant:klantnaam||'', naam:'', functie:'', telefoon:'',
                   email:'', linkedin:'', hoofd:false, note:''};
  const jarig = heeftGeboortedatum();
  /* Zonder relatie in de aanroep (vanaf de lijst) kies je hem hier; komt de
     aanroep van een relatiekaart, dan staat hij vast — verplaatsen doe je
     niet per ongeluk. */
  const kiesKlant = !klantnaam;
  const klanten = uniek((CRM.state.clients||[]).map(c => c.naam));

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${ct ? 'Contactpersoon bewerken' : 'Nieuwe contactpersoon'}</div>
      ${!kiesKlant && n.klant ? `<p class="sub" style="margin:6px 0 0">bij ${h(n.klant)}</p>` : ''}</div>
    <div class="modal-b">
      ${kiesKlant ? `<div class="f-row"><label for="cb_klant">Relatie</label>
        <select id="cb_klant">
          <option value="">Kies een relatie…</option>
          ${klanten.map(k => `<option value="${h(k)}"${n.klant===k?' selected':''}>${h(k)}</option>`).join('')}
          ${n.klant && !klanten.includes(n.klant) ? `<option value="${h(n.klant)}" selected>${h(n.klant)} (staat niet in het systeem)</option>` : ''}
        </select></div>` : ''}
      <div class="f-grid">
        <div class="f-row"><label for="cb_naam">Naam</label><input type="text" id="cb_naam" value="${h(n.naam)}"></div>
        <div class="f-row"><label for="cb_functie">Functie</label><input type="text" id="cb_functie" value="${h(n.functie||'')}"></div>
        <div class="f-row"><label for="cb_tel">Telefoon</label><input type="tel" id="cb_tel" value="${h(n.telefoon||'')}"></div>
        <div class="f-row"><label for="cb_mail">E-mail</label><input type="email" id="cb_mail" value="${h(n.email||'')}"></div>
        ${jarig ? `<div class="f-row"><label for="cb_gb">Geboortedatum</label>
          <input type="date" id="cb_gb" value="${h(String(n.geboortedatum||'').slice(0,10))}">
          <span class="hint">Alleen dag en maand komen in beeld — nooit het jaartal of de leeftijd.</span></div>` : ''}
      </div>
      <div class="f-row"><label for="cb_li">LinkedIn</label>
        <input type="url" id="cb_li" value="${h(n.linkedin||'')}" placeholder="https://linkedin.com/in/…"></div>
      <div class="f-row"><label for="cb_note">Notitie</label><textarea id="cb_note">${h(n.note||'')}</textarea></div>
      <label class="check"><input type="checkbox" id="cb_hoofd"${n.hoofd?' checked':''}> Hoofdcontact bij deze relatie</label>
    </div>
    <div class="modal-f">
      ${ct ? '<button class="btn sub" id="cb_weg">Verwijderen</button>' : ''}
      <span class="spacer"></span>
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="cb_ok">Opslaan</button>
    </div>`, {onOpen(m){
      setTimeout(()=>m.querySelector(kiesKlant && !n.klant ? '#cb_klant' : '#cb_naam').focus(), 60);
      m.querySelector('#cb_ok').onclick = async () => {
        const rij = Object.assign({}, n, {
          klant:    kiesKlant ? m.querySelector('#cb_klant').value : n.klant,
          naam:     m.querySelector('#cb_naam').value.trim(),
          functie:  m.querySelector('#cb_functie').value.trim(),
          telefoon: m.querySelector('#cb_tel').value.trim(),
          email:    m.querySelector('#cb_mail').value.trim(),
          linkedin: m.querySelector('#cb_li').value.trim(),
          note:     m.querySelector('#cb_note').value.trim(),
          hoofd:    m.querySelector('#cb_hoofd').checked
        });
        /* Geboortedatum alleen meesturen als de kolom bestaat; anders sneuvelt
           de hele update en kan er niets meer aan deze persoon gewijzigd
           worden. Leeg veld = leegmaken, dus expliciet null. */
        if(jarig) rij.geboortedatum = m.querySelector('#cb_gb').value || null;
        if(!rij.naam) return CRM.toast('Vul een naam in','err');
        if(!rij.klant) return CRM.toast('Kies eerst een relatie','err');
        CRM.modal.close();
        /* Hooguit één hoofdcontact per relatie. */
        if(rij.hoofd)
          for(const x of (CRM.state.contacten||[]).filter(x => x.klant === rij.klant && x.hoofd && String(x.id) !== String(rij.id)))
            await bewaarContact(Object.assign({}, x, {hoofd:false}), true);
        await bewaarContact(rij, !!ct);
        if(na) na(false, rij); else CRM.render();
      };
      const weg = m.querySelector('#cb_weg');
      if(weg) weg.onclick = async () => {
        if(!await CRM.bevestig('Contactpersoon verwijderen?', n.naam, {gevaarlijk:true})) return;
        CRM.modal.close();
        await verwijderContact(n.id);
        if(na) na(true, n);
        else if(CRM.view === 'contacten' && (CRM.params||{}).id) CRM.ga('contacten');
        else CRM.render();
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   RAIL VOOR DE RELATIEKAART
   Dezelfde zijbalk als voorheen, maar de rijen zijn nu een doorgang
   naar de kaart van die persoon in plaats van een doodlopend regeltje.
   Het kaartframe leunt bewust op .kl-railkaart/.kl-r-ct uit
   css/klanten.css: die klassen bepalen de compacte railmaat én de
   volgorde van de blokken op mobiel, en die hoort de relatiekaart te
   blijven bepalen. Alles binnenin is van dit bestand (.ck-*).
   ═══════════════════════════════════════════════════════════════ */
let railKlant = '', railZoek = '', railAlles = false;
const RAIL_TOON = 6;

function railHtml(klantnaam){
  if(railKlant !== String(klantnaam||'')){ railKlant = String(klantnaam||''); railZoek = ''; railAlles = false; }
  return `<div class="card kl-railkaart kl-r-ct ck-railkaart">
    <div class="card-h"><div class="h2">Contactpersonen</div><span class="spacer"></span>
      <button class="btn sub sm" id="ck_ralle" title="Alle contactpersonen, doorzoekbaar">Alle</button></div>
    <div class="card-b">
      <div class="searchbox ck-railzoek" id="ck_rzoekbox" hidden>
        <input type="search" id="ck_rzoek" autocomplete="off" placeholder="Zoek op naam of functie…" value="${h(railZoek)}">
      </div>
      <div id="ck_rlijst"></div>
      <button class="btn ghost sm ck-railknop" id="ck_rnieuw">+ Contactpersoon</button>
    </div></div>`;
}

function bindRail(root, klantnaam){
  const el = (root || document).querySelector('#ck_rlijst');
  if(!el) return;
  const naam = String(klantnaam || railKlant || '');
  const zoek = (root || document).querySelector('#ck_rzoek');
  if(zoek) zoek.oninput = () => { railZoek = zoek.value; tekenRail(el, naam); };
  const nieuw = (root || document).querySelector('#ck_rnieuw');
  if(nieuw) nieuw.onclick = () => bewerk(naam, null, () => CRM.render());
  const alle = (root || document).querySelector('#ck_ralle');
  if(alle) alle.onclick = () => { zet('klant', naam); CRM.ga('contacten'); };
  tekenRail(el, naam);
}

function tekenRail(el, klantnaam){
  const alle = contactenVan(klantnaam).slice()
    .sort((a,b) => (b.hoofd?1:0) - (a.hoofd?1:0) || String(a.naam).localeCompare(String(b.naam),'nl'));

  /* Zoekveld alleen tonen als er iets te zoeken valt — bij twee
     contactpersonen is het een dood bedieningselement in een smalle rail. */
  const box = document.getElementById('ck_rzoekbox');
  if(box) box.hidden = alle.length < 4 && !railZoek;

  if(!alle.length){
    el.innerHTML = CRM.ui.leeg('Nog geen contactpersonen','Leg vast met wie je bij deze relatie schakelt.');
    return;
  }
  const q = railZoek.trim().toLowerCase();
  const rij = q ? alle.filter(x => (String(x.naam)+' '+String(x.functie||'')).toLowerCase().includes(q)) : alle;
  const jarig = jarigRailHtml(alle);
  if(!rij.length){
    el.innerHTML = jarig + CRM.ui.leeg('Geen contactpersoon gevonden','Probeer een ander zoekwoord.');
    bindRailRijen(el);
    return;
  }
  const inklappen = !railAlles && !q && rij.length > RAIL_TOON;
  const toon = inklappen ? rij.slice(0, RAIL_TOON) : rij;

  el.innerHTML = jarig + `<div class="ck-railrijen">${toon.map(x => {
    const lc = laatsteContact(x);
    const wanneer = lc.beste == null ? 'nog geen contact'
      : (lc.dagen === 0 ? 'vandaag gesproken' : lc.dagen + ' dagen geleden');
    return `<div class="ck-railrij" data-ct="${h(x.id)}" tabindex="0" role="link"
        title="Open de kaart van ${h(x.naam)}">
      <div class="row tight"><b class="trunc">${h(x.naam)}</b>${x.hoofd?'<span class="chip green">Hoofdcontact</span>':''}</div>
      <div class="meta">${h(x.functie || '—')}</div>
      <div class="ck-railcontact">
        ${x.telefoon?`<a class="num" href="${h(telHref(x.telefoon))}">${h(x.telefoon)}</a>`:''}
        ${x.telefoon&&x.email?'<span class="ck-sep">·</span>':''}
        ${x.email?`<a class="trunc" href="mailto:${h(x.email)}">${h(x.email)}</a>`:''}
        ${!x.telefoon&&!x.email?'<span class="meta">geen gegevens</span>':''}
      </div>
      <span class="meta num ck-raillc${lc.dagen != null && lc.dagen > 90 ? ' lang' : ''}">${h(wanneer)}</span>
    </div>`;
  }).join('')}</div>
  ${inklappen ? `<button class="btn sub sm ck-railknop" id="ck_rmeer">Toon alle <span class="num">${rij.length}</span></button>` : ''}`;

  bindRailRijen(el);
  const meer = el.querySelector('#ck_rmeer');
  if(meer) meer.onclick = () => { railAlles = true; tekenRail(el, klantnaam); };
}

function bindRailRijen(el){
  el.querySelectorAll('[data-ct]').forEach(r => {
    r.onclick = () => open(r.dataset.ct);
    r.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(r.dataset.ct); } };
  });
  /* Bellen en mailen mogen niet ook de kaart openen. */
  el.querySelectorAll('.ck-railrij a').forEach(a => a.onclick = e => e.stopPropagation());
}

/* Wie is er deze maand jarig bij deze relatie? Dát is het moment waarop een
   AM belt, dus het staat bovenaan en niet weggestopt in een dossier.
   Alleen dag en maand; het jaartal blijft in de database. */
function jarigRailHtml(contacten){
  if(!heeftGeboortedatum()) return '';
  const vandaag = CRM.todayISO();
  const maandNu = vandaag.slice(5,7), dagNu = vandaag.slice(8,10);
  const rij = contacten.map(c => ({c, md: mmdd(c.geboortedatum)}))
    .filter(x => x.md.slice(0,2) === maandNu)
    .sort((a,b) => a.md.localeCompare(b.md) || String(a.c.naam).localeCompare(String(b.c.naam),'nl'));
  if(!rij.length) return '';
  return `<div class="ck-jarigblok">
    <span class="ck-jarigkop">Jarig deze maand</span>
    ${rij.map(({c, md}) => {
      const dag = md.slice(3);
      const wanneer = dag === dagNu ? 'vandaag' : (dag < dagNu ? 'was ' : '') + dagMaand(c.geboortedatum);
      return `<div class="ck-jarigrij${dag === dagNu ? ' nu' : ''}" data-ct="${h(c.id)}" tabindex="0" role="link"
        title="Open de kaart van ${h(c.naam)}">
        <b class="trunc">${h(c.naam)}</b><span class="num">${h(wanneer)}</span></div>`;
    }).join('')}
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   VERJAARDAGEN OP HET DASHBOARD
   js/opvolging.js vraagt er onderaan zelf om (punt 4) en js/klanten.js
   levert de gegevens al met CRM.contactVerjaardagen — er meldde zich
   alleen nog niemand aan als bron. Dat doen we hier, vanuit dit bestand,
   zodat geen van beide bestanden aangeraakt hoeft te worden. De vlag op
   CRM voorkomt een dubbele regel op het dashboard als een van die twee
   zich later alsnog aanmeldt.
   ═══════════════════════════════════════════════════════════════ */
function registreerVerjaardagen(){
  if(!CRM.opvolging || typeof CRM.opvolging.registreerBron !== 'function') return;
  if(CRM._contactVerjaardagBron) return;
  CRM._contactVerjaardagBron = 'contactkaart';
  CRM.opvolging.registreerBron((mij, datum) => {
    if(typeof CRM.contactVerjaardagen !== 'function') return [];
    return CRM.contactVerjaardagen(datum, 0)
      /* Zonder eigenaar is de relatie van iedereen — zelfde regel als bij
         de taken op het dashboard. */
      .filter(v => !mij || !v.eigenaar || v.eigenaar === mij)
      .map(v => ({
        key: 'ctjarig:' + v.contact.id + ':' + v.wanneer,
        soort: 'contactverjaardag', kanaal: 'bel',
        titel: `${v.contact.naam} is jarig — even bellen`,
        sub: [v.contact.functie, v.klant].filter(Boolean).join(' · '),
        datum: v.wanneer, entiteit: 'contact', ref: String(v.contact.id),
        naam: v.contact.naam, mod: 'contacten', id: String(v.contact.id),
        urgent: true
      }));
  });
}
registreerVerjaardagen();

/* ═══════════════════════════════════════════════════════════════
   REGISTRATIE
   ═══════════════════════════════════════════════════════════════ */
CRM.registerModule('contacten', {
  title:'Contactpersonen', icon:'☰',
  onderschrift:'De mensen achter de relaties — met wie sprak je het langst niet?',
  render(mount, acties, params){
    zorgContacten();
    verversIndex();          // gegevens kunnen buiten deze module gewijzigd zijn
    /* Deze module staat bewust niet in de zijbalk (zie de kop van dit
       bestand). Zonder deze regel licht er dan niets op en lijkt de app
       zijn plek kwijt; contactpersonen horen bij Relaties, dus dat item
       blijft aan. */
    document.querySelector('nav.side a.nav[data-go="klanten"]')?.classList.add('on');
    if(params && params.id) kaart(mount, acties, String(params.id));
    else overzicht(mount, acties);
  }
});

/* ─── Ingang voor de andere modules ───────────────────────────── */
CRM.contactKaart = {
  /* De kaart van één persoon openen. */
  open,
  /* De zijbalk van de relatiekaart: markup + koppelen. */
  railHtml, bindRail,
  /* Toevoegen en bewerken — de enige plek waar een contactpersoon
     geschreven wordt. `na(verwijderd, rij)` is optioneel. */
  bewerk,
  /* Eén knop naar de lijst, voor in de knoppenbalk van Relaties. */
  lijstKnop(acties){
    if(!acties) return;
    acties.insertAdjacentHTML('afterbegin',
      '<button class="btn ghost sm" id="ck_naarlijst">Contactpersonen</button>');
    acties.querySelector('#ck_naarlijst').onclick = () => CRM.ga('contacten');
  },
  /* Voor wie zelf wil weten hoe lang het stil is: {vast, afgeleid, beste, dagen}. */
  laatsteContact
};
})();

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN COORDINATOR

   1. index.html — twee regels:
        <link rel="stylesheet" href="css/contactkaart.css">   (na css/klanten.css)
        <script src="js/contactkaart.js"></script>            (na js/klanten.js)
      Later dan js/klanten.js, want dit bestand gebruikt CRM.mailUI,
      CRM.naarOutlook en CRM.contactVerjaardagen uit dat bestand. Alle
      gebruik is defensief, dus een verkeerde volgorde breekt niets — er
      staat dan alleen minder op het scherm.

   2. js/klanten.js — de zijbalk klikbaar maken. Twee regels:
        in kaart(), in de rail:      ${contactBlokHtml()}
                            wordt:   ${CRM.contactKaart.railHtml(k.naam)}
        en het blok "Rail: contactpersonen" (de vier regels met #ct_lijst,
        #ct_zoek, #ct_nieuw en contactLijst) wordt:
                                     CRM.contactKaart.bindRail(mount, k.naam);
      Verder verandert er niets. contactBlokHtml, contactLijst,
      contactDrawer, contactModal, verslagModal, mailAanContact en
      contactLijstVerversen zijn daarna ongebruikt en kunnen weg; ze doen
      geen kwaad als ze blijven staan (contactLijstVerversen zoekt naar
      #ct_lijst en vindt niets meer).

   3. js/klanten.js — één regel in overzicht(), direct na het zetten van
      acties.innerHTML:
                                     CRM.contactKaart.lijstKnop(acties);
      Dat zet de knop "Contactpersonen" in de knoppenbalk van Relaties.
      Zonder die regel is de lijst alleen via #contacten bereikbaar.

   4. supabase/schema.sql — OPTIONEEL, en de enige manier om de afleiding
      op deze kaart te vervangen door een feit. Nu weet het systeem niet
      welke vacature of kandidaat bij wélke contactpersoon hoort; het
      scherm zegt dat er ook eerlijk bij. Met:
        alter table vacatures  add column if not exists contact_id text;
        alter table candidates add column if not exists contact_id text;
        alter table crm_taken  add column if not exists contact_id text;
      herkent dit bestand de koppeling vanzelf (heeftKoppeling/vanContact)
      en verdwijnt het merkteken "afgeleid" bij de vacatures en kandidaten
      die wél gekoppeld zijn. De schermen die die kolom moeten kunnen
      vullen (Recruitment, Kandidaten) horen daar dan een keuzelijst voor
      te krijgen — zonder dat blijft de kolom leeg en verandert er niets.

   5. crm_taken.contact_id (punt 4) is de enige nette oplossing voor de
      taken op deze kaart. Een taak hangt nu aan de relatie, want het
      dashboard en de meldingen vertalen alleen 'klant', 'kandidaat' en
      'lead' naar een module — een taak op een contact-id zou daar als een
      kaal id verschijnen. Tot die kolom er is toont deze kaart de open
      taken van de relatie die de persoon bij naam noemen, met "afgeleid"
      erbij. Dat is bewust: liever zichtbaar onzeker dan onzichtbaar fout.
   ═══════════════════════════════════════════════════════════════ */
