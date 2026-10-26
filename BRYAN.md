# Werken aan Marketing en Marketingweek — handleiding voor Bryan (en zijn Claude)

Afspraak met Tjeerd (26 okt 2026): **Bryan past zelf Marketing en Marketingweek
aan. De rest van het CRM niet**, anders wordt het een rommeltje. Geef dit bestand
aan je Claude voordat je begint.

## Jouw bestanden

| Scherm | Bestanden |
|---|---|
| Mijn week (Marketingweek) | `js/marketingweek.js`, `css/marketingweek.css` |
| Marketing (Prestatie, Rendement, Content, Kanalen, Vacatures) | `js/marketing.js`, `css/marketing.css` |

In `index.html` mag je alleen het versienummer achter deze vier bestanden
ophogen (`?v=...`). Doe dat bij elke wijziging, anders krijgen collega's de oude
versie uit hun browsercache.

Alles daarbuiten (Finance, Recruitment, `js/core.js`, `css/base.css`, de
database-scripts) is niet van jou. Heb je daar iets nodig, zet het dan onderaan
je eigen bestand als `/* VERZOEK AAN CORE: ... */` en meld het aan Tjeerd.

## Zo zet je een wijziging live

1. Maak een nieuwe tak: `git checkout -b bryan/<korte-omschrijving>`
2. Pas alleen jouw bestanden aan en test (zie hieronder).
3. Commit en push de tak, en open op GitHub een pull request naar `main`.
4. De controle **Marketingwijzigingen / eigen-bestanden** loopt vanzelf:
   - **Groen**: alleen jouw bestanden zijn geraakt. Klik op *Merge* — binnen een
     minuut of twee staat het live op ploeggenoten.github.io/crm.
   - **Rood**: je hebt iets buiten Marketing/Marketingweek aangepast. Haal die
     wijziging eruit, of vraag Tjeerd het voorstel te beoordelen.

Rechtstreeks naar `main` pushen kan niet; dat gaat altijd via een pull request.

## Testen zonder echte data te raken

- Start lokaal een server in de map van het CRM, bijvoorbeeld
  `python3 -m http.server 8130`, en open `http://localhost:8130/?demo=1`.
- In de demo-modus is alles verzonnen en wordt er **niets** in de database
  opgeslagen. Elke schrijfactie in je code moet achter `if(!CRM.demo)` staan.
- Kijk in de browserconsole of er geen fouten zijn, en controleer ook de
  telefoonbreedte (375 px): de pagina mag niet horizontaal gaan schuiven.

## Database

Een nieuwe kolom of tabel kun je niet zelf live zetten. Schrijf het SQL-script
(idempotent: `add column if not exists`, `create table if not exists`) in
`supabase/` en vraag Tjeerd het te draaien. Laat je code netjes werken zolang
het script nog niet gedraaid is (melding tonen, niet crashen).

## Stijl

Lees `BOUWAFSPRAKEN.md`: kleuren en componenten komen uit `css/base.css`,
lijsten blijven rustig. In Mijn week gebruik je je eigen kleuren per taakgebied
(`GEBIEDEN` bovenaan `js/marketingweek.js`) en zet je persoonlijke instellingen
in het `PLANNER`-object.

## Nooit

- Geen wachtwoorden, sleutels of tokens in de code: de repository is openbaar.
- Geen bestanden met persoonsgegevens (cv's, exports, lijsten met kandidaten) in
  de map zetten — alles in deze map kan per ongeluk mee gecommit worden.
