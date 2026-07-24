// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// yt-oauth  (JWT YOK — callback'i Google çağırıyor)
// ──────────────────────────────────────────────────────────────────
// YouTube yayını için kendi Google OAuth akışımız.
//
//   POST { action:"basla", accountId }  + Authorization: Bearer <kullanıcı JWT>
//        → { success, url }        kullanıcı bu adrese yönlendirilir
//
//   GET  ?code=...&state=...      Google buraya döner (JWT yok)
//        → token değişimi + sm_account_credentials'a yazma
//        → uygulamaya 302
//
// Deploy: supabase functions deploy yt-oauth --no-verify-jwt
//
// GET ucunda JWT olmadığı için yetki `state` imzasından gelir: state,
// SERVICE_ROLE_KEY ile HMAC'lenmiş accountId taşır — taklit edilemez.
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  stateUret, stateCoz, yetkilendirmeUrl, koduDegistir,
} from "../_shared/google.ts";

const ALLOWED_ORIGINS = [
  "https://fikoai.de",
  "https://www.fikoai.de",
  "https://fibu-de-2.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
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
  return new Response(JSON.stringify(body), {
    status, headers: { ...headers, "Content-Type": "application/json" },
  });
}

/** Kullanıcıya gösterilecek sade sonuç sayfası (pencere kendini kapatır). */
function sonucSayfasi(basarili: boolean, mesaj: string, donus: string) {
  const renk = basarili ? "#10b981" : "#ef4444";
  const baslik = basarili ? "YouTube bağlandı" : "Bağlantı tamamlanamadı";
  return new Response(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${baslik}</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0b0f17;color:#e6e8ee;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px">
<div style="max-width:420px;text-align:center">
  <div style="font-size:40px;line-height:1;margin-bottom:14px">${basarili ? "✓" : "✕"}</div>
  <h1 style="font-size:19px;margin:0 0 10px;color:${renk}">${baslik}</h1>
  <p style="font-size:13.5px;line-height:1.6;color:#9aa3b2;margin:0 0 20px">${mesaj}</p>
  <a href="${donus}" style="display:inline-block;padding:10px 18px;border-radius:9px;
     background:#ec4899;color:#fff;text-decoration:none;font-size:13px;font-weight:700">
     Uygulamaya dön</a>
</div>
<script>
  // Yeni sekmede açıldıysa kendini kapat; olmuyorsa kullanıcı düğmeyi kullanır.
  setTimeout(function(){ try { window.close(); } catch (e) {} }, 2500);
</script>
</body></html>`,
    {
      status: 200,
      headers: new Headers({
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      }),
    },
  );
}

serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
  const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/yt-oauth`;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── Google'dan dönüş ────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const hata = url.searchParams.get("error");
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";

    const veri = await stateCoz(SUPABASE_SERVICE_ROLE_KEY, state);
    const donus = String(veri?.ret || "https://fikoai.de/app");

    if (hata) {
      return sonucSayfasi(false,
        hata === "access_denied"
          ? "İzin verilmedi. Google hesabınızın izin ekranında “Test users” listesinde olduğundan emin olun."
          : `Google hata döndürdü: ${hata}`,
        donus);
    }
    if (!veri?.accountId || !code) {
      return sonucSayfasi(false, "Bağlantı isteği geçersiz veya süresi dolmuş. Baştan deneyin.", donus);
    }

    try {
      const t = await koduDegistir({
        code, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI,
      });

      if (!t.refresh_token) {
        // access_type=offline + prompt=consent gönderiyoruz; yine de gelmediyse
        // Google eski izni yeniliyor demektir. Uyar, çünkü 1 saat sonra kalırız.
        console.warn("yt-oauth: refresh_token gelmedi", { accountId: veri.accountId });
      }

      const { data: hesap } = await admin
        .from("sm_accounts").select("id, user_id").eq("id", veri.accountId).maybeSingle();
      if (!hesap) return sonucSayfasi(false, "Hesap bulunamadı.", donus);

      await admin.from("sm_account_credentials").upsert({
        account_id: hesap.id,
        user_id: hesap.user_id,
        saglayici: "google_oauth",
        erisim_token: t.access_token,
        yenileme_token: t.refresh_token ?? null,
        gecerlilik: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
        kapsamlar: String(t.scope || "").split(" ").filter(Boolean),
        son_hata: null,
      }, { onConflict: "account_id" });

      return sonucSayfasi(true,
        "Yetkilendirme tamamlandı. Uygulamada hesabı doğrulayıp Shorts/Video yayınlayabilirsiniz.",
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
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json({ success: false, error: "GOOGLE_CLIENT_ID/SECRET tanımlı değil." }, 500, h);
    }

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

    // YETKİ: hesap KULLANICI istemcisiyle okunur → RLS altında görünmüyorsa dur.
    const { data: hesap } = await userClient
      .from("sm_accounts").select("id, platform, handle").eq("id", accountId).maybeSingle();
    if (!hesap) return json({ success: false, error: "Hesap bulunamadı veya erişim yok." }, 404, h);
    if (hesap.platform !== "youtube") {
      return json({ success: false, error: "Bu akış yalnızca YouTube içindir." }, 400, h);
    }

    const origin = req.headers.get("Origin") || "";
    const ret = ALLOWED_ORIGINS.includes(origin) ? `${origin}/app` : "https://fikoai.de/app";

    const state = await stateUret(SUPABASE_SERVICE_ROLE_KEY, { accountId: hesap.id, ret });
    const url = yetkilendirmeUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state });

    return json({ success: true, url }, 200, h);
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500, cors(req));
  }
});
