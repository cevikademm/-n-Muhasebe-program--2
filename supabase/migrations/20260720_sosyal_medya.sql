-- ============================================================
-- Sosyal Medya Büyüme Agent'ı (/sosyal-medya)
-- sm_setup_steps, sm_accounts, sm_content_pillars, sm_posts, sm_metrics
-- Takım farkındalıklı RLS — leads/invoices ile aynı effective_owner_ids() deseni
-- ============================================================

-- 1) sm_setup_steps — 23 adımlık kurulum checklist'i ---------------
create table if not exists public.sm_setup_steps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  adim_no      integer not null,
  faz          text    not null,
  baslik       text    not null,
  durum        text    not null default 'bekliyor'
               check (durum in ('bekliyor','devam','tamam','atlandi')),
  notlar       text,
  ciktilar     jsonb   not null default '{}'::jsonb,
  tamamlanma   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, adim_no)
);
create index if not exists sm_setup_steps_user_idx on public.sm_setup_steps(user_id, adim_no);

-- 2) sm_accounts — açılan sosyal medya hesapları -------------------
create table if not exists public.sm_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  platform      text not null
                check (platform in ('facebook','instagram','youtube','tiktok','linkedin','x','pinterest')),
  handle        text,
  url           text,
  hesap_tipi    text,                       -- personal | page | business | creator | brand_account
  harici_id     text,                       -- FB Page ID / IG Business ID / YT Channel ID
  durum         text not null default 'planlandi'
                check (durum in ('planlandi','acildi','optimize','aktif','askida')),
  dogrulandi    boolean not null default false,
  notlar        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, platform, handle)
);
create index if not exists sm_accounts_user_idx on public.sm_accounts(user_id, platform);

-- 3) sm_content_pillars — içerik sütunları + hook bankası ----------
create table if not exists public.sm_content_pillars (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  pillar         text not null,
  aciklama       text,
  hedef_kitle    text,
  oran_yuzde     integer default 33,        -- takvimdeki ağırlığı
  ornek_hooklar  text[] not null default '{}',
  created_at     timestamptz not null default now(),
  unique (user_id, pillar)
);
create index if not exists sm_content_pillars_user_idx on public.sm_content_pillars(user_id);

-- 4) sm_posts — içerik takvimi -------------------------------------
create table if not exists public.sm_posts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  pillar_id         uuid references public.sm_content_pillars(id) on delete set null,
  planlanan_tarih   timestamptz,
  platformlar       text[] not null default '{}',      -- {instagram,facebook,youtube}
  format            text,                              -- reel | short | uzun_video | carousel | story | tekli_gorsel
  hook              text,
  caption_de        text,
  caption_tr        text,
  caption_en        text,
  hashtagler        text[] not null default '{}',
  cta               text,
  asset_url         text,
  higgsfield_job    text,
  uretim_notu       text,
  durum             text not null default 'fikir'
                    check (durum in ('fikir','uretimde','hazir','planlandi','yayinlandi','iptal')),
  yayin_urlleri     jsonb not null default '{}'::jsonb, -- {"instagram":"https://...","youtube":"..."}
  yayin_tarihi      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists sm_posts_user_idx    on public.sm_posts(user_id, planlanan_tarih);
create index if not exists sm_posts_durum_idx   on public.sm_posts(user_id, durum);

-- 5) sm_metrics — günlük snapshot ----------------------------------
create table if not exists public.sm_metrics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  tarih           date not null,
  platform        text not null,
  takipci         integer,
  takipci_artis   integer,
  erisim          integer,
  gosterim        integer,
  etkilesim       integer,
  profil_ziyaret  integer,
  link_tik        integer,
  izlenme_suresi  numeric,                   -- YouTube: saat
  raw             jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (user_id, tarih, platform)
);
create index if not exists sm_metrics_user_idx on public.sm_metrics(user_id, platform, tarih desc);

-- 6) updated_at trigger'ları (mevcut fn yeniden kullanılır) --------
drop trigger if exists sm_setup_steps_set_updated_at on public.sm_setup_steps;
create trigger sm_setup_steps_set_updated_at before update on public.sm_setup_steps
  for each row execute function public.update_updated_at_column();

drop trigger if exists sm_accounts_set_updated_at on public.sm_accounts;
create trigger sm_accounts_set_updated_at before update on public.sm_accounts
  for each row execute function public.update_updated_at_column();

drop trigger if exists sm_posts_set_updated_at on public.sm_posts;
create trigger sm_posts_set_updated_at before update on public.sm_posts
  for each row execute function public.update_updated_at_column();

-- 7) RLS ------------------------------------------------------------
alter table public.sm_setup_steps     enable row level security;
alter table public.sm_accounts        enable row level security;
alter table public.sm_content_pillars enable row level security;
alter table public.sm_posts           enable row level security;
alter table public.sm_metrics         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sm_setup_steps','sm_accounts','sm_content_pillars','sm_posts','sm_metrics']
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);

    execute format($f$create policy %I_select on public.%I for select
      using (user_id in (select effective_owner_ids()) or is_admin())$f$, t, t);
    execute format($f$create policy %I_insert on public.%I for insert
      with check (user_id in (select effective_owner_ids()))$f$, t, t);
    execute format($f$create policy %I_update on public.%I for update
      using (user_id in (select effective_owner_ids()) or is_admin())
      with check (user_id in (select effective_owner_ids()) or is_admin())$f$, t, t);
    execute format($f$create policy %I_delete on public.%I for delete
      using (user_id = auth.uid() or is_admin())$f$, t, t);
  end loop;
end $$;

-- 8) 23 adımın seed fonksiyonu --------------------------------------
-- Skill ilk çalıştığında çağırır: select public.sm_seed_setup_steps('<user_uuid>');
-- Idempotent: mevcut adımların durumunu/notlarını BOZMAZ.
create or replace function public.sm_seed_setup_steps(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  -- service_role dışındaki çağrılarda sadece kendi/takım sahibi id'sine izin ver
  if auth.role() is distinct from 'service_role'
     and p_user_id not in (select effective_owner_ids()) then
    raise exception 'yetkisiz: sadece kendi kullanicin icin seed atabilirsin';
  end if;

  insert into public.sm_setup_steps (user_id, adim_no, faz, baslik)
  values
    (p_user_id,  1, 'FAZ 0 · Temel',              'Marka kimliğini kilitle'),
    (p_user_id,  2, 'FAZ 0 · Temel',              'Handle rezervasyonu + marka e-postası'),
    (p_user_id,  3, 'FAZ 0 · Temel',              'Görsel kimlik ve marka kiti'),
    (p_user_id,  4, 'FAZ 0 · Temel',              'Bio yazımı (DE ana + TR/EN)'),
    (p_user_id,  5, 'FAZ 0 · Temel',              'Dönüşüm yolu ve lead magnet'),
    (p_user_id,  6, 'FAZ 1 · Meta',               'Kişisel Facebook profili aç'),
    (p_user_id,  7, 'FAZ 1 · Meta',               'Facebook Sayfası aç'),
    (p_user_id,  8, 'FAZ 1 · Meta',               'Meta Business Suite kurulumu'),
    (p_user_id,  9, 'FAZ 1 · Meta',               'Sayfa ayarları + Impressum'),
    (p_user_id, 10, 'FAZ 1 · Meta',               'Reklam hesabı + Pixel'),
    (p_user_id, 11, 'FAZ 2 · Instagram',          'Instagram hesabı aç'),
    (p_user_id, 12, 'FAZ 2 · Instagram',          'Professional hesaba geç + FB Sayfası bağla'),
    (p_user_id, 13, 'FAZ 2 · Instagram',          'Profil optimizasyonu + Highlights'),
    (p_user_id, 14, 'FAZ 2 · Instagram',          'Açılış içeriği: ilk 9 grid + 3 Reels'),
    (p_user_id, 15, 'FAZ 2 · Instagram',          'Yasal uyum: Impressum, Werbekennzeichnung, AI etiketi'),
    (p_user_id, 16, 'FAZ 3 · YouTube',            'Google Brand Account + YouTube kanalı'),
    (p_user_id, 17, 'FAZ 3 · YouTube',            'Kanal kimliği: banner, handle, açıklama, fragman'),
    (p_user_id, 18, 'FAZ 3 · YouTube',            'Kanal ayarları: dil, ülke, altyazı, monetization hazırlığı'),
    (p_user_id, 19, 'FAZ 3 · YouTube',            'Playlist mimarisi + ilk 3 video + Shorts'),
    (p_user_id, 20, 'FAZ 4 · Üretim & Otomasyon', 'Higgsfield üretim hattı'),
    (p_user_id, 21, 'FAZ 4 · Üretim & Otomasyon', '30 günlük içerik takvimi + batch üretim'),
    (p_user_id, 22, 'FAZ 4 · Üretim & Otomasyon', 'Yayınlama otomasyonu (Meta + YouTube API)'),
    (p_user_id, 23, 'FAZ 4 · Üretim & Otomasyon', 'Ölçüm döngüsü + 90 günlük hedefler')
  on conflict (user_id, adim_no) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke all on function public.sm_seed_setup_steps(uuid) from public, anon;
grant execute on function public.sm_seed_setup_steps(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
