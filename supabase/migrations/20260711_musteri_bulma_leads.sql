-- ============================================================
-- Müşteri Bulma (Customer Finding) module
-- lead_searches, leads, lead_emails + team-aware RLS
-- Mirrors existing invoices RLS pattern via effective_owner_ids()
-- Applied to remote 2026-07-11 (also via MCP migration musteri_bulma_leads_tables)
-- ============================================================

-- 1) lead_searches ------------------------------------------------
create table if not exists public.lead_searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_by    uuid references auth.users(id),
  ulke          text,
  sehir         text,
  kategori      text not null,
  yaricap_km    numeric,
  max_results   integer default 50,
  min_puan      numeric default 0,
  only_email    boolean default false,
  only_phone    boolean default false,
  only_website  boolean default false,
  apify_run_id  text,
  status        text not null default 'running' check (status in ('running','done','error')),
  result_count  integer default 0,
  error         text,
  created_at    timestamptz not null default now()
);

-- 2) leads --------------------------------------------------------
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  search_id        uuid references public.lead_searches(id) on delete set null,
  place_id         text,
  isim             text not null,
  kategori         text,
  adres            text,
  telefon          text,
  email            text,
  website          text,
  puan             numeric,
  yorum_sayisi     integer,
  lat              numeric,
  lng              numeric,
  sehir            text,
  ulke             text,
  durum            text not null default 'yeni'
                   check (durum in ('yeni','ilgili','iletisimde','teklif','kazanildi','kaybedildi')),
  mail_durumu      text not null default 'gonderilmedi'
                   check (mail_durumu in ('gonderilmedi','gonderildi','yanit_geldi','hata')),
  yanit_kategorisi text
                   check (yanit_kategorisi is null or yanit_kategorisi in
                          ('ilgili','ilgisiz','fiyat_soruyor','randevu_istiyor','red','diger')),
  notlar           text,
  etiketler        text[] default '{}',
  raw              jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, place_id)
);

create index if not exists leads_user_idx         on public.leads(user_id);
create index if not exists leads_search_idx       on public.leads(search_id);
create index if not exists leads_durum_idx        on public.leads(user_id, durum);
create index if not exists leads_email_idx        on public.leads(user_id, email);
create index if not exists lead_searches_user_idx on public.lead_searches(user_id, created_at desc);

-- 3) lead_emails --------------------------------------------------
create table if not exists public.lead_emails (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  lead_id        uuid references public.leads(id) on delete cascade,
  direction      text not null default 'outbound' check (direction in ('outbound','inbound')),
  to_email       text,
  from_email     text,
  subject        text,
  body           text,
  resend_id      text,
  status         text not null default 'sent'
                 check (status in ('queued','sent','delivered','failed','received')),
  reply_category text,
  created_at     timestamptz not null default now()
);
create index if not exists lead_emails_lead_idx on public.lead_emails(lead_id, created_at);
create index if not exists lead_emails_user_idx on public.lead_emails(user_id, created_at desc);

-- 4) updated_at trigger on leads (reuse existing fn) -------------
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.update_updated_at_column();

-- 5) RLS ----------------------------------------------------------
alter table public.lead_searches enable row level security;
alter table public.leads         enable row level security;
alter table public.lead_emails   enable row level security;

-- lead_searches
drop policy if exists lead_searches_select on public.lead_searches;
drop policy if exists lead_searches_insert on public.lead_searches;
drop policy if exists lead_searches_update on public.lead_searches;
drop policy if exists lead_searches_delete on public.lead_searches;
create policy lead_searches_select on public.lead_searches for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy lead_searches_insert on public.lead_searches for insert
  with check (user_id in (select effective_owner_ids()));
create policy lead_searches_update on public.lead_searches for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy lead_searches_delete on public.lead_searches for delete
  using (user_id = auth.uid() or is_admin());

-- leads
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;
create policy leads_select on public.leads for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy leads_insert on public.leads for insert
  with check (user_id in (select effective_owner_ids()));
create policy leads_update on public.leads for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy leads_delete on public.leads for delete
  using (user_id = auth.uid() or is_admin());

-- lead_emails
drop policy if exists lead_emails_select on public.lead_emails;
drop policy if exists lead_emails_insert on public.lead_emails;
drop policy if exists lead_emails_update on public.lead_emails;
drop policy if exists lead_emails_delete on public.lead_emails;
create policy lead_emails_select on public.lead_emails for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy lead_emails_insert on public.lead_emails for insert
  with check (user_id in (select effective_owner_ids()));
create policy lead_emails_update on public.lead_emails for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy lead_emails_delete on public.lead_emails for delete
  using (user_id = auth.uid() or is_admin());

notify pgrst, 'reload schema';
