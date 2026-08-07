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
  {k:'werk',   lbl:'Werkervaring'},
  {k:'skills', lbl:'Vaardigheden'},
  {k:'opl',    lbl:'Opleiding'},
  {k:'cert',   lbl:'Certificaten'},
  {k:'talen',  lbl:'Talen'},
  {k:'voorw',  lbl:'Beschikbaarheid & voorwaarden'}
];

const STD = {
  naamStand:'voornaam', salaris:false,
  aan:{werk:true, skills:true, opl:true, cert:true, talen:true, voorw:true}
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
      /* Niet zomaar op een koppelteken splitsen: "09-2025" is één datum
         (maand-jaar) en werd zo doormidden geknipt tot van="09" en
         tot="2025". Gevolg: geen jaartal, geen badge, en die functie zakte
         naar de bodem van het cv (naam: Tjeerd, 7 aug 2026). Een koppelteken
         scheidt alleen als er spaties omheen staan; een lang streepje en het
         woord "tot" scheiden altijd. */
      const ruw = t(r.periode);
      let d = ruw.split(/\s*[–—]\s*|\s+-\s+|\s+tot\s+/i);
      /* "2020-2024" heeft geen spaties maar is wél een bereik — twee jaartallen
         aan weerszijden van het streepje verraden dat. */
      if(d.length < 2){
        const jj = ruw.match(/^((?:19|20)\d{2})\s*-\s*((?:19|20)\d{2}|heden|nu)$/i);
        if(jj) d = [jj[1], jj[2]];
      }
      van = t(d[0] || ''); tot = t(d[1] || '');
    }
    if(!van && !tot && t(r.jaar)) van = t(r.jaar);
    const jv = jaarVan(van), jt = jaarVan(tot);
    const lopend = !t(tot) || LOPEND.test(t(tot));
    const badge = jv ? "'" + String(jv).slice(-2) + '-' + (lopend || !jt ? '' : "'" + String(jt).slice(-2)) : '';
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
      badge, periode,
      taken: Array.isArray(taken) ? taken.map(x => t(x)).filter(Boolean) : []
    };
  }).filter(r => r.bedrijf || r.functie)
    /* Recentste bovenaan. Staat er geen leesbare datum bij, dan blijft die
       regel op de plek waar hij op de kandidatenkaart staat (a.i) in plaats
       van naar de bodem te zakken — die volgorde is daar met de hand
       gezet en is dus een keuze, geen toeval. */
    .sort((a, b) => (b.sleutel || 0) - (a.sleutel || 0) || a.i - b.i)
    /* De bovenste functie is de lopende: die krijgt een open badge ('25-),
       ook als er al een verwachte einddatum in dit jaar staat. */
    .map((r, n) => {
      if(n === 0 && !r.open && r.eind && r.eind >= new Date().getFullYear())
        r.badge = r.badge.replace(/-'?\d*$/, '-');
      return r;
    });
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
  if(welke.cert)  zet('Certificaten', lijst(cv.certificaten).join(', '));
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
    werk:   werkRijen(cv.werkgevers).length > 0,
    skills: lijst(cv.skills).length > 0,
    opl:    oplRijen(cv.opleidingen).length > 0,
    cert:   lijst(cv.certificaten).length > 0,
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

  const functie = t(c.functie) || t(cv.functie) || (ctx.vac ? t(ctx.vac.functie) : '');
  const onder = [functie, t(o.sector), stand === 'geen' ? '' : t(c.woonplaats)].filter(Boolean);

  const oplijst = aan('opl') ? oplRijen(cv.opleidingen) : [];
  const regels  = extraRegels(c, ctx, o, {cert:aan('cert'), talen:aan('talen'), voorw:aan('voorw')});

  const m = {
    stand, naam, ref: referentie(c.id),
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
function velHtml(m){
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

  const onderBlok = (m.skills.length || m.opl.length || m.regels.length) ? `
    <hr class="cvg-lijn">
    ${m.skills.length ? `<section class="cvg-rij">
      <div class="cvg-lbl">Vaardigheden</div>
      <div class="cvg-rc"><div class="cvg-pillen">${m.skills.map(s => `<span class="cvg-pil-o">${h(s)}</span>`).join('')}</div></div>
    </section>` : ''}
    ${(m.opl.length || m.regels.length) ? `<section class="cvg-rij">
      <div class="cvg-lbl">${h(m.oplLabel)}</div>
      <div class="cvg-rc">
        ${m.opl.map(o => `<div class="cvg-oplr"><b>${h(o.kop)}</b>${o.rest.length ? `<span> · ${o.rest.map(x => h(x)).join(' · ')}</span>` : ''}</div>`).join('')}
        ${m.regels.length ? `<div class="cvg-extra">${m.regels.map(r =>
          `<div class="cvg-oplr"><b>${h(r.lbl)}</b><span> · ${h(r.w)}</span></div>`).join('')}</div>` : ''}
      </div>
    </section>` : ''}` : '';

  return `
    <div class="cvg-kopzone">
      <div class="cvg-deco" aria-hidden="true"></div>
      <div class="cvg-top">
        <img class="cvg-logo" src="assets/logo-dark.png" alt="Ploeggenoten">
        ${m.pil ? `<span class="cvg-pil">${h(m.pil)}</span>` : ''}
      </div>
      <h1 class="cvg-naam${m.naam.length > 12 ? ' lang' : ''}">${h(m.naam)}</h1>
      ${m.stand === 'geen' ? `<div class="cvg-ref num">Ref. ${h(m.ref)}</div>` : ''}
      ${m.onder.length ? `<div class="cvg-onder">${m.onder.map(x => h(x)).join(' · ')}</div>` : ''}
      <div class="cvg-balk"><i></i><b></b></div>
    </div>

    ${m.schets ? `<p class="cvg-schets">${h(m.schets)}</p>` : ''}

    ${m.werk.length ? `<hr class="cvg-lijn">
      <section class="cvg-werk">
        <h2 class="cvg-sk">Werkervaring</h2>
        ${m.werk.map(job).join('')}
      </section>` : ''}

    ${onderBlok}

    ${m.leeg ? `<p class="cvg-schets cvg-stil">Van deze kandidaat staan nog geen profielgegevens in het systeem.
      Vul de kandidaatkaart aan of schrijf hiernaast een profielschets — dan vult dit vel zich vanzelf.</p>` : ''}

    <footer class="cvg-bal">
      <span>Contact via Ploeggenoten</span>
      <span class="cvg-url">ploeggenoten.nl</span>
    </footer>`;
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

function zijkantHtml(c, o, er, werk){
  const cv = c.cv || {};
  const zichtbaar = ONDERDELEN.filter(x => er[x.k]);
  return `
    <div class="cvg-blok">
      <div class="label" style="margin-bottom:8px">Naam op het profiel</div>
      <div class="seg cvg-seg">${NAAM_STANDEN.map(s =>
        `<button type="button" data-stand="${h(s.k)}" class="${o.naamStand === s.k ? 'on' : ''}">${h(s.lbl)}</button>`).join('')}</div>
      <div class="meta" style="margin-top:8px">Standaard alleen de voornaam — geen achternaam, geen adres,
        geen telefoon of e-mail. "Naamloos" vervangt de naam door een referentie.</div>
    </div>

    <div class="cvg-blok">
      <div class="label" style="margin-bottom:6px">Profielschets</div>
      <textarea id="cvg_schets" rows="8" placeholder="Vier tot zes regels die deze kandidaat samenvatten: achtergrond, sterke punten, en wat de volgende stap moet brengen.">${h(o.schets)}</textarea>
      <div class="meta" style="margin-top:6px">Dit is het belangrijkste stuk van het vel — schrijf het in je eigen woorden.</div>
    </div>

    <div class="cvg-blok">
      <div class="label" style="margin-bottom:6px">Sector</div>
      <input type="text" id="cvg_sector" value="${h(o.sector)}" placeholder="bijv. Maritiem &amp; logistiek">
      <div class="meta" style="margin-top:6px">Optioneel; komt achter de functie te staan. Laat leeg als je het niet zeker weet.</div>
    </div>

    ${werk.length ? `<div class="cvg-blok">
      <div class="label" style="margin-bottom:4px">Taken per functie</div>
      <div class="meta" style="margin-bottom:10px">Twee tot vier concrete taken, één per regel. Wordt bij de kandidaat bewaard.</div>
      ${werk.map(w => `<div class="cvg-taakveld">
        <label for="cvg_tk${w.i}">${h(w.bedrijf || w.functie)}${w.badge ? ` <span class="num">${h(w.badge)}</span>` : ''}</label>
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

/* Taken terugschrijven naar de kandidaat. Alleen het cv-veld, zodat we
   niets anders op de kaart aanraken (en in demo niets naar de database). */
async function bewaarTaken(c){
  const rij = CRM.state.cands.find(r => String(r.id) === String(c.id));
  if(rij) rij.cv = c.cv;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update({cv:c.cv}).eq('id', c.id);
    if(error) return CRM.fout('Taken opslaan mislukt', error);
  }
  CRM.toast('Taken bewaard bij de kandidaat', 'ok');
}

function open(kandidaat, opts){
  const c = (typeof kandidaat === 'string') ? CRM.kandidaat(kandidaat) : kandidaat;
  if(!c){ CRM.toast('Kandidaat niet gevonden', 'err'); return; }
  const ctx = context(opts);
  const o = laadOpts();

  /* Profielschets voorvullen: de samenvatting uit de intake is precies
     waarvoor dit vlak bedoeld is. Anders een neutrale beginzin. */
  const it = c.intake || {};
  const delen = [];
  if(t(it.samenvatting)) delen.push(t(it.samenvatting));
  if(t(it.drijfveer || it.drijfveren)) delen.push(t(it.drijfveer || it.drijfveren).replace(/\.?$/, '.'));
  if(delen.length) o.schets = delen.join(' ');
  else if(ctx.vac) o.schets = 'Voor de functie ' + t(ctx.vac.functie) + (ctx.klant ? ' bij ' + ctx.klant : '') +
    ' stellen wij deze kandidaat aan je voor. ';
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
  function teken(){
    model = bouwModel(c, ctx, o);
    velEl.innerHTML = velHtml(model);
    const stand = NAAM_STANDEN.find(s => s.k === o.naamStand);
    standEl.textContent = 'Naam: ' + (stand ? stand.lbl.toLowerCase() : '') +
      ' · geen contactgegevens op het vel' + (model.leeg ? ' · weinig gegevens beschikbaar' : '');
    requestAnimationFrame(schaalBij);
  }
  function tekenZij(){
    zijEl.innerHTML = zijkantHtml(c, o, beschikbaar(c, ctx), werkRijen((c.cv || {}).werkgevers));
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
        if(vuil){ vuil = false; bewaarTaken(c); }
      };
    });
  }

  tekenZij();

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

let printTimer = null;
function printAan(){ if(paneelEl){ paneelEl.classList.add('cvg-print'); paginaAan(); } }
function printUit(){
  clearTimeout(printTimer); printTimer = null;
  if(paneelEl) paneelEl.classList.remove('cvg-print');
  paginaUit();
}
window.addEventListener('beforeprint', printAan);
window.addEventListener('afterprint', printUit);

async function afdrukken(c, ctx, o){
  if(!paneelEl) return;
  printAan();
  printTimer = setTimeout(printUit, 8000);
  try{ window.print(); }catch(e){ CRM.fout('Afdrukken lukte niet', e); }
  printUit();

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
