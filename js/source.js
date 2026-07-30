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

/* ─── Hulpjes ─────────────────────────────────────────────────── */
const coord = plaats => CRM.PLAATSEN[CRM.plaatsSleutel(plaats)] || null;

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

/* Kandidaten die door de Source-filters komen. */
function bronKandidaten(){
  return CRM.kandidaten().filter(c => {
    if(S.status === 'beschikbaar' && !CRM.isBeschikbaar(c))  return false;
    if(S.status === 'lopend'      && !CRM.isActiefLopend(c)) return false;
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
function omzetVan(rows, klantNaam, periode){
  const jaar = String(new Date().getFullYear());
  return rows.filter(r => CRM.zelfdeKlant(r.klant, klantNaam)
      && (periode === 'alles' || String(r.datum).startsWith(jaar)))
    .reduce((s,r) => s + r.bedrag, 0);
}

/* Plaatsingen per klant (aantallen — die mag iedereen zien). */
function plaatsingenVan(klantNaam){
  return CRM.kandidaten().filter(c => c.geplaatstOp && CRM.zelfdeKlant(c.klant, klantNaam)).length;
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
    const punten = [], missend = [];

    if(lens === 'kandidaten'){
      const klanten = CRM.actieveKlanten();
      const kands = bronKandidaten();

      /* Kandidaten: kleine stippen op woonplaats. */
      const perPlek = {};
      kands.forEach(c => { const k = CRM.plaatsSleutel(c.woonplaats); (perPlek[k] = perPlek[k]||[]).push(c); });
      let zonderPlek = 0;
      Object.keys(perPlek).forEach(plek => {
        const basis = CRM.PLAATSEN[plek];
        if(!basis){ zonderPlek += perPlek[plek].length; return; }
        perPlek[plek].forEach((c, i) => {
          const p = spreid(basis, i, perPlek[plek].length, 0.014);
          punten.push(p);
          L.circleMarker(p, {radius:4.5, color:K.blue, weight:1, fillColor:K.blue, fillOpacity:.55})
            .bindPopup(`<div class="src-pop"><b>${h(c.naam)}</b>${sterHtml(c.ster)}
              <div class="src-pop-sub">${h(c.functie||'—')} · ${h(c.woonplaats||'—')}</div>
              <a href="#kandidaten/${encodeURIComponent(c.id)}" data-kand="${h(String(c.id))}">Open kandidatenkaart →</a></div>`)
            .addTo(laag);
        });
      });

      /* Actieve klanten: grotere olijfgroene pinnen. */
      const perKPlek = {};
      klanten.forEach(k => { const s = CRM.plaatsSleutel(k.locatie); (perKPlek[s] = perKPlek[s]||[]).push(k); });
      Object.keys(perKPlek).forEach(plek => {
        const basis = CRM.PLAATSEN[plek];
        if(!basis){ perKPlek[plek].forEach(k => missend.push(k.naam + (k.locatie?' ('+k.locatie+')':' — geen locatie'))); return; }
        perKPlek[plek].forEach((k, i) => {
          const p = spreid(basis, i, perKPlek[plek].length, 0.02);
          punten.push(p);
          const vacs = CRM.vacaturesVan(k.naam).filter(v => !v.status || v.status === 'Open');
          L.circleMarker(p, {radius:9, color:K.olive, weight:2, fillColor:K.olive, fillOpacity:.85})
            .bindTooltip(k.naam, {direction:'top', offset:[0,-6]})
            .on('click', () => klantPaneel(k, vacs, kands))
            .addTo(laag);
        });
      });

      $('#src_telling').textContent =
        klanten.length + ' actieve klanten · ' + kands.length + ' kandidaten door de filters'
        + (zonderPlek ? ' · ' + zonderPlek + ' zonder herkende woonplaats (niet op de kaart)' : '');
      $('#src_legenda').innerHTML = `<div class="src-legenda">
        <span class="src-leg"><i class="src-dot" style="background:${K.olive}"></i>actieve klant</span>
        <span class="src-leg"><i class="src-dot sm" style="background:${K.blue}"></i>kandidaat</span>
        <span class="meta">klik op een klant-pin voor passende kandidaten binnen 30 km</span>
      </div>`;
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

      /* Waarde per klant: omzet (alleen eigenaar) of plaatsingen (iedereen). */
      const waarde = {};
      klanten.forEach(k => {
        waarde[k.naam] = geld && omzet ? omzetVan(omzet.rows, k.naam, periode) : plaatsingenVan(k.naam);
      });
      const max = Math.max(1, ...Object.values(waarde));

      const perPlek = {};
      klanten.forEach(k => { const s = CRM.plaatsSleutel(k.locatie); (perPlek[s] = perPlek[s]||[]).push(k); });
      Object.keys(perPlek).forEach(plek => {
        const basis = CRM.PLAATSEN[plek];
        if(!basis){ perPlek[plek].forEach(k => missend.push(k.naam + (k.locatie?' ('+k.locatie+')':' — geen locatie'))); return; }
        perPlek[plek].forEach((k, i) => {
          const p = spreid(basis, i, perPlek[plek].length, 0.02);
          punten.push(p);
          const w = waarde[k.naam] || 0;
          const r = 5 + Math.sqrt(w / max) * 11;
          const n = plaatsingenVan(k.naam);
          L.circleMarker(p, {radius:r, color:kleurVan(k.branche), weight:2, fillColor:kleurVan(k.branche), fillOpacity:.6})
            .bindPopup(`<div class="src-pop">
              <b><a href="#klanten/${encodeURIComponent(k.naam)}" data-klantkaart="${h(k.naam)}">${h(k.naam)}</a></b>
              <div class="src-pop-sub">${h(k.branche||'—')} · ${h(k.locatie||'—')} · ${h(k.fase||'')}</div>
              <div class="src-pop-sub"><span class="num">${n}</span> plaatsing${n===1?'':'en'}${
                geld && omzet ? ' · omzet ' + (periode==='jaar'?'dit jaar':'totaal') + ': <b class="num">' + CRM.euro(omzetVan(omzet.rows, k.naam, periode)) + '</b>' : ''}</div>
            </div>`)
            .addTo(laag);
        });
      });

      $('#src_telling').textContent = klanten.length + ' klanten op de kaart'
        + (geld && omzet && omzet.demo ? ' · demo-omzet (afgeleid van testdata)' : '')
        + (geld && omzet && omzet.fout ? ' · omzet niet beschikbaar' : '');
      const legendaBranches = branches.slice(0, PAL.length);
      $('#src_legenda').innerHTML = `<div class="src-legenda">
        ${legendaBranches.map(b => `<span class="src-leg"><i class="src-dot" style="background:${kleurVan(b)}"></i>${h(b)}</span>`).join('')}
        ${branches.length > PAL.length ? `<span class="src-leg"><i class="src-dot" style="background:${K.muted}"></i>overig</span>` : ''}
      </div>`;
    }

    $('#src_missend').textContent = missend.length ? 'Niet op de kaart: ' + missend.join(', ') : '';

    if(punten.length){
      try{ map.fitBounds(L.latLngBounds(punten).pad(0.12), {maxZoom:11}); }catch(e){}
    } else {
      map.setView(NL_MIDDEN, 8);
    }
  };

  /* Paneeltje bij een klant-pin: open vacatures + beste matches ≤ 30 km. */
  const klantPaneel = (k, vacs, kands) => {
    const dichtbij = kands
      .filter(c => CRM.binnenRadius(c, k.locatie, 30))
      .map(c => ({c,
        km: CRM.afstandKm(c.woonplaats, k.locatie),
        score: vacs.length ? Math.max(...vacs.map(v => CRM.matchScore(c, v))) : 0
      }))
      .sort((a,b) => b.score - a.score || (a.km??99) - (b.km??99))
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
          : '<p class="sub" style="margin:0">Geen kandidaten binnen 30 km die door de filters komen — verruim de filters hierboven.</p>'}
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
