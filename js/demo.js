/* ═══════════════════════════════════════════════════════════════
   DEMO-MODUS — alleen op localhost, alleen met ?demo=1
   Doel: de app visueel kunnen controleren zonder in te loggen.
   Raakt de echte database NOOIT aan: alle schrijfacties blijven in
   het geheugen. In productie (GitHub Pages) doet dit bestand niets.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const lokaal = ['localhost','127.0.0.1'].includes(location.hostname);
  const aan = lokaal && new URLSearchParams(location.search).has('demo');
  if(!aan) return;

  const alsAdmin = new URLSearchParams(location.search).get('demo') !== 'team';
  const vandaag = new Date();
  const d = n => new Date(vandaag.getTime() + n*86400000).toLocaleDateString('sv-SE');
  const mnd = vandaag.toLocaleDateString('sv-SE').slice(0,7);   // lokale maand

  const KLANTEN = [
    ['Starcuisine','Afgerond','Tjeerd','Bodegraven','Voedingsmiddelen'],
    ['Good Life Foods','Afgerond','Tjeerd','Zoetermeer','Voedingsmiddelen'],
    ['Whisk Food','Afgerond','Tjeerd','Rijnsburg','Voedingsmiddelen'],
    ['Burg Siroop','Afgerond','Tjerk','Zaandam','Voedingsmiddelen'],
    ['Proponent','Afgerond','Tjerk','Rotterdam','Logistiek'],
    ['Van Vliet Zoetwaren','Afgerond','Tjeerd','Bodegraven','Voedingsmiddelen'],
    ['Koomstra & Co','Onderhandeling','Tjeerd','Alphen a/d Rijn','Productie'],
    ['Tegelhuis Barendrecht','Voorstel gedaan','Tjerk','Barendrecht','Groothandel'],
    ['MBS Groep','Voorstel gedaan','Tjeerd','Waddinxveen','Techniek'],
    ['SK Tes','SWO gestuurd','Tjeerd','Gouda','Productie'],
    ['Kontent Structures','SWO gestuurd','Rajesh','Nieuwkoop','Bouw'],
    ['Le Duc Fine Food','Gesprek ingepland','Tjeerd','Katwijk','Voedingsmiddelen'],
    ['Lek/Habo','Gesprek ingepland','Tjerk','Sliedrecht','Techniek'],
    ['Vrumona','In afwachting kennismaking','Tjeerd','Bunnik','Dranken'],
    ['Arcelor Mittal','In afwachting kennismaking','Rajesh','Rotterdam','Staal'],
    ['Desatel','Prospect','Tjeerd','Delft','Techniek'],
    ['Schipper Kozijnen','Prospect','Tjeerd','Nieuw-Vennep','Bouw'],
    ['Zeeuw & Zeeuw','Prospect','Tjeerd','Alphen a/d Rijn','Automotive'],
    ['The Greenery','Prospect','Tjerk','Barendrecht','AGF'],
    ['Natures Pride','Prospect','Tjeerd','Maasdijk','AGF'],
    ['MCO Health','Suspect','Tjeerd','Almere','Farma'],
    ['Tata Steel','Suspect','Rajesh','IJmuiden','Staal'],
    ['Holcim','Suspect','Tjerk','Krimpen a/d IJssel','Bouwstoffen'],
    ['Gebr. Bodegraven','Suspect','Tjeerd','Bodegraven','Metaal'],
    ['Retour Matras','Lead','Tjeerd','Waddinxveen','Productie'],
    ['Balvert Betonstaal','Lead','Tjeerd','Vlaardingen','Metaal'],
    ['Impala Terminals','Lead','Tjeerd','Rotterdam','Logistiek'],
    ['Versteegen Spices','Lead','Rajesh','Rotterdam','Voedingsmiddelen'],
    ['Hoogvliet HCS','Lead','Tjeerd','Bleiswijk','Retail'],
    ['Groendland Kip','Lead','Tjeerd','Nunspeet','Voedingsmiddelen']
  ].map(([naam,fase,eigenaar,locatie,branche],i) => ({
    naam, fase, eigenaar, locatie, branche, contact:'', telefoon:'088 - 123 45 '+(10+i),
    email:'contact@'+naam.toLowerCase().replace(/[^a-z]/g,'')+'.nl', website:'',
    sinds:['Afgerond'].includes(fase)?d(-200-i*10):null,
    laatst_contact:d(-(i%25)), fase_sinds:d(-(5+i*3)), note:''
  }));

  const VACS = [
    ['Starcuisine','Productiemedewerker','Bodegraven',3,2700,3100],
    ['Starcuisine','Heftruckchauffeur','Bodegraven',1,2900,3300],
    ['Good Life Foods','Operator','Zoetermeer',2,3000,3500],
    ['Whisk Food','Magazijnmedewerker','Rijnsburg',1,2700,3000],
    ['Whisk Food','Productiemedewerker','Rijnsburg',1,2800,3200],
    ['Whisk Food','Senior Operator','Rijnsburg',4,3500,4200],
    ['Whisk Food','Technische dienst','Rijnsburg',1,3500,4300],
    ['Burg Siroop','Procesoperator','Zaandam',2,3200,3800],
    ['Proponent','Orderpicker','Rotterdam',5,2500,2800],
    ['Van Vliet Zoetwaren','Inpakmedewerker','Bodegraven',3,2500,2750],
    ['Koomstra & Co','Lasser','Alphen a/d Rijn',2,3100,3700]
  ].map(([klant,functie,locatie,aantal,sal_min,sal_max], i) => ({
    id:klant+'::'+functie, klant, functie, locatie, aantal, sal_min, sal_max,
    type:'W&S', status:'Open', eigenaar:'Tjeerd', aangemaakt:d(-30), omschrijving:'',
    // Drie hot vacatures met deadline en doel voor de demo
    hot: i===7 || i===2 || i===10,
    hot_prio: i===7 ? 1 : i===2 ? 2 : i===10 ? 3 : null,
    deadline: i===7 ? d(2) : i===2 ? d(5) : i===10 ? d(9) : null,
    doel_aantal: i===7 ? 2 : i===2 ? 3 : i===10 ? 2 : null,
    doel_soort: 'voorstellen',
    doel_gezet_op: i===7||i===2||i===10 ? d(-4) : null
  }));

  const VN = ['Marek','Ionut','Kevin','Alphonse','Michal','Sven','Alain','Rico','Lorenzo','Anna','Soufiane','Henri','Adam','Piotr','Daniel','Youssef','Bogdan','Elias','Tomasz','Karol','Nadia','Fatima','Ahmed','Radu','Viktor'];
  const AN = ['Nowak','Popescu','de Vries','Mbeki','Ostrowski','van Katwijk','Jansen','Silva','Costa','Jarosz','El Amrani','Dupont','Kowalski','Zielinski','Bakker','Haddad','Ionescu','Petrov','Wozniak','Nowicki','Ben Ali','Said','Hassan','Munteanu','Ivanov'];
  const PL = ['Rotterdam','Den Haag','Gouda','Alphen a/d Rijn','Zoetermeer','Leiden','Bodegraven','Waddinxveen','Delft','Katwijk','Schiedam','Vlaardingen'];
  const FASEN = ['Intake','Voorgesteld','O&O sessie','Eerste gesprek','Tweede gesprek','Meeloopdag','In de wacht','Offer','Contract ondertekenen','Contract getekend','Gestart','Afgevallen','Gestopt'];
  const RECS = ['Tjeerd','Tjerk','Rajesh'];
  const rnd = (a,i) => a[i % a.length];

  const CANDS = Array.from({length:64}, (_,i) => {
    const fase = i<40 ? FASEN[i % 11] : (i<54 ? 'Afgevallen' : 'Gestopt');
    const v = VACS[i % VACS.length];
    const geplaatst = ['Contract getekend','Gestart'].includes(fase) ? d(-(i%25)) : (fase==='Gestopt'? d(-90-i) : '');
    return {
      /* De achternaam schuift één plek op per blok van 25, anders leveren i en
         i+25 dezelfde volledige naam op — er stonden zo 25 dubbele namen in de
         demo. Gevolg: dezelfde persoon telde als juli-plaatsing én als
         april-plaatsing die in juli stopte, waardoor de maandteller op "-3 / 8"
         in het rood stond. Geen rekenfout, wel demodata die eruitzag als een
         kapot scherm. */
      id:'demo'+i, naam:VN[i%VN.length]+' '+AN[(i*7 + Math.floor(i/VN.length)) % AN.length],
      klant:v.klant, functie:v.functie,
      type: i%9===0 ? 'Flex':'W&S', fase, datum: i%3===0 ? d(i%7) : '', tijd: i%3===0?'10:00':'',
      start: ['Contract getekend','Gestart'].includes(fase)? d(7+(i%20)) : '',
      since:d(-(10+i)), bron: rnd(['Meta','Indeed','Referral','WhatsApp'],i),
      geplaatst_op: geplaatst && ['Contract getekend','Gestart'].includes(fase) ? d(-(i%20)) : (fase==='Gestopt'?d(-120):''),
      gestopt_op: fase==='Gestopt' ? d(-(i%20)) : '',
      maandloon: 2600 + (i%9)*120, toeslag_pct: i%4===0?15:0, vt_pct:8,
      rec: rnd(RECS,i), telefoon:'06 1234 56'+(10+i%80),
      email:(rnd(VN,i)+'.'+rnd(AN,i*3+1)).toLowerCase().replace(/[^a-z.]/g,'')+'@gmail.com',
      woonplaats: rnd(PL,i*2), vacature_id:v.id,
      volgende_actie: i%5===0 ? 'Bellen over meeloopdag':'', actie_datum: i%5===0? d(i%4-1):'',
      no_shows: i%13===0?1:0,
      notities: i%4===0 ? [{op:d(-3)+'T10:00',door:'Tjeerd',tekst:'Belde terug, enthousiast over de functie.'}]:[],
      historie: FASEN.slice(0, Math.max(1,FASEN.indexOf(fase))).map((f,j)=>({fase:f,op:d(-(30-j*3))})),
      intake: i%6===0 ? {cijfer:8, drijfveer:'Wil vaste uren dicht bij huis', op:d(-5), door:'Tjeerd'} : null,
      afval_type: fase==='Afgevallen' ? (i%2?'offer_afgewezen':'niet_gekwalificeerd'):'',
      afval_categorie: fase==='Afgevallen' ? (i%2?'Salaris te laag':'Taal'):'',
      stop_door: fase==='Gestopt'?'kandidaat':'', stop_categorie: fase==='Gestopt'?'Ander werk gevonden':'',
      reden:'', cv: i%3===0 ? {functie:v.functie, ervaringJaren:2+(i%6), skills:['heftruck','VCA','productie'], talen:['Nederlands','Engels']} : null,
      ster: [0,3,4,5,2,4][i%6], beschikbaar: ['direct','in overleg','','direct',''][i%5],
      ploegen: ['geen','2-ploegen','3-ploegen','wisselend',''][i%5],
      talen: ['NL','NL, EN','PL, EN','NL, EN, PL','RO, EN'][i%5],
      rijbewijs: ['B','B + heftruck','geen','B','heftruck'][i%5],
      vervoer: ['auto','ov','auto','fiets','auto'][i%5]
    };
  });

  /* ── Randgevallen ──────────────────────────────────────────────
     Niemand mag uit beeld vallen. Deze negen kaarten zijn precies de
     gevallen waarvan dat het snelst gebeurt; ze staan in de demo zodat je
     met eigen ogen kunt zien waar ze terechtkomen in plaats van erop te
     moeten vertrouwen. Verwacht gedrag:
       - geen fase / golden      → niet op het bord, wél gemeld onder de filters
       - 'Voorselectie'          → gewoon in de kolom Intake (CRM.faseNorm)
       - fase die niet bestaat   → niet op het bord, apart gemeld
       - afvaller mét stopdatum  → amberen waarschuwing in de Uitval-tab
       - gestopte vervanger      → telt niet nóg een keer af van het target
       - stop zonder plaatsing   → telt helemaal niet af
       - verwijderde vacature    → kaart blijft leesbaar, geen lege kolom
       - O&O-sessie van een andere klant → onder "Zonder sessie", niet weg  */
  const P1 = mnd + '-02', P2 = mnd + '-03';
  const basis = (id, naam, extra) => Object.assign({
    id, naam, klant:'Starcuisine', functie:'Productiemedewerker', type:'W&S', fase:'',
    datum:'', tijd:'', start:'', since:d(-14), bron:'Indeed', geplaatst_op:'', gestopt_op:'',
    maandloon:2800, vt_pct:8, rec:'Tjeerd', telefoon:'06 1111 2233', email:'', woonplaats:'Gouda',
    vacature_id:'Starcuisine::Productiemedewerker', notities:[], historie:[], no_shows:0
  }, extra);

  const RAND = [
    basis('rand1','Golden Gerda',   {fase:'', golden:true, functie:'Operator', klant:'', vacature_id:''}),
    basis('rand2','Loze Lodewijk',  {fase:'', functie:'Inpakmedewerker'}),
    basis('rand3','Oude Otto',      {fase:'Voorselectie', datum:d(2), tijd:'11:00'}),
    basis('rand4','Fantoom Frits',  {fase:'Screening'}),
    basis('rand5','Scheve Saskia',  {fase:'Afgevallen', gestopt_op:d(-20), afval_type:'niet_gekwalificeerd',
                                     afval_categorie:'Taal', since:d(-20)}),
    basis('rand6','Gestopte Gerard',{fase:'Gestopt', start:P1, geplaatst_op:P1, gestopt_op:P2,
                                     garantie_mnd:3, stop_door:'kandidaat', stop_categorie:'Werk beviel niet',
                                     since:P2, recyclebaar:true}),
    basis('rand7','Vervanger Vera', {fase:'Gestopt', vervangt:'rand6', start:P1, geplaatst_op:P1,
                                     gestopt_op:P2, stop_door:'klant', stop_categorie:'Conflict/houding', since:P2}),
    basis('rand8','Spook Sander',   {fase:'Gestopt', gestopt_op:P2, stop_door:'anders',
                                     stop_categorie:'Anders', since:P2}),
    basis('rand9','Weesje Wim',     {fase:'Voorgesteld', vacature_id:'Verwijderde::Vacature',
                                     klant:'Verwijderde Klant', functie:'Onbekende functie'})
  ];
  CANDS.push(...RAND);

  /* O&O-sessies: het bord toont per sessie een kop met n/4. Sessie 2 staat op
     een ándere klant dan de kandidaat die eraan hangt — zo is te zien dat die
     kandidaat bij een klantfilter onder "Zonder sessie" belandt en niet
     stilletjes van het bord valt. */
  const OO = [
    {id:'oo1', klant:'Whisk Food',  functie:'Productiemedewerker', datum:d(3),  locatie:'Rijnsburg'},
    {id:'oo2', klant:'Good Life Foods', functie:'Operator',        datum:d(10), locatie:'Zoetermeer'}
  ];
  CANDS.filter(c => c.fase === 'O&O sessie').forEach((c, i) => { c.oo_id = i === 0 ? 'oo2' : 'oo1'; });

  const LEADS = Array.from({length:38}, (_,i) => {
    const v = VACS[i % VACS.length];
    /* 'Intake gepland' bestaat niet meer sinds de recruitmentpijplijn is
       uitgesplitst — de videocall ís de intake. Zie CRM.LEAD_STATUS. */
    const st = ['Nieuw','Nieuw','Nieuw','Gebeld — geen gehoor','Potentieel','CV opgevraagd',
                'Geen interesse','Videocall gepland','CV binnen','Videocall gehad',
                'Potentieel — andere vacature','Niet geschikt'][i%12];
    return {
      /* Zelfde valkuil als bij de kandidaten: i en i+25 leverden dezelfde
         volledige naam op, waardoor "Marek Nowak" twee keer in dezelfde
         openstaande lijst stond en het als een fout las. */
      id:'lead'+i, naam:VN[(i*5)%VN.length]+' '+AN[(i*7 + Math.floor(i/VN.length)) % AN.length], telefoon:'06 8765 43'+(10+i%80),
      email:'', woonplaats:rnd(PL,i*3), bron:rnd(['Meta','Indeed','WhatsApp'],i), campagne:'Productie NL – juli',
      vacature_id:v.id, klant:v.klant, functie:v.functie, status:st,
      prioriteit:['Hoog','Midden','Laag'][i%3],
      kwalificatie:['Heeft ervaring + eigen vervoer','Geen ervaring, wel gemotiveerd','Woont dichtbij, kan direct starten'][i%3],
      score: 40 + (i*7)%60,
      agent_notitie:'WhatsApp-agent: beschikbaar per direct, spreekt Nederlands en Engels.',
      antwoorden:{ervaring:i%2?'ja':'nee', vervoer:i%3?'auto':'ov', start:'per direct'},
      cv: i%4===0 ? {functie:v.functie, ervaringJaren:1+(i%5), skills:['inpakken','heftruck'], talen:['Pools','Engels']} : null,
      /* Elke 5e lead is bewust ouder (4 tot 12 dagen). Anders lag geen enkele
         demo-lead langer dan twee dagen op Nieuw en ging het signaal
         "dit blijft te lang liggen" in de demo nooit aan — precies het
         gedrag dat je wilt kunnen laten zien. */
      eigenaar: rnd(RECS,i),
      binnen_op:new Date(Date.now() - (i%5===0 ? (4+(i%9))*86400000 : i*5400000)).toISOString(),
      opvolgen_op: i%7===0 ? d(i%3) : null, kandidaat_id:'', notities:[]
    };
  });

  /* ── WhatsApp-botleads ─────────────────────────────────────────
     De bot schrijft straks rechtstreeks in crm_leads. Deze zes kaarten zijn
     de uitkomsten die dat kan opleveren, zodat elke schermtoestand vóór de
     livegang te zien is in plaats van pas bij de eerste echte lead:
       - gekwalificeerd (bot1/bot2) → antwoorden, score, cv_url gevuld
       - herbruikbaar (bot3)        → goed persoon, verkeerde vacature
       - afgevallen (bot4)          → reden staat in de kwalificatie
       - vangnet (bot5)             → reageerde nooit op WhatsApp; alleen de
         ruwe Meta-gegevens, dus géén antwoorden en géén notitie — precies zo
         moet hij tóch als openstaand werk bij een AM in beeld staan
       - dubbel (bot6)              → zelfde nummer als een bestaande lead,
         zodat de paarse chip "2× in de lijst" aangaat (recruitment.js)
     `antwoorden` is een object met de letterlijke WhatsApp-vragen als sleutel:
     zo levert de bot het aan en zo toont de leadkaart het. `cv_url` is een
     link (SharePoint), geen geparsed cv — de bot parseert niets. `form_id`
     komt mee uit het Meta-leadformulier; de app leest het (nog) nergens,
     maar het hoort bij wat de bot wegschrijft en moet dus meelopen. */
  const BOT = [
    { id:'bot1', naam:'Dennis van der Laan', telefoon:'06 2456 7811', email:'',
      woonplaats:'Gouda', bron:'Meta', campagne:'Operators Zoetermeer – aug',
      form_id:'meta-form-8842', vacature_id:'Good Life Foods::Operator',
      klant:'Good Life Foods', functie:'Operator',
      status:'Nieuw', prioriteit:'Hoog', score:85,
      kwalificatie:'Qualified — auto, direct beschikbaar',
      agent_notitie:'WhatsApp-agent: 4 jaar ervaring als operator in de voedingsmiddelenindustrie, 3-ploegen is geen bezwaar. Wil teruggebeld worden, het liefst vanavond na 19:00.',
      antwoorden:{'Woonplaats':'Gouda','Vervoer':'auto','Ploegen':'3-ploegen is prima','Beschikbaar':'per direct','Taal':'NL'},
      cv_url:'https://ploeggenoten.sharepoint.com/sites/recruitment/cv/dennis-van-der-laan.pdf',
      eigenaar:'Tjerk',
      binnen_op:new Date(Date.now() - 2*3600000).toISOString(),
      opvolgen_op:null, kandidaat_id:'', notities:[] },
    { id:'bot2', naam:'Kimberly Verhoeven', telefoon:'06 2456 7812', email:'',
      woonplaats:'Leiden', bron:'Meta', campagne:'Magazijn Rijnsburg – aug',
      form_id:'meta-form-8851', vacature_id:'Whisk Food::Magazijnmedewerker',
      klant:'Whisk Food', functie:'Magazijnmedewerker',
      status:'Nieuw', prioriteit:'Hoog', score:72,
      kwalificatie:'Qualified — ov (Leiden–Rijnsburg is te doen), beschikbaar per 1 september',
      agent_notitie:'WhatsApp-agent: 2 jaar magazijnervaring bij een groothandel, heeft nog een opzegtermijn van twee weken. Reist met ov; de busverbinding Leiden–Rijnsburg maakt dat haalbaar.',
      antwoorden:{'Woonplaats':'Leiden','Vervoer':'ov','Ploegen':'liever dagdienst','Beschikbaar':'per 1 september','Taal':'NL'},
      cv_url:'',
      eigenaar:'Rajesh',
      binnen_op:new Date(Date.now() - 5*3600000).toISOString(),
      opvolgen_op:null, kandidaat_id:'', notities:[] },
    { id:'bot3', naam:'Ruben Slootweg', telefoon:'06 2456 7813', email:'',
      woonplaats:'Waddinxveen', bron:'Meta', campagne:'Procesoperators – aug',
      form_id:'meta-form-8863', vacature_id:'Burg Siroop::Procesoperator',
      klant:'Burg Siroop', functie:'Procesoperator',
      status:'Potentieel — andere vacature', prioriteit:'Midden', score:64,
      kwalificatie:'Goed profiel, maar Waddinxveen–Zaandam is te ver — bewaren voor productiewerk rond Gouda/Bodegraven',
      agent_notitie:'WhatsApp-agent: procesoperator met VAPRO A, maar wil maximaal een halfuur reizen en Zaandam valt daarbuiten. Nadrukkelijk wél interesse in werk dichter bij huis.',
      antwoorden:{'Woonplaats':'Waddinxveen','Vervoer':'auto','Ploegen':'2-ploegen','Beschikbaar':'in overleg','Taal':'NL'},
      cv_url:'',
      eigenaar:'Tjeerd',
      binnen_op:new Date(Date.now() - 26*3600000).toISOString(),
      opvolgen_op:null, kandidaat_id:'', notities:[] },
    { id:'bot4', naam:'Priscilla de Groot', telefoon:'06 2456 7814', email:'',
      woonplaats:'Zoetermeer', bron:'Meta', campagne:'Heftruck Bodegraven – aug',
      form_id:'meta-form-8842', vacature_id:'Starcuisine::Heftruckchauffeur',
      klant:'Starcuisine', functie:'Heftruckchauffeur',
      status:'Niet geschikt', prioriteit:'Laag', score:31,
      kwalificatie:'Afgewezen — geen heftruckcertificaat en wil niet in ploegen; beide zijn harde eisen van de klant',
      agent_notitie:'WhatsApp-agent: geen certificaat en niet bereid dat te halen, zoekt uitsluitend dagdienst. Netjes afgesloten met een bedankje.',
      antwoorden:{'Woonplaats':'Zoetermeer','Vervoer':'auto','Certificaat':'nee','Ploegen':'alleen dagdienst','Beschikbaar':'per direct','Taal':'NL'},
      cv_url:'',
      eigenaar:'Tjeerd',
      binnen_op:new Date(Date.now() - 30*3600000).toISOString(),
      opvolgen_op:null, kandidaat_id:'', notities:[] },
    /* Vangnet: klikte op de Meta-advertentie maar reageerde nooit in
       WhatsApp. De bot heeft dus niets om te scoren of samen te vatten —
       prioriteit leeg, geen antwoorden, geen notitie. Zo is te controleren
       dat zo iemand kaal maar zichtbaar op 'Nieuw' blijft staan in plaats
       van stilletjes te verdwijnen. */
    { id:'bot5', naam:'Wesley Vink', telefoon:'06 2456 7815', email:'',
      woonplaats:'', bron:'Meta', campagne:'Operators Zoetermeer – aug',
      form_id:'meta-form-8842', vacature_id:'Good Life Foods::Operator',
      klant:'Good Life Foods', functie:'Operator',
      status:'Nieuw', prioriteit:'', score:null,
      kwalificatie:'', agent_notitie:'', antwoorden:null, cv_url:'',
      eigenaar:'Tjeerd',
      binnen_op:new Date(Date.now() - 20*3600000).toISOString(),
      opvolgen_op:null, kandidaat_id:'', notities:[] }
  ];
  /* Dubbele sollicitatie: dezelfde persoon reageert op een tweede campagne.
     Naam en nummer komen bewust uit LEADS[2] in plaats van hardgecodeerd —
     de namen hierboven worden berekend, en een kopie die stilletjes uit de
     pas loopt zou de dubbeldetectie juist NIET laten afgaan. Nummer gelijk
     is genoeg (CRM.telSleutel), zelfde naam maakt de demo geloofwaardig. */
  BOT.push({ id:'bot6', naam:LEADS[2].naam, telefoon:LEADS[2].telefoon, email:'',
    woonplaats:LEADS[2].woonplaats, bron:'Meta', campagne:'Inpak Bodegraven – aug',
    form_id:'meta-form-8877', vacature_id:'Van Vliet Zoetwaren::Inpakmedewerker',
    klant:'Van Vliet Zoetwaren', functie:'Inpakmedewerker',
    status:'Nieuw', prioriteit:'Midden', score:58,
    kwalificatie:'Qualified — reageerde eerder deze maand ook al op een andere campagne',
    agent_notitie:'WhatsApp-agent: solliciteerde deze maand op twee campagnes; dat is een sterk vertreksignaal. Antwoorden komen overeen met de eerdere aanmelding.',
    antwoorden:{'Woonplaats':LEADS[2].woonplaats,'Vervoer':'auto','Ploegen':'2-ploegen','Beschikbaar':'per direct','Taal':'NL'},
    cv_url:'', eigenaar:LEADS[2].eigenaar,
    binnen_op:new Date(Date.now() - 3600000).toISOString(),
    opvolgen_op:null, kandidaat_id:'', notities:[] });
  LEADS.push(...BOT);

  const ACTS = [];
  KLANTEN.slice(0,14).forEach((k,i)=>{
    ['bel','mail','gesprek','notitie'].slice(0, 1+(i%4)).forEach((s,j)=>ACTS.push({
      id:'a'+i+'_'+j, entiteit:'klant', ref:k.naam, soort:s,
      tekst:{bel:'Gebeld met de bedrijfsleider over de openstaande vacatures.',mail:'Voorstel met tarieven gestuurd.',gesprek:'Kennismaking op locatie geweest, goede klik.',notitie:'Werkt nu met twee andere bureaus, wil consolideren.'}[s],
      door:rnd(RECS,i), op:new Date(Date.now()-(i*3+j)*86400000).toISOString()
    }));
  });
  CANDS.slice(0,20).forEach((c,i)=>ACTS.push({
    id:'ac'+i, entiteit:'kandidaat', ref:c.id, soort:i%2?'bel':'whatsapp',
    tekst: i%2?'Gebeld voor de intake, gaat door.':'Appje gestuurd met de locatiegegevens.',
    door:c.rec, op:new Date(Date.now()-i*43200000).toISOString()
  }));

  const TAKEN = [
    {id:'t1',tekst:'Koomstra bellen over tarief',datum:d(0),klaar:false,entiteit:'klant',ref:'Koomstra & Co',voor:'Tjeerd',door:'Tjeerd',prioriteit:'Hoog'},
    {id:'t2',tekst:'SWO Kontent Structures nabellen',datum:d(0),klaar:false,entiteit:'klant',ref:'Kontent Structures',voor:'Tjeerd',door:'Tjeerd',prioriteit:''},
    {id:'t3',tekst:'Meeloopdag Whisk voorbereiden',datum:d(1),klaar:false,entiteit:'klant',ref:'Whisk Food',voor:'Tjerk',door:'Tjeerd',prioriteit:''},
    {id:'t4',tekst:'Nazorg bellen dag 14',datum:d(-2),klaar:false,entiteit:'kandidaat',ref:'demo9',voor:'Tjeerd',door:'Tjeerd',prioriteit:'Hoog'},
    {id:'t5',tekst:'Vacaturetekst Lasser afmaken',datum:d(2),klaar:false,entiteit:'',ref:'',voor:'Tjeerd',door:'Tjeerd',prioriteit:''},
    /* Door de bot aangemaakt, niet door een collega: `door` is de agent zelf.
       Zo is te zien hoe een terugbelverzoek uit WhatsApp bij de juiste AM in
       de takenlijst landt en via entiteit 'lead' naar de leadkaart doorklikt
       (dashboard.js stuurt dat naar de recruitmentmodule). */
    {id:'t6',tekst:'Terugbellen Dennis van der Laan — voorkeur: vanavond na 19:00',datum:d(0),klaar:false,entiteit:'lead',ref:'bot1',voor:'Tjerk',door:'WhatsApp-agent',prioriteit:'Hoog'}
  ];

  const KANSEN = [
    {id:'k1',klant:'Koomstra & Co',titel:'2 lassers Q3',functie:'Lasser',aantal:2,waarde:17400,kans_pct:60,fase:'Onderhandeling',bron:'LinkedIn',eigenaar:'Tjeerd',sluit_datum:d(21),status:'open',contactpersoon:'R. Koomstra'},
    {id:'k2',klant:'MBS Groep',titel:'Servicemonteurs',functie:'Monteur',aantal:3,waarde:26000,kans_pct:40,fase:'Voorstel gedaan',bron:'Netwerk',eigenaar:'Tjeerd',sluit_datum:d(35),status:'open',contactpersoon:'J. de Bruin'},
    {id:'k3',klant:'Tegelhuis Barendrecht',titel:'Magazijn opschalen',functie:'Magazijnmedewerker',aantal:4,waarde:21000,kans_pct:30,fase:'Voorstel gedaan',bron:'Inbound',eigenaar:'Tjerk',sluit_datum:d(45),status:'open',contactpersoon:'M. Vermeer'},
    {id:'k4',klant:'SK Tes',titel:'Productie 2e ploeg',functie:'Productiemedewerker',aantal:5,waarde:29000,kans_pct:70,fase:'SWO gestuurd',bron:'Referral',eigenaar:'Tjeerd',sluit_datum:d(14),status:'open',contactpersoon:'S. Kramer'}
  ];

  const CONTACTEN = KLANTEN.slice(0,12).map((k,i)=>({
    id:'ct'+i, klant:k.naam, naam:['Rob Koomstra','Jeroen de Bruin','Marieke Vermeer','Sander Kramer','Peter Bos','Linda de Wit'][i%6],
    functie:['Bedrijfsleider','HR-manager','Operationeel manager','Productieleider'][i%4],
    telefoon:'06 2345 67'+(10+i), email:'contact'+i+'@bedrijf.nl', hoofd:true, note:''
  }));

  const MELDINGEN = [
    {id:'m1', voor: alsAdmin?'Tjeerd':'Bryan', van:'Tjerk', soort:'taak',
     tekst:'Tjerk heeft je een taak gegeven: "SWO Kontent nabellen vóór vrijdag"', entiteit:'taak', ref:'t2',
     gelezen:false, created_at:new Date(Date.now()-3600000).toISOString()},
    {id:'m2', voor: alsAdmin?'Tjeerd':'Bryan', van:'Rajesh', soort:'tag',
     tekst:'Rajesh noemde je: "@'+(alsAdmin?'Tjeerd':'Bryan')+' kun jij het tarief van Koomstra checken?"',
     entiteit:'klant', ref:'Koomstra & Co', gelezen:false, created_at:new Date(Date.now()-7200000).toISOString()}
  ];

  /* ── Data injecteren en auth overslaan ── */
  window.addEventListener('DOMContentLoaded', async () => {
    CRM.user = {id:'demo-user', email: alsAdmin ? 'tjeerd@ploeggenoten.nl' : 'bryan@ploeggenoten.nl'};
    CRM.profile = {id:'demo-user', naam: alsAdmin?'Tjeerd':'Bryan', rol: alsAdmin?'admin':'user'};
    CRM.load = async () => CRM.state;      // geen netwerkverkeer in demo
    CRM.herlaad = async () => CRM.render();
    CRM.logActiviteit = async (entiteit, ref, soort, tekst, extra={}) => {
      const r = {id:CRM.uid(),entiteit,ref:String(ref),soort,tekst,door:CRM.me(),op:new Date().toISOString(),extra};
      CRM.state.activiteiten.unshift(r); return r;
    };
    Object.assign(CRM.state, {
      cands:CANDS, clients:KLANTEN, vacs:VACS, leads:LEADS, activiteiten:ACTS,
      taken:TAKEN, documenten:[], kansen:KANSEN, contacten:CONTACTEN, meldingen:MELDINGEN,
      ooSessions:OO,
      /* Commerciële afspraken per klant. Zonder deze lijst geeft CRM.fee overal
         `fee: null` en blijft het bedrag op de kandidaatkaart, de klantkaart en
         Performance in de demo leeg — terwijl dat juist het cijfer is waar het
         om draait. Percentages als HEEL getal (23 = 23%), zoals crm_afspraken. */
      afspraken: KLANTEN.slice(0, 8).map((k, i) => ({
        id:'afs'+i, klant:k.naam, soort:'ws',
        fee_regels:[], fee_standaard:[23,22,25,20,23,24,22,25][i%8],
        grondslag:{maanden:12, vt_pct:8, eju:0, toeslag:true, overig:false},
        betaaltermijn:30, factuurmoment:'contract',
        garantie_mnd:2, garantie_soort:'vervanging',
        ingang:'2026-01-01', actief:true, door:'Tjeerd'
      })),
      /* Bryan hoort erbij: ?demo=team logt als hem in. Zonder profiel bleef
   "Mijn klanten" altijd leeg, stond hij niet in de keuzelijst van het
   taakvenster en toonde "Jouw maand" per definitie 0 — precies de rol
   die het meest getest moet worden was niet realistisch te doorlopen. */
      profiles:[...RECS, 'Bryan'].map((n,i)=>({id:'p'+i,naam:n,
        rol:i===0?'admin':'user', functie:n==='Bryan'?'marketeer':'am'})),
      /* Bewust de sleutel die het OUDE BORD wegschrijft ('__default', niet
         '__default__'). Zo loopt de demo over dezelfde regel als productie en
         zou een leesfout hier meteen opvallen. */
      targets:[{maand:mnd,aantal:8},{maand:'__default',aantal:10}], _loaded:true, _demo:true
    });

    document.getElementById('loginscreen').style.display='none';
    document.getElementById('app').classList.add('on');
    document.getElementById('whoname').textContent = CRM.profile.naam;
    document.getElementById('whorol').textContent  = (alsAdmin?'Eigenaar':'Teamlid') + ' · DEMO';
    document.getElementById('whoava').textContent  = CRM.initialen(CRM.profile.naam);

    // Nav opbouwen (zelfde route als na echte login)
    const ev = new Event('crm-demo-ready'); window.dispatchEvent(ev);
    CRM._bouwNav?.();
    const hash = (location.hash||'').replace('#','').split('/');
    CRM.ga(CRM.modules[hash[0]] ? hash[0] : 'dashboard', hash[1]?{id:decodeURIComponent(hash[1])}:{});
    CRM.toast('Demo-modus — testdata, database wordt niet aangeraakt');
  });
})();
