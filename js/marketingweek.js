/* ═══════════════════════════════════════════════════════════════
   MODULE: MARKETINGWEEK  ("Mijn week" voor de marketeer)

   Het startscherm van wie marketing doet (profiel functie = marketeer).
   Sinds 26 okt 2026 de planner van Bryan uit het oude marketingbord
   (tak bryan-updates), overgezet naar het CRM. Besluit Tjeerd: Bryans
   versie is leidend; de vaste blokken met afvinken (mkt_blok_klaar) zijn
   vervangen door zijn tijdrooster, taken, dagplanning en notities.

   Vijf tabbladen:
     Week             tijdrooster ma–vr, dagplanning, notities, weekbalans
     Contentplanning  twee banen (IG·FB·TikTok en LinkedIn), maand
     Content Creatie  thema van vandaag, afkijken, filmdag, ideeën en scripts
     Komende weken    per week: posts ingepland, taken klaar, uren
     Jaarplan         het thema per maand en de vaste momenten

   Schone lei (Bryan, 19 okt 2026): alleen taken en posts vanaf
   PLANNER.startdatum. Oudere rijen blijven in de database staan; ze
   worden alleen niet getoond.

   Leest:    mkt_posts, mkt_taken, mkt_notities, mkt_kanalen,
             mkt_meta_stats, mkt_ad_besluiten.
   Schrijft: mkt_taken, mkt_notities, mkt_posts, Storage-bucket 'media'
             (upload voor automatisch publiceren; dat doet de
             publisher-Edge Function zelf bij Ingepland + auto_publish).
   Migraties (uit de marketing-repo, zelfde Supabase): taakgebieden,
   taaktijd, taak-outlook en notities. Ontbreekt er één, dan werkt de rest
   gewoon en staat er een melding bij wat nog niet kan.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const h = CRM.h;

  /* ─── Instellingen van de planner ─────────────────────────────
     Alles wat nu op Bryan is afgestemd staat hier bij elkaar, zodat het
     later per persoon kan (bv. PLANNER_PER_PERSOON[CRM.me()]).
     dagen = getDay(): 0=zo 1=ma … 5=vr 6=za. */
  const PLANNER = {
    startdatum: '2026-10-19',            // schone lei
    werkdagen:  [1, 2, 3, 5],
    vrijeDagen: [4],                     // donderdag vrij
    weekUren:   32,
    dagUren:    8,
    werktijd:   {van:'08:30', tot:'17:00', lunch:['12:00', '12:30']},
    rooster:    [8, 18],                 // tijdrooster loopt van 08:00 tot 18:00
    stap:       30,                      // klikken en slepen per half uur
    uurPx:      52,                      // hoogte van één uur in het rooster
    standaardDuur: 60,                   // taak zonder duur
    invoerDuur:    30,                   // standaard in de dagplanning
    vasteAfspraken: [
      {k:'dagstart', dagen:[1, 2, 3, 5], van:'08:30', tot:'09:00', titel:'Dagstart', gebied:'overig',
       txt:'Onder meer Meta-advertenties bespreken. Aanpassingen en dagtaken gaan als taken in de agenda.'},
      {k:'weekendcheck', dagen:[5], van:'15:30', tot:'16:00', titel:'Weekendcheck Meta-advertenties', gebied:'ads',
       txt:'Staan alle advertenties en budgetten goed voor het weekend?'}
    ]
  };
  /* Taakgebieden voor de weekbalans. Volgorde = cyclus bij klikken op het
     chipje; 'overig' moet de laatste blijven (terugval). */
  const GEBIEDEN = [
    {k:'content', n:'Content en social',    kort:'Content', c:'var(--olive-l)'},
    {k:'ads',     n:'Advertenties (Meta)',  kort:'Ads',     c:'var(--blue)'},
    {k:'werving', n:'Vacatures en werving', kort:'Werving', c:'var(--gold)'},
    {k:'web',     n:'Website en SEO',       kort:'Web',     c:'var(--purple)'},
    {k:'video',   n:'Video editten',        kort:'Video',   c:'var(--green)'},
    {k:'overig',  n:'Overig en overleg',    kort:'Overig',  c:'var(--txt-2)'}
  ];
  const gebied = k => GEBIEDEN.find(g => g.k === k) || GEBIEDEN[GEBIEDEN.length - 1];
  const DUREN = Array.from({length:32}, (_, i) => (i + 1) * 15);   // 15 min t/m 8 uur

  /* Twee platformen (Bryan, 19 okt 2026): Instagram-content gaat ook op
     Facebook en TikTok; LinkedIn is anders. Eén stuk content op drie
     kanalen = drie rijen met id <basis>-ig / -fb / -tt. */
  const PLATFORMS = [
    {k:'social',   n:'Instagram · Facebook · TikTok', kanalen:['Instagram', 'Facebook', 'TikTok']},
    {k:'linkedin', n:'LinkedIn',                      kanalen:['LinkedIn']}
  ];
  const platformVan = kan => PLATFORMS.find(p => p.kanalen.includes(kan));
  const KAN_AFK = {Instagram:'IG', Facebook:'FB', TikTok:'TT', LinkedIn:'in'};
  const KAN_SUFFIX = {Instagram:'ig', Facebook:'fb', TikTok:'tt'};
  const groepKey = p => /-(ig|fb|tt)$/.test(p.id) ? p.id.replace(/-(ig|fb|tt)$/, '') : `${p.titel}|${p.datum || ''}|${p.tijd || ''}|${p.id}`;
  function groepeer(posts){
    const m = new Map();
    posts.forEach(p => { const k = groepKey(p); if(!m.has(k)) m.set(k, []); m.get(k).push(p); });
    return [...m.values()];
  }
  const groepVan = p => M.posts.filter(x => groepKey(x) === groepKey(p));
  const PUB = p => ['Gepubliceerd', 'Learnings'].includes(p.fase);

  /* ─── Gegevens uit het plan (Contentstrategie 2027) ─────────── */
  const THEMA = {1:'Cijfers en plannen', 2:'Filmdag', 3:'Editdag', 4:'Vrij', 5:'Content'};
  const LINKEDIN = {1:'Tjeerd', 2:'Tjerk', 3:'Rajesh', 4:'Daan', 5:'Bryan'};
  const INSTAGRAM = [2, 4];
  const PIJLERS = ['A: Case uit de praktijk', 'B: Inzicht', 'C: Het team', 'D: Video van de werkvloer'];
  const MAANDEN = [
    ['Januari','Nieuw jaar, nieuwe kans. Kandidaten: nieuwe baan. Klanten: wat wij dit jaar doen.'],
    ['Februari','Wat we leren van de eerste 90 dagen. Cases van Le Duc.'],
    ['Maart','Resultaten laten zien. Terugblik voor klanten.'],
    ['April','Voorjaar. Aandacht voor de mensen achter de organisatie.'],
    ['Mei','Vakmanschap: wat mensen op de werkvloer doen.'],
    ['Juni','Voor de zomer: team en klantverhalen. Voorraad opbouwen.'],
    ['Juli','Zomerritme begint. Voorraad inzetten.'],
    ['Augustus','Zomerritme. Lichtere planning, geen nieuw filmwerk.'],
    ['September','Najaar start. Terugblik op een jaar Le Duc.'],
    ['Oktober','Drukte in het najaar: vacatures, extra krachten, klantverhalen.'],
    ['November','Piekperiode: wat het werk dan van mensen vraagt.'],
    ['December','Terugblik op het jaar. Het team in beeld. Plan voor 2028.']];
  const MOMENTEN = {
    '2027-02-01':'Contractdoelen Bryan: 1 februari (LinkedIn 600, Instagram 1.500)',
    '2027-02-08':'Le Duc-filmdag', '2027-02-15':'Le Duc: editen', '2027-02-22':'Le Duc: editen',
    '2027-03-22':'Le Duc: oplevering (3 video\'s)',
    '2027-05-10':'Le Duc-filmdag', '2027-05-17':'Le Duc: editen', '2027-05-24':'Le Duc: editen',
    '2027-06-21':'Le Duc: oplevering (3 video\'s)',
    '2027-07-12':'Le Duc-filmdag', '2027-07-19':'Le Duc: editen', '2027-07-26':'Le Duc: editen',
    '2027-09-20':'Le Duc: oplevering (3 video\'s)',
    '2027-03-08':'Besluit over TikTok',
    '2027-03-29':'Review van de eerste 90 dagen en kwartaalreview',
    '2027-06-28':'Kwartaalreview', '2027-09-27':'Kwartaalreview', '2027-12-20':'Jaarreview',
    '2027-08-02':'Voorraadweek: posten uit wat klaarstaat', '2027-08-09':'Voorraadweek: posten uit wat klaarstaat',
    '2027-08-16':'Voorraadweek: posten uit wat klaarstaat', '2027-12-27':'Rustweek: posten uit voorraad'};
  const TIKTOK_VAN = '2027-01-11', TIKTOK_TOT = '2027-03-01';
  const FEESTDAGEN = {
    '2026-12-25':'Eerste kerstdag', '2026-12-26':'Tweede kerstdag', '2027-01-01':'Nieuwjaarsdag',
    '2027-03-26':'Goede Vrijdag', '2027-03-29':'Tweede paasdag', '2027-04-27':'Koningsdag',
    '2027-05-06':'Hemelvaart', '2027-05-17':'Tweede pinksterdag', '2027-12-25':'Eerste kerstdag', '2027-12-26':'Tweede kerstdag'};
  const INGEPLAND = ['Ingepland', 'Gepubliceerd', 'Learnings'];

  /* ─── Content Creatie: gegevens uit Bryans bord (bryan-updates) ── */
  const THEMA_STANDAARD = [
    'Zondag — rust of vooruitblik op de week',
    'Werkvloer-maandag — achter de schermen bij een klant of op kantoor',
    'Team-dinsdag — collega, recruiter of Peter Ploeg uitgelicht',
    'Wist-je-dat-woensdag — feit of mythe over werken in productie/logistiek',
    'Verhaal-donderdag — kandidaat of plaatsing in de spotlight',
    'Vrijdag-win — succes van de week, weekend in',
    'Zaterdag — luchtig / community (optioneel)',
  ];
  const VIDEO_TEMPLATE = `🎬 WERVINGSVIDEO — SHOTLIST

HOOK (0-2 sec, salaris/cijfer in beeld + gesproken):
"…"

SHOT 1 — werkvloer, echt werk (2-6 sec):
…

SHOT 2 — de mens: collega/kandidaat aan het woord (6-15 sec):
…

WAT JE KRIJGT (15-22 sec, tekst in beeld):
• €… bruto + …% toeslag
• …

CTA (22-28 sec):
"Geen cv nodig — stuur ons een appje." (WhatsApp-link in caption)

CAPTION:
…`;
    const AFKIJKBANK = [
    {t:'Jongerentaal-script: de voorman leest voor', v:'Currys (UK) — 1,9 mln views', i:'Jongste collega schrijft de tekst vol internettaal, de oudste leest hem bloedserieus voor tijdens een rondleiding.', h:'Onze voorman (55) legt uit waarom dit magazijn een 10/10 is — in de woorden van onze jongste collega.'},
    {t:'De baas doet één keer mee met een trend', v:'vanHaren — manager Ferry gaat er steeds mee viraal', i:'Hoe stijver de leidinggevende, hoe beter. Eén take, niet te netjes gefilmd.', h:'We vroegen de ploegbaas of hij héél even mee wilde doen. Hij zei: één keer dan.'},
    {t:'Welke collega ben jij?', v:'TikTok-klassieker — iedereen herkent zichzelf', i:'Vier tot zes herkenbare types, elk 2-3 seconden in beeld. Mensen sturen hem naar elkaar door.', h:'Elke ploeg heeft ze: de heftruck-koning, de scanner-kwijtraker, de klaarstaander om 14:59. Welke ben jij?'},
    {t:'We luisteren en we oordelen niet', v:'wereldwijde trend, ook mét de baas erbij', i:'Team op een rij, iedereen bekent om de beurt iets kleins, niemand mag reageren.', h:'We luisteren en we oordelen niet — de nachtploeg-editie.'},
    {t:'POV: jij op de werkvloer', v:'#warehouseworker zit er vol mee', i:'De camera is de kijker. Eén situatie, één grap, tien seconden.', h:'POV: het is je eerste dag en je weet nog niet dat Henk altijd de goede steekwagen inpikt.'},
    {t:'Dag uit het leven — mét loon', v:'Werken bij Picnic doet dit structureel', i:'Van wekker tot einde dienst. Het loon noemen is dé reactie-magneet.', h:'Meelopen met Kevin (22), orderpicker. Dit is zijn dinsdag — inclusief wat hij verdient.'},
    {t:'Expres foute reclame (marktkoopman-stijl)', v:'De Beren deed dit voor vacatures', i:'Schreeuwerig, knipperende teksten, zo fout dat het goed is. Valt op tussen gelikte content.', h:'HEFTRUCKCHAUFFEURS!!! €17 PER UUR!!! VANDAAG BELLEN = MORGEN WERKEN!!!'},
    {t:'Welk geluid maakt die machine?', v:'trend van nú (juli 2026)', i:'Collega\'s doen vol overtuiging het geluid na, dan hoor je het echte apparaat.', h:'Wij vroegen de ploeg: welk geluid maakt de heftruck als hij achteruit rijdt?'},
    {t:'Netflix-documentaire over iets kleins', v:'trend van nú (juli 2026)', i:'Interview-opstelling en serieuze muziek, over iets totaal onbenulligs.', h:'AFLEVERING 1: De verdwenen pompwagen. Niemand weet waar pompwagen 3 is gebleven. Tot nu.'},
    {t:'Trending geluid + jouw werkvloer', v:'de motor achter bijna elke bedrijfsviral', i:'Pak het geluid van deze week en plak er één werksituatie op. Binnen 1-3 dagen posten, anders is de trend voorbij.', h:'Pak het trending geluid van deze week: welke situatie uit ons magazijn past hierop?'},
    {t:'Voor/na op de beat', v:'werkt al jaren, elke keer weer', i:'Begin van de dienst → einde nachtdienst, precies gecut op de muziek.', h:'06:00 vs 14:30 — wat 8 uur ploegendienst met een mens doet.'},
    {t:'Bloopers: de mislukte takes', v:'Duits installatiebedrijf haalde er miljoenen views mee', i:'Lachen is besmettelijk en bewijst échte sfeer. Post de nette versie een dag later.', h:'We wilden een serieuze vacaturevideo maken. Dit werd het.'},
    {t:'Drie ploegen, één dag', v:'trend van nú (juli 2026)', i:'Ochtend-, middag- en nachtploeg maken elk uur één foto; naast elkaar gemonteerd.', h:'Zelfde bedrijf, drie totaal verschillende levens. Welke ploeg past bij jou?'},
    {t:'Eerlijk over het werk — ook de mindere kanten', v:'grote trend sinds begin 2026', i:'Eerlijkheid over de nadelen maakt de voordelen geloofwaardig.', h:'Drie dingen die niemand je vertelt over magazijnwerk — en waarom ik tóch blijf.'},
    {t:'Microfoon de ploeg in', v:'"I asked my coworkers" — oneindig herhaalbaar', i:'Eén simpele vraag, vijf tot acht snelle antwoorden. Geldvragen scoren het best.', h:'We vroegen de ploeg: wat deed jij met je allereerste loonstrook?'},
  ];
    const SPIEKLIJST = [
    {w:'TikTok Creative Center', u:'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag', x:'trending hashtags & geluiden, filter op Nederland — dé wekelijkse check'},
    {w:'Volg met een kijk-account', u:'https://www.tiktok.com/@werkenbijpicnic', x:'@werkenbijpicnic · @ryanair · @vanharen_schoenen · @postnl — wat zij posten is je gratis formatkalender'},
    {w:'15 min/week scrollen', u:'https://www.tiktok.com/tag/werkenbij', x:'#magazijn #heftruck #werkenbij #nachtdienst #warehouseworker — bewaar alles met 100k+ views dat jonger is dan 2 weken'},
    {w:'Maandelijkse trendlijst', u:'https://newengen.com/insights/july-tiktok-trends/', x:'elke maand nieuwe formats uitgelegd met voorbeelden'},
    {w:'Werf& (NL recruitment-cases)', u:'https://www.werf-en.nl/', x:'welke werken-bij-content in Nederland werkt'},
  ];
  const fmtD = s => { const [j, m, d] = String(s).split('-'); return `${d}-${m}-${j.slice(2)}`; };

  /* ─── Datums en tijden (lokaal, op de middag tegen zomertijd) ── */
  const dt  = s => new Date(s + 'T12:00:00');
  const iso = d => d.toLocaleDateString('sv-SE');
  const plus = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const maandagVan = s => { const d = dt(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
  const weekNr = s => {
    const d = dt(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  };
  const kort = s => dt(s).toLocaleDateString('nl-NL', {day:'numeric', month:'short'}).replace('.', '');
  const DAGKORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const DAGLANG = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
  const dagLabel = s => `${DAGKORT[dt(s).getDay()]} ${kort(s)}`;
  const bereik = (mon, n = 6) => {
    const z = plus(mon, n), a = dt(mon), b = dt(z);
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} t/m ${b.getDate()} ${b.toLocaleDateString('nl-NL', {month:'short'}).replace('.', '')}`
      : `${kort(mon)} t/m ${kort(z)}`;
  };
  const pijlerVan = mon => {
    const n = Math.round((dt(mon) - dt('2027-01-04')) / (7 * 864e5));
    return PIJLERS[((n % 4) + 4) % 4];
  };
  const maandVan = mon => MAANDEN[dt(plus(mon, 3)).getMonth()];
  const N = x => Number(x) || 0;
  const tMin = hm => { const [a, b] = String(hm).split(':').map(Number); return a * 60 + (b || 0); };
  const tStr = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const fmtDuur = m => m < 60 ? `${m}m` : (m % 60 ? `${Math.floor(m / 60)}u${String(m % 60).padStart(2, '0')}` : `${m / 60}u`);
  const fmtUren = m => (Math.round(m / 60 * 10) / 10).toString().replace('.', ',');
  const isTijd = s => /^\d{2}:\d{2}$/.test(s || '');
  const duurVan = t => N(t.duur_min) || PLANNER.standaardDuur;
  const isWerkdag = d => PLANNER.werkdagen.includes(dt(d).getDay());
  const isVrij = d => PLANNER.vrijeDagen.includes(dt(d).getDay());
  function volgendeWerkdag(d){
    let x = d;
    do { x = plus(x, 1); } while(!isWerkdag(x));
    return x;
  }
  const afsprakenOp = d => PLANNER.vasteAfspraken.filter(a => a.dagen.includes(dt(d).getDay()));
  const afspraakMin = a => tMin(a.tot) - tMin(a.van);
  const lsGet = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const lsZet = (k, v) => { try{ v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} };

  /* ─── Staat ─────────────────────────────────────────────── */
  const M = {
    geladen:false, mount:null, actiesEl:null, demo:false,
    tab:'week', week:null,
    posts:[], kanalen:[], taken:[], notities:[], meta:[], besluiten:[],
    takenFout:null, postsFout:null,
    /* Welke migraties staan erin? Wordt bij het laden gepeild. */
    takenV2:true, takenTijd:true, takenOutlook:true, notitiesDB:true,
    dsDatum:null, dsTekst:'', dsGebied:'content', dsDuur:PLANNER.invoerDuur,
    contentWeek:null, contentWeergave:'week', calMaand:null,
    ntArchief:false, focus:null, afk:[]
  };
  const huidigeWeek = () => maandagVan(CRM.todayISO());
  const kanaalIs = (p, wat) => new RegExp(wat, 'i').test(p.kanaal || '');
  /* Wiens week staat er? De marketeer ziet zijn eigen week; de eigenaar kijkt
     mee in precies die week (Tjeerd, 26 okt 2026: "ik wil precies zien wat
     Bryan ziet"). Meekijken verandert niets aan Bryans werk: geen automatisch
     doorschuiven, geen Outlook, geen dagafsluiting en notities alleen-lezen. */
  const weekVan = () => {
    if(CRM.isMarketeer()) return CRM.me();
    const m = (CRM.state.profiles || []).find(p => p.functie === 'marketeer');
    return m?.naam || 'Bryan';
  };
  const meekijker = () => !CRM.isMarketeer();
  const vanMij = t => !!t && t.door === weekVan();
  const nieuweStart = p => p.datum ? p.datum >= PLANNER.startdatum : (p.created || '').slice(0, 10) >= PLANNER.startdatum;

  async function veilig(q){
    try{ const r = await q; return r.error ? {rows:[], fout:r.error} : {rows:r.data || [], fout:null}; }
    catch(e){ return {rows:[], fout:e}; }
  }
  async function laad(){
    if(CRM.demo){ demoData(); M.geladen = true; return; }
    const meta14 = plus(CRM.todayISO(), -14);
    const [p, t, m, a, k, n, v2, tijd, ol] = await Promise.all([
      veilig(CRM.sb.from('mkt_posts').select('*')),
      veilig(CRM.sb.from('mkt_taken').select('*').gte('datum', PLANNER.startdatum).order('datum').order('created_at')),
      veilig(CRM.sb.from('mkt_meta_stats').select('datum,uitgegeven,leads').gte('datum', meta14)),
      veilig(CRM.sb.from('mkt_ad_besluiten').select('advertentie,besluit,status,note,created_at').order('created_at', {ascending:false})),
      veilig(CRM.sb.from('mkt_kanalen').select('naam').order('volgorde')),
      veilig(CRM.sb.from('mkt_notities').select('*').order('created_at', {ascending:false})),
      /* Peilen per migratie: werkt ook op een lege tabel. */
      veilig(CRM.sb.from('mkt_taken').select('gebied,duur_min').limit(1)),
      veilig(CRM.sb.from('mkt_taken').select('tijd').limit(1)),
      veilig(CRM.sb.from('mkt_taken').select('outlook_id,outlook_sync').limit(1))
    ]);
    M.kanalen = k.rows.map(r => r.naam).filter(Boolean);
    M.posts = p.rows.map(rijNaarPost).filter(nieuweStart);
    M.postsFout = p.fout;
    M.taken = t.rows; M.takenFout = t.fout;
    M.takenV2 = !v2.fout; M.takenTijd = !tijd.fout; M.takenOutlook = !ol.fout;
    M.meta = m.rows; M.besluiten = a.rows;
    M.notitiesDB = !n.fout;
    M.notities = n.rows.filter(x => x.datum);
    ntSamenvoegen();
    M.geladen = true;
  }
  const rijNaarPost = r => ({id:String(r.id), titel:r.titel || '', kanaal:r.kanaal || '', format:r.format || '', doel:r.doel || '',
    fase:r.fase || 'Idee', hook:r.hook || '', script:r.script || '', datum:r.publicatie_datum || '', tijd:r.publicatie_tijd || '',
    link:r.link || '', learnings:r.learnings || '', campagne:r.campagne || '', media:r.media_url || '', auto:!!r.auto_publish, log:r.publiceer_log || '', created:r.created_at || ''});

  /* Demo: realistische week, nooit naar de database. Met ?demo=1&mwzonder
     doet het scherm alsof de migraties nog niet gedraaid zijn. */
  function demoData(){
    M.demo = true;
    const mon = huidigeWeek(), mij = weekVan(), ander = mij === 'Bryan' ? 'Tjeerd' : 'Bryan', nu = new Date().toISOString();
    const zonder = /mwzonder/.test(location.search);
    M.takenV2 = M.takenTijd = M.takenOutlook = M.notitiesDB = !zonder;
    const d = n => plus(mon, n);
    let i = 0;
    const taak = (dag, tekst, gebied, duur, extra = {}) => ({id:'dt' + (++i), tekst, datum:d(dag), klaar:false, door:mij,
      gebied, duur_min:duur, tijd:'', outlook_id:'', outlook_sync:'', created_at:nu, ...extra});
    M.taken = [
      taak(-3, 'Captions vrijdagpost nalopen', 'content', 30),                       // vorige week open: schuift door
      taak(-3, 'Factuur stockbeelden doorsturen', 'overig', 15, {door:ander}),       // van een ander: blijft liggen
      taak(0, 'Meta-budget vacatureset De Gier naar €12', 'ads', 15),
      taak(0, 'Script "Meet the team" schrijven', 'content', 60),
      taak(0, 'Vacaturetekst heftruckchauffeur herschrijven', 'werving', 45),
      taak(0, 'Bellen met fotograaf over filmdag', 'overig', 30, {tijd:'14:00'}),
      taak(1, 'Filmen op locatie bij Le Duc', 'video', 180, {tijd:'09:30'}),
      taak(1, 'Beeld ordenen en opslaan', 'video', 60),
      taak(2, 'Monteren reel magazijnmedewerker', 'video', 120),
      taak(2, 'Landingspagina orderpicker controleren', 'web', 45),
      taak(2, 'Advertentieset kandidaten Zoetermeer evalueren', 'ads', 30),
      taak(4, 'Teksten LinkedIn volgende week', 'content', 90),
      taak(4, 'Collega\'s helpen met hun posts', 'content', 60),
      taak(4, 'Ideeënbak doorlopen', 'overig', 30)
    ];
    if(CRM.todayISO() > d(0)) M.taken[2].klaar = true;
    const post = (id, titel, kanaal, fase, datum, extra = {}) => ({id, titel, kanaal, format:'', doel:'', fase, hook:'', script:'',
      datum, tijd:'', link:'', learnings:'', campagne:'', media:'', auto:false, log:'', created:nu, ...extra});
    const social = (basis, titel, fase, datum, extra) => ['Instagram', 'Facebook', 'TikTok']
      .map(k => post(`${basis}-${KAN_SUFFIX[k]}`, titel, k, fase, datum, extra));
    M.posts = [
      ...social('dm1', 'Dag uit het leven: orderpicker', 'Gepubliceerd', d(-2)),
      ...social('dm2', 'Wat verdient een nachtploeg écht?', 'Ingepland', d(1), {format:'Video', hook:'Nachtdienst = 25% toeslag. Reken maar mee.',
        script:'Nachtdienst = 25% toeslag. Reken maar mee. Stuur ons een appje.', media:'demo:reel-nachtploeg.mp4', tijd:'18:30'}),
      ...social('dm3', 'Le Duc: achter de schermen', 'Ingepland', d(3), {format:'Foto', media:'demo:le-duc-hal.jpg', tijd:'09:00'}),
      ...social('dm4', 'Vrijdag-win: dit maakte onze week', 'Ingepland', d(4), {format:'Tekst'}),
      post('dl1', 'Wat een planner bij ons doet', 'LinkedIn', 'Ingepland', d(0)),
      post('dl2', 'Drie lessen uit 90 dagen ploegen bouwen', 'LinkedIn', 'Ingepland', d(2)),
      post('dl3', 'Klantcase: van 4 naar 12 vaste krachten', 'LinkedIn', 'Ingepland', d(4)),
      post('di1', 'Mythe: uitzendbureaus pakken de helft van je loon', 'Instagram', 'Idee', ''),
      post('di4', 'Klantcase: ploeg compleet bij Koomstra', 'TikTok', 'Idee', '', {doel:'Klanten / leadgen'}),
      ...[1, 2, 3].map(n => post('df' + n, `Hook ${n}: orderpicker (Le Duc)`, '', 'Script klaar', '', {format:'Video', doel:'Kandidaten werven',
        campagne:`🎬 Orderpicker @ Le Duc · ${fmtD(plus(CRM.todayISO(), -4))}`, script:n === 1 ? 'Hook: €16,20 per uur, nachtdienst +25%.' : VIDEO_TEMPLATE})),
      post('di2', 'Team-dinsdag: wie zit er achter de telefoon?', 'LinkedIn', 'Idee', ''),
      ...social('di3', 'Hook 1: heftruckchauffeur', 'Script klaar', '', {format:'Video', script:'Hook: €17,50 per uur en je rijdt vanaf dag één.'})
    ];
    M.posts.forEach(p => { if(/^dm[23]-(ig|fb)$/.test(p.id)) p.auto = true; });
    const fout = M.posts.find(p => p.id === 'dm3-ig'); if(fout) fout.log = '⚠ Instagram weigert de foto: beeldverhouding buiten 4:5 tot 1,91:1';
    const goed = M.posts.find(p => p.id === 'dm1-fb'); if(goed) goed.log = '✓ Gepubliceerd op Facebook';
    M.notities = [
      {id:'dn1', datum:CRM.todayISO(), door:mij, tekst:'Bryan vragen naar filmlocatie\n[x] Budget De Gier checken\nIdee: reel over de eerste werkdag', updated_at:nu},
      {id:'dn2', datum:plus(CRM.todayISO(), -3), door:mij, tekst:'Hook testen met salaris in de eerste zin\nTikTok-account nalopen', updated_at:nu}
    ];
    M.meta = [{datum:plus(CRM.todayISO(), -1), uitgegeven:140, leads:70}];
    M.besluiten = [];   // geen eigen thema's: de standaard staat klaar
  }

  /* ─── Dagindeling: taken achter elkaar tussen de vaste blokken ──
     Volgorde = volgorde van invoeren. Taken met een vaste tijd staan
     vast; de rest loopt eromheen. Een taak mag over de lunch heen. */
  function dagIndeling(d){
    const P = PLANNER;
    const vast = afsprakenOp(d).map(a => ({soort:'afspraak', a, van:tMin(a.van), tot:tMin(a.tot)}));
    if(isWerkdag(d)) vast.push({soort:'lunch', van:tMin(P.werktijd.lunch[0]), tot:tMin(P.werktijd.lunch[1])});
    const vanDag = M.taken.filter(t => t.datum === d);
    vast.push(...vanDag.filter(t => isTijd(t.tijd)).map(t => ({soort:'taak', vastetijd:true, t, van:tMin(t.tijd), tot:tMin(t.tijd) + duurVan(t)})));
    vast.sort((a, b) => a.van - b.van);
    const eind = tMin(P.werktijd.tot);
    let cur = tMin(P.werktijd.van);
    const taken = [], past = [];
    for(const t of vanDag.filter(t => !isTijd(t.tijd))){
      let rest = duurVan(t), start = null;
      const cur0 = cur;
      while(rest > 0){
        const blok = vast.find(b => cur >= b.van && cur < b.tot);
        if(blok){ cur = blok.tot; continue; }
        if(cur >= eind) break;
        const volgende = Math.min(eind, ...vast.filter(b => b.van > cur).map(b => b.van));
        const stuk = Math.min(rest, volgende - cur);
        if(start === null) start = cur;
        cur += stuk; rest -= stuk;
      }
      if(rest > 0){ past.push(t); cur = cur0; } else taken.push({soort:'taak', t, van:start, tot:cur});
    }
    const bezet = vast.reduce((s, b) => s + (b.tot - b.van), 0) + taken.reduce((s, x) => s + duurVan(x.t), 0);
    return {blokken:[...vast, ...taken].sort((a, b) => a.van - b.van || (a.soort === 'taak') - (b.soort === 'taak')),
            past, vrijMin:Math.max(0, eind - tMin(P.werktijd.van) - bezet)};
  }
  const blokVan = t => dagIndeling(t.datum).blokken.find(x => x.t && x.t.id === t.id) || null;

  /* ─── Taken opslaan ───────────────────────────────────────── */
  /* Alleen kolommen meesturen die er zijn: een ontbrekende migratie mag
     nooit een hele opslag laten mislukken. */
  function kolommen(rij){
    const uit = {...rij};
    if(!M.takenV2){ delete uit.gebied; delete uit.duur_min; }
    if(!M.takenTijd) delete uit.tijd;
    if(!M.takenOutlook){ delete uit.outlook_id; delete uit.outlook_sync; }
    return uit;
  }
  function migratieMelding(patch){
    if(!M.takenV2 && ('gebied' in patch || 'duur_min' in patch)) return 'Taakgebied en duur worden pas bewaard na migratie-taakgebieden.sql in Supabase';
    if(!M.takenTijd && 'tijd' in patch) return 'Een vaste tijd werkt pas na migratie-taaktijd.sql in Supabase';
    return 'Dit kan pas na de migratie in Supabase';
  }
  async function updTaak(t, patch, stil){
    const echt = M.demo ? patch : kolommen(patch);
    if(!Object.keys(echt).length){ CRM.toast(migratieMelding(patch), 'err'); teken(); return false; }
    if(!M.demo){
      const {error} = await CRM.sb.from('mkt_taken').update(echt).eq('id', t.id);
      if(error){ CRM.toast('Opslaan lukt niet: ' + error.message, 'err'); teken(); return false; }
    }
    Object.assign(t, echt);
    if(!stil) teken();
    olSyncLater();
    return true;
  }
  async function toggleTaak(t, klaar){ await updTaak(t, {klaar}); }
  async function wisTaak(t){
    if(!await CRM.bevestig(`"${t.tekst}" verwijderen?`, '', {gevaarlijk:true})) return;
    if(!M.demo){
      const {error} = await CRM.sb.from('mkt_taken').delete().eq('id', t.id);
      if(error){ CRM.toast('Verwijderen lukt niet: ' + error.message, 'err'); return; }
      if(t.outlook_id && vanMij(t) && olAan()) CRM.outlook.belEventWeg(t.outlook_id).catch(e => console.warn('outlook weg', e));
    }
    M.taken = M.taken.filter(x => x !== t); teken();
  }
  async function schuifDoor(lijst, naar, stil){
    let n = 0;
    for(const t of lijst){
      if(!M.demo){
        const {error} = await CRM.sb.from('mkt_taken').update({datum:naar}).eq('id', t.id);
        if(error){ console.warn('doorschuiven', error); continue; }
      }
      t.datum = naar; n++;
    }
    if(!stil && n) CRM.toast(`${n} ${n > 1 ? 'taken' : 'taak'} doorgeschoven naar ${dagLabel(naar)}`, 'ok');
    teken(); olSyncLater();
    return n;
  }

  /* Normaliseert ingesproken tijden: "om half drie" → om 14:30,
     "een half uur" → 30m. Werkt ook op getypte regels. */
  const GETAL = {een:1, 'één':1, twee:2, drie:3, vier:4, vijf:5, zes:6};
  const UUR_WOORD = {een:1, 'één':1, twee:2, drie:3, vier:4, vijf:5, zes:6, zeven:7, acht:8, negen:9, tien:10, elf:11, twaalf:12};
  function spraakNaarRegel(tekst){
    let r = tekst.trim().replace(/[.!?]+$/, '');
    r = r.replace(/\som\s+half\s+(\S+)/i, (alles, w) => { const u = UUR_WOORD[w.toLowerCase()] ?? Number(w); return isNaN(u) ? alles : ` om ${(u - 1 < 8 ? u - 1 + 12 : u - 1)}:30`; })
         .replace(/\som\s+(een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf)\s+uur/i, (_, w) => { const u = UUR_WOORD[w.toLowerCase()]; return ` om ${u < 8 ? u + 12 : u}:00`; });
    r = r.replace(/\s+(?:een\s+)?kwartier$/i, ' 15m')
         .replace(/\s+anderhalf\s+uur$/i, ' 1,5u')
         .replace(/\s+(?:een\s+)?half\s+uur(?:tje)?$/i, ' 30m')
         .replace(/\s+(een|één|twee|drie|vier|vijf|zes)\s+uur$/i, (_, w) => ` ${GETAL[w.toLowerCase()]}u`)
         .replace(/\s+(\d+(?:[.,]\d+)?)\s*(minuten|minuut)$/i, ' $1m');
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
  /* Eén taak per regel; duur en tijdstip mogen erachter:
     "Bellen met Vlisco om 14:00 30m", "Script schrijven 1,5u", "Overleg om 10 uur". */
  function leesRegel(regel, duur){
    let tekst = spraakNaarRegel(regel), d = duur, tijd = '';
    const uk = tekst.match(/\s+(\d+)\s*u\s*(\d{2})\s*(?:m|min)?\.?$/i);
    if(uk){ d = Number(uk[1]) * 60 + Number(uk[2]); tekst = tekst.slice(0, uk.index).trim(); }
    const m = uk ? null : tekst.match(/\s+(\d+(?:[.,]\d+)?)\s*(uur|u|minuten|minuut|min|m)\.?$/i);
    if(m && !/\som\s+\d{1,2}\s*(uur|u)\.?$/i.test(tekst)){
      const n = Number(m[1].replace(',', '.'));
      d = Math.max(5, Math.round(/^u/i.test(m[2]) ? n * 60 : n)); tekst = tekst.slice(0, m.index).trim();
    }
    const o = tekst.match(/\s+om\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:uur|u))?\.?$/i);
    if(o){
      let u = Number(o[1]); if(u < 8) u += 12;
      if(u <= 23){ tijd = `${String(u).padStart(2, '0')}:${o[2] || '00'}`; tekst = tekst.slice(0, o.index).trim(); }
    }
    return {tekst, duur:d, tijd};
  }
  async function addTaken(regels, datum, gb, duur){
    const bestaand = new Set(M.taken.filter(t => t.datum === datum).map(t => t.tekst));
    const nieuw = regels.map(r => r.trim()).filter(Boolean).map(r => leesRegel(r, duur)).filter(x => x.tekst && !bestaand.has(x.tekst));
    if(!nieuw.length){ CRM.toast('Niets nieuws om toe te voegen'); return false; }
    const zonderTijd = !M.demo && !M.takenTijd && nieuw.some(x => x.tijd);
    const rijen = nieuw.map(x => ({tekst:x.tekst, datum, klaar:false, door:CRM.me(), gebied:gb, duur_min:x.duur, tijd:x.tijd}));
    if(M.demo){
      rijen.forEach((r, i) => M.taken.push({...r, id:'x' + Date.now() + i, outlook_id:'', outlook_sync:'', created_at:new Date().toISOString()}));
    } else {
      const {data, error} = await CRM.sb.from('mkt_taken').insert(rijen.map(kolommen)).select();
      if(error){ CRM.toast('Taken opslaan lukt niet: ' + error.message, 'err'); return false; }
      M.taken.push(...(data || []));
    }
    CRM.toast(zonderTijd ? 'Opgeslagen zonder vaste tijd: draai eerst migratie-taaktijd.sql'
      : `${nieuw.length} ${nieuw.length > 1 ? 'taken' : 'taak'} ingepland op ${dagLabel(datum)}`, zonderTijd ? 'err' : 'ok');
    teken(); olSyncLater();
    return true;
  }

  /* Open taken van een eerdere dag schuiven vanzelf door naar vandaag (of
     de eerstvolgende werkdag). ALLEEN je eigen taken: die van een ander
     blijven liggen tot die ander ze zelf oppakt. */
  let _doorschuiven = false;
  async function autoDoorschuiven(){
    if(_doorschuiven || M.takenFout || meekijker()) return;
    const vandaag = CRM.todayISO();
    const naar = isWerkdag(vandaag) ? vandaag : volgendeWerkdag(vandaag);
    const oud = M.taken.filter(t => !t.klaar && t.datum < vandaag && vanMij(t));
    if(!oud.length) return;
    _doorschuiven = true;
    try{
      const n = await schuifDoor(oud, naar, true);
      if(n) CRM.toast(`${n} open ${n > 1 ? 'taken' : 'taak'} van eerder doorgeschoven naar ${dagLabel(naar)}`);
    } finally { _doorschuiven = false; }
  }

  /* ─── Outlook-agenda: eigen taken als afspraken (eenrichting) ───
     Via CRM.outlook (js/outlook.js), zelfde Entra-app als de rest van het
     CRM. Per taak bewaren we het id van de afspraak (outlook_id) en een
     vingerafdruk (outlook_sync), zodat alleen echte wijzigingen gaan. */
  const OL_KEY = 'crm_mw_outlook';
  const olKan = () => !!(CRM.outlook && CRM.outlook.beschikbaar());
  const olAan = () => !meekijker() && olKan() && CRM.outlook.verbonden() && lsGet(OL_KEY) === '1' && M.takenOutlook;
  let _olTimer = null, _olBezig = false;
  async function olKoppelen(){
    if(CRM.demo){ CRM.toast('In de demo gaat er niets naar Outlook'); return; }
    if(!olKan()){ CRM.toast('De Outlook-koppeling is hier niet beschikbaar', 'err'); return; }
    if(!M.takenOutlook){ CRM.toast('Draai eerst migratie-taak-outlook.sql in Supabase', 'err'); return; }
    if(!CRM.outlook.verbonden() && !await CRM.outlook.verbind()) return;
    lsZet(OL_KEY, '1');
    CRM.toast('Outlook-agenda gekoppeld: je eigen taken komen nu in je agenda', 'ok');
    teken(); await olSync(true);
  }
  function olOntkoppelen(){
    lsZet(OL_KEY, null);
    CRM.toast('Taken gaan niet meer naar je agenda. Afspraken die er al staan blijven staan.');
    teken();
  }
  function olSyncLater(){ if(!olAan() || M.demo) return; clearTimeout(_olTimer); _olTimer = setTimeout(() => olSync(false), 2500); }
  async function bewaarOl(t, id, sig){
    const {error} = await CRM.sb.from('mkt_taken').update({outlook_id:id, outlook_sync:sig}).eq('id', t.id);
    if(error){ M.takenOutlook = false; throw new Error('koppeling niet op te slaan, draai migratie-taak-outlook.sql'); }
    t.outlook_id = id; t.outlook_sync = sig;
  }
  async function olSync(handmatig){
    if(!olAan() || _olBezig || M.demo || M.takenFout) return;
    _olBezig = true;
    let n = 0;
    try{
      const vandaag = CRM.todayISO();
      for(const t of M.taken.filter(x => vanMij(x) && x.datum >= vandaag)){
        const b = blokVan(t);
        if(!b){                                   // past niet (meer) op de dag: geen afspraak
          if(t.outlook_id){ await CRM.outlook.belEventWeg(t.outlook_id); await bewaarOl(t, '', ''); n++; }
          continue;
        }
        const van = tStr(b.van), sig = [t.datum, van, tStr(b.tot), t.tekst, t.klaar ? 1 : 0].join('|');
        if(t.outlook_id && t.outlook_sync === sig) continue;
        const startISO = new Date(`${t.datum}T${van}:00`).toISOString(), minuten = b.tot - b.van;
        const oud = String(t.outlook_sync || '').split('|');
        let id = t.outlook_id || '';
        if(id && oud.length === 5 && oud[3] === t.tekst && oud[4] === String(t.klaar ? 1 : 0)){
          try{ await CRM.outlook.belEventVerzet(id, startISO, minuten); }   // alleen tijd of dag anders
          catch(e){ if(e.status === 404) id = ''; else throw e; }
        } else if(id){
          await CRM.outlook.belEventWeg(id); id = '';                       // tekst of afvinken: opnieuw maken
        }
        if(!id){
          id = await CRM.outlook.belEventMaak({titel:(t.klaar ? '✓ ' : '') + t.tekst, startISO, minuten,
            htmlBody:`Taak uit Mijn week in het Ploeggenoten-CRM (${h(gebied(t.gebied).n)}).`}) || '';
          if(!id) throw new Error('Outlook gaf geen afspraak terug');
        }
        await bewaarOl(t, id, sig); n++;
      }
      if(handmatig) CRM.toast(n ? `${n} ${n > 1 ? 'taken' : 'taak'} bijgewerkt in je agenda` : 'Je agenda is al bij', 'ok');
    } catch(e){
      console.warn('outlook-sync', e);
      if(handmatig || e.status === 401) CRM.toast('Agenda bijwerken lukte niet: ' + (e.message || e), 'err');
    } finally { _olBezig = false; }
  }

  /* ─── Notities: per dag een lijstje, per persoon ──────────────
     Afgevinkt = "[x] " vooraan de regel. De database is de bron; een kopie
     op deze computer vangt op als de database (nog) niet wil. */
  const ntSleutel = () => 'crm_mw_notities|' + (weekVan() || 'ik');
  const mijnNotitie = n => n.door === weekVan() || !n.door;
  const notitieVan = d => M.notities.find(n => n.datum === d && mijnNotitie(n)) || null;
  const ntRegels = n => String(n?.tekst || '').split('\n').filter(r => r.trim()).map(r => ({af:/^\[x\]\s*/i.test(r), tekst:r.replace(/^\[x\]\s*/i, '')}));
  const ntNaarTekst = regels => regels.map(r => (r.af ? '[x] ' : '') + r.tekst).join('\n');
  function ntLokaal(){ try{ return JSON.parse(lsGet(ntSleutel()) || '{}') || {}; }catch(e){ return {}; } }
  function ntLokaalZet(datum, tekst){ const l = ntLokaal(); l[datum] = {tekst, t:new Date().toISOString()}; lsZet(ntSleutel(), JSON.stringify(l)); }
  function ntSamenvoegen(){
    if(meekijker()) return;
    for(const [datum, v] of Object.entries(ntLokaal())){
      const db = notitieVan(datum);
      if(!db) M.notities.push({id:null, datum, tekst:v.tekst, door:CRM.me(), updated_at:v.t, _teSturen:true});
      else if((v.t || '') > (db.updated_at || '') && v.tekst !== db.tekst){ db.tekst = v.tekst; db._teSturen = true; }
    }
    if(M.notitiesDB) setTimeout(() => M.notities.filter(n => n._teSturen && n.tekst.trim())
      .forEach(n => { delete n._teSturen; ntOpslaan(n.datum, n.tekst, true); }), 0);
  }
  let _ntTimer = null, _ntKetting = Promise.resolve(), _ntFoutGemeld = false;
  function ntStatus(tekst, waarschuw){
    const el = document.getElementById('mw_ntstatus');
    if(el){ el.textContent = tekst; el.classList.toggle('mw-warn', !!waarschuw); }
  }
  function ntOpslaan(d, tekst, direct){
    if(meekijker()) return;
    let n = notitieVan(d);
    if(!n){ n = {id:null, datum:d, tekst:'', door:CRM.me()}; M.notities.unshift(n); }
    n.tekst = tekst; n.updated_at = new Date().toISOString();
    if(M.demo){ ntStatus('demo: niet opgeslagen'); return; }
    ntLokaalZet(d, tekst);
    clearTimeout(_ntTimer); _ntTimer = null;
    if(!M.notitiesDB){ ntStatus('bewaard op deze computer', true); return; }
    ntStatus('opslaan…');
    const schrijf = () => { _ntTimer = null; _ntKetting = _ntKetting.then(async () => {
      let error;
      if(n.id) ({error} = await CRM.sb.from('mkt_notities').update({tekst:n.tekst, updated_at:new Date().toISOString()}).eq('id', n.id));
      else {
        const r = await CRM.sb.from('mkt_notities').insert({datum:n.datum, tekst:n.tekst, door:n.door}).select().single();
        error = r.error; if(!error){ n.id = r.data.id; n.updated_at = r.data.updated_at; }
      }
      if(error){
        ntStatus('bewaard op deze computer (database weigert)', true);
        if(!_ntFoutGemeld){ _ntFoutGemeld = true; CRM.toast('Notitie staat op deze computer; de database weigert nog: ' + error.message, 'err'); }
      } else ntStatus('opgeslagen');
    }); };
    if(direct) schrijf(); else _ntTimer = setTimeout(schrijf, 500);
  }
  window.addEventListener('pagehide', () => {
    if(!_ntTimer) return;
    const d = M.dsDatum || CRM.todayISO(), n = notitieVan(d);
    if(n) ntOpslaan(d, n.tekst, true);
  });

  /* ─── Cijfers voor Komende weken ───────────────────────────── */
  function postsOp(datum){ return M.posts.filter(p => p.datum === datum); }
  function slotsVoor(mon){
    const uit = [];
    for(const dag of [1, 2, 3, 4, 5]){
      const datum = plus(mon, dag - 1);
      uit.push({dag, datum, kanaal:'LinkedIn'});
      if(INSTAGRAM.includes(dag)) uit.push({dag, datum, kanaal:'Instagram'});
    }
    return uit;
  }
  function slotStatus(s){
    const hits = postsOp(s.datum).filter(p => kanaalIs(p, s.kanaal));
    return hits.some(p => INGEPLAND.includes(p.fase)) ? 'ok' : hits.length ? 'bezig' : 'leeg';
  }
  function weekCijfers(mon){
    const slots = slotsVoor(mon);
    const ingepland = slots.filter(s => slotStatus(s) === 'ok').length;
    const dagen = [0, 1, 2, 3, 4, 5, 6].map(i => plus(mon, i));
    const taken = M.taken.filter(t => dagen.includes(t.datum));
    const takenKlaar = taken.filter(t => t.klaar).length;
    const minuten = taken.reduce((s, t) => s + duurVan(t), 0);
    const totaal = slots.length + taken.length;
    return {slots:slots.length, ingepland, taken:taken.length, takenKlaar, minuten,
            pct: totaal ? (ingepland + takenKlaar) / totaal : 0};
  }

  /* ─── Weergave: Week ─────────────────────────────────────── */
  function metaTegels(){
    const vandaag = CRM.todayISO(), v7 = plus(vandaag, -6);
    const rijen = M.meta.filter(r => (r.datum || '') >= v7);
    const spend = rijen.reduce((s, r) => s + N(r.uitgegeven), 0);
    const laatste = M.meta.reduce((x, r) => (r.datum || '') > x ? r.datum : x, '');
    const leads = (CRM.state?.leads || []).filter(l => l.bron === 'Meta' && l.bot_status !== 'Dubbel'
      && String(l.binnen_op || '').slice(0, 10) >= v7).length;
    const cpl = spend > 0 && leads > 0 ? spend / leads : null;
    const adv = M.besluiten.filter(b => ['advies', 'budget'].includes(b.besluit) && (b.status || 'open') === 'open'
      && !String(b.advertentie || '').startsWith('__')).length;
    const stil = !laatste || CRM.dagenGeleden(laatste) >= 2;
    const t = (l, w, s) => `<div class="mw-tegel"><span class="mw-tl">${h(l)}</span><b>${w}</b>${s ? `<span class="mw-ts">${h(s)}</span>` : ''}</div>`;
    return `<div class="mw-meta">
      ${t('Uitgegeven, 7 dagen', spend ? CRM.euro(spend) : '—', laatste ? 'tot ' + kort(laatste) : 'geen cijfers')}
      ${t('Leads in het CRM, 7 dagen', leads, 'zonder dubbelen')}
      ${t('Kosten per lead', cpl ? CRM.euro(cpl, 2) : '—', 'uitgaven gedeeld door CRM-leads')}
      <a class="mw-tegel mw-link" data-ga="marketing"><span class="mw-tl">Open adviezen</span><b>${adv}</b><span class="mw-ts">naar Marketing ›</span></a>
    </div>${stil ? `<div class="note warn mw-mb">De Meta-cijfers lopen niet bij${laatste ? ` (laatste dag: ${h(kort(laatste))})` : ''}. Check de meta-sync, anders kloppen de bedragen hierboven niet.</div>` : ''}`;
  }

  const groepLabel = g => { const pl = platformVan(g[0].kanaal); return pl && pl.kanalen.length > 1 ? g.map(x => KAN_AFK[x.kanaal] || x.kanaal).join('·') : ''; };
  const plKlasse = p => { const pl = platformVan(p.kanaal); return pl ? 'mw-pl-' + pl.k : 'mw-pl-ander'; };

  function roosterHtml(dagen){
    const P = PLANNER, vandaag = CRM.todayISO(), R0 = P.rooster[0] * 60, R1 = P.rooster[1] * 60;
    const rY = m => (m - R0) / 60 * P.uurPx, hoogte = (P.rooster[1] - P.rooster[0]) * P.uurPx;
    const kop = dagen.map(d => {
      const dag = dt(d), vrij = isVrij(d), ind = dagIndeling(d);
      const min = M.taken.filter(t => t.datum === d).reduce((s, t) => s + duurVan(t), 0) + afsprakenOp(d).reduce((s, a) => s + afspraakMin(a), 0);
      const vol = Math.min(100, min / (P.dagUren * 60) * 100), over = min > P.dagUren * 60;
      const posts = groepeer(M.posts.filter(p => p.datum === d && INGEPLAND.includes(p.fase)));
      const feest = FEESTDAGEN[d];
      return `<div class="mw-tr-kop${d === vandaag ? ' vandaag' : ''}${vrij ? ' vrij' : ''}" data-dagkies="${d}" title="Open deze dag in de dagplanning">
        <div class="mw-tr-dn"><b>${DAGLANG[dag.getDay()]}</b><span class="num">${h(kort(d))}</span>${d === vandaag ? '<em>vandaag</em>' : vrij ? '<em>vrij</em>' : ''}</div>
        ${feest ? `<div class="meta">${h(feest)}</div>` : ''}
        <div class="mw-tr-uren${over ? ' vol' : ''}"><i style="width:${vol}%"></i></div>
        <div class="mw-tr-urent${over ? ' vol' : ''}">${min ? `${fmtUren(min)} / ${P.dagUren} uur` : vrij ? 'vrije dag' : 'nog niets gepland'}</div>
        ${posts.map(g => `<div class="mw-tr-post ${plKlasse(g[0])}${g.every(PUB) ? ' klaar' : ''}" data-post="${h(g[0].id)}" title="Post: ${h(g[0].titel)}">${h(g[0].titel || 'Zonder titel')}${groepLabel(g) ? ` <small>${h(groepLabel(g))}</small>` : ''}</div>`).join('')}
        ${ind.past.map(t => `<div class="mw-tr-past" title="Past niet meer op deze dag">Past niet: ${h(t.tekst)}</div>`).join('')}
      </div>`;
    }).join('');
    const nu = new Date(), nuMin = nu.getHours() * 60 + nu.getMinutes();
    const lijnen = Array.from({length:(P.rooster[1] - P.rooster[0]) * 2}, (_, i) => `<div class="mw-tr-lijn${i % 2 ? ' half' : ''}" style="top:${i * P.uurPx / 2}px"></div>`).join('');
    const kol = dagen.map(d => {
      const ind = dagIndeling(d), vrij = isVrij(d);
      const blokken = ind.blokken.filter(b => b.soort !== 'lunch' && b.tot > R0 && b.van < R1);
      blokken.sort((x, y) => x.van - y.van);
      for(let i = 0; i < blokken.length;){        // overlappende blokken naast elkaar
        let eind = blokken[i].tot, j = i + 1;
        while(j < blokken.length && blokken[j].van < eind){ eind = Math.max(eind, blokken[j].tot); j++; }
        const groep = blokken.slice(i, j), banen = [];
        groep.forEach(b => { let k = banen.findIndex(e => e <= b.van); if(k < 0){ k = banen.length; banen.push(0); } banen[k] = b.tot; b.baan = k; });
        groep.forEach(b => { b.nBanen = banen.length; });
        i = j;
      }
      const pos = b => { const van = Math.max(b.van, R0), tot = Math.min(b.tot, R1);
        return `top:${rY(van)}px;height:${Math.max(18, (tot - van) / 60 * P.uurPx - 2)}px;left:calc(${b.baan * 100 / b.nBanen}% + 2px);width:calc(${100 / b.nBanen}% - 4px)`; };
      const lunch = ind.blokken.filter(b => b.soort === 'lunch').map(b => `<div class="mw-tr-lunch" style="top:${rY(b.van)}px;height:${(b.tot - b.van) / 60 * P.uurPx}px">lunch</div>`).join('');
      return `<div class="mw-tr-dag${d === vandaag ? ' vandaag' : ''}${vrij ? ' vrij' : ''}" data-trdag="${d}" style="height:${hoogte}px">
        ${lijnen}${lunch}
        ${blokken.map(b => {
          if(b.soort === 'afspraak') return `<div class="mw-tr-blok mw-tr-afspraak${b.a.k === 'dagstart' ? ' ds' : ''}" data-afspraak="${h(b.a.k)}" data-dag="${d}" style="${pos(b)}" title="${h(b.a.txt)}"><b class="num">${h(b.a.van)}</b> ${h(b.a.titel)}</div>`;
          const t = b.t, g = gebied(t.gebied);
          return `<div class="mw-tr-blok mw-tr-taak${t.klaar ? ' klaar' : ''}${b.vastetijd ? ' vast' : ''}" data-tid="${h(t.id)}" style="${pos(b)};--gc:${g.c}" title="${tStr(b.van)}–${tStr(b.tot)} · ${h(t.tekst)} · ${h(g.n)}${b.vastetijd ? ' · vaste tijd' : ''}${t.door && !vanMij(t) ? ' · van ' + h(t.door) : ''}">
            <input type="checkbox" data-tgl="${h(t.id)}"${t.klaar ? ' checked' : ''} aria-label="Afvinken"><b class="num">${tStr(b.van)}</b> ${h(t.tekst)}</div>`;
        }).join('')}
        ${d === vandaag && nuMin >= R0 && nuMin <= R1 ? `<div class="mw-tr-nu" style="top:${rY(nuMin)}px"></div>` : ''}
      </div>`;
    }).join('');
    const uren = Array.from({length:P.rooster[1] - P.rooster[0]}, (_, i) => P.rooster[0] + i)
      .map(u => `<div class="mw-tr-uur num" style="top:${rY(u * 60)}px;height:${P.uurPx}px">${u}</div>`).join('');
    return `<div class="mw-tr" style="--n:${dagen.length}">
      <div class="mw-tr-rij mw-tr-koprij"><div class="mw-tr-hoek"></div>${kop}</div>
      <div class="mw-tr-rij mw-tr-body"><div class="mw-tr-uren-kol" style="height:${hoogte}px">${uren}</div>${kol}</div>
    </div>`;
  }

  function taakRij(t, schuif){
    const g = gebied(t.gebied);
    const extra = M.takenV2 ? `
      <button class="mw-tchip mw-gchip" data-tgeb="${h(t.id)}" style="--gc:${g.c}" title="${h(g.n)}: klik om het taakgebied te wisselen" type="button">${h(g.kort)}</button>
      <button class="mw-tchip${t.tijd ? ' vast' : ''}" data-ttijd="${h(t.id)}" title="${t.tijd ? 'Vaste tijd: klik om te wijzigen' : 'Vaste tijd geven (anders plant de dag hem zelf in)'}" type="button">${t.tijd ? h(t.tijd) : 'tijd'}</button>
      <button class="mw-tchip" data-tduur="${h(t.id)}" title="Hoe lang duurt het? Klik om te wijzigen" type="button">${fmtDuur(duurVan(t))}</button>` : '';
    return `<div class="mw-taak${t.klaar ? ' klaar' : ''}" style="--gc:${g.c}">
      <input type="checkbox" data-tgl="${h(t.id)}"${t.klaar ? ' checked' : ''} aria-label="Afvinken">
      <span class="mw-tt">${h(t.tekst)}${t.door && !vanMij(t) ? ` <small class="meta">· ${h(t.door)}</small>` : ''}</span>
      ${schuif && !t.klaar ? `<button class="mw-tchip" data-tschuif="${h(t.id)}" title="Doorschuiven naar de volgende werkdag" type="button">→ ${DAGKORT[dt(volgendeWerkdag(t.datum)).getDay()]}</button>` : ''}
      ${extra}
      <button class="mw-x" data-twis="${h(t.id)}" title="Verwijderen" type="button">×</button>
    </div>`;
  }

  function dagplanningHtml(dagen){
    const P = PLANNER, vandaag = CRM.todayISO(), werk = dagen.filter(isWerkdag);
    if(!M.dsDatum || !dagen.includes(M.dsDatum)) M.dsDatum = werk.find(d => d >= vandaag) || werk[0] || dagen[0];
    const d = M.dsDatum, ind = dagIndeling(d);
    const nOpen = M.taken.filter(t => t.datum === d && !t.klaar && vanMij(t)).length;
    const lijn = ind.blokken.map(b => {
      const tijd = `<span class="mw-dp-tijd num">${tStr(b.van)}–${tStr(b.tot)}</span>`;
      if(b.soort === 'lunch') return `<div class="mw-dp-rij lunch">${tijd}<span class="meta">Lunch</span></div>`;
      if(b.soort === 'afspraak') return `<div class="mw-dp-rij">${tijd}<span class="mw-dp-afspraak${b.a.k === 'dagstart' ? ' ds' : ''}" data-afspraak="${h(b.a.k)}" data-dag="${d}" title="${h(b.a.txt)}"><b>${h(b.a.titel)}</b></span></div>`;
      const pauze = (b.tot - b.van) > duurVan(b.t) ? '<small class="meta mw-dp-pauze">loopt door na de pauze</small>' : '';
      return `<div class="mw-dp-rij">${tijd}<div>${taakRij(b.t, true)}${pauze}</div></div>`;
    }).join('');
    return `<div class="card mw-blok" id="mw_ds">
      <div class="card-h"><b class="mw-ch">Dagplanning</b>
        <div class="seg mw-dagseg">${werk.map(x => `<button class="${x === d ? 'on' : ''}" data-dpdag="${x}" type="button">${h(dagLabel(x))}${x === vandaag ? ' · vandaag' : ''}</button>`).join('')}</div></div>
      <div class="card-b mw-dp">
        <div>
          <div class="mw-sec">Taken voor ${h(dagLabel(d))}</div>
          <p class="meta mw-hint">Eén taak per regel. Duur en tijdstip mogen erachter: "Bellen met Vlisco om 14:00 30m".</p>
          <div class="mw-ds-veld"><textarea id="mw_dstaken" data-fokus="ds-taken" rows="5" placeholder="Bijvoorbeeld&#10;Budget vacatureset De Gier naar €12 15m&#10;Script Meet the team schrijven 1u&#10;Flyer magazijn ontwerpen 2u">${h(M.dsTekst)}</textarea></div>
          ${M.takenV2 ? `<div class="mw-gkeuze">${GEBIEDEN.map(g => `<button class="mw-gk${g.k === M.dsGebied ? ' on' : ''}" data-dsgeb="${g.k}" style="--gc:${g.c}" type="button">${h(g.kort)}</button>`).join('')}</div>` : ''}
          <div class="row tight mw-ds-knoppen">
            <span id="mw_dsmic"></span>
            ${M.takenV2 ? `<select id="mw_dsduur" aria-label="Tijd per taak" title="Tijd per taak als je er geen achter zet">${DUREN.map(m => `<option value="${m}"${m === M.dsDuur ? ' selected' : ''}>${fmtDuur(m)} per taak</option>`).join('')}</select>` : ''}
            <button class="btn sm" id="mw_dszet" type="button">Inplannen</button>
          </div>
        </div>
        <div>
          <div class="mw-sec">Zo ziet ${d === vandaag ? 'je dag' : h(dagLabel(d))} eruit <span class="meta mw-nocaps">${h(P.werktijd.van)}–${h(P.werktijd.tot)} · nog ${fmtUren(ind.vrijMin)} uur vrij</span></div>
          <div class="mw-dp-lijn">${lijn || '<div class="meta">Geen werkdag.</div>'}
            ${ind.past.length ? `<div class="mw-dp-past"><b>Past niet meer op ${h(dagLabel(d))}</b>${ind.past.map(t => taakRij(t, true)).join('')}</div>` : ''}
          </div>
          ${d === vandaag && nOpen ? `<button class="btn ghost sm mw-mt" id="mw_afsluiten" type="button">Dag afsluiten (${nOpen} open)</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  function notitiesHtml(){
    const d = M.dsDatum || CRM.todayISO(), n = notitieVan(d), regels = ntRegels(n), vandaag = CRM.todayISO();
    const alle = M.notities.filter(x => mijnNotitie(x) && x.datum && String(x.tekst || '').trim()).sort((a, b) => b.datum.localeCompare(a.datum));
    const status = M.demo ? '' : !M.notitiesDB ? 'bewaard op deze computer' : n?.updated_at ? 'opgeslagen' : '';
    return `<div class="card mw-blok" id="mw_nt">
      <div class="card-h"><b class="mw-ch">Notities van ${d === vandaag ? 'vandaag' : h(dagLabel(d))}</b><span class="meta${M.notitiesDB ? '' : ' mw-warn'}" id="mw_ntstatus">${h(status)}</span></div>
      <div class="card-b">
        ${M.notitiesDB ? '' : '<div class="note warn mw-mb">Je notities staan nu alleen op deze computer. Draai migratie-notities.sql in Supabase, dan gaan ze vanzelf naar de database en zie je ze op elk apparaat.</div>'}
        <div class="mw-nt-lijst">
          ${regels.map((r, i) => `<div class="mw-nt-item${r.af ? ' af' : ''}">
            <input type="checkbox" data-ntcheck="${i}"${r.af ? ' checked' : ''} aria-label="Afvinken">
            <input type="text" class="mw-nt-tekst" data-ntregel="${i}" data-fokus="nt-r${i}" value="${h(r.tekst)}" aria-label="Notitie">
            <button class="mw-tchip" data-nttaak="${i}" title="Deze notitie in de takenlijst zetten" type="button">→ taak</button>
            <button class="mw-x" data-ntweg="${i}" title="Weghalen" type="button">×</button>
          </div>`).join('')}
          <div class="mw-nt-item nieuw"><span class="mw-nt-plus">+</span><input type="text" class="mw-nt-tekst" id="mw_ntnieuw" data-fokus="nt-nieuw" placeholder="Typ een notitie en druk op Enter" aria-label="Nieuwe notitie"></div>
        </div>
        ${regels.some(r => !r.af) ? '<button class="btn ghost sm mw-mt" id="mw_ntalles" type="button">Alles naar takenlijst</button>' : ''}
        ${alle.length ? `<details class="mw-nt-archief"${M.ntArchief ? ' open' : ''}><summary>Alle notities per dag (${alle.length} ${alle.length > 1 ? 'dagen' : 'dag'})</summary>
          <input type="search" id="mw_ntzoek" data-fokus="nt-zoek" placeholder="Zoek in je notities" aria-label="Zoek in je notities">
          ${alle.map(x => `<div class="mw-nt-eerder" data-ntzoek="${h((dagLabel(x.datum) + ' ' + x.tekst).toLowerCase())}">
            <div class="mw-nt-kop"><b>${x.datum === vandaag ? 'Vandaag · ' : ''}${h(dt(x.datum).toLocaleDateString('nl-NL', {weekday:'long', day:'numeric', month:'long', year:'numeric'}))}</b>
              ${x.datum === d ? '<span class="meta">open</span>' : `<button class="btn sub sm" data-ntopen="${x.datum}" type="button">Openen</button>`}</div>
            <div class="mw-nt-lees">${ntRegels(x).map(r => `${r.af ? '✓' : '•'} ${h(r.tekst)}`).join('\n')}</div></div>`).join('')}
        </details>` : ''}
      </div>
    </div>`;
  }

  function weekBalansHtml(dagen){
    const P = PLANNER, vandaag = CRM.todayISO();
    const vast = dagen.flatMap(d => afsprakenOp(d).map(a => ({gebied:a.gebied, duur_min:afspraakMin(a), klaar:d < vandaag})));
    const taken = M.taken.filter(t => dagen.includes(t.datum)).concat(vast);
    const per = GEBIEDEN.map(g => {
      const ts = taken.filter(t => gebied(t.gebied).k === g.k);
      return {g, gepland:ts.reduce((s, t) => s + duurVan(t), 0), af:ts.filter(t => t.klaar).reduce((s, t) => s + duurVan(t), 0), n:ts.length};
    });
    const totaal = per.reduce((s, p) => s + p.gepland, 0), totaalAf = per.reduce((s, p) => s + p.af, 0);
    const cap = P.weekUren * 60, max = Math.max(cap, totaal), over = totaal - cap;
    return `<div class="mw-bal-kop"><b>${fmtUren(totaal)} van ${P.weekUren} uur gepland</b> · ${fmtUren(totaalAf)} uur afgerond ·
        ${over > 0 ? `<span class="neg">${fmtUren(over)} uur te veel, schuif iets door</span>` : `${fmtUren(cap - totaal)} uur nog vrij`}</div>
      <div class="mw-bal-tot">${per.filter(p => p.gepland).map(p => `<div style="--gc:${p.g.c};width:${p.gepland / max * 100}%" title="${h(p.g.n)}: ${fmtUren(p.gepland)} uur"></div>`).join('')}</div>
      ${per.map(p => `<div class="mw-bal-rij" style="--gc:${p.g.c}">
        <span class="mw-bal-naam"><i></i>${h(p.g.n)}</span>
        <span class="mw-bal-bar"><span style="width:${totaal ? p.gepland / totaal * 100 : 0}%"></span><span class="af" style="width:${totaal ? p.af / totaal * 100 : 0}%"></span></span>
        <span class="mw-bal-uren num">${p.n ? `${fmtUren(p.gepland)} u · ${totaal ? Math.round(p.gepland / totaal * 100) : 0}%` : '—'}</span>
      </div>`).join('')}
      <p class="meta mw-hint mw-mt">Je taken met hun geschatte tijd plus de vaste afspraken. Licht = gepland, donker = afgerond.</p>`;
  }

  function vandaagHtml(){
    const vandaag = CRM.todayISO(), mon = huidigeWeek(), rijen = [];
    afsprakenOp(vandaag).forEach(a => rijen.push(`<div class="mw-vd"><span class="num mw-vd-t">${h(a.van)}</span><span><b>${h(a.titel)}</b> <span class="meta">${h(a.txt)}</span></span></div>`));
    const vandaagPosts = groepeer(M.posts.filter(p => p.datum === vandaag && INGEPLAND.includes(p.fase)));
    vandaagPosts.forEach(g => rijen.push(`<div class="mw-vd mw-klik" data-post="${h(g[0].id)}"><span class="mw-vd-t">${g.every(PUB) ? '✓' : 'Post'}</span><span>${g.every(PUB) ? 'Gepost' : 'Vandaag posten'}: <b>${h(g[0].titel || 'Zonder titel')}</b> <span class="meta">${h(groepLabel(g) || g[0].kanaal)}</span></span></div>`));
    if(!vandaagPosts.length) rijen.push(`<div class="mw-vd mw-klik" data-tabnaar="creatie"><span class="mw-vd-t">Post</span><span>Post van vandaag: <b>${h(themaVandaag())}</b> <span class="meta">nog niets ingepland ›</span></span></div>`);
    else rijen.push(`<div class="mw-vd meta"><span class="mw-vd-t"></span><span>Thema van vandaag: ${h(themaVandaag())}</span></div>`);
    filmdagen().forEach(([groep, posts]) => {
      const leeg = posts.filter(scriptLeeg).length;
      if(leeg) rijen.push(`<div class="mw-vd mw-klik" data-tabnaar="creatie"><span class="mw-vd-t">Film</span><span><b>${h(groep.replace(/^🎬\s*/, ''))}</b>: nog ${leeg} ${leeg > 1 ? 'scripts' : 'script'} in te vullen</span></div>`);
    });
    const overDatum = groepeer(M.posts.filter(p => p.fase === 'Ingepland' && p.datum && p.datum < vandaag)).map(g => g[0]);
    overDatum.filter(p => p.datum >= mon).forEach(p => rijen.push(`<div class="mw-vd mw-klik mw-rood" data-post="${h(p.id)}"><span class="mw-vd-t num">${h(kort(p.datum))}</span><span>Over datum: <b>${h(p.titel || 'Zonder titel')}</b>. Publiceren of verzetten.</span></div>`));
    M.posts.filter(p => p.log.startsWith('⚠')).forEach(p => rijen.push(`<div class="mw-vd mw-klik mw-rood" data-post="${h(p.id)}"><span class="mw-vd-t">${h(KAN_AFK[p.kanaal] || p.kanaal)}</span><span>Automatisch publiceren mislukt: <b>${h(p.titel || 'Zonder titel')}</b>. ${h(p.log.replace(/^⚠\s*/, '').slice(0, 90))}</span></div>`));
    const oud = overDatum.filter(p => p.datum < mon).length;
    if(oud) rijen.push(`<div class="mw-vd meta"><span class="mw-vd-t"></span><span>${oud} oudere ${oud > 1 ? 'posts' : 'post'} nooit afgerond. Opruimen kan in Contentplanning.</span></div>`);
    const liggen = M.taken.filter(t => !t.klaar && t.datum < vandaag);
    return `<div class="card mw-blok"><div class="card-h"><b class="mw-ch">Vandaag</b></div><div class="card-b">
      ${rijen.join('')}
      ${liggen.length ? `<div class="mw-sec mw-mt">Blijft liggen van eerder (${liggen.length})</div>
        ${liggen.slice(0, 8).map(t => `<div class="mw-lr">${taakRij(t, false)}<button class="btn ghost sm" data-naarvandaag="${h(t.id)}" type="button">Naar vandaag</button></div>`).join('')}
        ${liggen.length > 1 ? '<button class="btn ghost sm mw-mt" data-allesvandaag type="button">Alles naar vandaag</button>' : ''}` : ''}
    </div></div>`;
  }

  function weekHtml(){
    const mon = M.week, nu = huidigeWeek(), [mnd, thema] = maandVan(mon);
    const dagen = [0, 1, 2, 3, 4, 5, 6].map(i => plus(mon, i)), werkweek = dagen.slice(0, 5);
    const noten = [MOMENTEN[mon], ...werkweek.map(d => FEESTDAGEN[d] ? `${FEESTDAGEN[d]} (${kort(d)})` : '')].filter(Boolean);
    if(mon >= TIKTOK_VAN && mon <= TIKTOK_TOT) noten.push('TikTok-pilot: dezelfde video\'s als Instagram, zonder watermerk');
    if(M.takenFout) return `<div class="note err">De takenlijst kon niet geladen worden${/mkt_taken|relation|exist/i.test(M.takenFout.message || '') ? ': de tabel mkt_taken ontbreekt. Draai migratie-taken.sql in Supabase' : '. Herlaad de pagina'}.</div>`;
    const olKnop = meekijker() || (!olKan() && !M.demo) ? ''
      : olAan() ? `<button class="btn ghost sm" id="mw_olsync" type="button" title="Je eigen taken nu naar je Outlook-agenda sturen">Agenda bijwerken</button><button class="btn sub sm" id="mw_oluit" type="button" title="Taken niet meer naar je agenda sturen">Ontkoppelen</button>`
      : `<button class="btn ghost sm" id="mw_olaan" type="button" title="Zet je eigen taken ook in je Outlook-agenda">Outlook-agenda koppelen</button>`;
    const migraties = [!M.takenV2 && 'migratie-taakgebieden.sql (taakgebied en duur)', !M.takenTijd && 'migratie-taaktijd.sql (vaste tijd en slepen)',
      !M.takenOutlook && 'migratie-taak-outlook.sql (Outlook-agenda)'].filter(Boolean);
    return `
      <div class="mw-kop">
        <button class="btn ghost sm" data-week="-1" aria-label="Vorige week" type="button">‹</button>
        <div class="mw-wk"><b>Week ${weekNr(mon)}</b><span class="meta">${h(bereik(mon, 4))}</span></div>
        <button class="btn ghost sm" data-week="1" aria-label="Volgende week" type="button">›</button>
        ${mon !== nu ? '<button class="btn sm" data-week="0" type="button">Deze week</button>' : ''}
        <span class="meta mw-kophint">Klik op een tijdstip om een taak te plannen, sleep om te verplaatsen</span>
        <span class="row tight mw-ol">${olKnop}</span>
      </div>
      <div class="mw-strip">
        <span class="chip">Pijler: ${h(pijlerVan(mon))}</span>
        <span class="chip">${h(mnd)}: ${h(thema)}</span>
        ${noten.map(n => `<span class="chip amber">${h(n)}</span>`).join('')}
      </div>
      ${migraties.length ? `<div class="note warn mw-mb">Nog niet alles staat in de database. Draai in Supabase: ${migraties.map(h).join(', ')}. Tot die tijd werkt de rest gewoon.</div>` : ''}
      ${mon === nu ? metaTegels() : ''}
      <div class="card mw-blok mw-roosterkaart">${roosterHtml(werkweek)}</div>
      ${dagplanningHtml(dagen)}
      ${notitiesHtml()}
      <div class="mw-grid2">
        ${mon === nu ? vandaagHtml() : ''}
        <div class="card mw-blok"><div class="card-h"><b class="mw-ch">Weekbalans</b></div><div class="card-b">
          ${M.takenV2 ? weekBalansHtml(dagen) : '<div class="note warn">Voor taakgebieden en tijd moet migratie-taakgebieden.sql in Supabase gedraaid worden. Je taken blijven gewoon werken.</div>'}
        </div></div>
      </div>`;
  }

  /* ─── Weergave: Contentplanning ───────────────────────────── */
  const FASES = ['Idee', 'Script klaar', 'Ingepland', 'Gepubliceerd'];
  const FORMATEN = ['Video', 'Foto', 'Carrousel', 'Tekst'];
  const kanaalNamen = () => M.kanalen.length ? M.kanalen : ['LinkedIn', 'Instagram', 'Facebook', 'TikTok', 'Website'];
  const faseKolom = f => f === 'Learnings' ? 'Gepubliceerd' : f;

  function contentHtml(){
    const vandaag = CRM.todayISO();
    if(!M.contentWeek) M.contentWeek = huidigeWeek();
    const mon = M.contentWeek, dagen = [0, 1, 2, 3, 4, 5, 6].map(i => plus(mon, i));
    const overDatum = groepeer(M.posts.filter(p => p.fase === 'Ingepland' && p.datum && p.datum < vandaag)).length;
    const kop = `<div class="mw-kop">
      ${M.contentWeergave === 'week'
        ? `<button class="btn ghost sm" data-cweek="-1" aria-label="Vorige week" type="button">‹</button>
           <div class="mw-wk"><b>Week ${weekNr(mon)}</b><span class="meta">${h(bereik(mon))}</span></div>
           <button class="btn ghost sm" data-cweek="1" aria-label="Volgende week" type="button">›</button>
           ${mon !== huidigeWeek() ? '<button class="btn sm" data-cweek="0" type="button">Deze week</button>' : ''}`
        : `<button class="btn ghost sm" data-cmaand="-1" aria-label="Vorige maand" type="button">‹</button>
           <div class="mw-wk"><b>${h(dt(M.calMaand + '-15').toLocaleDateString('nl-NL', {month:'long', year:'numeric'}))}</b></div>
           <button class="btn ghost sm" data-cmaand="1" aria-label="Volgende maand" type="button">›</button>`}
      <div class="seg"><button class="${M.contentWeergave === 'week' ? 'on' : ''}" data-cweergave="week" type="button">Week</button><button class="${M.contentWeergave === 'maand' ? 'on' : ''}" data-cweergave="maand" type="button">Maand</button></div>
      <span class="meta mw-kophint">Klik op een leeg vak om in te plannen, sleep een post naar een andere dag</span>
      ${overDatum ? `<span class="chip red">${overDatum} over datum</span>` : ''}
    </div>`;
    let raster;
    if(M.contentWeergave === 'maand') raster = maandHtml();
    else {
      const banen = PLATFORMS.map(pl => {
        const weekPosts = M.posts.filter(p => dagen.includes(p.datum) && pl.kanalen.includes(p.kanaal) && INGEPLAND.includes(p.fase));
        const n = groepeer(weekPosts).length;
        return `<div class="mw-baan-kop mw-pl-${pl.k}"><b>${h(pl.n)}</b><span class="meta">${n} ${n === 1 ? 'post' : 'posts'} deze week</span></div>` +
          dagen.map(d => {
            const groepen = groepeer(weekPosts.filter(p => p.datum === d)).sort((a, b) => (a[0].titel || '').localeCompare(b[0].titel || ''));
            return `<div class="mw-cel mw-pl-${pl.k}${d === vandaag ? ' vandaag' : ''}${d < vandaag ? ' voorbij' : ''}" data-cel="${pl.k}|${d}" title="Klik om hier een post in te plannen">
              ${groepen.map(g => {
                const p = g[0], klaar = g.every(PUB), gemist = (g.some(x => x.fase === 'Ingepland') && d < vandaag) || g.some(x => x.log.startsWith('⚠'));
                return `<div class="mw-ppost mw-pl-${pl.k}${klaar ? ' klaar' : ''}${gemist ? ' gemist' : ''}" data-post="${h(p.id)}" title="${h(p.titel)} · ${h(g.map(x => x.kanaal + ': ' + x.fase).join(' · '))}">
                  ${h(p.titel || 'Zonder titel')}
                  ${pl.kanalen.length > 1 ? `<span class="mw-pkan">${pl.kanalen.map(k => { const x = g.find(y => y.kanaal === k); return `<i class="${x ? (x.log.startsWith('⚠') ? 'fout' : PUB(x) ? 'pub' : 'aan') : 'uit'}" title="${k}: ${x ? h(x.fase) + (x.auto ? ', automatisch' : '') + (x.log ? ' · ' + h(x.log) : '') : 'niet ingepland'}">${KAN_AFK[k]}</i>`; }).join('')}${g.some(x => x.auto) ? '<i class="auto" title="Wordt automatisch gepubliceerd">auto</i>' : ''}</span>` : ''}
                </div>`;
              }).join('') || '<span class="mw-pleeg">+</span>'}
            </div>`;
          }).join('');
      }).join('');
      raster = `<div class="card mw-blok mw-pweek"><div class="mw-pgrid">
        <div class="mw-pdow"></div>
        ${dagen.map(d => `<div class="mw-pdow${d === vandaag ? ' vandaag' : ''}"><b>${DAGKORT[dt(d).getDay()]}</b> <span class="num">${h(kort(d))}</span></div>`).join('')}
        ${banen}
      </div></div>`;
    }
    const zonderDag = groepeer(M.posts.filter(p => ['Idee', 'Script klaar'].includes(p.fase))).length;
    return `${kop}${raster}
      ${zonderDag ? `<p class="meta mw-mt"><a class="mw-tekstlink" data-tabnaar="creatie">${zonderDag} ${zonderDag > 1 ? 'ideeën en scripts' : 'idee of script'} nog zonder dag: naar Content Creatie ›</a></p>` : ''}`;
  }

  /* ─── Weergave: Content Creatie (uit Bryans bord) ─────────────
     Thema van vandaag, afkijken bij virale bedrijfscontent, filmdag
     voorbereiden en de voorraad ideeën en scripts. */
  function runwayWeken(){
    const pubs28 = M.posts.filter(p => PUB(p) && (p.datum || '') >= plus(CRM.todayISO(), -28)).length, tempo = pubs28 / 4;
    const voorraad = M.posts.filter(p => ['Idee', 'Script klaar'].includes(p.fase)).length;
    const gepland = M.posts.filter(p => p.fase === 'Ingepland' && (p.datum || '') >= CRM.todayISO()).length;
    return tempo > 0 ? (voorraad + gepland) / tempo : null;
  }
  function creatieHtml(){
    if(!M.afk.length) rolAfkijk();
    const kol = f => groepeer(M.posts.filter(p => p.fase === f)).map(g => g[0]).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const rw = runwayWeken();
    const bord = ['Idee', 'Script klaar'].map(f => {
      const lijst = kol(f);
      return `<div class="mw-kol"><div class="mw-kh"><b>${f === 'Idee' ? 'Ideeën' : 'Script klaar'}</b><span class="meta">${lijst.length}</span></div>
        ${f === 'Idee' && rw !== null && rw < 2 ? '<div class="note warn">Voorraad bijna droog: minder dan twee weken. Pak iets uit Afkijken.</div>' : ''}
        ${lijst.map(kaartHtml).join('') || '<div class="meta mw-leeg">Niets</div>'}</div>`;
    }).join('');
    const fd = filmdagen();
    return `
      <div class="card mw-blok"><div class="card-b mw-thema">
        <div><span class="mw-sec">Thema van vandaag</span><div class="mw-thema-t">${h(themaVandaag())}</div></div>
        <div class="row tight"><button class="btn ghost sm" data-themas type="button">Thema's aanpassen</button><button class="btn sm" data-nieuwpost type="button">+ Nieuwe post</button></div>
      </div></div>
      <div class="card mw-blok"><div class="card-h"><b class="mw-ch">Afkijken: dit gaat nu viraal bij andere bedrijven</b><button class="btn ghost sm" data-afkrol type="button">Andere</button></div>
        <div class="card-b">
          <p class="meta mw-hint">De formule achter bijna elke bedrijfsviral: trend van de week × echte collega's × zelfspot. Gewoon op je telefoon gefilmd is juist goed.</p>
          <div class="mw-afk">${M.afk.map((a, i) => `<div class="mw-afk-k">
            <b>${h(a.t)}</b><span class="meta">${h(a.v)}</span><span>${h(a.i)}</span><span class="mw-hook meta">"${h(a.h)}"</span>
            <button class="btn ghost sm" data-afk="${i}" type="button">Gebruiken ›</button></div>`).join('')}</div>
          <details class="mw-spiek"><summary>Waar spiek je elke week?</summary>
            ${SPIEKLIJST.map(x => `<div><a href="${h(x.u)}" target="_blank" rel="noopener">${h(x.w)}</a> <span class="meta">${h(x.x)}</span></div>`).join('')}</details>
        </div></div>
      <div class="card mw-blok"><div class="card-h"><b class="mw-ch">Filmdag voorbereiden: scripts per functie</b></div>
        <div class="card-b">
          <p class="meta mw-hint">Gaan jullie filmen? Zet per functie meerdere hooks klaar, zodat je op de set niets hoeft te verzinnen. Elke hook wordt een scriptkaart bij Script klaar.</p>
          <div class="row tight mw-fd">
            <input type="text" id="mw_fdfunctie" placeholder="Functie, bijv. Heftruckchauffeur" aria-label="Functie">
            <input type="text" id="mw_fdklant" placeholder="Klant of locatie (optioneel)" aria-label="Klant of locatie">
            <select id="mw_fdn" aria-label="Aantal scripts">${[2, 3, 4, 5, 6].map(n => `<option${n === 4 ? ' selected' : ''}>${n}</option>`).join('')}</select>
            <button class="btn sm" id="mw_fdmaak" type="button">Scripts klaarzetten</button>
          </div>
          ${fd.map(([groep, posts]) => `<div class="mw-fdrij"><span><b>${h(groep.replace(/^🎬\s*/, ''))}</b> <span class="meta">${posts.length} scripts · ${posts.filter(x => !scriptLeeg(x)).length} ingevuld</span></span>
            <button class="btn sub sm" data-fdai="${h(groep)}" type="button">AI-prompt kopiëren</button><button class="btn sub sm" data-fdprint="${h(groep)}" type="button">Setbundel</button></div>`).join('')}
        </div></div>
      <div class="mw-bord">${bord}</div>`;
  }

  /* Weekthema's: zelfde opslag als Bryans bord (config-rij in
     mkt_ad_besluiten, advertentie '__themas__', nieuwste wint). */
  function themas(){
    const c = M.besluiten.find(b => b.advertentie === '__themas__');
    if(c?.note){ try{ const t = JSON.parse(c.note); if(Array.isArray(t) && t.length === 7) return t; }catch(e){} }
    return THEMA_STANDAARD;
  }
  const themaVandaag = () => themas()[new Date().getDay()];
  function themasModal(){
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Weekthema's</div></div>
      <div class="modal-b"><p class="sub" style="margin:0 0 10px">Precies zeven regels: zondag tot en met zaterdag. Geldt voor het hele team.</p>
        <textarea id="mw_themas" rows="9">${h(themas().join('\n'))}</textarea></div>
      <div class="modal-f"><button class="btn ghost" data-mclose type="button">Annuleren</button><button class="btn" id="mw_themaok" type="button">Opslaan</button></div>`, {onOpen(m){
        m.querySelector('#mw_themaok').onclick = async () => {
          const regels = m.querySelector('#mw_themas').value.split('\n').map(r => r.trim()).filter(Boolean);
          if(regels.length !== 7){ CRM.toast('Zorg voor precies 7 regels (zondag t/m zaterdag)', 'err'); return; }
          const rij = {advertentie:'__themas__', campagne:'', besluit:'config', status:'config', door:CRM.me(), note:JSON.stringify(regels)};
          if(!M.demo){
            const {error} = await CRM.sb.from('mkt_ad_besluiten').insert(rij);
            if(error){ CRM.toast('Opslaan lukt niet: ' + error.message, 'err'); return; }
          }
          M.besluiten.unshift({...rij, created_at:new Date().toISOString()});
          CRM.modal.close(); CRM.toast('Weekthema\'s opgeslagen voor het hele team', 'ok'); teken();
        };
      }});
  }

  /* Filmdag: N scriptkaarten met dezelfde campagne. */
  const scriptLeeg = p => !(p.script || '').trim() || p.script === VIDEO_TEMPLATE;
  function filmdagen(){
    const groepen = {};
    M.posts.filter(p => (p.campagne || '').startsWith('🎬')).forEach(p => { (groepen[p.campagne] ??= []).push(p); });
    return Object.entries(groepen).sort((a, b) => b[0].localeCompare(a[0]));
  }
  async function maakFilmdag(){
    const functie = (document.getElementById('mw_fdfunctie')?.value || '').trim(), klant = (document.getElementById('mw_fdklant')?.value || '').trim();
    const n = Math.max(2, Math.min(6, Number(document.getElementById('mw_fdn')?.value) || 4));
    if(!functie){ CRM.toast('Vul in voor welke functie je gaat filmen', 'err'); return; }
    const groep = `🎬 ${functie}${klant ? ` @ ${klant}` : ''} · ${fmtD(CRM.todayISO())}`, nu = new Date().toISOString();
    const rijen = Array.from({length:n}, (_, i) => ({id:'m' + Date.now() + (i + 1) + Math.random().toString(36).slice(2, 5),
      titel:`Hook ${i + 1}: ${functie}${klant ? ` (${klant})` : ''}`, kanaal:'', format:'Video', doel:'Kandidaten werven', fase:'Script klaar',
      campagne:groep, hook:'', script:VIDEO_TEMPLATE, publicatie_datum:null, updated_at:nu}));
    if(!M.demo){
      const {error} = await CRM.sb.from('mkt_posts').insert(rijen);
      if(error){ CRM.toast('Klaarzetten lukt niet: ' + error.message, 'err'); return; }
    }
    rijen.forEach(r => M.posts.push({id:r.id, titel:r.titel, kanaal:'', format:r.format, doel:r.doel, fase:r.fase, campagne:groep, hook:'', script:VIDEO_TEMPLATE,
      datum:'', tijd:'', link:'', learnings:'', media:'', auto:false, log:'', created:nu}));
    CRM.toast(`${n} scriptkaarten klaargezet voor ${functie}`, 'ok'); teken();
  }
  function filmdagPrompt(groep){
    const posts = M.posts.filter(p => p.campagne === groep), functie = groep.replace(/^🎬\s*/, '').split(' · ')[0];
    const prompt = `Schrijf ${posts.length} verschillende korte wervingsvideo-scripts (hooks) voor de functie ${functie} bij Ploeggenoten, recruitmentbureau voor productie/logistiek. Kernzin: "Wij sturen geen leads of kandidaten. Wij bouwen ploegen."

Elke variant moet een ANDERE invalshoek hebben (bijv. salaris-transparantie, dag-uit-het-leven, mythe doorbreken, collega aan het woord, de machine/werkplek zelf).

Regels per script: hook in de eerste 2 seconden mét salaris of concreet getal; totaal max 30 seconden; gewone-mensen-Nederlands (B1); afsluiten met cv-loze CTA ("stuur ons een appje"); geen "tag iemand"-taal.

Structuur per script:
${VIDEO_TEMPLATE}

Lever de ${posts.length} scripts genummerd, klaar om op de set te gebruiken.`;
    navigator.clipboard.writeText(prompt).then(() => CRM.toast('Prompt gekopieerd. Plak hem in Claude en zet de scripts daarna in de kaarten.', 'ok'))
      .catch(() => CRM.toast('Kopiëren lukte niet', 'err'));
  }
  function filmdagBundel(groep){
    const posts = M.posts.filter(p => p.campagne === groep);
    const w = window.open('', '_blank');
    if(!w){ CRM.toast('Pop-up geblokkeerd', 'err'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${h(groep)}</title>
      <style>body{font-family:Inter,system-ui,sans-serif;max-width:700px;margin:24px auto;padding:0 18px;color:#1a1f0a}
      h1{font-size:20px;border-bottom:2px solid #3d6400;padding-bottom:8px}h2{font-size:15px;margin-top:28px}
      pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;border:1px solid #e0e5d2;border-radius:10px;padding:14px}
      button{padding:8px 16px;border:1px solid #d3dabf;border-radius:999px;background:#fff;cursor:pointer}@media print{button{display:none}}</style></head><body>
      <h1>${h(groep)}: scriptbundel</h1><button onclick="print()">Afdrukken of PDF</button>
      ${posts.map(p => `<h2>${h(p.titel)}</h2><pre>${h(scriptLeeg(p) ? 'Script nog leeg' : p.script)}</pre>`).join('')}</body></html>`);
    w.document.close();
  }
  function rolAfkijk(){ M.afk = [...AFKIJKBANK].sort(() => Math.random() - .5).slice(0, 4); }

  /* Kanaalcoach (onderzoek 20 jul 2026): LinkedIn = klanten/B2B (8% van
     blue-collar werkzoekenden), TikTok/Meta = kandidaten. */
  function kanaalCoach(g){
    const p = g[0], kanalen = g.map(x => x.kanaal), doel = String(p.doel || '');
    if(kanalen.includes('LinkedIn') && /kandidat/i.test(doel))
      return 'LinkedIn bereikt maar 8% van blue-collar werkzoekenden. Zet deze post op Facebook, Instagram of TikTok, of maak het doel klanten.';
    if(kanalen.includes('TikTok') && /klant|leadgen/i.test(doel))
      return 'TikTok is een kandidaat-kanaal. Klantcases en B2B horen op LinkedIn.';
    return null;
  }
  function maandHtml(){
    const vandaag = CRM.todayISO();
    if(!M.calMaand) M.calMaand = vandaag.slice(0, 7);
    const eerste = M.calMaand + '-01', start = maandagVan(eerste), maand = Number(M.calMaand.slice(5, 7)) - 1;
    let cellen = '';
    for(let i = 0; i < 42; i++){
      const d = plus(start, i), uit = dt(d).getMonth() !== maand;
      if(i >= 35 && uit && dt(d).getDay() === 1) break;
      const groepen = groepeer(M.posts.filter(p => p.datum === d));
      cellen += `<div class="mw-mcel${uit ? ' uit' : ''}${d === vandaag ? ' vandaag' : ''}" data-mdag="${d}">
        <div class="mw-mdn num">${dt(d).getDate()}</div>
        ${groepen.map(g => `<div class="mw-mpost ${plKlasse(g[0])}${g.every(PUB) ? ' klaar' : ''}${g.some(x => x.fase === 'Ingepland') && d < vandaag ? ' gemist' : ''}" data-post="${h(g[0].id)}" title="${h(g[0].titel)} · ${h(g.map(x => x.kanaal).join(' + '))}">${h(g[0].titel || 'Zonder titel')}${groepLabel(g) ? ` <small>${h(groepLabel(g))}</small>` : ''}</div>`).join('')}
      </div>`;
    }
    return `<div class="card mw-blok mw-maand"><div class="mw-mgrid">${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(x => `<div class="mw-mdow">${x}</div>`).join('')}${cellen}</div></div>`;
  }
  function kaartHtml(p){
    const g = groepVan(p), i = FASES.indexOf(faseKolom(p.fase)), volgende = FASES[i + 1];
    const pl = platformVan(p.kanaal), label = groepLabel(g) || p.kanaal;
    return `<div class="mw-kaart" data-post="${h(p.id)}">
      <b>${h(p.titel || 'Zonder titel')}</b>
      <div class="mw-km">${label ? `<span class="chip ${pl ? (pl.k === 'social' ? 'mw-chip-social' : 'blue') : ''}">${h(label)}</span>` : ''}${p.format ? `<span class="chip">${h(p.format)}</span>` : ''}${kanaalCoach(g) ? `<span class="chip amber" title="${h(kanaalCoach(g))}">Kanaal?</span>` : ''}</div>
      ${kanaalCoach(g) ? `<div class="meta mw-coach">${h(kanaalCoach(g))}</div>` : ''}
      ${p.hook ? `<div class="meta mw-hook">${h(p.hook.length > 90 ? p.hook.slice(0, 90) + '…' : p.hook)}</div>` : ''}
      ${volgende ? `<button class="btn ghost sm" data-next="${h(p.id)}" type="button">${volgende === 'Ingepland' ? 'Inplannen' : 'Naar ' + h(volgende)} ›</button>` : ''}</div>`;
  }

  /* Opslaan van een post of een groep (IG·FB·TikTok samen). Alleen de
     velden van dit formulier gaan mee; resultaten en publiceer_log blijven
     onaangeroerd (die schrijft de publisher-Edge Function). Automatisch
     publiceren geldt alleen voor Facebook en Instagram; TikTok en LinkedIn
     blijven met de hand. */
  const VELDEN = ['titel', 'format', 'doel', 'fase', 'hook', 'script', 'datum', 'tijd', 'link', 'learnings', 'media', 'auto'];
  const FBIG = k => ['Facebook', 'Instagram'].includes(k);
  const opslagFout = error => CRM.toast('Opslaan lukt niet: ' + (/media_url|auto_publish|publicatie_tijd/.test(error.message || '')
    ? 'de kolommen voor automatisch publiceren ontbreken, draai migratie-publiceren.sql' : error.message), 'err');
  async function bewaarPost(p, invoer, platform){
    const nu = new Date().toISOString(), velden = {};
    VELDEN.forEach(k => { velden[k] = invoer[k] ?? (k === 'auto' ? false : ''); });
    const basis = {titel:velden.titel, format:velden.format, doel:velden.doel, hook:velden.hook, script:velden.script,
      publicatie_datum:velden.datum || null, publicatie_tijd:velden.tijd || '', learnings:velden.learnings, media_url:velden.media || '', updated_at:nu};
    if(p){
      const groep = groepVan(p), los = groep.length === 1;
      const plan = groep.map(x => {
        const kan = los && platform && platform !== 'social' ? platform : x.kanaal;
        const auto = !!velden.auto && FBIG(kan);
        /* Wat de publisher al live heeft gezet, zakt niet terug naar een eerdere fase. */
        const fase = x.auto && PUB(x) && !PUB(velden) ? x.fase : velden.fase;
        const rij = {...basis, fase, auto_publish:auto, ...(los ? {link:velden.link} : {}), ...(kan !== x.kanaal ? {kanaal:kan} : {})};
        return {x, kan, auto, fase, rij};
      });
      if(!M.demo) for(const r of plan){
        const {error} = await CRM.sb.from('mkt_posts').update(r.rij).eq('id', r.x.id);
        if(error){ opslagFout(error); return false; }
      }
      plan.forEach(r => Object.assign(r.x, velden, {kanaal:r.kan, auto:r.auto, fase:r.fase, link:los ? velden.link : r.x.link}));
      return true;
    }
    const id = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
    const kanalen = platform === 'social' ? PLATFORMS[0].kanalen : [platform || ''];
    const nieuw = kanalen.map(k => ({id:kanalen.length > 1 ? `${id}-${KAN_SUFFIX[k]}` : id, kanaal:k, ...basis, fase:velden.fase,
      link:velden.link, auto_publish:!!velden.auto && FBIG(k)}));
    if(!M.demo){
      const {error} = await CRM.sb.from('mkt_posts').insert(nieuw);
      if(error){ opslagFout(error); return false; }
    }
    nieuw.forEach(r => M.posts.push({...velden, id:r.id, kanaal:r.kanaal, auto:r.auto_publish, log:'', created:nu}));
    return true;
  }
  async function wisPost(p){
    const groep = groepVan(p);
    const tekst = groep.length > 1 ? `Hij verdwijnt van ${groep.map(x => x.kanaal).join(', ')} tegelijk. Dat kan niet ongedaan worden gemaakt.` : 'Dat kan niet ongedaan worden gemaakt.';
    if(!await CRM.bevestig('Deze post verwijderen?', tekst, {gevaarlijk:true})) return false;
    if(!M.demo){
      const {error} = await CRM.sb.from('mkt_posts').delete().in('id', groep.map(x => x.id));
      if(error){ CRM.toast('Verwijderen lukt niet: ' + error.message, 'err'); return false; }
    }
    M.posts = M.posts.filter(x => !groep.includes(x));
    return true;
  }
  async function verplaatsPost(id, datum){
    const p = M.posts.find(x => x.id === id); if(!p || !datum || p.datum === datum) return;
    const groep = groepVan(p);
    if(!M.demo){
      const {error} = await CRM.sb.from('mkt_posts').update({publicatie_datum:datum, updated_at:new Date().toISOString()}).in('id', groep.map(x => x.id));
      if(error){ CRM.toast('Verplaatsen lukt niet: ' + error.message, 'err'); teken(); return; }
    }
    groep.forEach(x => { x.datum = datum; });
    CRM.toast(`${p.titel || 'Post'} → ${dagLabel(datum)}`, 'ok');
    teken();
  }
  function postModal(p, voor = {}){
    const groep = p ? groepVan(p) : [];
    const isGroep = groep.length > 1;
    const v = p || {titel:voor.titel || '', kanaal:'', format:'', doel:'', fase:voor.fase || 'Idee', hook:voor.hook || '', script:voor.script || '', datum:voor.datum || '', link:'', learnings:''};
    const opt = (lijst, nu, leeg) => (leeg ? `<option value="">${h(leeg)}</option>` : '') + lijst.map(x => `<option${x === nu ? ' selected' : ''}>${h(x)}</option>`).join('');
    const huidigPlatform = isGroep ? 'social' : p ? p.kanaal : (voor.platform === 'linkedin' ? 'LinkedIn' : voor.platform || '');
    const overig = kanaalNamen().filter(k => !platformVan(k));
    if(p && !isGroep && p.kanaal && !overig.includes(p.kanaal) && p.kanaal !== 'LinkedIn') overig.unshift(p.kanaal);
    const platOpt = [['social', 'Instagram · Facebook · TikTok'], ['LinkedIn', 'LinkedIn'], ...overig.map(k => [k, k])]
      .filter(([w]) => !(p && !isGroep && w === 'social'))
      .map(([w, l]) => `<option value="${h(w)}"${w === huidigPlatform ? ' selected' : ''}>${h(l)}</option>`).join('');
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">${p ? 'Post bewerken' : 'Nieuwe post'}</div></div>
      <div class="modal-b">
        <div class="f-row"><label for="mw_titel">Titel</label><input type="text" id="mw_titel" value="${h(v.titel)}" placeholder="Waar gaat het over?"></div>
        <div class="f-grid">
          <div class="f-row"><label for="mw_platform">Platform</label><select id="mw_platform"${isGroep ? ' disabled' : ''}>${p ? '' : '<option value="">Kies een platform</option>'}${platOpt}</select>
            ${isGroep ? '<span class="hint">Eén post op drie kanalen: alles gaat samen mee.</span>' : ''}</div>
          <div class="f-row"><label for="mw_format">Vorm</label><select id="mw_format">${opt(FORMATEN, v.format, 'Kies een vorm')}</select></div>
          <div class="f-row"><label for="mw_fase">Fase</label><select id="mw_fase">${opt(FASES.concat(['Learnings']), v.fase)}</select></div>
          <div class="f-row"><label for="mw_datum">Plaatsdatum</label><input type="date" id="mw_datum" value="${h(v.datum)}"><span class="hint">Per dag. Zonder media blijft het een tekstplan.</span></div>
        </div>
        <div class="f-row"><label for="mw_doel">Wat moeten ze doen of denken?</label><input type="text" id="mw_doel" value="${h(v.doel)}"></div>
        <div class="f-row"><label for="mw_hook">De eerste zin (de haak)</label><input type="text" id="mw_hook" value="${h(v.hook)}"></div>
        <div class="f-row"><label for="mw_script">Script of tekst</label><textarea id="mw_script" rows="6">${h(v.script)}</textarea></div>
        <div class="mw-media">
          <div class="mw-sec">Media en automatisch publiceren</div>
          <div class="row tight mw-mb8"><label class="btn ghost sm" for="mw_mediafile">Foto of video kiezen</label>
            <input type="file" id="mw_mediafile" accept="image/*,video/mp4,video/quicktime" hidden>
            <span id="mw_mediaout" class="meta"></span></div>
          <label class="check"><input type="checkbox" id="mw_auto"${v.auto || groep.some(x => x.auto) ? ' checked' : ''}><span>Automatisch publiceren op de plaatsdatum <span class="meta">(alleen Facebook en Instagram)</span></span></label>
          <div class="f-row mw-tijdrij" id="mw_tijdrij"><label for="mw_tijd">Tijd</label><input type="time" id="mw_tijd" value="${h(String(v.tijd || '').slice(0, 5))}">
            <span class="hint">De tekst bij Script of tekst wordt het bijschrift. Zonder tijd gaat hij live zodra de dag begint. TikTok post je zelf.</span></div>
          ${groep.filter(x => x.log).map(x => `<div class="mw-log${x.log.startsWith('⚠') ? ' fout' : ''}"><b>${h(x.kanaal)}</b> ${h(x.log)}</div>`).join('')}
        </div>
        ${isGroep ? '' : `<div class="f-row"><label for="mw_link">Link naar de post</label><input type="text" id="mw_link" value="${h(v.link)}" placeholder="Pas invullen als hij live staat"></div>`}
        <div class="f-row"><label for="mw_learn">Wat leerden we ervan?</label><textarea id="mw_learn" rows="3">${h(v.learnings)}</textarea></div>
      </div>
      <div class="modal-f">
        ${p ? '<button class="btn ghost mw-wisknop" id="mw_wis" type="button">Verwijderen</button>' : ''}
        <button class="btn ghost" data-mclose type="button">Annuleren</button>
        <button class="btn" id="mw_opslaan" type="button">Opslaan</button>
      </div>`, {onOpen(m){
        const val = id => (m.querySelector('#' + id)?.value || '').trim();
        let media = v.media || '';
        const mediaUit = m.querySelector('#mw_mediaout'), autoIn = m.querySelector('#mw_auto'), tijdRij = m.querySelector('#mw_tijdrij');
        const toonMedia = () => {
          const naam = media.startsWith('demo:') ? media.slice(5) + ' (demo, niet geüpload)' : decodeURIComponent(media.split('/').pop() || '').replace(/^\d+_/, '');
          mediaUit.innerHTML = !media ? 'Geen media: tekstplan' : `${media.startsWith('demo:') ? h(naam) : `<a href="${h(media)}" target="_blank" rel="noopener">${h(naam)}</a>`} <button class="btn sub sm" id="mw_mediaweg" type="button">Weghalen</button>`;
          const weg = m.querySelector('#mw_mediaweg'); if(weg) weg.onclick = () => { media = ''; toonMedia(); };
        };
        toonMedia();
        const toonTijd = () => { tijdRij.style.display = autoIn.checked ? '' : 'none'; };
        autoIn.onchange = toonTijd; toonTijd();
        m.querySelector('#mw_mediafile').onchange = async e => {
          const file = e.target.files?.[0]; if(!file) return;
          if(file.size > 300 * 1024 * 1024){ CRM.toast('Bestand te groot (max ongeveer 300 MB)', 'err'); return; }
          if(CRM.demo){ media = 'demo:' + file.name; toonMedia(); CRM.toast('Demo: het bestand is niet geüpload'); return; }
          mediaUit.textContent = 'Uploaden…';
          const pad = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const {error} = await CRM.sb.storage.from('media').upload(pad, file, {upsert:false});
          if(error){ toonMedia(); CRM.toast('Upload mislukt: ' + error.message, 'err'); return; }
          media = CRM.sb.storage.from('media').getPublicUrl(pad).data.publicUrl;
          toonMedia(); CRM.toast('Media geüpload', 'ok');
          const fmt = m.querySelector('#mw_format');
          if(!fmt.value) fmt.value = /\.(mp4|mov|m4v|webm)$/i.test(file.name) ? 'Video' : 'Foto';
        };
        m.querySelector('#mw_opslaan').onclick = async () => {
          const velden = {titel:val('mw_titel'), format:val('mw_format'), doel:val('mw_doel'), fase:val('mw_fase'), hook:val('mw_hook'),
            script:m.querySelector('#mw_script').value, datum:val('mw_datum'), link:isGroep ? '' : val('mw_link'), learnings:m.querySelector('#mw_learn').value,
            media, auto:autoIn.checked, tijd:autoIn.checked ? val('mw_tijd') : (v.tijd || '')};
          const platform = isGroep ? 'social' : val('mw_platform');
          if(!velden.titel){ CRM.toast('Geef de post een titel', 'err'); return; }
          if(!p && !platform){ CRM.toast('Kies een platform', 'err'); return; }
          if(INGEPLAND.includes(velden.fase) && !velden.datum){ CRM.toast('Een ingeplande post heeft een plaatsdatum nodig', 'err'); return; }
          if(velden.auto){
            const kanalen = platform === 'social' ? PLATFORMS[0].kanalen : [platform];
            if(!kanalen.some(FBIG)){ CRM.toast('Automatisch publiceren kan alleen op Facebook of Instagram', 'err'); return; }
            if(!velden.datum){ CRM.toast('Automatisch publiceren vergt een plaatsdatum', 'err'); return; }
            if(kanalen.includes('Instagram') && !media){ CRM.toast('Instagram vereist een foto of video: kies eerst media', 'err'); return; }
            if(!velden.script.trim() && !media){ CRM.toast('Niets om te publiceren: vul een tekst in of kies media', 'err'); return; }
            if(velden.fase !== 'Ingepland' && !PUB(velden)){ CRM.toast('Zet de fase op Ingepland, anders publiceert hij niet', 'err'); return; }
          }
          if(!await bewaarPost(p, velden, platform)) return;
          CRM.modal.close(); CRM.toast(p ? 'Opgeslagen' : velden.datum ? `Ingepland op ${dagLabel(velden.datum)}` : 'Bewaard', 'ok'); teken();
        };
        const wis = m.querySelector('#mw_wis');
        if(wis) wis.onclick = async () => { if(await wisPost(p)) teken(); else postModal(p); };
        CRM.dictee?.hang(m.querySelector('#mw_script'));
        m.querySelector('#mw_titel').focus();
      }});
  }
  async function naarVolgende(p){
    const i = FASES.indexOf(faseKolom(p.fase)), volgende = FASES[i + 1]; if(!volgende) return;
    if(volgende === 'Ingepland' && !p.datum){ postModal(p); setTimeout(() => { const f = document.getElementById('mw_fase'); if(f) f.value = 'Ingepland'; document.getElementById('mw_datum')?.focus(); }, 80); return; }
    const isGroep = groepVan(p).length > 1;
    if(await bewaarPost(p, {...p, fase:volgende}, isGroep ? 'social' : p.kanaal)) teken();
  }

  /* ─── Weergave: Komende weken en Jaarplan ─────────────────── */
  function wekenHtml(){
    const nu = huidigeWeek(), start = maandagVan(PLANNER.startdatum), rijen = [];
    for(let i = -3; i <= 8; i++){
      const mon = plus(nu, i * 7); if(mon < start) continue;
      const c = weekCijfers(mon), [mnd] = maandVan(mon), verleden = mon < nu, dezeWeek = mon === nu;
      let kleur = 'grijs', tekst = 'Nog niet begonnen';
      if(verleden && !(c.ingepland + c.taken)){ tekst = 'Niet bijgehouden'; }
      else if(verleden){
        kleur = c.pct >= 0.8 ? 'groen' : c.pct >= 0.5 ? 'amber' : 'rood';
        tekst = kleur === 'groen' ? 'Afgerond' : kleur === 'amber' ? 'Deels afgerond' : 'Bleef liggen';
      } else if(dezeWeek){ kleur = 'amber'; tekst = 'Loopt'; }
      else if(i <= 1){
        kleur = c.ingepland < c.slots ? 'amber' : 'groen';
        tekst = c.ingepland < c.slots ? 'Posts nog niet ingepland' : 'Klaar voor de week';
      }
      const overUren = c.minuten > PLANNER.weekUren * 60;
      rijen.push(`<tr class="${dezeWeek ? 'nu' : ''}" data-open="${h(mon)}">
        <td><b>Week ${weekNr(mon)}</b><span class="meta">${h(bereik(mon))}</span></td>
        <td>${h(pijlerVan(mon).split(':')[0])}<span class="meta"> ${h(mnd)}</span></td>
        <td class="num">${c.ingepland}/${c.slots}</td>
        <td class="num">${c.taken ? `${c.takenKlaar}/${c.taken}` : '0'}</td>
        <td class="num${overUren ? ' neg' : ''}">${fmtUren(c.minuten)} / ${PLANNER.weekUren}</td>
        <td><span class="mw-dot ${kleur}"></span>${h(tekst)}</td>
        <td class="meta">${h(MOMENTEN[mon] || '')}</td></tr>`);
    }
    return `<div class="card"><div class="tabelwrap"><table class="mw-tab">
      <thead><tr><th>Week</th><th>Pijler</th><th class="num">Posts ingepland</th><th class="num">Taken klaar</th><th class="num">Uren gepland</th><th>Stand</th><th>Moment</th></tr></thead>
      <tbody>${rijen.join('')}</tbody></table></div></div>
      <p class="meta mw-mt">Klik op een week om hem te openen. Posts tellen als ingepland zodra de fase Ingepland, Gepubliceerd of Learnings is. Weken vóór ${h(kort(PLANNER.startdatum))} staan er niet in (schone lei).</p>`;
  }
  function jaarHtml(){
    const nu = new Date().getMonth();
    const per = MAANDEN.map((m, i) => {
      const momenten = Object.entries(MOMENTEN).filter(([k]) => dt(plus(k, 3)).getMonth() === i && k.startsWith('2027')).map(([k, v]) => `${kort(k)}: ${v}`);
      return `<tr class="${i === nu ? 'nu' : ''}"><td><b>${h(m[0])}</b></td><td>${h(m[1])}</td><td class="meta">${momenten.map(h).join('<br>') || '—'}</td></tr>`;
    }).join('');
    return `<div class="card"><div class="tabelwrap"><table class="mw-tab"><thead><tr><th>Maand</th><th>Thema</th><th>Vaste momenten (2027)</th></tr></thead><tbody>${per}</tbody></table></div></div>
      <p class="meta mw-mt">Het seizoenspatroon is een aanname uit onze ervaring. Pas het aan waar het niet klopt.</p>`;
  }

  /* ─── Tekenen ─────────────────────────────────────────────── */
  function sluitPops(){ document.querySelectorAll('.mw-pop').forEach(x => x.remove()); }
  function teken(){
    const mount = M.mount;
    if(!mount || CRM.view !== 'marketingweek') return;
    sluitPops();
    /* Wie aan het typen is houdt zijn cursor na het hertekenen. */
    const act = document.activeElement, fok = M.focus || (act && mount.contains(act) ? act.dataset?.fokus : null);
    const sel = !M.focus && fok && act && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null;
    M.focus = null;
    const TABS = [{k:'week', t:'Week'}, {k:'content', t:'Contentplanning'}, {k:'creatie', t:'Content Creatie'}, {k:'weken', t:'Komende weken'}, {k:'jaar', t:'Jaarplan'}];
    const body = M.tab === 'weken' ? wekenHtml() : M.tab === 'jaar' ? jaarHtml() : M.tab === 'content' ? contentHtml() : M.tab === 'creatie' ? creatieHtml() : weekHtml();
    mount.innerHTML = `
      ${meekijker() ? `<div class="note info mw-mb">Je kijkt mee in de week van ${h(weekVan())}: je ziet precies wat ${h(weekVan())} ziet. Zijn notities zijn alleen-lezen; een taak die jij toevoegt staat op jouw naam.</div>` : ''}
      ${M.demo ? '<div class="note info mw-mb">Demo-data: wat je hier ziet is verzonnen en wordt nergens opgeslagen.</div>' : ''}
      ${M.postsFout ? '<div class="note err mw-mb">De posts konden niet geladen worden. Herlaad de pagina.</div>' : ''}
      <div class="tabs">${TABS.map(t => `<button class="tab ${M.tab === t.k ? 'on' : ''}" data-tab="${t.k}" type="button">${h(t.t)}</button>`).join('')}</div>
      <div class="mw">${body}</div>`;
    if(M.actiesEl) M.actiesEl.innerHTML = `<button class="btn" data-nieuwpost type="button">+ Nieuwe post</button>`;
    CRM.$$('[data-nieuwpost]', document).forEach(b => b.onclick = () => postModal(null));
    bind(mount);
    if(fok){
      const el = mount.querySelector(`[data-fokus="${fok}"]`);
      if(el){ el.focus({preventScroll:true}); if(sel) try{ el.setSelectionRange(...sel); }catch(e){} }
    }
  }

  /* ─── Venstertjes in het rooster ─────────────────────────── */
  function plaatsVenster(vak, x, y){
    sluitPops();
    vak.classList.add('mw-pop');
    document.body.appendChild(vak);
    const r = vak.getBoundingClientRect(), m = 8;
    vak.style.left = Math.max(m, Math.min(x, innerWidth - r.width - m)) + 'px';
    vak.style.top  = Math.max(m, Math.min(y, innerHeight - r.height - m)) + 'px';
    vak.onclick = e => e.stopPropagation();
    vak.onpointerdown = e => e.stopPropagation();
    const weg = () => { vak.remove(); document.removeEventListener('pointerdown', buiten, true); removeEventListener('scroll', scrol, true); };
    const buiten = e => { if(!vak.contains(e.target)) weg(); };
    const scrol = e => { if(!vak.contains(e.target)) weg(); };
    setTimeout(() => { document.addEventListener('pointerdown', buiten, true); addEventListener('scroll', scrol, true); }, 50);
    vak.addEventListener('keydown', e => { if(e.key === 'Escape') weg(); });
    return weg;
  }
  function openNieuweTaak(kol, min){
    const datum = kol.dataset.trdag, tijd = tStr(min);
    let gb = M.dsGebied;
    const vak = document.createElement('div');
    vak.className = 'mw-nieuwvak';
    vak.innerHTML = `<div class="mw-pop-kop">${h(dagLabel(datum))} · <span class="num">${tijd}</span></div>
      <div class="mw-ds-veld"><input type="text" class="mw-pop-tekst" placeholder="Wat ga je doen?" aria-label="Taak"></div>
      ${M.takenV2 ? `<div class="mw-gkeuze">${GEBIEDEN.map(g => `<button class="mw-gk${g.k === gb ? ' on' : ''}" data-ng="${g.k}" style="--gc:${g.c}" type="button">${h(g.kort)}</button>`).join('')}</div>` : ''}
      <div class="row tight">
        ${M.takenV2 ? `<select class="mw-pop-duur" aria-label="Duur">${DUREN.map(m => `<option value="${m}"${m === PLANNER.standaardDuur ? ' selected' : ''}>${fmtDuur(m)}</option>`).join('')}</select>` : ''}
        <button class="btn sm mw-pop-ok" type="button">Inplannen</button>
        <button class="btn sub sm mw-pop-weg" type="button" title="Annuleren (Esc)">Annuleren</button>
      </div>
      ${!M.takenTijd && !M.demo ? '<div class="meta">Zonder migratie-taaktijd.sql komt de taak niet vast op dit tijdstip.</div>' : ''}`;
    const kr = kol.getBoundingClientRect();
    const weg = plaatsVenster(vak, kr.left + 2, kr.top + (min - PLANNER.rooster[0] * 60) / 60 * PLANNER.uurPx);
    const inp = vak.querySelector('.mw-pop-tekst');
    const mic = CRM.dictee?.knop(inp); if(mic) inp.insertAdjacentElement('afterend', mic);
    vak.querySelectorAll('[data-ng]').forEach(b => b.onclick = () => { gb = b.dataset.ng; vak.querySelectorAll('[data-ng]').forEach(x => x.classList.toggle('on', x === b)); inp.focus(); });
    const opslaan = async () => {
      const tekst = inp.value.trim(); if(!tekst){ inp.focus(); return; }
      const duur = Number(vak.querySelector('.mw-pop-duur')?.value) || PLANNER.standaardDuur;
      M.dsGebied = gb; weg();
      await addTaken([`${tekst} om ${tijd}`], datum, gb, duur);
    };
    vak.querySelector('.mw-pop-ok').onclick = opslaan;
    vak.querySelector('.mw-pop-weg').onclick = weg;
    inp.onkeydown = e => { if(e.key === 'Enter') opslaan(); };
    inp.focus({preventScroll:true});
  }
  function toonTaakDetail(blok, t){
    const P = PLANNER, g = gebied(t.gebied), b = blokVan(t), naar = volgendeWerkdag(t.datum);
    const vak = document.createElement('div');
    vak.className = 'mw-detail';
    vak.style.setProperty('--gc', g.c);
    const tijden = Array.from({length:(P.rooster[1] - P.rooster[0]) * 4}, (_, i) => tStr(P.rooster[0] * 60 + i * 15));
    vak.innerHTML = `<div class="mw-pop-kop"><span>${h(dagLabel(t.datum))}${b ? ` · <span class="num">${tStr(b.van)}–${tStr(b.tot)}</span>` : ''}${t.tijd ? ' · vaste tijd' : ''}${t.door && !vanMij(t) ? ' · van ' + h(t.door) : ''}</span>
        <button class="mw-x" data-dx="sluit" title="Sluiten (Esc)" type="button">×</button></div>
      <textarea class="mw-pop-tekst" rows="3" aria-label="Taak">${h(t.tekst)}</textarea>
      ${M.takenV2 || M.demo ? `<div class="mw-detail-info">
        <label>Duur<select data-dx="duur">${DUREN.map(m => `<option value="${m}"${m === duurVan(t) ? ' selected' : ''}>${fmtDuur(m)}</option>`).join('')}${DUREN.includes(duurVan(t)) ? '' : `<option selected value="${duurVan(t)}">${fmtDuur(duurVan(t))}</option>`}</select></label>
        <label>Tijd<select data-dx="tijd"><option value=""${t.tijd ? '' : ' selected'}>automatisch${b && !t.tijd ? ' (' + tStr(b.van) + ')' : ''}</option>${tijden.map(x => `<option value="${x}"${x === t.tijd ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Gebied<select data-dx="gebied">${GEBIEDEN.map(x => `<option value="${x.k}"${x.k === g.k ? ' selected' : ''}>${h(x.n)}</option>`).join('')}</select></label>
      </div>` : '<div class="meta">Duur, tijd en gebied kunnen pas na de migraties in Supabase.</div>'}
      <div class="row tight">
        <button class="btn sm" data-dx="opslaan" type="button">Opslaan</button>
        <button class="btn ghost sm" data-dx="klaar" type="button">${t.klaar ? 'Niet afgerond' : 'Afvinken'}</button>
        ${t.klaar ? '' : `<button class="btn ghost sm" data-dx="door" type="button">→ ${DAGKORT[dt(naar).getDay()]}</button>`}
        <button class="btn sub sm mw-wisknop" data-dx="weg" type="button">Verwijderen</button>
      </div>
      ${b ? `<button class="btn sub sm" data-dx="erbij" type="button">+ Nog een taak om ${tStr(b.van)}</button>` : ''}`;
    const br = blok.getBoundingClientRect();
    const weg = plaatsVenster(vak, br.left, br.top);
    const ta = vak.querySelector('textarea');
    ta.style.height = Math.min(220, ta.scrollHeight + 4) + 'px';
    const knop = s => vak.querySelector(`[data-dx="${s}"]`);
    knop('sluit').onclick = weg;
    knop('opslaan').onclick = async () => { const tekst = ta.value.trim(); weg(); if(tekst && tekst !== t.tekst) await updTaak(t, {tekst}); };
    knop('duur')?.addEventListener('change', e => { weg(); updTaak(t, {duur_min:Number(e.target.value)}); });
    knop('tijd')?.addEventListener('change', e => { weg(); updTaak(t, {tijd:e.target.value}); });
    knop('gebied')?.addEventListener('change', e => { weg(); updTaak(t, {gebied:e.target.value}); });
    knop('klaar').onclick = () => { weg(); toggleTaak(t, !t.klaar); };
    knop('door')?.addEventListener('click', () => { weg(); schuifDoor([t], naar); });
    knop('weg').onclick = () => { weg(); wisTaak(t); };
    knop('erbij')?.addEventListener('click', async () => {
      weg();
      if(!M.demo && !M.takenTijd){ CRM.toast(migratieMelding({tijd:''}), 'err'); return; }
      /* Stond deze taak nog niet vast, zet hem dan vast op zijn huidige tijd:
         anders duwt de nieuwe hem weg. */
      if(!t.tijd && !await updTaak(t, {tijd:tStr(b.van)})) return;
      const k = M.mount.querySelector(`.mw-tr-dag[data-trdag="${t.datum}"]`);
      if(k) openNieuweTaak(k, b.van);
    });
  }
  function kiesUitLijst(knop, opties, huidig, kies){
    const sel = document.createElement('select');
    sel.className = 'mw-kieslijst';
    sel.innerHTML = opties.map(([w, l]) => `<option value="${h(w)}"${String(w) === String(huidig) ? ' selected' : ''}>${h(l)}</option>`).join('');
    knop.replaceWith(sel); sel.focus();
    try{ sel.showPicker?.(); }catch(e){}
    sel.onclick = e => e.stopPropagation();
    sel.onchange = () => { const w = sel.value; kies(typeof opties[0][0] === 'number' ? Number(w) : w); };
    sel.onblur = () => setTimeout(() => { if(sel.isConnected) teken(); }, 150);
  }

  /* ─── Slepen ─────────────────────────────────────────────── */
  let _sleepEind = 0;
  function sleepTaken(root){
    const P = PLANNER;
    CRM.$$('.mw-tr-taak[data-tid]', root).forEach(blok => {
      blok.onpointerdown = e => {
        if(e.button !== 0 || e.target.matches('input')) return;
        const t = M.taken.find(x => String(x.id) === blok.dataset.tid); if(!t) return;
        const start = {x:e.clientX, y:e.clientY, grabY:e.clientY - blok.getBoundingClientRect().top};
        let gesleept = false, doel = null;
        const label = blok.querySelector('b');
        const beweeg = ev => {
          if(!gesleept && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
          if(!gesleept){ gesleept = true; blok.classList.add('sleept'); }
          const kol = document.elementsFromPoint(ev.clientX, ev.clientY).map(x => x.closest?.('.mw-tr-dag')).find(Boolean);
          if(!kol) return;
          if(blok.parentElement !== kol){ kol.appendChild(blok); blok.style.left = '2px'; blok.style.width = 'calc(100% - 4px)'; }
          const y = ev.clientY - kol.getBoundingClientRect().top - start.grabY;
          let min = Math.round((P.rooster[0] * 60 + y / P.uurPx * 60) / P.stap) * P.stap;
          min = Math.max(P.rooster[0] * 60, Math.min(P.rooster[1] * 60 - Math.min(duurVan(t), 60), min));
          blok.style.top = ((min - P.rooster[0] * 60) / 60 * P.uurPx) + 'px';
          if(label) label.textContent = tStr(min);
          doel = {datum:kol.dataset.trdag, tijd:tStr(min)};
        };
        const los = async () => {
          document.removeEventListener('pointermove', beweeg);
          document.removeEventListener('pointerup', los);
          if(!gesleept){ toonTaakDetail(blok, t); return; }
          _sleepEind = Date.now();
          blok.classList.remove('sleept');
          if(!doel){ teken(); return; }
          if(!M.demo && !M.takenTijd){ CRM.toast('Verslepen naar een tijd werkt pas na migratie-taaktijd.sql in Supabase', 'err'); teken(); return; }
          if(doel.datum === t.datum && doel.tijd === t.tijd){ teken(); return; }
          if(await updTaak(t, {datum:doel.datum, tijd:doel.tijd})) CRM.toast(`${t.tekst} → ${dagLabel(doel.datum)} ${doel.tijd}`, 'ok');
        };
        document.addEventListener('pointermove', beweeg);
        document.addEventListener('pointerup', los);
        e.preventDefault();
      };
    });
  }
  /* Een gekoppelde IG/FB/TikTok-post verhuist als geheel. In de weekbanen
     blijft een post in zijn eigen baan. */
  function sleepPosts(root, itemSel, doelSel, datumVan, magNaar){
    CRM.$$(itemSel, root).forEach(item => {
      item.onpointerdown = e => {
        if(e.button !== 0) return;
        const start = {x:e.clientX, y:e.clientY};
        let spook = null, doel = null;
        const beweeg = ev => {
          if(!spook && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
          if(!spook){
            const r = item.getBoundingClientRect();
            spook = item.cloneNode(true); spook.classList.add('mw-spook');
            Object.assign(spook.style, {width:r.width + 'px', left:r.left + 'px', top:r.top + 'px'});
            document.body.appendChild(spook); item.classList.add('mw-weg');
          }
          spook.style.left = (ev.clientX - 20) + 'px'; spook.style.top = (ev.clientY - 12) + 'px';
          const cel = document.elementsFromPoint(ev.clientX, ev.clientY).map(x => x.closest?.(doelSel)).find(Boolean);
          CRM.$$('.mw-drop', root).forEach(x => x.classList.remove('mw-drop'));
          doel = cel && magNaar(item, cel) ? cel : null;
          doel?.classList.add('mw-drop');
        };
        const los = () => {
          document.removeEventListener('pointermove', beweeg); document.removeEventListener('pointerup', los);
          if(!spook) return;
          _sleepEind = Date.now();
          spook.remove(); item.classList.remove('mw-weg');
          CRM.$$('.mw-drop', root).forEach(x => x.classList.remove('mw-drop'));
          if(doel) verplaatsPost(item.dataset.post, datumVan(doel));
        };
        document.addEventListener('pointermove', beweeg); document.addEventListener('pointerup', los);
        e.preventDefault();
      };
    });
  }

  /* ─── Bedienen ───────────────────────────────────────────── */
  const zoekTaak = id => M.taken.find(x => String(x.id) === String(id));
  const naarBlok = id => setTimeout(() => document.getElementById(id)?.scrollIntoView({behavior:'smooth', block:'start'}), 30);

  function bind(mount){
    const P = PLANNER, alleen = (sel, fn) => CRM.$$(sel, mount).forEach(fn);
    alleen('[data-tab]', b => b.onclick = () => { M.tab = b.dataset.tab; teken(); });
    alleen('[data-week]:not(input)', b => b.onclick = () => {
      const n = +b.dataset.week; M.week = n === 0 ? huidigeWeek() : plus(M.week, n * 7); teken();
    });
    alleen('[data-open]', r => r.onclick = () => { M.week = r.dataset.open; M.tab = 'week'; teken(); });
    alleen('[data-ga]', a => a.onclick = () => CRM.ga(a.dataset.ga));
    alleen('[data-tabnaar]', a => a.onclick = () => { M.tab = a.dataset.tabnaar; teken(); });
    alleen('[data-post]', k => k.onclick = e => {
      e.stopPropagation(); if(Date.now() - _sleepEind < 400) return;
      const p = M.posts.find(x => x.id === k.dataset.post); if(p) postModal(p);
    });
    alleen('[data-themas]', b => b.onclick = themasModal);
    alleen('[data-afkrol]', b => b.onclick = () => { rolAfkijk(); teken(); });
    alleen('[data-afk]', b => b.onclick = () => { const a = M.afk[+b.dataset.afk]; if(a) postModal(null, {titel:a.t, hook:a.h, fase:'Idee'}); });
    mount.querySelector('#mw_fdmaak')?.addEventListener('click', maakFilmdag);
    alleen('[data-fdai]', b => b.onclick = () => filmdagPrompt(b.dataset.fdai));
    alleen('[data-fdprint]', b => b.onclick = () => filmdagBundel(b.dataset.fdprint));
    alleen('[data-next]', b => b.onclick = e => { e.stopPropagation(); const p = M.posts.find(x => x.id === b.dataset.next); if(p) naarVolgende(p); });

    /* Taken */
    alleen('[data-tgl]', c => { c.onclick = e => e.stopPropagation(); c.onchange = () => { const t = zoekTaak(c.dataset.tgl); if(t) toggleTaak(t, c.checked); }; });
    alleen('[data-twis]', b => b.onclick = e => { e.stopPropagation(); const t = zoekTaak(b.dataset.twis); if(t) wisTaak(t); });
    alleen('[data-tschuif]', b => b.onclick = e => { e.stopPropagation(); const t = zoekTaak(b.dataset.tschuif); if(t) schuifDoor([t], volgendeWerkdag(t.datum)); });
    alleen('[data-naarvandaag]', b => b.onclick = () => { const t = zoekTaak(b.dataset.naarvandaag); if(t) schuifDoor([t], CRM.todayISO()); });
    alleen('[data-allesvandaag]', b => b.onclick = () => schuifDoor(M.taken.filter(t => !t.klaar && t.datum < CRM.todayISO()), CRM.todayISO()));
    alleen('[data-tgeb]', b => b.onclick = e => {
      e.stopPropagation(); const t = zoekTaak(b.dataset.tgeb); if(!t) return;
      const i = GEBIEDEN.findIndex(g => g.k === gebied(t.gebied).k);
      updTaak(t, {gebied:GEBIEDEN[(i + 1) % GEBIEDEN.length].k});
    });
    alleen('[data-tduur]', b => b.onclick = e => {
      e.stopPropagation(); const t = zoekTaak(b.dataset.tduur); if(!t) return;
      kiesUitLijst(b, DUREN.map(m => [m, fmtDuur(m)]), duurVan(t), m => updTaak(t, {duur_min:m}));
    });
    alleen('[data-ttijd]', b => b.onclick = e => {
      e.stopPropagation(); const t = zoekTaak(b.dataset.ttijd); if(!t) return;
      if(!M.demo && !M.takenTijd){ CRM.toast(migratieMelding({tijd:''}), 'err'); return; }
      const van = tMin(P.werktijd.van), aantal = (tMin(P.werktijd.tot) - van) / 15;
      kiesUitLijst(b, [['', 'geen vaste tijd'], ...Array.from({length:aantal}, (_, i) => [tStr(van + i * 15), tStr(van + i * 15)])], t.tijd || '', w => updTaak(t, {tijd:w}));
    });

    /* Rooster */
    alleen('.mw-tr-dag[data-trdag]', kol => kol.onclick = e => {
      if(e.target.closest('.mw-tr-blok') || Date.now() - _sleepEind < 400) return;
      const y = e.clientY - kol.getBoundingClientRect().top;
      const min = Math.max(P.rooster[0] * 60, Math.min(P.rooster[1] * 60 - P.stap, Math.floor((P.rooster[0] * 60 + y / P.uurPx * 60) / P.stap) * P.stap));
      openNieuweTaak(kol, min);
    });
    sleepTaken(mount);
    alleen('[data-dagkies]', k => k.onclick = e => {
      if(e.target.closest('[data-post]')) return;
      M.dsDatum = k.dataset.dagkies; M.focus = 'ds-taken'; teken(); naarBlok('mw_ds');
    });
    alleen('[data-afspraak]', a => a.onclick = e => {
      e.stopPropagation();
      if(a.dataset.afspraak === 'weekendcheck'){ CRM.ga('marketing'); return; }
      M.dsDatum = a.dataset.dag; M.focus = 'ds-taken'; teken(); naarBlok('mw_ds');
    });

    /* Dagplanning */
    alleen('[data-dpdag]', b => b.onclick = () => { M.dsDatum = b.dataset.dpdag; teken(); });
    alleen('[data-dsgeb]', b => b.onclick = () => { M.dsGebied = b.dataset.dsgeb; CRM.$$('[data-dsgeb]', mount).forEach(x => x.classList.toggle('on', x === b)); });
    const ta = mount.querySelector('#mw_dstaken');
    if(ta){
      ta.oninput = () => { M.dsTekst = ta.value; };
      const mic = CRM.dictee?.knop(ta), plek = mount.querySelector('#mw_dsmic');
      if(mic && plek){ mic.title = 'Taken inspreken. Zet daarna elke taak op een eigen regel.'; plek.replaceWith(mic); }
    }
    const duur = mount.querySelector('#mw_dsduur');
    if(duur) duur.onchange = () => { M.dsDuur = Number(duur.value) || P.invoerDuur; };
    const zet = mount.querySelector('#mw_dszet');
    if(zet) zet.onclick = async () => {
      const regels = (ta?.value || '').split('\n');
      if(!regels.some(r => r.trim())){ CRM.toast('Typ eerst een taak, één per regel'); ta?.focus(); return; }
      const oud = M.dsTekst; M.dsTekst = '';
      if(!await addTaken(regels, M.dsDatum, M.dsGebied, M.dsDuur)){ M.dsTekst = oud; teken(); }
    };
    const afs = mount.querySelector('#mw_afsluiten');
    if(afs) afs.onclick = dagAfsluiten;

    /* Outlook */
    mount.querySelector('#mw_olaan')?.addEventListener('click', olKoppelen);
    mount.querySelector('#mw_olsync')?.addEventListener('click', () => olSync(true));
    mount.querySelector('#mw_oluit')?.addEventListener('click', olOntkoppelen);

    bindNotities(mount);

    /* Contentplanning */
    alleen('[data-cweek]', b => b.onclick = () => { const n = +b.dataset.cweek; M.contentWeek = n === 0 ? huidigeWeek() : plus(M.contentWeek, n * 7); teken(); });
    alleen('[data-cweergave]', b => b.onclick = () => {
      M.contentWeergave = b.dataset.cweergave;
      if(M.contentWeergave === 'maand') M.calMaand = plus(M.contentWeek || huidigeWeek(), 3).slice(0, 7);
      teken();
    });
    alleen('[data-cmaand]', b => b.onclick = () => {
      const d = dt(M.calMaand + '-15'); d.setMonth(d.getMonth() + Number(b.dataset.cmaand)); M.calMaand = iso(d).slice(0, 7); teken();
    });
    alleen('[data-cel]', c => c.onclick = () => {
      if(Date.now() - _sleepEind < 400) return;
      const [pl, d] = c.dataset.cel.split('|');
      postModal(null, {platform:pl === 'social' ? 'social' : 'linkedin', datum:d, fase:'Ingepland'});
    });
    alleen('[data-mdag]', c => c.onclick = () => { if(Date.now() - _sleepEind < 400) return; postModal(null, {datum:c.dataset.mdag, fase:'Ingepland'}); });
    const pgrid = mount.querySelector('.mw-pgrid');
    if(pgrid) sleepPosts(pgrid, '.mw-ppost', '.mw-cel', c => c.dataset.cel.split('|')[1],
      (item, cel) => item.closest('.mw-cel')?.dataset.cel.split('|')[0] === cel.dataset.cel.split('|')[0]);
    const mgrid = mount.querySelector('.mw-mgrid');
    if(mgrid) sleepPosts(mgrid, '.mw-mpost', '.mw-mcel', c => c.dataset.mdag, () => true);
  }

  function bindNotities(mount){
    const box = mount.querySelector('#mw_nt'); if(!box) return;
    if(meekijker()){
      /* Meekijken: notities van de marketeer lezen, niet wijzigen. Archief en zoeken blijven werken. */
      CRM.$$('#mw_ntnieuw, #mw_ntalles, [data-ntweg], [data-nttaak]', box).forEach(x => x.remove());
      CRM.$$('[data-ntregel], [data-ntcheck]', box).forEach(x => { x.disabled = true; });
    }
    const d = M.dsDatum || CRM.todayISO();
    const regels = () => ntRegels(notitieVan(d));
    const zet = (lijst, focus) => { ntOpslaan(d, ntNaarTekst(lijst), true); M.focus = focus || null; teken(); };
    const nieuw = box.querySelector('#mw_ntnieuw');
    if(nieuw) nieuw.onkeydown = e => {
      if(e.key !== 'Enter') return;
      e.preventDefault();
      const t = nieuw.value.trim(); if(!t) return;
      zet([...regels(), {af:false, tekst:t}], 'nt-nieuw');
    };
    CRM.$$('[data-ntregel]', box).forEach(inp => {
      const i = Number(inp.dataset.ntregel);
      inp.oninput = () => { const l = regels(); if(!l[i]) return; l[i].tekst = inp.value; ntOpslaan(d, ntNaarTekst(l)); };
      inp.onkeydown = e => {
        if(e.key === 'Enter'){ e.preventDefault(); zet(regels(), 'nt-nieuw'); }
        if(e.key === 'Backspace' && !inp.value){ e.preventDefault(); const l = regels(); l.splice(i, 1); zet(l, i > 0 ? 'nt-r' + (i - 1) : 'nt-nieuw'); }
      };
    });
    CRM.$$('[data-ntcheck]', box).forEach(c => c.onchange = () => { const l = regels(), i = Number(c.dataset.ntcheck); if(l[i]){ l[i].af = c.checked; zet(l); } });
    CRM.$$('[data-ntweg]', box).forEach(b => b.onclick = () => { const l = regels(); l.splice(Number(b.dataset.ntweg), 1); zet(l); });
    const naarTaken = lijst => {
      if(!lijst.length){ CRM.toast('Er staan geen open notities'); return; }
      M.dsTekst = (M.dsTekst.trim() ? M.dsTekst.replace(/\s+$/, '') + '\n' : '') + lijst.join('\n');
      M.focus = 'ds-taken'; teken(); naarBlok('mw_ds');
      CRM.toast(`${lijst.length} ${lijst.length > 1 ? 'notities' : 'notitie'} in de takenlijst gezet. Kies de dag en klik op Inplannen.`);
    };
    CRM.$$('[data-nttaak]', box).forEach(b => b.onclick = () => { const r = regels()[Number(b.dataset.nttaak)]; if(r) naarTaken([r.tekst]); });
    box.querySelector('#mw_ntalles')?.addEventListener('click', () => naarTaken(regels().filter(r => !r.af).map(r => r.tekst)));
    CRM.$$('[data-ntopen]', box).forEach(b => b.onclick = () => {
      const dd = b.dataset.ntopen;
      M.week = maandagVan(dd); M.dsDatum = dd; teken(); naarBlok('mw_nt');
    });
    const arch = box.querySelector('.mw-nt-archief'); if(arch) arch.ontoggle = () => { M.ntArchief = arch.open; };
    const zoek = box.querySelector('#mw_ntzoek');
    if(zoek) zoek.oninput = () => { const q = zoek.value.trim().toLowerCase(); CRM.$$('[data-ntzoek]', box).forEach(x => { x.style.display = !q || x.dataset.ntzoek.includes(q) ? '' : 'none'; }); };
  }

  /* Dagafsluiting: alleen handmatig, via de knop in de dagplanning
     (automatische herinnering bewust weg, Bryan 19 okt 2026). */
  function dagAfsluiten(){
    if(meekijker()){ CRM.toast(`De dag afsluiten doet ${weekVan()} zelf`); return; }
    const vandaag = CRM.todayISO();
    const open = M.taken.filter(t => t.datum === vandaag && !t.klaar && vanMij(t));
    if(!open.length){ CRM.modal.close(); CRM.toast('Alles van vandaag is af. Mooi werk.', 'ok'); return; }
    const naar = volgendeWerkdag(vandaag), dag = DAGKORT[dt(naar).getDay()];
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Dag afsluiten</div></div>
      <div class="modal-b">
        <p class="sub" style="margin:0 0 12px">Nog ${open.length} ${open.length > 1 ? 'taken' : 'taak'} open van vandaag. Vink af wat klaar is; de rest schuift door naar ${h(dagLabel(naar))}.</p>
        ${open.map(t => `<div class="mw-afsl" style="--gc:${gebied(t.gebied).c}">
          <span>${h(t.tekst)} <small class="meta">${fmtDuur(duurVan(t))}</small></span>
          <button class="btn ghost sm" data-afok="${h(t.id)}" type="button">Af</button>
          <button class="btn ghost sm" data-afdoor="${h(t.id)}" type="button">→ ${dag}</button></div>`).join('')}
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose type="button">Later</button>
        <button class="btn" id="mw_afslalles" type="button">Rest doorschuiven naar ${h(dagLabel(naar))}</button>
      </div>`, {onOpen(m){
        CRM.$$('[data-afok]', m).forEach(b => b.onclick = async () => { const t = zoekTaak(b.dataset.afok); if(t) await updTaak(t, {klaar:true}); dagAfsluiten(); });
        CRM.$$('[data-afdoor]', m).forEach(b => b.onclick = async () => { const t = zoekTaak(b.dataset.afdoor); if(t) await schuifDoor([t], naar); dagAfsluiten(); });
        m.querySelector('#mw_afslalles').onclick = async () => { await schuifDoor(open, naar); CRM.modal.close(); };
      }});
  }

  function render(mount, actiesEl){
    M.mount = mount; M.actiesEl = actiesEl;
    if(!M.week) M.week = huidigeWeek();
    mount.innerHTML = CRM.ui.laden('Week laden…');
    laad().then(() => { teken(); autoDoorschuiven(); olSyncLater(); })
      .catch(e => { console.error('marketingweek', e); mount.innerHTML = `<div class="note err">De week kon niet geladen worden. Herlaad de pagina.</div>`; });
  }

  CRM.registerModule('marketingweek', {
    title:'Marketingweek', icon:'▦',
    navTitle(){ return CRM.isMarketeer() ? 'Mijn week' : 'Marketingweek'; },
    /* Alleen voor de marketeer en de eigenaar (Tjeerd, 9 okt 2026: niet voor iedereen). */
    zichtbaar(){ return CRM.isMarketeer() || CRM.canSeeMoney(); },
    onderschrift:'De week van de marketeer: tijdrooster, taken, notities en contentplanning',
    /* Eigen tabellen; een realtime-echo uit CRM.state hoeft dit scherm niet
       opnieuw te laden (en zou je uit een notitie gooien). */
    herlaadBijSync:false,
    /* Zijbalkteller: eigen open taken van vandaag en eerder. */
    badge(){ try{ return M.geladen && !meekijker() ? M.taken.filter(t => !t.klaar && t.datum <= CRM.todayISO() && vanMij(t)).length : 0; }catch(e){ return 0; } },
    render
  });
})();

/* VERZOEK AAN CORE (js/outlook.js):
   1. Een algemene bijwerk-functie voor een agenda-afspraak, bv.
      CRM.outlook.eventBijwerk(id, {titel, startISO, minuten}) — of exporteer
      graph(). Nu kan alleen de tijd verzet worden (belEventVerzet); als de
      tekst van een taak verandert of hij wordt afgevinkt, verwijdert
      marketingweek de afspraak en maakt hem opnieuw (nieuw id).
   2. belEventMaak zet altijd een herinnering 5 minuten vooraf en categorie
      'CRM'. Bryans planner had geen herinnering (isReminderOn:false) en
      categorie 'Marketingbord'. Graag opties {herinnering:false, categorie}.
*/
/* VERZOEK AAN CORE (js/dictee.js):
   Een optie om elke afgeronde zin als eigen regel toe te voegen, bv.
   CRM.dictee.knop(veld, {perZin:true}). Bryans inspreekknop maakte van elke
   zin een taak; met de huidige knop komt alles achter elkaar op één regel
   en moet je zelf Enter geven tussen de taken.
*/
/* VERZOEK AAN CORE (index.html): ?v= van js/marketingweek.js en
   css/marketingweek.css ophogen (nu 20261009c). */
