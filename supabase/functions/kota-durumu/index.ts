// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// kota-durumu  (JWT zorunlu)
// ──────────────────────────────────────────────────────────────────
// Otomasyonun bağlı olduğu dış servislerin KALAN HAKKINI toplar.
//
// Neden sunucuda: Composio / Apify anahtarları tarayıcıya asla düşmemeli.
// İstemci yalnızca sayıları görür.
//
// Neden Composio'nun KENDİ plan kotası burada yok:
//   Composio v3 API'sinde (72 uç) plan/kota/faturalama ucu bulunmuyor.
//   /auth/session/info proje anahtarını reddediyor ("user API key gerekir"),
//   /usage /billing /subscription gibi uçlar mevcut değil. Composio abonelik
//   kotası yalnızca Composio panelinden görülebiliyor. Bu yüzden burada
//   otomasyonu GERÇEKTEN durduran kotalar raporlanıyor.
//
// Yanıt yalnızca ANAHTAR + SAYI döner; tüm etiketler arayüzde (KotaKarti.tsx).
// Böylece hem çift dil tek yerde durur hem de Deno/JSON kodlama sorunları
// Türkçe metinleri bozamaz.
//
// → { success, kotalar: [{ anahtar, kullanilan, toplam, periyotSaat, durum, not? }] }
//
// Env: COMPOSIO_API_KEY, COMPOSIO_USER_ID, APIFY_TOKEN,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, jsonYanit } from "../_shared/http.ts";
import { baglantiBul, composioCalistir, mediaList } from "../_shared/composio.ts";

/** Instagram'ın hesap başına 24 saatlik yayın tavanı (Graph config sabiti). */
const IG_GUNLUK_TAVAN = 100;

/** Kullanım oranına göre uyarı seviyesi — arayüzdeki renk buradan gelir. */
function seviye(kullanilan: number, toplam: number | null): "ok" | "uyari" | "kritik" {
  if (!toplam || toplam <= 0) return "ok";
  const oran = kullanilan / toplam;
  if (oran >= 0.9) return "kritik";
  if (oran >= 0.7) return "uyari";
  return "ok";
}

serve(async (req) => {
  const corsHeaders = cors(req);
  const json = jsonYanit(corsHeaders);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const COMPOSIO_API_KEY = Deno.env.get("COMPOSIO_API_KEY") ?? "";
    const COMPOSIO_USER_ID = Deno.env.get("COMPOSIO_USER_ID") ?? "";
    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN") ?? "";

    // ── Oturum ───────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Yetkisiz" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, error: "Geçersiz oturum" }, 401);
    const caller = userData.user;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Staff ise sahibinin kotalarını görür (effective_owner mantığının aynısı).
    const { data: uyelik } = await admin
      .from("team_members").select("owner_user_id")
      .eq("member_user_id", caller.id).eq("status", "active").limit(1).maybeSingle();
    const ownerId = uyelik?.owner_user_id || caller.id;

    const kimlik = { apiKey: COMPOSIO_API_KEY, userId: COMPOSIO_USER_ID };
    const kotalar: any[] = [];

    // ── 1) Instagram 24 saatlik paylaşım hakkı ───────────────────
    // Otomasyonu gerçekten durduran kota bu: dolduğunda yeni gönderi
    // istekleri kısmi başarı değil, doğrudan reddedilir.
    //
    // Graph'ın resmî /content_publishing_limit ucu kullanılamıyor:
    // Composio bağlantı token'ını "REDACTED" olarak döndürüyor ve bu projede
    // ilgili araç tanımlı değil (Tool_ToolNotFound). Bunun yerine son 24
    // saatteki gönderiler sayılıyor — resmî uçla birebir aynı sonucu verdiği
    // doğrulandı (ikisi de 4).
    try {
      if (!COMPOSIO_API_KEY) throw new Error("Composio anahtarı tanımlı değil");
      const baglanti = await baglantiBul("instagram", kimlik);
      if (!baglanti) throw new Error("Instagram hesabı bağlı değil");

      const medya = mediaList(
        await composioCalistir("INSTAGRAM_GET_USER_MEDIA", { limit: 50 }, kimlik, baglanti.id),
      );
      const esik = Date.now() - 24 * 3600 * 1000;
      const kullanilan = medya.filter((m: any) => {
        const t = Date.parse(String(m?.timestamp || ""));
        return Number.isFinite(t) && t >= esik;
      }).length;

      kotalar.push({
        anahtar: "instagram_yayin",
        kullanilan,
        toplam: IG_GUNLUK_TAVAN,
        periyotSaat: 24,
        durum: seviye(kullanilan, IG_GUNLUK_TAVAN),
      });
    } catch (e: any) {
      kotalar.push({
        anahtar: "instagram_yayin", kullanilan: null, toplam: null,
        periyotSaat: 24, durum: "bilinmiyor", not: String(e?.message || e),
      });
    }

    // ── 2) Apify (müşteri bulma taramaları) ──────────────────────
    // Apify kotayı dolar bazında tutar; "kaç arama kaldı" sayacı yok.
    try {
      if (!APIFY_TOKEN) throw new Error("Apify anahtarı tanımlı değil");
      const r = await fetch("https://api.apify.com/v2/users/me", {
        headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
      });
      const a = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(a?.error?.message || `HTTP ${r.status}`);

      const p = a?.data?.plan ?? {};
      const kullanilan = Number(
        a?.data?.monthlyUsage?.totalUsageCreditsUsd ?? p?.monthlyUsageCreditsUsd ?? 0,
      );
      const toplam = Number(p?.maxMonthlyUsageUsd ?? 0) || null;

      kotalar.push({
        anahtar: "apify",
        kullanilan: Math.round(kullanilan * 100) / 100,
        toplam: toplam ? Math.round(toplam * 100) / 100 : null,
        periyotSaat: null,      // aylık
        durum: seviye(kullanilan, toplam),
      });
    } catch (e: any) {
      kotalar.push({
        anahtar: "apify", kullanilan: null, toplam: null,
        periyotSaat: null, durum: "bilinmiyor", not: String(e?.message || e),
      });
    }

    // ── 3) Bu ay gönderilen e-posta ──────────────────────────────
    // Resend plan kotasını API'den vermiyor; bu yüzden KENDİ gönderim
    // sayımızı gösteriyoruz. Üst sınır bilinmediği için toplam null —
    // arayüz bunu "sınır tanımlı değil" olarak çizer.
    try {
      const ayBasi = new Date();
      ayBasi.setUTCDate(1);
      ayBasi.setUTCHours(0, 0, 0, 0);

      const { count } = await admin
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ownerId)
        .eq("direction", "outbound")
        .gte("created_at", ayBasi.toISOString());

      kotalar.push({
        anahtar: "eposta",
        kullanilan: Number(count ?? 0),
        toplam: null,
        periyotSaat: null,      // aylık
        durum: "ok",
      });
    } catch (e: any) {
      kotalar.push({
        anahtar: "eposta", kullanilan: null, toplam: null,
        periyotSaat: null, durum: "bilinmiyor", not: String(e?.message || e),
      });
    }

    return json({ success: true, kotalar, guncelleme: new Date().toISOString() });
  } catch (e: any) {
    console.error("kota-durumu error", e);
    return json({ success: false, error: "Sunucu hatasi: " + (e?.message || String(e)) }, 500);
  }
});
