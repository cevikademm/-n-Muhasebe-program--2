-- ══════════════════════════════════════════════════════════════════
-- Fix: Admin RLS bypass for invoices & invoice_items
-- ──────────────────────────────────────────────────────────────────
-- 20260312_create_invoices_v2.sql tablo dropped and recreated but
-- only created "auth.uid() = user_id" policy, losing the admin
-- bypass that existed in 001_security_rls_policies.sql.
-- This restores admin visibility (is_admin() → full SELECT/UPDATE).
-- ══════════════════════════════════════════════════════════════════

-- Helper yoksa oluştur (idempotent)
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
-- INVOICES
-- ────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Eski "Users see own invoices" policy'sini kaldır (v2 migration'dan kalma)
DROP POLICY IF EXISTS "Users see own invoices" ON invoices;
DROP POLICY IF EXISTS "invoices_select_own"     ON invoices;
DROP POLICY IF EXISTS "invoices_insert_own"     ON invoices;
DROP POLICY IF EXISTS "invoices_update_own"     ON invoices;
DROP POLICY IF EXISTS "invoices_delete_own"     ON invoices;

CREATE POLICY "invoices_select_own" ON invoices
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_admin()
  );

CREATE POLICY "invoices_insert_own" ON invoices
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR public.is_admin()
  );

CREATE POLICY "invoices_update_own" ON invoices
  FOR UPDATE USING (
    user_id = auth.uid() OR public.is_admin()
  );

CREATE POLICY "invoices_delete_own" ON invoices
  FOR DELETE USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- ────────────────────────────────────────────
-- INVOICE_ITEMS
-- ────────────────────────────────────────────
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own invoice items" ON invoice_items;
DROP POLICY IF EXISTS "invoice_items_select_own"    ON invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_own"    ON invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_own"    ON invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_own"    ON invoice_items;

CREATE POLICY "invoice_items_select_own" ON invoice_items
  FOR SELECT USING (
    invoice_id IN (SELECT id FROM invoices WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "invoice_items_insert_own" ON invoice_items
  FOR INSERT WITH CHECK (
    invoice_id IN (SELECT id FROM invoices WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "invoice_items_update_own" ON invoice_items
  FOR UPDATE USING (
    invoice_id IN (SELECT id FROM invoices WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "invoice_items_delete_own" ON invoice_items
  FOR DELETE USING (
    invoice_id IN (SELECT id FROM invoices WHERE user_id = auth.uid())
    OR public.is_admin()
  );
