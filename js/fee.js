/* ═══════════════════════════════════════════════════════════════
   REKENMOTOR: FEE
   De brug tussen de samenwerkingsovereenkomst en de facturatie.

   Dit bestand rekent, meer niet. Geen HTML, geen knoppen, geen
   database — zo is het los te testen en kunnen alle modules (klanten,
   kandidaten, finance, pijplijn) met dezelfde uitkomst werken.

   De grondslag volgt de getekende SWO letterlijk:
     "De Werving & Selectie-fee wordt berekend over het bruto
      jaarsalaris. De grondslag bestaat uit: twaalf (12) maal het
      overeengekomen bruto maandsalaris; vakantiegeld (8%); een vaste,
      structurele dertiende maand of eindejaarsuitkering, voor zover
      contractueel of op grond van de cao vast toegekend; vaste,
      structurele ploegen- of functietoeslagen, voor zover contractueel
      of op grond van de cao vast toegekend.
      Niet tot de grondslag behoren: variabele of discretionaire
      bonussen, resultaatafhankelijke beloning, overwerkvergoeding,
      onkosten- en reiskostenvergoedingen en overige incidentele of
      niet-structurele beloningen."

   Rekenregel (identiek aan het pijplijnbord, nagerekend):
     jaar = maandloon × maanden
     grondslag = jaar × (1+toeslag) × (1+vt) + jaar × eju + jaar × overig
   Vakantiegeld rekent dus mee over het loon inclusief ploegentoeslag;
   de dertiende maand en overige toeslagen over het kale jaarloon.
   Controle: 2960 · 15% · 8%           → € 44.116
             2960 · 15% · 8% · 8,33%   → € 47.075

   PRIVACY — lees dit voordat je hier iets aan toevoegt:
   `crm_afspraken` bevat fee-percentages en is in Supabase afgeschermd
   tot Tjeerd (policy `afspraken_owner_only`). Alles in dit bestand dat
   een bedrag of een percentage teruggeeft is dus alleen zinvol achter
   `CRM.magOpbrengstZien()`. ÉÉN functie is bewust de uitzondering:
   `watMist()` — die vertelt de accountmanager welke velden nog ontbreken
   en geeft daarom nooit een bedrag of percentage terug.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ─── Standaard uit de overeenkomst ───────────────────────────────
   Wat een afspraak niet regelt, volgt de SWO-tekst hierboven. */
const STANDAARD_GRONDSLAG = {maanden:12, vt_pct:8, eju:true, toeslag:true, overig:true};
const STANDAARD_AFSPRAAK  = {
  soort:'ws', fee_regels:[], fee_standaard:null, grondslag:{},
  betaaltermijn:30, factuurmoment:'contract',
  garantie_mnd:2, garantie_soort:'vervanging', exclusiviteit_wkn:3,
  ingang:'', einde:'', actief:true, notitie:''
};

const SOORTEN = [
  {k:'ws',          lbl:'Werving & Selectie'},
  {k:'detachering', lbl:'Detachering'},
  {k:'uitzenden',   lbl:'Uitzenden'}
];
const FACTUURMOMENTEN = [
  {k:'contract', lbl:'Bij contract getekend', veld:'geplaatstOp', veldLbl:'Datum contract getekend'},
  {k:'start',    lbl:'Bij start van de kandidaat', veld:'start', veldLbl:'Startdatum'}
];
const GARANTIESOORTEN = [
  {k:'vervanging', lbl:'Kosteloze vervanging'},
  {k:'restitutie', lbl:'Restitutie (pro rato)'},
  {k:'geen',       lbl:'Geen garantieregeling'}
];

/* ─── Getallen ────────────────────────────────────────────────────
   Uit de database komt jsonb, uit een formulier komt tekst. "23%",
   "23,5", "€ 2.960,00" en 23 moeten allemaal hetzelfde betekenen —
   anders staat er straks NaN op een factuur. */
function getal(v){
  if(v == null || v === '') return null;
  if(typeof v === 'number') return isFinite(v) ? v : null;
  if(typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v).replace(/[\s %€]/g, '');
  if(!s) return null;
  const komma = s.lastIndexOf(','), punt = s.lastIndexOf('.');
  if(komma > -1 && punt > -1){
    /* Beide aanwezig: de laatste is het decimaalteken. */
    s = komma > punt ? s.replace(/\./g,'').replace(',', '.') : s.replace(/,/g,'');
  }else if(komma > -1){
    s = s.replace(',', '.');
  }else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)){
    s = s.replace(/\./g,'');           /* 1.234 = duizendtal, geen 1,234 */
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
/* Percentage: nooit negatief, nooit onzinnig groot. */
function pctGetal(v){
  const n = getal(v);
  if(n == null || n < 0) return null;
  return n;
}
function vlag(v, standaard){
  if(v == null || v === '') return standaard;
  if(typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if(['true','ja','1','y','yes','aan'].includes(s))  return true;
  if(['false','nee','0','n','no','uit'].includes(s)) return false;
  return standaard;
}
const rond = (n, d = 2) => {
  if(n == null || !isFinite(n)) return null;
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
};

/* ─── Datums ──────────────────────────────────────────────────────
   Altijd lokale datums (sv-SE = YYYY-MM-DD), nooit UTC — anders
   verschuift een factuurdatum een dag. */
const isoLoc = d => d.toLocaleDateString('sv-SE');
function datum(v){
  if(!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : isoLoc(d);
}
function plusDagen(iso, n){
  const d = new Date(iso);
  if(isNaN(d) || n == null) return '';
  d.setDate(d.getDate() + n);
  return isoLoc(d);
}
/* Maanden erbij, met klem op het maandeinde: 31 dec + 2 maanden is
   28 februari, niet 3 maart. */
function plusMaanden(iso, n){
  const d = new Date(iso);
  if(isNaN(d) || !n) return isNaN(d) ? '' : isoLoc(d);
  const dag = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const laatste = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dag, laatste));
  return isoLoc(d);
}

/* ─── Afspraak normaliseren ───────────────────────────────────────
   Eén vorm voor de rest van de motor, ongeacht of de rij uit de
   database, uit een formulier of uit een demo-localStorage komt. */
function normaliseer(afspraak){
  const a = afspraak || {};
  const g = (a.grondslag && typeof a.grondslag === 'object') ? a.grondslag : {};
  const maanden = getal(g.maanden);
  const vt      = pctGetal(g.vt_pct);
  const regels  = (Array.isArray(a.fee_regels) ? a.fee_regels : [])
    .map(r => ({
      functiegroep: String((r && (r.functiegroep ?? r.functie)) || '').trim(),
      pct: pctGetal(r && r.pct),
      /* Drie vormen (Tjeerd, 5 aug 2026: "ik heb vaak een fixed fee, of
         2× een maandsalaris"): 'pct' rekent over de jaargrondslag,
         'vast' is een afgesproken bedrag in euro's, 'maanden' is n × het
         bruto maandsalaris van de kandidaat. De vorm zit per regel in de
         bestaande jsonb-kolom — geen schemawijziging nodig, en per
         functiegroep mag hij verschillen ("operators 22%, teamleiders
         vast € 6.000"). */
      vorm: (r && (r.vorm === 'vast' || r.vorm === 'maanden')) ? r.vorm : 'pct',
      bedrag:  getal(r && r.bedrag),
      maanden: getal(r && r.maanden)
    }))
    .filter(r => r.functiegroep || r.pct != null || r.bedrag != null || r.maanden != null);
  return {
    er:            !!afspraak,
    id:            a.id || '',
    klant:         a.klant || '',
    soort:         a.soort || STANDAARD_AFSPRAAK.soort,
    fee_regels:    regels,
    fee_standaard: pctGetal(a.fee_standaard),
    grondslag: {
      maanden: (maanden != null && maanden > 0) ? maanden : STANDAARD_GRONDSLAG.maanden,
      vt_pct:  vt,                                     /* null = volg de kandidaat */
      eju:     vlag(g.eju,     STANDAARD_GRONDSLAG.eju),
      toeslag: vlag(g.toeslag, STANDAARD_GRONDSLAG.toeslag),
      overig:  vlag(g.overig,  STANDAARD_GRONDSLAG.overig)
    },
    betaaltermijn:  getal(a.betaaltermijn) ?? STANDAARD_AFSPRAAK.betaaltermijn,
    factuurmoment:  FACTUURMOMENTEN.some(f => f.k === a.factuurmoment) ? a.factuurmoment : 'contract',
    garantie_mnd:   getal(a.garantie_mnd) ?? STANDAARD_AFSPRAAK.garantie_mnd,
    garantie_soort: GARANTIESOORTEN.some(x => x.k === a.garantie_soort) ? a.garantie_soort : 'vervanging',
    exclusiviteit_wkn: getal(a.exclusiviteit_wkn),
    /* Alleen zinvol bij uitzenden: na zoveel gewerkte uren mag de klant de
       kracht kosteloos overnemen (Thermon: 1200 uur). */
    overname_uren:  getal(a.overname_uren),
    ingang:  datum(a.ingang),
    einde:   datum(a.einde),
    stuk_id: a.stuk_id || '',
    actief:  vlag(a.actief, true),
    notitie: a.notitie || '',
    door:    a.door || ''
  };
}

/* Loopt deze afspraak op deze datum? Zonder datums: altijd. */
function geldigOp(afspraak, op){
  const a = normaliseer(afspraak);
  const d = datum(op);
  if(!d) return true;
  if(a.ingang && d < a.ingang) return false;
  if(a.einde  && d > a.einde)  return false;
  return true;
}

/* ─── Functiegroep zoeken ─────────────────────────────────────────
   Een fee-regel heet bijvoorbeeld "Managers (QFS, Safety, Productie,
   Plant)" en de kandidaat is "Plant Manager". Twee passen:
   1. hele woorden (ook uit de haakjes) — sterkste signaal;
   2. losse tekst in de hoofdterm, zodat "Procesoperator" nog steeds
      onder "Operator (verlading en proces)" valt.
   De haakjes-termen doen géén losse-tekstmatch, anders zou
   "Productiemedewerker" onder "Managers (… Productie …)" belanden. */
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function termen(groep){
  const s = String(groep || '').toLowerCase();
  const tussen = [...s.matchAll(/\(([^)]*)\)/g)].map(m => m[1]);
  const hoofd  = s.replace(/\([^)]*\)/g, ' ');
  const split  = t => String(t).split(/[,/;+&]| en /).map(x => x.trim()).filter(x => x.length >= 3);
  const uit = x => {
    /* Ruwe enkelvoudsvorm: monteurs → monteur, managers → manager. */
    const v = [x];
    if(x.length > 4 && /s$/.test(x) && !/ss$/.test(x)) v.push(x.slice(0, -1));
    return v;
  };
  return {
    hoofd:  [...new Set(split(hoofd).flatMap(uit))],
    tussen: [...new Set(split(tussen.join(',')).flatMap(uit))]
  };
}
function scoreGroep(functie, groep){
  const f = String(functie || '').trim().toLowerCase();
  const g = String(groep   || '').trim().toLowerCase();
  if(!f || !g) return 0;
  if(f === g) return 1000;
  const t = termen(g);
  let best = 0;
  for(const term of t.hoofd.concat(t.tussen)){
    if(new RegExp('\\b' + escRe(term) + '\\b').test(f)) best = Math.max(best, 100 + term.length);
  }
  for(const term of t.hoofd){
    if(f.includes(term) || (term.length >= 5 && term.includes(f))) best = Math.max(best, term.length);
  }
  return best;
}

/* ═══════════════════════════════════════════════════════════════
   1. GRONDSLAG — het bruto jaarsalaris waarover de fee rekent
   ═══════════════════════════════════════════════════════════════ */
function grondslag(kandidaat, afspraak){
  const c = kandidaat || {};
  const a = normaliseer(afspraak);
  const g = a.grondslag;

  const maandloon = getal(c.maandloon);
  const maanden   = g.maanden;
  const opbouw = [], buiten = [];

  /* Vakantiegeld: de overeenkomst gaat vóór de kandidaatinvoer — de
     grondslag is contractueel bepaald, niet per kandidaat. Regelt de
     afspraak niets, dan telt wat bij de kandidaat staat; staat daar
     niets, dan de 8% uit de standaardtekst. */
  const vtPct      = g.vt_pct != null ? g.vt_pct : (pctGetal(c.vtPct) != null ? pctGetal(c.vtPct) : STANDAARD_GRONDSLAG.vt_pct);
  const toeslagPct = g.toeslag ? (pctGetal(c.toeslagPct) || 0) : 0;
  const ejuPct     = g.eju     ? (pctGetal(c.ejuPct)     || 0) : 0;
  const overigPct  = g.overig  ? (pctGetal(c.overigPct)  || 0) : 0;

  if(!g.toeslag && pctGetal(c.toeslagPct)) buiten.push({label:'Ploegen-/functietoeslag', reden:'telt volgens de afspraak niet mee'});
  if(!g.eju     && pctGetal(c.ejuPct))     buiten.push({label:'Dertiende maand / eindejaarsuitkering', reden:'telt volgens de afspraak niet mee'});
  if(!g.overig  && pctGetal(c.overigPct))  buiten.push({label:'Overige vaste toeslagen', reden:'telt volgens de afspraak niet mee'});

  if(maandloon == null || maandloon <= 0){
    return {jaarSalaris:null, opbouw:[], buiten, compleet:false,
            maandloon:null, maanden, vtPct, toeslagPct, ejuPct, overigPct};
  }

  const jaar    = maandloon * maanden;
  const toeslag = jaar * toeslagPct / 100;
  const vt      = (jaar + toeslag) * vtPct / 100;
  const eju     = jaar * ejuPct / 100;
  const overig  = jaar * overigPct / 100;

  opbouw.push({label:`Bruto maandsalaris × ${maanden}`, bedrag:rond(jaar), pct:null});
  if(toeslag) opbouw.push({label:'Ploegen-/functietoeslag', bedrag:rond(toeslag), pct:toeslagPct});
  if(vt)      opbouw.push({label:'Vakantiegeld', bedrag:rond(vt), pct:vtPct});
  if(eju)     opbouw.push({label:'Dertiende maand / eindejaarsuitkering', bedrag:rond(eju), pct:ejuPct});
  if(overig)  opbouw.push({label:'Overige vaste toeslagen', bedrag:rond(overig), pct:overigPct});

  return {
    jaarSalaris: rond(jaar + toeslag + vt + eju + overig),
    opbouw, buiten, compleet:true,
    maandloon, maanden, vtPct, toeslagPct, ejuPct, overigPct
  };
}

/* ═══════════════════════════════════════════════════════════════
   2. WELK PERCENTAGE GELDT — en waarom dat percentage
   ═══════════════════════════════════════════════════════════════ */
function pctVoor(kandidaat, afspraak){
  const c = kandidaat || {};
  const a = normaliseer(afspraak);
  if(!a.er)
    return {pct:null, functiegroep:'', bron:'geen',
            uitleg:'Er is nog geen commerciële afspraak vastgelegd bij deze klant.'};

  const functie = String(c.functie || '').trim();
  /* Een regel is bruikbaar als zijn eigen vorm ingevuld is: een
     percentage bij 'pct', een bedrag bij 'vast', een aantal bij
     'maanden'. */
  const bruikbaar = r => r.vorm === 'vast' ? r.bedrag != null
                       : r.vorm === 'maanden' ? r.maanden != null
                       : r.pct != null;
  let beste = null, besteScore = 0;
  for(const r of a.fee_regels){
    if(!bruikbaar(r)) continue;
    const s = scoreGroep(functie, r.functiegroep);
    if(s > besteScore){ besteScore = s; beste = r; }
  }
  if(beste)
    return {pct:beste.pct, vorm:beste.vorm, bedrag:beste.bedrag, maanden:beste.maanden,
            functiegroep:beste.functiegroep, bron:'regel',
            uitleg:`Functie "${functie}" valt onder de fee-regel "${beste.functiegroep}".`};

  /* Een regel zónder functiegroep is het vangnet: zo staat "vaste fee
     € 5.000 voor alles" of "2× maandsalaris" gewoon tussen de regels,
     zonder aparte kolom in de tabel. */
  const vangnet = a.fee_regels.find(r => !r.functiegroep && bruikbaar(r));
  if(vangnet)
    return {pct:vangnet.pct, vorm:vangnet.vorm, bedrag:vangnet.bedrag, maanden:vangnet.maanden,
            functiegroep:'', bron:'regel', uitleg:'Deze afspraak geldt voor alle functies.'};

  if(a.fee_standaard != null){
    const uitleg = !functie
      ? 'De functie van de kandidaat is nog niet ingevuld — het standaardpercentage uit de afspraak is gebruikt.'
      : a.fee_regels.length
        ? `Geen fee-regel past bij "${functie}" — het standaardpercentage uit de afspraak is gebruikt.`
        : 'Er zijn geen fee-regels per functiegroep vastgelegd — het standaardpercentage uit de afspraak geldt.';
    return {pct:a.fee_standaard, vorm:'pct', functiegroep:'', bron:'standaard', uitleg};
  }
  return {pct:null, vorm:'pct', functiegroep:'', bron:'geen',
          uitleg:`In de afspraak staat geen percentage voor "${functie || 'deze functie'}" en ook geen standaardpercentage.`};
}

/* ═══════════════════════════════════════════════════════════════
   3. WAT MIST DE AM NOG — bewust zonder bedragen en percentages
   Deze functie werkt voor iedereen. Ze noemt alleen wélk veld leeg
   is en waar je het invult, nooit hoe hoog iets is. Ze valt ook niet
   om als de afspraak niet geladen kon worden (dat is bij het team
   altijd zo: de tabel is voor hen afgeschermd).
   ═══════════════════════════════════════════════════════════════ */
function watMist(kandidaat, afspraak){
  const c = kandidaat || {};
  const mist = [];
  const bij = (veld, label, waar) => mist.push({veld, label, waar});

  /* Weet deze gebruiker überhaupt of er een afspraak is? Zo niet, dan
     rekenen we met de standaardgrondslag uit de overeenkomst en zwijgen
     we over de afspraak — anders krijgt elke AM een vals alarm. */
  const magAfspraakZien = typeof CRM !== 'undefined' && typeof CRM.magOpbrengstZien === 'function'
    ? CRM.magOpbrengstZien() : false;
  const a = normaliseer(magAfspraakZien ? afspraak : null);
  const g = a.er ? a.grondslag : STANDAARD_GRONDSLAG;

  const KAND = 'Kandidaatkaart › Salaris & voorwaarden';

  if(!String(c.naam || '').trim()) bij('naam', 'Naam van de kandidaat', 'Kandidaatkaart');
  if(!String(c.klant || '').trim()) bij('klant', 'Bij welke klant de kandidaat geplaatst wordt', 'Kandidaatkaart');
  if(!String(c.functie || '').trim()) bij('functie', 'Functie (bepaalt onder welke afspraak de plaatsing valt)', 'Kandidaatkaart');

  const loon = getal(c.maandloon);
  if(loon == null || loon <= 0) bij('maandloon', 'Bruto maandsalaris', KAND);

  if(g.vt_pct == null && pctGetal(c.vtPct) == null)
    bij('vtPct', 'Vakantiegeld', KAND);
  if(g.toeslag && c.toeslagPct == null)
    bij('toeslagPct', 'Vaste ploegen- of functietoeslag (vul 0 in als die er niet is)', KAND);
  if(g.eju && c.ejuPct == null)
    bij('ejuPct', 'Vaste dertiende maand of eindejaarsuitkering (vul 0 in als die er niet is)', KAND);
  if(g.overig && c.overigPct == null)
    bij('overigPct', 'Overige vaste, structurele toeslagen (vul 0 in als die er niet zijn)', KAND);

  const fm = FACTUURMOMENTEN.find(f => f.k === a.factuurmoment) || FACTUURMOMENTEN[0];
  if(!datum(c[fm.veld])) bij(fm.veld, fm.veldLbl, 'Kandidaatkaart');
  if(a.garantie_mnd > 0 && !datum(c.start) && !datum(c.geplaatstOp))
    bij('start', 'Startdatum (nodig voor de garantieperiode)', 'Kandidaatkaart');

  if(magAfspraakZien && !a.er)
    bij('afspraak', 'Commerciële afspraak met deze klant', 'Klantkaart › Commerciële afspraken');

  return mist;
}

/* ═══════════════════════════════════════════════════════════════
   4. DE BEREKENING
   ═══════════════════════════════════════════════════════════════ */
/* TWEE PLAATSINGEN DIE GEEN FEE OPLEVEREN.
   Dit stond alleen in js/performance.js, waardoor de kandidatenkaart en
   het feestscherm er wél een bedrag bij zetten. Gevolg: een Flex-plaatsing
   kreeg een W&S-fee van € 8.087 op de kaart, en het feestscherm stuurde dat
   bedrag naar het hele team — voor geld dat nooit gefactureerd wordt.
   Het hoort hier, in de gedeelde rekenregel, zodat elke aanroeper het
   meekrijgt in plaats van dat iedereen het opnieuw moet bedenken.

   Flex     — de opbrengst loopt via gewerkte uren, niet via een fee.
   Vervangt — een kosteloze vervanging binnen de garantie; de fee is al
              gefactureerd op de voorganger.

   Los exporteerbaar (sinds 31 jul 2026) omdat Finance de kandidaat al vóór
   de berekening moet kunnen wegfilteren: zo'n kandidaat hoort niet met fee 0
   in de forecast, hij hoort er helemaal niet in te staan. Finance had die
   twee uitzonderingen daarom in een eigen filterregel staan — nu leest hij
   dezelfde lijst als de rest. */
function geenFeeReden(kandidaat){
  const c = kandidaat || {};
  if(String(c.type || 'W&S') === 'Flex')
    return 'Flex-plaatsing — de opbrengst loopt via gewerkte uren, niet via een W&S-fee.';
  if(c.vervangt)
    return 'Kosteloze vervanging binnen de garantie — de fee is al gefactureerd op de voorganger.';
  return '';
}

function bereken(kandidaat, afspraak){
  const c = kandidaat || {};

  const geenFee = geenFeeReden(c);
  if(geenFee){
    const gr0 = grondslag(c, afspraak);
    return {fee:null, pct:null, bron:'nvt', uitleg:geenFee, reden:geenFee,
            grondslag:gr0, waarschuwingen:[], factuurdatum:'', vervaldatum:'',
            garantieTot:'', geenFee:true};
  }

  const a = normaliseer(afspraak);
  const gr = grondslag(c, afspraak);
  const p  = pctVoor(c, afspraak);
  const waarschuwingen = [];

  const fm = FACTUURMOMENTEN.find(f => f.k === a.factuurmoment) || FACTUURMOMENTEN[0];
  const peil = datum(c[fm.veld]) || datum(c.geplaatstOp) || datum(c.start) || '';

  const factuurdatum = datum(c[fm.veld]);
  const vervaldatum  = factuurdatum ? plusDagen(factuurdatum, a.betaaltermijn) : '';
  const garantieBasis = datum(c.start) || datum(c.geplaatstOp);
  const garantieTot = (a.garantie_soort !== 'geen' && a.garantie_mnd > 0 && garantieBasis)
    ? plusMaanden(garantieBasis, a.garantie_mnd) : '';

  /* Datums in een waarschuwing lees je als mens, niet als ISO-string. */
  const leesbaar = iso => (typeof CRM !== 'undefined' && CRM.fmtDate) ? CRM.fmtDate(iso) : iso;

  let geldig = true;
  if(a.er && peil){
    if(a.ingang && peil < a.ingang){
      geldig = false;
      waarschuwingen.push('De afspraak gaat pas in op ' + leesbaar(a.ingang) + ', ná deze plaatsing — controleer welke voorwaarden hier golden.');
    }else if(a.einde && peil > a.einde){
      geldig = false;
      waarschuwingen.push('De afspraak liep af op ' + leesbaar(a.einde) + ', vóór deze plaatsing — leg eerst de nieuwe afspraak vast.');
    }
  }
  if(a.er && !a.actief){
    geldig = false;
    waarschuwingen.push('Deze afspraak staat op niet-actief.');
  }
  /* Drie vormen, drie sommen (5 aug 2026):
       pct     → percentage over de jaargrondslag (het klassieke model);
       vast    → het afgesproken bedrag, salaris niet nodig;
       maanden → n × het bruto maandsalaris van de kandidaat. */
  const vorm = p.vorm || 'pct';
  if(vorm === 'pct'){
    if(!gr.compleet) waarschuwingen.push('Zonder bruto maandsalaris is er geen grondslag om over te rekenen.');
    if(p.pct == null) waarschuwingen.push(p.uitleg);
  }else if(vorm === 'maanden' && gr.maandloon == null){
    waarschuwingen.push('Zonder bruto maandsalaris valt "' + (getal(p.maanden) || '?') + '× maandsalaris" niet uit te rekenen.');
  }

  const fee = vorm === 'vast'    ? (p.bedrag != null ? rond(p.bedrag) : null)
            : vorm === 'maanden' ? (p.maanden != null && gr.maandloon != null ? rond(gr.maandloon * p.maanden) : null)
            : (gr.compleet && p.pct != null) ? rond(gr.jaarSalaris * p.pct / 100) : null;

  /* Kant-en-klaar label voor schermen die nu "23%" tonen — die kunnen
     hier "€ 5.000 vast" of "2× maandsalaris" uit lezen. */
  const feeLabel = vorm === 'vast'    ? (p.bedrag != null ? '€ ' + p.bedrag.toLocaleString('nl-NL') + ' vast' : '')
                 : vorm === 'maanden' ? (p.maanden != null ? String(p.maanden).replace('.', ',') + '× maandsalaris' : '')
                 : (p.pct != null ? String(p.pct).replace('.', ',') + '%' : '');

  return {
    grondslag: gr,
    pct: p.pct, vorm, bedrag: p.bedrag ?? null, maanden: p.maanden ?? null, feeLabel,
    functiegroep: p.functiegroep, bron: p.bron, uitleg: p.uitleg,
    fee,
    soort: a.soort,
    factuurmoment: a.factuurmoment, factuurmomentLbl: fm.lbl,
    factuurdatum, betaaltermijn: a.betaaltermijn, vervaldatum,
    garantieMnd: a.garantie_mnd, garantieSoort: a.garantie_soort, garantieTot,
    exclusiviteitWkn: a.exclusiviteit_wkn,
    afspraak: a, geldig, waarschuwingen,
    mist: watMist(c, afspraak)
  };
}

/* ═══════════════════════════════════════════════════════════════
   5. DE JUISTE AFSPRAAK ERBIJ ZOEKEN
   Leest alleen uit `CRM.state.afspraken`. Die lijst is sinds 31 jul 2026
   voor het hele team leesbaar (besluit Tjeerd: de fee mag iedereen zien,
   alleen winst en cashflow niet), zowel in de database als hier. De
   controle blijft staan voor wie niet is ingelogd.
   ═══════════════════════════════════════════════════════════════ */
/* Eén klant kan meerdere afspraken náást elkaar hebben — Thermon heeft
   23% W&S én uitzenden met factor 2,4 (4 aug 2026). Daarom kiest deze
   functie per SOORT: het derde argument. Zonder soort geldt 'ws', want elke
   bestaande aanroep bedoelt de W&S-fee — en de uitzendfactor mag nooit
   stilletjes als percentage in een feeberekening belanden. */
function voorKlant(klant, op, soort){
  if(typeof CRM === 'undefined' || typeof CRM.magOpbrengstZien !== 'function' || !CRM.magOpbrengstZien()) return null;
  const naam = String(klant || '').trim().toLowerCase();
  if(!naam) return null;
  const wil = soort || 'ws';
  const alle = (CRM.state && Array.isArray(CRM.state.afspraken) ? CRM.state.afspraken : [])
    .filter(a => String(a.klant || '').trim().toLowerCase() === naam
              && (a.soort || 'ws') === wil);
  if(!alle.length) return null;
  const peil = datum(op) || (typeof CRM.todayISO === 'function' ? CRM.todayISO() : isoLoc(new Date()));
  const passend = alle.filter(a => a.actief !== false && geldigOp(a, peil));
  const kies = (passend.length ? passend : alle).slice().sort((x, y) =>
    String(datum(y.ingang) || y.created_at || '').localeCompare(String(datum(x.ingang) || x.created_at || '')));
  return kies[0] || null;
}

/* Alle actieve afspraken van een klant, één per soort — voor de klantkaart,
   die het hele commerciële beeld toont in plaats van alleen de W&S-kant. */
function actievePerSoort(klant, op){
  const uit = {};
  SOORTEN.forEach(s => { const a = voorKlant(klant, op, s.k); if(a) uit[s.k] = a; });
  return uit;
}

/* Kale afspraak volgens de standaardtekst van de overeenkomst. */
function leegAfspraak(klant){
  return {
    id: (typeof CRM !== 'undefined' && CRM.uid) ? CRM.uid() : 'a' + Date.now(),
    klant: klant || '', soort:'ws',
    fee_regels: [{functiegroep:'', pct:23}],
    fee_standaard: 23,
    grondslag: Object.assign({}, STANDAARD_GRONDSLAG),
    betaaltermijn:30, factuurmoment:'contract',
    garantie_mnd:2, garantie_soort:'vervanging', exclusiviteit_wkn:3,
    ingang: (typeof CRM !== 'undefined' && CRM.todayISO) ? CRM.todayISO() : isoLoc(new Date()),
    einde:null, stuk_id:'', actief:true, notitie:'',
    door: (typeof CRM !== 'undefined' && CRM.me) ? CRM.me() : ''
  };
}

window.CRM = window.CRM || {};
window.CRM.fee = {
  /* rekenwerk */
  grondslag, bereken, watMist, pctVoor, geenFeeReden,
  /* hulpstukken die modules delen */
  normaliseer, geldigOp, voorKlant, actievePerSoort, leegAfspraak,
  getal, pctGetal, plusDagen, plusMaanden,
  SOORTEN, FACTUURMOMENTEN, GARANTIESOORTEN,
  STANDAARD_GRONDSLAG
};
})();
