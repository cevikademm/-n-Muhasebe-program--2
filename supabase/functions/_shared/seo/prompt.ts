// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// SEO ajanının promptları — saf metin kurgusu, yan etkisiz
// ──────────────────────────────────────────────────────────────────
// İki iş var, iki prompt: (1) trend/anahtar kelime araştırması,
// (2) tek bir içerik için başlık + caption + etiket üretimi.
//
// Ortak ilke: model "yaratıcı yazar" değil, ÖLÇÜLEBİLİR erişim peşinde
// koşan bir SEO uzmanı gibi davranmalı. Bu yüzden her iki promptta da
// "neden bu kelime" gerekçesi isteniyor — gerekçe üretemediği kelime
// genelde uydurma çıkıyor.

import { kuralAl, SHORTS_AZAMI_SN } from "./platformlar.ts";

export interface SeoProfil {
  sektor?: string | null;
  hedef_kitle?: string | null;
  bolge?: string | null;
  diller?: string[] | null;
  marka_sesi?: string | null;
  cekirdek_kelimeler?: string[] | null;
  yasakli_kelimeler?: string[] | null;
  rakip_hesaplar?: string[] | null;
  cta_havuzu?: string[] | null;
}

const liste = (x?: string[] | null) =>
  (x ?? []).filter(Boolean).join(", ") || "—";

const satir = (etiket: string, deger?: string | null) =>
  `${etiket}: ${String(deger ?? "").trim() || "—"}`;

/** Her iki promptta da aynı olan marka bloğu. */
function markaBlogu(p: SeoProfil): string {
  return [
    satir("Sektör", p.sektor),
    satir("Hedef kitle", p.hedef_kitle),
    satir("Ana pazar / bölge", p.bolge || "DE"),
    satir("İçerik dilleri", liste(p.diller)),
    satir("Marka sesi", p.marka_sesi),
    satir("Her metinde geçmesi istenen çekirdek kelimeler", liste(p.cekirdek_kelimeler)),
    satir("ASLA geçmemesi gereken kelimeler", liste(p.yasakli_kelimeler)),
    satir("İzlenecek rakip/örnek hesaplar", liste(p.rakip_hesaplar)),
    satir("Kullanılabilecek CTA'lar", liste(p.cta_havuzu)),
  ].join("\n");
}

// ── (1) Trend / anahtar kelime araştırması ─────────────────────────

export const TREND_SISTEM = `Sen bir sosyal medya SEO araştırmacısısın. İşin, bir markanın \
Instagram / YouTube / TikTok içeriklerinde kullanacağı anahtar kelime ve hashtag havuzunu \
GÜNCEL veriyle kurmak.

Çalışma biçimin:
1. Verilen sektör, hedef kitle ve bölge için web araması yap. Rakip/örnek hesaplar \
verildiyse onların son dönem gönderilerinde hangi etiketleri kullandığına bak.
2. Platformların kendi arama önerilerini, güncel içerik trendlerini ve sektörel terimleri tara.
3. Bulduğun her kelimeyi üç grupta düşün:
   · geniş  — yüksek hacim, yüksek rekabet (havuzun %20'si)
   · orta   — sektörel, ulaşılabilir (havuzun %50'si)
   · niş    — dar ama dönüşen, uzun kuyruk (havuzun %30'u)
4. Her kelime için 0-100 arası bir skor ver: değer × erişilebilirlik.

Sert kurallar:
- ARAMA HACMİ UYDURMA. Gerçek hacim verisine erişimin yok. "hacim_notu" alanına yalnızca \
gözlemine dayanan nitel bir not yaz ("çok kullanılıyor, rekabet yüksek" gibi). Sayı verme.
- Yasaklı kelimeler listesindeki hiçbir kelime çıktında geçmesin — türevleri de dâhil.
- Hashtag'ler küçük harf, tek kelime, '#' ile başlar. Türkçe/Almanca karakterler serbest.
- Kaynak alanına gerçekten baktığın bir URL ya da somut gerekçe yaz. Bakmadığın bir yeri \
kaynak gösterme.
- Yasal/tıbbi/finansal iddia içeren kelimeler seçme.`;

export function trendKullanici(
  p: SeoProfil,
  opts: { adet?: number; platformlar?: string[] } = {},
): string {
  const adet = Math.min(Math.max(opts.adet ?? 40, 10), 80);
  const platformlar = (opts.platformlar ?? ["instagram", "youtube", "tiktok"]).join(", ");
  return `Aşağıdaki marka için ${adet} adet anahtar kelime/hashtag üret.

--- MARKA ---
${markaBlogu(p)}

Hedef platformlar: ${platformlar}

Her platform için ayrı ayrı düşün ama tüm platformlarda çalışan kelimeler için platform='*' \
kullan. Sonucu skorlarına göre yüksekten düşüğe sırala.`;
}

// ── (2) Gönderi metni üretimi ──────────────────────────────────────

export const ONERI_SISTEM = `Sen bir sosyal medya SEO uzmanısın. Elindeki bir video/görsel için, \
onu ARANIP BULUNABİLİR kılacak başlık, gönderi metni ve hashtag setini yazıyorsun.

Önceliğin sırayla:
1. Bulunabilirlik — insanların gerçekten arayacağı kelimeler metnin İÇİNDE, doğal cümlede geçsin. \
Platformların araması artık metni tam metin olarak indeksliyor; etiket listesi tek başına yetmez.
2. İlk saniye — metnin ilk cümlesi kancadır. Akışta kesilmeden görünen kısım odur.
3. Etkileşim — sonda net bir eylem çağrısı ya da soru olsun.
4. Marka sesi — verilen ses tonundan sapma.

Sert kurallar:
- Yasaklı kelimeler listesindeki hiçbir kelime hiçbir alanda geçmesin.
- caption alanına HASHTAG YAZMA. Etiketler yalnızca hashtagler alanında döner; nereye \
yerleştirileceğine sistem karar verir.
- Hashtag'ler küçük harf, '#' ile başlar, en değerliden en genele sıralı.
- Emoji kullanabilirsin ama cümle başına en fazla bir tane; metni emoji duvarına çevirme.
- Clickbait yazma: metnin vaat ettiği şey içerikte yoksa erişim uzun vadede düşer.
- Yasal/tıbbi/finansal garanti cümlesi kurma ("kesin kazanç", "garantili sonuç" vb.).
- İstenen her platform × dil kombinasyonu için TAM OLARAK BİR kayıt döndür; eksik bırakma.`;

export interface IcerikBaglami {
  baslik?: string | null;
  aciklama?: string | null;
  prompt?: string | null;          // Higgsfield üretim prompt'u — içeriğin ne olduğunu anlatır
  format?: string | null;          // feed | reel | story | video | short
  sure?: number | null;            // saniye
  cozunurluk?: string | null;
  /** sm_content_pillars satırı — içeriğin hangi sütuna ait olduğu. */
  pillar?: { pillar?: string; aciklama?: string | null; hedef_kitle?: string | null } | null;
  /** Geçmişte iyi çalışmış etiketler (ileride sm_post_metrics'ten beslenecek). */
  gecmisEtiketler?: string[] | null;
}

/** Platform kısıtlarını modelin sayı saymasına bırakmadan açıkça yaz. */
function platformBloklari(platformlar: string[], format?: string | null): string {
  return platformlar
    .map((pl) => {
      const k = kuralAl(pl);
      const satirlar = [
        `### ${pl}`,
        `- caption en fazla ${k.captionSiniri} karakter`,
        `- en fazla ${k.hashtagSiniri} hashtag`,
        k.baslikVar
          ? `- ayrı başlık alanı VAR, en fazla ${k.baslikSiniri} karakter (zorunlu)`
          : `- ayrı başlık alanı YOK → baslik alanını boş string bırak`,
        k.yorumDestekli
          ? `- ilk yorum API ile yazılabiliyor → ilk_yorum alanını doldur`
          : `- ilk yorum yazılamıyor → ilk_yorum alanını boş string bırak`,
        ...k.notlar.map((n) => `- ${n}`),
      ];
      if (pl === "youtube" && format === "short") {
        satirlar.push(`- Bu içerik Short (dikey, ≤${SHORTS_AZAMI_SN} sn) → metne #Shorts ekle.`);
      }
      return satirlar.join("\n");
    })
    .join("\n\n");
}

export function oneriKullanici(
  p: SeoProfil,
  icerik: IcerikBaglami,
  opts: { platformlar: string[]; diller: string[]; anahtarlar?: string[] },
): string {
  const bolumler = [
    `--- MARKA ---\n${markaBlogu(p)}`,
    [
      "--- İÇERİK ---",
      satir("Mevcut başlık", icerik.baslik),
      satir("Mevcut açıklama", icerik.aciklama),
      satir("Üretim prompt'u (içerikte ne görünüyor)", icerik.prompt),
      satir("Format", icerik.format),
      satir("Süre (sn)", icerik.sure != null ? String(icerik.sure) : null),
      satir("Çözünürlük", icerik.cozunurluk),
      satir(
        "İçerik sütunu",
        icerik.pillar
          ? [icerik.pillar.pillar, icerik.pillar.aciklama, icerik.pillar.hedef_kitle]
              .filter(Boolean).join(" · ")
          : null,
      ),
    ].join("\n"),
  ];

  if (opts.anahtarlar?.length) {
    bolumler.push(
      `--- ARAŞTIRILMIŞ ANAHTAR KELİME HAVUZU ---\n` +
      `Bu kelimeler bu marka için önceden araştırıldı ve skorlandı. Uygun olanları kullan, ` +
      `ama içerikle ilgisi yoksa zorlama:\n${opts.anahtarlar.join(", ")}`,
    );
  }
  if (icerik.gecmisEtiketler?.length) {
    bolumler.push(
      `--- GEÇMİŞTE İYİ ÇALIŞMIŞ ETİKETLER ---\n${icerik.gecmisEtiketler.join(", ")}`,
    );
  }

  bolumler.push(`--- PLATFORM KISITLARI ---\n${platformBloklari(opts.platformlar, icerik.format)}`);
  bolumler.push(
    `--- İSTENEN ÇIKTI ---\n` +
    `Platformlar: ${opts.platformlar.join(", ")}\n` +
    `Diller: ${opts.diller.join(", ")}\n` +
    `Toplam ${opts.platformlar.length * opts.diller.length} kayıt döndür — her platform × dil için bir tane.`,
  );

  return bolumler.join("\n\n");
}
