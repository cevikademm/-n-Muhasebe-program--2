-- ============================================================
-- sm_uretim_isleri — Üretim Kuyruğu (Higgsfield → kütüphane)
-- ============================================================
-- Takvimdeki bir gönderi (sm_posts) ile medya kütüphanesi (sm_media)
-- arasındaki boşluğu dolduran ara tablo: "ne üretilecek" burada durur,
-- "ne üretildi" sm_media'ya düşer.
--
-- İKİ MOTOR, TEK KUYRUK
-- ---------------------
-- Higgsfield'in genel REST API'si yalnızca text2image / image2video / speak
-- sunuyor; Almanca seslendirmeli + yanmış altyazılı TAM REELS ise yalnızca
-- MCP tarafında üretilebiliyor (generate_video ×N + generate_audio ×N →
-- explainer_video). Bu yüzden işi kimin alacağını `motor` sütunu söyler:
--
--   motor='mcp'  → Claude oturumu kuyruğu çeker, üretir, ice-aktar'a yollar
--   motor='api'  → pg_cron + sm-uret-api fonksiyonu (hf anahtarı geldiğinde)
--
-- İkisi de aynı satırları, aynı durumları ve aynı `ice-aktar` ucunu kullanır.
-- İkinci motor açıldığında bu şema DEĞİŞMEZ.
--
-- REELS = ANA İŞ + BLOKLAR
-- ------------------------
-- Bir Reels tek bir üretim değil: 3-5 klip + her klibe bir seslendirme, sonra
-- birleştirme. Bloklar `ust_is_id` ile ana işe (tur='reels') bağlanır ve
-- `sira` alanı explainer_video'ya verilecek oynatma sırasını tutar. Ana iş
-- ancak tüm blokları tamamlanınca birleştirilir.
-- ============================================================

create table if not exists public.sm_uretim_isleri (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  customer_id     uuid references public.companies(id) on delete cascade,

  -- takvim bağı: iş hangi gönderi için üretiliyor
  post_id         uuid references public.sm_posts(id) on delete cascade,

  -- reels blok hiyerarşisi
  ust_is_id       uuid references public.sm_uretim_isleri(id) on delete cascade,
  sira            integer not null default 0,

  tur             text not null
                  check (tur in ('gorsel','klip','ses','reels')),
  motor           text not null default 'mcp'
                  check (motor in ('mcp','api')),

  saglayici       text not null default 'higgsfield',
  model           text,
  prompt          text,
  negative_prompt text,
  -- aspect_ratio, duration, sahne kodu (S1..S10), ses id, altyazı fontu…
  params          jsonb not null default '{}'::jsonb,

  -- Higgsfield job/request id — üretim tetiklendikten SONRA yazılır.
  harici_job_id   text,

  durum           text not null default 'bekliyor'
                  check (durum in ('bekliyor','alindi','uretiliyor','tamam','hata','iptal')),
  planlanan       timestamptz,          -- NULL = hemen üretilebilir
  sonuc_url       text,
  media_id        uuid references public.sm_media(id) on delete set null,
  hata            text,
  kredi           numeric,              -- gerçekleşen kredi maliyeti
  deneme          integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Aynı Higgsfield işinin iki kez içe aktarılmasını engelle. Kısmi index:
-- iş tetiklenmeden önce harici_job_id NULL olduğu için tümü çakışırdı.
create unique index if not exists sm_uretim_harici_job_uniq
  on public.sm_uretim_isleri (user_id, harici_job_id)
  where harici_job_id is not null;

-- Kuyruk tarayıcısının tek sorgusu: "bu motorda, zamanı gelmiş, bekleyen işler"
create index if not exists sm_uretim_kuyruk_idx
  on public.sm_uretim_isleri (motor, durum, planlanan)
  where durum in ('bekliyor','alindi','uretiliyor');
create index if not exists sm_uretim_user_idx
  on public.sm_uretim_isleri (user_id, customer_id, created_at desc);
create index if not exists sm_uretim_post_idx
  on public.sm_uretim_isleri (post_id) where post_id is not null;
create index if not exists sm_uretim_ust_idx
  on public.sm_uretim_isleri (ust_is_id, sira) where ust_is_id is not null;

drop trigger if exists sm_uretim_set_updated_at on public.sm_uretim_isleri;
create trigger sm_uretim_set_updated_at before update on public.sm_uretim_isleri
  for each row execute function public.update_updated_at_column();

-- RLS — diğer sm_* tablolarıyla birebir aynı effective_owner_ids() deseni.
alter table public.sm_uretim_isleri enable row level security;

drop policy if exists sm_uretim_select on public.sm_uretim_isleri;
drop policy if exists sm_uretim_insert on public.sm_uretim_isleri;
drop policy if exists sm_uretim_update on public.sm_uretim_isleri;
drop policy if exists sm_uretim_delete on public.sm_uretim_isleri;

create policy sm_uretim_select on public.sm_uretim_isleri for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_uretim_insert on public.sm_uretim_isleri for insert
  with check (user_id in (select effective_owner_ids()));
create policy sm_uretim_update on public.sm_uretim_isleri for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_uretim_delete on public.sm_uretim_isleri for delete
  using (user_id = auth.uid() or is_admin());

comment on table public.sm_uretim_isleri is
  'Üretim kuyruğu: takvimdeki gönderi için hangi görsel/klip/ses/reels üretilecek. motor sütunu işi MCP oturumunun mu yoksa pg_cron+API işçisinin mi alacağını belirler.';
comment on column public.sm_uretim_isleri.ust_is_id is
  'Reels blokları ana işe (tur=''reels'') bağlanır; sira alanı explainer_video items sırasıdır.';
comment on column public.sm_uretim_isleri.harici_job_id is
  'Higgsfield job/request id. Kısmi unique index ile aynı üretimin iki kez içe aktarılması engellenir.';

-- ============================================================
-- sm_media — üretim izi kolonları
-- ============================================================
-- provider/model/prompt zaten vardı; eksik olan, üretilen dosyanın HANGİ
-- Higgsfield işinden geldiğiydi. Bu olmadan yeniden çalıştırılan bir içe
-- aktarma aynı videoyu ikinci kez kütüphaneye ekler.
alter table public.sm_media
  add column if not exists harici_job_id text,
  add column if not exists kaynak_url    text;

create unique index if not exists sm_media_harici_job_uniq
  on public.sm_media (user_id, harici_job_id)
  where harici_job_id is not null;

comment on column public.sm_media.harici_job_id is
  'Üretim sağlayıcısının (Higgsfield) job id''si. Tekrarlı ice-aktar çağrısı yeni satır açmaz.';
comment on column public.sm_media.kaynak_url is
  'İndirilen orijinal URL. Sağlayıcıda süreli olduğu için yalnızca iz amaçlıdır, okumak için kullanılmaz.';

notify pgrst, 'reload schema';
