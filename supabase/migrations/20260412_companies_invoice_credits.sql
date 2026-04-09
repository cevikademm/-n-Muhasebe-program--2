-- Add invoice credits to companies (admin-managed)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS invoice_credits integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.companies.invoice_credits IS
  'Admin tarafından şirkete tanımlanan fatura analiz kredisi adedi.';
