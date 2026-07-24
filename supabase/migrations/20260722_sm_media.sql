-- ============================================================
-- sm_media — Medya Kütüphanesi (PRD Faz 2)
-- ============================================================
-- Sistemin kalbi: tüm AI üretimleri ve elle yüklenen varlıklar burada.
-- Dosyanın kendisi bir storage ADAPTER'ının arkasında durur (`depo_surucu`
-- + `depo_yolu`); bu tablo yalnızca metadata + adaptöre verilecek anahtarı
-- tutar. Böylece Supabase Storage → S3/R2 geçişi tek satır kod değiştirmeden
-- yapılabilir (PRD "Storage Layer" gereği).
--
-- Alan adları mevcut sm_* konvansiyonunu izler (Türkçe); AI üretim
-- parametreleri (prompt, seed, cfg, steps) sektör terimi olduğu için İngilizce.
-- ============================================================

create table if not exists public.sm_media (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  customer_id     uuid references public.companies(id) on delete cascade,

  -- tanım
  baslik          text,
  aciklama        text,

  -- AI üretim izi
  prompt          text,
  negative_prompt text,
  provider        text,              -- higgsfield | openai | gemini | manuel
  model           text,
  seed            bigint,
  cfg             numeric,
  steps           integer,

  -- dosya (adapter'a özel anahtar — mutlak URL DEĞİL, imzalı URL üretilir)
  depo_surucu     text not null default 'supabase',
  depo_yolu       text not null,
  mime_tipi       text,
  boyut           bigint,            -- byte
  cozunurluk      text,              -- "1080x1920"
  sure            numeric,           -- saniye (video)
  fps             integer,
  thumbnail_yolu  text,

  -- organizasyon
  durum           text not null default 'taslak'
                  check (durum in ('taslak','hazir','onayda','onaylandi','yayinlandi','arsiv')),
  favori          boolean not null default false,
  etiketler       text[] not null default '{}',
  post_id         uuid references public.sm_posts(id) on delete set null,

  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Aynı dosyanın iki kez kaydedilmesini engelle (yükleme retry'ı sonrası)
create unique index if not exists sm_media_depo_yolu_uniq
  on public.sm_media (depo_surucu, depo_yolu);

create index if not exists sm_media_user_idx
  on public.sm_media (user_id, customer_id, created_at desc);
create index if not exists sm_media_durum_idx
  on public.sm_media (user_id, durum);
create index if not exists sm_media_post_idx
  on public.sm_media (post_id) where post_id is not null;
-- Etiket filtresi dizi üzerinde çalışır → GIN
create index if not exists sm_media_etiketler_idx
  on public.sm_media using gin (etiketler);

drop trigger if exists sm_media_set_updated_at on public.sm_media;
create trigger sm_media_set_updated_at before update on public.sm_media
  for each row execute function public.update_updated_at_column();

-- RLS — diğer sm_* tablolarıyla birebir aynı effective_owner_ids() deseni
alter table public.sm_media enable row level security;

drop policy if exists sm_media_select on public.sm_media;
drop policy if exists sm_media_insert on public.sm_media;
drop policy if exists sm_media_update on public.sm_media;
drop policy if exists sm_media_delete on public.sm_media;

create policy sm_media_select on public.sm_media for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_media_insert on public.sm_media for insert
  with check (user_id in (select effective_owner_ids()));
create policy sm_media_update on public.sm_media for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_media_delete on public.sm_media for delete
  using (user_id = auth.uid() or is_admin());

comment on table public.sm_media is
  'Medya kütüphanesi. Dosya içeriği storage adapter arkasında; burada metadata + depo anahtarı durur.';
comment on column public.sm_media.depo_yolu is
  'Adapter''a özel anahtar (Supabase Storage''da object path). İmzalı URL çalışma anında üretilir.';

notify pgrst, 'reload schema';
