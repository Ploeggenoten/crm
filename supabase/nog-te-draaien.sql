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
-- AKKOORD 31 jul 2026, Tjeerd: "De fee mag iedereen zien, dat is geen
-- probleem hoor. Alleen niet al mijn bankcijfers etc." Daarom aangezet.
--
-- Wat dit WEL doet: het team ziet de fee op de kandidatenkaart, in het
-- feestscherm bij een plaatsing en in Performance — ook wanneer een AM zelf
-- de plaatsing afrondt (tot nu toe kon alleen Tjeerds browser die uitrekenen).
-- Wat dit NIET doet: fin_bank_tx, cashflow, winst en alle andere fin_*-tabellen
-- blijven onaangeroerd en dicht. Dat zijn andere tabellen met een eigen policy.
do $$
begin
  execute 'drop policy if exists afspraken_owner_only on crm_afspraken';
  execute 'drop policy if exists afspraken_team on crm_afspraken';
  execute 'create policy afspraken_team on crm_afspraken
           for all to authenticated using (true) with check (true)';
end $$;


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
-- LET OP — TWEE VELDEN, TWEE BETEKENISSEN. Verwar ze niet:
--
--   rol      = mag deze persoon beheren? Alleen 'admin' of 'am'. De tabel
--              profiles komt uit het oude pijplijnbord en heeft een
--              check-constraint (profiles_rol_check) die niets anders
--              toestaat. Hier stond eerst 'user'; dat bestaat niet en het
--              hele script liep daarop stuk (1 aug 2026). De app kijkt ook
--              alleen naar rol === 'admin' en noemt al het andere "Teamlid",
--              dus 'am' betekent hier simpelweg "gewone gebruiker".
--   functie  = welk dashboard krijg je: am | recruiter | marketeer.
--
-- Rajesh is dus functie 'recruiter' met rol 'am', en Bryan functie
-- 'marketeer' met rol 'am'. Dat leest raar, maar het is de tabel die dat zo
-- wil; wie het netter wil, verruimt eerst de constraint.
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
    ('tjerk@ploeggenoten.nl',       'Tjerk',  'am',        'am'),
    ('recruitment@ploeggenoten.nl', 'Rajesh', 'recruiter', 'am'),
    ('bryan@ploeggenoten.nl',       'Bryan',  'marketeer', 'am')
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


-- ─── 5. Wanneer is een vacature opgehaald? ────────────────────
-- Sales stuurt op "hoeveel vacatures hebben we deze week opgehaald". Zonder
-- deze kolom is dat niet te tellen. Bestaande rijen krijgen bewust GEEN
-- datum: een verzonnen datum is erger dan een streepje, en het scherm meldt
-- zelf hoeveel rijen niet meetellen.
alter table vacatures add column if not exists aangemaakt date;
alter table vacatures alter column aangemaakt set default current_date;


-- ─── 6. Afgesloten trajecten (js/traject.js) ──────────────────
-- Eén kandidaat heeft één veld `klant`. Stel je dezelfde persoon bij een
-- tweede klant voor, dan wordt de eerste overschreven en raakt die klant
-- stilzwijgend een kandidaat kwijt — inclusief de telling op hun vacature.
-- Deze tabel bewaart wat er dan verdween. ALLEEN TOEVOEGEN.
-- Bewust GEEN kandidaatnaam, alleen kandidaat_id: de naam staat op de
-- kaart en verdwijnt daar bij anonimiseren; zou hij hier ook staan, dan
-- bewaar je precies wat je zou wissen.
-- Telt NERGENS mee: dit is geen uitval en geen plaatsing.
create table if not exists crm_trajecten (
  id            text primary key,
  kandidaat_id  text not null,
  klant         text default '',
  vacature_id   text default '',
  functie       text default '',
  fase          text default '',
  hoogste_fase  text default '',
  begin_op      date,
  eind_op       date,
  reden         text not null,
  naar_klant    text default '',
  naar_vacature text default '',
  naar_functie  text default '',
  door          text default '',
  op            timestamptz default now()
);
create index if not exists crm_traj_klant on crm_trajecten(klant, eind_op desc);
create index if not exists crm_traj_vac   on crm_trajecten(vacature_id);
create index if not exists crm_traj_kand  on crm_trajecten(kandidaat_id);
create index if not exists crm_traj_op    on crm_trajecten(op desc);

-- Lezen en aanmaken mag het team. BIJWERKEN EN VERWIJDEREN MAG NIEMAND —
-- een geschiedenis die je kunt aanpassen bewijst niets. Daarom staat deze
-- tabel bewust NIET in de array-lus van blok 8 in schema.sql: die geeft
-- `for all`, en daarmee ook update en delete.
do $$
begin
  execute 'alter table crm_trajecten enable row level security';
  execute 'drop policy if exists traj_lezen on crm_trajecten';
  execute 'create policy traj_lezen on crm_trajecten
           for select to authenticated using (true)';
  execute 'drop policy if exists traj_aanmaken on crm_trajecten';
  execute 'create policy traj_aanmaken on crm_trajecten
           for insert to authenticated with check (true)';
end $$;


-- ─── 7. Eén naam per collega ──────────────────────────────────
-- Het veld `rec` op candidates is vrije tekst en is door de jaren heen op
-- zes manieren gevuld voor vier mensen: 'Bryan', 'bryan', 'Tjeerd' en
-- 'tjeerd@ploeggenoten.nl'. In Performance leverde dat zes regels per
-- recruiter op met overal nullen — dan kun je niemand op zijn inzet
-- afrekenen, want niemands cijfers staan bij elkaar.
--
-- Bryan is de naam waaronder Rajesh naar buiten communiceert. Intern is het
-- Rajesh, en zo hoort het in de cijfers te staan.
-- (Tjeerd, 3 aug 2026: "alle plaatsingen die op Bryan staan zijn eigenlijk
-- Rajesh. Extern heet hij Bryan, zo communiceren we naar buiten.")
--
-- De app trekt de weergave al gelijk via CRM.naamNorm, dus dit is geen
-- noodgeval. Maar zolang de rijen zelf niet kloppen, komt de rommel terug
-- zodra iemand ergens anders op dit veld filtert of groepeert.
--
-- Veilig opnieuw te draaien: elke regel raakt alleen wat nog niet goed staat.
update candidates set rec = 'Rajesh'
 where lower(trim(rec)) in ('bryan', 'bryan@ploeggenoten.nl', 'recruitment',
                            'recruitment@ploeggenoten.nl', 'rajesh');
update candidates set rec = 'Tjeerd'
 where lower(trim(rec)) in ('tjeerd', 'tjeerd@ploeggenoten.nl');
update candidates set rec = 'Tjerk'
 where lower(trim(rec)) in ('tjerk', 'tjerk@ploeggenoten.nl');

-- Zelfde opschoning voor de eigenaar van een klant en van een lead.
update clients   set eigenaar = 'Rajesh' where lower(trim(eigenaar)) in ('bryan','recruitment','rajesh');
update clients   set eigenaar = 'Tjeerd' where lower(trim(eigenaar)) like 'tjeerd%';
update clients   set eigenaar = 'Tjerk'  where lower(trim(eigenaar)) like 'tjerk%';
update crm_leads set eigenaar = 'Rajesh' where lower(trim(eigenaar)) in ('bryan','recruitment','rajesh');
update crm_leads set eigenaar = 'Tjeerd' where lower(trim(eigenaar)) like 'tjeerd%';
update crm_leads set eigenaar = 'Tjerk'  where lower(trim(eigenaar)) like 'tjerk%';

-- Controle: hierna horen er hooguit drie namen te staan.
select rec, count(*) from candidates where rec <> '' group by rec order by 2 desc;
