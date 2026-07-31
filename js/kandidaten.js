/* ═══════════════════════════════════════════════════════════════
   MODULE: KANDIDATEN
   Overzicht van alle kandidaten met krachtige filters (sterren,
   status, radius, ploegen, taal, vervoer) + de kandidatenkaart:
   het complete profiel, ster-beoordeling, CV-verrijking met
   conflictmarkering en de Source-tab (kaart, zie js/source.js).

   Sinds 30 jul 2026 is dit ook wat een klik op een bordkaart opent
   (wens Tjeerd) — niet meer het smalle bewerkpaneel van het oude
   pijplijnbord. De blokken "Traject" en "Contract & salaris" hieronder
   zijn daarvoor van die drawer hierheen verhuisd. De poortwachters bij
   een fasewissel blijven in js/recruitment.js wonen; deze kaart roept
   ze aan via CRM.kandidaatFasePicker/-Uitval/-NoShow/-Intake, zodat de
   regels maar op één plek bestaan.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;
/* Gedeelde flows uit recruitment.js (laadt vóór dit bestand). */
const D = () => CRM._rcDeel || {};

/* ─── Filters onthouden (één sleutel: crm_kand_filters) ───────── */
const FKEY = 'crm_kand_filters';
/* status staat sinds 31 jul 2026 standaard op 'gekwalificeerd'. Dat is de
   lijst waar een accountmanager mee begint: mensen die de hele
   recruitmentpijplijn door zijn (intake + videocall gehad) maar nog nergens
   zijn voorgesteld. Wie zijn filter zelf ooit heeft omgezet houdt zijn eigen
   keuze — die staat in localStorage en wint van deze default. */
const F_STD = {
  zoek:'', status:'gekwalificeerd', ster:0, plaats:'', km:20, ploegen:'', taal:'',
  vervoer:'', rijbewijs:'', functie:'', rec:'', klant:'', fase:'', gesproken:'',
  mijn:false, sort:'gesproken', splits:'functie'
};
let F = (() => {
  try{ return Object.assign({}, F_STD, JSON.parse(localStorage.getItem(FKEY)||'{}')); }
  catch(e){ return Object.assign({}, F_STD); }
})();
function zet(k,v){ F[k]=v; try{ localStorage.setItem(FKEY, JSON.stringify(F)); }catch(e){} }

/* Paneel- en tabstand (geen filter, wel handig om te onthouden). */
let filtersOpen = false, filtersOpenGezet = false;

const uniek = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'nl'));

/* Microsoft-koppeling van déze gebruiker. Staat die uit, dan verschijnen
   de Outlook-onderdelen op de kaart helemaal niet. */
const outlookAan = () => !!(CRM.outlook && CRM.outlook.beschikbaar?.() && CRM.outlook.verbonden?.());
/* Voor het videocall-venster telt maar één vraag: schrijft dit straks
   rechtstreeks in de agenda, of opent Outlook met een deeplink? */
const agendaGekoppeld = () => !!(CRM.outlook && CRM.outlook.verbonden?.()
  && (CRM.outlook.beschikbaar ? CRM.outlook.beschikbaar() : true));

/* ─── Golden candidates ───────────────────────────────────────────
   Goede kandidaten waar nú geen passende vacature voor is — die
   verliezen we anders uit het oog. De vlag leeft in candidates.golden
   (schema.sql); CRM.rowToCand kent dat veld (nog) niet, dus we lezen
   en schrijven op de ruwe rij in CRM.state.cands. Golden betekent
   "onthouden", niet "inactief": de vlag mag blijven staan als iemand
   later alsnog aan een vacature gekoppeld wordt. */
const isGolden = id => {
  const r = CRM.state.cands.find(x => String(x.id) === String(id));
  return !!(r && r.golden);
};
const goldenIds = () => new Set(CRM.state.cands.filter(r => r.golden).map(r => String(r.id)));
async function zetGolden(id, aan){
  const r = CRM.state.cands.find(x => String(x.id) === String(id));
  if(!r) return false;
  r.golden = !!aan;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update({golden:!!aan}).eq('id', id);
    if(error){ r.golden = !aan; CRM.fout('Opslaan mislukt', error); return false; }
  }
  await CRM.logActiviteit('kandidaat', id, 'systeem',
    aan ? 'Gemarkeerd als golden candidate' : 'Golden candidate-markering weggehaald');
  CRM.toast(aan ? 'Golden candidate — blijft vindbaar met de ster' : 'Golden-markering weggehaald', 'ok');
  return true;
}
const goldenSter = klasse => `<span class="kd-goldster ${klasse||''}" title="Golden candidate">★</span>`;
const faseChip = (fase, extra='') => fase
  ? `<span class="chip ${extra}"><i class="dot" style="background:${CRM.faseKleur(fase)}"></i>${h(CRM.faseNorm(fase))}</span>` : '';
const telLink = t => 'tel:' + String(t||'').replace(/[^0-9+]/g,'');
const waLink  = t => { let n = String(t||'').replace(/[^0-9]/g,''); if(n.startsWith('06')) n = '31'+n.slice(1); if(n.startsWith('00')) n = n.slice(2); return 'https://wa.me/'+n; };
/* Alleen echte weblinks openen — een `javascript:`-URL in een CV-veld mag
   niet uitgevoerd worden als iemand erop klikt. */
const veiligeUrl = u => { const s = String(u||'').trim(); return /^(https?:|blob:)/i.test(s) ? s : ''; };

/* Taal-zoekterm matchen op de talen-string van de kandidaat. Kandidaten
   hebben soms afkortingen ("NL, EN"), de gebruiker typt vaak voluit. */
const TAALKORT = {nederlands:'nl', engels:'en', duits:'de', frans:'fr', spaans:'es',
  pools:'pl', roemeens:'ro', bulgaars:'bg', hongaars:'hu', turks:'tr', arabisch:'ar',
  portugees:'pt', oekraiens:'uk', russisch:'ru', slowaaks:'sk', tsjechisch:'cs'};
function taalMatch(talen, zoek){
  const z = String(zoek||'').trim().toLowerCase(); if(!z) return true;
  const t = String(talen||'').toLowerCase();       if(!t) return false;
  if(t.includes(z)) return true;
  const plat = z.normalize('NFD').replace(/[̀-ͯ]/g,'');
  const kort = TAALKORT[plat];
  if(kort && new RegExp('\\b'+kort+'\\b').test(t)) return true;
  const lang = Object.keys(TAALKORT).find(k => TAALKORT[k] === plat);
  return !!(lang && t.includes(lang));
}

/* Waaróm past deze kandidaat bij deze vacature? */
function uitleg(c, v){
  const delen = [];
  const woorden = s => String(s||'').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
  const kf = new Set([...woorden(c.functie), ...woorden(c.cv && c.cv.functie),
    ...((c.cv && c.cv.skills) || []).map(s => String(s).toLowerCase())]);
  const overlap = [...new Set(woorden(v.functie).filter(w => kf.has(w)))];
  if(overlap.length) delen.push('zelfde functiewoorden (' + overlap.join(', ') + ')');
  else if(c.functie) delen.push('zoekt ' + c.functie.toLowerCase());

  const plaats = v.locatie || '';
  if(c.woonplaats && plaats){
    const km = CRM.afstandKm(c.woonplaats, plaats);
    if(CRM.plaatsSleutel(c.woonplaats) === CRM.plaatsSleutel(plaats)) delen.push('woont in ' + c.woonplaats + ' — zelfde plaats');
    else if(km != null) delen.push('woont in ' + c.woonplaats + ' — ' + km + ' km');
    else delen.push('woont in ' + c.woonplaats);
  }
  if(c.cv && c.cv.ervaringJaren) delen.push(c.cv.ervaringJaren + ' jaar ervaring');
  const zin = delen.join(' · ');
  return zin ? zin.charAt(0).toUpperCase() + zin.slice(1) : 'Op basis van de gezochte functie.';
}

/* Suggesties: eerst de matches van core, aangevuld met vacatures dichtbij. */
function kansen(c){
  const uit = CRM.besteMatches(c, 5).slice();
  if(uit.length < 3 && c.woonplaats){
    const gehad = new Set(uit.map(m => String(m.vacature.id)));
    CRM.state.vacs.forEach(v => {
      if(gehad.has(String(v.id)) || (v.status && v.status !== 'Open')) return;
      const km = CRM.afstandKm(c.woonplaats, v.locatie);
      const score = CRM.matchScore(c, v);
      if(km != null && km <= 25 && score >= 20) uit.push({vacature:v, score, dichtbij:true});
    });
  }
  return uit.map(m => Object.assign({}, m, {km:CRM.afstandKm(c.woonplaats, m.vacature.locatie)}))
    .sort((a,b) => b.score - a.score).slice(0,5);
}

/* ─── Reisafstand tot de werkplek ─────────────────────────────────
   "Reistijd/afstand" en "Reistijd/vervoer" zijn vaste uitvalcategorieën
   (CRM.AFVAL_CATS en CRM.STOP_CATS in js/data.js). Dan wil je die afstand
   niet pas lezen in de uitvalreden, maar op de kaart zien vóór de plaatsing.

   Welke werkplek: de locatie van de gekoppelde vacature, en anders die van
   de klant. In productie is vacatures.locatie bij álle vacatures leeg, dus
   de terugval op de klant is de normale route — niet de uitzondering.
   Levert geen van beide een plaats op die in CRM.PLAATSEN staat, dan tonen
   we niets. Een gegokte afstand is erger dan geen afstand. */
function werkplek(c){
  const v = c.vacatureId ? CRM.state.vacs.find(x => String(x.id) === String(c.vacatureId)) : null;
  const uitVac = String((v && v.locatie) || '').trim();
  if(uitVac) return {plaats:uitVac, via:'vacature'};
  const k = c.klant ? CRM.klant(c.klant) : null;
  /* Zelfde terugval als de klantkaart gebruikt (js/klanten.js): het veld
     `locatie`, en anders de vestigingsplaats uit de SWO-gegevens. */
  const uitKlant = String((k && (k.locatie || k.plaats)) || '').trim();
  return uitKlant ? {plaats:uitKlant, via:'klant'} : null;
}

/* Hooguit één zachte waarschuwing, en de grens is niet zelfbedacht: hij komt
   uit CRM.matchScore in js/data.js. Die weegt reisafstand in banden en laat
   hem boven 45 km hélemaal wegvallen — verder dan dat telt de afstand in dit
   systeem al nergens meer mee. Zonder eigen auto knelt het eerder; daar houden
   we de band eronder aan (30 km), de laatste die daar noemenswaardig scoort.
   Dus geen nieuwe norm — dezelfde die de matching al hanteert. */
const REIS_VER = 45, REIS_VER_ZONDER_AUTO = 30;
function reisafstandRij(c){
  const w = werkplek(c);
  if(!String(c.woonplaats || '').trim() || !w) return '';
  const km = CRM.afstandKm(c.woonplaats, w.plaats);
  if(km == null) return '';
  const zonderAuto = !!c.vervoer && c.vervoer !== 'auto';
  const ver = km >= (zonderAuto ? REIS_VER_ZONDER_AUTO : REIS_VER);
  const waarde = km === 0
    ? `zelfde plaats — ${h(w.plaats)}`
    : `± <span class="num">${km}</span> km naar ${h(w.plaats)}`;
  return `<div class="kd-veld"><span class="label">Reisafstand</span>
    <span>${waarde}
      <span class="meta">${w.via === 'vacature' ? 'werkplek uit de vacature' : 'vestiging van de klant'}</span>${ver ? `
      <span class="chip amber kd-reisver" title="Reistijd is een van de vaste uitvalredenen — bespreek het vóór de plaatsing">${
        zonderAuto ? 'ver zonder eigen auto' : 'flinke reisafstand'}</span>` : ''}</span></div>`;
}

/* ─── Laatst gesproken ──────────────────────────────────────────
   Wat telt als contact is precies dezelfde lijst als in js/opvolging.js:
   bellen, appen, mailen, een gesprek of een bezoek. Een notitie, een
   fasewissel, een geüpload document of een systeemregel telt niet — dat is
   werk aan een kaart, geen contact met een mens. Zonder die gelijkschakeling
   zegt het dashboard "drie weken niets gehoord" terwijl dit scherm "gisteren"
   toont, en dan gelooft niemand meer een van beide.

   opvolging.js houdt die lijst nog binnenskamers; zodra hij als
   CRM.opvolging.CONTACT naar buiten komt (zie het verzoek onderaan dit
   bestand) pakt deze regel hem vanzelf op en verdwijnt de kopie.

   Let op: "Videocall ingepland" wordt door de videocallmodal hieronder als
   soort 'gesprek' weggeschreven en telt dus mee. Dat is bewust gelijk aan
   opvolging.js — inplannen is óók contact geweest. */
const CONTACT_SOORTEN = (CRM.opvolging && CRM.opvolging.CONTACT) || ['bel','gesprek','whatsapp','mail','bezoek'];

/* De laatste échte contactmomenten van deze kandidaat: {op, soort} of null. */
function laatstContact(c){
  let uit = null;
  CRM.activiteitenVoor('kandidaat', c.id).forEach(a => {
    if(!a.op || !CONTACT_SOORTEN.includes(a.soort)) return;
    if(!uit || a.op > uit.op) uit = {op:a.op, soort:a.soort};
  });
  return uit;
}
/* Twee verschillende dingen die allebei "lang niet gesproken" heten:
     - er ís gesproken, maar lang geleden  → een belletje waard
     - er is nog nooit gesproken           → een gat in het proces
   Daarom geeft stilte() ze allebei apart terug. `d` is het aantal dagen
   sinds het laatste contact (null als dat er nooit was) en `wacht` is het
   aantal dagen dat iemand al in beeld is. `dagen` is waar de filters en de
   sortering op rekenen: het beste antwoord op "hoe lang wachten we al?",
   dus het contact als dat er is en anders de wachttijd. */
/* Geanonimiseerd = iemand heeft om verwijdering van zijn gegevens gevraagd
   en die zijn gewist (js/kandverwijder.js). De kaart blijft bestaan omdat
   de plaatsing in de cijfers moet blijven kloppen, maar de persoon erachter
   is er niet meer. Zo'n regel mag dus nooit als belsuggestie terugkomen. */
const geanonimiseerd = c => !!(CRM.kandVerwijder && CRM.kandVerwijder.isGeanonimiseerd
  && CRM.kandVerwijder.isGeanonimiseerd(c));

function stilte(c){
  /* Geen stiltemeting op een gewiste kaart: er valt niemand te bellen.
     `dagen: null` houdt deze regel automatisch buiten elk niet-gesproken
     filter en onderaan de bellijst. */
  if(geanonimiseerd(c))
    return {d:null, wacht:null, dagen:null, nooit:false, anon:true, soort:'',
            tekst:'gegevens gewist', kleur:''};
  const l = laatstContact(c);
  const wacht = CRM.dagenGeleden(c.since);
  const kleuren = n => n == null ? '' : n >= 14 ? 'red' : n >= 7 ? 'amber' : '';
  if(l){
    const d = CRM.dagenGeleden(l.op);
    return {d, wacht, dagen:d, nooit:false, anon:false, soort:l.soort,
            tekst:CRM.geleden(l.op), kleur:kleuren(d)};
  }
  return {d:null, wacht, dagen:wacht, nooit:true, anon:false, soort:'',
          tekst:'nooit gesproken', kleur:kleuren(wacht)};
}
function stilteChip(c){
  const s = stilte(c);
  if(s.anon)  return '';
  if(s.nooit) return `<span class="chip ${s.kleur}">Nog nooit gesproken</span>`;
  if(s.d === 0) return '<span class="chip green">Vandaag gesproken</span>';
  return `<span class="chip ${s.kleur}"><span class="num">${s.d}</span> ${s.d === 1 ? 'dag' : 'dagen'} niet gesproken</span>`;
}

/* ─── Opslaan ─────────────────────────────────────────────────── */
async function bewaarKandidaat(c){
  const rij = CRM.candToRow(c);
  const i = CRM.state.cands.findIndex(r => String(r.id) === String(c.id));
  if(i >= 0) Object.assign(CRM.state.cands[i], rij); else CRM.state.cands.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update(rij).eq('id', c.id);
    if(error) return CRM.fout('Opslaan mislukt', error);
  }
  CRM.toast('Opgeslagen','ok');
}
async function bewaarRij(tabel, veld, rij, bestaat){
  if(!Array.isArray(CRM.state[veld])) CRM.state[veld] = [];
  const lijst = CRM.state[veld];
  const i = lijst.findIndex(r => String(r.id) === String(rij.id));
  if(i >= 0) Object.assign(lijst[i], rij); else lijst.unshift(rij);
  if(!CRM.demo){
    const {error} = bestaat
      ? await CRM.sb.from(tabel).update(rij).eq('id', rij.id)
      : await CRM.sb.from(tabel).insert(rij);
    if(error) return CRM.fout('Opslaan mislukt', error);
  }
  CRM.toast('Opgeslagen','ok');
}

/* ═══════════════════════════════════════════════════════════════
   OVERZICHT — kandidatenlijst met filters.
   (Sourcing is een eigen module in de zijbalk geworden — js/source.js.)
   ═══════════════════════════════════════════════════════════════ */
function overzicht(mount, acties){
  acties.innerHTML = '';
  mount.innerHTML = `<div class="stack"><div id="kd_tabwrap"></div></div>`;
  lijstTab(mount.querySelector('#kd_tabwrap'));
}

/* ─── Statusfilter ──────────────────────────────────────────────
   De oude lijst was één platte rij opties die deed alsof ze elkaar
   uitsluiten, en dat doen ze niet: geplaatst zit ín actief lopend, en
   herbruikbare uitval zit ín beschikbaar. In plaats van opties te schrappen
   — er wordt in de praktijk op alle vijf gefilterd — staan ze nu in drie
   groepen, zodat je in de lijst zelf ziet dat het drie vragen zijn:
   wie is er voorradig, wie loopt er, en wie bewaren we voor later.
   'Gekwalificeerd' is er als eerste bij gekomen en is de nieuwe default. */
const STATUS_OPTS = [
  {g:'De voorraad',      k:'gekwalificeerd', lbl:'Gekwalificeerd — klaar om voor te stellen'},
  {g:'In een traject',   k:'lopend',      lbl:'Actief lopend'},
  {g:'In een traject',   k:'geplaatst',   lbl:'Geplaatst'},
  {g:'Bewaard voor later', k:'beschikbaar', lbl:'Beschikbaar'},
  {g:'Bewaard voor later', k:'recyclebaar', lbl:'Uitval — herbruikbaar'},
  {g:'Bewaard voor later', k:'golden',    lbl:'Golden candidates ★'},
  {g:'',                 k:'alle',        lbl:'Alles'}
];
const statusLbl = k => (STATUS_OPTS.find(o => o.k === k) || {}).lbl || k;

/* De gekwalificeerde voorraad. CRM.klaarOmVoorTeStellen (js/data.js) doet
   het echte werk: kaart bestaat, intake is gehad, staat nog nergens op het
   klantbord. Hier komt er één regel bij — een kaart waarvan de gegevens op
   verzoek gewist zijn is geen voorraad meer, hoe compleet de fase ook is. */
const gekwalificeerd = c => CRM.klaarOmVoorTeStellen(c) && !geanonimiseerd(c);

/* ─── Filter "hoe lang niet gesproken" ──────────────────────────
   Tjeerds vraag was letterlijk "twee weken niet gesproken, etc etc", dus
   dit is een keuzelijst en geen los vinkje. De dagen-opties tellen ook
   kandidaten mee die nog nóóit gesproken zijn maar al net zo lang wachten —
   voor een accountmanager is dat dezelfde bellijst. Wie alleen het gat in
   het proces wil zien kiest de laatste optie. */
const GESPROKEN_OPTS = [
  {k:'',      lbl:'Maakt niet uit'},
  {k:'7',     lbl:'Langer dan 1 week niet gesproken',  chip:'langer dan 1 week niet gesproken',  dagen:7},
  {k:'14',    lbl:'Langer dan 2 weken niet gesproken', chip:'langer dan 2 weken niet gesproken', dagen:14},
  {k:'28',    lbl:'Langer dan 4 weken niet gesproken', chip:'langer dan 4 weken niet gesproken', dagen:28},
  {k:'nooit', lbl:'Nog nooit gesproken',               chip:'nog nooit gesproken'}
];
const gesprokenOpt = k => GESPROKEN_OPTS.find(o => o.k === String(k||'')) || GESPROKEN_OPTS[0];
/* st = het resultaat van stilte(). Een kandidaat zonder contact én zonder
   datum in beeld heeft geen wachttijd; die valt eerlijk buiten de
   dagen-opties in plaats van op nul dagen te worden gezet. */
function gesprokenMatch(st, k){
  const o = gesprokenOpt(k);
  if(!o.k) return true;
  if(o.k === 'nooit') return st.nooit;
  return st.dagen != null && st.dagen >= o.dagen;
}

/* Welke filters staan aan (voor teller, chips en wissen)? */
const PANEEL_FILTERS = ['status','gesproken','ster','plaats','ploegen','taal','vervoer','rijbewijs','functie','rec','klant','fase'];
function actieveFilters(){
  const uit = [];
  if(F.status !== F_STD.status) uit.push({k:'status', lbl:statusLbl(F.status)});
  if(F.gesproken) uit.push({k:'gesproken', lbl:gesprokenOpt(F.gesproken).chip});
  if(F.ster > 0)      uit.push({k:'ster', lbl:'≥ '+'★'.repeat(F.ster)});
  if(String(F.plaats).trim()) uit.push({k:'plaats', lbl:'binnen '+F.km+' km van '+F.plaats});
  if(F.ploegen)       uit.push({k:'ploegen', lbl:F.ploegen});
  if(String(F.taal).trim())      uit.push({k:'taal', lbl:'taal: '+F.taal});
  if(F.vervoer)       uit.push({k:'vervoer', lbl:'vervoer: '+F.vervoer});
  if(String(F.rijbewijs).trim()) uit.push({k:'rijbewijs', lbl:'rijbewijs: '+F.rijbewijs});
  if(String(F.functie).trim())   uit.push({k:'functie', lbl:'functie: '+F.functie});
  if(F.rec)           uit.push({k:'rec', lbl:F.rec});
  if(F.klant)         uit.push({k:'klant', lbl:F.klant});
  if(F.fase)          uit.push({k:'fase', lbl:F.fase});
  if(F.mijn)          uit.push({k:'mijn', lbl:'mijn kandidaten'});
  return uit;
}

function lijstTab(wrap){
  const alle = CRM.kandidaten();
  const nFil = actieveFilters().filter(f => f.k !== 'mijn').length;
  /* Eén keer: staan er filters aan, verstop het paneel dan niet. Daarna
     respecteren we wat de gebruiker zelf open- of dichtklikte. */
  if(!filtersOpenGezet){ filtersOpen = nFil > 0; filtersOpenGezet = true; }
  const sel = (f, opts, leeg) => `<select data-f="${f}"><option value="">${h(leeg)}</option>
    ${opts.map(o=>`<option value="${h(o)}"${F[f]===o?' selected':''}>${h(o)}</option>`).join('')}</select>`;

  /* Statusfilter met groepskoppen — zie STATUS_OPTS voor het waarom. */
  const statusSel = (() => {
    let uit = '', groep = null;
    STATUS_OPTS.forEach(o => {
      if(o.g !== groep){ if(groep) uit += '</optgroup>'; groep = o.g; if(groep) uit += `<optgroup label="${h(groep)}">`; }
      uit += `<option value="${h(o.k)}"${F.status===o.k?' selected':''}>${h(o.lbl)}</option>`;
    });
    return `<select data-f="status">${uit}${groep?'</optgroup>':''}</select>`;
  })();

  wrap.innerHTML = `
    <div class="stack">
      <div id="kd_voorraad"></div>
      <div class="card pad">
        <div class="row kd-fil">
          <div class="searchbox" style="flex:1;max-width:290px">
            <input type="search" id="kd_zoek" autocomplete="off" placeholder="Zoek op naam, functie of woonplaats…" value="${h(F.zoek)}">
          </div>
          <button class="btn ghost sm${filtersOpen?' kd-filaan':''}" id="kd_filknop">Filters${nFil?` <span class="num">(${nFil})</span>`:''}</button>
          <select id="kd_sort" style="width:auto" title="Wie eerst bellen: langst niet gesproken bovenaan, bij gelijke stilte de hoogste sterbeoordeling eerst.">
            <option value="gesproken"${F.sort==='gesproken'?' selected':''}>Wie eerst bellen</option>
            <option value="ster"${F.sort==='ster'?' selected':''}>Hoogste sterren</option>
            <option value="naam"${F.sort==='naam'?' selected':''}>Naam</option>
            <option value="fase"${F.sort==='fase'?' selected':''}>Fase</option>
            <option value="volledigheid"${F.sort==='volledigheid'?' selected':''}>Minst volledig</option>
          </select>
          <span class="chip btn-like${F.mijn?' on':''}" id="kd_mijn">Mijn kandidaten</span>
          <span class="spacer"></span>
          <span class="meta num" id="kd_telling"></span>
        </div>
        <div class="kd-fpaneel" id="kd_fpaneel" style="${filtersOpen?'':'display:none'}">
          <div class="kd-fgrid">
            <div class="f-row"><label>Status</label>${statusSel}</div>
            <div class="f-row"><label>Laatst gesproken</label>
              <select data-f="gesproken">
                ${GESPROKEN_OPTS.map(o=>`<option value="${h(o.k)}"${String(F.gesproken||'')===o.k?' selected':''}>${h(o.lbl)}</option>`).join('')}
              </select>
              <div class="hint">Tellen mee: bellen, appen, mailen, een gesprek of een bezoek.</div></div>
            <div class="f-row"><label>Minimaal sterren</label>
              <select data-f="ster">
                <option value="0">Alle</option>
                ${[1,2,3,4,5].map(n=>`<option value="${n}"${F.ster===n?' selected':''}>${'★'.repeat(n)}${n<5?' of meer':''}</option>`).join('')}
              </select></div>
            <div class="f-row"><label>Woont binnen radius</label>
              <div class="row tight" style="flex-wrap:nowrap">
                <input type="text" data-f="plaats" placeholder="Plaats, bv. Gouda" value="${h(F.plaats)}">
                <select data-f="km" style="width:auto;flex:0 0 auto">
                  ${[10,20,30,45].map(k=>`<option value="${k}"${Number(F.km)===k?' selected':''}>${k} km</option>`).join('')}
                </select>
              </div>
              <div class="hint" id="kd_plaatshint"></div></div>
            <div class="f-row"><label>Ploegendiensten</label>${sel('ploegen', CRM.PLOEGEN, 'Alle')}</div>
            <div class="f-row"><label>Taal</label>
              <input type="text" data-f="taal" placeholder="bv. Pools of NL" value="${h(F.taal)}"></div>
            <div class="f-row"><label>Vervoer</label>${sel('vervoer', CRM.VERVOER, 'Alle')}</div>
            <div class="f-row"><label>Rijbewijs</label>
              <input type="text" data-f="rijbewijs" placeholder="bv. B of heftruck" value="${h(F.rijbewijs)}"></div>
            <div class="f-row"><label>Functie</label>
              <input type="text" data-f="functie" placeholder="bv. operator" value="${h(F.functie)}"></div>
            <div class="f-row"><label>Recruiter</label>${sel('rec', uniek(alle.map(c=>c.rec)), 'Alle')}</div>
            <div class="f-row"><label>Klant</label>${sel('klant', uniek(alle.map(c=>c.klant)), 'Alle')}</div>
            <div class="f-row"><label>Fase</label>${sel('fase', CRM.PHASES.map(p=>p.k), 'Alle')}</div>
          </div>
          <div class="row" style="margin-top:2px">
            <button class="btn sub sm" id="kd_wis">Alle filters wissen</button>
          </div>
        </div>
      </div>
      <div class="row tight" id="kd_chips"></div>
      <div id="kd_lijst"></div>
    </div>`;

  const zoekEl = wrap.querySelector('#kd_zoek');
  zoekEl.oninput = CRM.debounce(() => { zet('zoek', zoekEl.value); lijst(wrap); }, 200);
  wrap.querySelector('#kd_sort').onchange = e => { zet('sort', e.target.value); lijst(wrap); };
  wrap.querySelector('#kd_mijn').onclick = e => { zet('mijn', !F.mijn); e.target.classList.toggle('on', F.mijn); lijst(wrap); };
  wrap.querySelector('#kd_filknop').onclick = () => {
    filtersOpen = !filtersOpen;
    wrap.querySelector('#kd_fpaneel').style.display = filtersOpen ? '' : 'none';
    wrap.querySelector('#kd_filknop').classList.toggle('kd-filaan', filtersOpen);
  };
  wrap.querySelector('#kd_wis').onclick = () => {
    PANEEL_FILTERS.forEach(k => zet(k, F_STD[k])); zet('km', F_STD.km);
    lijstTab(wrap);
  };
  wrap.querySelectorAll('[data-f]').forEach(el => {
    const k = el.dataset.f;
    const pas = () => {
      let v = el.value;
      if(k === 'ster' || k === 'km') v = Number(v)||0;
      zet(k, v);
      lijst(wrap);
      filterKnopBij(wrap);
    };
    if(el.tagName === 'SELECT') el.onchange = pas;
    else el.oninput = CRM.debounce(pas, 250);
  });
  lijst(wrap);
}

function filterKnopBij(wrap){
  const knop = wrap.querySelector('#kd_filknop'); if(!knop) return;
  const n = actieveFilters().filter(f => f.k !== 'mijn').length;
  knop.innerHTML = 'Filters' + (n ? ` <span class="num">(${n})</span>` : '');
  knop.classList.toggle('kd-filaan', filtersOpen);
}

function gefilterd(){
  const q = String(F.zoek||'').trim().toLowerCase();
  const radiusAan    = !!String(F.plaats||'').trim();
  const radiusBekend = radiusAan && !!CRM.PLAATSEN[CRM.plaatsSleutel(F.plaats)];
  const golden = goldenIds();
  let zonderPlek = 0;

  const rijen = CRM.kandidaten().filter(c => {
    if(F.status === 'gekwalificeerd' && !gekwalificeerd(c))  return false;
    if(F.status === 'lopend'      && !CRM.isActiefLopend(c)) return false;
    if(F.status === 'beschikbaar' && !CRM.isBeschikbaar(c))  return false;
    if(F.status === 'geplaatst'   && !CRM.PLACED.includes(c.fase)) return false;
    if(F.status === 'golden'      && !golden.has(String(c.id))) return false;
    if(F.status === 'recyclebaar' && !(c.fase === 'Afgevallen' && c.recyclebaar !== false)) return false;
    if(F.ster > 0 && (Number(c.ster)||0) < F.ster) return false;
    /* Ploegen: 'wisselend' kan elke dienst draaien, dus die telt mee
       zodra er op een echte ploegendienst gefilterd wordt. */
    if(F.ploegen && !(c.ploegen === F.ploegen || (F.ploegen !== 'geen' && c.ploegen === 'wisselend'))) return false;
    if(F.taal && !taalMatch(c.talen, F.taal)) return false;
    if(F.vervoer && c.vervoer !== F.vervoer) return false;
    if(F.rijbewijs && !String(c.rijbewijs||'').toLowerCase().includes(F.rijbewijs.trim().toLowerCase())) return false;
    if(F.functie && !String(c.functie||'').toLowerCase().includes(F.functie.trim().toLowerCase())) return false;
    if(F.rec   && c.rec   !== F.rec)   return false;
    if(F.klant && c.klant !== F.klant) return false;
    /* faseIs: een kandidaat die nog op de oude waarde 'Voorselectie' staat
       hoort gewoon bij het filter Intake (zie CRM.faseNorm in data.js). */
    if(F.fase  && !CRM.faseIs(c.fase, F.fase)) return false;
    if(F.mijn  && !CRM.isVanMij(c))    return false;
    /* Stilte is duurder dan de rest (activiteiten doorlopen), dus pas
       nadat de goedkope filters hun werk hebben gedaan. */
    if(F.gesproken && !gesprokenMatch(stilte(c), F.gesproken)) return false;
    if(q && ![c.naam,c.functie,c.woonplaats,c.klant,c.email,c.telefoon,c.talen].join(' ').toLowerCase().includes(q)) return false;
    /* Radius als laatste: onbekende woonplaats valt er eerlijk buiten,
       en de teller telt alleen kandidaten die verder wél door de filters kwamen. */
    if(radiusBekend && !CRM.binnenRadius(c, F.plaats, F.km)){
      if(!CRM.PLAATSEN[CRM.plaatsSleutel(c.woonplaats)]) zonderPlek++;
      return false;
    }
    return true;
  }).map(c => ({c, st:stilte(c), v:CRM.volledigheid(c)}));

  /* Namen vergelijken zonder te struikelen over een kaart die er nog geen
     heeft — die komt achteraan in plaats van de sortering te laten klappen. */
  const opNaam = (a,b) => String(a.c.naam||'￿').localeCompare(String(b.c.naam||'￿'),'nl');

  /* "Wie eerst bellen" is de standaard, en dat is een keuze: wie deze lijst
     opent wil een bellijst, geen alfabet. De regel is bewust in één zin uit
     te leggen — langst niet gesproken bovenaan, en bij gelijke stilte eerst
     de kandidaat met de hoogste beoordeling.

     Twee dingen die de oude sortering nog verkeerd deed:
     1. Nooit-gesproken kandidaten stonden altijd bovenaan, ook als ze
        gisteren binnenkwamen. Nu tellen ze mee met hoe lang ze al in beeld
        zijn (st.dagen) — precies het getal dat de lijst ook toont.
     2. Kaarten zonder meetbare stilte (geanonimiseerd, of geen datum in
        beeld) zakten naar boven via een noodwaarde van 9999. Die horen
        onderaan: er valt niemand te bellen. */
  const stilteVan = r => r.st.dagen == null ? -1 : r.st.dagen;
  const srt = {
    gesproken:    (a,b) => stilteVan(b) - stilteVan(a)
                        || (Number(b.c.ster)||0) - (Number(a.c.ster)||0) || opNaam(a,b),
    ster:         (a,b) => (Number(b.c.ster)||0) - (Number(a.c.ster)||0) || opNaam(a,b),
    naam:         opNaam,
    fase:         (a,b) => CRM.faseIdx(a.c.fase) - CRM.faseIdx(b.c.fase) || opNaam(a,b),
    volledigheid: (a,b) => a.v.pct - b.v.pct
  }[F.sort];
  if(srt) rijen.sort(srt);
  return {rijen, zonderPlek, radiusAan, radiusBekend};
}

/* ═══ De gekwalificeerde voorraad, geteld en uitgesplitst ═════════
   Het getal waar Tjeerd naar vroeg — "hoeveel potentiële kandidaten zijn
   er nou" — plus de uitsplitsing die er iets mee laat doen.

   Waarom gezochte functie als eerste uitsplitsing: een klantvraag komt
   binnen als een functie ("ik heb er maandag drie nodig voor de inpaklijn").
   "42 beschikbaar" beantwoordt die vraag niet, "9 heftruck" wel. Woonplaats
   staat er als tweede naast, want in productie en logistiek is reistijd een
   vaste uitvalreden (zie CRM.AFVAL_CATS) — een orderpicker in Groningen is
   geen orderpicker voor Bodegraven.

   Allebei gelezen uit een vastgelegd veld op de kaart, niet afgeleid: geen
   functie ingevuld is dan ook een eigen groep en geen gok. */
function voorraad(){
  const alle = CRM.kandidaten().filter(gekwalificeerd);
  const groepeer = veld => {
    const m = new Map();
    alle.forEach(c => {
      const ruw = String(c[veld]||'').trim();
      const sleutel = ruw.toLowerCase();
      const g = m.get(sleutel) || {lbl:ruw, n:0, leeg:!ruw};
      g.n++; m.set(sleutel, g);
    });
    return [...m.values()].sort((a,b) => b.n - a.n || String(a.lbl).localeCompare(String(b.lbl),'nl'));
  };
  const st = alle.map(stilte);
  /* nooit2w is bewust een deelverzameling van stil2w en geen tweede,
     losse telling. Twee getallen naast elkaar die elkaar deels overlappen
     nodigen uit om ze op te tellen, en dan klopt de som niet meer. */
  return {
    n: alle.length,
    stil2w: st.filter(s => s.dagen != null && s.dagen >= 14).length,
    nooit2w: st.filter(s => s.nooit && s.dagen != null && s.dagen >= 14).length,
    functie: groepeer('functie'),
    woonplaats: groepeer('woonplaats')
  };
}

/* Het paneel bovenaan het scherm. Staat er altijd, ook als je op iets
   anders filtert: dit is een stand, geen zoekresultaat. Dat het los van de
   filters telt staat er met zoveel woorden bij, anders gaan twee getallen op
   hetzelfde scherm elkaar tegenspreken. */
const CHIPS_MAX = 10;
function voorraadPaneel(wrap){
  const el = wrap.querySelector('#kd_voorraad'); if(!el) return;
  const v = voorraad();
  const aan = F.status === 'gekwalificeerd';

  if(!v.n){
    el.innerHTML = `<div class="card pad kd-vr">
      <div class="label">Gekwalificeerde voorraad</div>
      <p class="kd-vrleeg">Er staat op dit moment niemand klaar om voor te stellen. Een kandidaat
      komt hier zodra de intake op de kaart staat en er nog geen klanttraject loopt.</p></div>`;
    return;
  }

  const splits = F.splits === 'woonplaats' ? 'woonplaats' : 'functie';
  const groepen = v[splits];
  const toon = groepen.slice(0, CHIPS_MAX);
  const rest = groepen.slice(CHIPS_MAX).reduce((s,g) => s + g.n, 0);
  const chip = g => {
    if(g.leeg) return `<span class="chip kd-vrchip kd-vrleegchip" title="${
      splits === 'functie'
        ? 'Deze kandidaten hebben geen gezochte functie op de kaart. Zolang dat leeg is vallen ze buiten elke zoekopdracht op functie.'
        : 'Deze kandidaten hebben geen woonplaats op de kaart, dus geen reisafstand.'
      }"><span class="num">${g.n}</span> ${splits === 'functie' ? 'geen functie ingevuld' : 'geen woonplaats'}</span>`;
    const tip = splits === 'functie'
      ? 'Toon de gekwalificeerde kandidaten die ' + g.lbl.toLowerCase() + ' zoeken'
      : 'Toon de gekwalificeerde kandidaten binnen 10 km van ' + g.lbl + ' — dat kunnen er meer zijn dan de ' + g.n + ' die hier wonen';
    return `<button type="button" class="chip btn-like kd-vrchip" data-vr="${h(g.lbl)}" title="${h(tip)}"
      ><span class="num">${g.n}</span> ${h(g.lbl)}</button>`;
  };

  el.innerHTML = `<div class="card pad kd-vr">
    <div class="kd-vrtop">
      <div class="kd-vrtel">
        <div class="label">Gekwalificeerde voorraad</div>
        <div class="big num">${v.n}</div>
        <div class="kd-vrsub">${v.n === 1 ? 'kandidaat' : 'kandidaten'} met een intake, nog nergens voorgesteld</div>
        <div class="kd-vrstil">${
          v.stil2w
            ? `<span class="chip amber"><span class="num">${v.stil2w}</span> langer dan twee weken niet gesproken</span>`
            : '<span class="chip green">Iedereen is de afgelopen twee weken gesproken</span>'
        }${v.nooit2w ? `<span class="chip red">waarvan <span class="num">${v.nooit2w}</span> nog nooit gesproken</span>` : ''}</div>
      </div>
      <div class="kd-vrsplits">
        <div class="row">
          <div class="seg" id="kd_splitseg">
            <button type="button" data-s="functie"${splits==='functie'?' class="on"':''}>Per gezochte functie</button>
            <button type="button" data-s="woonplaats"${splits==='woonplaats'?' class="on"':''}>Per woonplaats</button>
          </div>
          <span class="spacer"></span>
          ${aan ? '<span class="meta">Je kijkt nu naar deze lijst</span>'
                : '<button class="btn ghost sm" id="kd_vrtoon">Toon deze lijst</button>'}
        </div>
        <div class="row tight kd-vrchips">${toon.map(chip).join('')}${
          rest ? `<span class="meta">en <span class="num">${rest}</span> in kleinere groepen</span>` : ''}</div>
        <p class="meta kd-vrnoot">Geteld over alle kandidaten, los van de filters hieronder — en op wat
          is vastgelegd, niet op een schatting: een intake op de kaart en nog geen enkele stap in een
          klanttraject. De videocall zelf staat op de lead in de recruitmentpijplijn, dus de intake is
          hier het bewijs dat die er is geweest.</p>
      </div>
    </div></div>`;

  el.querySelectorAll('#kd_splitseg button').forEach(b => b.onclick = () => {
    zet('splits', b.dataset.s); voorraadPaneel(wrap);
  });
  const toonKnop = el.querySelector('#kd_vrtoon');
  if(toonKnop) toonKnop.onclick = () => { zet('status','gekwalificeerd'); lijstTab(wrap); };
  /* Een chip betekent "toon mij deze groep", niet "voeg nog een filter toe".
     Daarom gaat de vorige chipkeuze eerst weg: anders klik je van functie
     naar woonplaats en houd je een lege lijst over omdat de oude functie er
     stilletjes nog onder ligt. Handmatig gezette filters (sterren, taal,
     ploegen) blijven wél staan — die heb je zelf bewust aangezet. */
  el.querySelectorAll('[data-vr]').forEach(b => b.onclick = () => {
    zet('status','gekwalificeerd');
    zet('functie', ''); zet('plaats', '');
    if(splits === 'functie'){ zet('functie', b.dataset.vr); }
    else { zet('plaats', b.dataset.vr); zet('km', 10); }
    lijstTab(wrap);
  });
}

/* Hoe lang niet gesproken, in de lijst. Zonder dit getal is het filter een
   black box. Nooit-gesproken krijgt bewust een andere regel dan lang-geleden:
   het eerste is een gat in het proces, het tweede een belletje waard. */
function stilteCel(st){
  if(st.anon) return '<span class="sub">gegevens gewist</span>';
  const klas = st.kleur === 'red' ? ' kd-let' : st.kleur === 'amber' ? ' kd-warn' : '';
  if(st.nooit) return `<span class="kd-nooit${klas}">nooit gesproken</span>
    <div class="rowsub">${st.wacht == null ? 'niet bekend hoe lang in beeld'
      : `<span class="num">${st.wacht}</span> ${st.wacht === 1 ? 'dag' : 'dagen'} in beeld`}</div>`;
  const soort = st.soort ? String((CRM.ACT_SOORTEN[st.soort]||{}).lbl || st.soort).toLowerCase() : '';
  return `<span class="num${klas}">${h(st.tekst)}</span>${soort ? `<div class="rowsub">${h(soort)}</div>` : ''}`;
}

function lijst(wrap){
  const {rijen, zonderPlek, radiusAan, radiusBekend} = gefilterd();
  voorraadPaneel(wrap);
  const lijstEl = wrap.querySelector('#kd_lijst');
  const tel  = wrap.querySelector('#kd_telling');
  const dun  = rijen.filter(r => r.v.pct < 60).length;
  if(tel) tel.textContent = rijen.length + (rijen.length===1?' kandidaat':' kandidaten') + (dun?' · '+dun+' onvolledig':'');

  const hint = wrap.querySelector('#kd_plaatshint');
  if(hint) hint.textContent = radiusAan && !radiusBekend
    ? '"'+F.plaats+'" is geen herkende plaats — de radius filtert nu niet.' : '';

  /* Actieve filters als verwijderbare chips. */
  const chipsEl = wrap.querySelector('#kd_chips');
  if(chipsEl){
    const act = actieveFilters();
    chipsEl.innerHTML = act.map(f =>
      `<span class="chip kd-fchip">${h(f.lbl)}<button class="kd-fx" data-fx="${h(f.k)}" title="Filter weghalen">×</button></span>`).join('')
      + (radiusBekend && zonderPlek ? `<span class="meta"><span class="num">${zonderPlek}</span> zonder herkende plaats vallen buiten deze radius</span>` : '');
    chipsEl.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => {
      zet(b.dataset.fx, F_STD[b.dataset.fx]);
      lijstTab(wrap);   // paneel-invoer moet meebewegen met de chip
    });
  }

  if(!rijen.length){
    /* Een lege lijst zonder reden laat je zoeken naar een fout die er niet
       is. Noem daarom wát er samen op nul uitkomt en bied één klik om het
       weer los te laten. */
    /* De status staat er altijd bij, ook als hij op de standaardwaarde
       staat. Hij beperkt de lijst net zo goed, en een lege lijst zonder
       vermelding van de belangrijkste beperking legt niets uit. */
    const aan = [statusLbl(F.status)]
      .concat(actieveFilters().filter(f => f.k !== 'status').map(f => f.lbl));
    if(String(F.zoek||'').trim()) aan.push('zoeken op "' + F.zoek.trim() + '"');
    const leeg = !CRM.kandidaten().length;
    lijstEl.innerHTML = leeg
      ? CRM.ui.leeg('Nog geen kandidaten',
          'Er staat nog geen enkele kandidaat in het systeem. Ze komen hier binnen vanuit de recruitmentpijplijn.')
      : CRM.ui.leeg('Geen kandidaten binnen deze filters',
          'Samen leveren deze niets op: ' + aan.join(' · ') + '.',
          '<button class="btn ghost sm" id="kd_leegwis">Filters wissen</button>');
    const wisKnop = lijstEl.querySelector('#kd_leegwis');
    if(wisKnop) wisKnop.onclick = () => {
      PANEEL_FILTERS.forEach(k => zet(k, F_STD[k]));
      zet('km', F_STD.km); zet('zoek', ''); zet('mijn', false);
      lijstTab(wrap);
    };
    return;
  }
  const golden = goldenIds();
  lijstEl.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr>
      <th>Kandidaat</th><th>Sterren</th><th>Klant</th><th>Fase</th><th>Woonplaats</th><th>Recruiter</th>
      <th title="Alleen echt contact telt: bellen, appen, mailen, een gesprek of een bezoek. Een notitie of een fasewissel niet.">Laatst gesproken</th><th>Profiel</th>
    </tr></thead><tbody>${rijen.map(({c,st,v}) => {
      const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : '';
      const km = radiusBekend ? CRM.afstandKm(c.woonplaats, F.plaats) : null;
      return `<tr class="clickable" data-id="${h(String(c.id))}">
        <td><b>${h(c.naam)}</b>${golden.has(String(c.id))?' '+goldenSter():''}<div class="rowsub">${h(c.functie||'—')}${
          c.cv && c.cv.werkgever ? ' · '+h(c.cv.werkgever) : ''}${
          c.bron==='Import oud ATS' ? ' <span class="kd-bronimp">Import oud ATS</span>' : ''}</div></td>
        <td><span class="kd-ster num" title="${c.ster?c.ster+' van 5':'nog geen beoordeling'}">${h(CRM.sterren(c.ster))}</span></td>
        <td class="sub">${h(c.klant||'—')}</td>
        <td>${faseChip(c.fase)}</td>
        <td class="sub">${h(c.woonplaats||'—')}${km!=null?` <span class="meta num">· ${km} km</span>`:''}</td>
        <td class="sub">${h(c.rec||'—')}</td>
        <td class="sub kd-stilte">${stilteCel(st)}</td>
        <td><div class="kd-vol">${CRM.ui.bar(v.pct, kleur)}<span class="meta num">${v.pct}%</span></div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  lijstEl.querySelectorAll('[data-id]').forEach(tr => tr.onclick = () => CRM.ga('kandidaten',{id:tr.dataset.id}));
}

/* ═══════════════════════════════════════════════════════════════
   KANDIDATENKAART
   ═══════════════════════════════════════════════════════════════ */
let kandOpen = null, tabActief = 'activiteiten';

/* Inline bewerkbare velden — pad 'cv.x' schrijft in het cv-jsonb.
   Beschikbaarheid, ploegen, talen, rijbewijs en vervoer zijn échte
   kandidaatvelden (daar filtert het overzicht op), geen cv-velden. */
const VELDEN = [
  {k:'naam',        lbl:'Naam',              t:'text'},
  {k:'telefoon',    lbl:'Telefoon',          t:'tel'},
  {k:'email',       lbl:'E-mail',            t:'email'},
  {k:'woonplaats',  lbl:'Woonplaats',        t:'text'},
  {k:'functie',     lbl:'Gezochte functie',  t:'text'},
  {k:'beschikbaar', lbl:'Beschikbaar',       t:'select', opts:['', ...CRM.BESCHIKBAAR]},
  {k:'ploegen',     lbl:'Ploegendiensten',   t:'select', opts:['', ...CRM.PLOEGEN]},
  {k:'talen',       lbl:'Talen',             t:'text'},
  {k:'rijbewijs',   lbl:'Rijbewijs',         t:'text'},
  {k:'vervoer',     lbl:'Vervoer',           t:'select', opts:['', ...CRM.VERVOER]},
  {k:'maandloon',   lbl:'Maandloon',         t:'number', toon:v => v ? CRM.euro(v) : ''},
  {k:'toeslagPct',  lbl:'Toeslagen',         t:'number', toon:v => v ? CRM.pct(v) : ''}
];

/* ─── Blok "Huidige situatie" ─────────────────────────────────────
   De velden uit het oude ATS (import, cv-jsonb) plus herkomst. Bron
   en salariswens zijn hierheen verhuisd uit Kandidaatgegevens zodat
   niets dubbel staat. Salaris van een kandidaat is een arbeids-
   voorwaarde en mag het team zien — bewust géén canSeeMoney. */

/* Opzegtermijn uit het oude ATS staat in het Engels — vertaal bij tonen. */
const opzegNL = v => {
  const s = String(v == null ? '' : v).trim();
  if(!s) return '';
  if(/^immediately$/i.test(s)) return 'per direct';
  const m = s.match(/^(\d+)\s*days?$/i);
  return m ? m[1] + ' dagen' : s;
};
/* Salaris tonen als euro per maand; niet-numerieke oude invoer blijft staan. */
const euroMnd = v => {
  if(v == null || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v) : CRM.euro(n) + ' p/mnd';
};
const SITUATIE_VELDEN = [
  {k:'functie',          lbl:'Huidige functie',  t:'text'},
  {k:'cv.werkgever',     lbl:'Huidig bedrijf',   t:'text'},
  {k:'cv.opzegtermijn',  lbl:'Opzegtermijn',     t:'text', toon:opzegNL},
  {k:'cv.huidigSalaris', lbl:'Huidig salaris',   t:'text', toon:euroMnd},
  {k:'cv.salariswens',   lbl:'Salariswens',      t:'text', toon:euroMnd},
  {k:'since',            lbl:'Binnengekomen op', t:'date', toon:v => CRM.fmtDate(v)},
  {k:'rec',              lbl:'Eigenaar',         t:'text'},
  {k:'bron',             lbl:'Bron',             t:'select', opts:['', 'Import oud ATS', ...CRM.LEAD_BRONNEN]}
];
/* ─── Traject en contract (verhuisd uit de bewerk-drawer) ─────────
   Dit zijn de velden waar het bord op draait: afspraak, actie, start,
   garantie, vervanging en de salariscomponenten. Ze stonden in het
   smalle bewerkpaneel; nu staan ze hier, in dezelfde inline-stijl als
   de rest van de kaart. De fase zelf zit er bewust NIET bij — die
   wissel je met de knop "Fase wijzigen…", zodat de poortwachters uit
   recruitment.js altijd langskomen.                                 */
const gestopten = huidigeId => CRM.kandidaten()
  .filter(x => x.fase === 'Gestopt' && String(x.id) !== String(huidigeId))
  .map(x => ({v:String(x.id), l:`${x.naam} (${x.klant||'—'})`}));
const naamVan = id => {
  const k = id ? CRM.kandidaat(id) : null;
  return k ? k.naam + (k.klant ? ' ('+k.klant+')' : '') : (id ? String(id) : '');
};
const TRAJECT_VELDEN = [
  {k:'type',         lbl:'Type',            t:'select', opts:['','W&S','Flex']},
  {k:'datum',        lbl:'Afspraakdatum',   t:'date',   toon:v => CRM.fmtDate(v)},
  {k:'tijd',         lbl:'Tijd',            t:'time'},
  {k:'volgendeActie',lbl:'Volgende actie',  t:'text'},
  {k:'actieDatum',   lbl:'Actiedatum',      t:'date',   toon:v => CRM.fmtDate(v)}
];
const CONTRACT_VELDEN = [
  {k:'start',        lbl:'Startdatum',      t:'date',   toon:v => CRM.fmtDate(v)},
  {k:'garantieMnd',  lbl:'Garantie',        t:'number', toon:v => v ? v + (v==1?' maand':' maanden') : ''},
  {k:'vervangt',     lbl:'Vervangt',        t:'select', opts:c => [{v:'',l:'—'}].concat(gestopten(c.id)), toon:naamVan},
  {k:'geplaatstOp',  lbl:'Geplaatst op',    t:'date',   toon:v => CRM.fmtDate(v), alleenBijPlaatsing:true},
  {k:'gestoptOp',    lbl:'Gestopt op',      t:'date',   toon:v => CRM.fmtDate(v), alleenBijPlaatsing:true}
];
const SALARIS_VELDEN = [
  {k:'maandloon',    lbl:'Bruto maandloon', t:'number', toon:v => v ? CRM.euro(v) : ''},
  {k:'toeslagPct',   lbl:'Ploegentoeslag',  t:'number', toon:v => v ? CRM.pct(v) : ''},
  {k:'vtPct',        lbl:'Vakantietoeslag', t:'number', toon:v => v ? CRM.pct(v) : '', hint:'leeg = 8%'},
  {k:'ejuPct',       lbl:'Eindejaarsuitkering', t:'number', toon:v => v ? CRM.pct(v) : ''},
  {k:'overigPct',    lbl:'Overig',          t:'number', toon:v => v ? CRM.pct(v) : ''}
];

/* Eén lijst voor het opzoeken bij inline bewerken (alle blokken). */
const ALLE_VELDEN = VELDEN.concat(SITUATIE_VELDEN, TRAJECT_VELDEN, CONTRACT_VELDEN, SALARIS_VELDEN);
function lees(c, pad){
  if(pad.indexOf('cv.') === 0) return (c.cv || {})[pad.slice(3)];
  return c[pad];
}
function schrijf(c, pad, waarde){
  if(pad.indexOf('cv.') === 0){ c.cv = Object.assign({}, c.cv || {}); c.cv[pad.slice(3)] = waarde; }
  else c[pad] = waarde;
}
function toonWaarde(veld, waarde){
  if(waarde == null || waarde === '') return '';
  if(veld.lijst) return Array.isArray(waarde) ? waarde.join(', ') : String(waarde);
  if(veld.toon)  return veld.toon(waarde);
  return String(waarde);
}

function kaart(mount, acties, id){
  const c = CRM.kandidaat(id);
  if(!c){
    acties.innerHTML = '';
    mount.innerHTML = CRM.ui.leeg('Kandidaat niet gevonden','Deze kandidaat bestaat niet (meer).',
      '<button class="btn ghost" id="kd_terug">Terug naar overzicht</button>');
    mount.querySelector('#kd_terug').onclick = () => CRM.ga('kandidaten');
    return;
  }
  if(kandOpen !== String(id)){ kandOpen = String(id); tabActief = 'activiteiten'; }

  /* Eén inplan-knop, niet twee. "Inplannen" was vaag én het venster stond
     standaard op een gesprek zonder video, terwijl de videocall juist de
     eerste stap is na binnenkomst. De knop heet nu wat hij doet, staat als
     enige gevulde knop rechts (primaire vervolgstap) en het venster kan
     nog steeds een gewone afspraak maken: Teams-vinkje uit. */
  /* Kwam je hier vanaf het pijplijnbord, dan is "terug" het bord — met
     dezelfde filters én dezelfde scrollpositie (zie js/pijplijn.js). */
  const vanBord = typeof CRM.pijplijnTerug === 'function' && CRM.pijplijnTerug(c.id);
  acties.innerHTML = `
    <button class="btn ghost sm" id="c_terug">${vanBord?'← Terug naar Klanttrajecten':'← Overzicht'}</button>
    <button class="btn ghost sm" id="c_bel">Gebeld</button>
    <button class="btn ghost sm" id="c_app">Geappt</button>
    <button class="btn ghost sm" id="c_notitie">Notitie</button>
    <button class="btn ghost sm" id="c_taak">Taak</button>
    <button class="btn ghost sm" id="c_profiel">Kandidaatprofiel</button>
    <button class="btn sm" id="c_video">Videocall inplannen</button>`;
  acties.querySelector('#c_terug').onclick   = () => CRM.ga(vanBord ? 'pijplijn' : 'kandidaten');
  /* Kandidaatprofiel in huisstijl (js/cv.js): het vel dat naar de klant gaat.
     De vacature gaat mee zodat "voorgesteld voor" en de reisafstand kloppen. */
  acties.querySelector('#c_profiel').onclick = () => CRM.cvGen.open(c, {
    vacature: c.vacatureId || null, klant: c.klant || ''
  });
  acties.querySelector('#c_video').onclick   = () => videocallModal(c);
  acties.querySelector('#c_bel').onclick     = () => logVia(c,'bel','Wat is er besproken?');
  acties.querySelector('#c_app').onclick     = () => logVia(c,'whatsapp','Wat heb je gestuurd?');
  acties.querySelector('#c_notitie').onclick = () => notitieToevoegen(c);
  acties.querySelector('#c_taak').onclick    = () => nieuweTaak(c);

  mount.innerHTML = `
    <div class="stack">
      ${kopHtml(c)}
      <div class="grid c2 kd-kolommen">
        <div class="stack">
          ${gegevensHtml(c)}
          ${situatieHtml(c)}
          ${cvHtml(c)}
          ${intakeHtml(c)}
        </div>
        <div class="stack">
          ${kansenHtml(c)}
          ${trajectHtml(c)}
          <!-- Opvolging staat pal onder Traject: het is de voortzetting
               daarvan. Nazorg ná de start, warm houden ervóór, plus de
               verjaardag en de felicitatiemail. Opvolging en Uitval sluiten
               elkaar grotendeels uit (Gestart/Contract getekend tegenover
               Afgevallen/Gestopt), dus de kolom wordt er niet langer van.
               Het ritme zelf staat in js/opvolging.js — die ene plek. -->
          ${CRM.opvolging ? CRM.opvolging.kaartHtml(c) : ''}
          ${uitvalHtml(c)}
          ${contractHtml(c)}
          ${factuurklaarHtml(c)}
          ${CRM.mailUI ? CRM.mailUI.blokHtml(c.email, 'kd_mailblok') : ''}
          ${CRM.bestandenUI ? CRM.bestandenUI.blokHtml(c.naam, 'kd_bestanden') : ''}
        </div>
      </div>
      <div>
        <div class="tabs" id="c_tabs">${tabsHtml(c)}</div>
        <div id="c_tabinhoud"></div>
      </div>
      <!-- Verwijderen en anonimiseren (js/kandverwijder.js). Onderaan de
           kaart, want het is het einde van een dossier en geen dagelijkse
           handeling. De regels wie wat mag wonen daar, niet hier. -->
      ${CRM.kandVerwijder ? CRM.kandVerwijder.knopHtml(c) : ''}
    </div>`;

  bindVelden(mount, c);
  bindSterren(mount, c);
  bindMist(mount, c);
  /* Uitvalgegevens vastleggen of bijwerken vanaf de kaart zelf — hetzelfde
     formulier als op het bord, zodat er maar één plek is waar dit gebeurt. */
  mount.querySelector('#c_uitval')?.addEventListener('click',
    () => CRM.kandidaatUitval(c.id, c.fase));
  /* "Klaar voor facturatie": springen naar het ontbrekende veld. Sommige
     velden staan alleen op de kaart in bepaalde fases (geplaatstOp verschijnt
     pas bij een plaatsing). Bestaat het veld hier niet, dan wordt de knop
     gewone tekst — een knop die nergens heen gaat is erger dan geen knop. */
  CRM.$$('[data-mistveld]', mount).forEach(b => {
    const doel = mount.querySelector('.kd-w[data-veld="' + CSS.escape(b.dataset.mistveld) + '"]');
    if(doel) b.onclick = () => springNaarVeld(b.dataset.mistveld, c);
    else b.replaceWith(Object.assign(document.createElement('span'), {textContent:b.textContent}));
  });

  /* Mail: pas ophalen nu de kaart daadwerkelijk openstaat — in de
     lijstweergave wordt er nooit mail opgevraagd. */
  if(CRM.mailUI){
    CRM.mailUI.laad(mount, c.email, 'kd_mailblok');
    CRM.mailUI.bindLinks(mount.querySelector('.kd-contact'), mailOpties(c));
    const mailBtn = mount.querySelector('#c_mail');
    if(mailBtn) mailBtn.onclick = () => CRM.mailUI.opstellen(mailOpties(c));
  }
  /* CV's en documenten die al in OneDrive of SharePoint staan — zoeken
     op naam, pas nu de kaart openstaat. Er wordt niets gekopieerd. */
  if(CRM.bestandenUI) CRM.bestandenUI.laad(mount, c.naam, 'kd_bestanden');
  /* Kandidaat in het Outlook-adresboek zetten, zodat je telefoon bij een
     inkomend gesprek meteen laat zien wie er belt. */
  const olBtn = mount.querySelector('#c_outlook');
  if(olBtn && CRM.naarOutlook) olBtn.onclick = () => CRM.naarOutlook(olBtn, {
    naam: c.naam, email: c.email, telefoon: c.telefoon,
    bedrijf: (c.cv && c.cv.werkgever) || '', functie: c.functie
  });
  const goldBtn = mount.querySelector('#c_golden');
  if(goldBtn) goldBtn.onclick = async () => {
    const ok = await zetGolden(c.id, !isGolden(c.id));
    if(ok) CRM.render();
  };
  /* Twee knoppen, één handeling: de knop in de kop van "CV & ervaring" en de
     knop midden in het lege blok eronder. Wie op een lege kaart kijkt, kijkt
     naar het lege blok en niet naar de kopregel. */
  mount.querySelectorAll('#c_cvlees, #c_cvleeg').forEach(b => b.onclick = () => cvLezen(c));
  /* Het cv-bestand zelf, met een tijdelijke link om te openen. */
  if(CRM.cvParse) CRM.cvParse.bindBestand(mount);
  if(CRM.intakeAI) CRM.intakeAI.bindBlok(mount);
  const certKnop = mount.querySelector('#c_certnieuw');
  if(certKnop) certKnop.onclick = () => certModal(c, -1);
  mount.querySelectorAll('[data-cert]').forEach(b => b.onclick = () => certModal(c, Number(b.dataset.cert)));
  /* Opvolging: check-in vastleggen, ritme uitklappen, felicitatiemail openen.
     Alle knoppen zitten in js/opvolging.js — deze kaart roept alleen aan. */
  if(CRM.opvolging) CRM.opvolging.bindKaart(mount, c, () => CRM.render());
  if(CRM.kandVerwijder) CRM.kandVerwijder.bindKnop(mount);

  /* Traject-acties — de logica woont in js/recruitment.js, inclusief álle
     poortwachters. Deze kaart roept alleen aan. */
  const klik = (sel, fn) => { const b = mount.querySelector(sel); if(b) b.onclick = fn; };
  klik('#c_fase',   () => CRM.kandidaatFasePicker && CRM.kandidaatFasePicker(c.id));
  klik('#c_intake', () => CRM.kandidaatIntake && CRM.kandidaatIntake(c.id));
  klik('#c_noshow', () => CRM.kandidaatNoShow && CRM.kandidaatNoShow(c.id));
  klik('#c_uitval', () => CRM.kandidaatUitval && CRM.kandidaatUitval(c.id));
  klik('#c_intake2',() => CRM.kandidaatIntake && CRM.kandidaatIntake(c.id));
  klik('#c_snel',   () => CRM.kandidaatBewerk && CRM.kandidaatBewerk(c.id));
  mount.querySelectorAll('#c_tabs .tab').forEach(b => b.onclick = () => {
    tabActief = b.dataset.t;
    mount.querySelectorAll('#c_tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === tabActief));
    tabInhoud(mount, c);
  });
  mount.querySelectorAll('[data-klant]').forEach(a => a.onclick = e => {
    e.preventDefault(); CRM.ga('klanten',{id:a.dataset.klant});
  });
  mount.querySelectorAll('[data-voorstel]').forEach(b => b.onclick = () => {
    const v = CRM.state.vacs.find(v => String(v.id) === b.dataset.voorstel);
    if(v) voorstellen(c, v);
  });
  tabInhoud(mount, c);
}

/* ─── Mailen met de kandidaat ─────────────────────────────────────
   Met Outlook-koppeling opent het opstelvenster (CRM.mailUI, gedeeld
   met de klantenmodule); zonder koppeling blijft het gewoon mailto.
   Na versturen wordt het gelogd en tekent de kaart zich opnieuw, dus
   ook het mailblok is dan bij. */
const voornaam = n => String(n||'').trim().split(/\s+/)[0] || '';
function mailOpties(c){
  return {
    aan: c.email || '',
    wie: c.naam + (c.functie ? ' — ' + c.functie : ''),
    set: 'kandidaat',
    ctx: { voornaam: voornaam(c.naam), klant: c.klant || '', functie: c.functie || '' },
    entiteit: 'kandidaat', ref: String(c.id),
    na(){ tabActief = 'activiteiten'; CRM.render(); }
  };
}

/* ─── Ster-beoordeling in de kop ──────────────────────────────── */
function sterrenHtml(c){
  const s = Number(c.ster)||0;
  return `<div class="kd-sterren" role="group" aria-label="Beoordeling">
    ${[1,2,3,4,5].map(i => `<button type="button" class="kd-sterbtn${i<=s?' aan':''}" data-ster="${i}"
      title="${i===s ? 'Klik nogmaals om de beoordeling te wissen' : i+' van 5 sterren'}">★</button>`).join('')}
    <span class="meta">${s ? `<span class="num">${s}</span>/5` : 'nog geen beoordeling'}</span>
  </div>`;
}
function bindSterren(mount, c){
  mount.querySelectorAll('.kd-sterbtn').forEach(b => b.onclick = async () => {
    const n = Number(b.dataset.ster);
    c.ster = (Number(c.ster)||0) === n ? 0 : n;      // zelfde ster = wissen
    await bewaarKandidaat(c);
    const wrap = mount.querySelector('.kd-sterren');
    if(wrap){ wrap.outerHTML = sterrenHtml(c); bindSterren(mount, c); }
  });
}

/* ─── "Wat mist nog" ──────────────────────────────────────────────
   Een net doorgeschoten sollicitant heeft bijna niets ingevuld. In
   plaats van een lijstje in de meter (lezen, zoeken, klikken) staan de
   drie belangrijkste gaten bovenaan als knoppen die het veld openen.
   Geen nieuwe verplichte velden: dit is exact CRM.volledigheid —
   de vijf verplichte velden plus e-mail en CV, die daar meetellen. */
/* Naam staat vooraan: er passen er maar drie op de strip, en een kandidaat
   zonder naam is het gat dat je als eerste dicht wilt hebben (de kop zegt
   dan letterlijk "Naam nog niet ingevuld"). Daarna telefoon en e-mail:
   daarmee bereik je de kandidaat. */
const MIST_VOLGORDE = ['naam','telefoon','email','functie','woonplaats','bron'];
function gaten(c){
  const v = CRM.volledigheid(c);
  if(v.pct >= 100) return [];
  const mist = new Set(v.mist.map(m => m.k));
  const uit = [];
  MIST_VOLGORDE.forEach(k => {
    if(k === 'email'){
      if(!String(c.email||'').trim()) uit.push({k:'email', lbl:'E-mailadres'});
      return;
    }
    if(!mist.has(k)) return;
    const f = ALLE_VELDEN.find(x => x.k === k);
    uit.push({k, lbl:(f ? f.lbl : k)});
  });
  if(c.cv) return uit.slice(0,3);
  /* De CV-knop stond achteraan en viel daardoor juist weg bij de kaarten waar
     hij het hardst nodig is: een verse kaart mist drie velden en dan sneed
     slice(0,3) hem er precies af. Eén cv inlezen vult in één handeling wat
     hier per veld gevraagd wordt, dus bij twee of meer gaten staat hij
     vooraan en opvallend; anders sluit hij gewoon achteraan aan. */
  const sterk = uit.length >= 2;
  const cvGat = {k:'__cv', lbl:'CV inlezen', sterk};
  return sterk ? [cvGat, ...uit.slice(0,2)] : [...uit, cvGat].slice(0,3);
}
function mistHtml(c){
  const g = gaten(c);
  return `<div class="card-f kd-mist" id="kd_mist"${g.length?'':' hidden'}>${g.length ? `
    <span class="label">Wat mist nog</span>
    ${g.map(x => `<button type="button" class="chip btn-like kd-mistchip${x.sterk?' sterk':''}" data-mist="${h(x.k)}"
      title="${x.sterk?'Vult in één keer meerdere velden':'Meteen invullen'}">${h(x.lbl)}</button>`).join('')}
    <span class="spacer"></span>
    <span class="meta">klik om het meteen in te vullen</span>` : ''}</div>`;
}
function bindMist(root, c){
  (root || document).querySelectorAll('[data-mist]').forEach(b => b.onclick = () => {
    if(b.dataset.mist === '__cv') return cvLezen(c);
    springNaarVeld(b.dataset.mist, c);
  });
}
/* Naar een veld springen en het meteen in bewerkmodus zetten. */
function springNaarVeld(k, c){
  const span = document.querySelector('.kd-w[data-veld="' + CSS.escape(k) + '"]');
  if(!span) return;
  span.scrollIntoView({behavior:'smooth', block:'center'});
  span.classList.add('kd-wijs');
  setTimeout(() => span.classList.remove('kd-wijs'), 1500);
  /* Even wachten: anders opent het invoerveld terwijl de pagina nog rolt. */
  setTimeout(() => { if(span.isConnected) bewerkVeld(span, c || CRM.kandidaat(kandOpen)); }, 280);
}

/* ─── De kop van een geanonimiseerde kaart ──────────────────────
   Op een kaart waarvan de gegevens net op verzoek gewist zijn, stonden
   "Profiel compleet 45%", "Wat mist nog: Telefoon · E-mailadres" en "5 dagen
   niet gesproken". Dat is het systeem dat aandringt op precies de gegevens
   die het zojuist bewust heeft weggegooid, en het leest als een fout.

   Drie keer een andere oplossing, om drie verschillende redenen:
   - de voortgangsmeter wordt vervángen. Weglaten zou een gat in de kop
     achterlaten en, erger, niets zeggen — terwijl er juist iets uit te
     leggen valt. Er staat nu wat er gebeurd is.
   - de strip "Wat mist nog" verdwijnt. Die bestaat om ergens heen te
     klikken en iets in te vullen; er valt hier niets in te vullen. Een
     strip die "niets mist" zegt zou bovendien niet waar zijn.
   - de stiltechip verdwijnt (zie stilteChip). "Vijf dagen niet gesproken"
     is een belsuggestie, en dit is de enige kandidaat die je niet belt. */
function anonMeterHtml(){
  return `<div class="kd-meter kd-anonmeter">
    <div class="label">Gegevens gewist</div>
    <p class="kd-anontekst">De persoonsgegevens van deze kandidaat zijn op verzoek verwijderd.
      De kaart blijft bestaan zodat de plaatsing in de cijfers blijft kloppen.
      Wat hier leeg is, hoort leeg te zijn.</p>
  </div>`;
}

function kopHtml(c){
  const anon = geanonimiseerd(c);
  const v = CRM.volledigheid(c);
  const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : 'green';
  const BESCH_LBL = {direct:'Direct beschikbaar', 'in overleg':'Beschikbaar in overleg', niet:'Niet beschikbaar'};
  const besch = BESCH_LBL[c.beschikbaar] || (c.start ? 'Start ' + CRM.fmtDate(c.start) : '');
  const gold = isGolden(c.id);
  return `<div class="card"><div class="card-b kd-hero">
    <div style="min-width:0;flex:1">
      <div class="h1" style="font-size:24px">${c.naam ? h(c.naam) : '<span class="kd-geennaam">Naam nog niet ingevuld</span>'}${gold?' '+goldenSter('lg'):''}</div>
      ${sterrenHtml(c)}
      <div class="sub" style="margin-top:3px">
        ${h(c.functie||'Functie nog niet ingevuld')}
        ${c.klant?` · <a href="#klanten/${encodeURIComponent(c.klant)}" data-klant="${h(c.klant)}">${h(c.klant)}</a>`:''}
        ${c.woonplaats?' · '+h(c.woonplaats):''}
      </div>
      <div class="row tight" style="margin-top:9px">
        <button type="button" class="chip btn-like kd-goldbtn${gold?' aan':''}" id="c_golden"
          title="${gold?'Klik om de golden-markering weg te halen':'Markeer als golden candidate: goede kandidaat, nu geen passende vacature'}">★ Golden candidate</button>
        ${faseChip(c.fase)}
        ${besch?`<span class="chip${c.beschikbaar==='direct'?' green':''}">${h(besch)}</span>`:''}
        ${c.rec?`<span class="chip">Recruiter ${h(c.rec)}</span>`:''}
        ${c.type?`<span class="chip">${h(c.type)}</span>`:''}
        ${stilteChip(c)}
        ${c.noShows?`<span class="chip red"><span class="num">${c.noShows}</span> no-show</span>`:''}
      </div>
      <div class="kd-contact">
        ${c.telefoon?`<a class="num" href="${h(telLink(c.telefoon))}">${h(c.telefoon)}</a>
          <a class="btn sub sm" href="${h(waLink(c.telefoon))}" target="_blank" rel="noopener">WhatsApp</a>`:'<span class="meta">Geen telefoonnummer</span>'}
        ${c.email?`<a href="mailto:${h(c.email)}">${h(c.email)}</a>
          <button type="button" class="btn sub sm" id="c_mail">Mailen</button>`:'<span class="meta">Geen e-mailadres</span>'}
        ${outlookAan() && (c.email || c.telefoon)
          ? `<button type="button" class="btn sub sm" id="c_outlook"
              title="Zet deze kandidaat in je Outlook-adresboek, dan ziet je telefoon wie er belt">Naar Outlook</button>` : ''}
      </div>
    </div>
    ${anon ? anonMeterHtml() : `<div class="kd-meter">
      <div class="label">Profiel compleet</div>
      <div class="row tight" style="flex-wrap:nowrap;margin:6px 0 8px">
        <div style="flex:1">${CRM.ui.bar(v.pct, kleur==='green'?'green':kleur)}</div>
        <b class="num">${v.pct}%</b>
      </div>
      ${v.mist.length
        ? `<div class="meta">Nog invullen: ${v.mist.map(m=>h(m.lbl.toLowerCase())).join(', ')}</div>`
        : '<div class="meta">Alles ingevuld — netjes.</div>'}
    </div>`}
  </div>${anon ? '' : mistHtml(c)}</div>`;
}

/* ─── Kandidaatgegevens (inline bewerkbaar) ───────────────────── */
function gegevensHtml(c){
  const uitCv = Array.isArray(c.cv && c.cv.uitCv) ? c.cv.uitCv : [];
  return `<div class="card">
    <div class="card-h"><div class="h2">Kandidaatgegevens</div>
      <span class="meta">klik een waarde om te wijzigen</span></div>
    <div class="card-b"><div class="kd-velden">${VELDEN.map(f => {
      const w = toonWaarde(f, lees(c, f.k));
      const rij = `<div class="kd-veld"><span class="label">${h(f.lbl)}</span>
        <span><span class="kd-w${w?'':' leeg'}" data-veld="${h(f.k)}" tabindex="0" role="button">${w?h(w):'invullen…'}</span>${
          w && uitCv.includes(f.k) ? ' <span class="chip green kd-cvchip" title="Automatisch overgenomen uit het CV">uit CV</span>' : ''
        }</span></div>`;
      /* De reisafstand staat pal onder vervoer en woonplaats, want pas samen
         zeggen die drie iets: 40 km met een auto is een ander verhaal dan
         40 km zonder. Bewust géén eigen kaart — de kandidatenkaart is vol. */
      return rij + (f.k === 'vervoer' ? reisafstandRij(c) : '');
    }).join('')}</div></div></div>`;
}

/* ─── Huidige situatie (inline bewerkbaar, zelfde stijl) ──────────
   Waar de kandidaat nú zit: functie, werkgever, opzegtermijn en
   salaris uit het geïmporteerde oude ATS, plus herkomst (since,
   eigenaar, bron). cv.*-velden schrijven het cv-jsonb bij. */
function situatieHtml(c){
  return `<div class="card">
    <div class="card-h"><div class="h2">Huidige situatie</div>
      <span class="meta">klik een waarde om te wijzigen</span></div>
    <div class="card-b"><div class="kd-velden">${SITUATIE_VELDEN.map(f => {
      const w = toonWaarde(f, lees(c, f.k));
      return `<div class="kd-veld"><span class="label">${h(f.lbl)}</span>
        <span><span class="kd-w${w?'':' leeg'}" data-veld="${h(f.k)}" tabindex="0" role="button">${w?h(w):'invullen…'}</span></span></div>`;
    }).join('')}</div></div></div>`;
}

function bindVelden(mount, c){
  mount.querySelectorAll('.kd-w').forEach(span => {
    span.onclick = () => bewerkVeld(span, c);
    span.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); bewerkVeld(span, c); } };
  });
}

function bewerkVeld(span, c){
  if(span.dataset.bezig) return;
  span.dataset.bezig = '1';
  const veld = ALLE_VELDEN.find(f => f.k === span.dataset.veld);
  const ruw  = lees(c, veld.k);
  const start = veld.lijst ? (Array.isArray(ruw) ? ruw.join(', ') : (ruw||'')) : (ruw == null ? '' : String(ruw));
  /* opts mag een lijst zijn óf een functie (dynamisch, bv. de gestopte
     kandidaten voor "Vervangt"), en een optie mag {v,l} zijn als de
     opgeslagen waarde iets anders is dan wat je leest (id ↔ naam). */
  const opts = typeof veld.opts === 'function' ? veld.opts(c) : (veld.opts || []);
  const el = veld.t === 'select'
    ? Object.assign(document.createElement('select'), {innerHTML:
        opts.map(o => { const v = (o && typeof o === 'object') ? o.v : o;
                        const l = (o && typeof o === 'object') ? o.l : (o || '—');
          return `<option value="${h(v)}"${String(start)===String(v)?' selected':''}>${h(l)}</option>`; }).join('')})
    : Object.assign(document.createElement('input'), {type:veld.t, value:start});
  el.className = 'kd-inp';
  span.replaceWith(el);
  el.focus();
  if(el.select) el.select();

  let klaar = false;
  const sluit = async (bewaren) => {
    if(klaar) return; klaar = true;
    let nieuw = el.value;
    if(bewaren){
      if(veld.lijst) nieuw = String(nieuw).split(',').map(s=>s.trim()).filter(Boolean);
      else if(veld.t === 'number') nieuw = nieuw === '' ? null : Number(nieuw);
      else nieuw = String(nieuw).trim();
      schrijf(c, veld.k, nieuw);
      await bewaarKandidaat(c);
    }
    const w = toonWaarde(veld, lees(c, veld.k));
    const nieuwSpan = document.createElement('span');
    nieuwSpan.className = 'kd-w' + (w ? '' : ' leeg');
    nieuwSpan.dataset.veld = veld.k;
    nieuwSpan.tabIndex = 0;
    nieuwSpan.textContent = w || 'invullen…';
    el.replaceWith(nieuwSpan);
    nieuwSpan.onclick = () => bewerkVeld(nieuwSpan, c);
    nieuwSpan.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); bewerkVeld(nieuwSpan, c); } };
    if(bewaren){
      /* Hetzelfde veld kan in twee blokken staan (bv. functie in
         Kandidaatgegevens én Huidige situatie) — houd ze gelijk. */
      document.querySelectorAll('.kd-w[data-veld="' + CSS.escape(veld.k) + '"]').forEach(s => {
        if(s === nieuwSpan) return;
        s.textContent = w || 'invullen…';
        s.classList.toggle('leeg', !w);
      });
      meterBij(c);
      salarisBij(c);
    }
  };
  el.onblur = () => sluit(true);
  el.onkeydown = e => {
    if(e.key === 'Enter'){ e.preventDefault(); sluit(true); }
    if(e.key === 'Escape'){ e.preventDefault(); sluit(false); }
  };
  if(veld.t === 'select') el.onchange = () => sluit(true);
}

/* Totaal-jaarsalaris live bijwerken na het wijzigen van een looncomponent. */
function salarisBij(c){
  const el = document.querySelector('#kd_totsal');
  if(el) el.innerHTML = totaalRegel(c);
}

/* Volledigheidsmeter én de "Wat mist nog"-regel bijwerken zonder het
   hele scherm te hertekenen. */
function meterBij(c){
  /* Op een geanonimiseerde kaart bestaan die twee blokken niet (zie
     kopHtml). Ze hier alsnog terugzetten zou het gewiste profiel opnieuw
     om gegevens laten vragen. */
  if(geanonimiseerd(c)) return;
  const mist = document.querySelector('#kd_mist');
  if(mist){
    const nieuw = document.createElement('div');
    nieuw.innerHTML = mistHtml(c);
    mist.replaceWith(nieuw.firstElementChild);
    bindMist(document, c);
  }
  const wrap = document.querySelector('.kd-meter');
  if(!wrap) return;
  const v = CRM.volledigheid(c);
  const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : 'green';
  wrap.innerHTML = `<div class="label">Profiel compleet</div>
    <div class="row tight" style="flex-wrap:nowrap;margin:6px 0 8px">
      <div style="flex:1">${CRM.ui.bar(v.pct, kleur)}</div><b class="num">${v.pct}%</b></div>
    ${v.mist.length ? `<div class="meta">Nog invullen: ${v.mist.map(m=>h(m.lbl.toLowerCase())).join(', ')}</div>`
                    : '<div class="meta">Alles ingevuld — netjes.</div>'}`;
}

/* ─── Certificaten met geldigheidsdatum ───────────────────────────
   Een klant wil weten of die VCA of dat heftruckcertificaat nóg geldig is.
   Tot nu toe was cv.certificaten een lijst losse teksten.

   OPSLAG — bewust géén objecten in cv.certificaten. js/cv.js (het
   kandidaatprofiel dat naar de klant gaat) en js/recruitment.js zetten elk
   element rechtstreeks door String(); een object zou daar als
   "[object Object]" op het vel van de klant belanden, en die bestanden zijn
   niet van deze module. Daarom blijft cv.certificaten een lijst strings —
   precies de oude vorm, dus elke bestaande lezer werkt door — en staat de
   datum ernaast in cv.certGeldig: { sleutel: 'JJJJ-MM-DD' }, ook in het
   bestaande cv-jsonb. Bij het LEZEN accepteren we allebei de vormen (string
   én {naam, geldigTot}), zodat het blijft werken als een andere module ooit
   tóch objecten wegschrijft; bij het opslaan normaliseren we terug.
   De sleutel is de naam in kleine letters: twee identieke certificaatnamen
   op één kaart delen dus één datum — die kwamen we nergens tegen. */
const certSleutel = s => String(s == null ? '' : s).trim().toLowerCase();
const isDatum = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s == null ? '' : s));
function certLijst(c){
  const cv = c.cv || {};
  const map = (cv.certGeldig && typeof cv.certGeldig === 'object') ? cv.certGeldig : {};
  return (Array.isArray(cv.certificaten) ? cv.certificaten : []).map(x => {
    const obj = x && typeof x === 'object';
    const naam = String((obj ? (x.naam || x.certificaat || x.titel) : x) || '').trim();
    const eigen = obj ? (x.geldigTot || x.geldig_tot || '') : '';
    return {naam, geldigTot: String(eigen || map[certSleutel(naam)] || '').trim()};
  }).filter(r => r.naam);
}
/* Verlopen = de datum ligt achter ons. "Binnenkort" = binnen twee
   kalendermaanden (niet "62 dagen": een certificaat loopt op een datum af,
   niet na een aantal dagen). Geen datum ⇒ geen status: niet ingevuld is
   niet hetzelfde als ongeldig. */
function certStatus(iso){
  if(!isDatum(iso)) return null;
  if(iso < CRM.todayISO()) return {k:'verlopen', lbl:'verlopen', chip:'red'};
  const grens = new Date(); grens.setMonth(grens.getMonth() + 2);
  if(iso <= grens.toLocaleDateString('sv-SE')) return {k:'bijna', lbl:'verloopt binnenkort', chip:'amber'};
  return {k:'geldig', lbl:'', chip:''};
}
function certRij(r, i){
  const st = certStatus(r.geldigTot);
  const datum = !r.geldigTot ? '<span class="meta">geen geldigheidsdatum</span>'
    : isDatum(r.geldigTot) ? `<span class="num">geldig t/m ${h(CRM.fmtDate(r.geldigTot))}</span>`
    : `<span class="num">${h(r.geldigTot)}</span>`;
  return `<div class="kd-cert${st ? ' ' + st.k : ''}">
    <b>${h(r.naam)}</b>
    ${datum}
    ${st && st.chip ? `<span class="chip ${st.chip}">${h(st.lbl)}</span>` : ''}
    <button type="button" class="btn sub sm" data-cert="${i}">${r.geldigTot ? 'Wijzigen' : 'Datum erbij'}</button>
  </div>`;
}

function certModal(c, index){
  const rijen = certLijst(c);
  const r = index >= 0 ? rijen[index] : {naam:'', geldigTot:''};
  if(!r) return;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${index >= 0 ? 'Certificaat' : 'Certificaat toevoegen'}</div>
      <p class="sub" style="margin:6px 0 0">De geldigheidsdatum is optioneel — laat hem leeg als je hem niet weet.
      Niet ingevuld is niet hetzelfde als verlopen.</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="ct_naam">Certificaat</label>
        <input type="text" id="ct_naam" value="${h(r.naam)}" placeholder="VCA Basis"></div>
      <div class="f-row" style="margin-bottom:0"><label for="ct_tot">Geldig tot</label>
        <input type="date" id="ct_tot" value="${h(isDatum(r.geldigTot) ? r.geldigTot : '')}"></div>
    </div>
    <div class="modal-f">
      ${index >= 0 ? '<button class="btn ghost" id="ct_weg">Verwijderen</button><span class="spacer"></span>' : ''}
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ct_ok">Opslaan</button>
    </div>`, {onOpen(m){
      const naamEl = m.querySelector('#ct_naam'), totEl = m.querySelector('#ct_tot');
      setTimeout(() => (index >= 0 ? totEl : naamEl).focus(), 60);
      m.querySelector('#ct_ok').onclick = async () => {
        const naam = naamEl.value.trim();
        if(!naam) return CRM.toast('Vul een naam in','err');
        CRM.modal.close();
        await certBewaar(c, index, naam, totEl.value);
      };
      const weg = m.querySelector('#ct_weg');
      if(weg) weg.onclick = async () => {
        /* CRM.bevestig hergebruikt hetzelfde modaalvenster, dus die vraag
           overschrijft dit formulier. Zeg je nee, dan zetten we het terug —
           anders sta je na "Annuleren" ineens weer op de kale kaart. */
        const ok = await CRM.bevestig('Certificaat verwijderen?', r.naam + ' verdwijnt van deze kaart.');
        if(!ok) return certModal(c, index);
        await certBewaar(c, index, '', '');
      };
    }});
}

async function certBewaar(c, index, naam, tot){
  const rijen = certLijst(c);
  const geldig = isDatum(tot) ? tot : '';
  if(index >= 0){
    if(!naam) rijen.splice(index, 1); else rijen[index] = {naam, geldigTot:geldig};
  }else rijen.push({naam, geldigTot:geldig});

  const cv = Object.assign({}, c.cv || {});
  cv.certificaten = rijen.map(r => r.naam);          // blijft een lijst strings
  const map = {};
  rijen.forEach(r => { if(r.geldigTot) map[certSleutel(r.naam)] = r.geldigTot; });
  if(Object.keys(map).length) cv.certGeldig = map; else delete cv.certGeldig;
  c.cv = cv;
  await bewaarKandidaat(c);
  await CRM.logActiviteit('kandidaat', c.id, 'systeem', index >= 0 && !naam
    ? 'Certificaat verwijderd'
    : 'Certificaat vastgelegd: ' + naam + (geldig ? ' (geldig t/m ' + CRM.fmtDate(geldig) + ')' : ' — geen geldigheidsdatum'));
  CRM.render();
}

/* ─── CV & ervaring ───────────────────────────────────────────── */
function cvHtml(c){
  const cv = c.cv || {};
  const werk = Array.isArray(cv.werkgevers) ? cv.werkgevers : [];
  const opl  = Array.isArray(cv.opleidingen) ? cv.opleidingen : [];
  const skills = Array.isArray(cv.skills) ? cv.skills : [];
  const certs  = certLijst(c);
  const leeg = !werk.length && !opl.length && !skills.length && !certs.length
            && !cv.ervaringJaren && !cv.url && !cv.bestandPad;
  return `<div class="card">
    <div class="card-h"><div class="h2">CV &amp; ervaring</div>
      ${cv.ervaringJaren?`<span class="chip"><span class="num">${h(cv.ervaringJaren)}</span> jaar ervaring</span>`:''}
      <span class="spacer"></span>
      ${veiligeUrl(cv.url)?`<a class="btn ghost sm" href="${h(veiligeUrl(cv.url))}" target="_blank" rel="noopener">CV openen</a>`:''}
      <!-- Toevoegen zit in de kop en niet bij het lijstje zelf: bij een kaart
           zónder certificaten is er geen lijstje, en dan moet je er alsnog
           eentje kwijt kunnen. -->
      <button class="btn ghost sm" id="c_certnieuw">Certificaat toevoegen</button>
      <!-- Is er nog niets, dan is dit de enige zinnige vervolgstap op dit
           blok en staat de knop gevuld in plaats van als randje. Zodra er
           wel gegevens staan zakt hij terug naar een gewone hulpknop. -->
      <button class="btn ${leeg?'':'ghost '}sm" id="c_cvlees">CV inlezen</button></div>
    <div class="card-b">${cvBestandHtml(c)}${leeg ? CRM.ui.leeg('Nog geen CV-gegevens',
      'Lees een CV in (PDF, Word of tekst) — werkervaring, opleidingen, certificaten, talen en de pasfoto komen er in één keer in. Je ziet per gegeven wat het CV zegt voordat er iets wordt overgenomen.',
      '<button class="btn" id="c_cvleeg">CV inlezen</button>') : `
      ${cv.bestand?`<div class="meta" style="margin-bottom:10px">Ingelezen: ${h(cv.bestand)}${cv.op?' · '+h(CRM.fmtDate(cv.op)):''}</div>`:''}
      ${werk.length?`<div class="label">Werkervaring</div>
        <div class="kd-cvlijst">${werk.map(w => `<div class="kd-cvrij">
          <b>${h(w.functie||w.rol||'—')}</b>
          <span class="sub">${h(w.werkgever||w.bedrijf||'')}</span>
          <span class="meta num">${h([w.van,w.tot].filter(Boolean).join(' – '))||h(w.periode||'')}</span>
        </div>`).join('')}</div>`:''}
      ${opl.length?`<div class="label" style="margin-top:16px">Opleiding</div>
        <div class="kd-cvlijst">${opl.map(o => `<div class="kd-cvrij">
          <b>${h(o.opleiding||o.naam||'—')}</b>
          <span class="sub">${h(o.school||o.instituut||'')}</span>
          <span class="meta num">${h(o.jaar||o.periode||'')}</span>
        </div>`).join('')}</div>`:''}
      ${certs.length?`<div class="label" style="margin-top:16px">Certificaten</div>
        <div class="kd-certs">${certs.map((r,i) => certRij(r,i)).join('')}</div>`:''}
      ${skills.length?`<div class="label" style="margin-top:16px">Vaardigheden</div>
        <div class="row tight" style="margin-top:8px">${skills.map(s=>`<span class="chip">${h(s)}</span>`).join('')}</div>`:''}
      ${Array.isArray(cv.talen)&&cv.talen.length?`<div class="label" style="margin-top:16px">Talen</div>
        <div class="row tight" style="margin-top:8px">${cv.talen.map(s=>`<span class="chip">${h(s)}</span>`).join('')}</div>`:''}
    `}</div></div>`;
}

/* Het cv-bestand zelf: pad in de afgeschermde map, geopend met een
   tijdelijke link. Zie js/cvparse.js. */
function cvBestandHtml(c){
  return CRM.cvParse ? CRM.cvParse.bestandHtml(c) : '';
}

/* ─── CV inlezen ─────────────────────────────────────────────────
   De parser zelf staat in js/cvparse.js (CRM.cvParse): één module voor
   alle schermen, zodat een cv met twee kolommen overal hetzelfde wordt
   gelezen. De eigen compacte parser die hier stond las een pdf regel
   voor regel op y-positie en weefde bij een zijbalk de twee kolommen
   door elkaar; die is weg. */
function cvLezen(c){
  if(!CRM.cvParse) return CRM.toast('De CV-lezer is niet geladen — herlaad de pagina','err');
  CRM.cvParse.open({kandidaat:c, onKlaar:() => CRM.render()});
}

/* ─── Intake ──────────────────────────────────────────────────── */
function intakeHtml(c){
  const i = c.intake;
  /* Het intakeformulier zelf staat in js/recruitment.js (CRM.kandidaatIntake);
     vroeger kon je er alleen vanaf het bord bij. */
  const knop = `<button class="btn ghost sm" id="c_intake2">${i?'Intake bijwerken':'Intake invullen'}</button>`;
  if(!i) return `<div class="card"><div class="card-h"><div class="h2">Intake</div>
      <span class="spacer"></span>${knop}</div>
    <div class="card-b">${CRM.intakeAI ? CRM.intakeAI.blokHtml(c) : ''}${CRM.ui.leeg('Geen intake vastgelegd','Vul het intakeformulier in tijdens de videocall — of lees een transcript in.')}</div></div>`;
  const cijfer = Number(i.cijfer || i.commitment || 0);
  const rest = Object.keys(i).filter(k => !['cijfer','commitment','drijfveer','drijfveren','risico','risicos','op','door'].includes(k));
  return `<div class="card">
    <div class="card-h"><div class="h2">Intake</div>
      ${cijfer?`<span class="chip${cijfer<7?' amber':' green'}">Commitment <span class="num">${cijfer}</span>/10</span>`:''}
      <span class="spacer"></span>
      <span class="meta num">${h(i.op?CRM.fmtDate(i.op):'')}${i.door?' · '+h(i.door):''}</span>
      ${knop}</div>
    <div class="card-b">
      ${cijfer && cijfer < 7 ? '<div class="note warn" style="margin-bottom:14px">Commitmentcijfer onder de 7 — bespreek de twijfel vóór je voorstelt.</div>' : ''}
      <div class="kd-velden">
        ${(i.drijfveer||i.drijfveren)?`<div class="kd-veld"><span class="label">Drijfveren</span><span>${h(i.drijfveer||i.drijfveren)}</span></div>`:''}
        ${(i.risico||i.risicos)?`<div class="kd-veld"><span class="label">Risico's</span><span>${h(i.risico||i.risicos)}</span></div>`:''}
        ${rest.map(k=>`<div class="kd-veld"><span class="label">${h(k)}</span><span>${h(typeof i[k]==='object'?JSON.stringify(i[k]):i[k])}</span></div>`).join('')}
      </div>
    </div></div>`;
}

/* ─── Uitval ──────────────────────────────────────────────────────
   Sleept iemand een kaart op het bord naar de uitvalstrook, dan wordt hier
   direct zichtbaar wát er is vastgelegd — niet alleen dat de fase veranderde.
   Stond eerder als twee losse regeltjes in het Trajectblok; dat liet de helft
   van het uitvalformulier onzichtbaar (soort, wie, toelichting, herbruikbaar).
   Labels staan hier bewust lokaal: modules delen in dit project geen code. */
const AFVAL_SOORT = {niet_gekwalificeerd:'Niet gekwalificeerd', offer_afgewezen:'Offer afgewezen'};
const STOP_DOOR   = {kandidaat:'Kandidaat zelf', klant:'Klant', anders:'Anders'};

function uitvalHtml(c){
  const afgevallen = c.fase === 'Afgevallen', gestopt = c.fase === 'Gestopt';
  if(!afgevallen && !gestopt) return '';
  const rij = (lbl, waarde) => waarde
    ? `<div class="kd-veld"><span class="label">${h(lbl)}</span><span>${h(waarde)}</span></div>` : '';
  /* recyclebaar is bewust drieledig: true / false / null (nooit beoordeeld). */
  const herbruik = c.recyclebaar == null ? 'nog niet beoordeeld'
                 : c.recyclebaar ? 'ja — mag opnieuw aangeboden worden' : 'nee';
  const leeg = !c.afvalCat && !c.stopCat && !c.reden && !c.afvalType && !c.stopDoor;
  return `<div class="card">
    <div class="card-h"><div class="h2">${afgevallen ? 'Afgevallen' : 'Gestopt'}</div>
      <span class="chip${afgevallen?'':' red'}">${h(CRM.fmtDate(c.gestoptOp || c.since) || '—')}</span>
      <span class="spacer"></span>
      <button class="btn ghost sm" id="c_uitval">${leeg ? 'Reden vastleggen' : 'Bijwerken'}</button></div>
    <div class="card-b">
      ${leeg ? `<div class="note warn" style="margin:0 0 12px">De fase staat op ${h(CRM.faseNorm(c.fase))}, maar er is nog geen reden vastgelegd.
        Zonder reden telt deze kaart nergens mee in de uitvalcijfers.</div>` : ''}
      <div class="kd-velden">
        ${afgevallen
          ? rij('Soort', AFVAL_SOORT[c.afvalType] || c.afvalType) + rij('Reden', c.afvalCat)
          : rij('Gestopt door', STOP_DOOR[c.stopDoor] || c.stopDoor) + rij('Reden', c.stopCat)}
        ${gestopt ? rij('Gestopt op', CRM.fmtDate(c.gestoptOp)) + rij('Was geplaatst op', CRM.fmtDate(c.geplaatstOp)) : ''}
        ${rij('Herbruikbaar', herbruik)}
        ${c.reden ? `<div class="kd-veld"><span class="label">Toelichting</span><span>${h(c.reden)}</span></div>` : ''}
      </div>
      ${gestopt && !c.geplaatstOp ? `<div class="note warn" style="margin-top:12px">Geen plaatsingsdatum ingevuld.
        Deze stop telt daardoor niet mee bij "gestopt deze maand".</div>` : ''}
    </div></div>`;
}

/* ─── Klaar voor facturatie ───────────────────────────────────────
   Wat er nog ontbreekt voordat de fee uitgerekend kan worden. Het lijstje
   is voor IEDEREEN: de AM moet weten wat er ingevuld moet worden, en dat zijn
   veldnamen, geen bedragen. De uitkomst van de berekening is dat wél, dus
   die staat achter CRM.magOpbrengstZien() — het hele team, sinds 31 jul
   2026. Zie js/fee.js. */
function factuurklaarHtml(c){
  if(!CRM.fee || !c.klant) return '';           // zonder klant valt er niets te factureren
  let mist = [], b = null;
  try{
    const afspraak = CRM.fee.voorKlant(c.klant, c.geplaatstOp || null);
    mist = CRM.fee.watMist(c, afspraak) || [];
    if(CRM.magOpbrengstZien()) b = CRM.fee.bereken(c, afspraak);
  }catch(e){ console.warn('feeberekening', e); return ''; }

  const klaar = !mist.length;
  return `<div class="card">
    <div class="card-h"><div class="h2">Klaar voor facturatie</div>
      <span class="spacer"></span>
      <span class="chip${klaar?' green':' amber'}">${klaar ? 'compleet' : mist.length + ' nog invullen'}</span></div>
    <div class="card-b">
      ${klaar
        ? '<p class="sub" style="margin:0 0 10px">Alle gegevens staan erin. Zodra het contract getekend is, kan er gefactureerd worden.</p>'
        : `<p class="sub" style="margin:0 0 10px">Dit moet er nog in voordat de fee berekend kan worden:</p>
           <ul class="kd-mistlijst">${mist.map(m => {
             const veld = String(m.veld||''), waar = String(m.waar||'');
             /* Alleen een knop als het veld ook echt op deze kaart staat —
                anders stuur je iemand naar niets. Staat het elders, dan is
                de vindplaats de nuttige informatie. */
             const hier = ALLE_VELDEN.some(v => v.k === veld);
             return `<li>${hier
               ? `<button type="button" data-mistveld="${h(veld)}">${h(String(m.label||veld))}</button>`
               : `<span>${h(String(m.label||veld))}</span>`}${
               waar ? `<span class="meta">${h(waar)}</span>` : ''}</li>`;
           }).join('')}</ul>`}
      ${b && b.fee != null ? `
        <div class="kd-velden" style="margin-top:14px">
          <div class="kd-veld"><span class="label">Grondslag</span><span class="num">${h(CRM.euro(b.grondslag?.jaarSalaris))}</span></div>
          <div class="kd-veld"><span class="label">Percentage</span><span class="num">${h(String(b.pct ?? '—'))}%${
            b.functiegroep ? ' <span class="meta">' + h(String(b.functiegroep)) + '</span>' : ''}</span></div>
          <div class="kd-veld"><span class="label">Fee</span><span class="num"><b>${h(CRM.euro(b.fee))}</b></span></div>
          ${b.factuurdatum?`<div class="kd-veld"><span class="label">Factureren</span><span>${h(CRM.fmtDate(b.factuurdatum))}${
            b.vervaldatum?' · vervalt '+h(CRM.fmtDate(b.vervaldatum)):''}</span></div>`:''}
          ${b.garantieTot?`<div class="kd-veld"><span class="label">Garantie tot</span><span>${h(CRM.fmtDate(b.garantieTot))}</span></div>`:''}
        </div>
        ${(b.waarschuwingen||[]).length ? `<div class="note warn" style="margin-top:12px">${
          b.waarschuwingen.map(w=>h(String(w))).join('<br>')}</div>` : ''}` : ''}
    </div></div>`;
}

/* ─── Kansen: past bij deze vacatures ─────────────────────────── */
function kansenHtml(c){
  const lijst = kansen(c);
  return `<div class="card">
    <div class="card-h"><div class="h2">Kansen — past bij deze vacatures</div></div>
    <div class="card-b">${lijst.length ? lijst.map(m => {
      const v = m.vacature;
      const zelfde = String(c.vacatureId||'') === String(v.id);
      const kleur = m.score >= 70 ? 'green' : m.score >= 50 ? '' : 'amber';
      return `<div class="kd-kans">
        <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
          <div style="min-width:0;flex:1">
            <b>${h(v.functie)}</b>
            <div class="meta"><a href="#klanten/${encodeURIComponent(v.klant)}" data-klant="${h(v.klant)}">${h(v.klant)}</a>
              · ${h(v.locatie||'—')}${m.km?` · <span class="num">${m.km}</span> km`:''}</div>
          </div>
          <div class="kd-score">
            ${CRM.ui.bar(m.score, kleur)}
            <span class="meta num">${m.score}% match</span>
            ${m.dichtbij?'<span class="meta">op reisafstand</span>':''}
          </div>
        </div>
        <p class="sub kd-uitleg">${h(uitleg(c, v))}</p>
        ${zelfde ? '<span class="chip green">Al gekoppeld aan deze vacature</span>'
          : `<button class="btn ghost sm" data-voorstel="${h(String(v.id))}">→ Voorstellen bij deze vacature</button>`}
      </div>`;
    }).join('') : CRM.ui.leeg('Nog geen passende vacature',
        'Vul de gezochte functie en woonplaats in — dan zoekt het systeem zelf de vacatures erbij.')}</div></div>`;
}

async function voorstellen(c, v){
  const ok = await CRM.bevestig('Voorstellen bij deze vacature?',
    c.naam + ' → ' + v.functie + ' bij ' + v.klant + '. De fase gaat naar Voorgesteld.');
  if(!ok) return;
  const nieuw = Object.assign({}, c, {
    klant:v.klant, functie:v.functie || c.functie, vacatureId:v.id, fase:'Voorgesteld',
    historie:(c.historie||[]).concat([{fase:'Voorgesteld', op:CRM.todayISO()}])
  });
  await bewaarKandidaat(nieuw);
  await CRM.logActiviteit('kandidaat', c.id, 'fase', 'Voorgesteld bij ' + v.klant + ' — ' + v.functie);
  await CRM.logActiviteit('klant', v.klant, 'systeem', c.naam + ' voorgesteld voor ' + v.functie);
  CRM.render();
}

/* ─── Traject in het kort ─────────────────────────────────────── */
/* De Teams-link van de laatst ingeplande call. Hij is opgeslagen als
   notitie (en oudere afspraken staan als activiteit) — we vissen hem
   daaruit op zodat hij klikbaar bij de afspraak staat. */
/* Een notitie is gebruikersinvoer: stop bij een aanhalingsteken of punthaak,
   zodat er nooit iets anders dan een schone Teams-url in de href belandt. */
const TEAMS_RE = /https:\/\/teams\.microsoft\.com\/[^\s"'<>]+/i;
function teamsLink(c){
  const rijen = (c.notities||[]).concat(CRM.activiteitenVoor('kandidaat', c.id))
    .filter(x => x && TEAMS_RE.test(String(x.tekst||'')))
    .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));
  const m = rijen.length ? String(rijen[0].tekst).match(TEAMS_RE) : null;
  return m ? m[0] : '';
}

/* Eén regel in een velden-blok: label + inline bewerkbare waarde. */
function veldRij(c, f){
  const w = toonWaarde(f, lees(c, f.k));
  return `<div class="kd-veld"><span class="label">${h(f.lbl)}</span>
    <span><span class="kd-w${w?'':' leeg'}" data-veld="${h(f.k)}" tabindex="0" role="button">${w?h(w):'invullen…'}</span>${
      f.hint?` <span class="meta">${h(f.hint)}</span>`:''}</span></div>`;
}

/* Toont de kandidaat een lopend traject? Bij fase '' (import uit het oude
   ATS, of een golden candidate) heeft contract- en salarisinvoer geen zin
   en houden we de kaart rustig. */
const inTraject = c => !!c.fase;

function trajectHtml(c){
  const idx = CRM.faseIdx(c.fase);
  const teams = teamsLink(c);
  const stappen = CRM.PHASES.slice(0,11);
  const uitval = ['Afgevallen','Gestopt'].includes(c.fase);
  const kanIntake = CRM.faseIn(c.fase, ['Intake','Voorgesteld']);
  return `<div class="card">
    <div class="card-h"><div class="h2">Traject</div>
      ${c.klant?`<span class="spacer"></span><a class="btn ghost sm" href="#klanten/${encodeURIComponent(c.klant)}" data-klant="${h(c.klant)}">Naar klantkaart</a>`:''}</div>
    <div class="card-b">
      <div class="kd-velden">
        <div class="kd-veld"><span class="label">Huidige fase</span><span>${h(CRM.faseNorm(c.fase)||'—')} <span class="meta num">sinds ${h(CRM.fmtDate(c.since)||'—')}</span></span></div>
        ${TRAJECT_VELDEN.map(f => veldRij(c, f)).join('')}
        ${teams?`<div class="kd-veld"><span class="label">Videocall</span><span>
          <a class="btn sub sm kd-teamsl" href="${h(teams)}" target="_blank" rel="noopener">Teams-link</a></span></div>`:''}
      </div>
      <div class="kd-stappen">${stappen.map((p,i) =>
        `<i class="${i<=idx&&idx>=0?'on':''}" style="${i<=idx&&idx>=0?'background:'+p.c:''}" title="${h(p.k)}"></i>`).join('')}</div>
      <div class="meta">${idx>=0&&idx<11?`Stap <span class="num">${idx+1}</span> van <span class="num">11</span>`:h(CRM.faseNorm(c.fase)||'Nog niet bij een klant voorgesteld')}</div>
    </div>
    <!-- Verhuisd uit de bewerk-drawer van het bord: fasewissel mét
         poortwachters, video-intake, no-show en afmelden. -->
    <div class="card-f row tight" style="flex-wrap:wrap;row-gap:8px">
      <button class="btn ghost sm" id="c_fase">Fase wijzigen…</button>
      ${kanIntake?`<button class="btn ghost sm" id="c_intake">Video-intake</button>`:''}
      ${inTraject(c)&&!uitval?`<button class="btn ghost sm" id="c_noshow" title="Afspraak wissen en de no-show tellen">No-show</button>`:''}
      ${inTraject(c)?`<button class="btn ghost sm" id="c_uitval">${uitval?'Uitvalgegevens bijwerken':'Afmelden'}</button>`:''}
      <span class="spacer"></span>
      <button class="btn sub sm" id="c_snel" title="Alle trajectvelden in één paneel, met één keer opslaan">Snel bewerken</button>
    </div></div>`;
}

/* ─── Nazorg, warm houden, verjaardag en de felicitatiemail ───────
   Stond hier, met een eigen ritme dag 3 · 14 · 30 en een eigen
   plusDagen(). Verhuisd naar js/opvolging.js, omdat het dashboard, het
   bord en Performance elk hun eigen versie van datzelfde ritme
   berekenden — en al verschillende antwoorden gaven. De kaart tekent nu
   CRM.opvolging.kaartHtml(c) en hangt er CRM.opvolging.bindKaart() aan;
   het vastleggen loopt daar via CRM.logActiviteit, precies zoals hier.
   Bestaande check-ins blijven staan: opvolging.js leest de oude
   markering `extra.nazorg` van 3/14/30 nog steeds. */

/* ─── Contract, plaatsing en salaris (uit de bewerk-drawer) ─────
   Salaris van de kandidaat is een arbeidsvoorwaarde en mag het team
   zien (zelfde afweging als bij Kandidaatgegevens). De fee is dat
   níet — daarom staat die verwijzing achter canSeeMoney(). */
function contractHtml(c){
  if(!inTraject(c)) return '';
  const toonDatums = CRM.PLACED.includes(c.fase) || ['Afgevallen','Gestopt'].includes(c.fase)
    || !!c.geplaatstOp || !!c.gestoptOp;
  const velden = CONTRACT_VELDEN.filter(f => !f.alleenBijPlaatsing || toonDatums);
  return `<div class="card">
    <div class="card-h"><div class="h2">Contract &amp; salaris</div>
      <span class="meta">klik een waarde om te wijzigen</span></div>
    <div class="card-b">
      <div class="kd-velden">${velden.map(f => veldRij(c, f)).join('')}</div>
      <div class="label" style="margin:16px 0 4px">Salaris</div>
      <div class="kd-velden">${SALARIS_VELDEN.map(f => veldRij(c, f)).join('')}</div>
      <div class="kd-totsal" id="kd_totsal">${totaalRegel(c)}</div>
    </div></div>`;
}
function totaalRegel(c){
  const bereken = D().totaalJaarSalaris;
  if(!bereken || !c.maandloon) return '<span class="meta">Vul het bruto maandloon in voor het totaal-jaarsalaris.</span>';
  const tot = bereken(c.maandloon, c.toeslagPct||0, c.vtPct==null?'':c.vtPct, c.ejuPct||0, c.overigPct||0);
  return `Totaal jaarsalaris ≈ <b class="num">${CRM.euro(Math.round(tot))}</b>
    <span class="meta">incl. toeslagen${CRM.canSeeMoney() ? ' — basis voor de fee in de finance-app' : ''}</span>`;
}

/* ─── Tabs onderaan ───────────────────────────────────────────── */
function tabsHtml(c){
  const acts  = CRM.activiteitenVoor('kandidaat', c.id);
  const taken = (CRM.state.taken||[]).filter(t => t.entiteit === 'kandidaat' && String(t.ref) === String(c.id));
  return [
    ['activiteiten','Activiteiten', acts.length],
    ['taken','Taken', taken.filter(t=>!t.klaar).length],
    ['notities','Notities', (c.notities||[]).length],
    ['historie','Historie', (c.historie||[]).length]
  ].map(([k,lbl,n]) => `<button class="tab${tabActief===k?' on':''}" data-t="${k}">${h(lbl)}${n?`<span class="cnt num">${n}</span>`:''}</button>`).join('');
}

function tabInhoud(mount, c){
  const el = mount.querySelector('#c_tabinhoud');
  const fn = {
    activiteiten: () => tabActiviteiten(el, c),
    taken:        () => tabTaken(el, c),
    notities:     () => tabNotities(el, c),
    historie:     () => tabHistorie(el, c)
  }[tabActief];
  if(fn) fn(); else el.innerHTML = '';
}

function tabActiviteiten(el, c){
  const items = CRM.activiteitenVoor('kandidaat', c.id)
    .slice().sort((a,b) => new Date(b.op) - new Date(a.op))
    .map(a => ({
      titel:((CRM.ACT_SOORTEN[a.soort]||{}).lbl || a.soort) + (a.door ? ' · ' + a.door : ''),
      wanneer:CRM.fmtDate(a.op) + ' · ' + CRM.geleden(a.op),
      tekst:a.tekst
    }));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Activiteiten</div><span class="spacer"></span>
      <div class="row tight">${['bel','whatsapp','mail','gesprek'].map(s =>
        `<button class="btn ghost sm" data-log="${s}">${h((CRM.ACT_SOORTEN[s]||{}).lbl||s)}</button>`).join('')}</div></div>
    <div class="card-b">${CRM.ui.tijdlijn(items)}</div></div>`;
  el.querySelectorAll('[data-log]').forEach(b => b.onclick = () => logVia(c, b.dataset.log, 'Wat leg je vast?'));
}

/* opts is optioneel: een eigen venstertitel, een vaste aanhef vóór de tekst
   en extra's die met de activiteit meegaan (bv. de nazorg-check-in). Zonder
   opts gedraagt dit zich precies zoals eerst. */
async function logVia(c, soort, hint, opts){
  const o = opts || {};
  const tekst = await CRM.vraag(o.titel || (CRM.ACT_SOORTEN[soort]||{}).lbl || 'Activiteit',
    {multiline:true, hint, knop:'Vastleggen'});
  if(!tekst) return;
  await CRM.logActiviteit('kandidaat', c.id, soort, (o.prefix || '') + tekst, o.extra || {});
  CRM.verwerkTags(tekst, 'kandidaat', c.id);       // @collega → melding
  CRM.toast('Vastgelegd','ok');
  CRM.render();
}

function tabTaken(el, c){
  const taken = (CRM.state.taken||[]).filter(t => t.entiteit === 'kandidaat' && String(t.ref) === String(c.id))
    .sort((a,b) => (a.klaar?1:0)-(b.klaar?1:0) || String(a.datum||'').localeCompare(String(b.datum||'')));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Taken</div><span class="spacer"></span>
      <button class="btn sm" id="kt_nieuw">Taak toevoegen</button></div>
    <div class="card-b">${taken.length ? `<div class="kd-taken">${taken.map(t => `
      <label class="kd-taak${t.klaar?' klaar':''}">
        <input type="checkbox" data-taak="${h(t.id)}"${t.klaar?' checked':''}>
        <div style="flex:1;min-width:0"><b>${h(t.tekst)}</b>
          <div class="meta"><span class="num">${h(CRM.fmtDate(t.datum))}</span>${t.voor?' · '+h(t.voor):''}</div></div>
        ${t.prioriteit==='Hoog'?'<span class="chip amber">Hoog</span>':''}
      </label>`).join('')}</div>` : CRM.ui.leeg('Geen taken','Zet je volgende stap voor deze kandidaat vast.')}</div></div>`;
  el.querySelector('#kt_nieuw').onclick = () => nieuweTaak(c);
  el.querySelectorAll('[data-taak]').forEach(cb => cb.onchange = async () => {
    const t = CRM.state.taken.find(x => String(x.id) === cb.dataset.taak);
    await bewaarRij('crm_taken','taken', Object.assign({}, t, {klaar:cb.checked}), true);
    CRM.render();
  });
}

/* Taak via het gedeelde taakvenster van core — toewijzen, prioriteit en
   Outlook werken daar overal hetzelfde. */
async function nieuweTaak(c){
  const rij = await CRM.taakModal({entiteit:'kandidaat', ref:c.id, refLabel:c.naam});
  if(rij){ tabActief = 'taken'; CRM.render(); }
}

/* ═══════════════════════════════════════════════════════════════
   VIDEOCALL INPLANNEN
   De eerste echte stap na binnenkomst: vanuit jouw gekoppelde agenda
   een Teams-call bij de kandidaat. Teams staat daarom standaard aan;
   uitvinken maakt er een gewone afspraak van. Zonder koppeling valt
   het terug op de Outlook-deeplink — precies zoals eerder.
   ═══════════════════════════════════════════════════════════════ */
function videocallModal(c){
  if(!(CRM.outlook && CRM.outlook.maakAfspraak)) return CRM.toast('Agenda-koppeling niet geladen','err');
  const naam = String(c.naam||'').trim();
  const titel = String(c.functie||'').trim()
    ? `Videocall — ${naam || 'kandidaat'} · ${String(c.functie).trim()}`
    : `Videocall intake — ${naam || 'kandidaat'}`;
  const gekoppeld = agendaGekoppeld();
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Videocall inplannen</div>
      <p class="sub" style="margin:6px 0 0">${h(naam || 'Deze kandidaat')} — de call komt in jouw agenda en de
        kandidaat krijgt de uitnodiging met de Teams-link.</p></div>
    <div class="modal-b">
      <div class="f-row"><label>Onderwerp</label><input type="text" id="vc_titel" value="${h(titel)}"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label>
          <input type="date" id="vc_datum" value="${h(String(c.datum||'').slice(0,10)||CRM.todayISO())}"></div>
        <div class="f-row"><label>Tijd</label>
          <input type="time" id="vc_tijd" value="${h(c.tijd||'10:00')}"></div>
        <div class="f-row"><label>Duur</label><select id="vc_duur">
          <option value="20">20 minuten</option>
          <option value="30" selected>30 minuten</option>
          <option value="45">45 minuten</option></select></div>
      </div>
      <label class="check kd-vcteams"><input type="checkbox" id="vc_teams" checked> Teams-videocall aanmaken</label>
      <div class="f-row" style="margin-top:12px"><label>Kandidaat ontvangt de uitnodiging op</label>
        <input type="email" id="vc_email" placeholder="naam@voorbeeld.nl" value="${h(c.email||'')}"></div>
      ${c.email ? '' : `<div class="note warn kd-vcgeenmail">
        <span>Geen e-mailadres — vul het eerst in op de kaart, dan krijgt de kandidaat de uitnodiging.
          Zonder adres kun je gewoon inplannen: de afspraak staat dan alleen in je eigen agenda.</span>
        <button type="button" class="btn ghost sm" id="vc_naarmail">Naar het e-mailveld</button></div>`}
      <div class="f-row" style="margin-top:12px"><label>Notitie voor in de uitnodiging</label>
        <textarea id="vc_body" placeholder="Bijvoorbeeld: korte kennismaking — we bespreken je ervaring, wensen en beschikbaarheid."></textarea></div>
      ${gekoppeld ? '' : `<p class="meta kd-vchint">Je agenda is nog niet gekoppeld. Outlook opent straks met alles
        vooringevuld — zet daar zelf de Teams-vergadering aan en klik op Opslaan. Koppel je Microsoft-account in
        Instellingen, dan zet het CRM de videocall er direct in.</p>`}
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="vc_ok">Videocall inplannen</button></div>`, {onOpen(m){
    const naarMail = m.querySelector('#vc_naarmail');
    if(naarMail) naarMail.onclick = () => { CRM.modal.close(); springNaarVeld('email', c); };

    m.querySelector('#vc_ok').onclick = async () => {
      const teams = m.querySelector('#vc_teams').checked;
      const email = m.querySelector('#vc_email').value.trim();
      const d = {
        titel:   m.querySelector('#vc_titel').value.trim(),
        datum:   m.querySelector('#vc_datum').value,
        tijd:    m.querySelector('#vc_tijd').value || '10:00',
        duurMin: Number(m.querySelector('#vc_duur').value) || 30,
        teams,
        locatie: teams ? 'Microsoft Teams' : '',
        body:    m.querySelector('#vc_body').value.trim(),
        deelnemers: [email].filter(Boolean)
      };
      if(!d.titel) return CRM.toast('Vul een onderwerp in','err');
      if(!d.datum) return CRM.toast('Kies een datum','err');
      CRM.modal.close();
      try{
        const r = (await CRM.outlook.maakAfspraak(d)) || {};
        /* (a) datum/tijd op de kaart, zodat bord, pijplijn en dashboard
           de afspraak tonen. (c) een Teams-link bewaren we als notitie —
           die staat bij de kandidaat en niet alleen in een toast. */
        const bij = Object.assign({}, c, {datum:d.datum, tijd:d.tijd});
        if(r.online) bij.notities = [{op:new Date().toISOString(), door:CRM.me(),
          tekst:'Teams-link: ' + r.online}].concat(c.notities||[]);
        await bewaarKandidaat(bij);
        await CRM.logActiviteit('kandidaat', c.id, 'gesprek',
          `Videocall ingepland: ${d.titel} op ${CRM.fmtDate(d.datum)} ${d.tijd}`);
        CRM.toast(r.via === 'graph'
          ? (r.online ? 'Videocall staat in je agenda — Teams-link toegevoegd'
                      : (d.deelnemers.length ? 'Afspraak staat in je agenda — uitnodiging verstuurd'
                                             : 'Afspraak staat in je agenda'))
          : 'Outlook geopend — controleer en klik daar op Opslaan', 'ok');
        CRM.render();
      }catch(e){ CRM.fout('Inplannen mislukt', e); }
    };
  }});
}

function tabNotities(el, c){
  const notities = (c.notities||[]).slice().sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Notities</div><span class="spacer"></span>
      <button class="btn sm" id="kn_nieuw">Notitie toevoegen</button></div>
    <div class="card-b">${CRM.ui.tijdlijn(notities.map(n => ({
      titel:n.door||'—', wanneer:CRM.fmtDate(n.op)+' · '+CRM.geleden(n.op), tekst:n.tekst
    })))}</div></div>`;
  el.querySelector('#kn_nieuw').onclick = () => notitieToevoegen(c);
}

async function notitieToevoegen(c){
  const tekst = await CRM.vraag('Notitie', {multiline:true,
    hint:'Wat wil je onthouden over deze kandidaat? Tip: @collega stuurt diegene een melding.', knop:'Opslaan'});
  if(!tekst) return;
  const nieuw = Object.assign({}, c, {
    notities:[{op:new Date().toISOString(), door:CRM.me(), tekst}].concat(c.notities||[])
  });
  await bewaarKandidaat(nieuw);
  CRM.verwerkTags(tekst, 'kandidaat', c.id);       // @collega → melding
  tabActief = 'notities'; CRM.render();
}

function tabHistorie(el, c){
  const hist = (c.historie||[]).slice().sort((a,b) => String(a.op||'').localeCompare(String(b.op||'')));
  const items = hist.map((x,i) => {
    const volgend = hist[i+1] ? hist[i+1].op : null;
    const dagen = volgend ? Math.round((new Date(volgend) - new Date(x.op)) / 86400000) : CRM.dagenGeleden(x.op);
    return {
      titel:x.fase,
      wanneer:CRM.fmtDate(x.op) + (dagen != null && dagen >= 0 ? ' · ' + dagen + ' dagen in deze fase' : ''),
      tekst:''
    };
  }).reverse();
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Historie</div>
      <span class="meta">doorlooptijd per fase</span></div>
    <div class="card-b">${items.length ? CRM.ui.tijdlijn(items)
      : CRM.ui.leeg('Nog geen fasewissels','Zodra deze kandidaat doorstroomt bouwt de historie zich vanzelf op.')}</div></div>`;
}

/* ─── Demo: golden candidates zichtbaar maken ─────────────────────
   demo.js is niet van deze module en blijft onaangeraakt; we zetten
   de vlag hier op een paar demo-kandidaten zodra de demodata er is,
   zodat het filter en de ster in demo-modus te controleren zijn. */
if(CRM.demo){
  const markeer = () => ['demo3','demo41','demo47'].forEach(id => {
    const r = (CRM.state.cands||[]).find(x => String(x.id) === id);
    if(r) r.golden = true;
  });
  if(CRM.state._demo) markeer();
  else window.addEventListener('crm-demo-ready', markeer);
}

/* ─── Registratie ─────────────────────────────────────────────── */
CRM.registerModule('kandidaten', {
  title:'Kandidaten', icon:'☰', onderschrift:'Kandidatenkaarten en filters',
  render(mount, acties, params){
    if(!Array.isArray(CRM.state.taken)) CRM.state.taken = [];
    /* Doorklik vanuit een ander scherm mag het statusfilter zetten. Klanttrajecten
       stuurt 'klaar' ("klaar om voor te stellen"), hier heet diezelfde verzameling
       'gekwalificeerd' — twee woorden voor hetzelfde, dus vertalen in plaats van
       de gebruiker op het overzicht laten landen zonder filter. */
    if(params && params.status){
      const sleutel = params.status === 'klaar' ? 'gekwalificeerd' : String(params.status);
      if(STATUS_OPTS.some(o => o.k === sleutel)) zet('status', sleutel);
    }
    if(params && params.id) kaart(mount, acties, String(params.id));
    else overzicht(mount, acties);
  }
});
})();

/* VERZOEK AAN CORE: de hashchange-listener in core.js rendert alleen als de
   módule wisselt (hash[0] !== CRM.view). Een link naar #kandidaten/<id> doet
   daardoor niets als je al op Kandidaten staat; modules moeten nu overal eigen
   click-handlers zetten die CRM.ga(...) aanroepen. Fijner: in core ook op een
   gewijzigd id binnen dezelfde module opnieuw renderen. */

/* VERZOEK AAN COORDINATOR:

   1. js/opvolging.js — exporteer de lijst `CONTACT` als
      `CRM.opvolging.CONTACT` (regel 91, ['bel','gesprek','whatsapp','mail',
      'bezoek']). Dit scherm filtert en sorteert nu op "hoe lang niet
      gesproken" en moet daarvoor exact dezelfde definitie van contact
      gebruiken, anders zegt het dashboard iets anders dan deze lijst.
      Zolang die export er niet is staat er hier een kopie van vijf woorden
      (CONTACT_SOORTEN bovenin dit bestand); die pakt de export vanzelf op
      zodra hij bestaat en kan er dan uit. Nu zijn het twee plekken die
      gelijk moeten blijven, en dat gaat een keer mis.

   2. js/recruitment.js — de videocall is de enige stap die niet op de
      kandidaat wordt vastgelegd. `CRM.klaarOmVoorTeStellen` leunt daarom op
      de intake als bewijs dat er een videocall is geweest, en het paneel
      bovenaan dit scherm legt dat met zoveel woorden uit. Beter zou zijn:
      bij het doorschieten van een lead met status 'Videocall gehad' een
      datum meenemen naar de kandidaat (bv. `intake.videocallOp`). Dan is
      het geteld in plaats van beredeneerd, en kan die uitleg weg.

   3. js/pijplijn.js en js/dashboard.js — de gekwalificeerde voorraad
      (`CRM.klaarOmVoorTeStellen`, hier zichtbaar als één getal met een
      uitsplitsing per gezochte functie) is nu alleen op dit scherm te zien.
      Dat is precies het getal waar Tjeerd op stuurt; het hoort ook op het
      dashboard. De telling zit in dit bestand in `voorraad()` — als jullie
      hem elders willen, is het beter die functie naar js/data.js te tillen
      dan hem over te schrijven. Zeg het, dan lever ik hem aan.

   4. js/kandverwijder.js — `isGeanonimiseerd` herkent een gewiste kaart aan
      de naam die met 'Gegevens gewist' begint. Dit scherm gebruikt dat om
      zo iemand uit de voorraad, uit het niet-gesproken-filter en uit de
      bellijst-sortering te houden. Werkt prima, maar het is een
      tekstvergelijking op een naam die een gebruiker kan overtypen. Een
      echte vlag op de rij (bv. `candidates.geanonimiseerd_op`) zou dat
      dichttimmeren. */

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN COORDINATOR — CV inlezen (31 jul 2026)

   1. css/base.css — DIT IS DE OORZAAK van "ik kan niet op de parser
      klikken op de grote kandidatenkaart", en het raakt elk scherm.

      `.modal` staat `position:fixed` in het midden van het beeld en
      wordt bij sluiten alleen op `opacity:0` gezet. `.scrim` krijgt in
      diezelfde situatie wél `pointer-events:none` (regel 356-358),
      `.modal` niet. Na élk gesloten venster blijft er dus een
      onzichtbaar blok van maximaal 520px breed en 90vh hoog midden op
      het scherm liggen dat alle klikken opvangt. Gemeten op 1180×760:
      vóór het openen van een venster is de knop CV inlezen klikbaar,
      ná één keer openen en sluiten is `document.elementFromPoint()` op
      diezelfde knop `div.modal-b`. Bij de bredere `.cvp-modal` is het
      dode vlak nog groter.

      Twee regels bij `.modal` en `.modal.on` (regel 376-382):
        .modal{ ... pointer-events:none}
        .modal.on{ ... pointer-events:auto}

      Tot die tijd staat de eerste van die twee onderaan
      css/kandidaten.css, met dezelfde uitleg. Zet je hem in base.css,
      haal hem hier dan weg — hij hoort niet in een modulestylesheet.

   2. index.html — het versiemerk `?v=20260731a` staat nog op de oude
      waarde. Zonder ophogen krijgt Tjeerd de gewijzigde js/css niet te
      zien; tijdens het testen serveerde de browser hardnekkig de oude
      css/kandidaten.css terwijl de server de nieuwe al had.

   3. js/feest.js — de feestkaart komt in demo-modus over het midden van
      het scherm te staan en `.feest-kaart` heeft `pointer-events:auto`.
      Zolang die kaart in beeld is, is de knop CV inlezen er niet meer
      doorheen te klikken. Minder erg dan punt 1 (hij gaat vanzelf naar
      de ruststand rechtsboven), maar het is dezelfde klacht.

   4. supabase/schema.sql — niets verplicht. Wel handig: de nieuwe route
      "+ Sollicitant → CV inlezen" in js/recruitment.js maakt een
      kandidaat zonder vacature. Wil je later kunnen zien welke
      kandidaten zo binnenkomen, dan is een waarde 'CV' in de bronlijst
      (CRM.LEAD_BRONNEN in js/data.js) preciezer dan 'Handmatig', dat we
      nu gebruiken omdat het een bestaande waarde is. */
