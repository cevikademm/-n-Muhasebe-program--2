-- ══════════════════════════════════════════════════════════════════
-- Fibu.de — GÜVENLİK: Row Level Security (RLS) Politikaları
-- ══════════════════════════════════════════════════════════════════
-- Bu migration dosyası Supabase Dashboard > SQL Editor'da çalıştırılmalıdır.
-- YKS-01, YKS-02 düzeltmeleri için sunucu tarafı güvenlik katmanı sağlar.
-- ══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- 1. RLS'yi TÜM tablolarda etkinleştir
-- ────────────────────────────────────────────
ALTER TABLE IF EXISTS invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────
-- 2. Helper: Kullanıcının admin olup olmadığını kontrol eden fonksiyon
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ────────────────────────────────────────────
-- 3. INVOICES — Kullanıcı yalnızca kendi faturalarını görebilir
--    Admin tüm faturaları görebilir
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices_select_own" ON invoices;
CREATE POLICY "invoices_select_own" ON invoices
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS "invoices_insert_own" ON invoices;
CREATE POLICY "invoices_insert_own" ON invoices
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "invoices_update_own" ON invoices;
CREATE POLICY "invoices_update_own" ON invoices
  FOR UPDATE USING (
    user_id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS "invoices_delete_own" ON invoices;
CREATE POLICY "invoices_delete_own" ON invoices
  FOR DELETE USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- ────────────────────────────────────────────
-- 4. INVOICE_ITEMS — Faturaya ait kalemlere erişim
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "invoice_items_select" ON invoice_items;
CREATE POLICY "invoice_items_select" ON invoice_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND (invoices.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "invoice_items_insert" ON invoice_items;
CREATE POLICY "invoice_items_insert" ON invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND invoices.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "invoice_items_update" ON invoice_items;
CREATE POLICY "invoice_items_update" ON invoice_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND (invoices.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "invoice_items_delete" ON invoice_items;
CREATE POLICY "invoice_items_delete" ON invoice_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND (invoices.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ────────────────────────────────────────────
-- 5. COMPANIES — Kullanıcı kendi şirketini, admin tümünü görebilir
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "companies_select" ON companies;
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS "companies_insert" ON companies;
CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "companies_update" ON companies;
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (
    user_id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS "companies_delete" ON companies;
CREATE POLICY "companies_delete" ON companies
  FOR DELETE USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- ────────────────────────────────────────────
-- 6. USER_SETTINGS — Yalnızca kendi ayarları
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "user_settings_own" ON user_settings;
CREATE POLICY "user_settings_own" ON user_settings
  FOR ALL USING (user_id = auth.uid());

-- ────────────────────────────────────────────
-- 7. BANK_STATEMENTS & BANK_TRANSACTIONS
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "bank_statements_own" ON bank_statements;
CREATE POLICY "bank_statements_own" ON bank_statements
  FOR ALL USING (
    user_id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS "bank_transactions_own" ON bank_transactions;
CREATE POLICY "bank_transactions_own" ON bank_transactions
  FOR ALL USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- ────────────────────────────────────────────
-- 8. PROFILES — Kullanıcı kendi profilini okuyabilir,
--    yalnızca admin başkalarının rolünü değiştirebilir
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
  )
  WITH CHECK (
    -- Normal kullanıcı kendi rolünü değiştiremez
    CASE
      WHEN public.is_admin() THEN true
      ELSE (role IS NOT DISTINCT FROM (SELECT role FROM profiles WHERE id = auth.uid()))
    END
  );

-- ────────────────────────────────────────────
-- 9. SUBSCRIPTIONS tablosu (YKS-04 düzeltmesi)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'trialing', 'inactive', 'canceled')),
  plan       text DEFAULT 'free',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "subscriptions_insert_own" ON subscriptions;
CREATE POLICY "subscriptions_insert_own" ON subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "subscriptions_update_own" ON subscriptions;
CREATE POLICY "subscriptions_update_own" ON subscriptions
  FOR UPDATE USING (user_id = auth.uid());

-- ────────────────────────────────────────────
-- 10. ACCOUNT_PLANS — Herkes okuyabilir (referans tablo)
-- ────────────────────────────────────────────
ALTER TABLE IF EXISTS account_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_plans_select_all" ON account_plans;
CREATE POLICY "account_plans_select_all" ON account_plans
  FOR SELECT USING (true);

-- Yalnızca admin güncelleyebilir
DROP POLICY IF EXISTS "account_plans_admin_modify" ON account_plans;
CREATE POLICY "account_plans_admin_modify" ON account_plans
  FOR ALL USING (public.is_admin());

-- ══════════════════════════════════════════════════════════════════
-- TAMAMLANDI: Bu SQL'i Supabase Dashboard > SQL Editor'da çalıştırın.
-- ══════════════════════════════════════════════════════════════════
