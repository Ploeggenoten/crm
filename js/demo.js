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
  const mnd = vandaag.toISOString().slice(0,7);

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
  ].map(([klant,functie,locatie,aantal,sal_min,sal_max]) => ({
    id:klant+'::'+functie, klant, functie, locatie, aantal, sal_min, sal_max,
    type:'W&S', status:'Open', eigenaar:'Tjeerd', aangemaakt:d(-30), omschrijving:''
  }));

  const VN = ['Marek','Ionut','Kevin','Alphonse','Michal','Sven','Alain','Rico','Lorenzo','Anna','Soufiane','Henri','Adam','Piotr','Daniel','Youssef','Bogdan','Elias','Tomasz','Karol','Nadia','Fatima','Ahmed','Radu','Viktor'];
  const AN = ['Nowak','Popescu','de Vries','Mbeki','Ostrowski','van Katwijk','Jansen','Silva','Costa','Jarosz','El Amrani','Dupont','Kowalski','Zielinski','Bakker','Haddad','Ionescu','Petrov','Wozniak','Nowicki','Ben Ali','Said','Hassan','Munteanu','Ivanov'];
  const PL = ['Rotterdam','Den Haag','Gouda','Alphen a/d Rijn','Zoetermeer','Leiden','Bodegraven','Waddinxveen','Delft','Katwijk','Schiedam','Vlaardingen'];
  const FASEN = ['Voorselectie','Voorgesteld','O&O sessie','Eerste gesprek','Tweede gesprek','Meeloopdag','In de wacht','Offer','Contract ondertekenen','Contract getekend','Gestart','Afgevallen','Gestopt'];
  const RECS = ['Tjeerd','Tjerk','Rajesh'];
  const rnd = (a,i) => a[i % a.length];

  const CANDS = Array.from({length:64}, (_,i) => {
    const fase = i<40 ? FASEN[i % 11] : (i<54 ? 'Afgevallen' : 'Gestopt');
    const v = VACS[i % VACS.length];
    const geplaatst = ['Contract getekend','Gestart'].includes(fase) ? d(-(i%25)) : (fase==='Gestopt'? d(-90-i) : '');
    return {
      id:'demo'+i, naam:rnd(VN,i)+' '+rnd(AN,i*3+1), klant:v.klant, functie:v.functie,
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
      reden:'', cv: i%3===0 ? {functie:v.functie, ervaringJaren:2+(i%6), skills:['heftruck','VCA','productie'], talen:['Nederlands','Engels']} : null
    };
  });

  const LEADS = Array.from({length:38}, (_,i) => {
    const v = VACS[i % VACS.length];
    const st = ['Nieuw','Nieuw','Nieuw','Gebeld — geen gehoor','Potentieel','Potentieel','Geen interesse','Intake gepland','Potentieel — andere vacature','Niet geschikt'][i%10];
    return {
      id:'lead'+i, naam:rnd(VN,i*5)+' '+rnd(AN,i*7), telefoon:'06 8765 43'+(10+i%80),
      email:'', woonplaats:rnd(PL,i*3), bron:rnd(['Meta','Indeed','WhatsApp'],i), campagne:'Productie NL – juli',
      vacature_id:v.id, klant:v.klant, functie:v.functie, status:st,
      prioriteit:['Hoog','Midden','Laag'][i%3],
      kwalificatie:['Heeft ervaring + eigen vervoer','Geen ervaring, wel gemotiveerd','Woont dichtbij, kan direct starten'][i%3],
      score: 40 + (i*7)%60,
      agent_notitie:'WhatsApp-agent: beschikbaar per direct, spreekt Nederlands en Engels.',
      antwoorden:{ervaring:i%2?'ja':'nee', vervoer:i%3?'auto':'ov', start:'per direct'},
      cv: i%4===0 ? {functie:v.functie, ervaringJaren:1+(i%5), skills:['inpakken','heftruck'], talen:['Pools','Engels']} : null,
      eigenaar: rnd(RECS,i), binnen_op:new Date(Date.now()-i*5400000).toISOString(),
      opvolgen_op: i%7===0 ? d(i%3) : null, kandidaat_id:'', notities:[]
    };
  });

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
    {id:'t5',tekst:'Vacaturetekst Lasser afmaken',datum:d(2),klaar:false,entiteit:'',ref:'',voor:'Tjeerd',door:'Tjeerd',prioriteit:''}
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
      taken:TAKEN, documenten:[], kansen:KANSEN, contacten:CONTACTEN,
      profiles:RECS.map((n,i)=>({id:'p'+i,naam:n,rol:i===0?'admin':'user'})),
      targets:[{maand:mnd,aantal:8},{maand:'__default__',aantal:8}], _loaded:true, _demo:true
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
