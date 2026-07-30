/* ═══════════════════════════════════════════════════════════════
   MODULE: MARKETING
   Wat levert het marketinggeld op? Vier rustige weergaven:
     1. Prestatie — Meta-advertenties + waakhond-adviezen
     2. Keten     — uitgegeven → leads → kandidaten → plaatsingen
     3. Content   — wat er gepland en gepubliceerd is (lezen, niet maken)
     4. Radar     — open vacatures zonder content of advertentie
   Bron: de bestaande mkt_*-tabellen. Posten/plannen blijft in het
   marketingbord — dat dupliceren we hier bewust niet.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const h = CRM.h;
  const BORD       = 'https://ploeggenoten.github.io/marketingbord/';
  const ADSMANAGER = 'https://adsmanager.facebook.com/adsmanager/manage/ads';

  const M = {
    geladen:false, laadt:false,
    meta:[], besluiten:[], posts:[],
    metaFout:null, postsFout:null, isDemo:false,
    tab:'prestatie', periode:30,
    open:new Set(),                 // uitgeklapte campagnes/advertentiesets
    badge:0, mount:null, actiesEl:null
  };

  /* ─── Kleine helpers ──────────────────────────────────────── */
  const N     = n => Number(n)||0;
  const fmtN  = n => Math.round(N(n)).toLocaleString('nl-NL');
  const isoT  = d => new Date(Date.now() - d*864e5).toLocaleDateString('sv-SE');
  const DAGKORT = ['zo','ma','di','wo','do','vr','za'];

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

  /* ═══ 1. DATA ════════════════════════════════════════════════ */
  async function veilig(q){
    try{
      const r = await q;
      if(r.error) return {rows:[], fout:r.error};
      return {rows:r.data||[], fout:null};
    }catch(e){ return {rows:[], fout:e}; }
  }
  function rowToPost(r){
    return { id:r.id, titel:r.titel||'', kanaal:r.kanaal||'', format:r.format||'',
      fase:r.fase||'Idee', vacature:r.vacature||'', campagne:r.campagne||'',
      datum:r.publicatie_datum||'', tijd:r.publicatie_tijd||'', link:r.link||'',
      resultaat:(r.resultaat && typeof r.resultaat==='object') ? r.resultaat : {} };
  }

  async function laad(){
    if(M.laadt) return; M.laadt = true;
    if(CRM.demo){
      demoData(); M.isDemo = true; M.geladen = true; M.laadt = false; telBadge(); return;
    }
    const [a,b,c] = await Promise.all([
      veilig(CRM.sb.from('mkt_meta_stats').select('*').order('datum',{ascending:false}).limit(3000)),
      veilig(CRM.sb.from('mkt_ad_besluiten').select('*').order('created_at',{ascending:false})),
      veilig(CRM.sb.from('mkt_posts').select('*'))
    ]);
    M.meta = a.rows; M.metaFout = a.fout;
    M.besluiten = b.rows;
    M.posts = c.rows.map(rowToPost); M.postsFout = c.fout;
    M.geladen = true; M.laadt = false;
    telBadge();
  }
  function telBadge(){
    try{ M.badge = adviezen().length + nagPosts().length; }catch(e){ M.badge = 0; }
    CRM.navBadges();
  }

  /* ═══ 2. WAAKHOND ════════════════════════════════════════════ */
  /* Adviseert, jij beslist. Al genomen besluiten (mkt_ad_besluiten)
     verbergen het advies 14 dagen — zo blijft alleen open werk staan. */
  function afgehandeld(ad, camp){
    return M.besluiten.some(b =>
      String(b.advertentie||'') === ad &&
      !String(b.advertentie||'').startsWith('__') &&
      (!b.campagne || b.campagne === camp) &&
      (CRM.dagenGeleden(b.created_at) == null || CRM.dagenGeleden(b.created_at) < 14));
  }

  function adviezen(){
    if(!M.meta.length) return [];
    const d7 = isoT(7), d14 = isoT(14);
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
      if(afgehandeld(advertentie, campagne)) continue;
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
        A('red','Geld op, geen enkele lead', `${CRM.euro(s7.spend)} in zeven dagen zonder één lead.`, ['stop','negeer']); continue;
      }
      if(s7.cpl && acc.cpl && s7.cpl > 2.5*acc.cpl){
        A('red','Kosten per lead uit de bocht',
          `${CRM.euro(s7.cpl,2)} per lead tegen ${CRM.euro(acc.cpl,2)} gemiddeld (${(s7.cpl/acc.cpl).toFixed(1).replace('.',',')}× zo duur).`, ['stop','negeer']); continue;
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
    M.besluiten.unshift({id:CRM.uid(), advertentie, campagne, besluit:keuze,
      status:'open', door:CRM.me(), note:'', created_at:new Date().toISOString()});
    if(!CRM.demo){
      const {error} = await CRM.sb.from('mkt_ad_besluiten')
        .insert({advertentie, campagne, besluit:keuze, status:'open', door:CRM.me()});
      if(error) return CRM.fout('Besluit opslaan mislukt', error);
    }
    CRM.toast(keuze==='stop' ? 'Genoteerd — zet hem ook echt uit in Ads Manager'
            : keuze==='opschalen' ? 'Genoteerd als op te schalen' : 'Genoteerd', 'ok');
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

  /* ═══ 6. WEERGAVE ════════════════════════════════════════════ */
  function render(mount, actiesEl){
    M.mount = mount; M.actiesEl = actiesEl;
    if(!M.geladen){
      mount.innerHTML = CRM.ui.laden('Marketingcijfers laden…');
      laad().then(teken).catch(e => {
        console.error('marketing laden', e);
        mount.innerHTML = `<div class="note err">De marketingcijfers konden niet geladen worden.</div>`;
      });
      return;
    }
    teken();
  }

  function teken(){
    const mount = M.mount; if(!mount) return;
    kopActies();
    const adv = adviezen(), nag = nagPosts(), gaten = radar();
    const TABS = [
      {k:'prestatie', t:'Prestatie', n:adv.length},
      {k:'keten',     t:'Keten',     n:0},
      {k:'content',   t:'Content',   n:nag.length},
      {k:'radar',     t:'Vacature-radar', n:gaten.length}
    ];
    const body = M.tab === 'prestatie' ? prestatieHtml(adv)
               : M.tab === 'keten'     ? ketenHtml()
               : M.tab === 'content'   ? contentHtml(nag)
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
    CRM.$$('[data-uit]', root).forEach(r => r.onclick = () => {
      const k = r.dataset.uit;
      M.open.has(k) ? M.open.delete(k) : M.open.add(k);
      const tbl = document.getElementById('mkt_camp');
      if(tbl){ tbl.innerHTML = campagneRijen(); bindActies(tbl); }
      else teken();
    });
  }

  /* ── 6a. Prestatie ── */
  function prestatieHtml(adv){
    if(!M.meta.length) return leegMeta();
    const rows = binnenPeriode();
    const s = stat(rows);
    const laatst = M.meta[0]?.synced_at ? CRM.fmtDate(M.meta[0].synced_at) : '';
    return `
      ${adviesHtml(adv)}
      <div class="grid c4" style="margin-bottom:18px">
        ${CRM.ui.kpi('Uitgegeven', `<span class="num">${CRM.euro(s.spend)}</span>`, `laatste ${M.periode} dagen`, 'accent')}
        ${CRM.ui.kpi('Leads', `<span class="num">${fmtN(s.leads)}</span>`, s.leads ? 'via Meta-formulieren' : 'nog geen leads')}
        ${CRM.ui.kpi('Kosten per lead', `<span class="num">${s.cpl?CRM.euro(s.cpl,2):'—'}</span>`, 'gemiddeld over de periode')}
        ${CRM.ui.kpi('Kliks', `<span class="num">${fmtN(s.kliks)}</span>`, `${fmtN(s.imp)} impressies`)}
        ${CRM.ui.kpi('CPC', `<span class="num">${s.cpc?CRM.euro(s.cpc,2):'—'}</span>`, 'richtlijn NL: € 0,30 – 0,40')}
        ${CRM.ui.kpi('CTR', `<span class="num">${s.ctr!=null?CRM.pct(s.ctr,2):'—'}</span>`, 'kliks per impressie')}
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Per campagne</div>
          <span class="meta">Klik een regel open voor advertentiesets en advertenties</span></div>
        <div class="tblwrap" style="border:none;border-radius:0 0 var(--r) var(--r)">
          <table class="tbl">
            <thead><tr>
              <th>Campagne</th><th class="n">Uitgegeven</th><th style="width:96px">Aandeel</th>
              <th class="n">Leads</th><th class="n">€ / lead</th><th class="n">Kliks</th>
              <th class="n">CPC</th><th class="n">CTR</th>
            </tr></thead>
            <tbody id="mkt_camp">${campagneRijen()}</tbody>
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
    if(!adv.length) return `<div class="note ok" style="margin-bottom:18px">Geen openstaande advertentie-adviezen — alles loopt binnen de bandbreedte.</div>`;
    const kleurVar = {red:'var(--red)', amber:'var(--amber)', green:'var(--green)'};
    const knop = (a, keuze, tekst) =>
      `<button class="btn ghost sm" data-bes="${h(keuze)}|${h(a.advertentie)}|${h(a.campagne)}">${h(tekst)}</button>`;
    return `<div class="card" style="margin-bottom:18px">
      <div class="card-h"><div class="h2">Adviezen</div>
        <span class="meta">${adv.length===1?'1 advertentie vraagt':adv.length+' advertenties vragen'} om een besluit</span></div>
      <div>${adv.map(a => `
        <div class="mkt-advies">
          <span class="dot" style="background:${kleurVar[a.kleur]}"></span>
          <div class="mkt-a-t">
            <div><b>${h(a.titel)}</b> <span class="meta">— ${h(a.advertentie)} · ${h(a.campagne)}</span></div>
            <div class="meta">${h(a.uitleg)}</div>
            <div class="meta num">${h(a.cijfers)}</div>
          </div>
          <div class="row tight mkt-a-k">
            ${a.keuzes.includes('stop')      ? knop(a,'stop','Stopzetten') : ''}
            ${a.keuzes.includes('opschalen') ? knop(a,'opschalen','Opschalen') : ''}
            ${a.keuzes.includes('negeer')    ? knop(a,'negeer','Prima zo') : ''}
          </div>
        </div>`).join('')}</div>
      <div class="card-f"><span class="meta">Een besluit verbergt het advies 14 dagen. Aanpassen doe je in
        <a href="${ADSMANAGER}" target="_blank" rel="noopener">Ads Manager</a>.</span></div>
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
  function cijferCellen(s, totaal){
    const aandeel = totaal ? s.spend/totaal*100 : 0;
    return `<td class="n num">${CRM.euro(s.spend)}</td>
      <td>${CRM.ui.bar(aandeel)}</td>
      <td class="n num">${fmtN(s.leads)}</td>
      <td class="n num">${s.cpl?CRM.euro(s.cpl,2):'—'}</td>
      <td class="n num">${fmtN(s.kliks)}</td>
      <td class="n num">${s.cpc?CRM.euro(s.cpc,2):'—'}</td>
      <td class="n num">${s.ctr!=null?CRM.pct(s.ctr,2):'—'}</td>`;
  }
  function campagneRijen(){
    const camps = [...boom().values()];
    if(!camps.length) return `<tr><td colspan="8" class="meta" style="padding:18px 14px">Geen uitgaven in deze periode.</td></tr>`;
    const totaal = camps.reduce((t,c) => t + stat(c.rows).spend, 0);
    let html = '';
    camps.sort((a,b) => stat(b.rows).spend - stat(a.rows).spend).forEach(c => {
      const ck = 'c:'+c.naam, cOpen = M.open.has(ck);
      html += `<tr class="clickable" data-uit="${h(ck)}">
        <td><span class="mkt-caret ${cOpen?'op':''}">▸</span><b>${h(c.naam)}</b>
          <div class="rowsub">${c.sets.size} advertentieset${c.sets.size===1?'':'s'}</div></td>
        ${cijferCellen(stat(c.rows), totaal)}</tr>`;
      if(!cOpen) return;
      [...c.sets.values()].sort((a,b)=>stat(b.rows).spend-stat(a.rows).spend).forEach(s => {
        const sk = 's:'+c.naam+'|'+s.naam, sOpen = M.open.has(sk);
        html += `<tr class="clickable mkt-r1" data-uit="${h(sk)}">
          <td class="mkt-n1"><span class="mkt-caret ${sOpen?'op':''}">▸</span>${h(s.naam)}</td>
          ${cijferCellen(stat(s.rows), totaal)}</tr>`;
        if(!sOpen) return;
        [...s.ads.values()].sort((a,b)=>stat(b.rows).spend-stat(a.rows).spend).forEach(a => {
          html += `<tr class="mkt-r2"><td class="mkt-n2">${h(a.naam)}</td>
            ${cijferCellen(stat(a.rows), totaal)}</tr>`;
        });
      });
    });
    return html;
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
    if(!dagen.some(d => d.spend > 0)) return `<div class="meta">Geen uitgaven in de laatste 14 dagen.</div>`;
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
    const geld = CRM.canSeeMoney();
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
            ${pijl(k.spend ? CRM.euro(k.leads ? k.spend/k.leads : 0, 2) + ' p/l' : '—')}
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

      <div class="grid c3" style="margin-bottom:18px">
        ${CRM.ui.kpi('Kosten per lead', `<span class="num">${k.leads?CRM.euro(k.spend/k.leads,2):'—'}</span>`,
          `${fmtN(k.leads)} CRM-leads uit ${CRM.euro(k.spend)}`)}
        ${CRM.ui.kpi('Kosten per kandidaat', `<span class="num">${k.kandidaten?CRM.euro(k.spend/k.kandidaten):'—'}</span>`,
          `${fmtN(k.kandidaten)} kandidaten op het bord`)}
        ${geld
          ? CRM.ui.kpi('Kosten per plaatsing', `<span class="num">${kpl}</span>`,
              k.geplaatst ? `${fmtN(k.geplaatst)} plaatsing${k.geplaatst===1?'':'en'} in de periode` : 'nog geen plaatsing', 'accent')
          : CRM.ui.kpi('Plaatsingen', `<span class="num">${fmtN(k.geplaatst)}</span>`, 'uit Meta-leads in deze periode')}
      </div>

      <div class="card">
        <div class="card-h"><div class="h2">Waar valt het weg?</div></div>
        <div class="tblwrap" style="border:none;border-radius:0 0 var(--r) var(--r)">
          <table class="tbl"><thead><tr><th>Stap</th><th class="n">Aantal</th><th class="n">Doorstroom</th><th style="width:180px"></th></tr></thead>
          <tbody>
            ${[['Leads in CRM', k.leads, k.leads],
               ['Kandidaten', k.kandidaten, k.leads],
               ['Voorgesteld', k.voorgesteld, k.kandidaten],
               ['Geplaatst', k.geplaatst, k.voorgesteld]].map(([lbl, n, basis]) => `
              <tr><td>${h(lbl)}</td><td class="n num">${fmtN(n)}</td>
                <td class="n num">${basis ? Math.round(n/basis*100)+'%' : '—'}</td>
                <td>${CRM.ui.bar(k.leads ? n/k.leads*100 : 0)}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>`;
  }

  /* ── 6c. Content ── */
  function contentHtml(nag){
    if(!M.posts.length){
      return CRM.ui.leeg('Nog geen content gevonden',
        'De contentplanning staat in het marketingbord. Zodra daar posts staan, zie je hier wat er gepland is en wat een gepubliceerde post heeft opgeleverd.',
        `<a class="btn" href="${BORD}" target="_blank" rel="noopener">Marketingbord openen ↗</a>`);
    }
    const vandaag = CRM.todayISO();
    const gepland = M.posts.filter(p => !GEPUBLICEERD(p) && p.datum && p.datum >= vandaag)
                           .sort((a,b) => a.datum.localeCompare(b.datum));
    const pub = M.posts.filter(GEPUBLICEERD).sort((a,b) => (b.datum||'').localeCompare(a.datum||'')).slice(0,20);
    const nagIds = new Set(nag.map(p => p.id));

    const kanaalChip = k => `<span class="chip">${h(k||'—')}</span>`;
    const res = (p,k) => N(p.resultaat?.[k]) ? fmtN(p.resultaat[k]) : '<span class="meta">—</span>';

    return `
      ${nag.length ? `<div class="note warn" style="margin-bottom:18px">
        <b>${nag.length} gepubliceerde post${nag.length===1?'':'s'} zonder resultaten.</b>
        Zonder bereik en leads weet je niet wat werkt — vul ze bij in het marketingbord.</div>` : ''}

      <div class="card" style="margin-bottom:18px">
        <div class="card-h"><div class="h2">Binnenkort</div><span class="meta">${gepland.length} gepland</span>
          <div class="spacer"></div>
          <a class="btn sm ghost" href="${BORD}" target="_blank" rel="noopener">Nieuwe post maken ↗</a></div>
        ${gepland.length ? `<div class="tblwrap" style="border:none;border-radius:0">
          <table class="tbl"><thead><tr><th>Datum</th><th>Kanaal</th><th>Titel</th><th>Status</th><th>Vacature</th></tr></thead>
          <tbody>${gepland.slice(0,10).map(p => `<tr>
            <td class="num" style="white-space:nowrap">${h(CRM.fmtDateShort(p.datum))}${p.tijd?` <span class="meta num">${h(p.tijd)}</span>`:''}</td>
            <td>${kanaalChip(p.kanaal)}</td>
            <td><b>${h(p.titel||'(zonder titel)')}</b>${p.format?`<div class="rowsub">${h(p.format)}</div>`:''}</td>
            <td><span class="chip ${p.fase==='Ingepland'?'amber':''}">${h(p.fase)}</span></td>
            <td class="meta">${h(p.vacature||'—')}</td></tr>`).join('')}</tbody></table>
        </div>` : `<div class="card-b"><span class="meta">Niets ingepland. Dat is het moment om nieuwe content te maken.</span></div>`}
      </div>

      <div class="card">
        <div class="card-h"><div class="h2">Gepubliceerd</div><span class="meta">laatste ${pub.length}</span></div>
        <div class="tblwrap" style="border:none;border-radius:0 0 var(--r) var(--r)">
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
      </div>`;
  }

  /* ── 6d. Vacature-radar ── */
  function radarHtml(gaten){
    if(!gaten.length){
      return CRM.ui.leeg('Elke open vacature heeft aandacht',
        'Voor alle openstaande vacatures liep er de afgelopen 14 dagen content of een advertentie.');
    }
    return `<div class="card">
      <div class="card-h"><div class="h2">Zonder content of advertentie</div>
        <span class="meta">open vacatures, laatste 14 dagen</span>
        <div class="spacer"></div>
        <a class="btn sm ghost" href="${BORD}" target="_blank" rel="noopener">Content plannen ↗</a></div>
      <div class="tblwrap" style="border:none;border-radius:0 0 var(--r) var(--r)">
        <table class="tbl"><thead><tr>
          <th>Klant</th><th>Functie</th><th>Locatie</th><th class="n">Plekken</th><th class="n">Dagen open</th><th>Wat mist</th>
        </tr></thead>
        <tbody>${gaten.map(g => `<tr>
          <td><b>${h(g.v.klant)}</b></td>
          <td>${h(g.v.functie)}</td>
          <td class="meta">${h(g.v.locatie||'—')}</td>
          <td class="n num">${fmtN(g.v.aantal||1)}</td>
          <td class="n num">${g.dagenOpen!=null?g.dagenOpen:'—'}</td>
          <td><span class="chip red">geen content</span> <span class="chip red">geen advertentie</span></td>
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
    /* Eén eerder genomen besluit — die advertentie mag geen advies meer geven. */
    M.besluiten = [{id:1, advertentie:'Foto — heftruck in de hal', campagne:'Heftruck & Magazijn — Rijnmond',
      besluit:'negeer', status:'open', door:'Bryan', note:'', created_at:new Date(Date.now()-2*864e5).toISOString()}];

    const P = (d, kanaal, titel, format, fase, vacature, resultaat) => ({
      id:'p'+titel.length+kanaal+d, titel, kanaal, format, fase, vacature:vacature||'',
      datum:isoT(d), tijd:'11:00', link:'', resultaat:resultaat||{}
    });
    M.posts = [
      P(2,  'TikTok',    'Een dag met Marek, operator bij Whisk', 'Reel',      'Gepubliceerd', 'Whisk Food — Senior Operator', {bereik:14200, likes:412, reacties:38, leads:7}),
      P(3,  'Instagram', 'Wat verdien je écht in de productie?',  'Reel',      'Gepubliceerd', '', {bereik:8600, likes:233, reacties:19, leads:4}),
      P(5,  'LinkedIn',  'Waarom wij geen cv vragen bij de intake','Tekst',    'Gepubliceerd', '', {bereik:3100, likes:96, reacties:14, leads:1}),
      P(6,  'Facebook',  'Orderpickers gezocht in Rotterdam',     'Foto',      'Gepubliceerd', 'Proponent — Orderpicker', {bereik:5400, likes:61, reacties:22, leads:6}),
      P(9,  'TikTok',    'Heftruckcertificaat in twee dagen',     'Reel',      'Gepubliceerd', '', {bereik:22800, likes:734, reacties:55, leads:11}),
      P(12, 'Instagram', 'Ploegendienst: drie hardnekkige mythes','Carrousel', 'Gepubliceerd', '', {bereik:6100, likes:151, reacties:9, leads:2}),
      P(16, 'LinkedIn',  'Starcuisine breidt uit met drie collega\'s','Tekst', 'Learnings',    'Starcuisine — Productiemedewerker', {bereik:2700, likes:74, reacties:6, leads:0}),
      P(21, 'TikTok',    'Van magazijn naar teamleider in een jaar','Reel',    'Gepubliceerd', '', {bereik:17400, likes:520, reacties:31, leads:9}),
      P(3,  'Facebook',  'Open dag Bodegraven — meld je aan',     'Foto',      'Gepubliceerd', 'Starcuisine — Productiemedewerker', {}),
      P(4,  'Instagram', 'Werken bij Burg Siroop',                'Story',     'Gepubliceerd', '', {}),
      P(7,  'TikTok',    'Vraag en antwoord over uitzendwerk',    'Reel',      'Gepubliceerd', '', {}),
      P(-1, 'TikTok',    'Je salarisstrook uitgelegd',            'Reel',      'Ingepland',    ''),
      P(-2, 'Instagram', 'Collega van de maand: Ionut',           'Reel',      'Ingepland',    ''),
      P(-4, 'LinkedIn',  'Hoe wij no-shows hebben gehalveerd',    'Tekst',     'Ingepland',    ''),
      P(-6, 'Facebook',  'Lassers gezocht in de regio Alphen',    'Foto',      'Ingepland',    ''),
      P(-8, 'TikTok',    'Waarom wij binnen een uur terugbellen', 'Reel',      'Script klaar', '')
    ];
  }

  /* ═══ 8. REGISTRATIE ═════════════════════════════════════════ */
  CRM.registerModule('marketing', {
    title:'Marketing', icon:'◐', onderschrift:'Advertenties, content en wat ze opleveren',
    badge(){ return M.badge; },
    render
  });
})();
