// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Platform metin kısıtları — SEO ajanının uyacağı sert sınırlar
// ──────────────────────────────────────────────────────────────────
// Ajan "yaratıcı" olabilir ama sınırlar pazarlık konusu değil: 101 karakterlik
// bir YouTube başlığı yüklemede kesilir, 31. hashtag Instagram tarafında hiç
// sayılmaz. Bu yüzden sınırlar prompt'a da yazılır, çıktı da bunlara göre
// KIRPILIR — modelin sayı saymasına güvenilmez.
//
// ⚠ İkiz değerler:
//   · caption sınırı  → components/sosyal/ortak.ts → CAPTION_SINIRI
//   · etiket sınırı   → services/sosyal/otomasyonMetin.ts → HASHTAG_SINIRI
//   · Shorts eşiği    → components/sosyal/ortak.ts → SHORTS_AZAMI_SN
// Birini değiştirdiğinizde diğerini de güncelleyin: kullanıcıya gösterilen
// sınır ile yayına giden metnin sınırı ayrışırsa "neden kesildi?" sorusunun
// cevabı kalmaz.

export interface PlatformKurali {
  /** Caption/açıklama üst sınırı (karakter). */
  captionSiniri: number;
  /** Bir gönderide anlamlı sayılan azami etiket. */
  hashtagSiniri: number;
  /** Ayrı bir başlık alanı var mı (YouTube). */
  baslikVar: boolean;
  /** Başlık üst sınırı — baslikVar false ise yok sayılır. */
  baslikSiniri: number;
  /** API üzerinden ilk yorum yazabildiğimiz platformlar. */
  yorumDestekli: boolean;
  /** Ajana verilecek platform-özel yazım kuralları. */
  notlar: string[];
}

/**
 * Instagram bir gönderide en fazla 30 etiket sayar (metin + ilk yorum
 * birlikte) — otomasyonMetin.ts'teki HASHTAG_SINIRI ile aynı sayı.
 */
export const HASHTAG_SINIRI = 30;

/** YouTube Shorts üst sınırı (sn) — ortak.ts → SHORTS_AZAMI_SN ile aynı. */
export const SHORTS_AZAMI_SN = 180;

export const PLATFORM_KURALLARI: Record<string, PlatformKurali> = {
  instagram: {
    captionSiniri: 2200,
    hashtagSiniri: HASHTAG_SINIRI,
    baslikVar: false,
    baslikSiniri: 0,
    yorumDestekli: true,
    notlar: [
      "İlk 125 karakter akışta kesilmeden görünür — kancayı oraya koy.",
      "Etiketler ilk yorumda da sayılır; metni etiket çöplüğüne çevirme.",
      "Arama artık caption metnini de tarıyor: anahtar kelime doğal cümle içinde geçsin.",
    ],
  },
  youtube: {
    captionSiniri: 5000,
    hashtagSiniri: 15,
    baslikVar: true,
    baslikSiniri: 100,
    yorumDestekli: false,
    notlar: [
      "Başlık gerçek bir arama motoru sorgusudur: anahtar kelime BAŞA yakın dursun.",
      "Açıklamanın ilk 150 karakteri arama sonucunda görünür.",
      "Açıklamada geçen ilk 3 hashtag başlığın üstünde gösterilir.",
      "Dikey ve 180 saniyeden kısa video otomatik Short sayılır; format 'short' ise metne #Shorts ekle.",
    ],
  },
  tiktok: {
    captionSiniri: 2200,
    hashtagSiniri: 10,
    baslikVar: false,
    baslikSiniri: 0,
    yorumDestekli: false,
    notlar: [
      "TikTok araması caption metnini tam metin olarak indeksler — kelimeleri cümleye göm.",
      "3-6 etiket, ikisi geniş ikisi niş olacak şekilde en iyi sonucu verir.",
      "Soru cümlesi ile biten caption yorum oranını yükseltir.",
    ],
  },
  facebook: {
    captionSiniri: 5000,
    hashtagSiniri: 5,
    baslikVar: false,
    baslikSiniri: 0,
    yorumDestekli: false,
    notlar: [
      "Facebook'ta hashtag erişime çok az katkı verir — 2-3 taneyi geçme.",
      "İlk cümle uzun olabilir; algoritma tıklamadan çok okunma süresine bakar.",
    ],
  },
};

/** Bilinmeyen platformlar için güvenli varsayılan (Instagram'ın kısıtları). */
export const VARSAYILAN_KURAL: PlatformKurali = PLATFORM_KURALLARI.instagram;

export const kuralAl = (platform: string): PlatformKurali =>
  PLATFORM_KURALLARI[String(platform || "").toLowerCase()] ?? VARSAYILAN_KURAL;

// ── Normalize ve kırpma ────────────────────────────────────────────

/**
 * "  Buchhaltung! " → "#buchhaltung" · geçersizse ""
 * services/sosyal/otomasyonMetin.ts → hashtagNormalize ile BİREBİR aynı
 * davranmalı; aksi hâlde AI'ın ürettiği etiket ile havuzdaki etiket
 * eşleşmez ve tekrar filtresi çalışmaz.
 */
export function hashtagNormalize(ham: string): string {
  const temiz = String(ham ?? "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "");
  return temiz ? `#${temiz}` : "";
}

const anahtar = (t: string) => t.toLocaleLowerCase("tr");

export function tekille(liste: string[]): string[] {
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const t of liste ?? []) {
    const k = anahtar(t);
    if (!t || gorulen.has(k)) continue;
    gorulen.add(k);
    sonuc.push(t);
  }
  return sonuc;
}

/**
 * Modelin ürettiği etiket listesini yayına hazır hâle getirir:
 * normalize → tekille → yasaklıları at → platform sınırına kırp.
 */
export function hashtagleriTemizle(
  ham: unknown,
  platform: string,
  yasakli: string[] = [],
): string[] {
  const yasak = new Set((yasakli ?? []).map((y) => anahtar(hashtagNormalize(y))));
  const liste = Array.isArray(ham) ? ham : [];
  const temiz = tekille(liste.map((t) => hashtagNormalize(String(t))).filter(Boolean))
    .filter((t) => !yasak.has(anahtar(t)));
  return temiz.slice(0, kuralAl(platform).hashtagSiniri);
}

/** Sınırı aşan metni kelime ortasından değil, son boşluktan keser. */
export function kirp(metin: string, sinir: number): string {
  const m = String(metin ?? "").trim();
  if (m.length <= sinir) return m;
  const kesik = m.slice(0, sinir);
  const bosluk = kesik.lastIndexOf(" ");
  return (bosluk > sinir * 0.6 ? kesik.slice(0, bosluk) : kesik).trimEnd();
}

/**
 * Yasaklı kelime denetimi. Model kurala uymadıysa metin SESSİZCE
 * gönderilmez — çağıran satırı reddedip yeniden üretebilsin diye
 * ihlal listesi döner.
 */
export function yasakliIhlalleri(metin: string, yasakli: string[]): string[] {
  const m = anahtar(String(metin ?? ""));
  return (yasakli ?? [])
    .map((y) => String(y ?? "").trim())
    .filter((y) => y && m.includes(anahtar(y)));
}
