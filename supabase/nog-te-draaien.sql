-- ═══════════════════════════════════════════════════════════════
-- NOG TE DRAAIEN — verzamelbak
--
-- OP DIT MOMENT: LEEG. Alles is gedraaid en gecontroleerd op 7 aug 2026.
-- schema.sql is weer de volledige waarheid over hoe de database eruit hoort
-- te zien; draai dát bestand op een verse database.
--
-- ─── Waar dit bestand voor is ─────────────────────────────────
-- Tjeerd wil niet elke keer opnieuw een migratie draaien (31 jul 2026).
-- Alles wat de database nodig heeft komt daarom hier terecht en gaat in één
-- keer mee. Nieuwe wijzigingen dus HIERONDER aanplakken, met een datum en de
-- reden erbij, en altijd zo dat het veilig opnieuw te draaien is
-- ("if not exists", of alleen werkend op rijen die nog niet omgezet zijn).
--
-- Wat hier gedraaid is, hoort daarna in schema.sql te staan en hier weg.
-- Laat je het staan, dan weet niemand meer wat er nog écht moet.
--
-- ─── Waarom dit niet vrijblijvend is ──────────────────────────
-- PostgREST weigert een HELE insert of update zodra er één kolom in staat
-- die het niet kent ("Could not find the 'uren' column of 'candidates' in
-- the schema cache"). Eén niet-gedraaide migratie legt dus niet dat ene veld
-- plat, maar alles wat die tabel wegschrijft — op 7 aug 2026 kon daardoor
-- geen cv meer ingelezen worden, terwijl het over een salarisveld ging.
-- js/core.js vangt dat sinds die dag op (CRM.candKolWeg laat onbekende
-- kolommen weg in plaats van de opslag te laten sneuvelen), maar dan wordt
-- dat veld dus stilletjes niet bewaard. De echte oplossing blijft: draaien.
--
-- ─── Controleren wat er nog open staat ────────────────────────
-- Kolommen en tabellen: die controleert de app zelf — ontbreekt er iets, dan
-- staat het als waarschuwing in de console bij het laden.
-- Gegevens en rechten zijn niet van buitenaf te zien; daarvoor is er
-- supabase/controle.sql. Alles op 0 = niets meer te doen.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- BLOK 11 — O&O-sessies horen bij een vacature (7 aug 2026)
--
-- Een O&O-sessie was een losse rij met klant + functie als vrije tekst.
-- Maar een sessie wordt gehouden ÓP een vacature (naam: Tjeerd): klant,
-- functie en locatie horen daaruit te komen in plaats van los ingetypt te
-- worden. Meestal gaat een sessie over één vacature; zit er iemand voor een
-- andere functie bij, dan vink je die vacature er expliciet bij.
--
-- `tijd` erbij omdat een sessie een moment op de dag is, net als elke andere
-- afspraak — zonder tijd kan hij niet in de Afsprakenweergave meelopen.
--
-- klant en functie blijven bestaan: sessies van vóór deze wijziging hebben
-- geen vacature en moeten gewoon blijven werken.
--
-- De tabel zelf stond nergens in schema.sql; hij bestaat wel in productie.
-- Onderstaande create is er zodat een verse database hem ook krijgt.
-- Veilig om meerdere keren te draaien.
-- ═══════════════════════════════════════════════════════════════
create table if not exists oo_sessions (
  id       text primary key,
  klant    text default '',
  functie  text default '',
  datum    date,
  locatie  text default ''
);
alter table oo_sessions add column if not exists vacature_id     text default '';
alter table oo_sessions add column if not exists extra_vacatures jsonb default '[]'::jsonb;
alter table oo_sessions add column if not exists tijd            text default '';

-- ═══════════════════════════════════════════════════════════════
-- BLOK 12 — CAO per klant (11 aug 2026)
--
-- Bepaalt via js/kostprijs.js welke kostprijsfactor bij een klant hoort
-- (Pronkert-rekentool nagebouwd) en dus welke verkoopfactor het systeem
-- voorstelt (kostprijsfactor + 0,6, vaste marge-afspraak Tjeerd). Eén
-- keer per klant invullen — het systeem doet daarna zelf een voorstel op
-- basis van de branche, de AM bevestigt of kiest een andere CAO.
--
-- js/klanten.js (bewaarCao) vangt de ontbrekende kolom al netjes op tot
-- dit gedraaid is, dus dit blok is niet dringend — maar zonder deze
-- kolom slaat de CAO nergens permanent op.
-- ═══════════════════════════════════════════════════════════════
alter table clients add column if not exists cao text default '';
