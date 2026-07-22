// ──────────────────────────────────────────────────────────────────
// Onay → yayın hedefi türetme
// ──────────────────────────────────────────────────────────────────
// Takvim satırı "instagram + youtube" diyor olabilir ama gerçekte
// yayınlanabilecek hedef üç filtreden geçer:
//   1) platformun adapter'ı uçtan uca çalışıyor mu   (YAYIN_PLATFORMLARI)
//   2) o platformda DOĞRULANMIŞ bir hesap var mı     (sm_accounts.dogrulandi)
//   3) medyanın tipi o platformda bir formata oturuyor mu (formatlar())
//
// Elenen platformlar sessizce kaybolmaz: `atlanan` listesiyle karta yazılır,
// kullanıcı "YouTube'a da gidecekti" sanmasın.
import type {
  SmHesap, SmMedya, SmPost, SmPlatform, SmYayinFormat, SmYayinHedefi,
} from "../../../services/sosyal/types";
import { YAYIN_PLATFORMLARI, formatlar, videoMu, shortsUygun } from "../ortak";

export interface HedefTuretme {
  hedefler: SmYayinHedefi[];
  /** Yayınlanamayan platformlar + nedeni (tr/de). */
  atlanan: { platform: SmPlatform; sebepTr: string; sebepDe: string }[];
}

/** Takvimdeki `format` alanını yayın formatına çevirir (reel/short/…). */
function takvimFormati(
  postFormat: string | null | undefined,
  platform: SmPlatform,
  video: boolean,
): SmYayinFormat | null {
  const uygun = formatlar(platform, video);
  if (!uygun.length) return null;

  const eslem: Record<string, SmYayinFormat> = {
    reel: "reel", short: "short", uzun_video: "video",
    carousel: "feed", tekli_gorsel: "feed", story: "story",
  };
  const istenen = eslem[String(postFormat ?? "")];
  return istenen && uygun.includes(istenen) ? istenen : uygun[0];
}

export function hedefleriTuret(
  medya: SmMedya,
  post: SmPost | undefined,
  hesaplar: SmHesap[],
): HedefTuretme {
  const video = videoMu(medya.mime_tipi);
  const caption = post?.caption_de || post?.caption_tr || medya.aciklama || undefined;

  // Takvim satırı yoksa (elle yüklenmiş üretim) bağlı tüm hesaplara önerilir.
  const istenen: SmPlatform[] = post?.platformlar?.length
    ? post.platformlar
    : Array.from(new Set(hesaplar.map((h) => h.platform)));

  const hedefler: SmYayinHedefi[] = [];
  const atlanan: HedefTuretme["atlanan"] = [];

  for (const platform of istenen) {
    if (!YAYIN_PLATFORMLARI.includes(platform)) {
      atlanan.push({
        platform,
        sebepTr: "bu platforma yayın henüz açık değil",
        sebepDe: "Veröffentlichung noch nicht verfügbar",
      });
      continue;
    }

    const hesap = hesaplar.find((h) => h.platform === platform);
    if (!hesap) {
      atlanan.push({
        platform,
        sebepTr: "bağlı ve doğrulanmış hesap yok",
        sebepDe: "kein verbundenes Konto",
      });
      continue;
    }

    const format = takvimFormati(post?.format, platform, video);
    if (!format) {
      atlanan.push({
        platform,
        sebepTr: video ? "bu platform bu videoyu almıyor" : "bu platform görsel almıyor",
        sebepDe: video ? "Video hier nicht unterstützt" : "Bild hier nicht unterstützt",
      });
      continue;
    }

    // YouTube'da dikey + ≤180 sn değilse Short olmaz; yayın anında değil
    // ŞİMDİ uyar (aynı kontrol YayinModal'da da yapılıyor).
    if (format === "short") {
      const { uygun, sebepTr, sebepDe } = shortsUygun(medya.sure, medya.cozunurluk);
      if (!uygun) {
        atlanan.push({
          platform,
          sebepTr: sebepTr || "Shorts koşulları sağlanmıyor",
          sebepDe: sebepDe || "Shorts-Kriterien nicht erfüllt",
        });
        continue;
      }
    }

    hedefler.push({ accountId: hesap.id, format, caption });
  }

  return { hedefler, atlanan };
}
