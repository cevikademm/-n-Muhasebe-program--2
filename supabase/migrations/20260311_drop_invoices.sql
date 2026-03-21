-- Invoice sistemi kaldırıldı - tüm ilgili tabloları sil
-- Bu migration geri alınamaz!

-- Önce bağımlı tabloları sil
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS matching_rules CASCADE;
