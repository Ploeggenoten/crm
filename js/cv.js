/* ═══════════════════════════════════════════════════════════════
   CV-GENERATOR — kandidaatprofiel in de vaste Ploeggenoten-opmaak
   Volgt het bestaande profiel van Tjeerd (crème vel, voornaam in
   Anton, olijf/lime deelstreep, linkerkolom met jaartallen).

   Publieke functie:
     CRM.cvGen.open(kandidaat, {vacature, klant})   // beide optioneel

   Uitgangspunten:
   - Nooit fee, marge, tarief of kanswaarde op het vel. Salariswens
     alleen achter een expliciete schakelaar (standaard uit).
   - Geen telefoon/e-mail op het vel: "Contact via Ploeggenoten".
   - Standaard alleen de VOORNAAM — dat is het anonimiseringsniveau
     van het bestaande profiel. Volledig naamloos kan ook.
   - Eén model (bouwModel) voedt zowel het vel als de platte tekst.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Voorkeuren onthouden ────────────────────────────────────── */
const KEY = 'crm_cvgen_opts';
const sleutel = () => KEY + ':' + ((CRM.user && CRM.user.email) || CRM.me() || 'lokaal');

const NAAM_STANDEN = [
  {k:'voornaam', lbl:'Voornaam'},
  {k:'vol',      lbl:'Volledige naam'},
  {k:'geen',     lbl:'Naamloos'}
];
const ONDERDELEN = [
  {k:'foto',   lbl:'Profielfoto'},
  {k:'werk',   lbl:'Werkervaring'},
  {k:'skills', lbl:'Vaardigheden'},
  {k:'opl',    lbl:'Opleiding'},
  {k:'cert',   lbl:'Certificaten'},
  {k:'talen',  lbl:'Talen'},
  {k:'voorw',  lbl:'Beschikbaarheid & voorwaarden'}
];

const STD = {
  naamStand:'voornaam', salaris:false,
  /* Foto staat standaard AAN (wens Tjeerd, 10 aug 2026): is er een foto uit
     het cv gehaald, dan komt hij meteen op het vel — de AM vinkt 'm uit als
     hij 'm niet wil, in plaats van 'm er elke keer bij te moeten zetten. */
  aan:{foto:true, werk:true, skills:true, opl:true, cert:true, talen:true, voorw:true}
};

function laadOpts(){
  let b = {};
  try{ b = JSON.parse(localStorage.getItem(sleutel()) || '{}') || {}; }catch(e){}
  const stand = NAAM_STANDEN.some(s => s.k === b.naamStand) ? b.naamStand : STD.naamStand;
  return {
    naamStand: stand,
    salaris: !!b.salaris,          /* nooit "aan" tenzij expliciet gezet */
    aan: Object.assign({}, STD.aan, (b.aan && typeof b.aan === 'object') ? b.aan : {}),
    schets:'', sector:''           /* horen bij één voorstel, niet onthouden */
  };
}
function bewaarOpts(o){
  try{ localStorage.setItem(sleutel(), JSON.stringify({naamStand:o.naamStand, salaris:o.salaris, aan:o.aan})); }
  catch(e){}
}

/* ─── Kleine tekst-helpers ────────────────────────────────────── */
const t = v => String(v == null ? '' : v).trim();
const lijst = v => Array.isArray(v) ? v.map(x => t(x)).filter(Boolean) : (t(v) ? [t(v)] : []);
/* cv.certificaten staat sinds de geldigheidsdatums op de kandidatenkaart
   (kandidaten.js, ervLijst) als objecten {naam, geldigTot} i.p.v. losse
   tekst — anders leverde lijst() hier "[object Object]" op. */
const certNamen = v => lijst((Array.isArray(v) ? v : []).map(
  x => (x && typeof x === 'object') ? (x.naam || x.certificaat || x.titel || '') : x));
/* "NL, EN" is één veld met meerdere waarden — splits op komma's. */
const splits = v => Array.isArray(v) ? v.map(x => t(x)).filter(Boolean)
                                     : t(v).split(/\s*[,;/]\s*/).map(x => t(x)).filter(Boolean);

function opzegNL(v){
  const s = t(v);
  if(!s) return '';
  if(/^immediately$/i.test(s)) return 'per direct';
  const d = s.match(/^(\d+)\s*days?$/i);
  if(d) return d[1] + ' dagen';
  const w = s.match(/^(\d+)\s*(month|months|maand|maanden)$/i);
  return w ? w[1] + ' maand' + (Number(w[1]) === 1 ? '' : 'en') : s;
}
const VERVOER_NL = {'auto':'eigen auto', 'ov':'openbaar vervoer', 'fiets':'fiets', 'geen':'geen eigen vervoer'};
function euroMnd(v){
  if(v == null || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v) : CRM.euro(n) + ' p/mnd';
}

/* ─── Perioden ────────────────────────────────────────────────── */
const MAAND = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const LOPEND = /^(heden|nu|nog|huidig|current|present|now)$/i;
/* Eén datum: 02-2018, 2018-02 of 2018. Twee ervan met iets ertussen vormen
   een periode; rechts mag ook "heden" staan. De volgorde van de alternatieven
   is bewust van lang naar kort, zodat "2020-08" niet als los jaartal 2020
   wordt gelezen met een losse 08 erachter. */
const D1 = String.raw`(?:\d{1,2}[-/](?:19|20)\d{2}|(?:19|20)\d{2}[-/]\d{1,2}|(?:19|20)\d{2})`;
const PERIODE = new RegExp(
  `^(${D1})\\s*(?:[–—]|-|t/m|tot(?:\\s+en\\s+met)?)\\s*(${D1}|heden|nu|nog|huidig|current|present|now)$`, 'i');
function jaarVan(s){ const m = t(s).match(/(19|20)\d{2}/); return m ? Number(m[0]) : null; }
/* Maand uit een datum, in beide schrijfwijzen: 2025-09 én 09-2025. Nodig om
   twee banen in hetzelfde jaar in de goede volgorde te zetten. */
function maandVan(s){
  const w = t(s);
  let m = w.match(/^(19|20)\d{2}[-/](\d{1,2})/);
  if(m) return Number(m[2]);
  m = w.match(/^(\d{1,2})[-/](19|20)\d{2}/);
  if(m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return Number(m[1]);
  return 0;
}
function mndJaar(s){
  const w = t(s);
  if(!w) return '';
  const iso = w.match(/^(\d{4})[-/](\d{1,2})/);
  if(iso) return (MAAND[Number(iso[2]) - 1] || '') + ' ' + iso[1];
  const dm = w.match(/^(\d{1,2})[-/](\d{4})$/);
  if(dm) return (MAAND[Number(dm[1]) - 1] || '') + ' ' + dm[2];
  return w;
}

/* Naam uit vrije tekst halen als het profiel zonder achternaam gaat. */
function scrub(tekst, naam, stand){
  let s = t(tekst);
  if(!s || stand === 'vol') return s;
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const delen = t(naam).split(/\s+/).filter(w => w.length > 2 &&
    !/^(van|de|der|den|het|te|ter|du|la|le)$/i.test(w));
  if(stand === 'voornaam'){
    /* Voornaam mag blijven staan; alleen de achternaam eruit. */
    delen.slice(1).forEach(w => { s = s.replace(new RegExp('\\s*\\b' + esc(w) + '\\b', 'gi'), ''); });
  }else{
    if(t(naam)) s = s.replace(new RegExp('\\b' + esc(t(naam)) + '\\b', 'gi'), 'de kandidaat');
    delen.forEach(w => { s = s.replace(new RegExp('\\b' + esc(w) + '\\b', 'gi'), 'de kandidaat'); });
    s = s.replace(/(de kandidaat[\s,]+){2,}/gi, 'de kandidaat ');
  }
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.replace(/(^|[.!?]\s+)de kandidaat/g, (m, p) => p + 'De kandidaat').trim();
}

function referentie(id){
  const s = String(id || '');
  const cijfers = s.replace(/\D/g, '');
  if(cijfers.length >= 3) return 'PG-' + cijfers.slice(-4);
  let som = 0;
  for(let i = 0; i < s.length; i++) som = (som * 31 + s.charCodeAt(i)) % 10000;
  return 'PG-' + String(som).padStart(4, '0');
}

/* ═══════════════════════════════════════════════════════════════
   MODEL
   ═══════════════════════════════════════════════════════════════ */
function context(opts){
  opts = opts || {};
  let vac = opts.vacature;
  if(typeof vac === 'string') vac = (CRM.state.vacs || []).find(v => String(v.id) === vac) || null;
  let klantNaam = '';
  if(typeof opts.klant === 'string') klantNaam = t(opts.klant);
  else if(opts.klant && typeof opts.klant === 'object') klantNaam = t(opts.klant.naam || opts.klant.klant || opts.klant.bedrijf);
  if(!klantNaam && vac) klantNaam = t(vac.klant);
  return {vac: vac || null, klant: klantNaam};
}

/* Werkervaring normaliseren: badge ('22-'25), volledige periode en taken. */
function werkRijen(arr){
  if(!Array.isArray(arr)) return [];
  return arr.map((r, i) => {
    if(typeof r === 'string') r = {functie:r};
    let van = t(r.van), tot = t(r.tot);
    if(!van && !tot && t(r.periode)){
      /* Een periode splitsen is lastiger dan het lijkt, want het koppelteken
         zit én ín een datum ("09-2025") én ertússen ("02-2018-04-2020").
         Blind splitsen knipte 09-2025 doormidden; alleen splitsen bij spaties
         eromheen liet 02-2018-04-2020 juist ongemoeid — dan was er geen
         einddatum en zette het cv overal "heden" met een open jaarbadge
         (naam: Tjeerd, 8 aug 2026).

         Daarom herkennen we de VORM van een datum aan weerskanten in plaats
         van te gokken op scheidingstekens. Zo werken al deze notaties:
         02-2018-04-2020 · 01-2024-HEDEN · 09-2025 – 07-2026 ·
         2020-08 – 2024-04 · 2020-2024 · 2018 tot heden. */
      const ruw = t(r.periode);
      let d = ruw.match(PERIODE) ? ruw.match(PERIODE).slice(1, 3) : [];
      /* Herkent hij de vorm niet, dan valt hij terug op de oude manier: een
         lang streepje, "tot", of een koppelteken met spaties eromheen. Beter
         iets dan niets — en een halve datum is nog altijd leesbaar. */
      if(d.length < 2) d = ruw.split(/\s*[–—]\s*|\s+-\s+|\s+tot\s+/i);
      van = t(d[0] || ''); tot = t(d[1] || '');
    }
    if(!van && !tot && t(r.jaar)) van = t(r.jaar);
    const jv = jaarVan(van), jt = jaarVan(tot);
    const lopend = !t(tot) || LOPEND.test(t(tot));
    const badge = jv ? "'" + String(jv).slice(-2) + '-' + (lopend ? 'heden' : (!jt ? '' : "'" + String(jt).slice(-2))) : '';
    const periode = [mndJaar(van), lopend ? 'heden' : mndJaar(tot)].filter(Boolean).join(' – ');
    let taken = r.taken;
    if(typeof taken === 'string') taken = taken.split(/\r?\n/);
    return {
      i, jaar: jv, eind: jt, open: lopend,
      /* Sorteersleutel: jaar én maand, zodat twee banen in hetzelfde jaar
         niet op invoervolgorde blijven staan. */
      sleutel: jv ? jv * 100 + maandVan(van) : null,
      bedrijf: t(r.werkgever || r.bedrijf || r.organisatie),
      functie: t(r.functie || r.rol || r.titel),
      van, tot, badge, periode,
      taken: Array.isArray(taken) ? taken.map(x => t(x)).filter(Boolean) : []
    };
  }).filter(r => r.bedrijf || r.functie)
    /* Recentste bovenaan. Staat er geen leesbare datum bij, dan blijft die
       regel op de plek waar hij op de kandidatenkaart staat (a.i) in plaats
       van naar de bodem te zakken — die volgorde is daar met de hand
       gezet en is dus een keuze, geen toeval. */
    .sort((a, b) => (b.sleutel || 0) - (a.sleutel || 0) || a.i - b.i);
    /* Hier stond een regel die de bovenste functie altijd een open badge
       ('25-) gaf zodra de einddatum in het lopende jaar viel. Dat wiste een
       ingevulde einddatum: Angelo werkte tot juli 2026 bij Logoplaste en het
       cv liet alleen '25- zien, terwijl de periode ernaast wél "sep 2025 –
       jul 2026" zei (naam: Tjeerd, 7 aug 2026). Staat er een einddatum, dan
       hoort die er ook te staan — een lopend dienstverband herken je aan een
       leeg "tot" of aan "heden", en dat wordt hierboven al afgevangen. */
}

function oplRijen(arr){
  if(!Array.isArray(arr)) return [];
  return arr.map(r => {
    if(typeof r === 'string') return {kop:t(r), rest:[]};
    const school = t(r.school || r.instituut);
    const naam = t(r.opleiding || r.naam || r.titel);
    const jaar = t(r.jaar || r.periode || [r.van, r.tot].filter(Boolean).join(' – '));
    return {kop: school || naam, rest: [jaar, school ? naam : ''].filter(Boolean)};
  }).filter(r => r.kop || r.rest.length);
}

/* De inline regels onder Opleiding: certificaten, talen en de praktische
   voorwaarden — in dezelfde stijl als in het bestaande profiel. */
function extraRegels(c, ctx, o, welke){
  const cv = c.cv || {};
  const r = [];
  const zet = (lbl, w) => { if(t(w)) r.push({lbl, w:t(w)}); };
  if(welke.cert)  zet('Certificaten', certNamen(cv.certificaten).join(', '));
  if(welke.talen) zet('Talen', (lijst(cv.talen).length ? lijst(cv.talen) : splits(c.talen)).join(', '));
  if(welke.voorw){
    zet('Rijbewijs', c.rijbewijs);
    zet('Vervoer', VERVOER_NL[t(c.vervoer)] || t(c.vervoer));
    zet('Ploegendienst', t(c.ploegen) === 'geen' ? 'geen ploegendienst' : t(c.ploegen));
    zet('Opzegtermijn', opzegNL(cv.opzegtermijn));
    if(t(c.start)) zet('Kan starten', CRM.fmtDate(c.start));
    const km = ctx.vac ? CRM.afstandKm(c.woonplaats, ctx.vac.locatie) : null;
    if(km != null) zet('Reisafstand', '± ' + km + ' km tot ' + t(ctx.vac.locatie));
  }
  if(o.salaris) zet('Salarisindicatie', euroMnd(cv.salariswens));
  return r;
}

function beschikbaar(c, ctx){
  const cv = c.cv || {};
  return {
    foto:   !!c.foto,
    werk:   werkRijen(cv.werkgevers).length > 0,
    skills: lijst(cv.skills).length > 0,
    opl:    oplRijen(cv.opleidingen).length > 0,
    cert:   certNamen(cv.certificaten).length > 0,
    talen:  (lijst(cv.talen).length + splits(c.talen).length) > 0,
    voorw:  extraRegels(c, ctx, {salaris:false}, {voorw:true}).length > 0
  };
}

/* De lime pil rechtsboven. Niet beschikbaar = geen pil. */
function beschikbaarPil(c){
  const b = t(c.beschikbaar);
  if(b === 'direct')     return 'Beschikbaar deze week';
  if(b === 'in overleg') return 'Beschikbaar in overleg';
  if(t(c.start))         return 'Beschikbaar per ' + CRM.fmtDate(c.start);
  return '';
}

function bouwModel(c, ctx, o){
  const cv = c.cv || {};
  const er = beschikbaar(c, ctx);
  const aan = k => o.aan[k] !== false && er[k];
  const stand = o.naamStand;

  const volNaam = t(c.naam);
  const naam = stand === 'geen' ? 'Kandidaat'
             : stand === 'vol'  ? (volNaam || 'Kandidaat')
             : (volNaam.split(/\s+/)[0] || 'Kandidaat');

  /* De functie onder de naam is sinds 5 nov 2026 een vrij veld (o.functie,
     zie open()). Zonder dat veld (oude aanroep) de oude terugval. */
  const functie = o.functie != null ? t(o.functie)
    : t(c.functie) || t(cv.functie) || (ctx.vac ? t(ctx.vac.functie) : '');
  const onder = [functie, t(o.sector), stand === 'geen' ? '' : t(c.woonplaats)].filter(Boolean);

  const oplijst = aan('opl') ? oplRijen(cv.opleidingen) : [];
  const regels  = extraRegels(c, ctx, o, {cert:aan('cert'), talen:aan('talen'), voorw:aan('voorw')});

  const m = {
    stand, naam, ref: referentie(c.id),
    fotoPad: aan('foto') ? c.foto : '',
    onder, pil: beschikbaarPil(c),
    schets: scrub(o.schets, c.naam, stand),
    werk:   aan('werk')   ? werkRijen(cv.werkgevers) : [],
    skills: aan('skills') ? lijst(cv.skills) : [],
    opl:    oplijst,
    regels: regels,
    oplLabel: oplijst.length ? 'Opleiding' : 'Achtergrond',
    datum: CRM.fmtDate(CRM.todayISO()),
    door:  CRM.me()
  };
  m.leeg = !m.schets && !m.werk.length && !m.skills.length && !m.opl.length && !m.regels.length;
  return m;
}

/* ═══════════════════════════════════════════════════════════════
   HET VEL (A4) — vaste opmaak, dit is wat geprint wordt
   ═══════════════════════════════════════════════════════════════ */
function velBlokken(m){
  const job = w => `<article class="cvg-job">
    <div class="cvg-jaar">${h(w.badge)}</div>
    <div class="cvg-jc">
      <div class="cvg-jt">
        <b>${h(w.bedrijf || w.functie || '—')}</b>
        ${w.periode ? `<span class="cvg-per">${h(w.periode)}</span>` : ''}
      </div>
      ${w.bedrijf && w.functie ? `<div class="cvg-jf">${h(w.functie)}</div>` : ''}
      ${w.taken.length ? `<ul class="cvg-taken">${w.taken.map(x => `<li>${h(x)}</li>`).join('')}</ul>` : ''}
    </div>
  </article>`;
  /* Meerdere rollen bij dezelfde werkgever (Tjeerd, 14 sep 2026: "dan staat
     daar dus 2x een werkgever en jaartallen, dit kan onoverzichtelijk
     zijn") — één bedrijfskop, elke rol eronder met zijn eigen periode en
     taken. Alleen AANEENGESLOTEN regels groeperen: m.werk staat al
     nieuwste-boven gesorteerd, en twee stints bij dezelfde werkgever met
     iets anders ertussen horen zichtbaar apart te blijven staan. */
  const groepen = [];
  for(const w of m.werk){
    const laatste = groepen[groepen.length - 1];
    if(laatste && w.bedrijf && laatste.bedrijf === w.bedrijf) laatste.rollen.push(w);
    else groepen.push({bedrijf: w.bedrijf, rollen: [w]});
  }
  const jobGroep = g => {
    if(g.rollen.length === 1) return job(g.rollen[0]);
    const jaren = g.rollen.map(r => r.jaar).filter(Boolean);
    const open = g.rollen.some(r => r.open);
    const eindJaren = g.rollen.map(r => r.eind).filter(Boolean);
    const vanJaar = jaren.length ? Math.min(...jaren) : null;
    const totJaar = !open && eindJaren.length ? Math.max(...eindJaren) : null;
    const badge = vanJaar ? "'" + String(vanJaar).slice(-2) + '-' + (open ? 'heden' : (totJaar ? "'" + String(totJaar).slice(-2) : '')) : '';
    return `<article class="cvg-job cvg-job-groep">
      <div class="cvg-jaar">${h(badge)}</div>
      <div class="cvg-jc">
        <div class="cvg-jt"><b>${h(g.bedrijf)}</b></div>
        ${g.rollen.map(w => `<div class="cvg-rol">
          <div class="cvg-jf">${h(w.functie || '—')}${w.periode ? ` <span class="cvg-per">· ${h(w.periode)}</span>` : ''}</div>
          ${w.taken.length ? `<ul class="cvg-taken">${w.taken.map(x => `<li>${h(x)}</li>`).join('')}</ul>` : ''}
        </div>`).join('')}
      </div>
    </article>`;
  };

  /* Het vel als losse blokken (Tjeerd, 5 nov 2026: "er staan nog vaak
     pagina's half in, ik wil het zelf goed op een pagina kunnen zetten").
     Een blok gaat altijd in zijn geheel naar een pagina; zetPaginas()
     verdeelt ze over A4-bladen. De lijn boven een sectie hoort bij het
     eerste blok van die sectie, zodat hij meeverhuist. */
  const blokken = [];
  blokken.push({id:'kop', soort:'kop', vast:true, html: kopHtml(m)});
  if(m.schets) blokken.push({id:'schets', soort:'schets', lbl:'Profielschets',
    html:`<p class="cvg-schets">${h(m.schets)}</p>`});
  groepen.forEach((g, i) => blokken.push({id:'werk' + i, soort:'werk',
    lbl:'Werkervaring · ' + (g.bedrijf || (g.rollen[0] || {}).functie || '—'),
    html:(i === 0 ? '<hr class="cvg-lijn"><h2 class="cvg-sk">Werkervaring</h2>' : '') + jobGroep(g)}));
  let lijn = '<hr class="cvg-lijn">';
  if(m.skills.length){
    blokken.push({id:'skills', soort:'onder', lbl:'Vaardigheden', html: lijn + `<section class="cvg-rij">
      <div class="cvg-lbl">Vaardigheden</div>
      <div class="cvg-rc"><div class="cvg-pillen">${m.skills.map(s => `<span class="cvg-pil-o">${h(s)}</span>`).join('')}</div></div>
    </section>`});
    lijn = '';
  }
  if(m.opl.length || m.regels.length) blokken.push({id:'opl', soort:'onder', lbl:m.oplLabel, html: lijn + `<section class="cvg-rij">
      <div class="cvg-lbl">${h(m.oplLabel)}</div>
      <div class="cvg-rc">
        ${m.opl.map(o => `<div class="cvg-oplr"><b>${h(o.kop)}</b>${o.rest.length ? `<span> · ${o.rest.map(x => h(x)).join(' · ')}</span>` : ''}</div>`).join('')}
        ${m.regels.length ? `<div class="cvg-extra">${m.regels.map(r =>
          `<div class="cvg-oplr"><b>${h(r.lbl)}</b><span> · ${h(r.w)}</span></div>`).join('')}</div>` : ''}
      </div>
    </section>`});
  if(m.leeg) blokken.push({id:'leeg', soort:'schets', vast:true, html:`<p class="cvg-schets cvg-stil">Van deze kandidaat staan nog geen profielgegevens in het systeem.
      Vul de kandidaatkaart aan of schrijf hiernaast een profielschets — dan vult dit vel zich vanzelf.</p>`});
  blokken.push({id:'voet', soort:'voet', vast:true, html:`<footer class="cvg-bal">
      <span>Contact via Ploeggenoten</span>
      <span class="cvg-url">ploeggenoten.nl</span>
    </footer>`});
  return blokken;
}

function kopHtml(m){
  return `
    <div class="cvg-kopzone">
      <div class="cvg-deco" aria-hidden="true"></div>
      ${m.fotoPad ? (() => {
        const nu = CRM.opslag.srcNu(m.fotoPad);
        return `<div class="cvg-foto"${nu ? '' : ` data-opslagfoto="${h(m.fotoPad)}"`}>${nu ? `<img src="${h(nu)}" alt="">` : ''}</div>`;
      })() : ''}
      <div class="cvg-top${m.fotoPad ? ' heeft-foto' : ''}">
        <img class="cvg-logo" src="assets/logo-dark.png" alt="Ploeggenoten">
        ${m.pil ? `<span class="cvg-pil">${h(m.pil)}</span>` : ''}
      </div>
      <h1 class="cvg-naam${m.naam.length > 12 ? ' lang' : ''}">${h(m.naam)}</h1>
      ${m.stand === 'geen' ? `<div class="cvg-ref num">Ref. ${h(m.ref)}</div>` : ''}
      ${m.onder.length ? `<div class="cvg-onder">${m.onder.map(x => h(x)).join(' · ')}</div>` : ''}
      <div class="cvg-balk"><i></i><b></b></div>
    </div>`;
}

/* ─── Blokken over A4-bladen verdelen ─────────────────────────────
   Het voorbeeld toont de echte bladen, dus wat je ziet is wat er in de
   pdf komt. Standen:
   - 'auto': past het op één blad (eventueel iets verkleind, niet onder
     CVG_AUTO_ZOOM), dan één blad; anders doorlopen naar blad 2.
   - 'een':  altijd één blad, verkleind tot CVG_MIN_ZOOM.
   - 'twee': nooit verkleinen; doorlopen, en blad 2 begint bij het blok
     dat de AM kiest (pag.breuk) of anders waar blad 1 vol is.
   Meten via getBoundingClientRect ten opzichte van het blad zelf: dat is
   altijd 297mm hoog, dus de schaal van het voorbeeld valt weg. */
const CVG_PAGINA_HOOGTE_PX = 297 * 96 / 25.4;
const CVG_PAGINA_BREEDTE_PX = 210 * 96 / 25.4;
const CVG_MIN_ZOOM = .72;
const CVG_AUTO_ZOOM = .86;
/* Een paar px mag in de ondermarge vallen (13mm, ruim 49px): anders
   valt een cv dat zichtbaar past toch af op een haar. */
const CVG_SPELING = 12;

function zetPaginas(velEl, blokken, m, pag){
  velEl.innerHTML = '';
  let bladZoom = 1;
  const nieuwBlad = eerste => {
    const blad = document.createElement('section');
    blad.className = 'cvg-blad';
    const inh = document.createElement('div');
    inh.className = 'cvg-inhoud';
    if(!eerste) inh.innerHTML = `<div class="cvg-kop2"><img class="cvg-logo" src="assets/logo-dark.png" alt="Ploeggenoten"><span>${h(m.naam)}</span></div>`;
    blad.appendChild(inh); velEl.appendChild(blad);
    if(bladZoom !== 1) zoom(inh, bladZoom);
    return inh;
  };
  const blokEl = b => {
    const d = document.createElement('div');
    d.className = 'cvg-blk cvg-blk-' + b.soort;
    d.dataset.blok = b.id;
    d.innerHTML = b.html;
    return d;
  };
  const hoogte = inh => {
    const blad = inh.parentElement.getBoundingClientRect().height;
    return blad > 0 ? inh.getBoundingClientRect().height / blad * CVG_PAGINA_HOOGTE_PX : inh.scrollHeight;
  };
  const zoom = (inh, z) => {
    inh.style.zoom = z === 1 ? '' : String(z);
    inh.style.width = z === 1 ? '' : (CVG_PAGINA_BREEDTE_PX / z) + 'px';
  };

  /* Eén blad, zo nodig verkleind. Na het verkleinen loopt de tekst breder
     door en wordt het vel korter, dus een paar keer bijstellen. */
  const opEen = minZoom => {
    velEl.innerHTML = '';
    const inh = nieuwBlad(true);
    blokken.forEach(b => inh.appendChild(blokEl(b)));
    let z = 1, hgt = hoogte(inh);
    for(let i = 0; i < 4 && hgt > CVG_PAGINA_HOOGTE_PX + CVG_SPELING; i++){
      z = Math.max(minZoom, z * CVG_PAGINA_HOOGTE_PX / hgt);
      zoom(inh, z);
      hgt = hoogte(inh);   // meet al in bladmaat, ook met zoom
      if(z === minZoom) break;
    }
    return {paginas:1, zoom:z, past: hgt <= CVG_PAGINA_HOOGTE_PX + CVG_SPELING, vulling: Math.min(1, hgt / CVG_PAGINA_HOOGTE_PX)};
  };

  const doorlopen = (z = 1) => {
    velEl.innerHTML = '';
    bladZoom = z;
    let inh = nieuwBlad(true);
    const aantal = () => inh.querySelectorAll('.cvg-blk').length;
    const vullingen = [];
    const volgende = () => { vullingen.push(hoogte(inh)); inh = nieuwBlad(false); };
    let teLang = false;
    blokken.forEach(b => {
      if(b.id === pag.breuk && velEl.children.length === 1 && aantal()) volgende();
      const el = blokEl(b);
      inh.appendChild(el);
      if(hoogte(inh) <= CVG_PAGINA_HOOGTE_PX + CVG_SPELING) return;
      const vorige = el.previousElementSibling;
      if(b.soort === 'voet' && vorige && vorige.classList.contains('cvg-blk') && aantal() > 2 && !vorige.dataset.blok.startsWith('kop')){
        /* De voetbalk past niet meer: neem het laatste blok mee, zodat
           blad 2 nooit alléén een voetbalk is. */
        vorige.remove(); el.remove(); volgende();
        inh.appendChild(vorige); inh.appendChild(el);
      }else if(aantal() > 1){
        el.remove(); volgende(); inh.appendChild(el);
      }
      if(hoogte(inh) > CVG_PAGINA_HOOGTE_PX + CVG_SPELING) teLang = true;
    });
    vullingen.push(hoogte(inh));
    return {paginas: velEl.children.length, zoom:z, past: !teLang,
      vulling: Math.min(1, vullingen[0] / CVG_PAGINA_HOOGTE_PX)};
  };

  /* 'zelf': de AM kiest de lettergrootte met de schuif (Tjeerd, 5 nov
     2026: "dat ik hem zelf groter of kleiner kan maken"). Wat niet past
     loopt in hele blokken door naar het volgende blad — nooit afsnijden. */
  if(pag.stand === 'zelf') return doorlopen(pag.zoom || 1);
  if(pag.stand === 'een') return opEen(CVG_MIN_ZOOM);
  if(pag.stand === 'twee') return doorlopen();
  const r = opEen(CVG_AUTO_ZOOM);
  return r.past ? r : doorlopen();
}

/* Platte tekst uit hetzelfde model. */
function velTekst(m){
  const uit = [];
  uit.push(m.naam.toUpperCase() + (m.stand === 'geen' ? '  (ref. ' + m.ref + ')' : ''));
  if(m.onder.length) uit.push(m.onder.join(' · '));
  if(m.pil) uit.push(m.pil);
  if(m.schets){ uit.push(''); uit.push(m.schets); }
  if(m.leeg){ uit.push(''); uit.push('Van deze kandidaat staan nog geen profielgegevens in het systeem.'); }
  if(m.werk.length){
    uit.push(''); uit.push('WERKERVARING');
    m.werk.forEach(w => {
      uit.push([w.bedrijf, w.functie].filter(Boolean).join(' — ') + (w.periode ? '  (' + w.periode + ')' : ''));
      w.taken.forEach(x => uit.push('  - ' + x));
    });
  }
  if(m.skills.length){ uit.push(''); uit.push('VAARDIGHEDEN'); uit.push(m.skills.join(', ')); }
  if(m.opl.length || m.regels.length){
    uit.push(''); uit.push(m.oplLabel.toUpperCase());
    m.opl.forEach(o => uit.push([o.kop].concat(o.rest).join(' · ')));
    m.regels.forEach(r => uit.push(r.lbl + ' · ' + r.w));
  }
  uit.push('');
  uit.push('Contact via Ploeggenoten · ploeggenoten.nl');
  uit.push('Opgesteld ' + m.datum + (m.door ? ' door ' + m.door : '') + '. Graag vertrouwelijk behandelen.');
  return uit.join('\n');
}

/* ═══════════════════════════════════════════════════════════════
   HET VENSTER
   ═══════════════════════════════════════════════════════════════ */
let paneelEl = null, sluitHandler = null, schaalWaarnemer = null;
/* Voor de bestandsnaam bij "Opslaan als PDF": Chrome/Safari stellen de
   documenttitel voor als bestandsnaam. Zonder dit heette elk cv hetzelfde
   als het browsertabblad ("Ploeggenoten CRM · Kandidaten.pdf") — geen naam
   erbij, dus onbruikbaar zodra je er twee naast elkaar hebt staan. */
let cvNaamVoorTitel = '', titelVoorPrint = null;

function zijkantHtml(c, o, er, werk, ctx = {}){
  const cv = c.cv || {};
  const zichtbaar = ONDERDELEN.filter(x => er[x.k]);
  const vacFunctie = ctx.vac ? t(ctx.vac.functie) : '';
  return `
    <div class="cvg-blok" id="cvg_pag"></div>

    <div class="cvg-blok">
      <div class="label" style="margin-bottom:8px">Naam op het profiel</div>
      <div class="seg cvg-seg">${NAAM_STANDEN.map(s =>
        `<button type="button" data-stand="${h(s.k)}" class="${o.naamStand === s.k ? 'on' : ''}">${h(s.lbl)}</button>`).join('')}</div>
      <div class="meta" style="margin-top:8px">Standaard alleen de voornaam — geen achternaam, geen adres,
        geen telefoon of e-mail. "Naamloos" vervangt de naam door een referentie.</div>
    </div>

    <div class="cvg-blok">
      <div class="label" style="margin-bottom:6px">Functie onder de naam</div>
      <input type="text" id="cvg_functie" value="${h(o.functie)}" placeholder="bijv. Productiemedewerker / Operator">
      ${vacFunctie && t(o.functie).toLowerCase() !== vacFunctie.toLowerCase()
        ? `<button type="button" class="lnk" id="cvg_vacfunctie" style="margin-top:6px">Functie van de vacature gebruiken: ${h(vacFunctie)}</button>` : ''}
      <div class="meta" style="margin-top:6px">Vrij in te vullen, of leeg laten. De vacature wordt niet meer vanzelf overgenomen:
        vaak stel je iemand voor meerdere functies voor.</div>
    </div>

    <div class="cvg-blok">
      <div class="label" style="margin-bottom:6px">Profielschets</div>
      <textarea id="cvg_schets" rows="8" placeholder="Vier tot zes regels die deze kandidaat samenvatten: achtergrond, sterke punten, en wat de volgende stap moet brengen.">${h(o.schets)}</textarea>
      ${vacFunctie && !/stellen wij deze kandidaat/i.test(o.schets)
        ? `<button type="button" class="lnk" id="cvg_vaczin" style="margin-top:6px">+ Zin voor deze vacature toevoegen</button>` : ''}
      <div class="meta" style="margin-top:6px">Dit is het belangrijkste stuk van het vel — schrijf het in je eigen woorden.</div>
    </div>

    <div class="cvg-blok">
      <div class="label" style="margin-bottom:6px">Sector</div>
      <input type="text" id="cvg_sector" value="${h(o.sector)}" placeholder="bijv. Maritiem &amp; logistiek">
      <div class="meta" style="margin-top:6px">Optioneel; komt achter de functie te staan. Laat leeg als je het niet zeker weet.</div>
    </div>

    ${werk.length ? `<div class="cvg-blok">
      <div class="label" style="margin-bottom:4px">Werkervaring</div>
      <div class="meta" style="margin-bottom:10px">Staat een datum of badge er verkeerd op? Corrigeer hier — dit
        schrijft direct terug naar de kandidaatkaart, dus de fout komt niet terug bij een volgend cv.</div>
      ${werk.map(w => `<div class="cvg-taakveld">
        <div class="cvg-werkrij">
          <input type="text" data-werk="${w.i}|werkgever" value="${h(w.bedrijf)}" placeholder="Werkgever">
          <input type="text" data-werk="${w.i}|functie" value="${h(w.functie)}" placeholder="Functie">
        </div>
        <div class="cvg-werkrij">
          <input type="text" data-werk="${w.i}|van" value="${h(w.van)}" placeholder="Van, bijv. 2024-01">
          <input type="text" data-werk="${w.i}|tot" value="${h(w.tot)}" placeholder="Tot, bijv. heden">
        </div>
        <label for="cvg_tk${w.i}">Taken${w.badge ? ` <span class="num">${h(w.badge)}</span>` : ''}</label>
        <textarea id="cvg_tk${w.i}" data-taak="${w.i}" rows="3" placeholder="Instellen en bedienen van productiemachines&#10;Kwaliteitscontroles uitvoeren">${h(w.taken.join('\n'))}</textarea>
      </div>`).join('')}
    </div>` : ''}

    ${zichtbaar.length ? `<div class="cvg-blok">
      <div class="label">Onderdelen</div>
      ${zichtbaar.map(x => `<label class="check"><input type="checkbox" data-deel="${h(x.k)}" ${o.aan[x.k] !== false ? 'checked' : ''}> ${h(x.lbl)}</label>`).join('')}
    </div>` : ''}

    ${t(cv.salariswens) ? `<div class="cvg-blok">
      <div class="label">Salaris</div>
      <label class="check"><input type="checkbox" id="cvg_sal" ${o.salaris ? 'checked' : ''}> Salariswens tonen</label>
      <div class="meta">Staat standaard uit. Fee, marge en tarief komen nooit op dit profiel.</div>
    </div>` : ''}`;
}

function schaalBij(){
  if(!paneelEl) return;
  const wrap = paneelEl.querySelector('.cvg-preview');
  const schaal = paneelEl.querySelector('.cvg-schaal');
  const vel = paneelEl.querySelector('.cvg-vel');
  if(!wrap || !schaal || !vel) return;
  const ruimte = wrap.clientWidth - 48;
  const breed = vel.offsetWidth || 794;
  const s = Math.min(1, Math.max(.3, ruimte / breed));
  schaal.style.transform = 'scale(' + s + ')';
  schaal.style.width  = breed + 'px';
  schaal.style.height = (vel.offsetHeight * s) + 'px';
}

/* Werkervaring (taken, werkgever, functie, van/tot) terugschrijven naar de
   kandidaat. Alleen het cv-veld, zodat we niets anders op de kaart aanraken
   (en in demo niets naar de database). Dezelfde rijen als het
   Werkervaring-blok op de kandidaatkaart (cv.werkgevers) — een correctie
   hier staat dus ook meteen goed op de kaart, en bij het volgende cv. */
async function bewaarWerk(c){
  const rij = CRM.state.cands.find(r => String(r.id) === String(c.id));
  if(rij) rij.cv = c.cv;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update({cv:c.cv}).eq('id', c.id);
    if(error) return CRM.fout('Werkervaring opslaan mislukt', error);
  }
  CRM.toast('Werkervaring bewaard bij de kandidaat', 'ok');
}

function open(kandidaat, opts){
  const c = (typeof kandidaat === 'string') ? CRM.kandidaat(kandidaat) : kandidaat;
  if(!c){ CRM.toast('Kandidaat niet gevonden', 'err'); return; }
  const ctx = context(opts);
  const o = laadOpts();
  cvNaamVoorTitel = t(c.naam) || 'Kandidaat';

  /* Profielschets voorvullen: de samenvatting uit de intake (js/recruitment.js,
     sectie 4) is precies waarvoor dit vlak bedoeld is. Anders een neutrale
     beginzin. */
  const samenvatting = t((c.intake || {}).samenvatting);
  if(samenvatting) o.schets = samenvatting;
  /* Niet meer vanzelf de vacature in het vel (Tjeerd, 5 nov 2026: "vaak
     stellen wij één kandidaat aan meerdere functies voor, dus het hoeft
     niet de hele tijd automatisch ingezet te worden"). De voorstelzin en
     de vacaturefunctie zijn nu een knop in de zijkant. Onder de naam komt
     de eigen functie van de kandidaat; is die gelijk aan de vacature (bij
     het koppelen overgenomen), dan blijft het veld leeg. */
  const vacFunctie = ctx.vac ? t(ctx.vac.functie) : '';
  o.functie = [t((c.cv || {}).functie), t(c.functie)]
    .find(f => f && f.toLowerCase() !== vacFunctie.toLowerCase()) || '';
  /* Sector: de branche van de klant is een startpunt, geen aanname — de
     AM ziet hem staan en kan hem aanpassen of weghalen. */
  const klantRij = ctx.klant && CRM.klant ? CRM.klant(ctx.klant) : null;
  if(klantRij && t(klantRij.branche)) o.sector = t(klantRij.branche);

  sluit(true);
  const wrap = document.createElement('div');
  wrap.id = 'cvgen'; wrap.className = 'cvg';
  wrap.innerHTML = `
    <div class="cvg-scrim"></div>
    <div class="cvg-paneel" role="dialog" aria-modal="true" aria-label="Kandidaatprofiel maken">
      <header class="cvg-kop">
        <div>
          <div class="h2">Kandidaatprofiel</div>
          <div class="meta" id="cvg_kopsub"></div>
        </div>
        <button class="btn sub" id="cvg_x" aria-label="Sluiten">✕</button>
      </header>
      <div class="cvg-body">
        <aside class="cvg-zij" id="cvg_zij"></aside>
        <div class="cvg-preview">
          <div class="cvg-schaal"><article class="cvg-vel" id="cvg_vel"></article></div>
        </div>
      </div>
      <footer class="cvg-voet">
        <span class="meta" id="cvg_stand"></span>
        <span class="spacer"></span>
        <button class="btn ghost" id="cvg_kopie">Tekst kopiëren</button>
        <button class="btn" id="cvg_print">Afdrukken / opslaan als PDF</button>
      </footer>
    </div>`;
  document.body.appendChild(wrap);
  paneelEl = wrap;
  document.body.style.overflow = 'hidden';

  const velEl = wrap.querySelector('#cvg_vel');
  const zijEl = wrap.querySelector('#cvg_zij');
  const standEl = wrap.querySelector('#cvg_stand');
  wrap.querySelector('#cvg_kopsub').textContent =
    (t(c.naam) || 'Kandidaat') + (ctx.vac ? ' · ' + t(ctx.vac.functie) + (ctx.klant ? ' bij ' + ctx.klant : '') : '');

  let model = null;
  /* Pagina-indeling hoort bij dit ene vel, niet onthouden. */
  const pag = {stand:'auto', breuk:'', zoom:1};
  /* Het blok wordt één keer opgebouwd en daarna alleen bijgewerkt: zo
     blijft de schuif onder je muis staan terwijl je sleept. */
  function bouwPag(pagEl){
    pagEl.innerHTML = `
      <div class="label" style="margin-bottom:8px">Pagina's en lettergrootte</div>
      <div class="seg cvg-seg">${[['auto','Automatisch'],['een','1 pagina'],['twee',"2 pagina's"]].map(([k, l]) =>
        `<button type="button" data-pag="${k}">${l}</button>`).join('')}</div>
      <label for="cvg_zoom" class="cvg-zoomrij">
        <span>Kleiner</span>
        <input type="range" id="cvg_zoom" min="70" max="115" step="1" value="100">
        <span>Groter</span>
        <b class="num" id="cvg_zoomw">100%</b>
      </label>
      <div id="cvg_breukw" style="display:none">
        <label class="label" for="cvg_breuk" style="display:block;margin:12px 0 6px">Pagina 2 begint bij</label>
        <select id="cvg_breuk"></select>
      </div>
      <div class="meta" id="cvg_pagmeta" style="margin-top:8px"></div>`;
    pagEl.querySelectorAll('[data-pag]').forEach(b => b.onclick = () => {
      pag.stand = b.dataset.pag;
      if(pag.stand === 'een') pag.breuk = '';
      teken();
    });
    const zoomEl = pagEl.querySelector('#cvg_zoom');
    const zetZoom = CRM.debounce(() => { teken(); }, 60);
    zoomEl.oninput = () => {
      pag.stand = 'zelf';
      pag.zoom = Number(zoomEl.value) / 100;
      pagEl.querySelector('#cvg_zoomw').textContent = zoomEl.value + '%';
      zetZoom();
    };
    const breuk = pagEl.querySelector('#cvg_breuk');
    breuk.onchange = () => {
      pag.breuk = breuk.value;
      if(pag.breuk && pag.stand !== 'zelf') pag.stand = 'twee';
      teken();
    };
  }
  function tekenPag(r, blokken){
    const pagEl = zijEl.querySelector('#cvg_pag');
    if(!pagEl) return;
    if(!pagEl.querySelector('#cvg_zoom')) bouwPag(pagEl);
    const keuzes = blokken.filter(b => !b.vast);
    const pct = x => Math.round(x * 100) + '%';
    let status;
    if(r.paginas === 1){
      status = !r.past
        ? `<span style="color:var(--red)">Te lang voor 1 pagina, ook verkleind tot ${pct(r.zoom)}. Kort taken in, zet onderdelen uit of kies 2 pagina's.</span>`
        : r.zoom < 1 ? `Past op 1 pagina, verkleind tot ${pct(r.zoom)}.` : 'Past op 1 pagina.';
    }else{
      status = `${r.paginas} pagina's · pagina 1 is voor ${pct(r.vulling)} gevuld.` +
        (r.vulling < .8 ? ' Veel wit onderaan? Kies hieronder waar pagina 2 begint, of maak de letters iets kleiner.' : '') +
        (!r.past ? ' <span style="color:var(--red)">Eén blok is langer dan een hele pagina; kort de taken daar in.</span>' : '');
      /* Gekozen beginpunt ligt verder dan wat op pagina 1 past: zeg waar
         pagina 2 nu echt begint, anders lijkt de keuze niet te werken. */
      const eerste2 = velEl.querySelectorAll('.cvg-blad')[1]?.querySelector('.cvg-blk')?.dataset.blok;
      const b2 = blokken.find(b => b.id === eerste2);
      if(pag.breuk && b2 && eerste2 !== pag.breuk)
        status += ` <span style="color:var(--oranje)">Zo ver past pagina 1 niet; pagina 2 begint nu bij ${h(b2.lbl)}.</span>`;
    }
    pagEl.querySelectorAll('[data-pag]').forEach(b => b.classList.toggle('on', b.dataset.pag === pag.stand));
    /* De schuif volgt wat de automatische standen kozen, behalve terwijl
       je er zelf aan zit. */
    const zoomEl = pagEl.querySelector('#cvg_zoom');
    if(document.activeElement !== zoomEl){
      zoomEl.value = String(Math.round(r.zoom * 100));
      pagEl.querySelector('#cvg_zoomw').textContent = Math.round(r.zoom * 100) + '%';
    }
    const breukW = pagEl.querySelector('#cvg_breukw');
    breukW.style.display = (r.paginas > 1 || pag.stand === 'twee' || pag.stand === 'zelf') ? '' : 'none';
    pagEl.querySelector('#cvg_breuk').innerHTML = `<option value="">Automatisch (waar pagina 1 vol is)</option>` +
      keuzes.map(b => `<option value="${h(b.id)}"${pag.breuk === b.id ? ' selected' : ''}>${h(b.lbl)}</option>`).join('');
    pagEl.querySelector('#cvg_pagmeta').innerHTML = status;
  }
  function teken(){
    model = bouwModel(c, ctx, o);
    const blokken = velBlokken(model);
    if(pag.breuk && !blokken.some(b => b.id === pag.breuk)) pag.breuk = '';
    const r = zetPaginas(velEl, blokken, model, pag);
    tekenPag(r, blokken);
    if(model.fotoPad) CRM.opslag.vulAfbeeldingen(velEl);
    const stand = NAAM_STANDEN.find(s => s.k === o.naamStand);
    standEl.textContent = 'Naam: ' + (stand ? stand.lbl.toLowerCase() : '') +
      ' · geen contactgegevens op het vel' + (model.leeg ? ' · weinig gegevens beschikbaar' : '');
    requestAnimationFrame(schaalBij);
  }
  function tekenZij(){
    zijEl.innerHTML = zijkantHtml(c, o, beschikbaar(c, ctx), werkRijen((c.cv || {}).werkgevers), ctx);
    bindZij();
    teken();
  }
  function bindZij(){
    zijEl.querySelectorAll('[data-stand]').forEach(b => b.onclick = () => {
      o.naamStand = b.dataset.stand; bewaarOpts(o);
      zijEl.querySelectorAll('[data-stand]').forEach(x => x.classList.toggle('on', x === b));
      teken();
    });
    const sal = zijEl.querySelector('#cvg_sal');
    if(sal) sal.onchange = () => { o.salaris = sal.checked; bewaarOpts(o); teken(); };
    zijEl.querySelectorAll('[data-deel]').forEach(inp => inp.onchange = () => {
      o.aan[inp.dataset.deel] = inp.checked; bewaarOpts(o); teken();
    });
    const schets = zijEl.querySelector('#cvg_schets');
    if(schets) schets.oninput = CRM.debounce(() => { o.schets = schets.value; teken(); }, 180);
    const functie = zijEl.querySelector('#cvg_functie');
    if(functie) functie.oninput = CRM.debounce(() => { o.functie = functie.value; teken(); }, 180);
    const vacF = zijEl.querySelector('#cvg_vacfunctie');
    if(vacF) vacF.onclick = () => { o.functie = t(ctx.vac.functie); tekenZij(); };
    const vacZin = zijEl.querySelector('#cvg_vaczin');
    if(vacZin) vacZin.onclick = () => {
      const zin = 'Voor de functie ' + t(ctx.vac.functie) + (ctx.klant ? ' bij ' + ctx.klant : '') + ' stellen wij deze kandidaat aan je voor.';
      o.schets = t(o.schets) ? zin + ' ' + t(o.schets) : zin;
      tekenZij();
    };
    const sector = zijEl.querySelector('#cvg_sector');
    if(sector) sector.oninput = CRM.debounce(() => { o.sector = sector.value; teken(); }, 180);

    /* Taken: live in het voorbeeld, bij verlaten van het veld bewaren. */
    zijEl.querySelectorAll('[data-taak]').forEach(ta => {
      const idx = Number(ta.dataset.taak);
      const zetTaken = () => {
        const rijen = (c.cv && Array.isArray(c.cv.werkgevers)) ? c.cv.werkgevers : null;
        if(!rijen || !rijen[idx]) return false;
        const nieuw = ta.value.split(/\r?\n/).map(x => t(x)).filter(Boolean);
        const oud = Array.isArray(rijen[idx].taken) ? rijen[idx].taken : [];
        if(nieuw.join('\n') === oud.join('\n')) return false;
        c.cv = Object.assign({}, c.cv);
        c.cv.werkgevers = rijen.map((x, j) => j === idx ? Object.assign({}, x, {taken:nieuw}) : x);
        return true;
      };
      /* Tikken werkt het voorbeeld bij; pas bij verlaten van het veld gaat
         het naar de kandidaat. Onthoud dus dát er iets veranderde — anders
         ziet de blur geen verschil meer en wordt er nooit bewaard. */
      let vuil = false;
      ta.oninput = CRM.debounce(() => { if(zetTaken()){ vuil = true; teken(); } }, 200);
      ta.onblur  = () => {
        if(zetTaken()){ vuil = true; teken(); }
        if(vuil){ vuil = false; bewaarWerk(c); }
      };
    });

    /* Werkgever, functie, van en tot: zelfde principe als taken hierboven.
       Badge en periode worden altijd uit van/tot berekend (zie werkRijen),
       dus dit is de plek om een verkeerd ingelezen datum recht te zetten —
       zonder terug te hoeven naar de kandidaatkaart. */
    zijEl.querySelectorAll('[data-werk]').forEach(inp => {
      const [idxStr, sleutel] = inp.dataset.werk.split('|');
      const idx = Number(idxStr);
      const zetWerk = () => {
        const rijen = (c.cv && Array.isArray(c.cv.werkgevers)) ? c.cv.werkgevers : null;
        if(!rijen || !rijen[idx]) return false;
        const nieuw = t(inp.value);
        const oud = t(rijen[idx][sleutel]);
        if(nieuw === oud) return false;
        c.cv = Object.assign({}, c.cv);
        c.cv.werkgevers = rijen.map((x, j) => j === idx ? Object.assign({}, x, {[sleutel]: nieuw}) : x);
        return true;
      };
      let vuil = false;
      inp.oninput = CRM.debounce(() => { if(zetWerk()){ vuil = true; teken(); } }, 200);
      inp.onblur  = () => {
        if(zetWerk()) vuil = true;
        if(vuil){ vuil = false; bewaarWerk(c); tekenZij(); }
      };
    });
  }

  tekenZij();
  /* De bladindeling meet de tekst; staat het Anton-lettertype er bij de
     eerste keer nog niet, dan opnieuw verdelen zodra het geladen is. */
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if(paneelEl === wrap) teken(); });

  wrap.querySelector('.cvg-scrim').onclick = () => sluit();
  wrap.querySelector('#cvg_x').onclick = () => sluit();
  wrap.querySelector('#cvg_kopie').onclick = () => kopieer(velTekst(model));
  wrap.querySelector('#cvg_print').onclick = () => afdrukken(c, ctx, o);

  sluitHandler = e => { if(e.key === 'Escape') sluit(); };
  document.addEventListener('keydown', sluitHandler);

  if(window.ResizeObserver){
    schaalWaarnemer = new ResizeObserver(() => schaalBij());
    schaalWaarnemer.observe(wrap.querySelector('.cvg-preview'));
  }else{
    window.addEventListener('resize', schaalBij);
  }
  const logo = velEl.querySelector('img');
  if(logo) logo.addEventListener('load', schaalBij, {once:true});
  requestAnimationFrame(schaalBij);
}

function sluit(stil){
  const el = document.getElementById('cvgen');
  if(sluitHandler){ document.removeEventListener('keydown', sluitHandler); sluitHandler = null; }
  if(schaalWaarnemer){ try{ schaalWaarnemer.disconnect(); }catch(e){} schaalWaarnemer = null; }
  else window.removeEventListener('resize', schaalBij);
  if(el) el.remove();
  paneelEl = null;
  if(!stil) document.body.style.overflow = '';
}

/* ─── Afdrukken ───────────────────────────────────────────────── */
/* De printregels hangen aan .cvg.cvg-print (zie css/cv.css) in plaats van
   aan @media print, zodat de printweergave ook op het scherm te
   controleren is. De klasse gaat er meteen weer af. */
/* @page geldt voor het HELE document en is niet per module af te bakenen.
   Stond hij vast in css/cv.css, dan printte elk ander scherm van de app ook
   zonder marges — en zouden de overeenkomst en het plan van aanpak elkaars
   instelling overschrijven, afhankelijk van de laadvolgorde. Daarom zetten
   we hem alleen zolang DIT vel geprint wordt, net als js/swo.js doet. */
function paginaAan(){
  if(document.getElementById('cvg-print-page')) return;
  const st = document.createElement('style');
  st.id = 'cvg-print-page';
  st.textContent = '@page{size:A4;margin:0}';
  document.head.appendChild(st);
}
function paginaUit(){ document.getElementById('cvg-print-page')?.remove(); }

/* Verkleinen en de verdeling over bladen gebeuren al in het voorbeeld
   (zetPaginas, met CSS `zoom`, die anders dan `transform` meetelt in de
   paginering). Bij het printen verandert er dus niets meer aan de opmaak:
   het voorbeeld ís de pdf. */
let printTimer = null;
function printAan(){
  if(!paneelEl) return;
  paneelEl.classList.add('cvg-print');
  paginaAan();
  if(titelVoorPrint == null){
    titelVoorPrint = document.title;
    document.title = 'CV ' + cvNaamVoorTitel + ' - Ploeggenoten';
  }
}
function printUit(){
  clearTimeout(printTimer); printTimer = null;
  if(paneelEl) paneelEl.classList.remove('cvg-print');
  if(titelVoorPrint != null){ document.title = titelVoorPrint; titelVoorPrint = null; }
  paginaUit();
}
window.addEventListener('beforeprint', printAan);
window.addEventListener('afterprint', printUit);

async function afdrukken(c, ctx, o){
  if(!paneelEl) return;
  printAan();
  printTimer = setTimeout(printUit, 8000);
  /* GEEN printUit() hier na window.print(). Die stond hier eerst wél, en dat
     was de bug achter een cv dat op 1 blad had moeten passen maar toch op
     twee pagina's afdrukte: window.print() is niet op elk platform
     blokkerend (op macOS keert de aanroep vaak meteen terug, ruim vóórdat
     Chrome de afdruksnapshot maakt). Die vroege printUit() zette de zoom
     dan alwéér terug naar '' vóórdat de pdf werd gegenereerd — het
     zichtbare voorbeeld was verkleind, de opgeslagen pdf niet. Nu doet
     alleen 'afterprint' (hierboven) dat, die vuurt pas als het
     afdruk/pdf-venster echt dicht is; de setTimeout hierboven blijft als
     vangnet als afterprint een keer niet vuurt. (naam: Tjeerd, 11 aug 2026) */
  try{ window.print(); }catch(e){ CRM.fout('Afdrukken lukte niet', e); printUit(); }

  const stand = (NAAM_STANDEN.find(s => s.k === o.naamStand) || {}).lbl || o.naamStand;
  const waar = ctx.vac ? ' voor ' + t(ctx.vac.functie) + (ctx.klant ? ' bij ' + ctx.klant : '') : '';
  try{
    await CRM.logActiviteit('kandidaat', c.id, 'doc',
      'Kandidaatprofiel gemaakt (' + String(stand).toLowerCase() + ')' + waar + '.');
  }catch(e){ console.warn('activiteit loggen', e); }
}

/* ─── Kopiëren ────────────────────────────────────────────────── */
async function kopieer(tekst){
  try{
    if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(tekst);
    else throw new Error('geen clipboard-api');
    CRM.toast('Profiel als tekst gekopieerd', 'ok');
  }catch(e){
    const ta = document.createElement('textarea');
    ta.value = tekst; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e2){}
    ta.remove();
    CRM.toast(ok ? 'Profiel als tekst gekopieerd' : 'Kopiëren lukte niet — selecteer de tekst handmatig', ok ? 'ok' : 'err');
  }
}

CRM.cvGen = {open, sluit};
})();
