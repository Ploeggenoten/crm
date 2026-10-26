/* ═══ GLAS — de dashboardstijl door het hele CRM ═══════════════════
   Tjeerd, 26 okt 2026: "rol de stijl verder uit naar het hele CRM",
   gekozen variant = glazen kop per module + glazen kaarten, kolommen,
   tabellen en velden op de warme studio-achtergrond (zie css/glas.css).

   Gefaseerd, net als de cockpitstrook: zolang GLAS_VOOR_IEDEREEN uit
   staat, ziet alleen de eigenaar het. Aan/uit gaat via de klasse
   body.glas, die core.js bij elke render zet (CRM.glasAan()).

   De kop van elke module is de bestaande paginakop (header.pagehead),
   in glas. Een module krijgt er hier vier kerncijfers bij; staat een
   module niet in de lijst, dan blijft het bij titel en knoppen.
   Geen bedragen: de kop staat ook op het teamscherm. */
(function(){
  const GLAS_VOOR_IEDEREEN = true;
  CRM.glasAan = () => GLAS_VOOR_IEDEREEN || !!(CRM.canSeeMoney && CRM.canSeeMoney());

  const vandaag = () => CRM.todayISO();
  const kort = x => String(x || '').slice(0, 10);
  const maandagISO = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('sv-SE'); };
  const maand = () => vandaag().slice(0, 7);
  const st = () => CRM.state || {};
  const open = v => (v.status || 'Open') === 'Open';

  const K = {
    sales(){
      const kl = st().clients || [];
      return [
        [kl.filter(k => (CRM.SALES_ACTIEF || []).includes(k.fase)).length, 'klanten in traject'],
        [(st().kansen || []).filter(k => (k.status || 'open') === 'open').length, 'open kansen'],
        [kl.filter(k => k.fase === 'Gesprek ingepland').length, 'gesprekken gepland'],
        [CRM.salesmeter ? CRM.salesmeter.opvolgen().n : 0, 'opvolgen vandaag']
      ];
    },
    klanten(){
      const kl = st().clients || [];
      return [
        [kl.length, 'relaties'],
        [kl.filter(k => k.fase === 'Afgerond').length, 'actieve klanten'],
        [(st().contacten || []).length, 'contactpersonen'],
        [(st().vacs || []).filter(open).length, 'open vacatures']
      ];
    },
    recruitment(){
      const ld = (st().leads || []).filter(l => !l.kandidaat_id);
      const ma = maandagISO();
      return [
        [ld.filter(l => CRM.leadIn(l.status, CRM.LEAD_OPEN)).length, 'sollicitanten open'],
        [ld.filter(l => CRM.leadIn(l.status, ['Nieuw', 'Geen gehoor'])).length, 'nog bellen'],
        [ld.filter(l => CRM.leadIs(l.status, 'Intake ingepland')).length, 'intake gepland'],
        [(st().leads || []).filter(l => kort(l.binnen_op || l.created_at) >= ma).length, 'binnen deze week']
      ];
    },
    pijplijn(){
      const cs = CRM.kandidaten(), ma = maandagISO();
      const lopend = cs.filter(c => CRM.isActiefLopend(c) && !CRM.PLACED.includes(c.fase));
      return [
        [lopend.length, 'in een traject'],
        [lopend.filter(c => ['Eerste gesprek', 'Tweede gesprek', 'Meeloopdag', 'Offer', 'Contract ondertekenen'].includes(c.fase)).length, 'in gesprek'],
        [cs.filter(c => c.voorgesteldOp && kort(c.voorgesteldOp) >= ma).length, 'voorgesteld deze week'],
        [cs.filter(c => CRM.teltAlsPlaatsing(c) && kort(c.geplaatstOp).slice(0, 7) === maand()).length, 'getekend deze maand']
      ];
    },
    plaatsingen(){
      const cs = CRM.kandidaten();
      let pm = null; try{ pm = CRM.plaatsingenMaand && CRM.plaatsingenMaand(); }catch(e){}
      const doel = CRM.maandTarget ? CRM.maandTarget() : null;
      return [
        [pm ? `${pm.netto}<small>/${doel || '–'}</small>` : '–', 'netto deze maand'],
        [cs.filter(c => CRM.PLACED.includes(c.fase) && !c.gestoptOp).length, 'aan het werk'],
        [cs.filter(c => CRM.teltAlsStop(c) && kort(c.gestoptOp).slice(0, 7) === maand()).length, 'gestopt deze maand'],
        [cs.filter(c => c.start && kort(c.start) >= vandaag() && !c.gestoptOp).length, 'starts gepland']
      ];
    },
    hot(){
      const v = (st().vacs || []).filter(open);
      return [
        [v.length, 'open vacatures'],
        [v.reduce((n, x) => n + (Number(x.aantal) || 1), 0), 'posities'],
        [v.filter(x => x.hot).length, 'hot'],
        [new Set(v.map(x => x.klant)).size, 'klanten']
      ];
    },
    kandidaten(){
      const cs = CRM.kandidaten();
      return [
        [cs.length, 'kandidaten'],
        [cs.filter(c => CRM.isActiefLopend(c) && !CRM.PLACED.includes(c.fase)).length, 'in een traject'],
        [cs.filter(c => CRM.PLACED.includes(c.fase) && !c.gestoptOp).length, 'aan het werk'],
        [cs.filter(c => CRM.inTalentpool(c)).length, 'in de talentpool']
      ];
    },
    marketing(){
      const ld = st().leads || [], ma = maandagISO();
      const wk = ld.filter(l => kort(l.binnen_op || l.created_at) >= ma);
      return [
        [wk.length, 'leads deze week'],
        [ld.filter(l => CRM.leadIs(l.status, 'Nieuw') && !l.kandidaat_id).length, 'nog niet gebeld'],
        [wk.filter(l => CRM.leadIs(l.status, 'Intake ingepland') || l.kandidaat_id).length, 'naar intake'],
        [(st().vacs || []).filter(x => open(x) && x.hot).length, 'hot vacatures']
      ];
    }
  };

  /* De kerncijfers in de paginakop, als het glas aanstaat. */
  CRM.glasKop = (view, head) => {
    if(!head || !K[view]) return;
    let rij;
    try{ rij = K[view](); }catch(e){ console.warn('kerncijfers', view, e); return; }
    const el = document.createElement('div');
    el.className = 'gk-cijfers';
    el.innerHTML = rij.map(([n, l]) => `<span class="gk-k"><b class="num">${n}</b><span>${CRM.h(l)}</span></span>`).join('');
    const t = head.querySelector('.ph-t');
    if(t) t.after(el); else head.appendChild(el);
  };
})();
