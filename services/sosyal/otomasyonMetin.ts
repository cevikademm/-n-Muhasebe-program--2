// ──────────────────────────────────────────────────────────────────
// Otomasyon metni — hashtag seçimi + otomatik ilk yorum (SAF mantık)
// ──────────────────────────────────────────────────────────────────
// Kullanıcı yalnızca videoyu yükleyip "yayınla" desin; etiketler ve
// gönderinin altına düşen ilk yorum buradan ÜRETİLİR.
//
// ⚠ Bu dosyanın ikizi: supabase/functions/_shared/social/otomasyon.ts
//    (Deno ↔ Vite ayrımı yüzünden import edilemiyor.) Birini değiştirdiğinizde
//    DİĞERİNİ de güncelleyin: yayın modalinde gösterilen önizleme ile gerçekten
//    yayınlanan metin birebir aynı olmak ZORUNDA — kullanıcı gördüğünden
//    başkasını paylaşmamalı.
//
// Dosya bilinçli olarak import'suz ve yan etkisiz: hem tarayıcıda hem de
// Edge Function içinde aynı sonucu vermesi gerekiyor.

export type SmHashtagYeri = "caption" | "yorum" | "yok";

/** sm_otomasyon satırının davranışa etki eden alanları. */
export interface OtomasyonKurali {
  aktif: boolean;
  /** Gönderi başına içinden seçim yapılan etiket havuzu. */
  hashtag_havuzu: string[];
  /** Her gönderide MUTLAKA çıkan marka etiketleri. */
  sabit_hashtagler: string[];
  /** Toplam etiket adedi (sabitler dâhil). */
  hashtag_adet: number;
  hashtag_yeri: SmHashtagYeri;
  yorum_aktif: boolean;
  /** Sırayla dönen ilk yorum şablonları. */
  yorum_sablonlari: string[];
}

/** Instagram bir gönderide en fazla 30 etiket sayar (metin + ilk yorum birlikte). */
export const HASHTAG_SINIRI = 30;

/**
 * İlk yorumu API üzerinden yazabildiğimiz platformlar.
 * YouTube/TikTok'ta yorum yazma uçları bu fazda bağlı değil; oralarda
 * etiketler açıklamanın altına düşer (bkz. metinKur).
 */
export const YORUM_DESTEKLI: string[] = ["instagram"];

/** Kayıt yokken kullanılan davranış — hiçbir şey uydurulmaz, sadece kapalıdır. */
export const VARSAYILAN_KURAL: OtomasyonKurali = {
  aktif: false,
  hashtag_havuzu: [],
  sabit_hashtagler: [],
  hashtag_adet: 8,
  hashtag_yeri: "yorum",
  yorum_aktif: true,
  yorum_sablonlari: [],
};

/**
 * Ayar ekranı ilk kez açıldığında forma doldurulan başlangıç değeri.
 * Amaç "boş form" yerine çalışır bir kurulum sunmak — kullanıcı isterse
 * hepsini siler. Sunucu tarafında ASLA örtük olarak uygulanmaz.
 */
export const ONERILEN_KURAL: OtomasyonKurali = {
  aktif: true,
  hashtag_havuzu: [
    "#buchhaltung", "#steuerberatung", "#selbststaendig", "#unternehmer",
    "#kleinunternehmer", "#finanzamt", "#rechnung", "#steuertipps",
    "#gruenden", "#startup", "#deutschland", "#mittelstand",
    "#digitalisierung", "#ki", "#automatisierung", "#buchhaltungsservice",
  ],
  sabit_hashtagler: ["#fikoai"],
  hashtag_adet: 10,
  hashtag_yeri: "yorum",
  yorum_aktif: true,
  yorum_sablonlari: [
    "Fragen dazu? Schreib sie einfach hier in die Kommentare 👇\n{hashtag}",
    "Mehr davon? Folge {handle} für wöchentliche Tipps.\n{hashtag}",
    "Speicher dir das Video für später ab 🔖\n{hashtag}",
  ],
};

// ── Etiket yardımcıları ────────────────────────────────────────────

/** "  Buchhaltung! " → "#buchhaltung" · geçersizse "" */
export function hashtagNormalize(ham: string): string {
  const temiz = String(ham ?? "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "");
  return temiz ? `#${temiz}` : "";
}

/** Serbest metni (virgül/boşluk/satır) etiket dizisine çevirir. */
export function hashtagAyristir(ham: string): string[] {
  return tekille(
    String(ham ?? "")
      .split(/[\s,;]+/)
      .map(hashtagNormalize)
      .filter(Boolean),
  );
}

/** Bir metnin içinde geçen etiketler — mükerrer eklememek için. */
export function metindekiHashtagler(metin: string): string[] {
  return String(metin ?? "").match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

const anahtar = (t: string) => t.toLocaleLowerCase("tr");

function tekille(liste: string[]): string[] {
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const t of liste) {
    const k = anahtar(t);
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    sonuc.push(t);
  }
  return sonuc;
}

/**
 * Metinden türetilen kararlı sayı (FNV-1a).
 * Math.random KULLANILMAZ: aynı gönderi yeniden denendiğinde etiketlerin
 * ve yorumun değişmemesi gerekiyor.
 */
export function tohumSayisi(tohum: string): number {
  let h = 2166136261;
  const s = String(tohum ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

/**
 * Bu gönderi için etiket kümesi.
 *
 * Sabitler her zaman başta; kalan yer havuzdan DOLDURULUR. Havuz baştan
 * değil, tohuma göre KAYDIRILARAK okunur: her gönderide birebir aynı etiket
 * bloğunu paylaşmak Instagram tarafında tekrar/spam sinyali sayılıyor.
 * Kaydırma deterministik olduğu için yeniden deneme aynı sonucu verir.
 */
export function hashtagSec(
  kural: OtomasyonKurali,
  tohum: string,
  haricTut: string[] = [],
): string[] {
  const yasak = new Set(haricTut.map((t) => anahtar(hashtagNormalize(t))));
  const uygun = (t: string) => !!t && !yasak.has(anahtar(t));

  const sabit = tekille((kural.sabit_hashtagler ?? []).map(hashtagNormalize).filter(uygun));
  const adet = Math.max(0, Math.min(HASHTAG_SINIRI, Math.floor(kural.hashtag_adet ?? 0)));
  if (sabit.length >= adet) return sabit.slice(0, adet);

  const sabitAnahtarlar = new Set(sabit.map(anahtar));
  const havuz = tekille((kural.hashtag_havuzu ?? []).map(hashtagNormalize).filter(uygun))
    .filter((t) => !sabitAnahtarlar.has(anahtar(t)));
  if (!havuz.length) return sabit;

  const kaydirma = tohumSayisi(tohum) % havuz.length;
  const secilen: string[] = [];
  for (let i = 0; i < havuz.length && sabit.length + secilen.length < adet; i++) {
    secilen.push(havuz[(kaydirma + i) % havuz.length]);
  }
  return [...sabit, ...secilen];
}

// ── Yorum şablonu ──────────────────────────────────────────────────

const YER_TUTUCU = /\{(baslik|handle|hashtag)\}/gi;

function sablonSec(sablonlar: string[], tohum: string): string {
  const liste = (sablonlar ?? []).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!liste.length) return "";
  return liste[tohumSayisi(tohum) % liste.length];
}

function sablonDoldur(
  sablon: string,
  degerler: { baslik: string; handle: string; hashtag: string },
): string {
  return String(sablon ?? "")
    .replace(YER_TUTUCU, (_, ad: string) => {
      const k = ad.toLowerCase() as keyof typeof degerler;
      return degerler[k] ?? "";
    })
    // Boş yer tutucu arkasında çift boşluk/üçlü satır bırakmasın.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Ana kurgu ──────────────────────────────────────────────────────

export interface MetinGirdisi {
  kural: OtomasyonKurali | null | undefined;
  /** Kullanıcının yazdığı ham metin. */
  caption: string;
  platform: string;
  /** feed | reel | story | video | short */
  format?: string;
  /** Aynı gönderi için hep aynı sonucu üretecek anahtar (genelde media id). */
  tohum: string;
  baslik?: string | null;
  handle?: string | null;
  /** Platformun caption üst sınırı. */
  captionSiniri?: number;
  /**
   * SEO ajanının bu gönderi için ürettiği hazır etiketler (sm_seo_oneriler).
   * Doluysa havuzdan seçim YAPILMAZ — yerleştirme kuralı (yorum mu, metin
   * altı mı) yine `kural`dan gelir.
   */
  hazirHashtagler?: string[] | null;
  /** Ajanın ürettiği hazır ilk yorum. Doluysa şablon döngüsü atlanır. */
  hazirYorum?: string | null;
}

export interface MetinSonucu {
  /** Yayınlanacak nihai metin. */
  caption: string;
  /** Yayından hemen sonra yazılacak ilk yorum; yoksa null. */
  yorum: string | null;
  /** Otomasyonun eklediği etiketler (önizleme + kayıt için). */
  hashtagler: string[];
  /** Etiketler nereye kondu. */
  yer: SmHashtagYeri;
}

/**
 * Ham metinden nihai caption + ilk yorumu üretir.
 *
 * Kurallar:
 *  · Kural kapalıysa hiçbir şey eklenmez — kullanıcı metni aynen gider.
 *    (İSTİSNA: ajan hazır metin ürettiyse yerleştirme yine yapılır; kullanıcı
 *    "gönderi modu"nu açıkça seçmiş demektir.)
 *  · Hikâyede (story) ne yorum ne etiket kutusu var → otomasyon atlanır.
 *  · Platform yorum kabul etmiyorsa "ilk yorum" tercihi metnin altına düşer;
 *    aksi halde etiketler hiç yayınlanmamış olurdu.
 *  · Metinde zaten geçen etiketler tekrar eklenmez, toplam 30'u aşmaz.
 */
export function metinKur(g: MetinGirdisi): MetinSonucu {
  const ham = String(g.caption ?? "").trim();
  const kapali: MetinSonucu = { caption: ham, yorum: null, hashtagler: [], yer: "yok" };

  const hazirEtiketler = tekille(
    (g.hazirHashtagler ?? []).map(hashtagNormalize).filter(Boolean),
  );
  const hazirYorum = String(g.hazirYorum ?? "").trim();
  const ajanUretti = !!hazirEtiketler.length || !!hazirYorum;

  const k = g.kural;
  if ((!k || !k.aktif) && !ajanUretti) return kapali;
  if (g.format === "story") return kapali;

  const yorumMumkun = YORUM_DESTEKLI.includes(g.platform);
  let yer: SmHashtagYeri = k?.hashtag_yeri ?? "yorum";
  if (yer === "yorum" && !yorumMumkun) yer = "caption";

  const mevcut = metindekiHashtagler(ham);
  const kalanKota = Math.max(0, HASHTAG_SINIRI - mevcut.length);
  const havuzdan = k ? hashtagSec(k, g.tohum, mevcut) : [];
  const aday = hazirEtiketler.length
    ? hazirEtiketler.filter((t) => !mevcut.some((m) => anahtar(m) === anahtar(t)))
    : havuzdan;
  const secilen = yer === "yok" ? [] : aday.slice(0, kalanKota);
  const etiketMetni = secilen.join(" ");

  let caption = ham;
  if (yer === "caption" && etiketMetni) {
    caption = ham ? `${ham}\n\n${etiketMetni}` : etiketMetni;
  }
  const sinir = g.captionSiniri ?? 2200;
  if (caption.length > sinir) caption = caption.slice(0, sinir).trimEnd();

  let yorum: string | null = null;
  if (yorumMumkun && (hazirYorum || k?.yorum_aktif || yer === "yorum")) {
    // Ajanın yorumu şablonun yerine geçer; yer tutucuları yine çözülür ki
    // {handle}/{hashtag} yazan bir öneri de doğru gitsin.
    const sablon = hazirYorum || (k?.yorum_aktif ? sablonSec(k.yorum_sablonlari, g.tohum) : "");
    const etiketSablonda = /\{hashtag\}/i.test(sablon);
    let govde = sablonDoldur(sablon, {
      baslik: String(g.baslik ?? "").trim(),
      handle: g.handle ? `@${String(g.handle).replace(/^@/, "")}` : "",
      hashtag: yer === "yorum" ? etiketMetni : "",
    });
    if (yer === "yorum" && etiketMetni && !etiketSablonda) {
      govde = govde ? `${govde}\n\n${etiketMetni}` : etiketMetni;
    }
    govde = govde.trim();
    if (govde) yorum = govde.slice(0, 2200);
  }

  return { caption, yorum, hashtagler: secilen, yer };
}

// ── Kural çözümü ───────────────────────────────────────────────────

/**
 * Platforma en uygun kuralı seçer: önce o platformun kendi satırı, yoksa
 * "*" (tüm platformlar) satırı. Hiçbiri yoksa null.
 */
export function kuralCoz<T extends { platform: string }>(
  satirlar: T[] | null | undefined,
  platform: string,
): T | null {
  const liste = satirlar ?? [];
  return liste.find((s) => s.platform === platform)
      ?? liste.find((s) => s.platform === "*")
      ?? null;
}
