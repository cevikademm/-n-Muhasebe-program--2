-- ============================================================
-- sm_yayinlar — Yayın Kuyruğu (PRD Faz 4)
-- ============================================================
-- Bir medya + bir hesap = bir yayın işi. "Aynı görseli 3 platforma at"
-- isteği 3 SATIR üretir; tek satırda platform dizisi TUTULMAZ.
--
-- Gerekçe: platformlar bağımsız başarısız olur. Instagram yayınlanıp
-- YouTube patladığında tek satırlı model "kısmen başarılı" gibi anlamsız
-- bir duruma düşer; satır başına durum tutunca yalnızca patlayan hedef
-- yeniden denenebilir ve kullanıcı neyin nerede yayınlandığını görür.
--
-- Zamanlanmış yayın için `planlanan` sütunu şimdiden var ama bu fazda UI
-- yalnızca "şimdi yayınla" diyor — sonradan şema değişmesin diye eklendi.
-- ============================================================

create table if not exists public.sm_yayinlar (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  customer_id       uuid references public.companies(id) on delete cascade,

  media_id          uuid not null references public.sm_media(id)    on delete cascade,
  account_id        uuid not null references public.sm_accounts(id) on delete cascade,
  post_id           uuid references public.sm_posts(id) on delete set null,
  platform          text not null,

  -- ne olarak yayınlanacak
  format            text not null default 'feed'
                    check (format in ('feed','reel','story','video','short')),
  caption           text,

  -- yaşam döngüsü
  durum             text not null default 'kuyrukta'
                    check (durum in ('kuyrukta','yayinlaniyor','yayinlandi','hata','iptal')),
  planlanan         timestamptz,          -- NULL = hemen
  baslangic         timestamptz,
  bitis             timestamptz,
  deneme            integer not null default 0,

  -- platform tarafı
  harici_taslak_id  text,                 -- IG container / creation_id
  harici_post_id    text,
  yayin_url         text,
  hata              text,

  -- yayın sırasında üretilen geçici PUBLIC kopya (temizlik için saklanır)
  gecici_yol        text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists sm_yayinlar_user_idx
  on public.sm_yayinlar (user_id, customer_id, created_at desc);
create index if not exists sm_yayinlar_media_idx
  on public.sm_yayinlar (media_id);
create index if not exists sm_yayinlar_durum_idx
  on public.sm_yayinlar (user_id, durum);
-- Kuyruk tarayıcısı yalnızca bitmemiş işlere bakar → partial index yeter.
create index if not exists sm_yayinlar_acik_idx
  on public.sm_yayinlar (durum, planlanan)
  where durum in ('kuyrukta','yayinlaniyor');

drop trigger if exists sm_yayinlar_set_updated_at on public.sm_yayinlar;
create trigger sm_yayinlar_set_updated_at before update on public.sm_yayinlar
  for each row execute function public.update_updated_at_column();

-- RLS — diğer sm_* tablolarıyla birebir aynı desen.
-- NOT: harici_taslak_id/gecici_yol client'a görünür ama ikisi de sır değil:
-- taslak id yalnızca hesabın kendi token'ıyla kullanılabilir, geçici yol
-- yayından hemen sonra siliniyor.
alter table public.sm_yayinlar enable row level security;

drop policy if exists sm_yayinlar_select on public.sm_yayinlar;
drop policy if exists sm_yayinlar_insert on public.sm_yayinlar;
drop policy if exists sm_yayinlar_update on public.sm_yayinlar;
drop policy if exists sm_yayinlar_delete on public.sm_yayinlar;

create policy sm_yayinlar_select on public.sm_yayinlar for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_yayinlar_insert on public.sm_yayinlar for insert
  with check (user_id in (select effective_owner_ids()));
create policy sm_yayinlar_update on public.sm_yayinlar for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_yayinlar_delete on public.sm_yayinlar for delete
  using (user_id = auth.uid() or is_admin());

comment on table public.sm_yayinlar is
  'Yayın kuyruğu: medya × hesap başına tek satır. Platformlar bağımsız başarısız olabilsin diye dizi değil satır modeli kullanılır.';
comment on column public.sm_yayinlar.gecici_yol is
  'Yayın sırasında sm-yayin-gecici bucket''ına atılan public kopyanın yolu. Yayın bitince silinir; kalırsa sm-publish sonraki çağrıda süpürür.';

-- ============================================================
-- `sm-yayin-gecici` — yayın için geçici PUBLIC kopya bucket'ı
-- ============================================================
-- NEDEN: Instagram Graph API medyayı KENDİ sunucusundan çeker ve Composio
-- belgelerine göre sorgu parametreli (imzalı) URL'leri reddeder. `sm-media`
-- bucket'ı ise bilinçli olarak private ve yalnızca imzalı URL veriyor.
--
-- Çözüm: yayın anında dosyanın kopyası rastgele (tahmin edilemez) bir yola
-- bu public bucket'a yazılır, Instagram onu çeker, yayın biter bitmez kopya
-- silinir. Asıl kreatif hiçbir zaman public olmaz.
--
-- Yazma/silme yetkisi YOK: hiçbir politika tanımlanmadı → yalnızca
-- service_role (Edge Function) yazabilir. `public = true` sadece OKUMAYI açar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sm-yayin-gecici', 'sm-yayin-gecici', true,
  524288000,
  array[
    'image/jpeg','image/png','image/webp',
    'video/mp4','video/quicktime'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
