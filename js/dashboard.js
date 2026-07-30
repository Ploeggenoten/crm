/* ═══════════════════════════════════════════════════════════════
   MODULE: DASHBOARD — de werkdag als tijdlijn
   Combinatie "dagstart-lijst" + "agenda centraal" (keuze Tjeerd):
   één dagbaan van 08:00–18:00 met afspraken op hun tijd, taken en
   voorgesteld werk in de lege uren, en alles afvinkbaar.
   Rechts: hot vacatures, meldingen en de eigen maandstand.
   Bedragen staan strikt achter CRM.canSeeMoney().
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h   = CRM.h;
const DAG = 86400000;
const kort   = s => String(s||'').slice(0,10);
/* Actief in de pijplijn: een échte fase (golden/geïmporteerde kandidaten
   zonder fase tellen niet mee) en niet uitgevallen. */
const actief = c => !!c.fase && !['Afgevallen','Gestopt'].includes(c.fase);
const VANDAAG = () => CRM.todayISO();
const dISO = t => new Date(t).toLocaleDateString('sv-SE');

const START_UUR = 8, EIND_UUR = 18;

/* Sessie-lokaal afgevinkt: taken die vandaag zijn afgerond (tellen mee in de
   voortgang) en regels zonder database-veld (afspraken, suggestieblokken). */
const sessieAf    = new Set();          // taak-ids
const sessieKlaar = new Set();          // 'datum:sleutel' van sessie-regels
const sk = key => VANDAAG() + ':' + key;

/* Voortgang van de tijdlijn (bijgehouden zonder volledige herteken). */
let _vgTot = 0, _vgAf = 0;

/* Maandag t/m zondag van de huidige week. */
const dagPlus = (basis, n) => { const x = new Date(basis); x.setDate(x.getDate()+n); return x; };
function maandag(){
  const d = new Date(); d.setHours(0,0,0,0);
  return dagPlus(d, -((d.getDay()+6)%7));
}
function weekBereik(){
  const ma = maandag();
  return { van:dISO(ma), tot:dISO(dagPlus(ma,6)) };
}
const inBereik = (x,van,tot) => { const s = kort(x); return !!s && s>=van && s<=tot; };

/* ═══ ZICHT: vandaag of week ═════════════════════════════════════
   De schakelaar staat in de kop van het tijdlijnblok; de keuze
   overleeft een herlaadbeurt. */
const ZICHT_KEY = 'crm_dash_zicht';
const zicht    = () => { try{ return localStorage.getItem(ZICHT_KEY)==='week' ? 'week' : 'dag'; }catch(e){ return 'dag'; } };
const zetZicht = v => { try{ localStorage.setItem(ZICHT_KEY, v); }catch(e){} };

/* Compact (alleen de uren waar iets staat) of de hele dagbaan 08:00–18:00. */
const DAGVOL_KEY = 'crm_dash_dagvol';
const dagVol    = () => { try{ return localStorage.getItem(DAGVOL_KEY)==='1'; }catch(e){ return false; } };
const zetDagVol = v => { try{ localStorage.setItem(DAGVOL_KEY, v?'1':'0'); }catch(e){} };

function groet(){
  const u = new Date().getHours();
  return u < 6 ? 'Goedenacht' : u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond';
}

/* ═══ SPARKLINE — dun olijflijntje dat richting toont ════════════
   Geen assen, geen raster, geen tooltip: richting, geen grafiek.
   Let op: deze functie staat LETTERLIJK ook in performance.js
   (modules delen geen code, afspraak §1) — wijzig je hem, wijzig beide. */
function sparkline(waarden){
  const v = (waarden||[]).map(Number).filter(n => isFinite(n));
  if(v.length < 2 || v.every(n => n === 0)) return '';
  const B = 100, H = 24, P = 3;
  const min = Math.min(...v), span = (Math.max(...v) - min) || 1;
  const x = i => P + i * (B - 2*P) / (v.length - 1);
  const y = n => H - P - (n - min) / span * (H - 2*P);
  const pts = v.map((n,i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${B} ${H}" width="${B}" height="${H}" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="var(--olive)" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(v.length-1).toFixed(1)}" cy="${y(v[v.length-1]).toFixed(1)}" r="2" fill="var(--olive)"/></svg>`;
}

/* De twee sparklines "instroom per week" en "geplaatst per week" stonden
   hier boven de dagbaan. Verwijderd (rust, jul 2026): ze duwden de dag naar
   beneden en dezelfde richting staat al in Performance én — voor jezelf —
   in het blok "Jouw maand". Eén sparkline per scherm is genoeg. */

/* ═══ MOTIVATIEZIN — elke dag een andere, nuchter en recruitment ═ */
const ZINNEN = [
  'Vandaag maak je iemand aan het werk.',
  'Eén goed gesprek is meer waard dan tien mailtjes.',
  'De beste kandidaat van vandaag is al aan het werk — bel hem toch.',
  'Niemand wordt geplaatst vanuit je inbox.',
  'Bellen vóór de lunch levert meer op dan plannen erna.',
  'Een lead van gisteren is vandaag al lauw.',
  'De vacature vult zichzelf niet.',
  'Wie het eerst belt, plaatst het eerst.',
  'Nazorg is de goedkoopste nieuwe plaatsing.',
  'Elke no-show heeft een verhaal. Vraag ernaar.',
  'Je pijplijn van volgende maand bouw je vanochtend.',
  'Twijfel tussen mailen en bellen? Bellen.',
  'Kandidaten kiezen voor mensen, niet voor bureaus.',
  'Vandaag vijf leads bellen is beter dan tien morgen.',
  'Een volle agenda is nog geen volle pijplijn.',
  'De klant belt niet terug. Jij wel.',
  'Voorstellen die blijven liggen, worden afwijzingen.',
  'Werk je lijstje af voordat het lijstje jou afwerkt.',
  'Eén plaatsing begint met één telefoontje.',
  'Stilte in de pijplijn hoor je pas over twee weken.',
  'Snelheid wint van perfectie. Zeker bij leads.',
  'Wie vandaag zaait, plaatst over twee weken.',
  'Goede recruiters luisteren meer dan ze praten.',
  'Die moeilijke klant? Gewoon bellen.',
  'Een intake zonder vervolg is een gemiste plaatsing.',
  'Het beste moment om te bellen is nu. Het op één na beste ook.',
  'Maak het vandaag één kandidaat makkelijker om ja te zeggen.',
  'Achterstallige taken worden niet vanzelf klaar.',
  'Je hoeft niet iedereen te plaatsen. Wel iemand.',
  'Rustige dag? Mooi moment om oude leads wakker te bellen.'
];
const MOT_KEY = 'crm_motivatie_weg';

function motivatieHTML(){
  try{ if(localStorage.getItem(MOT_KEY) === VANDAAG()) return ''; }catch(e){}
  const nu = new Date();
  const dag = Math.floor((nu - new Date(nu.getFullYear(),0,0)) / DAG);
  const zin = ZINNEN[dag % ZINNEN.length];
  return `<div class="mot" id="dash_mot">
    <span class="hand mot-zin">${h(zin)}</span>
    <button type="button" class="mot-x" id="mot_x" title="Verbergen voor vandaag">✕</button>
  </div>`;
}

/* ═══ DE DAG OPBOUWEN ════════════════════════════════════════════
   Afspraken op hun tijd; taken en gegenereerd werk (leads zonder
   opvolging, acties over datum, nazorg) als blokken in lege uren. */
function bouwDag(){
  const nu = VANDAAG(), mij = CRM.me(), cs = CRM.kandidaten();
  const uren = {}; for(let u=START_UUR; u<EIND_UUR; u++) uren[u] = [];
  const rest = [];
  const klem = u => Math.max(START_UUR, Math.min(EIND_UUR-1, u));

  /* 1. CRM-afspraken vandaag: intakes, gesprekken, meeloopdagen. */
  cs.filter(c => actief(c) && kort(c.datum)===nu)
    .sort((a,b)=>String(a.tijd).localeCompare(String(b.tijd)))
    .forEach(c => {
      const it = { soort:'afspraak', sesKey:'afspraak:'+c.id,
        titel:c.naam, sub:[c.fase, c.klant].filter(Boolean).join(' · '),
        tijd:c.tijd||'', mod:'kandidaten', id:c.id };
      it.af = sessieKlaar.has(sk(it.sesKey));
      if(c.tijd) uren[klem(parseInt(c.tijd,10))].push(it);
      else rest.push(it);
    });

  /* 2. Mijn taken (vandaag + achterstallig). Met tijd → op hun plek. */
  const timedLos = [], zonderTijd = [];
  (CRM.state.taken||[])
    .filter(t => !t.klaar && (!t.voor || t.voor===mij) && kort(t.datum) && kort(t.datum) <= nu)
    .sort((a,b)=>String(a.datum).localeCompare(String(b.datum)))
    .forEach(t => {
      const over = kort(t.datum) < nu;
      const refNaam = t.entiteit==='kandidaat' ? ((CRM.kandidaat(t.ref)||{}).naam || t.ref) : (t.ref||'');
      const van = (t.door && t.door !== mij) ? 'van ' + String(t.door).split(/\s+/)[0] : '';
      const it = { soort:'taak', taakId:t.id, titel:t.tekst,
        sub:[refNaam, van].filter(Boolean).join(' · '),
        urgent:over, w: over ? 'over datum' : '',
        mod: t.entiteit==='klant' ? 'klanten' : t.entiteit==='kandidaat' ? 'kandidaten'
           : t.entiteit==='lead' ? 'recruitment' : '', id:t.ref||'' };
      if(t.tijd){ it.tijd = String(t.tijd).slice(0,5); timedLos.push(it); }
      else zonderTijd.push(it);
    });
  timedLos.forEach(it => uren[klem(parseInt(it.tijd,10))].push(it));

  /* 3. Gegenereerd werk → suggestieblokken. */
  const blokken = zonderTijd.slice();      // echte taken eerst, dan suggesties

  const leads = (CRM.state.leads||[])
    .filter(l => CRM.LEAD_OPEN.includes(l.status))
    .map(l => {
      const gepland = !!kort(l.opvolgen_op) && kort(l.opvolgen_op) <= nu;
      const oud     = l.status==='Nieuw' && (CRM.dagenGeleden(l.binnen_op)||0) >= 2;
      return (gepland||oud) ? l : null;
    }).filter(Boolean);
  if(leads.length){
    const b = { soort:'sug', key:'leads', mod:'recruitment',
      titel:`bel je ${leads.length} nieuwe sollicitant${leads.length===1?'':'en'}`,
      sub: leads.slice(0,3).map(l=>l.naam).join(', ') + (leads.length>3?' …':'') };
    b.af = sessieKlaar.has(sk('sug:leads'));
    blokken.push(b);
  }

  const acties = cs.filter(c => actief(c) && c.volgendeActie && kort(c.actieDatum) && kort(c.actieDatum) < nu)
    .sort((a,b)=>String(a.actieDatum).localeCompare(String(b.actieDatum)));
  if(acties.length){
    blokken.push({ soort:'sug', key:'acties', mod:'kandidaten', urgent:true,
      candIds: acties.map(c=>c.id),
      titel:`werk ${acties.length} ${acties.length===1?'actie':'acties'} over datum bij`,
      sub: acties.slice(0,3).map(c=>c.naam).join(', ') + (acties.length>3?' …':'') });
  }

  const nazorg = [];
  cs.filter(c => c.fase==='Gestart').forEach(c => {
    const start = kort(c.start) || kort(c.geplaatstOp);
    const n = CRM.dagenGeleden(start);
    if(n==null || n < 0) return;
    if([3,14,30].find(m => n===m || n===m+1)) nazorg.push(c);
  });
  if(nazorg.length){
    const b = { soort:'sug', key:'nazorg', mod:'kandidaten',
      titel:`nazorg-belronde: ${nazorg.length} ${nazorg.length===1?'gestarte kandidaat':'gestarte kandidaten'}`,
      sub: nazorg.slice(0,3).map(c=>c.naam).join(', ') + (nazorg.length>3?' …':'') };
    b.af = sessieKlaar.has(sk('sug:nazorg'));
    blokken.push(b);
  }

  /* 4. Blokken in de lege uren plotten: vanaf nu, max 1 per leeg uur. */
  let cursor = Math.max(START_UUR, new Date().getHours());
  blokken.forEach(b => {
    while(cursor < EIND_UUR && uren[cursor].length) cursor++;
    if(cursor < EIND_UUR){ uren[cursor].push(b); cursor++; }
    else rest.push(b);
  });

  /* 5. Voortgang: alles met een vinkje + de taken die vandaag al af zijn. */
  const klaarVandaag = (CRM.state.taken||[]).filter(t =>
    t.klaar && (!t.voor || t.voor===mij) && (kort(t.datum)===nu || sessieAf.has(String(t.id)))).length;
  let getekend = 0, af = 0;
  Object.values(uren).forEach(list => list.forEach(it => { getekend++; if(it.af) af++; }));
  rest.forEach(it => { getekend++; if(it.af) af++; });

  return { uren, rest, tot: getekend + klaarVandaag, af: af + klaarVandaag };
}

/* ═══ DE WEEK OPBOUWEN ═══════════════════════════════════════════
   Maandag t/m vrijdag altijd; zaterdag en zondag alleen als daar
   iets staat. Per dag: CRM-afspraken, mijn taken met datum en (later,
   asynchroon) de Outlook-afspraken. Chronologisch: eerst wat een tijd
   heeft, daarna de rest. */
function bouwWeek(){
  const ma = maandag(), nu = VANDAAG(), mij = CRM.me(), cs = CRM.kandidaten();
  const dagen = [];
  for(let i=0;i<7;i++){
    const d = dagPlus(ma,i), iso = dISO(d);
    dagen.push({ iso, weekend: i>=5, vandaag: iso===nu, verleden: iso<nu,
      naam: d.toLocaleDateString('nl-NL',{weekday:'short'}).replace('.',''),
      dat:  d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'}),
      items: [] });
  }
  const opDag = iso => dagen.find(x => x.iso === iso);

  /* 1. CRM-afspraken: intakes, gesprekken, meeloopdagen. */
  cs.filter(actief).forEach(c => {
    const d = opDag(kort(c.datum)); if(!d) return;
    d.items.push({ soort:'afspraak', geenVink:true, titel:c.naam,
      sub:[c.fase, c.klant].filter(Boolean).join(' · '),
      tijd:c.tijd||'', mod:'kandidaten', id:c.id });
  });

  /* 2. Mijn open taken met een datum in deze week. */
  (CRM.state.taken||[]).filter(t => !t.klaar && (!t.voor || t.voor===mij)).forEach(t => {
    const d = opDag(kort(t.datum)); if(!d) return;
    const refNaam = t.entiteit==='kandidaat' ? ((CRM.kandidaat(t.ref)||{}).naam || t.ref) : (t.ref||'');
    const van = (t.door && t.door !== mij) ? 'van ' + String(t.door).split(/\s+/)[0] : '';
    d.items.push({ soort:'taak', taakId:t.id, titel:t.tekst, buiten: d.iso !== nu,
      sub:[refNaam, van].filter(Boolean).join(' · '),
      urgent: d.iso < nu, w: d.iso < nu ? 'over datum' : '',
      tijd: t.tijd ? String(t.tijd).slice(0,5) : '',
      mod: t.entiteit==='klant' ? 'klanten' : t.entiteit==='kandidaat' ? 'kandidaten'
         : t.entiteit==='lead' ? 'recruitment' : '', id:t.ref||'' });
  });

  dagen.forEach(sorteerDag);
  return dagen;
}

/* Eerst wat een tijd heeft (oplopend), daarna wat geen tijd heeft. */
function sorteerDag(d){
  d.items.sort((a,b) => {
    const ta = a.tijd||'', tb = b.tijd||'';
    if(!!ta !== !!tb) return ta ? -1 : 1;
    return ta.localeCompare(tb);
  });
}

/* ═══ TIJDLIJN-MARKUP ════════════════════════════════════════════ */
function rijHTML(it){
  const vink = it.soort==='taak' ? `data-taak="${h(it.taakId)}"`
    : it.soort==='sug' && it.key==='acties' ? `data-blok="acties" data-ids="${h((it.candIds||[]).join(','))}"`
    : it.soort==='sug' ? `data-ses="sug:${h(it.key)}"`
    : `data-ses="${h(it.sesKey||'')}"`;
  const klik = it.mod ? ` data-mod="${h(it.mod)}"${it.id?` data-id="${h(it.id)}"`:''}` : '';
  const w = it.w || '';
  /* Zonder vinkje (weekweergave: afspraken) blijft de regel wel uitgelijnd.
     data-buiten = telt niet mee in de voortgang, want die gaat over vandaag. */
  const vinkHTML = it.geenVink
    ? `<span class="tl2-geenvink"></span>`
    : `<input type="checkbox" class="tl2-vink" ${vink}${it.buiten?' data-buiten="1"':''}${it.af?' checked disabled':''} title="Afvinken">`;
  return `<div class="tl2-item${it.mod?' klik':''}${it.urgent&&!it.af?' urgent':''}${it.soort==='sug'?' sug':''}${it.af?' af':''}"${klik}>
    ${vinkHTML}
    <div class="tl2-t"><b>${it.soort==='sug'?'<span class="tl2-ruimte">ruimte:</span> ':''}${h(it.titel)}</b>
      ${it.sub||it.subHtml?`<span class="tl2-s">${it.subHtml||h(it.sub)}</span>`:''}</div>
    ${it.tijd?`<span class="tl2-w num">${h(it.tijd)}</span>`:w?`<span class="tl2-w num${it.urgent?' oranje':''}">${h(w)}</span>`:''}
  </div>`;
}

/* ─── De dagbaan ─────────────────────────────────────────────────
   Standaard COMPACT: alleen de uren waar iets staat, plus het huidige
   uur voor de oriëntatie. Lege stukken worden één regel "niets gepland
   tot 12:00" die je openklapt als je er alsnog iets in wilt zetten.
   Met de knop "Hele dag tonen" krijg je de volle baan 08:00–18:00. */
const uurLabel = n => String(n).padStart(2,'0') + ':00';

function uurRijHTML(u, P, nuUur, nuMin){
  const isNu = u === nuUur;
  return `<div class="tl2-uur${u<nuUur?' voorbij':''}${isNu?' nu':''}" data-uur="${u}">
    <span class="tl2-tijd num">${uurLabel(u)}</span>
    <div class="tl2-slot">
      ${isNu?`<div class="tl2-nulijn" style="top:${Math.round(nuMin/60*100)}%"><span>nu</span></div>`:''}
      <div class="tl2-items">${(P.uren[u]||[]).map(rijHTML).join('')}</div>
    </div>
  </div>`;
}

/* Eén regel voor een dichtgeklapt stuk lege uren (van t/m tot-1). */
function vouwRijHTML(van, tot){
  return `<div class="tl2-vouw" data-van="${van}" data-tot="${tot}" role="button" tabindex="0"
    title="Deze uren tonen om er iets in te plannen">
    <span class="tl2-tijd num">${uurLabel(van)}</span>
    <span class="tl2-vouw-t meta">niets gepland${tot-van>1?' tot '+uurLabel(tot):''}</span>
    <span class="tl2-vouw-x meta">tonen +</span>
  </div>`;
}

/* Een dichtgeklapt stuk alsnog openen (klik of Enter, én als er een
   Outlook-afspraak in dat uur blijkt te vallen). */
function vouwOpen(el, P){
  if(!el || !el.dataset) return;
  const van = Number(el.dataset.van), tot = Number(el.dataset.tot), nuD = new Date();
  const rijen = [];
  for(let u=van; u<tot; u++) rijen.push(uurRijHTML(u, P, nuD.getHours(), nuD.getMinutes()));
  el.outerHTML = rijen.join('');
}

function dagBaanHTML(P){
  const nuD = new Date(), nuUur = nuD.getHours(), nuMin = nuD.getMinutes();
  const vol = dagVol();
  const uren = [];
  for(let u=START_UUR; u<EIND_UUR; u++) uren.push(u);
  const iets = u => (P.uren[u]||[]).length > 0;
  const getekendIets = uren.some(iets) || P.rest.length > 0;

  let baan = '';
  if(vol){
    baan = uren.map(u => uurRijHTML(u, P, nuUur, nuMin)).join('');
  }else if(getekendIets){
    /* Toon een uur als er iets in staat, of als het het huidige uur is. */
    const rijen = [];
    let leegVan = null;
    const sluit = tot => { if(leegVan!=null){ rijen.push(vouwRijHTML(leegVan, tot)); leegVan = null; } };
    uren.forEach(u => {
      if(iets(u) || u === nuUur){ sluit(u); rijen.push(uurRijHTML(u, P, nuUur, nuMin)); }
      else if(leegVan==null) leegVan = u;
    });
    sluit(EIND_UUR);
    baan = rijen.join('');
  }
  /* Niets op de dag én compact: geen tien lege uurregels, alleen de lege staat. */
  const leegTekst = getekendIets ? '' : (P.tot
    ? 'Alles voor vandaag is afgerond. Mooi moment om vooruit te werken.'
    : 'Niets ingepland en niets openstaand — mooi moment om vooruit te werken of nieuwe sollicitanten te bellen.');

  return `${leegTekst?`<div class="tl2-leeg meta">${h(leegTekst)}</div>`:''}
    ${baan?`<div class="tl2-baan">${baan}</div>`:''}
    ${P.rest.length?`<div class="tl2-rest"><div class="label">Nog in te plannen</div>
      ${P.rest.map(rijHTML).join('')}</div>`:''}`;
}

/* De week: vijf (soms zeven) dagblokken ONDER elkaar, met dezelfde
   tijd-links/inhoud-rechts opbouw als de dagbaan. Bewuste keuze boven
   vijf kolommen: op 1280px houdt de tijdlijnkolom ±760px over, dus vijf
   kolommen worden ±145px breed — daar past "Marek Nowak / Voorgesteld ·
   Starcuisine" niet in zonder overal af te kappen. Onder elkaar leest
   het als één lijst, is er ruimte voor de subregel, en op mobiel is het
   exact dezelfde vorm (alleen smaller) in plaats van een tweede indeling. */
function weekBaanHTML(W){
  const toon = W.filter(d => !d.weekend || d.items.length);
  return `<div class="tl2-week">${toon.map(d => `
    <div class="tl2-dag${d.vandaag?' vandaag':''}${d.verleden?' voorbij':''}" data-dag="${h(d.iso)}">
      <div class="tl2-dkop">
        <span class="tl2-dnaam">${h(d.naam)}</span>
        <span class="tl2-ddat num">${h(d.dat)}</span>
        ${d.vandaag?'<span class="tl2-dnu">vandaag</span>':''}
      </div>
      <div class="tl2-ditems">${d.items.length ? d.items.map(rijHTML).join('')
        : `<div class="tl2-dleeg meta">Niets ingepland</div>`}</div>
    </div>`).join('')}</div>`;
}

function tijdlijnKaart(P, W){
  const wk = zicht()==='week';
  const pct = P.tot ? Math.round(P.af/P.tot*100) : 0;
  const outlookRij = (CRM.outlook.beschikbaar() && !CRM.outlook.verbonden())
    ? `<div class="tl2-olrow"><span class="meta">Je Outlook-agenda kan hier tussen de afspraken staan.</span>
       <button class="btn ghost sm" id="tl2_ol">Outlook verbinden</button></div>` : '';

  return `<div class="card tl2-card">
    <div class="card-h">
      <!-- De schakelaar ís de kop: een titel "Vandaag" náást een knop
           "Vandaag" zou hetzelfde woord twee keer zetten. -->
      <div class="seg tl2-seg">
        <button type="button" data-zicht="dag"${wk?'':' class="on"'}>Vandaag</button>
        <button type="button" data-zicht="week"${wk?' class="on"':''}>Week</button>
      </div>
      ${P.tot?`<div class="tl2-vg"><span class="meta num" id="tl2_vgt">${P.af} van ${P.tot} afgerond${wk?' vandaag':''}</span>
        <div class="bar tl2-vgbar"><i id="tl2_vgb" style="width:${pct}%"></i></div></div>`:''}
      <span class="spacer"></span>
      ${wk?'':`<button type="button" class="btn sub sm" id="tl2_vol">${dagVol()?'Compact':'Hele dag tonen'}</button>`}
      <button class="btn ghost sm" id="tl2_nieuw">+ Taak</button></div>
    <div class="card-b tl2-b">
      ${outlookRij}
      ${wk ? weekBaanHTML(W) : dagBaanHTML(P)}
    </div></div>`;
}

/* ═══ VOORTGANG + AFVINKEN ═══════════════════════════════════════ */
function vgTeken(){
  const t = document.getElementById('tl2_vgt'), b = document.getElementById('tl2_vgb');
  /* In weekweergave erbij zeggen dat de teller over vandaag gaat. */
  if(t) t.textContent = `${_vgAf} van ${_vgTot} afgerond${zicht()==='week'?' vandaag':''}`;
  if(b) b.style.width = (_vgTot ? Math.round(_vgAf/_vgTot*100) : 0) + '%';
}
function rijAf(cb){
  if(!cb) return;
  cb.checked = true; cb.disabled = true;
  const rij = cb.closest('.tl2-item');
  if(rij){ rij.classList.add('af'); rij.classList.remove('urgent'); }
  /* Een taak van een andere dag telt niet mee: de voortgang gaat over vandaag. */
  if(!cb.dataset.buiten){ _vgAf++; vgTeken(); }
}

async function taakAfvinken(id, cb){
  const t = (CRM.state.taken||[]).find(x => String(x.id)===String(id));
  if(!t) return;
  t.klaar = true;
  sessieAf.add(String(t.id));
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_taken').update({klaar:true}).eq('id', t.id);
    if(error){
      t.klaar = false; sessieAf.delete(String(t.id));
      if(cb) cb.checked = false;
      return CRM.fout('Afvinken mislukt', error);
    }
  }
  rijAf(cb);
  CRM.toast('Taak afgerond','ok');
  CRM.navBadges();
}

/* Suggestieblok "acties over datum": de onderliggende kandidaat-acties
   worden echt als gedaan gemarkeerd (volgende_actie leeg). */
async function actiesBlokAf(cb){
  const ids = String(cb.dataset.ids||'').split(',').filter(Boolean);
  const oud = [];
  ids.forEach(id => {
    const rij = (CRM.state.cands||[]).find(c => String(c.id)===String(id));
    if(!rij) return;
    oud.push({rij, a:rij.volgende_actie, d:rij.actie_datum});
    rij.volgende_actie = ''; rij.actie_datum = null;
  });
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates')
      .update({volgende_actie:null, actie_datum:null}).in('id', ids);
    if(error){
      oud.forEach(x => { x.rij.volgende_actie = x.a; x.rij.actie_datum = x.d; });
      cb.checked = false;
      return CRM.fout('Afvinken mislukt', error);
    }
  }
  rijAf(cb);
  CRM.toast(ids.length===1?'Actie afgerond':`${ids.length} acties afgerond`,'ok');
  CRM.navBadges();
}

function vinkHandlers(root){
  CRM.$$('.tl2-vink', root).forEach(cb => {
    if(cb._klaar) return; cb._klaar = true;
    cb.onclick = e => e.stopPropagation();
    cb.onchange = () => {
      if(cb.disabled || !cb.checked) return;
      if(cb.dataset.taak) return taakAfvinken(cb.dataset.taak, cb);
      if(cb.dataset.blok === 'acties') return actiesBlokAf(cb);
      if(cb.dataset.ses){ sessieKlaar.add(sk(cb.dataset.ses)); rijAf(cb); CRM.toast('Afgevinkt','ok'); }
    };
  });
}

/* ═══ TEAMTARGET-CHIP (paginakop) ════════════════════════════════ */
function teamChipHTML(){
  const {netto} = CRM.plaatsingenMaand();
  const target = CRM.maandTarget();
  const pct = target>0 ? Math.max(0, Math.min(100, Math.round(netto/target*100))) : 0;
  return `<button type="button" class="team-chip" id="dash_team" title="Naar Performance">
    <span>Team deze maand: ${CRM.plusMin(netto)}<span class="tc-van num"> / ${target}</span></span>
    <span class="bar tc-bar"><i class="${pct>=100?'green':''}" style="width:${pct}%"></i></span>
  </button>`;
}

/* ═══ COCKPITREGEL — alleen de eigenaar ══════════════════════════ */
let _ck = null;
async function cockpitLezen(){
  if(_ck) return _ck;
  if(!CRM.canSeeMoney()) return (_ck = {ok:false});
  if(CRM.demo) return (_ck = {ok:false, demo:true});
  try{
    const [i,s,st] = await Promise.all([
      CRM.sb.from('fin_installments').select('bedrag_excl,geplande_datum,factuurdatum,status'),
      CRM.sb.from('fin_bank_saldo').select('datum,saldo'),
      CRM.sb.from('fin_settings').select('key,value')
    ]);
    if(i.error && s.error && st.error) return (_ck = {ok:false});
    const termijnen = i.error ? [] : (i.data||[]);
    const saldi = (s.error ? [] : (s.data||[])).slice().sort((a,b)=>String(b.datum).localeCompare(String(a.datum)));
    const S = st.error ? {} : Object.fromEntries((st.data||[]).map(r=>[r.key, r.value]));
    if(!termijnen.length && !saldi.length) return (_ck = {ok:false});

    const vandaag = VANDAAG(), mk = vandaag.slice(0,7);
    const bet = t => Number(t.bedrag_excl)||0;
    const dv = t => kort(t.factuurdatum || t.geplande_datum);
    const gefact = t => ['gefactureerd','betaald'].includes(t.status);
    const omzetMaand = termijnen.filter(t => gefact(t) && dv(t).slice(0,7)===mk).reduce((s2,t)=>s2+bet(t),0);

    /* Omzetdoel — zelfde principe als het doelblok op Performance. */
    const posNum = v => { const n = Number(v); return isFinite(n) && n>0 ? n : null; };
    const doelOmzet = posNum(S.doel_omzet) ?? posNum(S.doel_omzet_jaar);
    let doel = null;
    if(doelOmzet != null){
      let doelDatum = String(S.doel_omzet_datum||'').slice(0,10);
      if(doelDatum && doelDatum.length===7){ const [j,m]=doelDatum.split('-').map(Number); doelDatum = new Date(j,m,0).toLocaleDateString('sv-SE'); }
      if(!doelDatum || isNaN(new Date(doelDatum))) doelDatum = vandaag.slice(0,4)+'-12-31';
      const start = (posNum(S.doel_omzet)==null && !S.doel_omzet_datum)
        ? vandaag.slice(0,4)+'-01-01'
        : (()=>{ const d=new Date(doelDatum); d.setMonth(d.getMonth()-12); return d.toLocaleDateString('sv-SE'); })();
      const omzet = termijnen.filter(t => gefact(t) && dv(t) >= start && dv(t) <= vandaag).reduce((s2,t)=>s2+bet(t),0);
      doel = { pct: Math.min(100, Math.round(omzet/doelOmzet*100)) };
    }
    return (_ck = {ok:true, omzetMaand, saldo: saldi[0]?Number(saldi[0].saldo):null,
                   saldoDatum: saldi[0]?.datum||'', doel});
  }catch(e){ return (_ck = {ok:false}); }
}

function cockpitHTML(ck){
  if(ck?.demo) return `<div class="cockpit stil"><span class="label">Jouw cockpit</span>
    <span class="meta">financiële data is in demo-modus niet beschikbaar — log in met je eigen account voor omzetdoel, facturatie en banksaldo</span></div>`;
  if(!ck || !ck.ok) return '';
  const seg = [];
  if(ck.doel) seg.push(`<span class="ck-seg"><span class="meta">Omzetdoel</span>
    <b class="num">${ck.doel.pct}%</b><span class="bar ck-bar"><i class="${ck.doel.pct>=100?'green':''}" style="width:${ck.doel.pct}%"></i></span></span>`);
  seg.push(`<span class="ck-seg"><span class="meta">Gefactureerd deze maand</span><b class="num">${h(CRM.euro(ck.omzetMaand))}</b></span>`);
  if(ck.saldo != null) seg.push(`<span class="ck-seg"><span class="meta">Banksaldo</span>
    <b class="num${ck.saldo<0?' neg':''}">${h(CRM.euro(ck.saldo))}</b>
    ${ck.saldoDatum?`<span class="meta num">${h(CRM.fmtDateShort(ck.saldoDatum))}</span>`:''}</span>`);
  return `<div class="cockpit klik" data-mod="finance" title="Naar Finance">
    <span class="label">Jouw cockpit</span>${seg.join('<span class="ck-sep"></span>')}</div>`;
}

/* ═══ JE MAIL — een venster op de inbox, geen samenvatting ═══════
   Bewust géén interpretatie: alleen afzender, onderwerp en hoe lang het
   er staat. De toegevoegde waarde zit in de koppeling met het CRM —
   "dit is Rob van Koomstra" in plaats van een los mailadres. */
let _mail = null;                       // null = nog niet gelezen

/* Eén hulpje voor álle matching: e-mailadres → CRM-kaart.
   Hoofdletterongevoelig, spaties eraf, alleen velden die bestaan. */
const mailSleutel = a => String(a||'').trim().toLowerCase();

function koppelIndex(){
  const idx = new Map();
  const zet = (adres, rij) => { const k = mailSleutel(adres); if(k && !idx.has(k)) idx.set(k, rij); };
  /* Contactpersonen eerst: die zijn het meest specifiek (persoon bij klant). */
  (CRM.state.contacten||[]).forEach(ct =>
    zet(ct.email, {label: ct.klant || ct.naam || '', mod:'klanten', id: ct.klant || ''}));
  (CRM.state.clients||[]).forEach(k =>
    zet(k.email, {label: k.naam || '', mod:'klanten', id: k.naam || ''}));
  CRM.kandidaten().forEach(c =>
    zet(c.email, {label: c.naam || '', mod:'kandidaten', id: c.id, kandidaat:true}));
  return idx;
}
const koppelVan = (idx, mail) => idx.get(mailSleutel(mail && mail.van)) || null;

function mailRijHTML(m, k, compact){
  const link = /^https:\/\//i.test(String(m.link||'')) ? String(m.link) : '';
  const naam = m.vanNaam || m.van || 'onbekende afzender';
  /* Bij een kandidaat is het label vaak dezelfde naam — dan zegt "kandidaat"
     meer dan die naam nog een keer. */
  const zelfde = mailSleutel(k && k.label) === mailSleutel(naam);
  const label  = !k ? '' : (zelfde ? (k.kandidaat ? 'kandidaat' : 'klant') : k.label);
  const kop = label
    ? `<span class="mail-koppel" data-kmod="${h(k.mod)}" data-kid="${h(k.id)}" title="Naar de kaart in het CRM">${h(label)}</span>` : '';
  const binnen = `<span class="mail-stip${m.belangrijk?' hoog':''}"></span>
    <span class="mail-t">
      <span class="mail-van"><b>${h(naam)}</b>${kop}</span>
      <span class="mail-o">${h(m.onderwerp||'(geen onderwerp)')}</span>
    </span>
    <span class="mail-w meta num">${h(CRM.geleden(m.op))}</span>`;
  const kl = 'mail-rij' + (compact ? ' compact' : '');
  return link ? `<a class="${kl}" href="${h(link)}" target="_blank" rel="noopener">${binnen}</a>`
              : `<div class="${kl}">${binnen}</div>`;
}

function mailHTML(lijst){
  if(!lijst) return '';                                  /* geen koppeling of fout → blok weg */
  const idx = koppelIndex();
  const bekend = [], overig = [];
  lijst.forEach(m => { const k = koppelVan(idx, m); (k ? bekend : overig).push({m, k}); });

  let inhoud;
  if(!lijst.length){
    inhoud = `<div class="mail-leeg meta">Niets ongelezen.</div>`;
  }else if(!bekend.length){
    /* Niets herkend — dan geen loze kopjes, gewoon één lijst. */
    inhoud = lijst.map(m => mailRijHTML(m, null, false)).join('');
  }else{
    const rest = overig.map(x => mailRijHTML(x.m, null, true));
    inhoud = `<div class="mail-groep label">Van je klanten en kandidaten</div>
      ${bekend.map(x => mailRijHTML(x.m, x.k, false)).join('')}`
      + (rest.length ? `<div class="mail-groep label">Overig</div>
        ${rest.slice(0,3).join('')}
        ${rest.length>3 ? `<div class="mail-meer" hidden>${rest.slice(3).join('')}</div>
          <button type="button" class="mail-meerknop" id="mail_meer">Toon alle ${rest.length} →</button>` : ''}` : '');
  }

  const n = lijst.length;
  const kop = n
    ? `<div class="mail-kop meta"><b class="num">${n}</b> ongelezen${bekend.length?` — waarvan <b class="num">${bekend.length}</b> uit je pijplijn`:''}
       <span class="mail-per">· laatste 3 dagen</span></div>` : '';
  return `<div class="dash-sec">
    <div class="label sec-kop rij">Je mail
      <button type="button" class="mail-ver" id="mail_ver" title="Mail opnieuw ophalen">↻</button></div>
    <div class="card"><div class="card-b mail-b">${kop}${inhoud}</div></div></div>`;
}

/* Ophalen. Stil: mailInbox vraagt nooit om een login en geeft null
   terug als de koppeling er niet is. */
async function mailLezen(){
  if(_mail) return _mail;
  try{ return (_mail = {lijst: await CRM.outlook.mailInbox({ongelezen:true, aantal:8, sindsUren:72})}); }
  catch(e){ console.warn('mailInbox', e); return (_mail = {lijst:null}); }
}

function mailVullen(mount){
  const el = mount.querySelector('#dash_mail');
  if(!el || CRM.view!=='dashboard') return;
  el.innerHTML = mailHTML(_mail ? _mail.lijst : null);
  const meer = el.querySelector('#mail_meer');
  if(meer) meer.onclick = () => {
    const blok = el.querySelector('.mail-meer');
    if(blok) blok.hidden = false;
    meer.remove();
  };
  const ver = el.querySelector('#mail_ver');
  if(ver) ver.onclick = async () => {
    ver.disabled = true; _mail = null;
    await mailLezen();
    mailVullen(mount);
  };
  /* Het koppel-label zit ín de mail-link: klik hem apart af naar het CRM. */
  CRM.$$('.mail-koppel', el).forEach(s => s.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    if(s.dataset.kmod) CRM.ga(s.dataset.kmod, s.dataset.kid ? {id:s.dataset.kid} : {});
  });
}

/* ═══ RECHTERKOLOM ═══════════════════════════════════════════════ */
function meldingenBlok(){
  const ms = CRM.mijnMeldingen();
  if(!ms.length) return '';
  return `<div class="dash-sec"><div class="label sec-kop">Voor jou</div>
    <div class="card meld-card"><div class="card-b meld-b">
      ${ms.slice(0,6).map(m => `<div class="meld-rij" data-meld="${h(m.id)}" data-ent="${h(m.entiteit||'')}" data-ref="${h(m.ref||'')}">
        <span class="meld-stip"></span>
        <div class="meld-t"><span class="meld-tekst">${h(m.tekst)}</span>
          <span class="meld-w meta num">${h(CRM.geleden(m.created_at))}</span></div>
        <button type="button" class="meld-af" data-af="${h(m.id)}" title="Gezien, afhandelen">✓</button>
      </div>`).join('')}
      ${ms.length>6?`<div class="meta" style="padding:6px 0 2px">en nog ${ms.length-6} …</div>`:''}
    </div></div></div>`;
}

/* Hot vacatures van deze gebruiker — doellogica identiek aan de Hot-module. */
const EIND_FASES = ['Afgevallen','Gestopt'];
const SOORT_WOORD = { voorstellen:['voorstel','voorstellen'], gesprekken:['gesprek','gesprekken'], plaatsingen:['plaatsing','plaatsingen'] };
const doelWoord = (n, soort) => (SOORT_WOORD[soort]||SOORT_WOORD.voorstellen)[n===1?0:1];

function hotTelDoel(v){
  const vanaf = kort(v.doel_gezet_op);
  if(!vanaf || !v.doel_aantal) return 0;
  const cands = CRM.kandidaten().filter(c =>
    (c.vacatureId && String(c.vacatureId)===String(v.id)) ||
    (!c.vacatureId && c.klant===v.klant && c.functie===v.functie));
  const soort = v.doel_soort || 'voorstellen';
  const idxVoor = CRM.faseIdx('Voorgesteld'), idxGes = CRM.faseIdx('Eerste gesprek');
  return cands.filter(c => {
    if(soort==='plaatsingen') return !!c.geplaatstOp && kort(c.geplaatstOp) >= vanaf;
    const idx = soort==='gesprekken' ? idxGes : idxVoor;
    const hist = (c.historie||[]).some(x => {
      const i = CRM.faseIdx(x.fase);
      return (soort==='gesprekken' ? i>=idx : x.fase==='Voorgesteld') && !EIND_FASES.includes(x.fase) && kort(x.op) >= vanaf;
    });
    const nu = CRM.faseIdx(c.fase) >= idx && !EIND_FASES.includes(c.fase) && kort(c.since) >= vanaf;
    return hist || nu;
  }).length;
}

function hotBlok(){
  const mij = CRM.me();
  const hot = (CRM.state.vacs||[]).filter(v => v.hot && v.eigenaar === mij)
    .sort((a,b)=>(a.hot_prio||999)-(b.hot_prio||999)).slice(0,4);
  if(!hot.length) return '';
  const rijen = hot.map(v => {
    const doel = Number(v.doel_aantal)||0;
    const beh = doel ? hotTelDoel(v) : 0;
    const rest = v.deadline ? -CRM.dagenGeleden(v.deadline) : null;
    const urgent = rest != null && rest <= 0;
    const dl = !v.deadline ? '' : rest < 0 ? 'deadline gemist' : rest === 0 ? 'deadline vandaag'
      : rest === 1 ? 'deadline morgen' : 'deadline ' + CRM.fmtDay(v.deadline);
    const pct = doel ? Math.min(100, Math.round(beh/doel*100)) : 0;
    return `<div class="zij-rij klik" data-mod="hot">
      <div class="zij-t"><b>${h(v.klant)} — ${h(v.functie)}</b>
        <span class="zij-s"><span class="${urgent?'zij-urgent':''}">${h(dl)}</span>${doel?`${dl?' · ':''}<span class="num">${beh}/${doel}</span> ${h(doelWoord(doel, v.doel_soort))}`:''}</span></div>
      ${doel?`<div class="bar zij-bar"><i class="${beh>=doel?'green':''}" style="width:${pct}%"></i></div>`:''}
    </div>`;
  }).join('');
  return `<div class="dash-sec"><div class="label sec-kop">Hot vacatures</div>
    <div class="card"><div class="card-b zij-b">${rijen}</div></div></div>`;
}

function maandBlok(){
  const mij = CRM.me(), mk = VANDAAG().slice(0,7), cs = CRM.kandidaten();
  const get  = cs.filter(c => c.rec===mij && CRM.PLACED.includes(c.fase) && kort(c.geplaatstOp).slice(0,7)===mk).length;
  const stop = cs.filter(c => c.rec===mij && c.fase==='Gestopt' && kort(c.gestoptOp).slice(0,7)===mk).length;
  const netto = get - stop;
  const target = CRM.maandTarget();
  const ams = (CRM.state.profiles||[]).filter(p => (p.functie||'am') !== 'marketeer').length || 1;
  const aandeel = Math.max(1, Math.round(target/ams));
  const pct = Math.max(0, Math.min(100, Math.round(netto/aandeel*100)));
  /* Sparkline: eigen plaatsingen per maand, laatste 6 — richting, geen grafiek. */
  const nu = new Date(), perMnd = [];
  for(let i=5;i>=0;i--){
    const m2 = new Date(nu.getFullYear(), nu.getMonth()-i, 1).toLocaleDateString('sv-SE').slice(0,7);
    perMnd.push(cs.filter(c => c.rec===mij && CRM.PLACED.includes(c.fase) && kort(c.geplaatstOp).slice(0,7)===m2).length);
  }
  const spark = sparkline(perMnd);
  return `<div class="dash-sec"><div class="label sec-kop">Jouw maand</div>
    <div class="card klik" data-mod="performance" title="Naar Performance"><div class="card-b zij-b">
      <div class="zij-maand"><span class="big">${CRM.plusMin(netto)}</span><span class="zij-van num">/ ${aandeel}</span></div>
      ${CRM.ui.bar(pct, pct>=100?'green':'')}
      <div class="meta num" style="margin-top:8px">${get} getekend · ${stop} gestopt · jouw aandeel van teamtarget ${target}</div>
      ${spark?`<div class="zij-spark">${spark}<span class="meta">jouw plaatsingen per maand</span></div>`:''}
    </div></div></div>`;
}

/* Het blok "Signaal — de instroom is laag" was een hele kaart voor één zin.
   Ingedikt (rust, jul 2026) tot een oranje segment op de onderregel, waar de
   andere pijplijn-cijfers ook staan. Zie looptRegel(). */

/* ─── Marketeer-variant: vandaag posten + waakhond ────────────── */
let _mkt = null;
async function mktPostenLezen(){
  if(_mkt) return _mkt;
  if(CRM.demo){
    const nu = VANDAAG(), gister = dISO(Date.now()-DAG);
    return (_mkt = {ok:true, posts:[
      {titel:'Je salarisstrook uitgelegd', kanaal:'TikTok', datum:nu, fase:'Ingepland'},
      {titel:'Collega van de maand: Ionut', kanaal:'Instagram', datum:gister, fase:'Ingepland'},
      {titel:'Lassers gezocht in de regio Alphen', kanaal:'Facebook', datum:nu, fase:'Script klaar'}
    ]});
  }
  try{
    const r = await CRM.sb.from('mkt_posts').select('id,titel,kanaal,fase,publicatie_datum');
    if(r.error) return (_mkt = {ok:false});
    const nu = VANDAAG();
    const posts = (r.data||[])
      .filter(p => !['Gepubliceerd','Learnings'].includes(p.fase) && kort(p.publicatie_datum) && kort(p.publicatie_datum) <= nu)
      .map(p => ({titel:p.titel||'(zonder titel)', kanaal:p.kanaal||'', datum:kort(p.publicatie_datum), fase:p.fase||''}))
      .sort((a,b)=>a.datum.localeCompare(b.datum));
    return (_mkt = {ok:true, posts});
  }catch(e){ return (_mkt = {ok:false}); }
}
function postenHTML(m){
  const nu = VANDAAG();
  let inhoud;
  if(!m || !m.ok) inhoud = `<div class="meta">De marketingtabellen zijn nu niet bereikbaar.</div>`;
  else if(!m.posts.length) inhoud = `<div class="meta">Niets ingepland voor vandaag. De contentkalender staat in Marketing.</div>`;
  else inhoud = m.posts.slice(0,6).map(p => `<div class="zij-rij klik" data-mod="marketing">
      <div class="zij-t"><b>${h(p.titel)}</b>
        <span class="zij-s">${h(p.kanaal)}${p.fase?' · '+h(p.fase):''}</span></div>
      <span class="zij-w num${p.datum<nu?' zij-urgent':''}">${p.datum<nu?'over datum':'vandaag'}</span>
    </div>`).join('');
  return `<div class="dash-sec"><div class="label sec-kop">Vandaag posten</div>
    <div class="card"><div class="card-b zij-b">${inhoud}</div></div></div>`;
}
function waakhondBlok(){
  let n = 0; try{ n = Number(CRM.modules.marketing?.badge?.())||0; }catch(e){}
  return `<div class="dash-sec"><div class="label sec-kop">Waakhond</div>
    <div class="card klik" data-mod="marketing" title="Naar Marketing"><div class="card-b zij-b">
      <b>${n?`${n} open ${n===1?'punt':'punten'}`:'Geen openstaande adviezen bekend'}</b>
      <div class="sub">${n?'Adviezen en na te dragen resultaten staan klaar in Marketing.':'Open Marketing voor de actuele stand van de advertenties.'}</div>
    </div></div></div>`;
}

/* Mailkoppeling aan? Alleen dan reserveren we de plek; anders geen leeg kader. */
const mailAan = () => { try{ return !!CRM.outlook?.verbonden?.(); }catch(e){ return false; } };
const mailPlek = () => mailAan()
  ? `<div id="dash_mail">${_mail ? '' : `<div class="dash-sec"><div class="label sec-kop">Je mail</div>
      <div class="card"><div class="card-b mail-b"><div class="meta">Laden…</div></div></div></div>`}</div>` : '';

function kolomRechts(){
  const functie = (CRM.profile?.functie||'am');
  if(functie === 'marketeer')
    return mailPlek()
      + `<div id="dash_posten">${_mkt ? postenHTML(_mkt)
      : `<div class="dash-sec"><div class="label sec-kop">Vandaag posten</div><div class="card"><div class="card-b zij-b"><div class="meta">Laden…</div></div></div></div>`}</div>`
      + waakhondBlok() + meldingenBlok();
  return mailPlek() + hotBlok() + meldingenBlok() + maandBlok();
}

/* ═══ WAT LOOPT ER — één rustige regel onderaan ═════════════════
   Deze regel nam de tellingen over van de losse metaregel bóven de
   dagbaan (die stond er dubbel) en van het kaartje "Signaal". */
function looptRegel(){
  const cs = CRM.kandidaten(), wk = weekBereik();
  const kansen  = (CRM.state.kansen||[]).filter(k => (k.status||'open')==='open').length;
  const traject = (CRM.state.clients||[]).filter(k => CRM.SALES_ACTIEF.includes(k.fase)).length;
  const openLeads = (CRM.state.leads||[]).filter(l => CRM.LEAD_OPEN.includes(l.status)).length;
  const pijp = cs.filter(c => actief(c) && !CRM.PLACED.includes(c.fase)).length;
  const vacs = (CRM.state.vacs||[]).filter(v => (v.status||'Open')==='Open');
  const posities = vacs.reduce((s,v)=>s+(Number(v.aantal)||1),0);
  const leadsWeek = (CRM.state.leads||[]).filter(l => inBereik(l.binnen_op, wk.van, wk.tot)).length;
  const vroeg = cs.filter(c => ['Voorselectie','Voorgesteld'].includes(c.fase)).length;
  const seg = (mod, txt, kl='') => `<button type="button" class="loopt-i${kl}" data-mod="${h(mod)}">${h(txt)} →</button>`;
  return `<div class="loopt meta">
    ${seg('sales', `Sales: ${kansen} open kansen, ${traject} klanten in traject`)}
    ${seg('recruitment', `Recruitment: ${openLeads} sollicitanten, ${pijp} in de pijplijn`)}
    ${seg('hot', `Vacatures: ${vacs.length} open (${posities} posities)`)}
    ${seg('marketing', `Marketing: ${leadsWeek} leads deze week`)}
    ${vroeg < 3 ? seg('recruitment', `Let op: maar ${vroeg} in voorselectie of voorgesteld`, ' sig') : ''}
  </div>`;
}

/* ═══ REGISTRATIE ════════════════════════════════════════════════ */
CRM.registerModule('dashboard', {
  title:'Dashboard', icon:'◧', onderschrift:'Jouw werkdag in één baan',
  /* Zijbalkteller: ongelezen meldingen + mijn open taken t/m vandaag. */
  badge(){ try{
    const nu = VANDAAG(), mij = CRM.me();
    const openTaken = (CRM.state.taken||[]).filter(t =>
      !t.klaar && (!t.voor || t.voor===mij) && kort(t.datum) && kort(t.datum) <= nu).length;
    return CRM.mijnMeldingen().length + openTaken;
  }catch(e){ return 0; } },

  render(mount, acties){
    const P = bouwDag();
    const week = zicht()==='week';
    const W = week ? bouwWeek() : null;
    /* De voortgang gaat áltijd over vandaag, ook in weekweergave. */
    _vgTot = P.tot; _vgAf = P.af;
    const naam = String(CRM.me()||'').split(/\s+/)[0] || '';

    if(acties) acties.innerHTML = teamChipHTML() + `<button class="btn ghost sm" id="dash_ver">Vernieuwen</button>`;

    mount.innerHTML = `
      <div class="dash2">
        <section class="dash-hero">
          <div class="meta num dash-datum">${h(new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</div>
          <div class="h1">${h(groet())}${naam?', '+h(naam):''}</div>
          ${motivatieHTML()}
        </section>
        <div class="dash2-grid">
          <div class="dash2-hoofd">${tijdlijnKaart(P, W)}</div>
          <div class="zij">${kolomRechts()}</div>
        </div>
        ${looptRegel()}
      </div>`;

    /* Doorklikken — gedelegeerd, zodat ook later toegevoegde blokken werken. */
    mount.onclick = e => {
      if(e.target.closest('.tl2-vink') || e.target.closest('a') ||
         e.target.closest('[data-af]') || e.target.closest('.meld-rij')) return;
      const el = e.target.closest('[data-mod]');
      if(el) CRM.ga(el.dataset.mod, el.dataset.id ? {id:el.dataset.id} : {});
    };

    /* Motivatiezin wegklikken: voor de rest van vandaag. */
    const mx = document.getElementById('mot_x');
    if(mx) mx.onclick = e => {
      e.stopPropagation();
      try{ localStorage.setItem(MOT_KEY, VANDAAG()); }catch(err){}
      document.getElementById('dash_mot')?.remove();
    };

    /* Paginakop: teamtarget → Performance, Vernieuwen. */
    const tc = document.getElementById('dash_team');
    if(tc) tc.onclick = () => CRM.ga('performance');
    const ver = document.getElementById('dash_ver');
    if(ver) ver.onclick = () => CRM.herlaad();

    /* + Taak: het gedeelde taakvenster. */
    const nieuw = document.getElementById('tl2_nieuw');
    if(nieuw) nieuw.onclick = async () => {
      const rij = await CRM.taakModal({});
      if(rij && CRM.view==='dashboard') CRM.render();
    };

    /* Afvinken in de tijdlijn. */
    vinkHandlers(mount);

    /* Vandaag ↔ Week. De keuze staat in localStorage en overleeft een herlaad. */
    CRM.$$('.tl2-seg button', mount).forEach(b => b.onclick = () => {
      if(b.classList.contains('on')) return;
      zetZicht(b.dataset.zicht);
      CRM.render();
    });

    /* Compact ↔ hele dagbaan, en losse lege stukken openklappen. */
    const volKnop = document.getElementById('tl2_vol');
    if(volKnop) volKnop.onclick = () => { zetDagVol(!dagVol()); CRM.render(); };
    CRM.$$('.tl2-vouw', mount).forEach(v => {
      v.onclick = () => vouwOpen(v, P);
      v.onkeydown = e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); vouwOpen(v, P); } };
    });

    /* Meldingen: ✓ handelt af, klik op de regel navigeert naar de bron. */
    CRM.$$('[data-af]', mount).forEach(b => b.onclick = async e => {
      e.stopPropagation();
      await CRM.meldingGelezen(b.dataset.af);
      const rij = b.closest('.meld-rij'), sec = b.closest('.dash-sec');
      if(rij) rij.remove();
      if(sec && !sec.querySelector('.meld-rij')) sec.remove();
    });
    CRM.$$('.meld-rij', mount).forEach(r => {
      r.onclick = e => {
        if(e.target.closest('[data-af]')) return;
        const ent = r.dataset.ent, ref = r.dataset.ref;
        if(ent==='klant') CRM.ga('klanten',{id:ref});
        else if(ent==='kandidaat') CRM.ga('kandidaten',{id:ref});
        else if(ent==='lead') CRM.ga('recruitment',{id:ref});
        else{
          const kaart = mount.querySelector('.tl2-card');
          if(kaart){ kaart.scrollIntoView({behavior:'smooth', block:'start'});
            kaart.classList.add('flits'); setTimeout(()=>kaart.classList.remove('flits'), 1400); }
        }
      };
    });

    /* Outlook: verbinden, of de afspraken erbij mengen. Ontbreekt de
       koppeling, dan blijven dag én week gewoon de CRM-items tonen. */
    const ob = document.getElementById('tl2_ol');
    if(ob) ob.onclick = async () => { if(await CRM.outlook.verbind()) CRM.render(); };
    if(CRM.outlook.beschikbaar() && CRM.outlook.verbonden()){
      const olSub = ev => 'Outlook' + (ev.locatie?' · '+h(ev.locatie):'') +
        (ev.online?` · <a href="${h(ev.online)}" target="_blank" rel="noopener">Teams</a>`:'');

      if(!week){
        CRM.outlook.agenda(1).then(items => {
          if(!items || !items.length || CRM.view!=='dashboard' || zicht()!=='dag') return;
          let geplaatst = 0;
          items.forEach(ev => {
            const tijd = String(ev.start||'').slice(11,16);
            const uur = Math.max(START_UUR, Math.min(EIND_UUR-1, parseInt(tijd,10)||START_UUR));
            const it = { soort:'outlook', sesKey:'ol:'+tijd+String(ev.titel||'').slice(0,20),
              titel: ev.titel||'(zonder onderwerp)', tijd, subHtml: olSub(ev) };
            it.af = sessieKlaar.has(sk(it.sesKey));
            (P.uren[uur] = P.uren[uur] || []).unshift(it);
            geplaatst++; if(it.af) _vgAf++;
          });
          if(!geplaatst) return;
          _vgTot += geplaatst;
          /* De baan opnieuw tekenen: dan komt een uur dat compact was
             weggevouwen er vanzelf bij staan. */
          const body = mount.querySelector('.tl2-card .card-b.tl2-b');
          if(body){
            body.innerHTML = dagBaanHTML(P);
            CRM.$$('.tl2-vouw', body).forEach(v => {
              v.onclick = () => vouwOpen(v, P);
              v.onkeydown = e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); vouwOpen(v, P); } };
            });
          }
          vgTeken(); vinkHandlers(mount);
        }).catch(()=>{});
      }else{
        /* agenda(7) loopt vanaf nu; alles buiten deze week valt vanzelf af. */
        CRM.outlook.agenda(7).then(items => {
          if(!items || !items.length || CRM.view!=='dashboard' || zicht()!=='week') return;
          let raak = 0;
          items.forEach(ev => {
            const d = (W||[]).find(x => x.iso === String(ev.start||'').slice(0,10));
            if(!d) return;
            d.items.push({ soort:'outlook', geenVink:true,
              titel: ev.titel||'(zonder onderwerp)', tijd:String(ev.start||'').slice(11,16),
              subHtml: olSub(ev) });
            raak++;
          });
          if(!raak) return;
          W.forEach(sorteerDag);
          /* De hele weekbaan opnieuw tekenen: dan komt een weekenddag die
             alleen een Outlook-afspraak heeft er ook echt bij. */
          const baan = mount.querySelector('.tl2-week');
          if(baan) baan.outerHTML = weekBaanHTML(W);
          vinkHandlers(mount);
        }).catch(()=>{});
      }
    }

    /* Je mail: één stille aanroep bij het openen van het dashboard. */
    if(mailAan()){
      if(_mail) mailVullen(mount);
      else mailLezen().then(() => mailVullen(mount)).catch(()=>{});
    }

    /* Cockpitregel bewust VERWIJDERD (wens Tjeerd): banksaldo/omzet horen in
       Finance — het dashboard staat vaak open waar collega's meekijken. */

    /* Marketeer: geplande posts nalezen (defensief, geen module-duplicatie). */
    if((CRM.profile?.functie||'') === 'marketeer'){
      mktPostenLezen().then(m => {
        const el = document.getElementById('dash_posten');
        if(el && CRM.view==='dashboard') el.innerHTML = postenHTML(m);
      }).catch(()=>{});
    }
  }
});

})();
