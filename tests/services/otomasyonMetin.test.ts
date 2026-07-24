import { describe, it, expect } from "vitest";
import {
  metinKur, hashtagSec, hashtagAyristir, hashtagNormalize, kuralCoz,
  HASHTAG_SINIRI,
} from "../../services/sosyal/otomasyonMetin";
import type { OtomasyonKurali } from "../../services/sosyal/otomasyonMetin";

const KURAL: OtomasyonKurali = {
  aktif: true,
  hashtag_havuzu: ["#a", "#b", "#c", "#d", "#e", "#f"],
  sabit_hashtagler: ["#marka"],
  hashtag_adet: 3,
  hashtag_yeri: "yorum",
  yorum_aktif: true,
  yorum_sablonlari: ["Sorular buraya 👇\n{hashtag}"],
};

describe("hashtag normalizasyonu", () => {
  it("geçersiz karakterleri atar, tek # bırakır", () => {
    expect(hashtagNormalize("  Buchhaltung! ")).toBe("#Buchhaltung");
    expect(hashtagNormalize("##ki")).toBe("#ki");
    expect(hashtagNormalize("   ")).toBe("");
    expect(hashtagNormalize("!!!")).toBe("");
  });

  it("serbest metni tekilleştirerek ayrıştırır", () => {
    expect(hashtagAyristir("#a, b  #a\n#c")).toEqual(["#a", "#b", "#c"]);
  });
});

describe("hashtagSec", () => {
  it("sabitleri başa koyar ve toplam adedi aşmaz", () => {
    const secilen = hashtagSec(KURAL, "medya-1");
    expect(secilen[0]).toBe("#marka");
    expect(secilen).toHaveLength(3);
  });

  it("aynı tohumda aynı sonucu verir (yeniden deneme güvenli)", () => {
    expect(hashtagSec(KURAL, "medya-1")).toEqual(hashtagSec(KURAL, "medya-1"));
  });

  it("farklı gönderilerde havuzun farklı bölümünü kullanır", () => {
    const tumSonuclar = new Set(
      ["m1", "m2", "m3", "m4", "m5"].map((t) => hashtagSec(KURAL, t).join(" ")),
    );
    expect(tumSonuclar.size).toBeGreaterThan(1);
  });

  it("metinde zaten geçen etiketi tekrar eklemez", () => {
    const secilen = hashtagSec(KURAL, "medya-1", ["#marka"]);
    expect(secilen).not.toContain("#marka");
  });

  it("havuz boşsa yalnızca sabitleri döndürür", () => {
    const secilen = hashtagSec({ ...KURAL, hashtag_havuzu: [] }, "m");
    expect(secilen).toEqual(["#marka"]);
  });
});

describe("metinKur", () => {
  it("kural kapalıyken metne dokunmaz", () => {
    const s = metinKur({
      kural: { ...KURAL, aktif: false }, caption: "merhaba",
      platform: "instagram", tohum: "m",
    });
    expect(s).toEqual({ caption: "merhaba", yorum: null, hashtagler: [], yer: "yok" });
  });

  it("yorum yerinde: metin temiz kalır, etiketler yoruma gider", () => {
    const s = metinKur({
      kural: KURAL, caption: "Yeni video", platform: "instagram",
      format: "reel", tohum: "m",
    });
    expect(s.caption).toBe("Yeni video");
    expect(s.yorum).toContain("#marka");
    expect(s.yorum).toContain("Sorular buraya");
    expect(s.yer).toBe("yorum");
  });

  it("caption yerinde: etiketler metnin altına eklenir", () => {
    const s = metinKur({
      kural: { ...KURAL, hashtag_yeri: "caption", yorum_aktif: false },
      caption: "Yeni video", platform: "instagram", tohum: "m",
    });
    expect(s.caption.startsWith("Yeni video\n\n#marka")).toBe(true);
    expect(s.yorum).toBeNull();
  });

  it("yorum desteklemeyen platformda etiketler metnin altına düşer", () => {
    const s = metinKur({
      kural: KURAL, caption: "Yeni video", platform: "youtube",
      format: "short", tohum: "m",
    });
    expect(s.yer).toBe("caption");
    expect(s.caption).toContain("#marka");
    expect(s.yorum).toBeNull();
  });

  it("hikâyede otomasyon hiç çalışmaz", () => {
    const s = metinKur({
      kural: KURAL, caption: "Yeni video", platform: "instagram",
      format: "story", tohum: "m",
    });
    expect(s.hashtagler).toEqual([]);
    expect(s.yorum).toBeNull();
  });

  it("{handle} yer tutucusunu @ ile doldurur", () => {
    const s = metinKur({
      kural: { ...KURAL, yorum_sablonlari: ["Takip: {handle}"] },
      caption: "", platform: "instagram", tohum: "m", handle: "fikoai",
    });
    expect(s.yorum).toContain("@fikoai");
  });

  it("caption sınırını aşmaz", () => {
    const s = metinKur({
      kural: { ...KURAL, hashtag_yeri: "caption" },
      caption: "x".repeat(300), platform: "x", tohum: "m", captionSiniri: 280,
    });
    expect(s.caption.length).toBeLessThanOrEqual(280);
  });

  it("metinde 30 etiket varken yenisini eklemez", () => {
    const dolu = Array.from({ length: HASHTAG_SINIRI }, (_, i) => `#t${i}`).join(" ");
    const s = metinKur({
      kural: { ...KURAL, hashtag_yeri: "caption" },
      caption: dolu, platform: "instagram", tohum: "m", captionSiniri: 2200,
    });
    expect(s.hashtagler).toEqual([]);
  });
});

describe("kuralCoz", () => {
  const satirlar = [{ platform: "*" }, { platform: "instagram" }];

  it("platformun kendi satırını tercih eder", () => {
    expect(kuralCoz(satirlar, "instagram")).toEqual({ platform: "instagram" });
  });

  it("kendi satırı yoksa '*' satırına düşer", () => {
    expect(kuralCoz(satirlar, "youtube")).toEqual({ platform: "*" });
  });

  it("hiç kayıt yoksa null döner", () => {
    expect(kuralCoz([], "instagram")).toBeNull();
  });
});
