/* ═══════════════════════════════════════════════════════════════
   SOURCING — DEKKING OP DE KAART
   ═══════════════════════════════════════════════════════════════
   Dit bestand doet twee dingen:

   1. CRM.kaartRender(container, {lens:'klanten'}) — de kaart-engine die
      js/klanten.js gebruikt: alle klanten als pinnen, kleur per branche,
      grootte naar plaatsingen (of omzet, alleen voor Tjeerd).

   2. De module 'source' — het Sourcing-scherm zelf, met vier modi.

   ZOEKEN is er daar één van, en sinds 1 aug 2026 de belangrijkste: hier
   doorzoek je de hele kaartenbak op alles wat je van iemand weet, en pak je
   vanaf de gevonden regel door naar een match met een openstaande vacature.
   De Kandidaten-tab kan alleen nog op naam, status en sortering; wie meer
   wil, komt hierheen. Sourcing gaat over kandidaten, dus daar hoort het
   zoeken ook thuis.

   DE ANDERE DRIE draaien de vraag om en kijken over de hele portefeuille —
   dat is precies wat een lijst niet kan:

     Vraag    → welke openstaande vacature heeft niemand in de buurt wonen?
     Aanbod   → waar wonen groepen beschikbare mensen zonder klant in de
                buurt? (dat is een verkoopkans en die vraag stelde niemand)
     Golden   → welke bewaarde kandidaat heeft inmiddels wél een vacature
                om de hoek?

   Alle drie zijn aggregaties over álle vacatures × álle kandidaten. Daar
   filter je niet naartoe; dat moet het scherm voor je uitrekenen.

   EERLIJKHEID
   Afstanden komen uit een plaatsentabel (CRM.PLAATSEN): hemelsbreed tussen
   twee plaatsnamen, geen reistijd. Wie geen herkende woonplaats heeft, valt
   buiten élke berekening hier. Dat verzwijgen we niet — de aantallen staan
   in een eigen KPI en de namen zijn uitklapbaar, zodat zo iemand alsnog
   gebeld kan worden in plaats van onzichtbaar te blijven.

   ROBUUSTHEID
   Leaflet komt van een CDN. Het scherm wordt daarom volledig opgebouwd
   ZONDER kaart; de kaart wordt er daarna bij gehangen. Valt de CDN om, dan
   staat er een nette melding in het kaartvlak en werkt de rest gewoon door.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Leaflet lazy laden (css + js van jsdelivr) ──────────────── */
const LF = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
let _leaflet = null;
function laadLeaflet(){
  if(_leaflet) return _leaflet;
  _leaflet = new Promise((res, rej) => {
    if(window.L && window.L.map) return res(window.L);
    if(!document.getElementById('leaflet-css')){
      const l = document.createElement('link');
      l.id = 'leaflet-css'; l.rel = 'stylesheet'; l.href = LF + 'leaflet.min.css';
      document.head.appendChild(l);
    }
    const s = document.createElement('script');
    s.src = LF + 'leaflet.min.js';
    s.onload = () => res(window.L);
    /* Bij een fout de belofte weggooien, zodat een volgende poging (andere
       tab, opnieuw openen) het gewoon nog eens probeert. */
    s.onerror = () => { _leaflet = null; rej(new Error('de bibliotheek is niet bereikbaar (geen internet, of de CDN ligt eruit)')); };
    document.head.appendChild(s);
  });
  return _leaflet;
}

/* ═══════════════════════════════════════════════════════════════
   PLAATSNAMEN → COÖRDINAAT
   CRM.PLAATSEN (data.js) is de bron van waarheid, maar de echte data
   schrijft plaatsen net anders op: "Katwijk aan Zee", "The Hague",
   "Capelle a.d. IJssel", "Leidschenveen", "Hellvoetsluis". Zulke rijen
   vielen meteen van de kaart én uit elk radiusfilter.
   Deze laag probeert eerst een paar varianten van DEZELFDE plaats.
   Nooit gokken op een buurgemeente: liever geen punt dan een fout punt.
   ═══════════════════════════════════════════════════════════════ */
/* De aliassen staan sinds 31 jul 2026 in js/data.js (CRM.PLAATS_ALIAS) en
   worden door CRM.plaatsSleutel toegepast. Ze stonden hier als eigen kopie,
   waardoor dít scherm plaatsen kon plaatsen die de rest van de app niet
   herkende — twee antwoorden over dezelfde persoon. Nu de matchscore
   zwaarder op afstand leunt, werd dat verschil groter in plaats van kleiner. */
const PL_ALIAS = (typeof CRM !== 'undefined' && CRM.PLAATS_ALIAS) || {};

/* Varianten van precies naar ruimer. Elke stap moet dezelfde plaats
   blijven aanwijzen — daarom geen fuzzy matching. */
function* plaatsVarianten(ruw){
  yield ruw;
  const basis = ruw.toLowerCase()
    .replace(/\(.*?\)/g, ' ')                    /* "(ZH)", "(gem. Westland)" */
    .replace(/^\s*\d{4}\s*[a-z]{0,2}\b/, '')     /* postcode ervoor */
    .replace(/^\s*gem(eente)?\.?\s+/, '')
    .replace(/\s+/g, ' ').trim();
  if(basis && basis !== ruw.toLowerCase()) yield basis;
  const zonderZee = basis.replace(/\s+a(an)?\s*\/?\s*(de[nr]?\s+)?zee$/, '');
  if(zonderZee && zonderZee !== basis) yield zonderZee;               /* Katwijk aan Zee → Katwijk */
  const eerste = basis.split(/\s*[,;]\s*|\s+\/\s+|\s+-\s+/)[0].trim();
  if(eerste && eerste !== basis) yield eerste;                        /* "Rotterdam / Schiedam" */
}

/* {sleutel, coord} of null. Gecached: dit loopt bij elke hertekening
   over honderden rijen. */
const _plaatsCache = new Map();
function plaatsPunt(naam){
  const ruw = String(naam||'').trim();
  if(!ruw) return null;
  if(_plaatsCache.has(ruw)) return _plaatsCache.get(ruw);
  let uit = null;
  for(const v of plaatsVarianten(ruw)){
    let s = CRM.plaatsSleutel(v);
    if(!s) continue;
    if(!CRM.PLAATSEN[s] && PL_ALIAS[s]) s = PL_ALIAS[s];
    if(CRM.PLAATSEN[s]){ uit = {sleutel:s, coord:CRM.PLAATSEN[s]}; break; }
  }
  _plaatsCache.set(ruw, uit);
  return uit;
}

/* Afstand tussen twee coördinaten. Het Sourcing-scherm rekent op coördinaten
   in plaats van op namen: dan hoeft de resolver maar één keer per plaats te
   draaien in plaats van één keer per vergelijking. Bij 200 plaatsen × 50
   vacatures scheelt dat tienduizenden stringbewerkingen per hertekening. */
const R_AARDE = 6371, rad = d => d*Math.PI/180;
function kmTussen(a, b){
  if(!a || !b) return null;
  const dLat = rad(b[0]-a[0]), dLon = rad(b[1]-a[1]);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;
  return Math.round(2*R_AARDE*Math.asin(Math.sqrt(x)));
}
/* Afstand op naam, met dezelfde resolver als de kaart. CRM.afstandKm kent de
   aliassen hierboven niet; zonder deze functie stond een klant wél op de
   kaart maar viel hij buiten elk radiusfilter. */
function afstandKm(a, b){
  const pa = plaatsPunt(a), pb = plaatsPunt(b);
  return (pa && pb) ? kmTussen(pa.coord, pb.coord) : null;
}

/* Groepeer een lijst op plaats. Levert de groepen mét coördinaat, plus
   apart wie er géén plaats heeft en wie een plaats heeft die we niet
   kennen — die twee zijn een ander soort probleem en horen dus niet op
   één hoop. */
function groepeerOpPlaats(lijst, veld){
  const op = new Map(), zonder = [], onbekend = [];
  lijst.forEach(x => {
    const ruw = String(x[veld]||'').trim();
    if(!ruw){ zonder.push(x); return; }
    const p = plaatsPunt(ruw);
    if(!p){ onbekend.push({obj:x, locatie:ruw}); return; }
    let g = op.get(p.sleutel);
    if(!g) op.set(p.sleutel, g = {sleutel:p.sleutel, naam:ruw, coord:p.coord, leden:[]});
    g.leden.push(x);
  });
  return {op:Array.from(op.values()), zonder, onbekend};
}

/* Onbekende plaatsen tellen, ongeacht hoofdletters of streepjes. */
function telOnbekend(rijen){
  const t = {};
  rijen.forEach(r => {
    const s = CRM.plaatsSleutel(r.locatie);
    (t[s] = t[s] || {naam:r.locatie, n:0}).n++;
  });
  return Object.values(t).sort((a,b) => b.n - a.n);
}

/* Meerdere punten in dezelfde plaats: klein, deterministisch uitwaaieren
   zodat stippen elkaar niet exact bedekken (± 0,5–1,5 km). */
function spreid(basis, i, n, schaal){
  if(n <= 1) return basis;
  const hoek = (i / n) * 2 * Math.PI + 0.7;
  const r = schaal * (0.6 + 0.4 * ((i * 7919) % 100) / 100);
  return [basis[0] + Math.cos(hoek) * r, basis[1] + Math.sin(hoek) * r * 1.6];
}

/* Kleuren uit de design-system-variabelen (geen eigen kleuren verzinnen). */
function themaKleuren(){
  const css = getComputedStyle(document.documentElement);
  const v = n => css.getPropertyValue(n).trim() || '#5b6544';
  return {
    olive:v('--olive'), oliveL:v('--olive-l'), blue:v('--blue'), green:v('--green'),
    purple:v('--purple'), amber:v('--amber'), red:v('--red'), muted:v('--muted'),
    ink:v('--ink'), gold:v('--gold'), oranje:v('--oranje')
  };
}

const NL_MIDDEN = [52.05, 4.7];
const OSM = {
  url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  opts:{maxZoom:18, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers'}
};

/* ═══════════════════════════════════════════════════════════════
   KAART-ENGINE VOOR DE KLANTENLENS (js/klanten.js)
   Alle klanten, kleur per branche, grootte naar plaatsingen of omzet.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Omzet per klant (ALLEEN achter CRM.canSeeMoney) ─────────── */
let _omzet = null;
async function laadOmzet(){
  if(!CRM.canSeeMoney()) return null;
  if(_omzet) return _omzet;
  if(CRM.demo){
    /* Demo: geen echte fin_-tabellen aanraken. Afgeleide demo-omzet uit de
       geplaatste testkandidaten, zodat de geld-laag wél te controleren is. */
    const rows = [];
    CRM.kandidaten().forEach(c => {
      if(c.geplaatstOp && (CRM.PLACED.includes(c.fase) || c.fase === 'Gestopt'))
        rows.push({klant:c.klant, datum:c.geplaatstOp, bedrag:(Number(c.maandloon)||2800) * 3});
    });
    _omzet = {rows, demo:true};
    return _omzet;
  }
  try{
    const [pl, inst] = await Promise.all([
      CRM.sb.from('fin_placements').select('id,klant'),
      CRM.sb.from('fin_installments').select('placement_id,bedrag_excl,geplande_datum,factuurdatum,status')
    ]);
    if(pl.error || inst.error) throw (pl.error || inst.error);
    const perId = Object.fromEntries((pl.data||[]).map(p => [p.id, p.klant]));
    const rows = (inst.data||[]).filter(i => i.status !== 'vervallen').map(i => ({
      klant: perId[i.placement_id] || '',
      datum: i.factuurdatum || i.geplande_datum || '',
      bedrag: Number(i.bedrag_excl||0)
    }));
    _omzet = {rows};
  }catch(e){
    console.warn('Source-kaart: omzet laden mislukt', e);
    _omzet = {rows:[], fout:true};
  }
  return _omzet;
}
/* Klantnamen bucketen zoals CRM.zelfdeKlant ze vergelijkt (genormaliseerd,
   eerste 8 tekens). Zo kunnen we één keer tellen in plaats van per klant
   opnieuw door alle rijen te lopen — bij 222 klanten × 349 kandidaten
   scheelt dat tienduizenden vergelijkingen per hertekening. */
const klantSleutel = naam => { const x = CRM.normKlant(naam); return x ? x.slice(0,8) : ''; };
function telPerKlant(rijen, naamVan, waardeVan){
  const tel = {};
  rijen.forEach(r => { const k = klantSleutel(naamVan(r)); if(k) tel[k] = (tel[k]||0) + waardeVan(r); });
  return naam => tel[klantSleutel(naam)] || 0;
}
function omzetIndex(rows, periode){
  const jaar = String(new Date().getFullYear());
  return telPerKlant(rows.filter(r => periode === 'alles' || String(r.datum).startsWith(jaar)),
    r => r.klant, r => r.bedrag);
}
/* Plaatsingen per klant (aantallen — die mag iedereen zien). */
function plaatsingenIndex(){
  return telPerKlant(CRM.kandidaten().filter(c => c.geplaatstOp), c => c.klant, () => 1);
}

CRM.kaartRender = async function(container, opts){
  if(!container) return;

  /* Vorige instantie in deze container opruimen (herrender-veilig). */
  if(container._crmKaart){
    try{ container._crmKaart.map.remove(); }catch(e){}
    container._crmKaart = null;
  }

  const geld = CRM.canSeeMoney();
  let periode = 'jaar';                        // dit jaar | alles (alleen geld-laag)

  container.innerHTML = `
    <div class="stack src">
      <div class="card pad src-top">
        <div class="row">
          <span class="sub">Alle klanten op de kaart — kleur is branche, grootte is ${geld?'omzet':'aantal plaatsingen'}.</span>
          ${geld ? `<div class="seg" id="src_periode">
              <button data-p="jaar" class="on">Dit jaar</button><button data-p="alles">Alles</button>
            </div>` : ''}
          <span class="spacer"></span>
          <span class="meta" id="src_telling"></span>
        </div>
      </div>
      <div class="card src-kaartwrap"><div class="src-kaart" id="src_map">${CRM.ui.laden('Kaart laden…')}</div></div>
      <div id="src_legenda"></div>
      <div class="meta" id="src_missend"></div>
    </div>`;

  const $ = sel => container.querySelector(sel);

  let L;
  try{ L = await laadLeaflet(); }
  catch(e){
    const el = $('#src_map');
    if(el) el.innerHTML = `<div class="note warn" style="margin:14px">De kaart kon niet geladen worden — ${h(e.message)}. Controleer je internetverbinding en ververs de pagina.</div>`;
    return;
  }
  if(!container.isConnected || !$('#src_map')) return;   // gebruiker is al weg

  $('#src_map').innerHTML = '';
  const map = L.map($('#src_map'), {scrollWheelZoom:true, zoomControl:true});
  L.tileLayer(OSM.url, OSM.opts).addTo(map);
  map.setView(NL_MIDDEN, 9);
  const laag = L.layerGroup().addTo(map);
  container._crmKaart = {map};
  setTimeout(() => { try{ map.invalidateSize(); }catch(e){} }, 60);

  /* Links in Leaflet-popups werken via delegatie (popup-DOM is vluchtig). */
  map.on('popupopen', ev => {
    const el = ev.popup.getElement(); if(!el) return;
    el.querySelectorAll('[data-klantkaart]').forEach(a => a.onclick = e => { e.preventDefault(); CRM.ga('klanten',{id:a.dataset.klantkaart}); });
  });

  const K = themaKleuren();
  const omzet = geld ? await laadOmzet() : null;
  if(!container.isConnected) return;

  const teken = () => {
    laag.clearLayers();
    const punten = [];
    const klanten = CRM.state.clients || [];

    /* Branchekleuren: de zes grootste branches krijgen een eigen gedempte
       kleur, de rest wordt "Overig" — anders wordt de legenda een regenboog. */
    const telPerBranche = {};
    klanten.forEach(k => { const b = k.branche || 'Onbekend'; telPerBranche[b] = (telPerBranche[b]||0)+1; });
    const branches = Object.keys(telPerBranche).sort((a,b) => telPerBranche[b]-telPerBranche[a]);
    const PAL = [K.blue, K.green, K.purple, K.amber, K.red, K.oliveL];
    const kleurVan = b => { const i = branches.indexOf(b||'Onbekend'); return i > -1 && i < PAL.length ? PAL[i] : K.muted; };

    /* Waarde per klant: omzet (alleen eigenaar) of plaatsingen (iedereen).
       Eén index vooraf — niet per klant opnieuw alle rijen doorlopen. */
    const telPlaatsingen = plaatsingenIndex();
    const telOmzet = (geld && omzet) ? omzetIndex(omzet.rows, periode) : null;
    const waarde = {};
    klanten.forEach(k => { waarde[k.naam] = telOmzet ? telOmzet(k.naam) : telPlaatsingen(k.naam); });
    const max = Math.max(1, ...Object.values(waarde));

    const kl = groepeerOpPlaats(klanten, 'locatie');
    kl.op.forEach(g => g.leden.forEach((k, i) => {
      const p = spreid(g.coord, i, g.leden.length, 0.02);
      punten.push(p);
      const w = waarde[k.naam] || 0;
      const r = 5 + Math.sqrt(w / max) * 11;
      const n = telPlaatsingen(k.naam);
      L.circleMarker(p, {radius:r, color:kleurVan(k.branche), weight:2, fillColor:kleurVan(k.branche), fillOpacity:.6})
        .bindPopup(`<div class="src-pop">
          <b><a href="#klanten/${encodeURIComponent(k.naam)}" data-klantkaart="${h(k.naam)}">${h(k.naam)}</a></b>
          <div class="src-pop-sub">${h(k.branche||'—')} · ${h(k.locatie||'—')} · ${h(k.fase||'')}</div>
          <div class="src-pop-sub"><span class="num">${n}</span> plaatsing${n===1?'':'en'}${
            telOmzet ? ' · omzet ' + (periode==='jaar'?'dit jaar':'totaal') + ': <b class="num">' + h(CRM.euro(telOmzet(k.naam))) + '</b>' : ''}</div>
        </div>`)
        .addTo(laag);
    }));

    const buitenTotaal = kl.zonder.length + kl.onbekend.length;
    /* Eerlijk zijn over de noemer: "121 van 211" met daarachter waaróm de
       rest ontbreekt, in plaats van alleen de klanten die wél passen. */
    $('#src_telling').textContent = (klanten.length - buitenTotaal) + ' van ' + klanten.length + ' klanten op de kaart'
      + (kl.zonder.length ? ' · ' + kl.zonder.length + ' zonder locatie' : '')
      + (kl.onbekend.length ? ' · ' + kl.onbekend.length + ' zonder herkende plaats' : '')
      + (geld && omzet && omzet.demo ? ' · demo-omzet (afgeleid van testdata)' : '')
      + (geld && omzet && omzet.fout ? ' · omzet niet beschikbaar' : '');

    const legendaBranches = branches.slice(0, PAL.length);
    $('#src_legenda').innerHTML = `<div class="src-legenda">
      ${legendaBranches.map(b => `<span class="src-leg"><i class="src-dot" style="background:${kleurVan(b)}"></i>${h(b)}</span>`).join('')}
      ${branches.length > PAL.length ? `<span class="src-leg"><i class="src-dot" style="background:${K.muted}"></i>overig</span>` : ''}
    </div>`;

    $('#src_missend').innerHTML = buitenTotaal
      ? buitenLijstHtml(kl, 'klant', 'klanten')
      : '';

    if(punten.length){
      try{ map.fitBounds(L.latLngBounds(punten).pad(0.12), {maxZoom:11}); }catch(e){}
    } else {
      map.setView(NL_MIDDEN, 8);
    }
  };

  const seg = $('#src_periode');
  if(seg) seg.querySelectorAll('button').forEach(b => b.onclick = () => {
    periode = b.dataset.p;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    teken();
  });

  teken();
};

/* Wie niet op de kaart past, verdwijnt niet stilletjes: we splitsen
   "veld leeg" van "plaats staat niet in CRM.PLAATSEN" en tonen beide,
   inklapbaar — want dit kunnen er honderden zijn. */
function buitenLijstHtml(groep, enkel, meervoud){
  const zl = groep.zonder, ol = groep.onbekend;
  const n = zl.length + ol.length;
  if(!n) return '';
  const plaatsen = telOnbekend(ol);
  const namenVan = p => ol
    .filter(x => CRM.plaatsSleutel(x.locatie) === CRM.plaatsSleutel(p.naam))
    .map(x => x.obj.naam).join(', ');
  return `<details class="src-buiten">
    <summary>${n} ${n===1?enkel:meervoud} niet op de kaart${
      zl.length ? ` · ${zl.length} zonder locatie` : ''}${
      ol.length ? ` · ${ol.length} met een plaats die het systeem niet kent` : ''}</summary>
    ${plaatsen.length ? `<div class="src-buitenlijst">${plaatsen.map(p =>
        `<span class="chip" title="${h(namenVan(p))}">${h(p.naam)} <b class="num">${p.n}</b></span>`).join('')}</div>
      <p class="meta">Deze plaatsnamen staan niet in de afstandentabel — daardoor vallen ze ook buiten elke
        afstandsberekening op dit scherm. Geef ze door zodat ze toegevoegd kunnen worden.</p>` : ''}
    ${zl.length ? `<p class="meta">Zonder locatie: ${h(zl.slice(0,25).map(k => k.naam).join(', '))}${
      zl.length > 25 ? ` + ${zl.length - 25} andere` : ''}.</p>` : ''}
  </details>`;
}

/* ═══════════════════════════════════════════════════════════════
   HET SOURCING-SCHERM
   ═══════════════════════════════════════════════════════════════ */

/* ─── Filters onthouden ───────────────────────────────────────── */
const SKEY = 'crm_source_dekking';
const RADII = [15, 30, 45];
const MODUS_KEYS = ['zoek','vraag','wit','gold'];
const S_STD = {modus:'zoek', radius:30, pool:'beide', ster:0, functie:'', cert:'',
               taal:'', ploegen:'', vervoer:'', salaris:'', open:true, sort:'match'};
let S = (() => {
  try{
    const uit = Object.assign({}, S_STD, JSON.parse(localStorage.getItem(SKEY)||'{}'));
    /* Nooit blind vertrouwen op wat er in localStorage staat: een oude of
       met de hand aangepaste waarde mag het scherm niet stukmaken. */
    if(!RADII.includes(uit.radius)) uit.radius = S_STD.radius;
    if(!MODUS_KEYS.includes(uit.modus)) uit.modus = 'zoek';
    return uit;
  }catch(e){ return Object.assign({}, S_STD); }
})();
function zetS(k, v){ S[k] = v; try{ localStorage.setItem(SKEY, JSON.stringify(S)); }catch(e){} }

/* Welke rij staat er open? Blijft in module-scope zodat een hertekening
   (realtime-sync) je selectie niet wegslaat. */
const sel = {vraag:null, wit:null, gold:null};
let toonMeer = 25;
/* Leaflet laadt asynchroon. Wie snel weg- en terugnavigeert heeft twee
   renders lopen; zonder dit volgnummer hangt de eerste zijn kaart alsnog aan
   het scherm van de tweede en staan er twee kaarten in hetzelfde vlak. */
let renderNr = 0;

/* ─── Kandidaten filteren ─────────────────────────────────────── */

/* Geanonimiseerd = iemand heeft om verwijdering gevraagd en zijn gegevens
   zijn gewist (js/kandverwijder.js). De kaart blijft bestaan omdat de
   plaatsing in de cijfers moet kloppen, maar er valt niemand te bellen.
   Zo'n regel hoort dus nooit als sourcing-suggestie terug te komen. */
const geanonimiseerd = c => !!(CRM.kandVerwijder && CRM.kandVerwijder.isGeanonimiseerd
  && CRM.kandVerwijder.isGeanonimiseerd(c));

const POOLS = [
  {k:'beide',       lbl:'Voorraad + beschikbaar'},
  {k:'voorraad',    lbl:'Klaar om voor te stellen'},
  {k:'beschikbaar', lbl:'Beschikbaar gemeld'},
  {k:'alle',        lbl:'Iedereen in het bestand'}
];
function inPool(c){
  if(S.pool === 'alle') return true;
  const voorraad = CRM.klaarOmVoorTeStellen(c);
  const besch = CRM.isBeschikbaar(c);
  if(S.pool === 'voorraad')    return voorraad;
  if(S.pool === 'beschikbaar') return besch;
  return voorraad || besch;
}

/* Talen: kandidaten schrijven afkortingen ("NL, EN"), de gebruiker typt vaak
   voluit. Zelfde tabel als in js/kandidaten.js — die staat daar module-lokaal;
   zie het verzoek onderaan dit bestand om hem één keer te delen. */
const TAALKORT = {nederlands:'nl', engels:'en', duits:'de', frans:'fr', spaans:'es',
  pools:'pl', roemeens:'ro', bulgaars:'bg', hongaars:'hu', turks:'tr', arabisch:'ar',
  portugees:'pt', oekraiens:'uk', russisch:'ru', slowaaks:'sk', tsjechisch:'cs'};
function taalMatch(talen, zoek){
  const z = String(zoek||'').trim().toLowerCase(); if(!z) return true;
  const t = String(talen||'').toLowerCase();       if(!t) return false;
  if(t.includes(z)) return true;
  /* Eigen naam: verderop staat een gedeelde helper die ook `plat` heet. */
  const zPlat = z.normalize('NFD').replace(/[̀-ͯ]/g,'');
  const kort = TAALKORT[zPlat];
  if(kort && new RegExp('\\b'+kort+'\\b').test(t)) return true;
  const lang = Object.keys(TAALKORT).find(k => TAALKORT[k] === zPlat);
  return !!(lang && t.includes(lang));
}
/* Certificaat of rijbewijs: heftruck en VCA staan bij de een in het
   rijbewijsveld, bij de ander in de CV-skills of -certificaten. Eén veld dat
   alle drie doorzoekt, anders mist een recruiter juist de mensen die het wél
   hebben maar op de andere plek. */
function certMatch(c, zoek){
  const z = String(zoek||'').trim().toLowerCase(); if(!z) return true;
  const cv = c.cv || {};
  const bak = [c.rijbewijs, ...(cv.skills||[]), ...(cv.certificaten||[])]
    .map(x => String(x||'').toLowerCase()).join(' | ');
  return bak.includes(z);
}
function functieMatch(c, zoek){
  const z = String(zoek||'').trim().toLowerCase(); if(!z) return true;
  return (String(c.functie||'') + ' ' + String(c.cv?.functie||'')).toLowerCase().includes(z);
}

function poolKandidaten(){
  return CRM.kandidaten().filter(c => {
    if(geanonimiseerd(c)) return false;
    if(!inPool(c)) return false;
    if(S.ster > 0 && (Number(c.ster)||0) < S.ster) return false;
    if(S.functie && !functieMatch(c, S.functie)) return false;
    if(S.cert && !certMatch(c, S.cert)) return false;
    if(S.taal && !taalMatch(c.talen, S.taal)) return false;
    /* 'wisselend' kan ook in een vaste ploeg werken, dus die telt mee —
       behalve als je juist iemand zoekt die géén ploegendienst wil. */
    if(S.ploegen && !(c.ploegen === S.ploegen || (S.ploegen !== 'geen' && c.ploegen === 'wisselend'))) return false;
    if(S.vervoer && c.vervoer !== S.vervoer) return false;
    /* Salarisplafond: onbekend maandloon laten we staan — alleen aantoonbaar
       te dure kandidaten vallen af. */
    if(S.salaris && c.maandloon != null && Number(c.maandloon) > Number(S.salaris)) return false;
    return true;
  });
}

/* ─── "Hoe lang niet gesproken" ───────────────────────────────── */
/* Dezelfde regel als de kandidatenlijst: alleen échte contactmomenten
   tellen. Die functie staat daar module-lokaal, dus hier staat hem kort
   nog een keer — met dezelfde bron (CRM.activiteitenVoor) en dezelfde
   soortenlijst, zodat de twee schermen nooit iets anders kunnen zeggen.
   Zodra hij gedeeld wordt, pakt deze regel hem vanzelf op. */
const CONTACT_SOORTEN = (CRM.opvolging && CRM.opvolging.CONTACT) || ['bel','gesprek','whatsapp','mail','bezoek'];

/* Eén keer door de activiteiten per hertekening, niet één keer per kandidaat.
   CRM.activiteitenVoor() loopt de hele lijst af; dat is prima voor één kaart,
   maar hier vragen we het van honderden mensen tegelijk en dan wordt het
   honderdduizenden vergelijkingen. Zelfde uitkomst, één doorloop. */
let _laatstContact = new Map();
function bouwContactIndex(){
  const m = new Map();
  (CRM.state.activiteiten || []).forEach(a => {
    if(a.entiteit !== 'kandidaat' || !a.op || !CONTACT_SOORTEN.includes(a.soort)) return;
    const k = String(a.ref), b = m.get(k);
    if(!b || a.op > b) m.set(k, a.op);
  });
  _laatstContact = m;
}
function stilte(c){
  const laatst = _laatstContact.get(String(c.id)) || null;
  const kleur = n => n == null ? '' : n >= 14 ? 'red' : n >= 7 ? 'amber' : '';
  if(laatst){
    const d = CRM.dagenGeleden(laatst);
    return {dagen:d, nooit:false, tekst:d === 0 ? 'vandaag gesproken' : d + (d===1?' dag':' dagen') + ' niet gesproken', kleur:kleur(d)};
  }
  const wacht = CRM.dagenGeleden(c.since);
  return {dagen:wacht, nooit:true, tekst:'nog nooit gesproken', kleur:kleur(wacht)};
}

/* ─── Golden candidates ───────────────────────────────────────── */
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

/* ─── Kleine bouwstenen ───────────────────────────────────────── */
const telLink = t => 'tel:' + String(t||'').replace(/[^0-9+]/g,'');
const waLink  = t => { let n = String(t||'').replace(/[^0-9]/g,'');
  if(n.startsWith('06')) n = '31'+n.slice(1); if(n.startsWith('00')) n = n.slice(2);
  return n ? 'https://wa.me/'+n : ''; };
const sterHtml = n => (Number(n)||0) ? `<span class="src-ster num" title="${Number(n)} van 5">${h(CRM.sterren(n))}</span>` : '';
const openVacs = () => (CRM.state.vacs||[]).filter(v => (v.status||'Open') === 'Open');

/* ═══════════════════════════════════════════════════════════════
   DE REKENKERN
   Eén index per hertekening. Alles rekent op coördinaten van PLAATSEN,
   niet op losse kandidaten: 200 plaatsen × 50 vacatures is een fractie
   van 400 kandidaten × 50 vacatures, en het antwoord is hetzelfde.
   ═══════════════════════════════════════════════════════════════ */
function bouwIndex(){
  const t0 = performance.now();
  bouwContactIndex();
  const kands = poolKandidaten();
  const kg = groepeerOpPlaats(kands, 'woonplaats');

  /* Vacatures met een herkende locatie; de rest apart, zodat we kunnen
     zéggen dat ze niet meedoen in plaats van ze weg te laten. */
  const vacs = [], vacsZonderPlek = [];
  openVacs().forEach(v => {
    const p = plaatsPunt(v.locatie) || plaatsPunt((CRM.klant(v.klant)||{}).locatie);
    if(p) vacs.push({v, coord:p.coord}); else vacsZonderPlek.push(v);
  });

  /* Per vacature: welke woonplaatsgroepen liggen binnen de straal. */
  const dekking = new Map();      // vacature-id → {binnen:[{c,km}], n, dichtst}
  vacs.forEach(x => {
    const binnen = [];
    let dichtst = null;
    kg.op.forEach(g => {
      const km = kmTussen(x.coord, g.coord);
      if(km == null) return;
      if(dichtst == null || km < dichtst) dichtst = km;
      if(km <= S.radius) g.leden.forEach(c => binnen.push({c, km}));
    });
    dekking.set(x.v.id, {binnen, n:binnen.length, dichtst});
  });

  /* Per woonplaatsgroep: hoe ver is de dichtstbijzijnde open vacature en de
     dichtstbijzijnde klant? Dat tweede maakt van een groep zonder vraag een
     verkoopkans in plaats van een raadsel. */
  const klantG = groepeerOpPlaats(CRM.state.clients||[], 'locatie');
  const actieveNamen = new Set(CRM.actieveKlanten().map(k => k.naam));
  const clusters = kg.op.map(g => {
    let vacKm = null, vacObj = null;
    vacs.forEach(x => {
      const km = kmTussen(g.coord, x.coord);
      if(km != null && (vacKm == null || km < vacKm)){ vacKm = km; vacObj = x.v; }
    });
    const bedrijven = [];
    klantG.op.forEach(kgroep => {
      const km = kmTussen(g.coord, kgroep.coord);
      if(km == null || km > S.radius) return;
      kgroep.leden.forEach(k => bedrijven.push({k, km, actief:actieveNamen.has(k.naam)}));
    });
    bedrijven.sort((a,b) => a.km - b.km);
    return {
      sleutel:g.sleutel, naam:g.naam, coord:g.coord, leden:g.leden, n:g.leden.length,
      vacKm, vacObj, bedrijven,
      actieveInBuurt: bedrijven.filter(b => b.actief).length
    };
  });

  const ms = Math.round((performance.now() - t0) * 10) / 10;
  return {kands, kg, vacs, vacsZonderPlek, dekking, clusters, klantG, ms};
}

/* ═══════════════════════════════════════════════════════════════
   DE MODULE
   ═══════════════════════════════════════════════════════════════ */
const MODI = [
  {k:'zoek',  lbl:'Zoeken',       titel:'Doorzoek het hele kandidatenbestand en pak door naar een match'},
  {k:'vraag', lbl:'Vraag',        titel:'Openstaande vacatures, minst gedekte eerst'},
  {k:'wit',   lbl:'Witte vlekken', titel:'Groepen kandidaten zonder vraag in de buurt'},
  {k:'gold',  lbl:'Golden',        titel:'Bewaarde kandidaten met een vacature om de hoek'}
];

function tekenSourcing(mount, acties){
  const mijnNr = ++renderNr;
  /* Vorige kaart opruimen: de module wordt bij elke navigatie opnieuw
     gerenderd en Leaflet laat anders een dode instantie achter. */
  if(mount._srcMap){ try{ mount._srcMap.remove(); }catch(e){} mount._srcMap = null; }

  /* Op een telefoon nemen negen filters het hele scherm in. De voorkeur uit
     localStorage geldt daarom alleen op een breed scherm; op smal begin je
     dicht en open je ze zelf. */
  let filtersOpen = S.open && window.innerWidth > 700;

  if(acties) acties.innerHTML = `<div class="seg" id="s2_modus">${
    MODI.map(m => `<button data-m="${m.k}" class="${S.modus===m.k?'on':''}" title="${h(m.titel)}">${h(m.lbl)}</button>`).join('')}</div>`;

  mount.innerHTML = `
    <div class="stack src2">
      <div class="grid c4" id="s2_kpi"></div>

      <div class="card pad src-top">
        <div class="row">
          <button class="btn ghost sm" id="s2_filknop" aria-expanded="${filtersOpen}" aria-controls="s2_fil">${
            filtersOpen ? 'Filters verbergen' : 'Filters tonen'}</button>
          <span class="label" style="margin-left:6px">Straal</span>
          <div class="seg" id="s2_radius">${RADII.map(r =>
            `<button data-r="${r}" class="${S.radius===r?'on':''}">${r} km</button>`).join('')}</div>
          <span class="spacer"></span>
          <span class="meta" id="s2_telling"></span>
        </div>
        <div class="src-filters" id="s2_fil" style="${filtersOpen?'':'display:none'}">
          <div class="src-fgrid">
            <div class="f-row"><label>Welke kandidaten</label>
              <select data-sf="pool">${POOLS.map(p =>
                `<option value="${p.k}"${S.pool===p.k?' selected':''}>${h(p.lbl)}</option>`).join('')}</select></div>
            <div class="f-row"><label>Minimaal sterren</label>
              <select data-sf="ster"><option value="0">Alle</option>
                ${[1,2,3,4,5].map(n=>`<option value="${n}"${S.ster===n?' selected':''}>${'★'.repeat(n)}${n<5?' of meer':''}</option>`).join('')}
              </select></div>
            <div class="f-row"><label>Functie</label>
              <input type="text" data-sf="functie" placeholder="bv. operator" value="${h(S.functie)}"></div>
            <div class="f-row"><label>Certificaat of rijbewijs</label>
              <input type="text" data-sf="cert" placeholder="bv. heftruck, VCA of B" value="${h(S.cert)}"></div>
            <div class="f-row"><label>Taal</label>
              <input type="text" data-sf="taal" placeholder="bv. Nederlands of PL" value="${h(S.taal)}"></div>
            <div class="f-row"><label>Ploegendiensten</label>
              <select data-sf="ploegen"><option value="">Alle</option>
                ${CRM.PLOEGEN.map(p=>`<option value="${h(p)}"${S.ploegen===p?' selected':''}>${h(p)}</option>`).join('')}
              </select></div>
            <div class="f-row"><label>Eigen vervoer</label>
              <select data-sf="vervoer"><option value="">Alle</option>
                ${CRM.VERVOER.map(p=>`<option value="${h(p)}"${S.vervoer===p?' selected':''}>${h(p)}</option>`).join('')}
              </select></div>
            <div class="f-row"><label>Maandloon max.</label>
              <input type="number" data-sf="salaris" placeholder="bv. 3200" value="${h(S.salaris)}"></div>
          </div>
        </div>
      </div>

      <div class="src2-wrap">
        <div class="src2-rail" id="s2_rail"></div>
        <div class="card src-kaartwrap src2-kaartcard">
          <div class="src-kaart" id="s2_map">${CRM.ui.laden('Kaart laden…')}</div>
          <div class="src2-onder">
            <div class="src-legenda" id="s2_legenda"></div>
            <p class="meta src2-uitleg">Afstanden zijn hemelsbreed tussen twee plaatsnamen uit de afstandentabel —
              geen reistijd over de weg, en geen adres. Gebruik ze om te sorteren, niet om een belofte te doen.</p>
          </div>
        </div>
        <div class="src2-detail" id="s2_detail"></div>
      </div>

      <div id="s2_kwaliteit"></div>
    </div>`;

  const $ = s => mount.querySelector(s);
  const K = themaKleuren();
  let L = null, map = null, laag = null;

  /* ─── Alles tekenen, kaart of niet ──────────────────────────── */
  function teken(){
    if(!mount.isConnected) return;
    const ix = bouwIndex();
    /* Meetpunt zonder console-ruis: de rekentijd van de laatste hertekening
       staat als data-attribuut op het scherm. */
    mount.dataset.rekentijdMs = ix.ms;

    tekenKpi(ix);
    tekenTelling(ix);
    tekenRail(ix);
    tekenDetail(ix);
    tekenKwaliteit(ix);
    if(map) tekenKaart(ix);
  }

  /* ─── KPI's ─────────────────────────────────────────────────── */
  function tekenKpi(ix){
    const zonderDekking = ix.vacs.filter(x => (ix.dekking.get(x.v.id)||{}).n === 0).length;
    const voorraad = CRM.kandidaten().filter(c => !geanonimiseerd(c) && CRM.klaarOmVoorTeStellen(c)).length;
    const kansen = ix.clusters.filter(c => c.n >= 2 && (c.vacKm == null || c.vacKm > S.radius));
    const mensenInKansen = kansen.reduce((a,c) => a + c.n, 0);
    const kandBuiten = ix.kg.zonder.length + ix.kg.onbekend.length;
    const klantBuiten = ix.klantG.zonder.length + ix.klantG.onbekend.length;

    $('#s2_kpi').innerHTML = [
      CRM.ui.kpi('Open vacatures', `<span class="num">${ix.vacs.length + ix.vacsZonderPlek.length}</span>`,
        zonderDekking
          ? `<span class="neg num">${zonderDekking}</span> zonder kandidaat binnen ${S.radius} km`
          : ix.vacs.length ? 'overal iemand binnen ' + S.radius + ' km' : 'geen open vacature',
        zonderDekking ? 'accent' : ''),
      CRM.ui.kpi('Klaar om voor te stellen', `<span class="num">${voorraad}</span>`,
        `${ix.kands.length} door de filters · ${ix.kands.length - kandBuiten} met een herkende plaats`),
      CRM.ui.kpi('Witte vlekken', `<span class="num">${kansen.length}</span>`,
        !ix.clusters.length ? 'geen kandidaten met een herkende plaats'
        : kansen.length ? `${mensenInKansen} mensen zonder vacature binnen ${S.radius} km`
        : 'elke groep heeft vraag in de buurt'),
      CRM.ui.kpi('Niet mee te rekenen', `<span class="num">${kandBuiten}</span>`,
        `kandidaten zonder herkende woonplaats${klantBuiten ? ` · ${klantBuiten} klanten zonder plaats` : ''}`)
    ].join('');
  }

  function tekenTelling(ix){
    const el = $('#s2_telling'); if(!el) return;
    const opKaart = ix.kands.length - ix.kg.zonder.length - ix.kg.onbekend.length;
    el.textContent = `${ix.kands.length} kandidaten door de filters · ${opKaart} met een plaats op de kaart`
      + (ix.vacsZonderPlek.length ? ` · ${ix.vacsZonderPlek.length} vacature${ix.vacsZonderPlek.length===1?'':'s'} zonder bruikbare locatie` : '');
  }

  /* ─── Linkerrail: de werkvoorraad ───────────────────────────── */
  function tekenRail(ix){
    const el = $('#s2_rail');
    if(S.modus === 'vraag')      el.innerHTML = railVraag(ix);
    else if(S.modus === 'wit')   el.innerHTML = railWit(ix);
    else                         el.innerHTML = railGold(ix);
    el.querySelectorAll('[data-kies]').forEach(b => b.onclick = () => {
      const veld = S.modus === 'vraag' ? 'vraag' : S.modus === 'wit' ? 'wit' : 'gold';
      sel[veld] = sel[veld] === b.dataset.kies ? null : b.dataset.kies;
      toonMeer = 25;
      teken();
      /* Op één kolom staat het detailpaneel ónder de kaart: zonder dit lijkt
         het alsof er niets gebeurt als je een rij aanklikt. block:'nearest'
         schuift alleen zover als nodig, dus op een breed scherm blijft het
         beeld gewoon staan. */
      if(sel[veld]) $('#s2_detail').scrollIntoView({block:'nearest'});
    });
  }

  function railKop(titel, sub){
    return `<div class="src2-railkop"><div class="label">${h(titel)}</div>
      <p class="meta">${h(sub)}</p></div>`;
  }

  function railVraag(ix){
    if(!ix.vacs.length && !ix.vacsZonderPlek.length)
      return railKop('Vraag', 'Geen openstaande vacatures') +
        CRM.ui.leeg('Geen open vacatures', 'Zet een vacature open bij een klant, dan rekent dit scherm meteen uit wie er in de buurt woont.');

    /* Slechtste dekking eerst: dáár zit het werk. Bij gelijke dekking gaat de
       vacature met de meeste plekken voor. */
    const rijen = ix.vacs.map(x => ({x, d:ix.dekking.get(x.v.id) || {n:0, binnen:[], dichtst:null}}))
      .sort((a,b) => a.d.n - b.d.n || (b.x.v.aantal||1) - (a.x.v.aantal||1));

    return railKop('Vraag', `${rijen.length} open vacatures — minst gedekte eerst`) +
      `<div class="src2-lijst">${rijen.map(({x, d}) => {
        const v = x.v, aan = sel.vraag === String(v.id);
        const kleur = d.n === 0 ? 'red' : d.n < (v.aantal||1) * 3 ? 'amber' : 'green';
        return `<button class="src2-rij${aan?' aan':''}" data-kies="${h(String(v.id))}" aria-pressed="${aan}">
          <span class="src2-rij-t">${h(v.functie||'Vacature zonder functie')}${
            v.aantal > 1 ? ` <span class="num">×${v.aantal}</span>` : ''}${
            v.hot ? ' <span class="chip amber">hot</span>' : ''}</span>
          <span class="src2-rij-s">${h(v.klant||'—')} · ${h(v.locatie||'—')}</span>
          <span class="src2-rij-m"><span class="chip ${kleur}"><span class="num">${d.n}</span> binnen ${S.radius} km</span>${
            d.n === 0 && d.dichtst != null
              ? `<span class="meta">dichtstbijzijnde woont <span class="num">${d.dichtst}</span> km verderop</span>` : ''}</span>
        </button>`;
      }).join('')}</div>` +
      (ix.vacsZonderPlek.length ? `<div class="src2-railvoet"><details class="src-buiten">
        <summary>${ix.vacsZonderPlek.length} vacature${ix.vacsZonderPlek.length===1?'':'s'} zonder bruikbare locatie</summary>
        <p class="meta">${h(ix.vacsZonderPlek.slice(0,15).map(v => (v.functie||'?') + ' — ' + (v.klant||'?')).join(', '))}.
          Zonder plaats bij de vacature én bij de klant valt er niets te meten.</p></details></div>` : '');
  }

  function railWit(ix){
    /* Een witte vlek is een groep mensen zonder vraag in de buurt. Eén persoon
       is geen groep; vanaf twee wordt het een reden om ergens te gaan bellen. */
    const kansen = ix.clusters.filter(c => c.n >= 2 && (c.vacKm == null || c.vacKm > S.radius))
      .sort((a,b) => b.n - a.n || ((b.vacKm||9999) - (a.vacKm||9999)));
    const gedekt = ix.clusters.filter(c => !(c.n >= 2 && (c.vacKm == null || c.vacKm > S.radius)));

    if(!ix.clusters.length)
      return railKop('Witte vlekken', 'Nog niets te clusteren') +
        CRM.ui.leeg('Geen kandidaten met een herkende woonplaats', 'Verruim de filters, of vul woonplaatsen aan bij de kandidaten.');

    return railKop('Witte vlekken', kansen.length
        ? `${kansen.length} groep${kansen.length===1?'':'en'} zonder open vacature binnen ${S.radius} km`
        : 'Elke groep heeft vraag in de buurt') +
      (kansen.length ? `<div class="src2-lijst">${kansen.map(c => {
        const aan = sel.wit === c.sleutel;
        return `<button class="src2-rij${aan?' aan':''}" data-kies="${h(c.sleutel)}" aria-pressed="${aan}">
          <span class="src2-rij-t">${h(c.naam)}</span>
          <span class="src2-rij-s"><span class="num">${c.n}</span> kandida${c.n===1?'at':'ten'} · ${
            c.vacKm == null ? 'geen open vacature te meten' : `dichtstbijzijnde vacature <span class="num">${c.vacKm}</span> km`}</span>
          <span class="src2-rij-m">${c.bedrijven.length
            ? `<span class="chip">${c.bedrijven.length} bedrij${c.bedrijven.length===1?'f':'ven'} binnen ${S.radius} km</span>`
            : '<span class="chip amber">geen bedrijf in het bestand</span>'}</span>
        </button>`;
      }).join('')}</div>` : `<div class="src2-railvoet"><p class="meta">Voor elke groep van twee of meer kandidaten
        staat er een open vacature binnen ${S.radius} km. Verklein de straal om strenger te kijken.</p></div>`) +
      (gedekt.length ? `<div class="src2-railvoet"><p class="meta">${gedekt.length} ${kansen.length?'andere ':''}woonplaats${
        gedekt.length===1?'':'en'} met kandidaten ${gedekt.length===1?'valt':'vallen'} hier af: te weinig mensen,
        of er is al vraag in de buurt.</p></div>` : '');
  }

  function railGold(ix){
    /* Golden candidates staan bewust búiten het poolfilter: het zijn goede
       mensen die vaak op Afgevallen staan omdat er destijds niets passends
       was. Juist die wil je terugzien zodra er wél iets in de buurt is. */
    const gouden = CRM.kandidaten().filter(c => !geanonimiseerd(c) && goldenIds().has(String(c.id)));
    if(!gouden.length)
      return railKop('Golden', 'Nog geen bewaarde kandidaten') +
        CRM.ui.leeg('Geen golden candidates', 'Markeer een goede kandidaat zonder passende vacature met de ster. Zodra er hier vraag in de buurt komt, staat die persoon op dit lijstje.');

    /* Waar het hier om gaat is niet "welke vacature ligt het dichtst bij",
       maar "is er inmiddels iets wat bij deze persoon pást, dichtbij genoeg".
       Vandaar: eerst wie een vacature binnen de straal heeft, gesorteerd op de
       beste match; daarna de rest op afstand. */
    const rijen = gouden.map(c => {
      const p = plaatsPunt(c.woonplaats);
      let dichtst = null, binnen = 0, beste = null;
      if(p) ix.vacs.forEach(x => {
        const km = kmTussen(p.coord, x.coord);
        if(km == null) return;
        if(dichtst == null || km < dichtst.km) dichtst = {km, v:x.v};
        if(km > S.radius) return;
        binnen++;
        const score = CRM.matchScore(c, x.v);
        if(!beste || score > beste.score) beste = {score, km, v:x.v};
      });
      return {c, p, dichtst, binnen, beste};
    }).sort((a,b) => {
      if(!!a.beste !== !!b.beste) return a.beste ? -1 : 1;
      if(a.beste && b.beste) return b.beste.score - a.beste.score || a.beste.km - b.beste.km;
      return (a.dichtst ? a.dichtst.km : Infinity) - (b.dichtst ? b.dichtst.km : Infinity);
    });
    const raak = rijen.filter(r => r.beste).length;

    return railKop('Golden', `${gouden.length} bewaard · ${raak} ${raak===1?'heeft':'hebben'} een vacature binnen ${S.radius} km`) +
      `<div class="src2-lijst">${rijen.map(({c, p, dichtst, binnen, beste}) => {
        const aan = sel.gold === String(c.id);
        return `<button class="src2-rij${aan?' aan':''}" data-kies="${h(String(c.id))}" aria-pressed="${aan}">
          <span class="src2-rij-t"><span class="src2-goud">★</span> ${h(c.naam)}</span>
          <span class="src2-rij-s">${h(c.functie||'—')} · ${h(c.woonplaats||'woonplaats onbekend')}</span>
          <span class="src2-rij-m">${
            !p ? '<span class="chip">plaats niet te meten</span>'
            : beste ? `<span class="chip green"><span class="num">${binnen}</span> binnen ${S.radius} km · beste <span class="num">${beste.score}%</span></span>`
            : dichtst ? `<span class="chip">niets binnen ${S.radius} km · dichtstbij <span class="num">${dichtst.km}</span> km</span>`
            : '<span class="chip">geen open vacature te meten</span>'}</span>
        </button>`;
      }).join('')}</div>`;
  }

  /* ─── Rechterkolom: wat je nu kunt doen ─────────────────────── */
  function tekenDetail(ix){
    const el = $('#s2_detail');
    if(S.modus === 'vraag')     el.innerHTML = detailVraag(ix);
    else if(S.modus === 'wit')  el.innerHTML = detailWit(ix);
    else                        el.innerHTML = detailGold(ix);
    bindDetail(el);
  }

  function bindDetail(el){
    el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => {
      e.preventDefault(); CRM.ga('kandidaten', {id:a.dataset.kand});
    });
    el.querySelectorAll('[data-klant]').forEach(a => a.onclick = e => {
      e.preventDefault(); CRM.ga('klanten', {id:a.dataset.klant});
    });
    el.querySelectorAll('[data-gold]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      await zetGolden(b.dataset.gold, b.dataset.aan !== '1');
      teken();
    });
    el.querySelectorAll('[data-meer]').forEach(b => b.onclick = () => { toonMeer += 50; teken(); });
    const sorter = el.querySelector('#s2_sort');
    if(sorter) sorter.querySelectorAll('button').forEach(b => b.onclick = () => { zetS('sort', b.dataset.s); teken(); });
  }

  /* Eén kandidaatregel met alles wat je nodig hebt om te bellen.
     `m` is het antwoord van CRM.match (of null als er geen vacature is om
     tegen te houden). De blokkers staan bewust vóór de belknoppen: dat is de
     reden om níét te bellen, en die hoort niet onderaan weggestopt. */
  function kandRij(c, km, m){
    const score = m ? m.score : null;
    const st = stilte(c);
    const gold = goldenIds().has(String(c.id));
    const tel = String(c.telefoon||'').trim();
    const wa = waLink(tel);
    return `<div class="src2-kand">
      <div class="src2-kand-t">
        <a href="#kandidaten/${encodeURIComponent(c.id)}" data-kand="${h(String(c.id))}"><b>${h(c.naam||'Naam onbekend')}</b></a>
        ${gold ? '<span class="src2-goud" title="Golden candidate">★</span>' : ''}
        ${sterHtml(c.ster)}
        <span class="spacer"></span>
        ${score != null ? `<span class="chip${m.blokkers.length?' red':score>=70?' green':score>=50?'':' amber'}" title="${h(m.regel)}"><span class="num">${score}%</span> match</span>` : ''}
        ${km != null ? `<span class="chip"><span class="num">${km}</span> km</span>` : ''}
      </div>
      <div class="src2-kand-s">${h(c.functie||'geen functie ingevuld')} · ${h(c.woonplaats||'woonplaats onbekend')}</div>
      ${m && m.blokkers.length ? `<div class="src2-blok">Hier gaat het op stuk: ${h(m.blokkers.join(' · '))}</div>` : ''}
      ${m && m.twijfels.length ? `<div class="src2-twijfel">Let op: ${h(m.twijfels.join(' · '))}</div>` : ''}
      ${m && m.onbekend.length ? `<div class="src2-onbekend">Niet bekend: ${h(m.onbekend.slice(0,3).join(' · '))}${
          m.onbekend.length > 3 ? ' + ' + (m.onbekend.length - 3) + ' meer' : ''}</div>` : ''}
      <div class="row tight src2-kand-c">
        ${st.dagen != null ? `<span class="chip ${st.kleur}">${h(st.tekst)}</span>` : ''}
        ${c.beschikbaar ? `<span class="chip">${h(c.beschikbaar)}</span>` : ''}
        ${c.ploegen ? `<span class="chip">${h(c.ploegen)}</span>` : ''}
        ${c.vervoer ? `<span class="chip${c.vervoer==='geen'?' amber':''}">vervoer: ${h(c.vervoer)}</span>` : ''}
        ${c.rijbewijs ? `<span class="chip">${h(c.rijbewijs)}</span>` : ''}
      </div>
      <div class="row tight src2-kand-a">
        ${tel ? `<a class="btn sub sm" href="${h(telLink(tel))}">Bellen</a>` : '<span class="meta">geen telefoonnummer</span>'}
        ${wa ? `<a class="btn sub sm" href="${h(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <a class="btn sub sm" href="#kandidaten/${encodeURIComponent(c.id)}" data-kand="${h(String(c.id))}">Kandidatenkaart</a>
        <button class="btn sub sm src2-goudknop${gold?' aan':''}" data-gold="${h(String(c.id))}" data-aan="${gold?'1':'0'}"
          title="${gold?'Golden-markering weghalen':'Bewaar als golden candidate'}">★</button>
      </div>
    </div>`;
  }

  /* Kandidaten uit de pool die we níét op afstand konden beoordelen. Niet
     verstoppen: het zijn echte mensen met een telefoonnummer. */
  function nietTeMetenHtml(ix){
    const n = ix.kg.zonder.length + ix.kg.onbekend.length;
    if(!n) return '';
    const rijen = [...ix.kg.zonder.map(c => ({c, reden:'geen woonplaats'})),
                   ...ix.kg.onbekend.map(x => ({c:x.obj, reden:x.locatie}))];
    return `<details class="src-buiten src2-nietmeten">
      <summary>${n} kandida${n===1?'at valt':'ten vallen'} buiten elke afstandsberekening</summary>
      <p class="meta">Hun woonplaats is leeg of staat niet in de afstandentabel. Ze kunnen prima passen —
        ze zijn alleen niet te sorteren op afstand.</p>
      <div class="src-buitenlijst">${rijen.slice(0,40).map(r =>
        `<a class="chip" href="#kandidaten/${encodeURIComponent(r.c.id)}" data-kand="${h(String(r.c.id))}"
          title="${h(r.reden)}">${h(r.c.naam||'?')}</a>`).join('')}
        ${rijen.length > 40 ? `<span class="meta">+ ${rijen.length - 40} andere</span>` : ''}</div>
    </details>`;
  }

  /* Waar de match op toetst, boven de lijst. Staan de eisen niet ingevuld,
     dan zeggen we dát — anders leest een lijst zonder waarschuwingen als
     "iedereen voldoet", terwijl er simpelweg niets te toetsen viel.
     `k in v` onderscheidt "kolom bestaat niet in deze database" niet van
     "leeg gelaten"; voor de recruiter is het gevolg hetzelfde, dus één tekst. */
  function eisenNote(v){
    const heeft = [
      v.ploegendienst ? 'ploegendienst: ' + v.ploegendienst : '',
      v.bereikbaarheid ? 'bereikbaarheid: ' + v.bereikbaarheid : '',
      v.eisen ? 'eisen: ' + v.eisen : ''
    ].filter(Boolean);
    if(!heeft.length) return `<div class="note warn" style="margin-bottom:12px">Bij deze vacature staan geen
      ploegendienst, bereikbaarheid of certificaateisen. Daar kan de match dus niet op toetsen — vul ze in
      op de vacaturekaart, dan valt hier meteen te zien wie er afvalt op vervoer of een verlopen certificaat.</div>`;
    return `<div class="note info" style="margin-bottom:12px">Getoetst op ${h(heeft.join(' · '))}.</div>`;
  }

  function sortSeg(){
    const opts = [{k:'match', l:'Match'}, {k:'afstand', l:'Afstand'}, {k:'stil', l:'Langst niet gesproken'}];
    return `<div class="seg" id="s2_sort">${opts.map(o =>
      `<button data-s="${o.k}" class="${S.sort===o.k?'on':''}">${o.l}</button>`).join('')}</div>`;
  }

  function detailVraag(ix){
    const gekozen = ix.vacs.find(x => String(x.v.id) === String(sel.vraag));
    if(!gekozen) return `<div class="card pad src2-leeg">${
      CRM.ui.leeg('Kies een vacature', 'Links staan de openstaande vacatures, de minst gedekte bovenaan. Klik er een aan om te zien wie er in de buurt woont.')}</div>`;

    const v = gekozen.v;
    const d = ix.dekking.get(v.id) || {binnen:[]};
    /* Scores pas hier berekenen, alleen voor wie binnen de straal woont.
       Over alle vacatures × alle kandidaten scoren is verspild werk. */
    const lijst = d.binnen.map(x => { const m = CRM.match(x.c, v); return {...x, m, score:m.score, st:stilte(x.c)}; });
    /* Op match sorteren betekent: eerst wie er zonder streep doorheen komt.
       Twee mensen met 35% zijn niet gelijkwaardig als bij de een de VCA
       verlopen is. Bij gelijke stand gaat wie we vollediger kennen voor —
       zo staat een leeg veld nooit boven een ingevuld veld. */
    const geblokt = x => x.m.blokkers.length ? 1 : 0;
    if(S.sort === 'afstand')   lijst.sort((a,b) => a.km - b.km || b.score - a.score);
    else if(S.sort === 'stil') lijst.sort((a,b) => (b.st.dagen ?? -1) - (a.st.dagen ?? -1) || a.km - b.km);
    else                       lijst.sort((a,b) => geblokt(a) - geblokt(b) || b.score - a.score
                                               || a.m.onbekend.length - b.m.onbekend.length || a.km - b.km);

    const zichtbaar = lijst.slice(0, toonMeer);
    const nBlok = lijst.filter(geblokt).length;
    return `<div class="card src2-paneel">
      <div class="card-h">
        <div class="h2">${h(v.functie||'Vacature')}${v.aantal>1?` <span class="num">×${v.aantal}</span>`:''}</div>
        <a class="chip" href="#klanten/${encodeURIComponent(v.klant||'')}" data-klant="${h(v.klant||'')}">${h(v.klant||'—')}</a>
        <span class="chip">${h(v.locatie||'—')}</span>
        ${CRM.canSeeMoney() && (v.sal_min || v.sal_max)
          ? `<span class="chip">${h(CRM.euro(v.sal_min))}–${h(CRM.euro(v.sal_max))}</span>` : ''}
      </div>
      <div class="card-b">
        ${eisenNote(v)}
        <div class="row" style="margin-bottom:12px">
          <span class="label">${lijst.length} binnen ${S.radius} km${
            nBlok ? ` · <span class="neg num">${nBlok}</span> met een streep door de rekening` : ''}</span>
          <span class="spacer"></span>${sortSeg()}
        </div>
        ${zichtbaar.length
          ? `<div class="src2-kandlijst">${zichtbaar.map(m => kandRij(m.c, m.km, m.m)).join('')}</div>
             ${lijst.length > zichtbaar.length
               ? `<button class="btn ghost sm block" data-meer="1" style="margin-top:12px">Toon de volgende ${
                   Math.min(50, lijst.length - zichtbaar.length)} van ${lijst.length}</button>` : ''}`
          : `<div class="note warn">Niemand uit deze selectie woont binnen ${S.radius} km van ${h(v.locatie||v.klant||'deze vacature')}.${
              d.dichtst != null ? ` De dichtstbijzijnde woont <b class="num">${d.dichtst}</b> km verderop.` : ''}
             <br>Verruim de straal of de filters — of gebruik dit als signaal dat hier geworven moet worden.</div>`}
        ${nietTeMetenHtml(ix)}
      </div>
    </div>`;
  }

  function detailWit(ix){
    const c = ix.clusters.find(x => x.sleutel === sel.wit);
    if(!c) return `<div class="card pad src2-leeg">${
      CRM.ui.leeg('Kies een groep', 'Links staan plaatsen waar mensen wonen zonder open vacature in de buurt. Dat is waar een nieuwe klant het meest oplevert.')}</div>`;

    const gold = goldenIds();
    const nGold = c.leden.filter(x => gold.has(String(x.id))).length;
    const leden = c.leden.slice().sort((a,b) => (Number(b.ster)||0) - (Number(a.ster)||0));
    const zichtbaar = leden.slice(0, toonMeer);

    return `<div class="card src2-paneel">
      <div class="card-h"><div class="h2">${h(c.naam)}</div>
        <span class="chip"><span class="num">${c.n}</span> kandida${c.n===1?'at':'ten'}</span>
        ${nGold ? `<span class="chip"><span class="num">${nGold}</span> golden</span>` : ''}
      </div>
      <div class="card-b">
        <div class="note ${c.bedrijven.length ? 'info' : 'warn'}" style="margin-bottom:14px">
          ${c.vacKm == null
            ? 'Er is geen open vacature waarvan we de afstand kunnen meten.'
            : `De dichtstbijzijnde open vacature ligt <b class="num">${c.vacKm}</b> km hiervandaan.`}
          ${c.bedrijven.length
            ? ` Wel staan er ${c.bedrijven.length} bedrijven uit het bestand binnen ${S.radius} km — daar ligt de opening.`
            : ` En er staat geen enkel bedrijf uit het bestand binnen ${S.radius} km. Hier is nog helemaal niets.`}
        </div>
        ${c.bedrijven.length ? `<div class="label" style="margin-bottom:8px">Bedrijven in de buurt</div>
          <div class="row tight" style="margin-bottom:16px">${c.bedrijven.slice(0,12).map(b =>
            `<a class="chip${b.actief?' green':''}" href="#klanten/${encodeURIComponent(b.k.naam)}" data-klant="${h(b.k.naam)}"
              title="${h(b.k.fase||'')}${b.actief?' · actieve klant':''}">${h(b.k.naam)} <span class="num">${b.km}</span> km</a>`).join('')}
            ${c.bedrijven.length > 12 ? `<span class="meta">+ ${c.bedrijven.length - 12} andere</span>` : ''}</div>` : ''}
        <div class="label" style="margin-bottom:8px">Wie hier woont</div>
        <div class="src2-kandlijst">${zichtbaar.map(x => kandRij(x, null, null)).join('')}</div>
        ${leden.length > zichtbaar.length
          ? `<button class="btn ghost sm block" data-meer="1" style="margin-top:12px">Toon de volgende ${
              Math.min(50, leden.length - zichtbaar.length)} van ${leden.length}</button>` : ''}
      </div>
    </div>`;
  }

  function detailGold(ix){
    const c = CRM.kandidaat(sel.gold);
    if(!c || !goldenIds().has(String(c.id))) return `<div class="card pad src2-leeg">${
      CRM.ui.leeg('Kies een golden candidate', 'Dit zijn goede mensen die je bewaard hebt omdat er destijds niets passends was. Hier zie je of dat inmiddels veranderd is.')}</div>`;

    const p = plaatsPunt(c.woonplaats);
    const kansen = p ? ix.vacs.map(x => { const m = CRM.match(c, x.v);
        return {v:x.v, km:kmTussen(p.coord, x.coord), score:m.score, m}; })
      .filter(x => x.km != null && x.km <= S.radius)
      .sort((a,b) => (a.m.blokkers.length?1:0) - (b.m.blokkers.length?1:0) || b.score - a.score || a.km - b.km) : [];

    return `<div class="card src2-paneel">
      <div class="card-h"><div class="h2"><span class="src2-goud">★</span> ${h(c.naam)}</div>
        <span class="chip">${h(c.woonplaats||'woonplaats onbekend')}</span>
      </div>
      <div class="card-b">
        <div class="src2-kandlijst" style="margin-bottom:16px">${kandRij(c, null, null)}</div>
        <div class="label" style="margin-bottom:8px">Open vacatures binnen ${S.radius} km</div>
        ${!p ? `<div class="note warn">De woonplaats ${c.woonplaats ? `"${h(c.woonplaats)}" ` : ''}staat niet in de afstandentabel,
            dus we kunnen hier niets meten. Vul een herkende woonplaats in op de kandidatenkaart.</div>`
          : kansen.length ? `<div class="src2-vaclijst">${kansen.slice(0,12).map(m => `
              <a class="src2-vacrij" href="#klanten/${encodeURIComponent(m.v.klant||'')}" data-klant="${h(m.v.klant||'')}">
                <span><b>${h(m.v.functie||'Vacature')}</b><span class="src2-rij-s">${h(m.v.klant||'—')} · ${h(m.v.locatie||'—')}</span>${
                  m.m.blokkers.length ? `<span class="src2-blok">${h(m.m.blokkers.join(' · '))}</span>` : ''}</span>
                <span class="row tight"><span class="chip${m.m.blokkers.length?' red':m.score>=70?' green':m.score>=50?'':' amber'}" title="${h(m.m.regel)}"><span class="num">${m.score}%</span></span>
                  <span class="chip"><span class="num">${m.km}</span> km</span></span>
              </a>`).join('')}</div>${kansen.length > 12
              ? `<p class="meta">+ ${kansen.length - 12} andere vacatures binnen ${S.radius} km, met een lagere match.</p>` : ''}`
          : `<div class="note">Nog niets binnen ${S.radius} km. Zodra er hier een vacature opengaat, staat deze persoon bovenaan het lijstje links.</div>`}
      </div>
    </div>`;
  }

  /* ─── Datakwaliteit onderaan ────────────────────────────────── */
  function tekenKwaliteit(ix){
    const el = $('#s2_kwaliteit');
    const kand = buitenLijstHtml(ix.kg, 'kandidaat', 'kandidaten');
    const klant = buitenLijstHtml(ix.klantG, 'klant', 'klanten');
    el.innerHTML = (kand || klant)
      ? `<div class="src2-kwaliteit">${kand}${klant}</div>` : '';
    el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => {
      e.preventDefault(); CRM.ga('kandidaten', {id:a.dataset.kand});
    });
  }

  /* ─── De kaart ──────────────────────────────────────────────── */
  /* Het beeld verzetten doen we alleen als er écht iets anders te zien is.
     Zonder deze sleutel sprong de kaart terug naar heel Nederland zodra je
     "toon meer" aanklikte, en verloor je de plek waar je net naartoe gezoomd
     had. */
  let laatsteFit = '';

  function tekenKaart(ix){
    laag.clearLayers();
    const punten = [];
    const legenda = [];
    /* Bij een selectie zoomen we naar de buurt van wat je koos; anders naar
       alles wat er staat. */
    let zoomNaar = null;
    const buurt = coord => {
      /* Ruwweg S.radius kilometer om een punt heen — 111 km per breedtegraad,
         en op deze breedte ongeveer 68 km per lengtegraad. */
      const dLat = S.radius/111, dLon = S.radius/68;
      return [[coord[0]-dLat, coord[1]-dLon], [coord[0]+dLat, coord[1]+dLon]];
    };

    /* Popup pas bouwen bij een klik: met honderden stippen scheelt dat een
       hoop HTML die niemand ooit ziet. */
    const popupKand = (c, extra) => `<div class="src-pop"><b>${h(c.naam||'?')}</b>
      <div class="src-pop-sub">${h(c.functie||'—')} · ${h(c.woonplaats||'—')}${extra||''}</div>
      <a href="#kandidaten/${encodeURIComponent(c.id)}" data-kand="${h(String(c.id))}">Open kandidatenkaart →</a></div>`;

    if(S.modus === 'vraag'){
      const gekozen = ix.vacs.find(x => String(x.v.id) === String(sel.vraag));
      const binnenIds = new Set();
      if(gekozen){
        const d = ix.dekking.get(gekozen.v.id) || {binnen:[]};
        d.binnen.forEach(m => binnenIds.add(String(m.c.id)));
        /* De ring draagt betekenis (dit is de straal waarover we rekenen), dus
           hij moet leesbaar zijn boven een drukke kaart — vandaar vol contrast
           in plaats van een subtiel lijntje. */
        L.circle(gekozen.coord, {radius:S.radius*1000, color:K.olive, weight:2.5, opacity:.9,
          fillColor:K.olive, fillOpacity:.06, dashArray:'9 7'})
          .bindTooltip(S.radius + ' km hemelsbreed', {direction:'top', sticky:true})
          .addTo(laag);
        zoomNaar = buurt(gekozen.coord);
      }
      /* Kandidaten: binnen de straal vol, daarbuiten flauw — zo zie je in één
         oogopslag hoeveel van je bestand deze vacature níét bereikt. */
      ix.kg.op.forEach(g => g.leden.forEach((c, i) => {
        const raak = !gekozen || binnenIds.has(String(c.id));
        const p = spreid(g.coord, i, g.leden.length, 0.014);
        if(raak) punten.push(p);
        L.circleMarker(p, {radius:raak?5:3.5, color:K.blue, weight:1, fillColor:K.blue,
          fillOpacity: raak ? .6 : .15, opacity: raak ? .8 : .25})
          .on('click', ev => L.popup().setLatLng(ev.latlng).setContent(popupKand(c,
            gekozen ? ` · <span class="num">${kmTussen(g.coord, gekozen.coord)}</span> km` : '')).openOn(map))
          .addTo(laag);
      }));
      /* Vacatures: rood als er niemand binnen de straal woont. */
      ix.vacs.forEach(x => {
        const d = ix.dekking.get(x.v.id) || {n:0};
        const aan = gekozen && gekozen.v.id === x.v.id;
        const kleur = d.n === 0 ? K.red : K.olive;
        punten.push(x.coord);
        L.circleMarker(x.coord, {radius:aan?12:8, color:kleur, weight:aan?3:2,
          fillColor:kleur, fillOpacity:aan?.9:.7})
          .bindTooltip(h((x.v.functie||'Vacature') + ' — ' + (x.v.klant||'')), {direction:'top', offset:[0,-6]})
          .on('click', () => { sel.vraag = String(x.v.id); toonMeer = 25; teken(); })
          .addTo(laag);
      });
      legenda.push([K.olive,'open vacature'], [K.red,'vacature zonder kandidaat in de buurt'], [K.blue,'kandidaat']);
    }

    if(S.modus === 'wit'){
      /* Cirkelgrootte naar aantal, kleur naar vraag: oranje = mensen zonder
         vacature in de buurt. Dat is de verkoopkans. */
      const maxN = Math.max(1, ...ix.clusters.map(c => c.n));
      ix.klantG.op.forEach(g => {
        punten.push(g.coord);
        L.circleMarker(g.coord, {radius:4, color:K.muted, weight:1, fillColor:K.muted, fillOpacity:.3})
          .bindTooltip(h(g.leden.map(k => k.naam).slice(0,5).join(', ')), {direction:'top', offset:[0,-6]})
          .addTo(laag);
      });
      ix.clusters.forEach(c => {
        const kans = c.n >= 2 && (c.vacKm == null || c.vacKm > S.radius);
        const kleur = kans ? K.oranje : K.olive;
        const aan = sel.wit === c.sleutel;
        if(aan) zoomNaar = buurt(c.coord);
        punten.push(c.coord);
        L.circleMarker(c.coord, {radius:6 + Math.sqrt(c.n/maxN)*12, color:kleur,
          weight:aan?3:1.5, fillColor:kleur, fillOpacity:aan?.7:.35})
          .bindTooltip(h(c.naam + ' — ' + c.n + (c.n===1?' kandidaat':' kandidaten')), {direction:'top', offset:[0,-6]})
          .on('click', () => { sel.wit = c.sleutel; toonMeer = 25; teken(); })
          .addTo(laag);
      });
      legenda.push([K.oranje,'groep zonder vacature in de buurt'], [K.olive,'groep met vraag in de buurt'], [K.muted,'bedrijf uit het bestand']);
    }

    if(S.modus === 'gold'){
      ix.vacs.forEach(x => {
        punten.push(x.coord);
        L.circleMarker(x.coord, {radius:7, color:K.olive, weight:2, fillColor:K.olive, fillOpacity:.55})
          .bindTooltip(h((x.v.functie||'Vacature') + ' — ' + (x.v.klant||'')), {direction:'top', offset:[0,-6]})
          .addTo(laag);
      });
      const gold = goldenIds();
      const gouden = CRM.kandidaten().filter(c => !geanonimiseerd(c) && gold.has(String(c.id)));
      const gg = groepeerOpPlaats(gouden, 'woonplaats');
      gg.op.forEach(g => g.leden.forEach((c, i) => {
        const p = spreid(g.coord, i, g.leden.length, 0.014);
        punten.push(p);
        const aan = sel.gold === String(c.id);
        if(aan) zoomNaar = buurt(g.coord);
        L.circleMarker(p, {radius:aan?9:6, color:K.gold, weight:aan?3:2, fillColor:K.gold, fillOpacity:.8})
          .bindTooltip(h(c.naam||'?'), {direction:'top', offset:[0,-6]})
          .on('click', () => { sel.gold = String(c.id); teken(); })
          .addTo(laag);
      }));
      legenda.push([K.gold,'golden candidate'], [K.olive,'open vacature']);
    }

    $('#s2_legenda').innerHTML = legenda.map(([kleur, tekst]) =>
      `<span class="src-leg"><i class="src-dot" style="background:${kleur}"></i>${h(tekst)}</span>`).join('');

    const fit = [S.modus, S.radius, ix.kands.length, ix.vacs.length,
                 sel[S.modus === 'vraag' ? 'vraag' : S.modus === 'wit' ? 'wit' : 'gold']].join('|');
    if(fit !== laatsteFit){
      laatsteFit = fit;
      const doel = zoomNaar || (punten.length ? punten : null);
      if(doel){ try{ map.fitBounds(L.latLngBounds(doel).pad(0.12), {maxZoom:11}); }catch(e){} }
      else map.setView(NL_MIDDEN, 8);
    }
  }

  /* ─── Bediening ─────────────────────────────────────────────── */
  const modusSeg = acties && acties.querySelector('#s2_modus');
  if(modusSeg) modusSeg.querySelectorAll('button').forEach(b => b.onclick = () => {
    zetS('modus', b.dataset.m);
    /* Zoeken heeft een heel ander scherm (geen kaart, geen rail), dus dat is
       een volledige hertekening in plaats van alleen andere inhoud. */
    if(S.modus === 'zoek'){ tekenModule(mount, acties, {}); return; }
    modusSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    toonMeer = 25;
    teken();
  });
  const radSeg = $('#s2_radius');
  radSeg.querySelectorAll('button').forEach(b => b.onclick = () => {
    zetS('radius', Number(b.dataset.r));
    radSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    teken();
  });
  const filknop = $('#s2_filknop');
  filknop.onclick = () => {
    filtersOpen = !filtersOpen;
    zetS('open', filtersOpen);
    $('#s2_fil').style.display = filtersOpen ? '' : 'none';
    filknop.textContent = filtersOpen ? 'Filters verbergen' : 'Filters tonen';
    filknop.setAttribute('aria-expanded', String(filtersOpen));
    setTimeout(() => { try{ if(map) map.invalidateSize(); }catch(e){} }, 60);
  };
  mount.querySelectorAll('[data-sf]').forEach(el => {
    const k = el.dataset.sf;
    const pas = () => { zetS(k, k === 'ster' ? Number(el.value)||0 : el.value); toonMeer = 25; teken(); };
    if(el.tagName === 'SELECT') el.onchange = pas; else el.oninput = CRM.debounce(pas, 300);
  });

  /* Eerst alles tekenen zónder kaart. Valt de CDN om, dan blijft het scherm
     bruikbaar — die situatie heeft dit project al een keer een leeg scherm
     gekost. */
  teken();

  laadLeaflet().then(lib => {
    if(mijnNr !== renderNr) return;                      // er loopt inmiddels een nieuwere render
    if(!mount.isConnected || !$('#s2_map')) return;      // gebruiker is al weg
    L = lib;
    $('#s2_map').innerHTML = '';
    /* preferCanvas: met een paar honderd kandidaten tekent Leaflet anders net
       zoveel losse SVG-elementen, en dan duurt één hertekening honderden
       milliseconden. Op canvas is dat een fractie daarvan. Gemeten met 800
       kandidaten, 60 vacatures en 250 klanten. */
    map = L.map($('#s2_map'), {scrollWheelZoom:true, zoomControl:true, preferCanvas:true});
    L.tileLayer(OSM.url, OSM.opts).addTo(map);
    map.setView(NL_MIDDEN, 9);
    laag = L.layerGroup().addTo(map);
    mount._srcMap = map;
    /* Links in Leaflet-popups werken via delegatie (popup-DOM is vluchtig). */
    map.on('popupopen', ev => {
      const el = ev.popup.getElement(); if(!el) return;
      el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => {
        e.preventDefault(); CRM.ga('kandidaten', {id:a.dataset.kand});
      });
    });
    setTimeout(() => { try{ map.invalidateSize(); }catch(e){} }, 60);
    teken();
  }).catch(e => {
    if(mijnNr !== renderNr) return;
    const el = $('#s2_map'); if(!el) return;
    /* Het kaartvlak krimpt mee: een melding van drie regels in een vak van
       560 hoog leest als een kapot scherm. */
    mount.querySelector('.src2-kaartcard')?.classList.add('geenkaart');
    el.innerHTML = `<div class="note warn src2-geenkaart">De kaart kon niet geladen worden — ${h(e.message)}.
      De lijsten hiernaast en de afstanden kloppen gewoon; alleen het plaatje ontbreekt.
      Controleer je internetverbinding en ververs de pagina.</div>`;
  });
}

/* ═══════════════════════════════════════════════════════════════
   ZOEKEN — DE KAARTENBAK DOORZOEKEN
   ═══════════════════════════════════════════════════════════════
   Sinds 1 aug 2026 gebeurt het uitgebreide zoeken op kandidaten hier en
   nergens anders. De kandidatenlijst is teruggebracht tot naam, status en
   sortering; wie meer wil weten dan dat, komt hierheen. Reden: sourcing
   gaat over kandidaten, en zoeken zonder te kunnen doorpakken naar een
   vacature levert alleen een lijst op. Vandaar dat elke regel hier eindigt
   bij de beste openstaande vacature mét de reden waarom hij past of niet.

   TWEE DINGEN DIE HIER NOOIT MOGEN GEBEUREN
   1. Iemand stilzwijgend wegfilteren. Van de 355 kandidaten komen er 236
      uit een oude ATS-import zonder fase en vaak zonder functie. Een leeg
      veld is dus normaal en mag nooit een reden zijn om iemand niet te
      tonen: alleen een ingevuld filter filtert.
   2. Een score zonder reden tonen. 62% zegt niets; "62%, maar de VCA is
      verlopen" zegt alles. Daarom staan blokkers en twijfels in de regel
      zelf en niet achter een tooltip.
   ═══════════════════════════════════════════════════════════════ */
const ZKEY = 'crm_source_zoek';
const STRALEN = [10, 15, 25, 40, 60, 100];
const ZSORT = [{k:'match', l:'Beste match'}, {k:'afstand', l:'Afstand'},
               {k:'stil', l:'Langst niet gesproken'}, {k:'naam', l:'Naam'}];
/* Wat er achter "Meer verfijnen" zit. Staat hier één van deze aan, dan klapt
   dat blok vanzelf open — anders zoek je met een filter dat je niet ziet. */
const Z_EXTRA = ['cert','taal','ploegen','vervoer','salaris','rijbewijs','rec','klant','fase','stil'];
const Z_STD = {vrij:'', functies:[], plaats:'', straal:25, pool:'alle', ster:0,
               cert:'', taal:'', ploegen:'', vervoer:'', salaris:'', rijbewijs:'',
               rec:'', klant:'', fase:'', stil:'', sort:'match', meer:false};
let Z = (() => {
  try{
    const uit = Object.assign({}, Z_STD, JSON.parse(localStorage.getItem(ZKEY)||'{}'));
    /* Wat uit localStorage komt is gebruikersinvoer van gisteren: controleren,
       niet vertrouwen. Eén rare waarde mag het scherm niet stukmaken. */
    uit.functies = (Array.isArray(uit.functies) ? uit.functies : [])
      .map(x => String(x||'').trim()).filter(Boolean).slice(0, 8);
    uit.straal = STRALEN.includes(Number(uit.straal)) ? Number(uit.straal) : Z_STD.straal;
    if(!POOLS.some(p => p.k === uit.pool)) uit.pool = Z_STD.pool;
    if(!ZSORT.some(s => s.k === uit.sort)) uit.sort = Z_STD.sort;
    uit.ster = Math.max(0, Math.min(5, Number(uit.ster)||0));
    Object.keys(Z_STD).forEach(k => { if(typeof Z_STD[k] === 'string') uit[k] = String(uit[k]==null?'':uit[k]); });
    return uit;
  }catch(e){ return Object.assign({}, Z_STD); }
})();
function zetZ(k, v){ Z[k] = v; try{ localStorage.setItem(ZKEY, JSON.stringify(Z)); }catch(e){} }
let zMeer = 25;

const plat = s => String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const functieTekst = c => plat(String(c.functie||'') + ' ' + String((c.cv && c.cv.functie)||''));

function inPoolZ(c){
  if(Z.pool === 'alle') return true;
  const voorraad = CRM.klaarOmVoorTeStellen(c), besch = CRM.isBeschikbaar(c);
  if(Z.pool === 'voorraad')    return voorraad;
  if(Z.pool === 'beschikbaar') return besch;
  return voorraad || besch;
}

/* ─── Beste openstaande vacature per kandidaat ─────────────────
   Dit is het dure stuk: elke kandidaat tegen elke open vacature is bij 355
   mensen en 50 vacatures bijna 18.000 matchberekeningen. Tijdens het typen
   in een zoekveld gebeurt dat anders bij élke toetsaanslag opnieuw, terwijl
   het antwoord niet verandert — de vacatures blijven gelijk. Daarom één
   cache per keer dat het scherm opengaat; filteren wordt dan gratis. */
let _besteCache = new Map();
function besteMatchIndex(){
  const vacs = openVacs();
  return c => {
    const k = String(c.id);
    if(_besteCache.has(k)) return _besteCache.get(k);
    let beste = null;
    for(const v of vacs){
      const m = CRM.match(c, v);
      if(!beste){ beste = {v, m}; continue; }
      /* Zelfde rangorde als CRM.besteMatches: eerst wie zonder streep door de
         rekening komt, dan de score, dan wie we het best kennen. */
      const oud = beste.m.blokkers.length ? 1 : 0, nieuw = m.blokkers.length ? 1 : 0;
      if(nieuw < oud || (nieuw === oud && (m.score > beste.m.score
        || (m.score === beste.m.score && m.onbekend.length < beste.m.onbekend.length)))) beste = {v, m};
    }
    _besteCache.set(k, beste);
    return beste;
  };
}

/* ─── Suggestielijsten uit de échte data ──────────────────────── */
/* Alleen wat er werkelijk in het bestand staat. Een lijst met verzonnen
   functietitels laat je zoeken naar mensen die er niet zijn. */
function telWaarden(kands, uitVan){
  const tel = new Map();
  kands.forEach(c => uitVan(c).forEach(ruw => {
    const s = String(ruw||'').trim(); if(!s) return;
    const k = plat(s), b = tel.get(k);
    if(b) b.n++; else tel.set(k, {naam:s, n:1});
  }));
  return Array.from(tel.values()).sort((a,b) => b.n - a.n || a.naam.localeCompare(b.naam,'nl'));
}
const datalistHtml = (id, rijen, max=150) => `<datalist id="${id}">${
  rijen.slice(0, max).map(r => `<option value="${h(r.naam)}"></option>`).join('')}</datalist>`;

/* ─── Zoeken ──────────────────────────────────────────────────── */
function zoekResultaat(){
  const t0 = performance.now();
  bouwContactIndex();
  const alle = CRM.kandidaten().filter(c => !geanonimiseerd(c));

  const termen  = Z.functies.map(plat).filter(Boolean);
  const woorden = plat(Z.vrij).split(/\s+/).filter(Boolean);
  const basis   = Z.plaats.trim() ? plaatsPunt(Z.plaats) : null;
  const drempel = Z.stil === '14' ? 14 : Z.stil === '30' ? 30 : 0;

  /* Afstand één keer per woonplaats, niet één keer per kandidaat: in een
     bestand van 355 mensen staan een paar honderd verschillende plaatsen,
     maar de meesten wonen in dezelfde tientallen. */
  const kmCache = new Map();
  const kmVan = ruw => {
    const w = String(ruw||'').trim(); if(!w) return null;
    if(kmCache.has(w)) return kmCache.get(w);
    const p = plaatsPunt(w);
    const km = p ? kmTussen(basis.coord, p.coord) : null;
    kmCache.set(w, km); return km;
  };

  let buitenStraal = 0, plaatsOnbekend = 0;
  const rijen = [];
  alle.forEach(c => {
    if(!inPoolZ(c)) return;
    if(Z.ster > 0 && (Number(c.ster)||0) < Z.ster) return;
    /* Meerdere functies is OF: niemand heeft twee functietitels op zijn kaart
       staan, dus EN zou altijd nul opleveren. */
    if(termen.length){ const ft = functieTekst(c); if(!termen.some(t => ft.includes(t))) return; }
    if(woorden.length){
      const bak = plat([c.naam, c.functie, c.cv && c.cv.functie, c.woonplaats].filter(Boolean).join(' '));
      if(!woorden.every(w => bak.includes(w))) return;
    }
    if(Z.cert && !certMatch(c, Z.cert)) return;
    if(Z.taal && !taalMatch(c.talen, Z.taal)) return;
    if(Z.ploegen && !(c.ploegen === Z.ploegen || (Z.ploegen !== 'geen' && c.ploegen === 'wisselend'))) return;
    if(Z.vervoer && c.vervoer !== Z.vervoer) return;
    if(Z.salaris && c.maandloon != null && Number(c.maandloon) > Number(Z.salaris)) return;
    if(Z.rijbewijs && !plat(c.rijbewijs).includes(plat(Z.rijbewijs))) return;
    if(Z.rec && c.rec !== Z.rec) return;
    if(Z.klant && !plat(c.klant).includes(plat(Z.klant))) return;
    if(Z.fase){
      /* Een leeg fase-veld is geen fout maar de normale toestand van een
         ATS-import. Daarom een eigen keuze in plaats van onvindbaar. */
      if(Z.fase === '_leeg'){ if(String(c.fase||'').trim()) return; }
      else if(!CRM.faseIs(c.fase, Z.fase)) return;
    }
    const st = stilte(c);
    if(Z.stil === 'nooit' && !st.nooit) return;
    /* Wie nog nooit gesproken is, is per definitie langer dan een maand niet
       gesproken — die hoort dus ook in "langer dan" thuis. */
    if(drempel && !st.nooit && !((st.dagen||0) >= drempel)) return;

    let km = null;
    if(basis){
      km = kmVan(c.woonplaats);
      if(km == null){ plaatsOnbekend++; return; }
      if(km > Z.straal){ buitenStraal++; return; }
    }
    rijen.push({c, km, st});
  });

  const besteVan = besteMatchIndex();
  /* Op match sorteren kan alleen als je van iedereen de beste match kent.
     Dankzij de cache kost dat één keer werk en daarna niets meer. */
  if(Z.sort === 'match') rijen.forEach(r => { r.beste = besteVan(r.c); });

  const ster = r => Number(r.c.ster)||0;
  if(Z.sort === 'afstand')     rijen.sort((a,b) => (a.km==null?1e9:a.km) - (b.km==null?1e9:b.km) || ster(b) - ster(a));
  else if(Z.sort === 'stil')   rijen.sort((a,b) => (b.st.dagen ?? -1) - (a.st.dagen ?? -1));
  else if(Z.sort === 'naam')   rijen.sort((a,b) => String(a.c.naam||'').localeCompare(String(b.c.naam||''),'nl'));
  else {
    const blok  = r => r.beste && r.beste.m.blokkers.length ? 1 : 0;
    const score = r => r.beste ? r.beste.m.score : -1;
    rijen.sort((a,b) => blok(a) - blok(b) || score(b) - score(a) || ster(b) - ster(a));
  }

  return {rijen, totaal:alle.length, buitenStraal, plaatsOnbekend, besteVan,
          ms:Math.round((performance.now() - t0) * 10) / 10};
}

/* ─── Het zoekscherm ──────────────────────────────────────────── */
function tekenZoek(mount, acties){
  /* Er kan nog een kaart uit de dekkingsmodus in dit mount-punt hangen; die
     hoort weg te zijn vóór we de boel overschrijven, anders blijft Leaflet
     aan losse DOM hangen. Het volgnummer stopt bovendien een render die nog
     op de CDN staat te wachten. */
  ++renderNr;
  if(mount._srcMap){ try{ mount._srcMap.remove(); }catch(e){} mount._srcMap = null; }
  _besteCache = new Map();
  zMeer = 25;

  const kands = CRM.kandidaten().filter(c => !geanonimiseerd(c));
  const functies  = telWaarden(kands, c => [c.functie, c.cv && c.cv.functie]);
  const plaatsen  = telWaarden(kands, c => [c.woonplaats]);
  const rijbewijs = telWaarden(kands, c => [c.rijbewijs]);
  const klanten   = telWaarden(kands, c => [c.klant]);
  const recs      = telWaarden(kands, c => [c.rec]);
  const extraAan  = () => Z_EXTRA.filter(k => String(Z[k]||'').trim()).length;
  let extraOpen   = Z.meer || extraAan() > 0;

  if(acties) acties.innerHTML = `<div class="seg" id="s2_modus">${
    MODI.map(m => `<button data-m="${m.k}" class="${S.modus===m.k?'on':''}" title="${h(m.titel)}">${h(m.lbl)}</button>`).join('')}</div>`;

  const sel2 = (naam, waarde, opties) => `<select data-zf="${naam}">${opties.map(o =>
    `<option value="${h(o.k)}"${String(waarde) === String(o.k) ? ' selected' : ''}>${h(o.l)}</option>`).join('')}</select>`;

  mount.innerHTML = `
    <div class="stack src3">
      <div class="card pad src3-zoek">
        <div class="searchbox src3-vrij">
          <input type="text" id="z_vrij" value="${h(Z.vrij)}" autocomplete="off"
            placeholder="Zoek op naam, functie of woonplaats" aria-label="Vrij zoeken">
        </div>

        <div class="src3-basis">
          <div class="f-row src3-fnc">
            <label for="z_finput">Functies</label>
            <div class="src3-chips" id="z_chips"></div>
            <div class="hint" id="z_fhint"></div>
          </div>
          <div class="f-row">
            <label for="z_plaats">Woont binnen</label>
            <div class="row tight src3-straal">
              ${sel2('straal', Z.straal, STRALEN.map(k => ({k, l:k + ' km'})))}
              <span class="meta">van</span>
              <input type="text" id="z_plaats" list="z_plaatslijst" value="${h(Z.plaats)}"
                placeholder="plaats" autocomplete="off" aria-label="Plaats om vanaf te meten">
            </div>
          </div>
          <div class="f-row"><label>Welke kandidaten</label>
            ${sel2('pool', Z.pool, POOLS.map(p => ({k:p.k, l:p.lbl})))}</div>
          <div class="f-row"><label>Minimaal sterren</label>
            ${sel2('ster', Z.ster, [{k:0, l:'Alle'}].concat([1,2,3,4,5].map(n =>
              ({k:n, l:'★'.repeat(n) + (n < 5 ? ' of meer' : '')}))))}</div>
        </div>

        <div class="src3-meerbalk">
          <button class="btn ghost sm" id="z_meerknop" aria-expanded="${extraOpen}" aria-controls="z_extra"></button>
          <span class="meta" id="z_meertel"></span>
          <span class="spacer"></span>
          <button class="btn sub sm" id="z_wis">Alles wissen</button>
        </div>
        <div class="src3-extra" id="z_extra" style="${extraOpen?'':'display:none'}">
          <div class="src-fgrid">
            <div class="f-row"><label>Certificaat of rijbewijs</label>
              <input type="text" data-zf="cert" value="${h(Z.cert)}" placeholder="bv. heftruck of VCA"></div>
            <div class="f-row"><label>Taal</label>
              <input type="text" data-zf="taal" value="${h(Z.taal)}" placeholder="bv. Nederlands of PL"></div>
            <div class="f-row"><label>Rijbewijs</label>
              <input type="text" data-zf="rijbewijs" list="z_rblijst" value="${h(Z.rijbewijs)}" placeholder="bv. B"></div>
            <div class="f-row"><label>Ploegendiensten</label>
              ${sel2('ploegen', Z.ploegen, [{k:'', l:'Alle'}].concat(CRM.PLOEGEN.map(p => ({k:p, l:p}))))}</div>
            <div class="f-row"><label>Eigen vervoer</label>
              ${sel2('vervoer', Z.vervoer, [{k:'', l:'Alle'}].concat(CRM.VERVOER.map(p => ({k:p, l:p}))))}</div>
            <div class="f-row"><label>Maandloon max.</label>
              <input type="number" data-zf="salaris" value="${h(Z.salaris)}" placeholder="bv. 3200"></div>
            <div class="f-row"><label>Laatst gesproken</label>
              ${sel2('stil', Z.stil, [{k:'', l:'Maakt niet uit'}, {k:'14', l:'Langer dan 2 weken geleden'},
                {k:'30', l:'Langer dan een maand geleden'}, {k:'nooit', l:'Nog nooit gesproken'}])}</div>
            <div class="f-row"><label>Recruiter</label>
              ${sel2('rec', Z.rec, [{k:'', l:'Iedereen'}].concat(recs.map(r => ({k:r.naam, l:r.naam + ' (' + r.n + ')'}))))}</div>
            <div class="f-row"><label>Klant</label>
              <input type="text" data-zf="klant" list="z_klantlijst" value="${h(Z.klant)}" placeholder="bedrijfsnaam"></div>
            <div class="f-row"><label>Fase</label>
              ${sel2('fase', Z.fase, [{k:'', l:'Alle fases'}, {k:'_leeg', l:'Zonder fase (import)'}]
                .concat(CRM.ALLE_FASES.map(f => ({k:f.k, l:f.k}))))}</div>
          </div>
        </div>
        ${datalistHtml('z_functielijst', functies)}
        ${datalistHtml('z_plaatslijst', plaatsen)}
        ${datalistHtml('z_rblijst', rijbewijs, 40)}
        ${datalistHtml('z_klantlijst', klanten)}
      </div>

      <div class="row src3-reskop">
        <span class="label" id="z_tel"></span>
        <span class="spacer"></span>
        <div class="seg" id="z_sort">${ZSORT.map(o =>
          `<button data-s="${o.k}" class="${Z.sort===o.k?'on':''}">${h(o.l)}</button>`).join('')}</div>
      </div>
      <p class="meta src3-noot" id="z_noot"></p>
      <div id="z_res"></div>
    </div>`;

  const $ = s => mount.querySelector(s);

  /* ─── Functiechips ─────────────────────────────────────────── */
  function tekenChips(focus){
    $('#z_chips').innerHTML = `${Z.functies.map((f, i) =>
        `<button class="chip btn-like src3-chip" data-fweg="${i}" title="Klik om weg te halen">${h(f)} <span aria-hidden="true">×</span></button>`).join('')}
      <input type="text" id="z_finput" list="z_functielijst" autocomplete="off"
        placeholder="${Z.functies.length ? 'nog een functie…' : 'typ een functie en druk op Enter'}"
        aria-label="Functie toevoegen">`;
    /* Pas uitleggen dat het OF is zodra er twee staan: daarvóór is het een
       antwoord op een vraag die niemand gesteld heeft. */
    $('#z_fhint').textContent = Z.functies.length > 1
      ? 'We zoeken op elk van deze functies apart — niet op iemand die ze allemaal doet.' : '';
    const inp = $('#z_finput');
    const voegToe = ruw => {
      const v = String(ruw||'').trim();
      if(!v) return;
      if(Z.functies.length >= 8){ CRM.toast('Acht functies tegelijk is genoeg', 'err'); return; }
      if(Z.functies.some(x => plat(x) === plat(v))){ inp.value = ''; return; }
      zetZ('functies', Z.functies.concat(v));
      zMeer = 25;
      tekenChips(true); tekenLijst();
    };
    inp.onkeydown = e => {
      if(e.key === 'Enter'){ e.preventDefault(); voegToe(inp.value); }
      /* Backspace in een leeg veld haalt de laatste chip weg — dat verwacht
         iedereen die ooit een mailadres in een to-veld heeft getypt. */
      else if(e.key === 'Backspace' && !inp.value && Z.functies.length){
        zetZ('functies', Z.functies.slice(0, -1)); zMeer = 25; tekenChips(true); tekenLijst();
      }
    };
    /* Een suggestie aanklikken geeft geen Enter, wel een change. */
    inp.onchange = () => voegToe(inp.value);
    $('#z_chips').querySelectorAll('[data-fweg]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.fweg);
      zetZ('functies', Z.functies.filter((x, j) => j !== i));
      zMeer = 25; tekenChips(true); tekenLijst();
    });
    if(focus){ inp.value = ''; inp.focus(); }
  }

  /* ─── Eén kandidaatregel ───────────────────────────────────── */
  function zoekRij(r, besteVan){
    const c = r.c, st = r.st;
    const beste = r.beste !== undefined ? r.beste : besteVan(c);
    const gold = goldenIds().has(String(c.id));
    const tel = String(c.telefoon||'').trim();
    const fase = String(c.fase||'').trim();
    const score = beste ? beste.m.score : null;
    const kleur = !beste ? '' : beste.m.blokkers.length ? 'red' : score >= 70 ? 'green' : score >= 50 ? '' : 'amber';

    /* Onder de 25% is het geen suggestie meer maar ruis. Wel benoemen wat de
       beste dan wél was — anders lijkt het alsof we niets gekeken hebben. */
    const zwak = beste && score < 25;
    const matchHtml = !beste
      ? `<div class="src3-geenmatch">Er staat geen openstaande vacature om tegen te matchen.</div>`
      : `<div class="src3-match${zwak?' zwak':''}">
          <div class="src3-match-t">
            <span class="chip ${kleur}"><span class="num">${score}%</span></span>
            <b>${h(beste.v.functie||'Vacature zonder functie')}</b>
            <span class="src3-match-s">${h(beste.v.klant||'—')} · ${h(beste.v.locatie||'—')}${
              beste.m.km != null ? ` · <span class="num">${beste.m.km}</span> km` : ''}</span>
          </div>
          ${zwak ? `<div class="src3-onbekend">Dit is de best passende openstaande vacature, en die past dus eigenlijk niet.</div>` : ''}
          ${beste.m.blokkers.length ? `<div class="src2-blok">Hier gaat het op stuk: ${h(beste.m.blokkers.join(' · '))}</div>` : ''}
          ${beste.m.twijfels.length ? `<div class="src2-twijfel">Let op: ${h(beste.m.twijfels.join(' · '))}</div>` : ''}
          ${!beste.m.blokkers.length && !beste.m.twijfels.length && beste.m.plussen.length
            ? `<div class="src3-plus">Past op: ${h(beste.m.plussen.slice(0,3).join(' · '))}</div>` : ''}
        </div>`;

    return `<div class="src3-rij">
      <div class="src3-rij-t">
        <a href="#kandidaten/${encodeURIComponent(c.id)}" data-kand="${h(String(c.id))}"><b>${h(c.naam||'Naam onbekend')}</b></a>
        ${gold ? '<span class="src2-goud" title="Golden candidate">★</span>' : ''}
        ${sterHtml(c.ster)}
        <span class="spacer"></span>
        ${r.km != null ? `<span class="chip"><span class="num">${r.km}</span> km</span>` : ''}
        ${st.dagen != null ? `<span class="chip ${st.kleur}">${h(st.tekst)}</span>` : ''}
      </div>
      <div class="src3-rij-s">${h(c.functie || (c.cv && c.cv.functie) || 'geen functie ingevuld')}
        · ${h(c.woonplaats||'woonplaats onbekend')}${fase ? ' · ' + h(fase) : ''}${
        c.klant ? ' · ' + h(c.klant) : ''}</div>
      ${matchHtml}
      <div class="row tight src3-rij-a">
        ${tel ? `<a class="btn sub sm" href="${h(telLink(tel))}">Bellen</a>` : ''}
        <a class="btn sub sm" href="#kandidaten/${encodeURIComponent(c.id)}" data-kand="${h(String(c.id))}">Kandidatenkaart</a>
        ${beste ? `<button class="btn sub sm" data-vac="${h(String(beste.v.id))}">Bekijk deze vacature</button>` : ''}
        <button class="btn sub sm" data-alle="${h(String(c.id))}">Alle matches</button>
      </div>
    </div>`;
  }

  /* ─── De resultatenlijst ───────────────────────────────────── */
  function tekenLijst(){
    if(!mount.isConnected) return;
    const u = zoekResultaat();
    mount.dataset.rekentijdMs = u.ms;

    $('#z_tel').innerHTML = `<span class="num">${u.rijen.length}</span> van <span class="num">${u.totaal}</span> kandidaten`;
    const noot = [];
    if(Z.plaats.trim() && !plaatsPunt(Z.plaats))
      noot.push(`De plaats "${h(Z.plaats.trim())}" staat niet in de afstandentabel, dus er valt niets te meten — het straalfilter doet nu niets.`);
    else if(u.plaatsOnbekend)
      noot.push(`${u.plaatsOnbekend} kandidaten vallen buiten dit lijstje omdat hun woonplaats leeg is of niet in de afstandentabel staat. Haal het straalfilter weg om ze wel te zien.`);
    if(Z.sort === 'match' && !openVacs().length)
      noot.push('Er staat geen enkele vacature open, dus er valt niets te matchen.');
    $('#z_noot').innerHTML = noot.join(' ');
    $('#z_meertel').textContent = extraAan() ? extraAan() + ' extra filter' + (extraAan()===1?'':'s') + ' aan' : '';

    const el = $('#z_res');
    if(!u.rijen.length){
      el.innerHTML = `<div class="card pad">${CRM.ui.leeg('Niemand gevonden',
        'Haal een filter weg of verruim de straal. Let op: een kandidaat zonder functie of zonder fase valt hier niet vanzelf af — alleen een ingevuld filter filtert.')}</div>`;
      return;
    }
    const zichtbaar = u.rijen.slice(0, zMeer);
    el.innerHTML = `<div class="src3-lijst">${zichtbaar.map(r => zoekRij(r, u.besteVan)).join('')}</div>
      ${u.rijen.length > zichtbaar.length
        ? `<button class="btn ghost sm block" id="z_meerres" style="margin-top:12px">Toon de volgende ${
            Math.min(50, u.rijen.length - zichtbaar.length)} van ${u.rijen.length}</button>` : ''}`;

    el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => {
      e.preventDefault(); CRM.ga('kandidaten', {id:a.dataset.kand});
    });
    el.querySelectorAll('[data-vac]').forEach(b => b.onclick = () => {
      /* Doorpakken: de dekkingsweergave van díé vacature, met deze kandidaat
         ertussen. Dat is de matchweergave die dit scherm al had. */
      zetS('modus', 'vraag');
      sel.vraag = String(b.dataset.vac);
      toonMeer = 25;
      tekenModule(mount, acties, {});
    });
    el.querySelectorAll('[data-alle]').forEach(b => b.onclick = () => toonAlleMatches(b.dataset.alle));
    const meer = el.querySelector('#z_meerres');
    if(meer) meer.onclick = () => { zMeer += 50; tekenLijst(); };
  }

  /* ─── Alle matches van één kandidaat ───────────────────────── */
  function toonAlleMatches(id){
    const c = CRM.kandidaat(id);
    if(!c) return;
    const lijst = CRM.besteMatches(c, 8);
    CRM.drawer.open(`
      <div class="drawer-h">
        <div style="min-width:0;flex:1">
          <div class="h2" style="font-size:17px">${h(c.naam||'Kandidaat')}</div>
          <div class="meta" style="margin-top:3px">${h(c.functie||'geen functie ingevuld')} · ${h(c.woonplaats||'woonplaats onbekend')}</div>
        </div>
        <button class="btn ghost sm x" data-close>Sluiten</button>
      </div>
      <div class="drawer-b">
        <p class="sub" style="margin-top:0">Openstaande vacatures die bij deze kandidaat passen, beste eerst.
          Wat eronder staat is de reden — een score zonder reden is niets waard.</p>
        ${lijst.length ? `<div class="src2-vaclijst">${lijst.map(x => `
          <div class="src3-drrij">
            <div class="src3-match-t">
              <span class="chip ${x.m.blokkers.length?'red':x.score>=70?'green':x.score>=50?'':'amber'}"><span class="num">${x.score}%</span></span>
              <b>${h(x.vacature.functie||'Vacature')}</b>
              <span class="src3-match-s">${h(x.vacature.klant||'—')} · ${h(x.vacature.locatie||'—')}${
                x.m.km != null ? ` · <span class="num">${x.m.km}</span> km` : ''}</span>
            </div>
            ${x.m.blokkers.length ? `<div class="src2-blok">Hier gaat het op stuk: ${h(x.m.blokkers.join(' · '))}</div>` : ''}
            ${x.m.twijfels.length ? `<div class="src2-twijfel">Let op: ${h(x.m.twijfels.join(' · '))}</div>` : ''}
            ${x.m.onbekend.length ? `<div class="src2-onbekend">Niet bekend: ${h(x.m.onbekend.slice(0,3).join(' · '))}</div>` : ''}
            <div class="row tight" style="margin-top:8px">
              <button class="btn sub sm" data-drvac="${h(String(x.vacature.id))}">Wie woont er nog meer in de buurt</button>
            </div>
          </div>`).join('')}</div>`
        : CRM.ui.leeg('Geen passende vacature',
            'Er staat op dit moment niets open waar deze kandidaat op uitkomt. Markeer hem als golden candidate, dan komt hij terug zodra dat verandert.')}
      </div>`, {onOpen(dr){
        dr.querySelectorAll('[data-drvac]').forEach(b => b.onclick = () => {
          CRM.drawer.close();
          zetS('modus', 'vraag');
          sel.vraag = String(b.dataset.drvac);
          toonMeer = 25;
          tekenModule(mount, acties, {});
        });
      }});
  }

  /* ─── Bediening ────────────────────────────────────────────── */
  const modusSeg = acties && acties.querySelector('#s2_modus');
  if(modusSeg) modusSeg.querySelectorAll('button').forEach(b => b.onclick = () => {
    zetS('modus', b.dataset.m);
    tekenModule(mount, acties, {});
  });

  const vrij = $('#z_vrij');
  vrij.oninput = CRM.debounce(() => { zetZ('vrij', vrij.value); zMeer = 25; tekenLijst(); }, 250);

  const plaatsIn = $('#z_plaats');
  plaatsIn.oninput = CRM.debounce(() => { zetZ('plaats', plaatsIn.value); zMeer = 25; tekenLijst(); }, 250);

  mount.querySelectorAll('[data-zf]').forEach(el => {
    const k = el.dataset.zf;
    const pas = () => {
      zetZ(k, k === 'ster' || k === 'straal' ? Number(el.value)||0 : el.value);
      zMeer = 25;
      tekenLijst();
    };
    if(el.tagName === 'SELECT') el.onchange = pas; else el.oninput = CRM.debounce(pas, 250);
  });

  const meerknop = $('#z_meerknop');
  const zetMeerknop = () => {
    meerknop.textContent = extraOpen ? 'Minder verfijnen' : 'Meer verfijnen';
    meerknop.setAttribute('aria-expanded', String(extraOpen));
  };
  meerknop.onclick = () => {
    extraOpen = !extraOpen;
    zetZ('meer', extraOpen);
    $('#z_extra').style.display = extraOpen ? '' : 'none';
    zetMeerknop();
  };
  zetMeerknop();

  $('#z_wis').onclick = () => {
    /* De sortering is geen zoekcriterium maar een voorkeur — die blijft. */
    const sort = Z.sort;
    Z = Object.assign({}, Z_STD, {sort});
    try{ localStorage.setItem(ZKEY, JSON.stringify(Z)); }catch(e){}
    tekenZoek(mount, acties);
  };

  $('#z_sort').querySelectorAll('button').forEach(b => b.onclick = () => {
    zetZ('sort', b.dataset.s);
    $('#z_sort').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    tekenLijst();
  });

  tekenChips(false);
  tekenLijst();
}

/* ═══════════════════════════════════════════════════════════════
   BINNENKOMST
   Twee schermen onder één modulenaam. `params` mag hier zeggen waar je
   binnenkomt: Kandidaten stuurt door met CRM.ga('source', {modus:'zoek',
   q:'lasser'}) zodra iemand daar meer wil dan naam en status.
   ═══════════════════════════════════════════════════════════════ */
function tekenModule(mount, acties, params){
  params = params || {};
  if(params.modus && MODUS_KEYS.includes(params.modus)) zetS('modus', params.modus);
  if(params.q != null){ zetZ('vrij', String(params.q)); zetS('modus', 'zoek'); }
  /* Eenmalige instructie, geen blijvende toestand: zonder dit zou elke
     volgende hertekening (modus wisselen, realtime-sync) je terugzetten in
     de zoekmodus met dezelfde zoekterm, hoe ver je ook verder was. */
  delete params.modus; delete params.q;

  if(S.modus === 'zoek') tekenZoek(mount, acties);
  else tekenSourcing(mount, acties);
}

CRM.registerModule('source', {
  title:'Sourcing', icon:'◎',
  onderschrift:'Zoek in het kandidatenbestand, en zie waar vraag en aanbod elkaar missen',
  render(mount, acties, params){ tekenModule(mount, acties, params); }
});

})();

/* ─── VERZOEK AAN COORDINATOR ─────────────────────────────────────
   1. js/kandidaten.js heeft `laatstContact(c)`, `stilte(c)` en `taalMatch()`
      module-lokaal staan. Dit scherm heeft ze ook nodig en heeft ze nu voor
      de tweede keer opgeschreven (zelfde bron, zelfde regel). Zet ze één keer
      op CRM — bijvoorbeeld `CRM.stilte(c)` en `CRM.taalMatch(talen, zoek)` —
      dan kunnen beide kopieën weg. Hetzelfde geldt voor `telLink`/`waLink`,
      die inmiddels in drie bestanden staan.
   2. `CRM.PLAATSEN` en `CRM.afstandKm` (js/data.js) kennen de aliassen niet
      die dit bestand in PL_ALIAS bijhoudt ("The Hague", "Capelle a.d. IJssel",
      "Katwijk aan Zee", "Leidschenveen"). Daardoor rekent CRM.matchScore voor
      diezelfde kandidaat met een onbekende afstand, terwijl dit scherm hem wél
      kan plaatsen — de match komt dan lager uit dan hij hoort. De nette
      oplossing is die aliaslaag in data.js zetten, zodat de hele app dezelfde
      afstand ziet.
   3. `CRM.ga(key, params)` zet alleen `params.id` in de hash. De zoekmodus
      komt binnen via `CRM.ga('source', {modus:'zoek', q:'…'})` en dat werkt,
      maar zo'n zoekopdracht is niet te delen of te bookmarken en overleeft
      geen F5 — de gebruiker landt dan op `#source` en krijgt wat er in
      localStorage staat. Een tweede segment in de hash (bv.
      `#source/zoek:lasser`) zou dat oplossen voor elke module die meer dan
      één ding wil meegeven.
   4. Elke kandidaat tegen elke open vacature scoren (de "beste openstaande
      vacature" in de zoeklijst) kost bij 355 kandidaten × 50 vacatures ~80 ms.
      Dit bestand cachet dat zelf per schermbezoek. Dashboard en Kandidaten
      willen hetzelfde getal; als het vaker nodig blijkt, hoort die cache op
      CRM (bv. `CRM.besteMatch(kandidaat)`) en niet drie keer los.
   5. Vacatures zonder `locatie` vallen terug op de locatie van de klant. Staat
      die ook leeg, dan doet de vacature nergens in dit scherm mee. In de
      importdata heeft een flink deel van de klanten geen locatie; dat is een
      datataak, geen codetaak, maar het beperkt wel wat dit scherm kan zeggen.
   ───────────────────────────────────────────────────────────────── */
