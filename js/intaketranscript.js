/* ═══════════════════════════════════════════════════════════════
   VIDEO-INTAKE UIT TEAMS-TRANSCRIPT — CRM.intaketranscript

   Zelfde werkwijze als js/cvclaude.js: het CRM haalt zelf het transcript
   van de Teams-call op (via de Outlook-koppeling, js/outlook.js) en zet
   er een kant-en-klare opdracht van klaar.
     1. wij halen het transcript op bij Microsoft Graph
     2. wij zetten de tekst mét een opdracht op het klembord
     3. jij plakt dat in Claude en plakt het antwoord hier terug
     4. de antwoorden komen als VOORSTEL in het intakeformulier — pas
        "Intake opslaan" schrijft ze echt weg, dus je controleert en
        corrigeert eerst

   Geen API-sleutel, geen kosten die per intake oplopen. Zelfde afspraak
   als bij de cv-lezer en de vroegere video-intake (Tjeerd, over de oude
   versie: "we kunnen die transcripties zelf ook in Claude gooien, dan
   kost het geen geld").

   Wat dit WEL doet: de open vragen en keuzes uit het intakeformulier
   (Persoonlijk, Functie & werkzaamheden, Salaris & voorwaarden,
   Samenvatting/conclusie) uit het transcript halen.
   Wat dit NIET doet: de feitenvelden bovenaan het formulier (gezochte
   functie, beschikbaarheid, vervoer, huidige functie/bedrijf, salaris)
   blijven voor rekening van de AM — die staan meestal al op de kaart
   vanuit het cv en worden in het gesprek alleen geverifieerd, niet voor
   het eerst gevraagd.

   Vereist: een Teams-call ingepland via de videocall-knop op de
   kandidatenkaart (js/kandidaten.js, videocallModal) — die bewaart het
   meeting-ID in c.intake.teamsCallId, waarmee dit hulpmiddel het
   transcript terugvindt.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;
const t = v => String(v == null ? '' : v).trim();

const DAGEN = ['ma','di','wo','do','vr'];
const KEUZES = {
  roosterfit: ['ja','nee'],
  certificatenCheck: ['ja','deels','nee'],
  functieKennis: ['ja','nee'],
  concurrerendeTrajecten: ['nee','oriënterend','gesprek gehad','aanbod ligt er'],
  voorstellen: ['voorstellen','twijfel','niet voorstellen'],
  contactAppen: ['ja','nee']
};

/* De opdracht. Zelfde streng-op-verzinnen-principe als cvclaude.js: op
   een intake wordt een voorstel aan een klant gebouwd, dus een plausibel
   klinkend verzonnen antwoord is erger dan een leeg veld. */
function promptMaken(transcript){
  const lbl = (CRM._rcDeel && CRM._rcDeel.INTAKE_LBL) || {};
  const veldenlijst = Object.keys(lbl).map(k => `- "${k}": ${lbl[k]}`).join('\n');
  return `Je helpt een recruiter (Account Manager) van Ploeggenoten een intakegesprek verwerken.
Ploeggenoten bemiddelt mensen in productie, logistiek en industrie.

Hieronder staat het transcript van een videocall-intake tussen de AM en een
kandidaat. Zet de antwoorden om in het JSON-object dat onderaan staat.

REGELS
1. Verzin niets en leid niets af wat niet gezegd is. Staat iets niet in het
   transcript, laat het veld dan leeg ("") of null. Op deze gegevens wordt
   een kandidaat aan een klant voorgesteld; een gok die er goed uitziet
   wordt nooit meer gecorrigeerd.
2. Schrijf antwoorden zoveel mogelijk in de eigen woorden van de kandidaat
   over — niet herschrijven tot keurig CRM-Nederlands en niet inkorten tot
   een cliché.
3. Velden die eindigen op "Txt" zijn een korte toelichting bij het antwoord
   ervoor — alleen invullen als de kandidaat dat ook echt toelichtte.
4. Voor de schaalvragen (eigenaarschap, loonZekerheid, tegenbodrisico) geef
   een geheel getal 1 t/m 5 ALLEEN als de kandidaat zelf een cijfer noemde
   of overduidelijk aangaf; anders null.
5. Voor keuzelijsten (roosterfit, certificatenCheck, functieKennis,
   concurrerendeTrajecten, voorstellen, contactAppen) kies precies één van
   de gegeven opties hieronder, of "" als het niet aan bod kwam.
6. "beschikbaarheidGesprek" is een lijst met de genoemde dagen, uit:
   ["ma","di","wo","do","vr"].
7. "beslisdatum": alleen invullen als een concrete datum genoemd is, in de
   vorm "JJJJ-MM-DD". Anders leeg.
8. Antwoord met uitsluitend het JSON-object. Geen inleiding, geen
   toelichting, geen codeblok eromheen.

VELDEN EN WAT ZE BETEKENEN
${veldenlijst}

KEUZEOPTIES PER VELD
- roosterfit: "ja" / "nee"
- certificatenCheck: "ja" / "deels" / "nee"
- functieKennis: "ja" / "nee"
- concurrerendeTrajecten: "nee" / "oriënterend" / "gesprek gehad" / "aanbod ligt er"
- voorstellen: "voorstellen" / "twijfel" / "niet voorstellen"
- contactAppen: "ja" / "nee"

VORM — precies deze sleutels:
{
  "roosterfit": "", "roosterfitTxt": "",
  "certificatenCheck": "", "certificatenTxt": "",
  "persoonlijkBeeld": "",
  "why1": "", "why2": "", "zoekvraag": "",
  "werkgeschiedenis1": "", "werkgeschiedenis2": "",
  "functieKennis": "", "functieKennisTxt": "",
  "eigenaarschap": null, "eigenaarschapTxt": "",
  "behoudsvoorwaarde": "",
  "loonZekerheid": null,
  "concurrerendeTrajecten": "",
  "tegenbodrisico": null, "tegenbodrisicoTxt": "",
  "beslisdatum": "", "beslisBetrokkenen": "",
  "voorstellen": "", "voorstellenTxt": "",
  "beschikbaarheidGesprek": [], "beschikbaarheidGesprekTxt": "",
  "verwachtingKandidaat": "", "contactAppen": ""
}

TRANSCRIPT
────────────────────────────────────────────────────────────
${transcript}
────────────────────────────────────────────────────────────

Geef nu het JSON-object.`;
}

/* Het antwoord terug lezen — zelfde tolerantie als cvclaude.js: mensen
   plakken er geregeld een zin omheen of laten een codeblok staan. */
function leesAntwoord(ruw){
  const s = t(ruw);
  if(!s) return {fout:'Er staat nog niets geplakt.'};
  const zonderBlok = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const eerste = zonderBlok.indexOf('{'), laatste = zonderBlok.lastIndexOf('}');
  if(eerste < 0 || laatste <= eerste)
    return {fout:'Hier staat geen JSON-object in. Kopieer het antwoord van Claude nog een keer, van de eerste { tot en met de laatste }.'};
  const blok = zonderBlok.slice(eerste, laatste + 1);
  try{ return {obj: JSON.parse(blok)}; }
  catch(e){
    try{ return {obj: JSON.parse(blok.replace(/,\s*([}\]])/g, '$1')), hersteld:true}; }
    catch(e2){ return {fout:'Het antwoord is geen geldige JSON. Vraag Claude om het JSON-object opnieuw te geven, zonder tekst eromheen.'}; }
  }
}

/* Ruw JSON-antwoord naar een veilig voorstel: onbekende of onmogelijke
   waarden (een verzonnen keuzeoptie, een schaalcijfer van 8) vallen terug
   op leeg/null in plaats van dat ze het formulier in een rare stand
   zetten. */
function naarVoorstel(o){
  const keuze = (v, k) => KEUZES[k].includes(t(v)) ? t(v) : '';
  const schaal = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
  return {
    roosterfit: keuze(o.roosterfit, 'roosterfit'), roosterfitTxt: t(o.roosterfitTxt),
    certificatenCheck: keuze(o.certificatenCheck, 'certificatenCheck'), certificatenTxt: t(o.certificatenTxt),
    persoonlijkBeeld: t(o.persoonlijkBeeld),
    why1: t(o.why1), why2: t(o.why2), zoekvraag: t(o.zoekvraag),
    werkgeschiedenis1: t(o.werkgeschiedenis1), werkgeschiedenis2: t(o.werkgeschiedenis2),
    functieKennis: keuze(o.functieKennis, 'functieKennis'), functieKennisTxt: t(o.functieKennisTxt),
    eigenaarschap: schaal(o.eigenaarschap), eigenaarschapTxt: t(o.eigenaarschapTxt),
    behoudsvoorwaarde: t(o.behoudsvoorwaarde),
    loonZekerheid: schaal(o.loonZekerheid),
    concurrerendeTrajecten: keuze(o.concurrerendeTrajecten, 'concurrerendeTrajecten'),
    tegenbodrisico: schaal(o.tegenbodrisico), tegenbodrisicoTxt: t(o.tegenbodrisicoTxt),
    beslisdatum: /^\d{4}-\d{2}-\d{2}$/.test(t(o.beslisdatum)) ? t(o.beslisdatum) : '',
    beslisBetrokkenen: t(o.beslisBetrokkenen),
    voorstellen: keuze(o.voorstellen, 'voorstellen'), voorstellenTxt: t(o.voorstellenTxt),
    beschikbaarheidGesprek: (Array.isArray(o.beschikbaarheidGesprek) ? o.beschikbaarheidGesprek : []).map(t).filter(d => DAGEN.includes(d)),
    beschikbaarheidGesprekTxt: t(o.beschikbaarheidGesprekTxt),
    verwachtingKandidaat: t(o.verwachtingKandidaat), contactAppen: keuze(o.contactAppen, 'contactAppen')
  };
}
const heeftInhoud = v => Object.entries(v).some(([k, w]) =>
  Array.isArray(w) ? w.length : (w != null && w !== ''));

/* ─── Het venster ─────────────────────────────────────────────── */
function open({kandidaat, onKlaar}){
  const c = kandidaat;
  let transcript = '';

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Video-intake uit Teams-transcript</div>
      <p class="sub" style="margin:6px 0 0">${h(t(c.naam) || 'Deze kandidaat')} — het CRM haalt het
        transcript van de Teams-call op. Jij kopieert de opdracht, plakt in Claude, en plakt het
        antwoord terug. Er gaat niets automatisch ergens heen.</p></div>
    <div class="modal-b" style="max-height:70vh;overflow-y:auto">
      <div class="note info" id="it_bron">Transcript ophalen…</div>

      <div class="label" style="margin:16px 0 6px">Stap 1 — opdracht kopiëren</div>
      <div class="row tight">
        <button class="btn" id="it_kopieer" disabled>Opdracht kopiëren</button>
        <span class="meta" id="it_lengte"></span>
      </div>
      <p class="hint" style="margin:6px 0 0">Plak dit in Claude en wacht op het antwoord.</p>

      <div class="label" style="margin:18px 0 6px">Stap 2 — antwoord terugplakken</div>
      <textarea id="it_antwoord" rows="5" placeholder="Plak hier het volledige antwoord van Claude"></textarea>
      <div class="note err" id="it_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="it_ok">Verwerken →</button></div>`, {onOpen(m){

      const $ = s => m.querySelector(s);
      const err = txt => { const e = $('#it_err'); e.style.display = txt ? '' : 'none'; e.textContent = txt || ''; };

      const zetBron = (soort, tekst) => {
        const el = $('#it_bron');
        el.className = 'note ' + soort;
        el.textContent = tekst;
        const klaar = soort === 'ok';
        $('#it_kopieer').disabled = !klaar;
        $('#it_lengte').textContent = klaar ? promptMaken(transcript).length.toLocaleString('nl-NL') + ' tekens' : '';
      };

      (async () => {
        if(!(CRM.outlook && CRM.outlook.haalTranscript)){
          zetBron('warn', 'De Outlook-koppeling is niet geladen — herlaad de pagina.'); return;
        }
        const meetingId = (c.intake && c.intake.teamsCallId) || '';
        if(!meetingId){
          zetBron('warn', 'Van deze kandidaat is geen Teams-call bekend. Plan eerst een videocall met "Teams-videocall aanmaken" aangevinkt.');
          return;
        }
        const r = await CRM.outlook.haalTranscript(meetingId);
        if(r.fout){ zetBron('warn', r.fout); return; }
        transcript = r.tekst;
        zetBron('ok', `Transcript opgehaald${r.gemaakt ? ' — ' + CRM.fmtDate(r.gemaakt) : ''} — ${transcript.length.toLocaleString('nl-NL')} tekens.`);
      })();

      $('#it_kopieer').onclick = async () => {
        const ok = await kopieer(promptMaken(transcript));
        CRM.toast(ok ? 'Opdracht staat op je klembord' : 'Kopiëren lukte niet — selecteer de tekst zelf', ok ? 'ok' : 'err');
      };

      $('#it_ok').onclick = () => {
        const r = leesAntwoord($('#it_antwoord').value);
        if(r.fout) return err(r.fout);
        const voorstel = naarVoorstel(r.obj);
        if(!heeftInhoud(voorstel))
          return err('Er zit niets bruikbaars in dit antwoord — geen van de velden kon worden ingevuld.');
        CRM.modal.close();
        onKlaar(voorstel);
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

CRM.intaketranscript = {open, promptMaken, leesAntwoord, naarVoorstel};
})();
