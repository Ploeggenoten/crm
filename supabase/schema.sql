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
-- Aanmaakdatum en fasehistorie: nodig om echte doorlooptijden en conversie
-- per cohort te kunnen tonen in plaats van een momentopname.
alter table clients add column if not exists aangemaakt  date default current_date;
alter table clients add column if not exists fase_historie jsonb default '[]'::jsonb;

-- Vacatures: eigen id, locatie, status, aantal en salarisrange.
alter table vacatures add column if not exists id        text;
alter table vacatures add column if not exists locatie   text default '';
alter table vacatures add column if not exists status    text default 'Open';
alter table vacatures add column if not exists aantal    int  default 1;
alter table vacatures add column if not exists sal_min   numeric;
alter table vacatures add column if not exists sal_max   numeric;
alter table vacatures add column if not exists eigenaar  text default '';
alter table vacatures add column if not exists omschrijving text default '';
update vacatures set id = klant || '::' || functie where id is null or id = '';

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

-- ─── 5. Documenten (bestanden bij klant/kandidaat) ────────────
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
  created_at timestamptz default now()
);
create index if not exists crm_contacten_klant on crm_contacten(klant);

-- ─── 8. RLS: team mag alles in crm_* lezen/schrijven ──────────
-- (Financiële cijfers zitten in fin_*-tabellen; die houden hun eigen,
--  striktere policies waardoor alleen Tjeerd erbij kan.)
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_activiteiten','crm_taken','crm_documenten','crm_kansen','crm_contacten']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists team_all on %I', t);
    execute format('create policy team_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ─── 9. Realtime ──────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_activiteiten','crm_taken','crm_kansen']
  loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ─── 10. Opslag voor documenten en CV's ───────────────────────
insert into storage.buckets (id, name, public)
values ('crm-docs','crm-docs', true)
on conflict (id) do nothing;

drop policy if exists crm_docs_lezen on storage.objects;
create policy crm_docs_lezen on storage.objects for select
  using (bucket_id = 'crm-docs');
drop policy if exists crm_docs_schrijven on storage.objects;
create policy crm_docs_schrijven on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-docs');
drop policy if exists crm_docs_verwijderen on storage.objects;
create policy crm_docs_verwijderen on storage.objects for delete to authenticated
  using (bucket_id = 'crm-docs');
