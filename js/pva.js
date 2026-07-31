/* ═══════════════════════════════════════════════════════════════
   PLAN VAN AANPAK-GENERATOR — deel 1: standaardteksten en model
   Tjeerd verkoopt met een gepersonaliseerde mini-landingspagina per
   prospect. Die maakte hij met de hand; dit bestand maakt hem uit het
   CRM, met links de invulvelden en rechts een live voorbeeld.

   Publieke functie:
     CRM.pva.open({klant, stukId})      // beide optioneel

   Uitgangspunten:
   - De teksten hieronder komen uit een echt verstuurd plan van aanpak
     (Signature Foods). Ze zijn verkocht materiaal: aanpassen mag, maar
     verzinnen doen we niet.
   - NOOIT verzonnen cijfers als standaardwaarde. De cijfer- en
     retentievelden beginnen leeg; lege velden komen niet op het vel.
   - Geen gedachtestreepjes in de gegenereerde tekst (huisstijlregel).
   - De OPMAAK zit in code (VELCSS + docHtml), niet in de opslag. In
     `crm_stukken.velden` gaan alleen de ingevulde waarden, zodat een
     huisstijlwijziging vanzelf meegaat in alle oude stukken.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;
const t = v => String(v == null ? '' : v).trim();
const kloon  = o => JSON.parse(JSON.stringify(o));
const gelijk = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/* Rijke tekst: *tekst* wordt vet, regeleinden blijven staan.
   Alles gaat eerst door h() heen: dit vel gaat naar een klant. */
function rt(s){
  return h(t(s)).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}

/* ═══════════════════════════════════════════════════════════════
   SECTORPROFIELEN — de sectorspecifieke pijnpunten en taal
   ═══════════════════════════════════════════════════════════════ */

/* De eerste en de derde alinea zijn in elke sector gelijk: dat is de
   kern van het verhaal ("een laag boven de flexschil"). Alleen de
   tweede alinea, de screening en de tweede kaart praten sectortaal. */
const PIJN_1 = 'Een flexibele schil is fijn en soms nodig. Maar we zien er ook een sluipend risico: veel verloop, weinig kennis en vooral *weinig eigenaarschap*. Het gemiddelde taalniveau daalt, mensen nemen geen verantwoordelijkheid meer en verliezen de feeling met de organisatie.';
const PIJN_3 = '*Wij zitten daar bewust een laag boven.* We vervangen de onderste laag niet, we bouwen er een stabiele laag bovenop: geselecteerd op houding, mentaliteit en teamfit. Betere mensen tillen de hele schil omhoog.';

const SECTOREN = {
  food:{
    label:'Food en voeding',
    woord:'foodbedrijven',
    pijn2:'Dat is niet alleen zonde, het raakt je cijfers. Onderbezetting en verloop drukken je *OEE* en servicegraad, herinwerken kost first-time-right, en een schil zonder eigenaarschap is een risico voor je *IFS/BRC*-audits. Een Lean-organisatie draait op mensen die blijven en meedenken.',
    kpi:'verloop, servicegraad, OEE en outputstabiliteit in piek',
    screening:'We toetsen ook op *hygiëne- en veiligheidsbesef en HACCP-bewustzijn*, cruciaal in food en direct ondersteunend aan jullie IFS/BRC-audits.',
    kaartT:'HACCP, veiligheid en audits',
    kaartP:'We selecteren op hygiëne- en veiligheidsbesef en respect voor voedselveiligheid: mensen die snappen wáárom de regels er zijn. Direct ondersteunend aan jullie IFS/BRC-certificering.',
    casusZin:'Zelfde soort bedrijf, zelfde uitdaging: een foodproducent met een flexschil die te veel verloop kende.',
    functies:['Inpakmedewerkers','Scheppers','Lijnoperators','Buffermedewerkers','Koks','Logistiek medewerkers','Teamleiders']
  },
  productie:{
    label:'Productie',
    woord:'productiebedrijven',
    pijn2:'Dat is niet alleen zonde, het raakt je cijfers. Onderbezetting en verloop drukken je *OEE* en je outputstabiliteit, herinwerken kost first-time-right, en een schil zonder eigenaarschap is een risico voor kwaliteit en veiligheid op de lijn. Een Lean-organisatie draait op mensen die blijven en meedenken.',
    kpi:'verloop, bezetting, OEE en outputstabiliteit in piek',
    screening:'We toetsen ook op *veiligheidsbesef en werken volgens instructie*, cruciaal op een productielijn en direct ondersteunend aan jullie kwaliteits- en veiligheidsafspraken.',
    kaartT:'Veiligheid en kwaliteit',
    kaartP:'We selecteren op veiligheidsbesef en respect voor werkinstructies: mensen die snappen wáárom de regels er zijn. Direct ondersteunend aan jullie kwaliteits- en veiligheidsafspraken.',
    casusZin:'Zelfde soort bedrijf, zelfde uitdaging: een producent met een flexschil die te veel verloop kende.',
    functies:['Productiemedewerkers','Machineoperators','Lijnoperators','Heftruckchauffeurs','Technische dienst','Teamleiders']
  },
  logistiek:{
    label:'Logistiek',
    woord:'logistieke bedrijven',
    pijn2:'Dat is niet alleen zonde, het raakt je cijfers. Onderbezetting en verloop drukken je *servicegraad en leverbetrouwbaarheid*, pickfouten en herwerk kosten geld, en een schil zonder eigenaarschap is een risico rond heftrucks en intern transport. Een Lean-organisatie draait op mensen die blijven en meedenken.',
    kpi:'verloop, servicegraad, leverbetrouwbaarheid en de pieken in je orderprofiel',
    screening:'We toetsen ook op *veiligheidsbesef rond heftruck en intern transport en op nauwkeurigheid bij het picken*, direct ondersteunend aan jullie kwaliteits- en veiligheidsafspraken.',
    kaartT:'Veiligheid en nauwkeurigheid',
    kaartP:'We selecteren op veiligheidsbesef rond heftruck en intern transport en op nauwkeurig werken: mensen die snappen wáárom de regels er zijn. Direct ondersteunend aan jullie servicegraad.',
    casusZin:'Ander soort vloer, zelfde uitdaging: een producent met een flexschil die te veel verloop kende.',
    functies:['Orderpickers','Magazijnmedewerkers','Heftruckchauffeurs','Reachtruckchauffeurs','Logistiek medewerkers','Teamleiders']
  },
  industrie:{
    label:'Industrie en techniek',
    woord:'industriële bedrijven',
    pijn2:'Dat is niet alleen zonde, het raakt je cijfers. Onderbezetting en verloop drukken je *OEE* en je machinebeschikbaarheid, herbewerken kost first-time-right, en een schil zonder eigenaarschap is een risico voor je veiligheid en je VCA-afspraken. Een Lean-organisatie draait op mensen die blijven en meedenken.',
    kpi:'verloop, machinebeschikbaarheid, OEE en outputstabiliteit',
    screening:'We toetsen ook op *veiligheidsbesef en VCA-bewustzijn*, cruciaal op een industriële werkvloer en direct ondersteunend aan jullie veiligheidsafspraken.',
    kaartT:'Veiligheid en VCA',
    kaartP:'We selecteren op veiligheidsbesef en VCA-bewustzijn: mensen die snappen wáárom de regels er zijn. Direct ondersteunend aan jullie veiligheidsafspraken.',
    casusZin:'Ander soort vloer, zelfde uitdaging: een producent met een flexschil die te veel verloop kende.',
    functies:['Productiemedewerkers','Operators','Lassers','Monteurs','Technische dienst','Teamleiders']
  }
};

/* Branche uit de klantkaart naar een sectorprofiel. Onbekend = productie:
   dat is de breedste tekst en valt nooit vreemd op. */
function sectorVanBranche(branche){
  const b = t(branche).toLowerCase();
  if(!b) return 'productie';
  if(/voeding|food|agf|dranken|zoetwaren|vlees|zuivel|bakker|spice/.test(b)) return 'food';
  if(/logistiek|transport|warehouse|distributie|retail|groothandel|terminal/.test(b)) return 'logistiek';
  if(/techniek|metaal|staal|industrie|automotive|farma|chemie|bouwstoffen|elektro/.test(b)) return 'industrie';
  return 'productie';
}

/* ═══════════════════════════════════════════════════════════════
   STANDAARDTEKSTEN — één functie bouwt het hele model
   ═══════════════════════════════════════════════════════════════ */
function maakStandaard(basis){
  const s   = SECTOREN[basis.sector] || SECTOREN.productie;
  const nm  = t(basis.naam)   || 'jullie organisatie';
  const pl  = t(basis.plaats);
  const wrd = t(basis.woord)  || s.woord;
  const inPl = pl ? ' in ' + pl : '';

  return {
    hero:{
      slogan:'New age recruitment. Met marketing als superkracht.',
      kop:'Mensen die blijven.',
      accent:'Ploegen die draaien.',
      kernzin:'Recruitment en employer-video voor productie, logistiek en food, van leadgeneratie tot een ploeg die staat. Voor ' + nm +
              (pl ? ', te beginnen in ' + pl + '.' : '.')
    },
    probleem:{
      eyebrow:'Wat wij zien bij ' + wrd,
      kop:'De flexschil levert handjes. Geen ploeg.',
      punten:[PIJN_1, s.pijn2, PIJN_3]
    },
    functies:(s.functies || []).slice(),
    am:{
      eyebrow:'Hoe we werken',
      kop:'Één vast gezicht, quasi in-house',
      titel:'Jullie vaste accountmanager',
      tekst:'Je krijgt één vast aanspreekpunt dat jullie bedrijf, jullie lijnen en jullie cultuur ként. Die plant en begeleidt de Ontdek & Ontmoet-sessies, kent de openstaande behoefte en schakelt met korte lijnen, alsof het je eigen recruiter is. We werken via een *in-house structuur*, dichtbij de vloer en passend in jullie daily management.'
    },
    werkwijze:{
      eyebrow:'Van leadgeneratie tot plaatsing',
      kop:'De werkwijze, per fase',
      fases:[
        {aan:true, kop:'De vraag echt begrijpen',
         tekst:'Geen vacaturetekst, maar de operatie in kaart: functies, volume per maand, piekperiodes, ploegvormen en waar de uitval zit. We koppelen het aan jullie KPI’s: ' + s.kpi + '.',
         res:'een instroomplan op jullie cijfers, dat past in je daily management.'},
        {aan:true, kop:'Employer branding en video op locatie',
         tekst:'We filmen de echte werkvloer met professionele apparatuur: het tempo, de omgeving, de ploeg. Kandidaten zien vooraf waar ze aan beginnen. Dit werft niet alleen, het *versterkt jullie werkgeversmerk* op de regionale arbeidsmarkt, ook bij mensen die nu nog niet solliciteren.',
         res:'minder mismatch vóóraf en een sterker merk als werkgever.'},
        {aan:true, kop:'Leadgeneratie via de motor',
         tekst:'Meta en TikTok voor de mensen die niet op LinkedIn of jobboards zitten, aangevuld met Indeed en Werkzoeken. Doorlopend, niet per losse vacature. Transparant over salaris, reiskosten en voorwaarden: dat wint vertrouwen vóór het eerste contact. Dit is onze superkracht: marketing als motor onder de werving.',
         res:'een voorspelbare pijplijn in plaats van brandjes blussen bij elk gat.'},
        {aan:true, kop:'Kwalificeren, screenen en DISC',
         tekst:'Een cv zegt niets over motivatie en karakter op de vloer. Daarom werken we veel met *DISC-persoonlijkheidsprofielen*, naast kwalificatie via WhatsApp, screening op soft skills en een referentiecheck. ' + s.screening,
         res:'we selecteren op mentaliteit en eigenaarschap, niet op een mooi cv.'},
        {aan:true, kop:'Ontdek en Ontmoet op jullie vloer',
         tekst:'Één sessie, meerdere kandidaten, op locatie, georganiseerd door jullie vaste accountmanager. De O&O bevestigt in het echt wat DISC en screening laten zien: houding, motivatie en teamfit, nog vóór een cv een rol speelt. Daarom werkt het: karakter zie je op de vloer, niet op papier.',
         res:'de klik wordt op de vloer bepaald, en de besluitvorming versnelt.'},
        {aan:true, kop:'Plaatsing: uitzenden met overname na 1.560 uur',
         tekst:'De medewerker komt op onze loonlijst; wij blijven werkgever. Jullie houden flexibiliteit en dragen geen wervingsrisico. Na *1.560 gewerkte uren (circa driekwart jaar)* neem je kosteloos over als het bevalt. Daarna loopt onze nazorg door.',
         res:'flexibiliteit én kwaliteit, zonder de wegwerpmentaliteit van de flexschil.'}
      ]
    },
    casus:{
      eyebrow:'De bewijscasus',
      naam:'Starcuisine',
      kop:'Zo hebben we het bij Starcuisine gedaan',
      alineas:[
        s.casusZin + ' We zetten onze aanpak neer: een vaste accountmanager in-house, video op locatie, DISC en screening, en Ontdek & Ontmoet-sessies op de vloer.',
        '*En eerlijk: het ging niet vanzelf.* Juist omdat we blijven na de start, zagen we via onze nazorg en evaluatiegesprekken op de vloer vroeg waar uitval dreigde: inwerken dat na week één wegviel, en druk op de lijn. Omdat we betrokken bleven, konden we ingrijpen: vaste buddy’s koppelen, coaching regelen en het terugkoppelen aan het management. Dat is het verschil met een uitzender die plaatst en weg is.'
      ]
    },
    /* Bewust helemaal leeg: nooit een verzonnen percentage naar een klant. */
    cijfers:{
      cellen:[{n:'',l:''},{n:'',l:''},{n:'',l:''},{n:'',l:''}],
      retGetal:'', retTekst:'', hand:''
    },
    meer:{
      eyebrow:'Meer dan invullen',
      kop:'We leveren geen handjes, maar',
      accent:'een ploeg.',
      kaarten:[
        {t:'Sterker werkgeversmerk',
         p:'De videocontent en campagnes bouwen structureel aan hoe ' + nm + ' op de arbeidsmarkt bekendstaat. Elke campagne werkt door, ook voor toekomstige instroom.'},
        {t:s.kaartT, p:s.kaartP}
      ]
    },
    behoud:{
      eyebrow:'Behoud',
      kop:'Hoe we zorgen dat ze blijven',
      intro:'Behoud is waar de flexschil faalt, en waar wij het verschil maken. Vier dingen die wij structureel borgen:',
      kaarten:[
        {t:'De match op de vloer, niet op papier',
         p:'DISC en Ontdek en Ontmoet vooraf: wie het werk heeft gezien en gevoeld, haakt niet af in week twee.'},
        {t:'Vaste buddy en onboarding',
         p:'De grootste uitvalsoorzaak is een nieuwe medewerker die er na week één alleen voor staat. Wij borgen begeleiding in de eerste weken.'},
        {t:'Nazorg op locatie',
         p:'Wij komen echt langs en voeren evaluaties samen met de manager én de kandidaat, na 2, 6 en 12 weken. Problemen komen op tafel voordat ze in een vertrek eindigen.'},
        {t:'Wij blijven werkgever',
         p:'Wij verdienen aan gewerkte uren, niet aan doorplaatsen. Ons belang is gelijk aan het jouwe: dat mensen blijven.'}
      ],
      pull:'Wij gebruiken uitzenden als vorm, maar leveren het tegenovergestelde van de flexschil.'
    },
    cta:{
      eyebrow:'De volgende stap',
      kop:'Klein beginnen.',
      accent:'Samen uitbouwen.',
      alineas:[
        'We doen dit al bij meerdere bedrijven en over meerdere locaties van één organisatie. Elke locatie vraagt een eigen aanpak, en juist dat uitrollen is onze rol.',
        'Ons voorstel: laten we het gesprek voeren om dit *samen neer te zetten*' + (pl ? ', met ' + pl + ' als startpunt.' : '.')
      ],
      modelTitel:'Concreet',
      stappen:[
        'Start bij ' + nm + inPl + ' met één functiegroep of lijn, met een vaste accountmanager en één Ontdek en Ontmoet-sessie op locatie.',
        'Uitzenden met kosteloze overname na 1.560 uur: geen wervingsfee, geen risico vooraf.',
        'Werkt het? Dan rollen we het samen uit naar de andere functies en locaties, elk met een eigen plan.'
      ],
      pill:'Plan een gesprek.'
    },
    foot:{
      claim:'Samen in de ploeg. Zo blijft het draaien.',
      contact:(t(CRM.user && CRM.user.email) || 'tjeerd@ploeggenoten.nl') + ' · ploeggenoten.nl'
    }
  };
}

const SECTIES = [
  {k:'hero',      lbl:'Hero'},
  {k:'probleem',  lbl:'Wat wij zien'},
  {k:'functies',  lbl:'Functielijst'},
  {k:'am',        lbl:'Vast gezicht'},
  {k:'werkwijze', lbl:'Werkwijze per fase'},
  {k:'casus',     lbl:'Referentiecase'},
  {k:'cijfers',   lbl:'Cijfers en retentie'},
  {k:'meer',      lbl:'Meer dan invullen'},
  {k:'behoud',    lbl:'Behoud'},
  {k:'cta',       lbl:'De volgende stap'},
  {k:'foot',      lbl:'Afsluiting'}
];

/* Nieuw model: standaardteksten + de klantgegevens die we al hebben. */
function nieuwModel(klantnaam){
  const k = CRM.klant ? CRM.klant(klantnaam) : null;
  const basis = {
    naam:   t(klantnaam) || t(k && k.naam),
    plaats: t(k && (k.locatie || k.plaats)),
    sector: sectorVanBranche(k && k.branche),
    woord:  ''
  };
  const v = maakStandaard(basis);
  v.klant = basis;
  v.aan = {};
  SECTIES.forEach(s => { v.aan[s.k] = true; });
  /* Functies uit de openstaande vacatures van deze klant, als die er zijn. */
  const uit = functiesUitVacatures(basis.naam);
  if(uit.length) v.functies = uit;
  return v;
}

/* Openstaande vacatures van de klant, ontdubbeld en in meervoud. */
function functiesUitVacatures(klant){
  if(!t(klant) || !CRM.state || !Array.isArray(CRM.state.vacs)) return [];
  const uniek = [];
  CRM.state.vacs
    .filter(v => t(v.klant) === t(klant) && (!v.status || /open/i.test(v.status)))
    .forEach(v => {
      const f = meervoud(t(v.functie));
      if(f && !uniek.some(x => x.toLowerCase() === f.toLowerCase())) uniek.push(f);
    });
  return uniek;
}
function meervoud(f){
  if(!f) return '';
  if(/s$/i.test(f)) return f;
  if(/(eur|ent|ant|ist|ier|oor|aar)$/i.test(f)) return f + 's';
  if(/(er|e)$/i.test(f)) return f + 's';
  if(/dienst$/i.test(f)) return f;                 /* "Technische dienst" blijft */
  return f + 'en';
}

/* Bij een gewijzigde klant, plaats of sector lopen de afgeleide zinnen mee,
   maar alleen als de gebruiker ze niet zelf heeft aangepast. */
function hersynchroniseer(waarde, oud, nieuw){
  if(Array.isArray(nieuw)){
    if(!Array.isArray(waarde)) return kloon(nieuw);
    if(gelijk(waarde, oud)) return kloon(nieuw);
    return waarde.map((w,i) => hersynchroniseer(w, oud && oud[i], nieuw[i] == null ? oud && oud[i] : nieuw[i]));
  }
  if(nieuw && typeof nieuw === 'object'){
    if(!waarde || typeof waarde !== 'object') return kloon(nieuw);
    const uit = {};
    Object.keys(nieuw).forEach(k => { uit[k] = hersynchroniseer(waarde[k], oud && oud[k], nieuw[k]); });
    /* Sleutels die alleen in de waarde zitten blijven staan. */
    Object.keys(waarde).forEach(k => { if(!(k in uit)) uit[k] = waarde[k]; });
    return uit;
  }
  if(typeof nieuw === 'string'){
    return (waarde === oud || waarde == null) ? nieuw : waarde;
  }
  return waarde === undefined ? nieuw : waarde;
}

/* Ontbrekende sleutels aanvullen — oude stukken blijven zo werken als er
   later een veld bij komt. */
function vulAan(waarde, std){
  if(Array.isArray(std)) return Array.isArray(waarde) ? waarde : kloon(std);
  if(std && typeof std === 'object'){
    const uit = kloon(std);
    if(waarde && typeof waarde === 'object'){
      Object.keys(std).forEach(k => { uit[k] = vulAan(waarde[k], std[k]); });
      Object.keys(waarde).forEach(k => { if(!(k in std)) uit[k] = waarde[k]; });
    }
    return uit;
  }
  return waarde === undefined || waarde === null ? std : waarde;
}

/* ═══════════════════════════════════════════════════════════════
   HET VEL — opmaak (VELCSS) en markup (docHtml)
   Beide worden gedeeld door het voorbeeld in de app en de HTML die
   je downloadt of kopieert, zodat die nooit uiteen kunnen lopen.
   Alle klassen hebben een p-voorvoegsel: base.css heeft ook .chip,
   .card en .hand, en die mogen hier niet doorheen praten.
   ═══════════════════════════════════════════════════════════════ */
const VELCSS = `
.pvadoc{
  --olijf:#3D6400; --lime:#C8F135; --on-lime:#171D08;
  --ink:#0E1207; --sectie:#141A0B; --kaart-d:#1B2211; --rand-d:#2A3618;
  --cream:#F6F7F1; --cream2:#EEF1E6; --rand-l:#E0E5D2;
  --tx:#1A1F0A; --tx-m:#5B6544; --tx-d:#F6F7F1; --tx-d-m:#9AA781;
  max-width:920px;margin:0 auto;background:var(--cream);color:var(--tx);
  font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.55;
  -webkit-font-smoothing:antialiased;text-align:left;
}
.pvadoc *{box-sizing:border-box}
.pvadoc h1,.pvadoc h2,.pvadoc h3{
  font-family:'Anton',Impact,sans-serif;text-transform:uppercase;letter-spacing:.5px;
  line-height:1.03;font-weight:400;margin:0;
}
.pvadoc p{margin:0 0 12px}
.pvadoc b,.pvadoc strong{font-weight:700}
.pvadoc .p-eyebrow{font-weight:800;text-transform:uppercase;letter-spacing:1.5px;font-size:.72rem;color:var(--lime)}
.pvadoc .p-eyebrow.d{color:var(--olijf)}
.pvadoc .p-hand{font-family:'Caveat',cursive;font-weight:600;transform:rotate(-2deg);
  display:inline-block;color:var(--olijf);font-size:1.7rem;line-height:1.15}
.pvadoc .p-sr{height:3px;width:64px;background:var(--lime);border-radius:999px;margin:0 0 18px}

.pvadoc .p-hero{background:var(--ink);color:var(--tx-d);padding:48px 48px 44px}
.pvadoc .p-hero img.p-logo{width:300px;max-width:62%;height:auto;display:block;margin-bottom:26px}
.pvadoc .p-merk{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;letter-spacing:1px;
  font-size:2rem;color:var(--lime);margin-bottom:22px}
.pvadoc .p-slogan{font-weight:700;font-size:1.05rem;color:var(--lime);margin-bottom:22px}
.pvadoc .p-hero h1{font-size:2.9rem;margin:0 0 14px;color:var(--tx-d)}
.pvadoc .p-hero h1 .g{color:var(--lime)}
.pvadoc .p-hero .p-sub{font-size:1.15rem;color:var(--tx-d-m);font-weight:500;max-width:620px}

.pvadoc .p-sec{padding:40px 48px}
.pvadoc .p-sec.p-vast{padding-top:0}
.pvadoc .p-sec h2{color:var(--olijf);font-size:1.85rem;margin:6px 0 4px}
.pvadoc .p-lead{font-size:1.08rem;max-width:710px}
.pvadoc .p-chips{margin:14px 0 0}
.pvadoc .p-chip{display:inline-block;background:#fff;border:1px solid var(--rand-l);border-radius:999px;
  padding:7px 15px;font-weight:600;font-size:.9rem;margin:0 8px 8px 0}

.pvadoc .p-band{background:var(--sectie);color:var(--tx-d);padding:42px 48px}
.pvadoc .p-band h2{color:var(--tx-d);font-size:1.85rem;margin:6px 0 4px}
.pvadoc .p-band h2 .g{color:var(--lime)}
.pvadoc .p-band p{color:var(--tx-d);max-width:710px}

.pvadoc .p-am{background:var(--cream2);border:1px solid var(--rand-l);border-left:6px solid var(--lime);
  border-radius:14px;padding:22px 26px;margin-top:8px}
.pvadoc .p-am .p-t{font-weight:800;color:var(--olijf);font-size:1.05rem;margin-bottom:6px}
.pvadoc .p-am p{margin:0}

.pvadoc .p-fase{background:#fff;border:1px solid var(--rand-l);border-radius:14px;padding:20px 22px;
  margin:0 0 14px;display:flex;gap:18px;align-items:flex-start}
.pvadoc .p-fase .p-badge{flex:none;width:42px;height:42px;border-radius:999px;background:var(--olijf);
  color:var(--cream);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.15rem}
.pvadoc .p-fase .p-body{flex:1;min-width:0}
.pvadoc .p-fase h3{color:var(--tx);font-size:1.15rem;margin:2px 0 5px}
.pvadoc .p-fase p{margin:0 0 8px;font-size:.98rem}
.pvadoc .p-res{font-size:.92rem;color:var(--olijf);font-weight:700}
.pvadoc .p-res .p-k{font-weight:800}

.pvadoc .p-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;margin:18px 0 0;
  border-radius:14px;overflow:hidden}
.pvadoc .p-stats.n1{grid-template-columns:1fr}
.pvadoc .p-stats.n2{grid-template-columns:repeat(2,1fr)}
.pvadoc .p-stats.n3{grid-template-columns:repeat(3,1fr)}
.pvadoc .p-stats .p-cell{background:var(--sectie);padding:20px 18px}
.pvadoc .p-stats .p-n{font-variant-numeric:tabular-nums;font-weight:800;font-size:2.05rem;color:var(--lime);line-height:1}
.pvadoc .p-stats .p-l{font-size:.8rem;color:var(--tx-d-m);margin-top:6px}
.pvadoc .p-retentie{background:var(--lime);color:var(--on-lime);border-radius:16px;padding:22px 26px;
  margin-top:14px;display:flex;align-items:center;gap:20px}
.pvadoc .p-retentie .p-big{font-weight:800;font-variant-numeric:tabular-nums;font-size:2.6rem;line-height:1}
.pvadoc .p-retentie .p-txt{font-family:'Anton',sans-serif;text-transform:uppercase;letter-spacing:.5px;
  font-size:1.15rem;line-height:1.12}

.pvadoc .p-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
.pvadoc .p-card{background:var(--kaart-d);border:1px solid var(--rand-d);border-radius:14px;padding:20px 22px}
.pvadoc .p-card .p-t{font-weight:800;color:var(--lime);margin-bottom:6px;font-size:1.05rem}
.pvadoc .p-card p{color:var(--tx-d);margin:0;font-size:.96rem}

.pvadoc .p-keep{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
.pvadoc .p-kcard{background:#fff;border:1px solid var(--rand-l);border-radius:14px;padding:18px 20px}
.pvadoc .p-kcard .p-t{font-weight:800;color:var(--olijf);margin-bottom:5px}
.pvadoc .p-kcard p{margin:0;font-size:.95rem}

.pvadoc .p-pull{background:var(--lime);color:var(--on-lime);border-radius:16px;padding:26px 30px;margin:16px 0 0;
  font-family:'Anton',sans-serif;text-transform:uppercase;letter-spacing:.5px;font-size:1.45rem;line-height:1.14}

.pvadoc .p-model{background:var(--ink);border-radius:16px;padding:30px 34px;color:var(--tx-d);margin-top:20px}
.pvadoc .p-model .p-t{color:var(--lime);font-weight:800;font-size:1.2rem;margin-bottom:12px}
.pvadoc .p-model .p-row{display:flex;gap:14px;margin-bottom:12px;align-items:flex-start}
.pvadoc .p-model .p-row .p-n{color:var(--on-lime);background:var(--lime);border-radius:999px;width:26px;height:26px;
  flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;margin-top:2px}
.pvadoc .p-model .p-row p{margin:0;color:var(--tx-d)}
.pvadoc .p-pill{display:inline-block;background:var(--lime);color:var(--on-lime);border-radius:999px;
  padding:11px 22px;font-weight:700;font-size:.98rem;margin-top:10px}

.pvadoc .p-foot{padding:32px 48px 42px;text-align:center;border-top:1px solid var(--rand-l)}
.pvadoc .p-foot img{width:180px;height:auto;margin-bottom:12px}
.pvadoc .p-foot .p-cl{font-family:'Anton',sans-serif;text-transform:uppercase;letter-spacing:.5px;
  color:var(--olijf);font-size:1.05rem}
.pvadoc .p-foot .p-c{color:var(--tx-m);font-size:.85rem;margin-top:6px}

@media (max-width:640px){
  .pvadoc .p-hero,.pvadoc .p-sec,.pvadoc .p-band,.pvadoc .p-foot{padding-left:24px;padding-right:24px}
  .pvadoc .p-stats,.pvadoc .p-grid2,.pvadoc .p-keep{grid-template-columns:1fr}
  .pvadoc .p-hero h1{font-size:2.1rem}
  .pvadoc .p-hero img.p-logo{width:230px}
  .pvadoc .p-retentie{flex-direction:column;align-items:flex-start;gap:8px}
}
@media print{
  .pvadoc{max-width:none}
  .pvadoc .p-hero,.pvadoc .p-fase,.pvadoc .p-am,.pvadoc .p-card,.pvadoc .p-kcard,
  .pvadoc .p-stats,.pvadoc .p-retentie,.pvadoc .p-model,.pvadoc .p-pull,.pvadoc .p-foot{
    break-inside:avoid;page-break-inside:avoid;
  }
  .pvadoc .p-band,.pvadoc .p-sec{break-inside:auto;page-break-inside:auto}
  .pvadoc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

/* Logo's: in het voorbeeld gewoon het bestand, in de export een data-URI
   zodat de gedownloade HTML op zichzelf staat. */
const LOGO = {lime:'assets/logo-lime.png', dark:'assets/logo-dark.png', limeData:'', darkData:''};
async function haalLogos(){
  if(LOGO.limeData && LOGO.darkData) return;
  await Promise.all(['lime','dark'].map(async soort => {
    if(LOGO[soort + 'Data']) return;
    try{
      const r = await fetch(LOGO[soort], {cache:'force-cache'});
      if(!r.ok) throw new Error(r.status);
      const b = await r.blob();
      LOGO[soort + 'Data'] = await new Promise((res,rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result || ''));
        fr.onerror = rej;
        fr.readAsDataURL(b);
      });
    }catch(e){ console.warn('logo inlezen', soort, e); }
  }));
}

/* De markup van het vel. `bron` bepaalt of we bestandspaden of data-URI's
   gebruiken; verder is de HTML identiek. */
function docHtml(v, opts){
  opts = opts || {};
  const limeSrc = opts.inline ? LOGO.limeData : LOGO.limeData || LOGO.lime;
  const darkSrc = opts.inline ? LOGO.darkData : LOGO.darkData || LOGO.dark;
  const aan = v.aan || {};
  const uit = [];

  /* HERO */
  if(aan.hero){
    uit.push(`<div class="p-hero">
      ${limeSrc ? `<img class="p-logo" src="${h(limeSrc)}" alt="Ploeggenoten">`
                : `<div class="p-merk">Ploeggenoten</div>`}
      ${t(v.hero.slogan) ? `<div class="p-slogan">${rt(v.hero.slogan)}</div>` : ''}
      <h1>${rt(v.hero.kop)}${t(v.hero.accent) ? ` <span class="g">${rt(v.hero.accent)}</span>` : ''}</h1>
      ${t(v.hero.kernzin) ? `<div class="p-sub">${rt(v.hero.kernzin)}</div>` : ''}
    </div>`);
  }

  /* PROBLEEM + FUNCTIELIJST */
  const functies = (v.functies || []).map(t).filter(Boolean);
  if(aan.probleem || (aan.functies && functies.length)){
    const punten = (v.probleem.punten || []).map(t).filter(Boolean);
    uit.push(`<div class="p-sec">
      ${aan.probleem && t(v.probleem.eyebrow) ? `<div class="p-eyebrow d">${rt(v.probleem.eyebrow)}</div>` : ''}
      ${aan.probleem && t(v.probleem.kop) ? `<h2>${rt(v.probleem.kop)}</h2><div class="p-sr"></div>` : ''}
      ${aan.probleem ? punten.map(p => `<p class="p-lead">${rt(p)}</p>`).join('') : ''}
      ${aan.functies && functies.length
        ? `<div class="p-chips">${functies.map(f => `<span class="p-chip">${h(f)}</span>`).join('')}</div>` : ''}
    </div>`);
  }

  /* VAST GEZICHT */
  if(aan.am){
    uit.push(`<div class="p-sec p-vast">
      ${t(v.am.eyebrow) ? `<div class="p-eyebrow d">${rt(v.am.eyebrow)}</div>` : ''}
      ${t(v.am.kop) ? `<h2>${rt(v.am.kop)}</h2><div class="p-sr"></div>` : ''}
      <div class="p-am">
        ${t(v.am.titel) ? `<div class="p-t">${rt(v.am.titel)}</div>` : ''}
        <p>${rt(v.am.tekst)}</p>
      </div>
    </div>`);
  }

  /* WERKWIJZE */
  const fases = (v.werkwijze.fases || []).filter(f => f && f.aan !== false && (t(f.kop) || t(f.tekst)));
  if(aan.werkwijze && fases.length){
    uit.push(`<div class="p-sec p-vast">
      ${t(v.werkwijze.eyebrow) ? `<div class="p-eyebrow d">${rt(v.werkwijze.eyebrow)}</div>` : ''}
      ${t(v.werkwijze.kop) ? `<h2>${rt(v.werkwijze.kop)}</h2><div class="p-sr"></div>` : ''}
      ${fases.map((f,i) => `<div class="p-fase"><div class="p-badge">${i+1}</div><div class="p-body">
        ${t(f.kop) ? `<h3>${rt(f.kop)}</h3>` : ''}
        ${t(f.tekst) ? `<p>${rt(f.tekst)}</p>` : ''}
        ${t(f.res) ? `<div class="p-res"><span class="p-k">Resultaat:</span> ${rt(f.res)}</div>` : ''}
      </div></div>`).join('')}
    </div>`);
  }

  /* REFERENTIECASE + CIJFERS */
  const cellen = (v.cijfers.cellen || []).filter(c => t(c.n) || t(c.l));
  const heeftRet = t(v.cijfers.retGetal) || t(v.cijfers.retTekst);
  const heeftCijfers = aan.cijfers && (cellen.length || heeftRet || t(v.cijfers.hand));
  if(aan.casus || heeftCijfers){
    uit.push(`<div class="p-sec p-vast">
      ${aan.casus && t(v.casus.eyebrow) ? `<div class="p-eyebrow d">${rt(v.casus.eyebrow)}</div>` : ''}
      ${aan.casus && t(v.casus.kop) ? `<h2>${rt(v.casus.kop)}</h2><div class="p-sr"></div>` : ''}
      ${aan.casus ? (v.casus.alineas || []).map(t).filter(Boolean).map(p => `<p class="p-lead">${rt(p)}</p>`).join('') : ''}
      ${heeftCijfers && cellen.length ? `<div class="p-stats n${cellen.length}">${cellen.map(c =>
        `<div class="p-cell"><div class="p-n">${h(t(c.n))}</div><div class="p-l">${h(t(c.l))}</div></div>`).join('')}</div>` : ''}
      ${heeftCijfers && heeftRet ? `<div class="p-retentie">
        ${t(v.cijfers.retGetal) ? `<div class="p-big">${h(t(v.cijfers.retGetal))}</div>` : ''}
        ${t(v.cijfers.retTekst) ? `<div class="p-txt">${h(t(v.cijfers.retTekst))}</div>` : ''}
      </div>` : ''}
      ${heeftCijfers && t(v.cijfers.hand) ? `<p style="margin-top:14px" class="p-hand">${h(t(v.cijfers.hand))}</p>` : ''}
    </div>`);
  }

  /* MEER DAN INVULLEN */
  const mkaarten = (v.meer.kaarten || []).filter(k => t(k.t) || t(k.p));
  if(aan.meer && (t(v.meer.kop) || mkaarten.length)){
    uit.push(`<div class="p-band">
      ${t(v.meer.eyebrow) ? `<div class="p-eyebrow">${rt(v.meer.eyebrow)}</div>` : ''}
      ${t(v.meer.kop) ? `<h2>${rt(v.meer.kop)}${t(v.meer.accent) ? ` <span class="g">${rt(v.meer.accent)}</span>` : ''}</h2><div class="p-sr"></div>` : ''}
      ${mkaarten.length ? `<div class="p-grid2">${mkaarten.map(k =>
        `<div class="p-card">${t(k.t) ? `<div class="p-t">${rt(k.t)}</div>` : ''}<p>${rt(k.p)}</p></div>`).join('')}</div>` : ''}
    </div>`);
  }

  /* BEHOUD */
  const bkaarten = (v.behoud.kaarten || []).filter(k => t(k.t) || t(k.p));
  if(aan.behoud && (t(v.behoud.kop) || bkaarten.length || t(v.behoud.pull))){
    uit.push(`<div class="p-sec">
      ${t(v.behoud.eyebrow) ? `<div class="p-eyebrow d">${rt(v.behoud.eyebrow)}</div>` : ''}
      ${t(v.behoud.kop) ? `<h2>${rt(v.behoud.kop)}</h2><div class="p-sr"></div>` : ''}
      ${t(v.behoud.intro) ? `<p class="p-lead">${rt(v.behoud.intro)}</p>` : ''}
      ${bkaarten.length ? `<div class="p-keep">${bkaarten.map(k =>
        `<div class="p-kcard">${t(k.t) ? `<div class="p-t">${rt(k.t)}</div>` : ''}<p>${rt(k.p)}</p></div>`).join('')}</div>` : ''}
      ${t(v.behoud.pull) ? `<div class="p-pull">${rt(v.behoud.pull)}</div>` : ''}
    </div>`);
  }

  /* DE VOLGENDE STAP */
  const stappen = (v.cta.stappen || []).map(t).filter(Boolean);
  if(aan.cta){
    uit.push(`<div class="p-band">
      ${t(v.cta.eyebrow) ? `<div class="p-eyebrow">${rt(v.cta.eyebrow)}</div>` : ''}
      ${t(v.cta.kop) ? `<h2>${rt(v.cta.kop)}${t(v.cta.accent) ? ` <span class="g">${rt(v.cta.accent)}</span>` : ''}</h2><div class="p-sr"></div>` : ''}
      ${(v.cta.alineas || []).map(t).filter(Boolean).map(p => `<p>${rt(p)}</p>`).join('')}
      ${stappen.length || t(v.cta.pill) ? `<div class="p-model">
        ${t(v.cta.modelTitel) ? `<div class="p-t">${rt(v.cta.modelTitel)}</div>` : ''}
        ${stappen.map((s,i) => `<div class="p-row"><div class="p-n">${i+1}</div><p>${rt(s)}</p></div>`).join('')}
        ${t(v.cta.pill) ? `<span class="p-pill">${rt(v.cta.pill)}</span>` : ''}
      </div>` : ''}
    </div>`);
  }

  /* AFSLUITING */
  if(aan.foot){
    uit.push(`<div class="p-foot">
      ${darkSrc ? `<img src="${h(darkSrc)}" alt="Ploeggenoten">` : ''}
      ${t(v.foot.claim) ? `<div class="p-cl">${rt(v.foot.claim)}</div>` : ''}
      ${t(v.foot.contact) ? `<div class="p-c">${h(t(v.foot.contact))}</div>` : ''}
    </div>`);
  }

  return uit.join('\n');
}

/* Losstaande HTML: lettertypen via de Google Fonts-link, opmaak inline,
   geen enkele verwijzing naar een bestand uit de app. */
function exportHtml(v){
  const titel = 'Ploeggenoten voor ' + (t(v.klant.naam) || 'jullie organisatie');
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${h(titel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&family=Caveat:wght@600&display=swap" rel="stylesheet">
<style>
html,body{margin:0;padding:0;background:#F6F7F1}
${VELCSS}</style>
</head>
<body>
<div class="pvadoc">
${docHtml(v, {inline:true})}
</div>
</body>
</html>
`;
}

/* ══ DEEL 2 VOLGT HIERONDER, IN DEZELFDE AFSCHERMING ══ */

/* ═══════════════════════════════════════════════════════════════
   OPSLAG — crm_stukken (soort 'pva'), in demo localStorage
   ═══════════════════════════════════════════════════════════════ */
const DEMO_KEY = 'crm_pva_demo';

function demoRijen(){
  try{ const a = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function demoBewaar(rijen){
  try{ localStorage.setItem(DEMO_KEY, JSON.stringify(rijen)); }catch(e){}
}

/* Alle eerder gemaakte plannen, eventueel gefilterd op klant. */
async function eerdere(klant){
  if(CRM.demo){
    return demoRijen()
      .filter(r => !t(klant) || r.klant === t(klant))
      .sort((a,b) => String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  }
  let q = CRM.sb.from('crm_stukken').select('*').eq('soort','pva').order('updated_at',{ascending:false}).limit(50);
  if(t(klant)) q = q.eq('klant', t(klant));
  const {data, error} = await q;
  if(error){ console.warn('plannen laden', error); return []; }
  return data || [];
}

async function laadStuk(id){
  if(CRM.demo) return demoRijen().find(r => r.id === id) || null;
  const {data, error} = await CRM.sb.from('crm_stukken').select('*').eq('id', id).maybeSingle();
  if(error){ console.warn('plan laden', error); return null; }
  return data || null;
}

/* Alleen de ingevulde velden gaan de opslag in, nooit de opmaak. */
async function bewaarStuk(stuk, v){
  const nu = new Date().toISOString();
  const rij = {
    id: stuk.id || CRM.uid(),
    soort:'pva',
    klant: t(v.klant.naam),
    kandidaat_id:'',
    titel:'Plan van aanpak ' + (t(v.klant.naam) || 'zonder klant'),
    velden: v,
    versie: (Number(stuk.versie) || 0) + 1,
    status: stuk.status || 'concept',
    door: CRM.me(),
    created_at: stuk.created_at || nu,
    updated_at: nu
  };
  if(CRM.demo){
    const rijen = demoRijen().filter(r => r.id !== rij.id);
    rijen.unshift(rij); demoBewaar(rijen);
    return rij;
  }
  const {error} = await CRM.sb.from('crm_stukken').upsert(rij);
  if(error){ CRM.fout('Opslaan mislukt', error); return null; }
  return rij;
}

/* ═══════════════════════════════════════════════════════════════
   HET VENSTER
   ═══════════════════════════════════════════════════════════════ */
let paneelEl = null, toetsHandler = null, schaalWaarnemer = null, printTimer = null;
const openBlokken = new Set(['klant','hero']);   /* welke instelblokken openstaan */

function schaalBij(){
  if(!paneelEl) return;
  const wrap = paneelEl.querySelector('.pvag-preview');
  const schaal = paneelEl.querySelector('.pvag-schaal');
  const vel = paneelEl.querySelector('.pvag-vel');
  if(!wrap || !schaal || !vel) return;
  const beschikbaar = wrap.clientWidth - 40;
  const breed = 920;
  const s = Math.min(1, Math.max(.24, beschikbaar / breed));
  schaal.style.transform = 'scale(' + s + ')';
  schaal.style.width  = breed + 'px';
  schaal.style.height = (vel.offsetHeight * s) + 'px';
}

/* ─── Bouwstenen voor de zijbalk ──────────────────────────────── */
function veld(pad, waarde, opts){
  opts = opts || {};
  const id = 'pv_' + pad.replace(/[^a-z0-9]/gi,'_');
  const gedeeld = `id="${id}" data-pad="${h(pad)}" placeholder="${h(opts.hint||'')}"`;
  const invoer = opts.regels
    ? `<textarea ${gedeeld} rows="${opts.regels}">${h(waarde)}</textarea>`
    : `<input type="text" ${gedeeld} value="${h(waarde)}">`;
  return `<div class="f-row pvag-veld">
    ${opts.label ? `<label for="${id}">${h(opts.label)}</label>` : ''}
    ${invoer}
    ${opts.onder ? `<div class="hint">${h(opts.onder)}</div>` : ''}
  </div>`;
}

/* Rij-editor: toevoegen, verwijderen en herschikken. */
function rijen(pad, lijst, opts){
  opts = opts || {};
  const items = (lijst || []).map((r,i) => `
    <div class="pvag-rij">
      <div class="pvag-rij-k">
        <span class="label">${h((opts.naam || 'Regel') + ' ' + (i+1))}</span>
        <span class="spacer"></span>
        <button class="btn sub sm" data-op="omhoog" data-pad="${h(pad)}" data-i="${i}" title="Omhoog"${i===0?' disabled':''}>↑</button>
        <button class="btn sub sm" data-op="omlaag" data-pad="${h(pad)}" data-i="${i}" title="Omlaag"${i===lijst.length-1?' disabled':''}>↓</button>
        <button class="btn sub sm" data-op="weg" data-pad="${h(pad)}" data-i="${i}" title="Verwijderen">✕</button>
      </div>
      ${opts.velden
        ? opts.velden.map(f => veld(pad + '.' + i + '.' + f.k, r[f.k] || '', f)).join('')
        : veld(pad + '.' + i, r || '', {regels:opts.regels || 3, hint:opts.hint})}
    </div>`).join('');
  return `<div class="pvag-rijen">${items || '<div class="meta">Nog geen regels.</div>'}
    <button class="btn ghost sm" data-op="erbij" data-pad="${h(pad)}">+ ${h(opts.naam || 'Regel')} toevoegen</button>
  </div>`;
}

function blok(k, titel, aanUit, gewijzigd, binnen){
  const open = openBlokken.has(k);
  return `<details class="pvag-blok${gewijzigd ? ' afwijkend' : ''}${aanUit === false ? ' uit' : ''}"${open ? ' open' : ''} data-blok="${h(k)}">
    <summary>
      ${aanUit !== null
        ? `<label class="pvag-aan" title="Sectie tonen of verbergen">
             <input type="checkbox" data-sectie="${h(k)}"${aanUit ? ' checked' : ''}><span></span></label>`
        : '<span class="pvag-aan leeg"></span>'}
      <b>${h(titel)}</b>
      ${gewijzigd ? '<span class="chip amber sm">gewijzigd</span>' : ''}
      ${aanUit !== null ? `<button class="btn sub sm pvag-herstel" data-herstel="${h(k)}" title="Terug naar de standaardtekst">herstel</button>` : ''}
    </summary>
    <div class="pvag-binnen">${binnen}</div>
  </details>`;
}

/* ─── De zijbalk ──────────────────────────────────────────────── */
function zijHtml(v, std){
  const gew = k => !gelijk(v[k], std[k]);
  const sectorOpties = Object.keys(SECTOREN)
    .map(k => `<option value="${k}"${v.klant.sector===k?' selected':''}>${h(SECTOREN[k].label)}</option>`).join('');

  const klantBlok = `
    ${veld('klant.naam',   v.klant.naam,   {label:'Klantnaam', hint:'bv. Signature Foods'})}
    ${veld('klant.plaats', v.klant.plaats, {label:'Plaats',    hint:'bv. Nieuw-Vennep'})}
    <div class="f-row">
      <label for="pv_sector">Sector</label>
      <select id="pv_sector" data-sector>${sectorOpties}</select>
      <div class="hint">Bepaalt de pijnpunten, de screening en de sectorkaart.</div>
    </div>
    ${veld('klant.woord', v.klant.woord, {label:'Woord in de kop', hint:SECTOREN[v.klant.sector].woord,
      onder:'Leeg laten = "Wat wij zien bij ' + SECTOREN[v.klant.sector].woord + '".'})}
    <div class="note info">Zinnen die je zelf hebt aangepast blijven staan als je de klant of de sector wijzigt.</div>`;

  const heroBlok = `
    ${veld('hero.slogan',  v.hero.slogan,  {label:'Slogan'})}
    ${veld('hero.kop',     v.hero.kop,     {label:'Kop'})}
    ${veld('hero.accent',  v.hero.accent,  {label:'Kop in lime'})}
    ${veld('hero.kernzin', v.hero.kernzin, {label:'Kernzin', regels:4})}`;

  const probleemBlok = `
    ${veld('probleem.eyebrow', v.probleem.eyebrow, {label:'Bovenschrift'})}
    ${veld('probleem.kop',     v.probleem.kop,     {label:'Kop'})}
    <div class="label" style="margin-bottom:6px">Pijnpunten</div>
    ${rijen('probleem.punten', v.probleem.punten, {naam:'Pijnpunt', regels:5})}`;

  const functiesBlok = `
    ${rijen('functies', v.functies, {naam:'Functie', regels:1, hint:'bv. Lijnoperators'})}
    <button class="btn ghost sm" data-op="uitvacatures" style="margin-top:8px">Uit openstaande vacatures halen</button>
    <div class="hint" style="margin-top:6px">Nu ${v.functies.length} functie(s) op het vel.</div>`;

  const amBlok = `
    ${veld('am.eyebrow', v.am.eyebrow, {label:'Bovenschrift'})}
    ${veld('am.kop',     v.am.kop,     {label:'Kop'})}
    ${veld('am.titel',   v.am.titel,   {label:'Titel van het blok'})}
    ${veld('am.tekst',   v.am.tekst,   {label:'Tekst', regels:7})}`;

  const werkwijzeBlok = `
    ${veld('werkwijze.eyebrow', v.werkwijze.eyebrow, {label:'Bovenschrift'})}
    ${veld('werkwijze.kop',     v.werkwijze.kop,     {label:'Kop'})}
    ${(v.werkwijze.fases || []).map((f,i) => `
      <div class="pvag-rij${f.aan === false ? ' uit' : ''}">
        <div class="pvag-rij-k">
          <label class="check"><input type="checkbox" data-fase="${i}"${f.aan === false ? '' : ' checked'}>
            <span>Fase ${i+1}</span></label>
          <span class="spacer"></span>
          <button class="btn sub sm" data-op="omhoog" data-pad="werkwijze.fases" data-i="${i}" title="Omhoog"${i===0?' disabled':''}>↑</button>
          <button class="btn sub sm" data-op="omlaag" data-pad="werkwijze.fases" data-i="${i}" title="Omlaag"${i===v.werkwijze.fases.length-1?' disabled':''}>↓</button>
          <button class="btn sub sm" data-op="weg" data-pad="werkwijze.fases" data-i="${i}" title="Verwijderen">✕</button>
        </div>
        ${veld('werkwijze.fases.'+i+'.kop',   f.kop,   {label:'Kop'})}
        ${veld('werkwijze.fases.'+i+'.tekst', f.tekst, {label:'Tekst', regels:5})}
        ${veld('werkwijze.fases.'+i+'.res',   f.res,   {label:'Resultaat', regels:2})}
      </div>`).join('')}
    <button class="btn ghost sm" data-op="erbij" data-pad="werkwijze.fases">+ Fase toevoegen</button>`;

  const casusBlok = `
    ${veld('casus.eyebrow', v.casus.eyebrow, {label:'Bovenschrift'})}
    ${veld('casus.naam',    v.casus.naam,    {label:'Referentieklant', hint:'bv. Starcuisine'})}
    ${veld('casus.kop',     v.casus.kop,     {label:'Kop'})}
    ${rijen('casus.alineas', v.casus.alineas, {naam:'Alinea', regels:6})}`;

  const cijfersBlok = `
    <div class="note warn">Vul hier alleen cijfers in die je kunt onderbouwen. Lege velden komen niet op het vel.</div>
    ${(v.cijfers.cellen || []).map((c,i) => `
      <div class="pvag-rij">
        <div class="pvag-rij-k"><span class="label">Cijfer ${i+1}</span></div>
        <div class="pvag-duo">
          ${veld('cijfers.cellen.'+i+'.n', c.n, {label:'Getal', hint:'bv. 743'})}
          ${veld('cijfers.cellen.'+i+'.l', c.l, {label:'Toelichting', hint:'bv. leads in 1 maand'})}
        </div>
      </div>`).join('')}
    <div class="pvag-rij">
      <div class="pvag-rij-k"><span class="label">Retentie</span></div>
      ${veld('cijfers.retGetal', v.cijfers.retGetal, {label:'Getal', hint:'bv. 9/9'})}
      ${veld('cijfers.retTekst', v.cijfers.retTekst, {label:'Regel ernaast', hint:'bv. geplaatst en allemaal nóg aan het werk.'})}
    </div>
    ${veld('cijfers.hand', v.cijfers.hand, {label:'Handgeschreven regel', regels:2,
      hint:'bv. Dat cijfer telt: geen doorloop, maar behoud.'})}`;

  const meerBlok = `
    ${veld('meer.eyebrow', v.meer.eyebrow, {label:'Bovenschrift'})}
    ${veld('meer.kop',     v.meer.kop,     {label:'Kop'})}
    ${veld('meer.accent',  v.meer.accent,  {label:'Kop in lime'})}
    ${rijen('meer.kaarten', v.meer.kaarten, {naam:'Kaart', velden:[
      {k:'t', label:'Titel'}, {k:'p', label:'Tekst', regels:4}]})}`;

  const behoudBlok = `
    ${veld('behoud.eyebrow', v.behoud.eyebrow, {label:'Bovenschrift'})}
    ${veld('behoud.kop',     v.behoud.kop,     {label:'Kop'})}
    ${veld('behoud.intro',   v.behoud.intro,   {label:'Inleiding', regels:3})}
    ${rijen('behoud.kaarten', v.behoud.kaarten, {naam:'Kaart', velden:[
      {k:'t', label:'Titel'}, {k:'p', label:'Tekst', regels:3}]})}
    ${veld('behoud.pull', v.behoud.pull, {label:'Uitspraak in lime', regels:3})}`;

  const ctaBlok = `
    ${veld('cta.eyebrow', v.cta.eyebrow, {label:'Bovenschrift'})}
    ${veld('cta.kop',     v.cta.kop,     {label:'Kop'})}
    ${veld('cta.accent',  v.cta.accent,  {label:'Kop in lime'})}
    ${rijen('cta.alineas', v.cta.alineas, {naam:'Alinea', regels:4})}
    ${veld('cta.modelTitel', v.cta.modelTitel, {label:'Titel van het stappenblok'})}
    ${rijen('cta.stappen', v.cta.stappen, {naam:'Stap', regels:3})}
    ${veld('cta.pill', v.cta.pill, {label:'Knoptekst onderaan'})}`;

  const footBlok = `
    ${veld('foot.claim',   v.foot.claim,   {label:'Slotzin'})}
    ${veld('foot.contact', v.foot.contact, {label:'Contactregel'})}`;

  return `
    ${blok('klant','Klant', null, false, klantBlok)}
    ${blok('hero','Hero', v.aan.hero, gew('hero'), heroBlok)}
    ${blok('probleem','Wat wij zien', v.aan.probleem, gew('probleem'), probleemBlok)}
    ${blok('functies','Functielijst', v.aan.functies, gew('functies'), functiesBlok)}
    ${blok('am','Vast gezicht', v.aan.am, gew('am'), amBlok)}
    ${blok('werkwijze','Werkwijze per fase', v.aan.werkwijze, gew('werkwijze'), werkwijzeBlok)}
    ${blok('casus','Referentiecase', v.aan.casus, gew('casus'), casusBlok)}
    ${blok('cijfers','Cijfers en retentie', v.aan.cijfers, gew('cijfers'), cijfersBlok)}
    ${blok('meer','Meer dan invullen', v.aan.meer, gew('meer'), meerBlok)}
    ${blok('behoud','Behoud', v.aan.behoud, gew('behoud'), behoudBlok)}
    ${blok('cta','De volgende stap', v.aan.cta, gew('cta'), ctaBlok)}
    ${blok('foot','Afsluiting', v.aan.foot, gew('foot'), footBlok)}`;
}

/* Waarde op een pad zetten of lezen: 'werkwijze.fases.2.kop'. */
function zet(obj, pad, waarde){
  const d = pad.split('.');
  let o = obj;
  for(let i = 0; i < d.length - 1; i++) o = o[d[i]];
  o[d[d.length-1]] = waarde;
}
function lees(obj, pad){
  return pad.split('.').reduce((o,k) => (o == null ? o : o[k]), obj);
}
/* Een lege regel die past bij de lijst waar hij bij komt. */
function legeRegel(pad){
  if(/fases$/.test(pad))   return {aan:true, kop:'', tekst:'', res:''};
  if(/kaarten$/.test(pad)) return {t:'', p:''};
  return '';
}

/* Gedachtestreepjes zijn een huisstijlfout; hier kun je ze in één keer
   opruimen in plaats van ze veld voor veld te zoeken. */
function telStreepjes(o){
  let n = 0;
  const loop = x => {
    if(typeof x === 'string'){ n += (x.match(/—|--/g) || []).length; }
    else if(x && typeof x === 'object'){ Object.keys(x).forEach(k => loop(x[k])); }
  };
  loop(o); return n;
}
function ruimStreepjes(o){
  const loop = x => {
    if(Array.isArray(x)) return x.map(loop);
    if(x && typeof x === 'object'){ const u = {}; Object.keys(x).forEach(k => u[k] = loop(x[k])); return u; }
    if(typeof x === 'string') return x.replace(/\s*—\s*|\s+--\s+/g, ', ').replace(/,\s*,/g, ',');
    return x;
  };
  return loop(o);
}

/* ═══════════════════════════════════════════════════════════════
   OPENEN — links de velden, rechts het levende voorbeeld
   ═══════════════════════════════════════════════════════════════ */
async function open(opts){
  opts = (typeof opts === 'string') ? {klant:opts} : (opts || {});

  let stuk = {}, v = null;
  if(opts.stukId){
    const rij = await laadStuk(opts.stukId);
    if(rij){ stuk = rij; v = vulAan(rij.velden || {}, nieuwModel(rij.klant)); }
    else CRM.toast('Dat plan is niet meer te vinden, we beginnen opnieuw', 'err');
  }
  if(!v) v = nieuwModel(opts.klant || '');

  /* De stand van de standaardteksten bij de huidige klant en sector. */
  let std = maakStandaard(v.klant);

  sluit(true);
  const wrap = document.createElement('div');
  wrap.id = 'pvagen'; wrap.className = 'pvag';
  wrap.innerHTML = `
    <div class="pvag-scrim"></div>
    <div class="pvag-paneel" role="dialog" aria-modal="true" aria-label="Plan van aanpak maken">
      <header class="pvag-kop">
        <div>
          <div class="h2">Plan van aanpak</div>
          <div class="meta" id="pvag_kopsub"></div>
        </div>
        <button class="btn ghost sm" id="pvag_eerder">Eerdere plannen</button>
        <button class="btn sub" id="pvag_x" aria-label="Sluiten">✕</button>
      </header>
      <div class="pvag-body">
        <aside class="pvag-zij" id="pvag_zij"></aside>
        <div class="pvag-preview">
          <div class="pvag-schaal"><article class="pvag-vel pvadoc" id="pvag_vel"></article></div>
        </div>
      </div>
      <footer class="pvag-voet">
        <span class="meta" id="pvag_stand"></span>
        <span class="spacer"></span>
        <button class="btn sub sm" id="pvag_streepjes" hidden>Gedachtestreepjes opruimen</button>
        <select id="pvag_status" class="pvag-status" title="Status van dit stuk">
          <option value="concept">Concept</option>
          <option value="verstuurd">Verstuurd</option>
        </select>
        <button class="btn ghost" id="pvag_kopie" title="De volledige HTML kopiëren">Kopiëren</button>
        <button class="btn ghost" id="pvag_dl" title="Als los HTML-bestand downloaden">Downloaden</button>
        <button class="btn ghost" id="pvag_bewaar">Opslaan</button>
        <button class="btn" id="pvag_print">Afdrukken / PDF</button>
      </footer>
    </div>`;
  document.body.appendChild(wrap);
  paneelEl = wrap;
  document.body.style.overflow = 'hidden';

  /* De opmaak van het vel staat in JS zodat voorbeeld en export nooit
     kunnen verschillen; hier zetten we hem één keer in de pagina. */
  if(!document.getElementById('pvag_velcss')){
    const st = document.createElement('style');
    st.id = 'pvag_velcss'; st.textContent = VELCSS;
    document.head.appendChild(st);
  }

  const velEl   = wrap.querySelector('#pvag_vel');
  const zijEl   = wrap.querySelector('#pvag_zij');
  const standEl = wrap.querySelector('#pvag_stand');
  const streepEl= wrap.querySelector('#pvag_streepjes');
  wrap.querySelector('#pvag_status').value = stuk.status || 'concept';

  function kopsub(){
    wrap.querySelector('#pvag_kopsub').textContent =
      (t(v.klant.naam) || 'Nieuwe klant') + (t(v.klant.plaats) ? ' · ' + t(v.klant.plaats) : '') +
      ' · ' + (SECTOREN[v.klant.sector] || SECTOREN.productie).label;
  }
  function stand(){
    const n = SECTIES.filter(s => !gelijk(v[s.k], std[s.k])).length;
    const uit = SECTIES.filter(s => !v.aan[s.k]).length;
    standEl.textContent =
      (stuk.id ? 'Opgeslagen, versie ' + (stuk.versie || 1) : 'Nog niet opgeslagen') +
      ' · ' + (n ? n + (n === 1 ? ' sectie aangepast' : ' secties aangepast') : 'alles standaard') +
      (uit ? ' · ' + uit + ' uit' : '');
    const st = telStreepjes(v);
    streepEl.hidden = !st;
    streepEl.textContent = 'Gedachtestreepjes opruimen (' + st + ')';
  }
  function tekenVel(){
    velEl.innerHTML = docHtml(v);
    kopsub(); stand();
    requestAnimationFrame(schaalBij);
  }
  function tekenZij(){
    zijEl.querySelectorAll('details[data-blok]').forEach(d => {
      if(d.open) openBlokken.add(d.dataset.blok); else openBlokken.delete(d.dataset.blok);
    });
    const scroll = zijEl.scrollTop;
    zijEl.innerHTML = zijHtml(v, std);
    zijEl.scrollTop = scroll;
    tekenVel();
  }

  /* Eén luisteraar voor alle invoer: het pad staat op het veld zelf. */
  const traag = CRM.debounce(() => tekenVel(), 160);
  zijEl.addEventListener('input', e => {
    const el = e.target.closest('[data-pad]');
    if(!el) return;
    zet(v, el.dataset.pad, el.value);
    if(/^klant\./.test(el.dataset.pad)) hersync();
    traag();
  });
  /* Pas bij verlaten van het veld tekenen we de zijbalk opnieuw: anders
     springt de cursor uit het veld waar je in typt. */
  zijEl.addEventListener('change', e => {
    const el = e.target;
    if(el.matches('[data-sector]')){
      v.klant.sector = el.value; hersync(); tekenZij(); return;
    }
    if(el.matches('[data-sectie]')){
      v.aan[el.dataset.sectie] = el.checked;
      el.closest('details').classList.toggle('uit', !el.checked);
      tekenVel(); return;
    }
    if(el.matches('[data-fase]')){
      v.werkwijze.fases[Number(el.dataset.fase)].aan = el.checked;
      el.closest('.pvag-rij').classList.toggle('uit', !el.checked);
      tekenVel(); return;
    }
    if(el.closest('[data-pad]')) tekenZij();
  });

  zijEl.addEventListener('click', e => {
    const knop = e.target.closest('button[data-op],button[data-herstel]');
    if(!knop) return;
    e.preventDefault();
    if(knop.dataset.herstel){
      const k = knop.dataset.herstel;
      v[k] = kloon(std[k]);
      tekenZij();
      CRM.toast('Standaardtekst teruggezet', 'ok');
      return;
    }
    const op = knop.dataset.op;
    if(op === 'uitvacatures'){
      const uit = functiesUitVacatures(v.klant.naam);
      if(!uit.length){ CRM.toast('Geen openstaande vacatures voor deze klant', 'err'); return; }
      v.functies = uit; tekenZij(); return;
    }
    const pad = knop.dataset.pad, i = Number(knop.dataset.i);
    const lijst = lees(v, pad);
    if(!Array.isArray(lijst)) return;
    if(op === 'erbij')  lijst.push(legeRegel(pad));
    if(op === 'weg')    lijst.splice(i, 1);
    if(op === 'omhoog' && i > 0) lijst.splice(i-1, 0, lijst.splice(i,1)[0]);
    if(op === 'omlaag' && i < lijst.length-1) lijst.splice(i+1, 0, lijst.splice(i,1)[0]);
    tekenZij();
  });

  /* Klant, plaats of sector gewijzigd: afgeleide zinnen lopen mee, eigen
     tekst blijft staan. */
  function hersync(){
    const nieuw = maakStandaard(v.klant);
    const aan = v.aan, klant = v.klant;
    const bijgewerkt = hersynchroniseer(v, std, nieuw);
    Object.keys(nieuw).forEach(k => { v[k] = bijgewerkt[k]; });
    v.aan = aan; v.klant = klant;
    std = nieuw;
  }

  tekenZij();
  await haalLogos();
  tekenVel();

  /* ─── Knoppen ───────────────────────────────────────────────── */
  wrap.querySelector('.pvag-scrim').onclick = () => sluit();
  wrap.querySelector('#pvag_x').onclick = () => sluit();
  wrap.querySelector('#pvag_status').onchange = e => { stuk.status = e.target.value; };
  streepEl.onclick = () => {
    /* Ook de klantgegevens gaan mee: die staan in elke afgeleide zin. */
    const schoon = ruimStreepjes(v);
    Object.keys(schoon).forEach(k => { v[k] = schoon[k]; });
    std = maakStandaard(v.klant);
    tekenZij(); CRM.toast('Gedachtestreepjes vervangen door komma’s', 'ok');
  };
  wrap.querySelector('#pvag_kopie').onclick = async () => {
    await haalLogos();
    kopieer(exportHtml(v));
  };
  wrap.querySelector('#pvag_dl').onclick = async () => {
    await haalLogos();
    downloadHtml(v);
  };
  wrap.querySelector('#pvag_bewaar').onclick = async (e) => {
    e.target.disabled = true;
    const rij = await bewaarStuk(stuk, v);
    e.target.disabled = false;
    if(!rij) return;
    const nieuwStuk = !stuk.id;
    stuk = rij;
    stand();
    CRM.toast(nieuwStuk ? 'Plan van aanpak opgeslagen' : 'Opgeslagen als versie ' + rij.versie, 'ok');
    if(t(v.klant.naam)){
      try{
        await CRM.logActiviteit('klant', t(v.klant.naam), 'doc',
          'Plan van aanpak ' + (nieuwStuk ? 'gemaakt' : 'bijgewerkt (versie ' + rij.versie + ')') + '.');
      }catch(err){ console.warn('activiteit loggen', err); }
    }
  };
  wrap.querySelector('#pvag_print').onclick = () => afdrukken(v);
  wrap.querySelector('#pvag_eerder').onclick = () => toonEerdere(v.klant.naam);

  toetsHandler = e => { if(e.key === 'Escape' && !document.getElementById('modal')?.classList.contains('on')) sluit(); };
  document.addEventListener('keydown', toetsHandler);

  if(window.ResizeObserver){
    schaalWaarnemer = new ResizeObserver(() => schaalBij());
    schaalWaarnemer.observe(wrap.querySelector('.pvag-preview'));
  }else{
    window.addEventListener('resize', schaalBij);
  }
  requestAnimationFrame(schaalBij);
}

function sluit(stil){
  const el = document.getElementById('pvagen');
  if(toetsHandler){ document.removeEventListener('keydown', toetsHandler); toetsHandler = null; }
  if(schaalWaarnemer){ try{ schaalWaarnemer.disconnect(); }catch(e){} schaalWaarnemer = null; }
  else window.removeEventListener('resize', schaalBij);
  if(el) el.remove();
  paneelEl = null;
  if(!stil) document.body.style.overflow = '';
}

/* ─── Eerder gemaakte plannen ─────────────────────────────────── */
async function toonEerdere(klant){
  const rijen = await eerdere(klant);
  const lijst = rijen.length
    ? rijen.map(r => `<button class="pvag-eerder-rij" data-id="${h(r.id)}">
        <b>${h(r.titel || r.klant || 'Plan van aanpak')}</b>
        <span class="meta">versie ${h(r.versie || 1)} · ${h(r.status || 'concept')} · ${h(CRM.fmtDate(r.updated_at))}${r.door ? ' · ' + h(r.door) : ''}</span>
      </button>`).join('')
    : `<p class="sub" style="margin:0">Nog geen plannen bewaard${t(klant) ? ' voor ' + h(klant) : ''}.</p>`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Eerdere plannen${t(klant) ? ' voor ' + h(klant) : ''}</div></div>
    <div class="modal-b"><div class="pvag-eerder">${lijst}</div></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Sluiten</button></div>`, {
    onOpen(m){
      m.querySelectorAll('.pvag-eerder-rij').forEach(b => b.onclick = () => {
        CRM.modal.close();
        open({stukId:b.dataset.id});
      });
    }
  });
}

/* ─── Afdrukken ───────────────────────────────────────────────── */
/* Zelfde aanpak als de cv-generator: de printregels hangen aan een klasse
   (zie css/pva.css), niet aan @media print, zodat je de printstand ook op
   het scherm kunt controleren. */
/* @page geldt documentbreed en is niet per module af te bakenen. Dit vel
   loopt tot de rand (donkere banden, volbleed hero), dus marge 0 — maar
   alleen zolang DIT vel print, anders raken we het printen van gewone
   schermen en van de andere documentgeneratoren. Zelfde aanpak als
   js/cv.js en js/swo.js. */
function paginaAan(){
  if(document.getElementById('pvag-print-page')) return;
  const st = document.createElement('style');
  st.id = 'pvag-print-page';
  st.textContent = '@page{size:A4;margin:0}';
  document.head.appendChild(st);
}
function paginaUit(){ document.getElementById('pvag-print-page')?.remove(); }

function printAan(){ if(paneelEl){ paneelEl.classList.add('pvag-print'); paginaAan(); } }
function printUit(){
  clearTimeout(printTimer); printTimer = null;
  if(paneelEl) paneelEl.classList.remove('pvag-print');
  paginaUit();
}
window.addEventListener('beforeprint', printAan);
window.addEventListener('afterprint', printUit);

async function afdrukken(v){
  if(!paneelEl) return;
  printAan();
  printTimer = setTimeout(printUit, 8000);
  try{ window.print(); }catch(e){ CRM.fout('Afdrukken lukte niet', e); }
  printUit();
  if(t(v.klant.naam)){
    try{ await CRM.logActiviteit('klant', t(v.klant.naam), 'doc', 'Plan van aanpak afgedrukt of als PDF opgeslagen.'); }
    catch(e){ console.warn('activiteit loggen', e); }
  }
}

/* ─── Kopiëren en downloaden ──────────────────────────────────── */
async function kopieer(tekst){
  try{
    if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(tekst);
    else throw new Error('geen clipboard-api');
    CRM.toast('HTML gekopieerd, plak hem in je mail', 'ok');
  }catch(e){
    const ta = document.createElement('textarea');
    ta.value = tekst; ta.setAttribute('readonly','');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e2){}
    ta.remove();
    CRM.toast(ok ? 'HTML gekopieerd, plak hem in je mail' : 'Kopiëren lukte niet, gebruik downloaden', ok ? 'ok' : 'err');
  }
}

function downloadHtml(v){
  const naam = 'Ploeggenoten - plan van aanpak' +
    (t(v.klant.naam) ? ' ' + t(v.klant.naam).replace(/[\\/:*?"<>|]/g,'') : '') + '.html';
  const blob = new Blob([exportHtml(v)], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = naam;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  CRM.toast('HTML gedownload', 'ok');
  if(t(v.klant.naam)){
    CRM.logActiviteit('klant', t(v.klant.naam), 'doc', 'Plan van aanpak als HTML gedownload.')
      .catch(e => console.warn('activiteit loggen', e));
  }
}

CRM.pva = {open, sluit, eerdere, exportHtml, nieuwModel};
})();
