-- ═══════════════════════════════════════════════════════════════
-- WERKENBIJ-WACHT (2 nov 2026)
--
-- Tjeerd: "ik wil dat je alle werkenbij-sites checkt of ze nieuwe vacatures
-- hebben, zodat ik een alert krijg en kan opbellen — ook in mijn dashboard
-- en de salespijplijn."
--
-- crm_werkenbij          één rij per bewaakt bedrijf: de vacaturepagina en
--                        de titels die er bij de laatste controle stonden.
-- crm_vacature_signalen  één rij per NIEUWE vacature (alles wat er de vorige
--                        keer niet stond). Daar leest het dashboard en de
--                        salespijplijn uit; de eigenaar zet hem op gebeld/weg.
--
-- Gevuld door de ochtendroutine via de Edge Function lead-radar (modi
-- werkenbij_lijst / werkenbij_stand). Veilig opnieuw te draaien.
-- ═══════════════════════════════════════════════════════════════

create table if not exists crm_werkenbij (
  sleutel      text primary key,            -- genormaliseerde bedrijfsnaam
  bedrijf      text not null,
  klant_id     text,                        -- clients.id, leeg voor radarbedrijven
  url          text default '',             -- de vacaturepagina (werkenbij/careers)
  status       text default 'nog_zoeken',   -- nog_zoeken | ok | niet_leesbaar | geen_site
  titels       jsonb default '[]'::jsonb,   -- [{titel, url}] bij de laatste controle
  gecheckt_op  timestamptz,
  created_at   timestamptz default now()
);

create table if not exists crm_vacature_signalen (
  id          text primary key,
  bedrijf     text not null,
  klant_id    text,
  functie     text default '',
  url         text default '',
  voor        text default 'Tjeerd',        -- eigenaar van de klant
  status      text default 'nieuw',         -- nieuw | gebeld | weg
  gezien_op   timestamptz default now(),
  afgehandeld_op timestamptz
);
create index if not exists crm_vs_voor on crm_vacature_signalen(voor, status);

do $$
declare t text;
begin
  foreach t in array array['crm_werkenbij','crm_vacature_signalen']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists team_all on %I', t);
    execute format('create policy team_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Realtime, zodat "gebeld"/"weg" bij een collega meteen verdwijnt.
do $$ begin
  execute 'alter publication supabase_realtime add table crm_vacature_signalen';
exception when duplicate_object then null; end $$;
