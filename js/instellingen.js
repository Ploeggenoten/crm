/* ═══════════════════════════════════════════════════════════════
   MODULE: INSTELLINGEN (alleen voor Tjeerd)
   Pariteit met het bord-beheer: targets per maand (openCijfers/
   targets-tabel), profielen en rollen (openAdmin), export/import
   JSON (bord-compatibel) en een systeemoverzicht.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Targets ─────────────────────────────────────────────────── */
/* Het CRM leest de default onder '__default__', het oude bord onder
   '__default'. We schrijven allebei zodat beide apps synchroon blijven. */
const DEFAULT_KEYS = ['__default__','__default'];

function targetRij(maand){
  return CRM.state.targets.find(t => t.maand === maand);
}
async function zetTarget(maand, aantal){
  const sleutels = DEFAULT_KEYS.includes(maand) ? DEFAULT_KEYS : [maand];
  /* Eerst in het geheugen, dan naar de database. Gaat het opslaan mis, dan
     draaien we het geheugen terug: anders staat er op het scherm een target
     die nergens bewaard is en waar je maanden later op afgerekend wordt. */
  const terug = [];
  for(const k of sleutels){
    const t = targetRij(k);
    terug.push(t ? {rij:t, oud:t.aantal} : {nieuw:k});
    if(t) t.aantal = aantal; else CRM.state.targets.push({maand:k, aantal});
    if(!CRM.demo){
      const {error} = await CRM.sb.from('targets').upsert({maand:k, aantal});
      if(error){
        terug.forEach(x => {
          if(x.rij) x.rij.aantal = x.oud;
          else CRM.state.targets = CRM.state.targets.filter(r => r.maand !== x.nieuw);
        });
        return CRM.fout('Target opslaan mislukt — het oude getal blijft staan', error);
      }
    }
  }
  CRM.toast(`Target ${DEFAULT_KEYS.includes(maand) ? 'standaard' : maandLabel(maand)} → ${aantal}`, 'ok');
}

function maandLijst(){
  const nu = new Date();
  const maanden = new Set();
  for(let i = -2; i <= 5; i++){
    const d = new Date(nu.getFullYear(), nu.getMonth() + i, 1);
    maanden.add(d.toLocaleDateString('sv-SE').slice(0,7));
  }
  CRM.state.targets.forEach(t => { if(!DEFAULT_KEYS.includes(t.maand)) maanden.add(t.maand); });
  return Array.from(maanden).sort();
}
const MND = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const maandLabel = mk => { const [j,m] = mk.split('-'); const n = MND[+m-1]||mk; return n.charAt(0).toUpperCase()+n.slice(1)+' '+j; };

const standaardTarget = () => {
  const d = targetRij('__default__') || targetRij('__default');
  return d ? d.aantal : 8;
};

function targetRegelHtml(mk, mkNu){
  const t = targetRij(mk);
  const eff = t ? t.aantal : standaardTarget();
  const pm = mk <= mkNu ? CRM.plaatsingenMaand(mk) : null;
  return `<tr class="${mk===mkNu?'in-nu':''}" data-mk="${h(mk)}">
    <td>${h(maandLabel(mk))}${mk===mkNu?' <span class="chip green">nu</span>':''}
      <span class="meta in-std"${t?' hidden':''}>(standaard)</span></td>
    <td class="n"><input type="number" min="0" data-target="${h(mk)}" value="${h(eff)}" class="in-tinp num"
      aria-label="Target ${h(maandLabel(mk))}"></td>
    <td class="n num">${pm ? pm.netto : '—'}</td>
    <td class="n num in-vers">${pm ? CRM.plusMin(pm.netto - eff) : '—'}</td>
  </tr>`;
}

/* Alleen de cellen bijwerken die kunnen veranderen — NIET het hele scherm
   opnieuw tekenen. Dat deed het eerder wel, en dan verloor je na elke
   target die je aanpaste je plek in het formulier: je tabt naar de volgende
   maand, de tabel wordt weggegooid en je focus staat opeens op <body>.
   Zo blijft het invoerveld waar je in staat gewoon bestaan. */
function werkTargetsBij(mount){
  const std = standaardTarget(), mkNu = CRM.todayISO().slice(0,7);
  CRM.$$('tr[data-mk]', mount).forEach(tr => {
    const mk = tr.dataset.mk;
    const eigen = targetRij(mk);
    const eff = eigen ? eigen.aantal : std;
    const inp = tr.querySelector('[data-target]');
    if(inp && document.activeElement !== inp) inp.value = eff;
    const mark = tr.querySelector('.in-std');
    if(mark) mark.hidden = !!eigen;
    const vers = tr.querySelector('.in-vers');
    if(vers){
      const pm = mk <= mkNu ? CRM.plaatsingenMaand(mk) : null;
      vers.innerHTML = pm ? CRM.plusMin(pm.netto - eff) : '—';
    }
  });
}

function sectieTargets(){
  const mkNu = CRM.todayISO().slice(0,7);
  /* Bewust géén .label hier: dat is micro-caps met letterspatiëring, prima
     voor één woord maar slecht leesbaar voor een hele zin. */
  return `<div class="card"><div class="card-h"><div class="h2">Maandtargets</div>
      <div class="spacer"></div><span class="meta">netto plaatsingen per maand</span></div>
    <div class="card-b">
      <div class="in-target">
        <label for="in_std">Standaard <span class="meta">— geldt voor elke maand zonder eigen target</span></label>
        <input type="number" min="0" id="in_std" data-target="__default__" value="${h(standaardTarget())}">
      </div>
      <div class="tblwrap" style="margin-top:12px"><table class="tbl">
        <thead><tr><th>Maand</th><th class="n">Target</th><th class="n">Netto behaald</th><th class="n">Verschil</th></tr></thead>
        <tbody>${maandLijst().map(mk => targetRegelHtml(mk, mkNu)).join('')}</tbody>
      </table></div>
      <p class="meta" style="margin:10px 2px 0">Netto = getekend − gestopt in die maand, dezelfde definitie als op het bord en in Recruitment.</p>
    </div></div>`;
}

/* ─── Team en rollen (openAdmin van het bord) ─────────────────── */
const ROLLEN = [['am','Account Manager'],['admin','Beheerder']];
/* Functie stuurt de dashboard-variant (marketeer krijgt een eigen kolom). */
const FUNCTIES = [['am','AM'],['recruiter','Recruiter'],['marketeer','Marketeer']];
const heeftMail = p => !!String(p && p.email || '').trim();
/* Grof maar genoeg: we willen tikfouten als "bryan@ploeggenoten" tegenhouden,
   niet de RFC naspelen. */
const mailOk = s => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(s||'').trim());

/* Zonder e-mailadres kan het CRM een Teams-bericht nergens heen sturen.
   Dat gebeurt stilletjes — de melding in het CRM komt er wél — dus het
   moet hier hardop staan, met de namen erbij.
   Apart van sectieTeam() zodat we na het invullen van één adres alléén dit
   blokje kunnen bijwerken. Eerder tekende de hele pagina opnieuw en sprong
   je focus uit de rij e-mailvelden die je aan het aflopen was. */
function teamWaarschuwingHtml(){
  const zonder = (CRM.state.profiles||[]).filter(p => !heeftMail(p))
    .slice().sort((a,b)=>String(a.naam||'').localeCompare(String(b.naam||'')));
  if(!zonder.length) return '';
  const namen = zonder.map(p => `<b>${h(p.naam||'een collega zonder naam')}</b>`);
  const opsom = namen.length === 1 ? namen[0]
              : namen.slice(0,-1).join(', ') + ' en ' + namen[namen.length-1];
  return `<div class="note warn" style="margin-top:14px">
    <b>Van ${opsom} kennen we het werk-e-mailadres nog niet.</b>
    Wijs je zo iemand een taak toe of noem je die met @naam, dan komt de melding wél in het CRM,
    maar het bericht in Teams blijft uit — en daar kijkt het team de hele dag.
    Vul het adres hierboven in en het is meteen opgelost.</div>`;
}

function sectieTeam(){
  const profielen = (CRM.state.profiles||[]).slice().sort((a,b)=>String(a.naam||'').localeCompare(String(b.naam||'')));
  const rij = p => {
    const bekend = ROLLEN.some(([k]) => k === p.rol);
    return `<tr>
      <td><b>${h(p.naam||'—')}</b></td>
      <td><input type="email" class="in-mail${heeftMail(p)?'':' leeg'}" data-email="${h(p.id)}"
        value="${h(p.email||'')}" placeholder="voornaam@ploeggenoten.nl"
        aria-label="Werk-e-mailadres van ${h(p.naam||'deze collega')}"></td>
      <td class="n"><select data-functie="${h(p.id)}" style="width:auto;min-width:130px">
        ${FUNCTIES.map(([k,l])=>`<option value="${k}" ${(p.functie||'am')===k?'selected':''}>${l}</option>`).join('')}
      </select></td>
      <td class="n"><select data-rol="${h(p.id)}" style="width:auto;min-width:170px">
        ${bekend ? '' : `<option value="${h(p.rol||'')}" selected>${h(p.rol||'—')} (huidig)</option>`}
        ${ROLLEN.map(([k,l])=>`<option value="${k}" ${p.rol===k?'selected':''}>${l}</option>`).join('')}
      </select></td></tr>`;
  };
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Team en rollen</div>
      <div class="spacer"></div><span class="meta">e-mailadres is nodig voor Teams-meldingen</span></div>
    <div class="card-b">
      ${profielen.length ? `<div class="tblwrap"><table class="tbl">
        <thead><tr><th>Gebruiker</th><th>Werk-e-mail</th><th class="n">Functie</th><th class="n">Rol</th></tr></thead>
        <tbody>${profielen.map(rij).join('')}</tbody></table></div>`
      : CRM.ui.leeg('Geen gebruikers gevonden','Profielen verschijnen na de eerste login.')}
      <div id="in_teamwaarsch">${teamWaarschuwingHtml()}</div>
      <div class="note info" style="margin-top:14px"><b>Nieuwe collega uitnodigen:</b> Supabase-dashboard →
        Authentication → Users → <i>Invite user</i> met het @ploeggenoten.nl-adres. Na de eerste login verschijnt
        het profiel hier vanzelf — zet dan de rol en het e-mailadres goed. Beheerders mogen rollen wijzigen;
        financiële cijfers blijven altijd alleen voor de eigenaar zichtbaar.</div>
    </div></div>`;
}

/* ═══════════════════════════════════════════════════════════════
   MICROSOFT-KOPPELING
   De koppeling is per persoon: Tjeerd verbindt zijn eigen account,
   Bryan het zijne. Niemand kijkt via het CRM in andermans agenda of
   postvak. Is er geen app-registratie (of draaien we in demo), dan
   verschijnen deze blokken helemaal niet.
   ═══════════════════════════════════════════════════════════════ */
const msKlaar    = () => !!(CRM.outlook && CRM.outlook.beschikbaar?.());
const msVerbonden = () => !!(msKlaar() && CRM.outlook.verbonden?.());

/* Wat kan de koppeling, in gewone taal. De sleutel komt overeen met
   wat CRM.outlook.zelftest() teruggeeft. De vierde kolom is wat je mist
   als dat onderdeel het niet doet — daar heb je meer aan dan aan de naam
   van een machtiging als Mail.Send. */
const MS_ONDERDELEN = [
  ['agenda',     'Agenda',     'Je komende afspraken zien en er vanuit het CRM een inplannen.',
   'het agendablok op het dashboard blijft leeg, en "Inplannen in Outlook" opent alleen nog een vooringevulde afspraak in je browser.'],
  ['taken',      'Taken',      'Een taak uit het CRM komt ook in Microsoft To Do te staan.',
   'taken blijven alleen in het CRM staan en verschijnen niet in To Do.'],
  ['mail',       'Mail',       'De mailwisseling met één klant of kandidaat terugzien op de kaart.',
   'het mailblok op klant- en kandidaatkaarten blijft leeg.'],
  ['contacten',  'Contacten',  'Contactpersonen in je adresboek zetten, zodat je telefoon laat zien wie er belt.',
   'contactpersonen synchroniseren lukt niet; je telefoon blijft onbekende nummers tonen.'],
  ['documenten', 'Documenten', 'Zoeken in OneDrive en SharePoint. Er wordt niets gekopieerd of opgeslagen.',
   'zoeken in OneDrive en SharePoint geeft geen resultaten.'],
  ['teams',      'Teams',      'Meldingen naar een collega sturen in Teams.',
   'meldingen blijven in het CRM staan; je collega krijgt niets in Teams.']
];

function msRegelHtml([sleutel, lbl, uitleg, gevolg]){
  return `<div class="in-msrij" data-ms="${h(sleutel)}">
    <span class="in-msvink" aria-hidden="true">–</span>
    <span class="in-mswat"><b>${h(lbl)}</b><span class="meta">${h(uitleg)}</span>
      <span class="meta in-msgevolg">Doet het nu niet: ${h(gevolg)}</span></span>
  </div>`;
}

function sectieMicrosoft(){
  if(!msKlaar()) return '';
  const verbonden = msVerbonden();
  const adres = verbonden ? (CRM.outlook.accountNaam?.() || '') : '';
  const teamsUit = (() => { try{ return localStorage.getItem('crm_teams_uit') === '1'; }catch(e){ return false; } })();
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Microsoft-koppeling</div>
      <div class="spacer"></div><span class="meta">alleen voor jouw eigen account</span></div>
    <div class="card-b">
      <div class="in-msstatus">
        <div class="in-msnu">
          <b>${verbonden ? 'Verbonden' : 'Niet verbonden'}</b>
          <div class="meta">${verbonden
            ? 'als <span class="num">' + h(adres) + '</span>'
            : 'Verbind je Microsoft-account om agenda, mail, contacten en documenten in het CRM te gebruiken.'}</div>
        </div>
        <div class="row tight">
          ${verbonden
            ? '<button class="btn ghost sm" id="in_msuit">Verbreken</button>'
            : '<button class="btn sm" id="in_msaan">Verbinden</button>'}
        </div>
      </div>
      <div id="in_mshulp"></div>
      ${verbonden ? `<div class="in-msonderdelen" id="in_mslijst">${MS_ONDERDELEN.map(msRegelHtml).join('')}</div>
      <div id="in_msuitslag" class="in-msuitslag"><p class="meta">Onderdelen controleren…</p></div>
      <label class="in-msschakel"><input type="checkbox" id="in_teamsuit" ${teamsUit?'':'checked'}>
        <span><b>Teams-meldingen</b>
          <span class="meta">Krijgt een collega een taak van je, dan stuurt het CRM een bericht in Teams.
            Zet uit als je dat liever niet hebt. Deze keuze geldt alleen in deze browser.</span>
          <span class="meta in-mswaarschuwing" id="in_teamshint"></span></span></label>` : ''}
    </div></div>`;
}

/* ─── Zelftest ────────────────────────────────────────────────────
   Per onderdeel één lichte aanroep bij Microsoft. De uitslag onthouden
   we: het scherm hertekent bij elke wijziging (een target aanpassen al),
   en zes Graph-aanroepen per hertekening is traag én de snelste manier
   om door Microsoft afgeknepen te worden (429). */
let msUitslag = null, msUitslagOp = 0, msTestBezig = false;
const MS_GELDIG_MS = 5 * 60 * 1000;

function msZetVink(rij, ok){
  const vink = rij.querySelector('.in-msvink');
  vink.textContent = ok ? '✓' : '–';
  vink.classList.toggle('aan', ok === true);
  rij.classList.toggle('uit', ok === false);
}

function msZelftest(mount, opnieuw){
  const lijst = mount.querySelector('#in_mslijst');
  const vak = mount.querySelector('#in_msuitslag');
  if(!lijst || !vak) return;
  if(!CRM.outlook.zelftest){
    vak.innerHTML = `<p class="meta">Deze versie van het CRM kan de onderdelen niet controleren.</p>`;
    return;
  }
  const vers = msUitslagOp && (Date.now() - msUitslagOp) < MS_GELDIG_MS;
  if(vers && !opnieuw){ msToonUitslag(mount); return; }
  if(msTestBezig) return;
  msTestBezig = true;
  vak.innerHTML = `<p class="meta">Onderdelen controleren…</p>`;
  Promise.resolve(CRM.outlook.zelftest())
    .then(uit => { msUitslag = uit || null; })
    .catch(e => { console.warn('zelftest', e); msUitslag = null; })
    .then(() => {
      msUitslagOp = Date.now(); msTestBezig = false;
      msToonUitslag(mount);
    });
}

function msToonUitslag(mount){
  const lijst = mount.querySelector('#in_mslijst');
  const vak = mount.querySelector('#in_msuitslag');
  if(!lijst || !vak) return;
  const hercheck = `<button class="btn ghost sm" id="in_mshercheck">Opnieuw controleren</button>`;
  const opnieuwVerbinden = `<button class="btn sm" id="in_msopnieuw">Opnieuw verbinden</button>`;
  const verlopen = `<div class="note warn">De koppeling zegt hierboven "verbonden", maar Microsoft accepteert
      de aanmelding niet meer — die verloopt na een tijd vanzelf. Klik op <b>Opnieuw verbinden</b> en meld je
      opnieuw aan met je @ploeggenoten.nl-account. Je hoeft niets opnieuw in te stellen en er gaat niets verloren.</div>
    <div class="row tight in-msknoppen">${opnieuwVerbinden}${hercheck}</div>`;

  const uit = msUitslag;
  if(!uit){
    lijst.querySelectorAll('[data-ms]').forEach(r => msZetVink(r, null));
    vak.innerHTML = verlopen;
  }else{
    let mis = 0;
    lijst.querySelectorAll('[data-ms]').forEach(r => {
      const ok = !!uit[r.dataset.ms];
      if(!ok) mis++;
      msZetVink(r, ok);
    });
    if(!uit.agenda){
      /* Agenda draait op de machtiging die bij het inloggen altijd wordt
         toegekend. Doet juist die het niet, dan is niet de machtiging het
         probleem maar de aanmelding zelf — en dan is "vraag de beheerder om
         een machtiging" precies het verkeerde advies. */
      vak.innerHTML = verlopen;
    }else if(mis){
      vak.innerHTML = `<div class="note info"><b>${mis} van de ${MS_ONDERDELEN.length} onderdelen doet het nog niet.</b>
          De rest werkt gewoon door. Bij elk grijs onderdeel hierboven staat wat je daardoor mist.
          Dit lost een beheerder op door in Microsoft-beheer (Entra) de bijbehorende toestemming aan te zetten;
          daarna verbreek je hier de koppeling één keer en verbind je opnieuw.</div>
        <div class="row tight in-msknoppen">${hercheck}</div>`;
    }else{
      vak.innerHTML = `<div class="note ok">Alle ${MS_ONDERDELEN.length} onderdelen doen het.</div>
        <div class="row tight in-msknoppen">${hercheck}</div>`;
    }
  }

  /* De Teams-schakelaar mag niet doen alsof hij iets regelt als Teams zelf
     nog niet werkt. */
  const hint = mount.querySelector('#in_teamshint');
  if(hint) hint.textContent = (uit && !uit.teams) || !uit
    ? 'Let op: Teams-berichten werken op dit moment niet — zie hierboven. Deze schakelaar heeft dus nog geen effect.' : '';

  const her = vak.querySelector('#in_mshercheck');
  if(her) her.onclick = () => msZelftest(mount, true);
  const opn = vak.querySelector('#in_msopnieuw');
  if(opn) opn.onclick = async () => {
    opn.disabled = true;
    const ok = await CRM.outlook.verbind();
    opn.disabled = false;
    msUitslag = null; msUitslagOp = 0;
    if(ok) CRM.render();
  };
}

/* ─── Outlook-contacten: alles in één keer synchroniseren ─────────
   Rustig aan, één voor één met een korte pauze: Microsoft knijpt bij
   bulkwerk de kraan dicht. Gaat het toch mis, dan stoppen we netjes
   met een melding in plaats van door te blijven proberen. */
const pauzeMs = ms => new Promise(r => setTimeout(r, ms));
let syncBezig = false;

function sectieContacten(){
  if(!msVerbonden()) return '';
  const alle = CRM.state.contacten || [];
  const bruikbaar = alle.filter(c => String(c.email||'').trim() || String(c.telefoon||'').trim());
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Outlook-contacten</div>
      <div class="spacer"></div><span class="meta"><span class="num">${bruikbaar.length}</span> van <span class="num">${alle.length}</span> met gegevens</span></div>
    <div class="card-b">
      <p class="sub" style="margin:0 0 12px">Zet alle contactpersonen uit het CRM in je eigen Outlook-adresboek.
        Belt iemand je, dan laat je telefoon meteen zien wie het is en van welk bedrijf.
        Bestaat het contact al, dan wordt het bijgewerkt — er komt niets dubbel te staan.</p>
      <div class="row"><button class="btn" id="in_ctsync">Alle contactpersonen synchroniseren</button></div>
      <div id="in_ctstatus" style="margin-top:12px"></div>
    </div></div>`;
}

async function syncContacten(knop, statusEl){
  if(syncBezig) return;
  const alle = CRM.state.contacten || [];
  const doen = alle.filter(c => String(c.email||'').trim() || String(c.telefoon||'').trim());
  const zonder = alle.length - doen.length;
  if(!doen.length){
    statusEl.innerHTML = '<div class="note info">Geen contactpersonen met een e-mailadres of telefoonnummer.</div>';
    return;
  }
  syncBezig = true;
  const oud = knop.textContent;
  knop.disabled = true; knop.textContent = 'Bezig…';
  let nieuw = 0, bij = 0, mislukt = 0, achterElkaar = 0, gestopt = '', gedaan = 0;
  try{
    for(let i = 0; i < doen.length; i++){
      const c = doen[i];
      statusEl.innerHTML = `<div class="note info">Bezig: <span class="num">${i+1}</span> van
        <span class="num">${doen.length}</span> — ${h(c.naam || 'zonder naam')}</div>`;
      let r = null;
      try{
        r = await CRM.outlook.zetContact({naam:c.naam, email:c.email, telefoon:c.telefoon,
                                          bedrijf:c.klant, functie:c.functie});
      }catch(e){
        console.warn('contacten synchroniseren', e);
        gestopt = 'onverwacht'; break;
      }
      gedaan++;
      if(r && r.nieuw){ nieuw++; achterElkaar = 0; }
      else if(r){ bij++; achterElkaar = 0; }
      else {
        mislukt++; achterElkaar++;
        if(achterElkaar >= 3){ gestopt = 'reeks'; break; }
      }
      await pauzeMs(180);
    }
  }finally{
    /* Zonder finally blijft de vlag bij een onverwachte fout op 'bezig'
       staan en doet de knop de rest van de sessie niets meer. */
    syncBezig = false;
    knop.disabled = false; knop.textContent = oud;
  }
  const delen = [
    `<span class="num">${nieuw}</span> nieuw`,
    `<span class="num">${bij}</span> bijgewerkt`,
    mislukt ? `<span class="num">${mislukt}</span> mislukt` : '',
    zonder ? `<span class="num">${zonder}</span> overgeslagen zonder gegevens` : ''
  ].filter(Boolean).join(' · ');
  /* Waaróm het stokte weten we niet precies — Outlook geeft bij een mislukte
     contactpersoon geen reden terug. Dan noemen we de twee oorzaken die het
     in de praktijk altijd zijn, met wat je eraan doet. */
  statusEl.innerHTML = gestopt
    ? `<div class="note warn">Gestopt na <span class="num">${gedaan}</span> van
        <span class="num">${doen.length}</span> contactpersonen. Tot dan: ${delen}.<br>
        Dat komt bijna altijd doordat Microsoft bij veel adresboekwijzigingen achter elkaar even de kraan
        dichtknijpt, of doordat de Microsoft-koppeling verlopen is. Wacht een paar minuten en start opnieuw —
        wat al gedaan is wordt niet dubbel aangemaakt. Blijft het misgaan, controleer dan hierboven of
        <b>Contacten</b> nog een vinkje heeft.</div>`
    : `<div class="note ok">Klaar: ${delen}.</div>`;
}

/* ─── Export / import (bord-compatibel JSON) ──────────────────── */
function exportJson(){
  const st = CRM.state;
  const targets = {}; let dflt = 8;
  st.targets.forEach(t => {
    if(DEFAULT_KEYS.includes(t.maand)) dflt = t.aantal;
    else targets[t.maand] = t.aantal;
  });
  const data = {
    app:'ploeggenoten-crm', geexporteerd_op:new Date().toISOString(),
    /* Bord-compatibel blok: het oude pijplijnbord kan dit bestand importeren. */
    cands: st.cands.map(CRM.rowToCand),
    clients: st.clients.map(c => ({naam:c.naam, contact:c.contact||'', locatie:c.locatie||''})),
    vacs: st.vacs.map(v => [v.klant, v.functie, v.type||'', v.aangemaakt||null]),
    sessions: st.ooSessions||[],
    targets, target:{maand:dflt},
    /* CRM-eigen data (het bord negeert dit blok). */
    crm: {leads:st.leads, activiteiten:st.activiteiten, taken:st.taken,
          documenten:st.documenten, kansen:st.kansen, contacten:st.contacten}
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ploeggenoten-crm-' + CRM.todayISO() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  CRM.toast('Export gedownload','ok');
}

async function importJson(file, statusEl){
  let d;
  try{ d = JSON.parse(await file.text()); }
  catch(e){ statusEl.innerHTML = '<div class="note err">Dit is geen geldig JSON-bestand.</div>'; return; }
  if(!d || !Array.isArray(d.cands) || !Array.isArray(d.vacs)){
    statusEl.innerHTML = '<div class="note err">Onbekend formaat — verwacht een export van het bord of van dit CRM (met cands en vacs).</div>';
    return;
  }
  /* Deze knop gooit tabellen leeg. De vraag moet dus niet alleen zeggen wát
     er gebeurt maar ook dat het niet terug te draaien is, en wat je vooraf
     doet om er wél mee terug te kunnen. */
  const ja = await CRM.bevestig('Bord-data vervangen?',
    `Dit WIST de huidige kandidaten, klanten, vacatures, O&O-sessies en targets en zet er ${d.cands.length} kandidaten uit dit bestand voor in de plaats. `
    + 'Dat is niet ongedaan te maken — download eerst een export als je terug wilt kunnen. '
    + 'Leads en overige CRM-data blijven staan.');
  if(!ja) return;
  statusEl.innerHTML = '<div class="note info">Bezig met importeren…</div>';
  const candRows = d.cands.map(c => CRM.candToRow(Object.assign({since:CRM.todayISO()}, c)));
  const clientRows = (d.clients||[]).map(c => ({naam:c.naam, contact:c.contact||'', locatie:c.locatie||''}));
  const vacRows = d.vacs.map(v => Array.isArray(v)
    ? {klant:v[0], functie:v[1], type:v[2]||'', aangemaakt:v[3]||null}
    : {klant:v.klant, functie:v.functie, type:v.type||'', aangemaakt:v.aangemaakt||null});
  const sessRows = (d.sessions||[]).map(s => ({id:s.id, klant:s.klant, functie:s.functie, datum:s.datum, locatie:s.locatie||''}));
  /* Per maand één regel: 'maand' is de primaire sleutel, dus een bestand met
     een dubbele maand (of met __default__ in het targets-blok) liet de hele
     import halverwege klappen — met de tabellen al leeggegooid. */
  const perMaand = new Map();
  Object.entries(d.targets||{}).forEach(([maand,aantal]) => perMaand.set(maand, {maand, aantal:Number(aantal)||0}));
  const dflt = d.target && d.target.maand != null ? Number(d.target.maand)||0 : 8;
  DEFAULT_KEYS.forEach(k => perMaand.set(k, {maand:k, aantal:dflt}));
  const targetRows = [...perMaand.values()];

  /* De melding moet een toast zijn, geen blokje in de kaart: direct na een
     geslaagde import hertekent het scherm, en dan is dat blokje al weg vóór
     je het gelezen hebt. Je zag dus nooit een bevestiging. */
  const gelukt = tekst => { CRM.toast(tekst, 'ok'); statusEl.innerHTML = ''; };

  if(CRM.demo){
    Object.assign(CRM.state, {cands:candRows, clients:clientRows, vacs:vacRows, ooSessions:sessRows, targets:targetRows});
    gelukt(`Import geladen: ${candRows.length} kandidaten (demo — alleen in het geheugen)`);
    CRM.render(); return;
  }
  try{
    await Promise.all([
      CRM.sb.from('candidates').delete().neq('id','__never__'),
      CRM.sb.from('clients').delete().neq('naam','__never__'),
      CRM.sb.from('vacatures').delete().neq('klant','__never__'),
      CRM.sb.from('oo_sessions').delete().neq('id','__never__'),
      CRM.sb.from('targets').delete().neq('maand','__never__')
    ]);
    const stap = async (tabel, rijen) => {
      if(!rijen.length) return;
      const {error} = await CRM.sb.from(tabel).insert(rijen);
      if(error) throw new Error(tabel + ': ' + error.message);
    };
    await stap('candidates', candRows);
    await stap('clients', clientRows);
    await stap('vacatures', vacRows);
    await stap('oo_sessions', sessRows);
    await stap('targets', targetRows);
    gelukt(`Import geslaagd: ${candRows.length} kandidaten, ${clientRows.length} klanten, ${vacRows.length} vacatures`);
    await CRM.herlaad();
  }catch(e){
    /* Hier hertekent het scherm niet, dus dit blijft wél staan — en dat moet
       ook: de tabellen zijn al leeggegooid voordat het invoegen begon. */
    statusEl.innerHTML = `<div class="note err"><b>Import mislukt.</b> ${h(e.message)}<br>
      De oude bord-data is al gewist en de nieuwe is er niet (helemaal) in gekomen.
      Controleer de database voordat je verder werkt, of importeer het bestand opnieuw.</div>`;
    console.error('import', e);
  }
}

function sectieData(){
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Export en import</div></div>
    <div class="card-b">
      <p class="sub" style="margin:0 0 12px">De export bevat alle bord-data (kandidaten, klanten, vacatures, O&amp;O-sessies,
        targets) in het formaat dat ook het oude pijplijnbord kan inlezen, plus de CRM-data als extra blok.
        Import vervangt alleen de bord-data.</p>
      <div class="row">
        <button class="btn" id="in_export">Export JSON downloaden</button>
        <label class="btn ghost" style="cursor:pointer">Import JSON…
          <input type="file" id="in_import" accept=".json,application/json" style="display:none"></label>
      </div>
      <div id="in_impstatus" style="margin-top:12px"></div>
    </div></div>`;
}

/* ─── Systeem: welke tabellen zijn bereikbaar ─────────────────── */
const TABELLEN = [
  ['candidates','Kandidaten (bord)'], ['clients','Klanten (bord)'], ['vacatures','Vacatures (bord)'],
  ['targets','Targets (bord)'], ['oo_sessions','O&O-sessies (bord)'], ['profiles','Profielen'],
  ['crm_leads','Leads'], ['crm_activiteiten','Activiteiten'], ['crm_taken','Taken'],
  ['crm_documenten','Documenten'], ['crm_kansen','Kansen'], ['crm_contacten','Contacten'], ['crm_meldingen','Meldingen']
];
function sectieSysteem(){
  /* In demo laadt het CRM helemaal niets uit Supabase. "Bereikbaar" zou dan
     een gok zijn die er als een controle uitziet — dus zeggen we het eerlijk. */
  const rij = ([tabel, lbl]) => {
    const naam = `<span>${h(lbl)} <span class="meta num">${h(tabel)}</span></span>`;
    if(CRM.demo) return `<div class="in-sysrij">${naam}<span class="chip">niet gecontroleerd</span></div>`;
    const mist = !!CRM.state['_mist_'+tabel];
    return `<div class="in-sysrij">${naam}
      <span class="chip ${mist?'red':'green'}">${mist?'ontbreekt':'bereikbaar'}</span></div>`;
  };
  return `<div class="card" style="margin-top:20px"><div class="card-h"><div class="h2">Systeem</div>
      <div class="spacer"></div><span class="meta">${CRM.demo?'demo-modus — database wordt niet aangeraakt':'live database'}</span></div>
    <div class="card-b">
      <div class="in-sys">${TABELLEN.map(rij).join('')}</div>
      <p class="meta" style="margin:12px 2px 0">${CRM.demo
        ? 'In demo-modus wordt de database niet benaderd, dus kunnen we hier niets over zeggen. Log in op de echte omgeving om dit te controleren.'
        : 'Ontbreekt er een crm_-tabel, draai dan supabase/schema.sql in de SQL-editor. De bord-tabellen zijn gedeeld met het oude pijplijnbord en de finance-app.'}</p>
    </div></div>`;
}

/* ─── Botformulieren → vacature ──────────────────────────────────
   Eén Meta-leadformulier = één vacature. De koppeltabel lead_formulieren
   (in onze eigen database) bepaalt aan welke vacature een botlead
   automatisch hangt, en wint altijd van de vacancy_id die de bot
   meelevert. Dit scherm bestaat zodat dat koppelen zonder SQL Editor of
   n8n kan (Tjeerd, 1 sep 2026 — Smit stelde een rechtstreekse koppeling
   met zíjn database voor; dit is de variant waarbij niets van buiten in
   ons CRM hoeft). Elk formulier dat ooit in een lead voorbijkwam staat
   hier vanzelf klaar, met de campagnenaam als geheugensteun. */
function sectieFormulieren(){
  return `<div class="card"><div class="card-h"><div class="h2">Botformulieren → vacature</div></div>
    <div class="card-b">
      <p class="sub" style="margin:0 0 10px">Eén Meta-formulier werft voor één vacature. Koppel ze hier, dan hangt
        elke botlead van dat formulier automatisch aan de juiste vacature — en klopt de meting per campagne.</p>
      <div id="in_forms">${CRM.ui.laden('Formulieren laden…')}</div>
    </div></div>`;
}
async function vulFormulieren(mount){
  const el = mount.querySelector('#in_forms');
  if(!el) return;
  if(CRM.demo){ el.innerHTML = `<p class="meta">In demo-modus wordt de database niet benaderd — hier staan straks de Meta-formulieren van de bot.</p>`; return; }
  const {data, error} = await CRM.sb.from('lead_formulieren').select('*');
  if(error){ el.innerHTML = `<div class="note err">De koppeltabel is niet leesbaar — is lead-inbox-setup.sql gedraaid? (${h(error.message)})</div>`; return; }
  const rijen = new Map((data||[]).map(r => [String(r.form_id), r]));
  /* Formulieren die al in echte leads voorbijkwamen maar nog geen rij
     hebben, alvast klaarzetten — zo hoeft niemand form_id's over te typen. */
  const gezien = new Map();
  for(const l of (CRM.state.leads||[])){
    const f = String(l.form_id||'').trim();
    if(!f) continue;
    if(!gezien.has(f)) gezien.set(f, {campagne:String(l.campagne||''), n:0});
    gezien.get(f).n++;
  }
  for(const [f, info] of gezien)
    if(!rijen.has(f)) rijen.set(f, {form_id:f, vacature_id:'', omschrijving:info.campagne, _nieuw:true});
  if(!rijen.size){ el.innerHTML = `<p class="meta">Nog geen formulieren gezien — zodra er botleads binnenkomen staan ze hier klaar om te koppelen.</p>`; return; }
  const vacs = (CRM.state.vacs||[]).filter(v => (v.status||'Open') === 'Open');
  const optie = (v, huidig) => `<option value="${h(String(v.id))}" ${String(huidig)===String(v.id)?'selected':''}>${h((v.functie||'?') + ' · ' + (v.klant||'?'))}</option>`;
  el.innerHTML = `<div class="tblwrap"><table class="tbl">
    <thead><tr><th>Formulier</th><th>Campagne / omschrijving</th><th>Vacature</th></tr></thead>
    <tbody>${[...rijen.values()].map(r => `<tr>
      <td class="num">${h(String(r.form_id))}</td>
      <td>${h(r.omschrijving||'—')}${gezien.has(String(r.form_id))
        ? ` <span class="meta">· <span class="num">${gezien.get(String(r.form_id)).n}</span> lead${gezien.get(String(r.form_id)).n===1?'':'s'}</span>` : ''}</td>
      <td><select data-form="${h(String(r.form_id))}">
        <option value="">— nog niet gekoppeld —</option>
        ${vacs.map(v => optie(v, r.vacature_id)).join('')}
      </select></td>
    </tr>`).join('')}</tbody></table></div>`;
  CRM.$$('[data-form]', el).forEach(sel => sel.onchange = async () => {
    const r = rijen.get(String(sel.dataset.form)) || {omschrijving:''};
    const {error:e2} = await CRM.sb.from('lead_formulieren').upsert(
      {form_id:String(sel.dataset.form), vacature_id:sel.value, omschrijving:r.omschrijving||''});
    if(e2) return CRM.fout('Koppeling opslaan mislukt', e2);
    CRM.toast(sel.value
      ? 'Gekoppeld — nieuwe leads van dit formulier hangen nu automatisch aan die vacature'
      : 'Koppeling weggehaald', 'ok');
  });
}

/* ─── Module ──────────────────────────────────────────────────── */
/* Dit scherm stond op adminOnly, en daardoor kon niemand behalve Tjeerd erbij.
   Dat werkte zolang hij de enige gebruiker was, maar het blokkeert het team:
   de Microsoft-koppeling is per persoon — je verbindt je eigen postbus en je
   eigen agenda — en die knop zat hier. Zonder toegang kregen Tjerk, Rajesh en
   Bryan dus nooit hun agenda, mail of Teams-links in het CRM, en was er geen
   plek om dat op te lossen.

   Nu is het scherm voor iedereen bereikbaar en zitten de poortwachters per
   sectie. Wat je eigen account betreft mag je zelf; wat het bedrijf betreft
   is voor de eigenaar. (3 aug 2026, bij het openzetten voor het team.) */
CRM.registerModule('instellingen', {
  title:'Instellingen', icon:'⚙',
  onderschrift:'Je koppelingen en — voor de eigenaar — targets, team en systeem',
  render(mount){
    /* Alleen de eigenaar ziet targets, teambeheer, export en de systeemcheck.
       De Microsoft-koppeling en de contactensynchronisatie horen bij jóuw
       account en staan er voor iedereen. */
    const baas = CRM.canSeeMoney();
    const eigen = sectieMicrosoft() + sectieContacten();
    /* sectieMicrosoft() geeft niets terug zolang de Outlook-koppeling niet is
       ingericht (msKlaar). Voor de eigenaar valt dat niet op — die heeft nog
       vier andere secties. Voor een teamlid is dit het hele scherm, en dan
       sta je naar een lege pagina te kijken zonder te weten of er iets stuk
       is. Liever uitleggen wat er aan de hand is. */
    const leeg = !baas && !eigen.trim();
    mount.innerHTML = `<div class="in-wrap">${
      baas ? sectieTargets() + sectieTeam() : ''
    }${eigen}${
      baas ? sectieFormulieren() + sectieData() + sectieSysteem() : ''
    }${leeg ? `<div class="card"><div class="card-b">${CRM.ui.leeg(
      'Hier valt voor jou nog niets in te stellen',
      'De Microsoft-koppeling — je eigen agenda, mail en Teams-links in het CRM — is nog niet ingericht voor deze omgeving. Vraag Tjeerd om dat aan te zetten; daarna kun je hier je eigen account verbinden.'
    )}</div></div>` : ''}</div>`;
    if(baas) vulFormulieren(mount);
    CRM.$$('[data-target]', mount).forEach(inp => inp.onchange = async () => {
      const v = Math.max(0, +inp.value || 0);
      await zetTarget(inp.dataset.target, v);
      werkTargetsBij(mount);                         // alleen de cellen, focus blijft staan
    });
    /* Bij elke keuzelijst: eerst in het geheugen, en bij een mislukte
       opslag terug naar de oude waarde. Anders staat er op het scherm een
       rol die in de database nooit is aangekomen. */
    const label = (paren, k) => (paren.find(([x]) => x === k) || [k, k])[1];
    CRM.$$('[data-functie]', mount).forEach(sel => sel.onchange = async () => {
      const p = (CRM.state.profiles||[]).find(x => String(x.id) === String(sel.dataset.functie));
      if(!p) return;
      const vorig = p.functie || 'am';
      p.functie = sel.value;
      if(!CRM.demo){
        const {error} = await CRM.sb.from('profiles').update({functie:sel.value}).eq('id', p.id);
        if(error){
          p.functie = vorig; sel.value = vorig;
          return CRM.fout('Functie opslaan mislukt — de oude waarde blijft staan', error);
        }
      }
      CRM.toast(`Functie van ${p.naam||'gebruiker'} → ${label(FUNCTIES, sel.value)}`, 'ok');
    });
    CRM.$$('[data-rol]', mount).forEach(sel => sel.onchange = async () => {
      const p = (CRM.state.profiles||[]).find(x => String(x.id) === String(sel.dataset.rol));
      if(!p) return;
      const vorig = p.rol || '';
      p.rol = sel.value;
      if(!CRM.demo){
        const {error} = await CRM.sb.from('profiles').update({rol:sel.value}).eq('id', p.id);
        if(error){
          p.rol = vorig; sel.value = vorig;
          return CRM.fout('Rol opslaan mislukt — de oude waarde blijft staan', error);
        }
      }
      CRM.toast(`Rol van ${p.naam||'gebruiker'} → ${label(ROLLEN, sel.value)}`, 'ok');
    });
    /* Werk-e-mailadres: de enige weg waarlangs een Teams-melding zijn
       bestemming vindt (core.js zoekt het profiel op naam en pakt .email). */
    CRM.$$('[data-email]', mount).forEach(inp => inp.onchange = async () => {
      const p = (CRM.state.profiles||[]).find(x => String(x.id) === String(inp.dataset.email));
      if(!p) return;
      const adres = inp.value.trim();
      const vorig = String(p.email||'').trim();
      if(adres === vorig) return;
      if(adres && !mailOk(adres)){
        CRM.toast('Dat lijkt geen geldig e-mailadres — bijvoorbeeld bryan@ploeggenoten.nl', 'err');
        inp.value = vorig; inp.focus(); return;
      }
      p.email = adres;
      if(!CRM.demo){
        const {error} = await CRM.sb.from('profiles').update({email:adres}).eq('id', p.id);
        if(error){
          p.email = vorig; inp.value = vorig;
          return CRM.fout('E-mailadres opslaan mislukt — het oude adres blijft staan', error);
        }
      }
      CRM.toast(adres
        ? `Teams-meldingen voor ${p.naam||'deze collega'} gaan nu naar ${adres}`
        : `${p.naam||'Deze collega'} krijgt nu geen Teams-meldingen meer`, 'ok');
      /* Alleen de markering en het waarschuwingsblok bijwerken; een volledige
         hertekening zou je uit de rij e-mailvelden gooien. */
      inp.classList.toggle('leeg', !adres);
      const waarsch = mount.querySelector('#in_teamwaarsch');
      if(waarsch) waarsch.innerHTML = teamWaarschuwingHtml();
    });
    /* ─── Microsoft-koppeling ───────────────────────────────── */
    const msAan = mount.querySelector('#in_msaan');
    if(msAan) msAan.onclick = async () => {
      const hulp = mount.querySelector('#in_mshulp');
      if(hulp) hulp.innerHTML = '';
      msAan.disabled = true;
      const ok = await CRM.outlook.verbind();
      msAan.disabled = false;
      msUitslag = null; msUitslagOp = 0;
      if(ok){ CRM.render(); return; }
      /* De koppeling geeft alleen een technische melding in een toast, en die
         is weg voor je hem gelezen hebt. Dit blijft staan en noemt de drie
         oorzaken die het in de praktijk altijd zijn. */
      if(hulp) hulp.innerHTML = `<div class="note warn" style="margin-top:14px">
        <b>Verbinden is niet gelukt.</b> Bijna altijd is het één van deze drie:
        <br>· het aanmeldvenster van Microsoft werd geblokkeerd of weggeklikt — sta pop-ups toe voor deze pagina en probeer het nog eens;
        <br>· je meldde je aan met een privé-Microsoft-account in plaats van je <span class="num">@ploeggenoten.nl</span>-account;
        <br>· dit account is nog niet goedgekeurd voor de CRM-app — dat zet een beheerder één keer goed in Microsoft-beheer.
        <br><span class="meta">De technische melding stond in de melding onderin het scherm en staat in de console.</span></div>`;
    };
    const msUit = mount.querySelector('#in_msuit');
    if(msUit) msUit.onclick = async () => {
      if(!await CRM.bevestig('Koppeling verbreken?',
        'Agenda, mail, contacten en documenten verdwijnen dan uit het CRM. Je kunt altijd opnieuw verbinden.')) return;
      await CRM.outlook.verbreek();
      msUitslag = null; msUitslagOp = 0;
      CRM.render();
    };
    const teamsBox = mount.querySelector('#in_teamsuit');
    if(teamsBox) teamsBox.onchange = () => {
      try{
        if(teamsBox.checked) localStorage.removeItem('crm_teams_uit');
        else localStorage.setItem('crm_teams_uit','1');
      }catch(e){ console.warn('teams-vlag', e); }
      CRM.toast(teamsBox.checked ? 'Teams-meldingen staan aan' : 'Teams-meldingen staan uit','ok');
    };
    if(mount.querySelector('#in_mslijst')) msZelftest(mount);

    /* ─── Outlook-contacten ─────────────────────────────────── */
    const ctSync = mount.querySelector('#in_ctsync');
    if(ctSync) ctSync.onclick = () => syncContacten(ctSync, mount.querySelector('#in_ctstatus'));

    /* Export en import staan in een sectie die alleen de eigenaar ziet. Zonder
       deze controle gooide de hele module een TypeError zodra een teamlid het
       scherm opende — en dan zie je niet "geen toegang" maar een foutmelding
       over de hele pagina. */
    const exp = mount.querySelector('#in_export');
    if(exp) exp.onclick = exportJson;
    const imp = mount.querySelector('#in_import');
    if(imp) imp.onchange = e => {
      const f = e.target.files && e.target.files[0];
      if(f) importJson(f, mount.querySelector('#in_impstatus'));
      e.target.value = '';
    };
  }
});
})();
