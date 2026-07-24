-- ============================================================
-- sm_seo_* — SEO Ajanı (başlık + caption + anahtar kelime odaklı hashtag)
-- ============================================================
-- Bugüne kadar metin tarafı TAMAMEN deterministikti: sm_otomasyon'daki elle
-- girilmiş havuzdan FNV-1a tohumuyla etiket seçiliyordu (otomasyonMetin.ts).
-- Havuzu kullanıcı dolduruyordu, yani "hangi kelime bu hafta çalışıyor"
-- bilgisi sisteme hiç girmiyordu. Bu üç tablo o boşluğu doldurur — mevcut
-- deterministik seçimi BOZMADAN üstüne bir AI katmanı koyar.
--
-- İKİ MOD (sm_seo_profil.hashtag_modu)
-- ------------------------------------
--   'havuz'   → AI yalnızca HAVUZU doldurur; gönderi anındaki seçim eskisi
--               gibi hashtagSec() ile deterministik kalır. Varsayılan.
--   'gonderi' → AI o gönderiye özel seti üretir; sonuç sm_seo_oneriler'e
--               YAZILIR ve hem önizleme hem yayın aynı satırı okur.
--
-- NEDEN ÖNERİ TABLOSU VAR
-- -----------------------
-- otomasyonMetin.ts'in sözleşmesi: "yayın modalinde gösterilen önizleme ile
-- gerçekten yayınlanan metin birebir aynı olmak ZORUNDA". AI çıktısı
-- deterministik değil, dolayısıyla bu ancak öneri BİR KEZ üretilip kalıcı
-- saklanarak korunabilir. Yayın anında asla senkron AI çağrısı yapılmaz.
-- ============================================================

-- ============================================================
-- sm_seo_profil — ajanın marka bağlamı
-- ============================================================
-- Ajanın "kim için, kime, hangi dilde yazıyorum" sorusunun tek cevabı.
-- sm_otomasyon gibi marka (user_id + customer_id) düzeyinde tanımlanır;
-- hesap düzeyinde DEĞİL — aynı markanın IG ve YouTube hesabı aynı sesi
-- paylaşır.
create table if not exists public.sm_seo_profil (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  customer_id        uuid references public.companies(id) on delete cascade,

  -- bağlam
  sektor             text,
  hedef_kitle        text,
  bolge              text not null default 'DE',       -- ISO ülke/bölge kodu
  diller             text[] not null default '{de}',   -- caption üretilecek diller
  marka_sesi         text,                              -- "samimi, jargonsuz, öğretici"

  -- kelime kontrolü
  cekirdek_kelimeler text[] not null default '{}',      -- her metinde geçmesi istenenler
  yasakli_kelimeler  text[] not null default '{}',      -- asla geçmemesi gerekenler
  rakip_hesaplar     text[] not null default '{}',      -- trend taramasında incelenecek
  cta_havuzu         text[] not null default '{}',

  -- davranış
  hashtag_modu       text not null default 'havuz'
                     check (hashtag_modu in ('havuz','gonderi')),
  baslik_uret        boolean not null default true,
  -- Üretim kütüphaneye düştüğünde öneri kendiliğinden hazırlansın mı?
  otomatik_uret      boolean not null default true,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- customer_id nullable ve Postgres'te NULL'lar birbirinden farklı sayıldığı
-- için düz composite unique yetmez → partial unique index ÇİFTİ
-- (sm_otomasyon'daki desenin aynısı).
create unique index if not exists sm_seo_profil_kendi_uq
  on public.sm_seo_profil (user_id) where customer_id is null;
create unique index if not exists sm_seo_profil_musteri_uq
  on public.sm_seo_profil (user_id, customer_id) where customer_id is not null;

drop trigger if exists sm_seo_profil_set_updated_at on public.sm_seo_profil;
create trigger sm_seo_profil_set_updated_at before update on public.sm_seo_profil
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- sm_seo_anahtarlar — trend taramasının çıktısı
-- ============================================================
-- Ajan web araması yaptığında bulduğu kelime/etiketleri buraya yazar.
-- 'havuz' modunun beslendiği yer: sm_otomasyon.hashtag_havuzu buradan
-- doldurulur. Ayrı tablo, çünkü havuz kullanıcının düzenleyebildiği NİHAİ
-- liste; bu ise ham araştırma verisi (skorlu, tarihli, tekrar taranabilir).
create table if not exists public.sm_seo_anahtarlar (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  customer_id    uuid references public.companies(id) on delete cascade,

  kelime         text not null,                     -- hashtag ise '#' ile normalize
  tur            text not null default 'hashtag'
                 check (tur in ('anahtar','hashtag')),
  platform       text not null default '*',         -- '*' = tüm platformlar
  dil            text not null default 'de',

  -- 0..100. Ajanın "bu kelime bizim için ne kadar değerli" tahmini;
  -- mutlak arama hacmi DEĞİL (o veriye erişimimiz yok, uydurulmaz).
  skor           numeric,
  hacim_notu     text,                              -- "orta hacim, düşük rekabet"
  kaynak         text,                              -- taramada kullanılan URL/gerekçe

  gecerlilik     timestamptz,                       -- bu tarihten sonra bayat
  son_tarama     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- Aynı kelimenin ikinci kez eklenmesini engelle → tarama upsert yapabilsin.
create unique index if not exists sm_seo_anahtar_kendi_uq
  on public.sm_seo_anahtarlar (user_id, platform, dil, kelime)
  where customer_id is null;
create unique index if not exists sm_seo_anahtar_musteri_uq
  on public.sm_seo_anahtarlar (user_id, customer_id, platform, dil, kelime)
  where customer_id is not null;

-- Havuz üretiminin tek sorgusu: "bu marka için en yüksek skorlu etiketler"
create index if not exists sm_seo_anahtar_skor_idx
  on public.sm_seo_anahtarlar (user_id, customer_id, tur, skor desc);

-- ============================================================
-- sm_seo_oneriler — üretilen öneri cache'i
-- ============================================================
-- Önizleme–yayın eşitliğinin taşıyıcısı. YayinModal bu satırı gösterir,
-- sm-publish AYNI satırı yayınlar. Satır yoksa sistem sessizce 'havuz'
-- moduna düşer; yayın beklemez.
create table if not exists public.sm_seo_oneriler (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  customer_id    uuid references public.companies(id) on delete cascade,

  -- Biri dolu olmak zorunda: medya kütüphanesindeki dosya ya da takvim satırı.
  media_id       uuid references public.sm_media(id) on delete cascade,
  post_id        uuid references public.sm_posts(id) on delete cascade,

  platform       text not null,
  format         text,                              -- feed | reel | story | video | short
  dil            text not null default 'de',

  baslik         text,
  caption        text,
  hashtagler     text[] not null default '{}',
  ilk_yorum      text,

  -- "Neden bu kelimeler?" — kullanıcıya gösterilir, denetim izi bırakır.
  gerekce        jsonb not null default '{}'::jsonb,

  model          text,
  girdi_token    integer,
  cikti_token    integer,

  durum          text not null default 'taslak'
                 check (durum in ('taslak','onayli','kullanildi')),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sm_seo_oneriler_hedef_check'
  ) then
    alter table public.sm_seo_oneriler
      add constraint sm_seo_oneriler_hedef_check
      check (media_id is not null or post_id is not null);
  end if;
end $$;

-- Aynı medya+platform+format+dil için ikinci öneri açılmasın: 'oneri-uret'
-- tekrar çağrıldığında upsert eder, yeni satır YARATMAZ. (Kısmi index —
-- sm_uretim_isleri.harici_job_id desenindeki gerekçenin aynısı: hedefin biri
-- her zaman NULL.)
create unique index if not exists sm_seo_oneri_media_uq
  on public.sm_seo_oneriler (user_id, media_id, platform, coalesce(format,''), dil)
  where media_id is not null;
create unique index if not exists sm_seo_oneri_post_uq
  on public.sm_seo_oneriler (user_id, post_id, platform, coalesce(format,''), dil)
  where post_id is not null and media_id is null;

create index if not exists sm_seo_oneri_user_idx
  on public.sm_seo_oneriler (user_id, customer_id, created_at desc);

drop trigger if exists sm_seo_oneriler_set_updated_at on public.sm_seo_oneriler;
create trigger sm_seo_oneriler_set_updated_at before update on public.sm_seo_oneriler
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- sm_yayinlar — SEO izleri
-- ============================================================
-- Yayınlanan başlık şimdiye kadar sm_media.baslik'ten okunuyordu; SEO ajanı
-- platform başına AYRI başlık üretiyor (YouTube'un 100 karakterlik arama
-- odaklı başlığı, Instagram'ın hiç başlığı yok). Bu yüzden başlık artık
-- yayın satırına yazılır — caption ve yorum_metni gibi.
alter table public.sm_yayinlar
  add column if not exists baslik        text,
  add column if not exists seo_oneri_id  uuid references public.sm_seo_oneriler(id) on delete set null;

comment on column public.sm_yayinlar.baslik is
  'Yayına giden başlık (YouTube). Satıra YAZILIR ki yeniden denemede değişmesin — caption/yorum_metni ile aynı gerekçe.';
comment on column public.sm_yayinlar.seo_oneri_id is
  'Metin SEO ajanından geldiyse kaynak öneri satırı. "Bu metni kim yazdı?" sorusunun cevabı.';

-- ============================================================
-- RLS — diğer sm_* tablolarıyla birebir aynı effective_owner_ids() deseni
-- ============================================================
alter table public.sm_seo_profil     enable row level security;
alter table public.sm_seo_anahtarlar enable row level security;
alter table public.sm_seo_oneriler   enable row level security;

drop policy if exists sm_seo_profil_select on public.sm_seo_profil;
drop policy if exists sm_seo_profil_insert on public.sm_seo_profil;
drop policy if exists sm_seo_profil_update on public.sm_seo_profil;
drop policy if exists sm_seo_profil_delete on public.sm_seo_profil;

create policy sm_seo_profil_select on public.sm_seo_profil for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_seo_profil_insert on public.sm_seo_profil for insert
  with check (user_id in (select effective_owner_ids()));
create policy sm_seo_profil_update on public.sm_seo_profil for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_seo_profil_delete on public.sm_seo_profil for delete
  using (user_id = auth.uid() or is_admin());

drop policy if exists sm_seo_anahtar_select on public.sm_seo_anahtarlar;
drop policy if exists sm_seo_anahtar_insert on public.sm_seo_anahtarlar;
drop policy if exists sm_seo_anahtar_update on public.sm_seo_anahtarlar;
drop policy if exists sm_seo_anahtar_delete on public.sm_seo_anahtarlar;

create policy sm_seo_anahtar_select on public.sm_seo_anahtarlar for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_seo_anahtar_insert on public.sm_seo_anahtarlar for insert
  with check (user_id in (select effective_owner_ids()));
create policy sm_seo_anahtar_update on public.sm_seo_anahtarlar for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_seo_anahtar_delete on public.sm_seo_anahtarlar for delete
  using (user_id = auth.uid() or is_admin());

drop policy if exists sm_seo_oneri_select on public.sm_seo_oneriler;
drop policy if exists sm_seo_oneri_insert on public.sm_seo_oneriler;
drop policy if exists sm_seo_oneri_update on public.sm_seo_oneriler;
drop policy if exists sm_seo_oneri_delete on public.sm_seo_oneriler;

create policy sm_seo_oneri_select on public.sm_seo_oneriler for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_seo_oneri_insert on public.sm_seo_oneriler for insert
  with check (user_id in (select effective_owner_ids()));
create policy sm_seo_oneri_update on public.sm_seo_oneriler for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_seo_oneri_delete on public.sm_seo_oneriler for delete
  using (user_id = auth.uid() or is_admin());

-- ============================================================
comment on table public.sm_seo_profil is
  'SEO ajanının marka bağlamı: sektör, hedef kitle, dil, marka sesi, yasaklı kelimeler. hashtag_modu ajanın havuzu mu yoksa tek tek gönderileri mi yazacağını belirler.';
comment on column public.sm_seo_profil.hashtag_modu is
  '''havuz'' = AI sm_otomasyon havuzunu doldurur, seçim deterministik kalır. ''gonderi'' = AI her gönderiye özel set üretir ve sm_seo_oneriler''e yazar.';
comment on column public.sm_seo_profil.yasakli_kelimeler is
  'Üretilen hiçbir başlık/caption/etikette geçmemesi gereken kelimeler. Prompt''ta sert kural olarak verilir, ayrıca çıktıda elle filtrelenir.';

comment on table public.sm_seo_anahtarlar is
  'Trend taramasının ham çıktısı. sm_otomasyon.hashtag_havuzu bu tablodan beslenir; havuz kullanıcının düzenlediği nihai liste, bu ise skorlu araştırma verisi.';
comment on column public.sm_seo_anahtarlar.skor is
  '0..100 arası ajan tahmini (değer × erişilebilirlik). Gerçek arama hacmi DEĞİL — o veriye erişimimiz yok, uydurulmaz.';

comment on table public.sm_seo_oneriler is
  'Üretilmiş başlık/caption/hashtag önerisinin kalıcı kopyası. Önizleme ve yayın AYNI satırı okur — otomasyonMetin.ts''teki "gördüğünden başkasını paylaşma" sözleşmesi bu tabloyla korunur.';
comment on column public.sm_seo_oneriler.gerekce is
  'Ajanın kelime seçim gerekçesi (kullanıcıya gösterilir, denetim izi bırakır).';

notify pgrst, 'reload schema';
