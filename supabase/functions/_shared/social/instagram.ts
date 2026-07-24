// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// InstagramAdapter — Composio üzerinden
// ──────────────────────────────────────────────────────────────────
// ig-metrics-sync zaten Composio ile çalışıyor; aynı kimlik ve aynı
// istemci (_shared/composio.ts) yeniden kullanılır.
//
// ⚠️ TOOL ADI TUZAĞI: Composio'nun REST ucu (/tools/execute/<TOOL>) KISA
// adları kabul eder (INSTAGRAM_CREATE_MEDIA_CONTAINER, INSTAGRAM_CREATE_POST).
// MCP sunucusunun döndürdüğü uzun adlar (INSTAGRAM_POST_IG_USER_MEDIA…)
// REST'te 404 verir. Buradaki adlar REST içindir.
import {
  composioCalistir, baglantiBul, tekNesne, mediaList,
} from "../composio.ts";
import type {
  SocialAdapter, Kimlik, HesapProfili, DogrulamaSonucu,
  YayinIstegi, YayinSonucu, YorumIstegi, YorumSonucu, MetrikOpts,
} from "./types.ts";
import { henuzYok } from "./types.ts";

function kimlikCoz(k: Kimlik) {
  if (k.saglayici !== "composio" || !k.composio?.apiKey) {
    throw new Error("Instagram için Composio bağlantısı gerekli.");
  }
  return k.composio;
}

/**
 * Bu hesabın KENDİ Composio bağlantısına kilitlenmiş çağırıcı.
 *
 * `connected_account_id` verilmezse Composio, user_id'ye kayıtlı
 * bağlantılardan birini kendi seçer — iki Instagram hesabı olan bir
 * kullanıcıda ikinci hesap birincininkine düşer. `harici_hesap`
 * (sm_account_credentials) her hesabı kendi bağlantısına bağlar.
 */
async function baglam(k: Kimlik) {
  const c = kimlikCoz(k);
  const b = await baglantiBul("instagram", c, k.harici_hesap);
  if (!b) {
    throw new Error("Bağlı Instagram hesabı yok. Hesaplar sekmesinden “Bağla”ya basın.");
  }
  if (b.status && b.status.toUpperCase() !== "ACTIVE") {
    throw new Error(`Instagram bağlantısı ${b.status}. Hesabı yeniden bağlayın.`);
  }
  return {
    cagir: (tool: string, args: Record<string, unknown>) =>
      composioCalistir(tool, args, c, b.id),
  };
}

/** Composio profil yanıtı alan adlarında tutarsız — hepsini tolere et. */
function profilNormalize(ham: Record<string, any>): HesapProfili {
  return {
    handle: ham.username ?? ham.handle ?? undefined,
    harici_id: ham.id != null ? String(ham.id) : undefined,
    ad: ham.name ?? ham.full_name ?? undefined,
    takipci: ham.followers_count ?? ham.follower_count ?? undefined,
    takip: ham.follows_count ?? ham.following_count ?? undefined,
    medya_sayisi: ham.media_count ?? undefined,
    profil_resmi: ham.profile_picture_url ?? ham.profile_pic_url ?? undefined,
    biyografi: ham.biography ?? ham.bio ?? undefined,
  };
}

/** Taslak oluşturma argümanları — format + medya tipine göre. */
function taslakArgumanlari(igId: string, istek: YayinIstegi) {
  const video = !!istek.video;
  const format = istek.format ?? "feed";

  const args: Record<string, unknown> = { ig_user_id: igId };
  if (istek.caption) args.caption = istek.caption;
  if (video) args.video_url = istek.medyaUrl;
  else args.image_url = istek.medyaUrl;

  if (format === "story") {
    // Story'de content_type yok; media_type override'ı kullanılıyor.
    args.media_type = "STORIES";
  } else if (format === "reel" || format === "short" || (video && format === "feed")) {
    // Graph API v21'de feed videosu da REELS olarak yayınlanır — "VIDEO" kaldırıldı.
    args.content_type = "reel";
    args.media_type = "REELS";
    if (istek.kapakUrl) args.cover_url = istek.kapakUrl;
  } else {
    args.content_type = "photo";
  }
  return args;
}

/** GET_POST_STATUS yanıtı uçtan uca tutarsız — tüm alan adlarını tolere et. */
function durumOku(ham: Record<string, any>): string {
  const d = ham.status_code ?? ham.status ?? ham.state ?? "";
  return String(d).toUpperCase();
}

const BEKLE = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Composio tool'larının varsayılanıyla aynı sürüm — ikisi ayrışmasın. */
const GRAPH_SURUM = "v21.0";
/** Instagram yorum uzunluğu üst sınırı. */
const YORUM_SINIRI = 2200;

// ── meta_oauth yolu ───────────────────────────────────────────────
// Kendi Meta uygulamamızla bağlanan hesaplar (çoklu hesap + ilk yorum
// çözümü). Gerçek Sayfa token'ı elimizde; doğrudan Graph API'ye gideriz.
const GRAPH = `https://graph.facebook.com/${GRAPH_SURUM}`;
const metaYolu = (k: Kimlik) => k.saglayici === "meta_oauth" && !!k.erisim_token;

async function graf(yol: string, token: string, yontem = "GET", form?: Record<string, string>) {
  const opt: RequestInit = { method: yontem };
  let url = `${GRAPH}${yol}`;
  if (yontem === "GET") {
    url += `?${new URLSearchParams({ ...(form || {}), access_token: token })}`;
  } else {
    opt.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    opt.body = new URLSearchParams({ ...(form || {}), access_token: token });
  }
  const res = await fetch(url, opt);
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d?.error) throw new Error(d?.error?.message || `IG${yol}: HTTP ${res.status}`);
  return d;
}

/** meta_oauth: IG Business gönderisini iki adımda yayınlar. */
async function metaYayinla(k: Kimlik, istek: YayinIstegi): Promise<YayinSonucu> {
  const igId = k.hesap?.harici_id;
  const token = k.erisim_token;
  if (!igId) return { ok: false, hata: "Instagram Business ID'si yok. Hesabı yeniden bağlayın." };

  try {
    const video = !!istek.video;
    const format = istek.format ?? "feed";
    let taslakId = istek.taslakId;

    if (!taslakId) {
      const form: Record<string, string> = {};
      if (istek.caption) form.caption = istek.caption;
      if (format === "story") {
        form.media_type = "STORIES";
        if (video) form.video_url = istek.medyaUrl; else form.image_url = istek.medyaUrl;
      } else if (video) {
        form.media_type = "REELS"; form.video_url = istek.medyaUrl;
        if (istek.kapakUrl) form.cover_url = istek.kapakUrl;
      } else {
        form.image_url = istek.medyaUrl;
      }
      const c = await graf(`/${igId}/media`, token, "POST", form);
      taslakId = c?.id ? String(c.id) : "";
      if (!taslakId) return { ok: false, hata: "Instagram taslağı oluşturulamadı." };
    }

    // İşlenmeyi bekle (video 30-120 sn sürebilir).
    const azami = Math.max(0, istek.azamiBekleme ?? 45);
    const basla = Date.now();
    while (true) {
      const s = await graf(`/${taslakId}`, token, "GET", { fields: "status_code" });
      const durum = String(s?.status_code ?? "").toUpperCase();
      if (durum === "FINISHED") break;
      if (durum === "ERROR" || durum === "EXPIRED") {
        return { ok: false, taslakId, hata: `Instagram medyayı işleyemedi (${durum}).` };
      }
      if ((Date.now() - basla) / 1000 >= azami) {
        return { ok: false, bekliyor: true, taslakId, hata: "Instagram medyayı hâlâ işliyor." };
      }
      await BEKLE(3000);
    }

    const y = await graf(`/${igId}/media_publish`, token, "POST", { creation_id: taslakId });
    const postId = y?.id ? String(y.id) : undefined;
    if (!postId) return { ok: false, taslakId, hata: "Yayın kimliği dönmedi." };

    let link: string | undefined;
    try {
      const p = await graf(`/${postId}`, token, "GET", { fields: "permalink" });
      link = p?.permalink || undefined;
    } catch { /* link isteğe bağlı */ }

    return { ok: true, taslakId, harici_post_id: postId, url: link };
  } catch (e) {
    return { ok: false, hata: (e as Error).message, taslakId: istek.taslakId };
  }
}

export const instagramAdapter: SocialAdapter = {
  platform: "instagram",
  hazir: true,

  async profilGetir(k: Kimlik): Promise<HesapProfili> {
    if (metaYolu(k)) {
      const igId = k.hesap?.harici_id;
      if (!igId) throw new Error("Instagram Business ID'si yok.");
      const d = await graf(`/${igId}`, k.erisim_token, "GET",
        { fields: "username,name,followers_count,follows_count,media_count,profile_picture_url,biography" });
      return {
        harici_id: String(igId),
        handle: d.username, ad: d.name,
        takipci: d.followers_count, takip: d.follows_count, medya_sayisi: d.media_count,
        profil_resmi: d.profile_picture_url, biyografi: d.biography,
      };
    }
    const { cagir } = await baglam(k);
    // NOT: harici_hesap Composio BAĞLANTI id'sidir (ca_...), Instagram
    // kullanıcı id'si değil — ig_user_id yalnızca sm_accounts'tan gelir.
    const igId = k.hesap?.harici_id || undefined;
    const ham = tekNesne(
      await cagir("INSTAGRAM_GET_USER_INFO", igId ? { ig_user_id: igId } : {}),
    );
    return profilNormalize(ham);
  },

  async dogrula(k: Kimlik): Promise<DogrulamaSonucu> {
    try {
      const profil = await this.profilGetir(k);
      if (!profil.harici_id && !profil.handle) {
        return { ok: false, sebep: "Instagram profili okunamadı — hesap Business/Creator mı?" };
      }
      return {
        ok: true,
        harici_id: profil.harici_id,
        handle: profil.handle,
        profil,
      };
    } catch (e) {
      return { ok: false, sebep: (e as Error).message };
    }
  },

  /**
   * İki adımlı Graph API akışı: taslak (container) → işlenmeyi bekle → yayınla.
   *
   * Görsel neredeyse anında hazır olur, video 30-120 sn sürebilir. Edge
   * Function'ın ömrü sınırlı olduğu için sonsuza kadar beklenmez:
   * `azamiBekleme` dolduğunda `{ ok:false, bekliyor:true, taslakId }` dönülür.
   * Çağıran taslak id'sini saklar ve sonraki turda aynı isteği `taslakId`
   * ile verir — video İKİNCİ KEZ YÜKLENMEZ.
   */
  async yayinla(k: Kimlik, istek: YayinIstegi): Promise<YayinSonucu> {
    // meta_oauth: gerçek token'la doğrudan Graph API.
    if (metaYolu(k)) return metaYayinla(k, istek);

    const igId = k.hesap?.harici_id;
    if (!igId) {
      return { ok: false, hata: "Instagram Business hesap ID'si yok. Önce hesabı doğrulayın." };
    }

    try {
      const { cagir } = await baglam(k);

      // 1) Taslak — devam eden bir taslak varsa yeniden kurma.
      let taslakId = istek.taslakId;
      if (!taslakId) {
        const ham = tekNesne(
          await cagir(
            "INSTAGRAM_CREATE_MEDIA_CONTAINER",
            taslakArgumanlari(String(igId), istek),
          ),
        );
        taslakId = ham.id != null ? String(ham.id)
                 : ham.creation_id != null ? String(ham.creation_id)
                 : "";
        if (!taslakId) return { ok: false, hata: "Instagram taslağı oluşturulamadı (id dönmedi)." };
      }

      // 2) İşlenmesini bekle
      const azami = Math.max(0, istek.azamiBekleme ?? 45);
      const basla = Date.now();
      while (true) {
        const durum = durumOku(
          tekNesne(await cagir("INSTAGRAM_GET_POST_STATUS", { creation_id: taslakId })),
        );
        if (durum.includes("FINISHED") || durum.includes("PUBLISHED")) break;
        if (durum.includes("ERROR") || durum.includes("EXPIRED")) {
          return { ok: false, taslakId, hata: `Instagram medyayı işleyemedi (${durum}).` };
        }
        if ((Date.now() - basla) / 1000 >= azami) {
          // Zaman aşımı bir HATA DEĞİL: video hâlâ işleniyor olabilir.
          return { ok: false, bekliyor: true, taslakId, hata: "Instagram medyayı hâlâ işliyor." };
        }
        await BEKLE(3000);
      }

      // 3) Yayınla
      const yayin = tekNesne(
        await cagir(
          "INSTAGRAM_CREATE_POST",
          { ig_user_id: String(igId), creation_id: taslakId },
        ),
      );
      const postId = yayin.id != null ? String(yayin.id) : undefined;
      if (!postId) return { ok: false, taslakId, hata: "Yayın kimliği dönmedi." };

      return {
        ok: true,
        taslakId,
        harici_post_id: postId,
        url: await permalinkBul(postId, String(igId), cagir),
      };
    } catch (e) {
      return { ok: false, hata: (e as Error).message };
    }
  },

  /**
   * Yayınlanan gönderinin altına ilk yorumu yazar.
   *
   * ⚠ Composio'nun Instagram REST setinde "kendi gönderine yorum yaz" tool'u
   * YOK — yalnızca INSTAGRAM_REPLY_TO_COMMENT (var olan bir yoruma cevap) ve
   * INSTAGRAM_GET_POST_COMMENTS var. Bu yüzden OAuth yine Composio'da kalır,
   * istek doğrudan Graph'a gider (YouTube adapter'ındaki desenin aynısı).
   *
   * Bağlantı "Instagram login" izinleriyle açılıyor (instagram_business_*),
   * yani doğru host graph.instagram.com. Eski Facebook-login bağlantıları
   * için graph.facebook.com'a düşülür.
   */
  /**
   * İlk yorum ŞU AN YAPILAMIYOR — sebebini açıkça döndürüyoruz.
   *
   * Gönderiye üst düzey yorum atmak Graph API'de POST /{media-id}/comments
   * demek; bunun için gerçek bir access token gerekiyor. Composio ise bağlı
   * hesap uçlarında token'ları "REDACTED" olarak maskeliyor, tool setinde de
   * yalnızca INSTAGRAM_REPLY_TO_COMMENT var (mevcut bir yoruma CEVAP verir,
   * yeni yorum açmaz).
   *
   * Çözüm: kendi Meta uygulamamızla OAuth. O zaman token
   * `sm_account_credentials.erisim_token`'a yazılır ve buradaki eski
   * doğrudan-Graph çağrısı geri getirilir.
   */
  async yorumYaz(k: Kimlik, istek: YorumIstegi): Promise<YorumSonucu> {
    // Yalnızca meta_oauth: gerçek token'la POST /{media-id}/comments.
    if (!metaYolu(k)) {
      return {
        ok: false,
        hata:
          "İlk yorum yalnızca Meta ile bağlanan hesaplarda çalışır (Composio yorum açma " +
          "ucunu sunmuyor). Hesabı “Yeniden bağla” ile Meta'ya taşıyın; gönderi yayınlandı.",
      };
    }
    const metin = String(istek.metin ?? "").trim();
    if (!metin) return { ok: false, hata: "Yorum metni boş." };
    if (!istek.postId) return { ok: false, hata: "Gönderi kimliği yok." };
    try {
      const d = await graf(`/${istek.postId}/comments`, k.erisim_token, "POST",
        { message: metin.slice(0, YORUM_SINIRI) });
      if (d?.id) return { ok: true, yorumId: String(d.id) };
      return { ok: false, hata: "Yorum kimliği dönmedi." };
    } catch (e) {
      return { ok: false, hata: (e as Error).message };
    }
  },

  metrikler(_k: Kimlik, _opts: MetrikOpts): Promise<unknown> {
    // Faz 5: ig-metrics-sync bu işi zaten yapıyor; buraya taşınacak.
    return henuzYok("instagram", "metrikler");
  },
};

/**
 * Permalink'i en iyi çabayla bulur. Composio'nun REST setinde "id ile tek
 * medya getir" yok, o yüzden son gönderiler taranır. Bulunamazsa yayın
 * yine de başarılıdır — sadece link gösterilmez.
 */
async function permalinkBul(
  postId: string,
  igId: string,
  cagir: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<string | undefined> {
  try {
    const liste = mediaList(
      await cagir("INSTAGRAM_GET_USER_MEDIA", { ig_user_id: igId, limit: 5 }),
    );
    return liste.find((m: any) => String(m?.id) === postId)?.permalink || undefined;
  } catch {
    return undefined;
  }
}
