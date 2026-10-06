-- ═══════════════════════════════════════════════════════════════════
-- LEAD-ALARM · mail naar Tjeerd als er te lang geen Meta-lead binnenkomt
-- ═══════════════════════════════════════════════════════════════════
-- Waarom: op 5 okt 2026 stopte de leadstroom (mislukte Meta-betaling of een
-- storing in de keten Meta → n8n → Wati → CRM) en dat werd pas de volgende
-- ochtend gezien. Dit alarm draait in Supabase zelf (pg_cron), dus ook als je
-- Mac uit staat, en kost niets (Supabase free + Resend free: 100 mails/dag).
--
-- Regel: een alarm komt zodra er 5 WAKKERE uren (07:00-23:00 Nederlandse tijd)
-- geen nieuwe lead in crm_leads is gekomen. 's Nachts tellen de uren niet mee,
-- want echte nachtgaten van 5 tot 9 uur komen voor (o.a. 2 okt 23:08 → 07:50).
-- Gecontroleerd tegen de leads sinds 28 aug: dat geeft alleen alarm bij echte
-- storingen en bij een enkel rustig zaterdagavond-gat.
-- Per storing komt er één alarmmail en één "weer binnen"-mail.
--
-- ── EENMALIG (jij, ±5 minuten) ───────────────────────────────────────
-- 1. Maak een gratis account op https://resend.com met tjeerd@ploeggenoten.nl
--    (het gratis afzenderadres onboarding@resend.dev kan alleen mailen naar het
--    e-mailadres van je eigen Resend-account; voor één ontvanger is dat genoeg).
-- 2. Resend → API Keys → Create API Key (rechten: "Sending access") → kopieer.
-- 3. Plak die sleutel hieronder bij 'PLAK-HIER-DE-RESEND-SLEUTEL' (alleen in de
--    SQL-editor, nooit in een bestand of in de chat) en draai dit hele script in
--    Supabase → SQL Editor (project gyhrwjdlwamyjhxtdypw).
-- 4. Draai daarna los:  select lead_alarm_test();   → er moet een testmail komen.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- bot_config bestaat al (RLS aan, geen toegang voor anon/authenticated)
insert into bot_config (k, v) values ('resend_key', 'PLAK-HIER-DE-RESEND-SLEUTEL')
  on conflict (k) do update set v = excluded.v;
insert into bot_config (k, v) values ('alarm_naar', 'tjeerd@ploeggenoten.nl')
  on conflict (k) do nothing;
insert into bot_config (k, v) values ('alarm_drempel_uur', '5')
  on conflict (k) do nothing;
insert into bot_config (k, v) values ('alarm_state', 'ok')
  on conflict (k) do nothing;

-- Aantal uren stilte, alleen geteld tussen 07:00 en 23:00 Nederlandse tijd
create or replace function wakker_uren_stil(vanaf timestamptz, tot timestamptz)
returns numeric language sql stable
set search_path = public
as $$
  select coalesce(sum(
           extract(epoch from (least(tot, d.e) - greatest(vanaf, d.s))) / 3600
         ) filter (where least(tot, d.e) > greatest(vanaf, d.s)), 0)::numeric
  from (
    select ((dag + time '07:00') at time zone 'Europe/Amsterdam') as s,
           ((dag + time '23:00') at time zone 'Europe/Amsterdam') as e
    from generate_series(
           (vanaf at time zone 'Europe/Amsterdam')::date::timestamp,
           (tot   at time zone 'Europe/Amsterdam')::date::timestamp,
           interval '1 day') as dag
  ) d
$$;

create or replace function lead_alarm_mail(onderwerp text, tekst text)
returns text language plpgsql security definer
set search_path = public, extensions
as $$
declare sleutel text; naar text;
begin
  select v into sleutel from bot_config where k = 'resend_key';
  select v into naar    from bot_config where k = 'alarm_naar';
  if sleutel is null or sleutel = '' or sleutel like 'PLAK-HIER%' then
    return 'geen Resend-sleutel ingesteld';
  end if;
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || sleutel,
                                  'Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'from',    'Ploeggenoten CRM <onboarding@resend.dev>',
                 'to',      jsonb_build_array(naar),
                 'subject', onderwerp,
                 'text',    tekst));
  return 'mail verstuurd naar ' || naar;
end $$;

create or replace function lead_alarm_check()
returns text language plpgsql security definer
set search_path = public, extensions
as $$
declare
  laatste   timestamptz;
  uren      numeric;
  drempel   numeric;
  st        text;
  nu_nl     text := to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI');
  laatst_nl text;
begin
  select max(binnen_op) into laatste from crm_leads;
  select v::numeric into drempel from bot_config where k = 'alarm_drempel_uur';
  select v into st from bot_config where k = 'alarm_state';
  drempel := coalesce(drempel, 5);
  st := coalesce(st, 'ok');
  if laatste is null then return 'geen leads in crm_leads'; end if;
  laatst_nl := to_char(laatste at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI');
  uren := wakker_uren_stil(laatste, now());

  -- Nieuwe lead na een alarm → herstelmail
  if st like 'alarm:%' and laatste > substr(st, 7)::timestamptz then
    update bot_config set v = 'ok' where k = 'alarm_state';
    return lead_alarm_mail(
      'Leads komen weer binnen',
      'Er is weer een lead binnengekomen (' || laatst_nl || '). De leadstroom loopt weer.');
  end if;

  -- Te lang stil en nog geen alarm voor deze storing → alarmmail
  if uren >= drempel and st = 'ok' then
    update bot_config set v = 'alarm:' || laatste::text where k = 'alarm_state';
    return lead_alarm_mail(
      'ALARM: al ' || round(uren, 1) || ' uur geen Meta-lead (laatste ' || laatst_nl || ')',
      'De laatste lead kwam binnen op ' || laatst_nl || '. Nu is het ' || nu_nl ||
      ', dat is ' || round(uren, 1) || ' uur zonder nieuwe lead (nachturen tellen niet mee).' || E'\n\n' ||
      'Kijk in deze volgorde:' || E'\n' ||
      '1. Meta Ads Manager: staan de campagnes op Actief? Is de betaling mislukt of staat het account op pauze?' || E'\n' ||
      '2. Meta Leads Center: komen daar nog leads binnen?' || E'\n' ||
      '3. n8n (Smit): draait de workflow nog, zijn er mislukte uitvoeringen?' || E'\n' ||
      '4. Wati: is de WhatsApp-koppeling nog verbonden?' || E'\n\n' ||
      'Je krijgt een tweede mail zodra er weer een lead binnenkomt.' || E'\n' ||
      'https://ploeggenoten.github.io/crm/');
  end if;

  return 'geen actie: ' || round(uren, 1) || ' wakkere uur stil, status ' || left(st, 5);
end $$;

create or replace function lead_alarm_test()
returns text language sql security definer
set search_path = public, extensions
as $$
  select lead_alarm_mail('Test: lead-alarm werkt',
    'Dit is een testmail van het lead-alarm in het CRM. Als je dit leest, werkt de mailkoppeling.');
$$;

-- Alleen de database zelf (cron) en de SQL-editor mogen dit aanroepen
revoke all on function lead_alarm_mail(text, text) from public, anon, authenticated;
revoke all on function lead_alarm_check()          from public, anon, authenticated;
revoke all on function lead_alarm_test()           from public, anon, authenticated;

-- Elk kwartier controleren (opnieuw draaien is veilig: oude taak wordt vervangen)
select cron.unschedule('lead-alarm') where exists (select 1 from cron.job where jobname = 'lead-alarm');
select cron.schedule('lead-alarm', '*/15 * * * *', $$select lead_alarm_check()$$);
