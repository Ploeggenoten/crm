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
CRM.plaatsingenMaand = (mk = CRM.todayISO().slice(0,7)) => {
  const cs = CRM.kandidaten();
  const getekend = cs.filter(c => (c.geplaatstOp||'').slice(0,7)===mk && CRM.PLACED.includes(c.fase));
  const gestopt  = cs.filter(c => c.fase==='Gestopt' && (c.gestoptOp||'').slice(0,7)===mk);
  return {getekend, gestopt, netto: getekend.length - gestopt.length};
};
CRM.maandTarget = (mk = CRM.todayISO().slice(0,7)) => {
  const t = CRM.state.targets.find(t=>t.maand===mk) || CRM.state.targets.find(t=>t.maand==='__default__');
  return t ? t.aantal : 8;
};

/* Filter "mijn" — elke AM kijkt standaard naar zijn eigen klanten/leads. */
CRM.isVanMij = obj => {
  const mij = CRM.me();
  return !mij || obj?.eigenaar === mij || obj?.rec === mij || obj?.am === mij;
};

/* ─── Reisafstand ────────────────────────────────────────────
   Coördinaten van de plaatsen waar wij werken, zodat het systeem kan
   uitleggen waaróm iemand bij een vacature past. Onbekende plaats ⇒ null;
   dan valt de score terug op naamvergelijking in plaats van te gokken. */
CRM.PLAATSEN = {
  'rotterdam':[51.924,4.478], 'denhaag':[52.078,4.288], 'sgravenhage':[52.078,4.288],
  'gouda':[52.011,4.711], 'alphena/drijn':[52.129,4.655], 'zoetermeer':[52.057,4.494],
  'leiden':[52.160,4.490], 'bodegraven':[52.081,4.749], 'waddinxveen':[52.045,4.653],
  'delft':[52.011,4.357], 'katwijk':[52.203,4.399], 'schiedam':[51.919,4.389],
  'vlaardingen':[51.912,4.341], 'rijnsburg':[52.190,4.443], 'zaandam':[52.439,4.826],
  'barendrecht':[51.855,4.535], 'nieuwkoop':[52.148,4.777], 'sliedrecht':[51.822,4.774],
  'bunnik':[52.065,5.199], 'nieuwvennep':[52.265,4.630], 'maasdijk':[51.981,4.196],
  'almere':[52.370,5.216], 'ijmuiden':[52.460,4.610], 'krimpena/dijssel':[51.917,4.593],
  'nunspeet':[52.378,5.784], 'bleiswijk':[52.019,4.531], 'utrecht':[52.090,5.121],
  'amsterdam':[52.370,4.895], 'dordrecht':[51.813,4.690], 'zwijndrecht':[51.817,4.633],
  'spijkenisse':[51.845,4.329], 'capellea/dijssel':[51.930,4.577], 'ridderkerk':[51.872,4.602],
  'hoofddorp':[52.303,4.689], 'amstelveen':[52.309,4.856], 'woerden':[52.086,4.884],
  'zeist':[52.088,5.233], 'rijswijk':[52.036,4.325], 'voorburg':[52.070,4.360],
  'naaldwijk':[51.994,4.208], 'pijnacker':[52.019,4.432], 'berkelenrodenrijs':[51.995,4.481],
  'boskoop':[52.075,4.653], 'zevenhuizen':[52.010,4.610], 'moordrecht':[51.985,4.663],
  'nieuwerkerka/dijssel':[51.975,4.615], 'papendrecht':[51.831,4.685], 'hendrikidoambacht':[51.843,4.640],
  'oudbeijerland':[51.826,4.412], 'maassluis':[51.923,4.253], 'delier':[51.968,4.253],
  'wateringen':[52.020,4.283], 'monster':[52.023,4.170], 'nootdorp':[52.040,4.400],
  'leidschendam':[52.086,4.400], 'wassenaar':[52.146,4.400], 'voorschoten':[52.128,4.446],
  'oegstgeest':[52.180,4.470], 'noordwijk':[52.240,4.443], 'sassenheim':[52.223,4.523],
  'lisse':[52.257,4.557], 'hillegom':[52.290,4.583], 'haarlem':[52.381,4.637],
  'alkmaar':[52.632,4.749], 'purmerend':[52.505,4.960], 'lelystad':[52.518,5.471],
  'amersfoort':[52.156,5.388], 'apeldoorn':[52.211,5.970], 'arnhem':[51.985,5.899],
  'nijmegen':[51.842,5.853], 'breda':[51.586,4.776], 'shertogenbosch':[51.697,5.304],
  'eindhoven':[51.441,5.470], 'tilburg':[51.560,5.091], 'gorinchem':[51.837,4.975],
  'vianen':[51.988,5.093], 'culemborg':[51.955,5.226], 'veenendaal':[52.028,5.554]
};
CRM.plaatsSleutel = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/\baan\s+de[nr]?\s+/g,'a/d ').replace(/[^a-z0-9/]/g,'');
CRM.afstandKm = (a,b) => {
  const pa = CRM.PLAATSEN[CRM.plaatsSleutel(a)], pb = CRM.PLAATSEN[CRM.plaatsSleutel(b)];
  if(!pa || !pb) return null;
  const R = 6371, rad = d => d*Math.PI/180;
  const dLat = rad(pb[0]-pa[0]), dLon = rad(pb[1]-pa[1]);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(pa[0]))*Math.cos(rad(pb[0]))*Math.sin(dLon/2)**2;
  return Math.round(2*R*Math.asin(Math.sqrt(x)));
};

/* Kandidaat ↔ vacature matchen op functie en woonlocatie.
   Bewust simpel en uitlegbaar: functiewoorden + reisafstand. */
CRM.matchScore = (kandidaat, vacature) => {
  if(!kandidaat || !vacature) return 0;
  let score = 0;
  const woorden = s => String(s||'').toLowerCase().split(/[^a-z]+/).filter(w=>w.length>3);
  const kf = new Set([...woorden(kandidaat.functie), ...woorden(kandidaat.cv?.functie), ...(kandidaat.cv?.skills||[]).map(s=>String(s).toLowerCase())]);
  const vf = woorden(vacature.functie);
  const overlap = vf.filter(w => kf.has(w)).length;
  if(vf.length) score += (overlap / vf.length) * 60;

  const km = CRM.afstandKm(kandidaat.woonplaats, vacature.locatie);
  if(km != null){
    // Blue collar: reistijd is een echte uitvalreden. Dichtbij weegt zwaar.
    if(km <= 10) score += 30; else if(km <= 20) score += 24;
    else if(km <= 30) score += 16; else if(km <= 45) score += 8;
  }else{
    const kp = String(kandidaat.woonplaats||'').toLowerCase().trim();
    const vp = String(vacature.locatie||'').toLowerCase().trim();
    if(kp && vp){ if(kp===vp) score += 30; else if(vp.includes(kp)||kp.includes(vp)) score += 18; }
    else score += 8;
  }
  if(kandidaat.cv?.ervaringJaren >= 1) score += 10;
  return Math.round(Math.min(100, score));
};
CRM.besteMatches = (kandidaat, n=5) => CRM.state.vacs
  .map(v => ({vacature:v, score:CRM.matchScore(kandidaat, v)}))
  .filter(m => m.score >= 30)
  .sort((a,b)=>b.score-a.score).slice(0,n);

/* ─── Kwalificatie- en zoekhelpers (filters, Source-kaart) ────── */
CRM.BESCHIKBAAR = ['direct','in overleg','niet'];
CRM.PLOEGEN     = ['geen','2-ploegen','3-ploegen','5-ploegen','wisselend'];
CRM.VERVOER     = ['auto','ov','fiets','geen'];
CRM.sterren = n => { const s=Math.max(0,Math.min(5,Number(n)||0));
  return s ? '★'.repeat(s)+'☆'.repeat(5-s) : '—'; };
/* Woont deze kandidaat binnen X km van een plaats? Onbekende plaats telt
   NIET mee (eerlijk blijven — liever geen resultaat dan een gok). */
CRM.binnenRadius = (kandidaat, plaats, km) => {
  const d = CRM.afstandKm(kandidaat?.woonplaats, plaats);
  return d != null && d <= km;
};
/* Beschikbare pool = niet in een lopend traject: afgevallen-maar-recyclebaar
   of expliciet beschikbaar gemarkeerd. Actief lopend = in de pijplijn. */
CRM.isActiefLopend = c => !CRM.DONE.includes(c.fase) || CRM.PLACED.includes(c.fase) && !c.gestoptOp;
CRM.isBeschikbaar  = c => c.beschikbaar === 'direct' || c.beschikbaar === 'in overleg'
  || (c.fase === 'Afgevallen' && c.recyclebaar === true);

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
