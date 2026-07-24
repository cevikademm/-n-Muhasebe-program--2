// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// TikTokAdapter — iki yollu
// ──────────────────────────────────────────────────────────────────
//   saglayici = "tiktok_oauth"  → KENDİ OAuth istemcimiz. Gerçek token var;
//                                 doğrulama da yayın da TikTok API'sine gider.
//   saglayici = "composio"      → yalnızca doğrulama (Composio tool'ları).
//
// Composio yolunun neden yayınlayamadığı: TikTok için Composio'nun yönetimli
// OAuth uygulaması YOK ve token'ı maskeliyor. Bu yüzden Login Kit + Content
// Posting API'yi kendi TikTok Developer app'imizle kullanıyoruz.
//
// SANDBOX NOTU: Uygulama denetimden geçene kadar TikTok herkese açık paylaşıma
// izin vermez; `gizlilikSec` izin verilen ilk seçeneği kullanır (genelde
// SELF_ONLY) ve yayın sonucuna bunu not düşer.
import { baglantiBul, composioCalistir, tekNesne } from "../composio.ts";
import { TIKTOK_API } from "../tiktok.ts";
import type {
  SocialAdapter, Kimlik, HesapProfili, DogrulamaSonucu,
  YayinIstegi, YayinSonucu, MetrikOpts,
} from "./types.ts";
import { henuzYok } from "./types.ts";

const PARCA = 60 * 1024 * 1024;          // TikTok tek parçada en çok ~64 MB
const BASLIK_SINIRI = 90;                // UTF-16 rune
const BEKLE = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tiktokYolu = (k: Kimlik) => k.saglayici === "tiktok_oauth" && !!k.erisim_token;

function composioKimligi(k: Kimlik) {
  if (!k.composio?.apiKey) throw new Error("TikTok için bağlantı gerekli.");
  return k.composio;
}
async function baglam(k: Kimlik) {
  const c = composioKimligi(k);
  const b = await baglantiBul("tiktok", c, k.harici_hesap);
  if (!b) throw new Error("Bağlı TikTok hesabı yok. Hesaplar sekmesinden “Bağla”ya basın.");
  return { cagir: (t: string, a: Record<string, unknown>) => composioCalistir(t, a, c, b.id) };
}

/** TikTok API çağrısı; { data, error:{code} } sarmalını açar. */
async function tiktok(yol: string, token: string, govde?: unknown): Promise<any> {
  const res = await fetch(`${TIKTOK_API}${yol}`, {
    method: govde ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(govde ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
    },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  const e = body?.error;
  if (e && e.code && String(e.code).toLowerCase() !== "ok") {
    throw new Error(`${e.code}: ${e.message || "TikTok hatası"}`);
  }
  if (!res.ok) throw new Error(`TikTok ${yol}: HTTP ${res.status}`);
  return body?.data ?? body;
}

function baslikUret(istek: YayinIstegi): string {
  const ham =
    (istek.baslik && istek.baslik.trim()) ||
    (istek.caption || "").split("\n").map((s) => s.trim()).find(Boolean) || "Video";
  return ham.slice(0, BASLIK_SINIRI);
}

async function kaynakBilgisi(url: string): Promise<{ boyut: number; tip: string }> {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`Medya okunamadı (HTTP ${res.status}).`);
  const boyut = Number(res.headers.get("content-length") || 0);
  if (!boyut) throw new Error("Medya boyutu okunamadı; TikTok boyutu önceden şart koşuyor.");
  return { boyut, tip: res.headers.get("content-type") || "video/mp4" };
}

/** Hesabın izin verdiği gizlilik seçenekleri (denetimsiz app → çoğunlukla SELF_ONLY). */
async function gizlilikSec(token: string): Promise<{ seviye: string; herkeseAcik: boolean }> {
  const d = await tiktok("/post/publish/creator_info/query/", token, {});
  const secenekler: string[] = d?.privacy_level_options ?? [];
  if (secenekler.includes("PUBLIC_TO_EVERYONE")) return { seviye: "PUBLIC_TO_EVERYONE", herkeseAcik: true };
  return { seviye: secenekler[0] || "SELF_ONLY", herkeseAcik: false };
}

/** Baytları upload_url'e parça parça akıtır. */
async function parcalariGonder(uploadUrl: string, medyaUrl: string, boyut: number, tip: string, parcaBoyu: number) {
  for (let basla = 0; basla < boyut; basla += parcaBoyu) {
    const bit = Math.min(basla + parcaBoyu, boyut) - 1;
    const kaynak = await fetch(medyaUrl, { headers: { Range: `bytes=${basla}-${bit}` } });
    if (!kaynak.ok || !kaynak.body) throw new Error(`Medya parçası indirilemedi (HTTP ${kaynak.status}).`);

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": tip,
        "Content-Length": String(bit - basla + 1),
        "Content-Range": `bytes ${basla}-${bit}/${boyut}`,
      },
      body: kaynak.body,
      duplex: "half",
    } as RequestInit);
    if (![200, 201, 206].includes(res.status)) throw new Error(`Parça yüklenemedi (HTTP ${res.status}).`);
  }
}

/** publish_id durumunu yoklar. */
async function durumYokla(token: string, publishId: string, azamiSn: number) {
  const basla = Date.now();
  while (true) {
    const d = await tiktok("/post/publish/status/fetch/", token, { publish_id: publishId });
    const durum = String(d?.status ?? "").toUpperCase();
    if (durum === "PUBLISH_COMPLETE") {
      const pid = (d?.publicaly_available_post_id ?? d?.publicly_available_post_id ?? [])[0];
      return { bitti: true, postId: pid != null ? String(pid) : undefined };
    }
    if (durum === "FAILED") throw new Error(`TikTok yayını başarısız (${d?.fail_reason || "sebep belirtilmedi"}).`);
    if ((Date.now() - basla) / 1000 >= azamiSn) return { bitti: false };
    await BEKLE(3000);
  }
}

export const tiktokAdapter: SocialAdapter = {
  platform: "tiktok",
  hazir: true,

  async profilGetir(k: Kimlik): Promise<HesapProfili> {
    if (tiktokYolu(k)) {
      // SADECE user.info.basic alanları: open_id, display_name, avatar_url.
      // username (profile) / follower_count vb. (stats) ayrı izin ister; onları
      // istemek TÜM çağrıyı scope_not_authorized ile reddettirir.
      const d = await tiktok("/user/info/?fields=open_id,display_name,avatar_url", k.erisim_token);
      const u = d?.user ?? d ?? {};
      return {
        harici_id: u.open_id ? String(u.open_id) : undefined,
        // Kullanıcının girdiği handle'ı koru (API username vermiyor).
        handle: k.hesap?.handle || undefined,
        ad: u.display_name,
        profil_resmi: u.avatar_url,
      };
    }
    // Composio yolu
    const { cagir } = await baglam(k);
    const ham = tekNesne(await cagir("TIKTOK_GET_USER_PROFILE", {
      fields: ["open_id", "display_name", "username", "avatar_url", "follower_count", "following_count", "video_count"],
    }));
    const u = ham.user ?? ham.data?.user ?? ham;
    return {
      harici_id: u.open_id ? String(u.open_id) : undefined,
      handle: u.username ? String(u.username) : undefined,
      ad: u.display_name,
      profil_resmi: u.avatar_url,
      takipci: u.follower_count != null ? Number(u.follower_count) : undefined,
      takip: u.following_count != null ? Number(u.following_count) : undefined,
      medya_sayisi: u.video_count != null ? Number(u.video_count) : undefined,
    };
  },

  async dogrula(k: Kimlik): Promise<DogrulamaSonucu> {
    try {
      const profil = await this.profilGetir(k);
      if (!profil.harici_id) return { ok: false, sebep: "TikTok profili okunamadı — bağlantıyı yenileyin." };
      return { ok: true, harici_id: profil.harici_id, handle: profil.handle, profil };
    } catch (e) {
      return { ok: false, sebep: (e as Error).message };
    }
  },

  async yayinla(k: Kimlik, istek: YayinIstegi): Promise<YayinSonucu> {
    if (!tiktokYolu(k)) {
      return { ok: false, hata: "TikTok yayını için hesabı “Bağla” ile TikTok'a yetkilendirin." };
    }
    try {
      if (!istek.video) return { ok: false, hata: "TikTok yalnızca video kabul eder." };
      const token = k.erisim_token;
      const azami = Math.max(5, istek.azamiBekleme ?? 45);

      // Devam eden yayın varsa yeniden yükleme, durumu sor.
      if (istek.taslakId) {
        const d = await durumYokla(token, istek.taslakId, azami);
        if (!d.bitti) return { ok: false, bekliyor: true, taslakId: istek.taslakId, hata: "TikTok videoyu hâlâ işliyor." };
        return { ok: true, taslakId: istek.taslakId, harici_post_id: d.postId, url: undefined };
      }

      const { boyut, tip } = await kaynakBilgisi(istek.medyaUrl);
      const { seviye, herkeseAcik } = await gizlilikSec(token);
      const parcaBoyu = Math.min(PARCA, boyut);
      const parcaSayisi = Math.ceil(boyut / parcaBoyu);

      const init = await tiktok("/post/publish/video/init/", token, {
        post_info: {
          title: baslikUret(istek),
          privacy_level: seviye,
          disable_comment: false, disable_duet: false, disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: boyut, chunk_size: parcaBoyu, total_chunk_count: parcaSayisi,
        },
      });
      const publishId = init?.publish_id ? String(init.publish_id) : "";
      const uploadUrl = init?.upload_url ? String(init.upload_url) : "";
      if (!publishId || !uploadUrl) return { ok: false, hata: "TikTok yükleme oturumu açmadı." };

      await parcalariGonder(uploadUrl, istek.medyaUrl, boyut, tip, parcaBoyu);

      const d = await durumYokla(token, publishId, azami);
      if (!d.bitti) return { ok: false, bekliyor: true, taslakId: publishId, hata: "TikTok videoyu işliyor." };

      const sonuc: YayinSonucu = { ok: true, taslakId: publishId, harici_post_id: d.postId };
      if (!herkeseAcik) {
        sonuc.hata = `Yayınlandı ama "${seviye}" görünürlüğüyle: TikTok uygulaması henüz denetimden geçmediği için herkese açık paylaşıma izin vermiyor.`;
      }
      return sonuc;
    } catch (e) {
      return { ok: false, hata: (e as Error).message, taslakId: istek.taslakId };
    }
  },

  metrikler(_k: Kimlik, _o: MetrikOpts): Promise<unknown> {
    return henuzYok("tiktok", "metrikler");
  },
};
