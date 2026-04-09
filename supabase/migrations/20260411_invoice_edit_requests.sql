-- ══════════════════════════════════════════════════════════════════
-- Invoice Edit Requests — dedicated table (survives reanalyze)
-- ──────────────────────────────────────────────────────────────────
-- Daha önce talepler invoices.raw_ai_response->'edit_request' JSONB
-- içinde tutuluyordu. AI yeniden-analiz raw_ai_response'u tamamen
-- üzerine yazdığı için talep geçmişi kayboluyordu. Bu migration:
--   1) Ayrı invoice_edit_requests tablosunu oluşturur
--   2) RLS: kullanıcı kendi taleplerini, admin hepsini görür
--   3) Mevcut JSONB verileri tabloya backfill eder
--   4) Trigger ile invoices.raw_ai_response.edit_request → tabloya
--      otomatik mirror eder (kullanıcı tarafı kod değişmeden çalışır)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.invoice_edit_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  note          text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   uuid,
  resolution    text, -- 'manual' | 'reanalyzed' | NULL
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ier_invoice  ON public.invoice_edit_requests(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ier_user     ON public.invoice_edit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ier_pending  ON public.invoice_edit_requests(user_id) WHERE resolved_at IS NULL;

-- ────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────
ALTER TABLE public.invoice_edit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ier_select" ON public.invoice_edit_requests;
DROP POLICY IF EXISTS "ier_insert" ON public.invoice_edit_requests;
DROP POLICY IF EXISTS "ier_update" ON public.invoice_edit_requests;
DROP POLICY IF EXISTS "ier_delete" ON public.invoice_edit_requests;

CREATE POLICY "ier_select" ON public.invoice_edit_requests
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "ier_insert" ON public.invoice_edit_requests
  FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "ier_update" ON public.invoice_edit_requests
  FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "ier_delete" ON public.invoice_edit_requests
  FOR DELETE USING (public.is_admin());

-- ────────────────────────────────────────────
-- Backfill from existing JSONB data
-- ────────────────────────────────────────────
INSERT INTO public.invoice_edit_requests (invoice_id, user_id, note, requested_at, resolved_at, resolution)
SELECT
  i.id,
  i.user_id,
  COALESCE(i.raw_ai_response->'edit_request'->>'note', ''),
  COALESCE((i.raw_ai_response->'edit_request'->>'at')::timestamptz, i.created_at),
  NULLIF(i.raw_ai_response->'edit_request'->>'resolved_at','')::timestamptz,
  CASE
    WHEN i.raw_ai_response->'edit_request'->>'resolved_by' = 'reanalyze' THEN 'reanalyzed'
    WHEN i.raw_ai_response->'edit_request'->>'resolved_at' IS NOT NULL    THEN 'manual'
    ELSE NULL
  END
FROM public.invoices i
WHERE i.raw_ai_response ? 'edit_request'
  AND (
    (i.raw_ai_response->'edit_request'->>'requested') = 'true'
    OR (i.raw_ai_response->'edit_request'->>'resolved_at') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.invoice_edit_requests ier
    WHERE ier.invoice_id = i.id
  );

-- ────────────────────────────────────────────
-- Trigger: JSONB → tablo mirror
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_edit_request_from_jsonb()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  er           jsonb;
  is_requested boolean;
  note_txt     text;
  at_ts        timestamptz;
  resolved_ts  timestamptz;
  open_id      uuid;
BEGIN
  er := NEW.raw_ai_response->'edit_request';
  IF er IS NULL OR jsonb_typeof(er) <> 'object' THEN
    RETURN NEW;
  END IF;

  is_requested := COALESCE((er->>'requested')::boolean, false);
  note_txt     := COALESCE(er->>'note','');
  at_ts        := COALESCE(NULLIF(er->>'at','')::timestamptz, now());
  resolved_ts  := NULLIF(er->>'resolved_at','')::timestamptz;

  -- Bu fatura için açık (resolved olmayan) talep var mı?
  SELECT id INTO open_id
  FROM public.invoice_edit_requests
  WHERE invoice_id = NEW.id AND resolved_at IS NULL
  ORDER BY requested_at DESC
  LIMIT 1;

  IF is_requested AND open_id IS NULL AND resolved_ts IS NULL THEN
    -- Yeni talep
    INSERT INTO public.invoice_edit_requests (invoice_id, user_id, note, requested_at)
    VALUES (NEW.id, NEW.user_id, note_txt, at_ts);
  ELSIF resolved_ts IS NOT NULL AND open_id IS NOT NULL THEN
    -- Talep çözüldü
    UPDATE public.invoice_edit_requests
    SET resolved_at = resolved_ts,
        resolution  = CASE
          WHEN er->>'resolved_by' = 'reanalyze' THEN 'reanalyzed'
          ELSE 'manual'
        END
    WHERE id = open_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_edit_request ON public.invoices;
CREATE TRIGGER trg_sync_edit_request
  AFTER INSERT OR UPDATE OF raw_ai_response ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_edit_request_from_jsonb();
