-- ═══════════════════════════════════════════════════════════════
-- MIGRATIE — margefacturen van Pronkert automatisch inlezen
-- Draaien in de SQL-editor van Supabase. Veilig opnieuw te draaien.
--
-- WAAROM EEN REGELTABEL EN NIET ALLEEN EEN WEEKTOTAAL
-- Tot nu toe stond er per week één bedrag in fin_flex_weken en werden
-- `gewerkte_uren` en `marge_werkelijk` met de hand bijgehouden. Twee problemen:
--   1. Een latere factuur corrigeert soms een eerdere week. Op factuur 268245
--      (2 aug) werden eerst vijf dagen van Sven teruggeboekt en daarna opnieuw
--      gefactureerd. Met alleen een weektotaal kun je zo'n correctie niet
--      terugvinden — en bij een tweede import tel je 'm dubbel.
--   2. Optellen is niet omkeerbaar. Als een import half misgaat, weet niemand
--      meer wat het juiste getal was.
-- Daarom: elke factuurREGEL wordt bewaard. Het weektotaal en de gewerkte uren
-- worden daaruit AFGELEID (som), nooit opgeteld. Dezelfde factuur twee keer
-- inlezen levert dus exact hetzelfde resultaat op.
--
-- Gecontroleerd op de 16 bestaande bestanden (week 15 t/m 31): de afgeleide
-- uren komen exact uit op wat er nu handmatig staat — Rico 221,25 u,
-- Alain 243,83 u, Lorenzo 212 u, Sven 32 u (week 28).
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. De regels van de margefactuur ──────────────────────────
create table if not exists fin_flex_regels (
  id           bigserial primary key,
  factuur      text not null,        -- margefactuurnummer van Pronkert (bv. 268245)
  deelfactuur  text default '',      -- factuurnummer per flexkracht op diezelfde factuur
  factuurdatum date,
  week         date not null,        -- maandag van de week (sleutel van fin_flex_weken)
  weeknr       int,
  jaar         int,
  datum        date,                 -- de gewerkte dag
  regnr        text default '',      -- Reg.nr. bij Pronkert — stabielst om op te matchen
  naam         text default '',      -- 'S. van Nicolaas'
  roepnaam     text default '',      -- 'Sven'  (zo noemen wij hem in het CRM)
  functie      text default '',
  klant        text default '',      -- staat alleen op het Excel-overzicht, niet op de PDF
  soort        text default '',      -- 'Loon normale uren' / 'Eindejaarsuitkering' / ...
  uren         numeric default 0,    -- alleen gewerkte uren (loon-regels); reserveringen 0
  uren_regel   numeric default 0,    -- de uren zoals ze letterlijk op de regel staan
  uurloon      numeric,
  tarief       numeric,              -- wat de klant per uur betaalt
  factor       numeric,              -- inkoopfactor van Pronkert op deze regel
  klantbedrag  numeric,              -- omzet naar de klant (alleen uit het Excel-overzicht)
  marge        numeric not null default 0,  -- POSITIEF = wat wij verdienen
  bron         text default 'pdf',
  ingelezen_op timestamptz default now()
);

create index if not exists fin_flex_regels_week_idx    on fin_flex_regels(week);
create index if not exists fin_flex_regels_factuur_idx on fin_flex_regels(factuur);
create index if not exists fin_flex_regels_regnr_idx   on fin_flex_regels(regnr);

-- Marge is finance-informatie: alleen de eigenaar, net als de andere fin_*-tabellen.
do $$
begin
  execute 'alter table fin_flex_regels enable row level security';
  execute 'drop policy if exists flexregels_eigenaar on fin_flex_regels';
  execute 'create policy flexregels_eigenaar on fin_flex_regels
           for all to authenticated
           using (auth.jwt()->>''email'' = ''tjeerd@ploeggenoten.nl'')
           with check (auth.jwt()->>''email'' = ''tjeerd@ploeggenoten.nl'')';
end $$;

-- ─── 2. Stabiel kunnen matchen op de flexkracht ────────────────
-- De factuur noemt 'S. van Nicolaas (Sven)', het CRM 'Sven van Katwijk'. Het
-- registratienummer van Pronkert verandert nooit; zodra dat één keer aan een
-- plaatsing hangt, matcht elke volgende factuur zonder giswerk.
alter table fin_flex_plaatsingen add column if not exists regnr text default '';
create index if not exists fin_flex_plaatsingen_regnr_idx on fin_flex_plaatsingen(regnr);

-- Herkomst van een weekbedrag kunnen zien (handmatig ingevoerd of uit een factuur).
alter table fin_flex_weken add column if not exists bron text default '';

-- ─── 3. Afgeleide overzichten ──────────────────────────────────
-- Eén plek waar "wat verdienden we die week, per persoon" vandaan komt, zodat
-- het CRM en een controle in de SQL-editor nooit iets anders zeggen.
create or replace view fin_flex_week_kracht as
select week, weeknr, jaar,
       coalesce(nullif(regnr,''), naam || '|' || roepnaam) as sleutel,
       max(naam) as naam, max(roepnaam) as roepnaam, max(regnr) as regnr,
       max(functie) as functie, max(nullif(klant,'')) as klant,
       round(sum(uren)::numeric, 2)  as uren,
       round(sum(marge)::numeric, 2) as marge,
       case when sum(uren) > 0 then round((sum(marge)/sum(uren))::numeric, 2) end as marge_per_uur
from fin_flex_regels
group by week, weeknr, jaar, coalesce(nullif(regnr,''), naam || '|' || roepnaam);

-- ─── 4. Controle na het inlezen ────────────────────────────────
-- select week, sum(marge) from fin_flex_regels group by week order by week;
-- select * from fin_flex_week_kracht order by week desc, roepnaam;
