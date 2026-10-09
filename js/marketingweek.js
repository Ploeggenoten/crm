/* ═══════════════════════════════════════════════════════════════
   MODULE: MARKETINGWEEK  ("Mijn week" voor de marketeer)

   Het startscherm van wie marketing doet (profiel functie = marketeer).
   Bryan werkt hier: wat staat er deze week, wat is er klaar, wat blijft
   liggen, en hoe lopen de Meta-cijfers. Tjeerd ziet hetzelfde scherm en
   kan met "Komende weken" in één blik zien wat er is ingepland.

   Drie tabbladen, niet meer:
     Week            de vijf dagen met vaste blokken, taken en posts
     Komende weken   per week: posts ingepland, blokken en taken klaar
     Jaarplan        het thema per maand en de vaste momenten

   Gebaseerd op Contentstrategie 2027 (concept, oktober 2026): maandag
   cijfers en plannen, dinsdag filmen, woensdag monteren, donderdag vrij,
   vrijdag content. De vaste blokken en het jaarplan staan hieronder als
   gegevens; wie ze wil aanpassen past ze hier aan.

   Leest: mkt_posts, mkt_taken, mkt_meta_stats, mkt_ad_besluiten.
   Schrijft: mkt_taken (taken) en mkt_blok_klaar (afgevinkte blokken, zie
   supabase/migratie-marketingweek.sql). Zonder die tabel werkt alles
   behalve het afvinken van vaste blokken.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const h = CRM.h;
  const BORD = 'https://ploeggenoten.github.io/marketingbord/';

  /* ─── Gegevens uit het plan ─────────────────────────────────── */
  const DAGEN = {1:'Maandag', 2:'Dinsdag', 3:'Woensdag', 4:'Donderdag', 5:'Vrijdag'};
  const THEMA = {1:'Cijfers en plannen', 2:'Filmdag', 3:'Editdag', 4:'Vrij', 5:'Content'};
  const BLOKKEN = {
    1:[{id:'ma-meta',    t:'Meta-campagnes en budget bekijken', u:'Vast blok, alleen op maandag'},
       {id:'ma-week',    t:'Weekstart: staat alles voor deze week ingepland?'},
       {id:'ma-scripts', t:'Scripts schrijven voor de filmdag'},
       {id:'ma-plan',    t:'Planning van volgende week'}],
    2:[{id:'di-film',    t:'Filmdag op locatie'},
       {id:'di-beeld',   t:'Beeld ordenen en opslaan'}],
    3:[{id:'wo-edit',    t:'Monteren'},
       {id:'wo-klaar',   t:'Alles klaarzetten en inplannen'}],
    4:[],
    5:[{id:'vr-teksten', t:'Teksten schrijven'},
       {id:'vr-inplan',  t:'Posts inplannen'},
       {id:'vr-collega', t:'Collega\'s helpen met hun posts'},
       {id:'vr-bak',     t:'Ideeënbak doorlopen'},
       {id:'vr-vrij',    t:'Vrij vak: wat er tussendoor kwam', u:'De laatste twee uur. Enige plek voor ad hoc werk.'}]
  };
  /* Wie post wanneer op LinkedIn, en wanneer komt er een Instagram-video. */
  const LINKEDIN = {1:'Tjeerd', 2:'Tjerk', 3:'Rajesh', 4:'Daan', 5:'Bryan'};
  const INSTAGRAM = [2, 4];
  const PIJLERS = ['A: Case uit de praktijk', 'B: Inzicht', 'C: Het team', 'D: Video van de werkvloer'];
  const MAANDEN = [
    ['Januari','Nieuw jaar, nieuwe kans. Kandidaten: nieuwe baan. Klanten: wat wij dit jaar doen.'],
    ['Februari','Wat we leren van de eerste 90 dagen. Cases van Le Duc.'],
    ['Maart','Resultaten laten zien. Terugblik voor klanten.'],
    ['April','Voorjaar. Aandacht voor de mensen achter de organisatie.'],
    ['Mei','Vakmanschap: wat mensen op de werkvloer doen.'],
    ['Juni','Voor de zomer: team en klantverhalen. Voorraad opbouwen.'],
    ['Juli','Zomerritme begint. Voorraad inzetten.'],
    ['Augustus','Zomerritme. Lichtere planning, geen nieuw filmwerk.'],
    ['September','Najaar start. Terugblik op een jaar Le Duc.'],
    ['Oktober','Drukte in het najaar: vacatures, extra krachten, klantverhalen.'],
    ['November','Piekperiode: wat het werk dan van mensen vraagt.'],
    ['December','Terugblik op het jaar. Het team in beeld. Plan voor 2028.']];
  /* Vaste momenten, op de maandag van de week waarin ze vallen. */
  const MOMENTEN = {
    '2027-02-01':'Contractdoelen Bryan: 1 februari (LinkedIn 600, Instagram 1.500)',
    '2027-02-08':'Le Duc-filmdag', '2027-02-15':'Le Duc: editen', '2027-02-22':'Le Duc: editen',
    '2027-03-22':'Le Duc: oplevering (3 video\'s)',
    '2027-05-10':'Le Duc-filmdag', '2027-05-17':'Le Duc: editen', '2027-05-24':'Le Duc: editen',
    '2027-06-21':'Le Duc: oplevering (3 video\'s)',
    '2027-07-12':'Le Duc-filmdag', '2027-07-19':'Le Duc: editen', '2027-07-26':'Le Duc: editen',
    '2027-09-20':'Le Duc: oplevering (3 video\'s)',
    '2027-03-08':'Besluit over TikTok',
    '2027-03-29':'Review van de eerste 90 dagen en kwartaalreview',
    '2027-06-28':'Kwartaalreview', '2027-09-27':'Kwartaalreview', '2027-12-20':'Jaarreview',
    '2027-08-02':'Voorraadweek: posten uit wat klaarstaat', '2027-08-09':'Voorraadweek: posten uit wat klaarstaat',
    '2027-08-16':'Voorraadweek: posten uit wat klaarstaat', '2027-12-27':'Rustweek: posten uit voorraad'};
  /* TikTok-pilot: weken 2 tot en met 9 van 2027. */
  const TIKTOK_VAN = '2027-01-11', TIKTOK_TOT = '2027-03-01';
  const FEESTDAGEN = {
    '2026-12-25':'Eerste kerstdag', '2026-12-26':'Tweede kerstdag', '2027-01-01':'Nieuwjaarsdag',
    '2027-03-26':'Goede Vrijdag', '2027-03-29':'Tweede paasdag', '2027-04-27':'Koningsdag (filmdag naar maandag)',
    '2027-05-06':'Hemelvaart', '2027-05-17':'Tweede pinksterdag', '2027-12-25':'Eerste kerstdag', '2027-12-26':'Tweede kerstdag'};
  const INGEPLAND = ['Ingepland', 'Gepubliceerd', 'Learnings'];

  /* ─── Datums (lokaal, op de middag zodat zomertijd niets verschuift) ── */
  const dt  = iso => new Date(iso + 'T12:00:00');
  const iso = d => d.toLocaleDateString('sv-SE');
  const plus = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const maandagVan = s => { const d = dt(s); const dag = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dag); return iso(d); };
  const weekNr = s => {
    const d = dt(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  };
  const kort = s => dt(s).toLocaleDateString('nl-NL', {day:'numeric', month:'short'}).replace('.', '');
  const bereik = mon => {
    const z = plus(mon, 6), a = dt(mon), b = dt(z);
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} t/m ${b.getDate()} ${b.toLocaleDateString('nl-NL', {month:'short'}).replace('.', '')}`
      : `${kort(mon)} t/m ${kort(z)}`;
  };
  const pijlerVan = mon => {
    const n = Math.round((dt(mon) - dt('2027-01-04')) / (7 * 864e5));
    return PIJLERS[((n % 4) + 4) % 4];
  };
  const maandVan = mon => MAANDEN[dt(plus(mon, 3)).getMonth()];
  const N = x => Number(x) || 0;

  /* ─── Welke blokken horen bij een week ─────────────────────── */
  function blokkenVoor(mon){
    const uit = {};
    for(const dag of [1,2,3,4,5]) uit[dag] = (BLOKKEN[dag] || []).map(b => ({...b}));
    const d1 = dt(mon);
    if(d1.getDate() <= 7) uit[1].push({id:'ma-maand', t:'Maandmeting (1 uur)', u:'Eerste maandag van de maand'});
    const vr = dt(plus(mon, 4));
    const laatsteVr = new Date(vr); laatsteVr.setDate(laatsteVr.getDate() + 7);
    const vrijdagIso = iso(vr);
    if(laatsteVr.getMonth() !== vr.getMonth() && !FEESTDAGEN[vrijdagIso] && mon !== '2027-12-27')
      uit[5].push({id:'vr-strat', t:'Strategie: halve dag', u:'Laatste vrijdag van de maand'});
    const m = MOMENTEN[mon];
    if(m && /^Le Duc/.test(m)) uit[2].unshift({id:'di-leduc', t:m});
    if(m && /review/i.test(m)) uit[5].push({id:'vr-review', t:m});
    return uit;
  }
  const alleBlokken = mon => Object.values(blokkenVoor(mon)).flat();

  /* ─── Staat ─────────────────────────────────────────────── */
  const M = {
    geladen:false, mount:null, actiesEl:null, demo:false,
    tab:'week', week:null,
    posts:[], taken:[], blok:new Map(), meta:[], besluiten:[],
    blokFout:null, takenFout:null, postsFout:null, metaFout:null
  };
  const huidigeWeek = () => maandagVan(CRM.todayISO());
  const kanaalIs = (p, wat) => new RegExp(wat, 'i').test(p.kanaal || '');

  async function veilig(q){
    try{ const r = await q; return r.error ? {rows:[], fout:r.error} : {rows:r.data || [], fout:null}; }
    catch(e){ return {rows:[], fout:e}; }
  }
  async function laad(){
    if(CRM.demo){ demoData(); M.geladen = true; return; }
    const vanaf = plus(huidigeWeek(), -70), meta14 = plus(CRM.todayISO(), -14);
    const [p, t, b, m, a] = await Promise.all([
      veilig(CRM.sb.from('mkt_posts').select('id,titel,kanaal,fase,publicatie_datum')),
      veilig(CRM.sb.from('mkt_taken').select('*').order('datum').order('created_at')),
      veilig(CRM.sb.from('mkt_blok_klaar').select('*').gte('week', vanaf)),
      veilig(CRM.sb.from('mkt_meta_stats').select('datum,uitgegeven,leads').gte('datum', meta14)),
      veilig(CRM.sb.from('mkt_ad_besluiten').select('advertentie,besluit,status'))
    ]);
    M.posts = p.rows.map(r => ({id:r.id, titel:r.titel || '', kanaal:r.kanaal || '', fase:r.fase || 'Idee', datum:r.publicatie_datum || ''}));
    M.postsFout = p.fout; M.taken = t.rows; M.takenFout = t.fout;
    M.blok = new Map(b.rows.map(r => [`${r.blok}|${r.week}`, !!r.klaar])); M.blokFout = b.fout;
    M.meta = m.rows; M.metaFout = m.fout; M.besluiten = a.rows;
    M.geladen = true;
  }
  function demoData(){
    M.demo = true; const mon = huidigeWeek();
    M.posts = [
      {id:'d1', titel:'Dag bij Le Duc', kanaal:'Instagram', fase:'Ingepland', datum:plus(mon, 1)},
      {id:'d2', titel:'Wat een planner doet', kanaal:'LinkedIn', fase:'Script klaar', datum:plus(mon, 2)}];
    M.taken = [
      {id:'t1', tekst:'Hook testen voor de magazijnmedewerker', datum:plus(mon, 0), klaar:true, door:'Bryan'},
      {id:'t2', tekst:'Foto\'s Le Duc sorteren', datum:plus(mon, -3), klaar:false, door:'Bryan'}];
    M.blok = new Map([[`ma-meta|${mon}`, true]]);
    M.meta = [{datum:plus(CRM.todayISO(), -1), uitgegeven:140, leads:70}]; M.besluiten = [];
  }

  /* ─── Cijfers die op de pagina komen ──────────────────────── */
  function postsOp(datum){ return M.posts.filter(p => p.datum === datum); }
  function slotsVoor(mon){
    const uit = [];
    for(const dag of [1,2,3,4,5]){
      const datum = plus(mon, dag - 1);
      uit.push({dag, datum, kanaal:'LinkedIn', wie:LINKEDIN[dag]});
      if(INSTAGRAM.includes(dag)) uit.push({dag, datum, kanaal:'Instagram', wie:''});
    }
    return uit;
  }
  function slotStatus(s){
    const hits = postsOp(s.datum).filter(p => kanaalIs(p, s.kanaal));
    const klaar = hits.find(p => INGEPLAND.includes(p.fase));
    return klaar ? {st:'ok', post:klaar} : hits.length ? {st:'bezig', post:hits[0]} : {st:'leeg', post:null};
  }
  function weekCijfers(mon){
    const slots = slotsVoor(mon);
    const ingepland = slots.filter(s => slotStatus(s).st === 'ok').length;
    const blokken = alleBlokken(mon);
    const blokKlaar = blokken.filter(b => M.blok.get(`${b.id}|${mon}`)).length;
    const dagen = [0,1,2,3,4,5,6].map(i => plus(mon, i));
    const taken = M.taken.filter(t => dagen.includes(t.datum));
    const takenKlaar = taken.filter(t => t.klaar).length;
    const totaal = slots.length + blokken.length + taken.length;
    const klaar = ingepland + blokKlaar + takenKlaar;
    return {slots:slots.length, ingepland, blokken:blokken.length, blokKlaar, taken:taken.length, takenKlaar,
            pct: totaal ? klaar / totaal : 0};
  }
  const openTaken = () => M.taken.filter(t => !t.klaar);
  const liggen = () => openTaken().filter(t => t.datum && t.datum < CRM.todayISO());

  /* ─── Weergave ─────────────────────────────────────────── */
  function metaTegels(){
    const vandaag = CRM.todayISO(), v7 = plus(vandaag, -6);
    const rijen = M.meta.filter(r => (r.datum || '') >= v7);
    const spend = rijen.reduce((s, r) => s + N(r.uitgegeven), 0);
    const laatste = M.meta.reduce((x, r) => (r.datum || '') > x ? r.datum : x, '');
    const leads = (CRM.state?.leads || []).filter(l => l.bron === 'Meta' && l.bot_status !== 'Dubbel'
      && String(l.binnen_op || '').slice(0, 10) >= v7).length;
    const cpl = spend > 0 && leads > 0 ? spend / leads : null;
    const adv = M.besluiten.filter(b => ['advies', 'budget'].includes(b.besluit) && (b.status || 'open') === 'open'
      && !String(b.advertentie || '').startsWith('__')).length;
    const stil = !laatste || CRM.dagenGeleden(laatste) >= 2;
    const t = (l, w, s) => `<div class="mw-tegel"><span class="mw-tl">${h(l)}</span><b>${w}</b>${s ? `<span class="mw-ts">${h(s)}</span>` : ''}</div>`;
    return `<div class="mw-meta">
      ${t('Uitgegeven, 7 dagen', spend ? CRM.euro(spend) : '—', laatste ? 'tot ' + kort(laatste) : 'geen cijfers')}
      ${t('Leads in het CRM, 7 dagen', leads, 'zonder dubbelen')}
      ${t('Kosten per lead', cpl ? CRM.euro(cpl, 2) : '—', 'uitgaven gedeeld door CRM-leads')}
      <a class="mw-tegel mw-link" data-ga="marketing"><span class="mw-tl">Open adviezen</span><b>${adv}</b><span class="mw-ts">naar Marketing ›</span></a>
    </div>${stil ? `<div class="note warn" style="margin:0 0 14px">De Meta-cijfers lopen niet bij${laatste ? ` (laatste dag: ${h(kort(laatste))})` : ''}. Check de meta-sync, anders kloppen de bedragen hierboven niet.</div>` : ''}`;
  }

  function liggenBlok(){
    const l = liggen();
    if(!l.length) return '';
    return `<div class="mw-liggen"><div class="mw-lh"><b>Blijft liggen (${l.length})</b>
      <button class="btn ghost sm" data-allesvandaag>Alles naar vandaag</button></div>
      ${l.slice(0, 8).map(t => `<div class="mw-lr"><span>${h(t.tekst)}</span><span class="meta">${h(kort(t.datum))}</span>
        <button class="btn ghost sm" data-vandaag="${h(t.id)}">Naar vandaag</button></div>`).join('')}
      ${l.length > 8 ? `<div class="meta">En nog ${l.length - 8} oudere taken.</div>` : ''}</div>`;
  }

  function dagKaart(dag, mon, blokken){
    const datum = plus(mon, dag - 1), vandaag = datum === CRM.todayISO(), vrij = dag === 4;
    const feest = FEESTDAGEN[datum];
    const bl = (blokken[dag] || []).map(b => {
      const klaar = M.blok.get(`${b.id}|${mon}`);
      return `<label class="mw-rij${klaar ? ' klaar' : ''}"><input type="checkbox" data-blok="${h(b.id)}" data-week="${h(mon)}"${klaar ? ' checked' : ''}>
        <span>${h(b.t)}${b.u ? `<small>${h(b.u)}</small>` : ''}</span></label>`;
    }).join('');
    const taken = M.taken.filter(t => t.datum === datum).map(t => `
      <label class="mw-rij${t.klaar ? ' klaar' : ''}"><input type="checkbox" data-taak="${h(t.id)}"${t.klaar ? ' checked' : ''}>
        <span>${h(t.tekst)}</span><button class="mw-x" data-wis="${h(t.id)}" title="Verwijderen" type="button">×</button></label>`).join('');
    const slots = slotsVoor(mon).filter(s => s.dag === dag).map(s => {
      const r = slotStatus(s);
      const wie = s.wie ? ` · ${s.wie}` : '';
      return `<div class="mw-post ${r.st}"><span class="mw-pk">${h(s.kanaal)}${h(wie)}</span>
        ${r.post ? `<span>${h(r.post.titel || 'zonder titel')}</span><span class="chip">${h(r.post.fase)}</span>` : '<span>Nog niets ingepland</span>'}</div>`;
    }).join('');
    const extra = postsOp(datum).filter(p => !slotsVoor(mon).some(s => s.dag === dag && kanaalIs(p, s.kanaal)))
      .map(p => `<div class="mw-post ok"><span class="mw-pk">${h(p.kanaal || 'Post')}</span><span>${h(p.titel || 'zonder titel')}</span><span class="chip">${h(p.fase)}</span></div>`).join('');
    return `<div class="mw-dag${vandaag ? ' vandaag' : ''}${vrij ? ' vrij' : ''}">
      <div class="mw-dh"><b>${DAGEN[dag]}</b><span class="meta">${h(kort(datum))}</span></div>
      <div class="mw-dt">${h(THEMA[dag])}${feest ? ` · ${h(feest)}` : ''}</div>
      ${vrij ? '<div class="meta mw-vrij">Bryan is vrij. Posts staan vooraf ingepland.</div>' : ''}
      ${bl ? `<div class="mw-sec">Vaste blokken</div>${bl}` : ''}
      <div class="mw-sec">Taken</div>${taken || '<div class="meta mw-leeg">Geen taken</div>'}
      <form class="mw-nieuw" data-nieuw="${h(datum)}"><input type="text" placeholder="Taak toevoegen" maxlength="200" aria-label="Taak toevoegen"><button class="btn ghost sm" type="submit">+</button></form>
      <div class="mw-sec">Posts</div>${slots}${extra}</div>`;
  }

  function weekHtml(){
    const mon = M.week, nu = huidigeWeek(), [mnd, thema] = maandVan(mon);
    const noten = [MOMENTEN[mon], ...[0,1,2,3,4].map(i => FEESTDAGEN[plus(mon, i)] ? `${FEESTDAGEN[plus(mon, i)]} (${kort(plus(mon, i))})` : '')].filter(Boolean);
    if(mon >= TIKTOK_VAN && mon <= TIKTOK_TOT) noten.push('TikTok-pilot: dezelfde video\'s als Instagram, zonder watermerk');
    const c = weekCijfers(mon), blokken = blokkenVoor(mon);
    return `
      <div class="mw-kop">
        <button class="btn ghost sm" data-week="-1" aria-label="Vorige week">‹</button>
        <div class="mw-wk"><b>Week ${weekNr(mon)}</b><span class="meta">${h(bereik(mon))}</span></div>
        <button class="btn ghost sm" data-week="1" aria-label="Volgende week">›</button>
        ${mon !== nu ? '<button class="btn sm" data-week="0">Deze week</button>' : ''}
        <span class="mw-voortgang" title="Posts ingepland, blokken en taken samen">${Math.round(c.pct * 100)}% klaar · ${c.ingepland}/${c.slots} posts ingepland</span>
      </div>
      <div class="mw-strip">
        <span class="chip">Pijler van de week: ${h(pijlerVan(mon))}</span>
        <span class="chip">${h(mnd)}: ${h(thema)}</span>
        ${noten.map(n => `<span class="chip mw-let">${h(n)}</span>`).join('')}
      </div>
      ${mon === nu ? metaTegels() : ''}
      ${mon === nu ? liggenBlok() : ''}
      ${M.blokFout ? `<div class="note warn" style="margin-bottom:14px">Vaste blokken afvinken werkt nog niet: de tabel ontbreekt. Draai supabase/migratie-marketingweek.sql in Supabase.</div>` : ''}
      <div class="mw-dagen">${[1,2,3,4,5].map(d => dagKaart(d, mon, blokken)).join('')}</div>`;
  }

  function wekenHtml(){
    const nu = huidigeWeek();
    const rijen = [];
    for(let i = -3; i <= 8; i++){
      const mon = plus(nu, i * 7), c = weekCijfers(mon), [mnd] = maandVan(mon);
      const verleden = mon < nu, dezeWeek = mon === nu;
      let kleur = 'grijs', tekst = 'Nog niet begonnen';
      const bijgehouden = c.ingepland + c.blokKlaar + c.taken > 0;
      if(verleden && !bijgehouden){
        kleur = 'grijs'; tekst = 'Niet bijgehouden';
      } else if(verleden){
        kleur = c.pct >= 0.8 ? 'groen' : c.pct >= 0.5 ? 'amber' : 'rood';
        tekst = kleur === 'groen' ? 'Afgerond' : kleur === 'amber' ? 'Deels afgerond' : 'Bleef liggen';
      } else if(dezeWeek){
        kleur = 'amber'; tekst = 'Loopt';
      } else if(i <= 1){
        kleur = c.ingepland < c.slots ? 'amber' : 'groen';
        tekst = c.ingepland < c.slots ? 'Posts nog niet ingepland' : 'Klaar voor de week';
      }
      const m = MOMENTEN[mon];
      rijen.push(`<tr class="${dezeWeek ? 'nu' : ''}" data-open="${h(mon)}">
        <td><b>Week ${weekNr(mon)}</b><span class="meta">${h(bereik(mon))}</span></td>
        <td>${h(pijlerVan(mon).split(':')[0])}<span class="meta"> ${h(mnd)}</span></td>
        <td class="num">${c.ingepland}/${c.slots}</td>
        <td class="num">${c.blokKlaar}/${c.blokken}</td>
        <td class="num">${c.taken ? `${c.takenKlaar}/${c.taken}` : '0'}</td>
        <td><span class="mw-dot ${kleur}"></span>${h(tekst)}</td>
        <td class="meta">${h(m || '')}</td></tr>`);
    }
    return `<div class="card"><div class="tabelwrap"><table class="mw-tab">
      <thead><tr><th>Week</th><th>Pijler</th><th class="num">Posts ingepland</th><th class="num">Blokken klaar</th><th class="num">Taken klaar</th><th>Stand</th><th>Moment</th></tr></thead>
      <tbody>${rijen.join('')}</tbody></table></div></div>
      <p class="meta" style="margin-top:10px">Klik op een week om hem te openen. Posts tellen als ingepland zodra de fase Ingepland, Gepubliceerd of Learnings is.</p>`;
  }

  function jaarHtml(){
    const nu = new Date().getMonth();
    const per = MAANDEN.map((m, i) => {
      const momenten = Object.entries(MOMENTEN).filter(([k]) => dt(plus(k, 3)).getMonth() === i && k.startsWith('2027')).map(([k, v]) => `${kort(k)}: ${v}`);
      return `<tr class="${i === nu ? 'nu' : ''}"><td><b>${h(m[0])}</b></td><td>${h(m[1])}</td><td class="meta">${momenten.map(h).join('<br>') || '—'}</td></tr>`;
    }).join('');
    return `<div class="card"><div class="tabelwrap"><table class="mw-tab"><thead><tr><th>Maand</th><th>Thema</th><th>Vaste momenten (2027)</th></tr></thead><tbody>${per}</tbody></table></div></div>
      <p class="meta" style="margin-top:10px">Het seizoenspatroon is een aanname uit onze ervaring. Pas het aan waar het niet klopt.</p>`;
  }

  /* ─── Tekenen en bedienen ────────────────────────────────── */
  function teken(){
    const mount = M.mount; if(!mount) return;
    const TABS = [{k:'week', t:'Week'}, {k:'weken', t:'Komende weken'}, {k:'jaar', t:'Jaarplan'}];
    const body = M.tab === 'weken' ? wekenHtml() : M.tab === 'jaar' ? jaarHtml() : weekHtml();
    const fouten = [M.postsFout && 'posts', M.takenFout && 'taken'].filter(Boolean);
    mount.innerHTML = `
      ${M.demo ? '<div class="note info" style="margin-bottom:16px">Demo-data: wat je hier ziet is verzonnen.</div>' : ''}
      ${fouten.length ? `<div class="note err" style="margin-bottom:16px">De ${fouten.join(' en ')} konden niet geladen worden. Herlaad de pagina.</div>` : ''}
      <div class="tabs">${TABS.map(t => `<button class="tab ${M.tab === t.k ? 'on' : ''}" data-tab="${t.k}">${h(t.t)}</button>`).join('')}</div>
      <div class="mw">${body}</div>`;
    if(M.actiesEl) M.actiesEl.innerHTML = `<a class="btn ghost" href="${BORD}" target="_blank" rel="noopener">Nieuwe content maken ↗</a>`;
    bind(mount);
  }

  async function schrijf(q, melding){
    if(M.demo) return true;
    const {error} = await q;
    if(error){ console.warn(melding, error); CRM.toast(melding + ': ' + (error.message || 'mislukt'), 'err'); return false; }
    return true;
  }

  function bind(mount){
    CRM.$$('[data-tab]', mount).forEach(b => b.onclick = () => { M.tab = b.dataset.tab; teken(); });
    CRM.$$('[data-week]:not(input)', mount).forEach(b => b.onclick = () => {
      const n = +b.dataset.week; M.week = n === 0 ? huidigeWeek() : plus(M.week, n * 7); teken();
    });
    CRM.$$('[data-open]', mount).forEach(r => r.onclick = () => { M.week = r.dataset.open; M.tab = 'week'; teken(); });
    CRM.$$('[data-ga]', mount).forEach(a => a.onclick = () => CRM.ga(a.dataset.ga));

    CRM.$$('input[data-blok]', mount).forEach(i => i.onchange = async () => {
      const sleutel = `${i.dataset.blok}|${i.dataset.week}`, klaar = i.checked;
      const oud = M.blok.get(sleutel); M.blok.set(sleutel, klaar);
      const ok = await schrijf(CRM.sb.from('mkt_blok_klaar').upsert({blok:i.dataset.blok, week:i.dataset.week, klaar, door:CRM.me(), updated_at:new Date().toISOString()}, {onConflict:'blok,week'}), 'Opslaan lukt niet');
      if(!ok){ M.blok.set(sleutel, !!oud); M.blokFout = M.blokFout || {message:'opslaan mislukt'}; }
      teken();
    });
    CRM.$$('input[data-taak]', mount).forEach(i => i.onchange = async () => {
      const t = M.taken.find(x => String(x.id) === i.dataset.taak); if(!t) return;
      const oud = t.klaar; t.klaar = i.checked;
      const ok = await schrijf(CRM.sb.from('mkt_taken').update({klaar:t.klaar}).eq('id', t.id), 'Opslaan lukt niet');
      if(!ok) t.klaar = oud;
      teken();
    });
    CRM.$$('[data-wis]', mount).forEach(b => b.onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      const t = M.taken.find(x => String(x.id) === b.dataset.wis); if(!t) return;
      if(!await schrijf(CRM.sb.from('mkt_taken').delete().eq('id', t.id), 'Verwijderen lukt niet')) return;
      M.taken = M.taken.filter(x => x !== t); teken();
    });
    CRM.$$('form[data-nieuw]', mount).forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const veld = f.querySelector('input'), tekst = veld.value.trim(); if(!tekst) return;
      const rij = {tekst, datum:f.dataset.nieuw, klaar:false, door:CRM.me()};
      if(M.demo){ M.taken.push({...rij, id:'x' + Date.now()}); teken(); return; }
      const {data, error} = await CRM.sb.from('mkt_taken').insert(rij).select().single();
      if(error){ CRM.toast('Taak toevoegen lukt niet: ' + error.message, 'err'); return; }
      M.taken.push(data); teken();
    });
    const verplaats = async (ids) => {
      const vandaag = CRM.todayISO();
      for(const t of M.taken.filter(x => ids.includes(String(x.id)))){
        if(await schrijf(CRM.sb.from('mkt_taken').update({datum:vandaag}).eq('id', t.id), 'Verplaatsen lukt niet')) t.datum = vandaag;
      }
      teken();
    };
    CRM.$$('[data-vandaag]', mount).forEach(b => b.onclick = () => verplaats([b.dataset.vandaag]));
    const alles = mount.querySelector('[data-allesvandaag]');
    if(alles) alles.onclick = () => verplaats(liggen().map(t => String(t.id)));
  }

  function render(mount, actiesEl){
    M.mount = mount; M.actiesEl = actiesEl;
    if(!M.week) M.week = huidigeWeek();
    mount.innerHTML = CRM.ui.laden('Week laden…');
    laad().then(teken).catch(e => { console.error('marketingweek', e); mount.innerHTML = `<div class="note err">De week kon niet geladen worden. Herlaad de pagina.</div>`; });
  }

  /* Open taken die achterstallig zijn tellen mee in de teller van de zijbalk. */
  CRM.registerModule('marketingweek', {
    title:'Marketingweek', icon:'▦',
    navTitle(){ return CRM.isMarketeer() ? 'Mijn week' : 'Marketingweek'; },
    /* Alleen voor de marketeer en de eigenaar (Tjeerd, 9 okt 2026: niet voor iedereen). */
    zichtbaar(){ return CRM.isMarketeer() || CRM.canSeeMoney(); },
    onderschrift:'De week van de marketeer: blokken, taken, posts en Meta-cijfers',
    badge(){ try{ return M.geladen ? liggen().length : 0; }catch(e){ return 0; } },
    render
  });
})();
