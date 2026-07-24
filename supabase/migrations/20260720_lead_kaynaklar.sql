-- ============================================================
-- Müşteri Bulma — çoklu kaynak (Google Maps / Instagram / YouTube)
--
-- Mevcut modül yalnızca Google Maps'ten lead üretiyordu. Bu migration
-- aramaya bir "kaynak" (platform) ve "mod" (müşteri bul / kendi hesabım)
-- boyutu ekler; leads tablosuna da sosyal profil alanlarını taşır.
--
-- Tekilleştirme mevcut unique(user_id, place_id) üzerinden sürer:
--   maps      → place_id = Google placeId
--   instagram → place_id = "ig:<profil id>"
--   youtube   → place_id = "yt:<kanal handle>"
-- ============================================================

-- 1) lead_searches ------------------------------------------------
alter table public.lead_searches
  add column if not exists kaynak text not null default 'maps',
  add column if not exists mod    text not null default 'musteri',
  add column if not exists sorgu  text,
  add column if not exists sonuc  jsonb;

comment on column public.lead_searches.kaynak is 'maps | instagram | youtube';
comment on column public.lead_searches.mod    is 'musteri = lead üretimi, kendi = kendi hesap analizi';
comment on column public.lead_searches.sorgu  is 'Instagram/YouTube serbest arama sorgusu ya da hesap adı';
comment on column public.lead_searches.sonuc  is 'mod=kendi sonuçları (leads tablosuna yazılmaz)';

alter table public.lead_searches drop constraint if exists lead_searches_kaynak_check;
alter table public.lead_searches add constraint lead_searches_kaynak_check
  check (kaynak in ('maps', 'instagram', 'youtube'));

alter table public.lead_searches drop constraint if exists lead_searches_mod_check;
alter table public.lead_searches add constraint lead_searches_mod_check
  check (mod in ('musteri', 'kendi'));

-- Instagram/YouTube aramalarında "kategori" yerine "sorgu" kullanılıyor.
alter table public.lead_searches alter column kategori drop not null;

-- 2) leads --------------------------------------------------------
alter table public.leads
  add column if not exists kaynak        text not null default 'maps',
  add column if not exists kullanici_adi text,
  add column if not exists takipci       integer,
  add column if not exists profil_url    text;

comment on column public.leads.kullanici_adi is 'Instagram @kullanici / YouTube @handle';
comment on column public.leads.takipci       is 'Instagram takipçi / YouTube abone sayısı';

alter table public.leads drop constraint if exists leads_kaynak_check;
alter table public.leads add constraint leads_kaynak_check
  check (kaynak in ('maps', 'instagram', 'youtube'));

create index if not exists leads_kaynak_idx on public.leads(user_id, kaynak);

notify pgrst, 'reload schema';
