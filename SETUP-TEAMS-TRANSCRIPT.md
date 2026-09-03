# Teams-transcript voor de intake activeren (eenmalig)

Twee losse admin-stappen, allebei door een Microsoft 365-beheerder (dus door
Tjeerd) — geen van beide zit in de CRM-code, dus Claude kan ze niet zelf
uitvoeren.

## Deel 1 — Entra admin center: nieuwe Graph-machtiging

Voegt de rechten toe waarmee het CRM straks een transcript mag *ophalen*.
Zelfde app-registratie als bij de Outlook-koppeling (zie SETUP-OUTLOOK.md) —
je maakt niets nieuws aan, je voegt alleen een machtiging toe aan de
bestaande registratie "Ploeggenoten CRM".

1. Ga naar https://entra.microsoft.com → log in met je Ploeggenoten-account.
2. Menu links: **Identiteit → App-registraties** → open **Ploeggenoten CRM**
   (dezelfde registratie als voor Outlook/Calendars).
3. Ga naar **API-machtigingen** (API permissions).
4. Klik **+ Een machtiging toevoegen** → **Microsoft Graph** →
   **Gedelegeerde machtigingen** (Delegated permissions).
5. Typ in het zoekvak: `OnlineMeetingTranscript` → vink
   **`OnlineMeetingTranscript.Read.All`** aan → **Machtigingen toevoegen**.
6. Klik op **Beheerderstoestemming verlenen voor Ploeggenoten** (Grant admin
   consent) → **Ja** om te bevestigen.
7. Controleer dat er nu een groen vinkje staat bij de nieuwe machtiging.

**Let op:** zodra dit gebouwd is in de app, moet elke AM die al eerder was
ingelogd op de Outlook-koppeling één keer opnieuw inloggen (het CRM vraagt
dan automatisch om de nieuwe machtiging). Daarna werkt het stil op de
achtergrond, zoals de rest van de Outlook-koppeling.

## Deel 2 — Teams admin center: transcriptie standaard aanzetten (aanbevolen)

Zonder deze stap werkt het ook, maar dan moet de AM tijdens élke intakecall
zelf op "Transcript starten" klikken in Teams. Met deze instelling start het
vanzelf zodra de vergadering begint.

1. Ga naar https://admin.teams.microsoft.com → log in met je
   Ploeggenoten-account (moet Teams-beheerder of globaal beheerder zijn).
2. Menu links: **Vergaderingen → Vergaderingsbeleid** (Meeting policies).
3. Open het beleid dat voor de AM's geldt — meestal **Global (Org-wide
   default)**, tenzij er al aparte beleidsgroepen bestaan.
4. Zoek het onderdeel **Opnemen en transcriberen** (Recording &
   transcription) en zet **Transcriptie** (Transcription) op **Aan**, als
   dat nog niet zo is.
5. Zoek daaronder naar de instelling die transcriptie automatisch laat
   starten bij het begin van de vergadering. Microsoft verschuift de exacte
   naam en plek van deze instelling wel eens tussen updates — gebruik het
   zoekvak bovenin het beleidsscherm en typ "transcri" als je hem niet
   meteen ziet.
6. Sla het beleid op. Het kan enkele uren duren voordat de wijziging overal
   doorwerkt.

**Kanttekening, niet uit te zetten:** ook met auto-start toont Teams altijd
een melding aan alle deelnemers — dus ook aan de kandidaat — dat de
vergadering wordt getranscribeerd. Dat is ingebouwd Teams-gedrag (geen
CRM-instelling) en met een externe kandidaat aan de lijn ook gewoon
verstandig met het oog op de AVG.

## Volgorde

Deel 1 is nodig zodra Claude de transcript-ophaalknop bouwt — zonder die
machtiging krijgt de app straks een foutmelding. Deel 2 mag op elk moment,
onafhankelijk van deel 1; zonder deel 2 werkt alles nog steeds, alleen moet
de AM dan zelf op "Transcript starten" klikken in Teams.
