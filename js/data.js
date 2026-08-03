/* ═══════════════════════════════════════════════════════════════
   PLOEGGENOTEN CRM — GEDEELDE DOMEINLOGICA
   Constanten en berekeningen die meerdere modules gebruiken.
   Één plek, zodat fases en kleuren overal identiek zijn.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Twee pijplijnen, één overdrachtspunt ──────────────────────
   Tot 31 juli 2026 was er één lange keten: leads in een tabel, en daarna
   één bord dat begon bij Intake. Dat liep vast op twee dingen. Er komen
   ruwweg 4.400 leads per maand binnen en er worden er ~30 geplaatst, dus
   die twee horen niet op hetzelfde bord. En de stappen ertussen — cv
   opvragen, cv binnen, videocall inplannen — bestonden nergens, waardoor
   iemand daar weken kon blijven hangen zonder dat het opviel.

   Sindsdien:

   RECRUITMENTPIJPLIJN — van binnenkomst tot en met de intake. Werkt op
   crm_leads; de laatste stap maakt er een kandidaat van. Hoog volume,
   draait om snelheid: alles wat op Nieuw staat moet weg.

   KLANTTRAJECTEN — vanaf het moment dat we iemand bij een klant
   voorstellen. Werkt op candidates. Laag volume, draait om diepte.

   Het bord begint daarom bij 'Voorgesteld' en niet meer bij 'Intake':
   wie erop staat is compleet — kaart, cv, intake en videocall gehad.  */
CRM.PHASES = [
  {k:'Voorgesteld',c:'#5b8bbf'},{k:'O&O sessie',c:'#9575b8'},
  {k:'Eerste gesprek',c:'#5a9bd4'},{k:'Tweede gesprek',c:'#4178b0'},{k:'Meeloopdag',c:'#d9a441'},
  {k:'In de wacht',c:'#4a9d9d'},{k:'Offer',c:'#d97941'},{k:'Contract ondertekenen',c:'#6a9e3f'},
  {k:'Contract getekend',c:'#3d9968'},{k:'Gestart',c:'#3d9968'},
  {k:'Afgevallen',c:'#8a8f7a'},{k:'Gestopt',c:'#c0392b'}
];
CRM.PLACED = ['Contract getekend','Gestart'];
CRM.DONE   = ['Contract getekend','Gestart','Afgevallen','Gestopt'];

/* ─── Fase-normalisatie (oude waarden blijven werken) ───────────
   De eerste fase heette tot 30 jul 2026 'Voorselectie' en heet nu
   'Intake' — de screeningsstap is geschrapt, je zet meteen de volledige
   kandidatenkaart op en plant van daaruit de videocall.
   In productie staan nog rijen op de oude waarde; de migratie
   (supabase/migratie-intake.sql) draait pas later. Daarom loopt ELKE
   vergelijking en ELKE weergave van een fase via deze helpers. Zo valt
   een oude rij nergens uit beeld en staan er geen losse
   `|| fase === 'Voorselectie'`-controles door de code.
   Nieuwe fase-hernoemingen: alleen hier een regel bijzetten.        */
CRM.FASE_ALIAS = {'Voorselectie':'Intake'};
CRM.faseNorm = f => { const s = String(f==null?'':f); return CRM.FASE_ALIAS[s] || s; };
/* Twee fases gelijk? (allebei genormaliseerd) */
CRM.faseIs = (a, b) => CRM.faseNorm(a) === CRM.faseNorm(b);
/* Zit deze fase in de lijst? (vervanger van `lijst.includes(c.fase)`) */
CRM.faseIn = (f, lijst) => { const x = CRM.faseNorm(f); return (lijst||[]).some(d => CRM.faseNorm(d) === x); };

/* 'Intake' is geen bordfase meer, maar bestaat wél nog als waarde: het is
   de laatste stap van de recruitmentpijplijn. Kleur en label moeten
   blijven werken, anders wordt zo'n kaart grijs en naamloos op elk scherm
   dat hem toevallig toont. */
/* ─── Instroom: de weg vóór de klant ─────────────────────────────
   Deze statussen zaten alleen op de lead in Recruitment. Zodra iemand een
   kandidaatkaart kreeg — met de hand, of doordat er een cv werd ingelezen —
   waren ze weg en stond de kaart meteen op 'Intake', wat het systeem leest
   als "klaar om voor te stellen". Terwijl er dan nog geen videocall was
   geweest.

   Tjeerd, 3 aug 2026: "Tjerk heeft het cv al van Goncalo Oliveira,
   automatisch gaat hij naar klaar om voor te stellen. Dit wil ik niet. De AM
   moet vanuit de kandidatenkaart ook de fases binnen recruitment kunnen
   aanpassen."

   Dezelfde namen en kleuren als CRM.LEAD_STATUS, zodat een lead en een
   kandidaat over hetzelfde ding hetzelfde woord gebruiken. Ze staan bewust
   NIET in CRM.PHASES: faseIdx blijft -1 en dus komt niemand met een
   instroomstatus op het bord Klanttrajecten. Dat bord begint bij Voorgesteld
   en dat blijft zo. */
CRM.INSTROOM   = [
  {k:'Nieuw',                c:'#5b8bbf'},
  {k:'Gebeld — geen gehoor', c:'#9aa3b2'},
  {k:'Potentieel',           c:'#d9a441'},
  {k:'CV opgevraagd',        c:'#c78a3f'},
  {k:'CV binnen',            c:'#b08948'},
  {k:'Videocall gepland',    c:'#4178b0'},
  {k:'Videocall gehad',      c:'#3d9968'},
  {k:'Intake',               c:'#9aa3b2'}
];
/* VOOR_BORD is wat er ná de instroom komt maar vóór het bord: de laatste
   halte. Blijft bestaan omdat het bord en de kandidatenlijst hem gebruiken. */
CRM.VOOR_BORD  = [{k:'Intake', c:'#9aa3b2'}];
CRM.ALLE_FASES = CRM.INSTROOM.concat(CRM.PHASES);
/* Zit deze kandidaat nog vóór de klant? */
CRM.isInstroom = f => CRM.INSTROOM.some(p => p.k === CRM.faseNorm(f));

CRM.faseKleur = f => (CRM.ALLE_FASES.find(p=>p.k===CRM.faseNorm(f))||{}).c || '#8a927c';
/* Positie ÓP het bord. -1 betekent "nog niet voorgesteld" — dat geldt voor
   Intake en voor los geïmporteerde kandidaten zonder fase. */
CRM.faseIdx   = f => { const x = CRM.faseNorm(f); return CRM.PHASES.findIndex(p=>p.k===x); };

/* Klaar om voor te stellen: kaart bestaat, intake is gehad, maar er is nog
   geen klant aan gekoppeld. Dit is het getal waar Tjeerd op stuurt — "hoeveel
   potentiële kandidaten hebben we nou" — en het stond tot nu toe nergens. */
/* Klaar om voor te stellen: de intake is gehad en er hangt nog geen klant
   aan. Let op de tweede tak: een vastgelegde intake telt óók als de fase
   leeg is (de import uit het oude ATS), maar NIET als de kaart nog ergens in
   de instroom staat. Anders staat iemand op 'Videocall gepland' toch als
   klaar in de lijst, en dat is precies wat Tjeerd niet wil. */
CRM.klaarOmVoorTeStellen = c =>
  !!c && !CRM.faseIn(c.fase, CRM.DONE) && CRM.faseIdx(c.fase) === -1
      && (CRM.faseIs(c.fase, 'Intake') || (!!c.intake && !CRM.isInstroom(c.fase)));

CRM.AFVAL_CATS = {
  niet_gekwalificeerd:['Taal','Ervaring/skills','Motivatie','No-show','Fysiek/gezondheid','Klant wees af','Meeloopdag niet goed','Anders'],
  offer_afgewezen:['Salaris te laag','Ander aanbod geaccepteerd','Reistijd/afstand','Rooster/ploegen','Blijft bij huidige werkgever','Niets meer gehoord','Anders']
};
CRM.STOP_CATS = {
  kandidaat:['Ander werk gevonden','Werk beviel niet','Fysiek te zwaar','Reistijd/vervoer','Privéomstandigheden','Verdwenen/no-show','Anders'],
  klant:['Functioneren onvoldoende','Te weinig werk/krimp','Einde project/seizoen','Conflict/houding','Anders'],
  anders:['Anders']
};

/* ─── Sales-pijplijn (klantzijde) ───────────────────────────────
   Volgorde zoals Tjeerd hem voert. 'Project uitgesteld' en
   'Afgerond' zijn eindfases, geen doorstroom.                    */
CRM.SALES_FASES = [
  {k:'Lead',                  c:'#9aa3b2', hint:'Bedrijf in beeld, nog geen contact'},
  {k:'Suspect',               c:'#7f93b8', hint:'Eerste contact gelegd'},
  {k:'Prospect',              c:'#5b8bbf', hint:'Interesse bevestigd'},
  {k:'In afwachting kennismaking', c:'#4a9d9d', hint:'Wacht op reactie voor afspraak'},
  {k:'Gesprek ingepland',     c:'#5a9bd4', hint:'Kennismaking staat in de agenda'},
  {k:'Voorstel gedaan',       c:'#d9a441', hint:'Aanbod/plan van aanpak verstuurd'},
  {k:'SWO gestuurd',          c:'#d97941', hint:'Samenwerkingsovereenkomst verstuurd'},
  {k:'Onderhandeling',        c:'#c98a2e', hint:'Voorwaarden en tarief bespreken'},
  {k:'Afgerond',              c:'#3d9968', hint:'Getekend — actieve klant'},
  {k:'Project uitgesteld',    c:'#8a8f7a', hint:'Later opnieuw benaderen'}
];
CRM.SALES_ACTIEF  = ['Lead','Suspect','Prospect','In afwachting kennismaking','Gesprek ingepland','Voorstel gedaan','SWO gestuurd','Onderhandeling'];
CRM.SALES_KLANT   = ['Afgerond'];
CRM.salesKleur = f => (CRM.SALES_FASES.find(p=>p.k===f)||{}).c || '#8a927c';

/* ─── Kandidaat-leads (vóór de pijplijn) ────────────────────────
   Statussen die een AM aan een binnengekomen lead geeft.        */
/* De recruitmentpijplijn, in de volgorde waarin het werk gebeurt.
   'CV opgevraagd', 'CV binnen' en de twee videocall-stappen zijn er op
   31 juli 2026 bij gekomen: dat werk gebeurde altijd al, maar had geen
   status, dus je kon niet zien waar iemand bleef hangen.
   'Intake gepland' is vervallen — de videocall ís de intake.
   In productie stond crm_leads op nul rijen, dus hier hoefde niets
   gemigreerd te worden.                                              */
CRM.LEAD_STATUS = [
  {k:'Nieuw',                c:'#5b8bbf', ico:'✨'},
  {k:'Gebeld — geen gehoor', c:'#9aa3b2', ico:'📵'},
  {k:'Potentieel',           c:'#d9a441', ico:'⭐'},
  {k:'CV opgevraagd',        c:'#c78a3f', ico:'📄'},
  {k:'CV binnen',            c:'#b08948', ico:'📥'},
  {k:'Videocall gepland',    c:'#4178b0', ico:'📅'},
  {k:'Videocall gehad',      c:'#3d9968', ico:'🎥'},
  {k:'Doorgeschoten',        c:'#2f8f5b', ico:'→'},
  /* Eindstations, geen doorstroom. */
  {k:'Geen interesse',       c:'#8a8f7a', ico:'✕'},
  {k:'Niet geschikt',        c:'#a08a7a', ico:'⊘'},
  {k:'Potentieel — andere vacature', c:'#9575b8', ico:'🔀'}
];
/* Nog werk aan te doen. 'Potentieel — andere vacature' hoort hier bewust
   níét bij: die persoon is goed maar wacht op iets wat er nu niet is, en
   moet niet elke dag als openstaand werk op je scherm staan. */
CRM.LEAD_OPEN   = ['Nieuw','Gebeld — geen gehoor','Potentieel','CV opgevraagd',
                   'CV binnen','Videocall gepland','Videocall gehad'];
/* Waar een lead uiteindelijk terechtkomt: verder of afgevallen. */
CRM.LEAD_EIND   = ['Doorgeschoten','Geen interesse','Niet geschikt','Potentieel — andere vacature'];
CRM.leadKleur   = s => (CRM.LEAD_STATUS.find(x=>x.k===s)||{}).c || '#8a927c';
CRM.leadIco     = s => (CRM.LEAD_STATUS.find(x=>x.k===s)||{}).ico || '•';
CRM.LEAD_BRONNEN = ['Meta','Indeed','WhatsApp','Website','Referral','Handmatig','Anders'];

/* ─── Activiteitsoorten ─────────────────────────────────────── */
CRM.ACT_SOORTEN = {
  notitie:{ico:'📝', lbl:'Notitie'}, bel:{ico:'📞', lbl:'Gebeld'},
  mail:{ico:'✉️', lbl:'E-mail'},     whatsapp:{ico:'💬', lbl:'WhatsApp'},
  gesprek:{ico:'🤝', lbl:'Gesprek'}, bezoek:{ico:'🏭', lbl:'Bezoek'},
  taak:{ico:'✅', lbl:'Taak'},        fase:{ico:'↗', lbl:'Fasewissel'},
  doc:{ico:'📎', lbl:'Document'},     systeem:{ico:'⚙️', lbl:'Systeem'}
};

/* ─── Afgeleide data ────────────────────────────────────────── */
CRM.kandidaten = () => CRM.state.cands.map(CRM.rowToCand);
CRM.kandidaat  = id => { const r = CRM.state.cands.find(c=>String(c.id)===String(id)); return r?CRM.rowToCand(r):null; };
CRM.klant      = naam => CRM.state.clients.find(c => c.naam === naam) || null;
CRM.vacaturesVan = klant => CRM.state.vacs.filter(v => v.klant === klant);
CRM.kandidatenVan = klant => CRM.kandidaten().filter(c => c.klant === klant);

/* Klantnamen normaliseren (bord ↔ sales ↔ finance schrijven ze net anders). */
CRM.normKlant = s => String(s||'').toLowerCase().replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?)\b/g,'').replace(/[^a-z0-9]/g,'').trim();
CRM.zelfdeKlant = (a,b) => { const x=CRM.normKlant(a), y=CRM.normKlant(b); return !!x && !!y && (x===y || x.slice(0,8)===y.slice(0,8)); };

/* Actieve klanten = klanten met een lopende of geplaatste kandidaat, of
   handmatig als klant gemarkeerd in de clients-tabel. */
CRM.actieveKlanten = () => {
  const metWerk = new Set(CRM.kandidaten().filter(c=>!['Afgevallen','Gestopt'].includes(c.fase)).map(c=>c.klant));
  return CRM.state.clients.filter(c => metWerk.has(c.naam) || c.fase === 'Afgerond');
};

/* Plaatsingen deze maand — exact dezelfde definitie als het bord:
   netto = getekend deze maand − gestopt deze maand. */
CRM.plaatsingenMaand = (mk = CRM.todayISO().slice(0,7)) => {
  const cs = CRM.kandidaten();
  /* Twee regels van het bord die hier ontbraken en het netto-getal scheeftrokken:
     1. Een stop telt alleen als er ook écht getekend is. Zonder plaatsingsdatum
        is er geen plaatsing om vanaf te trekken — het bord eist `c.geplaatstOp`
        en waarschuwt daar zelfs voor in het uitvalformulier.
     2. Een gestopte VERVANGER telt niet nog eens af. Zijn voorganger is al als
        stop geteld; hem meetellen zou dezelfde plek twee keer aftrekken (het
        bord noemt dat op de kaart "inruiler gestopt · geen target-effect").
     Wie in DEZE maand tekende én weer stopte, telde daarnaast dubbel negatief:
     hij viel buiten 'getekend' (zijn fase is inmiddels Gestopt) maar wél binnen
     'gestopt', dus netto −1 terwijl de finance-app 0 zegt. Tekenen is een
     gebeurtenis die heeft plaatsgevonden; een latere stop maakt dat niet
     ongedaan. Daarom telt een Gestopt-kaart mee als getekend — maar met exact
     dezelfde uitzondering als hierboven, anders levert een vervanger die tekent
     en stopt een +1 op zonder bijbehorende −1. */
  const teltAlsStop = c => c.fase==='Gestopt' && !!c.geplaatstOp && !c.vervangt;
  const getekend = cs.filter(c => (c.geplaatstOp||'').slice(0,7)===mk &&
    (CRM.PLACED.includes(c.fase) || teltAlsStop(c)));
  const gestopt  = cs.filter(c => teltAlsStop(c) && (c.gestoptOp||'').slice(0,7)===mk);
  return {getekend, gestopt, netto: getekend.length - gestopt.length};
};
/* ─── Jaardoel ───────────────────────────────────────────────────
   Naast de maandtarget een doel voor het hele jaar: "tot 31 december naar
   75 plaatsingen". Wens Tjeerd, 31 jul 2026 — een maandtarget van 8 die
   elke maand op nul begint geeft geen gevoel van opbouw; een teller die
   het hele jaar doorloopt wél.

   Bewaard in dezelfde `targets`-tabel, met het JAARTAL als sleutel
   ('2026'), zodat er geen kolom of tabel bij hoefde. De maandsleutels zijn
   'JJJJ-MM' en de standaardsleutels beginnen met '__', dus die kunnen
   elkaar niet in de weg zitten.

   Geteld wordt GETEKEND, niet netto. Een stop van iemand die in maart
   begon hoort een jaarteller niet terug te draaien: het jaardoel gaat over
   hoeveel mensen je aan het werk hebt geholpen, niet over hoeveel er nu
   nog zitten. Netto blijft waar het thuishoort — in de maandcijfers en in
   Finance. */
CRM.JAAR_TARGET_STANDAARD = 75;

CRM.jaarTarget = (jaar = CRM.todayISO().slice(0,4)) => {
  const t = (CRM.state.targets || []).find(x => String(x.maand) === String(jaar));
  return t && t.aantal != null ? t.aantal : CRM.JAAR_TARGET_STANDAARD;
};

/* Alle plaatsingen van dit jaar, met de stand tot nu toe.
   Terug: {getekend, doel, gedaan, teGaan, dagenTeGaan, perWeekNodig, opSchema} */
CRM.plaatsingenJaar = (jaar = CRM.todayISO().slice(0,4)) => {
  const cs = CRM.kandidaten();
  const teltAlsStop = c => c.fase === 'Gestopt' && !!c.geplaatstOp && !c.vervangt;
  const getekend = cs.filter(c => String(c.geplaatstOp || '').slice(0,4) === String(jaar) &&
    (CRM.PLACED.includes(c.fase) || teltAlsStop(c)));

  const doel = CRM.jaarTarget(jaar);
  const gedaan = getekend.length;
  const teGaan = Math.max(0, doel - gedaan);

  /* Tot en met 31 december. Op 31 december zelf is er nog één dag te gaan,
     niet nul — anders deel je door nul en staat er Infinity op het scherm. */
  const vandaag = new Date(CRM.todayISO() + 'T12:00:00');
  const eind = new Date(Number(jaar), 11, 31, 12, 0, 0);
  const dagenTeGaan = Math.max(1, Math.round((eind - vandaag) / 86400000) + 1);
  const wekenTeGaan = dagenTeGaan / 7;

  /* Waar had je moeten staan als je het jaar gelijkmatig verdeelt? Dat is
     eerlijker dan alleen "x van 75": in januari is 6 van 75 prima en in
     november niet. */
  const start = new Date(Number(jaar), 0, 1, 12, 0, 0);
  const dagenInJaar = Math.round((new Date(Number(jaar)+1, 0, 1, 12) - start) / 86400000);
  const dagenVoorbij = Math.max(0, Math.round((vandaag - start) / 86400000));
  const verwacht = Math.round(doel * Math.min(1, dagenVoorbij / dagenInJaar));

  return {
    jaar: String(jaar), getekend, doel, gedaan, teGaan, verwacht,
    voorOfAchter: gedaan - verwacht,
    dagenTeGaan, perWeekNodig: teGaan ? Math.round((teGaan / wekenTeGaan) * 10) / 10 : 0,
    opSchema: gedaan >= verwacht,
    pct: doel ? Math.min(100, Math.round(gedaan / doel * 100)) : 0
  };
};

/* Het oude bord schrijft de standaardtarget weg onder de sleutel '__default',
   het CRM onder '__default__' (js/instellingen.js schrijft ze allebei). Wie zijn
   default ooit alleen op het bord heeft gezet, kreeg hier stilzwijgend de
   noodwaarde 8 te zien. Daarom lezen we beide sleutels. */
CRM.TARGET_DEFAULT_KEYS = ['__default__','__default'];
CRM.maandTarget = (mk = CRM.todayISO().slice(0,7)) => {
  const rijen = CRM.state.targets || [];
  const t = rijen.find(t => t.maand === mk)
         || CRM.TARGET_DEFAULT_KEYS.map(k => rijen.find(t => t.maand === k)).find(Boolean);
  return t && t.aantal != null ? t.aantal : 8;
};

/* Filter "mijn" — elke AM kijkt standaard naar zijn eigen klanten/leads. */
/* ─── Ontdubbelen op telefoonnummer ──────────────────────────────
   Het telefoonnummer is het énige veld dat deze mensen uniek maakt: er is
   geen e-mailadres, geen cv, en namen worden verschillend gespeld. De meeste
   ATS'en ontdubbelen op e-mail en zijn hier dus nutteloos.

   Zonder dit staat dezelfde persoon na drie campagnes drie keer in het
   systeem — en zie je niet dat hij al twee keer eerder reageerde. Dat laatste
   is precies het koopsignaal dat je zoekt: wie voor de derde keer belt, wil
   echt weg bij zijn huidige werkgever.

   Normaliseren is nodig omdat hetzelfde nummer op zes manieren binnenkomt:
   06 12345678, 0612345678, +31612345678, 0031 6 1234 5678. Alles wat geen
   cijfer is gaat eruit, en de Nederlandse landcode wordt teruggebracht tot
   een 0 zodat +31 6… en 06… hetzelfde nummer zijn. */
CRM.telSleutel = tel => {
  let s = String(tel || '').replace(/\D+/g, '');
  if(!s) return '';
  if(s.startsWith('0031')) s = '0' + s.slice(4);
  else if(s.startsWith('31') && s.length > 10) s = '0' + s.slice(2);
  if(!s.startsWith('0')) s = '0' + s;
  return s;
};
/* Wie heeft dit nummer al? Kijkt in kandidaten én leads, want dezelfde
   persoon kan in allebei staan. `negeer` is de id die je zelf aan het
   bewerken bent — anders vindt een kaart altijd zichzelf. */
CRM.zelfdeNummer = (tel, negeer) => {
  const k = CRM.telSleutel(tel);
  if(!k || k.length < 8) return [];        // te kort om iets over te zeggen
  const uit = [];
  (CRM.state.cands || []).forEach(c => {
    if(String(c.id) === String(negeer)) return;
    if(CRM.telSleutel(c.telefoon) === k) uit.push({soort:'kandidaat', id:c.id, naam:c.naam, fase:c.fase, klant:c.klant});
  });
  (CRM.state.leads || []).forEach(l => {
    if(String(l.id) === String(negeer)) return;
    if(CRM.telSleutel(l.telefoon) === k) uit.push({soort:'lead', id:l.id, naam:l.naam, status:l.status});
  });
  return uit;
};

CRM.isVanMij = obj => {
  const mij = CRM.me();
  return !mij || obj?.eigenaar === mij || obj?.rec === mij || obj?.am === mij;
};

/* ─── Reisafstand ────────────────────────────────────────────
   Coördinaten van de plaatsen waar wij werken, zodat het systeem kan
   uitleggen waaróm iemand bij een vacature past. Onbekende plaats ⇒ null;
   dan valt de score terug op naamvergelijking in plaats van te gokken. */
CRM.PLAATSEN = {
  'rotterdam':[51.924,4.478], 'denhaag':[52.078,4.288], 'sgravenhage':[52.078,4.288],
  'gouda':[52.011,4.711], 'alphena/drijn':[52.129,4.655], 'zoetermeer':[52.057,4.494],
  'leiden':[52.160,4.490], 'bodegraven':[52.081,4.749], 'waddinxveen':[52.045,4.653],
  'delft':[52.011,4.357], 'katwijk':[52.203,4.399], 'schiedam':[51.919,4.389],
  'vlaardingen':[51.912,4.341], 'rijnsburg':[52.190,4.443], 'zaandam':[52.439,4.826],
  'barendrecht':[51.855,4.535], 'nieuwkoop':[52.148,4.777], 'sliedrecht':[51.822,4.774],
  'bunnik':[52.065,5.199], 'nieuwvennep':[52.265,4.630], 'maasdijk':[51.981,4.196],
  'almere':[52.370,5.216], 'ijmuiden':[52.460,4.610], 'krimpena/dijssel':[51.917,4.593],
  'nunspeet':[52.378,5.784], 'bleiswijk':[52.019,4.531], 'utrecht':[52.090,5.121],
  'amsterdam':[52.370,4.895], 'dordrecht':[51.813,4.690], 'zwijndrecht':[51.817,4.633],
  'spijkenisse':[51.845,4.329], 'capellea/dijssel':[51.930,4.577], 'ridderkerk':[51.872,4.602],
  'hoofddorp':[52.303,4.689], 'amstelveen':[52.309,4.856], 'woerden':[52.086,4.884],
  'zeist':[52.088,5.233], 'rijswijk':[52.036,4.325], 'voorburg':[52.070,4.360],
  'naaldwijk':[51.994,4.208], 'pijnacker':[52.019,4.432], 'berkelenrodenrijs':[51.995,4.481],
  'boskoop':[52.075,4.653], 'zevenhuizen':[52.010,4.610], 'moordrecht':[51.985,4.663],
  'nieuwerkerka/dijssel':[51.975,4.615], 'papendrecht':[51.831,4.685], 'hendrikidoambacht':[51.843,4.640],
  'oudbeijerland':[51.826,4.412], 'maassluis':[51.923,4.253], 'delier':[51.968,4.253],
  'wateringen':[52.020,4.283], 'monster':[52.023,4.170], 'nootdorp':[52.040,4.400],
  'leidschendam':[52.086,4.400], 'wassenaar':[52.146,4.400], 'voorschoten':[52.128,4.446],
  'oegstgeest':[52.180,4.470], 'noordwijk':[52.240,4.443], 'sassenheim':[52.223,4.523],
  'lisse':[52.257,4.557], 'hillegom':[52.290,4.583], 'haarlem':[52.381,4.637],
  'alkmaar':[52.632,4.749], 'purmerend':[52.505,4.960], 'lelystad':[52.518,5.471],
  'amersfoort':[52.156,5.388], 'apeldoorn':[52.211,5.970], 'arnhem':[51.985,5.899],
  'nijmegen':[51.842,5.853], 'breda':[51.586,4.776], 'shertogenbosch':[51.697,5.304],
  'eindhoven':[51.441,5.470], 'tilburg':[51.560,5.091], 'gorinchem':[51.837,4.975],
  'vianen':[51.988,5.093], 'culemborg':[51.955,5.226], 'veenendaal':[52.028,5.554],
  /* Aangevuld 30 jul 2026 na de ATS-import: plaatsen die in de echte data
     voorkwamen maar hier ontbraken (kandidaten en klanten). */
  'hellevoetsluis':[51.832,4.135], 'soest':[52.174,5.291], 'aalsmeer':[52.263,4.749],
  'bergschenhoek':[51.994,4.494], 'leiderdorp':[52.161,4.539], 'drunen':[51.683,5.132],
  'sgravenzande':[51.999,4.163], 'hazerswoudedorp':[52.093,4.611], 'maasvlakterotterdam':[51.951,4.052],
  'mijdrecht':[52.207,4.866], 'leimuiden':[52.209,4.660], 'oudheusden':[51.712,5.100],
  'nieuwewetering':[52.199,4.632], 'oss':[51.765,5.518], 'berkelenschot':[51.581,5.150],
  'maarssen':[52.139,5.039], 'abbenbroek':[51.841,4.252], 'leerdam':[51.893,5.092],
  'zandvoort':[52.371,4.533], 'poeldijk':[52.010,4.212], 'rozenburg':[51.903,4.248],
  'voorhout':[52.224,4.485], 'vierpolders':[51.871,4.153], 'oostzaan':[52.432,4.873],
  'gouderak':[51.968,4.720], 'hoekvanholland':[51.979,4.132], 'nieuwerbrug':[52.092,4.786],
  'hoogvliet':[51.863,4.363], 'alblasserdam':[51.865,4.661], 'pernis':[51.888,4.391],
  'dongen':[51.626,4.939], 'nieuwetonge':[51.752,4.203], 'moerdijk':[51.700,4.610],
  'halsteren':[51.532,4.278], 'drachten':[53.107,6.099], 'oudenhoorn':[51.833,4.203],
  'werkendam':[51.809,4.897], 'zoeterwoude':[52.121,4.500], 'steenbergen':[51.588,4.318],
  'honselersdijk':[51.997,4.219], 'stellendam':[51.822,4.033], 'hulst':[51.280,4.052],
  'benthuizen':[52.071,4.528], 'moerkapelle':[52.021,4.578], 'opmeer':[52.708,4.950],
  'koudekerka/drijn':[52.121,4.598], 'warmond':[52.198,4.500], 'zaandijk':[52.463,4.809],
  'emst':[52.311,5.959], 'zevenhoven':[52.202,4.720],
  /* Aangevuld 30 jul 2026 na het doormeten van de kaart: plaatsen die in de
     data voorkomen maar nog geen coördinaat hadden. */
  'teraar':[52.209,4.716],     'schijndel':[51.620,5.435],
  'oirschot':[51.505,5.311],   'oosterhout':[51.645,4.860],
  'rijen':[51.588,4.936],      'spakenburg':[52.257,5.362],
  'beverwijk':[52.484,4.657],  'stolwijk':[51.965,4.766],
  'noorden':[52.166,4.813],    'waalwijk':[51.687,5.071],
  /* Veelvoorkomende schrijfwijzen uit de oude data — beter matchen dan
     stilzwijgend van de kaart vallen. */
  'alphen':[52.129,4.655], 'haag':[52.078,4.288], 'hague':[52.078,4.288],
  'sgravennage':[52.078,4.288], 'rijswik':[52.036,4.325], 'capelle':[51.930,4.577],
  /* Schrijfwijze "Alphen a.d. Rijn": plaatsSleutel() vertaalt alléén het
     voluit geschreven "aan de(n)" naar "a/d", dus punten-varianten komen hier
     als 'alphenadrijn' binnen. Eerder stonden hier 'alphenandenrijn' en
     'krimpenandenijssel' — sleutels die de functie nooit produceert. */
  'alphenadrijn':[52.129,4.655],     'krimpenadijssel':[51.917,4.593],
  'capelleadijssel':[51.930,4.577],  'nieuwerkerkadijssel':[51.975,4.615],
  'koudekerkadrijn':[52.121,4.598]
};
/* Schrijfwijzen die naar dezelfde plaats verwijzen. Zonder deze laag geeft
   CRM.afstandKm null voor "The Hague" of "Leidschenveen", en dan scoort
   CRM.matchScore die kandidaat structureel te laag — een stille rekenfout
   die overal doorwerkt waar we matchen. Stond eerst alleen in js/source.js,
   waardoor dat scherm plaatsen kon plaatsen die de rest van de app niet
   herkende: twee schermen, twee antwoorden over dezelfde persoon. */
CRM.PLAATS_ALIAS = {
  /* Engelse en verminkte schrijfwijzen */
  thehague:'denhaag', hague:'denhaag', sgravennage:'sgravenhage',
  flushing:'vlissingen', hookofholland:'hoekvanholland',
  thenetherlands:'', netherlands:'',   /* alleen een land, geen plaats */
  hellvoetsluis:'hellevoetsluis', denbosch:'shertogenbosch', shertogenbos:'shertogenbosch',
  /* Wijken en deelgemeenten: dezelfde gemeente, andere naam */
  leidschenveen:'denhaag', ypenburg:'denhaag', scheveningen:'denhaag',
  loosduinen:'denhaag', wateringseveld:'denhaag',
  /* "a.d." wordt door de opschoning hieronder niet omgezet naar "a/d" */
  krimpenadijssel:'krimpena/dijssel', capelleadijssel:'capellea/dijssel',
  nieuwerkerkadijssel:'nieuwerkerka/dijssel', alphenadrijn:'alphena/drijn',
  koudekerkadrijn:'koudekerka/drijn'
};
/* Landnamen die achter een plaats geplakt staan. Uit de import kwam veel in
   het Engels binnen ("Utrecht, Netherlands"), en de opschoning hieronder
   plakte dat aan elkaar tot "utrechtnetherlands" — onbekend, dus geen
   afstand, dus een structureel te lage matchscore. Zonder dat het ergens op
   het scherm te zien was: een kandidaat viel gewoon nooit boven komen
   drijven. */
const LANDEN = /^(the\s+)?(netherlands|nederland|holland|nl|dutch)$/;

/* Gememoïseerd: deze functie doet zeven stringbewerkingen en wordt bij elke
   afstandsmeting twee keer aangeroepen — en afstand meten gebeurt in lussen
   over honderden kandidaten × tientallen vacatures. Het aantal verschillende
   plaatsnamen in het bestand is een paar honderd, dus de cache blijft klein.
   (Zou CRM.PLAATS_ALIAS ooit tijdens het draaien wijzigen, dan moet de cache
   mee leeggegooid worden; op dit moment doet niets dat.) */
CRM.plaatsSleutel = (() => {
  const cache = new Map();
  const bereken = s => {
    let ruw = String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/\(.*?\)/g,' ');                      /* "(ZH)", "(gem. Westland)" */
    /* Alles achter de eerste komma is provincie of land, nooit de plaatsnaam
       zelf. "Krimpen a/d IJssel" heeft geen komma en blijft dus heel. */
    const delen = ruw.split(',').map(d => d.trim()).filter(Boolean);
    if(delen.length > 1){
      /* Achterste delen die een land zijn eraf; de rest is de plaats. */
      while(delen.length > 1 && LANDEN.test(delen[delen.length-1])) delen.pop();
      ruw = delen[0];
    }
    const k = ruw
      .replace(/^\s*\d{4}\s*[a-z]{0,2}\b/,'')         /* postcode ervoor */
      .replace(/^\s*gem(eente)?\.?\s+/,'')
      .replace(/\baan\s+de[nr]?\s+/g,'a/d ').replace(/[^a-z0-9/]/g,'');
    return CRM.PLAATS_ALIAS[k] || k;
  };
  return s => {
    const ruw = String(s == null ? '' : s);
    const uit = cache.get(ruw);
    if(uit !== undefined) return uit;
    const k = bereken(ruw);
    if(cache.size < 5000) cache.set(ruw, k);
    return k;
  };
})();
CRM.afstandKm = (a,b) => {
  const pa = CRM.PLAATSEN[CRM.plaatsSleutel(a)], pb = CRM.PLAATSEN[CRM.plaatsSleutel(b)];
  if(!pa || !pb) return null;
  const R = 6371, rad = d => d*Math.PI/180;
  const dLat = rad(pb[0]-pa[0]), dLon = rad(pb[1]-pa[1]);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(pa[0]))*Math.cos(rad(pb[0]))*Math.sin(dLon/2)**2;
  return Math.round(2*R*Math.asin(Math.sqrt(x)));
};

/* ═══════════════════════════════════════════════════════════════
   KANDIDAAT ↔ VACATURE
   ═══════════════════════════════════════════════════════════════
   Tot 31 juli 2026 rekende deze functie met drie dingen: overlap in
   functiewoorden (60), reisafstand (30) en ervaringsjaren (10). Dat gaf
   twee voorstellen die een recruiter meteen weggooit:

     · een kandidaat op 24 km, op de fiets, bij een klant in wisseldienst —
       met "86% match". Vervoer en ploegendienst zijn precies de twee dingen
       waar een plaatsing in productie en logistiek op klapt.
     · "Lasser · 40% match — zoekt productiemedewerker". Iedereen die in
       dezelfde plaats woont haalde ~40 punten en kwam daarmee boven de
       drempel van 30 die besteMatches hanteert, ook zonder één raakvlak.

   En er zat een rekenfout in: een lege woonplaats gaf +8 terwijl 60 km
   verderop 0 gaf. Kandidaten zónder woonplaats scoorden dus systematisch
   hóger dan bekende kandidaten die net te ver wonen — dat zijn er 55 van
   de 298 geïmporteerde kandidaten.

   DRIE REGELS
   1. Harde eisen zijn geen punten. Een verlopen VCA, geen nachtdienst
      willen of geen vervoer naar een industrieterrein is geen aftrek van
      tien punten maar een streep door de rekening. Die staan apart in
      `blokkers` en zetten een PLAFOND op de score — geblokkeerd mag nooit
      als 86% op het scherm komen. Blokkeren doen we niet: de kandidaat
      blijft zichtbaar mét de reden, zoals de app elders vraagt "Toch
      voorstellen zonder ingevulde intake?".
   2. Onbekend is niet hetzelfde als goed. Een leeg veld levert NUL punten
      voor dat onderdeel — nooit meer dan een ingevuld veld dat niet past —
      en komt in `onbekend`, zodat het scherm kan zeggen wat het niet weet.
   3. Uitlegbaar. `regel` verantwoordt de uitkomst in één zin.

   DEFENSIEF: de vacaturevelden ploegendienst/eisen/bereikbaarheid staan nog
   niet in elke database. Ontbreekt er een, dan gaat er niets stuk én doen we
   niet alsof de eis niet bestaat: het onderdeel levert nul punten op en de
   reden staat in `onbekend`.

   CRM.matchScore blijft een getal van 0–100 (vier modules rekenen ermee);
   CRM.match geeft hetzelfde antwoord mét de onderbouwing.               */
(function(){

CRM.MATCH_GEWICHT = Object.freeze({functie:45, afstand:25, ploegen:10, eisen:10, ervaring:5, salaris:5});
/* Plafonds. Het laagste dat van toepassing is wint. */
CRM.MATCH_PLAFOND = Object.freeze({
  blokker:35,          /* hier gaat het op stuk — nooit als goede match tonen */
  anderVak:25,         /* beide functies ingevuld, geen enkel raakvlak: onder
                          de drempel van besteMatches, dus weg uit de suggesties */
  functieOnbekend:40   /* we weten het belangrijkste niet */
});

/* Woorden uit een functietitel; alles van drie letters of korter is ruis. */
const woorden = s => String(s||'').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);

/* ─── Wat we kunnen herkennen ────────────────────────────────────
   Alleen eisen met een eenduidige naam. "Ervaring in de voedingsindustrie"
   staat er bewust NIET bij: dat kunnen we niet toetsen, en dan zeggen we
   dat liever dan te doen alsof. Alles wordt op kleine letters getoetst. */
const CERT_EISEN = [
  {k:'vca',        lbl:'VCA',                   pat:/\bv\.?\s?c\.?\s?a\.?\b|\bvcu\b/},
  {k:'heftruck',   lbl:'heftruckcertificaat',   pat:/heftruck|vorkheftruck/},
  {k:'reachtruck', lbl:'reachtruckcertificaat', pat:/reach\s*-?\s*truck/},
  {k:'hoogwerker', lbl:'hoogwerkercertificaat', pat:/hoogwerker/},
  {k:'bhv',        lbl:'BHV',                   pat:/\bbhv\b|bedrijfshulpverlen/},
  {k:'ehbo',       lbl:'EHBO',                  pat:/\behbo\b/},
  {k:'code95',     lbl:'code 95',               pat:/code\s*-?\s*95/},
  {k:'adr',        lbl:'ADR',                   pat:/\badr\b/},
  {k:'haccp',      lbl:'HACCP',                 pat:/\bhaccp\b/},
  {k:'sog',        lbl:'SOG',                   pat:/\bsog\b/},
  {k:'nen3140',    lbl:'NEN 3140',              pat:/nen\s*-?\s*3140/},
  {k:'las',        lbl:'lasdiploma',            pat:/lasdiploma|\bnil\b|\bmig\b|\btig\b/},
  {k:'rijbewijsC', lbl:'rijbewijs C of CE',     pat:/rijbewijs\s*c\b|\bc\s*\/\s*e\b/},
  {k:'rijbewijsB', lbl:'rijbewijs B',           pat:/rijbewijs\s*b\b|\brijbewijs\b/}
];
/* Talen. Aan de EIS-kant alleen voluit geschreven namen: een klant schrijft
   "goede beheersing van het Nederlands", nooit "NL". Zou je de tweeletterige
   codes ook aan die kant toestaan, dan leest "ervaring in de voedingsindustrie"
   als een Duitse taaleis (\bde\b). Aan de KANDIDAAT-kant juist wél, want daar
   staat "NL, EN". */
const TAAL_EISEN = [
  {k:'nl', lbl:'Nederlands', eis:/nederlands|dutch/,   kand:/nederlands|dutch|\bnl\b/},
  {k:'en', lbl:'Engels',     eis:/engels|english/,     kand:/engels|english|\ben\b/},
  {k:'de', lbl:'Duits',      eis:/duits|german/,       kand:/duits|german|\bde\b/},
  {k:'pl', lbl:'Pools',      eis:/pools|polish/,       kand:/pools|polish|\bpl\b/},
  {k:'ro', lbl:'Roemeens',   eis:/roemeens/,           kand:/roemeens|\bro\b/},
  {k:'tr', lbl:'Turks',      eis:/turks/,              kand:/turks|\btr\b/},
  {k:'ar', lbl:'Arabisch',   eis:/arabisch/,           kand:/arabisch|\bar\b/},
  {k:'bg', lbl:'Bulgaars',   eis:/bulgaars/,           kand:/bulgaars|\bbg\b/},
  {k:'hu', lbl:'Hongaars',   eis:/hongaars/,           kand:/hongaars|\bhu\b/},
  {k:'es', lbl:'Spaans',     eis:/spaans|spanish/,     kand:/spaans|spanish|\bes\b/},
  {k:'fr', lbl:'Frans',      eis:/frans|french/,       kand:/frans|french|\bfr\b/}
];

/* Hoe zwaar een rooster is. 'wisselend' staat bovenaan: wie wisseldienst
   aankan kan elk vast rooster ook aan, andersom niet. */
const PLOEG_RANG = {'geen':0, '2-ploegen':2, '3-ploegen':3, '5-ploegen':5, 'wisselend':9};
const ploegRang = p => { const r = PLOEG_RANG[String(p||'').trim().toLowerCase()]; return r == null ? null : r; };

const isDatum = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s == null ? '' : s));

/* ─── Eisen van de vacature ontleden ─────────────────────────────
   Gecached op de tekst zelf: één vacature wordt tegen honderden kandidaten
   gehouden, en dan hoeft dit maar één keer. */
const _eisenCache = new Map();
function eisenUit(tekst){
  const t = String(tekst||'').trim().toLowerCase();
  if(!t) return null;
  let uit = _eisenCache.get(t);
  if(uit) return uit;
  uit = {cert:[], taal:[], vrij:[]};
  t.split(/[,;•\/\n]|\s+en\s+/).map(s => s.trim()).filter(Boolean).forEach(deel => {
    const c = CERT_EISEN.find(x => x.pat.test(deel));
    if(c){ if(!uit.cert.includes(c)) uit.cert.push(c); return; }
    const l = TAAL_EISEN.find(x => x.eis.test(deel));
    if(l){ if(!uit.taal.includes(l)) uit.taal.push(l); return; }
    uit.vrij.push(deel);
  });
  if(_eisenCache.size < 500) _eisenCache.set(t, uit);
  return uit;
}

/* ─── Papieren van de kandidaat ──────────────────────────────────
   Twee bakken, en dat verschil doet ertoe. `metDatum` komt uit
   cv.certificaten + cv.certGeldig — daar staat de geldigheidsdatum, dus daar
   kan iets verlopen zijn. `zonderDatum` is cv.skills en het rijbewijsveld:
   dat zijn geen papieren met een houdbaarheid, maar wel de plek waar heftruck
   en VCA in de praktijk staan. Een vermelding zonder datum mag een verlopen
   certificaat nóóit witwassen, dus zoeken we altijd eerst in de eerste bak.
   Gecached op het cv-object; CRM.rowToCand geeft dezelfde objectreferentie
   door, dus de cache overleeft een hertekening. */
const _certCache = new WeakMap();
function papieren(k){
  const cv = (k && k.cv && typeof k.cv === 'object') ? k.cv : null;
  let uit = cv ? _certCache.get(cv) : null;
  if(!uit){
    uit = {metDatum:[], zonderDatum:[]};
    if(cv){
      const map = (cv.certGeldig && typeof cv.certGeldig === 'object') ? cv.certGeldig : {};
      (Array.isArray(cv.certificaten) ? cv.certificaten : []).forEach(x => {
        const obj = x && typeof x === 'object';
        const naam = String((obj ? (x.naam || x.certificaat || x.titel) : x) || '').trim();
        if(!naam) return;
        const tot = String((obj ? (x.geldigTot || x.geldig_tot) : '') || map[naam.toLowerCase()] || '').trim();
        uit.metDatum.push({naam:naam.toLowerCase(), tot: isDatum(tot) ? tot : ''});
      });
      (Array.isArray(cv.skills) ? cv.skills : []).forEach(s => {
        const n = String(s||'').trim().toLowerCase(); if(n) uit.zonderDatum.push(n);
      });
      _certCache.set(cv, uit);
    }
  }
  /* Het rijbewijsveld staat op de kandidaat zelf, niet op het cv, dus dat
     hangt buiten de cache. "B + heftruck" krijgt het woord "rijbewijs"
     ervoor, anders herkent de eis "rijbewijs B" die B niet. 'geen' juist
     niet, want dan zou "rijbewijs geen" als een rijbewijs tellen. */
  const rb = String((k && k.rijbewijs) || '').trim().toLowerCase();
  const extra = (rb && !/^(geen|nee|n\.?v\.?t\.?|-)$/.test(rb)) ? ['rijbewijs ' + rb] : [];
  const metDatum = uit.metDatum, zonderDatum = extra.length ? uit.zonderDatum.concat(extra) : uit.zonderDatum;
  /* Staat er over deze persoon HELEMAAL niets aan certificaten of skills? Dan
     is "geen VCA" geen waarneming maar een aanname — we hebben het nooit
     gevraagd. Dat verschil bepaalt of het een waarschuwing wordt of een
     openstaande vraag. Een ingevuld rijbewijsveld telt hier bewust NIET als
     bewijs dat er naar certificaten gevraagd is; voor een rijbewijs-eis is
     dat veld juist wél het antwoord, ook als het 'geen' zegt. */
  return {metDatum, zonderDatum,
          certGevraagd: !!(metDatum.length || uit.zonderDatum.length),
          rijbewijsGevraagd: !!rb};
}

/* Hooguit drie dingen opnoemen; daarna tellen. Een regel die niemand leest
   legt niets uit. */
const somOp = (lijst, max = 3) => lijst.length <= max ? lijst.join(', ')
  : lijst.slice(0, max).join(', ') + ' + ' + (lijst.length - max) + ' meer';

/* ═══ De match ═══════════════════════════════════════════════════ */
CRM.match = (kandidaat, vacature) => {
  const uit = {score:0, km:null, blokkers:[], twijfels:[], onbekend:[], plussen:[], regel:''};
  if(!kandidaat || !vacature) return uit;
  const G = CRM.MATCH_GEWICHT, P = CRM.MATCH_PLAFOND;
  const vandaag = CRM.todayISO();
  let score = 0, plafond = 100;

  /* ── 1. Functie (45) — waar het vak over gaat ───────────────── */
  const vf = woorden(vacature.functie);
  const kf = new Set([...woorden(kandidaat.functie), ...woorden(kandidaat.cv && kandidaat.cv.functie),
                      ...((kandidaat.cv && kandidaat.cv.skills) || []).map(s => String(s).toLowerCase())]);
  if(!vf.length){
    uit.onbekend.push('geen functietitel bij de vacature');
  }else if(!kf.size){
    uit.onbekend.push('geen gezochte functie bij de kandidaat');
    plafond = Math.min(plafond, P.functieOnbekend);
  }else{
    const overlap = vf.filter(w => kf.has(w));
    if(overlap.length){
      score += overlap.length / vf.length * G.functie;
      uit.plussen.push(overlap.length === vf.length ? 'zelfde functie' : 'functie sluit deels aan');
    }else{
      /* Dít is de "Lasser · 40% — zoekt productiemedewerker"-regel. Twee
         ingevulde functies zonder één gemeenschappelijk woord is geen zwakke
         match maar een ander vak. Niet verbergen, wel uit de top. */
      plafond = Math.min(plafond, P.anderVak);
      uit.twijfels.push('zoekt ' + (String(kandidaat.functie||'').trim() ||
        String((kandidaat.cv && kandidaat.cv.functie)||'').trim() || 'iets anders') +
        ', dit is ' + String(vacature.functie||'').trim());
    }
  }

  /* ── 2. Reisafstand (25) ────────────────────────────────────── */
  let km = CRM.afstandKm(kandidaat.woonplaats, vacature.locatie);
  if(km == null){
    /* Precies dezelfde plaatssleutel is geen gok maar een gelijkheid. De oude
       versie deed hier ook nog aan "de een zit in de ander" (Rotterdam ⊂
       Rotterdam-Zuid) — dat wás een gok en is eruit. */
    const kp = CRM.plaatsSleutel(kandidaat.woonplaats), vp = CRM.plaatsSleutel(vacature.locatie);
    if(kp && vp && kp === vp) km = 0;
  }
  uit.km = km;
  if(km == null){
    /* GEEN punten. Hier zat de fout: leeg gaf +8 en 60 km gaf 0. */
    uit.onbekend.push(!String(kandidaat.woonplaats||'').trim() ? 'woonplaats van de kandidaat onbekend'
      : !String(vacature.locatie||'').trim() ? 'geen locatie bij de vacature'
      : 'plaats "' + String(kandidaat.woonplaats).trim() + '" staat niet in de afstandentabel');
  }else{
    /* Ook de verste meetbare afstand levert nog een punt op. Niet omdat 90 km
       goed is, maar omdat een gemeten afstand die niet past nooit gelijk mag
       eindigen met een leeg veld — dat was precies de fout die we eruit halen.
       Boven de 100 km valt het naar nul; daar breekt de sortering de gelijke
       stand op het aantal onbekende gegevens. */
    const deel = km <= 10 ? 1 : km <= 20 ? .8 : km <= 30 ? .56 : km <= 45 ? .28
               : km <= 60 ? .12 : km <= 100 ? .04 : 0;
    score += deel * G.afstand;
    if(km <= 20) uit.plussen.push(km + ' km');
    else if(deel === 0) uit.twijfels.push(km + ' km reizen');
  }

  /* ── 3. Vervoer × afstand × bereikbaarheid ──────────────────────
     De harde kant. Wie geen auto heeft staat om 06:00 niet op een
     industrieterrein, en 24 km op de fiets houdt niemand vol. Deze twee
     regels gelden ook als de vacature geen bereikbaarheid ingevuld heeft:
     ze gaan over de kandidaat en de afstand, niet over de klant. */
  const vervoer = String(kandidaat.vervoer||'').trim().toLowerCase();
  if(!vervoer) uit.onbekend.push('vervoer van de kandidaat niet ingevuld');
  if(km != null && vervoer === 'fiets' && km > 15)
    uit.blokkers.push(km + ' km op de fiets');
  if(km != null && vervoer === 'geen' && km > 5)
    uit.blokkers.push(km + ' km zonder eigen vervoer');

  const bereik = String(vacature.bereikbaarheid||'').trim().toLowerCase();
  if(!bereik){
    uit.onbekend.push('bereikbaarheid niet ingevuld bij de vacature');
  }else if(/alleen met eigen vervoer/.test(bereik)){
    if(vervoer && vervoer !== 'auto') uit.blokkers.push('alleen met eigen vervoer bereikbaar, kandidaat heeft ' +
      (vervoer === 'geen' ? 'geen vervoer' : vervoer));
    else if(vervoer === 'auto') uit.plussen.push('eigen auto');
  }else if(/eigen vervoer handiger|met het ov/.test(bereik)){
    if(vervoer === 'geen') uit.twijfels.push('geen vervoer, werkplek is niet om de hoek');
  }

  /* ── 4. Ploegendienst (10) ──────────────────────────────────── */
  const vRang = ploegRang(vacature.ploegendienst), kRang = ploegRang(kandidaat.ploegen);
  if(vRang == null){
    uit.onbekend.push('ploegendienst niet ingevuld bij de vacature');
  }else if(vRang === 0){
    score += G.ploegen;                       /* dagdienst: dat kan iedereen */
  }else if(kRang == null){
    uit.onbekend.push('kandidaat heeft niet ingevuld welke diensten kunnen');
  }else if(kRang === 0){
    uit.blokkers.push('wil geen ploegendienst, vacature is ' + String(vacature.ploegendienst).trim());
  }else if(kRang >= vRang){
    score += G.ploegen;
    uit.plussen.push(String(vacature.ploegendienst).trim() + ' past');
  }else{
    score += G.ploegen * .4;
    uit.twijfels.push('draait ' + String(kandidaat.ploegen).trim() + ', gevraagd is ' + String(vacature.ploegendienst).trim());
  }

  /* ── 5. Eisen: certificaten, rijbewijs en taal (10) ─────────── */
  const eisen = eisenUit(vacature.eisen);
  if(!eisen){
    uit.onbekend.push('geen eisen ingevuld bij de vacature');
  }else{
    const pap = papieren(kandidaat);
    let toetsbaar = 0, gehaald = 0;
    eisen.cert.forEach(eis => {
      toetsbaar++;
      const raak = pap.metDatum.filter(c => eis.pat.test(c.naam));
      if(raak.length){
        const metDatum = raak.filter(c => c.tot);
        if(!metDatum.length){ gehaald++; uit.onbekend.push('geldigheid ' + eis.lbl + ' onbekend'); }
        else if(metDatum.some(c => c.tot >= vandaag)){ gehaald++; uit.plussen.push(eis.lbl + ' geldig'); }
        else{
          /* Erger dan geen certificaat: je dénkt dat het geregeld is. */
          /* Mét jaartal: "verlopen op 1 mrt" laat in het midden of dat vorige
             maand was of drie jaar geleden, en dat scheelt voor de vraag of
             het even bijgewerkt kan worden. */
          uit.blokkers.push(eis.lbl + ' verlopen op ' +
            CRM.fmtDate(metDatum.map(c => c.tot).sort().pop()));
        }
      }else if(pap.zonderDatum.some(s => eis.pat.test(s))){
        gehaald++; uit.onbekend.push('geldigheid ' + eis.lbl + ' onbekend');
      }else if(!(eis.k === 'rijbewijsB' || eis.k === 'rijbewijsC' ? pap.rijbewijsGevraagd : pap.certGevraagd)){
        /* Niets op de kaart over certificaten of rijbewijs: dan weten we het
           niet. Geen punten (onbekend is niet goed), maar ook geen streep
           door de rekening — er is niemand geweest die het gevraagd heeft. */
        uit.onbekend.push(eis.lbl + ' niet uitgevraagd');
      }else{
        uit.blokkers.push('geen ' + eis.lbl);
      }
    });
    eisen.taal.forEach(eis => {
      toetsbaar++;
      const talen = String(kandidaat.talen||'').trim().toLowerCase();
      if(!talen) uit.onbekend.push('talen van de kandidaat niet ingevuld');
      else if(eis.kand.test(talen)){ gehaald++; uit.plussen.push(eis.lbl); }
      else uit.blokkers.push('spreekt geen ' + eis.lbl);
    });
    /* Vrije tekst ("ervaring in de voedingsindustrie") toetsen we niet, en
       dat zeggen we ook. Nooit blokkeren op iets wat we niet kunnen lezen. */
    if(eisen.vrij.length) uit.onbekend.push('niet te toetsen eis: ' + somOp(eisen.vrij, 2));
    if(toetsbaar) score += G.eisen * (gehaald / toetsbaar);
  }

  /* ── 6. Beschikbaarheid ─────────────────────────────────────── */
  const besch = String(kandidaat.beschikbaar||'').trim().toLowerCase();
  if(besch === 'niet') uit.blokkers.push('meldt zich niet beschikbaar');

  /* ── 7. Ervaring (5) ────────────────────────────────────────── */
  const jaren = kandidaat.cv && Number(kandidaat.cv.ervaringJaren);
  if(!jaren && jaren !== 0) uit.onbekend.push('ervaringsjaren onbekend');
  else if(jaren >= 3){ score += G.ervaring; uit.plussen.push(jaren + ' jaar ervaring'); }
  else if(jaren >= 1) score += G.ervaring * .6;

  /* ── 8. Salaris in de range (5) ─────────────────────────────── */
  const loon = kandidaat.maandloon == null || kandidaat.maandloon === '' ? null : Number(kandidaat.maandloon);
  const hi = vacature.sal_max == null ? null : Number(vacature.sal_max);
  if(loon == null || (hi == null && vacature.sal_min == null)) uit.onbekend.push('salaris niet te vergelijken');
  else if(hi != null && loon > hi) uit.twijfels.push('zit boven de loonrange van deze vacature');
  else score += G.salaris;

  /* ── Plafond en uitleg ──────────────────────────────────────── */
  if(uit.blokkers.length) plafond = Math.min(plafond, P.blokker);
  uit.score = Math.max(0, Math.min(plafond, Math.round(score)));

  uit.regel = uit.score + '% — ' + (uit.plussen.length ? somOp(uit.plussen) : 'niets aantoonbaars dat past')
    + (uit.blokkers.length ? ' · gaat op stuk: ' + somOp(uit.blokkers) : '')
    + (uit.twijfels.length ? ' · let op: ' + somOp(uit.twijfels, 2) : '')
    + (uit.onbekend.length ? ' · niet bekend: ' + somOp(uit.onbekend, 2) : '');
  return uit;
};

CRM.matchScore = (kandidaat, vacature) => CRM.match(kandidaat, vacature).score;

/* Suggesties voor één kandidaat. Alleen open vacatures — een gesloten
   vacature voorstellen is geen suggestie maar ruis. Wie een streep door de
   rekening heeft blijft zichtbaar maar zakt naar onderen; het plafond van 35
   zorgt dat zo iemand nooit bovenaan een lijstje staat. */
CRM.besteMatches = (kandidaat, n=5) => (CRM.state.vacs||[])
  .filter(v => (v.status || 'Open') === 'Open')
  .map(v => { const m = CRM.match(kandidaat, v); return {vacature:v, score:m.score, m}; })
  .filter(x => x.score >= 30)
  .sort((a,b) => (a.m.blokkers.length?1:0) - (b.m.blokkers.length?1:0)
              || b.score - a.score
              || a.m.onbekend.length - b.m.onbekend.length)
  .slice(0,n);

})();

/* ─── Kwalificatie- en zoekhelpers (filters, Source-kaart) ────── */
CRM.BESCHIKBAAR = ['direct','in overleg','niet'];
CRM.PLOEGEN     = ['geen','2-ploegen','3-ploegen','5-ploegen','wisselend'];
CRM.VERVOER     = ['auto','ov','fiets','geen'];
CRM.sterren = n => { const s=Math.max(0,Math.min(5,Number(n)||0));
  return s ? '★'.repeat(s)+'☆'.repeat(5-s) : '—'; };
/* Woont deze kandidaat binnen X km van een plaats? Onbekende plaats telt
   NIET mee (eerlijk blijven — liever geen resultaat dan een gok). */
CRM.binnenRadius = (kandidaat, plaats, km) => {
  const d = CRM.afstandKm(kandidaat?.woonplaats, plaats);
  return d != null && d <= km;
};
/* Beschikbare pool = niet in een lopend traject: afgevallen-maar-recyclebaar
   of expliciet beschikbaar gemarkeerd. Actief lopend = in de pijplijn. */
/* Actief lopend vereist een ÉCHTE fase: geïmporteerde kandidaten (fase '')
   staan niet in een traject en mogen hier nooit in meetellen. */
CRM.isActiefLopend = c => !!c.fase &&
  (!CRM.DONE.includes(c.fase) || CRM.PLACED.includes(c.fase) && !c.gestoptOp);
CRM.isBeschikbaar  = c => c.beschikbaar === 'direct' || c.beschikbaar === 'in overleg'
  || (c.fase === 'Afgevallen' && c.recyclebaar === true);

/* Kandidaat-volledigheid: tegen vervuiling in het systeem. */
CRM.VELDEN_VERPLICHT = [
  {k:'naam', lbl:'Naam'}, {k:'telefoon', lbl:'Telefoonnummer'}, {k:'woonplaats', lbl:'Woonplaats'},
  {k:'functie', lbl:'Gezochte functie'}, {k:'bron', lbl:'Bron'}
];
CRM.volledigheid = c => {
  const mist = CRM.VELDEN_VERPLICHT.filter(v => !String(c?.[v.k]||'').trim());
  const extra = [c?.email, c?.cv, c?.intake].filter(Boolean).length;
  const basis = (CRM.VELDEN_VERPLICHT.length - mist.length) / CRM.VELDEN_VERPLICHT.length * 75;
  return {pct: Math.round(basis + extra*8.33), mist};
};
