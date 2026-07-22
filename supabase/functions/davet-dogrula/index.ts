// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// davet-dogrula  (JWT YOK — anon çağrılabilir)
// ──────────────────────────────────────────────────────────────────
// Davet ekranını boyamak için token'ı doğrular. Yalnızca davet edilen kişinin
// zaten bildiği bilgiyi döndürür (kendi e-postası + kendisine açılan modüller);
// başka hiçbir kayıt sızdırmaz.
//
// Deploy: supabase functions deploy davet-dogrula --no-verify-jwt
//
// Body: { token }
// → { gecerli, email?, moduller?, tip?, sirket_adi?, hata? }
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, jsonYanit } from "../_shared/http.ts";
import { tokenHash, sabitGecikme } from "../_shared/davet.ts";

serve(async (req) => {
  const corsHeaders = cors(req);
  const json = jsonYanit(corsHeaders);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ gecerli: false, hata: "Sunucu yapılandırma hatası" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    if (!token || token.length > 200) {
      await sabitGecikme();
      return json({ gecerli: false, hata: "Geçersiz veya süresi dolmuş davet bağlantısı." });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const hash = await tokenHash(token);
    const { data: davet } = await admin
      .from("davetler")
      .select("email, moduller, tip, sirket_adi, gecerlilik, kullanildi_at, iptal_at")
      .eq("token_hash", hash)
      .maybeSingle();

    // Tüm başarısız durumlar aynı mesajı ve aynı gecikmeyi döndürür —
    // "token var ama süresi dolmuş" ile "token hiç yok" ayırt edilemesin.
    const gecersiz = !davet
      || davet.iptal_at
      || davet.kullanildi_at
      || new Date(davet.gecerlilik).getTime() < Date.now();

    if (gecersiz) {
      await sabitGecikme();
      // Kullanılmış davet ayrı bir mesaj hak ediyor: kullanıcı linke ikinci kez
      // tıkladığında ne yapması gerektiğini bilmeli (giriş yapmalı).
      if (davet?.kullanildi_at) {
        return json({ gecerli: false, kullanilmis: true, hata: "Bu davet daha önce kullanılmış. Lütfen giriş yapın." });
      }
      return json({ gecerli: false, hata: "Geçersiz veya süresi dolmuş davet bağlantısı." });
    }

    return json({
      gecerli: true,
      email: davet.email,
      moduller: davet.moduller,
      tip: davet.tip,
      sirket_adi: davet.sirket_adi,
    });
  } catch (e: any) {
    console.error("davet-dogrula error", e);
    return json({ gecerli: false, hata: "Sunucu hatası" }, 500);
  }
});
