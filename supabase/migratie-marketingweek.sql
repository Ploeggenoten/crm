-- ═══ MIGRATIE: mkt_blok_klaar — afgevinkte vaste blokken in "Mijn week" ═══
-- Plakken in de Supabase SQL Editor (project gyhrwjdlwamyjhxtdypw) en runnen.
-- Veilig om opnieuw te draaien. Zonder deze tabel werkt "Mijn week" gewoon,
-- alleen het afvinken van de vaste blokken (maandag cijfers, dinsdag filmen,
-- enzovoort) wordt dan niet bewaard.

create table if not exists public.mkt_blok_klaar (
  blok        text not null,                 -- bijv. 'ma-meta', zie js/marketingweek.js
  week        date not null,                 -- de maandag van de week
  klaar       boolean not null default true,
  door        text default '',
  updated_at  timestamptz not null default now(),
  primary key (blok, week)
);

alter table public.mkt_blok_klaar enable row level security;
revoke all on table public.mkt_blok_klaar from anon;

drop policy if exists "team alles mkt_blok_klaar" on public.mkt_blok_klaar;
create policy "team alles mkt_blok_klaar" on public.mkt_blok_klaar
  for all to authenticated using (true) with check (true);
