/* ═══════════════════════════════════════════════════════════════
   PLOEGGENOTEN CRM — GEDEELDE DOMEINLOGICA
   Constanten en berekeningen die meerdere modules gebruiken.
   Één plek, zodat fases en kleuren overal identiek zijn.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Recruitment-pijplijn (identiek aan het bestaande pijplijnbord) ─── */
CRM.PHASES = [
  {k:'Voorselectie',c:'#9aa3b2'},{k:'Voorgesteld',c:'#5b8bbf'},{k:'O&O sessie',c:'#9575b8'},
  {k:'Eerste gesprek',c:'#5a9bd4'},{k:'Tweede gesprek',c:'#4178b0'},{k:'Meeloopdag',c:'#d9a441'},
  {k:'In de wacht',c:'#4a9d9d'},{k:'Offer',c:'#d97941'},{k:'Contract ondertekenen',c:'#6a9e3f'},
  {k:'Contract getekend',c:'#3d9968'},{k:'Gestart',c:'#3d9968'},
  {k:'Afgevallen',c:'#8a8f7a'},{k:'Gestopt',c:'#c0392b'}
];
CRM.PLACED = ['Contract getekend','Gestart'];
CRM.DONE   = ['Contract getekend','Gestart','Afgevallen','Gestopt'];
CRM.faseKleur = f => (CRM.PHASES.find(p=>p.k===f)||{}).c || '#8a927c';
CRM.faseIdx   = f => CRM.PHASES.findIndex(p=>p.k===f);

CRM.AFVAL_CATS = {
  niet_gekwalificeerd:['Taal','Ervaring/skills','Motivatie','No-show','Fysiek/gezondheid','Klant wees af','Meeloopdag niet goed','Anders'],
  offer_afgewezen:['Salaris te laag','Ander aanbod geaccepteerd','Reistijd/afstand','Rooster/ploegen','Blijft bij huidige werkgever','Niets meer gehoord','Anders']
};
CRM.STOP_CATS = {
  kandidaat:['Ander werk gevonden','Werk beviel niet','Fysiek te zwaar','Reistijd/vervoer','Privéomstandigheden','Verdwenen/no-show','Anders'],
  klant:['Functioneren onvoldoende','Te weinig werk/krimp','Einde project/seizoen','Conflict/houding','Anders'],
  anders:['Anders']
};

/* ─── Sales-pijplijn (klantzijde) ───────────────────────────────
   Volgorde zoals Tjeerd hem voert. 'Project uitgesteld' en
   'Afgerond' zijn eindfases, geen doorstroom.                    */
CRM.SALES_FASES = [
  {k:'Lead',                  c:'#9aa3b2', hint:'Bedrijf in beeld, nog geen contact'},
  {k:'Suspect',               c:'#7f93b8', hint:'Eerste contact gelegd'},
  {k:'Prospect',              c:'#5b8bbf', hint:'Interesse bevestigd'},
  {k:'In afwachting kennismaking', c:'#4a9d9d', hint:'Wacht op reactie voor afspraak'},
  {k:'Gesprek ingepland',     c:'#5a9bd4', hint:'Kennismaking staat in de agenda'},
  {k:'Voorstel gedaan',       c:'#d9a441', hint:'Aanbod/plan van aanpak verstuurd'},
  {k:'SWO gestuurd',          c:'#d97941', hint:'Samenwerkingsovereenkomst verstuurd'},
  {k:'Onderhandeling',        c:'#c98a2e', hint:'Voorwaarden en tarief bespreken'},
  {k:'Afgerond',              c:'#3d9968', hint:'Getekend — actieve klant'},
  {k:'Project uitgesteld',    c:'#8a8f7a', hint:'Later opnieuw benaderen'}
];
CRM.SALES_ACTIEF  = ['Lead','Suspect','Prospect','In afwachting kennismaking','Gesprek ingepland','Voorstel gedaan','SWO gestuurd','Onderhandeling'];
CRM.SALES_KLANT   = ['Afgerond'];
CRM.salesKleur = f => (CRM.SALES_FASES.find(p=>p.k===f)||{}).c || '#8a927c';

/* ─── Kandidaat-leads (vóór de pijplijn) ────────────────────────
   Statussen die een AM aan een binnengekomen lead geeft.        */
CRM.LEAD_STATUS = [
  {k:'Nieuw',                c:'#5b8bbf', ico:'✨'},
  {k:'Gebeld — geen gehoor', c:'#9aa3b2', ico:'📵'},
  {k:'Geen interesse',       c:'#8a8f7a', ico:'✕'},
  {k:'Niet geschikt',        c:'#a08a7a', ico:'⊘'},
  {k:'Potentieel',           c:'#d9a441', ico:'⭐'},
  {k:'Potentieel — andere vacature', c:'#9575b8', ico:'🔀'},
  {k:'Intake gepland',       c:'#3d9968', ico:'📅'},
  {k:'Doorgeschoten',        c:'#2f8f5b', ico:'→'}
];
CRM.LEAD_OPEN   = ['Nieuw','Gebeld — geen gehoor','Potentieel','Potentieel — andere vacature','Intake gepland'];
CRM.leadKleur   = s => (CRM.LEAD_STATUS.find(x=>x.k===s)||{}).c || '#8a927c';
CRM.leadIco     = s => (CRM.LEAD_STATUS.find(x=>x.k===s)||{}).ico || '•';
CRM.LEAD_BRONNEN = ['Meta','Indeed','WhatsApp','Website','Referral','Handmatig','Anders'];

/* ─── Activiteitsoorten ─────────────────────────────────────── */
CRM.ACT_SOORTEN = {
  notitie:{ico:'📝', lbl:'Notitie'}, bel:{ico:'📞', lbl:'Gebeld'},
  mail:{ico:'✉️', lbl:'E-mail'},     whatsapp:{ico:'💬', lbl:'WhatsApp'},
  gesprek:{ico:'🤝', lbl:'Gesprek'}, bezoek:{ico:'🏭', lbl:'Bezoek'},
  taak:{ico:'✅', lbl:'Taak'},        fase:{ico:'↗', lbl:'Fasewissel'},
  doc:{ico:'📎', lbl:'Document'},     systeem:{ico:'⚙️', lbl:'Systeem'}
};

/* ─── Afgeleide data ────────────────────────────────────────── */
CRM.kandidaten = () => CRM.state.cands.map(CRM.rowToCand);
CRM.kandidaat  = id => { const r = CRM.state.cands.find(c=>String(c.id)===String(id)); return r?CRM.rowToCand(r):null; };
CRM.klant      = naam => CRM.state.clients.find(c => c.naam === naam) || null;
CRM.vacaturesVan = klant => CRM.state.vacs.filter(v => v.klant === klant);
CRM.kandidatenVan = klant => CRM.kandidaten().filter(c => c.klant === klant);

/* Klantnamen normaliseren (bord ↔ sales ↔ finance schrijven ze net anders). */
CRM.normKlant = s => String(s||'').toLowerCase().replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?)\b/g,'').replace(/[^a-z0-9]/g,'').trim();
CRM.zelfdeKlant = (a,b) => { const x=CRM.normKlant(a), y=CRM.normKlant(b); return !!x && !!y && (x===y || x.slice(0,8)===y.slice(0,8)); };

/* Actieve klanten = klanten met een lopende of geplaatste kandidaat, of
   handmatig als klant gemarkeerd in de clients-tabel. */
CRM.actieveKlanten = () => {
  const metWerk = new Set(CRM.kandidaten().filter(c=>!['Afgevallen','Gestopt'].includes(c.fase)).map(c=>c.klant));
  return CRM.state.clients.filter(c => metWerk.has(c.naam) || c.fase === 'Afgerond');
};

/* Plaatsingen deze maand — exact dezelfde definitie als het bord:
   netto = getekend deze maand − gestopt deze maand. */
CRM.plaatsingenMaand = (mk = new Date().toISOString().slice(0,7)) => {
  const cs = CRM.kandidaten();
  const getekend = cs.filter(c => (c.geplaatstOp||'').slice(0,7)===mk && CRM.PLACED.includes(c.fase));
  const gestopt  = cs.filter(c => c.fase==='Gestopt' && (c.gestoptOp||'').slice(0,7)===mk);
  return {getekend, gestopt, netto: getekend.length - gestopt.length};
};
CRM.maandTarget = (mk = new Date().toISOString().slice(0,7)) => {
  const t = CRM.state.targets.find(t=>t.maand===mk) || CRM.state.targets.find(t=>t.maand==='__default__');
  return t ? t.aantal : 8;
};

/* Filter "mijn" — elke AM kijkt standaard naar zijn eigen klanten/leads. */
CRM.isVanMij = obj => {
  const mij = CRM.me();
  return !mij || obj?.eigenaar === mij || obj?.rec === mij || obj?.am === mij;
};

/* Kandidaat ↔ vacature matchen op functie en woonplaats.
   Bewust simpel en uitlegbaar: functiewoorden + zelfde plaats. */
CRM.matchScore = (kandidaat, vacature) => {
  if(!kandidaat || !vacature) return 0;
  let score = 0;
  const woorden = s => String(s||'').toLowerCase().split(/[^a-z]+/).filter(w=>w.length>3);
  const kf = new Set([...woorden(kandidaat.functie), ...woorden(kandidaat.cv?.functie), ...(kandidaat.cv?.skills||[]).map(s=>String(s).toLowerCase())]);
  const vf = woorden(vacature.functie);
  const overlap = vf.filter(w => kf.has(w)).length;
  if(vf.length) score += (overlap / vf.length) * 60;
  const kp = String(kandidaat.woonplaats||'').toLowerCase().trim();
  const vp = String(vacature.locatie||'').toLowerCase().trim();
  if(kp && vp){ if(kp===vp) score += 30; else if(vp.includes(kp)||kp.includes(vp)) score += 18; }
  else score += 8;
  if(kandidaat.cv?.ervaringJaren >= 1) score += 10;
  return Math.round(Math.min(100, score));
};
CRM.besteMatches = (kandidaat, n=5) => CRM.state.vacs
  .map(v => ({vacature:v, score:CRM.matchScore(kandidaat, v)}))
  .filter(m => m.score >= 30)
  .sort((a,b)=>b.score-a.score).slice(0,n);

/* Kandidaat-volledigheid: tegen vervuiling in het systeem. */
CRM.VELDEN_VERPLICHT = [
  {k:'naam', lbl:'Naam'}, {k:'telefoon', lbl:'Telefoonnummer'}, {k:'woonplaats', lbl:'Woonplaats'},
  {k:'functie', lbl:'Gezochte functie'}, {k:'bron', lbl:'Bron'}
];
CRM.volledigheid = c => {
  const mist = CRM.VELDEN_VERPLICHT.filter(v => !String(c?.[v.k]||'').trim());
  const extra = [c?.email, c?.cv, c?.intake].filter(Boolean).length;
  const basis = (CRM.VELDEN_VERPLICHT.length - mist.length) / CRM.VELDEN_VERPLICHT.length * 75;
  return {pct: Math.round(basis + extra*8.33), mist};
};
