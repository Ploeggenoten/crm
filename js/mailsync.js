/* ═══ TEAMMAIL — elkaars mail met relaties zien ══════════════════════
   Tjeerd, 3 nov 2026: "dat ik ook Daans mailtjes kan bekijken die hij
   heeft gestuurd naar relaties, contactpersonen en klanten" — en "we mogen
   elkaars relaties zien". Het CRM kan via Outlook alleen in je EIGEN
   mailbox kijken. Daarom zet ieders CRM zijn mail met relaties in een
   gedeelde tabel (crm_mails, supabase/teammail.sql):

   - alleen mail waarin een adres staat van een contactpersoon of relatie
     uit het CRM; al het andere (privé, kandidaten, nieuwsbrieven) niet;
   - alleen koppen: onderwerp, van/aan, tijdstip en het korte fragment dat
     Outlook zelf ook toont. Nooit de hele mail of bijlagen;
   - Inbox + Verzonden, eerste keer 60 dagen terug, daarna elk kwartier
     wat er sinds de vorige keer bij kwam.

   Lezen: CRM.mailUI (js/klanten.js) haalt per adres de teamregels op en
   zet ze tussen je eigen live mail. */
(function(){
  const KWARTIER = 15 * 60 * 1000;
  const EERSTE_KEER_DAGEN = 60;
  let bezig = false, laatsteRun = 0;

  const eigenDomein = a => /@ploeggenoten\.nl$/i.test(a);
  const sleutel = () => 'pg_mailsync_' + String(CRM.outlook?.accountNaam?.() || '').toLowerCase();

  /* Adres → {klant} voor iedereen in het CRM met een mailadres. */
  function crmAdressen(){
    const m = new Map();
    const zet = (a, klant) => { a = String(a||'').trim().toLowerCase(); if(a.includes('@') && !eigenDomein(a) && !m.has(a)) m.set(a, klant || ''); };
    (CRM.state.contacten||[]).forEach(c => zet(c.email, c.klant));
    (CRM.state.clients||[]).forEach(k => zet(k.email, k.naam));
    return m;
  }

  async function sync(){
    if(bezig || CRM.demo || !CRM.outlook?.verbonden?.() || !CRM.outlook.mailSinds) return;
    if(!(CRM.state.contacten||[]).length) return;           // data nog niet geladen
    bezig = true; laatsteRun = Date.now();
    try{
      const eigenaar = String(CRM.outlook.accountNaam() || CRM.user?.email || '').toLowerCase();
      let sinds = null;
      try{ sinds = localStorage.getItem(sleutel()); }catch(e){}
      if(!sinds) sinds = new Date(Date.now() - EERSTE_KEER_DAGEN * 86400000).toISOString();
      const start = new Date().toISOString();
      const [uit, binnen] = await Promise.all([
        CRM.outlook.mailSinds('sentitems', sinds), CRM.outlook.mailSinds('inbox', sinds)]);
      if(!uit || !binnen) return;
      const crm = crmAdressen();
      const rijen = [];
      for(const [m, richting] of uit.map(x => [x, 'uit']).concat(binnen.map(x => [x, 'in']))){
        const betrokken = [m.van].concat(m.aan).filter(a => crm.has(a));
        if(!betrokken.length) continue;
        rijen.push({
          id: (eigenaar + '|' + m.mid).slice(0, 500), mid: String(m.mid).slice(0, 400), eigenaar,
          door: CRM.me() || eigenaar, richting,
          van: m.van, van_naam: String(m.vanNaam||'').slice(0, 120), aan: m.aan.slice(0, 20),
          adressen: [...new Set(betrokken)], klanten: [...new Set(betrokken.map(a => crm.get(a)).filter(Boolean))],
          onderwerp: String(m.onderwerp||'').slice(0, 300), fragment: m.fragment, op: m.op
        });
      }
      for(let i = 0; i < rijen.length; i += 200){
        const {error} = await CRM.sb.from('crm_mails').upsert(rijen.slice(i, i + 200), {onConflict:'id'});
        if(error){ console.warn('teammail', error.message); return; }   // tabel ontbreekt nog: volgende keer opnieuw
      }
      /* Een uur overlap: mail die tijdens het ophalen binnenkwam, valt anders tussen wal en schip. */
      try{ localStorage.setItem(sleutel(), new Date(new Date(start).getTime() - 3600000).toISOString()); }catch(e){}
    }catch(e){ console.warn('teammail', e); }
    finally{ bezig = false; }
  }

  /* Elke minuut kijken of het tijd is; zo start hij vanzelf zodra Outlook
     en de CRM-data er zijn, zonder aan het laden van de app te hangen. */
  setInterval(() => { if(document.visibilityState === 'visible' && Date.now() - laatsteRun > KWARTIER) sync(); }, 60 * 1000);
  setTimeout(sync, 20 * 1000);

  /* Teamregels voor een of meer adressen, zonder die van jezelf (die komen
     live uit je eigen Outlook). Lege lijst als de tabel er (nog) niet is. */
  async function teamMail(adressen, aantal = 10){
    if(CRM.demo || !adressen.length) return [];
    const ik = String(CRM.outlook?.accountNaam?.() || CRM.user?.email || '').toLowerCase();
    const {data, error} = await CRM.sb.from('crm_mails')
      .select('mid,eigenaar,door,richting,van,van_naam,aan,adressen,onderwerp,fragment,op')
      .overlaps('adressen', adressen.map(a => String(a).toLowerCase()))
      .neq('eigenaar', ik).order('op', {ascending:false}).limit(aantal);
    if(error){ console.warn('teammail lezen', error.message); return []; }
    return data || [];
  }

  CRM.teamMail = {sync, lees: teamMail};
})();
