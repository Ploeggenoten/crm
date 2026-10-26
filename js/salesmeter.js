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
        geen interesse         → klaar; over 3 maanden nog eens proberen
      Die taken hangen aan de klant (of contactpersoon), dus ze staan
      vanzelf in Sales → Opvolgingen. Er is bewust géén tweede lijst.

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
    {k:'geen_gehoor', ico:'📵', lbl:'Geen gehoor',             hint:'Opnieuw over 2 werkdagen · max. 3 pogingen'},
    {k:'receptie',    ico:'☎️', lbl:'Receptie / niet de beslisser', hint:'Naam beslisser noteren · opnieuw over 2 werkdagen'},
    {k:'later',       ico:'⏰', lbl:'Bel later terug',          hint:'Jij kiest de datum'},
    {k:'info',        ico:'✉️', lbl:'Info gemaild',             hint:'Nabellen over 3 werkdagen'},
    {k:'afspraak',    ico:'🤝', lbl:'Afspraak gemaakt',         hint:'Fase "Gesprek ingepland" · telt voor je weekdoel', hoofd:true},
    {k:'geen_interesse', ico:'✕', lbl:'Geen interesse',         hint:'Klaar · over 3 maanden nog eens'}
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
      && (t.entiteit === 'klant' || t.entiteit === 'contact') && t.datum && String(t.datum).slice(0,10) <= vandaag);
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

  /* ─── Taak klaarzetten (zonder venster) ──────────────────────── */
  async function taak(klant, contactId, tekst, datum, prioriteit = 'normaal'){
    const rij = {id:CRM.uid(), tekst, datum, tijd:'', klaar:false,
      entiteit: contactId ? 'contact' : 'klant', ref: String(contactId || klant),
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
    const uk = await kies(ctx.naam || ctx.klant || '');
    if(!uk) return;
    const u = UITKOMST[uk];

    /* Koud of niet bepalen we vóór er iets verandert aan de fase. */
    let klant = ctx.klant || '';
    const vooraf = klant ? CRM.klant(klant) : null;
    const koud = ctx.radar ? true : !!(vooraf && KOUDE_FASES.includes(vooraf.fase || 'Lead'));

    let extraInfo = null;
    if(uk === 'receptie'){
      extraInfo = await CRM.vraag('Wie is de beslisser?', {knop:'Vastleggen', placeholder:'Naam en functie (mag leeg)'});
    }
    let afspraak = null;
    if(uk === 'later' || uk === 'afspraak'){
      afspraak = await kiesDatum(uk === 'afspraak' ? 'Wanneer is de kennismaking?' : 'Wanneer terugbellen?',
        uk === 'afspraak' ? 'Het bedrijf gaat naar "Gesprek ingepland" en de afspraak telt mee voor je weekdoel.' : '',
        werkdagenErbij(uk === 'afspraak' ? 3 : 1));
      if(!afspraak) return;
    }
    let reden = '';
    if(uk === 'geen_interesse') reden = await CRM.vraag('Geen interesse — reden?', {knop:'Vastleggen', placeholder:'Bijv. werken al met een bureau (mag leeg)'}) || '';

    /* Leadradar: alles behalve "geen interesse" maakt er een lead van, zodat
       de opvolging op één plek staat. */
    if(ctx.radar){
      if(uk === 'geen_interesse'){
        await CRM.logActiviteit('radar', ctx.radar.id, 'bel', `Gebeld — geen interesse${reden?': '+reden:''}`, {uitkomst:uk, koud:true});
        await ctx.radar.negeer(reden ? 'Geen interesse: '+reden : 'Geen interesse (gebeld)');
        CRM.toast('Vastgelegd — de radar slaat dit bedrijf voortaan over', 'ok');
        return klaar && klaar();
      }
      klant = await ctx.radar.naarKlant();
      if(!klant) return;
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
    if(uk === 'geen_gehoor' || uk === 'receptie'){
      if(p < MAX_POGINGEN) await taak(klant, ctx.contactId, `Bel ${n} opnieuw — ${u.lbl.toLowerCase()} (poging ${p+1} van ${MAX_POGINGEN})`, werkdagenErbij(2));
      else CRM.toast(`${MAX_POGINGEN} pogingen zonder gehoor — geen nieuwe belafspraak gezet`);
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
    if(uk === 'geen_interesse'){
      const d = new Date(); d.setMonth(d.getMonth()+3);
      await taak(klant, ctx.contactId, `${klant} nog eens proberen — 3 maanden geleden geen interesse`, iso(d), 'laag');
    }
    if(ctx.taakId) await taakAf(ctx.taakId);

    const t = tel();
    CRM.toast(t.doel ? `${u.lbl} vastgelegd — ${t.vandaag} van ${t.doel.belDag} vandaag` : `${u.lbl} vastgelegd`, 'ok');
    CRM.navBadges && CRM.navBadges();
    if(klaar) klaar();
  }

  CRM.salesmeter = {doel, tel, opvolgen, gebeld, UITKOMST, KOUDE_FASES};
})();
