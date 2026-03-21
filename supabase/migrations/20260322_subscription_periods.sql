-- Dönemsel abonelik modeli: Kullanıcılar takvim ayları satın alır
CREATE TABLE IF NOT EXISTS public.subscription_periods (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period_year  integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  plan_type    text NOT NULL DEFAULT 'monthly' CHECK (plan_type IN ('monthly', 'quarterly', 'yearly')),
  price_paid   numeric(10,2) DEFAULT 0,
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_year, period_month)
);

ALTER TABLE public.subscription_periods ENABLE ROW LEVEL SECURITY;

-- Kullanıcı kendi kayıtlarını okuyabilir, admin hepsini görebilir
CREATE POLICY "sub_periods_select_own" ON public.subscription_periods
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Kullanıcı kendi kaydını ekleyebilir
CREATE POLICY "sub_periods_insert_own" ON public.subscription_periods
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Kullanıcı kendi kaydını güncelleyebilir, admin hepsini güncelleyebilir
CREATE POLICY "sub_periods_update_own" ON public.subscription_periods
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- İndeks: kullanıcı bazlı dönem sorguları için
CREATE INDEX IF NOT EXISTS idx_sub_periods_user_id ON public.subscription_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_periods_period ON public.subscription_periods(period_year, period_month);
