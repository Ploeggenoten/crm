-- ═══════════════════════════════════════════════════════════════
-- TELEFOONBOEK (3 nov 2026)
--
-- Tjeerd: "als ik contactpersonen toevoeg in het CRM moet hij dat
-- herkennen, dat ik niet telkens het nummer weer hoef op te zoeken."
--
-- Een kopie van iemands iPhone-contacten (via iCloud op de Mac), alleen
-- om bij "Nieuwe contactpersoon" de naam te herkennen en nummer/mail in
-- te vullen. Het zijn geen CRM-contactpersonen: er staan ook privé-
-- nummers tussen. Daarom ziet ieder alleen zijn eigen rijen (eigenaar =
-- e-mailadres van de login) en schrijft alleen de ochtendroutine, via de
-- Edge Function lead-radar (modus telefoonboek, service role).
-- Veilig opnieuw te draaien.
-- ═══════════════════════════════════════════════════════════════

create table if not exists crm_telefoonboek (
  eigenaar    text not null,                -- e-mail van de login, kleine letters
  bron_id     text not null,                -- id uit Contacten op de Mac
  naam        text default '',
  bedrijf     text default '',
  functie     text default '',
  telefoons   jsonb default '[]'::jsonb,    -- ["06 …", "+31 …"]
  emails      jsonb default '[]'::jsonb,
  bijgewerkt  timestamptz default now(),
  primary key (eigenaar, bron_id)
);

alter table crm_telefoonboek enable row level security;
drop policy if exists telefoonboek_eigen on crm_telefoonboek;
create policy telefoonboek_eigen on crm_telefoonboek for select to authenticated
  using (lower(auth.jwt()->>'email') = eigenaar);
