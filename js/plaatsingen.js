/* ═══════════════════════════════════════════════════════════════
   MODULE: PLAATSINGEN

   Waarom dit scherm bestaat, en waarom het géén bord is.

   Op het Klanttrajecten-bord gaat elke kolom over vóóruitgang: iemand
   staat op Tweede gesprek en de vraag is wat de volgende stap is. Ná de
   handtekening beweegt er niets meer — er is één datum en een aftelling.
   Een kanban-kolom is de verkeerde vorm voor een aftelling: hij vraagt om
   slepen, en er valt niets te slepen. Bovendien liep de kolom 'Gestart'
   nooit leeg, dus hoe beter het ging hoe voller het bord werd.

   De vraag van de accountmanager verandert daar ook. Niet "wat is de
   volgende stap" maar "is deze persoon klaar voor maandag, en heb ik hem
   sinds het tekenen nog gesproken". Dat is een checklist per persoon, en
   die ordent op TIJD — niet op fase.

   'Contract getekend' en 'Gestart' zijn daarom van het bord gehaald. Dit
   scherm is vanaf dat moment de ENIGE plek waar die mensen nog staan.
   Daar volgt één harde eis uit: er mag niemand doorheen vallen. Elke
   kandidaat in CRM.PLACED belandt in precies één groep hieronder —
   inclusief de rommelgevallen (geen startdatum, onleesbare datum,
   gestopt, geanonimiseerd). Zie indeel(): die functie eindigt bewust met
   een groep die alles opvangt wat niet elders past.

   GEEN EIGEN RITME. Wat er vóór en na de start moet gebeuren staat in
   js/opvolging.js — nazorg, warm houden, felicitatie. Hier wordt dat
   alleen getoond en afgevinkt. Zou dit scherm zijn eigen momenten
   verzinnen, dan zegt het iets anders dan het dashboard over dezelfde
   persoon, en dan gelooft niemand meer een van beide.

   GEEN FEE. Bewuste keuze, ook al mag het (CRM.magOpbrengstZien()). Dit
   scherm beantwoordt één vraag: is deze persoon klaar om te beginnen.
   Een bedrag helpt daar niet bij, maar trekt wel de aandacht weg van de
   openstaande belletjes — en dat is precies het enige waar hier kleur op
   mag zitten. De fee staat op de kandidatenkaart, één klik verderop.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const h = CRM.h;

/* ─── Datumrekenen ────────────────────────────────────────────────
   Anker op 12:00 's middags, net als js/opvolging.js. `new Date('2026-03-29')`
   leest de browser als UTC-middernacht; in Nederland is dat 01:00 of 02:00
   lokaal, en precies in de nacht van de zomertijd schuift dat een dag. Vanaf
   het midden van de dag kan geen enkele tijdzonesprong de datum nog over de
   grens duwen. Een startdatum die een dag verspringt is hier niet cosmetisch:
   dan staat iemand in "later gepland" terwijl hij vandaag op de vloer wordt
   verwacht. */
const dag = v => String(v == null ? '' : v).slice(0,10);
const parse = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dag(iso));
  if(!m) return null;
  const d = new Date(+m[1], +m[2]-1, +m[3], 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
};
const isoLoc = d => d.toLocaleDateString('sv-SE');
const plusDagen = (iso, n) => { const d = parse(iso); if(!d) return ''; d.setDate(d.getDate()+n); return isoLoc(d); };
const maandagVan = iso => { const d = parse(iso); if(!d) return ''; d.setDate(d.getDate() - ((d.getDay()+6)%7)); return isoLoc(d); };
const vandaag = () => CRM.todayISO();

/* Verschil in hele dagen tussen twee ISO-datums. Positief = `b` ligt later. */
function dagenTussen(a, b){
  const x = parse(a), y = parse(b);
  if(!x || !y) return null;
  return Math.round((y - x) / 86400000);
}
function isoWeek(iso){
  const d = parse(iso); if(!d) return 0;
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay()+6)%7) + 3);
  const ft = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((x - ft)/864e5 - 3 + ((ft.getUTCDay()+6)%7)) / 7);
}
/* Zelfde vorm als de weekkoppen op het pijplijnbord ("Week 33 · 11 aug–17 aug").
   Bewust letterlijk hetzelfde: wie van het bord hierheen komt hoort dezelfde
   week te herkennen, niet een tweede manier om een week te benoemen. */
function weekLabel(iso){
  const ma = parse(maandagVan(iso));
  if(!ma) return '';
  const zo = new Date(ma); zo.setDate(ma.getDate()+6);
  const f = d => d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
  return 'Week ' + isoWeek(iso) + ' · ' + f(ma) + '–' + f(zo);
}

/* Hoe lang duurt "net gestart"? Dertig dagen. Dat is geen rond getal om het
   ronde getal: uitval zit vrijwel helemaal in de eerste maand, en het ritme in
   js/opvolging.js legt daar ook zijn dichtste momenten (startdag, dag 1, einde
   week 1, twee weken, één maand). Na de check-in van één maand gaat het ritme
   over op maandelijks, en dan is het naslag geworden. */
const NET_GESTART_DAGEN = 30;

/* ─── Schermstand ────────────────────────────────────────────────
   Zoekterm en "alleen van mij" zijn vragen van dít moment en worden niet
   bewaard. Of "Aan het werk" openstaat is wél een gewoonte: die groep is
   naslag, en wie hem dagelijks openslaat wil dat niet elke ochtend opnieuw
   doen. Zelfde vorm als crm_rc_weergave op het bord — een voorkeur van deze
   persoon op dit apparaat, geen gegeven dat in de database hoort. */
const WERK_KEY = 'crm_pl_werk_open';
const werkOpen    = () => { try{ return localStorage.getItem(WERK_KEY) === '1'; }catch(e){ return false; } };
const zetWerkOpen = aan => { try{ localStorage.setItem(WERK_KEY, aan ? '1' : '0'); }catch(e){} };

const S = { zoek:'', mijn:false };
const M = { mount:null };

/* ─── Indexen, één keer per hertekening ──────────────────────────
   Bij 350 kandidaten en een paar duizend activiteiten is "wanneer sprak ik
   deze persoon voor het laatst" de duurste vraag op dit scherm: via
   CRM.activiteitenVoor() loopt hij per kandidaat de hele lijst af. Eén keer
   indexeren maakt er een opzoeking van. Zelfde patroon als js/opvolging.js
   (actIndex) en js/hot.js (index).

   De index leeft precies zolang als de tekenronde die hem nodig heeft: hij
   wordt aan het begin van teken() gebouwd en daarna niet meer aangeraakt. Een
   index die tussen twee rondes blijft hangen is erger dan geen index — dan
   toont het scherm een contactmoment dat je net hebt vastgelegd nog niet. */
let IX = null;
function bouwIndex(){
  const contactSoorten = new Set((CRM.opvolging && CRM.opvolging.CONTACT) || ['bel','gesprek','whatsapp','mail','bezoek']);
  const laatsteContact = new Map();
  (CRM.state.activiteiten || []).forEach(a => {
    if(a.entiteit !== 'kandidaat' || !contactSoorten.has(a.soort)) return;
    const sleutel = String(a.ref), d = dag(a.op);
    const b = laatsteContact.get(sleutel);
    if(!b || d > b) laatsteContact.set(sleutel, d);
  });
  const metContactpersoon = new Set();
  (CRM.state.contacten || []).forEach(ct => { if(ct.klant) metContactpersoon.add(ct.klant); });
  IX = {laatsteContact, metContactpersoon};
}

/* ─── De indeling ────────────────────────────────────────────────
   Op tijd, niet op fase. De volgorde van de tests hieronder ís de indeling,
   dus die volgorde is de beslissing:

   1. gestopt   — een gestopte plaatsing is geen plaatsing meer. Hij staat wél
                  apart onderaan (niet verstopt): wie hier niets zag zou gaan
                  denken dat de persoon nog werkt, en dat is de ene fout die
                  dit scherm nooit mag maken.
   2. geenDatum — getekend zonder startdatum. Dit is het gat dat je nergens
                  ziet en dat je een klant kost, dus het gaat vóór alles wat
                  wél een datum heeft. Onleesbare datums vallen hier ook in:
                  een datum die de browser niet kan lezen is in de praktijk
                  hetzelfde als geen datum, en hem in een weekgroep proppen
                  levert een kop "Week NaN" op.
   3. dezeWeek  — start tussen maandag en zondag van deze week. Gaat vóór
                  "net gestart", ook als iemand maandag al begonnen is: de
                  vraag van deze week ("is dit goed gegaan, is er al gebeld")
                  hoort bij de week zelf, niet bij een lijst van dertig dagen.
   4. later     — start na deze zondag.
   5. netGestart— de eerste 30 dagen ná de start (en vóór deze maandag).
   6. werk      — de rest. Naslag.

   Er is geen zevende geval: elke kandidaat in CRM.PLACED valt in precies één
   van deze zes. Dat is nagerekend in de rapportage en hoort zo te blijven.

   Filteren op fase gaat via CRM.faseIn, nooit met ===: in productie staan nog
   kaarten op oude fasewaarden die CRM.faseNorm vertaalt. */
function indeel(){
  const nu = vandaag();
  const maandag = maandagVan(nu);
  const zondag  = plusDagen(maandag, 6);
  const G = {geenDatum:[], dezeWeek:[], later:[], netGestart:[], werk:[], gestopt:[]};

  CRM.kandidaten().forEach(c => {
    if(!CRM.faseIn(c.fase, CRM.PLACED)) return;
    if(c.gestoptOp){ G.gestopt.push(c); return; }
    const s = dag(c.start);
    if(!parse(s)){ G.geenDatum.push(c); return; }
    if(s > zondag){ G.later.push(c); return; }
    if(s >= maandag){ G.dezeWeek.push(c); return; }
    const dagenAanHetWerk = dagenTussen(s, nu);
    if(dagenAanHetWerk != null && dagenAanHetWerk <= NET_GESTART_DAGEN){ G.netGestart.push(c); return; }
    G.werk.push(c);
  });

  const opStart = (a,b) => dag(a.start).localeCompare(dag(b.start))
                        || String(a.naam||'').localeCompare(String(b.naam||''), 'nl');
  const opNaam  = (a,b) => String(a.naam||'').localeCompare(String(b.naam||''), 'nl');
  G.dezeWeek.sort(opStart);
  G.later.sort(opStart);
  /* Net gestart andersom: de nieuwste bovenaan. Wie gisteren begon vraagt
     vandaag aandacht; wie 28 dagen geleden begon is bijna naslag. */
  G.netGestart.sort((a,b) => opStart(b,a));
  G.geenDatum.sort(opNaam);
  G.werk.sort(opNaam);
  G.gestopt.sort((a,b) => dag(b.gestoptOp).localeCompare(dag(a.gestoptOp)) || opNaam(a,b));
  G.totaal = G.geenDatum.length + G.dezeWeek.length + G.later.length
           + G.netGestart.length + G.werk.length + G.gestopt.length;
  return G;
}

/* ─── Eén regel klaarmaken ───────────────────────────────────────
   Alles wat een regel nodig heeft in één object, zodat de HTML-functies niets
   meer hoeven uit te rekenen en niemand per ongeluk twee keer hetzelfde
   berekent. */
function regel(c, groep){
  const nu = vandaag();
  const s = dag(c.start);
  const anoniem = !!(CRM.kandVerwijder && CRM.kandVerwijder.isGeanonimiseerd && CRM.kandVerwijder.isGeanonimiseerd(c));
  /* Van een geanonimiseerde kaart zijn naam en nummer bewust gewist. Het
     ritme opvragen levert daar leeg op (js/opvolging.js doet die controle
     zelf), maar we vragen het hier niet eens: belwerk plannen naar iemand die
     net om verwijdering heeft gevraagd is het soort fout dat je maar één keer
     maakt. De persoon blijft wél in de telling staan — hij is nog steeds een
     lopende plaatsing. */
  const opv = (!anoniem && CRM.opvolging) ? CRM.opvolging.voorKandidaat(c, nu) : null;
  /* Een datum die de browser niet kan lezen (import, met de hand getypt) telt
     hier als géén datum — anders zou "niet-een-d" als startdag op het scherm
     komen, en dan lijkt er een datum te staan terwijl er niets staat. Het
     verschil met echt leeg blijft wel zichtbaar in de blokkerregel: bij een
     onleesbare datum is het veld ingevuld en moet je hem corrigeren, niet
     opvragen bij de klant. */
  const leesbaar = !!parse(s);
  return {
    c, groep, anoniem, start: leesbaar ? s : '', kapotteDatum: !!s && !leesbaar,
    /* Voor het tellen en het label: staat de start nog vóór ons? */
    voorStart: !leesbaar || s > nu,
    dagen: leesbaar ? dagenTussen(s, nu) : null,   // positief = al begonnen
    open:   opv ? opv.open   : [],
    gemist: opv ? opv.gemist : [],
    volgende: opv ? opv.volgende : null,
    laatsteContact: IX.laatsteContact.get(String(c.id)) || '',
    blokkers: blokkers(c, leesbaar ? s : '', anoniem, !!s && !leesbaar)
  };
}

/* ─── Wat zit er écht in de weg ──────────────────────────────────
   Terughoudend, met opzet. Dit is géén volledigheidsscore: die staat al op de
   kandidatenkaart (CRM.volledigheid) en levert hier alleen maar een rij
   gele vlaggetjes op die iedereen na twee dagen wegkijkt. Wat hier staat zijn
   vier dingen die een start daadwerkelijk laten mislukken:

     - geen startdatum   → er is niets om je op voor te bereiden;
     - geen klant        → je weet niet waar hij heen moet;
     - geen contactpersoon bij die klant → je weet niet bij wie hij zich meldt,
       en dat is de klassieke eerste-dag-ramp;
     - geen telefoonnummer → je kunt hem vóór de start niet bereiken.

   Alleen vóór de start. Wie al aan het werk is heeft de eerste dag overleefd;
   een ontbrekend telefoonnummer is dan een administratief gebrek en geen
   blokkade, en het hoort niet in een lijst te staan die urgentie uitstraalt. */
function blokkers(c, start, anoniem, kapotteDatum){
  const uit = [];
  if(anoniem) return uit;
  const nu = vandaag();
  if(start && start <= nu) return uit;
  if(kapotteDatum) uit.push('startdatum is onleesbaar — corrigeer hem op de kaart');
  else if(!start) uit.push('geen startdatum');
  if(!String(c.klant || '').trim()) uit.push('geen klant op de kaart');
  else if(!IX.metContactpersoon.has(c.klant)) uit.push('geen contactpersoon bij ' + c.klant);
  if(!String(c.telefoon || '').trim()) uit.push('geen telefoonnummer');
  return uit;
}

/* ─── Zoeken en filteren ─────────────────────────────────────────
   De zoekterm werkt over álle groepen tegelijk. Dat is bewust: "Aan het werk"
   is de groep waar je iets in opzoekt, maar je weet vooraf niet in welke
   groep iemand staat — dat is nu juist wat dit scherm voor je uitrekent. */
function past(c){
  if(S.mijn && CRM.me() && c.rec !== CRM.me()) return false;
  const q = S.zoek.trim().toLowerCase();
  if(!q) return true;
  return [c.naam, c.klant, c.functie, c.rec].some(v => String(v||'').toLowerCase().includes(q));
}

/* ─── Presentatie van een datum ──────────────────────────────────
   CRM.geleden() geeft "over 3 dagen" / "gisteren" / "vandaag" en wordt op het
   hele scherm gebruikt. Hier niet zelf iets formuleren: het dashboard zegt
   dan "over 3 dagen" waar dit scherm "nog 3 dagen" zegt over dezelfde datum. */
function startTekst(r){
  if(r.kapotteDatum) return '<span class="pl-geen">startdatum onleesbaar</span>';
  if(!r.start) return '<span class="pl-geen">geen startdatum</span>';
  const wanneer = CRM.geleden(r.start);
  const klasse = r.dagen === 0 ? ' nu' : (r.voorStart && r.dagen != null && r.dagen >= -3) ? ' bijna' : '';
  return `<span class="pl-start${klasse}"><span class="num">${h(CRM.fmtDay(r.start))}</span>`
       + `<span class="pl-af">${h(wanneer)}</span></span>`;
}

const SOORT_KNOP = {
  mail:      'Mail nakijken',
  afspraak:  'Bericht klaarzetten',
  verjaardag:'Feliciteren'
};
const knopLabel = m => SOORT_KNOP[m.soort] || 'Vastleggen';

/* Openstaande en gemiste momenten. Dit is het enige deel van het scherm dat
   kleur krijgt: rood voor gemist, verder niets. Eén accent, en het staat op
   het enige dat er echt toe doet. */
function momentenHtml(r){
  if(r.anoniem)
    return `<div class="pl-taken"><span class="meta">Geanonimiseerd — geen opvolging meer.</span></div>`;
  /* Bij een onleesbare startdatum rekent het ritme door op een datum die
     nergens op slaat: je krijgt dan de hele nazorg als "gemist" te zien, met
     lege datums erachter. Dat is geen achterstand maar een typefout, en er
     twaalf rode regels van maken maakt het rood op dit scherm waardeloos.
     Eerst de datum, dan het ritme. */
  if(r.kapotteDatum)
    return `<div class="pl-taken"><span class="meta">Zolang de startdatum onleesbaar is valt er geen ritme te berekenen. Corrigeer de datum, dan loopt de opvolging vanzelf mee.</span></div>`;
  const items = r.gemist.concat(r.open);
  if(!items.length){
    if(r.volgende)
      return `<div class="pl-taken"><span class="meta">Volgende contactmoment: ${
        h(r.volgende.kort)} op <span class="num">${h(CRM.fmtDateShort(r.volgende.datum))}</span></span></div>`;
    return '';
  }
  return `<div class="pl-taken">${items.map(m => `
    <span class="pl-t${m.gemist ? ' mis' : ''}">
      <span class="pl-t-w">${h(m.titel)}</span>
      <span class="pl-t-d num">${h([CRM.fmtDateShort(m.datum), m.gemist ? 'gemist' : ''].filter(Boolean).join(' · '))}</span>
      <button type="button" class="btn ghost sm" data-opv="${h(r.c.id)}|${h(m.key)}">${h(knopLabel(m))}</button>
    </span>`).join('')}</div>`;
}

function blokkersHtml(r){
  if(!r.blokkers.length) return '';
  const knop = !r.start
    ? `<button type="button" class="btn ghost sm" data-startdatum="${h(r.c.id)}">Startdatum invullen</button>` : '';
  return `<div class="pl-blok"><span class="meta">Nog nodig vóór de start: ${h(r.blokkers.join(' · '))}</span>${knop}</div>`;
}

/* Eén persoon, uitgebreid. Voor de groepen waar vandaag iets voor moet
   gebeuren: deze week, later gepland, net gestart, zonder startdatum. */
function rijHtml(r){
  const c = r.c;
  const sub = [c.functie, c.klant].filter(Boolean).join(' @ ') || '—';
  const onder = [];
  if(c.rec) onder.push(c.rec);
  onder.push(r.laatsteContact ? 'laatst gesproken ' + CRM.geleden(r.laatsteContact) : 'nog geen contact vastgelegd');
  /* Fase en tijd kunnen uit elkaar lopen, en dat komt in productie vaak voor:
     kaarten worden naar 'Gestart' gesleept zodra het contract rond is, weken
     vóór de eerste werkdag. Dit scherm groepeert op datum en zet zo iemand
     terecht bij "Later gepland", maar dan staat er wel iets anders op de kaart
     dan wat je hier ziet — en zonder uitleg lijkt dát de fout.
     Dus benoemen, in dezelfde gedempte regel als de recruiter en het laatste
     contact. Geen chip, geen kleur, geen knop: het is geen alarm. Wie de fase
     wil rechtzetten doet dat op de kaart, één klik verderop. */
  if(CRM.faseIs(c.fase, 'Contract getekend') && r.start && r.start <= vandaag())
    onder.push('staat nog op Contract getekend');
  else if(CRM.faseIs(c.fase, 'Gestart') && r.start && r.start > vandaag())
    onder.push('staat op Gestart, maar de startdatum ligt nog voor ons');
  return `<div class="pl-r${(r.gemist.length && !r.kapotteDatum) ? ' mis' : ''}" data-kaart="${h(c.id)}" role="button" tabindex="0">
    <div class="pl-r-top">
      <span class="pl-naam">${h(c.naam || '—')}</span>
      <span class="pl-sub">${h(sub)}</span>
      <span class="spacer"></span>
      ${startTekst(r)}
    </div>
    <div class="pl-r-meta meta">${h(onder.join(' · '))}</div>
    ${momentenHtml(r)}
    ${blokkersHtml(r)}
  </div>`;
}

/* Compacte tabel. Voor "Aan het werk" en "Gestopt": naslag, geen werklijst. */
function tabelHtml(rijen, gestopt){
  return `<div class="tblwrap"><table class="tbl"><thead><tr>
      <th>Naam</th><th>Functie</th><th>Klant</th>
      <th>${gestopt ? 'Gestopt' : 'Sinds'}</th><th>Laatst gesproken</th>
      ${gestopt ? '' : '<th>Volgende contactmoment</th>'}
    </tr></thead><tbody>${rijen.map(r => {
      const c = r.c;
      const datum = gestopt ? dag(c.gestoptOp) : r.start;
      const volg = r.gemist.length
        ? `<span class="pl-mis-t">${h(r.gemist.length)}× gemist</span>`
        : r.open.length ? `<span class="num">nu · ${h(r.open[0].kort)}</span>`
        : r.volgende ? `<span class="num">${h(CRM.fmtDateShort(r.volgende.datum))} · ${h(r.volgende.kort)}</span>`
        : '<span class="meta">—</span>';
      return `<tr class="clickable" data-kaart="${h(c.id)}">
        <td><b>${h(c.naam || '—')}</b></td>
        <td>${h(c.functie || '—')}</td>
        <td>${h(c.klant || '—')}</td>
        <td class="num">${h(datum ? CRM.fmtDateShort(datum) : '—')}
          ${datum ? `<div class="rowsub">${h(CRM.geleden(datum))}</div>` : ''}</td>
        <td class="num">${h(r.laatsteContact ? CRM.geleden(r.laatsteContact) : '—')}</td>
        ${gestopt ? '' : `<td>${volg}</td>`}
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

/* ─── Secties ────────────────────────────────────────────────────
   Elke groep is één kaart met een kop, een teller en één regel uitleg. De
   uitleg staat er omdat de indeling een keuze is (waarom 30 dagen? waarom
   staat wie maandag begon niet bij "net gestart"?) en een keuze die je niet
   uitlegt, ziet er van buiten uit als een bug. */
function sectie(opts){
  const {id, titel, uitleg, aantal, inhoud, klapbaar, open} = opts;
  return `<section class="card pl-sec" id="${h(id)}">
    <div class="card-h">
      <div class="h2">${h(titel)}</div>
      <span class="chip num">${h(aantal)}</span>
      <span class="spacer"></span>
      ${klapbaar ? `<button type="button" class="btn sub sm" data-klap="${h(id)}">${open ? 'Inklappen' : 'Uitklappen'}</button>` : ''}
    </div>
    ${(!klapbaar || open) ? `<div class="card-b">
      ${(uitleg && aantal) ? `<p class="sub pl-uit">${h(uitleg)}</p>` : ''}
      ${inhoud}
    </div>` : ''}
  </section>`;
}

/* "Later gepland" per week, precies zoals het bord dat doet. Zonder die
   koppen wordt het één lange lijst datums waarin je "volgende week" niet meer
   ziet — en volgende week is nu net de vraag. */
function weekGroepenHtml(rijen){
  let uit = '', huidig = null;
  rijen.forEach(r => {
    const wk = maandagVan(r.start);
    if(wk !== huidig){
      huidig = wk;
      const n = rijen.filter(x => maandagVan(x.start) === wk).length;
      uit += `<div class="pl-wdiv"><span>${h(weekLabel(r.start))}</span><b class="num">${h(n)}</b></div>`;
    }
    uit += rijHtml(r);
  });
  return uit;
}

const geenHtml = tekst => `<p class="pl-leeg meta">${h(tekst)}</p>`;

/* ─── De tellers ─────────────────────────────────────────────────
   Vier, en niet meer. We zijn vandaag juist schermen aan het opruimen; een
   muur van cijfers is precies waar dit scherm een antwoord op is. Dit zijn de
   vier vragen die een AM 's ochtends stelt voordat hij de lijst inloopt.

   EEN ONDERSCHRIFT MOET OOK BIJ NUL KLOPPEN. Dit ging hier mis en het is het
   soort fout dat een heel scherm ongeloofwaardig maakt: "Deze week · 0 ·
   allemaal begonnen" (er is niemand om begonnen te zijn) en "Lopende
   plaatsingen · 0" terwijl er zes op hetzelfde scherm stonden. Dat tweede was
   erger dan een verkeerde tekst: het cijfer telde wie er nú op de vloer staat,
   maar het label beloofde alle lopende plaatsingen. Nu telt de tegel wat het
   label zegt — iedereen die dit scherm bewaakt, gestopten uitgezonderd — en
   staat de verdeling eronder. Elke nulstand heeft hier zijn eigen zin. */
function kpisHtml(G){
  const nu = vandaag();
  const maandag = maandagVan(nu);
  const volgendeMaandag = plusDagen(maandag, 7);
  const volgendeZondag  = plusDagen(maandag, 13);
  const volgendeWeek = G.later.filter(c => dag(c.start) >= volgendeMaandag && dag(c.start) <= volgendeZondag).length;
  const dezeWeekBegonnen = G.dezeWeek.filter(c => dag(c.start) <= nu).length;
  const nogTeGaan = G.dezeWeek.length - dezeWeekBegonnen;

  /* Lopend = alles wat dit scherm bewaakt, min de gestopten. Ook wie nog moet
     beginnen telt mee: het contract is getekend, de fee loopt en er is werk
     aan die persoon. Wie hier alleen de mensen op de vloer telt, ziet in een
     rustige maand nul staan terwijl er tien mensen klaarstaan. */
  const lopend = G.geenDatum.length + G.dezeWeek.length + G.later.length + G.netGestart.length + G.werk.length;
  const aanHetWerk = G.netGestart.length + G.werk.length + dezeWeekBegonnen;
  const moetNogStarten = lopend - aanHetWerk;

  return `<div class="grid c4 pl-kpi">
    ${CRM.ui.kpi('Deze week', String(G.dezeWeek.length),
      !G.dezeWeek.length ? 'er start deze week niemand'
      : nogTeGaan ? nogTeGaan + ' moet' + (nogTeGaan === 1 ? '' : 'en') + ' nog beginnen'
      : (G.dezeWeek.length === 1 ? 'is al begonnen' : 'allemaal al begonnen'))}
    ${CRM.ui.kpi('Volgende week', String(volgendeWeek),
      volgendeWeek ? 'start gepland' : 'nog niets gepland')}
    ${CRM.ui.kpi('Zonder startdatum', String(G.geenDatum.length),
      G.geenDatum.length ? 'getekend, datum onbekend' : 'alle plaatsingen hebben een datum')}
    ${CRM.ui.kpi('Lopende plaatsingen', String(lopend),
      !lopend ? 'nog geen lopende plaatsingen'
      : aanHetWerk + ' aan het werk · ' + moetNogStarten + ' moet' + (moetNogStarten === 1 ? '' : 'en') + ' nog starten')}
  </div>`;
}

/* ─── Tekenen ────────────────────────────────────────────────────
   De lijsten zitten in een eigen div. Na het afvinken van een contactmoment
   wordt alleen die div opnieuw gevuld, niet het hele scherm: de zoekbalk
   staat in de paginakop en zou anders zijn inhoud en de cursor kwijtraken
   midden in het opzoeken van iemand. */
function teken(){
  const wrap = M.mount && M.mount.querySelector('#pl_lijsten');
  if(!wrap) return;
  bouwIndex();
  const G = indeel();
  const mk = lijst => lijst.filter(past).map(c => regel(c));
  const rDezeWeek = mk(G.dezeWeek), rLater = mk(G.later), rNet = mk(G.netGestart),
        rWerk = mk(G.werk), rGeen = mk(G.geenDatum), rStop = mk(G.gestopt);
  const gefilterd = S.zoek.trim() || S.mijn;

  /* De tellers gaan over de hele stand, niet over wat er na een zoekopdracht
     nog zichtbaar is: ze zijn de samenvatting van het scherm, en die hoort
     niet mee te bewegen met een zoekterm die je zo weer wist. */
  const kpi = M.mount.querySelector('#pl_kpi');
  if(kpi) kpi.innerHTML = kpisHtml(G);

  let uit = '';

  /* Bovenaan, en alleen als hij niet leeg is. Een lege kop "Getekend zonder
     startdatum · 0" zou elke dag om aandacht vragen voor een probleem dat er
     niet is; dan leest niemand hem nog op de dag dat het er wél toe doet. */
  if(rGeen.length) uit += sectie({
    id:'pl_geen', titel:'Getekend zonder startdatum', aantal:rGeen.length,
    uitleg:'Deze mensen hebben getekend, maar er staat nergens wanneer ze beginnen. Zolang die datum ontbreekt komen ze op geen enkele lijst voor en belt niemand ze — bel de klant en zet de datum erin.',
    inhoud: rGeen.map(rijHtml).join('')
  });

  uit += sectie({
    id:'pl_week', titel:'Deze week starten', aantal:rDezeWeek.length,
    uitleg:'Maandag tot en met zondag van deze week. Ook wie maandag al begonnen is staat hier — de vraag van deze week hoort bij deze week.',
    inhoud: rDezeWeek.length ? rDezeWeek.map(rijHtml).join('')
      : geenHtml(gefilterd ? 'Niemand die aan je filter voldoet start deze week.' : 'Deze week begint er niemand.')
  });

  uit += sectie({
    id:'pl_later', titel:'Later gepland', aantal:rLater.length,
    uitleg:'Getekend, startdatum in de toekomst. Dit is de periode waarin een tegenbod binnenkomt: het ritme houdt ze wekelijks warm tot de eerste dag.',
    inhoud: rLater.length ? weekGroepenHtml(rLater)
      : geenHtml(gefilterd ? 'Niemand die aan je filter voldoet staat gepland.' : 'Er staat verder niemand gepland.')
  });

  uit += sectie({
    id:'pl_net', titel:'Net gestart', aantal:rNet.length,
    uitleg:'De eerste ' + NET_GESTART_DAGEN + ' dagen. Hier komt vrijwel alle uitval vandaan, dus hier hoort de nazorg zichtbaar te zijn.',
    inhoud: rNet.length ? rNet.map(rijHtml).join('')
      : geenHtml(gefilterd ? 'Niemand die aan je filter voldoet is net gestart.' : 'Er is de afgelopen maand niemand gestart.')
  });

  uit += sectie({
    id:'pl_werk', titel:'Aan het werk', aantal:rWerk.length, klapbaar:true, open:werkOpen(),
    uitleg:'Langer dan ' + NET_GESTART_DAGEN + ' dagen aan het werk. Naslag — het ritme loopt hier maandelijks door tot een jaar na de start. Zoek bovenin als je iemand zoekt.',
    inhoud: rWerk.length ? tabelHtml(rWerk, false)
      : geenHtml(gefilterd ? 'Niemand die aan je filter voldoet.' : 'Nog niemand langer dan een maand aan het werk.')
  });

  /* Gestopt hoort er niet bij en verdwijnt toch niet. Wie hier niets zag zou
     denken dat de persoon nog werkt; wie hem tussen de rest zag staan ook. */
  if(rStop.length) uit += sectie({
    id:'pl_stop', titel:'Gestopt', aantal:rStop.length, klapbaar:true, open:false,
    uitleg:'Deze plaatsingen zijn beëindigd. Ze staan hier zodat je ze niet per ongeluk als lopend meetelt — verder is er niets meer aan te doen.',
    inhoud: tabelHtml(rStop, true)
  });

  wrap.innerHTML = uit;

  /* De optelsom onderaan. Dit is geen sierstuk maar de controle waar dit
     scherm op staat of valt: alles wat op fase 'Contract getekend' of
     'Gestart' staat hoort hierboven te staan, want er is geen ander scherm
     meer waar die mensen op voorkomen. Klopt het niet, dan zie je het hier —
     en niet pas als er iemand niet komt opdagen. */
  const zichtbaar = rDezeWeek.length + rLater.length + rNet.length + rWerk.length + rGeen.length + rStop.length;
  wrap.insertAdjacentHTML('beforeend', `<p class="pl-tel meta num">${
    gefilterd
      ? h(zichtbaar + ' van ' + G.totaal + ' plaatsingen zichtbaar — je filtert.')
      : h(G.totaal + ' plaatsingen, allemaal hierboven ingedeeld.')
  }</p>`);
}

/* ─── Startdatum invullen ────────────────────────────────────────
   De enige schrijfactie op dit scherm, en hij staat er niet voor niets: een
   getekende kandidaat zonder startdatum is precies het gat waar dit scherm
   voor bestaat, en die naar de kandidatenkaart sturen om daar één veld te
   vullen betekent in de praktijk dat het niet gebeurt.
   In demo-modus gaat er niets naar de database — alleen CRM.state. */
function startdatumVenster(id){
  const c = CRM.kandidaat(id);
  if(!c) return;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Startdatum invullen</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)}${c.klant ? ' · ' + h(c.klant) : ''}</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="pl_dat">Eerste werkdag</label>
        <input type="date" id="pl_dat" value="">
        <span class="hint">Zodra deze datum er staat, komt de kandidaat op de juiste lijst en loopt het warm-houden vanzelf mee.</span></div>
    </div>
    <div class="modal-f">
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="pl_ok">Opslaan</button>
    </div>`, {onOpen(mo){
    const inp = mo.querySelector('#pl_dat');
    mo.querySelector('#pl_ok').onclick = async () => {
      const iso = dag(inp.value);
      if(!parse(iso)) return CRM.toast('Kies een geldige datum','err');
      CRM.modal.close();
      await bewaarStart(c, iso);
    };
  }});
}

async function bewaarStart(c, iso){
  const rij = (CRM.state.cands || []).find(x => String(x.id) === String(c.id));
  const oud = rij ? rij.start : '';
  if(rij) rij.start = iso;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update({start:iso}).eq('id', c.id);
    if(error){ if(rij) rij.start = oud; teken(); return CRM.fout('Opslaan mislukt', error); }
  }
  /* Vastleggen dát het is gezet, niet alleen de waarde: bij een kandidaat die
     al weken zonder datum stond is de vraag later "wanneer wisten we dit". */
  try{ await CRM.logActiviteit('kandidaat', c.id, 'notitie', 'Startdatum gezet op ' + CRM.fmtDate(iso)); }
  catch(e){ console.warn('activiteit startdatum', e); }
  CRM.toast('Startdatum opgeslagen','ok');
  teken();
  CRM.navBadges && CRM.navBadges();
}

/* ─── Klikken ────────────────────────────────────────────────────
   Gedelegeerd op de wrapper: de lijsten worden herhaaldelijk opnieuw gevuld,
   en losse handlers per regel zouden daar elke keer opnieuw aan moeten. */
function bind(){
  const wrap = M.mount.querySelector('#pl_lijsten');
  wrap.onclick = e => {
    const klap = e.target.closest('[data-klap]');
    if(klap){
      if(klap.dataset.klap === 'pl_werk') zetWerkOpen(!werkOpen());
      else {
        /* Alleen "Aan het werk" onthoudt zijn stand; Gestopt klapt per keer
           open. Die groep hoort geen vaste plek op je scherm te krijgen. */
        const sec = klap.closest('.pl-sec');
        const body = sec && sec.querySelector('.card-b');
        if(body){ body.remove(); klap.textContent = 'Uitklappen'; return; }
        const G = indeel();
        const rijen = G.gestopt.filter(past).map(c => regel(c));
        sec.insertAdjacentHTML('beforeend', `<div class="card-b">
          <p class="sub pl-uit">Deze plaatsingen zijn beëindigd. Ze staan hier zodat je ze niet per ongeluk als lopend meetelt — verder is er niets meer aan te doen.</p>
          ${tabelHtml(rijen, true)}</div>`);
        klap.textContent = 'Inklappen';
        return;
      }
      teken();
      return;
    }

    /* Een openstaand contactmoment afvinken gaat via dezelfde ingang als op
       het dashboard en de kandidatenkaart: CRM.opvolging.actie() kiest zelf
       het juiste venster (felicitatiemail, berichtje, check-in). Zou dit
       scherm daar iets eigens voor bouwen, dan zou hetzelfde belletje op twee
       plekken anders worden vastgelegd. */
    const opv = e.target.closest('[data-opv]');
    if(opv){
      e.stopPropagation();
      const [id, key] = String(opv.dataset.opv).split('|');
      const k = CRM.kandidaat(id);
      if(k && CRM.opvolging) CRM.opvolging.actie(k, key, () => { teken(); CRM.navBadges && CRM.navBadges(); });
      return;
    }

    const sd = e.target.closest('[data-startdatum]');
    if(sd){ e.stopPropagation(); startdatumVenster(sd.dataset.startdatum); return; }

    const kaart = e.target.closest('[data-kaart]');
    if(kaart) CRM.ga('kandidaten', {id:kaart.dataset.kaart});
  };
  /* Een regel is een knop, dus hij hoort ook op Enter en spatie te openen. */
  wrap.onkeydown = e => {
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const kaart = e.target.closest('.pl-r[data-kaart]');
    if(!kaart) return;
    e.preventDefault();
    CRM.ga('kandidaten', {id:kaart.dataset.kaart});
  };
}

/* ─── Module ─────────────────────────────────────────────────── */
CRM.registerModule('plaatsingen', {
  title:'Plaatsingen', icon:'◉',
  onderschrift:'Wie er start, wie net begonnen is en wie er werkt',
  /* De badge telt wat er vandaag mis kan gaan: mensen die deze week nog
     moeten beginnen plus getekende kandidaten zonder startdatum. Bewust niet
     alle openstaande contactmomenten — die staan al op het dashboard, en
     hetzelfde werk twee keer tellen maakt beide getallen waardeloos. */
  badge(){
    try{
      const nu = vandaag(), maandag = maandagVan(nu), zondag = plusDagen(maandag, 6);
      let n = 0;
      CRM.kandidaten().forEach(c => {
        if(!CRM.faseIn(c.fase, CRM.PLACED) || c.gestoptOp) return;
        const s = dag(c.start);
        if(!parse(s)) n++;
        else if(s >= nu && s <= zondag) n++;
      });
      return n;
    }catch(e){ return 0; }
  },
  render(mount, acties){
    M.mount = mount;
    mount.innerHTML = `${CRM.laadfoutHtml()}
      <div class="pl-wrap">
        <div id="pl_kpi"></div>
        <div class="stack" id="pl_lijsten"></div>
      </div>`;

    if(acties) acties.innerHTML = `
      <div class="searchbox"><input type="search" id="pl_zoek" placeholder="Zoek naam, klant of functie"
        value="${h(S.zoek)}" aria-label="Zoeken in plaatsingen"></div>
      ${CRM.me() ? `<button type="button" class="chip btn-like${S.mijn ? ' on' : ''}" id="pl_mijn"
        aria-pressed="${S.mijn ? 'true' : 'false'}">Alleen van mij</button>` : ''}`;

    const zoek = document.getElementById('pl_zoek');
    if(zoek) zoek.oninput = CRM.debounce(() => { S.zoek = zoek.value; teken(); }, 200);
    const mijn = document.getElementById('pl_mijn');
    if(mijn) mijn.onclick = () => {
      S.mijn = !S.mijn;
      mijn.classList.toggle('on', S.mijn);
      mijn.setAttribute('aria-pressed', S.mijn ? 'true' : 'false');
      teken();
    };
    const herlaad = document.getElementById('crm_herlaad');
    if(herlaad) herlaad.onclick = () => CRM.herlaad();

    bind();
    teken();
  }
});

})();

/* VERZOEK AAN CORE: ---------------------------------------------------------
   1. `CRM.PLACED` bevat de twee fases ná de handtekening, maar er is geen
      gedeelde helper voor "dit is een lopende plaatsing" (in PLACED én niet
      gestopt). Die vraag wordt nu in js/data.js, js/opvolging.js, js/finance.js
      en hier elk apart uitgeschreven als `CRM.faseIn(c.fase, CRM.PLACED) &&
      !c.gestoptOp`. Eén `CRM.loopt(c)` in data.js zou voorkomen dat die vier
      een keer uit elkaar lopen — precies het soort verdubbeling waar
      js/opvolging.js voor is gemaakt.

   2. Weekrekenen (maandagVan / isoWeek / weekLabel) staat nu letterlijk in
      js/pijplijn.js en in dit bestand, met dezelfde uitkomst. Zodra een derde
      module weekkoppen wil, is dat drie keer. Kandidaat voor core.js naast
      CRM.fmtDay/CRM.geleden: `CRM.week.maandag(iso)`, `CRM.week.label(iso)`.

   3. `CRM.geleden()` geeft voor de toekomst "over 3 dagen" maar heeft geen
      "morgen" — die staat er alleen voor het verleden ("gisteren"). Op dit
      scherm is "over 1 dagen" de tekst die je het vaakst leest, want dat is
      de dag waarop een AM iemand nog moet voorbereiden. Voorstel: in core
      naast `n===1 → 'gisteren'` ook `n===-1 → 'morgen'`.

   4. Er is geen gedeelde manier om één veld van een kandidaat weg te
      schrijven; elke module bouwt zijn eigen `CRM.sb.from('candidates')
      .update({...})` mét demo-controle (js/kandidaten.js, js/recruitment.js,
      js/source.js en nu ook dit bestand). Vier kopieën van dezelfde
      demo-guard is drie te veel: `CRM.bewaarKandidaat(id, patch)` in data.js
      zou dat op één plek zetten.
   -------------------------------------------------------------------------- */
