/* ═══════════════════════════════════════════════════════════════
   MODULE: OPENSTAANDE VACATURES  (met een tweede stand: HOT)

   Eén tabblad, twee standen van dezelfde schakelaar:

   OPENSTAAND (standaard) — alles wat bij klanten nog te vullen is.
     Dit is het werkbord van de accountmanager: waar is nog ruimte,
     waar loopt niets, en waar staat iets al te lang stil. Een match
     maken op een vacature die al vol is, is verspilde moeite; daarom
     is "hoeveel er nog te vullen zijn" hier het hoofdgetal en geen
     detail dat je pas na een klik ziet.

   HOT — de strengere selectie daarbinnen: de vacatures waar zoveel
     druk op zit dat er een deadline en een meetbaar doel bij horen
     (voorstellen/gesprekken/plaatsingen). Ongewijzigd gebleven; alleen
     de plek in de navigatie is verschoven.

   Klik op een kaart → de hele vacature op één pagina, met de
   vacaturetekst, wie er loopt, wie zou kunnen passen, en een
   doorstap naar de klantkaart.

   Leest de vacatures-tabel. Schrijft alleen naar kolommen van die
   tabel: status, hot, hot_prio, deadline, doel_aantal, doel_soort,
   doel_gezet_op.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const h = CRM.h;

  /* ─── Weergavekeuze ──────────────────────────────────────────────
     Openstaand is de standaard. Reden: dat is de vraag die elke dag
     opnieuw gesteld wordt ("waar kan ik iemand kwijt"), en hot is per
     definitie een handvol vacatures die je al kent. Wie liever met hot
     begint kiest dat één keer; die keuze blijft staan. Zelfde vorm als
     crm_pp_weergave en crm_rc_weergave: een gewoonte van deze persoon op
     dit apparaat, geen gegeven dat in de database hoort. */
  const WKEY = 'crm_hot_weergave';
  const weergave    = () => { try{ return localStorage.getItem(WKEY) === 'hot' ? 'hot' : 'open'; }catch(e){ return 'open'; } };
  const zetWeergave = w => { try{ localStorage.setItem(WKEY, w); }catch(e){} };

  /* ─── Schermstand ───────────────────────────────────────────────
     Bewust niet bewaard: dit zijn vragen van dít moment, geen gewoonte. */
  const S = { open:null, zoek:'', sort:'knelt', mijn:false, toonRest:false, klant:'', am:'' };
  const M = { mount:null, acties:null, vac:null };   // vac gezet = detailpagina

  const EIND = ['Afgevallen','Gestopt'];
  const SOORT_WOORD = {
    voorstellen:['voorstel','voorstellen'],
    gesprekken:['gesprek','gesprekken'],
    plaatsingen:['plaatsing','plaatsingen']
  };
  const woord = (n, soort) => (SOORT_WOORD[soort]||SOORT_WOORD.voorstellen)[n===1?0:1];
  const dat = s => String(s||'').slice(0,10);
  const dagLang = iso => {
    if(!iso) return '';
    const d = new Date(iso); if(isNaN(d)) return String(iso);
    return d.toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'short'});
  };
  const norm = s => String(s||'').toLowerCase();

  /* ─── Kandidaten bij een vacature ───────────────────────────────
     Op vacature_id, met terugval op klant+functie voor kandidaten
     zonder koppeling (de import uit het oude ATS heeft er geen).
     Eén index per tekenronde: met vijftig vacatures en een paar honderd
     kandidaten werd dezelfde lijst anders vijftig keer doorlopen — de
     kaart, de sortering, de telling en de badge doen dit elk apart. */
  let _idx = null;
  function index(){
    if(_idx) return _idx;
    const perVac = new Map(), perKF = new Map();
    const zet = (map, sleutel, c) => {
      const r = map.get(sleutel); if(r) r.push(c); else map.set(sleutel, [c]);
    };
    /* Een NUL-teken als scheidingsteken tussen klant en functie: elk gewoon teken
       (spatie, streepje) kan in een van beide voorkomen en dan zou
       klant "Van Vliet" + functie "Zoetwaren Inpakker" dezelfde sleutel
       opleveren als klant "Van Vliet Zoetwaren" + functie "Inpakker". */
    CRM.kandidaten().forEach(c => {
      if(c.vacatureId) zet(perVac, String(c.vacatureId), c);
      else if(c.klant && c.functie) zet(perKF, c.klant + '\u0000' + c.functie, c);
    });
    _idx = {perVac, perKF};
    Promise.resolve().then(() => { _idx = null; });    // geldig binnen één tick
    return _idx;
  }
  const gekoppeld = v => {
    const ix = index();
    const a = ix.perVac.get(String(v.id)) || [];
    const b = (v.klant && v.functie) ? (ix.perKF.get(v.klant + '\u0000' + v.functie) || []) : [];
    return b.length ? a.concat(b) : a;
  };
  /* Een kandidaat zonder fase (import uit het oude ATS) hoort nergens als
     lopend traject te tellen — leeg is geen positie in de pijplijn. */
  const heeftFase = c => !!c.fase;

  /* ═══════════════════════════════════════════════════════════════
     DE TELLING — wat betekent "openstaand"?

     Niet `status === 'Open'`. Dat veld zegt alleen wat er ooit is
     ingevuld, niet of er nog ruimte is. Een vacature voor drie mensen
     waarvan er één is geplaatst staat nog steeds open voor twee; een
     vacature die op Open staat maar waar alle posities gevuld zijn, is
     dat feitelijk niet meer.

     Vier getallen, uit echte gegevens:
       gevraagd   = vacatures.aantal (het aantal posities dat de klant vroeg)
       geplaatst  = gekoppelde kandidaten in een PLACED-fase
                    (Contract getekend, Gestart). Gestopt telt hier bewust
                    níét: die plek is weer vrij.
       te vullen  = gevraagd − geplaatst, nooit negatief
       in procedure = gekoppelde kandidaten met een fase die nog loopt
                    (niet in CRM.DONE). Die vullen niets — ze zeggen alleen
                    dat er al iets op deze vacature gebeurt.

     Een vacature is OPENSTAAND als de status Open is (of leeg — dan leest
     de hele app hem als Open) én er nog te vullen valt. On hold, Vervuld
     en Gesloten vallen erbuiten, en zo ook de vacature die op Open staat
     maar vol is. Die twee groepen verdwijnen niet: ze staan onder de lijst,
     want een status die niet meer klopt is zelf werk.
     ═══════════════════════════════════════════════════════════════ */
  const statusOpen = v => (v.status || 'Open') === 'Open';

  function telling(v){
    const cands = gekoppeld(v);
    const ruw = Number(v.aantal);
    /* Aantal 0, leeg of onzin: we weten het niet. De rest van de app rekent
       dan met 1 — dat doen wij ook, maar we zeggen het er op de kaart bij in
       plaats van een verzonnen getal als feit te tonen. */
    const aantalBekend = Number.isFinite(ruw) && ruw > 0;
    const gevraagd = aantalBekend ? Math.round(ruw) : 1;
    const geplaatst = cands.filter(c => CRM.faseIn(c.fase, CRM.PLACED)).length;
    const lopend = cands.filter(c => heeftFase(c) && !CRM.faseIn(c.fase, CRM.DONE));
    /* Voorgesteld bij de klant (staat op het bord) versus nog in
       voorbereiding (Intake). Dat verschil bepaalt of er écht iets loopt. */
    const bijKlant = lopend.filter(c => CRM.faseIdx(c.fase) >= 0);
    const voorbereiding = lopend.filter(c => CRM.faseIdx(c.fase) < 0);
    const zonderFase = cands.filter(c => !heeftFase(c)).length;
    return {
      cands, gevraagd, aantalBekend, geplaatst, lopend, bijKlant, voorbereiding, zonderFase,
      teVullen: Math.max(0, gevraagd - geplaatst),
      over: Math.max(0, geplaatst - gevraagd)
    };
  }

  const isOpenstaand = v => statusOpen(v) && telling(v).teVullen > 0;
  const isVolMaarOpen = v => statusOpen(v) && telling(v).teVullen === 0;

  /* Gedeeld met js/kandidaten.js — die kaart waarschuwt bij "Kansen" dat een
     vacature al vol is en moet daarvoor exact dit getal gebruiken. Eén
     implementatie: twee schermen die over dezelfde vacature iets anders
     zeggen is precies het probleem dat deze telling moest oplossen. */
  CRM.vacBezetting = v => v ? telling(v) : null;

  /* Waar knelt het? Vier niveaus, van "hier gebeurt niets" naar "loopt".
     Dit is de standaardsortering én de waarschuwing op de kaart, zodat het
     scherm en de volgorde nooit iets anders zeggen. */
  /* `rand` is de kleur van de streep links (de gedeelde kleurtaal, zie .frand
     in base.css). Hij loopt gelijk met de chip ernaast — anders zeggen de
     streep en het woord iets anders over dezelfde vacature. Op koers is
     groen en niet niets: op een grid van dertig vacatures wil je "hier is
     alles goed" kunnen zíén, niet afleiden uit de afwezigheid van kleur. */
  const KNEL = [
    {lbl:'niets op deze vacature',  kleur:'red',   rand:'var(--red)'},
    {lbl:'nog niemand voorgesteld', kleur:'amber', rand:'var(--amber)'},
    {lbl:'te weinig in de pijplijn',kleur:'amber', rand:'var(--amber)'},
    {lbl:'', kleur:'',                             rand:'var(--green)'}
  ];
  function knelNiveau(t){
    if(!t.lopend.length)   return 0;
    if(!t.bijKlant.length) return 1;
    if(t.bijKlant.length < t.teVullen) return 2;
    return 3;
  }

  const dagenOpen = v => CRM.dagenGeleden(v.aangemaakt);

  /* ─── Hot ───────────────────────────────────────────────────────── */
  const hotVacs = () => CRM.state.vacs.filter(v => v.hot)
    .sort((a,b) => (a.hot_prio||999) - (b.hot_prio||999));

  /* Doel-voortgang: telt kandidaten die het doel sinds doel_gezet_op
     bereikten. Historie is leidend; terugval op huidige fase + since. */
  function telDoel(v, cands){
    const vanaf = dat(v.doel_gezet_op);
    if(!vanaf || !v.doel_aantal) return 0;
    const soort = v.doel_soort || 'voorstellen';
    const idxVoor = CRM.faseIdx('Voorgesteld');
    const idxGes  = CRM.faseIdx('Eerste gesprek');
    return cands.filter(c => {
      if(soort === 'plaatsingen')
        return !!c.geplaatstOp && dat(c.geplaatstOp) >= vanaf;
      if(soort === 'gesprekken'){
        const hist = (c.historie||[]).some(x => {
          const i = CRM.faseIdx(x.fase);
          return i >= idxGes && !EIND.includes(x.fase) && dat(x.op) >= vanaf;
        });
        const nu = CRM.faseIdx(c.fase) >= idxGes && !EIND.includes(c.fase) && dat(c.since) >= vanaf;
        return hist || nu;
      }
      // voorstellen
      const hist = (c.historie||[]).some(x => x.fase==='Voorgesteld' && dat(x.op) >= vanaf);
      const nu = CRM.faseIdx(c.fase) >= idxVoor && !EIND.includes(c.fase) && dat(c.since) >= vanaf;
      return hist || nu;
    }).length;
  }

  /* Resterende dagen tot de deadline (negatief = gemist). */
  const restDagen = v => v.deadline ? -CRM.dagenGeleden(v.deadline) : null;

  /* Op koers? Verhouding verstreken tijd vs voortgang. */
  function opKoers(v, beh){
    if(!v.doel_aantal || !v.deadline) return true;
    if(!dat(v.doel_gezet_op)) return false;   // teller nooit gestart: vraagt actie
    if(beh == null) beh = telDoel(v, gekoppeld(v));
    if(beh >= v.doel_aantal) return true;
    const rest = restDagen(v);
    if(rest < 0) return false;                          // deadline voorbij, doel niet gehaald
    const verstreken = Math.max(0, CRM.dagenGeleden(v.doel_gezet_op) || 0);
    const looptijd = verstreken + rest;
    if(looptijd <= 0) return true;
    return (beh / v.doel_aantal) >= (verstreken / looptijd) - 1e-9;
  }

  /* Mini-funnel: lopende kandidaten per blok, in fasekleuren. */
  const FUNNEL = [
    /* Dit blok heet naar wat het is: alles vóór het eerste gesprek. */
    {lbl:'vóór het gesprek',   fases:['Intake','Voorgesteld','O&O sessie'],                    kleurFase:'Voorgesteld'},
    {lbl:'in gesprek',         fases:['Eerste gesprek','Tweede gesprek','Meeloopdag','In de wacht'], kleurFase:'Eerste gesprek'},
    {lbl:'richting contract',  fases:['Offer','Contract ondertekenen'],                        kleurFase:'Offer'}
  ];

  /* ─── Opslaan (in demo alleen CRM.state) ────────────────────── */
  async function bewaarVac(v, patch){
    Object.assign(v, patch);
    if(!CRM.demo){
      const {error} = await CRM.sb.from('vacatures').update(patch).eq('id', v.id);
      if(error){ CRM.fout('Opslaan mislukt', error); return false; }
    }
    return true;
  }

  /* CRM.logActiviteit schrijft altijd naar de database; in demo bestaat die
     niet en levert dat een fout in de console op. Daarom hier de demo-variant. */
  async function logActie(v, soort, tekst){
    if(CRM.demo){
      CRM.state.activiteiten.unshift({id:CRM.uid(), entiteit:'vacature', ref:String(v.id),
        soort, tekst, door:CRM.me(), op:new Date().toISOString(), extra:{}});
      return;
    }
    await CRM.logActiviteit('vacature', v.id, soort, tekst);
  }

  /* Volgorde vastleggen: hot_prio = positie in de rij (1 = bovenaan). */
  async function zetVolgorde(ids){
    for(let i=0;i<ids.length;i++){
      const v = CRM.state.vacs.find(x => String(x.id)===String(ids[i]));
      if(v && v.hot_prio !== i+1) await bewaarVac(v, {hot_prio:i+1});
    }
  }

  /* ─── Melding bij naderende deadline (1× per dag) ───────────── */
  function checkMeldingen(){
    const sleutel = 'crm_hotmeld_' + CRM.todayISO();
    try{  // oude dag-vlaggen opruimen
      Object.keys(localStorage).forEach(k => {
        if(k.startsWith('crm_hotmeld_') && k !== sleutel) localStorage.removeItem(k);
      });
    }catch(e){}
    let klaar = [];
    try{ klaar = JSON.parse(localStorage.getItem(sleutel)||'[]'); }catch(e){}
    hotVacs().forEach(v => {
      if(!v.deadline || !v.doel_aantal || !v.eigenaar) return;
      const rest = restDagen(v);
      if(rest !== 0 && rest !== 1) return;               // alleen vandaag/morgen
      if(klaar.includes(String(v.id))) return;
      const beh = telDoel(v, gekoppeld(v));
      if(beh >= v.doel_aantal) return;
      const teGaan = v.doel_aantal - beh;
      CRM.meld(v.eigenaar, 'systeem',
        `Hot vacature ${v.klant} – ${v.functie}: deadline ${dagLang(v.deadline)}, nog ${teGaan} ${woord(teGaan, v.doel_soort)} te gaan`,
        'vacature', v.id);
      klaar.push(String(v.id));
    });
    try{ localStorage.setItem(sleutel, JSON.stringify(klaar)); }catch(e){}
  }

  /* ─── Gedeelde stukjes weergave ─────────────────────────────── */

  /* Salarisindicatie. Bewust NIET achter CRM.canSeeMoney(): een loonrange is
     een arbeidsvoorwaarde die je aan een kandidaat vertelt, geen fee of marge.
     De klantkaart toont hem op precies dezelfde manier aan het hele team
     (js/klanten.js). Fee en omzet horen daar wél achter, en die staan hier
     nergens. */
  function salarisTekst(v){
    const lo = v.sal_min, hi = v.sal_max;
    if(lo != null && hi != null) return CRM.euro(lo) + ' – ' + CRM.euro(hi);
    if(lo != null) return 'vanaf ' + CRM.euro(lo);
    if(hi != null) return 'tot ' + CRM.euro(hi);
    return '';
  }

  const klantLabel = v => v.klant ? String(v.klant) : 'klant onbekend';
  const locLabel   = v => v.locatie ? String(v.locatie) : 'locatie niet ingevuld';

  /* Hot-chip: dezelfde tekst op de kaart en op de detailpagina. */
  function hotChip(v){
    if(!v.hot) return '';
    const rest = restDagen(v);
    const kleur = rest == null ? '' : rest < 0 || rest <= 2 ? 'red' : rest <= 5 ? 'amber' : '';
    const tekst = rest == null ? 'hot'
      : rest < 0 ? 'hot · deadline gemist'
      : rest === 0 ? 'hot · vandaag'
      : rest === 1 ? 'hot · nog 1 dag'
      : `hot · nog ${rest} dagen`;
    return `<span class="chip ${kleur} ov-hot">${h(tekst)}</span>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     OPENSTAANDE VACATURES — de lijst
     ═══════════════════════════════════════════════════════════════ */

  const SORTS = [
    ['knelt',  'Waar het knelt'],
    ['lang',   'Langst open'],
    ['vullen', 'Meeste te vullen'],
    ['klant',  'Klant A–Z']
  ];

  function openLijst(){
    const q = norm(S.zoek).trim();
    const rij = CRM.state.vacs.filter(v => {
      if(!isOpenstaand(v)) return false;
      if(S.mijn && !CRM.isVanMij(v)) return false;
      if(S.klant && v.klant !== S.klant) return false;
      /* De AM staat op de vacature als die er is, en anders op de klantkaart —
         daar hoort hij thuis en daar is hij ook onderhouden. */
      if(S.am && (v.eigenaar || (CRM.klant(v.klant)||{}).eigenaar) !== S.am) return false;
      if(!q) return true;
      return norm([v.functie, v.klant, v.locatie, v.eigenaar].join(' ')).includes(q);
    }).map(v => ({v, t:telling(v)}));

    const dgn = x => { const n = dagenOpen(x.v); return n == null ? -1 : n; };
    const cmp = {
      knelt: (a,b) => knelNiveau(a.t) - knelNiveau(b.t)
                   || (b.v.hot?1:0) - (a.v.hot?1:0)
                   || dgn(b) - dgn(a),
      lang:   (a,b) => dgn(b) - dgn(a),
      vullen: (a,b) => b.t.teVullen - a.t.teVullen || dgn(b) - dgn(a),
      klant:  (a,b) => String(a.v.klant||'').localeCompare(String(b.v.klant||''), 'nl')
                    || String(a.v.functie||'').localeCompare(String(b.v.functie||''), 'nl')
    };
    return rij.sort(cmp[S.sort] || cmp.knelt);
  }

  /* Eén kaart. Verplicht zichtbaar: functie, klant, locatie, aantal fte.
     Daarnaast alleen wat bepaalt of je hier vandaag aan werkt:
     hoeveel er nog te vullen zijn (het hoofdgetal), de verdeling geplaatst /
     in procedure / nog open, hoe lang de vacature al openstaat, en één
     knelpunt als er iets vastloopt. Ploegendienst staat erbij omdat dat in
     productie en logistiek de meest voorkomende reden is dat een match
     alsnog afketst; de rest van de vacature-informatie staat op de
     detailpagina. Een kaart die alles toont, toont niets. */
  function kaartOpen(v, t){
    const niveau = knelNiveau(t);
    const knel = KNEL[niveau];
    const dgn = dagenOpen(v);
    const oud = dgn != null && dgn >= 45;

    // Balk: geplaatst / in procedure / nog open, als deel van het gevraagde aantal
    const pct = n => Math.max(0, Math.min(100, n / t.gevraagd * 100));
    const inProc = Math.min(t.bijKlant.length, t.teVullen);
    const leeg = Math.max(0, t.teVullen - inProc);
    const balk = `<div class="ov-balk" role="img" aria-label="${h(
        `${t.geplaatst} geplaatst, ${inProc} in procedure, ${leeg} nog zonder kandidaat`)}">
      ${t.geplaatst ? `<i class="vol" style="width:${pct(t.geplaatst)}%"></i>` : ''}
      ${inProc ? `<i class="proc" style="width:${pct(inProc)}%"></i>` : ''}
      ${leeg ? `<i class="leeg" style="width:${pct(leeg)}%"></i>` : ''}
    </div>`;

    const sal = salarisTekst(v);
    const ploeg = String(v.ploegendienst || '').trim();

    const chips = [
      hotChip(v),
      ploeg && ploeg !== 'geen' ? `<span class="chip">${h(ploeg)}</span>` : '',
      sal ? `<span class="chip num">${h(sal)}</span>` : '',
      t.over ? `<span class="chip amber">${t.over} meer geplaatst dan gevraagd</span>` : '',
      !t.aantalBekend ? `<span class="chip amber">aantal niet ingevuld</span>` : ''
    ].filter(Boolean).join('');

    const stand = [
      t.geplaatst ? `${t.geplaatst} geplaatst` : '',
      t.bijKlant.length ? `${t.bijKlant.length} in procedure` : '',
      t.voorbereiding.length ? `${t.voorbereiding.length} in voorbereiding` : ''
    ].filter(Boolean).join(' · ') || 'nog geen kandidaat gekoppeld';

    /* De streep links zei tot 3 aug 2026 "deze staat op het hot-bord" — maar
       dat stond er ook al als chip, en het is geen toestand van de vacature
       maar een keuze van ons. Nu zegt hij waar deze vacature staat: rood als
       er niemand op zit, amber als het te dun is, groen als het loopt. Dat is
       dezelfde taal als de rand op een klant- of kandidaatrij. */
    return `<article${CRM.ui.frand(knel.rand, 'ovcard' + (v.hot?' hot':''))} data-id="${h(v.id)}" tabindex="0" role="button">
      <div class="ov-kop">
        <div class="ov-wie">
          <h3 class="ov-functie">${h(v.functie || 'functie niet ingevuld')}</h3>
          <div class="ov-klant">${h(klantLabel(v))} <span class="ov-punt">·</span> ${h(locLabel(v))}</div>
        </div>
        <div class="ov-vullen">
          <span class="ov-getal num">${t.teVullen}</span>
          <span class="ov-vlbl">van ${t.gevraagd} te vullen</span>
        </div>
      </div>
      ${chips ? `<div class="ov-chips">${chips}</div>` : ''}
      ${balk}
      <div class="ov-voet">
        <span class="ov-stand">${h(stand)}</span>
        <span class="ov-meta${oud?' oud':''}">${dgn == null ? 'aanmaakdatum onbekend'
          : dgn === 0 ? 'vandaag aangemaakt' : `${dgn} ${dgn===1?'dag':'dagen'} open`}${
          v.eigenaar ? ' · ' + h(v.eigenaar) : ''}</span>
        ${knel.lbl ? `<span class="chip ${knel.kleur} ov-knel">${h(knel.lbl)}</span>` : ''}
        ${v.hot ? '' : `<button class="btn sub sm ov-hotknop" data-hot>Hot maken</button>`}
      </div>
    </article>`;
  }

  function tekenOpen(){
    const mount = M.mount;
    const rijen = openLijst();
    const totaalOpen = CRM.state.vacs.filter(isOpenstaand).length;
    const posities = rijen.reduce((s,r) => s + r.t.teVullen, 0);

    // Groepen die bewust buiten de lijst vallen
    const onHold = CRM.state.vacs.filter(v => (v.status||'Open') === 'On hold');
    const vol    = CRM.state.vacs.filter(isVolMaarOpen);
    const rest   = onHold.concat(vol);

    /* Zonder één enkele vacature heeft filteren geen betekenis. Bij een filter
       dat niets oplevert blijft de balk juist wél staan — je moet hem kunnen
       terugdraaien. */
    /* Filteren op klant en accountmanager. "Alleen van mij" bestond al, maar
       Tjeerd wil ook de vacatures van Tjerk kunnen bekijken, en per klant —
       dat is de vraag die je stelt als een opdrachtgever belt. De lijsten
       komen uit de vacatures zelf, dus er staat nooit een keuze in die niets
       oplevert. */
    const uniek = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'nl'));
    const klanten = uniek(CRM.state.vacs.map(v => v.klant));
    const ams     = uniek(CRM.state.vacs.map(v => v.eigenaar || (CRM.klant(v.klant)||{}).eigenaar));
    const balkje = !CRM.state.vacs.length ? '' : `<div class="ov-bar">
      <div class="searchbox"><input type="search" id="ov_q" placeholder="Zoek op functie, klant of plaats" value="${h(S.zoek)}"></div>
      <select id="ov_klant" aria-label="Klant"><option value="">Alle klanten</option>${
        klanten.map(x=>`<option${S.klant===x?' selected':''}>${h(x)}</option>`).join('')}</select>
      <select id="ov_am" aria-label="Accountmanager"><option value="">Alle AM's</option>${
        ams.map(x=>`<option${S.am===x?' selected':''}>${h(x)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="ov_mijn"${S.mijn?' checked':''}> Alleen van mij</label>
      <select id="ov_sort" aria-label="Sorteren">${SORTS.map(([k,l]) =>
        `<option value="${k}"${S.sort===k?' selected':''}>${h(l)}</option>`).join('')}</select>
      <div class="spacer"></div>
      <span class="meta" id="ov_tel">${rijen.length} ${rijen.length===1?'vacature':'vacatures'} · ${posities} ${posities===1?'positie':'posities'} te vullen</span>
    </div>`;

    let lijstHtml;
    if(!CRM.state.vacs.length){
      lijstHtml = CRM.ui.leeg('Nog geen vacatures',
        'Vacatures leg je vast op de klantkaart. Zodra er één openstaat, verschijnt hij hier.');
    }else if(!totaalOpen){
      lijstHtml = CRM.ui.leeg('Alles is gevuld',
        'Er staat op dit moment geen vacature open waar nog ruimte in zit. Zodra er een positie bijkomt of iemand stopt, komt de vacature hier terug.');
    }else if(!rijen.length){
      lijstHtml = CRM.ui.leeg('Geen vacature gevonden',
        'Er staan wel openstaande vacatures, maar geen enkele past bij dit filter.');
    }else{
      lijstHtml = `<div class="ovlijst">${rijen.map(r => kaartOpen(r.v, r.t)).join('')}</div>`;
    }

    const uitleg = rijen.length && S.sort === 'knelt'
      ? `<p class="ov-uitleg meta">Gesorteerd op waar het knelt: eerst de vacatures waar niets op loopt, dan waar nog niemand is voorgesteld, dan waar te weinig in de pijplijn zit. Daarbinnen de langst openstaande eerst.</p>` : '';

    /* De afwijkende gevallen verdwijnen niet uit beeld. "Vol maar nog op Open"
       is geen randgeval maar werk: zolang de status niet klopt, blijft die
       vacature elders in de app als open meetellen. */
    let restHtml = '';
    if(rest.length){
      const delen = [];
      if(onHold.length) delen.push(`${onHold.length} on hold`);
      if(vol.length) delen.push(`${vol.length} vol maar nog op Open`);
      restHtml = `<div class="ov-rest">
        <button class="btn sub sm" id="ov_restknop">${S.toonRest?'▾':'▸'} ${h(delen.join(' · '))}</button>
        ${S.toonRest ? `<div class="ov-restlijst">${rest.map(v => {
          const t = telling(v);
          const reden = (v.status||'Open') === 'On hold' ? 'on hold'
            : `alle ${t.gevraagd} ${t.gevraagd===1?'positie':'posities'} gevuld — status staat nog op Open`;
          return `<div class="ov-restrij" data-id="${h(v.id)}">
            <b>${h(v.functie || 'functie niet ingevuld')}</b>
            <span class="meta">${h(klantLabel(v))} · ${h(locLabel(v))}</span>
            <span class="chip">${h(reden)}</span>
            <span class="ov-ga">→</span></div>`;
        }).join('')}</div>` : ''}
      </div>`;
    }

    mount.innerHTML = balkje + uitleg + lijstHtml + restHtml;

    const q = mount.querySelector('#ov_q');
    if(q) q.oninput = CRM.debounce(() => { S.zoek = q.value; tekenOpen(); const n = M.mount.querySelector('#ov_q'); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 220);
    const mijn = mount.querySelector('#ov_mijn');
    if(mijn) mijn.onchange = () => { S.mijn = mijn.checked; tekenOpen(); };
    const sort = mount.querySelector('#ov_sort');
    if(sort) sort.onchange = () => { S.sort = sort.value; tekenOpen(); };
    const kl = mount.querySelector('#ov_klant');
    if(kl) kl.onchange = () => { S.klant = kl.value; tekenOpen(); };
    const am = mount.querySelector('#ov_am');
    if(am) am.onchange = () => { S.am = am.value; tekenOpen(); };
    const restknop = mount.querySelector('#ov_restknop');
    if(restknop) restknop.onclick = () => { S.toonRest = !S.toonRest; tekenOpen(); };

    CRM.$$('.ovcard, .ov-restrij', mount).forEach(el => {
      const ga = e => { if(e && e.target.closest('button')) return; naarDetail(el.dataset.id); };
      el.onclick = ga;
      el.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); ga(); } };
      /* Van openstaand naar hot zonder het scherm te verlaten. */
      const hk = el.querySelector('[data-hot]');
      if(hk) hk.onclick = e => {
        e.stopPropagation();
        const v = CRM.state.vacs.find(x => String(x.id) === el.dataset.id);
        if(v) instelModal(v, true);
      };
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     HOT — ongewijzigd van opzet, tweede stand van de schakelaar
     ═══════════════════════════════════════════════════════════════ */
  function kaartHot(v, i, n){
    const cands = gekoppeld(v);
    const lopend = cands.filter(c => heeftFase(c) && !CRM.DONE.includes(c.fase));
    const geplaatst = cands.filter(c => CRM.PLACED.includes(c.fase));
    const zonderFase = cands.filter(c => !heeftFase(c)).length;
    const beh = telDoel(v, cands);
    const doel = Number(v.doel_aantal)||0;
    const gehaald = doel > 0 && beh >= doel;

    // Deadline
    const rest = restDagen(v);
    const dlKlass = rest==null ? '' : (rest < 0 || rest <= 2) ? 'rood' : rest <= 5 ? 'amber' : '';
    const dlTekst = rest==null ? 'geen deadline'
      : rest < 0 ? 'deadline gemist'
      : rest === 0 ? 'vandaag'
      : rest === 1 ? 'nog 1 dag'
      : `nog ${rest} dagen`;

    // Doel als zin + voortgang
    /* Zonder doel_gezet_op weet telDoel() niet vanaf wanneer hij mag tellen en
       geeft hij altijd 0 terug. Dat zag er precies zo uit als "nog niets
       bereikt" — een doel dat nooit vooruit kan. Dat zeggen we nu, in plaats
       van een nul die niets betekent. */
    const teller = doel > 0 && !dat(v.doel_gezet_op);
    const posities = Number(v.aantal) || 1;
    const teHoog = doel > 0 && (v.doel_soort === 'plaatsingen') && doel > posities;
    /* Een doel dat om twee voorstellen vraagt op een vacature waar geen plek
       meer is, is werk voor niets. Het Openstaand-overzicht wist dit al
       ("alle 2 posities gevuld"); de doelteller zweeg erover en telde
       vrolijk door. Zelfde telling, dus de twee kunnen niet uiteenlopen. */
    const volT = telling(v);
    const volChip = (doel > 0 && !volT.teVullen)
      ? ` <span class="chip amber" title="Alle ${volT.gevraagd} ${volT.gevraagd===1?'positie is':'posities zijn'} gevuld. Het doel blijft staan — haal de vacature van het hot-bord of pas de status aan als er niets meer bij hoeft.">vacature is vol</span>` : '';
    const zin = doel ? `minimaal ${doel} ${woord(doel, v.doel_soort)} voor ${dagLang(v.deadline)}`
                     : 'nog geen doel ingesteld';
    const status = !doel ? `<span class="meta">stel een doel in via Bewerken</span>`
      : teller ? `<span class="meta">de teller is nooit gestart — open Bewerken en sla het doel opnieuw op</span>`
      : gehaald ? `<span class="doel-ok">doel gehaald ✓</span>${volChip}`
      : `<span class="num">${beh}</span> van <span class="num">${doel}</span> · nog ${doel-beh} te gaan${
          teHoog ? ` <span class="chip amber" title="Er ${posities===1?'is':'zijn'} maar ${posities} ${posities===1?'positie':'posities'} op deze vacature — meer plaatsingen kunnen niet.">meer dan ${posities} ${posities===1?'positie':'posities'}</span>` : ''}${volChip}`;
    const pct = (doel && !teller) ? Math.min(100, beh/doel*100) : 0;

    // Mini-funnel
    const blok = FUNNEL.map(f => ({...f, n: lopend.filter(c => CRM.faseIn(c.fase, f.fases)).length,
                                   c: CRM.faseKleur(f.kleurFase)}));
    const totaal = blok.reduce((s,b)=>s+b.n, 0);
    /* Breedte als max-width, niet als vaste width: op een smal scherm paste de
       balk anders niet in de kaart en kreeg de héle pagina een horizontale
       schuifbalk. */
    const segbar = totaal ? `<div class="hot-segbar" style="max-width:${Math.min(340, totaal*34)}px">${blok.filter(b=>b.n).map(b =>
        `<i style="flex:${b.n};background:${b.c}" title="${b.n} ${h(b.lbl)}"></i>`).join('')}</div>` : '';
    const funTekst = totaal
      ? blok.map(b => `<span class="${b.n?'':'leeg'}"><i class="hot-dot" style="background:${b.c}"></i>${b.n} ${h(b.lbl)}</span>`).join('')
      : `<span class="leeg">geen lopende kandidaten in de pijplijn</span>`;
    const gepl = geplaatst.length ? `<span><i class="hot-dot" style="background:${CRM.faseKleur('Gestart')}"></i>${geplaatst.length} geplaatst</span>` : '';

    // Eerstvolgende geplande afspraak (lopende kandidaten)
    const vandaag = CRM.todayISO();
    const afspraak = lopend.filter(c => c.datum && dat(c.datum) >= vandaag)
      .sort((a,b) => (dat(a.datum)+(a.tijd||'')).localeCompare(dat(b.datum)+(b.tijd||'')))[0];
    const afsprHtml = afspraak
      ? `<span class="hot-afspraak">volgende afspraak: ${h(CRM.fmtDay(afspraak.datum))}${afspraak.tijd?' '+h(afspraak.tijd):''} · ${h(afspraak.naam)}</span>`
      : '';

    // Nog te vullen — hetzelfde getal als op het openstaande bord, zodat de
    // twee standen nooit iets anders zeggen over dezelfde vacature.
    const t = telling(v);
    const vulTekst = t.teVullen
      ? `nog ${t.teVullen} van ${t.gevraagd} te vullen`
      : `alle ${t.gevraagd} ${t.gevraagd===1?'positie':'posities'} gevuld`;

    // Uitklap: gekoppelde kandidaten
    const open = S.open === String(v.id);
    /* Afgeronde én faseloze kandidaten onderaan — alleen lopende trajecten
       verdienen de aandacht bovenin. */
    const achteraan = c => (EIND.includes(c.fase) || !heeftFase(c)) ? 1 : 0;
    const rij = cands.slice().sort((a,b) =>
      achteraan(a) - achteraan(b) || CRM.faseIdx(b.fase) - CRM.faseIdx(a.fase));
    const uitklap = !open ? '' : `<div class="hot-uitklap">
      <div class="label" style="margin-bottom:8px">Gekoppelde kandidaten (${cands.length})</div>
      ${!cands.length ? `<div class="meta">Nog geen kandidaten aan deze vacature gekoppeld.</div>` :
        rij.map(c => `<div class="hk-row${EIND.includes(c.fase)||!heeftFase(c)?' af':''}" data-cand="${h(c.id)}">
          <i class="hot-dot" style="background:${heeftFase(c)?CRM.faseKleur(c.fase):'var(--line-2)'}"></i>
          <b>${h(c.naam)}</b>
          <span class="chip">${heeftFase(c) ? h(CRM.faseNorm(c.fase)) : 'geen fase'}</span>
          <span class="hk-actie">${h(c.volgendeActie
              ? c.volgendeActie + (c.actieDatum ? ' · ' + CRM.fmtDateShort(c.actieDatum) : '')
              : (c.datum && dat(c.datum) >= vandaag && !EIND.includes(c.fase) ? 'afspraak ' + CRM.fmtDay(c.datum) + (c.tijd?' '+c.tijd:'') : ''))}</span>
          <span class="hk-ga">→</span>
        </div>`).join('')}
      ${zonderFase ? `<div class="meta" style="margin-top:8px">${zonderFase} hiervan ${zonderFase===1?'heeft':'hebben'} geen fase
        (import uit het oude ATS) — die tellen niet mee in de funnel of het doel.</div>` : ''}
    </div>`;

    /* Zelfde streep als op het openstaande overzicht. Rood wint hier ook van
       het knelniveau: een deadline die voorbij is of vandaag valt, is het
       enige op deze kaart waar je nog vandaag iets aan kunt doen. De olijven
       rand van de nummer-1 is vervallen — die stond al als gevulde badge bij
       het cijfer, en twee keer hetzelfde is één keer te veel. */
    const knelH = KNEL[knelNiveau(volT)];
    const dlLet = rest != null && rest <= 0;
    return `<div${CRM.ui.frand(knelH.rand, 'hotcard' + (i===0?' top':'') + (open?' open':''), dlLet)} data-id="${h(v.id)}" draggable="true">
      <div class="hot-top">
        <div class="hot-prio">
          <span class="hot-nr num">${i+1}</span>
          <div class="hot-pijlen">
            <button class="pijl" data-up title="Hoger" ${i===0?'disabled':''}>▲</button>
            <button class="pijl" data-down title="Lager" ${i===n-1?'disabled':''}>▼</button>
          </div>
        </div>
        <div class="hot-wie">
          <div class="hot-titel">${h(klantLabel(v))} — ${h(v.functie || 'functie niet ingevuld')}</div>
          <div class="hot-sub">${h(locLabel(v))} · ${h(vulTekst)}${v.eigenaar?' · '+h(v.eigenaar):''}</div>
        </div>
        <div class="hot-deadline ${dlKlass}">
          <span class="dl-rest">${h(dlTekst)}</span>
          ${v.deadline ? `<span class="dl-datum num">${h(CRM.fmtDay(v.deadline))}</span>` : ''}
        </div>
      </div>
      <div class="hot-doel${gehaald?' gehaald':''}">
        <div class="doel-tekst"><span class="doel-zin">${h(zin)}</span><span class="doel-status">${status}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="hot-onder">
        <div class="hot-funnel">${segbar}<div class="hot-funtekst">${funTekst}${gepl}</div></div>
        ${afsprHtml}
        <div class="hot-acties">
          <button class="btn sub sm" data-detail>Hele vacature</button>
          <button class="btn sub sm" data-bewerk>Bewerken</button>
          <button class="btn sub sm" data-taak>+ Taak</button>
          <button class="btn sub sm" data-af>Niet meer hot</button>
        </div>
      </div>
      ${uitklap}
    </div>`;
  }

  function tekenHot(){
    const mount = M.mount;
    const vacs = hotVacs();
    if(!vacs.length){
      mount.innerHTML = CRM.ui.leeg('Nog geen hot vacatures',
        'Markeer de vacatures waar de meeste druk op zit als hot. Je stelt er een deadline en een doel bij in — bijvoorbeeld minimaal 2 voorstellen voor vrijdag — en houdt hier de voortgang bij.',
        `<button class="btn" id="hot_leeg_add">+ Hot maken</button>`);
      const b = mount.querySelector('#hot_leeg_add');
      if(b) b.onclick = hotMakenModal;
      return;
    }
    mount.innerHTML = `<div class="hotlijst" id="hotlijst">${
      vacs.map((v,i) => kaartHot(v, i, vacs.length)).join('')}</div>`;

    const lijst = mount.querySelector('#hotlijst');

    lijst.querySelectorAll('.hotcard').forEach(kaart => {
      const id = kaart.dataset.id;
      const v = CRM.state.vacs.find(x => String(x.id) === id);
      if(!v) return;

      // Klik op de kaart: uitklappen (knoppen en kandidaatrijen uitgezonderd)
      kaart.addEventListener('click', e => {
        if(e.target.closest('button')) return;
        const rij = e.target.closest('.hk-row');
        if(rij){ CRM.ga('kandidaten', {id:rij.dataset.cand}); return; }
        S.open = S.open === id ? null : id;
        tekenHot();
      });

      // Prioriteit: pijltjes
      const up = kaart.querySelector('[data-up]'), down = kaart.querySelector('[data-down]');
      const verplaats = async richting => {
        const ids = hotVacs().map(x => String(x.id));
        const i = ids.indexOf(id), j = i + richting;
        if(j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await zetVolgorde(ids);
        tekenHot(); CRM.navBadges();
      };
      if(up)   up.onclick   = e => { e.stopPropagation(); verplaats(-1); };
      if(down) down.onclick = e => { e.stopPropagation(); verplaats(1);  };

      // Beheer
      kaart.querySelector('[data-detail]').onclick = e => { e.stopPropagation(); naarDetail(id); };
      kaart.querySelector('[data-bewerk]').onclick = e => { e.stopPropagation(); instelModal(v, false); };
      kaart.querySelector('[data-taak]').onclick = e => {
        e.stopPropagation();
        CRM.taakModal({entiteit:'vacature', ref:v.id, refLabel:`${v.klant} – ${v.functie}`});
      };
      kaart.querySelector('[data-af]').onclick = async e => {
        e.stopPropagation();
        await haalUitHot(v);
      };

      // Slepen
      kaart.addEventListener('dragstart', e => {
        kaart.classList.add('drag');
        e.dataTransfer.effectAllowed = 'move';
        try{ e.dataTransfer.setData('text/plain', id); }catch(err){}
      });
      kaart.addEventListener('dragend', async () => {
        kaart.classList.remove('drag');
        const ids = Array.from(lijst.querySelectorAll('.hotcard')).map(el => el.dataset.id);
        await zetVolgorde(ids);
        tekenHot(); CRM.navBadges();
      });
    });

    lijst.addEventListener('dragover', e => {
      e.preventDefault();
      const dragEl = lijst.querySelector('.hotcard.drag');
      const over = e.target.closest('.hotcard');
      if(!dragEl || !over || over === dragEl) return;
      const r = over.getBoundingClientRect();
      lijst.insertBefore(dragEl, e.clientY > r.top + r.height/2 ? over.nextSibling : over);
    });
  }

  async function haalUitHot(v){
    const ok = await CRM.bevestig(`${v.klant || 'Deze vacature'} – ${v.functie} niet meer hot?`,
      'De vacature blijft gewoon open; alleen de deadline-druk verdwijnt van dit bord.');
    if(!ok) return false;
    if(!await bewaarVac(v, {hot:false, hot_prio:null})) return false;
    await zetVolgorde(hotVacs().map(x => String(x.id)));   // hernummeren
    if(S.open === String(v.id)) S.open = null;
    CRM.toast('Niet meer hot','ok');
    herteken(); CRM.navBadges();
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     DETAILPAGINA — de hele vacature
     ═══════════════════════════════════════════════════════════════ */

  const naarDetail = id => CRM.ga('hot', {id:String(id)});

  /* Velden uit het vacatureformulier. Sommige kolommen bestaan nog niet in
     de database; dan staan ze ook niet op de rij. Vandaar `k in v`: bestaat
     de kolom niet, dan laten we het veld weg in plaats van "niet ingevuld"
     te melden over iets wat nooit gevraagd is. */
  const DETAILVELDEN = [
    {k:'type',           lbl:'Soort opdracht'},
    {k:'contractvorm',   lbl:'Contractvorm'},
    {k:'werktijden',     lbl:'Werktijden'},
    {k:'ploegendienst',  lbl:'Ploegendienst'},
    {k:'eisen',          lbl:'Ervaring en certificaten'},
    {k:'bereikbaarheid', lbl:'Bereikbaarheid'}
  ];

  /* Wie zou kunnen passen. CRM.matchScore weegt functiewoorden en reisafstand
     — een hulpmiddel, geen oordeel, en dat staat er op het scherm ook bij.
     De pool is bewust smal: alleen mensen die klaar zijn om voorgesteld te
     worden of expliciet beschikbaar staan, en niemand die al in een traject
     bij een andere klant zit. */
  function suggesties(v, n = 6){
    const bezet = new Set(gekoppeld(v).map(c => String(c.id)));
    const inTraject = c => CRM.faseIdx(c.fase) >= 0 && !CRM.faseIn(c.fase, CRM.DONE);
    return CRM.kandidaten()
      .filter(c => !bezet.has(String(c.id)) && !inTraject(c)
                && (CRM.klaarOmVoorTeStellen(c) || CRM.isBeschikbaar(c)))
      .map(c => ({c, score:CRM.matchScore(c, v), km:CRM.afstandKm(c.woonplaats, v.locatie)}))
      .filter(m => m.score >= 40)
      .sort((a,b) => b.score - a.score)
      .slice(0, n);
  }

  function detail(v){
    const mount = M.mount, t = telling(v);
    const klantBestaat = !!(v.klant && CRM.klant(v.klant));
    const dgn = dagenOpen(v);
    const niveau = knelNiveau(t);
    const knel = KNEL[niveau];

    kopTekst(v.functie || 'Vacature',
      `${klantLabel(v)} · ${locLabel(v)}${v.eigenaar ? ' · ' + v.eigenaar : ''}`);

    /* ── Kop met de vier getallen ── */
    const statusChip = statusOpen(v)
      ? (t.teVullen ? `<span class="chip green">openstaand</span>` : `<span class="chip amber">vol, staat nog op Open</span>`)
      : `<span class="chip">${h(v.status)}</span>`;

    const kpis = `<div class="grid c4 ovd-kpi">
      ${CRM.ui.kpi('Gevraagd', `<span class="num">${t.gevraagd}</span>`,
        t.aantalBekend ? (t.gevraagd===1?'positie':'posities')
                       : 'aantal niet ingevuld — gerekend met 1')}
      ${CRM.ui.kpi('Geplaatst', `<span class="num">${t.geplaatst}</span>`,
        'contract getekend of gestart')}
      ${CRM.ui.kpi('Nog te vullen', `<span class="num">${t.teVullen}</span>`,
        t.over ? `${t.over} meer geplaatst dan gevraagd` : (t.teVullen ? 'hier is nog ruimte' : 'niets meer open'),
        t.teVullen ? '' : 'klaar')}
      ${CRM.ui.kpi('In procedure', `<span class="num">${t.bijKlant.length}</span>`,
        t.voorbereiding.length ? `plus ${t.voorbereiding.length} in voorbereiding` : 'voorgesteld bij de klant')}
    </div>`;

    /* ── Wat er loopt ── */
    const vandaag = CRM.todayISO();
    const achteraan = c => (EIND.includes(c.fase) || !heeftFase(c)) ? 1 : 0;
    const rijen = t.cands.slice().sort((a,b) =>
      achteraan(a) - achteraan(b) || CRM.faseIdx(b.fase) - CRM.faseIdx(a.fase));
    const loopt = `<section class="card">
      <div class="card-h"><div class="h2">Wie er op deze vacature loopt</div>
        <span class="meta">${t.cands.length} ${t.cands.length===1?'kandidaat':'kandidaten'}</span></div>
      <div class="card-b">
        ${!rijen.length
          ? `<p class="meta" style="margin:0">Er is nog niemand aan deze vacature gekoppeld. Koppelen gebeurt op de kandidatenkaart, bij Voorstellen.</p>`
          : rijen.map(c => `<div class="hk-row${EIND.includes(c.fase)||!heeftFase(c)?' af':''}" data-cand="${h(c.id)}">
              <i class="hot-dot" style="background:${heeftFase(c)?CRM.faseKleur(c.fase):'var(--line-2)'}"></i>
              <b>${h(c.naam)}</b>
              <span class="chip">${heeftFase(c) ? h(CRM.faseNorm(c.fase)) : 'geen fase'}</span>
              <span class="hk-actie">${h(c.volgendeActie
                  ? c.volgendeActie + (c.actieDatum ? ' · ' + CRM.fmtDateShort(c.actieDatum) : '')
                  : (c.datum && dat(c.datum) >= vandaag && !EIND.includes(c.fase)
                     ? 'afspraak ' + CRM.fmtDay(c.datum) + (c.tijd?' '+c.tijd:'') : ''))}</span>
              <span class="hk-ga">→</span></div>`).join('')}
        ${t.zonderFase ? `<p class="meta" style="margin:10px 0 0">${t.zonderFase} hiervan ${t.zonderFase===1?'heeft':'hebben'} geen fase (import uit het oude ATS) — die tellen nergens als lopend traject.</p>` : ''}
      </div></section>`;

    /* ── Wie zou kunnen passen ── */
    const sug = t.teVullen ? suggesties(v) : [];
    const passen = !t.teVullen ? '' : `<section class="card">
      <div class="card-h"><div class="h2">Wie zou kunnen passen</div></div>
      <div class="card-b">
        ${!sug.length
          ? `<p class="meta" style="margin:0">Geen beschikbare kandidaat die genoeg lijkt op deze functie en locatie.</p>`
          : `<div class="ovd-match">${sug.map(m => {
              /* Wat er over deze persoon al vastligt en hier iets betekent:
                 loopt al ergens anders, of is hier eerder afgevallen. Zie
                 CRM.kdHistorie in js/kandidaten.js. Waarschuwen, niet
                 wegfilteren — een tweede kans kan een prima zet zijn. */
              const sig = (CRM.kdHistorie ? CRM.kdHistorie.signalen(m.c, v) : [])
                .filter(s => s.k === 'elders' || s.k === 'eerder');
              return `<div class="ovd-mrij${sig.length?' let':''}" data-cand="${h(m.c.id)}">
              <span class="ovd-score num">${m.score}</span>
              <div class="ovd-mwie"><b>${h(m.c.naam)}</b>
                <span class="meta">${h(m.c.functie || 'functie onbekend')}${
                  m.c.woonplaats ? ' · ' + h(m.c.woonplaats) : ''}${
                  m.km ? ` · ${m.km} km` : ''}</span>
                ${sig.map(s => `<span class="ovd-msig">${h(s.tekst)}</span>`).join('')}</div>
              ${m.c.beschikbaar ? `<span class="chip">${h(m.c.beschikbaar)}</span>` : ''}
              <span class="hk-ga">→</span></div>`;
            }).join('')}</div>
             <p class="meta" style="margin:10px 0 0">Deze volgorde is afgeleid uit functiewoorden en reisafstand, niet ergens vastgelegd. Beoordeel zelf. De regels eronder komen wél uit vastgelegde velden: de fase en klant op de kaart, en de uitvalreden.</p>`}
      </div></section>`;

    /* ── Vacaturetekst ── */
    const tekstStukken = [
      ['De opdracht', v.omschrijving],
      ['Over het bedrijf', v.over_bedrijf],
      ['Waarom hier werken', v.waarom_hier]
    ].filter(([, w]) => String(w||'').trim());
    const tekst = `<section class="card">
      <div class="card-h"><div class="h2">Vacaturetekst</div></div>
      <div class="card-b">
        ${tekstStukken.length
          ? tekstStukken.map(([lbl, w]) =>
              `<div class="ovd-tekst"><div class="label">${h(lbl)}</div><p>${h(w).replace(/\n/g,'<br>')}</p></div>`).join('')
          : `<p class="meta" style="margin:0">Er is nog geen vacaturetekst vastgelegd. Die vul je in op de klantkaart, bij de vacature.</p>`}
      </div></section>`;

    /* ── De vacature zelf ── */
    const aanwezig = DETAILVELDEN.filter(f => f.k in v && String(v[f.k]||'').trim());
    const ontbreekt = DETAILVELDEN.filter(f => f.k in v && !String(v[f.k]||'').trim());
    const sal = salarisTekst(v);
    const web = 'web_status' in v
      ? `<div class="ovd-veld"><span class="label">Op de website</span><span>${h(v.web_status || 'Nog niet online')}${
          v.web_online_op ? ' · ' + h(CRM.fmtDate(v.web_online_op)) : ''}</span></div>` : '';
    const feiten = `<section class="card">
      <div class="card-h"><div class="h2">De vacature</div>${statusChip}${hotChip(v)}</div>
      <div class="card-b">
        <div class="ovd-veld"><span class="label">Aantal posities</span><span class="num">${t.gevraagd}${
          t.aantalBekend ? '' : ' <span class="meta">(niet ingevuld — gerekend met 1)</span>'}</span></div>
        <div class="ovd-veld"><span class="label">Locatie</span><span>${h(locLabel(v))}</span></div>
        ${sal ? `<div class="ovd-veld"><span class="label">Salarisindicatie</span><span class="num">${h(sal)}</span></div>` : ''}
        ${aanwezig.map(f => `<div class="ovd-veld"><span class="label">${h(f.lbl)}</span><span>${h(v[f.k])}</span></div>`).join('')}
        ${web}
        <div class="ovd-veld"><span class="label">Aangemaakt</span><span>${
          v.aangemaakt ? h(CRM.fmtDate(v.aangemaakt)) + (dgn != null ? ` <span class="meta">(${dgn} ${dgn===1?'dag':'dagen'} open)</span>` : '')
                       : '<span class="meta">onbekend</span>'}</span></div>
        ${v.eigenaar ? `<div class="ovd-veld"><span class="label">Accountmanager</span><span>${h(v.eigenaar)}</span></div>` : ''}
        ${ontbreekt.length ? `<p class="meta" style="margin:12px 0 0">Nog niet ingevuld: ${h(ontbreekt.map(f=>f.lbl.toLowerCase()).join(', '))}. Aanvullen doe je op de klantkaart.</p>` : ''}
      </div>
      <div class="card-f row tight">
        ${klantBestaat
          ? `<button class="btn ghost sm" id="ovd_klant">Naar de klantkaart</button>`
          : `<span class="meta">${v.klant ? h(v.klant) + ' staat niet meer in het systeem' : 'Er hangt geen klant aan deze vacature'}</span>`}
        <button class="btn sub sm" id="ovd_status">Status wijzigen</button>
      </div></section>`;

    /* ── Hot-blok ── */
    const beh = telDoel(v, t.cands), doel = Number(v.doel_aantal)||0;
    const rest = restDagen(v);
    const hotBlok = `<section class="card">
      <div class="card-h"><div class="h2">Druk en deadline</div></div>
      <div class="card-b">
        ${v.hot ? `
          <div class="ovd-veld"><span class="label">Deadline</span><span>${
            v.deadline ? h(CRM.fmtDay(v.deadline)) + (rest != null ? ` <span class="meta">(${rest < 0 ? 'gemist' : rest === 0 ? 'vandaag' : 'nog ' + rest + (rest===1?' dag':' dagen')})</span>` : '') : '<span class="meta">geen</span>'}</span></div>
          <div class="ovd-veld"><span class="label">Doel</span><span>${
            doel ? `minimaal ${doel} ${h(woord(doel, v.doel_soort))}` : '<span class="meta">nog geen doel</span>'}</span></div>
          ${doel ? `<div class="ovd-veld"><span class="label">Behaald</span><span class="num">${beh} van ${doel}</span></div>` : ''}
          <div class="ovd-veld"><span class="label">Prioriteit</span><span class="num">${v.hot_prio || '—'}</span></div>`
        : `<p class="meta" style="margin:0">Deze vacature staat niet op het hot-bord. Zet hem daarop als er een deadline op zit en je de voortgang wilt volgen.</p>`}
      </div>
      <div class="card-f row tight">
        ${v.hot
          ? `<button class="btn ghost sm" id="ovd_hotbew">Deadline en doel</button>
             <button class="btn sub sm" id="ovd_hotaf">Niet meer hot</button>`
          : `<button class="btn ghost sm" id="ovd_hotop">Hot maken</button>`}
      </div></section>`;

    /* ── Activiteit ── */
    const acts = CRM.activiteitenVoor('vacature', v.id).slice(0, 12).map(a => ({
      ico: (CRM.ACT_SOORTEN[a.soort]||{}).ico || '•',
      titel: (CRM.ACT_SOORTEN[a.soort]||{}).lbl || a.soort,
      wanneer: CRM.geleden(a.op) + (a.door ? ' · ' + a.door : ''),
      tekst: a.tekst
    }));
    const activiteit = `<section class="card">
      <div class="card-h"><div class="h2">Wat er is gebeurd</div></div>
      <div class="card-b">${CRM.ui.tijdlijn(acts)}</div>
      <div class="card-f row tight">
        <button class="btn sub sm" id="ovd_notitie">+ Notitie</button>
        <button class="btn sub sm" id="ovd_taak">+ Taak</button>
      </div></section>`;

    mount.innerHTML = `<div class="ovd">
      ${knel.lbl ? `<div class="note ${knel.kleur === 'red' ? 'err' : 'warn'} ovd-let">${h(
        niveau === 0 ? 'Er loopt niets op deze vacature — er is nog geen kandidaat gekoppeld die in een traject zit.'
        : niveau === 1 ? 'Er zijn wel kandidaten, maar er is nog niemand bij de klant voorgesteld.'
        : `Er lopen ${t.bijKlant.length} ${t.bijKlant.length===1?'kandidaat':'kandidaten'} op ${t.teVullen} openstaande ${t.teVullen===1?'positie':'posities'} — dat is krap.`)}</div>` : ''}
      ${kpis}
      <div class="ovd-body">
        <div class="ovd-kol">${loopt}${passen}${tekst}</div>
        <div class="ovd-kol">${feiten}${hotBlok}${activiteit}</div>
      </div>
    </div>`;

    // Doorstappen naar kandidaten
    CRM.$$('[data-cand]', mount).forEach(el =>
      el.onclick = () => CRM.ga('kandidaten', {id:el.dataset.cand}));

    /* De klantenmodule leest params.id, en de wáárde daarvan is de klantnaam
       (CRM.klant zoekt op naam). Geen {naam:...} dus. */
    const kl = mount.querySelector('#ovd_klant');
    if(kl) kl.onclick = () => CRM.ga('klanten', {id:v.klant});

    mount.querySelector('#ovd_status').onclick = () => statusModal(v);
    const hb = mount.querySelector('#ovd_hotbew'); if(hb) hb.onclick = () => instelModal(v, false);
    const ho = mount.querySelector('#ovd_hotop');  if(ho) ho.onclick = () => instelModal(v, true);
    const ha = mount.querySelector('#ovd_hotaf');  if(ha) ha.onclick = () => haalUitHot(v);
    mount.querySelector('#ovd_notitie').onclick = () => notitieModal(v);
    mount.querySelector('#ovd_taak').onclick = () =>
      CRM.taakModal({entiteit:'vacature', ref:v.id, refLabel:`${v.klant||'vacature'} – ${v.functie||''}`});
  }

  /* ─── Status wijzigen ────────────────────────────────────────────
     Hier omdat de status bepaalt of een vacature op dit bord staat. Wie
     ziet dat alle posities gevuld zijn, moet dat kunnen vastleggen zonder
     eerst de klantkaart op te zoeken. */
  const VAC_STATUS = ['Open','On hold','Vervuld','Gesloten'];
  function statusModal(v){
    const nu = v.status || 'Open';
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Status van de vacature</div>
        <div class="meta" style="margin-top:2px">${h(klantLabel(v))} – ${h(v.functie||'')}</div></div>
      <div class="modal-b">
        <div class="f-row"><label>Status</label>
          <select id="ov_st">${VAC_STATUS.map(s =>
            `<option value="${h(s)}"${s===nu?' selected':''}>${h(s)}</option>`).join('')}</select>
          <span class="hint">Alleen Open telt mee op dit bord. On hold, Vervuld en Gesloten verdwijnen uit het overzicht.</span></div>
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="ov_stsave">Opslaan</button>
      </div>`, {onOpen(m){
        m.querySelector('#ov_stsave').onclick = async () => {
          const nieuw = m.querySelector('#ov_st').value;
          if(nieuw === nu){ CRM.modal.close(); return; }
          if(!await bewaarVac(v, {status:nieuw})) return;
          await logActie(v, 'systeem', `Status gewijzigd van ${nu} naar ${nieuw}`);
          CRM.modal.close();
          CRM.toast('Status bijgewerkt','ok');
          herteken(); CRM.navBadges();
        };
      }});
  }

  function notitieModal(v){
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Notitie bij de vacature</div>
        <div class="meta" style="margin-top:2px">${h(klantLabel(v))} – ${h(v.functie||'')}</div></div>
      <div class="modal-b">
        <div class="f-row"><label>Wat is er te melden?</label>
          <textarea id="ov_nt" rows="4" placeholder="Bijv. klant wil er twee bij per 1 september."></textarea></div>
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="ov_ntsave">Opslaan</button>
      </div>`, {onOpen(m){
        const inp = m.querySelector('#ov_nt'); setTimeout(()=>inp.focus(), 60);
        m.querySelector('#ov_ntsave').onclick = async () => {
          const tekst = inp.value.trim();
          if(!tekst){ inp.focus(); return; }
          await logActie(v, 'notitie', tekst);
          CRM.modal.close();
          CRM.toast('Notitie opgeslagen','ok');
          herteken();
        };
      }});
  }

  /* ─── "+ Hot maken": open vacature kiezen ───────────────────── */
  function hotMakenModal(){
    const kandidaten = CRM.state.vacs.filter(v => !v.hot && statusOpen(v));
    if(!kandidaten.length){ CRM.toast('Alle open vacatures zijn al hot'); return; }
    const lijstHtml = q => {
      const t = q.trim().toLowerCase();
      const rij = kandidaten.filter(v => !t || norm([v.klant,v.functie,v.locatie].join(' ')).includes(t));
      return rij.length ? rij.map(v => {
        const tel = telling(v);
        return `<div class="hm-item" data-id="${h(v.id)}">
          <div><b>${h(klantLabel(v))} — ${h(v.functie || 'functie niet ingevuld')}</b>
          <div class="meta">${h(locLabel(v))} · nog ${tel.teVullen} van ${tel.gevraagd} te vullen</div></div>
          <span class="hk-ga">→</span>
        </div>`;
      }).join('') : `<div class="meta" style="padding:14px 4px">Geen open vacatures gevonden.</div>`;
    };
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Hot maken</div>
        <div class="meta" style="margin-top:2px">Kies de open vacature waar nu de meeste druk op zit.</div></div>
      <div class="modal-b">
        <div class="searchbox" style="margin-bottom:10px"><input type="search" id="hm_zoek" placeholder="Zoek op klant of functie"></div>
        <div class="hm-lijst" id="hm_lijst">${lijstHtml('')}</div>
      </div>
      <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
        const zoek = m.querySelector('#hm_zoek'), lijst = m.querySelector('#hm_lijst');
        setTimeout(()=>zoek.focus(), 60);
        const bind = () => m.querySelectorAll('.hm-item').forEach(el => el.onclick = () => {
          const v = CRM.state.vacs.find(x => String(x.id) === el.dataset.id);
          CRM.modal.close();
          if(v) setTimeout(() => instelModal(v, true), 180);
        });
        zoek.oninput = () => { lijst.innerHTML = lijstHtml(zoek.value); bind(); };
        bind();
      }});
  }

  /* ─── Deadline + doel instellen (nieuw of bewerken) ─────────── */
  function instelModal(v, nieuw){
    const oudAantal = v.doel_aantal, oudSoort = v.doel_soort;
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">${nieuw ? 'Hot maken' : 'Deadline en doel bewerken'}</div>
        <div class="meta" style="margin-top:2px">${h(klantLabel(v))} – ${h(v.functie||'')}</div></div>
      <div class="modal-b">
        <div class="f-grid">
          <div class="f-row"><label>Deadline</label>
            <input type="date" id="hi_deadline" value="${h(dat(v.deadline)||'')}"
              min="${h(dat(v.deadline) && dat(v.deadline) < CRM.todayISO() ? dat(v.deadline) : CRM.todayISO())}"></div>
          <div class="f-row"><label>Doel — aantal</label>
            <input type="number" id="hi_aantal" min="1" max="99" value="${h(v.doel_aantal||2)}"></div>
          <div class="f-row"><label>Doel — soort</label>
            <select id="hi_soort">
              <option value="voorstellen"${(v.doel_soort||'voorstellen')==='voorstellen'?' selected':''}>Voorstellen</option>
              <option value="gesprekken"${v.doel_soort==='gesprekken'?' selected':''}>Gesprekken</option>
              <option value="plaatsingen"${v.doel_soort==='plaatsingen'?' selected':''}>Plaatsingen</option>
            </select></div>
        </div>
        <div class="hi-preview" id="hi_preview"></div>
        <div id="hi_waarschuwing"></div>
        ${!nieuw ? `<div class="hint" style="margin-top:8px">Wijzig je het doel, dan telt de voortgang opnieuw vanaf vandaag.</div>` : ''}
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="hi_save">${nieuw ? 'Hot maken' : 'Opslaan'}</button>
      </div>`, {onOpen(m){
        const iDl = m.querySelector('#hi_deadline'), iN = m.querySelector('#hi_aantal'),
              iS = m.querySelector('#hi_soort'), prev = m.querySelector('#hi_preview'),
              waar = m.querySelector('#hi_waarschuwing');
        /* De doelsoort 'plaatsingen' meet tegen wat er nog te vullen is, niet
           tegen het totale aantal posities: op een vacature voor drie waarvan
           er al twee staan, kan er nog maar één bij. */
        const tel = telling(v);
        const ruimte = Math.max(1, tel.teVullen);
        const teken = () => {
          const n = Math.max(1, parseInt(iN.value,10)||0);
          prev.innerHTML = iDl.value
            ? `minimaal ${n} ${h(woord(n, iS.value))} voor ${h(dagLang(iDl.value))}`
            : `<span class="meta">kies een deadline om de doelzin te zien</span>`;
          /* Twee doelen die je nooit kunt halen, vóórdat je ze vastlegt:
             een deadline die al voorbij is, en meer plaatsingen dan er ruimte is. */
          const meldingen = [];
          if(iDl.value && iDl.value < CRM.todayISO())
            meldingen.push('Deze deadline ligt in het verleden — de kaart komt meteen op "deadline gemist" te staan.');
          if(iS.value === 'plaatsingen' && n > ruimte)
            meldingen.push(`Er ${ruimte===1?'is':'zijn'} nog ${ruimte} ${ruimte===1?'positie':'posities'} te vullen; ${n} plaatsingen kunnen dus niet gehaald worden.`);
          waar.innerHTML = meldingen.length
            ? `<div class="note warn" style="margin-top:8px">${meldingen.map(h).join('<br>')}</div>` : '';
        };
        [iDl,iN,iS].forEach(el => { el.oninput = teken; el.onchange = teken; });
        teken();
        m.querySelector('#hi_save').onclick = async () => {
          const deadline = iDl.value, aantal = Math.max(1, parseInt(iN.value,10)||0);
          if(!deadline){
            waar.innerHTML = `<div class="note err" style="margin-top:8px">Kies eerst een deadline — zonder deadline is er geen druk om op te sturen.</div>`;
            iDl.focus(); return;
          }
          const patch = {deadline, doel_aantal:aantal, doel_soort:iS.value};
          if(nieuw){
            patch.hot = true;
            patch.hot_prio = hotVacs().length + 1;                 // achteraan
          }
          /* doel_gezet_op is het nulpunt van de teller. Bij een nieuw doel, een
             gewijzigd doel én bij een kaart waar hij ontbreekt (oude data) zetten
             we hem — anders blijft de voortgang eeuwig op 0 staan. */
          if(nieuw || !dat(v.doel_gezet_op) || aantal !== oudAantal || iS.value !== oudSoort)
            patch.doel_gezet_op = CRM.todayISO();
          if(!await bewaarVac(v, patch)) return;
          CRM.modal.close();
          CRM.toast(nieuw ? `${v.klant || 'Deze vacature'} – ${v.functie} is nu hot` : 'Bijgewerkt', 'ok');
          herteken();
          CRM.navBadges();
        };
      }});
  }

  /* ─── Paginakop en schakelaar ───────────────────────────────── */

  /* De kop hoort te zeggen waar je bent. CRM.render() zet er de moduletitel
     neer; met drie standen in één module klopt die maar in één geval. */
  function kopTekst(titel, sub){
    const el = document.querySelector('#pagehead .ph-t');
    if(!el) return;
    el.innerHTML = `<div class="h1">${h(titel)}</div><div class="sub">${h(sub)}</div>`;
    document.title = 'Ploeggenoten CRM · ' + titel;
  }

  function tekenActies(){
    const el = M.acties;
    if(!el) return;
    if(M.vac){
      /* De O&O-sessie hoort hier, bij de vacature waarvoor je hem organiseert.
         Hij stond boven het bord Klanttrajecten, maar daar kijk je alleen —
         een sessie plannen is een handeling, en die hoort bij het ding waar
         hij over gaat. Klant, functie en locatie gaan mee, zodat je ze niet
         opnieuw hoeft te zoeken. (Tjeerd, 2 aug 2026.) */
      const v = CRM.state.vacs.find(x => String(x.id) === String(M.vac));
      el.innerHTML = `${v && CRM._rcDeel?.ooModal
          ? `<button class="btn ghost sm" id="ov_oo">+ O&amp;O-sessie</button>` : ''}
        <button class="btn ghost sm" id="ov_terug">← Alle vacatures</button>`;
      const oo = el.querySelector('#ov_oo');
      if(oo) oo.onclick = () => CRM._rcDeel.ooModal(null,
        {klant:v.klant, functie:v.functie || '', locatie:v.locatie || ''});
      el.querySelector('#ov_terug').onclick = () => CRM.ga('hot');
      return;
    }
    const w = weergave();
    el.innerHTML = `<div class="seg" id="ov_seg" role="group" aria-label="Weergave">
        <button data-w="open" class="${w==='open'?'on':''}" aria-pressed="${w==='open'}">Openstaand</button>
        <button data-w="hot" class="${w==='hot'?'on':''}" aria-pressed="${w==='hot'}">Hot</button>
      </div>
      <button class="btn ghost sm" id="ov_hotadd">+ Hot maken</button>
      ${CRM.vacatureModal ? '<button class="btn sm" id="ov_nieuw">+ Vacature</button>' : ''}`;
    CRM.$$('#ov_seg button', el).forEach(b => b.onclick = () => {
      if(weergave() === b.dataset.w) return;
      zetWeergave(b.dataset.w);
      tekenActies(); tekenLijst();
    });
    el.querySelector('#ov_hotadd').onclick = hotMakenModal;
    /* Een vacature aanmaken kon alleen vanaf de klantkaart. Maar je denkt in
       vacatures als je op dit scherm staat, niet in klanten — dan is
       doorklikken naar Relaties, de klant zoeken en dáár op de knop drukken
       een omweg. Hetzelfde venster, met een klantkeuze erin. */
    const nieuw = el.querySelector('#ov_nieuw');
    if(nieuw) nieuw.onclick = () => CRM.vacatureModal(null, null);
  }

  function tekenLijst(){
    if(weergave() === 'hot'){
      kopTekst('Hot vacatures', 'De vacatures met de meeste druk — met deadline en doel');
      tekenHot();
    }else{
      kopTekst('Openstaande vacatures', 'Alles wat nog te vullen is — gevraagd, geplaatst en wat er nog open staat');
      tekenOpen();
    }
  }

  /* Opnieuw tekenen na een wijziging, in welke stand je ook staat. */
  function herteken(){
    _idx = null;
    if(!M.mount) return;
    if(M.vac){
      const v = CRM.state.vacs.find(x => String(x.id) === String(M.vac));
      if(v){ detail(v); return; }
      CRM.ga('hot'); return;               // vacature is weg: terug naar de lijst
    }
    tekenActies(); tekenLijst();
  }

  /* ─── Registratie ───────────────────────────────────────────── */
  CRM.registerModule('hot', {
    /* Kort houden: 'Openstaande vacatures' brak over twee regels in de
       zijbalk. 'Vacatures' dekt de lading nu er een schakelaar naar Hot
       in zit — de kop van het scherm zelf blijft wél specifiek. */
    title:'Vacatures', icon:'◆',
    onderschrift:'Alles wat nog te vullen is — met een schakelaar naar hot',
    badge(){
      try{
        /* Eén set, geen optelsom: een hot vacature waar niets op loopt telt
           anders twee keer. Wat hier staat is werk dat vandaag aandacht vraagt. */
        const set = new Set();
        CRM.state.vacs.forEach(v => {
          if(isOpenstaand(v) && !telling(v).lopend.length) set.add(String(v.id));
        });
        hotVacs().forEach(v => {
          const rest = restDagen(v);
          if((rest != null && rest <= 5) || !opKoers(v)) set.add(String(v.id));
        });
        return set.size;
      }catch(e){ return 0; }
    },
    render(mount, acties, params){
      _idx = null;                       // altijd verse data bij een paginawissel
      M.mount = mount; M.acties = acties; M.vac = null;

      const id = params && params.id ? String(params.id) : '';
      if(id){
        const v = CRM.state.vacs.find(x => String(x.id) === id);
        if(v){
          M.vac = id;
          tekenActies();
          detail(v);
          return;
        }
        /* Diepe link naar een vacature die niet meer bestaat: geen lege pagina
           maar het overzicht, met uitleg waarom. */
        CRM.toast('Die vacature bestaat niet meer');
      }
      tekenActies();
      tekenLijst();
      checkMeldingen();
    }
  });
})();

/* VERZOEK AAN CORE:
   1. CRM.ga() zet alleen params.id in de hash en gebruikt replaceState. Een
      detailpagina is daardoor wel deelbaar (#hot/<id>) maar de terugknop van de
      browser slaat de stap over. Zou pushState hier kunnen?
   2. Een gedeelde CRM.voorstellen(kandidaat, vacature) zou hier veel schelen:
      js/kandidaten.js heeft die logica (fase → Voorgesteld, vacatureId zetten,
      activiteit loggen), maar er is geen aanroepbare versie. Nu kan deze module
      bij "wie zou kunnen passen" alleen dóórverwijzen naar de kandidatenkaart.

   VERZOEK AAN KLANTEN (js/klanten.js):
   3. `aangemaakt` bepaalt hier hoe lang een vacature al openstaat. Bij vacatures
      uit de oude import is dat veld leeg; de kaart zegt dan "aanmaakdatum
      onbekend". Zou het formulier die datum kunnen tonen en corrigeerbaar maken?
*/
