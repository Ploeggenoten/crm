/* ═══════════════════════════════════════════════════════════════
   MODULE: MARKETING
   Wat levert het marketinggeld op, en wat moet er vandaag gebeuren?
   Vijf rustige weergaven:
     1. Prestatie — Meta-advertenties + waakhond-adviezen
     2. Rendement — cohorten: wat leverden de leads van maand X op?
     3. Content   — gepland, gepubliceerd, geleerd + het werk dat openstaat
     4. Kanalen   — waar posten we, met welk weekdoel, en werkt dat
     5. Vacatures — wat moet er nog online, en wat krijgt geen instroom?
   Bron: de bestaande mkt_*-tabellen, dezelfde database als het
   marketingbord. Schrijven doen we alleen waar dat het werk echt
   vooruit helpt: besluiten, kanalen en taken. De composer,
   media-upload, automatisch publiceren en de AI-prompts blijven in het
   marketingbord — die dupliceren we hier bewust niet.

   WAT ER OP 31 JUL 2026 AF IS GEGAAN, en waarom (Tjeerd: "als je iets
   toevoegt, moet er iets af"):
   · Het tabblad Ideeën — weekthema's, ideeënbank, afkijkbank en de
     spieklijst. Dat was vaste, met de hand geschreven inspiratie die
     nooit meebewoog met de data; de afkijkbank noemde zichzelf zelfs
     "trend van nú" en verouderde dus vanzelf. Bedenken en schrijven
     hoort in het marketingbord, sturen hoort hier. De weekthema's
     staan als configregel in mkt_ad_besluiten en worden daar beheerd.
   · De tabel "Per klant" op Prestatie. Rendement heeft ook een tabel
     "Per klant", met betere cijfers (echte CRM-leads en plaatsingen in
     plaats van Meta's leadacties). Twee tabellen met dezelfde naam en
     andere uitkomsten is precies hoe een dashboard ongeloofwaardig
     wordt. Filteren op klant kan nog steeds, via de filterbalk.
   · Kliks, CPC, CTR en impressies uit de tabellen. Die cijfers zijn
     bekend onbetrouwbaar (de synchronisatie rekent met álle kliks in
     plaats van doorkliks) en stonden vier keer op één scherm. Ze staan
     nu nog op één plek: het kengetal bovenaan, met de kanttekening
     eronder. De waakhond blijft er wél mee signaleren — daar is het
     een signaal, geen stuurgetal.
   · De regel "grootste weglek" onder de trechter. Vervangen door
     "Advertentie of opvolging?", dat dezelfde vraag beter beantwoordt.

   Advertentiekosten zijn niet vertrouwelijk: het hele team ziet de
   uitgaven, budgetten en de kosten per lead. Eén weergave dus, geen
   rechtenpoort. Fee, marge, omzet en factuurbedragen komen uit de
   fin_*-tabellen, worden hier niet gelezen, en blijven in Finance en
   Performance achter CRM.canSeeMoney() staan.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const h = CRM.h;
  const BORD       = 'https://ploeggenoten.github.io/marketingbord/';
  const ADSMANAGER = 'https://adsmanager.facebook.com/adsmanager/manage/ads';

  const M = {
    geladen:false, bezig:null,      // bezig = de lopende laad-belofte
    meta:[], besluiten:[], posts:[], kanalen:[], taken:[], betaald:[], campKlant:[],
    metaFout:null, postsFout:null, kanalenFout:null, takenFout:null, betaaldFout:null, isDemo:false,
    tab:'prestatie', periode:30,
    /* Prestatie-filters. `periode` is het venster in dagen (0 = alles),
       `groep` de tijdstap waarop we optellen en `klant` het klantfilter
       ('' = alle klanten, '__niet__' = uitgaven zonder herkenbare klant). */
    groep:'dag', klant:'', herkomst:false,
    _idx:null, _zicht:null,         // index van één render; leeg bij elke teken()
    open:new Set(),                 // uitgeklapte campagnes/advertentiesets
    /* Rendement-tab: welk cohort staat er open, hoe staan de tabellen
       gesorteerd, en de lijstjes achter de doorklikknoppen. */
    cohort:'', kSort:{k:'spend', dir:-1}, vSort:{k:'spend', dir:-1},
    drill:new Map(), uitleg:false,
    lbQ:'', lbK:'',                 // zoek + kanaalfilter in de learnings-bibliotheek
    vacAlles:false,                 // Vacatures: ook de vacatures tonen die alles hebben
    badge:0, mount:null, actiesEl:null
  };

  /* ─── Kleine helpers ──────────────────────────────────────── */
  const N     = n => Number(n)||0;
  const fmtN  = n => Math.round(N(n)).toLocaleString('nl-NL');
  const maal  = (a,b) => (b ? (a/b) : 0).toFixed(1).replace('.',',');
  const isoT  = d => new Date(Date.now() - d*864e5).toLocaleDateString('sv-SE');
  /* De eerste dag van een venster van n dagen, vandaag meegerekend. Filters
     doen `datum >= vanaf(n)`, dus vanaf(7) moet zes dagen terug liggen: met
     isoT(7) zaten er acht dagen in een venster dat "zeven dagen" heette. Dat
     maakte elk weekcijfer stilletjes te hoog. */
  const vanaf = n => isoT(Math.max(0, n - 1));
  const DAGKORT = ['zo','ma','di','wo','do','vr','za'];
  const DAGNAAM = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];

  /* veiligeUrl() stond hier voor de spieklijst op het tabblad Ideeën. Dat
     tabblad is weg en er gaat op dit scherm geen adres uit de database meer in
     een href, dus de poort is met de deur mee verdwenen. Komt er ooit weer een
     link uit gebruikersinvoer, zet hem dan terug (zie kandidaten.js).

     Kanaalkleuren zijn wél gebruikersinvoer — ze komen uit een kleurkiezer in
     het marketingbord en gaan als inline stijl het scherm op. Alleen een echte
     hexkleur mag erdoor; de rest valt terug op een token uit base.css, zodat
     niemand via de database eigen CSS de app in schrijft. */
  const veiligeKleur = k => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(k||'').trim())
    ? String(k).trim() : 'var(--line-2)';

  function stat(rows){
    /* `rijen` = het aantal dagregels waarop dit cijfer rust. Dat is geen
       sierletter: het is wat je nodig hebt om een kengetal met de hand na te
       rekenen tegen de onderliggende tabel. */
    const s = {spend:0, imp:0, kliks:0, leads:0, bereik:0, rijen:rows.length};
    rows.forEach(r => { s.spend+=N(r.uitgegeven); s.imp+=N(r.impressies);
                        s.kliks+=N(r.kliks); s.leads+=N(r.leads); s.bereik+=N(r.bereik); });
    s.cpc = s.kliks ? s.spend/s.kliks : null;
    s.ctr = s.imp   ? s.kliks/s.imp*100 : null;
    s.cpl = s.leads ? s.spend/s.leads : null;
    return s;
  }
  /* ─── Filters op de advertentiecijfers ────────────────────────
     Twee assen: een venster in dagen en een klant. De klant hangt aan de
     campagnenaam — in het Meta-account ís een campagne een klant. Die
     koppeling maken we niet opnieuw: ketenData() legt hem één keer per
     render aan (campKoppel) en we kijken hem hier alleen op. */
  const campNaam = r => String(r.campagne||'').trim() || '(campagne zonder naam)';
  const klantVan = r => index().campKoppel.get(campNaam(r)) || {kkey:'', klant:'', hoe:'niet'};
  const isDatum  = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d||''));

  const vensterVanaf = () => M.periode ? vanaf(M.periode) : '';
  const inVenster    = r => { const c = vensterVanaf(); return !c || String(r.datum||'') >= c; };
  const inKlant      = r => {
    if(!M.klant) return true;
    const kk = klantVan(r).kkey;
    return M.klant === '__niet__' ? !kk : kk === M.klant;
  };
  /* Alleen op klant gefilterd: voor blokken met hun eigen vaste venster
     (de weekvergelijking, de waakhond). */
  const klantRijen = () => M.klant ? M.meta.filter(inKlant) : M.meta;
  /* Venster én klant: alles wat de gekozen periode toont. Vier blokken vragen
     er per render om (kengetallen, grafiek, klanten, campagnes); ze horen
     gegarandeerd dezelfde rijen te krijgen, dus filteren we één keer. */
  function zichtbareRijen(){
    const sleutel = M.periode + '|' + M.klant;
    if(!M._zicht || M._zicht.sleutel !== sleutel)
      M._zicht = {sleutel, rijen:M.meta.filter(r => inVenster(r) && inKlant(r))};
    return M._zicht.rijen;
  }

  /* ─── Tijdstappen ─────────────────────────────────────────────
     `datum` is een date-kolom zonder tijdzone; we lezen hem altijd op 12:00
     lokaal, zodat een dag nooit over de rand van een tijdzone schuift. */
  const maandagVan = d => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() - ((x.getDay()+6) % 7));
                            return x.toLocaleDateString('sv-SE'); };
  function weekNr(d){
    /* ISO-weeknummer: donderdag van dezelfde week bepaalt het jaar. */
    const x = new Date(d + 'T12:00');
    x.setDate(x.getDate() + 3 - ((x.getDay()+6) % 7));
    const eerste = new Date(x.getFullYear(), 0, 4, 12);
    return 1 + Math.round((x - eerste) / 864e5 / 7);
  }
  const MND_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const dagLabel = d => { const x = new Date(d + 'T12:00');
                          return `${x.getDate()} ${MND_KORT[x.getMonth()]}`; };
  const GROEP = {
    dag:  {enkel:'dag',  meer:'dagen',   titel:'Per dag',
           sleutel: d => d, staven:31,
           lang:  k => `${DAGNAAM[new Date(k+'T12:00').getDay()]} ${dagLabel(k)}`,
           kort:  k => String(new Date(k+'T12:00').getDate()),
           onder: k => DAGKORT[new Date(k+'T12:00').getDay()]},
    week: {enkel:'week', meer:'weken',   titel:'Per week',
           sleutel: maandagVan, staven:26,
           lang:  k => { const e = new Date(k+'T12:00'); e.setDate(e.getDate()+6);
                         return `week ${weekNr(k)} · ${dagLabel(k)} t/m ${dagLabel(e.toLocaleDateString('sv-SE'))}`; },
           kort:  k => String(weekNr(k)),
           onder: () => 'wk'},
    maand:{enkel:'maand',meer:'maanden', titel:'Per maand',
           sleutel: d => d.slice(0,7), staven:24,
           lang:  k => maandLabel(k),
           kort:  k => MND_KORT[Number(k.slice(5,7)) - 1] || '?',
           onder: k => k.slice(2,4)}
  };
  const groep = () => GROEP[M.groep] || GROEP.dag;

  /* Campagnes, sets en advertenties staan op uitgaven gesorteerd: de
     grootste post bovenaan, zodat de volgorde klopt met de eerste
     cijferkolom. */
  const opWaarde = (a,b) => stat(b.rows).spend - stat(a.rows).spend;

  /* Verschil met richting. Positief = olijf, negatief = rood (CRM.plusMin).
     Bij kosten per lead is lager juist beter, dus draaien we het teken om
     vóórdat de kleur gekozen wordt. Neutraal = geen kleur: een cijfer dat
     op zichzelf niet goed of slecht is (zoals uitgegeven budget). */
  function verschil(nieuw, oud, fmt, richting){
    if(!oud) return `<span class="meta">vorige week nog niets om mee te vergelijken</span>`;
    const v = nieuw - oud;
    if(Math.abs(v) < 0.005) return `<span class="meta">gelijk aan vorige week</span>`;
    const tekst = (v > 0 ? '+' : '−') + fmt(Math.abs(v));
    const cijfer = richting === 'neutraal'
      ? `<span class="num">${tekst}</span>`
      : CRM.plusMin(richting === 'lager' ? -v : v, () => tekst);
    return `${cijfer} <span class="meta">vs ${fmt(oud)}</span>`;
  }

  /* ═══ 1. DATA ════════════════════════════════════════════════ */
  async function veilig(q){
    try{
      const r = await q;
      if(r.error) return {rows:[], fout:r.error};
      return {rows:r.data||[], fout:null};
    }catch(e){ return {rows:[], fout:e}; }
  }
  /* hook, doel en learnings stonden wel in mkt_posts maar werden hier niet
     ingelezen. Zonder learnings is er geen bibliotheek en zonder hook kan
     "Wat werkt" niet zien of cijfers in de eerste zin bij jullie aanslaan. */
  function rowToPost(r){
    return { id:r.id, titel:r.titel||'', kanaal:r.kanaal||'', format:r.format||'',
      fase:r.fase||'Idee', vacature:r.vacature||'', campagne:r.campagne||'',
      doel:r.doel||'', hook:r.hook||'', learnings:r.learnings||'',
      datum:r.publicatie_datum||'', tijd:r.publicatie_tijd||'', link:r.link||'',
      resultaat:(r.resultaat && typeof r.resultaat==='object') ? r.resultaat : {} };
  }

  /* Eén laadronde tegelijk, en wie er tussendoor om vraagt krijgt dezelfde
     belofte terug. Zonder dat wachtwoord kreeg een tweede render een meteen
     vervulde belofte en tekende hij de lege staat over de laadtekst heen —
     een flits "nog geen Meta-data" terwijl de cijfers onderweg waren. */
  function laad(){
    if(M.bezig) return M.bezig;
    M.bezig = (async () => {
      if(CRM.demo){
        demoData(); M.isDemo = true; M.geladen = true; telBadge(); return;
      }
      /* mkt_meta_betaald is het maandtotaal dat Finance uit de banktransacties
         herkent en wegschrijft — één getal per maand, leesbaar voor het hele
         team. De banktransacties zelf (fin_bank_tx en alle andere fin_-tabellen)
         raken we niet aan en mogen we ook niet lezen; die blijven bij Finance. */
      const [a,b,c,d,e,f,g] = await Promise.all([
        veilig(CRM.sb.from('mkt_meta_stats').select('*').order('datum',{ascending:false}).limit(3000)),
        veilig(CRM.sb.from('mkt_ad_besluiten').select('*').order('created_at',{ascending:false})),
        veilig(CRM.sb.from('mkt_posts').select('*')),
        veilig(CRM.sb.from('mkt_kanalen').select('*').order('volgorde')),
        veilig(CRM.sb.from('mkt_taken').select('*').order('datum').order('created_at')),
        veilig(CRM.sb.from('mkt_meta_betaald').select('*').order('maand',{ascending:false})),
        /* Handmatige overschrijving voor campagnes die de automatische
           matching niet herkent (koppelCampagne in ketenData) — zie
           schema.sql 7f. Ontbreekt de tabel nog (migratie niet gedraaid),
           dan degradeert de app netjes: gewoon geen overschrijvingen. */
        veilig(CRM.sb.from('mkt_campagne_klant').select('*'))
      ]);
      M.meta = a.rows; M.metaFout = a.fout;
      M.besluiten = b.rows;
      M.posts = c.rows.map(rowToPost); M.postsFout = c.fout;
      M.kanalen = d.rows; M.kanalenFout = d.fout;
      M.taken = e.rows; M.takenFout = e.fout;
      M.betaald = f.rows; M.betaaldFout = f.fout;
      M.campKlant = g.rows;
      M.geladen = true;
      telBadge();
    })();
    return M.bezig;
  }

  /* Een tabel die niet gelezen kan worden is iets anders dan een tabel die
     leeg is. Dat verschil moet je zien, anders zit je te wachten op een
     synchronisatie die allang draait. */
  function foutBlok(wat, fout){
    const m = String(fout?.message || fout || '');
    const mist = /does not exist|schema cache|relation/i.test(m);
    return `<div class="note err" style="margin-bottom:18px">
      <b>${h(wat)} konden niet geladen worden.</b>
      ${mist
        ? ' De tabel bestaat nog niet in de database. Die wordt door het marketingbord aangemaakt — draai daar het schema, dan verschijnen de cijfers hier vanzelf.'
        : ' Herlaad de pagina. Blijft dit staan, dan mag dit account de marketingtabellen niet lezen en moet dat in Supabase goedgezet worden.'}
      ${m ? `<span class="meta" style="display:block;margin-top:5px">Technische melding: ${h(m)}</span>` : ''}</div>`;
  }
  /* De teller in de zijbalk telt alleen werk dat op déze persoon wacht:
     advertentie-adviezen, posts zonder resultaat, open taken en de vacatures
     die nog op de website moeten. Vacatures zonder content of advertentie
     staan er bewust níét bij — dat is een afleiding op namen (zie
     vacatureWerk) en te zwak om iemand elke dag een cijfer voor te geven. */
  function telBadge(){
    try{
      M.badge = adviezen().length + agentAdviezen().length + nagPosts().length
              + openTaken().length + vacatureWerk().online.length;
    }
    catch(e){ M.badge = 0; }
    CRM.navBadges();
  }

  /* ═══ 2. WAAKHOND ════════════════════════════════════════════ */
  /* Adviseert, jij beslist. Een genomen besluit (mkt_ad_besluiten) verbergt
     het advies 14 dagen — zo blijft alleen open werk staan. Eén besluit is
     de uitzondering: "stopzetten". Dat verbergen we juist niet, want het
     stopt hier op het scherm en niet in Ads Manager. Zolang er nog geld
     doorheen loopt blijft de advertentie op de lijst staan. */
  const configRij = b => String(b.advertentie||'').startsWith('__');
  function openBesluit(ad, camp){
    return M.besluiten.find(b => {
      if(configRij(b)) return false;
      if(String(b.advertentie||'') !== ad) return false;
      if(b.campagne && b.campagne !== camp) return false;
      return (b.status||'open') === 'open';
    }) || null;
  }
  /* Adviezen die de mediabuyer-agent zelf in de tabel heeft gezet. Die stonden
     hier tot nu toe ongelezen in de database: de agent schrijft ze, maar het
     CRM liet ze niet zien. */
  function agentAdviezen(){
    return M.besluiten.filter(b => ['advies','budget'].includes(b.besluit)
      && (b.status||'open') === 'open' && !configRij(b));
  }

  /* `rijen` is standaard álles: de badge en het tabblad tellen de adviezen
     van het hele account. Het scherm geeft de op klant gefilterde rijen mee,
     zodat een klantfilter ook hier doorwerkt. De vergelijkingsmaatstaf (acc)
     blijft bewust accountbreed — "duurder dan gemiddeld" moet het gemiddelde
     van álle advertenties zijn, niet dat van één klant. */
  function adviezen(rijen){
    if(!M.meta.length) return [];
    if(!rijen) rijen = M.meta;
    const d2 = vanaf(2), d7 = vanaf(7), d14 = vanaf(14);
    const acc = stat(M.meta.filter(r => (r.datum||'') >= vanaf(30)));
    const perAd = new Map();
    rijen.forEach(r => {
      const k = (r.campagne||'—') + '|' + (r.advertentie||'—');
      if(!perAd.has(k)) perAd.set(k, []);
      perAd.get(k).push(r);
    });
    const uit = [];
    for(const [k, rows] of perAd){
      const [campagne, advertentie] = k.split('|');
      const b = openBesluit(advertentie, campagne);
      if(b && b.besluit === 'stop'){
        /* Nog uitgaven ná het stopbesluit = hij staat gewoon nog aan. Dat is
           rood: er lekt geld weg terwijl iedereen denkt dat het geregeld is. */
        const s2  = stat(rows.filter(r => (r.datum||'') >= d2));
        const wie = b.door === 'Claude-agent' ? 'de agent' : (b.door || 'iemand');
        const nog = s2.spend > 1;
        uit.push({
          kleur: nog ? 'red' : 'green',
          titel: nog ? 'Nog niet stopgezet in Ads Manager' : 'Stop bevestigd — geen uitgaven meer',
          uitleg: (nog
            ? `Door ${wie} gemarkeerd om te stoppen, maar er ging de afgelopen twee dagen nog ${CRM.euro(s2.spend,2)} doorheen. Zet hem uit in Ads Manager.`
            : `Door ${wie} gemarkeerd om te stoppen en de laatste twee dagen ${CRM.euro(0,2)} uitgegeven. Rond hem af.`)
            + (b.note ? ` Reden: ${b.note}` : ''),
          cijfers: '',
          campagne, advertentie, keuzes: nog ? ['adsmanager'] : ['afronden'], besluitId: b.id
        });
        continue;
      }
      /* Alleen een besluit van een mens verbergt het advies: "prima zo" of
         "opschalen". Een advies dat de agent zelf in de tabel zette telt niet
         mee — anders zou één budgetnotitie de waakhond veertien dagen laten
         zwijgen over een advertentie die ondertussen ontspoort.
         Zonder leesbare datum kunnen we niet weten of die veertien dagen om
         zijn; dan laten we het advies liever staan dan het voorgoed te
         verbergen. */
      if(b && ['negeer','opschalen'].includes(b.besluit)){
        const dagen = CRM.dagenGeleden(b.created_at);
        if(dagen != null && dagen < 14) continue;
      }
      const s7   = stat(rows.filter(r => (r.datum||'') >= d7));
      const sVor = stat(rows.filter(r => (r.datum||'') >= d14 && (r.datum||'') < d7));
      /* Expliciet dertig dagen. `rows` bevat de hele historie die we van Meta
         inlazen (tot 3000 dagregels); daarmee vergelijken zou de CPC van deze
         week afzetten tegen een gemiddelde van vorig kwartaal. */
      const s30  = stat(rows.filter(r => (r.datum||'') >= vanaf(30)));
      if(s7.spend < 20) continue;                        // te weinig om over te oordelen
      const cijfers = `7 dagen: ${CRM.euro(s7.spend)} · ${s7.leads} ${s7.leads===1?'lead':'leads'}`
        + (s7.cpl ? ` · ${CRM.euro(s7.cpl,2)} per lead` : '')
        + (s7.cpc ? ` · CPC ${CRM.euro(s7.cpc,2)}` : '')
        + (s7.ctr!=null ? ` · CTR ${CRM.pct(s7.ctr,2)}` : '');
      const A = (kleur, titel, uitleg, keuzes) =>
        uit.push({kleur, titel, uitleg, cijfers, campagne, advertentie, keuzes});

      if(s7.leads === 0 && s7.spend >= 25){
        A('red','Geld op, geen enkele lead',
          `${CRM.euro(s7.spend)} in zeven dagen zonder één lead.`, ['stop','negeer']); continue;
      }
      if(s7.cpc && s30.cpc && s7.cpc > 1.5*s30.cpc){
        A('amber','CPC loopt op — de creative slijt',
          `CPC ${CRM.euro(s7.cpc,2)} tegen ${CRM.euro(s30.cpc,2)} eigen 30-daags gemiddelde. Zet er een verse variant naast.`, ['stop','negeer']); continue;
      }
      if(s7.ctr!=null && acc.ctr && s7.ctr < 0.6*acc.ctr){
        A('amber','CTR blijft achter',
          `CTR ${CRM.pct(s7.ctr,2)} tegen ${CRM.pct(acc.ctr,2)} gemiddeld — de advertentie pakt niet.`, ['stop','negeer']); continue;
      }
      if(sVor.spend > 0 && s7.spend > 0.8*sVor.spend && sVor.bereik > 0 && s7.bereik < 0.6*sVor.bereik){
        A('amber','Bereik zakt bij gelijk budget',
          `${fmtN(s7.bereik)} bereik tegen ${fmtN(sVor.bereik)} vorige week — het publiek raakt verzadigd.`, ['stop','negeer']); continue;
      }
    }

    /* ── Campagneniveau: sturen op CPQL, niet op rauwe leads (3 sep 2026).
       Een lead kost geld, maar alleen een bot-gekwalificeerde lead is
       materiaal — dus de prijs-signalen ("uit de bocht" en "winnaar")
       rekenen sindsdien per gekwalificeerde lead. Dat kan alleen op
       campagneniveau: het CRM weet per lead de campagne, niet de
       advertentie. De leverings-signalen (CPC, CTR, bereik) blijven
       hierboven op advertentieniveau staan. */
    const D = index();
    const dag7 = CRM.todayISO(); const d7grens = vanaf(7), d30grens = vanaf(30);
    const perCampK = new Map();
    for(const r of D.leads){
      const naam = String(r.lead.campagne||'').trim();
      if(!naam || !r.dk) continue;
      /* Hersteld nageleverde leads (rauwe inloop, 3 sep 2026) zijn nooit
         door de bot gesproken: hun 0-kwalificatie zegt niets over de
         campagne, dus buiten alle bot-signalen. */
      if(/^hersteld/i.test(String(r.lead.kwalificatie||''))) continue;
      if(!perCampK.has(naam)) perCampK.set(naam, {l7:0, g7:0, l30:0, g30:0});
      const c = perCampK.get(naam);
      if(r.dk >= d30grens){ c.l30++; if(r.gekwal) c.g30++; }
      if(r.dk >= d7grens){  c.l7++;  if(r.gekwal) c.g7++; }
    }
    const spendCamp = (naam, vanafDag) => M.meta
      .filter(r => campNaam(r) === naam && (r.datum||'') >= vanafDag)
      .reduce((x,r) => x + N(r.uitgegeven), 0);
    /* Eigen norm (geen branchecijfers): account-CPQL over 30 dagen. */
    let accG30 = 0, accS30 = 0;
    for(const [naam, c] of perCampK){ accG30 += c.g30; }
    accS30 = M.meta.filter(r => (r.datum||'') >= d30grens).reduce((x,r) => x + N(r.uitgegeven), 0);
    const accCpql = accG30 >= 5 && accS30 > 0 ? accS30 / accG30 : null;

    /* Zelfde besluit-mechaniek als de advertentieregels: 'negeer' dempt
       veertien dagen, een 'stop' waar nog geld doorheen gaat wordt door de
       stop-check hierboven níet gezien (die loopt per advertentie), dus die
       blijft hier gewoon als advies staan tot de campagne echt uit is. */
    const campGedempt = naam => {
      const b = openBesluit('(hele campagne)', naam);
      if(!b || !['negeer','opschalen'].includes(b.besluit)) return false;
      const dagen = CRM.dagenGeleden(b.created_at);
      return dagen != null && dagen < 14;
    };
    const AC = (kleur, titel, uitleg, cijfers, campagne, keuzes) => {
      if(campGedempt(campagne)) return;
      uit.push({kleur, titel, uitleg, cijfers, campagne, advertentie:'(hele campagne)', keuzes});
    };
    for(const [naam, c] of perCampK){
      const s7c = spendCamp(naam, d7grens);
      /* S2: er komt volume binnen maar de bot keurt álles af — dat is geen
         pechweek, dat is de verkeerde doelgroep of het verkeerde formulier. */
      if(c.l30 >= 10 && c.g30 === 0){
        AC('red','Veel leads, nul gekwalificeerd',
          `${c.l30} leads in dertig dagen en de bot kwalificeerde er geen één${s7c ? ` — terwijl er deze week ${CRM.euro(s7c)} doorheen ging` : ''}. Kijk naar de doelgroep of het formulier, of zet de campagne stil.`,
          `30 dagen: ${c.l30} leads · 0 gekwalificeerd`, naam, ['stop','negeer']);
        continue;
      }
      if(s7c < 20) continue;
      const cpql7 = c.g7 > 0 ? s7c / c.g7 : null;
      if(accCpql && cpql7 && cpql7 > 2.5*accCpql && c.l7 >= 5){
        AC('red','Prijs per gekwalificeerde lead uit de bocht',
          `${CRM.euro(cpql7,2)} per gekwalificeerde lead tegen ${CRM.euro(accCpql,2)} als eigen accountgemiddelde (${maal(cpql7, accCpql)}× zo duur).`,
          `7 dagen: ${CRM.euro(s7c)} · ${c.l7} leads · ${c.g7} gekwalificeerd`, naam, ['stop','negeer']);
        continue;
      }
      if(accCpql && cpql7 && cpql7 < 0.6*accCpql && c.g7 >= 3){
        AC('green','Winnaar — overweeg op te schalen',
          `${CRM.euro(cpql7,2)} per gekwalificeerde lead, ver onder het eigen gemiddelde van ${CRM.euro(accCpql,2)}.`,
          `7 dagen: ${CRM.euro(s7c)} · ${c.g7} gekwalificeerd`, naam, ['opschalen','negeer']);
      }
    }

    /* S1: de vacature is dicht maar de campagne loopt door — elke euro
       daarna werft voor een plek die er niet meer is. De vacature van een
       campagne = waar haar leads naartoe gerouteerd worden. */
    const vacVanCamp = new Map();
    for(const r of D.leads){
      const naam = String(r.lead.campagne||'').trim();
      const vid = String(r.lead.vacature_id||'').trim();
      if(!naam || !vid) continue;
      if(!vacVanCamp.has(naam)) vacVanCamp.set(naam, new Map());
      const m2 = vacVanCamp.get(naam);
      m2.set(vid, (m2.get(vid)||0) + 1);
    }
    for(const [naam, telling] of vacVanCamp){
      const vid = [...telling].sort((a,b) => b[1]-a[1])[0][0];
      const v = (CRM.state.vacs||[]).find(x => String(x.id) === vid);
      if(!v || !['Vervuld','Gesloten'].includes(String(v.status||''))) continue;
      const s2c = spendCamp(naam, vanaf(2));
      if(s2c > 1){
        AC('red','Vacature dicht, campagne loopt door',
          `De leads van deze campagne gaan naar ${v.functie || 'een vacature'} bij ${v.klant || '?'} — en die staat op ${v.status}. Toch ging er de afgelopen twee dagen nog ${CRM.euro(s2c,2)} doorheen. Zet de campagne uit of koppel het formulier om.`,
          '', naam, ['stop','negeer']);
      }
    }

    /* Stille verklikker: de meta-sync zelf. Nieuwste dagregel ouder dan 48
       uur = elk cijfer hierboven is oud nieuws. Amber, zonder keuzes — hier
       valt in Ads Manager niets aan te doen. */
    const nieuwste = M.meta.reduce((x,r) => (r.datum||'') > x ? r.datum : x, '');
    if(nieuwste && CRM.dagenGeleden(nieuwste) >= 2){
      uit.push({kleur:'amber', titel:'De cijfers staan stil',
        uitleg:`De laatste dagregel van de Meta-koppeling is van ${CRM.fmtDate(nieuwste)} — ouder dan 48 uur. Alles op dit tabblad rekent tot die dag; check de meta-sync.`,
        cijfers:'', campagne:'', advertentie:'', keuzes:[]});
    }

    const orde = {red:0, amber:1, green:2};
    return uit.sort((a,b) => orde[a.kleur] - orde[b.kleur]);
  }

  async function besluit(advertentie, campagne, keuze){
    const rij = {id:CRM.uid(), advertentie, campagne, besluit:keuze,
      status:'open', door:CRM.me(), note:'', created_at:new Date().toISOString()};
    M.besluiten.unshift(rij);
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_ad_besluiten')
        .insert({advertentie, campagne, besluit:keuze, status:'open', door:CRM.me()});
      if(error){
        /* Niets opgeslagen betekent: het advies moet blijven staan. Anders
           verdwijnt het veertien dagen terwijl er niets is vastgelegd. */
        M.besluiten = M.besluiten.filter(b => b !== rij);
        CRM.fout('Besluit opslaan mislukt — het advies blijft staan', error);
        telBadge(); teken(); return;
      }
    }
    CRM.toast(keuze==='stop' ? 'Genoteerd — zet hem ook echt uit in Ads Manager'
            : keuze==='opschalen' ? 'Genoteerd als op te schalen' : 'Genoteerd', 'ok');
    telBadge(); teken();
  }

  /* Een besluit afronden: hij staat écht uit, of het agent-advies is gelezen.
     Daarmee verdwijnt de regel van de lijst in plaats van dat hij eeuwig
     blijft staan. */
  async function rondAf(id){
    const rij = M.besluiten.find(b => String(b.id) === String(id));
    if(!rij) return;
    const oud = rij.status; rij.status = 'bevestigd';
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_ad_besluiten').update({status:'bevestigd'}).eq('id', rij.id);
      if(error){
        rij.status = oud;
        CRM.fout('Afronden mislukt — de regel blijft staan', error);
        telBadge(); teken(); return;
      }
    }
    CRM.toast('Afgerond', 'ok');
    telBadge(); teken();
  }

  /* ═══ 3. RENDEMENT — van advertentiegeld tot plaatsing ═══════════
     Dit scherm rekent in COHORTEN en dat is geen detail.

     De verleiding is om de uitgaven van deze maand naast de plaatsingen
     van deze maand te zetten. Dat zijn twee verschillende groepen mensen:
     wie deze maand tekende kwam vaak in mei binnen, en de leads van deze
     maand zitten grotendeels nog in de pijplijn. Zo'n vergelijking leidt
     tot de duurste denkfout die er is — "veel uitgegeven, weinig
     plaatsingen, dus Meta werkt niet" — terwijl die leads gewoon nog
     lopen.

     Daarom groeperen we op de maand waarin de lead BINNENKWAM en volgen
     we díé groep tot het einde, hoe lang dat ook duurt. De uitgaven van
     maand X horen bij wat de leads ván maand X uiteindelijk opleverden.
     Zolang er van een cohort nog leads in behandeling zijn, noemen we de
     uitkomst voorlopig: een halve uitkomst mag nooit als eindstand ogen.

     Advertentiekosten zijn niet vertrouwelijk — geen rechtenpoort hier.
     Fee, marge en omzet (fin_*) komen op dit scherm niet voor.          */

  /* De motor van dit scherm — ketenData, de trechter en al hun constanten —
     is op 3 sep 2026 naar js/data.js verhuisd (VERZOEK AAN CORE):
     Performance rekent met precies dezelfde keten, en twee kopieën van deze
     logica lopen gegarandeerd uit elkaar. Hier blijven alleen verwijzingen
     over; het gedrag is identiek. Zie CRM.keten in js/data.js. */
  const FASE_VOORGESTELD = CRM.KETEN.FASE_VOORGESTELD;
  const bereikteVoorstel = CRM.bereikteVoorstel;
  const isGeplaatst      = CRM.ooitGeplaatst;
  const GEKWALIFICEERD   = CRM.KETEN.GEKWALIFICEERD;   // bot_status!
  const AFGEVALLEN_TEL   = CRM.KETEN.AFGEVALLEN_TEL;
  const NIET_BEREIKT     = CRM.KETEN.NIET_BEREIKT;
  const BEOORDEELD       = CRM.KETEN.BEOORDEELD;
  const {dagVan, maandVan, maandLabel, dezeMaand, kKey, fKey, deel, kost, eur, pctV} = CRM.ketenGerei;
  const ketenData = () => CRM.keten({metaStats:M.meta, campKlant:M.campKlant});

  /* Eén index per render. `teken()` gooit hem leeg; alles wat daarna tekent
     werkt op dezelfde momentopname. Zonder dit zou het Prestatie-tabblad de
     hele kandidaten- en leadadministratie per tabel opnieuw doorlopen. */
  function index(){
    if(!M._idx) M._idx = ketenData();
    return M._idx;
  }

  /* Trechter: zie CRM.trechter in js/data.js (verhuisd 3 sep 2026). */
  const trechter = CRM.trechter;
  const somBedrag = rijen => rijen.reduce((s,r) => s + r.bedrag, 0);

  /* ═══ 4. CONTENT ═════════════════════════════════════════════ */
  const GEPUBLICEERD = p => p.fase === 'Gepubliceerd' || p.fase === 'Learnings';
  const heeftResultaat = p => ['bereik','likes','reacties','leads','weergaven','views']
                              .some(k => N(p.resultaat?.[k]) > 0);
  function nagPosts(){
    return M.posts.filter(p => GEPUBLICEERD(p) && p.datum && !heeftResultaat(p)
                          && CRM.dagenGeleden(p.datum) >= 2);
  }

  /* ═══ 5. VACATURES: WAT VRAAGT OM WERK VAN DE MARKETEER? ═════
     Dit verving de oude "vacature-radar". Die liet alleen zien welke open
     vacature géén content en géén advertentie had — een aftreksom, en het
     antwoord op maar één van de drie vragen die Bryan 's ochtends heeft.

     Sinds 31 jul 2026 staat er in de database ook bij of een vacature op de
     website staat (vacatures.web_status) en welke informatie de AM daarvoor
     heeft aangeleverd. Daar hing nog geen lijst aan: de melding kwam binnen,
     en daarna moest je hem terugzoeken. Deze weergave is die lijst — per open
     vacature de drie kanalen waarlangs instroom kan komen:
       website · content · advertentie
     Het websitedeel is werk dat Bryan zélf doet, dus dat staat vooraan.

     De koppeling van content en advertenties aan een vacature is een
     AFLEIDING op namen, geen vastgelegde verwijzing: een post draagt de tekst
     "klant — functie" en een advertentieset heet naar de functie. Dat staat
     ook onder de tabel, want een afleiding die als feit wordt gelezen is
     erger dan geen cijfer. */
  const norm = s => String(s||'').toLowerCase();

  /* Wat er in de vacature moet staan voordat er een tekst van te maken valt.
     Deze lijst is een KOPIE van VAC_INFOVELDEN in js/klanten.js — dat bestand
     is van een andere module, dus we kunnen hem niet delen. Zolang dat zo is
     moeten beide lijsten bij een wijziging mee; zie het verzoek onderaan dit
     bestand om hem naar js/data.js te verhuizen. */
  const VAC_INFOVELDEN = [
    {k:'werktijden',     lbl:'werktijden'},
    {k:'ploegendienst',  lbl:'ploegendienst'},
    {k:'contractvorm',   lbl:'contractvorm'},
    {k:'eisen',          lbl:'ervaring en certificaten'},
    {k:'bereikbaarheid', lbl:'bereikbaarheid'},
    {k:'over_bedrijf',   lbl:'over het bedrijf'},
    {k:'waarom_hier',    lbl:'waarom hier werken'},
    {k:'salaris',        lbl:'salarisindicatie', vul:v => v.sal_min != null || v.sal_max != null}
  ];
  const vacInfo = v => {
    const r = v || {};
    const mist = VAC_INFOVELDEN.filter(f => f.vul ? !f.vul(r) : !String(r[f.k]||'').trim());
    return {mist, klaar:VAC_INFOVELDEN.length - mist.length, totaal:VAC_INFOVELDEN.length};
  };
  /* Acht labels achter elkaar leest niemand. Noem er hooguit drie en tel de
     rest op — zelfde regel als op de klantkaart. */
  const mistTekst = (info, max = 3) => info.mist.length <= max
    ? info.mist.map(x => x.lbl).join(', ')
    : info.mist.slice(0, max).map(x => x.lbl).join(', ') + ` en nog ${info.mist.length - max}`;

  /* De websitekolommen komen pas in de database als de wijziging in
     supabase/nog-te-draaien.sql gedraaid is. Zolang ze er niet zijn laten we
     de websitekolom weg en zeggen we dat erbij — een lege kolom die "nog niet
     online" suggereert zou werk verzinnen dat er niet is. */
  const heeftWebVelden = () => CRM.demo
    || (CRM.state.vacs||[]).some(v => v && 'web_status' in v);

  const VAC_DAGEN = 14;             // venster waarin content en advertenties meetellen
  function vacatureWerk(dagen = VAC_DAGEN){
    const cut = vanaf(dagen);
    const web = heeftWebVelden();
    /* De advertentiestructuur is campagne = klant, advertentieset = functie,
       advertentie = hook. Zo matchen we ook: functie op de set, klant op de campagne. */
    const advRijen = M.meta.filter(r => (r.datum||'') >= cut)
      .map(r => ({fn: norm((r.advertentieset||'') + ' ' + (r.advertentie||'')),
                  kl: norm((r.campagne||'') + ' ' + (r.advertentieset||''))}));
    const rijen = (CRM.state.vacs||[])
      .filter(v => !v.status || v.status === 'Open')
      .map(v => {
        const sleutel = `${v.klant} — ${v.functie}`;
        const content = M.posts.filter(p => p.vacature === sleutel &&
          ((p.datum||'') >= cut || ['Script klaar','Ingepland'].includes(p.fase))).length;
        const woorden = norm(v.functie).split(/[^a-z]+/).filter(w => w.length >= 5).map(w => w.slice(0,5));
        const adv = advRijen.some(t => woorden.some(w => t.fn.includes(w))
                                    || (v.klant && t.kl.includes(norm(v.klant))));
        /* Drie standen uit klanten.js: 'Nog niet online', 'Staat online',
           'Niet nodig'. Alleen de eerste is werk. */
        const stand = web ? (v.web_status || 'Nog niet online') : '';
        const webGat = web && stand === 'Nog niet online';
        const info = vacInfo(v);
        return {v, sleutel, content, adv, stand, webGat, info,
                /* Klaar om te schrijven, of wacht deze vacature nog op de AM? */
                wacht: webGat && info.mist.length > 0,
                gaten: (webGat?1:0) + (content?0:1) + (adv?0:1),
                dagenOpen: v.aangemaakt ? CRM.dagenGeleden(v.aangemaakt) : null};
      });
    /* Website eerst — dat is het eigen werk van de marketeer. Daarna de
       vacature die het langst openstaat: die kost de meeste tijd. */
    rijen.sort((a,b) => (b.webGat?1:0) - (a.webGat?1:0)
                     || b.gaten - a.gaten
                     || (b.dagenOpen||0) - (a.dagenOpen||0));
    return {rijen, web, open:rijen.length,
            metGat:  rijen.filter(r => r.gaten > 0),
            online:  rijen.filter(r => r.webGat)};
  }

  /* ═══ 5b. MARKETINGTAKEN ═════════════════════════════════════ */
  /* Twee bronnen, één lijst. `mkt_taken` is de weekplanner van het
     marketingbord en staat vol echt werk — die rijen laten we niet vallen.
     Nieuw werk maak je hier met CRM.taakModal, dus in `crm_taken`: dan staat
     het ook op je dashboard, kan het aan een collega, en gaat het mee naar
     Outlook. Twee losse takenlijstjes in één app is precies hoe werk blijft
     liggen — daarom leest deze kaart ze samen en schrijft hij nieuwe taken
     maar op één plek. */
  const weekStartISO = () => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay()+6) % 7));
    return d.toLocaleDateString('sv-SE');
  };
  const bordTaken = () => (M.taken||[]).map(t => ({...t, bron:'bord'}));
  const crmTaken  = () => (CRM.state.taken||[]).filter(t => t.entiteit === 'marketing').map(t => ({...t, bron:'crm'}));
  const alleTaken = () => [...crmTaken(), ...bordTaken()]
    .sort((a,b) => String(a.datum||'9999').localeCompare(String(b.datum||'9999')));
  function openTaken(){
    const vandaag = CRM.todayISO();
    return alleTaken().filter(t => !t.klaar && (!t.datum || t.datum <= vandaag));
  }

  async function taakVink(bron, id, klaar){
    const lijst = bron === 'crm' ? (CRM.state.taken||[]) : (M.taken||[]);
    const t = lijst.find(x => String(x.id) === String(id));
    if(!t) return;
    t.klaar = klaar;
    if(!CRM.demo){
      const {error} = await CRM.sb.from(bron === 'crm' ? 'crm_taken' : 'mkt_taken')
        .update({klaar}).eq('id', t.id);
      if(error){ t.klaar = !klaar; CRM.fout('Taak bijwerken mislukt', error); }
    }
    telBadge(); teken();
  }
  async function taakWeg(id){
    const t = (M.taken||[]).find(x => String(x.id) === String(id));
    if(!t) return;
    if(!await CRM.bevestig('Deze taak verwijderen?', t.tekst)) return;
    M.taken = M.taken.filter(x => x !== t);
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_taken').delete().eq('id', t.id);
      if(error){ M.taken.push(t); CRM.fout('Taak verwijderen mislukt', error); }
    }
    telBadge(); teken();
  }
  async function nieuweTaak(datum){
    const rij = await CRM.taakModal({entiteit:'marketing', ref:'marketing',
      refLabel:'Marketing', datum: datum || CRM.todayISO()});
    if(rij){ telBadge(); teken(); }
  }

  /* ═══ 5c. KANALEN ════════════════════════════════════════════ */
  const kanaalKleur = naam => veiligeKleur((M.kanalen||[]).find(k => k.naam === naam)?.kleur);
  const kanaalStip  = naam => `<span class="mkt-kdot" style="background:${kanaalKleur(naam)}"></span>`;
  /* Kanaalchip mét de kleur die in het marketingbord is ingesteld. Zonder die
     stip zijn alle kanalen grijs en moet je elke regel lezen om te zien waar
     iets stond. */
  const kanaalChip = k => k
    ? `<span class="chip">${kanaalStip(k)}${h(k)}</span>`
    : `<span class="chip">—</span>`;

  function kanaalCijfers(){
    const wk = weekStartISO(), vandaag = CRM.todayISO();
    const namen = [...new Set([...(M.kanalen||[]).map(k => k.naam),
                               ...M.posts.map(p => p.kanaal).filter(Boolean)])];
    return namen.map(naam => {
      const k    = (M.kanalen||[]).find(x => x.naam === naam) || null;
      const alle = M.posts.filter(p => p.kanaal === naam);
      const pub  = alle.filter(GEPUBLICEERD);
      const metB = pub.filter(p => N(p.resultaat?.bereik) > 0);
      return {
        naam, kanaal:k, losseNaam:!k,
        doel:    N(k?.doel_pw),
        week:    pub.filter(p => (p.datum||'') >= wk).length,
        gepland: alle.filter(p => p.fase === 'Ingepland' && (p.datum||'') >= vandaag).length,
        posts:   pub.length, totaal:alle.length,
        bereik:  metB.length ? pub.reduce((s,p) => s + N(p.resultaat?.bereik), 0) / metB.length : null,
        leads:   pub.reduce((s,p) => s + N(p.resultaat?.leads), 0)
      };
    }).sort((a,b) => (a.kanaal?.volgorde ?? 999) - (b.kanaal?.volgorde ?? 999)
                  || a.naam.localeCompare(b.naam));
  }

  async function kanaalZet(naam, veld, waarde){
    const k = (M.kanalen||[]).find(x => x.naam === naam);
    if(!k) return;
    const oud = k[veld]; k[veld] = waarde;
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_kanalen').update({[veld]:waarde}).eq('naam', naam);
      if(error){
        k[veld] = oud;
        CRM.fout(veld === 'doel_pw' ? 'Weekdoel opslaan mislukt' : 'Kleur opslaan mislukt', error);
        teken(); return;
      }
    }
    CRM.toast(veld === 'doel_pw' ? 'Weekdoel opgeslagen' : 'Kleur aangepast', 'ok');
    teken();
  }
  async function kanaalWeg(naam){
    if(M.posts.some(p => p.kanaal === naam)){
      CRM.toast('Er staan nog posts op dit kanaal — die zouden hun kleur en plek verliezen', 'err');
      return;
    }
    if(!await CRM.bevestig(`Kanaal ${naam} verwijderen?`,
        'Het verdwijnt ook uit het marketingbord. Je kunt het daarna gewoon opnieuw toevoegen.')) return;
    const oud = M.kanalen;
    M.kanalen = M.kanalen.filter(k => k.naam !== naam);
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_kanalen').delete().eq('naam', naam);
      if(error){ M.kanalen = oud; CRM.fout('Kanaal verwijderen mislukt', error); }
    }
    teken();
  }
  async function kanaalNieuw(naam, kleur){
    naam = String(naam||'').trim();
    if(!naam){ CRM.toast('Geef het kanaal eerst een naam', 'err'); return; }
    if((M.kanalen||[]).some(k => k.naam.toLowerCase() === naam.toLowerCase())){
      CRM.toast('Dat kanaal bestaat al', 'err'); return;
    }
    const rij = {naam, kleur:veiligeKleur(kleur) === 'var(--line-2)' ? '#5b8bbf' : kleur,
                 volgorde:((M.kanalen||[]).at(-1)?.volgorde || 0) + 1, doel_pw:0};
    M.kanalen = [...(M.kanalen||[]), rij];
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_kanalen').insert(rij);
      if(error){
        M.kanalen = M.kanalen.filter(k => k !== rij);
        CRM.fout('Kanaal toevoegen mislukt', error); teken(); return;
      }
    }
    CRM.toast(`${naam} toegevoegd`, 'ok');
    teken();
  }

  /* Campagne handmatig aan een klant koppelen — zie schema.sql 7f. Geldt
     met terugwerkende kracht: M._idx wordt geleegd zodat ketenData()
     opnieuw rekent en de overschrijving meteen in élke maand doorwerkt,
     niet alleen in nieuwe dagregels. */
  async function campagneKoppel(campagne, klant){
    if(!klant){
      const oud = M.campKlant;
      M.campKlant = M.campKlant.filter(r => r.campagne !== campagne);
      if(!CRM.demo){
        const {error} = await CRM.sb.from('mkt_campagne_klant').delete().eq('campagne', campagne);
        if(error){ M.campKlant = oud; CRM.fout('Loskoppelen mislukt', error); return; }
      }
      M._idx = null; CRM.toast(`${campagne} weer losgekoppeld`, 'ok'); teken(); return;
    }
    const rij = {campagne, klant, door:CRM.me()};
    const oud = M.campKlant;
    M.campKlant = [...M.campKlant.filter(r => r.campagne !== campagne), rij];
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_campagne_klant').upsert(rij);
      if(error){
        M.campKlant = oud;
        CRM.fout('Campagne koppelen mislukt', error); teken(); return;
      }
    }
    M._idx = null;
    CRM.toast(`${campagne} → ${klant}`, 'ok');
    teken();
  }

  /* ═══ 5d. WAT WERKT — leren van je eigen cijfers ══════════════ */
  const gem = a => a.length ? a.reduce((x,y) => x+y, 0) / a.length : 0;
  function watWerkt(){
    const pubs = M.posts.filter(p => GEPUBLICEERD(p) && N(p.resultaat?.bereik) > 0);
    const uit = [];
    if(pubs.length < 2) return {adviezen:uit, pubs};
    const tot = gem(pubs.map(p => N(p.resultaat.bereik)));
    const perGroep = keyFn => {
      const m = new Map();
      pubs.forEach(p => { const k = keyFn(p); if(!k) return;
        if(!m.has(k)) m.set(k, []); m.get(k).push(N(p.resultaat.bereik)); });
      return [...m].filter(([,v]) => v.length >= 2)
        .map(([k,v]) => ({k, avg:gem(v), n:v.length})).sort((a,b) => b.avg - a.avg);
    };
    const fm = perGroep(p => p.format);
    if(fm.length >= 2 && fm[0].avg >= 1.5*tot)
      uit.push({titel:`${fm[0].k} is jullie sterkste format`,
        tekst:`Gemiddeld ${fmtN(fm[0].avg)} bereik per post over ${fm[0].n} posts — ${maal(fm[0].avg, tot)}× jullie gemiddelde van ${fmtN(tot)}. Plan hier meer van.`});
    const km = perGroep(p => p.kanaal);
    if(km.length >= 2 && km[0].avg >= 1.5*tot)
      uit.push({titel:`${km[0].k} presteert het best`,
        tekst:`Gemiddeld ${fmtN(km[0].avg)} bereik over ${km[0].n} posts. Zet je beste content daar als eerste neer.`});
    const dm = perGroep(p => p.datum ? DAGNAAM[new Date(p.datum+'T12:00').getDay()] : '');
    if(dm.length >= 2 && dm[0].avg >= 1.4*tot)
      uit.push({titel:`${dm[0].k.charAt(0).toUpperCase()+dm[0].k.slice(1)} is jullie beste dag`,
        tekst:`Posts op ${dm[0].k} halen gemiddeld ${fmtN(dm[0].avg)} bereik over ${dm[0].n} posts. Plan je toppers op die dag.`});
    const met = pubs.filter(p => /[0-9€]/.test(p.hook||''));
    const zon = pubs.filter(p => !/[0-9€]/.test(p.hook||''));
    if(met.length >= 2 && zon.length >= 2){
      const a = gem(met.map(p => N(p.resultaat.bereik))), b = gem(zon.map(p => N(p.resultaat.bereik)));
      if(a >= 1.3*b) uit.push({titel:'Cijfers in de hook werken',
        tekst:`Hooks met een getal of een bedrag halen gemiddeld ${fmtN(a)} bereik tegen ${fmtN(b)} zonder. Noem het salaris of de toeslag in de eerste zin.`});
      else if(b >= 1.3*a) uit.push({titel:'Cijfer-hooks blijven achter',
        tekst:`Hooks zónder getal doen het bij jullie beter: ${fmtN(b)} tegen ${fmtN(a)} bereik. Test verhalende openingen.`});
    }
    const leadKing = pubs.filter(p => N(p.resultaat?.leads) > 0)
      .sort((a,b) => N(b.resultaat.leads) - N(a.resultaat.leads))[0];
    if(leadKing) uit.push({titel:`Meeste leads: "${leadKing.titel}"`,
      tekst:`${fmtN(leadKing.resultaat.leads)} leads via ${leadKing.kanaal || 'onbekend kanaal'}${leadKing.format?` (${leadKing.format})`:''}. Maak hier een vervolg van.`});
    return {adviezen:uit, pubs};
  }

  /* Voorraad: hoeveel weken kun je vooruit met wat er klaarstaat? */
  function voorraad(){
    const pub28 = M.posts.filter(p => GEPUBLICEERD(p) && (p.datum||'') >= vanaf(28)).length;
    const tempo = pub28 / 4;
    const klaar = M.posts.filter(p => p.fase === 'Idee' || p.fase === 'Script klaar').length;
    const gepland = M.posts.filter(p => p.fase === 'Ingepland' && (p.datum||'') >= CRM.todayISO()).length;
    return {tempo, klaar, gepland, weken: tempo > 0 ? (klaar+gepland)/tempo : null};
  }

  /* ═══ 6. WEERGAVE ════════════════════════════════════════════ */
  function render(mount, actiesEl){
    M.mount = mount; M.actiesEl = actiesEl;
    if(!M.geladen){
      mount.innerHTML = CRM.ui.laden('Marketingcijfers laden…');
      laad().then(teken).catch(e => {
        console.error('marketing laden', e);
        /* Belofte weggooien, anders blijft elke volgende render op dezelfde
           mislukking hangen en helpt herladen van de pagina niet eens. */
        M.bezig = null;
        mount.innerHTML = foutBlok('De marketingcijfers', e);
      });
      return;
    }
    teken();
  }

  function teken(){
    const mount = M.mount; if(!mount) return;
    M._idx = null; M._zicht = null;      // één index per render
    kopActies();
    /* Twee lijsten met opzet: `adv` telt de adviezen van het hele account (dat
       is wat de badge en het tabblad beloven), `advTonen` is wat er ná het
       klantfilter overblijft. */
    const adv = adviezen(), nag = nagPosts(), vac = vacatureWerk(), werk = openTaken();
    const advTonen = M.klant ? adviezen(klantRijen()) : adv;
    /* Op het tabblad Vacatures telt alleen het websitewerk mee in de teller.
       "Geen content of advertentie" is een afleiding op namen; die zou de
       teller opblazen met werk waarvan we niet zeker zijn. */
    const TABS = [
      {k:'prestatie', t:'Prestatie', n:adv.length + agentAdviezen().length},
      {k:'keten',     t:'Rendement', n:0},
      {k:'content',   t:'Content',   n:nag.length + werk.length},
      {k:'kanalen',   t:'Kanalen',   n:0},
      {k:'vacatures', t:'Vacatures', n:vac.online.length}
    ];
    /* Een onbekend tabblad (oude link, oude tab in de browser) valt terug op
       Prestatie in plaats van op een leeg scherm. */
    if(!TABS.some(t => t.k === M.tab)) M.tab = 'prestatie';
    const body = M.tab === 'prestatie' ? prestatieHtml(advTonen, adv.length - advTonen.length)
               : M.tab === 'keten'     ? ketenHtml()
               : M.tab === 'content'   ? contentHtml(nag)
               : M.tab === 'kanalen'   ? kanalenHtml()
               :                         vacaturesHtml(vac);
    mount.innerHTML = `
      ${M.isDemo ? `<div class="note info" style="margin-bottom:16px">Demo-data — de Meta-cijfers en posts op dit scherm zijn verzonnen, zodat je de weergave kunt beoordelen.</div>` : ''}
      <div class="tabs">${TABS.map(t =>
        `<button class="tab ${M.tab===t.k?'on':''}" data-tab="${t.k}">${h(t.t)}${t.n?`<span class="cnt num">${t.n}</span>`:''}</button>`).join('')}</div>
      ${body}`;
    CRM.$$('[data-tab]', mount).forEach(b => b.onclick = () => { M.tab = b.dataset.tab; teken(); window.scrollTo({top:0}); });
    bindActies(mount);
  }

  function kopActies(){
    const el = M.actiesEl || document.getElementById('pageacties');
    if(!el) return;
    /* De filters van Prestatie stonden hier in de paginakop. Met drie keuzes
       (venster, tijdstap, klant) past dat niet meer op een telefoon, en een
       filter hoort naast wat het filtert. Ze staan nu in een filterbalk boven
       het tabblad zelf; hier blijft alleen de link naar het bord. */
    el.innerHTML = `<a class="btn ghost" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`;
  }

  /* ── Filterbalk van het Prestatie-tabblad ──
     Venster = hoeveel dagen terug, tijdstap = waarop we optellen, klant =
     welke campagnes meetellen. Alle drie werken door in de kengetallen, de
     grafiek én elke tabel op dit tabblad. */
  const VENSTERS = [{d:7,t:'7 dagen'}, {d:14,t:'14 dagen'}, {d:30,t:'30 dagen'},
                    {d:90,t:'90 dagen'}, {d:0,t:'Alles'}];
  function filterBalkHtml(){
    const D = index();
    /* Klantenlijst: iedereen met advertentie-uitgaven én iedereen met een
       Meta-lead. Die tweede groep hoort erbij — een klant zónder campagne maar
       mét leads is precies het geval dat je wilt kunnen opzoeken. */
    const namen = new Map();
    for(const k of D.campKoppel.values()) if(k.kkey) namen.set(k.kkey, k.klant || k.kkey);
    for(const r of D.leads) if(r.kkey) namen.set(r.kkey, r.klant || r.kkey);
    const lijst = [...namen].sort((a,b) => a[1].localeCompare(b[1], 'nl'));
    const losseUitgaven = M.meta.some(r => !klantVan(r).kkey);
    /* Staat er een klantsleutel in het filter die niet meer bestaat (klant
       hernoemd, campagne weg), dan valt het filter terug op "alle klanten" —
       liever alles tonen dan een leeg scherm zonder uitleg. */
    if(M.klant && M.klant !== '__niet__' && !namen.has(M.klant)) M.klant = '';

    return `<div class="vlak mkt-filters">
      <div class="mkt-filter">
        <span class="label" id="mkt_lbl_ven">Venster</span>
        <div class="seg" role="group" aria-labelledby="mkt_lbl_ven">${VENSTERS.map(v =>
          `<button data-per="${v.d}" class="${M.periode===v.d?'on':''}"${M.periode===v.d?' aria-current="true"':''}>${h(v.t)}</button>`).join('')}</div>
      </div>
      <div class="mkt-filter">
        <span class="label" id="mkt_lbl_grp">Optellen per</span>
        <div class="seg" role="group" aria-labelledby="mkt_lbl_grp">${['dag','week','maand'].map(g =>
          `<button data-groep="${g}" class="${M.groep===g?'on':''}"${M.groep===g?' aria-current="true"':''}>${h(g)}</button>`).join('')}</div>
      </div>
      <div class="mkt-filter grow">
        <label class="label" for="mkt_klant">Klant</label>
        <select id="mkt_klant">
          <option value=""${M.klant===''?' selected':''}>Alle klanten</option>
          ${losseUitgaven ? `<option value="__niet__"${M.klant==='__niet__'?' selected':''}>Zonder herkenbare klant</option>` : ''}
          ${lijst.map(([k,n]) => `<option value="${h(k)}"${M.klant===k?' selected':''}>${h(n)}</option>`).join('')}
        </select>
      </div>
      ${(M.periode!==30 || M.groep!=='dag' || M.klant) ? `<div class="mkt-filter">
        <span class="label" aria-hidden="true">&nbsp;</span>
        <button class="btn ghost sm" id="mkt_reset">Filters wissen</button></div>` : ''}
    </div>`;
  }
  const klantLabel = () => {
    if(!M.klant) return 'alle klanten';
    if(M.klant === '__niet__') return 'uitgaven zonder herkenbare klant';
    const D = index();
    for(const k of D.campKoppel.values()) if(k.kkey === M.klant) return k.klant || M.klant;
    for(const r of D.leads) if(r.kkey === M.klant) return r.klant || M.klant;
    return M.klant;
  };
  /* Het venster in gewone taal, mét de echte begin- en einddatum. Zo is elk
     getal op dit scherm met de hand na te rekenen tegen de dagregels. */
  function vensterTekst(){
    const cut = vensterVanaf();
    if(!cut){
      const vroegst = M.meta.map(r => r.datum).filter(isDatum).sort()[0];
      return vroegst ? `alles vanaf ${CRM.fmtDateShort(vroegst)}` : 'alle beschikbare dagen';
    }
    return `${M.periode} dagen: ${CRM.fmtDateShort(cut)} t/m ${CRM.fmtDateShort(CRM.todayISO())}`;
  }

  /* ── Knoppen binnen de weergave ── */
  function bindActies(root){
    /* Filterbalk van Prestatie. Elke wijziging tekent het hele tabblad
       opnieuw: kengetallen, grafiek en tabellen horen altijd hetzelfde
       venster en dezelfde klant te tonen. */
    CRM.$$('[data-per]', root).forEach(b => b.onclick = () => { M.periode = Number(b.dataset.per); teken(); });
    CRM.$$('[data-groep]', root).forEach(b => b.onclick = () => { M.groep = b.dataset.groep; teken(); });
    const klantKies = root.querySelector('#mkt_klant');
    if(klantKies) klantKies.onchange = () => { M.klant = klantKies.value; teken(); };
    const wis = root.querySelector('#mkt_reset');
    if(wis) wis.onclick = () => { M.periode = 30; M.groep = 'dag'; M.klant = ''; teken(); };
    const herk = root.querySelector('#mkt_herkomst');
    if(herk) herk.onclick = () => { M.herkomst = !M.herkomst; teken(); };

    CRM.$$('[data-bes]', root).forEach(b => b.onclick = () => {
      const [keuze, ad, camp] = b.dataset.bes.split('|');
      besluit(ad, camp, keuze);
    });
    CRM.$$('[data-afrond]', root).forEach(b => b.onclick = () => rondAf(b.dataset.afrond));
    CRM.$$('[data-uit]', root).forEach(r => r.onclick = () => {
      const k = r.dataset.uit;
      M.open.has(k) ? M.open.delete(k) : M.open.add(k);
      const tbl = document.getElementById('mkt_camp');
      if(tbl){ tbl.innerHTML = campagneRijen(); bindActies(tbl); }
      else teken();
    });

    /* Rendement: cohortkeuze, doorklikken, sorteren en de uitleg. */
    CRM.$$('[data-cohort]', root).forEach(el => el.onclick = () => {
      M.cohort = el.dataset.cohort; teken();
    });
    CRM.$$('[data-drill]', root).forEach(b => b.onclick = e => {
      e.stopPropagation();
      const rijen = M.drill.get(b.dataset.drill);
      if(rijen && rijen.length) drillPaneel(b.dataset.drilltitel || 'Leads', rijen);
    });
    const sorteer = (attr, staat) => CRM.$$(`[${attr}]`, root).forEach(th => th.onclick = () => {
      const k = th.getAttribute(attr);
      if(staat.k === k) staat.dir = -staat.dir;
      else { staat.k = k; staat.dir = k === 'label' ? 1 : -1; }
      teken();
    });
    sorteer('data-ks', M.kSort);
    sorteer('data-vs', M.vSort);
    CRM.$$('[data-koppelcamp]', root).forEach(sel => sel.onchange = () => {
      if(sel.value) campagneKoppel(sel.dataset.koppelcamp, sel.value);
    });
    const uitlegKnop = root.querySelector('#mkt_uitleg');
    if(uitlegKnop) uitlegKnop.onclick = () => { M.uitleg = !M.uitleg; teken(); };

    /* Taken */
    CRM.$$('[data-tvink]', root).forEach(c => c.onclick = () => {
      const [bron, id] = c.dataset.tvink.split('|');
      taakVink(bron, id, c.checked);
    });
    CRM.$$('[data-tweg]', root).forEach(b => b.onclick = () => taakWeg(b.dataset.tweg));
    const nieuwTaakKnop = root.querySelector('#mkt_nieuwetaak');
    if(nieuwTaakKnop) nieuwTaakKnop.onclick = () => nieuweTaak();

    /* Learnings-bibliotheek — alleen de lijst hertekenen zou het zoekveld
       zijn focus kosten, dus we tekenen de tab en zetten de cursor terug. */
    const lbq = root.querySelector('#mkt_lbq');
    if(lbq) lbq.oninput = CRM.debounce(() => {
      M.lbQ = lbq.value; teken();
      const nieuw = document.getElementById('mkt_lbq');
      if(nieuw){ nieuw.focus(); nieuw.setSelectionRange(nieuw.value.length, nieuw.value.length); }
    }, 300);
    const lbk = root.querySelector('#mkt_lbk');
    if(lbk) lbk.onchange = () => { M.lbK = lbk.value; teken(); };

    /* Kanalen */
    CRM.$$('[data-doel]', root).forEach(inp => inp.onchange = () => {
      const v = Math.max(0, Math.min(21, Math.round(Number(inp.value)||0)));
      kanaalZet(inp.dataset.doel, 'doel_pw', v);
    });
    CRM.$$('[data-kleur]', root).forEach(inp => inp.onchange = () => kanaalZet(inp.dataset.kleur, 'kleur', inp.value));
    CRM.$$('[data-kweg]', root).forEach(b => b.onclick = () => kanaalWeg(b.dataset.kweg));
    const kadd = root.querySelector('#mkt_kadd');
    if(kadd){
      const doe = () => kanaalNieuw(root.querySelector('#mkt_knaam').value, root.querySelector('#mkt_kkleur').value);
      kadd.onclick = doe;
      root.querySelector('#mkt_knaam').onkeydown = e => { if(e.key === 'Enter') doe(); };
    }

    /* Vacatures */
    CRM.$$('[data-vklant]', root).forEach(b => b.onclick = () => {
      /* De klantkaart opent op het tabblad Vacatures; daar staat het venster
         waarin de websitestand en de ontbrekende informatie ingevuld worden.
         Dat scherm is van een andere module — we sturen de gebruiker erheen in
         plaats van het hier na te bouwen. */
      CRM.ga('klanten', {id:b.dataset.vklant});
    });
    const vAlles = root.querySelector('#mkt_vacalles');
    if(vAlles) vAlles.onclick = () => { M.vacAlles = !M.vacAlles; teken(); };
  }

  /* ── 6a. Prestatie ── */
  /* Weekvergelijking: het eerste wat je wilt weten als je dit scherm opent.
     Drie cijfers van de laatste zeven dagen met het verschil tegenover de
     zeven dagen daarvoor. */
  function weekHtml(){
    const bron = klantRijen();
    const nu  = stat(bron.filter(r => (r.datum||'') >= vanaf(7)));
    const vor = stat(bron.filter(r => (r.datum||'') >= vanaf(14) && (r.datum||'') < vanaf(7)));
    if(!nu.imp && !vor.imp) return '';           /* twee weken stil: geen strook */

    const cel = (label, waarde, delta) =>
      `<div class="mkt-week-c"><span class="label">${h(label)}</span>
        <b class="num">${waarde}</b><span class="mkt-week-d">${delta}</span></div>`;
    /* "Leads" heet hier leadacties: het is de kolom `leads` uit
       mkt_meta_stats, en die telt actiegebeurtenissen van Meta op — geen
       unieke mensen. Zie het herkomstblok bij de kengetallen. */
    const cellen =
      cel('Uitgegeven', CRM.euro(nu.spend),
          verschil(nu.spend, vor.spend, n => CRM.euro(n), 'neutraal')) +
      cel('Meta-leadacties', fmtN(nu.leads),
          verschil(nu.leads, vor.leads, n => fmtN(n), 'hoger')) +
      cel('Kosten per leadactie', nu.cpl ? CRM.euro(nu.cpl,2) : '—',
          nu.cpl && vor.cpl ? verschil(nu.cpl, vor.cpl, n => CRM.euro(n,2), 'lager')
                            : `<span class="meta">geen vergelijking mogelijk</span>`);

    return `<div class="vlak mkt-week">
      <span class="label">Deze week vs vorige week${M.klant ? ` — ${h(klantLabel())}` : ''}</span>
      <div class="mkt-week-r">${cellen}</div>
      <span class="meta">Laatste zeven dagen (${h(CRM.fmtDateShort(vanaf(7)))} t/m ${h(CRM.fmtDateShort(CRM.todayISO()))})
        tegenover de zeven daarvóór. Deze strook houdt zijn eigen venster aan — het klantfilter werkt wél door, de
        vensterkeuze hierboven niet. Meer of minder uitgeven is op zichzelf niet goed of slecht, dus dat verschil
        blijft kleurloos.</span>
    </div>`;
  }

  /* ── Waar komen deze kengetallen vandaan? ──
     Elk cijfer op dit tabblad komt uit één kolom van mkt_meta_stats. Die
     kolommen worden gevuld door de edge-functie meta-sync, en twee ervan
     tellen iets anders dan hun naam doet vermoeden. Dat hoort op het scherm te
     staan, niet in een hoofd of in een rapport dat niemand terugleest. */
  function herkomstHtml(s){
    const regel = (w, t) => `<div class="mkt-def"><b>${h(w)}</b><span>${t}</span></div>`;
    const kolom = k => `<span class="num">${h(k)}</span>`;
    return `<div class="vlak mkt-uitleg">
      <div class="row">
        <span class="label" style="margin:0">Herkomst van deze cijfers</span>
        <div class="spacer"></div>
        <button class="btn sm ghost" id="mkt_herkomst" aria-expanded="${M.herkomst?'true':'false'}">${
          M.herkomst ? 'Uitleg verbergen' : 'Waar komt dit vandaan?'}</button>
      </div>
      <p class="sub" style="margin:8px 0 0;max-width:78ch">Alles hierboven komt uit de tabel
        <span class="num">mkt_meta_stats</span>: één regel per dag, per advertentie. Die tabel wordt gevuld door de
        synchronisatie met Meta — dit scherm rekent er alleen mee en kan er niets aan corrigeren.</p>
      ${M.herkomst ? `<div class="mkt-defs">
        ${regel('Uitgegeven', `Optelsom van de kolom ${kolom('uitgegeven')}, gevuld met het Meta-veld ${kolom('spend')}.
          Dat is wat Meta zegt te hebben uitgegeven, niet wat er van de rekening is gegaan — zie de vergelijking met de bank hieronder.`)}
        ${regel('Meta-leadacties', `Optelsom van de kolom ${kolom('leads')}. De synchronisatie vult die kolom door
          <b>vijf Meta-actietypen bij elkaar op te tellen</b>: ${kolom('lead')}, ${kolom('leadgen_grouped')},
          ${kolom('onsite_conversion.lead_grouped')}, ${kolom('offsite_conversion.fb_pixel_lead')} en ${kolom('onsite_web_lead')}.
          Meta rapporteert die deels als overlappende totalen, dus dezelfde lead kan er meerdere keren in zitten.
          Het is dus een aantal <b>actiegebeurtenissen</b>, geen aantal mensen — en het is geen zuivere formuliertelling,
          want pixel-leads van de website zitten er ook in.`)}
        ${regel('Kosten per leadactie', `${kolom('uitgegeven')} gedeeld door ${kolom('leads')}. Worden leads meervoudig
          geteld, dan valt dit bedrag te laag uit: het lijkt goedkoper dan het is. Zonder leadacties staat er een streepje,
          geen € 0,00.`)}
        ${regel('Kliks (alle)', `Optelsom van de kolom ${kolom('kliks')}, gevuld met het Meta-veld ${kolom('clicks')}.
          Dat telt <b>elke</b> klik op de advertentie mee: ook likes, reacties, delen en klikken op de paginanaam.
          Het aantal mensen dat écht naar het formulier of de website ging staat in een ander Meta-veld
          (${kolom('inline_link_clicks')}) en wordt op dit moment niet opgehaald.`)}
        ${regel('CPC en CTR', `Berekend op diezelfde ${kolom('kliks')}. Omdat daar niet-doorklikken in zitten,
          zijn CPC en CTR hier gunstiger dan de werkelijke kosten per doorklik.`)}
        ${regel('Impressies en bereik', `De kolommen ${kolom('impressies')} en ${kolom('bereik')}, één op één uit de
          Meta-velden ${kolom('impressions')} en ${kolom('reach')}. Let op: bereik is bij Meta een aantal unieke mensen
          per rapportageperiode; dagcijfers optellen over een week telt iemand die twee dagen keek dus dubbel.`)}
        ${regel('Periode', `${h(vensterTekst())}. Het venster telt vandaag mee en loopt precies dat aantal dagen terug.
          De kolom ${kolom('datum')} is een datum zonder tijdzone; we lezen hem in lokale tijd.`)}
        ${regel('Klant', `Een Meta-campagne is een klant. De klantnaam wordt in de campagnenaam herkend op hele woorden;
          lukt dat niet, dan wegen de leads mee die diezelfde campagnenaam dragen. Lukt geen van beide, dan blijven de
          uitgaven staan als "zonder herkenbare klant" — ze worden nooit stilzwijgend over de andere klanten verdeeld.`)}
        ${regel('Laatste synchronisatie', `De kolom ${kolom('synced_at')} van de nieuwste regel. Loopt die achter,
          dan zijn deze cijfers ouder dan ze lijken.`)}
        ${s && s.imp ? regel('Nu op dit scherm', `${kolom(CRM.euro(s.spend,2))} uitgegeven · ${kolom(fmtN(s.leads))} leadacties ·
          ${kolom(fmtN(s.kliks))} kliks · ${kolom(fmtN(s.imp))} impressies, over ${kolom(fmtN(s.rijen||0))} dagregels.`) : ''}
      </div>` : ''}
    </div>`;
  }

  /* ── De kruiscontrole op de leadtelling ──
     Meta's eigen leadtelling naast het aantal leads dat écht in het CRM staat.
     Lopen die ver uiteen, dan is dat geen detail: dan staat er een getal op het
     scherm waar niemand een budget op mag baseren. We rekenen niets om en
     verzinnen geen correctiefactor — we laten beide getallen zien.

     Het aantal CRM-leads in dezelfde selectie. Aparte functie omdat het
     Prestatie-tabblad het twee keer nodig heeft: één keer om te bepalen wáár
     dit blok hoort te staan (bovenaan als waarschuwing, of onderin bij de
     verantwoording) en één keer om het te tekenen. */
  function crmLeadsInZicht(){
    const cut = vensterVanaf();
    return index().leads.filter(r => r.dk && (!cut || r.dk >= cut) && (!M.klant
      || (M.klant === '__niet__' ? !r.kkey : r.kkey === M.klant))).length;
  }
  /* Wanneer is het verschil groot genoeg om iemand lastig mee te vallen?
     Als er in het CRM niets staat terwijl Meta leads meldt, of als het
     verschil meer dan de helft van de Meta-telling is. */
  function scheveLeads(s){
    const m = s.leads;
    if(!m) return false;
    const n = crmLeadsInZicht();
    return n === 0 || Math.abs(m - n) > m * 0.5;
  }
  function leadControleHtml(s){
    const n = crmLeadsInZicht(), m = s.leads;
    if(!m && !n) return '';
    const scheef = scheveLeads(s);
    const perKlik = s.kliks ? (m / s.kliks * 100) : null;

    const cijfers = `<div class="mkt-week-r" style="margin:10px 0 4px">
      <div class="mkt-week-c"><span class="label">Meta telt (kolom leads)</span>
        <b class="num">${fmtN(m)}</b><span class="mkt-week-d">leadacties, mogelijk meervoudig geteld</span></div>
      <div class="mkt-week-c"><span class="label">In het CRM (crm_leads, bron Meta)</span>
        <b class="num">${fmtN(n)}</b><span class="mkt-week-d">leads met binnenkomstdatum in deze periode</span></div>
      <div class="mkt-week-c"><span class="label">Verschil</span>
        <b class="num">${(m - n) > 0 ? '+' : ''}${fmtN(m - n)}</b>
        <span class="mkt-week-d">${m ? `${CRM.pct(Math.abs(m - n) / m * 100, 0)} van de Meta-telling` : 'geen Meta-telling'}</span></div>
    </div>`;

    if(!scheef) return `<div class="note info" style="margin-bottom:18px">
      <b>Meta's leadtelling naast de leads in het CRM.</b>
      ${cijfers}
      <span class="meta">Deze twee liggen dicht bij elkaar. Let er wel op dat de Meta-telling een optelsom van vijf
      overlappende actietypen is; gelijk lopen betekent niet dat allebei kloppen.</span></div>`;

    return `<div class="note warn" style="margin-bottom:18px">
      <b>De leadcijfers stroken niet met elkaar — baseer hier nog geen budget op.</b>
      ${cijfers}
      <span class="meta" style="display:block;margin-top:4px">
        ${n === 0
          ? `Meta meldt <span class="num">${fmtN(m)}</span> leadacties over deze periode, terwijl er in
             <span class="num">crm_leads</span> geen enkele lead met bron Meta staat. Eén van beide klopt niet:
             óf de leads komen niet in het CRM terecht, óf de Meta-telling telt iets anders dan leads.`
          : `Meta meldt <span class="num">${fmtN(m)}</span> leadacties, in het CRM staan
             <span class="num">${fmtN(n)}</span> leads met bron Meta over dezelfde periode.`}
        ${perKlik != null ? ` Op <span class="num">${fmtN(s.kliks)}</span> kliks is dat
          <span class="num">${CRM.pct(perKlik, 1)}</span> van alle kliks${perKlik > 10
            ? ' — voor een wervingsadvertentie onwaarschijnlijk hoog, wat past bij meervoudig tellen' : ''}.` : ''}
        De synchronisatie telt vijf Meta-actietypen bij elkaar op die elkaar deels overlappen; zolang dat niet is
        aangepast, is de Meta-telling geen betrouwbaar aantal leads. We rekenen het bewust niet om naar een
        "waarschijnlijk" getal — dat zou een verzonnen cijfer zijn.
      </span></div>`;
  }

  /* ── Wat Meta rapporteert tegenover wat er betaald is ──
     `uitgegeven` is Meta's eigen opgave. Wat er werkelijk van de rekening ging
     staat in mkt_meta_betaald: het maandtotaal dat vanuit Finance uit de
     banktransacties wordt herkend en weggeschreven. Deze module leest alleen
     dat maandtotaal en komt niet in de fin_*-tabellen — die blijven van
     Finance. Het blok is bewust maandelijks en accountbreed: een
     bankafschrijving valt niet per dag of per klant te splitsen. */
  function betaaldHtml(){
    /* Een tabel die nog niet bestaat is geen storing: dan is de koppeling met
       de bank simpelweg nog niet aangezet. Dat leggen we uit in de lege staat.
       Een échte leesfout (rechten, netwerk) hoort wél als fout op het scherm. */
    const mist = M.betaaldFout &&
      /does not exist|schema cache|relation/i.test(String(M.betaaldFout?.message || M.betaaldFout || ''));
    if(M.betaaldFout && !mist) return foutBlok('De betaalde bedragen', M.betaaldFout);
    const gerapporteerd = new Map();
    for(const r of M.meta){
      const mk = String(r.datum||'').slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(mk)) continue;
      gerapporteerd.set(mk, (gerapporteerd.get(mk)||0) + N(r.uitgegeven));
    }
    const betaald = new Map();
    for(const r of (M.betaald||[])){
      const mk = String(r.maand||'').slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(mk)) continue;
      betaald.set(mk, r);
    }
    const maanden = [...new Set([...gerapporteerd.keys(), ...betaald.keys()])].sort().reverse().slice(0, 12);

    const voetnoot = `<div class="card-f"><span class="meta">
      Meta factureert Nederlandse bedrijven meestal met <b>verlegde btw</b>: het betaalde bedrag ligt dan dicht bij het
      bedrag exclusief btw. We rekenen hier niets om — er staat wat er staat.
      Meta schrijft bovendien af bij een <b>drempelbedrag</b> of maandelijks achteraf, dus uitgaven van eind juli kunnen
      begin augustus van de rekening gaan. Een verschil in één maand is daarom nog geen fout; een verschil dat maand na
      maand dezelfde kant op staat wél.
      Dit blok telt altijd alle campagnes samen en gaat per maand: een bankafschrijving valt niet per klant of per dag
      te splitsen. Het venster en het klantfilter hierboven werken er dus niet in door.</span></div>`;

    if(!betaald.size) return `<div class="card mkt-kaart">
      <div class="card-h"><div class="h2">Meta gerapporteerd tegenover betaald</div>
        <span class="meta">nog niets ingelezen</span></div>
      <div class="card-b">
        <div class="note info" style="margin:0">
          <b>Er is nog geen betaald bedrag om mee te vergelijken.</b>
          <span class="meta" style="display:block;margin-top:4px">De bedragen hierboven zijn wat Meta zelf rapporteert.
          Wat er werkelijk aan Meta betaald is, komt uit de banktransacties: Finance herkent die en schrijft per maand
          één totaal weg naar <span class="num">mkt_meta_betaald</span>, dat het hele team mag lezen. Zolang er nog geen
          bankafschrift is ingelezen, blijft die tabel leeg — en dan tonen we hier geen nul, want nul betaald zou iets
          heel anders betekenen dan niets gemeten. Inlezen doet Tjeerd in Finance; alleen zijn account mag deze tabel
          vullen.${mist ? ' De tabel bestaat op dit moment nog niet in de database — draai eerst het schema.' : ''}</span>
        </div>
      </div>
      ${voetnoot}</div>`;

    const rij = mk => {
      const g = gerapporteerd.get(mk);
      const b = betaald.get(mk);
      const verschilBedrag = (b && g != null) ? N(b.bedrag) - g : null;
      return `<tr>
        <td><b>${h(maandLabel(mk))}</b>${b?.bijgewerkt
          ? `<div class="rowsub">bijgewerkt ${h(CRM.fmtDateShort(b.bijgewerkt))}${b.door?` door ${h(b.door)}`:''}</div>` : ''}</td>
        <td class="n num">${g == null ? '<span class="meta">—</span>' : CRM.euro(g)}</td>
        <td class="n num">${b ? CRM.euro(N(b.bedrag))
          : '<span class="meta">nog niet ingelezen</span>'}</td>
        <td class="n num">${verschilBedrag == null ? '<span class="meta">—</span>'
          : `${verschilBedrag > 0 ? '+' : verschilBedrag < 0 ? '−' : ''}${CRM.euro(Math.abs(verschilBedrag))}`}
          ${verschilBedrag != null && g > 0
            ? `<div class="rowsub">${CRM.pct(Math.abs(verschilBedrag)/g*100, 1)} van de opgave</div>` : ''}</td>
        <td class="meta">${b ? `${h(b.bron || 'bank')}${N(b.regels) ? ` · ${fmtN(b.regels)} ${N(b.regels)===1?'transactie':'transacties'}` : ''}`
          : '<span class="meta">—</span>'}</td>
      </tr>`;
    };
    return `<div class="card mkt-kaart">
      <div class="card-h"><div class="h2">Meta gerapporteerd tegenover betaald</div>
        <span class="meta">per maand · alle campagnes</span></div>
      <div class="tblwrap" style="border:none;border-radius:0">
        <table class="tbl mkt-tbl"><thead><tr>
          <th>Maand</th><th class="n">Meta rapporteert</th><th class="n">Betaald volgens bank</th>
          <th class="n">Verschil</th><th>Herkomst</th>
        </tr></thead><tbody>${maanden.map(rij).join('')}</tbody></table>
      </div>
      ${voetnoot}</div>`;
  }

  function prestatieHtml(adv, verborgenAdv){
    if(!M.meta.length) return M.metaFout ? foutBlok('De Meta-cijfers', M.metaFout) : leegMeta();
    const rows = zichtbareRijen();
    const s = stat(rows);
    const laatst = M.meta[0]?.synced_at ? CRM.fmtDate(M.meta[0].synced_at) : '';
    const leeg = !rows.length;
    return `
      ${filterBalkHtml()}
      ${leeg ? `<div class="card mkt-kaart"><div class="card-b">${CRM.ui.leeg(
          'Geen advertentiecijfers in deze selectie',
          `Er staat geen enkele dagregel in mkt_meta_stats voor ${vensterTekst().toLowerCase()}${
            M.klant ? ` en ${klantLabel()}` : ''}. Kies hierboven een langer venster of een andere klant. `
          + 'Nul regels is iets anders dan nul euro: we tonen daarom geen bedragen in plaats van € 0,00.'
          + leegLeadsTekst())}</div></div>`
        : `
      ${weekHtml()}
      ${adviesHtml(adv, verborgenAdv)}
      <div class="grid c4" style="margin-bottom:12px">
        ${CRM.ui.kpi('Uitgegeven', `<span class="num">${CRM.euro(s.spend)}</span>`,
          `${h(vensterTekst())}${M.klant ? ` · ${h(klantLabel())}` : ''}`, 'accent')}
        ${CRM.ui.kpi('Meta-leadacties', `<span class="num">${fmtN(s.leads)}</span>`,
          s.leads ? 'kolom <span class="num">leads</span> — vijf overlappende actietypen opgeteld, dus geen uniek aantal mensen'
                  : 'geen leadacties gemeld in deze selectie')}
        ${CRM.ui.kpi('Kosten per leadactie', `<span class="num">${s.cpl?CRM.euro(s.cpl,2):'—'}</span>`,
          s.cpl ? 'uitgegeven ÷ leadacties — te laag zodra leads dubbel geteld worden' : 'geen leadacties om door te delen')}
        ${CRM.ui.kpi('Bereik en kliks', `<span class="num">${fmtN(s.kliks)}</span>`,
          `kliks · <span class="num">${fmtN(s.imp)}</span> impressies · CPC <span class="num">${s.cpc?CRM.euro(s.cpc,2):'—'}</span> · CTR <span class="num">${s.ctr!=null?CRM.pct(s.ctr,2):'—'}</span><br>
           Meta-veld <span class="num">clicks</span>: inclusief likes, reacties en delen, dus geen doorkliks. Daarom
           staan deze vier alleen hier en niet in de tabellen eronder.`)}
      </div>
      ${scheveLeads(s) ? leadControleHtml(s) : ''}
      ${periodeHtml(rows, s)}

      <div class="card mkt-kaart">
        <div class="card-h"><div class="h2">Per campagne</div>
          <span class="meta">Klik een regel open voor advertentiesets en advertenties</span></div>
        <div class="tblwrap" style="border:none;border-radius:0">
          <table class="tbl mkt-tbl">
            <thead><tr>
              <th>Campagne</th><th class="n">Uitgegeven</th>
              <th style="width:96px">Aandeel uitgaven</th>
              <th class="n">Leadacties</th><th class="n">€ / leadactie</th>
            </tr></thead>
            <tbody id="mkt_camp">${campagneRijen()}</tbody>
            ${totaalRij()}
          </table>
        </div>
        <div class="card-f"><span class="meta">Uitgaven, leadacties en de kosten per leadactie — meer niet.
          Kliks, CPC en CTR stonden hier ook, maar die rekenen met álle kliks in plaats van doorkliks; ze staan nu
          nog één keer bovenaan, met de kanttekening erbij.${laatst
            ? ` Laatste synchronisatie met Meta: <span class="num">${h(laatst)}</span>.` : ''}</span></div>
      </div>

      <div class="mkt-verantwoording">
        <span class="label">Verantwoording</span>
        <p class="sub" style="margin:2px 0 14px;max-width:78ch">Deze drie blokken stonden tussen de cijfers in en
          duwden de grafiek en de campagnes van het scherm af. Ze horen erbij — je moet kunnen nagaan waar een getal
          vandaan komt — maar ze horen ónder wat ze verantwoorden, niet erboven.</p>
        ${herkomstHtml(s)}
        ${scheveLeads(s) ? '' : leadControleHtml(s)}
        ${betaaldHtml()}
      </div>`}`;
  }

  /* Geen advertentie-uitgaven wil niet zeggen geen leads: een klant kan Meta-
     leads hebben zonder dat er in dit venster een campagne op zijn naam liep.
     Dat hoort in de lege staat te staan, anders lijkt het alsof Meta hier
     niets heeft opgeleverd. */
  function leegLeadsTekst(){
    const cut = vensterVanaf();
    const n = index().leads.filter(r => r.dk && (!cut || r.dk >= cut) && (!M.klant
      || (M.klant === '__niet__' ? !r.kkey : r.kkey === M.klant))).length;
    if(!n) return '';
    return ` Er ${n===1?'staat':'staan'} in deze selectie wél ${n} lead${n===1?'':'s'} met bron Meta in het CRM —`
      + ' die zijn dus binnengekomen zonder dat er in dit venster uitgaven aan deze klant toegerekend konden worden.';
  }

  /* ── Uitgaven per dag, week of maand ──
     Eén kaart met de grafiek en de tabel eronder, zodat de staaf die opvalt en
     de regel die je wilt narekenen naast elkaar staan en niet twee kaarten uit
     elkaar liggen. Beide volgen dezelfde tijdstap, hetzelfde venster en
     hetzelfde klantfilter. */
  function emmers(rows){
    const g = groep();
    const per = new Map();
    let zonderDatum = 0;
    for(const r of rows){
      const d = String(r.datum||'');
      if(!isDatum(d)){ zonderDatum += N(r.uitgegeven); continue; }
      const k = g.sleutel(d);
      let e = per.get(k);
      if(!e){ e = {k, rows:[]}; per.set(k, e); }
      e.rows.push(r);
    }
    /* Lege perioden horen erbij: een week zonder uitgaven is informatie, geen
       reden om de week over te slaan. We lopen van de eerste dag van het
       venster tot vandaag en zorgen dat elke tijdstap bestaat. */
    const dagen = rows.map(r => r.datum).filter(isDatum).sort();
    const start = vensterVanaf() || dagen[0] || CRM.todayISO();
    const eind  = CRM.todayISO();
    const loop  = new Date(start + 'T12:00');
    const stop  = new Date(eind + 'T12:00');
    for(let i = 0; i < 1200 && loop <= stop; i++){
      const d = loop.toLocaleDateString('sv-SE');
      const k = g.sleutel(d);
      if(!per.has(k)) per.set(k, {k, rows:[]});
      loop.setDate(loop.getDate() + 1);
    }
    const lijst = [...per.values()].sort((a,b) => a.k.localeCompare(b.k));
    lijst.forEach(e => { e.s = stat(e.rows); });
    return {lijst, zonderDatum};
  }

  function periodeHtml(rows, tot){
    const g = groep();
    const {lijst, zonderDatum} = emmers(rows);
    if(!lijst.length) return '';
    const staven = lijst.slice(-g.staven);
    const max = Math.max(...staven.map(e => e.s.spend), 0.01);
    const getoond = staven.length < lijst.length;

    const grafiek = staven.some(e => e.s.spend > 0)
      ? `<div class="mkt-strook"><div class="mkt-dagen">${staven.map(e => {
          const cpl = e.s.leads ? e.s.spend/e.s.leads : null;
          const titel = `${g.lang(e.k)} — ${CRM.euro(e.s.spend,2)} · ${fmtN(e.s.kliks)} kliks · ${fmtN(e.s.leads)} leadacties${cpl?` · ${CRM.euro(cpl,2)} per leadactie`:''}`;
          const wknd = M.groep === 'dag' && [0,6].includes(new Date(e.k+'T12:00').getDay());
          return `<div class="mkt-dag${wknd?' we':''}" title="${h(titel)}">
            <div class="mkt-dagtop num">${e.s.leads || ''}</div>
            <div class="mkt-dagbar"><i style="height:${e.s.spend > 0 ? Math.max(2, Math.round(e.s.spend/max*100)) : 0}%"></i></div>
            <div class="mkt-daglbl"><b class="num">${h(g.kort(e.k))}</b><span>${h(g.onder(e.k))}</span></div>
          </div>`;
        }).join('')}</div></div>
        <div class="row" style="margin-top:12px"><span class="meta">Staafhoogte = uitgegeven per ${h(g.enkel)} ·
          getal boven de staaf = leadacties${M.groep !== 'dag' ? ` · de laatste ${h(g.enkel)} loopt nog en is dus lager dan hij wordt` : ''}${
          getoond ? ` · de grafiek toont de laatste ${staven.length} ${h(g.meer)}, de tabel de hele periode` : ''}</span></div>`
      : CRM.ui.leeg(`Geen uitgaven in deze ${h(g.meer)}`,
          'Er stond geen advertentie aan in deze selectie. Zonder advertenties komen er geen Meta-leads binnen.',
          `<a class="btn" href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager openen ↗</a>`);

    /* De tijdstap waar vandaag in valt is nog niet vol. Zonder dat erbij te
       zeggen leest de laatste staaf als een daling, terwijl de week gewoon nog
       moet aflopen — precies de verkeerde conclusie om budget op te baseren. */
    const nuSleutel = g.sleutel(CRM.todayISO());
    const rij = e => {
      const s = e.s;
      const deelP = tot.spend ? s.spend/tot.spend*100 : 0;
      const loopt = e.k === nuSleutel;
      return `<tr${s.rijen ? '' : ' class="mkt-stil"'}>
        <td><b>${h(g.lang(e.k))}</b>${loopt ? ` <span class="chip">loopt nog</span>` : ''}${
          s.rijen ? '' : `<div class="rowsub">geen advertentie aan</div>`}</td>
        <td class="n num">${CRM.euro(s.spend)}</td>
        <td>${CRM.ui.bar(deelP)}</td>
        <td class="n num">${fmtN(s.leads)}</td>
        <td class="n num">${s.cpl?CRM.euro(s.cpl,2):'<span class="meta">—</span>'}</td>
      </tr>`;
    };
    return `<div class="card mkt-kaart">
      <div class="card-h"><div class="h2">${h(g.titel)}</div>
        <span class="meta">${h(vensterTekst())}${M.klant ? ` · ${h(klantLabel())}` : ''}</span></div>
      <div class="card-b">${grafiek}</div>
      <div class="tblwrap" style="border:none;border-radius:0;border-top:1px solid var(--line)">
        <table class="tbl mkt-tbl"><thead><tr>
          <th>${h(g.titel.replace('Per ','').replace(/^./, c => c.toUpperCase()))}</th>
          <th class="n">Uitgegeven</th><th style="width:96px">Aandeel</th>
          <th class="n">Leadacties</th><th class="n">€ / leadactie</th>
        </tr></thead>
        <tbody>${lijst.slice().reverse().slice(0, 200).map(rij).join('')}</tbody>
        <tfoot><tr><td><b>Hele periode</b></td>
          <td class="n num">${CRM.euro(tot.spend)}</td><td></td>
          <td class="n num">${fmtN(tot.leads)}</td>
          <td class="n num">${tot.cpl?CRM.euro(tot.cpl,2):'<span class="meta">—</span>'}</td>
        </tr></tfoot>
      </table></div>
      <div class="card-f"><span class="meta">Optelling van de dagregels uit <span class="num">mkt_meta_stats</span>
        (<span class="num">${fmtN(tot.rijen)}</span> regels in deze selectie). De kosten per leadactie worden per
        ${h(g.enkel)} opnieuw berekend, niet gemiddeld — een gemiddelde van gemiddelden weegt een stille dag even zwaar
        als een drukke.
        ${zonderDatum > 0 ? `<b>${h(CRM.euro(zonderDatum))}</b> aan uitgaven heeft geen leesbare datum en staat in geen enkele ${h(g.enkel)}.` : ''}</span></div>
    </div>`;
  }

  function leegMeta(){
    const knop = `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`;
    return CRM.ui.leeg('Nog geen Meta-data gesynchroniseerd',
      'Zodra de dagelijkse Meta-synchronisatie draait, verschijnen hier de uitgaven, kliks, CPC en kosten per lead. De koppeling en de tabel worden vanuit het marketingbord beheerd.', knop);
  }

  function adviesHtml(adv, verborgen){
    if(!M.meta.length) return '';
    const alleAgent = agentAdviezen();
    /* Ook de adviezen van de agent horen bij een campagne, en dus bij een
       klant. Staat er geen campagne bij, dan valt het advies aan niemand toe
       te rekenen en blijft het staan — verbergen zou het onvindbaar maken. */
    const agent = M.klant
      ? alleAgent.filter(b => !String(b.campagne||'').trim()
          || (M.klant === '__niet__' ? !klantVan(b).kkey : klantVan(b).kkey === M.klant))
      : alleAgent;
    verborgen = (verborgen || 0) + (alleAgent.length - agent.length);
    /* Wat het klantfilter wegneemt zeggen we erbij. Anders lijkt het alsof er
       geen adviezen zijn terwijl ze alleen bij een andere klant staan. */
    const gefilterd = verborgen > 0
      ? `<div class="rowsub" style="margin-top:4px"><span class="num">${fmtN(verborgen)}</span>
         ${verborgen===1?'advies staat':'adviezen staan'} bij een andere klant en ${verborgen===1?'is':'zijn'} nu verborgen.</div>` : '';
    if(!adv.length && !agent.length) return `<div class="note ok" style="margin-bottom:18px">Geen openstaande advertentie-adviezen${
      M.klant ? ` voor ${h(klantLabel())}` : ''} — alles loopt binnen de bandbreedte.${gefilterd}</div>`;
    /* Rood = ingrijpen, oranje = urgentie/waarschuwing, olijf = positief
       (zelfde betekenis als .pos elders in de app). */
    const kleurVar = {red:'var(--red)', amber:'var(--amber)', green:'var(--olive)'};
    const knop = (a, keuze, tekst) =>
      `<button class="btn ghost sm" data-bes="${h(keuze)}|${h(a.advertentie)}|${h(a.campagne)}">${h(tekst)}</button>`;
    /* De mediabuyer-agent schrijft zijn eigen bevindingen in dezelfde tabel.
       Die stonden hier nooit op het scherm — een advies dat niemand leest is
       geen advies. */
    const agentRij = b => `
      <div class="mkt-advies">
        <span class="dot" style="background:var(--blue)"></span>
        <div class="mkt-a-t">
          <div><b>${b.besluit === 'budget' ? 'Budgetadvies' : 'Advies van de agent'}</b>
            <span class="meta">— ${h(b.advertentie)}${b.campagne?` · ${h(b.campagne)}`:''}</span></div>
          <div class="meta">${h(b.note || 'Geen toelichting meegegeven.')}</div>
          <div class="meta">${h(b.door || 'agent')} · ${h(CRM.geleden(b.created_at))}</div>
        </div>
        <div class="row tight mkt-a-k">
          <button class="btn ghost sm" data-afrond="${h(b.id)}">Gezien</button>
        </div>
      </div>`;
    const aantal = adv.length + agent.length;
    return `<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Adviezen</div>
        <span class="meta">${aantal===1?'1 advertentie vraagt':aantal+' advertenties vragen'} om een besluit${
          verborgen > 0 ? ` · ${fmtN(verborgen)} verborgen door het klantfilter` : ''}</span></div>
      <div>${agent.map(agentRij).join('')}${adv.map(a => `
        <div class="mkt-advies">
          <span class="dot" style="background:${kleurVar[a.kleur]}"></span>
          <div class="mkt-a-t">
            <div><b>${h(a.titel)}</b> <span class="meta">— ${h(a.advertentie)} · ${h(a.campagne)}</span></div>
            <div class="meta">${h(a.uitleg)}</div>
            ${a.cijfers ? `<div class="meta num">${h(a.cijfers)}</div>` : ''}
          </div>
          <div class="row tight mkt-a-k">
            ${a.keuzes.includes('stop')      ? knop(a,'stop','Stopzetten') : ''}
            ${a.keuzes.includes('opschalen') ? knop(a,'opschalen','Opschalen') : ''}
            ${a.keuzes.includes('negeer')    ? knop(a,'negeer','Prima zo') : ''}
            ${a.keuzes.includes('adsmanager')? `<a class="btn ghost sm" href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager ↗</a>` : ''}
            ${a.keuzes.includes('afronden')  ? `<button class="btn ghost sm" data-afrond="${h(a.besluitId)}">Afronden</button>` : ''}
          </div>
        </div>`).join('')}</div>
      <div class="card-f"><span class="meta">Een besluit verbergt het advies 14 dagen. Eén uitzondering: een advertentie
        die je stopzet blijft staan tot er echt geen geld meer doorheen gaat — stoppen gebeurt in
        <a href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager</a>, niet hier.</span></div>
    </div>`;
  }

  /* Campagne → advertentieset → advertentie, uitklapbaar */
  function boom(){
    const camps = new Map();
    zichtbareRijen().forEach(r => {
      const c = r.campagne || '—', s = r.advertentieset || '—', a = r.advertentie || '—';
      if(!camps.has(c)) camps.set(c, {naam:c, rows:[], sets:new Map()});
      const C = camps.get(c); C.rows.push(r);
      if(!C.sets.has(s)) C.sets.set(s, {naam:s, rows:[], ads:new Map()});
      const S = C.sets.get(s); S.rows.push(r);
      if(!S.ads.has(a)) S.ads.set(a, {naam:a, rows:[]});
      S.ads.get(a).rows.push(r);
    });
    return camps;
  }
  /* De aandeelbalk zet de uitgaven van deze regel af tegen het totaal van
     de periode. Vier cijfers per regel, niet zeven: kliks, CPC en CTR zijn
     hier weggehaald omdat ze op álle kliks rekenen. Wie ze nodig heeft vindt
     ze in het kengetal bovenaan, mét die kanttekening erbij. */
  function cijferCellen(s, tot){
    const deel = tot.spend ? s.spend/tot.spend : 0;
    return `<td class="n num">${CRM.euro(s.spend)}</td>
      <td>${CRM.ui.bar(deel*100)}</td>
      <td class="n num">${fmtN(s.leads)}</td>
      <td class="n num">${s.cpl?CRM.euro(s.cpl,2):'—'}</td>`;
  }
  const KOLOMMEN = 5;                 // campagnenaam + vier cijferkolommen
  function campagneRijen(){
    const camps = [...boom().values()];
    if(!camps.length){
      const knop = `<a class="btn" href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager openen ↗</a>`;
      return `<tr><td colspan="${KOLOMMEN}" style="padding:0">${CRM.ui.leeg('Geen advertenties in deze periode',
        'Er liep geen advertentie in dit venster. Kies hierboven een langere periode, of zet een campagne aan — zonder advertenties komen er geen Meta-leads binnen.', knop)}</td></tr>`;
    }
    const tot = stat(zichtbareRijen());
    let html = '';
    camps.sort(opWaarde).forEach(c => {
      const ck = 'c:'+c.naam, cOpen = M.open.has(ck);
      html += `<tr class="clickable" data-uit="${h(ck)}">
        <td><span class="mkt-caret ${cOpen?'op':''}">▸</span><b>${h(c.naam)}</b>
          <div class="rowsub">${c.sets.size} advertentieset${c.sets.size===1?'':'s'}</div></td>
        ${cijferCellen(stat(c.rows), tot)}</tr>`;
      if(!cOpen) return;
      [...c.sets.values()].sort(opWaarde).forEach(s => {
        const sk = 's:'+c.naam+'|'+s.naam, sOpen = M.open.has(sk);
        html += `<tr class="clickable mkt-r1" data-uit="${h(sk)}">
          <td class="mkt-n1"><span class="mkt-caret ${sOpen?'op':''}">▸</span>${h(s.naam)}</td>
          ${cijferCellen(stat(s.rows), tot)}</tr>`;
        if(!sOpen) return;
        [...s.ads.values()].sort(opWaarde).forEach(a => {
          html += `<tr class="mkt-r2"><td class="mkt-n2">${h(a.naam)}</td>
            ${cijferCellen(stat(a.rows), tot)}</tr>`;
        });
      });
    });
    return html;
  }
  /* Totaalregel — zelfde patroon als de tabellen in Performance, zodat je
     de campagnes tegen het geheel kunt lezen zonder zelf op te tellen. */
  function totaalRij(){
    const tot = stat(zichtbareRijen());
    if(!tot.imp && !tot.kliks && !tot.spend) return '';
    return `<tfoot><tr><td><b>Alle campagnes</b></td>
      <td class="n num">${CRM.euro(tot.spend)}</td>
      <td></td>
      <td class="n num">${fmtN(tot.leads)}</td>
      <td class="n num">${tot.cpl?CRM.euro(tot.cpl,2):'—'}</td></tr></tfoot>`;
  }

  /* dagStrook() is vervangen door periodeHtml(): dezelfde strook, maar dan
     op de gekozen tijdstap, in het gekozen venster en voor de gekozen klant. */

  /* ── 6b. Rendement (cohorten) ── */
  /* Doorklikken: elk lijstje krijgt een sleutel in M.drill, de knop draagt
     alleen die sleutel. Zo staan er geen id's in de HTML die geëscaped
     moeten worden en blijft de lijst precies wat er geteld is. */
  function drill(sleutel, rijen){ M.drill.set(sleutel, rijen); return sleutel; }

  function ketenHtml(){
    if(!M.meta.length && M.metaFout) return foutBlok('De Meta-cijfers', M.metaFout);
    M.drill = new Map();
    const D = index();
    /* Dit tabblad is op 3 sep 2026 opgevolgd door het hoofdstuk Trechter op
       Performance (zelfde motor, mét rendement per campagne). Eén versie
       lang staat hier een verwijzing; daarna vervalt de tab (akkoord
       Tjeerd, D1). */
    const verwijs = `<div class="note" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span>Dit overzicht is verhuisd: het hoofdstuk <b>Trechter</b> op Performance toont dezelfde cohorten,
      mét de kosten per stap en het rendement per campagne. Dit tabblad verdwijnt binnenkort.</span>
      <button class="btn sm" onclick="CRM.ga('performance')">→ Performance</button></div>`;
    if(!D.maanden.length) return `${verwijs}${M.metaFout ? foutBlok('De Meta-cijfers', M.metaFout) : ''}
      <div class="card"><div class="card-b">${CRM.ui.leeg('Nog niets te meten',
        'Er zijn geen Meta-uitgaven en geen leads met bron Meta. Zodra de dagelijkse synchronisatie draait of de eerste Meta-lead binnenkomt, staat hier per maand wat het geld heeft opgeleverd.',
        `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`)}</div></div>`;

    /* Cohortkeuze geldig houden: standaard de nieuwste maand met leads,
       anders de nieuwste maand met uitgaven. */
    const metLeads = D.maanden.filter(mk => D.leads.some(r => r.mk === mk));
    if(M.cohort !== 'alles' && !D.maanden.includes(M.cohort)) M.cohort = metLeads[0] || D.maanden[0];
    const mks = M.cohort === 'alles' ? D.maanden : [M.cohort];
    const inCohort = new Set(mks);
    const cLeads = D.leads.filter(r => inCohort.has(r.mk));
    const cUit   = D.uitRijen.filter(r => inCohort.has(r.mk));
    /* Dubbele aanmeldingen van ditzelfde cohort — alleen voor het gatenblok,
       ze tellen in geen enkele tabel mee. */
    const cDub   = D.dubbels.filter(r => inCohort.has(r.mk));

    return `
      ${verwijs}
      ${uitlegHtml()}
      ${maandTabelHtml(D)}
      ${cohortKopHtml(D, cLeads, cUit)}
      ${trechterHtml(cLeads)}
      ${botConversieHtml(cLeads)}
      ${groepTabelHtml(D, cLeads, cUit, 'klant')}
      ${groepTabelHtml(D, cLeads, cUit, 'vac')}
      ${gatenHtml(D, cLeads, cUit, cDub)}`;
  }

  /* De meetdefinities horen op het scherm te staan, niet in iemands hoofd.
     Over drie maanden moet na te gaan zijn wat "gekwalificeerd" betekende. */
  function uitlegHtml(){
    const regel = (w, t) => `<div class="mkt-def"><b>${h(w)}</b><span>${h(t)}</span></div>`;
    return `<div class="vlak mkt-uitleg">
      <div class="row">
        <span class="label" style="margin:0">Hoe we dit tellen</span>
        <div class="spacer"></div>
        <button class="btn sm ghost" id="mkt_uitleg">${M.uitleg ? 'Uitleg verbergen' : 'Uitleg tonen'}</button>
      </div>
      <p class="sub" style="margin:8px 0 0;max-width:78ch">Een cohort is een <b>maand van binnenkomst</b>.
        De leads van juni blijven bij juni horen, ook als ze pas in september geplaatst worden. Zo vergelijk je
        de uitgaven van een maand met wat díé leads opleverden — en niet met plaatsingen van mensen die maanden
        eerder binnenkwamen.</p>
      ${M.uitleg ? `<div class="mkt-defs">
        ${regel('Cohort', 'De maand waarin de lead binnenkwam (veld binnen_op, lokale tijd). Niet de maand van de plaatsing.')}
        ${regel('Binnengekomen', 'Alle leads in crm_leads met bron Meta en een binnenkomstdatum in die maand. Dubbele aanmeldingen (botstatus "Dubbel") tellen niet mee: die persoon zit al in de telling via zijn eerste aanmelding. Hoeveel dat er zijn staat in het blok "Wat we niet konden meten" onderaan.')}
        ${regel('Nog niet opgepakt', 'Status "Nieuw" — er is nog niemand mee bezig geweest. Dit is werk dat blijft liggen.')}
        ${regel('Niet bereikt', 'Status "Geen gehoor". Wel gebeld, geen contact. Iets anders dan blijven liggen: dit vraagt om een tweede poging of een appje.')}
        ${regel('Afgevallen aan de telefoon', 'Status "Niet geschikt" — door de AM beoordeeld en afgevallen.')}
        ${regel('Gekwalificeerd', 'Botstatus "Gekwalificeerd", "Twijfelgeval" of "Potentieel andere vacature" — sinds 27 aug 2026 het oordeel van de WhatsApp-bot, los van de AM-status. Dit meet wat de advertentie opleverde; wat de AM er vervolgens mee doet staat in de andere stappen.')}
        ${regel('Advertentie of opvolging', 'Twee kanten van dezelfde uitval. "Blijft liggen bij ons" = status Nieuw of niet bereikt, afgezet tegen alle binnengekomen leads. "Valt af zodra we ze spreken" = niet geschikt, afgezet tegen alleen de leads die de AM beoordeelde (Potentieel, Intake ingepland of Niet geschikt). Die tweede noemer is bewust smaller: een cohort waarin niemand gebeld is zou anders lijken alsof de advertentie goed was.')}
        ${regel('Doorgeschoten naar kandidaat', 'De lead heeft een kandidaat_id, óf er staat een kandidaat met deze lead_id. Eén van beide is genoeg.')}
        ${regel('Voorgesteld', 'Die kandidaat staat nu op Voorgesteld of verder, of stond daar ooit volgens de historie.')}
        ${regel('Geplaatst', 'Die kandidaat heeft getekend (Contract getekend of Gestart) of is daarna gestopt. Een latere stop maakt de plaatsing niet ongedaan.')}
        ${regel('Nog in behandeling', 'De lead of de gekoppelde kandidaat is nog niet klaar: leadstatus nog open, of de kandidaat staat nog in de pijplijn. Zolang dat zo is heet het cohort "nog niet uitgewerkt" en zijn de uitkomsten voorlopig.')}
        ${regel('Uitgaven per klant', 'Een Meta-campagne is een klant. We herkennen de klant aan de klantnaam in de campagnenaam; lukt dat niet, dan aan de leads die diezelfde campagnenaam dragen (minstens twee, en een duidelijke meerderheid). Lukt geen van beide, dan staan de uitgaven apart als "niet toegewezen" — ze worden nooit stilzwijgend over de andere klanten verdeeld.')}
        ${regel('Uitgaven per vacature', 'Een advertentieset is een functie. We zoeken bij de klant een vacature met die functienaam; vinden we die niet, dan blijft de advertentieset als eigen regel staan.')}
        ${regel('Kosten per plaatsing', 'Uitgaven van het cohort gedeeld door de plaatsingen uit dat cohort. Bij een cohort dat nog loopt staat er "voorlopig" bij: dat getal kan alleen nog dalen.')}
      </div>` : ''}
    </div>`;
  }

  /* De maandvergelijking. Dit is het blok dat de vraag beantwoordt:
     is deze maand écht slechter, of gewoon nog niet klaar? */
  function maandTabelHtml(D){
    const rijen = D.maanden.slice(0, 15).map(mk => {
      const lds = D.leads.filter(r => r.mk === mk);
      const uit = D.uitRijen.filter(r => r.mk === mk);
      const t = trechter(lds);
      const spend = somBedrag(uit);
      return {mk, t, spend, lds,
              niet: somBedrag(uit.filter(r => !r.kkey)),
              formulieren: uit.reduce((s,r) => s + r.formulieren, 0)};
    });
    const nu = dezeMaand();
    const cel = r => {
      const kpp = kost(r.spend, r.t.geplaatst);
      const voorlopig = !r.t.uitgewerkt && r.t.binnen > 0;
      const status = !r.t.binnen
        ? `<span class="meta">geen leads uit dit cohort</span>`
        : r.t.uitgewerkt
          ? `<span class="chip green">uitgewerkt</span>`
          : `<span class="chip amber">nog niet uitgewerkt</span>
             <div class="rowsub"><span class="num">${fmtN(r.t.loopt)}</span> van <span class="num">${fmtN(r.t.binnen)}</span> nog in behandeling</div>`;
      const sleutel = drill('maand:'+r.mk, r.lds);
      return `<tr class="clickable ${M.cohort===r.mk?'mkt-op':''}" data-cohort="${h(r.mk)}">
        <td><b>${h(maandLabel(r.mk))}</b>${r.mk===nu?` <span class="chip">loopt nog</span>`:''}
          ${r.niet > 0 ? `<div class="rowsub">${eur(r.niet)} niet aan een klant toegewezen</div>` : ''}</td>
        <td class="n num">${eur(r.spend)}</td>
        <td class="n num">${r.t.binnen ? `<button class="btn sub sm" data-drill="${h(sleutel)}" data-drilltitel="Leads van ${h(maandLabel(r.mk))}">${fmtN(r.t.binnen)}</button>` : '<span class="meta">0</span>'}</td>
        <td class="n num">${fmtN(r.t.gekwal)}<div class="rowsub">${pctV(r.t.gekwal, r.t.binnen)}</div></td>
        <td class="n num">${fmtN(r.t.geplaatst)}</td>
        <td class="n num">${eur(kost(r.spend, r.t.binnen), 2)}</td>
        <td class="n num">${kpp == null ? '<span class="meta">—</span>' : eur(kpp)}
          ${kpp != null && voorlopig ? `<div class="rowsub">voorlopig</div>` : ''}</td>
        <td>${status}</td>
      </tr>`;
    };
    return `<div class="card mkt-kaart">
      <div class="card-h"><div class="h2">Per maand: wat leverden de leads van die maand op?</div>
        <span class="meta">cohort = maand van binnenkomst</span>
        <div class="spacer"></div>
        <button class="btn sm ${M.cohort==='alles'?'':'ghost'}" data-cohort="alles">Alle maanden samen</button></div>
      <div class="tblwrap" style="border:none;border-radius:0">
        <table class="tbl mkt-tbl"><thead><tr>
          <th>Cohort</th><th class="n">Uitgegeven</th><th class="n">Leads</th>
          <th class="n">Gekwalificeerd</th><th class="n">Geplaatst</th>
          <th class="n">€ per lead</th><th class="n">€ per plaatsing</th><th>Rijpheid</th>
        </tr></thead><tbody>${rijen.map(cel).join('')}</tbody></table>
      </div>
      <div class="card-f"><span class="meta">Klik een maand om hem hieronder uit te splitsen. Uitgaven zijn de Meta-uitgaven ván die maand;
        plaatsingen zijn de plaatsingen die uit de leads van die maand zijn voortgekomen, ongeacht wanneer ze getekend hebben.</span></div>
    </div>`;
  }

  /* Kop van het gekozen cohort: de vijf cijfers waar het om draait. */
  function cohortKopHtml(D, cLeads, cUit){
    const t = trechter(cLeads);
    const spend = somBedrag(cUit);
    const niet  = somBedrag(cUit.filter(r => !r.kkey));
    const kpp   = kost(spend, t.geplaatst);
    const titel = M.cohort === 'alles' ? 'Alle maanden samen' : maandLabel(M.cohort);
    const rijp = !t.binnen ? '' : t.uitgewerkt
      ? `<span class="chip green">cohort uitgewerkt</span>`
      : `<span class="chip amber">nog niet uitgewerkt — <span class="num">${fmtN(t.loopt)}</span> van <span class="num">${fmtN(t.binnen)}</span> in behandeling</span>`;
    return `<div class="mkt-cohortkop">
      <div class="row"><div class="h2">${h(titel)}</div>${rijp}</div>
      <div class="grid c4" style="margin-top:12px">
        ${CRM.ui.kpi('Uitgegeven aan Meta', `<span class="num">${eur(spend)}</span>`,
          niet > 0 ? `waarvan ${eur(niet)} niet aan een klant toe te wijzen` : 'volledig aan een klant toegewezen', 'accent')}
        ${CRM.ui.kpi('Leads binnengekomen', `<span class="num">${fmtN(t.binnen)}</span>`,
          t.binnen ? `${eur(kost(spend, t.binnen), 2)} per lead` : 'geen leads in dit cohort')}
        ${CRM.ui.kpi('Gekwalificeerd', `<span class="num">${fmtN(t.gekwal)}</span>`,
          t.binnen ? `${pctV(t.gekwal, t.binnen)} van de leads${spend > 0 ? ` · ${eur(kost(spend, t.gekwal), 2)} per stuk` : ''}` : '—')}
        ${CRM.ui.kpi('Kosten per plaatsing', `<span class="num">${kpp == null ? '—' : eur(kpp)}</span>`,
          t.geplaatst
            ? `${fmtN(t.geplaatst)} plaatsing${t.geplaatst===1?'':'en'}${t.gestopt?` · ${fmtN(t.gestopt)} inmiddels gestopt`:''}${t.uitgewerkt?'':' — voorlopig'}`
            : (t.loopt ? `nog geen plaatsing, ${fmtN(t.loopt)} lopen nog` : 'nog geen plaatsing'), 'accent')}
      </div>
    </div>`;
  }

  /* ── Advertentie of opvolging? ──
     Tjeerds vraag, letterlijk: "waar vallen ze af, en ligt dat aan de
     advertentie of aan de opvolging?" Dat is een andere vraag dan waar de
     trechter het smalst is, en hij is te beantwoorden met wat er al staat.

     Twee kanten, uit de leadstatus (sinds 27 aug 2026 de vijf van het
     nieuwe model):
     · OPVOLGING — de lead is nooit beoordeeld. Status 'Nieuw' (er is niemand
       mee bezig geweest) of 'Geen gehoor'. Wat de advertentie opleverde
       weten we van deze mensen simpelweg niet.
     · ADVERTENTIE — de lead is wél gesproken en viel af op 'Niet geschikt'.
       Dan trok de advertentie de verkeerde mensen aan.

     'Geen gehoor' zit bewust aan de opvolgingskant, maar met een
     kanttekening op het scherm: iemand die niet opneemt kan ook een
     laag-intentie lead uit de advertentie zijn. We doen niet alsof die
     scheiding scherper is dan hij is.

     De opvolgingskant meet tegen álle binnengekomen leads; de
     advertentiekant alleen tegen de leads die we hebben gesproken. Anders
     zou een cohort waarin niemand gebeld is er automatisch uitzien alsof de
     advertentie goed was. */
  function kwaliteitHtml(t, cLeads){
    /* Beoordeeld komt sinds 27 aug 2026 uit het AM-spoor (Potentieel,
       Intake ingepland of Niet geschikt), niet meer uit gekwal + afgeteld:
       gekwal is nu het bot-oordeel en overlapt met alle AM-statussen, dus
       optellen zou dubbel tellen. */
    const beoordeeld = t.beoordeeld;
    const blijftLiggen = t.nieuw + t.nietBereikt;
    /* Zonder één beoordeelde lead valt er over de advertentie niets te
       zeggen. Dan tonen we alleen de opvolgingskant, en zeggen dat erbij. */
    const opvPct = t.binnen > 0 ? blijftLiggen / t.binnen * 100 : 0;
    const advPct = beoordeeld > 0 ? t.afgeteld / beoordeeld * 100 : null;

    /* De conclusie in één zin. Welke kant het zwaarst weegt bepaalt waar de
       winst zit; staan ze dicht bij elkaar, dan zeggen we dát. */
    let slot;
    if(advPct == null){
      slot = `Er is in dit cohort nog geen enkele lead beoordeeld — alles staat op Nieuw of is niet bereikt.
        Over de advertentie valt daarom nog niets te zeggen; de winst zit nu volledig in het opvolgen.`;
    }else if(opvPct >= advPct + 10){
      slot = `Meer leads blijven liggen dan er afvallen op geschiktheid. De winst zit nu in sneller bellen,
        niet in een andere advertentie — de mensen die je wél sprak vielen namelijk niet massaal af.`;
    }else if(advPct >= opvPct + 10){
      slot = `De leads worden wél opgepakt, maar vallen af zodra je ze spreekt. Dat wijst naar de advertentie:
        de targeting of de tekst trekt mensen die het werk niet willen of niet kunnen. Scherpere eisen in de
        advertentietekst schelen hier het meest.`;
    }else{
      slot = `Beide kanten wegen ongeveer even zwaar. Pak de kleinste eerst: sneller opvolgen is meestal binnen
        een week te regelen, een nieuwe advertentie kost langer.`;
    }

    const kant = (lbl, waarde, breedte, onder) => `
      <div class="mkt-kw-r">
        <div class="mkt-kw-l"><b>${h(lbl)}</b><span class="meta">${onder}</span></div>
        <div class="mkt-tr-b"><i style="width:${Math.max(0, Math.min(100, breedte))}%"></i></div>
        <span class="mkt-kw-n num">${waarde}</span>
      </div>`;

    return `<div class="mkt-kw">
      <span class="label">Advertentie of opvolging?</span>
      ${kant('Blijft liggen bij ons', pctV(blijftLiggen, t.binnen), opvPct,
        `<span class="num">${fmtN(t.nieuw)}</span> nooit opgepakt en <span class="num">${fmtN(t.nietBereikt)}</span> niet bereikt,
         van <span class="num">${fmtN(t.binnen)}</span> binnengekomen`)}
      ${kant('Valt af zodra we ze spreken', advPct == null ? '—' : pctV(t.afgeteld, beoordeeld), advPct || 0,
        beoordeeld
          ? `<span class="num">${fmtN(t.afgeteld)}</span> niet geschikt, van
             <span class="num">${fmtN(beoordeeld)}</span> beoordeelde leads`
          : 'nog geen enkele lead beoordeeld')}
      <p class="sub" style="margin:12px 0 0;max-width:74ch">${slot}</p>
      <span class="meta" style="display:block;margin-top:8px">Leads van de laatste dagen staan terecht nog op Nieuw;
        bij een cohort dat nog loopt is de linkerkant dus hoger dan hij blijft. "Niet bereikt" telt hier als opvolging,
        maar wie nooit opneemt kan ook een lead met weinig interesse uit de advertentie zijn — die twee zijn met deze
        gegevens niet uit elkaar te halen.</span>
    </div>`;
  }

  /* De trechter van het gekozen cohort. Eerst wat er mét de lead gebeurde,
     daarna de weg naar de plaatsing. Per stap het aantal en het percentage van
     de vorige stap. De regel "grootste weglek" die hier stond is vervangen
     door kwaliteitHtml: die zei wáár het lekt, dit zegt of het aan de
     advertentie of aan de opvolging ligt — en dat is de vraag die iemand
     's ochtends stelt. */
  function trechterHtml(cLeads){
    const t = trechter(cLeads);
    if(!t.binnen) return `<div class="card mkt-kaart"><div class="card-h"><div class="h2">De trechter</div></div>
      <div class="card-b">${CRM.ui.leeg('Geen leads in dit cohort',
        'In deze maand kwam er geen enkele lead met bron Meta binnen. Er viel dus ook niets af — en er is niets te verdelen over klanten of vacatures. Kies hierboven een andere maand.')}</div></div>`;

    const L = test => cLeads.filter(test);
    const stappen = [
      {k:'binnen',   lbl:'Binnengekomen',               n:t.binnen,      basis:t.binnen,      basisLbl:'',               rijen:cLeads,               uitleg:'alle Meta-leads van dit cohort'},
      {k:'nieuw',    lbl:'Nog niet opgepakt',           n:t.nieuw,       basis:t.binnen,      basisLbl:'binnengekomen',  rijen:L(r => r.nieuw),      uitleg:'status Nieuw — hier ligt werk', waarsch:true},
      {k:'onbereikt',lbl:'Niet bereikt',                n:t.nietBereikt, basis:t.binnen,      basisLbl:'binnengekomen',  rijen:L(r => r.nietBereikt),uitleg:'gebeld, geen gehoor'},
      {k:'afgeteld', lbl:'Afgevallen aan de telefoon',  n:t.afgeteld,    basis:t.binnen,      basisLbl:'binnengekomen',  rijen:L(r => r.afgeteld),   uitleg:'door de AM op niet geschikt gezet'},
      {k:'gekwal',   lbl:'Gekwalificeerd',              n:t.gekwal,      basis:t.binnen,      basisLbl:'binnengekomen',  rijen:L(r => r.gekwal),     uitleg:'door de bot: gekwalificeerd, twijfelgeval of andere vacature', goed:true},
      {k:'door',     lbl:'Doorgeschoten naar kandidaat',n:t.door,        basis:t.gekwal,      basisLbl:'gekwalificeerd', rijen:L(r => r.door),       uitleg:'staat als kandidaat op het bord'},
      {k:'voorg',    lbl:'Voorgesteld',                 n:t.voorgesteld, basis:t.door,        basisLbl:'doorgeschoten',  rijen:L(r => r.voorgesteld),uitleg:'bij een klant voorgesteld'},
      {k:'plaats',   lbl:'Geplaatst',                   n:t.geplaatst,   basis:t.voorgesteld, basisLbl:'voorgesteld',    rijen:L(r => r.geplaatst),  uitleg:'contract getekend', goed:true}
    ];
    const max = Math.max(1, t.binnen);
    const rij = s => {
      const sleutel = drill('stap:'+s.k, s.rijen);
      /* Nul is een lege balk, geen streepje: een sliver bij 0 leest als "een
         beetje", en dat is precies het verschil dat je hier wilt zien. */
      const breedte = s.n ? Math.max(1, Math.round(s.n / max * 100)) : 0;
      return `<div class="mkt-tr-r${s.n===0?' leeg':''}">
        <div class="mkt-tr-l"><b>${h(s.lbl)}</b><span class="meta">${h(s.uitleg)}</span></div>
        <div class="mkt-tr-b"><i class="${s.goed?'goed':s.waarsch?'let':''}" style="width:${breedte}%"></i></div>
        <div class="mkt-tr-n">
          ${s.n ? `<button class="btn sub sm num" data-drill="${h(sleutel)}" data-drilltitel="${h(s.lbl)}">${fmtN(s.n)}</button>`
                : `<span class="num meta">0</span>`}
          <span class="meta">${s.basisLbl ? `${pctV(s.n, s.basis)} van ${h(s.basisLbl)}` : '100%'}</span>
        </div>
      </div>`;
    };
    return `<div class="card mkt-kaart mkt-trechter">
      <div class="card-h"><div class="h2">De trechter van dit cohort</div>
        <span class="meta">${h(M.cohort === 'alles' ? 'alle maanden' : maandLabel(M.cohort))}</span></div>
      <div class="card-b">
        <div class="mkt-tr">${stappen.map(rij).join('')}</div>
        ${kwaliteitHtml(t, cLeads)}
        ${t.anders ? `<p class="meta" style="margin:12px 0 0"><span class="num">${fmtN(t.anders)}</span>
          lead${t.anders===1?'':'s'} valt in geen van de vier statusgroepen — zie het blok onderaan.</p>` : ''}
      </div>
      <div class="card-f"><span class="meta">Klik een aantal om de onderliggende leads te zien. De balk toont het aandeel van alle binnengekomen leads;
        het percentage ernaast is het aandeel van de vorige stap.</span></div>
    </div>`;
  }

  /* ── Bot-conversie per campagne ──────────────────────────────────
     De laag bóven kosten-per-gekwalificeerd (Tjeerd, 28 aug 2026: "heel
     belangrijk"): welke campagne levert mensen die ook écht reageren op
     WhatsApp? Twee campagnes met dezelfde kosten per lead kunnen daar
     compleet verschillen — en een campagne vol zwijgers is duur, hoe
     goedkoop de leads ook lijken. Reactie = de bot registreerde ooit een
     antwoord (bot_reactie_op); kwalificatie = het botoordeel; de score is
     het gemiddelde over de leads die er een kregen. Elke telling is
     doorklikbaar naar de onderliggende leads, net als in de trechter. */
  function botConversieHtml(cLeads){
    /* Alleen tonen zodra er botdata IS — vóór de livegang van de bot zou
       hier een tabel vol nullen staan die alleen maar vragen oproept. */
    const metBot = cLeads.filter(r => r.lead.bot_status || r.lead.bot_reactie_op || r.lead.bot_bericht_op);
    if(!metBot.length) return '';
    const per = new Map();
    for(const r of cLeads){
      const naam = String(r.lead.campagne||'').trim() || '— zonder campagnenaam —';
      if(!per.has(naam)) per.set(naam, {naam, rijen:[], reactie:[], gekwal:[], door:[], scores:[]});
      const g = per.get(naam);
      g.rijen.push(r);
      if(r.lead.bot_reactie_op) g.reactie.push(r);
      if(r.gekwal)              g.gekwal.push(r);
      if(r.door)                g.door.push(r);
      if(r.lead.score != null)  g.scores.push(Number(r.lead.score));
    }
    /* Sinds de migratie van de echte botleads (2 sep 2026) staan hier zo'n
       twintig campagnes; alles uitschrijven maakt de tabel een muur. De
       grootste twaalf vertellen het verhaal, de rest gaat samen in één
       doorklikbare regel. En de groep zonder campagnenaam hoort onderaan,
       hoe groot hij ook is: dat is een invoergat, geen campagne — bovenaan
       zou hij lezen als de best lopende campagne (Tjeerd, 2 sep 2026). */
    const LEEG = '— zonder campagnenaam —';
    const MAX  = 12;
    const opGrootte = [...per.values()].sort((a,b) => b.rijen.length - a.rijen.length);
    const metNaam = opGrootte.filter(g => g.naam !== LEEG);
    const leegG   = opGrootte.find(g => g.naam === LEEG);
    const groepen = metNaam.slice(0, MAX);
    const rest    = metNaam.slice(MAX);
    /* Eén overloper bundelen is gekker dan hem gewoon tonen. */
    if(rest.length === 1) groepen.push(rest[0]);
    else if(rest.length){
      const bundel = {naam:`— nog ${rest.length} kleinere campagnes —`,
                      rijen:[], reactie:[], gekwal:[], door:[], scores:[]};
      for(const g of rest){
        bundel.rijen.push(...g.rijen);     bundel.reactie.push(...g.reactie);
        bundel.gekwal.push(...g.gekwal);   bundel.door.push(...g.door);
        bundel.scores.push(...g.scores);
      }
      groepen.push(bundel);
    }
    if(leegG) groepen.push(leegG);
    const tel = (sleutel, lijst, titel) => lijst.length
      ? `<button class="btn sub sm num" data-drill="${h(drill(sleutel, lijst))}" data-drilltitel="${h(titel)}">${fmtN(lijst.length)}</button>`
      : `<span class="num meta">0</span>`;
    const rij = g => {
      const gem = g.scores.length ? Math.round(g.scores.reduce((s,x)=>s+x,0) / g.scores.length) : null;
      return `<tr>
        <td>${h(g.naam)}</td>
        <td class="n">${tel('botc:b:'+g.naam, g.rijen, g.naam + ' — binnengekomen')}</td>
        <td class="n">${tel('botc:r:'+g.naam, g.reactie, g.naam + ' — reageerde op WhatsApp')}
          <span class="meta">${pctV(g.reactie.length, g.rijen.length)}</span></td>
        <td class="n">${tel('botc:k:'+g.naam, g.gekwal, g.naam + ' — gekwalificeerd')}
          <span class="meta">${pctV(g.gekwal.length, g.rijen.length)}</span></td>
        <td class="n">${gem != null ? `<span class="chip ${gem>=70?'green':gem>=45?'amber':''} num">${gem}</span>` : '<span class="meta">—</span>'}</td>
        <td class="n">${tel('botc:d:'+g.naam, g.door, g.naam + ' — kandidaat geworden')}</td>
      </tr>`;
    };
    return `<div class="card mkt-kaart">
      <div class="card-h"><div class="h2">Bot-conversie per campagne</div>
        <span class="meta">reageert er ook iemand op WhatsApp?</span></div>
      <div class="tblwrap" style="border:none;border-radius:0">
        <table class="tbl mkt-tbl">
          <thead><tr><th>Campagne</th><th class="n">Binnen</th><th class="n">Reactie</th>
            <th class="n">Gekwalificeerd</th><th class="n">Gem. score</th><th class="n">Kandidaat</th></tr></thead>
          <tbody>${groepen.map(rij).join('')}</tbody>
        </table>
      </div>
      <div class="card-f"><span class="meta">Reactie en kwalificatie als aandeel van de binnengekomen leads van
        die campagne, binnen dit cohort — grootste campagnes eerst, dubbele aanmeldingen tellen niet mee. Een
        campagne met goedkope leads maar een laag reactiepercentage is in werkelijkheid de duurste — verschuif
        budget naar waar gereageerd én gekwalificeerd wordt.</span></div>
    </div>`;
  }

  /* Per klant en per vacature — dezelfde kolommen, zodat je van "waar gaat het
     geld heen" naar "waar rendeert het" kunt lezen zonder om te schakelen. */
  function groepTabelHtml(D, cLeads, cUit, soort){
    const perKlant = soort === 'klant';
    const sort = perKlant ? M.kSort : M.vSort;
    const groepen = new Map();
    const zorg = (key, label, sub) => {
      if(!groepen.has(key)) groepen.set(key, {key, label, sub:sub||'', spend:0, rijen:[],
        campagnes:new Set(), losseSet:false, geenKlant:false, leadZonderKlant:false});
      return groepen.get(key);
    };
    for(const r of cLeads){
      const key = perKlant ? ('k:' + (r.kkey || '__leeg__'))
                           : ('v:' + (r.kkey || '__leeg__') + '§f:' + r.fkey);
      const g = zorg(key, r.klant || 'Klant onbekend', perKlant ? '' : (r.functie || 'vacature onbekend'));
      if(!r.klant) g.leadZonderKlant = true;
      g.rijen.push(r);
    }
    for(const u of cUit){
      const key = perKlant
        ? ('k:' + (u.kkey || '__niet__'))
        : ('v:' + (u.kkey || '__niet__') + (u.fkey ? '§f:' + u.fkey : '§s:' + fKey(u.set)));
      const label = u.kkey ? (u.klant || 'Klant onbekend') : 'Niet aan een klant toegewezen';
      const sub   = perKlant ? '' : (u.functie || u.set || 'zonder advertentieset');
      const g = zorg(key, label, sub);
      g.spend += u.bedrag;
      g.campagnes.add(u.campagne);
      if(!u.kkey) g.geenKlant = true;
      if(u.kkey && !u.fkey) g.losseSet = true;
    }
    const rijen = [...groepen.values()].map(g => {
      const t = trechter(g.rijen);
      /* Geen uitgaven toegewezen ⇒ geen kostprijs, ook niet "€ 0,00". Nul zou
         lezen als "deze leads waren gratis", terwijl het betekent dat we de
         campagne niet aan deze klant of vacature konden koppelen. */
      const s = g.spend > 0 ? g.spend : null;
      return {...g, t,
        leads:t.binnen, gekwal:t.gekwal, geplaatst:t.geplaatst, loopt:t.loopt,
        cpl:kost(s, t.binnen), cpq:kost(s, t.gekwal), cpp:kost(s, t.geplaatst)};
    });
    if(!rijen.length) return '';

    const waarde = r => {
      const v = r[sort.k];
      if(sort.k === 'label') return (r.label + ' ' + r.sub).toLowerCase();
      return (v == null || isNaN(v)) ? -Infinity : v;
    };
    rijen.sort((a,b) => {
      const x = waarde(a), y = waarde(b);
      if(typeof x === 'string') return sort.dir * String(x).localeCompare(String(y));
      /* "Niet te berekenen" hoort onderaan, welke kant je ook sorteert.
         Anders staan bij oplopend sorteren de regels zónder kostprijs
         bovenaan alsof ze het goedkoopst waren. */
      if(x === -Infinity && y === -Infinity) return 0;
      if(x === -Infinity) return 1;
      if(y === -Infinity) return -1;
      return sort.dir * (x - y);
    });
    const attr = perKlant ? 'data-ks' : 'data-vs';
    const kop = (k, lbl, cls='') =>
      `<th class="sortable ${cls}" ${attr}="${k}">${h(lbl)}${sort.k===k?(sort.dir<0?' ↓':' ↑'):''}</th>`;
    const totSpend = rijen.reduce((s,r) => s + r.spend, 0);
    const totLeads = rijen.reduce((s,r) => s + r.leads, 0);
    const totGekw  = rijen.reduce((s,r) => s + r.gekwal, 0);
    const totPl    = rijen.reduce((s,r) => s + r.geplaatst, 0);

    const cel = r => {
      const sleutel = drill('grp:' + soort + ':' + r.key, r.rijen);
      return `<tr>
        <td>
          <b>${h(perKlant ? r.label : (r.sub || r.label))}</b>
          ${r.geenKlant ? `<span class="chip amber" style="margin-left:6px">uitgaven niet toegewezen</span>` : ''}
          ${r.leadZonderKlant ? `<span class="chip amber" style="margin-left:6px">lead zonder klant</span>` : ''}
          ${!perKlant && r.losseSet ? `<span class="chip" style="margin-left:6px">advertentieset zonder vacature</span>` : ''}
          ${(() => {
            /* Zonder klant én we tonen de klantentabel: elke campagne krijgt
               hier een eigen koppel-select. Dat is de handmatige overschrijving
               (mkt_campagne_klant) — voor als de naam te veel afwijkt om
               automatisch te herkennen (Tjeerd, 25 aug 2026). */
            if(perKlant && r.geenKlant){
              /* Niet alleen de afgeleide namenlijst (die kent een minimum
                 van 4 tekens tegen valse automatische treffers — daardoor
                 ontbrak N.W.B., Tjeerd 3 sep 2026), maar álle klanten uit
                 Relaties en de vacatures: handmatig koppelen mag alles. */
              const klanten = [...new Set([
                ...(CRM.state.clients||[]).map(c => String(c.naam||'').trim()),
                ...(CRM.state.vacs||[]).map(v => String(v.klant||'').trim()),
                ...D.klantNaam.values()
              ].filter(Boolean))].sort((a,b) => a.localeCompare(b,'nl'));
              return `<div class="rowsub" style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
                ${[...r.campagnes].sort((a,b) => a.localeCompare(b,'nl')).map(c => `
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span>${h(c)}</span>
                    <select data-koppelcamp="${h(c)}" style="font-size:12px">
                      <option value="">Koppel aan klant…</option>
                      ${klanten.map(k => `<option value="${h(k)}">${h(k)}</option>`).join('')}
                    </select>
                  </div>`).join('')}
              </div>`;
            }
            const onder = perKlant
              ? (r.campagnes.size ? [...r.campagnes].join(' · ') : 'geen campagne gevonden')
              : r.label;
            /* Niet twee keer hetzelfde: bij een regel zonder klant is de
               vetgedrukte tekst al de hele mededeling. */
            return onder && onder !== (perKlant ? r.label : (r.sub || r.label))
              ? `<div class="rowsub">${h(onder)}</div>` : '';
          })()}
        </td>
        <td class="n num">${eur(r.spend)}</td>
        <td class="n num">${r.leads ? `<button class="btn sub sm num" data-drill="${h(sleutel)}" data-drilltitel="${h(r.label)}">${fmtN(r.leads)}</button>` : '<span class="meta">0</span>'}</td>
        <td class="n num">${fmtN(r.gekwal)}</td>
        <td class="n num">${fmtN(r.geplaatst)}</td>
        <td class="n num">${r.loopt ? fmtN(r.loopt) : '<span class="meta">0</span>'}</td>
        <td class="n num">${eur(r.cpl, 2)}</td>
        <td class="n num">${eur(r.cpq, 2)}</td>
        <td class="n num">${r.cpp == null ? '<span class="meta">—</span>' : eur(r.cpp)}
          ${r.cpp != null && r.loopt ? '<div class="rowsub">voorlopig</div>' : ''}</td>
      </tr>`;
    };
    return `<div class="card mkt-kaart">
      <div class="card-h"><div class="h2">${perKlant ? 'Per klant' : 'Per vacature'}</div>
        <span class="meta">${h(M.cohort === 'alles' ? 'alle maanden' : maandLabel(M.cohort))} · klik een kolomkop om te sorteren</span></div>
      <div class="tblwrap" style="border:none;border-radius:0">
        <table class="tbl mkt-tbl"><thead><tr>
          ${kop('label', perKlant ? 'Klant' : 'Vacature')}
          ${kop('spend','Uitgegeven','n')}
          ${kop('leads','Leads','n')}
          ${kop('gekwal','Gekwalificeerd','n')}
          ${kop('geplaatst','Geplaatst','n')}
          ${kop('loopt','Loopt nog','n')}
          ${kop('cpl','€ / lead','n')}
          ${kop('cpq','€ / gekwalificeerd','n')}
          ${kop('cpp','€ / plaatsing','n')}
        </tr></thead>
        <tbody>${rijen.map(cel).join('')}</tbody>
        <tfoot><tr>
          <td><b>Alles bij elkaar</b></td>
          <td class="n num">${eur(totSpend)}</td>
          <td class="n num">${fmtN(totLeads)}</td>
          <td class="n num">${fmtN(totGekw)}</td>
          <td class="n num">${fmtN(totPl)}</td>
          <td class="n num">${fmtN(rijen.reduce((s,r) => s + r.loopt, 0))}</td>
          <td class="n num">${eur(kost(totSpend, totLeads), 2)}</td>
          <td class="n num">${eur(kost(totSpend, totGekw), 2)}</td>
          <td class="n num">${totPl ? eur(kost(totSpend, totPl)) : '<span class="meta">—</span>'}</td>
        </tr></tfoot>
      </table></div>
      <div class="card-f"><span class="meta">${perKlant
        ? 'Kosten per plaatsing per klant is het cijfer om op te sturen: dát is wat een campagne écht waard was. Bij een cohort dat nog loopt kan het alleen nog dalen.'
        : 'Een advertentieset die we niet aan een vacature konden koppelen blijft als eigen regel staan — met uitgaven maar zonder leads. Dat is een naamgevingsprobleem in Ads Manager, geen slechte set.'}</span></div>
    </div>`;
  }

  /* Wat we niet konden meten, en waarom. Rustig blok, geen alarm — maar wel
     zichtbaar, want een net getal op halve data stuurt verkeerd. */
  function gatenHtml(D, cLeads, cUit, cDub){
    const g = D.gaten;
    const periode = M.cohort === 'alles' ? 'alle maanden' : maandLabel(M.cohort);
    /* Alles in dit blok gaat over hetzelfde cohort als de tabellen erboven —
       twee maatstaven door elkaar is precies hoe een dashboard gaat liegen. */
    const losseCamp = [...new Set(cUit.filter(r => !r.kkey).map(r => r.campagne))];
    const bedragNiet = somBedrag(cUit.filter(r => !r.kkey));
    const totaalUit  = somBedrag(cUit);
    const formulieren = cUit.reduce((s,r) => s + r.formulieren, 0);
    /* Dubbele aanmeldingen tellen bij Meta wél als formulier en staan wél in
       het CRM — voor de vraag "mist er iets?" horen ze dus bij de CRM-kant,
       ook al tellen ze in de tabellen hierboven niet mee. */
    const verschil = formulieren - cLeads.length - (cDub||[]).length;
    const items = [];
    const P = (titel, tekst, sleutel, rijen) => items.push({titel, tekst, sleutel, rijen});

    if(bedragNiet > 0)
      P(`${eur(bedragNiet)} uitgaven zonder herkenbare klant`,
        `${losseCamp.length} campagne${losseCamp.length===1?'':'s'} in ${periode.toLowerCase()} (${losseCamp.join(' · ')}) — `
        + `${pctV(bedragNiet, totaalUit)} van de Meta-uitgaven in dit cohort. In de tabellen hierboven staan die apart, ze zijn dus niet stilzwijgend weggelaten. `
        + `Zet de klantnaam in de campagnenaam, dan valt dit vanzelf op zijn plek.`);
    if(D.uitZonderDatum > 0)
      P(`${eur(D.uitZonderDatum)} uitgaven zonder leesbare datum`,
        'Deze regels konden aan geen enkele maand worden toegerekend en zitten in geen enkel cohort.');
    /* Leadgaten binnen dit cohort houden — behalve leads zonder datum, die
       zitten per definitie in geen enkel cohort. */
    const inCohort = new Set(cLeads.map(r => r.id));
    const bij = lijst => lijst.filter(r => inCohort.has(r.id));
    if(verschil > 0)
      P(`${fmtN(verschil)} Meta-formulieren die niet in het CRM staan`,
        `Meta telt zelf ${fmtN(formulieren)} ingevulde formulieren in dit cohort, in het CRM staan ${fmtN(cLeads.length + (cDub||[]).length)} leads met bron Meta (dubbele aanmeldingen meegeteld). `
        + 'Alles op dit scherm rekent met de leads die daadwerkelijk in het CRM staan — het echte rendement is dus hooguit beter dan hier staat.');
    if((cDub||[]).length)
      P(`${fmtN(cDub.length)} dubbele aanmelding${cDub.length===1?'':'en'} buiten de telling gehouden`,
        'De bot herkende hetzelfde telefoonnummer als een bestaande lead (botstatus "Dubbel"). Die persoon telt één keer mee, via zijn eerste aanmelding — '
        + 'anders leek dezelfde persoon twee leads en kon één plaatsing dubbel tellen. Ze staan dus in geen enkele tabel of trechterstap hierboven.', 'gat:dubbel', cDub);
    if(g.zonderDatum.length)
      P(`${fmtN(g.zonderDatum.length)} leads zonder binnenkomstdatum`,
        'Zonder datum hoort een lead bij geen enkele maand en telt nergens mee.', 'gat:datum', g.zonderDatum);
    const zStatus = bij(g.zonderStatus), zVreemd = bij(g.vreemdeStatus), zKlant = bij(g.zonderKlant),
          zVac = bij(g.zonderVacature), zKandWeg = bij(g.kandidaatWeg), zDoor = bij(g.doorZonderKandidaat);
    if(zStatus.length)
      P(`${fmtN(zStatus.length)} leads zonder status`,
        'Niet te zeggen of ze zijn opgepakt. Ze tellen wel mee als binnengekomen en als "nog in behandeling".', 'gat:status', zStatus);
    if(zVreemd.length)
      P(`${fmtN(zVreemd.length)} leads met een onbekende status`,
        'De status staat niet in de lijst die het CRM kent — ze vallen daardoor in geen enkele trechterstap.', 'gat:vreemd', zVreemd);
    if(zKlant.length)
      P(`${fmtN(zKlant.length)} leads zonder klant`,
        'Die staan in de klanttabel op één regel "Klant onbekend" — er is dus geen kosten-per-plaatsing per klant van te maken.', 'gat:klant', zKlant);
    if(zVac.length)
      P(`${fmtN(zVac.length)} leads zonder vacature`,
        'Geen vacature_id; we vallen dan terug op het functieveld van de lead zelf. Staat dat er ook niet in, dan is de vacature-uitsplitsing onvolledig.', 'gat:vac', zVac);
    if(zKandWeg.length)
      P(`${fmtN(zKandWeg.length)} leads verwijzen naar een kandidaat die niet bestaat`,
        'Het kandidaat_id staat gevuld, maar die kandidaat staat niet (meer) op het bord. Ze tellen als doorgeschoten, maar hun voorstel en plaatsing kunnen we niet volgen.', 'gat:kandweg', zKandWeg);
    if(zDoor.length)
      P(`${fmtN(zDoor.length)} leads staan op "Doorgeschoten" zonder kandidaat`,
        'De (oude, sinds 27 aug 2026 vervallen) status zegt doorgeschoten, maar er hangt geen kandidaat aan. Hier breekt de keten meteen na de kwalificatie.', 'gat:doorleeg', zDoor);
    if(D.losseKand.length)
      P(`${fmtN(D.losseKand.length)} kandidaten met bron Meta hangen aan geen enkele lead`,
        `Waarvan ${fmtN(D.lossePlaatsingen.length)} geplaatst. Die plaatsingen zijn wél van Meta gekomen, maar we kunnen ze aan geen maand en aan geen campagne toerekenen — `
        + 'ze ontbreken dus in élk cohort hierboven. Dit is het grootste gat in deze analyse: het maakt Meta systematisch slechter dan het is.');

    if(!items.length) return `<div class="note ok" style="margin-top:18px">
      Alle Meta-uitgaven zijn aan een klant toegewezen en elke lead heeft een datum, een status en een klant.
      De cijfers hierboven rusten op complete gegevens.</div>`;

    return `<div class="card mkt-kaart mkt-gaten">
      <div class="card-h"><div class="h2">Wat we niet konden meten, en waarom</div>
        <span class="meta">${items.length} punt${items.length===1?'':'en'}</span></div>
      <div class="card-b">
        <p class="sub" style="margin:0 0 14px;max-width:78ch">Dit blok hoort erbij. Een dashboard dat 80% van het budget toont
          alsof het 100% is, stuurt verkeerd — dus staat hier wat er buiten de telling viel.</p>
        ${items.map(i => `<div class="mkt-gat">
          <b>${h(i.titel)}</b>
          <span class="meta">${h(i.tekst)}</span>
          ${i.rijen && i.rijen.length ? `<div><button class="btn sub sm" data-drill="${h(drill(i.sleutel, i.rijen))}" data-drilltitel="${h(i.titel)}">Bekijk de leads</button></div>` : ''}
        </div>`).join('')}
      </div>
      <div class="card-f"><span class="meta">Elk punt hier is een invoerafspraak die scherper kan. Dat levert meer op dan een extra grafiek.</span></div>
    </div>`;
  }

  /* Doorklikken naar de onderliggende leads en kandidaten. */
  function drillPaneel(titel, rijen){
    const lijst = rijen.slice().sort((a,b) =>
      String(b.lead.binnen_op||'').localeCompare(String(a.lead.binnen_op||'')));
    const regel = r => `<tr>
      <td><b>${h(r.naam || 'zonder naam')}</b>
        ${r.cand ? `<div class="rowsub">kandidaat: ${h(CRM.faseNorm(r.cand.fase) || 'geen fase')}</div>` : ''}</td>
      <td><span class="chip">${h(CRM.leadIco(r.status))} ${h(r.status || 'zonder status')}</span></td>
      <td>${h(r.klant || '—')}${r.functie ? `<div class="rowsub">${h(r.functie)}</div>` : ''}</td>
      <td class="num meta">${h(r.mk ? CRM.fmtDateShort(r.lead.binnen_op) : 'geen datum')}</td>
      <td class="n"><div class="row tight" style="justify-content:flex-end">
        <button class="btn sm ghost" data-ganaar="lead|${h(r.id)}">Lead</button>
        ${r.cand ? `<button class="btn sm ghost" data-ganaar="kand|${h(r.cand.id)}">Kandidaat</button>` : ''}
      </div></td>
    </tr>`;
    CRM.drawer.open(`
      <div class="drawer-h">
        <div><div class="h2">${h(titel)}</div>
          <div class="meta"><span class="num">${fmtN(lijst.length)}</span> lead${lijst.length===1?'':'s'} ·
            ${h(M.cohort === 'alles' ? 'alle maanden' : maandLabel(M.cohort))}</div></div>
        <button class="btn sub x" data-close aria-label="Sluiten">✕</button>
      </div>
      <div class="drawer-b">
        <div class="tblwrap"><table class="tbl"><thead><tr>
          <th>Naam</th><th>Status</th><th>Klant / vacature</th><th>Binnen</th><th></th>
        </tr></thead><tbody>${lijst.map(regel).join('')}</tbody></table></div>
      </div>`, {onOpen(dr){
        CRM.$$('[data-ganaar]', dr).forEach(b => b.onclick = () => {
          const s = b.dataset.ganaar, i = s.indexOf('|');
          const soort = s.slice(0, i), id = s.slice(i + 1);
          CRM.drawer.close();
          CRM.ga(soort === 'lead' ? 'recruitment' : 'kandidaten', {id});
        });
      }});
  }

  /* ── 6c1. Marketingtaken ── */
  /* De regel is: afvinken mag hier, nieuw werk maak je in de CRM-takenlijst.
     Bord-taken (mkt_taken) mag je ook weggooien — die horen alleen bij deze
     module. CRM-taken laten we staan: die kunnen aan een collega toegewezen
     zijn en verdwijnen niet vanuit één module. */
  function takenHtml(){
    const vandaag = CRM.todayISO();
    /* Kan de bordtabel niet gelezen worden, dan is deze lijst per definitie
       onvolledig. Dat moet je zien, ook als er wél CRM-taken zijn — anders
       denk je dat je klaar bent terwijl de helft ontbreekt. */
    if(M.takenFout && !crmTaken().length) return foutBlok('De marketingtaken', M.takenFout);
    const waarschuwing = M.takenFout
      ? `<div class="note warn" style="margin-bottom:18px">Deze lijst is niet compleet: de taken uit het
         marketingbord konden niet geladen worden, dus je ziet hieronder alleen de CRM-taken.
         ${h(String(M.takenFout?.message || M.takenFout))}</div>` : '';

    const open = alleTaken().filter(t => !t.klaar);
    const achter = open.filter(t => t.datum && t.datum < vandaag);
    const nu     = open.filter(t => !t.datum || t.datum === vandaag);
    const later  = open.filter(t => t.datum && t.datum > vandaag);
    const klaarVandaag = alleTaken().filter(t => t.klaar && t.datum === vandaag).length;

    const rij = t => `<div class="mkt-taak${t.klaar?' af':''}">
      <input type="checkbox" data-tvink="${h(t.bron)}|${h(t.id)}" ${t.klaar?'checked':''}
             aria-label="${h(t.tekst)} afvinken">
      <span class="mkt-taak-t">${h(t.tekst)}
        ${t.datum && t.datum !== vandaag ? `<span class="meta"> · ${h(CRM.fmtDateShort(t.datum))}</span>` : ''}
        ${t.voor && t.voor !== CRM.me() ? `<span class="meta"> · voor ${h(t.voor)}</span>` : ''}
        ${t.bron === 'bord' ? `<span class="chip" style="margin-left:6px">marketingbord</span>` : ''}
        ${t.prioriteit === 'Hoog' ? `<span class="chip amber" style="margin-left:6px">hoog</span>` : ''}</span>
      ${t.bron === 'bord' ? `<button class="mkt-taak-x" data-tweg="${h(t.id)}" title="Taak verwijderen" aria-label="Taak verwijderen">✕</button>` : ''}
    </div>`;

    const groep = (titel, lijst) => lijst.length
      ? `<div class="mkt-taak-g"><span class="label">${h(titel)}</span>${lijst.map(rij).join('')}</div>` : '';

    return `${waarschuwing}<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Wat moet er gebeuren</div>
        <span class="meta">${open.length ? `${open.length} open${klaarVandaag?` · ${klaarVandaag} vandaag afgevinkt`:''}` : 'alles afgevinkt'}</span>
        <div class="spacer"></div>
        <button class="btn sm" id="mkt_nieuwetaak">Nieuwe taak</button></div>
      ${open.length ? `<div class="card-b">
        ${groep('Blijven liggen', achter)}
        ${groep('Vandaag', nu)}
        ${groep('Later', later)}
      </div>` : `<div class="card-b">${CRM.ui.leeg('Geen openstaande marketingtaken',
        'Zodra jij of iemand in het marketingbord iets noteert, staat het hier. Nieuwe taken maak je met de knop hierboven.')}</div>`}
      <div class="card-f"><span class="meta">Taken uit het marketingbord (<span class="num">${bordTaken().filter(t=>!t.klaar).length}</span> open) en
        CRM-taken staan hier samen. Nieuwe taken komen in de CRM-takenlijst terecht, zodat ze ook op je dashboard staan,
        aan een collega kunnen en meegaan naar Outlook.</span></div>
    </div>`;
  }

  /* ── 6c2. Learnings-bibliotheek ── */
  /* Elke post die de fase Learnings haalt laat een zin achter over wat wel en
     niet werkte. Die zinnen stonden wel in de database maar nergens op het
     scherm — bij elkaar zijn ze het speelboek van het team. */
  function learningsLijst(){
    let items = M.posts.filter(p => (p.learnings||'').trim());
    if(M.lbK) items = items.filter(p => p.kanaal === M.lbK);
    if(M.lbQ){
      const q = M.lbQ.toLowerCase();
      items = items.filter(p => `${p.learnings} ${p.titel} ${p.hook}`.toLowerCase().includes(q));
    }
    return items.sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
  }
  function learningsHtml(){
    const items = learningsLijst();
    const kanalen = [...new Set(M.posts.filter(p => (p.learnings||'').trim()).map(p => p.kanaal).filter(Boolean))].sort();
    const lijst = items.length
      ? items.map(p => `<div class="mkt-learn">
          <b>${h(p.learnings)}</b>
          <span class="meta">${h(p.titel||'(zonder titel)')}${p.kanaal?` · ${h(p.kanaal)}`:''}${p.format?` · ${h(p.format)}`:''}${p.datum?` · ${h(CRM.fmtDateShort(p.datum))}`:''}${
            N(p.resultaat?.bereik) ? ` · <span class="num">${fmtN(p.resultaat.bereik)}</span> bereik` : ''}${
            N(p.resultaat?.leads) ? ` · <span class="num">${fmtN(p.resultaat.leads)}</span> leads` : ''}</span>
        </div>`).join('')
      : `<div class="card-b">${CRM.ui.leeg(
          M.lbQ || M.lbK ? 'Geen learnings met dit filter' : 'Nog geen learnings vastgelegd',
          M.lbQ || M.lbK ? 'Pas de zoekterm of het kanaal aan.'
            : 'Zet in het marketingbord een gepubliceerde post op de fase Learnings en schrijf op wat wel en niet werkte. Die zin komt hier vanzelf bij te staan.',
          M.lbQ || M.lbK ? '' : `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`)}</div>`;
    return `<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Learnings</div>
        <span class="meta">${items.length} ${items.length===1?'les':'lessen'} uit eigen posts</span></div>
      <div class="card-b" style="padding-bottom:0">
        <div class="row tight" style="flex-wrap:wrap;margin-bottom:2px">
          <input type="search" id="mkt_lbq" placeholder="Zoek in learnings…" value="${h(M.lbQ)}" style="flex:1;min-width:160px">
          <select id="mkt_lbk" style="width:auto;min-width:140px"><option value="">Alle kanalen</option>${
            kanalen.map(k => `<option${M.lbK===k?' selected':''}>${h(k)}</option>`).join('')}</select>
        </div>
      </div>
      ${lijst}
    </div>`;
  }

  /* ── 6c3. Wat werkt ── */
  function watWerktHtml(){
    const {adviezen:ww, pubs} = watWerkt();
    const vr = voorraad();
    return `<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Wat werkt</div>
        <span class="meta">afgeleid uit ${pubs.length} ${pubs.length===1?'post':'posts'} met ingevuld bereik</span></div>
      <div class="card-b">
        ${ww.length ? `<div class="stack">${ww.map(a => `
          <div><b>${h(a.titel)}</b><div class="meta">${h(a.tekst)}</div></div>`).join('')}</div>`
        : `<p class="sub" style="margin:0">Nog te weinig resultaten om patronen uit te halen. Vul na elke publicatie
           bereik, likes en leads in; vanaf ongeveer vier posts verschijnen hier het beste format, het beste kanaal,
           de beste dag en of cijfers in de hook bij jullie aanslaan.</p>`}
      </div>
      ${vr.weken !== null ? `<div class="card-f"><span class="meta">Voorraad: <span class="num">${vr.klaar}</span> ${vr.klaar===1?'idee of script':'ideeën en scripts'}
        en <span class="num">${vr.gepland}</span> ingepland, bij een tempo van <span class="num">${vr.tempo.toFixed(1).replace('.',',')}</span> posts per week —
        genoeg voor ongeveer <span class="num">${vr.weken.toFixed(1).replace('.',',')}</span> ${vr.weken<2?'week':'weken'}.${
        vr.weken < 2 ? ' Dat is krap: haal er wat ideeën bij.' : ''}</span></div>` : ''}
    </div>`;
  }

  /* ── 6c. Content ── */
  function contentHtml(nag){
    if(!M.posts.length){
      if(M.postsFout) return foutBlok('De contentplanning', M.postsFout);
      return takenHtml() + CRM.ui.leeg('Nog geen content gevonden',
        'De contentplanning staat in het marketingbord. Zodra daar posts staan, zie je hier wat er gepland is en wat een gepubliceerde post heeft opgeleverd.',
        `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`);
    }
    const vandaag = CRM.todayISO();
    const gepland = M.posts.filter(p => !GEPUBLICEERD(p) && p.datum && p.datum >= vandaag)
                           .sort((a,b) => a.datum.localeCompare(b.datum));
    const pub = M.posts.filter(GEPUBLICEERD).sort((a,b) => (b.datum||'').localeCompare(a.datum||'')).slice(0,20);
    const nagIds = new Set(nag.map(p => p.id));

    const res = (p,k) => N(p.resultaat?.[k]) ? fmtN(p.resultaat[k]) : '<span class="meta">—</span>';

    return `
      ${nag.length ? `<div class="note warn" style="margin-bottom:18px">
        <b>${nag.length} gepubliceerde post${nag.length===1?'':'s'} zonder resultaten.</b>
        Zonder bereik en leads weet je niet wat werkt — vul ze bij in het marketingbord.</div>` : ''}

      ${takenHtml()}

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Binnenkort</div><span class="meta">${gepland.length} gepland</span>
          <div class="spacer"></div>
          <a class="btn sm ghost" href="${BORD}" target="_blank" rel="noopener">Nieuwe post maken ↗</a></div>
        ${gepland.length ? `<div class="tblwrap" style="border:none;border-radius:0 0 var(--r-l) var(--r-l)">
          <table class="tbl"><thead><tr><th>Datum</th><th>Kanaal</th><th>Titel</th><th>Status</th><th>Vacature</th></tr></thead>
          <tbody>${gepland.slice(0,10).map(p => `<tr>
            <td class="num" style="white-space:nowrap">${h(CRM.fmtDateShort(p.datum))}${p.tijd?` <span class="meta num">${h(p.tijd)}</span>`:''}</td>
            <td>${kanaalChip(p.kanaal)}</td>
            <td><b>${h(p.titel||'(zonder titel)')}</b>${p.format?`<div class="rowsub">${h(p.format)}</div>`:''}</td>
            <td><span class="chip">${h(p.fase)}</span></td>
            <td class="meta">${h(p.vacature||'—')}</td></tr>`).join('')}</tbody></table>
        </div>` : `<div class="card-b">${CRM.ui.leeg('Niets ingepland',
          'Zonder geplande content valt de organische instroom stil. Zet in het marketingbord de posts voor de komende twee weken klaar.',
          `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Content plannen ↗</a>`)}</div>`}
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Gepubliceerd</div><span class="meta">laatste ${pub.length}</span></div>
        <div class="tblwrap" style="border:none;border-radius:0">
          <table class="tbl"><thead><tr>
            <th>Datum</th><th>Kanaal</th><th>Titel</th>
            <th class="n">Bereik</th><th class="n">Likes</th><th class="n">Reacties</th><th class="n">Leads</th>
          </tr></thead>
          <tbody>${pub.map(p => `<tr>
            <td class="num" style="white-space:nowrap">${h(CRM.fmtDateShort(p.datum))}</td>
            <td>${kanaalChip(p.kanaal)}</td>
            <td><b>${h(p.titel||'(zonder titel)')}</b>
              ${nagIds.has(p.id) ? `<span class="chip amber" style="margin-left:6px">resultaten nog invullen</span>` : ''}
              ${p.format?`<div class="rowsub">${h(p.format)}</div>`:''}</td>
            <td class="n num">${res(p,'bereik')}</td><td class="n num">${res(p,'likes')}</td>
            <td class="n num">${res(p,'reacties')}</td><td class="n num">${res(p,'leads')}</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="card-f"><span class="meta">Posten, plannen en publiceren doe je in het marketingbord — hier lees je alleen mee.</span></div>
      </div>

      ${watWerktHtml()}
      ${learningsHtml()}`;
  }

  /* ── 6e. Kanalen ── */
  /* Waar posten we, met welk doel per week, en levert dat wat op? Kleur en
     weekdoel staan in mkt_kanalen en worden ook door het marketingbord
     gebruikt — je past ze hier dus voor beide apps tegelijk aan. */
  function kanalenHtml(){
    if(M.kanalenFout) return foutBlok('De kanalen', M.kanalenFout);
    const rijen = kanaalCijfers();
    const doelTotaal = rijen.reduce((s,r) => s + r.doel, 0);
    const weekTotaal = rijen.reduce((s,r) => s + r.week, 0);

    const tabel = rijen.length ? `
      <div class="tblwrap" style="border:none;border-radius:0">
        <table class="tbl"><thead><tr>
          <th>Kanaal</th><th class="n">Deze week</th><th style="width:100px">Doel gehaald</th>
          <th class="n">Doel p/w</th><th class="n">Gepubliceerd</th>
          <th class="n">Gem. bereik</th><th class="n">Leads</th><th></th>
        </tr></thead>
        <tbody>${rijen.map(r => `<tr>
          <td style="white-space:nowrap"><b>${kanaalStip(r.naam)}${h(r.naam)}</b>
            <div class="rowsub">${r.losseNaam ? 'staat niet in de kanalenlijst'
              : `${fmtN(r.gepland)} ingepland`}</div></td>
          <td class="n num">${fmtN(r.week)}</td>
          <td>${r.doel ? CRM.ui.bar(r.week/r.doel*100, r.week >= r.doel ? 'green' : '')
                       : '<span class="meta">geen doel</span>'}</td>
          <td class="n">${r.losseNaam ? '<span class="meta">—</span>'
            : `<input type="number" min="0" max="21" class="mkt-doel" value="${N(r.doel)}" data-doel="${h(r.naam)}" aria-label="Weekdoel voor ${h(r.naam)}">`}</td>
          <td class="n num">${fmtN(r.posts)}</td>
          <td class="n num">${r.bereik != null ? fmtN(r.bereik) : '—'}</td>
          <td class="n num">${fmtN(r.leads)}</td>
          <td class="n">${r.losseNaam ? ''
            : `<div class="row tight" style="justify-content:flex-end;flex-wrap:nowrap">
                <input type="color" class="mkt-kleur" value="${h(veiligeKleur(r.kanaal.kleur) === 'var(--line-2)' ? '#5b8bbf' : r.kanaal.kleur)}" data-kleur="${h(r.naam)}" title="Kleur van ${h(r.naam)}" aria-label="Kleur van ${h(r.naam)}">
                ${r.totaal ? '' : `<button class="btn ghost sm" data-kweg="${h(r.naam)}">Verwijderen</button>`}
              </div>`}</td>
        </tr>`).join('')}</tbody></table>
      </div>`
      : `<div class="card-b">${CRM.ui.leeg('Nog geen kanalen ingesteld',
          'Zonder kanalen kan een post nergens aan hangen en blijven alle chips grijs. Voeg hieronder je eerste kanaal toe — Facebook, Instagram, TikTok en LinkedIn zijn de gebruikelijke start.')}</div>`;

    return `
      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Kanalen</div>
          <span class="meta">${weekTotaal} van ${doelTotaal || '—'} posts deze week</span></div>
        ${tabel}
        <div class="card-f">
          <div class="row tight" style="flex-wrap:wrap;width:100%">
            <input type="text" id="mkt_knaam" placeholder="Nieuw kanaal, bijv. YouTube" style="flex:1;min-width:150px">
            <input type="color" id="mkt_kkleur" class="mkt-kleur" value="#5b8bbf" title="Kleur" aria-label="Kleur van het nieuwe kanaal">
            <button class="btn sm" id="mkt_kadd">Toevoegen</button>
          </div>
        </div>
      </div>
      <div class="vlak">
        <span class="label">Hoe je dit leest</span>
        <p class="sub" style="margin:0">Het weekdoel telt vanaf maandag en kijkt alleen naar gepubliceerde posts.
          Kleur en doel gelden ook in het marketingbord — je stelt ze hier voor beide apps in. Een kanaal verwijderen
          kan alleen als er geen enkele post meer op staat, anders zouden die posts hun kleur en plek kwijtraken.</p>
      </div>`;
  }

  /* ── 6e. Vacatures ──
     Eén tabel, drie kolommen die elk een manier zijn waarop een vacature aan
     kandidaten komt: staat hij op de website, is er content over gemaakt,
     loopt er een advertentie op. De vacature die op alle drie leeg staat
     krijgt vanuit marketing geen enkele instroom.

     De websitekolom is nieuw en is het antwoord op "welke vacatures moet ik
     nog online zetten?". Het invullen zelf gebeurt op de klantkaart — daar
     staat het venster met de websitestand en de informatie die de AM moet
     aanleveren — dus de knop stuurt je daarheen in plaats van dat we dat
     scherm hier nog een keer bouwen. */
  function vacaturesHtml(vac){
    if(!vac.open) return CRM.ui.leeg('Geen open vacatures',
      'Er staat op dit moment geen vacature open. Zodra er één bijkomt, staat hier of hij online moet, of er content over gepland is en of er een advertentie op loopt.');

    const tonen = M.vacAlles ? vac.rijen : vac.metGat;
    const compleet = vac.open - vac.metGat.length;
    /* Een lijst die op een aftreksom rust wordt te lang zodra een bron
       ontbreekt. Dat moet je weten vóórdat je iemand erop aanspreekt. */
    const bronMist = M.postsFout ? 'de contentplanning' : M.metaFout ? 'de Meta-cijfers' : '';

    /* Websitecel. De drie standen komen uit vacatures.web_status; alleen
       "Nog niet online" is werk. Wat de AM nog moet aanleveren staat eronder,
       want zonder werktijden en salaris valt er geen tekst te schrijven. */
    const webCel = r => {
      if(!vac.web) return `<td class="meta">—</td>`;
      if(r.stand === 'Staat online') return `<td><span class="chip green">online</span>${
        r.v.web_online_op ? `<div class="rowsub">sinds ${h(CRM.fmtDateShort(r.v.web_online_op))}</div>` : ''}</td>`;
      if(r.stand === 'Niet nodig') return `<td><span class="meta">niet nodig</span></td>`;
      return `<td><span class="chip amber">${r.wacht ? 'wacht op info' : 'klaar om te zetten'}</span>
        <div class="rowsub">${r.wacht
          ? `mist nog: ${h(mistTekst(r.info))}`
          : 'alle informatie staat erin'}</div></td>`;
    };
    const jaNee = (aan, tekstAan, tekstUit) => aan
      ? `<td><span class="chip green">${h(tekstAan)}</span></td>`
      : `<td><span class="chip amber">${h(tekstUit)}</span></td>`;

    const rij = r => `<tr>
      <td><b>${h(r.v.functie)}</b>
        <div class="rowsub">${h(r.v.klant)}${r.v.locatie ? ` · ${h(r.v.locatie)}` : ''}${
          N(r.v.aantal) > 1 ? ` · <span class="num">${fmtN(r.v.aantal)}</span> plekken` : ''}</div></td>
      <td class="n num">${r.dagenOpen != null ? r.dagenOpen : '<span class="meta">—</span>'}</td>
      ${webCel(r)}
      ${jaNee(r.content > 0, r.content === 1 ? '1 post' : `${r.content} posts`, 'geen')}
      ${jaNee(r.adv, 'loopt', 'geen')}
      <td class="n"><button class="btn sub sm" data-vklant="${h(r.v.klant)}">Naar de klant</button></td>
    </tr>`;

    const lijst = tonen.length
      ? `<div class="tblwrap" style="border:none;border-radius:0">
          <table class="tbl mkt-tbl mkt-vac"><thead><tr>
            <th>Vacature</th><th class="n">Dagen open</th>
            <th>Website</th><th>Content</th><th>Advertentie</th><th></th>
          </tr></thead><tbody>${tonen.map(rij).join('')}</tbody></table>
        </div>`
      : `<div class="card-b">${CRM.ui.leeg('Elke open vacature heeft aandacht',
          `Alle ${vac.open} openstaande vacatures staan online of hoeven niet online, en hebben in de afgelopen ${VAC_DAGEN} dagen content of een advertentie gehad.`)}</div>`;

    return `${bronMist ? `<div class="note warn" style="margin-bottom:18px">Deze lijst kan te lang zijn:
      ${h(bronMist)} konden niet geladen worden, dus er kan content of een advertentie lopen die hier niet meetelt.</div>` : ''}
    ${!vac.web ? `<div class="note info" style="margin-bottom:18px">
      <b>De websitestand staat nog niet in de database.</b>
      <span class="meta" style="display:block;margin-top:4px">De kolom <span class="num">vacatures.web_status</span>
      bestaat nog niet, dus de kolom Website blijft leeg. De wijziging staat klaar in
      <span class="num">supabase/nog-te-draaien.sql</span>; zodra die gedraaid is verschijnt hier vanzelf welke
      vacature nog online moet. We tonen tot die tijd geen "nog niet online" — dat zou werk verzinnen dat er
      misschien niet is.</span></div>` : ''}
    <div class="card mkt-kaart">
      <div class="card-h"><div class="h2">Waar krijgt een vacature geen instroom?</div>
        <span class="meta">${fmtN(vac.open)} open ${vac.open===1?'vacature':'vacatures'}${
          vac.web && vac.online.length ? ` · ${fmtN(vac.online.length)} nog niet online` : ''}</span>
        <div class="spacer"></div>
        <a class="btn sm ghost" href="${BORD}" target="_blank" rel="noopener">Content plannen ↗</a></div>
      ${lijst}
      <div class="card-f">
        <div class="row" style="width:100%;flex-wrap:wrap;gap:8px 14px">
          <span class="meta" style="flex:1;min-width:220px">Website komt uit
            <span class="num">vacatures.web_status</span> en wordt op de klantkaart bijgewerkt. Content en
            advertentie zijn een <b>afleiding op namen</b>: een post draagt de tekst "klant — functie" en een
            advertentieset heet naar de functie. Heet de advertentieset anders, dan staat er ten onrechte "geen".
            Het venster is ${VAC_DAGEN} dagen.</span>
          ${compleet > 0 ? `<button class="btn ghost sm" id="mkt_vacalles">${M.vacAlles
            ? `Alleen de ${fmtN(vac.metGat.length)} met een gat`
            : `Ook de ${fmtN(compleet)} zonder gat tonen`}</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  /* ═══ 7. DEMO-DATA ═══════════════════════════════════════════ */
  function demoData(){
    let seed = 20260730;
    const rnd = () => { seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; };
    /* Elke advertentie heeft een eigen profiel; 'recent' geldt voor de laatste
       7 dagen zodat de waakhond herkenbare signalen te pakken krijgt.
       De namen volgen de afspraak in het Meta-account: campagne = klant,
       advertentieset = functie, advertentie = hook. Eén campagne wijkt daar
       bewust van af ('Regio Zuid-Holland — algemeen'), zodat je op het
       Rendement-tabblad ziet hoe niet-toewijsbare uitgaven getoond worden. */
    const ADS = [
      {c:'Starcuisine — Bodegraven',      s:'Productiemedewerker', a:'Salaris in beeld — € 2.750 + toeslag', sp:12,  cpc:0.32, ctr:0.021, lr:0.030},
      {c:'Starcuisine — Bodegraven',      s:'Productiemedewerker', a:'Video van de werkvloer',              sp:9,   cpc:0.29, ctr:0.026, lr:0.055},
      {c:'Starcuisine — Bodegraven',      s:'Heftruckchauffeur',   a:'Direct starten, wekelijks betaald',   sp:8,   cpc:0.35, ctr:0.018, lr:0.026},
      {c:'Proponent — Rotterdam',         s:'Orderpicker',         a:'Carrousel — machines en shifts',      sp:6.5, cpc:0.38, ctr:0.016, lr:0.022, rl:0},
      {c:'Proponent — Rotterdam',         s:'Orderpicker',         a:'Foto — heftruck in de hal',           sp:8,   cpc:0.33, ctr:0.019, lr:0.032, rb:0.42},
      {c:'Whisk Food',                    s:'Senior Operator',     a:'Ploegentoeslag van 25%',              sp:7.5, cpc:0.30, ctr:0.020, lr:0.045, rc:2.2},
      {c:'Good Life Foods',               s:'Operator',            a:'Testimonial — Marek, operator',       sp:7,   cpc:0.34, ctr:0.007, lr:0.035},
      {c:'Regio Zuid-Holland — algemeen', s:'Technische dienst',   a:'Doorgroeien naar TD-monteur',         sp:11,  cpc:0.36, ctr:0.014, lr:0.030, rl:0.25}
    ];
    const rijen = [];
    /* Vier maanden historie: zonder meerdere maanden valt er niets te
       vergelijken en zou het Rendement-tabblad één cohort tonen. */
    for(let d=104; d>=0; d--){
      const datum = isoT(d), recent = d < 7;
      /* Ruim een week zonder advertenties. Advertenties staan in het echt ook
         weleens uit, en zonder zo'n gat kun je niet zien hoe het scherm een
         stille periode toont: een lege staaf en een gedempte regel horen daar
         te staan, geen € 0,00 alsof er iets gemeten is. */
      if(d >= 47 && d <= 54) continue;
      const wknd  = [0,6].includes(new Date(datum+'T12:00').getDay());
      ADS.forEach((x,i) => {
        const cpc   = x.cpc * (recent && x.rc ? x.rc : 1);
        const spend = x.sp * (0.82 + 0.36*rnd()) * (wknd ? 0.78 : 1);
        const kliks = Math.max(1, Math.round(spend / cpc));
        const imp   = Math.round(kliks / x.ctr * (0.9 + 0.2*rnd()));
        const ber   = Math.round(imp * (0.6 + 0.1*rnd()) * (recent && x.rb ? x.rb : 1));
        const basis = kliks * x.lr * (recent && x.rl != null ? x.rl : 1);
        const leads = Math.max(0, Math.round(basis * (0.7 + 0.6*rnd())));
        rijen.push({id:'m'+d+'_'+i, datum, campagne:x.c, advertentieset:x.s, advertentie:x.a,
          uitgegeven:Math.round(spend*100)/100, impressies:imp, kliks, leads, bereik:ber,
          synced_at:new Date(Date.now()-3*3600e3).toISOString()});
      });
    }
    M.meta = rijen.sort((a,b) => b.datum.localeCompare(a.datum));
    /* Drie besluiten: één genegeerd advies (die advertentie zwijgt nu), één
       stopbesluit waar nog geld doorheen loopt (de bewaking moet aanslaan) en
       één advies van de agent dat nog gelezen moet worden. */
    M.besluiten = [
      {id:1, advertentie:'Foto — heftruck in de hal', campagne:'Proponent — Rotterdam',
       besluit:'negeer', status:'open', door:'Bryan', note:'', created_at:new Date(Date.now()-2*864e5).toISOString()},
      {id:2, advertentie:'Carrousel — machines en shifts', campagne:'Proponent — Rotterdam',
       besluit:'stop', status:'open', door:'Claude-agent', note:'Zeven dagen zonder lead.',
       created_at:new Date(Date.now()-3*864e5).toISOString()},
      {id:3, advertentie:'Testimonial — Marek, operator', campagne:'Good Life Foods',
       besluit:'budget', status:'open', door:'Claude-agent',
       note:'Deze set krijgt 60% van het campagnebudget maar levert de duurste leads. Verschuif een deel naar Orderpickers.',
       created_at:new Date(Date.now()-1*864e5).toISOString()}
    ];

    /* Wat er werkelijk aan Meta betaald is, zoals Finance het per maand uit de
       banktransacties wegschrijft. Bewust niet gelijk aan wat Meta rapporteert
       (verlegde btw, en Meta schrijft af bij een drempel), en de lopende maand
       staat er nog niet in — die afschrijving moet nog komen. */
    const mnd = terug => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - terug);
      return d.toLocaleDateString('sv-SE');
    };
    const perMaand = new Map();
    M.meta.forEach(r => { const k = r.datum.slice(0,7);
      perMaand.set(k, (perMaand.get(k)||0) + r.uitgegeven); });
    M.betaald = [1,2,3].map(t => {
      const m = mnd(t);
      const gerapporteerd = perMaand.get(m.slice(0,7)) || 0;
      /* Iets minder dan de opgave: een deel van de laatste dagen valt in de
         afschrijving van de maand erna. */
      return {maand:m, bedrag:Math.round(gerapporteerd * (0.93 + 0.05*rnd()) * 100)/100,
              bron:'bank', regels:2 + (t % 3),
              bijgewerkt:new Date(Date.now() - t*4*864e5).toISOString(), door:'Tjeerd'};
    });

    /* Kanalen zoals ze in mkt_kanalen staan: naam, kleur, volgorde, weekdoel. */
    M.kanalen = [
      {naam:'Instagram', kleur:'#b23b8f', volgorde:1, doel_pw:2},
      {naam:'Facebook',  kleur:'#1877f2', volgorde:2, doel_pw:2},
      {naam:'TikTok',    kleur:'#20262e', volgorde:3, doel_pw:3},
      {naam:'LinkedIn',  kleur:'#0a66c2', volgorde:4, doel_pw:1}
    ];

    /* Weekplanner-taken uit het marketingbord — twee open, één blijven liggen. */
    const dISO = d => isoT(d);
    M.taken = [
      {id:'t1', tekst:'Filmdag bij De Gier voorbereiden — vier hooks klaarzetten', datum:dISO(2), klaar:false, door:'Bryan', created_at:new Date().toISOString()},
      {id:'t2', tekst:'Resultaten van de open dag-post invullen', datum:dISO(0), klaar:false, door:'Bryan', created_at:new Date().toISOString()},
      {id:'t3', tekst:'Poolse vertaling van de operator-advertentie laten nakijken', datum:dISO(-3), klaar:false, door:'Bryan', created_at:new Date().toISOString()},
      {id:'t4', tekst:'Weekrapport naar Tjeerd sturen', datum:dISO(0), klaar:true, door:'Bryan', created_at:new Date().toISOString()}
    ];

    const P = (d, kanaal, titel, format, fase, vacature, resultaat, hook, learnings) => ({
      id:'p'+titel.length+kanaal+d, titel, kanaal, format, fase, vacature:vacature||'',
      doel:'', hook:hook||'', learnings:learnings||'',
      datum:isoT(d), tijd:'11:00', link:'', resultaat:resultaat||{}
    });
    M.posts = [
      P(2,  'TikTok',    'Een dag met Marek, operator bij Whisk', 'Reel',      'Gepubliceerd', 'Whisk Food — Senior Operator', {bereik:14200, likes:412, reacties:38, leads:7}, '04:45. De wekker gaat. Dit is mijn dag als operator.'),
      P(3,  'Instagram', 'Wat verdien je écht in de productie?',  'Reel',      'Gepubliceerd', '', {bereik:8600, likes:233, reacties:19, leads:4}, '€2.750 bruto + 25% toeslag. Zwart op wit.'),
      P(5,  'LinkedIn',  'Waarom wij geen cv vragen bij de intake','Tekst',    'Gepubliceerd', '', {bereik:3100, likes:96, reacties:14, leads:1}, 'Een cv vertelt je niet of iemand om vijf uur opstaat.'),
      P(6,  'Facebook',  'Orderpickers gezocht in Rotterdam',     'Foto',      'Gepubliceerd', 'Proponent — Orderpicker', {bereik:5400, likes:61, reacties:22, leads:6}, 'Direct starten in Rotterdam-Zuid, €16,50 per uur.'),
      P(9,  'TikTok',    'Heftruckcertificaat in twee dagen',     'Reel',      'Gepubliceerd', '', {bereik:22800, likes:734, reacties:55, leads:11}, 'Twee dagen les, daarna €17 per uur.'),
      P(12, 'Instagram', 'Ploegendienst: drie hardnekkige mythes','Carrousel', 'Gepubliceerd', '', {bereik:6100, likes:151, reacties:9, leads:2}, 'Iedereen denkt dit over nachtdiensten.'),
      P(16, 'LinkedIn',  'Starcuisine breidt uit met drie collega\'s','Tekst', 'Learnings',    'Starcuisine — Productiemedewerker', {bereik:2700, likes:74, reacties:6, leads:0}, 'Drie ploeggenoten erbij bij Starcuisine.',
        'Klantcases op LinkedIn halen weinig bereik maar leveren wél gesprekken op — meten op reacties, niet op views.'),
      P(21, 'TikTok',    'Van magazijn naar teamleider in een jaar','Reel',    'Gepubliceerd', '', {bereik:17400, likes:520, reacties:31, leads:9}, 'Een jaar geleden orderpicker, nu teamleider van de ploeg.',
        'Doorgroeiverhalen doen het beter dan salarisposts bij het jongere publiek op TikTok.'),
      P(28, 'Facebook',  'Nachtploeg gezocht in Bodegraven',      'Foto',      'Learnings',    '', {bereik:4800, likes:44, reacties:31, leads:5}, 'Nachtdienst = +25%. Reken maar mee.',
        'De meningsvraag in de caption verdrievoudigde de reacties zonder dat Meta het als bait zag.'),
      P(3,  'Facebook',  'Open dag Bodegraven — meld je aan',     'Foto',      'Gepubliceerd', 'Starcuisine — Productiemedewerker', {}, 'Zaterdag open dag — loop gewoon binnen.'),
      P(4,  'Instagram', 'Werken bij Burg Siroop',                'Story',     'Gepubliceerd', '', {}, 'Kom mee, we lopen een dagje mee.'),
      P(7,  'TikTok',    'Vraag en antwoord over uitzendwerk',    'Reel',      'Gepubliceerd', '', {}, 'Jullie vragen, wij antwoorden.'),
      P(-1, 'TikTok',    'Je salarisstrook uitgelegd',            'Reel',      'Ingepland',    ''),
      P(-2, 'Instagram', 'Collega van de maand: Ionut',           'Reel',      'Ingepland',    ''),
      P(-4, 'LinkedIn',  'Hoe wij no-shows hebben gehalveerd',    'Tekst',     'Ingepland',    ''),
      P(-6, 'Facebook',  'Lassers gezocht in de regio Alphen',    'Foto',      'Ingepland',    ''),
      P(-8, 'TikTok',    'Waarom wij binnen een uur terugbellen', 'Reel',      'Script klaar', '')
    ];
  }

  /* ═══ 8. REGISTRATIE ═════════════════════════════════════════ */
  CRM.registerModule('marketing', {
    title:'Marketing', icon:'◐', onderschrift:'Advertenties, content, kanalen en wat ze opleveren',
    badge(){ return M.badge; },
    render
  });
})();
