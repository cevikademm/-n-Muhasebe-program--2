// ──────────────────────────────────────────────────────────────────
// StorageAdapter — depolama soyutlaması (PRD "Storage Layer")
// ──────────────────────────────────────────────────────────────────
// UI ve servis katmanı YALNIZCA bu arayüzü görür. Supabase Storage'dan
// S3 / R2 / Cloudinary / MinIO'ya geçiş = yeni bir implementasyon dosyası
// + env değişikliği; çağıran hiçbir kod değişmez.
//
// `sm_media.depo_surucu` sütunu satır başına hangi sürücünün kullanıldığını
// saklar, böylece geçiş sırasında eski ve yeni dosyalar bir arada yaşayabilir.

/** Yükleme ilerlemesi (0–100). Tarayıcı XHR'ı desteklemiyorsa çağrılmayabilir. */
export type IlerlemeCb = (yuzde: number) => void;

export interface YuklemeSonucu {
  /** Adapter'a özel anahtar — sm_media.depo_yolu'na yazılır. */
  yol: string;
}

export interface StorageAdapter {
  /** Sürücü kimliği; sm_media.depo_surucu'ya yazılır. */
  readonly surucu: string;

  yukle(
    yol: string,
    dosya: File | Blob,
    opts?: { contentType?: string; onIlerleme?: IlerlemeCb },
  ): Promise<YuklemeSonucu>;

  /**
   * Süreli okuma URL'i. Bucket private olduğu için düz public URL YOKTUR —
   * bilinçli bir tasarım kararı: müşteri kreatifleri yayınlanmadan önce
   * yolu bilen herkese açık olmamalı.
   */
  imzaliUrl(yol: string, saniye?: number): Promise<string>;

  /** Birden çok yol için tek turda imzalı URL — galeri N+1 istek atmasın. */
  imzaliUrlToplu(yollar: string[], saniye?: number): Promise<Record<string, string>>;

  sil(yollar: string[]): Promise<void>;
}

/** Depolama katmanından gelen hatalar — çağıran taraf ayırt edebilsin. */
export class StorageHatasi extends Error {
  constructor(mesaj: string, public readonly sebep?: unknown) {
    super(mesaj);
    this.name = "StorageHatasi";
  }
}

/**
 * Depolama yolu üretir: {ownerId}/{customerId | "kendi"}/{ts}_{ad}
 *
 * İlk segment sahibin id'si olmak ZORUNDA — storage.objects RLS politikaları
 * (20260722_sm_storage.sql) tam olarak bu segmente bakıyor.
 */
export function medyaYolu(
  ownerId: string,
  customerId: string | null,
  dosyaAdi: string,
): string {
  // Dosya adını normalize et: Türkçe karakter + boşluk S3 anahtarlarında sorun çıkarır.
  const guvenli = dosyaAdi
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/[^\w.\-]/g, "_")
    .slice(-120);                       // aşırı uzun adları kırp
  return `${ownerId}/${customerId ?? "kendi"}/${Date.now()}_${guvenli}`;
}
