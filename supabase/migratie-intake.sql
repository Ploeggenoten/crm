-- ═══════════════════════════════════════════════════════════════
-- MIGRATIE — fase 'Voorselectie' wordt 'Intake'   (30 jul 2026)
--
-- WAT.  De eerste pijplijnfase heette 'Voorselectie'. Die screeningsstap is
--       geschrapt: een interessante sollicitant krijgt meteen een volledige
--       kandidatenkaart en van daaruit wordt de videocall (Teams) gepland.
--       De fase heet daarom voortaan 'Intake' en staat als eerste kolom
--       gewoon op het pijplijnbord.
--
-- WANNEER.  Wanneer je wilt — de app is er niet van afhankelijk. De code
--       normaliseert 'Voorselectie' overal naar 'Intake' (CRM.faseNorm in
--       js/data.js), dus kandidaten op de oude waarde staan nu al in de
--       Intake-kolom en vallen nergens uit een lijst. Deze migratie ruimt
--       alleen de opgeslagen waarde op. Draai hem in de Supabase SQL-editor.
--
-- VEILIG HERHAALBAAR.  Beide statements raken alleen rijen met de oude
--       waarde; een tweede keer draaien doet niets (0 rijen).
--
-- CONTROLE VOORAF (verwacht op 30 jul 2026: 8 rijen):
--       select count(*) from candidates where fase = 'Voorselectie';
-- ═══════════════════════════════════════════════════════════════

-- 1. De huidige fase van de kandidaat.
update candidates
   set fase = 'Intake'
 where fase = 'Voorselectie';

-- 2. De fasehistorie (candidates.historie, jsonb-array van {fase, op}).
--    Nodig omdat het bord "dagen in deze fase" uit dit veld haalt en de
--    uitvalanalyse er de verst bereikte fase mee bepaalt. Elk element wordt
--    één-op-één overgenomen; alleen 'fase' = 'Voorselectie' wordt vervangen,
--    de volgorde en alle overige sleutels (o.a. 'op') blijven ongemoeid.
--    De where-clause beperkt dit tot rijen die de oude waarde écht bevatten,
--    en jsonb_typeof() houdt rijen met null of een niet-array met rust.
update candidates
   set historie = (
         select jsonb_agg(
                  case when e->>'fase' = 'Voorselectie'
                       then jsonb_set(e, '{fase}', '"Intake"'::jsonb)
                       else e
                  end
                  order by ord
                )
           from jsonb_array_elements(historie) with ordinality as t(e, ord)
       )
 where jsonb_typeof(historie) = 'array'
   and historie @> '[{"fase":"Voorselectie"}]'::jsonb;

-- CONTROLE ACHTERAF — beide tellingen horen 0 te zijn:
--   select count(*) from candidates where fase = 'Voorselectie';
--   select count(*) from candidates where historie @> '[{"fase":"Voorselectie"}]'::jsonb;
--
-- NB: crm_activiteiten bewaart fasewissels als vrije tekst ('Voorselectie →
--     Voorgesteld'). Dat is een logboek van wat er destijds gebeurde en wordt
--     bewust NIET herschreven — geschiedenis herschrijf je niet.
