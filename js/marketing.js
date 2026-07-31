/* ═══════════════════════════════════════════════════════════════
   MODULE: MARKETING
   Wat levert het marketinggeld op, en wat moet er vandaag gebeuren?
   Zes rustige weergaven:
     1. Prestatie — Meta-advertenties + waakhond-adviezen
     2. Keten     — uitgegeven → leads → kandidaten → plaatsingen
     3. Content   — gepland, gepubliceerd, geleerd + het werk dat openstaat
     4. Kanalen   — waar posten we, met welk weekdoel, en werkt dat
     5. Ideeën    — weekthema's, de ideeënbank en wat elders viraal gaat
     6. Radar     — open vacatures zonder content of advertentie
   Bron: de bestaande mkt_*-tabellen, dezelfde database als het
   marketingbord. Schrijven doen we alleen waar dat het werk echt
   vooruit helpt: besluiten, kanalen, weekthema's, taken en een idee
   op het bord zetten. De composer, media-upload, automatisch
   publiceren en de AI-prompts blijven in het marketingbord — die
   dupliceren we hier bewust niet.

   Advertentiekosten zijn niet vertrouwelijk: het hele team ziet de
   uitgaven, budgetten en de kosten per lead en per klik. Eén weergave
   dus, geen rechtenpoort. Fee, marge, omzet en factuurbedragen komen uit
   de fin_*-tabellen, worden hier niet gelezen, en blijven in Finance en
   Performance achter CRM.canSeeMoney() staan.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const h = CRM.h;
  const BORD       = 'https://ploeggenoten.github.io/marketingbord/';
  const ADSMANAGER = 'https://adsmanager.facebook.com/adsmanager/manage/ads';

  const M = {
    geladen:false, bezig:null,      // bezig = de lopende laad-belofte
    meta:[], besluiten:[], posts:[], kanalen:[], taken:[],
    metaFout:null, postsFout:null, kanalenFout:null, takenFout:null, isDemo:false,
    tab:'prestatie', periode:30,
    open:new Set(),                 // uitgeklapte campagnes/advertentiesets
    lbQ:'', lbK:'',                 // zoek + kanaalfilter in de learnings-bibliotheek
    ideeSet:[], afkSet:[],          // de nu getoonde greep uit de inspiratiebanken
    badge:0, mount:null, actiesEl:null
  };

  /* ─── Kleine helpers ──────────────────────────────────────── */
  const N     = n => Number(n)||0;
  const fmtN  = n => Math.round(N(n)).toLocaleString('nl-NL');
  const maal  = (a,b) => (b ? (a/b) : 0).toFixed(1).replace('.',',');
  const isoT  = d => new Date(Date.now() - d*864e5).toLocaleDateString('sv-SE');
  const DAGKORT = ['zo','ma','di','wo','do','vr','za'];
  const DAGNAAM = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];

  /* Adressen uit de database zijn gebruikersinvoer. Alleen http(s) mag in een
     href; alles anders (javascript:, data:) wordt een lege string en dus geen
     link. Zelfde poort als in kandidaten.js en klanten.js. */
  const veiligeUrl = u => { const s = String(u||'').trim(); return /^https?:\/\//i.test(s) ? s : ''; };
  /* Kanaalkleuren zijn ook gebruikersinvoer — ze komen uit een kleurkiezer in
     het marketingbord en gaan als inline stijl het scherm op. Alleen een echte
     hexkleur mag erdoor; de rest valt terug op een token uit base.css, zodat
     niemand via de database eigen CSS de app in schrijft. */
  const veiligeKleur = k => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(k||'').trim())
    ? String(k).trim() : 'var(--line-2)';

  function stat(rows){
    const s = {spend:0, imp:0, kliks:0, leads:0, bereik:0};
    rows.forEach(r => { s.spend+=N(r.uitgegeven); s.imp+=N(r.impressies);
                        s.kliks+=N(r.kliks); s.leads+=N(r.leads); s.bereik+=N(r.bereik); });
    s.cpc = s.kliks ? s.spend/s.kliks : null;
    s.ctr = s.imp   ? s.kliks/s.imp*100 : null;
    s.cpl = s.leads ? s.spend/s.leads : null;
    return s;
  }
  const binnenPeriode = () => { const cut = isoT(M.periode); return M.meta.filter(r => (r.datum||'') >= cut); };

  /* Campagnes, sets en advertenties staan op uitgaven gesorteerd: de
     grootste post bovenaan, zodat de volgorde klopt met de eerste
     cijferkolom. */
  const opWaarde = (a,b) => stat(b.rows).spend - stat(a.rows).spend;

  /* Verschil met richting. Positief = olijf, negatief = rood (CRM.plusMin).
     Bij kosten per lead is lager juist beter, dus draaien we het teken om
     vóórdat de kleur gekozen wordt. Neutraal = geen kleur: een cijfer dat
     op zichzelf niet goed of slecht is (zoals uitgegeven budget). */
  function verschil(nieuw, oud, fmt, richting){
    if(!oud) return `<span class="meta">vorige week nog niets om mee te vergelijken</span>`;
    const v = nieuw - oud;
    if(Math.abs(v) < 0.005) return `<span class="meta">gelijk aan vorige week</span>`;
    const tekst = (v > 0 ? '+' : '−') + fmt(Math.abs(v));
    const cijfer = richting === 'neutraal'
      ? `<span class="num">${tekst}</span>`
      : CRM.plusMin(richting === 'lager' ? -v : v, () => tekst);
    return `${cijfer} <span class="meta">vs ${fmt(oud)}</span>`;
  }

  /* ═══ 1. DATA ════════════════════════════════════════════════ */
  async function veilig(q){
    try{
      const r = await q;
      if(r.error) return {rows:[], fout:r.error};
      return {rows:r.data||[], fout:null};
    }catch(e){ return {rows:[], fout:e}; }
  }
  /* hook, doel en learnings stonden wel in mkt_posts maar werden hier niet
     ingelezen. Zonder learnings is er geen bibliotheek en zonder hook kan
     "Wat werkt" niet zien of cijfers in de eerste zin bij jullie aanslaan. */
  function rowToPost(r){
    return { id:r.id, titel:r.titel||'', kanaal:r.kanaal||'', format:r.format||'',
      fase:r.fase||'Idee', vacature:r.vacature||'', campagne:r.campagne||'',
      doel:r.doel||'', hook:r.hook||'', learnings:r.learnings||'',
      datum:r.publicatie_datum||'', tijd:r.publicatie_tijd||'', link:r.link||'',
      resultaat:(r.resultaat && typeof r.resultaat==='object') ? r.resultaat : {} };
  }

  /* Eén laadronde tegelijk, en wie er tussendoor om vraagt krijgt dezelfde
     belofte terug. Zonder dat wachtwoord kreeg een tweede render een meteen
     vervulde belofte en tekende hij de lege staat over de laadtekst heen —
     een flits "nog geen Meta-data" terwijl de cijfers onderweg waren. */
  function laad(){
    if(M.bezig) return M.bezig;
    M.bezig = (async () => {
      if(CRM.demo){
        demoData(); M.isDemo = true; M.geladen = true; telBadge(); return;
      }
      const [a,b,c,d,e] = await Promise.all([
        veilig(CRM.sb.from('mkt_meta_stats').select('*').order('datum',{ascending:false}).limit(3000)),
        veilig(CRM.sb.from('mkt_ad_besluiten').select('*').order('created_at',{ascending:false})),
        veilig(CRM.sb.from('mkt_posts').select('*')),
        veilig(CRM.sb.from('mkt_kanalen').select('*').order('volgorde')),
        veilig(CRM.sb.from('mkt_taken').select('*').order('datum').order('created_at'))
      ]);
      M.meta = a.rows; M.metaFout = a.fout;
      M.besluiten = b.rows;
      M.posts = c.rows.map(rowToPost); M.postsFout = c.fout;
      M.kanalen = d.rows; M.kanalenFout = d.fout;
      M.taken = e.rows; M.takenFout = e.fout;
      M.geladen = true;
      telBadge();
    })();
    return M.bezig;
  }

  /* Een tabel die niet gelezen kan worden is iets anders dan een tabel die
     leeg is. Dat verschil moet je zien, anders zit je te wachten op een
     synchronisatie die allang draait. */
  function foutBlok(wat, fout){
    const m = String(fout?.message || fout || '');
    const mist = /does not exist|schema cache|relation/i.test(m);
    return `<div class="note err" style="margin-bottom:18px">
      <b>${h(wat)} konden niet geladen worden.</b>
      ${mist
        ? ' De tabel bestaat nog niet in de database. Die wordt door het marketingbord aangemaakt — draai daar het schema, dan verschijnen de cijfers hier vanzelf.'
        : ' Herlaad de pagina. Blijft dit staan, dan mag dit account de marketingtabellen niet lezen en moet dat in Supabase goedgezet worden.'}
      ${m ? `<span class="meta" style="display:block;margin-top:5px">Technische melding: ${h(m)}</span>` : ''}</div>`;
  }
  function telBadge(){
    try{ M.badge = adviezen().length + agentAdviezen().length + nagPosts().length + openTaken().length; }
    catch(e){ M.badge = 0; }
    CRM.navBadges();
  }

  /* ═══ 2. WAAKHOND ════════════════════════════════════════════ */
  /* Adviseert, jij beslist. Een genomen besluit (mkt_ad_besluiten) verbergt
     het advies 14 dagen — zo blijft alleen open werk staan. Eén besluit is
     de uitzondering: "stopzetten". Dat verbergen we juist niet, want het
     stopt hier op het scherm en niet in Ads Manager. Zolang er nog geld
     doorheen loopt blijft de advertentie op de lijst staan. */
  const configRij = b => String(b.advertentie||'').startsWith('__');
  function openBesluit(ad, camp){
    return M.besluiten.find(b => {
      if(configRij(b)) return false;
      if(String(b.advertentie||'') !== ad) return false;
      if(b.campagne && b.campagne !== camp) return false;
      return (b.status||'open') === 'open';
    }) || null;
  }
  /* Adviezen die de mediabuyer-agent zelf in de tabel heeft gezet. Die stonden
     hier tot nu toe ongelezen in de database: de agent schrijft ze, maar het
     CRM liet ze niet zien. */
  function agentAdviezen(){
    return M.besluiten.filter(b => ['advies','budget'].includes(b.besluit)
      && (b.status||'open') === 'open' && !configRij(b));
  }

  function adviezen(){
    if(!M.meta.length) return [];
    const d2 = isoT(2), d7 = isoT(7), d14 = isoT(14);
    const acc = stat(M.meta.filter(r => (r.datum||'') >= isoT(30)));
    const perAd = new Map();
    M.meta.forEach(r => {
      const k = (r.campagne||'—') + '|' + (r.advertentie||'—');
      if(!perAd.has(k)) perAd.set(k, []);
      perAd.get(k).push(r);
    });
    const uit = [];
    for(const [k, rows] of perAd){
      const [campagne, advertentie] = k.split('|');
      const b = openBesluit(advertentie, campagne);
      if(b && b.besluit === 'stop'){
        /* Nog uitgaven ná het stopbesluit = hij staat gewoon nog aan. Dat is
           rood: er lekt geld weg terwijl iedereen denkt dat het geregeld is. */
        const s2  = stat(rows.filter(r => (r.datum||'') >= d2));
        const wie = b.door === 'Claude-agent' ? 'de agent' : (b.door || 'iemand');
        const nog = s2.spend > 1;
        uit.push({
          kleur: nog ? 'red' : 'green',
          titel: nog ? 'Nog niet stopgezet in Ads Manager' : 'Stop bevestigd — geen uitgaven meer',
          uitleg: (nog
            ? `Door ${wie} gemarkeerd om te stoppen, maar er ging de afgelopen twee dagen nog ${CRM.euro(s2.spend,2)} doorheen. Zet hem uit in Ads Manager.`
            : `Door ${wie} gemarkeerd om te stoppen en de laatste twee dagen ${CRM.euro(0,2)} uitgegeven. Rond hem af.`)
            + (b.note ? ` Reden: ${b.note}` : ''),
          cijfers: '',
          campagne, advertentie, keuzes: nog ? ['adsmanager'] : ['afronden'], besluitId: b.id
        });
        continue;
      }
      /* Alleen een besluit van een mens verbergt het advies: "prima zo" of
         "opschalen". Een advies dat de agent zelf in de tabel zette telt niet
         mee — anders zou één budgetnotitie de waakhond veertien dagen laten
         zwijgen over een advertentie die ondertussen ontspoort.
         Zonder leesbare datum kunnen we niet weten of die veertien dagen om
         zijn; dan laten we het advies liever staan dan het voorgoed te
         verbergen. */
      if(b && ['negeer','opschalen'].includes(b.besluit)){
        const dagen = CRM.dagenGeleden(b.created_at);
        if(dagen != null && dagen < 14) continue;
      }
      const s7   = stat(rows.filter(r => (r.datum||'') >= d7));
      const sVor = stat(rows.filter(r => (r.datum||'') >= d14 && (r.datum||'') < d7));
      const s30  = stat(rows);
      if(s7.spend < 20) continue;                        // te weinig om over te oordelen
      const cijfers = `7 dagen: ${CRM.euro(s7.spend)} · ${s7.leads} ${s7.leads===1?'lead':'leads'}`
        + (s7.cpl ? ` · ${CRM.euro(s7.cpl,2)} per lead` : '')
        + (s7.cpc ? ` · CPC ${CRM.euro(s7.cpc,2)}` : '')
        + (s7.ctr!=null ? ` · CTR ${CRM.pct(s7.ctr,2)}` : '');
      const A = (kleur, titel, uitleg, keuzes) =>
        uit.push({kleur, titel, uitleg, cijfers, campagne, advertentie, keuzes});

      if(s7.leads === 0 && s7.spend >= 25){
        A('red','Geld op, geen enkele lead',
          `${CRM.euro(s7.spend)} in zeven dagen zonder één lead.`, ['stop','negeer']); continue;
      }
      if(s7.cpl && acc.cpl && s7.cpl > 2.5*acc.cpl){
        A('red','Kosten per lead uit de bocht',
          `${CRM.euro(s7.cpl,2)} per lead tegen ${CRM.euro(acc.cpl,2)} gemiddeld (${maal(s7.cpl, acc.cpl)}× zo duur).`, ['stop','negeer']); continue;
      }
      if(s7.cpc && s30.cpc && s7.cpc > 1.5*s30.cpc){
        A('amber','CPC loopt op — de creative slijt',
          `CPC ${CRM.euro(s7.cpc,2)} tegen ${CRM.euro(s30.cpc,2)} eigen 30-daags gemiddelde. Zet er een verse variant naast.`, ['stop','negeer']); continue;
      }
      if(s7.ctr!=null && acc.ctr && s7.ctr < 0.6*acc.ctr){
        A('amber','CTR blijft achter',
          `CTR ${CRM.pct(s7.ctr,2)} tegen ${CRM.pct(acc.ctr,2)} gemiddeld — de advertentie pakt niet.`, ['stop','negeer']); continue;
      }
      if(sVor.spend > 0 && s7.spend > 0.8*sVor.spend && sVor.bereik > 0 && s7.bereik < 0.6*sVor.bereik){
        A('amber','Bereik zakt bij gelijk budget',
          `${fmtN(s7.bereik)} bereik tegen ${fmtN(sVor.bereik)} vorige week — het publiek raakt verzadigd.`, ['stop','negeer']); continue;
      }
      if(s7.cpl && acc.cpl && s7.cpl < 0.6*acc.cpl && s7.leads >= 3){
        A('green','Winnaar — overweeg op te schalen',
          `${CRM.euro(s7.cpl,2)} per lead, ver onder het gemiddelde van ${CRM.euro(acc.cpl,2)}.`, ['opschalen','negeer']);
      }
    }
    const orde = {red:0, amber:1, green:2};
    return uit.sort((a,b) => orde[a.kleur] - orde[b.kleur]);
  }

  async function besluit(advertentie, campagne, keuze){
    const rij = {id:CRM.uid(), advertentie, campagne, besluit:keuze,
      status:'open', door:CRM.me(), note:'', created_at:new Date().toISOString()};
    M.besluiten.unshift(rij);
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_ad_besluiten')
        .insert({advertentie, campagne, besluit:keuze, status:'open', door:CRM.me()});
      if(error){
        /* Niets opgeslagen betekent: het advies moet blijven staan. Anders
           verdwijnt het veertien dagen terwijl er niets is vastgelegd. */
        M.besluiten = M.besluiten.filter(b => b !== rij);
        CRM.fout('Besluit opslaan mislukt — het advies blijft staan', error);
        telBadge(); teken(); return;
      }
    }
    CRM.toast(keuze==='stop' ? 'Genoteerd — zet hem ook echt uit in Ads Manager'
            : keuze==='opschalen' ? 'Genoteerd als op te schalen' : 'Genoteerd', 'ok');
    telBadge(); teken();
  }

  /* Een besluit afronden: hij staat écht uit, of het agent-advies is gelezen.
     Daarmee verdwijnt de regel van de lijst in plaats van dat hij eeuwig
     blijft staan. */
  async function rondAf(id){
    const rij = M.besluiten.find(b => String(b.id) === String(id));
    if(!rij) return;
    const oud = rij.status; rij.status = 'bevestigd';
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_ad_besluiten').update({status:'bevestigd'}).eq('id', rij.id);
      if(error){
        rij.status = oud;
        CRM.fout('Afronden mislukt — de regel blijft staan', error);
        telBadge(); teken(); return;
      }
    }
    CRM.toast('Afgerond', 'ok');
    telBadge(); teken();
  }

  /* ═══ 3. KETEN marketing → recruitment ═══════════════════════ */
  const FASE_VOORGESTELD = ['Voorgesteld','O&O sessie','Eerste gesprek','Tweede gesprek','Meeloopdag',
                            'In de wacht','Offer','Contract ondertekenen','Contract getekend','Gestart'];
  const bereikteVoorstel = c =>
    FASE_VOORGESTELD.includes(c.fase) || (c.historie||[]).some(x => FASE_VOORGESTELD.includes(x.fase));

  function keten(){
    const cut   = isoT(M.periode);
    const spend = stat(binnenPeriode()).spend;
    const leads = (CRM.state.leads||[]).filter(l => l.bron === 'Meta' && (l.binnen_op||'').slice(0,10) >= cut);
    const cands = CRM.kandidaten().filter(c => c.bron === 'Meta' && (c.since||'') >= cut);
    const voorg = cands.filter(bereikteVoorstel);
    const plaats = CRM.kandidaten().filter(c => c.bron === 'Meta' && (c.geplaatstOp||'') >= cut
                   && (CRM.PLACED.includes(c.fase) || c.fase === 'Gestopt'));
    return {spend, leads:leads.length, kandidaten:cands.length,
            voorgesteld:voorg.length, geplaatst:plaats.length};
  }

  /* ═══ 4. CONTENT ═════════════════════════════════════════════ */
  const GEPUBLICEERD = p => p.fase === 'Gepubliceerd' || p.fase === 'Learnings';
  const heeftResultaat = p => ['bereik','likes','reacties','leads','weergaven','views']
                              .some(k => N(p.resultaat?.[k]) > 0);
  function nagPosts(){
    return M.posts.filter(p => GEPUBLICEERD(p) && p.datum && !heeftResultaat(p)
                          && CRM.dagenGeleden(p.datum) >= 2);
  }

  /* ═══ 5. VACATURE-RADAR ══════════════════════════════════════ */
  const norm = s => String(s||'').toLowerCase();
  function radar(dagen = 14){
    const cut = isoT(dagen);
    /* De advertentiestructuur is campagne = klant, advertentieset = functie,
       advertentie = hook. Zo matchen we ook: functie op de set, klant op de campagne. */
    const advRijen = M.meta.filter(r => (r.datum||'') >= cut)
      .map(r => ({fn: norm((r.advertentieset||'') + ' ' + (r.advertentie||'')),
                  kl: norm((r.campagne||'') + ' ' + (r.advertentieset||''))}));
    return (CRM.state.vacs||[])
      .filter(v => !v.status || v.status === 'Open')
      .map(v => {
        const sleutel = `${v.klant} — ${v.functie}`;
        const content = M.posts.filter(p => p.vacature === sleutel &&
          ((p.datum||'') >= cut || ['Script klaar','Ingepland'].includes(p.fase)));
        const woorden = norm(v.functie).split(/[^a-z]+/).filter(w => w.length >= 5).map(w => w.slice(0,5));
        const adv = advRijen.some(t => woorden.some(w => t.fn.includes(w))
                                    || (v.klant && t.kl.includes(norm(v.klant))));
        return {v, sleutel, content:content.length, adv,
                dagenOpen: v.aangemaakt ? CRM.dagenGeleden(v.aangemaakt) : null};
      })
      .filter(x => !x.content && !x.adv)
      .sort((a,b) => (b.dagenOpen||0) - (a.dagenOpen||0));
  }

  /* ═══ 5b. MARKETINGTAKEN ═════════════════════════════════════ */
  /* Twee bronnen, één lijst. `mkt_taken` is de weekplanner van het
     marketingbord en staat vol echt werk — die rijen laten we niet vallen.
     Nieuw werk maak je hier met CRM.taakModal, dus in `crm_taken`: dan staat
     het ook op je dashboard, kan het aan een collega, en gaat het mee naar
     Outlook. Twee losse takenlijstjes in één app is precies hoe werk blijft
     liggen — daarom leest deze kaart ze samen en schrijft hij nieuwe taken
     maar op één plek. */
  const weekStartISO = () => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay()+6) % 7));
    return d.toLocaleDateString('sv-SE');
  };
  const bordTaken = () => (M.taken||[]).map(t => ({...t, bron:'bord'}));
  const crmTaken  = () => (CRM.state.taken||[]).filter(t => t.entiteit === 'marketing').map(t => ({...t, bron:'crm'}));
  const alleTaken = () => [...crmTaken(), ...bordTaken()]
    .sort((a,b) => String(a.datum||'9999').localeCompare(String(b.datum||'9999')));
  function openTaken(){
    const vandaag = CRM.todayISO();
    return alleTaken().filter(t => !t.klaar && (!t.datum || t.datum <= vandaag));
  }

  async function taakVink(bron, id, klaar){
    const lijst = bron === 'crm' ? (CRM.state.taken||[]) : (M.taken||[]);
    const t = lijst.find(x => String(x.id) === String(id));
    if(!t) return;
    t.klaar = klaar;
    if(!CRM.demo){
      const {error} = await CRM.sb.from(bron === 'crm' ? 'crm_taken' : 'mkt_taken')
        .update({klaar}).eq('id', t.id);
      if(error){ t.klaar = !klaar; CRM.fout('Taak bijwerken mislukt', error); }
    }
    telBadge(); teken();
  }
  async function taakWeg(id){
    const t = (M.taken||[]).find(x => String(x.id) === String(id));
    if(!t) return;
    if(!await CRM.bevestig('Deze taak verwijderen?', t.tekst)) return;
    M.taken = M.taken.filter(x => x !== t);
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_taken').delete().eq('id', t.id);
      if(error){ M.taken.push(t); CRM.fout('Taak verwijderen mislukt', error); }
    }
    telBadge(); teken();
  }
  async function nieuweTaak(datum){
    const rij = await CRM.taakModal({entiteit:'marketing', ref:'marketing',
      refLabel:'Marketing', datum: datum || CRM.todayISO()});
    if(rij){ telBadge(); teken(); }
  }

  /* ═══ 5c. KANALEN ════════════════════════════════════════════ */
  const kanaalKleur = naam => veiligeKleur((M.kanalen||[]).find(k => k.naam === naam)?.kleur);
  const kanaalStip  = naam => `<span class="mkt-kdot" style="background:${kanaalKleur(naam)}"></span>`;
  /* Kanaalchip mét de kleur die in het marketingbord is ingesteld. Zonder die
     stip zijn alle kanalen grijs en moet je elke regel lezen om te zien waar
     iets stond. */
  const kanaalChip = k => k
    ? `<span class="chip">${kanaalStip(k)}${h(k)}</span>`
    : `<span class="chip">—</span>`;

  function kanaalCijfers(){
    const wk = weekStartISO(), vandaag = CRM.todayISO();
    const namen = [...new Set([...(M.kanalen||[]).map(k => k.naam),
                               ...M.posts.map(p => p.kanaal).filter(Boolean)])];
    return namen.map(naam => {
      const k    = (M.kanalen||[]).find(x => x.naam === naam) || null;
      const alle = M.posts.filter(p => p.kanaal === naam);
      const pub  = alle.filter(GEPUBLICEERD);
      const metB = pub.filter(p => N(p.resultaat?.bereik) > 0);
      return {
        naam, kanaal:k, losseNaam:!k,
        doel:    N(k?.doel_pw),
        week:    pub.filter(p => (p.datum||'') >= wk).length,
        gepland: alle.filter(p => p.fase === 'Ingepland' && (p.datum||'') >= vandaag).length,
        posts:   pub.length, totaal:alle.length,
        bereik:  metB.length ? pub.reduce((s,p) => s + N(p.resultaat?.bereik), 0) / metB.length : null,
        leads:   pub.reduce((s,p) => s + N(p.resultaat?.leads), 0)
      };
    }).sort((a,b) => (a.kanaal?.volgorde ?? 999) - (b.kanaal?.volgorde ?? 999)
                  || a.naam.localeCompare(b.naam));
  }

  async function kanaalZet(naam, veld, waarde){
    const k = (M.kanalen||[]).find(x => x.naam === naam);
    if(!k) return;
    const oud = k[veld]; k[veld] = waarde;
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_kanalen').update({[veld]:waarde}).eq('naam', naam);
      if(error){
        k[veld] = oud;
        CRM.fout(veld === 'doel_pw' ? 'Weekdoel opslaan mislukt' : 'Kleur opslaan mislukt', error);
        teken(); return;
      }
    }
    CRM.toast(veld === 'doel_pw' ? 'Weekdoel opgeslagen' : 'Kleur aangepast', 'ok');
    teken();
  }
  async function kanaalWeg(naam){
    if(M.posts.some(p => p.kanaal === naam)){
      CRM.toast('Er staan nog posts op dit kanaal — die zouden hun kleur en plek verliezen', 'err');
      return;
    }
    if(!await CRM.bevestig(`Kanaal ${naam} verwijderen?`,
        'Het verdwijnt ook uit het marketingbord. Je kunt het daarna gewoon opnieuw toevoegen.')) return;
    const oud = M.kanalen;
    M.kanalen = M.kanalen.filter(k => k.naam !== naam);
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_kanalen').delete().eq('naam', naam);
      if(error){ M.kanalen = oud; CRM.fout('Kanaal verwijderen mislukt', error); }
    }
    teken();
  }
  async function kanaalNieuw(naam, kleur){
    naam = String(naam||'').trim();
    if(!naam){ CRM.toast('Geef het kanaal eerst een naam', 'err'); return; }
    if((M.kanalen||[]).some(k => k.naam.toLowerCase() === naam.toLowerCase())){
      CRM.toast('Dat kanaal bestaat al', 'err'); return;
    }
    const rij = {naam, kleur:veiligeKleur(kleur) === 'var(--line-2)' ? '#5b8bbf' : kleur,
                 volgorde:((M.kanalen||[]).at(-1)?.volgorde || 0) + 1, doel_pw:0};
    M.kanalen = [...(M.kanalen||[]), rij];
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_kanalen').insert(rij);
      if(error){
        M.kanalen = M.kanalen.filter(k => k !== rij);
        CRM.fout('Kanaal toevoegen mislukt', error); teken(); return;
      }
    }
    CRM.toast(`${naam} toegevoegd`, 'ok');
    teken();
  }

  /* ═══ 5d. WEEKTHEMA'S EN INSPIRATIE ══════════════════════════ */
  /* De zeven weekthema's staan in mkt_ad_besluiten als configregel
     '__themas__' — geen aparte tabel, zo heeft het marketingbord het
     opgezet. De nieuwste regel wint (besluiten staan op created_at aflopend). */
  const THEMA_DEFAULT = [
    'Zondag — rust of vooruitblik op de week',
    'Werkvloer-maandag — achter de schermen bij een klant of op kantoor',
    'Team-dinsdag — collega, recruiter of Peter Ploeg uitgelicht',
    'Wist-je-dat-woensdag — feit of mythe over werken in productie/logistiek',
    'Verhaal-donderdag — kandidaat of plaatsing in de spotlight',
    'Vrijdag-win — succes van de week, weekend in',
    'Zaterdag — luchtig / community (optioneel)'
  ];
  function themas(){
    const c = M.besluiten.find(b => b.advertentie === '__themas__' && b.note);
    if(c){ try{ const t = JSON.parse(c.note); if(Array.isArray(t) && t.length === 7) return t; }catch(e){} }
    return THEMA_DEFAULT;
  }
  const themaVandaag = () => themas()[new Date().getDay()];

  async function themasOpslaan(tekst){
    const regels = String(tekst||'').split('\n').map(r => r.trim()).filter(Boolean);
    if(regels.length !== 7){
      CRM.toast(`Zeven regels nodig, één per dag — je hebt er ${regels.length}`, 'err');
      return false;
    }
    const rij = {id:CRM.uid(), advertentie:'__themas__', campagne:'', besluit:'config',
                 status:'config', door:CRM.me(), note:JSON.stringify(regels),
                 created_at:new Date().toISOString()};
    M.besluiten.unshift(rij);
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_ad_besluiten').insert({
        advertentie:'__themas__', campagne:'', besluit:'config', status:'config',
        door:CRM.me(), note:JSON.stringify(regels)});
      if(error){
        M.besluiten = M.besluiten.filter(b => b !== rij);
        CRM.fout('Weekthema\'s opslaan mislukt', error); return false;
      }
    }
    CRM.toast('Weekthema\'s opgeslagen voor het hele team', 'ok');
    return true;
  }
  function themaModal(){
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Weekthema's</div>
        <div class="meta" style="margin-top:2px">Zeven regels, één per dag — zondag tot en met zaterdag</div></div>
      <div class="modal-b">
        <div class="f-row"><label for="mkt_th">Het ritme dat het hele team ziet</label>
          <textarea id="mkt_th" style="min-height:190px">${h(themas().join('\n'))}</textarea>
          <div class="hint">Vaste rubrieken maken het merk herkenbaar en het posten makkelijker: je hoeft niet elke dag te bedenken wáár het over gaat.</div></div>
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn" id="mkt_thsave">Opslaan voor het team</button>
      </div>`, {onOpen(m){
        m.querySelector('#mkt_thsave').onclick = async () => {
          if(await themasOpslaan(m.querySelector('#mkt_th').value)){ CRM.modal.close(); teken(); }
        };
      }});
  }

  /* Bewezen blue-collar contentformats. {K} = klant, {F} = functie.
     Onderbouwd door het eigen onderzoek: salaris expliciet, video, kort,
     solliciteren via WhatsApp, meningsvragen mogen van Meta, en LinkedIn
     alleen voor klanten en B2B. */
  const IDEEENBANK = [
    {t:'Dag uit het leven: {F}', f:'Reel / video', d:'Kandidaten werven', k:'04:45. De wekker gaat. Dit is mijn dag als {F}.'},
    {t:'Salaris-transparantie: wat verdien je écht als {F}?', f:'Reel / video', d:'Kandidaten werven', k:'€X.XXX bruto + XX% toeslag. Zwart op wit.'},
    {t:'Solliciteren zonder cv — app ons gewoon', f:'Foto + tekst', d:'Kandidaten werven', k:'Geen cv? Geen brief? Eén appje is genoeg.'},
    {t:'Meningsvraag: nachtdienst of dagdienst?', f:'Tekstpost', d:'Employer branding', k:'Wat vind jij: nachtdienst met toeslag of gewoon overdag?'},
    {t:'Van sollicitatie tot eerste werkdag in 7 dagen', f:'Carousel', d:'Kandidaten werven', k:'Maandag geappt, volgende week maandag gestart.'},
    {t:'Mythe kapot: "uitzendwerk betaalt slecht"', f:'Reel / video', d:'Employer branding', k:'"Uitzendbureaus pakken de helft van je loon." Echt?'},
    {t:'De machine die niemand mag aanraken (behalve jij)', f:'Reel / video', d:'Kandidaten werven', k:'Deze machine is €2 miljoen waard. Jij bedient hem.'},
    {t:'Ploegentoeslag-rekensom: dit levert de nachtploeg op', f:'Carousel', d:'Kandidaten werven', k:'Nachtdienst = +25%. Reken maar mee: €___ extra p/m.'},
    {t:'Eerste week van een nieuwe kracht bij {K}', f:'Foto + tekst', d:'Employer branding', k:'Week 1 zit erop. Dit vond hij ervan.'},
    {t:'Praca w Holandii — post in het Pools', f:'Foto + tekst', d:'Kandidaten werven', k:'Szukamy operatorów. Dobra stawka, praca od zaraz.'},
    {t:'POV: je eerste meeloopdag bij {K}', f:'Story', d:'Kandidaten werven', k:'Kom mee, we lopen samen een dagje mee.'},
    {t:'Waarom hij na 3 maanden een contract tekende', f:'Foto + tekst', d:'Kandidaten werven', k:'Van flexkracht naar vast. Zo ging dat.'},
    {t:'Klantcase voor LinkedIn: ploeg compleet bij {K}', f:'Foto + tekst', d:'Klanten / leadgen', k:'6 weken, 4 operators, 0 no-shows. Zo bouwden we de ploeg bij {K}.'},
    {t:'Achter de schermen: zo ziet de werkvloer er écht uit', f:'Story', d:'Employer branding', k:'Geen stockfoto\'s. Dit is het echt.'},
    {t:'5 vragen die jij mag stellen in je sollicitatiegesprek', f:'Carousel', d:'Kandidaten werven', k:'Een gesprek is tweerichtingsverkeer.'}
  ];
  /* Virale team-formats van andere bedrijven — de formule is bijna altijd
     dezelfde: trend van de week × echte collega's × zelfspot. */
  const AFKIJKBANK = [
    {t:'Jongerentaal-script: de voorman leest voor', v:'Currys (UK) — 1,9 mln views', i:'Jongste collega schrijft de tekst vol internettaal, de oudste leest hem bloedserieus voor tijdens een rondleiding.', k:'Onze voorman (55) legt uit waarom dit magazijn een 10/10 is — in de woorden van onze jongste collega.'},
    {t:'De baas doet één keer mee met een trend', v:'vanHaren — manager Ferry gaat er steeds mee viraal', i:'Hoe stijver de leidinggevende, hoe beter. Eén take, niet te netjes gefilmd.', k:'We vroegen de ploegbaas of hij héél even mee wilde doen. Hij zei: één keer dan.'},
    {t:'Welke collega ben jij?', v:'TikTok-klassieker — iedereen herkent zichzelf', i:'Vier tot zes herkenbare types, elk 2-3 seconden in beeld. Mensen sturen hem naar elkaar door.', k:'Elke ploeg heeft ze: de heftruck-koning, de scanner-kwijtraker, de klaarstaander om 14:59. Welke ben jij?'},
    {t:'We luisteren en we oordelen niet', v:'wereldwijde trend, ook mét de baas erbij', i:'Team op een rij, iedereen bekent om de beurt iets kleins, niemand mag reageren.', k:'We luisteren en we oordelen niet — de nachtploeg-editie.'},
    {t:'POV: jij op de werkvloer', v:'#warehouseworker zit er vol mee', i:'De camera is de kijker. Eén situatie, één grap, tien seconden.', k:'POV: het is je eerste dag en je weet nog niet dat Henk altijd de goede steekwagen inpikt.'},
    {t:'Dag uit het leven — mét loon', v:'Werken bij Picnic doet dit structureel', i:'Van wekker tot einde dienst. Het loon noemen is dé reactie-magneet.', k:'Meelopen met Kevin (22), orderpicker. Dit is zijn dinsdag — inclusief wat hij verdient.'},
    {t:'Expres foute reclame (marktkoopman-stijl)', v:'De Beren deed dit voor vacatures', i:'Schreeuwerig, knipperende teksten, zo fout dat het goed is. Valt op tussen gelikte content.', k:'HEFTRUCKCHAUFFEURS!!! €17 PER UUR!!! VANDAAG BELLEN = MORGEN WERKEN!!!'},
    {t:'Welk geluid maakt die machine?', v:'trend van nú', i:'Collega\'s doen vol overtuiging het geluid na, dan hoor je het echte apparaat.', k:'Wij vroegen de ploeg: welk geluid maakt de heftruck als hij achteruit rijdt?'},
    {t:'Netflix-documentaire over iets kleins', v:'trend van nú', i:'Interview-opstelling en serieuze muziek, over iets totaal onbenulligs.', k:'AFLEVERING 1: De verdwenen pompwagen. Niemand weet waar pompwagen 3 is gebleven. Tot nu.'},
    {t:'Trending geluid + jouw werkvloer', v:'de motor achter bijna elke bedrijfsviral', i:'Pak het geluid van deze week en plak er één werksituatie op. Binnen 1-3 dagen posten, anders is de trend voorbij.', k:'Pak het trending geluid van deze week: welke situatie uit ons magazijn past hierop?'},
    {t:'Voor/na op de beat', v:'werkt al jaren, elke keer weer', i:'Begin van de dienst → einde nachtdienst, precies gecut op de muziek.', k:'06:00 vs 14:30 — wat 8 uur ploegendienst met een mens doet.'},
    {t:'Bloopers: de mislukte takes', v:'Duits installatiebedrijf haalde er miljoenen views mee', i:'Lachen is besmettelijk en bewijst échte sfeer. Post de nette versie een dag later.', k:'We wilden een serieuze vacaturevideo maken. Dit werd het.'},
    {t:'Drie ploegen, één dag', v:'trend van nú', i:'Ochtend-, middag- en nachtploeg maken elk uur één foto; naast elkaar gemonteerd.', k:'Zelfde bedrijf, drie totaal verschillende levens. Welke ploeg past bij jou?'},
    {t:'Eerlijk over het werk — ook de mindere kanten', v:'grote trend sinds begin 2026', i:'Eerlijkheid over de nadelen maakt de voordelen geloofwaardig.', k:'Drie dingen die niemand je vertelt over magazijnwerk — en waarom ik tóch blijf.'},
    {t:'Microfoon de ploeg in', v:'"I asked my coworkers" — oneindig herhaalbaar', i:'Eén simpele vraag, vijf tot acht snelle antwoorden. Geldvragen scoren het best.', k:'We vroegen de ploeg: wat deed jij met je allereerste loonstrook?'}
  ];
  const SPIEKLIJST = [
    {w:'TikTok Creative Center', u:'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag', x:'trending hashtags en geluiden, filter op Nederland — dé wekelijkse check'},
    {w:'Volg een kijk-account', u:'https://www.tiktok.com/@werkenbijpicnic', x:'@werkenbijpicnic, @ryanair, @vanharen_schoenen, @postnl — wat zij posten is je gratis formatkalender'},
    {w:'Een kwartier per week scrollen', u:'https://www.tiktok.com/tag/werkenbij', x:'#magazijn #heftruck #werkenbij #nachtdienst — bewaar alles met 100k+ views dat jonger is dan twee weken'},
    {w:'Maandelijkse trendlijst', u:'https://newengen.com/insights/july-tiktok-trends/', x:'elke maand nieuwe formats, uitgelegd met voorbeelden'},
    {w:'Werf& — Nederlandse recruitmentcases', u:'https://www.werf-en.nl/', x:'welke werken-bij-content het in Nederland doet'}
  ];
  const grabbel = (bank, n) => [...bank].sort(() => Math.random() - .5).slice(0, n);
  function rolIdeeen(){ M.ideeSet = grabbel(IDEEENBANK, 3); }
  function rolAfkijk(){ M.afkSet  = grabbel(AFKIJKBANK, 4); }

  /* Een idee dat je aanspreekt hoort meteen op het bord te staan, anders ben
     je het morgen kwijt. Dit schrijft één regel in mkt_posts in de fase Idee —
     schrijven, script en publiceren blijven in het marketingbord. */
  async function ideeNaarBord(idee){
    const rij = {id:'m' + Date.now() + Math.random().toString(36).slice(2,6),
      titel:idee.t, kanaal:'', format:idee.f||'', doel:idee.d||'', fase:'Idee',
      hook:idee.k||'', script:'', campagne:'', vacature:''};
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_posts').insert(rij);
      if(error){ CRM.fout('Idee op het bord zetten mislukt', error); return; }
    }
    M.posts.push(rowToPost(rij));
    CRM.toast('Als idee op het bord gezet — uitwerken doe je in het marketingbord', 'ok');
    telBadge(); teken();
  }

  /* ═══ 5e. WAT WERKT — leren van je eigen cijfers ══════════════ */
  const gem = a => a.length ? a.reduce((x,y) => x+y, 0) / a.length : 0;
  function watWerkt(){
    const pubs = M.posts.filter(p => GEPUBLICEERD(p) && N(p.resultaat?.bereik) > 0);
    const uit = [];
    if(pubs.length < 2) return {adviezen:uit, pubs};
    const tot = gem(pubs.map(p => N(p.resultaat.bereik)));
    const perGroep = keyFn => {
      const m = new Map();
      pubs.forEach(p => { const k = keyFn(p); if(!k) return;
        if(!m.has(k)) m.set(k, []); m.get(k).push(N(p.resultaat.bereik)); });
      return [...m].filter(([,v]) => v.length >= 2)
        .map(([k,v]) => ({k, avg:gem(v), n:v.length})).sort((a,b) => b.avg - a.avg);
    };
    const fm = perGroep(p => p.format);
    if(fm.length >= 2 && fm[0].avg >= 1.5*tot)
      uit.push({titel:`${fm[0].k} is jullie sterkste format`,
        tekst:`Gemiddeld ${fmtN(fm[0].avg)} bereik per post over ${fm[0].n} posts — ${maal(fm[0].avg, tot)}× jullie gemiddelde van ${fmtN(tot)}. Plan hier meer van.`});
    const km = perGroep(p => p.kanaal);
    if(km.length >= 2 && km[0].avg >= 1.5*tot)
      uit.push({titel:`${km[0].k} presteert het best`,
        tekst:`Gemiddeld ${fmtN(km[0].avg)} bereik over ${km[0].n} posts. Zet je beste content daar als eerste neer.`});
    const dm = perGroep(p => p.datum ? DAGNAAM[new Date(p.datum+'T12:00').getDay()] : '');
    if(dm.length >= 2 && dm[0].avg >= 1.4*tot)
      uit.push({titel:`${dm[0].k.charAt(0).toUpperCase()+dm[0].k.slice(1)} is jullie beste dag`,
        tekst:`Posts op ${dm[0].k} halen gemiddeld ${fmtN(dm[0].avg)} bereik over ${dm[0].n} posts. Plan je toppers op die dag.`});
    const met = pubs.filter(p => /[0-9€]/.test(p.hook||''));
    const zon = pubs.filter(p => !/[0-9€]/.test(p.hook||''));
    if(met.length >= 2 && zon.length >= 2){
      const a = gem(met.map(p => N(p.resultaat.bereik))), b = gem(zon.map(p => N(p.resultaat.bereik)));
      if(a >= 1.3*b) uit.push({titel:'Cijfers in de hook werken',
        tekst:`Hooks met een getal of een bedrag halen gemiddeld ${fmtN(a)} bereik tegen ${fmtN(b)} zonder. Noem het salaris of de toeslag in de eerste zin.`});
      else if(b >= 1.3*a) uit.push({titel:'Cijfer-hooks blijven achter',
        tekst:`Hooks zónder getal doen het bij jullie beter: ${fmtN(b)} tegen ${fmtN(a)} bereik. Test verhalende openingen.`});
    }
    const leadKing = pubs.filter(p => N(p.resultaat?.leads) > 0)
      .sort((a,b) => N(b.resultaat.leads) - N(a.resultaat.leads))[0];
    if(leadKing) uit.push({titel:`Meeste leads: "${leadKing.titel}"`,
      tekst:`${fmtN(leadKing.resultaat.leads)} leads via ${leadKing.kanaal || 'onbekend kanaal'}${leadKing.format?` (${leadKing.format})`:''}. Maak hier een vervolg van.`});
    return {adviezen:uit, pubs};
  }

  /* Voorraad: hoeveel weken kun je vooruit met wat er klaarstaat? */
  function voorraad(){
    const pub28 = M.posts.filter(p => GEPUBLICEERD(p) && (p.datum||'') >= isoT(28)).length;
    const tempo = pub28 / 4;
    const klaar = M.posts.filter(p => p.fase === 'Idee' || p.fase === 'Script klaar').length;
    const gepland = M.posts.filter(p => p.fase === 'Ingepland' && (p.datum||'') >= CRM.todayISO()).length;
    return {tempo, klaar, gepland, weken: tempo > 0 ? (klaar+gepland)/tempo : null};
  }

  /* ═══ 6. WEERGAVE ════════════════════════════════════════════ */
  function render(mount, actiesEl){
    M.mount = mount; M.actiesEl = actiesEl;
    if(!M.geladen){
      mount.innerHTML = CRM.ui.laden('Marketingcijfers laden…');
      laad().then(teken).catch(e => {
        console.error('marketing laden', e);
        /* Belofte weggooien, anders blijft elke volgende render op dezelfde
           mislukking hangen en helpt herladen van de pagina niet eens. */
        M.bezig = null;
        mount.innerHTML = foutBlok('De marketingcijfers', e);
      });
      return;
    }
    teken();
  }

  function teken(){
    const mount = M.mount; if(!mount) return;
    kopActies();
    const adv = adviezen(), nag = nagPosts(), gaten = radar(), werk = openTaken();
    const TABS = [
      {k:'prestatie', t:'Prestatie', n:adv.length + agentAdviezen().length},
      {k:'keten',     t:'Keten',     n:0},
      {k:'content',   t:'Content',   n:nag.length + werk.length},
      {k:'kanalen',   t:'Kanalen',   n:0},
      {k:'ideeen',    t:'Ideeën',    n:0},
      {k:'radar',     t:'Vacature-radar', n:gaten.length}
    ];
    const body = M.tab === 'prestatie' ? prestatieHtml(adv)
               : M.tab === 'keten'     ? ketenHtml()
               : M.tab === 'content'   ? contentHtml(nag)
               : M.tab === 'kanalen'   ? kanalenHtml()
               : M.tab === 'ideeen'    ? ideeenHtml()
               :                         radarHtml(gaten);
    mount.innerHTML = `
      ${M.isDemo ? `<div class="note info" style="margin-bottom:16px">Demo-data — de Meta-cijfers en posts op dit scherm zijn verzonnen, zodat je de weergave kunt beoordelen.</div>` : ''}
      <div class="tabs">${TABS.map(t =>
        `<button class="tab ${M.tab===t.k?'on':''}" data-tab="${t.k}">${h(t.t)}${t.n?`<span class="cnt num">${t.n}</span>`:''}</button>`).join('')}</div>
      ${body}`;
    CRM.$$('[data-tab]', mount).forEach(b => b.onclick = () => { M.tab = b.dataset.tab; teken(); window.scrollTo({top:0}); });
    bindActies(mount);
  }

  function kopActies(){
    const el = M.actiesEl || document.getElementById('pageacties');
    if(!el) return;
    const perKiezer = (M.tab==='prestatie' || M.tab==='keten') ? `
      <div class="seg" id="mkt_per">${[7,14,30].map(d =>
        `<button data-per="${d}" class="${M.periode===d?'on':''}">${d} dagen</button>`).join('')}</div>` : '';
    el.innerHTML = perKiezer +
      `<a class="btn ghost" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`;
    CRM.$$('[data-per]', el).forEach(b => b.onclick = () => { M.periode = Number(b.dataset.per); teken(); });
  }

  /* ── Knoppen binnen de weergave ── */
  function bindActies(root){
    CRM.$$('[data-bes]', root).forEach(b => b.onclick = () => {
      const [keuze, ad, camp] = b.dataset.bes.split('|');
      besluit(ad, camp, keuze);
    });
    CRM.$$('[data-afrond]', root).forEach(b => b.onclick = () => rondAf(b.dataset.afrond));
    CRM.$$('[data-uit]', root).forEach(r => r.onclick = () => {
      const k = r.dataset.uit;
      M.open.has(k) ? M.open.delete(k) : M.open.add(k);
      const tbl = document.getElementById('mkt_camp');
      if(tbl){ tbl.innerHTML = campagneRijen(); bindActies(tbl); }
      else teken();
    });

    /* Taken */
    CRM.$$('[data-tvink]', root).forEach(c => c.onclick = () => {
      const [bron, id] = c.dataset.tvink.split('|');
      taakVink(bron, id, c.checked);
    });
    CRM.$$('[data-tweg]', root).forEach(b => b.onclick = () => taakWeg(b.dataset.tweg));
    const nieuwTaakKnop = root.querySelector('#mkt_nieuwetaak');
    if(nieuwTaakKnop) nieuwTaakKnop.onclick = () => nieuweTaak();

    /* Learnings-bibliotheek — alleen de lijst hertekenen zou het zoekveld
       zijn focus kosten, dus we tekenen de tab en zetten de cursor terug. */
    const lbq = root.querySelector('#mkt_lbq');
    if(lbq) lbq.oninput = CRM.debounce(() => {
      M.lbQ = lbq.value; teken();
      const nieuw = document.getElementById('mkt_lbq');
      if(nieuw){ nieuw.focus(); nieuw.setSelectionRange(nieuw.value.length, nieuw.value.length); }
    }, 300);
    const lbk = root.querySelector('#mkt_lbk');
    if(lbk) lbk.onchange = () => { M.lbK = lbk.value; teken(); };

    /* Kanalen */
    CRM.$$('[data-doel]', root).forEach(inp => inp.onchange = () => {
      const v = Math.max(0, Math.min(21, Math.round(Number(inp.value)||0)));
      kanaalZet(inp.dataset.doel, 'doel_pw', v);
    });
    CRM.$$('[data-kleur]', root).forEach(inp => inp.onchange = () => kanaalZet(inp.dataset.kleur, 'kleur', inp.value));
    CRM.$$('[data-kweg]', root).forEach(b => b.onclick = () => kanaalWeg(b.dataset.kweg));
    const kadd = root.querySelector('#mkt_kadd');
    if(kadd){
      const doe = () => kanaalNieuw(root.querySelector('#mkt_knaam').value, root.querySelector('#mkt_kkleur').value);
      kadd.onclick = doe;
      root.querySelector('#mkt_knaam').onkeydown = e => { if(e.key === 'Enter') doe(); };
    }

    /* Ideeën */
    const themaKnop = root.querySelector('#mkt_thema');
    if(themaKnop) themaKnop.onclick = themaModal;
    const rolI = root.querySelector('#mkt_rolidee');
    if(rolI) rolI.onclick = () => { rolIdeeen(); teken(); };
    const rolA = root.querySelector('#mkt_rolafk');
    if(rolA) rolA.onclick = () => { rolAfkijk(); teken(); };
    CRM.$$('[data-idee]', root).forEach(b => b.onclick = () => {
      const i = M.ideeSet[Number(b.dataset.idee)];
      if(i) ideeNaarBord(i);
    });
  }

  /* ── 6a. Prestatie ── */
  /* Weekvergelijking: het eerste wat je wilt weten als je dit scherm opent.
     Drie cijfers van de laatste zeven dagen met het verschil tegenover de
     zeven dagen daarvoor. */
  function weekHtml(){
    const nu  = stat(M.meta.filter(r => (r.datum||'') >= isoT(7)));
    const vor = stat(M.meta.filter(r => (r.datum||'') >= isoT(14) && (r.datum||'') < isoT(7)));
    if(!nu.imp && !vor.imp) return '';           /* twee weken stil: geen strook */

    const cel = (label, waarde, delta) =>
      `<div class="mkt-week-c"><span class="label">${h(label)}</span>
        <b class="num">${waarde}</b><span class="mkt-week-d">${delta}</span></div>`;
    const cellen =
      cel('Uitgegeven', CRM.euro(nu.spend),
          verschil(nu.spend, vor.spend, n => CRM.euro(n), 'neutraal')) +
      cel('Leads', fmtN(nu.leads),
          verschil(nu.leads, vor.leads, n => fmtN(n), 'hoger')) +
      cel('Kosten per lead', nu.cpl ? CRM.euro(nu.cpl,2) : '—',
          nu.cpl && vor.cpl ? verschil(nu.cpl, vor.cpl, n => CRM.euro(n,2), 'lager')
                            : `<span class="meta">geen vergelijking mogelijk</span>`);

    return `<div class="vlak mkt-week">
      <span class="label">Deze week vs vorige week</span>
      <div class="mkt-week-r">${cellen}</div>
      <span class="meta">Laatste zeven dagen tegenover de zeven daarvóór. Meer of minder uitgeven is op zichzelf
        niet goed of slecht — dat verschil blijft daarom kleurloos.</span>
    </div>`;
  }

  function prestatieHtml(adv){
    if(!M.meta.length) return M.metaFout ? foutBlok('De Meta-cijfers', M.metaFout) : leegMeta();
    const rows = binnenPeriode();
    const s = stat(rows);
    const laatst = M.meta[0]?.synced_at ? CRM.fmtDate(M.meta[0].synced_at) : '';
    return `
      ${weekHtml()}
      ${adviesHtml(adv)}
      <div class="grid c4" style="margin-bottom:18px">
        ${CRM.ui.kpi('Uitgegeven', `<span class="num">${CRM.euro(s.spend)}</span>`, `laatste ${M.periode} dagen`, 'accent')}
        ${CRM.ui.kpi('Leads', `<span class="num">${fmtN(s.leads)}</span>`, s.leads ? 'via Meta-formulieren' : 'nog geen leads')}
        ${CRM.ui.kpi('Kosten per lead', `<span class="num">${s.cpl?CRM.euro(s.cpl,2):'—'}</span>`, 'gemiddeld over de periode')}
        ${CRM.ui.kpi('Kliks', `<span class="num">${fmtN(s.kliks)}</span>`,
          `<span class="num">${fmtN(s.imp)}</span> impressies · CPC <span class="num">${s.cpc?CRM.euro(s.cpc,2):'—'}</span> · CTR <span class="num">${s.ctr!=null?CRM.pct(s.ctr,2):'—'}</span>`)}
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Per campagne</div>
          <span class="meta">Klik een regel open voor advertentiesets en advertenties</span></div>
        <div class="tblwrap" style="border:none;border-radius:0 0 var(--r-l) var(--r-l)">
          <table class="tbl mkt-tbl">
            <thead><tr>
              <th>Campagne</th><th class="n">Uitgegeven</th>
              <th style="width:96px">Aandeel uitgaven</th>
              <th class="n">Leads</th><th class="n">€ / lead</th><th class="n">Kliks</th>
              <th class="n">CPC</th><th class="n">CTR</th>
            </tr></thead>
            <tbody id="mkt_camp">${campagneRijen()}</tbody>
            ${totaalRij()}
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><div class="h2">Dag voor dag</div><span class="meta">laatste 14 dagen</span></div>
        <div class="card-b">${dagStrook()}</div>
        ${laatst ? `<div class="card-f"><span class="meta">Laatste synchronisatie met Meta: <span class="num">${h(laatst)}</span></span></div>` : ''}
      </div>`;
  }

  function leegMeta(){
    const knop = `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`;
    return CRM.ui.leeg('Nog geen Meta-data gesynchroniseerd',
      'Zodra de dagelijkse Meta-synchronisatie draait, verschijnen hier de uitgaven, kliks, CPC en kosten per lead. De koppeling en de tabel worden vanuit het marketingbord beheerd.', knop);
  }

  function adviesHtml(adv){
    if(!M.meta.length) return '';
    const agent = agentAdviezen();
    if(!adv.length && !agent.length) return `<div class="note ok" style="margin-bottom:18px">Geen openstaande advertentie-adviezen — alles loopt binnen de bandbreedte.</div>`;
    /* Rood = ingrijpen, oranje = urgentie/waarschuwing, olijf = positief
       (zelfde betekenis als .pos elders in de app). */
    const kleurVar = {red:'var(--red)', amber:'var(--amber)', green:'var(--olive)'};
    const knop = (a, keuze, tekst) =>
      `<button class="btn ghost sm" data-bes="${h(keuze)}|${h(a.advertentie)}|${h(a.campagne)}">${h(tekst)}</button>`;
    /* De mediabuyer-agent schrijft zijn eigen bevindingen in dezelfde tabel.
       Die stonden hier nooit op het scherm — een advies dat niemand leest is
       geen advies. */
    const agentRij = b => `
      <div class="mkt-advies">
        <span class="dot" style="background:var(--blue)"></span>
        <div class="mkt-a-t">
          <div><b>${b.besluit === 'budget' ? 'Budgetadvies' : 'Advies van de agent'}</b>
            <span class="meta">— ${h(b.advertentie)}${b.campagne?` · ${h(b.campagne)}`:''}</span></div>
          <div class="meta">${h(b.note || 'Geen toelichting meegegeven.')}</div>
          <div class="meta">${h(b.door || 'agent')} · ${h(CRM.geleden(b.created_at))}</div>
        </div>
        <div class="row tight mkt-a-k">
          <button class="btn ghost sm" data-afrond="${h(b.id)}">Gezien</button>
        </div>
      </div>`;
    const aantal = adv.length + agent.length;
    return `<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Adviezen</div>
        <span class="meta">${aantal===1?'1 advertentie vraagt':aantal+' advertenties vragen'} om een besluit</span></div>
      <div>${agent.map(agentRij).join('')}${adv.map(a => `
        <div class="mkt-advies">
          <span class="dot" style="background:${kleurVar[a.kleur]}"></span>
          <div class="mkt-a-t">
            <div><b>${h(a.titel)}</b> <span class="meta">— ${h(a.advertentie)} · ${h(a.campagne)}</span></div>
            <div class="meta">${h(a.uitleg)}</div>
            ${a.cijfers ? `<div class="meta num">${h(a.cijfers)}</div>` : ''}
          </div>
          <div class="row tight mkt-a-k">
            ${a.keuzes.includes('stop')      ? knop(a,'stop','Stopzetten') : ''}
            ${a.keuzes.includes('opschalen') ? knop(a,'opschalen','Opschalen') : ''}
            ${a.keuzes.includes('negeer')    ? knop(a,'negeer','Prima zo') : ''}
            ${a.keuzes.includes('adsmanager')? `<a class="btn ghost sm" href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager ↗</a>` : ''}
            ${a.keuzes.includes('afronden')  ? `<button class="btn ghost sm" data-afrond="${h(a.besluitId)}">Afronden</button>` : ''}
          </div>
        </div>`).join('')}</div>
      <div class="card-f"><span class="meta">Een besluit verbergt het advies 14 dagen. Eén uitzondering: een advertentie
        die je stopzet blijft staan tot er echt geen geld meer doorheen gaat — stoppen gebeurt in
        <a href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager</a>, niet hier.</span></div>
    </div>`;
  }

  /* Campagne → advertentieset → advertentie, uitklapbaar */
  function boom(){
    const camps = new Map();
    binnenPeriode().forEach(r => {
      const c = r.campagne || '—', s = r.advertentieset || '—', a = r.advertentie || '—';
      if(!camps.has(c)) camps.set(c, {naam:c, rows:[], sets:new Map()});
      const C = camps.get(c); C.rows.push(r);
      if(!C.sets.has(s)) C.sets.set(s, {naam:s, rows:[], ads:new Map()});
      const S = C.sets.get(s); S.rows.push(r);
      if(!S.ads.has(a)) S.ads.set(a, {naam:a, rows:[]});
      S.ads.get(a).rows.push(r);
    });
    return camps;
  }
  /* De aandeelbalk zet de uitgaven van deze regel af tegen het totaal van
     de periode. */
  function cijferCellen(s, tot){
    const deel = tot.spend ? s.spend/tot.spend : 0;
    return `<td class="n num">${CRM.euro(s.spend)}</td>
      <td>${CRM.ui.bar(deel*100)}</td>
      <td class="n num">${fmtN(s.leads)}</td>
      <td class="n num">${s.cpl?CRM.euro(s.cpl,2):'—'}</td>
      <td class="n num">${fmtN(s.kliks)}</td>
      <td class="n num">${s.cpc?CRM.euro(s.cpc,2):'—'}</td>
      <td class="n num">${s.ctr!=null?CRM.pct(s.ctr,2):'—'}</td>`;
  }
  const KOLOMMEN = 8;                 // campagnenaam + zeven cijferkolommen
  function campagneRijen(){
    const camps = [...boom().values()];
    if(!camps.length){
      const knop = `<a class="btn" href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager openen ↗</a>`;
      return `<tr><td colspan="${KOLOMMEN}" style="padding:0">${CRM.ui.leeg('Geen advertenties in deze periode',
        'Er liep geen advertentie in dit venster. Kies hierboven een langere periode, of zet een campagne aan — zonder advertenties komen er geen Meta-leads binnen.', knop)}</td></tr>`;
    }
    const tot = stat(binnenPeriode());
    let html = '';
    camps.sort(opWaarde).forEach(c => {
      const ck = 'c:'+c.naam, cOpen = M.open.has(ck);
      html += `<tr class="clickable" data-uit="${h(ck)}">
        <td><span class="mkt-caret ${cOpen?'op':''}">▸</span><b>${h(c.naam)}</b>
          <div class="rowsub">${c.sets.size} advertentieset${c.sets.size===1?'':'s'}</div></td>
        ${cijferCellen(stat(c.rows), tot)}</tr>`;
      if(!cOpen) return;
      [...c.sets.values()].sort(opWaarde).forEach(s => {
        const sk = 's:'+c.naam+'|'+s.naam, sOpen = M.open.has(sk);
        html += `<tr class="clickable mkt-r1" data-uit="${h(sk)}">
          <td class="mkt-n1"><span class="mkt-caret ${sOpen?'op':''}">▸</span>${h(s.naam)}</td>
          ${cijferCellen(stat(s.rows), tot)}</tr>`;
        if(!sOpen) return;
        [...s.ads.values()].sort(opWaarde).forEach(a => {
          html += `<tr class="mkt-r2"><td class="mkt-n2">${h(a.naam)}</td>
            ${cijferCellen(stat(a.rows), tot)}</tr>`;
        });
      });
    });
    return html;
  }
  /* Totaalregel — zelfde patroon als de tabellen in Performance, zodat je
     de campagnes tegen het geheel kunt lezen zonder zelf op te tellen. */
  function totaalRij(){
    const tot = stat(binnenPeriode());
    if(!tot.imp && !tot.kliks && !tot.spend) return '';
    return `<tfoot><tr><td><b>Alle campagnes</b></td>
      <td class="n num">${CRM.euro(tot.spend)}</td>
      <td></td>
      <td class="n num">${fmtN(tot.leads)}</td>
      <td class="n num">${tot.cpl?CRM.euro(tot.cpl,2):'—'}</td>
      <td class="n num">${fmtN(tot.kliks)}</td>
      <td class="n num">${tot.cpc?CRM.euro(tot.cpc,2):'—'}</td>
      <td class="n num">${tot.ctr!=null?CRM.pct(tot.ctr,2):'—'}</td></tr></tfoot>`;
  }

  function dagStrook(){
    const cut = isoT(14), per = new Map();
    M.meta.filter(r => (r.datum||'') >= cut).forEach(r => {
      const d = per.get(r.datum) || {spend:0, kliks:0, leads:0};
      d.spend += N(r.uitgegeven); d.kliks += N(r.kliks); d.leads += N(r.leads);
      per.set(r.datum, d);
    });
    const dagen = [];
    for(let i=13; i>=0; i--){
      const dt = isoT(i);
      dagen.push(Object.assign({datum:dt}, per.get(dt) || {spend:0, kliks:0, leads:0}));
    }
    const max = Math.max(...dagen.map(d => d.spend), 1);
    if(!dagen.some(d => d.spend > 0)) return CRM.ui.leeg(
      'Twee weken zonder uitgaven',
      'Er stond geen advertentie aan. Zonder advertenties komen er geen Meta-leads binnen.',
      `<a class="btn" href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager openen ↗</a>`);
    return `<div class="mkt-dagen">${dagen.map(d => {
      const dag = new Date(d.datum + 'T12:00'), wknd = [0,6].includes(dag.getDay());
      const cpl = d.leads ? d.spend/d.leads : null;
      const titel = `${CRM.fmtDay(d.datum)} — ${CRM.euro(d.spend,2)} · ${d.kliks} kliks · ${d.leads} leads${cpl?` · ${CRM.euro(cpl,2)} per lead`:''}`;
      return `<div class="mkt-dag${wknd?' we':''}" title="${h(titel)}">
        <div class="mkt-dagtop num">${d.leads || ''}</div>
        <div class="mkt-dagbar"><i style="height:${Math.max(2, Math.round(d.spend/max*100))}%"></i></div>
        <div class="mkt-daglbl"><b class="num">${dag.getDate()}</b><span>${DAGKORT[dag.getDay()]}</span></div>
      </div>`;
    }).join('')}</div>
    <div class="row" style="margin-top:12px"><span class="meta">Staafhoogte = uitgegeven per dag · getal boven de staaf = leads</span></div>`;
  }

  /* ── 6b. Keten ── */
  function ketenHtml(){
    const k = keten();
    const pct = (a,b) => b ? Math.round(a/b*100) + '%' : '—';
    const stap = (label, waarde, detail) =>
      `<div class="mkt-stap"><div class="label">${h(label)}</div>
        <div class="big num">${waarde}</div><div class="meta">${h(detail||'')}</div></div>`;
    const pijl = tekst => `<div class="mkt-pijl">→<span class="num">${h(tekst)}</span></div>`;
    const kpl = k.geplaatst ? CRM.euro(k.spend / k.geplaatst) : '—';
    const metaLeads = stat(binnenPeriode()).leads;
    const verschil = metaLeads - k.leads;
    return `
      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Van advertentie tot plaatsing</div>
          <span class="meta">Meta · laatste ${M.periode} dagen</span></div>
        <div class="card-b">
          <div class="mkt-keten">
            ${stap('Uitgegeven', CRM.euro(k.spend), 'Meta-advertenties')}
            ${pijl(k.spend && k.leads ? CRM.euro(k.spend/k.leads, 2) + ' p/l' : '—')}
            ${stap('Leads in CRM', fmtN(k.leads), 'bron Meta')}
            ${pijl(pct(k.kandidaten, k.leads))}
            ${stap('Kandidaten', fmtN(k.kandidaten), 'op het bord')}
            ${pijl(pct(k.voorgesteld, k.kandidaten))}
            ${stap('Voorgesteld', fmtN(k.voorgesteld), 'bij een klant')}
            ${pijl(pct(k.geplaatst, k.voorgesteld))}
            ${stap('Geplaatst', fmtN(k.geplaatst), 'contract getekend')}
          </div>
        </div>
        <div class="card-f"><span class="meta">Leads en kandidaten geteld op binnenkomst in de periode, plaatsingen op de datum van tekenen.</span></div>
      </div>

      ${verschil > 0 ? `<div class="note warn" style="margin-bottom:18px">
        Meta telt zelf <b class="num">${fmtN(metaLeads)}</b> ingevulde formulieren in deze periode, terwijl er
        <b class="num">${fmtN(k.leads)}</b> met bron Meta in het CRM staan — <b class="num">${fmtN(verschil)}</b> zijn er niet doorgezet.
        Alles hieronder rekent met de leads die daadwerkelijk in het CRM staan.</div>` : ''}

      <div class="grid c3">
        ${CRM.ui.kpi('Kosten per lead', `<span class="num">${k.leads?CRM.euro(k.spend/k.leads,2):'—'}</span>`,
            `${fmtN(k.leads)} CRM-leads uit ${CRM.euro(k.spend)}`)}
        ${CRM.ui.kpi('Kosten per kandidaat', `<span class="num">${k.kandidaten?CRM.euro(k.spend/k.kandidaten):'—'}</span>`,
            `${fmtN(k.kandidaten)} kandidaten op het bord`)}
        ${CRM.ui.kpi('Kosten per plaatsing', `<span class="num">${kpl}</span>`,
            k.geplaatst ? `${fmtN(k.geplaatst)} plaatsing${k.geplaatst===1?'':'en'} in de periode` : 'nog geen plaatsing', 'accent')}
      </div>`;
  }

  /* ── 6c1. Marketingtaken ── */
  /* De regel is: afvinken mag hier, nieuw werk maak je in de CRM-takenlijst.
     Bord-taken (mkt_taken) mag je ook weggooien — die horen alleen bij deze
     module. CRM-taken laten we staan: die kunnen aan een collega toegewezen
     zijn en verdwijnen niet vanuit één module. */
  function takenHtml(){
    const vandaag = CRM.todayISO();
    /* Kan de bordtabel niet gelezen worden, dan is deze lijst per definitie
       onvolledig. Dat moet je zien, ook als er wél CRM-taken zijn — anders
       denk je dat je klaar bent terwijl de helft ontbreekt. */
    if(M.takenFout && !crmTaken().length) return foutBlok('De marketingtaken', M.takenFout);
    const waarschuwing = M.takenFout
      ? `<div class="note warn" style="margin-bottom:18px">Deze lijst is niet compleet: de taken uit het
         marketingbord konden niet geladen worden, dus je ziet hieronder alleen de CRM-taken.
         ${h(String(M.takenFout?.message || M.takenFout))}</div>` : '';

    const open = alleTaken().filter(t => !t.klaar);
    const achter = open.filter(t => t.datum && t.datum < vandaag);
    const nu     = open.filter(t => !t.datum || t.datum === vandaag);
    const later  = open.filter(t => t.datum && t.datum > vandaag);
    const klaarVandaag = alleTaken().filter(t => t.klaar && t.datum === vandaag).length;

    const rij = t => `<div class="mkt-taak${t.klaar?' af':''}">
      <input type="checkbox" data-tvink="${h(t.bron)}|${h(t.id)}" ${t.klaar?'checked':''}
             aria-label="${h(t.tekst)} afvinken">
      <span class="mkt-taak-t">${h(t.tekst)}
        ${t.datum && t.datum !== vandaag ? `<span class="meta"> · ${h(CRM.fmtDateShort(t.datum))}</span>` : ''}
        ${t.voor && t.voor !== CRM.me() ? `<span class="meta"> · voor ${h(t.voor)}</span>` : ''}
        ${t.bron === 'bord' ? `<span class="chip" style="margin-left:6px">marketingbord</span>` : ''}
        ${t.prioriteit === 'Hoog' ? `<span class="chip amber" style="margin-left:6px">hoog</span>` : ''}</span>
      ${t.bron === 'bord' ? `<button class="mkt-taak-x" data-tweg="${h(t.id)}" title="Taak verwijderen" aria-label="Taak verwijderen">✕</button>` : ''}
    </div>`;

    const groep = (titel, lijst) => lijst.length
      ? `<div class="mkt-taak-g"><span class="label">${h(titel)}</span>${lijst.map(rij).join('')}</div>` : '';

    return `${waarschuwing}<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Wat moet er gebeuren</div>
        <span class="meta">${open.length ? `${open.length} open${klaarVandaag?` · ${klaarVandaag} vandaag afgevinkt`:''}` : 'alles afgevinkt'}</span>
        <div class="spacer"></div>
        <button class="btn sm" id="mkt_nieuwetaak">Nieuwe taak</button></div>
      ${open.length ? `<div class="card-b">
        ${groep('Blijven liggen', achter)}
        ${groep('Vandaag', nu)}
        ${groep('Later', later)}
      </div>` : `<div class="card-b">${CRM.ui.leeg('Geen openstaande marketingtaken',
        'Zodra jij of iemand in het marketingbord iets noteert, staat het hier. Nieuwe taken maak je met de knop hierboven.')}</div>`}
      <div class="card-f"><span class="meta">Taken uit het marketingbord (<span class="num">${bordTaken().filter(t=>!t.klaar).length}</span> open) en
        CRM-taken staan hier samen. Nieuwe taken komen in de CRM-takenlijst terecht, zodat ze ook op je dashboard staan,
        aan een collega kunnen en meegaan naar Outlook.</span></div>
    </div>`;
  }

  /* ── 6c2. Learnings-bibliotheek ── */
  /* Elke post die de fase Learnings haalt laat een zin achter over wat wel en
     niet werkte. Die zinnen stonden wel in de database maar nergens op het
     scherm — bij elkaar zijn ze het speelboek van het team. */
  function learningsLijst(){
    let items = M.posts.filter(p => (p.learnings||'').trim());
    if(M.lbK) items = items.filter(p => p.kanaal === M.lbK);
    if(M.lbQ){
      const q = M.lbQ.toLowerCase();
      items = items.filter(p => `${p.learnings} ${p.titel} ${p.hook}`.toLowerCase().includes(q));
    }
    return items.sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
  }
  function learningsHtml(){
    const items = learningsLijst();
    const kanalen = [...new Set(M.posts.filter(p => (p.learnings||'').trim()).map(p => p.kanaal).filter(Boolean))].sort();
    const lijst = items.length
      ? items.map(p => `<div class="mkt-learn">
          <b>${h(p.learnings)}</b>
          <span class="meta">${h(p.titel||'(zonder titel)')}${p.kanaal?` · ${h(p.kanaal)}`:''}${p.format?` · ${h(p.format)}`:''}${p.datum?` · ${h(CRM.fmtDateShort(p.datum))}`:''}${
            N(p.resultaat?.bereik) ? ` · <span class="num">${fmtN(p.resultaat.bereik)}</span> bereik` : ''}${
            N(p.resultaat?.leads) ? ` · <span class="num">${fmtN(p.resultaat.leads)}</span> leads` : ''}</span>
        </div>`).join('')
      : `<div class="card-b">${CRM.ui.leeg(
          M.lbQ || M.lbK ? 'Geen learnings met dit filter' : 'Nog geen learnings vastgelegd',
          M.lbQ || M.lbK ? 'Pas de zoekterm of het kanaal aan.'
            : 'Zet in het marketingbord een gepubliceerde post op de fase Learnings en schrijf op wat wel en niet werkte. Die zin komt hier vanzelf bij te staan.',
          M.lbQ || M.lbK ? '' : `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`)}</div>`;
    return `<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Learnings</div>
        <span class="meta">${items.length} ${items.length===1?'les':'lessen'} uit eigen posts</span></div>
      <div class="card-b" style="padding-bottom:0">
        <div class="row tight" style="flex-wrap:wrap;margin-bottom:2px">
          <input type="search" id="mkt_lbq" placeholder="Zoek in learnings…" value="${h(M.lbQ)}" style="flex:1;min-width:160px">
          <select id="mkt_lbk" style="width:auto;min-width:140px"><option value="">Alle kanalen</option>${
            kanalen.map(k => `<option${M.lbK===k?' selected':''}>${h(k)}</option>`).join('')}</select>
        </div>
      </div>
      ${lijst}
    </div>`;
  }

  /* ── 6c3. Wat werkt ── */
  function watWerktHtml(){
    const {adviezen:ww, pubs} = watWerkt();
    const vr = voorraad();
    return `<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Wat werkt</div>
        <span class="meta">afgeleid uit ${pubs.length} ${pubs.length===1?'post':'posts'} met ingevuld bereik</span></div>
      <div class="card-b">
        ${ww.length ? `<div class="stack">${ww.map(a => `
          <div><b>${h(a.titel)}</b><div class="meta">${h(a.tekst)}</div></div>`).join('')}</div>`
        : `<p class="sub" style="margin:0">Nog te weinig resultaten om patronen uit te halen. Vul na elke publicatie
           bereik, likes en leads in; vanaf ongeveer vier posts verschijnen hier het beste format, het beste kanaal,
           de beste dag en of cijfers in de hook bij jullie aanslaan.</p>`}
      </div>
      ${vr.weken !== null ? `<div class="card-f"><span class="meta">Voorraad: <span class="num">${vr.klaar}</span> ${vr.klaar===1?'idee of script':'ideeën en scripts'}
        en <span class="num">${vr.gepland}</span> ingepland, bij een tempo van <span class="num">${vr.tempo.toFixed(1).replace('.',',')}</span> posts per week —
        genoeg voor ongeveer <span class="num">${vr.weken.toFixed(1).replace('.',',')}</span> ${vr.weken<2?'week':'weken'}.${
        vr.weken < 2 ? ' Dat is krap: haal er wat ideeën bij.' : ''}</span></div>` : ''}
    </div>`;
  }

  /* ── 6c. Content ── */
  function contentHtml(nag){
    if(!M.posts.length){
      if(M.postsFout) return foutBlok('De contentplanning', M.postsFout);
      return takenHtml() + CRM.ui.leeg('Nog geen content gevonden',
        'De contentplanning staat in het marketingbord. Zodra daar posts staan, zie je hier wat er gepland is en wat een gepubliceerde post heeft opgeleverd.',
        `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`);
    }
    const vandaag = CRM.todayISO();
    const gepland = M.posts.filter(p => !GEPUBLICEERD(p) && p.datum && p.datum >= vandaag)
                           .sort((a,b) => a.datum.localeCompare(b.datum));
    const pub = M.posts.filter(GEPUBLICEERD).sort((a,b) => (b.datum||'').localeCompare(a.datum||'')).slice(0,20);
    const nagIds = new Set(nag.map(p => p.id));

    const res = (p,k) => N(p.resultaat?.[k]) ? fmtN(p.resultaat[k]) : '<span class="meta">—</span>';

    return `
      ${nag.length ? `<div class="note warn" style="margin-bottom:18px">
        <b>${nag.length} gepubliceerde post${nag.length===1?'':'s'} zonder resultaten.</b>
        Zonder bereik en leads weet je niet wat werkt — vul ze bij in het marketingbord.</div>` : ''}

      ${takenHtml()}

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Binnenkort</div><span class="meta">${gepland.length} gepland</span>
          <div class="spacer"></div>
          <a class="btn sm ghost" href="${BORD}" target="_blank" rel="noopener">Nieuwe post maken ↗</a></div>
        ${gepland.length ? `<div class="tblwrap" style="border:none;border-radius:0 0 var(--r-l) var(--r-l)">
          <table class="tbl"><thead><tr><th>Datum</th><th>Kanaal</th><th>Titel</th><th>Status</th><th>Vacature</th></tr></thead>
          <tbody>${gepland.slice(0,10).map(p => `<tr>
            <td class="num" style="white-space:nowrap">${h(CRM.fmtDateShort(p.datum))}${p.tijd?` <span class="meta num">${h(p.tijd)}</span>`:''}</td>
            <td>${kanaalChip(p.kanaal)}</td>
            <td><b>${h(p.titel||'(zonder titel)')}</b>${p.format?`<div class="rowsub">${h(p.format)}</div>`:''}</td>
            <td><span class="chip">${h(p.fase)}</span></td>
            <td class="meta">${h(p.vacature||'—')}</td></tr>`).join('')}</tbody></table>
        </div>` : `<div class="card-b">${CRM.ui.leeg('Niets ingepland',
          'Zonder geplande content valt de organische instroom stil. Zet in het marketingbord de posts voor de komende twee weken klaar.',
          `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Content plannen ↗</a>`)}</div>`}
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Gepubliceerd</div><span class="meta">laatste ${pub.length}</span></div>
        <div class="tblwrap" style="border:none;border-radius:0">
          <table class="tbl"><thead><tr>
            <th>Datum</th><th>Kanaal</th><th>Titel</th>
            <th class="n">Bereik</th><th class="n">Likes</th><th class="n">Reacties</th><th class="n">Leads</th>
          </tr></thead>
          <tbody>${pub.map(p => `<tr>
            <td class="num" style="white-space:nowrap">${h(CRM.fmtDateShort(p.datum))}</td>
            <td>${kanaalChip(p.kanaal)}</td>
            <td><b>${h(p.titel||'(zonder titel)')}</b>
              ${nagIds.has(p.id) ? `<span class="chip amber" style="margin-left:6px">resultaten nog invullen</span>` : ''}
              ${p.format?`<div class="rowsub">${h(p.format)}</div>`:''}</td>
            <td class="n num">${res(p,'bereik')}</td><td class="n num">${res(p,'likes')}</td>
            <td class="n num">${res(p,'reacties')}</td><td class="n num">${res(p,'leads')}</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="card-f"><span class="meta">Posten, plannen en publiceren doe je in het marketingbord — hier lees je alleen mee.</span></div>
      </div>

      ${watWerktHtml()}
      ${learningsHtml()}`;
  }

  /* ── 6e. Kanalen ── */
  /* Waar posten we, met welk doel per week, en levert dat wat op? Kleur en
     weekdoel staan in mkt_kanalen en worden ook door het marketingbord
     gebruikt — je past ze hier dus voor beide apps tegelijk aan. */
  function kanalenHtml(){
    if(M.kanalenFout) return foutBlok('De kanalen', M.kanalenFout);
    const rijen = kanaalCijfers();
    const doelTotaal = rijen.reduce((s,r) => s + r.doel, 0);
    const weekTotaal = rijen.reduce((s,r) => s + r.week, 0);

    const tabel = rijen.length ? `
      <div class="tblwrap" style="border:none;border-radius:0">
        <table class="tbl"><thead><tr>
          <th>Kanaal</th><th class="n">Deze week</th><th style="width:100px">Doel gehaald</th>
          <th class="n">Doel p/w</th><th class="n">Gepubliceerd</th>
          <th class="n">Gem. bereik</th><th class="n">Leads</th><th></th>
        </tr></thead>
        <tbody>${rijen.map(r => `<tr>
          <td style="white-space:nowrap"><b>${kanaalStip(r.naam)}${h(r.naam)}</b>
            <div class="rowsub">${r.losseNaam ? 'staat niet in de kanalenlijst'
              : `${fmtN(r.gepland)} ingepland`}</div></td>
          <td class="n num">${fmtN(r.week)}</td>
          <td>${r.doel ? CRM.ui.bar(r.week/r.doel*100, r.week >= r.doel ? 'green' : '')
                       : '<span class="meta">geen doel</span>'}</td>
          <td class="n">${r.losseNaam ? '<span class="meta">—</span>'
            : `<input type="number" min="0" max="21" class="mkt-doel" value="${N(r.doel)}" data-doel="${h(r.naam)}" aria-label="Weekdoel voor ${h(r.naam)}">`}</td>
          <td class="n num">${fmtN(r.posts)}</td>
          <td class="n num">${r.bereik != null ? fmtN(r.bereik) : '—'}</td>
          <td class="n num">${fmtN(r.leads)}</td>
          <td class="n">${r.losseNaam ? ''
            : `<div class="row tight" style="justify-content:flex-end;flex-wrap:nowrap">
                <input type="color" class="mkt-kleur" value="${h(veiligeKleur(r.kanaal.kleur) === 'var(--line-2)' ? '#5b8bbf' : r.kanaal.kleur)}" data-kleur="${h(r.naam)}" title="Kleur van ${h(r.naam)}" aria-label="Kleur van ${h(r.naam)}">
                ${r.totaal ? '' : `<button class="btn ghost sm" data-kweg="${h(r.naam)}">Verwijderen</button>`}
              </div>`}</td>
        </tr>`).join('')}</tbody></table>
      </div>`
      : `<div class="card-b">${CRM.ui.leeg('Nog geen kanalen ingesteld',
          'Zonder kanalen kan een post nergens aan hangen en blijven alle chips grijs. Voeg hieronder je eerste kanaal toe — Facebook, Instagram, TikTok en LinkedIn zijn de gebruikelijke start.')}</div>`;

    return `
      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Kanalen</div>
          <span class="meta">${weekTotaal} van ${doelTotaal || '—'} posts deze week</span></div>
        ${tabel}
        <div class="card-f">
          <div class="row tight" style="flex-wrap:wrap;width:100%">
            <input type="text" id="mkt_knaam" placeholder="Nieuw kanaal, bijv. YouTube" style="flex:1;min-width:150px">
            <input type="color" id="mkt_kkleur" class="mkt-kleur" value="#5b8bbf" title="Kleur" aria-label="Kleur van het nieuwe kanaal">
            <button class="btn sm" id="mkt_kadd">Toevoegen</button>
          </div>
        </div>
      </div>
      <div class="vlak">
        <span class="label">Hoe je dit leest</span>
        <p class="sub" style="margin:0">Het weekdoel telt vanaf maandag en kijkt alleen naar gepubliceerde posts.
          Kleur en doel gelden ook in het marketingbord — je stelt ze hier voor beide apps in. Een kanaal verwijderen
          kan alleen als er geen enkele post meer op staat, anders zouden die posts hun kleur en plek kwijtraken.</p>
      </div>`;
  }

  /* ── 6f. Ideeën ── */
  function ideeenHtml(){
    if(!M.ideeSet.length) rolIdeeen();
    if(!M.afkSet.length)  rolAfkijk();
    const th = themas(), vandaag = new Date().getDay();

    const themaRijen = th.map((t,i) => `
      <div class="mkt-thema${i===vandaag?' nu':''}">
        <span class="label">${h(DAGNAAM[i])}</span>
        <span class="mkt-thema-t">${h(t)}</span>
        ${i===vandaag?`<span class="chip green">vandaag</span>`:''}
      </div>`).join('');

    const ideeKaart = (i,ix) => `
      <div class="mkt-idee">
        <b>${h(i.t)}</b>
        <span class="mkt-idee-h">“${h(i.k)}”</span>
        <div class="row tight" style="flex-wrap:wrap;margin-top:auto;padding-top:8px">
          <span class="chip">${h(i.f)}</span><span class="chip blue">${h(i.d)}</span>
          <div class="spacer"></div>
          <button class="btn ghost sm" data-idee="${ix}">Op het bord</button>
        </div>
      </div>`;

    const afkKaart = a => `
      <div class="mkt-idee">
        <b>${h(a.t)}</b>
        <span class="meta">${h(a.v)}</span>
        <span class="mkt-idee-h">${h(a.i)}</span>
        <span class="mkt-idee-h">“${h(a.k)}”</span>
      </div>`;

    return `
      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Weekthema's</div>
          <span class="meta">het ritme dat het hele team aanhoudt</span>
          <div class="spacer"></div>
          <button class="btn sm ghost" id="mkt_thema">Aanpassen</button></div>
        <div class="card-b">${themaRijen}</div>
        <div class="card-f"><span class="meta">Vaste rubrieken maken het merk herkenbaar en het posten makkelijker.
          Een aanpassing geldt meteen voor iedereen, ook in het marketingbord.</span></div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Inspiratie</div>
          <span class="meta">bewezen formats voor productie en logistiek</span>
          <div class="spacer"></div>
          <button class="btn sm ghost" id="mkt_rolidee">Andere drie</button></div>
        <div class="card-b"><div class="mkt-ideerij">${M.ideeSet.map(ideeKaart).join('')}</div></div>
        <div class="card-f"><span class="meta">{K} is de klant, {F} de functie — vul die in als je het idee uitwerkt.
          "Op het bord" zet het als idee in het marketingbord; schrijven en inplannen doe je daar.</span></div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Afkijken</div>
          <span class="meta">wat elders viraal gaat</span>
          <div class="spacer"></div>
          <button class="btn sm ghost" id="mkt_rolafk">Andere vier</button></div>
        <div class="card-b">
          <p class="sub" style="margin:0 0 12px">De formule achter bijna elke bedrijfsvideo die het goed doet:
            trend van de week × echte collega's × zelfspot. Gewoon op de telefoon gefilmd is juist goed.</p>
          <div class="mkt-ideerij">${M.afkSet.map(afkKaart).join('')}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><div class="h2">Waar je elke week spiekt</div></div>
        <div class="card-b"><div class="stack">${SPIEKLIJST.map(s => {
          const u = veiligeUrl(s.u);
          return `<div><b>${u ? `<a href="${h(u)}" target="_blank" rel="noopener">${h(s.w)} ↗</a>` : h(s.w)}</b>
            <div class="meta">${h(s.x)}</div></div>`;
        }).join('')}</div></div>
      </div>`;
  }

  /* ── 6d. Vacature-radar ── */
  function radarHtml(gaten){
    const open = (CRM.state.vacs||[]).filter(v => !v.status || v.status === 'Open').length;
    if(!gaten.length){
      /* Geen gaten kan twee dingen betekenen. "Alles heeft aandacht" is een
         compliment; bij nul vacatures zou dat een leugentje zijn. */
      return open
        ? CRM.ui.leeg('Elke open vacature heeft aandacht',
            'Voor alle openstaande vacatures liep er de afgelopen 14 dagen content of een advertentie.')
        : CRM.ui.leeg('Geen open vacatures',
            'Er staat op dit moment geen vacature open, dus er valt ook niets te missen. Zodra er één bijkomt, controleert dit scherm of er content of een advertentie voor loopt.');
    }
    /* Deze lijst is een aftreksom: vacatures min content min advertenties.
       Ontbreekt één van die twee bronnen, dan is de lijst te lang en dat
       moet je weten voordat je iemand erop aanspreekt. */
    const bronMist = M.postsFout ? 'de contentplanning' : M.metaFout ? 'de Meta-cijfers' : '';
    return `${bronMist ? `<div class="note warn" style="margin-bottom:18px">Deze lijst kan te lang zijn:
      ${h(bronMist)} konden niet geladen worden, dus er kan content of een advertentie lopen die hier niet meetelt.</div>` : ''}
    <div class="card">
      <div class="card-h"><div class="h2">Zonder content of advertentie</div>
        <span class="meta">open vacatures, laatste 14 dagen</span>
        <div class="spacer"></div>
        <a class="btn sm ghost" href="${BORD}" target="_blank" rel="noopener">Content plannen ↗</a></div>
      <div class="tblwrap" style="border:none;border-radius:0">
        <table class="tbl"><thead><tr>
          <th>Klant</th><th>Functie</th><th>Locatie</th><th class="n">Plekken</th><th class="n">Dagen open</th>
        </tr></thead>
        <tbody>${gaten.map(g => `<tr>
          <td><b>${h(g.v.klant)}</b></td>
          <td>${h(g.v.functie)}</td>
          <td class="meta">${h(g.v.locatie||'—')}</td>
          <td class="n num">${fmtN(g.v.aantal||1)}</td>
          <td class="n num">${g.dagenOpen!=null?g.dagenOpen:'—'}</td>
        </tr>`).join('')}</tbody></table>
      </div>
      <div class="card-f"><span class="meta">Deze vacatures krijgen nu geen instroom vanuit marketing. Eén post of advertentieset per vacature is meestal genoeg.</span></div>
    </div>`;
  }

  /* ═══ 7. DEMO-DATA ═══════════════════════════════════════════ */
  function demoData(){
    let seed = 20260730;
    const rnd = () => { seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; };
    /* Elke advertentie heeft een eigen profiel; 'recent' geldt voor de laatste
       7 dagen zodat de waakhond herkenbare signalen te pakken krijgt. */
    const ADS = [
      {c:'Productie & Inpak — Zuid-Holland', s:'Bodegraven 25 km',   a:'Salaris in beeld — € 2.750 + toeslag', sp:12,  cpc:0.32, ctr:0.021, lr:0.030},
      {c:'Productie & Inpak — Zuid-Holland', s:'Bodegraven 25 km',   a:'Video van de werkvloer',              sp:9,   cpc:0.29, ctr:0.026, lr:0.055},
      {c:'Productie & Inpak — Zuid-Holland', s:'Rotterdam-Zuid 20 km', a:'Direct starten, wekelijks betaald', sp:8,   cpc:0.35, ctr:0.018, lr:0.026},
      {c:'Heftruck & Magazijn — Rijnmond',   s:'Heftruckchauffeurs',  a:'Carrousel — machines en shifts',      sp:6.5, cpc:0.38, ctr:0.016, lr:0.022, rl:0},
      {c:'Heftruck & Magazijn — Rijnmond',   s:'Heftruckchauffeurs',  a:'Foto — heftruck in de hal',           sp:8,   cpc:0.33, ctr:0.019, lr:0.032, rb:0.42},
      {c:'Heftruck & Magazijn — Rijnmond',   s:'Orderpickers',        a:'Ploegentoeslag van 25%',              sp:7.5, cpc:0.30, ctr:0.020, lr:0.045, rc:2.2},
      {c:'Operators & Techniek',             s:'Procesoperators',     a:'Testimonial — Marek, operator',       sp:7,   cpc:0.34, ctr:0.007, lr:0.035},
      {c:'Operators & Techniek',             s:'Technische dienst',   a:'Doorgroeien naar TD-monteur',         sp:11,  cpc:0.36, ctr:0.014, lr:0.030, rl:0.25}
    ];
    const rijen = [];
    for(let d=29; d>=0; d--){
      const datum = isoT(d), recent = d < 7;
      const wknd  = [0,6].includes(new Date(datum+'T12:00').getDay());
      ADS.forEach((x,i) => {
        const cpc   = x.cpc * (recent && x.rc ? x.rc : 1);
        const spend = x.sp * (0.82 + 0.36*rnd()) * (wknd ? 0.78 : 1);
        const kliks = Math.max(1, Math.round(spend / cpc));
        const imp   = Math.round(kliks / x.ctr * (0.9 + 0.2*rnd()));
        const ber   = Math.round(imp * (0.6 + 0.1*rnd()) * (recent && x.rb ? x.rb : 1));
        const basis = kliks * x.lr * (recent && x.rl != null ? x.rl : 1);
        const leads = Math.max(0, Math.round(basis * (0.7 + 0.6*rnd())));
        rijen.push({id:'m'+d+'_'+i, datum, campagne:x.c, advertentieset:x.s, advertentie:x.a,
          uitgegeven:Math.round(spend*100)/100, impressies:imp, kliks, leads, bereik:ber,
          synced_at:new Date(Date.now()-3*3600e3).toISOString()});
      });
    }
    M.meta = rijen.sort((a,b) => b.datum.localeCompare(a.datum));
    /* Drie besluiten: één genegeerd advies (die advertentie zwijgt nu), één
       stopbesluit waar nog geld doorheen loopt (de bewaking moet aanslaan) en
       één advies van de agent dat nog gelezen moet worden. */
    M.besluiten = [
      {id:1, advertentie:'Foto — heftruck in de hal', campagne:'Heftruck & Magazijn — Rijnmond',
       besluit:'negeer', status:'open', door:'Bryan', note:'', created_at:new Date(Date.now()-2*864e5).toISOString()},
      {id:2, advertentie:'Carrousel — machines en shifts', campagne:'Heftruck & Magazijn — Rijnmond',
       besluit:'stop', status:'open', door:'Claude-agent', note:'Zeven dagen zonder lead.',
       created_at:new Date(Date.now()-3*864e5).toISOString()},
      {id:3, advertentie:'Testimonial — Marek, operator', campagne:'Operators & Techniek',
       besluit:'budget', status:'open', door:'Claude-agent',
       note:'Deze set krijgt 60% van het campagnebudget maar levert de duurste leads. Verschuif een deel naar Orderpickers.',
       created_at:new Date(Date.now()-1*864e5).toISOString()}
    ];

    /* Kanalen zoals ze in mkt_kanalen staan: naam, kleur, volgorde, weekdoel. */
    M.kanalen = [
      {naam:'Instagram', kleur:'#b23b8f', volgorde:1, doel_pw:2},
      {naam:'Facebook',  kleur:'#1877f2', volgorde:2, doel_pw:2},
      {naam:'TikTok',    kleur:'#20262e', volgorde:3, doel_pw:3},
      {naam:'LinkedIn',  kleur:'#0a66c2', volgorde:4, doel_pw:1}
    ];

    /* Weekplanner-taken uit het marketingbord — twee open, één blijven liggen. */
    const dISO = d => isoT(d);
    M.taken = [
      {id:'t1', tekst:'Filmdag bij De Gier voorbereiden — vier hooks klaarzetten', datum:dISO(2), klaar:false, door:'Bryan', created_at:new Date().toISOString()},
      {id:'t2', tekst:'Resultaten van de open dag-post invullen', datum:dISO(0), klaar:false, door:'Bryan', created_at:new Date().toISOString()},
      {id:'t3', tekst:'Poolse vertaling van de operator-advertentie laten nakijken', datum:dISO(-3), klaar:false, door:'Bryan', created_at:new Date().toISOString()},
      {id:'t4', tekst:'Weekrapport naar Tjeerd sturen', datum:dISO(0), klaar:true, door:'Bryan', created_at:new Date().toISOString()}
    ];

    const P = (d, kanaal, titel, format, fase, vacature, resultaat, hook, learnings) => ({
      id:'p'+titel.length+kanaal+d, titel, kanaal, format, fase, vacature:vacature||'',
      doel:'', hook:hook||'', learnings:learnings||'',
      datum:isoT(d), tijd:'11:00', link:'', resultaat:resultaat||{}
    });
    M.posts = [
      P(2,  'TikTok',    'Een dag met Marek, operator bij Whisk', 'Reel',      'Gepubliceerd', 'Whisk Food — Senior Operator', {bereik:14200, likes:412, reacties:38, leads:7}, '04:45. De wekker gaat. Dit is mijn dag als operator.'),
      P(3,  'Instagram', 'Wat verdien je écht in de productie?',  'Reel',      'Gepubliceerd', '', {bereik:8600, likes:233, reacties:19, leads:4}, '€2.750 bruto + 25% toeslag. Zwart op wit.'),
      P(5,  'LinkedIn',  'Waarom wij geen cv vragen bij de intake','Tekst',    'Gepubliceerd', '', {bereik:3100, likes:96, reacties:14, leads:1}, 'Een cv vertelt je niet of iemand om vijf uur opstaat.'),
      P(6,  'Facebook',  'Orderpickers gezocht in Rotterdam',     'Foto',      'Gepubliceerd', 'Proponent — Orderpicker', {bereik:5400, likes:61, reacties:22, leads:6}, 'Direct starten in Rotterdam-Zuid, €16,50 per uur.'),
      P(9,  'TikTok',    'Heftruckcertificaat in twee dagen',     'Reel',      'Gepubliceerd', '', {bereik:22800, likes:734, reacties:55, leads:11}, 'Twee dagen les, daarna €17 per uur.'),
      P(12, 'Instagram', 'Ploegendienst: drie hardnekkige mythes','Carrousel', 'Gepubliceerd', '', {bereik:6100, likes:151, reacties:9, leads:2}, 'Iedereen denkt dit over nachtdiensten.'),
      P(16, 'LinkedIn',  'Starcuisine breidt uit met drie collega\'s','Tekst', 'Learnings',    'Starcuisine — Productiemedewerker', {bereik:2700, likes:74, reacties:6, leads:0}, 'Drie ploeggenoten erbij bij Starcuisine.',
        'Klantcases op LinkedIn halen weinig bereik maar leveren wél gesprekken op — meten op reacties, niet op views.'),
      P(21, 'TikTok',    'Van magazijn naar teamleider in een jaar','Reel',    'Gepubliceerd', '', {bereik:17400, likes:520, reacties:31, leads:9}, 'Een jaar geleden orderpicker, nu stuurt hij de ploeg aan.',
        'Doorgroeiverhalen doen het beter dan salarisposts bij het jongere publiek op TikTok.'),
      P(28, 'Facebook',  'Nachtploeg gezocht in Bodegraven',      'Foto',      'Learnings',    '', {bereik:4800, likes:44, reacties:31, leads:5}, 'Nachtdienst = +25%. Reken maar mee.',
        'De meningsvraag in de caption verdrievoudigde de reacties zonder dat Meta het als bait zag.'),
      P(3,  'Facebook',  'Open dag Bodegraven — meld je aan',     'Foto',      'Gepubliceerd', 'Starcuisine — Productiemedewerker', {}, 'Zaterdag open dag — loop gewoon binnen.'),
      P(4,  'Instagram', 'Werken bij Burg Siroop',                'Story',     'Gepubliceerd', '', {}, 'Kom mee, we lopen een dagje mee.'),
      P(7,  'TikTok',    'Vraag en antwoord over uitzendwerk',    'Reel',      'Gepubliceerd', '', {}, 'Jullie vragen, wij antwoorden.'),
      P(-1, 'TikTok',    'Je salarisstrook uitgelegd',            'Reel',      'Ingepland',    ''),
      P(-2, 'Instagram', 'Collega van de maand: Ionut',           'Reel',      'Ingepland',    ''),
      P(-4, 'LinkedIn',  'Hoe wij no-shows hebben gehalveerd',    'Tekst',     'Ingepland',    ''),
      P(-6, 'Facebook',  'Lassers gezocht in de regio Alphen',    'Foto',      'Ingepland',    ''),
      P(-8, 'TikTok',    'Waarom wij binnen een uur terugbellen', 'Reel',      'Script klaar', '')
    ];
  }

  /* ═══ 8. REGISTRATIE ═════════════════════════════════════════ */
  CRM.registerModule('marketing', {
    title:'Marketing', icon:'◐', onderschrift:'Advertenties, content, kanalen en wat ze opleveren',
    badge(){ return M.badge; },
    render
  });
})();
