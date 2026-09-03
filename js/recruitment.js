/* ═══════════════════════════════════════════════════════════════
   MODULE: RECRUITMENT — DE RECRUITMENTPIJPLIJN EN DE UITVAL
   Twee tabbladen:
     A. Recruitmentpijplijn — van binnenkomst tot en met de videocall
        (tabel crm_leads), als bord óf als lijst
     B. Uitval — afgevallen/gestopt, heraanbieden en vervanging

   Sinds 31 juli 2026 is de keten in tweeën geknipt, met de overdracht
   bij 'Voorgesteld' (zie de toelichting bovenaan js/data.js):

     RECRUITMENTPIJPLIJN (dit bestand) — crm_leads, hoog volume, draait
       om snelheid. De laatste stap maakt er een kandidaat van, die op
       fase 'Intake' klaarstaat om voorgesteld te worden.
     KLANTTRAJECTEN (js/pijplijn.js) — candidates vanaf 'Voorgesteld',
       laag volume, draait om diepte.

   Waar het hier om gaat: alles wat op Nieuw staat moet weg. Niet naar
   een oordeel toe, maar naar een vólgende status — ook "geen gehoor"
   is vooruitgang, want dan weet je dat er gebeld is.

   De gedeelde bewerk-drawer en fasewissel-poortwachters leven hier
   en zijn beschikbaar als CRM.kandidaatBewerk / CRM.kandidaatFase;
   overige gedeelde bord-logica via CRM._rcDeel (onderaan).
   Doel blijft: geen vervuiling. Een sollicitant komt ALTIJD binnen
   op status 'Nieuw' en wordt pas kandidaat als de gegevens compleet zijn.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;

/* ─── Modulestatus (blijft bewaard tussen renders) ─────────────── */
const S = {
  tab:'leads',
  /* `eig` is het eigenaarfilter: '' = iedereen, een genormaliseerde naam
     (CRM.naamNorm, dus Bryan→Rajesh), of EIG_GEEN voor leads zonder eigenaar.
     De oude losse vlag `mijn` is hierin opgegaan — één bron van waarheid, de
     "Van mij"-knop is nog slechts de sneltoets die dit veld op jezelf zet
     (zie vulEigSelect voor het waarom). */
  l:{q:'', status:'', bot:'', bron:'', vac:'', klant:'', eig:'', zvac:false, stil:false},
  /* Render-rust (motorkap-punt 15): zolang de wegwerkronde open staat
     hertekent de lijst niet mee met realtime-syncs — dat verspringt onder
     je handen. Bij het sluiten van de ronde volgt één verse hertekening. */
  wwOpen:false, wwHerteken:false,
  u:{f:'alles'},
  /* Aangevinkte sollicitanten in de lijst. Leeg zodra er een filter verandert:
     een selectie die deels buiten beeld staat en tóch meedoet met "zet alles op
     Potentieel" is precies het soort verrassing dat je niet wilt. */
  sel:new Set()
};
const wisSelectie = () => { S.sel = new Set(); };

/* ─── Bord of lijst ───────────────────────────────────────────────
   Allebei, omdat het werk twee vormen heeft. Wie een middag afbelt wil
   een lijst: veel regels tegelijk, telefoonnummers onder elkaar, en in
   één oogopslag wie er het langst ligt. Wie stuurt wil een bord: waar
   stapelt het op, waar komt niemand meer aan toe.

   De LIJST is de standaard. De pijplijn heeft zeven werkstatussen en er
   komen honderden reacties per week binnen; zeven kolommen van vijftig
   kaarten is geen overzicht maar behang, en de eerste vraag van de dag
   ("wie moet ik nu bellen") beantwoordt een lijst nu eenmaal sneller.
   Het bord is één klik weg en die keuze blijft bewaard — dus wie liever
   op het bord werkt, krijgt het bord ook morgen weer. */
const WEERGAVE_KEY = 'crm_rc_weergave';
const weergave    = () => { try{ return localStorage.getItem(WEERGAVE_KEY) === 'bord' ? 'bord' : 'lijst'; }catch(e){ return 'lijst'; } };
const zetWeergave = v => { try{ localStorage.setItem(WEERGAVE_KEY, v); }catch(e){} };

/* ─── Hoe lang ligt iets er al? ───────────────────────────────────
   Een lead reageert op een advertentie die diezelfde dag voorbijkwam.
   De kans dat je iemand nog aan de lijn krijgt zakt per dag: dag één is
   normaal, daarna word je één van de bureaus die "ook nog belde".
   Twee grenzen, bewust ruim uit elkaar zodat het verschil betekenis heeft:

     vanaf 1 dag   — let op: de dag van binnenkomst is voorbij
     vanaf 3 dagen — te lang: er is een weekend overheen gegaan en de
                     meesten hebben inmiddels ergens anders iets

   Kalenderdagen, geen werkdagen. Een sollicitant die vrijdagavond
   reageert en maandag pas wordt gebeld heeft drie dagen gewacht — dat
   het bureau dicht was verandert daar niets aan.
   Beide grenzen staan hier als getal, zodat ze op één plek te verzetten zijn. */
const NIEUW_LETOP  = 1;
const NIEUW_TELANG = 3;
const leadDagen     = l => CRM.dagenGeleden(l && l.binnen_op);
const ouderdomKlas  = n => n == null ? '' : n >= NIEUW_TELANG ? 'red' : n >= NIEUW_LETOP ? 'amber' : '';

/* ─── Elke status kan een stille wachtkamer worden ────────────────
   'Nieuw' had als enige een grens. Maar iemand kan op elke plek blijven
   hangen: een tweede belpoging die er nooit kwam, een kans waar niemand
   meer iets mee deed, een intake die is geweest zonder dat er een
   kandidaatkaart kwam. Wie alleen op 'Nieuw' stuurt, ziet een leeg
   beginvak en denkt dat het goed gaat terwijl er dertig mensen halverwege
   stilstaan.

   Per status een eigen grens, want ze betekenen niet hetzelfde. De regel
   erachter is steeds: hoe lang mag de sollicitant hier op ons wachten
   zonder dat hij afhaakt of denkt dat hij is vergeten? Bewust streng —
   dit is de kant van het werk waar snelheid het verschil maakt.

     dagen  = vanaf hier staat het te lang stil (amber)
     dubbel = het dubbele daarvan is rood: dan is het geen vertraging meer
     waarom = waaróm die grens; staat in de tooltip, zodat niemand hoeft te
              raden of een getal ooit ergens op gebaseerd was

   Waar de klok begint verschilt: op 'Nieuw' telt de binnenkomst (er is nog
   nooit iets mee gedaan), bij een ingeplande intake telt de afspraakdatum
   zelf (opvolgen_op), en verder telt `laatst_actie` — dat veld wordt bij
   elke statuswissel en elke notitie bijgewerkt en is dus het moment waarop
   hier voor het laatst iets aan gedaan is.

   Tjeerd, 27 aug 2026: herschreven voor de vijf statussen. De sleutels
   zijn de génormaliseerde namen; elke opzoeking loopt via CRM.leadNorm,
   zodat een rij die nog op een oude status staat dezelfde grens krijgt. */
const STATUS_NORM = {
  'Nieuw': {dagen:NIEUW_TELANG, doe:'ligt te lang — bel die eerst',
    waarom:'Er is nog niet gebeld. Na drie dagen is er een weekend overheen en heeft de sollicitant meestal ergens anders iets.'},
  'Geen gehoor': {dagen:1, doe:'wacht op een tweede poging',
    waarom:'Eén gemiste poging zegt niets. Een tweede hoort dezelfde of de volgende dag te volgen, op een ánder tijdstip — anders bel je eeuwig tijdens dezelfde dienst.'},
  'Potentieel': {dagen:2, doe:'wacht op een vervolgstap',
    waarom:'Je hebt iemand aan de lijn gehad die wil. Dan is twee dagen stilte het punt waarop diegene denkt dat het niet doorgaat.'},
  'Intake ingepland': {dagen:1, opAfspraak:true, doe:'intake zonder uitkomst of datum',
    waarom:'De afspraakdatum is voorbij en er is geen kandidaatkaart gemaakt en geen andere uitkomst vastgelegd. Dan weet niemand of het gesprek überhaupt is geweest.',
    label:d => d === 1 ? 'intake was gisteren' : 'intake was ' + d + ' dagen geleden'}
};

/* Waarop wacht deze lead, en hoe lang al? Null als het niet te meten is. */
function wachtDagen(l){
  if(!l) return null;
  if(CRM.leadIs(l.status, 'Nieuw')) return leadDagen(l);
  const norm = STATUS_NORM[CRM.leadNorm(l.status)];
  if(norm && norm.opAfspraak && l.opvolgen_op) return CRM.dagenGeleden(l.opvolgen_op);
  return CRM.dagenGeleden(l.laatst_actie || l.binnen_op);
}

/* Eén oordeel per lead: staat dit stil, en waarom is dát te lang?
   Geeft null terug (niets aan de hand) of {dagen, label, waarom, klas}.
   Wordt op de rij, op de bordkaart, in de belronde én in de wachtkamerregel
   gebruikt, zodat al die plekken gegarandeerd hetzelfde zeggen. */
function stilstand(l){
  if(!l || !CRM.leadIn(l.status, CRM.LEAD_OPEN)) return null;
  const norm = STATUS_NORM[CRM.leadNorm(l.status)];
  if(!norm) return null;
  /* "Ingepland" zonder datum is geen vertraging maar een gat: er ís geen
     afspraak om na te komen. Meteen melden, ongeacht de klok. */
  if(norm.opAfspraak && !l.opvolgen_op)
    return {dagen:null, label:'zonder datum', klas:'red',
            waarom:'De status zegt dat er een intake staat, maar nergens staat wanneer. Dan bevestigt niemand die afspraak en komt er ook niemand opdagen.'};
  const d = wachtDagen(l);
  if(d == null || d < norm.dagen) return null;
  return {dagen:d, klas: d >= norm.dagen * 2 ? 'red' : 'amber', waarom:norm.waarom,
          label: norm.label ? norm.label(d) : d + ' dag' + (d === 1 ? '' : 'en') + ' stil'};
}

const GESPREK_FASES = ['O&O sessie','Eerste gesprek','Tweede gesprek','Meeloopdag'];
const CONTRACT_FASES = ['Contract ondertekenen','Contract getekend','Gestart'];
const UITVAL = ['Afgevallen','Gestopt'];
const KAND_BRONNEN = ['Indeed','LinkedIn','Meta','WhatsApp','Website','Referral','Eigen werving','Anders'];
const AFVAL_LBL = {niet_gekwalificeerd:'Niet gekwalificeerd', offer_afgewezen:'Offer afgewezen'};
const STOP_LBL  = {kandidaat:'door kandidaat', klant:'door klant', anders:'anders'};

/* ─── Kleine helpers ──────────────────────────────────────────── */
/* ─── Wat er in de recruitmentpijplijn staat ──────────────────────
   Twee soorten rijen, één lijst. Naast de leads uit crm_leads staan hier nu
   ook de KANDIDATEN met een instroomfase (Nieuw t/m Intake).

   Zonder dit was iemand met een kandidaatkaart onvindbaar in Recruitment:
   zet je Goncalo op 'Intake ingepland', dan stond hij op zijn kaart maar
   nergens op het bord waar je 's ochtends je werk vandaan haalt. Dat was
   precies de klacht (Tjeerd, 3 aug 2026), en het blokkeerde ook de wens dat
   "+ Sollicitant" meteen een kandidaatkaart oplevert.

   De instroomfases hebben met opzet dezelfde namen als de leadstatussen
   (CRM.INSTROOM in js/data.js), dus een kandidaat past zonder vertaling in
   dezelfde kolom. `_kand` markeert waar de rij vandaan komt; bewaarLead()
   stuurt de schrijfactie op basis daarvan naar de goede tabel. */
const kandAlsRij = c => ({
  id: c.id, naam: c.naam, telefoon: c.telefoon, email: c.email,
  woonplaats: c.woonplaats, functie: c.functie, klant: c.klant,
  status: CRM.faseNorm(c.fase), bron: c.bron,
  vacature_id: c.vacatureId || '', binnen_op: c.since,
  eigenaar: c.rec, kandidaat_id: c.id, kwalificatie: c.note || '',
  notities: c.notities, laatst_actie: c.actieDatum || '',
  _kand: true
});
const leads = () => {
  const uit = CRM.state.leads || [];
  if(!CRM.isInstroom) return uit;                 // data.js nog niet geladen
  /* Twee groepen kandidaten horen hier níét tussen (Tjeerd, 1 sep 2026 —
     "de recruitmenttab is voor werk dat wacht"):
     · wie op 'Klaar om voor te stellen' staat — geïntaked, kaart compleet,
       wacht op een klant. Dat is voorraad, geen werk; de teller in de kop
       ("x klaar om voor te stellen →") blijft de ingang, en in Sourcing
       vind je ze op beschikbaar/afstand. Voorbeeld dat dit besliste:
       Ed Stok, beschikbare ZZP'er mét intake, stond hier als rij.
     · ZZP'ers met een lopende of geplande klus — ingepland werk (zie
       CRM.zzpIngepland). Loopt de laatste klus af, dan keren ze vanzelf
       terug in de voorraad. */
  return uit.concat(CRM.kandidaten()
    .filter(c => CRM.isInstroom(c.fase)
              && !CRM.faseIs(c.fase, 'Klaar om voor te stellen')
              && !(CRM.zzpIngepland && CRM.zzpIngepland(c)))
    .map(kandAlsRij));
};
const leadById = id => leads().find(l => String(l.id) === String(id));
const vacById  = id => (CRM.state.vacs||[]).find(v => String(v.id) === String(id));
const vacLabel = v => v ? (v.functie + ' · ' + v.klant) : '';
const norm     = s => String(s||'').toLowerCase();
const telNorm  = t => String(t||'').replace(/\D/g,'').replace(/^0031/,'').replace(/^31/,'').replace(/^0/,'');
const waLink   = t => { const n = telNorm(t); return n ? 'https://wa.me/31'+n : ''; };
const uurGeleden = iso => {
  if(!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if(isNaN(ms)) return '';
  if(ms < 3600000) return Math.max(1,Math.round(ms/60000)) + ' min';
  if(ms < 86400000) return Math.round(ms/3600000) + ' uur';
  return CRM.geleden(iso);
};
/* Alleen kleuren uit :root — geen losse hexcodes in een module. */
const prioKleur = p => ({Hoog:'var(--red)', Midden:'var(--amber)', Laag:'var(--muted)'})[p] || 'var(--line-2)';
/* De score (0–100) die de WhatsApp-agent meegeeft. Eén plek voor de
   kleurgrenzen: het getal staat in de rij, de belronde én het paneel, en
   drie losse kopieën van dezelfde grens lopen vroeg of laat uit elkaar —
   dan zegt het ene scherm "groen" en het andere niets. */
const scoreKlas = s => s >= 70 ? 'green' : s >= 45 ? 'amber' : '';

/* ─── Botstatus (crm_leads.bot_status) ────────────────────────────
   Het eigen spoor van de WhatsApp-bot — zie CRM.BOT_STATUS in js/data.js.
   Tjeerd, 27 aug 2026: de bot verandert NOOIT de AM-status; alleen de
   AM-status is leidend. Hier alleen weergave: één chip, overal dezelfde
   (Agent-kolom, leadkaart, belronde), zodat de AM ziet wat de bot vond
   zonder dat het zijn werklijst stuurt. Leeg veld = geen chip. */
const botChipHtml = l => {
  /* Eén chip voor het hele botoordeel (herontwerp 3 sep 2026): label =
     bot_status, getal = score, kleur = het oordeel. Voorheen stonden stip,
     statuschip en scorechip als drie weergaven van hetzelfde naast elkaar;
     rij, lade en belronde gebruiken nu allemaal deze ene. */
  const s = String((l && l.bot_status) || '').trim();
  const sc = (l && l.score != null) ? l.score : null;
  if(!s && sc == null) return '';
  const tip = `Oordeel van de WhatsApp-bot · score ${sc != null ? sc : '—'} · prioriteit ${(l && l.prioriteit) || 'onbekend'} — verandert de AM-status niet`;
  if(!s) return `<span class="chip num" title="${h(tip)}">${h(sc)}</span>`;
  return `<span class="chip ${CRM.botKlas(s)}" title="${h(tip)}">${h(s)}${
    sc != null ? ` · <span class="num">${h(sc)}</span>` : ''}</span>`;
};

/* ─── Botfase (crm_leads.bot_fase + tijdstempels) ─────────────────
   Waar zit het gesprek van de bot? Welke template ging er als laatste
   uit, en — belangrijker — reageert de kandidaat eigenlijk? (Tjeerd,
   28 aug 2026: "is er al reactie, is de tweede follow-up gestuurd, hoe
   lang geen reactie?"). Eén korte regel, alleen als er iets te melden
   is: leads zonder bot houden een lege regel en de lijst blijft kaal.
   "Geen reactie sinds X" rekenen we hier uit; de bot levert alleen de
   twee tijdstempels. */
const BOT_FASE_LBL = {
  welkom:'welkom gestuurd', '48u':'follow-up 48u', '1week':'follow-up 1 week',
  '4weken':'follow-up 4 weken', '3maanden':'follow-up 3 mnd',
  '6maanden':'follow-up 6 mnd', gestopt:'follow-ups gestopt'
};
function botFaseTekst(l){
  const delen = [];
  const fase = String((l && l.bot_fase) || '').trim();
  if(fase) delen.push(BOT_FASE_LBL[fase] || 'bot: ' + fase);
  /* uurGeleden geeft '8 uur' binnen een dag en daarbuiten de CRM.geleden-vorm
     ('gisteren', '3 dagen geleden') — die laatste heeft 'geleden' al in zich. */
  const tijd = iso => { const t = uurGeleden(iso); return !t ? '' : /geleden|vandaag|gisteren/.test(t) ? t : t + ' geleden'; };
  if(l && l.bot_reactie_op) delen.push('reactie ' + (tijd(l.bot_reactie_op) || '?'));
  else if(l && l.bot_bericht_op) delen.push('nog geen reactie (' + (uurGeleden(l.bot_bericht_op) || '?') + ')');
  return delen.join(' · ');
}

/* ─── Vacaturekoppeling ───────────────────────────────────────────
   Hierop leunt de hele marketingmeting: leads per plaatsing, per klant
   én per vacature. Een lead zonder vacature is een gat in dat cijfer.
   Gekoppeld betekent: er is een vacature-id dat ook écht bestaat. Een id
   dat naar een verwijderde vacature wijst telt níét als koppeling — de
   marketingmodule kan er niets mee, dus zo'n lead hoort net zo goed in
   de bijwerklijst. Wel benoemen we dat verschil in beeld, anders lijkt
   het alsof iemand vergeten is te koppelen. */
const vacVan      = l => vacById(l && l.vacature_id);
const isGekoppeld = l => !!vacVan(l);
const vacWeg      = l => !!(l && l.vacature_id) && !vacVan(l);
/* Wat er op de kaart/rij staat als er geen geldige vacature is: de losse
   functie- en klantvelden die bij de import of het formulier zijn ingevuld. */
const losFunctie  = l => String((l && l.functie) || '').trim();

/* Een status die ook ná normalisatie niet in CRM.LEAD_STATUS staat. Kan
   voorkomen na een import met een eigen statuskolom. Zulke leads vallen uit
   elke kolom en elk filter — daarom tellen we ze apart en melden we ze.
   'Intake' (en de andere instroomfases) tellen als bestáánd: kandidaten in
   de instroom staan via leads() in deze lijst en hun fase is legitiem, ook
   al is het geen AM-status. */
const statusBestaat = s => { const x = CRM.leadNorm(s);
  return CRM.LEAD_STATUS.some(o => o.k === x) || (CRM.isInstroom && CRM.isInstroom(x)); };
/* De extra optie bovenaan een statuskeuzelijst voor een waarde die niet één
   van de vijf AM-statussen is: de eigen waarde tonen in plaats van stiekem
   de eerste optie geselecteerd laten lijken. */
const statusOptieExtra = s => { const x = CRM.leadNorm(s);
  if(CRM.LEAD_STATUS.some(o => o.k === x)) return '';
  return `<option value="${h(s)}" selected>${h(x||'(geen status)')}${statusBestaat(s)?'':' — bestaat niet meer'}</option>`;
};

/* ─── Kennen we deze persoon al? ──────────────────────────────────
   Dezelfde persoon die twee keer solliciteert — op een tweede advertentie, of
   een paar weken later opnieuw. We voegen niets samen: welke van de twee de
   goede is, is een beslissing van de recruiter. Maar we laten het wél zien,
   anders belt de een 's ochtends en de ander 's middags dezelfde persoon.

   Sinds 31 juli 2026 kijken we niet alleen naar andere leads maar ook naar de
   kandidaten. Dat is de duurste vergissing van de twee: iemand die vorige maand
   is afgevallen bij een klant staat hier gewoon weer als verse reactie, en dan
   loopt de recruiter dezelfde intake nog een keer — of, erger, de kaart wordt
   dubbel aangemaakt en dezelfde persoon wordt bij twee klanten voorgesteld.
   Andersom net zo waardevol: wie op bemiddelbaar staat was gewoon goed,
   en die wil je juist als eerste terugbellen.

   Twee sleutels. Het telefoonnummer is de betrouwbare; naam + woonplaats vangt
   het geval waarin iemand een nieuw nummer opgeeft. Alleen naam zou te veel
   valse treffers geven — er lopen genoeg naamgenoten rond.
   Eén keer per hertekening opgebouwd; per rij opnieuw zoeken werd bij duizenden
   leads onnodig duur. */
let PERS_TEL = new Map(), PERS_NAAM = new Map();
const naamSleutel = o => {
  const n = norm(o && o.naam).replace(/\s+/g,' ').trim();
  const p = norm(o && o.woonplaats).trim();
  return (n && p) ? n + '|' + p : '';
};
function bouwDubbel(){
  PERS_TEL = new Map(); PERS_NAAM = new Map();
  const zet = (map, sleutel, soort, obj) => {
    if(!sleutel) return;
    let e = map.get(sleutel);
    if(!e){ e = {leads:[], kands:[]}; map.set(sleutel, e); }
    e[soort].push(obj);
  };
  leads().forEach(l => {
    zet(PERS_TEL,  telNorm(l.telefoon), 'leads', l);
    zet(PERS_NAAM, naamSleutel(l),      'leads', l);
  });
  CRM.kandidaten().forEach(c => {
    zet(PERS_TEL,  telNorm(c.telefoon), 'kands', c);
    zet(PERS_NAAM, naamSleutel(c),      'kands', c);
  });
}
/* Alles wat op dezelfde persoon lijkt, zonder de lead zelf en zonder de
   kandidaat die uít deze lead is ontstaan — die twee horen bij elkaar. */
function bekend(l){
  if(!l) return {leads:[], kands:[]};
  /* De index wordt bij elke hertekening opgebouwd, maar deze functie wordt ook
     aangeroepen vanuit een venster dat los van de lijst opengaat (doorschieten
     vanaf een andere module). Dan is er nog niets — bouw hem dan alsnog, in
     plaats van stilzwijgend "niemand bekend" te antwoorden. */
  if(!PERS_TEL.size && (leads().length || CRM.kandidaten().length)) bouwDubbel();
  const uit = {leads:[], kands:[]};
  const gezien = new Set([String(l.id), String(l.kandidaat_id || '')]);
  [PERS_TEL.get(telNorm(l.telefoon)), PERS_NAAM.get(naamSleutel(l))].forEach(bak => {
    if(!bak) return;
    ['leads','kands'].forEach(soort => bak[soort].forEach(x => {
      if(gezien.has(String(x.id))) return;
      gezien.add(String(x.id)); uit[soort].push(x);
    }));
  });
  return uit;
}
/* Hoeveel keer staat deze persoon in de sollicitantenlijst (zichzelf meegeteld)? */
const dubbelAantal = l => bekend(l).leads.length + 1;

/* Wat is er eerder met deze persoon gebeurd? Kort, feitelijk, in de volgorde
   waarin het de recruiter iets kan schelen: een lopend traject eerst, dan een
   uitkomst uit het verleden. Alleen wat is vastgelegd — nooit een conclusie. */
function eerderTekst(c){
  const fase = CRM.faseNorm(c.fase) || 'geen fase';
  if(c.fase === 'Afgevallen' || c.fase === 'Gestopt'){
    const reden = c.afvalCat || c.stopCat || '';
    return `${fase}${c.klant ? ' bij ' + c.klant : ''}${reden ? ' — ' + reden : ''}${
      c.bemiddelbaar !== false ? ' · staat op beschikbaar' : ''}`;
  }
  return `${fase}${c.klant ? ' bij ' + c.klant : ''}${c.functie ? ' · ' + c.functie : ''}`;
}

/* Een lead zonder naam komt voor: een formulier dat alleen een nummer
   doorgeeft, of een import met een lege kolom. Zonder deze terugval staat er
   een lege regel waar je niet op kunt klikken. */
/* Terugval naar het telefoonnummer (herontwerp 3 sep 2026): tien rijen
   "Naam onbekend" uit de botmigratie zijn ononderscheidbaar, en het nummer
   is toch al de sleutel waarop we ontdubbelen. */
const leadNaam = l => String((l && l.naam) || '').trim()
  || String((l && l.telefoon) || '').trim() || 'Naam onbekend';

/* Toast met doorklik-link (de core-toast kan alleen tekst). */
function toastLink(tekst, label, fn){
  CRM.toast(tekst,'ok');
  const t = document.getElementById('toast');
  if(!t) return;
  const a = document.createElement('a');
  a.textContent = label; a.href = '#'; a.style.marginLeft = '10px'; a.style.fontWeight = '600';
  a.onclick = e => { e.preventDefault(); fn(); };
  t.appendChild(a);
}

/* Belpogingen leiden we af uit de activiteiten — geen extra kolom nodig.
   Tjeerd, 2 sep 2026: geïndexeerd, net als de dubbeldetectie (bouwDubbel).
   Dit werd per rij en per bordkaart aangeroepen en liep dan telkens de héle
   activiteitenlijst door: 200 rijen × duizenden activiteiten per hertekening,
   en dat bij elke toetsaanslag in het zoekveld. Sinds de migratie van ±440
   botleads (elk met eigen logregels) is dat de duurste lus van dit scherm.
   De index is lui: hij wordt pas gebouwd bij de eerste vraag en gewist zodra
   er iets kan zijn bijgekomen (tekenWerk, en de schrijfpaden hieronder). */
let BEL_AANTAL = null;
const wisBelIndex = () => { BEL_AANTAL = null; };
function belPogingen(leadId){
  if(!BEL_AANTAL){
    BEL_AANTAL = new Map();
    (CRM.state.activiteiten || []).forEach(a => {
      if(a.entiteit === 'lead' && a.soort === 'bel'){
        const k = String(a.ref);
        BEL_AANTAL.set(k, (BEL_AANTAL.get(k) || 0) + 1);
      }
    });
  }
  return BEL_AANTAL.get(String(leadId)) || 0;
}
/* Wanneer was er voor het laatst écht contact? Welke activiteitsoorten als
   contact tellen komt uit js/opvolging.js (CRM.opvolging.CONTACT) — het
   dashboard en de kandidatenlijst lezen dezelfde lijst. Drie kopieën van
   hetzelfde rijtje lopen vroeg of laat uit elkaar, en dan zegt het ene scherm
   iets anders dan het andere. De terugval geldt alleen als opvolging.js
   (nog) niet geladen is. */
const CONTACT_SOORTEN = () => (CRM.opvolging && CRM.opvolging.CONTACT) || ['bel','gesprek','whatsapp','mail','bezoek'];
function laatsteContact(leadId){
  const soorten = CONTACT_SOORTEN();
  const a = CRM.activiteitenVoor('lead', leadId)
    .filter(x => soorten.includes(x.soort))
    .sort((x,y) => String(y.op||'').localeCompare(String(x.op||'')))[0];
  return a ? a.op : null;
}

/* Wanneer was de intake (videocall) van deze sollicitant? Sinds de vijf
   statussen (Tjeerd, 27 aug 2026) is er geen aparte "gehad"-status meer: de
   afspraakdatum staat in opvolgen_op, en dát is de beste bron. De
   kandidatenkaart krijgt deze datum mee, zodat daar niet uit "er staat een
   intake" hoeft te worden afgeleid dát er een gesprek was.
   Terugval voor oude rijen: de statuswissel '→ Videocall gehad' in de
   activiteitenlijn, anders vandaag — een datum die een dag naast zit is
   bruikbaarder dan geen datum. */
function intakeGehadOp(lead){
  if(lead && lead.opvolgen_op) return String(lead.opvolgen_op).slice(0,10);
  const treffer = CRM.activiteitenVoor('lead', lead && lead.id)
    .filter(a => / → Videocall gehad$/.test(String(a.tekst||'')))
    .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')))[0];
  if(treffer && treffer.op) return String(treffer.op).slice(0,10);
  return CRM.todayISO();
}

/* ─── Opslaan ─────────────────────────────────────────────────── */
async function bewaarLead(lead, patch){
  /* Rijen met _kand komen uit de kandidatentabel (zie kandAlsRij). Die
     mogen niet naar crm_leads geschreven worden — dan verdwijnt de wijziging
     stilzwijgend in een tabel waar die kaart niet staat. De veldnamen
     verschillen, dus we vertalen wat er vertaald moet worden. */
  if(lead && lead._kand){
    Object.assign(lead, patch);            // de rij op het scherm bijwerken
    const p = {};
    if(patch.status      !== undefined) p.fase        = patch.status;
    if(patch.eigenaar    !== undefined) p.rec         = patch.eigenaar;
    if(patch.vacature_id !== undefined) p.vacature_id = patch.vacature_id;
    if(patch.klant       !== undefined) p.klant       = patch.klant;
    if(patch.kwalificatie!== undefined) p.note        = patch.kwalificatie;
    if(patch.notities    !== undefined) p.notities    = patch.notities;
    if(!Object.keys(p).length) return true;   // alleen leadvelden — niets te doen
    if(p.fase !== undefined){
      /* Een fasewissel loopt via bewaarFase: die zet de historie, de datum
         sinds wanneer, en ruimt uitval- en plaatsingsvelden op. */
      const c = CRM.kandidaat(lead.id);
      if(c){ await bewaarFase(c, p.fase, (() => { const r = Object.assign({}, p); delete r.fase; return r; })()); return true; }
    }
    return await bewaarKand(lead.id, p);
  }
  Object.assign(lead, patch);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_leads').update(patch).eq('id', lead.id);
    if(error){ CRM.fout('Opslaan mislukt', error); return false; }
  }
  return true;
}
async function bewaarKand(id, patch){            // patch in DB-kolomnamen
  const rij = CRM.state.cands.find(r => String(r.id) === String(id));
  if(!rij) return false;
  /* Zie de toelichting in js/kandidaten.js: dit is het tweede punt waar
     alles langskomt — fasewissel, uitval, O&O, no-show, doorschieten.
     Alleen als de klant écht verandert; een fasewissel raakt dat veld niet. */
  if(patch && patch.klant !== undefined && patch.klant !== rij.klant && CRM.traject &&
     !await CRM.traject.poort(rij, {klant:patch.klant, vacatureId:patch.vacature_id, functie:patch.functie}))
    return false;
  Object.assign(rij, patch);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update(patch).eq('id', id);
    if(error){ CRM.fout('Opslaan mislukt', error); return false; }
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   MODULE-REGISTRATIE
   ═══════════════════════════════════════════════════════════════ */
CRM.registerModule('recruitment', {
  title:'Recruitment', icon:'◉', onderschrift:'Instroom en uitval',
  volleBreedte:true,
  badge(){ return leads().filter(l => CRM.leadIs(l.status, 'Nieuw')).length; },
  render(mount, acties, params){
    if(!['leads','uitval'].includes(S.tab)) S.tab = 'leads';
    mount.innerHTML = `
      <div class="rc">
        <div class="rc-strook" id="rc_strook"></div>
        <div class="rc-tabwrap"><div class="tabs" id="rc_tabs"></div></div>
        <div id="rc_body"></div>
      </div>`;
    /* Deeplink vanaf het dashboard (motorkap-punt 5): de belafspraken-regel
       opent dit scherm in de iedereen-stand — anders verbergt de
       Van-mij-standaard precies de eigenaarloze afspraken die meegeteld
       waren. */
    if(params && params.id === 'focus:belafspraken'){ S.tab = 'leads'; S.l.eig = ''; }
    tekenKop();
    tekenTabs();
    tekenBody();
    tekenActies(acties);
    if(params && params.id && params.id !== 'focus:belafspraken' && leadById(params.id)){ S.tab = 'leads'; openLead(params.id); }
  }
});

function tekenActies(acties){
  const el = acties || document.getElementById('pageacties');
  if(!el) return;
  if(S.tab === 'leads'){
    el.innerHTML = `<button class="btn ghost sm" id="rc_import">⬇ Importeren</button>
                    <button class="btn sm" id="rc_nieuw">+ Sollicitant</button>`;
    el.querySelector('#rc_import').onclick = importModal;
    el.querySelector('#rc_nieuw').onclick  = nieuweSollicitantKeuze;
  } else {
    el.innerHTML = `<span class="meta">Uitval leeft buiten het bord — sleep op Klanttrajecten een kaart naar de uitvalstrook</span>`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   DAGELIJKSE CIJFERS
   ═══════════════════════════════════════════════════════════════ */
function weekGrens(){
  const nu = new Date(), dag = (nu.getDay() + 6) % 7;             // maandag = 0
  const ma = new Date(nu); ma.setDate(nu.getDate() - dag); ma.setHours(0,0,0,0);
  const zo = new Date(ma); zo.setDate(ma.getDate() + 7);
  return [ma, zo];
}
/* De cijfers die niet van je filters afhangen. De verdeling van 'Nieuw' naar
   ouderdom en het aantal dat blijft liggen staan hier bewust níét meer bij:
   die horen in de doen-regel en moeten dáár met de filters meebewegen, anders
   wijst het getal bovenaan 12 aan terwijl je er in de lijst 4 ziet staan. */
function cijfers(){
  const L = leads(), K = CRM.kandidaten();
  const [ma, zo] = weekGrens();
  const inWeek = iso => { if(!iso) return false; const d = new Date(iso); return !isNaN(d) && d >= ma && d < zo; };

  /* Hoe lang ligt de oudste reactie er al? Het getal waarop je merkt dat een
     achterstand geen ochtend maar een week is. */
  const oudste = L.filter(l => CRM.leadIs(l.status, 'Nieuw'))
    .reduce((m,l) => { const n = leadDagen(l); return n != null && n > m ? n : m; }, 0);

  /* Videocalls: ingeplande intakes bij de leads plus de kandidaten die al
     zijn doorgeschoten en op fase Intake staan met een datum deze week. */
  const calls = L.filter(l => CRM.leadIs(l.status, 'Intake ingepland') && !l.kandidaat_id && inWeek(l.opvolgen_op)).length
              + K.filter(c => CRM.faseIs(c.fase, 'Intake') && inWeek(c.datum)).length;
  /* Het getal waar de AM op zit te wachten: kaart compleet, intake gehad, nog
     niet voorgesteld. Dit is precies de brug naar de Klanttrajecten. */
  const klaar = K.filter(CRM.klaarOmVoorTeStellen);

  const startsWeek = K.filter(c => CRM.PLACED.includes(c.fase) && c.start && inWeek(c.start));
  const vroeg = K.filter(c => ['Voorgesteld','O&O sessie','Eerste gesprek'].includes(c.fase)).length;
  return {oudste, calls, klaar, startsWeek, vroeg};
}
/* Boven de tabs staat sinds 1 augustus 2026 alleen nog de signaalstrook.
   Hier stond een rij van vijf KPI-tegels (Op nieuw / Vandaag binnen / Zonder
   vacature / Videocalls deze week / Klaar om voor te stellen). Samen met de
   staaf, de wachtkamerkaart en de statuschips daaronder vroegen vier banden om
   aandacht met deels dezelfde getallen: "op nieuw 11" stond drie keer op het
   scherm. Als alles opvalt, valt niets meer op.

   De cijfers zijn niet weg, ze staan één laag dieper — in de doen-regel boven
   de lijst, waar ze meebewegen met je filters. Welke er gebleven zijn en
   waarom: zie tekenDoenregel. De naam van deze functie is historisch; hij
   ververst nu alleen nog de strook. */
function tekenKop(){ tekenStrook(); }

/* Signaalstrook onder de cijfers — bewust compact gehouden (wens Tjeerd):
   alleen wat vandaag actie vraagt. De maandlijsten (getekend/gestopt) en het
   nazorg-overzicht staan in Performance; nazorg-acties in Mijn dag. */
function tekenStrook(c){
  const el = document.getElementById('rc_strook'); if(!el) return;
  c = c || cijfers();
  const naamchip = (k, extra, klasse='') =>
    `<button class="rc-naamchip ${klasse}" data-open="${h(k.id)}">${h(k.naam)}<em>${h(extra)}</em></button>`;
  const rijen = [];
  if(c.startsWeek.length) rijen.push(`<div class="rc-strookrij"><span class="label">Deze week starten</span>${
    c.startsWeek.slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''))
      .map(k=>naamchip(k, `${CRM.fmtDay(k.start)}${k.klant?' · '+k.klant:''}`)).join('')}</div>`);
  if(c.vroeg < 3) rijen.push(`<div class="rc-strookrij"><span class="chip amber">Instroom laag: ${c.vroeg} kandidaat${c.vroeg===1?'':'en'} in Voorgesteld/O&amp;O/Eerste gesprek — over ± 6 weken droogte</span></div>`);
  el.innerHTML = rijen.join('');
  el.style.display = rijen.length ? '' : 'none';
  /* Naar de volledige kandidatenkaart — niet meer het smalle bewerkpaneel. */
  CRM.$$('[data-open]', el).forEach(b => b.onclick = () => CRM.ga('kandidaten',{id:b.dataset.open}));
}


/* ═══════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════ */
function tekenTabs(){
  const el = document.getElementById('rc_tabs'); if(!el) return;
  const K = CRM.kandidaten();
  /* Wie al een kandidaatkaart heeft telt hier niet meer als openstaand werk —
     dezelfde regel als leadsGefilterd. */
  const open = leads().filter(l => CRM.leadIn(l.status, CRM.LEAD_OPEN) && !(l.kandidaat_id && !l._kand)).length;
  const uit  = K.filter(c => UITVAL.includes(c.fase)).length;
  el.innerHTML = `
    <button class="tab ${S.tab==='leads'?'on':''}" data-t="leads">Recruitmentpijplijn <span class="cnt num">${open}</span></button>
    <button class="tab ${S.tab==='uitval'?'on':''}" data-t="uitval">Uitval <span class="cnt num">${uit}</span></button>`;
  CRM.$$('[data-t]', el).forEach(b => b.onclick = () => {
    S.tab = b.dataset.t; tekenTabs(); tekenBody(); tekenActies();
  });
}
function tekenBody(){
  const el = document.getElementById('rc_body');
  if(!el){
    /* Vanuit gedeelde flows (fasewissel, intake, no-show, uitval) aangeroepen
       terwijl een ánder scherm openstaat. De Pijplijn haakt in met een
       gerichte hertekening; de kandidatenkaart tekent zichzelf opnieuw,
       zodat fase, chips en trajectvelden meteen kloppen. */
    if(CRM.view === 'pijplijn' && typeof CRM._pijplijnVernieuw === 'function') CRM._pijplijnVernieuw();
    else if(CRM.view === 'kandidaten') CRM.render();
    return;
  }
  if(S.tab === 'leads') tekenLeads(el);
  else tekenUitval(el);
}

/* ═══════════════════════════════════════════════════════════════
   TAB A — DE RECRUITMENTPIJPLIJN (crm_leads)
   ═══════════════════════════════════════════════════════════════ */
/* negeerStatus/negeerBot/negeerEig: elke dropdown toont tellers met alle
   ándere filters toegepast, dus de basis voor zijn tellers negeert alleen
   zichzelf. */
function leadsGefilterd(negeerStatus, negeerBot, negeerEig){
  const f = S.l, q = norm(f.q);
  return leads().filter(l => {
    /* Zodra een lead een kandidaat_id heeft, is hij overgedragen: de
       kandidaatkaart is nu de plek waar het werk staat (en die staat via
       leads() zelf in de pijplijn zolang hij in de instroom zit). De oude
       leadrij hier ook nog tonen zou dezelfde persoon twee keer op de
       werklijst en het bord zetten. Bewust HIER gefilterd en niet in
       leads(): de dubbeldetectie (bekend/bouwDubbel) en de metingen moeten
       deze rijen blijven zien. (Tjeerd, 27 aug 2026) */
    if(l.kandidaat_id && !l._kand) return false;
    if(!negeerStatus && f.status && !CRM.leadIs(l.status, f.status)) return false;
    if(!negeerBot && f.bot && String(l.bot_status||'').trim() !== f.bot) return false;
    if(f.bron && l.bron !== f.bron) return false;
    if(f.vac && String(l.vacature_id) !== f.vac) return false;
    /* Klantfilter (Tjeerd, 3 sep 2026): AM's willen per klant kunnen werken,
       niet alleen per vacature. Een lead hoort bij een klant via zijn
       vacature, en anders via het losse klantveld dat de bron meegaf. */
    if(f.klant){
      const kv = norm((vacVan(l)||{}).klant || l.klant || '');
      if(kv !== f.klant) return false;
    }
    if(f.zvac && isGekoppeld(l)) return false;
    if(f.stil && !stilstand(l)) return false;
    /* Eigenaar genormaliseerd vergelijken (CRM.naamNorm): in de gemigreerde
       botleads staat de eigenaar zoals de bron hem aanleverde ("bryan",
       "TJERK", een e-mailadres) en een exacte vergelijking met CRM.me() liet
       die rijen stilletjes uit "Van mij" vallen. */
    if(!negeerEig && f.eig){
      const e = CRM.naamNorm(l.eigenaar);
      if(f.eig === EIG_GEEN ? !!e : e !== f.eig) return false;
    }
    if(q){
      const hooi = [l.naam, l.telefoon, l.email, l.woonplaats, l.klant, l.functie, l.kwalificatie].map(norm).join(' ');
      if(!hooi.includes(q) && (!telNorm(q) || telNorm(l.telefoon).indexOf(telNorm(q)) !== 0)) return false;
    }
    return true;
  }).sort((a,b) => belRang(a) - belRang(b)
                || belMoment(a).localeCompare(belMoment(b))
                || (versGoud(b)?1:0) - (versGoud(a)?1:0)
                || prioRang(a) - prioRang(b)
                || String(b.binnen_op||'').localeCompare(String(a.binnen_op||'')));
}
/* Belafspraken gaan vóór alles: een kandidaat die met de bot "vandaag om
   19:00" afsprak en niet gebeld wordt, is een gebroken belofte — erger dan
   een gekwalificeerde lead die een uur later gepakt wordt. Alleen afspraken
   van vandaag of eerder tellen (een afspraak voor morgen is nog geen werk),
   en alleen op openstaand werk. Onderling op tijd: 9:00 vóór 19:00; de
   terugbel_om-tijd van de bot als die er is, anders de kale opvolgdatum. */
/* Drietrap (Tjeerd, 3 sep 2026: "belafspraken moeten te allen tijden
   chronologisch in de lijst"): 0 = afspraak vandaag of verlopen,
   1 = afspraak in de toekomst (chronologisch zichtbaar, mét chip),
   2 = geen afspraak. Vóór deze fix was een afspraak voor morgen
   onvindbaar tussen de rest. */
const belRang   = l => {
  if(!(CRM.leadIn(l.status, CRM.LEAD_OPEN) && l.opvolgen_op)) return 2;
  return String(l.opvolgen_op).slice(0,10) <= CRM.todayISO() ? 0 : 1;
};
const belMoment = l => belRang(l) <= 1 ? String(l.terugbel_om || l.opvolgen_op || '') : '';
/* De chip die dat zichtbaar maakt: alleen als er nú iets te bellen valt —
   geen afspraak, geen chip, en de lijst blijft kaal. */
function belChipHtml(l){
  /* Verlopen intake ≠ belafspraak (motorkap-punt 12): bij Intake ingepland
     zegt de stilstandtekst het al; een belchip erbij is dubbel alarm. */
  if(CRM.leadIs(l.status, 'Intake ingepland')) return '';
  const rang = belRang(l);
  if(rang === 2) return '';
  const t = l.terugbel_om ? new Date(l.terugbel_om) : null;
  const vandaag = String(l.opvolgen_op).slice(0,10) === CRM.todayISO();
  /* Toekomstige afspraak: neutrale chip met dag+tijd — geen amber, want er
     is nog niets aan de hand; hij moet alleen vindbaar en chronologisch zijn. */
  if(rang === 1){
    const lbl = 'belafspraak ' + (t && !isNaN(t)
      ? t.toLocaleString('nl-NL', {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})
      : (CRM.fmtDate(l.opvolgen_op) || ''));
    return `<span class="chip num" title="Met de kandidaat afgesproken belmoment (toekomst)">${h(lbl)}</span>`;
  }
  const lbl = t && vandaag && !isNaN(t) ? 'bel om ' + t.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})
            : vandaag ? 'bel vandaag'
            : 'belafspraak ' + (CRM.fmtDate(l.opvolgen_op) || '') + ' — verlopen';
  return `<span class="chip ${vandaag ? 'amber' : 'red'} num" title="Met de kandidaat afgesproken belmoment${
    t && !isNaN(t) ? ': ' + t.toLocaleString('nl-NL', {dateStyle:'short', timeStyle:'short'}) : ''}">${h(lbl)}</span>`;
}

/* ─── Het ene "waarom-nu"-signaal per rij (herontwerp 3 sep 2026) ──
   Vaste plek onder de naam, maximaal één gekleurde chip, voorrangsregel
   belafspraak > stilstand > ouderdom-op-Nieuw. Dit is het antwoord op
   "waarom staat deze hier" — alle andere chips die hetzelfde probeerden
   te zeggen (in de Status-kolom, in Binnen) zijn hierin opgegaan. */
function waaromNuChip(l){
  const bel = belChipHtml(l);
  if(bel) return bel;
  const st = stilstand(l);
  if(st && !CRM.leadIs(l.status, 'Nieuw'))
    return `<span class="chip ${st.klas} num" title="${h(st.waarom)}">${h(st.label)}</span>`;
  if(CRM.leadIs(l.status, 'Nieuw')){
    const dg = leadDagen(l), k = ouderdomKlas(dg);
    if(k) return `<span class="chip ${k} num" title="Binnengekomen ${h(CRM.fmtDate(l.binnen_op)||'onbekend')}">ligt er ${dg} dagen</span>`;
  }
  return '';
}

/* Vers goud (B1, herontwerp 3 sep 2026): een Hoog/Gekwalificeerd-lead van
   vandaag — de belkans piekt in de eerste uren, dus die groep staat in
   lijst én belronde direct na de belafspraken. */
const versGoud = l => CRM.leadIn(l.status, CRM.LEAD_OPEN)
  && String(l.binnen_op||'').slice(0,10) === CRM.todayISO()
  && (l.prioriteit === 'Hoog' || String(l.bot_status||'').trim() === 'Gekwalificeerd');
/* Eerst prioriteit, dan binnenkomst. De WhatsApp-agent geeft leads een
   prioriteit mee; wie op Hoog binnenkomt is al gekwalificeerd en hoort
   bovenaan de lijst — ook (juist) achter het filter "Van mij", waar de AM
   zijn eigen belwerk pakt. Zonder deze voorrang zakt zo'n lead onder elke
   nieuwere Laag-reactie weg.
   Alleen het openstaande werk krijgt de voorrang: een afgesloten lead die
   ooit Hoog was zou anders eeuwig bovenaan het totaaloverzicht plakken.
   Leads zonder prioriteit (import, formulier, handmatig) houden onderling
   gewoon nieuwste-eerst — de sortering is stabiel, dus voor hen verandert
   er niets. De belronde en de kolom 'Nieuw' op het bord sorteren daarna
   bewust opnieuw op oudste-eerst: daar is de volgorde "wie wacht het
   langst", en die afweging blijft daar gelden. Sinds 2 sep 2026 met één
   uitzondering in de belronde: een belafspraak van vandaag of eerder gaat
   ook dáár voorop — een afgesproken tijdstip weegt zwaarder dan wachttijd
   (zie wegwerkModus). */
const PRIO_RANG = {Hoog:0, Midden:1, Laag:2};
const prioRang = l => (CRM.leadIn(l.status, CRM.LEAD_OPEN) && PRIO_RANG[l.prioriteit] != null)
  ? PRIO_RANG[l.prioriteit] : 3;
/* Oudste eerst — de volgorde waarin je ze wegwerkt. */
const oudsteEerst = arr => arr.slice().sort((a,b) => String(a.binnen_op||'').localeCompare(String(b.binnen_op||'')));

/* Terug naar "toon alles". Deze knop stond al in de lege staat van de
   doen-regel, maar de functie bestond niet — één klik gaf een fout in de
   console en er gebeurde niets.
   Ook het eigenaarfilter gaat leeg — óók bij een AM die standaard op
   "Van mij" begint. De knop belooft "toon alles", en dat moet hij dan ook
   doen; de standaard komt bij de volgende sessie vanzelf terug
   (zetEigStandaard loopt één keer per sessie). Tjeerd, 2 sep 2026. */
function wisFilters(){
  S.l = {q:'', status:'', bot:'', bron:'', vac:'', klant:'', eig:'', zvac:false, stil:false};
  wisSelectie();
}

/* ─── Twee banden boven de lijst ──────────────────────────────────
   Hierboven stonden er zes: KPI-tegels, tabs, een kaart met de werkstapel,
   een kaart "Blijft liggen" met zeven statuschips, de filterbalk en een rij
   van elf statuschips. Vier daarvan vertelden elkaars verhaal opnieuw.

   Wat blijft: de tabs, één doen-regel (het enige accent op dit scherm) en
   één filterbalk waarin de statuschips als dropdown mét tellers zijn
   opgegaan. De filterbalk wordt één keer gebouwd en daarna alleen bijgewerkt;
   opnieuw tekenen bij elke toetsaanslag zou de cursor uit het zoekveld halen. */
function tekenLeads(el){
  zetEigStandaard();
  const bronnen = Array.from(new Set(leads().map(l => l.bron).filter(Boolean))).sort();
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b) => vacLabel(a).localeCompare(vacLabel(b)));
  /* Klanten uit twee bronnen: de vacaturekaarten én het losse klantveld op
     leads zonder (geldige) vacature — genormaliseerd ontdubbeld zodat
     "Smurfit" en "SMURFIT" één keer in de lijst staan. */
  const klanten = Array.from(new Map(
    [...vacs.map(v => v.klant), ...leads().map(l => (vacVan(l)||{}).klant || l.klant)]
      .filter(Boolean).map(k => [norm(k), String(k).trim()])
  ).entries()).sort((a,b) => a[1].localeCompare(b[1]));
  const w = weergave();
  el.innerHTML = `
    <div class="rc-pad">
      <div id="rc_doen"></div>
      <div class="rc-fil">
        <div class="searchbox rc-zoek">
          <input type="search" id="rc_q" placeholder="Zoek op naam, telefoon of plaats" value="${h(S.l.q)}">
        </div>
        <select id="rc_status"></select>
        <select id="rc_bot"></select>
        <select id="rc_bron">
          <option value="">Alle bronnen</option>
          ${bronnen.map(b=>`<option value="${h(b)}" ${S.l.bron===b?'selected':''}>${h(b)}</option>`).join('')}
        </select>
        <select id="rc_klant">
          <option value="">Alle klanten</option>
          ${klanten.map(([w,lbl])=>`<option value="${h(w)}" ${S.l.klant===w?'selected':''}>${h(lbl)}</option>`).join('')}
        </select>
        <select id="rc_vac">
          <option value="">Alle vacatures</option>
          ${''/* "Zonder vacature" is een stand van hetzelfde filter, geen
               eigen knop meer (herontwerp 3 sep 2026) — zelfde patroon als
               "— zonder eigenaar —" bij het eigenaarfilter. */}
          <option value="__zonder" ${S.l.zvac?'selected':''}>— zonder vacature — (${
            leads().filter(l => CRM.leadIn(l.status, CRM.LEAD_OPEN) && !(l.kandidaat_id && !l._kand) && !isGekoppeld(l)).length})</option>
          ${vacs.map(v=>`<option value="${h(v.id)}" ${S.l.vac===String(v.id)?'selected':''}>${h(vacLabel(v))}</option>`).join('')}
        </select>
        ${''/* rc_eigfil, niet rc_eig: die id is al van het eigenaarveld in de lade */}
        <select id="rc_eigfil"></select>
        <button class="chip btn-like" id="rc_mijn" type="button"
          title="Alleen sollicitanten waar jij eigenaar van bent — sneltoets die de eigenaarkeuze hiernaast op jezelf zet">Van mij</button>
        <div class="rc-filr">
          <span class="meta" id="rc_telling"></span>
          <div class="seg" id="rc_weer">
            <button data-w="lijst" class="${w==='lijst'?'on':''}">Lijst</button>
            <button data-w="bord" class="${w==='bord'?'on':''}">Bord</button>
          </div>
        </div>
      </div>
      <div id="rc_actief"></div>
      <div id="rc_waarsch"></div>
      <div id="rc_lijst"></div>
    </div>`;

  /* Elke filterwijziging wist de selectie — zie de toelichting bij S.sel. */
  const q = el.querySelector('#rc_q');
  q.oninput = CRM.debounce(() => { S.l.q = q.value; wisSelectie(); tekenWerk(); }, 200);
  el.querySelector('#rc_status').onchange = e => { S.l.status = e.target.value; S.l.stil = false; wisSelectie(); tekenWerk(); };
  el.querySelector('#rc_bot').onchange    = e => { S.l.bot = e.target.value; wisSelectie(); tekenWerk(); };
  el.querySelector('#rc_bron').onchange   = e => { S.l.bron = e.target.value; wisSelectie(); tekenWerk(); };
  el.querySelector('#rc_klant').onchange  = e => { S.l.klant = e.target.value; wisSelectie(); tekenWerk(); };
  el.querySelector('#rc_vac').onchange    = e => {
    if(e.target.value === '__zonder'){ S.l.vac = ''; S.l.zvac = true; }
    else { S.l.zvac = false; S.l.vac = e.target.value; }
    wisSelectie(); tekenWerk();
  };
  el.querySelector('#rc_eigfil').onchange = e => { S.l.eig  = e.target.value; wisSelectie(); tekenWerk(); };
  /* "Van mij" is een sneltoets op het eigenaarfilter, geen eigen filter:
     aanklikken zet de dropdown op jezelf, nóg een keer klikken (of een andere
     eigenaar kiezen) haalt hem er weer af. Eén stand, dus geen dubbelzinnige
     combinaties zoals "Van mij" aan én de dropdown op Tjerk. */
  el.querySelector('#rc_mijn').onclick = () => {
    const mij = CRM.naamNorm(CRM.me()); if(!mij) return;
    S.l.eig = S.l.eig === mij ? '' : mij;
    wisSelectie(); tekenWerk();
  };
  CRM.$$('#rc_weer button', el).forEach(b => b.onclick = () => {
    if(weergave() === b.dataset.w) return;
    zetWeergave(b.dataset.w);
    /* Op het bord zijn de kolommen de statussen, dus een statusfilter zou daar
       alleen maar zeven van de acht kolommen leegtrekken. Hem laten staan tot
       je terugschakelt naar de lijst is nog verwarrender: dan verandert het
       beeld ineens zonder dat je iets hebt aangeraakt. Dus wissen. */
    if(b.dataset.w === 'bord') S.l.status = '';
    CRM.$$('#rc_weer button', el).forEach(x => x.classList.toggle('on', x === b));
    tekenWerk();
  });
  tekenWerk();
}

/* De statuschips zijn hier ingeklapt. Het aantal per status blijft
   zichtbaar — daar stuurt het team op — maar het vraagt pas aandacht als je
   het opent, in plaats van een hele band naast een filterbalk met dezelfde
   functie. De twee groepen scheiden werk van eindstation: alles op één hoop
   liet 'Nieuw' en 'Niet geschikt' even zwaar wegen. */
function vulStatusSelect(basis){
  const sel = document.getElementById('rc_status'); if(!sel) return;
  const tel = s => basis.filter(l => CRM.leadIs(l.status, s)).length;
  const opt = s => `<option value="${h(s)}" ${S.l.status===s?'selected':''}>${h(s)} (${tel(s)})</option>`;
  sel.innerHTML =
    `<option value="" ${S.l.status===''?'selected':''}>Alle statussen (${basis.length})</option>` +
    `<optgroup label="Openstaand werk">${CRM.LEAD_OPEN.map(opt).join('')}</optgroup>` +
    `<optgroup label="Eindstation">${CRM.LEAD_EIND.map(opt).join('')}</optgroup>`;
  const bord = weergave() === 'bord';
  sel.disabled = bord;
  sel.title = bord ? 'Op het bord zijn de kolommen de statussen — filteren op één status laat de rest leeg' : '';
}

/* Zelfde opzet voor de botstatus (Tjeerd, 27 aug 2026): het spoor van de
   WhatsApp-bot is filterbaar — "laat me de twijfelgevallen zien" — maar het
   blijft een filter, geen kolom: het bord en de werklijst draaien op de
   AM-status, want alleen die is leidend. */
function vulBotSelect(basis){
  const sel = document.getElementById('rc_bot'); if(!sel) return;
  const tel = s => basis.filter(l => String(l.bot_status||'').trim() === s).length;
  sel.innerHTML =
    `<option value="" ${S.l.bot===''?'selected':''}>Alle botstatussen (${basis.length})</option>` +
    CRM.BOT_STATUS.map(x => `<option value="${h(x.k)}" ${S.l.bot===x.k?'selected':''}>${h(x.k)} (${tel(x.k)})</option>`).join('');
  sel.title = 'Wat de WhatsApp-bot van de lead vond — los van de AM-status';
}

/* ─── Eigenaarfilter ──────────────────────────────────────────────
   Tjeerd, 2 sep 2026: sinds de migratie van ±440 botleads is "van wie is
   dit" een dagelijkse vraag — Tjerk en Rajesh werken ieder hun eigen stapel
   weg, en de leads zónder eigenaar zijn precies de rijen die anders niemand
   oppakt. Zelfde opzet als vulStatusSelect: tellers met alle andere filters
   toegepast. De "Van mij"-knop ernaast blijft bestaan als sneltoets die deze
   dropdown op jezelf zet — één gedeelde stand (S.l.eig), dus de twee kunnen
   elkaar niet tegenspreken.
   Namen genormaliseerd via CRM.naamNorm (Bryan→Rajesh, TJERK→Tjerk); de
   vaste volgorde is CRM.PLAATSERS, onbekende namen uit de data komen daar
   alfabetisch achteraan zodat níéts onfilterbaar is. */
const EIG_GEEN = '__geen';
function vulEigSelect(basis){
  const sel = document.getElementById('rc_eigfil'); if(!sel) return;
  const telling = new Map(); let zonder = 0;
  basis.forEach(l => {
    const n = CRM.naamNorm(l.eigenaar);
    if(!n){ zonder++; return; }
    telling.set(n, (telling.get(n) || 0) + 1);
  });
  const extra = Array.from(new Set(leads().map(l => CRM.naamNorm(l.eigenaar))))
    .filter(n => n && !CRM.PLAATSERS.includes(n)).sort((a,b) => a.localeCompare(b));
  const namen = CRM.PLAATSERS.concat(extra);
  /* Een gekozen waarde die (net) niet meer in de lijst staat blijft zichtbaar
     in plaats van stiekem op "Alle eigenaren" te lijken — zelfde afweging als
     statusOptieExtra. */
  const vreemd = S.l.eig && S.l.eig !== EIG_GEEN && !namen.includes(S.l.eig)
    ? `<option value="${h(S.l.eig)}" selected>${h(S.l.eig)} (${telling.get(S.l.eig) || 0})</option>` : '';
  sel.innerHTML =
    `<option value="" ${S.l.eig===''?'selected':''}>Alle eigenaren (${basis.length})</option>` + vreemd +
    namen.map(n => `<option value="${h(n)}" ${S.l.eig===n?'selected':''}>${h(n)} (${telling.get(n) || 0})</option>`).join('') +
    `<option value="${EIG_GEEN}" ${S.l.eig===EIG_GEEN?'selected':''}>— zonder eigenaar — (${zonder})</option>`;
  sel.title = 'Wie de sollicitant oppakt — "Van mij" ernaast is de sneltoets die dit op jezelf zet';
}

/* ─── "Van mij" standaard AAN voor wie belt ───────────────────────
   Besluit Tjeerd, 2 sep 2026: een AM of recruiter opent dit scherm om zíjn
   stapel weg te werken, niet om 440 rijen van het hele team te zien. Daarom
   start de lijst voor een profiel met functie 'am' of 'recruiter' op de
   eigen leads; de eigenaar (Tjeerd, herkend aan canSeeMoney) start op alles
   — die stuurt, en sturen begint bij het geheel. Uitzetten blijft één klik
   ("Van mij" of de dropdown) en houdt de rest van de sessie stand: dit loopt
   maar één keer, en S overleeft elke hertekening.
   De functie staat in het profiel (productie: CRM.profile.functie); in de
   demo mist dat veld op CRM.profile en zoeken we het profiel op naam op. */
let eigStandaardGezet = false;
function zetEigStandaard(){
  if(eigStandaardGezet || !CRM.state._loaded) return;
  eigStandaardGezet = true;
  if(CRM.canSeeMoney()) return;
  const mij = CRM.naamNorm(CRM.me()); if(!mij) return;
  const prof = (CRM.state.profiles || []).find(p => CRM.naamNorm(p.naam) === mij);
  const functie = (CRM.profile && CRM.profile.functie) || (prof && prof.functie) || '';
  if(['am','recruiter'].includes(functie)) S.l.eig = mij;
}

/* De twee vinkjes zijn knopfilters geworden: even duidelijk, half zo breed,
   en ze laten zich van buitenaf aanzetten (de melding "niet gekoppeld"
   hieronder doet dat). Stand komt altijd uit S.l, nooit uit het element zelf.
   "Van mij" brandt zodra het eigenaarfilter op jezelf staat — óók als dat
   via de dropdown gebeurde, want het is dezelfde stand. */
/* Tellers "(N)" in de bron-, klant- en vacature-opties (motorkap-punt 14),
   zoals status/bot/eigenaar die al hebben: elke teller telt binnen de
   ándere actieve filters, zodat je nooit naar een leeg scherm klikt.
   De eigen stand wordt even genegeerd tijdens het tellen — synchroon,
   dus veilig. */
function vulKeuzeTellers(){
  const zet = (id, negeer, telVan) => {
    const s = document.getElementById(id); if(!s) return;
    const oud = {}; negeer.forEach(k => { oud[k] = S.l[k]; S.l[k] = (k === 'zvac' ? false : ''); });
    const basis = leadsGefilterd();
    negeer.forEach(k => S.l[k] = oud[k]);
    Array.from(s.options).forEach(o => {
      if(o.value === '') return;
      const n = telVan(basis, o.value);
      o.textContent = o.textContent.replace(/\s*\(\d+\)\s*$/, '') + ` (${n})`;
    });
  };
  zet('rc_bron',  ['bron'],          (b, v) => b.filter(l => l.bron === v).length);
  zet('rc_klant', ['klant'],         (b, v) => b.filter(l => norm((vacVan(l)||{}).klant || l.klant || '') === v).length);
  zet('rc_vac',   ['vac','zvac'],    (b, v) => v === '__zonder'
    ? b.filter(l => !isGekoppeld(l)).length
    : b.filter(l => String(l.vacature_id) === v).length);
}

function zetFilterstand(){
  const mijAan = !!S.l.eig && S.l.eig === CRM.naamNorm(CRM.me());
  [['rc_mijn', mijAan]].forEach(([id, aan]) => {
    const b = document.getElementById(id); if(!b) return;
    b.classList.toggle('on', !!aan);
    b.setAttribute('aria-pressed', aan ? 'true' : 'false');
  });
}

/* ─── De doen-regel ───────────────────────────────────────────────
   Eén regel, en het enige accent op dit scherm. Hij beantwoordt de vraag
   waarmee iemand dit scherm opent: wát moet ik nu doen, hoeveel is het, en
   waar begin ik. Alles wat daar niet aan bijdraagt staat hier niet.

   Waarom deze cijfers en niet de vijf tegels die hier stonden:
   · Op Nieuw       — de voorraad die de dag bepaalt. Dit is het getal, groot,
                      met de knop ernaast. De verdeling naar ouderdom (de
                      gestapelde staaf met drie legendachips) is één zin
                      geworden; de volledige uitsplitsing staat in de tooltip.
   · Blijft liggen  — het gevaarlijkste getal, want dit werk heeft al een
                      status en lijkt dus afgehandeld. Was een eigen kaart met
                      zeven statuschips; nu één aantal met een doorklik. Welke
                      status hoeveel bijdraagt staat in de tooltip, en na de
                      doorklik in de statusdropdown ernaast.
   · Klaar om voor  — wat deze pijplijn oplevert. Dat de AM erop wacht is
     te stellen       precies de reden dat het niet mag verdwijnen.
   · Videocalls     — geen actie op dit scherm, maar wel de weekbelasting.
     deze week        Als stille tekst mee in de regel.
   Vervallen als eigen tegel: 'Vandaag binnen' (zit al ín Op Nieuw — het staat
   nu als bijzin in dezelfde regel) en 'Zonder vacature' (heeft al een melding
   mét knop boven de lijst én een filter; drie keer hetzelfde is twee keer te
   veel).

   De regel volgt je statusfilter. Sta je in 'Potentieel', dan is dát je
   stapel en werkt de knop díé weg. Zo is er één wegwerkknop op het scherm in
   plaats van twee die verschillende dingen doen. */
function tekenDoenregel(basis){
  const el = document.getElementById('rc_doen'); if(!el) return;
  if(!leads().length){ el.innerHTML = ''; return; }
  basis = basis || leadsGefilterd(true);
  const c = cijfers();

  /* Op een eindstation valt niets weg te werken; dan gaat de regel weer over
     Nieuw, want dát blijft het werk dat wacht. */
  const status = CRM.LEAD_OPEN.includes(S.l.status) ? S.l.status : 'Nieuw';
  const stapel = basis.filter(l => CRM.leadIs(l.status, status));

  /* Wat blijft liggen, over álle openstaande statussen binnen je filters — dus
     niet alleen de kolom waar je toevallig in kijkt. */
  const perStil = CRM.LEAD_OPEN.map(s => ({s, n:basis.filter(l => CRM.leadIs(l.status, s) && stilstand(l)).length}))
                               .filter(x => x.n);
  const stilTot = perStil.reduce((n,x) => n + x.n, 0);
  const stilUitleg = 'Langer stil dan bij die stap hoort:\n' +
    perStil.map(x => `· ${x.s}: ${x.n} — ${(STATUS_NORM[x.s]||{}).waarom || ''}`).join('\n');

  /* Linkerkant: het getal, waar het op staat, en in één zin hoe erg het is. */
  let links, knop = '', streep = false;
  if(stapel.length){
    let zin, rest = '', dringend = false, tip;
    if(status === 'Nieuw'){
      const g = {vandaag:0, letop:0, telang:0};
      stapel.forEach(l => {
        const n = leadDagen(l);
        if(n == null || n < NIEUW_LETOP) g.vandaag++;
        else if(n < NIEUW_TELANG) g.letop++;
        else g.telang++;
      });
      dringend = g.telang > 0;
      /* Alleen het deel dat te lang ligt krijgt kleur. 'Vandaag binnen' is geen
         waarschuwing maar context, en die in dezelfde tint zetten maakt van een
         normale ochtend een alarm. */
      zin = (g.telang ? `${g.telang} ${g.telang===1?'ligt':'liggen'} er ${NIEUW_TELANG} dagen of langer`
                      : `oudste: ${c.oudste === 0 ? 'vandaag binnen' : c.oudste + ' dag' + (c.oudste===1?'':'en')}`);
      rest = `${g.vandaag} vandaag binnen`;
      tip = `${g.vandaag} van vandaag · ${g.letop} van 1–${NIEUW_TELANG-1} dagen · ${g.telang} van ${NIEUW_TELANG} dagen of ouder`;
    } else {
      const stil = stapel.filter(stilstand).length;
      const nrm = STATUS_NORM[status] || {};
      dringend = stil > 0;
      zin = stil ? `${stil}× ${nrm.doe || 'staat hier te lang'}` : 'niets staat hier te lang';
      tip = nrm.waarom || '';
    }
    links = `<div class="rc-doentel" title="${h(tip)}"><b class="num">${stapel.length}</b>
        <span>op ${h(status)}</span></div>
      <span class="rc-doenzin"><em class="${dringend ? 'op' : ''}">${h(zin)}</em>${
        rest ? ` · ${h(rest)}` : ''}</span>`;
    knop = `<button class="btn" id="rc_werkaf">Wegwerken →</button>`;
    streep = dringend;
  } else {
    /* "Niets meer op Nieuw" rekende ooit op de gefilterde lijst en zei dus dat
       je klaar was terwijl er negen mensen buiten je filter zaten te wachten.
       Daarom telt hij er altijd bij hoeveel er buiten beeld vallen. */
    const buiten = leads().filter(l => CRM.leadIs(l.status, status) && !(l.kandidaat_id && !l._kand)).length;
    links = buiten
      ? `<span class="rc-doenop">•</span>
         <b class="rc-doenklaar">Binnen je filters staat niets op ${h(status)}</b>
         <span class="rc-doenzin">Daarbuiten nog wel: ${buiten} sollicitant${buiten===1?'':'en'}.
           <button class="rc-lnk" id="rc_filterweg">Filters wissen</button></span>`
      : `<span class="rc-doenop klaar">✓</span>
         <b class="rc-doenklaar">Niets staat meer op ${h(status)}</b>
         <span class="rc-doenzin">${status === 'Nieuw'
            ? 'Elke binnengekomen reactie heeft een volgende status gekregen.'
            : 'Deze stap wacht nergens op.'}</span>`;
  }

  /* Belafspraken-regel (herontwerp 3 sep 2026, drie agents onafhankelijk):
     werkstroom nr. 1 van de dag krijgt de eerste regel — alleen zichtbaar
     als er iets te bellen valt. Intakes tellen niet mee: dat zijn geen
     belafspraken. "Bel af →" start de belafsprakenronde. */
  const belStapel = basis.filter(l => belRang(l) === 0 && !CRM.leadIs(l.status, 'Intake ingepland'));
  const belVerlopen = belStapel.filter(l => String(l.opvolgen_op).slice(0,10) < CRM.todayISO()).length;
  const belVandaag = belStapel.length - belVerlopen;
  const eersteT = belStapel
    .filter(l => l.terugbel_om && String(l.opvolgen_op).slice(0,10) === CRM.todayISO())
    .map(l => new Date(l.terugbel_om)).filter(d => !isNaN(d)).sort((a,b) => a - b)[0];
  const belregel = belStapel.length ? `
    <div class="rc-doen rc-doenbel">
      <span class="rc-doenzin">☎ <b class="num">${belVandaag || belStapel.length}</b>
        ${belVandaag ? `belafspra${belVandaag===1?'ak':'ken'} vandaag` : `verlopen belafspra${belStapel.length===1?'ak':'ken'}`}${
        eersteT ? ` · eerste <b class="num">${eersteT.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}</b>` : ''}${
        belVandaag && belVerlopen ? ` · <span class="num">${belVerlopen}</span> verlopen` : ''}</span>
      <div class="spacer"></div>
      <button class="btn sm" id="rc_belaf">Bel af →</button>
    </div>` : '';

  el.innerHTML = `${belregel}
    <div class="rc-doen${streep ? ' let' : ''}">
      ${links}
      <div class="spacer"></div>
      <div class="rc-doenrest">
        ${/* Valkuil dicht (motorkap-punt 8): de knop blijft ook staan als het
             filter aanstaat terwijl er 0 blijven liggen — anders is er geen
             uitknop meer en lijkt het scherm onverklaarbaar leeg. */''}
        ${stilTot || S.l.stil ? `<button class="rc-doenfeit ${S.l.stil ? 'on' : ''}" id="rc_stil"
            aria-label="${stilTot} ${stilTot===1?'blijft':'blijven'} liggen — toon alleen die"
            title="${h(stilUitleg)}"><b class="num">${stilTot}</b> ${
              S.l.stil ? (stilTot===1?'blijft':'blijven') + ' liggen — toon weer alles'
                       : (stilTot===1?'blijft':'blijven') + ' liggen'}</button>` : ''}
        <button class="rc-doenfeit" id="rc_klaarvoor"
          aria-label="${c.klaar.length} klaar om voor te stellen — open de voorraad"
          title="Intake gehad, kaart compleet — wacht op een klant. Doorklikken opent de hele voorraad bij Kandidaten."
          ><b class="num">${c.klaar.length}</b> klaar om voor te stellen →</button>
        <span class="meta" title="Geplande calls bij de sollicitanten plus intakes die al als kandidaat staan"
          ><b class="num">${c.calls}</b> videocall${c.calls===1?'':'s'} deze week</span>
      </div>
      ${knop}
    </div>`;

  const wa = el.querySelector('#rc_werkaf');
  if(wa) wa.onclick = () => wegwerkModus(status);
  const ba = el.querySelector('#rc_belaf');
  if(ba) ba.onclick = () => wegwerkModus('__bel');
  const wis = el.querySelector('#rc_filterweg');
  if(wis) wis.onclick = () => { wisFilters(); alles(); };
  const stil = el.querySelector('#rc_stil');
  /* Doorklik op "blijft liggen": hetzelfde filter als de oude wachtkamerkaart,
     alleen zonder status erbij — welke stap je daarna wilt zien kies je in de
     dropdown ernaast, die de tellers per status toont. */
  if(stil) stil.onclick = () => { S.l.stil = !S.l.stil; wisSelectie(); tekenWerk(); };
  const kl = el.querySelector('#rc_klaarvoor');
  if(kl) kl.onclick = () => naarVoorraad();
}

/* Het werkvlak: bord of lijst, met dezelfde filters en dezelfde acties.
   Heette tekenLijst toen er alleen een lijst was. */
/* Vers-goud-melding (motorkap-punt 4): een Hoog/Gekwalificeerd-lead die
   live binnenkomt verdient meer dan een stille hertekening. Eén Set met
   wat we al zagen; de eerste opbouw meldt niets (dat is de beginstand). */
let goudGezien = null;
function meldVersGoud(){
  if(!goudGezien){ goudGezien = new Set(leads().filter(versGoud).map(l => l.id)); return; }
  leads().filter(versGoud).forEach(l => {
    if(goudGezien.has(l.id)) return;
    goudGezien.add(l.id);
    toastLink(`${leadNaam(l)} — ${String(l.bot_status||'').trim()==='Gekwalificeerd' ? 'Gekwalificeerd' : 'prioriteit Hoog'} net binnen`, 'Nu bellen', () => openLead(l.id));
  });
}

function tekenWerk(){
  if(S.wwOpen){ S.wwHerteken = true; return; }
  bouwDubbel();
  wisBelIndex();   // er kan sinds de vorige hertekening gelogd zijn
  meldVersGoud();
  /* Eén keer uitrekenen: de doen-regel én de tellers in de statusdropdown
     rekenen op dezelfde basis — alles behalve het statusfilter zelf. */
  const basis = leadsGefilterd(true);
  tekenDoenregel(basis);
  vulStatusSelect(basis);
  vulBotSelect(leadsGefilterd(false, true));
  vulEigSelect(leadsGefilterd(false, false, true));
  vulKeuzeTellers();
  zetFilterstand();
  /* De meldingen staan boven het werkvlak en niet eronder: ze gelden voor bord
     én lijst, en een lijst van tweehonderd regels duwt een voetnoot buiten beeld. */
  const w = document.getElementById('rc_waarsch');
  if(w) w.innerHTML = waarschuwingenHtml();
  tekenActieveFilters();
  const wrap = document.getElementById('rc_lijst'); if(!wrap) return;
  const rijen = weergave() === 'bord' ? leadsGefilterd(true) : leadsGefilterd();
  const telling = document.getElementById('rc_telling');
  /* Kort gehouden zodat de telling en de weergaveschakelaar op dezelfde regel
     als de filters passen; het hele woord staat in de tooltip. */
  /* Eerlijke noemer (motorkap-punt 6): overgedragen leads (kandidaat_id
     gezet) kunnen nooit in beeld komen en tellen dus niet mee — anders
     belooft de telling een totaal dat "Toon alles" nooit waarmaakt. */
  const totaalToonbaar = leads().filter(l => !(l.kandidaat_id && !l._kand)).length;
  if(telling){
    telling.textContent = rijen.length + ' van ' + totaalToonbaar;
    telling.title = rijen.length + ' van ' + totaalToonbaar + ' sollicitanten in beeld';
  }

  if(!rijen.length){
    /* Onderscheid maken tussen "nog niets binnengekomen" en "je filters
       verbergen alles" — anders stuurt de lege staat je naar filters die
       je helemaal niet hebt aanstaan. */
    wrap.className = '';
    /* De lege staat benoemt de wérkelijk actieve filters en heeft een
       uitknop (herontwerp 3 sep 2026) — de oude tekst somde filters op
       die allang niet meer bestonden. */
    const fs = actieveFilters();
    wrap.innerHTML = leads().length
      ? CRM.ui.leeg('Geen sollicitanten met deze filters',
          (fs.length ? 'Actief: ' + fs.map(f => f.lbl).join(' · ') + '. ' : '')
            + 'Er staan er wel ' + totaalToonbaar + ' in het systeem.',
          '<button class="btn" id="rc_leegwis">Toon alles</button>')
      : CRM.ui.leeg('Nog geen sollicitanten binnen',
          'Reacties via Meta, Indeed of het formulier komen hier binnen. Je kunt er ook zelf een toevoegen met + Sollicitant, of een lijst importeren.');
    const lw = wrap.querySelector('#rc_leegwis');
    if(lw) lw.onclick = () => { wisFilters(); alles(); };
    return;
  }
  if(weergave() === 'bord'){
    /* Kolomscroll bewaren over een hertekening heen (motorkap-punt 15):
       zonder dit springt elke kolom naar boven bij elke realtime-sync. */
    const scrolls = Array.from(wrap.querySelectorAll('.bcol-b')).map(e => e.scrollTop);
    tekenLeadBord(wrap, rijen);
    Array.from(wrap.querySelectorAll('.bcol-b')).forEach((e, j) => { if(scrolls[j]) e.scrollTop = scrolls[j]; });
  }
  else tekenLeadTabel(wrap, rijen);
}
/* Oude naam, nog gebruikt vanuit de import- en cv-flows. */
const tekenLijst = () => tekenWerk();

function tekenLeadTabel(wrap, rijen){
  const toon = rijen.slice(0,200);
  /* Alleen wat in beeld staat kan geselecteerd zijn — een selectie die
     buiten de eerste 200 valt zou meedoen zonder dat je hem ziet. */
  const zichtbaar = new Set(toon.map(l => String(l.id)));
  S.sel.forEach(id => { if(!zichtbaar.has(id)) S.sel.delete(id); });
  const alleAan = toon.length && toon.every(l => S.sel.has(String(l.id)));
  wrap.className = '';
  wrap.innerHTML = `
    <div id="rc_bulk"></div>
    <div class="tblwrap">
      <table class="tbl rc-tbl">
        <thead><tr>
          <th style="width:30px"><input type="checkbox" id="rc_alle" ${alleAan?'checked':''}
            title="Alles in beeld selecteren"></th>
          <th>Sollicitant</th><th>Contact</th>
          <th>Reageerde op</th><th>Agent</th><th style="width:236px">Status</th>${
            S.l.eig ? '' : '<th>Eigenaar</th>'}<th class="n">Binnen</th>
        </tr></thead>
        <tbody>${toon.map(rijHtml).join('')}</tbody>
      </table>
    </div>
    ${rijen.length > 200 ? `<p class="meta" style="margin:10px 2px">Eerste 200 van ${rijen.length} getoond — verfijn je filter.</p>` : ''}`;

  tekenBulkbalk();
  /* De vinkjes zitten in de rij, dus een klik erop mag de kaart niet openen.
     Shift maakt er een reeks van — wie dertig regels van dezelfde campagne
     wil koppelen, klikt de eerste en shift-klikt de laatste. */
  let laatsteIdx = -1;
  CRM.$$('input.rc-vink', wrap).forEach((box, idx) => {
    box.onclick = e => {
      e.stopPropagation();
      const aan = box.checked;
      const van = (e.shiftKey && laatsteIdx >= 0) ? Math.min(laatsteIdx, idx) : idx;
      const tot = (e.shiftKey && laatsteIdx >= 0) ? Math.max(laatsteIdx, idx) : idx;
      CRM.$$('input.rc-vink', wrap).forEach((b2, j) => {
        if(j < van || j > tot) return;
        b2.checked = aan;
        if(aan) S.sel.add(b2.dataset.id); else S.sel.delete(b2.dataset.id);
      });
      laatsteIdx = idx;
      tekenBulkbalk();
      const kop = wrap.querySelector('#rc_alle');
      if(kop) kop.checked = toon.length && toon.every(l => S.sel.has(String(l.id)));
    };
  });
  const kop = wrap.querySelector('#rc_alle');
  if(kop) kop.onclick = () => {
    if(kop.checked) toon.forEach(l => S.sel.add(String(l.id)));
    else S.sel.clear();
    CRM.$$('input.rc-vink', wrap).forEach(b => b.checked = kop.checked);
    tekenBulkbalk();
  };
  CRM.$$('tr.clickable', wrap).forEach(tr => tr.onclick = () => openLead(tr.dataset.id));
  CRM.$$('select.rc-stsel', wrap).forEach(sel => {
    sel.onclick = e => e.stopPropagation();
    sel.onchange = e => {
      e.stopPropagation();
      const l = leadById(sel.dataset.id);
      /* '→ Talentpool' is geen status maar een handeling (Tjeerd, 3 sep
         2026: "moet gewoon een status zijn die je kan zien en klikken"):
         opent Kandidaat maken met het talentpool-vinkje al aan; de
         AM-status blijft wat hij was. */
      if(sel.value === '__talentpool'){
        sel.value = CRM.leadNorm(l && l.status) || 'Nieuw';
        return doorschietForm(l, {talentpool:true});
      }
      zetStatus(l, sel.value);
    };
  });
  CRM.$$('a.rc-tel', wrap).forEach(a => a.onclick = e => e.stopPropagation());
  bindLeadActies(wrap);
}

function rijHtml(l){
  /* Herontwerp 3 sep 2026 (conceptplan, akkoord Tjeerd): 7 kolommen, één
     botchip, één waarom-nu-chip onder de naam; bron als tekst in de rowsub;
     campagne/kwalificatie/botfase naar de lade en de belronde; eigenaar
     alleen in de iedereen-stand; "Binnen" neutraal. De rij beantwoordt
     precies één vraag: waarom staat deze hier. */
  const v = vacVan(l);
  const bel = belPogingen(l.id);
  const wa = waLink(l.telefoon);
  const st = stilstand(l);
  const ken = bekend(l);
  const dub = ken.leads.length + 1;
  const intake = CRM.leadIs(l.status, 'Intake ingepland');
  const rang = belRang(l);
  const verlopenBel = rang === 0 && !intake
    && String(l.opvolgen_op).slice(0,10) < CRM.todayISO();
  /* De streep is alleen nog het urgentie-radar: rood bij een verlopen
     afspraak of harde stilstand, amber bij een afspraak vandaag of
     beginnende stilstand, anders niets. De statuskleur staat al als dot
     in de select — bewuste afwijking van de app-brede frand-conventie. */
  const rood = verlopenBel || (!!st && st.klas === 'red');
  const amber = !rood && ((rang === 0 && !intake) || !!st);
  const waarom = waaromNuChip(l);
  return `<tr${CRM.ui.frand(amber ? 'var(--amber)' : '', 'clickable' + (st ? ' rc-telang' : ''), rood)} data-id="${h(l.id)}">
    <td><input type="checkbox" class="rc-vink" data-id="${h(l.id)}" ${S.sel.has(String(l.id))?'checked':''}
      aria-label="Selecteer ${h(leadNaam(l))}"></td>
    <td>
      <div class="rc-naam">${h(leadNaam(l))}</div>
      <div class="rowsub">${h(l.woonplaats||'—')}${l.bron?' · '+h(l.bron):''}${(l.cv||l.cv_url)?' · cv':''}${
        dub > 1 ? ` <span class="chip purple num" title="Deze persoon staat ${dub}× in de sollicitantenlijst — mogelijk twee keer gesolliciteerd">×${dub}</span>` : ''}${
        ken.kands.length ? ` · <span class="rc-dub" title="${h('Al bekend als kandidaat: ' + ken.kands.map(eerderTekst).join(' · '))}">al kandidaat</span>` : ''}</div>
      ${waarom ? `<div style="margin-top:5px">${waarom}</div>` : ''}
    </td>
    <td>
      ${l.telefoon ? `<a class="rc-tel num" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">${h(l.telefoon)}</a>
        ${wa?`<a class="rc-tel rc-wa" href="${h(wa)}" target="_blank" rel="noopener" title="WhatsApp">wa</a>`:''}` : '<span class="meta">geen nummer</span>'}
      ${bel ? `<div class="rowsub">${bel}× gebeld</div>` : ''}
    </td>
    <td>${vacCelHtml(l, v)}</td>
    <td>${botChipHtml(l)}</td>
    <td>
      <div class="rc-stwrap" style="--sc:${CRM.leadKleur(l.status)}">
        <select class="rc-stsel" data-id="${h(l.id)}">
          ${statusOptieExtra(l.status)}
          ${CRM.LEAD_STATUS.map(s=>`<option value="${h(s.k)}" ${CRM.leadIs(l.status, s.k)?'selected':''}>${h(s.k)}</option>`).join('')}
          <option value="__talentpool">→ Talentpool (kaart bewaren)</option>
        </select>
      </div>
    </td>
    ${S.l.eig ? '' : `<td>${l.eigenaar
      ? `<span class="num" title="${h(l.eigenaar)}">${h(CRM.initialen(l.eigenaar))}</span>`
      : '<span class="meta">—</span>'}</td>`}
    <td class="n">
      <span class="num" title="Binnengekomen ${h(CRM.fmtDate(l.binnen_op)||'onbekend')}">${h(uurGeleden(l.binnen_op) || '—')}</span></td>
  </tr>`;
}

/* ═══════════════════════════════════════════════════════════════
   MEERDERE SOLLICITANTEN TEGELIJK
   Drie handelingen die je zelden voor één lead doet en bijna altijd voor
   een hele lichting: een campagne aan de goede vacature hangen, een stapel
   in één keer op een status zetten, en een lichting onder een collega
   verdelen. Elk van die drie kostte vier tot vijf klikken per sollicitant.

   Bewust géén verwijderen of doorschieten in bulk. Doorschieten maakt een
   kandidaatkaart en heeft een poortwachter nodig die per persoon geldt;
   verwijderen is onomkeerbaar en hoort niet in een knop die twintig rijen
   tegelijk raakt.
   ═══════════════════════════════════════════════════════════════ */
const selectie = () => Array.from(S.sel).map(leadById).filter(Boolean);

function tekenBulkbalk(){
  const el = document.getElementById('rc_bulk'); if(!el) return;
  const n = S.sel.size;
  if(!n){ el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="rc-bulk">
      <b class="num">${n}</b><span>geselecteerd</span>
      <button class="btn sm" data-b="status">Status wijzigen…</button>
      <button class="btn ghost sm" data-b="vac">Vacature koppelen…</button>
      <button class="btn ghost sm" data-b="eig">Eigenaar toewijzen…</button>
      <button class="btn ghost sm" data-b="app">WhatsApp: nieuwe vacature…</button>
      <div class="spacer"></div>
      <button class="btn sub sm" data-b="wis">Selectie wissen</button>
    </div>`;
  const doe = {status:bulkStatus, vac:bulkVacature, eig:bulkEigenaar, app:bulkReactivatie,
               wis:() => { wisSelectie(); tekenWerk(); }};
  CRM.$$('[data-b]', el).forEach(b => b.onclick = () => doe[b.dataset.b]());
}

/* Na een bulkbewerking: opslaan is gedaan, nu het scherm bij. */
function naBulk(tekst){
  wisSelectie();
  CRM.toast(tekst, 'ok');
  tekenKop(); tekenTabs(); tekenWerk(); CRM.navBadges();
}

function bulkStatus(){
  const rijen = selectie(); if(!rijen.length) return;
  /* Kandidaat maken staat hier met opzet niet tussen: daar hoort een
     kandidaatkaart bij en die vraagt per persoon om complete gegevens. */
  const keuzes = CRM.LEAD_STATUS;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${rijen.length} sollicitant${rijen.length===1?'':'en'} verplaatsen</div>
      <p class="sub" style="margin:6px 0 0">Kies de status. Wie er al op staat blijft ongemoeid.</p></div>
    <div class="modal-b"><div class="rc-fasepick">
      ${keuzes.map(s => `<button data-s="${h(s.k)}"><i class="dot" style="background:${s.c}"></i>${h(s.k)}</button>`).join('')}
    </div>
    <p class="meta" style="margin:12px 2px 0">Kandidaat maken staat er niet bij — daar hoort een complete kaart bij, en dat gaat per persoon.</p></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      CRM.$$('[data-s]', m).forEach(b => b.onclick = async () => {
        CRM.modal.close();
        let n = 0;
        for(const l of rijen){ if(await pasStatusToe(l, b.dataset.s)) n++; }
        naBulk(`${n} sollicitant${n===1?'':'en'} op ${b.dataset.s} gezet`);
      });
    }});
}

/* ─── Reactivatie: nieuwe_vacature-template via de bot ────────────
   De geselecteerde leads krijgen via Smits n8n de goedgekeurde
   WhatsApp-template met een vacaturetekst (Tjeerd, 28 aug 2026 —
   gericht heractiveren in plaats van iedereen spammen). Alleen
   botleads kunnen dit: de bot kent alleen zijn eigen lead_id's; de
   rest wordt eerlijk benoemd en overgeslagen. Er gaan ÉCHTE
   WhatsApp-berichten uit, dus een expliciete bevestiging met het
   aantal, en een logregel per lead. De aanroep loopt via de database
   (RPC webhook_naar_bot): geen sleutels of URL's in de frontend, en
   alleen ingelogde teamleden kunnen hem doen. */
function bulkReactivatie(){
  const rijen = selectie(); if(!rijen.length) return;
  CRM.reactivatieModal(rijen.map(l => ({
    leadId: String(l.id).startsWith('l:') ? String(l.id) : '',
    naam: leadNaam(l), logEntiteit: 'lead', logRef: String(l.id)
  })), () => naBulk('Template onderweg'));
}

/* Gedeeld met Sourcing (js/source.js): daar wordt dezelfde template naar
   kandidaten mét kaart gestuurd — mensen die ooit via de bot binnenkwamen
   dragen hun lead_id op de kaart (Tjeerd, 28 aug 2026: "kunnen we de bot
   ook doen met kandidaten waarbij we de kandidatenkaart aanmaken?").
   `personen` = [{leadId, naam, logEntiteit, logRef}]; wie geen leadId in
   botvorm ('l:…') heeft kan niet — de bot kent alleen zijn eigen leads,
   en alleen díe mensen hebben het WhatsApp-kanaal zelf geopend. */
CRM.reactivatieModal = function(personen, naAfloop){
  const bot  = personen.filter(p => String(p.leadId||'').startsWith('l:'));
  const rest = personen.length - bot.length;
  if(!bot.length) return CRM.toast('Niemand in deze selectie kwam via de bot binnen — de bot kan alleen appen met mensen die zelf ooit via WhatsApp reageerden','err');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe vacature appen</div>
      <p class="sub" style="margin:6px 0 0">De bot stuurt de goedgekeurde WhatsApp-template naar
      ${bot.length} ${bot.length===1?'persoon':'personen'}${rest ? ` — ${rest} zonder botkoppeling ${rest===1?'wordt':'worden'} overgeslagen (nooit via WhatsApp gereageerd)` : ''}.</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="ra_txt">Vacaturetekst (komt letterlijk in het bericht)</label>
        <textarea id="ra_txt" rows="3" placeholder="Bijv. Productiemedewerker, regio Gouda, dagdienst"></textarea>
        <span class="hint">Geen klantnaam noemen — voor bedrijfsdetails verwijst de bot naar de AM.</span></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button><span class="spacer"></span>
      <button class="btn" id="ra_ok">Versturen naar ${bot.length}</button>
    </div>`, {onOpen(m){
      const ok = m.querySelector('#ra_ok');
      ok.onclick = async () => {
        const tekst = m.querySelector('#ra_txt').value.trim();
        if(!tekst) return CRM.toast('Vul de vacaturetekst in','err');
        ok.disabled = true; ok.textContent = 'Bezig…';
        if(!CRM.demo){
          const {error} = await CRM.sb.rpc('webhook_naar_bot',
            {actie:'reactivatie', payload:{lead_ids: bot.map(p => p.leadId), vacancy_text: tekst}});
          if(error){
            CRM.fout('Versturen mislukt', error);
            ok.disabled = false; ok.textContent = 'Versturen naar ' + bot.length;
            return;
          }
          for(const p of bot)
            await CRM.logActiviteit(p.logEntiteit, p.logRef, 'whatsapp', `nieuwe_vacature-template gestuurd: "${tekst}"`);
        }
        CRM.modal.close();
        CRM.toast(`Template onderweg naar ${bot.length} ${bot.length===1?'persoon':'personen'}`,'ok');
        if(naAfloop) naAfloop();
      };
    }});
};

function bulkVacature(){
  const rijen = selectie(); if(!rijen.length) return;
  const alle = (CRM.state.vacs||[]).slice().sort((a,b) => vacLabel(a).localeCompare(vacLabel(b)));
  if(!alle.length) return CRM.toast('Er staan nog geen vacatures in het systeem','err');
  const alGekoppeld = rijen.filter(isGekoppeld).length;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Vacature koppelen aan ${rijen.length} sollicitant${rijen.length===1?'':'en'}</div>
      <p class="sub" style="margin:6px 0 0">Hierop rust de meting leads per vacature en per klant.</p></div>
    <div class="modal-b">
      ${alGekoppeld ? `<div class="note warn" style="margin-bottom:12px">${alGekoppeld} van deze ${
        alGekoppeld===1?'sollicitant is':'sollicitanten zijn'} al aan een vacature gekoppeld. Die koppeling wordt overschreven.</div>` : ''}
      <div class="f-row"><label for="bv_vac">Vacature</label>
        <select id="bv_vac"><option value="">— kies de vacature —</option>
          ${alle.map(v=>`<option value="${h(v.id)}">${h(vacLabel(v))}</option>`).join('')}</select></div>
      <div class="note err" id="bv_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="bv_ok">Koppelen</button></div>`, {onOpen(m){
      m.querySelector('#bv_ok').onclick = async () => {
        const v = vacById(m.querySelector('#bv_vac').value);
        if(!v){ const e = m.querySelector('#bv_err'); e.style.display=''; e.textContent = 'Kies een vacature.'; return; }
        CRM.modal.close();
        let n = 0;
        for(const l of rijen){
          if(await bewaarLead(l, {vacature_id:v.id, klant:v.klant, functie:v.functie})){
            await CRM.logActiviteit('lead', l.id, 'systeem', `Gekoppeld aan ${v.functie} · ${v.klant}`);
            n++;
          }
        }
        naBulk(`${n} sollicitant${n===1?'':'en'} gekoppeld aan ${v.functie} · ${v.klant}`);
      };
    }});
}

async function bulkEigenaar(){
  const rijen = selectie(); if(!rijen.length) return;
  const naam = await CRM.vraag(`Eigenaar van ${rijen.length} sollicitant${rijen.length===1?'':'en'}`, {
    waarde:CRM.me(), knop:'Toewijzen',
    hint:'Wie deze sollicitanten oppakt. Leeg laten kan niet — dan weet niemand van wie ze zijn.'});
  if(!naam) return;
  let n = 0;
  for(const l of rijen){ if(await bewaarLead(l, {eigenaar:naam})) n++; }
  naBulk(`${n} sollicitant${n===1?'':'en'} toegewezen aan ${naam}`);
}

/* De cel "Reageerde op". Drie toestanden die echt verschillen:
   gekoppeld · nooit gekoppeld · gekoppeld aan iets wat niet meer bestaat. */
function vacCelHtml(l, v){
  if(v) return `<div>${h(v.functie)}</div><div class="rowsub">${h(v.klant)}</div>`;
  if(vacWeg(l)) return `<div><span class="chip amber">vacature bestaat niet meer</span></div>
    ${losFunctie(l) ? `<div class="rowsub">was: ${h(losFunctie(l))}</div>` : ''}
    <button class="btn ghost sm rc-koppel" data-koppel="${h(l.id)}">Opnieuw koppelen</button>`;
  /* De koppelknop alleen in de zonder-vacature-weergave (herontwerp 3 sep
     2026): honderden knoppen in de gewone belwerklijst waren bijwerk-ruis;
     de retro-koppeling in Instellingen doet het bulk-werk toch al. */
  const knop = S.l.zvac ? `<div><button class="btn ghost sm rc-koppel" data-koppel="${h(l.id)}">Koppel vacature</button></div>` : '';
  return `${losFunctie(l)
    ? `<div class="rowsub">${h(losFunctie(l))}${l.klant?' · '+h(l.klant):''}</div>`
    : `<span class="meta">— geen vacature —</span>`}${knop}`;
}

/* Hier stonden vier snelknoppen (geen gehoor / potentieel / geen interesse /
   niet geschikt) onder elke lead op Nieuw. Eruit gehaald op 31 jul 2026: ze
   deden precies wat de statuslijst ernaast al doet, namen twee regels in een
   smalle kolom en braken af over twee regels. Snel wegwerken hoort in de
   wegwerkmodus (knop "Wegwerken →"), waar één toets per lead genoeg is —
   dat is sneller dan klikken in een lijst, en het houdt de lijst leesbaar. */

function bindLeadActies(wrap){
  CRM.$$('[data-koppel]', wrap).forEach(b => b.onclick = e => {
    e.stopPropagation();
    koppelVacature(leadById(b.dataset.koppel));
  });
  CRM.$$('[data-lstat]', wrap).forEach(b => b.onclick = e => {
    e.stopPropagation();
    statusPicker(b.dataset.lstat);
  });
}

/* ─── Actieve filters, onmisbaar zichtbaar (herontwerp 3 sep 2026) ──
   Een chips-rij met kruisjes onder de filterbalk: elk actief filter is
   één klik om weg te halen, en de rij verdwijnt vanzelf als er niets
   actief is. Dit maakt "ik zie niets en snap niet waarom" structureel
   onmogelijk zonder de balk zelf drukker te maken. */
function actieveFilters(){
  const f = S.l, uit = [];
  const optieTekst = (id, val) => {
    const s = document.getElementById(id);
    const o = s && Array.from(s.options).find(x => x.value === String(val));
    return o ? o.textContent.replace(/\s*\(\d+\)\s*$/,'').trim() : String(val);
  };
  if(f.q)      uit.push({lbl:'zoek: ' + f.q,                 wis(){ S.l.q = ''; const i = document.getElementById('rc_q'); if(i) i.value = ''; }});
  if(f.status) uit.push({lbl:'status: ' + f.status,          wis(){ S.l.status = ''; }});
  if(f.bot)    uit.push({lbl:'bot: ' + f.bot,                wis(){ S.l.bot = ''; }});
  if(f.bron)   uit.push({lbl:'bron: ' + f.bron,              wis(){ S.l.bron = ''; }});
  if(f.klant)  uit.push({lbl:'klant: ' + optieTekst('rc_klant', f.klant), wis(){ S.l.klant = ''; const s = document.getElementById('rc_klant'); if(s) s.value = ''; }});
  if(f.vac)    uit.push({lbl:'vacature: ' + optieTekst('rc_vac', f.vac),  wis(){ S.l.vac = ''; const s = document.getElementById('rc_vac'); if(s) s.value = ''; }});
  if(f.zvac)   uit.push({lbl:'zonder vacature',              wis(){ S.l.zvac = false; const s = document.getElementById('rc_vac'); if(s) s.value = ''; }});
  if(f.eig)    uit.push({lbl:f.eig === CRM.naamNorm(CRM.me()) ? 'Van mij' : 'eigenaar: ' + optieTekst('rc_eigfil', f.eig), wis(){ S.l.eig = ''; }});
  if(f.stil)   uit.push({lbl:'blijft liggen',                wis(){ S.l.stil = false; }});
  return uit;
}
function tekenActieveFilters(){
  const el = document.getElementById('rc_actief'); if(!el) return;
  const fs = actieveFilters();
  if(!fs.length){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="rc-actief">${fs.map((f, i) =>
      `<button class="chip rc-fchip" data-fi="${i}" title="Filter weghalen">${h(f.lbl)} <b>×</b></button>`).join('')}${
    fs.length > 1 ? `<button class="chip btn-like" id="rc_fwis">Alles wissen</button>` : ''}</div>`;
  CRM.$$('.rc-fchip', el).forEach(b => b.onclick = () => {
    const f = fs[+b.dataset.fi]; if(f){ f.wis(); wisSelectie(); tekenWerk(); }
  });
  const wis = el.querySelector('#rc_fwis');
  if(wis) wis.onclick = () => { wisFilters(); alles(); };
}

function waarschuwingenHtml(){
  /* De dagelijkse "niet gekoppeld"-balk is weg (herontwerp 3 sep 2026):
     de telling staat nu in de vacature-dropdown als "— zonder vacature —
     (N)", en dat is meteen de weergave waarin je ze bijwerkt. Alleen de
     échte fout blijft hier staan: statussen die niet bestaan. */
  const vreemd = leads().filter(l => !statusBestaat(l.status));
  if(!vreemd.length) return '';
  return `<div class="note warn" style="margin-bottom:14px">
    ${vreemd.length} ${vreemd.length===1?'sollicitant staat':'sollicitanten staan'} op een status die niet meer bestaat
    (${h(Array.from(new Set(vreemd.map(l => l.status || '(leeg)'))).join(', '))}).
    ${vreemd.length===1?'Die valt':'Die vallen'} buiten de kolommen — kies in de lijst een geldige status.</div>`;
}

/* ─── De afsluiting: klaar om voor te stellen ─────────────────────
   Wie de videocall heeft gehad is hier klaar. De kandidaatkaart staat op
   fase 'Intake' en verschijnt daarmee bewust níét op het bord van de
   Klanttrajecten — dat bord begint bij 'Voorgesteld'. Zonder deze regel
   zou die kandidaat nergens meer te zien zijn: de recruiter is klaar en
   de AM weet niet dat er iemand klaarstaat. */
function klaarKandidaten(){
  return CRM.kandidaten().filter(CRM.klaarOmVoorTeStellen)
    .sort((a,b) => String(b.since||'').localeCompare(String(a.since||'')));
}
/* De hele voorraad staat bij Kandidaten onder het statusfilter
   'gekwalificeerd' — precies wat hier uit rolt. Daarheen doorklikken zorgt dat
   de recruiter en de AM naar hetzelfde lijstje kijken in plaats van naar twee
   verschillende tellingen. */
const naarVoorraad = () => CRM.ga('kandidaten', {status:'gekwalificeerd'});

function klaarRegelHtml(){
  const k = klaarKandidaten();
  if(!k.length) return `<div class="rc-klaar leeg"><b>Klaar om voor te stellen</b>
    <span class="meta">Nog niemand. Wie de videocall heeft gehad komt hier te staan, klaar voor de AM.</span></div>`;
  const toon = k.slice(0,24);
  return `<div class="rc-klaar">
    <div class="rc-klaarkop"><b>Klaar om voor te stellen</b><span class="num">${k.length}</span>
      <span class="meta">intake gehad · wacht op een klant — daarna gaat het verder bij Klanttrajecten</span>
      <button class="btn ghost sm" data-voorraad>Hele voorraad →</button></div>
    <div class="rc-klaarrij">${toon.map(c => `<button class="rc-naamchip" data-klaar="${h(c.id)}">${h(c.naam)}<em>${
      h(c.functie || '—')}${c.intake && c.intake.cijfer ? ' · ' + h(c.intake.cijfer) + '/10' : ''}</em></button>`).join('')}
      ${k.length > toon.length ? `<button class="btn ghost sm" data-voorraad>+ ${k.length - toon.length} meer</button>` : ''}</div>
  </div>`;
}
function bindKlaar(wrap){
  CRM.$$('[data-klaar]', wrap).forEach(b => b.onclick = () => CRM.ga('kandidaten', {id:b.dataset.klaar}));
  CRM.$$('[data-voorraad]', wrap).forEach(b => b.onclick = () => naarVoorraad());
}

/* ═══════════════════════════════════════════════════════════════
   HET BORD — kolommen per status, slepen, teller per kolom
   Opzet 1-op-1 die van de Klanttrajecten (js/pijplijn.js): dezelfde
   .board/.bcol/.bcard uit base.css en dezelfde smalle strook ernaast
   voor de eindstations. Zo voelt het bord van de recruiter hetzelfde
   als dat van de AM, zonder dat de twee modules elkaars code aanraken.
   ═══════════════════════════════════════════════════════════════ */
/* Kolommen = het werk (de vier open statussen). Het eindstation 'Niet
   geschikt' staat in de strook ernaast: dat is geen fase waar je doorheen
   loopt, maar een plek waar iets stopt. De overdracht (kandidaat gemaakt)
   krijgt ook geen kolom — dat is geen status meer maar een kandidaat_id,
   en de kandidaten die klaarstaan vormen de laatste kolom. */
const BORD_MAX = 50;                    // kaarten per kolom; de rest achter een teller

function tekenLeadBord(wrap, rijen){
  wrap.className = 'rc-leadbord';
  wrap.innerHTML = `<div class="rc-bordwrap"><div class="board" id="rc_board"></div>
    <div class="rc-uit" id="rc_eind"></div></div>`;
  const board = wrap.querySelector('#rc_board');

  const kolommen = CRM.LEAD_OPEN.map(k => {
    const st = CRM.LEAD_STATUS.find(s => s.k === k) || {k, c:'#8a927c'};
    const kaarten = k === 'Nieuw'
      ? oudsteEerst(rijen.filter(l => CRM.leadIs(l.status, k)))  // oudste bovenaan: die moet eerst weg
      : rijen.filter(l => CRM.leadIs(l.status, k));
    const toon = kaarten.slice(0, BORD_MAX);
    /* Eén regel per kolom: hoeveel er over de grens van deze stap heen is.
       Elke kolom kan een wachtkamer worden, niet alleen 'Nieuw'. */
    const stil = kaarten.filter(stilstand).length;
    const norm = STATUS_NORM[k] || {};
    let kop = stil
      ? `<div class="rc-letnote num" title="${h(norm.waarom||'')}">${stil}× ${h(norm.doe || 'staat hier te lang')}</div>`
      : '';
    return `<div class="bcol" data-status="${h(k)}" style="--ph:${st.c}">
      <div class="bcol-h"><b>${h(k)}</b><span class="cnt num">${kaarten.length}</span>
        ${kaarten.length ? `<button class="rc-kolwerk" data-werk="${h(k)}" title="Deze kolom achter elkaar afwerken met de cijfertoetsen">werk af</button>` : ''}</div>
      <div class="bcol-b">${kop}${toon.map(leadKaartHtml).join('') || `<div class="rc-leegkol">${h(leegTekst(k))}</div>`}
        ${kaarten.length > toon.length ? `<div class="rc-meer num">+ ${kaarten.length - toon.length} meer — filter of zoek om ze te zien</div>` : ''}
      </div></div>`;
  }).join('');

  /* Afsluitende kolom: geen leads maar kandidaten. Bewust een andere kop en
     geen sleepdoel — hier houdt de recruitmentpijplijn op. */
  const klaar = klaarKandidaten();
  const klaarKol = `<div class="bcol rc-overdracht" style="--ph:${CRM.faseKleur('Intake')}">
    <div class="bcol-h"><b>Klaar om voor te stellen</b><span class="cnt num">${klaar.length}</span></div>
    <div class="bcol-b">
      <div class="rc-overnote">Kandidaatkaart compleet, intake gehad. Vanaf hier gaat het verder bij <b>Klanttrajecten</b>.
        <button class="btn ghost sm" data-voorraad style="margin-top:8px;width:100%;justify-content:center">Hele voorraad →</button></div>
      ${klaar.slice(0,BORD_MAX).map(c => `<div class="bcard" data-klaar="${h(c.id)}">
        <div class="bc-t"><div class="bc-n">${h(c.naam)}<div class="bc-s">${h(c.functie||'—')}${c.klant?' @ '+h(c.klant):''}</div></div>
        ${c.rec?`<span class="rc-rec" title="${h(c.rec)}">${h(CRM.initialen(c.rec))}</span>`:''}</div>
        <div class="bc-f">${c.intake && c.intake.cijfer
            ? `<span class="chip ${c.intake.cijfer<7?'amber':'green'} num">intake ${h(c.intake.cijfer)}/10</span>`
            : intakeDone(c) ? '<span class="chip green">intake ✓</span>'
            : '<span class="chip amber" title="De videocall is geweest, de vragenlijst is nog niet ingevuld">intake nog invullen</span>'}
          ${c.intake && c.intake.videocallOp ? `<span class="chip num" title="Datum van de videocall">call ${h(CRM.fmtDateShort(c.intake.videocallOp))}</span>` : ''}
          ${c.woonplaats?`<span class="chip">${h(c.woonplaats)}</span>`:''}</div>
      </div>`).join('') || `<div class="rc-leegkol">Nog niemand klaar.</div>`}
    </div></div>`;
  board.innerHTML = kolommen + klaarKol;

  /* Smalle strook: het eindstation. Slepen naar hier sluit een lead af.
     De teller "kandidaat gemaakt" telt op leads() en niet op de gefilterde
     rijen: overgedragen leads (kandidaat_id) zitten bewust niet meer in de
     werklijst, maar hier is het juist het resultaat dat je wilt zien. */
  const eind = wrap.querySelector('#rc_eind');
  const alle = leads();
  const door = alle.filter(l => !l._kand && l.kandidaat_id).length;
  eind.innerHTML = `<div class="label" style="padding:0 4px 6px">Eindstation</div>` +
    CRM.LEAD_EIND.map(s => {
      const n = rijen.filter(l => CRM.leadIs(l.status, s)).length;
      return `<div class="rc-uitzone" data-status="${h(s)}" style="--ph:${CRM.leadKleur(s)}">
        <b>${h(s)}</b><span class="num">${n}</span><span class="meta">sleep hierheen</span></div>`;
    }).join('') +
    `<div class="rc-uitzone geenslepen" style="--ph:${CRM.faseKleur('Intake')}">
      <b>Kandidaat gemaakt</b><span class="num">${door}</span>
      <span class="meta">via de knop op de kaart — de kandidaatkaart neemt het over</span></div>` +
    `<button class="btn ghost sm" id="rc_naarlijst" style="width:100%;justify-content:center">Als lijst tonen →</button>`;
  eind.querySelector('#rc_naarlijst').onclick = () => { zetWeergave('lijst'); tekenBody(); };

  /* Klikken = het detailpaneel; slepen = status wijzigen. */
  CRM.$$('.bcard[data-id]', board).forEach(k => {
    k.ondragstart = e => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('drag'); };
    k.ondragend   = () => k.classList.remove('drag');
    k.onclick = e => { if(!e.target.closest('button,a')) openLead(k.dataset.id); };
  });
  bindKlaar(board);
  bindLeadActies(board);
  CRM.$$('[data-werk]', board).forEach(b => b.onclick = e => { e.stopPropagation(); wegwerkModus(b.dataset.werk); });
  CRM.$$('.bcol[data-status], .rc-uitzone[data-status]', wrap).forEach(zone => {
    zone.ondragover  = e => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = e => {
      e.preventDefault(); zone.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      if(id) zetStatus(leadById(id), zone.dataset.status);
    };
  });
}

const leegTekst = k => ({
  'Nieuw':'Nieuwe reacties komen hier binnen.',
  'Geen gehoor':'Niemand aan de lijn gemist.',
  'Potentieel':'Nog niemand als potentieel bestempeld.',
  'Intake ingepland':'Geen intakes ingepland.'
})[k] || '—';

function leadKaartHtml(l){
  const v = vacVan(l);
  const dg = leadDagen(l);
  const nieuw = CRM.leadIs(l.status, 'Nieuw');
  const bel = belPogingen(l.id);
  const ken = bekend(l);
  const dub = ken.leads.length + 1;
  const st = stilstand(l);
  const wa = waLink(l.telefoon);
  const chips = [];
  if(nieuw && dg != null && dg >= NIEUW_LETOP)
    chips.push(`<span class="chip ${ouderdomKlas(dg)} num" title="Staat sinds ${h(CRM.fmtDate(l.binnen_op)||'?')} op Nieuw">${dg}d op Nieuw</span>`);
  else if(st) chips.push(`<span class="chip ${st.klas} num" title="${h(st.waarom)}">${h(st.label)}</span>`);
  if(l.bron) chips.push(`<span class="chip">${h(l.bron)}</span>`);
  if(l.woonplaats) chips.push(`<span class="chip" title="Woonplaats">${h(l.woonplaats)}</span>`);
  if(!v) chips.push(`<span class="chip amber" title="${vacWeg(l)?'De gekoppelde vacature bestaat niet meer':'Nog niet aan een vacature gekoppeld'}">${vacWeg(l)?'vacature weg':'geen vacature'}</span>`);
  /* Een cv is er ook als de WhatsApp-bot alleen een link (cv_url) aanleverde —
     zelfde regel als in de rij, anders lijkt een botlead cv-loos op het bord. */
  if(l.cv || l.cv_url) chips.push(`<span class="chip">cv</span>`);
  if(bel) chips.push(`<span class="chip num" title="Belpogingen">${bel}× gebeld</span>`);
  if(dub > 1) chips.push(`<span class="chip purple num" title="Deze persoon staat ${dub}× in de sollicitantenlijst">${dub}× in de lijst</span>`);
  if(ken.kands.length) chips.push(`<span class="chip purple" title="${h('Al bekend als kandidaat: ' + ken.kands.map(eerderTekst).join(' · '))}">al kandidaat</span>`);
  /* Merkkop (optie 2, 4 aug 2026): naam op de zijbalktint, de rest in het
     witte lijf. De leeftijd van de lead staat als dagen in de kop zodra hij
     te lang ligt — zelfde taal als het Sales-bord. */
  return `<div class="bcard bck vol rc-leadkaart" draggable="true" data-id="${h(l.id)}">
    <div class="bc-kop"><b>${h(leadNaam(l))}</b>${
      l.eigenaar?`<span class="rc-rec" title="${h(l.eigenaar)}">${h(CRM.initialen(l.eigenaar))}</span>`:''}</div>
    <div class="bc-lijf">
      <div class="bc-s">${v ? h(v.functie) + ' · ' + h(v.klant) : (losFunctie(l) ? h(losFunctie(l)) : '<em>nog geen vacature</em>')}</div>
    ${chips.length?`<div class="bc-f">${chips.join('')}</div>`:''}
    <div class="rc-kaarttel">${l.telefoon
      ? `<a class="rc-tel num" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">${h(l.telefoon)}</a>${
          wa?`<a class="rc-tel rc-wa" href="${h(wa)}" target="_blank" rel="noopener" title="WhatsApp">wa</a>`:''}`
      : `<span class="meta">geen telefoonnummer</span>`}</div>
    ${!v ? `<button class="btn ghost sm rc-koppel" data-koppel="${h(l.id)}">Koppel vacature</button>` : ''}
    <button class="btn ghost sm rc-move" data-lstat="${h(l.id)}">Verplaatsen naar status…</button>
    </div>
  </div>`;
}

/* ─── Status kiezen in plaats van slepen (mobiel, en de kaart) ── */
function statusPicker(id){
  const l = leadById(id); if(!l) return;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${h(leadNaam(l))} verplaatsen</div>
      <p class="sub" style="margin:6px 0 0">Kies de nieuwe status.</p></div>
    <div class="modal-b"><div class="rc-fasepick">
      ${CRM.LEAD_STATUS.map(s => `<button data-s="${h(s.k)}" class="${CRM.leadIs(l.status, s.k)?'nu':''}">
        <i class="dot" style="background:${s.c}"></i>${h(s.k)}${CRM.leadIs(l.status, s.k)?'<span class="meta">huidige status</span>':''}</button>`).join('')}
    </div></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      CRM.$$('[data-s]', m).forEach(b => b.onclick = () => {
        CRM.modal.close();
        if(!CRM.leadIs(b.dataset.s, l.status)) zetStatus(l, b.dataset.s);
      });
    }});
}

/* ─── Vacature koppelen ───────────────────────────────────────────
   Een lead die via een advertentie binnenkomt heeft zijn vacature al; een
   lead die je zelf toevoegt of importeert vaak niet. Koppelen moet daarom
   twee klikken kosten, niet zeven: de drie best passende vacatures staan
   als knop klaar (op functiewoorden en reisafstand, CRM.matchScore), met
   de volledige lijst eronder voor als het er geen van drieën is. */
/* `naAfloop` wordt precies één keer aangeroepen: met de gekozen vacature als
   het gelukt is, met null als er is geannuleerd. De wegwerkmodus hangt daaraan
   om zichzelf daarna weer op te bouwen — zonder die garantie blijft die modus
   half open achter. */
function koppelVacature(lead, naAfloop){
  if(!lead) return;
  const alle = (CRM.state.vacs||[]).slice();
  const open = alle.filter(v => !v.status || v.status === 'Open');
  const pool = open.length ? open : alle;
  /* Een lead heeft dezelfde velden die matchScore nodig heeft: woonplaats,
     functie en eventueel een ingelezen cv. */
  const sug = pool.map(v => ({v, score:CRM.matchScore({woonplaats:lead.woonplaats, functie:lead.functie || (lead.cv&&lead.cv.functie), cv:lead.cv}, v)}))
    .filter(x => x.score >= 30).sort((a,b) => b.score - a.score).slice(0,3);
  const gesorteerd = alle.slice().sort((a,b) => vacLabel(a).localeCompare(vacLabel(b)));
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Vacature koppelen</div>
      <p class="sub" style="margin:6px 0 0">${h(leadNaam(lead))}${lead.woonplaats?' · '+h(lead.woonplaats):''}${
        losFunctie(lead)?' · zoekt: '+h(losFunctie(lead)):''}</p></div>
    <div class="modal-b">
      ${vacWeg(lead) ? `<div class="note warn" style="margin-bottom:12px">De eerder gekoppelde vacature bestaat niet meer. Kies een bestaande.</div>` : ''}
      ${sug.length ? `<div class="f-row"><label>Past waarschijnlijk</label>
        <div class="rc-sug">${sug.map(x => `<button data-v="${h(x.v.id)}">
          <b>${h(x.v.functie)}</b><small>${h(x.v.klant)}${x.v.locatie?' · '+h(x.v.locatie):''}</small>
          <span class="num">${x.score}%</span></button>`).join('')}</div>
        <span class="hint">Op functiewoorden en reisafstand — controleer het zelf.</span></div>` : ''}
      <div class="f-row"><label for="kv_vac">${sug.length?'Of kies uit alle vacatures':'Vacature'}</label>
        <select id="kv_vac"><option value="">— kies de vacature —</option>
          ${gesorteerd.map(v=>`<option value="${h(v.id)}" ${String(lead.vacature_id)===String(v.id)?'selected':''}>${h(vacLabel(v))}</option>`).join('')}</select>
        <span class="hint">Hierop rust de meting leads per vacature en per klant.</span></div>
      <div class="note err" id="kv_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="kv_ok">Koppelen</button></div>`, {
      onClose(){ if(naAfloop) naAfloop(null); },
      onOpen(m){
      const doe = async id => {
        const v = vacById(id);
        if(!v){ const e = m.querySelector('#kv_err'); e.style.display=''; e.textContent = 'Kies een vacature.'; return; }
        CRM.modal._onClose = null;              // het vervolg regelen we hieronder zelf
        CRM.modal.close();
        const ok = await bewaarLead(lead, {vacature_id:v.id, klant:v.klant, functie:v.functie});
        if(ok){
          await CRM.logActiviteit('lead', lead.id, 'systeem', `Gekoppeld aan ${v.functie} · ${v.klant}`);
          CRM.toast(`Gekoppeld aan ${v.functie} · ${v.klant}`, 'ok');
          tekenKop(); tekenWerk();
          if(document.getElementById('drawer')?.classList.contains('on')) openLead(lead.id);
        }
        if(naAfloop) naAfloop(ok ? v : null);
      };
      CRM.$$('.rc-sug button', m).forEach(b => b.onclick = () => doe(b.dataset.v));
      m.querySelector('#kv_ok').onclick = () => doe(m.querySelector('#kv_vac').value);
    }});
}

/* ═══════════════════════════════════════════════════════════════
   WEGWERKEN — de belronde
   Wie veertig leads afbelt wil per lead één handeling en door. Daarom
   niet een venster per sollicitant, maar één venster dat blijft staan
   en zichzelf doorschuift: bellen, uitkomst kiezen, volgende.
   Elke uitkomst is één toets (of één klik) en slaat meteen op — er is
   geen "opslaan"-knop, want die vergeet je bij de dertigste.
   Belafspraken van vandaag of eerder gaan voorop (dat is een belofte met
   een tijdstip — zie belRang), daarbinnen en daarna oudste eerst, want
   die liggen er het langst. Tjeerd, 2 sep 2026: met stapels van 65 Nieuw
   en 157 Geen gehoor mag een afgesproken belmoment niet pas na twee uur
   doorwerken aan de beurt komen.
   ═══════════════════════════════════════════════════════════════ */
/* Sommige uitkomsten zijn geen statuswissel maar wél werk: nóg een keer
   gebeld, een herinnering voor het cv, een afspraak die is verzet. Die gingen
   voorheen nergens heen — je moest de kaart openen, een notitie typen en weer
   sluiten, en dus liet je het zitten. Dan lijkt het alsof er sinds de eerste
   poging niets is gebeurd, terwijl er drie keer is gebeld.
   De status blijft staan; alleen de klok en de tijdlijn lopen mee. */
const WW_BLIJF = {
  bel:      {soort:'bel',      tekst:p => `Gebeld, geen gehoor (poging ${p})`},
  gesproken:{soort:'bel',      tekst:p => `Gesproken (poging ${p}) — nog geen vervolgstap`},
  verzet:   {soort:'gesprek',  tekst:() => 'Intake verzet — nieuwe datum afgesproken'},
  noshow:   {soort:'gesprek',  tekst:() => 'Niet komen opdagen bij de intake (videocall)'}
};

/* Wat je per status wilt kunnen kiezen, in de volgorde waarin het gebeurt:
   de gewenste uitkomst op toets 1, de uitzonderingen daarachter. Zo hoeft
   niemand de toetsen uit zijn hoofd te leren — 1 is bijna altijd goed.
   Sleutels zijn de genormaliseerde statusnamen (vijf sinds 27 aug 2026);
   wegwerkModus normaliseert vóór het opzoeken. */
const WW_KEUZES = {
  'Nieuw':[
    {t:'1', s:'Geen gehoor',      lbl:'Geen gehoor'},
    {t:'2', s:'Potentieel',       lbl:'Potentieel'},
    {t:'3', s:'Intake ingepland', lbl:'Intake plannen'},
    {t:'4', s:'Niet geschikt',    lbl:'Niet geschikt'}
  ],
  'Geen gehoor':[
    {t:'1', blijf:'bel',          lbl:'Weer geen gehoor'},
    {t:'2', s:'Potentieel',       lbl:'Potentieel'},
    {t:'3', s:'Intake ingepland', lbl:'Intake plannen'},
    {t:'4', s:'Niet geschikt',    lbl:'Niet geschikt'},
    {t:'5', pool:true,            lbl:'→ Talentpool'}
  ],
  'Potentieel':[
    {t:'1', s:'Intake ingepland', lbl:'Intake plannen'},
    {t:'2', blijf:'gesproken',    lbl:'Gesproken, nog niet zover'},
    {t:'3', s:'Geen gehoor',      lbl:'Geen gehoor'},
    {t:'4', s:'Niet geschikt',    lbl:'Niet geschikt'},
    {t:'5', pool:true,            lbl:'→ Talentpool'}
  ],
  'Intake ingepland':[
    {t:'1', door:true,                   lbl:'Kandidaat maken'},
    {t:'2', blijf:'verzet', plan:true,   lbl:'Verzet — nieuwe datum'},
    {t:'3', blijf:'noshow', plan:true,   lbl:'Niet opgedaagd'},
    {t:'4', s:'Niet geschikt',           lbl:'Niet geschikt'}
  ]
};

/* Nog een poging noteren zonder de status te veranderen. */
async function noteerPoging(lead, sleutel, notitie){
  const w = WW_BLIJF[sleutel]; if(!w) return false;
  const poging = (w.soort === 'bel' ? belPogingen(lead.id) + 1 : 0);
  const patch = {laatst_actie:new Date().toISOString()};
  /* Zelfde afspraak-wissen als in pasStatusToe: ook een genoteerde belpoging
     zónder statuswissel handelt de belafspraak van vandaag/verlopen af. */
  if(w.soort === 'bel' && lead.opvolgen_op
     && String(lead.opvolgen_op).slice(0,10) <= CRM.todayISO()
     && !CRM.leadIs(lead.status, 'Intake ingepland')){
    patch.opvolgen_op = null; patch.terugbel_om = null;
  }
  if(notitie) patch.notities = (Array.isArray(lead.notities) ? lead.notities : [])
    .concat([{op:new Date().toISOString(), door:CRM.me(), tekst:notitie}]);
  const ok = await bewaarLead(lead, patch);
  if(!ok) return false;
  await CRM.logActiviteit('lead', lead.id, w.soort, w.tekst(poging));
  if(notitie) await CRM.logActiviteit('lead', lead.id, 'notitie', notitie);
  /* De teller-index weet nog niets van deze poging; wissen, anders toont de
     volgende kaart van dezelfde persoon in de ronde een oude stand. */
  wisBelIndex();
  return true;
}

function wegwerkModus(status){
  /* '__bel' = de belafsprakenronde (herontwerp 3 sep 2026): alle leads met
     een afspraak van vandaag of eerder, over de statussen heen, puur op
     tijdstip. De keuzeknoppen volgen dan per kaart de échte status. */
  const belronde = status === '__bel';
  if(!belronde){
    status = CRM.leadNorm(status);
    status = CRM.LEAD_OPEN.includes(status) ? status : 'Nieuw';
  }
  /* Een momentopname van de stapel. Bewust niet meelopen met de filters
     terwijl je bezig bent: als de lijst onder je handen verspringt raak je
     kwijt waar je was. Volgorde: belafspraken eerst (op tijdstip), dan
     vers goud van vandaag, daarna oudste eerst (B1: één volgorde met de
     lijst; de staart blijft hier oudste-eerst — wie het langst wacht). */
  const stapel = (belronde
      ? leadsGefilterd(true).filter(l => belRang(l) === 0 && !CRM.leadIs(l.status, 'Intake ingepland'))
      : leadsGefilterd(true).filter(l => CRM.leadIs(l.status, status)))
    .sort((a,b) => belRang(a) - belRang(b)
                || belMoment(a).localeCompare(belMoment(b))
                || (versGoud(b)?1:0) - (versGoud(a)?1:0)
                || String(a.binnen_op||'').localeCompare(String(b.binnen_op||'')));
  if(!stapel.length) return CRM.toast(belronde ? 'Geen belafspraken voor vandaag' : `Er staat niets op ${status}`,'ok');
  const keuzes = WW_KEUZES[status] || WW_KEUZES['Nieuw'];
  const keuzesNu = () => belronde
    ? (WW_KEUZES[CRM.leadNorm((stapel[i]||{}).status)] || WW_KEUZES['Nieuw'])
    : keuzes;
  let i = 0, gedaan = 0, over = 0;
  let aan = true;
  /* Ongedaan-log (motorkap-punt 3): elke afgehandelde kaart komt hierin,
     zodat 'u'/Backspace de vorige terughaalt én de statuswissel of gezette
     belafspraak terugdraait. Kandidaat/talentpool maken is de uitzondering:
     dat draai je op de kandidaatkaart terug, niet hier. */
  const log = [];
  /* Vers goud dat tijdens de ronde binnenkomt (motorkap-punt 4): de lijst
     hertekent bewust niet onder je handen, dus melden we het op het
     eindscherm. */
  const goudStart = new Set(leads().filter(versGoud).map(l => l.id));

  const opToets = e => {
    if(!aan || !CRM.modal._aan) return;
    const el = document.activeElement;
    /* Typen in het notitieveld mag geen status wijzigen. Escape/Enter haalt de
       focus er weer af, zodat de cijfertoetsen daarna weer werken. */
    if(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)){
      if(e.key === 'Enter' || e.key === 'Escape'){ e.preventDefault(); el.blur(); }
      return;
    }
    const k = keuzesNu().find(x => x.t === e.key);
    if(k){ e.preventDefault(); return kies(k); }
    if(e.key === 'ArrowRight' || e.key === 's'){ e.preventDefault(); return volgende(true); }
    if(e.key === 'u' || e.key === 'Backspace'){ e.preventDefault(); return ongedaan(); }
    if(e.key === 'b'){ const a = document.querySelector('#ww_bel'); if(a){ e.preventDefault(); a.click(); } }
  };

  function volgende(overgeslagen){
    if(overgeslagen){ over++; log.push({type:'over'}); }
    i++; teken();
  }

  /* Eén stap terug (toets u of Backspace): haalt de vorige kaart terug en
     draait de statuswissel of gezette belafspraak ook in de data terug. De
     tijdlijnregels blijven staan — mét een terugdraai-regel erbij, zodat de
     geschiedenis eerlijk blijft. */
  async function ongedaan(){
    const e = log.pop();
    if(!e) return CRM.toast('Niets om terug te draaien', 'ok');
    if(e.type === 'over'){ over = Math.max(0, over - 1); i = Math.max(0, i - 1); teken(); return; }
    if(e.type === 'door'){ log.push(e); return CRM.toast('Kandidaat of talentpool maken draai je terug op de kandidaatkaart, niet hier', 'err'); }
    const ok = await bewaarLead(e.l, e.oud);
    if(!ok){ log.push(e); return; }
    await CRM.logActiviteit('lead', e.l.id, 'systeem', 'Laatste actie teruggedraaid (wegwerkronde)');
    gedaan = Math.max(0, gedaan - 1);
    i = Math.max(0, i - 1);
    wisBelIndex();
    CRM.toast('Teruggedraaid', 'ok');
    teken();
  }
  /* Even een ander venster over de belronde heen (koppelen, plannen,
     doorschieten). Eerst de toetsen loskoppelen — anders zet een 3 in dát
     venster hier alsnog een status. `hervat` wordt precies één keer
     aangeroepen, ook bij annuleren, zodat de ronde nooit half open blijft. */
  function onderbreek(open){
    aan = false;
    document.removeEventListener('keydown', opToets);
    open(() => setTimeout(start, 60));
    /* Het tussenvenster sluit de ronde-modal (en diens onClose zet wwOpen
       uit); de ronde is inhoudelijk nog bezig, dus meteen weer aan. */
    S.wwOpen = true;
  }
  async function kies(keuze){
    const l = stapel[i]; if(!l) return;
    const inp = document.getElementById('ww_note');
    const notitie = inp ? inp.value.trim() : '';
    if(keuze.door || keuze.pool){
      /* Kandidaat maken heeft een poortwachter nodig die per persoon geldt.
         `rond:true` houdt het formulier binnen de belronde: geen sprong naar
         de kandidatenkaart, wel de volgende sollicitant. Toets 5 = zelfde
         formulier met het talentpool-vinkje al aan (motorkap-punt 9). */
      i++; log.push({type:'door'});
      return onderbreek(hervat => doorschietForm(l, {rond:true, talentpool:!!keuze.pool,
        naAfloop(gelukt){ if(gelukt) gedaan++; hervat(); }}));
    }
    const oud = {status:l.status, opvolgen_op:l.opvolgen_op || null, terugbel_om:l.terugbel_om || null};
    const ok = keuze.blijf ? await noteerPoging(l, keuze.blijf, notitie)
                           : await pasStatusToe(l, keuze.s, notitie);
    if(ok){ gedaan++; log.push({type:keuze.blijf ? 'blijf' : 'status', l, oud}); }
    i++;
    /* Een intake zonder datum is geen afspraak. Wie hem plant of verzet
       krijgt daarom meteen het datumvenster — daarna gaat de ronde door. */
    if(ok && (keuze.plan || keuze.s === 'Intake ingepland'))
      return onderbreek(hervat => videocallPlannen(l, hervat));
    teken();
  }

  function teken(){
    const box = document.getElementById('ww_in'); if(!box) return;
    const l = stapel[i];
    if(!l){
      /* Vers goud dat tijdens de ronde binnenkwam alsnog melden — de lijst
         hertekende bewust niet onder je handen. */
      const goudNieuw = leads().filter(x => versGoud(x) && !goudStart.has(x.id));
      goudNieuw.forEach(x => goudGezien && goudGezien.add(x.id));
      box.innerHTML = `
        <div class="modal-h"><div class="h2">Stapel weggewerkt</div></div>
        <div class="modal-b">
          <div class="note ok" style="margin:0">${gedaan} van de ${stapel.length} ${gedaan===1?'sollicitant is':'sollicitanten zijn'} verwerkt${
            over ? `, ${over} ${over===1?'is':'zijn'} overgeslagen${belronde ? '' : ` en ${over===1?'staat':'staan'} nog op ${h(status)}`}` : ''}.</div>
          ${goudNieuw.length ? `<div class="note warn" style="margin:10px 0 0">🔔 Tijdens de ronde ${goudNieuw.length===1?'kwam':'kwamen'} <b>${goudNieuw.length}</b> verse Hoog/Gekwalificeerd-lead${goudNieuw.length===1?'':'s'} binnen: ${
            h(goudNieuw.slice(0,4).map(leadNaam).join(', '))}${goudNieuw.length>4?' …':''} — ${goudNieuw.length===1?'die staat':'die staan'} nu bovenaan de lijst.</div>` : ''}
        </div>
        <div class="modal-f"><div class="spacer"></div><button class="btn" id="ww_klaar">Sluiten</button></div>`;
      box.querySelector('#ww_klaar').onclick = () => CRM.modal.close();
      return;
    }
    const v = vacVan(l);
    const dg = leadDagen(l);
    const bel = belPogingen(l.id);
    const contact = laatsteContact(l.id);
    const ken = bekend(l);
    const dub = ken.leads.length + 1;
    const st = stilstand(l);
    const wa = waLink(l.telefoon);
    const qa = qaHtml(l.antwoorden);
    const pct = Math.round(i / stapel.length * 100);
    const stNu = belronde ? CRM.leadNorm(l.status) : status;
    box.innerHTML = `
      <div class="modal-h">
        <div class="row" style="justify-content:space-between;align-items:baseline">
          <div class="h2">${belronde ? 'Belafspraken afbellen' : 'Wegwerken · ' + h(status)}</div>
          <span class="meta num">${i+1} van ${stapel.length}</span>
        </div>
        ${CRM.ui.bar(pct)}
      </div>
      <div class="modal-b">
        <div class="rc-wwkop">
          <div>
            <div class="rc-wwnaam">${h(leadNaam(l))}</div>
            <div class="sub">${h(l.woonplaats || 'woonplaats onbekend')} · ${h(l.bron || 'onbekende bron')}${
              l.campagne ? ' · ' + h(l.campagne) : ''}</div>
          </div>
          <div class="row tight" style="justify-content:flex-end">
          ${/* Het oordeel van de WhatsApp-bot, vóór je belt: wie een
               'Gekwalificeerd' met een 85 aan de lijn krijgt voert een ander
               gesprek dan bij een 'Twijfelgeval' met een 30. Alleen
               weergave — de AM-status blijft leidend. */
            botChipHtml(l)}
          ${stNu === 'Nieuw'
            ? `<span class="chip ${ouderdomKlas(dg)} num" title="Binnengekomen ${h(CRM.fmtDate(l.binnen_op)||'onbekend')}">${
                dg == null ? 'datum onbekend' : dg === 0 ? 'vandaag binnen' : dg + ' dag' + (dg===1?'':'en') + ' op Nieuw'}</span>`
            : st ? `<span class="chip ${st.klas} num" title="${h(st.waarom)}">${h(st.label)}</span>`
            : `<span class="chip num" title="Binnengekomen ${h(CRM.fmtDate(l.binnen_op)||'onbekend')}">${h(uurGeleden(l.binnen_op)||'—')} in het systeem</span>`}
          </div>
        </div>
        <div class="rc-wwbel">
          ${l.telefoon
            ? `<a class="btn" id="ww_bel" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">Bel ${h(l.telefoon)}</a>
               ${wa ? `<a class="btn ghost" href="${h(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`
            : `<span class="note warn" style="margin:0">Geen telefoonnummer — appen of mailen kan wel, bellen niet. Vul het nummer aan op de kaart.</span>`}
          ${l.email ? `<a class="btn ghost" href="mailto:${h(l.email)}">E-mail</a>` : ''}
        </div>
        <div class="rc-wwinfo">
          <div class="rc-kv"><span class="label">Reageerde op</span><span>${
            v ? h(v.functie) + ' · ' + h(v.klant)
              : `<span class="chip amber">${vacWeg(l) ? 'vacature bestaat niet meer' : 'geen vacature'}</span>
                 <button class="btn ghost sm" id="ww_koppel" style="margin-left:8px">Koppelen</button>`}</span></div>
          ${l.kwalificatie ? `<div class="rc-kv"><span class="label">Kwalificatie</span><span>${h(l.kwalificatie)}</span></div>` : ''}
          ${l.agent_notitie ? `<div class="rc-kv"><span class="label">Agent</span><span>${h(l.agent_notitie)}</span></div>` : ''}
          ${belChipHtml(l) ? `<div class="rc-kv"><span class="label">Belafspraak</span><span>${belChipHtml(l)}</span></div>` : ''}
          ${l.cv_url ? `<div class="rc-kv"><span class="label">CV</span><span><a href="${h(l.cv_url)}" target="_blank" rel="noopener">Open cv →</a></span></div>` : ''}
          ${botFaseTekst(l) ? `<div class="rc-kv"><span class="label">Botfase</span><span>${h(botFaseTekst(l))}</span></div>` : ''}
          ${bel || contact ? `<div class="rc-kv"><span class="label">Eerder</span><span>${
            bel ? bel + '× gebeld' : ''}${bel && contact ? ' · ' : ''}${
            contact ? 'laatste contact ' + h(CRM.geleden(contact) || CRM.fmtDate(contact)) : ''}</span></div>` : ''}
          ${(dub > 1 || ken.kands.length) ? `<div class="rc-kv"><span class="label">Al bekend</span><span>${
            dub > 1 ? `Staat ${dub}× in de sollicitantenlijst — mogelijk twee keer gesolliciteerd.` : ''}${
            ken.kands.length ? `${dub > 1 ? '<br>' : ''}Er is al een kandidaatkaart: ${
              ken.kands.map(c => h(eerderTekst(c))).join(' · ')}. Ga na of dit dezelfde persoon is voordat je opnieuw begint.` : ''}</span></div>` : ''}
        </div>
        ${/* Wat de bot allemaal al vroeg (vervoer, ploegen, beschikbaarheid) is
             precies wat je aan de telefoon wilt kunnen naslaan — maar de ronde
             moet licht blijven, dus ingeklapt tot je het nodig hebt. */
          qa ? `<details class="rc-wwqa"><summary>Antwoorden van de WhatsApp-agent</summary>${qa}</details>` : ''}
        <div class="f-row" style="margin-top:14px"><label for="ww_note">Notitie (optioneel)</label>
          <input type="text" id="ww_note" placeholder="Bijv. belt maandag terug">
          <span class="hint">Terwijl je hier typt werken de cijfertoetsen niet — Enter zet ze weer aan.</span></div>
        ${/* Belafspraak-snelzetter (motorkap-punt 10): "belt maandag terug"
             wordt zo een échte afspraak in de bellijst i.p.v. vrije tekst.
             Zetten = klaar met deze kaart, door naar de volgende. */''}
        <div class="f-row" style="margin-top:8px"><label>Of zet een belafspraak</label>
          <div class="row tight" style="align-items:center">
            <input type="date" id="ww_beld" value="${h(CRM.todayISO())}" style="width:auto">
            <input type="time" id="ww_belt" value="10:00" style="width:auto">
            <button class="btn ghost sm" id="ww_belzet">Zet belafspraak &amp; volgende</button>
          </div></div>
        <div class="rc-wwkeuze">${keuzesNu().map(k =>
          `<button data-t="${h(k.t)}"${k.blijf?' class="blijf" title="De status blijft staan; de poging komt wel in de tijdlijn"':''}><kbd>${k.t}</kbd>${h(k.lbl)}</button>`).join('')}</div>
      </div>
      <div class="modal-f">
        <button class="btn ghost" id="ww_terug" ${log.length ? '' : 'disabled'} title="Vorige kaart terughalen en de actie terugdraaien">‹ Terug <kbd>u</kbd></button>
        <button class="btn ghost" id="ww_over">Overslaan <kbd>→</kbd></button>
        <div class="spacer"></div>
        <span class="meta">${gedaan} weggewerkt</span>
        <button class="btn ghost" data-mclose>Stoppen</button>
      </div>`;
    CRM.$$('[data-t]', box).forEach(b => b.onclick = () => {
      const k = keuzesNu().find(x => x.t === b.dataset.t);
      if(k) kies(k);
    });
    box.querySelector('#ww_over').onclick = () => volgende(true);
    box.querySelector('#ww_terug').onclick = () => ongedaan();
    const bz = box.querySelector('#ww_belzet');
    if(bz) bz.onclick = async () => {
      const d = box.querySelector('#ww_beld').value, t = box.querySelector('#ww_belt').value || '10:00';
      if(!d) return CRM.toast('Kies een datum', 'err');
      const oud = {status:l.status, opvolgen_op:l.opvolgen_op || null, terugbel_om:l.terugbel_om || null};
      const ok = await bewaarLead(l, {opvolgen_op:d,
        terugbel_om:new Date(d + 'T' + t + ':00').toISOString(),
        laatst_actie:new Date().toISOString()});
      if(!ok) return;
      await CRM.logActiviteit('lead', l.id, 'bel', `Belafspraak gezet op ${CRM.fmtDate(d)} ${t}`);
      log.push({type:'status', l, oud});
      gedaan++; i++; wisBelIndex(); teken();
    };
    const kb = box.querySelector('#ww_koppel');
    /* Koppelen tussendoor: daarna komt dezelfde sollicitant terug (de teller
       loopt niet door), nu mét vacature — of ongewijzigd, als er is geannuleerd. */
    if(kb) kb.onclick = () => onderbreek(hervat => koppelVacature(l, hervat));
    const mc = box.querySelector('[data-mclose]');
    if(mc) mc.onclick = () => CRM.modal.close();
  }

  function start(){
    aan = true;
    S.wwOpen = true;
    document.addEventListener('keydown', opToets);
    CRM.modal.open(`<div id="ww_in"></div>`, {
      onClose(){
        aan = false;
        S.wwOpen = false; S.wwHerteken = false;
        document.removeEventListener('keydown', opToets);
        tekenKop(); tekenTabs(); tekenWerk(); CRM.navBadges();
      },
      onOpen(m){
        teken();
        /* De modal geeft de focus standaard aan het eerste veld; hier zou dat
           het notitieveld of de bel-link zijn en dan slikken die de
           cijfertoetsen in. Focus daarom op het venster zelf. */
        setTimeout(() => { if(m.isConnected) m.focus({preventScroll:true}); }, 80);
      }
    });
  }
  start();
}

/* ─── Status wijzigen ─────────────────────────────────────────────
   De schrijfactie zelf, zonder schermwerk: de wegwerkmodus roept deze
   tientallen keren achter elkaar aan en moet daar niet elke keer het hele
   bord voor hertekenen. */
async function pasStatusToe(lead, nieuw, notitie){
  /* Genormaliseerd vergelijken: een rij die nog op 'CV binnen' staat en op
     'Potentieel' wordt gezet is geen wissel — het scherm toonde al
     'Potentieel'. De oude waarde blijft dan in de rij staan; de alias-laag
     vertaalt hem overal. */
  if(!lead || CRM.leadIs(lead.status, nieuw)) return false;
  const oud = lead.status;
  const geenGehoor = CRM.leadIs(nieuw, 'Geen gehoor');
  const poging = belPogingen(lead.id) + 1;
  const patch = {status:nieuw, laatst_actie:new Date().toISOString()};
  if(notitie) patch.notities = (Array.isArray(lead.notities) ? lead.notities : [])
    .concat([{op:new Date().toISOString(), door:CRM.me(), tekst:notitie}]);
  /* Herontwerp 3 sep 2026 (motorkap-punt 1): een statuswissel handelt de
     belafspraak van vandaag/verlopen áf — anders staat dezelfde lead morgen
     wéér bovenaan de belstapel (zo ontstond de berg van 28 verlopen).
     Uitzondering: Intake ingepland — videocallPlannen zet zo zelf de datum. */
  if(lead.opvolgen_op && String(lead.opvolgen_op).slice(0,10) <= CRM.todayISO()
     && !CRM.leadIs(nieuw, 'Intake ingepland')){
    patch.opvolgen_op = null; patch.terugbel_om = null;
  }
  const ok = await bewaarLead(lead, patch);
  if(!ok) return false;
  await CRM.logActiviteit('lead', lead.id, geenGehoor ? 'bel' : 'systeem',
    geenGehoor ? `Gebeld, geen gehoor (poging ${poging})` : `Status: ${CRM.leadNorm(oud) || 'geen status'} → ${nieuw}`);
  if(notitie) await CRM.logActiviteit('lead', lead.id, 'notitie', notitie);
  if(geenGehoor) wisBelIndex();   // zie noteerPoging
  return true;
}

async function zetStatus(lead, nieuw){
  if(!lead || CRM.leadIs(lead.status, nieuw)) return;
  const geenGehoor = CRM.leadIs(nieuw, 'Geen gehoor');
  const poging = belPogingen(lead.id) + 1;
  const ok = await pasStatusToe(lead, nieuw);
  if(!ok) return;
  CRM.toast(geenGehoor ? `Belpoging ${poging} genoteerd` : 'Status bijgewerkt', 'ok');
  tekenKop(); tekenTabs(); tekenWerk(); CRM.navBadges();
  /* De intake wil je meteen in de agenda hebben — anders staat er een
     status zonder afspraak en belt niemand meer terug. Kandidaat maken
     gebeurt hierna vanaf deze status, via de knop op de kaart of toets 1
     in de belronde (doorschietForm). */
  if(CRM.leadIs(nieuw, 'Intake ingepland')) return videocallPlannen(lead);
  if(document.getElementById('drawer')?.classList.contains('on')) openLead(lead.id);
}

/* Bij "Intake ingepland": datum/tijd vastleggen en desgewenst meteen in de
   eigen agenda zetten (Outlook of vooringevulde deeplink). */
/* `naAfloop` wordt precies één keer aangeroepen — ook bij overslaan. De
   belronde hangt daaraan om zichzelf daarna weer op te bouwen. */
function videocallPlannen(l, naAfloop){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Intake (videocall) plannen</div>
      <p class="sub" style="margin:6px 0 0">${h(leadNaam(l))} — de videocall ís de intake, dus plan er een half uur voor.</p></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="ip_datum" value="${h(l.opvolgen_op||CRM.todayISO())}"></div>
        <div class="f-row"><label>Tijd</label><input type="time" id="ip_tijd" value="10:00"></div>
      </div>
      ${/* Snelkeuzes + Enter-submit (motorkap-punt 11): het gros van de
           intakes is "morgen om 10" — dat mag één klik of één Enter zijn. */''}
      <div class="row tight" style="margin:8px 0 0">
        <button type="button" class="chip btn-like" data-snel="0|14:00">vandaag 14:00</button>
        <button type="button" class="chip btn-like" data-snel="1|10:00">morgen 10:00</button>
        <button type="button" class="chip btn-like" data-snel="1|14:00">morgen 14:00</button>
      </div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="ip_agenda" checked> Zet ook in mijn agenda</label>
      <p class="meta" style="margin:10px 0 0">Enter = vastleggen. Zonder datum blijft deze sollicitant als "zonder datum" gemeld staan.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Overslaan</button>
      <button class="btn" id="ip_ok">Vastleggen</button></div>`, {
    onClose(){ if(naAfloop) naAfloop(); },
    onOpen(m){
    setTimeout(() => { const d = m.querySelector('#ip_datum'); if(d) d.focus(); }, 60);
    m.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); m.querySelector('#ip_ok').click(); }
    });
    CRM.$$('[data-snel]', m).forEach(b => b.onclick = () => {
      const [plus, tijd] = b.dataset.snel.split('|');
      const d = new Date(); d.setDate(d.getDate() + Number(plus));
      m.querySelector('#ip_datum').value = d.toISOString().slice(0,10);
      m.querySelector('#ip_tijd').value = tijd;
    });
    m.querySelector('#ip_ok').onclick = async () => {
      const datum = m.querySelector('#ip_datum').value, tijd = m.querySelector('#ip_tijd').value || '10:00';
      if(!datum) return CRM.toast('Kies een datum','err');
      const agenda = m.querySelector('#ip_agenda').checked;
      CRM.modal._onClose = null;        // het vervolg regelen we hieronder zelf
      CRM.modal.close();
      await bewaarLead(l, {opvolgen_op:datum});
      await CRM.logActiviteit('lead', l.id, 'systeem', `Intake (videocall) gepland op ${CRM.fmtDate(datum)} ${tijd}`);
      if(agenda){
        try{
          const r = await CRM.outlook.maakAfspraak({
            titel:`Videointake — ${leadNaam(l)}`, datum, tijd, duurMin:30, teams:true,
            deelnemers:[l.email].filter(Boolean),
            body:`Video-intake${l.functie?' voor '+l.functie:''}${l.klant?' bij '+l.klant:''}.`
          });
          if(r.via==='deeplink') CRM.toast('Outlook geopend — klik daar op Opslaan','ok');
          else CRM.toast('In je agenda gezet','ok');
        }catch(e){ CRM.fout('Agenda-afspraak mislukt', e); }
      }
      tekenKop(); tekenLijst();
      if(document.getElementById('drawer')?.classList.contains('on')) openLead(l.id);
      if(naAfloop) naAfloop();
    };
  }});
}
/* ─── Leaddetail ──────────────────────────────────────────────── */
function qaHtml(antwoorden){
  /* Supabase geeft jsonb als object terug, maar een webhook of import kan er
     net zo goed een string van maken. Die alsnog lezen — anders staat er
     "geen vragen vastgelegd" terwijl het hele gesprek er wél is. */
  if(typeof antwoorden === 'string' && /^[\[{]/.test(antwoorden.trim())){
    try{ antwoorden = JSON.parse(antwoorden); }catch(e){ return ''; }
  }
  if(!antwoorden || typeof antwoorden !== 'object') return '';
  const paren = Array.isArray(antwoorden)
    ? antwoorden.map(a => [a.vraag || a.q || 'Vraag', a.antwoord || a.a || ''])
    : Object.entries(antwoorden);
  if(!paren.length) return '';
  return `<table class="rc-qa">${paren.map(([k,v]) => `
    <tr><th>${h(String(k).replace(/_/g,' '))}</th>
        <td>${h(v && typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}</table>`;
}
/* Het cv-paneel in het sollicitantpaneel. Krijgt de hele lead mee, want het
   bestand zelf hangt aan `lead.cv.bestandPad` en wordt door CRM.cvParse
   getoond — met een link die pas bij het klikken wordt ondertekend. */
function cvHtml(lead){
  const cv = lead.cv;
  const bestand = CRM.cvParse ? CRM.cvParse.bestandHtml(lead) : '';
  /* Een cv dat de WhatsApp-bot aanleverde is een link (cv_url), geen geparsed
     bestand. Die moet altijd te openen zijn — ook naast een geparsed cv, want
     het origineel zegt meer dan de samenvatting. */
  const link = lead.cv_url ? `<div class="rc-kv"><span class="label">Bestand</span><span><a href="${h(lead.cv_url)}" target="_blank" rel="noopener">Open cv →</a></span></div>` : '';
  if(!cv) return link || `<p class="meta" style="margin:0">Nog geen cv gekoppeld.</p>`;
  const lijst = (t, arr) => (arr && arr.length)
    ? `<div class="rc-kv"><span class="label">${h(t)}</span><div class="row tight">${arr.map(x=>`<span class="chip">${h(x)}</span>`).join('')}</div></div>` : '';
  const opl = Array.isArray(cv.opleidingen) ? cv.opleidingen : [];
  return `
    ${bestand}${link}
    ${cv.functie ? `<div class="rc-kv"><span class="label">Functie</span><span>${h(cv.functie)}</span></div>` : ''}
    ${cv.ervaringJaren ? `<div class="rc-kv"><span class="label">Ervaring</span><span class="num">${h(cv.ervaringJaren)} jaar</span></div>` : ''}
    ${lijst('Talen', cv.talen)}
    ${lijst('Certificaten', (cv.certificaten || cv.skills || []).map(
      x => (x && typeof x === 'object') ? (x.naam || x.certificaat || x.titel || '') : x))}
    ${(cv.werk && cv.werk.length) ? `<div class="rc-kv"><span class="label">Werkverleden</span>
        <div>${cv.werk.map(w=>`<div class="sub">${h(w)}</div>`).join('')}</div></div>` : ''}
    ${opl.length ? `<div class="rc-kv"><span class="label">Opleiding</span>
        <div>${opl.map(o=>`<div class="sub">${h([o.school, o.opleiding, o.jaar].filter(Boolean).join(' — '))}</div>`).join('')}</div></div>` : ''}
    ${cv.op ? `<div class="meta" style="margin-top:8px">Ingelezen ${h(CRM.fmtDate(cv.op))}${cv.door?' door '+h(cv.door):''}</div>` : ''}`;
}

/* ─── Eén sollicitant verwijderen ─────────────────────────────────
   Vanuit het leadpaneel, per persoon — bewust NIET in de bulkbalk (zie de
   notitie daar: onomkeerbaar hoort niet in een knop die twintig rijen
   tegelijk raakt). Voor de per-ongeluk aangemaakte rij; verwijderen kon
   eerst alleen via de kandidatenkaart, maar een sollicitant die nooit
   kandidaat is geworden hééft die kaart niet (Tjeerd, 21 aug 2026).
   Is de sollicitant al doorgeschoten, dan blijft de kandidaatkaart
   bestaan — die heeft zijn eigen, zwaardere verwijderflow met logboek en
   anonimiseren (js/kandverwijder.js). */
async function verwijderLead(l){
  const ok = await CRM.bevestig('Sollicitant verwijderen?',
    `${leadNaam(l)} verdwijnt uit de sollicitantenlijst, inclusief notities en geschiedenis. `
    + 'Dit is niet terug te draaien.'
    + (l.kandidaat_id ? ' De kandidaatkaart die uit deze sollicitant is gemaakt blijft bestaan — verwijderen daarvan gaat via de kaart zelf.' : ''),
    {knop:'Verwijderen'});
  if(!ok) return;
  if(!CRM.demo){
    /* Eerst de lead zelf: een wees-logregel is geen ramp, een
       half-verwijderde lead wel. Activiteiten daarna, best-effort. */
    const {error} = await CRM.sb.from('crm_leads').delete().eq('id', l.id);
    if(error) return CRM.fout('Verwijderen mislukt', error);
    try{ await CRM.sb.from('crm_activiteiten').delete().eq('entiteit','lead').eq('ref', String(l.id)); }
    catch(e){ console.warn('lead-activiteiten opruimen', e); }
  }
  CRM.state.leads = (CRM.state.leads||[]).filter(x => String(x.id) !== String(l.id));
  CRM.state.activiteiten = (CRM.state.activiteiten||[]).filter(a => !(a.entiteit === 'lead' && String(a.ref) === String(l.id)));
  CRM.drawer.close();
  CRM.toast('Sollicitant verwijderd','ok');
  tekenKop(); tekenTabs(); tekenWerk(); CRM.navBadges();
}

function openLead(id){
  const l = leadById(id); if(!l) return;
  /* Rijen die uit de kandidatentabel komen hebben al een kaart. Het
     leadvenster bood die dan alsnog "→ Kandidaat maken" aan, met een leeg
     cv-blok en een WhatsApp-agent die er niet is — terwijl er een volledige
     kaart bestaat waar dat allemaal wél op staat. Klikken hoort je daar te
     brengen. (Tjeerd, 3 aug 2026: "maar Goncalo is al een kandidaat gemaakt,
     dus dit klopt niet.") */
  if(l._kand) return CRM.ga('kandidaten', {id: l.id});
  const v = vacVan(l);
  const notities = Array.isArray(l.notities) ? l.notities : [];
  /* Een kandidaat_id betekent: overgedragen. De status doet er dan niet
     meer toe — de kandidaatkaart is leidend. */
  const doorgeschoten = !!l.kandidaat_id;
  const dg = leadDagen(l);
  bouwDubbel();     // het paneel kan ook via een deeplink openen, vóór de lijst
  const ken = bekend(l);
  const st  = stilstand(l);
  const tijdlijn = notities.map(n => ({titel:n.door||'Notitie', wanneer:CRM.fmtDate(n.op), tekst:n.tekst}))
    .concat(CRM.activiteitenVoor('lead', l.id).map(a => ({
      titel:a.door||'Systeem',
      wanneer:CRM.fmtDate(a.op), tekst:a.tekst})));

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="flex:1;min-width:0">
        <div class="h2">${h(leadNaam(l))}</div>
        <div class="sub">${h(l.woonplaats||'—')} · ${h(l.bron||'onbekende bron')}${l.campagne?' · '+h(l.campagne):''}</div>
        <div class="row tight" style="margin-top:8px">
          <span class="chip"><i class="dot" style="background:${CRM.leadKleur(l.status)}"></i>${h(CRM.leadNorm(l.status)||'geen status')}</span>
          ${botChipHtml(l)}
          ${CRM.leadIs(l.status, 'Nieuw') && dg != null && dg >= NIEUW_LETOP
            ? `<span class="chip ${ouderdomKlas(dg)} num">${dg} dag${dg===1?'':'en'} op Nieuw</span>` : ''}
          ${dubbelAantal(l) > 1 ? `<span class="chip purple num" title="Zelfde telefoonnummer">${dubbelAantal(l)}× in de lijst</span>` : ''}
          ${/* Dezelfde kleurtaal als de stip in de lijst en de chip in de rij —
               het paneel mag niet neutraal ogen waar de lijst rood zegt. */
            l.prioriteit?`<span class="chip"><i class="dot" style="background:${prioKleur(l.prioriteit)}"></i>Prioriteit ${h(l.prioriteit)}</span>`:''}
          ${/* De belafspraak in de kop (motorkap-punt 16): het eerste dat je
               wilt zien als je de kaart opent. De losse scorechip is weg —
               de botchip hierboven draagt het getal al. */
            belChipHtml(l)}
          ${belPogingen(l.id)?`<span class="chip">${belPogingen(l.id)}× gebeld</span>`:''}
          ${laatsteContact(l.id)?`<span class="chip" title="Laatste keer bellen, appen, mailen of spreken">contact ${h(CRM.geleden(laatsteContact(l.id)))}</span>`:''}
        </div>
      </div>
      <button class="btn sub x" data-close>✕</button>
    </div>
    <div class="drawer-b">
      ${(ken.leads.length || ken.kands.length) ? `<div class="note warn" style="margin-bottom:16px">
        <b>Deze persoon komt vaker voor</b> — op telefoonnummer of op naam en woonplaats.
        ${ken.kands.length ? `Als kandidaat: ${ken.kands.map(c => `<button class="rc-lnk" data-kand="${h(c.id)}">${h(c.naam)}</button> (${h(eerderTekst(c))})`).join(', ')}. ` : ''}
        ${ken.leads.length ? `Als sollicitant: ${ken.leads.map(x => `<button class="rc-lnk" data-lead="${h(x.id)}">${h(leadNaam(x))}</button> (${h(CRM.leadNorm(x.status)||'geen status')})`).join(', ')}. ` : ''}
        We voegen niets samen — welke de goede is, beslis jij.</div>` : ''}
      ${st ? `<div class="note warn" style="margin-bottom:16px"><b>${h(st.label)}</b> — ${h(st.waarom)}</div>` : ''}
      <div class="grid c2">
        <div class="card"><div class="card-h"><div class="h2">Contact</div></div><div class="card-b">
          <div class="rc-kv"><span class="label">Telefoon</span><span>${l.telefoon
            ? `<a class="num" href="tel:${h(String(l.telefoon).replace(/\s/g,''))}">${h(l.telefoon)}</a>${waLink(l.telefoon)?` · <a href="${h(waLink(l.telefoon))}" target="_blank" rel="noopener">WhatsApp</a>`:''}`
            : '<span class="meta">ontbreekt</span>'}</span></div>
          <div class="rc-kv"><span class="label">E-mail</span><span>${l.email?`<a href="mailto:${h(l.email)}">${h(l.email)}</a>`:'<span class="meta">ontbreekt</span>'}</span></div>
          <div class="rc-kv"><span class="label">Woonplaats</span><span>${h(l.woonplaats||'—')}</span></div>
          <div class="rc-kv"><span class="label">Eigenaar</span><span>${h(l.eigenaar||'—')}</span></div>
          <div class="rc-kv"><span class="label">Binnen</span><span class="num">${h(CRM.fmtDate(l.binnen_op))} · ${h(uurGeleden(l.binnen_op))} geleden</span></div>
          ${l.terugbel_om ? `<div class="rc-kv"><span class="label">Terugbellen</span><span class="num">${
            h(new Date(l.terugbel_om).toLocaleString('nl-NL', {dateStyle:'short', timeStyle:'short'}))} — met de kandidaat afgesproken</span></div>` : ''}
        </div></div>
        <div class="card"><div class="card-h"><div class="h2">Reageerde op</div><div class="spacer"></div>
          <button class="btn ghost sm" id="rc_koppelbtn">${v?'Andere vacature':'Koppelen'}</button></div><div class="card-b">
          ${v ? `<div class="rc-kv"><span class="label">Vacature</span><span>${h(v.functie)}</span></div>
                 <div class="rc-kv"><span class="label">Klant</span><span>${h(v.klant)}</span></div>
                 <div class="rc-kv"><span class="label">Locatie</span><span>${h(v.locatie||'—')}</span></div>`
              : `<p class="note warn" style="margin:0 0 8px">${vacWeg(l)
                    ? 'De gekoppelde vacature bestaat niet meer, dus deze reactie telt nergens meer mee.'
                    : 'Nog niet aan een vacature gekoppeld.'}
                  Zolang dat zo blijft telt deze sollicitant niet mee bij leads per vacature en per klant.</p>
                 ${losFunctie(l)?`<div class="rc-kv"><span class="label">Ingevuld</span><span>${h(losFunctie(l))}${l.klant?' · '+h(l.klant):''}</span></div>`:''}`}
        </div></div>
      </div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">WhatsApp-agent</div></div>
        <div class="card-b">
          ${/* Belscript-volgorde (motorkap-punt 16): eerst het oordeel van de
               bot, dan de fase, dan de antwoorden — de kwalificatie hoorde
               bij dit blok, niet bij de vacaturekaart erboven. */
            l.kwalificatie?`<div class="rc-kv"><span class="label">Kwalificatie</span><span>${h(l.kwalificatie)}</span></div>`:''}
          ${botFaseTekst(l) ? `<div class="rc-kv"><span class="label">Botfase</span><span>${h(botFaseTekst(l))}</span></div>` : ''}
          ${l.agent_notitie?`<p class="sub" style="margin:0 0 12px">${h(l.agent_notitie)}</p>`:''}
          ${qaHtml(l.antwoorden) || '<p class="meta" style="margin:0">Geen vragen en antwoorden vastgelegd.</p>'}
        </div></div>

      <div class="card" style="margin-top:16px">
        <div class="card-h"><div class="h2">CV</div><div class="spacer"></div>
          <button class="btn ${l.cv?'ghost ':''}sm" id="rc_cvbtn">${l.cv?'Nieuw CV inlezen':'CV inlezen'}</button></div>
        <div class="card-b">${cvHtml(l)}</div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Opvolging</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="rc_opv">Opvolgdatum</label><input type="date" id="rc_opv" value="${h(l.opvolgen_op||'')}"></div>
            <div class="f-row"><label for="rc_eig">Eigenaar (AM)</label><input type="text" id="rc_eig" value="${h(l.eigenaar||'')}" placeholder="Naam"></div>
          </div>
          <div class="f-row"><label for="rc_note">Notitie toevoegen</label>
            <textarea id="rc_note" placeholder="Wat is er besproken?"></textarea>
            <span class="hint">@naam om een collega te melden</span></div>
          <button class="btn ghost sm" id="rc_noteok">Notitie opslaan</button>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Geschiedenis</div></div>
        <div class="card-b">${CRM.ui.tijdlijn(tijdlijn)}</div></div>
    </div>
    <div class="drawer-f" style="flex-wrap:wrap;row-gap:8px">
      <select id="rc_dst" style="width:auto;min-width:210px">
        ${statusOptieExtra(l.status)}
        ${CRM.LEAD_STATUS.map(s=>`<option value="${h(s.k)}" ${CRM.leadIs(l.status, s.k)?'selected':''}>${h(s.k)}</option>`).join('')}
        <option value="__talentpool">→ Talentpool (kaart bewaren)</option>
      </select>
      <button class="btn ghost danger" id="rc_del" title="Sollicitant verwijderen">Verwijderen…</button>
      <div class="spacer"></div>
      ${doorgeschoten
        ? `<button class="btn" id="rc_naarkand">Open kandidaatkaart →</button>`
        : `<button class="btn" id="rc_door">→ Kandidaat maken</button>`}
    </div>`, {onOpen(dr){
      dr.querySelector('#rc_del').onclick = () => verwijderLead(l);
      CRM.dictee?.hang(dr.querySelector('#rc_note'));
      dr.querySelector('#rc_cvbtn').onclick = () => cvModal(l);
      /* Het cv-bestand openen gaat via een link die pas bij het klikken
         wordt ondertekend en kort geldig is (js/cvparse.js). */
      if(CRM.cvParse) CRM.cvParse.bindBestand(dr);
      dr.querySelector('#rc_koppelbtn').onclick = () => koppelVacature(l);
      dr.querySelector('#rc_dst').onchange  = e => {
        if(e.target.value === '__talentpool'){
          e.target.value = CRM.leadNorm(l.status) || 'Nieuw';
          return doorschietForm(l, {talentpool:true});
        }
        zetStatus(l, e.target.value);
      };
      const door = dr.querySelector('#rc_door');  if(door) door.onclick = () => doorschietForm(l);
      const nk   = dr.querySelector('#rc_naarkand');
      if(nk) nk.onclick = () => { CRM.drawer.close(); CRM.ga('kandidaten',{id:l.kandidaat_id}); };
      dr.querySelector('#rc_opv').onchange = async e => {
        await bewaarLead(l, {opvolgen_op:e.target.value || null}); CRM.toast('Opvolgdatum gezet','ok'); tekenKop(); tekenLijst();
      };
      dr.querySelector('#rc_eig').onchange = async e => {
        await bewaarLead(l, {eigenaar:e.target.value.trim()}); CRM.toast('Eigenaar bijgewerkt','ok'); tekenLijst();
      };
      dr.querySelector('#rc_noteok').onclick = async () => {
        const t = dr.querySelector('#rc_note').value.trim(); if(!t) return;
        const lijst = notities.concat([{op:new Date().toISOString(), door:CRM.me(), tekst:t}]);
        await bewaarLead(l, {notities:lijst, laatst_actie:new Date().toISOString()});
        await CRM.logActiviteit('lead', l.id, 'notitie', t);
        CRM.verwerkTags(t, 'lead', l.id);
        CRM.toast('Notitie opgeslagen','ok'); tekenKop(); tekenLijst(); openLead(l.id);
      };
      CRM.$$('[data-kand]', dr).forEach(b => b.onclick = () => { CRM.drawer.close(); CRM.ga('kandidaten',{id:b.dataset.kand}); });
      CRM.$$('[data-lead]', dr).forEach(b => b.onclick = () => openLead(b.dataset.lead));
    }});
}
/* ─── De overdracht: van lead naar kandidaat ──────────────────────
   De laatste stap van deze pijplijn. Hij hoort vanaf 'Intake ingepland'
   te komen — de videocall ís de intake — en levert een kandidaatkaart op
   fase 'Intake'. Die kaart staat bewust níét op het bord van de
   Klanttrajecten: dat bord begint bij 'Voorgesteld'. Wat hier ontstaat
   is een kandidaat die klaarstaat om aan een klant voorgesteld te
   worden, en die staat als afsluitende regel onderaan dit scherm.
   Sinds 27 aug 2026 is 'Doorgeschoten' geen status meer: de overdracht
   is het kandidaat_id op de leadrij, en dáárop verdwijnt de rij uit de
   werklijst (zie leadsGefilterd).

   Het formulier bleef daarom een poortwachter tegen vervuiling (naam,
   telefoon, woonplaats, functie, bron, vacature), maar vraagt niet
   langer om een nieuwe videocall in te plannen — die heeft al
   plaatsgevonden. In plaats daarvan leggen we vast wanneer de call was
   en gaat de intake-vragenlijst meteen open. */
/* opts.rond   — aangeroepen vanuit de belronde: geen sprong naar de
                 kandidatenkaart en geen intakeformulier, want de ronde loopt door.
   opts.naAfloop(gelukt) — precies één keer, ook bij annuleren. */
function doorschietForm(lead, opts){
  if(!lead) return;
  opts = opts || {};
  const klaar = gelukt => { const fn = opts.naAfloop; opts.naAfloop = null; if(fn) fn(gelukt); };
  /* Rijen uit de kandidatentabel (_kand) hébben al een kaart — nog een keer
     doorschieten zou een dubbele kandidaat opleveren. Zelfde regel als
     openLead (Tjeerd, 3 aug 2026, over Goncalo): daarheen verwijzen. Sinds
     de belronde op 'Intake ingepland' een "Kandidaat maken"-toets heeft
     (27 aug 2026) is dit pad ook vanuit de ronde bereikbaar. */
  if(lead._kand){
    CRM.toast(`${leadNaam(lead)} heeft al een kandidaatkaart`, 'ok');
    klaar(false);
    /* Binnen de belronde niet wegspringen — de ronde loopt door. */
    if(!opts.rond) CRM.ga('kandidaten', {id:lead.id});
    return;
  }
  const v = vacById(lead.vacature_id);
  /* Poortwachter tegen dubbele kaarten: staat deze persoon er al als
     kandidaat, dan is een tweede kaart bijna nooit de bedoeling. Dezelfde
     persoon bij twee klanten voorstellen is de fout die je achteraf niet meer
     rechtzet. We blokkeren niets — soms is het écht een naamgenoot — maar het
     staat er wel, bovenaan, vóór het invullen. */
  const ken = bekend(lead);
  const concept = {
    naam:lead.naam||'', telefoon:lead.telefoon||'', woonplaats:lead.woonplaats||'',
    functie:(v && v.functie) || lead.functie || '', bron:lead.bron||''
  };
  const vol = CRM.volledigheid(concept);
  const mist = new Set(vol.mist.map(m => m.k));
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b)=>vacLabel(a).localeCompare(vacLabel(b)));
  const rij = (id, lbl, waarde, type='text') => `
    <div class="f-row ${mist.has(id)?'rc-mist':''}">
      <label for="ds_${id}">${h(lbl)}${mist.has(id)?' <span class="rc-req">ontbreekt</span>':''}</label>
      <input type="${type}" id="ds_${id}" value="${h(waarde)}">
    </div>`;

  /* Doorschieten vanaf een vroege status kan — soms weet je het na één
     gesprek al — maar dan zeggen we er wel bij dat de volgorde wordt
     overgeslagen. Zonder die opmerking sluipt er een kandidaat in zonder dat
     er ooit een intake is geweest. */
  const vroeg = !CRM.leadIs(lead.status, 'Intake ingepland');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Kandidaat maken van ${h(leadNaam(lead))}</div>
      <p class="sub" style="margin:6px 0 0">De kaart komt op fase <b>Klaar om voor te stellen</b>. Maak de gegevens eerst compleet — half ingevulde kandidaten vervuilen het systeem.</p></div>
    <div class="modal-b">
      ${ken.kands.length ? `<div class="note warn" style="margin-bottom:12px">
        <b>Deze persoon heeft al een kandidaatkaart</b> — ${h(ken.kands.map(eerderTekst).join(' · '))}.
        Is het dezelfde persoon, werk dan die kaart bij in plaats van een tweede aan te maken; twee kaarten betekent dat iemand
        bij twee klanten kan worden voorgesteld zonder dat je het ziet.
        <button class="btn ghost sm" id="ds_open" style="margin-left:8px">Open die kaart</button></div>` : ''}
      ${vroeg ? `<div class="note warn" style="margin-bottom:12px">Deze sollicitant staat nog op <b>${h(CRM.leadNorm(lead.status)||'geen status')}</b>. Normaal komt deze stap vanaf <b>Intake ingepland</b> — de videocall is immers de intake.</div>` : ''}
      <div class="rc-vol">
        <div class="row" style="justify-content:space-between"><span class="label">Volledigheid</span>
          <span class="num">${vol.pct}%</span></div>
        ${CRM.ui.bar(vol.pct, vol.pct>=80?'green':vol.pct>=50?'amber':'red')}
      </div>
      <div class="f-grid" style="margin-top:14px">
        ${rij('naam','Naam', concept.naam)}
        ${rij('telefoon','Telefoonnummer', concept.telefoon, 'tel')}
        ${rij('woonplaats','Woonplaats', concept.woonplaats)}
        ${rij('functie','Gezochte functie', concept.functie)}
        <div class="f-row"><label for="ds_email">E-mail (aanbevolen)</label>
          <input type="email" id="ds_email" value="${h(lead.email||'')}"></div>
        <div class="f-row ${mist.has('bron')?'rc-mist':''}"><label for="ds_bron">Bron</label>
          <select id="ds_bron">${CRM.LEAD_BRONNEN.map(b=>`<option ${concept.bron===b?'selected':''}>${h(b)}</option>`).join('')}</select></div>
      </div>
      <div class="f-row"><label for="ds_vac">Vacature bevestigen</label>
        <select id="ds_vac">
          <option value="">— kies de vacature waarop is gereageerd —</option>
          ${vacs.map(x=>`<option value="${h(x.id)}" ${String(lead.vacature_id)===String(x.id)?'selected':''}>${h(vacLabel(x))}</option>`).join('')}
        </select>
        <span class="hint">Nodig om marketing- en recruitmentprestaties aan elkaar te koppelen.</span></div>
      <div class="f-grid">
        <div class="f-row"><label for="ds_datum">Datum intake (videocall)</label>
          <input type="date" id="ds_datum" value="${h(intakeGehadOp(lead))}">
          <span class="hint">De intake die is geweest — gaat mee naar de kandidaatkaart.</span></div>
        <div class="f-row"><label for="ds_rec">Recruiter</label>
          <input type="text" id="ds_rec" value="${h(lead.eigenaar || CRM.me())}"></div>
      </div>
      ${opts.rond ? '' : `<label class="check"><input type="checkbox" id="ds_intake" checked> Intakeformulier meteen openen</label>`}
      <label class="check" title="Voor kandidaten die interessant zijn maar waar nu geen tijd of vacature voor is: de kaart gaat de Talentpool in — uit het dagelijkse werk, maar mét sterren terug te vinden via Sourcing zodra er een aanvraag komt.">
        <input type="checkbox" id="ds_later" ${opts.talentpool?'checked':''}> Nog geen volledige intake — bewaar in de <b>Talentpool</b> (intake volgt bij een aanvraag)</label>
      <div class="note err" id="ds_err" style="display:none"></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ds_ok">Kandidaat aanmaken</button>
    </div>`, {
      onClose(){ klaar(false); },
      onOpen(m){
      const kaartknop = m.querySelector('#ds_open');
      if(kaartknop) kaartknop.onclick = () => {
        CRM.modal._onClose = null; CRM.modal.close(); klaar(false);
        CRM.ga('kandidaten', {id:ken.kands[0].id});
      };
      const vacSel = m.querySelector('#ds_vac');
      vacSel.onchange = () => {
        const x = vacById(vacSel.value);
        if(x && !m.querySelector('#ds_functie').value.trim()) m.querySelector('#ds_functie').value = x.functie;
      };
      /* ─── Bot-cv ophalen ─────────────────────────────────────────
         De bot levert een cv als link (cv_url) in de gedeelde map. Zodra
         de kaart bestaat willen we dat bestand ook inhoudelijk hebben:
         geparsed, zodat talen, certificaten, werkverleden en adres meteen
         op de kaart staan (Tjeerd, 28 aug 2026). SharePoint-links lopen
         via de M365-koppeling (shares-API); andere links rechtstreeks.
         Lukt het niet, dan blijft de klikbare link gewoon staan — de
         kaart is dan niet slechter dan voorheen, alleen niet automatisch
         verrijkt. */
      async function botCvBestand(l){
        const url = String((l && l.cv_url) || '').trim();
        if(!url) return null;
        let blob = null;
        if(CRM.outlook && CRM.outlook.haalGedeeldBestand && /sharepoint\.com|1drv\.ms|onedrive/i.test(url)){
          try{ blob = await CRM.outlook.haalGedeeldBestand(url); }catch(e){ blob = null; }
        }
        if(!blob){
          try{ const r = await fetch(url); if(r.ok) blob = await r.blob(); }catch(e){}
        }
        if(!blob || !blob.size) return null;
        const naam = decodeURIComponent(url.split('?')[0].split('/').pop() || '') || 'cv.pdf';
        return new File([blob], naam, {type: blob.type || 'application/pdf'});
      }
      m.querySelector('#ds_ok').onclick = async () => {
        const g = id => m.querySelector('#ds_'+id).value.trim();
        const err = m.querySelector('#ds_err');
        const ontbreekt = [];
        ['naam','telefoon','woonplaats','functie'].forEach(k => { if(!g(k)) ontbreekt.push(k); });
        if(!g('bron')) ontbreekt.push('bron');
        /* Talentpool = juist níét voor één specifieke vacature (Tjeerd,
           3 sep 2026) — dan is de vacature optioneel. */
        const laterAan = !!(m.querySelector('#ds_later')||{}).checked;
        if(!vacSel.value && !laterAan) ontbreekt.push('vacature');
        if(ontbreekt.length){
          err.style.display = ''; err.textContent = 'Nog invullen: ' + ontbreekt.join(', ') + '.';
          return;
        }
        const x = vacById(vacSel.value);
        const vandaag = CRM.todayISO();
        /* Talentpool voor wie interessant is maar nog geen volledige intake
           had (Tjeerd, 3 sep 2026) — uit het dagelijkse werk, terugvindbaar
           via Sourcing; zie CRM.TALENTPOOL in data.js. */
        const laterVink = m.querySelector('#ds_later');
        const fase = laterVink && laterVink.checked ? 'Talentpool' : 'Klaar om voor te stellen';
        const cand = {
          id: CRM.uid(), naam:g('naam'), telefoon:g('telefoon'), email:g('email'),
          woonplaats:g('woonplaats'), functie:g('functie'), klant:(x && x.klant) || lead.klant || '',
          type:'W&S', bron:g('bron'), fase:fase, datum:g('datum'), tijd:'',
          since:vandaag, rec:g('rec') || CRM.me(), vacatureId:vacSel.value, leadId:lead.id,
          cv:lead.cv || null, note:lead.kwalificatie || '',
          /* De videocall ís de intake, dus de kaart begint met één vaststaand
             feit: wanneer dat gesprek was. De rest van de vragenlijst vult de
             recruiter hierna in (intakeForm laat dit veld staan). */
          intake:{videocallOp:g('datum'), op:vandaag, door:g('rec') || CRM.me()},
          historie:[{fase:'Klaar om voor te stellen', op:vandaag}],
          notities:(Array.isArray(lead.notities)?lead.notities:[]).concat(
            lead.agent_notitie ? [{op:lead.binnen_op||new Date().toISOString(), door:'WhatsApp-agent', tekst:lead.agent_notitie}] : [])
        };
        const rij = CRM.candToRow(cand);
        CRM.state.cands.unshift(rij);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('candidates').insert(rij);
          if(error){ CRM.state.cands.shift(); err.style.display=''; err.textContent = 'Opslaan mislukt: ' + error.message; return; }
        }
        /* Het kandidaat_id ís de overdracht: daarop verdwijnt de rij uit de
           werklijst en het bord. De status blijft op 'Intake ingepland' —
           'Doorgeschoten' bestaat niet meer als status (Tjeerd, 27 aug 2026). */
        await bewaarLead(lead, {status:'Intake ingepland', kandidaat_id:cand.id, laatst_actie:new Date().toISOString()});
        await CRM.logActiviteit('lead', lead.id, 'systeem', `Kandidaat aangemaakt — intake (videocall) ${CRM.fmtDate(cand.datum)}`);
        await CRM.logActiviteit('kandidaat', cand.id, 'gesprek', `Intake (videocall) gehad op ${CRM.fmtDate(cand.datum)} — kandidaat aangemaakt vanuit sollicitant (${cand.bron})`);
        const intakeVak = m.querySelector('#ds_intake');
        /* Bij 'intake volgt later' heeft het intakeformulier nu geen zin. */
        const nuIntake = fase === 'Talentpool' ? false : (intakeVak ? intakeVak.checked : false);
        CRM.modal._onClose = null;
        CRM.modal.close(); CRM.drawer.close();
        tekenKop(); tekenTabs(); tekenBody(); CRM.navBadges();
        klaar(true);
        /* Leverde de bot een cv-link, dan halen we dat bestand meteen op en
           gaat het door de bestaande cv-inlezer: de nieuwe kaart wordt
           direct verrijkt. Het controlevenster blijft ertussen — dezelfde
           regel als bij elk cv: de AM ziet wat het cv zegt en kiest wat er
           op de kaart komt. Alleen buiten de belronde automatisch openen;
           in de ronde gaat de ronde voor en staat de actie in de toast. */
        const botCv = !lead._kand && !lead.cv && !!String(lead.cv_url||'').trim() && !!CRM.cvParse;
        const cvInlezen = async () => {
          CRM.toast('Bot-cv ophalen…','ok');
          const f = await botCvBestand(lead);
          if(!f){
            CRM.toast('Het bot-cv kon niet automatisch opgehaald worden — open de cv-link op de kaart en lees hem daar in','err');
            if(!opts.rond) CRM.ga('kandidaten', {id:cand.id});
            return;
          }
          CRM.cvParse.open({kandidaat: CRM.kandidaat(cand.id) || cand, bestand: f,
            onKlaar: () => { if(opts.rond) CRM.render(); else CRM.ga('kandidaten', {id:cand.id}); }});
        };
        /* Binnen een belronde blijft de ronde voorgaan: een toast met een link
           naar de vervolgactie, en door naar de volgende. Een venster openen
           zou de ronde onderbreken voor werk dat ook straks nog kan. */
        if(opts.rond)
          return toastLink(`${cand.naam} staat klaar om voor te stellen`,
                           botCv ? 'Bot-cv inlezen →' : 'Intake invullen →',
                           botCv ? cvInlezen : () => intakeForm(cand.id));
        CRM.toast(`${cand.naam} staat klaar om voor te stellen`, 'ok');
        if(botCv) return cvInlezen();
        /* De intake is wat een kandidaat verkoopbaar maakt. Invullen terwijl
           het gesprek nog vers is levert een beter verhaal op dan een week
           later. Wie dat niet wil, gaat naar de volledige kaart. */
        if(nuIntake) intakeForm(cand.id);
        else CRM.ga('kandidaten', {id:cand.id});
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   + SOLLICITANT — zelf iemand toevoegen. Twee routes, hetzelfde
   eindpunt: de kandidatenkaart.

   • Handmatig — kerngegevens invullen (naam + telefoon verplicht,
     volledigheidsbalk) en je staat op de kaart.
   • CV inlezen — idem, maar dan op fase 'Intake'. Wie een cv heeft, is
     voorbij het stadium van een lead. Zie sollicitantCvRoute.

   Tussen het formulier en de kaart zat een derde stap: kies eerst een
   bestemming — vacature, golden candidate of alleen opslaan. Die is weg
   (Tjeerd, 3 aug 2026: "als ik een sollicitant toevoeg, dan moet die
   meteen de gehele kandidatenkaart openen zodat je vanuit daar de status
   kan koppelen ook"). Alle drie die keuzes kún je op de kaart zelf maken
   — 'Vacature koppelen…', de sterknop 'Golden candidate' en 'Fase
   wijzigen…' staan daar allemaal — en daar zie je er ook bij wát je
   koppelt. Vooraf kiezen betekende raden vóór je de kaart gezien had.
   ═══════════════════════════════════════════════════════════════ */
function nieuweSollicitantKeuze(){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe sollicitant</div>
      <p class="sub" style="margin:6px 0 0">Hoe wil je de sollicitant toevoegen?</p></div>
    <div class="modal-b">
      <div class="rc-route">
        <button id="ns_hand"><b>Handmatig invullen</b><small>Typ de gegevens zelf in. Levert meteen een kandidatenkaart op, en staat op fase Nieuw in de recruitmentpijplijn.</small></button>
        <button id="ns_cv"><b>CV inlezen</b><small>PDF, Word of tekst. Levert meteen een volledige kandidatenkaart op fase Intake.</small></button>
      </div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      m.querySelector('#ns_hand').onclick = () => { CRM.modal.close(); sollicitantForm({}); };
      m.querySelector('#ns_cv').onclick   = () => { CRM.modal.close(); sollicitantCvRoute(); };
    }});
}

/* Het enige formulier — kerngegevens met volledigheidsbalk (zelfde
   meetlat als de doorschiet-poortwachter: CRM.volledigheid), en daarna
   meteen de kaart. De balk blijft hier staan en niet alleen op de kaart:
   hij hoort bij het moment dat je de gegevens intypt, want daar voorkom
   je de vervuiling. Op de kaart staat dezelfde meetlat als "Wat mist
   nog" — dat is de herinnering achteraf, niet de rem vooraf. */
function sollicitantForm(pre){
  pre = pre || {};
  const rij = (id, lbl, val, type, hint) => `
    <div class="f-row"><label for="nsf_${id}">${h(lbl)}</label>
      <input type="${type||'text'}" id="nsf_${id}" value="${h(val||'')}">${hint?`<span class="hint">${h(hint)}</span>`:''}</div>`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Nieuwe sollicitant</div>
      <p class="sub" style="margin:6px 0 0">Naam en telefoon zijn verplicht. De rest is aanbevolen — half ingevulde kandidaten vervuilen het systeem.</p></div>
    <div class="modal-b">
      <div class="rc-vol" id="ns_vol"></div>
      <div class="f-grid" style="margin-top:14px">
        ${rij('naam','Naam','')}
        ${rij('tel','Telefoonnummer', pre.telefoon, 'tel')}
        ${rij('mail','E-mail (aanbevolen)', pre.email, 'email')}
        ${rij('plaats','Woonplaats (aanbevolen)', pre.woonplaats)}
        ${rij('functie','Gezochte functie (aanbevolen)', pre.functie)}
        <div class="f-row"><label for="nsf_bron">Bron (aanbevolen)</label>
          <select id="nsf_bron">${CRM.LEAD_BRONNEN.map(b=>`<option ${b==='Handmatig'?'selected':''}>${h(b)}</option>`).join('')}</select></div>
        <!-- Waar deze persoon staat, kies je zelf. Soms zet je iemand er pas in
             nadat je hem al gesproken hebt, of met de videocall al in de agenda.
             Vast op 'Nieuw' zetten betekent dat je het daarna alsnog moet
             corrigeren. (Tjeerd, 3 aug 2026.) Stond in de bestemmingsstap die
             hierna kwam; die is weg, dus staat de vraag nu hier. Wijzigen kan
             op de kaart met 'Fase wijzigen…'. -->
        <div class="f-row"><label for="nsf_fase">Waar staat deze persoon?</label>
          <select id="nsf_fase">${(CRM.INSTROOM||[]).map(f =>
            `<option value="${h(f.k)}"${f.k==='Nieuw'?' selected':''}>${h(f.k)}</option>`).join('')}</select></div>
      </div>
      ${pre.cv ? `<div class="note ok" style="margin-top:4px">Het ingelezen CV wordt aan deze sollicitant gekoppeld.</div>` : ''}
      <div class="note err" id="ns_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ns_ok">Kandidatenkaart openen →</button></div>`, {onOpen(m){
      const g = id => m.querySelector('#nsf_'+id).value.trim();
      const vol = () => {
        const v = CRM.volledigheid({naam:g('naam'), telefoon:g('tel'), woonplaats:g('plaats'),
          functie:g('functie'), bron:m.querySelector('#nsf_bron').value, email:g('mail'), cv:pre.cv||null});
        m.querySelector('#ns_vol').innerHTML = `
          <div class="row" style="justify-content:space-between"><span class="label">Volledigheid</span>
            <span class="num">${v.pct}%</span></div>
          ${CRM.ui.bar(v.pct, v.pct>=80?'green':v.pct>=50?'amber':'red')}`;
      };
      ['naam','tel','mail','plaats','functie'].forEach(id => m.querySelector('#nsf_'+id).oninput = vol);
      m.querySelector('#nsf_bron').onchange = vol;
      vol();
      setTimeout(()=>m.querySelector('#nsf_naam').focus(), 60);
      m.querySelector('#ns_ok').onclick = async () => {
        const err = m.querySelector('#ns_err');
        const zeg = t => { err.style.display=''; err.textContent = t; };
        if(!g('naam')) return zeg('Vul de naam in.');
        if(!g('tel'))  return zeg('Vul het telefoonnummer in — zonder nummer kun je niet bellen.');
        /* Staat dit nummer er al? Melden, niet blokkeren. Iemand die voor de
           tweede keer reageert is juist interessant — maar dan wil je verder
           op de bestaande kaart, niet naast de geschiedenis beginnen. */
        const dubbel = CRM.zelfdeNummer ? CRM.zelfdeNummer(g('tel')) : [];
        if(dubbel.length && !m.dataset.dubbelGezien){
          m.dataset.dubbelGezien = '1';
          const d = dubbel[0];
          const waar = d.soort === 'kandidaat'
            ? `staat al als kandidaat${d.fase ? ' op ' + d.fase : ''}${d.klant ? ' bij ' + d.klant : ''}`
            : `staat al als sollicitant op ${CRM.leadNorm(d.status) || 'Nieuw'}`;
          return zeg(`Dit nummer is al bekend: ${d.naam || 'een bestaande kaart'} — ${waar}. `
            + `Werk daar verder, dan blijft de geschiedenis bij elkaar. Klik nog een keer om tóch een nieuwe kaart te maken.`);
        }
        const gg = {naam:g('naam'), telefoon:g('tel'), email:g('mail'), woonplaats:g('plaats'),
                    functie:g('functie'), bron:m.querySelector('#nsf_bron').value, cv:pre.cv||null};
        const fase = m.querySelector('#nsf_fase').value;
        const cand = await maakSollicitantRij(gg, fase);
        if(!cand) return;                       // opslaan mislukt; melding staat al
        CRM.modal.close();
        /* Meteen naar de kaart. Daar doe je het echte werk: cv inlezen,
           intake vastleggen, vacature koppelen, fase bijhouden. Hij blijft
           óók op het recruitmentbord staan, in de kolom van zijn fase. */
        CRM.ga('kandidaten', {id:cand.id});
        CRM.toast(`${gg.naam} staat op ${fase} — koppel hier de vacature of wijzig de fase`, 'ok');
        /* Soms is het gesprek (videocall + eerste intake) al geweest vóór
           deze kandidaat er überhaupt in staat — dan hoeft de fase niet
           apart via de kaart verder te worden gezet. De picker staat meteen
           open; niets kiezen laat 'm gewoon op de zojuist gekozen fase staan
           (naam: Tjeerd, 10 aug 2026). */
        if(CRM.kandidaatFasePicker) CRM.kandidaatFasePicker(cand.id);
      };
    }});
}

/* Een handmatig toegevoegde sollicitant krijgt meteen een KANDIDAATKAART.

   Dit was een rij in crm_leads. Tjeerd, 3 aug 2026: "als we een sollicitant
   er zelf inzetten dan is het meestal interessant genoeg, dus dan mag het een
   kandidatenkaart hebben." Dat klopt ook met wat de rest van het systeem doet:
   op een kaart kun je een cv inlezen, een intake vastleggen, een vacature
   koppelen en de fase bijhouden — op een leadrij niet.

   Het kon pas nu dit veilig is: sinds leads() ook kandidaten met een
   instroomfase teruggeeft, blijft zo iemand gewoon op het recruitmentbord
   staan. Anders was hij daar meteen uit beeld verdwenen.

   De echte leadtabel blijft bestaan voor wat er straks uit Meta binnenkomt:
   duizend per maand, ongefilterd. Die worden pas een kaart als iemand ze
   interessant genoeg vindt. */
async function maakSollicitantRij(gg, fase){
  const vandaag = CRM.todayISO();
  fase = CRM.faseNorm(fase);
  const f = (CRM.INSTROOM||[]).some(p => p.k === fase) ? fase : 'Nieuw';
  /* Zonder vacature en zonder klant: die koppel je op de kaart, met de
     vacaturelijst en de kandidaat naast elkaar in beeld. */
  const cand = {
    id:CRM.uid(), naam:gg.naam, telefoon:gg.telefoon, email:gg.email||'',
    woonplaats:gg.woonplaats||'', functie:gg.functie||'',
    klant:'', vacatureId:'', type:'W&S',
    bron:gg.bron||'Handmatig', fase:f, since:vandaag, rec:CRM.me(),
    cv:gg.cv||null, historie:[{fase:f, op:vandaag}], notities:[]
  };
  const rij = CRM.candToRow(cand);
  CRM.state.cands.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').insert(rij);
    if(error){ CRM.state.cands.shift(); CRM.fout('Opslaan mislukt', error); return null; }
  }
  await CRM.logActiviteit('kandidaat', cand.id, 'systeem', `Handmatig toegevoegd — fase ${f}`);
  return CRM.kandidaat(cand.id) || cand;
}

/* Golden candidate maak je niet meer bij het toevoegen aan: dat kon alleen
   in de bestemmingsstap, en die is weg. Het is ook geen soort kandidaat maar
   een vlag ("goed, nu geen passende vacature"), en die zet je met de
   sterknop op de kaart — waar je de kandidaat vóór je hebt. De vlag zelf
   leeft ongewijzigd in candidates.golden en filtert nog steeds in
   Kandidaten → Golden candidates ★. */

/* ═══════════════════════════════════════════════════════════════
   CV INLEZEN — via CRM.cvParse (js/cvparse.js)

   Er stond hier een eigen parser die een pdf regel voor regel op
   y-positie las. Bij een cv met twee kolommen — links opleiding,
   talen en vaardigheden, rechts de werkervaring — worden die kolommen
   dan per regel door elkaar geweven en houd je zinnen over waar geen
   werkgever en geen periode meer in te herkennen is. Vandaar dat een
   cv waarin de jaartallen gewoon zichtbaar staan tóch "geen
   werkverleden met jaartallen" opleverde.

   CRM.cvParse bepaalt eerst waar de kolomscheiding zit en leest daarna
   pas per kolom. Dat is één module voor alle schermen; hier staat
   alleen nog wat Recruitment ermee doet.
   ═══════════════════════════════════════════════════════════════ */

const cvWaarde = (p, k) => (p && p.velden && p.velden[k] ? String(p.velden[k].waarde || '').trim() : '');

/* Periode van een dienstverband of opleiding als leesbare tekst.
   '2024-01' wordt '01-2024' — een jaar vooraan leest als een jaartal. */
function cvPeriode(w){
  const f = s => String(s || '').replace(/^(\d{4})-(\d{2})$/, '$2-$1');
  if(w.lopend) return (f(w.van) || '?') + ' – heden';
  if(w.van && w.tot) return f(w.van) + ' – ' + f(w.tot);
  return f(w.van) || f(w.tot) || w.periode || '';
}
const cvWerkRegel = w => [w.functie, w.werkgever].filter(Boolean).join(' — ')
  + (cvPeriode(w) ? ' (' + cvPeriode(w) + ')' : '');
const cvOplRegel = o => [o.school, [o.niveau, o.richting].filter(Boolean).join(' ')].filter(Boolean).join(' — ')
  + (cvPeriode(o) ? ' (' + cvPeriode(o) + ')' : '');

/* Eén regel "dit kwam eruit". Bedoeld om te laten zien dát het gelukt is,
   niet om te controleren — dat gebeurt in het venster van CRM.cvParse,
   waar per gegeven staat wat er nu op de kaart staat en wat het cv zegt. */
function cvVangst(p){
  if(!p) return '';
  const d = [];
  ['telefoon','email','woonplaats'].forEach(k => { if(cvWaarde(p,k)) d.push({telefoon:'telefoon', email:'e-mail', woonplaats:'woonplaats'}[k]); });
  if(p.werk.length)         d.push(p.werk.length + ' dienstverband' + (p.werk.length === 1 ? '' : 'en'));
  if(p.opleidingen.length)  d.push(p.opleidingen.length + ' opleiding' + (p.opleidingen.length === 1 ? '' : 'en'));
  if(p.certificaten.length) d.push(p.certificaten.length + ' certifica' + (p.certificaten.length === 1 ? 'at' : 'ten'));
  if(p.talen.length)        d.push(p.talen.length + ' talen');
  return d.join(', ') || 'geen losse gegevens';
}

/* ─── + Sollicitant → CV inlezen ──────────────────────────────────
   Deze route levert meteen een kandidaat op, geen lead.

   Waarom: wie een cv in handen heeft, heeft meer dan een lead. De oude
   route zette eerst een leadrij neer en vroeg daarna in een apart
   formulier nogmaals om naam, telefoon, e-mail, woonplaats, functie en
   bron — precies de velden die net uit het cv zijn gelezen. Nu ontstaat
   er direct een kandidaatkaart op fase 'Intake': klaar om voorgesteld te
   worden, en nog niet op het bord van Klanttrajecten — dat begint bij
   'Voorgesteld'. Dezelfde bestemming dus als doorschietForm oplevert.

   Wat het kost: deze kandidaat hangt niet aan een vacature en niet aan
   een campagne, dus deze kaart telt niet mee in leads-per-plaatsing per klant
   of per vacature. Dat is hier het minste kwaad — een cv dat met de hand
   binnenkomt kómt niet uit een campagne, en meetellen zou die cijfers
   juist vertroebelen. De vacature koppel je op de kaart zelf zodra je
   weet waar deze kandidaat heen gaat.

   De naam is het enige dat vooraf gevraagd wordt. Een kandidaat zonder
   naam is in geen enkele lijst terug te vinden, dus die mag niet
   stilzwijgend ontstaan; staat de naam niet in het cv, dan typ je hem hier
   en gaat al het andere gewoon mee. Wie handmatig wil invullen houdt de
   oude route met de leadrij — die is ongemoeid gebleven. */
function sollicitantCvRoute(){
  if(!CRM.cvParse) return CRM.toast('De CV-lezer is niet geladen — herlaad de pagina','err');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">CV inlezen</div>
      <p class="sub" style="margin:6px 0 0">PDF, Word of tekstbestand. Het bestand wordt in je browser gelezen — er gaat
      niets naar een externe dienst. Hierna zie je de volledige kandidatenkaart, met alles wat in het CV stond.</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="nc_file">Bestand</label>
        <input type="file" id="nc_file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain">
        <span class="hint">Maximaal 25 MB.</span></div>
      <div id="nc_uit" style="margin-top:14px"></div>
      <div class="note err" id="nc_err" style="display:none;margin-top:12px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="nc_ok" disabled>Kandidaat aanmaken →</button></div>`, {onOpen(m){
      let bestand = null, p = null;
      const uit = m.querySelector('#nc_uit'), ok = m.querySelector('#nc_ok'), err = m.querySelector('#nc_err');

      m.querySelector('#nc_file').onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        bestand = f; p = null;
        err.style.display = 'none';
        uit.innerHTML = CRM.ui.laden('CV lezen…');
        ok.disabled = true;
        try{
          const r = await CRM.cvParse.leesBestand(f);
          const tekst = r.tekst || '';
          p = tekst.replace(/[\s\f]/g,'')
            ? CRM.cvParse.parseTekst(tekst, {bestandsnaam:f.name, groot:r.groot}) : null;
          const naam = cvWaarde(p, 'naam');
          uit.innerHTML = `
            <div class="f-row"><label for="nc_naam">Naam van de kandidaat</label>
              <input type="text" id="nc_naam" value="${h(naam)}" placeholder="Voor- en achternaam">
              <span class="hint">${naam
                ? 'Uit het CV gelezen — pas de naam aan als dit niet klopt.'
                : 'Stond niet in het CV. Vul de naam hier in; al het andere uit het CV gaat gewoon mee.'}</span></div>
            <!-- Waar deze kandidaat staat, kiest de recruiter zelf. Er stond
                 eerst een vaste fase, maar een cv zegt niets over het
                 gesprek: je kunt de intake al gepland hebben, of al gehad.
                 (Tjeerd, 3 aug 2026: "je kan ook al een videocall hebben gehad
                 en gepland. Je moet dus zelf kunnen kiezen op welke fase.")
                 Standaard 'Potentieel': wie een cv instuurt is meer dan
                 'Nieuw', maar er is nog geen afspraak. -->
            <div class="f-row" style="margin-top:12px"><label for="nc_fase">Waar staat deze kandidaat?</label>
              <select id="nc_fase">${(CRM.INSTROOM||[]).map(f =>
                `<option value="${h(f.k)}"${f.k==='Potentieel'?' selected':''}>${h(f.k)}</option>`).join('')}</select>
              <span class="hint">Je kunt dit later op de kaart altijd bijstellen.</span></div>
            ${p
              ? `<p class="meta" style="margin:10px 0 0">Verder gevonden: ${h(cvVangst(p))}. Je kiest zo per gegeven wat je overneemt.</p>`
              : `<div class="note warn" style="margin-top:10px">Er kwam geen tekst uit dit bestand — waarschijnlijk een scan,
                 of een pdf waarin de letters vormen zijn geworden. Het bestand blijft wel bij de kandidaat staan; de gegevens
                 vul je met de hand aan.</div>`}`;
          ok.disabled = false;
          const nv = m.querySelector('#nc_naam');
          nv.onkeydown = ev => { if(ev.key === 'Enter'){ ev.preventDefault(); ok.click(); } };
          setTimeout(() => nv.focus(), 60);
        }catch(e2){
          uit.innerHTML = `<div class="note err">${h(e2.message || 'Lezen mislukt')}</div>`;
        }
      };

      ok.onclick = async () => {
        const veld = m.querySelector('#nc_naam');
        const naam = veld ? veld.value.trim() : '';
        if(!naam){
          err.style.display = '';
          err.textContent = 'Vul de naam in — zonder naam is deze kandidaat in geen enkele lijst terug te vinden.';
          if(veld) veld.focus();
          return;
        }
        ok.disabled = true; ok.textContent = 'Bezig…';
        const fSel = m.querySelector('#nc_fase');
        const cand = await maakCvKandidaat(naam, fSel ? fSel.value : 'Potentieel');
        if(!cand){ ok.disabled = false; ok.textContent = 'Kandidaat aanmaken →'; return; }
        /* De rest doet CRM.cvParse: per gegeven tonen wat het cv zegt, en bij
           akkoord het bestand en de pasfoto opslaan. Op een verse kaart staat
           alles aan — er valt niets te overschrijven. */
        CRM.cvParse.open({kandidaat:cand, bestand,
          onKlaar: c => {
            CRM.ga('kandidaten', {id:c.id});
            /* Zelfde reden als bij het handmatige formulier: het gesprek kan
               al verder zijn dan de fase die hier gekozen werd. */
            if(CRM.kandidaatFasePicker) CRM.kandidaatFasePicker(c.id);
          }});
      };
    }});
}

/* Een kandidaatkaart met alleen de naam erop. De rest komt uit het venster
   van CRM.cvParse, dat er meteen achteraan opengaat. */
/* fase = wat de recruiter in het venster koos. Stond hier eerst vast op
   'Intake', en daarmee kwam elke ingelezen cv meteen in de lijst "klaar om
   voor te stellen" — zonder dat er ooit een intake was geweest. Ook een
   vaste tussenfase is een aanname: je kunt de call al gepland of gehad
   hebben. De recruiter kiest; de terugval is 'Potentieel'. Oude fasenamen
   worden eerst door CRM.faseNorm gehaald. */
async function maakCvKandidaat(naam, fase){
  const vandaag = CRM.todayISO();
  fase = CRM.faseNorm(fase);
  const f = (CRM.INSTROOM||[]).some(p => p.k === fase) ? fase : 'Potentieel';
  const cand = {
    id:CRM.uid(), naam, telefoon:'', email:'', woonplaats:'', functie:'',
    klant:'', type:'W&S', bron:'Handmatig', fase:f, since:vandaag,
    rec:CRM.me(), cv:null, historie:[{fase:f, op:vandaag}], notities:[]
  };
  const rij = CRM.candToRow(cand);
  CRM.state.cands.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').insert(rij);
    if(error){ CRM.state.cands.shift(); CRM.fout('Opslaan mislukt', error); return null; }
  }
  await CRM.logActiviteit('kandidaat', cand.id, 'systeem',
    `Aangemaakt vanuit een ingelezen CV — fase ${f}, nog niet aan een vacature gekoppeld`);
  /* Teruggeven wat de rest van de app ook ziet, en niet het concept hierboven:
     CRM.cvParse werkt dit object bij en schrijft het via CRM.candToRow terug. */
  return CRM.kandidaat(cand.id) || cand;
}

/* ─── CV bij een sollicitant in de pijplijn ───────────────────────
   Dezelfde lezer, andere bestemming: het resultaat gaat naar de leadrij.
   Een sollicitant hoort niet in `candidates` te belanden voordat de
   poortwachter in doorschietForm langs is geweest — daar wordt de
   vacature bevestigd, en zonder die koppeling telt niets mee bij leads
   per vacature en per klant. Is de lead al doorgeschoten, dan ís er een
   kandidaat en gaat het cv daar naartoe, mét pasfoto. */
function cvModal(lead){
  if(!CRM.cvParse) return CRM.toast('De CV-lezer is niet geladen — herlaad de pagina','err');
  if(lead.kandidaat_id){
    const c = CRM.kandidaat(lead.kandidaat_id);
    if(c) return CRM.cvParse.open({kandidaat:c, onKlaar:() => { tekenLijst(); openLead(lead.id); }});
  }
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">CV toevoegen</div>
      <p class="sub" style="margin:6px 0 0">PDF, Word of tekstbestand. Het bestand wordt in je browser gelezen — er gaat
      niets naar een externe dienst. Je bevestigt zelf wat wordt overgenomen; het gaat mee naar de kandidaatkaart zodra
      je deze sollicitant doorschiet.</p></div>
    <div class="modal-b">
      <input type="file" id="cv_file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain">
      <div id="cv_uit" style="margin-top:14px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Sluiten</button>
      <button class="btn" id="cv_ok" disabled>Overnemen</button></div>`, {onOpen(m){
      const uit = m.querySelector('#cv_uit'), ok = m.querySelector('#cv_ok');
      let p = null, bestand = null;
      m.querySelector('#cv_file').onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        bestand = f; p = null;
        uit.innerHTML = CRM.ui.laden('CV lezen…');
        ok.disabled = true;
        try{
          const r = await CRM.cvParse.leesBestand(f);
          const tekst = r.tekst || '';
          if(!tekst.replace(/[\s\f]/g,'')){
            uit.innerHTML = `<div class="note warn">Er kwam geen tekst uit dit bestand — waarschijnlijk een scan, of een
              pdf waarin de letters vormen zijn geworden. Het bestand kun je wel bewaren; de gegevens vul je met de hand in.</div>`;
            ok.disabled = false; ok.textContent = 'Alleen bestand bewaren';
            return;
          }
          p = CRM.cvParse.parseTekst(tekst, {bestandsnaam:f.name, groot:r.groot});
          const rij = (id, lbl, waarde, type) => `
            <div class="f-row"><label for="cv_${id}">${h(lbl)}</label>
              <input type="${type||'text'}" id="cv_${id}" value="${h(waarde)}"></div>`;
          uit.innerHTML = `
            <p class="label" style="margin-bottom:8px">Gevonden — controleer en pas aan</p>
            <div class="f-grid">
              ${rij('naam','Naam', cvWaarde(p,'naam'))}
              ${rij('tel','Telefoon', cvWaarde(p,'telefoon'), 'tel')}
              ${rij('mail','E-mail', cvWaarde(p,'email'), 'email')}
              ${rij('plaats','Woonplaats', cvWaarde(p,'woonplaats'))}
              ${rij('functie','Functie', cvWaarde(p,'functie'))}
              ${rij('jaren','Ervaring (jaren)', p.ervaringJaren == null ? '' : p.ervaringJaren, 'number')}
            </div>
            ${rij('talen','Talen', p.talen.map(t => t.naam + (t.niveau ? ' (' + t.niveau + ')' : '')).join(', '))}
            ${rij('cert','Certificaten', p.certificaten.map(x => x.naam).join(', '))}
            <div class="f-row"><label for="cv_werk">Werkverleden</label>
              <textarea id="cv_werk" style="min-height:92px">${h(p.werk.map(cvWerkRegel).join('\n'))}</textarea></div>
            ${p.opleidingen.length ? `<div class="f-row"><label for="cv_opl">Opleiding</label>
              <textarea id="cv_opl" style="min-height:56px">${h(p.opleidingen.map(cvOplRegel).join('\n'))}</textarea></div>` : ''}
            ${p.nietGevonden.length
              ? `<div class="note warn">Niet gevonden in dit CV: ${h(p.nietGevonden.join(', '))}. Vul dat zelf aan.</div>`
              : '<div class="note ok">Alles gevonden waar we naar zochten. Loop het nog even na.</div>'}
            <label class="check" style="margin-top:10px"><input type="checkbox" id="cv_over" checked>
              Lege velden van de sollicitant aanvullen (bestaande waarden blijven staan)</label>`;
          ok.disabled = false; ok.textContent = 'Overnemen';
        }catch(err){
          uit.innerHTML = `<div class="note err">${h(err.message || 'Lezen mislukt')}</div>`;
        }
      };
      ok.onclick = async () => {
        ok.disabled = true; ok.textContent = 'Bezig…';
        const g = id => { const el = m.querySelector('#cv_' + id); return el ? el.value.trim() : ''; };
        const lijst = s => s.split(/[,;]/).map(x => x.trim()).filter(Boolean);
        const regels = s => s.split(/\n/).map(x => x.trim()).filter(Boolean);
        const cv = Object.assign({}, lead.cv || {});
        if(p){
          cv.functie       = g('functie');
          cv.ervaringJaren = g('jaren') ? +g('jaren') : null;
          cv.talen         = lijst(g('talen'));
          cv.certificaten  = lijst(g('cert'));
          cv.werk          = regels(g('werk'));            // leesbare regels voor dit paneel
          /* Ook de losse velden bewaren: doorschietForm neemt dit blok
             ongewijzigd mee naar de kandidaatkaart, en daar wordt er per
             dienstverband en per opleiding een regel van gemaakt. */
          cv.werkgevers    = p.werk.map(w => ({functie:w.functie, werkgever:w.werkgever,
                                               periode:cvPeriode(w), van:w.van, tot:w.tot, lopend:w.lopend}));
          cv.opleidingen   = p.opleidingen.map(o => ({school:o.school, opleiding:[o.niveau,o.richting].filter(Boolean).join(' '),
                                                      richting:o.richting, niveau:o.niveau,
                                                      jaar:cvPeriode(o), periode:cvPeriode(o), van:o.van, tot:o.tot}));
          if(p.skills.length) cv.skills = p.skills;
        }
        cv.op = new Date().toISOString();
        cv.door = CRM.me();
        if(bestand) await uploadLeadCv(lead, bestand, cv);

        const patch = {cv};
        if(m.querySelector('#cv_over')?.checked){
          if(!lead.naam && g('naam'))            patch.naam = g('naam');
          if(!lead.telefoon && g('tel'))         patch.telefoon = g('tel');
          if(!lead.email && g('mail'))           patch.email = g('mail');
          if(!lead.woonplaats && g('plaats'))    patch.woonplaats = g('plaats');
          if(!lead.functie && !lead.vacature_id && g('functie')) patch.functie = g('functie');
        }
        await bewaarLead(lead, patch);
        await CRM.logActiviteit('lead', lead.id, 'doc',
          'CV ingelezen' + (bestand ? ' (' + bestand.name + ')' : '') + ' en gecontroleerd'
          + (p && p.nietGevonden.length ? '. Niet gevonden: ' + p.nietGevonden.join(', ') : ''));
        CRM.modal.close(); CRM.toast('CV opgeslagen','ok');
        tekenLijst(); openLead(lead.id);
      };
    }});
}

/* Het bestand zelf, in dezelfde afgeschermde map als de cv's van
   kandidaten. Het pad zit in het cv-blok en dat blok verhuist ongewijzigd
   mee bij het doorschieten, dus het document blijft aan de persoon hangen
   en niet aan de leadrij. Een pad dat je uit een naam kunt afleiden is een
   uitnodiging, vandaar het willekeurige sleuteltje. */
async function uploadLeadCv(lead, file, cv){
  if(CRM.demo){ CRM.toast('Demo: het bestand wordt niet geüpload'); return false; }
  const veilig = String(file.name || 'cv').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^\w.-]+/g,'_').replace(/_{2,}/g,'_').slice(-60);
  const pad = `sollicitanten/${String(lead.id).replace(/[^\w-]/g,'')}/cv/${CRM.todayISO()}-${Math.random().toString(36).slice(2,8)}-${veilig}`;
  const {error} = await CRM.sb.storage.from(CRM.opslag.map).upload(pad, file, {upsert:false});
  if(error){ CRM.toast(CRM.opslag.foutTekst(error), 'err'); return false; }
  /* Een eerder cv wordt niet overschreven en niet weggegooid: het is het
     document waarop een voorstel gebaseerd kan zijn. */
  if(cv.bestandPad){
    const eerder = Array.isArray(cv.eerder) ? cv.eerder.slice(0, 9) : [];
    eerder.unshift({pad:cv.bestandPad, bestand:cv.bestand || '', op:cv.op || '', door:cv.door || ''});
    cv.eerder = eerder;
  }
  cv.bestandPad = pad;
  cv.bestand = file.name;
  cv.grootte = file.size;
  cv.type = file.type || '';
  CRM.opslag.wis(pad);
  return true;
}
/* ═══════════════════════════════════════════════════════════════
   IMPORT — CSV plakken of bestand, kolommen koppelen, dubbelen zien
   ═══════════════════════════════════════════════════════════════ */
function kiesDelim(regel){
  const tel = c => (regel.split(c).length - 1);
  return [['\t',tel('\t')], [';',tel(';')], [',',tel(',')]].sort((a,b)=>b[1]-a[1])[0][0];
}
function parseCSV(tekst){
  const eerste = tekst.split(/\r?\n/)[0] || '';
  const delim = kiesDelim(eerste);
  const rijen = []; let rij = [], veld = '', inQ = false;
  for(let i = 0; i < tekst.length; i++){
    const c = tekst[i];
    if(inQ){
      if(c === '"'){ if(tekst[i+1] === '"'){ veld += '"'; i++; } else inQ = false; }
      else veld += c;
    }
    else if(c === '"') inQ = true;
    else if(c === delim){ rij.push(veld); veld = ''; }
    else if(c === '\n'){ rij.push(veld); rijen.push(rij); rij = []; veld = ''; }
    else if(c !== '\r') veld += c;
  }
  if(veld !== '' || rij.length){ rij.push(veld); rijen.push(rij); }
  return rijen.map(r => r.map(v => v.trim())).filter(r => r.some(v => v !== ''));
}

const IMP_VELDEN = [
  {k:'naam',        lbl:'Naam',            hints:['naam','name','volledige naam','full name']},
  {k:'telefoon',    lbl:'Telefoon',        hints:['tel','phone','mobiel','nummer','whatsapp']},
  {k:'email',       lbl:'E-mail',          hints:['mail','email','e-mail']},
  {k:'woonplaats',  lbl:'Woonplaats',      hints:['plaats','woonplaats','stad','city']},
  {k:'bron',        lbl:'Bron',            hints:['bron','source','platform','kanaal']},
  {k:'campagne',    lbl:'Campagne',        hints:['campagne','campaign','adset','advertentie']},
  {k:'vacature',    lbl:'Vacature',        hints:['vacature','functie','job','positie','role']},
  {k:'klant',       lbl:'Klant',           hints:['klant','bedrijf','client','opdrachtgever']},
  {k:'status',      lbl:'Status',          hints:['status']},
  {k:'prioriteit',  lbl:'Prioriteit',      hints:['prio','priority']},
  {k:'score',       lbl:'Score',           hints:['score','kwalificatiescore','rating']},
  {k:'kwalificatie',lbl:'Kwalificatie',    hints:['kwalificatie','qualificatie','oordeel','samenvatting']},
  {k:'agent_notitie',lbl:'Notitie agent',  hints:['notitie','note','opmerking','agent','toelichting']},
  {k:'eigenaar',    lbl:'Eigenaar (AM)',   hints:['eigenaar','owner','am','recruiter']}
];

/* Kop raden: hele woorden vergelijken, anders matcht "naam" op "eigenaar". */
function kopScore(kop, veld){
  const k = norm(kop).replace(/[^a-z0-9]+/g,' ').trim();
  if(!k) return 0;
  const woorden = k.split(' ');
  let best = 0;
  veld.hints.forEach(hint => {
    if(k === hint) best = Math.max(best, 3);
    else if(woorden.includes(hint)) best = Math.max(best, 2);
    else if(hint.length >= 5 && k.includes(hint)) best = Math.max(best, 1);
  });
  return best;
}

function importModal(){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Sollicitanten importeren</div>
      <p class="sub" style="margin:6px 0 0">Plak de rijen uit de Google Sheet (met kopregel), of kies een CSV-bestand.</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="im_txt">CSV plakken</label>
        <textarea id="im_txt" style="min-height:130px;font-family:ui-monospace,monospace;font-size:12px"
          placeholder="naam;telefoon;woonplaats;bron;vacature&#10;Jan Jansen;06 12345678;Gouda;Meta;Productiemedewerker"></textarea></div>
      <div class="row"><input type="file" id="im_file" accept=".csv,.tsv,.txt,text/csv" style="width:auto">
        <div class="spacer"></div>
        <button class="btn ghost sm" id="im_lees">Kolommen koppelen →</button></div>
      <div class="note err" id="im_err" style="display:none;margin-top:12px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      const ta = m.querySelector('#im_txt');
      m.querySelector('#im_file').onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        ta.value = await f.text();
      };
      m.querySelector('#im_lees').onclick = () => {
        const rijen = parseCSV(ta.value);
        const err = m.querySelector('#im_err');
        if(rijen.length < 2){
          err.style.display = ''; err.textContent = 'Ik zie geen kopregel plus minstens één datarij.'; return;
        }
        koppelStap(rijen);
      };
    }});
}

function koppelStap(rijen){
  const kop = rijen[0], data = rijen.slice(1);
  /* Elke kolom hoogstens één keer koppelen — de beste match wint. */
  const keuze = {}, bezet = new Set();
  const kandidaten = [];
  IMP_VELDEN.forEach(v => kop.forEach((k,i) => {
    const s = kopScore(k, v);
    if(s > 0) kandidaten.push({veld:v.k, idx:i, score:s});
  }));
  IMP_VELDEN.forEach(v => keuze[v.k] = -1);
  kandidaten.sort((a,b) => b.score - a.score).forEach(c => {
    if(keuze[c.veld] === -1 && !bezet.has(c.idx)){ keuze[c.veld] = c.idx; bezet.add(c.idx); }
  });
  const opties = idx => kop.map((k,i)=>`<option value="${i}" ${idx===i?'selected':''}>${h(k || 'kolom '+(i+1))}</option>`).join('');

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Kolommen koppelen</div>
      <p class="sub" style="margin:6px 0 0">${data.length} rijen gevonden. Controleer welke kolom waar hoort.</p></div>
    <div class="modal-b">
      <div class="rc-map">
        ${IMP_VELDEN.map(v => `
          <label>${h(v.lbl)}${v.k==='naam'?' <span class="rc-req">verplicht</span>':''}</label>
          <select data-v="${v.k}"><option value="-1">— niet importeren —</option>${opties(keuze[v.k])}</select>`).join('')}
      </div>
      <div id="im_prev" style="margin-top:16px"></div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="im_skip" checked>
        Dubbelen op telefoonnummer overslaan</label>
      <div class="note err" id="im_err2" style="display:none;margin-top:10px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="im_ok">Importeren</button></div>`, {onOpen(m){
      const sels = CRM.$$('select[data-v]', m);
      const lees = () => { const k = {}; sels.forEach(s => k[s.dataset.v] = +s.value); return k; };
      const preview = () => {
        const k = lees();
        const bestaandTel = new Set(leads().map(l => telNorm(l.telefoon)).filter(Boolean));
        (CRM.state.cands||[]).forEach(c => { const t = telNorm(c.telefoon); if(t) bestaandTel.add(t); });
        const gezien = new Set();
        let dub = 0;
        const voorbeeld = data.slice(0,4).map(r => {
          const tel = k.telefoon >= 0 ? r[k.telefoon] : '';
          const t = telNorm(tel);
          const isDub = t && (bestaandTel.has(t) || gezien.has(t));
          if(t) gezien.add(t);
          return {naam:k.naam>=0?r[k.naam]:'', tel, plaats:k.woonplaats>=0?r[k.woonplaats]:'',
                  bron:k.bron>=0?r[k.bron]:'', vac:k.vacature>=0?r[k.vacature]:'', dub:isDub};
        });
        data.forEach(r => {
          const t = telNorm(k.telefoon>=0 ? r[k.telefoon] : '');
          if(t && bestaandTel.has(t)) dub++;
        });
        m.querySelector('#im_prev').innerHTML = `
          <p class="label" style="margin-bottom:8px">Voorbeeld</p>
          <div class="tblwrap"><table class="tbl"><thead><tr>
            <th>Naam</th><th>Telefoon</th><th>Plaats</th><th>Bron</th><th>Vacature</th></tr></thead>
            <tbody>${voorbeeld.map(v=>`<tr>
              <td>${h(v.naam)||'<span class="meta">leeg</span>'}${v.dub?' <span class="chip amber">dubbel</span>':''}</td>
              <td class="num">${h(v.tel)}</td><td>${h(v.plaats)}</td><td>${h(v.bron)}</td><td>${h(v.vac)}</td></tr>`).join('')}
            </tbody></table></div>
          ${dub ? `<p class="meta" style="margin:8px 2px">${dub} van de ${data.length} rijen bestaat al (zelfde telefoonnummer).</p>` : ''}`;
      };
      sels.forEach(s => s.onchange = preview);
      preview();

      m.querySelector('#im_ok').onclick = async () => {
        const k = lees(), err = m.querySelector('#im_err2');
        if(k.naam < 0){ err.style.display=''; err.textContent = 'Koppel in elk geval de kolom met de naam.'; return; }
        const skip = m.querySelector('#im_skip').checked;
        const bestaand = new Set(leads().map(l => telNorm(l.telefoon)).filter(Boolean));
        const statussen = CRM.LEAD_STATUS.map(s => s.k);
        const nieuw = [], nu = new Date().toISOString();
        let over = 0;
        data.forEach(r => {
          const veld = key => k[key] >= 0 ? String(r[k[key]] || '').trim() : '';
          const naam = veld('naam'); if(!naam) return;
          const tel = veld('telefoon'), tn = telNorm(tel);
          if(skip && tn && bestaand.has(tn)){ over++; return; }
          if(tn) bestaand.add(tn);
          const vacTekst = veld('vacature'), klantTekst = veld('klant');
          let v = vacById(vacTekst);
          if(!v && vacTekst){
            v = (CRM.state.vacs||[]).find(x => norm(x.functie) === norm(vacTekst) &&
                  (!klantTekst || CRM.zelfdeKlant(x.klant, klantTekst)))
             || (CRM.state.vacs||[]).find(x => norm(vacTekst).includes(norm(x.functie)));
          }
          /* Een import kan nog oude statusnamen bevatten ('CV binnen',
             'Geen interesse', …) — de alias-vertaling maakt er meteen de
             nieuwe waarde van, zodat er geen oude namen bíjkomen. */
          const st = CRM.leadNorm(veld('status'));
          const score = veld('score');
          nieuw.push({
            id:CRM.uid() + Math.floor(Math.random()*1e4), naam, telefoon:tel, email:veld('email'),
            woonplaats:veld('woonplaats'), bron:veld('bron') || 'Import', campagne:veld('campagne'),
            vacature_id:v ? v.id : '', klant:v ? v.klant : klantTekst, functie:v ? v.functie : vacTekst,
            status: statussen.includes(st) ? st : 'Nieuw',
            prioriteit:veld('prioriteit'), kwalificatie:veld('kwalificatie'),
            score: score && !isNaN(+score) ? +score : null,
            agent_notitie:veld('agent_notitie'), antwoorden:null, cv:null,
            eigenaar:veld('eigenaar') || CRM.me(), binnen_op:nu, opvolgen_op:null,
            kandidaat_id:'', notities:[]
          });
        });
        if(!nieuw.length){
          err.style.display=''; err.textContent = 'Er bleef niets over om te importeren' + (over?` (${over} dubbele rijen overgeslagen).`:'.');
          return;
        }
        CRM.state.leads.unshift(...nieuw);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('crm_leads').insert(nieuw);
          if(error){ CRM.state.leads.splice(0, nieuw.length); err.style.display=''; err.textContent = 'Opslaan mislukt: ' + error.message; return; }
        }
        CRM.modal.close();
        CRM.toast(`${nieuw.length} sollicitant${nieuw.length===1?'':'en'} geïmporteerd${over?` · ${over} dubbele${over===1?'':' rijen'} overgeslagen`:''}`,'ok');
        S.l.status = ''; tekenKop(); tekenTabs(); tekenLijst(); CRM.navBadges();
      };
    }});
}
/* ═══════════════════════════════════════════════════════════════
   GEDEELDE BORD-LOGICA
   Formules 1-op-1 uit het pijplijnbord (zie PARITEIT-BORD.md).
   Het bord zelf is verhuisd naar js/pijplijn.js; deze helpers
   blijven hier omdat Uitval en de bewerk-drawer ze ook gebruiken.
   Pijplijn krijgt ze via CRM._rcDeel (onderaan).
   ═══════════════════════════════════════════════════════════════ */
const daysTo = d => { const n = CRM.dagenGeleden(d); return n == null ? null : -n; };

/* Verst bereikte funnel-fase; Afgevallen/Gestopt tellen niet als 'ver gekomen'. */
function furthestPhaseIdx(c){
  const eind = CRM.faseIdx('Afgevallen');
  const idx = f => { const i = CRM.faseIdx(f); return i >= eind ? -1 : i; };
  let m = idx(c.fase);
  (c.historie||[]).forEach(x => { const i = idx(x && x.fase); if(i > m) m = i; });
  if(c.geplaatstOp){ const g = idx('Contract getekend'); if(g > m) m = g; }
  return m;
}
/* Soort afvaller: kwam de kaart ooit tot 'In de wacht' of verder, dan offer afgewezen. */
const afvalTypeVan = c => c.afvalType ||
  (furthestPhaseIdx(c) >= CRM.faseIdx('In de wacht') ? 'offer_afgewezen' : 'niet_gekwalificeerd');

/* Totaal jaarsalaris uit componenten. Rekende dit zelf uit — een tweede
   formule naast die in js/fee.js, die daardoor kon gaan afwijken. Nu roept
   hij CRM.fee.grondslag aan: dezelfde rekenregel als de kandidatenkaart, de
   klantkaart, Performance en Finance.

   Zonder `afspraak` geldt de standaardgrondslag uit de overeenkomst
   (12 maanden, VT 8% over loon incl. ploegentoeslag, EJU en overig over het
   kale jaarloon) — reken voor reken de oude formule, zodat het bedrag in dit
   venster en op de kandidaatkaart (js/kandidaten.js roept dit aan via
   CRM._rcDeel) niet verandert. Geef je wél een afspraak mee, dan volgt de
   uitkomst de grondslagvlaggen van die klant. */
function totaalJaarSalaris(loon, ploeg, vt, eju, overig, afspraak){
  if(!loon) return null;
  const gr = CRM.fee.grondslag(
    {maandloon:loon, toeslagPct:ploeg, vtPct:vt, ejuPct:eju, overigPct:overig},
    afspraak || null);
  return gr.compleet ? gr.jaarSalaris : null;
}

/* Garantie en vervanging (zelfde regels als het bord). */
const isoLoc = dt => dt.toLocaleDateString('sv-SE');
function addMonths(d, n){ if(!d) return ''; const x = new Date(d); x.setMonth(x.getMonth()+(n||0)); return isoLoc(x); }
const withinGarantie = c => { const ref = c.start || c.geplaatstOp; if(!ref || !c.gestoptOp) return true; return c.gestoptOp <= addMonths(ref, c.garantieMnd); };
const owesReplacement = c => c.fase === 'Gestopt' && c.garantieMnd > 0 && withinGarantie(c);
const garantieEnd = c => c.garantieMnd > 0 ? addMonths(c.start || c.geplaatstOp, c.garantieMnd) : '';
const repOf = c => CRM.kandidaten().find(x => x.vervangt === c.id);
const herstartOf = c => CRM.kandidaten().find(x => x.herstartVan === c.id);

const intakeDone = c => !!(c.intake && (c.intake.cijfer
  || String(c.intake.drijfveer||'').trim() || String(c.intake.jaZegt||'').trim()
  || String(c.intake.samenvatting||'').trim()));

const ooSessies = () => CRM.state.ooSessions || [];
const ooSessie  = id => ooSessies().find(s => String(s.id) === String(id));
const sessLeden = id => CRM.kandidaten().filter(c => String(c.ooId) === String(id) && c.fase === 'O&O sessie');
/* Wie er ooit in deze sessie zat, ongeacht waar diegene nu staat. sessLeden
   is de goede maat bij het plannen ("zitten er al vier in?"), maar niet om
   een sessie te beschrijven: zodra de sessie geweest is schuift iedereen door
   naar Eerste gesprek, en dan zou een geslaagde sessie er als leeg bij staan. */
const sessDeelnemers = id => CRM.kandidaten().filter(c => String(c.ooId) === String(id));
/* Welke functies deze sessie beslaat — afgeleid uit de deelnemers, niet uit
   het veld `functie` op de sessie. Er zitten geregeld kandidaten voor
   meerdere functies in één sessie, en dan zegt dat ene veld iets wat niet
   klopt. Wat je afleidt kan niet uit de pas lopen met de werkelijkheid. */
const sessFuncties = id => [...new Set(sessDeelnemers(id).map(c => c.functie).filter(Boolean))].join(' · ');

/* `alles()` tekent de eigen schermdelen van Recruitment opnieuw. Die bestaan
   alleen als Recruitment ook echt in beeld is. De fasewissel en het
   uitvalformulier worden óók vanaf het pijplijnbord aangeroepen (slepen naar
   de uitvalstrook) en vanaf de kandidatenkaart — dan moet de module die op dat
   moment openstaat verversen, anders blijft de kaart daar in zijn oude kolom
   staan en lijkt het alsof er niets is opgeslagen. */
function alles(){
  if(CRM.view !== 'recruitment') return CRM.render();
  tekenKop(); tekenTabs(); tekenBody(); CRM.navBadges();
}

/* Contract getekend + startdatum bereikt → automatisch Gestart (zoals het bord). */
async function promoteerStarts(){
  const vandaag = CRM.todayISO();
  const rijp = CRM.kandidaten().filter(c => c.fase === 'Contract getekend' && c.start && c.start <= vandaag);
  for(const c of rijp){
    await bewaarKand(c.id, {fase:'Gestart', since:vandaag,
      historie:(c.historie||[]).concat([{fase:'Gestart', op:vandaag}])});
    CRM.logActiviteit('kandidaat', c.id, 'fase', 'Automatisch naar Gestart — startdatum bereikt');
  }
  return rijp.length;
}

/* ─── Fasewissel + poortwachters (regels van het bord) ────────── */
async function bewaarFase(c, fase, extra){
  const vandaag = CRM.todayISO();
  const hist = (c.historie||[]).concat([{fase, op:vandaag}]);
  const patch = Object.assign({fase, historie:hist, since:vandaag}, extra || {});
  if(CRM.PLACED.includes(fase)){
    if(!c.geplaatstOp && patch.geplaatst_op === undefined) patch.geplaatst_op = vandaag;
  } else if(fase !== 'Gestopt' && c.geplaatstOp){
    patch.geplaatst_op = '';                  // teruggezet vóór 'Contract getekend' → geen spookplaatsing
  }
  if(fase === 'Gestopt'){ if(!c.gestoptOp && patch.gestopt_op === undefined) patch.gestopt_op = vandaag; }
  else if(c.gestoptOp) patch.gestopt_op = '';
  /* Haal je iemand terug uít de uitval, dan mag de uitvalreden niet blijven
     plakken — anders staat de kaart weer te lopen én telt hij nog als afvaller
     of stopper mee in de uitvalcijfers. */
  if(fase !== 'Afgevallen' && (c.afvalType || c.afvalCat)){ patch.afval_type = ''; patch.afval_categorie = ''; }
  if(fase !== 'Gestopt' && (c.stopDoor || c.stopCat)){ patch.stop_door = ''; patch.stop_categorie = ''; }
  if(fase !== 'O&O sessie' && c.ooId) patch.oo_id = null;
  const ok = await bewaarKand(c.id, patch);
  if(!ok) return;
  /* Bij een lege beginfase (de import uit het oude ATS, of een kaart die net
     is aangemaakt) stond hier letterlijk " → Voorgesteld". Dat leest als een
     fout in plaats van als een eerste stap. */
  await CRM.logActiviteit('kandidaat', c.id, 'fase',
    c.fase ? `${c.fase} → ${fase}` : `Fase gezet op ${fase}`);
  /* Een plaatsing is feest, voor iedereen die nu ingelogd is — en voor wie
     later inlogt (js/feest.js). Hier en nergens anders: élke fasewissel komt
     langs deze functie, of hij nu van het bord komt (slepen), uit de
     fase-picker of uit het formulier. Eén regel dekt alle ingangen, ook een
     die er later bij komt.

     De toets is "PLACED in, PLACED niet uit" en niet `fase === 'Contract
     getekend'`: een getekend contract met een startdatum van vandaag of
     eerder gaat meteen door naar Gestart, en dát is ook de plaatsing.
     Andersom viert Contract getekend → Gestart niet nog een keer.
     `c` is hier nog de kandidaat van vóór de wissel, dus c.fase is de oude. */
  if(CRM.PLACED.includes(fase) && !CRM.PLACED.includes(c.fase) && CRM.feest)
    CRM.feest.getekend({id:c.id, kandidaat:c.naam, klant:c.klant,
                        functie:c.functie, door:CRM.me()});
  CRM.toast(`${c.naam}: ${fase}`,'ok');
  alles();
}

/* Het venster van de vervangervraag. Geeft true als er verder gegaan mag
   worden (ja én nee), false bij annuleren. Bij "ja" wordt de koppeling
   meteen weggeschreven — dan valt de fee vanzelf weg (CRM.fee.geenFeeReden)
   en slaat de finance-app hem over als nieuwe plaatsing. */
function vervangerVraag(c, open){
  const regel = s => {
    const tot = garantieEnd(s);
    return `${s.naam} — ${s.functie || 'functie onbekend'}, gestopt ${CRM.fmtDateShort(s.gestoptOp)}`
         + (tot ? `, garantie tot ${CRM.fmtDateShort(tot)}` : '');
  };
  const eenling = open.length === 1;
  return new Promise(klaar => {
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Is ${h(c.naam)} een vervanger?</div>
        <p class="sub" style="margin:6px 0 0">Bij ${h(c.klant)} staat nog een vervanging open uit de garantie.
          Een vervanger is kosteloos — de fee is al gefactureerd op de voorganger.</p></div>
      <div class="modal-b">
        ${eenling
          ? `<div class="note info" style="margin:0 0 14px">${h(regel(open[0]))}</div>`
          : `<div class="f-row"><label for="vv_wie">Wie vervangt ${h(c.naam)}?</label>
              <select id="vv_wie">${open.map(s =>
                `<option value="${h(String(s.id))}">${h(regel(s))}</option>`).join('')}</select></div>`}
        <p class="meta" style="margin:0">Kies je "nieuwe plaatsing", dan telt deze gewoon mee met een eigen fee.
          De vervanging blijft dan openstaan.</p>
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-mclose>Annuleren</button>
        <button class="btn sub" id="vv_nee">Nee, nieuwe plaatsing</button>
        <button class="btn" id="vv_ja">Ja, dit is de vervanger</button>
      </div>`, {onClose: () => klaar(false), onOpen(m){
        m.querySelector('#vv_nee').onclick = () => { CRM.modal._onClose = null; CRM.modal.close(); klaar(true); };
        m.querySelector('#vv_ja').onclick = async () => {
          const wie = eenling ? String(open[0].id) : m.querySelector('#vv_wie').value;
          const stopper = CRM.kandidaat(wie);
          CRM.modal._onClose = null; CRM.modal.close();
          await bewaarKand(c.id, {vervangt: wie});
          /* Vastleggen bij de klant én bij de voorganger: over een half jaar
             wil je kunnen zien dat deze plaatsing een garantieplaatsing was
             en niet zomaar een tweede opdracht. */
          if(stopper){
            await CRM.logActiviteit('klant', c.klant, 'notitie',
              `${c.naam} is vastgelegd als kosteloze vervanger voor ${stopper.naam} (gestopt ${CRM.fmtDateShort(stopper.gestoptOp)}, binnen garantie).`);
            CRM.toast(`Vastgelegd als vervanger voor ${stopper.naam} — geen fee`, 'ok');
          }
          klaar(true);
        };
      }});
  });
}

async function faseWissel(id, fase){
  const c = CRM.kandidaat(id);
  if(!c || !fase || CRM.faseIs(c.fase, fase)) return;
  if(UITVAL.includes(fase)) return uitvalForm(c, fase);

  /* ─── De poort vóór Voorgesteld ───────────────────────────────
     Voorstellen is geen verplaatsing maar een handeling met gevolgen: er
     gaat een cv naar een klant. Daar horen drie dingen bij te kloppen, en
     dat gold hier maar half.

     De intake-vraag stond er al, maar alleen als je vanuit 'Intake' kwam.
     Wie op de import stond (fase leeg — 236 kaarten in productie) of op een
     andere fase, schoof er zonder vraag doorheen. Vandaar ook de knop
     "Video-intake" op een kaart in de kolom Voorgesteld: die stond er omdat
     het systeem toeliet dat je daar zonder intake belandde. Verkeerd om —
     dan repareer je de poort, niet de kolom.

     Klant en vacature ontbraken helemaal als eis. Zonder die twee weet
     niemand aan wie je iemand hebt voorgesteld; de kaart komt dan wel op
     het bord maar telt bij geen enkele klant en bij geen enkele vacature
     mee. Ze worden nu gevraagd in hetzelfde venster (zie vraagKlant).

     (Besluit Tjeerd, 2 aug 2026: "de knop met videointake bij voorgesteld
     klopt niet, hier is al een videointake gedaan. We stellen ze pas voor
     als dit voldaan is.") */
  if(CRM.faseIs(fase, 'Voorgesteld') && !intakeDone(c)){
    const toch = await CRM.bevestig(`${c.naam} heeft nog geen video-intake gehad`,
      'Voorstellen kan pas na de intake. Weet je zeker dat je deze kandidaat toch aan de klant voorstelt?');
    if(!toch) return;
  }

  /* ─── De poort vóór een plaatsing: is dit een vervanger? ──────
     Dit is de duurste vergissing in het systeem. Staat er bij een klant
     nog een vervangingsplicht open en leg je de vervanger vast als
     gewone plaatsing, dan rekent de finance-app er een tweede fee bij —
     bij Michal Ostrowski ging het om ruim € 10.000 omzet die nooit
     gefactureerd wordt. Er wás een route die het goed doet ("+ Vervanger"
     op Uitval), maar die moet je zelf zoeken; een kandidaat die gewoon op
     de vacature binnenkomt glipt erlangs.
     Daarom hier: elke fasewissel komt door deze functie heen, dus dit is
     de enige plek waar niemand langs kan. De vraag komt alleen als er
     echt iets openstaat — anders geen ruis.
     Matchen op klant, niet op functienaam: Michal stond als "Logistiek
     medewerker" en zijn vervanger als "Magazijn team leider". Op naam
     matchen had hem gemist. (Tjeerd, 6 aug 2026.) */
  if(CRM.PLACED.includes(fase) && !c.vervangt && String(c.klant||'').trim()){
    const open = CRM.kandidaten().filter(x =>
      String(x.klant||'') === String(c.klant) && String(x.id) !== String(c.id)
      && owesReplacement(x) && !repOf(x));
    if(open.length && !(await vervangerVraag(c, open))) return;   /* Annuleren = niets doen */
  }

  /* Welke poortwachters gelden voor de doelfase? */
  const vraagKlant = CRM.faseIs(fase, 'Voorgesteld') && (!String(c.klant||'').trim() || !c.vacatureId);
  const vraagCall  = CRM.faseIs(fase, 'Intake') && !c.datum;
  const vraagDatum = GESPREK_FASES.includes(fase);
  const vraagVerw  = fase === 'In de wacht';
  const vraagLoon  = CONTRACT_FASES.includes(fase) && !c.maandloon;
  const vraagStart = CRM.PLACED.includes(fase);
  if(!vraagKlant && !vraagCall && !vraagDatum && !vraagVerw && !vraagLoon && !vraagStart) return bewaarFase(c, fase);

  /* "fee" is een financieel begrip en blijft bij wie geld mag zien; voor het
     team benoemen we waarom het veld nodig is zonder onze omzet erbij te halen. */
  const feeUitleg = CRM.canSeeMoney() ? 'de automatische fee-berekening' : 'de contract- en factuurgegevens';
  const uitleg = vraagKlant ? 'Aan wie stel je deze kandidaat voor? Zonder klant en vacature telt dit voorstel nergens mee.'
    : vraagStart ? `Startdatum en maandloon zijn verplicht — daar rekenen plaatsingen en ${feeUitleg} mee.`
    : vraagVerw ? 'Zet de verwachte startdatum erbij — dan rekent de forecast ermee.'
    : vraagLoon ? `Het bruto maandloon is nodig voor ${feeUitleg}.`
    : vraagCall ? 'Intake is de videocall-lijst: alleen kandidaten mét geplande call.'
    : 'Zet de afspraak erbij, dan weet iedereen waar de kandidaat aan toe is.';
  /* De openstaande vacatures, gegroepeerd per klant. Alleen openstaande:
     iemand voorstellen op een vacature die vervuld is levert een traject op
     dat nergens heen gaat. */
  const vacKeuze = () => {
    const vs = (CRM.state.vacs || []).filter(v => v && v.klant && (v.status || 'Open') !== 'Gesloten');
    const perKlant = {};
    vs.forEach(v => { (perKlant[v.klant] = perKlant[v.klant] || []).push(v); });
    return Object.keys(perKlant).sort((a,b)=>a.localeCompare(b,'nl')).map(k =>
      `<optgroup label="${h(k)}">${perKlant[k]
        .sort((a,b)=>String(a.functie||'').localeCompare(String(b.functie||''),'nl'))
        .map(v => `<option value="${h(v.id)}"${String(c.vacatureId)===String(v.id)?' selected':''}
           data-klant="${h(v.klant)}" data-functie="${h(v.functie||'')}">${h(v.functie||'(geen functie)')}</option>`)
        .join('')}</optgroup>`).join('');
  };
  /* Een plaatsing is de belangrijkste handeling in het systeem: hier hangen
     de omzet, het feestscherm en het hele nazorgritme aan. Dan hoort het
     venster ook te lezen als vastleggen ("Plaatsing van X bij Y vastleggen")
     en niet als verhuizen ("X → Contract getekend"). Zelfde poortwachters,
     andere vraag. */
  const kop = vraagKlant ? h(c.naam) + ' voorstellen'
    : vraagStart ? 'Plaatsing van ' + h(c.naam) + (c.klant ? ' bij ' + h(c.klant) : '') + ' vastleggen'
    : h(c.naam) + ' → ' + h(fase);
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${kop}</div>
      <p class="sub" style="margin:6px 0 0">${h(uitleg)}</p></div>
    <div class="modal-b">
      ${vraagKlant ? `<div class="f-row"><label for="fw_vac">Vacature</label>
          <select id="fw_vac"><option value="">— kies een openstaande vacature —</option>${vacKeuze()}</select>
          <div class="hint">De klant volgt uit de vacature. Staat de vacature er niet bij, maak hem dan eerst aan bij Vacatures.</div></div>` : ''}
      ${vraagDatum || vraagCall ? `<div class="f-grid">
          <div class="f-row"><label for="fw_datum">${vraagCall?'Datum videocall':'Datum afspraak'}</label>
            <input type="date" id="fw_datum" value="${h(c.datum||'')}"></div>
          <div class="f-row"><label for="fw_tijd">Tijd</label><input type="time" id="fw_tijd" value="${h(c.tijd||'10:00')}"></div>
        </div>` : ''}
      ${vraagVerw ? `<div class="f-row"><label for="fw_start">Verwachte startdatum</label>
          <input type="date" id="fw_start" value="${h(c.start||'')}"></div>` : ''}
      ${vraagStart ? `<div class="f-row"><label for="fw_start">Startdatum</label>
          <input type="date" id="fw_start" value="${h(c.start||'')}"></div>` : ''}
      ${vraagStart ? `<div class="f-row"><label for="fw_type">Soort plaatsing</label>
          <select id="fw_type">
            <option value="W&S"${(c.type||'W&S')==='W&S'?' selected':''}>W&amp;S — werving en selectie, fee ineens</option>
            <option value="Flex"${c.type==='Flex'?' selected':''}>Flex — de opbrengst loopt via gewerkte uren</option>
          </select>
          <div class="hint">Bepaalt of hier een fee bij hoort. Bij Flex rekent het systeem bewust geen fee — het maandloon
            is dan niet van toepassing, dat vul je straks op de kandidaatkaart aan met uurloon en uren.</div></div>` : ''}
      ${vraagLoon || vraagStart ? `<div class="f-row" id="fw_loonrij" style="${vraagStart && c.type==='Flex' ? 'display:none' : ''}">
          <label for="fw_loon">Bruto maandloon (€)</label>
          <input type="number" id="fw_loon" min="0" step="50" value="${c.maandloon?h(c.maandloon):''}"></div>` : ''}
      <div class="f-row"><label for="fw_actie">Volgende actie (optioneel)</label>
        <input type="text" id="fw_actie" value="${h(c.volgendeActie||'')}" placeholder="Bijv. bevestiging sturen"></div>
      <div class="note err" id="fw_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="fw_ok">${vraagStart ? 'Plaatsing vastleggen' : vraagKlant ? 'Voorstellen' : 'Opslaan'}</button></div>`, {onOpen(m){
      const val = id => { const e = m.querySelector('#fw_'+id); return e ? e.value : ''; };
      /* Flex rekent per uur (uurloon × factor × 1.560 uur), niet per
         maandloon — dat veld is bij Flex simpelweg niet van toepassing.
         De echte flex-gegevens (uurloon, uren, tarief) staan op de
         kandidaatkaart, niet in dit venster (Tjeerd, 26 aug 2026: "ik moet
         dan naar de kandidatenkaart doorverwezen worden"). */
      const typeSel = m.querySelector('#fw_type');
      const loonRij = m.querySelector('#fw_loonrij');
      if(typeSel) typeSel.onchange = () => {
        if(loonRij) loonRij.style.display = typeSel.value === 'Flex' ? 'none' : '';
      };
      m.querySelector('#fw_ok').onclick = async () => {
        const err = m.querySelector('#fw_err');
        const zeg = t => { err.style.display=''; err.textContent = t; };
        const isFlex = (val('type') || c.type) === 'Flex';
        const extra = {volgende_actie: val('actie').trim() || null};
        if(vraagKlant){
          const sel = m.querySelector('#fw_vac');
          const opt = sel && sel.selectedOptions[0];
          if(!sel || !sel.value || !opt) return zeg('Kies de vacature waarop je deze kandidaat voorstelt.');
          /* Klant en functie komen uit de vacature, niet uit een los veld:
             twee plekken waar hetzelfde in kan staan lopen een keer uit
             elkaar, en dan telt dezelfde persoon bij de ene klant wel en bij
             de andere niet mee. */
          extra.vacature_id = sel.value;
          extra.klant       = opt.dataset.klant || '';
          if(opt.dataset.functie && !String(c.functie||'').trim()) extra.functie = opt.dataset.functie;
        }
        if(vraagDatum || vraagCall){
          if(!val('datum')) return zeg(vraagCall ? 'Plan eerst de videocall — zonder datum geen Intake.' : 'Zonder datum weten we niet wanneer het gesprek is.');
          extra.datum = val('datum'); extra.tijd = val('tijd') || '';
        }
        if(vraagVerw){
          if(!val('start')) return zeg('De verwachte startdatum is hier verplicht — de forecast rekent ermee.');
          extra.start = val('start');
        }
        if(vraagStart){
          if(!val('start')) return zeg('Een startdatum is verplicht bij een getekend contract.');
          extra.start = val('start');
          /* Type hoort bij de plaatsing zelf. Zonder dit veld stond er op elke
             geplaatste kaart een amber "type?" en wist de facturatie niet of
             er een fee bij hoorde — terwijl dit precies het moment is waarop
             je het weet. */
          if(val('type')) extra.type = val('type');
        }
        if((vraagLoon || vraagStart) && !isFlex){
          if(!val('loon')) return zeg('Vul het bruto maandloon in — nodig voor ' + feeUitleg + '.');
          extra.maandloon = +val('loon');
        }
        let doel = fase;
        if(fase === 'Contract getekend' && extra.start && extra.start <= CRM.todayISO()) doel = 'Gestart';
        CRM.modal.close();
        await bewaarFase(c, doel, extra);
        /* Bij Flex is de plaatsing nu vastgelegd, maar de gegevens waar de
           marge op rekent (uurloon, uren, tarief) staan nog niet ingevuld —
           dat kan alleen op de kandidaatkaart. Direct doorsturen scheelt
           zelf op zoek moeten naar waar dat veld staat. */
        if(vraagStart && isFlex){
          CRM.toast(`${c.naam} vastgelegd — vul nu uurloon en uren aan`, 'ok');
          /* Niet meteen navigeren: CRM.modal.close() hierboven zette al een
             history.back() in gang (overlayStapEraf, js/core.js) om de
             geschiedenisstap van het venster op te ruimen. Die is async —
             navigeer je meteen, dan komt die back() soms ná onze eigen
             pushState terecht en veert de app terug naar het bord
             (gezien tijdens testen: CRM.ga('recruitment') vuurde ~80ms
             later vanzelf via de hashchange-listener). Een korte
             vertraging laat 'm eerst afronden. */
          setTimeout(() => CRM.ga('kandidaten', {id:c.id}), 200);
        }
      };
    }});
}
/* ═══════════════════════════════════════════════════════════════
   UITVAL — formulier, tabblad, heraanbieden, vervanging
   ═══════════════════════════════════════════════════════════════ */
/* Uitvalformulier — zelfde structuur als het bord (openUitvalForm):
   soort/door als keuze, reden per categorie, datums bij een stop,
   bemiddelbaar/beschikbaar-per. edit=true werkt gegevens achteraf bij. */
function uitvalForm(c, doel){
  const edit = c.fase === doel;
  const afgevallen = doel === 'Afgevallen';
  const sug = afgevallen ? afvalTypeVan(c) : null;
  const curType = c.afvalType || sug || 'niet_gekwalificeerd';
  const curDoor = c.stopDoor || 'kandidaat';
  const opts = (arr, sel) => arr.map(x => `<option ${x===sel?'selected':''}>${h(x)}</option>`).join('');
  const radio = (naam, val, cur, lbl, sub) => `
    <label class="rc-opt ${cur===val?'sel':''}"><input type="radio" name="${naam}" value="${h(val)}" ${cur===val?'checked':''}>
      <span><b>${h(lbl)}</b>${sub?`<small>${h(sub)}</small>`:''}</span></label>`;
  /* Zonder bruikbare historie is er geen "verst gekomen" — dan viel de kaart
     terug op de huidige fase en stond er letterlijk "verst gekomen: Afgevallen".
     Liever niets tonen dan iets onzinnigs. */
  const verst = CRM.PHASES[furthestPhaseIdx(c)]?.k || '';
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${edit?'Uitvalgegevens bijwerken':h(c.naam)+' → '+h(doel)}</div>
      <p class="sub" style="margin:6px 0 0">${h(c.klant||'—')} · ${h(c.functie||'—')}${afgevallen&&verst?` · verst gekomen: <b>${h(verst)}</b>`:''}</p></div>
    <div class="modal-b">
      ${afgevallen ? `
        <div class="f-row"><label>Soort afvaller</label>
          <div class="rc-radio">
            ${radio('uv_type','niet_gekwalificeerd',curType,'Niet gekwalificeerd','viel af in O&O / gesprekken / meeloopdag')}
            ${radio('uv_type','offer_afgewezen',curType,'Offer afgewezen','was gekwalificeerd, accepteerde het aanbod niet')}
          </div></div>
        <div class="f-row"><label for="uv_cat">Reden</label><select id="uv_cat">${opts(CRM.AFVAL_CATS[curType], c.afvalCat)}</select></div>`
      : `
        <div class="f-row"><label>Gestopt door</label>
          <div class="rc-radio">
            ${radio('uv_door','kandidaat',curDoor,'Kandidaat zelf','zegde zelf op / vertrok')}
            ${radio('uv_door','klant',curDoor,'Klant','beëindigde het contract')}
            ${radio('uv_door','anders',curDoor,'Anders','')}
          </div></div>
        <div class="f-row"><label for="uv_cat">Reden</label><select id="uv_cat">${opts(CRM.STOP_CATS[curDoor], c.stopCat)}</select></div>
        <div class="f-grid">
          <div class="f-row"><label for="uv_datum">Gestopt op</label>
            <input type="date" id="uv_datum" value="${h(c.gestoptOp||CRM.todayISO())}">
            <span class="hint">De maand bepaalt bij welke maand de stop aftelt.</span></div>
          <div class="f-row"><label for="uv_plaats">Plaatsingsdatum</label>
            <input type="date" id="uv_plaats" value="${h(c.geplaatstOp||c.start||'')}">
            <span class="hint">Datum van tekenen — nodig om als stopper te tellen.</span></div>
        </div>`}
      <div class="f-row"><label for="uv_txt">Toelichting (optioneel)</label>
        <input type="text" id="uv_txt" value="${h(c.reden||'')}" placeholder="Korte toelichting — daar leren we van"></div>
      <label class="check"><input type="checkbox" id="uv_bemid" ${c.bemiddelbaar!==false?'checked':''}>
        Blijft bemiddelbaar — komt in de <b>Talentpool</b> voor een andere klant of vacature</label>
      <div class="f-row" id="uv_perwrap" style="${c.bemiddelbaar===false?'display:none':''}">
        <label for="uv_per">Beschikbaar per (optioneel, leeg = nu)</label>
        <input type="date" id="uv_per" value="${h(c.beschikbaarPer||'')}"></div>
      <p class="hint" style="margin:2px 0 8px">Niet gekwalificeerd, een mismatch of salaris — dat is geen oordeel over
        bruikbaarheid voor een andere vacature. Zet dit alleen uit als iemand écht niet meer bemiddeld wil worden.</p>
      <div class="note err" id="uv_err" style="display:none;margin-top:10px"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="uv_ok">${edit?'Bijwerken':afgevallen?'Afmelden':'Stop vastleggen'}</button></div>`, {onOpen(m){
      CRM.dictee?.hang(m.querySelector('#uv_txt'));
      const cat = m.querySelector('#uv_cat');
      const sync = () => {
        if(afgevallen){
          const t = m.querySelector('input[name=uv_type]:checked').value;
          cat.innerHTML = opts(CRM.AFVAL_CATS[t], null);
        } else {
          const d = m.querySelector('input[name=uv_door]:checked').value;
          cat.innerHTML = opts(CRM.STOP_CATS[d], null);
        }
        CRM.$$('.rc-opt', m).forEach(o => o.classList.toggle('sel', o.querySelector('input').checked));
      };
      CRM.$$('.rc-radio input', m).forEach(r => r.onchange = sync);
      const bemidBox = m.querySelector('#uv_bemid');
      bemidBox.onchange = () => { m.querySelector('#uv_perwrap').style.display = bemidBox.checked ? '' : 'none'; };
      m.querySelector('#uv_ok').onclick = async () => {
        const d = {cat:cat.value, txt:m.querySelector('#uv_txt').value.trim(),
          bemid:bemidBox.checked, per:m.querySelector('#uv_per').value};
        if(!d.cat){ const e = m.querySelector('#uv_err'); e.style.display=''; e.textContent='Kies een reden.'; return; }
        if(afgevallen) d.type = m.querySelector('input[name=uv_type]:checked').value;
        else {
          d.door = m.querySelector('input[name=uv_door]:checked').value;
          d.datum = m.querySelector('#uv_datum').value || CRM.todayISO();
          d.plaats = m.querySelector('#uv_plaats').value;
        }
        CRM.modal.close();
        if(!afgevallen && !d.plaats){
          const toch = await CRM.bevestig('Geen plaatsingsdatum ingevuld',
            'Dan telt deze stop niet mee bij "gestopt deze maand". Toch doorgaan?');
          if(!toch) return uitvalForm(c, doel);
        }
        await pasUitvalToe(c, doel, d, edit);
      };
    }});
}

async function pasUitvalToe(c, doel, d, edit){
  const vandaag = CRM.todayISO();
  const patch = {};
  if(!edit){
    patch.fase = doel; patch.since = vandaag;
    patch.historie = (c.historie||[]).concat([{fase:doel, op:vandaag}]);
    if(doel === 'Afgevallen') patch.geplaatst_op = '';         // geen spookplaatsing
    if(c.ooId) patch.oo_id = null;
  }
  if(doel === 'Afgevallen'){
    patch.afval_type = d.type; patch.afval_categorie = d.cat;
    patch.stop_door = ''; patch.stop_categorie = '';
    /* Een afvaller heeft per definitie geen stopdatum: hij is nooit geplaatst.
       Bleef die staan (bijwerken van een oude kaart, of import), dan telde de
       kaart in twee werelden mee. Ook bij bijwerken wissen we hem dus. */
    patch.gestopt_op = '';
  } else {
    patch.stop_door = d.door; patch.stop_categorie = d.cat;
    patch.gestopt_op = d.datum || c.gestoptOp || vandaag;
    if(d.plaats) patch.geplaatst_op = d.plaats;
    patch.afval_type = ''; patch.afval_categorie = '';
  }
  patch.reden = d.txt || '';
  patch.bemiddelbaar = !!d.bemid;
  patch.beschikbaar_per = d.bemid ? (d.per || null) : null;
  const ok = await bewaarKand(c.id, patch);
  if(!ok) return;
  await CRM.logActiviteit('kandidaat', c.id, edit ? 'notitie' : 'fase',
    `${edit ? 'Uitvalgegevens bijgewerkt' : c.fase + ' → ' + doel}: ${d.cat}${d.txt ? ' — ' + d.txt : ''}`);
  if(d.txt) CRM.verwerkTags(d.txt, 'kandidaat', c.id);
  CRM.toast(`${c.naam} — ${doel === 'Afgevallen' ? AFVAL_LBL[d.type||afvalTypeVan(c)] : 'gestopt (' + STOP_LBL[d.door] + ')'}`, 'ok');
  alles();
}

/* ─── Tabblad Uitval (openUitval van het bord) ────────────────── */
function tekenUitval(el){
  const K = CRM.kandidaten();
  const afg = K.filter(c => c.fase === 'Afgevallen');
  const stp = K.filter(c => c.fase === 'Gestopt');
  const nk = afg.filter(c => afvalTypeVan(c) === 'niet_gekwalificeerd');
  const oa = afg.filter(c => afvalTypeVan(c) === 'offer_afgewezen');
  /* repOf/herstartOf lopen elk zelf door álle kandidaten. Per rij twee keer
     aanroepen liep bij 350 kandidaten op tot tienduizenden vergelijkingen —
     daarom één keer indexeren. */
  const vervangerVan = {}, herstartVanaf = {};
  K.forEach(x => {
    if(x.vervangt)    vervangerVan[String(x.vervangt)]    = x;
    if(x.herstartVan) herstartVanaf[String(x.herstartVan)] = x;
  });
  /* Offer-acceptatie: iedereen die ooit 'In de wacht' of verder kwam, óf als
     offer-afwijzer is gemarkeerd. Vervangers tellen niet mee (geen dubbeling).
     Een lege fase (import uit het oude ATS) is géén positie in de funnel: die
     kandidaten hebben nooit een aanbod gehad en mogen dit percentage dus niet
     kleuren — ook niet als er per ongeluk een geplaatst-datum op staat. */
  const offerIdx = CRM.faseIdx('In de wacht');
  const offers = K.filter(c => c.fase && (furthestPhaseIdx(c) >= offerIdx || c.afvalType === 'offer_afgewezen') && !c.vervangt);
  const geacc = offers.filter(c => c.geplaatstOp || CRM.PLACED.includes(c.fase)).length;
  const accPct = offers.length ? Math.round(geacc / offers.length * 100) : null;
  const stopDuur = b => stp.filter(c => {
    const ref = c.start || c.geplaatstOp;
    if(!ref || !c.gestoptOp) return false;
    const dgn = Math.round((new Date(c.gestoptOp) - new Date(ref)) / 864e5);
    return b === '30' ? dgn <= 30 : b === '90' ? dgn > 30 && dgn <= 90 : dgn > 90;
  }).length;
  const topRedenen = (arr, fn) => {
    const per = {};
    arr.forEach(c => { const r = fn(c) || '—'; per[r] = (per[r]||0) + 1; });
    return Object.entries(per).sort((a,b) => b[1]-a[1]).slice(0,3).map(([r,n]) => `${h(r)} (${n})`).join(' · ') || '—';
  };
  /* Datum van uitval: bij een stop de stopdatum, bij een afvaller de dag dat de
     kaart op Afgevallen kwam (since). Een afvaller met een stopdatum is een fout in de
     data — die datum mag hier niet de sortering of de kolom sturen. */
  const uitvalDatum = c => (c.fase === 'Gestopt' ? (c.gestoptOp || c.since) : c.since) || '';
  const scheef = c => c.fase === 'Afgevallen' && !!c.gestoptOp;
  const f = S.u.f;
  const lijst = (f==='nk' ? nk : f==='oa' ? oa : f==='stop' ? stp : afg.concat(stp)).slice()
    .sort((a,b) => String(uitvalDatum(b)).localeCompare(String(uitvalDatum(a))));
  const nScheef = afg.filter(scheef).length;
  const tabs = [['alles',`Alles (${afg.length+stp.length})`],['nk',`Niet gekwalificeerd (${nk.length})`],
                ['oa',`Offer afgewezen (${oa.length})`],['stop',`Gestopt (${stp.length})`]];

  const rij = c => {
    const isStop = c.fase === 'Gestopt';
    const herstart = herstartVanaf[String(c.id)];
    const rep = isStop ? vervangerVan[String(c.id)] : null;
    const lbl = isStop
      ? `Gestopt ${STOP_LBL[c.stopDoor]||'—'}${c.stopCat?' · '+h(c.stopCat):''}`
      : `${AFVAL_LBL[afvalTypeVan(c)]}${c.afvalCat?' · '+h(c.afvalCat):''}${c.afvalType?'':' <span class="chip" title="Automatisch bepaald uit de fase-historie">auto</span>'}`;
    const verv = isStop ? (rep
        ? (CRM.PLACED.includes(rep.fase)
            ? `<span class="chip green">vervangen door ${h(rep.naam)}</span>`
            : `<span class="chip amber">vervanger: ${h(rep.naam)} · ${h(rep.fase)}</span>`)
        : owesReplacement(c)
            ? `<span class="chip red">vervanging nodig</span> <button class="btn ghost sm" data-rep="${h(c.id)}">+ Vervanger</button>`
            : `<span class="meta">buiten garantie</span>`)
      : (c.vervangt ? '<span class="meta">was zelf vervanger</span>' : '');
    /* De streep draagt hier "verst gekomen" — dezelfde fasekleur als overal,
       maar dan van de fase die deze persoon gehaald hééft. Dat is wat je op
       dit scherm zoekt: wie vlak voor de streep afviel is je beste pool om
       opnieuw aan te bieden, en die stond tussen tweehonderd rijen precies
       even opvallend als iemand die bij het eerste gesprek al afhaakte.
       Géén rood voor de uitval zelf: iedereen op dit scherm is uitgevallen,
       dus een rode rand zou niets onderscheiden. */
    const verst = CRM.PHASES[furthestPhaseIdx(c)];
    return `<tr${CRM.ui.frand(verst ? verst.c : '')}>
      <td><b>${h(c.naam)}</b><div class="rowsub">${h(c.klant||'—')} · ${h(c.functie||'—')}</div></td>
      <td>${lbl}${c.reden?`<div class="rowsub">"${h(c.reden)}"</div>`:''}
        ${scheef(c)?`<div><span class="chip amber" title="Deze kaart staat op Afgevallen maar heeft nog een stopdatum (${h(CRM.fmtDate(c.gestoptOp))}). Een afvaller is nooit geplaatst geweest — werk hem bij, dan wordt de datum gewist.">stopdatum op een afvaller</span></div>`:''}
        ${herstart?`<div><span class="chip purple" title="Nieuw traject loopt op een nieuwe kaart — deze uitkomst blijft meetellen">heraangeboden bij ${h(herstart.klant)}</span></div>`:''}</td>
      <td>${h(CRM.PHASES[furthestPhaseIdx(c)]?.k||'—')}</td>
      <td class="n"><span class="num">${h(CRM.fmtDateShort(uitvalDatum(c))||'—')}</span></td>
      <td>${verv}</td>
      <td class="n" style="white-space:nowrap">
        <button class="chip btn-like ${c.bemiddelbaar!==false?'on':''}" data-uvrec="${h(c.id)}" title="Bemiddelbaar aan/uit">${c.bemiddelbaar!==false?'beschikbaar ✓':'niet bemiddelen'}</button>
        ${c.bemiddelbaar!==false && !herstart ? `<button class="btn sm" data-react="${h(c.id)}">Opnieuw aanbieden</button>` : ''}
        <button class="btn ghost sm" data-uvedit="${h(c.id)}" title="Soort en reden achteraf bijwerken">Bijwerken</button>
        <button class="btn ghost sm" data-uvkaart="${h(c.id)}" title="Volledige kaart: fase en datums corrigeren">Corrigeren</button>
      </td></tr>`;
  };

  el.innerHTML = `<div class="rc-pad">
    <div class="grid c4" style="margin-bottom:14px">
      ${CRM.ui.kpi('Totaal uitval', afg.length+stp.length, `${nk.length} niet gekwalificeerd · ${oa.length} offer afgewezen`)}
      ${CRM.ui.kpi('Offer-acceptatie', accPct==null?'—':accPct+'%', `${geacc} van ${offers.length} kwamen tot een aanbod`, accPct!=null&&accPct<60?'':'')}
      ${CRM.ui.kpi('Gestopt na plaatsing', stp.length, `≤30 dgn: ${stopDuur('30')} · 31–90: ${stopDuur('90')} · >90: ${stopDuur('+')}`)}
      ${CRM.ui.kpi('Beschikbare pool', afg.concat(stp).filter(c=>c.bemiddelbaar!==false).length, 'kandidaten om her aan te bieden')}
    </div>
    <div class="note info" style="margin-bottom:14px">Top-redenen — niet gekwalificeerd: <b>${topRedenen(nk, c=>c.afvalCat)}</b> ·
      offer afgewezen: <b>${topRedenen(oa, c=>c.afvalCat)}</b> · gestopt: <b>${topRedenen(stp, c=>c.stopCat)}</b>.
      Offer-afwijzers zijn volledig gekwalificeerd — je beste pool voor heraanbieden.</div>
    ${nScheef ? `<div class="note warn" style="margin-bottom:14px">${nScheef} ${nScheef===1?'kaart staat':'kaarten staan'} op <b>Afgevallen</b>
      maar ${nScheef===1?'heeft':'hebben'} nog een stopdatum. Dat kan niet allebei: een afvaller is nooit geplaatst geweest.
      Klik bij zo'n rij op <b>Bijwerken</b> en sla op — dan wordt de stopdatum gewist.</div>` : ''}
    <div class="rc-chips">${tabs.map(([k,l]) => `<button class="chip btn-like ${f===k?'on':''}" data-uvtab="${k}">${l}</button>`).join('')}</div>
    <div class="tblwrap"><table class="tbl">
      <thead><tr><th>Kandidaat</th><th>Uitval</th><th>Verst gekomen</th><th class="n">Datum</th><th>Vervanging</th><th class="n">Acties</th></tr></thead>
      <tbody>${lijst.slice(0,200).map(rij).join('') || `<tr><td colspan="6"><span class="meta">Niets in deze categorie.</span></td></tr>`}</tbody>
    </table></div>
    ${lijst.length > 200 ? `<p class="meta" style="margin:10px 2px">De 200 meest recente van ${lijst.length} worden getoond.</p>` : ''}
    <p class="meta" style="margin:10px 2px">Heraanbieden maakt altijd een <b>nieuwe kaart</b> in Intake; de oude blijft als
      afvaller of stopper geregistreerd — die uitkomst blijft in alle cijfers en in de finance-app meetellen.</p>
  </div>`;

  CRM.$$('[data-uvtab]', el).forEach(b => b.onclick = () => { S.u.f = b.dataset.uvtab; tekenUitval(el); });
  CRM.$$('[data-uvrec]', el).forEach(b => b.onclick = async () => {
    const c = CRM.kandidaat(b.dataset.uvrec); if(!c) return;
    await bewaarKand(c.id, {bemiddelbaar: c.bemiddelbaar === false});
    tekenUitval(el);
  });
  CRM.$$('[data-react]', el).forEach(b => b.onclick = () => heractiveren(b.dataset.react));
  CRM.$$('[data-uvedit]', el).forEach(b => b.onclick = () => { const c = CRM.kandidaat(b.dataset.uvedit); if(c) uitvalForm(c, c.fase); });
  CRM.$$('[data-uvkaart]', el).forEach(b => b.onclick = () => CRM.ga('kandidaten',{id:b.dataset.uvkaart}));
  CRM.$$('[data-rep]', el).forEach(b => b.onclick = () => {
    const s = CRM.kandidaat(b.dataset.rep); if(!s) return;
    nieuweKandidaatModal({klant:s.klant, functie:s.functie, type:s.type, vervangt:s.id, vervangtNaam:s.naam});
  });
}

/* ─── Heraanbieden (openReactivate): NIEUWE kaart, oude blijft ── */
function heractiveren(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const bestaand = herstartOf(c);
  if(bestaand) return CRM.toast(`${c.naam} is al heraangeboden bij ${bestaand.klant}`, 'err');
  const klanten = Array.from(new Set(
    (CRM.state.clients||[]).map(x=>x.naam).concat((CRM.state.vacs||[]).map(v=>v.klant)).filter(Boolean))).sort();
  const vacsVan = k => (CRM.state.vacs||[]).filter(v => v.klant === k);
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Opnieuw aanbieden</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)} — eerder: ${h(c.klant||'—')} · ${h(c.functie||'—')}${c.reden?' ('+h(c.reden)+')':''}</p></div>
    <div class="modal-b">
      <div class="note info">Er komt een <b>nieuwe kaart</b> in Intake. De oude kaart blijft onaangeroerd op
        ${h(c.fase)} staan — die uitkomst blijft in alle cijfers en in de finance-app meetellen.</div>
      <div class="f-grid" style="margin-top:14px">
        <div class="f-row"><label for="ra_klant">Klant</label>
          <select id="ra_klant">${klanten.map(k=>`<option ${k===c.klant?'selected':''}>${h(k)}</option>`).join('')}</select></div>
        <div class="f-row"><label for="ra_func">Vacature</label><select id="ra_func"></select></div>
      </div>
      <div class="note err" id="ra_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ra_ok">Nieuwe kaart aanmaken</button></div>`, {onOpen(m){
      const kSel = m.querySelector('#ra_klant'), fSel = m.querySelector('#ra_func');
      const vul = () => {
        const fs = vacsVan(kSel.value);
        fSel.innerHTML = fs.length
          ? fs.map(v=>`<option value="${h(v.id)}" ${v.functie===c.functie?'selected':''}>${h(v.functie)}</option>`).join('')
          : '<option value="">— geen vacature bij deze klant —</option>';
      };
      kSel.onchange = vul; vul();
      m.querySelector('#ra_ok').onclick = async () => {
        const v = vacById(fSel.value);
        if(!v){ const e = m.querySelector('#ra_err'); e.style.display=''; e.textContent='Kies een vacature — zonder vacature geen traject.'; return; }
        const vandaag = CRM.todayISO(), nu = new Date().toISOString();
        const nieuw = {
          id:CRM.uid(), naam:c.naam, klant:v.klant, functie:v.functie, type:v.type||'',
          fase:'Klaar om voor te stellen', datum:'', tijd:'', start:'', since:vandaag, bron:c.bron||'',
          geplaatstOp:'', gestoptOp:'', garantieMnd:0,
          maandloon:c.maandloon, toeslagPct:c.toeslagPct, vtPct:c.vtPct, ejuPct:c.ejuPct, overigPct:c.overigPct,
          reden:'', rec:c.rec || CRM.me(), note:'', ooId:null, vervangt:'', volgendeActie:'', actieDatum:null, noShows:0,
          telefoon:c.telefoon, email:c.email, woonplaats:c.woonplaats, vacatureId:v.id, cv:c.cv||null,
          ster:c.ster, beschikbaar:c.beschikbaar, ploegen:c.ploegen, talen:c.talen, rijbewijs:c.rijbewijs, vervoer:c.vervoer,
          notities:[{op:nu, door:CRM.me(), tekst:`Heraangeboden vanuit ${c.klant||'—'} (${c.fase==='Gestopt'?'gestopt':'afgevallen'}${c.reden?': '+c.reden:''})`}],
          historie:[{fase:'Klaar om voor te stellen', op:vandaag}],
          intake:c.intake||null, herstartVan:c.id,
          afvalType:'', afvalCat:'', stopDoor:'', stopCat:'', bemiddelbaar:true, beschikbaarPer:''
        };
        const rijNieuw = CRM.candToRow(nieuw);
        CRM.state.cands.unshift(rijNieuw);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('candidates').insert(rijNieuw);
          if(error){ CRM.state.cands.shift(); return CRM.fout('Opslaan mislukt', error); }
        }
        /* Alleen een notitie op de oude kaart — fase, datums en uitkomst blijven staan. */
        await bewaarKand(c.id, {notities:(c.notities||[]).concat([{op:nu, door:CRM.me(),
          tekst:`Heraangeboden bij ${v.klant} — nieuw traject op een nieuwe kaart; deze kaart blijft als ${c.fase==='Gestopt'?'stopper':'afvaller'} geregistreerd`}])});
        await CRM.logActiviteit('kandidaat', nieuw.id, 'systeem', `Nieuwe kaart via heraanbieden — eerder ${c.fase.toLowerCase()} bij ${c.klant||'—'}`);
        await CRM.logActiviteit('kandidaat', c.id, 'systeem', `Heraangeboden bij ${v.klant} (nieuwe kaart, oude uitkomst blijft staan)`);
        CRM.modal.close();
        alles(); tekenActies();
        /* De nieuwe kaart staat op het bord (kolom Intake), dus wijs daarheen. */
        toastLink(`${c.naam} — nieuwe kaart in Intake bij ${v.klant}; oude blijft als ${c.fase==='Gestopt'?'stopper':'afvaller'} tellen`,
          'Naar de pijplijn →', () => CRM.ga('pijplijn'));
      };
    }});
}

/* ─── Nieuwe kandidaat / vervanger (poortwachter: call + bron) ── */
function nieuweKandidaatModal(prefill){
  prefill = prefill || {};
  const vacs = (CRM.state.vacs||[]).slice().sort((a,b)=>vacLabel(a).localeCompare(vacLabel(b)));
  const voorVac = prefill.klant ? vacs.find(v => v.klant===prefill.klant && v.functie===prefill.functie) : null;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${prefill.vervangt?'Vervanger aanmaken':'Nieuwe kandidaat'}</div>
      <p class="sub" style="margin:6px 0 0">${prefill.vervangt
        ? `Vervanger voor ${h(prefill.vervangtNaam||'')} — telt niet dubbel in het target.`
        : 'Komt op Intake te staan: klaar om voor te stellen, maar nog niet bij een klant. Zodra je die bij een klant voorstelt verschijnt de kaart op Klanttrajecten.'}</p></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label for="nk_naam">Naam</label><input type="text" id="nk_naam"></div>
        <div class="f-row"><label for="nk_tel">Telefoon</label><input type="tel" id="nk_tel"></div>
        <div class="f-row"><label for="nk_plaats">Woonplaats</label><input type="text" id="nk_plaats"></div>
        <div class="f-row"><label for="nk_bron">Bron</label>
          <select id="nk_bron"><option value="">— kies —</option>${KAND_BRONNEN.map(b=>`<option>${h(b)}</option>`).join('')}</select></div>
      </div>
      <div class="f-row"><label for="nk_vac">Vacature</label>
        <select id="nk_vac"><option value="">— kies de vacature —</option>
          ${vacs.map(v=>`<option value="${h(v.id)}" ${voorVac&&String(voorVac.id)===String(v.id)?'selected':''}>${h(vacLabel(v))}</option>`).join('')}</select></div>
      <div class="f-grid">
        <div class="f-row"><label for="nk_datum">Datum videocall</label><input type="date" id="nk_datum"></div>
        <div class="f-row"><label for="nk_tijd">Tijd</label><input type="time" id="nk_tijd" value="10:00"></div>
        <div class="f-row"><label for="nk_rec">Recruiter</label><input type="text" id="nk_rec" value="${h(CRM.me())}"></div>
      </div>
      <div class="note err" id="nk_err" style="display:none"></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="nk_ok">Toevoegen</button></div>`, {onOpen(m){
      m.querySelector('#nk_ok').onclick = async () => {
        const g = id => m.querySelector('#nk_'+id).value.trim();
        const err = m.querySelector('#nk_err');
        const zeg = t => { err.style.display=''; err.textContent = t; };
        if(!g('naam')) return zeg('Een naam is het minimum.');
        if(!g('bron')) return zeg('Vul de bron in — nodig voor kanaal-inzicht.');
        const v = vacById(m.querySelector('#nk_vac').value);
        if(!v) return zeg('Kies de vacature.');
        if(!g('datum')) return zeg('Plan eerst de videocall — alleen kandidaten mét call komen in Intake.');
        const vandaag = CRM.todayISO();
        const cand = {
          id:CRM.uid(), naam:g('naam'), telefoon:g('tel'), woonplaats:g('plaats'),
          functie:v.functie, klant:v.klant, type:prefill.type || v.type || 'W&S',
          bron:g('bron'), fase:'Klaar om voor te stellen', datum:g('datum'), tijd:g('tijd')||'',
          since:vandaag, rec:g('rec') || CRM.me(), vacatureId:v.id,
          vervangt:prefill.vervangt || '', historie:[{fase:'Klaar om voor te stellen', op:vandaag}],
          notities: prefill.vervangt ? [{op:new Date().toISOString(), door:CRM.me(),
            tekst:`Aangemaakt als vervanger voor ${prefill.vervangtNaam||prefill.vervangt}`}] : []
        };
        const rijC = CRM.candToRow(cand);
        CRM.state.cands.unshift(rijC);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('candidates').insert(rijC);
          if(error){ CRM.state.cands.shift(); return zeg('Opslaan mislukt: ' + error.message); }
        }
        await CRM.logActiviteit('kandidaat', cand.id, 'systeem',
          prefill.vervangt ? `Aangemaakt als vervanger voor ${prefill.vervangtNaam||''}` : `Handmatig toegevoegd — videocall ${CRM.fmtDate(cand.datum)} ${cand.tijd}`);
        CRM.modal.close();
        /* Meteen naar de volledige kandidatenkaart (wens Tjeerd, 31 jul 2026).
           Er stond hier een toast met een link, maar die verdwijnt na ruim drie
           seconden — miste je hem, dan moest je de kandidaat opnieuw opzoeken.
           Juist na het inlezen van een CV wil de AM zien of alles goed staat
           vóór de volgende stap, dus dat mag geen klik zijn die je kunt missen. */
        CRM.toast(`${cand.naam} staat in Intake — controleer de gegevens`, 'ok');
        CRM.ga('kandidaten', {id:cand.id});
        /* Al verder in het proces bij het aanmaken (bv. videocall én eerste
           gesprek al gehad)? Dan hoeft dat niet apart via de kandidaatkaart:
           de fase-picker (dezelfde poortwachters als "Fase wijzigen…") staat
           meteen open. Niets kiezen = gewoon op Intake laten staan (naam:
           Tjeerd, 10 aug 2026). */
        if(CRM.kandidaatFasePicker) CRM.kandidaatFasePicker(cand.id);
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   BEWERK-DRAWER — volledige kaartbewerking (pariteit met openEdit)
   Fase, afspraak, contractgegevens, salaris-componenten met live
   totaal-jaarsalaris, vervanging, no-show en notities.
   ═══════════════════════════════════════════════════════════════ */
function snelBewerk(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const v = vacById(c.vacatureId);
  const kanIntake = CRM.faseIn(c.fase, ['Intake','Voorgesteld']);
  const toonDatums = CRM.PLACED.includes(c.fase) || UITVAL.includes(c.fase) || !!c.geplaatstOp || !!c.gestoptOp;
  const sess = c.ooId ? ooSessie(c.ooId) : null;
  const gestopten = CRM.kandidaten().filter(x => x.fase === 'Gestopt' && x.id !== c.id);
  const bronnen = Array.from(new Set(KAND_BRONNEN.concat(c.bron ? [c.bron] : []).filter(Boolean)));
  const tijdlijn = (c.notities||[]).map(n => ({titel:n.door||'Notitie', wanneer:CRM.fmtDate(n.op||n.t), tekst:n.tekst}))
    .concat(CRM.activiteitenVoor('kandidaat', c.id).map(a => ({
      titel:a.door||'Systeem', wanneer:CRM.fmtDate(a.op), tekst:a.tekst})));

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="flex:1;min-width:0">
        <div class="h2">${h(c.naam)}</div>
        <div class="sub">${h(c.functie||'—')}${c.klant?' @ '+h(c.klant):''}${c.woonplaats?' · '+h(c.woonplaats):''}</div>
        <div class="row tight" style="margin-top:8px">
          <span class="chip"><i class="dot" style="background:${c.fase?CRM.faseKleur(c.fase):'var(--line-2)'}"></i>${h(CRM.faseNorm(c.fase) || 'geen fase')}</span>
          ${c.rec?`<span class="chip">${h(c.rec)}</span>`:''}
          ${c.herstartVan?`<span class="chip purple" title="Heraangeboden — eerdere uitkomst staat op de oude kaart">herstart</span>`:''}
          ${c.vervangt?`<span class="chip blue">vervanger</span>`:''}
          ${sess?`<span class="chip">O&amp;O ${h(CRM.fmtDateShort(sess.datum))} · ${h(sess.klant)}</span>`:''}
          ${c.intake && c.intake.cijfer!=null?`<span class="chip ${c.intake.cijfer<7?'amber':'green'} num">Intake ${h(c.intake.cijfer)}/10</span>`:''}
          ${c.noShows?`<span class="chip red num">${h(c.noShows)}× no-show</span>`:''}
        </div>
      </div>
      <button class="btn sub x" data-close>✕</button>
    </div>
    <div class="drawer-b">
      <div class="card"><div class="card-h"><div class="h2">Traject</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="sb_fase">Fase</label>
              <select id="sb_fase">${
                /* Zonder fase (import uit het oude ATS) hoort er ook een lege
                   keuze te staan. Anders kiest de browser stilzwijgend de
                   eerste optie en zou opslaan de kandidaat zomaar de pijplijn
                   in duwen — of het formulier onbruikbaar blokkeren. */
                c.fase ? '' : `<option value="" selected>— nog geen fase —</option>`
              }${CRM.PHASES.map(p=>`<option ${CRM.faseIs(c.fase,p.k)?'selected':''}>${h(p.k)}</option>`).join('')}</select>
              ${c.fase ? '' : `<span class="hint">Deze kandidaat komt uit het oude ATS en staat nergens op het bord. Kies een fase zodra je het traject start.</span>`}</div>
            <div class="f-row"><label for="sb_type">Type</label>
              <select id="sb_type"><option value="">—</option>
                <option ${c.type==='W&S'?'selected':''}>W&amp;S</option><option ${c.type==='Flex'?'selected':''}>Flex</option></select></div>
            <div class="f-row"><label for="sb_bron">Bron</label>
              <select id="sb_bron"><option value="">— kies —</option>
                ${bronnen.map(b=>`<option ${c.bron===b?'selected':''}>${h(b)}</option>`).join('')}</select></div>
            <div class="f-row"><label for="sb_rec">Recruiter</label><input type="text" id="sb_rec" value="${h(c.rec||'')}"></div>
            <div class="f-row"><label for="sb_datum">Afspraakdatum</label><input type="date" id="sb_datum" value="${h(c.datum||'')}"></div>
            <div class="f-row"><label for="sb_tijd">Tijd</label><input type="time" id="sb_tijd" value="${h(c.tijd||'')}"></div>
            <div class="f-row"><label for="sb_actiedat">Actiedatum</label><input type="date" id="sb_actiedat" value="${h(c.actieDatum||'')}"></div>
          </div>
          <div class="f-row"><label for="sb_actie">Volgende actie</label>
            <input type="text" id="sb_actie" value="${h(c.volgendeActie||'')}" placeholder="Bijv. bellen over de meeloopdag"></div>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Contract &amp; plaatsing</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="sb_start">Startdatum</label><input type="date" id="sb_start" value="${h(c.start||'')}">
              <span class="hint">Bij Meeloopdag/Offer: de verwachte start.</span></div>
            <div class="f-row"><label for="sb_garantie">Garantie (maanden)</label>
              <input type="number" id="sb_garantie" min="0" max="12" value="${h(c.garantieMnd||0)}"></div>
            ${toonDatums?`
            <div class="f-row"><label for="sb_plaats">Geplaatst op (getekend)</label><input type="date" id="sb_plaats" value="${h(c.geplaatstOp||'')}"></div>
            <div class="f-row"><label for="sb_stopdat">Gestopt op</label><input type="date" id="sb_stopdat" value="${h(c.gestoptOp||'')}"></div>`:''}
          </div>
          <div class="f-row"><label for="sb_verv">Vervangt (gestopte kandidaat)</label>
            <select id="sb_verv"><option value="">—</option>
              ${gestopten.map(x=>`<option value="${h(x.id)}" ${c.vervangt===x.id?'selected':''}>${h(x.naam)} (${h(x.klant||'—')})</option>`).join('')}</select>
            <span class="hint">Een vervanger telt niet dubbel in het target.</span></div>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Salaris</div></div>
        <div class="card-b">
          <div class="f-grid">
            <div class="f-row"><label for="sb_loon">Bruto maandloon (€)</label>
              <input type="number" id="sb_loon" min="0" step="50" value="${c.maandloon!=null?h(c.maandloon):''}"></div>
            <div class="f-row"><label for="sb_toeslag">Ploegentoeslag (%)</label>
              <input type="number" id="sb_toeslag" min="0" max="100" step="0.5" value="${c.toeslagPct!=null?h(c.toeslagPct):''}"></div>
            <div class="f-row"><label for="sb_vt">Vakantietoeslag (%)</label>
              <input type="number" id="sb_vt" min="0" max="100" step="0.5" placeholder="8" value="${c.vtPct!=null?h(c.vtPct):''}">
              <span class="hint">Leeg = 8% (zoals de oude jaarfactor 12,96).</span></div>
            <div class="f-row"><label for="sb_eju">Eindejaarsuitkering (%)</label>
              <input type="number" id="sb_eju" min="0" max="100" step="0.5" value="${c.ejuPct!=null?h(c.ejuPct):''}"></div>
            <div class="f-row"><label for="sb_overig">Overig (%)</label>
              <input type="number" id="sb_overig" min="0" max="100" step="0.5" value="${c.overigPct!=null?h(c.overigPct):''}"></div>
          </div>
          <div class="rc-totsal" id="sb_totsal"></div>
        </div></div>

      ${v?`<div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Gekoppelde vacature</div></div>
        <div class="card-b"><div class="rc-kv"><span class="label">Vacature</span><span>${h(v.functie)}</span></div>
          <div class="rc-kv"><span class="label">Klant</span><span>${h(v.klant)}</span></div>
          <div class="rc-kv"><span class="label">Locatie</span><span>${h(v.locatie||'—')}</span></div></div></div>`:''}

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Notitie</div></div>
        <div class="card-b">
          <div class="f-row"><label for="sb_note">Notitie toevoegen</label>
            <textarea id="sb_note" placeholder="Kort en feitelijk"></textarea>
            <span class="hint">@naam om een collega te melden</span></div>
        </div></div>

      <div class="card" style="margin-top:16px"><div class="card-h"><div class="h2">Geschiedenis</div></div>
        <div class="card-b">${CRM.ui.tijdlijn(tijdlijn)}</div></div>
      <div class="note err" id="sb_err" style="display:none;margin-top:14px"></div>
    </div>
    <!-- flex-wrap: op 375px past deze rij knoppen niet naast elkaar; zonder
         wrap liep "Volledige kandidaatkaart" buiten beeld en was hij op een
         telefoon niet te bereiken. -->
    <div class="drawer-f" style="flex-wrap:wrap;row-gap:8px">
      <button class="btn" id="sb_ok">Opslaan</button>
      <button class="btn ghost" id="sb_plan">Inplannen</button>
      ${kanIntake?`<button class="btn ghost" id="sb_intake">Video-intake</button>`:''}
      <button class="btn ghost" id="sb_noshow" title="Afspraak wissen en no-show tellen">No-show</button>
      <div class="spacer"></div>
      <button class="btn ghost" id="sb_volledig">Volledige kandidaatkaart →</button>
    </div>`, {onOpen(dr){
      CRM.dictee?.hang(dr.querySelector('#sb_note'));
      const upd = () => {
        const el = dr.querySelector('#sb_totsal'); if(!el) return;
        const loon = +dr.querySelector('#sb_loon').value || 0;
        if(!loon){ el.innerHTML = '<span class="meta">Vul het maandloon in voor het totaal-jaarsalaris.</span>'; return; }
        const tot = totaalJaarSalaris(loon, +dr.querySelector('#sb_toeslag').value || 0,
          dr.querySelector('#sb_vt').value, +dr.querySelector('#sb_eju').value || 0, +dr.querySelector('#sb_overig').value || 0);
        /* Het salaris van de kandidaat is een arbeidsvoorwaarde en mag het team
           zien (zelfde afweging als op de kandidaatkaart). De fee is dat níet —
           dat is onze omzet. Die verwijzing tonen we daarom alleen aan wie
           financiële cijfers mag zien. */
        el.innerHTML = `Totaal jaarsalaris ≈ <b class="num">${CRM.euro(Math.round(tot))}</b>
          <span class="meta">incl. toeslagen${CRM.canSeeMoney() ? ' — basis voor de fee in de finance-app' : ''}</span>`;
      };
      ['loon','toeslag','vt','eju','overig'].forEach(k => dr.querySelector('#sb_'+k).oninput = upd);
      upd();
      dr.querySelector('#sb_volledig').onclick = () => { CRM.drawer.close(); CRM.ga('kandidaten',{id:c.id}); };
      dr.querySelector('#sb_plan').onclick = () => planAfspraak(c);
      const ib = dr.querySelector('#sb_intake'); if(ib) ib.onclick = () => intakeForm(c.id);
      dr.querySelector('#sb_noshow').onclick = async () => {
        if(await noShow(c.id)) snelBewerk(c.id);
      };
      dr.querySelector('#sb_ok').onclick = async () => {
        const g = id => { const e = dr.querySelector('#sb_'+id); return e ? e.value : ''; };
        const err = dr.querySelector('#sb_err');
        const zeg = t => { err.style.display=''; err.textContent = t; err.scrollIntoView({block:'nearest'}); };
        const doel = g('fase');
        const patch = {
          datum:g('datum')||'', tijd:g('tijd')||'',
          volgende_actie:g('actie').trim()||null, actie_datum:g('actiedat')||null,
          type:g('type').replace('&amp;','&')||'', bron:g('bron')||'', rec:g('rec').trim(),
          start:g('start')||'', garantie_mnd:+g('garantie')||0, vervangt:g('verv')||'',
          maandloon:g('loon')!==''?+g('loon'):null, toeslag_pct:g('toeslag')!==''?+g('toeslag'):null,
          vt_pct:g('vt')!==''?+g('vt'):null, eju_pct:g('eju')!==''?+g('eju'):null,
          overig_pct:g('overig')!==''?+g('overig'):null
        };
        if(toonDatums){ patch.geplaatst_op = g('plaats')||''; patch.gestopt_op = g('stopdat')||''; }
        /* Poortwachters — zelfde regels als het bord. */
        if(!patch.bron) return zeg('Vul de bron in (Meta/Indeed/referral…) — nodig voor kanaal-inzicht.');
        if(CRM.faseIs(doel,'Intake') && !CRM.faseIs(c.fase,'Intake') && !patch.datum)
          return zeg('Plan eerst de videocall: vul de afspraakdatum in — alleen kandidaten mét call komen in Intake.');
        if(GESPREK_FASES.includes(doel) && !CRM.faseIs(doel, c.fase) && !patch.datum)
          return zeg('Zet de afspraakdatum erbij — zonder datum weten we niet wanneer het gesprek is.');
        if(doel === 'In de wacht' && !patch.start)
          return zeg('Zet de verwachte startdatum erbij — dan rekent de forecast ermee.');
        if(CONTRACT_FASES.includes(doel) && !patch.maandloon)
          return zeg('Vul het bruto maandloon in — nodig voor ' +
            (CRM.canSeeMoney() ? 'de automatische fee' : 'de contract- en factuurgegevens') + '.');
        if(CRM.PLACED.includes(doel) && !patch.start)
          return zeg('Vul de startdatum in — die bepaalt de eerste factuurdatum.');
        const note = g('note').trim();
        if(note) patch.notities = (c.notities||[]).concat([{op:new Date().toISOString(), door:CRM.me(), tekst:note}]);
        const ok = await bewaarKand(c.id, patch);
        if(!ok) return;
        if(note){
          await CRM.logActiviteit('kandidaat', c.id, 'notitie', note);
          CRM.verwerkTags(note, 'kandidaat', c.id);
        }
        if(!CRM.faseIs(doel, c.fase)){
          CRM.drawer.close();
          const na = CRM.kandidaat(c.id);
          if(UITVAL.includes(doel)) return uitvalForm(na, doel);
          let ef = doel;
          if(CRM.PLACED.includes(doel) && patch.start) ef = patch.start <= CRM.todayISO() ? 'Gestart' : 'Contract getekend';
          return bewaarFase(na, ef);
        }
        /* Correctieflow: kaart blijft Afgevallen/Gestopt maar mist de categorie →
           route de wijziging alsnog door het uitvalformulier. */
        const na = CRM.kandidaat(c.id);
        if(UITVAL.includes(doel) && !(doel === 'Afgevallen' ? na.afvalCat : na.stopCat)){
          CRM.drawer.close();
          return uitvalForm(na, doel);
        }
        CRM.toast('Opgeslagen','ok');
        alles(); snelBewerk(c.id);
      };
    }});
}

/* ─── No-show: afspraak wissen en tellen ──────────────────────────
   Eén implementatie; de kandidatenkaart en de snel-bewerken-drawer
   gebruiken allebei deze. Geeft true terug als het is doorgevoerd. */
async function noShow(id){
  const c = CRM.kandidaat(id); if(!c) return false;
  const ja = await CRM.bevestig(`${c.naam} als no-show markeren?`, 'De afspraak wordt gewist en de no-show geteld.');
  if(!ja) return false;
  await bewaarKand(c.id, {no_shows:(c.noShows||0)+1, datum:'', tijd:'',
    notities:(c.notities||[]).concat([{op:new Date().toISOString(), door:CRM.me(),
      tekst:'No-show' + (c.datum ? ' (afspraak ' + c.datum + ')' : '')}])});
  await CRM.logActiviteit('kandidaat', c.id, 'notitie', 'No-show geregistreerd');
  CRM.toast(`${c.naam} — no-show geregistreerd`, 'ok');
  alles();
  return true;
}

/* ─── Fase-picker (tikken in plaats van slepen) ───────────────────
   Woont hier, naast faseWissel, zodat het bord én de kandidatenkaart
   dezelfde picker mét dezelfde poortwachters gebruiken. */
/* De fasekiezer toont sinds 3 aug 2026 ook de instroom. Hij bood alleen
   CRM.PHASES — dus alles vanaf Voorgesteld — en daarmee kon een AM vanaf de
   kandidaatkaart niet vastleggen dat er een videocall gepland staat of dat
   het cv net binnen is. Dat moest via de leadlijst in Recruitment, terwijl
   de kandidaat daar niet meer stond. Nu staat de hele weg in één venster,
   in twee groepen: vóór de klant, en bij de klant. */
function fasePicker(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const knop = p => `<button data-f="${h(p.k)}" class="${CRM.faseIs(c.fase,p.k)?'nu':''}">
    <i class="dot" style="background:${p.c}"></i>${h(p.k)}${
      CRM.faseIs(c.fase,p.k)?'<span class="meta">huidige fase</span>':''}</button>`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Waar staat ${h(c.naam)}?</div>
      <p class="sub" style="margin:6px 0 0">Instroom regel je hier; vanaf Voorgesteld hangt er een klant aan en vraagt het systeem om de gegevens die daarbij horen.</p></div>
    <div class="modal-b">
      <div class="label" style="margin:0 0 8px">Bij ons — nog geen klant</div>
      <div class="rc-fasepick">${CRM.INSTROOM.map(knop).join('')}</div>
      <div class="label" style="margin:18px 0 8px">Bewaren — geen actief traject</div>
      <div class="rc-fasepick">${CRM.TALENTPOOL.map(knop).join('')}</div>
      <div class="label" style="margin:18px 0 8px">Bij een klant</div>
      <div class="rc-fasepick">${CRM.PHASES.map(knop).join('')}</div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button></div>`, {onOpen(m){
      CRM.$$('[data-f]', m).forEach(b => b.onclick = () => {
        CRM.modal.close();
        if(!CRM.faseIs(b.dataset.f, c.fase)) faseWissel(c.id, b.dataset.f);
      });
    }});
}

/* ─── Afspraak inplannen vanuit de pijplijn-drawer ────────────── */
function planAfspraak(c){
  const titel = CRM.faseIs(c.fase,'Intake')
    ? `Videointake — ${c.naam}`
    : `Gesprek — ${c.naam}${c.klant?' @ '+c.klant:''}`;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Inplannen</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)}</p></div>
    <div class="modal-b">
      <div class="f-row"><label>Onderwerp</label><input type="text" id="pa_titel" value="${h(titel)}"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label><input type="date" id="pa_datum" value="${h(String(c.datum||'').slice(0,10)||CRM.todayISO())}"></div>
        <div class="f-row"><label>Tijd</label><input type="time" id="pa_tijd" value="${h(c.tijd||'10:00')}"></div>
        <div class="f-row"><label>Duur</label><select id="pa_duur">
          <option value="30">30 minuten</option>
          <option value="45" selected>45 minuten</option>
          <option value="60">60 minuten</option></select></div>
      </div>
      <label class="check"><input type="checkbox" id="pa_teams"> Teams-videocall</label>
      <div class="f-row" style="margin-top:10px"><label>Notitie</label>
        <textarea id="pa_body" placeholder="Voor in de uitnodiging…"></textarea></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="pa_ok">Inplannen</button></div>`, {onOpen(m){
    CRM.dictee?.hang(m.querySelector('#pa_body'));
    m.querySelector('#pa_ok').onclick = async () => {
      const d = {
        titel:m.querySelector('#pa_titel').value.trim(),
        datum:m.querySelector('#pa_datum').value, tijd:m.querySelector('#pa_tijd').value || '10:00',
        duurMin:Number(m.querySelector('#pa_duur').value)||45,
        teams:m.querySelector('#pa_teams').checked,
        body:m.querySelector('#pa_body').value.trim(),
        deelnemers:[c.email].filter(Boolean)
      };
      if(!d.titel) return CRM.toast('Vul een onderwerp in','err');
      if(!d.datum) return CRM.toast('Kies een datum','err');
      CRM.modal.close();
      try{
        const r = await CRM.outlook.maakAfspraak(d);
        CRM.toast(r.via==='graph' ? 'In je agenda gezet' : 'Outlook geopend — klik daar op Opslaan','ok');
        await CRM.logActiviteit('kandidaat', c.id, 'gesprek',
          `Afspraak ingepland: ${d.titel} op ${CRM.fmtDate(d.datum)} ${d.tijd}`);
        if(r.online) await CRM.logActiviteit('kandidaat', c.id, 'notitie', 'Teams-link: ' + r.online);
        await bewaarKand(c.id, {datum:d.datum, tijd:d.tijd});
        tekenBody(); snelBewerk(c.id);
      }catch(e){ CRM.fout('Inplannen mislukt', e); }
    };
  }});
}

/* ═══════════════════════════════════════════════════════════════
   VIDEO-INTAKE — GESPREKSMODUS IN HET ZIJPANEEL
   Sinds 5 aug 2026 een drawer in plaats van een modal: de recruiter
   loopt het paneel van boven naar beneden door terwijl de kaart
   ernaast leesbaar blijft, en heeft daarna een VOLLEDIG ingevulde
   kandidatenkaart — geen dubbel werk meer na het gesprek.

   Opbouw: blok 0 zijn de FEITEN (lezen/schrijven rechtstreeks op de
   kandidaatvelden en c.cv), daarna de bestaande gespreksvragen in
   gespreksvolgorde. De intake-sleutels (cijfer, drijfveer, risicos,
   op, door, …) blijven exact gelijk — de kandidatenkaart
   (intakeHtml in js/kandidaten.js) leest ze zo.

   Extra's: conceptopslag in localStorage (typwerk kan niet meer
   verdampen door een misklik of een transcript-run), Enter springt
   naar het volgende veld, en "Samenvatting maken" bouwt zonder AI
   een nette samenvatting uit wat er al is ingevuld.
   ═══════════════════════════════════════════════════════════════ */
/* Eén intakepaneel tegelijk: opent iemand het opnieuw (bv. na de
   transcript-route) dan ruimt de vorige instantie eerst haar
   listeners en scrim-guard op. Zonder dit stapelen Escape-guards. */
let igVorigeOpruimen = null;

function intakeForm(id){
  const c = CRM.kandidaat(id); if(!c) return;
  const it = c.intake || {};
  const cv = c.cv || {};
  const conceptKey = 'intakeConcept:' + c.id;
  if(igVorigeOpruimen) igVorigeOpruimen();

  /* Toestand van dit paneel. `dirty` = er is iets gewijzigd sinds openen of
     opslaan; de guards (sluitknop, scrim, Escape) kijken hiernaar. */
  let dirty = false, wachter = null, escGuard = null, opgeruimd = false;
  const opruimen = () => {
    if(opgeruimd) return; opgeruimd = true;
    if(igVorigeOpruimen === opruimen) igVorigeOpruimen = null;
    clearTimeout(wachter);
    if(escGuard) document.removeEventListener('keydown', escGuard, true);
    /* De scrim-guard weer terug naar het gedrag dat core.js erop zette,
       anders houdt een gesloten intake alle vólgende drawers gegijzeld. */
    const sc = document.getElementById('scrim');
    if(sc) sc.onclick = () => CRM.drawer.close();
  };
  igVorigeOpruimen = opruimen;

  /* Bouwstenen. De gespreksvelden houden hun oude in_*-ids (dus dezelfde
     intake-sleutels); de feitenvelden heten ig_* en schrijven naar de
     kandidaat zelf. */
  const ta = (k, vraag, ph) => `<div class="f-row"><label for="in_${k}">${h(vraag)}</label>
    <textarea id="in_${k}" rows="2" placeholder="${h(ph||'')}">${h(it[k]||'')}</textarea></div>`;
  const chips = (k, ops, sel) => `<div class="rc-inchips" data-veld="${h(k)}">${
    ops.map(o=>`<button type="button" class="chip btn-like ${sel===o?'on':''}" data-w="${h(o)}">${h(o)}</button>`).join('')}</div>`;
  const fi = (k, lbl, val, ph) => `<div class="f-row"><label for="ig_${k}">${h(lbl)}</label>
    <input type="text" id="ig_${k}" value="${h(val||'')}" placeholder="${h(ph||'')}"></div>`;
  const fsel = (k, lbl, ops, val) => {
    /* Staat er op de kaart een waarde die niet (meer) in de lijst zit, dan
       hoort die tóch zichtbaar te blijven — anders wist opslaan hem stiekem. */
    const lijst = (!val || ops.includes(val)) ? ops : ops.concat([val]);
    return `<div class="f-row"><label for="ig_${k}">${h(lbl)}</label>
      <select id="ig_${k}"><option value="">—</option>${lijst.map(o=>`<option ${o===val?'selected':''}>${h(o)}</option>`).join('')}</select></div>`;
  };
  const blok = (nr, titel, eerste) => `<div class="ig-blok${eerste?' ig-eerste':''}"><span class="ig-nr num">${nr}</span><span>${titel}</span></div>`;

  /* "Er staat nog een concept" — eigen mini-modal in plaats van CRM.bevestig,
     omdat Escape/ernaast klikken hier de VEILIGE keuze moet zijn (verdergaan);
     bij bevestig() geldt dat als annuleren en dat zou hier weggooien betekenen. */
  const vraagConcept = op => new Promise(res => {
    const d = new Date(op);
    const wanneer = isNaN(d) ? 'eerder' :
      d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) + ' ' +
      d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
    CRM.modal.open(`
      <div class="modal-h"><div class="h2">Niet-opgeslagen intake gevonden</div></div>
      <div class="modal-b"><p class="sub" style="margin:0">Er staat een niet-opgeslagen intake van ${h(wanneer)} — verdergaan of weggooien?</p></div>
      <div class="modal-f">
        <button class="btn ghost" id="igc_weg">Weggooien</button>
        <div class="spacer"></div>
        <button class="btn" id="igc_door">Verdergaan</button>
      </div>`, {
      onClose(){ res(true); },
      onOpen(m){
        const sluit = v => { CRM.modal._onClose = null; CRM.modal.close(); res(v); };
        m.querySelector('#igc_door').onclick = () => sluit(true);
        m.querySelector('#igc_weg').onclick  = () => sluit(false);
      }});
  });

  CRM.drawer.open(`
    <div class="drawer-h">
      <div style="flex:1;min-width:0">
        <div class="h2">Video-intake · ${h(c.naam)}</div>
        <div class="sub">${h(c.klant||'—')} · ${h(c.functie||'—')}${c.datum?' · videocall '+h(CRM.fmtDay(c.datum))+(c.tijd?' '+h(c.tijd):''):''}${it.op?' · laatst bijgewerkt '+h(CRM.fmtDate(it.op))+(it.door?' door '+h(it.door):''):''}</div>
      </div>
      <button class="btn sub x" id="ig_sluit">✕</button>
    </div>
    <div class="drawer-b" id="ig_body">
      <p class="ig-uitleg">Loop het paneel van boven naar beneden door tijdens het gesprek. Enter springt naar het volgende veld (Shift+Enter = nieuwe regel); je invoer wordt tussendoor als concept bewaard.</p>
      ${blok('0','Feiten', true)}
      <div class="f-grid">
        ${fi('functie','Gezochte functie', c.functie)}
        ${fsel('beschikbaar','Beschikbaar', CRM.BESCHIKBAAR, c.beschikbaar)}
        ${fsel('ploegen','Ploegen', CRM.PLOEGEN, c.ploegen)}
        ${fsel('vervoer','Vervoer', CRM.VERVOER, c.vervoer)}
        ${fi('woonplaats','Woonplaats', c.woonplaats)}
        ${fi('adres','Adres', c.adres)}
        ${fi('postcode','Postcode', c.postcode)}
        ${fi('talen','Talen', c.talen, 'Nederlands, Engels…')}
        ${fi('rijbewijs','Rijbewijs', c.rijbewijs, 'B')}
      </div>
      ${blok('1','Functie &amp; werkverleden')}
      <div class="f-grid">
        ${fi('huidigeFunctie','Huidige functie', cv.huidigeFunctie)}
        ${fi('werkgever','Huidig bedrijf', cv.werkgever)}
        ${fi('opzegtermijn','Opzegtermijn', cv.opzegtermijn, 'bijv. 1 maand')}
      </div>
      ${ta('situatie','Wat is er veranderd waardoor je nu openstaat? Wat mis je in je huidige/vorige werk?','de reden achter de reden — vraag door')}
      ${ta('werkbeeld','Wat weet je van dit soort werk — tempo, fysiek, omgeving? Waar verwacht je aan te moeten wennen?','voorkomt uitval in de eerste 30 dagen')}
      ${blok('2','Salaris &amp; voorwaarden')}
      <div class="f-grid">
        ${fi('huidigSalaris','Huidig salaris (bruto p/m)', cv.huidigSalaris, 'bijv. 2800')}
        ${fi('salariswens','Salariswens (bruto p/m)', cv.salariswens, 'bijv. 3100')}
      </div>
      ${blok('3','Motivatie')}
      ${ta('jaZegt','Stel je krijgt een aanbod: wat maakt dat je ja zegt — behalve het geld?')}
      ${ta('droombaan','Wat maakt een baan voor jou een droombaan?')}
      ${ta('blijven','Wat zou je huidige werkgever moeten veranderen zodat je tóch blijft?','ontmaskert de echte drijfveer en de tegenbod-gevoeligheid')}
      ${ta('jaar13','Waar wil je over 1 jaar staan? En over 3 jaar?')}
      ${ta('leren','Wat wil je leren of ontwikkelen in je volgende stap?')}
      ${blok('4','Risico’s')}
      <div class="f-row"><label>Loop je ook bij andere bureaus of bedrijven?</label>
        ${chips('trajecten',['nee','ja'],it.trajecten)}
        <textarea id="in_trajectenTxt" rows="1" placeholder="zo ja: waar, en hoe ver in het proces?" style="margin-top:8px;${it.trajecten==='ja'?'':'display:none'}">${h(it.trajectenTxt||'')}</textarea></div>
      ${ta('blokkade','Is er iets of iemand die je zou tegenhouden om ja te zeggen op een passend aanbod?','partner, reistijd, twijfel…')}
      <div class="f-row"><label>Verwacht je een tegenbod als je opzegt?</label>${chips('tegenbod',['nee','misschien','ja'],it.tegenbod)}</div>
      <div class="f-row"><label>Heb je je onvrede al eens bij je leidinggevende aangekaart?</label>${chips('aangekaart',['ja','nee'],it.aangekaart)}</div>
      ${blok('5','Oordeel &amp; samenvatting')}
      <div class="f-row"><label>Als het aanbod klopt: hoe graag maak je deze overstap? (1–10)</label>
        <div class="rc-schaal">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" class="rc-cijfer ${+it.cijfer===n?'on':''}" data-c="${n}">${n}</button>`).join('')}</div></div>
      ${ta('nietLager','Waarom geen twee punten lager?','hier komt het echte verhaal')}
      ${ta('tien','Wat zou het een 10 maken?','je onderhandel-checklist bij het offer')}
      ${ta('drijfveer','Echte drijfveer (één zin)')}
      ${ta('risicos','Afhaakrisico’s')}
      <div class="ig-samenvat">
        <button type="button" class="btn ghost sm" id="ig_samenvat">Samenvatting maken</button>
        <span class="hint">bouwt een paar zinnen uit wat je hierboven invulde — daarna gewoon aanpasbaar</span>
      </div>
      ${ta('samenvatting','Samenvatting voor de klant','drie feitelijke zinnen die de kandidaat verkopen')}
      <div class="f-row"><label>Klaar om voor te stellen?</label>${chips('klaar',['ja','nog niet'],it.klaar)}</div>
    </div>
    <div class="drawer-f" style="flex-wrap:wrap;row-gap:8px">
      <button class="btn" id="in_ok">Intake opslaan</button>
      <button class="btn ghost" id="in_uittranscript">Uit transcript</button>
      <div class="spacer"></div>
      <button class="btn ghost" id="ig_annuleer">Sluiten</button>
    </div>`, {onClose:opruimen, onOpen(dr){
      const $ = sel => dr.querySelector(sel);
      dr.querySelectorAll('textarea').forEach(t => CRM.dictee?.hang(t));

      /* ── Conceptopslag: alles wat in het paneel staat, als één object ── */
      const lees = () => {
        const d = {velden:{}, chips:{}, cijfer:null};
        CRM.$$('#ig_body input[id], #ig_body select[id], #ig_body textarea[id]', dr)
          .forEach(el => { d.velden[el.id] = el.value; });
        CRM.$$('.rc-inchips[data-veld]', dr).forEach(g => {
          const on = g.querySelector('.chip.on'); if(on) d.chips[g.dataset.veld] = on.dataset.w;
        });
        const cij = dr.querySelector('.rc-cijfer.on'); if(cij) d.cijfer = +cij.dataset.c;
        return d;
      };
      const heeftInhoud = d => !!d && (
        Object.values(d.velden||{}).some(v => String(v).trim() !== '') ||
        Object.keys(d.chips||{}).length > 0 || d.cijfer != null);
      const zetTerug = d => {
        /* Alleen gevulde conceptvelden terugzetten: een leeg veld in het
           concept mag niet wissen wat er intussen op de kaart of via de
           transcript-route is ingevuld. */
        Object.entries((d && d.velden) || {}).forEach(([k, v]) => {
          if(String(v).trim() === '') return;
          const el = dr.querySelector('#'+k); if(el) el.value = v;
        });
        Object.entries((d && d.chips) || {}).forEach(([veld, w]) => {
          const g = dr.querySelector(`.rc-inchips[data-veld="${veld}"]`); if(!g) return;
          CRM.$$('.chip', g).forEach(b => b.classList.toggle('on', b.dataset.w === w));
        });
        if(d && d.cijfer != null)
          CRM.$$('.rc-cijfer', dr).forEach(b => b.classList.toggle('on', +b.dataset.c === d.cijfer));
        const tr = dr.querySelector('.rc-inchips[data-veld="trajecten"] .chip.on');
        const txt = $('#in_trajectenTxt');
        if(txt) txt.style.display = (tr && tr.dataset.w === 'ja') ? '' : 'none';
      };
      const schrijfConcept = () => {
        try{ localStorage.setItem(conceptKey, JSON.stringify({op:new Date().toISOString(), data:lees()})); }catch(e){}
      };
      /* ~2 s stilte na de laatste aanslag, dan pas schrijven — niet bij elke
         toets, want JSON.stringify over het hele paneel bij elke letter is
         zonde en het concept hoeft alleen een misklik te overleven. */
      const noteer = () => { dirty = true; clearTimeout(wachter); wachter = setTimeout(schrijfConcept, 2000); };
      $('#ig_body').addEventListener('input', noteer);

      /* Ligt er nog een concept van een eerdere sessie? Dan kiest de
         recruiter zelf: verdergaan (concept over de kaartwaarden heen) of
         weggooien (verder met wat er op de kaart staat). */
      let concept = null;
      try{ concept = JSON.parse(localStorage.getItem(conceptKey) || 'null'); }catch(e){ concept = null; }
      if(concept && heeftInhoud(concept.data)){
        vraagConcept(concept.op).then(verder => {
          if(verder){ zetTerug(concept.data); dirty = true; }
          else { try{ localStorage.removeItem(conceptKey); }catch(e){} }
        });
      }

      /* ── Chips en cijferschaal (ongewijzigd gedrag, plus conceptopslag) ── */
      CRM.$$('.rc-inchips', dr).forEach(g => CRM.$$('.chip', g).forEach(b => b.onclick = () => {
        CRM.$$('.chip', g).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        if(g.dataset.veld === 'trajecten') $('#in_trajectenTxt').style.display = b.dataset.w === 'ja' ? '' : 'none';
        noteer();
      }));
      CRM.$$('.rc-cijfer', dr).forEach(b => b.onclick = () => {
        CRM.$$('.rc-cijfer', dr).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        noteer();
      });

      /* ── Invulritme: Enter = volgend veld, Shift+Enter = nieuwe regel ── */
      dr.addEventListener('keydown', e => {
        if(e.key !== 'Enter') return;
        const el = e.target;
        if(!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
        if(el.tagName === 'TEXTAREA' && e.shiftKey) return;
        e.preventDefault();
        const lijst = CRM.$$('#ig_body input, #ig_body select, #ig_body textarea', dr)
          .filter(x => x.offsetParent !== null && !x.disabled);
        const vlg = lijst[lijst.indexOf(el) + 1];
        if(vlg){ vlg.focus(); vlg.scrollIntoView({block:'center', behavior:'smooth'}); }
        else $('#in_ok').focus();
      });

      /* ── Sluiten met onopgeslagen werk: eerst bevestigen ──
         De drawer kent zelf geen sluit-haak; daarom een eigen guard op de
         sluitknoppen, de scrim en (via capture, dus vóór de globale handler
         in core.js) op Escape. Het concept staat op dat moment al veilig
         in localStorage, dus "toch sluiten" gooit niets weg. */
      const sluitVeilig = async () => {
        if(dirty){
          clearTimeout(wachter); schrijfConcept();
          const toch = await CRM.bevestig('Sluiten zonder de intake op te slaan?',
            'Je invoer blijft als concept bewaard en komt terug zodra je deze intake opnieuw opent.',
            {knop:'Sluiten'});
          if(!toch) return;
        }
        CRM.drawer.close();
      };
      escGuard = e => {
        if(e.key !== 'Escape' || CRM.modal._aan) return;
        if(!dr.isConnected || !dr.classList.contains('on') || !dr.querySelector('#ig_body')) return;
        const el = document.activeElement;
        const typt = el && (el.tagName === 'TEXTAREA' ||
          (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range)$/i.test(el.type)) ||
          el.isContentEditable);
        if(typt) return;              // core.js laat dan alleen het veld los
        if(!dirty) return;            // niets te verliezen → core.js sluit gewoon
        e.stopPropagation();
        sluitVeilig();
      };
      document.addEventListener('keydown', escGuard, true);
      const scrim = document.getElementById('scrim');
      if(scrim) scrim.onclick = () => sluitVeilig();
      $('#ig_sluit').onclick = sluitVeilig;
      $('#ig_annuleer').onclick = sluitVeilig;

      /* ── Samenvatting zonder AI: 3–4 zinnen uit de ingevulde velden ── */
      $('#ig_samenvat').onclick = () => {
        const f = k => { const el = $('#ig_'+k); return el ? el.value.trim() : ''; };
        const t = k => { const el = $('#in_'+k); return el ? el.value.trim() : ''; };
        const zonderPunt = s => String(s).replace(/[.\s]+$/, '');
        const lijstNL = d => d.length > 1 ? d.slice(0, -1).join(', ') + ' en ' + d[d.length - 1] : (d[0] || '');
        const geld = v => {
          const s = String(v || '').trim();
          const m = s.match(/^€?\s*(\d{1,2}\.?\d{3}|\d+)(?:,\d+)?$/);
          return m ? '€' + m[1].replace('.', '') + ' bruto per maand' : s;
        };
        const voornaam = (c.naam || 'De kandidaat').trim().split(/\s+/)[0];
        const zinnen = [];
        /* Wie is het, wat doet hij nu, wat zoekt hij. */
        const d1 = [];
        const hf = f('huidigeFunctie'), wg = f('werkgever');
        if(hf && wg) d1.push(`werkt als ${hf} bij ${wg}`);
        else if(hf) d1.push(`werkt als ${hf}`);
        else if(wg) d1.push(`werkt bij ${wg}`);
        if(f('woonplaats')) d1.push(`woont in ${f('woonplaats')}`);
        if(f('functie')) d1.push(`zoekt een baan als ${f('functie')}`);
        if(d1.length) zinnen.push(`${voornaam} ${lijstNL(d1)}.`);
        /* Wat wil hij verdienen en per wanneer. */
        const d2 = [];
        if(f('salariswens')) d2.push(`wil ${geld(f('salariswens'))} verdienen${f('huidigSalaris') ? ' (nu ' + geld(f('huidigSalaris')) + ')' : ''}`);
        const b = f('beschikbaar');
        if(b === 'direct') d2.push('kan per direct beginnen');
        else if(f('opzegtermijn')) d2.push(`heeft een opzegtermijn van ${zonderPunt(f('opzegtermijn'))}`);
        else if(b && b !== 'niet') d2.push(`is ${b} beschikbaar`);
        const pl = f('ploegen');
        if(pl && pl !== 'geen') d2.push(`wil in ${pl === 'wisselend' ? 'wisselende ploegen' : pl} werken`);
        if(d2.length) zinnen.push(`${voornaam} ${lijstNL(d2)}.`);
        /* Drijfveer + eventueel risico en commitment. */
        const drijf = t('drijfveer') || t('jaZegt') || t('droombaan');
        if(drijf) zinnen.push(`Belangrijkste drijfveer: ${zonderPunt(drijf)}.`);
        const cijEl = dr.querySelector('.rc-cijfer.on');
        const risico = t('risicos') || t('blokkade');
        let z4 = '';
        if(cijEl) z4 = `Commitment voor de overstap: ${cijEl.dataset.c}/10`;
        if(risico) z4 = z4 ? `${z4}; aandachtspunt: ${zonderPunt(risico)}` : `Aandachtspunt: ${zonderPunt(risico)}`;
        if(z4) zinnen.push(z4 + '.');
        if(!zinnen.length) return CRM.toast('Vul eerst een paar velden in — er valt nog niets samen te vatten','err');
        $('#in_samenvatting').value = zinnen.join(' ');
        noteer();
        $('#in_samenvatting').focus();
      };

      /* ── Transcript-route: blijft werken, maar gooit geen typwerk meer
         weg — het concept staat in localStorage vóór het paneel sluit, en
         bij terugkomst kiest de recruiter zelf tussen concept en
         transcript-resultaat. ── */
      $('#in_uittranscript').onclick = () => {
        if(!CRM.intakeAI) return CRM.toast('Transcript inlezen is nu niet beschikbaar','err');
        if(dirty){ clearTimeout(wachter); schrijfConcept(); }
        CRM.drawer.close();
        CRM.intakeAI.open({kandidaat:c, onKlaar:() => intakeForm(c.id)});
      };

      /* ── Opslaan: intake als vanouds, plus de feiten naar de kandidaat ── */
      $('#in_ok').onclick = async () => {
        const g = k => { const el = $('#in_'+k); return el ? el.value.trim() : ''; };
        const f = k => { const el = $('#ig_'+k); return el ? el.value.trim() : ''; };
        const chip = k => { const b = dr.querySelector(`.rc-inchips[data-veld="${k}"] .chip.on`); return b ? b.dataset.w : ''; };
        const cij = dr.querySelector('.rc-cijfer.on');
        const intake = {
          situatie:g('situatie'), trajecten:chip('trajecten'), trajectenTxt:g('trajectenTxt'),
          jaZegt:g('jaZegt'), droombaan:g('droombaan'), blijven:g('blijven'), werkbeeld:g('werkbeeld'),
          jaar13:g('jaar13'), leren:g('leren'), blokkade:g('blokkade'),
          tegenbod:chip('tegenbod'), aangekaart:chip('aangekaart'),
          cijfer:cij ? +cij.dataset.c : null, nietLager:g('nietLager'), tien:g('tien'),
          drijfveer:g('drijfveer'), risicos:g('risicos'), samenvatting:g('samenvatting'), klaar:chip('klaar'),
          /* De datum van de videocall komt uit de recruitmentpijplijn en wordt
             hier niet opnieuw gevraagd — maar hij mag ook niet verdwijnen
             zodra iemand de vragenlijst opslaat. */
          videocallOp:it.videocallOp || '',
          /* Kwam (een deel van) deze intake uit een transcript, dan is dít
             de enige plek waar dat staat — niet laten verdampen bij opslaan
             (wens js/intake.js, punt 4 van de inbouwnotitie). */
          bron:it.bron || '',
          op:CRM.todayISO(), door:CRM.me()
        };
        /* De feiten schrijven naar de kandidaat zelf (kolommen + c.cv),
           zodat de kaart na het gesprek volledig is — geen dubbel werk.
           LET OP: ig_functie is de GEZOCHTE functie (c.functie); de huidige
           functie zit in c.cv.huidigeFunctie. Het cv-object mergen, niet
           vervangen — daar zit ook het werkverleden (cv.werkgevers) in. */
        const patch = {
          intake,
          functie:f('functie'), beschikbaar:f('beschikbaar'), ploegen:f('ploegen'), vervoer:f('vervoer'),
          woonplaats:f('woonplaats'), adres:f('adres'), postcode:f('postcode'),
          talen:f('talen'), rijbewijs:f('rijbewijs'),
          cv:Object.assign({}, c.cv || {}, {
            huidigeFunctie:f('huidigeFunctie'), werkgever:f('werkgever'), opzegtermijn:f('opzegtermijn'),
            huidigSalaris:f('huidigSalaris'), salariswens:f('salariswens')
          })
        };
        const ok = await bewaarKand(c.id, patch);
        if(!ok) return;
        /* Concept wissen — en eerst de wachtende schrijf-timer stoppen,
           anders zet die het concept 2 s later doodleuk terug. */
        clearTimeout(wachter);
        try{ localStorage.removeItem(conceptKey); }catch(e){}
        dirty = false;
        await CRM.logActiviteit('kandidaat', c.id, 'gesprek',
          `Video-intake afgenomen${intake.cijfer ? ' — commitment ' + intake.cijfer + '/10' : ''}`);
        CRM.drawer.close();
        CRM.toast(`Intake opgeslagen${intake.cijfer ? ' — ' + intake.cijfer + '/10' : ''}`, 'ok');
        tekenBody();
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   O&O-SESSIES — aanmaken, beheren, kandidaten koppelen (oo_sessions)
   Schrijft dezelfde kolommen als het bord: id, klant, functie,
   datum, locatie. Kandidaten koppelen via oo_id.
   ═══════════════════════════════════════════════════════════════ */
/* sid = een bestaande sessie beheren. voor = {klant, functie, locatie} om een
   nieuwe sessie voor te vullen — zo kun je hem openen vanaf de vacature
   waarvoor je de sessie organiseert, in plaats van de klant en functie
   opnieuw uit een lijst te zoeken. De knop stond tot 2 aug 2026 boven het
   bord Klanttrajecten; daar hoort hij niet, want daar maak je niets aan. */
function ooModal(sid, voor){
  const sessies = ooSessies();
  const s = sid ? ooSessie(sid) : null;
  const klanten = Array.from(new Set(
    (CRM.state.clients||[]).map(x=>x.naam).concat((CRM.state.vacs||[]).map(v=>v.klant)).filter(Boolean))).sort();
  const vacsVan = k => (CRM.state.vacs||[]).filter(v => v.klant === k);
  let pending = [];                      // snel toegevoegde kandidaten, pas bij Opslaan naar de database

  CRM.modal.open(`
    <div class="modal-h"><div class="h2">O&amp;O-sessie</div>
      <p class="sub" style="margin:6px 0 0">Plan de sessie en koppel de kandidaten — streef naar 4 per sessie.</p></div>
    <div class="modal-b" style="max-height:70vh;overflow-y:auto">
      <div class="f-row"><label for="oo_sel">Sessie</label>
        <select id="oo_sel"><option value="__new">+ Nieuwe sessie</option>
          ${sessies.slice().sort((a,b)=>String(a.datum||'').localeCompare(String(b.datum||''))).map(x =>
            `<option value="${h(x.id)}" ${s&&String(s.id)===String(x.id)?'selected':''}>${h(CRM.fmtDay(x.datum)||'?')} · ${h(x.klant)} – ${h(sessFuncties(x.id) || x.functie)} (${sessDeelnemers(x.id).length})</option>`).join('')}
        </select></div>
      <div class="f-grid">
        <div class="f-row"><label for="oo_klant">Klant</label>
          <select id="oo_klant">${klanten.map(k=>`<option>${h(k)}</option>`).join('')}</select></div>
        <div class="f-row"><label for="oo_func">Functie</label><select id="oo_func"></select></div>
        <div class="f-row"><label for="oo_datum">Datum</label><input type="date" id="oo_datum"></div>
        <div class="f-row"><label for="oo_loc">Locatie</label><input type="text" id="oo_loc" placeholder="Bijv. Bodegraven"></div>
      </div>
      <div class="f-row"><label>Kandidaten in deze sessie</label><div id="oo_lijst"></div></div>
      <div class="f-row"><label>Snel een kandidaat toevoegen</label>
        <div class="row tight">
          <input type="text" id="oo_nnaam" placeholder="Naam" style="flex:1">
          <select id="oo_nbron" style="width:auto">${KAND_BRONNEN.map(b=>`<option>${h(b)}</option>`).join('')}</select>
          <button class="btn ghost sm" id="oo_nadd">Toevoegen</button>
        </div>
        <span class="hint">Wordt pas opgeslagen als je de sessie opslaat.</span></div>
      <div class="note err" id="oo_err" style="display:none"></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost danger" id="oo_del" style="display:none">Sessie verwijderen</button>
      <div class="spacer"></div>
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="oo_ok">Sessie opslaan</button>
    </div>`, {onOpen(m){
      const sel = m.querySelector('#oo_sel'), kSel = m.querySelector('#oo_klant'), fSel = m.querySelector('#oo_func');
      let huidige = s ? s.id : null;
      const vulFunc = keuze => {
        const fs = vacsVan(kSel.value).map(v => v.functie);
        fSel.innerHTML = fs.length ? fs.map(f=>`<option ${f===keuze?'selected':''}>${h(f)}</option>`).join('') : '<option value="">(geen vacature)</option>';
      };
      const locVan = k => (CRM.state.clients||[]).find(x=>x.naam===k)?.locatie || '';
      const vulLijst = () => {
        const pool = CRM.kandidaten().filter(c =>
          (c.klant === kSel.value && !CRM.DONE.includes(c.fase)) || (huidige && String(c.ooId) === String(huidige)));
        const items = pool.concat(pending);
        m.querySelector('#oo_lijst').innerHTML = items.length ? items.map(c => `
          <label class="check rc-oolid"><input type="checkbox" value="${h(c.id)}"
            ${(huidige && String(c.ooId)===String(huidige)) || c._pending ? 'checked' : ''}>
            <span><b>${h(c.naam)}</b> <span class="meta">${h(c.functie||'—')} · ${h(CRM.faseNorm(c.fase))}${c.bron?' · '+h(c.bron):''}${c._pending?' · nieuw':''}</span></span></label>`).join('')
          : '<p class="meta" style="margin:0">Nog geen kandidaten voor deze klant.</p>';
      };
      const vulVelden = () => {
        const x = huidige ? ooSessie(huidige) : null;
        m.querySelector('#oo_del').style.display = x ? '' : 'none';
        /* Bij een nieuwe sessie: eerst wat er is meegegeven (je komt van een
           vacature), dan pas de eerste klant uit de lijst. Anders sta je op
           een willekeurige klant terwijl je net op een specifieke vacature
           klikte. */
        kSel.value = x ? x.klant : (voor && voor.klant) || (klanten[0]||'');
        vulFunc(x ? x.functie : (voor && voor.functie) || '');
        m.querySelector('#oo_datum').value = x ? (x.datum||'') : '';
        m.querySelector('#oo_loc').value = x ? (x.locatie||'')
          : (voor && voor.locatie) || locVan(kSel.value);
        vulLijst();
      };
      sel.onchange = () => { huidige = sel.value === '__new' ? null : sel.value; pending = []; vulVelden(); };
      kSel.onchange = () => { vulFunc(''); if(!m.querySelector('#oo_loc').value) m.querySelector('#oo_loc').value = locVan(kSel.value); vulLijst(); };
      if(!s) sel.value = '__new';
      vulVelden();

      m.querySelector('#oo_nadd').onclick = () => {
        const naam = m.querySelector('#oo_nnaam').value.trim();
        if(!naam) return m.querySelector('#oo_nnaam').focus();
        pending.push({id:CRM.uid()+Math.floor(Math.random()*1e3), naam, klant:kSel.value, functie:fSel.value||'',
          bron:m.querySelector('#oo_nbron').value, fase:'O&O sessie', _pending:true});
        m.querySelector('#oo_nnaam').value = '';
        vulLijst();
      };

      m.querySelector('#oo_del').onclick = async () => {
        if(!huidige) return;
        const n = sessLeden(huidige).length;
        const ja = await CRM.bevestig('O&O-sessie verwijderen?', n ? `${n} ${n===1?'kandidaat raakt':'kandidaten raken'} los van de sessie (de kaarten blijven staan).` : '');
        if(!ja) return;
        for(const c of CRM.kandidaten().filter(x => String(x.ooId) === String(huidige)))
          await bewaarKand(c.id, {oo_id:null});
        CRM.state.ooSessions = ooSessies().filter(x => String(x.id) !== String(huidige));
        if(!CRM.demo) await CRM.sb.from('oo_sessions').delete().eq('id', huidige);
        CRM.modal.close(); CRM.toast('Sessie verwijderd','ok'); alles();
      };

      m.querySelector('#oo_ok').onclick = async () => {
        const err = m.querySelector('#oo_err');
        const datum = m.querySelector('#oo_datum').value;
        if(!datum){ err.style.display=''; err.textContent = 'Kies de datum van de sessie.'; return; }
        const gegevens = {klant:kSel.value, functie:fSel.value||'', datum, locatie:m.querySelector('#oo_loc').value.trim()};
        let sessieId = huidige;
        if(!sessieId){
          sessieId = 's' + Date.now();
          const rijS = Object.assign({id:sessieId}, gegevens);
          CRM.state.ooSessions = ooSessies().concat([rijS]);
          if(!CRM.demo){
            const {error} = await CRM.sb.from('oo_sessions').upsert(rijS);
            if(error){ CRM.state.ooSessions = ooSessies().filter(x=>x.id!==sessieId); err.style.display=''; err.textContent = 'Opslaan mislukt: ' + error.message; return; }
          }
        } else {
          Object.assign(ooSessie(sessieId), gegevens);
          if(!CRM.demo){
            const {error} = await CRM.sb.from('oo_sessions').upsert(Object.assign({id:sessieId}, gegevens));
            if(error){ err.style.display=''; err.textContent = 'Opslaan mislukt: ' + error.message; return; }
          }
        }
        const vandaag = CRM.todayISO();
        const aangevinkt = CRM.$$('#oo_lijst input:checked', m).map(i => i.value);
        /* Nieuwe (pending) kandidaten eerst echt aanmaken. */
        for(const p of pending){
          if(!aangevinkt.includes(p.id)) continue;
          const cand = {id:p.id, naam:p.naam, klant:p.klant, functie:p.functie,
            type:(vacsVan(p.klant).find(v=>v.functie===p.functie)||{}).type || '',
            bron:p.bron, fase:'O&O sessie', datum, since:vandaag, rec:CRM.me(), ooId:sessieId,
            historie:[{fase:'O&O sessie', op:vandaag}]};
          const rijC = CRM.candToRow(cand);
          CRM.state.cands.unshift(rijC);
          if(!CRM.demo){
            const {error} = await CRM.sb.from('candidates').insert(rijC);
            if(error){ CRM.state.cands.shift(); CRM.fout('Kandidaat opslaan mislukt', error); }
          }
          CRM.logActiviteit('kandidaat', cand.id, 'systeem', `Aangemaakt in O&O-sessie ${gegevens.klant} · ${CRM.fmtDate(datum)}`);
        }
        /* Bestaande kandidaten koppelen of loskoppelen. */
        for(const c of CRM.kandidaten()){
          if(pending.some(p => p.id === c.id)) continue;
          if(aangevinkt.includes(c.id)){
            const patch = {oo_id:sessieId, datum};
            if(c.fase !== 'O&O sessie'){
              patch.fase = 'O&O sessie'; patch.since = vandaag;
              patch.historie = (c.historie||[]).concat([{fase:'O&O sessie', op:vandaag}]);
            }
            await bewaarKand(c.id, patch);
          } else if(String(c.ooId) === String(sessieId)){
            await bewaarKand(c.id, {oo_id:null});
          }
        }
        CRM.modal.close();
        CRM.toast('O&O-sessie opgeslagen','ok');
        alles();
      };
    }});
}

/* ═══════════════════════════════════════════════════════════════
   GEDEELD MET DE PIJPLIJN- EN KANDIDATEN-MODULE (beide laden ná dit
   bestand). De poortwachters leven híer — het bord en de
   kandidatenkaart roepen ze aan, zodat de regels maar op één plek
   bestaan. Een klik op een bordkaart opent de vólledige
   kandidatenkaart; snelBewerk is sinds 30 jul 2026 nog slechts de
   expliciete actie "Snel bewerken".
   ═══════════════════════════════════════════════════════════════ */
CRM.kandidaatBewerk = id => snelBewerk(id);                 // snel-bewerken-drawer
CRM.kandidaatFase   = (id, doelFase) => faseWissel(id, doelFase); // fasewissel + poortwachters (incl. uitvalformulier)
CRM.kandidaatFasePicker = id => fasePicker(id);             // fase kiezen i.p.v. slepen (mobiel + kandidatenkaart)
CRM.kandidaatNoShow = id => noShow(id);                     // afspraak wissen + no-show tellen
CRM.kandidaatUitval = (id, fase) => {                       // afmelden of uitvalgegevens corrigeren
  const c = CRM.kandidaat(id);
  if(c) uitvalForm(c, UITVAL.includes(fase) ? fase : (UITVAL.includes(c.fase) ? c.fase : 'Afgevallen'));
};
/* ─── Voorstellen bij een vacature — één route voor élk scherm ───
   Dit kon op twee manieren, en maar één ervan had poortwachters. Vanaf het
   bord en de fase-picker liep het via faseWissel(); vanaf de kandidaatkaart
   ("Voorstellen bij deze vacature") schreef js/kandidaten.js zelf de fase
   weg. Gevolg: dezelfde handeling, twee uitkomsten — via de kaart kwam
   iemand zonder video-intake er zonder vragen doorheen, en er werd geen
   activiteit bij de klant gelogd.

   bewaarFase() claimt in zijn eigen commentaar dat élke fasewissel er
   langskomt. Dat was dus niet waar. Nu wel.

   (Tjeerd, 2 aug 2026: "het bord van klanttrajecten en recruitment moet
   altijd matchen met wat er op de kaarten van de klanten en kandidaten
   gebeurt.") */
CRM.voorstellen = async (id, vac) => {
  const c = CRM.kandidaat(id);
  if(!c || !vac) return false;
  if(!intakeDone(c)){
    const toch = await CRM.bevestig(`${c.naam} heeft nog geen video-intake gehad`,
      'Voorstellen kan pas na de intake. Weet je zeker dat je deze kandidaat toch aan de klant voorstelt?');
    if(!toch) return false;
  }
  const extra = {klant: vac.klant || '', vacature_id: vac.id};
  /* Functie van de vacature alleen overnemen als de kandidaat er zelf geen
     heeft: wat op zijn kaart staat is wat híj doet, en dat overschrijven
     maakt de kaart onbruikbaar zodra hij ergens anders wordt voorgesteld. */
  if(vac.functie && !String(c.functie||'').trim()) extra.functie = vac.functie;
  await bewaarFase(c, 'Voorgesteld', extra);
  await CRM.logActiviteit('klant', vac.klant, 'systeem',
    `${c.naam} voorgesteld voor ${vac.functie || 'een vacature'}`);
  return true;
};
CRM.kandidaatIntake  = id => intakeForm(id);                // video-intakeformulier
CRM.kandidaatPlannen = id => { const c = CRM.kandidaat(id); if(c) planAfspraak(c); };
CRM._rcDeel = {
  intakeForm, ooModal, promoteerStarts, weekGrens,
  ooSessies, ooSessie, sessLeden, sessDeelnemers, sessFuncties, intakeDone,
  garantieEnd, owesReplacement, repOf, totaalJaarSalaris,
  /* "+ Kandidaat" stond op het vervallen tabblad Voorselectie; die knop hoort
     nu op het bord, want de kandidaat komt in de eerste kolom (Intake). */
  nieuweKandidaat: nieuweKandidaatModal,
  /* Vanuit de uitvalstrook op het bord terug naar het Uitval-tabblad. */
  openUitval(){ S.tab = 'uitval'; CRM.ga('recruitment'); }
};

/* VERZOEK AAN COORDINATOR: js/kandidaten.js leest in render() alleen
   `params.id`. De afsluitende regel/kolom hier ("Klaar om voor te stellen")
   navigeert met `CRM.ga('kandidaten', {status:'gekwalificeerd'})`, zodat de
   recruiter en de AM gegarandeerd naar hetzelfde lijstje kijken. Zolang die
   parameter niet gelezen wordt valt het terug op het opgeslagen filter van de
   gebruiker — dat staat standaard óók op 'gekwalificeerd', dus het klopt
   meestal, maar niet voor wie zijn filter ooit heeft omgezet.               */
/* VERZOEK AAN CORE: crm_leads mist een kolom `belpogingen int default 0`.
   Zolang die er niet is leiden we het aantal belpogingen af uit
   crm_activiteiten (soort = 'bel'). Dat werkt, maar een teller in de rij
   zou sneller zijn zodra er duizenden leads in staan. */
/* VERZOEK AAN CORE: demo.js heeft geen ooSessions-testdata; O&O-sessies zijn
   in demo pas zichtbaar nadat je er zelf een aanmaakt (blijft in het geheugen). */

/* VERZOEK AAN OPVOLGING/DASHBOARD (31 jul 2026) — de wachtkamers op Mijn dag.
   Dit bestand weet nu per status wanneer een sollicitant te lang stilstaat
   (STATUS_NORM + stilstand()). Dat signaal staat alleen op dit scherm; wie 's
   ochtends op het dashboard begint ziet het niet. CRM.opvolging.registreerBron
   is er precies voor, maar de bron wordt per dag bevraagd
   (CRM.opvolging.tussen roept fn(mij, dag) voor élke dag in het bereik aan) en
   een lead die vijf dagen te lang stilstaat is vijf dagen achter elkaar open.
   Zonder afspraak over "hoe geef je iets terug dat al te laat is" levert dat
   vijf regels op in de weekweergave van Performance. Twee opties, allebei
   buiten dit bestand te regelen:
     a. de bron geeft alleen de dag terug waarop de grens werd overschreden en
        openVoor() zoekt zelf terug — dan is één regel genoeg, of
     b. de bron krijgt een `achterstallig`-vlag mee zodat tussen() hem één keer
        opneemt.
   Zodra dat vaststaat is de bron hier drie regels code.                      */

/* VERZOEK AAN CORE: crm_leads mist een kolom `laatst_actie timestamptz`
   op nieuwe rijen — hij wordt wél geschreven (pasStatusToe, noteerPoging,
   notities), maar een geïmporteerde of via de agent binnengekomen lead heeft
   hem niet. stilstand() valt dan terug op `binnen_op`, wat voor een verse lead
   klopt maar na de eerste statuswissel buiten dit scherm om zou schuiven.
   Zet hem bij het aanmaken op `binnen_op`, dan klopt de klok altijd.         */

/* VERZOEK AAN COORDINATOR: js/demo.js zet `laatst_actie` op geen enkele lead.
   De nieuwe "blijft liggen"-regel werkt daardoor in de demo op `binnen_op`, en
   dat is voor alles ná 'Nieuw' de verkeerde klok — het lijkt of iedereen
   stilstaat. Een `laatst_actie` van een paar uur tot een paar dagen geleden op
   de demo-leads maakt het beeld realistisch én testbaar.                     */
})();

/* VERZOEK AAN COORDINATOR — CV inlezen (31 jul 2026)

   1. De oude parser in dit bestand (pdfTekst/parseCV) is weg; alles loopt
      nu via CRM.cvParse. Die las een pdf regel voor regel op y-positie en
      weefde bij een cv met twee kolommen de zijbalk door de werkervaring
      heen — vandaar dat een cv met zichtbare jaartallen toch "geen
      werkverleden met jaartallen" opleverde. Hetzelfde is gedaan in
      js/kandidaten.js.

   2. "+ Sollicitant → CV inlezen" maakt nu direct een kandidaat op fase
      'Intake' in plaats van een leadrij plus een tweede formulier. Gevolg
      voor de cijfers: zo'n kandidaat hangt niet aan een vacature en niet
      aan een campagne, dus telt niet mee bij leads-per-plaatsing per klant
      of per vacature. Bewuste keuze — zie de toelichting bij
      sollicitantCvRoute(). Wil je die kandidaten toch apart kunnen zien,
      voeg dan 'CV' toe aan CRM.LEAD_BRONNEN in js/data.js; nu staat er
      'Handmatig', omdat dat een bestaande waarde is.

   3. Het cv-bestand van een sollicitant (nog geen kandidaat) gaat naar
      `sollicitanten/<lead-id>/cv/...` in dezelfde bucket crm-docs. Het pad
      zit in `lead.cv.bestandPad` en dat blok verhuist bij doorschieten
      ongewijzigd mee naar de kandidaat, dus het document blijft aan de
      persoon hangen. Geen schemawijziging nodig: de policies op
      storage.objects gelden per bucket, niet per map.

   4. Zie ook het verzoek onderaan js/kandidaten.js — daar staat de oorzaak
      van "ik kan niet op de parser klikken" (css/base.css, `.modal` mist
      `pointer-events:none` als hij dicht is). */
