/* ═══ SALESMETER — koude acquisitie meten en opvolgen ══════════════
   Tjeerd, 25 okt 2026: "Ik moet meer meters maken… een sales meter die
   precies mijn input, maar ook resultaten meet en aangeeft wie ik wanneer
   moet opvolgen." Doelen: 30 koude belletjes per dag, 3 afspraken per week
   met nieuwe leads.

   Twee dingen, één bestand (CRM.salesmeter):
   1. TELLEN — belletjes vandaag/deze week, gesproken, afspraken. Bron is
      crm_activiteiten (soort 'bel'); de uitkomst staat sinds deze versie
      in extra.uitkomst. Oudere belletjes hebben die niet: daar lezen we
      "geen gehoor" uit de tekst, net als Performance doet.
   2. GEBELD — één menu met zes uitkomsten. Elke uitkomst legt het belletje
      vast én zet de volgende stap als taak klaar, volgens een vast ritme:
        geen gehoor / receptie → over 2 werkdagen opnieuw, max. 3 pogingen
        bel later terug        → op de datum die je kiest
        info gemaild           → over 3 werkdagen nabellen
        afspraak gemaakt       → fase "Gesprek ingepland" + taak op de dag
        geen interesse         → klaar; koude lead naar "Project uitgesteld"
      Die taken hangen aan de klant (of contactpersoon), dus ze staan
      vanzelf in Sales → Opvolgingen. Er is bewust géén tweede lijst.

   ZELF OPRUIMEN (Tjeerd, 27 okt 2026: "te veel handmatig werk, ook met
   opvolgingen"). Van de 105 opgepakte radarleads stonden er 91 nog op
   Lead: elk "geen gehoor" maakte er een klant mét taak van. Daarom:
     - een radarbedrijf wordt pas een lead bij een echt gesprek (later,
       info, afspraak). Geen gehoor / receptie blijft op de radar, met de
       nabeltaak aan de radarrij (entiteit 'radar');
     - na 3 pogingen zonder gehoor parkeert het systeem: radarrij genegeerd
       met die reden, koude lead naar "Project uitgesteld";
     - "geen interesse" maakt geen taak meer voor over 3 maanden;
     - info gemaild opent meteen de mail (radarconcept of Tjeerds vaste
       template), geen gehoor biedt het WhatsApp-appje aan;
     - een Kennismaking-taak afvinken vraagt hoe het ging en zet de
       volgende stap (naKennismaking).

   WAT TELT ALS KOUD: een belletje naar een bedrijf dat nog geen kennis-
   making heeft gehad — Leadradar, of een klant in Lead t/m "In afwachting
   kennismaking". Dat wordt bij het vastleggen in extra.koud gezet, zodat
   een latere fasewissel (na de afspraak) het verleden niet herschrijft. */
(function(){
  const h = CRM.h;

  /* Doelen per persoon. Op voornaam, zoals CRM.me() het profiel noemt.
     Wie hier niet staat ziet op het dashboard geen belmeter. */
  const DOELEN = {
    tjeerd: {belDag:30, afsprWeek:3}
  };
  const voornaam = n => String(n||'').trim().split(/\s+/)[0].toLowerCase();
  const doel = (wie = CRM.me()) => DOELEN[voornaam(wie)] || null;

  const KOUDE_FASES = ['Lead','Suspect','Prospect','In afwachting kennismaking'];
  const MAX_POGINGEN = 3;

  const UITKOMSTEN = [
    {k:'geen_gehoor', ico:'📵', lbl:'Geen gehoor',             hint:'Opnieuw over 2 werkdagen · na 3 pogingen geparkeerd'},
    {k:'receptie',    ico:'☎️', lbl:'Receptie / niet de beslisser', hint:'Naam beslisser noteren · opnieuw over 2 werkdagen'},
    {k:'later',       ico:'⏰', lbl:'Bel later terug',          hint:'Jij kiest de datum'},
    {k:'info',        ico:'✉️', lbl:'Info gemaild',             hint:'Mail gaat open · nabellen over 3 werkdagen'},
    {k:'afspraak',    ico:'🤝', lbl:'Afspraak gemaakt',         hint:'Fase "Gesprek ingepland" · telt voor je weekdoel', hoofd:true},
    {k:'geen_interesse', ico:'✕', lbl:'Geen interesse',         hint:'Klaar · geen nieuwe taak'}
  ];
  const UITKOMST = Object.fromEntries(UITKOMSTEN.map(u => [u.k, u]));

  /* ─── Datums ─────────────────────────────────────────────────── */
  const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const lokaalDag = op => op ? iso(new Date(op)) : '';
  function werkdagenErbij(n, van = new Date()){
    const d = new Date(van);
    while(n > 0){ d.setDate(d.getDate()+1); if(d.getDay() !== 0 && d.getDay() !== 6) n--; }
    return iso(d);
  }
  function maandagISO(){
    const d = new Date(); const w = (d.getDay()+6) % 7; d.setDate(d.getDate()-w); return iso(d);
  }
  /* ma t/m vr van deze week, met datum. */
  function weekDagen(){
    const ma = new Date(maandagISO()+'T12:00:00');
    return ['ma','di','wo','do','vr'].map((lbl, i) => { const d = new Date(ma); d.setDate(d.getDate()+i); return {lbl, iso:iso(d)}; });
  }

  /* ─── Tellen ─────────────────────────────────────────────────── */
  const klantVanContact = id => ((CRM.state.contacten||[]).find(x => String(x.id) === String(id)) || {}).klant || '';
  function isKoud(a){
    if(a.extra && typeof a.extra.koud === 'boolean') return a.extra.koud;
    if(a.entiteit === 'radar') return true;
    const naam = a.entiteit === 'klant' ? a.ref : a.entiteit === 'contact' ? klantVanContact(a.ref) : '';
    const k = naam && CRM.klant(naam);
    return !!(k && KOUDE_FASES.includes(k.fase || 'Lead'));
  }
  const uitkomstVan = a => (a.extra && a.extra.uitkomst) || (/geen gehoor/i.test(a.tekst||'') ? 'geen_gehoor' : '');
  const mijnBellen = (wie = CRM.me()) => (CRM.state.activiteiten||[])
    .filter(a => a.soort === 'bel' && a.door === wie && ['klant','contact','radar'].includes(a.entiteit));

  function tel(wie = CRM.me()){
    const vandaag = CRM.todayISO(), ma = maandagISO();
    const koud = mijnBellen(wie).filter(isKoud);
    const opDag = d => koud.filter(a => lokaalDag(a.op) === d);
    const vd = opDag(vandaag);
    const week = koud.filter(a => { const d = lokaalDag(a.op); return d >= ma && d <= vandaag; });
    const afspraken = (CRM.state.activiteiten||[]).filter(a => a.door === wie && a.extra && a.extra.uitkomst === 'afspraak' && a.extra.koud
      && lokaalDag(a.op) >= ma && lokaalDag(a.op) <= vandaag).length;
    return {
      doel: doel(wie),
      vandaag: vd.length,
      gesproken: vd.filter(a => { const u = uitkomstVan(a); return u && u !== 'geen_gehoor'; }).length,
      week: week.length,
      perDag: weekDagen().map(d => Object.assign(d, {n: opDag(d.iso).length})),
      afspraken   // alleen bij nieuwe leads (koud): het weekdoel gaat over nieuwe klanten
    };
  }

  /* Open opvolgingen op mijn naam t/m vandaag — dezelfde verzameling als
     Sales → Opvolgingen (taken aan een klant of contactpersoon). */
  function opvolgen(wie = CRM.me()){
    const vandaag = CRM.todayISO();
    const open = (CRM.state.taken||[]).filter(t => !t.klaar && (!t.voor || t.voor === wie)
      && ['klant','contact','radar'].includes(t.entiteit) && t.datum && String(t.datum).slice(0,10) <= vandaag);
    return {n: open.length, verlopen: open.filter(t => String(t.datum).slice(0,10) < vandaag).length};
  }

  /* Hoeveelste poging dit zou zijn bij deze klant (geen gehoor/receptie
     sinds het laatste échte gesprek). */
  function poging(klant){
    const bel = (CRM.state.activiteiten||[])
      .filter(a => a.soort === 'bel' && ((a.entiteit === 'klant' && a.ref === klant) || (a.entiteit === 'contact' && klantVanContact(a.ref) === klant)))
      .sort((a,b) => String(b.op).localeCompare(String(a.op)));
    let n = 0;
    for(const a of bel){ const u = uitkomstVan(a); if(u === 'geen_gehoor' || u === 'receptie') n++; else break; }
    return n + 1;
  }

  /* Idem op een radarrij: belletjes met entiteit 'radar'. */
  function pogingRadar(id){
    const bel = (CRM.state.activiteiten||[])
      .filter(a => a.soort === 'bel' && a.entiteit === 'radar' && String(a.ref) === String(id))
      .sort((a,b) => String(b.op).localeCompare(String(a.op)));
    let n = 0;
    for(const a of bel){ const u = uitkomstVan(a); if(u === 'geen_gehoor' || u === 'receptie') n++; else break; }
    return n + 1;
  }

  /* ─── Taak klaarzetten (zonder venster) ──────────────────────── */
  async function taak(klant, contactId, tekst, datum, prioriteit = 'normaal'){
    return taakOp(contactId ? 'contact' : 'klant', contactId || klant, tekst, datum, prioriteit);
  }
  async function taakOp(entiteit, ref, tekst, datum, prioriteit = 'normaal'){
    const rij = {id:CRM.uid(), tekst, datum, tijd:'', klaar:false,
      entiteit, ref: String(ref),
      voor:CRM.me(), door:CRM.me(), prioriteit, created_at:new Date().toISOString()};
    CRM.state.taken.push(rij);
    if(!CRM.demo){
      let {error} = await CRM.sb.from('crm_taken').insert(rij);
      if(error && /tijd/.test(String(error.message||''))){
        const zonder = Object.assign({}, rij); delete zonder.tijd;
        ({error} = await CRM.sb.from('crm_taken').insert(zonder));
      }
      if(error){ CRM.state.taken.pop(); CRM.fout('Opvolgtaak opslaan mislukt', error); return null; }
    }
    return rij;
  }
  async function taakAf(id){
    const t = (CRM.state.taken||[]).find(x => x.id === id); if(!t || t.klaar) return;
    t.klaar = true;
    if(!CRM.demo){
      const {error} = await CRM.sb.from('crm_taken').update({klaar:true}).eq('id', id);
      if(error){ t.klaar = false; CRM.fout('Taak afvinken mislukt', error); }
    }
  }

  /* ─── Het menu ───────────────────────────────────────────────── */
  function kies(titel){
    const t = tel();
    const teller = t.doel ? `Vandaag ${t.vandaag} van ${t.doel.belDag} · dit wordt nummer ${t.vandaag+1}` : '';
    return new Promise(res => {
      CRM.modal.open(`
        <div class="modal-h"><div class="h2">Hoe ging het?</div><span class="meta">${h(titel)}</span></div>
        <div class="modal-b sm-menu">
          ${UITKOMSTEN.map(u => `<button type="button" class="sm-o${u.hoofd?' hoofd':''}" data-uk="${u.k}">
            <span class="sm-ico">${u.ico}</span><b>${h(u.lbl)}</b><span class="meta">${h(u.hint)}</span></button>`).join('')}
          ${teller ? `<div class="sm-teller meta num">${h(teller)}</div>` : ''}
        </div>`, {
        onClose(){ res(null); },
        onOpen(m){
          CRM.$$('[data-uk]', m).forEach(b => b.onclick = () => { CRM.modal._onClose = null; CRM.modal.close(); res(b.dataset.uk); });
        }});
    });
  }
  function kiesDatum(titel, hint, standaard){
    return new Promise(res => {
      CRM.modal.open(`
        <div class="modal-h"><div class="h2">${h(titel)}</div></div>
        <div class="modal-b">${hint?`<p class="sub" style="margin:0 0 10px">${h(hint)}</p>`:''}
          <div class="f-row"><input type="date" id="sm_d" value="${h(standaard)}"> <input type="time" id="sm_t" style="max-width:120px"></div>
          <textarea id="sm_n" placeholder="Notitie (mag leeg)" style="margin-top:10px"></textarea></div>
        <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button><button class="btn" id="sm_ok">Vastleggen</button></div>`, {
        onClose(){ res(null); },
        onOpen(m){
          const sluit = v => { CRM.modal._onClose = null; CRM.modal.close(); res(v); };
          m.querySelector('#sm_ok').onclick = () => {
            const d = m.querySelector('#sm_d').value; if(!d) return m.querySelector('#sm_d').focus();
            sluit({datum:d, tijd:m.querySelector('#sm_t').value || '', notitie:m.querySelector('#sm_n').value.trim()});
          };
          m.querySelector('[data-mclose]').onclick = () => sluit(null);
        }});
    });
  }

  /* gebeld({naam, klant, contactId, taakId, radar:{naarKlant, negeer}}, klaar)
     - naam:   wat er in de titel staat (bedrijf of persoon)
     - klant:  klantnaam als het bedrijf al in de pijplijn staat
     - radar:  bij een Leadradar-rij. naarKlant() zet hem als lead en geeft
               de klantnaam terug; negeer(reden) voor "geen interesse".
     - taakId: de opvolging waar je vandaan belt; die gaat vanzelf dicht. */
  async function gebeld(ctx, klaar){
    const uk = ctx.uitkomst || await kies(ctx.naam || ctx.klant || '');
    /* Een venster dat net dicht ging, haalt zijn stap uit de geschiedenis met
       history.back(); dat loopt asynchroon. Opent het volgende venster in
       dezelfde tik, dan sluit die late terugstap het nieuwe venster weer
       (of verlaat de app als er geen eerdere pagina was). Even wachten. */
    const rust = () => new Promise(r => setTimeout(r, 450));
    if(!uk) return;
    const u = UITKOMST[uk];

    /* Koud of niet bepalen we vóór er iets verandert aan de fase. */
    let klant = ctx.klant || '';
    const vooraf = klant ? CRM.klant(klant) : null;
    const koud = ctx.radar ? true : !!(vooraf && KOUDE_FASES.includes(vooraf.fase || 'Lead'));

    let extraInfo = null;
    if(uk === 'receptie'){
      await rust();
      extraInfo = await CRM.vraag('Wie is de beslisser?', {knop:'Vastleggen', placeholder:'Naam en functie (mag leeg)'});
    }
    let afspraak = null;
    if(uk === 'later' || uk === 'afspraak'){
      await rust();
      afspraak = await kiesDatum(uk === 'afspraak' ? 'Wanneer is de kennismaking?' : 'Wanneer terugbellen?',
        uk === 'afspraak' ? 'Het bedrijf gaat naar "Gesprek ingepland" en de afspraak telt mee voor je weekdoel.' : '',
        werkdagenErbij(uk === 'afspraak' ? 3 : 1));
      if(!afspraak) return;
    }
    let reden = '';
    if(uk === 'geen_interesse'){
      await rust();
      reden = await kiesReden('Geen interesse — waarom?', REDENEN_NEE);
      if(reden === null) return;
    }

    /* Leadradar: een echt gesprek (later, info, afspraak) maakt er een lead
       van. Geen gehoor en receptie blijven op de radar, met de nabeltaak aan
       de radarrij; na de laatste poging parkeert het systeem hem.
       Bij "Nieuw belletje" (geen echte radarrij, opRadar ontbreekt) wordt
       het wél meteen een lead: dat bedrijf typte je zelf in. */
    if(ctx.radar){
      if(uk === 'geen_interesse'){
        await CRM.logActiviteit('radar', ctx.radar.id, 'bel', `Gebeld — geen interesse${reden?': '+reden:''}`, {uitkomst:uk, koud:true});
        await ctx.radar.negeer(reden ? 'Geen interesse: '+reden : 'Geen interesse (gebeld)');
        if(ctx.taakId) await taakAf(ctx.taakId);
        CRM.toast('Vastgelegd — de radar slaat dit bedrijf voortaan over', 'ok');
        return klaar && klaar();
      }
      if(ctx.radar.opRadar && (uk === 'geen_gehoor' || uk === 'receptie')){
        const p = pogingRadar(ctx.radar.id);
        const wie = ctx.contactNaam ? ` met ${ctx.contactNaam}` : '';
        await CRM.logActiviteit('radar', ctx.radar.id, 'bel',
          `Gebeld${wie}, ${uk === 'receptie' ? 'receptie / niet de beslisser' : 'geen gehoor'} (poging ${p} van ${MAX_POGINGEN})${extraInfo?` — beslisser: ${extraInfo}`:''}`,
          {uitkomst:uk, koud:true, poging:p});
        if(ctx.taakId) await taakAf(ctx.taakId);
        if(p < MAX_POGINGEN){
          await taakOp('radar', ctx.radar.id, `Bel ${ctx.naam} opnieuw — ${u.lbl.toLowerCase()} (poging ${p+1} van ${MAX_POGINGEN})`, werkdagenErbij(2));
          const t = tel();
          CRM.toast(t.doel ? `${u.lbl} vastgelegd — ${t.vandaag} van ${t.doel.belDag} vandaag` : `${u.lbl} vastgelegd`, 'ok');
        } else {
          await ctx.radar.negeer(`Geparkeerd na ${MAX_POGINGEN}× geen gehoor`);
          CRM.toast(`${MAX_POGINGEN} pogingen zonder gehoor — geparkeerd, staat niet meer op je lijst`, 'ok');
        }
        CRM.navBadges && CRM.navBadges();
        if(uk === 'geen_gehoor' && ctx.telefoon) appjeAanbieden(ctx.telefoon, ctx.contactNaam, ctx.naam);
        return klaar && klaar();
      }
      klant = await ctx.radar.naarKlant();
      if(!klant) return;
      if(ctx.naContact && ctx.naContact()) ctx.contactId = ctx.naContact();
    }
    if(!klant) return CRM.toast('Geen bedrijf gevonden om dit belletje aan te hangen', 'err');

    const p = (uk === 'geen_gehoor' || uk === 'receptie') ? poging(klant) : 0;
    const wie = ctx.contactNaam ? ` met ${ctx.contactNaam}` : '';
    const zin = {
      geen_gehoor: `Gebeld${wie}, geen gehoor (poging ${p} van ${MAX_POGINGEN})`,
      receptie: `Gebeld${wie}, receptie / niet de beslisser (poging ${p} van ${MAX_POGINGEN})${extraInfo?` — beslisser: ${extraInfo}`:''}`,
      later: `Gebeld${wie} — terugbellen op ${afspraak && CRM.fmtDate(afspraak.datum)}${afspraak && afspraak.notitie?`: ${afspraak.notitie}`:''}`,
      info: `Gebeld${wie} — info gemaild`,
      afspraak: `Gebeld${wie} — kennismaking gepland op ${afspraak && CRM.fmtDate(afspraak.datum)}${afspraak && afspraak.tijd?' om '+afspraak.tijd:''}${afspraak && afspraak.notitie?`: ${afspraak.notitie}`:''}`,
      geen_interesse: `Gebeld${wie} — geen interesse${reden?': '+reden:''}`
    }[uk];
    await CRM.logActiviteit(ctx.contactId ? 'contact' : 'klant', ctx.contactId || klant, 'bel', zin,
      {uitkomst:uk, koud, poging:p || undefined});
    /* De klantkaart toont activiteiten op klantnaam: bij een contactpersoon
       ook daar een regel, anders mist de tijdlijn van het bedrijf het. */
    if(ctx.contactId) await CRM.logActiviteit('klant', klant, 'notitie', zin, {koud, gespiegeld:true});

    /* Laatst contact bijwerken. */
    const k = CRM.klant(klant);
    if(k){
      k.laatst_contact = CRM.todayISO();
      if(!CRM.demo) CRM.sb.from('clients').update({laatst_contact:k.laatst_contact}).eq('naam', klant).then(({error}) => { if(error) console.warn('laatst_contact', error); });
    }

    /* Volgende stap. */
    const n = ctx.contactNaam || klant;
    let geparkeerd = false;
    if(uk === 'geen_gehoor' || uk === 'receptie'){
      if(p < MAX_POGINGEN) await taak(klant, ctx.contactId, `Bel ${n} opnieuw — ${u.lbl.toLowerCase()} (poging ${p+1} van ${MAX_POGINGEN})`, werkdagenErbij(2));
      else geparkeerd = await parkeer(k, `${MAX_POGINGEN}× geen gehoor`);
    }
    if(uk === 'later') await taak(klant, ctx.contactId, `Bel ${n} terug — afgesproken`, afspraak.datum, 'hoog');
    if(uk === 'info') await taak(klant, ctx.contactId, `Nabellen ${n} — info gemaild`, werkdagenErbij(3));
    if(uk === 'afspraak'){
      await taak(klant, ctx.contactId, `Kennismaking ${klant}${afspraak.tijd?' om '+afspraak.tijd:''}`, afspraak.datum, 'hoog');
      if(k && k.fase !== 'Gesprek ingepland'){
        const oud = k.fase; k.fase = 'Gesprek ingepland'; k.fase_sinds = CRM.todayISO();
        if(!CRM.demo){
          const {error} = await CRM.sb.from('clients').update({fase:k.fase, fase_sinds:k.fase_sinds}).eq('naam', klant);
          if(error){ k.fase = oud; CRM.fout('Fase bijwerken mislukt', error); }
        }
        CRM.logActiviteit('klant', klant, 'fase', `${oud||'Lead'} → Gesprek ingepland`);
      }
    }
    if(uk === 'geen_interesse') await parkeer(k, 'geen interesse' + (reden ? ': ' + reden : ''));
    if(ctx.taakId) await taakAf(ctx.taakId);

    const t = tel();
    CRM.toast(geparkeerd ? `${MAX_POGINGEN} pogingen zonder gehoor — ${klant} staat nu op "Project uitgesteld"`
      : t.doel ? `${u.lbl} vastgelegd — ${t.vandaag} van ${t.doel.belDag} vandaag` : `${u.lbl} vastgelegd`, 'ok');
    CRM.navBadges && CRM.navBadges();
    if(klaar) klaar();

    /* De vervolghandeling die je anders zelf opzoekt. Pas na klaar(), zodat
       de lijst eronder al bijgewerkt is, en na een rustpauze (zie rust). */
    if(uk === 'info'){ await rust(); infoMail(klant, ctx.contactId); }
    if(uk === 'geen_gehoor' && !geparkeerd){
      const c = ctx.contactId ? (CRM.state.contacten||[]).find(x => String(x.id) === String(ctx.contactId)) : null;
      const tel_ = (c && c.telefoon) || ctx.telefoon || '';
      if(tel_) appjeAanbieden(tel_, (c && c.naam) || ctx.contactNaam, klant);
    }
  }

  /* Koude lead parkeren: naar "Project uitgesteld" (hint: later opnieuw
     benaderen). Een warme relatie blijft staan waar hij staat. */
  async function parkeer(k, waarom){
    if(!k || !KOUDE_FASES.includes(k.fase || 'Lead')) return false;
    const oud = k.fase || 'Lead';
    k.fase = 'Project uitgesteld'; k.fase_sinds = CRM.todayISO();
    if(!CRM.demo){
      const {error} = await CRM.sb.from('clients').update({fase:k.fase, fase_sinds:k.fase_sinds}).eq('naam', k.naam);
      if(error){ k.fase = oud; CRM.fout('Parkeren mislukt', error); return false; }
    }
    CRM.logActiviteit('klant', k.naam, 'fase', `${oud} → Project uitgesteld (geparkeerd: ${waarom})`);
    return true;
  }

  /* ─── Redenen met één klik ───────────────────────────────────────
     103 van de 109 genegeerde radarleads hadden geen reden: typen doet
     niemand midden in een belronde. Knoppen wel. "Anders" vraagt alsnog
     om tekst. null = geannuleerd. */
  const REDENEN_NEE = ['Werken al met een bureau', 'Nu geen vacatures', 'Werven zelf', 'Geen tijd / niet de juiste persoon'];
  function kiesReden(titel, opties){
    return new Promise(res => {
      CRM.modal.open(`
        <div class="modal-h"><div class="h2">${h(titel)}</div></div>
        <div class="modal-b"><div class="sm-redenen">${opties.map((o, i) =>
          `<button type="button" class="btn ghost" data-rd="${i}">${h(o)}</button>`).join('')}
          <button type="button" class="btn ghost" data-rd="anders">Anders…</button></div>
          <input type="text" id="sm_rd" placeholder="Reden" style="display:none;margin-top:10px"></div>
        <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
          <button class="btn" id="sm_rdok" style="display:none">Vastleggen</button></div>`, {
        onClose(){ res(null); },
        onOpen(m){
          const sluit = v => { CRM.modal._onClose = null; CRM.modal.close(); res(v); };
          const inp = m.querySelector('#sm_rd'), ok = m.querySelector('#sm_rdok');
          CRM.$$('[data-rd]', m).forEach(b => b.onclick = () => {
            if(b.dataset.rd !== 'anders') return sluit(opties[Number(b.dataset.rd)]);
            inp.style.display = ''; ok.style.display = ''; inp.focus();
          });
          ok.onclick = () => sluit(inp.value.trim());
          inp.onkeydown = e => { if(e.key === 'Enter') sluit(inp.value.trim()); };
          m.querySelector('[data-mclose]').onclick = () => sluit(null);
        }});
    });
  }

  /* ─── Info gemaild → de mail staat meteen open ───────────────────
     Eerst de conceptmail die de leadradar voor dit bedrijf schreef (al in
     Tjeerds vaste template), anders de template zelf met [haakjes] waar
     het detail en de vervolgstap moeten komen. Jij verstuurt zelf. */
  function infoMail(klant, contactId){
    if(!CRM.mailUI) return;
    const k = CRM.klant(klant) || {};
    const cs = (CRM.state.contacten||[]).filter(c => c.klant === klant);
    const c = (contactId && cs.find(x => String(x.id) === String(contactId))) || cs.find(x => x.hoofd && x.email) || cs.find(x => x.email) || null;
    const concept = CRM.radarConcept ? CRM.radarConcept(klant) : null;
    const voornaam = c ? String(c.naam||'').trim().split(/\s+/)[0] : '';
    const tekst = (concept && concept.mail) || (CRM.salesTemplate ? CRM.salesTemplate(voornaam) : '');
    CRM.mailUI.opstellen({
      aan: (c && c.email) || k.email || '',
      wie: c ? `${c.naam} — ${klant}` : klant,
      onderwerp: `Ploeggenoten · ${klant}`,
      tekst, set:'klant', ctx:{voornaam, klant},
      entiteit: c ? 'contact' : 'klant', ref: c ? String(c.id) : klant
    });
  }

  /* ─── Geen gehoor → WhatsApp-appje met één klik ──────────────────
     Een klein balkje onderin, 10 seconden; negeren mag. Het bericht zelf
     staat in sales.js (geenGehoorBericht). */
  function appjeAanbieden(telefoon, contactNaam, klant){
    const link = CRM.waHref && CRM.geenGehoorBericht && CRM.waHref(telefoon, CRM.geenGehoorBericht(contactNaam, klant));
    if(!link) return;
    document.querySelector('.sm-appje')?.remove();
    const el = document.createElement('div');
    el.className = 'sm-appje';
    el.innerHTML = `<span>Appje sturen${contactNaam ? ' naar ' + h(String(contactNaam).split(/\s+/)[0]) : ''}?</span>
      <a class="btn sm" href="${h(link)}" target="_blank" rel="noopener">💬 WhatsApp klaarzetten</a>
      <button type="button" class="btn sm ghost" aria-label="Sluiten">✕</button>`;
    document.body.appendChild(el);
    const weg = () => el.remove();
    el.querySelector('a').addEventListener('click', () => {
      if(CRM.klant(klant)) CRM.logActiviteit('klant', klant, 'whatsapp', `WhatsApp-appje klaargezet na geen gehoor${contactNaam ? ' voor ' + contactNaam : ''}`);
      setTimeout(weg, 300);
    });
    el.querySelector('button').onclick = weg;
    setTimeout(weg, 10000);
  }

  /* ─── Bellen = nummer aanklikken ─────────────────────────────────
     Op een rij met een tel:-link start de klik het gesprek, en even later
     staat het uitkomstmenu al open. Na het ophangen nog één klik. */
  function belEnVraag(ctx, klaar){ setTimeout(() => gebeld(ctx, klaar), 900); }

  /* ─── Kennismaking gehad → één venster, volgende stap staat ──────
     Aangeroepen na het afvinken van een taak die met "Kennismaking "
     begint (sales.js, dashboard.js, contactkaart.js). */
  async function naKennismaking(t){
    if(!t || !/^Kennismaking\s/.test(String(t.tekst||''))) return;
    const klant = t.entiteit === 'klant' ? t.ref : t.entiteit === 'contact' ? klantVanContact(t.ref) : '';
    const k = klant && CRM.klant(klant);
    if(!k) return;
    const contactId = t.entiteit === 'contact' ? String(t.ref) : '';
    const rust = () => new Promise(r => setTimeout(r, 450));
    await rust();
    const keuze = await new Promise(res => {
      CRM.modal.open(`
        <div class="modal-h"><div class="h2">Hoe ging de kennismaking?</div>
          <p class="sub" style="margin:6px 0 0">${h(klant)}</p></div>
        <div class="modal-b">
          <textarea id="km_v" placeholder="Kort verslag: wat speelt er, welke functies, wie beslist (mag leeg)"></textarea>
          <div class="sm-menu" style="margin-top:12px">
            <button type="button" class="sm-o hoofd" data-km="voorstel"><span class="sm-ico">📄</span><b>Voorstel sturen</b><span class="meta">Fase "Voorstel gedaan" · over 5 werkdagen nabellen</span></button>
            <button type="button" class="sm-o" data-km="later"><span class="sm-ico">⏳</span><b>Nog niet</b><span class="meta">Jij kiest wanneer je opvolgt</span></button>
            <button type="button" class="sm-o" data-km="nee"><span class="sm-ico">✕</span><b>Geen match</b><span class="meta">Naar "Project uitgesteld" · geen taak</span></button>
          </div></div>
        <div class="modal-f"><button class="btn ghost" data-mclose>Later invullen</button></div>`, {
        onClose(){ res(null); },
        onOpen(m){
          CRM.$$('[data-km]', m).forEach(b => b.onclick = () => {
            const v = m.querySelector('#km_v').value.trim();
            CRM.modal._onClose = null; CRM.modal.close(); res({k:b.dataset.km, verslag:v});
          });
        }});
    });
    if(!keuze) return;
    let datum = null;
    if(keuze.k === 'later'){
      await rust();
      const d = new Date(); d.setDate(d.getDate() + 28);
      const gekozen = await kiesDatum('Wanneer opvolgen?', '', iso(d));
      if(!gekozen) return;
      datum = gekozen.datum;
    }
    if(keuze.verslag) await CRM.logActiviteit(contactId ? 'contact' : 'klant', contactId || klant, 'gesprek', `Kennismaking: ${keuze.verslag}`);
    const naarFase = async nieuw => {
      if(k.fase === nieuw) return;
      const oud = k.fase || 'Lead'; k.fase = nieuw; k.fase_sinds = CRM.todayISO();
      if(!CRM.demo){
        const {error} = await CRM.sb.from('clients').update({fase:k.fase, fase_sinds:k.fase_sinds}).eq('naam', klant);
        if(error){ k.fase = oud; return CRM.fout('Fase bijwerken mislukt', error); }
      }
      CRM.logActiviteit('klant', klant, 'fase', `${oud} → ${nieuw}`);
    };
    if(keuze.k === 'voorstel'){
      await naarFase('Voorstel gedaan');
      await taak(klant, contactId, `Voorstel nabellen — ${klant}`, werkdagenErbij(5), 'hoog');
      CRM.toast('Vastgelegd — over 5 werkdagen staat het nabellen in Opvolgingen', 'ok');
    } else if(keuze.k === 'later'){
      await taak(klant, contactId, `${klant} opvolgen na kennismaking`, datum);
      CRM.toast('Vastgelegd — de opvolging staat in Opvolgingen', 'ok');
    } else {
      await naarFase('Project uitgesteld');
      CRM.toast('Vastgelegd — geen match', 'ok');
    }
    CRM.navBadges && CRM.navBadges();
  }


  /* ─── Nieuw belletje: een bedrijf dat nog nergens in het CRM staat ───
     Tjeerd, 27 okt 2026: "als ik iemand bel en het is interessant, moet hij
     altijd als lead in het CRM komen." Vanuit de Leadradar gebeurde dat al;
     dit is voor alles daarbuiten (eigen lijst, LinkedIn, Lemlist, een tip).
     Staat het bedrijf er al, dan hangt het belletje gewoon aan die relatie.
     Zo niet, dan wordt het bij elke uitkomst behalve "geen interesse" een
     Lead — mét contactpersoon als je die invult. Geen interesse telt wél
     mee als belletje, maar maakt geen relatie aan. */
  function vraagBedrijf(){
    return new Promise(res => {
      CRM.modal.open(`
        <div class="modal-h"><div class="h2">Nieuw belletje</div></div>
        <div class="modal-b"><p class="sub" style="margin:0 0 10px">Wie bel je? Staat het bedrijf al in het CRM, dan komt het belletje daar. Zo niet, dan wordt het een Lead zodra het gesprek iets oplevert.</p>
          <div class="f-grid">
            <input type="text" id="nb_bedrijf" placeholder="Bedrijf (verplicht)" autocomplete="off">
            <input type="text" id="nb_plaats" placeholder="Plaats">
            <input type="text" id="nb_naam" placeholder="Contactpersoon">
            <input type="text" id="nb_functie" placeholder="Functie">
            <input type="tel" id="nb_tel" placeholder="Telefoon">
          </div>
          <div class="meta" id="nb_al" style="margin-top:8px"></div>
          <div class="label" style="margin:16px 0 8px">Hoe ging het?</div>
          <div class="sm-menu">${UITKOMSTEN.map(u => `<button type="button" class="sm-o${u.hoofd?' hoofd':''}" data-nbuk="${u.k}">
            <span class="sm-ico">${u.ico}</span><b>${h(u.lbl)}</b><span class="meta">${h(u.hint)}</span></button>`).join('')}</div></div>
        <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {
        onClose(){ res(null); },
        onOpen(m){
          const v = id => m.querySelector(id).value.trim();
          const inp = m.querySelector('#nb_bedrijf'); setTimeout(() => inp.focus(), 60);
          inp.oninput = () => {
            const k = (CRM.state.clients || []).find(c => CRM.zelfdeKlant(c.naam, inp.value));
            m.querySelector('#nb_al').textContent = k ? `Staat al in het CRM: ${k.naam} (${k.fase || 'Lead'}) — het belletje komt daar.` : '';
          };
          const sluit = x => { CRM.modal._onClose = null; CRM.modal.close(); res(x); };
          CRM.$$('[data-nbuk]', m).forEach(b => b.onclick = () => {
            if(!v('#nb_bedrijf')){ inp.focus(); inp.placeholder = 'Vul eerst het bedrijf in'; return; }
            sluit({bedrijf:v('#nb_bedrijf'), plaats:v('#nb_plaats'), naam:v('#nb_naam'), functie:v('#nb_functie'), telefoon:v('#nb_tel'), uk:b.dataset.nbuk});
          });
          m.querySelector('[data-mclose]').onclick = () => sluit(null);
        }});
    });
  }
  async function maakLead(g){
    const vandaag = CRM.todayISO();
    const rij = {naam:g.bedrijf, fase:'Lead', eigenaar:CRM.me(), branche:'', locatie:g.plaats || '',
      aangemaakt:vandaag, fase_sinds:vandaag, laatst_contact:null, telefoon:g.naam ? '' : (g.telefoon || ''),
      email:'', website:'', note:'Aangemaakt na een koud belletje (Nieuw belletje).'};
    CRM.state.clients.push(rij);
    if(!CRM.demo){
      let {error} = await CRM.sb.from('clients').upsert(rij, {onConflict:'naam'});
      if(error && /aangemaakt/i.test(error.message || '')){
        const zonder = Object.assign({}, rij); delete zonder.aangemaakt;
        ({error} = await CRM.sb.from('clients').upsert(zonder, {onConflict:'naam'}));
      }
      if(error){ CRM.state.clients.pop(); CRM.fout('Lead opslaan mislukt', error); return null; }
    }
    CRM.logActiviteit('klant', g.bedrijf, 'systeem', 'Als lead aangemaakt na een koud belletje');
    let contactId = '';
    if(g.naam){
      const c = {id:CRM.uid(), klant:g.bedrijf, naam:g.naam, functie:g.functie || '', telefoon:g.telefoon || '',
        email:'', linkedin:'', hoofd:true, note:'Gesproken bij een koud belletje'};
      CRM.state.contacten = CRM.state.contacten || [];
      CRM.state.contacten.unshift(c);
      if(!CRM.demo){
        const {error} = await CRM.sb.from('crm_contacten').insert(c);
        if(error){ CRM.state.contacten.shift(); CRM.fout('Contactpersoon opslaan mislukt', error); }
        else contactId = c.id;
      } else contactId = c.id;
    }
    return {klant:g.bedrijf, contactId};
  }
  async function belNieuw(klaar){
    const g = await vraagBedrijf();
    if(!g) return;
    const bestaand = (CRM.state.clients || []).find(c => CRM.zelfdeKlant(c.naam, g.bedrijf));
    if(bestaand) return gebeld({naam:bestaand.naam, klant:bestaand.naam, contactNaam:g.naam, uitkomst:g.uk}, klaar);
    let gemaakt = null;
    return gebeld({naam:g.bedrijf, contactNaam:g.naam, uitkomst:g.uk, radar:{
      id:'nieuw:' + g.bedrijf,
      naarKlant: async () => { gemaakt = await maakLead(g); return gemaakt && gemaakt.klant; },
      negeer: async () => true
    }, naContact: () => gemaakt && gemaakt.contactId}, klaar);
  }

  CRM.salesmeter = {doel, tel, opvolgen, gebeld, belNieuw, belEnVraag, naKennismaking, kiesReden, UITKOMST, KOUDE_FASES};
})();
