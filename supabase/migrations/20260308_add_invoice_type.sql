ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type text;
NOTIFY pgrst, 'reload schema';
