# Ploeggenoten CRM — Chrome-extensie (Lead-knop)

Voeg vanaf **LinkedIn**, **Sales Navigator** én **elke bedrijfswebsite** met één klik leads toe aan je CRM:
- **Kandidaat-lead** → komt binnen bij *Recruitment → Inkomende sollicitanten* (tabel `crm_leads`).
- **Sales-lead** → komt binnen bij *Sales → **Zelf gevonden***, waar je hem met één klik in de pijplijn zet (tabel `crm_leadradar`).

> **Waarom een eigen tab?** Alles wat jij zelf toevoegt staat bij *Zelf gevonden*,
> gescheiden van de *Leadradar* — die houdt alleen wat de ochtendroutine
> automatisch vindt. Anders moet je je eigen vondsten ertussenuit zoeken.

**Dubbelcheck.** Zodra het paneel opent kijkt de extensie of dit bedrijf of deze
persoon al in het CRM staat: in je vondsten, in de Leadradar, in de klantpijplijn
of bij de sollicitanten. Staat er iets, dan zie je bovenin een rode melding met
wát er al is (inclusief fase en eigenaar). Hij blokkeert niets — soms wil je een
tweede ingang bij dezelfde klant — maar je weet het vóórdat je belt. Pas je de
bedrijfsnaam aan, dan checkt hij opnieuw. Namen worden vergeleken zonder B.V.,
hoofdletters en leestekens, dus "Bakker Barendrecht B.V." en "bakker barendrecht"
gelden als hetzelfde bedrijf.

Alles gratis: je laadt de extensie *unpacked*, er zijn geen Web Store-kosten en geen betaalde API's.

## Installeren (eenmalig, ±2 minuten)

1. Open Chrome → adresbalk → `chrome://extensions`
2. Zet rechtsboven **Ontwikkelaarsmodus** aan.
3. Klik **Uitgepakt laden** (*Load unpacked*).
4. Kies de map **`~/ploeggenoten-crm/extensie`** (deze map).
5. De extensie verschijnt in de lijst. Klik op het puzzelstukje 🧩 rechtsboven in Chrome en zet de extensie vast (pin) zodat je het icoon altijd ziet.

## Inloggen (eenmalig)

1. Klik op het extensie-icoon → er opent een klein venster.
2. Log in met **hetzelfde e-mailadres en wachtwoord als in het CRM**.
3. Klaar. Je blijft ingelogd (de extensie ververst je sessie automatisch).

## Gebruiken

1. Ga naar een LinkedIn- of Sales Navigator-**profiel** (persoon) of **bedrijf**.
2. Klik rechtsonder op **➕ Naar CRM**.
3. De extensie leest naam/bedrijf/functie/plaats uit. Kies bovenin **Kandidaat-lead** of **Sales-lead**, controleer/vul de velden aan, en klik **Opslaan in CRM**.
4. Je ziet meteen een bevestiging. Ververs je CRM om de lead te zien staan.

> Tip: op een persoon staat de knop standaard op *Kandidaat*, op een bedrijf op *Sales*. Je kunt altijd wisselen — een contactpersoon bij een prospect sla je bijvoorbeeld op als *Sales-lead* met dat bedrijf erbij.

## Een gewone website uitlezen (elke bedrijfssite)

Sta je op de "werken bij"- of contactpagina van een bedrijf? Dan hoef je niets
over te typen.

1. Klik op het extensie-icoon 🧩 → **📄 Lees deze pagina uit**.
2. Hetzelfde paneel opent, al ingevuld. Controleer, vul aan, **Opslaan in CRM**.
3. Het bedrijf staat als sales-lead in de **Leadradar**, met bron *Website*.

Wat hij van de pagina haalt:

| Veld | Waar het vandaan komt |
|---|---|
| Bedrijfsnaam | schema.org-gegevens, anders `og:site_name` of de paginatitel, anders de domeinnaam |
| Plaats | het adres in de schema.org-gegevens, anders een Nederlandse postcode in de tekst, anders "Rozenburg, Zuid-Holland"-achtige regels |
| Functie(s) + aantal | vacaturetitels op de pagina die passen bij ons werk (operator, orderpicker, heftruck…) |
| Salaris | alleen als het bedrijf het in zijn vacaturegegevens zet |
| E-mail | `mailto:`-links en tekst; voorkeur voor een wervingsadres (`werken@`, `sollicitatie@`, `hr@`) boven `info@` |
| Telefoon | `tel:`-link, anders een Nederlands nummer uit de tekst |
| Contactpersoon | alléén als het bedrijf zelf een naam noemt ("Neem contact op met …", "t.a.v. …"), met de functie die erbij staat |

Twee dingen om te weten:

- **Leeg is bewust.** Wat niet zeker op de pagina staat, vult hij niet in — dan
  zie jij meteen dat je het zelf moet opzoeken. Liever een leeg veld dan een
  verkeerde naam onder je neus.
- **Vacatures staan zelden op de homepage.** Sta je op "werken bij" of op de
  vacature zelf, dan is de oogst het grootst. Mist e-mail of telefoon? Ga even
  naar de contactpagina en lees die opnieuw uit.

De knop verschijnt bewust *niet* vanzelf op elke website die je bezoekt — alleen
als jij erom vraagt via het icoon.

## Daglijst + connectieverzoeken (beslissers werven)

De extensie helpt je gericht connecties te leggen met beslissers (HR-manager,
productiemanager, plantmanager, operations manager) — **zonder automatisch te
versturen**, want dat is tegen LinkedIns regels en riskeert een ban. Jij klikt
altijd zelf op Verzenden.

**1. Daglijst uit Sales Navigator → CRM**
1. Filter in Sales Navigator op je sector + de juiste titels (HR-manager,
   productiemanager…). Je krijgt een lijst met resultaten.
2. Rechtsonder staat nu **📋 Lijst → CRM**. Klik erop → de extensie leest alle
   personen op de pagina en zet ze als **sales-leads** in de Leadradar
   (bedrijf → radar, contactpersoon → notitie). Dubbele bedrijven worden
   overgeslagen.
3. Ga naar de volgende resultatenpagina en herhaal, tot je je 30-50 doelen hebt.

**2. Persoonlijk connectiebericht**
1. Vul eenmalig in het extensie-venster (klik het icoon) je **naam** en het
   **connectie-sjabloon** in. Plaatshouders: `{voornaam}`, `{functie}`,
   `{bedrijf}`, `{mij}`.
2. Open een profiel → **➕ Naar CRM** → onderin staat een kant-en-klaar
   **connectie-bericht**, al ingevuld met naam/functie/bedrijf.
3. Klik **Kopieer** (of open op LinkedIn "Verbinden → Notitie toevoegen" en klik
   **Vul in LinkedIn**), controleer, en klik **zelf** op **Verzenden**.

Zo doe je gericht 30-50 persoonlijke verzoeken per dag, in je eigen tempo, veilig.

## Werkt de knop niet?

- **"Nog niet ingelogd"** → klik op het extensie-icoon en log in.
- **Knop niet zichtbaar** → herlaad de LinkedIn-pagina (de knop verschijnt na het laden).
- **Velden leeg** → LinkedIn wijzigt soms zijn opmaak; typ de gegevens gewoon zelf in het paneel en sla op. Meld het even, dan pas ik de uitlees-regels aan.
- **Na een update van de extensie** → ga naar `chrome://extensions` en klik op het ↻ (herladen) bij de extensie.

## Privacy / kosten

- De extensie praat alleen met jouw eigen Supabase (het CRM). Er gaat niets naar derden.
- De gebruikte Supabase-sleutel is de publieke anon-sleutel die ook al in de CRM-website zit; schrijven kan alleen als je bent ingelogd.
- Geen abonnement, geen API-kosten.
