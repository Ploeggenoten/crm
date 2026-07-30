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
const MS_SCOPES = ['User.Read','Calendars.ReadWrite','Tasks.ReadWrite'];
const MSAL_CDN = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.4/lib/msal-browser.min.js';

let _msal = null, _account = null, _laadBelofte = null;

/* ─── Hulpjes ─────────────────────────────────────────────────── */
const isoLokaal = d => {                       // "2026-07-30T14:00:00" zonder UTC-verschuiving
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
};
const combineer = (datum, tijd) => new Date(`${datum}T${(tijd||'09:00')}:00`);

/* ─── Laag 1: deeplink (werkt altijd, geen registratie nodig) ──── */
function composeUrl({titel, start, eind, body, locatie}){
  const q = new URLSearchParams({
    subject: titel || '',
    startdt: start ? isoLokaal(start) : '',
    enddt:   eind  ? isoLokaal(eind)  : '',
    body:    body || '', location: locatie || '', path: '/calendar/action/compose'
  });
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
    const r = await _msal.loginPopup({scopes: MS_SCOPES});
    _account = r.account;
  }
  try{
    const r = await _msal.acquireTokenSilent({scopes: MS_SCOPES, account: _account});
    return r.accessToken;
  }catch(e){
    if(!interactiefOk) return null;
    const r = await _msal.acquireTokenPopup({scopes: MS_SCOPES, account: _account});
    return r.accessToken;
  }
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
      const d = await graph(`/me/calendarView?startDateTime=${nu.toISOString()}&endDateTime=${tot.toISOString()}&$orderby=start/dateTime&$top=25&$select=subject,start,end,location,onlineMeeting,webLink`,
        { headers:{ Prefer:'outlook.timezone="W. Europe Standard Time"' } }, false);
      return (d?.value||[]).map(e => ({
        titel: e.subject, start: e.start?.dateTime, eind: e.end?.dateTime,
        locatie: e.location?.displayName || '', link: e.webLink,
        online: e.onlineMeeting?.joinUrl || ''
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
    window.open(composeUrl({titel:opts.titel, start, eind, body:opts.body, locatie:opts.locatie}), '_blank', 'noopener');
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

  /* Kant-en-klare deeplink (voor gewone <a href>-knoppen). */
  composeLink(opts){
    const start = combineer(opts.datum, opts.tijd);
    const eind  = new Date(start.getTime() + (opts.duurMin || 45)*60000);
    return composeUrl({titel:opts.titel, start, eind, body:opts.body, locatie:opts.locatie});
  }
};
})();
