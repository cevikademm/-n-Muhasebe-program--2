// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// YouTubeAdapter — iki yollu
// ──────────────────────────────────────────────────────────────────
//   saglayici = "google_oauth"  → KENDİ OAuth istemcimiz. Gerçek access
//                                 token elimizde; doğrulama da yayın da
//                                 doğrudan YouTube Data API v3'e gider.
//   saglayici = "composio"      → yalnızca doğrulama/profil (Composio
//                                 tool'ları). Yayın YAPILAMAZ.
//
// Composio yolunun neden yayınlayamadığı (ikisi de test edildi):
//   • Bağlı hesap uçları token'ı "REDACTED" olarak maskeliyor → kendi
//     resumable upload'ımızı yapamıyoruz.
//   • `YOUTUBE_UPLOAD_VIDEO` videoyu KENDİ diskinden okuyor; s3key de URL
//     de "No such file or directory" veriyor.
//
// SHORTS: YouTube'da "bu bir Short" diye bir API bayrağı YOKTUR. Video
// DİKEY ve ≤180 sn ise otomatik Short sayılır. Bu yüzden `short` formatı
// bir alan değil, ön koşul kontrolü + açıklamaya eklenen #Shorts etiketidir.
import { baglantiBul, composioCalistir, tekNesne } from "../composio.ts";
import type {
  SocialAdapter, Kimlik, HesapProfili, DogrulamaSonucu,
  YayinIstegi, YayinSonucu, MetrikOpts,
} from "./types.ts";
import { henuzYok } from "./types.ts";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

const SHORTS_AZAMI_SN = 180;
const VARSAYILAN_KATEGORI = "22";        // People & Blogs
const BASLIK_SINIRI = 100;
const ACIKLAMA_SINIRI = 5000;

const googleYolu = (k: Kimlik) => k.saglayici === "google_oauth" && !!k.erisim_token;

// ── Composio yolu (yalnızca okuma) ────────────────────────────────
async function baglam(k: Kimlik) {
  if (!k.composio?.apiKey) throw new Error("YouTube için Composio bağlantısı gerekli.");
  const b = await baglantiBul("youtube", k.composio, k.harici_hesap);
  if (!b) throw new Error("Bağlı YouTube kanalı yok. Hesaplar sekmesinden “Bağla”ya basın.");
  if (b.status && b.status.toUpperCase() !== "ACTIVE") {
    throw new Error(`YouTube bağlantısı ${b.status}. Kanalı yeniden bağlayın.`);
  }
  return {
    cagir: (tool: string, args: Record<string, unknown>) =>
      composioCalistir(tool, args, k.composio, b.id),
  };
}

// ── Google yolu ───────────────────────────────────────────────────
async function googleGet(yol: string, token: string): Promise<any> {
  const res = await fetch(`${API}${yol}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error?.message || `youtube${yol}: HTTP ${res.status}`);
  return d;
}

/** "1080x1920" → {en, boy} */
function olculeriCoz(cozunurluk?: string | null): { en: number; boy: number } | null {
  const m = String(cozunurluk ?? "").match(/^(\d+)\s*[xX*]\s*(\d+)$/);
  return m ? { en: Number(m[1]), boy: Number(m[2]) } : null;
}

/**
 * Short olarak sayılır mı. Bilgi eksikse ENGELLEMEZ — yanlış pozitifle
 * yayını bloke etmektense geçir.
 */
export function shortsUygunlugu(
  sureSn?: number | null, cozunurluk?: string | null,
): { uygun: boolean; sebep?: string } {
  if (sureSn != null && isFinite(sureSn) && sureSn > SHORTS_AZAMI_SN) {
    return { uygun: false, sebep: `Shorts için video en fazla ${SHORTS_AZAMI_SN} sn olmalı (bu video ${Math.round(sureSn)} sn). "Video" formatını seçin.` };
  }
  const o = olculeriCoz(cozunurluk);
  if (o && o.en > o.boy) {
    return { uygun: false, sebep: `Shorts dikey video ister (bu video ${o.en}x${o.boy} — yatay). "Video" formatını seçin.` };
  }
  return { uygun: true };
}

function baslikUret(istek: YayinIstegi): string {
  const ham =
    (istek.baslik && istek.baslik.trim()) ||
    (istek.caption || "").split("\n").map((s) => s.trim()).find(Boolean) || "Video";
  return (ham.replace(/[<>]/g, "").trim() || "Video").slice(0, BASLIK_SINIRI);
}

function aciklamaUret(istek: YayinIstegi): string {
  let a = (istek.caption || "").replace(/[<>]/g, "");
  if (istek.format === "short" && !/#shorts\b/i.test(a)) {
    a = a ? `${a}\n\n#Shorts` : "#Shorts";
  }
  return a.slice(0, ACIKLAMA_SINIRI);
}

async function kaynakBilgisi(url: string): Promise<{ boyut: number; tip: string }> {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`Medya okunamadı (HTTP ${res.status}).`);
  const boyut = Number(res.headers.get("content-length") || 0);
  if (!boyut) throw new Error("Medya boyutu okunamadı; resumable upload boyutu şart koşuyor.");
  return { boyut, tip: res.headers.get("content-type") || "video/*" };
}

/** Resumable oturum açar, oturum URI'sini döndürür. */
async function oturumAc(token: string, istek: YayinIstegi, boyut: number, tip: string): Promise<string> {
  const res = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(boyut),
      "X-Upload-Content-Type": tip,
    },
    body: JSON.stringify({
      snippet: {
        title: baslikUret(istek),
        description: aciklamaUret(istek),
        categoryId: VARSAYILAN_KATEGORI,
        tags: [],
      },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });

  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const msg = d?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error(`Yetki reddedildi (${msg}). “Yeniden bağla” ile yetkiyi tazeleyin.`);
    if (res.status === 403) throw new Error(`YouTube reddetti (${msg}). Kanalın yükleme izni ve günlük kotasını kontrol edin.`);
    throw new Error(`Yükleme oturumu açılamadı: ${msg}`);
  }
  const uri = res.headers.get("location");
  if (!uri) throw new Error("YouTube oturum URI'si döndürmedi.");
  return uri;
}

/** Oturumun ne kadarı alınmış: {bitti:true, video} | {bitti:false, alinan} */
async function oturumDurumu(sessionUri: string, boyut: number, token: string) {
  const res = await fetch(sessionUri, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Range": `bytes */${boyut}` },
  });
  if (res.status === 200 || res.status === 201) {
    return { bitti: true, video: await res.json().catch(() => ({})) };
  }
  if (res.status === 308) {
    const range = res.headers.get("range");           // "bytes=0-12345"
    const son = range ? Number(range.split("-")[1]) : NaN;
    return { bitti: false, alinan: isFinite(son) ? son + 1 : 0 };
  }
  if (res.status === 404) throw new Error("Yükleme oturumu geçersiz; baştan denenmeli.");
  throw new Error(`Oturum durumu okunamadı (HTTP ${res.status}).`);
}

/** Baytları akıtır; `basla > 0` ise kaldığı yerden devam eder. */
async function baytlariGonder(
  sessionUri: string, token: string, medyaUrl: string,
  boyut: number, tip: string, basla: number,
) {
  const kaynak = await fetch(
    medyaUrl, basla > 0 ? { headers: { Range: `bytes=${basla}-` } } : undefined,
  );
  if (!kaynak.ok || !kaynak.body) throw new Error(`Medya indirilemedi (HTTP ${kaynak.status}).`);

  const basliklar: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": tip,
    "Content-Length": String(boyut - basla),
  };
  if (basla > 0) basliklar["Content-Range"] = `bytes ${basla}-${boyut - 1}/${boyut}`;

  const res = await fetch(sessionUri, {
    method: "PUT", headers: basliklar, body: kaynak.body, duplex: "half",
  } as RequestInit);

  if (res.status === 200 || res.status === 201) {
    return { bitti: true, video: await res.json().catch(() => ({})) };
  }
  if (res.status === 308) return { bitti: false };

  const d = await res.json().catch(() => ({}));
  throw new Error(d?.error?.message || `Yükleme başarısız (HTTP ${res.status}).`);
}

function bitir(video: any, sessionUri: string): YayinSonucu {
  const id = video?.id ? String(video.id) : undefined;
  return {
    ok: true,
    taslakId: sessionUri,
    harici_post_id: id,
    url: id ? `https://www.youtube.com/watch?v=${id}` : undefined,
  };
}

export const youtubeAdapter: SocialAdapter = {
  platform: "youtube",
  hazir: true,

  async profilGetir(k: Kimlik): Promise<HesapProfili> {
    // Google yolu: kendi kanalını doğrudan sorar, handle tahminine gerek yok.
    if (googleYolu(k)) {
      const d = await googleGet("/channels?part=snippet,statistics&mine=true", k.erisim_token);
      const kanal = (d?.items ?? [])[0];
      if (!kanal) throw new Error("Bu Google hesabına bağlı YouTube kanalı bulunamadı.");
      const sn = kanal.snippet ?? {}, sa = kanal.statistics ?? {};
      return {
        harici_id: String(kanal.id),
        handle: sn.customUrl ? String(sn.customUrl).replace(/^@/, "") : undefined,
        ad: sn.title,
        biyografi: sn.description,
        profil_resmi: sn.thumbnails?.default?.url,
        takipci: sa.subscriberCount != null ? Number(sa.subscriberCount) : undefined,
        medya_sayisi: sa.videoCount != null ? Number(sa.videoCount) : undefined,
      };
    }

    // Composio yolu: handle → kanal id → istatistik
    const { cagir } = await baglam(k);
    let kanalId = k.hesap?.harici_id || "";
    if (!kanalId) {
      const handle = String(k.hesap?.handle || "").replace(/^@/, "");
      if (!handle) throw new Error("Kanal handle'ı yok — hesabı düzenleyip handle girin.");
      const ham = tekNesne(await cagir("YOUTUBE_GET_CHANNEL_ID_BY_HANDLE", { channel_handle: `@${handle}` }));
      kanalId = String((ham.items ?? [])[0]?.id ?? "");
      if (!kanalId) throw new Error(`"@${handle}" adlı kanal bulunamadı. Handle'ı kontrol edin.`);
    }
    const st = tekNesne(await cagir("YOUTUBE_GET_CHANNEL_STATISTICS", { id: kanalId, part: "snippet,statistics" }));
    // Bu uç listeyi `channels` altında döndürüyor (`items` değil).
    const kanal = (st.channels ?? st.items ?? [])[0] ?? {};
    const sn = kanal.snippet ?? {}, sa = kanal.statistics ?? {};
    return {
      harici_id: kanalId,
      handle: sn.customUrl ? String(sn.customUrl).replace(/^@/, "") : undefined,
      ad: sn.title,
      biyografi: sn.description,
      profil_resmi: sn.thumbnails?.default?.url,
      takipci: sa.subscriberCount != null ? Number(sa.subscriberCount) : undefined,
      medya_sayisi: sa.videoCount != null ? Number(sa.videoCount) : undefined,
    };
  },

  async dogrula(k: Kimlik): Promise<DogrulamaSonucu> {
    try {
      const profil = await this.profilGetir(k);
      if (!profil.harici_id) return { ok: false, sebep: "Kanal kimliği okunamadı — bağlantıyı yenileyin." };
      return { ok: true, harici_id: profil.harici_id, handle: profil.handle, profil };
    } catch (e) {
      return { ok: false, sebep: (e as Error).message };
    }
  },

  async yayinla(k: Kimlik, istek: YayinIstegi): Promise<YayinSonucu> {
    if (!googleYolu(k)) {
      return {
        ok: false,
        hata:
          "YouTube yayını için Google yetkilendirmesi gerekiyor. Hesaplar sekmesinde " +
          "“Yeniden bağla”ya basıp Google ile izin verin.",
      };
    }

    try {
      if (!istek.video) return { ok: false, hata: "YouTube yalnızca video kabul eder." };
      if (istek.format === "short") {
        const u = shortsUygunlugu(istek.sureSn, istek.cozunurluk);
        if (!u.uygun) return { ok: false, hata: u.sebep };
      }

      const token = k.erisim_token;
      const { boyut, tip } = await kaynakBilgisi(istek.medyaUrl);

      // Önceki denemeden oturum kaldıysa aynı videoyu bir daha yükleme.
      let sessionUri = istek.taslakId || null;
      let basla = 0;

      if (sessionUri) {
        const d = await oturumDurumu(sessionUri, boyut, token);
        if (d.bitti) return bitir(d.video, sessionUri);
        basla = d.alinan ?? 0;
      } else {
        sessionUri = await oturumAc(token, istek, boyut, tip);
      }

      const sonuc = await baytlariGonder(sessionUri, token, istek.medyaUrl, boyut, tip, basla);
      if (sonuc.bitti) return bitir(sonuc.video, sessionUri);

      // Yarıda kaldı: satır `yayinlaniyor` kalsın, sonraki çağrı devam etsin.
      return {
        ok: false, bekliyor: true, taslakId: sessionUri,
        hata: "Yükleme sürüyor; kaldığı yerden devam edilecek.",
      };
    } catch (e) {
      return { ok: false, hata: (e as Error).message, taslakId: istek.taslakId };
    }
  },

  metrikler(_k: Kimlik, _o: MetrikOpts): Promise<unknown> {
    return henuzYok("youtube", "metrikler");
  },
};
