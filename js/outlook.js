/* ═══════════════════════════════════════════════════════════════
   OUTLOOK-KOPPELING (Microsoft Graph) — per gebruiker.
   Elke AM verbindt zijn eigen Microsoft-account; het CRM kan dan
   zijn agenda tonen, afspraken inplannen en taken in To Do zetten.

   Twee lagen:
   1. ZONDER app-registratie (nu al): "Inplannen in Outlook" opent
      Outlook met een volledig vooringevulde afspraak (deeplink).
   2. MET app-registratie (MS_CLIENT_ID hieronder ingevuld, zie
      SETUP-OUTLOOK.md): volledige koppeling — agenda van vandaag op
      het dashboard, afspraken en taken direct aangemaakt vanuit het
      CRM, zonder Outlook te openen.

   Privacy: de koppeling is per persoon (OAuth met eigen login);
   tokens staan alleen in de browser van die gebruiker. Niemand kan
   in andermans agenda kijken via het CRM.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* App-registratie "Ploeggenoten CRM" in Entra (30 jul 2026, single tenant). */
const MS_CLIENT_ID = 'd07d8bf0-82b1-426e-89c6-3ae11393b982';
const MS_TENANT_ID = 'c0436a3b-5aa8-4ada-bd4d-a3138ec11fa6';
/* Kern: alleen wat zeker is toegekend. Staat hier iets in wat de tenant
   niet heeft, dan mislukt élke tokenaanvraag — dus bewust minimaal. */
const MS_KERN = ['User.Read','Calendars.ReadWrite'];
/* Extra's: toegevoegd in Entra op 30 jul 2026. Wordt er één geweigerd,
   dan valt token() terug op de kern in plaats van de koppeling te breken. */
const MS_EXTRA = ['Tasks.ReadWrite','Mail.Read','Mail.Send','Contacts.ReadWrite',
  'Files.Read.All','Sites.Read.All','ChatMessage.Send','OnlineMeetings.Read',
  'MailboxSettings.Read','User.ReadBasic.All'];
const MS_SCOPES = MS_KERN.concat(MS_EXTRA);
const MSAL_CDN = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.4/lib/msal-browser.min.js';

let _msal = null, _account = null, _laadBelofte = null;

/* ─── Hulpjes ─────────────────────────────────────────────────── */
const isoLokaal = d => {                       // "2026-07-30T14:00:00" zonder UTC-verschuiving
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
};
const combineer = (datum, tijd) => new Date(`${datum}T${(tijd||'09:00')}:00`);

/* ─── Laag 1: deeplink (werkt altijd, geen registratie nodig) ──── */
function composeUrl({titel, start, eind, body, locatie, deelnemers}){
  const q = new URLSearchParams({
    subject: titel || '',
    startdt: start ? isoLokaal(start) : '',
    enddt:   eind  ? isoLokaal(eind)  : '',
    body:    body || '', location: locatie || '', path: '/calendar/action/compose'
  });
  /* Genodigden gaan ook op de deeplink-route mee (to=, komma-gescheiden),
     anders vallen aangevinkte contactpersonen zonder koppeling stil weg. */
  const to = (deelnemers||[]).filter(Boolean).join(',');
  if(to) q.set('to', to);
  return 'https://outlook.office.com/calendar/0/deeplink/compose?' + q.toString();
}

/* ─── Laag 2: Microsoft Graph via MSAL ────────────────────────── */
function msalLaden(){
  if(_laadBelofte) return _laadBelofte;
  _laadBelofte = new Promise((ok, nee) => {
    if(window.msal) return ok();
    const s = document.createElement('script');
    s.src = MSAL_CDN; s.onload = () => ok(); s.onerror = () => nee(new Error('MSAL laden mislukt'));
    document.head.appendChild(s);
  }).then(() => {
    _msal = new msal.PublicClientApplication({
      /* Single-tenant app: authority moet de eigen tenant zijn, niet /organizations. */
      auth:{ clientId: MS_CLIENT_ID, authority:'https://login.microsoftonline.com/' + MS_TENANT_ID,
             redirectUri: location.origin + location.pathname },
      cache:{ cacheLocation:'localStorage' }
    });
    const acc = _msal.getAllAccounts();
    if(acc.length) _account = acc[0];
  });
  return _laadBelofte;
}

async function token(interactiefOk = true){
  await msalLaden();
  if(!_account){
    if(!interactiefOk) return null;
    /* Volledige set proberen; ontbreekt er één machtiging in de tenant,
       dan alsnog inloggen met de kern zodat agenda blijft werken. */
    let r;
    try{ r = await _msal.loginPopup({scopes: MS_SCOPES}); }
    catch(e){ console.warn('login met alle scopes mislukt, terugval op kern', e);
              r = await _msal.loginPopup({scopes: MS_KERN}); }
    _account = r.account;
  }
  for(const set of [MS_SCOPES, MS_KERN]){
    try{ return (await _msal.acquireTokenSilent({scopes:set, account:_account})).accessToken; }
    catch(e){
      if(!interactiefOk) continue;
      try{ return (await _msal.acquireTokenPopup({scopes:set, account:_account})).accessToken; }
      catch(e2){ /* volgende set proberen */ }
    }
  }
  return null;
}

async function graph(pad, opties = {}, interactiefOk = true){
  const t = await token(interactiefOk);
  if(!t) return null;
  const r = await fetch('https://graph.microsoft.com/v1.0' + pad, {
    ...opties,
    headers:{ 'Authorization':'Bearer '+t, 'Content-Type':'application/json',
              ...(opties.headers||{}) },
    body: opties.body ? JSON.stringify(opties.body) : undefined
  });
  if(r.status === 204) return {};
  const data = await r.json().catch(()=>null);
  if(!r.ok) throw new Error(data?.error?.message || ('Graph-fout ' + r.status));
  return data;
}

let _takenLijstId = null;
async function takenLijst(){
  if(_takenLijstId) return _takenLijstId;
  const d = await graph('/me/todo/lists');
  const lijst = (d?.value||[]).find(l => l.wellknownListName === 'defaultList') || (d?.value||[])[0];
  _takenLijstId = lijst?.id || null;
  return _takenLijstId;
}

/* ─── Publieke API voor modules ───────────────────────────────── */
CRM.outlook = {
  /* Is de volledige koppeling beschikbaar (registratie gedaan)? */
  beschikbaar: () => !!MS_CLIENT_ID && !CRM.demo,
  /* Is déze gebruiker verbonden? */
  verbonden: () => !!_account,
  accountNaam: () => _account?.username || '',

  async verbind(){
    if(!CRM.outlook.beschikbaar()){
      CRM.toast('Outlook-koppeling nog niet geactiveerd — zie SETUP-OUTLOOK.md','err'); return false;
    }
    try{ await token(true); CRM.toast('Outlook verbonden als ' + CRM.outlook.accountNaam(),'ok'); return true; }
    catch(e){ CRM.fout('Verbinden mislukt', e); return false; }
  },
  async verbreek(){
    await msalLaden();
    if(_account) await _msal.logoutPopup({account:_account}).catch(()=>{});
    _account = null; CRM.toast('Outlook-koppeling verbroken');
  },

  /* Agenda van de komende N dagen (voor het dashboard). Stil: vraagt
     nooit om login — geeft null als niet verbonden. */
  async agenda(dagen = 1){
    if(!CRM.outlook.beschikbaar() || !_account) return null;
    const nu = new Date(); const tot = new Date(nu.getTime() + dagen*86400000);
    try{
      const d = await graph(`/me/calendarView?startDateTime=${nu.toISOString()}&endDateTime=${tot.toISOString()}&$orderby=start/dateTime&$top=25&$select=subject,start,end,location,onlineMeeting,webLink,attendees`,
        { headers:{ Prefer:'outlook.timezone="W. Europe Standard Time"' } }, false);
      return (d?.value||[]).map(e => ({
        titel: e.subject, start: e.start?.dateTime, eind: e.end?.dateTime,
        locatie: e.location?.displayName || '', link: e.webLink,
        online: e.onlineMeeting?.joinUrl || '',
        /* Deelnemers meegeven zodat modules een afspraak aan een
           contactpersoon kunnen koppelen op e-mailadres. */
        deelnemers: (e.attendees||[]).map(a => a.emailAddress?.address).filter(Boolean)
      }));
    }catch(e){ console.warn('agenda', e); return null; }
  },

  /* Afspraak maken. opts: {titel, datum:'2026-08-01', tijd:'10:00', duurMin,
     locatie, body, deelnemers:[email], teams:true}. Met koppeling → direct in
     de agenda; zonder → Outlook-compose met alles vooringevuld. */
  async maakAfspraak(opts){
    const start = combineer(opts.datum, opts.tijd);
    const eind  = new Date(start.getTime() + (opts.duurMin || 45)*60000);
    if(CRM.outlook.beschikbaar() && _account){
      const ev = await graph('/me/events', {method:'POST', body:{
        subject: opts.titel,
        start:{ dateTime: isoLokaal(start), timeZone:'W. Europe Standard Time' },
        end:  { dateTime: isoLokaal(eind),  timeZone:'W. Europe Standard Time' },
        location: opts.locatie ? {displayName: opts.locatie} : undefined,
        body: { contentType:'text', content: opts.body || '' },
        attendees: (opts.deelnemers||[]).filter(Boolean).map(a => ({emailAddress:{address:a}, type:'required'})),
        isOnlineMeeting: !!opts.teams, onlineMeetingProvider: opts.teams ? 'teamsForBusiness' : undefined
      }});
      return {via:'graph', link: ev?.webLink || '', online: ev?.onlineMeeting?.joinUrl || ''};
    }
    window.open(composeUrl({titel:opts.titel, start, eind, body:opts.body, locatie:opts.locatie, deelnemers:opts.deelnemers}), '_blank', 'noopener');
    return {via:'deeplink'};
  },

  /* Taak in Microsoft To Do. opts: {titel, datum, notities}. Zonder koppeling:
     geen deeplink mogelijk — dan alleen de CRM-taak (de aanroeper regelt dat). */
  async maakTaak(opts){
    if(!(CRM.outlook.beschikbaar() && _account)) return null;
    const lijst = await takenLijst();
    if(!lijst) return null;
    return graph(`/me/todo/lists/${lijst}/tasks`, {method:'POST', body:{
      title: opts.titel,
      dueDateTime: opts.datum ? { dateTime: opts.datum + 'T09:00:00', timeZone:'W. Europe Standard Time' } : undefined,
      body: opts.notities ? { content: opts.notities, contentType:'text' } : undefined
    }});
  },

  /* ─── Mail ──────────────────────────────────────────────────
     Meelezen per e-mailadres: toont alléén correspondentie met díe
     persoon, nooit het hele postvak. Stil: vraagt niet om login. */
  async mailMet(adres, aantal = 10){
    if(!CRM.outlook.beschikbaar() || !_account || !adres) return null;
    const veilig = String(adres).replace(/'/g, "''");
    try{
      const d = await graph(`/me/messages?$search="participants:${encodeURIComponent(veilig)}"` +
        `&$top=${aantal}&$select=subject,from,toRecipients,receivedDateTime,bodyPreview,webLink,isRead`,
        { headers:{ ConsistencyLevel:'eventual' } }, false);
      return (d?.value||[]).map(m => ({
        onderwerp: m.subject || '(geen onderwerp)',
        van: m.from?.emailAddress?.address || '',
        vanNaam: m.from?.emailAddress?.name || '',
        aan: (m.toRecipients||[]).map(r => r.emailAddress?.address).filter(Boolean),
        op: m.receivedDateTime,
        fragment: (m.bodyPreview||'').slice(0, 220),
        link: m.webLink,
        uitgaand: (m.from?.emailAddress?.address||'').toLowerCase() === (_account.username||'').toLowerCase()
      }));
    }catch(e){ console.warn('mailMet', e); return null; }
  },

  /* Mail versturen. WORDT NOOIT AUTOMATISCH AANGEROEPEN: alleen vanuit
     een scherm waarin de gebruiker de tekst ziet en zelf op Versturen
     klikt. Geen bulk, geen achtergrondverzending. */
  async stuurMail({aan, cc, onderwerp, tekst}){
    if(!CRM.outlook.beschikbaar() || !_account) throw new Error('Outlook niet verbonden');
    const lijst = a => (Array.isArray(a)?a:[a]).filter(Boolean)
      .map(x => ({emailAddress:{address:String(x).trim()}}));
    if(!lijst(aan).length) throw new Error('Geen ontvanger');
    await graph('/me/sendMail', {method:'POST', body:{
      message: {
        subject: onderwerp || '',
        body: { contentType:'text', content: tekst || '' },
        toRecipients: lijst(aan),
        ccRecipients: lijst(cc)
      },
      saveToSentItems: true
    }});
    return {ok:true};
  },

  /* ─── Teams ─────────────────────────────────────────────────
     Meldingen landen waar het team de hele dag kijkt. Berichten gaan
     namens de ingelogde gebruiker (jij wees de taak toe), niet namens
     een bot. Werkt pas als ChatMessage.Send is toegekend; anders stil. */
  async teamsBericht(email, tekst){
    if(!CRM.outlook.beschikbaar() || !_account || !email || !tekst) return null;
    try{
      /* Bestaande 1-op-1 chat zoeken, anders aanmaken. */
      const chats = await graph(`/me/chats?$filter=chatType eq 'oneOnOne'&$expand=members&$top=50`, {}, false);
      const mijn = (_account.username||'').toLowerCase(), zoek = String(email).toLowerCase();
      let id = (chats?.value||[]).find(c =>
        (c.members||[]).some(m => (m.email||'').toLowerCase() === zoek))?.id;
      if(!id){
        const nieuw = await graph('/chats', {method:'POST', body:{
          chatType:'oneOnOne',
          members:[mijn, zoek].map(e => ({
            '@odata.type':'#microsoft.graph.aadUserConversationMember',
            roles:['owner'],
            'user@odata.bind':`https://graph.microsoft.com/v1.0/users('${e}')`
          }))
        }}, false);
        id = nieuw?.id;
      }
      if(!id) return null;
      await graph(`/chats/${id}/messages`, {method:'POST',
        body:{ body:{ contentType:'html', content: tekst } }}, false);
      return {ok:true};
    }catch(e){ console.warn('teamsBericht', e); return null; }
  },

  /* Bericht in een teamkanaal (bv. "getekend bij X"). Kanaal wordt één
     keer gekozen en onthouden in localStorage crm_teams_kanaal. */
  async kanaalBericht(tekst){
    if(!CRM.outlook.beschikbaar() || !_account || !tekst) return null;
    let doel = null;
    try{ doel = JSON.parse(localStorage.getItem('crm_teams_kanaal')||'null'); }catch(e){}
    if(!doel?.team || !doel?.kanaal) return null;
    try{
      await graph(`/teams/${doel.team}/channels/${doel.kanaal}/messages`, {method:'POST',
        body:{ body:{ contentType:'html', content: tekst } }}, false);
      return {ok:true};
    }catch(e){ console.warn('kanaalBericht', e); return null; }
  },

  /* Teams en kanalen ophalen zodat de gebruiker er één kan kiezen. */
  async teamsKanalen(){
    if(!CRM.outlook.beschikbaar() || !_account) return null;
    try{
      const teams = await graph('/me/joinedTeams?$select=id,displayName', {}, false);
      const uit = [];
      for(const t of (teams?.value||[]).slice(0,10)){
        const ch = await graph(`/teams/${t.id}/channels?$select=id,displayName`, {}, false);
        (ch?.value||[]).forEach(c => uit.push({team:t.id, teamNaam:t.displayName, kanaal:c.id, kanaalNaam:c.displayName}));
      }
      return uit;
    }catch(e){ console.warn('teamsKanalen', e); return null; }
  },

  /* Kant-en-klare deeplink (voor gewone <a href>-knoppen). */
  composeLink(opts){
    const start = combineer(opts.datum, opts.tijd);
    const eind  = new Date(start.getTime() + (opts.duurMin || 45)*60000);
    return composeUrl({titel:opts.titel, start, eind, body:opts.body, locatie:opts.locatie, deelnemers:opts.deelnemers});
  }
};
})();
