// ──────────────────────────────────────────────────────────────────
// smMediaService — sm_media repository katmanı
// ──────────────────────────────────────────────────────────────────
// Saf veri erişimi: React'a bağımlı değil, test edilebilir. Hook'lar
// (useSmMedia) bu fonksiyonları çağırır.
import { supabase } from "../supabaseService";
import { medyaDepo, medyaYolu } from "./storage";
import type {
  SmMedya, SmMedyaGirdi, SmMedyaFiltre, MusteriId,
} from "./types";

const TABLO = "sm_media";

/** customer_id filtresi: null → "kendi markam" satırları (IS NULL). */
function musteriUygula<T extends { eq: any; is: any }>(q: T, customerId: MusteriId): T {
  return (customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId)) as T;
}

export async function medyaListele(
  ownerId: string,
  customerId: MusteriId,
  filtre: SmMedyaFiltre = {},
): Promise<SmMedya[]> {
  let q = supabase.from(TABLO).select("*").eq("user_id", ownerId);
  q = musteriUygula(q as any, customerId);

  if (filtre.durum && filtre.durum !== "hepsi") q = q.eq("durum", filtre.durum);
  if (filtre.yalnizFavori) q = q.eq("favori", true);
  // Etiket filtresi: seçilen etiketlerin TAMAMINI içerenler (GIN indeksi kullanılır)
  if (filtre.etiketler?.length) q = q.contains("etiketler", filtre.etiketler);
  if (filtre.tip === "gorsel") q = q.like("mime_tipi", "image/%");
  if (filtre.tip === "video") q = q.like("mime_tipi", "video/%");

  if (filtre.arama?.trim()) {
    // Başlık, açıklama ve prompt üzerinde arama — AI ile üretilmiş görseli
    // çoğu zaman kullanıcı prompt'undaki bir kelimeyle hatırlıyor.
    const s = filtre.arama.trim().replace(/[%,()]/g, " ");
    q = q.or(`baslik.ilike.%${s}%,aciklama.ilike.%${s}%,prompt.ilike.%${s}%`);
  }

  const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data || []) as SmMedya[];
}

/**
 * Dosyayı depoya yazar, ardından sm_media satırını ekler.
 *
 * Sıralama bilinçli: önce depo, sonra satır. Satır yazımı başarısız olursa
 * yüklenen dosya temizlenir — aksi halde hiçbir kaydın işaret etmediği
 * "öksüz" nesneler birikir. (useInvoices'taki "storage hatası uyarı basıp
 * devam eder" davranışı burada TEKRARLANMAZ: medya kaydının dosyasız hiçbir
 * anlamı yok.)
 */
export async function medyaYukle(params: {
  ownerId: string;
  customerId: MusteriId;
  createdBy: string;
  dosya: File;
  girdi?: SmMedyaGirdi;
  onIlerleme?: (yuzde: number) => void;
}): Promise<SmMedya> {
  const { ownerId, customerId, createdBy, dosya, girdi = {}, onIlerleme } = params;

  const yol = medyaYolu(ownerId, customerId, dosya.name);
  await medyaDepo.yukle(yol, dosya, { contentType: dosya.type, onIlerleme });

  const olcu = await olculeriCoz(dosya).catch(() => null);

  const satir = {
    user_id: ownerId,
    customer_id: customerId,
    created_by: createdBy,
    depo_surucu: medyaDepo.surucu,
    depo_yolu: yol,
    baslik: girdi.baslik ?? dosya.name.replace(/\.[^.]+$/, ""),
    aciklama: girdi.aciklama ?? null,
    prompt: girdi.prompt ?? null,
    negative_prompt: girdi.negative_prompt ?? null,
    provider: girdi.provider ?? "manuel",
    model: girdi.model ?? null,
    seed: girdi.seed ?? null,
    cfg: girdi.cfg ?? null,
    steps: girdi.steps ?? null,
    mime_tipi: dosya.type || null,
    boyut: dosya.size ?? null,
    cozunurluk: olcu?.cozunurluk ?? null,
    sure: olcu?.sure ?? null,
    durum: girdi.durum ?? "taslak",
    favori: girdi.favori ?? false,
    etiketler: girdi.etiketler ?? [],
    post_id: girdi.post_id ?? null,
  };

  const { data, error } = await supabase.from(TABLO).insert(satir).select().single();
  if (error) {
    // Satır yazılamadıysa yüklenen nesneyi geri al.
    await medyaDepo.sil([yol]).catch(() => {});
    throw new Error(error.message);
  }
  return data as SmMedya;
}

export async function medyaGuncelle(
  id: string,
  yama: SmMedyaGirdi,
): Promise<SmMedya> {
  const { data, error } = await supabase
    .from(TABLO).update(yama).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as SmMedya;
}

/** Önce satırı siler, sonra dosyayı — satır silinemezse dosya durur. */
export async function medyaSil(medya: SmMedya): Promise<void> {
  const { error } = await supabase.from(TABLO).delete().eq("id", medya.id);
  if (error) throw new Error(error.message);

  const yollar = [medya.depo_yolu, medya.thumbnail_yolu].filter(Boolean) as string[];
  // Dosya silinemezse kullanıcıya hata göstermeye değmez: kayıt gitti,
  // arta kalan nesne yalnızca alan kaplar.
  await medyaDepo.sil(yollar).catch(() => {});
}

/** Galeri için tek turda imzalı URL — kart başına istek atılmaz. */
export async function medyaUrlleri(liste: SmMedya[]): Promise<Record<string, string>> {
  const yollar = Array.from(new Set(liste.map((m) => m.thumbnail_yolu || m.depo_yolu)));
  if (!yollar.length) return {};
  try {
    return await medyaDepo.imzaliUrlToplu(yollar);
  } catch {
    return {};
  }
}

/** Kütüphanede kullanılan tüm etiketler (filtre çipleri için). */
export function etiketleriTopla(liste: SmMedya[]): string[] {
  const set = new Set<string>();
  for (const m of liste) for (const e of m.etiketler || []) set.add(e);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
}

// ── Yardımcı: görsel/video ölçülerini tarayıcıda çöz ────────────────
function olculeriCoz(
  dosya: File,
): Promise<{ cozunurluk: string | null; sure: number | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(dosya);
    const bitir = (sonuc: { cozunurluk: string | null; sure: number | null }) => {
      URL.revokeObjectURL(url);
      resolve(sonuc);
    };

    if (dosya.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => bitir({ cozunurluk: `${img.naturalWidth}x${img.naturalHeight}`, sure: null });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("görsel okunamadı")); };
      img.src = url;
      return;
    }

    if (dosya.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        bitir({
          cozunurluk: `${v.videoWidth}x${v.videoHeight}`,
          sure: Number.isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : null,
        });
      v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("video okunamadı")); };
      v.src = url;
      return;
    }

    bitir({ cozunurluk: null, sure: null });
  });
}
