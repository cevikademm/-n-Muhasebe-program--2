// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// sm-publish  (JWT required — logged-in app users)
// ──────────────────────────────────────────────────────────────────
// Medya kütüphanesindeki bir varlığı seçilen sosyal hesaplara yayınlar.
// Her hedef `sm_yayinlar` içinde AYRI bir satırdır: platformlar bağımsız
// başarısız olur, yalnızca patlayan hedef yeniden denenir.
//
//   POST { action:"yayinla", mediaId, customerId?, otomasyon?, hedefler:[{accountId, format?, caption?}] }
//        → { success, yayinlar:[satır] }
//   POST { action:"kontrol", yayinIds:[id] }   → devam eden işleri ilerletir
//   POST { action:"tekrar",  yayinId }         → hatalı işi sıfırlayıp yeniden dener
//   POST { action:"iptal",   yayinId }
//
// Yayın metni `sm_otomasyon` kuralından geçirilir: etiketler eklenir ve
// gönderinin altına düşecek ilk yorum ÜRETİLİR (otomasyon:false ile kapatılır).
// Yorum yayının başarısını belirlemez — ayrı durumu, ayrı denemesi vardır.
//
// Token'lar `sm_account_credentials`'ta durur (RLS açık + 0 politika) ve
// yalnızca buradaki service_role istemcisi okur — client asla görmez.
//
// Env: COMPOSIO_API_KEY, COMPOSIO_USER_ID,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adapterAl } from "../_shared/social/registry.ts";
import { geciciKopyaOlustur, geciciSil, geciciSupur } from "../_shared/social/staging.ts";
import { metinKur, kuralCoz } from "../_shared/social/otomasyon.ts";
import { composioKullanici } from "../_shared/composio.ts";
import { gecerliToken } from "../_shared/google.ts";
import { gecerliToken as ttGecerliToken } from "../_shared/tiktok.ts";

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

const FORMATLAR = ["feed", "reel", "story", "video", "short"];

/** Platform başına caption üst sınırı — components/sosyal/ortak.ts ile aynı. */
const CAPTION_SINIRI: Record<string, number> = {
  instagram: 2200, facebook: 5000, youtube: 5000, tiktok: 2200,
  linkedin: 3000, x: 280, pinterest: 500,
};

/** İlk yorum kaç kez denenir; sonra satır "hata" olarak dinlenir. */
const YORUM_AZAMI_DENEME = 3;

/**
 * Client format göndermediğinde kullanılacak varsayılan — PLATFORMA GÖRE.
 * Düz "reel" varsayılanı YouTube hedefinde geçersiz bir satır üretirdi.
 */
function varsayilanFormat(platform: string, video: boolean): string {
  if (platform === "youtube") return video ? "short" : "video";
  return video ? "reel" : "feed";
}
/**
 * Fonksiyonun toplam bütçesi. Platform tarafı video işlerken dakikalarca
 * bekleyebilir; burada takılıp kalmak yerine iş `yayinlaniyor` durumunda
 * bırakılır ve client `kontrol` ile devam ettirir.
 */
const TOPLAM_BUTCE_MS = 110_000;

/** Hedefin müşterisine göre kapsanmış Composio kimliği. */
function composioKimlikKur(ctx: any, hesap: any) {
  return {
    apiKey: ctx.composio.apiKey,
    userId: composioKullanici(ctx.composio.userId, hesap?.customer_id),
  };
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

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ success: false, error: "Sunucu yapılandırma hatası." }, 500, h);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Oturum bulunamadı." }, 401, h);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, error: "Yetkisiz." }, 401, h);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const govde = await req.json().catch(() => ({}));
    const action = String(govde?.action ?? "");
    const bitisZamani = Date.now() + TOPLAM_BUTCE_MS;

    const ctx = {
      admin,
      /**
       * TABAN kimlik. Gerçek çağrılarda müşteri kapsamı uygulanır
       * (composioKimlikKur) — bir müşterinin bağlantısı diğerine gitmesin.
       */
      composio: { apiKey: COMPOSIO_API_KEY, userId: COMPOSIO_USER_ID },
      /** Aynı medyanın public kopyası hedefler arasında paylaşılır. */
      kopyalar: new Map<string, { yol: string; url: string }>(),
      kalanSn: () => Math.max(0, Math.floor((bitisZamani - Date.now()) / 1000)),
    };

    // ── iptal ─────────────────────────────────────────────────────
    if (action === "iptal") {
      const satir = await satirAl(userClient, govde?.yayinId);
      if (!satir) return json({ success: false, error: "Yayın bulunamadı." }, 404, h);
      if (satir.durum === "yayinlandi") {
        return json({ success: false, error: "Yayınlanmış gönderi iptal edilemez." }, 400, h);
      }
      await admin.from("sm_yayinlar")
        .update({ durum: "iptal", bitis: new Date().toISOString() }).eq("id", satir.id);
      await geciciSil(admin, [satir.gecici_yol]);
      return json({ success: true }, 200, h);
    }

    // ── yayinla ───────────────────────────────────────────────────
    if (action === "yayinla") {
      const mediaId = String(govde?.mediaId ?? "");
      const hedefler = Array.isArray(govde?.hedefler) ? govde.hedefler : [];
      if (!mediaId || !hedefler.length) {
        return json({ success: false, error: "mediaId ve en az bir hedef gerekli." }, 400, h);
      }
      if (hedefler.length > 10) {
        return json({ success: false, error: "Tek seferde en fazla 10 hedef." }, 400, h);
      }

      // YETKİ: medya ve hesaplar KULLANICI istemcisiyle okunur → RLS altında
      // görünmüyorlarsa istek burada durur, service_role hiç devreye girmez.
      const { data: medya } = await userClient
        .from("sm_media")
        .select("id, user_id, customer_id, depo_yolu, mime_tipi, baslik, sure, cozunurluk")
        .eq("id", mediaId).maybeSingle();
      if (!medya) return json({ success: false, error: "Medya bulunamadı." }, 404, h);

      const hesapIdleri = hedefler.map((t: any) => String(t?.accountId ?? "")).filter(Boolean);
      const { data: hesaplar } = await userClient
        .from("sm_accounts")
        .select("id, user_id, customer_id, platform, handle, harici_id, dogrulandi")
        .in("id", hesapIdleri);

      const hesapHarita = new Map((hesaplar || []).map((x: any) => [x.id, x]));
      if (hesapHarita.size !== new Set(hesapIdleri).size) {
        return json({ success: false, error: "Bir veya daha fazla hesap bulunamadı." }, 404, h);
      }

      await geciciSupur(admin, medya.user_id);

      // Otomasyon kuralları: hashtag'ler ve ilk yorum buradan üretilir.
      // Kullanıcı modalde "bu gönderi için kapat" derse hiç okunmaz.
      const kurallar = govde?.otomasyon === false
        ? []
        : await kurallariOku(userClient, medya.user_id, medya.customer_id);

      // SEO ajanı "gönderi modu"ndaysa etiket/başlık havuzdan DEĞİL, önceden
      // üretilip saklanmış öneriden gelir. Burada ASLA senkron AI çağrısı
      // yapılmaz: öneri yoksa sessizce havuz moduna düşülür — yayın beklemez
      // ve kullanıcının modalde gördüğü metin ile giden metin ayrışmaz.
      const seoOneriler = govde?.otomasyon === false
        ? new Map()
        : await seoOnerileriOku(userClient, medya, hedefler, hesapHarita);

      // Satırları önce yaz: fonksiyon ortada ölse bile kuyrukta iz kalır.
      const yeniSatirlar = hedefler.map((t: any) => {
        const hesap = hesapHarita.get(String(t.accountId));
        const format = FORMATLAR.includes(String(t?.format)) ? String(t.format)
                     : varsayilanFormat(hesap.platform, (medya.mime_tipi || "").startsWith("video/"));

        const oneri = seoOneriler.get(`${hesap.platform}|${format}`)
                   ?? seoOneriler.get(`${hesap.platform}|`);

        // Kullanıcı hedefe özel metin yazdıysa o kazanır; yazmadıysa ajanın
        // caption'ı taban alınır. Ajan metni ORTAK METİN kutusunu ezmez.
        const hamCaption = typeof t?.caption === "string" && t.caption.trim()
          ? t.caption
          : (oneri?.caption ?? (typeof t?.caption === "string" ? t.caption : ""));

        // Nihai metin SATIRA yazılır: yeniden denemede etiketler bir kez daha
        // eklenmesin, kullanıcı da neyin gittiğini kuyrukta görebilsin.
        const otomasyon = metinKur({
          kural: kuralCoz(kurallar, hesap.platform),
          caption: hamCaption,
          platform: hesap.platform,
          format,
          tohum: medya.id,
          baslik: oneri?.baslik ?? medya.baslik,
          handle: hesap.handle,
          captionSiniri: CAPTION_SINIRI[hesap.platform] ?? 2200,
          hazirHashtagler: oneri?.hashtagler ?? null,
          hazirYorum: oneri?.ilk_yorum ?? null,
        });

        return {
          user_id: medya.user_id,
          customer_id: medya.customer_id,
          media_id: medya.id,
          account_id: hesap.id,
          platform: hesap.platform,
          format,
          caption: otomasyon.caption || null,
          baslik: oneri?.baslik ?? medya.baslik ?? null,
          yorum_metni: otomasyon.yorum,
          yorum_durum: otomasyon.yorum ? "bekliyor" : "yok",
          uygulanan_hashtagler: otomasyon.hashtagler,
          seo_oneri_id: oneri?.id ?? null,
          durum: "kuyrukta",
        };
      });

      const { data: eklenen, error: eklemeHatasi } = await admin
        .from("sm_yayinlar").insert(yeniSatirlar).select();
      if (eklemeHatasi) throw new Error(eklemeHatasi.message);

      const sonuclar = [];
      for (const satir of eklenen) {
        sonuclar.push(await isiIsle(ctx, satir, medya, hesapHarita.get(satir.account_id)));
      }
      await kopyalariTemizle(ctx, sonuclar);
      return json({ success: true, yayinlar: sonuclar }, 200, h);
    }

    // ── kontrol / tekrar ──────────────────────────────────────────
    if (action === "kontrol" || action === "tekrar") {
      const idler = action === "tekrar"
        ? [String(govde?.yayinId ?? "")].filter(Boolean)
        : (Array.isArray(govde?.yayinIds) ? govde.yayinIds.map(String).slice(0, 20) : []);
      if (!idler.length) return json({ success: false, error: "yayinId gerekli." }, 400, h);

      const { data: satirlar } = await userClient
        .from("sm_yayinlar").select("*").in("id", idler);
      if (!satirlar?.length) return json({ success: true, yayinlar: [] }, 200, h);

      const sonuclar = [];
      for (const satir of satirlar) {
        if (satir.durum === "iptal") { sonuclar.push(satir); continue; }

        // Yayınlanmış satırda yapılacak TEK iş kalan ilk yorumdur; video
        // hiçbir koşulda ikinci kez yayınlanmaz.
        if (satir.durum === "yayinlandi") {
          const temel = action === "tekrar" && satir.yorum_durum === "hata"
            ? await satiriYaz(admin, satir.id, {
                yorum_durum: "bekliyor", yorum_deneme: 0, yorum_hata: null,
              })
            : satir;
          if (!yorumBekliyor(temel) || ctx.kalanSn() < 5) { sonuclar.push(temel); continue; }

          const { data: yorumHesabi } = await userClient
            .from("sm_accounts").select("id, customer_id, platform, handle, harici_id, dogrulandi")
            .eq("id", temel.account_id).maybeSingle();
          sonuclar.push(yorumHesabi ? await yorumuIsle(ctx, temel, yorumHesabi) : temel);
          continue;
        }

        if (action === "kontrol" && satir.durum === "hata") { sonuclar.push(satir); continue; }
        if (ctx.kalanSn() < 5) { sonuclar.push(satir); continue; }

        const { data: medya } = await userClient
          .from("sm_media").select("id, user_id, customer_id, depo_yolu, mime_tipi, baslik, sure, cozunurluk")
          .eq("id", satir.media_id).maybeSingle();
        const { data: hesap } = await userClient
          .from("sm_accounts").select("id, customer_id, platform, handle, harici_id, dogrulandi")
          .eq("id", satir.account_id).maybeSingle();
        if (!medya || !hesap) {
          sonuclar.push(await satiriYaz(admin, satir.id, {
            durum: "hata", hata: "Medya veya hesap silinmiş.", bitis: new Date().toISOString(),
          }));
          continue;
        }
        // "tekrar" hatalı işi sıfırdan başlatır: bayat taslak id'si taşınmaz.
        const temel = action === "tekrar" ? { ...satir, harici_taslak_id: null, hata: null } : satir;
        sonuclar.push(await isiIsle(ctx, temel, medya, hesap));
      }
      await kopyalariTemizle(ctx, sonuclar);
      return json({ success: true, yayinlar: sonuclar }, 200, h);
    }

    return json({ success: false, error: "Bilinmeyen action." }, 400, h);
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500, cors(req));
  }
});

// ── yardımcılar ────────────────────────────────────────────────────

async function satirAl(userClient: any, id: unknown) {
  if (!id) return null;
  const { data } = await userClient
    .from("sm_yayinlar").select("*").eq("id", String(id)).maybeSingle();
  return data;
}

async function satiriYaz(admin: any, id: string, yama: Record<string, unknown>) {
  const { data } = await admin
    .from("sm_yayinlar").update(yama).eq("id", id).select().maybeSingle();
  return data;
}

/** Token satırı — yalnızca service_role okuyabilir. */
async function kimlikOku(admin: any, accountId: string) {
  const { data } = await admin
    .from("sm_account_credentials")
    .select("saglayici, harici_hesap, erisim_token, yenileme_token, gecerlilik")
    .eq("account_id", accountId).maybeSingle();
  return data;
}

/**
 * Bu markanın AÇIK otomasyon kuralları. Kullanıcı istemcisiyle okunur:
 * RLS altında görünmüyorsa kural yok sayılır, metin olduğu gibi gider.
 */
async function kurallariOku(userClient: any, userId: string, customerId: string | null) {
  let q = userClient.from("sm_otomasyon").select("*").eq("user_id", userId).eq("aktif", true);
  q = customerId == null ? q.is("customer_id", null) : q.eq("customer_id", customerId);
  const { data } = await q;
  return data || [];
}

/**
 * SEO ajanının bu medya için ürettiği önerileri okur.
 *
 * Moda BAKMAZ: bir öneri satırı varsa kullanıcı onu bilerek üretmiştir
 * (gönderi modunda otomatik, ya da yayın modalindeki "AI ile üret" düğmesiyle).
 * Havuz modunda hiç öneri üretilmediyse satır bulunmaz ve sistem sessizce
 * havuz seçimine düşer — davranış değişmez. Kullanıcı istemcisiyle okunur:
 * RLS altında görünmüyorsa öneri yok sayılır.
 *
 * Anahtar: "platform|format" — formatı olmayan (genel) öneriler "platform|"
 * anahtarıyla ikinci sırada denenir.
 */
async function seoOnerileriOku(
  userClient: any,
  medya: any,
  hedefler: any[],
  hesapHarita: Map<string, any>,
): Promise<Map<string, any>> {
  const bos = new Map<string, any>();
  try {
    // Profil yalnızca tercih edilen dili öğrenmek için okunur (mod filtresi yok).
    let pq = userClient.from("sm_seo_profil")
      .select("diller").eq("user_id", medya.user_id);
    pq = medya.customer_id == null ? pq.is("customer_id", null) : pq.eq("customer_id", medya.customer_id);
    const { data: profil } = await pq.maybeSingle();

    const dil = (Array.isArray(profil?.diller) && profil.diller[0]) || "de";
    const platformlar = [...new Set(
      hedefler.map((t: any) => hesapHarita.get(String(t?.accountId))?.platform).filter(Boolean),
    )];
    if (!platformlar.length) return bos;

    const { data: oneriler } = await userClient
      .from("sm_seo_oneriler")
      .select("id, platform, format, baslik, caption, hashtagler, ilk_yorum")
      .eq("user_id", medya.user_id)
      .eq("media_id", medya.id)
      .eq("dil", dil)
      .in("platform", platformlar);

    const harita = new Map<string, any>();
    for (const o of oneriler ?? []) harita.set(`${o.platform}|${o.format ?? ""}`, o);
    return harita;
  } catch (e) {
    // Öneri okunamazsa yayın DURMAZ — havuz seçimine düşülür.
    console.warn("[sm-publish] SEO önerileri okunamadı:", e?.message || e);
    return bos;
  }
}

// ── Otomatik ilk yorum ─────────────────────────────────────────────

/** Satırda yazılmayı bekleyen bir yorum var mı? */
function yorumBekliyor(satir: any): boolean {
  return !!satir
    && satir.durum === "yayinlandi"
    && satir.yorum_durum === "bekliyor"
    && !!satir.yorum_metni
    && (satir.yorum_deneme ?? 0) < YORUM_AZAMI_DENEME;
}

/**
 * Yayınlanmış gönderinin altına ilk yorumu yazar.
 *
 * TASARIM: yorum HİÇBİR ZAMAN yayının durumunu değiştirmez. Gönderi
 * yayınlandıysa iş başarılıdır; yorum kendi durumu (`yorum_durum`) ve kendi
 * deneme sayacıyla izlenir. Aksi hâlde yorum hatası yüzünden "tekrar dene"ye
 * basan kullanıcı aynı videoyu ikinci kez yayınlardı.
 */
async function yorumuIsle(ctx: any, satir: any, hesap: any, kimlikSatir?: any) {
  const { admin } = ctx;
  if (!yorumBekliyor(satir)) return satir;

  const adapter = adapterAl(satir.platform);
  if (typeof adapter.yorumYaz !== "function") {
    return satiriYaz(admin, satir.id, {
      yorum_durum: "desteklenmiyor",
      yorum_hata: `${satir.platform} için otomatik yorum ucu henüz bağlı değil.`,
    });
  }

  const deneme = (satir.yorum_deneme ?? 0) + 1;
  /** Son denemede de olmadıysa artık "hata"; değilse kuyrukta kalıp tekrar denenir. */
  const basarisiz = (mesaj: string) => satiriYaz(admin, satir.id, {
    yorum_durum: deneme >= YORUM_AZAMI_DENEME ? "hata" : "bekliyor",
    yorum_hata: mesaj,
    yorum_deneme: deneme,
  });

  if (!satir.harici_post_id) {
    return basarisiz("Gönderi kimliği alınamadı; yorum yazılamıyor.");
  }

  const kimlik = kimlikSatir ?? await kimlikOku(admin, hesap.id);
  if (!kimlik) return basarisiz("Hesabın kayıtlı bağlantısı yok.");

  try {
    const sonuc = await adapter.yorumYaz(
      {
        ...kimlik,
        composio: composioKimlikKur(ctx, hesap),
        hesap: { harici_id: hesap.harici_id, handle: hesap.handle },
      },
      { postId: String(satir.harici_post_id), metin: String(satir.yorum_metni) },
    );

    if (sonuc?.ok) {
      return satiriYaz(admin, satir.id, {
        yorum_durum: "yazildi",
        harici_yorum_id: sonuc.yorumId ?? null,
        yorum_hata: null,
        yorum_deneme: deneme,
      });
    }
    return basarisiz(sonuc?.hata || "Yorum yazılamadı.");
  } catch (e) {
    return basarisiz((e as Error).message);
  }
}

/**
 * Tek bir yayın işini ilerletir. Dönen satır her zaman veritabanındaki
 * güncel haldir — client'ın ayrıca sorgu atmasına gerek kalmaz.
 */
async function isiIsle(ctx: any, satir: any, medya: any, hesap: any) {
  const { admin } = ctx;
  const simdi = new Date().toISOString();

  const adapter = adapterAl(satir.platform);
  if (!adapter.hazir) {
    return satiriYaz(admin, satir.id, {
      durum: "hata",
      hata: `${satir.platform} yayınlaması henüz desteklenmiyor. Instagram şu an aktif.`,
      bitis: simdi,
    });
  }
  if (!hesap.dogrulandi) {
    return satiriYaz(admin, satir.id, {
      durum: "hata",
      hata: "Hesap doğrulanmamış. Hesaplar sekmesinden bağlantıyı doğrulayın.",
      bitis: simdi,
    });
  }

  const kimlikSatir = await kimlikOku(admin, hesap.id);
  if (!kimlikSatir) {
    return satiriYaz(admin, satir.id, {
      durum: "hata",
      hata: "Bu hesap için kayıtlı bağlantı yok. Hesaplar sekmesinden “Doğrula”ya basın.",
      bitis: simdi,
    });
  }

  // Google yolunda (YouTube) token'ın süresi dolmuş olabilir. Yenileme
  // adapter'da değil burada: adapter'ın veritabanı erişimi yok.
  if (kimlikSatir.saglayici === "google_oauth") {
    try {
      kimlikSatir.erisim_token = await gecerliToken(
        admin, hesap.id, kimlikSatir,
        Deno.env.get("GOOGLE_CLIENT_ID") ?? "", Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      );
    } catch (e) {
      return satiriYaz(admin, satir.id, { durum: "hata", hata: (e as Error).message, bitis: simdi });
    }
  }
  if (kimlikSatir.saglayici === "tiktok_oauth") {
    try {
      kimlikSatir.erisim_token = await ttGecerliToken(
        admin, hesap.id, kimlikSatir,
        Deno.env.get("TIKTOK_CLIENT_KEY") ?? "", Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "",
      );
    } catch (e) {
      return satiriYaz(admin, satir.id, { durum: "hata", hata: (e as Error).message, bitis: simdi });
    }
  }

  await satiriYaz(admin, satir.id, {
    durum: "yayinlaniyor",
    baslangic: satir.baslangic ?? simdi,
    deneme: (satir.deneme ?? 0) + 1,
    hata: null,
  });

  const video = String(medya.mime_tipi || "").startsWith("video/");
  const istek: Record<string, unknown> = {
    caption: satir.caption ?? undefined,
    format: satir.format,
    video,
    // YouTube başlık zorunlu tutuyor, Shorts uygunluğu da süre/çözünürlükten
    // hesaplanıyor — adapter tahmin etmesin diye medyadan taşınıyor.
    // Satırdaki başlık SEO ajanından gelmiş olabilir; yoksa medyanınki.
    baslik: satir.baslik ?? medya.baslik ?? null,
    sureSn: medya.sure ?? null,
    cozunurluk: medya.cozunurluk ?? null,
    taslakId: satir.harici_taslak_id ?? undefined,
    // Kalan bütçenin tamamını tek hedefe verme: sıradaki hedeflere de yer kalsın.
    azamiBekleme: Math.min(60, Math.max(5, ctx.kalanSn() - 15)),
    medyaUrl: "",
  };

  let geciciYol: string | null = satir.gecici_yol ?? null;
  try {
    // Taslak zaten varsa platform medyayı almış demektir → yeniden kopya çıkarma.
    if (!istek.taslakId) {
      let kopya = ctx.kopyalar.get(medya.id);
      if (!kopya) {
        kopya = await geciciKopyaOlustur(admin, medya.depo_yolu);
        ctx.kopyalar.set(medya.id, kopya);
      }
      istek.medyaUrl = kopya.url;
      geciciYol = kopya.yol;
      await satiriYaz(admin, satir.id, { gecici_yol: geciciYol });
    }

    const sonuc = await adapter.yayinla(
      {
        ...kimlikSatir,
        composio: composioKimlikKur(ctx, hesap),
        hesap: { harici_id: hesap.harici_id, handle: hesap.handle },
      },
      istek,
    );

    if (sonuc.ok) {
      // Medyayı da "yayınlandı" işaretle — kütüphanede rozet olarak görünür.
      await admin.from("sm_media").update({ durum: "yayinlandi" }).eq("id", medya.id);
      const yayinlanan = await satiriYaz(admin, satir.id, {
        durum: "yayinlandi",
        harici_taslak_id: sonuc.taslakId ?? satir.harici_taslak_id ?? null,
        harici_post_id: sonuc.harici_post_id ?? null,
        yayin_url: sonuc.url ?? null,
        hata: null,
        bitis: new Date().toISOString(),
      });
      // İlk yorum hemen denenir; patlarsa satır yine "yayinlandi" kalır.
      return yorumuIsle(ctx, yayinlanan, hesap, kimlikSatir);
    }

    if (sonuc.bekliyor) {
      // Hata değil: platform hâlâ işliyor. Satır açık kalır, client `kontrol` çağırır.
      return satiriYaz(admin, satir.id, {
        durum: "yayinlaniyor",
        harici_taslak_id: sonuc.taslakId ?? null,
        hata: sonuc.hata ?? null,
      });
    }

    return satiriYaz(admin, satir.id, {
      durum: "hata",
      harici_taslak_id: sonuc.taslakId ?? null,
      hata: sonuc.hata || "Yayınlanamadı.",
      bitis: new Date().toISOString(),
    });
  } catch (e) {
    return satiriYaz(admin, satir.id, {
      durum: "hata", hata: (e as Error).message, bitis: new Date().toISOString(),
    });
  }
}

/**
 * Bu turda üretilen public kopyaları siler — ama YALNIZCA hiçbir satır o
 * medyayı hâlâ beklemiyorsa. Bir hedef `yayinlaniyor` kaldıysa platform
 * dosyayı henüz çekiyor olabilir; kopya bir sonraki turda süpürülür.
 */
async function kopyalariTemizle(ctx: any, sonuclar: any[]) {
  const acikMedyalar = new Set(
    sonuclar.filter((s) => s?.durum === "yayinlaniyor").map((s) => s.media_id),
  );
  const silinecek: string[] = [];
  const bitenIdler: string[] = [];

  for (const [mediaId, kopya] of ctx.kopyalar) {
    if (acikMedyalar.has(mediaId)) continue;
    silinecek.push(kopya.yol);
    for (const s of sonuclar) if (s?.media_id === mediaId) bitenIdler.push(s.id);
  }

  if (!silinecek.length) return;
  await geciciSil(ctx.admin, silinecek);
  if (bitenIdler.length) {
    await ctx.admin.from("sm_yayinlar").update({ gecici_yol: null }).in("id", bitenIdler);
  }
}
