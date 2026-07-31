/* ═══════════════════════════════════════════════════════════════
   PLOEGGENOTEN CRM — AFGESLOTEN TRAJECTEN  (CRM.traject)

   Geen menu-item. Een bibliotheek, net als js/opvolging.js en
   js/kandverwijder.js.

   ─── HET PROBLEEM ───────────────────────────────────────────────
   Een kandidaat heeft één veld `klant` en één veld `vacature_id`.
   Stel je dezelfde persoon bij een tweede klant voor, dan wordt de
   eerste overschreven:

     voor: {klant:'Starcuisine', fase:'Intake'}
     na:   {klant:'Whisk Food',  fase:'Voorgesteld'}

   Starcuisine raakt een kandidaat kwijt, hun vacature telt van 13 naar
   12, en niemand krijgt bericht. In dit vak stel je dezelfde persoon
   routineus bij twee of drie klanten voor, dus dit gebeurt vaak.

   Het datamodel omgooien (een aparte trajecten-tabel als bron van
   waarheid) is drie tot vier weken en raakt élk scherm. Dit bestand is
   de tussenstap: het stopt niet het overschrijven, het stopt dat het
   STIL gebeurt. Drie dingen, meer niet.

     1. de poort   — vóór het overschrijven: wat gaat er weg?
     2. de reden   — verplicht, als knoppen, vier stuks
     3. het spoor  — een regel in crm_trajecten, alleen toevoegen

   ─── HET ONTWERPRISICO ──────────────────────────────────────────
   Dit is geen technisch risico. Komt deze melding te vaak of bevat hij
   te veel woorden, dan drukt binnen een week iedereen op de knop zonder
   te lezen. Dan heb je een dialoogvenster in plaats van een oplossing.
   Vier keuzes daartegen, en ze zijn belangrijker dan de rest van dit
   bestand:

     a. HIJ KOMT ZELDEN. Geen klant → niets. Dezelfde klant → niets.
        Al afgevallen of gestopt → niets. Geen fase → niets. Wat
        overblijft is precies de situatie waarin iemand iets kwijtraakt.
     b. ER STAAT ALLEEN IN WAT VERDWIJNT. Naam, klant, functie, fase,
        sinds. Geen uitleg over waarom dit venster bestaat, geen beleid,
        geen tweede alinea. Wie het venster kent, leest vier woorden en
        weet genoeg; wie het niet kent, leest twee zinnen.
     c. ER IS GEEN 'DOORGAAN'-KNOP. De knop noemt de klant die je
        kwijtraakt: "Traject bij Starcuisine afsluiten". Een blinde klik
        op die knop leest verkeerd zodra het de verkeerde klant is —
        een knop met 'Doorgaan' leest altijd goed.
     d. DE KNOP IS UIT TOTDAT ER EEN REDEN STAAT. De reden is dus geen
        extra stap vóór de handeling; het IS de handeling. Er is geen
        route door dit venster waarbij je niets hoeft te lezen.

   ─── DE VIER REDENEN ────────────────────────────────────────────
   Vier knoppen, geen vrij tekstveld, en bewust geen vijfde met
   'Anders'. Een catch-all wordt binnen een week de standaardklik — dat
   is exact de fout die we hier proberen te vermijden — en vrije tekst
   valt niet te tellen. Het getal is straks het bewijs of de volledige
   oplossing nodig is; dan moet het te tellen zijn.

   De vier splitsen op WIE het besloot, dezelfde as waarop de app uitval
   al registreert (stop_door: kandidaat | klant | anders in js/data.js).
   Het team denkt dus al in deze verdeling:

     klant_anders  — de klant koos iemand anders
     kandidaat_af  — de kandidaat wilde niet verder
     vacature_weg  — de vacature verviel (niemand besloot iets)
     betere_kans   — wij verplaatsen de kandidaat naar een betere kans

   Die vierde is de belangrijkste. Zonder hem is er geen eerlijke keuze
   voor het meest voorkomende geval — er ging niets mis, wij zetten
   iemand ergens anders neer — en wordt 'klant koos iemand anders' de
   verzamelbak. Dan staat er straks een afwijzing in het dossier van een
   klant die nooit iets heeft afgewezen, en is het getal waardeloos.

   ─── WAT DIT BESTAND NIET DOET ──────────────────────────────────
   GEEN CIJFERS. Een afgesloten traject is géén uitval. Er wordt hier
   niets geschreven naar fase, afval_type, afval_categorie, stop_door,
   stop_categorie, geplaatst_op of gestopt_op. CRM.plaatsingenMaand, de
   conversietrechter, de uitvalcijfers en de nazorg lezen crm_trajecten
   niet en veranderen dus geen komma. Dat is bewust: de conversiecijfers
   gaan pas op de schop als het datamodel omgaat.

   GEEN GELD. Er staat nergens een bedrag in dit bestand, dus er zit
   niets achter CRM.canSeeMoney() of CRM.magOpbrengstZien().

   GEEN NAAM IN DE DATABASE. crm_trajecten bewaart `kandidaat_id`, geen
   naam. De naam op het scherm komt van de kaart zelf. Zo hoeft
   js/kandverwijder.js niets extra's op te ruimen: wie geanonimiseerd of
   verwijderd wordt, verdwijnt hier vanzelf mee. Wat overblijft is
   "een kandidaat" — genoeg om het aantal te laten kloppen.

   ─── DE INGANG VOOR DE COÖRDINATOR ──────────────────────────────
     const poort = CRM.traject.controleer(c, {klant, vacatureId, functie});
     if(poort && !(await poort).ok) return;

   Of, in één regel:
     if(!await CRM.traject.poort(c, {klant, vacatureId, functie})) return;

   `controleer` geeft null terug als er niets te verliezen valt — dan
   loopt de route gewoon door zonder dat er iets op het scherm komt.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;
const T = CRM.traject = {};

/* ═══════════════════════════════════════════════════════════════
   1. DE VIER REDENEN
   `lbl`  staat op de knop in het venster (wat de AM kiest).
   `kort` staat op de klantkaart en de vacaturepagina (wat de klant
          leest). Die twee zijn niet hetzelfde: "Betere kans voor de
          kandidaat" is ons woord, de klant leest "kandidaat koos een
          andere opdracht" — hetzelfde feit, zonder ons oordeel erin.
   ═══════════════════════════════════════════════════════════════ */
T.REDENEN = [
  {k:'klant_anders', lbl:'Klant koos iemand anders',      kort:'klant koos iemand anders'},
  {k:'kandidaat_af', lbl:'Kandidaat wilde niet verder',   kort:'kandidaat wilde niet verder'},
  {k:'vacature_weg', lbl:'Vacature vervallen',            kort:'de vacature verviel'},
  {k:'betere_kans',  lbl:'Betere kans voor de kandidaat', kort:'kandidaat koos een andere opdracht'}
];
const reden = k => T.REDENEN.find(r => r.k === k) || null;
const redenKort = k => { const r = reden(k); return r ? r.kort : 'reden niet vastgelegd'; };

/* ═══════════════════════════════════════════════════════════════
   2. WAT LOOPT ER NU?
   Kandidaat kan als ruwe rij (CRM.state.cands) of als gemapte kaart
   (CRM.kandidaat) binnenkomen. Zelfde truc als js/kandverwijder.js: een
   gemapte kaart heeft altijd de sleutel `geplaatstOp`, een ruwe rij nooit.
   ═══════════════════════════════════════════════════════════════ */
function norm(c){
  if(!c) return null;
  return c.geplaatstOp !== undefined ? c : CRM.rowToCand(c);
}

const isUitval = c => CRM.faseIs(c.fase, 'Afgevallen') || CRM.faseIs(c.fase, 'Gestopt');
/* Geplaatst = getekend of gestart, en nog niet gestopt. Dat is geen lopend
   traject maar een plaatsing; zie blok 4. */
const isPlaatsing = c => CRM.faseIn(c.fase, CRM.PLACED) && !c.gestoptOp;

/* Hoogst bereikte fase: het verste punt op het bord, uit de historie én
   de huidige fase. Iemand die van Offer terugviel naar In de wacht is
   tot Offer gekomen, en dat is wat de klant en wij willen weten.
   'Intake' staat niet op het bord (faseIdx -1); is er nooit een bordfase
   geweest, dan is de huidige fase het antwoord. */
function hoogsteFase(c){
  let best = -1, naam = '';
  const kijk = f => {
    const i = CRM.faseIdx(f);
    /* Afgevallen en Gestopt staan wel in PHASES maar zijn geen hoogte. */
    if(i < 0 || CRM.faseIn(f, ['Afgevallen','Gestopt'])) return;
    if(i > best){ best = i; naam = CRM.faseNorm(f); }
  };
  (Array.isArray(c.historie) ? c.historie : []).forEach(x => x && kijk(x.fase));
  kijk(c.fase);
  return naam || CRM.faseNorm(c.fase) || '';
}

/* Wanneer begon dit traject bij deze klant? De eerste historieregel is
   het beste antwoord dat we hebben; staat die er niet, dan `since`.
   Het datamodel legt geen begindatum per klant vast — daarom is dit een
   benadering, en daarom staat het niet als harde datum in het venster. */
function beginOp(c){
  const hist = (Array.isArray(c.historie) ? c.historie : [])
    .map(x => x && x.op).filter(Boolean).sort();
  return hist[0] || c.since || '';
}

/* Het lopende traject van deze kandidaat, of null.
   Vier keer null, en elke keer om dezelfde reden: er valt niets te
   verliezen, dus er hoort geen venster te komen. Zie punt (a) bovenaan. */
function lopend(kand){
  const c = norm(kand);
  if(!c) return null;
  if(!c.klant) return null;                 // nog bij niemand voorgesteld
  if(isUitval(c)) return null;              // al afgesloten
  /* Fase leeg: de import uit het oude ATS en golden candidates. Er staat
     wel een klantnaam, maar er loopt geen procedure — niemand wacht op
     een terugkoppeling en de vacaturetelling raakt niets kwijt. */
  if(!CRM.faseNorm(c.fase)) return null;

  const vac = c.vacatureId
    ? (CRM.state.vacs || []).find(v => String(v.id) === String(c.vacatureId)) || null
    : null;
  return {
    kandidaatId: String(c.id),
    naam: c.naam || '',
    klant: c.klant,
    klantBestaat: !!CRM.klant(c.klant),
    vacatureId: c.vacatureId || '',
    vacBestaat: !c.vacatureId || !!vac,
    functie: (vac && vac.functie) || c.functie || '',
    fase: CRM.faseNorm(c.fase),
    hoogste: hoogsteFase(c),
    sinds: c.since || '',
    begin: beginOp(c),
    plaatsing: isPlaatsing(c)
  };
}
T.lopend = lopend;

/* ═══════════════════════════════════════════════════════════════
   3. DE OPSLAG — crm_trajecten
   Alleen toevoegen, nooit overschrijven. Geen update, geen delete;
   de database doet hetzelfde (zie de SQL onderaan).

   De tabel wordt hier geladen en niet in js/core.js, zodat dit bestand
   los toegevoegd kan worden. Zie het verzoek onderaan.
   ═══════════════════════════════════════════════════════════════ */
let _rijen = [];
let _geladen = false, _bezig = null, _naGeladen = false;

function tabelMist(err){
  return /does not exist|schema cache|relation .* does not exist|could not find the table/i
    .test(String(err && (err.message || err.hint) || ''));
}

/* Eén regel demo-data, alleen in demo-modus. Dan is het zichtbare deel
   (klantkaart, vacaturepagina, dashboard) ook zonder database te zien.
   In demo wordt er nooit naar de database geschreven of gelezen. */
function demoRijen(){
  const c = CRM.kandidaten().find(k => k.klant && CRM.faseNorm(k.fase) && !isUitval(k));
  if(!c) return [];
  const d = new Date(); d.setDate(d.getDate() - 3);
  const iso = d.toLocaleDateString('sv-SE');
  return [{
    id:'demo_traj_1', kandidaat_id:String(c.id), klant:c.klant, vacature_id:c.vacatureId || '',
    functie:c.functie || '', fase:CRM.faseNorm(c.fase), hoogste_fase:CRM.faseNorm(c.fase),
    begin_op:c.since || iso, eind_op:iso, reden:'betere_kans',
    naar_klant:'', naar_vacature:'', naar_functie:'', door:CRM.me(), op:d.toISOString()
  }];
}

T.laad = async function(){
  if(_geladen) return _rijen;
  if(_bezig) return _bezig;
  _bezig = (async () => {
    if(CRM.demo){
      /* Niet vastzetten zolang de kandidaten er nog niet zijn — anders
         blijft de demo leeg omdat we één tick te vroeg waren. */
      const klaar = !!(CRM.state && CRM.state._loaded);
      _rijen = klaar ? demoRijen().concat(_rijen) : _rijen;
      _geladen = klaar; _bezig = null; return _rijen;
    }
    try{
      const {data, error} = await CRM.sb.from('crm_trajecten').select('*').order('op', {ascending:false}).limit(1000);
      if(error){
        if(tabelMist(error)) console.warn('[traject] De tabel crm_trajecten bestaat nog niet. ' +
          'De bevestiging werkt gewoon, maar afgesloten trajecten worden niet bewaard. ' +
          'Draai supabase/nog-te-draaien.sql.');
        else console.warn('[traject] crm_trajecten laden mislukt', error);
      } else {
        /* Wat deze sessie al geschreven is staat er al in; niet dubbel. */
        const bekend = new Set(_rijen.map(r => String(r.id)));
        _rijen = (data || []).filter(r => !bekend.has(String(r.id))).concat(_rijen);
      }
    }catch(e){ console.warn('[traject] crm_trajecten laden mislukt', e); }
    _geladen = true; _bezig = null;
    /* Precies één hertekening als de gegevens ná de eerste render binnen
       zijn. Met een vlag, anders tekent elke blokHtml-aanroep opnieuw. */
    if(!_naGeladen && _rijen.length){ _naGeladen = true; if(CRM.render) CRM.render(); }
    return _rijen;
  })();
  return _bezig;
};

/* Lezen is synchroon (blokHtml wordt in een render-pass aangeroepen).
   Is er nog niets geladen, dan start dat hier op de achtergrond en geeft
   deze ronde een lege lijst — het blok verschijnt dan één render later. */
function rijen(){
  if(!_geladen && !_bezig) T.laad();
  return _rijen;
}
T.lijst = () => rijen().slice();

async function schrijf(rij){
  _rijen.unshift(rij);                       // scherm klopt meteen
  if(CRM.demo) return true;                  // demo: nooit naar de database
  try{
    const {error} = await CRM.sb.from('crm_trajecten').insert(rij);
    if(error){
      if(tabelMist(error)){
        console.warn('[traject] De tabel crm_trajecten bestaat nog niet — het afgesloten ' +
          'traject van ' + rij.klant + ' is alleen in dit scherm zichtbaar. ' +
          'Draai supabase/nog-te-draaien.sql.');
      } else {
        console.warn('[traject] Afgesloten traject niet opgeslagen', error);
        /* Een ontbrekende tabel is een installatiekwestie en geen storing
           voor de gebruiker. Een échte schrijffout is dat wel: dan is de
           klant het traject alsnog stil kwijt, en dat hoort iemand te
           zien. Eén rustige melding, geen blokkade. */
        CRM.toast('Het afgesloten traject kon niet worden vastgelegd','err');
      }
      return false;
    }
  }catch(e){
    console.warn('[traject] Afgesloten traject niet opgeslagen', e);
    return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   4. DE POORT
   ═══════════════════════════════════════════════════════════════ */

/* Twee keer snel achter elkaar. Dubbelklik op "Voorstellen", of twee
   routes die allebei door de poort gaan bij één handeling: dan hoort er
   één venster te komen en één regel te ontstaan, niet twee.
   Sleutel: kandidaat + klant die verdwijnt. Zolang het venster openstaat
   krijgt de tweede aanroep dezelfde belofte terug. */
const _open = new Map();
/* En daarna nog even: een tweede aanroep binnen tien seconden voor exact
   dezelfde overgang is een dubbele afvuring, geen tweede besluit. */
const _net = new Map();
const NET_MS = 10000;

function sleutel(lp, doel){
  return [lp.kandidaatId, CRM.normKlant(lp.klant), CRM.normKlant(doel && doel.klant)].join('::');
}

/* De hoofdingang.
     null                      → er valt niets te verliezen, ga door
     Promise<{ok, reden, ...}> → het venster; ok:false = annuleren
   `doel` = {klant, vacatureId, functie} — waar de kandidaat naartoe gaat. */
T.controleer = function(kand, doel){
  const lp = lopend(kand);
  if(!lp) return null;
  doel = doel || {};
  /* Dezelfde klant, eventueel een andere vacature: de klant raakt de
     kandidaat niet kwijt. Geen venster. Zie punt (a) bovenaan — een
     melding die ook afgaat als er niets misgaat, gaat straks nergens
     meer over. (De vacaturetelling binnen die klant schuift wel op;
     dat is een gat dat pas met het nieuwe datamodel dichtgaat.) */
  if(doel.klant && CRM.zelfdeKlant(lp.klant, doel.klant)) return null;
  /* Geen doelklant (bijvoorbeeld: kandidaat wordt losgekoppeld zonder
     nieuwe klant) is wél verlies — dan gaat het venster gewoon open. */

  const s = sleutel(lp, doel);
  if(_open.has(s)) return _open.get(s);
  const eerder = _net.get(s);
  if(eerder && Date.now() - eerder.op < NET_MS) return Promise.resolve(eerder.besluit);

  const p = venster(lp, doel).then(besluit => {
    _open.delete(s);
    if(besluit.ok) _net.set(s, {op:Date.now(), besluit});
    return besluit;
  }, err => { _open.delete(s); throw err; });
  _open.set(s, p);
  return p;
};

/* Eén regel voor de aanroeper. `true` = doorgaan. */
T.poort = async function(kand, doel){
  const p = T.controleer(kand, doel);
  if(!p) return true;
  const besluit = await p;
  return !!besluit.ok;
};

/* ═══════════════════════════════════════════════════════════════
   5. HET VENSTER
   ═══════════════════════════════════════════════════════════════ */

/* De ene zin die het hele venster draagt. Alleen wat verdwijnt.
   Geen "hij" of "hem": we weten het geslacht niet en het staat nergens
   vastgelegd. Daarom draait de zin om de naam en niet om een persoon. */
function zin(lp){
  const naam = lp.naam || 'Deze kandidaat';
  const waar = lp.functie ? ' op ' + lp.functie : '';
  const werkt = lp.plaatsing ? ' werkt nu bij ' : ' loopt nu bij ';
  return naam + werkt + lp.klant + waar + ', fase ' + (lp.fase || '—') + '.';
}

/* Alles wat niet in die ene zin past en tóch klopt om te weten.
   Hooguit één regel, en alleen als er iets aan de hand is. */
function voetnoot(lp){
  const uit = [];
  if(!lp.klantBestaat) uit.push('die klant staat niet meer in het systeem');
  if(!lp.vacBestaat)   uit.push('die vacature bestaat niet meer');
  if(lp.hoogste && lp.hoogste !== lp.fase) uit.push('verst gekomen: ' + lp.hoogste);
  if(lp.sinds) uit.push('sinds ' + CRM.fmtDate(lp.sinds));
  return uit.join(' · ');
}

/* ─── Een plaatsing is geen lopend traject ───────────────────────
   Wie getekend heeft of gestart is, is geplaatst. Die kaart hangt aan een
   factuur, een fee, een garantietermijn en de nazorg. Verplaats je die
   naar een andere klant, dan verdwijnt de plaatsing uit Finance en uit
   de maandcijfers zonder dat er iets gestopt is — en dát valt met een
   redenknop niet recht te zetten.

   Dus: hier gaat de deur dicht. Geen keuze, geen reden, geen regel in
   crm_trajecten (er is niets afgesloten). Wél de twee routes die wél
   kloppen, want een doodlopende weg zonder uitweg is geen poort maar een
   muur — zie js/kandverwijder.js, waar altijd minstens één knop werkt.  */
function geblokkeerdVenster(lp){
  return new Promise(res => {
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">${h(lp.naam || 'Deze kandidaat')} is geplaatst bij ${h(lp.klant)}</div></div>
      <div class="modal-b">
        <p class="tj-zin">Een plaatsing kun je niet verplaatsen naar een andere klant.
          De fee, de factuur, de garantie en de nazorg lopen op deze kaart.</p>
        <div class="tj-vak">
          <span class="label">Wat wel kan</span>
          <p class="tj-p">Is deze plaatsing echt afgelopen: leg dat eerst vast met
            <b>Fase wijzigen → Gestopt</b>, met de stopreden erbij.<br>
            Blijft de plaatsing staan en wil je dezelfde persoon elders aanbieden:
            maak een <b>nieuwe kaart</b> aan. Twee klanten op één kaart kan niet.</p>
        </div>
      </div>
      <div class="modal-f"><button class="btn" id="tj_dicht">Begrepen</button></div>`, {
      onClose(){ res({ok:false, geblokkeerd:true}); },
      onOpen(m){
        m.querySelector('#tj_dicht').onclick = () => {
          CRM.modal._onClose = null; CRM.modal.close(); res({ok:false, geblokkeerd:true});
        };
      }});
  });
}

function venster(lp, doel){
  if(lp.plaatsing) return geblokkeerdVenster(lp);

  return new Promise(res => {
    const naarKlant = doel.klant || '';
    /* De knop noemt de klant die je kwijtraakt, niet de handeling. Zie
       punt (c) bovenaan: een verkeerde klant in die knop leest verkeerd. */
    const knopTekst = 'Traject bij ' + lp.klant + ' afsluiten';
    const vn = voetnoot(lp);

    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Dit traject wordt afgesloten</div></div>
      <div class="modal-b">
        <p class="tj-zin">${h(zin(lp))}</p>
        ${vn ? `<p class="tj-voet meta">${h(vn)}</p>` : ''}
        ${naarKlant ? `<p class="tj-naar">Nieuw: <b>${h(naarKlant)}</b>${
          doel.functie ? ' · ' + h(doel.functie) : ''}</p>` : ''}
        <div class="tj-reden">
          <span class="label" id="tj_lbl">Waarom stopt het bij ${h(lp.klant)}?</span>
          <div class="tj-knoppen" role="group" aria-labelledby="tj_lbl">
            ${T.REDENEN.map(r => `<button type="button" class="tj-r" data-reden="${h(r.k)}"
              aria-pressed="false">${h(r.lbl)}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="modal-f">
        <button class="btn ghost" id="tj_nee">Annuleren</button>
        <button class="btn danger" id="tj_ja" disabled>${h(knopTekst)}</button>
      </div>`, {
      /* Escape of een klik naast het venster = annuleren. De veilige kant:
         er verdwijnt dan niets en er wordt niets vastgelegd. */
      onClose(){ res({ok:false}); },
      onOpen(m){
        let gekozen = '';
        const ja = m.querySelector('#tj_ja');
        m.querySelectorAll('.tj-r').forEach(b => b.onclick = () => {
          gekozen = b.dataset.reden;
          m.querySelectorAll('.tj-r').forEach(x => {
            const aan = x === b;
            x.classList.toggle('aan', aan);
            x.setAttribute('aria-pressed', aan ? 'true' : 'false');
          });
          ja.disabled = false;
        });
        m.querySelector('#tj_nee').onclick = () => {
          CRM.modal._onClose = null; CRM.modal.close(); res({ok:false});
        };
        ja.onclick = async () => {
          if(!gekozen) return;                  // knop staat uit, maar toch
          ja.disabled = true;                   // geen dubbele regel bij dubbelklik
          CRM.modal._onClose = null; CRM.modal.close();
          const rij = maakRij(lp, doel, gekozen);
          const bewaard = await schrijf(rij);
          res({ok:true, reden:gekozen, redenLabel:(reden(gekozen)||{}).lbl || '',
               traject:lp, rij, bewaard});
        };
      }});
  });
}

/* De regel zoals hij de database in gaat — kolomnamen, geen kaartnamen.
   GEEN kandidaatnaam: die staat op de kaart en hoort niet op twee
   plaatsen te leven. Zie de kop van dit bestand. */
function maakRij(lp, doel, redenK){
  const vandaag = CRM.todayISO();
  return {
    id: CRM.uid(),
    kandidaat_id: lp.kandidaatId,
    klant: lp.klant,
    vacature_id: lp.vacatureId || '',
    functie: lp.functie || '',
    fase: lp.fase || '',
    hoogste_fase: lp.hoogste || '',
    begin_op: lp.begin || null,
    eind_op: vandaag,
    reden: redenK,
    naar_klant: (doel && doel.klant) || '',
    naar_vacature: (doel && doel.vacatureId) || '',
    naar_functie: (doel && doel.functie) || '',
    door: CRM.me(),
    op: new Date().toISOString()
  };
}

/* ═══════════════════════════════════════════════════════════════
   6. ZICHTBAAR MAKEN
   Starcuisine hoort te merken dat ze iemand kwijt zijn. Drie plekken,
   drie vormen, één bron.
   ═══════════════════════════════════════════════════════════════ */
const mv = (n, enkel, meer) => n + ' ' + (n === 1 ? enkel : meer);
const maandVan = d => String(d || '').slice(0, 7);

/* De naam komt van de kaart, niet uit de tabel. Bestaat de kaart niet
   meer (verwijderd), dan valt de naam weg en blijft het feit staan. */
function naamVan(kandidaatId){
  const k = CRM.kandidaat(kandidaatId);
  return (k && k.naam) ? k.naam : '';
}

/* Alles wat bij deze klant is afgesloten, nieuwste eerst. */
T.voorKlant = function(klantnaam, opts){
  opts = opts || {};
  const vanaf = opts.vanaf || '';
  return rijen()
    .filter(r => CRM.zelfdeKlant(r.klant, klantnaam))
    .filter(r => !vanaf || String(r.eind_op || '') >= vanaf)
    .sort((a,b) => String(b.eind_op||'').localeCompare(String(a.eind_op||'')));
};

T.voorVacature = function(vacatureId){
  const id = String(vacatureId || '');
  if(!id) return [];
  return rijen()
    .filter(r => String(r.vacature_id || '') === id)
    .sort((a,b) => String(b.eind_op||'').localeCompare(String(a.eind_op||'')));
};

/* Eén regel per traject: naam, reden, datum. Bewust geen tabel — het
   zijn er zelden meer dan een paar, en een tabel voor drie regels leest
   als een administratie in plaats van als nieuws. */
function regels(lijst){
  return lijst.map(r => {
    const naam = naamVan(r.kandidaat_id);
    return `<div class="tj-regel">
      <span class="tj-naam">${h(naam || 'Een kandidaat')}</span>
      <span class="tj-reden-t">${h(redenKort(r.reden))}</span>
      <span class="meta num">${h(CRM.fmtDateShort ? CRM.fmtDateShort(r.eind_op) : CRM.fmtDate(r.eind_op))}</span>
    </div>`;
  }).join('');
}

/* ─── Klantkaart ─────────────────────────────────────────────────
   "1 traject afgesloten deze maand — kandidaat koos een andere opdracht"
   Deze maand, en wat er daarvoor lag in één zin eronder. Geen blok als
   er niets is: een leeg vak dat er altijd staat wordt meubilair.        */
T.blokHtml = function(klantnaam, opts){
  if(!klantnaam) return '';
  opts = opts || {};
  const alle = T.voorKlant(klantnaam);
  if(!alle.length) return '';
  const nu = maandVan(CRM.todayISO());
  const deze = alle.filter(r => maandVan(r.eind_op) === nu);
  const rest = alle.length - deze.length;
  const toon = deze.length ? deze : alle.slice(0, 3);
  const kop = deze.length
    ? mv(deze.length, 'traject', 'trajecten') + ' afgesloten deze maand'
    : mv(alle.length, 'traject', 'trajecten') + ' eerder afgesloten';
  return `<div class="tj-blok">
    <div class="tj-kop"><span class="label">Afgesloten trajecten</span>
      <span class="chip amber">${h(kop)}</span></div>
    ${regels(toon)}
    ${deze.length && rest ? `<p class="meta tj-meer">${h(mv(rest, 'traject', 'trajecten'))} eerder afgesloten.</p>` : ''}
    ${opts.uitleg === false ? '' : `<p class="meta tj-uitleg">Deze kandidaten zijn elders voorgesteld en
      lopen hier niet meer. Ze tellen niet mee als uitval.</p>`}
  </div>`;
};

/* ─── Vacaturepagina ─────────────────────────────────────────────
   Hier is het getal het punt: de teller ging van 13 naar 12 en dit is
   waarom. Compacter dan de klantkaart, want dit staat naast een lijst.  */
T.vacatureBlokHtml = function(vacatureId){
  const lijst = T.voorVacature(vacatureId);
  if(!lijst.length) return '';
  const nu = maandVan(CRM.todayISO());
  const deze = lijst.filter(r => maandVan(r.eind_op) === nu);
  const toon = deze.length ? deze : lijst.slice(0, 2);
  return `<div class="tj-blok tj-smal">
    <div class="tj-kop"><span class="label">Van deze vacature af</span>
      <span class="chip amber">${h(mv(toon.length, 'kandidaat', 'kandidaten'))}</span></div>
    ${regels(toon)}
  </div>`;
};

/* ─── Dashboard: het getal dat het bewijs wordt ───────────────────
   Hoeveel trajecten sloten we deze week af? Loopt dat op, dan is het
   losse `klant`-veld het probleem en niet de mensen die het bedienen —
   dan is de volledige oplossing (een echte trajecten-tabel) te
   verantwoorden. Blijft het op één of twee per week hangen, dan is deze
   tussenstap genoeg. Daarom staat de vorige week ernaast: één getal
   zonder vergelijking stuurt niets aan.                                */
function dagenTerug(n){
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toLocaleDateString('sv-SE');
}

T.week = function(){
  const start = dagenTerug(6), vorigeStart = dagenTerug(13), vorigeEind = dagenTerug(7);
  const alle = rijen();
  const inVak = (r, van, tot) => {
    const d = String(r.eind_op || '');
    return d >= van && (!tot || d <= tot);
  };
  const deze = alle.filter(r => inVak(r, start, ''));
  const vorige = alle.filter(r => inVak(r, vorigeStart, vorigeEind));
  const perReden = {};
  deze.forEach(r => { perReden[r.reden] = (perReden[r.reden] || 0) + 1; });
  const perKlant = {};
  deze.forEach(r => { perKlant[r.klant] = (perKlant[r.klant] || 0) + 1; });
  return {aantal:deze.length, vorige:vorige.length, perReden, perKlant, van:start, tot:CRM.todayISO()};
};

/* Kant-en-klare KPI voor het dashboard. Nul is hier goed nieuws en geen
   lege staat, dus die tonen we ook — mits er ooit iets geweest is.
   Is er nog nooit een traject afgesloten, dan zegt dit blok niets en
   blijft het weg. */
T.weekHtml = function(){
  const w = T.week();
  if(!w.aantal && !rijen().length) return '';
  const top = Object.entries(w.perReden).sort((a,b) => b[1] - a[1])[0];
  const detail = w.aantal
    ? (top ? h(redenKort(top[0])) : '') + (w.vorige ? ` <span class="meta">· vorige week ${w.vorige}</span>` : '')
    : '<span class="meta">niemand raakte een traject kwijt</span>';
  return CRM.ui.kpi('Afgesloten trajecten deze week', `<span class="num">${w.aantal}</span>`, detail);
};

/* ═══════════════════════════════════════════════════════════════
   7. VERZOEK AAN CORE
   crm_trajecten wordt nu door dit bestand zelf geladen (blok 3), zodat
   de module los toegevoegd kan worden zonder js/core.js aan te raken.
   Netter is één regel in CRM.load, naast de andere crm_*-tabellen:

     veilig(sb.from('crm_trajecten').select('*').order('op',{ascending:false}).limit(1000), 'crm_trajecten')

   en `trajecten` erbij in de Object.assign eronder. Dan verdwijnt de
   lazy load hier en tekent de klantkaart het blok in de eerste render
   in plaats van in de tweede.
   ═══════════════════════════════════════════════════════════════ */
})();
