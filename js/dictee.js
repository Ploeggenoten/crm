/* ═══════════════════════════════════════════════════════════════
   MODULE: DICTEE — spraak-naar-tekst bij notitievelden.
   Geen eigen scherm, zoals js/fee.js en js/opvolging.js: andere modules
   hangen dit aan hun eigen tekstvelden. Gebruikt de gratis, ingebouwde
   spraakherkenning van de browser zelf (Web Speech API) — geen API-sleutel,
   geen kosten, geen eigen server. Werkt in Chrome/Edge; in browsers zonder
   ondersteuning (Firefox, Safari) verschijnt er simpelweg geen knop.
   (Tjeerd, 17 aug 2026: "ik ben teveel tijd kwijt aan het typen van
   notities.")

   Let op: de browser stuurt het gesproken geluid naar de spraakherkenning
   van Google om het om te zetten naar tekst — geen apart account nodig,
   gebeurt automatisch, maar goed om te weten bij notities met
   persoonsgegevens van sollicitanten.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

/* Eén microfoonknop naast een tekstveld (input of textarea). Klik: start
   opnemen, gesproken tekst verschijnt live in het veld, achter wat er al
   stond. Nogmaals klikken (of de browser stopt vanzelf na een stilte)
   stopt weer. Geeft `null` terug als deze browser het niet ondersteunt —
   de aanroeper hangt 'm dan simpelweg niet op. */
CRM.dictee = {
  ondersteund: !!SR,
  knop(veld){
    if(!SR || !veld) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dictee-knop';
    btn.title = 'Inspreken';
    btn.setAttribute('aria-label', 'Inspreken');
    btn.textContent = '🎤';

    let recognition = null, basis = '';
    const zetUit = () => { btn.classList.remove('aan'); recognition = null; };
    const stop = () => { if(recognition){ const r = recognition; recognition = null; r.stop(); } zetUit(); };

    btn.onclick = () => {
      if(recognition){ stop(); return; }
      /* Aan het eind van wat er al staat verder typen, niet overschrijven —
         iemand kan eerst iets getypt hebben en dan pas gaan inspreken. */
      basis = veld.value && !/\s$/.test(veld.value) ? veld.value + ' ' : veld.value;
      recognition = new SR();
      recognition.lang = 'nl-NL';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = e => {
        let definitief = '', tussentijds = '';
        for(let i = 0; i < e.results.length; i++){
          const stuk = e.results[i][0].transcript;
          if(e.results[i].isFinal) definitief += stuk + ' ';
          else tussentijds += stuk;
        }
        veld.value = basis + definitief + tussentijds;
        veld.dispatchEvent(new Event('input', {bubbles:true}));
      };
      recognition.onerror = e => {
        stop();
        /* 'no-speech' en 'aborted' zijn geen echte fouten — dat is gewoon
           stilte, of de gebruiker die zelf stopte. Alleen de rest melden. */
        if(e.error !== 'no-speech' && e.error !== 'aborted'){
          CRM.toast(e.error === 'not-allowed'
            ? 'Geen toegang tot de microfoon — sta dat toe in de browser'
            : 'Inspreken lukte niet, probeer het nog eens', 'err');
        }
      };
      recognition.onend = zetUit;
      try{ recognition.start(); btn.classList.add('aan'); }
      catch(e){ zetUit(); }
    };
    return btn;
  },

  /* Gemakslijntje: knop meteen naast het veld in de DOM zetten. Werkt met
     zowel een <textarea> los in een rij als een veld met een label ervoor —
     de knop komt na het veld, in dezelfde ouder. */
  hang(veld){
    const btn = this.knop(veld);
    if(btn && veld.parentNode) veld.insertAdjacentElement('afterend', btn);
    return btn;
  }
};
})();
