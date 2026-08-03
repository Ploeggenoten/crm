/* ═══════════════════════════════════════════════════════════════
   CV DOOR CLAUDE LATEN LEZEN

   Waarom dit bestaat naast js/cvparse.js.

   De snelle parser leest de tekstlaag van een pdf en gokt met regels welke
   regel een functie is, welke een werkgever, en waar de werkzaamheden
   beginnen. Dat werkt bij een cv met bolletjes en jaartallen. Het werkt niet
   bij het cv van Ricardo Zeef: dat gebruikt inspringing zonder bulletteken,
   en als periode staat er "Huidig", "± 4 jaar" en "Start: december 2016".

   Ik heb geprobeerd die twee gevallen erbij te bouwen. Gemeten resultaat:
   van vier dienstverbanden naar twee, en nul werkzaamheden — slechter dan
   ervoor. Elke reparatie voor het ene cv maakt het volgende fragieler. Dat
   is geen kwestie van beter mijn best doen; heuristisch parsen van vrije
   opmaak loopt tegen een plafond aan.

   Claude leest die indelingen wél, in één keer. Tjeerd liet dat zien met een
   cv dat hij er zelf doorheen haalde.

   DE ROUTE IS DIE VAN DE VIDEO-INTAKE (js/intake.js), en met opzet dezelfde:
     1. wij halen de tekst uit het bestand
     2. wij zetten die tekst mét een opdracht op het klembord
     3. jij plakt dat in Claude en plakt het antwoord hier terug
     4. je ziet hetzelfde controlevenster als bij de gewone parser

   Geen API-sleutel, geen kosten, geen gegevens die buiten jouw hand om
   ergens heen gaan — jij bepaalt per cv of je dit doet. Dat was de
   voorwaarde van Tjeerd bij de intake ("we kunnen die transcripties zelf
   ook in Claude gooien, dan kost het geen geld") en die geldt hier net zo.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* De opdracht. Streng op verzinnen: een cv is de bron waarop een AM een
   kandidaat aan een klant voorstelt. Een aangevulde functietitel die er
   plausibel uitziet wordt nooit meer gecorrigeerd. */
function promptMaken(tekst){
  return `Je helpt een recruiter van Ploeggenoten een cv uitlezen.
Ploeggenoten bemiddelt mensen in productie, logistiek en industrie.

Hieronder staat de volledige tekst van een cv. Zet die om in het JSON-object
dat onderaan staat.

REGELS
1. Verzin niets en leid niets af. Staat iets niet in het cv, laat het veld dan
   leeg ("") of de lijst leeg ([]). Op deze gegevens wordt een kandidaat aan
   een klant voorgesteld; een gok die er goed uitziet wordt nooit meer
   gecorrigeerd.
2. Neem ALLE dienstverbanden op, ook stages en bijbanen, en ALLE opleidingen
   en ALLE certificaten. Niets samenvatten, niets weglaten omdat het oud is.
3. Neem per dienstverband ALLE werkzaamheden over, als losse zinnen in
   "taken". Staat er een opsomming, dan is elke bullet één zin. Is een zin in
   het cv over twee regels afgebroken, plak hem dan aan elkaar. Schrijf ze
   over zoals ze er staan — niet herschrijven, niet inkorten, niet vertalen.
4. Periodes: gebruik "JJJJ-MM" als de maand er staat, anders "JJJJ". Staat er
   geen datum maar iets als "Huidig", "± 4 jaar" of "Start: december 2016",
   vul dan wat je zeker weet ("van" mag leeg blijven) en zet de letterlijke
   tekst in "periodeTekst". Verzin geen jaartal.
5. Loopt een dienstverband nog? Zet "lopend": true.
6. Certificaten: naam plus geldig tot als die er staat ("JJJJ-MM-DD" of
   "JJJJ"). VCA, VCA VOL, heftruck, reachtruck, BHV, code 95, ADR, lastechniek
   en HACCP zijn de gebruikelijke; neem ook alles op wat er verder staat.
7. Antwoord met uitsluitend het JSON-object. Geen inleiding, geen toelichting,
   geen code-blok eromheen.

VORM — precies deze sleutels:

{
  "naam": "", "telefoon": "", "email": "", "woonplaats": "",
  "geboortedatum": "", "rijbewijs": "", "vervoer": "",
  "huidigeFunctie": "", "huidigBedrijf": "",
  "talen": [], "vaardigheden": [],
  "werk": [
    {"functie": "", "werkgever": "", "van": "", "tot": "", "lopend": false,
     "periodeTekst": "", "taken": []}
  ],
  "opleidingen": [{"opleiding": "", "school": "", "van": "", "tot": "", "afgerond": null}],
  "certificaten": [{"naam": "", "geldigTot": ""}]
}

CV-TEKST
────────────────────────────────────────────────────────────
${tekst}
────────────────────────────────────────────────────────────

Geef nu het JSON-object.`;
}

/* Het antwoord terug lezen. Mensen plakken er geregeld een zin omheen of
   laten een code-blok staan; daar hoeft niemand over te struikelen. */
function leesAntwoord(ruw){
  const t = String(ruw || '').trim();
  if(!t) return {fout:'Er staat nog niets geplakt.'};
  const zonderBlok = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const eerste = zonderBlok.indexOf('{'), laatste = zonderBlok.lastIndexOf('}');
  if(eerste < 0 || laatste <= eerste)
    return {fout:'Hier staat geen JSON-object in. Kopieer het antwoord van Claude nog een keer, van de eerste { tot en met de laatste }.'};
  const blok = zonderBlok.slice(eerste, laatste + 1);
  try{ return {obj: JSON.parse(blok)}; }
  catch(e){
    /* Eén veelvoorkomende slordigheid herstellen: een komma vóór een
       sluitaccolade. Verder niets — een half kapot antwoord half repareren
       levert stille fouten op in gegevens waar je iemand op voorstelt. */
    try{ return {obj: JSON.parse(blok.replace(/,\s*([}\]])/g, '$1')), hersteld:true}; }
    catch(e2){ return {fout:'Het antwoord is geen geldige JSON. Vraag Claude om het JSON-object opnieuw te geven, zonder tekst eromheen.'}; }
  }
}

/* Naar de vorm die js/cvparse.js al kent, zodat het bestaande
   controlevenster het kan tonen. Eén weergave voor beide routes: anders zie
   je bij Claude iets anders dan bij de snelle parser, en dan weet niemand
   meer welke waarheid op de kaart komt. */
function naarParseVorm(o){
  const arr = x => Array.isArray(x) ? x : [];
  const tx  = x => String(x == null ? '' : x).trim();
  const veld = v => tx(v) ? {waarde: tx(v), zeker:'hoog'} : null;
  return {
    velden: {
      naam: veld(o.naam), telefoon: veld(o.telefoon), email: veld(o.email),
      woonplaats: veld(o.woonplaats), geboortedatum: veld(o.geboortedatum),
      rijbewijs: veld(o.rijbewijs), vervoer: veld(o.vervoer),
      functie: veld(o.huidigeFunctie), nationaliteit: null, adres: null,
      postcode: null, beschikbaar: null, ploegen: null
    },
    werk: arr(o.werk).map(w => ({
      functie: tx(w.functie), werkgever: tx(w.werkgever),
      van: tx(w.van), tot: tx(w.tot), lopend: !!w.lopend,
      periode: tx(w.periodeTekst) || [tx(w.van), tx(w.tot)].filter(Boolean).join(' – '),
      taken: arr(w.taken).map(tx).filter(Boolean),
      zeker: 'hoog'
    })).filter(w => w.functie || w.werkgever),
    opleidingen: arr(o.opleidingen).map(x => ({
      opleiding: tx(x.opleiding), richting: tx(x.opleiding), school: tx(x.school),
      niveau: '', van: tx(x.van), tot: tx(x.tot),
      periode: [tx(x.van), tx(x.tot)].filter(Boolean).join(' – '),
      afgerond: x.afgerond == null ? null : !!x.afgerond, zeker:'hoog'
    })).filter(x => x.opleiding || x.school),
    certificaten: arr(o.certificaten).map(c =>
      typeof c === 'string' ? {naam: tx(c), geldigTot: ''}
                            : {naam: tx(c.naam), geldigTot: tx(c.geldigTot)}
    ).filter(c => c.naam),
    talen: arr(o.talen).map(tx).filter(Boolean),
    skills: arr(o.vaardigheden).map(tx).filter(Boolean),
    huidigBedrijf: tx(o.huidigBedrijf),
    uren: null, bereid: [], ervaringJaren: null, nietGevonden: [], ruw: '', regels: []
  };
}

/* ─── Het venster ─────────────────────────────────────────────── */
function open({kandidaat, bestand, tekst, onKlaar}){
  let bron = tekst || '';
  const naam = bestand ? bestand.name : 'het cv';

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">CV door Claude laten lezen</div>
      <p class="sub" style="margin:6px 0 0">Voor cv's waar de snelle inlezer weinig uit haalt.
        Jij kopieert, plakt in Claude, en plakt het antwoord terug. Er gaat niets automatisch
        ergens heen.</p></div>
    <div class="modal-b" style="max-height:70vh;overflow-y:auto">
      <div class="note info" id="cc_bron">Tekst uit ${h(naam)} wordt gelezen…</div>

      <div class="label" style="margin:16px 0 6px">Stap 1 — opdracht kopiëren</div>
      <div class="row tight">
        <button class="btn" id="cc_kopieer" disabled>Opdracht kopiëren</button>
        <span class="meta" id="cc_lengte"></span>
      </div>
      <p class="hint" style="margin:6px 0 0">Plak dit in Claude en wacht op het antwoord.</p>

      <div class="label" style="margin:18px 0 6px">Stap 2 — antwoord terugplakken</div>
      <textarea id="cc_antwoord" rows="5" placeholder="Plak hier het volledige antwoord van Claude"></textarea>
      <div class="note err" id="cc_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="cc_ok">Verwerken →</button></div>`, {onOpen(m){

      const $ = s => m.querySelector(s);
      const err = t => { const e = $('#cc_err'); e.style.display = t ? '' : 'none'; e.textContent = t || ''; };

      const zetBron = () => {
        if(!bron){ $('#cc_bron').className = 'note warn';
          $('#cc_bron').textContent = 'Er kwam geen tekst uit dit bestand — waarschijnlijk een scan. Plak de cv-tekst dan zelf in Claude.';
          return; }
        $('#cc_bron').className = 'note ok';
        $('#cc_bron').textContent = `Tekst gelezen uit ${naam} — ${bron.length.toLocaleString('nl-NL')} tekens.`;
        $('#cc_kopieer').disabled = false;
        $('#cc_lengte').textContent = promptMaken(bron).length.toLocaleString('nl-NL') + ' tekens';
      };

      if(bron) zetBron();
      else if(bestand && CRM.cvParse && CRM.cvParse.leesBestand){
        CRM.cvParse.leesBestand(bestand)
          .then(r => { bron = (r && r.tekst) || ''; zetBron(); })
          .catch(() => { bron = ''; zetBron(); });
      } else zetBron();

      $('#cc_kopieer').onclick = async () => {
        const ok = await kopieer(promptMaken(bron));
        CRM.toast(ok ? 'Opdracht staat op je klembord' : 'Kopiëren lukte niet — selecteer de tekst zelf', ok ? 'ok' : 'err');
      };

      $('#cc_ok').onclick = () => {
        const r = leesAntwoord($('#cc_antwoord').value);
        if(r.fout) return err(r.fout);
        const p = naarParseVorm(r.obj);
        if(!p.werk.length && !p.certificaten.length && !p.velden.naam)
          return err('Er zit niets bruikbaars in dit antwoord — geen dienstverbanden, geen certificaten, geen naam.');
        CRM.modal.close();
        /* Vanaf hier is het één weg met de gewone parser: hetzelfde
           controlevenster, dezelfde opslag, dezelfde vinkjes per gegeven. */
        CRM.cvParse.open({kandidaat, bestand, parsed:p, onKlaar});
      };
    }});
}

async function kopieer(tekst){
  try{
    if(navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(tekst); return true; }
  }catch(e){}
  try{
    const ta = document.createElement('textarea');
    ta.value = tekst; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch(e){ return false; }
}

CRM.cvClaude = {open, promptMaken, leesAntwoord, naarParseVorm};
})();
