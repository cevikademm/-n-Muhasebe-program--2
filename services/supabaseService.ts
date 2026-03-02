import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../constants";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,       // Oturum sayfayı yenilemede korunur
    autoRefreshToken: true,     // Token süresi dolmadan otomatik yenilenir
    detectSessionInUrl: true,   // OAuth / magic-link callback'leri yakalanır
  },
});
