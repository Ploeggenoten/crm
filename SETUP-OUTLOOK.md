# Outlook-koppeling activeren (eenmalig, ±5 minuten)

Hiermee kan elke AM vanuit het CRM de eigen Outlook-agenda zien, afspraken
inplannen (ook Teams-videocalls voor intakes) en taken in Microsoft To Do
zetten. De koppeling is per persoon: iedereen logt één keer in met het eigen
Microsoft-account en het CRM kan alleen bij de agenda van die persoon zelf.

Zonder deze activatie werkt de knop "Inplannen in Outlook" ook al — die opent
dan Outlook met de afspraak volledig vooringevuld. De activatie maakt het
directer: afspraak en taak verschijnen meteen, zonder Outlook te openen, en
het dashboard toont je agenda van vandaag.

## Stappen (door een Microsoft 365-beheerder, dus door Tjeerd)

1. Ga naar https://entra.microsoft.com → log in met je Ploeggenoten-account.
2. Menu links: **Identiteit → App-registraties** (App registrations) →
   **+ Nieuwe registratie**.
3. Vul in:
   - **Naam:** `Ploeggenoten CRM`
   - **Ondersteunde accounttypen:** *Alleen accounts in deze organisatiemap*
     (single tenant)
   - **Omleidings-URI:** kies platform **Single-page application (SPA)** en vul in:
     `https://ploeggenoten.github.io/crm/`
4. Klik **Registreren**.
5. Voeg onder **Verificatie → Single-page application** een tweede omleidings-URI
   toe voor lokaal testen: `http://localhost:8130/`
6. Ga naar **API-machtigingen** → controleer dat er *gedelegeerde* (delegated)
   machtigingen staan voor Microsoft Graph: `User.Read` staat er al; voeg toe:
   **`Calendars.ReadWrite`** en **`Tasks.ReadWrite`** (allebei "Gedelegeerd").
   Klik daarna op **Beheerderstoestemming verlenen voor Ploeggenoten** — dan
   krijgt het team geen toestemmingspop-ups.
7. Kopieer op de **Overzicht**-pagina de **Toepassings-id (client-id)** — een
   code zoals `1a2b3c4d-….`

## Daarna

Plak die client-id in `js/outlook.js` op de regel:

```js
const MS_CLIENT_ID = '';
```

(of geef hem aan Claude, dan wordt hij ingebouwd en gepusht). Vanaf dat moment
staat er in het CRM een knop "Outlook verbinden"; elke AM klikt die één keer
aan, logt in met het eigen account, en klaar.

## Wat er bewust NIET gebeurt

- Er worden geen geheime sleutels in de app gezet — een SPA-registratie werkt
  met veilige kortlopende tokens per gebruiker (PKCE), dat is het door
  Microsoft aanbevolen model voor apps zonder eigen server.
- Niemand kan via het CRM in andermans agenda kijken; het token van een
  gebruiker staat alleen in diens eigen browser.
