/* ═══════════════════════════════════════════════════════════════
   MODULE: KANDIDATEN
   De kaartenbak: bladeren door alle kandidaten (vrij zoeken, status,
   sortering, mijn kandidaten) + de kandidatenkaart met het complete
   profiel, ster-beoordeling en CV-verrijking met conflictmarkering.
   Het uitgebreide zoeken op eigenschappen (ploegendienst, taal, vervoer,
   rijbewijs, reisafstand, recruiter, klant, fase, meerdere functies) woont
   sinds 1 aug 2026 in Sourcing — zie js/source.js; dit scherm verwijst
   ernaar met CRM.ga('source', {modus:'zoek', q:…}).

   Sinds 30 jul 2026 is dit ook wat een klik op een bordkaart opent
   (wens Tjeerd) — niet meer het smalle bewerkpaneel van het oude
   pijplijnbord. De blokken "Traject" en "Contract & salaris" hieronder
   zijn daarvoor van die drawer hierheen verhuisd. De poortwachters bij
   een fasewissel blijven in js/recruitment.js wonen; deze kaart roept
   ze aan via CRM.kandidaatFasePicker/-Uitval/-NoShow/-Intake, zodat de
   regels maar op één plek bestaan.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const h = CRM.h;
/* Gedeelde flows uit recruitment.js (laadt vóór dit bestand). */
const D = () => CRM._rcDeel || {};

/* ─── Filters onthouden (één sleutel: crm_kand_filters) ───────── */
const FKEY = 'crm_kand_filters';
/* Sinds 1 aug 2026 is dit scherm de rustige kaartenbak: bladeren, iemand
   vinden, kaart openen. Het samenstellen van een zoekopdracht (ploegendienst,
   taal, vervoer, rijbewijs, radius, recruiter, klant, fase, meerdere functies)
   woont in Sourcing — dat gaat óók over kandidaten, en één plek waar je zoekt
   is beter dan twee die elkaar half overlappen.

   Wat hier overblijft kun je allemaal zien staan: vrij zoeken, status,
   sortering en "mijn kandidaten". Dat is geen opruimactie maar een
   veiligheidsregel. Gisteren waren 350 van de 355 kandidaten onzichtbaar door
   een filter dat nergens meer op het scherm stond; wie de lijst opent moet uit
   het scherm zelf kunnen aflezen waaróm hij niet compleet is. */
const F_STD = {
  zoek:'', status:'alle', mijn:false, sort:'gesproken', splits:'functie'
};
/* Alleen deze sleutels mogen uit de opslag terugkomen. Bij het hele team
   staan er nog waarden van weggehaalde velden in localStorage (ploegen,
   functie, plaats, fase…); zonder deze zeef zou zo'n waarde blijven filteren
   zonder dat er een veld is om hem uit te zetten. Wat je niet kunt zien, mag
   niet meefilteren. `_eigenKeuze` is geen filter maar hoort er wel bij. */
const F_TOEGESTAAN = Object.keys(F_STD).concat('_eigenKeuze');
let F = (() => {
  const stand = Object.assign({}, F_STD);
  try{
    const bewaard = JSON.parse(localStorage.getItem(FKEY)||'{}');
    /* De oude default 'gekwalificeerd' (vijf mensen) is bij iedereen in
       localStorage beland, ook bij wie hem nooit zelf koos. Die ene waarde
       eenmalig terugzetten; een status die je zelf koos blijft staan. */
    if(bewaard.status === 'gekwalificeerd' && !bewaard._eigenKeuze) delete bewaard.status;
    Object.keys(bewaard).forEach(k => { if(F_TOEGESTAAN.includes(k)) stand[k] = bewaard[k]; });
  }catch(e){}
  /* Meteen opgeschoond terugschrijven, zodat de oude sleutels ook echt weg
     zijn en niet bij een volgende wijziging alsnog opduiken. */
  try{
    localStorage.setItem(FKEY, JSON.stringify(stand));
    localStorage.removeItem('crm_kand_meer');   // stand van het verdwenen paneel
  }catch(e){}
  return stand;
})();
function zet(k,v){ F[k]=v;
  if(k === 'status') F._eigenKeuze = true;   // zie de opmerking hierboven
  try{ localStorage.setItem(FKEY, JSON.stringify(F)); }catch(e){} }

/* De uitsplitsing van de voorraad staat dicht: het is achtergrond bij het
   getal, geen vraag die je elke keer stelt. */
let uitsplitsingOpen = false;

/* Microsoft-koppeling van déze gebruiker. Staat die uit, dan verschijnen
   de Outlook-onderdelen op de kaart helemaal niet. */
const outlookAan = () => !!(CRM.outlook && CRM.outlook.beschikbaar?.() && CRM.outlook.verbonden?.());
/* Voor het videocall-venster telt maar één vraag: schrijft dit straks
   rechtstreeks in de agenda, of opent Outlook met een deeplink? */
const agendaGekoppeld = () => !!(CRM.outlook && CRM.outlook.verbonden?.()
  && (CRM.outlook.beschikbaar ? CRM.outlook.beschikbaar() : true));

/* ─── Golden candidates ───────────────────────────────────────────
   Goede kandidaten waar nú geen passende vacature voor is — die
   verliezen we anders uit het oog. De vlag leeft in candidates.golden
   (schema.sql); CRM.rowToCand kent dat veld (nog) niet, dus we lezen
   en schrijven op de ruwe rij in CRM.state.cands. Golden betekent
   "onthouden", niet "inactief": de vlag mag blijven staan als iemand
   later alsnog aan een vacature gekoppeld wordt. */
const isGolden = id => {
  const r = CRM.state.cands.find(x => String(x.id) === String(id));
  return !!(r && r.golden);
};
const goldenIds = () => new Set(CRM.state.cands.filter(r => r.golden).map(r => String(r.id)));
async function zetGolden(id, aan){
  const r = CRM.state.cands.find(x => String(x.id) === String(id));
  if(!r) return false;
  r.golden = !!aan;
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update({golden:!!aan}).eq('id', id);
    if(error){ r.golden = !aan; CRM.fout('Opslaan mislukt', error); return false; }
  }
  await CRM.logActiviteit('kandidaat', id, 'systeem',
    aan ? 'Gemarkeerd als golden candidate' : 'Golden candidate-markering weggehaald');
  CRM.toast(aan ? 'Golden candidate — blijft vindbaar met de ster' : 'Golden-markering weggehaald', 'ok');
  return true;
}
const goldenSter = klasse => `<span class="kd-goldster ${klasse||''}" title="Golden candidate">★</span>`;
const faseChip = (fase, extra='') => fase
  ? `<span class="chip ${extra}"><i class="dot" style="background:${CRM.faseKleur(fase)}"></i>${h(CRM.faseNorm(fase))}</span>` : '';
const telLink = t => 'tel:' + String(t||'').replace(/[^0-9+]/g,'');
const waLink  = t => { let n = String(t||'').replace(/[^0-9]/g,''); if(n.startsWith('06')) n = '31'+n.slice(1); if(n.startsWith('00')) n = n.slice(2); return 'https://wa.me/'+n; };
/* Alleen echte weblinks openen — een `javascript:`-URL in een CV-veld mag
   niet uitgevoerd worden als iemand erop klikt. */
const veiligeUrl = u => { const s = String(u||'').trim(); return /^(https?:|blob:)/i.test(s) ? s : ''; };

/* Waaróm past deze kandidaat bij deze vacature? */
function uitleg(c, v){
  const delen = [];
  const woorden = s => String(s||'').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
  const kf = new Set([...woorden(c.functie), ...woorden(c.cv && c.cv.functie),
    ...((c.cv && c.cv.skills) || []).map(s => String(s).toLowerCase())]);
  const overlap = [...new Set(woorden(v.functie).filter(w => kf.has(w)))];
  if(overlap.length) delen.push('zelfde functiewoorden (' + overlap.join(', ') + ')');
  else if(c.functie) delen.push('zoekt ' + c.functie.toLowerCase());

  const plaats = v.locatie || '';
  if(c.woonplaats && plaats){
    const km = CRM.afstandKm(c.woonplaats, plaats);
    if(CRM.plaatsSleutel(c.woonplaats) === CRM.plaatsSleutel(plaats)) delen.push('woont in ' + c.woonplaats + ' — zelfde plaats');
    else if(km != null) delen.push('woont in ' + c.woonplaats + ' — ' + km + ' km');
    else delen.push('woont in ' + c.woonplaats);
  }
  if(c.cv && c.cv.ervaringJaren) delen.push(c.cv.ervaringJaren + ' jaar ervaring');
  const zin = delen.join(' · ');
  return zin ? zin.charAt(0).toUpperCase() + zin.slice(1) : 'Op basis van de gezochte functie.';
}

/* Suggesties: eerst de matches van core, aangevuld met vacatures dichtbij. */
function kansen(c){
  const uit = CRM.besteMatches(c, 5).slice();
  if(uit.length < 3 && c.woonplaats){
    const gehad = new Set(uit.map(m => String(m.vacature.id)));
    CRM.state.vacs.forEach(v => {
      if(gehad.has(String(v.id)) || (v.status && v.status !== 'Open')) return;
      const km = CRM.afstandKm(c.woonplaats, v.locatie);
      const score = CRM.matchScore(c, v);
      if(km != null && km <= 25 && score >= 20)
        uit.push({vacature:v, score, dichtbij:true, m: CRM.match ? CRM.match(c, v) : null});
    });
  }
  return uit.map(m => Object.assign({}, m, {km:CRM.afstandKm(c.woonplaats, m.vacature.locatie)}))
    .sort((a,b) => b.score - a.score).slice(0,5);
}

/* ═══════════════════════════════════════════════════════════════
   WAT HET SYSTEEM AL WEET BIJ EEN VOORSTEL  (CRM.kdHistorie)

   Op het moment dat je iemand bij een klant voorstelt, staat elders in
   deze app al op het scherm dat die persoon ergens anders loopt, dat
   déze klant hem eerder liet afvallen, of dat de vacature al vol is.
   Dat werd nergens bij elkaar gebracht. Hier wel — drie vragen, drie
   antwoorden, en alleen uit velden die daadwerkelijk zijn vastgelegd:

     1. loopt deze persoon al ergens anders, en in welke fase?
        → fase + klant + since op de kaart zelf.
     2. is deze persoon eerder bij DEZE klant afgevallen of gestopt?
        → afval_categorie / stop_categorie op een kaart van dezelfde
          persoon bij dezelfde klant. "Dezelfde persoon" komt uit
          candidates.herstart_van — het veld dat js/recruitment.js zet
          bij heraanbieden. Dat is een vastgelegde koppeling, geen gok
          op naam of telefoonnummer.
     3. is deze vacature al vol? → CRM.vacBezetting uit js/hot.js, zodat
        dit getal nooit iets anders zegt dan het Openstaand-overzicht.

   Waarschuwen, niet blokkeren: iemand opnieuw voorstellen bij een klant
   die hem eerder afwees kan een prima zet zijn. De app vertelt het,
   en laat de knop staan.

   Snelheid: één index per tekenronde (zelfde patroon als js/hot.js).
   Er wordt bewust GEEN activiteitenlijst doorlopen — die telt duizenden
   rijen en levert alleen vrije tekst op. Kosten: één pass over de
   kandidaten.                                                        */
(function(){
  let IX = null;
  function ix(){
    if(IX) return IX;
    const t0 = (window.performance && performance.now) ? performance.now() : 0;
    const alle = CRM.kandidaten();
    const perId = new Map(), kind = new Map();
    alle.forEach(k => {
      perId.set(String(k.id), k);
      const ouder = String(k.herstartVan || '');
      if(!ouder) return;
      const r = kind.get(ouder); if(r) r.push(k); else kind.set(ouder, [k]);
    });
    IX = {perId, kind, n:alle.length,
          ms:((window.performance && performance.now) ? performance.now() : 0) - t0};
    Promise.resolve().then(() => { IX = null; });   // geldig binnen één tick
    return IX;
  }

  /* Alle kaarten van dezelfde persoon: omhoog via herstartVan, omlaag via
     de kaarten die naar deze wijzen. De gezien-set is er niet voor de
     sierlijkheid — een herstart_van die (door een import) naar zichzelf of
     in een kringetje wijst zou anders de hele kaart laten hangen. */
  function keten(c){
    const {perId, kind} = ix();
    const uit = [], gezien = new Set();
    (function loop(k){
      if(!k || gezien.has(String(k.id))) return;
      gezien.add(String(k.id)); uit.push(k);
      if(k.herstartVan) loop(perId.get(String(k.herstartVan)));
      (kind.get(String(k.id)) || []).forEach(loop);
    })(c);
    return uit;
  }

  /* Loopt er op deze kaart nog iets? Voorgesteld t/m Contract ondertekenen
     telt, en een plaatsing waar nog geen stopdatum bij staat ook. */
  const looptNu     = k => !!k.fase && CRM.faseIdx(k.fase) >= 0 && !CRM.faseIn(k.fase, CRM.DONE);
  const geplaatstNu = k => CRM.faseIn(k.fase, CRM.PLACED) && !k.gestoptOp;
  const isUitval    = k => CRM.faseIs(k.fase, 'Afgevallen') || CRM.faseIs(k.fase, 'Gestopt');

  /* Het lopende of gestarte traject van deze persoon, ongeacht bij wie.
     Een plaatsing weegt zwaarder dan een lopend gesprek, dus die eerst. */
  function lopendTraject(c){
    if(!c) return null;
    const kaarten = keten(c).filter(k => k.klant && (looptNu(k) || geplaatstNu(k)));
    if(!kaarten.length) return null;
    const k = kaarten.find(geplaatstNu) || kaarten[0];
    return {klant:k.klant, fase:CRM.faseNorm(k.fase), geplaatst:geplaatstNu(k),
            sinds:k.since || '', zelfdeKaart:String(k.id) === String(c.id),
            klantBestaat: !!CRM.klant(k.klant)};
  }

  /* Wie wees af? Dat staat in de gegevens en verzinnen we er niet bij.
     Deze twee categorieën zijn de klant; de rest is de kandidaat zelf of
     een reden waar geen partij aan hangt. Zelfde lijst als de
     contactpersoonkaart gebruikt (js/contactkaart.js). */
  const AFWIJS_KLANT = ['Klant wees af','Meeloopdag niet goed'];

  /* Eerdere afgeronde trajecten van deze persoon bij DEZE klant.
     Nieuwste eerst; twee keer bij dezelfde klant afgevallen levert dus
     ook twee regels op. */
  function eerderBij(c, klant){
    if(!c || !klant) return [];
    return keten(c)
      .filter(k => isUitval(k) && k.klant && CRM.zelfdeKlant(k.klant, klant))
      .map(k => {
        const gestopt = CRM.faseIs(k.fase, 'Gestopt');
        const reden = (gestopt ? k.stopCat : k.afvalCat) || '';
        const doorKlant = gestopt ? k.stopDoor === 'klant' : AFWIJS_KLANT.includes(k.afvalCat);
        return {
          klant:k.klant, gestopt, reden, doorKlant,
          offerAf: !gestopt && k.afvalType === 'offer_afgewezen',
          wanneer: k.gestoptOp || k.since || '',
          herbruikbaar: k.recyclebaar,
          zelfdeKaart: String(k.id) === String(c.id)
        };
      })
      .sort((a,b) => String(b.wanneer).localeCompare(String(a.wanneer)));
  }

  /* Eén zin over zo'n eerdere uitkomst. Geen "hij" of "hem": we weten het
     geslacht niet en het staat nergens vastgelegd. */
  function eerderZin(e){
    const kop = e.gestopt
      ? (e.doorKlant ? 'Deze klant beëindigde het contract eerder'
                     : 'Eerder hier gestart en weer gestopt')
      : e.doorKlant ? 'Deze klant wees deze persoon eerder af'
      : e.offerAf   ? 'Eerder hier het aanbod niet geaccepteerd'
                    : 'Eerder hier afgevallen';
    /* 'Klant wees af' als reden achter "Deze klant wees deze persoon eerder
       af" is twee keer hetzelfde. De categorie voegt dan niets toe. */
    const dubbel = e.reden === 'Klant wees af';
    const staart = [
      dubbel ? '' : (e.reden ? e.reden.toLowerCase() : 'geen reden vastgelegd'),
      e.wanneer ? CRM.fmtDate(e.wanneer) : ''
    ].filter(Boolean).join(' · ');
    return staart ? kop + ' — ' + staart : kop;
  }

  /* De bezetting komt uit js/hot.js, zodat de kandidatenkaart en het
     Openstaand-overzicht nooit een ander aantal noemen. Is die module er
     niet, dan zeggen we hierover niets in plaats van zelf te gaan tellen. */
  const bezetting = v => (v && CRM.vacBezetting) ? CRM.vacBezetting(v) : null;

  /* Zit deze persoon al op deze vacature? Op vacature_id, met dezelfde
     terugval op klant + functie die js/hot.js gebruikt voor kaarten uit de
     oude ATS-import. */
  function alGekoppeld(c, v){
    if(!c || !v) return false;
    if(c.vacatureId && String(c.vacatureId) === String(v.id)) return true;
    return !c.vacatureId && !!c.klant && !!c.functie
        && CRM.zelfdeKlant(c.klant, v.klant) && c.functie === v.functie;
  }

  /* De drie waarschuwingen bij één kandidaat-vacaturecombinatie, in de
     volgorde waarin ze ertoe doen. Bewust kort gehouden: bij elke naam drie
     chips leest niemand meer. */
  function signalen(c, v){
    const uit = [];
    if(!c || !v) return uit;
    if(alGekoppeld(c, v)){
      uit.push({k:'gekoppeld', kleur:'green', tekst:'staat al op deze vacature'});
      return uit;                       // de rest is dan niet meer het punt
    }
    const lp = lopendTraject(c);
    if(lp && !CRM.zelfdeKlant(lp.klant, v.klant))
      uit.push({k:'elders', kleur:'amber',
        tekst:(lp.geplaatst ? 'werkt al bij ' : 'loopt al bij ') + lp.klant
              + ' — ' + lp.fase + (lp.sinds ? ' sinds ' + CRM.fmtDateShort(lp.sinds) : '')});
    const eer = eerderBij(c, v.klant);
    if(eer.length)
      uit.push({k:'eerder', kleur:'amber',
        tekst:eerderZin(eer[0]) + (eer.length > 1 ? ' (en ' + (eer.length-1) + ' keer eerder)' : '')});
    const b = bezetting(v);
    if(b && !b.teVullen)
      uit.push({k:'vol', kleur:'amber',
        tekst:'deze vacature is vol — ' + b.geplaatst + ' van ' + b.gevraagd + ' '
              + (b.gevraagd === 1 ? 'positie' : 'posities') + ' gevuld'
              + (b.aantalBekend ? '' : ', aantal niet ingevuld')});
    return uit;
  }

  CRM.kdHistorie = {ververs(){ IX = null; }, keten, lopendTraject, eerderBij, eerderZin,
                    alGekoppeld, signalen, meting(){ return {n:ix().n, ms:ix().ms}; }};
})();

/* ─── Reisafstand tot de werkplek ─────────────────────────────────
   "Reistijd/afstand" en "Reistijd/vervoer" zijn vaste uitvalcategorieën
   (CRM.AFVAL_CATS en CRM.STOP_CATS in js/data.js). Dan wil je die afstand
   niet pas lezen in de uitvalreden, maar op de kaart zien vóór de plaatsing.

   Welke werkplek: de locatie van de gekoppelde vacature, en anders die van
   de klant. In productie is vacatures.locatie bij álle vacatures leeg, dus
   de terugval op de klant is de normale route — niet de uitzondering.
   Levert geen van beide een plaats op die in CRM.PLAATSEN staat, dan tonen
   we niets. Een gegokte afstand is erger dan geen afstand. */
function werkplek(c){
  const v = c.vacatureId ? CRM.state.vacs.find(x => String(x.id) === String(c.vacatureId)) : null;
  const uitVac = String((v && v.locatie) || '').trim();
  if(uitVac) return {plaats:uitVac, via:'vacature'};
  const k = c.klant ? CRM.klant(c.klant) : null;
  /* Zelfde terugval als de klantkaart gebruikt (js/klanten.js): het veld
     `locatie`, en anders de vestigingsplaats uit de SWO-gegevens. */
  const uitKlant = String((k && (k.locatie || k.plaats)) || '').trim();
  return uitKlant ? {plaats:uitKlant, via:'klant'} : null;
}

/* Hooguit één zachte waarschuwing, en de grens is niet zelfbedacht: hij komt
   uit CRM.matchScore in js/data.js. Die weegt reisafstand in banden en laat
   hem boven 45 km hélemaal wegvallen — verder dan dat telt de afstand in dit
   systeem al nergens meer mee. Zonder eigen auto knelt het eerder; daar houden
   we de band eronder aan (30 km), de laatste die daar noemenswaardig scoort.
   Dus geen nieuwe norm — dezelfde die de matching al hanteert. */
const REIS_VER = 45, REIS_VER_ZONDER_AUTO = 30;
function reisafstandRij(c){
  const w = werkplek(c);
  if(!String(c.woonplaats || '').trim() || !w) return '';
  const km = CRM.afstandKm(c.woonplaats, w.plaats);
  if(km == null) return '';
  const zonderAuto = !!c.vervoer && c.vervoer !== 'auto';
  const ver = km >= (zonderAuto ? REIS_VER_ZONDER_AUTO : REIS_VER);
  const waarde = km === 0
    ? `zelfde plaats — ${h(w.plaats)}`
    : `± <span class="num">${km}</span> km naar ${h(w.plaats)}`;
  return `<div class="kd-veld"><span class="label">Reisafstand</span>
    <span>${waarde}
      <span class="meta">${w.via === 'vacature' ? 'werkplek uit de vacature' : 'vestiging van de klant'}</span>${ver ? `
      <span class="chip amber kd-reisver" title="Reistijd is een van de vaste uitvalredenen — bespreek het vóór de plaatsing">${
        zonderAuto ? 'ver zonder eigen auto' : 'flinke reisafstand'}</span>` : ''}</span></div>`;
}

/* ─── Laatst gesproken ──────────────────────────────────────────
   Wat telt als contact is precies dezelfde lijst als in js/opvolging.js:
   bellen, appen, mailen, een gesprek of een bezoek. Een notitie, een
   fasewissel, een geüpload document of een systeemregel telt niet — dat is
   werk aan een kaart, geen contact met een mens. Zonder die gelijkschakeling
   zegt het dashboard "drie weken niets gehoord" terwijl dit scherm "gisteren"
   toont, en dan gelooft niemand meer een van beide.

   opvolging.js houdt die lijst nog binnenskamers; zodra hij als
   CRM.opvolging.CONTACT naar buiten komt (zie het verzoek onderaan dit
   bestand) pakt deze regel hem vanzelf op en verdwijnt de kopie.

   Let op: "Videocall ingepland" wordt door de videocallmodal hieronder als
   soort 'gesprek' weggeschreven en telt dus mee. Dat is bewust gelijk aan
   opvolging.js — inplannen is óók contact geweest. */
const CONTACT_SOORTEN = (CRM.opvolging && CRM.opvolging.CONTACT) || ['bel','gesprek','whatsapp','mail','bezoek'];

/* De laatste échte contactmomenten van deze kandidaat: {op, soort} of null. */
function laatstContact(c){
  let uit = null;
  CRM.activiteitenVoor('kandidaat', c.id).forEach(a => {
    if(!a.op || !CONTACT_SOORTEN.includes(a.soort)) return;
    if(!uit || a.op > uit.op) uit = {op:a.op, soort:a.soort};
  });
  return uit;
}
/* Twee verschillende dingen die allebei "lang niet gesproken" heten:
     - er ís gesproken, maar lang geleden  → een belletje waard
     - er is nog nooit gesproken           → een gat in het proces
   Daarom geeft stilte() ze allebei apart terug. `d` is het aantal dagen
   sinds het laatste contact (null als dat er nooit was) en `wacht` is het
   aantal dagen dat iemand al in beeld is. `dagen` is waar de filters en de
   sortering op rekenen: het beste antwoord op "hoe lang wachten we al?",
   dus het contact als dat er is en anders de wachttijd. */
/* Geanonimiseerd = iemand heeft om verwijdering van zijn gegevens gevraagd
   en die zijn gewist (js/kandverwijder.js). De kaart blijft bestaan omdat
   de plaatsing in de cijfers moet blijven kloppen, maar de persoon erachter
   is er niet meer. Zo'n regel mag dus nooit als belsuggestie terugkomen. */
const geanonimiseerd = c => !!(CRM.kandVerwijder && CRM.kandVerwijder.isGeanonimiseerd
  && CRM.kandVerwijder.isGeanonimiseerd(c));

function stilte(c){
  /* Geen stiltemeting op een gewiste kaart: er valt niemand te bellen.
     `dagen: null` houdt deze regel automatisch buiten elk niet-gesproken
     filter en onderaan de bellijst. */
  if(geanonimiseerd(c))
    return {d:null, wacht:null, dagen:null, nooit:false, anon:true, soort:'',
            tekst:'gegevens gewist', kleur:''};
  const l = laatstContact(c);
  const wacht = CRM.dagenGeleden(c.since);
  const kleuren = n => n == null ? '' : n >= 14 ? 'red' : n >= 7 ? 'amber' : '';
  if(l){
    const d = CRM.dagenGeleden(l.op);
    return {d, wacht, dagen:d, nooit:false, anon:false, soort:l.soort,
            tekst:CRM.geleden(l.op), kleur:kleuren(d)};
  }
  return {d:null, wacht, dagen:wacht, nooit:true, anon:false, soort:'',
          tekst:'nooit gesproken', kleur:kleuren(wacht)};
}
function stilteChip(c){
  const s = stilte(c);
  if(s.anon)  return '';
  if(s.nooit) return `<span class="chip ${s.kleur}">Nog nooit gesproken</span>`;
  if(s.d === 0) return '<span class="chip green">Vandaag gesproken</span>';
  return `<span class="chip ${s.kleur}"><span class="num">${s.d}</span> ${s.d === 1 ? 'dag' : 'dagen'} niet gesproken</span>`;
}

/* ─── Opslaan ─────────────────────────────────────────────────── */
async function bewaarKandidaat(c){
  /* Eén kandidaat heeft één veld `klant`. Stel je dezelfde persoon bij een
     tweede klant voor, dan werd de eerste stilzwijgend overschreven: die
     klant raakte een kandidaat kwijt, hun vacature telde er één minder, en
     niemand kreeg bericht. De poort staat hier — op de plek waar élke
     opslag vanuit dit bestand langskomt — en niet bij de knop, want dan
     mis je de routes die er later bij komen. Zie js/traject.js. */
  const oud = CRM.state.cands.find(r => String(r.id) === String(c.id));
  if(oud && oud.klant && c.klant !== oud.klant && CRM.traject &&
     !await CRM.traject.poort(oud, {klant:c.klant, vacatureId:c.vacatureId, functie:c.functie})) return;
  const rij = CRM.candToRow(c);
  const i = CRM.state.cands.findIndex(r => String(r.id) === String(c.id));
  if(i >= 0) Object.assign(CRM.state.cands[i], rij); else CRM.state.cands.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update(rij).eq('id', c.id);
    if(error) return CRM.fout('Opslaan mislukt', error);
  }
  CRM.toast('Opgeslagen','ok');
}
async function bewaarRij(tabel, veld, rij, bestaat){
  if(!Array.isArray(CRM.state[veld])) CRM.state[veld] = [];
  const lijst = CRM.state[veld];
  const i = lijst.findIndex(r => String(r.id) === String(rij.id));
  if(i >= 0) Object.assign(lijst[i], rij); else lijst.unshift(rij);
  if(!CRM.demo){
    const {error} = bestaat
      ? await CRM.sb.from(tabel).update(rij).eq('id', rij.id)
      : await CRM.sb.from(tabel).insert(rij);
    if(error) return CRM.fout('Opslaan mislukt', error);
  }
  CRM.toast('Opgeslagen','ok');
}

/* ═══════════════════════════════════════════════════════════════
   OVERZICHT — kandidatenlijst met filters.
   (Sourcing is een eigen module in de zijbalk geworden — js/source.js.)
   ═══════════════════════════════════════════════════════════════ */
function overzicht(mount, acties){
  acties.innerHTML = '';
  mount.innerHTML = `<div class="stack"><div id="kd_tabwrap"></div></div>`;
  lijstTab(mount.querySelector('#kd_tabwrap'));
}

/* ─── Statusfilter ──────────────────────────────────────────────
   De oude lijst was één platte rij opties die deed alsof ze elkaar
   uitsluiten, en dat doen ze niet: geplaatst zit ín actief lopend, en
   herbruikbare uitval zit ín beschikbaar. In plaats van opties te schrappen
   — er wordt in de praktijk op alle vijf gefilterd — staan ze nu in drie
   groepen, zodat je in de lijst zelf ziet dat het drie vragen zijn:
   wie is er voorradig, wie loopt er, en wie bewaren we voor later.

   De labels zijn kort gehouden sinds dit filter in de balk zelf staat: een
   keuzelijst die op zijn langste optie 320px breed wordt, duwt de rest van
   de balk naar een tweede regel. De groepskoppen dragen de uitleg. */
/* De instroom staat vooraan. Toen de fases van vóór de klant op de
   kandidaatkaart kwamen (3 aug 2026) was er nog nergens een lijst waar die
   mensen in stonden: Recruitment leest de leadtabel, Klanttrajecten begint
   bij Voorgesteld, en hier kon je er niet op filteren. Zet je iemand op
   'Videocall gepland', dan was hij daarna nergens meer terug te vinden —
   precies wat Tjeerd meldde met Goncalo. */
const INSTROOM_OPTS = (CRM.INSTROOM || []).map(p => ({g:'In de instroom', k:'in:'+p.k, lbl:p.k}));
const STATUS_OPTS = [
  {g:'In de instroom',   k:'instroom',    lbl:'Alles vóór de klant'},
  ...INSTROOM_OPTS,
  {g:'De voorraad',      k:'gekwalificeerd', lbl:'Gekwalificeerd'},
  {g:'In een traject',   k:'lopend',      lbl:'Actief lopend'},
  {g:'In een traject',   k:'geplaatst',   lbl:'Geplaatst'},
  {g:'Bewaard voor later', k:'beschikbaar', lbl:'Beschikbaar'},
  {g:'Bewaard voor later', k:'recyclebaar', lbl:'Uitval, herbruikbaar'},
  {g:'Bewaard voor later', k:'golden',    lbl:'Golden candidates ★'},
  {g:'',                 k:'alle',        lbl:'Alle statussen'}
];
const statusLbl = k => (STATUS_OPTS.find(o => o.k === k) || {}).lbl || k;

/* De gekwalificeerde voorraad. CRM.klaarOmVoorTeStellen (js/data.js) doet
   het echte werk: kaart bestaat, intake is gehad, staat nog nergens op het
   klantbord. Hier komt er één regel bij — een kaart waarvan de gegevens op
   verzoek gewist zijn is geen voorraad meer, hoe compleet de fase ook is. */
const gekwalificeerd = c => CRM.klaarOmVoorTeStellen(c) && !geanonimiseerd(c);

/* Doorklik naar het uitgebreide zoeken in Sourcing. De huidige zoekterm gaat
   mee, zodat je niet opnieuw hoeft te typen wat je hier al intypte. */
function naarSourcing(){
  const q = String(F.zoek||'').trim();
  CRM.ga('source', q ? {modus:'zoek', q} : {modus:'zoek'});
}

/* Welke van de overgebleven filters staan aan? Alleen nog gebruikt om een
   lege lijst uit te leggen — de chipsrij eronder is weg, want status en
   "mijn kandidaten" zijn allebei zichtbare knoppen met een eigen stand. */
function actieveFilters(){
  const uit = [];
  if(F.status !== F_STD.status) uit.push({k:'status', lbl:statusLbl(F.status)});
  if(F.mijn)                    uit.push({k:'mijn',   lbl:'mijn kandidaten'});
  return uit;
}
/* Terug naar de begintoestand: alles wat de lijst kan inperken in één keer los. */
function wisFilters(){ zet('status', F_STD.status); zet('zoek', ''); zet('mijn', false); }

function lijstTab(wrap){
  /* Een status die niet (meer) in de keuzelijst staat, kun je niet uitzetten.
     Zo'n waarde — uit een oude opslag of een doorklik van elders — hoort
     terug naar 'alle' in plaats van stilletjes te blijven filteren. */
  if(!STATUS_OPTS.some(o => o.k === F.status)) zet('status', F_STD.status);

  /* Statusfilter met groepskoppen — zie STATUS_OPTS voor het waarom. */
  const statusSel = (() => {
    let uit = '', groep = null;
    STATUS_OPTS.forEach(o => {
      if(o.g !== groep){ if(groep) uit += '</optgroup>'; groep = o.g; if(groep) uit += `<optgroup label="${h(groep)}">`; }
      uit += `<option value="${h(o.k)}"${F.status===o.k?' selected':''}>${h(o.lbl)}</option>`;
    });
    return `<select id="kd_status" class="kd-statussel" title="Toon alleen kandidaten met deze status">${uit}${groep?'</optgroup>':''}</select>`;
  })();

  wrap.innerHTML = `
    <div class="stack">
      <div id="kd_voorraad"></div>
      <div class="card pad">
        <div class="row kd-fil">
          <div class="searchbox" style="flex:1;max-width:290px">
            <input type="search" id="kd_zoek" autocomplete="off" placeholder="Zoek op naam, functie of woonplaats…" value="${h(F.zoek)}">
          </div>
          <button class="btn ghost sm kd-uitgebreid" id="kd_uitgebreid"
            title="Zoeken op ploegendienst, taal, vervoer, rijbewijs, reisafstand, recruiter, klant of fase — dat doe je in Sourcing.">Uitgebreid zoeken →</button>
          ${statusSel}
          <select id="kd_sort" style="width:auto" title="Wie eerst bellen: langst niet gesproken bovenaan, bij gelijke stilte de hoogste sterbeoordeling eerst.">
            <option value="gesproken"${F.sort==='gesproken'?' selected':''}>Wie eerst bellen</option>
            <option value="ster"${F.sort==='ster'?' selected':''}>Hoogste sterren</option>
            <option value="naam"${F.sort==='naam'?' selected':''}>Naam</option>
            <option value="fase"${F.sort==='fase'?' selected':''}>Fase</option>
            <option value="volledigheid"${F.sort==='volledigheid'?' selected':''}>Minst volledig</option>
          </select>
          <span class="chip btn-like${F.mijn?' on':''}" id="kd_mijn">Mijn kandidaten</span>
          <span class="spacer"></span>
          <span class="meta num" id="kd_telling"></span>
        </div>
      </div>
      <div id="kd_lijst"></div>
    </div>`;

  const zoekEl = wrap.querySelector('#kd_zoek');
  zoekEl.oninput = CRM.debounce(() => { zet('zoek', zoekEl.value); lijst(wrap); }, 200);
  wrap.querySelector('#kd_uitgebreid').onclick = naarSourcing;
  wrap.querySelector('#kd_status').onchange = e => { zet('status', e.target.value); lijst(wrap); };
  wrap.querySelector('#kd_sort').onchange = e => { zet('sort', e.target.value); lijst(wrap); };
  wrap.querySelector('#kd_mijn').onclick = e => { zet('mijn', !F.mijn); e.target.classList.toggle('on', F.mijn); lijst(wrap); };
  lijst(wrap);
}

/* Drie dingen kunnen de lijst inperken — status, de zoekbalk en "mijn
   kandidaten" — en die staan alle drie op het scherm. Wie meer wil verfijnen
   gaat naar Sourcing; hier is de vuistregel dat je uit de balk kunt aflezen
   waarom je ziet wat je ziet. */
function gefilterd(){
  const q = String(F.zoek||'').trim().toLowerCase();
  const golden = goldenIds();

  const rijen = CRM.kandidaten().filter(c => {
    if(F.status === 'instroom'    && !CRM.isInstroom(c.fase)) return false;
    if(String(F.status).startsWith('in:')
       && CRM.faseNorm(c.fase) !== F.status.slice(3))         return false;
    if(F.status === 'gekwalificeerd' && !gekwalificeerd(c))  return false;
    if(F.status === 'lopend'      && !CRM.isActiefLopend(c)) return false;
    if(F.status === 'beschikbaar' && !CRM.isBeschikbaar(c))  return false;
    if(F.status === 'geplaatst'   && !CRM.PLACED.includes(c.fase)) return false;
    if(F.status === 'golden'      && !golden.has(String(c.id))) return false;
    if(F.status === 'recyclebaar' && !(c.fase === 'Afgevallen' && c.recyclebaar !== false)) return false;
    if(F.mijn  && !CRM.isVanMij(c))    return false;
    if(q && ![c.naam,c.functie,c.woonplaats,c.klant,c.email,c.telefoon,c.talen].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).map(c => ({c, st:stilte(c), v:CRM.volledigheid(c)}));

  /* Namen vergelijken zonder te struikelen over een kaart die er nog geen
     heeft — die komt achteraan in plaats van de sortering te laten klappen. */
  const opNaam = (a,b) => String(a.c.naam||'￿').localeCompare(String(b.c.naam||'￿'),'nl');

  /* "Wie eerst bellen" is de standaard, en dat is een keuze: wie deze lijst
     opent wil een bellijst, geen alfabet. De regel is bewust in één zin uit
     te leggen — langst niet gesproken bovenaan, en bij gelijke stilte eerst
     de kandidaat met de hoogste beoordeling.

     Twee dingen die de oude sortering nog verkeerd deed:
     1. Nooit-gesproken kandidaten stonden altijd bovenaan, ook als ze
        gisteren binnenkwamen. Nu tellen ze mee met hoe lang ze al in beeld
        zijn (st.dagen) — precies het getal dat de lijst ook toont.
     2. Kaarten zonder meetbare stilte (geanonimiseerd, of geen datum in
        beeld) zakten naar boven via een noodwaarde van 9999. Die horen
        onderaan: er valt niemand te bellen. */
  const stilteVan = r => r.st.dagen == null ? -1 : r.st.dagen;
  const srt = {
    gesproken:    (a,b) => stilteVan(b) - stilteVan(a)
                        || (Number(b.c.ster)||0) - (Number(a.c.ster)||0) || opNaam(a,b),
    ster:         (a,b) => (Number(b.c.ster)||0) - (Number(a.c.ster)||0) || opNaam(a,b),
    naam:         opNaam,
    fase:         (a,b) => CRM.faseIdx(a.c.fase) - CRM.faseIdx(b.c.fase) || opNaam(a,b),
    volledigheid: (a,b) => a.v.pct - b.v.pct
  }[F.sort];
  if(srt) rijen.sort(srt);
  return rijen;
}

/* ═══ De gekwalificeerde voorraad, geteld en uitgesplitst ═════════
   Het getal waar Tjeerd naar vroeg — "hoeveel potentiële kandidaten zijn
   er nou" — plus de uitsplitsing die er iets mee laat doen.

   Waarom gezochte functie als eerste uitsplitsing: een klantvraag komt
   binnen als een functie ("ik heb er maandag drie nodig voor de inpaklijn").
   "42 beschikbaar" beantwoordt die vraag niet, "9 heftruck" wel. Woonplaats
   staat er als tweede naast, want in productie en logistiek is reistijd een
   vaste uitvalreden (zie CRM.AFVAL_CATS) — een orderpicker in Groningen is
   geen orderpicker voor Bodegraven.

   Allebei gelezen uit een vastgelegd veld op de kaart, niet afgeleid: geen
   functie ingevuld is dan ook een eigen groep en geen gok. */
function voorraad(){
  const alle = CRM.kandidaten().filter(gekwalificeerd);
  const groepeer = veld => {
    const m = new Map();
    alle.forEach(c => {
      const ruw = String(c[veld]||'').trim();
      const sleutel = ruw.toLowerCase();
      const g = m.get(sleutel) || {lbl:ruw, n:0, leeg:!ruw};
      g.n++; m.set(sleutel, g);
    });
    return [...m.values()].sort((a,b) => b.n - a.n || String(a.lbl).localeCompare(String(b.lbl),'nl'));
  };
  const st = alle.map(stilte);
  /* nooit2w is bewust een deelverzameling van stil2w en geen tweede,
     losse telling. Twee getallen naast elkaar die elkaar deels overlappen
     nodigen uit om ze op te tellen, en dan klopt de som niet meer. */
  return {
    n: alle.length,
    stil2w: st.filter(s => s.dagen != null && s.dagen >= 14).length,
    nooit2w: st.filter(s => s.nooit && s.dagen != null && s.dagen >= 14).length,
    functie: groepeer('functie'),
    woonplaats: groepeer('woonplaats')
  };
}

/* De regel bovenaan het scherm. Staat er altijd, ook als je op iets anders
   filtert: dit is een stand, geen zoekresultaat.

   Was tot 1 aug een blok van vier regels hoog met een kerncijfer in Anton,
   twee rode chips en een uitsplitsing — meer schermruimte dan de lijst
   eronder, terwijl de lijst het werk is. Nu één regel met de kern (hoeveel,
   wie er te lang niet gesproken is, doorklik) en de uitsplitsing achter
   "Uitsplitsen". Niets is weggegooid, alleen opgevouwen. */
const CHIPS_MAX = 10;
function voorraadPaneel(wrap){
  const el = wrap.querySelector('#kd_voorraad'); if(!el) return;
  const v = voorraad();
  const aan = F.status === 'gekwalificeerd';

  if(!v.n){
    el.innerHTML = `<div class="card kd-vr kd-vrregel">
      <span class="label">Gekwalificeerde voorraad</span>
      <span class="kd-vrtekst">niemand staat klaar om voor te stellen — een kandidaat komt hier zodra
      de intake op de kaart staat en er nog geen klanttraject loopt</span></div>`;
    return;
  }

  const splits = F.splits === 'woonplaats' ? 'woonplaats' : 'functie';
  const groepen = v[splits];
  const toon = groepen.slice(0, CHIPS_MAX);
  const rest = groepen.slice(CHIPS_MAX).reduce((s,g) => s + g.n, 0);
  const chip = g => {
    if(g.leeg) return `<span class="chip kd-vrchip kd-vrleegchip" title="${
      splits === 'functie'
        ? 'Deze kandidaten hebben geen gezochte functie op de kaart. Zolang dat leeg is vallen ze buiten elke zoekopdracht op functie.'
        : 'Deze kandidaten hebben geen woonplaats op de kaart, dus geen reisafstand.'
      }"><span class="num">${g.n}</span> ${splits === 'functie' ? 'geen functie ingevuld' : 'geen woonplaats'}</span>`;
    const tip = 'Zoek in de lijst op "' + g.lbl + '" binnen de gekwalificeerde voorraad';
    return `<button type="button" class="chip btn-like kd-vrchip" data-vr="${h(g.lbl)}" title="${h(tip)}"
      ><span class="num">${g.n}</span> ${h(g.lbl)}</button>`;
  };

  el.innerHTML = `<div class="card kd-vr">
    <div class="row kd-vrregel">
      <span class="label">Gekwalificeerde voorraad</span>
      <span class="kd-vrn num">${v.n}</span>
      <span class="kd-vrtekst" title="Een intake op de kaart en nog geen enkele stap in een klanttraject.">klaar om voor te stellen</span>
      ${v.stil2w
        ? `<span class="chip amber"><span class="num">${v.stil2w}</span> langer dan 2 weken niet gesproken</span>
           ${v.nooit2w ? `<span class="meta">waarvan <span class="num">${v.nooit2w}</span> nooit</span>` : ''}`
        : '<span class="meta">iedereen is de afgelopen twee weken gesproken</span>'}
      <span class="spacer"></span>
      ${aan ? '<span class="meta">je kijkt nu naar deze lijst</span>'
            : '<button class="btn ghost sm" id="kd_vrtoon">Toon deze lijst</button>'}
      <!-- Zelfde woord open en dicht, alleen het pijltje draait: een knop die
           van tekst verandert, verspringt van breedte en duwt de regel om. -->
      <button class="btn sub sm" id="kd_vruitknop" aria-expanded="${uitsplitsingOpen?'true':'false'}"
        title="Per gezochte functie of per woonplaats — wie staat er precies klaar?"
        >Uitsplitsen ${uitsplitsingOpen ? '▴' : '▾'}</button>
    </div>
    <div class="kd-vruit" id="kd_vruit"${uitsplitsingOpen?'':' hidden'}>
      <div class="row">
        <div class="seg" id="kd_splitseg">
          <button type="button" data-s="functie"${splits==='functie'?' class="on"':''}>Per gezochte functie</button>
          <button type="button" data-s="woonplaats"${splits==='woonplaats'?' class="on"':''}>Per woonplaats</button>
        </div>
      </div>
      <div class="row tight kd-vrchips">${toon.map(chip).join('')}${
        rest ? `<span class="meta">en <span class="num">${rest}</span> in kleinere groepen</span>` : ''}</div>
      <p class="meta kd-vrnoot">Geteld over alle kandidaten, los van de balk hieronder — en op wat
        is vastgelegd, niet op een schatting: een intake op de kaart en nog geen enkele stap in een
        klanttraject. De videocall zelf staat op de lead in de recruitmentpijplijn, dus de intake is
        hier het bewijs dat die er is geweest.</p>
    </div></div>`;

  el.querySelector('#kd_vruitknop').onclick = () => {
    uitsplitsingOpen = !uitsplitsingOpen; voorraadPaneel(wrap);
  };
  el.querySelectorAll('#kd_splitseg button').forEach(b => b.onclick = () => {
    zet('splits', b.dataset.s); voorraadPaneel(wrap);
  });
  const toonKnop = el.querySelector('#kd_vrtoon');
  if(toonKnop) toonKnop.onclick = () => { zet('status','gekwalificeerd'); lijstTab(wrap); };
  /* Een chip zet de zoekbalk, want dat is het enige filter dat hier nog over
     is — en meteen het eerlijkste: je ziet de term staan en kunt hem weghalen.
     Vroeger zette dit een verborgen functie- of radiusfilter; precies het
     soort onzichtbare inperking waar dit scherm vanaf moest. */
  el.querySelectorAll('[data-vr]').forEach(b => b.onclick = () => {
    zet('status','gekwalificeerd');
    zet('zoek', b.dataset.vr);
    lijstTab(wrap);
  });
}

/* Hoe lang niet gesproken, in de lijst. Dit is het getal waar de standaard-
   sortering ("wie eerst bellen") op stuurt, dus het hoort zichtbaar te zijn.
   Nooit-gesproken krijgt bewust een andere regel dan lang-geleden: het eerste
   is een gat in het proces, het tweede een belletje waard. */
function stilteCel(st){
  if(st.anon) return '<span class="sub">gegevens gewist</span>';
  const klas = st.kleur === 'red' ? ' kd-let' : st.kleur === 'amber' ? ' kd-warn' : '';
  if(st.nooit) return `<span class="kd-nooit${klas}">nooit gesproken</span>
    <div class="rowsub">${st.wacht == null ? 'niet bekend hoe lang in beeld'
      : `<span class="num">${st.wacht}</span> ${st.wacht === 1 ? 'dag' : 'dagen'} in beeld`}</div>`;
  const soort = st.soort ? String((CRM.ACT_SOORTEN[st.soort]||{}).lbl || st.soort).toLowerCase() : '';
  return `<span class="num${klas}">${h(st.tekst)}</span>${soort ? `<div class="rowsub">${h(soort)}</div>` : ''}`;
}

function lijst(wrap){
  const rijen = gefilterd();
  voorraadPaneel(wrap);
  const lijstEl = wrap.querySelector('#kd_lijst');
  const tel  = wrap.querySelector('#kd_telling');
  const dun  = rijen.filter(r => r.v.pct < 60).length;
  if(tel) tel.textContent = rijen.length + (rijen.length===1?' kandidaat':' kandidaten') + (dun?' · '+dun+' onvolledig':'');

  if(!rijen.length){
    /* Een lege lijst zonder reden laat je zoeken naar een fout die er niet
       is. Noem daarom wát er samen op nul uitkomt en bied één klik om het
       weer los te laten. */
    const aan = actieveFilters().map(f => f.lbl);
    if(String(F.zoek||'').trim()) aan.push('zoeken op "' + F.zoek.trim() + '"');
    const leeg = !CRM.kandidaten().length;
    lijstEl.innerHTML = leeg
      ? CRM.ui.leeg('Nog geen kandidaten',
          'Er staat nog geen enkele kandidaat in het systeem. Ze komen hier binnen vanuit de recruitmentpijplijn.')
      : CRM.ui.leeg('Geen kandidaten binnen deze filters',
          (aan.length ? 'Samen leveren deze niets op: ' + aan.join(' · ') + '.'
                      : 'Er valt hier niets te tonen.'),
          `<button class="btn ghost sm" id="kd_leegwis">Filters wissen</button>
           <button class="btn sub sm" id="kd_leegzoek">Uitgebreid zoeken →</button>`);
    const wisKnop = lijstEl.querySelector('#kd_leegwis');
    if(wisKnop) wisKnop.onclick = () => { wisFilters(); lijstTab(wrap); };
    const zoekKnop = lijstEl.querySelector('#kd_leegzoek');
    if(zoekKnop) zoekKnop.onclick = naarSourcing;
    return;
  }
  const golden = goldenIds();
  lijstEl.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr>
      <th>Kandidaat</th><th>Sterren</th><th>Klant</th><th>Fase</th><th>Woonplaats</th><th>Recruiter</th>
      <th title="Alleen echt contact telt: bellen, appen, mailen, een gesprek of een bezoek. Een notitie of een fasewissel niet.">Laatst gesproken</th><th>Profiel</th>
    </tr></thead><tbody>${rijen.map(({c,st,v}) => {
      const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : '';
      /* Rand links = waar deze kandidaat staat (base.css, .frand). Een kaart
         zonder fase — de ±298 rijen uit het oude ATS — krijgt geen rand: dat
         is iets anders dan een fase die toevallig grijs is. */
      return `<tr${CRM.ui.frand(c.fase ? CRM.faseKleur(c.fase) : '', 'clickable')} data-id="${h(String(c.id))}">
        <td><b>${h(c.naam)}</b>${golden.has(String(c.id))?' '+goldenSter():''}<div class="rowsub">${h(c.functie||'—')}${
          c.cv && c.cv.werkgever ? ' · '+h(c.cv.werkgever) : ''}${
          c.bron==='Import oud ATS' ? ' <span class="kd-bronimp">Import oud ATS</span>' : ''}</div></td>
        <td><span class="kd-ster num" title="${c.ster?c.ster+' van 5':'nog geen beoordeling'}">${h(CRM.sterren(c.ster))}</span></td>
        <td class="sub">${h(c.klant||'—')}</td>
        <td>${faseChip(c.fase)}</td>
        <td class="sub">${h(c.woonplaats||'—')}</td>
        <td class="sub">${h(c.rec||'—')}</td>
        <td class="sub kd-stilte">${stilteCel(st)}</td>
        <td><div class="kd-vol">${CRM.ui.bar(v.pct, kleur)}<span class="meta num">${v.pct}%</span></div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  lijstEl.querySelectorAll('[data-id]').forEach(tr => tr.onclick = () => CRM.ga('kandidaten',{id:tr.dataset.id}));
}

/* ═══════════════════════════════════════════════════════════════
   KANDIDATENKAART
   ═══════════════════════════════════════════════════════════════ */
let kandOpen = null, tabActief = 'activiteiten';
/* Dat een profiel nog niet af is, zegt de balk "Wat mist nog" onder de kop
   al — met klikbare chips naar het lege veld. Een tweede waarschuwing in de
   werkkolom was dezelfde boodschap voor de tweede keer. */

/* Inline bewerkbare velden — pad 'cv.x' schrijft in het cv-jsonb.
   Beschikbaarheid, ploegen, talen, rijbewijs en vervoer zijn échte
   kandidaatvelden (daar filtert het overzicht op), geen cv-velden. */
const VELDEN = [
  {k:'naam',        lbl:'Naam',              t:'text'},
  {k:'telefoon',    lbl:'Telefoon',          t:'tel'},
  {k:'email',       lbl:'E-mail',            t:'email'},
  {k:'woonplaats',  lbl:'Woonplaats',        t:'text'},
  /* Bij een plaatsing is het exacte adres nodig voor de papieren; de
     CV-lezer vult deze velden voor als het cv ze bevat. */
  {k:'adres',       lbl:'Adres',             t:'text'},
  {k:'postcode',    lbl:'Postcode',          t:'text'},
  {k:'functie',     lbl:'Gezochte functie',  t:'text'},
  {k:'beschikbaar', lbl:'Beschikbaar',       t:'select', opts:['', ...CRM.BESCHIKBAAR]},
  {k:'ploegen',     lbl:'Ploegendiensten',   t:'select', opts:['', ...CRM.PLOEGEN]},
  {k:'talen',       lbl:'Talen',             t:'text'},
  {k:'rijbewijs',   lbl:'Rijbewijs',         t:'text'},
  {k:'vervoer',     lbl:'Vervoer',           t:'select', opts:['', ...CRM.VERVOER]},
  {k:'maandloon',   lbl:'Maandloon',         t:'number', toon:v => v ? CRM.euro(v) : ''},
  {k:'toeslagPct',  lbl:'Toeslagen',         t:'number', toon:v => v ? CRM.pct(v) : ''},
  /* Hierheen verhuisd uit het blok bovenaan Werkervaring (naam: Tjeerd,
     7 aug 2026). Huidige functie en huidig bedrijf stonden daar dubbel —
     die staan al bovenaan de loopbaan. Wat er níet uit af te leiden is
     hoort bij de kandidaatgegevens: wanneer kan hij weg, wat verdient hij
     nu, wat wil hij verdienen, en waar komt hij vandaan. */
  /* toon: via een pijl, want opzegNL en euroMnd staan verderop in dit
     bestand — een directe verwijzing valt bij het laden om. */
  {k:'cv.opzegtermijn',  lbl:'Opzegtermijn',   t:'text', toon:v => opzegNL(v)},
  {k:'cv.huidigSalaris', lbl:'Huidig salaris', t:'text', toon:v => euroMnd(v)},
  {k:'cv.salariswens',   lbl:'Salariswens',    t:'text', toon:v => euroMnd(v)},
  {k:'since',            lbl:'Binnengekomen op', t:'date', toon:v => CRM.fmtDate(v)},
  {k:'rec',              lbl:'Eigenaar',       t:'text'},
  {k:'bron',             lbl:'Bron',           t:'select', opts:['', 'Import oud ATS', ...CRM.LEAD_BRONNEN]}
];

/* ─── Blok "Huidige situatie" ─────────────────────────────────────
   De velden uit het oude ATS (import, cv-jsonb) plus herkomst. Bron
   en salariswens zijn hierheen verhuisd uit Kandidaatgegevens zodat
   niets dubbel staat. Salaris van een kandidaat is een arbeids-
   voorwaarde en mag het team zien — bewust géén canSeeMoney. */

/* Opzegtermijn uit het oude ATS staat in het Engels — vertaal bij tonen. */
const opzegNL = v => {
  const s = String(v == null ? '' : v).trim();
  if(!s) return '';
  if(/^immediately$/i.test(s)) return 'per direct';
  const m = s.match(/^(\d+)\s*days?$/i);
  return m ? m[1] + ' dagen' : s;
};
/* Salaris tonen als euro per maand; niet-numerieke oude invoer blijft staan. */
const euroMnd = v => {
  if(v == null || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v) : CRM.euro(n) + ' p/mnd';
};
/* SITUATIE_VELDEN is opgegaan in VELDEN (7 aug 2026). Huidige functie en
   huidig bedrijf stonden dubbel met de bovenste regel van de loopbaan; de
   rest — opzegtermijn, salaris, salariswens, herkomst — hoort gewoon bij de
   kandidaatgegevens. De onderliggende velden zijn ongewijzigd. */
/* ─── Traject en contract (verhuisd uit de bewerk-drawer) ─────────
   Dit zijn de velden waar het bord op draait: afspraak, actie, start,
   garantie, vervanging en de salariscomponenten. Ze stonden in het
   smalle bewerkpaneel; nu staan ze hier, in dezelfde inline-stijl als
   de rest van de kaart. De fase zelf zit er bewust NIET bij — die
   wissel je met de knop "Fase wijzigen…", zodat de poortwachters uit
   recruitment.js altijd langskomen.                                 */
const gestopten = huidigeId => CRM.kandidaten()
  .filter(x => x.fase === 'Gestopt' && String(x.id) !== String(huidigeId))
  .map(x => ({v:String(x.id), l:`${x.naam} (${x.klant||'—'})`}));
const naamVan = id => {
  const k = id ? CRM.kandidaat(id) : null;
  return k ? k.naam + (k.klant ? ' ('+k.klant+')' : '') : (id ? String(id) : '');
};
const TRAJECT_VELDEN = [
  {k:'type',         lbl:'Type',            t:'select', opts:['','W&S','Flex']},
  {k:'datum',        lbl:'Afspraakdatum',   t:'date',   toon:v => CRM.fmtDate(v)},
  {k:'tijd',         lbl:'Tijd',            t:'time'},
  {k:'volgendeActie',lbl:'Volgende actie',  t:'text'},
  {k:'actieDatum',   lbl:'Actiedatum',      t:'date',   toon:v => CRM.fmtDate(v)}
];
const CONTRACT_VELDEN = [
  {k:'start',        lbl:'Startdatum',      t:'date',   toon:v => CRM.fmtDate(v)},
  {k:'garantieMnd',  lbl:'Garantie',        t:'number', toon:v => v ? v + (v==1?' maand':' maanden') : ''},
  {k:'vervangt',     lbl:'Vervangt',        t:'select', opts:c => [{v:'',l:'—'}].concat(gestopten(c.id)), toon:naamVan},
  {k:'geplaatstOp',  lbl:'Geplaatst op',    t:'date',   toon:v => CRM.fmtDate(v), alleenBijPlaatsing:true},
  {k:'gestoptOp',    lbl:'Gestopt op',      t:'date',   toon:v => CRM.fmtDate(v), alleenBijPlaatsing:true}
];
const SALARIS_VELDEN = [
  {k:'maandloon',    lbl:'Bruto maandloon', t:'number', toon:v => v ? CRM.euro(v) : ''},
  {k:'toeslagPct',   lbl:'Ploegentoeslag',  t:'number', toon:v => v ? CRM.pct(v) : ''},
  {k:'vtPct',        lbl:'Vakantietoeslag', t:'number', toon:v => v ? CRM.pct(v) : '', hint:'leeg = 8%'},
  {k:'ejuPct',       lbl:'Eindejaarsuitkering', t:'number', toon:v => v ? CRM.pct(v) : ''},
  {k:'overigPct',    lbl:'Overig',          t:'number', toon:v => v ? CRM.pct(v) : ''}
];

/* Eén lijst voor het opzoeken bij inline bewerken (alle blokken). */
const ALLE_VELDEN = VELDEN.concat(TRAJECT_VELDEN, CONTRACT_VELDEN, SALARIS_VELDEN);
function lees(c, pad){
  if(pad.indexOf('cv.') === 0) return (c.cv || {})[pad.slice(3)];
  return c[pad];
}
function schrijf(c, pad, waarde){
  if(pad.indexOf('cv.') === 0){ c.cv = Object.assign({}, c.cv || {}); c.cv[pad.slice(3)] = waarde; }
  else c[pad] = waarde;
}
function toonWaarde(veld, waarde){
  if(waarde == null || waarde === '') return '';
  if(veld.lijst) return Array.isArray(waarde) ? waarde.join(', ') : String(waarde);
  if(veld.toon)  return veld.toon(waarde);
  return String(waarde);
}

function kaart(mount, acties, id){
  const c = CRM.kandidaat(id);
  if(!c){
    acties.innerHTML = '';
    mount.innerHTML = CRM.ui.leeg('Kandidaat niet gevonden','Deze kandidaat bestaat niet (meer).',
      '<button class="btn ghost" id="kd_terug">Terug naar overzicht</button>');
    mount.querySelector('#kd_terug').onclick = () => CRM.ga('kandidaten');
    return;
  }
  if(kandOpen !== String(id)){
    kandOpen = String(id); tabActief = 'activiteiten';
    ervBewerk = false;          // een nieuwe kaart open je om te kijken
  }

  /* Eén inplan-knop, niet twee. "Inplannen" was vaag én het venster stond
     standaard op een gesprek zonder video, terwijl de videocall juist de
     eerste stap is na binnenkomst. De knop heet nu wat hij doet, staat als
     enige gevulde knop rechts (primaire vervolgstap) en het venster kan
     nog steeds een gewone afspraak maken: Teams-vinkje uit. */
  /* Kwam je hier vanaf het pijplijnbord, dan is "terug" het bord — met
     dezelfde filters én dezelfde scrollpositie (zie js/pijplijn.js). */
  const vanBord = typeof CRM.pijplijnTerug === 'function' && CRM.pijplijnTerug(c.id);
  acties.innerHTML = `
    <button class="btn ghost sm" id="c_terug">${vanBord?'← Terug naar Klanttrajecten':'← Overzicht'}</button>
    <button class="btn ghost sm" id="c_bel">Gebeld</button>
    <button class="btn ghost sm" id="c_app">Geappt</button>
    <button class="btn ghost sm" id="c_notitie">Notitie</button>
    <button class="btn ghost sm" id="c_taak">Taak</button>
    <button class="btn ghost sm" id="c_profiel">Genereer CV</button>
    <button class="btn sm" id="c_video">Videocall inplannen</button>`;
  acties.querySelector('#c_terug').onclick   = () => CRM.ga(vanBord ? 'pijplijn' : 'kandidaten');
  /* "Genereer CV" (naam: Tjeerd, 4 aug 2026) — het kandidaatprofiel in
     huisstijl uit js/cv.js, het vel dat naar de klant gaat.
     De vacature gaat mee zodat "voorgesteld voor" en de reisafstand kloppen. */
  acties.querySelector('#c_profiel').onclick = () => CRM.cvGen.open(c, {
    vacature: c.vacatureId || null, klant: c.klant || ''
  });
  acties.querySelector('#c_video').onclick   = () => videocallModal(c);
  acties.querySelector('#c_bel').onclick     = () => logVia(c,'bel','Wat is er besproken?');
  acties.querySelector('#c_app').onclick     = () => logVia(c,'whatsapp','Wat heb je gestuurd?');
  acties.querySelector('#c_notitie').onclick = () => notitieToevoegen(c);
  acties.querySelector('#c_taak').onclick    = () => nieuweTaak(c);

  mount.innerHTML = `
    <div class="stack">
      ${kopHtml(c)}
      ${dealbalkHtml(c)}
      ${laatsteNotitiesHtml(c)}
      <!-- Eén kaart, twee kolommen (naam: Tjeerd, 6 aug 2026: "alles gewoon
           bij elkaar"). LINKS staat wie deze persoon is — gegevens, situatie,
           werkervaring, certificaten, intake — en die kolom blijft staan
           terwijl je rechts doorscrolt: tijdens een intakegesprek lees je
           links en typ je rechts. RECHTS staat wat we ermee doen, met de
           snelbalk bovenaan zodat vastleggen altijd op dezelfde plek zit. -->
      <div class="kd-tweeluik">
        <div class="kd-profielkol">
          <div class="stack">
            ${gegevensHtml(c)}
            ${ervaringHtml(c)}
            ${intakeHtml(c)}
          </div>
        </div>
        <div class="stack kd-werkkol">
          <div class="kd-logboek">
            <div class="tabs" id="c_tabs">${tabsHtml(c)}</div>
            <div id="c_tabinhoud"></div>
          </div>
          ${trajectHtml(c)}
          ${kansenHtml(c)}
          <!-- Opvolging staat pal onder Traject: het is de voortzetting
               daarvan. Nazorg ná de start, warm houden ervóór, plus de
               verjaardag en de felicitatiemail. Het ritme zelf staat in
               js/opvolging.js — die ene plek. -->
          ${CRM.opvolging ? CRM.opvolging.kaartHtml(c) : ''}
          ${uitvalHtml(c)}
          ${contractHtml(c)}
          ${factuurklaarHtml(c)}
          ${CRM.mailUI ? CRM.mailUI.blokHtml(c.email, 'kd_mailblok') : ''}
          ${docsHtml(c)}
          ${CRM.bestandenUI ? CRM.bestandenUI.blokHtml(c.naam, 'kd_bestanden') : ''}
          <!-- Verwijderen en anonimiseren (js/kandverwijder.js). Onderaan de
               kaart, want het is het einde van een dossier en geen dagelijkse
               handeling. De regels wie wat mag wonen daar, niet hier. -->
          ${CRM.kandVerwijder ? CRM.kandVerwijder.knopHtml(c) : ''}
        </div>
      </div>
    </div>`;


  bindVelden(mount, c);
  bindSterren(mount, c);
  bindMist(mount, c);
  bindStrip(mount, c);
  bindDealbalk(mount, c);
  bindBlokBewerk(mount, c);
  /* Uitvalgegevens vastleggen of bijwerken vanaf de kaart zelf — hetzelfde
     formulier als op het bord, zodat er maar één plek is waar dit gebeurt. */
  mount.querySelector('#c_uitval')?.addEventListener('click',
    () => CRM.kandidaatUitval(c.id, c.fase));
  /* "Klaar voor facturatie": springen naar het ontbrekende veld. Sommige
     velden staan alleen op de kaart in bepaalde fases (geplaatstOp verschijnt
     pas bij een plaatsing). Bestaat het veld hier niet, dan wordt de knop
     gewone tekst — een knop die nergens heen gaat is erger dan geen knop. */
  CRM.$$('[data-mistveld]', mount).forEach(b => {
    const doel = mount.querySelector('.kd-w[data-veld="' + CSS.escape(b.dataset.mistveld) + '"]');
    if(doel) b.onclick = () => springNaarVeld(b.dataset.mistveld, c);
    else b.replaceWith(Object.assign(document.createElement('span'), {textContent:b.textContent}));
  });

  /* Mail: pas ophalen nu de kaart daadwerkelijk openstaat — in de
     lijstweergave wordt er nooit mail opgevraagd. */
  if(CRM.mailUI){
    CRM.mailUI.laad(mount, c.email, 'kd_mailblok');
    CRM.mailUI.bindLinks(mount.querySelector('.kd-contact'), mailOpties(c));
    const mailBtn = mount.querySelector('#c_mail');
    if(mailBtn) mailBtn.onclick = () => CRM.mailUI.opstellen(mailOpties(c));
  }
  /* CV's en documenten die al in OneDrive of SharePoint staan — zoeken
     op naam, pas nu de kaart openstaat. Er wordt niets gekopieerd. */
  if(CRM.bestandenUI) CRM.bestandenUI.laad(mount, c.naam, 'kd_bestanden');
  /* Kandidaat in het Outlook-adresboek zetten, zodat je telefoon bij een
     inkomend gesprek meteen laat zien wie er belt. */
  const olBtn = mount.querySelector('#c_outlook');
  if(olBtn && CRM.naarOutlook) olBtn.onclick = () => CRM.naarOutlook(olBtn, {
    naam: c.naam, email: c.email, telefoon: c.telefoon,
    bedrijf: (c.cv && c.cv.werkgever) || '', functie: c.functie
  });
  const goldBtn = mount.querySelector('#c_golden');
  if(goldBtn) goldBtn.onclick = async () => {
    const ok = await zetGolden(c.id, !isGolden(c.id));
    if(ok) CRM.render();
  };
  /* Twee knoppen, één handeling: de knop in de kop van "CV & ervaring" en de
     knop midden in het lege blok eronder. Wie op een lege kaart kijkt, kijkt
     naar het lege blok en niet naar de kopregel. */
  mount.querySelectorAll('#c_cvlees, #c_cvleeg').forEach(b => b.onclick = () => cvLezen(c));
  /* werkModal en certModal zijn vervallen: loopbaan, opleiding en
     certificaten zijn nu gewone invulvelden op de kaart (zie
     bindErvaring). */
  { const b = mount.querySelector('#c_cvclaude');
    if(b) b.onclick = () => CRM.cvClaude.open({kandidaat:c, onKlaar: x => CRM.ga('kandidaten', {id:x.id})}); }
  /* Het cv-bestand zelf, met een tijdelijke link om te openen. */
  if(CRM.cvParse) CRM.cvParse.bindBestand(mount);
  if(CRM.intakeAI) CRM.intakeAI.bindBlok(mount);
  { const b = mount.querySelector('#c_skillnieuw');
    if(b) b.onclick = () => vaardigheidToevoegen(c); }
  mount.querySelectorAll('[data-skillweg]').forEach(b =>
    b.onclick = () => vaardigheidWeg(c, Number(b.dataset.skillweg)));
  { const b = mount.querySelector('#c_taalnieuw');
    if(b) b.onclick = () => taalToevoegen(c); }
  mount.querySelectorAll('[data-taalweg]').forEach(b =>
    b.onclick = () => taalWeg(c, Number(b.dataset.taalweg)));
  bindSleep(mount, c);
  bindErvaring(mount, c);
  bindDocs(mount, c);
  /* Opvolging: check-in vastleggen, ritme uitklappen, felicitatiemail openen.
     Alle knoppen zitten in js/opvolging.js — deze kaart roept alleen aan. */
  if(CRM.opvolging) CRM.opvolging.bindKaart(mount, c, () => CRM.render());
  if(CRM.kandVerwijder) CRM.kandVerwijder.bindKnop(mount);

  /* Traject-acties — de logica woont in js/recruitment.js, inclusief álle
     poortwachters. Deze kaart roept alleen aan. */
  const klik = (sel, fn) => { const b = mount.querySelector(sel); if(b) b.onclick = fn; };
  /* Een plaatsing is een feit dat je vastlegt, geen fase die je uitkiest.
     Dit stond alleen in "Fase wijzigen…" — een lijst van elf fases waaruit je
     de goede moest zoeken, terwijl dit de belangrijkste handeling in het hele
     systeem is: hier hangt de omzet, het feestscherm en de nazorg aan.
     De poortwachters zitten in faseWissel(): startdatum, maandloon en type
     worden daar gevraagd. (Tjeerd, 2 aug 2026: "hoe zet je een kandidaat nu
     bij plaatsing? dit moet je ook allemaal bij de kandidatenkaart kunnen
     doen toch?") */
  klik('#c_getekend', () => CRM.kandidaatFase && CRM.kandidaatFase(c.id, 'Contract getekend'));
  klik('#c_vac', () => vacatureKoppelen(c));
  klik('#c_sollplus', () => sollKiesModal(c));
  mount.querySelectorAll('[data-sollhoofd]').forEach(b => b.onclick = () =>
    sollHoofdMaken(c, sollVan(c).find(r => String(r.id) === b.dataset.sollhoofd)));
  mount.querySelectorAll('[data-sollweg]').forEach(b => b.onclick = async () => {
    await sollWeg(b.dataset.sollweg); CRM.render();
  });
  klik('#kd_lnotmeer', () => {
    tabActief = 'activiteiten';
    mount.querySelectorAll('#c_tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === 'activiteiten'));
    tabInhoud(mount, c);
  });
  klik('#c_fase',   () => CRM.kandidaatFasePicker && CRM.kandidaatFasePicker(c.id));
  klik('#c_intake', () => CRM.kandidaatIntake && CRM.kandidaatIntake(c.id));
  klik('#c_noshow', () => CRM.kandidaatNoShow && CRM.kandidaatNoShow(c.id));
  klik('#c_uitval', () => CRM.kandidaatUitval && CRM.kandidaatUitval(c.id));
  klik('#c_intake2',() => CRM.kandidaatIntake && CRM.kandidaatIntake(c.id));
  klik('#c_snel',   () => CRM.kandidaatBewerk && CRM.kandidaatBewerk(c.id));
  mount.querySelectorAll('#c_tabs .tab').forEach(b => b.onclick = () => {
    tabActief = b.dataset.t;
    mount.querySelectorAll('#c_tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.t === tabActief));
    tabInhoud(mount, c);
  });
  mount.querySelectorAll('[data-klant]').forEach(a => a.onclick = e => {
    e.preventDefault(); CRM.ga('klanten',{id:a.dataset.klant});
  });
  mount.querySelectorAll('[data-voorstel]').forEach(b => b.onclick = () => {
    const v = CRM.state.vacs.find(v => String(v.id) === b.dataset.voorstel);
    if(v) voorstellen(c, v);
  });
  tabInhoud(mount, c);
}

/* ─── Mailen met de kandidaat ─────────────────────────────────────
   Met Outlook-koppeling opent het opstelvenster (CRM.mailUI, gedeeld
   met de klantenmodule); zonder koppeling blijft het gewoon mailto.
   Na versturen wordt het gelogd en tekent de kaart zich opnieuw, dus
   ook het mailblok is dan bij. */
const voornaam = n => String(n||'').trim().split(/\s+/)[0] || '';
function mailOpties(c){
  return {
    aan: c.email || '',
    wie: c.naam + (c.functie ? ' — ' + c.functie : ''),
    set: 'kandidaat',
    ctx: { voornaam: voornaam(c.naam), klant: c.klant || '', functie: c.functie || '' },
    entiteit: 'kandidaat', ref: String(c.id),
    na(){ tabActief = 'activiteiten'; CRM.render(); }
  };
}

/* ─── Ster-beoordeling in de kop ──────────────────────────────── */
function sterrenHtml(c){
  const s = Number(c.ster)||0;
  return `<div class="kd-sterren" role="group" aria-label="Beoordeling">
    ${[1,2,3,4,5].map(i => `<button type="button" class="kd-sterbtn${i<=s?' aan':''}" data-ster="${i}"
      title="${i===s ? 'Klik nogmaals om de beoordeling te wissen' : i+' van 5 sterren'}">★</button>`).join('')}
    <span class="meta">${s ? `<span class="num">${s}</span>/5` : 'nog geen beoordeling'}</span>
  </div>`;
}
function bindSterren(mount, c){
  mount.querySelectorAll('.kd-sterbtn').forEach(b => b.onclick = async () => {
    const n = Number(b.dataset.ster);
    c.ster = (Number(c.ster)||0) === n ? 0 : n;      // zelfde ster = wissen
    await bewaarKandidaat(c);
    const wrap = mount.querySelector('.kd-sterren');
    if(wrap){ wrap.outerHTML = sterrenHtml(c); bindSterren(mount, c); }
  });
}

/* ─── "Wat mist nog" ──────────────────────────────────────────────
   Een net doorgeschoten sollicitant heeft bijna niets ingevuld. In
   plaats van een lijstje in de meter (lezen, zoeken, klikken) staan de
   drie belangrijkste gaten bovenaan als knoppen die het veld openen.
   Geen nieuwe verplichte velden: dit is exact CRM.volledigheid —
   de vijf verplichte velden plus e-mail en CV, die daar meetellen. */
/* Naam staat vooraan: er passen er maar drie op de strip, en een kandidaat
   zonder naam is het gat dat je als eerste dicht wilt hebben (de kop zegt
   dan letterlijk "Naam nog niet ingevuld"). Daarna telefoon en e-mail:
   daarmee bereik je de kandidaat. */
const MIST_VOLGORDE = ['naam','telefoon','email','functie','woonplaats','bron'];
function gaten(c){
  const v = CRM.volledigheid(c);
  if(v.pct >= 100) return [];
  const mist = new Set(v.mist.map(m => m.k));
  const uit = [];
  MIST_VOLGORDE.forEach(k => {
    if(k === 'email'){
      if(!String(c.email||'').trim()) uit.push({k:'email', lbl:'E-mailadres'});
      return;
    }
    if(!mist.has(k)) return;
    const f = ALLE_VELDEN.find(x => x.k === k);
    uit.push({k, lbl:(f ? f.lbl : k)});
  });
  if(c.cv) return uit.slice(0,3);
  /* De CV-knop stond achteraan en viel daardoor juist weg bij de kaarten waar
     hij het hardst nodig is: een verse kaart mist drie velden en dan sneed
     slice(0,3) hem er precies af. Eén cv inlezen vult in één handeling wat
     hier per veld gevraagd wordt, dus bij twee of meer gaten staat hij
     vooraan en opvallend; anders sluit hij gewoon achteraan aan. */
  const sterk = uit.length >= 2;
  const cvGat = {k:'__cv', lbl:'CV inlezen', sterk};
  return sterk ? [cvGat, ...uit.slice(0,2)] : [...uit, cvGat].slice(0,3);
}
function mistHtml(c){
  const g = gaten(c);
  return `<div class="card-f kd-mist" id="kd_mist"${g.length?'':' hidden'}>${g.length ? `
    <span class="label">Wat mist nog</span>
    ${g.map(x => `<button type="button" class="chip btn-like kd-mistchip${x.sterk?' sterk':''}" data-mist="${h(x.k)}"
      title="${x.sterk?'Vult in één keer meerdere velden':'Meteen invullen'}">${h(x.lbl)}</button>`).join('')}
    <span class="spacer"></span>
    <span class="meta">klik om het meteen in te vullen</span>` : ''}</div>`;
}
function bindMist(root, c){
  (root || document).querySelectorAll('[data-mist]').forEach(b => b.onclick = () => {
    if(b.dataset.mist === '__cv') return cvLezen(c);
    springNaarVeld(b.dataset.mist, c);
  });
}
/* Naar een veld springen en het meteen in bewerkmodus zetten. */
function springNaarVeld(k, c){
  const span = document.querySelector('.kd-w[data-veld="' + CSS.escape(k) + '"]');
  if(!span) return;
  span.scrollIntoView({behavior:'smooth', block:'center'});
  span.classList.add('kd-wijs');
  setTimeout(() => span.classList.remove('kd-wijs'), 1500);
  /* Even wachten: anders opent het invoerveld terwijl de pagina nog rolt. */
  setTimeout(() => { if(span.isConnected) bewerkVeld(span, c || CRM.kandidaat(kandOpen)); }, 280);
}

/* ─── De kop van een geanonimiseerde kaart ──────────────────────
   Op een kaart waarvan de gegevens net op verzoek gewist zijn, stonden
   "Profiel compleet 45%", "Wat mist nog: Telefoon · E-mailadres" en "5 dagen
   niet gesproken". Dat is het systeem dat aandringt op precies de gegevens
   die het zojuist bewust heeft weggegooid, en het leest als een fout.

   Drie keer een andere oplossing, om drie verschillende redenen:
   - de voortgangsmeter wordt vervángen. Weglaten zou een gat in de kop
     achterlaten en, erger, niets zeggen — terwijl er juist iets uit te
     leggen valt. Er staat nu wat er gebeurd is.
   - de strip "Wat mist nog" verdwijnt. Die bestaat om ergens heen te
     klikken en iets in te vullen; er valt hier niets in te vullen. Een
     strip die "niets mist" zegt zou bovendien niet waar zijn.
   - de stiltechip verdwijnt (zie stilteChip). "Vijf dagen niet gesproken"
     is een belsuggestie, en dit is de enige kandidaat die je niet belt. */
function anonMeterHtml(){
  return `<div class="kd-meter kd-anonmeter">
    <div class="label">Gegevens gewist</div>
    <p class="kd-anontekst">De persoonsgegevens van deze kandidaat zijn op verzoek verwijderd.
      De kaart blijft bestaan zodat de plaatsing in de cijfers blijft kloppen.
      Wat hier leeg is, hoort leeg te zijn.</p>
  </div>`;
}

/* ─── Plaatsbaarheidsstrip ────────────────────────────────────────
   De vier vragen die bepalen of iemand plaatsbaar is — beschikbaarheid,
   ploegen, vervoer + reisafstand, salariswens — als één rij chips direct
   onder de kop. Groen = kan, amber = knelt, grijs = nog leeg. Elke chip
   springt naar zijn veld, ook als hij al gevuld is: tijdens een telefoon-
   gesprek is dit de kortste route naar corrigeren. */
function stripHtml(c){
  if(geanonimiseerd(c)) return '';
  const chip = (veld, kleur, tekst, tip) =>
    `<button type="button" class="chip btn-like kd-pchip ${kleur}" data-strip="${h(veld)}"
       title="${h(tip || 'Klik om te wijzigen')}">${tekst}</button>`;
  const uit = [];

  const BES = {direct:['green','per direct'], 'in overleg':['amber','in overleg'], niet:['red','niet beschikbaar']};
  uit.push(c.beschikbaar
    ? chip('beschikbaar', BES[c.beschikbaar]?.[0] || '', h(BES[c.beschikbaar]?.[1] || c.beschikbaar))
    : chip('beschikbaar', 'leeg', 'beschikbaar?'));

  uit.push(c.ploegen
    ? chip('ploegen', c.ploegen === 'geen' ? 'amber' : 'green', h(c.ploegen === 'geen' ? 'geen ploegen' : c.ploegen),
        c.ploegen === 'geen' ? 'Wil geen ploegendienst — in productie en logistiek knelt dat vaak' : '')
    : chip('ploegen', 'leeg', 'ploegen?'));

  /* Vervoer + reisafstand in één chip: los van elkaar zeggen ze weinig.
     De grenzen zijn dezelfde als in de matching (js/data.js), geen eigen norm. */
  const w = werkplek(c);
  const km = (w && c.woonplaats) ? CRM.afstandKm(c.woonplaats, w.plaats) : null;
  if(c.vervoer){
    const grens = c.vervoer === 'auto' ? REIS_VER : c.vervoer === 'elektrische fiets' ? 25
                : c.vervoer === 'fiets' ? 15 : c.vervoer === 'geen' ? 5 : REIS_VER_ZONDER_AUTO;
    const ver = km != null && km >= grens;
    uit.push(chip('vervoer', ver ? 'amber' : 'green',
      h(c.vervoer) + (km != null ? ` · <span class="num">${km}</span> km` : ''),
      ver ? `${km} km naar ${w.plaats} is ver met ${c.vervoer} — reistijd is een vaste uitvalreden` : ''));
  }else uit.push(chip('vervoer', 'leeg', 'vervoer?'));

  const wens = lees(c, 'cv.salariswens');
  uit.push(wens
    ? chip('cv.salariswens', 'green', h(euroMnd(wens)))
    : chip('cv.salariswens', 'leeg', 'salariswens?'));

  return `<div class="kd-strip"><span class="label">Plaatsbaar?</span>${uit.join('')}</div>`;
}
function bindStrip(mount, c){
  mount.querySelectorAll('[data-strip]').forEach(b => b.onclick = () => springNaarVeld(b.dataset.strip, c));
}

/* ─── Dealbalk ────────────────────────────────────────────────────
   De AM-vraag in één regel: welke deal, welke fase, W&S of Flex, wat mist
   er voor de fee, en wat is de eerstvolgende stap. Alles wat erop staat
   bestaat al elders op de kaart — dit is een nieuwe plek, geen nieuw veld. */
function dealbalkHtml(c){
  if(geanonimiseerd(c) || !c.klant) return '';
  const v = c.vacatureId ? (CRM.state.vacs || []).find(x => String(x.id) === String(c.vacatureId)) : null;
  const deal = v ? `${v.functie || 'vacature'} · ${v.klant}` : `${c.functie || 'functie?'} · ${c.klant}`;

  let feeTxt = '';
  if(CRM.fee){
    try{
      const mist = CRM.fee.watMist(c, CRM.fee.voorKlant(c.klant, c.geplaatstOp || null)) || [];
      feeTxt = mist.length ? `<span class="knel">nog ${mist.length} in te vullen</span>` : 'compleet';
    }catch(e){ feeTxt = ''; }
  }

  /* De eerstvolgende stap: een geplande afspraak wint van de actiedatum,
     want die is hard. Daarna de volgende actie; anders vraagt de balk erom. */
  const vd = CRM.todayISO();
  let stap = '', stapVeld = 'volgendeActie';
  if(c.datum && c.datum >= vd){ stap = `afspraak ${CRM.fmtDate(c.datum)}${c.tijd ? ' · ' + c.tijd : ''}`; stapVeld = 'datum'; }
  else if(c.volgendeActie) stap = c.volgendeActie + (c.actieDatum ? ` · ${CRM.fmtDate(c.actieDatum)}` : '');

  const cel = (lbl, inhoud, veld, tip) => `<span class="kd-dealcel${veld ? ' klik' : ''}"${veld ? ` data-deal="${h(veld)}"` : ''}
      ${tip ? ` title="${h(tip)}"` : ''}><span class="dl">${h(lbl)}</span>${inhoud}</span>`;
  return `<div class="kd-dealbalk">
    ${cel('Deal', h(deal))}
    ${cel('Fase', h(CRM.faseNorm(c.fase) || 'instroom'))}
    ${cel('Type', c.type ? h(c.type) : '<span class="leeg">invullen…</span>', 'type', 'W&S of Flex — bepaalt of er een fee is')}
    ${feeTxt ? cel('Fee', feeTxt, '', 'Zie het blok "Klaar voor facturatie" onderaan de kaart') : ''}
    <span class="spacer"></span>
    <button type="button" class="kd-dealstap" data-deal="${h(stapVeld)}"
      title="Klik om de volgende stap te wijzigen">${stap ? 'Volgende: ' + h(stap) : 'Volgende stap invullen…'}</button>
  </div>`;
}
function bindDealbalk(mount, c){
  mount.querySelectorAll('[data-deal]').forEach(b => b.onclick = () => springNaarVeld(b.dataset.deal, c));
}

/* ─── Snelbalk (6 aug 2026) ───────────────────────────────────────
   Eén invoerregel bovenaan de werkkolom: typen en kiezen wat het is.
   Stond dit alleen in de knoppenbalk bovenin, dan opende elke handeling
   een venster óver de kaart — precies op het moment dat je de kandidaat
   wil blijven zien. Nu: typ, Enter, klaar. De knoppen erachter gebruiken
   dezelfde tekst, zodat je nooit twee keer hetzelfde typt. */
function snelbalkHtml(c){
  if(geanonimiseerd(c)) return '';
  return `<div class="kd-snelrij">
    <textarea id="kd_snel" rows="1" placeholder="Wat is er gebeurd of moet er gebeuren?"
      title="Enter legt het vast als notitie. Noem een collega met @naam om diegene een melding te sturen."></textarea>
    <div class="row tight kd-snelknoppen">
      <button type="button" class="btn sm" data-snel="notitie">Notitie</button>
      <button type="button" class="btn ghost sm" data-snel="bel">Gebeld</button>
      <button type="button" class="btn ghost sm" data-snel="whatsapp">Geappt</button>
      <button type="button" class="btn ghost sm" data-snel="taak">Taak…</button>
    </div>
  </div>`;
}
function bindSnelbalk(mount, c){
  const ta = mount.querySelector('#kd_snel');
  if(!ta) return;
  const tekstOf = () => ta.value.trim();
  const doe = async soort => {
    const tekst = tekstOf();
    if(soort === 'taak') return nieuweTaak(c, tekst);      // venster: er hoort een wie en wanneer bij
    if(!tekst){ ta.focus(); return; }
    if(soort === 'notitie'){
      const nieuw = Object.assign({}, c, {
        notities:[{op:new Date().toISOString(), door:CRM.me(), tekst}].concat(c.notities||[])
      });
      await bewaarKandidaat(nieuw);
      CRM.verwerkTags(tekst, 'kandidaat', c.id);
      tabActief = 'activiteiten';
    }else{
      await CRM.logActiviteit('kandidaat', c.id, soort, tekst);
      CRM.verwerkTags(tekst, 'kandidaat', c.id);
      CRM.toast('Vastgelegd','ok');
      tabActief = 'activiteiten';
    }
    CRM.render();
  };
  mount.querySelectorAll('[data-snel]').forEach(b => b.onclick = () => doe(b.dataset.snel));
  ta.onkeydown = e => { if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); doe('notitie'); } };
  /* Meegroeien met wat je typt, tot een paar regels — een balk die bij de
     tweede zin gaat schuiven leest niet prettig. */
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; };
}

function kopHtml(c){
  const anon = geanonimiseerd(c);
  const v = CRM.volledigheid(c);
  const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : 'green';
  const gold = isGolden(c.id);
  return `<div class="card"><div class="card-b kd-hero">
    <div style="min-width:0;flex:1">
      <div class="h1" style="font-size:24px">${c.naam ? h(c.naam) : '<span class="kd-geennaam">Naam nog niet ingevuld</span>'}${gold?' '+goldenSter('lg'):''}</div>
      ${sterrenHtml(c)}
      <div class="sub" style="margin-top:3px">
        ${h(c.functie||'Functie nog niet ingevuld')}
        ${c.klant?` · <a href="#klanten/${encodeURIComponent(c.klant)}" data-klant="${h(c.klant)}">${h(c.klant)}</a>`:''}
        ${c.woonplaats?' · '+h(c.woonplaats):''}
      </div>
      <div class="row tight" style="margin-top:9px">
        <button type="button" class="chip btn-like kd-goldbtn${gold?' aan':''}" id="c_golden"
          title="${gold?'Klik om de golden-markering weg te halen':'Markeer als golden candidate: goede kandidaat, nu geen passende vacature'}">★ Golden candidate</button>
        ${faseChip(c.fase)}
        ${c.rec?`<span class="chip">Recruiter ${h(c.rec)}</span>`:''}
        ${c.type?`<span class="chip">${h(c.type)}</span>`:''}
        ${stilteChip(c)}
        ${c.noShows?`<span class="chip red"><span class="num">${c.noShows}</span> no-show</span>`:''}
      </div>
      <div class="kd-contact">
        ${c.telefoon?`<a class="num" href="${h(telLink(c.telefoon))}">${h(c.telefoon)}</a>
          <a class="btn sub sm" href="${h(waLink(c.telefoon))}" target="_blank" rel="noopener">WhatsApp</a>`:'<span class="meta">Geen telefoonnummer</span>'}
        ${c.email?`<a href="mailto:${h(c.email)}">${h(c.email)}</a>
          <button type="button" class="btn sub sm" id="c_mail">Mailen</button>`:'<span class="meta">Geen e-mailadres</span>'}
        ${outlookAan() && (c.email || c.telefoon)
          ? `<button type="button" class="btn sub sm" id="c_outlook"
              title="Zet deze kandidaat in je Outlook-adresboek, dan ziet je telefoon wie er belt">Naar Outlook</button>` : ''}
      </div>
    </div>
    ${anon ? anonMeterHtml() : `<div class="kd-meter">
      <div class="label">Profiel compleet</div>
      <div class="row tight" style="flex-wrap:nowrap;margin:6px 0 8px">
        <div style="flex:1">${CRM.ui.bar(v.pct, kleur==='green'?'green':kleur)}</div>
        <b class="num">${v.pct}%</b>
      </div>
      ${v.mist.length
        ? `<div class="meta">Nog invullen: ${v.mist.map(m=>h(m.lbl.toLowerCase())).join(', ')}</div>`
        : '<div class="meta">Alles ingevuld — netjes.</div>'}
    </div>`}
  </div>${stripHtml(c)}${anon ? '' : mistHtml(c)}</div>`;
}

/* ─── Kandidaatgegevens (inline bewerkbaar) ───────────────────── */
function gegevensHtml(c){
  const uitCv = Array.isArray(c.cv && c.cv.uitCv) ? c.cv.uitCv : [];
  return `<div class="card">
    <div class="card-h"><div class="h2">Kandidaatgegevens</div>
      <span class="meta">klik een waarde om te wijzigen</span></div>
    <div class="card-b"><div class="kd-velden">${VELDEN.map(f => {
      const w = toonWaarde(f, lees(c, f.k));
      const rij = `<div class="kd-veld"><span class="label">${h(f.lbl)}</span>
        <span><span class="kd-w${w?'':' leeg'}" data-veld="${h(f.k)}" tabindex="0" role="button">${w?h(w):'invullen…'}</span>${
          w && uitCv.includes(f.k) ? ' <span class="chip green kd-cvchip" title="Automatisch overgenomen uit het CV">uit CV</span>' : ''
        }</span></div>`;
      /* De reisafstand staat pal onder vervoer en woonplaats, want pas samen
         zeggen die drie iets: 40 km met een auto is een ander verhaal dan
         40 km zonder. Bewust géén eigen kaart — de kandidatenkaart is vol. */
      return rij + (f.k === 'vervoer' ? reisafstandRij(c) : '');
    }).join('')}</div></div></div>`;
}

/* "Huidige situatie" stond hier als eigen blok. Het is opgegaan in
   Werkervaring (zie ervaringHtml): waar iemand nú zit en wat hij eerder
   deed is één verhaal, en het stond in twee kaarten onder elkaar
   (naam: Tjeerd, 6 aug 2026: "dit is namelijk hetzelfde"). De velden
   zelf (SITUATIE_VELDEN) zijn ongewijzigd. */

function bindVelden(mount, c){
  mount.querySelectorAll('.kd-w').forEach(span => {
    span.onclick = () => bewerkVeld(span, c);
    span.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); bewerkVeld(span, c); } };
  });
}

function bewerkVeld(span, c){
  if(span.dataset.bezig) return;
  span.dataset.bezig = '1';
  const veld = ALLE_VELDEN.find(f => f.k === span.dataset.veld);
  const ruw  = lees(c, veld.k);
  const start = veld.lijst ? (Array.isArray(ruw) ? ruw.join(', ') : (ruw||'')) : (ruw == null ? '' : String(ruw));
  /* opts mag een lijst zijn óf een functie (dynamisch, bv. de gestopte
     kandidaten voor "Vervangt"), en een optie mag {v,l} zijn als de
     opgeslagen waarde iets anders is dan wat je leest (id ↔ naam). */
  const opts = typeof veld.opts === 'function' ? veld.opts(c) : (veld.opts || []);
  const el = veld.t === 'select'
    ? Object.assign(document.createElement('select'), {innerHTML:
        opts.map(o => { const v = (o && typeof o === 'object') ? o.v : o;
                        const l = (o && typeof o === 'object') ? o.l : (o || '—');
          return `<option value="${h(v)}"${String(start)===String(v)?' selected':''}>${h(l)}</option>`; }).join('')})
    : Object.assign(document.createElement('input'), {type:veld.t, value:start});
  el.className = 'kd-inp';
  span.replaceWith(el);
  el.focus();
  if(el.select) el.select();

  let klaar = false;
  const sluit = async (bewaren) => {
    if(klaar) return; klaar = true;
    let nieuw = el.value;
    if(bewaren){
      if(veld.lijst) nieuw = String(nieuw).split(',').map(s=>s.trim()).filter(Boolean);
      else if(veld.t === 'number') nieuw = nieuw === '' ? null : Number(nieuw);
      else nieuw = String(nieuw).trim();
      schrijf(c, veld.k, nieuw);
      await bewaarKandidaat(c);
    }
    const w = toonWaarde(veld, lees(c, veld.k));
    const nieuwSpan = document.createElement('span');
    nieuwSpan.className = 'kd-w' + (w ? '' : ' leeg');
    nieuwSpan.dataset.veld = veld.k;
    nieuwSpan.tabIndex = 0;
    nieuwSpan.textContent = w || 'invullen…';
    el.replaceWith(nieuwSpan);
    nieuwSpan.onclick = () => bewerkVeld(nieuwSpan, c);
    nieuwSpan.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); bewerkVeld(nieuwSpan, c); } };
    if(bewaren){
      /* Hetzelfde veld kan in twee blokken staan (bv. functie in
         Kandidaatgegevens én Huidige situatie) — houd ze gelijk. */
      document.querySelectorAll('.kd-w[data-veld="' + CSS.escape(veld.k) + '"]').forEach(s => {
        if(s === nieuwSpan) return;
        s.textContent = w || 'invullen…';
        s.classList.toggle('leeg', !w);
      });
      meterBij(c);
      salarisBij(c);
    }
  };
  el.onblur = () => sluit(true);
  el.onkeydown = e => {
    if(e.key === 'Enter'){ e.preventDefault(); sluit(true); }
    if(e.key === 'Escape'){ e.preventDefault(); sluit(false); }
  };
  if(veld.t === 'select') el.onchange = () => sluit(true);
}

/* Totaal-jaarsalaris live bijwerken na het wijzigen van een looncomponent. */
function salarisBij(c){
  const el = document.querySelector('#kd_totsal');
  if(el) el.innerHTML = totaalRegel(c);
}

/* Volledigheidsmeter én de "Wat mist nog"-regel bijwerken zonder het
   hele scherm te hertekenen. */
function meterBij(c){
  /* Op een geanonimiseerde kaart bestaan die twee blokken niet (zie
     kopHtml). Ze hier alsnog terugzetten zou het gewiste profiel opnieuw
     om gegevens laten vragen. */
  if(geanonimiseerd(c)) return;
  const mist = document.querySelector('#kd_mist');
  if(mist){
    const nieuw = document.createElement('div');
    nieuw.innerHTML = mistHtml(c);
    mist.replaceWith(nieuw.firstElementChild);
    bindMist(document, c);
  }
  const wrap = document.querySelector('.kd-meter');
  if(!wrap) return;
  const v = CRM.volledigheid(c);
  const kleur = v.pct < 40 ? 'red' : v.pct < 60 ? 'amber' : 'green';
  wrap.innerHTML = `<div class="label">Profiel compleet</div>
    <div class="row tight" style="flex-wrap:nowrap;margin:6px 0 8px">
      <div style="flex:1">${CRM.ui.bar(v.pct, kleur)}</div><b class="num">${v.pct}%</b></div>
    ${v.mist.length ? `<div class="meta">Nog invullen: ${v.mist.map(m=>h(m.lbl.toLowerCase())).join(', ')}</div>`
                    : '<div class="meta">Alles ingevuld — netjes.</div>'}`;
}

/* ─── Certificaten met geldigheidsdatum ───────────────────────────
   Een klant wil weten of die VCA of dat heftruckcertificaat nóg geldig is.
   Tot nu toe was cv.certificaten een lijst losse teksten.

   OPSLAG — bewust géén objecten in cv.certificaten. js/cv.js (het
   kandidaatprofiel dat naar de klant gaat) en js/recruitment.js zetten elk
   element rechtstreeks door String(); een object zou daar als
   "[object Object]" op het vel van de klant belanden, en die bestanden zijn
   niet van deze module. Daarom blijft cv.certificaten een lijst strings —
   precies de oude vorm, dus elke bestaande lezer werkt door — en staat de
   datum ernaast in cv.certGeldig: { sleutel: 'JJJJ-MM-DD' }, ook in het
   bestaande cv-jsonb. Bij het LEZEN accepteren we allebei de vormen (string
   én {naam, geldigTot}), zodat het blijft werken als een andere module ooit
   tóch objecten wegschrijft; bij het opslaan normaliseren we terug.
   De sleutel is de naam in kleine letters: twee identieke certificaatnamen
   op één kaart delen dus één datum — die kwamen we nergens tegen. */
const certSleutel = s => String(s == null ? '' : s).trim().toLowerCase();
const isDatum = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s == null ? '' : s));
/* alles=true houdt ook regels zonder naam vast. Nodig zodra de
   certificaten een formulier zijn: een net toegevoegde, nog lege regel zou
   anders meteen weer van het scherm verdwijnen. Overal waar er iets
   geteld of getoond wordt blijft de gefilterde lijst gelden. */
function certLijst(c, alles){
  const cv = c.cv || {};
  const map = (cv.certGeldig && typeof cv.certGeldig === 'object') ? cv.certGeldig : {};
  return (Array.isArray(cv.certificaten) ? cv.certificaten : []).map(x => {
    const obj = x && typeof x === 'object';
    const naam = String((obj ? (x.naam || x.certificaat || x.titel) : x) || '').trim();
    const eigen = obj ? (x.geldigTot || x.geldig_tot || '') : '';
    return {naam, geldigTot: String(eigen || map[certSleutel(naam)] || '').trim()};
  }).filter(r => alles || r.naam);
}
/* Verlopen = de datum ligt achter ons. "Binnenkort" = binnen twee
   kalendermaanden (niet "62 dagen": een certificaat loopt op een datum af,
   niet na een aantal dagen). Geen datum ⇒ geen status: niet ingevuld is
   niet hetzelfde als ongeldig. */
function certStatus(iso){
  if(!isDatum(iso)) return null;
  if(iso < CRM.todayISO()) return {k:'verlopen', lbl:'verlopen', chip:'red'};
  const grens = new Date(); grens.setMonth(grens.getMonth() + 2);
  if(iso <= grens.toLocaleDateString('sv-SE')) return {k:'bijna', lbl:'verloopt binnenkort', chip:'amber'};
  return {k:'geldig', lbl:'', chip:''};
}
function certRij(r, i){
  const st = certStatus(r.geldigTot);
  const datum = !r.geldigTot ? '<span class="meta">geen geldigheidsdatum</span>'
    : isDatum(r.geldigTot) ? `<span class="num">geldig t/m ${h(CRM.fmtDate(r.geldigTot))}</span>`
    : `<span class="num">${h(r.geldigTot)}</span>`;
  return `<div class="kd-cert${st ? ' ' + st.k : ''}">
    <b>${h(r.naam)}</b>
    ${datum}
    ${st && st.chip ? `<span class="chip ${st.chip}">${h(st.lbl)}</span>` : ''}
    <button type="button" class="btn sub sm" data-cert="${i}">${r.geldigTot ? 'Wijzigen' : 'Datum erbij'}</button>
  </div>`;
}

function certModal(c, index){
  const rijen = certLijst(c);
  const r = index >= 0 ? rijen[index] : {naam:'', geldigTot:''};
  if(!r) return;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${index >= 0 ? 'Certificaat' : 'Certificaat toevoegen'}</div>
      <p class="sub" style="margin:6px 0 0">De geldigheidsdatum is optioneel — laat hem leeg als je hem niet weet.
      Niet ingevuld is niet hetzelfde als verlopen.</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="ct_naam">Certificaat</label>
        <input type="text" id="ct_naam" value="${h(r.naam)}" placeholder="VCA Basis"></div>
      <div class="f-row" style="margin-bottom:0"><label for="ct_tot">Geldig tot</label>
        <input type="date" id="ct_tot" value="${h(isDatum(r.geldigTot) ? r.geldigTot : '')}"></div>
    </div>
    <div class="modal-f">
      ${index >= 0 ? '<button class="btn ghost" id="ct_weg">Verwijderen</button><span class="spacer"></span>' : ''}
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="ct_ok">Opslaan</button>
    </div>`, {onOpen(m){
      const naamEl = m.querySelector('#ct_naam'), totEl = m.querySelector('#ct_tot');
      setTimeout(() => (index >= 0 ? totEl : naamEl).focus(), 60);
      m.querySelector('#ct_ok').onclick = async () => {
        const naam = naamEl.value.trim();
        if(!naam) return CRM.toast('Vul een naam in','err');
        CRM.modal.close();
        await certBewaar(c, index, naam, totEl.value);
      };
      const weg = m.querySelector('#ct_weg');
      if(weg) weg.onclick = async () => {
        /* CRM.bevestig hergebruikt hetzelfde modaalvenster, dus die vraag
           overschrijft dit formulier. Zeg je nee, dan zetten we het terug —
           anders sta je na "Annuleren" ineens weer op de kale kaart. */
        const ok = await CRM.bevestig('Certificaat verwijderen?', r.naam + ' verdwijnt van deze kaart.');
        if(!ok) return certModal(c, index);
        await certBewaar(c, index, '', '');
      };
    }});
}

async function certBewaar(c, index, naam, tot){
  const rijen = certLijst(c);
  const geldig = isDatum(tot) ? tot : '';
  if(index >= 0){
    if(!naam) rijen.splice(index, 1); else rijen[index] = {naam, geldigTot:geldig};
  }else rijen.push({naam, geldigTot:geldig});

  const cv = Object.assign({}, c.cv || {});
  cv.certificaten = rijen.map(r => r.naam);          // blijft een lijst strings
  const map = {};
  rijen.forEach(r => { if(r.geldigTot) map[certSleutel(r.naam)] = r.geldigTot; });
  if(Object.keys(map).length) cv.certGeldig = map; else delete cv.certGeldig;
  c.cv = cv;
  await bewaarKandidaat(c);
  await CRM.logActiviteit('kandidaat', c.id, 'systeem', index >= 0 && !naam
    ? 'Certificaat verwijderd'
    : 'Certificaat vastgelegd: ' + naam + (geldig ? ' (geldig t/m ' + CRM.fmtDate(geldig) + ')' : ' — geen geldigheidsdatum'));
  CRM.render();
}

/* ─── Werkervaring (6 aug 2026) ───────────────────────────────────
   Eén kop voor het hele arbeidsverleden. Bovenaan waar de kandidaat nú
   zit en wat hij wil verdienen (de oude "Huidige situatie"), daaronder
   de loopbaan, opleiding, certificaten en vaardigheden uit het cv. Ze
   stonden als twee kaarten onder elkaar terwijl het hetzelfde verhaal
   is. "CV inlezen" hoort daarom hier: dit is het blok dat ervan
   volloopt. */
function ervaringHtml(c){
  const cv = c.cv || {};
  const werk = Array.isArray(cv.werkgevers) ? cv.werkgevers : [];
  const opl  = Array.isArray(cv.opleidingen) ? cv.opleidingen : [];
  const skills = Array.isArray(cv.skills) ? cv.skills : [];
  const talen  = Array.isArray(cv.talen) ? cv.talen : (c.talen ? String(c.talen).split(',').map(s=>s.trim()).filter(Boolean) : []);
  const certs  = certLijst(c, true);
  const leeg = !werk.length && !opl.length && !skills.length && !certs.length
            && !cv.ervaringJaren && !cv.url && !cv.bestandPad;
  return `<div class="card">
    <div class="card-h"><div class="h2">Werkervaring</div>
      ${cv.ervaringJaren?`<span class="chip"><span class="num">${h(cv.ervaringJaren)}</span> jaar ervaring</span>`:''}
      <span class="spacer"></span>
      ${veiligeUrl(cv.url)?`<a class="btn ghost sm" href="${h(veiligeUrl(cv.url))}" target="_blank" rel="noopener">CV openen</a>`:''}
      <!-- Eén knop in de kop (naam: Tjeerd, 6 aug 2026: "cv inlezen is veel
           te groot, dat is zonde"). Toevoegen doe je vanaf hier bij de lijst
           waar het bij hoort — dat leest logischer dan vier knoppen boven
           een blok dat nog leeg is. -->
      ${/* Het bestandsblok stond middenin en knipte het blok doormidden
           (naam: Tjeerd, 6 aug 2026). Nu een knop in de kop; het bestand
           zelf staat compleet bij Documenten. */
        cv.bestandPad ? `<button class="btn ghost sm" data-cvopen="${h(cv.bestandPad)}"
          title="${h(cv.bestand || 'CV')}${cv.op ? ' · ' + h(CRM.fmtDate(cv.op)) : ''}">Open ingeladen cv</button>` : ''}
      <button class="btn ghost sm" id="c_cvlees">CV inlezen</button>
      ${/* Lezen of aanpassen — niet allebei tegelijk (naam: Tjeerd, 7 aug
           2026: "met allemaal vakken is het onoverzichtelijk"). In de
           leesstand staat het als een cv; klik je Aanpassen, dan worden het
           invulvelden. Opslaan gebeurt al tijdens het typen, dus de knop
           terug heet "Klaar" en niet "Opslaan" — er valt niets te verliezen. */''}
      <button class="btn ${ervBewerk?'':'ghost '}sm" id="c_ervbew">${ervBewerk?'Klaar':'Aanpassen'}</button></div>
    <div class="card-b">
      ${leeg ? `<p class="kd-ervleeg">Nog niets ingevuld. Lees een cv in — loopbaan, opleiding,
        certificaten en talen komen er in één keer in${CRM.cvClaude ? `, of laat een lastig opgemaakt cv
        <button type="button" class="lnk" id="c_cvclaude"
          title="Zet de cv-tekst met een opdracht op je klembord. Plak in Claude, plak het antwoord terug.">door Claude lezen</button>` : ''} —
        of vul het hieronder zelf aan.</p>` : ''}

      <!-- Elke lijst heeft zijn eigen toevoegknop, ook als hij leeg is: dan
           weet je waar je iets kwijt kunt zonder eerst een cv te hoeven
           inlezen. -->
      <!-- Eén doorlopend formulier: elk veld staat meteen open (naam:
           Tjeerd, 7 aug 2026 — "nu zie je allemaal aparte bewerkknoppen").
           Typen slaat vanzelf op, twee tellen na de laatste toets; alleen
           toevoegen, verwijderen en slepen tekenen het blok opnieuw. -->
      <div class="kd-ervkop"><span class="label">Loopbaan</span>
        ${ervBewerk?'<button class="btn sub sm" data-erv-add="werk">+ Toevoegen</button>':''}</div>
      ${!werk.length ? '<p class="meta kd-ervnog">Nog geen dienstverbanden.</p>'
        : !ervBewerk ? `<div class="kd-cvlijst">${werk.map(w => `<div class="kd-cvrij">
            <b>${h(w.functie||w.rol||'—')}</b>
            <span class="sub">${h(w.werkgever||w.bedrijf||'')}</span>
            <span class="meta num">${h([w.van,w.tot].filter(Boolean).join(' – ')||w.periode||'')}</span>
            ${Array.isArray(w.taken)&&w.taken.length?`<ul class="kd-cvtaken">${
              w.taken.map(t=>`<li>${h(t)}</li>`).join('')}</ul>`:''}
          </div>`).join('')}</div>`
        : `<div class="kd-ervlijst kd-sleep" data-sleep="werk">${werk.map((w, i) => `
        <div class="kd-ervblok" draggable="true" data-i="${i}">
          <div class="kd-ervrij1">
            <span class="kd-greep" title="Sleep om de volgorde te wijzigen">⠿</span>
            <input type="text" data-erv="werk|${i}|functie" value="${h(w.functie||w.rol||'')}" placeholder="Functie">
            <input type="text" data-erv="werk|${i}|werkgever" value="${h(w.werkgever||w.bedrijf||'')}" placeholder="Werkgever en plaats">
            <input type="text" data-erv="werk|${i}|periode" value="${h([w.van,w.tot].filter(Boolean).join(' – ')||w.periode||'')}" placeholder="09-2025 – 07-2026">
            <button type="button" class="kd-ervweg" data-erv-weg="werk|${i}" title="Deze functie verwijderen" aria-label="Verwijderen">×</button>
          </div>
          <textarea data-erv="werk|${i}|taken" rows="${Math.max(2,(Array.isArray(w.taken)?w.taken:[]).length)}"
            placeholder="Werkzaamheden — één per regel">${h((Array.isArray(w.taken)?w.taken:[]).join('\n'))}</textarea>
        </div>`).join('')}</div>`}

      <div class="kd-ervkop"><span class="label">Opleiding</span>
        ${ervBewerk?'<button class="btn sub sm" data-erv-add="opl">+ Toevoegen</button>':''}</div>
      ${!opl.length ? '<p class="meta kd-ervnog">Nog geen opleidingen.</p>'
        : !ervBewerk ? `<div class="kd-cvlijst">${opl.map(o => `<div class="kd-cvrij">
            <b>${h(o.opleiding||o.naam||'—')}</b>
            <span class="sub">${h(o.school||o.instituut||'')}</span>
            <span class="meta num">${h(o.jaar||o.periode||'')}</span>
          </div>`).join('')}</div>`
        : `<div class="kd-ervlijst">${opl.map((o,i) => `
        <div class="kd-ervrij1">
          <input type="text" data-erv="opl|${i}|opleiding" value="${h(o.opleiding||o.naam||'')}" placeholder="Opleiding">
          <input type="text" data-erv="opl|${i}|school" value="${h(o.school||o.instituut||'')}" placeholder="School en plaats">
          <input type="text" data-erv="opl|${i}|jaar" value="${h(o.jaar||o.periode||'')}" placeholder="2003 – 2007">
          <button type="button" class="kd-ervweg" data-erv-weg="opl|${i}" title="Verwijderen" aria-label="Verwijderen">×</button>
        </div>`).join('')}</div>`}

      <div class="kd-ervkop"><span class="label">Certificaten</span>
        ${ervBewerk?'<button class="btn sub sm" data-erv-add="cert">+ Toevoegen</button>':''}</div>
      ${!certs.length ? '<p class="meta kd-ervnog">Nog geen certificaten — denk aan VCA, heftruck of reachtruck.</p>'
        : !ervBewerk ? `<div class="kd-certs">${certs.filter(r=>r.naam).map(r => {
            const st = certStatus(r.geldigTot);
            return `<div class="kd-cert${st?' '+st.k:''}"><b>${h(r.naam)}</b>
              ${!r.geldigTot ? '<span class="meta">geen geldigheidsdatum</span>'
                : isDatum(r.geldigTot) ? `<span class="num">geldig t/m ${h(CRM.fmtDate(r.geldigTot))}</span>`
                : `<span class="num">${h(r.geldigTot)}</span>`}
              ${st && st.chip ? `<span class="chip ${st.chip}">${h(st.lbl)}</span>` : ''}</div>`;
          }).join('')}</div>`
        : `<div class="kd-ervlijst">${certs.map((r,i) => {
        const st = certStatus(r.geldigTot);
        return `<div class="kd-ervrij1${st?' '+st.k:''}">
          <input type="text" data-erv="cert|${i}|naam" value="${h(r.naam)}" placeholder="Bijv. VCA Basis">
          <input type="date" data-erv="cert|${i}|geldigTot" value="${h(isDatum(r.geldigTot)?r.geldigTot:'')}" title="Geldig tot en met">
          ${st && st.chip ? `<span class="chip ${st.chip}">${h(st.lbl)}</span>` : '<span></span>'}
          <button type="button" class="kd-ervweg" data-erv-weg="cert|${i}" title="Verwijderen" aria-label="Verwijderen">×</button>
        </div>`; }).join('')}</div>`}

      <!-- Vaardigheden waren alleen te vullen door een cv in te lezen; nu
           kun je ze ook zelf toevoegen (naam: Tjeerd, 6 aug 2026). -->
      <div class="kd-ervkop"><span class="label">Vaardigheden</span>
        <button class="btn sub sm" id="c_skillnieuw">+ Toevoegen</button></div>
      ${skills.length?`<div class="row tight kd-skills kd-sleep" data-sleep="skills">${skills.map((s,i)=>
        `<span class="chip kd-skill" draggable="true" data-i="${i}" title="Sleep om de volgorde te wijzigen">${h(s)}<button type="button" class="kd-skillweg" data-skillweg="${i}"
           title="Verwijderen" aria-label="Verwijder ${h(s)}">×</button></span>`).join('')}</div>`
        :'<p class="meta kd-ervnog">Nog geen vaardigheden — bijvoorbeeld orderpicken, lassen of WMS-ervaring.</p>'}

      <!-- Talen stonden alleen als leesbare chips uit het cv; ze zijn nu
           net als vaardigheden aan te vullen, weg te halen en te slepen. -->
      <div class="kd-ervkop"><span class="label">Talen</span>
        <button class="btn sub sm" id="c_taalnieuw">+ Toevoegen</button></div>
      ${talen.length?`<div class="row tight kd-skills kd-sleep" data-sleep="talen">${talen.map((s,i)=>
        `<span class="chip kd-skill" draggable="true" data-i="${i}" title="Sleep om de volgorde te wijzigen">${h(s)}<button type="button" class="kd-skillweg" data-taalweg="${i}"
           title="Verwijderen" aria-label="Verwijder ${h(s)}">×</button></span>`).join('')}</div>`
        :'<p class="meta kd-ervnog">Nog geen talen — bijvoorbeeld Nederlands, Engels of Pools.</p>'}
    </div></div>`;
}

/* ─── Werkervaring als doorlopend formulier ───────────────────────
   Loopbaan, opleiding en certificaten staan als gewone invulvelden op de
   kaart, niet achter een bewerkknop per regel (naam: Tjeerd, 7 aug 2026).
   Typen slaat vanzelf op — twee tellen na de laatste toets, en meteen bij
   het verlaten van het veld. Alléén toevoegen, verwijderen en slepen
   tekenen het blok opnieuw; tijdens het typen niet, want dan zou de cursor
   uit het veld springen.

   Certificaten zijn een bijzonder geval: ze staan historisch soms als
   losse tekst in cv.certificaten en soms als object, met de geldigheid
   in een aparte map cv.certGeldig. Bij het schrijven maken we er één vorm
   van (objecten), zodat er nog maar één plek is waar de waarheid staat. */
const ERV_LIJST = {werk:'werkgevers', opl:'opleidingen', cert:'certificaten'};
/* Lezen of aanpassen. Niet onthouden tussen kandidaten: je opent een kaart
   om te kijken, niet om te typen. */
let ervBewerk = false;
let _ervTimer = null;

/* Altijd DEZELFDE array teruggeven, niet een kopie. Met een kopie las elk
   veld de opgeslagen versie van vóór de vorige wijziging, en overschreef
   het laatste veld de rest — vul je vier velden achter elkaar in, dan bleef
   alleen het laatste staan. Nu stapelen de wijzigingen in het geheugen en
   gaat er één keer een opslag naar de database. */
function ervLijst(c, soort){
  if(!c.cv || typeof c.cv !== 'object') c.cv = {};
  const veld = ERV_LIJST[soort];
  /* Certificaten stonden historisch soms als losse tekst met de geldigheid
     in een aparte map. Bij de eerste wijziging maken we er objecten van,
     zodat er nog maar één plek is waar de datum staat. */
  if(soort === 'cert' && !c.cv._certOk){
    c.cv.certificaten = certLijst(c, true);
    delete c.cv.certGeldig;
    c.cv._certOk = true;
  }
  if(!Array.isArray(c.cv[veld])) c.cv[veld] = [];
  return c.cv[veld];
}
async function ervBewaar(c, herteken){
  await bewaarKandidaat(c);
  if(herteken) CRM.render();
}

function bindErvaring(mount, c){
  { const b = mount.querySelector('#c_ervbew');
    if(b) b.onclick = () => { ervBewerk = !ervBewerk; CRM.render(); }; }
  /* Typen: meteen in het geheugen bijwerken, pas na een korte stilte opslaan.
     Tijdens het typen wordt er niet hertekend — anders springt de cursor
     uit het veld. */
  mount.querySelectorAll('[data-erv]').forEach(el => {
    const schrijf = meteen => {
      const [soort, i, sleutel] = el.dataset.erv.split('|');
      const lijst = ervLijst(c, soort);
      if(!lijst[+i]) lijst[+i] = {};
      lijst[+i][sleutel] = sleutel === 'taken'
        ? el.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
        : el.value.trim();
      clearTimeout(_ervTimer);
      if(meteen) ervBewaar(c, false);
      else _ervTimer = setTimeout(() => ervBewaar(c, false), 2000);
    };
    el.oninput  = () => schrijf(false);
    el.onchange = () => schrijf(true);      // datumvelden vuren geen input
    el.onblur   = () => schrijf(true);
  });
  mount.querySelectorAll('[data-erv-add]').forEach(b => b.onclick = async () => {
    const soort = b.dataset.ervAdd;
    ervLijst(c, soort).push(
      soort === 'werk' ? {functie:'', werkgever:'', periode:'', taken:[]}
      : soort === 'opl' ? {opleiding:'', school:'', jaar:''}
      : {naam:'', geldigTot:''});
    await ervBewaar(c, true);
  });
  mount.querySelectorAll('[data-erv-weg]').forEach(b => b.onclick = async () => {
    const [soort, i] = b.dataset.ervWeg.split('|');
    const lijst = ervLijst(c, soort);
    const rij = lijst[+i] || {};
    const gevuld = Object.values(rij).some(v => Array.isArray(v) ? v.length : String(v||'').trim());
    const wat = soort === 'werk' ? 'dit dienstverband' : soort === 'opl' ? 'deze opleiding' : 'dit certificaat';
    if(gevuld && !await CRM.bevestig('Verwijderen?', 'Weet je zeker dat je ' + wat + ' wilt weghalen?')) return;
    lijst.splice(+i, 1);
    await ervBewaar(c, true);
  });
}

/* ─── Vaardigheden: zelf toevoegen en weghalen ────────────────────
   Ze komen normaal uit het cv (cv.skills), maar lang niet elk cv noemt
   ze en een AM hoort er eentje bij te kunnen zetten na een gesprek.
   Zelfde veld, zodat de cv-generator en de matching er niets van merken. */
async function vaardigheidToevoegen(c){
  const tekst = await CRM.vraag('Vaardigheid toevoegen',
    {hint:'Eén per keer, of meerdere gescheiden door een komma.', knop:'Toevoegen'});
  if(!tekst) return;
  const nieuwe = String(tekst).split(',').map(s => s.trim()).filter(Boolean);
  if(!nieuwe.length) return;
  const cv = Object.assign({}, c.cv || {});
  const huidig = Array.isArray(cv.skills) ? cv.skills.slice() : [];
  /* Dubbel toevoegen levert een rij identieke chips op; vergelijken zonder
     hoofdletters, want "Heftruck" en "heftruck" zijn hetzelfde. */
  nieuwe.forEach(s => {
    if(!huidig.some(x => String(x).toLowerCase() === s.toLowerCase())) huidig.push(s);
  });
  cv.skills = huidig;
  await bewaarKandidaat(Object.assign({}, c, {cv}));
  CRM.render();
}
async function vaardigheidWeg(c, i){
  const cv = Object.assign({}, c.cv || {});
  const huidig = Array.isArray(cv.skills) ? cv.skills.slice() : [];
  if(i < 0 || i >= huidig.length) return;
  huidig.splice(i, 1);
  cv.skills = huidig;
  await bewaarKandidaat(Object.assign({}, c, {cv}));
  CRM.render();
}

/* ─── Talen ───────────────────────────────────────────────────────
   Stonden alleen als leesbare chips uit het cv. Het losse veld `talen`
   op de kandidaat (waar Sourcing op filtert) blijft de leidende waarde;
   we houden beide gelijk zodat filteren en de cv-generator hetzelfde
   zien. */
async function taalToevoegen(c){
  const tekst = await CRM.vraag('Taal toevoegen',
    {hint:'Eén per keer, of meerdere gescheiden door een komma.', knop:'Toevoegen'});
  if(!tekst) return;
  const nieuwe = String(tekst).split(',').map(s => s.trim()).filter(Boolean);
  if(!nieuwe.length) return;
  const lijst = taalLijst(c).slice();
  nieuwe.forEach(s => {
    if(!lijst.some(x => String(x).toLowerCase() === s.toLowerCase())) lijst.push(s);
  });
  await bewaarTalen(c, lijst);
}
async function taalWeg(c, i){
  const lijst = taalLijst(c).slice();
  if(i < 0 || i >= lijst.length) return;
  lijst.splice(i, 1);
  await bewaarTalen(c, lijst);
}
const taalLijst = c => {
  const cv = c.cv || {};
  if(Array.isArray(cv.talen)) return cv.talen;
  return c.talen ? String(c.talen).split(',').map(s=>s.trim()).filter(Boolean) : [];
};
async function bewaarTalen(c, lijst){
  const cv = Object.assign({}, c.cv || {}, {talen: lijst});
  await bewaarKandidaat(Object.assign({}, c, {cv, talen: lijst.join(', ')}));
  CRM.render();
}

/* ─── Slepen om de volgorde te wijzigen ───────────────────────────
   De volgorde is niet cosmetisch: het kandidaatprofiel dat naar de klant
   gaat neemt deze lijsten over zoals ze hier staan (naam: Tjeerd, 6 aug
   2026 — "dat maakt het daarna makkelijker om een cv te genereren"). Wat
   het meest relevant is voor déze vacature zet je dus bovenaan.
   Bewust de ingebouwde sleepfunctie van de browser: geen bibliotheek,
   en het werkt met een muis én met een touchpad. */
function bindSleep(mount, c){
  mount.querySelectorAll('.kd-sleep').forEach(lijst => {
    const soort = lijst.dataset.sleep;
    let van = null;
    lijst.querySelectorAll('[draggable="true"]').forEach(el => {
      el.ondragstart = e => {
        van = Number(el.dataset.i);
        el.classList.add('sleept');
        /* Zonder een gezette waarde weigert Firefox het slepen te starten. */
        try{ e.dataTransfer.setData('text/plain', String(van)); }catch(err){}
        e.dataTransfer.effectAllowed = 'move';
      };
      el.ondragend = () => {
        el.classList.remove('sleept');
        lijst.querySelectorAll('.doel').forEach(x => x.classList.remove('doel'));
      };
      el.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('doel'); };
      el.ondragleave = () => el.classList.remove('doel');
      el.ondrop = async e => {
        e.preventDefault();
        el.classList.remove('doel');
        const naar = Number(el.dataset.i);
        const start = van != null ? van : Number(e.dataTransfer.getData('text/plain'));
        if(!Number.isFinite(start) || !Number.isFinite(naar) || start === naar) return;
        await zetVolgorde(c, soort, start, naar);
      };
    });
  });
}
async function zetVolgorde(c, soort, van, naar){
  const cv = Object.assign({}, c.cv || {});
  const bron = soort === 'werk' ? (Array.isArray(cv.werkgevers) ? cv.werkgevers : [])
             : soort === 'skills' ? (Array.isArray(cv.skills) ? cv.skills : [])
             : taalLijst(c);
  const lijst = bron.slice();
  if(van < 0 || van >= lijst.length || naar < 0 || naar >= lijst.length) return;
  const [eruit] = lijst.splice(van, 1);
  lijst.splice(naar, 0, eruit);
  if(soort === 'talen') return bewaarTalen(c, lijst);
  if(soort === 'werk') cv.werkgevers = lijst; else cv.skills = lijst;
  await bewaarKandidaat(Object.assign({}, c, {cv}));
  CRM.render();
}

/* Het cv-bestand zelf: pad in de afgeschermde map, geopend met een
   tijdelijke link. Zie js/cvparse.js. */
function cvBestandHtml(c){
  return CRM.cvParse ? CRM.cvParse.bestandHtml(c) : '';
}

/* ─── Documenten bij de kandidaat ─────────────────────────────────
   Er waren twee losse dingen: het ingelezen cv (in het cv-jsonb) en het
   zoeken in SharePoint. Zelf iets toevoegen kon niet — een getekende
   verklaring, een diploma of een identiteitsbewijs-checklist had dus geen
   plek (naam: Tjeerd, 6 aug 2026). Nu één blok: het ingelezen cv bovenaan,
   daaronder wat je zelf toevoegt (crm_documenten, dezelfde tabel als bij
   de vacature), en het SharePoint-zoekblok blijft daaronder staan.

   Let op: bestanden gaan naar de afgeschermde map crm-docs en worden
   alleen met een kortlopende ondertekende link geopend. Een publieke url
   zou hier paspoortkopieën en adressen op straat leggen. */
const kandDocs = c => (CRM.state.documenten || [])
  .filter(d => d.entiteit === 'kandidaat' && String(d.ref) === String(c.id))
  .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));

function docsHtml(c){
  if(geanonimiseerd(c)) return '';
  const cv = c.cv || {};
  const docs = kandDocs(c);
  const rij = d => {
    const duid = CRM.opslag ? CRM.opslag.duiding(d.url) : {soort:'extern', url:d.url, pad:''};
    const knop = duid.soort === 'pad'
      ? `<button type="button" class="btn ghost sm" data-cvopen="${h(duid.pad)}">Openen</button>`
      : duid.url ? `<a class="btn ghost sm" href="${h(duid.url)}" target="_blank" rel="noopener">Openen</a>` : '';
    return `<div class="kd-docrij">
      <span class="kd-docic">▤</span>
      <span class="kd-doct"><b>${h(d.naam || 'Document')}</b>
        <span class="meta num">${h([d.soort, d.op ? CRM.fmtDate(d.op) : '', d.door].filter(Boolean).join(' · '))}</span></span>
      ${knop}
      <button type="button" class="btn sub sm" data-docweg="${h(d.id)}" title="Losmaken van deze kandidaat">×</button>
    </div>`;
  };
  return `<div class="card">
    <div class="card-h"><div class="h2">Documenten</div><span class="spacer"></span>
      <button class="btn ghost sm" id="c_docupload">Bestand toevoegen</button>
      <button class="btn sub sm" id="c_doclink">Link koppelen</button></div>
    <div class="card-b">
      ${cv.bestandPad ? `<div class="kd-docrij kd-doccv">
        <span class="kd-docic">▤</span>
        <span class="kd-doct"><b>${h(cv.bestand || 'CV')}</b>
          <span class="meta num">${h(['ingelezen cv', cv.op ? CRM.fmtDate(cv.op) : '', cv.door].filter(Boolean).join(' · '))}</span></span>
        <button type="button" class="btn ghost sm" data-cvopen="${h(cv.bestandPad)}">Openen</button>
        <button type="button" class="btn sub sm" data-cvdl="${h(cv.bestandPad)}" data-cvnaam="${h(cv.bestand||'cv.pdf')}">Bewaren</button>
      </div>` : ''}
      ${docs.length ? docs.map(rij).join('') : ''}
      ${!cv.bestandPad && !docs.length
        ? '<p class="meta" style="margin:0">Nog geen documenten. Voeg een bestand toe of koppel een link — het ingelezen cv verschijnt hier vanzelf.</p>' : ''}
      <input type="file" id="c_docfile" hidden
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.xlsx,.csv">
    </div></div>`;
}

const DOC_SOORTEN = ['cv','diploma','certificaat','identiteit','contract','overig'];

function bindDocs(mount, c){
  const file = mount.querySelector('#c_docfile');
  const upl  = mount.querySelector('#c_docupload');
  if(upl && file){
    upl.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if(f) await docUpload(c, f);
    };
  }
  const link = mount.querySelector('#c_doclink');
  if(link) link.onclick = () => docLinkModal(c);
  mount.querySelectorAll('[data-docweg]').forEach(b => b.onclick = () => docWeg(c, b.dataset.docweg));
  /* Openen en bewaren van bestanden in de afgeschermde map — één plek
     (js/cvparse.js) die de ondertekende link maakt. */
  if(CRM.cvParse) CRM.cvParse.bindBestand(mount);
}

async function docBewaar(c, rij){
  CRM.state.documenten = CRM.state.documenten || [];
  CRM.state.documenten.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_documenten').insert(rij);
    if(error){ CRM.state.documenten.shift(); return CRM.fout('Opslaan mislukt', error); }
  }
  CRM.toast('Document toegevoegd','ok');
  CRM.render();
}

/* Naam en soort vraagt hij vóór het uploaden: een bestand dat "scan_3.pdf"
   heet zegt over een half jaar niemand meer iets. */
function docUpload(c, f){
  if(CRM.demo){ CRM.toast('Demo: het bestand wordt niet geüpload'); return; }
  const raden = /cv|resume/i.test(f.name) ? 'cv'
              : /diploma/i.test(f.name) ? 'diploma'
              : /certi|vca/i.test(f.name) ? 'certificaat' : 'overig';
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Bestand toevoegen</div>
      <p class="sub" style="margin:6px 0 0">${h(f.name)} · ${h(Math.max(1, Math.round(f.size/1024)) + ' kB')}</p></div>
    <div class="modal-b"><div class="f-grid">
      <div class="f-row"><label for="kd_unaam">Naam</label>
        <input type="text" id="kd_unaam" value="${h(f.name)}"></div>
      <div class="f-row"><label for="kd_usoort">Soort</label>
        <select id="kd_usoort">${DOC_SOORTEN.map(s=>
          `<option${s===raden?' selected':''}>${h(s)}</option>`).join('')}</select></div>
    </div></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="kd_uok">Uploaden</button></div>`, {onOpen(m){
      m.querySelector('#kd_uok').onclick = async () => {
        const naam = m.querySelector('#kd_unaam').value.trim() || f.name;
        const soort = m.querySelector('#kd_usoort').value;
        CRM.modal.close();
        const veilig = String(f.name).replace(/[^\w.\-]+/g,'_').slice(-80);
        const token = Math.random().toString(36).slice(2, 8);
        const pad = `kandidaten/${String(c.id).replace(/[^\w-]/g,'')}/docs/${CRM.todayISO()}-${token}-${veilig}`;
        CRM.toast('Bezig met uploaden…');
        const {error} = await CRM.sb.storage.from(CRM.opslag.map).upload(pad, f, {upsert:false});
        if(error) return CRM.toast(CRM.opslag.foutTekst(error), 'err');
        await docBewaar(c, {id:CRM.uid(), entiteit:'kandidaat', ref:String(c.id),
          naam, soort, url:pad, door:CRM.me(), op:new Date().toISOString()});
      };
    }});
}

function docLinkModal(c){
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Link koppelen</div>
      <p class="sub" style="margin:6px 0 0">Een document dat elders staat — SharePoint, OneDrive of een gedeelde map.</p></div>
    <div class="modal-b"><div class="f-grid">
      <div class="f-row"><label for="kd_dnaam">Naam</label>
        <input type="text" id="kd_dnaam" placeholder="Bijv. Diploma heftruck"></div>
      <div class="f-row"><label for="kd_dsoort">Soort</label>
        <select id="kd_dsoort">${DOC_SOORTEN.map(s=>`<option>${h(s)}</option>`).join('')}</select></div>
      <div class="f-row" style="grid-column:1/-1"><label for="kd_durl">Link</label>
        <input type="text" id="kd_durl" placeholder="https://…"></div>
    </div></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="kd_dok">Koppelen</button></div>`, {onOpen(m){
      m.querySelector('#kd_dok').onclick = async () => {
        const url = m.querySelector('#kd_durl').value.trim();
        if(!url) return m.querySelector('#kd_durl').focus();
        /* Alleen http(s): een javascript:-link zou hier een klikbare val zijn. */
        const duid = CRM.opslag.duiding(url);
        if(duid.soort === 'geweigerd') return CRM.toast('Dat is geen geldige link','err');
        CRM.modal.close();
        await docBewaar(c, {id:CRM.uid(), entiteit:'kandidaat', ref:String(c.id),
          naam: m.querySelector('#kd_dnaam').value.trim() || 'Document',
          soort: m.querySelector('#kd_dsoort').value, url,
          door:CRM.me(), op:new Date().toISOString()});
      };
    }});
}

async function docWeg(c, id){
  if(!await CRM.bevestig('Document losmaken?',
    'De koppeling verdwijnt van deze kaart. Een geüpload bestand blijft in de opslag staan.')) return;
  CRM.state.documenten = (CRM.state.documenten||[]).filter(d => String(d.id) !== String(id));
  if(!CRM.demo) await CRM.sb.from('crm_documenten').delete().eq('id', id);
  CRM.render();
}

/* ─── Werkervaring handmatig toevoegen of aanpassen ───────────────
   Wat de cv-lezer neerzet is een beginpunt, geen eindstand: een AM hoort
   een dienstverband te kunnen corrigeren, aanvullen of toevoegen zonder
   het cv opnieuw in te lezen. Zelfde veldnamen als de cv-lezer
   (cv.werkgevers: functie, werkgever, periode, taken), dus de
   kandidaatkaart én de cv-generator lezen het zonder onderscheid. */
function werkModal(c, index){
  const cv = c.cv || {};
  const lijst = Array.isArray(cv.werkgevers) ? cv.werkgevers : [];
  const w = index != null ? (lijst[index] || {}) : {};
  const nieuw = index == null;
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">${nieuw ? 'Werkervaring toevoegen' : 'Werkervaring aanpassen'}</div></div>
    <div class="modal-b">
      <div class="f-grid">
        <div class="f-row"><label>Functie</label><input type="text" id="wm_functie" value="${h(w.functie||w.rol||'')}" placeholder="Bijv. Procesoperator"></div>
        <div class="f-row"><label>Werkgever</label><input type="text" id="wm_werkgever" value="${h(w.werkgever||w.bedrijf||'')}"></div>
        <div class="f-row"><label>Periode</label><input type="text" id="wm_periode" value="${h(w.periode || [w.van,w.tot].filter(Boolean).join(' – '))}" placeholder="Bijv. 2019 – 2023 of mrt 2024 – heden"></div>
      </div>
      <div class="f-row" style="margin-top:10px"><label>Werkzaamheden <span class="meta">één per regel</span></label>
        <textarea id="wm_taken" rows="5" placeholder="Instellen en bedienen van de productielijn&#10;Kwaliteitscontroles uitvoeren">${h((w.taken||[]).join('\n'))}</textarea></div>
    </div>
    <div class="modal-f">
      ${nieuw ? '' : '<button class="btn ghost" id="wm_weg" style="color:var(--red)">Verwijderen</button>'}
      <span class="spacer"></span>
      <button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="wm_ok">${nieuw ? 'Toevoegen' : 'Opslaan'}</button>
    </div>`, {onOpen(m){
    setTimeout(() => m.querySelector('#wm_functie').focus(), 60);
    const bewaar = async (nieuweLijst) => {
      c.cv = Object.assign({}, cv, {werkgevers: nieuweLijst});
      CRM.modal.close();
      await bewaarKandidaat(c);
      CRM.render();
    };
    m.querySelector('#wm_ok').onclick = async () => {
      const v = id => m.querySelector('#' + id).value.trim();
      if(!v('wm_functie') && !v('wm_werkgever'))
        return CRM.toast('Vul minstens een functie of werkgever in','err');
      const rij = Object.assign({}, w, {
        functie: v('wm_functie'), werkgever: v('wm_werkgever'), periode: v('wm_periode'),
        taken: m.querySelector('#wm_taken').value.split(/\r?\n/).map(t => t.trim()).filter(Boolean)
      });
      /* Vrije periode-tekst overschrijft de gestructureerde datums van de
         lezer — anders toont de kaart straks de oude jaartallen naast de
         nieuwe periode. */
      if(rij.periode !== (w.periode || [w.van,w.tot].filter(Boolean).join(' – '))){ delete rij.van; delete rij.tot; }
      const nieuweLijst = nieuw ? lijst.concat([rij]) : lijst.map((x, i) => i === index ? rij : x);
      await bewaar(nieuweLijst);
      CRM.toast(nieuw ? 'Werkervaring toegevoegd' : 'Werkervaring aangepast','ok');
    };
    const weg = m.querySelector('#wm_weg');
    if(weg) weg.onclick = async () => {
      if(!(await CRM.bevestig(`"${w.functie||w.werkgever||'dit dienstverband'}" verwijderen van de kaart?`))) return;
      await bewaar(lijst.filter((x, i) => i !== index));
      CRM.toast('Werkervaring verwijderd','ok');
    };
  }});
}

/* ─── CV inlezen ─────────────────────────────────────────────────
   De parser zelf staat in js/cvparse.js (CRM.cvParse): één module voor
   alle schermen, zodat een cv met twee kolommen overal hetzelfde wordt
   gelezen. De eigen compacte parser die hier stond las een pdf regel
   voor regel op y-positie en weefde bij een zijbalk de twee kolommen
   door elkaar; die is weg. */
function cvLezen(c){
  if(!CRM.cvParse) return CRM.toast('De CV-lezer is niet geladen — herlaad de pagina','err');
  CRM.cvParse.open({kandidaat:c, onKlaar:() => CRM.render()});
}

/* ─── Intake ──────────────────────────────────────────────────── */
function intakeHtml(c){
  const i = c.intake;
  /* Het intakeformulier zelf staat in js/recruitment.js (CRM.kandidaatIntake);
     vroeger kon je er alleen vanaf het bord bij. */
  const knop = `<button class="btn ghost sm" id="c_intake2">${i?'Intake bijwerken':'Intake invullen'}</button>`;
  if(!i) return `<div class="card"><div class="card-h"><div class="h2">Intake</div>
      <span class="spacer"></span>${knop}</div>
    <div class="card-b">${CRM.intakeAI ? CRM.intakeAI.blokHtml(c) : ''}${CRM.ui.leeg('Geen intake vastgelegd','Vul het intakeformulier in tijdens de videocall — of lees een transcript in.')}</div></div>`;
  const cijfer = Number(i.cijfer || i.commitment || 0);
  /* Nederlandse labels in gespreksvolgorde, in plaats van de rauwe sleutels
     ("jaZegt", "nietLager") die hier eerst op de kaart stonden. Onbekende
     sleutels vallen terug op de sleutelnaam, zodat een nieuw intakeveld
     nooit onzichtbaar is. */
  const INTAKE_LBL = {
    situatie:'Situatie & urgentie', trajecten:'Ook bij andere bureaus', trajectenTxt:'Waar en hoe ver',
    jaZegt:'Waarom ja, los van geld', droombaan:'Droombaan', blijven:'Wat de werkgever moest veranderen',
    werkbeeld:'Beeld van het werk', jaar13:'Over 1 en 3 jaar', leren:'Wil leren of ontwikkelen',
    blokkade:'Mogelijke blokkade', tegenbod:'Verwacht tegenbod', aangekaart:'Onvrede aangekaart',
    nietLager:'Waarom geen twee punten lager', tien:'Wat het een 10 maakt', klaar:'Klaar om voor te stellen'
  };
  const verstopt = ['cijfer','commitment','drijfveer','drijfveren','risico','risicos','samenvatting','op','door'];
  const volgorde = Object.keys(INTAKE_LBL).concat(Object.keys(i).filter(k => !INTAKE_LBL[k] && !verstopt.includes(k)));
  const toon = k => { const w = i[k]; return w == null || w === '' ? ''
    : `<div class="kd-veld"><span class="label">${h(INTAKE_LBL[k] || k)}</span><span>${h(typeof w==='object'?JSON.stringify(w):w)}</span></div>`; };
  return `<div class="card">
    <div class="card-h"><div class="h2">Intake</div>
      ${cijfer?`<span class="chip${cijfer<7?' amber':' green'}">Commitment <span class="num">${cijfer}</span>/10</span>`:''}
      <span class="spacer"></span>
      <span class="meta num">${h(i.op?CRM.fmtDate(i.op):'')}${i.door?' · '+h(i.door):''}</span>
      ${knop}</div>
    <div class="card-b">
      ${cijfer && cijfer < 7 ? '<div class="note warn" style="margin-bottom:14px">Commitmentcijfer onder de 7 — bespreek de twijfel vóór je voorstelt.</div>' : ''}
      ${i.samenvatting ? `<div class="kd-intsam"><span class="label">Samenvatting voor de klant</span>
        <p>${h(i.samenvatting)}</p></div>` : ''}
      <div class="kd-velden">
        ${(i.drijfveer||i.drijfveren)?`<div class="kd-veld"><span class="label">Echte drijfveer</span><span>${h(i.drijfveer||i.drijfveren)}</span></div>`:''}
        ${(i.risico||i.risicos)?`<div class="kd-veld"><span class="label">Afhaakrisico's</span><span>${h(i.risico||i.risicos)}</span></div>`:''}
        ${volgorde.map(toon).join('')}
      </div>
    </div></div>`;
}

/* ─── Uitval ──────────────────────────────────────────────────────
   Sleept iemand een kaart op het bord naar de uitvalstrook, dan wordt hier
   direct zichtbaar wát er is vastgelegd — niet alleen dat de fase veranderde.
   Stond eerder als twee losse regeltjes in het Trajectblok; dat liet de helft
   van het uitvalformulier onzichtbaar (soort, wie, toelichting, herbruikbaar).
   Labels staan hier bewust lokaal: modules delen in dit project geen code. */
const AFVAL_SOORT = {niet_gekwalificeerd:'Niet gekwalificeerd', offer_afgewezen:'Offer afgewezen'};
const STOP_DOOR   = {kandidaat:'Kandidaat zelf', klant:'Klant', anders:'Anders'};

function uitvalHtml(c){
  const afgevallen = c.fase === 'Afgevallen', gestopt = c.fase === 'Gestopt';
  if(!afgevallen && !gestopt) return '';
  const rij = (lbl, waarde) => waarde
    ? `<div class="kd-veld"><span class="label">${h(lbl)}</span><span>${h(waarde)}</span></div>` : '';
  /* recyclebaar is bewust drieledig: true / false / null (nooit beoordeeld). */
  const herbruik = c.recyclebaar == null ? 'nog niet beoordeeld'
                 : c.recyclebaar ? 'ja — mag opnieuw aangeboden worden' : 'nee';
  const leeg = !c.afvalCat && !c.stopCat && !c.reden && !c.afvalType && !c.stopDoor;
  return `<div class="card">
    <div class="card-h"><div class="h2">${afgevallen ? 'Afgevallen' : 'Gestopt'}</div>
      <span class="chip${afgevallen?'':' red'}">${h(CRM.fmtDate(c.gestoptOp || c.since) || '—')}</span>
      <span class="spacer"></span>
      <button class="btn ghost sm" id="c_uitval">${leeg ? 'Reden vastleggen' : 'Bijwerken'}</button></div>
    <div class="card-b">
      ${leeg ? `<div class="note warn" style="margin:0 0 12px">De fase staat op ${h(CRM.faseNorm(c.fase))}, maar er is nog geen reden vastgelegd.
        Zonder reden telt deze kaart nergens mee in de uitvalcijfers.</div>` : ''}
      <div class="kd-velden">
        ${afgevallen
          ? rij('Soort', AFVAL_SOORT[c.afvalType] || c.afvalType) + rij('Reden', c.afvalCat)
          : rij('Gestopt door', STOP_DOOR[c.stopDoor] || c.stopDoor) + rij('Reden', c.stopCat)}
        ${gestopt ? rij('Gestopt op', CRM.fmtDate(c.gestoptOp)) + rij('Was geplaatst op', CRM.fmtDate(c.geplaatstOp)) : ''}
        ${rij('Herbruikbaar', herbruik)}
        ${c.reden ? `<div class="kd-veld"><span class="label">Toelichting</span><span>${h(c.reden)}</span></div>` : ''}
      </div>
      ${gestopt && !c.geplaatstOp ? `<div class="note warn" style="margin-top:12px">Geen plaatsingsdatum ingevuld.
        Deze stop telt daardoor niet mee bij "gestopt deze maand".</div>` : ''}
    </div></div>`;
}

/* ─── Klaar voor facturatie ───────────────────────────────────────
   Wat er nog ontbreekt voordat de fee uitgerekend kan worden. Het lijstje
   is voor IEDEREEN: de AM moet weten wat er ingevuld moet worden, en dat zijn
   veldnamen, geen bedragen. De uitkomst van de berekening is dat wél, dus
   die staat achter CRM.magOpbrengstZien() — het hele team, sinds 31 jul
   2026. Zie js/fee.js. */
function factuurklaarHtml(c){
  if(!CRM.fee || !c.klant) return '';           // zonder klant valt er niets te factureren
  let mist = [], b = null;
  try{
    const afspraak = CRM.fee.voorKlant(c.klant, c.geplaatstOp || null);
    mist = CRM.fee.watMist(c, afspraak) || [];
    if(CRM.magOpbrengstZien()) b = CRM.fee.bereken(c, afspraak);
  }catch(e){ console.warn('feeberekening', e); return ''; }

  const klaar = !mist.length;
  return `<div class="card">
    <div class="card-h"><div class="h2">Klaar voor facturatie</div>
      <span class="spacer"></span>
      <span class="chip${klaar?' green':' amber'}">${klaar ? 'compleet' : mist.length + ' nog invullen'}</span></div>
    <div class="card-b">
      ${klaar
        ? '<p class="sub" style="margin:0 0 10px">Alle gegevens staan erin. Zodra het contract getekend is, kan er gefactureerd worden.</p>'
        : `<p class="sub" style="margin:0 0 10px">Dit moet er nog in voordat de fee berekend kan worden:</p>
           <ul class="kd-mistlijst">${mist.map(m => {
             const veld = String(m.veld||''), waar = String(m.waar||'');
             /* Alleen een knop als het veld ook echt op deze kaart staat —
                anders stuur je iemand naar niets. Staat het elders, dan is
                de vindplaats de nuttige informatie. */
             const hier = ALLE_VELDEN.some(v => v.k === veld);
             return `<li>${hier
               ? `<button type="button" data-mistveld="${h(veld)}">${h(String(m.label||veld))}</button>`
               : `<span>${h(String(m.label||veld))}</span>`}${
               waar ? `<span class="meta">${h(waar)}</span>` : ''}</li>`;
           }).join('')}</ul>`}
      ${b && b.fee != null ? `
        <div class="kd-velden" style="margin-top:14px">
          <div class="kd-veld"><span class="label">Grondslag</span><span class="num">${h(CRM.euro(b.grondslag?.jaarSalaris))}</span></div>
          <div class="kd-veld"><span class="label">Percentage</span><span class="num">${h(String(b.pct ?? '—'))}%${
            b.functiegroep ? ' <span class="meta">' + h(String(b.functiegroep)) + '</span>' : ''}</span></div>
          <div class="kd-veld"><span class="label">Fee</span><span class="num"><b>${h(CRM.euro(b.fee))}</b></span></div>
          ${b.factuurdatum?`<div class="kd-veld"><span class="label">Factureren</span><span>${h(CRM.fmtDate(b.factuurdatum))}${
            b.vervaldatum?' · vervalt '+h(CRM.fmtDate(b.vervaldatum)):''}</span></div>`:''}
          ${b.garantieTot?`<div class="kd-veld"><span class="label">Garantie tot</span><span>${h(CRM.fmtDate(b.garantieTot))}</span></div>`:''}
        </div>
        ${(b.waarschuwingen||[]).length ? `<div class="note warn" style="margin-top:12px">${
          b.waarschuwingen.map(w=>h(String(w))).join('<br>')}</div>` : ''}` : ''}
    </div></div>`;
}

/* ─── Kansen: past bij deze vacatures ───────────────────────────
   De matchscore zegt of iemand past. Wat hier sinds 31 jul 2026 bij staat
   zegt of je het moet dóen: loopt deze persoon al ergens, wees deze klant
   hem eerder af, en is de vacature al vol. Zie CRM.kdHistorie bovenaan dit
   bestand.

   Het lopende traject staat één keer bovenaan en niet bij elke regel — het
   is voor alle vijf de vacatures hetzelfde feit, en vijf keer dezelfde
   waarschuwing is net zo onbruikbaar als geen. Per regel blijft over wat
   per vacature verschilt. */
function kansenHtml(c){
  const lijst = kansen(c);
  const H = CRM.kdHistorie;
  const lp = H ? H.lopendTraject(c) : null;
  /* Waar deze kandidaat op dit moment loopt, is het belangrijkste feit op de
     hele kaart — en het stond als rode waarschuwing bovenaan een lijst van
     vijf grote kansenkaarten. Rood leest als "er is iets mis", terwijl er
     juist iets góéd gaat: er loopt een traject. Het staat nu apart en in het
     groen, met de vacature erbij. De kansen eronder zijn wat je zóu kunnen
     doen; dit is wat er is. (Tjeerd, 3 aug 2026.) */
  const lopendHtml = !lp ? '' : (() => {
    const v = c.vacatureId ? (CRM.state.vacs||[]).find(x => String(x.id) === String(c.vacatureId)) : null;
    return `<div class="card kd-loopt">
      <div class="card-b">
        <div class="label">${lp.geplaatst ? 'Werkt bij' : 'Voorgesteld bij'}</div>
        <div class="kd-looptklant"><a href="#klanten/${encodeURIComponent(lp.klant)}" data-klant="${h(lp.klant)}">${h(lp.klant)}</a></div>
        ${v ? `<div class="kd-looptvac">${h(v.functie||'')}${v.locatie?` · ${h(v.locatie)}`:''}</div>`
            : `<div class="kd-looptvac leeg">geen vacature gekoppeld</div>`}
        <div class="meta">${h(lp.fase)}${lp.sinds ? ' sinds ' + h(CRM.fmtDate(lp.sinds)) : ''}${
          lp.klantBestaat ? '' : ' · die klant staat niet meer in het systeem'}</div>
      </div></div>`;
  })();

  let afgeleid = false;
  const body = lijst.map(m => {
    const v = m.vacature;
    const sig = (H ? H.signalen(c, v) : []).filter(s => s.k !== 'elders');
    if(sig.some(s => s.k === 'eerder')) afgeleid = true;
    const gekoppeld = sig.some(s => s.k === 'gekoppeld');
    const kleur = m.score >= 70 ? 'green' : m.score >= 50 ? '' : 'amber';
    /* Eén regel per kans. Dit was een kaart met een balk, een uitlegzin, alle
       blokkers, alle twijfels en een knop over de volle breedte — vijf van die
       kaarten vulden de hele rechterkolom, en dan valt het traject dat er écht
       toe doet in het niet. Wat blijft: score, functie, klant, en de
       blokkers — want een score zonder reden is niet te vertrouwen. De
       uitlegzin staat in de tooltip; die lees je pas als je twijfelt. */
    const redenen = (m.m && m.m.blokkers || []).slice(0,2).map(b => ({t:b, k:'red'}))
      .concat((m.m && m.m.twijfels || []).slice(0,1).map(t => ({t, k:'amber'})));
    return `<div class="kd-kans" title="${h(uitleg(c, v))}">
      <span class="kd-kansscore ${h(kleur||'mid')}"><b class="num">${m.score}</b>%</span>
      <span class="kd-kanswat">
        <b>${h(v.functie)}</b>
        <span class="meta"><a href="#klanten/${encodeURIComponent(v.klant)}" data-klant="${h(v.klant)}">${h(v.klant)}</a>${
          m.km ? ` · <span class="num">${m.km}</span> km` : ''}</span>
        ${redenen.map(r => `<span class="kd-sig ${r.k}">${h(r.t)}</span>`).join('')}
        ${sig.filter(s => s.k !== 'gekoppeld').slice(0,1).map(s =>
          `<span class="kd-sig ${h(s.kleur)}">${h(s.tekst)}</span>`).join('')}
      </span>
      ${gekoppeld ? '<span class="chip green">gekoppeld</span>'
        : `<button class="btn ghost sm" data-voorstel="${h(String(v.id))}">Voorstellen</button>`}
    </div>`;
  }).join('');

  return `${lopendHtml}${ookInBeeldHtml(c)}<div class="card">
    <div class="card-h"><div class="h2">Kansen</div>
      <span class="spacer"></span>
      <span class="meta">${lijst.length ? lijst.length + ' passende vacature' + (lijst.length===1?'':'s') : ''}</span></div>
    <div class="card-b">${lijst.length ? body : CRM.ui.leeg('Nog geen passende vacature',
        'Vul de gezochte functie en woonplaats in — dan zoekt het systeem zelf de vacatures erbij.')}
      ${afgeleid ? `<p class="meta kd-kansnoot">Een eerdere afwijzing komt uit de uitvalregistratie op de kaart.
        Er is geen veld dat een afwijzing als paar kandidaat–klant vastlegt: wat hier staat is de klant die
        toen op die kaart stond. Is dezelfde persoon later op een nieuwe kaart heraangeboden, dan lezen we
        de oude kaart mee via de heraanbied-koppeling.</p>` : ''}</div></div>`;
}

async function voorstellen(c, v){
  /* Het laatste moment waarop het nog uitmaakt. Wat de kaart al liet zien
     staat hier nog één keer, zodat het niet net buiten beeld valt als je
     naar beneden hebt gescrold. Het blijft een bevestiging, geen blokkade. */
  const sig = (CRM.kdHistorie ? CRM.kdHistorie.signalen(c, v) : [])
    .filter(s => s.k !== 'gekoppeld').map(s => 'Let op: ' + s.tekst + '.');
  /* Reageerde deze kandidaat op een ándere vacature, zeg dat dan. Een lead
     uit een advertentie komt binnen mét de vacature waarop is gereageerd;
     dat veld werd bij het voorstellen stilzwijgend overschreven. Dan staat er
     later "gereageerd op Heftruckchauffeur" nergens meer, en denkt de klant
     dat wij iemand sturen die om dít werk vroeg. Het blijft een mededeling,
     geen blokkade: iemand voorstellen op iets anders is vaak juist goed werk. */
  const oudeVac = c.vacatureId && String(c.vacatureId) !== String(v.id)
    ? (CRM.state.vacs||[]).find(x => String(x.id) === String(c.vacatureId)) : null;
  const anders = oudeVac
    ? `Let op: deze kandidaat kwam binnen op ${oudeVac.functie} bij ${oudeVac.klant}. Die koppeling vervalt.`
    : '';
  const ok = await CRM.bevestig('Voorstellen bij deze vacature?',
    [c.naam + ' → ' + v.functie + ' bij ' + v.klant + '. De fase gaat naar Voorgesteld.']
      .concat(anders ? [anders] : []).concat(sig).join(' '));
  if(!ok) return;
  /* Eén route naar Voorgesteld, gedeeld met het bord en de fase-picker.
     Dit bestand schreef de fase eerst zelf weg, en daarmee liep het langs de
     intake-poort, langs de trajectpoort en langs de plaatsingslogica in
     bewaarFase heen: dezelfde handeling gaf een andere uitkomst, afhankelijk
     van waar je klikte. Zie CRM.voorstellen in js/recruitment.js. */
  if(!CRM.voorstellen) return CRM.fout('Voorstellen is nu niet beschikbaar — herlaad de pagina');
  await CRM.voorstellen(c.id, v);
  CRM.render();
}

/* ─── Vacature koppelen zónder voor te stellen ────────────────────
   Dit ontbrak. Je kon een kandidaat alleen aan een vacature hangen door hem
   meteen voor te stellen — dan schiet de fase naar Voorgesteld en ligt zijn
   cv bij de klant. Maar in de praktijk weet je al vóór de videocall waar je
   iemand voor in gedachten hebt, en dat wil je vastleggen zonder de klant
   erbij te halen. (Tjeerd, 3 aug 2026: "nu heb ik een cv geparced, en kan ik
   hem ook niet koppelen aan een vacature?")

   De fase blijft dus staan waar hij staat. Voorstellen is een aparte,
   bewuste handeling met eigen poortwachters. */
async function vacatureKoppelen(c){
  const vs = (CRM.state.vacs || []).filter(v => v && v.klant && (v.status || 'Open') !== 'Gesloten');
  if(!vs.length) return CRM.toast('Er staan geen openstaande vacatures','err');
  const perKlant = {};
  vs.forEach(v => { (perKlant[v.klant] = perKlant[v.klant] || []).push(v); });
  const opties = Object.keys(perKlant).sort((a,b)=>a.localeCompare(b,'nl')).map(k =>
    `<optgroup label="${h(k)}">${perKlant[k]
      .sort((a,b)=>String(a.functie||'').localeCompare(String(b.functie||''),'nl'))
      .map(v => `<option value="${h(v.id)}"${String(c.vacatureId)===String(v.id)?' selected':''}
         data-klant="${h(v.klant)}" data-functie="${h(v.functie||'')}">${h(v.functie||'(geen functie)')}</option>`)
      .join('')}</optgroup>`).join('');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Vacature koppelen aan ${h(c.naam)}</div>
      <p class="sub" style="margin:6px 0 0">Legt vast waar je deze kandidaat voor in gedachten hebt. De fase blijft
        ${h(CRM.faseNorm(c.fase) || 'staan waar hij staat')} — voorstellen bij de klant doe je apart.</p></div>
    <div class="modal-b">
      <div class="f-row"><label for="kv_vac">Vacature</label>
        <select id="kv_vac"><option value="">— geen vacature —</option>${opties}</select></div>
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="kv_ok">Koppelen</button></div>`, {onOpen(m){
      m.querySelector('#kv_ok').onclick = async () => {
        const sel = m.querySelector('#kv_vac');
        const opt = sel.selectedOptions[0];
        CRM.modal.close();
        const patch = {vacature_id: sel.value || '', klant: (opt && opt.dataset.klant) || ''};
        /* De functie van de vacature alleen overnemen als de kandidaat er zelf
           geen heeft — wat op zijn kaart staat is wat híj doet. */
        if(opt && opt.dataset.functie && !String(c.functie||'').trim()) patch.functie = opt.dataset.functie;
        const rij = CRM.state.cands.find(r => String(r.id) === String(c.id));
        if(rij) Object.assign(rij, patch);
        if(!CRM.demo){
          const {error} = await CRM.sb.from('candidates').update(patch).eq('id', c.id);
          if(error) return CRM.fout('Koppelen mislukt', error);
        }
        await CRM.logActiviteit('kandidaat', c.id, 'systeem', sel.value
          ? `Gekoppeld aan ${opt.dataset.functie || 'een vacature'} bij ${opt.dataset.klant}`
          : 'Vacaturekoppeling losgemaakt');
        CRM.toast(sel.value ? 'Gekoppeld' : 'Koppeling weg','ok');
        CRM.render();
      };
    }});
}

/* ─── Traject in het kort ─────────────────────────────────────── */
/* De Teams-link van de laatst ingeplande call. Hij is opgeslagen als
   notitie (en oudere afspraken staan als activiteit) — we vissen hem
   daaruit op zodat hij klikbaar bij de afspraak staat. */
/* Een notitie is gebruikersinvoer: stop bij een aanhalingsteken of punthaak,
   zodat er nooit iets anders dan een schone Teams-url in de href belandt. */
const TEAMS_RE = /https:\/\/teams\.microsoft\.com\/[^\s"'<>]+/i;
function teamsLink(c){
  const rijen = (c.notities||[]).concat(CRM.activiteitenVoor('kandidaat', c.id))
    .filter(x => x && TEAMS_RE.test(String(x.tekst||'')))
    .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));
  const m = rijen.length ? String(rijen[0].tekst).match(TEAMS_RE) : null;
  return m ? m[0] : '';
}

/* Eén regel in een velden-blok: label + inline bewerkbare waarde. */
function veldRij(c, f){
  const w = toonWaarde(f, lees(c, f.k));
  return `<div class="kd-veld"><span class="label">${h(f.lbl)}</span>
    <span><span class="kd-w${w?'':' leeg'}" data-veld="${h(f.k)}" tabindex="0" role="button">${w?h(w):'invullen…'}</span>${
      f.hint?` <span class="meta">${h(f.hint)}</span>`:''}</span></div>`;
}

/* ─── Blok-bewerken: alle velden van een blok tegelijk ────────────
   Het inline patroon (klik één waarde) blijft bestaan voor losse
   correcties, maar wie een heel blok invult — het Traject na een belletje,
   Contract & salaris bij een plaatsing — opent hiermee álle velden
   tegelijk: Tab of Enter loopt erdoorheen, één keer opslaan, dus ook maar
   één netwerkrit en één hertekening (die per definitie ná het typen valt). */
function blokVelden(c, welk){
  if(welk === 'traject') return TRAJECT_VELDEN;
  const toonDatums = CRM.PLACED.includes(c.fase) || ['Afgevallen','Gestopt'].includes(c.fase)
    || !!c.geplaatstOp || !!c.gestoptOp;
  return CONTRACT_VELDEN.filter(f => !f.alleenBijPlaatsing || toonDatums).concat(SALARIS_VELDEN);
}
function bindBlokBewerk(mount, c){
  mount.querySelectorAll('[data-blokbewerk]').forEach(b => b.onclick = () => {
    const body = b.closest('.card')?.querySelector('.card-b');
    if(body) blokForm(body, c, b.dataset.blokbewerk);
  });
}
function blokForm(body, c, welk){
  const velden = blokVelden(c, welk);
  const rij = f => {
    const ruw = lees(c, f.k);
    const start = ruw == null ? '' : String(ruw);
    const opts = typeof f.opts === 'function' ? f.opts(c) : (f.opts || []);
    const inp = f.t === 'select'
      ? `<select data-bf="${h(f.k)}">${opts.map(o => {
          const v = (o && typeof o === 'object') ? o.v : o;
          const l = (o && typeof o === 'object') ? o.l : (o || '—');
          return `<option value="${h(v)}"${String(start)===String(v)?' selected':''}>${h(l)}</option>`; }).join('')}</select>`
      : `<input type="${h(f.t)}" data-bf="${h(f.k)}" value="${h(start)}">`;
    return `<div class="f-row"><label>${h(f.lbl)}</label>${inp}${f.hint?`<span class="meta">${h(f.hint)}</span>`:''}</div>`;
  };
  body.innerHTML = `<div class="kd-blokform">
    ${velden.map(rij).join('')}
    <div class="row tight" style="margin-top:12px">
      <button type="button" class="btn sm" data-bfok>Opslaan</button>
      <button type="button" class="btn ghost sm" data-bfweg>Annuleren</button>
      <span class="meta">Enter of Tab = volgende veld · Esc = annuleren</span>
    </div></div>`;

  const invoer = [...body.querySelectorAll('[data-bf]')];
  const opslaan = async () => {
    invoer.forEach(el => {
      const f = velden.find(x => x.k === el.dataset.bf);
      let v = el.value;
      if(f.t === 'number') v = v === '' ? null : Number(v);
      else v = String(v).trim();
      schrijf(c, f.k, v);
    });
    await bewaarKandidaat(c);
    CRM.render();
  };
  body.querySelector('[data-bfok]').onclick = opslaan;
  body.querySelector('[data-bfweg]').onclick = () => CRM.render();
  body.onkeydown = e => {
    if(e.key === 'Escape'){ e.preventDefault(); return CRM.render(); }
    if(e.key !== 'Enter' || !e.target.dataset?.bf) return;
    e.preventDefault();
    const i = invoer.indexOf(e.target);
    if(i >= 0 && i < invoer.length - 1) invoer[i+1].focus();
    else opslaan();
  };
  if(invoer[0]) invoer[0].focus();
}

/* Toont de kandidaat een lopend traject? Bij fase '' (import uit het oude
   ATS, of een golden candidate) heeft contract- en salarisinvoer geen zin
   en houden we de kaart rustig. */
const inTraject = c => !!c.fase;

/* ─── Ook in beeld voor — meerdere vacatures per kandidaat ────────
   Stap 1 van "één persoon, meerdere sollicitaties" (Tjeerd, 4 aug 2026,
   antwoord 6 én expliciet: "je moet een kandidaat op meerdere vacatures
   kunnen zetten, ook over klanten heen"). Het hoofdtraject
   (c.vacatureId/klant) blijft de fase dragen — alle borden en tellingen
   rekenen daarop en blijven dus kloppen. Daarnaast kan een kandidaat op
   elke andere vacature "in beeld" staan (crm_sollicitaties), en is het
   hoofdtraject omhangen een wissel in plaats van afvallen: de oude
   hoofdvacature schuift automatisch de in-beeld-lijst in.
   Stap 2 — een eigen fase per traject — volgt met de uitval-verbouwing. */
const sollVan = c => (CRM.state.sollicitaties || [])
  .filter(r => String(r.kandidaat_id) === String(c.id));

async function sollToevoegen(c, vacId){
  const rij = {id:CRM.uid(), kandidaat_id:String(c.id), vacature_id:String(vacId),
               door:CRM.me(), op:new Date().toISOString()};
  CRM.state.sollicitaties.unshift(rij);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('crm_sollicitaties').insert(rij);
    if(error){ CRM.state.sollicitaties.shift(); return CRM.fout('Opslaan mislukt', error); }
  }
  return rij;
}
async function sollWeg(id){
  CRM.state.sollicitaties = CRM.state.sollicitaties.filter(r => String(r.id) !== String(id));
  if(!CRM.demo) await CRM.sb.from('crm_sollicitaties').delete().eq('id', id);
}

/* Hoofdtraject omhangen: de gekozen in-beeld-vacature wordt het traject, de
   oude hoofdvacature (als die er was) wordt een in-beeld-regel. De FASE
   blijft staan — dat is het hele punt: wisselen is geen afvallen. */
async function sollHoofdMaken(c, rij){
  const v = (CRM.state.vacs || []).find(x => String(x.id) === String(rij.vacature_id));
  if(!v) return CRM.toast('Die vacature bestaat niet meer', 'err');
  const oudeVac = c.vacatureId ? String(c.vacatureId) : '';
  const patch = {vacature_id:String(v.id), klant:v.klant || ''};
  const kopie = CRM.state.cands.find(x => String(x.id) === String(c.id));
  if(kopie) Object.assign(kopie, patch);
  if(!CRM.demo){
    const {error} = await CRM.sb.from('candidates').update(patch).eq('id', c.id);
    if(error) return CRM.fout('Opslaan mislukt', error);
  }
  await sollWeg(rij.id);
  if(oudeVac && oudeVac !== String(v.id)) await sollToevoegen(c, oudeVac);
  await CRM.logActiviteit('kandidaat', c.id, 'systeem',
    `Hoofdtraject omgehangen naar ${v.functie || 'vacature'} · ${v.klant || '—'} — fase bleef ${CRM.faseNorm(c.fase) || 'leeg'}`);
  CRM.render();
}

function sollKiesModal(c){
  const al = new Set(sollVan(c).map(r => String(r.vacature_id)));
  if(c.vacatureId) al.add(String(c.vacatureId));
  const vs = (CRM.state.vacs || [])
    .filter(v => v && v.klant && (v.status || 'Open') !== 'Gesloten' && !al.has(String(v.id)));
  if(!vs.length) return CRM.toast('Geen andere openstaande vacatures om aan te koppelen', 'err');
  const perKlant = {};
  vs.forEach(v => { (perKlant[v.klant] = perKlant[v.klant] || []).push(v); });
  const opties = Object.keys(perKlant).sort((a,b)=>a.localeCompare(b,'nl')).map(k =>
    `<optgroup label="${h(k)}">${perKlant[k].map(v =>
      `<option value="${h(v.id)}">${h(v.functie || '(geen functie)')}</option>`).join('')}</optgroup>`).join('');
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Ook in beeld voor…</div>
      <p class="sub" style="margin:6px 0 0">${h(c.naam)} blijft gewoon in zijn huidige traject staan —
        dit zet hem daarnaast op de kaart van een tweede vacature, ook bij een andere klant.</p></div>
    <div class="modal-b"><div class="f-row"><label for="so_vac">Vacature</label>
      <select id="so_vac">${opties}</select></div></div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="so_ok">Toevoegen</button></div>`, {onOpen(m){
      m.querySelector('#so_ok').onclick = async () => {
        const id = m.querySelector('#so_vac').value;
        CRM.modal.close();
        if(await sollToevoegen(c, id)){
          const v = (CRM.state.vacs||[]).find(x => String(x.id) === String(id));
          await CRM.logActiviteit('kandidaat', c.id, 'systeem',
            `Ook in beeld gezet voor ${v ? (v.functie || 'vacature') + ' · ' + (v.klant || '—') : 'vacature'}`);
          CRM.render();
        }
      };
    }});
}

function ookInBeeldHtml(c){
  const rijen = sollVan(c);
  const rij = r => {
    const v = (CRM.state.vacs || []).find(x => String(x.id) === String(r.vacature_id));
    return `<div class="kd-sollrij">
      <span class="trunc">${v ? `<b>${h(v.functie || '(geen functie)')}</b> · ${h(v.klant || '—')}` : '<span class="meta">vacature bestaat niet meer</span>'}</span>
      <span class="spacer"></span>
      ${v ? `<button class="btn ghost sm" data-sollhoofd="${h(r.id)}" title="Deze vacature wordt het hoofdtraject; de fase blijft staan">Maak hoofd</button>` : ''}
      <button class="btn sub sm" data-sollweg="${h(r.id)}" title="Van deze vacaturekaart af">×</button>
    </div>`;
  };
  return `<div class="card"><div class="card-h"><div class="h2">Ook in beeld voor</div>
      <span class="spacer"></span><button class="btn sub sm" id="c_sollplus">+ Vacature</button></div>
    <div class="card-b">${rijen.length ? rijen.map(rij).join('')
      : '<p class="meta" style="margin:0">Nog niets — zet deze kandidaat hier op extra vacatures, ook bij andere klanten. Zijn huidige traject loopt gewoon door.</p>'}</div></div>`;
}

function trajectHtml(c){
  const idx = CRM.faseIdx(c.fase);
  const teams = teamsLink(c);
  const stappen = CRM.PHASES.slice(0,11);
  const uitval = ['Afgevallen','Gestopt'].includes(c.fase);
  const kanIntake = CRM.faseIn(c.fase, ['Intake','Voorgesteld']);
  return `<div class="card">
    <div class="card-h"><div class="h2">Traject</div><span class="spacer"></span>
      ${c.klant?`<a class="btn ghost sm" href="#klanten/${encodeURIComponent(c.klant)}" data-klant="${h(c.klant)}">Naar klantkaart</a>`:''}
      <button class="btn ghost sm" data-blokbewerk="traject"
        title="Alle trajectvelden tegelijk open — Tab of Enter loopt erdoorheen, één keer opslaan">Bewerken</button></div>
    <div class="card-b">
      <div class="kd-velden">
        <div class="kd-veld"><span class="label">Huidige fase</span><span>${h(CRM.faseNorm(c.fase)||'—')} <span class="meta num">sinds ${h(CRM.fmtDate(c.since)||'—')}</span></span></div>
        ${TRAJECT_VELDEN.map(f => veldRij(c, f)).join('')}
        ${teams?`<div class="kd-veld"><span class="label">Videocall</span><span>
          <a class="btn sub sm kd-teamsl" href="${h(teams)}" target="_blank" rel="noopener">Teams-link</a></span></div>`:''}
      </div>
      <div class="kd-stappen">${stappen.map((p,i) =>
        `<i class="${i<=idx&&idx>=0?'on':''}" style="${i<=idx&&idx>=0?'background:'+p.c:''}" title="${h(p.k)}"></i>`).join('')}</div>
      <div class="meta">${idx>=0&&idx<11?`Stap <span class="num">${idx+1}</span> van <span class="num">11</span>`:h(CRM.faseNorm(c.fase)||'Nog niet bij een klant voorgesteld')}</div>
    </div>
    <!-- Verhuisd uit de bewerk-drawer van het bord: fasewissel mét
         poortwachters, video-intake, no-show en afmelden. -->
    <div class="card-f row tight" style="flex-wrap:wrap;row-gap:8px">
      ${inTraject(c) && !uitval && !CRM.PLACED.includes(CRM.faseNorm(c.fase))
        ? `<button class="btn sm" id="c_getekend">Contract getekend</button>` : ''}
      <button class="btn ghost sm" id="c_fase">Fase wijzigen…</button>
      ${/* Alleen zolang er nog géén traject bij een klant loopt (faseIdx < 0:
            instroom, of helemaal geen fase). Zodra iemand is voorgesteld,
            verandert van vacature betekent dat een klant een kandidaat
            kwijtraakt — dat loopt via de trajectpoort in js/traject.js en
            niet via een stille update hier. */
        !uitval && CRM.faseIdx(c.fase) < 0
        ? `<button class="btn ghost sm" id="c_vac">${c.vacatureId ? 'Andere vacature…' : 'Vacature koppelen…'}</button>` : ''}
      ${kanIntake?`<button class="btn ghost sm" id="c_intake">Video-intake</button>`:''}
      ${inTraject(c)&&!uitval?`<button class="btn ghost sm" id="c_noshow" title="Afspraak wissen en de no-show tellen">No-show</button>`:''}
      ${inTraject(c)?`<button class="btn ghost sm" id="c_uitval">${uitval?'Uitvalgegevens bijwerken':'Afmelden'}</button>`:''}
      <span class="spacer"></span>
      <button class="btn sub sm" id="c_snel" title="Alle trajectvelden in één paneel, met één keer opslaan">Snel bewerken</button>
    </div></div>`;
}

/* ─── Nazorg, warm houden, verjaardag en de felicitatiemail ───────
   Stond hier, met een eigen ritme dag 3 · 14 · 30 en een eigen
   plusDagen(). Verhuisd naar js/opvolging.js, omdat het dashboard, het
   bord en Performance elk hun eigen versie van datzelfde ritme
   berekenden — en al verschillende antwoorden gaven. De kaart tekent nu
   CRM.opvolging.kaartHtml(c) en hangt er CRM.opvolging.bindKaart() aan;
   het vastleggen loopt daar via CRM.logActiviteit, precies zoals hier.
   Bestaande check-ins blijven staan: opvolging.js leest de oude
   markering `extra.nazorg` van 3/14/30 nog steeds. */

/* ─── Contract, plaatsing en salaris (uit de bewerk-drawer) ─────
   Salaris van de kandidaat is een arbeidsvoorwaarde en mag het team
   zien (zelfde afweging als bij Kandidaatgegevens). De fee is dat
   níet — daarom staat die verwijzing achter canSeeMoney(). */
function contractHtml(c){
  if(!inTraject(c)) return '';
  const toonDatums = CRM.PLACED.includes(c.fase) || ['Afgevallen','Gestopt'].includes(c.fase)
    || !!c.geplaatstOp || !!c.gestoptOp;
  const velden = CONTRACT_VELDEN.filter(f => !f.alleenBijPlaatsing || toonDatums);
  return `<div class="card">
    <div class="card-h"><div class="h2">Contract &amp; salaris</div><span class="spacer"></span>
      <button class="btn ghost sm" data-blokbewerk="contract"
        title="Alle contract- en salarisvelden tegelijk open, één keer opslaan">Bewerken</button></div>
    <div class="card-b">
      <div class="kd-velden">${velden.map(f => veldRij(c, f)).join('')}</div>
      <div class="label" style="margin:16px 0 4px">Salaris</div>
      <div class="kd-velden">${SALARIS_VELDEN.map(f => veldRij(c, f)).join('')}</div>
      <div class="kd-totsal" id="kd_totsal">${totaalRegel(c)}</div>
    </div></div>`;
}
function totaalRegel(c){
  const bereken = D().totaalJaarSalaris;
  if(!bereken || !c.maandloon) return '<span class="meta">Vul het bruto maandloon in voor het totaal-jaarsalaris.</span>';
  const tot = bereken(c.maandloon, c.toeslagPct||0, c.vtPct==null?'':c.vtPct, c.ejuPct||0, c.overigPct||0);
  return `Totaal jaarsalaris ≈ <b class="num">${CRM.euro(Math.round(tot))}</b>
    <span class="meta">incl. toeslagen${CRM.canSeeMoney() ? ' — basis voor de fee in de finance-app' : ''}</span>`;
}

/* ─── Tabs onderaan ───────────────────────────────────────────── */
function tabsHtml(c){
  const acts  = CRM.activiteitenVoor('kandidaat', c.id);
  const taken = (CRM.state.taken||[]).filter(t => t.entiteit === 'kandidaat' && String(t.ref) === String(c.id));
  /* Een notitie is geen aparte soort: het is hetzelfde verhaal als een
     belletje of een appje, alleen zonder telefoon (naam: Tjeerd, 6 aug
     2026 — "notities apart is too much"). Dus één stroom. */
  return [
    ['activiteiten','Activiteiten', acts.length + (c.notities||[]).length],
    ['taken','Taken', taken.filter(t=>!t.klaar).length],
    ['historie','Historie', (c.historie||[]).length]
  ].map(([k,lbl,n]) => `<button class="tab${tabActief===k?' on':''}" data-t="${k}">${h(lbl)}${n?`<span class="cnt num">${n}</span>`:''}</button>`).join('');
}

function tabInhoud(mount, c){
  const el = mount.querySelector('#c_tabinhoud');
  const fn = {
    activiteiten: () => tabActiviteiten(el, c),
    taken:        () => tabTaken(el, c),
    historie:     () => tabHistorie(el, c)
  }[tabActief];
  /* Een onbekend tabblad (bv. het oude 'notities') valt terug op de
     stroom in plaats van op een leeg vlak. */
  if(fn) fn(); else { tabActief = 'activiteiten'; tabActiviteiten(el, c); }
}

/* Eén stroom op tijd: belletjes, appjes, mails, gesprekken én notities.
   Vastleggen doe je met de snelbalk erboven — de losse knoppenrij die
   hier stond deed hetzelfde en stond er dus dubbel. */
function tabActiviteiten(el, c){
  const items = CRM.activiteitenVoor('kandidaat', c.id)
    .map(a => ({
      op:a.op,
      titel:((CRM.ACT_SOORTEN[a.soort]||{}).lbl || a.soort) + (a.door ? ' · ' + a.door : ''),
      wanneer:CRM.fmtDate(a.op) + ' · ' + CRM.geleden(a.op),
      tekst:a.tekst
    }))
    .concat((c.notities||[]).map(n => ({
      op:n.op,
      titel:'Notitie' + (n.door ? ' · ' + n.door : ''),
      wanneer:CRM.fmtDate(n.op) + ' · ' + CRM.geleden(n.op),
      tekst:n.tekst
    })))
    .sort((a,b) => String(b.op||'').localeCompare(String(a.op||'')));
  /* De invoerregel hoort in dit blok en niet als losse balk erboven
     (naam: Tjeerd, 6 aug 2026): je legt iets vast in de lijst waarin het
     daarna verschijnt. */
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Activiteiten &amp; notities</div></div>
    <div class="card-b">
      ${snelbalkHtml(c)}
      ${items.length ? CRM.ui.tijdlijn(items)
      : '<p class="meta" style="margin:0">Nog niets vastgelegd — typ hierboven wat er is gebeurd.</p>'}</div></div>`;
  bindSnelbalk(el, c);
}

/* opts is optioneel: een eigen venstertitel, een vaste aanhef vóór de tekst
   en extra's die met de activiteit meegaan (bv. de nazorg-check-in). Zonder
   opts gedraagt dit zich precies zoals eerst. */
async function logVia(c, soort, hint, opts){
  const o = opts || {};
  const tekst = await CRM.vraag(o.titel || (CRM.ACT_SOORTEN[soort]||{}).lbl || 'Activiteit',
    {multiline:true, hint, knop:'Vastleggen'});
  if(!tekst) return;
  await CRM.logActiviteit('kandidaat', c.id, soort, (o.prefix || '') + tekst, o.extra || {});
  CRM.verwerkTags(tekst, 'kandidaat', c.id);       // @collega → melding
  CRM.toast('Vastgelegd','ok');
  CRM.render();
}

function tabTaken(el, c){
  const taken = (CRM.state.taken||[]).filter(t => t.entiteit === 'kandidaat' && String(t.ref) === String(c.id))
    .sort((a,b) => (a.klaar?1:0)-(b.klaar?1:0) || String(a.datum||'').localeCompare(String(b.datum||'')));
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Taken</div><span class="spacer"></span>
      <button class="btn sm" id="kt_nieuw">Taak toevoegen</button></div>
    <div class="card-b">${taken.length ? `<div class="kd-taken">${taken.map(t => `
      <label class="kd-taak${t.klaar?' klaar':''}">
        <input type="checkbox" data-taak="${h(t.id)}"${t.klaar?' checked':''}>
        <div style="flex:1;min-width:0"><b>${h(t.tekst)}</b>
          <div class="meta"><span class="num">${h(CRM.fmtDate(t.datum))}</span>${t.voor?' · '+h(t.voor):''}</div></div>
        ${t.prioriteit==='Hoog'?'<span class="chip amber">Hoog</span>':''}
      </label>`).join('')}</div>` : CRM.ui.leeg('Geen taken','Zet je volgende stap voor deze kandidaat vast.')}</div></div>`;
  el.querySelector('#kt_nieuw').onclick = () => nieuweTaak(c);
  el.querySelectorAll('[data-taak]').forEach(cb => cb.onchange = async () => {
    const t = CRM.state.taken.find(x => String(x.id) === cb.dataset.taak);
    await bewaarRij('crm_taken','taken', Object.assign({}, t, {klaar:cb.checked}), true);
    CRM.render();
  });
}

/* Taak via het gedeelde taakvenster van core — toewijzen, prioriteit en
   Outlook werken daar overal hetzelfde. */
async function nieuweTaak(c, tekst){
  /* De naam alleen is te weinig. Krijgt Tjerk "Tomasz voorbereiden", dan moet
     erbij staan vóór welke vacature en bij welke klant — anders begint hij met
     uitzoeken wat jij al wist. Vacature vóór functie: dat is waar het gesprek
     over gaat. (Tjeerd, 3 aug 2026.) */
  const v = c.vacatureId ? (CRM.state.vacs||[]).find(x => String(x.id) === String(c.vacatureId)) : null;
  const waarover = v ? `${v.functie || 'vacature'} bij ${v.klant}`
                     : [c.functie, c.klant].filter(Boolean).join(' bij ');
  /* Kwam je uit de snelbalk, dan staat de tekst er al — die typ je niet
     nog een keer over in het venster. */
  const rij = await CRM.taakModal({entiteit:'kandidaat', ref:c.id, tekst: tekst || '',
    refLabel: waarover ? `${c.naam} — ${waarover}` : c.naam});
  if(rij){ tabActief = 'taken'; CRM.render(); }
}

/* ═══════════════════════════════════════════════════════════════
   VIDEOCALL INPLANNEN
   De eerste echte stap na binnenkomst: vanuit jouw gekoppelde agenda
   een Teams-call bij de kandidaat. Teams staat daarom standaard aan;
   uitvinken maakt er een gewone afspraak van. Zonder koppeling valt
   het terug op de Outlook-deeplink — precies zoals eerder.
   ═══════════════════════════════════════════════════════════════ */
function videocallModal(c){
  if(!(CRM.outlook && CRM.outlook.maakAfspraak)) return CRM.toast('Agenda-koppeling niet geladen','err');
  const naam = String(c.naam||'').trim();
  const titel = String(c.functie||'').trim()
    ? `Videocall — ${naam || 'kandidaat'} · ${String(c.functie).trim()}`
    : `Videocall intake — ${naam || 'kandidaat'}`;
  const gekoppeld = agendaGekoppeld();
  CRM.modal.open(`
    <div class="modal-h"><div class="h2">Videocall inplannen</div>
      <p class="sub" style="margin:6px 0 0">${h(naam || 'Deze kandidaat')} — de call komt in jouw agenda en de
        kandidaat krijgt de uitnodiging met de Teams-link.</p></div>
    <div class="modal-b">
      <div class="f-row"><label>Onderwerp</label><input type="text" id="vc_titel" value="${h(titel)}"></div>
      <div class="f-grid">
        <div class="f-row"><label>Datum</label>
          <input type="date" id="vc_datum" value="${h(String(c.datum||'').slice(0,10)||CRM.todayISO())}"></div>
        <div class="f-row"><label>Tijd</label>
          <input type="time" id="vc_tijd" value="${h(c.tijd||'10:00')}"></div>
        <div class="f-row"><label>Duur</label><select id="vc_duur">
          <option value="20">20 minuten</option>
          <option value="30" selected>30 minuten</option>
          <option value="45">45 minuten</option></select></div>
      </div>
      <label class="check kd-vcteams"><input type="checkbox" id="vc_teams" checked> Teams-videocall aanmaken</label>
      <div class="f-row" style="margin-top:12px"><label>Kandidaat ontvangt de uitnodiging op</label>
        <input type="email" id="vc_email" placeholder="naam@voorbeeld.nl" value="${h(c.email||'')}"></div>
      ${c.email ? '' : `<div class="note warn kd-vcgeenmail">
        <span>Geen e-mailadres — vul het eerst in op de kaart, dan krijgt de kandidaat de uitnodiging.
          Zonder adres kun je gewoon inplannen: de afspraak staat dan alleen in je eigen agenda.</span>
        <button type="button" class="btn ghost sm" id="vc_naarmail">Naar het e-mailveld</button></div>`}
      <div class="f-row" style="margin-top:12px"><label>Notitie voor in de uitnodiging</label>
        <textarea id="vc_body" placeholder="Bijvoorbeeld: korte kennismaking — we bespreken je ervaring, wensen en beschikbaarheid."></textarea></div>
      ${gekoppeld ? '' : `<p class="meta kd-vchint">Je agenda is nog niet gekoppeld. Outlook opent straks met alles
        vooringevuld — zet daar zelf de Teams-vergadering aan en klik op Opslaan. Koppel je Microsoft-account in
        Instellingen, dan zet het CRM de videocall er direct in.</p>`}
    </div>
    <div class="modal-f"><button class="btn ghost" data-mclose>Annuleren</button>
      <button class="btn" id="vc_ok">Videocall inplannen</button></div>`, {onOpen(m){
    const naarMail = m.querySelector('#vc_naarmail');
    if(naarMail) naarMail.onclick = () => { CRM.modal.close(); springNaarVeld('email', c); };

    m.querySelector('#vc_ok').onclick = async () => {
      const teams = m.querySelector('#vc_teams').checked;
      const email = m.querySelector('#vc_email').value.trim();
      const d = {
        titel:   m.querySelector('#vc_titel').value.trim(),
        datum:   m.querySelector('#vc_datum').value,
        tijd:    m.querySelector('#vc_tijd').value || '10:00',
        duurMin: Number(m.querySelector('#vc_duur').value) || 30,
        teams,
        locatie: teams ? 'Microsoft Teams' : '',
        body:    m.querySelector('#vc_body').value.trim(),
        deelnemers: [email].filter(Boolean)
      };
      if(!d.titel) return CRM.toast('Vul een onderwerp in','err');
      if(!d.datum) return CRM.toast('Kies een datum','err');
      CRM.modal.close();
      try{
        const r = (await CRM.outlook.maakAfspraak(d)) || {};
        /* (a) datum/tijd op de kaart, zodat bord, pijplijn en dashboard
           de afspraak tonen. (c) een Teams-link bewaren we als notitie —
           die staat bij de kandidaat en niet alleen in een toast. */
        const bij = Object.assign({}, c, {datum:d.datum, tijd:d.tijd});
        if(r.online) bij.notities = [{op:new Date().toISOString(), door:CRM.me(),
          tekst:'Teams-link: ' + r.online}].concat(c.notities||[]);
        await bewaarKandidaat(bij);
        await CRM.logActiviteit('kandidaat', c.id, 'gesprek',
          `Videocall ingepland: ${d.titel} op ${CRM.fmtDate(d.datum)} ${d.tijd}`);
        CRM.toast(r.via === 'graph'
          ? (r.online ? 'Videocall staat in je agenda — Teams-link toegevoegd'
                      : (d.deelnemers.length ? 'Afspraak staat in je agenda — uitnodiging verstuurd'
                                             : 'Afspraak staat in je agenda'))
          : 'Outlook geopend — controleer en klik daar op Opslaan', 'ok');
        CRM.render();
      }catch(e){ CRM.fout('Inplannen mislukt', e); }
    };
  }});
}

/* De laatste notities, pal onder de kop.
   Ze zaten in een tabblad, dus je moest eerst klikken om te zien waar een
   collega mee bezig was — en dan zag je het alleen als je eraan dacht.
   Bij een kandidaat waar Tjerk en Rajesh allebei aan werken is dat precies
   het verkeerde om: wat er gisteren gezegd is bepaalt wat jij vandaag doet.
   (Tjeerd, 3 aug 2026: "iedereen moet direct zien waar iedereen mee bezig is
   in de eerste oogopslag.")

   Twee stuks, kort. Meer hoort in het tabblad — dit is een aanwijzing, geen
   archief. Staat er niets, dan staat er ook niets: een leeg kader onder elke
   kop maakt de kaart langer zonder iets te zeggen. */
function laatsteNotitiesHtml(c){
  const n = (c.notities||[]).slice()
    .sort((a,b) => String(b.op||'').localeCompare(String(a.op||''))).slice(0,2);
  if(!n.length) return '';
  return `<div class="card kd-lnot"><div class="card-b">
    <div class="label">Laatst vastgelegd</div>
    ${n.map(x => `<div class="kd-lnotrij">
      <span class="kd-lnottekst">${h(x.tekst)}</span>
      <span class="meta num">${h(x.door||'—')} · ${h(CRM.geleden(x.op))}</span>
    </div>`).join('')}
    ${(c.notities||[]).length > 2
      ? `<button type="button" class="lnk" id="kd_lnotmeer">Alle ${(c.notities||[]).length} notities →</button>` : ''}
  </div></div>`;
}

/* tabNotities is vervallen: notities lopen mee in tabActiviteiten en
   vastleggen gaat via de snelbalk bovenaan de werkkolom. */
async function notitieToevoegen(c){
  const tekst = await CRM.vraag('Notitie', {multiline:true,
    hint:'Wat wil je onthouden over deze kandidaat? Tip: @collega stuurt diegene een melding.', knop:'Opslaan'});
  if(!tekst) return;
  const nieuw = Object.assign({}, c, {
    notities:[{op:new Date().toISOString(), door:CRM.me(), tekst}].concat(c.notities||[])
  });
  await bewaarKandidaat(nieuw);
  CRM.verwerkTags(tekst, 'kandidaat', c.id);       // @collega → melding
  tabActief = 'activiteiten'; CRM.render();
}

function tabHistorie(el, c){
  const hist = (c.historie||[]).slice().sort((a,b) => String(a.op||'').localeCompare(String(b.op||'')));
  const items = hist.map((x,i) => {
    const volgend = hist[i+1] ? hist[i+1].op : null;
    const dagen = volgend ? Math.round((new Date(volgend) - new Date(x.op)) / 86400000) : CRM.dagenGeleden(x.op);
    return {
      titel:x.fase,
      wanneer:CRM.fmtDate(x.op) + (dagen != null && dagen >= 0 ? ' · ' + dagen + ' dagen in deze fase' : ''),
      tekst:''
    };
  }).reverse();
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="h2">Historie</div>
      <span class="meta">doorlooptijd per fase</span></div>
    <div class="card-b">${items.length ? CRM.ui.tijdlijn(items)
      : CRM.ui.leeg('Nog geen fasewissels','Zodra deze kandidaat doorstroomt bouwt de historie zich vanzelf op.')}</div></div>`;
}

/* ─── Demo: golden candidates zichtbaar maken ─────────────────────
   demo.js is niet van deze module en blijft onaangeraakt; we zetten
   de vlag hier op een paar demo-kandidaten zodra de demodata er is,
   zodat het filter en de ster in demo-modus te controleren zijn. */
if(CRM.demo){
  const markeer = () => ['demo3','demo41','demo47'].forEach(id => {
    const r = (CRM.state.cands||[]).find(x => String(x.id) === id);
    if(r) r.golden = true;
  });
  if(CRM.state._demo) markeer();
  else window.addEventListener('crm-demo-ready', markeer);
}

/* ─── Registratie ─────────────────────────────────────────────── */
CRM.registerModule('kandidaten', {
  title:'Kandidaten', icon:'☰', onderschrift:'De kaartenbak — bladeren en kaarten openen',
  render(mount, acties, params){
    if(!Array.isArray(CRM.state.taken)) CRM.state.taken = [];
    /* Doorklik vanuit een ander scherm mag het statusfilter zetten. Klanttrajecten
       stuurt 'klaar' ("klaar om voor te stellen"), hier heet diezelfde verzameling
       'gekwalificeerd' — twee woorden voor hetzelfde, dus vertalen in plaats van
       de gebruiker op het overzicht laten landen zonder filter. */
    if(params && params.status){
      const sleutel = params.status === 'klaar' ? 'gekwalificeerd' : String(params.status);
      if(STATUS_OPTS.some(o => o.k === sleutel)) zet('status', sleutel);
    }
    if(params && params.id) kaart(mount, acties, String(params.id));
    else overzicht(mount, acties);
  }
});
})();

/* VERZOEK AAN CORE: de hashchange-listener in core.js rendert alleen als de
   módule wisselt (hash[0] !== CRM.view). Een link naar #kandidaten/<id> doet
   daardoor niets als je al op Kandidaten staat; modules moeten nu overal eigen
   click-handlers zetten die CRM.ga(...) aanroepen. Fijner: in core ook op een
   gewijzigd id binnen dezelfde module opnieuw renderen. */

/* VERZOEK AAN COORDINATOR:

   1. js/opvolging.js — exporteer de lijst `CONTACT` als
      `CRM.opvolging.CONTACT` (regel 91, ['bel','gesprek','whatsapp','mail',
      'bezoek']). Dit scherm sorteert standaard op "hoe lang niet gesproken"
      en telt daarmee ook de voorraadregel, en moet daarvoor exact dezelfde
      definitie van contact gebruiken, anders zegt het dashboard iets anders
      dan deze lijst.
      Zolang die export er niet is staat er hier een kopie van vijf woorden
      (CONTACT_SOORTEN bovenin dit bestand); die pakt de export vanzelf op
      zodra hij bestaat en kan er dan uit. Nu zijn het twee plekken die
      gelijk moeten blijven, en dat gaat een keer mis.

   2. js/recruitment.js — de videocall is de enige stap die niet op de
      kandidaat wordt vastgelegd. `CRM.klaarOmVoorTeStellen` leunt daarom op
      de intake als bewijs dat er een videocall is geweest, en het paneel
      bovenaan dit scherm legt dat met zoveel woorden uit. Beter zou zijn:
      bij het doorschieten van een lead met status 'Videocall gehad' een
      datum meenemen naar de kandidaat (bv. `intake.videocallOp`). Dan is
      het geteld in plaats van beredeneerd, en kan die uitleg weg.

   3. js/pijplijn.js en js/dashboard.js — de gekwalificeerde voorraad
      (`CRM.klaarOmVoorTeStellen`, hier zichtbaar als één getal met een
      uitsplitsing per gezochte functie) is nu alleen op dit scherm te zien.
      Dat is precies het getal waar Tjeerd op stuurt; het hoort ook op het
      dashboard. De telling zit in dit bestand in `voorraad()` — als jullie
      hem elders willen, is het beter die functie naar js/data.js te tillen
      dan hem over te schrijven. Zeg het, dan lever ik hem aan.

   4. js/kandverwijder.js — `isGeanonimiseerd` herkent een gewiste kaart aan
      de naam die met 'Gegevens gewist' begint. Dit scherm gebruikt dat om
      zo iemand uit de voorraad en uit de bellijst-sortering te houden. Werkt prima, maar het is een
      tekstvergelijking op een naam die een gebruiker kan overtypen. Een
      echte vlag op de rij (bv. `candidates.geanonimiseerd_op`) zou dat
      dichttimmeren. */

/* ═══════════════════════════════════════════════════════════════
   VERZOEK AAN COORDINATOR — CV inlezen (31 jul 2026)

   1. css/base.css — DIT IS DE OORZAAK van "ik kan niet op de parser
      klikken op de grote kandidatenkaart", en het raakt elk scherm.

      `.modal` staat `position:fixed` in het midden van het beeld en
      wordt bij sluiten alleen op `opacity:0` gezet. `.scrim` krijgt in
      diezelfde situatie wél `pointer-events:none` (regel 356-358),
      `.modal` niet. Na élk gesloten venster blijft er dus een
      onzichtbaar blok van maximaal 520px breed en 90vh hoog midden op
      het scherm liggen dat alle klikken opvangt. Gemeten op 1180×760:
      vóór het openen van een venster is de knop CV inlezen klikbaar,
      ná één keer openen en sluiten is `document.elementFromPoint()` op
      diezelfde knop `div.modal-b`. Bij de bredere `.cvp-modal` is het
      dode vlak nog groter.

      Twee regels bij `.modal` en `.modal.on` (regel 376-382):
        .modal{ ... pointer-events:none}
        .modal.on{ ... pointer-events:auto}

      Tot die tijd staat de eerste van die twee onderaan
      css/kandidaten.css, met dezelfde uitleg. Zet je hem in base.css,
      haal hem hier dan weg — hij hoort niet in een modulestylesheet.

   2. index.html — het versiemerk `?v=20260731a` staat nog op de oude
      waarde. Zonder ophogen krijgt Tjeerd de gewijzigde js/css niet te
      zien; tijdens het testen serveerde de browser hardnekkig de oude
      css/kandidaten.css terwijl de server de nieuwe al had.

   3. js/feest.js — de feestkaart komt in demo-modus over het midden van
      het scherm te staan en `.feest-kaart` heeft `pointer-events:auto`.
      Zolang die kaart in beeld is, is de knop CV inlezen er niet meer
      doorheen te klikken. Minder erg dan punt 1 (hij gaat vanzelf naar
      de ruststand rechtsboven), maar het is dezelfde klacht.

   4. supabase/schema.sql — niets verplicht. Wel handig: de nieuwe route
      "+ Sollicitant → CV inlezen" in js/recruitment.js maakt een
      kandidaat zonder vacature. Wil je later kunnen zien welke
      kandidaten zo binnenkomen, dan is een waarde 'CV' in de bronlijst
      (CRM.LEAD_BRONNEN in js/data.js) preciezer dan 'Handmatig', dat we
      nu gebruiken omdat het een bestaande waarde is. */

/* VERZOEK AAN COORDINATOR — geschiedenis bij een voorstel (31 jul 2026):

   1. supabase/schema.sql — er is geen veld dat een afwijzing vastlegt als
      PAAR kandidaat × klant. De uitvalreden staat op de kandidaatkaart en
      hangt dus aan de klant die op dát moment op die kaart stond. Wordt
      dezelfde kaart later hergebruikt voor een andere klant, dan is de
      oude afwijzing weg. CRM.kdHistorie leest daarom ook de kaarten die
      via `herstart_van` aan elkaar hangen (dat is wél vastgelegd), maar
      een tabel `crm_voorstellen` (kandidaat, klant, vacature, uitkomst,
      datum) zou dit definitief oplossen — en zou meteen de vraag
      "hoe vaak hebben we bij deze klant iemand voorgesteld" beantwoorden.

   2. js/recruitment.js — het uitvalformulier vraagt niet wie er afwees als
      de reden 'Anders' is. `afvalType` + `afvalCat` samen bepalen nu of we
      "deze klant wees af" mogen zeggen; bij 'Anders' zeggen we alleen
      "eerder hier afgevallen". Eén radioknop (klant / kandidaat / anders,
      zoals bij Gestopt) zou die regel scherper maken.

   3. js/data.js — `CRM.matchScore` filtert niets op geschiedenis of
      bezetting, en dat is goed zo: die twee horen gescheiden. Mocht de
      score ooit harde eisen gaan afdwingen, houd dan de bezetting erbuiten;
      CRM.vacBezetting (js/hot.js) is daar de enige bron voor.               */
