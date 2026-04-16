-- Fatura ve banka ekstresine kullanıcı tarafından seçilen dönem (ay/yıl) bilgisi ekler.
-- Yüklemeden önce kullanıcı dönem seçer; kayıtlar bu döneme göre filtrelenir ve gösterilir.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS period_year  integer,
  ADD COLUMN IF NOT EXISTS period_month integer;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_period_month_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_period_month_check
  CHECK (period_month IS NULL OR (period_month BETWEEN 1 AND 12));

CREATE INDEX IF NOT EXISTS idx_invoices_period
  ON public.invoices (user_id, period_year, period_month);

ALTER TABLE public.bank_statements
  ADD COLUMN IF NOT EXISTS period_year  integer,
  ADD COLUMN IF NOT EXISTS period_month integer;

ALTER TABLE public.bank_statements
  DROP CONSTRAINT IF EXISTS bank_statements_period_month_check;
ALTER TABLE public.bank_statements
  ADD CONSTRAINT bank_statements_period_month_check
  CHECK (period_month IS NULL OR (period_month BETWEEN 1 AND 12));

CREATE INDEX IF NOT EXISTS idx_bank_statements_period
  ON public.bank_statements (user_id, period_year, period_month);
