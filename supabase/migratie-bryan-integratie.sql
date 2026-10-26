-- ═══ MIGRATIE: Bryans planner in het CRM (26 okt 2026) ═══
-- Bundelt de migraties uit Bryans marketingbord die nog niet (zeker) gedraaid waren:
-- vaste tijd, gebied/duur en Outlook-koppeling op mkt_taken, plus de notitietabel.
-- Alles is idempotent: opnieuw draaien kan geen kwaad. Plakken in Supabase → SQL Editor → Run.

-- Taken: gebied + duur (weekbalans), vaste tijd, koppeling met de Outlook-agenda
alter table public.mkt_taken add column if not exists gebied       text not null default 'overig';
alter table public.mkt_taken add column if not exists duur_min     int  not null default 60;
alter table public.mkt_taken add column if not exists tijd         text not null default '';
alter table public.mkt_taken add column if not exists outlook_id   text not null default '';
alter table public.mkt_taken add column if not exists outlook_sync text not null default '';

-- Notities van de dag
create table if not exists public.mkt_notities (
  id uuid primary key default gen_random_uuid(),
  tekst text not null default '',
  door text default '',
  verwerkt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mkt_notities add column if not exists datum date;
alter table public.mkt_notities enable row level security;
drop policy if exists "team alles mkt_notities" on public.mkt_notities;
create policy "team alles mkt_notities" on public.mkt_notities
  for all to authenticated using (true) with check (true);

-- Laat de API de nieuwe kolommen meteen zien
notify pgrst, 'reload schema';

-- Controle: moet 5 kolommen en 1 tabel tonen
select column_name from information_schema.columns
 where table_schema='public' and table_name='mkt_taken'
   and column_name in ('gebied','duur_min','tijd','outlook_id','outlook_sync');
select count(*) as notitietabel from information_schema.tables
 where table_schema='public' and table_name='mkt_notities';
