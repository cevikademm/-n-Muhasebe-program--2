-- ══════════════════════════════════════════════════════════════════
-- Fikoai — Alt Kullanıcı (Team Members) Sistemi + İzolasyon Denetim
-- ══════════════════════════════════════════════════════════════════
-- Bu migration:
--   1) team_members tablosu + RLS
--   2) effective_owner_ids() helper (sahip + staff'ın bağlı olduğu sahipler)
--   3) invoices RLS'ini effective_owner_ids()'e göre günceller
--   4) invoice_items RLS'i korunur (zaten parent invoice'a bağlı)
--   5) invoices.created_by kolonu (denetim için)
--   6) isolation_audit_log tablosu + audit_team_isolation() fonksiyonu
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────
-- 1) team_members tablosu
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email   text NOT NULL,
  member_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role            text NOT NULL DEFAULT 'staff' CHECK (role IN ('staff')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  revoked_at      timestamptz,
  UNIQUE (owner_user_id, invited_email)
);

CREATE INDEX IF NOT EXISTS team_members_member_active_idx
  ON public.team_members(member_user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS team_members_email_idx
  ON public.team_members(lower(invited_email));

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tm_owner_all ON public.team_members;
CREATE POLICY tm_owner_all ON public.team_members
  FOR ALL USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS tm_member_select_self ON public.team_members;
CREATE POLICY tm_member_select_self ON public.team_members
  FOR SELECT USING (member_user_id = auth.uid());

DROP POLICY IF EXISTS tm_admin_all ON public.team_members;
CREATE POLICY tm_admin_all ON public.team_members
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ──────────────────────────────────────────────
-- 2) effective_owner_ids() — auth.uid() VE bağlı olduğu sahipler
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.effective_owner_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid()
  UNION
  SELECT owner_user_id FROM public.team_members
   WHERE member_user_id = auth.uid() AND status = 'active';
$$;
REVOKE ALL ON FUNCTION public.effective_owner_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.effective_owner_ids() TO authenticated;

-- ──────────────────────────────────────────────
-- 3) invoices.created_by (denetim için — kimin girdiğini kaydet)
-- ──────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);

-- ──────────────────────────────────────────────
-- 4) invoices RLS — effective_owner_ids() kullan
--    Staff, sahibin user_id'si adına satır okuyabilir/yazabilir.
--    DELETE: sadece gerçek sahip veya admin (staff silemez).
--    UPDATE: effective owners (staff düzeltme yapabilsin).
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS invoices_select_own ON public.invoices;
CREATE POLICY invoices_select_own ON public.invoices
  FOR SELECT USING (
    user_id IN (SELECT public.effective_owner_ids()) OR public.is_admin()
  );

DROP POLICY IF EXISTS invoices_insert_own ON public.invoices;
CREATE POLICY invoices_insert_own ON public.invoices
  FOR INSERT WITH CHECK (
    user_id IN (SELECT public.effective_owner_ids())
  );

DROP POLICY IF EXISTS invoices_update_own ON public.invoices;
CREATE POLICY invoices_update_own ON public.invoices
  FOR UPDATE
    USING (user_id IN (SELECT public.effective_owner_ids()) OR public.is_admin())
    WITH CHECK (user_id IN (SELECT public.effective_owner_ids()) OR public.is_admin());

DROP POLICY IF EXISTS invoices_delete_own ON public.invoices;
CREATE POLICY invoices_delete_own ON public.invoices
  FOR DELETE USING (user_id = auth.uid() OR public.is_admin());

-- ──────────────────────────────────────────────
-- 5) invoice_items RLS — parent invoice üzerinden effective owner kontrolü
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS invoice_items_select ON public.invoice_items;
CREATE POLICY invoice_items_select ON public.invoice_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND (i.user_id IN (SELECT public.effective_owner_ids()) OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS invoice_items_insert ON public.invoice_items;
CREATE POLICY invoice_items_insert ON public.invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND (i.user_id IN (SELECT public.effective_owner_ids()) OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS invoice_items_update ON public.invoice_items;
CREATE POLICY invoice_items_update ON public.invoice_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND (i.user_id IN (SELECT public.effective_owner_ids()) OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS invoice_items_delete ON public.invoice_items;
CREATE POLICY invoice_items_delete ON public.invoice_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND (i.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ──────────────────────────────────────────────
-- 6) isolation_audit_log + audit_team_isolation()
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.isolation_audit_log (
  id                bigserial PRIMARY KEY,
  run_at            timestamptz NOT NULL DEFAULT now(),
  check_name        text NOT NULL,
  severity          text NOT NULL CHECK (severity IN ('info','warning','critical')),
  member_user_id    uuid,
  owner_user_id     uuid,
  offending_row_id  text,
  table_name        text,
  detail            jsonb
);

ALTER TABLE public.isolation_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_admin_only ON public.isolation_audit_log;
CREATE POLICY audit_admin_only ON public.isolation_audit_log
  FOR SELECT USING (public.is_admin());

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

  RETURN QUERY VALUES
    ('cross_tenant_write', 'critical', v_cross_tenant_count),
    ('member_multi_owner', 'warning',  v_multi_owner_count),
    ('orphan_member',      'warning',  v_orphan_count);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_team_isolation() FROM public;
GRANT EXECUTE ON FUNCTION public.audit_team_isolation() TO authenticated;

-- Opsiyonel — pg_cron ile günlük çalıştırma. Supabase'de pg_cron extension'ı aktifse:
-- SELECT cron.schedule('team_isolation_daily', '0 3 * * *', $$ SELECT public.audit_team_isolation(); $$);

-- Schema cache'i yeniden yükle
NOTIFY pgrst, 'reload schema';
