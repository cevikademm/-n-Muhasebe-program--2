// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// meta-oauth  (JWT YOK — callback'i Facebook çağırıyor)
// ──────────────────────────────────────────────────────────────────
// Instagram (Business) için kendi Meta OAuth akışımız. Çoklu hesap sorununu
// kökten çözer: callback'te `me/accounts` ile TÜM IG hesapları listelenir ve
// bağlanan sm_accounts satırının handle'ıyla EŞLEŞEN hesap seçilir.
//
//   POST { action:"basla", accountId } + Authorization: Bearer <JWT>  → { url }
//   GET  ?code=...&state=...   Facebook döner → token + IG hesabı yazar
//
// Eşleşme bulunamazsa: erişilebilen IG hesapları listelenir (kesin geri bildirim).
//
// Deploy: supabase functions deploy meta-oauth --no-verify-jwt
// Env: META_APP_ID, META_APP_SECRET, SUPABASE_*
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  stateUret, stateCoz, yetkilendirmeUrl, koduDegistir, uzunOmurluToken, igHesaplariListele,
} from "../_shared/meta.ts";

const ALLOWED_ORIGINS = [
  "https://fikoai.de", "https://www.fikoai.de", "https://fibu-de-2.vercel.app",
  "http://localhost:3000", "http://localhost:3001", "http://localhost:3002",
];
function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
function sonucSayfasi(basarili: boolean, mesaj: string, donus: string) {
  const renk = basarili ? "#10b981" : "#ef4444";
  const baslik = basarili ? "Instagram bağlandı" : "Bağlantı tamamlanamadı";
  return new Response(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${baslik}</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0b0f17;color:#e6e8ee;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px">
<div style="max-width:440px;text-align:center">
  <div style="font-size:40px;line-height:1;margin-bottom:14px">${basarili ? "✓" : "✕"}</div>
  <h1 style="font-size:19px;margin:0 0 10px;color:${renk}">${baslik}</h1>
  <p style="font-size:13.5px;line-height:1.6;color:#9aa3b2;margin:0 0 20px;white-space:pre-line">${mesaj}</p>
  <a href="${donus}" style="display:inline-block;padding:10px 18px;border-radius:9px;
     background:#ec4899;color:#fff;text-decoration:none;font-size:13px;font-weight:700">Uygulamaya dön</a>
</div>
<script>setTimeout(function(){ try { window.close(); } catch (e) {} }, 3000);</script>
</body></html>`,
    { status: 200, headers: new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }) },
  );
}

serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const APP_ID = Deno.env.get("META_APP_ID") ?? "";
  const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
  const CONFIG_ID = Deno.env.get("META_CONFIG_ID") ?? "";
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-oauth`;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Facebook'tan dönüş ──────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const hata = url.searchParams.get("error");
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";

    const veri = await stateCoz(SUPABASE_SERVICE_ROLE_KEY, state);
    const donus = String(veri?.ret || "https://fikoai.de/app");

    if (hata) {
      return sonucSayfasi(false,
        `Meta hata döndürdü: ${url.searchParams.get("error_description") || hata}`, donus);
    }
    if (!veri?.accountId || !code) {
      return sonucSayfasi(false, "Bağlantı isteği geçersiz veya süresi dolmuş. Baştan deneyin.", donus);
    }

    try {
      const { data: hesap } = await admin
        .from("sm_accounts").select("id, user_id, handle").eq("id", veri.accountId).maybeSingle();
      if (!hesap) return sonucSayfasi(false, "Hesap bulunamadı.", donus);

      const kisa = await koduDegistir({ code, appId: APP_ID, appSecret: APP_SECRET, redirectUri: REDIRECT_URI });
      const { token, gecerlilik } = await uzunOmurluToken({ kisaToken: kisa, appId: APP_ID, appSecret: APP_SECRET });

      const hesaplar = await igHesaplariListele(token);
      if (!hesaplar.length) {
        return sonucSayfasi(false,
          "Bu Facebook hesabında Sayfaya bağlı bir Instagram Business hesabı bulunamadı.\n" +
          "Instagram'ı Professional (Business/Creator) yapıp bir Facebook Sayfasına bağlayın.",
          donus);
      }

      // sm_accounts satırının handle'ıyla eşleşen IG hesabını bul.
      const aranan = String(hesap.handle || "").replace(/^@/, "").toLowerCase();
      const secilen = hesaplar.find((x) => x.username.toLowerCase() === aranan);

      if (!secilen) {
        const liste = hesaplar.map((x) => `@${x.username}`).join(", ");
        const mesaj =
          `"@${hesap.handle}" bu Facebook hesabında bulunamadı.\n` +
          `Erişilebilen Instagram hesapları: ${liste}\n` +
          `Handle'ı bunlardan biriyle düzeltin ya da doğru Facebook hesabıyla bağlanın.`;
        await admin.from("sm_account_credentials").upsert({
          account_id: hesap.id, user_id: hesap.user_id, saglayici: "meta_oauth", son_hata: mesaj,
        }, { onConflict: "account_id" });
        return sonucSayfasi(false, mesaj, donus);
      }

      // Eşleşti → Sayfa token'ı + IG id'yi yaz (yayın bununla yapılır).
      await admin.from("sm_account_credentials").upsert({
        account_id: hesap.id,
        user_id: hesap.user_id,
        saglayici: "meta_oauth",
        harici_hesap: secilen.ig_user_id,       // IG Business user id
        erisim_token: secilen.page_token,        // uzun ömürlü Sayfa token'ı
        yenileme_token: token,                   // uzun ömürlü kullanıcı token'ı (yedek)
        gecerlilik,
        son_hata: null,
      }, { onConflict: "account_id" });

      // sm_accounts'a IG id'yi yaz + doğrulanmış işaretle.
      await admin.from("sm_accounts")
        .update({ harici_id: secilen.ig_user_id, dogrulandi: true, durum: "aktif" })
        .eq("id", hesap.id);

      return sonucSayfasi(true,
        `@${secilen.username} bağlandı. Artık Reels/Hikâye yayınlayabilir ve ilk yorumu ekleyebilirsiniz.`,
        donus);
    } catch (e) {
      await admin.from("sm_account_credentials")
        .update({ son_hata: (e as Error).message }).eq("account_id", veri.accountId);
      return sonucSayfasi(false, (e as Error).message, donus);
    }
  }

  if (req.method !== "POST") return json({ success: false, error: "Sadece POST/GET." }, 405, h);

  // ── Yetkilendirmeyi başlat ──────────────────────────────────────
  try {
    if (!APP_ID || !APP_SECRET) return json({ success: false, error: "META_APP_ID/SECRET tanımlı değil." }, 500, h);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Oturum bulunamadı." }, 401, h);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ success: false, error: "Yetkisiz." }, 401, h);

    const govde = await req.json().catch(() => ({}));
    const accountId = String(govde?.accountId ?? "");
    if (!accountId) return json({ success: false, error: "accountId gerekli." }, 400, h);

    const { data: hesap } = await userClient
      .from("sm_accounts").select("id, platform").eq("id", accountId).maybeSingle();
    if (!hesap) return json({ success: false, error: "Hesap bulunamadı veya erişim yok." }, 404, h);
    if (hesap.platform !== "instagram") return json({ success: false, error: "Bu akış yalnızca Instagram içindir." }, 400, h);

    const origin = req.headers.get("Origin") || "";
    const ret = ALLOWED_ORIGINS.includes(origin) ? `${origin}/app` : "https://fikoai.de/app";
    const state = await stateUret(SUPABASE_SERVICE_ROLE_KEY, { accountId: hesap.id, ret });
    const url = yetkilendirmeUrl({ appId: APP_ID, redirectUri: REDIRECT_URI, state, configId: CONFIG_ID });

    return json({ success: true, url }, 200, h);
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500, cors(req));
  }
});
