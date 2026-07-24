-- ============================================================
-- sm_account_credentials — sosyal hesap kimlik bilgileri (PRD Faz 3)
-- ============================================================
-- GÜVENLİK GEREKÇESİ
-- Access/refresh token'lar `sm_accounts` içinde TUTULMAZ: o tablonun
-- select politikası `authenticated` rolüne açık, yani token'lar tarayıcıya
-- inerdi. Bu tablo ayrı tutulur ve BİLİNÇLİ OLARAK hiçbir RLS politikası
-- tanımlanmaz → RLS açık + 0 politika = `authenticated` için her şey reddedilir.
-- Yalnızca `service_role` (Edge Function) erişir; RLS'i o rol zaten bypass eder.
--
-- Client "bağlı mı?" bilgisini `sm_accounts.dogrulandi` üzerinden okur.
-- ============================================================

create table if not exists public.sm_account_credentials (
  account_id      uuid primary key references public.sm_accounts(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  saglayici       text not null,       -- composio | meta_oauth | google_oauth
  harici_hesap    text,                -- Composio connected_account_id / OAuth subject
  erisim_token    text,
  yenileme_token  text,
  gecerlilik      timestamptz,         -- access token son kullanma
  kapsamlar       text[] not null default '{}',
  son_hata        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists sm_account_credentials_user_idx
  on public.sm_account_credentials (user_id);

drop trigger if exists sm_account_credentials_set_updated_at on public.sm_account_credentials;
create trigger sm_account_credentials_set_updated_at before update on public.sm_account_credentials
  for each row execute function public.update_updated_at_column();

-- RLS açık, politika YOK → anon/authenticated hiçbir satır göremez.
alter table public.sm_account_credentials enable row level security;
alter table public.sm_account_credentials force row level security;

-- Kemer + askı: tablo düzeyinde grant'ları da geri al.
revoke all on public.sm_account_credentials from anon, authenticated;

comment on table public.sm_account_credentials is
  'Sosyal hesap token deposu. RLS açık ve BİLEREK politikasız — sadece service_role (Edge Function) okur/yazar. Buraya politika EKLEMEYİN.';

notify pgrst, 'reload schema';
