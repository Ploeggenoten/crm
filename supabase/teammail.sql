-- ═══════════════════════════════════════════════════════════════
-- TEAMMAIL (3 nov 2026)
--
-- Tjeerd: "dat ik ook Daans mailtjes kan bekijken die hij heeft gestuurd
-- naar relaties, contactpersonen en klanten" / "we mogen elkaars relaties
-- zien". Ieders CRM (js/mailsync.js) zet hier zijn mail met CRM-adressen
-- in: alleen koppen en het korte Outlook-fragment, nooit de hele mail.
-- Het hele team leest mee. Veilig opnieuw te draaien.
-- ═══════════════════════════════════════════════════════════════

create table if not exists crm_mails (
  id          text primary key,             -- eigenaar|internetMessageId
  mid         text not null,                -- internetMessageId (zelfde mail bij twee collega's)
  eigenaar    text not null,                -- mailbox waar hij vandaan komt
  door        text default '',              -- naam van die collega in het CRM
  richting    text default 'uit',           -- uit | in
  van         text default '',
  van_naam    text default '',
  aan         text[] default '{}',
  adressen    text[] default '{}',          -- de CRM-adressen in deze mail (kleine letters)
  klanten     text[] default '{}',
  onderwerp   text default '',
  fragment    text default '',
  op          timestamptz,
  created_at  timestamptz default now()
);
create index if not exists crm_mails_adressen on crm_mails using gin (adressen);
create index if not exists crm_mails_op on crm_mails (op desc);

alter table crm_mails enable row level security;
drop policy if exists team_all on crm_mails;
create policy team_all on crm_mails for all to authenticated using (true) with check (true);
