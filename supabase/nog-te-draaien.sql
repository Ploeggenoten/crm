-- ═══════════════════════════════════════════════════════════════
-- NOG TE DRAAIEN — verzamelbak
--
-- Tjeerd wil niet elke keer opnieuw een migratie draaien (31 jul 2026).
-- Alles wat de database nodig heeft komt daarom hier terecht, en gaat in
-- één keer mee. Veilig opnieuw te draaien: alles staat als "if not exists"
-- of werkt alleen op rijen die nog niet omgezet zijn.
--
-- LET OP: schema.sql blijft de waarheid over hoe de database eruit hoort te
-- zien. Dit bestand is alleen de stapel wijzigingen die daarna nog kwam.
-- Wat hier gedraaid is, hoort ook in schema.sql te staan.
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. Voorselectie heet Intake ──────────────────────────────
-- De screeningsstap is geschrapt: je zet meteen de volledige kandidatenkaart
-- op en plant van daaruit de videocall. De app vertaalt de oude waarde al
-- via CRM.FASE_ALIAS, dus niets breekt zolang dit niet gedraaid is — maar in
-- de agenda en op de kaarten staat dan een fasenaam die het team niet meer
-- kent ("Voorselectie · Henri").
--
-- Draai dit één keer. Daarna kan de alias in js/data.js weg.
update candidates
   set fase = 'Intake'
 where fase = 'Voorselectie';

-- Ook in de fasehistorie, anders blijft de oude naam opduiken in
-- doorlooptijden en in de tijdlijn op de kandidatenkaart.
update candidates
   set historie = (
     select jsonb_agg(
       case when e->>'fase' = 'Voorselectie'
            then jsonb_set(e, '{fase}', '"Intake"')
            else e end)
       from jsonb_array_elements(historie) e
   )
 where historie is not null
   and jsonb_typeof(historie) = 'array'
   and historie::text like '%Voorselectie%';


-- ─── 2. Nog te bepalen: fee zichtbaar voor het team? ──────────
-- Tjeerd zei: "De fee mag iedereen zien, dat is geen probleem hoor. Alleen
-- niet al mijn bankcijfers etc."
--
-- Nu staat crm_afspraken (met de fee-percentages per klant) op databaseniveau
-- afgeschermd op zijn e-mailadres. Gevolg: een AM die een plaatsing afrondt
-- kan de fee niet berekenen, dus die staat dan bij niemand op het feestscherm
-- en ook niet op de kandidatenkaart.
--
-- Onderstaande regels verruimen dat naar iedereen die is ingelogd. De
-- fin_*-tabellen (bank, cashflow, winst) blijven ongemoeid en dicht.
--
-- NIET GEDRAAID — wacht op akkoord van Tjeerd. Haal het commentaar weg als
-- hij ja zegt.
--
-- do $$
-- begin
--   execute 'drop policy if exists afspraken_owner_only on crm_afspraken';
--   execute 'drop policy if exists afspraken_team on crm_afspraken';
--   execute 'create policy afspraken_team on crm_afspraken
--            for all to authenticated using (true) with check (true)';
-- end $$;


-- ─── 3. Vacaturevelden voor de marketeer ──────────────────────
-- Zonder deze velden krijgt Bryan een melding "zet deze vacature op de
-- website" zonder te weten wát erop moet, en moet hij alsnog achter de AM
-- aan. Dat is precies het heen-en-weer dat de melding moest voorkomen.
-- De app werkt gewoon door zolang de kolommen ontbreken: het blok wordt dan
-- verborgen en er wordt niets meegestuurd.
alter table vacatures add column if not exists werktijden     text default '';
alter table vacatures add column if not exists ploegendienst  text default '';
alter table vacatures add column if not exists contractvorm   text default '';
alter table vacatures add column if not exists eisen          text default '';
alter table vacatures add column if not exists bereikbaarheid text default '';
alter table vacatures add column if not exists over_bedrijf   text default '';
alter table vacatures add column if not exists waarom_hier    text default '';

-- De lus terug: staat de vacature online, sinds wanneer, en waar.
alter table vacatures add column if not exists web_status     text default 'Nog niet online';
alter table vacatures add column if not exists web_url        text default '';
alter table vacatures add column if not exists web_online_op  date;
alter table vacatures add column if not exists web_door       text default '';


-- ─── 4. De vier gebruikers ────────────────────────────────────
-- Tjeerd  tjeerd@ploeggenoten.nl       eigenaar, ziet alles inclusief geld
-- Tjerk   tjerk@ploeggenoten.nl        accountmanager
-- Rajesh  recruitment@ploeggenoten.nl  recruiter
-- Bryan   bryan@ploeggenoten.nl        marketeer
--
-- LET OP — EERST DIT, ANDERS DOET ONDERSTAANDE NIETS:
-- de accounts zelf maak je aan in Supabase → Authentication → Users →
-- "Add user". Dat kan alleen jij: er komt een wachtwoord aan te pas, en dat
-- hoort niet via mij te lopen. Daarna dit script draaien.
--
-- De app koppelt een profiel aan een account op `id` (auth.users.id), niet
-- op e-mailadres. Onderstaande zoekt dat id zelf op, dus je hoeft nergens
-- een id over te typen. Ontbreekt een account nog, dan slaat die regel
-- gewoon over — je kunt dit dus veilig opnieuw draaien nadat je de rest
-- hebt aangemaakt.
--
-- `functie` bepaalt welk dashboard iemand ziet: am | recruiter | marketeer.
-- `naam` is waar de hele app op koppelt (eigenaar van een klant, recruiter
-- op een kandidaat, "voor wie" bij een taak). Schrijf hem dus precies zoals
-- hij in de bestaande gegevens staat — anders ziet iemand zijn eigen werk
-- niet meer staan.
insert into profiles (id, naam, email, functie, rol)
select u.id, v.naam, v.email, v.functie, v.rol
  from (values
    ('tjeerd@ploeggenoten.nl',      'Tjeerd', 'am',        'admin'),
    ('tjerk@ploeggenoten.nl',       'Tjerk',  'am',        'user'),
    ('recruitment@ploeggenoten.nl', 'Rajesh', 'recruiter', 'user'),
    ('bryan@ploeggenoten.nl',       'Bryan',  'marketeer', 'user')
  ) as v(email, naam, functie, rol)
  join auth.users u on lower(u.email) = v.email
on conflict (id) do update
  set naam    = excluded.naam,
      email   = excluded.email,
      functie = excluded.functie,
      rol     = excluded.rol;

-- Controle: dit hoort vier regels te geven. Staat er iemand niet bij, dan
-- bestaat dat account nog niet in Authentication → Users.
select p.naam, p.email, p.functie, p.rol
  from profiles p
  join auth.users u on u.id = p.id
 order by p.naam;
