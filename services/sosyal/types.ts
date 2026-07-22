// ──────────────────────────────────────────────────────────────────
// Sosyal Medya OS — ortak tipler
// ──────────────────────────────────────────────────────────────────
// Alan adları veritabanındaki sm_* tablolarıyla birebir aynı (Türkçe);
// AI üretim parametreleri sektör terimi olduğu için İngilizce kalır.

export type SmPlatform =
  | "instagram" | "facebook" | "youtube"
  | "tiktok" | "linkedin" | "x" | "pinterest";

export type SmMedyaDurum =
  | "taslak" | "hazir" | "onayda" | "onaylandi" | "yayinlandi" | "arsiv";

export type SmHesapDurum =
  | "planlandi" | "acildi" | "optimize" | "aktif" | "askida";

/** customer_id === null → "kendi markam"; string → companies(id) müşterisi. */
export type MusteriId = string | null;

export interface SmMedya {
  id: string;
  user_id: string;
  customer_id: MusteriId;

  baslik: string | null;
  aciklama: string | null;

  prompt: string | null;
  negative_prompt: string | null;
  provider: string | null;
  model: string | null;
  seed: number | null;
  cfg: number | null;
  steps: number | null;

  depo_surucu: string;
  depo_yolu: string;
  mime_tipi: string | null;
  boyut: number | null;
  cozunurluk: string | null;
  sure: number | null;
  fps: number | null;
  thumbnail_yolu: string | null;

  durum: SmMedyaDurum;
  favori: boolean;
  etiketler: string[];
  post_id: string | null;

  /** Üreten sağlayıcının (Higgsfield) job id'si — tekrarlı içe aktarmayı önler. */
  harici_job_id: string | null;
  /** İndirilen orijinal URL. Sağlayıcıda süreli; yalnızca iz amaçlı. */
  kaynak_url: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Yükleme sırasında kullanıcıdan/üretimden gelen, dosya dışı alanlar. */
export type SmMedyaGirdi = Partial<
  Pick<
    SmMedya,
    | "baslik" | "aciklama" | "prompt" | "negative_prompt" | "provider"
    | "model" | "seed" | "cfg" | "steps" | "durum" | "favori"
    | "etiketler" | "post_id"
  >
>;

export interface SmMedyaFiltre {
  arama?: string;
  etiketler?: string[];
  durum?: SmMedyaDurum | "hepsi";
  tip?: "hepsi" | "gorsel" | "video";
  yalnizFavori?: boolean;
}

export interface SmHesap {
  id: string;
  user_id: string;
  customer_id: MusteriId;
  platform: SmPlatform;
  handle: string | null;
  url: string | null;
  hesap_tipi: string | null;
  harici_id: string | null;
  durum: SmHesapDurum;
  dogrulandi: boolean;
  notlar: string | null;
  created_at: string;
  updated_at: string;
}

/** Edge fonksiyonunun döndürdüğü profil özeti (token asla client'a inmez). */
export interface SmHesapProfili {
  handle?: string;
  harici_id?: string;
  ad?: string;
  takipci?: number;
  takip?: number;
  medya_sayisi?: number;
  profil_resmi?: string;
  biyografi?: string;
}

export interface SmMusteri {
  id: string;
  company_name: string;
}

// ── Yayın kuyruğu (sm_yayinlar) ─────────────────────────────────────

export type SmYayinFormat = "feed" | "reel" | "story" | "video" | "short";

export type SmYayinDurum =
  | "kuyrukta" | "yayinlaniyor" | "yayinlandi" | "hata" | "iptal";

/**
 * Otomatik ilk yorumun durumu. Yayının kendi durumundan AYRIDIR: gönderi
 * yayınlandıysa iş başarılıdır, yorum ayrıca izlenir ve ayrıca denenir.
 */
export type SmYorumDurum =
  | "yok" | "bekliyor" | "yazildi" | "hata" | "desteklenmiyor";

/** Bir medya + bir hesap = bir satır. Platformlar bağımsız başarısız olur. */
export interface SmYayin {
  id: string;
  user_id: string;
  customer_id: MusteriId;
  media_id: string;
  account_id: string;
  post_id: string | null;
  platform: SmPlatform;
  format: SmYayinFormat;
  caption: string | null;
  durum: SmYayinDurum;
  planlanan: string | null;
  baslangic: string | null;
  bitis: string | null;
  deneme: number;
  harici_taslak_id: string | null;
  harici_post_id: string | null;
  yayin_url: string | null;
  hata: string | null;
  gecici_yol: string | null;

  // otomasyon (bkz. sm_otomasyon)
  yorum_metni: string | null;
  yorum_durum: SmYorumDurum;
  yorum_deneme: number;
  harici_yorum_id: string | null;
  yorum_hata: string | null;
  /** Otomasyonun bu gönderiye eklediği etiketler. */
  uygulanan_hashtagler: string[];

  created_at: string;
  updated_at: string;
}

/** Modalde seçilen tek bir hedef. */
export interface SmYayinHedefi {
  accountId: string;
  format?: SmYayinFormat;
  caption?: string;
}

// ── İçerik takvimi (sm_posts) ───────────────────────────────────────

export type SmPostDurum =
  | "fikir" | "uretimde" | "hazir" | "planlandi" | "yayinlandi" | "iptal";

/**
 * Takvim satırı. Kayıtları bugün `/sosyal-medya` skill'i (Claude) açıyor;
 * uygulama yalnızca OKUYOR — onay ekranı gönderinin metnini ve hedef
 * platformlarını buradan alır.
 */
export interface SmPost {
  id: string;
  user_id: string;
  pillar_id: string | null;
  planlanan_tarih: string | null;
  platformlar: SmPlatform[];
  format: string | null;
  hook: string | null;
  caption_de: string | null;
  caption_tr: string | null;
  caption_en: string | null;
  hashtagler: string[];
  cta: string | null;
  asset_url: string | null;
  higgsfield_job: string | null;
  uretim_notu: string | null;
  durum: SmPostDurum;
  yayin_urlleri: Record<string, string>;
  yayin_tarihi: string | null;
  created_at: string;
  updated_at: string;
}

// ── Üretim kuyruğu (sm_uretim_isleri) ───────────────────────────────

/** `reels` = ana iş; `klip`/`ses` onun blokları; `gorsel` tek karelik üretim. */
export type SmUretimTur = "gorsel" | "klip" | "ses" | "reels";

/**
 * İşi kim alacak. `mcp` → Claude oturumu (tam Reels zinciri yalnızca orada
 * mümkün); `api` → pg_cron + sm-uret-api (Higgsfield REST anahtarı gerektirir).
 */
export type SmUretimMotor = "mcp" | "api";

export type SmUretimDurum =
  | "bekliyor" | "alindi" | "uretiliyor" | "tamam" | "hata" | "iptal";

export interface SmUretimIsi {
  id: string;
  user_id: string;
  customer_id: MusteriId;
  post_id: string | null;
  ust_is_id: string | null;
  sira: number;
  tur: SmUretimTur;
  motor: SmUretimMotor;
  saglayici: string;
  model: string | null;
  prompt: string | null;
  negative_prompt: string | null;
  params: Record<string, any>;
  harici_job_id: string | null;
  durum: SmUretimDurum;
  planlanan: string | null;
  sonuc_url: string | null;
  media_id: string | null;
  hata: string | null;
  kredi: number | null;
  deneme: number;
  created_at: string;
  updated_at: string;
}

// ── Otomasyon (sm_otomasyon) ────────────────────────────────────────

export type { SmHashtagYeri } from "./otomasyonMetin";

/**
 * Marka başına otomatik hashtag + ilk yorum kuralı.
 * `platform` = "*" → tüm platformlar; platform adı → o platformu ezer.
 */
export interface SmOtomasyon {
  id: string;
  user_id: string;
  customer_id: MusteriId;
  platform: "*" | SmPlatform;
  aktif: boolean;
  hashtag_havuzu: string[];
  sabit_hashtagler: string[];
  hashtag_adet: number;
  hashtag_yeri: "caption" | "yorum" | "yok";
  yorum_aktif: boolean;
  yorum_sablonlari: string[];
  created_at: string;
  updated_at: string;
}

/** Ayar ekranından kaydedilebilen alanlar. */
export type SmOtomasyonGirdi = Partial<
  Pick<
    SmOtomasyon,
    | "aktif" | "hashtag_havuzu" | "sabit_hashtagler" | "hashtag_adet"
    | "hashtag_yeri" | "yorum_aktif" | "yorum_sablonlari"
  >
>;
