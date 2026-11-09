-- ═══════════════════════════════════════════════════════════════
-- TEAMAGENDA (9 nov 2026)
--
-- Tjeerd: "bij Gesprek ingepland zie ik welke data de gesprekken zijn.
-- Alleen Daan kan het niet zien — zorg dat hij ook deze agendapunten van
-- mij kan zien." Ieders CRM (js/opvolging.js, agendaNaarTeam) zet hier de
-- Outlook-afspraken in die bij een klant horen: onderwerp, begin/eind en
-- locatie. Niet de hele agenda en geen deelnemers. Het hele team leest mee.
-- Begin/eind als lokale tijdtekst ("2026-11-18T12:30:00"). Veilig opnieuw
-- te draaien.
-- ═══════════════════════════════════════════════════════════════

create table if not exists crm_agenda (
  id          text primary key,             -- eigenaar|outlook-id|klant
  eigenaar    text not null,                -- mailbox waar de afspraak vandaan komt
  door        text default '',              -- naam van die collega in het CRM
  klant       text not null,
  titel       text default '',
  start       text not null,                -- lokale tijd, bijv. 2026-11-18T12:30:00
  eind        text,
  locatie     text default '',
  bijgewerkt  timestamptz default now()
);
create index if not exists crm_agenda_start on crm_agenda (start);
create index if not exists crm_agenda_eigenaar on crm_agenda (eigenaar);

alter table crm_agenda enable row level security;
drop policy if exists team_all on crm_agenda;
create policy team_all on crm_agenda for all to authenticated using (true) with check (true);

-- Live bijwerken op ieders scherm.
do $$ begin
  alter publication supabase_realtime add table crm_agenda;
exception when duplicate_object then null; end $$;
