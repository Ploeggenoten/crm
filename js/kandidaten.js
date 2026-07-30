/* ═══════════════════════════════════════════════════════════════
   MODULE: KANDIDATEN
   Overzicht van alle kandidaten met krachtige filters (sterren,
   status, radius, ploegen, taal, vervoer) + de kandidatenkaart:
   het complete profiel, ster-beoordeling, CV-verrijking met
   conflictmarkering en de Source-tab (kaart, zie js/source.js).
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

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
let hoofdTab = 'lijst';            // 'lijst' | 'source'

const uniek = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'nl'));
const faseChip = (fase, extra='') => fase
  ? `<span class="chip ${extra}"><i class="dot" style="background:${CRM.faseKleur(fase)}"></i>${h(fase)}</span>` : '';
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
   OVERZICHT — tab Kandidaten (lijst + filters) | tab Source (kaart)
   ═══════════════════════════════════════════════════════════════ */
function overzicht(mount, acties){
  acties.innerHTML = '';
  mount.innerHTML = `
    <div class="stack">
      <div class="tabs" style="margin-bottom:0">
        <button class="tab${hoofdTab==='lijst'?' on':''}" data-ht="lijst">Kandidaten</button>
        <button class="tab${hoofdTab==='source'?' on':''}" data-ht="source">Source</button>
      </div>
      <div id="kd_tabwrap"></div>
    </div>`;
  mount.querySelectorAll('[data-ht]').forEach(b => b.onclick = () => {
    if(hoofdTab === b.dataset.ht) return;
    hoofdTab = b.dataset.ht;
    mount.querySelectorAll('[data-ht]').forEach(x => x.classList.toggle('on', x.dataset.ht === hoofdTab));
    hoofdTabInhoud(mount);
  });
  hoofdTabInhoud(mount);
}

function hoofdTabInhoud(mount){
  const wrap = mount.querySelector('#kd_tabwrap');
  if(hoofdTab === 'source'){
    wrap.innerHTML = '<div id="kd_source"></div>';
    if(typeof CRM.kaartRender === 'function')
      CRM.kaartRender(wrap.querySelector('#kd_source'), {lens:'kandidaten'});
    else
      wrap.innerHTML = '<div class="note warn">De kaart-engine (js/source.js) is niet geladen.</div>';
    return;
  }
  lijstTab(wrap);
}

/* Welke filters staan aan (voor teller, chips en wissen)? */
const PANEEL_FILTERS = ['status','ster','plaats','ploegen','taal','vervoer','rijbewijs','functie','rec','klant','fase'];
function actieveFilters(){
  const uit = [];
  const STATUS_LBL = {lopend:'Actief lopend', beschikbaar:'Beschikbaar', geplaatst:'Geplaatst', recyclebaar:'Uitval — herbruikbaar', alle:'Alles'};
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
  let zonderPlek = 0;

  const rijen = CRM.kandidaten().filter(c => {
    if(F.status === 'lopend'      && !CRM.isActiefLopend(c)) return false;
    if(F.status === 'beschikbaar' && !CRM.isBeschikbaar(c))  return false;
    if(F.status === 'geplaatst'   && !CRM.PLACED.includes(c.fase)) return false;
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
    if(F.fase  && c.fase  !== F.fase)  return false;
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
  lijstEl.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr>
      <th>Kandidaat</th><th>Sterren</th><th>Klant</th><th>Fase</th><th>Woonplaats</th><th>Recruiter</th>
      <th>Laatst gesproken</th><th>Profiel</th>
    </tr></thead><tbody>${rijen.map(({c,st,v}) => {
      const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : '';
      const km = radiusBekend ? CRM.afstandKm(c.woonplaats, F.plaats) : null;
      return `<tr class="clickable" data-id="${h(String(c.id))}">
        <td><b>${h(c.naam)}</b><div class="rowsub">${h(c.functie||'—')}</div></td>
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
  {k:'bron',        lbl:'Bron',              t:'select', opts:['', ...CRM.LEAD_BRONNEN]},
  {k:'beschikbaar', lbl:'Beschikbaar',       t:'select', opts:['', ...CRM.BESCHIKBAAR]},
  {k:'ploegen',     lbl:'Ploegendiensten',   t:'select', opts:['', ...CRM.PLOEGEN]},
  {k:'talen',       lbl:'Talen',             t:'text'},
  {k:'rijbewijs',   lbl:'Rijbewijs',         t:'text'},
  {k:'vervoer',     lbl:'Vervoer',           t:'select', opts:['', ...CRM.VERVOER]},
  {k:'maandloon',   lbl:'Maandloon',         t:'number', toon:v => v ? CRM.euro(v) : ''},
  {k:'toeslagPct',  lbl:'Toeslagen',         t:'number', toon:v => v ? CRM.pct(v) : ''},
  {k:'cv.salariswens', lbl:'Salariswens',    t:'text'}
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
    <button class="btn ghost sm" id="c_plan">Inplannen</button>
    <button class="btn sm" id="c_taak">Taak</button>`;
  acties.querySelector('#c_terug').onclick   = () => CRM.ga('kandidaten');
  acties.querySelector('#c_plan').onclick    = () => planModal(c);
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
  bindSterren(mount, c);
  const cvKnop = mount.querySelector('#c_cvlees');
  if(cvKnop) cvKnop.onclick = () => cvModal(c);
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

function kopHtml(c){
  const v = CRM.volledigheid(c);
  const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : 'green';
  const BESCH_LBL = {direct:'Direct beschikbaar', 'in overleg':'Beschikbaar in overleg', niet:'Niet beschikbaar'};
  const besch = BESCH_LBL[c.beschikbaar] || (c.start ? 'Start ' + CRM.fmtDate(c.start) : '');
  return `<div class="card"><div class="card-b kd-hero">
    <div style="min-width:0;flex:1">
      <div class="h1" style="font-size:24px">${h(c.naam)}</div>
      ${sterrenHtml(c)}
      <div class="sub" style="margin-top:3px">
        ${h(c.functie||'Functie nog niet ingevuld')}
        ${c.klant?` · <a href="#klanten/${encodeURIComponent(c.klant)}" data-klant="${h(c.klant)}">${h(c.klant)}</a>`:''}
        ${c.woonplaats?' · '+h(c.woonplaats):''}
      </div>
      <div class="row tight" style="margin-top:9px">
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
  const uitCv = Array.isArray(c.cv && c.cv.uitCv) ? c.cv.uitCv : [];
  return `<div class="card">
    <div class="card-h"><div class="h2">Kandidaatgegevens</div>
      <span class="meta">klik een waarde om te wijzigen</span></div>
    <div class="card-b"><div class="kd-velden">${VELDEN.map(f => {
      const w = toonWaarde(f, lees(c, f.k));
      return `<div class="kd-veld"><span class="label">${h(f.lbl)}</span>
        <span><span class="kd-w${w?'':' leeg'}" data-veld="${h(f.k)}" tabindex="0" role="button">${w?h(w):'invullen…'}</span>${
          w && uitCv.includes(f.k) ? ' <span class="chip green kd-cvchip" title="Automatisch overgenomen uit het CV">uit CV</span>' : ''
        }</span></div>`;
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
  const certs  = Array.isArray(cv.certificaten) ? cv.certificaten : [];
  const leeg = !werk.length && !opl.length && !skills.length && !certs.length && !cv.ervaringJaren && !cv.url;
  return `<div class="card">
    <div class="card-h"><div class="h2">CV &amp; ervaring</div>
      ${cv.ervaringJaren?`<span class="chip"><span class="num">${h(cv.ervaringJaren)}</span> jaar ervaring</span>`:''}
      <span class="spacer"></span>
      ${veiligeUrl(cv.url)?`<a class="btn ghost sm" href="${h(veiligeUrl(cv.url))}" target="_blank" rel="noopener">CV openen</a>`:''}
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
        <div class="row tight" style="margin-top:8px">${certs.map(s=>`<span class="chip">${h(s)}</span>`).join('')}</div>`:''}
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

/* ─── Inplannen in Outlook (of deeplink als de koppeling nog uit staat) ── */
function planModal(c){
  const titel = c.fase==='Voorselectie'
    ? `Videointake — ${c.naam}`
    : `Gesprek — ${c.naam}${c.klant?' @ '+c.klant:''}`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Inplannen</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)}</p></div>
    <div class="modal-b">
      <div class="f-row"><label>Onderwerp</label><input type="text" id="pl_titel" value="${h(titel)}"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="pl_datum" value="${h(String(c.datum||'').slice(0,10)||CRM.todayISO())}"></div>
        <div class="f-row"><label>Tijd</label><input type="time" id="pl_tijd" value="${h(c.tijd||'10:00')}"></div>
        <div class="f-row"><label>Duur</label><select id="pl_duur">
          <option value="30">30 minuten</option>
          <option value="45" selected>45 minuten</option>
          <option value="60">60 minuten</option></select></div>
      </div>
      <label class="check"><input type="checkbox" id="pl_teams"> Teams-videocall</label>
      <div class="f-row" style="margin-top:10px"><label>Notitie</label>
        <textarea id="pl_body" placeholder="Voor in de uitnodiging…"></textarea></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="pl_ok">Inplannen</button></div>`, {onOpen(m){
    m.querySelector('#pl_ok').onclick = async () => {
      const d = {
        titel:m.querySelector('#pl_titel').value.trim(),
        datum:m.querySelector('#pl_datum').value, tijd:m.querySelector('#pl_tijd').value || '10:00',
        duurMin:Number(m.querySelector('#pl_duur').value)||45,
        teams:m.querySelector('#pl_teams').checked,
        body:m.querySelector('#pl_body').value.trim(),
        deelnemers:[c.email].filter(Boolean)
      };
      if(!d.titel) return CRM.toast('Vul een onderwerp in','err');
      if(!d.datum) return CRM.toast('Kies een datum','err');
      CRM.modal.close();
      try{
        const r = await CRM.outlook.maakAfspraak(d);
        CRM.toast(r.via==='graph' ? 'In je agenda gezet' : 'Outlook geopend — klik daar op Opslaan','ok');
        await CRM.logActiviteit('kandidaat', c.id, 'gesprek',
          `Afspraak ingepland: ${d.titel} op ${CRM.fmtDate(d.datum)} ${d.tijd}`);
        if(r.online) await CRM.logActiviteit('kandidaat', c.id, 'notitie', 'Teams-link: ' + r.online);
        /* Datum/tijd ook op de kaart, zodat bord en dashboard het tonen. */
        await bewaarKandidaat(Object.assign({}, c, {datum:d.datum, tijd:d.tijd}));
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

/* ─── Registratie ─────────────────────────────────────────────── */
CRM.registerModule('kandidaten', {
  title:'Kandidaten', icon:'☰', onderschrift:'Kandidatenkaarten, filters en de Source-kaart',
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
