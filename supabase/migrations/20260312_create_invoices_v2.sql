-- Invoices v2: Yeni fatura sistemi (OCR & Vision)
CREATE TABLE IF NOT EXISTS invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  fatura_no text,
  tarih date,
  satici_vkn text,
  alici_vkn text,
  ara_toplam numeric(12,2) DEFAULT 0,
  toplam_kdv numeric(12,2) DEFAULT 0,
  genel_toplam numeric(12,2) DEFAULT 0,
  status text DEFAULT 'analyzed' CHECK (status IN ('analyzed', 'check', 'error')),
  file_url text,
  raw_ai_response jsonb,
  uyarilar text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  urun_adi text,
  miktar numeric(10,2) DEFAULT 1,
  kdv_orani numeric(5,2) DEFAULT 0,
  satir_toplami numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own invoices" ON invoices
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own invoice items" ON invoice_items
  FOR ALL USING (
    invoice_id IN (SELECT id FROM invoices WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_tarih ON invoices(tarih);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);
