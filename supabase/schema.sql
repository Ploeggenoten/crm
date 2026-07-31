-- ═══════════════════════════════════════════════════════════════
-- PLOEGGENOTEN CRM — SCHEMA
-- Draaien in Supabase → SQL Editor. Veilig opnieuw te draaien
-- (alles is "if not exists"). Raakt bestaande data niet aan.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Bestaande tabellen uitbreiden ─────────────────────────
-- Kandidaten: contactgegevens, koppeling aan vacature/lead, geparsed CV.
alter table candidates add column if not exists telefoon    text default '';
alter table candidates add column if not exists email       text default '';
alter table candidates add column if not exists woonplaats  text default '';
alter table candidates add column if not exists vacature_id text default '';
alter table candidates add column if not exists lead_id     text default '';
alter table candidates add column if not exists cv          jsonb;
-- Kwalificatie- en zoekvelden (filters, radiuszoeken, Source-kaart)
alter table candidates add column if not exists ster        int  default 0;   -- 0 = nog niet beoordeeld, 1-5
alter table candidates add column if not exists beschikbaar text default '';  -- direct | in overleg | niet
alter table candidates add column if not exists ploegen     text default '';  -- geen | 2 | 3 | 5 | wisselend
alter table candidates add column if not exists talen       text default '';  -- bv. 'NL, EN, PL'
alter table candidates add column if not exists rijbewijs   text default '';  -- bv. 'B', 'B + heftruck'
alter table candidates add column if not exists vervoer     text default '';  -- auto | ov | fiets | geen
-- Golden candidate: goede kandidaat zonder passende vacature op dit moment.
-- Geen fase maar een vlag — zo raken we ze nooit meer uit het oog.
alter table candidates add column if not exists golden      boolean default false;
-- Pasfoto van de kandidaat. Bevat het PAD in de map 'crm-docs'
-- (bv. 'kandidaten/<id>.jpg'), nooit een url — de map is afgeschermd en de
-- app tekent per keer een tijdelijke link (zie CRM.opslag in js/core.js).
-- Bewust een eigen kolom en geen veld in het cv-jsonb: een foto is een
-- persoonsgegeven met een eigen bewaartermijn, en je wilt hem los kunnen
-- verwijderen zonder de rest van het CV aan te raken.
alter table candidates add column if not exists foto        text default '';
-- Geboortedatum: voor de verjaardagstaak op het dashboard van de AM.
-- Alleen dag en maand worden getoond; het jaartal blijft in de database staan
-- omdat een datumveld nu eenmaal een jaar nodig heeft, maar nergens in beeld.
alter table candidates add column if not exists geboortedatum date;
-- Gezet zodra een kandidaat geanonimiseerd is (persoonsgegevens gewist, de
-- plaatsing blijft als naamloze regel staan). Bewust een eigen kolom en geen
-- afleiding uit de naam: een naam kun je overtypen, en dan zou een kaart
-- stilzwijgend weer opduiken in de bellijst en de nazorg van iemand die net
-- om verwijdering heeft gevraagd.
alter table candidates add column if not exists geanonimiseerd_op date;

-- Klanten: salesfase, eigenaar (AM), contactgegevens.
alter table clients add column if not exists fase        text default '';
alter table clients add column if not exists eigenaar    text default '';
alter table clients add column if not exists telefoon    text default '';
alter table clients add column if not exists email       text default '';
alter table clients add column if not exists website     text default '';
alter table clients add column if not exists branche     text default '';
alter table clients add column if not exists sinds       date;
alter table clients add column if not exists laatst_contact date;
alter table clients add column if not exists note        text default '';
alter table clients add column if not exists fase_sinds  date;
-- Vestigingsgegevens: staan in elke samenwerkingsovereenkomst op de
-- partijkaart. Zonder deze velden typt de AM ze per contract opnieuw in.
alter table clients add column if not exists adres       text default '';
alter table clients add column if not exists postcode    text default '';
alter table clients add column if not exists plaats      text default '';
alter table clients add column if not exists kvk         text default '';

-- Profielfoto per gebruiker (zichtbaar voor het team). Bevat het PAD in de
-- map 'crm-docs' (bv. 'profielen/<user-id>.jpg'), niet een url — zie blok 10.
alter table profiles add column if not exists foto_url   text default '';
-- Functie bepaalt welk dashboard iemand ziet: am | recruiter | marketeer
alter table profiles add column if not exists functie    text default '';
-- Werk-e-mailadres: nodig om een Teams-melding bij de juiste collega te krijgen.
alter table profiles add column if not exists email      text default '';
-- Telefoonnummer van de accountmanager: staat onder de felicitatiemail die
-- de kandidaat krijgt na het tekenen ("bel me gerust op ..."). Stond eerst
-- per browser in localStorage, dus op een tweede laptop was hij weer leeg.
alter table profiles add column if not exists telefoon   text default '';
-- Aanmaakdatum en fasehistorie: nodig om echte doorlooptijden en conversie
-- per cohort te kunnen tonen in plaats van een momentopname.
alter table clients add column if not exists aangemaakt  date default current_date;
alter table clients add column if not exists fase_historie jsonb default '[]'::jsonb;

-- Vacatures: eigen id, locatie, status, aantal en salarisrange.
-- LET OP: in productie bestaat vacatures.id al als uuid — alleen aanmaken
-- en vullen als de kolom nog helemaal niet bestaat.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'vacatures' and column_name = 'id') then
    alter table vacatures add column id text;
    update vacatures set id = klant || '::' || functie where id is null or id = '';
  end if;
end $$;
alter table vacatures add column if not exists locatie   text default '';
alter table vacatures add column if not exists status    text default 'Open';
alter table vacatures add column if not exists aantal    int  default 1;
alter table vacatures add column if not exists sal_min   numeric;
alter table vacatures add column if not exists sal_max   numeric;
alter table vacatures add column if not exists eigenaar  text default '';
alter table vacatures add column if not exists omschrijving text default '';
-- HOT-vacatures: waar de meeste druk op zit, met deadline en doel.
alter table vacatures add column if not exists hot          boolean default false;
alter table vacatures add column if not exists hot_prio     int;               -- 1 = bovenaan
alter table vacatures add column if not exists deadline     date;
alter table vacatures add column if not exists doel_aantal  int;               -- bv. 2 (voorstellen)
alter table vacatures add column if not exists doel_soort   text default 'voorstellen';  -- voorstellen | gesprekken | plaatsingen
alter table vacatures add column if not exists doel_gezet_op date;             -- vanaf wanneer telt de voortgang

-- ─── 2. Kandidaat-leads (fase vóór de pijplijn) ───────────────
-- Komen binnen uit Meta/Indeed/WhatsApp-agent, met kwalificatie.
create table if not exists crm_leads (
  id            text primary key,
  naam          text not null,
  telefoon      text default '',
  email         text default '',
  woonplaats    text default '',
  bron          text default '',            -- Meta / Indeed / WhatsApp / ...
  campagne      text default '',
  vacature_id   text default '',            -- waar hij op reageerde
  klant         text default '',
  functie       text default '',
  status        text default 'Nieuw',
  prioriteit    text default '',            -- Hoog / Midden / Laag (WhatsApp-agent)
  kwalificatie  text default '',            -- oordeel van de agent
  score         int,
  agent_notitie text default '',
  antwoorden    jsonb,                      -- ruwe vragen/antwoorden agent
  cv            jsonb,                      -- geparsed CV
  cv_url        text default '',
  eigenaar      text default '',            -- welke AM pakt hem op
  binnen_op     timestamptz default now(),
  laatst_actie  timestamptz,
  opvolgen_op   date,
  belpogingen   int default 0,              -- hoe vaak geprobeerd te bellen
  kandidaat_id  text default '',            -- gevuld zodra doorgeschoten
  notities      jsonb default '[]'::jsonb,
  created_at    timestamptz default now()
);
-- Voor bestaande installaties: de create hierboven doet niets meer zodra de
-- tabel bestaat, en deze kolommen zijn later toegevoegd.
alter table crm_leads add column if not exists belpogingen int default 0;
-- Adres uit een geparsed cv. Landde eerst in het cv-jsonb omdat er geen
-- kolom was; als kolom is het doorzoekbaar en bruikbaar voor reisafstand.
alter table candidates add column if not exists adres    text default '';
alter table candidates add column if not exists postcode text default '';
-- Wie bij de klant over deze vacature of kandidaat gaat. Zonder deze
-- kolommen leidt de contactpersoonkaart het af uit de klantnaam, en dat
-- staat er dan ook eerlijk bij als afleiding in plaats van als feit.
alter table vacatures  add column if not exists contact_id text default '';
alter table candidates add column if not exists contact_id text default '';
alter table crm_taken  add column if not exists contact_id text default '';

create index if not exists crm_leads_status  on crm_leads(status);
create index if not exists crm_leads_eigenaar on crm_leads(eigenaar);
create index if not exists crm_leads_binnen  on crm_leads(binnen_op desc);

-- ─── 3. Activiteiten (gedeeld door alle modules) ──────────────
create table if not exists crm_activiteiten (
  id        text primary key,
  entiteit  text not null,                  -- klant | kandidaat | lead | vacature
  ref       text not null,                  -- naam of id van die entiteit
  soort     text not null,                  -- notitie|bel|mail|whatsapp|gesprek|bezoek|taak|fase|doc|systeem
  tekst     text default '',
  door      text default '',
  op        timestamptz default now(),
  extra     jsonb
);
create index if not exists crm_act_ref on crm_activiteiten(entiteit, ref);
create index if not exists crm_act_op  on crm_activiteiten(op desc);

-- ─── 4. Taken ─────────────────────────────────────────────────
create table if not exists crm_taken (
  id        text primary key,
  tekst     text not null,
  datum     date,
  klaar     boolean default false,
  entiteit  text default '',                -- optionele koppeling
  ref       text default '',
  voor      text default '',                -- wie moet het doen
  door      text default '',                -- wie maakte hem aan
  prioriteit text default '',
  created_at timestamptz default now()
);
create index if not exists crm_taken_datum on crm_taken(datum);
create index if not exists crm_taken_voor  on crm_taken(voor);

-- ─── 4b. Meldingen (taak toegewezen, @-tag in een notitie) ────
create table if not exists crm_meldingen (
  id         text primary key,
  voor       text not null,               -- naam van de collega die het moet zien
  van        text default '',             -- wie het veroorzaakte
  soort      text default '',             -- taak | tag | systeem
  tekst      text default '',
  entiteit   text default '',             -- doorklik: klant | kandidaat | lead | taak
  ref        text default '',
  gelezen    boolean default false,
  created_at timestamptz default now()
);
create index if not exists crm_meld_voor on crm_meldingen(voor, gelezen);

-- ─── 4c. Leadradar (bedrijven die nu blue-collar werven) ──────
-- Gevuld door de Edge Function 'lead-radar' (Adzuna, dagelijks) en
-- door de wekelijkse Claude-research-routine. Sales beoordeelt.
create table if not exists crm_leadradar (
  id          text primary key,
  bedrijf     text not null,
  plaats      text default '',
  functies    text default '',            -- 'Operator, Orderpicker'
  vacatures   int  default 1,
  bron        text default '',            -- adzuna | claude-research | handmatig
  url         text default '',
  salaris_ind text default '',
  gevonden_op date default current_date,
  laatst_gezien date default current_date,
  status      text default 'nieuw',       -- nieuw | toegevoegd | genegeerd
  status_door text default '',
  notitie     text default '',
  concepten   jsonb                        -- {contactprofiel, opener, connectie, mail} uit de ochtendroutine
);
create unique index if not exists crm_leadradar_bedrijf on crm_leadradar(lower(bedrijf));
create index if not exists crm_leadradar_status on crm_leadradar(status, laatst_gezien desc);

-- ─── 4d. Logboek: wie is er verwijderd of geanonimiseerd ──────
-- Bewaart DAT er iemand weg is, nooit WIE. Geen naam, geen telefoon,
-- geen e-mail — anders bewaar je precies wat je zou wissen. Bedoeld om
-- twee vragen te kunnen beantwoorden: waarom is deze lijst korter
-- geworden, en zijn mijn gegevens echt verwijderd.
create table if not exists crm_verwijderingen (
  id         text primary key,
  soort      text not null default 'kandidaat',
  handeling  text not null default 'verwijderd',   -- verwijderd | geanonimiseerd
  ref        text not null,                        -- id van de rij, geen persoonsgegeven
  fase       text default '',
  bron       text default '',
  klant      text default '',
  rec        text default '',                      -- de collega, niet de kandidaat
  reden      text default '',
  lead_id    text default '',
  aantallen  jsonb default '{}'::jsonb,
  door       text default '',
  op         timestamptz default now(),
  status     text default 'bezig',                 -- bezig | klaar | deels | afgebroken
  mislukt    jsonb default '[]'::jsonb
);
create index if not exists crm_verw_op  on crm_verwijderingen(op desc);
create index if not exists crm_verw_ref on crm_verwijderingen(ref);

-- RLS: lezen, aanmaken en de status bijwerken mag het hele team.
-- VERWIJDEREN mag niemand — een logboek dat je kunt leegmaken bewijst niets.
-- Deze tabel staat daarom bewust NIET in de array-lus van blok 8: die geeft
-- `for all`, en daarmee ook delete.
do $$
begin
  execute 'alter table crm_verwijderingen enable row level security';
  execute 'drop policy if exists verw_lezen on crm_verwijderingen';
  execute 'create policy verw_lezen on crm_verwijderingen
           for select to authenticated using (true)';
  execute 'drop policy if exists verw_aanmaken on crm_verwijderingen';
  execute 'create policy verw_aanmaken on crm_verwijderingen
           for insert to authenticated with check (true)';
  execute 'drop policy if exists verw_bijwerken on crm_verwijderingen';
  execute 'create policy verw_bijwerken on crm_verwijderingen
           for update to authenticated using (true) with check (true)';
end $$;

-- ─── 5. Documenten (bestanden bij klant/kandidaat) ────────────
-- `url` bevat GEEN publieke url meer (zie blok 10). Twee soorten waarden:
--   pad in onze eigen map   'klant/Acme_BV/1699_swo.pdf'
--   externe link            'https://…sharepoint.com/…'  (handmatig gekoppeld)
-- Een ondertekende link wordt pas bij het openen gemaakt, in de app.
create table if not exists crm_documenten (
  id        text primary key,
  entiteit  text not null,
  ref       text not null,
  naam      text not null,
  soort     text default '',                -- SWO | offerte | CV | ID | overig
  url       text not null,
  grootte   int,
  door      text default '',
  op        timestamptz default now()
);
create index if not exists crm_doc_ref on crm_documenten(entiteit, ref);

-- ─── 6. Kansen (sales-opportunities per klant) ────────────────
create table if not exists crm_kansen (
  id          text primary key,
  klant       text not null,
  titel       text not null,
  omschrijving text default '',
  functie     text default '',
  aantal      int default 1,
  waarde      numeric,                      -- geschatte fee-waarde
  kans_pct    int default 50,
  fase        text default 'Nieuw',
  bron        text default '',              -- LinkedIn | Netwerk | Inbound | ...
  linkedin_url text default '',
  contactpersoon text default '',
  eigenaar    text default '',
  sluit_datum date,
  status      text default 'open',          -- open | gewonnen | verloren
  reden       text default '',
  created_at  timestamptz default now()
);
create index if not exists crm_kansen_klant on crm_kansen(klant);

-- ─── 7. Contactpersonen bij klanten ───────────────────────────
create table if not exists crm_contacten (
  id        text primary key,
  klant     text not null,
  naam      text not null,
  functie   text default '',
  telefoon  text default '',
  email     text default '',
  linkedin  text default '',
  hoofd     boolean default false,
  note      text default '',
  -- Zelfde reden als bij kandidaten: verjaardagstaak op het AM-dashboard.
  geboortedatum date,
  created_at timestamptz default now()
);
-- Voor bestaande installaties, want de create hierboven doet niets meer zodra
-- de tabel al bestaat.
alter table crm_contacten add column if not exists geboortedatum date;
create index if not exists crm_contacten_klant on crm_contacten(klant);

-- ─── 7b. Opgemaakte stukken (SWO, plan van aanpak, kandidaatprofiel) ──
-- Alleen de INGEVULDE VELDEN worden bewaard, niet de opmaak — die zit in de
-- app. Zo blijft een stuk altijd opnieuw te openen en aan te passen, en gaat
-- een huisstijlwijziging vanzelf mee in alle oude stukken.
create table if not exists crm_stukken (
  id          text primary key,
  soort       text not null,                   -- swo | pva | profiel
  klant       text default '',
  kandidaat_id text default '',
  titel       text default '',
  velden      jsonb default '{}'::jsonb,       -- alle ingevulde waarden
  versie      int  default 1,
  status      text default 'concept',          -- concept | verstuurd | getekend
  door        text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists crm_stukken_klant on crm_stukken(klant);
create index if not exists crm_stukken_soort on crm_stukken(soort, updated_at desc);

-- ─── 7c. Commerciële afspraken per klant (de basis onder facturatie) ──
-- Wat er in de samenwerkingsovereenkomst is afgesproken, maar dan als
-- gegevens in plaats van als lopende tekst in een Word-bestand. Hiermee kan
-- het systeem de fee zelf uitrekenen zodra een contract getekend wordt, in
-- plaats van dat iemand het document erbij pakt en met de hand rekent.
--
-- De grondslag volgt de overeenkomst: 12x bruto maandsalaris, vakantiegeld,
-- een VASTE dertiende maand of eindejaarsuitkering, en VASTE ploegen- of
-- functietoeslagen. Variabele bonussen, overwerk en onkosten tellen niet mee.
create table if not exists crm_afspraken (
  id             text primary key,
  klant          text not null,
  soort          text default 'ws',              -- ws | detachering | uitzenden
  fee_regels     jsonb default '[]'::jsonb,      -- [{functiegroep, pct}]
  fee_standaard  numeric,                        -- % als geen functiegroep matcht
  grondslag      jsonb default '{}'::jsonb,      -- {maanden, vt_pct, eju, toeslag, overig}
  betaaltermijn  int  default 30,                -- dagen na factuurdatum
  factuurmoment  text default 'contract',        -- contract | start
  garantie_mnd   int  default 2,                 -- proeftijd vervangingsregeling
  garantie_soort text default 'vervanging',      -- vervanging | restitutie | geen
  exclusiviteit_wkn int,
  ingang         date,
  einde          date,
  stuk_id        text default '',                -- de SWO in crm_stukken
  actief         boolean default true,
  notitie        text default '',
  door           text default '',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists crm_afspraken_klant on crm_afspraken(klant, actief);

-- ─── 7d. Wat er werkelijk aan Meta betaald is ─────────────────
-- Meta rapporteert zijn eigen uitgaven. Wat er daadwerkelijk van de rekening
-- is gegaan staat in fin_bank_tx — maar die tabel is afgeschermd op Tjeerds
-- e-mailadres, en dat moet zo blijven: daar staat élke banktransactie in.
--
-- Daarom deze tussenlaag. Tjeerd laat het CRM de banktransacties op Meta en
-- Facebook doorzoeken; alleen het MAANDTOTAAL komt hier terecht. Het team ziet
-- dus wel of Meta's cijfers kloppen met wat er betaald is, en niet waar de
-- rest van het geld heen ging. Besluit Tjeerd, 31 juli 2026.
create table if not exists mkt_meta_betaald (
  maand      date primary key,              -- altijd de 1e van de maand
  bedrag     numeric not null default 0,
  bron       text default 'bank',           -- bank | yuki | handmatig
  regels     int  default 0,                -- hoeveel transacties erachter zitten
  bijgewerkt timestamptz default now(),
  door       text default ''
);

-- Lezen: het hele team. Schrijven: alleen Tjeerd, want het getal komt uit
-- zijn bankgegevens en mag niet door een ander overschreven worden.
do $$
begin
  execute 'alter table mkt_meta_betaald enable row level security';
  execute 'drop policy if exists meta_betaald_lezen on mkt_meta_betaald';
  execute 'create policy meta_betaald_lezen on mkt_meta_betaald
           for select to authenticated using (true)';
  execute 'drop policy if exists meta_betaald_schrijven on mkt_meta_betaald';
  execute 'create policy meta_betaald_schrijven on mkt_meta_betaald
           for all to authenticated
           using (auth.jwt()->>''email'' = ''tjeerd@ploeggenoten.nl'')
           with check (auth.jwt()->>''email'' = ''tjeerd@ploeggenoten.nl'')';
end $$;

-- ─── 8. RLS: team mag alles in crm_* lezen/schrijven ──────────
-- (Financiële cijfers zitten in fin_*-tabellen; die houden hun eigen,
--  striktere policies waardoor alleen Tjeerd erbij kan.)
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_activiteiten','crm_taken','crm_documenten','crm_kansen','crm_contacten','crm_meldingen','crm_leadradar','crm_stukken']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists team_all on %I', t);
    execute format('create policy team_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ─── 8b. crm_afspraken: alleen Tjeerd ─────────────────────────
-- Deze tabel bevat fee-percentages. Die horen bij het geld, niet bij de rest
-- van het CRM, dus hij valt bewust BUITEN de team-policy hierboven en krijgt
-- dezelfde harde afscherming als de fin_*-tabellen in het financebord.
-- Afschermen in de interface is niet genoeg: zonder deze policy staan de
-- percentages gewoon in het geheugen van elke browser die inlogt.
do $$
begin
  execute 'alter table crm_afspraken enable row level security';
  execute 'drop policy if exists afspraken_owner_only on crm_afspraken';
  execute 'create policy afspraken_owner_only on crm_afspraken for all to authenticated
           using (auth.jwt()->>''email'' = ''tjeerd@ploeggenoten.nl'')
           with check (auth.jwt()->>''email'' = ''tjeerd@ploeggenoten.nl'')';
end $$;

-- ─── 9. Realtime ──────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_activiteiten','crm_taken','crm_kansen','crm_meldingen','crm_stukken']
  loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ─── 10. Opslag voor documenten en CV's ───────────────────────
-- LET OP — deze map staat BEWUST op niet-publiek, en dat moet zo blijven.
-- Hierin komen CV's, kopieën van identiteitsbewijzen, contracten en
-- samenwerkingsovereenkomsten. `public = true` betekent bij Supabase niet
-- "handig voor het team", maar: iedereen die de link heeft kan het bestand
-- opvragen — zonder account, zonder inlog, zonder dat wij het zien. En zo'n
-- link is geen geheim: hij is te raden uit een naam plus datum, en hij
-- belandt in mail, in chats en in screenshots.
--
-- De app heeft die publieke link ook niet nodig. Hij bewaart het PAD van
-- een bestand en maakt op het moment van openen een tijdelijke ondertekende
-- link (createSignedUrl in js/core.js, CRM.opslag). Die verloopt vanzelf.
--
-- Zet `public` dus NIET terug op true omdat "een foto niet laadt" — dan
-- staat het complete dossier van elke kandidaat open op het internet.
insert into storage.buckets (id, name, public)
values ('crm-docs','crm-docs', false)
on conflict (id) do nothing;
-- `on conflict do nothing` laat een BESTAANDE map ongemoeid. Is de map ooit
-- als publieke map aangemaakt, dan zet alleen deze regel hem alsnog dicht.
update storage.buckets set public = false where id = 'crm-docs';

-- Lezen: alleen ingelogde teamleden. Zonder `to authenticated` geldt een
-- policy óók voor de anon-rol — dan is de map alsnog voor iedereen open,
-- hoe dicht de bucket-instelling hierboven ook staat.
drop policy if exists crm_docs_lezen on storage.objects;
create policy crm_docs_lezen on storage.objects for select to authenticated
  using (bucket_id = 'crm-docs');
drop policy if exists crm_docs_schrijven on storage.objects;
create policy crm_docs_schrijven on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-docs');
drop policy if exists crm_docs_verwijderen on storage.objects;
create policy crm_docs_verwijderen on storage.objects for delete to authenticated
  using (bucket_id = 'crm-docs');
