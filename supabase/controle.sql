-- Controle: wat moet er nog gedraaid worden uit nog-te-draaien.sql?
-- Leest alleen, verandert niets. 0 = dit blok is al gedraaid.
select 'blok 1 · kandidaten nog op Voorselectie' as blok,
       (select count(*) from candidates where fase = 'Voorselectie')::text as nog_te_doen
union all
select 'blok 1 · historie met Voorselectie',
       (select count(*) from candidates
         where historie is not null and jsonb_typeof(historie) = 'array'
           and historie::text like '%Voorselectie%')::text
union all
select 'blok 2 · fee zichtbaar voor het team',
       (select case when exists (select 1 from pg_policies
                 where tablename = 'crm_afspraken' and policyname = 'afspraken_team')
               then '0' else '1 — policy ontbreekt' end)
union all
select 'blok 4 · profielen nog niet gekoppeld',
       (select (4 - count(*))::text from profiles p join auth.users u on u.id = p.id
         where lower(u.email) in ('tjeerd@ploeggenoten.nl','tjerk@ploeggenoten.nl',
                                  'recruitment@ploeggenoten.nl','bryan@ploeggenoten.nl'))
union all
select 'blok 7 · afwijkende namen in rec',
       (select count(distinct rec) from candidates
         where rec <> '' and rec not in ('Tjeerd','Tjerk','Rajesh'))::text;
