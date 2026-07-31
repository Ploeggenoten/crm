/* ═══════════════════════════════════════════════════════════════
   VIDEO-INTAKE INLEZEN — CRM.intakeAI

   Het intakeformulier (js/recruitment.js, intakeForm) stelt vijftien
   open vragen over zes blokken. Die tijdens een videocall van drie
   kwartier uittypen lukt niemand, dus ze worden achteraf uit het
   hoofd ingevuld — of half. Dit bestand haalt de antwoorden uit het
   transcript van dat gesprek.

   Bewust géén API en géén sleutel. Tjeerd: "We kunnen die
   transcripties zelf ook in Claude gooien, dan kost het geen geld."
   Het CRM maakt dus de opdracht kant-en-klaar, hij plakt die zelf in
   Claude, en plakt het antwoord terug. Drie stappen, één venster,
   nul kosten en niets dat kan verlopen of stukgaan.

   De vragen en de veldnamen hieronder zijn letterlijk overgenomen
   uit intakeForm(). Wijzigt daar een veld, dan moet het hier mee —
   anders schrijven we netjes in een sleutel die niemand leest.
   ═══════════════════════════════════════════════════════════════ */
(() => {
'use strict';
const h = CRM.h;

/* ─── 1. De vragenlijst ───────────────────────────────────────────
   Eén lijst voor alles: de opdracht aan Claude, het teruglezen van
   het antwoord en het voorstel op het scherm. Twee lijsten die uit
   elkaar lopen is precies hoe je stilletjes in een sleutel schrijft
   die het formulier niet kent.

   `klaar` ("klaar om voor te stellen") staat er bewust NIET bij. Dat
   is het oordeel van de recruiter over zijn eigen werk, geen gegeven
   uit het gesprek. Een model dat daar ja op zet, zet een kandidaat
   door zonder dat iemand het besloten heeft. */
const VRAGEN = [
  {k:'situatie', blok:'A · Situatie en urgentie',
   kort:'Waarom nu open',
   vraag:'Wat is er veranderd waardoor je nu openstaat? Wat mis je in je huidige of vorige werk?',
   hint:'de reden achter de reden — let op wat er doorgevraagd is'},
  {k:'trajecten', blok:'A · Situatie en urgentie',
   kort:'Andere trajecten',
   vraag:'Loop je ook bij andere bureaus of bedrijven?', soort:'keuze', opties:['nee','ja']},
  {k:'trajectenTxt', blok:'A · Situatie en urgentie',
   kort:'Waar en hoe ver',
   vraag:'Zo ja: waar, en hoe ver in het proces?',
   hint:'leeg laten als er geen ander traject loopt'},

  {k:'jaZegt', blok:'B · Drijfveren',
   kort:'Waarom ja, los van geld',
   vraag:'Stel je krijgt een aanbod: wat maakt dat je ja zegt — behalve het geld?'},
  {k:'droombaan', blok:'B · Drijfveren',
   kort:'Droombaan',
   vraag:'Wat maakt een baan voor jou een droombaan?'},
  {k:'blijven', blok:'B · Drijfveren',
   kort:'Wat zou blijven maken',
   vraag:'Wat zou je huidige werkgever moeten veranderen zodat je tóch blijft?',
   hint:'ontmaskert de echte drijfveer en de gevoeligheid voor een tegenbod'},

  {k:'werkbeeld', blok:'C · Werkbeeld',
   kort:'Beeld van het werk',
   vraag:'Wat weet je van dit soort werk — tempo, fysiek, omgeving? Waar verwacht je aan te moeten wennen?',
   hint:'voorkomt uitval in de eerste dertig dagen'},

  {k:'jaar13', blok:'D · Toekomst en ontwikkeling',
   kort:'Over 1 en 3 jaar',
   vraag:'Waar wil je over 1 jaar staan? En over 3 jaar?'},
  {k:'leren', blok:'D · Toekomst en ontwikkeling',
   kort:'Wil leren',
   vraag:'Wat wil je leren of ontwikkelen in je volgende stap?'},

  {k:'blokkade', blok:'E · Risico-check',
   kort:'Wat kan tegenhouden',
   vraag:'Is er iets of iemand die je zou tegenhouden om ja te zeggen op een passend aanbod?',
   hint:'partner, reistijd, twijfel'},
  {k:'tegenbod', blok:'E · Risico-check',
   kort:'Tegenbod verwacht',
   vraag:'Verwacht je een tegenbod als je opzegt?', soort:'keuze', opties:['nee','misschien','ja']},
  {k:'aangekaart', blok:'E · Risico-check',
   kort:'Onvrede aangekaart',
   vraag:'Heb je je onvrede al eens bij je leidinggevende aangekaart?', soort:'keuze', opties:['ja','nee']},

  {k:'cijfer', blok:'F · Commitment',
   kort:'Commitment 1–10',
   vraag:'Als het aanbod klopt: hoe graag maak je deze overstap? (1–10)', soort:'cijfer'},
  {k:'nietLager', blok:'F · Commitment',
   kort:'Waarom niet lager',
   vraag:'Waarom geen twee punten lager?', hint:'hier komt het echte verhaal'},
  {k:'tien', blok:'F · Commitment',
   kort:'Wat maakt het een 10',
   vraag:'Wat zou het een 10 maken?', hint:'de onderhandel-checklist bij het aanbod'},

  /* De laatste drie zijn samenvattingen over het hele gesprek in
     plaats van het antwoord op één vraag. Ze mogen wél samengevat
     worden, maar nog steeds niet verzonnen. */
  {k:'drijfveer', blok:'Samenvatting voor de recruiter', vat:true,
   kort:'Echte drijfveer',
   vraag:'Echte drijfveer, in één zin'},
  {k:'risicos', blok:'Samenvatting voor de recruiter', vat:true,
   kort:'Afhaakrisico’s',
   vraag:'Afhaakrisico’s — waar kan dit misgaan?'},
  {k:'samenvatting', blok:'Samenvatting voor de recruiter', vat:true,
   kort:'Samenvatting voor de klant',
   vraag:'Samenvatting voor de klant: drie feitelijke zinnen die de kandidaat verkopen zonder te overdrijven'}
];
const SLEUTELS = VRAGEN.map(v => v.k);
const VRAAG = Object.fromEntries(VRAGEN.map(v => [v.k, v]));

/* ─── 2. Het bestand lezen ────────────────────────────────────────
   .vtt en .srt zijn gewoon tekst. Voor .docx en pdf leunen we op
   js/cvparse.js — dat kan het al, en twee uitpakkers voor hetzelfde
   zipformaat in één app is één te veel. */
const MAX = 25 * 1024 * 1024;

async function leesBestand(file){
  const naam = String(file.name || '').toLowerCase();
  if(!file.size) throw new Error('Dit bestand is leeg.');
  if(file.size > MAX)
    throw new Error('Dit bestand is groter dan 25 MB. Een transcript is dat nooit — controleer of je het juiste bestand koos.');
  if(/\.(vtt|srt|txt|md|csv|log)$/.test(naam) || /^text\//.test(file.type || ''))
    return {tekst: (await file.text()).replace(/\r\n?/g, '\n'),
            soort: /\.vtt$/.test(naam) ? 'vtt' : /\.srt$/.test(naam) ? 'srt' : 'tekst'};
  if(/\.(docx|pdf)$/.test(naam)){
    if(!CRM.cvParse) throw new Error('Word- en pdf-bestanden worden gelezen door de cv-module, en die is nu niet geladen. Plak de tekst, of gebruik een .vtt of .txt.');
    const r = await CRM.cvParse.leesBestand(file);
    return {tekst: r.tekst || '', soort: /\.pdf$/.test(naam) ? 'pdf' : 'docx'};
  }
  throw new Error('Dit bestandstype kunnen we niet lezen. Een .vtt uit Teams, een .txt, een .docx of een pdf werkt wel.');
}

/* ─── 3. Opschonen ────────────────────────────────────────────────
   Een Teams-.vtt bestaat voor meer dan de helft uit ballast:
   regelnummers, tijdcodes, een sprekersnaam boven élk fragment van
   vier seconden, en bij automatische ondertiteling ook nog dezelfde
   zin drie keer, elke keer een woord langer. Dat eruit halen scheelt
   niet alleen omvang — het maakt het gesprek pas leesbaar, voor een
   mens én voor een model. */
const TIJDVAK   = /^\s*(?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\s*-->\s*(?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?/;
const CUE_ID    = /^[0-9a-f]{8}-[0-9a-f-]{4,30}(?:\/\d+-\d+)?$/i;
const TELLER    = /^\d{1,6}$/;
const LOSSE_TIJD= /^\(?(?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\)?$/;
const TIJD_KOP  = /^(.{2,60}?)[\s\t]{1,}\(?(?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\)?$/;

const ENTITEIT = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'",'&nbsp;':' '};
const ontHtml = s => String(s).replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, m => ENTITEIT[m] || m);

/* Ziet dit eruit als een naam en niet als het begin van een zin? Zonder
   deze rem wordt "Nou: dat weet ik niet" een spreker die "Nou" heet. */
function lijktNaam(s){
  const t = String(s || '').trim();
  if(!t || t.length > 45) return false;
  if(/[.!?,;]/.test(t)) return false;
  const w = t.split(/\s+/);
  if(w.length > 5) return false;
  return w.every(x => /^[\p{Lu}(\[]/u.test(x) || /^(van|de|der|den|te|ter|op|in|el|al|bin|di|da|do|dos)$/i.test(x));
}

function schoonTranscript(ruw){
  const regels = String(ruw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const beurten = [];
  const sprekers = new Map();
  let spreker = '', breek = true, vtt = false;

  /* Wie zijn hier de sprekers? Een woord vóór een dubbele punt is pas een
     naam als het vaker terugkomt. Zonder die eis wordt "Nou: dat weet ik
     niet" een spreker die Nou heet, en zo praat half Nederland. */
  const telling = new Map();
  regels.forEach(x => {
    const m = /^\s*([^:]{2,45}):\s+\S/.exec(x);
    if(m && lijktNaam(m[1])){
      const n = m[1].trim();
      telling.set(n, (telling.get(n) || 0) + 1);
    }
  });

  const zetBij = (naam, tekst) => {
    if(!tekst) return;
    const vorige = beurten[beurten.length - 1];
    if(vorige && !breek && vorige.spreker === naam){
      /* Rollende ondertiteling: hetzelfde fragment komt terug met een
         woord erbij. Zonder deze drie regels staat een gesprek van een
         uur er twee tot drie keer in. */
      if(vorige.tekst === tekst) return;
      if(tekst.length > 12 && tekst.startsWith(vorige.tekst)){ vorige.tekst = tekst; return; }
      if(tekst.length > 12 && vorige.tekst.endsWith(tekst)) return;
      vorige.tekst += ' ' + tekst;
      return;
    }
    if(vorige && vorige.spreker === naam && vorige.tekst === tekst) return;
    beurten.push({spreker: naam, tekst});
    if(naam) sprekers.set(naam, (sprekers.get(naam) || 0) + 1);
    breek = false;
  };

  for(let i = 0; i < regels.length; i++){
    let r = regels[i].trim();
    if(!r){ breek = true; continue; }
    if(/^WEBVTT\b/i.test(r)){ vtt = true; continue; }
    /* NOTE, STYLE en REGION lopen door tot de eerstvolgende lege regel. */
    if(/^(NOTE|STYLE|REGION)\b/.test(r)){ while(i + 1 < regels.length && regels[i + 1].trim()) i++; continue; }
    /* Een tijdvak is een fragmentgrens, geen alineagrens. De lege regel
       die er in een .vtt vóór staat betekent dus niets — zonder deze
       regel valt elk fragment van vier seconden apart uiteen en werkt het
       samenvoegen van herhaalde ondertiteling niet meer. */
    if(TIJDVAK.test(r)){ vtt = true; breek = false; continue; }
    if(CUE_ID.test(r)) continue;
    /* Een los getal is alleen een srt-teller als er een tijdvak achteraan
       komt. Anders is het gewoon een antwoord — "8" op de vraag hoe graag
       je deze overstap maakt is nou juist een cijfer dat we willen. */
    if(TELLER.test(r) && TIJDVAK.test((regels[i + 1] || '').trim())) continue;
    if(LOSSE_TIJD.test(r)){
      /* Sommige exports zetten de tijd bóven de naam in plaats van
         erachter. Dan staat de spreker op de volgende regel. */
      let j = i + 1;
      while(j < regels.length && !regels[j].trim()) j++;
      const kandidaat = (regels[j] || '').trim().replace(/:$/, '');
      if(kandidaat && lijktNaam(kandidaat) && (regels[j + 1] || '').trim()){
        spreker = kandidaat; breek = true; i = j;
      }
      continue;
    }

    /* "Tjeerd van Elk   0:12" — zo zet de tekstexport van Teams de
       spreker op een eigen regel, met de tijd erachter. */
    const kop = TIJD_KOP.exec(r);
    if(kop && lijktNaam(kop[1].replace(/:$/, ''))){ spreker = kop[1].replace(/:$/, '').trim(); breek = true; continue; }

    let naam = spreker;
    const v = /^<v[^>\s]*\s+([^>]*)>([\s\S]*)$/i.exec(r);
    if(v){ naam = v[1].trim(); r = v[2]; vtt = true; }

    r = r.replace(/<\/v>/gi, '')
         .replace(/<\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}>/g, '')   // woord-tijdstempels
         .replace(/<[^>]*>/g, '');
    r = ontHtml(r).replace(/\s+/g, ' ').trim();
    if(!r) continue;

    if(!v){
      const s = /^([^:]{2,45}):\s+(.+)$/.exec(r);
      const kand = s ? s[1].trim() : '';
      if(s && lijktNaam(kand) && (telling.get(kand) >= 2 || sprekers.has(kand))){
        naam = kand; r = s[2].trim();
      }
    }
    if(naam !== spreker) breek = true;
    spreker = naam;
    zetBij(naam, r);
  }

  const tekst = beurten.map(b => (b.spreker ? b.spreker + ': ' : '') + b.tekst).join('\n\n');
  return {tekst, beurten: beurten.length, sprekers: [...sprekers.keys()], vtt};
}

/* ─── 4. Gevoelige nummers ────────────────────────────────────────
   In een intake komt langs waarom iemand weg wil, wat er thuis
   speelt en soms iets over gezondheid. Dat is de kern van het
   gesprek en kan er niet uit. Een BSN, een paspoortnummer of een
   rekeningnummer is iets anders: dat voegt niets toe aan het
   antwoord en maakt elk lek een stuk ernstiger. Die gaan eruit —
   vóór het kopiëren én vóór het bewaren, zodat er maar één versie
   bestaat en niemand hoeft te onthouden welke de veilige was. */
const WEG = '[nummer weggelaten]';
const LABELS = 'bsn|burgerservice(?:nummer)?|sofi(?:nummer)?|rekening(?:nummer)?|bankrekening|iban|paspoort(?:nummer)?|identiteitsbewijs|id[-\\s]?(?:kaart|nummer|bewijs)|rijbewijsnummer|kvk(?:[-\\s]?nummer)?|btw[-\\s]?nummer';

function ontdoeNummers(t){
  let n = 0;
  let s = String(t || '');
  const tel = () => { n++; return WEG; };
  /* IBAN heeft een vaste vorm en is daarmee zonder context te herkennen. */
  s = s.replace(/\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,6}[A-Z0-9]{1,4}\b/g, tel);
  /* Achter een label mag ook iets met letters erin weg — een
     paspoortnummer is geen zuivere cijferreeks. Twee remmen: het stuk
     erachter moet met hooguit drie letters op een cijfer uitkomen, en er
     moeten vijf cijfers in zitten. Zonder die remmen wordt "mijn bsn is
     nodig voor de administratie" ook gewist, en dat is gewoon een zin. */
  /* De vooruitblik in de herhaling houdt het bij losse stukken nummer: zonder
     die eis loopt "bsn is 123456789 trouwens" door tot en met "trouwens". */
  s = s.replace(new RegExp('\\b(' + LABELS + ')\\b([\\s:=]{0,4}(?:is|luidt|nummer)?[\\s:=]{0,4})([A-Z]{0,3}\\d[\\dA-Z]*(?:[ .\\-\\/](?=[A-Z]*\\d)[\\dA-Z]+)*)', 'gi'),
    (m, a, b, d) => {
      if((d.match(/\d/g) || []).length < 5) return m;
      n++; return a + b + WEG;
    });
  /* Losse reeksen van negen cijfers of meer. Een jaartal, een
     huisnummer of een bedrag haalt dat niet; een BSN, een
     rekeningnummer en een telefoonnummer wel. */
  s = s.replace(/\b(?:\d[ .\-]?){8,}\d\b/g, tel);
  return {tekst: s, aantal: n};
}

/* ─── 5. De opdracht voor Claude ──────────────────────────────────
   Drie dingen moeten hier hard staan, want ze bepalen of het
   resultaat bruikbaar is: een vorm die deze code terug kan lezen,
   het verbod om te verzinnen, en een citaat bij elk antwoord zodat
   de recruiter kan nakijken waar iets vandaan komt. Een verzonnen
   antwoord op "verwacht je een tegenbod" is erger dan geen antwoord
   — daar wordt op gestuurd. */
function veldLijst(){
  let blok = '', uit = [];
  VRAGEN.forEach(v => {
    if(v.blok !== blok){ blok = v.blok; uit.push('', blok); }
    let r = '  ' + v.k + ' — ' + v.vraag;
    if(v.soort === 'keuze')
      r += '\n      keuze: ' + v.opties.map(o => '"' + o + '"').join(' of ') + ', of "" als het niet ter sprake kwam';
    if(v.soort === 'cijfer')
      r += '\n      een geheel getal 1 t/m 10 als tekst, of "" als er geen cijfer genoemd is';
    if(v.vat)
      r += '\n      mag je samenvatten over het hele gesprek, maar nog steeds alleen uit wat er gezegd is';
    if(v.hint) r += '\n      ' + v.hint;
    uit.push(r);
  });
  return uit.join('\n').trim();
}

function promptMaken(c, tekst){
  const context = [
    c && c.functie ? 'Gezochte functie: ' + c.functie : '',
    c && c.klant   ? 'Opdrachtgever: ' + c.klant : ''
  ].filter(Boolean).join('\n');

  return `Je helpt een recruiter van Ploeggenoten met het uitwerken van een video-intake.
Ploeggenoten bemiddelt mensen in productie, logistiek en industrie.
${context ? '\n' + context + '\n' : ''}
Hieronder staat eerst de vragenlijst, daarna het transcript van het gesprek.
Vul de vragenlijst in op basis van wat er in dat gesprek gezegd is.

REGELS
1. Verzin niets. Staat een antwoord niet in het gesprek, laat dat veld dan leeg
   (""). Op deze antwoorden wordt gestuurd: een gok die er zeker uitziet wordt
   nooit meer gecorrigeerd. Bij twijfel leeg laten.
2. Leid niets af uit wat gebruikelijk is of wat je zou verwachten. Alleen wat
   er letterlijk gezegd is telt.
3. Antwoord in het Nederlands, ook als het gesprek deels in een andere taal is
   gevoerd. Het citaat laat je in de oorspronkelijke taal staan, onvertaald.
4. Zet bij elk ingevuld veld een letterlijk citaat uit het transcript, precies
   zoals het er staat. Kun je geen citaat aanwijzen, laat "citaat" dan leeg en
   vraag jezelf af of het antwoord er wel echt staat.
5. Schrijf kort en feitelijk, in de woorden van de kandidaat. Geen wervende
   toon, geen vaktaal, geen uitroeptekens.
6. Antwoord met uitsluitend het JSON-object hieronder. Geen inleiding, geen
   toelichting eromheen, geen code-blok.

VORM — precies deze sleutels, allemaal aanwezig, met een lege waarde als het
antwoord er niet is:

{
${SLEUTELS.map(k => `  "${k}": {"waarde": "", "citaat": ""}`).join(',\n')}
}

DE VELDEN

${veldLijst()}

=== TRANSCRIPT ===
${tekst}
=== EINDE TRANSCRIPT ===

Geef nu het JSON-object.`;
}

/* ─── 6. Het antwoord teruglezen ──────────────────────────────────
   Mensen plakken er tekst omheen, of maar de helft, of het model zet
   er een code-blok omheen. Stil falen is hier het ergste wat er kan
   gebeuren: dan denkt iemand dat de intake gevuld is terwijl er
   niets gebeurd is. Dus: herstellen wat te herstellen valt, en
   eerlijk zeggen wat er niet gelukt is. */
function blokVan(s, start){
  let diepte = 0, inStr = false, esc = false;
  for(let i = start; i < s.length; i++){
    const ch = s[i];
    if(inStr){
      if(esc) esc = false;
      else if(ch === '\\') esc = true;
      else if(ch === '"') inStr = false;
      continue;
    }
    if(ch === '"') inStr = true;
    else if(ch === '{') diepte++;
    else if(ch === '}'){ diepte--; if(diepte === 0) return s.slice(start, i + 1); }
  }
  return s.slice(start);                    // afgekapt antwoord: geven we terug zoals het is
}

/* Kleine reparaties die de betekenis niet veranderen: slimme
   aanhalingstekens, een komma vóór de sluithaak, een regel commentaar. */
function herstelJson(s){
  return s
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
}

/* Eén waarde vanaf positie i, zo tolerant mogelijk. Geeft undefined
   als er niets te lezen viel. */
function leesWaarde(s, i){
  while(i < s.length && /\s/.test(s[i])) i++;
  if(i >= s.length) return undefined;
  if(s[i] === '"'){
    let uit = '', esc = false;
    for(let j = i + 1; j < s.length; j++){
      const ch = s[j];
      if(esc){
        uit += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '' : ch === 'u' ? '' : ch;
        if(ch === 'u'){ try{ uit += String.fromCharCode(parseInt(s.substr(j + 1, 4), 16)); }catch(e){} j += 4; }
        esc = false; continue;
      }
      if(ch === '\\'){ esc = true; continue; }
      if(ch === '"') return uit;
      uit += ch;
    }
    return uit;                              // niet afgesloten: nemen we wat er staat
  }
  if(s[i] === '{'){
    const b = blokVan(s, i);
    try{ return JSON.parse(b); }catch(e){}
    const r = {};
    ['waarde','citaat','value','antwoord','quote'].forEach(n => {
      const m = new RegExp('"' + n + '"\\s*:\\s*').exec(b);
      if(m){ const w = leesWaarde(b, m.index + m[0].length); if(w !== undefined) r[n] = w; }
    });
    return Object.keys(r).length ? r : undefined;
  }
  if(s[i] === '['){
    const m = /^\[[^\]]*\]/.exec(s.slice(i));
    if(m){ try{ return JSON.parse(m[0]); }catch(e){ return m[0].replace(/^\[|\]$/g, ''); } }
  }
  const m = /^[^,}\n]*/.exec(s.slice(i));
  const rest = (m ? m[0] : '').trim();
  if(!rest || rest === 'null') return '';
  return rest;
}

/* Sleutel voor sleutel eruit vissen. Dit is de vangnetroute als het
   hele object niet te parsen is — bij een afgekapt antwoord levert
   dit alsnog alle velden op die er wél helemaal in staan. */
function losseVelden(s){
  const uit = {};
  SLEUTELS.forEach(k => {
    const m = new RegExp('"' + k + '"\\s*:\\s*').exec(s);
    if(!m) return;
    const w = leesWaarde(s, m.index + m[0].length);
    if(w !== undefined) uit[k] = w;
  });
  return uit;
}

const KEUZE_SYN = {'j':'ja','yes':'ja','y':'ja','n':'nee','no':'nee','geen':'nee','maybe':'misschien','mogelijk':'misschien'};

/* Uit een gelezen waarde de tekst en het citaat halen. Het model mag
   een object teruggeven of gewoon een tekst; beide accepteren we,
   want het ene voorbeeld dat afwijkt kost anders het hele veld. */
function pluk(w){
  if(w == null) return {waarde:'', citaat:''};
  if(typeof w === 'string' || typeof w === 'number') return {waarde: String(w).trim(), citaat:''};
  if(Array.isArray(w)) return {waarde: w.filter(x => x != null).map(String).join('; ').trim(), citaat:''};
  if(typeof w === 'object'){
    const v = w.waarde != null ? w.waarde : w.value != null ? w.value : w.antwoord != null ? w.antwoord : '';
    const cRaw = w.citaat != null ? w.citaat : w.quote != null ? w.quote : w.bron != null ? w.bron : '';
    const cit = Array.isArray(cRaw) ? cRaw.filter(Boolean).map(String).join(' … ') : String(cRaw || '');
    return {waarde: Array.isArray(v) ? v.map(String).join('; ').trim() : String(v == null ? '' : v).trim(),
            citaat: cit.trim()};
  }
  return {waarde:'', citaat:''};
}

const LEEG_ANTWOORD = /^(|-+|n\.?v\.?t\.?|niet genoemd|niet besproken|onbekend|geen|null|nvt|not mentioned|unknown)$/i;

function leesAntwoord(ruw){
  const fouten = [], velden = {};
  let s = String(ruw || '').trim();
  if(!s) return {velden, fouten:['Er is niets geplakt.'], onbekend:[], hoe:'leeg', aantal:0};

  /* Een code-blok eromheen is geen fout van de gebruiker maar van de
     vorm waarin een antwoord nu eenmaal komt. Gewoon afpellen. */
  s = s.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();

  const start = s.indexOf('{');
  let hoe = 'json', obj = null, blok = start >= 0 ? blokVan(s, start) : s;
  if(start >= 0){
    try{ obj = JSON.parse(blok); }
    catch(e){
      try{ obj = JSON.parse(herstelJson(blok)); hoe = 'hersteld'; }
      catch(e2){ obj = null; }
    }
  }
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)){
    const los = losseVelden(blok);
    if(!Object.keys(los).length)
      return {velden, fouten:['Hier staat geen leesbaar antwoord in. Verwacht wordt het JSON-object uit stap 2 — kopieer het antwoord van Claude nog een keer, van de eerste { tot en met de laatste }.'],
              onbekend:[], hoe:'mislukt', aantal:0};
    obj = los; hoe = 'gedeeltelijk';
  }

  /* Sleutels die wij niet kennen: melden en laten liggen. Stil
     negeren laat iemand denken dat er meer overgenomen is. */
  const bekend = new Set(SLEUTELS.concat(['klaar','op','door','videocallOp']));
  const onbekend = Object.keys(obj).filter(k => !bekend.has(k)).slice(0, 12);

  SLEUTELS.forEach(k => {
    if(!(k in obj)) return;
    const v = VRAAG[k];
    let {waarde, citaat} = pluk(obj[k]);
    if(LEEG_ANTWOORD.test(waarde)) return;

    if(v.soort === 'keuze'){
      let g = waarde.toLowerCase().replace(/[.!]+$/, '').trim();
      g = KEUZE_SYN[g] || g;
      if(!v.opties.includes(g)){
        fouten.push(`${v.k}: “${waarde}” is geen keuze uit ${v.opties.join(' / ')} — overgeslagen.`);
        return;
      }
      waarde = g;
    } else if(v.soort === 'cijfer'){
      const m = /-?\d+/.exec(waarde);
      const n = m ? Number(m[0]) : NaN;
      if(!Number.isFinite(n) || n < 1 || n > 10){
        fouten.push(`cijfer: “${waarde}” is geen getal van 1 tot en met 10 — overgeslagen.`);
        return;
      }
      waarde = n;
    } else if(!waarde){
      return;
    }
    velden[k] = {waarde, citaat};
  });

  const aantal = Object.keys(velden).length;
  if(!aantal && !fouten.length) fouten.push('Er stonden geen ingevulde velden in dit antwoord.');
  return {velden, fouten, onbekend, hoe, aantal};
}

/* ─── 7. Het voorstel ─────────────────────────────────────────────
   Zelfde regel als bij het cv inlezen: een leeg veld vullen we aan,
   een ingevuld veld raken we niet aan tenzij de recruiter dat zelf
   aanvinkt. Wie een antwoord met de hand heeft ingetypt had daar een
   reden voor, en die reden weet een transcript niet. */
function gelijk(a, b){
  return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase();
}

function voorstelMaken(c, gelezen){
  const it = (c && c.intake) || {};
  const rijen = [];
  VRAGEN.forEach(v => {
    const g = gelezen.velden[v.k];
    if(!g) return;
    const nu = it[v.k] == null ? '' : String(it[v.k]).trim();
    const nieuw = v.soort === 'cijfer' ? g.waarde : String(g.waarde).trim();
    if(!String(nieuw).trim()) return;
    if(nu && gelijk(nu, nieuw)) return;
    /* In de tabel het korte label, niet de hele vraag: drie kolommen naast
       elkaar met een vraag van twee regels leest niemand meer. De volledige
       vraag staat in het intakeformulier zelf en in de opdracht. */
    rijen.push({sleutel: v.k, label: v.kort || v.vraag, blok: v.blok, nu, nieuw,
                citaat: g.citaat || '', botst: !!nu, aan: !nu});
  });
  return rijen;
}

/* ─── 8. Het venster ──────────────────────────────────────────────
   Drie stappen onder elkaar in één venster, elk pas bruikbaar als de
   vorige klaar is. Uit elkaar trekken over drie schermen zou hier
   niets opleveren: het is één handeling die je in één keer afmaakt,
   en je wilt tijdens het plakken nog kunnen terugkijken wat je
   gekopieerd hebt. */
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB'
                            : Math.max(1, Math.round(n / 1024)) + ' kB';
const getal = n => Number(n || 0).toLocaleString('nl-NL');

function open(opts = {}){
  const c = opts.kandidaat;
  if(!c) return CRM.toast('Geen kandidaat om de intake bij te zetten', 'err');

  let bron = null;      // {tekst, ruwLengte, beurten, sprekers, bestand, gemaskeerd}
  let gelezen = null, rijen = [];

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Video-intake inlezen</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam || 'Kandidaat')}${c.functie ? ' · ' + h(c.functie) : ''}${c.klant ? ' · ' + h(c.klant) : ''}${
        c.intake && c.intake.op ? ' · intake laatst bijgewerkt ' + h(CRM.fmtDate(c.intake.op)) : ''}</p></div>
    <div class="modal-b int-b">

      <section class="int-stap" id="int_s1">
        <div class="int-kop"><span class="int-nr">1</span><b>Transcript erin</b>
          <span class="meta">.vtt uit Teams, .txt, .docx of pdf — of plakken</span></div>
        <div class="int-drop" id="int_drop">
          <input type="file" id="int_file" accept=".vtt,.srt,.txt,.md,.docx,.pdf" hidden>
          <span class="int-drop-t">Sleep het bestand hierheen of <button type="button" class="lnk" id="int_kies">kies een bestand</button></span>
        </div>
        <details class="int-plak" id="int_plak"><summary>Of plak de tekst</summary>
          <textarea id="int_tekst" rows="5" placeholder="Plak hier het transcript van het gesprek…"></textarea>
          <button type="button" class="btn ghost sm" id="int_lees">Deze tekst gebruiken</button>
        </details>
        <div id="int_bron"></div>
      </section>

      <section class="int-stap uit" id="int_s2">
        <div class="int-kop"><span class="int-nr">2</span><b>De opdracht voor Claude</b></div>
        <p class="int-privacy">Het transcript gaat hiermee naar Claude, buiten het CRM. Nummers die op een
          BSN, identiteitsbewijs of rekening lijken gaan niet mee.</p>
        <div class="int-knoprij">
          <button type="button" class="btn" id="int_kopieer" disabled>Opdracht kopiëren</button>
          <span class="meta" id="int_lengte"></span>
        </div>
        <details class="int-plak" id="int_kijk" hidden><summary>Bekijken wat er gekopieerd wordt</summary>
          <pre class="int-pre" id="int_prompt"></pre>
        </details>
      </section>

      <section class="int-stap uit" id="int_s3">
        <div class="int-kop"><span class="int-nr">3</span><b>Antwoord terugplakken</b></div>
        <textarea id="int_ant" rows="4" placeholder="Plak hier het antwoord van Claude…" disabled></textarea>
        <div class="int-knoprij">
          <button type="button" class="btn ghost" id="int_verwerk" disabled>Antwoord lezen</button>
        </div>
        <div id="int_uit"></div>
      </section>

    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Sluiten</button>
      <span class="spacer"></span>
      <button class="btn sub sm" id="int_alles" hidden>Alles aan</button>
      <button class="btn sub sm" id="int_geen" hidden>Alles uit</button>
      <button class="btn" id="int_ok" disabled>Overnemen</button>
    </div>`, {onOpen(m){

    m.classList.add('int-modal');
    CRM.modal._onClose = () => m.classList.remove('int-modal');

    const $ = s => m.querySelector(s);
    const s2 = $('#int_s2'), s3 = $('#int_s3');
    const bronUit = $('#int_bron'), uit = $('#int_uit');
    const ok = $('#int_ok'), alles = $('#int_alles'), geen = $('#int_geen');

    /* ── stap 1 ── */
    function toonBron(r, bestand, ruwLengte){
      const feiten = [
        r.vtt ? 'ondertitelbestand' : 'tekst',
        getal(r.beurten) + (r.beurten === 1 ? ' beurt' : ' beurten'),
        r.sprekers.length ? r.sprekers.length + (r.sprekers.length === 1 ? ' spreker' : ' sprekers') : 'geen sprekers herkend',
        getal(bron.tekst.length) + ' tekens over van ' + getal(ruwLengte)
      ];
      bronUit.innerHTML = `
        <div class="int-bron">
          <div class="int-bron-r"><b>${h(bestand ? bestand.name : 'Geplakte tekst')}</b>
            <span class="meta num">${h(feiten.join(' · '))}${bestand ? ' · ' + h(kb(bestand.size)) : ''}</span></div>
          ${r.sprekers.length ? `<div class="meta">Sprekers: ${h(r.sprekers.slice(0, 6).join(', '))}${r.sprekers.length > 6 ? ' en ' + (r.sprekers.length - 6) + ' meer' : ''}</div>` : ''}
          ${bron.gemaskeerd ? `<div class="meta">${getal(bron.gemaskeerd)} ${bron.gemaskeerd === 1 ? 'nummer is' : 'nummers zijn'} vervangen door ${h(WEG)}.</div>` : ''}
        </div>
        <details class="int-plak"><summary>Het opgeschoonde transcript bekijken</summary>
          <pre class="int-pre">${h(bron.tekst.slice(0, 20000))}${bron.tekst.length > 20000 ? '\n…' : ''}</pre>
        </details>`;
    }

    function verwerkTekst(ruw, bestand){
      const ruwLengte = String(ruw || '').length;
      const r = schoonTranscript(ruw);
      if(!r.tekst.trim()){
        bron = null;
        bronUit.innerHTML = `<div class="note warn">Hier bleef geen tekst van over. ${
          r.vtt ? 'Het bestand bevat wel tijdcodes maar geen ondertitelregels — waarschijnlijk is de opname wel bewaard maar de transcriptie niet gestart.'
                : 'Controleer of je het juiste bestand koos.'}</div>`;
        zetStap2(false);
        return;
      }
      const veilig = ontdoeNummers(r.tekst);
      bron = {tekst: veilig.tekst, gemaskeerd: veilig.aantal, bestand: bestand || null,
              beurten: r.beurten, sprekers: r.sprekers};
      toonBron(r, bestand, ruwLengte);
      zetStap2(true);
    }

    async function verwerkBestand(f){
      bronUit.innerHTML = CRM.ui.laden('Bestand lezen…');
      zetStap2(false);
      try{
        const r = await leesBestand(f);
        verwerkTekst(r.tekst, f);
      }catch(e){
        bron = null;
        bronUit.innerHTML = `<div class="note err">${h(e.message || 'Lezen mislukt')}</div>`;
        zetStap2(false);
      }
    }

    const drop = $('#int_drop'), file = $('#int_file');
    $('#int_kies').onclick = () => file.click();
    drop.onclick = e => { if(e.target === drop || e.target.classList.contains('int-drop-t')) file.click(); };
    /* Het veld daarna leegmaken, anders komt er bij het opnieuw kiezen van
       hetzelfde bestand geen change meer — en dat is precies wat je doet
       nadat het één keer misging. */
    file.onchange = e => { const f = e.target.files[0]; e.target.value = ''; if(f) verwerkBestand(f); };
    ['dragenter','dragover'].forEach(n => drop.addEventListener(n, e => {
      e.preventDefault(); drop.classList.add('over');
    }));
    ['dragleave','drop'].forEach(n => drop.addEventListener(n, e => {
      e.preventDefault(); drop.classList.remove('over');
    }));
    drop.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if(f) verwerkBestand(f);
    });
    $('#int_lees').onclick = () => {
      const t = $('#int_tekst').value;
      if(!t.trim()) return $('#int_tekst').focus();
      verwerkTekst(t, null);
    };

    /* ── stap 2 ── */
    let prompt = '';
    function zetStap2(aan){
      s2.classList.toggle('uit', !aan);
      $('#int_kopieer').disabled = !aan;
      $('#int_kijk').hidden = !aan;
      if(!aan){ prompt = ''; $('#int_lengte').textContent = ''; zetStap3(false); return; }
      prompt = promptMaken(c, bron.tekst);
      $('#int_prompt').textContent = prompt;
      $('#int_lengte').textContent = getal(prompt.length) + ' tekens';
      zetStap3(true);
    }

    $('#int_kopieer').onclick = async () => {
      if(!prompt) return;
      const gelukt = await kopieer(prompt);
      CRM.toast(gelukt ? 'Opdracht gekopieerd — plak hem in Claude' : 'Kopiëren lukte niet — open “Bekijken wat er gekopieerd wordt” en selecteer de tekst',
                gelukt ? 'ok' : 'err');
      if(gelukt) setTimeout(() => $('#int_ant').focus(), 120);
    };

    /* ── stap 3 ── */
    function zetStap3(aan){
      s3.classList.toggle('uit', !aan);
      $('#int_ant').disabled = !aan;
      $('#int_verwerk').disabled = !aan;
      if(!aan){ uit.innerHTML = ''; rijen = []; gelezen = null; }
      werkKnopBij();
    }

    $('#int_verwerk').onclick = () => {
      gelezen = leesAntwoord($('#int_ant').value);
      rijen = gelezen.aantal ? voorstelMaken(c, gelezen) : [];
      uit.innerHTML = voorstelHtml(c, gelezen, rijen);
      bindVoorstel(m);
      alles.hidden = geen.hidden = !rijen.length;
      werkKnopBij();
      $('#int_verwerk').textContent = 'Opnieuw lezen';
      const eerste = uit.querySelector('input[type=checkbox]');
      if(eerste) setTimeout(() => eerste.focus(), 60);
    };
    /* Twee keer achter elkaar inlezen moet gewoon werken: het tweede
       antwoord vervángt het eerste voorstel in plaats van eraan te
       plakken. Daarom wordt alles wat bij het voorstel hoort — gelezen,
       rijen én de html — in één keer opnieuw gezet. */

    function werkKnopBij(){
      const aan = rijen.some((r, i) => {
        const b = uit.querySelector(`input[data-veld="${i}"]`);
        return b ? b.checked : r.aan;
      });
      ok.disabled = !bron && !aan;
      ok.textContent = aan ? 'Overnemen' : (bron ? 'Alleen transcript bewaren' : 'Overnemen');
    }

    const zetAlles = a => {
      uit.querySelectorAll('input[type=checkbox]').forEach(b => {
        b.checked = a; b.dispatchEvent(new Event('change', {bubbles:true}));
      });
      werkKnopBij();
    };
    alles.onclick = () => zetAlles(true);
    geen.onclick  = () => zetAlles(false);
    m.addEventListener('change', e => { if(e.target.matches('input[data-veld]')) werkKnopBij(); });

    ok.onclick = async () => {
      const tekst = ok.textContent;
      ok.disabled = true; ok.textContent = 'Bezig…';
      try{ await overnemen(c, rijen, uit, bron, opts.onKlaar); }
      catch(e){ CRM.fout('Opslaan mislukt', e); ok.disabled = false; ok.textContent = tekst; }
    };
  }});
}

/* Kopiëren met een terugval: zonder https is de clipboard-api er niet,
   en op de dev-server werkt de app juist zonder. */
async function kopieer(tekst){
  try{
    if(navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(tekst); return true; }
    throw new Error('geen clipboard-api');
  }catch(e){
    const ta = document.createElement('textarea');
    ta.value = tekst; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let gelukt = false;
    try{ gelukt = document.execCommand('copy'); }catch(e2){}
    ta.remove();
    return gelukt;
  }
}

function voorstelHtml(c, g, rijen){
  const melding = [];
  if(g.hoe === 'hersteld')
    melding.push('<div class="note info">Het antwoord stond er niet helemaal netjes in; kleine dingen zijn hersteld. Loop de waarden even na.</div>');
  if(g.hoe === 'gedeeltelijk')
    melding.push('<div class="note warn">Het antwoord was niet als geheel te lezen — waarschijnlijk is het halverwege afgekapt. Wat er wél volledig in stond staat hieronder; de rest ontbreekt.</div>');
  if(g.fouten.length)
    melding.push(`<div class="note ${g.aantal ? 'warn' : 'err'}"><b>Niet alles is gelukt.</b><ul class="int-fout">${
      g.fouten.map(f => `<li>${h(f)}</li>`).join('')}</ul></div>`);
  if(g.onbekend.length)
    melding.push(`<div class="note info">Velden die wij niet kennen zijn genegeerd: ${h(g.onbekend.join(', '))}.</div>`);

  if(!rijen.length)
    return melding.join('') + (g.aantal
      ? '<div class="note ok">Alles wat er stond staat al zo in de intake. Er is niets te wijzigen.</div>'
      : '');

  const nietGevonden = SLEUTELS.filter(k => !g.velden[k]);
  let blok = '';
  const regels = rijen.map((r, i) => {
    const kop = r.blok !== blok ? (blok = r.blok, `<div class="int-blok">${h(r.blok)}</div>`) : '';
    return kop + `<label class="int-rij${r.botst ? ' botst' : ''}">
      <input type="checkbox" data-veld="${i}"${r.aan ? ' checked' : ''}>
      <span class="int-lbl">${h(r.label)}</span>
      <span class="int-nu">${r.nu ? h(r.nu) : '<em class="meta">leeg</em>'}</span>
      <span class="int-nieuw">${h(r.nieuw)}${
        r.citaat ? `<span class="int-citaat">“${h(r.citaat)}”</span>` : '<span class="int-citaat leeg">geen citaat meegegeven</span>'}</span>
    </label>`;
  }).join('');

  return melding.join('') + `
    <div class="int-kop2"><b>Voorstel</b>
      <span class="meta"><span class="num">${rijen.length}</span> van de <span class="num">${SLEUTELS.length}</span> velden ·
      lege velden staan aan, bestaande antwoorden uit</span></div>
    <div class="int-tabel">
      <div class="int-hoofd"><span></span><span>Vraag</span><span>Nu in de intake</span><span>Uit het gesprek</span></div>
      ${regels}
    </div>
    ${nietGevonden.length ? `<p class="meta int-mist">Niet in het gesprek gevonden: ${
      h(nietGevonden.map(k => (VRAAG[k].kort || k).toLowerCase()).join(', '))}. Die vragen vul je zelf aan in het intakeformulier.</p>` : ''}`;
}

function bindVoorstel(m){
  m.querySelectorAll('.int-rij').forEach(el => {
    const b = el.querySelector('input[type=checkbox]');
    if(!b) return;
    const teken = () => el.classList.toggle('uit', !b.checked);
    b.addEventListener('change', teken); teken();
  });
}

/* ─── 9. Overnemen en bewaren ─────────────────────────────────── */
async function overnemen(c, rijen, uit, bron, onKlaar){
  const gedaan = [];
  /* Samenvoegen met wat er al staat, niet vervangen: videocallOp en de
     antwoorden die de recruiter zelf heeft ingetypt moeten blijven. */
  const intake = Object.assign({}, c.intake || {});
  let gewijzigd = 0;

  uit.querySelectorAll('input[data-veld]').forEach(b => {
    if(!b.checked) return;
    const r = rijen[+b.dataset.veld];
    if(!r) return;
    intake[r.sleutel] = r.nieuw;
    gewijzigd++;
  });
  if(gewijzigd){
    intake.op = CRM.todayISO();
    intake.door = CRM.me();
    intake.bron = 'transcript';
    c.intake = intake;
    gedaan.push(gewijzigd + (gewijzigd === 1 ? ' antwoord' : ' antwoorden'));
  }

  const bewaard = bron ? await bewaarTranscript(c, bron) : 0;
  if(bewaard) gedaan.push(bewaard === 2 ? 'het transcript en het bronbestand' : 'het transcript');

  if(gewijzigd) await bewaarKandidaat(c);

  if(gedaan.length)
    await CRM.logActiviteit('kandidaat', c.id, 'gesprek',
      `Video-intake uit het transcript ingelezen. Overgenomen: ${gedaan.join(', ')}.` +
      (intake.cijfer ? ` Commitment ${intake.cijfer}/10.` : ''));

  CRM.modal.close();
  CRM.toast(gedaan.length ? 'Intake bijgewerkt' : 'Niets gewijzigd', 'ok');
  if(onKlaar) onKlaar(c); else CRM.render();
}

async function bewaarKandidaat(c){
  const i = (CRM.state.cands || []).findIndex(r => String(r.id) === String(c.id));
  if(i >= 0) CRM.state.cands[i] = Object.assign({}, CRM.state.cands[i], CRM.candToRow(c));
  if(CRM.demo) return;
  const {error} = await CRM.sb.from('candidates').update(CRM.candToRow(c)).eq('id', c.id);
  if(error) throw error;
}

/* Een pad dat niet botst en niet te raden is — zelfde vorm als bij het
   cv. De map is afgeschermd, maar een pad dat je uit een naam kunt
   afleiden is alsnog een uitnodiging. */
function veiligeNaam(n){
  return String(n || 'transcript').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_').replace(/_{2,}/g, '_').slice(-60);
}

/* Het transcript zelf is de helft van de opbrengst: de samenvatting
   zegt wát er speelt, het transcript zegt hoe het gezegd is. Twee
   bestanden: de opgeschoonde tekst (doorzoekbaar, zonder tijdcodes) en
   het bestand zoals het binnenkwam, als dat er was. */
async function bewaarTranscript(c, bron){
  if(!bron || !bron.tekst) return 0;
  const kop = `Video-intake · ${c.naam || ''}\nOpgeslagen ${CRM.fmtDate(CRM.todayISO())} door ${CRM.me()}\n` +
              `${bron.beurten} beurten${bron.sprekers.length ? ' · ' + bron.sprekers.join(', ') : ''}\n` +
              '─'.repeat(48) + '\n\n';
  const blob = new Blob([kop + bron.tekst], {type: 'text/plain;charset=utf-8'});
  const naam = `intake-${CRM.todayISO()}-${veiligeNaam(c.naam || c.id)}.txt`;

  if(CRM.demo){
    /* In demo-modus wordt er niets geüpload. Wel een rij in het geheugen,
       zodat de knoppen op de kaart echt iets doen als je het uitprobeert. */
    voegDocToe(c, {naam, soort:'Intake-transcript', url: URL.createObjectURL(blob), grootte: blob.size}, true);
    CRM.toast('Demo: het transcript wordt niet geüpload');
    return 1;
  }

  const stam = `kandidaten/${String(c.id).replace(/[^\w-]/g, '')}/intake/${CRM.todayISO()}-${Math.random().toString(36).slice(2, 8)}`;
  let n = 0;
  const pad = `${stam}-transcript.txt`;
  const up = await CRM.sb.storage.from(CRM.opslag.map).upload(pad, blob, {upsert:false, contentType:'text/plain;charset=utf-8'});
  if(up.error){ CRM.toast(CRM.opslag.foutTekst(up.error), 'err'); return 0; }
  CRM.opslag.wis(pad);
  await voegDocToe(c, {naam, soort:'Intake-transcript', url: pad, grootte: blob.size});
  n++;

  if(bron.bestand){
    const bpad = `${stam}-bron-${veiligeNaam(bron.bestand.name)}`;
    const up2 = await CRM.sb.storage.from(CRM.opslag.map).upload(bpad, bron.bestand, {upsert:false});
    if(!up2.error){
      CRM.opslag.wis(bpad);
      await voegDocToe(c, {naam: bron.bestand.name, soort:'Intake-origineel', url: bpad, grootte: bron.bestand.size});
      n++;
    }
  }
  return n;
}

async function voegDocToe(c, d, alleenLokaal){
  const rij = {id: CRM.uid(), entiteit:'kandidaat', ref: String(c.id), naam: d.naam, soort: d.soort,
               url: d.url, grootte: d.grootte || null, door: CRM.me(), op: new Date().toISOString()};
  if(!Array.isArray(CRM.state.documenten)) CRM.state.documenten = [];
  CRM.state.documenten.unshift(rij);
  if(alleenLokaal || CRM.demo) return;
  const {error} = await CRM.sb.from('crm_documenten').insert(rij);
  if(error){
    CRM.state.documenten.shift();
    CRM.fout('Transcript vastleggen mislukt', error);
  }
}

/* ─── 10. Op de kandidatenkaart ───────────────────────────────────
   Zelfde patroon als js/cvparse.js en js/opvolging.js: deze module
   levert het blok en de knoppen, de kaart hoeft alleen te weten waar
   het moet staan. */
function transcripten(c){
  if(!c) return [];
  return (CRM.state.documenten || [])
    .filter(d => d.entiteit === 'kandidaat' && String(d.ref) === String(c.id) && /^Intake-/.test(d.soort || ''))
    .sort((a, b) => String(b.op || '').localeCompare(String(a.op || '')));
}

function blokHtml(c){
  const docs = transcripten(c);
  if(!docs.length) return '';
  return `<div class="int-doc">
    ${docs.map(d => `<div class="int-doc-r">
      <span class="int-doc-ic">▤</span>
      <div class="int-doc-t"><b>${h(d.naam || 'Transcript')}</b>
        <span class="meta num">${h([d.op ? CRM.fmtDate(d.op) : '', d.door,
          d.soort === 'Intake-origineel' ? 'bronbestand' : 'opgeschoond',
          d.grootte ? kb(d.grootte) : ''].filter(Boolean).join(' · '))}</span></div>
      ${d.soort === 'Intake-transcript'
        ? `<button type="button" class="btn ghost sm" data-intzoek="${h(d.id)}">Doorzoeken</button>` : ''}
      <button type="button" class="btn sub sm" data-intopen="${h(d.url)}">Openen</button>
    </div>`).join('')}
  </div>`;
}

function bindBlok(mount){
  if(!mount) return;
  mount.querySelectorAll('[data-intopen]').forEach(b => b.onclick = () => CRM.opslag.open(b.dataset.intopen));
  mount.querySelectorAll('[data-intzoek]').forEach(b => b.onclick = () => {
    const d = (CRM.state.documenten || []).find(x => String(x.id) === b.dataset.intzoek);
    if(d) zoekVenster(d);
  });
}

/* Terugvinden wat er precies gezegd is, is soms meer waard dan de
   samenvatting: "hij zei dat hij niet in ploegen wilde" is iets anders
   dan "hij zei dat hij liever geen nachten draait". De tekst wordt pas
   opgehaald als je hem opvraagt — het staat niet in het geheugen van
   elke browser die de kaart opent. */
function zoekVenster(d){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Transcript doorzoeken</div>
      <p class="sub" style="margin:6px 0 0">${h(d.naam || '')}${d.op ? ' · ' + h(CRM.fmtDate(d.op)) : ''}</p></div>
    <div class="modal-b int-b">
      <div class="f-row"><label for="int_zq">Zoeken</label>
        <input type="search" id="int_zq" placeholder="Bijvoorbeeld: ploegen, reistijd, opzegtermijn" disabled></div>
      <div id="int_zuit">${CRM.ui.laden('Transcript ophalen…')}</div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Sluiten</button></div>`, {async onOpen(m){
      m.classList.add('int-modal');
      CRM.modal._onClose = () => m.classList.remove('int-modal');
      const uit = m.querySelector('#int_zuit'), q = m.querySelector('#int_zq');
      const {url, fout} = await CRM.opslag.link(d.url);
      if(fout){ uit.innerHTML = `<div class="note err">${h(fout)}</div>`; return; }
      let tekst = '';
      try{
        const r = await fetch(url);
        if(!r.ok) throw new Error('status ' + r.status);
        tekst = await r.text();
      }catch(e){
        uit.innerHTML = `<div class="note err">Het transcript kon niet opgehaald worden. Probeer het te openen met de knop op de kaart.</div>`;
        return;
      }
      const stukken = tekst.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
      q.disabled = false;
      const teken = () => {
        const z = q.value.trim().toLowerCase();
        const treffers = z ? stukken.filter(s => s.toLowerCase().includes(z)) : stukken;
        if(!treffers.length){
          uit.innerHTML = `<div class="note info">Geen enkele regel bevat “${h(q.value.trim())}”.</div>`;
          return;
        }
        uit.innerHTML = `<p class="meta">${z ? getal(treffers.length) + ' van ' + getal(stukken.length) + ' stukken' : getal(stukken.length) + ' stukken'}</p>
          <div class="int-zlijst">${treffers.slice(0, 400).map(s => `<p>${markeer(s, z)}</p>`).join('')}</div>
          ${treffers.length > 400 ? '<p class="meta">Alleen de eerste 400 stukken staan hier; zoek preciezer om de rest te zien.</p>' : ''}`;
      };
      q.oninput = CRM.debounce(teken, 180);
      teken();
      setTimeout(() => q.focus(), 60);
    }});
}

function markeer(s, z){
  if(!z) return h(s);
  const laag = s.toLowerCase();
  let uit = '', i = 0;
  for(;;){
    const j = laag.indexOf(z, i);
    if(j < 0){ uit += h(s.slice(i)); break; }
    uit += h(s.slice(i, j)) + '<mark>' + h(s.slice(j, j + z.length)) + '</mark>';
    i = j + z.length;
  }
  return uit;
}

CRM.intakeAI = {open, blokHtml, bindBlok, schoonTranscript, ontdoeNummers, leesAntwoord, promptMaken, VRAGEN};

})();

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN COORDINATOR

   1. index.html — twee regels erbij, met het huidige versiemerk.

      Bij de stylesheets, direct ná css/cvparse.css:
        <link rel="stylesheet" href="css/intake.css?v=20260731h">

      Bij de scripts, ná js/cvparse.js (dit bestand leent daar het
      lezen van .docx en pdf van) en vóór js/kandidaten.js en
      js/recruitment.js:
        <script src="js/intake.js?v=20260731h"></script>

      Zonder die regels breekt er niets: alle aanroepers hieronder zijn
      defensief geschreven, er gebeurt dan alleen niets bij een klik.

   2. js/recruitment.js — één regel erbij, in intakeForm(), in de
      knoppenbalk onderaan (nu regel 3521, in `<div class="modal-f">`),
      links naast "Sluiten":

        <button class="btn ghost" id="in_uittranscript">Uit transcript</button>

      en in onOpen(m), naast de andere knoppen:

        const trKnop = m.querySelector('#in_uittranscript');
        if(trKnop) trKnop.onclick = () => {
          if(!CRM.intakeAI) return CRM.toast('Transcript inlezen is nu niet beschikbaar','err');
          CRM.modal.close();
          CRM.intakeAI.open({kandidaat:c, onKlaar:() => intakeForm(c.id)});
        };

      Het formulier eerst sluiten is nodig omdat er maar één modal is;
      de onKlaar zet hem daarna weer open, nu gevuld.

      Optioneel, maar het scheelt zoeken: dezelfde aanroep als tweede
      knop naast "Intake invullen" op de kandidaatkaart in het bord.

   3. js/kandidaten.js — twee plekken.

      a. Het transcript tonen in het Intake-blok. In intakeHtml(),
         binnen `<div class="card-b">`, direct vóór `<div class="kd-velden">`:
           ${CRM.intakeAI ? CRM.intakeAI.blokHtml(c) : ''}

         En in de lege variant (de `if(!i) return ...` erboven) hetzelfde,
         vóór CRM.ui.leeg(...) — een transcript zonder ingevulde intake
         moet ook te vinden zijn.

      b. In de bind-functie van de kaart, naast
         `if(CRM.cvParse) CRM.cvParse.bindBestand(mount);` (nu regel 979):
           if(CRM.intakeAI) CRM.intakeAI.bindBlok(mount);

      c. Optioneel: een tweede knop in de kop van het Intake-blok,
         naast `knop`:
           <button class="btn ghost sm" id="c_intr">Uit transcript</button>
         met in de bind-functie:
           klik('#c_intr', () => CRM.intakeAI &&
             CRM.intakeAI.open({kandidaat:c, onKlaar:() => CRM.render()}));

   4. js/recruitment.js — intakeForm() overschrijft nu het hele
      intake-object bij opslaan en bewaart alleen videocallOp. Deze
      module zet er `bron:'transcript'` bij; dat is geen ramp om te
      verliezen, maar het is wel de enige plek waar staat dat een
      antwoord uit een transcript kwam en niet uit de mond van de
      recruiter. Eén regel bij de andere:
        bron: it.bron || '',

      Het transcript zelf staat in crm_documenten en overleeft dit hoe
      dan ook — dat is bewust zo gekozen.

   5. supabase/schema.sql — niets verplicht.
      Er wordt geschreven naar `candidates.intake` (jsonb, bestaat) en
      naar `crm_documenten` met entiteit 'kandidaat' en ref = het
      kandidaat-id. Dat is precies de vorm die js/kandverwijder.js al
      opruimt bij het verwijderen van een kandidaat, dus een transcript
      verdwijnt netjes mee.

      Wél het overwegen waard: crm_documenten heeft geen kolom voor de
      tekst zelf. Doorzoeken gebeurt daarom nu per transcript, in het
      venster, ná het ophalen van het bestand. Wil Tjeerd ooit over álle
      intakes heen kunnen zoeken ("wie noemde reistijd als bezwaar"),
      dan is dat een kolom `tekst text` plus een index erbij:
        alter table crm_documenten add column if not exists tekst text;
        create index if not exists crm_doc_tekst on crm_documenten
          using gin (to_tsvector('dutch', coalesce(tekst,'')));
      Zeg het als dat er komt, dan schrijft deze module de tekst mee.

   6. Voor Tjeerd, los van de code: Teams zet een transcriptie pas aan
      als iemand daar tijdens de call op drukt. Staat dat niet aan, dan
      is er achteraf alleen een opname en levert dit venster niets op.
      Dat is één instelling per vergadering — of één keer centraal in
      het Teams-beheer.
   ═══════════════════════════════════════════════════════════════ */
