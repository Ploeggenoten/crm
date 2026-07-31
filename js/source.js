/* ═══════════════════════════════════════════════════════════════
   MODULE-ONDERDEEL: SOURCE-KAART (kaart-engine op Leaflet)
   Eén exportfunctie: CRM.kaartRender(containerEl, {lens})
   - lens 'kandidaten' (Source-tab): actieve klanten als pinnen,
     gefilterde kandidaten als stippen; klik op een klant toont de
     best passende kandidaten binnen 30 km.
   - lens 'klanten': alle klanten, kleur per branche, pin-grootte
     naar plaatsingen; alleen bij CRM.canSeeMoney() ook omzet.
   Defensief: werkt in elke container, ruimt zijn Leaflet-instantie
   op bij een herrender en faalt netjes als de CDN niet laadt.
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
    s.onerror = () => { _leaflet = null; rej(new Error('Leaflet kon niet geladen worden (geen internet?)')); };
    document.head.appendChild(s);
  });
  return _leaflet;
}

/* ─── Filters van de Source-lens onthouden ────────────────────── */
const SKEY = 'crm_source_filters';
const S_STD = {ster:0, functie:'', rijbewijs:'', ploegen:'', salaris:'', status:'beschikbaar'};
let S = (() => {
  try{ return Object.assign({}, S_STD, JSON.parse(localStorage.getItem(SKEY)||'{}')); }
  catch(e){ return Object.assign({}, S_STD); }
})();
function zetS(k,v){ S[k]=v; try{ localStorage.setItem(SKEY, JSON.stringify(S)); }catch(e){} }

/* ─── Plaatsnamen: resolver met veilige varianten ───────────────
   CRM.PLAATSEN (data.js) is de bron van waarheid, maar de echte data
   schrijft plaatsen net anders op: "Katwijk aan Zee", "The Hague",
   "Capelle a.d. IJssel", "Leidschenveen", "Hellvoetsluis". Zulke rijen
   vielen meteen van de kaart én uit elk radiusfilter.
   Deze laag probeert eerst een paar varianten van DEZELFDE plaats.
   Nooit gokken op een buurgemeente: liever geen punt dan een fout punt.
   Wat hier via een alias binnenkomt hoort eigenlijk in CRM.PLAATSEN —
   zie het verzoek aan data.js onderaan dit bestand. */
const PL_ALIAS = {
  /* Engelse en verminkte schrijfwijzen */
  thehague:'denhaag', hague:'denhaag', sgravennage:'sgravenhage',
  hellvoetsluis:'hellevoetsluis', denbosch:'shertogenbosch', shertogenbos:'shertogenbosch',
  /* Wijken en deelgemeenten: dezelfde gemeente, andere naam */
  leidschenveen:'denhaag', ypenburg:'denhaag', scheveningen:'denhaag',
  loosduinen:'denhaag', wateringseveld:'denhaag',
  /* "a.d." schrijft plaatsSleutel niet om naar "a/d" */
  krimpenadijssel:'krimpena/dijssel', capelleadijssel:'capellea/dijssel',
  nieuwerkerkadijssel:'nieuwerkerka/dijssel', alphenadrijn:'alphena/drijn',
  koudekerkadrijn:'koudekerka/drijn'
};

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

/* Afstand met dezelfde resolver als de kaart. CRM.afstandKm kent de
   aliassen hierboven niet; zonder deze functie stond een klant wél op
   de kaart maar viel hij buiten elk radiusfilter — precies de
   verwarring die we hier oplossen. */
function afstandKm(a, b){
  const pa = plaatsPunt(a), pb = plaatsPunt(b);
  if(!pa || !pb) return null;
  const R = 6371, rad = d => d*Math.PI/180;
  const dLat = rad(pb.coord[0]-pa.coord[0]), dLon = rad(pb.coord[1]-pa.coord[1]);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(pa.coord[0]))*Math.cos(rad(pb.coord[0]))*Math.sin(dLon/2)**2;
  return Math.round(2*R*Math.asin(Math.sqrt(x)));
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
    if(!g) op.set(p.sleutel, g = {coord:p.coord, leden:[]});
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
    purple:v('--purple'), amber:v('--amber'), red:v('--red'), muted:v('--muted'), ink:v('--ink')
  };
}

const NL_MIDDEN = [52.05, 4.7];

/* Kandidaten die door de Source-filters komen.
   Let op: een lege fase is géén positie in de pijplijn. Geïmporteerde
   kandidaten uit het oude ATS hebben fase '' — CRM.isActiefLopend() geeft
   daar `true` op (leeg staat immers niet in CRM.DONE), dus we eisen hier
   expliciet een echte fase. Anders zou "Actief lopend" de hele importbak
   op de kaart zetten. */
function bronKandidaten(){
  return CRM.kandidaten().filter(c => {
    if(S.status === 'beschikbaar' && !CRM.isBeschikbaar(c))  return false;
    if(S.status === 'lopend'      && !(c.fase && CRM.isActiefLopend(c))) return false;
    if(S.ster > 0 && (Number(c.ster)||0) < S.ster) return false;
    if(S.functie && !String(c.functie||'').toLowerCase().includes(S.functie.trim().toLowerCase())) return false;
    if(S.rijbewijs && !String(c.rijbewijs||'').toLowerCase().includes(S.rijbewijs.trim().toLowerCase())) return false;
    if(S.ploegen && !(c.ploegen === S.ploegen || (S.ploegen !== 'geen' && c.ploegen === 'wisselend'))) return false;
    /* Salaris-max: onbekend maandloon laten we staan — alleen aantoonbaar
       te dure kandidaten vallen af. */
    if(S.salaris && c.maandloon != null && Number(c.maandloon) > Number(S.salaris)) return false;
    return true;
  });
}

const sterHtml = n => (Number(n)||0)
  ? `<span class="src-ster num">${h(CRM.sterren(n))}</span>` : '';

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

/* ═══════════════════════════════════════════════════════════════
   HOOFDINGANG
   ═══════════════════════════════════════════════════════════════ */
CRM.kaartRender = async function(container, opts){
  if(!container) return;
  const lens = (opts && opts.lens) === 'klanten' ? 'klanten' : 'kandidaten';

  /* Vorige instantie in deze container opruimen (herrender-veilig). */
  if(container._crmKaart){
    try{ container._crmKaart.map.remove(); }catch(e){}
    container._crmKaart = null;
  }

  const geld = lens === 'klanten' && CRM.canSeeMoney();
  let filtersOpen = window.innerWidth > 700;   // mobiel: filters standaard dicht
  let periode = 'jaar';                        // dit jaar | alles (alleen geld-laag)

  container.innerHTML = `
    <div class="stack src">
      <div class="card pad src-top">
        <div class="row">
          ${lens === 'kandidaten'
            ? `<button class="btn ghost sm" id="src_filknop">Filters</button>`
            : `<span class="sub">Alle klanten op de kaart — kleur is branche, grootte is ${geld?'omzet':'aantal plaatsingen'}.</span>`}
          ${geld ? `<div class="seg" id="src_periode">
              <button data-p="jaar" class="on">Dit jaar</button><button data-p="alles">Alles</button>
            </div>` : ''}
          <span class="spacer"></span>
          <span class="meta" id="src_telling"></span>
        </div>
        ${lens === 'kandidaten' ? `
        <div class="src-filters" id="src_fil" style="${filtersOpen?'':'display:none'}">
          <div class="src-fgrid">
            <div class="f-row"><label>Kandidaten</label>
              <select data-sf="status">
                <option value="beschikbaar"${S.status==='beschikbaar'?' selected':''}>Beschikbaar</option>
                <option value="lopend"${S.status==='lopend'?' selected':''}>Actief lopend</option>
                <option value="alle"${S.status==='alle'?' selected':''}>Alles</option>
              </select></div>
            <div class="f-row"><label>Minimaal sterren</label>
              <select data-sf="ster"><option value="0">Alle</option>
                ${[1,2,3,4,5].map(n=>`<option value="${n}"${S.ster===n?' selected':''}>${'★'.repeat(n)}${n<5?' of meer':''}</option>`).join('')}
              </select></div>
            <div class="f-row"><label>Functie</label>
              <input type="text" data-sf="functie" placeholder="bv. operator" value="${h(S.functie)}"></div>
            <div class="f-row"><label>Rijbewijs</label>
              <input type="text" data-sf="rijbewijs" placeholder="bv. B" value="${h(S.rijbewijs)}"></div>
            <div class="f-row"><label>Ploegendiensten</label>
              <select data-sf="ploegen"><option value="">Alle</option>
                ${CRM.PLOEGEN.map(p=>`<option value="${h(p)}"${S.ploegen===p?' selected':''}>${h(p)}</option>`).join('')}
              </select></div>
            <div class="f-row"><label>Maandloon max.</label>
              <input type="number" data-sf="salaris" placeholder="bv. 3200" value="${h(S.salaris)}"></div>
          </div>
        </div>` : ''}
      </div>
      <div class="card src-kaartwrap"><div class="src-kaart" id="src_map">${CRM.ui.laden('Kaart laden…')}</div></div>
      <div id="src_legenda"></div>
      <div class="meta" id="src_missend"></div>
      <div id="src_paneel"></div>
    </div>`;

  const $ = sel => container.querySelector(sel);

  let L;
  try{ L = await laadLeaflet(); }
  catch(e){
    const el = $('#src_map');
    if(el) el.innerHTML = `<div class="note err" style="margin:14px">De kaart kon niet geladen worden: ${h(e.message)}</div>`;
    return;
  }
  if(!container.isConnected || !$('#src_map')) return;   // gebruiker is al weg

  $('#src_map').innerHTML = '';
  const map = L.map($('#src_map'), {scrollWheelZoom:true, zoomControl:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:18,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers'
  }).addTo(map);
  map.setView(NL_MIDDEN, 9);
  const laag = L.layerGroup().addTo(map);
  container._crmKaart = {map};
  setTimeout(() => { try{ map.invalidateSize(); }catch(e){} }, 60);

  /* Links in Leaflet-popups werken via delegatie (popup-DOM is vluchtig). */
  map.on('popupopen', ev => {
    const el = ev.popup.getElement(); if(!el) return;
    el.querySelectorAll('[data-kand]').forEach(a => a.onclick = e => { e.preventDefault(); CRM.ga('kandidaten',{id:a.dataset.kand}); });
    el.querySelectorAll('[data-klantkaart]').forEach(a => a.onclick = e => { e.preventDefault(); CRM.ga('klanten',{id:a.dataset.klantkaart}); });
  });

  const K = themaKleuren();
  const omzet = geld ? await laadOmzet() : null;
  if(!container.isConnected) return;

  /* ─── Tekenen ─────────────────────────────────────────────── */
  const teken = () => {
    laag.clearLayers();
    $('#src_paneel').innerHTML = '';
    const punten = [];
    /* Wie niet op de kaart past, verdwijnt niet stilletjes: we splitsen
       "veld leeg" van "plaats staat niet in CRM.PLAATSEN" en tonen beide.
       Vroeger werden alle namen in één regel achter elkaar geplakt — met
       200+ klanten werd dat een muur van tekst. */
    let buiten = {zonder:[], onbekend:[]};
    const tekenBuiten = () => {
      const el = $('#src_missend'); if(!el) return;
      const n = buiten.zonder.length + buiten.onbekend.length;
      if(!n){ el.innerHTML = ''; return; }
      const plaatsen = telOnbekend(buiten.onbekend);
      const namenVan = p => buiten.onbekend
        .filter(x => CRM.plaatsSleutel(x.locatie) === CRM.plaatsSleutel(p.naam))
        .map(x => x.obj.naam).join(', ');
      const zl = buiten.zonder;
      el.innerHTML = `<details class="src-buiten">
        <summary>${n} klant${n===1?'':'en'} niet op de kaart${
          zl.length ? ` · ${zl.length} zonder locatie` : ''}${
          buiten.onbekend.length ? ` · ${buiten.onbekend.length} met een plaats die het systeem niet kent` : ''}</summary>
        ${plaatsen.length ? `<div class="src-buitenlijst">${plaatsen.map(p =>
            `<span class="chip" title="${h(namenVan(p))}">${h(p.naam)} <b class="num">${p.n}</b></span>`).join('')}</div>
          <p class="meta">Deze plaatsnamen staan niet in de afstandentabel — daardoor vallen ze ook buiten elk
            radiusfilter. Geef ze door zodat ze toegevoegd kunnen worden.</p>` : ''}
        ${zl.length ? `<p class="meta">Zonder locatie: ${h(zl.slice(0,25).map(k => k.naam).join(', '))}${
          zl.length > 25 ? ` + ${zl.length - 25} andere` : ''}.</p>` : ''}
      </details>`;
    };

    if(lens === 'kandidaten'){
      const klanten = CRM.actieveKlanten();
      const kands = bronKandidaten();

      /* Kandidaten: kleine stippen op woonplaats. */
      const kg = groepeerOpPlaats(kands, 'woonplaats');
      kg.op.forEach(g => g.leden.forEach((c, i) => {
        const p = spreid(g.coord, i, g.leden.length, 0.014);
        punten.push(p);
        L.circleMarker(p, {radius:4.5, color:K.blue, weight:1, fillColor:K.blue, fillOpacity:.55})
          .bindPopup(`<div class="src-pop"><b>${h(c.naam)}</b>${sterHtml(c.ster)}
            <div class="src-pop-sub">${h(c.functie||'—')} · ${h(c.woonplaats||'—')}</div>
            <a href="#kandidaten/${encodeURIComponent(c.id)}" data-kand="${h(String(c.id))}">Open kandidatenkaart →</a></div>`)
          .addTo(laag);
      }));

      /* Actieve klanten: grotere olijfgroene pinnen. */
      const kl = groepeerOpPlaats(klanten, 'locatie');
      buiten = {zonder:kl.zonder, onbekend:kl.onbekend};
      kl.op.forEach(g => g.leden.forEach((k, i) => {
        const p = spreid(g.coord, i, g.leden.length, 0.02);
        punten.push(p);
        const vacs = CRM.vacaturesVan(k.naam).filter(v => !v.status || v.status === 'Open');
        L.circleMarker(p, {radius:9, color:K.olive, weight:2, fillColor:K.olive, fillOpacity:.85})
          /* Leaflet zet een tooltip-string als innerHTML — dus escapen,
             anders is een klantnaam met <> een XSS-gaatje. */
          .bindTooltip(h(k.naam), {direction:'top', offset:[0,-6]})
          .on('click', () => klantPaneel(k, vacs, kands))
          .addTo(laag);
      }));

      const geenWoonplaats = kg.zonder.length, onbekendeWoonplaats = kg.onbekend.length;
      const opKaart = kands.length - geenWoonplaats - onbekendeWoonplaats;
      $('#src_telling').textContent =
        klanten.length + ' actieve klanten · ' + kands.length + ' kandidaten door de filters'
        + ' · ' + opKaart + ' op de kaart'
        + (geenWoonplaats ? ' · ' + geenWoonplaats + ' zonder woonplaats' : '')
        + (onbekendeWoonplaats ? ' · ' + onbekendeWoonplaats + ' zonder herkende plaats' : '');
      const alleOnbekend = telOnbekend(kg.onbekend), topOnbekend = alleOnbekend.slice(0,12);
      $('#src_legenda').innerHTML = `<div class="src-legenda">
        <span class="src-leg"><i class="src-dot" style="background:${K.olive}"></i>actieve klant</span>
        <span class="src-leg"><i class="src-dot sm" style="background:${K.blue}"></i>kandidaat</span>
        <span class="meta">klik op een klant-pin voor passende kandidaten binnen 30 km</span>
      </div>` + (topOnbekend.length ? `<details class="src-buiten">
        <summary>${onbekendeWoonplaats} ${onbekendeWoonplaats===1?'kandidaat':'kandidaten'} met een plaats die het systeem niet kent</summary>
        <div class="src-buitenlijst">${topOnbekend.map(p =>
          `<span class="chip">${h(p.naam)} <b class="num">${p.n}</b></span>`).join('')}
          ${alleOnbekend.length > topOnbekend.length
            ? `<span class="meta">+ ${alleOnbekend.length - topOnbekend.length} andere plaatsnamen</span>` : ''}</div>
        <p class="meta">Deze plaatsen staan niet in de afstandentabel, dus ze vallen ook buiten elk radiusfilter.
          Geef ze door zodat ze toegevoegd kunnen worden.</p>
      </details>` : '');
    }

    if(lens === 'klanten'){
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
      buiten = {zonder:kl.zonder, onbekend:kl.onbekend};
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

      const buitenTotaal = buiten.zonder.length + buiten.onbekend.length;
      /* Eerlijk zijn over de noemer: "121 van 211" met daarachter waaróm de
         rest ontbreekt, in plaats van alleen de klanten die wél passen. */
      $('#src_telling').textContent = (klanten.length - buitenTotaal) + ' van ' + klanten.length + ' klanten op de kaart'
        + (buiten.zonder.length ? ' · ' + buiten.zonder.length + ' zonder locatie' : '')
        + (buiten.onbekend.length ? ' · ' + buiten.onbekend.length + ' zonder herkende plaats' : '')
        + (geld && omzet && omzet.demo ? ' · demo-omzet (afgeleid van testdata)' : '')
        + (geld && omzet && omzet.fout ? ' · omzet niet beschikbaar' : '');
      const legendaBranches = branches.slice(0, PAL.length);
      $('#src_legenda').innerHTML = `<div class="src-legenda">
        ${legendaBranches.map(b => `<span class="src-leg"><i class="src-dot" style="background:${kleurVan(b)}"></i>${h(b)}</span>`).join('')}
        ${branches.length > PAL.length ? `<span class="src-leg"><i class="src-dot" style="background:${K.muted}"></i>overig</span>` : ''}
      </div>`;
    }

    tekenBuiten();

    if(punten.length){
      try{ map.fitBounds(L.latLngBounds(punten).pad(0.12), {maxZoom:11}); }catch(e){}
    } else {
      map.setView(NL_MIDDEN, 8);
    }
  };

  /* Paneeltje bij een klant-pin: open vacatures + beste matches ≤ 30 km. */
  const klantPaneel = (k, vacs, kands) => {
    /* Onbekende woonplaats valt eerlijk buiten de radius (nooit gokken),
       maar we zeggen er wél bij hoeveel kandidaten dat waren — anders lijkt
       het alsof er simpelweg niemand in de buurt woont. */
    /* Zelfde resolver als de kaart (afstandKm hierboven), niet CRM.afstandKm:
       anders staat een klant in "Katwijk aan Zee" wél op de kaart maar zegt
       dit paneel dat er niemand in de buurt woont. */
    const klantBekend = !!plaatsPunt(k.locatie);
    const nietTeMeten = klantBekend ? kands.filter(c => !plaatsPunt(c.woonplaats)).length : kands.length;
    const dichtbij = kands
      .map(c => ({c,
        km: afstandKm(c.woonplaats, k.locatie),
        score: vacs.length ? Math.max(...vacs.map(v => CRM.matchScore(c, v))) : 0
      }))
      .filter(m => m.km != null && m.km <= 30)
      .sort((a,b) => b.score - a.score || a.km - b.km)
      .slice(0, 6);

    $('#src_paneel').innerHTML = `<div class="card">
      <div class="card-h"><div class="h2">${h(k.naam)}</div>
        <span class="chip">${h(k.locatie||'—')}</span>
        ${k.branche?`<span class="chip">${h(k.branche)}</span>`:''}
        <span class="spacer"></span>
        <button class="btn sub sm" id="src_pd">Sluiten</button></div>
      <div class="card-b">
        <div class="label" style="margin-bottom:8px">Open vacatures</div>
        ${vacs.length ? `<div class="row tight" style="margin-bottom:16px">${vacs.map(v =>
            `<span class="chip">${h(v.functie)}${v.aantal>1?` <span class="num">×${v.aantal}</span>`:''}</span>`).join('')}</div>`
          : '<p class="sub" style="margin:0 0 16px">Geen open vacatures bekend voor deze klant.</p>'}
        <div class="label" style="margin-bottom:8px">Best passende kandidaten binnen 30 km${vacs.length?'':' (op afstand — geen vacature om op te matchen)'}</div>
        ${dichtbij.length ? `<div class="src-matches">${dichtbij.map(m => `
          <a class="src-match" href="#kandidaten/${encodeURIComponent(m.c.id)}" data-mkand="${h(String(m.c.id))}">
            <span style="min-width:0"><b>${h(m.c.naam)}</b>
              <span class="src-pop-sub">${h(m.c.functie||'—')} · ${h(m.c.woonplaats||'—')}${m.km!=null?` · <span class="num">${m.km}</span> km`:''}</span></span>
            ${sterHtml(m.c.ster)}
            ${vacs.length?`<span class="chip${m.score>=70?' green':m.score>=50?'':' amber'}"><span class="num">${m.score}%</span> match</span>`:''}
          </a>`).join('')}</div>`
          : `<p class="sub" style="margin:0">Geen kandidaten binnen 30 km die door de filters komen — verruim de filters hierboven.</p>`}
        ${nietTeMeten ? `<p class="meta" style="margin:10px 0 0">${
          klantBekend
            ? `${nietTeMeten===1 ? '1 kandidaat kon' : nietTeMeten + ' kandidaten konden'} niet op afstand beoordeeld worden: hun woonplaats is leeg of staat niet in de afstandentabel.`
            : `De afstand is hier niet te berekenen — de locatie van ${h(k.naam)} (${h(k.locatie||'leeg')}) staat niet in de afstandentabel.`
        }</p>` : ''}
      </div></div>`;
    $('#src_pd').onclick = () => { $('#src_paneel').innerHTML = ''; };
    container.querySelectorAll('[data-mkand]').forEach(a =>
      a.onclick = e => { e.preventDefault(); CRM.ga('kandidaten',{id:a.dataset.mkand}); });
    if(window.innerWidth <= 700) $('#src_paneel').scrollIntoView({behavior:'smooth', block:'nearest'});
  };

  /* ─── Events ──────────────────────────────────────────────── */
  const filknop = $('#src_filknop');
  if(filknop) filknop.onclick = () => {
    filtersOpen = !filtersOpen;
    $('#src_fil').style.display = filtersOpen ? '' : 'none';
    setTimeout(() => { try{ map.invalidateSize(); }catch(e){} }, 60);
  };
  container.querySelectorAll('[data-sf]').forEach(el => {
    const k = el.dataset.sf;
    const pas = () => { zetS(k, k==='ster' ? Number(el.value)||0 : el.value); teken(); };
    if(el.tagName === 'SELECT') el.onchange = pas;
    else el.oninput = CRM.debounce(pas, 300);
  });
  const seg = $('#src_periode');
  if(seg) seg.querySelectorAll('button').forEach(b => b.onclick = () => {
    periode = b.dataset.p;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    teken();
  });

  teken();
};
})();

/* ─── Eigen zijbalk-module: Sourcing ──────────────────────────
   Op verzoek van Tjeerd een eigen navigatie-item onder Kandidaten
   (niet langer een tab binnen de Kandidaten-module).             */
/* (Het eerdere verzoek over CRM.isActiefLopend is verwerkt: data.js eist nu
   zelf een echte fase. De extra `c.fase &&` in bronKandidaten() blijft als
   goedkope vangnetregel staan.)                                              */

/* VERZOEK AAN CORE (data.js) — stand 30 jul 2026, gemeten tegen de echte
   importdata (supabase/import-oud-crm.sql: 211 organisaties, 298 kandidaten)
   mét de aliaslaag hierboven. Van de klanten staan er 123 op de kaart; de rest
   ontbreekt niet door slechte matching maar doordat 87 klanten helemaal géén
   locatie hebben ingevuld — dat is een datataak, geen codetaak.
   Nog écht ontbrekend in CRM.PLAATSEN (met coördinaat, klaar om te plakken):
     'teraar':[52.209,4.716],      'schijndel':[51.620,5.435],
     'oirschot':[51.505,5.311],    'oosterhout':[51.645,4.860],
     'rijen':[51.588,4.936],       'spakenburg':[52.257,5.362],
     'beverwijk':[52.484,4.657],   'stolwijk':[51.965,4.766],
     'noorden':[52.166,4.813],     'waalwijk':[51.687,5.071]
   Verder nog twee opmerkingen bij data.js:
   1. 'hendrikidoambacht' staat er twee keer in (regel ~132 en ~161) — de
      tweede overschrijft de eerste met dezelfde waarde, dus onschadelijk,
      maar het hoort er één keer te staan.
   2. 'alphenandenrijn' en 'krimpenandenijssel' worden nooit geraakt:
      CRM.plaatsSleutel maakt daar 'alphena/drijn' resp. 'krimpena/dijssel'
      van. Dode sleutels.
   De aliassen in PL_ALIAS hierboven (The Hague, Leidschenveen, Hellvoetsluis,
   "a.d."-schrijfwijzen, "… aan Zee") vangen varianten van plaatsen die al ín
   CRM.PLAATSEN staan; die horen niet als losse coördinaat toegevoegd te
   worden. Let op: CRM.afstandKm en CRM.matchScore kennen die aliassen niet,
   dus zolang dit een aliaslaag is scoort zo'n kandidaat elders in de app
   iets lager op afstand.                                                     */

CRM.registerModule('source', {
  title:'Sourcing', icon:'◎', onderschrift:'Kaart: actieve klanten en passende kandidaten',
  render(mount){
    mount.innerHTML = '<div id="src_mount"></div>';
    if(typeof CRM.kaartRender === 'function')
      CRM.kaartRender(mount.querySelector('#src_mount'), {lens:'kandidaten'});
    else
      mount.innerHTML = '<div class="note warn">De kaart-engine is niet geladen.</div>';
  }
});
