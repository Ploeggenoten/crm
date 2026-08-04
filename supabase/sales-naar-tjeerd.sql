-- ─── Sales naar Tjeerd (4 aug 2026) ──────────────────────────────
-- Tjeerd neemt de sales zelf: alle relaties in elke salesfase BEHALVE
-- 'Afgerond' komen op zijn naam. Afgerond = klant = accountbeheer, dat
-- blijft bij de huidige eigenaar. Let op de tweede uitzondering: relaties
-- zonder ingevulde fase maar mét vacatures zijn in de app afgeleide
-- klanten (faseVan in js/sales.js) — die blijven ook staan.
-- Veilig herhaalbaar; draai de controle eronder om het resultaat te zien.

update clients
   set eigenaar = 'Tjeerd'
 where coalesce(fase, '') <> 'Afgerond'
   and not (
     coalesce(fase, '') = ''
     and exists (select 1 from vacatures v where v.klant = clients.naam)
   );

-- Controle: eigenaren per fase ná de wijziging.
select coalesce(nullif(fase,''),'(geen fase)') as fase, eigenaar, count(*)
  from clients
 group by 1, 2
 order by 1, 3 desc;
