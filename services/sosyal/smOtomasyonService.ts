// ──────────────────────────────────────────────────────────────────
// smOtomasyonService — sm_otomasyon repository
// ──────────────────────────────────────────────────────────────────
// Kural sırf veri; token gerektirmediği için Edge Function'a ihtiyaç yok.
// Aynı kuralı yayın anında `sm-publish` de okur (bkz. kurallariOku).
import { supabase } from "../supabaseService";
import type { SmOtomasyon, SmOtomasyonGirdi, MusteriId } from "./types";

const TABLO = "sm_otomasyon";

/** Bu markanın tüm kuralları ("*" + varsa platform ezmeleri). */
export async function otomasyonListele(
  ownerId: string,
  customerId: MusteriId,
): Promise<SmOtomasyon[]> {
  let q = supabase.from(TABLO).select("*").eq("user_id", ownerId);
  q = customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId);

  const { data, error } = await q.order("platform");
  if (error) throw new Error(error.message);
  return (data || []) as SmOtomasyon[];
}

/**
 * Kuralı kaydeder: varsa günceller, yoksa oluşturur.
 *
 * upsert KULLANILMAZ: tekillik `customer_id is null` / `is not null` şeklinde
 * İKİ PARÇALI indeksle kuruluyor (bkz. 20260723_sm_otomasyon.sql) ve PostgREST
 * `on_conflict` bir partial index'i çıkarsayamıyor. Önce oku-sonra yaz burada
 * hem doğru hem okunaklı.
 */
export async function otomasyonKaydet(
  ownerId: string,
  customerId: MusteriId,
  yama: SmOtomasyonGirdi,
  platform: string = "*",
): Promise<SmOtomasyon> {
  let q = supabase.from(TABLO).select("id").eq("user_id", ownerId).eq("platform", platform);
  q = customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId);
  const { data: mevcut, error: okumaHatasi } = await q.maybeSingle();
  if (okumaHatasi) throw new Error(okumaHatasi.message);

  if (mevcut?.id) {
    const { data, error } = await supabase
      .from(TABLO).update(yama).eq("id", mevcut.id).select().single();
    if (error) throw new Error(error.message);
    return data as SmOtomasyon;
  }

  const { data, error } = await supabase
    .from(TABLO)
    .insert({ user_id: ownerId, customer_id: customerId, platform, ...yama })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SmOtomasyon;
}

export async function otomasyonSil(id: string): Promise<void> {
  const { error } = await supabase.from(TABLO).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
