// ═══════════════════════════════════════════════════════════════
// PLOEGGENOTEN CRM — content-script
//
// Twee modi, zelfde paneel:
//   • LinkedIn / Sales Navigator — laadt automatisch mee (manifest).
//   • Elke andere website — jij injecteert hem zelf via het
//     extensie-icoon ("Lees deze pagina uit"). Bewust geen knop op
//     élke site: dat is alleen maar in de weg.
//
// Klik → paneel met de uitgelezen gegevens, waarin je kiest:
// kandidaat-lead of sales-lead. Alles is te wijzigen vóór opslaan,
// dus als het uitlezen iets mist typ je het gewoon bij.
// ═══════════════════════════════════════════════════════════════
(() => {
  // Al geïnjecteerd? Dan het paneel gewoon opnieuw openen i.p.v. niets doen.
  if (window.__pgLeadKnop) { if (window.__pgOpen) window.__pgOpen(); return; }
  window.__pgLeadKnop = true;

  const opLinkedIn = /(^|\.)linkedin\.com$/i.test(location.hostname);

  // Pakt de eerste ZICHTBARE, niet-lege tekst voor een lijst selectors.
  // innerText negeert verborgen elementen (o.a. LinkedIns onzichtbare h1).
  const tekst = (sels) => {
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) {
        const t = ((el.innerText || el.textContent || '')).replace(/\s+/g, ' ').trim();
        if (t) return t;
      }
    }
    return '';
  };

  // Leest naam / bedrijf / functie / plaats uit een LinkedIn-pagina.
  function linkedinUitlezen() {
    const url = location.href.split('?')[0];
    const bedrijfsPagina = /\/company\/|\/sales\/(company|account)\//.test(location.href);

    // Sales Navigator gebruikt stabiele data-anonymize attributen
    const snNaam    = tekst(['[data-anonymize="person-name"]']);
    const snBedrijf = tekst(['[data-anonymize="company-name"]']);
    const snFunctie = tekst(['[data-anonymize="headline"]', '[data-anonymize="job-title"]', '[data-anonymize="title"]', '[data-anonymize="current-position"]']);
    const snPlaats  = tekst(['[data-anonymize="location"]']);

    // Paginatitel / og:title als redmiddel voor de naam (bv. "(1) Ella Kaczynska | LinkedIn")
    const titelNaam = (document.title || '').replace(/^\(\d+\)\s*/, '').split('|')[0].split(' - ')[0].split(' – ')[0].trim();
    const og = document.querySelector('meta[property="og:title"]')?.content?.trim() || '';

    // Naam
    const regNaam = tekst(['main h1', 'section h1', '.text-heading-xlarge', 'h1']) || titelNaam;

    // Alle ZICHTBARE tekstregels in leesvolgorde (negeert verborgen/versleutelde rommel).
    const bronEl = document.querySelector('main') || document.body;
    const lijnen = (bronEl.innerText || '').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

    const isDatum = (l) => /\b(jan|feb|mrt|maart|apr|mei|jun|jul|aug|sep|okt|nov|dec)\w*\.?\s*\d{4}\b/i.test(l) || /\bheden\b/i.test(l) || /\b\d{4}\s*[-–]\s*(\d{4}|heden)\b/i.test(l);
    const isType  = (l) => /\b(fulltime|parttime|full-time|part-time|zelfstandig|freelance|stage|contract|bepaalde tijd|onbepaalde tijd|seizoen|oproep|uitzend)\b/i.test(l);
    // Herkent een plaatsregel; knipt " · Hybride/Op locatie/Contactgegevens" eraf.
    const plaatsUit = (l) => {
      if (/connecti|gemeenschap|volger/i.test(l)) return '';
      const s = l.split('·')[0].trim();
      if (!s || s.length > 60) return '';
      if (/,/.test(s)) return s;                                              // "Stad, Provincie, Land"
      if (/\bomgeving\b/i.test(s)) return s;                                  // "X en omgeving"
      if (s.split(' ').length <= 2 && /nederland|belgi[eë]|duitsland/i.test(s)) return s;  // "Nederland"
      return '';
    };

    // 1) ERVARING: meest recente functietitel + werkgever + werkplaats (voorkeur).
    // LinkedIn sorteert nieuw→oud, dus de EERSTE datumregel hoort bij de huidige functie.
    // Boven die datum staat de titel (soms met een "Fulltime"-regel ertussen); daarboven
    // de bedrijfskop met een duur-regel ("8 jr 5 mnd" of "Fulltime · 1 jr 8 mnd").
    let expTitle = '', expCompany = '', expLoc = '';
    if (!bedrijfsPagina) {
      const e = lijnen.findIndex(l => /^(ervaring|experience)$/i.test(l));
      if (e >= 0) {
        const eind = lijnen.findIndex((l, i) => i > e &&
          /^(opleiding|education|licenties?|vaardigheden|skills|aanbevelingen|interesses|projecten|cursussen|talen)\b/i.test(l));
        const grens = eind > e ? eind : Math.min(e + 60, lijnen.length);
        // Een duur-regel bevat "jr/mnd" maar is géén datum (bv. "8 jr 5 mnd", "Fulltime · 1 jr 8 mnd").
        const isDuur = (l) => !isDatum(l) && /\b\d+\s*(jr|jaar|mnd|maand|maanden)\b/i.test(l);
        let d = -1;
        for (let j = e + 1; j < grens; j++) { if (isDatum(lijnen[j])) { d = j; break; } }
        if (d > 0) {
          // Titel = eerste bruikbare regel bóven de datum (sla type/plaats/"·"-regels over).
          for (let k = d - 1; k > e; k--) {
            const l = lijnen[k];
            if (isDatum(l) || isType(l) || isDuur(l) || plaatsUit(l) || l.includes('·')) continue;
            if (!/[a-z]/i.test(l) || l.length < 2 || l.length > 90) continue;
            expTitle = l;
            // Werkgever: bedrijfskop staat boven de duur-regel; of in "Bedrijf · Type" ná de titel.
            const boven1 = lijnen[k - 1] || '', boven2 = lijnen[k - 2] || '', na1 = lijnen[k + 1] || '';
            if (isDuur(boven1) && boven2 && !isDuur(boven2) && !isDatum(boven2) && !isType(boven2) && !plaatsUit(boven2)) {
              expCompany = boven2.split('·')[0].trim();
            } else if (na1.includes('·') && isType(na1)) {
              expCompany = na1.split('·')[0].trim();
            }
            break;
          }
          const na = lijnen[d + 1] || '';                     // regel ná de datum = vaak de plaats
          const pv = plaatsUit(na); if (pv) expLoc = pv;
        }
      }
    }

    // 2) KOP-KAART: headline (fallback voor functie) + woonplaats (fallback voor plaats).
    let headline = '', woonplaats = '';
    if (!bedrijfsPagina && regNaam) {
      const ruis = /connectie|connecties|volg(t|ers|en)?|gemeenschappelijke|contactgegevens|^bericht$|weergeven|^meer$|voorgesteld|in behandeling|op zoek naar|vacature|zoeken|hoogtepunt|activiteit|volgers|aanbevelingen/i;
      const graad = /^\W*\d\s*(ste|de|e)\b/i;
      let idx = lijnen.findIndex(l => l.startsWith(regNaam));
      if (idx < 0) idx = lijnen.findIndex(l => l.includes(regNaam));
      if (idx >= 0) {
        for (let j = idx + 1; j < Math.min(idx + 10, lijnen.length); j++) {
          const l = lijnen[j];
          if (l === regNaam) continue;
          if (!woonplaats) { const pv = plaatsUit(l); if (pv) { woonplaats = pv; continue; } }
          if (!headline && !ruis.test(l) && !graad.test(l) && /[a-z]/i.test(l)
              && l.length >= 3 && l.length <= 130 && !plaatsUit(l)) { headline = l; continue; }
          if (headline && woonplaats) break;
        }
      }
    }

    const naam    = snNaam || (!bedrijfsPagina ? (regNaam || titelNaam) : '') || '';
    const functie = snFunctie || expTitle || headline || '';
    // Locatie: voorkeur voor de werkplaats van de huidige functie, dan woonplaats.
    const plaats  = snPlaats || expLoc || woonplaats || '';

    // Bedrijf waar de persoon werkt (of de bedrijfspagina zelf).
    let bedrijf = snBedrijf || (!bedrijfsPagina ? expCompany : '') || '';
    if (!bedrijf && bedrijfsPagina) bedrijf = regNaam || titelNaam || og.split('|')[0].trim();
    if (!bedrijf && !bedrijfsPagina && headline) {
      const delen = headline.split(/\s+(?:bij|at|@|–|-|·|\|)\s+/i);
      if (delen.length > 1) bedrijf = delen[delen.length - 1].trim();
    }

    // Contactgegevens — alleen als de persoon ze deelt / de "Contactgegevens"-modal open is.
    let email = '', telefoon = '';
    {
      const mail = document.querySelector('a[href^="mailto:"]');
      if (mail) email = (mail.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
      const tel = document.querySelector('a[href^="tel:"]');
      if (tel) telefoon = (tel.getAttribute('href') || '').replace(/^tel:/i, '').trim();
      if (!email || !telefoon) {
        const modal = document.querySelector('[role="dialog"], .artdeco-modal, .pv-contact-info, [aria-label*="ontactgegevens"]');
        const txt = modal ? (modal.innerText || '') : '';
        if (!email)    { const m = txt.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i); if (m) email = m[0]; }
        if (!telefoon) { const m = txt.match(/\+?\d[\d\s().\-]{7,}\d/);                 if (m) telefoon = m[0].replace(/\s{2,}/g, ' ').trim(); }
      }
    }

    const isPersoon = !!(snNaam || (!bedrijfsPagina && (regNaam || titelNaam)));
    return { naam, bedrijf, functie, plaats, email, telefoon, url,
             type: (bedrijfsPagina || (!isPersoon && bedrijf)) ? 'sales' : 'kandidaat' };
  }

  // ═══════════════════════════════════════════════════════════
  // WEBSITE-MODUS — elke andere site dan LinkedIn
  //
  // Volgorde is steeds: eerst wat het bedrijf zélf gestructureerd
  // opgeeft (JSON-LD schema.org, og:-tags), dan pas tekstherkenning.
  // Gestructureerde data klopt bijna altijd; tekst raden is de
  // reddingslijn. Wat we niet zeker weten laten we leeg — dan zie jij
  // meteen dat je het zelf moet invullen.
  // ═══════════════════════════════════════════════════════════

  // Blue-collar functies waar Ploeggenoten op werft. Wordt gebruikt om
  // vacaturetitels op een 'werken bij'-pagina te herkennen en te tellen.
  const FUNCTIEWOORDEN = [
    'productiemedewerker', 'productiepersoneel', 'procesoperator', 'operator',
    'machinebediende', 'machineoperator', 'heftruckchauffeur', 'reachtruckchauffeur',
    'orderpicker', 'magazijnmedewerker', 'magazijnmeester', 'logistiek medewerker',
    'inpakmedewerker', 'inpakker', 'verlader', 'expeditiemedewerker', 'sorteerder',
    'montagemedewerker', 'assemblagemedewerker', 'productieleider', 'voorman',
    'teamleider productie', 'teamleider logistiek', 'ploegleider', 'shift leader',
    'lasser', 'monteur', 'chauffeur', 'allround medewerker', 'productiespecialist',
    'betonstaalverwerker', 'medewerker handverpakking', 'wachtchef'
  ];

  // Alle JSON-LD-blokken op de pagina, plat geslagen (@graph uitgeklapt).
  function jsonLdBlokken() {
    const uit = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      let j; try { j = JSON.parse(s.textContent || '{}'); } catch (e) { return; }
      const rij = Array.isArray(j) ? j : [j];
      rij.forEach((o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o['@graph'])) uit.push(...o['@graph'].filter(Boolean));
        else uit.push(o);
      });
    });
    return uit;
  }
  const ldType = (blokken, types) => blokken.find((o) => {
    const t = o && o['@type'];
    return (Array.isArray(t) ? t : [t]).some((x) => types.includes(String(x || '')));
  }) || {};

  const meta = (naam) =>
    document.querySelector(`meta[property="${naam}"], meta[name="${naam}"]`)?.content?.trim() || '';

  // "acme-productie.nl" → "Acme Productie" (laatste redmiddel voor de naam).
  function naamUitDomein(host) {
    const kern = host.replace(/^www\./i, '').split('.')[0].replace(/[-_]+/g, ' ').trim();
    return kern.split(' ').map((w) => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
  }

  function websiteUitlezen() {
    const url = location.href.split('?')[0];
    const host = location.hostname.replace(/^www\./i, '');
    const blok = jsonLdBlokken();
    const org = ldType(blok, ['Organization', 'Corporation', 'LocalBusiness', 'Store', 'NGO', 'GovernmentOrganization', 'EducationalOrganization']);
    const vac = ldType(blok, ['JobPosting']);
    const eerste = (v) => Array.isArray(v) ? v[0] : v;
    const tekstVan = (v) => typeof v === 'string' ? v.trim() : (v && typeof v === 'object' ? String(v.name || v['@value'] || '').trim() : '');

    // Zichtbare tekst van de pagina, in leesvolgorde.
    const lijnen = (document.body?.innerText || '').split('\n')
      .map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const bodyTxt = lijnen.join('\n');

    // ── Bedrijfsnaam ──────────────────────────────────────────
    let bedrijf = tekstVan(org.name)
      || tekstVan(eerste(vac.hiringOrganization)?.name)
      || meta('og:site_name')
      || meta('application-name');
    if (!bedrijf) {
      // Titel: "Vacature operator | Acme B.V." → laatste segment is meestal de sitenaam.
      const delen = (document.title || '').split(/[|·–—]/).map((s) => s.trim()).filter(Boolean);
      if (delen.length > 1 && delen[delen.length - 1].length <= 40) bedrijf = delen[delen.length - 1];
    }
    if (!bedrijf) bedrijf = naamUitDomein(host);
    bedrijf = bedrijf.replace(/\s*[-–|]\s*(home|homepage|werken bij|vacatures?)\s*$/i, '').trim();

    // ── Plaats ────────────────────────────────────────────────
    const adr = eerste(org.address) || eerste(eerste(vac.jobLocation)?.address) || {};
    let plaats = tekstVan(adr.addressLocality);
    let postcode = tekstVan(adr.postalCode);
    let straat = tekstVan(adr.streetAddress);
    if (!plaats) {
      // Nederlandse postcode + plaatsnaam, bv. "2801 SB Gouda" of "3197 KK Rozenburg".
      const m = bodyTxt.match(/\b([1-9]\d{3})\s?([A-Z]{2})\b[\s,]+([A-Z][a-zà-ÿ'’]+(?:[ -][A-Z][a-zà-ÿ'’]+){0,2})/);
      if (m) { postcode = `${m[1]} ${m[2]}`; plaats = m[3].trim(); }
    }
    if (!plaats) {
      // Vacaturesites zetten er zelden een postcode bij, wél "Rozenburg, Zuid-Holland".
      const prov = 'Zuid-Holland|Noord-Holland|Noord-Brabant|Utrecht|Gelderland|Limburg|Zeeland|Overijssel|Flevoland|Drenthe|Friesland|Frysl[aâ]n|Groningen';
      const m = bodyTxt.match(new RegExp('\\b([A-Z][a-zà-ÿ\'’]+(?:[ -][A-Z]?[a-zà-ÿ\'’]+){0,2}),\\s*(?:' + prov + ')\\b'));
      if (m) plaats = m[1].trim();
    }
    if (!plaats) plaats = tekstVan(eerste(vac.jobLocation)?.name);

    // ── E-mail ────────────────────────────────────────────────
    // Voorkeur voor een wervings-adres op het eigen domein.
    let email = '';
    {
      const kandidaten = [];
      document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
        const e = (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
        if (e) kandidaten.push(e);
      });
      (bodyTxt.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).forEach((e) => kandidaten.push(e));
      const ruis = /(example|sentry|wixpress|godaddy|\.png|\.jpg|@2x)/i;
      const goed = kandidaten.map((e) => e.toLowerCase()).filter((e) => !ruis.test(e));
      const score = (e) => {
        let s = 0;
        if (/^(hr|recruit|recruitment|werkenbij|werken|vacature|sollicit|personeel|p&o)/.test(e)) s += 3;
        if (e.split('@')[1] && host.includes(e.split('@')[1].split('.')[0])) s += 2;
        if (/^info@|^contact@/.test(e)) s += 1;
        return s;
      };
      email = goed.sort((a, b) => score(b) - score(a))[0] || '';
    }

    // ── Telefoon ──────────────────────────────────────────────
    let telefoon = '';
    {
      const tel = document.querySelector('a[href^="tel:"]');
      if (tel) telefoon = (tel.getAttribute('href') || '').replace(/^tel:/i, '').trim();
      if (!telefoon) telefoon = tekstVan(org.telephone);
      if (!telefoon) {
        // Nederlandse nummers staan in tig schrijfwijzen (010-1234567, 06 12 34 56 78,
        // +31 (0)299 380808). Kandidaten grof pakken, dan op cijfers valideren.
        for (const k of (bodyTxt.match(/(?:\+31|0)[\d\s().-]{7,14}\d/g) || [])) {
          const cijfers = k.replace(/\D/g, '').replace(/^31/, '0');
          if (cijfers.length === 10 && /^0[1-9]/.test(cijfers)) { telefoon = k.trim(); break; }
        }
      }
    }

    // ── Contactpersoon ────────────────────────────────────────
    // Alleen als het bedrijf zélf een naam bij de werving/contact zet.
    // Liever niets dan een verkeerde naam: jij moet erop kunnen vertrouwen.
    let naam = '', contactfunctie = '';
    {
      const persoon = ldType(blok, ['Person']);
      if (persoon.name) { naam = tekstVan(persoon.name); contactfunctie = tekstVan(persoon.jobTitle); }
      if (!naam) {
        // "Neem dan contact op met Sandro Bulleri, Manager Productie, 06-…"
        // "Voor vragen bel je met Lonneke Hendrix" · "stuur je CV t.a.v. Tineke Koromilas"
        // Let op: bewust GEEN /i-vlag — dan zou [A-Z] ook kleine letters pakken en
        // haalt hij "de afdeling" als naam binnen. Dus per woord beide schrijfwijzen.
        const aanhef = /(?:[Nn]eem(?:\s+(?:dan|gerust|even|graag))*\s+contact\s+op\s+met|[Vv]ragen\??\s*(?:stel je|bel je)?\s*(?:met|aan)|[Bb]el(?:\s+(?:gerust|dan|even))*\s+(?:met\s+)?|[Ii]nformatie\s+kun\s+je\s+(?:terecht\s+)?bij|[Ss]olliciteren\??\s*(?:doe je)?\s*bij|[Mm]ail(?:en)?\s+(?:naar|met)|[Tt]\.?\s?a\.?\s?v\.?)\s+([A-Z][a-zà-ÿ'’]+(?:\s+(?:van|de|der|den|ten|te)\s*)?(?:\s[A-Z][a-zà-ÿ'’]+){1,2})/;
        const m = bodyTxt.match(aanhef);
        if (m) naam = m[1].replace(/\s+/g, ' ').trim();
        if (naam) {
          // Functie staat meestal direct áchter de naam ("Sandro Bulleri, Manager
          // Productie"); alleen als dat niets geeft kijken we ervóór.
          const i = bodyTxt.indexOf(naam);
          const reFunctie = /\b((?:hr|p&o|corporate\s+)?(?:manager|recruiter|adviseur|hoofd|directeur|teamleider|coördinator|medewerker)[a-zà-ÿ\s&-]{0,28})/i;
          const na = bodyTxt.slice(i + naam.length, i + naam.length + 90);
          const voor = bodyTxt.slice(Math.max(0, i - 90), i);
          const f = na.match(reFunctie) || voor.match(reFunctie);
          if (f) contactfunctie = f[1].replace(/\s+/g, ' ').trim();
        }
      }
    }

    // ── Vacatures op deze pagina ──────────────────────────────
    // Twee gevallen: een losse vacaturepagina (JSON-LD JobPosting of h1),
    // of een 'werken bij'-overzicht met meerdere titels.
    let functies = [], aantal = 0, salaris = '';
    {
      if (vac.title) { functies.push(tekstVan(vac.title)); aantal = 1; }
      if (vac.baseSalary) {
        const sal = eerste(vac.baseSalary) || {};
        const w = sal.value || {};
        const bedrag = w.value || w.minValue || '';
        const per = { HOUR: 'per uur', DAY: 'per dag', WEEK: 'per week', MONTH: 'per maand', YEAR: 'per jaar' }[String(w.unitText || '').toUpperCase()] || '';
        const munt = sal.currency === 'EUR' ? '€ ' : '';
        if (bedrag) salaris = `${munt}${bedrag}${per ? ' ' + per : ''}`.trim();
      }
      // Titels uit koppen en links die op een blue-collar functie lijken.
      // Eén normalisatie voor álle titels, ook die uit JSON-LD — anders telt
      // dezelfde vacature twee keer mee (uit het schema én uit de kop).
      const sleutelVan = (t) => t.toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ')
        .replace(/\bvacatures?\b/g, ' ').replace(/[^a-zà-ÿ ]/g, ' ').replace(/\s+/g, ' ').trim();
      const gezien = new Set(functies.map(sleutelVan));
      const kandidaten = [];
      // Woorden die vóór een functietitel mogen staan; alles wat daar níet in
      // staat en met een hoofdletter begint is meestal een persoonsnaam.
      const GEEN_NAAM = /^(vacature|nieuwe?|allround|senior|junior|ervaren|leerling|assistent|hoofd|eerste|tweede|derde|zelfstandig|technisch|aankomend|gevraagd|gezocht)$/i;
      // "Bennie Rutgers Operator Dagdienst" is een medewerker-quote, geen vacature.
      const persoonsnaamErvoor = (titel, woord) => {
        const i = titel.toLowerCase().indexOf(woord);
        if (i <= 0) return false;
        const ervoor = titel.slice(0, i).trim().split(/\s+/).filter(Boolean);
        if (ervoor.length < 2) return false;
        return ervoor.slice(-2).every((w) => /^[A-Z][a-zà-ÿ'’-]+$/.test(w) && !GEEN_NAAM.test(w));
      };
      document.querySelectorAll('h1, h2, h3, h4, a').forEach((el) => {
        const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 70) return;
        // Een vacaturetitel is kort en is geen zin. "Wat verwachten wij van jou
        // als productiemedewerker?" is een tussenkop, geen vacature.
        if (/\?/.test(t) || t.split(/\s+/).length > 7) return;
        if (/^(wat|hoe|waarom|wie|wanneer|waar|jij|jouw|onze|ons|dit|deze|waarin)\b/i.test(t)) return;
        const laag = t.toLowerCase();
        // Op hele woorden matchen: zonder \b zit "lasser" in "gLASSERvice"
        // en "monteur" in "gemonteerd" — dan tel je onzin mee.
        const woord = FUNCTIEWOORDEN.find((w) =>
          new RegExp('(^|[^a-zà-ÿ])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|en)?([^a-zà-ÿ]|$)', 'i').test(laag));
        if (!woord) return;
        if (persoonsnaamErvoor(t, woord)) return;
        // Filter algemene navigatie ("Alle vacatures", "Werken bij ons").
        if (/^(alle|bekijk|meer|onze|werken bij)\b/i.test(t) && !/vacature\b/i.test(t)) return;
        // "Vacature: Productiemedewerker" en "Productiemedewerker" zijn dezelfde baan.
        const sleutel = sleutelVan(t);
        if (!sleutel || gezien.has(sleutel)) return;
        gezien.add(sleutel);
        kandidaten.push(t.replace(/^vacature\s*:?\s*/i, '').replace(/\s*[-–|]\s*(vacature|solliciteer.*)$/i, '').trim());
      });
      functies = functies.concat(kandidaten).slice(0, 6);
      aantal = Math.max(aantal, kandidaten.length);
    }

    // KvK helpt later bij het koppelen aan een debiteur in de administratie.
    const kvk = (bodyTxt.match(/\bKvK[-\s]?(?:nummer|nr\.?)?[:\s]*([0-9]{8})\b/i) || [])[1] || '';

    const notitie = [
      `Van website ${host}`,
      straat && plaats ? `Adres: ${straat}, ${postcode ? postcode + ' ' : ''}${plaats}` : '',
      aantal ? `${aantal} passende vacature${aantal === 1 ? '' : 's'} op deze pagina` : '',
      kvk ? `KvK: ${kvk}` : ''
    ].filter(Boolean).join(' · ');

    return {
      naam, contactfunctie, bedrijf, plaats, email, telefoon, url, salaris,
      functie: functies.join(', '), vacatures: aantal || 1,
      notitie, bron: 'website',
      type: 'sales'                       // een website is vrijwel altijd een prospect
    };
  }

  // Kiest de juiste lezer voor deze pagina.
  const uitlezen = () => opLinkedIn ? linkedinUitlezen() : websiteUitlezen();

  // ─── Zoek-/lijstpagina: alle personen uitlezen ──────────────
  const zoekPagina = opLinkedIn &&
    /\/sales\/search\/people|\/sales\/lists\/people|\/sales\/search\/|\/search\/results\/people|\/search\//.test(location.href);

  function lijstUitlezen() {
    const uit = [], gezien = new Set();
    const plaatsAchtig = (t) => /,/.test(t) || /\bomgeving\b|nederland|belgi[eë]|duitsland/i.test(t);

    // Sales Navigator: stabiele data-anonymize velden per rij.
    const namen = document.querySelectorAll('[data-anonymize="person-name"]');
    if (namen.length) {
      namen.forEach((nEl) => {
        const naam = (nEl.innerText || nEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (!naam) return;
        let rij = nEl;
        for (let i = 0; i < 8 && rij.parentElement; i++) { rij = rij.parentElement; if (rij.querySelector('[data-anonymize="company-name"]')) break; }
        const q = (s) => { const e = rij.querySelector(s); return e ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
        const bedrijf = q('[data-anonymize="company-name"]');
        const functie = q('[data-anonymize="title"]') || q('[data-anonymize="headline"]') || q('[data-anonymize="job-title"]');
        const plaats  = q('[data-anonymize="location"]');
        const a = rij.querySelector('a[href*="/sales/lead/"], a[href*="/sales/people/"], a[href*="/in/"]');
        const url = a ? a.href.split('?')[0] : '';
        const sleutel = (naam + '|' + bedrijf).toLowerCase();
        if (gezien.has(sleutel)) return; gezien.add(sleutel);
        uit.push({ naam, bedrijf, functie, plaats, url });
      });
      return uit;
    }

    // Gewoon LinkedIn zoekresultaat (best-effort): per kaart de regels lezen.
    const kaarten = document.querySelectorAll('li.reusable-search__result-container, div.entity-result, main ul[role="list"] > li, li.artdeco-list__item');
    kaarten.forEach((k) => {
      const link = k.querySelector('a[href*="/in/"]');
      if (!link) return;
      const url = link.href.split('?')[0];
      const regels = (k.innerText || '').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const naam = ((link.innerText || '').split('\n')[0] || regels[0] || '').replace(/\s*(bekijk|view).*/i, '').trim();
      if (!naam) return;
      let functie = '', plaats = '';
      const idx = regels.findIndex(r => r.startsWith(naam));
      for (let j = idx + 1; j < Math.min(idx + 6, regels.length); j++) {
        const r = regels[j];
        if (/connect|volg|bericht|·\s*\d+e\b|gemeenschappelijke/i.test(r)) continue;
        if (!functie && !plaatsAchtig(r) && r.length <= 100) { functie = r; continue; }
        if (!plaats && plaatsAchtig(r)) { plaats = r; }
      }
      const bedrijf = (functie.split(/\s+(?:bij|at|@|-|·|\|)\s+/i)[1] || '').trim();
      const sleutel = (naam + '|' + bedrijf).toLowerCase();
      if (gezien.has(sleutel)) return; gezien.add(sleutel);
      uit.push({ naam, bedrijf, functie, plaats, url });
    });
    return uit;
  }

  // ─── Connectie-bericht (persoonlijk, jij verstuurt zelf) ────
  // Sjabloon van Tjeerd, 12 aug 2026. Let op de lengte: LinkedIn kapt een
  // connectie-notitie af op 300 tekens en dit sjabloon komt op 291 + de lengte
  // van de voornaam. Voornamen tot en met 9 letters passen; bij 10 of meer gaat
  // hij eroverheen en kleurt de teller in het paneel rood.
  const STD_SJABLOON = 'Hi {voornaam}, ik merk altijd hetzelfde: leadbureaus leveren bereik zonder de juiste mensen, uitzenders sturen cv\'s van iemand die de vloer nooit zag. Wij filmen het echte werk op de vloer en pakken de volledige recruitment op. Alles no cure no pay. Lijkt me leuk om te bellen.\nGr,\n{mij}\nPloeggenoten';
  let instel = { naam: '', sjabloon: STD_SJABLOON };
  chrome.storage.local.get('pg_instel').then(o => { if (o && o.pg_instel) instel = { ...instel, ...o.pg_instel }; }).catch(() => {});

  function maakBericht(d) {
    const voornaam = ((d.naam || '').trim().split(' ')[0]) || 'daar';
    let t = (instel.sjabloon || STD_SJABLOON)
      .split('{voornaam}').join(voornaam)
      .split('{functie}').join(d.functie || 'jouw functie')
      .split('{bedrijf}').join(d.bedrijf || 'jullie bedrijf')
      .split('{mij}').join(instel.naam || '');
    return t.replace(/\s*Groet,\s*$/i, '').replace(/\s{2,}/g, ' ').trim();
  }

  // Vult LinkedIns "Notitie toevoegen"-tekstvak (React-proof). Verstuurt NIET.
  function vulLinkedInNote(txt) {
    const ta = document.querySelector('textarea[name="message"], #custom-message, textarea#connect-cta-form__invitation, .connect-button-send-invite__custom-message textarea, [role="dialog"] textarea');
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    ta.focus(); setter.call(ta, txt);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ─── UI (shadow DOM) ────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'pg-lead-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;';
  document.documentElement.appendChild(host);
  const sr = host.attachShadow({ mode: 'open' });

  sr.innerHTML = `
    <style>
      :host{ all:initial; }
      *{ box-sizing:border-box; font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
      .knop{ background:#1a6b3c; color:#fff; border:none; border-radius:999px;
        padding:12px 16px; font-size:14px; font-weight:600; cursor:pointer;
        box-shadow:0 4px 14px rgba(0,0,0,.25); display:flex; align-items:center; gap:8px; }
      .knop:hover{ background:#155a32; }
      .paneel{ width:330px; max-height:82vh; overflow:auto; background:#fff; border-radius:14px;
        padding:16px; box-shadow:0 10px 40px rgba(0,0,0,.3); color:#1b1b1b; display:none; }
      .paneel.open{ display:block; }
      h3{ margin:0 0 10px; font-size:15px; }
      .tabs{ display:flex; gap:6px; margin-bottom:12px; }
      .tab{ flex:1; padding:8px; border:1px solid #d5d5d5; background:#f4f4f4;
        border-radius:8px; font-size:13px; cursor:pointer; text-align:center; }
      .tab.aan{ background:#1a6b3c; color:#fff; border-color:#1a6b3c; }
      label{ display:block; font-size:12px; color:#555; margin:8px 0 3px; }
      input,textarea{ width:100%; padding:8px; border:1px solid #ccc; border-radius:8px; font-size:13px; }
      textarea{ resize:vertical; min-height:44px; }
      .rij{ display:flex; gap:16px; align-items:center; margin-top:14px; }
      .opslaan{ flex:1; background:#1a6b3c; color:#fff; border:none; border-radius:9px;
        padding:10px; font-size:14px; font-weight:600; cursor:pointer; }
      .opslaan:disabled{ opacity:.6; cursor:default; }
      .dicht{ background:none; border:none; color:#777; cursor:pointer; font-size:13px; }
      .hint{ font-size:11px; color:#8a6d00; background:#fff8e1; border-radius:6px; padding:6px 8px; margin-top:8px; display:none; }
      .hint.toon{ display:block; }
      .dubbel{ font-size:12px; border-radius:8px; padding:8px 10px; margin-bottom:10px; display:none; }
      .dubbel.toon{ display:block; }
      .dubbel.raak{ background:#fdecea; border:1px solid #f5c6c0; color:#8c2f22; }
      .dubbel.vrij{ background:#eef7f0; border:1px solid #cfe0d3; color:#1a6b3c; }
      .dubbel b{ display:block; margin-bottom:3px; }
      .dubbel ul{ margin:0; padding-left:16px; }
      .mini{ font-size:11px; color:#666; margin-top:6px; }
      .acties{ display:flex; gap:8px; margin-top:8px; }
      .btn2{ flex:1; background:#eef3ee; border:1px solid #cfe0d3; border-radius:8px; padding:8px; font-size:12px; cursor:pointer; }
      .btn2:hover{ background:#e2ece4; }
      .telcount{ float:right; font-size:11px; color:#999; font-weight:400; }
      .verborgen{ display:none; }
      .blok{ border-top:1px solid #eee; margin-top:14px; padding-top:10px; }
      .melding{ font-size:12px; margin-top:10px; min-height:16px; }
      .melding.ok{ color:#1a6b3c; } .melding.err{ color:#c0392b; }
      .top{ display:flex; justify-content:space-between; align-items:center; }
    </style>
    <button class="knop" id="open">${zoekPagina ? '📋 Lijst → CRM' : (opLinkedIn ? '➕ Naar CRM' : '➕ Bedrijf → CRM')}</button>
    <div class="paneel" id="paneel">
      <div class="top"><h3 id="ptitel">Toevoegen aan CRM</h3><button class="dicht" id="dicht">✕</button></div>

      <div id="enkel">
        <div class="tabs">
          <div class="tab" data-type="kandidaat">Kandidaat-lead</div>
          <div class="tab" data-type="sales">Sales-lead</div>
        </div>
        <div class="dubbel" id="dubbel"></div>
        <label id="l_naam">Naam</label><input id="f_naam" />
        <label>Bedrijf</label><input id="f_bedrijf" />
        <label id="l_functie">Functie</label><input id="f_functie" />
        <div id="vacrij" class="verborgen"><label>Aantal vacatures</label><input id="f_vac" type="number" min="1" /></div>
        <label>Locatie</label><input id="f_plaats" />
        <label>E-mail</label><input id="f_email" />
        <label>Telefoon</label><input id="f_tel" />
        <div class="hint" id="hint"></div>
        <label>Notitie (optioneel)</label><textarea id="f_notitie"></textarea>
        <div class="rij"><button class="opslaan" id="opslaan">Opslaan in CRM</button></div>
        <div class="melding" id="melding"></div>

        <div class="blok" id="connblok">
          <label>Connectie-bericht <span class="telcount" id="conncount"></span></label>
          <textarea id="f_conn"></textarea>
          <div class="acties">
            <button class="btn2" id="conn_kopieer">Kopieer</button>
            <button class="btn2" id="conn_vul">Vul in LinkedIn</button>
          </div>
          <div class="mini">Klik daarna zelf op <b>Verbinden → Verzenden</b>. (Handmatig versturen — geen automatisering, geen ban-risico.)</div>
          <div class="melding" id="connmeld"></div>
        </div>
      </div>

      <div id="batch" class="verborgen">
        <div class="mini" id="batch_info">Personen zoeken…</div>
        <div class="rij"><button class="opslaan" id="batch_toevoegen">Alle als sales-leads toevoegen</button></div>
        <div class="mini">Bedrijven komen in de Leadradar, de contactpersoon in de notitie. Filter in Sales Navigator eerst op titel (HR-manager, productiemanager, plantmanager…) zodat je alleen de juiste beslissers pakt.</div>
        <div class="melding" id="batchmeld"></div>
      </div>
    </div>`;

  const $ = (id) => sr.getElementById(id);
  let data = uitlezen();
  let type = data.type;

  function toonType() {
    sr.querySelectorAll('.tab').forEach(t => t.classList.toggle('aan', t.dataset.type === type));
  }

  // Labels en zichtbaarheid volgen de gekozen soort lead én de modus.
  function pasAan() {
    const sales = type === 'sales';
    $('l_naam').textContent = sales ? 'Contactpersoon (optioneel)' : 'Naam';
    $('l_functie').textContent = sales ? 'Functie(s) waarop ze werven' : 'Functie';
    $('vacrij').classList.toggle('verborgen', !sales);

    const hint = $('hint');
    hint.textContent = opLinkedIn
      ? 'Geen e-mail/telefoon gevonden. Open op het profiel eerst "Contactgegevens" en klik dan opnieuw.'
      : 'Geen e-mail/telefoon gevonden. Probeer de contact- of "werken bij"-pagina en lees die opnieuw uit.';
    // Op een website mist contact vaker en is het altijd nuttig om te melden;
    // op LinkedIn alleen bij een kandidaat, want daar hoort het bij het profiel.
    hint.classList.toggle('toon', !data.email && !data.telefoon && (opLinkedIn ? type === 'kandidaat' : true));

    // Connectie-bericht alleen als er een persoon in beeld is.
    const persoon = !!data.naam && (opLinkedIn ? !/\/company\//.test(location.href) : true);
    $('connblok').classList.toggle('verborgen', !persoon);
    $('conn_vul').classList.toggle('verborgen', !opLinkedIn);   // "Vul in LinkedIn" kan alleen op LinkedIn
    if (persoon) {
      $('f_conn').value = maakBericht({ ...data, functie: data.contactfunctie || data.functie });
      telConn();
    }
  }

  // ─── Dubbelcheck ──────────────────────────────────────────
  // Kijkt vóór het opslaan of dit bedrijf of deze persoon al ergens in het
  // CRM staat. Blokkeert niets — jij ziet het en beslist zelf.
  let checkTeller = 0;
  async function checkDubbel() {
    const el = $('dubbel');
    const veld = {
      bedrijf: $('f_bedrijf').value.trim(), naam: $('f_naam').value.trim(),
      email: $('f_email').value.trim(), telefoon: $('f_tel').value.trim()
    };
    if (!veld.bedrijf && !veld.naam && !veld.email) { el.className = 'dubbel'; return; }
    const mijn = ++checkTeller;
    el.className = 'dubbel toon vrij'; el.textContent = 'Controleren op dubbelen…';
    let res;
    try { res = await chrome.runtime.sendMessage({ action: 'check', type, data: veld }); }
    catch (e) { res = null; }
    if (mijn !== checkTeller) return;                 // een nieuwere check won
    if (!res || !res.ok) {
      el.className = 'dubbel';                        // niet kunnen checken: niets beweren
      return;
    }
    if (!res.treffers.length) {
      el.className = 'dubbel toon vrij';
      el.textContent = '✓ Nog niet in het CRM gevonden.';
      return;
    }
    el.className = 'dubbel toon raak';
    el.innerHTML = '<b>Let op — dit staat er mogelijk al in:</b><ul>' +
      res.treffers.map((t) => `<li>${t.tekst.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</li>`).join('') +
      '</ul>';
  }

  function vulVelden() {
    $('f_naam').value = data.naam || ''; $('f_bedrijf').value = data.bedrijf || '';
    $('f_functie').value = data.functie || ''; $('f_plaats').value = data.plaats || '';
    $('f_email').value = data.email || ''; $('f_tel').value = data.telefoon || '';
    $('f_vac').value = data.vacatures || 1;
    if (data.notitie) $('f_notitie').value = data.notitie;   // wat de website prijsgaf
    pasAan();
    checkDubbel();
  }

  function telConn() {
    const n = $('f_conn').value.length;
    $('conncount').textContent = n + '/300' + (n > 300 ? ' — te lang!' : '');
    $('conncount').style.color = n > 300 ? '#c0392b' : '#999';
  }

  const melden = (t, s) => { const m = $('melding'); m.textContent = t; m.className = 'melding ' + (s || ''); };
  const batchMeld = (t, s) => { const m = $('batchmeld'); m.textContent = t; m.className = 'melding ' + (s || ''); };
  const connMeld = (t, s) => { const m = $('connmeld'); m.textContent = t; m.className = 'melding ' + (s || ''); };

  function openPaneel() {
    if (zoekPagina) {
      $('enkel').classList.add('verborgen'); $('batch').classList.remove('verborgen');
      $('ptitel').textContent = 'Lijst toevoegen aan CRM';
      const lijst = lijstUitlezen();
      $('batch').dataset.n = lijst.length;
      window.__pgLijst = lijst;
      $('batch_info').textContent = lijst.length
        ? `${lijst.length} personen op deze pagina gevonden.`
        : 'Geen personen herkend. Gebruik een Sales Navigator-zoekpagina of scroll de lijst even in beeld.';
      batchMeld('');
    } else {
      data = uitlezen(); type = data.type; toonType(); vulVelden();
      melden(''); connMeld('');
      $('batch').classList.add('verborgen'); $('enkel').classList.remove('verborgen');
    }
    $('paneel').classList.add('open'); $('open').style.display = 'none';
  }
  $('open').addEventListener('click', openPaneel);
  // Nog eens op het extensie-icoon klikken opent hetzelfde paneel opnieuw.
  window.__pgOpen = openPaneel;
  $('dicht').addEventListener('click', () => {
    $('paneel').classList.remove('open'); $('open').style.display = 'flex';
  });
  sr.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => { type = t.dataset.type; toonType(); pasAan(); checkDubbel(); }));

  // Corrigeer je de naam, dan hoort de dubbelcheck daarin mee te gaan.
  let checkTimer = null;
  ['f_bedrijf', 'f_naam', 'f_email', 'f_tel'].forEach((id) =>
    $(id).addEventListener('input', () => {
      clearTimeout(checkTimer);
      checkTimer = setTimeout(checkDubbel, 500);
    }));

  $('f_conn').addEventListener('input', telConn);
  $('conn_kopieer').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('f_conn').value); connMeld('Gekopieerd ✓', 'ok'); }
    catch (e) { connMeld('Kopiëren mislukt — selecteer en kopieer handmatig.', 'err'); }
  });
  $('conn_vul').addEventListener('click', () => {
    const ok = vulLinkedInNote($('f_conn').value);
    connMeld(ok ? 'Ingevuld ✓ — controleer en klik zelf op Verzenden.'
                : 'Open eerst op het profiel "Verbinden → Notitie toevoegen", en klik dan opnieuw.', ok ? 'ok' : 'err');
  });

  $('opslaan').addEventListener('click', async () => {
    const payload = {
      naam: $('f_naam').value.trim(), bedrijf: $('f_bedrijf').value.trim(),
      functie: $('f_functie').value.trim(), plaats: $('f_plaats').value.trim(),
      email: $('f_email').value.trim(), telefoon: $('f_tel').value.trim(),
      notitie: $('f_notitie').value.trim(), url: data.url,
      vacatures: $('f_vac').value, contactfunctie: data.contactfunctie || '',
      salaris: data.salaris || '', bron: data.bron || ''
    };
    if (type === 'kandidaat' && !payload.naam) { melden('Vul een naam in.', 'err'); return; }
    if (type === 'sales' && !payload.bedrijf) { melden('Vul een bedrijfsnaam in.', 'err'); return; }
    $('opslaan').disabled = true; melden('Opslaan…');
    let res;
    try { res = await chrome.runtime.sendMessage({ action: 'save', type, data: payload }); }
    catch (e) { res = { ok: false, error: 'Extensie herladen nodig (' + e.message + ')' }; }
    $('opslaan').disabled = false;
    if (res && res.ok) {
      melden(type === 'kandidaat' ? '✓ Kandidaat-lead staat in het CRM (Inkomende sollicitanten).' : '✓ Sales-lead staat in de Leadradar.', 'ok');
      $('f_notitie').value = '';
    } else if (res && res.reason === 'auth') {
      melden('Nog niet ingelogd — klik op het extensie-icoon rechtsboven en log in.', 'err');
    } else if (res && res.reason === 'bestaat') {
      melden('Dit bedrijf staat al in de Leadradar.', 'err');
    } else {
      melden('Mislukt: ' + (res?.error || 'onbekende fout'), 'err');
    }
  });

  $('batch_toevoegen').addEventListener('click', async () => {
    const items = window.__pgLijst || [];
    if (!items.length) { batchMeld('Niets om toe te voegen.', 'err'); return; }
    $('batch_toevoegen').disabled = true; batchMeld(`Bezig… (${items.length})`);
    let res;
    try { res = await chrome.runtime.sendMessage({ action: 'saveBatch', items }); }
    catch (e) { res = { ok: false, error: 'Extensie herladen nodig (' + e.message + ')' }; }
    $('batch_toevoegen').disabled = false;
    if (res && res.ok) batchMeld(`✓ ${res.toe} toegevoegd${res.bestond ? `, ${res.bestond} stonden er al` : ''}${res.mislukt ? `, ${res.mislukt} mislukt` : ''}.`, 'ok');
    else if (res && res.reason === 'auth') batchMeld('Nog niet ingelogd — klik op het extensie-icoon en log in.', 'err');
    else batchMeld('Mislukt: ' + (res?.error || 'onbekende fout'), 'err');
  });

  // Op een gewone website injecteer jij dit script zelf via het extensie-icoon.
  // Dan wil je het paneel meteen zien, niet eerst nog een knop moeten zoeken.
  if (!opLinkedIn) openPaneel();
})();
