// ──────────────────────────────────────────────────────────────────
// smTakvimService — takvimin üç kaynağı tek akışta
// ──────────────────────────────────────────────────────────────────
// Takvim yeni bir tablo AÇMAZ. Zaten üç ayrı yerde tarihli satır var ve
// kullanıcı için hepsi aynı soruya cevap veriyor: "bu gün ne oluyor?"
//
//   sm_posts          → içerik takvimi (planlanan_tarih)  · ne yazılacak
//   sm_uretim_isleri  → üretim kuyruğu (planlanan)        · ne üretilecek
//   sm_yayinlar       → yayın kuyruğu  (planlanan/created)· ne yayınlandı
//
// Üçü `SmTakvimOgesi`'ne normalize edilir; ekran kaynak ayrımını yalnızca
// renk/rozet düzeyinde görür.
import { supabase } from "../supabaseService";
import type { SmTakvimOgesi, SmPlatform, MusteriId } from "./types";

/** Bir ayın [ilk gün 00:00, son gün 23:59:59.999] ISO sınırları. */
export function ayAraligi(yil: number, ay: number): { bas: string; bit: string } {
  const bas = new Date(yil, ay, 1, 0, 0, 0, 0);
  const bit = new Date(yil, ay + 1, 0, 23, 59, 59, 999);
  return { bas: bas.toISOString(), bit: bit.toISOString() };
}

/** "2026-07-23T21:00:00Z" → "2026-07-24" (YEREL güne göre — takvim yerel yaşar). */
export function gunAnahtari(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function musteriFiltre(q: any, customerId: MusteriId) {
  return customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId);
}

/**
 * Aralık sorgusu iki parçalı: `planlanan` doluysa o, değilse `created_at`
 * geçerli tarihtir. PostgREST'te bunu tek `or()` ifadesiyle kurmak okunaksız
 * ve kırılgan; iki düz sorgu atıp id'ye göre birleştirmek hem güvenli hem açık.
 */
async function ikiliAralik(
  tablo: string, ownerId: string, customerId: MusteriId,
  planAlan: string, bas: string, bit: string,
) {
  const kur = () => musteriFiltre(
    supabase.from(tablo).select("*").eq("user_id", ownerId), customerId,
  );

  const [planlı, planlanmamış] = await Promise.all([
    kur().gte(planAlan, bas).lte(planAlan, bit).limit(300),
    kur().is(planAlan, null).gte("created_at", bas).lte("created_at", bit).limit(300),
  ]);
  if (planlı.error) throw new Error(planlı.error.message);
  if (planlanmamış.error) throw new Error(planlanmamış.error.message);

  const harita = new Map<string, any>();
  for (const r of [...(planlı.data ?? []), ...(planlanmamış.data ?? [])]) harita.set(r.id, r);
  return Array.from(harita.values());
}

/** Tek tarih alanı olan kaynak (sm_posts) — hep dizi döndürsün diye sarmalandı. */
async function tekAralik(
  tablo: string, ownerId: string, customerId: MusteriId,
  alan: string, bas: string, bit: string,
): Promise<any[]> {
  const { data, error } = await musteriFiltre(
    supabase.from(tablo).select("*").eq("user_id", ownerId), customerId,
  ).gte(alan, bas).lte(alan, bit).limit(300);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Yayın durumu → takvim rengi (ortak.ts'teki YAYIN_DURUM_META ile aynı skala). */
const YAYIN_RENK: Record<string, string> = {
  kuyrukta: "#64748b",
  yayinlaniyor: "#06b6d4",
  yayinlandi: "#10b981",
  hata: "#ef4444",
  iptal: "#475569",
};

const URETIM_RENK: Record<string, string> = {
  bekliyor: "#64748b",
  alindi: "#06b6d4",
  uretiliyor: "#06b6d4",
  tamam: "#8b5cf6",
  hata: "#ef4444",
  iptal: "#475569",
};

const POST_RENK: Record<string, string> = {
  fikir: "#64748b",
  uretimde: "#06b6d4",
  hazir: "#f59e0b",
  planlandi: "#8b5cf6",
  yayinlandi: "#10b981",
  iptal: "#475569",
};

/** Metni takvim çipine sığacak uzunlukta keser. */
function kisalt(metin: string | null | undefined, uzunluk = 60): string {
  const t = String(metin ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > uzunluk ? `${t.slice(0, uzunluk - 1)}…` : t;
}

/**
 * Bir ayın tüm takvim öğeleri. Üç kaynak paralel çekilir — biri patlarsa
 * tamamı düşmesin diye sonuçlar tek tek değerlendirilir.
 */
export async function takvimAyiGetir(
  ownerId: string,
  customerId: MusteriId,
  yil: number,
  ay: number,
): Promise<{ ogeler: SmTakvimOgesi[]; uyarilar: string[] }> {
  const { bas, bit } = ayAraligi(yil, ay);
  const uyarilar: string[] = [];

  const [yayinlar, postlar, uretimler] = await Promise.allSettled([
    ikiliAralik("sm_yayinlar", ownerId, customerId, "planlanan", bas, bit),
    tekAralik("sm_posts", ownerId, customerId, "planlanan_tarih", bas, bit),
    ikiliAralik("sm_uretim_isleri", ownerId, customerId, "planlanan", bas, bit),
  ]);

  const ogeler: SmTakvimOgesi[] = [];

  if (yayinlar.status === "fulfilled") {
    for (const y of yayinlar.value) {
      ogeler.push({
        id: `yayin:${y.id}`,
        kaynak: "yayin",
        tarih: y.planlanan ?? y.bitis ?? y.created_at,
        baslik: kisalt(y.caption) || "(metinsiz gönderi)",
        platform: y.platform as SmPlatform,
        durum: y.durum,
        renk: YAYIN_RENK[y.durum] ?? "#64748b",
        url: y.yayin_url ?? null,
        gerceklesti: y.durum === "yayinlandi",
      });
    }
  } else uyarilar.push("Yayın kuyruğu okunamadı.");

  if (postlar.status === "fulfilled") {
    for (const p of postlar.value) {
      const platformlar: SmPlatform[] = Array.isArray(p.platformlar) ? p.platformlar : [];
      ogeler.push({
        id: `post:${p.id}`,
        kaynak: "post",
        tarih: p.planlanan_tarih,
        baslik: kisalt(p.hook || p.caption_de) || "(başlıksız fikir)",
        // Takvim satırı çoklu platform taşıyabilir; çip tek renk gösterdiği
        // için ilki temsil eder, tamamı detay listesinde yazılır.
        platform: platformlar[0] ?? null,
        platformlar,
        durum: p.durum,
        renk: POST_RENK[p.durum] ?? "#64748b",
        url: null,
        gerceklesti: p.durum === "yayinlandi",
      });
    }
  } else uyarilar.push("İçerik takvimi okunamadı.");

  if (uretimler.status === "fulfilled") {
    for (const u of uretimler.value) {
      ogeler.push({
        id: `uretim:${u.id}`,
        kaynak: "uretim",
        tarih: u.planlanan ?? u.created_at,
        baslik: kisalt(u.prompt) || `${u.tur} üretimi`,
        platform: null,
        durum: u.durum,
        renk: URETIM_RENK[u.durum] ?? "#64748b",
        url: null,
        gerceklesti: u.durum === "tamam",
      });
    }
  } else uyarilar.push("Üretim kuyruğu okunamadı.");

  ogeler.sort((a, b) => +new Date(a.tarih) - +new Date(b.tarih));
  return { ogeler, uyarilar };
}

/** Öğeleri gün anahtarına göre kovalar — ızgara O(1) okur. */
export function gunlereBol(ogeler: SmTakvimOgesi[]): Record<string, SmTakvimOgesi[]> {
  const harita: Record<string, SmTakvimOgesi[]> = {};
  for (const o of ogeler) {
    if (!o.tarih) continue;
    (harita[gunAnahtari(o.tarih)] ||= []).push(o);
  }
  return harita;
}
