-- Kullanıcı sözleşme onayları tablosu
CREATE TABLE IF NOT EXISTS user_agreements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreement_type TEXT NOT NULL CHECK (agreement_type IN ('privacy_policy', 'distance_selling', 'delivery_return')),
  agreement_version TEXT NOT NULL DEFAULT '2026-03-24',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE(user_id, agreement_type, agreement_version)
);

-- RLS
ALTER TABLE user_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agreements"
  ON user_agreements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agreements"
  ON user_agreements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin full access
CREATE POLICY "Admins full access on user_agreements"
  ON user_agreements FOR ALL
  USING (is_admin());

-- Index
CREATE INDEX idx_user_agreements_user_id ON user_agreements(user_id);
