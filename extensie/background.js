// ═══════════════════════════════════════════════════════════════
// PLOEGGENOTEN CRM — service worker
// Regelt: inloggen op Supabase (zelfde account als in het CRM),
// token bewaren + verversen, en leads wegschrijven naar de tabellen
// crm_leads (kandidaat) en crm_leadradar (sales).
//
// De anon-sleutel hieronder is dezelfde publieke sleutel die ook in
// de CRM-website (GitHub Pages) staat — geen geheim. Schrijven kan
// alleen als je bent ingelogd (RLS: policy 'authenticated').
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://gyhrwjdlwamyjhxtdypw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5aHJ3amRsd2FteWpoeHRkeXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODgwMzUsImV4cCI6MjA5NzM2NDAzNX0.M2huzUfbYtcOqimYIkcuGW-6BCion4HqJVn7TxtkZ9c';

const SLEUTEL = 'pg_sessie';   // opslag-key in chrome.storage.local

// ─── Sessie-opslag ────────────────────────────────────────────
async function leesSessie(){
  const o = await chrome.storage.local.get(SLEUTEL);
  return o[SLEUTEL] || null;
}
async function bewaarSessie(s){ await chrome.storage.local.set({ [SLEUTEL]: s }); }
async function wisSessie(){ await chrome.storage.local.remove(SLEUTEL); }

// ─── Auth ─────────────────────────────────────────────────────
async function login(email, wachtwoord){
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method:'POST',
    headers:{ 'apikey':SUPABASE_ANON, 'Content-Type':'application/json' },
    body: JSON.stringify({ email, password: wachtwoord })
  });
  const d = await r.json().catch(()=> ({}));
  if(!r.ok){ return { ok:false, error: d.error_description || d.msg || d.error || 'Inloggen mislukt' }; }
  await bewaarSessie({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
    email: d.user?.email || email
  });
  return { ok:true, email: d.user?.email || email };
}

async function ververs(sessie){
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method:'POST',
    headers:{ 'apikey':SUPABASE_ANON, 'Content-Type':'application/json' },
    body: JSON.stringify({ refresh_token: sessie.refresh_token })
  });
  const d = await r.json().catch(()=> ({}));
  if(!r.ok || !d.access_token){ await wisSessie(); return null; }
  const nieuw = {
    access_token: d.access_token,
    refresh_token: d.refresh_token || sessie.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
    email: d.user?.email || sessie.email
  };
  await bewaarSessie(nieuw);
  return nieuw;
}

// Geldig token teruggeven (ververst indien bijna verlopen).
async function geldigToken(){
  let s = await leesSessie();
  if(!s) return null;
  if(Date.now() > (s.expires_at - 60000)){ s = await ververs(s); }
  return s ? s.access_token : null;
}

// ─── Wegschrijven naar Supabase (PostgREST) ───────────────────
async function insert(tabel, rij){
  const token = await geldigToken();
  if(!token) return { ok:false, reason:'auth' };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabel}`, {
    method:'POST',
    headers:{
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(rij)
  });
  if(r.ok) return { ok:true };
  if(r.status === 409) return { ok:false, reason:'bestaat' };
  const t = await r.text().catch(()=> '');
  return { ok:false, error: `${r.status} ${t}`.slice(0,300) };
}

async function selecteer(tabel, query){
  const token = await geldigToken();
  if(!token) return { ok:false, reason:'auth' };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabel}?${query}`, {
    headers:{ 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
  });
  if(!r.ok) return { ok:false, error: `${r.status}` };
  return { ok:true, rijen: await r.json().catch(()=> []) };
}

const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random()*1e6).toString(36);
const vandaag = () => new Date().toISOString().slice(0,10);

// ─── Dubbelcheck ──────────────────────────────────────────────
// "Bakker Barendrecht B.V." en "bakker barendrecht" zijn hetzelfde bedrijf.
// Rechtsvormen en leestekens eruit, dan pas vergelijken.
const kern = (s) => String(s || '').toLowerCase()
  .replace(/\b(b\.?\s?v\.?|n\.?\s?v\.?|v\.?o\.?f\.?|c\.?\s?v\.?|holding|group|groep|nederland|netherlands|benelux)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const cijfers = (s) => String(s || '').replace(/\D/g, '').replace(/^31/, '0');

// Zoekt het bedrijf/de persoon op in wat er al in het CRM staat.
// Geeft een lijstje meldingen terug; leeg = niets gevonden.
async function checkDubbel(type, d){
  const uit = [];
  const kb = kern(d.bedrijf);
  if(kb){
    // Breed ophalen op het langste kernwoord, daarna pas precies vergelijken:
    // zo mist hij geen "Verstegen Spices" als jij "Verstegen" typt.
    const woord = kb.split(' ').sort((a, b) => b.length - a.length)[0] || kb;
    const pat = `*${encodeURIComponent(woord)}*`;

    const radar = await selecteer('crm_leadradar', `select=bedrijf,status,bron,gevonden_op&bedrijf=ilike.${pat}&limit=30`);
    if(radar.reason === 'auth') return { ok:false, reason:'auth' };
    (radar.rijen || []).forEach((r) => {
      const k = kern(r.bedrijf);
      if(!(k === kb || k.includes(kb) || kb.includes(k))) return;
      const waar = r.bron === 'website' || r.bron === 'linkedin' ? 'bij Zelf gevonden' : 'in de Leadradar';
      uit.push({ soort:'radar',
        tekst:`${r.bedrijf} staat al ${waar}${r.status && r.status !== 'nieuw' ? ` (${r.status})` : ''}${r.gevonden_op ? ` — sinds ${r.gevonden_op}` : ''}.` });
    });

    const klant = await selecteer('clients', `select=naam,fase,eigenaar&naam=ilike.${pat}&limit=30`);
    (klant.rijen || []).forEach((c) => {
      const k = kern(c.naam);
      if(!(k === kb || k.includes(kb) || kb.includes(k))) return;
      uit.push({ soort:'klant',
        tekst:`${c.naam} staat al in de klantpijplijn${c.fase ? ` (fase ${c.fase})` : ''}${c.eigenaar ? ` — ${c.eigenaar}` : ''}.` });
    });
  }

  // Kandidaat: e-mail en telefoon zijn de harde signalen, naam het zachte.
  if(type === 'kandidaat'){
    if(d.email){
      const r = await selecteer('crm_leads', `select=naam,status,binnen_op&email=eq.${encodeURIComponent(d.email)}&limit=5`);
      (r.rijen || []).forEach((l) => uit.push({ soort:'kandidaat',
        tekst:`Dit e-mailadres staat al bij ${l.naam || 'een sollicitant'}${l.status ? ` (${l.status})` : ''}.` }));
    }
    const tel = cijfers(d.telefoon);
    if(tel.length >= 9){
      const r = await selecteer('crm_leads', `select=naam,telefoon,status&telefoon=ilike.*${tel.slice(-8)}*&limit=5`);
      (r.rijen || []).forEach((l) => uit.push({ soort:'kandidaat',
        tekst:`Dit telefoonnummer staat al bij ${l.naam || 'een sollicitant'}${l.status ? ` (${l.status})` : ''}.` }));
    }
    if(d.naam && !uit.some((x) => x.soort === 'kandidaat')){
      const r = await selecteer('crm_leads', `select=naam,status,woonplaats&naam=ilike.*${encodeURIComponent(d.naam)}*&limit=5`);
      (r.rijen || []).forEach((l) => uit.push({ soort:'kandidaat',
        tekst:`${l.naam} staat al bij de sollicitanten${l.status ? ` (${l.status})` : ''} — zelfde persoon?` }));
    }
  }

  // Dezelfde melding kan uit twee queries komen; één keer tonen is genoeg.
  const gezien = new Set();
  return { ok:true, treffers: uit.filter((x) => !gezien.has(x.tekst) && gezien.add(x.tekst)) };
}

// Kandidaat-lead → crm_leads (inbox "Inkomende sollicitanten")
async function bewaarKandidaat(d){
  const notitie = [d.bron === 'website' ? 'Toegevoegd via de CRM-extensie (website)' : 'Toegevoegd via LinkedIn-extensie',
                   d.bedrijf ? `Werkt bij: ${d.bedrijf}` : '',
                   d.functie ? `Functie: ${d.functie}` : '',
                   d.notitie || '',
                   d.url ? `Profiel: ${d.url}` : ''].filter(Boolean).join(' · ');
  const rij = {
    id: uid('ln'), naam: d.naam, telefoon: d.telefoon || '', email: d.email || '',
    woonplaats: d.plaats || '', bron: d.bron === 'website' ? 'Website' : 'LinkedIn', campagne: '',
    vacature_id: '', klant: '', functie: d.functie || '',
    status: 'Nieuw', prioriteit: '', kwalificatie: '', score: null,
    agent_notitie: notitie, antwoorden: null, cv: null, cv_url: d.url || '',
    eigenaar: '', binnen_op: new Date().toISOString(), opvolgen_op: null,
    kandidaat_id: '', notities: []
  };
  return insert('crm_leads', rij);
}

// Sales-lead → crm_leadradar (Sales → Leadradar; één klik naar pijplijn)
// Komt binnen vanaf LinkedIn (bron 'handmatig') of vanaf een bedrijfswebsite
// (bron 'website'); de contactpersoon gaat mee in de notitie.
async function bewaarSales(d){
  // Eigen bronnaam per herkomst, zodat het CRM ze in de tab "Zelf gevonden"
  // apart kan tonen en de Leadradar alleen de automatische vondsten houdt.
  const bron = d.bron === 'website' ? 'website' : 'linkedin';
  const notitie = [
    d.naam ? `Contactpersoon: ${d.naam}${d.contactfunctie ? ` (${d.contactfunctie})` : ''}` : '',
    d.email ? `E-mail: ${d.email}` : '',
    d.telefoon ? `Tel: ${d.telefoon}` : '',
    d.notitie || '',
    d.url ? `${bron === 'website' ? 'Bron' : 'LinkedIn'}: ${d.url}` : ''
  ].filter(Boolean).join(' · ');
  /* De contactpersoon staat hierboven in de notitie zodat je hem meteen leest,
     maar het CRM moet er ook mee kúnnen werken: bij "→ Lead" maakt sales.js
     hier een contactpersoon op de relatiekaart van. Een tekstregel uitpluizen
     is daarvoor te wankel, dus dezelfde gegevens gaan nog een keer mee als
     object. Dat kan zonder migratie in het jsonb-veld dat er al is; de vier
     conceptteksten van de ochtendroutine zitten onder andere sleutels, dus ze
     bijten elkaar niet.
     (Tjeerd, 11 aug 2026: "ik scrape vaak vanuit LinkedIn vanuit een
     contactpersoon … dan moet die wel opgeslagen worden als contactpersoon in
     de relatiekaart.") */
  const contact = d.naam ? {
    naam: d.naam,
    functie: d.contactfunctie || '',
    email: d.email || '',
    telefoon: d.telefoon || '',
    linkedin: bron === 'linkedin' ? (d.url || '') : ''
  } : null;
  const rij = {
    id: uid('lr'), bedrijf: d.bedrijf, plaats: d.plaats || '',
    functies: d.functie || (bron === 'website' ? 'via website' : 'via LinkedIn'),
    vacatures: Math.max(1, parseInt(d.vacatures, 10) || 1), bron,
    url: d.url || '', salaris_ind: d.salaris || '', gevonden_op: vandaag(),
    laatst_gezien: vandaag(), status: 'nieuw', status_door: '',
    notitie, concepten: contact ? { contact } : null
  };
  return insert('crm_leadradar', rij);
}

// ─── Berichten uit popup / content-script ─────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, stuur) => {
  (async () => {
    try{
      if(msg.action === 'login')  return stuur(await login(msg.email, msg.wachtwoord));
      if(msg.action === 'logout'){ await wisSessie(); return stuur({ ok:true }); }
      if(msg.action === 'status'){ const s = await leesSessie(); return stuur({ ingelogd: !!s, email: s?.email || '' }); }
      if(msg.action === 'check') return stuur(await checkDubbel(msg.type, msg.data || {}));
      if(msg.action === 'save'){
        if(!msg.data || (msg.type==='kandidaat' ? !msg.data.naam : !msg.data.bedrijf))
          return stuur({ ok:false, error: msg.type==='kandidaat' ? 'Naam ontbreekt' : 'Bedrijfsnaam ontbreekt' });
        return stuur(msg.type === 'kandidaat' ? await bewaarKandidaat(msg.data) : await bewaarSales(msg.data));
      }
      if(msg.action === 'saveBatch'){
        const items = Array.isArray(msg.items) ? msg.items : [];
        let toe = 0, bestond = 0, mislukt = 0;
        for(const it of items){
          if(!it || !it.bedrijf){ mislukt++; continue; }
          const r = await bewaarSales(it);
          if(r.ok) toe++;
          else if(r.reason === 'bestaat') bestond++;
          else if(r.reason === 'auth') return stuur({ ok:false, reason:'auth' });
          else mislukt++;
        }
        return stuur({ ok:true, toe, bestond, mislukt });
      }
      stuur({ ok:false, error:'onbekende actie' });
    }catch(e){ stuur({ ok:false, error: String(e && e.message || e) }); }
  })();
  return true; // async antwoord
});
