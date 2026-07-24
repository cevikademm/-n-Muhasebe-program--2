-- ============================================================
-- sm_otomasyon — otomatik hashtag + otomatik ilk yorum
-- ============================================================
-- Amaç: kullanıcı videoyu yükleyip "yayınla"ya bassın, gönderinin altına
-- düşen etiketler ve ilk yorum KENDİLİĞİNDEN oluşsun.
--
-- Neden ayrı tablo (sm_accounts'a kolon değil):
--   Kural marka/müşteri düzeyinde tanımlanır, hesap düzeyinde değil. Aynı
--   markanın Instagram ve YouTube hesabı aynı etiket havuzunu paylaşır;
--   hesap başına kopyalamak havuzu üç yerde güncelletirdi.
--
-- platform = '*'  → tüm platformlar için geçerli varsayılan kural
-- platform = 'instagram' → yalnızca o platformu ezen kural (opsiyonel)
-- Çözüm sırası: önce platformun kendi satırı, yoksa '*'.
-- (bkz. services/sosyal/otomasyonMetin.ts → kuralCoz)
-- ============================================================

create table if not exists public.sm_otomasyon (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  customer_id        uuid references public.companies(id) on delete cascade,

  -- '*' = tüm platformlar. NOT NULL tutuldu ki tekillik indeksleri
  -- yalnızca customer_id'nin NULL'lığıyla uğraşsın.
  platform           text not null default '*',
  aktif              boolean not null default true,

  -- etiketler '#' ile saklanır (normalize edilmiş hâlleri)
  hashtag_havuzu     text[] not null default '{}',
  sabit_hashtagler   text[] not null default '{}',
  hashtag_adet       integer not null default 8 check (hashtag_adet between 0 and 30),
  hashtag_yeri       text not null default 'yorum'
                     check (hashtag_yeri in ('caption','yorum','yok')),

  yorum_aktif        boolean not null default true,
  yorum_sablonlari   text[] not null default '{}',

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- customer_id nullable ve Postgres'te NULL'lar birbirinden farklı sayıldığı
-- için düz composite unique yetmez → partial unique index ÇİFTİ
-- (sm_multitenant migrasyonundaki desenin aynısı).
create unique index if not exists sm_otomasyon_kendi_uq
  on public.sm_otomasyon (user_id, platform) where customer_id is null;
create unique index if not exists sm_otomasyon_musteri_uq
  on public.sm_otomasyon (user_id, customer_id, platform) where customer_id is not null;

create index if not exists sm_otomasyon_user_idx
  on public.sm_otomasyon (user_id, customer_id);

drop trigger if exists sm_otomasyon_set_updated_at on public.sm_otomasyon;
create trigger sm_otomasyon_set_updated_at before update on public.sm_otomasyon
  for each row execute function public.update_updated_at_column();

alter table public.sm_otomasyon enable row level security;

drop policy if exists sm_otomasyon_select on public.sm_otomasyon;
drop policy if exists sm_otomasyon_insert on public.sm_otomasyon;
drop policy if exists sm_otomasyon_update on public.sm_otomasyon;
drop policy if exists sm_otomasyon_delete on public.sm_otomasyon;

create policy sm_otomasyon_select on public.sm_otomasyon for select
  using (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_otomasyon_insert on public.sm_otomasyon for insert
  with check (user_id in (select effective_owner_ids()));
create policy sm_otomasyon_update on public.sm_otomasyon for update
  using (user_id in (select effective_owner_ids()) or is_admin())
  with check (user_id in (select effective_owner_ids()) or is_admin());
create policy sm_otomasyon_delete on public.sm_otomasyon for delete
  using (user_id = auth.uid() or is_admin());

comment on table public.sm_otomasyon is
  'Otomatik hashtag + ilk yorum kuralları. Marka (user_id + customer_id) başına, opsiyonel platform ezmesiyle.';
comment on column public.sm_otomasyon.hashtag_adet is
  'Sabitler DÂHİL toplam etiket adedi. Instagram bir gönderide en fazla 30 etiket sayar.';
comment on column public.sm_otomasyon.yorum_sablonlari is
  'Sırayla dönen ilk yorum şablonları. {baslik} {handle} {hashtag} yer tutucuları desteklenir.';

-- ============================================================
-- sm_yayinlar — ilk yorumun kendi yaşam döngüsü
-- ============================================================
-- Yorum, yayının BAŞARISINI belirlemez: gönderi yayınlandıysa iş başarılıdır,
-- yorum ayrıca izlenir ve ayrıca yeniden denenir. Aksi hâlde yorum hatası
-- yüzünden "tekrar dene"ye basan kullanıcı videoyu İKİNCİ KEZ yayınlardı.
alter table public.sm_yayinlar
  add column if not exists yorum_metni          text,
  add column if not exists yorum_durum          text not null default 'yok',
  add column if not exists yorum_deneme         integer not null default 0,
  add column if not exists harici_yorum_id      text,
  add column if not exists yorum_hata           text,
  add column if not exists uygulanan_hashtagler text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sm_yayinlar_yorum_durum_check'
  ) then
    alter table public.sm_yayinlar
      add constraint sm_yayinlar_yorum_durum_check
      check (yorum_durum in ('yok','bekliyor','yazildi','hata','desteklenmiyor'));
  end if;
end $$;

-- Yorumu bekleyen satırlar kuyruk tarayıcısının ikinci iş listesi.
create index if not exists sm_yayinlar_yorum_bekleyen_idx
  on public.sm_yayinlar (user_id, yorum_durum)
  where yorum_durum = 'bekliyor';

comment on column public.sm_yayinlar.yorum_metni is
  'Yayın anında sm_otomasyon kuralından üretilen ilk yorum. Satıra YAZILIR ki yeniden denemede metin değişmesin.';
comment on column public.sm_yayinlar.uygulanan_hashtagler is
  'Otomasyonun bu gönderiye eklediği etiketler — denetim ve "neden bu etiketler çıktı?" sorusu için.';

notify pgrst, 'reload schema';
