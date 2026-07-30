/* ═══════════════════════════════════════════════════════════════
   MODULE: HOT VACATURES
   De vacatures waar de meeste druk op zit: op prioriteit, met
   deadline en een meetbaar doel (voorstellen/gesprekken/plaatsingen).
   Leest/schrijft de kolommen hot, hot_prio, deadline, doel_aantal,
   doel_soort en doel_gezet_op op de vacatures-tabel.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const h = CRM.h;
  const S = { open:null, zoek:'' };          // uitgeklapte kaart + zoekterm modal

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

  /* ─── Data ──────────────────────────────────────────────────── */
  const hotVacs = () => CRM.state.vacs.filter(v=>v.hot)
    .sort((a,b)=>(a.hot_prio||999)-(b.hot_prio||999));

  /* Gekoppelde kandidaten: op vacature_id, met terugval op
     klant+functie voor kandidaten zonder koppeling.
     De kandidatenlijst wordt binnen één tekenronde hergebruikt: bij 350
     kandidaten en tien hot vacatures werd hij anders tien keer opnieuw
     opgebouwd (kaart, badge én de deadline-check doen dit elk apart). */
  let _kandCache = null;
  const alleKand = () => {
    if(!_kandCache){
      _kandCache = CRM.kandidaten();
      Promise.resolve().then(() => { _kandCache = null; });   // geldig binnen één tick
    }
    return _kandCache;
  };
  /* Een kandidaat zonder fase (import uit het oude ATS) hoort nergens
     als lopend traject te tellen — leeg is geen positie in de pijplijn. */
  const heeftFase = c => !!c.fase;
  const gekoppeld = v => alleKand().filter(c =>
    (c.vacatureId && String(c.vacatureId)===String(v.id)) ||
    (!c.vacatureId && !!v.klant && !!v.functie && c.klant===v.klant && c.functie===v.functie));

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
    if(!v.doel_aantal || !v.doel_gezet_op || !v.deadline) return true;
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
    {lbl:'in voorselectie',    fases:['Voorselectie','Voorgesteld','O&O sessie'],              kleurFase:'Voorselectie'},
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

  /* ─── Kaart-HTML ────────────────────────────────────────────── */
  function kaartHtml(v, i, n){
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
    const zin = doel ? `minimaal ${doel} ${woord(doel, v.doel_soort)} voor ${dagLang(v.deadline)}`
                     : 'nog geen doel ingesteld';
    const status = !doel ? `<span class="meta">stel een doel in via Bewerken</span>`
      : gehaald ? `<span class="doel-ok">doel gehaald ✓</span>`
      : `<span class="num">${beh}</span> van <span class="num">${doel}</span> · nog ${doel-beh} te gaan`;
    const pct = doel ? Math.min(100, beh/doel*100) : 0;

    // Mini-funnel
    const blok = FUNNEL.map(f => ({...f, n: lopend.filter(c => f.fases.includes(c.fase)).length,
                                   c: CRM.faseKleur(f.kleurFase)}));
    const totaal = blok.reduce((s,b)=>s+b.n, 0);
    const segbar = totaal ? `<div class="hot-segbar" style="width:${Math.min(340, totaal*34)}px">${blok.filter(b=>b.n).map(b =>
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
          <span class="chip">${heeftFase(c) ? h(c.fase) : 'geen fase'}</span>
          <span class="hk-actie">${h(c.volgendeActie
              ? c.volgendeActie + (c.actieDatum ? ' · ' + CRM.fmtDateShort(c.actieDatum) : '')
              : (c.datum && dat(c.datum) >= vandaag && !EIND.includes(c.fase) ? 'afspraak ' + CRM.fmtDay(c.datum) + (c.tijd?' '+c.tijd:'') : ''))}</span>
          <span class="hk-ga">→</span>
        </div>`).join('')}
      ${zonderFase ? `<div class="meta" style="margin-top:8px">${zonderFase} hiervan ${zonderFase===1?'heeft':'hebben'} geen fase
        (import uit het oude ATS) — die tellen niet mee in de funnel of het doel.</div>` : ''}
    </div>`;

    return `<div class="hotcard${i===0?' top':''}${open?' open':''}" data-id="${h(v.id)}" draggable="true">
      <div class="hot-top">
        <div class="hot-prio">
          <span class="hot-nr num">${i+1}</span>
          <div class="hot-pijlen">
            <button class="pijl" data-up title="Hoger" ${i===0?'disabled':''}>▲</button>
            <button class="pijl" data-down title="Lager" ${i===n-1?'disabled':''}>▼</button>
          </div>
        </div>
        <div class="hot-wie">
          <div class="hot-titel">${h(v.klant)} — ${h(v.functie)}</div>
          <div class="hot-sub">${h(v.locatie||'')}${v.locatie?' · ':''}${v.aantal||1} ${(v.aantal||1)===1?'positie':'posities'}${v.eigenaar?' · '+h(v.eigenaar):''}</div>
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
          <button class="btn sub sm" data-bewerk>Bewerken</button>
          <button class="btn sub sm" data-taak>+ Taak</button>
          <button class="btn sub sm" data-af>Niet meer hot</button>
        </div>
      </div>
      ${uitklap}
    </div>`;
  }

  /* ─── Tekenen + interactie ──────────────────────────────────── */
  function draw(mount){
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
      vacs.map((v,i) => kaartHtml(v, i, vacs.length)).join('')}</div>`;

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
        draw(mount);
      });

      // Prioriteit: pijltjes
      const up = kaart.querySelector('[data-up]'), down = kaart.querySelector('[data-down]');
      const verplaats = async richting => {
        const ids = hotVacs().map(x => String(x.id));
        const i = ids.indexOf(id), j = i + richting;
        if(j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await zetVolgorde(ids);
        draw(mount); CRM.navBadges();
      };
      if(up)   up.onclick   = e => { e.stopPropagation(); verplaats(-1); };
      if(down) down.onclick = e => { e.stopPropagation(); verplaats(1);  };

      // Beheer
      kaart.querySelector('[data-bewerk]').onclick = e => { e.stopPropagation(); instelModal(v, false, mount); };
      kaart.querySelector('[data-taak]').onclick = e => {
        e.stopPropagation();
        CRM.taakModal({entiteit:'vacature', ref:v.id, refLabel:`${v.klant} – ${v.functie}`});
      };
      kaart.querySelector('[data-af]').onclick = async e => {
        e.stopPropagation();
        const ok = await CRM.bevestig(`${v.klant} – ${v.functie} niet meer hot?`,
          'De vacature blijft gewoon open; alleen de deadline-druk verdwijnt van dit bord.');
        if(!ok) return;
        if(!await bewaarVac(v, {hot:false, hot_prio:null})) return;
        await zetVolgorde(hotVacs().map(x => String(x.id)));   // hernummeren
        if(S.open === id) S.open = null;
        CRM.toast('Niet meer hot','ok');
        draw(mount); CRM.navBadges();
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
        draw(mount); CRM.navBadges();
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

  /* ─── "+ Hot maken": open vacature kiezen ───────────────────── */
  function hotMakenModal(){
    const kandidaten = CRM.state.vacs.filter(v => !v.hot && (v.status||'Open') === 'Open');
    if(!kandidaten.length){ CRM.toast('Alle open vacatures zijn al hot'); return; }
    S.zoek = '';
    const lijstHtml = q => {
      const t = q.trim().toLowerCase();
      const rij = kandidaten.filter(v => !t || (v.klant+' '+v.functie+' '+(v.locatie||'')).toLowerCase().includes(t));
      return rij.length ? rij.map(v => `<div class="hm-item" data-id="${h(v.id)}">
          <div><b>${h(v.klant)} — ${h(v.functie)}</b>
          <div class="meta">${h(v.locatie||'')}${v.locatie?' · ':''}${v.aantal||1} ${(v.aantal||1)===1?'positie':'posities'}</div></div>
          <span class="hk-ga">→</span>
        </div>`).join('') : `<div class="meta" style="padding:14px 4px">Geen open vacatures gevonden.</div>`;
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
  function instelModal(v, nieuw, mount){
    const oudAantal = v.doel_aantal, oudSoort = v.doel_soort;
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">${nieuw ? 'Hot maken' : 'Deadline en doel bewerken'}</div>
        <div class="meta" style="margin-top:2px">${h(v.klant)} – ${h(v.functie)}</div></div>
      <div class="modal-b">
        <div class="f-grid">
          <div class="f-row"><label>Deadline</label>
            <input type="date" id="hi_deadline" value="${h(dat(v.deadline)||'')}" min="${CRM.todayISO()}"></div>
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
        ${!nieuw ? `<div class="hint" style="margin-top:8px">Wijzig je het doel, dan telt de voortgang opnieuw vanaf vandaag.</div>` : ''}
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="hi_save">${nieuw ? 'Hot maken' : 'Opslaan'}</button>
      </div>`, {onOpen(m){
        const iDl = m.querySelector('#hi_deadline'), iN = m.querySelector('#hi_aantal'),
              iS = m.querySelector('#hi_soort'), prev = m.querySelector('#hi_preview');
        const teken = () => {
          const n = Math.max(1, parseInt(iN.value,10)||0);
          prev.innerHTML = iDl.value
            ? `minimaal ${n} ${h(woord(n, iS.value))} voor ${h(dagLang(iDl.value))}`
            : `<span class="meta">kies een deadline om de doelzin te zien</span>`;
        };
        [iDl,iN,iS].forEach(el => { el.oninput = teken; el.onchange = teken; });
        teken();
        m.querySelector('#hi_save').onclick = async () => {
          const deadline = iDl.value, aantal = Math.max(1, parseInt(iN.value,10)||0);
          if(!deadline){ iDl.focus(); return; }
          const patch = {deadline, doel_aantal:aantal, doel_soort:iS.value};
          if(nieuw){
            patch.hot = true;
            patch.hot_prio = hotVacs().length + 1;                 // achteraan
            patch.doel_gezet_op = CRM.todayISO();
          }else if(aantal !== oudAantal || iS.value !== oudSoort){
            patch.doel_gezet_op = CRM.todayISO();                  // doel gewijzigd → opnieuw tellen
          }
          if(!await bewaarVac(v, patch)) return;
          CRM.modal.close();
          CRM.toast(nieuw ? `${v.klant} – ${v.functie} is nu hot` : 'Bijgewerkt', 'ok');
          const mnt = mount || document.getElementById('viewmount');
          if(CRM.view === 'hot' && mnt) draw(mnt);
          CRM.navBadges();
        };
      }});
  }

  /* ─── Registratie ───────────────────────────────────────────── */
  CRM.registerModule('hot', {
    title:'Hot vacatures', icon:'◆',
    onderschrift:'De vacatures met de meeste druk — met deadline en doel',
    badge(){
      try{
        return hotVacs().filter(v => {
          const rest = restDagen(v);
          if(rest != null && rest <= 5) return true;
          return !opKoers(v);
        }).length;
      }catch(e){ return 0; }
    },
    render(mount, acties){
      _kandCache = null;                       // altijd verse data bij een paginawissel
      acties.innerHTML = `<button class="btn" id="hot_add">+ Hot maken</button>`;
      acties.querySelector('#hot_add').onclick = hotMakenModal;
      draw(mount);
      checkMeldingen();
    }
  });
})();
