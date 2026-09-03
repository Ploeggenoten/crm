/* ═══════════════════════════════════════════════════════════════
   MODULE: PERFORMANCE — het cijfermatige overzicht
   Plaatsingen, duurzaamheid, recruiters, trechter, uitval, bron.
   Definities zijn identiek aan het pijplijnbord (CRM.plaatsingenMaand).
   Fee en omzet per klant staan achter CRM.magOpbrengstZien() (het hele
   team); winst, cashflow en gefactureerde omzet achter CRM.canSeeMoney().
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;
const kort   = s => String(s||'').slice(0,10);
const GARANTIE_STD = 3;                     /* maanden, als garantie_mnd leeg is */

/* Datumvelden in de kandidatentabel zijn kale datums (since, geplaatst_op,
   historie.op) — daar mag kort() gewoon de eerste tien tekens pakken. Maar
   crm_leads.binnen_op is een timestamptz in UTC. Daar snijdt kort() de
   UTC-dag af, en dat is 's avonds na 22:00 (zomertijd) de dag ervóór: een
   lead die op 1 juli 00:30 binnenkwam telde dan mee in juni. Een tijdstempel
   gaat daarom eerst door de lokale kalender, precies zoals CRM.todayISO().  */
function dagVan(waarde){
  const s = String(waarde||'').trim();
  if(!s) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0,10)) && s.length <= 10) return s.slice(0,10);
  const d = new Date(s);
  return isNaN(d) ? s.slice(0,10) : d.toLocaleDateString('sv-SE');
}

/* ─── Periode ────────────────────────────────────────────────── */
let periode = 'maand', eigenVan = '', eigenTot = '';
let trOpen = '';                            /* opengeklapte funnelstap (drill-down) */
let recSort   = {k:'plaatsingen', dir:-1};
/* 'omzet' is in de klanttabel de kolom van de gekozen bron: bij het team
   (geen bedragen) staat daar het aantal plaatsingen, dus deze standaard
   klopt in beide gevallen — grootste bovenaan. */
let klantSort = {k:'omzet', dir:-1};

const dag = (j,m,d) => new Date(j,m,d).toLocaleDateString('sv-SE');
function bereik(){
  const nu = new Date(), j = nu.getFullYear(), m = nu.getMonth();
  switch(periode){
    case 'vorige':   return {van:dag(j,m-1,1), tot:dag(j,m,0),    lbl:'vorige maand'};
    case 'kwartaal': {const q=Math.floor(m/3)*3; return {van:dag(j,q,1), tot:dag(j,q+3,0), lbl:'dit kwartaal'};}
    case 'jaar':     return {van:dag(j,0,1),   tot:dag(j,11,31),  lbl:'dit jaar'};
    case 'eigen':    return {van:eigenVan||dag(j,m,1), tot:eigenTot||dag(j,m+1,0), lbl:'gekozen periode'};
    default:         return {van:dag(j,m,1),   tot:dag(j,m+1,0),  lbl:'deze maand'};
  }
}
const inP = (x,p) => { const s = kort(x); return !!s && s>=p.van && s<=p.tot; };
/* Bereik als tekst. CRM.fmtDateShort laat het jaartal weg — prima voor
   "1 jul — 31 jul", maar bij een eigen bereik in een ander jaar stond er
   dan "1 jan — 31 jan" zonder dat je zag wélk jaar. Jaartal erbij zodra
   de periode niet volledig in het huidige jaar valt. */
function bereikLbl(p){
  const nu = CRM.todayISO().slice(0,4);
  const f = (p.van.slice(0,4) === nu && p.tot.slice(0,4) === nu) ? CRM.fmtDateShort : CRM.fmtDate;
  return f(p.van) + ' — ' + f(p.tot);
}

/* ─── Kleine rekenhulpjes ────────────────────────────────────── */
function dagenTussen(a,b){
  const x = new Date(kort(a)), y = new Date(kort(b));
  if(isNaN(x)||isNaN(y)) return null;
  return Math.round((y-x)/86400000);
}
const gem = arr => arr.length ? Math.round(arr.reduce((s,n)=>s+n,0)/arr.length) : null;

/* ═══ SPARKLINE — dun olijflijntje dat richting toont ════════════
   Geen assen, geen raster, geen tooltip: richting, geen grafiek.
   Let op: deze functie staat LETTERLIJK ook in dashboard.js
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

/* Maandsleutels van de laatste n maanden, oud → nieuw (voor sparklines). */
function laatsteMaanden(n=6){
  const nu = new Date(), mks = [];
  for(let i=n-1;i>=0;i--) mks.push(new Date(nu.getFullYear(), nu.getMonth()-i, 1).toLocaleDateString('sv-SE').slice(0,7));
  return mks;
}

/* Percentage met eerlijke n bij kleine aantallen. */
function pctTxt(deel, totaal, grens=10){
  if(!totaal) return '<span class="meta">—</span>';
  const p = Math.round(deel/totaal*100);
  return `<span class="num">${p}%</span>` + (totaal < grens ? ` <span class="meta num">n=${totaal}</span>` : '');
}

/* "92% door" op een trede van 4 kandidaten is geen conversie maar toeval.
   Bij kleine treden staat het aantal er daarom bij, net als bij pctTxt. */
function pctDoor(door, van, grens=10){
  return Math.round(door/van*100) + '% door' + (van < grens ? ` <span class="meta num">(${door}/${van})</span>` : '');
}

/* Laatste beweging in de historie — proxy voor "wanneer viel de kandidaat af". */
function laatsteBeweging(c){
  const hist = c.historie||[];
  if(hist.length){
    const op = hist.map(x=>kort(x.op)).filter(Boolean).sort();
    if(op.length) return op[op.length-1];
  }
  return kort(c.since);
}

/* Duurzaam = niet gestopt, of gestopt ná de garantieperiode. */
function garantieEind(c){
  if(!kort(c.geplaatstOp)) return null;
  const d = new Date(kort(c.geplaatstOp));
  if(isNaN(d)) return null;
  d.setMonth(d.getMonth() + (Number(c.garantieMnd)||GARANTIE_STD));
  return d.toLocaleDateString('sv-SE');
}
function duurzaam(c){
  if(!CRM.faseIs(c.fase, 'Gestopt')) return true;
  const eind = garantieEind(c);
  if(!eind || !kort(c.gestoptOp)) return true;
  return kort(c.gestoptOp) > eind;
}

/* Verste fase die een kandidaat ooit bereikte (0..10, eindfases tellen niet mee).
   Een lege fase (geïmporteerd uit het oude ATS, nooit in de pijplijn geweest)
   levert -1 op: zo'n kandidaat heeft geen trechterpositie en is ook niet
   "verloren" — die is er simpelweg nooit ingegaan. */
const FUNNEL = CRM.PHASES.filter(p => !['Afgevallen','Gestopt'].includes(p.k));
/* Index BINNEN de trechter. Bewust niet CRM.faseIdx(): die telt Afgevallen en
   Gestopt mee, wat alleen goed gaat zolang die twee toevallig achteraan in
   CRM.PHASES staan. Zodra iemand de fases herschikt klopte de trechter niet
   meer — met fIdx is de volgorde van CRM.PHASES niet langer een aanname.
   Vergelijken gaat via CRM.faseIs, dus mét de aliassen uit data.js: in de
   database staat de eerste fase bij een deel van de rijen nog als
   'Voorselectie' en die heet inmiddels 'Intake'. Zonder normalisatie gaf
   fIdx daar −1 op en vielen die kandidaten stilzwijgend uit de trechter,
   alsof ze er nooit in hadden gezeten. */
const fIdx = k => FUNNEL.findIndex(f => CRM.faseIs(f.k, k));
/* EEN HANDTEKENING BESTAAT ALLEEN MET EEN DATUM VAN TEKENEN.
   De historie van een afgevallen kandidaat bevat álle fases waar die ooit
   langs kwam. Wie tot 'Contract getekend' kwam en tóch afhaakte, had daardoor
   verste() = Contract getekend en telde in de trechter als plaatsing. Op de
   demodata gaf dat 33 "geplaatst" in de trechter naast 17 getekend in het
   jaarblok — twee antwoorden op dezelfde vraag, op één scherm. Dezelfde fout
   is op 2 aug 2026 al in conversies() gerepareerd; hier stond hij nog.
   Regel, gelijk aan het bord en Finance: alles vanaf 'Contract getekend'
   telt alleen mee als `geplaatstOp` gevuld is. Zonder die datum wordt de
   kandidaat afgetopt op de laatste fase vóór de handtekening — hij is wel
   zó ver gekomen, maar er is niet getekend.
   De drempels lager in de trechter (Voorgesteld, Eerste gesprek) raakt dit
   niet, dus ratios(), conversies() en de klantcijfers houden hun uitkomst. */
function verste(c){
  const getekendIdx = fIdx('Contract getekend');
  const bewijs  = !!kort(c.geplaatstOp);
  const plafond = bewijs ? FUNNEL.length : getekendIdx - 1;
  const idxs = [];
  const zet = i => { if(i >= 0 && i <= plafond) idxs.push(i); };
  (c.historie||[]).forEach(x => zet(fIdx(x.fase)));
  zet(fIdx(c.fase));
  if(CRM.faseIs(c.fase,'Gestopt')) zet(fIdx('Gestart'));
  if(bewijs) idxs.push(getekendIdx);
  return idxs.length ? Math.max.apply(null, idxs) : -1;
}
/* Staat deze kandidaat nú in de pijplijn? Alleen echte, lopende fases —
   een lege fase telt niet mee, anders zit de hele oude-ATS-import
   ineens in ieders pijplijn. */
const inPijplijn = c => CRM.faseIdx(c.fase) >= 0 && !CRM.faseIn(c.fase, CRM.DONE);

/* ─── Basisverzamelingen voor de gekozen periode ─────────────── */
function cijfers(p){
  const cs = CRM.kandidaten();
  /* DEZELFDE DEFINITIE ALS HET BORD — en dat was hier niet zo.
     Dit scherm zei "Netto volgt exact de definitie van het bord", maar
     rekende anders: het liet een Gestopt-kaart mét plaatsingsdatum weg bij
     'getekend', en trok élke stop af, ook die van een garantievervanger en
     van iemand zonder plaatsingsdatum. Uitkomst voor juli: dit scherm −7,
     het bord −4, Finance −3, "Jouw maand" −5. Vier antwoorden op dezelfde
     vraag, en het scherm beweerde erbij dat ze gelijk waren.

     Twee regels van het bord, nu ook hier (js/data.js):
     1. Tekenen is een gebeurtenis die heeft plaatsgevonden — een latere
        stop maakt dat niet ongedaan, dus een Gestopt-kaart mét
        plaatsingsdatum telt gewoon mee als getekend.
     2. Een gestopte vervanger telt niet nog eens af: zijn voorganger is al
        als stop geteld, anders trek je dezelfde plek twee keer af. */
  const teltAlsStop = CRM.teltAlsStop;   // één definitie, in js/data.js — hier hing een eigen kopie
  const getekend = cs.filter(c => inP(c.geplaatstOp,p) &&
    CRM.teltAlsPlaatsing(c));
  const gestopt  = cs.filter(c => teltAlsStop(c) && inP(c.gestoptOp,p));
  /* Cohort voor duurzaamheid: iedereen die in deze periode getekend heeft,
     inclusief wie later gestopt is. */
  const cohort = cs.filter(c => inP(c.geplaatstOp,p) && (CRM.faseIn(c.fase, CRM.PLACED) || CRM.faseIs(c.fase,'Gestopt')));
  const instroom  = cs.filter(c => inP(c.since,p));
  const afgevallen= cs.filter(c => CRM.faseIs(c.fase,'Afgevallen') && inP(laatsteBeweging(c),p));
  return {cs, getekend, gestopt, cohort, instroom, afgevallen, netto:getekend.length-gestopt.length};
}

/* ═══ 0a. WAAR DEZE CIJFERS OP RUSTEN ════════════════════════════
   Klacht Tjeerd (2 aug 2026): "de performance klopt niet qua cijfers, veel
   staat ook op 0". Dat kwam niet doordat de blokken verkeerd rekenden maar
   doordat ze zwégen: van de 355 kandidaten in productie komen er 236 uit de
   import van het oude ATS, zónder fase, zónder instroomdatum en zónder
   plaatsingsdatum. Elk blok filtert die er — terecht — uit, en het scherm
   toonde vervolgens een handvol cijfers en een rij nullen zonder ooit te
   zeggen dat vier op de vijf kaarten buiten beeld bleven.

   Dit blok zegt het wél, en alleen als er iets te melden valt. Het rekent
   niets uit: het telt lege velden. Zo weet je bij elke nul of het aan het
   werk ligt of aan de gegevens — en dat is een ander gesprek.             */
function blokBasis(){
  const cs = CRM.kandidaten();
  if(!cs.length) return '';

  /* "Geen pijplijnfase" is breder dan "leeg": een waarde die niet in
     CRM.PHASES of CRM.VOOR_BORD staat (oude ATS-statussen) valt er net zo
     hard buiten, en dat is aan het scherm niet te zien. */
  const kentFase = c => !!String(c.fase||'').trim() &&
    CRM.ALLE_FASES.some(f => CRM.faseIs(f.k, c.fase));
  const geenFase   = cs.filter(c => !kentFase(c));
  const geenSince  = cs.filter(c => !kort(c.since));
  const geenBron   = cs.filter(c => !(c.bron||'').trim());
  const plaatsingen= cs.filter(isPlaatsing);
  const zonderLoon = plaatsingen.filter(c => !['Flex','ZZP'].includes(c.type||'W&S') && !c.vervangt && c.maandloon == null);

  const punten = [];
  if(geenFase.length) punten.push([geenFase.length,
    'geen (herkenbare) fase — die tellen niet mee in de conversietrechter, de pijplijnkolom per recruiter en de uitvalredenen']);
  if(geenSince.length) punten.push([geenSince.length,
    'geen instroomdatum — die vallen buiten élk periodefilter op dit scherm, dus ook buiten de trechter en de brontabel']);
  if(geenBron.length) punten.push([geenBron.length,
    'geen bron ingevuld — die staan in geen enkele regel van "Per bron"']);
  if(zonderLoon.length) punten.push([zonderLoon.length,
    'een W&S-plaatsing zonder bruto maandsalaris — daarvan is geen fee te berekenen']);
  /* Sinds de trechter vanaf de campagne meet (3 sep 2026) rusten de cijfers
     ook op de leadtabel — dus dezelfde eerlijkheid voor die twee gaten. */
  const mLeads = (CRM.state.leads||[]).filter(CRM.leadTelbaar);
  const zonderCamp = mLeads.filter(l => !(l.campagne||'').trim()).length;
  const zonderVacK = mLeads.filter(l => !String(l.vacature_id||'').trim()).length;
  if(zonderCamp) punten.push([zonderCamp,
    'Meta-leads zonder campagnenaam — hun kosten zijn aan geen campagne toe te rekenen, dus zij drukken nergens op een €-per-lead']);
  if(zonderVacK) punten.push([zonderVacK,
    'Meta-leads zonder vacature-koppeling — koppel het formulier bij Instellingen · Botformulieren, dan gaan bestaande leads meteen mee']);
  if(!punten.length) return '';

  const pct = Math.round(Math.max(geenFase.length, geenSince.length) / cs.length * 100);
  return `<div class="card pf-basis"><div class="card-h"><div class="h2">Waar deze cijfers op rusten</div>
      <span class="meta num">${cs.length} kandidaten in het systeem</span></div>
    <div class="card-b">
      <ul class="pf-basislijst">${punten.map(([n, tekst]) =>
        `<li><b class="num">${n}</b><span>${h(tekst)}</span></li>`).join('')}</ul>
      <p class="pf-uitleg meta">Dit is geen fout in de berekening maar een gat in de gegevens: een kaart zonder fase
        is nooit de pijplijn in gegaan en een kaart zonder datum valt buiten elke maand. Ze meetellen zou de
        percentages hieronder juist onwaar maken. Zie je een blok op nul staan, kijk dan eerst hier —
        ${pct >= 50 ? `het gaat om ruwweg de helft of meer van je bestand` : `het gaat om een deel van je bestand`},
        en dat is meestal de overzetting uit het oude ATS. Vul je fase, instroomdatum en bron aan, dan vullen de
        blokken zich vanzelf.</p>
    </div></div>`;
}

/* ═══ 0. HET JAAR — het gedeelde doel van het hele team ══════════
   Dit is een aantal mensen, geen bedrag: het staat dus bewust NIET achter
   CRM.canSeeMoney(). Iedereen werkt naar hetzelfde getal toe.

   Gerekend wordt met CRM.plaatsingenJaar() (js/data.js), niet met een
   eigen telling — het dashboard en dit scherm moeten hetzelfde zeggen.
   Die telt GETEKEND, niet netto: iemand die in maart begon en in juni
   stopte, heb je in maart wel degelijk aan het werk geholpen. Netto hoort
   bij de maandcijfers en staat één blok lager.

   "17 van 75" zegt niets zonder de datum erbij — in januari is dat
   uitstekend en in november niet. Daarom staat overal het gelijkmatige
   tempo ernaast: waar je vandaag zou staan als je het jaar netjes
   verdeelde. Dat is de streep in de grafiek en het cijfer voor/achter. */
function blokJaar(){
  const J = CRM.plaatsingenJaar();
  if(!J.doel)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Het jaar</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Geen jaardoel ingesteld',
        'Zet een jaardoel bij Instellingen, dan staat hier hoe het hele team ervoor staat.')}</div></div></section>`;

  const jaar = Number(J.jaar);
  const start = new Date(jaar, 0, 1, 12), eindJaar = new Date(jaar+1, 0, 1, 12);
  const dagenInJaar = Math.round((eindJaar - start) / 86400000);
  /* Het gelijkmatige tempo aan het EIND van maand m, in dagen gerekend —
     dezelfde maatstaf als CRM.plaatsingenJaar().verwacht, zodat de streep
     in de grafiek en het cijfer voor/achter niet uit elkaar kunnen lopen. */
  const tempo = m => Math.round(J.doel * Math.round((new Date(jaar, m+1, 1, 12) - start)/86400000) / dagenInJaar);

  const nuMk = CRM.todayISO().slice(0,7);
  let loop = 0;
  const kols = [];
  for(let m=0;m<12;m++){
    const mk = new Date(jaar, m, 1).toLocaleDateString('sv-SE').slice(0,7);
    const n = J.getekend.filter(c => kort(c.geplaatstOp).slice(0,7) === mk).length;
    const toekomst = mk > nuMk;
    if(!toekomst) loop += n;
    kols.push({mk, n, cum:loop, toekomst, tempo:tempo(m),
      lbl:new Date(jaar, m, 1).toLocaleDateString('nl-NL',{month:'short'}),
      lang:new Date(jaar, m, 1).toLocaleDateString('nl-NL',{month:'long'})});
  }
  const H = 132;
  const max = Math.max(J.doel, J.gedaan, 1);
  const px = n => Math.max(n > 0 ? 2 : 0, Math.round(n/max*H));

  /* perWeekNodig loopt aan het eind van het jaar hard weg (op 31 december
     staat er 406 per week). Dat is rekenkundig juist en als stuurgetal
     waardeloos, dus onder de twee weken tonen we de resterende dagen. */
  const tempoTegel = J.teGaan === 0
    ? CRM.ui.kpi('Tempo', '<span class="chip green">Doel gehaald</span>',
        `<span class="meta num">${J.gedaan} getekend, doel was ${J.doel}</span>`)
    : J.dagenTeGaan >= 14
      ? CRM.ui.kpi('Tempo nodig', `<span class="num">${J.perWeekNodig.toLocaleString('nl-NL')}</span><span class="pf-eh"> per week</span>`,
          `<span class="meta num">${J.teGaan} te gaan in ${J.dagenTeGaan} dagen</span>`)
      : CRM.ui.kpi('Nog te gaan', `<span class="num">${J.teGaan}</span>`,
          `<span class="meta num">in de laatste ${J.dagenTeGaan} ${J.dagenTeGaan===1?'dag':'dagen'} van het jaar</span>`);

  const klantenDitJaar = Array.from(new Set(J.getekend.map(c => (c.klant||'').trim()).filter(Boolean)));
  const grootste = klantenDitJaar
    .map(k => ({k, n:J.getekend.filter(c => (c.klant||'').trim() === k).length}))
    .sort((a,b) => b.n - a.n)[0];

  /* CRM.jaarTarget() valt terug op de standaard van 75 als er geen rij in
     `targets` staat. Zonder dat erbij te zeggen leest 75 als "het doel dat
     Tjeerd heeft ingesteld", terwijl het de noodwaarde van de app is — en
     dan stuurt het halve scherm (bruto nodig, tempo, omzet bij het doel) op
     een getal dat niemand heeft afgesproken. */
  const doelGezet = (CRM.state.targets || []).some(t => String(t.maand) === String(J.jaar) && t.aantal != null);

  return `<section class="pf-sec pf-jaar">
    <div class="pf-kop"><span class="label">Het jaar ${h(J.jaar)}</span>
      <span class="meta">gedeeld doel · t/m 31 december${doelGezet ? ''
        : ` · doel van ${J.doel} is de standaardwaarde, nog niet zelf ingesteld`}</span></div>
    <div class="grid c4">
      ${CRM.ui.kpi('Getekend dit jaar', `<span class="num">${J.gedaan}</span><span class="pf-eh"> van ${J.doel}</span>`,
        `<span class="meta num">${J.pct}% van het jaardoel</span>`, 'accent')}
      ${CRM.ui.kpi('Nog te gaan', `<span class="num">${J.teGaan}</span>`,
        `<span class="meta num">nog ${J.dagenTeGaan} ${J.dagenTeGaan===1?'dag':'dagen'} tot 31 december</span>`)}
      ${CRM.ui.kpi(J.opSchema ? 'Voor op schema' : 'Achter op schema', CRM.plusMin(J.voorOfAchter),
        `<span class="meta num">bij een gelijkmatig tempo zou je vandaag op ${J.verwacht} staan</span>`)}
      ${tempoTegel}
    </div>
    <div class="card"><div class="card-h"><div class="h2">Opgeteld door het jaar heen</div>
      <span class="pf-leg"><i class="get"></i>getekend t/m die maand <i class="tick"></i>gelijkmatig tempo</span></div>
      <div class="card-b">
        <div class="pf-jrkols">
          ${kols.map(k => `<div class="pf-jrkol${k.toekomst?' toek':''}"
              title="${h(k.lang)}: ${k.toekomst ? `bij een gelijkmatig tempo sta je hier op ${k.tempo}`
                : `${k.n} getekend, ${k.cum} in totaal dit jaar (gelijkmatig tempo: ${k.tempo})`}">
            <div class="pf-jrarea" style="height:${H}px">
              <span class="pf-tick" style="bottom:${px(k.tempo)}px"></span>
              ${k.toekomst ? '' : `<i style="height:${px(k.cum)}px"></i>`}
            </div>
            <div class="pf-jrn num${k.toekomst?' toek':''}">${k.toekomst ? k.tempo : k.cum}</div>
            <div class="pf-mnd">${h(k.lbl)}</div>
          </div>`).join('')}
        </div>
        <p class="pf-uitleg meta">Elke staaf is het totaal aantal getekende contracten tot en met die maand, dus hij loopt
          op naar ${J.doel}. Het streepje is waar je zou staan bij een gelijkmatig tempo; de grijze cijfers rechts zijn
          dat tempo voor de maanden die nog moeten komen. Stoppen telt hier niet af — dat staat in de maandcijfers hieronder.</p>
        ${grootste ? `<div class="pf-jrklant">
          <span class="meta">De ${J.gedaan} plaatsingen van dit jaar komen bij
            <b class="num">${klantenDitJaar.length}</b> ${klantenDitJaar.length===1?'klant':'klanten'} vandaan;
            de grootste is ${h(grootste.k)} met <b class="num">${grootste.n}</b>.</span>
          <button class="btn ghost sm" id="pf_jrklant">Verdeling per klant</button>
        </div>` : ''}
      </div></div>
  </section>`;
}

/* ═══ 0b. OP WEG NAAR HET JAARDOEL ═══════════════════════════════
   Vraag van Tjeerd (1 aug 2026): "met ons plaatsingsratio en stoppersratio,
   hoeveel moeten we dan plaatsen voor 75 kandidaten? En met alle omzet tot
   nu toe, wat is dan de omzet van die 75 plaatsingen?"

   Vier onderdelen, in de volgorde waarin je ze nodig hebt:
     1. de twee ratio's die alles aansturen,
     2. wat er tot 31 december nog moet gebeuren — netto én bruto,
     3. wat de trechter daarvoor moet aanleveren,
     4. wat het oplevert.

   HARDE REGEL VOOR DIT BLOK: elk getal komt uit vastgelegde data of het
   staat er niet. Geen brancheaannames, geen "reken maar op 1 op 5". En bij
   minder dan tien waarnemingen staat er expliciet bij dat het te weinig is
   om op te sturen — een ratio uit vier trajecten verschuift met één extra
   plaatsing twintig procentpunten en dat is geen stuurgetal maar ruis.  */

const N_GENOEG = 10;                 /* onder dit aantal: waarschuwen, niet sturen */
const genoegN  = n => n >= N_GENOEG;
const pctW     = r => r == null ? '—' : Math.round(r * 100) + '%';
const een      = n => n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('nl-NL');

/* ─── De twee ratio's ──────────────────────────────────────────────
   PLAATSINGSRATIO — van de kandidaten die ooit bij een klant zijn
   voorgesteld, welk deel eindigde met een getekend contract. Alleen
   AFGERONDE trajecten: iemand die nu op Tweede gesprek staat is nog geen
   mislukking, en meerekenen zou de ratio kunstmatig omlaag drukken.
   "Ooit voorgesteld" leest verste() uit de fase-historie; staat die er niet
   (oudere kaarten), dan telt de huidige fase. Dat is dezelfde meetlat als de
   conversietrechter verderop, dus de twee kunnen niet uit elkaar lopen.
   Voor "geplaatst" gebruiken we bewust NIET de historie maar het veld
   geplaatstOp: er ís een datum van tekenen, en een vastgelegd feit gaat vóór
   een afgeleide uit de fase-historie. Een kaart die via de historie ooit langs
   'Contract getekend' kwam maar geen plaatsingsdatum heeft, is geen plaatsing —
   die telt ook op het bord en in Finance niet mee.

   STOPPERSRATIO — van alle plaatsingen die ooit zijn vastgelegd, welk deel
   staat inmiddels op Gestopt. Bewust over de héle historie en niet over dit
   jaar: iemand die in juni tekende heeft nog nauwelijks de kans gehad om te
   stoppen, dus een venster van een paar maanden meet vooral hoe kort het
   venster is. Hier telt élke stop mee, ook die van een vervanger — de vraag
   is niet wat het target doet, maar hoeveel van de mensen die je plaatste
   uiteindelijk zijn afgehaakt.                                          */
function ratios(){
  const cs = CRM.kandidaten();

  const klaar       = cs.filter(c => CRM.faseIn(c.fase, CRM.DONE) || kort(c.geplaatstOp));
  const voorgesteld = klaar.filter(c => verste(c) >= fIdx('Voorgesteld'));
  const geplaatst   = voorgesteld.filter(c => !!kort(c.geplaatstOp));

  const plaatsingen = cs.filter(isPlaatsing);
  const gestopt     = plaatsingen.filter(c => CRM.faseIs(c.fase, 'Gestopt'));

  return {
    voorgesteld: voorgesteld.length, geplaatst: geplaatst.length,
    plRatio: voorgesteld.length ? geplaatst.length / voorgesteld.length : null,
    plaatsingen: plaatsingen.length, gestopt: gestopt.length,
    stopRatio: plaatsingen.length ? gestopt.length / plaatsingen.length : null
  };
}

/* Intake → voorstel. De intake is de laatste stap vóór het bord, dus dit is
   de enige stap waarmee je van een gesprek naar een voorstel terugrekent.
   Cohort: elke kandidaat met een vastgelegde intake. */
function intakeRatio(){
  const cs  = CRM.kandidaten();
  const met = cs.filter(c => !!c.intake);
  const door= met.filter(c => verste(c) >= fIdx('Voorgesteld'));
  return {n:met.length, door:door.length, ratio: met.length ? door.length / met.length : null};
}

/* Lead → kandidaatkaart. Alleen te meten als de lead bij het doorschieten
   aan een kandidaat is gekoppeld (crm_leads.kandidaat_id). Is dat veld
   nergens gevuld, dan is er geen ratio — dan zeggen we dat, in plaats van
   twee losse tellingen op elkaar te delen die niets met elkaar te maken
   hoeven te hebben. */
function leadRatio(){
  /* Op de core-motor (3 sep 2026): doorgeschoten = kandidaat_id gevuld ÓF de
     kandidaat wijst met lead_id terug. De oude telling keek alleen naar
     kandidaat_id en toonde daardoor onterecht "niet te meten". */
  const leads = (CRM.state.leads || []).filter(CRM.leadTelbaar);
  const door  = leads.filter(CRM.leadDoor);
  return {n:leads.length, door:door.length, ratio: leads.length ? door.length / leads.length : null};
}

/* De fee van dit jaar. Volgorde is hier wezenlijk: eerst de afspraak van de
   klant op de datum van tekenen erbij zoeken, dán rekenen — bereken() zoekt
   die afspraak bewust niet zelf op (zie feeVan). */
function omzetJaar(J){
  if(!CRM.magOpbrengstZien()) return null;
  let som = 0, metFee = 0;
  const zonder = {};
  J.getekend.forEach(c => {
    const f = feeVan(c);
    if(f.bedrag != null){ som += f.bedrag; metFee++; }
    else zonder[f.reden] = (zonder[f.reden] || 0) + 1;
  });
  return {som:Math.round(som), metFee, zonder, geen:J.getekend.length - metFee,
          gem: metFee ? Math.round(som / metFee) : null};
}

const ncijfer = (label, waarde, sub = '', kl = '') => `<div class="pf-nc ${kl}">
  <span class="label">${h(label)}</span><b class="num">${waarde}</b>
  ${sub ? `<span class="meta">${sub}</span>` : ''}</div>`;

function blokNaar(){
  const J = CRM.plaatsingenJaar();
  if(!J.doel) return '';                 /* blokJaar legt de lege staat al uit */

  const R  = ratios();
  const IR = intakeRatio();
  const LR = leadRatio();

  const weken   = J.dagenTeGaan / 7;
  const maanden = J.dagenTeGaan / 30.44;
  const perWeek  = J.teGaan / weken;
  const perMaand = J.teGaan / maanden;

  /* Bruto: wat je moet tekenen om er netto ${doel} aan het werk over te
     houden. Netto ÷ behoudspercentage = bruto — met 20% stoppers heb je
     voor 75 aan het werk dus 94 handtekeningen nodig. */
  const behoud      = R.stopRatio == null ? null : 1 - R.stopRatio;
  const brutoDoel   = (behoud != null && behoud > 0) ? Math.ceil(J.doel / behoud) : null;
  const brutoExtra  = brutoDoel != null ? brutoDoel - J.doel : null;
  const brutoTeGaan = brutoDoel != null ? Math.max(0, brutoDoel - J.gedaan) : null;
  const brutoPerWeek= brutoTeGaan != null ? brutoTeGaan / weken : null;

  /* Terugrekenen door de trechter, vanaf het tempo dat je écht moet halen. */
  const basisPW      = brutoPerWeek != null ? brutoPerWeek : perWeek;
  const voorPerPl    = (R.plRatio && R.plRatio > 0) ? 1 / R.plRatio : null;
  const voorstellenPW= voorPerPl != null ? basisPW * voorPerPl : null;
  const intakesPW    = (voorstellenPW != null && IR.ratio) ? voorstellenPW / IR.ratio : null;
  const leadsPW      = (intakesPW != null && LR.ratio) ? intakesPW / LR.ratio : null;

  const O = omzetJaar(J);

  /* ── 1. Ratio's ───────────────────────────────────────────────── */
  const zwakPl   = !genoegN(R.voorgesteld);
  const zwakStop = !genoegN(R.plaatsingen);
  const zwakke = [
    zwakPl   ? `de plaatsingsratio rust op <span class="num">${R.voorgesteld}</span> afgeronde voorstellen` : '',
    zwakStop ? `de stoppersratio rust op <span class="num">${R.plaatsingen}</span> plaatsingen` : ''
  ].filter(Boolean);

  const kaartRatios = `<div class="card"><div class="card-h"><div class="h2">1 · De twee ratio's</div>
      <span class="meta">alles wat je hebt vastgelegd</span></div>
    <div class="card-b">
      <div class="pf-ncs">
        ${ncijfer('Plaatsingsratio', pctW(R.plRatio),
          R.voorgesteld ? `${R.geplaatst} van de ${R.voorgesteld} voorgestelde kandidaten tekende`
                        : 'nog geen afgerond traject met een voorstel', zwakPl ? 'zwak' : '')}
        ${ncijfer('Stoppersratio', pctW(R.stopRatio),
          R.plaatsingen ? `${R.gestopt} van de ${R.plaatsingen} plaatsingen ${R.gestopt === 1 ? 'staat' : 'staan'} op Gestopt`
                        : 'nog geen plaatsing vastgelegd', zwakStop ? 'zwak' : '')}
        ${ncijfer('Blijft aan het werk', pctW(behoud),
          behoud != null ? 'het spiegelbeeld van de stoppersratio — hiermee reken je bruto terug' : '',
          zwakStop ? 'zwak' : '')}
      </div>
      ${zwakke.length ? `<div class="note warn" style="margin-top:18px">Te weinig om op te sturen:
        ${zwakke.join(' en ')}. Bij zulke aantallen verschuift één extra plaatsing of één extra stop het
        percentage met tientallen procenten. Lees het als richting, niet als getal — en gebruik het niet
        om een tempo op af te rekenen.</div>` : ''}
      <p class="pf-uitleg meta">De plaatsingsratio telt alleen <b>afgeronde</b> trajecten: iemand die nu op
        Tweede gesprek staat is nog geen gemiste kans. "Ooit voorgesteld" komt uit de fase-historie van de
        kaart; staat die er niet, dan telt de fase waar de kaart nu op staat. De stoppersratio kijkt naar
        álle plaatsingen die ooit zijn vastgelegd — over een venster van een paar maanden meet je vooral
        dat het venster kort is, want wie net getekend heeft kan nog niet gestopt zijn.</p>
    </div></div>`;

  /* ── 2. Wat er nog moet ───────────────────────────────────────── */
  const gehaald = J.teGaan === 0;
  const kaartMoet = `<div class="card"><div class="card-h"><div class="h2">2 · Wat er nog moet</div>
      <span class="meta">t/m 31 december</span></div>
    <div class="card-b">
      <div class="pf-ncs">
        ${ncijfer('Nog te tekenen', gehaald ? '<span class="chip green">Doel gehaald</span>' : J.teGaan,
          `${J.gedaan} van ${J.doel} staat · nog ${een(weken)} ${weken < 2 ? 'week' : 'weken'}`)}
        ${/* In de laatste twee weken van het jaar loopt "per week" hard weg —
              op 31 december staat er 406 per week. Rekenkundig juist en als
              stuurgetal waardeloos, dus dan de resterende dagen, net als de
              tempotegel in het jaarblok hierboven. */''}
        ${J.dagenTeGaan < 14 && !gehaald
          ? ncijfer('Nog te gaan', J.teGaan,
              `in de laatste ${J.dagenTeGaan} ${J.dagenTeGaan===1?'dag':'dagen'} — een weektempo zegt hier niets meer`)
          : ncijfer('Per week', gehaald ? '0' : een(perWeek), 'om netto op ' + J.doel + ' uit te komen')}
        ${J.dagenTeGaan < 14 && !gehaald
          ? ncijfer('Per dag', een(J.teGaan / J.dagenTeGaan), 'over de resterende dagen van het jaar')
          : ncijfer('Per maand', gehaald ? '0' : een(perMaand), `over de resterende ${een(maanden)} maanden`)}
      </div>
      <div class="pf-nbruto">
        <span class="label">En als ${pctW(R.stopRatio)} stopt</span>
        ${brutoDoel != null ? `<div class="pf-ncs">
          ${ncijfer('Bruto nodig', brutoDoel,
            `om er netto ${J.doel} aan het werk over te houden — ${brutoExtra
              ? `${brutoExtra} meer dan het doel zelf`
              : 'er is nog niemand gestopt, dus gelijk aan het doel zelf'}`,
            zwakStop ? 'zwak' : '')}
          ${ncijfer('Daarvan nog te gaan', brutoTeGaan, `${J.gedaan} getekend, ${brutoTeGaan} te tekenen`,
            zwakStop ? 'zwak' : '')}
          ${ncijfer('Bruto per week', een(brutoPerWeek), 'dit is het tempo waar de trechter op moet staan',
            zwakStop ? 'zwak' : '')}
        </div>` : `<p class="meta">Er is nog geen enkele plaatsing vastgelegd, dus er valt geen
          stoppersratio te meten en dus ook geen bruto-aantal te berekenen.</p>`}
      </div>
      <p class="pf-uitleg meta">Het jaardoel van ${J.doel} telt getekende contracten, niet netto — precies
        zoals het blok hierboven en het pijplijnbord. Wil je er aan het einde van het jaar ook echt ${J.doel}
        áán het werk hebben, dan moet je de stoppers erbij optellen.${brutoDoel != null
          ? ` Van de ${R.plaatsingen} plaatsingen die er tot nu toe zijn ${R.plaatsingen - R.gestopt === 1
              ? 'zit er nog 1' : `zitten er nog ${R.plaatsingen - R.gestopt}`}; in diezelfde verhouding
             kom je uit op ${brutoDoel} handtekeningen voor ${J.doel} mensen aan het werk. Het scherm rekent
             met de hele verhouding, niet met de afgeronde ${pctW(behoud)} hierboven — reken je het met de
             hand na, gebruik dan ${J.doel} × ${R.plaatsingen} ÷ ${R.plaatsingen - R.gestopt}.` : ''} Weken en dagen
        lopen tot en met 31 december; er ${J.dagenTeGaan === 1 ? 'is nog 1 dag' : `zijn nog ${J.dagenTeGaan} dagen`}
        te gaan.</p>
    </div></div>`;

  /* ── 3. De trechter ───────────────────────────────────────────── */
  const ketenRij = (lbl, waarde, sub, kl = '') => `<div class="pf-kr ${kl}">
    <span class="pf-kl">${h(lbl)}</span><b class="num">${waarde}</b>
    <span class="meta">${sub}</span></div>`;

  const kaartTrechter = `<div class="card"><div class="card-h"><div class="h2">3 · Wat de trechter moet aanleveren</div>
      <span class="meta">per week</span></div>
    <div class="card-b">
      <div class="pf-keten">
        ${ketenRij('Leads', leadsPW != null ? een(leadsPW) : '—',
          LR.ratio != null
            ? `${pctW(LR.ratio)} van de leads wordt een kandidaatkaart (${LR.door} van ${LR.n})`
            : 'geen lead is aan een kandidaat gekoppeld, dus deze stap is niet te meten',
          LR.ratio != null && !genoegN(LR.n) ? 'zwak' : '')}
        ${ketenRij('Intakes', intakesPW != null ? een(intakesPW) : '—',
          IR.ratio != null
            ? `${pctW(IR.ratio)} van de intakes wordt voorgesteld (${IR.door} van ${IR.n})`
            : 'nog geen intake vastgelegd, dus deze stap is niet te meten',
          IR.ratio != null && !genoegN(IR.n) ? 'zwak' : '')}
        ${ketenRij('Voorstellen', voorstellenPW != null ? een(voorstellenPW) : '—',
          voorPerPl != null
            ? `${een(voorPerPl)} ${Math.round(voorPerPl*10) === 10 ? 'voorstel' : 'voorstellen'} per plaatsing (plaatsingsratio ${pctW(R.plRatio)})`
            : 'zonder plaatsingsratio is dit niet terug te rekenen',
          zwakPl ? 'zwak' : '')}
        ${ketenRij('Plaatsingen', een(basisPW),
          brutoPerWeek != null ? 'het bruto tempo uit onderdeel 2' : 'het netto tempo uit onderdeel 2', 'doel')}
      </div>
      <p class="pf-uitleg meta">Van onder naar boven teruggerekend: het weektempo uit onderdeel 2 maal het
        aantal voorstellen dat één plaatsing kost, en dat weer gedeeld door het deel van de intakes dat
        voorgesteld wordt. Elke stap gebruikt de verhouding uit je eigen kaarten; is een stap nergens
        vastgelegd, dan staat er een streepje in plaats van een schatting. De leadstap kan alleen gemeten
        worden als een lead bij het doorschieten aan een kandidaat gekoppeld wordt
        (${LR.door} van de ${LR.n} leads).</p>
    </div></div>`;

  /* ── 4. Omzet ─────────────────────────────────────────────────── */
  const kaartOmzet = (() => {
    if(!O)
      return `<div class="card"><div class="card-h"><div class="h2">4 · Wat dat oplevert</div></div>
        <div class="card-b">${CRM.ui.leeg('Fee niet zichtbaar',
          'Log in om de opbrengst per plaatsing te zien. Het aantal plaatsingen hierboven klopt sowieso.')}</div></div>`;

    const bijDoel = O.gem != null ? O.gem * J.doel : null;
    const verschil= bijDoel != null ? bijDoel - O.som : null;
    const redenen = Object.entries(O.zonder).map(([k,n]) => `${n}× ${FEE_KORT[k] || k}`).join(', ');

    return `<div class="card"><div class="card-h"><div class="h2">4 · Wat dat oplevert</div>
        <span class="meta">berekende fee · ${h(J.jaar)}</span></div>
      <div class="card-b">
        <div class="pf-ncs">
          ${/* € 0 is hier bijna nooit waar: het betekent meestal dat er geen
                commerciële afspraak is vastgelegd, niet dat er niets verdiend is.
                Het scherm zei letterlijk "€ 0 over 0 van de 17 plaatsingen"
                terwijl de regel eronder uitlegde dat die 17 nergens als € 0
                meetellen. Zonder één berekende fee dus een streepje. */''}
          ${ncijfer('Omzet tot nu toe', O.metFee ? h(CRM.euro(O.som)) : '—',
            O.metFee ? `over ${O.metFee} van de ${J.getekend.length} plaatsingen van dit jaar`
              : J.getekend.length
                ? `van geen van de ${J.getekend.length} plaatsingen van dit jaar is een fee te berekenen — dat is niet hetzelfde als € 0`
                : 'nog geen plaatsing dit jaar', O.metFee ? '' : 'zwak')}
          ${ncijfer('Gemiddelde fee', O.gem != null ? h(CRM.euro(O.gem)) : '—',
            O.metFee ? `per plaatsing met een berekende fee (n=${O.metFee})` : 'nog geen plaatsing met fee',
            genoegN(O.metFee) ? '' : 'zwak')}
          ${ncijfer(`Bij ${J.doel} plaatsingen`, bijDoel != null ? h(CRM.euro(bijDoel)) : '—',
            O.gem != null ? `${J.doel} × de gemiddelde fee` : '', genoegN(O.metFee) ? '' : 'zwak')}
          ${ncijfer('Verschil', verschil != null ? h(CRM.euro(verschil)) : '—',
            verschil != null ? 'nog te verdienen tot 31 december' : '', genoegN(O.metFee) ? '' : 'zwak')}
        </div>
        ${!genoegN(O.metFee) && O.metFee ? `<div class="note warn" style="margin-top:18px">Het gemiddelde
          rust op <span class="num">${O.metFee}</span> ${O.metFee === 1 ? 'plaatsing' : 'plaatsingen'} met een
          berekende fee — te weinig om op te sturen. Eén grote of kleine plaatsing trekt het gemiddelde
          scheef, en dat werkt in het bedrag bij ${J.doel} plaatsingen ${J.doel}× door.</div>` : ''}
        <p class="pf-uitleg meta">De fee is per plaatsing berekend uit de commerciële afspraak van die klant
          op de datum van tekenen, maal het bruto jaarsalaris van de kandidaat (dezelfde rekenregel als de
          kandidaatkaart en het financebord). Dit is dus getekende, niet gefactureerde omzet.
          ${O.geen ? `Van ${O.geen} van de ${J.getekend.length} plaatsingen is geen fee te berekenen${
            redenen ? ` (${h(redenen)})` : ''}; die tellen nergens als € 0 mee.` : ''}
          Het bedrag bij ${J.doel} plaatsingen rekent alsof elk van die ${J.doel} een W&amp;S-plaatsing met
          fee is${O.geen ? ' — dit jaar was dat niet zo, dus lees het als bovengrens' : ''}.</p>
      </div></div>`;
  })();

  /* Ingeklapt tot één kernrij (Performance-conceptplan, 3 sep 2026): vier
     kaarten rekenwerk zijn naslagwerk, geen dagelijkse kost. De kernrij zegt
     wat je moet weten; wie het rekenpad wil zien klapt open. */
  return `<section class="pf-sec pf-naar"><details class="pf-inklap">
    <summary><div class="pf-kop"><span class="label">Op weg naar ${J.doel}</span>
      <span class="meta">${gehaald ? 'doel gehaald'
        : `${J.teGaan} te gaan in ${een(weken)} ${weken < 2 ? 'week' : 'weken'}${
          perWeek != null && !gehaald ? ` · ${een(perWeek)} per week nodig` : ''}`}
        · klik voor het rekenpad</span></div></summary>
    <div class="pf-naargrid">
      ${kaartRatios}
      ${kaartMoet}
      ${kaartTrechter}
      ${kaartOmzet}
    </div>
  </details></section>`;
}

/* ═══ 1. PLAATSINGEN ═════════════════════════════════════════════ */
function blokPlaatsingen(p, D){
  const ws   = D.getekend.filter(c => !['Flex','ZZP'].includes(c.type||'W&S')).length;
  const flex = D.getekend.filter(c => c.type==='Flex').length;
  const zzp  = D.getekend.filter(c => c.type==='ZZP').length;
  const duur = D.cohort.filter(duurzaam);
  const gestoptCohort = D.cohort.filter(c => CRM.faseIs(c.fase,'Gestopt'));
  const tijdTotStop = gestoptCohort.map(c => dagenTussen(c.geplaatstOp, c.gestoptOp)).filter(n => n!=null && n>=0);
  const gemStop = gem(tijdTotStop);

  /* Sparklines: getekend en netto per maand (laatste 6) — richting naast
     het periodecijfer. Eén lijntje per tegel, altijd olijf (één accent);
     de plus/min-kleur zit al in het cijfer zelf. */
  const perGet = [], perNet = [];
  laatsteMaanden(6).forEach(mk => {
    const m = CRM.plaatsingenMaand(mk);
    perGet.push(m.getekend.length); perNet.push(m.netto);
  });
  const sGet = sparkline(perGet), sNet = sparkline(perNet);

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Plaatsingen</span>
      <span class="meta">${h(p.lbl)} · ${h(bereikLbl(p))}</span></div>
    <div class="grid c4">
      ${CRM.ui.kpi('Getekend', `<span class="num">${D.getekend.length}</span>`,
        `<span class="meta num">${ws} W&amp;S · ${flex} Flex${zzp?` · ${zzp} ZZP`:''}</span>${sGet?`<div class="pf-spark">${sGet}</div>`:''}`, 'accent')}
      ${CRM.ui.kpi('Netto', CRM.plusMin(D.netto),
        `<span class="meta num">${D.getekend.length} getekend − ${D.gestopt.length} gestopt</span>${sNet?`<div class="pf-spark">${sNet}</div>`:''}`)}
      ${CRM.ui.kpi('Duurzaam', D.cohort.length ? pctTxt(duur.length, D.cohort.length) : '<span class="meta">—</span>',
        `<span class="meta num">${duur.length} van ${D.cohort.length} nog aan het werk of voorbij de garantie</span>`)}
      ${CRM.ui.kpi('Tijd tot stop', gemStop!=null ? `<span class="num">${gemStop}</span><span class="pf-eh"> dagen</span>` : '<span class="meta">—</span>',
        gemStop!=null ? `<span class="meta num">gemiddeld, over ${tijdTotStop.length} gestopte plaatsingen</span>`
          : D.cohort.length ? '<span class="meta">niemand uit deze lichting is gestopt</span>'
                            : '<span class="meta">geen plaatsingen in deze periode</span>')}
    </div>
    <p class="pf-uitleg meta">Netto volgt exact de definitie van het bord: getekend in de periode min gestopt in de periode.
      Duurzaamheid kijkt naar de lichting die in deze periode tekende — met een garantie van ${GARANTIE_STD} maanden als er niets is ingevuld.
      ${D.cohort.length !== D.getekend.length ? `Die lichting telt <span class="num">${D.cohort.length}</span> mensen en niet
        ${D.getekend.length}: een gestopte garantievervanger tekende wél, maar telt bewust niet mee in het targetcijfer —
        anders zou dezelfde plek twee keer worden afgetrokken.` : ''}
      Alleen kandidaten mét een datum van tekenen tellen hier mee; een kaart zonder die datum is geen plaatsing.</p>
    ${namenEnNazorg(D)}
  </section>`;
}

/* Naamlijsten getekend/gestopt + het nazorg-belritme. Verhuisd uit de
   Recruitment-signaalstrook (wens Tjeerd: dat was daar te chaotisch);
   de dagelijkse nazorg-acties staan óók in Mijn dag op het dashboard. */
function namenEnNazorg(D){
  /* Id via data-attribuut, niet via een inline onclick met een JS-string:
     een &#39; in het attribuut wordt door de browser eerst tot ' gedecodeerd
     en breekt dán uit de string — h() beschermt daar níét tegen. */
  const rij = (c, extra, klasse='') =>
    `<button class="pf-naam ${klasse}" data-pfkand="${h(String(c.id))}">${h(c.naam)}<em class="num">${h(extra)}</em></button>`;
  const get = D.getekend.slice().sort((a,b)=>(b.geplaatstOp||'').localeCompare(a.geplaatstOp||''));
  const stp = D.gestopt.slice().sort((a,b)=>(b.gestoptOp||'').localeCompare(a.gestoptOp||''));
  /* Het nazorgritme werd hier — net als op het bord, de kaart en het
     dashboard — opnieuw uitgerekend, en die vier gaven niet hetzelfde
     antwoord. Eén bron nu: js/opvolging.js. Die kolom toont daarom ook het
     warm houden vóór de start, want dat is dezelfde belofte. */
  const nz = CRM.opvolging ? CRM.opvolging.lopend(null).slice(0, 12) : [];

  const kol = (titel, inhoud, leeg) => `<div class="pf-namenkol">
    <div class="label">${h(titel)}</div>${inhoud || `<div class="meta">${h(leeg)}</div>`}</div>`;
  return `<div class="pf-namen">
    ${kol('Getekend', get.map(c=>rij(c, `${c.type||'W&S'} · ${CRM.fmtDateShort(c.geplaatstOp)||'—'}`,'pos')).join(''), 'Nog niemand in deze periode')}
    ${kol('Gestopt', stp.map(c=>rij(c, CRM.fmtDateShort(c.gestoptOp)||'—','neg')).join(''), 'Niemand — zo houden')}
    ${kol('Opvolging', nz.map(x => rij(x.c,
        x.nu ? `${x.moment.kort} — vandaag` : `${x.moment.kort} · ${CRM.fmtDateShort(x.moment.datum)}`,
        x.nu ? 'nu' : '')).join(''), 'Geen lopende opvolging')}
  </div>`;
}

/* ═══ 2. TREND — 12 maanden ══════════════════════════════════════ */
function blokTrend(){
  const nu = new Date();
  const rijen = [];
  for(let i=11;i>=0;i--){
    const d = new Date(nu.getFullYear(), nu.getMonth()-i, 1);
    const mk = d.toLocaleDateString('sv-SE').slice(0,7);
    const m = CRM.plaatsingenMaand(mk);
    rijen.push({mk, lbl:d.toLocaleDateString('nl-NL',{month:'short'}), lang:d.toLocaleDateString('nl-NL',{month:'long',year:'numeric'}),
                get:m.getekend.length, stop:m.gestopt.length, netto:m.netto, target:CRM.maandTarget(mk)});
  }
  const max = Math.max(1, ...rijen.map(r => Math.max(r.get, r.stop, r.target)));
  const H = 150;
  const px = n => Math.max(n>0?3:0, Math.round(n/max*H));

  if(!rijen.some(r => r.get || r.stop))
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Trend per maand</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Nog geen historie','Zodra er plaatsingen zijn vastgelegd verschijnt hier de trend van de laatste twaalf maanden.')}</div></div></section>`;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Trend per maand</span>
      <span class="pf-leg"><i class="get"></i>getekend <i class="stop"></i>gestopt <i class="tick"></i>target</span></div>
    <div class="card"><div class="card-b">
      <div class="pf-kols">
        ${rijen.map(r => `<div class="pf-kol" title="${h(r.lang)}: ${r.get} getekend, ${r.stop} gestopt, netto ${r.netto}, target ${r.target}">
          <div class="pf-area" style="height:${H}px">
            <span class="pf-tick" style="bottom:${px(r.target)}px"></span>
            <i class="get" style="height:${px(r.get)}px"></i>
            <i class="stop" style="height:${px(r.stop)}px"></i>
          </div>
          <div class="pf-net num ${r.netto>0?'pos':(r.netto<0?'neg':'')}">${r.netto>0?'+':''}${r.netto}</div>
          <div class="pf-mnd">${h(r.lbl)}</div>
        </div>`).join('')}
      </div>
      <p class="pf-uitleg meta">De onderste regel is netto (getekend − gestopt). Het streepje in elke kolom is het maandtarget.</p>
    </div></div>
  </section>`;
}

/* ═══ 3. PER RECRUITER ═══════════════════════════════════════════ */
function recruiterRijen(p, D){
  /* Groeperen op de genormaliseerde naam (CRM.naamNorm): "bryan", "Bryan" en
     "tjeerd@ploeggenoten.nl" gaven anders elk een eigen regel met overal
     nullen. En alleen wie plaatst hoort in dit overzicht — een marketeer
     levert een rij op die per definitie leeg is. */
  const nn = c => CRM.naamNorm(c.rec);
  const namen = Array.from(new Set(D.cs.map(nn).filter(Boolean)))
    .filter(n => !CRM.isPlaatser || CRM.isPlaatser(n))
    .sort((a,b) => a.localeCompare(b,'nl'));
  return namen.map(naam => {
    const mijn      = D.cs.filter(c => nn(c)===naam);
    const getekend  = D.getekend.filter(c => nn(c)===naam);
    const gestopt   = D.gestopt.filter(c => nn(c)===naam);
    const cohort    = D.cohort.filter(c => nn(c)===naam);
    const duur      = cohort.filter(duurzaam);
    const looptijden= getekend.map(c => dagenTussen(c.since, c.geplaatstOp)).filter(n => n!=null && n>=0);
    return {
      naam,
      plaatsingen: getekend.length,
      netto: getekend.length - gestopt.length,
      duurN: duur.length, duurT: cohort.length,
      pijplijn: mijn.filter(inPijplijn).length,
      looptijd: gem(looptijden),
      /* `datum` is het veld "afspraak" op de kaart: ÉÉN datum, die bij elke
         volgende afspraak wordt overschreven. Dit is dus geen telling van
         gevoerde gesprekken (dat suggereerde de kolomkop "Gesprekken" wel)
         maar het aantal kandidaten met een afspraakdatum in deze periode.
         Zolang dat veld het enige is wat we hebben, noemen we het ook zo. */
      afspraken: mijn.filter(c => inP(c.datum, p)).length,
      metDatum: mijn.filter(c => !!kort(c.datum)).length
    };
  });
}

function blokRecruiters(p, D){
  const rijen = recruiterRijen(p, D);
  if(!rijen.length)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Per recruiter</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Geen recruiter vastgelegd','Vul het veld recruiter bij kandidaten in om prestaties per persoon te kunnen volgen.')}</div></div></section>`;

  const waarde = (r,k) => k==='naam' ? r.naam
    : k==='duur' ? (r.duurT ? r.duurN/r.duurT : -1)
    : k==='looptijd' ? (r.looptijd==null ? 9999 : r.looptijd)
    : r[k];
  rijen.sort((a,b)=>{
    const x = waarde(a,recSort.k), y = waarde(b,recSort.k);
    if(typeof x === 'string') return recSort.dir * x.localeCompare(y);
    return recSort.dir * (x - y);
  });
  const maxP = Math.max(1, ...rijen.map(r=>r.plaatsingen));

  const kop = (k,lbl,cls='') => `<th class="sortable ${cls}" data-rs="${k}">${h(lbl)}${recSort.k===k?(recSort.dir<0?' ↓':' ↑'):''}</th>`;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Per recruiter</span><span class="meta">${h(p.lbl)}</span></div>
    <div class="tblwrap"><table class="tbl pf-tbl">
      <thead><tr>
        ${kop('naam','Recruiter')}
        ${kop('plaatsingen','Plaatsingen','n')}
        <th></th>
        ${kop('netto','Netto','n')}
        ${kop('duur','Duurzaam','n')}
        ${kop('pijplijn','In klanttraject','n')}
        ${kop('looptijd','Doorlooptijd','n')}
        ${kop('afspraken','Afspraken','n')}
      </tr></thead>
      <tbody>${rijen.map(r=>`<tr>
        <td><b>${h(r.naam)}</b></td>
        <td class="n num">${r.plaatsingen}</td>
        <td class="pf-balk">${CRM.ui.bar(Math.round(r.plaatsingen/maxP*100))}</td>
        <td class="n">${CRM.plusMin(r.netto)}</td>
        <td class="n">${r.duurT ? pctTxt(r.duurN, r.duurT) : '<span class="meta">—</span>'}</td>
        <td class="n num">${r.pijplijn}</td>
        <td class="n num">${r.looptijd!=null ? r.looptijd+' dgn' : '<span class="meta">—</span>'}</td>
        <td class="n num">${r.metDatum ? r.afspraken : '<span class="meta">—</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="pf-uitleg meta">Plaatsingen en netto volgen de definitie van het bord. <b>In klanttraject</b> telt alleen
      kandidaten die nú op een echte pijplijnfase staan; kaarten zonder fase (de import uit het oude ATS) horen daar
      niet bij. <b>Afspraken</b> is het aantal kandidaten van deze recruiter met een afspraakdatum in de periode —
      op de kaart staat één afspraakveld dat bij elke nieuwe afspraak wordt overschreven, dus dit is geen telling
      van gevoerde gesprekken. Staat er een streepje, dan heeft deze recruiter bij geen enkele kandidaat een
      afspraakdatum staan; dat is iets anders dan nul afspraken.</p>
  </section>`;
}

/* De losse fase-conversietrechter is op 3 sep 2026 opgegaan in het
   hoofdstuk Trechter (vanaf de campagne): twee trechters naast elkaar
   vertelden hetzelfde verhaal met verschillende startpunten. De
   voorstellen/offers-per-plaatsing-ratio's leven daar door. */

/* ═══ 5. UITVAL ══════════════════════════════════════════════════ */
function topReden(lijst, veld){
  const t = {};
  lijst.forEach(c => { const r = (c[veld]||'').trim() || 'Niet ingevuld'; t[r] = (t[r]||0)+1; });
  return Object.entries(t).sort((a,b)=>b[1]-a[1]);
}

function blokUitval(p, D){
  const af = D.afgevallen, st = D.gestopt;
  if(!af.length && !st.length)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Uitval</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Geen uitval in deze periode','Niemand viel af en niemand stopte. Kies een langere periode voor meer context.')}</div></div></section>`;

  const afTop = topReden(af,'afvalCat'), stTop = topReden(st,'stopCat');
  const bakken = [{lbl:'≤ 30 dagen', n:0},{lbl:'31 – 90 dagen', n:0},{lbl:'> 90 dagen', n:0},{lbl:'Onbekend', n:0}];
  st.forEach(c => {
    const d = dagenTussen(c.geplaatstOp, c.gestoptOp);
    if(d==null || d<0) bakken[3].n++;
    else if(d<=30) bakken[0].n++;
    else if(d<=90) bakken[1].n++;
    else bakken[2].n++;
  });

  const lijst = (titel, rijen, totaal) => `<div class="card"><div class="card-h"><div class="h2">${h(titel)}</div>
      <span class="chip">${totaal}</span></div>
    <div class="card-b">${rijen.length ? `<div class="pf-redenen">${rijen.slice(0,6).map(([r,n])=>`
      <div class="pf-reden"><span class="pf-rl">${h(r)}</span>
        <span class="pf-rb">${CRM.ui.bar(Math.round(n/totaal*100))}</span>
        <span class="pf-rn num">${n}</span></div>`).join('')}</div>`
      : CRM.ui.leeg('Nog geen reden vastgelegd','Vul bij het afvallen of stoppen van een kandidaat de reden in — dan zie je hier waar het structureel misgaat.')}
    </div></div>`;

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Uitval</span><span class="meta">${h(p.lbl)}</span></div>
    <div class="grid c3">
      ${lijst('Redenen afvallen', afTop, af.length)}
      ${lijst('Redenen stoppen', stTop, st.length)}
      <div class="card"><div class="card-h"><div class="h2">Hoe lang bleven ze</div><span class="chip">${st.length}</span></div>
        <div class="card-b">${st.length ? `<div class="pf-redenen">${bakken.filter(b=>b.n).map(b=>`
          <div class="pf-reden"><span class="pf-rl">${h(b.lbl)}</span>
            <span class="pf-rb">${CRM.ui.bar(Math.round(b.n/st.length*100))}</span>
            <span class="pf-rn num">${b.n}</span></div>`).join('')}</div>`
          : CRM.ui.leeg('Niemand gestopt','')}
        </div></div>
    </div>
  </section>`;
}

/* ═══ 6. PER KLANT — waar de omzet en de plaatsingen vandaan komen ═
   De vraag van Tjeerd: wie zijn de topklanten, wie draagt weinig bij,
   en hoeveel plaatsingen staan er per klant.

   WELKE BRON VOOR OMZET — hier zit de valkuil, dus expliciet:
   er zijn er twee en ze betekenen niet hetzelfde.
     1. De berekende fee (js/fee.js): per getekende plaatsing de
        commerciële afspraak van de klant maal het bruto jaarsalaris van
        de kandidaat. Dekt élke plaatsing die in het CRM staat en is er
        dus altijd — ook in demo.
     2. De gefactureerde termijnen uit het financebord (fin_*): geld dat
        écht de deur uit is. Maar dat is alleen voor Tjeerd leesbaar,
        wordt in demo niet geladen, en bevat alleen plaatsingen die
        daadwerkelijk in het financebord zijn ingevoerd.
   Standaard staat dit blok op (1), omdat dat compleet is. Welke bron je
   ziet staat er in tekst bij, en zodra (2) beschikbaar is staat het
   verschil tussen de twee in dezelfde regel — anders ontdek je pas
   maanden later dat er getekend maar niet gefactureerd is.

   Een klant zonder afspraak heeft geen berekende fee. Die telt hier
   NIET als nul mee: dan zou een goede klant er slecht uitzien. Zulke
   klanten staan apart onder de rangschikking, met hun aantallen.  */

let klantVenster = '12m';        /* '12m' | 'jaar' | 'alles' */
let klantBron    = 'fee';        /* 'fee' | 'fin' | 'aantal' */
let klantAlles   = false;        /* rangschikking: top 10 of iedereen */
const KLANT_TOP  = 10;

const KLANT_VENSTERS = [['12m','Laatste 12 maanden'],['jaar','Dit jaar'],['alles','Alles']];

function plusDagen(iso, n){
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
}

/* Het venster van dit blok staat LOS van de periodekiezer bovenaan.
   "Wie zijn mijn topklanten" is geen vraag over deze maand — met de
   standaardperiode (deze maand) zou de rangschikking meestal leeg zijn.
   Elk venster heeft een even lang vorig venster ernaast; dat is wat de
   kolom Ontwikkeling vergelijkt. Bij 'alles' is er geen vorige periode
   om mee te vergelijken en dat zeggen we dan ook. */
function klantVensterInfo(){
  const vandaag = CRM.todayISO();
  if(klantVenster === 'jaar'){
    const j = Number(vandaag.slice(0,4));
    return {van:j+'-01-01', tot:vandaag, lbl:'1 januari t/m vandaag',
            vVan:(j-1)+'-01-01', vTot:verschuifMaanden(vandaag,-12),
            vLbl:'dezelfde periode vorig jaar'};
  }
  if(klantVenster === 'alles')
    return {van:'', tot:vandaag, lbl:'alle plaatsingen t/m vandaag', vVan:'', vTot:'', vLbl:''};
  const grens = verschuifMaanden(vandaag, -12);
  return {van:plusDagen(grens,1), tot:vandaag, lbl:'laatste twaalf maanden',
          vVan:plusDagen(verschuifMaanden(vandaag,-24),1), vTot:grens,
          vLbl:'de twaalf maanden daarvóór'};
}
const inVenster = (waarde, van, tot) => {
  const s = kort(waarde);
  return !!s && (!van || s >= van) && (!tot || s <= tot);
};

/* crm_afspraken staat in CRM.state zodra de klantenmodule is geopend.
   Kom je rechtstreeks op Performance binnen, dan is die lijst leeg en
   zou élke fee "onbekend" heten terwijl de afspraken gewoon bestaan.
   Daarom hier ook één keer ophalen — alleen lezen. Sinds 31 jul 2026 mag
   het hele team de fee zien (besluit Tjeerd), dus de tabel is team-leesbaar;
   winst en cashflow zitten in fin_* en blijven wél afgeschermd. */
let _afsprBezig = false;
function zorgAfspraken(klaar){
  if(!CRM.magOpbrengstZien()) return;
  if(!Array.isArray(CRM.state.afspraken)) CRM.state.afspraken = [];
  if(CRM.demo || _afsprBezig || CRM.state.afspraken.length) return;
  _afsprBezig = true;
  try{
    CRM.sb.from('crm_afspraken').select('*').then(r => {
      if(r.error || !r.data || !r.data.length) return;
      CRM.state.afspraken = r.data;
      if(klaar) klaar();
    });
  }catch(e){ /* geen verbinding: fees blijven onbekend, dat is zichtbaar */ }
}

/* Een plaatsing: er is getekend én de kaart staat op geplaatst of is
   later gestopt. Exact de definitie van het bord (CRM.plaatsingenMaand) —
   inclusief de ZZP-uitzondering: een korte klus telt niet mee, zie
   CRM.zzpTeltAlsPlaatsing (data.js). */
const isPlaatsing = c => !!kort(c.geplaatstOp) &&
  (CRM.faseIn(c.fase, CRM.PLACED) || CRM.faseIs(c.fase,'Gestopt')) &&
  (c.type !== 'ZZP' || CRM.zzpTeltAlsPlaatsing(c));

/* Waaróm een plaatsing geen fee heeft. Vier van de vijf redenen zijn geen
   fout maar een feit: flex verdient per uur, een vervanger onder garantie
   is kosteloos. Die apart benoemen scheelt een zoektocht naar een gat dat
   er niet is. */
const FEE_REDEN = {
  flex:         'Flex-plaatsing — de opbrengst loopt via gewerkte uren, niet via een W&S-fee',
  zzp:          'ZZP — de opbrengst loopt via de klus-marge, niet via een W&S-fee',
  vervanging:   'Kosteloze vervanging onder de garantie — levert geen nieuwe fee op',
  geenafspraak: 'Geen commerciële afspraak vastgelegd bij deze klant',
  geenloon:     'Bruto maandsalaris ontbreekt bij de kandidaat',
  geenpct:      'De afspraak noemt geen percentage voor deze functie',
  onwaarschijnlijk: 'De berekende fee is onwaarschijnlijk hoog (boven €50.000) — controleer het bruto maandloon op de kandidaatkaart; daar staat vermoedelijk een jaarsalaris of een tikfout'
};
const FEE_KORT = {flex:'flex', zzp:'zzp', vervanging:'vervanging', geenafspraak:'geen afspraak',
                  geenloon:'geen maandloon', geenpct:'geen percentage', onwaarschijnlijk:'fee onwaarschijnlijk — check maandloon'};

/* De fee van één plaatsing, of de reden dat die er niet is.
   bereken() zoekt de afspraak bewust niet zelf op — die halen we er eerst
   bij, op de datum van tekenen, zodat een oude plaatsing met de toen
   geldende afspraak rekent en niet met de afspraak van vandaag. */
function feeVan(c){
  if(!CRM.magOpbrengstZien() || !CRM.fee) return {bedrag:null, reden:'geenafspraak'};
  if((c.type||'W&S') === 'Flex')      return {bedrag:null, reden:'flex'};
  if((c.type||'') === 'ZZP')          return {bedrag:null, reden:'zzp'};
  if(c.vervangt)                      return {bedrag:null, reden:'vervanging'};
  const a = CRM.fee.voorKlant(c.klant, c.geplaatstOp);
  if(!a)                              return {bedrag:null, reden:'geenafspraak'};
  const r = CRM.fee.bereken(c, a);
  if(r.fee == null)
    return {bedrag:null, reden: (r.grondslag && !r.grondslag.compleet) ? 'geenloon' : 'geenpct'};
  /* Vangnet tegen datavervuiling: één kandidaat met een jaarsalaris in
     het maandloonveld gaf een "fee" van €1,8 miljoen die élk cijfer op
     dit scherm sloopte — 99% klantconcentratie, gemiddelde fee €610k,
     projectie €45 mln (Carwash Easy and Go, 21 aug 2026). Zo'n bedrag
     is in deze markt geen fee maar een tikfout: hij telt nergens meer
     mee en krijgt een eigen, zichtbare reden zodat je het maandloon
     op de kaart herstelt in plaats van gekke totalen te lezen. */
  if(r.fee > FEE_MAX) return {bedrag:null, reden:'onwaarschijnlijk'};
  return {bedrag:r.fee, reden:''};
}
/* Ruim boven de hoogste echte fee (~€17k) maar ver onder elke tikfout. */
const FEE_MAX = 50000;

/* Wanneer is deze kandidaat bij de klant voorgesteld? Dat staat NIET als
   veld in de database; we lezen de eerste historieregel van de fase
   Voorgesteld. Ontbreekt die, dan nemen we de instroomdatum — dat is een
   aanname en die telt het scherm hieronder ook zichtbaar mee. */
function voorgesteldOp(c){
  const op = (c.historie||[]).filter(x => CRM.faseIs(x.fase,'Voorgesteld'))
    .map(x => kort(x.op)).filter(Boolean).sort();
  return {datum: op[0] || kort(c.since), afgeleid: !op.length};
}

/* Gefactureerd per klantnaam uit het financebord. Termijnen dragen zelf
   geen klantnaam; die hangt aan de plaatsing waar de termijn bij hoort. */
function finSom(fin, van, tot){
  const perKlant = {};
  let zonderKlant = 0;
  if(!fin || !fin.ok) return {perKlant, zonderKlant};
  const klantVan = {};
  (fin.placements||[]).forEach(pl => { klantVan[String(pl.id)] = String(pl.klant||'').trim(); });
  (fin.termijnen||[]).forEach(t => {
    if(!['gefactureerd','betaald'].includes(t.status)) return;
    if(!inVenster(t.factuurdatum || t.geplande_datum, van, tot)) return;
    const bedrag = Number(t.bedrag_excl)||0;
    const k = klantVan[String(t.placement_id)] || '';
    if(!k) zonderKlant += bedrag; else perKlant[k] = (perKlant[k]||0) + bedrag;
  });
  return {perKlant, zonderKlant};
}

/* ─── Alle cijfers per klant, in één keer ─────────────────────────── */
function klantCijfers(V, fin){
  const cs = CRM.kandidaten();
  const nu = finSom(fin, V.van, V.tot);
  const vorig = V.vVan ? finSom(fin, V.vVan, V.vTot) : {perKlant:{}, zonderKlant:0};
  const gebruikt = new Set();
  let afgeleideVoorstellen = 0;

  const namen = Array.from(new Set(cs.map(c => (c.klant||'').trim()).filter(Boolean)));
  const rijen = namen.map(naam => {
    const mijn   = cs.filter(c => (c.klant||'').trim() === naam);
    const alle   = mijn.filter(isPlaatsing);
    const inWin  = alle.filter(c => inVenster(c.geplaatstOp, V.van, V.tot));
    const inVorig= V.vVan ? alle.filter(c => inVenster(c.geplaatstOp, V.vVan, V.vTot)) : [];

    let som = 0, metFee = 0;
    const zonder = {};
    inWin.forEach(c => {
      const f = feeVan(c);
      if(f.bedrag != null){ som += f.bedrag; metFee++; }
      else zonder[f.reden] = (zonder[f.reden]||0) + 1;
    });
    let somV = 0, metFeeV = 0;
    inVorig.forEach(c => { const f = feeVan(c); if(f.bedrag != null){ somV += f.bedrag; metFeeV++; } });

    /* Geen plaatsingen = echt nul, niet onbekend. Wél plaatsingen maar
       geen enkele met fee = onbekend, en dus geen nul in de grafiek.
       Bij het venster "Alles" is er geen vorige periode: dan is de vorige
       waarde niet nul maar onbekend, anders leest elke klant als
       "gegroeid van € 0" terwijl er niets te vergelijken valt. */
    const omzet  = !inWin.length   ? 0 : (metFee  ? Math.round(som)  : null);
    const omzetV = !V.vVan ? null : (!inVorig.length ? 0 : (metFeeV ? Math.round(somV) : null));

    const finSleutels  = Object.keys(nu.perKlant).filter(k => CRM.zelfdeKlant(k, naam));
    finSleutels.forEach(k => gebruikt.add(k));
    const finNu = finSleutels.length ? Math.round(finSleutels.reduce((s,k)=>s+nu.perKlant[k],0)) : null;
    const finVorigSleutels = Object.keys(vorig.perKlant).filter(k => CRM.zelfdeKlant(k, naam));
    const finVorig = finVorigSleutels.length ? Math.round(finVorigSleutels.reduce((s,k)=>s+vorig.perKlant[k],0)) : null;

    const voorg = mijn.filter(c => {
      if(verste(c) < fIdx('Voorgesteld')) return false;
      const v = voorgesteldOp(c);
      if(!inVenster(v.datum, V.van, V.tot)) return false;
      if(v.afgeleid) afgeleideVoorstellen++;
      return true;
    });
    const klantWees = voorg.filter(c => CRM.faseIs(c.fase,'Afgevallen')
      && /klant wees af|meeloopdag niet goed/i.test(c.afvalCat||'')).length;
    const looptijden = inWin.map(c => dagenTussen(c.since, c.geplaatstOp)).filter(n => n!=null && n>=0 && n<400);

    return {
      naam,
      plaats: inWin.length, plaatsV: V.vVan ? inVorig.length : null,
      actief: mijn.filter(c => CRM.faseIn(c.fase, CRM.PLACED)).length,
      omzet, omzetV, metFee, zonder, geenFee: inWin.length - metFee,
      finOmzet: finNu, finOmzetV: finVorig,
      voorg: voorg.length, klantWees,
      duurN: inWin.filter(duurzaam).length, duurT: inWin.length,
      looptijd: gem(looptijden)
    };
  }).filter(r => r.plaats || r.voorg || r.actief || r.finOmzet);

  const restFin = Object.keys(nu.perKlant).filter(k => !gebruikt.has(k))
    .reduce((s,k)=>s+nu.perKlant[k], 0) + nu.zonderKlant;

  return {rijen, restFin:Math.round(restFin), afgeleideVoorstellen};
}

/* ─── Presentatiehulpjes ──────────────────────────────────────────── */
const klantGeld = () => klantBron !== 'aantal';
const klantWaarde  = r => klantBron === 'aantal' ? r.plaats : klantBron === 'fin' ? r.finOmzet : r.omzet;
const klantVorige  = r => klantBron === 'aantal' ? r.plaatsV : klantBron === 'fin' ? r.finOmzetV : r.omzetV;
const klantFmt     = v => v == null ? '—' : (klantGeld() ? CRM.euro(v) : v.toLocaleString('nl-NL'));
const klantEenheid = () => klantGeld() ? 'de omzet' : 'de plaatsingen';

function deltaTxt(d, geldModus){
  if(d == null) return '<span class="meta">—</span>';
  if(!d) return '<span class="num">0</span>';
  const tekst = geldModus ? CRM.euro(Math.abs(d)) : Math.abs(d).toLocaleString('nl-NL');
  return `<span class="num ${d>0?'pos':'neg'}">${d>0?'+':'−'}${h(tekst)}</span>`;
}

/* De bronregel. Dit is het belangrijkste zinnetje van het blok: "omzet"
   die eigenlijk "berekende fee van getekende plaatsingen" is, is iets
   anders dan gefactureerde omzet. */
function klantBronNote(V, C, fin){
  if(!CRM.magOpbrengstZien())
    return `<div class="note info pf-bron"><b>Aantallen, geen bedragen.</b>
      Fee en omzet zijn afgeschermd; je ziet hier hoeveel plaatsingen er per klant staan
      en hoe die zich ontwikkelen. Dat is dezelfde rangschikking, alleen zonder euro's.</div>`;

  const finBeschikbaar = !!(fin && fin.ok);
  const berekend = C.rijen.reduce((s,r)=>s+(r.omzet||0), 0);
  const gefactureerd = C.rijen.reduce((s,r)=>s+(r.finOmzet||0), 0) + Math.max(0, C.restFin);
  const zonderFee = C.rijen.reduce((s,r)=>s+r.geenFee, 0);

  const vergelijk = finBeschikbaar
    ? ` Over dezelfde periode staat er in het financebord <b class="num">${h(CRM.euro(gefactureerd))}</b>
        aan gefactureerde en betaalde termijnen; berekend komt op <b class="num">${h(CRM.euro(berekend))}</b>.
        Loopt dat uiteen, dan is er getekend zonder dat het gefactureerd is (of andersom).`
    : CRM.demo
      ? ` Het financebord (fin_*) wordt in demo bewust niet geladen, dus vergelijken met wat er écht
          gefactureerd is kan hier niet.`
      : ` Er is geen gefactureerde omzet uit het financebord om naast te leggen.`;

  const bron = klantBron === 'fin'
    ? `<b>Omzet = gefactureerd.</b> De termijnen uit het financebord met status gefactureerd of betaald,
       geteld op factuurdatum. Dit is geld dat de deur uit is — niet wat er getekend is.`
    : klantBron === 'aantal'
      ? `<b>Aantal plaatsingen.</b> Een plaatsing telt op de datum waarop het contract getekend is.`
      : `<b>Omzet = berekende fee, niet gefactureerde omzet.</b> Per getekende plaatsing de W&amp;S-fee uit
         de commerciële afspraak van de klant maal het bruto jaarsalaris van de kandidaat
         (dezelfde rekenregel als de kandidaatkaart en het financebord, js/fee.js).`;

  return `<div class="note info pf-bron">${bron}${klantBron === 'aantal' ? '' : vergelijk}
    ${zonderFee && klantBron === 'fee' ? `<br>Van <span class="num">${zonderFee}</span>
      ${zonderFee===1?'plaatsing':'plaatsingen'} in deze periode is de fee niet te berekenen.
      Die tellen nergens als € 0 mee; ze staan onder de rangschikking met de reden erbij.` : ''}</div>`;
}

/* ─── Rangschikking: staafdiagram voor de vraag "wie is groot" ────── */
function klantRangschikking(C){
  const met  = C.rijen.filter(r => klantWaarde(r) != null && klantWaarde(r) > 0)
    .sort((a,b) => klantWaarde(b) - klantWaarde(a));
  const nul  = C.rijen.filter(r => klantWaarde(r) === 0 && (r.plaats || r.voorg));
  const onbekend = C.rijen.filter(r => klantWaarde(r) == null && r.plaats);
  const totaal = met.reduce((s,r)=>s+klantWaarde(r), 0);

  const toon = klantAlles ? met : met.slice(0, KLANT_TOP);
  const max  = met.length ? (klantWaarde(met[0]) || 1) : 1;

  const rij = (r, i) => {
    const w = klantWaarde(r);
    const aandeel = totaal ? Math.round(w/totaal*100) : 0;
    const breed = Math.max(1, Math.round(w/max*100));
    /* Het gemiddelde deelt door de plaatsingen die een fee hébben, niet door
       alle plaatsingen — anders drukt een flexplaatsing het gemiddelde omlaag
       terwijl die nooit een W&S-fee had kunnen opleveren. Bij een verschil
       staat er daarom bij over hoeveel plaatsingen het gaat.
       Alleen bij de berekende fee: de facturen van deze periode horen niet
       per se bij de plaatsingen van deze periode, dus bij de gefactureerde
       omzet zou "per plaatsing" twee verschillende dingen delen. */
    const gem = (klantBron === 'fee' && r.metFee) ? Math.round(w / r.metFee) : null;
    /* In de plaatsingen-stand ís de waarde al het aantal plaatsingen; die
       er nog eens onder herhalen zegt niets. Dan liever wat er nú staat. */
    const sub = (klantGeld() ? [
      `${aandeel}% van ${klantEenheid()}`,
      `${r.plaats} ${r.plaats===1?'plaatsing':'plaatsingen'}`,
      gem == null ? ''
        : r.geenFee ? `gemiddeld ${CRM.euro(gem)} over de ${r.metFee} met fee`
                    : `gemiddeld ${CRM.euro(gem)} per plaatsing`
    ] : [
      `${aandeel}% van ${klantEenheid()}`,
      `${r.actief} nu aan het werk`,
      r.voorg ? `${r.voorg} voorgesteld` : ''
    ]).filter(Boolean).join(' · ');
    return `<button class="pf-rr" data-klant="${h(r.naam)}"
        title="${h(r.naam)}: ${h(klantFmt(w))}, ${aandeel}% van ${h(klantEenheid())}">
      <span class="pf-rnr num">${i+1}</span>
      <span class="pf-rnaam">${h(r.naam)}</span>
      <span class="pf-rbar"><i style="width:${breed}%"></i></span>
      <span class="pf-rw num">${h(klantFmt(w))}</span>
      <span class="pf-rsub meta">${h(sub)}${r.geenFee && klantBron==='fee'
        ? ` · <span class="pf-let">${r.geenFee} zonder fee</span>` : ''}</span>
    </button>`;
  };

  const meer = met.length > KLANT_TOP
    ? `<button class="btn ghost sm pf-meer" id="pf_klmeer">${klantAlles
        ? `Alleen de top ${KLANT_TOP} tonen`
        : `Alle ${met.length} klanten tonen`}</button>` : '';

  /* Klanten zonder berekenbare fee: zichtbaar, met reden, maar buiten de
     optelling. Ze als € 0 in de rangschikking zetten zou een goede klant
     onderaan de lijst parkeren. */
  /* Deze lijst kan lang worden: zijn er nergens afspraken vastgelegd, dan
     staat élke klant erin. Dat is geen leesbare lijst meer maar een muur,
     dus de grootste acht plus één regel die de rest samenvat. */
  const ONB_TOP = 8;
  const onbGesorteerd = onbekend.slice().sort((a,b)=>b.plaats-a.plaats);
  const onbRest = onbGesorteerd.slice(ONB_TOP);
  const onbRestPl = onbRest.reduce((s,r)=>s+r.plaats,0);
  const onbTxt = onbekend.length ? `<div class="pf-onbekend">
      <div class="label">Wel plaatsingen, geen berekende ${klantGeld()?'omzet':'waarde'}</div>
      ${onbGesorteerd.slice(0, ONB_TOP).map(r => {
        const redenen = Object.entries(r.zonder).map(([k,n]) => `${n}× ${FEE_KORT[k]||k}`).join(', ');
        return `<button class="pf-onb" data-klant="${h(r.naam)}">
          <span>${h(r.naam)}</span>
          <em class="num">${r.plaats} ${r.plaats===1?'plaatsing':'plaatsingen'}${redenen?` · ${h(redenen)}`:''}</em>
        </button>`;
      }).join('')}
      ${onbRest.length ? `<p class="meta">En <span class="num">${onbRest.length}</span> andere klanten met samen
        <span class="num">${onbRestPl}</span> ${onbRestPl===1?'plaatsing':'plaatsingen'}; die staan in de tabel hieronder.</p>` : ''}
      <p class="meta">${h(Object.keys(FEE_REDEN).filter(k => onbekend.some(r => r.zonder[k]))
        .map(k => FEE_REDEN[k]).join('. ') || 'Reden onbekend.')}</p>
    </div>` : '';

  const nulTxt = nul.length ? `<p class="meta pf-nul"><span class="num">${nul.length}</span>
    ${nul.length===1?'klant heeft':'klanten hebben'} in deze periode geen enkele plaatsing —
    ${nul.length===1?'die staat':'die staan'} wel in de tabel hieronder.</p>` : '';

  /* Valt er niets te rangschikken, dan is de lege staat niet het hele
     verhaal: als élke klant een plaatsing zonder berekenbare fee heeft, is
     dat juist wat je wilt zien staan. De lijst met redenen blijft dus. */
  const lijst = met.length
    ? `<div class="pf-rang">${toon.map(rij).join('')}</div>${meer}`
    : CRM.ui.leeg('Niets te rangschikken in deze periode',
        klantGeld() ? 'Er is in deze periode geen omzet aan een klant toe te rekenen. Kies een langer venster of leg de commerciële afspraken vast.'
                    : 'Er zijn in deze periode geen plaatsingen. Kies een langer venster.');

  return `${lijst}${nulTxt}${onbTxt}`;
}

/* ─── Concentratie: hoeveel hangt er aan één klant ────────────────── */
function klantConcentratie(C){
  const met = C.rijen.filter(r => klantWaarde(r) != null && klantWaarde(r) > 0)
    .sort((a,b) => klantWaarde(b) - klantWaarde(a));
  const totaal = met.reduce((s,r)=>s+klantWaarde(r), 0);
  if(met.length < 2 || !totaal)
    return `<div class="card"><div class="card-h"><div class="h2">Concentratie</div></div>
      <div class="card-b">${CRM.ui.leeg('Te weinig klanten om spreiding te meten',
        'Zodra er in deze periode bij minstens twee klanten iets te tellen valt, staat hier hoe scheef het verdeeld is.')}</div></div>`;

  const som = (van, tot) => met.slice(van, tot).reduce((s,r)=>s+klantWaarde(r), 0);
  /* "Klant 4 t/m 4" leest als een fout; bij één klant in de groep gewoon
     het rangnummer. */
  const reeks = (van, tot) => van + 1 >= tot ? 'Klant ' + tot : `Klant ${van+1} t/m ${tot}`;
  const n2 = Math.max(0, Math.min(3, met.length) - 1);
  const n3 = Math.max(0, Math.min(10, met.length) - 3);
  const groepen = [
    {k:'s1', lbl:'Grootste klant — ' + met[0].naam,      v:som(0,1),  n:1},
    {k:'s2', lbl:reeks(1, Math.min(3, met.length)),      v:som(1,3),  n:n2},
    {k:'s3', lbl:reeks(3, Math.min(10, met.length)),     v:som(3,10), n:n3},
    {k:'s4', lbl:'De overige klanten',                   v:som(10),   n:Math.max(0, met.length-10)}
  ].filter(g => g.n > 0 && g.v > 0);

  const p = v => totaal ? Math.round(v/totaal*100) : 0;
  const top1 = p(som(0,1)), top3 = p(som(0,3));
  /* Concentratie is een risico dat nergens anders in de app zichtbaar is:
     zolang het goed gaat merk je er niets van, en als de klant wegvalt is
     het te laat om er iets aan te doen. Vandaar een waarschuwing bij de
     grenzen waarop je nog iets kúnt doen; anders gewoon de twee getallen. */
  const risico = top1 >= 30
    ? `<div class="note warn pf-risico">Bijna een derde van ${h(klantEenheid())} komt bij één klant vandaan
        (${h(met[0].naam)}, ${top1}%). Valt die klant weg, dan valt dat deel in één keer weg —
        dit is het moment om de tweede en derde klant te laten groeien.</div>`
    : top3 >= 65
      ? `<div class="note warn pf-risico">De top drie is samen goed voor ${top3}% van ${h(klantEenheid())}.
          Dat is een smalle basis; één opzegging is meteen voelbaar.</div>`
      : `<p class="pf-uitleg meta">De grootste klant is goed voor ${top1}% van ${h(klantEenheid())},
          de top drie samen voor ${top3}%. Dat is redelijk gespreid.</p>`;

  return `<div class="card"><div class="card-h"><div class="h2">Concentratie</div>
      <span class="meta">${met.length} ${met.length===1?'klant':'klanten'}</span></div>
    <div class="card-b">
      <div class="pf-concbar">${groepen.map(g =>
        `<i class="${g.k}" style="width:${p(g.v)}%" title="${h(g.lbl)}: ${h(klantFmt(g.v))} (${p(g.v)}%)"></i>`).join('')}</div>
      <ul class="pf-conclegend">${groepen.map(g => `<li><i class="${g.k}"></i>
        <span>${h(g.lbl)}</span><b class="num">${p(g.v)}%</b>
        <em class="meta num">${h(klantFmt(g.v))}</em></li>`).join('')}</ul>
      ${risico}
    </div></div>`;
}

/* ─── Ontwikkeling: wie groeit, wie loopt terug ───────────────────── */
function klantOntwikkeling(V, C){
  if(!V.vVan)
    return `<div class="card"><div class="card-h"><div class="h2">Groei en terugloop</div></div>
      <div class="card-b">${CRM.ui.leeg('Geen vergelijking bij "Alles"',
        'Kies "Laatste 12 maanden" of "Dit jaar" — dan zet dit blok elke klant naast dezelfde periode ervoor.')}</div></div>`;

  const lijst = C.rijen.map(r => {
    const nu = klantWaarde(r), vo = klantVorige(r);
    if(nu == null || vo == null || (!nu && !vo)) return null;
    return {naam:r.naam, nu, vo, d:nu-vo};
  }).filter(Boolean).sort((a,b) => Math.abs(b.d) - Math.abs(a.d));

  const groei = lijst.filter(x => x.d > 0).slice(0,5);
  const terug = lijst.filter(x => x.d < 0).slice(0,5);

  const kol = (titel, rijen, leeg) => `<div class="pf-ontwkol">
    <div class="label">${h(titel)}</div>
    ${rijen.length ? rijen.map(x => `<button class="pf-ontw" data-klant="${h(x.naam)}">
        <span>${h(x.naam)}</span>
        <em class="num">${h(klantFmt(x.vo))} → ${h(klantFmt(x.nu))}</em>
        ${deltaTxt(x.d, klantGeld())}
      </button>`).join('') : `<div class="meta">${h(leeg)}</div>`}
  </div>`;

  return `<div class="card"><div class="card-h"><div class="h2">Groei en terugloop</div>
      <span class="meta">t.o.v. ${h(V.vLbl)}</span></div>
    <div class="card-b"><div class="pf-ontw2">
      ${kol('Groeit', groei, 'Geen enkele klant leverde meer dan de vorige periode')}
      ${kol('Loopt terug', terug, 'Geen enkele klant leverde minder dan de vorige periode')}
    </div>
    <p class="pf-uitleg meta">Alleen klanten die in beide periodes te vergelijken zijn.
      Staat een klant er niet bij, dan is de ${h(klantGeld()?'omzet':'telling')} in één van de twee periodes onbekend.</p>
    </div></div>`;
}

/* ─── De tabel: de details achter de rangschikking ────────────────── */
function klantTabel(V, C){
  const geld = CRM.magOpbrengstZien();
  /* Bij "Alles" is er geen vorige periode. Een kolom vol streepjes is dan
     geen informatie maar ruis, dus die laten we in dat geval weg. */
  const vergelijk = !!V.vVan;
  /* Zie de toelichting bij de rangschikking: een gemiddelde per plaatsing
     hoort alleen bij de berekende fee. En in de plaatsingen-stand zou de
     omzetkolom letterlijk de kolom Plaatsingen herhalen, met "Omzet" erboven —
     dan liever geen kolom. */
  const omzetKolom = geld && klantBron !== 'aantal';
  const gemKolom = klantBron === 'fee';
  /* Sorteersleutel 'omzet' betekent "de kolom van de gekozen bron". Staat die
     kolom er niet, dan is dat dezelfde ordening als op plaatsingen; het pijltje
     hoort dan wel bij de kolom die je écht ziet. */
  const sortK = (!omzetKolom && klantSort.k === 'omzet') ? 'plaats' : klantSort.k;
  const rijen = C.rijen.slice();

  const waarde = (r,k) => k==='naam' ? r.naam
    : k==='omzet'   ? (klantWaarde(r) == null ? -1 : klantWaarde(r))
    : k==='gem'     ? (r.metFee ? (r.omzet||0)/r.metFee : -1)
    : k==='delta'   ? ((klantWaarde(r)==null||klantVorige(r)==null) ? -1e9 : klantWaarde(r)-klantVorige(r))
    : k==='aanname' ? (r.voorg ? r.plaats/r.voorg : -1)
    : k==='duur'    ? (r.duurT ? r.duurN/r.duurT : -1)
    : k==='looptijd'? (r.looptijd == null ? 9999 : r.looptijd)
    : r[k];
  rijen.sort((a,b) => {
    const x = waarde(a, sortK), y = waarde(b, sortK);
    if(typeof x === 'string') return klantSort.dir * x.localeCompare(y);
    return klantSort.dir * (x - y);
  });

  const kop = (k,lbl,cls='') => `<th class="sortable ${cls}" data-ks="${k}">${h(lbl)}${
    sortK===k ? (klantSort.dir<0?' ↓':' ↑') : ''}</th>`;

  const tot = {
    plaats: rijen.reduce((s,r)=>s+r.plaats,0),
    voorg:  rijen.reduce((s,r)=>s+r.voorg,0),
    actief: rijen.reduce((s,r)=>s+r.actief,0),
    omzet:  rijen.reduce((s,r)=>s+(klantWaarde(r)||0),0)
  };
  /* Staat er in de hele kolom geen enkele waarde, dan is de optelling
     daarvan niet nul maar onbekend — anders leest de totaalregel als een
     feit terwijl elke cel erboven "onbekend" zegt. */
  const totBekend = rijen.some(r => klantWaarde(r) != null);

  return `<div class="tblwrap"><table class="tbl pf-tbl">
    <thead><tr>
      ${kop('naam','Klant')}
      ${kop('voorg','Voorgesteld','n')}
      ${kop('plaats','Plaatsingen','n')}
      ${kop('actief','Actief nu','n')}
      ${omzetKolom ? kop('omzet', klantBron==='fin' ? 'Gefactureerd' : 'Omzet (fee)','n') : ''}
      ${gemKolom ? kop('gem','Gem. per plaatsing','n') : ''}
      ${vergelijk ? kop('delta','Ontwikkeling','n') : ''}
      ${kop('aanname','Aanname','n')}
      ${kop('duur','Duurzaam','n')}
      ${kop('looptijd','Doorlooptijd','n')}
      <th>Let op</th>
    </tr></thead>
    <tbody>${rijen.map(r => {
      const w = klantWaarde(r), vo = klantVorige(r);
      const gemPl = (r.metFee && r.omzet != null) ? Math.round(r.omzet/r.metFee) : null;
      const afwijzend = r.voorg >= 5 && r.plaats/r.voorg < 0.2;
      const vaakWeg   = r.voorg >= 4 && r.klantWees/r.voorg >= 0.4;
      const chips = [
        vaakWeg   ? '<span class="chip amber">wijst vaak af</span>' : '',
        !vaakWeg && afwijzend ? '<span class="chip">veel voorstellen, weinig plaatsingen</span>' : '',
        (geld && klantBron==='fee' && r.plaats && r.zonder.geenafspraak) ? '<span class="chip">geen afspraak</span>' : ''
      ].filter(Boolean).join(' ');
      return `<tr class="clickable" data-klant="${h(r.naam)}">
        <td><b>${h(r.naam)}</b></td>
        <td class="n num">${r.voorg}</td>
        <td class="n num">${r.plaats}</td>
        <td class="n num">${r.actief}</td>
        ${omzetKolom ? `<td class="n num">${w == null ? '<span class="meta">onbekend</span>' : h(klantFmt(w))}${
          r.geenFee && klantBron==='fee' && w != null
            ? `<div class="rowsub">${r.geenFee} van ${r.plaats} zonder fee</div>` : ''}</td>` : ''}
        ${gemKolom ? `<td class="n num">${gemPl != null ? h(CRM.euro(gemPl)) : '<span class="meta">—</span>'}</td>` : ''}
        ${vergelijk ? `<td class="n">${(w == null || vo == null)
          ? '<span class="meta">—</span>' : deltaTxt(w-vo, klantGeld())}</td>` : ''}
        <td class="n">${r.voorg ? pctTxt(r.plaats, r.voorg) : '<span class="meta">—</span>'}</td>
        <td class="n">${r.duurT ? pctTxt(r.duurN, r.duurT) : '<span class="meta">—</span>'}</td>
        <td class="n num">${r.looptijd != null ? r.looptijd + ' dgn' : '<span class="meta">—</span>'}</td>
        <td>${chips}</td>
      </tr>`;
    }).join('')}
    <tr class="pf-tot"><td><b>Alle ${rijen.length} klanten</b></td>
      <td class="n num">${tot.voorg}</td>
      <td class="n num">${tot.plaats}</td>
      <td class="n num">${tot.actief}</td>
      ${omzetKolom ? `<td class="n num">${totBekend ? h(klantFmt(tot.omzet)) : '<span class="meta">onbekend</span>'}</td>` : ''}${gemKolom ? '<td></td>' : ''}
      <td colspan="${(vergelijk?1:0)+4}"></td></tr>
    </tbody>
  </table></div>`;
}

function blokKlanten(fin){
  const V = klantVensterInfo();
  if(!CRM.magOpbrengstZien()) klantBron = 'aantal';
  else if(klantBron === 'fin' && !(fin && fin.ok)) klantBron = 'fee';
  const C = klantCijfers(V, fin);

  const kiezer = `<div class="seg pf-kseg">${KLANT_VENSTERS.map(([k,l]) =>
    `<button data-kv="${k}" class="${klantVenster===k?'on':''}">${h(l)}</button>`).join('')}</div>`;

  if(!C.rijen.length)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Per klant</span>${kiezer}</div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Nog geen klantcijfers',
        'Zodra er kandidaten bij klanten in traject zijn geweest of geplaatst zijn, staat hier per klant wat dat oplevert.')}</div></div></section>`;

  const bronnen = [['fee','Omzet (berekend)'], ...(fin && fin.ok ? [['fin','Omzet (gefactureerd)']] : []), ['aantal','Plaatsingen']];
  const bronSeg = CRM.magOpbrengstZien()
    ? `<div class="seg">${bronnen.map(([k,l]) =>
        `<button data-kb="${k}" class="${klantBron===k?'on':''}">${h(l)}</button>`).join('')}</div>` : '';

  const metPlaatsing = C.rijen.filter(r => r.plaats).length;
  const totPlaats = C.rijen.reduce((s,r)=>s+r.plaats, 0);
  const met = C.rijen.filter(r => klantWaarde(r) != null && klantWaarde(r) > 0)
    .sort((a,b) => klantWaarde(b) - klantWaarde(a));
  const totWaarde = met.reduce((s,r)=>s+klantWaarde(r), 0);
  const top1 = met.length && totWaarde ? Math.round(klantWaarde(met[0])/totWaarde*100) : null;
  /* Alleen bij de berekende fee zijn teller en noemer dezelfde plaatsingen;
     bij gefactureerde omzet zegt "per plaatsing" niets (zie de rangschikking). */
  const metFeeTot = C.rijen.reduce((s,r)=>s+r.metFee, 0);
  const gemPerPlaatsing = (klantBron === 'fee' && totWaarde && metFeeTot)
    ? Math.round(totWaarde / metFeeTot) : null;

  return `<section class="pf-sec pf-klant">
    <div class="pf-kop"><span class="label">Per klant</span>${kiezer}
      <span class="meta">${h(V.lbl)}</span></div>

    ${klantBronNote(V, C, fin)}

    <div class="grid c4">
      ${CRM.ui.kpi('Klanten met plaatsingen', `<span class="num">${metPlaatsing}</span>`,
        `<span class="meta num">van ${C.rijen.length} met beweging in deze periode</span>`, 'accent')}
      ${CRM.ui.kpi('Plaatsingen', `<span class="num">${totPlaats}</span>`,
        metPlaatsing ? `<span class="meta num">gemiddeld ${(totPlaats/metPlaatsing).toFixed(1).replace('.',',')} per klant</span>` : '')}
      ${/* Bij de berekende fee is € 0 met plaatsingen erbij geen feit maar een
            ontbrekende afspraak — en de bronregel hierboven zegt zelf dat die
            plaatsingen "nergens als € 0 meetellen". Dan mag de tegel dat niet
            alsnog doen. Bij gefactureerd (fin) is € 0 wél een feit: er staan
            termijnen in het financebord en er is niets van gefactureerd. */''}
      ${klantGeld()
        ? CRM.ui.kpi(klantBron === 'fin' ? 'Gefactureerd' : 'Berekende fee',
            (klantBron === 'fee' && !metFeeTot && totPlaats)
              ? '<span class="meta">—</span>'
              : `<span class="num">${h(CRM.euro(totWaarde))}</span>`,
            (klantBron === 'fee' && !metFeeTot && totPlaats)
              ? `<span class="meta">van geen van de ${totPlaats} plaatsingen is een fee te berekenen — leg de commerciële afspraken vast</span>`
              : gemPerPlaatsing ? `<span class="meta num">gemiddeld ${h(CRM.euro(gemPerPlaatsing))} per plaatsing</span>` : '')
        : CRM.ui.kpi('Actief aan het werk', `<span class="num">${C.rijen.reduce((s,r)=>s+r.actief,0)}</span>`,
            '<span class="meta">nu geplaatst bij een klant</span>')}
      ${CRM.ui.kpi('Grootste klant', top1 != null ? `<span class="num">${top1}%</span>` : '<span class="meta">—</span>',
        met.length ? `<span class="meta">${h(met[0].naam)} · ${klantGeld()
          ? `${h(klantFmt(klantWaarde(met[0])))} van ${h(klantEenheid())}`
          : `${klantWaarde(met[0])} van de ${totWaarde} plaatsingen`}</span>` : '')}
    </div>

    <div class="pf-klantgrid">
      <div class="card"><div class="card-h"><div class="h2">Rangschikking</div>${bronSeg}</div>
        <div class="card-b">${klantRangschikking(C)}</div></div>
      <div class="pf-klantzij">
        ${klantConcentratie(C)}
        ${klantOntwikkeling(V, C)}
      </div>
    </div>

    ${klantTabel(V, C)}

    <p class="pf-uitleg meta">Een plaatsing telt op de datum waarop het contract getekend is, precies zoals op het bord.
      Doorlooptijd is van instroom tot getekend contract; duurzaam is niet gestopt, of pas gestopt ná de garantie.
      ${C.afgeleideVoorstellen ? `De datum van voorstellen staat niet als veld in de database: voor
        <span class="num">${C.afgeleideVoorstellen}</span> ${C.afgeleideVoorstellen===1?'kandidaat':'kandidaten'}
        is die afgeleid uit de instroomdatum omdat de historie geen regel "Voorgesteld" bevat.` : ''}
      ${C.restFin > 0 ? `Er staat daarnaast ${h(CRM.euro(C.restFin))} gefactureerd bij klanten zonder plaatsing in het CRM —
        die staan niet in de rangschikking.` : ''}</p>
  </section>`;
}

/* ═══ 7. PER BRON — marketing ↔ recruitment ══════════════════════
   Een historische import uit het oude ATS is géén wervingsbron: die
   kandidaten zijn nooit via een advertentie of gesprek binnengekomen.
   Ze staan wél zichtbaar in de tabel (ze bestaan), maar ónder de
   totaalregel en zonder conversiepercentages — anders zou één import
   van honderden namen de cijfers van Meta, Indeed en WhatsApp
   onherkenbaar verdunnen.                                          */
const BRON_GEEN_WERVING = b => /\bimport\b|oud ats|migratie/i.test(b);

/* "Per bron" is op 3 sep 2026 vervangen door de campagnetabel in het
   hoofdstuk Trechter: die zegt hetzelfde, maar dan mét kosten erbij en per
   campagne in plaats van per grofkorrelige bron. Niet-Meta-bronnen staan
   daar als eigen regels. */

/* ═══ 7b. FINANCIËLE DATA — alleen Tjeerd (RLS-beschermd) ════════ */
let _fin = null;
async function finLezen(){
  if(_fin) return _fin;
  if(!CRM.canSeeMoney()) return (_fin = {ok:false, settings:{}});
  /* In demo blijft de echte database buiten beeld — anders staan er
     bij een nog actieve sessie zomaar echte omzetcijfers op een testscherm. */
  if(CRM.demo) return (_fin = {ok:false, settings:{}});
  try{
    const [p,i,s] = await Promise.all([
      CRM.sb.from('fin_placements').select('id,klant,kandidaat,fee_excl,contract_datum,gestopt_op'),
      CRM.sb.from('fin_installments').select('placement_id,bedrag_excl,geplande_datum,factuurdatum,status'),
      CRM.sb.from('fin_settings').select('key,value')
    ]);
    const settings = s.error ? {} : Object.fromEntries((s.data||[]).map(r=>[r.key, r.value]));
    /* Onderscheid bewaren tussen "er staat niets" en "ik kon het niet lezen":
       zonder dat verschil meldde het Doel-blok bij een RLS- of netwerkfout
       doodleuk "er staat nog geen omzetdoel" — en dat is een leugen die je
       een nieuw doel laat intypen over een bestaand doel heen. */
    const fout = s.error || ((p.error && i.error) ? (p.error || i.error) : null);
    if(p.error && i.error) return (_fin = {ok:false, settings, fout});
    const placements = p.error ? [] : (p.data||[]);
    const termijnen  = i.error ? [] : (i.data||[]);
    return (_fin = {ok:!!(placements.length || termijnen.length), placements, termijnen, settings, fout});
  }catch(e){ return (_fin = {ok:false, settings:{}, fout:e}); }
}

/* ═══ 0. DOEL — omzetdoel uit het financebord + benodigd tempo ═══
   Euro's strikt achter CRM.canSeeMoney(). Het team ziet alleen de
   afgeleide activiteitendoelen (aantallen), dat is juist motiverend. */
const posNum = v => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };

/* Conversie uit de eigen CRM-data: van afgeronde W&S-trajecten, welk deel
   van de voorstellen en gesprekken werd uiteindelijk een plaatsing? */
function conversies(){
  const cs = CRM.kandidaten().filter(c => !['Flex','ZZP'].includes(c.type||'W&S'));
  const klaar = cs.filter(c => CRM.faseIn(c.fase, CRM.DONE) || c.geplaatstOp);
  const vg = klaar.filter(c => verste(c) >= fIdx('Voorgesteld')).length;
  const gs = klaar.filter(c => verste(c) >= fIdx('Eerste gesprek')).length;
  /* Geplaatst = er is een datum van tekenen. NIET verste() >= 'Contract
     getekend': de fase-historie van een afgevallen kandidaat bevat alle
     fases waar die ooit langs kwam, dus iedereen die ooit tot een contract
     kwam en toch afhaakte telde hier als plaatsing. Dat maakte de conversie
     te gunstig — je zou denken dat er minder voorstellen nodig zijn per
     plaatsing dan in werkelijkheid. Zelfde meetlat als ratios() hierboven,
     als het bord en als Finance: een vastgelegd feit gaat vóór een
     afgeleide. */
  const pl = klaar.filter(c => !!kort(c.geplaatstOp)).length;
  return {vg, gs, pl,
    voorPerPl:     pl ? vg/pl : null,
    gesprekPerPl:  pl ? gs/pl : null};
}

/* Tempotegels: X plaatsingen → Y voorstellen → Z gesprekken per maand. */
function tempoHtml(plPerMnd, conv){
  const t = (n, lbl, sub) => `<div class="pf-tempo-t"><span class="label">${h(lbl)}</span>
    <b class="num">${n!=null ? (Math.round(n*10)/10).toLocaleString('nl-NL') : '—'}</b>
    <span class="meta">${h(sub)}</span></div>`;
  const vs = conv.voorPerPl    != null && plPerMnd != null ? plPerMnd * conv.voorPerPl    : null;
  const gs = conv.gesprekPerPl != null && plPerMnd != null ? plPerMnd * conv.gesprekPerPl : null;
  return `<div class="pf-tempo">
    ${t(plPerMnd, 'Plaatsingen / maand', 'nodig om het doel te halen')}
    ${t(vs, 'Voorstellen / maand', conv.voorPerPl!=null ? `eigen conversie: ${conv.voorPerPl.toFixed(1)} voorstellen per plaatsing` : 'nog te weinig eigen data')}
    ${/* Bewust "eerste gesprekken": conversies() telt kandidaten die minstens
          tot de fase Eerste gesprek kwamen, niet het aantal gevoerde gesprekken.
          Dat zijn twee verschillende getallen en de kop moet zeggen welke. */''}
    ${t(gs, 'Eerste gesprekken / maand', conv.gesprekPerPl!=null ? `eigen conversie: ${conv.gesprekPerPl.toFixed(1)} eerste gesprekken per plaatsing` : 'nog te weinig eigen data')}
  </div>`;
}

function blokDoel(fin){
  /* Team: geen euro's, wel de afgeleide activiteitendoelen op basis van
     het maandtarget van het bord en de eigen conversieratio's. Dit deel
     heeft geen financiële data nodig en werkt dus ook in demo-modus. */
  if(!CRM.canSeeMoney()){
    const target = CRM.maandTarget();
    if(!target) return '';
    const conv = conversies();
    return `<section class="pf-sec">
      <div class="pf-kop"><span class="label">Doel</span><span class="meta">wat er nodig is om het maandtarget te halen</span></div>
      <div class="card"><div class="card-b">
        ${tempoHtml(target, conv)}
        <p class="pf-uitleg meta">Gebaseerd op het maandtarget van <span class="num">${target}</span> plaatsingen
          en de conversie uit onze eigen afgeronde trajecten (<span class="num">${conv.vg}</span> voorstellen → <span class="num">${conv.pl}</span> plaatsingen).</p>
      </div></div>
    </section>`;
  }

  /* Eigenaar in demo: de echte financiële data blijft bewust buiten beeld. */
  if(CRM.demo)
    return `<section class="pf-sec"><div class="pf-kop"><span class="label">Doel</span>
        <span class="meta">alleen voor jou</span></div>
      <div class="card"><div class="card-b">${CRM.ui.leeg('Geen financiële data in demo-modus',
        'Het omzetdoel en het benodigde tempo verschijnen hier zodra je met je eigen account bent ingelogd.')}</div></div></section>`;

  /* Eigenaar, nog aan het laden */
  if(!fin) return `<section class="pf-sec"><div class="pf-kop"><span class="label">Doel</span></div>
    <div class="card"><div class="card-b">${CRM.ui.laden('Financiële doelen laden…')}</div></div></section>`;

  const S = fin.settings || {};
  /* Welke doel-keys staan er? Niets hardcoden — tonen wat er staat. */
  const doelOmzet = posNum(S.doel_omzet) ?? posNum(S.doel_omzet_jaar);
  const doelBron  = posNum(S.doel_omzet) != null ? 'doel_omzet' : (posNum(S.doel_omzet_jaar) != null ? 'doel_omzet_jaar' : null);
  const doelWinst = posNum(S.doel_winst_jaar);

  /* Geen omzetdoel ingesteld → toon het doel dat er wél staat + instelveld.
     Ook als fin_settings helemaal leeg is (of niet gelezen kon worden)
     komt het scherm hier netjes uit: één zin en één invulveld. */
  if(doelOmzet == null){
    const eindJaar = CRM.todayISO().slice(0,4) + '-12';
    return `<section class="pf-sec">
      <div class="pf-kop"><span class="label">Doel</span><span class="meta">alleen voor jou</span></div>
      <div class="card"><div class="card-b">
        ${fin.fout ? `<div class="note err" style="margin:0 0 16px">De instellingen van het financebord konden niet gelezen worden${
            fin.fout.message ? ` — ${h(fin.fout.message)}` : ''}. Er staat dus mogelijk wél een omzetdoel;
            controleer je verbinding of je rechten voordat je hieronder een nieuw doel instelt.</div>` : ''}
        ${doelWinst != null ? `<div class="pf-doelkop"><div><span class="label">Winstdoel dit jaar (financebord)</span>
            <div class="big num">${h(CRM.euro(doelWinst))}</div></div></div>
          <p class="pf-uitleg meta">Er staat nog geen omzetdoel in de instellingen. Stel het hieronder in — dan rekent dit blok uit welk tempo daarvoor nodig is.</p>`
        : fin.fout ? ''
        : `<p class="sub" style="margin:0 0 12px">Er staat nog geen omzetdoel in de instellingen van het financebord. Stel het hieronder in — dan rekent dit blok uit hoeveel plaatsingen, voorstellen en gesprekken per maand daarvoor nodig zijn.</p>`}
        <div class="row tight pf-doelset">
          <input type="number" id="pf_doelbedrag" placeholder="Omzetdoel, bijv. 400000" min="0" step="1000" style="width:200px">
          <input type="month" id="pf_doeldatum" value="${h(eindJaar)}" style="width:160px">
          <button class="btn sm" id="pf_doelzet">Omzetdoel instellen</button>
        </div>
        <p class="pf-uitleg meta">Wordt bewaard in <span class="num">fin_settings</span> (doel_omzet en doel_omzet_datum),
          zodat het dashboard met hetzelfde doel rekent.</p>
      </div></div>
    </section>`;
  }

  /* Doeldatum: uit doel_omzet_datum, anders einde van dit jaar. */
  const vandaag = CRM.todayISO();
  let doelDatum = String(S.doel_omzet_datum || '').slice(0,10);
  if(doelDatum && doelDatum.length === 7) doelDatum = eindeMaand(doelDatum);
  if(!doelDatum || isNaN(new Date(doelDatum))) doelDatum = vandaag.slice(0,4) + '-12-31';

  /* Meetvenster: de 12 maanden tot de doeldatum (bij een jaardoel zonder
     datum: dit kalenderjaar).
     Ligt de doeldatum verder dan een jaar weg — bijvoorbeeld een doel voor
     december 2028 — dan begint dat venster in de toekomst en valt er per
     definitie geen enkele factuur in. Het blok meldde dan € 0 gerealiseerd
     met "gefactureerd sinds 31 dec 2027": een toekomstige datum en een
     onwaar cijfer. In dat geval meten we vanaf 1 januari van dit jaar, zodat
     "gerealiseerd" altijd over een periode gaat die al bestaat. */
  const vensterStart = (doelBron === 'doel_omzet_jaar' && !S.doel_omzet_datum)
    ? vandaag.slice(0,4) + '-01-01'
    : verschuifMaanden(doelDatum, -12);
  const verDoel = vensterStart > vandaag;
  const start = verDoel ? vandaag.slice(0,4) + '-01-01' : vensterStart;

  const omzet = (fin.termijnen||[])
    .filter(t => ['gefactureerd','betaald'].includes(t.status))
    .filter(t => { const d = kort(t.factuurdatum || t.geplande_datum); return d && d >= start && d <= vandaag; })
    .reduce((s,t)=>s+(Number(t.bedrag_excl)||0),0);

  /* Sparkline: gefactureerde omzet per maand (laatste 6). Staat alleen in
     dit blok, dat al strikt achter CRM.canSeeMoney() zit — het team ziet
     dit lijntje dus nooit. Olijf, geen bedragen erbij: richting. */
  const perOmzet = laatsteMaanden(6).map(mk => (fin.termijnen||[])
    .filter(t => ['gefactureerd','betaald'].includes(t.status)
      && kort(t.factuurdatum || t.geplande_datum).slice(0,7) === mk)
    .reduce((s,t)=>s+(Number(t.bedrag_excl)||0),0));
  const sOmzet = sparkline(perOmzet);

  const teGaan = Math.max(0, doelOmzet - omzet);
  const pct = Math.min(100, Math.round(omzet / doelOmzet * 100));
  /* Ligt de doeldatum al achter ons, dan is er geen tempo meer uit te rekenen —
     dan vragen we om een nieuwe datum in plaats van een onmogelijk getal. */
  const dagenRest = Math.round((new Date(doelDatum) - new Date(vandaag)) / 86400000);
  const verstreken = dagenRest < 0;
  const mndRest = Math.max(0.25, dagenRest / 30.44);

  /* Gemiddelde fee en blijfkans uit fin_placements. */
  const fees = (fin.placements||[]).map(pl => Number(pl.fee_excl)||0).filter(n => n > 0);
  const gemFee = fees.length ? fees.reduce((a,b)=>a+b,0)/fees.length : null;
  const plTot = (fin.placements||[]).length;
  const blijf = plTot ? 1 - (fin.placements.filter(pl => pl.gestopt_op).length / plTot) : 1;

  const perPlaatsing = gemFee != null ? gemFee * Math.max(0.1, blijf) : null;
  const plNodig  = perPlaatsing ? teGaan / perPlaatsing : null;
  const plPerMnd = plNodig != null ? plNodig / mndRest : null;
  const conv = conversies();

  const dLbl = new Date(doelDatum).toLocaleDateString('nl-NL',{month:'long',year:'numeric'});
  const klaarTekst = teGaan === 0 ? `<span class="chip green">Doel gehaald</span>` : '';
  /* Staat er ook een jaardoel in het financebord dat afwijkt? Dan reken je in
     twee apps met verschillende getallen — dat wil je weten. */
  const doelJaar = posNum(S.doel_omzet_jaar);
  const afwijkend = doelBron === 'doel_omzet' && doelJaar != null && Math.round(doelJaar) !== Math.round(doelOmzet);

  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Doel</span><span class="meta">alleen voor jou · euro's ziet het team niet</span></div>
    <div class="card"><div class="card-b">
      <div class="pf-doelkop">
        <div><span class="label">Omzetdoel</span><div class="big num">${h(CRM.euro(doelOmzet))}</div>
          <span class="meta">t/m ${h(dLbl)}</span></div>
        <div><span class="label">Gerealiseerd</span><div class="big num">${h(CRM.euro(omzet))}</div>
          <span class="meta">gefactureerd sinds ${h(start.slice(0,4) === vandaag.slice(0,4) ? CRM.fmtDateShort(start) : CRM.fmtDate(start))}</span>
          ${sOmzet?`<div class="pf-spark">${sOmzet}<span class="meta">per maand</span></div>`:''}</div>
        <div><span class="label">Nog te gaan</span><div class="big num">${h(CRM.euro(teGaan))}</div>
          <span class="meta num">${verstreken ? 'doeldatum verstreken' : mndRest.toFixed(1).replace('.',',') + ' maanden resterend'}</span></div>
        <span class="spacer"></span>
        <div class="row tight">${klaarTekst}<button class="btn ghost sm" id="pf_doelzetten">Doel aanpassen</button></div>
      </div>
      <div class="pf-doelbar">${CRM.ui.bar(pct, pct>=100?'green':'')}
        <span class="meta num">${pct}% van het doel</span></div>
      ${teGaan > 0 && verstreken
        ? `<div class="note warn" style="margin-top:18px">De doeldatum (${h(dLbl)}) is verstreken en het doel is niet gehaald.
             Zet een nieuwe datum met <b>Doel aanpassen</b> — dan rekent dit blok het benodigde tempo opnieuw uit.</div>`
        : teGaan > 0 ? tempoHtml(plPerMnd, conv) : ''}
      ${verDoel ? `<p class="pf-uitleg meta">De doeldatum ligt verder dan een jaar weg, dus "gerealiseerd" telt hier
        alles wat sinds 1 januari ${h(vandaag.slice(0,4))} gefactureerd is. Zet een doeldatum binnen twaalf maanden
        als je het tempo per maand strak wilt kunnen volgen.</p>` : ''}
      ${afwijkend ? `<p class="pf-uitleg meta">Let op: in het financebord staat een jaardoel van
        ${h(CRM.euro(doelJaar))} (doel_omzet_jaar). Dit blok rekent met het doel hierboven (doel_omzet).</p>` : ''}
      <p class="pf-uitleg meta">${gemFee != null
        ? `Gerekend met een gemiddelde fee van ${h(CRM.euro(Math.round(gemFee)))} (uit ${fees.length} ${fees.length===1?'plaatsing':'plaatsingen'}),
           een blijfkans van ${Math.round(blijf*100)}% en de conversie uit onze eigen afgeronde trajecten
           (${conv.vg} voorstellen → ${conv.pl} plaatsingen).`
        : 'Nog geen plaatsingen met fee in het financebord — het benodigde tempo kan pas berekend worden zodra die er zijn.'}</p>
    </div></div>
  </section>`;
}

/* Doeldatum-hulpjes */
function eindeMaand(mk){ const [j,m] = mk.split('-').map(Number); return new Date(j, m, 0).toLocaleDateString('sv-SE'); }
function verschuifMaanden(iso, n){ const d = new Date(iso); d.setMonth(d.getMonth()+n); return d.toLocaleDateString('sv-SE'); }

/* Omzetdoel wegschrijven naar fin_settings (keys: doel_omzet + doel_omzet_datum).
   fin_settings heeft key als primaire sleutel en value als jsonb; onConflict
   staat er expliciet bij zodat een bestaand doel wordt overschreven in
   plaats van een dubbele sleutel te veroorzaken. */
async function doelOpslaan(bedrag, maand){
  if(!CRM.canSeeMoney()) return false;
  if(CRM.demo){ CRM.toast('Demo-modus — het doel wordt niet opgeslagen','err'); return false; }
  const rows = [{key:'doel_omzet', value:bedrag}];
  if(maand) rows.push({key:'doel_omzet_datum', value:maand});
  const {error} = await CRM.sb.from('fin_settings').upsert(rows, {onConflict:'key'});
  if(error){ CRM.fout('Doel opslaan mislukt', error); return false; }
  if(_fin){ _fin.settings = _fin.settings || {}; _fin.settings.doel_omzet = bedrag; if(maand) _fin.settings.doel_omzet_datum = maand; }
  CRM.toast('Omzetdoel opgeslagen','ok');
  return true;
}

function doelModal(mount, acties){
  const S = (_fin && _fin.settings) || {};
  const huidig = posNum(S.doel_omzet) ?? posNum(S.doel_omzet_jaar) ?? '';
  const datum  = String(S.doel_omzet_datum||'').slice(0,7);
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Omzetdoel aanpassen</div></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Omzetdoel (excl. btw)</label>
          <input type="number" id="dm_bedrag" min="0" step="1000" value="${h(huidig)}"></div>
        <div class="f-row"><label>Te halen vóór</label>
          <input type="month" id="dm_maand" value="${h(datum)}"></div>
      </div>
      <p class="hint">Wordt opgeslagen in de instellingen van het financebord (fin_settings) onder doel_omzet en doel_omzet_datum.
        Het CRM-dashboard rekent met hetzelfde doel; het jaardoel ín het financebord (doel_omzet_jaar) blijft ongemoeid.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="dm_ok">Opslaan</button></div>`, {onOpen(m){
    m.querySelector('#dm_ok').onclick = async () => {
      const bedrag = Number(m.querySelector('#dm_bedrag').value);
      if(!bedrag || bedrag <= 0) return CRM.toast('Vul een bedrag in','err');
      CRM.modal.close();
      if(await doelOpslaan(bedrag, m.querySelector('#dm_maand').value || '')) teken(mount, acties);
    };
  }});
}

function blokOmzet(p, fin){
  if(!CRM.canSeeMoney() || !fin || !fin.ok) return '';
  const bet = t => Number(t.bedrag_excl)||0;
  const inPeriode = (fin.termijnen||[]).filter(t => inP(t.factuurdatum || t.geplande_datum, p));
  const gefactureerd = inPeriode.filter(t => ['gefactureerd','betaald'].includes(t.status));
  const omzet = gefactureerd.reduce((s,t)=>s+bet(t),0);
  const betaald = inPeriode.filter(t => t.status==='betaald').reduce((s,t)=>s+bet(t),0);

  const getekendFee = (fin.placements||[]).filter(pl => inP(pl.contract_datum, p));
  const feeTotaal = getekendFee.reduce((s,pl)=>s+(Number(pl.fee_excl)||0),0);
  const gemFee = getekendFee.length ? Math.round(feeTotaal/getekendFee.length) : null;

  /* De top-vijf klanten stond hier ook, maar dan alleen over de gekozen
     periode en alleen uit het financebord. Dat is nu één blok hoger
     opgegaan in "Per klant", waar de rangschikking wél de klanten zonder
     financeboekhouding meeneemt en zegt welke bron ze gebruikt. Twee
     ranglijstjes met verschillende getallen op één scherm is erger dan
     geen ranglijstje. */
  return `<section class="pf-sec">
    <div class="pf-kop"><span class="label">Omzet (financebord)</span><span class="meta">alleen voor jou · ${h(p.lbl)}</span></div>
    <div class="grid c4">
      ${CRM.ui.kpi('Gefactureerd', `<span class="num">${h(CRM.euro(omzet))}</span>`,
        `<span class="meta num">${gefactureerd.length} termijn${gefactureerd.length===1?'':'en'}</span>`, 'accent')}
      ${CRM.ui.kpi('Waarvan betaald', `<span class="num">${h(CRM.euro(betaald))}</span>`, '')}
      ${CRM.ui.kpi('Getekende fee', `<span class="num">${h(CRM.euro(feeTotaal))}</span>`,
        `<span class="meta num">${getekendFee.length} plaatsingen</span>`)}
      ${CRM.ui.kpi('Gemiddelde fee', gemFee!=null ? `<span class="num">${h(CRM.euro(gemFee))}</span>` : '<span class="meta">—</span>', '')}
    </div>
    <p class="pf-uitleg meta">Dit zijn de bedragen zoals ze in het financebord staan: gefactureerd en betaald in
      ${h(p.lbl)}. De verdeling over klanten staat hierboven bij Per klant.</p>
  </section>`;
}

/* ═══ PERIODEKIEZER ══════════════════════════════════════════════ */
const KEUZES = [['maand','Deze maand'],['vorige','Vorige maand'],['kwartaal','Dit kwartaal'],['jaar','Dit jaar'],['eigen','Eigen bereik']];

function kiezerHTML(p){
  return `<div class="pf-kiezer">
    <div class="seg">${KEUZES.map(([k,l])=>`<button data-per="${k}" class="${periode===k?'on':''}">${h(l)}</button>`).join('')}</div>
    ${periode==='eigen' ? `<div class="row tight pf-eigen">
      <input type="date" id="pf_van" value="${h(p.van)}"><span class="meta">t/m</span>
      <input type="date" id="pf_tot" value="${h(p.tot)}"></div>` : ''}
  </div>`;
}

/* ═══ REGISTRATIE ════════════════════════════════════════════════ */

/* ═══ HOOFDSTUK TRECHTER — van campagne-binnenkomst tot plaatsing ══════
   Nieuw op 3 sep 2026 (Performance-conceptplan). Rekent op CRM.keten() —
   exact dezelfde motor als Marketing · Rendement, dus de twee schermen
   kunnen niet uit elkaar lopen. De kostenkant (mkt_meta_stats en de
   handmatige campagne→klant-koppelingen) laden we hier zelf; zonder die
   data werkt de lead-kant gewoon en blijven de €-kolommen leeg.

   Cohort-tucht: alles telt op de maand/dag van binnen_op. Eindteller
   "geplaatst" en elke €-per-plaatsing rekenen op CRM.teltAlsPlaatsing —
   de strengste definitie (eist een datum van tekenen), dezelfde als het
   bord. Waar "ooit voorgesteld" als tussenstap staat telt de historie.  */

let _mkt = null, _mktBezig = false;
function mktLezen(na){
  if(_mkt || _mktBezig || CRM.demo) return;
  _mktBezig = true;
  Promise.all([
    CRM.sb.from('mkt_meta_stats').select('*').order('datum',{ascending:false}).limit(3000),
    CRM.sb.from('mkt_campagne_klant').select('*'),
    /* Fase 2 (3 sep 2026): handmatige kanaalkosten (Indeed) en de
       routeringswacht. Bestaan de tabellen nog niet, dan vangt de catch
       dat af en werkt de rest gewoon. */
    CRM.sb.from('mkt_kanaal_kosten').select('*'),
    CRM.sb.from('routering_gaten').select('*')
  ]).then(([a,b,c,d]) => {
    _mkt = {meta:a.data||[], campKlant:b.data||[], kanaalKosten:c.data||[],
            routeringGaten:d.data||[], fout:a.error||b.error||null};
  }).catch(e => { _mkt = {meta:[], campKlant:[], kanaalKosten:[], routeringGaten:[], fout:e}; })
    .finally(() => { _mktBezig = false; if(na) na(); });
}
const ketenIndex = () => CRM.keten({metaStats:_mkt ? _mkt.meta : [], campKlant:_mkt ? _mkt.campKlant : []});

/* Hersteld nageleverde leads (12–25 aug via de rauwe inloop, 3 sep 2026):
   ze tellen gewoon mee in hun eigen cohortmaand — hun binnen_op is de
   originele datum en de advertentie-uitgaven van die maand horen erbij —
   maar het scherm benoemt ze, want ze zijn nooit door de bot gesproken. */
const isHersteld = l => /^hersteld/i.test(String((l||{}).kwalificatie||''));

const eurK = (v,dec=0) => v == null ? '—' : CRM.euro(v, dec);
const pctK = (a,b) => b > 0 ? Math.round(a/b*100) + '%' : '—';

/* Geplaatst — streng (B2): via de kandidaat, met CRM.teltAlsPlaatsing. */
const rGeplaatst = r => !!(r.cand && CRM.teltAlsPlaatsing(r.cand));

/* De selectie van dit hoofdstuk: telbare Meta-ketenrijen binnen de periode. */
function ketenSelectie(p, K){
  return K.leads.filter(r => r.dk && r.dk >= p.van && r.dk <= p.tot);
}
function spendPerCamp(p, K){
  const mkVan = p.van.slice(0,7), mkTot = p.tot.slice(0,7);
  const per = new Map(); let totaal = 0;
  for(const r of K.uitRijen){
    if(r.mk < mkVan || r.mk > mkTot) continue;
    per.set(r.campagne, (per.get(r.campagne)||0) + r.bedrag);
    totaal += r.bedrag;
  }
  return {per, totaal};
}

/* Campagnerijen voor tabel, tweezinnen en samenvatting — één berekening. */
function campRijen(p, K){
  const sel = ketenSelectie(p, K);
  const {per:spend} = spendPerCamp(p, K);
  const perCamp = new Map();
  for(const r of sel){
    const naam = String(r.lead.campagne||'').trim() || '(zonder campagnenaam)';
    if(!perCamp.has(naam)) perCamp.set(naam, []);
    perCamp.get(naam).push(r);
  }
  const rijen = [...perCamp].map(([naam, rs]) => {
    const t = CRM.trechter(rs);
    const geplaatst = rs.filter(rGeplaatst).length;
    const bedrag = spend.get(naam) || 0;
    const kop = K.campKoppel.get(naam);
    return {naam, klant:(kop && kop.klant) || '', rs, t, geplaatst, bedrag,
            perLead: t.binnen && bedrag > 0 ? bedrag / t.binnen : null,
            perGekwal: t.gekwal && bedrag > 0 ? bedrag / t.gekwal : null,
            perPlaatsing: geplaatst && bedrag > 0 ? bedrag / geplaatst : null,
            hersteld: rs.filter(r => isHersteld(r.lead)).length};
  }).sort((a,b) => b.bedrag - a.bedrag || b.t.binnen - a.t.binnen);
  /* Campagnes met uitgaven in deze periode maar zonder één lead erin. */
  const metLeads = new Set(rijen.map(r => r.naam));
  let spendZonderLeads = 0;
  for(const [naam, bedrag] of spend) if(!metLeads.has(naam)) spendZonderLeads += bedrag;
  return {rijen, sel, spendZonderLeads};
}

/* Beste en zwakste campagne — twee zinnen, met de eisen uit het conceptplan:
   minstens 10 leads én toegewezen spend, anders één neutrale zin. Gemeten op
   € per gekwalificeerde lead (CPQL): dat is het leading stuurgetal; op
   €/plaatsing oordeel je pas als een cohort is uitgewerkt. */
function tweeZinnen(rijen){
  const mee = rijen.filter(r => r.t.binnen >= 10 && r.bedrag > 0 && r.perGekwal != null);
  if(mee.length < 2){
    const tekort = rijen.filter(r => r.bedrag > 0 && r.t.binnen < 10);
    return {mee:null, zin:`Nog geen eerlijke vergelijking te maken: er zijn ${mee.length === 1
      ? 'maar één campagne' : 'geen campagnes'} met minstens 10 leads én toegewezen uitgaven in deze periode${
      tekort.length ? ` — ${tekort.length === 1 ? 'één campagne zit' : tekort.length + ' campagnes zitten'} er qua leads nog onder` : ''}.`};
  }
  const op = [...mee].sort((a,b) => a.perGekwal - b.perGekwal);
  const beste = op[0], zwakste = op[op.length-1];
  return {mee, beste, zwakste,
    zin:`<b>${h(beste.naam)}</b> levert het goedkoopst: ${eurK(beste.perGekwal)} per gekwalificeerde lead (${beste.t.gekwal} van ${beste.t.binnen} gekwalificeerd). `
      + `<b>${h(zwakste.naam)}</b> is met ${eurK(zwakste.perGekwal)} per gekwalificeerde lead de duurste — ${Math.round(zwakste.perGekwal/beste.perGekwal*10)/10}× zo duur.`};
}

function hoofdstukTrechter(p, K){
  const {rijen, sel, spendZonderLeads} = campRijen(p, K);
  const t = CRM.trechter(sel);
  const geplaatst = sel.filter(rGeplaatst).length;
  const {totaal:spendTot} = spendPerCamp(p, K);
  const herstelN = sel.filter(r => isHersteld(r.lead)).length;
  const dubbelN  = K.dubbels.filter(r => r.dk && r.dk >= p.van && r.dk <= p.tot).length;
  const loopt = sel.filter(r => r.loopt).length;

  if(!sel.length && !spendTot)
    return `<div class="card"><div class="card-b">${CRM.ui.leeg('Geen Meta-leads of uitgaven in deze periode',
      'Kies een langere periode, of kijk bij Koers voor het jaarbeeld.')}</div></div>`;

  /* ── Aansluitregel (B3): wat kwam er binnen en wat telt er mee. ── */
  const mktStil = !_mkt ? ' · kosten worden nog geladen…' : (_mkt.fout ? ' · kosten konden niet geladen worden' : '');
  const aansluit = `<p class="pf-aansluit meta"><span class="num">${t.binnen}</span> Meta-leads in het CRM in deze periode${
      dubbelN ? ` · <span class="num">${dubbelN}</span> dubbele aanmelding${dubbelN===1?'':'en'} apart gehouden` : ''}${
      herstelN ? ` · <span class="num">${herstelN}</span> hersteld nageleverd (nooit door de bot gesproken)` : ''}${
      spendTot ? ` · ${eurK(spendTot)} uitgegeven` : ''}${mktStil}.
      €-per-lead is een ondergrens op de CRM-telling: wat Meta leverde maar het CRM nooit haalde, staat hier niet in.</p>`;

  /* ── 2.1 De funnel zelf. ── */
  const stappen = [
    {k:'binnen',      lbl:'Binnengekomen',        n:t.binnen,      rs:sel},
    {k:'gekwal',      lbl:'Bot-gekwalificeerd',   n:t.gekwal,      rs:sel.filter(r=>r.gekwal)},
    {k:'door',        lbl:'Kandidaatkaart',       n:t.door,        rs:sel.filter(r=>r.door)},
    {k:'voorgesteld', lbl:'Voorgesteld',          n:t.voorgesteld, rs:sel.filter(r=>r.voorgesteld)},
    {k:'geplaatst',   lbl:'Geplaatst',            n:geplaatst,     rs:sel.filter(rGeplaatst)}
  ];
  const start = t.binnen || 1;
  const funnel = `<div class="pf-funnel">${stappen.map((st,i) => {
    const kosten = st.n && spendTot > 0 ? ` · ${eurK(spendTot/st.n)}/stuk` : '';
    const open = trOpen === st.k;
    const drill = open ? `<div class="pf-drill">${st.rs.slice(0,40).map(r =>
        `<span>${h(r.naam || r.id)}${r.klant ? ` <i>· ${h(r.klant)}</i>` : ''}</span>`).join('')}${
        st.rs.length > 40 ? `<span class="meta">… en ${st.rs.length-40} meer</span>` : ''}${
        st.rs.length ? '' : '<span class="meta">niemand in deze stap</span>'}</div>` : '';
    return `<div class="pf-fr" data-trstap="${st.k}" role="button" title="klik voor de namen">
        <div class="pf-fl">${h(st.lbl)}</div>
        <div class="pf-fb"><i style="width:${Math.round(st.n/start*100)}%"></i>
          <span class="pf-fn num">${st.n}</span></div>
        <div class="pf-fd meta num">${pctK(st.n, t.binnen)}${kosten}</div>
      </div>${drill}`;
  }).join('')}</div>`;

  /* ── "Advertentie of opvolging?" — waar zit het als het tegenvalt. ──
     De advertentiekant meet de bot-kwalificatie tegen het eigen rollende
     accountgemiddelde (geen branchecijfers, huisregel); de opvolgingskant
     telt gekwalificeerde leads die nog op Nieuw of Geen gehoor staan. */
  const alleT = CRM.trechter(K.leads);
  const normGekwal = alleT.binnen >= 30 ? alleT.gekwal / alleT.binnen : null;
  const gekwalNu = t.binnen >= 10 ? t.gekwal / t.binnen : null;
  const blijftLiggen = sel.filter(r => r.gekwal && (r.nieuw || r.nietBereikt)).length;
  let advOpv = '';
  if(gekwalNu != null){
    const stuk = [];
    if(normGekwal != null && gekwalNu < normGekwal * 0.7)
      stuk.push(`De <b>advertentiekant</b> hapert: ${pctK(t.gekwal, t.binnen)} van de leads is bot-gekwalificeerd, tegen ${Math.round(normGekwal*100)}% als eigen accountgemiddelde — dat wijst naar de doelgroep of het formulier, niet naar de opvolging.`);
    else
      stuk.push(`De <b>advertentiekant</b> doet zijn werk: ${pctK(t.gekwal, t.binnen)} bot-gekwalificeerd${normGekwal != null ? ` (eigen gemiddelde: ${Math.round(normGekwal*100)}%)` : ''}.`);
    if(blijftLiggen)
      stuk.push(`Aan de <b>opvolgingskant</b> ${blijftLiggen === 1 ? 'ligt 1 gekwalificeerde lead' : `liggen ${blijftLiggen} gekwalificeerde leads`} nog op Nieuw of Geen gehoor — dat is betaald materiaal dat wacht op een belletje, niet op een betere campagne.`);
    else if(t.gekwal)
      stuk.push(`De <b>opvolging</b> is bij: geen enkele gekwalificeerde lead staat nog onaangeroerd.`);
    advOpv = `<div class="pf-advopv"><span class="label">Advertentie of opvolging?</span><p>${stuk.join(' ')}</p></div>`;
  }

  /* ── 2.2 Twee zinnen. ── */
  const tz = tweeZinnen(rijen);

  /* ── 2.3 De campagnetabel (vervangt "Per bron"). Niet-Meta-bronnen als
        eigen regels met — in de kostenkolommen. ── */
  const nietMeta = (() => {
    const per = new Map();
    for(const l of (CRM.state.leads||[])){
      const bron = String(l.bron||'').trim();
      if(!bron || bron === 'Meta') continue;
      const d = dagVan(l.binnen_op);
      if(!d || d < p.van || d > p.tot) continue;
      if(!per.has(bron)) per.set(bron, []);
      per.get(bron).push(l);
    }
    const mkVan = p.van.slice(0,7), mkTot = p.tot.slice(0,7);
    const kostenVan = bron => (_mkt && _mkt.kanaalKosten || [])
      .filter(r => String(r.kanaal||'').toLowerCase() === String(bron).toLowerCase()
                && r.maand >= mkVan && r.maand <= mkTot)
      .reduce((x,r) => x + (Number(r.bedrag)||0), 0);
    return [...per].map(([bron, ls]) => ({bron, n:ls.length,
      door: ls.filter(CRM.leadDoor).length,
      geplaatst: ls.filter(l => { const c = CRM.kandVanLead(l); return c && CRM.teltAlsPlaatsing(c); }).length,
      bedrag: kostenVan(bron)
    })).sort((a,b) => b.n - a.n);
  })();
  const tabel = `<div class="tblwrap"><table class="tbl pf-tbl">
    <thead><tr><th>Campagne</th><th class="num">Leads</th><th class="num">Gekwalificeerd</th>
      <th class="num">Kandidaat</th><th class="num">Geplaatst</th>
      <th class="num">Uitgegeven</th><th class="num">€ / lead</th><th class="num">€ / gekwalificeerd</th></tr></thead>
    <tbody>
      ${rijen.map(r => `<tr>
        <td><b>${h(r.naam)}</b>${r.klant ? `<span class="meta"> · ${h(r.klant)}</span>` : (r.bedrag > 0 ? `<span class="chip amber"> niet aan een klant gekoppeld</span>` : '')}${
          r.hersteld ? `<span class="meta"> · ${r.hersteld} hersteld</span>` : ''}</td>
        <td class="num">${r.t.binnen}</td>
        <td class="num">${r.t.gekwal}<span class="meta"> (${pctK(r.t.gekwal, r.t.binnen)})</span></td>
        <td class="num">${r.t.door}</td>
        <td class="num">${r.geplaatst}</td>
        <td class="num">${r.bedrag > 0 ? eurK(r.bedrag) : '—'}</td>
        <td class="num">${r.perLead != null ? eurK(r.perLead, 2) : '—'}</td>
        <td class="num">${r.perGekwal != null ? eurK(r.perGekwal) : '—'}</td>
      </tr>`).join('')}
      ${nietMeta.map(r => `<tr class="pf-nietmeta">
        <td><b>${h(r.bron)}</b><span class="meta"> · ${r.bedrag > 0 ? 'handmatig maandbedrag (Instellingen)' : 'geen advertentiekosten bekend'}</span></td>
        <td class="num">${r.n}</td><td class="num">—</td>
        <td class="num">${r.door}</td><td class="num">${r.geplaatst}</td>
        <td class="num">${r.bedrag > 0 ? eurK(r.bedrag) : '—'}</td>
        <td class="num">${r.bedrag > 0 && r.n ? eurK(r.bedrag/r.n, 2) : '—'}</td><td class="num">—</td>
      </tr>`).join('')}
    </tbody></table></div>
    ${spendZonderLeads ? `<p class="pf-uitleg meta">Daarnaast is ${eurK(spendZonderLeads)} uitgegeven aan campagnes
      waarvan in deze periode geen enkele lead in het CRM staat — dat geld is niet "gratis verdwenen", het hoort bij
      leads van een andere maand of bij een routeringsgat.</p>` : ''}`;

  /* ── 2.4 Rendement per campagne — alleen wie opbrengsten mag zien. ── */
  let rendement = '';
  if(CRM.magOpbrengstZien()){
    const met = rijen.filter(r => r.geplaatst > 0);
    if(met.length){
      const rrijen = met.map(r => {
        let fee = 0, metFee = 0, dagen = [];
        for(const kr of r.rs.filter(rGeplaatst)){
          const f = feeVan(kr.cand);
          if(f.bedrag != null){ fee += f.bedrag; metFee++; }
          const d = dagenTussen(kr.lead.binnen_op, kr.cand.geplaatstOp);
          if(d != null && d >= 0) dagen.push(d);
        }
        return {...r, fee:Math.round(fee), metFee, netto:Math.round(fee - r.bedrag), dagen:gem(dagen)};
      });
      const feeTot = rrijen.reduce((x,r)=>x+r.fee,0), spendSel = rrijen.reduce((x,r)=>x+r.bedrag,0);
      rendement = `<div class="pf-rendement"><span class="label">Rendement per campagne</span>
        <div class="tblwrap"><table class="tbl pf-tbl"><thead><tr>
          <th>Campagne</th><th class="num">Geplaatst</th><th class="num">Fee</th>
          <th class="num">Uitgegeven</th><th class="num">Fee − spend</th><th class="num">Lead → plaatsing</th></tr></thead>
        <tbody>${rrijen.map(r => `<tr>
          <td><b>${h(r.naam)}</b>${r.metFee < r.geplaatst ? `<span class="meta"> · ${r.geplaatst - r.metFee} plaatsing${r.geplaatst-r.metFee===1?'':'en'} zonder fee (apart, telt niet als €0)</span>` : ''}</td>
          <td class="num">${r.geplaatst}</td>
          <td class="num">${r.metFee ? eurK(r.fee) : '—'}</td>
          <td class="num">${r.bedrag > 0 ? eurK(r.bedrag) : '—'}</td>
          <td class="num">${r.metFee && r.bedrag > 0 ? `<b>${r.netto >= 0 ? '+' : '−'}${eurK(Math.abs(r.netto))}</b>` : '—'}</td>
          <td class="num">${r.dagen != null ? `${r.dagen} dagen` : '—'}</td>
        </tr>`).join('')}</tbody></table></div>
        ${feeTot && spendSel ? `<p class="pf-uitleg meta">Elke euro advertentiegeld in deze selectie leverde tot nu toe
          ${(feeTot/spendSel).toFixed(1).replace('.',',')} euro aan fees op${loopt ? ` — en dat is een <b>voorlopige ondergrens</b>: ${loopt} van de ${t.binnen} leads uit deze periode ${loopt===1?'loopt':'lopen'} nog` : ''}.</p>` : ''}
      </div>`;
    } else {
      rendement = `<div class="pf-rendement"><span class="label">Rendement per campagne</span>
        <p class="pf-uitleg meta">Nog geen plaatsingen uit de leads van deze periode${loopt ? ` — ${loopt} ${loopt===1?'lead loopt':'leads lopen'} nog, dus dit is een tussenstand, geen eindstand` : ''}. ROAS: nog geen.</p></div>`;
    }
  }

  return `<div class="card"><div class="card-h"><div class="h2">Van campagne tot plaatsing</div>
      <span class="meta">${h(p.lbl)} · cohort op de maand van binnenkomst${loopt ? ` · <b>voorlopig</b> — ${loopt} ${loopt===1?'lead loopt':'leads lopen'} nog` : t.binnen ? ' · uitgewerkt' : ''}</span></div>
    <div class="card-b">
      ${aansluit}
      ${funnel}
      ${advOpv}
      <div class="pf-2zin">${tz.zin}</div>
      ${tabel}
      ${rendement}
      <p class="pf-uitleg meta">Stapdefinities: <b>bot-gekwalificeerd</b> = het oordeel van de WhatsApp-agent
        (Gekwalificeerd, Twijfelgeval of Potentieel andere vacature), los van wat de AM ervan vond.
        <b>Kandidaatkaart</b> = de lead is doorgeschoten (of een kaart wijst terug). <b>Geplaatst</b> telt
        alleen met een datum van tekenen — exact de definitie van het pijplijnbord (CRM.teltAlsPlaatsing),
        zodat dit blok nooit meer plaatsingen toont dan het bord. Dubbele aanmeldingen tellen nérgens mee.
        Klik op een trede voor de namen.</p>
    </div></div>`;
}

/* ═══ SAMENVATTING — één zin bovenaan, via de prioriteitsladder ══════
   (1) datakwaliteit stuk → dat eerst; (2) rood signaal open; (3) de
   vergelijkende campagne-zin; (4) te weinig data → wat er nog moet staan.
   Altijd een bedrag én een handeling; nooit een opgewekte zin terwijl
   trede 1 geldt. */
function blokSamenvatting(p, K){
  const {rijen} = campRijen(p, K);
  let zin = '', soort = '';

  /* Trede 1 — datakwaliteit. De routeringswacht eerst: een ongerouteerd
     formulier is exact het gat waardoor 129 Goodlife-leads buiten beeld
     bleven (aug 2026), dus dat wint van alles. */
  const gat = (_mkt && _mkt.routeringGaten || []).sort((a,b) => (b.leads_14d||0) - (a.leads_14d||0))[0];
  if(gat){
    zin = `Eerst de data: formulier ${h(gat.campagne || gat.form_id)} leverde ${gat.leads_14d} lead${gat.leads_14d===1?'':'s'} in veertien dagen maar hangt aan geen vacature — koppel hem bij Instellingen · Botformulieren, anders belandt deze instroom buiten elke telling.`;
    soort = 'warn';
  }
  const losGeld = (K.campagnes||[]).filter(c => c.hoe === 'niet' && c.bedrag > 0);
  const losBedrag = losGeld.reduce((s,c) => s + c.bedrag, 0);
  const zonderVac = (K.gaten.zonderVacature||[]).length;
  if(!zin && losBedrag > 0){
    zin = `Eerst de data: ${eurK(losBedrag)} aan uitgaven hangt aan ${losGeld.length === 1 ? 'een campagne die' : losGeld.length + ' campagnes die'} aan geen klant te koppelen ${losGeld.length === 1 ? 'is' : 'zijn'} — koppel ze bij Marketing · Rendement, anders rekent geen enkel €-getal hieronder eerlijk.`;
    soort = 'warn';
  } else if(!zin && zonderVac > 25){
    zin = `Eerst de data: ${zonderVac} Meta-leads hangen aan geen vacature — koppel de formulieren bij Instellingen · Botformulieren, dan gaan bestaande leads automatisch mee en klopt de verdeling per klant.`;
    soort = 'warn';
  }

  /* Trede 2 — rood signaal: veel leads, nul gekwalificeerd. */
  if(!zin){
    /* Hersteld nageleverde leads zijn nooit door de bot gesproken — hun
       0-kwalificatie telt niet als campagnesignaal. */
    const rood = rijen.find(r => (r.t.binnen - r.hersteld) >= 10 && r.t.gekwal === 0);
    if(rood){
      zin = `Rood signaal: <b>${h(rood.naam)}</b> leverde ${rood.t.binnen} leads en nog géén enkele gekwalificeerde${rood.bedrag > 0 ? ` voor ${eurK(rood.bedrag)}` : ''} — kijk vandaag naar het formulier of de doelgroep, of zet de campagne stil.`;
      soort = 'warn';
    }
  }

  /* Trede 3 — de vergelijkende zin. */
  if(!zin){
    const tz = tweeZinnen(rijen);
    if(tz.mee){ zin = tz.zin; soort = ''; }
  }

  /* Trede 4 — nog niet genoeg data om te vergelijken. */
  if(!zin){
    const grootste = rijen.filter(r => r.bedrag > 0).sort((a,b) => b.t.binnen - a.t.binnen)[0];
    zin = grootste
      ? `Nog te weinig om op te sturen: de grootste campagne (${h(grootste.naam)}) staat op ${grootste.t.binnen} van de 10 leads die nodig zijn voor een eerlijke vergelijking — nog ${Math.max(0, 10 - grootste.t.binnen)} te gaan.`
      : `Nog geen campagnedata in deze periode om op te sturen.`;
    soort = '';
  }
  return `<div class="pf-samenvatting${soort ? ' ' + soort : ''}">${zin}</div>`;
}

/* ═══ ANKERBALK — vier hoofdstukken in plaats van twaalf secties ════ */
const HOOFDSTUKKEN = [
  {id:'pf_h_koers',    lbl:'Koers'},
  {id:'pf_h_trechter', lbl:'Trechter'},
  {id:'pf_h_team',     lbl:'Team & maand'},
  {id:'pf_h_klanten',  lbl:'Klanten'}
];
const ankerBalk = () => `<nav class="pf-anker">${HOOFDSTUKKEN.map(hs =>
  `<button data-anker="${hs.id}">${hs.lbl}</button>`).join('')}</nav>`;
const hKop = (id, lbl, sub) => `<div class="pf-hkop" id="${id}"><span class="label">${lbl}</span>${
  sub ? `<span class="meta">${sub}</span>` : ''}</div>`;


function teken(mount, acties){
  const p = bereik(), D = cijfers(p), K = ketenIndex();

  if(acties) acties.innerHTML = kiezerHTML(p);

  /* Omgekeerd eigen bereik gaf een scherm vol nullen zonder uitleg. */
  const omgekeerd = p.van > p.tot;

  /* Vier ankerhoofdstukken in plaats van twaalf losse secties (3 sep 2026):
     Koers (waar staan we op het jaar), Trechter (van campagne tot
     plaatsing), Team & maand, Klanten. */
  mount.innerHTML = `<div class="pf">
    ${omgekeerd ? `<div class="note warn">De begindatum (${h(CRM.fmtDate(p.van))}) ligt ná de einddatum
      (${h(CRM.fmtDate(p.tot))}), dus er valt niets binnen deze periode. Draai de datums om.</div>` : ''}
    ${blokSamenvatting(p, K)}
    ${ankerBalk()}
    ${hKop('pf_h_koers','Koers','het jaardoel en wat ervoor nodig is')}
    ${blokBasis()}
    ${blokJaar()}
    ${blokNaar()}
    ${blokDoel(_fin)}
    ${hKop('pf_h_trechter','Trechter','van campagne-binnenkomst tot plaatsing — wat kost een plaatsing en wat werkt')}
    ${hoofdstukTrechter(p, K)}
    ${hKop('pf_h_team','Team & maand','plaatsingen, tempo, recruiters en uitval')}
    ${blokPlaatsingen(p, D)}
    ${blokTrend()}
    ${blokRecruiters(p, D)}
    ${blokUitval(p, D)}
    ${hKop('pf_h_klanten','Klanten','wie draagt het jaar')}
    ${blokKlanten(_fin)}
    ${blokOmzet(p, _fin)}
  </div>`;

  /* Ankerbalk en funnel-drilldown. */
  CRM.$$('[data-anker]', mount).forEach(b => b.onclick = () => {
    const doel = mount.querySelector('#' + b.dataset.anker);
    if(doel) doel.scrollIntoView({behavior:'smooth', block:'start'});
  });
  CRM.$$('[data-trstap]', mount).forEach(rij => rij.onclick = () => {
    trOpen = trOpen === rij.dataset.trstap ? '' : rij.dataset.trstap;
    teken(mount, acties);
  });

  /* Doel instellen / aanpassen */
  const dz = mount.querySelector('#pf_doelzetten');
  if(dz) dz.onclick = () => doelModal(mount, acties);
  const ds = mount.querySelector('#pf_doelzet');
  if(ds) ds.onclick = async () => {
    const bedrag = Number(mount.querySelector('#pf_doelbedrag').value);
    if(!bedrag || bedrag <= 0) return CRM.toast('Vul een bedrag in','err');
    if(await doelOpslaan(bedrag, mount.querySelector('#pf_doeldatum').value || '')) teken(mount, acties);
  };

  /* Periodekiezer */
  if(acties){
    CRM.$$('[data-per]', acties).forEach(b => b.onclick = () => {
      periode = b.dataset.per; teken(mount, acties);
    });
    const van = document.getElementById('pf_van'), tot = document.getElementById('pf_tot');
    if(van) van.onchange = () => { eigenVan = van.value; teken(mount, acties); };
    if(tot) tot.onchange = () => { eigenTot = tot.value; teken(mount, acties); };
  }

  /* Sorteren */
  CRM.$$('[data-rs]', mount).forEach(th => th.onclick = () => {
    const k = th.dataset.rs;
    recSort = {k, dir: recSort.k===k ? -recSort.dir : (k==='naam' ? 1 : -1)};
    teken(mount, acties);
  });
  CRM.$$('[data-ks]', mount).forEach(th => th.onclick = () => {
    const k = th.dataset.ks;
    klantSort = {k, dir: klantSort.k===k ? -klantSort.dir : (k==='naam' ? 1 : -1)};
    teken(mount, acties);
  });
  CRM.$$('[data-klant]', mount).forEach(tr => tr.onclick = () => CRM.ga('klanten', {id:tr.dataset.klant}));
  CRM.$$('[data-pfkand]', mount).forEach(b => b.onclick = () => CRM.ga('kandidaten', {id:b.dataset.pfkand}));

  /* Per klant: eigen venster, eigen bron, en de rangschikking in- of
     uitklappen. Het venster staat los van de periodekiezer bovenaan —
     zie de toelichting bij klantVensterInfo(). */
  CRM.$$('[data-kv]', mount).forEach(b => b.onclick = () => {
    klantVenster = b.dataset.kv; klantAlles = false; teken(mount, acties);
  });
  CRM.$$('[data-kb]', mount).forEach(b => b.onclick = () => {
    klantBron = b.dataset.kb; klantAlles = false; teken(mount, acties);
  });
  const meer = mount.querySelector('#pf_klmeer');
  if(meer) meer.onclick = () => { klantAlles = !klantAlles; teken(mount, acties); };
  /* "Hoe staan we ervoor dit jaar" en "welke klanten dragen daaraan bij"
     zijn dezelfde vraag. Deze knop zet het klantvenster op dit jaar en
     brengt je erheen, zodat je niet zelf hoeft te schakelen. */
  const jk = mount.querySelector('#pf_jrklant');
  if(jk) jk.onclick = () => {
    klantVenster = 'jaar'; klantAlles = false;
    teken(mount, acties);
    const doel = mount.querySelector('.pf-klant');
    if(doel) doel.scrollIntoView({block:'start'});
  };

  /* Financiële data nalezen — alleen voor Tjeerd. Eén keer laden (cache),
     daarna opnieuw tekenen zodat Doel, Per klant en Omzet gevuld zijn. */
  if(CRM.canSeeMoney() && !_fin){
    finLezen().then(() => { if(CRM.view === 'performance') teken(mount, acties); }).catch(()=>{});
  }
  /* De commerciële afspraken zijn de helft van elke fee. Staan ze er nog
     niet (je bent direct op Performance binnengekomen), dan halen we ze
     alsnog op en tekenen we opnieuw. */
  zorgAfspraken(() => { if(CRM.view === 'performance') teken(mount, acties); });
  /* Advertentiekosten (mkt_meta_stats + campagne→klant) — één keer laden,
     daarna opnieuw tekenen zodat de €-kolommen in de Trechter gevuld zijn. */
  mktLezen(() => { if(CRM.view === 'performance') teken(mount, acties); });
}

CRM.registerModule('performance', {
  title:'Performance', icon:'▲', onderschrift:'Prestaties en cijfers',
  render(mount, acties){ teken(mount, acties); }
});

})();

/* VERZOEK AAN CORE: vier dingen die Performance nu zelf moet omzeilen.
   Alle vier komen uit de doorlichting van 2 aug 2026 ("de cijfers kloppen
   niet, veel staat op 0"). Ze zijn hier opgelost binnen deze module, maar
   ze raken meer schermen dan dit.

   1. CRM.jaarTarget() geeft stilzwijgend de standaard 75 terug als er geen
      rij in `targets` staat. Elk scherm dat daarmee rekent presenteert die
      noodwaarde als een afgesproken doel — en op Performance hangt het halve
      blok "Op weg naar 75" eraan (bruto nodig, weektempo, omzet bij het
      doel). Dit bestand leest daarom zelf CRM.state.targets na om te kunnen
      zeggen "dit is de standaardwaarde". Mooier: CRM.plaatsingenJaar() geeft
      een veld `doelGezet` terug, dan hoeft niemand die tabel meer te kennen.
      (De lege staat "Geen jaardoel ingesteld" in blokJaar() is om diezelfde
      reden onbereikbaar geworden.)

   2. CRM.plaatsingenMaand() en CRM.plaatsingenJaar() vergelijken fases nog
      rechtstreeks: `c.fase === 'Gestopt'` en `CRM.PLACED.includes(c.fase)`.
      Dat gaat vandaag goed omdat geen enkele alias die twee raakt, maar het
      is precies het patroon dat §4 van de bouwafspraken verbiedt. Zodra er
      ooit een alias voor 'Gestart' of 'Gestopt' bij komt, wijkt het bord af
      van elk scherm dat wél CRM.faseIs/faseIn gebruikt. Graag omzetten.

   3. OPGELOST (3 sep 2026): `crm_leads.kandidaat_id` wordt bij het
      doorschieten gevuld en de meting loopt via CRM.leadDoor (beide
      richtingen). De stap lead → kandidaatkaart is nu te meten.

   4. Er is geen veld "voorgesteld op". Performance leidt die datum af uit de
      eerste historieregel met fase 'Voorgesteld' en valt anders terug op de
      instroomdatum — dat staat zichtbaar onder de klanttabel, maar het blijft
      een aanname. Een kolom `voorgesteld_op` op candidates zou het echt
      maken.                                                                */
