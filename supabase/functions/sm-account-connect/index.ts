// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// sm-account-connect  (JWT required — logged-in app users)
// ──────────────────────────────────────────────────────────────────
// Sosyal hesapların kimlik bilgilerini saklar ve platform API'sine karşı
// doğrular. Token'lar `sm_account_credentials` tablosunda durur; o tablo
// RLS açık + 0 politika ile client'a tamamen kapalıdır, yalnızca buradaki
// service_role istemcisi okur. Client hiçbir zaman token görmez.
//
//   POST { action:"kaydet",  accountId, saglayici, harici_hesap? }
//        → { success }
//   POST { action:"dogrula", accountId }
//        → { success, dogrulandi, profil?, uyari? }
//   POST { action:"profil",  accountId }
//        → { success, profil }
//   POST { action:"kopar",   accountId }
//        → { success }
//
// Env: COMPOSIO_API_KEY, COMPOSIO_USER_ID,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adapterAl } from "../_shared/social/registry.ts";
import { baglantiBaslat, baglantiDurumu, composioKullanici } from "../_shared/composio.ts";
import { stateUret, yetkilendirmeUrl, gecerliToken } from "../_shared/google.ts";
import {
  yetkilendirmeUrl as ttYetkiUrl, gecerliToken as ttGecerliToken,
} from "../_shared/tiktok.ts";
import { yetkilendirmeUrl as metaYetkiUrl } from "../_shared/meta.ts";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const SAGLAYICILAR = ["composio", "meta_oauth", "google_oauth"];

serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ success: false, error: "Sadece POST." }, 405, h);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const COMPOSIO_API_KEY = Deno.env.get("COMPOSIO_API_KEY") ?? "";
    const COMPOSIO_USER_ID = Deno.env.get("COMPOSIO_USER_ID") ?? "cevikadem";

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ success: false, error: "Sunucu yapılandırma hatası." }, 500, h);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Oturum bulunamadı." }, 401, h);

    // 1) Çağıranın kimliği — kullanıcı JWT'siyle
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, error: "Yetkisiz." }, 401, h);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action ?? "");
    const accountId = String(payload?.accountId ?? "");
    if (!accountId) return json({ success: false, error: "accountId gerekli." }, 400, h);

    // 2) YETKİ: hesabın çağırana ait olduğunu KULLANICI istemcisiyle doğrula.
    //    Bu sorgu RLS altında çalışır — başkasının hesabının id'sini tahmin
    //    eden biri satırı göremez, dolayısıyla aşağıdaki service_role
    //    işlemleri de o hesaba dokunamaz.
    const { data: hesap, error: hesapErr } = await userClient
      .from("sm_accounts")
      .select("id, user_id, customer_id, platform, handle, harici_id")
      .eq("id", accountId)
      .maybeSingle();

    if (hesapErr) return json({ success: false, error: hesapErr.message }, 500, h);
    if (!hesap) return json({ success: false, error: "Hesap bulunamadı veya erişim yok." }, 404, h);

    const adapter = adapterAl(hesap.platform);

    // Composio bağlantıları müşteri bazında ayrılır — bir müşterinin
    // bağlantısı diğerine görünmesin (bkz. composioKullanici).
    const composioKimlik = {
      apiKey: COMPOSIO_API_KEY,
      userId: composioKullanici(COMPOSIO_USER_ID, hesap.customer_id),
    };

    // ── kaydet ────────────────────────────────────────────────────
    // ── baglat: bu hesaba ÖZEL OAuth bağlantısı başlat ────────────
    // Her sm_account kendi Composio bağlantısını alır. Ortak bağlantı
    // kullanmak, aynı platformdaki ikinci hesabın birincinin verisini
    // görmesine yol açıyordu.
    if (action === "baglat") {
      if (!COMPOSIO_API_KEY) {
        return json({ success: false, error: "COMPOSIO_API_KEY tanımlı değil." }, 500, h);
      }
      // Instagram: çoklu hesap + ilk yorum için kendi Meta OAuth'umuz.
      // (Composio hangi hesabın bağlanacağını seçtirmiyor ve token'ı maskeliyor.)
      if (hesap.platform === "instagram") {
        const APP_ID = Deno.env.get("META_APP_ID") ?? "";
        if (!APP_ID) return json({ success: false, error: "META_APP_ID tanımlı değil." }, 500, h);
        const origin = req.headers.get("Origin") || "";
        const ret = ALLOWED_ORIGINS.includes(origin) ? `${origin}/app` : "https://fikoai.de/app";
        const state = await stateUret(SUPABASE_SERVICE_ROLE_KEY, { accountId: hesap.id, ret });
        const mUrl = metaYetkiUrl({
          appId: APP_ID,
          redirectUri: `${SUPABASE_URL}/functions/v1/meta-oauth`,
          state,
          configId: Deno.env.get("META_CONFIG_ID") ?? "",
        });
        // Kimlik satırını meta_oauth'a çevir; token callback'te yazılır.
        await admin.from("sm_account_credentials").upsert({
          account_id: hesap.id, user_id: hesap.user_id, saglayici: "meta_oauth", son_hata: null,
        }, { onConflict: "account_id" });
        await admin.from("sm_accounts").update({ dogrulandi: false }).eq("id", hesap.id);
        return json({ success: true, url: mUrl }, 200, h);
      }

      // YouTube: Composio yayın yapamıyor (token maskeli + tool yerel dosya
      // istiyor), o yüzden KENDİ Google OAuth istemcimize yönlendiriyoruz.
      if (hesap.platform === "youtube") {
        const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
        if (!CLIENT_ID) {
          return json({ success: false, error: "GOOGLE_CLIENT_ID tanımlı değil." }, 500, h);
        }
        const origin = req.headers.get("Origin") || "";
        const ret = ALLOWED_ORIGINS.includes(origin) ? `${origin}/app` : "https://fikoai.de/app";
        const state = await stateUret(SUPABASE_SERVICE_ROLE_KEY, { accountId: hesap.id, ret });
        const gUrl = yetkilendirmeUrl({
          clientId: CLIENT_ID,
          redirectUri: `${SUPABASE_URL}/functions/v1/yt-oauth`,
          state,
        });

        // Kaydı şimdiden google_oauth'a çevir; token callback'te yazılacak.
        await admin.from("sm_account_credentials").upsert({
          account_id: hesap.id, user_id: hesap.user_id,
          saglayici: "google_oauth", son_hata: null,
        }, { onConflict: "account_id" });
        await admin.from("sm_accounts").update({ dogrulandi: false }).eq("id", hesap.id);

        return json({ success: true, url: gUrl }, 200, h);
      }

      // TikTok: Composio yönetimli app'i yok → kendi OAuth istemcimiz.
      if (hesap.platform === "tiktok") {
        const TT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
        if (!TT_KEY) return json({ success: false, error: "TIKTOK_CLIENT_KEY tanımlı değil." }, 500, h);
        const origin = req.headers.get("Origin") || "";
        const ret = ALLOWED_ORIGINS.includes(origin) ? `${origin}/app` : "https://fikoai.de/app";
        const state = await stateUret(SUPABASE_SERVICE_ROLE_KEY, { accountId: hesap.id, ret });
        const ttUrl = ttYetkiUrl({
          clientKey: TT_KEY,
          redirectUri: `${SUPABASE_URL}/functions/v1/tt-oauth`,
          state,
        });
        await admin.from("sm_account_credentials").upsert({
          account_id: hesap.id, user_id: hesap.user_id,
          saglayici: "tiktok_oauth", son_hata: null,
        }, { onConflict: "account_id" });
        await admin.from("sm_accounts").update({ dogrulandi: false }).eq("id", hesap.id);
        return json({ success: true, url: ttUrl }, 200, h);
      }

      const { id: baglantiId, url } = await baglantiBaslat(hesap.platform, composioKimlik);

      const { error } = await admin
        .from("sm_account_credentials")
        .upsert({
          account_id: hesap.id,
          user_id: hesap.user_id,
          saglayici: "composio",
          harici_hesap: baglantiId,
          son_hata: null,
        }, { onConflict: "account_id" });
      if (error) throw new Error(error.message);

      // Bağlantı henüz tamamlanmadı → hesabı doğrulanmamış say.
      await admin.from("sm_accounts").update({ dogrulandi: false }).eq("id", hesap.id);
      return json({ success: true, url, baglantiId }, 200, h);
    }

    // ── durum: OAuth tamamlandı mı ─────────────────────────────────
    if (action === "durum") {
      const { data: k } = await admin
        .from("sm_account_credentials")
        .select("saglayici, harici_hesap, erisim_token").eq("account_id", hesap.id).maybeSingle();

      // Google akışında "bağlandı" demek = callback token yazdı demek.
      if (["google_oauth","tiktok_oauth","meta_oauth"].includes(k?.saglayici)) {
        return json({ success: true, durum: k.erisim_token ? "ACTIVE" : "BEKLIYOR" }, 200, h);
      }
      if (!k?.harici_hesap) return json({ success: true, durum: "YOK" }, 200, h);

      const durum = await baglantiDurumu(k.harici_hesap, composioKimlik)
        .catch(() => "BILINMIYOR");
      return json({ success: true, durum }, 200, h);
    }

    if (action === "kaydet") {
      const saglayici = String(payload?.saglayici ?? "composio");
      if (!SAGLAYICILAR.includes(saglayici)) {
        return json({ success: false, error: "Bilinmeyen sağlayıcı." }, 400, h);
      }
      const { error } = await admin
        .from("sm_account_credentials")
        .upsert({
          account_id: hesap.id,
          user_id: hesap.user_id,
          saglayici,
          harici_hesap: payload?.harici_hesap ?? null,
          son_hata: null,
        }, { onConflict: "account_id" });
      if (error) throw new Error(error.message);
      return json({ success: true }, 200, h);
    }

    // ── kopar ─────────────────────────────────────────────────────
    if (action === "kopar") {
      const { error } = await admin
        .from("sm_account_credentials").delete().eq("account_id", hesap.id);
      if (error) throw new Error(error.message);
      await admin.from("sm_accounts")
        .update({ dogrulandi: false }).eq("id", hesap.id);
      return json({ success: true }, 200, h);
    }

    if (action !== "dogrula" && action !== "profil") {
      return json({ success: false, error: "Bilinmeyen action." }, 400, h);
    }

    if (!adapter.hazir) {
      return json({
        success: true, dogrulandi: false,
        uyari: `${hesap.platform} bağlantısı bu fazda henüz desteklenmiyor.`,
      }, 200, h);
    }

    // 3) Kimliği service_role ile oku (client bu tabloyu göremez)
    let { data: kimlikSatir } = await admin
      .from("sm_account_credentials")
      .select("saglayici, harici_hesap, erisim_token, yenileme_token, gecerlilik")
      .eq("account_id", hesap.id)
      .maybeSingle();

    // KENDİNİ ONARMA: `/sosyal-medya` skill'i sm_accounts satırlarını doğrudan
    // veritabanına yazıyor ve bu uçtan geçmiyor → kimlik satırı hiç oluşmuyor.
    // Composio'da toplanacak hesap bazlı bir sır YOK (bağlantı proje düzeyinde),
    // dolayısıyla kullanıcıyı "önce kaydet" diye ayrı bir adıma göndermenin
    // hiçbir güvenlik değeri yok — eksikse burada kurulur.
    if (!kimlikSatir && COMPOSIO_API_KEY) {
      const { error: kurulumHatasi } = await admin
        .from("sm_account_credentials")
        .upsert({
          account_id: hesap.id,
          user_id: hesap.user_id,
          saglayici: "composio",
          son_hata: null,
        }, { onConflict: "account_id" });
      if (!kurulumHatasi) {
        kimlikSatir = {
          saglayici: "composio",
          harici_hesap: null,
          erisim_token: null,
          yenileme_token: null,
        };
      }
    }

    if (!kimlikSatir) {
      return json({
        success: true, dogrulandi: false,
        uyari: "Bu hesap için bağlantı kurulamadı (COMPOSIO_API_KEY eksik olabilir).",
      }, 200, h);
    }

    // Google yolunda token süresi dolmuş olabilir; adapter'a taze token gitsin.
    if (kimlikSatir.saglayici === "google_oauth") {
      try {
        kimlikSatir.erisim_token = await gecerliToken(
          admin, hesap.id, kimlikSatir,
          Deno.env.get("GOOGLE_CLIENT_ID") ?? "", Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
        );
      } catch (e) {
        return json({ success: true, dogrulandi: false, uyari: (e as Error).message }, 200, h);
      }
    }
    if (kimlikSatir.saglayici === "tiktok_oauth") {
      try {
        kimlikSatir.erisim_token = await ttGecerliToken(
          admin, hesap.id, kimlikSatir,
          Deno.env.get("TIKTOK_CLIENT_KEY") ?? "", Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "",
        );
      } catch (e) {
        return json({ success: true, dogrulandi: false, uyari: (e as Error).message }, 200, h);
      }
    }

    const kimlik = {
      ...kimlikSatir,
      composio: composioKimlik,
      hesap: { harici_id: hesap.harici_id, handle: hesap.handle },
    };

    if (kimlik.saglayici === "composio" && !COMPOSIO_API_KEY) {
      return json({ success: false, error: "COMPOSIO_API_KEY tanımlı değil." }, 500, h);
    }

    // ── profil ────────────────────────────────────────────────────
    if (action === "profil") {
      const profil = await adapter.profilGetir(kimlik);
      return json({ success: true, profil }, 200, h);
    }

    // ── dogrula ───────────────────────────────────────────────────
    const sonuc = await adapter.dogrula(kimlik);

    // YANLIŞ HESAP KORUMASI
    // OAuth ekranında kullanıcı, tarayıcıda açık olan BAŞKA bir hesabı
    // yetkilendirmiş olabilir (ör. iki Instagram'ı olan biri ikisinde de
    // aynı hesabı onaylar). O zaman bu bağlantı, zaten kayıtlı bir hesabın
    // kimliğini döndürür. Sessizce yazarsak handle ezilir, benzersizlik
    // kısıtına takılır ve iki satır aynı hesabı gösterir hale gelir.
    // Bunun yerine açıkça reddet ve ne yapılacağını söyle.
    if (sonuc.ok && sonuc.harici_id) {
      const { data: cakisan } = await admin
        .from("sm_accounts")
        .select("id, handle")
        .eq("user_id", hesap.user_id)
        .eq("platform", hesap.platform)
        .eq("harici_id", sonuc.harici_id)
        .neq("id", hesap.id)
        .maybeSingle();

      if (cakisan) {
        const mesaj =
          `Bu bağlantı "@${sonuc.handle ?? cakisan.handle}" hesabına ait — o hesap zaten ` +
          `"@${cakisan.handle}" olarak kayıtlı. İzin ekranında yanlış hesabı onaylamış ` +
          `olabilirsiniz. Instagram/Facebook'tan çıkıp doğru hesapla tekrar "Bağla"ya basın.`;
        await admin.from("sm_account_credentials")
          .update({ son_hata: mesaj }).eq("account_id", hesap.id);
        return json({ success: true, dogrulandi: false, uyari: mesaj }, 200, h);
      }
    }

    // Doğrulama sonucunu sm_accounts'a yaz. Platformdan gelen handle/harici_id
    // varsa güncelle — kullanıcı elle yanlış yazmış olabilir.
    const yama: Record<string, unknown> = { dogrulandi: sonuc.ok };
    if (sonuc.ok) {
      if (sonuc.harici_id) yama.harici_id = sonuc.harici_id;
      if (sonuc.handle) yama.handle = sonuc.handle;
      yama.durum = "aktif";
    }
    // Hata YUTULMAZ: benzersizlik kısıtına takılırsa kullanıcı bilsin.
    const { error: yazmaHatasi } = await admin
      .from("sm_accounts").update(yama).eq("id", hesap.id);
    if (yazmaHatasi) {
      const mesaj = yazmaHatasi.code === "23505"
        ? "Bu hesap zaten başka bir kayıtta bağlı. Yinelenen kaydı silin."
        : `Hesap güncellenemedi: ${yazmaHatasi.message}`;
      await admin.from("sm_account_credentials")
        .update({ son_hata: mesaj }).eq("account_id", hesap.id);
      return json({ success: true, dogrulandi: false, uyari: mesaj }, 200, h);
    }

    await admin.from("sm_account_credentials")
      .update({ son_hata: sonuc.ok ? null : (sonuc.sebep ?? "doğrulanamadı") })
      .eq("account_id", hesap.id);

    return json({
      success: true,
      dogrulandi: sonuc.ok,
      profil: sonuc.profil,
      uyari: sonuc.ok ? undefined : sonuc.sebep,
    }, 200, h);
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500, cors(req));
  }
});
