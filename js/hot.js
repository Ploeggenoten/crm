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
  const S = { open:null, zoek:'', sort:'knelt', mijn:false, toonRest:false, klant:'', am:'',
              dtab:'kandidaten', afvalOpen:false, tekstBewerk:false };   // stand van de vacaturekaart
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
  /* Kleurmodel afgestemd met Tjeerd (4 aug 2026, met visualisatie vooraf):
     rood is gereserveerd voor hot met deadline — toen "niets op deze
     vacature" óók rood kleurde was vrijwel het hele bord rood en betekende
     rood niets meer. Amber = knelt (hier moet iemand iets doen), géén rand
     = loopt gezond, en vervuld vraagt geen kleur: "een vervulde vacature
     hoeft geen aandacht". Grijs voor incompleet zit in kaartOpen, want dat
     is geen knelniveau maar een eigenschap van de vacaturetekst. */
  const KNEL = [
    {lbl:'niets op deze vacature',  kleur:'amber', rand:'var(--amber)'},
    {lbl:'nog niemand voorgesteld', kleur:'amber', rand:'var(--amber)'},
    {lbl:'te weinig in de pijplijn',kleur:'amber', rand:'var(--amber)'},
    {lbl:'', kleur:'',                             rand:''}
  ];
  function knelNiveau(t){
    if(!t.lopend.length)   return 0;
    if(!t.bijKlant.length) return 1;
    if(t.bijKlant.length < t.teVullen) return 2;
    return 3;
  }

  const dagenOpen = v => CRM.dagenGeleden(v.aangemaakt);

  /* Hetzelfde kleurmodel voor élke plek waar een vacature staat (Tjeerd,
     4 aug 2026: "koppel deze kleuren ook mee in de klantenkaart"). Eén
     functie, dus het bord en de klantkaart kunnen nooit iets anders
     beweren. Geeft {rand, lbl, kleur}: rand voor de streep, lbl+kleur voor
     een chip. Vervuld en gesloten zijn bewust kleurloos-gedempt. */
  CRM.vacSignaal = v => {
    const status = v.status || 'Open';
    if(status === 'Vervuld' || status === 'Gesloten')
      return {rand:'', lbl: status.toLowerCase(), kleur:'', gedempt:true};
    if(status === 'On hold') return {rand:'var(--amber)', lbl:'on hold', kleur:'amber'};
    const t = telling(v);
    if(v.hot) return {rand:'var(--red)', lbl:hotTekst(v), kleur:'red'};
    /* Er ligt een offer of het contract wordt getekend: bijna vervuld.
       Groen — bewust het enige moment dat een ópen vacature groen kleurt
       (naam: Tjeerd, 5 aug 2026). Vervuld zelf blijft gedempt. */
    if(t.lopend.some(c => CRM.faseIn(c.fase, ['Offer','Contract ondertekenen'])))
      return {rand:'var(--green)', lbl:'offer loopt — bijna vervuld', kleur:'green'};
    const niveau = knelNiveau(t);
    if(t.teVullen === 0) return {rand:'', lbl:'alle posities gevuld', kleur:'', gedempt:true};
    if(niveau < 3) return {rand:'var(--amber)', lbl:KNEL[niveau].lbl, kleur:'amber'};
    const mist = [];
    if(!String(v.locatie||'').trim()) mist.push('locatie');
    if(!salarisTekst(v)) mist.push('salaris');
    if(mist.length) return {rand:'#c2c2ba', lbl:'incompleet · ' + mist.join(' en ') + (mist.length>1?' missen':' mist'), kleur:''};
    return {rand:'', lbl:'', kleur:''};
  };

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
    /* Incompleet: de vacature mist wat de marketeer en de kandidaat nodig
       hebben. Grijs, en alleen als er verder niets knelt — een knelpunt
       weegt zwaarder dan een gat in de tekst. */
    const mist = [];
    if(!String(v.locatie||'').trim()) mist.push('locatie');
    if(!salarisTekst(v)) mist.push('salaris');
    /* Randprioriteit: rood (hot) > amber (knelt) > grijs (incompleet) >
       niets (loopt). Eén rand, één betekenis. */
    const rand = v.hot ? 'var(--red)'
               : niveau < 3 ? knel.rand
               : mist.length ? '#c2c2ba' : '';

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
      ploeg && ploeg !== 'geen' ? `<span class="chip">${h(ploeg)}</span>` : '',
      sal ? `<span class="chip num">${h(sal)}</span>` : '',
      t.over ? `<span class="chip amber">${t.over} meer geplaatst dan gevraagd</span>` : '',
      !t.aantalBekend ? `<span class="chip amber">aantal niet ingevuld</span>` : '',
      mist.length ? `<span class="chip">incompleet · ${h(mist.join(' en '))} ${mist.length>1?'missen':'mist'}</span>` : ''
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
    /* Merkkop (optie 2, Tjeerd 4 aug 2026): functie + klant links, het
       kerngetal rechts, op een getinte kop — hot in een zachte olijftint
       ("zachter, zoals de zijbalk"), niet donker. De knelchip en de balk
       leven in het witte lijf. */
    return `<article${CRM.ui.frand(rand, 'ovcard ov2' + (v.hot?' hot':''))} data-id="${h(v.id)}" tabindex="0" role="button">
      <div class="ov2-kop${v.hot?' hot':''}">
        <div class="ov2-wie">
          <div class="ov-functie">${h(v.functie || 'functie niet ingevuld')}</div>
          <div class="ov-klant">${h(klantLabel(v))} <span class="ov-punt">·</span> ${h(locLabel(v))}</div>
          ${v.hot ? `<span class="ov2-hotchip">${h(hotTekst(v))}</span>` : ''}
        </div>
        <div class="ov-vullen">
          <span class="ov-getal num">${t.teVullen}</span>
          <span class="ov-vlbl">van ${t.gevraagd} te vullen</span>
        </div>
      </div>
      <div class="ov2-lijf">
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
      </div>
    </article>`;
  }

  /* De hot-tekst zonder chipmarkup — de kop draagt hem als eigen pil. */
  function hotTekst(v){
    const rest = restDagen(v);
    return rest == null ? 'hot'
      : rest < 0 ? 'hot · deadline gemist'
      : rest === 0 ? 'hot · vandaag'
      : rest === 1 ? 'hot · nog 1 dag'
      : `hot · nog ${rest} dagen`;
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
            ${/* Eén klik om de administratie kloppend te maken: zolang de
                 status Open blijft, telt deze vacature overal mee als open
                 werk. (Tjeerd, 4 aug 2026 — er stonden er zestien zo.) */
              (v.status||'Open') === 'Open'
                ? `<button class="btn sub sm ov-vervul" data-vervul>✓ Zet op Vervuld</button>` : ''}
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
    CRM.$$('[data-vervul]', mount).forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const id = b.closest('[data-id]').dataset.id;
      const v = CRM.state.vacs.find(x => String(x.id) === String(id));
      if(!v) return;
      if(await bewaarVac(v, {status:'Vervuld'})){
        CRM.toast('Status op Vervuld gezet','ok');
        tekenOpen();
      }
    });

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
    /* Een vólle vacature knelt niet, ook al loopt er niemand meer. Zonder deze
       uitzondering kleurt "alle 2 posities gevuld · 3 geplaatst" rood, want
       knelNiveau kijkt alleen naar lopende kandidaten. Het Openstaand-overzicht
       heeft dit probleem niet — daar staan volle vacatures niet in — maar het
       hot-bord houdt ze vast tot iemand ze eraf haalt. Om dezelfde reden is een
       verstreken deadline op een volle vacature geen alarm. */
    const vol = volT.teVullen === 0;
    const knelH = vol ? KNEL[3] : KNEL[knelNiveau(volT)];
    const dlLet = !vol && rest != null && rest <= 0;
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

  /* ─── De vacaturekaart ───────────────────────────────────────────
     Variant B (keuze Tjeerd, 3 aug 2026): een smalle werkkolom links die
     blijft staan, en rechts het dossier met tabbladen. De reden voor die
     vorm: wie in Voorwaarden salarisvelden invult, moet blijven zien dat er
     nog twee posities open staan en dat er iemand twaalf dagen stilligt.

     Er is bewust GEEN tabblad "Overzicht" — de linkerkolom ís het overzicht.
     Met zo'n tabblad erbij zouden de tellers en de lopende kandidaten twee
     keer op hetzelfde scherm staan, en dan heb je de nadelen van een smaller
     dossier zonder de winst. */

  /* Fee-schatting voor deze vacature: het afgesproken percentage over een
     grondslag uit de salarisvelden van de vacature zelf. Dezelfde rekenregel
     als bij een kandidaat (CRM.fee.grondslag), dus de schatting en de latere
     echte fee kunnen niet uiteenlopen. Per vacature mag het percentage, de
     garantie en de betaaltermijn afwijken van de klantafspraak — NULL in die
     kolommen betekent "erf van de klant". */

  /* Soort opdracht → welke klantafspraak erft deze vacature. Eén klant kan
     W&S én uitzenden én detachering naast elkaar hebben; de vacature zegt
     via `type` welke hier geldt (feedback Tjeerd, 4 aug 2026: "dit moet
     gekoppeld zijn aan de afspraken met de klant"). 'Flex' is in het hele
     CRM het woord voor uitzendwerk — de opbrengst loopt via gewerkte uren. */
  const AFSPRAAKSOORT = t => t === 'Flex' ? 'uitzenden' : (t === 'Detachering' ? 'detachering' : 'ws');
  const soortLbl = k => ((CRM.fee && CRM.fee.SOORTEN || []).find(s => s.k === k) || {lbl:k}).lbl;
  function feeAfspraak(v){
    const soort = AFSPRAAKSOORT(v.type);
    const basis = (CRM.fee && CRM.fee.voorKlant) ? CRM.fee.voorKlant(v.klant, CRM.todayISO(), soort) : null;
    const a = Object.assign({}, basis || (CRM.fee ? CRM.fee.leegAfspraak() : {}));
    if(!basis) a.fee_regels = [];               /* leegAfspraak heeft 23%-vulling; zonder afspraak niets tonen */
    if(!basis) a.fee_standaard = null;
    const wijkt = [];
    if(v.fee_pct != null && v.fee_pct !== ''){ a.pct = Number(v.fee_pct); a.soort = 'vast_pct'; wijkt.push('fee'); }
    if(v.garantie_mnd != null && v.garantie_mnd !== ''){ a.garantie_mnd = Number(v.garantie_mnd); wijkt.push('garantie'); }
    if(v.betaaltermijn_dgn != null && v.betaaltermijn_dgn !== ''){ a.betaaltermijn = Number(v.betaaltermijn_dgn); wijkt.push('betaaltermijn'); }
    return {a, wijkt, heeftKlantAfspraak: !!basis, soort};
  }
  function feeSchatting(v){
    if(!CRM.magOpbrengstZien() || !CRM.fee) return null;
    /* Flex: de opbrengst is marge over gewerkte uren, geen eenmalige fee —
       een W&S-schatting zou hier een bedrag beloven dat nooit gefactureerd
       wordt (zelfde les als CRM.fee.geenFeeReden). */
    if(v.type === 'Flex') return {fee:null, flex:true};
    try{
      const {a} = feeAfspraak(v);
      const pseudo = { maandloon: v.sal_max != null ? Number(v.sal_max) : (v.sal_min != null ? Number(v.sal_min) : null),
                       vtPct: v.vt_pct == null ? null : Number(v.vt_pct),
                       toeslagPct: v.toeslag_pct == null ? null : Number(v.toeslag_pct),
                       ejuPct: v.eju_pct == null ? null : Number(v.eju_pct) };
      const gr = CRM.fee.grondslag(pseudo, a);
      const p  = CRM.fee.pctVoor ? CRM.fee.pctVoor(pseudo, a) : {pct: a.pct};
      if(!gr.compleet || p.pct == null) return {fee:null};
      return {fee: Math.round(gr.jaarSalaris * p.pct / 100), pct: p.pct, grondslag: gr.jaarSalaris};
    }catch(e){ return {fee:null}; }
  }

  /* De opsommingsblokken van de vacaturetekst zijn platte tekst met één punt
     per regel — precies zoals ze op ploeggenoten.nl staan. */
  const regels = t => String(t||'').split('\n').map(r => r.trim()).filter(Boolean);
  const lijstHtml = t => { const r = regels(t);
    return r.length ? `<ul>${r.map(x => `<li>${h(x)}</li>`).join('')}</ul>` : ''; };

  /* De salarisregel van "Wat krijg je" komt uit de salarisvelden, niet uit de
     tekst. Eén bron: op de website stond bovenaan "Tot €4.000" en in het blok
     "€2.400 – €3.000" over dezelfde vacature — dat kan hiermee niet meer. */
  function salarisRegel(v){
    const sal = salarisTekst(v);
    return sal ? sal + ' per maand' : '';
  }

  function detail(v){
    const mount = M.mount, t = telling(v);
    const klantBestaat = !!(v.klant && CRM.klant(v.klant));
    const dgn = dagenOpen(v);
    const niveau = knelNiveau(t);
    const knel = KNEL[niveau];
    const vandaag = CRM.todayISO();
    const geld = CRM.magOpbrengstZien();

    kopTekst(v.functie || 'Vacature',
      `${klantLabel(v)} · ${locLabel(v)}${v.eigenaar ? ' · ' + v.eigenaar : ''}`);

    /* ── Linkerkolom: het werk ── */
    const fs = geld ? feeSchatting(v) : null;
    const feeRij = !geld ? ''
      : (fs && fs.flex)
        ? `<div class="ovd-mini"><span>Opbrengst</span><span class="meta">flex — marge via gewerkte uren</span></div>`
      : (fs && fs.fee != null)
        ? `<div class="ovd-mini"><span>Fee bij vulling</span><span class="num">${h(CRM.euro(fs.fee * Math.max(1, t.teVullen)))}</span></div>`
        : `<div class="ovd-mini"><span>Fee bij vulling</span><span class="meta">vul salaris in</span></div>`;
    const contact = v.contact_id
      ? (CRM.state.contacten || []).find(ct => String(ct.id) === String(v.contact_id)) : null;

    const openTaken = (CRM.state.taken || [])
      .filter(x => x.entiteit === 'vacature' && String(x.ref) === String(v.id) && !x.klaar)
      .sort((a,b) => String(a.datum||'9').localeCompare(String(b.datum||'9')));

    const statusChip = statusOpen(v)
      ? (t.teVullen ? `<span class="chip green">openstaand</span>` : `<span class="chip amber">vol, staat nog op Open</span>`)
      : `<span class="chip">${h(v.status)}</span>`;

    /* Incompleet hoort op de kaart zélf te staan — niet meer als blok op
       de relatiekaart (Tjeerd, 5 aug 2026: "hier is rust nodig"). */
    const mist = [];
    if(!String(v.locatie||'').trim()) mist.push('locatie');
    if(!salarisTekst(v)) mist.push('salaris');

    const links = `
      <div class="card ovd-blok${CRM.ui && knel.rand ? '' : ''}"${knel.rand ? ` style="border-left:3px solid ${h(knel.rand)}"` : ''}>
        <div class="card-b">
          <div class="label">Nog te vullen</div>
          <div class="ovd-groot num">${t.teVullen}</div>
          <div class="meta" style="margin-top:4px">van ${t.gevraagd}${t.geplaatst ? ` · ${t.geplaatst} geplaatst` : ''}${
            t.aantalBekend ? '' : ' · aantal niet ingevuld'}</div>
          ${knel.lbl || mist.length ? `<div style="margin-top:9px" class="row tight">
            ${knel.lbl ? `<span class="chip ${knel.kleur}">${h(knel.lbl)}</span>` : ''}
            ${mist.length ? `<span class="chip">incompleet · ${h(mist.join(' en '))} ${mist.length>1?'missen':'mist'}</span>` : ''}
          </div>` : ''}
        </div></div>

      ${/* Alles hier is aan te passen door élke AM — er was geen poort,
           er was gewoon geen invoer (Tjeerd, 5 aug 2026: "alles moet
           aanpasbaar zijn in de vacature"). Klik op een waarde = bewerken,
           Enter of wegklikken = opslaan, Escape = laten staan. */''}
      <div class="card ovd-blok"><div class="card-b">
        <div class="label">Deze vacature</div>
        <div class="ovd-minis">
          <div class="ovd-mini"><span>Functie</span><span class="ovd-edit" data-vedit="functie" title="Klik om aan te passen">${h(v.functie || 'invullen…')}</span></div>
          <div class="ovd-mini"><span>Klant</span><span>${klantBestaat
            ? `<a href="#" id="ovd_klant">${h(v.klant)}</a>` : h(v.klant || '—')}</span></div>
          <div class="ovd-mini"><span>Locatie</span><span class="ovd-edit" data-vedit="locatie" title="Klik om aan te passen">${h(locLabel(v))}</span></div>
          <div class="ovd-mini"><span>Gevraagd</span><span class="ovd-edit num" data-vedit="aantal" data-num="1" title="Klik om aan te passen">${h(String(Number(v.aantal)||1))}</span></div>
          <div class="ovd-mini"><span>Accountmanager</span><span class="ovd-edit" data-vedit="eigenaar" title="Klik om aan te passen">${h(v.eigenaar || 'invullen…')}</span></div>
          ${/* Wie gaat er bij de klant over déze vacature? Zonder dit moest
               de AM eerst naar de relatiekaart om te zien wie hij belt
               (Tjeerd, 6 aug 2026). De rij staat er ook als er nog niemand
               gekoppeld is — anders valt er niets te koppelen. */''}
          <div class="ovd-mini"><span>Contactpersoon</span><span class="ovd-edit" data-vcontact title="Klik om te koppelen">${
            contact ? h(contact.naam) + (contact.functie ? ` <span class="meta">${h(contact.functie)}</span>` : '')
                    : '<span class="meta" style="font-style:italic">koppelen…</span>'}</span></div>
          ${contact && (contact.telefoon || contact.email) ? `<div class="ovd-mini"><span>Bereikbaar</span><span>${
            [contact.telefoon ? `<a href="tel:${h(String(contact.telefoon).replace(/\s/g,''))}">${h(contact.telefoon)}</a>` : '',
             contact.email ? `<a href="mailto:${h(contact.email)}">${h(contact.email)}</a>` : ''].filter(Boolean).join(' · ')
          }</span></div>` : ''}
          <div class="ovd-mini"><span>Open sinds</span><span class="num">${
            v.aangemaakt ? h(CRM.fmtDateShort(v.aangemaakt)) + (dgn != null ? ` · ${dgn} dgn` : '') : '—'}</span></div>
          ${feeRij}
          <div class="ovd-mini"><span>Status</span><span>${statusChip}${hotChip(v)}</span></div>
        </div>
      </div></div>

      <!-- Bijzonderheden: wat de AM moet onthouden bij déze vacature
           (naam: Tjeerd, 5 aug 2026). Het zijn de gewone vacature-notities
           (crm_activiteiten) — die stonden alleen verstopt achter "+ Notitie"
           en het Historie-tabblad; nu staan ze in beeld en typ je er direct
           in. Enter legt vast. -->
      <div class="card ovd-blok"><div class="card-b">
        <div class="label">Bijzonderheden</div>
        <textarea id="ovd_bijz" rows="2" style="width:100%;margin-top:6px;resize:vertical;font-size:12.5px"
          placeholder="Waar moet je aan denken bij deze vacature? Enter = vastleggen"></textarea>
        ${(() => {
          const nts = CRM.activiteitenVoor('vacature', v.id).filter(a => a.soort === 'notitie')
            .slice().sort((a,b) => String(b.op||'').localeCompare(String(a.op||''))).slice(0, 5);
          return nts.length ? `<div class="ovd-bijzlijst">${nts.map(n => `
            <div class="ovd-bijzrij"><span>${h(n.tekst)}</span>
              <span class="meta">${h(n.door||'')} · ${h(CRM.fmtDateShort(n.op))}</span></div>`).join('')}</div>` : '';
        })()}
      </div></div>

      <div class="card ovd-blok"><div class="card-b">
        <div class="label">Wie loopt er nu</div>
        ${t.lopend.length ? `<div class="ovd-namen">${t.lopend.map(c =>
          `<div class="ovd-naam" data-cand="${h(c.id)}"${CRM.ui.frand ? '' : ''} style="border-left:3px solid ${h(CRM.faseKleur(c.fase))};padding-left:9px">
            <b>${h(c.naam)}</b><span class="meta">${h(CRM.faseNorm(c.fase))}</span></div>`).join('')}</div>`
          : `<p class="meta" style="margin:6px 0 0">Nog niemand — koppelen gebeurt op de kandidatenkaart, of via "Zou hierop passen" hiernaast.</p>`}
        ${t.geplaatst ? `<div class="meta" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">${t.geplaatst} geplaatst</div>` : ''}
      </div></div>

      ${openTaken.length ? `<div class="card ovd-blok"><div class="card-b">
        <div class="label">Volgende stap</div>
        <div style="font-size:13px;margin-top:4px">${h(openTaken[0].tekst)}</div>
        <div class="meta num" style="margin-top:2px">${openTaken[0].datum ? h(CRM.fmtDateShort(openTaken[0].datum)) : 'geen datum'}${
          openTaken[0].wie ? ' · ' + h(openTaken[0].wie) : ''}</div>
      </div></div>` : ''}

      <div class="row tight ovd-acties">
        <button class="btn ghost sm" id="ovd_status">Status</button>
        ${v.hot ? `<button class="btn ghost sm" id="ovd_hotbew">Deadline</button>`
                : `<button class="btn ghost sm" id="ovd_hotop">Hot maken</button>`}
        <button class="btn sub sm" id="ovd_notitie">+ Notitie</button>
        <button class="btn sub sm" id="ovd_taak">+ Taak</button>
        <span class="spacer"></span>
        ${/* Verwijderen hoort bij een vacature die niets meer toevoegt —
             dat is iets anders dan Vervuld of Gesloten (die blijven als
             geschiedenis staan). Bewust achteraan en gedempt: het is de
             uitzondering, niet de dagelijkse knop. */''}
        <button class="btn sub sm ovd-weg" id="ovd_weg">Verwijderen</button>
      </div>`;

    /* ── Tabbladen ── */
    const TABS = [
      ['kandidaten', `Kandidaten`, t.cands.length],
      /* De teller staat er zodat je zonder klikken ziet dát er sessies staan —
         een gepland gesprek is nieuws, een leeg tabblad niet. */
      ['oo', 'O&O-sessies', CRM.oo ? CRM.oo.bijVacature(v.id).length : 0],
      ['voorwaarden', 'Voorwaarden', 0],
      ['tekst', 'Vacaturetekst', 0],
      ['documenten', 'Documenten', (CRM.state.documenten||[]).filter(d => d.entiteit==='vacature' && String(d.ref)===String(v.id)).length],
      ['historie', 'Historie', 0]
    ];
    const tabbalk = `<div class="tabs ovd-tabs">${TABS.map(([k, lbl, n]) =>
      `<button class="tab${S.dtab===k?' on':''}" data-dtab="${k}">${h(lbl)}${n ? ` <span class="cnt num">${n}</span>` : ''}</button>`).join('')}</div>`;

    mount.innerHTML = `<div class="ovd ovd-b">
      <div class="ovd-werk">${links}</div>
      <div class="card ovd-doss">
        ${tabbalk}
        <div class="ovd-binnen" id="ovd_tab"></div>
      </div>
    </div>`;

    tekenTab(v);

    CRM.$$('[data-dtab]', mount).forEach(b => b.onclick = () => {
      S.dtab = b.dataset.dtab;
      CRM.$$('[data-dtab]', mount).forEach(x => x.classList.toggle('on', x.dataset.dtab === S.dtab));
      tekenTab(v);
    });
    CRM.$$('.ovd-werk [data-cand]', mount).forEach(el =>
      el.onclick = () => CRM.ga('kandidaten', {id:el.dataset.cand}));
    const kl = mount.querySelector('#ovd_klant');
    if(kl) kl.onclick = e => { e.preventDefault(); CRM.ga('klanten', {id:v.klant}); };
    mount.querySelector('#ovd_status').onclick = () => statusModal(v);
    const hb = mount.querySelector('#ovd_hotbew'); if(hb) hb.onclick = () => instelModal(v, false);
    const ho = mount.querySelector('#ovd_hotop');  if(ho) ho.onclick = () => instelModal(v, true);
    mount.querySelector('#ovd_notitie').onclick = () => notitieModal(v);
    /* Bijzonderheden: direct typen, Enter legt vast (Shift+Enter = nieuwe regel). */
    { const bz = mount.querySelector('#ovd_bijz');
      if(bz) bz.onkeydown = async e => {
        if(e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        const tekst = bz.value.trim();
        if(!tekst) return;
        await logActie(v, 'notitie', tekst);
        CRM.toast('Vastgelegd','ok');
        herteken();
      }; }
    mount.querySelector('#ovd_taak').onclick = () =>
      CRM.taakModal({entiteit:'vacature', ref:v.id, refLabel:`${v.klant||'vacature'} – ${v.functie||''}`});

    /* Vacature verwijderen (Tjeerd, 5 aug 2026: "bijvoorbeeld als ze niet
       van toegevoegde waarde zijn"). De kandidaten zelf blijven bestaan —
       alleen de vacature en haar koppeling verdwijnen. De oude knop zat in
       het bewerkformulier, maar dat is sinds "Bewerken → vacaturekaart"
       onbereikbaar; daarom staat hij nu hier. */
    mount.querySelector('#ovd_weg').onclick = async () => {
      const nKand = t.cands.length;
      const ok = await CRM.bevestig('Vacature verwijderen?',
        `${v.functie||'Vacature'}${v.klant ? ' bij ' + v.klant : ''} verdwijnt definitief.` +
        (nKand ? ` De ${nKand === 1 ? 'gekoppelde kandidaat blijft' : nKand + ' gekoppelde kandidaten blijven'} gewoon bestaan.` : ''),
        {gevaarlijk:true, knop:'Ja, verwijderen'});
      if(!ok) return;
      if(!CRM.demo){
        const {error} = await CRM.sb.from('vacatures').delete().eq('id', v.id);
        if(error){ CRM.fout('Verwijderen mislukt', error); return; }
      }
      CRM.state.vacs = (CRM.state.vacs||[]).filter(x => String(x.id) !== String(v.id));
      CRM.toast('Vacature verwijderd','ok');
      /* Vervangen, niet toevoegen: "vorige" zou terugsturen naar de
         vacature die je net verwijderd hebt. */
      CRM.ga('hot', {}, {vervang:true});
    };

    /* Klik-om-te-bewerken op de zijbalk. Bewust géén modal en géén poort:
       Tjerk en Rajesh moeten hier altijd bij kunnen, ook als de commerciële
       afspraken nog niet staan (Tjeerd, 5 aug 2026). Enter/wegklikken =
       opslaan, Escape = laten staan; daarna tekent de kaart opnieuw zodat
       ook kop, signaalkleur en incompleet-chip meteen kloppen. */
    CRM.$$('[data-vedit]', mount).forEach(el => el.onclick = () => {
      const veld = el.dataset.vedit;
      const inp = document.createElement('input');
      inp.type = el.dataset.num ? 'number' : 'text';
      if(el.dataset.num) inp.min = '1';
      inp.className = 'ovd-inp';
      inp.value = veld === 'aantal' ? String(Number(v.aantal)||1) : String(v[veld]||'');
      el.replaceWith(inp);
      inp.focus(); inp.select();
      let klaar = false;
      const sluit = async bewaren => {
        if(klaar) return; klaar = true;
        const w = inp.value.trim();
        /* Alleen opslaan als er echt iets veranderde — anders geen
           schrijfactie en geen hertekening nodig. */
        const oud = veld === 'aantal' ? String(Number(v.aantal)||1) : String(v[veld]||'');
        if(bewaren && w !== oud){
          const patch = veld === 'aantal' ? {aantal: Math.max(1, Math.round(Number(w))||1)} : {[veld]: w};
          await bewaarVac(v, patch);
        }
        detail(v);
      };
      inp.onblur = () => sluit(true);
      inp.onkeydown = e => {
        if(e.key === 'Enter'){ e.preventDefault(); sluit(true); }
        if(e.key === 'Escape'){ e.preventDefault(); sluit(false); }
      };
    });

    /* Contactpersoon koppelen: een keuzelijst uit de contactpersonen van
       déze klant. Apart van data-vedit, want de waarde is een id en het
       label een naam — dat past niet in de vrije-tekst-route. */
    const ctEl = mount.querySelector('[data-vcontact]');
    if(ctEl) ctEl.onclick = () => {
      const cts = (CRM.state.contacten || []).filter(c => c.klant === v.klant);
      if(!cts.length){
        CRM.toast('Deze relatie heeft nog geen contactpersonen — voeg er eerst één toe op de relatiekaart');
        return;
      }
      const sel = document.createElement('select');
      sel.className = 'ovd-inp';
      sel.innerHTML = `<option value="">— niemand gekoppeld —</option>` + cts.map(c =>
        `<option value="${h(String(c.id))}"${String(c.id) === String(v.contact_id||'') ? ' selected' : ''}>${
          h(c.naam)}${c.functie ? ' · ' + h(c.functie) : ''}</option>`).join('');
      ctEl.replaceWith(sel);
      sel.focus();
      let klaar = false;
      const sluit = async bewaren => {
        if(klaar) return; klaar = true;
        const nieuw = sel.value || null;
        if(bewaren && String(nieuw || '') !== String(v.contact_id || ''))
          await bewaarVac(v, {contact_id: nieuw});
        detail(v);
      };
      sel.onchange = () => sluit(true);
      sel.onblur = () => sluit(true);
      sel.onkeydown = e => { if(e.key === 'Escape'){ e.preventDefault(); sluit(false); } };
    };
  }

  function tekenTab(v){
    const el = M.mount.querySelector('#ovd_tab');
    if(!el) return;
    const teken = {kandidaten:tabKandidaten, oo:tabOO, voorwaarden:tabVoorwaarden,
                   tekst:tabTekst, documenten:tabDocumenten, historie:tabHistorie}[S.dtab] || tabKandidaten;
    teken(el, v);
  }

  /* ── Tab: Kandidaten ── */
  function tabKandidaten(el, v){
    const t = telling(v);
    const vandaag = CRM.todayISO();

    const lopendRij = c => {
      const dg = CRM.dagenGeleden(c.since);
      const stil = dg != null && dg > 7 && !CRM.faseIn(c.fase, CRM.PLACED);
      const actie = c.volgendeActie
        ? c.volgendeActie + (c.actieDatum ? ' · ' + CRM.fmtDateShort(c.actieDatum) : '')
        : (c.datum && dat(c.datum) >= vandaag ? 'afspraak ' + CRM.fmtDay(c.datum) + (c.tijd?' '+c.tijd:'') : '');
      return `<div class="ovd-krij" data-cand="${h(c.id)}" style="border-left:3px solid ${h(CRM.faseKleur(c.fase))}">
        <b>${h(c.naam)}</b>
        <span class="chip">${h(CRM.faseNorm(c.fase))}</span>
        <span class="spacer"></span>
        ${actie ? `<span class="meta">${h(actie)}</span>` : ''}
        ${stil ? `<span class="chip red num">${dg} dgn stil</span>` : (dg != null ? `<span class="meta num">${dg} dgn</span>` : '')}
      </div>`;
    };

    /* De afvallers als één regel met de redenen, niet als rijen tussen de
       lopende kandidaten. Drie afwijzingen op één vacature is een diagnose
       van de vacature (tarief, eisen, reistijd) — geen kandidaatruis, maar
       ook geen gezelschap voor de mensen die er nog wél lopen.
       (Tjeerd, 3 aug 2026: "deze doen er niet meer toe en geven alleen maar
       ruis" — de datá blijft, het lawaai gaat weg.) */
    const afvallers = t.cands.filter(c => CRM.faseIn(c.fase, EIND));
    const perReden = {};
    afvallers.forEach(c => {
      const r = c.fase === 'Gestopt' ? (c.stopCat || 'gestopt') : (c.afvalCat || 'geen reden vastgelegd');
      perReden[r] = (perReden[r] || 0) + 1;
    });
    const redenTekst = Object.entries(perReden).sort((a,b) => b[1]-a[1])
      .map(([r, n]) => `${n}× ${r.toLowerCase()}`).join(' · ');

    const sug = t.teVullen ? suggesties(v) : [];

    el.innerHTML = `
      <div class="label" style="margin-bottom:8px">Loopt nu · ${t.lopend.length}</div>
      <div class="card ovd-lijstje" style="margin-bottom:18px">
        ${t.lopend.length
          ? t.lopend.slice().sort((a,b) => CRM.faseIdx(b.fase) - CRM.faseIdx(a.fase)).map(lopendRij).join('')
          : `<div class="card-b"><p class="meta" style="margin:0">Er loopt nog niemand op deze vacature.</p></div>`}
        ${t.zonderFase ? `<div class="card-b" style="border-top:1px solid var(--line)"><span class="meta">${t.zonderFase} gekoppeld zonder fase (import oud ATS) — telt nergens als lopend.</span></div>` : ''}
      </div>

      ${afvallers.length ? `
      <div class="label" style="margin-bottom:8px">Eerder afgevallen · ${afvallers.length}</div>
      <div class="card ovd-lijstje" style="margin-bottom:18px">
        <div class="card-b ovd-afval">
          <span style="font-size:13px">${h(redenTekst)}</span>
          <span class="spacer"></span>
          <button class="btn ghost sm" id="ovd_afvaltoon">${S.afvalOpen ? 'Verberg namen' : 'Toon namen'} ${S.afvalOpen ? '↑' : '→'}</button>
        </div>
        ${S.afvalOpen ? afvallers.map(c => `<div class="ovd-krij af" data-cand="${h(c.id)}" style="border-left:3px solid var(--line-2)">
          <b>${h(c.naam)}</b>
          <span class="chip">${h(c.fase)}</span>
          <span class="spacer"></span>
          <span class="meta">${h(c.fase === 'Gestopt' ? (c.stopCat || '') : (c.afvalCat || ''))}${c.reden ? ' · "' + h(c.reden) + '"' : ''}</span>
        </div>`).join('') : ''}
      </div>` : ''}

      ${(() => {
        /* Kandidaten die hier "ook in beeld" staan (crm_sollicitaties):
           hun hoofdtraject loopt elders, maar de AM heeft ze bewust op deze
           vacature gezet. Hoofdtraject maken doe je op de kandidatenkaart. */
        const soll = (CRM.state.sollicitaties || [])
          .filter(r => String(r.vacature_id) === String(v.id))
          .map(r => CRM.kandidaat(r.kandidaat_id)).filter(Boolean);
        return soll.length ? `
          <div class="label" style="margin-bottom:8px">Ook in beeld · ${soll.length}</div>
          <div class="card ovd-lijstje" style="margin-bottom:18px">${soll.map(c => `
            <div class="ovd-krij" data-cand="${h(c.id)}">
              <b>${h(c.naam)}</b>
              <span class="meta">${h([CRM.faseNorm(c.fase) || 'geen fase', c.klant ? 'traject bij ' + c.klant : ''].filter(Boolean).join(' · '))}</span>
              <span class="spacer"></span>
              ${c.beschikbaar ? `<span class="chip">${h(c.beschikbaar)}</span>` : ''}
            </div>`).join('')}</div>` : '';
      })()}
      <div class="label" style="margin-bottom:8px">Zou hierop passen · uit de kaartenbak</div>
      <div class="card ovd-lijstje">
        ${!t.teVullen
          ? `<div class="card-b"><p class="meta" style="margin:0">Alle posities zijn gevuld — er valt niets meer te werven.</p></div>`
        : sug.length
          ? sug.map(m => {
              const sig = (CRM.kdHistorie ? CRM.kdHistorie.signalen(m.c, v) : [])
                .filter(x => x.k === 'elders' || x.k === 'eerder');
              return `<div class="ovd-krij${sig.length ? ' let' : ''}" data-cand="${h(m.c.id)}">
                <span class="ovd-score num">${m.score}</span>
                <b>${h(m.c.naam)}</b>
                <span class="meta">${h(m.c.functie || '')}${m.c.woonplaats ? ' · ' + h(m.c.woonplaats) : ''}${m.km ? ` · ${m.km} km` : ''}</span>
                <span class="spacer"></span>
                ${sig.map(x => `<span class="chip amber">${h(x.tekst)}</span>`).join('')}
                ${m.c.beschikbaar ? `<span class="chip">${h(m.c.beschikbaar)}</span>` : ''}
              </div>`;
            }).join('') + `<div class="card-b" style="border-top:1px solid var(--line);background:var(--well)">
              <span class="meta">Volgorde uit functiewoorden en reisafstand — hulpmiddel, geen oordeel. Voorstellen doe je op de kandidatenkaart.</span></div>`
          : `<div class="card-b"><p class="meta" style="margin:0">Geen beschikbare kandidaat die genoeg op deze functie en locatie lijkt.</p></div>`}
      </div>`;

    CRM.$$('[data-cand]', el).forEach(x => x.onclick = () => CRM.ga('kandidaten', {id:x.dataset.cand}));
    const at = el.querySelector('#ovd_afvaltoon');
    if(at) at.onclick = () => { S.afvalOpen = !S.afvalOpen; tabKandidaten(el, v); };
  }

  /* ── Inline bewerken op de kaart ──────────────────────────────
     Elke waarde op Voorwaarden en elk tekstblok is klikbaar en verandert ter
     plekke in een invoerveld — geen formulier ertussen. (Tjeerd, 4 aug 2026:
     "dit kan je niet aanpassen en is niet aanklikbaar. De vacaturekaart moet
     invulbaar zijn dus.") Zelfde patroon als de kandidatenkaart: klik, typ,
     Enter of blur = opslaan, Escape = annuleren. */
  function inlineVeld(el, v, veld, type, naKlaar){
    const oud = v[veld] == null ? '' : String(v[veld]);
    /* 'keuze:A,B,C' → een select in plaats van vrije tekst. Voor velden
       waar alleen vaste waarden kloppen (soort opdracht: de rest van het
       CRM herkent precies W&S, Detachering en Flex). */
    /* 'keuzegetal:' is dezelfde lijst, maar de gekozen waarde gaat als
       getal de database in — garantie en betaaltermijn zijn numerieke
       kolommen; een string zou daar stilletjes stuklopen. */
    const keuzeGetal = !!(type && type.startsWith('keuzegetal:'));
    const keuzes = type && /^keuze(getal)?:/.test(type) ? type.slice(type.indexOf(':') + 1).split(',') : null;
    const inp = document.createElement(keuzes ? 'select' : type === 'tekst' ? 'textarea' : 'input');
    if(keuzes){
      inp.innerHTML = [''].concat(keuzes).map(o =>
        `<option value="${h(o)}"${o === oud ? ' selected' : ''}>${o ? h(o) : '—'}</option>`).join('');
    }
    else if(type === 'tekst'){ inp.rows = Math.max(3, oud.split('\n').length + 1); }
    else inp.type = type === 'getal' ? 'number' : 'text';
    if(!keuzes && type === 'getal') inp.step = 'any';
    inp.value = oud;
    inp.className = 'ovd-inline';
    el.replaceChildren(inp);
    inp.focus();
    if(inp.select) try{ inp.select(); }catch(e){}
    let klaar = false;
    const bewaar = async () => {
      if(klaar) return; klaar = true;
      const ruw = inp.value;
      const waarde = (type === 'getal' || keuzeGetal)
        ? (String(ruw).trim() === '' ? null : Number(ruw)) : ruw.trim();
      if(String(waarde == null ? '' : waarde) === oud){ naKlaar(); return; }
      await bewaarVac(v, {[veld]: waarde});
      naKlaar();
    };
    inp.onkeydown = e => {
      if(e.key === 'Escape'){ klaar = true; naKlaar(); }
      /* In een textarea is Enter een nieuwe regel; opslaan is daar Cmd/Ctrl+Enter. */
      if(e.key === 'Enter' && (type !== 'tekst' || e.metaKey || e.ctrlKey)){ e.preventDefault(); bewaar(); }
    };
    if(keuzes) inp.onchange = bewaar;      /* kiezen = klaar, niet nog eens wegklikken */
    inp.onblur = bewaar;
  }

  /* Vaste keuzelijsten voor de Voorwaarden. Vrije tekst gaf twintig
     schrijfwijzen van hetzelfde ("2 ploegen", "2-ploegendienst",
     "tweeploegen") en daar valt niets op te filteren of te vergelijken
     (Tjeerd, 6 aug 2026: "er moeten meer dropdowns zijn"). Let op: de
     komma scheidt de opties, dus geen komma's ín een optie. */
  const KEUZE = {
    reiskosten:     'keuze:Geen vergoeding,Kilometervergoeding,Volledig vergoed,OV volledig vergoed,Vaste vergoeding per dag,In overleg',
    uren:           'keuze:40,38,36,32,24,20,16,In overleg',
    ploegendienst:  'keuze:Geen,2-ploegen,3-ploegen,4-ploegen,5-ploegen,Wisselend,Alleen nachtdienst',
    contractvorm:   'keuze:Direct in dienst bij de klant,Tijdelijk met uitzicht op vast,Uitzendcontract,Detachering,ZZP / opdracht,Oproep / 0-uren',
    bereikbaarheid: 'keuze:Alleen met eigen vervoer,Eigen vervoer een pré,Goed bereikbaar met OV,Met OV en fiets,Niet met OV bereikbaar',
    garantie:       'keuzegetal:0,1,2,3,6',
    betaaltermijn:  'keuzegetal:14,30,45,60'
  };

  /* ── Tab: Voorwaarden ── */
  function tabVoorwaarden(el, v){
    const geld = CRM.magOpbrengstZien();
    const {a, wijkt, heeftKlantAfspraak, soort} = feeAfspraak(v);
    const flex = v.type === 'Flex';
    const fs = geld ? feeSchatting(v) : null;
    /* `veld` erbij maakt een rij klikbaar-bewerkbaar; zonder veld (de
       afgeleide waarden zoals de grondslag) blijft hij alleen-lezen. */
    const rij = (lbl, val, leeg='invullen…', veld='', type='') => `<div class="ovd-veld"><span class="label">${h(lbl)}</span>
      <span${veld ? ` class="ovd-klik" data-vv="${h(veld)}|${h(type||'tekst1')}" tabindex="0" role="button" title="Klik om te bewerken"` : ''}>${
        val || `<span class="meta" style="font-style:italic">${h(leeg)}</span>`}</span></div>`;
    const num = w => (w == null || w === '') ? '' : `<span class="num">${h(String(w))}</span>`;
    const euroBereik = (a2, b2) => (a2 == null && b2 == null) ? ''
      : `<span class="num">${a2 != null ? CRM.euro(a2) : '…'} – ${b2 != null ? CRM.euro(b2) : '…'}</span>`;
    /* Waar komt deze waarde vandaan? Drie mogelijkheden, en de AM moet ze
       uit elkaar kunnen houden (Tjeerd, 6 aug 2026): geërfd van de
       klantafspraak, hier bewust anders gezet, of er is simpelweg niets.
       Zonder klantafspraak tonen we niets — een geërfde "2 mnd" die
       nergens is afgesproken leest als een afspraak die niet bestaat. */
    const afwChip = k => wijkt.includes(k)
      ? ' <span class="chip amber">alleen deze vacature</span>'
      : (heeftKlantAfspraak ? ' <span class="chip green">uit klantafspraak</span>' : '');
    /* Een waarde uit de klantafspraak alleen tonen als die afspraak er is;
       anders is het een standaardwaarde uit de code en geen afspraak. */
    const geerfd = (k, w) => (wijkt.includes(k) || heeftKlantAfspraak) ? w : null;

    /* Welke fee-regel hoort bij déze functie? pctVoor kijkt naar de
       functiegroepen in de klantafspraak ("operators 22%, teamleiders
       25%") en zegt er zelf bij waaróm die regel past. Precies wat de
       AM hier moet zien in plaats van één plat percentage. */
    const pv = (heeftKlantAfspraak && CRM.fee && CRM.fee.pctVoor)
      ? CRM.fee.pctVoor({functie: v.functie}, a) : null;
    const feeLabelVan = p => !p ? ''
      : p.vorm === 'vast'    ? (p.bedrag  != null ? CRM.euro(p.bedrag) + ' vast' : '')
      : p.vorm === 'maanden' ? (p.maanden != null ? String(p.maanden).replace('.', ',') + '× maandsalaris' : '')
      : (p.pct != null ? String(p.pct).replace('.', ',') + '%' : '');
    /* Eigen percentage op de vacature wint altijd van de klantafspraak. */
    const feeEigen = wijkt.includes('fee');
    const feeWaarde = feeEigen ? num(a.pct + '%') : (pv ? num(feeLabelVan(pv)) : '');
    const feeChip = feeEigen ? ' <span class="chip amber">alleen deze vacature</span>'
      : (pv && pv.bron === 'regel' && pv.functiegroep
          ? ` <span class="chip green">uit klantafspraak · ${h(pv.functiegroep)}</span>`
          : (pv && pv.pct != null || pv && pv.bedrag != null || pv && pv.maanden != null
              ? ' <span class="chip green">uit klantafspraak</span>' : ''));

    el.innerHTML = `
      ${heeftKlantAfspraak || !geld ? '' : `<div class="note warn" style="margin-bottom:14px">Er is nog geen ${h(soortLbl(soort))}-afspraak met ${h(v.klant || 'deze klant')} vastgelegd. Zolang die ontbreekt valt er hier niets te erven — leg hem vast op de klantkaart bij Commerciële afspraken.</div>`}
      <div class="ovd-kols2">
        <div>
          <div class="label" style="margin-bottom:6px">Salaris</div>
          ${rij('Uurloon vanaf', v.uurloon_min != null ? num(CRM.euro(v.uurloon_min)) : '', 'invullen…', 'uurloon_min', 'getal')}
          ${rij('Uurloon tot', v.uurloon_max != null ? num(CRM.euro(v.uurloon_max)) : '', 'invullen…', 'uurloon_max', 'getal')}
          ${rij('Maandloon vanaf', v.sal_min != null ? num(CRM.euro(v.sal_min)) : '', 'invullen…', 'sal_min', 'getal')}
          ${rij('Maandloon tot', v.sal_max != null ? num(CRM.euro(v.sal_max)) : '', 'invullen…', 'sal_max', 'getal')}
          ${rij('Vakantiegeld %', v.vt_pct != null ? num(v.vt_pct + '%') : '', 'invullen…', 'vt_pct', 'getal')}
          ${rij('Ploegentoeslag %', v.toeslag_pct != null ? num(v.toeslag_pct + '%') : '', 'invullen…', 'toeslag_pct', 'getal')}
          ${rij('13e maand / eju %', v.eju_pct != null ? num(v.eju_pct + '%') : '', 'invullen…', 'eju_pct', 'getal')}
          ${rij('Reiskosten', v.reiskosten ? h(v.reiskosten) : '', 'kiezen…', 'reiskosten', KEUZE.reiskosten)}
          <div class="label" style="margin:16px 0 6px">Rooster en contract</div>
          ${rij('Werktijden', v.werktijden ? h(v.werktijden) : '', '06:00–14:30, ma t/m vr', 'werktijden')}
          ${rij('Uren per week', v.uren ? h(v.uren) : '', 'kiezen…', 'uren', KEUZE.uren)}
          ${rij('Ploegendienst', v.ploegendienst ? h(v.ploegendienst) : '', 'kiezen…', 'ploegendienst', KEUZE.ploegendienst)}
          ${rij('Contractvorm', v.contractvorm ? h(v.contractvorm) : '', 'kiezen…', 'contractvorm', KEUZE.contractvorm)}
        </div>
        <div>
          <div class="label" style="margin-bottom:6px">Afspraak met de klant</div>
          ${rij('Dienstverlening', (v.type ? h(v.type) : '') + (heeftKlantAfspraak && geld
              ? ` <span class="chip green">volgt ${h(soortLbl(soort))}-afspraak</span>` : ''),
            'kiezen…', 'type', 'keuze:W&S,Detachering,Flex')}
          ${!geld ? '' : flex ? `
          ${rij('Factor', feeEigen ? num(String(a.pct).replace('.', ',') + '×')
              : (pv && pv.pct != null ? num(String(pv.pct).replace('.', ',') + '×') : ''), 'geen afspraak')}
          ${rij('Overname na', geerfd('overname', a.overname_uren) != null ? num(a.overname_uren + ' uur') : '', 'geen grens')}
          ${rij('Betaaltermijn (dgn)', (geerfd('betaaltermijn', a.betaaltermijn) ? num(a.betaaltermijn + ' dagen') : '') + afwChip('betaaltermijn'), 'kiezen…', 'betaaltermijn_dgn', KEUZE.betaaltermijn)}
          <p class="meta" style="margin:10px 0 16px">Flex: de opbrengst loopt via de marge op gewerkte uren, niet via een eenmalige fee. Factor en overnamegrens komen uit de uitzendafspraak op de klantkaart.</p>` : `
          ${rij('Fee bij vulling', feeWaarde + feeChip, 'geen afspraak', 'fee_pct', 'getal')}
          ${rij('Garantie (mnd)', (geerfd('garantie', a.garantie_mnd) ? num(a.garantie_mnd + ' mnd') : '') + afwChip('garantie'), 'kiezen…', 'garantie_mnd', KEUZE.garantie)}
          ${rij('Betaaltermijn (dgn)', (geerfd('betaaltermijn', a.betaaltermijn) ? num(a.betaaltermijn + ' dagen') : '') + afwChip('betaaltermijn'), 'kiezen…', 'betaaltermijn_dgn', KEUZE.betaaltermijn)}
          ${fs && fs.fee != null ? rij('Grondslag (schatting)', num(CRM.euro(fs.grondslag))) + rij('Fee per plaatsing', num(CRM.euro(fs.fee))) : ''}
          ${pv && pv.uitleg ? `<p class="meta" style="margin:10px 0 0">${h(pv.uitleg)}</p>` : ''}
          <p class="meta" style="margin:6px 0 16px">Leeg = geërfd van de ${h(soortLbl(soort))}-afspraak met de klant. Vul je hier iets in, dan geldt dat alleen voor deze vacature — de klantafspraak zelf blijft staan.</p>`}
          <div class="label" style="margin-bottom:6px">Eisen</div>
          ${rij('Ervaring en certificaten', v.eisen ? h(v.eisen).replace(/\n/g,'<br>') : '', 'één eis per regel', 'eisen', 'tekst')}
          ${rij('Bereikbaarheid', v.bereikbaarheid ? h(v.bereikbaarheid) : '', 'kiezen…', 'bereikbaarheid', KEUZE.bereikbaarheid)}
        </div>
      </div>
      <p class="meta" style="margin-top:16px">Klik op een waarde om hem te bewerken — Enter of wegklikken is opslaan, Escape is annuleren.</p>`;

    /* Klik op een waarde → invoerveld ter plekke. Na het opslaan hertekent
       het tabblad, zodat de afgeleide regels (grondslag, fee, chips
       standaard/afwijkend) meteen meebewegen. */
    CRM.$$('[data-vv]', el).forEach(sp => {
      const start = () => {
        const [veld, type] = sp.dataset.vv.split('|');
        /* De dienstverlening stuurt óók de linkerkolom (fee bij vulling) —
           daarna dus de hele kaart hertekenen, niet alleen dit tabblad.
           S.dtab onthoudt dat we op Voorwaarden staan. */
        const naKlaar = veld === 'type' ? () => detail(v) : () => tabVoorwaarden(el, v);
        inlineVeld(sp, v, veld, type === 'tekst1' ? '' : type, naKlaar);
      };
      sp.onclick = start;
      sp.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); start(); } };
    });
  }

  /* ── Tab: Vacaturetekst ── */
  /* Eén vrij tekstveld in plaats van vijf vaste blokken (naam: Tjeerd,
     5 aug 2026: "ik wil gewoon 1 leeg veld waarin ik alles kan plakken",
     bijvoorbeeld een complete Indeed-tekst). De tekst leeft in de
     bestaande kolom `omschrijving`; wat er eerder in de losse blokken
     stond wordt bij de eerste keer openen samengevoegd voorgezet, zodat
     er niets verloren gaat. Opslaan gaat vanzelf: twee tellen na het
     laatste getypte teken, en meteen bij het verlaten van het veld. */
  /* Een geplakte Indeed-tekst is één blok platte tekst. Die tonen we als
     een net document: koppen als koppen, opsommingen als opsommingen.
     We verzínnen geen structuur — we herkennen alleen wat er al staat, en
     wat we niet herkennen blijft gewoon een regel. Zo leest de AM een
     vacature in plaats van een tekstveld (Tjeerd, 6 aug 2026: "dit is
     voor de AM zo niet overzichtelijk"). */
  const KOP_MAX = 60;
  function isKop(t){
    if(!t || t.length > KOP_MAX) return false;
    /* HOOFDLETTERKOP: "OVER HET BEDRIJF", "WAT WIJ VRAGEN". */
    if(t.length > 2 && /[A-ZÀ-Ý]/.test(t) && !/[a-zà-ÿ]/.test(t)) return true;
    /* "Werktijden:", "Ploegrooster:" — kort en eindigend op een dubbele
       punt. "Let op: je wordt verwacht…" valt hier bewust buiten: die
       heeft de dubbele punt middenin en is dus een zin, geen kop. */
    return /:$/.test(t) && t.split(/\s+/).length <= 5 && !/[.!?]/.test(t.slice(0, -1));
  }
  const isPunt = t => /^[-•*–·▪]\s*\S/.test(t);

  function tekstDocHtml(tekst){
    const rs = String(tekst || '').split('\n').map(r => r.replace(/\s+$/, ''));
    let uit = '', lijst = [], para = [];
    const spoelLijst = () => { if(lijst.length){
      uit += `<ul class="ovd-doc-l">${lijst.map(x => `<li>${h(x)}</li>`).join('')}</ul>`; lijst = []; } };
    const spoelPara = () => { if(para.length){
      uit += `<p>${para.map(h).join('<br>')}</p>`; para = []; } };
    const spoel = () => { spoelLijst(); spoelPara(); };
    for(const ruw of rs){
      const t = ruw.trim();
      if(!t){ spoel(); continue; }
      if(isKop(t)){ spoel(); uit += `<h4 class="ovd-doc-k">${h(t.replace(/:$/, ''))}</h4>`; continue; }
      if(isPunt(t)){ spoelPara(); lijst.push(t.replace(/^[-•*–·▪]\s*/, '')); continue; }
      spoelLijst(); para.push(t);
    }
    spoel();
    return uit;
  }

  function tabTekst(el, v){
    const salaris = salarisRegel(v);
    /* Oude blokken samenvoegen als er nog geen vrije tekst is. */
    const oud = () => [
      String(v.openingszin||'').trim(),
      String(v.over_bedrijf||'').trim() ? 'OVER HET BEDRIJF\n' + String(v.over_bedrijf).trim() : '',
      regels(v.de_baan).length ? 'DIT IS DE BAAN\n' + regels(v.de_baan).join('\n') : '',
      regels(v.eisen).length ? 'WAT WIJ VRAGEN\n' + regels(v.eisen).join('\n') : '',
      regels(v.wat_krijg_je).length ? 'WAT KRIJG JE\n' + regels(v.wat_krijg_je).join('\n') : ''
    ].filter(Boolean).join('\n\n');
    const tekst = String(v.omschrijving || '').trim() || oud();
    /* Zonder tekst valt er niets te lezen — dan meteen het invoerveld,
       anders kijk je naar een lege bladzijde met een knop erboven. */
    const bewerk = S.tekstBewerk || !tekst;

    const salRegel = salaris
      ? `<p class="meta" style="margin:0 0 12px">Het salarisveld op Voorwaarden zegt: <b>${h(salaris)}</b> — houd de tekst daarmee in lijn.</p>` : '';

    if(!bewerk){
      el.innerHTML = `
        <div class="row tight" style="margin-bottom:12px">
          <button class="btn sm" id="ovd_tekstbew">Bewerken</button>
          <span class="spacer"></span>
        </div>
        ${salRegel}
        <div class="ovd-doc">${tekstDocHtml(tekst)}</div>`;
      el.querySelector('#ovd_tekstbew').onclick = () => { S.tekstBewerk = true; tabTekst(el, v); };
      return;
    }

    el.innerHTML = `
      <p class="meta" style="margin:0 0 12px">Plak of typ hier de volledige vacaturetekst — bijvoorbeeld rechtstreeks uit Indeed.
        Een regel in HOOFDLETTERS of een kort woord met een dubbele punt erachter wordt een kopje; regels die met - of • beginnen worden opsommingen.</p>
      ${salRegel}
      <textarea id="ovd_vrijtekst" rows="24" style="width:100%;resize:vertical;font-size:13px;line-height:1.55"
        placeholder="Plak hier de hele vacaturetekst…">${h(tekst)}</textarea>
      <div class="row tight" style="margin-top:12px">
        <button class="btn sm" id="ovd_tekstok">Opslaan</button>
        <button class="btn ghost sm" id="ovd_tekstaf">Annuleren</button>
      </div>`;

    const ta = el.querySelector('#ovd_vrijtekst');
    el.querySelector('#ovd_tekstok').onclick = async () => {
      const nieuw = ta.value.trim();
      if(nieuw !== tekst && !(await bewaarVac(v, {omschrijving: nieuw}))) return;
      S.tekstBewerk = false;
      CRM.toast('Vacaturetekst opgeslagen', 'ok');
      detail(v);                 /* ook de kop en de signalen kunnen meebewegen */
    };
    el.querySelector('#ovd_tekstaf').onclick = async () => {
      /* Typwerk weggooien is onomkeerbaar — dus alleen na een ja. */
      if(ta.value.trim() !== tekst && !(await CRM.bevestig('Wijzigingen weggooien?',
        'De tekst die je net hebt getypt gaat verloren.', {gevaarlijk:true, knop:'Ja, weggooien'}))) return;
      S.tekstBewerk = false;
      tabTekst(el, v);
    };
  }

  /* De oude blokweergave, bewaard onder een andere naam voor het geval we
     ooit terug willen — wordt nergens meer aangeroepen. */
  function tabTekstBlokkenOud(el, v){
    const BLOKKEN = [
      ['openingszin',  'Openingszin',      '',       'De regel die op de website direct onder de functietitel staat.'],
      ['over_bedrijf', 'Over het bedrijf', 'tekst',  'Lopende tekst — wie de klant is, zonder de naam te noemen.'],
      ['de_baan',      'Dit is de baan',   'lijst',  'Eén punt per regel.'],
      ['eisen',        'Wat wij vragen',   'lijst',  'Eén punt per regel. Staat er niets? "Geen ervaring nodig" is ook informatie.'],
      ['wat_krijg_je', 'Wat krijg je',     'lijst',  'Eén punt per regel — het salaris komt er vanzelf boven uit Voorwaarden.']
    ];
    const salaris = salarisRegel(v);

    const blokHtml = ([veld, lbl, vorm, hint]) => {
      const w = String(v[veld] || '').trim();
      let binnen;
      if(!w){
        binnen = `<p class="meta" style="font-style:italic;margin:0">invullen… <span style="font-style:normal">— ${h(hint)}</span></p>`;
      }else if(vorm === 'lijst'){
        const extra = veld === 'wat_krijg_je' && salaris
          ? `<li>${h(salaris)}<span class="meta"> — uit het salarisveld</span></li>` : '';
        binnen = `<ul>${extra}${regels(w).map(x => `<li>${h(x)}</li>`).join('')}</ul>`;
      }else{
        binnen = `<p>${h(w).replace(/\n/g,'<br>')}</p>`;
      }
      /* De salarisregel hoort óók zichtbaar te zijn als het blok verder leeg
         is — anders lijkt het alsof er geen salaris op de site komt. */
      if(veld === 'wat_krijg_je' && !w && salaris)
        binnen = `<ul><li>${h(salaris)}<span class="meta"> — uit het salarisveld</span></li></ul>` + binnen;
      return `<div class="ovd-tblok">
        <div class="ovd-tblokkop"><span class="label">${h(lbl)}</span>
          <span class="row tight">
            ${w ? `<button class="btn ghost sm" data-kopieer="${h(veld)}">Kopieer</button>` : ''}
            <button class="btn ghost sm" data-bewerk="${h(veld)}">${w ? 'Bewerken' : 'Invullen'}</button>
          </span></div>
        <div class="ovd-tinhoud" data-blok="${h(veld)}">${binnen}</div>
      </div>`;
    };

    el.innerHTML = `
      <p class="meta" style="margin:0 0 12px">De blokken zoals ze op ploeggenoten.nl staan — klik op een blok om het in te vullen. De salarisregel in "Wat krijg je" komt uit het salarisveld op Voorwaarden: één bron, dus de website kan nooit iets anders zeggen dan het CRM.</p>
      ${BLOKKEN.map(blokHtml).join('')}
      ${v.omschrijving && !BLOKKEN.some(([veld]) => String(v[veld]||'').trim())
        ? `<div class="ovd-tblok"><div class="ovd-tblokkop"><span class="label">Omschrijving (oud veld)</span></div><p>${h(v.omschrijving).replace(/\n/g,'<br>')}</p></div>` : ''}
      <div class="row tight" style="margin-top:14px">
        <button class="btn sm" id="ovd_kopalles">Kopieer de hele tekst</button>
        <span class="meta">Voor de website: alles onder elkaar, met de koppen erbij.</span>
      </div>`;

    const bewerk = veld => {
      const doel = el.querySelector(`[data-blok="${veld}"]`);
      if(!doel) return;
      inlineVeld(doel, v, veld, veld === 'openingszin' ? '' : 'tekst', () => tabTekst(el, v));
    };
    CRM.$$('[data-bewerk]', el).forEach(b => b.onclick = () => bewerk(b.dataset.bewerk));
    CRM.$$('.ovd-tinhoud', el).forEach(d => d.onclick = e => {
      if(e.target.closest('.ovd-inline')) return;   // al aan het typen
      bewerk(d.dataset.blok);
    });

    const pak = veld => veld === 'wat_krijg_je'
      ? [salaris].filter(Boolean).concat(regels(v.wat_krijg_je)).join('\n')
      : String(v[veld] || '');
    CRM.$$('[data-kopieer]', el).forEach(b => b.onclick = async e => {
      e.stopPropagation();
      try{ await navigator.clipboard.writeText(pak(b.dataset.kopieer)); CRM.toast('Gekopieerd', 'ok'); }
      catch(err){ CRM.toast('Kopiëren lukte niet — selecteer de tekst zelf', 'err'); }
    });
    el.querySelector('#ovd_kopalles').onclick = async () => {
      const alles = [
        String(v.openingszin||'').trim(),
        String(v.over_bedrijf||'').trim() ? 'OVER HET BEDRIJF\n' + String(v.over_bedrijf).trim() : '',
        regels(v.de_baan).length ? 'DIT IS DE BAAN\n' + regels(v.de_baan).join('\n') : '',
        regels(v.eisen).length ? 'WAT WIJ VRAGEN\n' + regels(v.eisen).join('\n') : '',
        (salaris || regels(v.wat_krijg_je).length)
          ? 'WAT KRIJG JE\n' + [salaris].filter(Boolean).concat(regels(v.wat_krijg_je)).join('\n') : ''
      ].filter(Boolean).join('\n\n');
      try{ await navigator.clipboard.writeText(alles); CRM.toast('Hele tekst gekopieerd', 'ok'); }
      catch(e){ CRM.toast('Kopiëren lukte niet', 'err'); }
    };
  }

  /* ── Tab: Documenten ── */
  function tabDocumenten(el, v){
    const docs = (CRM.state.documenten || [])
      .filter(d => d.entiteit === 'vacature' && String(d.ref) === String(v.id))
      .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));
    el.innerHTML = `
      <p class="meta" style="margin:0 0 12px">Functieprofiel, veiligheidsinstructie, plattegrond — wat een kandidaat of een collega nodig heeft vóór de eerste dag.</p>
      ${docs.length ? `<div class="card ovd-lijstje" style="margin-bottom:14px">${docs.map(d => `
        <div class="ovd-krij" data-doc="${h(d.id)}">
          <b>${h(d.naam || 'Document')}</b>
          <span class="chip">${h(d.soort || 'overig')}</span>
          <span class="spacer"></span>
          <span class="meta num">${h(CRM.fmtDateShort(d.op))}${d.door ? ' · ' + h(d.door) : ''}</span>
        </div>`).join('')}</div>` : `<p class="meta" style="margin:0 0 14px">Nog geen documenten aan deze vacature gekoppeld.</p>`}
      <button class="btn sm" id="ovd_docnieuw">Document koppelen</button>`;

    /* Openen via CRM.opslag: de link wordt pas bij de klik gemaakt en alles
       wat geen bestand is wordt geweigerd — zelfde regel als overal. */
    CRM.$$('[data-doc]', el).forEach(x => x.onclick = () => {
      const d = docs.find(y => String(y.id) === x.dataset.doc);
      if(d && CRM.opslag && CRM.opslag.open) CRM.opslag.open(d.url);
    });
    const nw = el.querySelector('#ovd_docnieuw');
    if(nw) nw.onclick = () => docModal(v, () => tabDocumenten(el, v));
  }

  function docModal(v, naKlaar){
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Document koppelen</div>
        <div class="meta" style="margin-top:2px">${h(klantLabel(v))} – ${h(v.functie||'')}</div></div>
      <div class="modal-b"><div class="f-grid">
        <div class="f-row"><label>Naam</label><input type="text" id="vd_naam" placeholder="Bijv. Functieprofiel CNC"></div>
        <div class="f-row"><label>Soort</label><select id="vd_soort">
          <option>functieprofiel</option><option>veiligheidsinstructie</option><option>overig</option></select></div>
        <div class="f-row"><label>Link of pad</label><input type="text" id="vd_url" placeholder="SharePoint-link of pad in de opslag"></div>
      </div></div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="vd_ok">Koppelen</button>
      </div>`, {onOpen(m){
        m.querySelector('#vd_ok').onclick = async () => {
          const rij = { id: CRM.uid(), entiteit:'vacature', ref:String(v.id),
                        naam: m.querySelector('#vd_naam').value.trim() || 'Document',
                        soort: m.querySelector('#vd_soort').value,
                        url: m.querySelector('#vd_url').value.trim(),
                        door: CRM.me(), op: new Date().toISOString() };
          CRM.state.documenten = CRM.state.documenten || [];
          CRM.state.documenten.unshift(rij);
          if(!CRM.demo){
            const {error} = await CRM.sb.from('crm_documenten').insert(rij);
            if(error){ CRM.toast('Opslaan mislukte: ' + error.message, 'err'); return; }
          }
          CRM.modal.close(); CRM.toast('Document gekoppeld', 'ok');
          if(naKlaar) naKlaar();
        };
      }});
  }

  /* ═══════════════════════════════════════════════════════════════
     TAB: O&O-SESSIES — de vacaturekaart is de thuisbasis

     WAAROM een eigen tabblad en geen blok in de linkerrail: de rail is het
     overzicht dát blijft staan terwijl je in het dossier werkt — nog te
     vullen, wie er loopt, de volgende stap. Een sessie beheren is geen
     overzicht maar dossierwerk: een lijst sessies, per sessie de deelnemers,
     en twee vensters om te plannen en te koppelen. Dat duwt in de smalle rail
     precies de cijfers weg waarvoor die rail bestaat. Rechts staat het al
     naast Voorwaarden, Documenten en Historie — daar hoort het bij. De teller
     in het tabblad zorgt dat je zonder klikken ziet dát er sessies zijn.

     Alles loopt via CRM.oo (js/data.js). De vacaturekaart, de relatiekaart en
     de kandidatenkaart delen die laag; zou dit scherm zelf naar oo_sessions
     schrijven, dan zouden ze weer uit elkaar kunnen lopen.
     ═══════════════════════════════════════════════════════════════ */

  /* Vier per sessie is de streef, geen grens: een vijfde weigeren zou de
     werkelijkheid tegenspreken (er komt er soms eentje bij). We tellen het
     wel, zodat je ziet wanneer je er nog drie moet regelen. */
  const OO_STREEF = 4;

  /* Wie er ooit in de sessie zat, niet wie er nu nog in die fase staat: na een
     geslaagde sessie schuift iedereen door en zou de sessie anders als leeg
     tellen. Zie CRM.oo.deelnemers/leden. */
  const ooDeel = s => CRM.oo.deelnemers(s.id);

  /* Bezetting in één regel. Vrije plekken zijn alleen zinnig zolang de sessie
     nog moet komen — bij een sessie van vorige week is "nog 2 plekken vrij"
     onzin, dan telt alleen wie er geweest is. */
  function ooBezetting(s, n){
    const geweest = s.datum && dat(s.datum) < CRM.todayISO();
    if(geweest) return `<span class="chip">${n} ${n === 1 ? 'deelnemer' : 'deelnemers'}</span>`;
    if(!n) return `<span class="chip amber">nog niemand · ${OO_STREEF} plekken vrij</span>`;
    const vrij = OO_STREEF - n;
    if(vrij > 0) return `<span class="chip">${n} van ${OO_STREEF} · nog ${vrij} ${vrij === 1 ? 'plek' : 'plekken'} vrij</span>`;
    if(vrij === 0) return `<span class="chip green">${n} van ${OO_STREEF} · vol</span>`;
    return `<span class="chip">${n} van ${OO_STREEF} · meer dan de streef</span>`;
  }

  function tabOO(el, v){
    if(!CRM.oo){ el.innerHTML = `<p class="meta" style="margin:0">O&amp;O-sessies zijn hier nog niet beschikbaar.</p>`; return; }
    const sessies = CRM.oo.bijVacature(v.id);
    const vandaag = CRM.todayISO();

    const sessieHtml = s => {
      const vacs = CRM.oo.vacatures(s);
      const deel = ooDeel(s);
      const geweest = s.datum && dat(s.datum) < vandaag;
      /* De functiechips staan er alleen bij een sessie met méér dan één
         vacature: je staat al op deze vacature, die naam nog eens herhalen
         voegt niets toe. Bij twee of meer moet je zien voor wélke functies er
         mensen komen — dat is precies waarom extra_vacatures bestaat. */
      const functieChips = vacs.length > 1
        ? `<div class="row tight oo-vacs">${vacs.map(x =>
            `<span class="chip oo-vac${String(x.id) === String(v.id) ? ' nu' : ''}">${
              h(x.functie || 'vacature')}</span>`).join('')}</div>`
        : '';

      const deelHtml = deel.length
        ? deel.map(c => {
            /* Voor wélke functie komt deze persoon? Alleen tonen als de sessie
               meerdere vacatures draagt — anders is het antwoord bekend. */
            const vac = vacs.length > 1 && c.vacatureId
              ? vacs.find(x => String(x.id) === String(c.vacatureId)) : null;
            return `<div class="oo-drij">
              <a href="#" class="oo-naam" data-oonaar="${h(c.id)}">${h(c.naam)}</a>
              <span class="chip">${h(CRM.faseNorm(c.fase) || 'geen fase')}</span>
              ${vac ? `<span class="meta">voor ${h(vac.functie || 'vacature')}</span>` : ''}
              <span class="spacer"></span>
              <button type="button" class="btn sub sm oo-los" data-oolos="${h(c.id)}">Loskoppelen</button>
            </div>`;
          }).join('')
        : `<p class="meta" style="margin:0">Nog niemand ingepland — ${OO_STREEF} plekken vrij.</p>`;

      return `<div class="card oo-sessie${geweest ? ' geweest' : ''}">
        <div class="card-b">
          <div class="oo-kop">
            <div>
              <div class="oo-wanneer">${h(s.datum ? dagLang(s.datum) : 'geen datum')}${
                s.tijd ? ` <span class="num">${h(s.tijd)}</span>` : ''}</div>
              <div class="meta">${h(CRM.oo.locatie(s) || 'locatie niet ingevuld')}</div>
            </div>
            <span class="spacer"></span>
            ${geweest ? `<span class="chip">geweest</span>` : ''}
            ${ooBezetting(s, deel.length)}
          </div>
          ${functieChips}
          <div class="oo-deel">${deelHtml}</div>
          <div class="row tight oo-acties">
            <button class="btn sm" data-ooadd="${h(String(s.id))}">+ Kandidaat</button>
            <button class="btn ghost sm" data-oobew="${h(String(s.id))}">Wijzigen</button>
            <span class="spacer"></span>
            <button class="btn sub sm ovd-weg" data-ooweg="${h(String(s.id))}">Verwijderen</button>
          </div>
        </div>
      </div>`;
    };

    el.innerHTML = `
      <p class="meta" style="margin:0 0 12px">Een O&amp;O-sessie wordt gehouden óp deze vacature en vervangt het voorstellen én beide gesprekken. Streef: ${OO_STREEF} kandidaten per sessie. Iemand koppelen zet hem meteen op de fase <b>O&amp;O sessie</b>.</p>
      ${sessies.length
        ? `<div class="oo-lijst">${sessies.map(sessieHtml).join('')}</div>`
        : `<div class="card ovd-lijstje" style="margin-bottom:14px"><div class="card-b">
             <p class="meta" style="margin:0">Er staat nog geen sessie voor deze vacature gepland.</p></div></div>`}
      <button class="btn sm" id="ovd_oonieuw">Sessie plannen</button>`;

    el.querySelector('#ovd_oonieuw').onclick = () => ooPlanModal(v, null);
    CRM.$$('[data-oobew]', el).forEach(b => b.onclick = () => ooPlanModal(v, b.dataset.oobew));
    CRM.$$('[data-ooadd]', el).forEach(b => b.onclick = () => ooKoppelModal(v, b.dataset.ooadd));
    CRM.$$('[data-oonaar]', el).forEach(a => a.onclick = e => {
      e.preventDefault(); CRM.ga('kandidaten', {id:a.dataset.oonaar});
    });

    CRM.$$('[data-oolos]', el).forEach(b => b.onclick = async () => {
      const c = CRM.kandidaat(b.dataset.oolos);
      if(!c) return;
      const ok = await CRM.bevestig('Loskoppelen van de sessie?',
        `${c.naam} staat daarna niet meer op deze O&O-sessie. De kandidaat zelf blijft gewoon bestaan.`,
        {knop:'Ja, loskoppelen'});
      if(!ok) return;
      await CRM.oo.ontkoppel(c.id);
      CRM.toast('Losgekoppeld','ok');
      naOOWijziging();
    });

    CRM.$$('[data-ooweg]', el).forEach(b => b.onclick = async () => {
      const s = CRM.oo.van(b.dataset.ooweg);
      if(!s) return;
      const n = ooDeel(s).length;
      const ok = await CRM.bevestig('O&O-sessie verwijderen?',
        `${CRM.oo.label(s)} verdwijnt.` +
        (n ? ` ${n === 1 ? 'De gekoppelde kandidaat raakt' : `De ${n} gekoppelde kandidaten raken`} los van de sessie; de kaarten blijven staan.` : ''),
        {gevaarlijk:true, knop:'Ja, verwijderen'});
      if(!ok) return;
      await CRM.oo.verwijder(s.id);
      CRM.toast('Sessie verwijderd','ok');
      naOOWijziging();
    });
  }

  /* Na elke wijziging: terug naar het tabblad waar je was en de hele kaart
     opnieuw tekenen. De teller in het tabblad, de fases in "Wie loopt er nu"
     en de sessielijst veranderen alle drie mee — los bijwerken zou ze uit
     elkaar laten lopen. */
  function naOOWijziging(){ S.dtab = 'oo'; herteken(); }

  /* ── Sessie plannen of wijzigen ──────────────────────────────────
     De hoofdvacature staat vast: je plant de sessie vanaf de vacature waar hij
     over gaat, dus die hoef je niet te kiezen. Wat je wél kiest zijn de extra
     vacatures — voor als er kandidaten voor een andere functie van dezelfde
     klant bij zitten. Klant, functie en locatie komen uit de vacature; alleen
     een afwijkende locatie leg je hier vast. */
  function ooPlanModal(v, sid){
    const s = sid ? CRM.oo.van(sid) : null;
    /* Bij het wijzigen van een sessie die op een ándere vacature is gepland
       (deze vacature hangt er dan als extra aan) blijft die hoofdvacature de
       hoofdvacature — hem hier stilletjes verplaatsen zou de sessie van de
       andere kaart laten verdwijnen. */
    const hoofd = (s && CRM.oo.vacature(s)) || v;
    const extraNu = new Set(((s && Array.isArray(s.extra_vacatures)) ? s.extra_vacatures : []).map(String));
    /* De andere open vacatures van dezelfde klant. Een vacature die al aan de
       sessie hangt blijft in de lijst staan, ook als hij inmiddels gesloten
       is — anders verdwijnt hij bij het opslaan zonder dat iemand dat koos. */
    const andere = (CRM.state.vacs || []).filter(x =>
      String(x.id) !== String(hoofd.id) && x.klant === hoofd.klant &&
      (statusOpen(x) || extraNu.has(String(x.id))));

    CRM.modal.open(`
      <div class="modal-h"><div class="h2">O&amp;O-sessie ${s ? 'wijzigen' : 'plannen'}</div>
        <div class="meta" style="margin-top:2px">${h(klantLabel(hoofd))} · ${h(hoofd.functie || 'vacature')}</div></div>
      <div class="modal-b" style="max-height:70vh;overflow-y:auto">
        <div class="f-grid">
          <div class="f-row"><label for="oo_datum">Datum</label>
            <input type="date" id="oo_datum" value="${h(dat(s && s.datum) || '')}"></div>
          <div class="f-row"><label for="oo_tijd">Tijd</label>
            <input type="time" id="oo_tijd" value="${h((s && s.tijd) || '')}"></div>
        </div>
        <div class="f-row"><label for="oo_loc">Locatie</label>
          <input type="text" id="oo_loc" value="${h((s && s.locatie) || '')}" placeholder="${h(hoofd.locatie || 'Bijv. Bodegraven')}">
          <span class="hint">Leeg laten = de locatie van de vacature${hoofd.locatie ? ` (${h(hoofd.locatie)})` : ''}.</span></div>
        <div class="f-row"><label>Zitten er kandidaten voor een andere functie bij?</label>
          ${andere.length
            ? `<div id="oo_extra" class="oo-extra">${andere.map(x => `
                <label class="check"><input type="checkbox" value="${h(String(x.id))}"${
                  extraNu.has(String(x.id)) ? ' checked' : ''}>
                  <span>${h(x.functie || 'vacature')}${x.locatie ? ` <span class="meta">${h(x.locatie)}</span>` : ''}</span></label>`).join('')}</div>`
            : `<span class="hint">${h(hoofd.klant || 'Deze klant')} heeft verder geen open vacatures.</span>`}
          <span class="hint">De sessie hoort bij <b>${h(hoofd.functie || 'deze vacature')}</b>. Vink alleen aan wat er echt bij zit — de sessie verschijnt dan ook op die vacaturekaart.</span></div>
        <div class="note err" id="oo_err" style="display:none"></div>
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="oo_ok">${s ? 'Wijzigingen bewaren' : 'Sessie plannen'}</button>
      </div>`, {onOpen(m){
        m.querySelector('#oo_ok').onclick = async () => {
          const err = m.querySelector('#oo_err');
          const datum = m.querySelector('#oo_datum').value;
          if(!datum){
            err.style.display = ''; err.textContent = 'Kies de datum van de sessie.';
            m.querySelector('#oo_datum').focus();
            return;
          }
          const rij = await CRM.oo.bewaar({
            id: s ? s.id : null,
            vacature_id: String(hoofd.id),
            extra_vacatures: CRM.$$('#oo_extra input:checked', m).map(i => i.value),
            datum,
            tijd: m.querySelector('#oo_tijd').value || '',
            locatie: m.querySelector('#oo_loc').value.trim()
          });
          /* Bij een fout heeft CRM.oo.bewaar de melding al gegeven; het venster
             blijft open zodat je het opnieuw kunt proberen. */
          if(!rij) return;
          CRM.modal.close();
          CRM.toast(s ? 'Sessie bijgewerkt' : 'Sessie gepland','ok');
          naOOWijziging();
        };
      }});
  }

  /* ── Kandidaten aan een sessie koppelen ──────────────────────────
     Bewust GEEN "snel een kandidaat aanmaken met alleen een naam": zo ontstond
     er een kaart zonder telefoonnummer, zonder bron en zonder intake, en die
     vervuiling kwam pas bij de klant aan het licht. Een kandidaat ontstaat bij
     Recruitment; hier kies je uit wie er al is.

     De keuzelijst is de optelsom van wie er al op de vacature loopt en wie er
     volgens CRM.matchScore op past — voor élke vacature die aan de sessie
     hangt, want voor die functies zoek je ook mensen. */
  function ooKoppelModal(v, sid){
    const s = CRM.oo.van(sid);
    if(!s) return;
    const vacs = CRM.oo.vacatures(s);
    const meerdere = vacs.length > 1;

    const pool = () => {
      const alIn = new Set(ooDeel(s).map(c => String(c.id)));
      const gezien = new Set(), uit = [];
      vacs.forEach(x => {
        const opVac = gekoppeld(x).filter(c => !CRM.faseIn(c.fase, CRM.DONE));
        opVac.concat(suggesties(x, 8).map(m => m.c)).forEach(c => {
          const id = String(c.id);
          if(alIn.has(id) || gezien.has(id)) return;
          gezien.add(id);
          uit.push({c, vac:x, opVac: opVac.some(y => String(y.id) === id)});
        });
      });
      /* Wie al op een vacature van deze sessie loopt staat bovenaan: die is
         het dichtst bij een gesprek. */
      return uit.sort((a, b) => (b.opVac ? 1 : 0) - (a.opVac ? 1 : 0));
    };

    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Kandidaten toevoegen</div>
        <div class="meta" style="margin-top:2px">${h(CRM.oo.label(s))}</div></div>
      <div class="modal-b" style="max-height:70vh;overflow-y:auto">
        <p class="sub" style="margin:0 0 12px">Toevoegen zet de kandidaat meteen op de fase <b>O&amp;O sessie</b> — voorgesteld zijn is geen voorwaarde.${
          meerdere ? ' Kies erbij voor wélke functie diegene komt.' : ''}</p>
        <div id="oo_pool"></div>
      </div>
      <div class="modal-f">
        <span class="meta" id="oo_tel"></span>
        <div class="spacer"></div>
        <button class="btn" data-mclose>Klaar</button>
      </div>`, {
        onClose(){ naOOWijziging(); },
        onOpen(m){ vul(m); }
      });

    function vul(m){
      const n = ooDeel(s).length;
      const vrij = OO_STREEF - n;
      const tel = m.querySelector('#oo_tel');
      if(tel) tel.textContent = vrij > 0
        ? `${n} van ${OO_STREEF} · nog ${vrij} ${vrij === 1 ? 'plek' : 'plekken'} vrij`
        : `${n} van ${OO_STREEF} · de streef is bereikt`;

      const lijst = pool();
      const doel = m.querySelector('#oo_pool');
      doel.innerHTML = lijst.length ? lijst.map(({c, vac, opVac}) => `
        <div class="oo-kies">
          <div class="oo-kwie">
            <b>${h(c.naam)}</b>
            <span class="meta">${h([opVac ? CRM.faseNorm(c.fase) || 'gekoppeld' : 'uit de kaartenbak',
                                    c.woonplaats || '', c.beschikbaar || ''].filter(Boolean).join(' · '))}</span>
          </div>
          <span class="spacer"></span>
          ${meerdere ? `<select data-oovoor="${h(c.id)}" aria-label="Voor welke functie">${
            vacs.map(x => `<option value="${h(String(x.id))}"${
              String(x.id) === String(vac.id) ? ' selected' : ''}>${h(x.functie || 'vacature')}</option>`).join('')
          }</select>` : ''}
          <button class="btn sm" data-ookoppel="${h(c.id)}">Toevoegen</button>
        </div>`).join('')
        : `<p class="meta" style="margin:0">Geen kandidaat meer om toe te voegen. Nieuwe mensen komen binnen bij Recruitment.</p>`;

      CRM.$$('[data-ookoppel]', doel).forEach(b => b.onclick = async () => {
        const id = b.dataset.ookoppel;
        const kies = doel.querySelector(`[data-oovoor="${CSS.escape(id)}"]`);
        b.disabled = true;
        const ok = await CRM.oo.koppel(id, s.id,
          kies ? kies.value : (vacs[0] ? String(vacs[0].id) : ''));
        if(!ok){ b.disabled = false; return; }
        const c = CRM.kandidaat(id);
        CRM.toast(`${c ? c.naam : 'Kandidaat'} staat op de sessie`, 'ok');
        _idx = null;                       // de index van "wie hangt aan welke vacature" is nu oud
        vul(m);
      });
    }
  }

  /* ── Tab: Historie ── */
  /* Uitkomsten van een belpoging, precies zoals op de relatiekaart. De AM
     werkt vanuit de vacature (Tjeerd, 6 aug 2026: "een AM moet dus ook
     vanuit de vacaturekaart goed kunnen werken") en moet hier dus net zo
     snel kunnen vastleggen. Alles landt op de vacature, en de relatiekaart
     mengt die activiteiten inmiddels mee — één keer vastleggen, op beide
     plekken zichtbaar. */
  const VAC_UITKOMSTEN = [
    ['bel',      'Gebeld',      'Gebeld'],
    ['bel',      'Geen gehoor', 'Gebeld, geen gehoor'],
    ['bel',      'Voicemail',   'Gebeld, voicemail achtergelaten'],
    ['whatsapp', 'WhatsApp',    'WhatsApp gestuurd'],
    ['mail',     'Gemaild',     'Gemaild']
  ];

  function tabHistorie(el, v){
    const acts = CRM.activiteitenVoor('vacature', v.id).map(a => ({
      ico: (CRM.ACT_SOORTEN[a.soort]||{}).ico || '•',
      titel: (CRM.ACT_SOORTEN[a.soort]||{}).lbl || a.soort,
      wanneer: CRM.geleden(a.op) + (a.door ? ' · ' + a.door : ''),
      tekst: a.tekst
    }));
    const ct = v.contact_id
      ? (CRM.state.contacten||[]).find(c => String(c.id) === String(v.contact_id)) : null;
    el.innerHTML = `
      <div class="row tight ovd-uit">${VAC_UITKOMSTEN.map(([, lbl], i) =>
        `<button type="button" class="chip btn-like" data-uit="${i}">${h(lbl)}</button>`).join('')}</div>
      <div class="ovd-uitveld" data-uitveld hidden>
        <div class="label" data-uitkop style="margin-bottom:4px"></div>
        <textarea rows="2" data-uittekst placeholder="Wat is er besproken? Leeg laten mag — Enter legt vast."></textarea>
        <div class="row tight" style="margin-top:6px">
          <button type="button" class="btn sm" data-uitok>Vastleggen</button>
          <button type="button" class="btn ghost sm" data-uitweg>Annuleren</button>
        </div>
      </div>
      <p class="meta" style="margin:12px 0">Statuswissels, notities, doelen — alles wat er op deze vacature is gebeurd, nieuwste eerst.${
        ct ? ` Contactpersoon: <b>${h(ct.naam)}</b>.` : ''} Dit staat ook op de relatiekaart.</p>
      ${CRM.ui.tijdlijn(acts)}`;

    const veld = el.querySelector('[data-uitveld]');
    const tekst = veld.querySelector('[data-uittekst]');
    let keuze = null;
    const dicht = () => { veld.hidden = true; keuze = null; };
    const vastleggen = async () => {
      if(keuze == null) return;
      const [soort, , standaard] = VAC_UITKOMSTEN[keuze];
      const extra = tekst.value.trim();
      /* De contactpersoon van de vacature staat in de regel: over een jaar
         wil je weten wie je sprak, niet alleen dát je belde. */
      const wie = ct ? ' met ' + ct.naam : '';
      const regel = (standaard + wie) + (extra ? ': ' + extra : '');
      dicht();
      await logActie(v, soort, regel);
      /* Een belpoging over een vacature is contact met de klant — het
         salesbord hoort die stilte-teller te resetten. */
      if(v.klant && CRM.bewaarKlantVeld) await CRM.bewaarKlantVeld(v.klant, {laatst_contact: CRM.todayISO()});
      tabHistorie(el, v);
    };
    CRM.$$('[data-uit]', el).forEach(b => b.onclick = () => {
      keuze = +b.dataset.uit;
      veld.hidden = false;
      veld.querySelector('[data-uitkop]').textContent = VAC_UITKOMSTEN[keuze][2] + (ct ? ' met ' + ct.naam : '');
      tekst.value = ''; tekst.focus();
    });
    veld.querySelector('[data-uitok]').onclick = vastleggen;
    veld.querySelector('[data-uitweg]').onclick = dicht;
    tekst.onkeydown = e => {
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); vastleggen(); }
      if(e.key === 'Escape'){ e.preventDefault(); dicht(); }
    };
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
         hij over gaat. (Tjeerd, 2 aug 2026.)

         Sinds 7 aug 2026 is de sessie een sessie ÓP een vacature: klant,
         functie en locatie komen uit deze vacature en hoeven niet meer als
         losse tekst mee. Daarom opent deze knop het eigen venster van dit
         scherm en niet meer CRM._rcDeel.ooModal — die vroeg naar klant en
         functie als vrije tekst en kon dus een sessie zonder vacature maken. */
      const v = CRM.state.vacs.find(x => String(x.id) === String(M.vac));
      el.innerHTML = `${v && CRM.oo
          ? `<button class="btn ghost sm" id="ov_oo">+ O&amp;O-sessie</button>` : ''}
        <button class="btn ghost sm" id="ov_terug">← Alle vacatures</button>`;
      const oo = el.querySelector('#ov_oo');
      if(oo) oo.onclick = () => ooPlanModal(v, null);
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
      CRM.ga('hot', {}, {vervang:true}); return;   // vacature is weg: terug naar de lijst
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
          /* Een andere vacature begint altijd in leesmodus — anders sta je
             in het tekstveld van een vacature die je nog moet lezen. */
          if(M.vacVorige !== id){ S.tekstBewerk = false; M.vacVorige = id; }
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
