-- ══════════════════════════════════════════════════════════════════
-- FikoAI — Modül (Paket) Yetkilendirme Sistemi
-- ══════════════════════════════════════════════════════════════════
-- Üç platform ayrı ayrı satılıyor: muhasebe · musteri_bulma · sosyal_medya.
-- Bu migration yetkiyi VERİTABANI seviyesinde uygular; arayüzdeki gizleme
-- yalnızca kozmetiktir.
--
--   1) kullanici_modulleri  — kim hangi modüle sahip
--   2) modul_acik()         — RLS'in sorduğu tek fonksiyon
--   3) RESTRICTIVE modül kapıları (neden restrictive olduğu §3'te)
--   4) davetler             — tek kullanımlık token ile hesap açma
--   5) modul_talepleri      — kullanıcı yükseltme talebi
--   6) Mevcut izolasyon açıklarının kapatılması
--   7) audit_team_isolation() genişletmesi
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1) kullanici_modulleri
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kullanici_modulleri (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modul          text NOT NULL CHECK (modul IN ('muhasebe','musteri_bulma','sosyal_medya')),
  durum          text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif','pasif')),
  baslangic      timestamptz NOT NULL DEFAULT now(),
  bitis          timestamptz,                    -- NULL = süresiz
  kaynak         text NOT NULL DEFAULT 'admin' CHECK (kaynak IN ('davet','admin','talep')),
  veren_user_id  uuid REFERENCES auth.users(id),
  not_           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, modul)
);

COMMENT ON TABLE public.kullanici_modulleri IS
  'Kullanıcının satın aldığı/kendisine açılan platform modülleri. Yalnızca admin veya service-role yazar.';

CREATE INDEX IF NOT EXISTS kullanici_modulleri_aktif_idx
  ON public.kullanici_modulleri(user_id, modul) WHERE durum = 'aktif';

ALTER TABLE public.kullanici_modulleri ENABLE ROW LEVEL SECURITY;

-- Okuma: kendi satırların + (staff isen) bağlı olduğun sahibin satırları.
-- Alt kullanıcı sahibinin paketlerini devralır; ayrıca yetki verilmez.
DROP POLICY IF EXISTS km_select ON public.kullanici_modulleri;
CREATE POLICY km_select ON public.kullanici_modulleri
  FOR SELECT USING (
    user_id IN (SELECT public.effective_owner_ids()) OR public.is_admin()
  );

-- Yazma: SADECE admin. Kullanıcı kendine paket açamaz.
-- Davet/talep akışları service-role ile yazar (RLS'i zaten atlar).
DROP POLICY IF EXISTS km_admin_write ON public.kullanici_modulleri;
CREATE POLICY km_admin_write ON public.kullanici_modulleri
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 2) modul_acik(text) — RLS'in tek soru sorduğu yer
-- ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: kullanici_modulleri'nin kendi RLS'ine takılmadan bakar
-- (aksi halde politika kendi kendini sorgulayan bir döngüye girerdi).
CREATE OR REPLACE FUNCTION public.modul_acik(p_modul text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.kullanici_modulleri km
     WHERE km.user_id IN (SELECT public.effective_owner_ids())
       AND km.modul = p_modul
       AND km.durum = 'aktif'
       AND (km.bitis IS NULL OR km.bitis > now())
  );
$$;
REVOKE ALL ON FUNCTION public.modul_acik(text) FROM public;
GRANT EXECUTE ON FUNCTION public.modul_acik(text) TO authenticated;

-- İstemcinin tek çağrıda listeyi alması için (useModuller hook'u kullanır).
CREATE OR REPLACE FUNCTION public.aktif_modullerim()
RETURNS TABLE(modul text, bitis timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT km.modul, min(km.bitis)
    FROM public.kullanici_modulleri km
   WHERE km.user_id IN (SELECT public.effective_owner_ids())
     AND km.durum = 'aktif'
     AND (km.bitis IS NULL OR km.bitis > now())
   GROUP BY km.modul;
$$;
REVOKE ALL ON FUNCTION public.aktif_modullerim() FROM public;
GRANT EXECUTE ON FUNCTION public.aktif_modullerim() TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 3) Modül kapıları — RESTRICTIVE politikalar
-- ──────────────────────────────────────────────────────────────────
-- NEDEN RESTRICTIVE:
-- Bu tablolarda yıllar içinde üst üste binmiş PERMISSIVE politikalar var
-- (örn. invoices'ta hem "Kullanıcılar sadece kendi faturalarını görebilir"
-- FOR ALL hem invoices_select_own). Permissive politikalar OR'lanır — yani
-- birine modül şartı eklesek diğeri kapıyı açık bırakırdı. RESTRICTIVE
-- politika ise permissive'lerin sonucuyla AND'lenir: tek bir satır yazarak
-- tabloyu, geçmişte ne yazılmış olursa olsun, modüle bağlarız.
--
-- DELETE bilinçli olarak KAPSAM DIŞI: paketi biten kullanıcı kendi verisini
-- silebilmeli (GDPR silme hakkı). SELECT/INSERT/UPDATE kapatılır.
DO $$
DECLARE
  esleme CONSTANT text[][] := ARRAY[
    -- muhasebe
    ['invoices',            'muhasebe'],
    ['invoice_items',       'muhasebe'],
    ['invoice_edit_requests','muhasebe'],
    ['bank_statements',     'muhasebe'],
    ['bank_transactions',   'muhasebe'],
    ['bank_tx_overrides',   'muhasebe'],
    -- müşteri bulma
    ['lead_searches',       'musteri_bulma'],
    ['leads',               'musteri_bulma'],
    ['lead_emails',         'musteri_bulma'],
    -- sosyal medya
    ['sm_accounts',         'sosyal_medya'],
    ['sm_posts',            'sosyal_medya'],
    ['sm_media',            'sosyal_medya'],
    ['sm_metrics',          'sosyal_medya'],
    ['sm_post_metrics',     'sosyal_medya'],
    ['sm_content_pillars',  'sosyal_medya'],
    ['sm_setup_steps',      'sosyal_medya']
  ];
  i int;
  t text;
  m text;
BEGIN
  FOR i IN 1 .. array_length(esleme, 1) LOOP
    t := esleme[i][1];
    m := esleme[i][2];

    EXECUTE format('DROP POLICY IF EXISTS modul_kapisi_select ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY modul_kapisi_select ON public.%I AS RESTRICTIVE
         FOR SELECT USING (public.modul_acik(%L))', t, m);

    EXECUTE format('DROP POLICY IF EXISTS modul_kapisi_insert ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY modul_kapisi_insert ON public.%I AS RESTRICTIVE
         FOR INSERT WITH CHECK (public.modul_acik(%L))', t, m);

    EXECUTE format('DROP POLICY IF EXISTS modul_kapisi_update ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY modul_kapisi_update ON public.%I AS RESTRICTIVE
         FOR UPDATE USING (public.modul_acik(%L)) WITH CHECK (public.modul_acik(%L))', t, m, m);
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 4) davetler — tek kullanımlık token
-- ──────────────────────────────────────────────────────────────────
-- Ham token ASLA saklanmaz; yalnızca sha256 özeti tutulur. Doğrulama
-- Edge Function içinde service-role ile yapılır, bu yüzden tablo
-- anon/authenticated'a tamamen kapalıdır.
CREATE TABLE IF NOT EXISTS public.davetler (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash         text NOT NULL UNIQUE,
  email              text NOT NULL,
  moduller           text[] NOT NULL DEFAULT '{}',
  tip                text NOT NULL DEFAULT 'yeni' CHECK (tip IN ('yeni','yukseltme')),
  hedef_user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sirket_adi         text,
  gecerlilik         timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  kullanildi_at      timestamptz,
  kullanan_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  iptal_at           timestamptz,
  olusturan_user_id  uuid NOT NULL REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- yükseltme daveti bir hedef kullanıcı olmadan anlamsız
  CHECK (tip = 'yeni' OR hedef_user_id IS NOT NULL)
);

COMMENT ON COLUMN public.davetler.token_hash IS
  'sha256(ham token). Ham token yalnızca mailde ve oluşturma yanıtında görünür, hiçbir yerde saklanmaz.';

CREATE INDEX IF NOT EXISTS davetler_email_idx ON public.davetler(lower(email));
CREATE INDEX IF NOT EXISTS davetler_acik_idx  ON public.davetler(gecerlilik)
  WHERE kullanildi_at IS NULL AND iptal_at IS NULL;

ALTER TABLE public.davetler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS davetler_admin_all ON public.davetler;
CREATE POLICY davetler_admin_all ON public.davetler
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 5) modul_talepleri — "bu paketi de istiyorum"
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.modul_talepleri (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modul         text NOT NULL CHECK (modul IN ('muhasebe','musteri_bulma','sosyal_medya')),
  durum         text NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor','onaylandi','reddedildi')),
  mesaj         text,
  karar_notu    text,
  karar_veren   uuid REFERENCES auth.users(id),
  karar_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Aynı modül için ikinci bir bekleyen talep açılamaz; karara bağlananlar
-- geçmiş kaydı olarak birikebilsin diye kısıt partial.
CREATE UNIQUE INDEX IF NOT EXISTS modul_talepleri_bekleyen_uniq
  ON public.modul_talepleri(user_id, modul) WHERE durum = 'bekliyor';

ALTER TABLE public.modul_talepleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mt_select_own ON public.modul_talepleri;
CREATE POLICY mt_select_own ON public.modul_talepleri
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

-- Kullanıcı yalnızca kendi adına ve yalnızca 'bekliyor' durumunda talep açar.
DROP POLICY IF EXISTS mt_insert_own ON public.modul_talepleri;
CREATE POLICY mt_insert_own ON public.modul_talepleri
  FOR INSERT WITH CHECK (user_id = auth.uid() AND durum = 'bekliyor');

-- Kararı yalnızca admin verir.
DROP POLICY IF EXISTS mt_admin_write ON public.modul_talepleri;
CREATE POLICY mt_admin_write ON public.modul_talepleri
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 6) Mevcut izolasyon açıklarının kapatılması
-- ──────────────────────────────────────────────────────────────────

-- 6a) companies: "Kayit sirasinda insert" politikası WITH CHECK (true) idi —
--     herhangi bir kullanıcı BAŞKASININ user_id'siyle şirket satırı açabiliyordu.
--     Kayıt artık service-role Edge Function üzerinden yapıldığı için gereksiz.
DROP POLICY IF EXISTS "Kayit sirasinda insert" ON public.companies;

-- 6b) stock_entries / stock_counts: politikalar USING (true) idi — tablo
--     tüm oturumlara tamamen açıktı. Satırı giren kişiye + admin'e daraltılır.
DROP POLICY IF EXISTS "Admin full access stock_entries" ON public.stock_entries;
CREATE POLICY stock_entries_own ON public.stock_entries
  FOR ALL USING (entered_by = auth.uid() OR public.is_admin())
          WITH CHECK (entered_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin full access stock_counts" ON public.stock_counts;
CREATE POLICY stock_counts_own ON public.stock_counts
  FOR ALL USING (counted_by = auth.uid() OR public.is_admin())
          WITH CHECK (counted_by = auth.uid() OR public.is_admin());

-- 6c) invoices/invoice_items üzerindeki eski, effective_owner_ids() bilmeyen
--     kopya politikalar. Yerlerini alan güncel politikalar 20260416'da yazıldı;
--     bunlar yalnızca gürültü ve yanlış okumaya davetiye.
DROP POLICY IF EXISTS "Kullanıcılar sadece kendi faturalarını görebilir" ON public.invoices;
DROP POLICY IF EXISTS "Kullanıcılar sadece kendi kalemlerini görebilir" ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_select_own ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_insert_own ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_update_own ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_delete_own ON public.invoice_items;

-- 6d) bank_* üzerindeki kopya "own_*" politikaları (aynı şeyi iki kez söylüyor).
DROP POLICY IF EXISTS own_bank_statements ON public.bank_statements;
DROP POLICY IF EXISTS own_bank_transactions ON public.bank_transactions;

-- ──────────────────────────────────────────────────────────────────
-- 7) audit_team_isolation() — modül dışı veri kontrolü eklendi
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_team_isolation()
RETURNS TABLE(check_name text, severity text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_cross_tenant_count bigint := 0;
  v_multi_owner_count  bigint := 0;
  v_orphan_count       bigint := 0;
  v_modul_disi_count   bigint := 0;
BEGIN
  -- A) cross_tenant_write: staff'ın yazdığı fatura, sahibinin user_id'sinde değil
  FOR r IN
    SELECT tm.member_user_id, tm.owner_user_id, i.id AS row_id, i.user_id AS wrong_user_id
    FROM public.team_members tm
    JOIN public.invoices i ON i.created_by = tm.member_user_id
    WHERE tm.status = 'active' AND i.user_id <> tm.owner_user_id
  LOOP
    INSERT INTO public.isolation_audit_log(check_name, severity, member_user_id, owner_user_id, offending_row_id, table_name, detail)
    VALUES ('cross_tenant_write', 'critical', r.member_user_id, r.owner_user_id, r.row_id::text, 'invoices',
            jsonb_build_object('wrong_user_id', r.wrong_user_id));
    v_cross_tenant_count := v_cross_tenant_count + 1;
  END LOOP;

  -- B) member_multi_owner: bir member birden çok aktif sahibe bağlı
  FOR r IN
    SELECT tm.member_user_id, COUNT(*) AS c
    FROM public.team_members tm
    WHERE tm.status='active' AND tm.member_user_id IS NOT NULL
    GROUP BY tm.member_user_id HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.isolation_audit_log(check_name, severity, member_user_id, detail)
    VALUES ('member_multi_owner', 'warning', r.member_user_id, jsonb_build_object('owner_count', r.c));
    v_multi_owner_count := v_multi_owner_count + 1;
  END LOOP;

  -- C) orphan_member: member_user_id auth.users'da yok
  INSERT INTO public.isolation_audit_log(check_name, severity, member_user_id, detail)
  SELECT 'orphan_member', 'warning', tm.member_user_id, jsonb_build_object('email', tm.invited_email)
  FROM public.team_members tm
  WHERE tm.member_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = tm.member_user_id);
  GET DIAGNOSTICS v_orphan_count = ROW_COUNT;

  -- D) modul_disi_veri: modülü hiç açılmamış kullanıcıya ait veri.
  --    Tek başına bir sızıntı değil — paket kapandıktan sonra veri durur.
  --    Ama sayı beklenmedik şekilde büyürse RLS kapısında regresyon var demektir.
  FOR r IN
    SELECT v.user_id, v.modul, v.tablo, count(*) AS c
    FROM (
      SELECT l.user_id, 'musteri_bulma'::text AS modul, 'leads'::text AS tablo FROM public.leads l
      UNION ALL
      SELECT s.user_id, 'sosyal_medya', 'sm_accounts' FROM public.sm_accounts s
      UNION ALL
      SELECT p.user_id, 'sosyal_medya', 'sm_posts' FROM public.sm_posts p
    ) v
    WHERE NOT EXISTS (
      SELECT 1 FROM public.kullanici_modulleri km
       WHERE km.user_id = v.user_id AND km.modul = v.modul AND km.durum = 'aktif'
    )
    GROUP BY v.user_id, v.modul, v.tablo
  LOOP
    INSERT INTO public.isolation_audit_log(check_name, severity, owner_user_id, table_name, detail)
    VALUES ('modul_disi_veri', 'warning', r.user_id, r.tablo,
            jsonb_build_object('modul', r.modul, 'satir_sayisi', r.c));
    v_modul_disi_count := v_modul_disi_count + 1;
  END LOOP;

  RETURN QUERY VALUES
    ('cross_tenant_write', 'critical', v_cross_tenant_count),
    ('member_multi_owner', 'warning',  v_multi_owner_count),
    ('orphan_member',      'warning',  v_orphan_count),
    ('modul_disi_veri',    'warning',  v_modul_disi_count);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_team_isolation() FROM public;
GRANT EXECUTE ON FUNCTION public.audit_team_isolation() TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 8) Geçiş: mevcut kullanıcılara üç modül de açılır
-- ──────────────────────────────────────────────────────────────────
-- Sistem canlıda ve bugüne kadar herkes her şeyi görüyordu. Migration'dan
-- sonra kapı kapandığı için mevcut hesaplar bir anda boş ekrana düşerdi.
-- Bu satır onları oldukları yerde bırakır; kısıtlama YENİ hesaplarda başlar.
-- Mevcut müşteriyi daraltmak istediğinizde Admin → Paketler'den kapatın.
INSERT INTO public.kullanici_modulleri (user_id, modul, kaynak, not_)
SELECT u.id, m.modul, 'admin', 'migration: mevcut kullanıcıya otomatik açıldı'
  FROM auth.users u
 CROSS JOIN (VALUES ('muhasebe'),('musteri_bulma'),('sosyal_medya')) AS m(modul)
ON CONFLICT (user_id, modul) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────────────────────────
-- 9) Fonksiyon yetkilerini daralt
-- ──────────────────────────────────────────────────────────────────
-- REVOKE ... FROM public bu projede yetmiyor: şemadaki otomatik grant
-- mekanizması yeni fonksiyonlara anon/authenticated EXECUTE veriyor.
-- Modül fonksiyonları oturum açmamış kullanıcıya zaten hiçbir şey söylemez
-- (auth.uid() null → false/boş) ama API yüzeyini genişletmemek için
-- anon açıkça kapatılır.
REVOKE EXECUTE ON FUNCTION public.modul_acik(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.aktif_modullerim() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_team_isolation() FROM anon;

-- ──────────────────────────────────────────────────────────────────
-- 10) kullanici_id_bul — e-postadan user_id (yalnızca service-role)
-- ──────────────────────────────────────────────────────────────────
-- Davet fonksiyonları "bu adres zaten kayıtlı mı" sorusunu bununla sorar.
-- authenticated/anon'a KESİNLİKLE verilmez — aksi halde kullanıcı listesi
-- e-posta deneyerek numaralandırılabilirdi.
CREATE OR REPLACE FUNCTION public.kullanici_id_bul(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT u.id FROM auth.users u
   WHERE lower(u.email) = lower(trim(p_email))
   LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.kullanici_id_bul(text) FROM public;
REVOKE ALL ON FUNCTION public.kullanici_id_bul(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.kullanici_id_bul(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.kullanici_id_bul(text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────────────────────────
-- 11) user_agreements.version — DEFAULT eksikti
-- ──────────────────────────────────────────────────────────────────
-- Canlı şemada kolon adı `version` (NOT NULL, DEFAULT'suz), migration
-- dosyasında ise `agreement_version` (DEFAULT'lu) yazıyordu. Kayıt
-- akışlarındaki INSERT bu yüzden her seferinde patlıyor, try/catch içinde
-- sessizce yutuluyordu — tablo bugüne kadar TAMAMEN BOŞ kaldı.
-- Sözleşme onayı hukuki kanıt olduğundan kolon artık kendi başına dolar;
-- çağıranın unutması mümkün değil. (Edge fonksiyonlarındaki try/catch de
-- kaldırıldı: hata artık sessizce geçilmiyor.)
ALTER TABLE public.user_agreements
  ALTER COLUMN version SET DEFAULT '2026-03-24';

COMMENT ON COLUMN public.user_agreements.version IS
  'Onaylanan sözleşme metninin sürümü. Sözleşme metni değişirse burayı da güncelleyin.';

NOTIFY pgrst, 'reload schema';
