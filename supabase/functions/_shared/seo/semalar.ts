// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Structured output şemaları — modelin çıktı biçimi sözleşmesi
// ──────────────────────────────────────────────────────────────────
// Claude'un `output_config.format` alanına verilir. JSON'u prompt'la rica
// etmek yerine şemayla ZORUNLU kılmak, "bazen markdown bloğu döndürüyor"
// sınıfı hataları tamamen ortadan kaldırır.
//
// Şema kısıtları (Claude structured outputs): her object'te
// `additionalProperties: false` ve `required` zorunlu; minLength/maxLength
// gibi kısıtlar DESTEKLENMEZ — uzunluk denetimi platformlar.ts'te elle
// yapılır.

/** Tek bir platform+dil için üretilen metin paketi. */
export const ONERI_SEMASI = {
  type: "object",
  additionalProperties: false,
  required: ["oneriler"],
  properties: {
    oneriler: {
      type: "array",
      description: "İstenen her platform × dil kombinasyonu için tam olarak bir kayıt.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["platform", "dil", "baslik", "caption", "hashtagler", "ilk_yorum", "anahtar_kelimeler", "gerekce"],
        properties: {
          platform: {
            type: "string",
            enum: ["instagram", "youtube", "tiktok", "facebook"],
          },
          dil: { type: "string", enum: ["de", "tr", "en"] },
          baslik: {
            type: "string",
            description:
              "Platformun ayrı başlık alanı varsa (YouTube) arama odaklı başlık; yoksa boş string.",
          },
          caption: {
            type: "string",
            description:
              "Gönderi metni. Hashtag İÇERMEZ — etiketler ayrı alanda döner.",
          },
          hashtagler: {
            type: "array",
            description: "'#' ile başlayan, küçük harfli, en değerliden en genele sıralı.",
            items: { type: "string" },
          },
          ilk_yorum: {
            type: "string",
            description:
              "Gönderinin altına yazılacak ilk yorum. Platform yorum desteklemiyorsa boş string.",
          },
          anahtar_kelimeler: {
            type: "array",
            description: "Bu metnin hedeflediği arama terimleri (hashtag değil, düz kelime).",
            items: { type: "string" },
          },
          gerekce: {
            type: "string",
            description:
              "Bu kelimeler neden seçildi — kullanıcıya gösterilecek 1-2 cümle.",
          },
        },
      },
    },
  },
} as const;

/** Trend taraması / havuz üretimi çıktısı. */
export const ANAHTAR_SEMASI = {
  type: "object",
  additionalProperties: false,
  required: ["kelimeler", "ozet"],
  properties: {
    kelimeler: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kelime", "tur", "platform", "dil", "skor", "hacim_notu", "kaynak"],
        properties: {
          kelime: {
            type: "string",
            description: "tur='hashtag' ise '#' ile başlar, küçük harf.",
          },
          tur: { type: "string", enum: ["anahtar", "hashtag"] },
          platform: {
            type: "string",
            enum: ["*", "instagram", "youtube", "tiktok", "facebook"],
            description: "Bütün platformlarda çalışıyorsa '*'.",
          },
          dil: { type: "string", enum: ["de", "tr", "en"] },
          skor: {
            type: "number",
            description:
              "0-100. Değer × erişilebilirlik tahmini. Gerçek arama hacmi DEĞİL — hacim verisine erişimin yok, uydurma.",
          },
          hacim_notu: {
            type: "string",
            description: "Örn. 'orta hacim, düşük rekabet' — gözlemine dayanan kısa not.",
          },
          kaynak: {
            type: "string",
            description: "Bu kelimeyi nereden çıkardın (URL ya da kısa gerekçe).",
          },
        },
      },
    },
    ozet: {
      type: "string",
      description: "Taramanın 2-3 cümlelik özeti: bu dönem ne çalışıyor, neden.",
    },
  },
} as const;
