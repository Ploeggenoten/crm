/* ═══════════════════════════════════════════════════════════════
   PLOEGGENOTEN CRM — KANDIDAAT VERWIJDEREN EN ANONIMISEREN
   Eén plek waar de persoonsgegevens van een kandidaat het systeem uit
   gaan. Twee handelingen, want er zijn twee situaties.

   Geen menu-item — dit is een bibliotheek, net als js/opvolging.js.
   De kandidatenkaart roept aan:
     CRM.kandVerwijder.mag(c)             → welke handeling past hier, en waarom
     CRM.kandVerwijder.knopHtml(c)        → de twee knoppen onderaan de kaart
     CRM.kandVerwijder.bindKnop(mount)    → ze actief maken
     CRM.kandVerwijder.open(c, {onKlaar}) → het bevestigingsvenster

   ─── VERWIJDEREN tegenover ANONIMISEREN ─────────────────────────
   VERWIJDEREN wist de kaart en alles wat eraan hangt. Daarna is de
   kandidaat er niet meer: hij telt nergens meer mee.

   ANONIMISEREN wist de persoon en laat de plaatsing staan als naamloze
   regel. Fase, startdatum, plaatsingsdatum, stopdatum, klant, vacature
   en de salariscomponenten blijven, dus omzet, marge, plaatsings-
   aantallen en de maandcijfers in Finance en Performance veranderen
   geen cent.

   Wie ooit geplaatst is kun je niet verwijderen: achter een plaatsing
   zit een handtekening, een factuur en een bewaarplicht. Maar iemand
   die vraagt om verwijdering van zijn gegevens heeft daar recht op, en
   dan is anonimiseren de route. Daarom staat op elke kaart altijd
   minstens één werkende knop — nooit twee doodlopende wegen.

   ─── DRIE REGELS DIE DE REST VERKLAREN ──────────────────────────
   1. De persoonsgegevens gaan als LAATSTE weg. Alles wat eraan hangt
      eerst, dan pas de rij in `candidates`. Gaat er halverwege iets
      mis, dan stopt het en blijft de kaart vindbaar — met naam, dus
      opnieuw te proberen. Andersom zou je zwevende activiteiten en een
      cv in de opslag overhouden die je nergens meer terugvindt.

   2. Overtypen, niet aanvinken. Beide handelingen zijn onomkeerbaar en
      allebei vragen ze om de naam van de kandidaat, letterlijk
      ingetypt. Dat is de enige bevestiging die een routineklik echt
      onderbreekt.

   3. Er blijft een spoor. In `crm_verwijderingen` staat DAT er iemand
      weg is: wanneer, door wie, welke handeling, welke fase, welke
      bron. Zonder naam en zonder contactgegevens — anders bewaar je
      precies wat je zou wissen. Dat logboek beantwoordt twee vragen:
      "waarom is deze lijst korter geworden" en "hebben jullie mijn
      gegevens echt verwijderd".

   GEEN GELD: er staat nergens een bedrag in dit bestand, dus er zit
   niets achter CRM.canSeeMoney().
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;

/* Kandidaat kan als ruwe rij (CRM.state.cands) of als gemapte kaart
   (CRM.kandidaat) binnenkomen. Een gemapte kaart heeft altijd de sleutel
   `geplaatstOp`, een ruwe rij nooit — daar herkennen we het aan. */
function norm(c){
  if(!c) return null;
  return c.geplaatstOp !== undefined ? c : CRM.rowToCand(c);
}

/* ═══════════════════════════════════════════════════════════════
   1. OOIT GEPLAATST?
   "Geplaatst" is geen fase maar een gebeurtenis: er is getekend. Dat
   kan op vijf plaatsen in de data zichtbaar zijn, en één ervan is al
   genoeg. Alleen naar de huidige fase kijken is niet genoeg — iemand
   die geplaatst is geweest en daarna gestopt, staat op 'Gestopt'.
   ═══════════════════════════════════════════════════════════════ */
const PLACED_NAMEN = CRM.PLACED;      // ['Contract getekend','Gestart']

function ooitGeplaatst(c){
  /* a. Nu geplaatst. Via faseIn, zodat oude fasewaarden meelopen. */
  if(CRM.faseIn(c.fase, PLACED_NAMEN))
    return {grond:'fase', tekst:`De kaart staat op '${CRM.faseNorm(c.fase)}'. Er ligt een handtekening en er komt een factuur.`};

  /* b. Er staat een plaatsingsdatum. js/recruitment.js wist dat veld
     zodra iemand tot vóór 'Contract getekend' wordt teruggezet, dus als
     hij er staat is er ook echt getekend. Dit vangt 'Gestopt' na een
     plaatsing én 'Contract getekend' dat nog moet starten. */
  if(c.geplaatstOp)
    return {grond:'plaatsingsdatum', tekst:`Er staat een plaatsingsdatum: ${CRM.fmtDate(c.geplaatstOp)}.`};

  /* c. De fasehistorie. Wordt bij elke wissel aangevuld en nooit
     opgeschoond, dus hier staat het ook als de kaart inmiddels ergens
     anders hangt en de plaatsingsdatum met de hand is leeggemaakt. */
  const hist = (Array.isArray(c.historie) ? c.historie : [])
    .find(x => x && CRM.faseIn(x.fase, PLACED_NAMEN));
  if(hist)
    return {grond:'historie', tekst:`In de fasehistorie staat '${CRM.faseNorm(hist.fase)}'${hist.op?' op '+CRM.fmtDate(hist.op):''}.`};

  /* d. Het activiteitenlogboek. Een fasewissel wordt daar apart
     vastgelegd ("Offer → Contract getekend"), los van de historie op de
     kaart. Twee onafhankelijke bronnen: als één ervan is leeggemaakt,
     ziet de andere het nog. */
  const act = CRM.activiteitenVoor('kandidaat', c.id)
    .find(a => a.soort === 'fase' && PLACED_NAMEN.some(f => String(a.tekst||'').includes(f)));
  if(act)
    return {grond:'logboek', tekst:`In het logboek staat een fasewissel naar een plaatsing (${CRM.fmtDate(act.op)}).`};

  /* e. Iemand die aantoonbaar gewerkt heeft: een startdatum in het
     verleden met stopgegevens erbij. Dan is er gewerkt en dus
     gefactureerd, ook als de plaatsingsdatum nooit is ingevuld.
     Let op de volgorde: een stopdatum ZONDER startdatum telt niet.
     js/data.js rekent zo ook — een stop zonder plaatsing gaat nergens
     vanaf. 'Spook Sander' in de demo is precies dat geval. */
  const gewerkt = c.start && CRM.dagenGeleden(c.start) >= 0 && (c.gestoptOp || c.stopDoor || c.stopCat);
  if(gewerkt)
    return {grond:'gewerkt', tekst:`Er staat een startdatum in het verleden (${CRM.fmtDate(c.start)}) met stopgegevens erbij — deze kandidaat heeft gewerkt.`};

  return null;
}

/* Loopt de plaatsing nog? Dan is anonimiseren toegestaan, maar het
   breekt wel dingen die vandaag nog nodig zijn. Zie de waarschuwing. */
function loopendeplaatsing(c){
  if(c.gestoptOp) return null;
  if(!CRM.faseIn(c.fase, PLACED_NAMEN)) return null;
  if(CRM.faseIs(c.fase, 'Contract getekend'))
    return 'Deze kandidaat heeft getekend maar is nog niet gestart. De klant verwacht deze persoon op de startdatum en de factuur moet nog de deur uit — zonder naam wordt dat lastig.';
  return 'Deze kandidaat is nog aan het werk. Nazorg, de verjaardag en een eventuele vervanging binnen de garantie lopen op naam van deze kandidaat; die vallen hierna stil.';
}

const BEWAARPLICHT =
  'Wie ooit geplaatst is, kun je niet verwijderen: de administratie rond die plaatsing moet bewaard blijven. ' +
  'Anonimiseren kan wél — dan gaan de persoonsgegevens eruit en blijft de plaatsing als naamloze regel staan.';

/* Geeft terug welke handeling hier past, met de reden erbij.
   `mag` en `reden` blijven wat ze altijd waren (gaat over verwijderen),
   zodat bestaande aanroepen blijven werken.                          */
function mag(kand){
  const c = norm(kand);
  if(!c){
    const nee = {mag:false, reden:'Deze kandidaat bestaat niet (meer).', grond:'weg'};
    return Object.assign({}, nee, {verwijderen:nee, anonimiseren:nee, advies:''});
  }
  const g = ooitGeplaatst(c);
  const verwijderen = g
    ? {mag:false, grond:g.grond, reden: g.tekst + ' ' + BEWAARPLICHT}
    : {mag:true, grond:'', reden:''};
  /* Anonimiseren mag altijd. Bij een lopende plaatsing waarschuwen we,
     maar we blokkeren niet: dan zou een geplaatste kandidaat die om
     verwijdering vraagt weer helemaal geen route hebben, en dat was nu
     juist het probleem. Het CRM velt geen juridisch oordeel; het zorgt
     dat de AM weet wat hij weggooit vóórdat hij klikt. */
  const anonimiseren = {mag:true, grond:'', reden:'', waarschuwing: loopendeplaatsing(c) || ''};
  return Object.assign({}, verwijderen, {
    verwijderen, anonimiseren,
    /* Nooit geplaatst → verwijderen is beter: minder gegevens bewaren is
       altijd beter dan een naamloze kaart die niemand meer kan gebruiken.
       Ooit geplaatst → anonimiseren is de enige route. */
    advies: verwijderen.mag ? 'verwijderen' : 'anonimiseren'
  });
}

/* ═══════════════════════════════════════════════════════════════
   2. WAT HANGT ERAAN?
   Alles wat we in het venster tellen, tellen we hier — één plek, zodat
   het getal dat de gebruiker ziet hetzelfde getal is dat straks weggaat.
   ═══════════════════════════════════════════════════════════════ */
const bijKandidaat = (lijst, id) => (lijst || [])
  .filter(x => x && x.entiteit === 'kandidaat' && String(x.ref) === String(id));

/* De naam van een kandidaat staat niet alleen op zijn eigen kaart.
   js/kandidaten.js schrijft bij een voorstel een activiteit op de KLANT:
   "Jan Jansen voorgesteld voor Operator". Dat is een echte klantregel
   die mag blijven bestaan, maar de naam hoort er dan uit.
   We zoeken alleen op de volledige naam, niet op losse woorden: op
   "Jan" zoeken haalt ook "Janine" en "Janssen" onderuit.

   Blijft één risico over: twee mensen met dezelfde naam. Dan wordt de
   regel van de naamgenoot óók geredigeerd. Dat is bewust de kant waar
   we naar fout gaan — een naam te veel weghalen kost een stukje
   leesbaarheid ("[naam verwijderd] voorgesteld voor Operator" zegt nog
   steeds wat er gebeurd is), een naam laten staan die weg had gemoeten
   is precies wat we hier proberen te voorkomen.                        */
function naamEscape(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function naamRegex(naam){
  const n = String(naam || '').trim();
  if(n.length < 4) return null;              // te kort om veilig te vervangen
  return new RegExp('(^|[^\\p{L}])' + naamEscape(n).replace(/\s+/g, '\\s+') + '(?=$|[^\\p{L}])', 'giu');
}
function naamSporen(naam, id){
  const re = naamRegex(naam);
  if(!re) return [];
  const uit = [];
  const scan = (tabel, lijst) => (lijst || []).forEach(r => {
    if(!r || !r.tekst) return;
    if(r.entiteit === 'kandidaat' && String(r.ref) === String(id)) return;   // gaat sowieso al weg
    re.lastIndex = 0;
    if(re.test(r.tekst)) uit.push({tabel, rij:r});
  });
  scan('crm_activiteiten', CRM.state.activiteiten);
  scan('crm_taken',        CRM.state.taken);
  scan('crm_meldingen',    CRM.state.meldingen);
  return uit;
}

function telling(kand){
  const c = norm(kand); if(!c) return null;
  const id = String(c.id);

  const acts   = CRM.activiteitenVoor('kandidaat', id);
  const taken  = bijKandidaat(CRM.state.taken, id);
  const docs   = bijKandidaat(CRM.state.documenten, id);
  const meld   = bijKandidaat(CRM.state.meldingen, id);

  /* Bestanden in de map crm-docs. Alleen ónze eigen paden: een handmatig
     gekoppelde SharePoint-link is niet van ons om weg te gooien.
     CRM.opslag.pad() geeft '' terug voor alles wat geen eigen bestand is. */
  const paden = new Set();
  const cvPad   = CRM.opslag.pad(c.cv && c.cv.url);
  const fotoPad = CRM.opslag.pad(c.foto);
  if(cvPad)   paden.add(cvPad);
  if(fotoPad) paden.add(fotoPad);
  docs.forEach(d => { const p = CRM.opslag.pad(d.url); if(p) paden.add(p); });

  /* De lead waar de sollicitatie mee binnenkwam. Twee kanten op: de
     kandidaat wijst terug (lead_id) of de lead wijst vooruit
     (kandidaat_id). Eén van beide is genoeg — js/marketing.js kijkt ook zo. */
  const leads = (CRM.state.leads || []).filter(l =>
    (c.leadId && String(l.id) === String(c.leadId)) || String(l.kandidaat_id || '') === id);

  /* Wie verwijst er naar deze kaart? Een vervanger of een herstart. */
  const verwijzers = CRM.kandidaten().filter(x =>
    String(x.id) !== id && (String(x.vervangt) === id || String(x.herstartVan) === id));

  /* Activiteiten van deze kandidaat waarvan de TEKST vrije tekst is.
     Een fasewissel ("Offer → Contract getekend") is machinetaal zonder
     persoonsgegeven en blijft daarom staan; bij anonimiseren houden we
     zo de fasehistorie in het logboek heel. */
  const actsVrij = acts.filter(a => a.soort !== 'fase');

  return {
    id, naam: String(c.naam || '').trim(), kand: c,
    acts, actsVrij, taken, docs, meld, leads, verwijzers,
    sporen: naamSporen(c.naam, id),
    paden: Array.from(paden),
    cvPad, fotoPad,
    /* Precies opnoemen wat er ís. "de naam, het telefoonnummer en het
       e-mailadres" bij een kaart die alleen een telefoonnummer heeft,
       maakt het venster onbetrouwbaar — en dat is het enige wat het
       venster te bieden heeft. */
    contact: [
      c.naam       && 'de naam',
      c.telefoon   && 'het telefoonnummer',
      c.email      && 'het e-mailadres',
      c.woonplaats && 'de woonplaats',
      c.geboortedatum && 'de geboortedatum'
    ].filter(Boolean),
    notities: Array.isArray(c.notities) ? c.notities.length : 0,
    heeftIntake: !!c.intake,
    heeftCvGegevens: !!(c.cv && Object.keys(c.cv).length),
    heeftPlaatsing: !!ooitGeplaatst(c)
  };
}

/* ═══════════════════════════════════════════════════════════════
   3. WAT ER OP HET SCHERM KOMT TE STAAN
   ═══════════════════════════════════════════════════════════════ */
const mv = (n, enkel, meer) => n + ' ' + (n === 1 ? enkel : meer);
function opsomming(delen){
  const d = delen.filter(Boolean);
  if(!d.length) return '';
  if(d.length === 1) return d[0];
  return d.slice(0, -1).join(', ') + ' en ' + d[d.length - 1];
}

/* De persoonsgegevens — bij beide handelingen dezelfde lijst, want in
   beide gevallen gaat precies dit weg. */
function persoonsgegevensDelen(t){
  const delen = [];
  delen.push(...t.contact);
  if(t.heeftCvGegevens) delen.push('de cv-gegevens');
  if(t.cvPad)   delen.push('het cv-bestand');
  if(t.fotoPad) delen.push('de foto');
  if(t.notities) delen.push(mv(t.notities, 'notitie', 'notities'));
  if(t.heeftIntake) delen.push('de antwoorden uit de intake');
  return delen;
}

/* Bewust één doorlopende opsomming en geen lijst met bolletjes: dan
   staat er precies één "en" in, en lees je het als een zin in plaats
   van als een formulier. */
function wegTekstVerwijderen(t){
  const delen = ['de hele kaart'].concat(persoonsgegevensDelen(t));
  if(t.acts.length)  delen.push(mv(t.acts.length, 'activiteit', 'activiteiten'));
  if(t.taken.length) delen.push(mv(t.taken.length, 'taak', 'taken'));
  if(t.docs.length)  delen.push(mv(t.docs.length, 'document', 'documenten'));
  if(t.meld.length)  delen.push(mv(t.meld.length, 'melding', 'meldingen'));
  if(t.sporen.length) delen.push(`de naam uit ${mv(t.sporen.length,'regel','regels')} bij de klant`);
  return opsomming(delen);
}

function wegTekstAnonimiseren(t){
  const kern = persoonsgegevensDelen(t);
  const delen = kern.length ? kern.slice() : ['de persoonsgegevens op de kaart'];
  /* Expliciet erbij dat de regel zelf blijft staan: "de tekst van 1
     activiteit en 1 taak" leest anders alsof ook de taak alleen zijn
     tekst kwijtraakt, terwijl die helemaal verdwijnt. */
  if(t.actsVrij.length) delen.push(
    `de tekst van ${mv(t.actsVrij.length, 'activiteit', 'activiteiten')} (de ${t.actsVrij.length===1?'regel blijft':'regels blijven'} staan)`);
  if(t.taken.length) delen.push(mv(t.taken.length, 'taak', 'taken'));
  if(t.docs.length)  delen.push(mv(t.docs.length, 'document', 'documenten'));
  if(t.meld.length)  delen.push(mv(t.meld.length, 'melding', 'meldingen'));
  if(t.sporen.length) delen.push(`de naam uit ${mv(t.sporen.length,'regel','regels')} bij de klant`);
  return opsomming(delen);
}

function leadZin(t, watGebeurtErmee){
  if(!t.leads.length) return '';
  return (t.leads.length === 1 ? 'de lead waar de sollicitatie mee binnenkwam' : `de ${t.leads.length} leads waar de sollicitatie mee binnenkwam`)
    + ' — die ' + (t.leads.length === 1 ? 'blijft' : 'blijven')
    + ' staan voor de marketingcijfers, maar ' + watGebeurtErmee;
}

function blijftTekstVerwijderen(t){
  const delen = [];
  const lead = leadZin(t, 'naam, telefoonnummer, e-mailadres en cv worden eruit gehaald');
  if(lead) delen.push(lead);
  if(t.verwijzers.length) delen.push(t.verwijzers.length === 1
    ? `de kaart van ${t.verwijzers[0].naam || 'de vervanger'}, die naar deze kandidaat verwijst — die verwijzing wordt "${VERWIJDERD}"`
    : `${t.verwijzers.length} kaarten die naar deze kandidaat verwijzen — die verwijzingen worden "${VERWIJDERD}"`);
  delen.push('een regel in het logboek: datum, fase, bron en wie het deed — zonder naam of contactgegevens');
  return opsomming(delen);
}

function blijftTekstAnonimiseren(t){
  const delen = [];
  delen.push('de plaatsing zelf als naamloze regel: fase, startdatum, plaatsings- en stopdatum, klant, vacature en het salaris');
  delen.push('de fasewissels in het logboek, zodat de doorlooptijd blijft kloppen');
  const lead = leadZin(t, 'naam, telefoonnummer, e-mailadres en cv worden eruit gehaald');
  if(lead) delen.push(lead);
  /* Eerlijk zijn over de grens van deze knop: de facturatie staat in de
     fin_*-tabellen, die alleen Tjeerd mag schrijven, én daar hoort de
     naam te blijven staan — een factuur bewaar je zeven jaar. */
  if(t.heeftPlaatsing) delen.push('de naam in de facturatie, want een factuur moet zeven jaar bewaard blijven');
  delen.push('een regel in het logboek: datum, fase, bron en wie het deed — zonder naam of contactgegevens');
  return opsomming(delen);
}

/* ═══════════════════════════════════════════════════════════════
   4. NAAM OVERTYPEN
   Aanvinken en "weet je het zeker" onderbreken een routineklik niet.
   Overtypen wel. Maar niemand hoort te stranden op een typografisch
   streepje of een accent: we vergelijken op de letters, niet op de
   tekens. Hoofdletters, dubbele spaties, accenten en de vier soorten
   streepjes en apostrofs die uit Word en van een telefoon komen vallen
   allemaal weg. "Lopes da Graça" mag je dus als "lopes da graca"
   intypen.
   ═══════════════════════════════════════════════════════════════ */
function normNaam(s){
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')       // é → e, ç → c
    .replace(/[‐-―−]/g, '-')                 // – — ‒ − → -
    .replace(/[‘’ʼ′`´]/g, "'")     // ’ ` ´ → '
    .replace(/[ \s]+/g, ' ')                           // dubbele spaties
    .trim().toLowerCase();
}
/* Kandidaat zonder naam (import, of alleen een telefoonnummer): dan is
   er niets om over te typen. Eén vast woord in plaats daarvan — nog
   steeds een handeling, geen klik. */
const NAAMLOOS_WOORD = 'VERWIJDEREN';
const teTypen = t => t.naam || NAAMLOOS_WOORD;

/* ═══════════════════════════════════════════════════════════════
   5. FOUTTEKSTEN
   ═══════════════════════════════════════════════════════════════ */
function tabelMist(err){
  return /does not exist|schema cache|relation .* does not exist|could not find the table/i
    .test(String(err && (err.message || err.hint) || ''));
}
function dbFoutTekst(err){
  const code = String((err && (err.code || err.statusCode || err.status)) || '');
  const m    = String((err && err.message) || '');
  if(code === '42501' || /row-level security|permission denied|not authorized/i.test(m))
    return 'De database weigert dit: jouw account mag deze regels niet aanpassen. Vraag Tjeerd om de rechten te controleren.';
  if(/failed to fetch|network|load failed|fetch failed/i.test(m))
    return 'Geen verbinding met de database. Controleer je internetverbinding en probeer het opnieuw.';
  if(/jwt|session|token is expired|invalid claim/i.test(m))
    return 'Je sessie is verlopen. Log opnieuw in en probeer het nog een keer.';
  return m || 'Onbekende fout.';
}

/* ═══════════════════════════════════════════════════════════════
   6. WAT ER MET DE KOPPELINGEN GEBEURT
   ═══════════════════════════════════════════════════════════════ */

/* DE LEAD. Tjeerd stuurt op leads-per-plaatsing per klant en per
   vacature. Gooi je de lead weg, dan wordt een campagne uit het
   verleden achteraf duurder dan hij was: de kosten blijven, de lead
   verdwijnt. Maar een naam en een telefoonnummer in crm_leads zijn net
   zo goed persoonsgegevens als op de kandidaatkaart.

   De middenweg: alles wat telt blijft (bron, campagne, vacature, klant,
   functie, status, score, binnenkomstdatum), alles wat naar een persoon
   wijst gaat eruit.

   `kandidaat_id` blijft bewust staan. Zou je hem leegmaken, dan valt de
   lead uit de trechterstap "doorgeschoten" en klopt de conversie niet
   meer. js/marketing.js kent dit geval al en meldt het netjes onder
   "leads verwijzen naar een kandidaat die niet bestaat" — een eerlijk
   gat is beter dan een stilzwijgend verkeerd getal.
   `naam` mag niet leeg zijn (not null in het schema), vandaar het woord. */
const leadPatch = () => ({
  naam:'Gegevens gewist', telefoon:'', email:'', woonplaats:'',
  cv:null, cv_url:'', antwoorden:null, agent_notitie:'', kwalificatie:'',
  notities:[]
});

/* DE VERVANGER EN DE HERSTART. Drie mogelijkheden, en twee zijn fout:
   - laten staan  → op de kaart van de vervanger verschijnt een kaal id
     ('c1690…') waar een naam hoorde te staan. Stille fout.
   - leegmaken    → `!c.vervangt` betekent in js/data.js en js/finance.js
     "telt als nieuwe plaatsing". Een vervanger die opeens meetelt maakt
     een target uit het verleden met terugwerkende kracht hoger. Erger
     dan een lelijk veld.
   - dit          → het feit blijft (er wás een voorganger, dus de
     telling blijft kloppen) en op het scherm staat leesbaar wat er aan
     de hand is. js/kandidaten.js toont een onbekende verwijzing als
     platte tekst, dus dit leest gewoon als "(verwijderd)".
   Bij anonimiseren speelt dit niet: die kaart blijft gewoon bestaan.  */
const VERWIJDERD = '(verwijderd)';

/* HET PSEUDONIEM. Een lege naam leest als een fout in het systeem; dit
   leest als wat het is. Kort genoeg voor een bordkaart en een
   tabelcel, en met de datum erbij, zodat je in een lijst ziet dat het
   om verschillende opschoningen gaat. */
const pseudoniem = () => 'Gegevens gewist — ' + CRM.fmtDate(CRM.todayISO());

/* Wat er in vrije tekst overblijft. Bewust zichtbaar en niet gewoon
   leeg: een lege regel in een tijdlijn leest als een fout, deze regel
   vertelt wat er gebeurd is. */
const NAAM_WEG  = '[naam verwijderd]';
const TEKST_WEG = '[tekst gewist bij anonimiseren]';
function redigeer(tekst, naam){
  const re = naamRegex(naam);
  if(!re) return tekst;
  return String(tekst).replace(re, (m, voor) => (voor || '') + NAAM_WEG);
}

/* DE KANDIDAATRIJ BIJ ANONIMISEREN. Alles wat over de persoon gaat
   eruit; alles waar Finance en Performance mee rekenen blijft staan.
   Bewust NIET aangeraakt: fase, historie, since, datum, klant,
   vacature_id, type, start, geplaatst_op, gestopt_op, garantie_mnd,
   maandloon, toeslag_pct, vt_pct, eju_pct, overig_pct, afval_type,
   afval_categorie, stop_door, stop_categorie, rec, bron, vervangt,
   herstart_van, oo_id, lead_id, no_shows.                            */
function anonPatch(c){
  const p = {
    naam: pseudoniem(),
    /* De vlag, niet de naam, is het bewijs. Een naam kun je overtypen —
       iemand die letterlijk 'Gegevens gewist' heet zou anders behandeld
       worden als geanonimiseerd, en een geanonimiseerde kaart die iemand
       hernoemt zou stilzwijgend weer opduiken in de bellijst en de nazorg.
       Kolom: candidates.geanonimiseerd_op (zie supabase/schema.sql blok 1). */
    geanonimiseerd_op: CRM.todayISO(),
    telefoon:'', email:'', woonplaats:'', geboortedatum:null,
    foto:'', cv:null, notities:[], note:'', reden:'',
    volgende_actie:null, actie_datum:null,
    /* Eigenschappen van de persoon, niet van de plaatsing. Finance en
       Performance rekenen er niet mee. */
    talen:'', rijbewijs:'', vervoer:'', ploegen:'', beschikbaar:'',
    ster:0, golden:false,
    /* Niet bemiddelbaar: geen oordeel over de persoon, maar een feit — je
       kunt iemand niet terugbellen van wie het telefoonnummer net gewist
       is. Zo valt de kaart ook uit de Beschikbaar-pool. */
    bemiddelbaar:false, beschikbaar_per:null,
    /* Van de intake blijft alleen dat er één is geweest en wanneer over —
       de recruitmentcijfers (intakeDone) werken daarmee; de antwoorden
       eronder zijn het verhaal van een persoon en gaan eruit. */
    intake: c.intake ? {op: c.intake.op || '', door: c.intake.door || ''} : null
  };
  /* js/finance.js haalt het maandloon uit het notitieveld als de kolom
     leeg is (feeBerekening: /\b([2-6]\d{3})\b/). Gooien we `note` weg
     zonder dat getal te redden, dan verandert de fee van een bedrag in
     "onbekend" — precies de cent verschil die er niet mag zijn.
     Zelfde regex, zodat het bedrag identiek blijft. */
  if(c.maandloon == null || c.maandloon === ''){
    const m = String(c.note || '').match(/\b([2-6]\d{3})\b/);
    if(m) p.maandloon = Number(m[1]);
  }
  return p;
}

/* ═══════════════════════════════════════════════════════════════
   7. DE STAPPEN
   Volgorde is het hele verhaal. Van buiten naar binnen: eerst alles wat
   los van de kaart staat, dan pas de kaart zelf. Zolang de naam er nog
   op staat is de kandidaat vindbaar en is het opnieuw te proberen; elke
   stap is idempotent, dus een tweede poging doet geen kwaad.

   `fataal:true` = deze stap gaat over persoonsgegevens. Mislukt hij,
   dan stoppen we en blijft de kaart staan. De ergste uitkomst zou zijn
   dat de kaart weg is en het cv nog in de opslag ligt: dan denk je dat
   je iets verwijderd hebt wat er nog gewoon is.
   `fataal:false` = boekhouding en cosmetiek. Mislukt dat, dan melden we
   het en gaan we door — het houdt geen persoonsgegeven in leven.
   ═══════════════════════════════════════════════════════════════ */
const sb = () => CRM.sb;

/* Stappen die verwijderen en anonimiseren delen. */
function gedeeldeStappen(t){
  const id = t.id;
  return [
    /* De bestanden eerst. Een bestand zonder rij die ernaar wijst is
       onvindbaar; een rij zonder bestand is alleen een gebroken link. */
    {sleutel:'bestanden', lbl:'de bestanden in de opslag', fataal:true,
     async fn(){
       if(!t.paden.length) return;
       const {error} = await sb().storage.from(CRM.opslag.map).remove(t.paden);
       if(error) throw Object.assign(new Error(CRM.opslag.foutTekst(error)), {_alGeduid:true});
       t.paden.forEach(p => CRM.opslag.wis(p));
     }},

    {sleutel:'documenten', lbl:'de documentregels', fataal:true,
     async fn(){
       if(!t.docs.length) return;
       const {error} = await sb().from('crm_documenten').delete().eq('entiteit','kandidaat').eq('ref', id);
       if(error){ if(tabelMist(error)) return; throw error; }
     },
     lokaal(){ CRM.state.documenten = (CRM.state.documenten||[]).filter(x => !t.docs.includes(x)); }},

    /* Opgemaakte stukken (kandidaatprofiel, plan van aanpak). Die staan
       niet in CRM.state, dus we kunnen ze niet tellen — maar als er een
       hangt, staan er wél persoonsgegevens in. Daarom blind opruimen. */
    {sleutel:'stukken', lbl:'de opgemaakte stukken', fataal:true,
     async fn(){
       const {error} = await sb().from('crm_stukken').delete().eq('kandidaat_id', id);
       if(error){ if(tabelMist(error)) return; throw error; }
     }},

    /* Taken gaan in beide gevallen wég. Bij verwijderen spreekt dat voor
       zich; bij anonimiseren ook: een taak is iets doen mét iemand, en
       dat kan niet meer zonder telefoonnummer. Hun tekst bevat
       bovendien vaak de naam. */
    {sleutel:'taken', lbl:'de taken', fataal:true,
     async fn(){
       if(!t.taken.length) return;
       const {error} = await sb().from('crm_taken').delete().eq('entiteit','kandidaat').eq('ref', id);
       if(error){ if(tabelMist(error)) return; throw error; }
     },
     lokaal(){ CRM.state.taken = (CRM.state.taken||[]).filter(x => !t.taken.includes(x)); }},

    {sleutel:'meldingen', lbl:'de meldingen', fataal:true,
     async fn(){
       if(!t.meld.length) return;
       const {error} = await sb().from('crm_meldingen').delete().eq('entiteit','kandidaat').eq('ref', id);
       if(error){ if(tabelMist(error)) return; throw error; }
     },
     lokaal(){ CRM.state.meldingen = (CRM.state.meldingen||[]).filter(x => !t.meld.includes(x)); }},

    /* De naam uit regels die NIET van deze kandidaat zijn: "Jan Jansen
       voorgesteld voor Operator" staat als activiteit op de klant. Die
       regel is een echt klantfeit en mag blijven; de naam hoort eruit. */
    {sleutel:'sporen', lbl:'de naam in regels bij de klant', fataal:true,
     async fn(){
       for(const s of t.sporen){
         const nieuw = redigeer(s.rij.tekst, t.naam);
         if(nieuw === s.rij.tekst) continue;
         const {error} = await sb().from(s.tabel).update({tekst:nieuw}).eq('id', s.rij.id);
         if(error){ if(tabelMist(error)) continue; throw error; }
       }
     },
     lokaal(){ t.sporen.forEach(s => { s.rij.tekst = redigeer(s.rij.tekst, t.naam); }); }},

    /* De lead. Moet vóór de kaart: zolang deze stap niet gelukt is
       staan naam en telefoonnummer nog gewoon in crm_leads. */
    {sleutel:'lead', lbl:'de leadgegevens', fataal:true,
     async fn(){
       for(const l of t.leads){
         const {error} = await sb().from('crm_leads').update(leadPatch()).eq('id', l.id);
         if(error){ if(tabelMist(error)) return; throw error; }
       }
     },
     lokaal(){ t.leads.forEach(l => Object.assign(l, leadPatch())); }}
  ];
}

function stappenVerwijderen(t){
  const id = t.id;
  return gedeeldeStappen(t).concat([
    /* Bij verwijderen gaan de activiteiten helemaal weg — de kaart
       waar ze bij horen bestaat straks niet meer. */
    {sleutel:'activiteiten', lbl:'de activiteiten', fataal:true,
     async fn(){
       if(!t.acts.length) return;
       const {error} = await sb().from('crm_activiteiten').delete().eq('entiteit','kandidaat').eq('ref', id);
       if(error){ if(tabelMist(error)) return; throw error; }
     },
     lokaal(){ CRM.state.activiteiten = (CRM.state.activiteiten||[]).filter(x => !t.acts.includes(x)); }},

    /* Verwijzingen van ánderen naar deze kaart. Niet fataal: hier staat
       geen persoonsgegeven in, alleen een sleutel. */
    {sleutel:'verwijzingen', lbl:'de verwijzingen van andere kaarten', fataal:false,
     async fn(){
       for(const x of t.verwijzers){
         const patch = {};
         if(String(x.vervangt)    === id) patch.vervangt     = VERWIJDERD;
         if(String(x.herstartVan) === id) patch.herstart_van = VERWIJDERD;
         if(!Object.keys(patch).length) continue;
         const {error} = await sb().from('candidates').update(patch).eq('id', x.id);
         if(error) throw error;
       }
     },
     lokaal(){
       t.verwijzers.forEach(x => {
         const r = (CRM.state.cands||[]).find(r => String(r.id) === String(x.id));
         if(!r) return;
         if(String(r.vervangt||'')     === id) r.vervangt     = VERWIJDERD;
         if(String(r.herstart_van||'') === id) r.herstart_van = VERWIJDERD;
       });
     }},

    /* En als laatste de kaart. Vanaf hier is de kandidaat weg. */
    {sleutel:'kaart', lbl:'de kandidaatkaart', fataal:true,
     async fn(){
       const {error} = await sb().from('candidates').delete().eq('id', id);
       if(error) throw error;
     },
     lokaal(){ CRM.state.cands = (CRM.state.cands||[]).filter(r => String(r.id) !== id); }}
  ]);
}

function stappenAnonimiseren(t){
  const id = t.id;
  const patch = anonPatch(t.kand);
  return gedeeldeStappen(t).concat([
    /* Activiteiten blijven staan, hun tekst niet. Soort, datum en wie
       het deed zijn de gegevens waar js/opvolging.js en Performance mee
       rekenen (hoeveel contactmomenten, wanneer); de tekst is het
       verhaal van een persoon. Fasewissels houden hun tekst: dat is
       machinetaal ("Offer → Contract getekend") en die zin houdt de
       doorlooptijd in het logboek leesbaar. */
    {sleutel:'activiteiten', lbl:'de tekst van de activiteiten', fataal:true,
     async fn(){
       if(!t.actsVrij.length) return;
       const {error} = await sb().from('crm_activiteiten').update({tekst: TEKST_WEG})
         .eq('entiteit','kandidaat').eq('ref', id).neq('soort','fase');
       if(error){ if(tabelMist(error)) return; throw error; }
     },
     lokaal(){ t.actsVrij.forEach(a => { a.tekst = TEKST_WEG; }); }},

    /* En als laatste de kaart zelf. Vanaf hier is de persoon weg en
       staat de plaatsing er naamloos bij. */
    {sleutel:'kaart', lbl:'de kandidaatkaart', fataal:true,
     async fn(){
       const {error} = await sb().from('candidates').update(patch).eq('id', id);
       if(error) throw error;
     },
     lokaal(){
       const r = (CRM.state.cands||[]).find(r => String(r.id) === id);
       if(r) Object.assign(r, patch);
     }}
  ]);
}

/* ═══════════════════════════════════════════════════════════════
   8. HET LOGBOEK
   Eerst schrijven, dan wissen. Andersom houd je bij een netwerkstoring
   niets over: de persoon is weg en er staat nergens dat het gebeurd is.
   De regel begint op 'bezig' en wordt aan het eind bijgewerkt; blijft
   hij op 'bezig' staan, dan is dat óók informatie.

   Ontbreekt de tabel, dan werkt het gewoon door en staat er een
   waarschuwing in de console. Een kandidaat niet kunnen opschonen omdat
   het logboek nog niet bestaat is een slechtere uitkomst dan een
   opschoning zonder logregel.
   ═══════════════════════════════════════════════════════════════ */
function logRij(c, t, handeling, reden){
  return {
    id: CRM.uid(),
    soort: 'kandidaat',
    handeling,                          // 'verwijderd' | 'geanonimiseerd'
    ref: String(c.id),                  // sleutel, geen persoonsgegeven
    fase: CRM.faseNorm(c.fase) || '',
    bron: c.bron || '',
    klant: c.klant || '',
    rec: c.rec || '',                   // een collega, niet de kandidaat
    reden: String(reden || '').slice(0, 500),
    lead_id: t.leads.map(l => String(l.id)).join(','),
    aantallen: {
      activiteiten: t.acts.length, taken: t.taken.length, documenten: t.docs.length,
      meldingen: t.meld.length, bestanden: t.paden.length, notities: t.notities,
      sporen: t.sporen.length
    },
    door: CRM.me(),
    op: new Date().toISOString(),
    status: 'bezig',
    mislukt: []
  };
}
async function logSchrijf(rij){
  const {error} = await CRM.sb.from('crm_verwijderingen').insert(rij);
  if(!error) return {ok:true, waarschuwing:''};
  console.warn('Logboek crm_verwijderingen', error);
  return {ok:false, waarschuwing: tabelMist(error)
    ? 'Er is geen logregel bijgeschreven: de tabel crm_verwijderingen bestaat nog niet.'
    : 'De logregel kon niet worden weggeschreven — ' + dbFoutTekst(error)};
}
async function logAf(rij, status, mislukt){
  if(CRM.demo || !rij._geschreven) return;
  const {error} = await CRM.sb.from('crm_verwijderingen')
    .update({status, mislukt: mislukt || []}).eq('id', rij.id);
  if(error) console.warn('Logboek afronden', error);
}

/* ═══════════════════════════════════════════════════════════════
   9. UITVOEREN
   Geeft {ok, gedaan, mislukt, waarschuwing, fout}. Gooit nooit — de
   aanroeper krijgt altijd een leesbaar antwoord terug.
   ═══════════════════════════════════════════════════════════════ */
const bezig = new Set();          // tegen dubbelklikken, per kandidaat-id

async function voerUit(c, t, handeling, reden){
  const id = String(c.id);
  if(bezig.has(id)) return {ok:false, gedaan:[], mislukt:[], waarschuwing:'',
    fout:'Deze opschoning loopt al. Even geduld.'};
  bezig.add(id);
  try{
    const rij = logRij(c, t, handeling, reden);
    let waarschuwing = '';
    /* Demo: nooit naar de database. Alleen CRM.state bijwerken, zodat je
       op het scherm ziet wat er zou gebeuren (BOUWAFSPRAKEN §5). */
    if(!CRM.demo){
      const log = await logSchrijf(rij);
      rij._geschreven = log.ok;
      waarschuwing = log.waarschuwing;
    }

    const lijst = handeling === 'geanonimiseerd' ? stappenAnonimiseren(t) : stappenVerwijderen(t);
    const gedaan = [], mislukt = [];
    for(const s of lijst){
      try{
        if(!CRM.demo) await s.fn();
        if(s.lokaal) s.lokaal();
        gedaan.push(s);
      }catch(e){
        const tekst = e && e._alGeduid ? e.message : dbFoutTekst(e);
        console.error('Opschonen — stap ' + s.sleutel, e);
        mislukt.push({sleutel:s.sleutel, lbl:s.lbl, tekst});
        if(s.fataal){
          await logAf(rij, 'afgebroken', mislukt);
          return {ok:false, gedaan, mislukt, waarschuwing,
                  fout: 'Het is gestopt bij ' + s.lbl + '. ' + tekst};
        }
      }
    }
    await logAf(rij, mislukt.length ? 'deels' : 'klaar', mislukt);
    return {ok:true, gedaan, mislukt, waarschuwing};
  }finally{
    bezig.delete(id);
  }
}

/* ═══════════════════════════════════════════════════════════════
   10. DE VENSTERS
   ═══════════════════════════════════════════════════════════════ */
function uitlegVenster(titel, reden, knopTekst, daarna){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(titel)}</div></div>
    <div class="modal-b"><p class="kv-p">${h(reden)}</p></div>
    <div class="modal-f">
      <button class="btn ghost" id="kv_dicht">Sluiten</button>
      ${knopTekst ? `<button class="btn" id="kv_door">${h(knopTekst)}</button>` : ''}
    </div>`, {onOpen(m){
      m.querySelector('#kv_dicht').onclick = () => CRM.modal.close();
      const door = m.querySelector('#kv_door');
      if(door) door.onclick = () => { CRM.modal.close(); setTimeout(daarna, 60); };
    }});
}

/* Eén venster voor beide handelingen — het verschil zit in de teksten.
   Zo kan er nooit één van de twee schermen achterlopen op de ander. */
function venster(c, t, handeling, opts){
  const anon = handeling === 'geanonimiseerd';
  const doel = teTypen(t);
  const naamloos = !t.naam;
  const res = mag(c);
  const waarschuwing = anon ? res.anonimiseren.waarschuwing : '';

  CRM.modal.open(`
    <div class="modal-h">
      <div class="h2">${anon ? 'Gegevens anonimiseren' : 'Kandidaat verwijderen'}: ${h(t.naam || 'kandidaat zonder naam')}</div>
      <p class="sub kv-sub">${anon
        ? 'De persoon gaat eruit, de plaatsing blijft als naamloze regel staan. De cijfers veranderen niet.'
        : 'De hele kaart gaat eruit. Deze kandidaat telt daarna nergens meer mee.'}
        Niet terug te draaien.</p>
    </div>
    <div class="modal-b">
      ${CRM.demo ? `<div class="note info kv-demo">Demomodus: de database wordt niet aangeraakt.
        Je ziet het effect alleen in dit venster.</div>` : ''}
      ${waarschuwing ? `<div class="note warn kv-waarschuw">${h(waarschuwing)}</div>` : ''}

      <div class="kv-vak kv-weg">
        <span class="label">Weg</span>
        <p class="kv-p">${h(anon ? wegTekstAnonimiseren(t) : wegTekstVerwijderen(t))}.</p>
      </div>

      <div class="kv-vak kv-blijft">
        <span class="label">Blijft staan</span>
        <p class="kv-p">${h(anon ? blijftTekstAnonimiseren(t) : blijftTekstVerwijderen(t))}.</p>
        ${anon ? `<p class="kv-p kv-cijfers">Omzet, marge, plaatsingsaantallen en de maandcijfers
          in Finance en Performance veranderen hier niet van.</p>` : ''}
      </div>

      <div class="f-row kv-reden">
        <label for="kv_reden">Reden (mag leeg)</label>
        <input type="text" id="kv_reden" maxlength="200"
               placeholder="Bijv. verzoek van de kandidaat zelf">
        <span class="hint">Komt in het logboek, zonder naam of contactgegevens.</span>
      </div>

      <div class="f-row kv-typ">
        <label for="kv_naam">${naamloos
          ? `Deze kaart heeft geen naam. Typ <b>${h(NAAMLOOS_WOORD)}</b> om te bevestigen`
          : 'Typ de naam over om te bevestigen'}</label>
        <input type="text" id="kv_naam" autocomplete="off" autocapitalize="off"
               spellcheck="false" placeholder="${h(doel)}">
        <span class="hint" id="kv_hint">Hoofdletters en accenten maken niet uit.</span>
      </div>

      <div class="note err kv-fout" id="kv_fout" hidden></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" id="kv_nee">Annuleren</button>
      <button class="btn danger" id="kv_ja" disabled>${anon ? 'Definitief anonimiseren' : 'Definitief verwijderen'}</button>
    </div>`, {onOpen(m){
      const inp  = m.querySelector('#kv_naam');
      const knop = m.querySelector('#kv_ja');
      const nee  = m.querySelector('#kv_nee');
      const hint = m.querySelector('#kv_hint');
      const fout = m.querySelector('#kv_fout');
      const klopt = () => normNaam(inp.value) === normNaam(doel);

      const check = () => {
        const ok = klopt();
        knop.disabled = !ok;
        hint.textContent = ok ? 'Dat klopt.'
          : inp.value.trim() ? 'Nog niet gelijk aan ' + doel + '.'
          : 'Hoofdletters en accenten maken niet uit.';
        hint.classList.toggle('kv-goed', ok);
      };
      inp.oninput = check;
      /* Enter mag bevestigen, maar alleen als de naam al klopt — anders
         is het weer één toets tussen jou en een onomkeerbare handeling. */
      inp.onkeydown = e => { if(e.key === 'Enter' && klopt()) knop.click(); };
      setTimeout(() => inp.focus(), 60);

      nee.onclick = () => CRM.modal.close();

      knop.onclick = async () => {
        if(!klopt() || knop.disabled) return;
        /* Dubbelklik: de knop gaat meteen op slot én voerUit() houdt zelf
           bij welke kandidaat al bezig is. Twee sloten, want de knop kan
           bij een mislukte poging weer aan gaan. */
        knop.disabled = true; nee.disabled = true; inp.disabled = true;
        knop.textContent = 'Bezig…';
        fout.hidden = true;

        const reden = (m.querySelector('#kv_reden').value || '').trim();
        const r = await voerUit(c, t, handeling, reden);

        if(!r.ok){
          knop.textContent = 'Opnieuw proberen';
          knop.disabled = false; nee.disabled = false; inp.disabled = false;
          fout.hidden = false;
          fout.innerHTML = `${h(r.fout)}<br>
            <span class="meta">${h(r.gedaan.length
              ? 'Al wel gedaan: ' + opsomming(r.gedaan.map(s => s.lbl)) + '. De kaart staat er nog met de naam erop, dus je kunt het opnieuw proberen.'
              : 'Er is nog niets veranderd.')}</span>`;
          return;
        }

        CRM.modal.close();
        CRM.toast(CRM.demo
          ? 'Demo: alleen in dit venster aangepast'
          : anon ? 'De gegevens van ' + (t.naam || 'deze kandidaat') + ' zijn gewist'
                 : (t.naam || 'De kandidaat') + ' is verwijderd', 'ok');
        if(r.waarschuwing){
          console.warn(r.waarschuwing);
          CRM.toast(r.waarschuwing, 'err');
        }
        if(r.mislukt.length)
          CRM.toast('Let op: ' + r.mislukt[0].lbl + ' is niet bijgewerkt — ' + r.mislukt[0].tekst, 'err');

        const na = opts && opts.onKlaar;
        if(typeof na === 'function') na();
        else standaardNa(t.id, anon);
      };
    }});
}

function openVerwijderen(kand, opts){
  const c = norm(kand);
  if(!c) return CRM.toast('Deze kandidaat bestaat niet meer','err');
  const res = mag(c);
  if(!res.verwijderen.mag)
    return uitlegVenster('Deze kandidaat kun je niet verwijderen', res.verwijderen.reden,
      'Anonimiseren', () => openAnonimiseren(c, opts));
  venster(c, telling(c), 'verwijderd', opts || {});
}

function openAnonimiseren(kand, opts){
  const c = norm(kand);
  if(!c) return CRM.toast('Deze kandidaat bestaat niet meer','err');
  venster(c, telling(c), 'geanonimiseerd', opts || {});
}

/* `open` zonder verdere opgave doet de handeling die hier past. Wie het
   zelf wil kiezen geeft {actie:'verwijderen'|'anonimiseren'} mee. */
function open(kand, opts){
  const c = norm(kand);
  if(!c) return CRM.toast('Deze kandidaat bestaat niet meer','err');
  const gekozen = (opts && opts.actie) || mag(c).advies;
  return gekozen === 'anonimiseren' ? openAnonimiseren(c, opts) : openVerwijderen(c, opts);
}

/* Zonder onKlaar: bij verwijderen kun je niet op de kaart blijven staan
   — die bestaat niet meer. Bij anonimiseren wel: dan hoort de kaart zich
   opnieuw te tekenen, zodat je meteen ziet wat er nog staat. */
function standaardNa(id, anon){
  const opKaart = CRM.view === 'kandidaten' && String((CRM.params||{}).id || '') === String(id);
  if(opKaart && !anon) CRM.ga('kandidaten'); else CRM.render();
}

/* ═══════════════════════════════════════════════════════════════
   11. DE KNOPPEN
   Onderaan de kaart, ver van de dagelijkse knoppen, en klein. Wie ze
   niet zoekt hoort ze niet tegen te komen. De handeling die hier past
   staat rechts en is de gevulde knop; de andere staat ernaast als
   gewone knop. Ook een knop die niet kan blijft klikbaar: dan legt hij
   uit waaróm, en biedt hij het alternatief aan. Een grijze knop zonder
   reden laat iemand alleen maar denken dat het systeem stuk is.
   ═══════════════════════════════════════════════════════════════ */
function knopHtml(kand){
  const c = norm(kand); if(!c) return '';
  const res = mag(c);
  const anonAdvies = res.advies === 'anonimiseren';
  const uitleg = anonAdvies
    ? 'Deze kandidaat is ooit geplaatst en kan niet verwijderd worden. Anonimiseren wist de persoonsgegevens en laat de plaatsing als naamloze regel staan.'
    : 'Verwijderen wist de kaart en alles wat eraan hangt, ook de bestanden. Anonimiseren laat een naamloze regel staan, zodat de cijfers niet veranderen.';
  const knop = (attr, tekst, sterk) =>
    `<button type="button" class="btn ${sterk ? 'danger' : 'ghost'} sm kv-knop" ${attr}="${h(c.id)}">${tekst}</button>`;
  return `<div class="kv-blok">
    <span class="meta kv-uitleg">${h(uitleg)}</span>
    ${anonAdvies
      ? knop('data-kvweg','Kandidaat verwijderen', false) + knop('data-kvanon','Gegevens anonimiseren', true)
      : knop('data-kvanon','Gegevens anonimiseren', false) + knop('data-kvweg','Kandidaat verwijderen', true)}
  </div>`;
}

function bindKnop(mount, opts){
  if(!mount) return;
  const pak = b => CRM.kandidaat(b.dataset.kvweg || b.dataset.kvanon);
  CRM.$$('[data-kvweg]', mount).forEach(b => b.onclick = () => {
    const c = pak(b); if(!c) return CRM.toast('Deze kandidaat bestaat niet meer','err');
    openVerwijderen(c, opts || {});
  });
  CRM.$$('[data-kvanon]', mount).forEach(b => b.onclick = () => {
    const c = pak(b); if(!c) return CRM.toast('Deze kandidaat bestaat niet meer','err');
    openAnonimiseren(c, opts || {});
  });
}

/* ─── Naar buiten ─────────────────────────────────────────────── */
CRM.kandVerwijder = {
  mag, telling, open, openVerwijderen, openAnonimiseren, knopHtml, bindKnop,
  /* Voor wie zelf iets wil bouwen op dezelfde regels. */
  ooitGeplaatst: kand => { const c = norm(kand); return c ? !!ooitGeplaatst(c) : false; },
  /* Eerst de vlag; de naamvergelijking blijft als terugval voor kaarten
     die geanonimiseerd zijn vóórdat de kolom bestond. */
  isGeanonimiseerd: kand => {
    const c = norm(kand); if(!c) return false;
    return !!(c.geanonimiseerdOp || c.geanonimiseerd_op)
        || /^Gegevens gewist/.test(String(c.naam || ''));
  },
  VERWIJDERD
};

})();

/* VERZOEK AAN CORE:
   1. Het logboek heeft een tabel nodig: `crm_verwijderingen`. De SQL en de
      RLS-policy staan in het rapport bij deze module. Zolang die tabel er
      niet is werkt alles gewoon en verschijnt er een waarschuwing — maar
      dan is er geen enkel spoor van wat er is opgeschoond, en dat is
      precies wat je nodig hebt als een kandidaat vraagt of zijn gegevens
      weg zijn.
   2. js/finance.js koppelt in `inboxCandidates()` een plaatsing aan een
      kandidaat op NAAM als `pipeline_candidate_id` leeg is:
        !byName.has(String(c.naam||'').trim().toLowerCase())
      Na anonimiseren matcht die naam niet meer, waardoor een nog niet
      gekoppelde plaatsing opnieuw in de finance-inbox verschijnt. De
      bedragen kloppen nog steeds; het is de actielijst die vervuilt.
      Voorstel: die regel overslaan voor kandidaten waarvan de naam met
      'Gegevens gewist' begint (CRM.kandVerwijder.isGeanonimiseerd), of
      beter: bij het anonimiseren eenmalig `pipeline_candidate_id` vullen.
      Dat laatste kan deze module niet zelf — fin_* is afgeschermd op
      Tjeerds e-mailadres en een AM mag er niet in schrijven.
   3. `CRM.state` heeft geen `stukken`. Deze module ruimt crm_stukken op
      met een blinde delete op `kandidaat_id`, omdat hij niet kan tellen
      wat hij niet ziet. Wordt die tabel ooit in CRM.load() meegenomen,
      dan kan het aantal ook in het venster staan.
   4. `crm_documenten` bij een kandidaat gebruikt `ref = het kandidaat-id`
      (net als crm_activiteiten en crm_taken), niet de naam zoals bij
      klanten. Er schrijft nog niets zulke rijen weg; komt dat er, houd
      dan het id aan — op naam matchen haalt bij twee gelijknamige
      kandidaten het verkeerde dossier weg.
*/
