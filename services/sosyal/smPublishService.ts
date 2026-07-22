// ──────────────────────────────────────────────────────────────────
// smPublishService — sm_yayinlar repository + sm-publish köprüsü
// ──────────────────────────────────────────────────────────────────
// Yayınlama işi tarayıcıda YAPILMAZ: token'lar `sm_account_credentials`
// içinde ve o tablo client'a tamamen kapalı. Buradaki fonksiyonlar ya
// okuma sorgusu ya da Edge Function çağrısıdır.
import { supabase } from "../supabaseService";
import { SUPABASE_URL } from "../../constants";
import type { SmYayin, SmYayinHedefi, MusteriId } from "./types";

const TABLO = "sm_yayinlar";
const FN_URL = `${SUPABASE_URL}/functions/v1/sm-publish`;

export async function yayinlariListele(
  ownerId: string,
  customerId: MusteriId,
  opts: { mediaId?: string; limit?: number } = {},
): Promise<SmYayin[]> {
  let q = supabase.from(TABLO).select("*").eq("user_id", ownerId);
  q = customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId);
  if (opts.mediaId) q = q.eq("media_id", opts.mediaId);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) throw new Error(error.message);
  return (data || []) as SmYayin[];
}

/** Bir yayın satırını siler (yalnızca kayıt; yayınlanmış gönderi platformda kalır). */
export async function yayinKaydiSil(id: string): Promise<void> {
  const { error } = await supabase.from(TABLO).delete().eq("id", id);
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
    throw new Error(cevap?.error || `Yayın hatası (HTTP ${res.status})`);
  }
  return cevap as T;
}

/**
 * `otomasyon: false` → sm_otomasyon kuralı bu gönderi için hiç okunmaz:
 * ne etiket eklenir ne de ilk yorum yazılır. Varsayılan açık.
 */
export function yayinla(params: {
  mediaId: string;
  hedefler: SmYayinHedefi[];
  otomasyon?: boolean;
}) {
  return fnCagir<{ success: true; yayinlar: SmYayin[] }>({ action: "yayinla", ...params });
}

/** Devam eden (yayinlaniyor) işleri ilerletir — video işlenmesi bitmiş olabilir. */
export function yayinlariKontrolEt(yayinIds: string[]) {
  return fnCagir<{ success: true; yayinlar: SmYayin[] }>({ action: "kontrol", yayinIds });
}

export function yeniden(yayinId: string) {
  return fnCagir<{ success: true; yayinlar: SmYayin[] }>({ action: "tekrar", yayinId });
}

export function iptalEt(yayinId: string) {
  return fnCagir<{ success: true }>({ action: "iptal", yayinId });
}

// ── Küçük yardımcılar ──────────────────────────────────────────────

/** Bir medya için platform bazlı en güncel yayın durumu. */
export function yayinlariMedyayaGoreGrupla(liste: SmYayin[]): Record<string, SmYayin[]> {
  const harita: Record<string, SmYayin[]> = {};
  for (const y of liste) (harita[y.media_id] ||= []).push(y);
  return harita;
}

export const acikDurumlar: SmYayin["durum"][] = ["kuyrukta", "yayinlaniyor"];

/** İlk yorum kaç kez denenir — sm-publish'teki YORUM_AZAMI_DENEME ile aynı. */
const YORUM_AZAMI_DENEME = 3;

/**
 * Gönderi yayınlandı ama ilk yorum hâlâ yazılmadı.
 * Yorum, Edge Function'ın bütçesi dolduğunda bir sonraki `kontrol` turuna
 * kalabiliyor; bu satırlar da yoklamaya devam etmeli.
 */
export const yorumBekliyor = (y: SmYayin) =>
  y.durum === "yayinlandi"
  && y.yorum_durum === "bekliyor"
  && (y.yorum_deneme ?? 0) < YORUM_AZAMI_DENEME;

export const acikMi = (y: SmYayin) => acikDurumlar.includes(y.durum) || yorumBekliyor(y);
