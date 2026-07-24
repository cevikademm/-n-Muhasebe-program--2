// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Yayın için geçici PUBLIC kopya
// ──────────────────────────────────────────────────────────────────
// Instagram (ve çoğu Graph API tabanlı platform) medyayı KENDİ sunucusundan
// çeker ve imzalı/sorgu parametreli URL'leri reddeder. Bizim `sm-media`
// bucket'ımız ise bilinçli olarak private.
//
// Çözüm: yayın anında dosyanın kopyası tahmin edilemez rastgele bir yola
// `sm-yayin-gecici` (public) bucket'ına yazılır, platform çeker, iş biter
// bitmez kopya silinir. Asıl kreatif hiçbir zaman public olmaz.
//
// Kopya YAYIN BAŞINA DEĞİL MEDYA BAŞINA bir kez üretilir: aynı görsel üç
// platforma gidiyorsa üç kez kopyalanmaz.

export const GECICI_BUCKET = "sm-yayin-gecici";
const KAYNAK_BUCKET = "sm-media";

/** `a/b/1721_kedi.jpg` → `.jpg` (yoksa boş). */
function uzanti(yol: string): string {
  const ad = yol.split("/").pop() || "";
  const i = ad.lastIndexOf(".");
  return i > 0 ? ad.slice(i) : "";
}

export interface GeciciKopya {
  yol: string;
  url: string;
}

/**
 * Private kaynağı public geçici bucket'a kopyalar ve sorgu parametresiz
 * public URL döndürür.
 *
 * Önce sunucu tarafı `copy` denenir (dosya Edge Function belleğinden geçmez —
 * 500 MB'lık video için tek uygulanabilir yol). Depo sürümü destination
 * bucket'ı desteklemiyorsa indir-yükle'ye düşülür.
 */
export async function geciciKopyaOlustur(
  admin: any,
  kaynakYol: string,
): Promise<GeciciKopya> {
  const hedefYol = `${crypto.randomUUID()}${uzanti(kaynakYol)}`;

  const { error: kopyaHatasi } = await admin.storage
    .from(KAYNAK_BUCKET)
    .copy(kaynakYol, hedefYol, { destinationBucket: GECICI_BUCKET });

  if (kopyaHatasi) {
    const { data: dosya, error: indirHatasi } = await admin.storage
      .from(KAYNAK_BUCKET)
      .download(kaynakYol);
    if (indirHatasi || !dosya) {
      throw new Error(`Medya okunamadı: ${indirHatasi?.message || kopyaHatasi.message}`);
    }
    const { error: yukleHatasi } = await admin.storage
      .from(GECICI_BUCKET)
      .upload(hedefYol, dosya, { contentType: dosya.type || undefined, upsert: false });
    if (yukleHatasi) throw new Error(`Geçici kopya yazılamadı: ${yukleHatasi.message}`);
  }

  const { data } = admin.storage.from(GECICI_BUCKET).getPublicUrl(hedefYol);
  const url = String(data?.publicUrl || "").split("?")[0];
  if (!url) throw new Error("Geçici public URL üretilemedi.");

  return { yol: hedefYol, url };
}

/** Sessiz temizlik — silinemezse yayını başarısız saymanın anlamı yok. */
export async function geciciSil(admin: any, yollar: string[]): Promise<void> {
  const temiz = yollar.filter(Boolean);
  if (!temiz.length) return;
  await admin.storage.from(GECICI_BUCKET).remove(temiz).catch(() => {});
}

/**
 * Fonksiyon zaman aşımına uğrarsa `finally` çalışmayabilir ve public kopya
 * ortada kalır. Her çağrının başında, işi bitmiş ama yolu hâlâ dolu olan
 * satırlar süpürülür — böylece temizlik en geç bir sonraki yayında olur.
 */
export async function geciciSupur(admin: any, userId: string): Promise<void> {
  try {
    const { data } = await admin
      .from("sm_yayinlar")
      .select("id, gecici_yol")
      .eq("user_id", userId)
      .not("gecici_yol", "is", null)
      .in("durum", ["yayinlandi", "hata", "iptal"])
      .limit(50);

    const satirlar = data || [];
    if (!satirlar.length) return;

    await geciciSil(admin, satirlar.map((s: any) => s.gecici_yol));
    await admin
      .from("sm_yayinlar")
      .update({ gecici_yol: null })
      .in("id", satirlar.map((s: any) => s.id));
  } catch {
    // Süpürme en iyi çabadır; asıl işi engellemez.
  }
}
