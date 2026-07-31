-- ═══════════════════════════════════════════════════════════════
-- DRINGEND — kandidaatgegevens staan publiek leesbaar
--
-- WAT ER AAN DE HAND IS
-- De apps draaien op GitHub Pages vanaf een openbare repository. De
-- publieke Supabase-sleutel (de "anon key") staat daardoor in de broncode,
-- en dat hoort ook zo: die sleutel is bedoeld om openbaar te zijn. De
-- bescherming moet komen van Row Level Security in de database.
--
-- Op vijf tabellen staat die bescherming niet aan. Gemeten op 31 juli 2026
-- door zonder in te loggen op te vragen:
--
--     candidates    349 rijen  ← namen van kandidaten
--     clients       222 rijen  ← je volledige klantenbestand
--     vacatures      50 rijen
--     targets         4 rijen
--     oo_sessions     1 rij
--
-- Iedereen die het adres van de app kent, kan die gegevens uitlezen zonder
-- account. Voor kandidaatgegevens is dat een AVG-probleem: dat zijn
-- persoonsgegevens van mensen die zich bij jou hebben gemeld.
--
-- WAT WEL GOED STAAT
-- profiles en alle crm_*-tabellen gaven 0 rijen terug zonder login: die
-- hebben hun policy wel. De fin_*-tabellen ook, plus de extra afscherming
-- op jouw e-mailadres. Dit gaat alleen om de vijf tabellen hierboven —
-- de oudste, uit de tijd van het pijplijnbord.
--
-- WAT DIT SCRIPT DOET
-- Row Level Security aanzetten en per tabel toestaan dat INGELOGDE
-- gebruikers alles mogen lezen en schrijven. Voor de apps verandert er
-- niets: CRM, pijplijnbord, financebord en marketingbord laten je allemaal
-- eerst inloggen. Alleen het opvragen zónder account stopt.
--
-- VOLGORDE IS BELANGRIJK: RLS aanzetten op een tabel zonder policy sluit
-- iedereen buiten, ook jezelf. Daarom staat in elk blok eerst de policy en
-- pas daarna het aanzetten. Veilig opnieuw te draaien.
-- ═══════════════════════════════════════════════════════════════

-- ─── Stap 1: kijken wat er nu staat (optioneel, alleen lezen) ──
-- Draai dit eerst als je wilt zien welke policies er al zijn. Zie je hier
-- een policy met roles = {anon} of {public}, noteer dan de naam: die moet
-- eruit, anders blijft de deur openstaan naast de nieuwe policy.
select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('candidates','clients','vacatures','targets','oo_sessions')
 order by tablename, policyname;

-- ─── Stap 2: dichtzetten ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['candidates','clients','vacatures','targets','oo_sessions']
  loop
    -- Eerst de policy: ingelogde gebruikers houden volledige toegang.
    execute format('drop policy if exists ingelogd_alles on %I', t);
    execute format(
      'create policy ingelogd_alles on %I for all to authenticated
       using (true) with check (true)', t);
    -- Pas daarna RLS aan, zodat er nooit een moment is zonder policy.
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ─── Stap 3: eventuele oude, te ruime policies opruimen ───────
-- Vond je bij stap 1 een policy voor anon of public? Haal die weg, anders
-- geeft die nog steeds toegang. Vul de naam in en draai de regel:
--
--   drop policy "<naam uit stap 1>" on candidates;
--
-- Laat 'ingelogd_alles' staan — dat is degene die je apps nodig hebben.

-- ─── Stap 4: controleren dat het werkt ────────────────────────
-- Draai daarna in een terminal, met de anon-sleutel uit js/core.js:
--
--   curl -s "https://gyhrwjdlwamyjhxtdypw.supabase.co/rest/v1/candidates?select=naam&limit=1" \
--     -H "apikey: <anon-sleutel>" -H "Authorization: Bearer <anon-sleutel>"
--
-- Verwacht antwoord: []  (een lege lijst).
-- Krijg je nog namen terug, dan staat er nog een te ruime policy open.
--
-- Log daarna in het CRM in en controleer dat je kandidaten en klanten
-- gewoon ziet. Zo niet: er ontbreekt een policy, draai stap 2 opnieuw.
