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
const F_STD = {
  zoek:'', status:'lopend', ster:0, plaats:'', km:20, ploegen:'', taal:'',
  vervoer:'', rijbewijs:'', functie:'', rec:'', klant:'', fase:'',
  mijn:false, sort:'gesproken'
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

/* Welke filters staan aan (voor teller, chips en wissen)? */
const PANEEL_FILTERS = ['status','ster','plaats','ploegen','taal','vervoer','rijbewijs','functie','rec','klant','fase'];
function actieveFilters(){
  const uit = [];
  const STATUS_LBL = {lopend:'Actief lopend', beschikbaar:'Beschikbaar', geplaatst:'Geplaatst', golden:'Golden candidates', recyclebaar:'Uitval — herbruikbaar', alle:'Alles'};
  if(F.status !== F_STD.status) uit.push({k:'status', lbl:STATUS_LBL[F.status]||F.status});
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

  wrap.innerHTML = `
    <div class="stack">
      <div class="card pad">
        <div class="row kd-fil">
          <div class="searchbox" style="flex:1;max-width:290px">
            <input type="search" id="kd_zoek" autocomplete="off" placeholder="Zoek op naam, functie of woonplaats…" value="${h(F.zoek)}">
          </div>
          <button class="btn ghost sm${filtersOpen?' kd-filaan':''}" id="kd_filknop">Filters${nFil?` <span class="num">(${nFil})</span>`:''}</button>
          <select id="kd_sort" style="width:auto">
            <option value="gesproken"${F.sort==='gesproken'?' selected':''}>Langst niet gesproken</option>
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
            <div class="f-row"><label>Status</label>
              <select data-f="status">
                <option value="lopend"${F.status==='lopend'?' selected':''}>Actief lopend</option>
                <option value="beschikbaar"${F.status==='beschikbaar'?' selected':''}>Beschikbaar</option>
                <option value="geplaatst"${F.status==='geplaatst'?' selected':''}>Geplaatst</option>
                <option value="golden"${F.status==='golden'?' selected':''}>Golden candidates ★</option>
                <option value="recyclebaar"${F.status==='recyclebaar'?' selected':''}>Uitval — herbruikbaar</option>
                <option value="alle"${F.status==='alle'?' selected':''}>Alles</option>
              </select></div>
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
    if(q && ![c.naam,c.functie,c.woonplaats,c.klant,c.email,c.telefoon,c.talen].join(' ').toLowerCase().includes(q)) return false;
    /* Radius als laatste: onbekende woonplaats valt er eerlijk buiten,
       en de teller telt alleen kandidaten die verder wél door de filters kwamen. */
    if(radiusBekend && !CRM.binnenRadius(c, F.plaats, F.km)){
      if(!CRM.PLAATSEN[CRM.plaatsSleutel(c.woonplaats)]) zonderPlek++;
      return false;
    }
    return true;
  }).map(c => ({c, lg:laatstGesproken(c), st:stilte(c), v:CRM.volledigheid(c)}));

  const srt = {
    gesproken:    (a,b) => ((CRM.dagenGeleden(b.lg) == null ? 9999 : CRM.dagenGeleden(b.lg)) - (CRM.dagenGeleden(a.lg) == null ? 9999 : CRM.dagenGeleden(a.lg))),
    ster:         (a,b) => (Number(b.c.ster)||0) - (Number(a.c.ster)||0) || a.c.naam.localeCompare(b.c.naam,'nl'),
    naam:         (a,b) => a.c.naam.localeCompare(b.c.naam,'nl'),
    fase:         (a,b) => CRM.faseIdx(a.c.fase) - CRM.faseIdx(b.c.fase) || a.c.naam.localeCompare(b.c.naam,'nl'),
    volledigheid: (a,b) => a.v.pct - b.v.pct
  }[F.sort];
  if(srt) rijen.sort(srt);
  return {rijen, zonderPlek, radiusAan, radiusBekend};
}

function lijst(wrap){
  const {rijen, zonderPlek, radiusAan, radiusBekend} = gefilterd();
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
    lijstEl.innerHTML = CRM.ui.leeg('Geen kandidaten gevonden','Pas je zoekopdracht of filters aan.');
    return;
  }
  const golden = goldenIds();
  lijstEl.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr>
      <th>Kandidaat</th><th>Sterren</th><th>Klant</th><th>Fase</th><th>Woonplaats</th><th>Recruiter</th>
      <th>Laatst gesproken</th><th>Profiel</th>
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
        <td class="sub num${st.kleur==='red'?' kd-let':st.kleur==='amber'?' kd-warn':''}">${h(st.tekst)}</td>
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
    <button class="btn ghost sm" id="c_terug">${vanBord?'← Terug naar het bord':'← Overzicht'}</button>
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
          <!-- Nazorg staat pal onder Traject: het is de voortzetting daarvan
               ná de start, en het verschijnt alleen bij een gestarte kandidaat.
               Nazorg en Uitval sluiten elkaar uit (Gestart tegenover
               Afgevallen/Gestopt), dus de kolom wordt er niet langer van. -->
          ${nazorgHtml(c)}
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
  const cvKnop = mount.querySelector('#c_cvlees');
  if(cvKnop) cvKnop.onclick = () => cvModal(c);
  const certKnop = mount.querySelector('#c_certnieuw');
  if(certKnop) certKnop.onclick = () => certModal(c, -1);
  mount.querySelectorAll('[data-cert]').forEach(b => b.onclick = () => certModal(c, Number(b.dataset.cert)));
  /* Nazorg-check-in vastleggen — via dezelfde activiteiten-route als de rest. */
  mount.querySelectorAll('[data-nazorg]').forEach(b => b.onclick = () => nazorgVastleggen(c, Number(b.dataset.nazorg)));

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
   daarmee bereik je hem. */
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
  if(!c.cv) uit.push({k:'__cv', lbl:'CV inlezen'});
  return uit.slice(0,3);
}
function mistHtml(c){
  const g = gaten(c);
  return `<div class="card-f kd-mist" id="kd_mist"${g.length?'':' hidden'}>${g.length ? `
    <span class="label">Wat mist nog</span>
    ${g.map(x => `<button type="button" class="chip btn-like kd-mistchip" data-mist="${h(x.k)}"
      title="Meteen invullen">${h(x.lbl)}</button>`).join('')}
    <span class="spacer"></span>
    <span class="meta">klik om het meteen in te vullen</span>` : ''}</div>`;
}
function bindMist(root, c){
  (root || document).querySelectorAll('[data-mist]').forEach(b => b.onclick = () => {
    if(b.dataset.mist === '__cv') return cvModal(c);
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

function kopHtml(c){
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
  </div>${mistHtml(c)}</div>`;
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
  const leeg = !werk.length && !opl.length && !skills.length && !certs.length && !cv.ervaringJaren && !cv.url;
  return `<div class="card">
    <div class="card-h"><div class="h2">CV &amp; ervaring</div>
      ${cv.ervaringJaren?`<span class="chip"><span class="num">${h(cv.ervaringJaren)}</span> jaar ervaring</span>`:''}
      <span class="spacer"></span>
      ${veiligeUrl(cv.url)?`<a class="btn ghost sm" href="${h(veiligeUrl(cv.url))}" target="_blank" rel="noopener">CV openen</a>`:''}
      <!-- Toevoegen zit in de kop en niet bij het lijstje zelf: bij een kaart
           zónder certificaten is er geen lijstje, en dan moet je er alsnog
           eentje kwijt kunnen. -->
      <button class="btn ghost sm" id="c_certnieuw">Certificaat toevoegen</button>
      <button class="btn ghost sm" id="c_cvlees">CV inlezen</button></div>
    <div class="card-b">${leeg ? CRM.ui.leeg('Nog geen CV-gegevens','Lees een CV in (PDF of tekst) — lege velden worden aangevuld en afwijkingen worden rood gemarkeerd.') : `
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

/* ═══════════════════════════════════════════════════════════════
   CV-VERRIJKING — parse client-side, lege velden aanvullen (groen),
   afwijkingen rood markeren. Nooit stil overschrijven.
   Eigen compacte parser; bewust niets uit recruitment.js gebruikt.
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

const CV_TALEN = ['Nederlands','Engels','Duits','Frans','Spaans','Pools','Roemeens','Bulgaars',
  'Hongaars','Turks','Arabisch','Portugees','Italiaans','Oekraïens','Russisch','Slowaaks','Tsjechisch'];
const CV_CERTS = [
  [/heftruck|vorkheftruck|forklift/i, 'Heftruckcertificaat'],
  [/reachtruck|reach truck/i, 'Reachtruck'],
  [/\bept\b|elektrische pallet/i, 'EPT'],
  [/\bvca\b/i, 'VCA'],
  [/hoogwerker/i, 'Hoogwerker'],
  [/\bbhv\b/i, 'BHV'],
  [/lascertificaat|lasdiploma|\bnen\s?9606\b/i, 'Lascertificaat']
];

function parseCvTekst(t){
  t = String(t||'');
  const regels = t.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  const uit = {telefoon:'', email:'', woonplaats:'', talen:[], certificaten:[],
               rijbewijs:'', werk:[], ervaringJaren:null, functie:'', nietGevonden:[]};

  const em = t.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  if(em) uit.email = em[0];

  const tel = t.match(/(?:\+31|0031|0)\s?6[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/)
           || t.match(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s.-]?){9,12}\d/);
  if(tel) uit.telefoon = tel[0].trim().replace(/\s{2,}/g,' ');

  /* Woonplaats: eerst postcode + plaats op dezelfde regel, anders een
     hoofdletterwoord dat in onze plaatsentabel voorkomt. */
  const pc = t.match(/\b\d{4}[ \t]?[A-Za-z]{2}\b[ \t,]+([A-ZÀ-Ž][\wÀ-ž'’-]{2,24}(?:[ \t][A-ZÀ-Ž][\wÀ-ž'’-]{2,24})?)/);
  if(pc) uit.woonplaats = pc[1].trim();
  if(!uit.woonplaats){
    const kandidaten = t.match(/[A-ZÀ-Ž][a-zà-ž'’-]{2,}(?:[ \/-](?:a\/d[ ])?[A-ZÀ-Ž][a-zà-ž'’-]{2,})?/g) || [];
    const gevonden = kandidaten.find(w => CRM.PLAATSEN[CRM.plaatsSleutel(w)]);
    if(gevonden) uit.woonplaats = gevonden;
  }

  CV_TALEN.forEach(x => { if(new RegExp('\\b'+x+'\\b','i').test(t)) uit.talen.push(x); });
  CV_CERTS.forEach(([re, lbl]) => { if(re.test(t)) uit.certificaten.push(lbl); });
  const rb = t.match(/rijbewijs[^\n]{0,40}/i);
  if(rb){
    const cats = (rb[0].match(/\b(AM|A|BE|B|CE|C|D)\b/g)||[]).join('/');
    uit.rijbewijs = cats || 'genoemd in CV';
  }

  /* Werkervaring: regels met een jaartalbereik. Ervaring = nu − vroegste
     startjaar van het werkverleden (niet van álle jaartallen — daar zit
     ook een geboortejaar of een opleiding tussen). Regels onder een
     "Opleiding"-kop tellen we niet als werk. */
  const jaarRe = /((19|20)\d{2})\s*[–—\-\/tot ]{1,6}\s*((19|20)\d{2}|heden|nu)/i;
  const startjaren = [];
  let sectie = 'werk';
  regels.forEach((r, i) => {
    if(/^(opleiding|opleidingen|onderwijs|educatie|education|cursussen)\b/i.test(r)){ sectie = 'opleiding'; return; }
    if(/^(werkervaring|ervaring|werkverleden|loopbaan|experience)\b/i.test(r)){ sectie = 'werk'; return; }
    if(sectie === 'opleiding') return;
    const m = r.match(jaarRe);
    if(m && r.length < 140){
      let regel = r;
      if(regel.replace(jaarRe,'').replace(/[^a-zA-Z]/g,'').length < 4 && regels[i+1]) regel = r + ' — ' + regels[i+1];
      const periode = (regel.match(jaarRe)||[''])[0].trim();
      const functie = regel.replace(jaarRe,'').replace(/^[\s\-–—:•]+|[\s\-–—:•]+$/g,'').slice(0,80);
      if(uit.werk.length < 8) uit.werk.push({functie: functie || '—', periode});
      startjaren.push(+m[1]);
    }
  });
  if(startjaren.length){
    const vroegst = Math.min.apply(null, startjaren.filter(j => j >= 1960 && j <= new Date().getFullYear()));
    if(isFinite(vroegst)) uit.ervaringJaren = Math.max(0, Math.min(45, new Date().getFullYear() - vroegst));
  }

  const functies = Array.from(new Set((CRM.state.vacs||[]).map(v => v.functie).filter(Boolean)));
  const fg = functies.find(f => new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(t));
  if(fg) uit.functie = fg;
  else if(uit.werk.length && uit.werk[0].functie !== '—') uit.functie = uit.werk[0].functie.slice(0,60);

  if(!uit.telefoon)      uit.nietGevonden.push('telefoonnummer');
  if(!uit.email)         uit.nietGevonden.push('e-mailadres');
  if(!uit.woonplaats)    uit.nietGevonden.push('woonplaats');
  if(!uit.talen.length)  uit.nietGevonden.push('talen');
  if(!uit.werk.length)   uit.nietGevonden.push('werkverleden met jaartallen');
  if(!uit.certificaten.length) uit.nietGevonden.push('certificaten');
  return uit;
}

/* Telefoonnummers vergelijken los van spaties/landcode. */
const telNorm = t => {
  let n = String(t||'').replace(/\D/g,'');
  if(n.startsWith('0031')) n = '0'+n.slice(4);
  else if(n.startsWith('31') && n.length > 9) n = '0'+n.slice(2);
  return n;
};

function cvModal(c){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">CV inlezen</div>
      <p class="sub" style="margin:6px 0 0">PDF of tekstbestand — wordt in je browser gelezen, er gaat niets naar
      een externe dienst. Lege velden worden aangevuld; wijkt het CV af van de kaart, dan zie je dat rood en kies je zelf.</p></div>
    <div class="modal-b">
      <input type="file" id="cvv_file" accept=".pdf,.txt,.md,text/plain,application/pdf">
      <div id="cvv_uit" style="margin-top:14px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Sluiten</button>
      <button class="btn" id="cvv_ok" disabled>Verwerken</button></div>`, {onOpen(m){
    const uitEl = m.querySelector('#cvv_uit'), ok = m.querySelector('#cvv_ok');
    let p = null, bestand = '', aanvullingen = [], conflicten = [];

    m.querySelector('#cvv_file').onchange = async e => {
      const f = e.target.files[0]; if(!f) return;
      bestand = f.name;
      uitEl.innerHTML = CRM.ui.laden('CV lezen…');
      ok.disabled = true;
      try{
        const tekst = /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
          ? await pdfTekst(f) : await f.text();
        if(!tekst.trim()){
          uitEl.innerHTML = '<div class="note warn">Er kwam geen tekst uit dit bestand. Waarschijnlijk is het een gescande pdf (een plaatje). Vul de gegevens dan handmatig in.</div>';
          return;
        }
        p = parseCvTekst(tekst);

        /* Vergelijken met de kaart: aanvullen (leeg) of conflict (anders). */
        aanvullingen = []; conflicten = [];
        const paren = [
          ['telefoon',   'Telefoon',   (a,b) => telNorm(a) === telNorm(b)],
          ['email',      'E-mail',     (a,b) => a.toLowerCase() === b.toLowerCase()],
          ['woonplaats', 'Woonplaats', (a,b) => CRM.plaatsSleutel(a) === CRM.plaatsSleutel(b)]
        ];
        paren.forEach(([k, lbl, eq]) => {
          const kaartW = String(c[k]||'').trim(), cvW = String(p[k]||'').trim();
          if(!cvW) return;
          if(!kaartW) aanvullingen.push({k, lbl, w:cvW});
          else if(!eq(kaartW, cvW)) conflicten.push({k, lbl, kaart:kaartW, cv:cvW, keuze:'kaart'});
        });
        if(p.functie && !String(c.functie||'').trim()) aanvullingen.push({k:'functie', lbl:'Gezochte functie', w:p.functie});
        if(p.talen.length && !String(c.talen||'').trim()) aanvullingen.push({k:'talen', lbl:'Talen', w:p.talen.join(', ')});
        if(p.rijbewijs && p.rijbewijs !== 'genoemd in CV' && !String(c.rijbewijs||'').trim())
          aanvullingen.push({k:'rijbewijs', lbl:'Rijbewijs', w:p.rijbewijs});

        const extra = [];
        if(p.werk.length)         extra.push(p.werk.length + ' werkervaring-regels');
        if(p.certificaten.length) extra.push('certificaten: ' + p.certificaten.join(', '));
        if(p.ervaringJaren != null) extra.push('± ' + p.ervaringJaren + ' jaar ervaring');

        uitEl.innerHTML = `
          ${conflicten.length ? `
            <div class="label" style="margin-bottom:8px;color:var(--red)">Klopt niet met de kaart — kies per regel</div>
            ${conflicten.map((cf,i) => `<div class="kd-conflict" data-ci="${i}">
              <div class="kd-conflict-lbl">${h(cf.lbl)} wijkt af</div>
              <div class="kd-conflict-opties">
                <button type="button" class="kd-copt aan" data-keus="kaart">Kaart houden<b>${h(cf.kaart)}</b></button>
                <button type="button" class="kd-copt" data-keus="cv">CV overnemen<b>${h(cf.cv)}</b></button>
              </div>
            </div>`).join('')}` : ''}
          ${aanvullingen.length ? `
            <div class="label" style="margin:${conflicten.length?'14px':'0'} 0 8px">Wordt aangevuld (was leeg op de kaart)</div>
            <div class="kd-cvaanv">${aanvullingen.map(a =>
              `<div class="kd-cvaanv-rij"><span class="label">${h(a.lbl)}</span><span>${h(a.w)}</span><span class="chip green kd-cvchip">uit CV</span></div>`).join('')}
            </div>` : ''}
          ${extra.length ? `<div class="meta" style="margin-top:12px">Gaat naar CV &amp; ervaring: ${h(extra.join(' · '))}.</div>` : ''}
          ${!conflicten.length && !aanvullingen.length && !extra.length
            ? '<div class="note warn">Uit dit CV viel niets bruikbaars te halen.</div>' : ''}
          ${p.nietGevonden.length ? `<div class="note warn" style="margin-top:12px">Niet gevonden in het CV: ${h(p.nietGevonden.join(', '))}.</div>`
                                  : '<div class="note ok" style="margin-top:12px">Alles gevonden in het CV.</div>'}`;

        uitEl.querySelectorAll('.kd-conflict').forEach(blok => {
          blok.querySelectorAll('.kd-copt').forEach(b => b.onclick = () => {
            conflicten[Number(blok.dataset.ci)].keuze = b.dataset.keus;
            blok.querySelectorAll('.kd-copt').forEach(x => x.classList.toggle('aan', x === b));
          });
        });
        ok.disabled = !(conflicten.length || aanvullingen.length || extra.length);
      }catch(err){
        uitEl.innerHTML = `<div class="note err">Lezen mislukt: ${h(err.message)}</div>`;
      }
    };

    ok.onclick = async () => {
      if(!p) return;
      const uitCv = [];
      aanvullingen.forEach(a => { c[a.k] = a.w; uitCv.push(a.k); });
      const gekozenCv = conflicten.filter(cf => cf.keuze === 'cv');
      gekozenCv.forEach(cf => { c[cf.k] = cf.cv; uitCv.push(cf.k); });

      const oud = c.cv || {};
      c.cv = Object.assign({}, oud, {
        functie:       p.functie || oud.functie || '',
        ervaringJaren: p.ervaringJaren != null ? p.ervaringJaren : (oud.ervaringJaren != null ? oud.ervaringJaren : null),
        talen:         p.talen.length ? p.talen : (oud.talen || []),
        certificaten:  p.certificaten.length ? p.certificaten : (oud.certificaten || []),
        werkgevers:    p.werk.length ? p.werk : (oud.werkgevers || []),
        bestand, op:new Date().toISOString(),
        uitCv: uniek([...(Array.isArray(oud.uitCv)?oud.uitCv:[]), ...uitCv])
      });
      await bewaarKandidaat(c);

      const delen = [];
      if(aanvullingen.length) delen.push('aangevuld: ' + aanvullingen.map(a=>a.lbl.toLowerCase()).join(', '));
      conflicten.forEach(cf => delen.push(cf.lbl.toLowerCase() + ' week af — ' + (cf.keuze==='cv' ? 'CV overgenomen' : 'kaartwaarde gehouden')));
      if(p.nietGevonden.length) delen.push('niet gevonden: ' + p.nietGevonden.join(', '));
      await CRM.logActiviteit('kandidaat', c.id, 'doc', 'CV ingelezen (' + bestand + '). ' + (delen.join('; ') || 'Geen wijzigingen.'));

      CRM.modal.close();
      CRM.toast('CV verwerkt','ok');
      CRM.render();
    };
  }});
}

/* ─── Intake ──────────────────────────────────────────────────── */
function intakeHtml(c){
  const i = c.intake;
  /* Het intakeformulier zelf staat in js/recruitment.js (CRM.kandidaatIntake);
     vroeger kon je er alleen vanaf het bord bij. */
  const knop = `<button class="btn ghost sm" id="c_intake2">${i?'Intake bijwerken':'Intake invullen'}</button>`;
  if(!i) return `<div class="card"><div class="card-h"><div class="h2">Intake</div>
      <span class="spacer"></span>${knop}</div>
    <div class="card-b">${CRM.ui.leeg('Geen intake vastgelegd','Vul het intakeformulier in tijdens de videocall — dat voorkomt verrassingen later.')}</div></div>`;
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
   is voor IEDEREEN: de AM moet weten wat hij moet invullen, en dat zijn
   veldnamen, geen bedragen. De uitkomst van de berekening is dat wél, dus
   die staat achter CRM.canSeeMoney(). Zie js/fee.js. */
function factuurklaarHtml(c){
  if(!CRM.fee || !c.klant) return '';           // zonder klant valt er niets te factureren
  let mist = [], b = null;
  try{
    const afspraak = CRM.fee.voorKlant(c.klant, c.geplaatstOp || null);
    mist = CRM.fee.watMist(c, afspraak) || [];
    if(CRM.canSeeMoney()) b = CRM.fee.bereken(c, afspraak);
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
      <div class="meta">${idx>=0&&idx<11?`Stap <span class="num">${idx+1}</span> van <span class="num">11</span>`:h(CRM.faseNorm(c.fase)||'Nog niet in de pijplijn')}</div>
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

/* ─── Nazorg: check-ins op dag 3, 14 en 30 ────────────────────────
   Exact hetzelfde ritme en dezelfde peildatum als het pijplijnbord
   (js/pijplijn.js, de chip in de Gestart-kolom) en de nazorgkolom in
   Performance (js/performance.js): geteld vanaf de STARTDATUM, alleen bij
   fase Gestart, alleen zolang de plaatsing loopt (geen gestoptOp) en alleen
   als die startdatum al geweest is. Zo zegt de kaart nooit iets anders dan
   het bord. Iemand die nog in gesprek zit, ziet dit blok dus niet.
   LET OP: js/dashboard.js rekent op één punt anders — zie het rapport. */
const NAZORG_DAGEN = [3,14,30];
const NAZORG_CONTACT = ['bel','gesprek','whatsapp','mail'];
/* Datum + n dagen, in dezelfde lokale notatie als CRM.todayISO(). */
const plusDagen = (iso, n) => {
  const d = new Date(iso); if(isNaN(d)) return '';
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
/* Hoort deze activiteit bij een check-in, en zo ja bij welke dag? De
   markering staat in `extra`; de tekstcontrole vangt rijen op die vóór dit
   veld zijn weggeschreven. 0 = geen check-in. */
const nazorgMerk = a => {
  const n = Number(a && a.extra && a.extra.nazorg);
  if(n) return n;
  const m = /^nazorg dag (\d+)\b/i.exec(String((a && a.tekst) || ''));
  return m ? Number(m[1]) : 0;
};

function nazorgStatus(c){
  if(!CRM.faseIs(c.fase, 'Gestart') || !c.start || c.gestoptOp) return null;
  const dag = CRM.dagenGeleden(c.start);
  if(dag == null || dag < 0) return null;      // startdatum ligt nog voor ons
  const acts = CRM.activiteitenVoor('kandidaat', c.id);
  const rijen = NAZORG_DAGEN.map((n, i) => {
    const datum = plusDagen(c.start, n);
    /* Venster van dit check-inmoment: vanaf de dag zelf tot het volgende
       moment (en na dag 30 nog twee weken). */
    const eind = plusDagen(c.start, NAZORG_DAGEN[i+1] != null ? NAZORG_DAGEN[i+1] : n + 14);
    /* "Gedaan" leiden we af uit de activiteiten. Twee bronnen: een check-in
       die hier is vastgelegd, en anders écht contact binnen het venster —
       plaatsingen van vóór deze knop hebben die markering niet, maar het
       telefoontje staat er wel.
       Een activiteit die al ÉÉN check-in is, telt nooit als het contact van
       een andere: leg je dag 3 achteraf vast op dag 20, dan valt dat gesprek
       toevallig in het venster van dag 14 en zou die zichzelf anders ook
       afvinken. Gezien tijdens het testen — één gesprek is één check-in. */
    const vast = acts.find(a => nazorgMerk(a) === n);
    const contact = vast ? null : acts.find(a => !nazorgMerk(a) && NAZORG_CONTACT.includes(a.soort)
      && String(a.op || '').slice(0,10) >= datum && String(a.op || '').slice(0,10) < eind);
    const gedaan = !!(vast || contact);
    return {n, datum, vast: vast || null, contact: contact || null, gedaan, open: dag >= n && !gedaan};
  });
  return {dag, rijen, volgende: rijen.find(r => !r.gedaan) || null, klaar: rijen.every(r => r.gedaan)};
}

function nazorgHtml(c){
  const s = nazorgStatus(c);
  if(!s) return '';
  const kop = s.klaar ? '<span class="chip green">ritme afgerond</span>'
    : s.volgende.open ? '<span class="chip amber">check-in open</span>'
    : `<span class="chip">volgende op dag <span class="num">${s.volgende.n}</span></span>`;
  const soortLbl = a => String((CRM.ACT_SOORTEN[a.soort] || {}).lbl || a.soort).toLowerCase();
  return `<div class="card">
    <div class="card-h"><div class="h2">Nazorg</div>${kop}
      <span class="spacer"></span>
      <span class="meta">dag <span class="num">${s.dag}</span> na de start</span></div>
    <div class="card-b">
      <div class="kd-nazorg">${s.rijen.map(r => {
        const status = r.vast
          ? `<span class="kd-nz-ok">✓ vastgelegd ${h(CRM.fmtDateShort(r.vast.op))}</span>`
          : r.contact
            ? `<span class="kd-nz-ok">✓ ${h(soortLbl(r.contact))} op ${h(CRM.fmtDateShort(r.contact.op))}</span>`
            : r.open ? '<span class="kd-nz-open">nog niet gedaan</span>'
                     : `<span class="meta">${h(CRM.geleden(r.datum))}</span>`;
        return `<div class="kd-nz${r.gedaan ? ' af' : r.open ? ' open' : ''}">
          <span class="kd-nz-d">Dag <span class="num">${r.n}</span></span>
          <span class="num kd-nz-dat">${h(CRM.fmtDay(r.datum))}</span>
          ${status}
          ${r.open ? `<button type="button" class="btn ghost sm" data-nazorg="${r.n}">Vastleggen</button>` : ''}
        </div>`;
      }).join('')}</div>
      <p class="meta" style="margin:12px 0 0">Bellen op dag 3, 14 en 30 — hetzelfde ritme als op het bord en in Mijn dag.</p>
    </div></div>`;
}

/* Vastleggen loopt via dezelfde activiteiten-route als de knop "Gebeld"
   bovenaan de kaart (logVia); deze module schrijft maar op één plek in de
   tijdlijn. De markering in `extra` maakt de check-in later terugvindbaar. */
async function nazorgVastleggen(c, n){
  await logVia(c, 'bel', 'Hoe gaat het op de werkvloer? Leg vast wat je hoort — ook als alles goed gaat.',
    {titel:'Nazorg — check-in dag ' + n, prefix:'Nazorg dag ' + n + ' — ', extra:{nazorg:n}});
}

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
