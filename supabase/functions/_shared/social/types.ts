// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// SocialAdapter — platform bağımsız sözleşme (PRD Faz 3)
// ──────────────────────────────────────────────────────────────────
// Adapter'lar TARAYICIDA DEĞİL, Edge Function içinde yaşar: token'lar
// yalnızca burada çözülür ve asla client'a inmez.
//
// Yeni platform eklemek = bu klasöre bir dosya + registry.ts'e bir satır.

export type Platform =
  | "instagram" | "facebook" | "youtube"
  | "tiktok" | "linkedin" | "x" | "pinterest";

/** sm_account_credentials satırı + çalışma anı ortam bilgisi. */
export interface Kimlik {
  saglayici: string;               // composio | meta_oauth | google_oauth
  harici_hesap?: string | null;
  erisim_token?: string | null;
  yenileme_token?: string | null;
  /** Composio sağlayıcısı için ortam anahtarları. */
  composio?: { apiKey: string; userId: string };
  /** sm_accounts satırından gelen bağlam. */
  hesap?: { harici_id?: string | null; handle?: string | null };
}

export interface HesapProfili {
  handle?: string;
  harici_id?: string;
  ad?: string;
  takipci?: number;
  takip?: number;
  medya_sayisi?: number;
  profil_resmi?: string;
  biyografi?: string;
}

export interface DogrulamaSonucu {
  ok: boolean;
  harici_id?: string;
  handle?: string;
  profil?: HesapProfili;
  /** Doğrulanamadıysa kullanıcıya gösterilecek sebep. */
  sebep?: string;
}

export type YayinFormat = "feed" | "reel" | "story" | "video" | "short";

export interface YayinIstegi {
  /** Platformun ÇEKEBİLECEĞİ bir URL — sorgu parametresiz, public. */
  medyaUrl: string;
  caption?: string;
  format?: YayinFormat;
  /** medyaUrl bir video mu (mime'dan çözülür, adapter tahmin etmesin). */
  video?: boolean;
  /** Reels kapak görseli (opsiyonel). */
  kapakUrl?: string;
  /** Medya başlığı — YouTube başlık ZORUNLU tutuyor, caption'dan ayrı. */
  baslik?: string | null;
  /** Süre (sn) ve "1080x1920" — YouTube Shorts uygunluk kontrolü için. */
  sureSn?: number | null;
  cozunurluk?: string | null;
  /**
   * Önceki denemeden kalan taslak/container. Doluysa adapter yeni taslak
   * KURMAZ, doğrudan o taslağın durumuna bakıp yayınlar. Edge Function
   * zaman aşımına uğradığında ikinci çağrının aynı videoyu yeniden
   * yüklememesi için var.
   */
  taslakId?: string;
  /** Taslağın işlenmesi için beklenecek azami süre (sn). */
  azamiBekleme?: number;
}

export interface YayinSonucu {
  ok: boolean;
  /**
   * true → taslak oluştu ama platform hâlâ işliyor. Çağıran satırı
   * `yayinlaniyor` durumunda bırakır ve `taslakId` ile sonra devam eder.
   */
  bekliyor?: boolean;
  taslakId?: string;
  harici_post_id?: string;
  url?: string;
  hata?: string;
}

/** Yayınlanmış bir gönderinin altına yazılacak ilk yorum. */
export interface YorumIstegi {
  /** Platformdaki gönderi kimliği (sm_yayinlar.harici_post_id). */
  postId: string;
  metin: string;
}

export interface YorumSonucu {
  ok: boolean;
  yorumId?: string;
  hata?: string;
}

export interface MetrikOpts {
  limit?: number;
  baslangic?: string;
  bitis?: string;
}

export interface SocialAdapter {
  readonly platform: Platform;
  /** false ise UI "yakında" gösterir; dogrula/profilGetir çağrılmaz. */
  readonly hazir: boolean;

  dogrula(k: Kimlik): Promise<DogrulamaSonucu>;
  profilGetir(k: Kimlik): Promise<HesapProfili>;

  // Faz 4/5'te doldurulacak — imza şimdi sabitlendi ki çağıran kod
  // sonradan değişmesin.
  yayinla(k: Kimlik, istek: YayinIstegi): Promise<YayinSonucu>;
  metrikler(k: Kimlik, opts: MetrikOpts): Promise<unknown>;

  /**
   * Otomatik ilk yorum. OPSİYONEL: platformun yorum yazma ucu bağlı
   * değilse alan hiç tanımlanmaz ve çağıran satırı "desteklenmiyor"
   * işaretler — yayının kendisi bundan etkilenmez.
   */
  yorumYaz?(k: Kimlik, istek: YorumIstegi): Promise<YorumSonucu>;
}

/** Henüz uygulanmamış yetenekler için ortak fırlatıcı. */
export function henuzYok(platform: string, yetenek: string): never {
  throw new Error(`${platform}: "${yetenek}" bu fazda henüz desteklenmiyor.`);
}
