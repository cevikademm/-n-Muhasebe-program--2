-- Fatura bilgilerine satıcı/alıcı VKN ve alıcı unvanı alanları ekleniyor
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS satici_vkn TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS alici_vkn TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS alici_unvani TEXT;
