// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// ig-metrics-sync  (JWT required — logged-in app users)
// ──────────────────────────────────────────────────────────────────
// Instagram gönderilerinin post seviyesi metriklerini Composio üzerinden
// çeker ve `sm_post_metrics` tablosuna günlük snapshot olarak yazar.
//
// Neden: hesap seviyesi `sm_metrics` "büyüyor muyuz"u söyler; bu fonksiyon
// "HANGİ İÇERİK büyütüyor"u söyler. Sıralamanın omurgası beğeni değil,
// yayilma_skoru = (kaydetme + paylaşım) / erişim  →  `sm_post_ranking` view'i.
//
//   POST { action:"sync", limit?:50 }
//        → { success, cekilen, yazilan, siralama:[...], uyarilar:[] }
//   POST { action:"rapor" }
//        → { success, siralama:[...] }   (yeni veri çekmeden view'i okur)
//
// Env: COMPOSIO_API_KEY, COMPOSIO_USER_ID,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Composio istemcisi sm-account-connect ile paylaşılıyor → _shared'a taşındı.
import { composioCalistir, insightsToMap, mediaList, composioKullanici } from "../_shared/composio.ts";

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

// Meta, v22+ ile medya metriklerini böldü: `impressions` yeni gönderilerde
// kalktı, Reels ayrı bir set istiyor. Tip başına doğru seti gönder, hata
// gelirse minimum sete düş — tek bir metrik yüzünden tüm çağrıyı kaybetme.
const METRIKLER: Record<string, string[]> = {
  REELS: ["reach", "saved", "likes", "comments", "shares", "total_interactions", "views"],
  FEED: ["reach", "saved", "likes", "comments", "shares", "total_interactions", "views"],
  ASGARI: ["reach", "saved"],
};

// Eski yerel `composio(tool, args, key, userId)` imzasını koruyan ince sarmal —
// aşağıdaki çağrı yerleri olduğu gibi kalsın diye.
const composio = (
  tool: string, args: Record<string, unknown>, key: string, userId: string,
  baglantiId?: string | null,
) => composioCalistir(tool, args, { apiKey: key, userId }, baglantiId);

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

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

    if (!SUPABASE_SERVICE_ROLE_KEY || !COMPOSIO_API_KEY) {
      return json({ success: false, error: "Sunucu yapılandırma hatası." }, 500, h);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Oturum bulunamadı." }, 401, h);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, error: "Yetkisiz." }, 401, h);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const payload = await req.json().catch(() => ({}));
    const action = payload?.action ?? "sync";
    const limit = Math.min(Math.max(Number(payload?.limit) || 50, 1), 100);

    // ── rapor: yeni veri çekmeden mevcut sıralamayı döndür ────────
    if (action === "rapor") {
      const { data, error } = await admin
        .from("sm_post_ranking")
        .select("medya_id, permalink, medya_tipi, urun_tipi, caption, yayin_tarihi, erisim, kaydetme, paylasim, begeni, yorum, kaydetme_orani, paylasim_orani, yayilma_skoru, etkilesim_orani, medyan_yayilma, yeterli_veri, karar, yas_gun")
        .eq("user_id", userId)
        // Örneklemi yetersiz gönderiler yüksek oran üretip listeyi kirletir —
        // önce yeterli_veri'ye göre ayır, sonra skora göre sırala.
        .order("yeterli_veri", { ascending: false })
        .order("yayilma_skoru", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return json({ success: true, siralama: data ?? [] }, 200, h);
    }

    if (action !== "sync") return json({ success: false, error: "Bilinmeyen action." }, 400, h);

    // ── 1) Hesap ─────────────────────────────────────────────────
    // Birden çok Instagram hesabı olabilir. Eskiden burada `maybeSingle()`
    // vardı: iki satırda hata döner, hata da kontrol edilmediği için hesap
    // sessizce `null` kalır ve metrikler RASTGELE bir hesaptan çekilirdi.
    // Artık hesap açıkça seçilir.
    const istenenHesapId = String(payload?.accountId ?? "");
    const { data: adaylar, error: hesapErr } = await admin
      .from("sm_accounts")
      .select("id, customer_id, harici_id, handle, dogrulandi")
      .eq("user_id", userId)
      .eq("platform", "instagram")
      .order("dogrulandi", { ascending: false })
      .order("created_at", { ascending: true });
    if (hesapErr) throw new Error(hesapErr.message);

    const secilebilir = (adaylar ?? []).filter((a) => a.dogrulandi);
    const hesap = istenenHesapId
      ? (adaylar ?? []).find((a) => a.id === istenenHesapId)
      : secilebilir[0];

    if (!hesap) {
      return json({
        success: false,
        error: istenenHesapId
          ? "Hesap bulunamadı."
          : "Doğrulanmış Instagram hesabı yok. Hesaplar sekmesinden bağlayın.",
      }, 400, h);
    }
    // Hangi hesabın ölçüldüğü belirsiz kalmasın: birden çok doğrulanmış
    // hesap varken çağıran accountId göndermediyse bunu açıkça bildir.
    const belirsiz = !istenenHesapId && secilebilir.length > 1;

    const { data: kimlikSatir } = await admin
      .from("sm_account_credentials")
      .select("harici_hesap").eq("account_id", hesap.id).maybeSingle();

    const igUserId = hesap.harici_id || undefined;
    const baglantiId = kimlikSatir?.harici_hesap || null;
    // Müşteri bazlı kapsam — bir müşterinin bağlantısı diğerine gitmesin.
    const composioUser = composioKullanici(COMPOSIO_USER_ID, hesap.customer_id);

    // ── 2) Gönderileri çek ───────────────────────────────────────
    const uyarilar: string[] = [];
    if (belirsiz) {
      uyarilar.push(`Birden çok doğrulanmış Instagram hesabı var; "@${hesap.handle}" ölçüldü. Diğeri için accountId gönderin.`);
    }
    const medyaPayload = await composio(
      "INSTAGRAM_GET_USER_MEDIA",
      igUserId ? { limit, ig_user_id: igUserId } : { limit },
      COMPOSIO_API_KEY,
      composioUser,
      baglantiId,
    );
    const medyalar = mediaList(medyaPayload);
    if (medyalar.length === 0) {
      return json({ success: true, cekilen: 0, yazilan: 0, siralama: [], uyarilar: ["Hesapta ölçülebilir gönderi yok."] }, 200, h);
    }

    // ── 3) Her gönderi için insights + satır kur ─────────────────
    const bugun = new Date().toISOString().slice(0, 10);
    const satirlar: any[] = [];

    for (const m of medyalar) {
      const medyaId = String(m?.id ?? "");
      if (!medyaId) continue;

      const urunTipi = m?.media_product_type ?? null;
      const set = urunTipi === "REELS" ? METRIKLER.REELS : METRIKLER.FEED;

      let ins: Record<string, number> = {};
      try {
        ins = insightsToMap(
          await composio("INSTAGRAM_GET_POST_INSIGHTS", { ig_post_id: medyaId, metric: set }, COMPOSIO_API_KEY, composioUser, baglantiId),
        );
      } catch (_e) {
        try {
          ins = insightsToMap(
            await composio("INSTAGRAM_GET_POST_INSIGHTS", { ig_post_id: medyaId, metric: METRIKLER.ASGARI }, COMPOSIO_API_KEY, composioUser, baglantiId),
          );
        } catch (e2) {
          uyarilar.push(`${medyaId}: insights alınamadı (${(e2 as Error).message})`);
        }
      }

      satirlar.push({
        user_id: userId,
        customer_id: hesap.customer_id ?? null,
        platform: "instagram",
        medya_id: medyaId,
        permalink: m?.permalink ?? null,
        medya_tipi: m?.media_type ?? null,
        urun_tipi: urunTipi,
        caption: m?.caption ? String(m.caption).slice(0, 2000) : null,
        yayin_tarihi: m?.timestamp ?? null,
        olcum_tarihi: bugun,
        erisim: ins.reach ?? null,
        gosterim: ins.impressions ?? ins.views ?? null,
        begeni: ins.likes ?? m?.like_count ?? null,
        yorum: ins.comments ?? m?.comments_count ?? null,
        kaydetme: ins.saved ?? null,
        paylasim: ins.shares ?? null,
        video_izlenme: ins.views ?? null,
        raw: { media: m, insights: ins },
      });
    }

    // ── 4) Upsert (aynı gün tekrar çalışırsa üzerine yazar) ──────
    const { error: upErr } = await admin
      .from("sm_post_metrics")
      .upsert(satirlar, { onConflict: "user_id,medya_id,olcum_tarihi" });
    if (upErr) throw new Error(`Kayıt hatası: ${upErr.message}`);

    // ── 5) Sıralamayı geri döndür ────────────────────────────────
    const { data: siralama } = await admin
      .from("sm_post_ranking")
      .select("medya_id, permalink, urun_tipi, caption, yayin_tarihi, erisim, kaydetme, paylasim, kaydetme_orani, paylasim_orani, yayilma_skoru, medyan_yayilma, yeterli_veri, karar, yas_gun")
      .eq("user_id", userId)
      .order("yeterli_veri", { ascending: false })
      .order("yayilma_skoru", { ascending: false, nullsFirst: false });

    return json({
      success: true,
      cekilen: medyalar.length,
      yazilan: satirlar.length,
      siralama: siralama ?? [],
      uyarilar,
    }, 200, h);
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500, cors(req));
  }
});
