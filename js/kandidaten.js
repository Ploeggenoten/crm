/* ═══════════════════════════════════════════════════════════════
   MODULE: KANDIDATEN
   Overzicht van alle kandidaten + de kandidatenkaart: het complete
   profiel, wat er nog mist, hoelang je niemand gesproken hebt en
   bij welke vacature deze kandidaat past (profiel + woonlocatie).
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Voorkeuren onthouden (crm_kandidaten_*) ─────────────────── */
const P = {
  get(k,d){ try{ const v = localStorage.getItem('crm_kandidaten_'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('crm_kandidaten_'+k, JSON.stringify(v)); }catch(e){} }
};
const F = {
  zoek:   P.get('zoek',''),
  fase:   P.get('fase',''),
  rec:    P.get('rec',''),
  klant:  P.get('klant',''),
  status: P.get('status','lopend'),
  mijn:   P.get('mijn',false),
  sort:   P.get('sort','gesproken')
};
function zet(k,v){ F[k]=v; P.set(k,v); }

const uniek = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'nl'));
const faseChip = (fase, extra='') => fase
  ? `<span class="chip ${extra}"><i class="dot" style="background:${CRM.faseKleur(fase)}"></i>${h(fase)}</span>` : '';
const telLink = t => 'tel:' + String(t||'').replace(/[^0-9+]/g,'');
const waLink  = t => { let n = String(t||'').replace(/[^0-9]/g,''); if(n.startsWith('06')) n = '31'+n.slice(1); if(n.startsWith('00')) n = n.slice(2); return 'https://wa.me/'+n; };
/* Alleen echte weblinks openen — een `javascript:`-URL in een CV-veld mag
   niet uitgevoerd worden als iemand erop klikt. */
const veiligeUrl = u => { const s = String(u||'').trim(); return /^(https?:|blob:)/i.test(s) ? s : ''; };

/* ─── Woonlocatie: afstand kandidaat ↔ vacature ───────────────
   Coördinaten van de plaatsen waar wij werken. Zo kan het systeem
   uitleggen waaróm iemand bij een vacature past.               */
const PLAATSEN = {
  'rotterdam':[51.924,4.478], 'denhaag':[52.078,4.288], 'sgravenhage':[52.078,4.288],
  'gouda':[52.011,4.711], 'alphena/drijn':[52.129,4.655], 'zoetermeer':[52.057,4.494],
  'leiden':[52.160,4.490], 'bodegraven':[52.081,4.749], 'waddinxveen':[52.045,4.653],
  'delft':[52.011,4.357], 'katwijk':[52.203,4.399], 'schiedam':[51.919,4.389],
  'vlaardingen':[51.912,4.341], 'rijnsburg':[52.190,4.443], 'zaandam':[52.439,4.826],
  'barendrecht':[51.855,4.535], 'nieuwkoop':[52.148,4.777], 'sliedrecht':[51.822,4.774],
  'bunnik':[52.065,5.199], 'nieuwvennep':[52.265,4.630], 'maasdijk':[51.981,4.196],
  'almere':[52.370,5.216], 'ijmuiden':[52.460,4.610], 'krimpena/dijssel':[51.917,4.593],
  'nunspeet':[52.378,5.784], 'bleiswijk':[52.019,4.531], 'utrecht':[52.090,5.121],
  'amsterdam':[52.370,4.895], 'dordrecht':[51.813,4.690], 'zwijndrecht':[51.817,4.633],
  'spijkenisse':[51.845,4.329], 'capellea/dijssel':[51.930,4.577], 'ridderkerk':[51.872,4.602],
  'hoofddorp':[52.303,4.689], 'amstelveen':[52.309,4.856], 'woerden':[52.086,4.884],
  'zeist':[52.088,5.233], 'rijswijk':[52.036,4.325], 'voorburg':[52.070,4.360],
  'naaldwijk':[51.994,4.208], 'pijnacker':[52.019,4.432], 'berkelenrodenrijs':[51.995,4.481],
  'boskoop':[52.075,4.653], 'zevenhuizen':[52.010,4.610], 'moordrecht':[51.985,4.663],
  'nieuwerkerka/dijssel':[51.975,4.615], 'papendrecht':[51.831,4.685], 'hendrikidoambacht':[51.843,4.640],
  'oudbeijerland':[51.826,4.412], 'maassluis':[51.923,4.253], 'delier':[51.968,4.253],
  'wateringen':[52.020,4.283], 'monster':[52.023,4.170], 'nootdorp':[52.040,4.400],
  'leidschendam':[52.086,4.400], 'wassenaar':[52.146,4.400], 'voorschoten':[52.128,4.446],
  'oegstgeest':[52.180,4.470], 'noordwijk':[52.240,4.443], 'sassenheim':[52.223,4.523],
  'lisse':[52.257,4.557], 'hillegom':[52.290,4.583], 'haarlem':[52.381,4.637],
  'alkmaar':[52.632,4.749], 'purmerend':[52.505,4.960], 'lelystad':[52.518,5.471],
  'amersfoort':[52.156,5.388], 'apeldoorn':[52.211,5.970], 'arnhem':[51.985,5.899],
  'nijmegen':[51.842,5.853], 'breda':[51.586,4.776], 'shertogenbosch':[51.697,5.304],
  'eindhoven':[51.441,5.470], 'tilburg':[51.560,5.091], 'gorinchem':[51.837,4.975],
  'vianen':[51.988,5.093], 'culemborg':[51.955,5.226], 'veenendaal':[52.028,5.554]
};
function plaatsSleutel(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\baan\s+de[nr]?\s+/g,'a/d ').replace(/[^a-z0-9/]/g,'');
}
function afstandKm(a, b){
  const pa = PLAATSEN[plaatsSleutel(a)], pb = PLAATSEN[plaatsSleutel(b)];
  if(!pa || !pb) return null;
  const R = 6371, rad = d => d*Math.PI/180;
  const dLat = rad(pb[0]-pa[0]), dLon = rad(pb[1]-pa[1]);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(pa[0]))*Math.cos(rad(pb[0]))*Math.sin(dLon/2)**2;
  return Math.round(2*R*Math.asin(Math.sqrt(x)));
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
    const km = afstandKm(c.woonplaats, plaats);
    if(plaatsSleutel(c.woonplaats) === plaatsSleutel(plaats)) delen.push('woont in ' + c.woonplaats + ' — zelfde plaats');
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
      const km = afstandKm(c.woonplaats, v.locatie);
      const score = CRM.matchScore(c, v);
      if(km != null && km <= 25 && score >= 20) uit.push({vacature:v, score, dichtbij:true});
    });
  }
  return uit.map(m => Object.assign({}, m, {km:afstandKm(c.woonplaats, m.vacature.locatie)}))
    .sort((a,b) => b.score - a.score).slice(0,5);
}

/* ─── Laatst gesproken ────────────────────────────────────────── */
function laatstGesproken(c){
  const alle = CRM.activiteitenVoor('kandidaat', c.id).map(a => a.op)
    .concat((c.notities||[]).map(n => n.op)).filter(Boolean).sort();
  return alle.length ? alle[alle.length-1] : null;
}
/* "X dagen niet gesproken". Nooit gesproken? Dan telt hoelang iemand al in
   de pijplijn zit — dat is precies het risico dat we willen zien. */
function stilte(c){
  const lg = laatstGesproken(c);
  if(lg){
    const d = CRM.dagenGeleden(lg);
    return {d, tekst:CRM.geleden(lg), kleur: d>=14 ? 'red' : d>=7 ? 'amber' : ''};
  }
  const w = CRM.dagenGeleden(c.since);
  return {d:null, tekst:'nooit gesproken', kleur: w!=null && w>=14 ? 'red' : w!=null && w>=7 ? 'amber' : ''};
}
function stilteChip(c){
  const s = stilte(c);
  if(s.d == null) return `<span class="chip ${s.kleur}">Nog nooit gesproken</span>`;
  if(s.d === 0)   return '<span class="chip green">Vandaag gesproken</span>';
  return `<span class="chip ${s.kleur}"><span class="num">${s.d}</span> dagen niet gesproken</span>`;
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
   OVERZICHT
   ═══════════════════════════════════════════════════════════════ */
function overzicht(mount, acties){
  acties.innerHTML = '';
  const alle = CRM.kandidaten();
  mount.innerHTML = `
    <div class="stack">
      <div class="card pad">
        <div class="row kd-fil">
          <div class="searchbox" style="flex:1;max-width:290px">
            <input type="search" id="kd_zoek" autocomplete="off" placeholder="Zoek op naam, functie of woonplaats…" value="${h(F.zoek)}">
          </div>
          <select id="kd_status" style="width:auto">
            <option value="lopend"${F.status==='lopend'?' selected':''}>Lopende trajecten</option>
            <option value="alle"${F.status==='alle'?' selected':''}>Alle kandidaten</option>
            <option value="geplaatst"${F.status==='geplaatst'?' selected':''}>Geplaatst</option>
            <option value="recyclebaar"${F.status==='recyclebaar'?' selected':''}>Afgevallen — herbruikbaar</option>
          </select>
          <select id="kd_fase" style="width:auto">
            <option value="">Alle fases</option>
            ${CRM.PHASES.map(p=>`<option value="${h(p.k)}"${F.fase===p.k?' selected':''}>${h(p.k)}</option>`).join('')}
          </select>
          <select id="kd_rec" style="width:auto">
            <option value="">Alle recruiters</option>
            ${uniek(alle.map(c=>c.rec)).map(r=>`<option value="${h(r)}"${F.rec===r?' selected':''}>${h(r)}</option>`).join('')}
          </select>
          <select id="kd_klant" style="width:auto">
            <option value="">Alle klanten</option>
            ${uniek(alle.map(c=>c.klant)).map(r=>`<option value="${h(r)}"${F.klant===r?' selected':''}>${h(r)}</option>`).join('')}
          </select>
          <select id="kd_sort" style="width:auto">
            <option value="gesproken"${F.sort==='gesproken'?' selected':''}>Langst niet gesproken</option>
            <option value="naam"${F.sort==='naam'?' selected':''}>Naam</option>
            <option value="fase"${F.sort==='fase'?' selected':''}>Fase</option>
            <option value="volledigheid"${F.sort==='volledigheid'?' selected':''}>Minst volledig</option>
          </select>
          <span class="chip btn-like${F.mijn?' on':''}" id="kd_mijn">Mijn kandidaten</span>
          <span class="spacer"></span>
          <span class="meta num" id="kd_telling"></span>
        </div>
      </div>
      <div id="kd_lijst"></div>
    </div>`;

  const zoekEl = mount.querySelector('#kd_zoek');
  zoekEl.oninput = CRM.debounce(() => { zet('zoek', zoekEl.value); lijst(mount); }, 200);
  ['status','fase','rec','klant','sort'].forEach(k =>
    mount.querySelector('#kd_'+k).onchange = e => { zet(k, e.target.value); lijst(mount); });
  mount.querySelector('#kd_mijn').onclick = e => { zet('mijn', !F.mijn); e.target.classList.toggle('on', F.mijn); lijst(mount); };
  lijst(mount);
}

function gefilterd(){
  const q = String(F.zoek||'').trim().toLowerCase();
  const rijen = CRM.kandidaten().filter(c => {
    if(F.status === 'lopend'      && CRM.DONE.includes(c.fase)) return false;
    if(F.status === 'geplaatst'   && !CRM.PLACED.includes(c.fase)) return false;
    if(F.status === 'recyclebaar' && !(c.fase === 'Afgevallen' && c.recyclebaar !== false)) return false;
    if(F.fase  && c.fase  !== F.fase)  return false;
    if(F.rec   && c.rec   !== F.rec)   return false;
    if(F.klant && c.klant !== F.klant) return false;
    if(F.mijn  && !CRM.isVanMij(c))    return false;
    if(q && ![c.naam,c.functie,c.woonplaats,c.klant,c.email,c.telefoon].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).map(c => ({c, lg:laatstGesproken(c), st:stilte(c), v:CRM.volledigheid(c)}));

  const srt = {
    gesproken:    (a,b) => ((CRM.dagenGeleden(b.lg) == null ? 9999 : CRM.dagenGeleden(b.lg)) - (CRM.dagenGeleden(a.lg) == null ? 9999 : CRM.dagenGeleden(a.lg))),
    naam:         (a,b) => a.c.naam.localeCompare(b.c.naam,'nl'),
    fase:         (a,b) => CRM.faseIdx(a.c.fase) - CRM.faseIdx(b.c.fase) || a.c.naam.localeCompare(b.c.naam,'nl'),
    volledigheid: (a,b) => a.v.pct - b.v.pct
  }[F.sort];
  if(srt) rijen.sort(srt);
  return rijen;
}

function lijst(mount){
  const rijen = gefilterd();
  const wrap = mount.querySelector('#kd_lijst');
  const tel  = mount.querySelector('#kd_telling');
  const dun  = rijen.filter(r => r.v.pct < 60).length;
  if(tel) tel.textContent = rijen.length + (rijen.length===1?' kandidaat':' kandidaten') + (dun?' · '+dun+' onvolledig':'');

  if(!rijen.length){
    wrap.innerHTML = CRM.ui.leeg('Geen kandidaten gevonden','Pas je zoekopdracht of filters aan.');
    return;
  }
  wrap.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr>
      <th>Kandidaat</th><th>Klant</th><th>Fase</th><th>Woonplaats</th><th>Recruiter</th>
      <th>Laatst gesproken</th><th>Profiel</th>
    </tr></thead><tbody>${rijen.map(({c,st,v}) => {
      const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : '';
      return `<tr class="clickable" data-id="${h(String(c.id))}">
        <td><div class="row tight" style="flex-wrap:nowrap">${CRM.avatar(c.naam,'sm')}
          <div style="min-width:0"><b>${h(c.naam)}</b><div class="rowsub">${h(c.functie||'—')}</div></div></div></td>
        <td class="sub">${h(c.klant||'—')}</td>
        <td>${faseChip(c.fase)}</td>
        <td class="sub">${h(c.woonplaats||'—')}</td>
        <td class="sub">${h(c.rec||'—')}</td>
        <td class="sub num${st.kleur==='red'?' kd-let':st.kleur==='amber'?' kd-warn':''}">${h(st.tekst)}</td>
        <td><div class="kd-vol">${CRM.ui.bar(v.pct, kleur)}<span class="meta num">${v.pct}%</span></div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  wrap.querySelectorAll('[data-id]').forEach(tr => tr.onclick = () => CRM.ga('kandidaten',{id:tr.dataset.id}));
}

/* ═══════════════════════════════════════════════════════════════
   KANDIDATENKAART
   ═══════════════════════════════════════════════════════════════ */
let kandOpen = null, tabActief = 'activiteiten';

/* Inline bewerkbare velden — pad 'cv.x' schrijft in het cv-jsonb. */
const VELDEN = [
  {k:'naam',        lbl:'Naam',              t:'text'},
  {k:'telefoon',    lbl:'Telefoon',          t:'tel'},
  {k:'email',       lbl:'E-mail',            t:'email'},
  {k:'woonplaats',  lbl:'Woonplaats',        t:'text'},
  {k:'functie',     lbl:'Gezochte functie',  t:'text'},
  {k:'bron',        lbl:'Bron',              t:'select', opts:['', ...CRM.LEAD_BRONNEN]},
  {k:'maandloon',   lbl:'Maandloon',         t:'number', toon:v => v ? CRM.euro(v) : ''},
  {k:'toeslagPct',  lbl:'Toeslagen',         t:'number', toon:v => v ? CRM.pct(v) : ''},
  {k:'cv.salariswens', lbl:'Salariswens',    t:'text'},
  {k:'cv.beschikbaar', lbl:'Beschikbaarheid',t:'text'},
  {k:'cv.rijbewijs',   lbl:'Rijbewijs',      t:'select', opts:['','Ja','Nee']},
  {k:'cv.vervoer',     lbl:'Vervoer',        t:'select', opts:['','Eigen auto','OV','Fiets','Geen']},
  {k:'cv.talen',       lbl:'Talen',          t:'text', lijst:true}
];
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

  acties.innerHTML = `
    <button class="btn ghost sm" id="c_terug">← Overzicht</button>
    <button class="btn ghost sm" id="c_bel">Gebeld</button>
    <button class="btn ghost sm" id="c_app">Geappt</button>
    <button class="btn ghost sm" id="c_notitie">Notitie</button>
    <button class="btn sm" id="c_taak">Taak</button>`;
  acties.querySelector('#c_terug').onclick   = () => CRM.ga('kandidaten');
  acties.querySelector('#c_bel').onclick     = () => logVia(c,'bel','Wat is er besproken?');
  acties.querySelector('#c_app').onclick     = () => logVia(c,'whatsapp','Wat heb je gestuurd?');
  acties.querySelector('#c_notitie').onclick = () => notitieToevoegen(c);
  acties.querySelector('#c_taak').onclick    = () => taakModal(c);

  mount.innerHTML = `
    <div class="stack">
      ${kopHtml(c)}
      <div class="grid c2 kd-kolommen">
        <div class="stack">
          ${gegevensHtml(c)}
          ${cvHtml(c)}
          ${intakeHtml(c)}
        </div>
        <div class="stack">
          ${kansenHtml(c)}
          ${trajectHtml(c)}
        </div>
      </div>
      <div>
        <div class="tabs" id="c_tabs">${tabsHtml(c)}</div>
        <div id="c_tabinhoud"></div>
      </div>
    </div>`;

  bindVelden(mount, c);
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

function kopHtml(c){
  const v = CRM.volledigheid(c);
  const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : 'green';
  const besch = (c.cv && c.cv.beschikbaar) || (c.start ? 'Start ' + CRM.fmtDate(c.start) : '');
  return `<div class="card"><div class="card-b kd-hero">
    ${CRM.avatar(c.naam,'lg')}
    <div style="min-width:0;flex:1">
      <div class="h1" style="font-size:24px">${h(c.naam)}</div>
      <div class="sub" style="margin-top:3px">
        ${h(c.functie||'Functie nog niet ingevuld')}
        ${c.klant?` · <a href="#klanten/${encodeURIComponent(c.klant)}" data-klant="${h(c.klant)}">${h(c.klant)}</a>`:''}
        ${c.woonplaats?' · '+h(c.woonplaats):''}
      </div>
      <div class="row tight" style="margin-top:9px">
        ${faseChip(c.fase)}
        ${besch?`<span class="chip">${h(besch)}</span>`:''}
        ${c.rec?`<span class="chip">Recruiter ${h(c.rec)}</span>`:''}
        ${c.type?`<span class="chip">${h(c.type)}</span>`:''}
        ${stilteChip(c)}
        ${c.noShows?`<span class="chip red"><span class="num">${c.noShows}</span> no-show</span>`:''}
      </div>
      <div class="kd-contact">
        ${c.telefoon?`<a class="num" href="${h(telLink(c.telefoon))}">${h(c.telefoon)}</a>
          <a class="btn sub sm" href="${h(waLink(c.telefoon))}" target="_blank" rel="noopener">WhatsApp</a>`:'<span class="meta">Geen telefoonnummer</span>'}
        ${c.email?`<a href="mailto:${h(c.email)}">${h(c.email)}</a>`:'<span class="meta">Geen e-mailadres</span>'}
      </div>
    </div>
    <div class="kd-meter">
      <div class="label">Profiel compleet</div>
      <div class="row tight" style="flex-wrap:nowrap;margin:6px 0 8px">
        <div style="flex:1">${CRM.ui.bar(v.pct, kleur==='green'?'green':kleur)}</div>
        <b class="num">${v.pct}%</b>
      </div>
      ${v.mist.length
        ? `<div class="meta">Nog invullen: ${v.mist.map(m=>h(m.lbl.toLowerCase())).join(', ')}</div>`
        : '<div class="meta">Alles ingevuld — netjes.</div>'}
    </div>
  </div></div>`;
}

/* ─── Kandidaatgegevens (inline bewerkbaar) ───────────────────── */
function gegevensHtml(c){
  return `<div class="card">
    <div class="card-h"><div class="h2">Kandidaatgegevens</div>
      <span class="meta">klik een waarde om te wijzigen</span></div>
    <div class="card-b"><div class="kd-velden">${VELDEN.map(f => {
      const w = toonWaarde(f, lees(c, f.k));
      return `<div class="kd-veld"><span class="label">${h(f.lbl)}</span>
        <span class="kd-w${w?'':' leeg'}" data-veld="${h(f.k)}" tabindex="0" role="button">${w?h(w):'invullen…'}</span></div>`;
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
  const veld = VELDEN.find(f => f.k === span.dataset.veld);
  const ruw  = lees(c, veld.k);
  const start = veld.lijst ? (Array.isArray(ruw) ? ruw.join(', ') : (ruw||'')) : (ruw == null ? '' : String(ruw));
  const el = veld.t === 'select'
    ? Object.assign(document.createElement('select'), {innerHTML:
        veld.opts.map(o => `<option value="${h(o)}"${String(start)===o?' selected':''}>${h(o||'—')}</option>`).join('')})
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
    if(bewaren) meterBij(c);
  };
  el.onblur = () => sluit(true);
  el.onkeydown = e => {
    if(e.key === 'Enter'){ e.preventDefault(); sluit(true); }
    if(e.key === 'Escape'){ e.preventDefault(); sluit(false); }
  };
  if(veld.t === 'select') el.onchange = () => sluit(true);
}

/* Volledigheidsmeter bijwerken zonder het hele scherm te hertekenen. */
function meterBij(c){
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

/* ─── CV & ervaring ───────────────────────────────────────────── */
function cvHtml(c){
  const cv = c.cv || {};
  const werk = Array.isArray(cv.werkgevers) ? cv.werkgevers : [];
  const opl  = Array.isArray(cv.opleidingen) ? cv.opleidingen : [];
  const skills = Array.isArray(cv.skills) ? cv.skills : [];
  const leeg = !werk.length && !opl.length && !skills.length && !cv.ervaringJaren && !cv.url;
  return `<div class="card">
    <div class="card-h"><div class="h2">CV &amp; ervaring</div>
      ${cv.ervaringJaren?`<span class="chip"><span class="num">${h(cv.ervaringJaren)}</span> jaar ervaring</span>`:''}
      ${veiligeUrl(cv.url)?`<span class="spacer"></span><a class="btn ghost sm" href="${h(veiligeUrl(cv.url))}" target="_blank" rel="noopener">CV openen</a>`:''}</div>
    <div class="card-b">${leeg ? CRM.ui.leeg('Nog geen CV-gegevens','Zodra een CV is verwerkt verschijnen werkgevers, opleidingen en vaardigheden hier.') : `
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
      ${skills.length?`<div class="label" style="margin-top:16px">Vaardigheden</div>
        <div class="row tight" style="margin-top:8px">${skills.map(s=>`<span class="chip">${h(s)}</span>`).join('')}</div>`:''}
      ${Array.isArray(cv.talen)&&cv.talen.length?`<div class="label" style="margin-top:16px">Talen</div>
        <div class="row tight" style="margin-top:8px">${cv.talen.map(s=>`<span class="chip">${h(s)}</span>`).join('')}</div>`:''}
    `}</div></div>`;
}

/* ─── Intake ──────────────────────────────────────────────────── */
function intakeHtml(c){
  const i = c.intake;
  if(!i) return `<div class="card"><div class="card-h"><div class="h2">Intake</div></div>
    <div class="card-b">${CRM.ui.leeg('Geen intake vastgelegd','Vul het intakeformulier in bij het eerste gesprek — dat voorkomt verrassingen later.')}</div></div>`;
  const cijfer = Number(i.cijfer || i.commitment || 0);
  const rest = Object.keys(i).filter(k => !['cijfer','commitment','drijfveer','drijfveren','risico','risicos','op','door'].includes(k));
  return `<div class="card">
    <div class="card-h"><div class="h2">Intake</div>
      ${cijfer?`<span class="chip${cijfer<7?' amber':' green'}">Commitment <span class="num">${cijfer}</span>/10</span>`:''}
      <span class="spacer"></span>
      <span class="meta num">${h(i.op?CRM.fmtDate(i.op):'')}${i.door?' · '+h(i.door):''}</span></div>
    <div class="card-b">
      ${cijfer && cijfer < 7 ? '<div class="note warn" style="margin-bottom:14px">Commitmentcijfer onder de 7 — bespreek de twijfel vóór je voorstelt.</div>' : ''}
      <div class="kd-velden">
        ${(i.drijfveer||i.drijfveren)?`<div class="kd-veld"><span class="label">Drijfveren</span><span>${h(i.drijfveer||i.drijfveren)}</span></div>`:''}
        ${(i.risico||i.risicos)?`<div class="kd-veld"><span class="label">Risico's</span><span>${h(i.risico||i.risicos)}</span></div>`:''}
        ${rest.map(k=>`<div class="kd-veld"><span class="label">${h(k)}</span><span>${h(typeof i[k]==='object'?JSON.stringify(i[k]):i[k])}</span></div>`).join('')}
      </div>
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
function trajectHtml(c){
  const idx = CRM.faseIdx(c.fase);
  const stappen = CRM.PHASES.slice(0,11);
  return `<div class="card">
    <div class="card-h"><div class="h2">Traject</div>
      ${c.klant?`<span class="spacer"></span><a class="btn ghost sm" href="#klanten/${encodeURIComponent(c.klant)}" data-klant="${h(c.klant)}">Naar klantkaart</a>`:''}</div>
    <div class="card-b">
      <div class="kd-velden">
        <div class="kd-veld"><span class="label">Huidige fase</span><span>${h(c.fase)} <span class="meta num">sinds ${h(CRM.fmtDate(c.since)||'—')}</span></span></div>
        ${c.volgendeActie?`<div class="kd-veld"><span class="label">Volgende actie</span><span>${h(c.volgendeActie)} <span class="meta num">${h(CRM.fmtDate(c.actieDatum)||'')}</span></span></div>`:''}
        ${c.datum?`<div class="kd-veld"><span class="label">Afspraak</span><span class="num">${h(CRM.fmtDay(c.datum))}${c.tijd?' · '+h(c.tijd):''}</span></div>`:''}
        ${c.start?`<div class="kd-veld"><span class="label">Startdatum</span><span class="num">${h(CRM.fmtDate(c.start))}</span></div>`:''}
        ${c.afvalCat?`<div class="kd-veld"><span class="label">Reden afval</span><span>${h(c.afvalCat)}</span></div>`:''}
        ${c.stopCat?`<div class="kd-veld"><span class="label">Reden stop</span><span>${h(c.stopCat)}${c.stopDoor?' ('+h(c.stopDoor)+')':''}</span></div>`:''}
      </div>
      <div class="kd-stappen">${stappen.map((p,i) =>
        `<i class="${i<=idx&&idx>=0?'on':''}" style="${i<=idx&&idx>=0?'background:'+p.c:''}" title="${h(p.k)}"></i>`).join('')}</div>
      <div class="meta">${idx>=0&&idx<11?`Stap <span class="num">${idx+1}</span> van <span class="num">11</span>`:h(c.fase)}</div>
    </div></div>`;
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
      ico:(CRM.ACT_SOORTEN[a.soort]||{}).ico || '•',
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

async function logVia(c, soort, hint){
  const tekst = await CRM.vraag((CRM.ACT_SOORTEN[soort]||{}).lbl || 'Activiteit',
    {multiline:true, hint, knop:'Vastleggen'});
  if(!tekst) return;
  await CRM.logActiviteit('kandidaat', c.id, soort, tekst);
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
  el.querySelector('#kt_nieuw').onclick = () => taakModal(c);
  el.querySelectorAll('[data-taak]').forEach(cb => cb.onchange = async () => {
    const t = CRM.state.taken.find(x => String(x.id) === cb.dataset.taak);
    await bewaarRij('crm_taken','taken', Object.assign({}, t, {klaar:cb.checked}), true);
    CRM.render();
  });
}

function taakModal(c){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe taak</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)}</p></div>
    <div class="modal-b">
      <div class="f-row"><label>Wat moet er gebeuren?</label><input type="text" id="kt_tekst" placeholder="Nabellen over de meeloopdag"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="kt_datum" value="${h(CRM.todayISO())}"></div>
        <div class="f-row"><label>Voor wie</label><input type="text" id="kt_voor" value="${h(c.rec||CRM.me())}"></div>
      </div>
      <label class="check"><input type="checkbox" id="kt_hoog"> Hoge prioriteit</label>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="kt_ok">Taak opslaan</button></div>`, {onOpen(m){
    m.querySelector('#kt_ok').onclick = async () => {
      const rij = {id:CRM.uid(), tekst:m.querySelector('#kt_tekst').value.trim(),
        datum:m.querySelector('#kt_datum').value || CRM.todayISO(), klaar:false,
        entiteit:'kandidaat', ref:String(c.id), voor:m.querySelector('#kt_voor').value.trim(),
        door:CRM.me(), prioriteit:m.querySelector('#kt_hoog').checked ? 'Hoog' : ''};
      if(!rij.tekst) return CRM.toast('Omschrijf de taak','err');
      CRM.modal.close();
      await bewaarRij('crm_taken','taken', rij, false);
      tabActief = 'taken'; CRM.render();
    };
  }});
}

function tabNotities(el, c){
  const notities = (c.notities||[]).slice().sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Notities</div><span class="spacer"></span>
      <button class="btn sm" id="kn_nieuw">Notitie toevoegen</button></div>
    <div class="card-b">${CRM.ui.tijdlijn(notities.map(n => ({
      ico:'📝', titel:n.door||'—', wanneer:CRM.fmtDate(n.op)+' · '+CRM.geleden(n.op), tekst:n.tekst
    })))}</div></div>`;
  el.querySelector('#kn_nieuw').onclick = () => notitieToevoegen(c);
}

async function notitieToevoegen(c){
  const tekst = await CRM.vraag('Notitie', {multiline:true, hint:'Wat wil je onthouden over deze kandidaat?', knop:'Opslaan'});
  if(!tekst) return;
  const nieuw = Object.assign({}, c, {
    notities:[{op:new Date().toISOString(), door:CRM.me(), tekst}].concat(c.notities||[])
  });
  await bewaarKandidaat(nieuw);
  tabActief = 'notities'; CRM.render();
}

function tabHistorie(el, c){
  const hist = (c.historie||[]).slice().sort((a,b) => String(a.op||'').localeCompare(String(b.op||'')));
  const items = hist.map((x,i) => {
    const volgend = hist[i+1] ? hist[i+1].op : null;
    const dagen = volgend ? Math.round((new Date(volgend) - new Date(x.op)) / 86400000) : CRM.dagenGeleden(x.op);
    return {
      ico:'↗', titel:x.fase,
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

/* ─── Registratie ─────────────────────────────────────────────── */
CRM.registerModule('kandidaten', {
  title:'Kandidaten', icon:'☰', onderschrift:'Kandidatenkaarten en profielen',
  render(mount, acties, params){
    if(!Array.isArray(CRM.state.taken)) CRM.state.taken = [];
    if(params && params.id) kaart(mount, acties, String(params.id));
    else overzicht(mount, acties);
  }
});
})();

/* VERZOEK AAN CORE: `CRM.matchScore` kijkt naar gelijke plaatsnamen, niet naar
   werkelijke reisafstand. Deze module rekent daarom zelf de afstand uit met een
   plaatsentabel. Zou mooi zijn als core dat ooit meeneemt in de score. */
