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
  'Files.Read.All','Sites.Read.All','ChatMessage.Send','Chat.Read','ChatMessage.Read',
  'OnlineMeetings.Read','MailboxSettings.Read','User.ReadBasic.All','offline_access'];
const MS_SCOPES = MS_KERN.concat(MS_EXTRA);
const MSAL_CDN = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.4/lib/msal-browser.min.js';

let _msal = null, _account = null, _laadBelofte = null;
let _herstelBelofte = null;   /* zie CRM.outlook.herstel() onderaan dit bestand */

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
    /* Eerst de eigen kopie, dan pas de CDN. Diezelfde CDN gaf eerder in dit
       project wisselende 404's op de Supabase-bibliotheek, en toen lag de hele
       app plat. Mislukt de koppeling met Microsoft, dan lijkt dat op "even
       opnieuw verbinden" terwijl er in werkelijkheid een bestand niet geladen
       is — precies het soort fout dat je nooit vindt. */
    const bronnen = ['assets/msal-browser.min.js', MSAL_CDN];
    (function probeer(i){
      if(i >= bronnen.length) return nee(new Error('MSAL laden mislukt'));
      const s = document.createElement('script');
      s.src = bronnen[i];
      s.onload  = () => window.msal ? ok() : probeer(i + 1);
      s.onerror = () => probeer(i + 1);
      document.head.appendChild(s);
    })(0);
  }).then(() => {
    _msal = new msal.PublicClientApplication({
      /* Single-tenant app: authority moet de eigen tenant zijn, niet /organizations. */
      auth:{ clientId: MS_CLIENT_ID, authority:'https://login.microsoftonline.com/' + MS_TENANT_ID,
             redirectUri: location.origin + location.pathname },
      cache:{ cacheLocation:'localStorage' }
    });
    _account = kiesAccount(_msal.getAllAccounts());
  });
  return _laadBelofte;
}

/* Welk Microsoft-account hoort bij deze gebruiker?

   Hier stond `acc[0]` — het eerste account dat de browser toevallig kende.
   Wie naast zijn eigen postbus ook een gedeelde postbus gebruikt
   (recruitment@, info@) heeft er twee, en dan las het dashboard de agenda en
   de mail van de verkeerde. Erger nog: het wisselde, want die volgorde ligt
   niet vast. Een mailvenster dat de ene dag jouw inbox toont en de andere dag
   die van de afdeling is niet "een beetje verkeerd" — dan klopt alles wat
   erop staat niet meer.

   We koppelen daarom op het adres waarmee je in het CRM zit. Is dat er niet
   bij, dan kiezen we niets: liever de knop "Verbinden" dan stilletjes de
   verkeerde postbus. */
function bijMij(acc){
  const mijn = String(CRM.user?.email || '').trim().toLowerCase();
  if(!mijn) return null;
  return acc.find(a => String(a.username||'').toLowerCase() === mijn) || null;
}
function kiesAccount(acc){
  if(!acc || !acc.length) return null;
  const eigen = bijMij(acc);
  if(eigen) return eigen;
  /* Eén account en geen CRM-gebruiker: alleen in demo. Hier stond eerder
     `acc.length === 1 && !CRM.user?.email`, en dat was het lek.

     Dit bestand draait `herstel()` meteen bij het laden van de pagina, dus
     vóórdat Supabase klaar is met inloggen. Op dat moment is CRM.user nog
     null, en dan koos deze regel het enige account dat de browser kende —
     bij Tjeerd was dat recruitment@, de postbus van Rajesh. Daarna werd het
     nooit meer herzien, want zowel _laadBelofte als _herstelBelofte worden
     onthouden. Gevolg: het dashboard las maandenlang de inbox van een
     collega, en dat was niet te zien.

     De regel is nu: weten we niet wie er is ingelogd, dan koppelen we
     niets. Zodra dat wél bekend is, roept core.js herkoppel() aan. */
  if(acc.length === 1 && CRM.demo) return acc[0];
  return null;
}

async function token(interactiefOk = true){
  await msalLaden();
  if(!_account){
    if(!interactiefOk) return null;
    /* Volledige set proberen; ontbreekt er één machtiging in de tenant,
       dan alsnog inloggen met de kern zodat agenda blijft werken. */
    /* loginHint zet het juiste adres alvast klaar, en prompt:'select_account'
       laat Microsoft de keuze tonen in plaats van door te schieten naar het
       account dat daar toevallig al ingelogd is. Wie een gedeelde postbus
       gebruikt kwam anders zonder één klik in de verkeerde inbox terecht. */
    const hint = String(CRM.user?.email || '').trim();
    const opzet = scopes => hint ? {scopes, loginHint:hint, prompt:'select_account'} : {scopes};
    let r;
    try{ r = await _msal.loginPopup(opzet(MS_SCOPES)); }
    catch(e){ console.warn('login met alle scopes mislukt, terugval op kern', e);
              r = await _msal.loginPopup(opzet(MS_KERN)); }
    /* Ook na een handmatige keuze controleren: in het keuzevenster van
       Microsoft is de gedeelde postbus één regel van de eigen verwijderd. */
    if(hint && String(r.account?.username||'').toLowerCase() !== hint.toLowerCase()){
      CRM.toast(`Je koos ${r.account?.username || 'een ander account'}, maar in het CRM zit je als ${hint}. `
                + 'Verbind met dat adres, anders zie je de agenda en mail van een andere postbus.', 'err');
      return null;
    }
    _account = r.account;
  }
  for(const set of [MS_SCOPES, MS_KERN]){
    try{ return (await _msal.acquireTokenSilent({scopes:set, account:_account})).accessToken; }
    catch(e){
      /* Microsoft houdt de vernieuwing van een browser-app kort (ongeveer een
         dag). Loopt die af, dan lukt stil vernieuwen niet meer. Vóór we een
         venster openen proberen we eerst ssoSilent: dat gebruikt de Microsoft-
         sessie die in dezelfde browser al openstaat en heeft geen venster
         nodig. Scheelt in de praktijk vrijwel alle popups — en die werden ook
         nog eens geblokkeerd als ze niet uit een klik kwamen, waardoor de
         agenda gewoon verdween zonder uitleg. */
      try{
        const r = await _msal.ssoSilent({scopes:set, account:_account,
                                         loginHint:_account?.username});
        if(r?.accessToken) return r.accessToken;
      }catch(e2){ /* geen Microsoft-sessie meer; hieronder het venster */ }
      if(!interactiefOk) continue;
      try{ return (await _msal.acquireTokenPopup({scopes:set, account:_account})).accessToken; }
      catch(e3){ /* volgende set proberen */ }
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
  if(!r.ok){
    const fout = new Error(data?.error?.message || ('Graph-fout ' + r.status));
    /* Status en Retry-After meegeven zodat aanroepers throttling (429)
       kunnen herkennen. Bestaande code leest alleen .message — die blijft
       dus precies werken zoals hij deed. */
    fout.status = r.status;
    fout.retryAfter = Number(r.headers.get('Retry-After')) || 0;
    throw fout;
  }
  return data;
}

const pauze = ms => new Promise(r => setTimeout(r, ms));

/* Graph-aanroep die tegen een dichtgeknepen kraan kan. Bij bulkwerk
   (contacten synchroniseren) geeft Microsoft na een tijdje 429 terug;
   dan even wachten en opnieuw, in plaats van de hele run laten klappen. */
async function graphRustig(pad, opties = {}, pogingen = 3){
  for(let i = 0; i < pogingen; i++){
    try{ return await graph(pad, opties, false); }
    catch(e){
      if(e && e.status === 429 && i < pogingen - 1){
        await pauze(Math.min(30, e.retryAfter || 2 * (i + 1)) * 1000);
        continue;
      }
      throw e;
    }
  }
  return null;
}

let _takenLijstId = null;
async function takenLijst(){
  if(_takenLijstId) return _takenLijstId;
  const d = await graph('/me/todo/lists');
  const lijst = (d?.value||[]).find(l => l.wellknownListName === 'defaultList') || (d?.value||[])[0];
  _takenLijstId = lijst?.id || null;
  return _takenLijstId;
}

/* ─── Contacten: opzoeken en opslaan ──────────────────────────── */
/* OData-string veilig maken: een enkele quote verdubbelen. */
const odataTekst = s => String(s).replace(/'/g, "''");

/* Bestaand contact vinden: eerst op e-mailadres (uniek genoeg), anders
   op de volledige naam. Geeft het id terug of null. */
async function zoekContactId(naam, email){
  const zoek = async filter => {
    try{
      const d = await graphRustig('/me/contacts?$top=1&$select=id&$filter=' + encodeURIComponent(filter));
      return d?.value?.[0]?.id || null;
    }catch(e){ console.warn('zoekContactId', e); return null; }
  };
  if(email){
    const id = await zoek(`emailAddresses/any(a:a/address eq '${odataTekst(String(email).trim())}')`);
    if(id) return id;
  }
  if(naam) return zoek(`displayName eq '${odataTekst(naam)}'`);
  return null;
}

/* ─── Bestanden: waar staat het en hoe ziet een regel eruit ───── */
function waarStaatHet(webUrl){
  try{
    const u = new URL(webUrl);
    const pad = decodeURIComponent(u.pathname);
    if(/\/personal\//i.test(pad)) return 'OneDrive';
    const m = pad.match(/\/sites\/([^/]+)/i);
    if(m) return m[1].replace(/[-_]+/g, ' ');
    return u.hostname.replace(/\.sharepoint\.com$/i, '').replace(/-my$/i, '');
  }catch(e){ return ''; }
}
function bestandRij(r){
  if(!r || !r.name || r.folder) return null;
  const url = /^https:\/\//i.test(String(r.webUrl||'')) ? String(r.webUrl) : '';
  return { naam: r.name, webUrl: url, gewijzigd: r.lastModifiedDateTime || '',
           grootte: Number(r.size) || 0, waar: waarStaatHet(url) };
}

/* ─── Publieke API voor modules ───────────────────────────────── */
/* ─── Vanzelf verversen ───────────────────────────────────────────
   Wens Tjeerd: "ik wil dat het systeem Outlook vaak ververst en dat ik niet
   zelf op dat knopje moet drukken."

   Twee dingen die dit meer zijn dan een setInterval:
   1. In een tabblad op de achtergrond gebeurt er niets. Elke vijf minuten
      Graph bevragen terwijl niemand kijkt kost alleen maar aanvragen, en die
      koppeling gaf al eerder een 429 (te veel verzoeken) bij bulkwerk.
   2. Kom je terug bij het tabblad, dan wordt er meteen ververst — dát is het
      moment waarop je verouderde gegevens zou zien. Wel met een ondergrens,
      zodat heen-en-weer klikken tussen tabbladen geen regen van aanvragen
      oplevert.                                                            */
let _tikker = null, _luisteraars = [], _laatst = 0;
const MIN_TUSSENPOOS = 60 * 1000;      // nooit vaker dan één keer per minuut

async function _ververs(reden){
  if(!CRM.outlook.verbonden()) return;
  if(Date.now() - _laatst < MIN_TUSSENPOOS) return;
  _laatst = Date.now();
  for(const fn of _luisteraars){
    try{ await fn(reden); }
    catch(e){ console.warn('outlook verversen', e); }   // één luisteraar mag de rest niet slopen
  }
}

CRM.outlook = {
  /* Meld je aan om bij elke verversing bijgewerkt te worden. Geeft een
     functie terug waarmee je je weer afmeldt (bij het verlaten van een
     scherm), zodat er geen luisteraars blijven hangen na een hertekening. */
  bijVerversen(fn, minuten = 5){
    _luisteraars.push(fn);
    if(!_tikker){
      _tikker = setInterval(() => {
        if(document.visibilityState === 'visible') _ververs('tijd');
      }, Math.max(1, minuten) * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible') _ververs('terug');
      });
    }
    return () => { _luisteraars = _luisteraars.filter(x => x !== fn); };
  },
  /* Handmatig aanstoten (de knop Vernieuwen) — negeert de ondergrens. */
  nuVerversen(){ _laatst = 0; return _ververs('handmatig'); },

  /* Is de volledige koppeling beschikbaar (registratie gedaan)? */
  beschikbaar: () => !!MS_CLIENT_ID && !CRM.demo,
  /* Is déze gebruiker verbonden? */
  verbonden: () => !!_account,
  accountNaam: () => _account?.username || '',
  /* Zijn er andere Microsoft-accounts bekend in deze browser dan het jouwe?
     Zo ja, dan is het de moeite waard om op het scherm te tonen wélke postbus
     je nu leest — anders is dat onzichtbaar tot je je erin vergist. */
  andereAccounts(){
    if(!_msal) return [];
    const mijn = String(CRM.user?.email || '').toLowerCase();
    return _msal.getAllAccounts()
      .map(a => a.username || '')
      .filter(u => u && u.toLowerCase() !== mijn);
  },

  async verbind(){
    if(!CRM.outlook.beschikbaar()){
      CRM.toast('Outlook-koppeling nog niet geactiveerd — zie SETUP-OUTLOOK.md','err'); return false;
    }
    try{
      const t = await token(true);
      if(!t) return false;                 // afgebroken of verkeerd account: token() meldde het al
      CRM.toast('Outlook verbonden als ' + CRM.outlook.accountNaam(),'ok'); return true;
    }
    catch(e){ CRM.fout('Verbinden mislukt', e); return false; }
  },
  async verbreek(){
    await msalLaden();
    if(_account) await _msal.logoutPopup({account:_account}).catch(()=>{});
    _account = null; CRM.toast('Outlook-koppeling verbroken');
  },

  /* Agenda voor het dashboard. Stil: vraagt nooit om login — geeft null
     als niet verbonden.
     opts.vanaf — begin van het venster (Date of ISO). Zonder dit begint het
     venster nu, en dan mist de weekweergave de afspraken van eerder deze
     week: op donderdag zag je maandag tot en met woensdag niet meer staan.
     Het aantal opgevraagde afspraken schaalt mee met de lengte van het
     venster. Er stond een vaste $top=25; bij vooruitbladeren naar week +4
     is dat een venster van 31 dagen, en dan kapte Graph de laatste dagen
     stilzwijgend af — een lege dag die niet leeg was. */
  async agenda(dagen = 1, opts = {}){
    if(!CRM.outlook.beschikbaar() || !_account) return null;
    const nu  = opts.vanaf ? new Date(opts.vanaf) : new Date();
    if(isNaN(nu)) return null;
    const tot = new Date(nu.getTime() + dagen*86400000);
    /* Ruim boven een volle agenda (8 per dag), met een plafond zodat één
       overvolle maand niet een antwoord van honderden kilobytes oplevert. */
    const top = Math.min(400, Math.max(25, Math.ceil(dagen) * 8));
    try{
      const d = await graph(`/me/calendarView?startDateTime=${nu.toISOString()}&endDateTime=${tot.toISOString()}&$orderby=start/dateTime&$top=${top}&$select=subject,start,end,location,onlineMeeting,webLink,attendees`,
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

  /* Wie heb ik recent gemaild? Alleen adressen en tijdstippen uit de map
     Verzonden — geen onderwerpen of inhoud, want dit dient één doel: het
     veld "laatste contact" automatisch bij laten lopen (Tjeerd, 4 aug
     2026: "het systeem moet zelf herkennen dat ik contact heb gehad").
     Stil: vraagt nooit om login. */
  async mailVerzonden({aantal = 50, sindsDagen = 14} = {}){
    if(!CRM.outlook.beschikbaar() || !_account) return null;
    const sinds = new Date(Date.now() - sindsDagen*86400000).toISOString();
    try{
      const d = await graph('/me/mailFolders/sentitems/messages' +
        `?$filter=${encodeURIComponent('sentDateTime ge ' + sinds)}` +
        `&$orderby=sentDateTime desc&$top=${aantal}` +
        '&$select=toRecipients,ccRecipients,sentDateTime', {}, false);
      return (d?.value||[]).map(m => ({
        aan: (m.toRecipients||[]).concat(m.ccRecipients||[])
          .map(r => r.emailAddress?.address).filter(Boolean),
        op: m.sentDateTime
      }));
    }catch(e){ console.warn('mailVerzonden', e); return null; }
  },

  /* Inbox-overzicht voor het dashboard: wat kwam er binnen en wat is nog
     ongelezen. Alleen koppen en een kort fragment — geen volledige mails
     in beeld terwijl er iemand meekijkt. Stil: vraagt nooit om login. */
  async mailInbox({ongelezen = false, aantal = 10, sindsUren = 24} = {}){
    if(!CRM.outlook.beschikbaar() || !_account) return null;
    const sinds = new Date(Date.now() - sindsUren*3600000).toISOString();
    const filters = [`receivedDateTime ge ${sinds}`];
    if(ongelezen) filters.push('isRead eq false');
    try{
      const d = await graph('/me/mailFolders/inbox/messages' +
        `?$filter=${encodeURIComponent(filters.join(' and '))}` +
        `&$orderby=receivedDateTime desc&$top=${aantal}` +
        '&$select=subject,from,receivedDateTime,bodyPreview,webLink,isRead,importance', {}, false);
      return (d?.value||[]).map(m => ({
        onderwerp: m.subject || '(geen onderwerp)',
        van: m.from?.emailAddress?.address || '',
        vanNaam: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
        op: m.receivedDateTime,
        fragment: (m.bodyPreview||'').slice(0, 180),
        link: m.webLink, gelezen: !!m.isRead, belangrijk: m.importance === 'high'
      }));
    }catch(e){ console.warn('mailInbox', e); return null; }
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

  /* ─── Contacten ─────────────────────────────────────────────
     Eén contactpersoon in het Outlook-adresboek zetten, zodat de
     telefoon laat zien wie er belt. Bestaat de persoon al (zelfde
     e-mailadres of zelfde naam), dan wordt hij bijgewerkt in plaats
     van gedupliceerd. Geeft {nieuw:true|false} of null bij fout. */
  async zetContact({naam, email, telefoon, bedrijf, functie} = {}){
    if(!CRM.outlook.beschikbaar() || !_account) return null;
    const volledig = String(naam||'').trim();
    const adres = String(email||'').trim();
    const nummer = String(telefoon||'').trim();
    if(!volledig && !adres) return null;
    try{
      const delen = volledig.split(/\s+/).filter(Boolean);
      const voor = delen.shift() || '';
      const achter = delen.join(' ');
      const velden = {
        displayName: volledig || adres,
        givenName: voor || undefined,
        surname: achter || undefined,
        emailAddresses: adres ? [{address: adres, name: volledig || adres}] : undefined,
        businessPhones: nummer ? [nummer] : undefined,
        companyName: bedrijf ? String(bedrijf) : undefined,
        jobTitle: functie ? String(functie) : undefined
      };
      const bestaand = await zoekContactId(volledig, adres);
      /* Geen antwoord = geen geldig token meer; dan niet doen alsof het
         gelukt is, maar netjes null teruggeven. */
      if(bestaand){
        const r = await graphRustig('/me/contacts/' + encodeURIComponent(bestaand), {method:'PATCH', body: velden});
        return r ? {nieuw:false} : null;
      }
      const r = await graphRustig('/me/contacts', {method:'POST', body: velden});
      return r ? {nieuw:true} : null;
    }catch(e){ console.warn('zetContact', e); return null; }
  },

  /* ─── Documenten ────────────────────────────────────────────
     Zoeken in OneDrive én SharePoint. Dit is ZOEKEN, geen kopiëren:
     er wordt niets gedownload en niets in het CRM opgeslagen — we
     tonen alleen waar het bestand staat en linken erheen. */
  async zoekBestanden(term, aantal = 10){
    const q = String(term||'').trim();
    if(!CRM.outlook.beschikbaar() || !_account || !q) return null;
    const max = Math.max(1, Math.min(25, aantal));
    try{
      const d = await graph('/search/query', {method:'POST', body:{ requests:[{
        entityTypes:['driveItem'], query:{ queryString: q }, from:0, size:max
      }]}}, false);
      const hits = d?.value?.[0]?.hitsContainers?.[0]?.hits || [];
      const uit = hits.map(x => bestandRij(x?.resource)).filter(Boolean);
      if(uit.length) return uit;
    }catch(e){ console.warn('zoekBestanden (search)', e); }
    /* Terugval: alleen de eigen OneDrive, mocht de zoek-API dichtstaan. */
    try{
      const d = await graph(`/me/drive/root/search(q='${encodeURIComponent(odataTekst(q))}')` +
        `?$top=${max}&$select=name,webUrl,lastModifiedDateTime,size,folder`, {}, false);
      return (d?.value||[]).map(bestandRij).filter(Boolean);
    }catch(e){ console.warn('zoekBestanden (drive)', e); return null; }
  },

  /* Link naar de Microsoft 365-zoekpagina, voor "meer in OneDrive". */
  zoekLink(term){
    return 'https://www.microsoft365.com/search/files?q=' + encodeURIComponent(String(term||'').trim());
  },

  /* ─── Zelftest ──────────────────────────────────────────────
     Per onderdeel één lichte, stille aanroep, zodat Instellingen kan
     laten zien wat er écht aanstaat. Faalt een onderdeel (machtiging
     niet toegekend), dan alleen dát onderdeel op false. */
  async zelftest(){
    if(!CRM.outlook.beschikbaar() || !_account) return null;
    const probeer = async pad => {
      try{ return (await graph(pad, {}, false)) !== null; }
      catch(e){ console.warn('zelftest ' + pad, e); return false; }
    };
    return {
      agenda:     await probeer('/me/events?$top=1&$select=id'),
      taken:      await probeer('/me/todo/lists?$top=1'),
      mail:       await probeer('/me/messages?$top=1&$select=id'),
      contacten:  await probeer('/me/contacts?$top=1&$select=id'),
      documenten: await probeer('/me/drive/root?$select=id'),
      teams:      await probeer('/me/chats?$top=1&$select=id')
    };
  },

  /* Kant-en-klare deeplink (voor gewone <a href>-knoppen). */
  composeLink(opts){
    const start = combineer(opts.datum, opts.tijd);
    const eind  = new Date(start.getTime() + (opts.duurMin || 45)*60000);
    return composeUrl({titel:opts.titel, start, eind, body:opts.body, locatie:opts.locatie, deelnemers:opts.deelnemers});
  },

  /* Bestaande koppeling terughalen uit het browsergeheugen.
     Zonder dit stond `_account` bij elke paginalading op null, want msalLaden()
     werd alleen aangeroepen vanuit token() — dus pas nádat je op "Outlook
     verbinden" had gedrukt. De sessie stond er al die tijd wel, het scherm wist
     het alleen niet: verbonden() gaf false en de knop bleef staan. Vandaar dat
     je elke keer opnieuw moest verbinden terwijl er niets verlopen was. */
  herstel(){
    if(_herstelBelofte) return _herstelBelofte;
    _herstelBelofte = (async () => {
      if(!CRM.outlook.beschikbaar()) return false;
      try{ await msalLaden(); }
      catch(e){ console.warn('Outlook-koppeling terughalen mislukt', e); return false; }
      return !!_account;
    })();
    return _herstelBelofte;
  },

  /* Opnieuw bepalen wélke postbus bij deze gebruiker hoort. Roept core.js
     aan zodra het inloggen rond is — dus op het moment dat CRM.user.email
     eindelijk bekend is. Kost niets: leest alleen wat MSAL al in dit
     browsergeheugen heeft staan, geen netwerk, geen inlogvenster.

     Zonder deze stap blijft de keuze staan zoals hij bij het laden van de
     pagina uitviel, en dat is te vroeg — zie de toelichting bij
     kiesAccount(). Geeft het adres terug dat nu gekoppeld is, of ''. */
  herkoppel(){
    if(!_msal) return '';
    const was = _account?.username || '';
    _account = kiesAccount(_msal.getAllAccounts());
    const nu = _account?.username || '';
    if(was && was !== nu)
      console.warn('Outlook: postbus gewisseld van ' + was + ' naar ' + (nu || '(geen)'));
    return nu;
  }
};

/* Meteen bij het laden proberen, zodat de knop "Outlook verbinden" niet
   verschijnt bij iemand die allang verbonden is. Lukt het, dan één keer
   opnieuw tekenen zodat agenda en mail meekomen. Mislukt het, dan gebeurt er
   niets bijzonders: de knop staat er dan terecht. */
if(CRM.outlook.beschikbaar()){
  CRM.outlook.herstel().then(verbonden => {
    if(!verbonden) return;
    try{ if(CRM.view) CRM.render(); }
    catch(e){ console.warn('hertekenen na Outlook-herstel', e); }
  });
}
})();
