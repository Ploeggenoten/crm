/* ═══════════════════════════════════════════════════════════════
   CV INLEZEN — CRM.cvParse
   Eén plek voor het lezen van een cv-bestand: tekst eruit halen,
   die tekst uitpluizen, het resultaat naast de kandidatenkaart
   leggen, en het bestand zelf bewaren in de afgeschermde map.

   Waarom niet de oude parser uitbreiden: die las een pdf regel voor
   regel op y-positie. Bij een cv met een zijbalk (contactgegevens
   links, werkervaring rechts) worden die twee kolommen dan door
   elkaar geweven en is er niets meer van te maken. Een betere
   tekstlaag levert meer op dan slimmere regexes op kapotte tekst,
   dus daar begint dit bestand.

   TESTEN: er staat een vaste set van zeven echte cv's (zeven
   verschillende opmaken) in ~/cv-testset, met meetscript en
   ijkpunten in LEESMIJ.md aldaar. Meet ná elke wijziging de hele
   set — elke reparatie voor het ene cv heeft al eens een ander cv
   gebroken. De cv's horen NIET in deze (publieke) repo.
   ═══════════════════════════════════════════════════════════════ */
(() => {
'use strict';
const h = CRM.h;

/* Wat we bewust NIET overnemen, ook niet als het in het cv staat.
   Dit zijn gegevens die we niet willen bezitten: ze leveren niets op
   voor een bemiddeling en ze maken een datalek veel ernstiger. Ze
   worden niet gelezen, niet getoond en niet gemeld — ook niet als
   "we vonden een BSN maar sloegen hem over", want ook dat is al een
   bevestiging die op een scherm terechtkomt. */

/* ─── 1. pdf.js ───────────────────────────────────────────────── */
let _pdfjs = null;
function laadPdfJs(){
  if(_pdfjs) return _pdfjs;
  _pdfjs = new Promise((res, rej) => {
    if(window.pdfjsLib) return res(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = () => {
      try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; }catch(e){}
      res(window.pdfjsLib);
    };
    s.onerror = () => { _pdfjs = null; rej(new Error('pdf.js kon niet geladen worden. Controleer je internetverbinding.')); };
    document.head.appendChild(s);
  });
  return _pdfjs;
}

/* ─── 2. Tekstlaag uit een pdf ────────────────────────────────────
   Drie stappen, en de volgorde is de hele truc:
   a. losse tekstfragmenten met hun plek op de pagina verzamelen;
   b. ze tot regels samenvoegen op regelhoogte (niet op een vaste
      marge van 3 punten — een cv met 8-punts zijbalk naast 11-punts
      hoofdtekst valt daar doorheen);
   c. per regel kijken of er een groot horizontaal gat in zit. Zit
      dat gat bij véél regels op ongeveer dezelfde plek, dan is het
      een kolomscheiding en lezen we eerst de ene kolom en dan de
      andere. Zit het maar bij een paar regels, dan is het een tabel-
      regel ("Meijer Techniek, Apeldoorn ..... aug 2025 – heden") en
      blijven die twee bij elkaar, gescheiden door een tab.
   Die tab is later goud waard: hij zegt "dit waren twee cellen",
   en dan weet de werkervaring-parser dat het linkerdeel de werkgever
   is en het rechterdeel de periode. */

const TAB = '\t';

async function pdfTekst(file, opts={}){
  const lib = await laadPdfJs();
  let doc;
  try{
    doc = await lib.getDocument({data: await file.arrayBuffer(), password: opts.wachtwoord || ''}).promise;
  }catch(e){
    if(e && (e.name === 'PasswordException' || /password/i.test(e.message||'')))
      throw new Error('Deze pdf is met een wachtwoord beveiligd. Vraag de kandidaat om een versie zonder wachtwoord.');
    throw new Error('Deze pdf kon niet geopend worden — mogelijk is het bestand beschadigd.');
  }
  const paginas = [];
  let groot = [];
  const max = Math.min(doc.numPages, 12);      // 10+ jaar werkverleden past ruim in 12 pagina's
  for(let p = 1; p <= max; p++){
    const page = await doc.getPage(p);
    const vp = page.getViewport({scale:1});
    const tc = await page.getTextContent();
    paginas.push(paginaRegels(tc.items, vp.width, vp.height, opts.zonderKolommen));
    if(p === 1) groot = groteRegels(tc.items, vp.width, vp.height);
  }
  return {
    tekst: paginas.join('\n\n'), groot,
    doc, numPages: doc.numPages,
    afgekapt: doc.numPages > max
  };
}

/* Fragmenten → regels → leesvolgorde, voor één pagina.
   `zonderKolommen` slaat de kolomdetectie over: die is voor cv's met een
   zijbalk, maar bij een overeenkomst is hij schadelijk — een smalle
   tarieventabel (Functie | Factor) trok daar een "witte baan" over de
   hele pagina, waardoor functienamen en factoren twintig regels uit
   elkaar belandden en zelfs lopende zinnen doormidden gingen.
   (Staalduinen-overeenkomst, 5 aug 2026.) */
function paginaRegels(items, breedte, hoogte, zonderKolommen){
  const frag = [];
  items.forEach(it => {
    const s = it.str;
    if(!s || !s.trim()) return;
    const t = it.transform;
    /* transform = [a,b,c,d,e,f]; d is de verticale schaal van de letter,
       dus de fonthoogte. e/f is de linkeronderhoek van het fragment. */
    const hgt = Math.abs(t[3]) || Math.abs(it.height) || 10;
    frag.push({s, x:t[4], y: hoogte - t[5], w: it.width || 0, hg: hgt});
  });
  if(zonderKolommen) return frag.length ? regelsTekst(frag, breedte) : '';
  return kolommenTekst(frag, breedte, hoogte, 0);
}

/* De regels in het grootste lettertype op de bovenste helft van pagina 1.
   Daar staat in vrijwel elk cv de naam. We leveren ze apart aan omdat je
   in de platte tekst niet meer ziet wat groot stond, en een losse voornaam
   is dan niet te onderscheiden van het kopje "Contact". */
function groteRegels(items, breedte, hoogte){
  const frag = [];
  items.forEach(it => {
    if(!it.str || !it.str.trim()) return;
    const hg = Math.abs(it.transform[3]) || 10;
    frag.push({s:it.str, x:it.transform[4], y: hoogte - it.transform[5], w: it.width || 0, hg});
  });
  if(frag.length < 3) return [];
  const hoogtes = frag.map(f => f.hg).sort((a,b) => a - b);
  const midden = hoogtes[Math.floor(hoogtes.length / 2)];
  const boven = frag.filter(f => f.hg >= midden * 1.35 && f.y < hoogte * 0.5);
  if(!boven.length) return [];
  const tekst = regelsTekst(boven, breedte);
  return tekst.split('\n').map(r => r.replace(/\t/g,' ').trim()).filter(Boolean).slice(0, 6);
}

/* Eerst kolommen, dan pas regels. Andersom gaat het mis: een zijbalk en
   de hoofdtekst staan op dezelfde hoogte, dus wie eerst regels maakt
   weeft ze door elkaar en krijgt het telefoonnummer uit de zijbalk op één
   regel met de functietitel ernaast. Dat is precies wat de oude parser deed. */
function kolommenTekst(frag, breedte, hoogte, diepte){
  if(!frag.length) return '';
  const grens = diepte < 2 ? witteBaan(frag, breedte) : null;
  if(grens == null) return regelsTekst(frag, breedte);
  /* Indelen op de linkerrand, niet op de rechterrand: een naam in een groot
     lettertype steekt makkelijk over de baan heen, en die hoort natuurlijk
     bij de kolom waarin hij begint. */
  const links = frag.filter(f => f.x < grens);
  const rechts = frag.filter(f => f.x >= grens);
  /* Smalle zijbalk eerst, daarna de hoofdtekst — dat is de leesvolgorde
     die een mens ook aanhoudt, en de kopjes blijven bij hun eigen blok.
     De \f ertussen zegt later "hier begint een nieuwe kolom": zonder dat
     merk loopt de kop "Vaardigheden" uit de zijbalk door over de hele
     rechterkolom, en wordt de naam van de kandidaat een vaardigheid. */
  return [links, rechts].filter(g => g.length)
    .map(g => kolommenTekst(g, breedte, hoogte, diepte + 1)).join('\n\f\n');
}

/* Zit er een verticale strook over de hele pagina waar geen letter doorheen
   loopt? Dan zijn het twee kolommen. Dit is een sterker signaal dan "veel
   regels hebben een gat op dezelfde plek": een zijbalk met zes regels naast
   een hoofdtekst met dertig regels levert nauwelijks gaten op, maar wel een
   kaarsrechte witte baan.
   Eisen: minstens 10pt breed, in het middengebied, en aan wéérszijden moet
   tekst staan die een flink stuk van de pagina beslaat — anders is het
   gewoon een brede rechtermarge. */
function witteBaan(frag, breedte){
  if(frag.length < 12) return null;
  const stap = 2, van = Math.round(breedte * 0.15), tot = Math.round(breedte * 0.80);
  /* Eén of twee uitschieters mogen de baan niet meteen afkeuren: een naam in
     een kopregel steekt vaak net over de kolomgrens heen, en dan zou een cv
     dat verder kaarsrecht in twee kolommen staat alsnog verweven worden. */
  const speling = Math.max(1, Math.round(frag.length * 0.01));
  const vrij = [];
  for(let x = van; x <= tot; x += stap){
    let raakt = 0;
    for(const f of frag){ if(f.x < x && (f.x + (f.w||0)) > x && ++raakt > speling) break; }
    vrij.push(raakt > speling ? 0 : 1);
  }
  /* Langste aaneengesloten vrije strook zoeken. */
  let besteStart = -1, besteLengte = 0, start = -1;
  for(let i = 0; i <= vrij.length; i++){
    if(vrij[i]) { if(start < 0) start = i; }
    else if(start >= 0){
      if(i - start > besteLengte){ besteLengte = i - start; besteStart = start; }
      start = -1;
    }
  }
  if(besteLengte * stap < 10) return null;
  const grens = van + (besteStart + besteLengte / 2) * stap;

  const links = frag.filter(f => f.x + (f.w||0) <= grens);
  const rechts = frag.filter(f => f.x + (f.w||0) > grens);
  if(links.length < 5 || rechts.length < 5) return null;
  /* Allebei de kolommen moeten echt een kolom zijn: verspreid over een
     halve pagina. Een losse regeltje links bovenin is geen zijbalk. */
  const spreiding = g => Math.max(...g.map(f => f.y)) - Math.min(...g.map(f => f.y));
  const totaal = spreiding(frag) || 1;
  if(spreiding(links) < totaal * 0.45 || spreiding(rechts) < totaal * 0.45) return null;
  return grens;
}

/* Binnen één kolom: fragmenten tot regels samenvoegen op regelhoogte.
   Niet op een vaste marge van 3 punten — een cv met 8-punts zijbalk naast
   11-punts hoofdtekst valt daar doorheen, en een licht scheve regel breekt
   dan middenin een woord. */
function regelsTekst(frag, breedte){
  frag = frag.slice().sort((a,b) => a.y - b.y || a.x - b.x);
  const regels = [];
  let huidig = [frag[0]];
  for(let i = 1; i < frag.length; i++){
    const f = frag[i];
    const marge = Math.max(2, Math.min(f.hg, huidig[0].hg) * 0.6);
    if(Math.abs(f.y - huidig[0].y) <= marge) huidig.push(f);
    else { regels.push(huidig); huidig = [f]; }
  }
  regels.push(huidig);
  const gatDrempel = Math.max(14, breedte * 0.03);
  return regels.map(r => regelTekst(r.sort((a,b) => a.x - b.x), gatDrempel))
               .filter(Boolean).join('\n');
}

/* Fragmenten van één regel aan elkaar plakken. Een groot gat wordt een
   tab (twee cellen), een klein gat een spatie. pdf.js levert soms al
   losse letters, dus zonder gat plakken we zonder spatie. */
function regelTekst(r, gatDrempel){
  let uit = '';
  r.forEach((f, i) => {
    if(i){
      const gat = f.x - (r[i-1].x + (r[i-1].w||0));
      if(gat > gatDrempel) uit += TAB;
      else if(gat > Math.min(f.hg, r[i-1].hg) * 0.18) uit += ' ';
      else if(/\S$/.test(uit) && /^\S/.test(f.s) && gat > 0.4) uit += ' ';
    }
    uit += f.s;
  });
  return uit.replace(/[  ]{2,}/g, ' ').replace(/ ?\t ?/g, TAB).trim();
}

/* ─── 3. Andere bestandssoorten ───────────────────────────────────
   docx is een zip met één xml erin. De browser kan zelf uitpakken
   (DecompressionStream), dus daar is geen bibliotheek voor nodig —
   en dat scheelt een externe afhankelijkheid die ook nog eens moet
   laden voordat een AM iets ziet. */
async function docxTekst(file){
  const buf = new Uint8Array(await file.arrayBuffer());
  const xml = await zipBestand(buf, 'word/document.xml');
  if(!xml) throw new Error('Dit lijkt geen Word-bestand (.docx). Een oud .doc-bestand kunnen we niet lezen — sla het op als pdf.');
  return xml
    .replace(/<w:tab[^>]*\/>/g, TAB)
    .replace(/<\/w:(p|tr)>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .split('\n').map(r => r.replace(/[  ]{2,}/g,' ').trim()).join('\n');
}

/* Minimale zip-lezer: alleen wat nodig is om één bestand eruit te halen.
   We lopen de centrale directory af omdat de losse headers de lengte niet
   altijd invullen. */
async function zipBestand(buf, naam){
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for(let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--){
    if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) return '';
  let p = dv.getUint32(eocd + 16, true);
  const n = dv.getUint16(eocd + 10, true);
  const dec = new TextDecoder();
  for(let i = 0; i < n; i++){
    if(dv.getUint32(p, true) !== 0x02014b50) return '';
    const methode = dv.getUint16(p + 10, true);
    const compLen = dv.getUint32(p + 20, true);
    const nLen = dv.getUint16(p + 28, true), eLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const nm = dec.decode(buf.subarray(p + 46, p + 46 + nLen));
    if(nm === naam){
      const lnLen = dv.getUint16(offset + 26, true), leLen = dv.getUint16(offset + 28, true);
      const start = offset + 30 + lnLen + leLen;
      const data = buf.subarray(start, start + compLen);
      if(methode === 0) return dec.decode(data);
      if(methode !== 8) return '';
      const ds = new DecompressionStream('deflate-raw');
      const uit = new Response(new Blob([data]).stream().pipeThrough(ds));
      return dec.decode(new Uint8Array(await uit.arrayBuffer()));
    }
    p += 46 + nLen + eLen + cLen;
  }
  return '';
}

/* Eén ingang voor alle bestandssoorten. Geeft {tekst, doc, soort}. */
async function leesBestand(file, opts={}){
  const naam = String(file.name || '').toLowerCase();
  if(file.size > 25 * 1024 * 1024)
    throw new Error('Dit bestand is groter dan 25 MB. Een cv is dat nooit — controleer of je het juiste bestand koos.');
  if(!file.size) throw new Error('Dit bestand is leeg.');
  if(/\.pdf$/.test(naam) || file.type === 'application/pdf'){
    const r = await pdfTekst(file, opts);
    return {tekst:r.tekst, groot:r.groot, doc:r.doc, soort:'pdf', afgekapt:r.afgekapt};
  }
  if(/\.docx$/.test(naam)) return {tekst: await docxTekst(file), groot:[], soort:'docx'};
  if(/\.(txt|md|rtf|csv)$/.test(naam) || /^text\//.test(file.type||''))
    return {tekst: (await file.text()).replace(/\r\n?/g,'\n'), groot:[], soort:'tekst'};
  throw new Error('Dit bestandstype kunnen we niet lezen. Gebruik een pdf, een .docx of een tekstbestand.');
}

/* ─── 4. Woordenlijsten ───────────────────────────────────────────
   Alles wat sectorkennis is staat hier bij elkaar, zodat je het kunt
   uitbreiden zonder de parser te snappen. */

/* Kopjes waaraan we een sectie herkennen. Engels en Pools/Roemeens
   staan erbij omdat een deel van onze kandidaten zijn cv in die taal
   aanlevert; zonder die woorden valt zo'n cv terug op raden. */
const SECTIES = [
  /* Meervoud (en)? overal waar dat kan: "Werkervaringen" is net zo gewoon
     als "Werkervaring", en de \b erachter wees het meervoud eerst af —
     waardoor het hele werkverleden van zo'n cv onder geen sectie viel.
     (Cv Frencino Kasanwirjo, 3 aug 2026.) */
  ['werk', /^(werk\s*ervaring(en)?|ervaring(en)?|werkverleden|arbeidsverleden|loopbaan|dienstverbanden?|carri[eè]re|professional experience|work experience|employment( history)?|experiences?|do[sś]wiadczenie( zawodowe)?|experien[tț]a|exp[ée]rience)\b/i],
  ['opleiding', /^(opleiding(en)?|onderwijs|educatie|scholing|studie|school|education|academic|wykszta[lł]cenie|educa[tț]ie|formation)\b/i],
  ['cursus', /^(cursus(sen)?|certifica(at|ten|tes?)|diploma.?s?|training(en|s)?|licenties|kwalificaties|papieren|certyfikaty|licences?)\b/i],
  ['vaardigheid', /^(vaardigheden|competenties|kwaliteiten|eigenschappen|skills?|umiej[eę]tno[sś]ci|competen[tț]e|comp[ée]tences)\b/i],
  ['taal', /^(talen|taal|taalkennis|languages?|j[eę]zyki|limbi)\b/i],
  ['persoon', /^(persoonlijke gegevens|personalia|gegevens|contact(gegevens)?|profiel|over mij|persoonlijk|profile|about|personal (details|information)|dane osobowe|date personale)\b/i],
  ['overig', /^(hobby.?s?|interesses|referenties|references|nevenactiviteiten|vrije tijd|zainteresowania)\b/i]
];

/* Woorden die van een stukje tekst een functietitel maken. */
/* Bewust zónder \b aan het begin: een functietitel is in het Nederlands
   vaak één samengesteld woord ("Nachtportier", "Horecamedewerker",
   "Procesoperator"). Met een woordgrens ervoor herkenden we precies die
   titels niet, terwijl dat de meest voorkomende vorm is. */
const FUNCTIE_RE = /(operator|medewerk(st)?er|monteur|chauffeur|leider|manager|assistent|technicus|planner|specialist|engineer|helper|inpakker|orderpicker|picker|voorman|co[oö]rdinator|beveiliger|\w*kok\b|matroos|deksman|portier|bijrijder|lasser|schoonmaker|magazijn\w+|expediteur|verlader|toezichthouder|monteur|steward|heftruckrijder|productie\w*|logistiek|verladings\w*|proces\w*|machine\w*|meewerkend|allround|waarnemend|freelance|\bzzp\b|stagiair|uitzendkracht|vakkenvuller|schoonmaak|bezorger|lasser|\bsales\b|verkoper|serveer(der|ster)|gastheer|gastvrouw|student|afstudeer\w*|trainee|machinist|brandwacht|verkeersregelaar|poets\w*)\w*/i;
const FUNCTIE_VOOR = /^(allround|senior|junior|assistent|hoofd|waarnemend|meewerkend|eerste|tweede|derde|aankomend|leerling|zelfstandig)\b/i;

/* Woorden die van een stukje tekst een bedrijfsnaam maken. */
/* Twee helften: woorden die op zichzelf staan (\b nodig, anders matcht "inc"
   in "incasso"), en stammen die in het Nederlands aan een woord vastgeplakt
   worden — "meubelfabriek", "afvalverwerkingsbedrijf". Zonder die
   tweede helft valt precies de meest Nederlandse bedrijfsnaam buiten de boot. */
const BEDRIJF_RE = /\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|gmbh|ltd|inc|s\.?a\.?|group|holding|holland|nederland|netherlands|international|foods?|dairy|meat|packaging|college|academie|hogeschool|universiteit)\b|(fabriek|fabrieken|bedrijf|industrie|terminal|logistics?|logistiek b|transport|uitzend|detachering|supermarkt|bakkerij|slachterij|vleeswaren|kwekerij|veiling|distributie|groothandel|onderwijs|opleidingen|maatschappij|bottling|brouwerij|hotel|taveerne)\w*/i;
const NIVEAU_RE = /\b(vmbo(-[a-z]{1,3})?|havo|vwo|mavo|lbo|mbo(\s*niveau\s*[1-4]|\s*[1-4])?|hbo|wo|bachelor|master|associate(?:'s)? degree|niveau\s*[1-4]|basisonderwijs|basisschool)\b/i;

/* Certificaten die er in productie, logistiek en industrie toe doen.
   De lijst mag lang zijn: een certificaat dat we níet herkennen komt
   nergens terecht, en juist deze papieren bepalen of iemand morgen
   op een vorkheftruck mag staan. */
const CERTS = [
  /* Accenten optioneel: een cv dat op een Pools toetsenbord getypt is heeft
     ze wel, een cv dat via een formulier of een scan binnenkomt vaak niet. */
  [/(vorkheftruck|heftruck|forklift|w[oó]zek wid[lł]owy|stivuitorist)\w*/i, 'Heftruckcertificaat'],
  [/\b(reach\s?truck|reachtruck)\b/i, 'Reachtruck'],
  [/\b(ept|elektrische pallet(wagen|truck)|pompwagen)\b/i, 'EPT / elektrische pallettruck'],
  [/\bverreiker|telehandler\b/i, 'Verreiker'],
  [/\bhoogwerker|schaarlift|aerial (work )?platform\b/i, 'Hoogwerker'],
  [/\b(mobiele\s+)?kraan(machinist|certificaat)?\b|\btcvt\b/i, 'Kraan / TCVT'],
  [/\bvca[\s-]*(vol|vo)\b|\bvca\s*vol\b/i, 'VCA VOL'],
  [/\bvca[\s-]*p\b/i, 'VCA-P'],
  /* Kale "VCA" telt als Basis, maar niet als er VOL of P achter staat —
     anders krijgt iemand met VCA VOL er een VCA Basis bij die hij nooit
     genoemd heeft, en dat is precies het soort onzin dat niemand meer
     terugdraait. */
  [/\bvca\b(?![\s-]*(vol|vo|p)\b)/i, 'VCA Basis'],
  [/\bbhv\b|bedrijfshulpverlen/i, 'BHV'],
  [/\behbo\b|eerste hulp\b|first aid/i, 'EHBO'],
  [/\bnen[\s-]?9606\b/i, 'Lascertificaat NEN-EN-ISO 9606'],
  [/\bnen[\s-]?3140\b/i, 'NEN 3140'],
  [/\b(mig|mag)[\s\/-]*(mag|mig)?\s*(lassen|lascertificaat)?\b/i, 'Lascertificaat MIG/MAG'],
  [/\btig\s*(lassen|lascertificaat)?\b/i, 'Lascertificaat TIG'],
  [/\blas(certificaat|diploma|opleiding)\b/i, 'Lascertificaat'],
  [/\bcode\s?95\b/i, 'Code 95'],
  [/\badr\b/i, 'ADR'],
  [/\btachograaf|tachograph|bestuurderskaart\b/i, 'Tachograafkaart'],
  [/\btaxipas\b|chauffeurskaart/i, 'Taxipas'],
  [/\bhaccp\b/i, 'HACCP'],
  [/\b(voedselveiligheid|hygi[eë]necode|food safety|ifs|brc)\b/i, 'Voedselveiligheid'],
  [/\bgmp\b/i, 'GMP'],
  [/\bvapro\s*[abc]?\b/i, 'Vapro'],
  [/\bmachineveiligheid|loto|lock\s?out\b/i, 'Machineveiligheid / LOTO'],
  [/\bsleepkabel\b/i, 'Sleepkabel'],
  [/\bvog\b|verklaring omtrent (het )?gedrag/i, 'VOG'],
  [/\b(tewerkstellingsvergunning|werkvergunning|gvva|work permit)\b/i, 'Werkvergunning'],
  [/\bsvs\b|schoonmaak(diploma|opleiding)|basisvakopleiding schoonmaak/i, 'Schoonmaakdiploma'],
  [/\bsog\b|veiligheidspaspoort/i, 'Veiligheidspaspoort / SOG'],
  [/\bsc[cf]\b|\bsafety\s?certificate\b/i, 'Veiligheidscertificaat']
];

/* Talen. De sleutel is hoe wij het opschrijven; de regex vangt ook de
   Engelse en de eigen schrijfwijze, want een Poolse kandidaat schrijft
   "polski" en een Roemeense "român". */
const TALEN = [
  ['Nederlands', /\b(nederlands?|dutch|holender|olandez|niederl[aä]ndisch)\b/i],
  ['Engels', /\b(engels|english|angielski|englez)\b/i],
  ['Duits', /\b(duits|german|deutsch|niemiecki|german[aă])\b/i],
  ['Frans', /\b(frans|french|fran[çc]ais|francuski)\b/i],
  ['Spaans', /\b(spaans|spanish|espa[nñ]ol|hiszpa[nń]ski)\b/i],
  ['Pools', /\b(pools|polish|polski|polon)\b/i],
  ['Roemeens', /\b(roemeens|romanian|rom[aâ]n[aă]?|rumu[nń]ski)\b/i],
  ['Bulgaars', /\b(bulgaars|bulgarian|b[ăa]lgarski)\b/i],
  ['Hongaars', /\b(hongaars|hungarian|magyar)\b/i],
  ['Turks', /\b(turks|turkish|t[üu]rk[çc]e)\b/i],
  ['Arabisch', /\b(arabisch|arabic|عربي)\b/i],
  ['Portugees', /\b(portugees|portuguese|portugu[eê]s)\b/i],
  ['Italiaans', /\b(italiaans|italian|italiano)\b/i],
  ['Oekraïens', /\b(oekra[iï]ens|ukrainian|ukrai[nń]ski)\b/i],
  ['Russisch', /\b(russisch|russian|rosyjski|русск)\b/i],
  ['Slowaaks', /\b(slowaaks|slovak|slovensk)\b/i],
  ['Tsjechisch', /\b(tsjechisch|czech|[čc]esk)\b/i],
  ['Macedonisch', /\b(macedonisch|macedonian|makedon)\b/i],
  ['Albanees', /\b(albanees|albanian|shqip)\b/i],
  ['Grieks', /\b(grieks|greek|ελλην)\b/i]
];
const TAALNIVEAUS = [
  [/\b(moedertaal|native|mother\s?tongue|j[eę]zyk ojczysty|c2)\b/i, 'moedertaal'],
  [/\b(vloeiend|fluent|uitstekend|zeer goed|c1)\b/i, 'vloeiend'],
  [/\b(goed|good|b2)\b/i, 'goed'],
  [/\b(redelijk|voldoende|gemiddeld|b1)\b/i, 'redelijk'],
  [/\b(basis|basic|beginner|elementair|a1|a2)\b/i, 'basis']
];

const MND = {januari:1,jan:1,january:1,februari:2,feb:2,february:2,maart:3,mrt:3,maa:3,march:3,mar:3,
  april:4,apr:4,mei:5,may:5,juni:6,jun:6,june:6,juli:7,jul:7,july:7,augustus:8,aug:8,august:8,
  september:9,sep:9,sept:9,oktober:10,okt:10,october:10,oct:10,november:11,nov:11,december:12,dec:12};
const MND_RE = Object.keys(MND).sort((a,b) => b.length - a.length).join('|');
/* "tot heden" staat er apart in voor het geval het streepje de "tot" al
   heeft opgeslokt ("01/11/2021 – TOT HEDEN", Europass). */
const NU_RE = '(?:tot\\s+heden|heden|nu|nog\\s+werkzaam|present|current|now|today|actueel|prezent|obecnie)';

/* ─── 5. Periodes lezen ───────────────────────────────────────────
   Een dienstverband zonder jaartallen is voor een planner waardeloos,
   dus dit is het scharnierpunt van de hele parser: waar een periode
   staat, begint een nieuw dienstverband. Vier schrijfwijzen komen in
   de praktijk voor, en "heden" in vijf talen. */
const STREEP = '(?:\\s*(?:[–—−-]{1,2}|\\bt\\/?m\\b|\\btot\\b|\\bto\\b|\\buntil\\b|\\bdo\\b)\\s*)';
const P_MND   = new RegExp(`\\b(${MND_RE})\\.?\\s*(\\d{4})${STREEP}(?:(${MND_RE})\\.?\\s*(\\d{4})|(${NU_RE}))`, 'i');
const P_MND2  = new RegExp(`\\b(${MND_RE})\\.?${STREEP}(${MND_RE})\\.?\\s*(\\d{4})`, 'i');
/* De dag vóór de maand ("01/11/2021", Europass en veel Word-cv's) is
   opmaak die we overslaan — zonder dat prefix-deel liep de regex vast op
   dag/maand-verwisseling en viel het hele dienstverband weg. */
const P_CIJF  = new RegExp(`\\b(?:\\d{1,2}[\\/.-])?(\\d{1,2})[\\/.-](\\d{4})${STREEP}(?:(?:\\d{1,2}[\\/.-])?(\\d{1,2})[\\/.-](\\d{4})|(${NU_RE}))`, 'i');
/* Jaar-eerst: 2024-01 – 2026-07. Dit is het exportformaat van LinkedIn,
   Indeed en de meeste cv-bouwers, en het werd hier niet herkend — P_CIJF
   leest maand-eerst (01/2024) en P_JAAR wil twee kale jaartallen. Gevolg:
   van zo'n cv kwam géén enkel dienstverband binnen, terwijl de rest van de
   kaart wél gevuld leek. Precies het soort stille fout dat je pas ziet als
   je het cv ernaast legt. (Gevonden 3 aug 2026 op het cv van Aliu Ceesay.)
   De maand is streng begrensd op 01–12, anders leest "2024-13" ook als een
   datum en verzin je een maand die er niet is. */
const P_ISO   = new RegExp(`\\b(19\\d{2}|20\\d{2})-(0[1-9]|1[0-2])${STREEP}(?:(19\\d{2}|20\\d{2})-(0[1-9]|1[0-2])|(${NU_RE}))`, 'i');
const P_JAAR  = new RegExp(`\\b(19\\d{2}|20\\d{2})${STREEP}(?:(19\\d{2}|20\\d{2})|(${NU_RE}))`, 'i');
const P_LOS   = /\((19\d{2}|20\d{2})\)|\b(19\d{2}|20\d{2})\s*$/;

/* Periodes zonder datums. Sommige cv's zetten onder de functieregel geen
   jaartallenpaar maar een losse duur: "Huidig", "± 4 jaar", "Start:
   december 2016". Zonder deze patronen bestond zo'n dienstverband niet
   voor de parser — en daarmee verdwenen ook alle werkzaamheden eronder.
   Alleen als de héle regel eruit bestaat: het woord "huidig" middenin een
   zin is geen dienstverband. (Cv Ricardo Zeef, 3 aug 2026: drie van de
   vier banen hadden zo'n regel en vielen daardoor compleet weg.) */
const P_NU_LOS = new RegExp(`^(?:huidig|${NU_RE})$`, 'i');
const P_DUUR   = /^[±~]?\s*\d{1,2}\s*(?:jaar|jaren|jr\.?|maanden?|mnd\.?|years?|months?)$/i;
const P_START  = new RegExp(`^(?:start|vanaf|sinds|since|per)[:\\s]\\s*(?:(${MND_RE})\\.?\\s*)?((?:19|20)\\d{2})$`, 'i');

const iso = (j, m) => j ? String(j) + (m ? '-' + String(m).padStart(2,'0') : '') : '';

/* Geeft {van, tot, lopend, tekst, index} of null. `van`/`tot` zijn
   'JJJJ' of 'JJJJ-MM' — nooit een verzonnen dag. */
function leesPeriode(s){
  let m;
  /* Eerst de heel-de-regel-patronen zonder datums. Die zijn per definitie
     ondubbelzinnig (er staat verder níets op de regel) en ze mogen niet
     bij P_LOS terechtkomen: "Start: december 2016" las daar als los
     jaartal met "Start: december" als restje, en dat restje werd dan
     bijna-werkgever. Sterk, want een regel die alléén een duur bevat is
     in een cv net zo zeker het begin van een dienstverband als een
     jaartallenpaar — alleen de datums zelf ontbreken, en die laten we
     dan ook leeg in plaats van ze te verzinnen. */
  const heel = kaal(s);
  if(P_NU_LOS.test(heel)) return {van:'', tot:'', lopend:true,  tekst:heel, index:0, sterk:true};
  if(P_DUUR.test(heel))   return {van:'', tot:'', lopend:false, tekst:heel, index:0, sterk:true};
  if((m = P_START.exec(heel))) return {
    van: iso(m[2], m[1] ? MND[m[1].toLowerCase()] : 0), tot:'', lopend:false,
    tekst:heel, index:0, sterk:true};
  /* Jaar-eerst als eerste: 2024-01 is niet te verwarren met iets anders, en
     als P_JAAR er eerder bij zou zijn leest die "2024" als los jaartal. */
  if((m = P_ISO.exec(s))) return {
    van: iso(m[1], +m[2]),
    tot: m[5] ? '' : iso(m[3], +m[4]),
    lopend: !!m[5], tekst: m[0].trim(), index: m.index, sterk: true};
  if((m = P_MND.exec(s))) return {
    van: iso(m[2], MND[m[1].toLowerCase()]),
    tot: m[5] ? '' : iso(m[4], MND[(m[3]||'').toLowerCase()]),
    lopend: !!m[5], tekst: m[0].trim(), index: m.index, sterk: true};
  /* "Apr - Juli 2016": twee maanden, één jaartal achteraan — een stage of
     kort dienstverband binnen één jaar. Zonder dit patroon viel zo'n regel
     op het losse jaartal en werden de maandnamen functie ("Apr") en
     werkgever ("Juli"). (Cv Frencino, 3 aug 2026.) */
  if((m = P_MND2.exec(s))) return {
    van: iso(m[3], MND[m[1].toLowerCase()]),
    tot: iso(m[3], MND[m[2].toLowerCase()]),
    lopend: false, tekst: m[0].trim(), index: m.index, sterk: true};
  if((m = P_CIJF.exec(s))) return {
    van: iso(m[2], +m[1]), tot: m[5] ? '' : iso(m[4], +m[3]),
    lopend: !!m[5], tekst: m[0].trim(), index: m.index, sterk: true};
  if((m = P_JAAR.exec(s))) return {
    van: iso(m[1]), tot: m[3] ? '' : iso(m[2]),
    lopend: !!m[3], tekst: m[0].trim(), index: m.index, sterk: true};
  if((m = P_LOS.exec(s))) return {
    van: iso(m[1] || m[2]), tot: '', lopend: false,
    tekst: m[0].trim(), index: m.index, sterk: false};
  return null;
}

/* ─── 6. Secties ──────────────────────────────────────────────────
   Regels labelen met de sectie waar ze onder staan. Een kopje is kort,
   staat alleen op zijn regel en komt uit de lijst hierboven. */

/* Kopjes met een spatie tussen élke letter ("W O R K  E X P E R I E N C E")
   zijn een geliefde cv-opmaak; samengeperst zijn de woordgrenzen weg, dus
   die vergelijken we tegen deze compacte varianten. */
const SECTIES_COMPACT = [
  ['werk', /^(werkervaring(en)?|workexperience|experiences?|employment(history)?|werkverleden)$/i],
  ['opleiding', /^(opleiding(en)?|education|onderwijs)$/i],
  ['cursus', /^(certifica(at|ten|tes?)|cursus(sen)?|courses?|training(en|s)?)$/i],
  ['vaardigheid', /^((hard|soft)?skills?|vaardigheden|competenties)$/i],
  ['taal', /^(talen|taal|languages?)$/i],
  ['persoon', /^(contact(gegevens)?|profiel|profile|personalia|aboutme|overmij)$/i],
  ['overig', /^(hobby.?s?|interess?es|references?|referenties)$/i]
];
/* Geeft de samengeperste vorm als de tekst uit losse letters bestaat,
   anders ''. */
function gespreid(s){
  const tk = String(s).trim().split(/\s+/);
  return tk.length >= 4 && tk.every(w => /^[A-Za-zÀ-ž]$/.test(w)) ? tk.join('') : '';
}

function sectieRegels(tekst){
  const uit = [];
  let sectie = 'kop';                       // alles vóór het eerste kopje
  tekst.split('\n').forEach(ruw => {
    /* Word zet opsommingstekens vaak in een symboollettertype (Wingdings),
       en dan komt er in de tekstlaag een teken uit de Private Use Area
       (U+F0B7 en verwanten) dat eruitziet als een spatie maar het niet is:
       trim() haalt het niet weg en isOpsomming() herkende het niet. Gevolg
       was een cv met nul werkzaamheden terwijl er tientallen bullets in
       stonden. In dat Unicode-bereik staat nooit een letter, dus alles daar
       mag veilig een bolletje worden. (Cv Ricardo Zeef, 3 aug 2026.) */
    ruw = ruw.replace(/[\uE000-\uF8FF]/g, '\u2022');
    /* Nieuwe kolom: de kopjes van het vorige blok gelden hier niet meer.
       Een paginaovergang telt bewust níet mee — een werkervaringlijst loopt
       heel gewoon door op de volgende pagina, zonder het kopje te herhalen. */
    if(ruw.indexOf('\f') >= 0){ sectie = 'kop'; return; }
    const r = ruw.replace(/\s+$/,'');
    if(!r.trim()) return;
    /* Zijbalk en hoofdkolom kunnen per regel aan elkaar geplakt zitten (tab
       ertussen) als er geen doorlopende witte baan tussen de kolommen zit.
       Dan staat er "Talen⇥Werkervaringen (vervolg)" op één regel. Eérst de
       laatste cel testen — dat is de hoofdkolom — en pas daarna de regel
       als geheel: andersom viel die regel op het wóórd Talen, en belandden
       alle banen erna onder de taalsectie. (Cv Frencino Kasanwirjo,
       3 aug 2026.) */
    if(r.indexOf('\t') >= 0){
      const cel = r.split('\t').pop().replace(/\((vervolg|continued)\)/i,'')
        .replace(/[:•·\-–—_|]+$/,'').trim();
      if(cel && cel.length <= 40 && cel.split(/\s+/).length <= 4){
        const hit = SECTIES.find(([, re]) => re.test(cel));
        if(hit){ sectie = hit[0]; return; }
      }
      const celC = gespreid(cel);
      if(celC){
        const hit = SECTIES_COMPACT.find(([, re]) => re.test(celC));
        if(hit){ sectie = hit[0]; return; }
      }
    }
    const kaal = r.replace(/\t/g,' ').replace(/[:•·\-–—_|]+$/,'').trim();
    if(kaal.length <= 40){
      const hit = SECTIES.find(([, re]) => re.test(kaal));
      /* Alleen een kopje als er verder niets op de regel staat. "Ervaring
         met heftrucks" is een zin, geen sectiekop. */
      if(hit && kaal.split(/\s+/).length <= 4){ sectie = hit[0]; return; }
    }
    const kaalC = gespreid(kaal.replace(/[:•·\-–—_|]+$/,''));
    if(kaalC){
      const hit = SECTIES_COMPACT.find(([, re]) => re.test(kaalC));
      if(hit){ sectie = hit[0]; return; }
    }
    uit.push({tekst: r, sectie});
  });
  /* Een regel die eindigt op een los koppelteken loopt door op de volgende
     regel: "Allround Operator / Waarnemend Shiftleider –" op de ene regel
     en de bedrijfsnaam op de volgende. Zonder samenvoegen valt de werkgever
     van de functie af. */
  for(let i = uit.length - 2; i >= 0; i--){
    if(/[–—−\-|&]\s*$/.test(uit[i].tekst) && uit[i].sectie === uit[i+1].sectie){
      uit[i].tekst = uit[i].tekst.replace(/\s*$/,' ') + uit[i+1].tekst;
      uit.splice(i+1, 1);
    }
  }
  return uit;
}

const isOpsomming = s => /^[\s]*[•·▪◦*\-–—o]\s+/.test(s);
const kaal = s => String(s||'').replace(/\t/g,' ').replace(/\s+/g,' ').trim();
const schoon = s => kaal(s).replace(/^[\s\-–—:•·|,]+|[\s\-–—:•·|,]+$/g,'').trim();

/* ─── 7. Werkgever of functie? ────────────────────────────────────
   Een cv zet die twee in elke denkbare volgorde neer, dus positie zegt
   niets en we moeten het aan de woorden zien. Beide krijgen een score;
   de hoogste functiescore wordt de functie, de rest de werkgever. */
function functieScore(s){
  const t = kaal(s); if(!t) return -99;
  let n = 0;
  if(FUNCTIE_RE.test(t)) n += 3;
  if(FUNCTIE_VOOR.test(t)) n += 2;
  if(/\b(bij|at|@)\b/i.test(t)) n -= 1;
  /* Een bedrijfswoord telt alleen tégen als er niet óók een functiewoord
     staat. "Veld Operator Fabriek C" is een functietitel waar toevallig
     "fabriek" in zit; met de kale aftrek won de omgekeerde keuze en stond
     het bedrijf als functie op de kaart. (Cv Frencino, 3 aug 2026.) */
  if(BEDRIJF_RE.test(t) && !FUNCTIE_RE.test(t)) n -= 3;
  if(/,\s*[A-ZÀ-Ž]/.test(t) && plaatsAchteraan(t)) n -= 3;
  if(t.split(/\s+/).length > 7) n -= 2;                 // een zin is geen titel
  if(/^[a-z]/.test(t) && !/\bzzp\b|freelance/i.test(t)) n -= 1;
  return n;
}
function bedrijfScore(s){
  const t = kaal(s); if(!t) return -99;
  let n = 0;
  if(BEDRIJF_RE.test(t)) n += 3;
  if(plaatsAchteraan(t)) n += 3;
  if(/\s&\s|\s\+\s/.test(t)) n += 2;                    // "Wit & Zonen"
  if(FUNCTIE_RE.test(t)) n -= 2;
  if(t.split(/\s+/).length > 7) n -= 2;
  return n;
}
/* "Terminal Techniek, Vlaardingen" — het laatste stuk is een plaats die wij
   kennen. Dat is het sterkste bedrijfssignaal dat er is, want een
   functietitel eindigt nooit op een plaatsnaam. */
function plaatsAchteraan(s){
  const delen = kaal(s).split(',').map(d => d.trim()).filter(Boolean);
  if(delen.length < 2) return '';
  for(let i = delen.length - 1; i >= 1; i--){
    const d = delen[i].replace(/\b(the\s+)?(netherlands|nederland|holland|nl)\b/i,'').trim();
    if(d && CRM.PLAATSEN[CRM.plaatsSleutel(d)]) return d;
  }
  return '';
}

/* Is dit hele stuk tekst alleen een plaats (+land)? "Zuidland, Nederland"
   wel; "Witron, Nieuwegein, Netherlands" niet (Witron blijft over). Een
   pure plaats is nooit een functie of werkgever. */
function puurPlaats(s){
  const delen = kaal(s).split(',')
    .map(d => schoon(d.replace(/\b(the\s+)?(netherlands|nederland|holland|nl|belgi[eë]|belgium|duitsland|germany)\b/i,'')))
    .filter(Boolean);
  return delen.length > 0 && delen.every(d => !!plaatsnaam(d));
}

/* Een regel als "Teamleider – Zuidhoek Foods" of "MBO Beveiliger – Rijnmond
   Opleidingen" in twee stukken knippen. Alleen op een echt scheidingsteken
   met spaties eromheen, anders sneuvelt "Wit & Zonen" of een
   samengestelde titel als "Operator / Waarnemend Shiftleider". */
function splitsPaar(s){
  const t = kaal(s);
  const m = t.match(/^(.{2,60}?)\s+(?:[–—−]|-{1,2}|\bbij\b|\bat\b|@|\|)\s+(.{2,70})$/i);
  return m ? [schoon(m[1]), schoon(m[2])] : null;
}

const INSTELLING_RE = /\b(roc|college|school|scholengemeenschap|lyceum|gymnasium|gimnazium|universiteit|hogeschool|onderwijs|opleidingen|academie|instituut|campus|university|vakschool|leerbedrijf)\b/i;

/* Beschrijvende regels zijn geen werkgever en geen functie. Zonder deze
   zeef wordt "Planning en transportcoördinatie." de werkgever van het
   dienstverband erboven, en dat ziet er op de kaart net zo echt uit als
   een goede waarde. */
function isBeschrijving(s){
  const t = kaal(s);
  if(!t) return true;
  if(isOpsomming(s)) return true;
  if(t.length > 70) return true;
  const komma = (t.match(/,/g) || []).length;
  /* Rechtsvormen ook met spaties ("N. V.") — zo schrijft een deel van de
     cv's het, en zonder die variant werd de werkgever een beschrijving en
     stopte de zoektocht er pal voor. (Cv Frencino, 3 aug 2026.) */
  if(/[.,;]$/.test(t) && !/\b(b\.?\s?v\.?|n\.?\s?v\.?|ltd\.?|inc\.?|s\.?\s?a\.?|v\.?\s?o\.?\s?f\.?)\s*$/i.test(t)) return true;
  if(komma >= 3) return true;
  return false;
}

/* ─── 8. Dienstverbanden en opleidingen ───────────────────────────
   Eén werkwijze voor allebei: zoek de periodes, en pak per periode een
   klein venster regels eromheen. Dat werkt bij alle vier de indelingen
   die we in echte cv's tegenkwamen — periode op dezelfde regel, eronder,
   erboven, of in een eigen kolom naast de tekst. */
function blokken(regels, welke){
  const uit = [];
  /* Regels die een eerder blok al heeft gebruikt (als optie onder zijn
     periode, of als taak) zijn vergeven. De zoektocht omhóóg moet daarop
     stuiten: zonder deze grens las een blok de functie en werkgever van
     het blok erbóven in — bij een cv met losse regels tussen de banen
     kreeg elke baan zo de kop van zijn voorganger. (Cv's 3 aug 2026.) */
  const geclaimd = new Set();
  const heeftSectie = regels.some(r => welke.includes(r.sectie));
  const meetel = regels.map((r, i) => heeftSectie
    ? welke.includes(r.sectie)
    : !['taal','vaardigheid','overig','persoon'].includes(r.sectie));

  regels.forEach((r, i) => {
    if(!meetel[i]) return;
    const per = leesPeriode(r.tekst);
    if(!per) return;
    /* Losse jaartallen alleen laten tellen als er verder een naam op de
       regel staat; anders is elk jaartal in een zin een dienstverband. */
    if(!per.sterk && !schoon(r.tekst.replace(per.tekst,''))) return;

    const opties = [];
    const voegToe = (s, afstand) => {
      const ruwe = String(s);
      /* "Functie Chauffeur / Sales" is een labelregel: het woord Functie is
         opmaak, de rest is de titel. Het label onthouden we — zo'n regel
         ís de functie, en die wetenschap is meer waard dan elke woordscore.
         Spiegelbeeldig geldt "Bij Vepco te Moerdijk": dat ís de werkgever. */
      const metLabel = /^\s*functie\b[:.]?\s/i.test(ruwe);
      const bijBedrijf = /^\s*bij\s+\S/i.test(ruwe);
      /* "Taken ..." en "Werkzaamheden ..." zijn inhoud, geen kop — als
         optie werd "Taken Laden en lossen" doodleuk de werkgever. */
      if(/^\s*(werkzaamheden|taken)\b[:.]?\s/i.test(ruwe)) return;
      let t = schoon(ruwe.replace(/\(\s*\)/g,'')
        .replace(/^\s*functie\b[:.]?\s*/i,'').replace(/^\s*bij\s+/i,''));
      /* Sommige omzettingen verdubbelen letterlijk elke regel
         ("PoetsmanPoetsman") — de helft is dan het echte woord. */
      const h = t.length >> 1;
      if(t.length >= 6 && t.length % 2 === 0 && t.slice(0, h) === t.slice(h)) t = t.slice(0, h);
      /* Wat er naast de periode overblijft aan losse datumbrokken ("01-09-"
         van "01-09-2009 t/m 2022") is geen naam maar een leesrest van het
         datumpatroon — die werd eerst doodleuk de functie. */
      if(/^[\d\s.\/-]+$/.test(t)) return;
      /* Contactgegevens zijn nooit een functie of werkgever: zonder deze
         zeef werd een e-mailadres of adresregel de kop van een blok. */
      if(/@|\b\d{4}\s?[A-Z]{2}\b|\d{6,}/.test(t)) return;
      /* Een korte regel met een punt erachter ("Algemeen medewerker.") is
         geen zin maar een titel met opmaakpunt; zonder deze strip keurde
         isBeschrijving hem af en bleef de functie leeg. */
      if(t.length <= 40) t = t.replace(/\.$/,'');
      if(!t || t.length < 2 || isBeschrijving(t) || leesPeriode(t)) return;
      /* Een regel die alléén een plaats (+land) is, is geen naam: op de
         Europass-regel "01/11/2021 – HEDEN Amsterdam, Nederland" werd
         "Amsterdam, Nederland" anders de werkgever. En bij "Dorc
         International - Zuidland, Nederland" is de rechterhelft de
         vestigingsplaats, niet de wederhelft van een paar. */
      if(puurPlaats(t)) return;
      let paar = splitsPaar(t);
      if(paar && puurPlaats(paar[1])){ t = paar[0]; paar = null; }
      else if(paar && puurPlaats(paar[0])){ t = paar[1]; paar = null; }
      opties.push(paar ? {paar, afstand} : {een:t, afstand, functieLabel: metLabel, bedrijfHint: bijBedrijf});
    };
    /* Opmaaklabels uit gestructureerde cv's ("Branche Horeca", "Voltijd/
       Deeltijd Voltijd"). Geen functie, geen werkgever en geen taak — maar
       óók geen reden om te stoppen met zoeken: het echte antwoord staat er
       vaak direct onder. Dus overslaan, niet afbreken. */
    const isEtiket = s => /^(branche|sector|voltijd|deeltijd|parttime|fulltime|uren per week)\b/i.test(kaal(s));
    /* De regel zelf, zonder de periode. */
    voegToe(r.tekst.replace(per.tekst, ' '), 0);
    /* Naar boven en naar beneden, maar niet verder dan het dienstverband
       zelf: bij een periode, een opsomming of een beschrijvende zin houdt
       het op. Zonder die grens leest een dienstverband de werkgever van het
       vólgende dienstverband in — en dan staat er iets op de kaart dat er
       goed uitziet en niet klopt. */
    const stop = j => !meetel[j] || leesPeriode(regels[j].tekst)
                   || isOpsomming(regels[j].tekst) || isBeschrijving(regels[j].tekst);
    /* Een "Functie ..."-labelregel is per definitie kop-materiaal en mag de
       zoektocht nooit stoppen — ook niet als er een punt achter staat
       ("Functie Algemeen medewerker."), waardoor isBeschrijving hem eerst
       als zin afkeurde en de scan er al vóór het label op afbrak. */
    const functieLabelRegel = j => /^functie\b[:.]?\s/i.test(kaal(regels[j].tekst));
    for(let j = i-1, n = 0; j >= 0 && n < 2; j--){
      if(!meetel[j] || geclaimd.has(j)) break;
      if(isEtiket(regels[j].tekst)) continue;
      if(functieLabelRegel(j)){ voegToe(regels[j].tekst, ++n); continue; }
      if(stop(j)) break;
      voegToe(regels[j].tekst, ++n);
    }
    for(let j = i+1, n = 0; j < regels.length && n < 2; j++){
      if(!meetel[j]) break;
      if(isEtiket(regels[j].tekst)) continue;
      if(functieLabelRegel(j)){ voegToe(regels[j].tekst, ++n); geclaimd.add(j); continue; }
      if(stop(j)) break;
      voegToe(regels[j].tekst, ++n);
      geclaimd.add(j);
    }
    /* ─── De werkzaamheden ────────────────────────────────────────
       Precies de regels die de zoektocht hierboven laat liggen. Voor het
       vinden van functie en werkgever is een beschrijvende zin ruis, dus
       daar stopt de scan erop — maar ínhoudelijk is het het waardevolste
       deel van een cv. Zonder dit staat er op de kaart "Proces operator bij
       Witron, 2024–2026" en moet je zelf uit het pdf overtikken wat iemand
       dáár deed. Dat is precies wat Tjeerd meldde (3 aug 2026): "hij moet
       alles wat belangrijk in het cv is inladen, nu moet ik teveel
       handmatig toevoegen."

       We lopen vanaf het dienstverband naar beneden tot de volgende
       periode. Hooguit twee niet-beschrijvende regels overslaan — dat zijn
       de functie- en werkgeverregel die hierboven al zijn opgepikt. Zodra
       de opsomming begint en daarna weer een korte, niet-beschrijvende
       regel komt, is dat de kop van het volgende dienstverband en houdt
       het op. */
    /* Bullettekst schoonmaken zónder schoon(): die haalt ook de komma aan het
       eind weg, en juist bij een afgebroken zin ("…van bezoekers," / "collega's
       en de locatie.") is die komma het scharnier tussen de twee helften. */
    /* Bij een tab in de regel alleen de laatste cel: dat is de hoofdkolom.
       Zonder die knip kwam "Mvr. Sital⇥Bedienen van machines…" — referentie
       uit de zijbalk plus taak uit de hoofdtekst — als één taak op de kaart.
       Het label "Werkzaamheden:" is opmaak, geen inhoud. */
    const taakTekst = s => kaal(String(s).split('\t').pop())
      .replace(/^\s*[•·▪◦*\-–—o]\s+/, '')
      .replace(/^(werkzaamheden|taken)\b[:.]?\s*/i, '')
      .replace(/\s+$/, '');
    const taken = [];
    let overgeslagen = 0;
    /* Is regel j de kop van het vólgende dienstverband? Twee eisen: er
       staat een periode direct onder, én de regel zelf oogt als een kop —
       kort, splitsbaar in functie–werkgever, of met een herkenbaar
       functie- of bedrijfswoord erin ("Olie en gas industrie Noble
       Drilling Offshore" telt zeven woorden en is tóch een kop). Een taak
       zonder zo'n signaal die toevallig vlak boven de volgende periode
       staat ("Ondersteuning verlenen aan de onderhoudsactiviteiten")
       blijft zo gewoon een taak. */
    const kopVolgt = (j, t) => regels[j+1] && meetel[j+1]
      && leesPeriode(regels[j+1].tekst)
      && (t.split(/\s+/).length <= 4 || !!splitsPaar(t)
          || FUNCTIE_RE.test(t) || BEDRIJF_RE.test(t));
    for(let j = i + 1; j < regels.length && taken.length < 14; j++){
      if(!meetel[j]) break;
      if(leesPeriode(regels[j].tekst)) break;         // volgend dienstverband
      if(isEtiket(regels[j].tekst)) continue;         // opmaaklabel, geen taak
      /* De functieregel is hierboven al als optie opgepikt; als taak zou
         hij nóg een keer op de kaart staan, mét het label ervoor. */
      if(/^functie\b[:.]?\s/i.test(kaal(regels[j].tekst))) continue;
      const t = taakTekst(regels[j].tekst);
      if(!t) continue;
      /* Reclame van cv-bouwers is geen werkzaamheid. */
      if(/^dit cv\b|gemaakt met|\bcv maken\b|^pagina\s*\d|^page\s*\d/i.test(t)){
        if(taken.length) break;
        continue;
      }
      const bullet = isOpsomming(regels[j].tekst);
      const vorige = taken[taken.length - 1];
      /* Een pdf breekt een opsommingsregel af op de kolombreedte, en dan staat
         de tweede helft als losse regel zónder bolletje in de tekst. Zonder
         samenvoegen las de kaart:
           · Het bewaken van de geautomatiseerde logistieke
           · installaties vanuit de controlekamer.
         Twee halve zinnen die er allebei uitzien als een taak.

         Deze toets staat BEWUST vóór de beschrijving- en stopcontrole. Een
         vervolgregel als "pallets, kratten en producten op de juiste
         bestemming" is kort, heeft geen eindpunt en maar twee komma's — dus
         isBeschrijving() zegt nee, en dan viel de lus uit elkaar bij de stop
         hieronder. Gevolg: die taak bleef halverwege staan en de drie bullets
         erna verdwenen helemaal. Bij Aliu's cv scheelde dat drie van de zes
         werkzaamheden bij zijn belangrijkste baan. */
      /* Samenvoegen alleen op positief bewijs: de vervolgregel begint met
         een kleine letter, of de vorige eindigt op een komma of voegwoord.
         De oude, ruimere toets ("vorige eindigt niet op een leesteken")
         plakte bij cv's zónder bullets en zónder eindpunten álle taken tot
         één worst aan elkaar — en de kop van het volgende dienstverband
         erbij. (Cv's Adrian en Ricardo Zeef, 3 aug 2026.) */
      /* Een regel met het label "Werkzaamheden:" of "Taken" ís de taak,
         hoe kort de inhoud ook is — "Reclamefolders bezorgen" viel eerst
         onder de drie-woordengrens verderop en verdween. */
      if(/^(werkzaamheden|taken)\b[:.]?\s/i.test(kaal(String(regels[j].tekst).split('\t').pop()))){
        taken.push(t);
        geclaimd.add(j);
        continue;
      }
      if(!bullet && vorige &&
         (/^[a-zà-öø-ÿ(]/.test(t) ||
          /,$|\b(en|of|de|het|een|voor|van|met|op|in|door|aan|te|bij|als)$/i.test(vorige))){
        /* …tenzij de regel erná een periode is én deze regel op een kop
           lijkt (kort, of splitsbaar in functie–werkgever): dan is dít geen
           afgebroken bullethelft maar de kop van het volgende
           dienstverband. Zonder de kop-toets sneuvelde óók de laatste échte
           taak van een blok waar de volgende periode direct op volgt. */
        if(kopVolgt(j, t)) break;
        taken[taken.length - 1] = vorige + ' ' + t;
        geclaimd.add(j);
        continue;
      }
      if(bullet){ taken.push(t); geclaimd.add(j); continue; }
      /* Kopachtige regel zonder bullet, direct gevolgd door een periode:
         het volgende dienstverband — hier houdt dit blok op. Deze toets
         staat vóór de beschrijvingstoets: "Royal Hotel, Il Corallo,
         Taveerne De Danna" heeft drie komma's en leest als beschrijving,
         maar het is de werkgever van het volgende blok. */
      if(kopVolgt(j, t)) break;
      if(isBeschrijving(regels[j].tekst)){ taken.push(t); geclaimd.add(j); continue; }
      /* Cv's zonder opsommingstekens zetten hun werkzaamheden als kale,
         korte regels onder de periode (cv Adrian, 3 aug 2026). Drie woorden
         of meer is dan een taak; wordt zo'n regel straks als functie of
         werkgever gekozen, dan haalt werkUit hem er weer uit. */
      if(t.split(/\s+/).length >= 3){ taken.push(t); geclaimd.add(j); continue; }
      /* Een kort regeltje vlak onder de periode is de kop van dít blok
         (werkgever of functie), geen sein dat de taken op zijn — daarna
         volgen ze juist nog. Zonder dit onderscheid brak "Utilities
         Operator" op regel twee de lus af en verdwenen alle acht taken
         eronder. (Cv Frencino, 3 aug 2026.) */
      if(j - i <= 2 && ++overgeslagen <= 2) continue;
      break;                                           // taken zijn afgelopen
    }
    if(opties.length) uit.push({per, opties, taken});
  });
  /* Zonder herkende kopjes is elk blok met een periode kandidaat voor
     werk én opleiding tegelijk; de afnemers hieronder schiften dan zelf
     op schoolwoorden. Vandaar dat ze moeten weten of er kopjes waren. */
  uit.zonderSectie = !heeftSectie;
  return uit;
}

/* Ziet dit blok eruit als een opleiding? Alleen van belang bij een cv
   zonder herkenbare kopjes: dan is dit het enige dat "Park Lyceum,
   2012 – 2014" van een dienstverband onderscheidt. Zonder deze schifting
   stonden bij zo'n cv alle scholen tussen de banen én alle banen tussen
   de opleidingen. (Cv Youssef Bout, 3 aug 2026.) */
function lijktOpleiding(opties){
  return opties.some(o => (o.paar ? o.paar : [o.een])
    .some(d => INSTELLING_RE.test(d) || NIVEAU_RE.test(d)));
}

/* Uit de opties de beste (functie, werkgever) kiezen. Een paar dat uit
   één regel komt telt zwaarder: die twee horen aantoonbaar bij elkaar. */
function kiesPaar(opties, scoreA, scoreB){
  let beste = null;
  const zet = (a, b, score, samen) => { if(!beste || score > beste.score) beste = {a, b, score, samen}; };
  opties.forEach(o => {
    const straf = (o.afstand || 0) * 0.5;
    if(o.paar){
      /* Twee helften van dezelfde regel horen aantoonbaar bij elkaar; dat
         is meer bewijs dan twee losse regels die toevallig naast elkaar
         staan. Vandaar een punt erbij. */
      const [l, r] = o.paar;
      zet(l, r, scoreA(l) + scoreB(r) - straf + 1, true);
      zet(r, l, scoreA(r) + scoreB(l) - straf + 1, true);
    }
  });
  /* Ook de helften van een paar doen los mee, met een kleine extra straf:
     bij "Zelfstandig werkend kok" boven "Restaurant X - Curaçao" hoort de
     functie van de ene regel bij de linkerhelft van de andere — dat kon
     eerst niet, want los combineerde alleen met los. */
  const losse = [];
  opties.forEach(o => {
    if(o.een) losse.push(o);
    else if(o.paar){
      losse.push({een: o.paar[0], afstand: (o.afstand || 0) + 0.5});
      losse.push({een: o.paar[1], afstand: (o.afstand || 0) + 0.5});
    }
  });
  /* Een optie uit een "Functie ..."-labelregel hoort aan de functiekant
     thuis: flink erbij als hij daar staat, flink eraf als hij als
     werkgever wordt geprobeerd. Zonder dit werd "Eigenaar" (uit "Functie
     Eigenaar") de werkgever van een freelancer. "Bij Vepco te Moerdijk"
     is het spiegelbeeld: dat is de werkgeverskant. */
  const sA = o => scoreA(o.een) + (o.functieLabel ?  2 : 0) + (o.bedrijfHint ? -2 : 0);
  const sB = o => scoreB(o.een) + (o.functieLabel ? -2 : 0) + (o.bedrijfHint ?  2 : 0);
  losse.forEach(o1 => {
    const straf1 = (o1.afstand || 0) * 0.5;
    /* Een halve uitkomst is een punt minder waard dan een hele. Zonder deze
       aftrek wint "alleen een functie" het van "functie én werkgever" zodra
       de bedrijfsnaam geen herkenbaar woord bevat — en juist de werkgever
       is wat Tjeerd mist. */
    zet(o1.een, '', sA(o1) - straf1 - 1, false);
    losse.forEach(o2 => {
      if(o1 === o2) return;
      zet(o1.een, o2.een, sA(o1) + sB(o2) - straf1 - (o2.afstand||0) * 0.5, false);
    });
  });
  return beste || {a:'', b:'', score:-99, samen:false};
}

function werkUit(regels){
  const bl = blokken(regels, ['werk']);
  return bl.filter(b => !bl.zonderSectie || !lijktOpleiding(b.opties))
    .map(({per, opties, taken}) => {
    const k = kiesPaar(opties, functieScore, bedrijfScore);
    /* Zeker genoeg? Alleen als er een periode mét jaartallen staat én we
       zowel een werkgever als een functie hebben kunnen aanwijzen op iets
       beters dan een gok. */
    const zeker = (per.sterk && k.a && k.b && k.score >= 3) ? 'hoog' : 'laag';
    /* De regel die als functie of werkgever is gekozen mag niet ook nog een
       keer als taak terugkomen — dan staat dezelfde tekst twee keer op de
       kaart. */
    /* Vergelijken zonder leestekens aan het eind: de gekozen werkgever is
       "Fernandes Bottling N.V" (punt gestript), de taakregel "Fernandes
       Bottling N.V." — zonder normalisatie bleef de werkgeversnaam als
       taak op de kaart staan. */
    const norm = x => kaal(x).toLowerCase().replace(/[.,;:]+$/,'');
    const kop = [k.a, k.b].filter(Boolean).map(norm);
    const werk = (taken || [])
      .filter(t => !kop.includes(norm(t)))
      .filter((t, idx, arr) => arr.findIndex(x => kaal(x).toLowerCase() === kaal(t).toLowerCase()) === idx);
    return {functie: k.a, werkgever: k.b, van: per.van, tot: per.tot,
            lopend: per.lopend, periode: per.tekst, zeker,
            taken: werk};
  }).filter(w => w.functie || w.werkgever)
    .sort((a,b) => (b.lopend?1:0) - (a.lopend?1:0) || String(b.van).localeCompare(String(a.van)));
}

function opleidingUit(regels){
  const schoolScore = s => (INSTELLING_RE.test(s) ? 4 : 0) + (NIVEAU_RE.test(s) ? -2 : 1);
  const richtingScore = s => (NIVEAU_RE.test(s) ? 2 : 0) + (INSTELLING_RE.test(s) ? -3 : 1);
  /* Bewust alleen de opleidingensectie en niet ook de cursussen: die worden
     als certificaat opgepikt, en een "VCA t/m 2029" die óók als opleiding in
     de lijst komt maakt het overzicht juist onbetrouwbaar. */
  const bl = blokken(regels, ['opleiding']);
  return bl.filter(b => !bl.zonderSectie || lijktOpleiding(b.opties))
    .map(({per, opties}) => {
    const k = kiesPaar(opties, schoolScore, richtingScore);
    const alles = [k.a, k.b].filter(Boolean).join(' ');
    const niv = (alles.match(NIVEAU_RE) || [''])[0];
    const af = /\b(diploma|behaald|afgerond|geslaagd|voltooid|graduated)\b/i.test(alles) ? true
             : /\b(niet afgerond|onvoltooid|gestopt|afgebroken)\b/i.test(alles) ? false : null;
    return {school: k.a, richting: schoon(String(k.b).replace(NIVEAU_RE,'')) || '',
            niveau: niv ? niv.replace(/\s+/g,' ') : '', van: per.van, tot: per.tot,
            periode: per.tekst, afgerond: af,
            zeker: (k.a && k.score >= 3) ? 'hoog' : 'laag'};
  }).filter(o => o.school || o.richting)
    .sort((a,b) => String(b.van).localeCompare(String(a.van)));
}

/* ─── 9. Persoonsgegevens ─────────────────────────────────────────
   Voor elk veld geldt: liever leeg dan een gok die er zeker uitziet.
   Daarom krijgt alles een zekerheid mee, en die komt uit hóe we het
   gevonden hebben — niet uit hoe mooi het eruitziet. */

/* Telefoon. Nederlandse nummers worden genormaliseerd zodat zoeken en
   ontdubbelen werken; een buitenlands nummer laten we staan zoals het
   er staat, want daar kunnen we de opbouw niet van garanderen. */
function telefoonUit(t){
  /* Regels met een label dat op iets anders wijst eerst wegstrepen. Een
     rekeningnummer of een burgerservicenummer heeft ook negen cijfers, en
     die willen we niet in een telefoonveld — en al helemaal niet in de
     database. */
  const veilig = t.replace(/^.*\b(iban|rekening|bsn|burgerservice|sofinummer|paspoort|identiteitsbewijs|id[- ]?nummer|kvk|btw)\b.*$/gim, '');
  const mob = veilig.match(/(?:\+31[\s-]?\(?0?\)?|0031|\b0)6[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}\b/);
  if(mob) return {waarde: '06' + mob[0].replace(/\D/g,'').replace(/^(0031|31|0)?6/,''), zeker:'hoog'};
  const vast = veilig.match(/\b0\d{1,3}[\s.-]?\d{6,7}\b/);
  if(vast) return {waarde: vast[0].replace(/\D/g,''), zeker:'hoog'};
  const bui = veilig.match(/\+\d{1,3}[\s.-]?\d[\d\s.-]{6,13}\d/);
  if(bui) return {waarde: bui[0].replace(/\s{2,}/g,' ').trim(), zeker:'laag'};
  return null;
}

/* Adres, postcode en woonplaats. De woonplaats moet uit het contactblok
   komen, niet uit een werkgeversregel — anders verhuist een kandidaat uit
   Rotterdam naar Vlaardingen omdat hij daar ooit gewerkt heeft. Vandaar
   dat we in de buurt van het e-mailadres of het telefoonnummer zoeken. */
function adresUit(regels){
  const uit = {adres:null, postcode:null, woonplaats:null};
  const rs = regels.map(r => kaal(r.tekst));

  rs.forEach((r, i) => {
    const pc = r.match(/\b(\d{4})\s?([A-Z]{2})\b(?![A-Za-z])/);
    if(pc && !uit.postcode){
      uit.postcode = {waarde: pc[1] + ' ' + pc[2], zeker:'hoog'};
      /* Plaats achter de postcode, of anders op de volgende regel. */
      const na = schoon(r.slice(pc.index + pc[0].length));
      const kand = na || schoon(rs[i+1] || '');
      const p = plaatsnaam(kand);
      if(p) uit.woonplaats = {waarde:p, zeker:'hoog'};
    }
    const st = r.match(/\b([A-ZÀ-Ž][\wÀ-ž'’.-]*\s?(?:straat|laan|weg|plein|kade|dijk|singel|hof|pad|baan|dreef|gracht|steeg|park|erf|wal|markt|ring|akker|veld|es|dwarsstraat))\s+(\d+[a-zA-Z]?)\b/i);
    if(st && !uit.adres) uit.adres = {waarde: schoon(st[0]), zeker:'hoog'};
  });

  if(!uit.woonplaats){
    /* Binnen drie regels van het e-mailadres of telefoonnummer: dat is het
       contactblok, waar de wóónplaats staat. */
    const anker = rs.findIndex(r => /[\w.+-]+@[\w-]+\.\w{2,}/.test(r) || /\b0\d[\d\s.-]{7,}\b/.test(r));
    if(anker >= 0){
      for(let d = 0; d <= 3 && !uit.woonplaats; d++){
        for(const i of [anker + d, anker - d]){
          const r = rs[i]; if(!r) continue;
          for(const stuk of r.split(/[|·•,\t]/)){
            const p = plaatsnaam(schoon(stuk).replace(/\b(the\s+)?(netherlands|nederland|holland)\b/i,''));
            if(p){ uit.woonplaats = {waarde:p, zeker:'hoog'}; break; }
          }
          if(uit.woonplaats) break;
        }
      }
    }
  }
  return uit;
}
function plaatsnaam(s){
  const t = schoon(s);
  if(!t || t.length > 30 || /\d/.test(t)) return '';
  return CRM.PLAATSEN[CRM.plaatsSleutel(t)] ? t : '';
}

/* Naam. De grootste letters bovenaan pagina 1 zijn vrijwel altijd de naam;
   sectiekopjes en ons eigen logo vallen af. Lukt dat niet, dan de
   bestandsnaam — die is minder betrouwbaar en krijgt dus 'laag'. */
const NAAM_WOORD = /^[A-ZÀ-Ž][\wÀ-ž'’-]*$|^(van|de|der|den|da|do|dos|del|di|el|al|bin|ten|ter|te|op|in)$/;
function naamUit(groot, bestandsnaam){
  const kandidaten = [];
  (groot || []).forEach(r => {
    let t = schoon(r).replace(/\s+/g,' ');
    /* Sommige omzettingen verdubbelen de naamregel letterlijk
       ("Bilal YildizBilal Yildiz") — de helft is dan de echte naam. */
    const h = t.length >> 1;
    if(t.length >= 6 && t.length % 2 === 0 && t.slice(0, h) === t.slice(h)) t = t.slice(0, h).trim();
    if(!t || t.length > 45) return;
    if(SECTIES.some(([, re]) => re.test(t))) return;
    if(/ploeggenoten|curriculum|\bcv\b|resume|r[ée]sum[ée]/i.test(t)) return;
    const w = t.split(' ');
    if(w.length > 5 || !w.every(x => NAAM_WOORD.test(x))) return;
    kandidaten.push(t);
  });
  /* Voornaam en achternaam onder elkaar in een groot lettertype horen bij
     elkaar zolang het samen een gewone naam blijft. */
  if(kandidaten.length >= 2 && kandidaten.slice(0,2).join(' ').split(' ').length <= 4
     && kandidaten[0].split(' ').length <= 2 && kandidaten[1].split(' ').length <= 3)
    kandidaten[0] = kandidaten[0] + ' ' + kandidaten[1];
  if(kandidaten[0] && kandidaten[0].includes(' ')) return {waarde:kandidaten[0], zeker:'hoog'};
  const uitNaam = naamUitBestand(bestandsnaam);
  if(kandidaten[0]) return {waarde: uitNaam && uitNaam.length > kandidaten[0].length ? uitNaam : kandidaten[0], zeker:'laag'};
  return uitNaam ? {waarde:uitNaam, zeker:'laag'} : null;
}
function naamUitBestand(n){
  let t = String(n||'').replace(/\.[a-z0-9]+$/i,'')
    .replace(/curriculum\s*vitae|\bcv\b|\bresume\b|ploeggenoten|\b(19|20)\d{2}\b|definitief|nieuw|kopie|\(\d+\)/gi,' ')
    .replace(/[_\-–—]+/g,' ');
  /* "JanvanderBerg" → "Jan van der Berg": een bestandsnaam zonder spaties
     valt aan de hoofdletters uit elkaar te halen. */
  t = t.replace(/([a-zà-ž])([A-ZÀ-Ž])/g, '$1 $2').replace(/\s+/g,' ').trim();
  const w = t.split(' ').filter(x => NAAM_WOORD.test(x));
  return (w.length >= 1 && w.length <= 5) ? w.join(' ') : '';
}

/* Geboortedatum: alleen met een label erbij. Een losse datum ergens in een
   cv is net zo vaak een startdatum of een diplomajaar. */
function geboorteUit(t){
  const m = t.match(new RegExp(`\\b(geboortedatum|geboren(?:\\s+op)?|geb\\.?|date of birth|d\\.?o\\.?b\\.?|data urodzenia)\\b[^\\n\\d]{0,14}(\\d{1,2})[\\s./-](\\d{1,2}|${MND_RE})[\\s./-](\\d{4})`, 'i'));
  if(!m) return null;
  const mnd = /^\d+$/.test(m[3]) ? +m[3] : MND[m[3].toLowerCase()];
  if(!mnd || mnd > 12) return null;
  const d = `${m[4]}-${String(mnd).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  if(isNaN(new Date(d).getTime())) return null;
  return {waarde:d, zeker:'hoog'};
}
function leeftijdUit(iso){
  if(!iso) return null;
  const g = new Date(iso), nu = new Date();
  let l = nu.getFullYear() - g.getFullYear();
  const m = nu.getMonth() - g.getMonth();
  if(m < 0 || (m === 0 && nu.getDate() < g.getDate())) l--;
  return (l > 14 && l < 80) ? l : null;
}

/* ─── 10. Certificaten ────────────────────────────────────────────
   Met geldigheidsdatum als die in het cv staat: een VCA die vorige maand
   verlopen is, is geen VCA. De datum komt van dezelfde regel als het
   certificaat — verderop in het document staat een datum die er niets
   mee te maken heeft. */
function certificatenUit(regels){
  const gevonden = new Map();
  regels.forEach(r => {
    const t = kaal(r.tekst);
    const inVak = ['cursus','vaardigheid','persoon','kop'].includes(r.sectie);
    CERTS.forEach(([re, label]) => {
      const m = re.exec(t);
      if(!m) return;
      /* Papier of ervaring? "heftruckcertificaat" en een regel in het
         certificatenvak zijn een papier; "ervaring met de heftruck" in een
         opsomming onder een dienstverband is dat niet. Allebei melden we,
         maar alleen het eerste met zekerheid 'hoog'. */
      const woorden = /certificaat|diploma|papier|pas\b|bezit|behaald|geldig|training|cursus|licentie|gecertificeerd/i.test(t);
      const kort = t.length <= 45 && !isOpsomming(t);
      const zeker = (woorden || (inVak && kort)) ? 'hoog' : 'laag';
      const bestaand = gevonden.get(label);
      if(bestaand && bestaand.zeker === 'hoog' && zeker === 'laag') return;
      gevonden.set(label, {naam: label, geldigTot: geldigheidUit(t, m.index), zeker});
    });
  });
  /* Staat er een specifiek lascertificaat bij, dan is het algemene
     "Lascertificaat" dubbelop. */
  const uit = [...gevonden.values()];
  if(uit.some(x => /^Lascertificaat .+/.test(x.naam)))
    return uit.filter(x => x.naam !== 'Lascertificaat');
  return uit;
}
/* Een datum op dezelfde regel, na het certificaat. "t/m 06-2028",
   "geldig tot 1 juni 2028", of gewoon "(2028)". */
function geldigheidUit(t, vanaf){
  const rest = t.slice(vanaf);
  let m = rest.match(new RegExp(`(?:geldig|t\\/?m|tot|until|valid|verloopt|expir\\w*|exp\\.?)[^0-9]{0,12}(\\d{1,2})[\\s./-](\\d{1,2}|${MND_RE})[\\s./-](\\d{4})`, 'i'));
  if(m){
    const mnd = /^\d+$/.test(m[2]) ? +m[2] : MND[m[2].toLowerCase()];
    if(mnd && mnd <= 12) return `${m[3]}-${String(mnd).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }
  m = rest.match(/(?:geldig|t\/?m|tot|until|valid|verloopt|expir\w*)[^0-9]{0,12}(\d{1,2})[\/.-](\d{4})/i);
  if(m && +m[1] <= 12) return `${m[2]}-${String(+m[1]).padStart(2,'0')}`;
  m = rest.match(/(?:geldig|t\/?m|tot|until|valid|verloopt|expir\w*)[^0-9]{0,12}((?:19|20)\d{2})/i)
      || rest.match(/\(\s*((?:20)\d{2})\s*\)/);
  return m ? m[1] : '';
}

/* ─── 11. Talen, rijbewijs, beschikbaarheid, vaardigheden ───────── */
function talenUit(regels){
  const uit = new Map();
  regels.forEach(r => {
    const t = kaal(r.tekst);
    if(t.length > 90) return;
    TALEN.forEach(([naam, re]) => {
      if(!re.test(t)) return;
      const nv = (TAALNIVEAUS.find(([nre]) => nre.test(t)) || [])[1] || '';
      const zeker = r.sectie === 'taal' ? 'hoog' : (t.length <= 30 ? 'laag' : null);
      if(zeker === null) return;
      const oud = uit.get(naam);
      if(oud && oud.zeker === 'hoog' && zeker === 'laag') return;
      uit.set(naam, {naam, niveau: nv, zeker});
    });
  });
  return [...uit.values()];
}

function rijbewijsUit(t){
  const m = t.match(/\b(rijbewijs|rijbewijzen|driving licen[cs]e|driver.?s licen[cs]e|prawo jazdy|permis)\b[^\n]{0,60}/i);
  if(m){
    const cats = [...new Set((m[0].match(/\b(AM|A1|A2|BE|B\+E|C1E|CE|C1|DE|D1|[ABCDT])\b/g) || []))];
    if(cats.length) return {waarde: cats.join('/'), zeker:'hoog'};
    return {waarde:'genoemd in cv', zeker:'laag'};
  }
  return null;
}
function vervoerUit(t){
  if(/\beigen\s+(vervoer|auto|wagen|bus)\b|\bown transport\b|beschik(t|)\s+over\s+(eigen\s+)?vervoer/i.test(t))
    return {waarde:'auto', zeker:'hoog'};
  if(/\bgeen\s+eigen\s+vervoer\b|\bopenbaar vervoer\b|\bmet\s+het\s+ov\b/i.test(t))
    return {waarde:'ov', zeker:'laag'};
  return null;
}

function beschikbaarUit(t){
  const uit = {beschikbaar:null, ploegen:null, uren:null, bereid:[]};
  if(/\b(per\s+direct|direct\s+(beschikbaar|inzetbaar)|immediately available|z\.?s\.?m\.?\s+beschikbaar|acuut beschikbaar)\b/i.test(t))
    uit.beschikbaar = {waarde:'direct', zeker:'hoog'};
  else {
    const m = t.match(/\bbeschikbaar\s+(?:per|vanaf|met ingang van)\s+([^\n.,;]{2,30})/i);
    if(m) uit.beschikbaar = {waarde:'in overleg', zeker:'laag', toelichting: schoon(m[1])};
  }
  const pl = t.match(/\b([235])[\s-]*(?:ploegen|ploegendienst|shift)/i);
  if(pl) uit.ploegen = {waarde: pl[1], zeker:'hoog'};
  else if(/\bploegendienst|\bwisselende diensten|\bwisseldienst|rotating shifts?\b/i.test(t))
    uit.ploegen = {waarde:'wisselend', zeker:'laag'};
  else if(/\balleen dagdienst|\bgeen ploegendienst\b/i.test(t))
    uit.ploegen = {waarde:'geen', zeker:'hoog'};
  const u = t.match(/\b(\d{2})\s*uur\s*(?:per week)?\b/i);
  if(u && +u[1] >= 8 && +u[1] <= 60) uit.uren = {waarde: u[1] + ' uur', zeker:'laag'};
  else if(/\b(fulltime|voltijd|full[- ]time)\b/i.test(t)) uit.uren = {waarde:'fulltime', zeker:'hoog'};
  else if(/\b(parttime|deeltijd|part[- ]time)\b/i.test(t)) uit.uren = {waarde:'parttime', zeker:'hoog'};
  /* Alleen wat de kandidaat als bereidheid opschrijft telt. "Verantwoordelijk
     voor veiligheid tijdens nachtdiensten" in een functieomschrijving is
     iets wat hij deed, niet iets waar hij ja op zegt — en dat verschil
     bepaalt of een AM hem 's nachts durft in te plannen. */
  const bereidRe = w => new RegExp(`\\b(bereid|beschikbaar|inzetbaar|open|geen bezwaar|flexibel|kan|wil|willing)\\b[^.\\n]{0,60}\\b${w}`, 'i');
  if(bereidRe('nacht').test(t)) uit.bereid.push('nachtdienst');
  if(bereidRe('weekend').test(t)) uit.bereid.push('weekend');
  if(bereidRe('over(werk|uren)').test(t)) uit.bereid.push('overwerk');
  if(bereidRe('ploegen').test(t) && !uit.ploegen) uit.ploegen = {waarde:'wisselend', zeker:'laag'};
  return uit;
}

/* Vaardigheden: wat de kandidaat zélf onder "vaardigheden" heeft gezet.
   Geen woordenlijst over het hele document loslaten — dan wordt elk woord
   uit een functieomschrijving een vaardigheid en staat de kaart vol met
   ruis waar niemand meer doorheen kijkt. */
function skillsUit(regels){
  const uit = [];
  regels.forEach(r => {
    if(r.sectie !== 'vaardigheid') return;
    /* Niet op komma splitsen: "Microsoft Office (Word, Excel, Outlook)" is
       één vaardigheid en valt anders in drie brokjes uiteen. */
    kaal(r.tekst).split(/[•·;|]|\s{3,}/).forEach(deel => {
      const t = schoon(deel);
      if(!t || t.length < 3 || t.length > 50) return;
      if(TALEN.some(([, re]) => re.test(t))) return;
      if(uit.length < 18 && !uit.some(x => x.toLowerCase() === t.toLowerCase())) uit.push(t);
    });
  });
  return uit;
}

/* ─── 12. Alles bij elkaar ────────────────────────────────────── */
function parseTekst(tekst, opts={}){
  const t = String(tekst || '');
  const regels = sectieRegels(t);
  const platte = regels.map(r => kaal(r.tekst)).join('\n');

  const werk = werkUit(regels);
  const opleidingen = opleidingUit(regels);
  const adres = adresUit(regels);
  const geb = geboorteUit(platte);
  const em = platte.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  const besch = beschikbaarUit(platte);

  const jaren = werk.map(w => +String(w.van).slice(0,4)).filter(j => j >= 1960 && j <= new Date().getFullYear());
  const ervaring = jaren.length ? Math.max(0, Math.min(50, new Date().getFullYear() - Math.min(...jaren))) : null;

  const velden = {
    naam:          naamUit(opts.groot, opts.bestandsnaam),
    geboortedatum: geb,
    telefoon:      telefoonUit(platte),
    email:         em ? {waarde: em[0].toLowerCase(), zeker:'hoog'} : null,
    adres:         adres.adres,
    postcode:      adres.postcode,
    woonplaats:    adres.woonplaats,
    nationaliteit: nationaliteitUit(platte),
    functie:       werk.length && werk[0].functie ? {waarde: werk[0].functie.slice(0,60), zeker: werk[0].zeker} : null,
    rijbewijs:     rijbewijsUit(platte),
    vervoer:       vervoerUit(platte),
    beschikbaar:   besch.beschikbaar,
    ploegen:       besch.ploegen
  };
  if(velden.geboortedatum){
    const l = leeftijdUit(velden.geboortedatum.waarde);
    if(l) velden.leeftijd = {waarde: l, zeker: velden.geboortedatum.zeker, afgeleid:true};
  }

  const certificaten = certificatenUit(regels);
  const talen = talenUit(regels);
  const skills = skillsUit(regels);

  /* Wat we níet gevonden hebben blijft staan. Een AM die weet dat er geen
     rijbewijs in het cv stond, hoeft er niet naar te zoeken. */
  const nietGevonden = [];
  const mist = (v, lbl) => { if(!v) nietGevonden.push(lbl); };
  mist(velden.naam, 'naam'); mist(velden.telefoon, 'telefoonnummer');
  mist(velden.email, 'e-mailadres'); mist(velden.woonplaats, 'woonplaats');
  mist(velden.geboortedatum, 'geboortedatum'); mist(velden.rijbewijs, 'rijbewijs');
  mist(velden.beschikbaar, 'beschikbaarheid');
  if(!werk.length) nietGevonden.push('werkverleden met jaartallen');
  if(!opleidingen.length) nietGevonden.push('opleidingen');
  if(!certificaten.length) nietGevonden.push('certificaten');
  if(!talen.length) nietGevonden.push('talen');

  return {velden, werk, opleidingen, certificaten, talen, skills,
          uren: besch.uren, bereid: besch.bereid, ervaringJaren: ervaring,
          nietGevonden, ruw: t, regels: regels.length};
}

/* ─── 13. Pasfoto uit de pdf ──────────────────────────────────────
   Een pdf bevat álle plaatjes: het logo, een decoratieve balk, een
   iconenset én soms een pasfoto. We onderscheiden ze aan hoe ze op de
   pagina staan, niet aan wat erop staat — een pasfoto is redelijk
   portret tot vierkant, staat bovenaan pagina 1 en is fors. Een logo is
   breed en laag, een icoon is klein.
   Lukt het niet, dan lukt het niet: dit mag het inlezen nooit ophouden. */
async function fotoUitPdf(doc){
  try{
    const lib = await laadPdfJs();
    const OPS = lib.OPS;
    const page = await doc.getPage(1);
    const vp = page.getViewport({scale:1});
    const ops = await page.getOperatorList();

    let ctm = [1,0,0,1,0,0]; const stapel = [];
    const mul = (a, b) => [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3],
                           a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3],
                           a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]];
    const kandidaten = [];
    for(let i = 0; i < ops.fnArray.length; i++){
      const fn = ops.fnArray[i], arg = ops.argsArray[i];
      if(fn === OPS.save) stapel.push(ctm.slice());
      else if(fn === OPS.restore) ctm = stapel.pop() || ctm;
      else if(fn === OPS.transform) ctm = mul(arg, ctm);
      else if(fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject){
        /* De plaatsing: het eenheidsvierkant afgebeeld door de matrix. */
        const br = Math.hypot(ctm[0], ctm[1]), hg = Math.hypot(ctm[2], ctm[3]);
        const onder = ctm[5], boven = vp.height - (onder + hg);   // afstand tot de bovenrand
        kandidaten.push({id: arg[0], br, hg, boven});
      }
    }
    const goed = kandidaten.filter(k =>
      k.hg >= 55 && k.br >= 40 &&                    // niet een icoontje
      k.hg / k.br >= 0.75 && k.hg / k.br <= 2.2 &&   // portret tot licht liggend, geen balk
      k.boven < vp.height * 0.5);                    // op de bovenste helft
    if(!goed.length) return null;
    goed.sort((a,b) => (b.br * b.hg) - (a.br * a.hg));
    return await afbeeldingBlob(page, goed[0].id);
  }catch(e){ return null; }
}

/* Het beeldobject uit pdf.js naar een png. pdf.js levert afhankelijk van de
   versie en het bronformaat een ImageBitmap of losse pixels; allebei kunnen
   op een canvas. */
async function afbeeldingBlob(page, id){
  const bron = (page.objs && page.objs.has && page.objs.has(id)) ? page.objs
             : (page.commonObjs && page.commonObjs.has && page.commonObjs.has(id)) ? page.commonObjs : null;
  if(!bron) return null;
  const img = bron.get(id);
  if(!img) return null;
  const b = img.width, hg = img.height;
  if(!b || !hg || b * hg > 40e6) return null;
  const cv = document.createElement('canvas');
  cv.width = b; cv.height = hg;
  const ctx = cv.getContext('2d');
  if(img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
  else if(img.data){
    const uit = ctx.createImageData(b, hg), d = img.data, u = uit.data;
    const kanalen = d.length / (b * hg);
    for(let i = 0, p = 0; i < b * hg; i++){
      if(kanalen >= 3){ u[p++] = d[i*kanalen]; u[p++] = d[i*kanalen+1]; u[p++] = d[i*kanalen+2]; u[p++] = kanalen === 4 ? d[i*kanalen+3] : 255; }
      else { const g = d[i*kanalen]; u[p++] = g; u[p++] = g; u[p++] = g; u[p++] = 255; }
    }
    ctx.putImageData(uit, 0, 0);
  } else return null;
  return await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
}

function nationaliteitUit(t){
  const m = t.match(/\b(nationaliteit|nationality|nationalitatea|obywatelstwo)\b\s*[:\-–]?\s*([A-Za-zÀ-ž ]{3,25})/i);
  if(m) return {waarde: schoon(m[2]).replace(/\s+/g,' '), zeker:'hoog'};
  return null;
}

/* ─── 14. Het voorstel ────────────────────────────────────────────
   Per veld: wat staat er nu op de kaart, wat zegt het cv, en wat doen we
   standaard. De regel is: een leeg veld vullen we aan, een gevuld veld
   raken we niet aan tenzij de AM dat zelf aanvinkt. Wie een telefoonnummer
   heeft ingetypt had daar een reden voor. */
const VELDEN = [
  ['naam',          'Naam',            c => c.naam],
  /* De leeftijd staat erbij maar wordt niet apart bewaard: hij is elk jaar
     anders, dus een opgeslagen leeftijd is per definitie na een tijdje fout.
     Uit de datum is hij altijd goed te berekenen. */
  ['geboortedatum', 'Geboortedatum',   c => c.geboortedatum,
     v => { const l = leeftijdUit(v); return CRM.fmtDate(v) + (l ? ` (${l} jaar)` : ''); }],
  ['telefoon',      'Telefoon',        c => c.telefoon],
  ['email',         'E-mail',          c => c.email],
  ['woonplaats',    'Woonplaats',      c => c.woonplaats],
  ['functie',       'Gezochte functie',c => c.functie],
  ['rijbewijs',     'Rijbewijs',       c => c.rijbewijs],
  ['vervoer',       'Vervoer',         c => c.vervoer],
  ['beschikbaar',   'Beschikbaarheid', c => c.beschikbaar],
  ['ploegen',       'Ploegendienst',   c => c.ploegen],
  /* Adres, postcode en nationaliteit hebben geen eigen kolom op de
     kandidaat. Ze gaan mee in het cv-blok in plaats van te verdwijnen —
     zie het verzoek aan de coördinator onderaan dit bestand. */
  ['adres',         'Adres',           c => (c.cv||{}).adres,        null, true],
  ['postcode',      'Postcode',        c => (c.cv||{}).postcode,     null, true],
  ['nationaliteit', 'Nationaliteit',   c => (c.cv||{}).nationaliteit, null, true]
];

/* Telefoonnummers vergelijken los van spaties en landcode: 06-12345678 en
   +31 6 12345678 zijn hetzelfde nummer en horen geen conflict te geven. */
const telNorm = t => {
  let n = String(t||'').replace(/\D/g,'');
  if(n.startsWith('0031')) n = '0' + n.slice(4);
  else if(n.startsWith('31') && n.length > 9) n = '0' + n.slice(2);
  return n;
};
function gelijk(sleutel, a, b){
  if(sleutel === 'telefoon') return telNorm(a) === telNorm(b);
  if(sleutel === 'email') return String(a).toLowerCase() === String(b).toLowerCase();
  if(sleutel === 'woonplaats') return CRM.plaatsSleutel(a) === CRM.plaatsSleutel(b);
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function voorstelMaken(c, p){
  const rijen = [];
  VELDEN.forEach(([sleutel, label, lees, toon, inCv]) => {
    const gevonden = p.velden[sleutel];
    if(!gevonden || !String(gevonden.waarde).trim()) return;
    const nu = String(lees(c) || '').trim();
    const nieuw = String(gevonden.waarde).trim();
    if(nu && gelijk(sleutel, nu, nieuw)) return;         // niets te kiezen
    rijen.push({sleutel, label, nu, nieuw, inCv,
      toon: toon ? (v => { try{ return toon(v); }catch(e){ return v; } }) : (v => v),
      zeker: gevonden.zeker, botst: !!nu,
      aan: !nu});                                        // leeg vullen mag, overschrijven niet
  });
  return rijen;
}

/* ─── 15. Het venster ─────────────────────────────────────────── */
function open(opts={}){
  const c = opts.kandidaat;
  if(!c) return CRM.toast('Geen kandidaat om het CV bij te zetten','err');
  let p = null, bestand = null, fotoBlob = null, rijen = [], ruw = '';

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">CV inlezen</div>
      <p class="sub" style="margin:6px 0 0">Het bestand wordt in je browser gelezen — er gaat niets naar een
      externe dienst. Je ziet per gegeven wat er nu op de kaart staat en wat het CV zegt, en kiest zelf wat je overneemt.</p></div>
    <div class="modal-b cvp-b">
      <div class="f-row cvp-kies">
        <label for="cvp_file">Bestand</label>
        <input type="file" id="cvp_file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain">
        <div class="hint">PDF, Word (.docx) of tekstbestand. Maximaal 25 MB.</div>
      </div>
      <div id="cvp_uit"></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Sluiten</button>
      <span class="spacer"></span>
      <button class="btn sub sm" id="cvp_alles" hidden>Alles aan</button>
      <button class="btn sub sm" id="cvp_geen" hidden>Alles uit</button>
      <button class="btn" id="cvp_ok" disabled>Overnemen</button>
    </div>`, {onOpen(m){
    /* Breder dan een gewone modal: hiernaast staan twee kolommen met
       waarden, en die moeten naast elkaar leesbaar blijven. */
    m.classList.add('cvp-modal');
    CRM.modal._onClose = () => m.classList.remove('cvp-modal');
    const inp = m.querySelector('#cvp_file'), uit = m.querySelector('#cvp_uit');
    const ok = m.querySelector('#cvp_ok'), alles = m.querySelector('#cvp_alles'), geen = m.querySelector('#cvp_geen');

    async function verwerk(f){
      bestand = f; fotoBlob = null;
      uit.innerHTML = CRM.ui.laden('Bestand lezen…');
      ok.disabled = true; alles.hidden = geen.hidden = true;
      try{
        const r = await leesBestand(f);
        ruw = r.tekst || '';
        if(!ruw.replace(/[\s\f]/g,'')){
          uit.innerHTML = geenTekstHtml(r, f);
          bindOpslaanAlleen(m);
          return;
        }
        /* opts.parsed = een al uitgelezen cv, van js/cvclaude.js. Zelfde
           vorm, dus vanaf hier is het één weg: hetzelfde controlevenster,
           dezelfde vinkjes per gegeven, dezelfde opslag. Twee weergaven voor
           twee routes zou betekenen dat niemand meer weet welke waarheid op
           de kaart komt. Eén keer gebruiken en dan loslaten — een volgend
           bestand in ditzelfde venster hoort weer gewoon geparsed te worden. */
        p = opts.parsed || parseTekst(ruw, {bestandsnaam: f.name, groot: r.groot});
        opts.parsed = null;
        if(r.doc) fotoBlob = await fotoUitPdf(r.doc);
        rijen = voorstelMaken(c, p);
        uit.innerHTML = voorstelHtml(c, p, rijen, fotoBlob, r);
        bindVoorstel(m);
        alles.hidden = geen.hidden = false;
        ok.disabled = false;
        ok.textContent = 'Overnemen';
        const eerste = uit.querySelector('input[type=checkbox]');
        if(eerste) setTimeout(() => eerste.focus(), 60);
      }catch(err){
        uit.innerHTML = `<div class="note err">${h(err.message || 'Lezen mislukt')}</div>`;
        bindOpslaanAlleen(m);
      }
    }

    /* Ook als het parsen niets oplevert moet het bestand bewaard kunnen
       worden. Een gescand cv is nog steeds hét document waar de AM straks
       naar wil kijken. */
    function bindOpslaanAlleen(){
      p = null; rijen = [];
      ok.disabled = false; ok.textContent = 'Alleen bestand bewaren';
      alles.hidden = geen.hidden = true;
    }

    inp.onchange = e => { const f = e.target.files[0]; if(f) verwerk(f); };
    if(opts.bestand){ inp.hidden = true; m.querySelector('.cvp-kies').hidden = true; verwerk(opts.bestand); }

    const zetAlles = aan => uit.querySelectorAll('input[type=checkbox]:not(:disabled)')
      .forEach(b => { b.checked = aan; b.dispatchEvent(new Event('change', {bubbles:true})); });
    alles.onclick = () => zetAlles(true);
    geen.onclick  = () => zetAlles(false);

    /* Voor wie er twintig op een ochtend doet: kiezen met de spatiebalk,
       opslaan met Cmd/Ctrl+Enter, sluiten met Escape (dat doet core al). */
    m.addEventListener('keydown', ev => {
      if(ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && !ok.disabled){ ev.preventDefault(); ok.click(); }
    });

    ok.onclick = async () => {
      ok.disabled = true; ok.textContent = 'Bezig…';
      try{ await overnemen(c, p, rijen, bestand, fotoBlob, uit, opts.onKlaar); }
      catch(e){ CRM.fout('Opslaan mislukt', e); ok.disabled = false; ok.textContent = 'Overnemen'; }
    };
  }});
}

function geenTekstHtml(r, f){
  return `<div class="note warn"><b>Er kwam geen tekst uit dit bestand.</b>
    ${r.soort === 'pdf'
      ? 'Waarschijnlijk is dit een scan of een pdf waarin de tekst als afbeelding is opgeslagen. Dat komt ook voor bij ontwerpprogramma\'s die de letters omzetten naar vormen — de pdf ziet er dan prima uit, maar er staat geen letter in.'
      : 'Het bestand bevat geen leesbare tekst.'}
    Je kunt het bestand wel bewaren bij de kandidaat; de gegevens vul je dan met de hand in.</div>
    <div class="meta" style="margin-top:8px">${h(f.name)} · ${h(kb(f.size))}</div>`;
}
const kb = n => n > 1048576 ? (n/1048576).toFixed(1).replace('.',',') + ' MB' : Math.max(1, Math.round(n/1024)) + ' kB';

/* Een waarde waar we niet zeker van zijn krijgt een zichtbaar merkteken.
   Niet omdat het waarschijnlijk fout is, maar omdat een gok die er zeker
   uitziet nooit meer gecorrigeerd wordt: hij staat op de kaart, iedereen
   leest hem, en niemand weet meer waar hij vandaan kwam. */
const merk = z => z === 'hoog' ? '' : '<span class="chip amber cvp-let">controleren</span>';

function voorstelHtml(c, p, rijen, fotoBlob, r){
  const nieuwWerk = p.werk, nieuwOpl = p.opleidingen;
  const alCert = new Set(((c.cv||{}).certificaten||[]).map(x =>
    String((x && typeof x === 'object' ? (x.naam||x.certificaat) : x) || '').toLowerCase()));
  const nieuweCerts = p.certificaten.filter(x => !alCert.has(x.naam.toLowerCase()));

  return `
  ${rijen.length ? `<div class="cvp-kop"><b>Gegevens</b>
      <span class="meta">lege velden staan aan, bestaande waarden uit</span></div>
    <div class="cvp-tabel">
      <div class="cvp-hoofd"><span></span><span>Veld</span><span>Nu op de kaart</span><span>In het CV</span></div>
      ${rijen.map((rr, i) => `<label class="cvp-rij${rr.botst?' botst':''}">
        <input type="checkbox" data-veld="${i}"${rr.aan?' checked':''}>
        <span class="cvp-lbl">${h(rr.label)}${rr.inCv?'<em class="meta"> · bij het CV</em>':''}</span>
        <span class="cvp-nu">${rr.nu ? h(rr.toon(rr.nu)) : '<em class="meta">leeg</em>'}</span>
        <span class="cvp-cv">${h(rr.toon(rr.nieuw))} ${merk(rr.zeker)}</span>
      </label>`).join('')}
    </div>` : '<div class="note info">Geen losse gegevens die van de kaart afwijken of hem aanvullen.</div>'}

  ${nieuwWerk.length ? `<div class="cvp-kop" style="margin-top:18px"><b>Werkervaring</b>
      <span class="meta"><span class="num">${nieuwWerk.length}</span> dienstverband${nieuwWerk.length===1?'':'en'} · nieuwste eerst · je kunt elke regel bijwerken</span></div>
    <div class="cvp-lijst" id="cvp_werk">
      ${nieuwWerk.map((w, i) => `<div class="cvp-item${w.zeker==='laag'?' let':''}">
        <input type="checkbox" data-werk="${i}" checked aria-label="Dit dienstverband overnemen">
        <div class="cvp-vel">
          <input type="text" data-wf="${i}" value="${h(w.functie)}" placeholder="Functie" aria-label="Functie">
          <input type="text" data-wg="${i}" value="${h(w.werkgever)}" placeholder="Werkgever" aria-label="Werkgever">
          <input type="text" data-wp="${i}" value="${h(periodeTekst(w))}" placeholder="Periode" aria-label="Periode" class="num">
        </div>
        ${merk(w.zeker)}
      </div>`).join('')}
    </div>` : ''}

  ${nieuwOpl.length ? `<div class="cvp-kop" style="margin-top:18px"><b>Opleidingen</b>
      <span class="meta"><span class="num">${nieuwOpl.length}</span> gevonden</span></div>
    <div class="cvp-lijst" id="cvp_opl">
      ${nieuwOpl.map((o, i) => `<div class="cvp-item${o.zeker==='laag'?' let':''}">
        <input type="checkbox" data-opl="${i}" checked aria-label="Deze opleiding overnemen">
        <div class="cvp-vel">
          <input type="text" data-os="${i}" value="${h(o.school)}" placeholder="School" aria-label="School">
          <input type="text" data-or="${i}" value="${h([o.niveau, o.richting].filter(Boolean).join(' '))}" placeholder="Richting en niveau" aria-label="Richting en niveau">
          <input type="text" data-op="${i}" value="${h(periodeTekst(o))}" placeholder="Periode" aria-label="Periode" class="num">
        </div>
        ${merk(o.zeker)}
      </div>`).join('')}
    </div>` : ''}

  ${nieuweCerts.length ? `<div class="cvp-kop" style="margin-top:18px"><b>Certificaten</b>
      <span class="meta">vul de geldigheidsdatum aan als je hem weet</span></div>
    <div class="cvp-lijst" id="cvp_cert">
      ${nieuweCerts.map((x, i) => `<div class="cvp-item${x.zeker==='laag'?' let':''}">
        <input type="checkbox" data-cert="${i}"${x.zeker==='hoog'?' checked':''} aria-label="Dit certificaat overnemen">
        <div class="cvp-vel twee">
          <input type="text" data-cn="${i}" value="${h(x.naam)}" aria-label="Certificaat">
          <input type="date" data-cd="${i}" value="${h(/^\d{4}-\d{2}-\d{2}$/.test(x.geldigTot) ? x.geldigTot : '')}" aria-label="Geldig tot">
        </div>
        ${x.geldigTot && !/^\d{4}-\d{2}-\d{2}$/.test(x.geldigTot)
          ? `<span class="meta">cv zegt: ${h(x.geldigTot)}</span>` : merk(x.zeker)}
      </div>`).join('')}
    </div>` : ''}

  ${p.talen.length || p.skills.length ? `<div class="cvp-kop" style="margin-top:18px"><b>Talen en vaardigheden</b></div>
    <div class="cvp-chips">
      ${p.talen.length ? `<label class="cvp-blok"><input type="checkbox" data-talen checked>
        <span>Talen: ${p.talen.map(t => h(t.naam + (t.niveau ? ' ('+t.niveau+')' : ''))).join(', ')}</span></label>` : ''}
      ${p.skills.length ? `<label class="cvp-blok"><input type="checkbox" data-skills checked>
        <span>Vaardigheden: ${p.skills.map(s => h(s)).join(', ')}</span></label>` : ''}
      ${p.ervaringJaren != null ? `<label class="cvp-blok"><input type="checkbox" data-erv checked>
        <span>Ongeveer <span class="num">${p.ervaringJaren}</span> jaar werkervaring</span></label>` : ''}
    </div>` : ''}

  ${fotoBlob ? `<div class="cvp-kop" style="margin-top:18px"><b>Pasfoto</b></div>
    <label class="cvp-foto"><input type="checkbox" data-foto${c.foto?'':' checked'}>
      <img src="${URL.createObjectURL(fotoBlob)}" alt="Pasfoto uit het CV">
      <span>${c.foto ? 'Er staat al een foto op de kaart. Vink aan om die te vervangen.'
                     : 'Uit het CV gehaald. Controleer of dit echt de kandidaat is en geen logo.'}</span></label>` : ''}

  <div class="cvp-bestand note info" style="margin-top:18px">
    <b>Het bestand blijft bij de kandidaat staan.</b>
    ${(c.cv||{}).bestandPad
      ? `Er staat al een CV (${h((c.cv||{}).bestand||'onbekend')}). Dat wordt niet weggegooid — het schuift door naar "eerdere versies", zodat je altijd terug kunt naar wat je destijds naar de klant stuurde.`
      : 'Openen kan straks vanaf de kandidatenkaart, via een tijdelijke link.'}
    ${CRM.demo ? '<br><b>Demomodus:</b> er wordt niets geüpload.' : ''}
  </div>

  ${magerHtml(p, r)}
  ${p.nietGevonden.length
    ? `<div class="note warn" style="margin-top:12px">Niet in het CV gevonden: ${h(p.nietGevonden.join(', '))}.</div>`
    : '<div class="note ok" style="margin-top:12px">Alles gevonden waar we naar zochten.</div>'}
  ${r && r.afgekapt ? '<div class="note warn" style="margin-top:8px">Dit bestand heeft meer dan twaalf pagina\'s; alleen de eerste twaalf zijn gelezen.</div>' : ''}

  <details class="cvp-ruw"><summary>Ruwe tekst uit het bestand (<span class="num">${p.regels}</span> regels)</summary>
    <pre>${h(p.ruw.replace(/\f/g,'\n───\n'))}</pre></details>`;
}

/* Kwam er wel tekst uit, maar bespottelijk weinig? Dan is het geen slechte
   parser maar een pdf waarin de letters vormen zijn geworden. Dat moet de AM
   weten, anders blijft hij het bij de volgende kandidaat opnieuw proberen —
   en het is iets dat aan de bron op te lossen valt. */
function magerHtml(p, r){
  if(!r || r.soort !== 'pdf' || !r.doc) return '';
  const perPagina = p.ruw.replace(/[\s\f]/g,'').length / Math.max(1, r.doc.numPages);
  if(perPagina > 120) return '';
  return `<div class="note warn" style="margin-top:12px"><b>Er staat bijna geen tekst in deze pdf.</b>
    Alleen de koppen zijn als letters opgeslagen; de rest is als afbeelding of als vormen geëxporteerd.
    Geen enkel programma kan daar gegevens uit halen. Vraag om een versie waarin de tekst tekst is
    gebleven, of vul de kaart met de hand aan — het bestand zelf kun je gewoon bewaren.</div>`;
}

function periodeTekst(w){
  const f = s => String(s||'').replace(/^(\d{4})-(\d{2})$/, '$2-$1');
  if(w.lopend) return (f(w.van) || '?') + ' – heden';
  if(w.van && w.tot) return f(w.van) + ' – ' + f(w.tot);
  return f(w.van) || f(w.tot) || w.periode || '';
}

function bindVoorstel(m){
  /* Aangevinkt of niet moet je van een afstand kunnen zien; anders moet je
     twintig vinkjes één voor één nalopen. */
  m.querySelectorAll('.cvp-rij, .cvp-item, .cvp-blok, .cvp-foto').forEach(el => {
    const b = el.querySelector('input[type=checkbox]');
    if(!b) return;
    const teken = () => el.classList.toggle('uit', !b.checked);
    b.addEventListener('change', teken); teken();
  });
}

/* ─── 16. Overnemen en bewaren ────────────────────────────────── */
async function overnemen(c, p, rijen, bestand, fotoBlob, uit, onKlaar){
  const gedaan = [];
  const cv = Object.assign({}, c.cv || {});
  const uitCv = new Set(Array.isArray(cv.uitCv) ? cv.uitCv : []);

  if(p){
    /* Losse velden. */
    uit.querySelectorAll('input[data-veld]').forEach(b => {
      if(!b.checked) return;
      const rr = rijen[+b.dataset.veld]; if(!rr) return;
      if(rr.inCv) cv[rr.sleutel] = rr.nieuw; else { c[rr.sleutel] = rr.nieuw; uitCv.add(rr.sleutel); }
      gedaan.push(rr.label.toLowerCase());
    });

    /* Werkervaring: alleen de aangevinkte regels, met de correcties die de
       AM in de velden heeft gezet. */
    const werk = [];
    uit.querySelectorAll('input[data-werk]').forEach(b => {
      if(!b.checked) return;
      const i = b.dataset.werk, br = p.werk[+i];
      const veld = s => (uit.querySelector(`[data-${s}="${i}"]`) || {}).value || '';
      werk.push({functie: veld('wf').trim(), werkgever: veld('wg').trim(),
                 periode: veld('wp').trim(), van: br.van, tot: br.tot, lopend: br.lopend,
                 /* De werkzaamheden gaan mee. Ze zijn niet te bewerken in dit
                    venster — het zijn er per baan al gauw vijf — maar ze horen
                    wél op de kaart, want dat is wat je aan een klant vertelt. */
                 taken: Array.isArray(br.taken) ? br.taken : []});
    });
    if(werk.length){
      cv.werkgevers = werk;
      const metTaken = werk.reduce((n,w) => n + (w.taken||[]).length, 0);
      gedaan.push(werk.length + ' dienstverbanden' + (metTaken ? ` (met ${metTaken} werkzaamheden)` : ''));
      /* "Huidig bedrijf" stond leeg terwijl "Huidige functie" wél gevuld werd —
         uit dezelfde regel van hetzelfde cv. Die twee horen bij elkaar: de
         bovenste baan is de meest recente (de lijst is daarop gesorteerd).
         Alleen invullen als het veld nog leeg is; wat iemand zelf heeft
         ingevuld gaat vóór wat wij uit een pdf lezen. */
      if(!String(cv.werkgever||'').trim() && werk[0].werkgever) cv.werkgever = werk[0].werkgever;
    }

    const opl = [];
    uit.querySelectorAll('input[data-opl]').forEach(b => {
      if(!b.checked) return;
      const i = b.dataset.opl, br = p.opleidingen[+i];
      const veld = s => (uit.querySelector(`[data-${s}="${i}"]`) || {}).value || '';
      /* Óók onder de sleutels die js/kandidaten.js al leest (opleiding, jaar),
         zodat het blok "CV & ervaring" dit meteen toont zonder aanpassing. */
      opl.push({school: veld('os').trim(), opleiding: veld('or').trim(),
                richting: veld('or').trim(), niveau: br.niveau,
                jaar: veld('op').trim(), periode: veld('op').trim(),
                van: br.van, tot: br.tot, afgerond: br.afgerond});
    });
    if(opl.length){ cv.opleidingen = opl; gedaan.push(opl.length + ' opleidingen'); }

    /* Certificaten worden aangevuld, niet vervangen: wat een AM zelf heeft
       vastgelegd is meestal betrouwbaarder dan wat wij uit een pdf raden. */
    const namen = Array.isArray(cv.certificaten)
      ? cv.certificaten.map(x => String((x && typeof x === 'object' ? (x.naam||x.certificaat) : x) || '')).filter(Boolean) : [];
    const geldig = Object.assign({}, (cv.certGeldig && typeof cv.certGeldig === 'object') ? cv.certGeldig : {});
    let nieuweCert = 0;
    uit.querySelectorAll('input[data-cert]').forEach(b => {
      if(!b.checked) return;
      const i = b.dataset.cert;
      const naam = ((uit.querySelector(`[data-cn="${i}"]`)||{}).value || '').trim();
      const datum = ((uit.querySelector(`[data-cd="${i}"]`)||{}).value || '').trim();
      if(!naam) return;
      if(!namen.some(x => x.toLowerCase() === naam.toLowerCase())){ namen.push(naam); nieuweCert++; }
      if(datum) geldig[naam.trim().toLowerCase()] = datum;
    });
    if(namen.length){ cv.certificaten = namen; }
    if(Object.keys(geldig).length) cv.certGeldig = geldig;
    if(nieuweCert) gedaan.push(nieuweCert + ' certificaten');

    const aan = s => { const el = uit.querySelector('[data-' + s + ']'); return el && el.checked; };
    if(aan('talen') && p.talen.length){
      cv.talen = p.talen.map(t => t.naam + (t.niveau ? ' (' + t.niveau + ')' : ''));
      if(!String(c.talen||'').trim()){ c.talen = p.talen.map(t => t.naam).join(', '); uitCv.add('talen'); }
      gedaan.push('talen');
    }
    if(aan('skills') && p.skills.length){ cv.skills = p.skills; gedaan.push('vaardigheden'); }
    if(aan('erv') && p.ervaringJaren != null){ cv.ervaringJaren = p.ervaringJaren; gedaan.push('jaren ervaring'); }
    if(p.uren) cv.uren = p.uren.waarde;
    if(p.bereid && p.bereid.length) cv.bereid = p.bereid;
  }

  /* Het bestand zelf. Dit is de helft van de vraag: zonder het document
     erbij is een geparseerde kaart een samenvatting zonder bron. */
  if(bestand){
    const bewaard = await uploadCv(c, bestand, cv);
    if(bewaard) gedaan.push('het bestand');
  }

  /* De foto is een apart persoonsgegeven met een eigen bewaartermijn en
     staat daarom in een eigen kolom, niet in het cv-blok. */
  const fotoAan = uit.querySelector('[data-foto]');
  if(fotoBlob && fotoAan && fotoAan.checked){
    const pad = await uploadFoto(c, fotoBlob);
    if(pad){ c.foto = pad; gedaan.push('de pasfoto'); }
  }

  cv.uitCv = [...uitCv];
  c.cv = cv;
  await bewaarKandidaat(c);
  await CRM.logActiviteit('kandidaat', c.id, 'doc',
    `CV ingelezen (${bestand ? bestand.name : 'geen bestand'}). ` +
    (gedaan.length ? 'Overgenomen: ' + gedaan.join(', ') + '.' : 'Niets overgenomen.') +
    (p && p.nietGevonden.length ? ' Niet gevonden: ' + p.nietGevonden.join(', ') + '.' : ''));

  CRM.modal.close();
  CRM.toast(gedaan.length ? 'CV verwerkt' : 'Niets gewijzigd', 'ok');
  if(onKlaar) onKlaar(c); else CRM.render();
}

/* Opslaan gaat via dezelfde weg als de rest van de app: eerst CRM.state,
   dan de database, en in demomodus alleen het eerste. */
async function bewaarKandidaat(c){
  const i = (CRM.state.cands || []).findIndex(r => String(r.id) === String(c.id));
  if(i >= 0) CRM.state.cands[i] = Object.assign({}, CRM.state.cands[i], CRM.candToRow(c));
  if(CRM.demo) return;
  const {error} = await CRM.sb.from('candidates').update(CRM.candToRow(c)).eq('id', c.id);
  if(error) throw error;
}

/* Een pad dat niet botst en niet te raden is: de kandidaat-id, de datum en
   een willekeurig sleuteltje. De map zelf is afgeschermd, maar een pad dat
   je uit een naam kunt afleiden is alsnog een uitnodiging. */
function cvPad(c, naam){
  const veilig = String(naam || 'cv').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^\w.-]+/g,'_').replace(/_{2,}/g,'_').slice(-60);
  const token = Math.random().toString(36).slice(2, 8);
  return `kandidaten/${String(c.id).replace(/[^\w-]/g,'')}/cv/${CRM.todayISO()}-${token}-${veilig}`;
}

async function uploadCv(c, file, cv){
  if(CRM.demo){
    CRM.toast('Demo: het bestand wordt niet geüpload');
    return false;
  }
  const pad = cvPad(c, file.name);
  const {error} = await CRM.sb.storage.from(CRM.opslag.map).upload(pad, file, {upsert:false});
  if(error){ CRM.toast(CRM.opslag.foutTekst(error), 'err'); return false; }
  /* Een bestaand cv wordt niet overschreven en niet verwijderd. Het is het
     document waarop een voorstel aan een klant gebaseerd is; dat weggooien
     omdat er een nieuwere versie binnenkomt maakt achteraf onnavolgbaar wat
     we destijds verstuurd hebben. Opruimen kan, maar dan met de hand. */
  if(cv.bestandPad){
    const eerder = Array.isArray(cv.eerder) ? cv.eerder.slice(0, 9) : [];
    eerder.unshift({pad: cv.bestandPad, bestand: cv.bestand || '', op: cv.op || '', door: cv.door || ''});
    cv.eerder = eerder;
  }
  cv.bestandPad = pad;
  cv.bestand = file.name;
  cv.grootte = file.size;
  cv.type = file.type || '';
  cv.op = new Date().toISOString();
  cv.door = CRM.me();
  CRM.opslag.wis(pad);
  return true;
}

async function uploadFoto(c, blob){
  if(CRM.demo){ CRM.toast('Demo: de foto wordt niet geüpload'); return ''; }
  const pad = `kandidaten/${String(c.id).replace(/[^\w-]/g,'')}/foto-${Math.random().toString(36).slice(2,8)}.jpg`;
  const {error} = await CRM.sb.storage.from(CRM.opslag.map).upload(pad, blob, {upsert:false, contentType:'image/jpeg'});
  if(error){ CRM.toast(CRM.opslag.foutTekst(error), 'err'); return ''; }
  CRM.opslag.wis(pad);
  return pad;
}

/* ─── 17. Op de kandidatenkaart ───────────────────────────────────
   Zelfde patroon als js/opvolging.js: de module levert het blok en de
   knoppen, de kaart hoeft alleen te weten waar het moet staan. */
function bestandHtml(c){
  const cv = c.cv || {};
  if(!cv.bestandPad) return '';
  const eerder = Array.isArray(cv.eerder) ? cv.eerder : [];
  return `<div class="cvp-doc">
    <div class="cvp-doc-r">
      <span class="cvp-doc-ic">▤</span>
      <div class="cvp-doc-t"><b>${h(cv.bestand || 'CV')}</b>
        <span class="meta num">${h([cv.op ? CRM.fmtDate(cv.op) : '', cv.door, cv.grootte ? kb(cv.grootte) : ''].filter(Boolean).join(' · '))}</span></div>
      <button type="button" class="btn ghost sm" data-cvopen="${h(cv.bestandPad)}">Openen</button>
      <button type="button" class="btn sub sm" data-cvdl="${h(cv.bestandPad)}" data-cvnaam="${h(cv.bestand||'cv.pdf')}">Bewaren</button>
    </div>
    ${eerder.length ? `<details class="cvp-doc-oud"><summary>${eerder.length} eerdere versie${eerder.length===1?'':'s'}</summary>
      ${eerder.map(e => `<div class="cvp-doc-r klein">
        <span class="cvp-doc-t"><b>${h(e.bestand||'CV')}</b>
          <span class="meta num">${h([e.op ? CRM.fmtDate(e.op) : '', e.door].filter(Boolean).join(' · '))}</span></span>
        <button type="button" class="btn sub sm" data-cvopen="${h(e.pad)}">Openen</button>
      </div>`).join('')}</details>` : ''}
  </div>`;
}

/* Links worden pas bij het klikken ondertekend en zijn kort geldig. Een
   vaste of publieke url zou hier telefoonnummers en adressen van echte
   mensen op straat leggen. CRM.opslag doet het ondertekenen. */
function bindBestand(mount){
  if(!mount) return;
  mount.querySelectorAll('[data-cvopen]').forEach(b => b.onclick = () => CRM.opslag.open(b.dataset.cvopen));
  mount.querySelectorAll('[data-cvdl]').forEach(b => b.onclick = () =>
    CRM.opslag.open(b.dataset.cvdl, {download: b.dataset.cvnaam || 'cv.pdf'}));
}

CRM.cvParse = {leesBestand, parseTekst, open, bestandHtml, bindBestand};

})();

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN COORDINATOR

   1. index.html — twee regels erbij.

      Bij de stylesheets, na css/kandidaten.css:
        <link rel="stylesheet" href="css/cvparse.css">

      Bij de scripts, ná js/data.js (gebruikt CRM.PLAATSEN, CRM.opslag en
      CRM.candToRow) en VÓÓR js/kandidaten.js en js/recruitment.js. Naast
      js/cv.js is de logische plek — dat is de generator, dit de lezer:
        <script src="js/cvparse.js"></script>

      Zonder die regels breekt er niets: beide aanroepers hieronder zijn
      defensief geschreven, er gebeurt dan alleen niets bij een klik.

   2. js/kandidaten.js — drie plekken.

      a. De knop laten wijzen naar deze module (nu regel 968-969):
           const cvKnop = mount.querySelector('#c_cvlees');
           if(cvKnop) cvKnop.onclick = () => CRM.cvParse
             ? CRM.cvParse.open({kandidaat:c, onKlaar:() => CRM.render()})
             : cvModal(c);

      b. Idem in de "ontbrekende gegevens"-knop (nu regel 1077):
           if(b.dataset.mist === '__cv') return CRM.cvParse
             ? CRM.cvParse.open({kandidaat:c, onKlaar:() => CRM.render()}) : cvModal(c);

      c. Het bestand tonen in het blok "CV & ervaring". In cvHtml(), direct
         ná `<div class="card-b">` en vóór de regel met `cv.bestand`:
           ${CRM.cvParse ? CRM.cvParse.bestandHtml(c) : ''}
         en in de bind-functie van de kaart (naast CRM.opvolging.bindKaart):
           if(CRM.cvParse) CRM.cvParse.bindBestand(mount);

         De regel `Ingelezen: ${cv.bestand}` mag dan weg — die informatie
         staat nu completer in het blok zelf, mét openknop.

      Let op: `leeg` in cvHtml() rekent het bestand nog niet mee. Graag
      `|| cv.bestandPad` toevoegen aan die voorwaarde, anders staat er bij
      een kandidaat mét cv-bestand maar zónder geparste velden nog steeds
      "Nog geen CV-gegevens".

      De oude parseCvTekst()/cvModal()/pdfTekst() in dit bestand kunnen weg
      zodra a en b omgezet zijn. Ze staan nergens anders meer.

   3. js/recruitment.js — twee plekken, zelfde patroon (nu regel 1228 en
      1388/1400). Daar gaat het om een lead en niet om een kandidaat; deze
      module verwacht een object met een `id` en de velden naam/telefoon/
      email/woonplaats/cv, en schrijft naar de tabel `candidates`. Voor een
      lead is dat niet goed. Twee opties, jouw keuze:
        - eenvoudigst: pas aanroepen zodra de lead een kandidaat is
          geworden, en de leadversie laten zoals hij is;
        - netter: ik lever een variant met een `opslaan`-haak erbij, zodat
          recruitment.js zelf bepaalt waar het naartoe schrijft. Zeg het
          maar, dat is een kleine ingreep in dit bestand.

   4. supabase/schema.sql — niets verplicht.
      De map `crm-docs` en de kolommen `candidates.cv` (jsonb) en
      `candidates.foto` (pad) bestaan al en zijn precies wat hier nodig is.

      Wél een suggestie: adres en postcode van een kandidaat komen nu in
      het cv-jsonb terecht omdat er geen kolom voor is, terwijl `clients`
      die kolommen wel heeft. Wil je erop kunnen filteren of sorteren
      (bijvoorbeeld reisafstand per straat in plaats van per plaats), dan:
        alter table candidates add column if not exists adres    text default '';
        alter table candidates add column if not exists postcode text default '';
      Zet je die erbij, laat het me weten — dan verhuizen ze in dit bestand
      van het jsonb naar de kolommen. Tot die tijd gaat er niets verloren.

   5. Los van dit alles, en de moeite waard om aan Tjeerd door te geven:
      de pdf's die uit ons eigen cv-sjabloon komen bevatten vrijwel
      geen tekstlaag — alleen de koppen zijn letters, de rest is als vorm
      geëxporteerd. Daar kan géén enkele parser iets mee, ook een betaalde
      dienst niet, en het maakt onze eigen cv's onherbruikbaar in elk
      systeem van een klant. Dat is aan de exportkant op te lossen.
   ═══════════════════════════════════════════════════════════════ */
