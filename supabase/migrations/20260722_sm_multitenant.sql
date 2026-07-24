-- ============================================================
-- Sosyal Medya OS — çok kiracılılık (ajans modu)
-- ============================================================
-- sm_* tabloları bugüne kadar yalnızca `user_id` ile anahtarlıydı: tek marka.
-- PRD'nin Customer → hesaplar ağacı için her satır bir MÜŞTERİYE bağlanmalı.
-- Bu uygulamada "müşteri" zaten `public.companies`.
--
--   customer_id IS NULL  → "kendi markam"  (mevcut satırlar; /sosyal-medya skill'i)
--   customer_id NOT NULL → ajans müşterisi
--
-- Mevcut veri korunur: kolon nullable eklenir, hiçbir satır güncellenmez.
-- ============================================================

-- 1) customer_id kolonları ------------------------------------------
alter table public.sm_accounts
  add column if not exists customer_id uuid references public.companies(id) on delete cascade;
alter table public.sm_posts
  add column if not exists customer_id uuid references public.companies(id) on delete cascade;
alter table public.sm_content_pillars
  add column if not exists customer_id uuid references public.companies(id) on delete cascade;
alter table public.sm_metrics
  add column if not exists customer_id uuid references public.companies(id) on delete cascade;
alter table public.sm_post_metrics
  add column if not exists customer_id uuid references public.companies(id) on delete cascade;

-- sm_setup_steps bilinçli olarak HARİÇ: 23 adımlık kurulum sihirbazı
-- operatörün kendi onboarding'i, müşteri başına tekrarlanan bir şey değil.

comment on column public.sm_accounts.customer_id is
  'NULL = kendi markam; dolu = companies(id) müşterisinin markası.';

-- 2) Müşteri bazlı sorgu indeksleri ---------------------------------
create index if not exists sm_accounts_customer_idx       on public.sm_accounts(user_id, customer_id);
create index if not exists sm_posts_customer_idx          on public.sm_posts(user_id, customer_id, planlanan_tarih);
create index if not exists sm_content_pillars_customer_idx on public.sm_content_pillars(user_id, customer_id);
create index if not exists sm_metrics_customer_idx        on public.sm_metrics(user_id, customer_id, tarih desc);
create index if not exists sm_post_metrics_customer_idx   on public.sm_post_metrics(user_id, customer_id, yayin_tarihi desc);

-- 3) Unique kısıtları — yalnızca GERÇEKTEN çakışanlar ---------------
--
-- Her tabloyu tek tek düşünmek gerekti; hepsine aynı şey uygulanmaz:
--
--   sm_accounts  (user_id, platform, handle)  → DEĞİŞMEZ.
--       Bir handle gerçek dünyada tek bir hesaba aittir; customer_id eklemek
--       aynı handle'ın iki müşteriye bağlanmasına izin verirdi — bu bir veri
--       giriş hatasıdır, desteklenecek bir senaryo değil.
--
--   sm_post_metrics (user_id, medya_id, olcum_tarihi) → DEĞİŞMEZ.
--       medya_id Instagram genelinde benzersiz; doğal anahtar zaten o.
--       customer_id eklemek aynı gönderinin iki kez yazılmasına kapı açardı.
--
--   sm_metrics (user_id, tarih, platform) → ÇAKIŞIR, düzeltilir.
--       İki müşterinin de Instagram'ı varsa aynı günün snapshot'ı çarpışır.
--
--   sm_content_pillars (user_id, pillar) → ÇAKIŞIR, düzeltilir.
--       İki müşteride birden "Eğitim" pillar'ı olması tamamen normal.
--
-- customer_id nullable olduğu ve Postgres'te NULL'lar birbirinden farklı
-- sayıldığı için düz composite unique yetmez → partial unique index ÇİFTİ.

-- 3a) sm_metrics
alter table public.sm_metrics
  drop constraint if exists sm_metrics_user_id_tarih_platform_key;
create unique index if not exists sm_metrics_uniq_musteri
  on public.sm_metrics (user_id, customer_id, tarih, platform)
  where customer_id is not null;
create unique index if not exists sm_metrics_uniq_kendi
  on public.sm_metrics (user_id, tarih, platform)
  where customer_id is null;

-- 3b) sm_content_pillars
alter table public.sm_content_pillars
  drop constraint if exists sm_content_pillars_user_id_pillar_key;
create unique index if not exists sm_content_pillars_uniq_musteri
  on public.sm_content_pillars (user_id, customer_id, pillar)
  where customer_id is not null;
create unique index if not exists sm_content_pillars_uniq_kendi
  on public.sm_content_pillars (user_id, pillar)
  where customer_id is null;

-- 4) sm_post_ranking — müşteri bazlı medyan --------------------------
-- Görünüm `h.*` yaydığı için customer_id kendiliğinden geliyor, AMA karar
-- etiketini üreten medyan lateral join'i müşteri bazında bölünmezse bir
-- müşterinin gönderileri diğerinin medyanını kirletir ve "çoğalt/bırak"
-- etiketleri yanlış çıkar. Bölme koşulu bu yüzden eklendi.
-- (Kolon seti değiştiği için replace değil drop+create gerekiyor.)
drop view if exists public.sm_post_ranking;
create view public.sm_post_ranking
with (security_invoker = on) as
with son as (
  select distinct on (user_id, medya_id) *
    from public.sm_post_metrics
   order by user_id, medya_id, olcum_tarihi desc
),
hesapli as (
  select s.*,
         round(100.0 * (coalesce(s.kaydetme,0) + coalesce(s.paylasim,0))
               / nullif(s.erisim,0), 2)                          as yayilma_skoru,
         round(100.0 * coalesce(s.kaydetme,0) / nullif(s.erisim,0), 2) as kaydetme_orani,
         round(100.0 * coalesce(s.paylasim,0) / nullif(s.erisim,0), 2) as paylasim_orani,
         round(100.0 * (coalesce(s.begeni,0) + coalesce(s.yorum,0)
                      + coalesce(s.kaydetme,0) + coalesce(s.paylasim,0))
               / nullif(s.erisim,0), 2)                          as etkilesim_orani,
         (s.erisim >= 50)                                        as yeterli_veri,
         extract(day from now() - s.yayin_tarihi)::int           as yas_gun
    from son s
)
select h.*,
       med.medyan_yayilma,
       case
         when not h.yeterli_veri                                    then 'veri-az'
         when med.medyan_yayilma is null or med.medyan_yayilma = 0  then 'izle'
         when h.yayilma_skoru >= 2 * med.medyan_yayilma             then 'çoğalt'
         when h.yayilma_skoru >= med.medyan_yayilma                 then 'koru'
         when h.yayilma_skoru <  0.5 * med.medyan_yayilma           then 'bırak'
         else 'izle'
       end                                                          as karar
  from hesapli h
  left join lateral (
    select round(percentile_cont(0.5) within group (order by x.yayilma_skoru)::numeric, 2)
             as medyan_yayilma
      from hesapli x
     where x.user_id = h.user_id
       and x.platform = h.platform
       -- müşteri bazlı bölme: NULL (kendi markam) da kendi içinde eşleşsin
       and x.customer_id is not distinct from h.customer_id
       and x.yeterli_veri
  ) med on true;

comment on view public.sm_post_ranking is
  'Gönderi başına en son ölçüm + yayilma_skoru ((kaydetme+paylaşım)/erişim) ve müşteri bazlı medyana göre karar etiketi.';

notify pgrst, 'reload schema';
