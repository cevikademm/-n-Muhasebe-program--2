// ──────────────────────────────────────────────────────────────────
// smUretimService — sm_uretim_isleri + sm_posts okuma katmanı
// ──────────────────────────────────────────────────────────────────
// Üretimin KENDİSİ burada yapılmaz: Higgsfield çağrıları ya Claude/MCP
// oturumunda ya da sm-uret-api Edge Function'ında olur. Uygulama yalnızca
// kuyruğu görüntüler ve takvim metnini okur.
import { supabase } from "../supabaseService";
import { SUPABASE_URL } from "../../constants";
import type { SmPost, SmUretimIsi, MusteriId } from "./types";

const IS_TABLO = "sm_uretim_isleri";
const POST_TABLO = "sm_posts";
const FN_URL = `${SUPABASE_URL}/functions/v1/sm-uretim`;

function musteriUygula<T extends { eq: any; is: any }>(q: T, customerId: MusteriId): T {
  return (customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId)) as T;
}

/** Bitmemiş üretim işleri — onay ekranındaki "üretimde" sayacı için. */
export async function isleriListele(
  ownerId: string,
  customerId: MusteriId,
  opts: { durumlar?: SmUretimIsi["durum"][]; limit?: number } = {},
): Promise<SmUretimIsi[]> {
  let q = supabase.from(IS_TABLO).select("*").eq("user_id", ownerId);
  q = musteriUygula(q as any, customerId);
  if (opts.durumlar?.length) q = q.in("durum", opts.durumlar);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) throw new Error(error.message);
  return (data || []) as SmUretimIsi[];
}

/**
 * Verilen id'lerdeki takvim satırları. Onay kartı gönderinin hook'unu,
 * caption'ını ve hedef platformlarını buradan okur; `sm_media` bunları
 * kopyalamaz (tek kaynak takvimde kalsın diye).
 */
export async function postlariGetir(postIds: string[]): Promise<Record<string, SmPost>> {
  const temiz = Array.from(new Set(postIds.filter(Boolean)));
  if (!temiz.length) return {};

  const { data, error } = await supabase
    .from(POST_TABLO).select("*").in("id", temiz);
  if (error) throw new Error(error.message);

  const harita: Record<string, SmPost> = {};
  for (const p of (data || []) as SmPost[]) harita[p.id] = p;
  return harita;
}

/** Gönderi yayınlandığında takvim satırını kapatır. */
export async function postuYayinlandiIsaretle(
  postId: string,
  yayinUrlleri: Record<string, string>,
): Promise<void> {
  const { error } = await supabase
    .from(POST_TABLO)
    .update({
      durum: "yayinlandi",
      yayin_tarihi: new Date().toISOString(),
      yayin_urlleri: yayinUrlleri,
    })
    .eq("id", postId);
  if (error) throw new Error(error.message);
}

/** Reddedilen üretim: takvim satırı yeniden üretim kuyruğuna düşer. */
export async function postuGeriAl(postId: string): Promise<void> {
  const { error } = await supabase
    .from(POST_TABLO).update({ durum: "fikir" }).eq("id", postId);
  if (error) throw new Error(error.message);
}

// ── Edge Function köprüsü ──────────────────────────────────────────

async function fnCagir<T>(govde: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Oturum bulunamadı.");

  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(govde),
  });

  const cevap = await res.json().catch(() => ({}));
  if (!res.ok || cevap?.success === false) {
    throw new Error(cevap?.error || `Üretim hatası (HTTP ${res.status})`);
  }
  return cevap as T;
}

/**
 * Takvimdeki üretilmemiş gönderiler için iş satırı açar. Tekrar çağrılabilir:
 * işi zaten olan gönderi atlanır.
 */
export function planiUygula(params: { gun?: number; motor?: string } = {}) {
  return fnCagir<{ success: true; acilan: number; isler: SmUretimIsi[] }>({
    action: "plan-uygula", ...params,
  });
}

/**
 * "Yeniden üret": tamamlanmış/hatalı işi kuyruğa geri koyar.
 *
 * `harici_job_id` MUTLAKA temizlenir: ice-aktar aynı job id'yi görürse
 * yeni üretimi kütüphaneye almaz, eski medyayı döndürür (tekrar koruması).
 */
export function isiSifirla(isId: string) {
  return fnCagir<{ success: true; is: SmUretimIsi }>({
    action: "is-guncelle", isId,
    durum: "bekliyor", hata: null, harici_job_id: null, sonuc_url: null,
  });
}
