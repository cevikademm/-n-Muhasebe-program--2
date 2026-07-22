// ──────────────────────────────────────────────────────────────────
// smAccountService — sm_accounts repository + Edge Function köprüsü
// ──────────────────────────────────────────────────────────────────
// Token'lar burada YOK: sm_account_credentials tablosu client'a tamamen
// kapalı (RLS açık, 0 politika). Doğrulama/profil çekme gibi token gerektiren
// her iş `sm-account-connect` Edge Function'ına delege edilir.
import { supabase } from "../supabaseService";
import { SUPABASE_URL } from "../../constants";
import type { SmHesap, SmHesapProfili, SmPlatform, MusteriId } from "./types";

const TABLO = "sm_accounts";
const FN_URL = `${SUPABASE_URL}/functions/v1/sm-account-connect`;

export async function hesaplariListele(
  ownerId: string,
  customerId: MusteriId,
): Promise<SmHesap[]> {
  let q = supabase.from(TABLO).select("*").eq("user_id", ownerId);
  q = customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId);

  const { data, error } = await q.order("platform");
  if (error) throw new Error(error.message);
  return (data || []) as SmHesap[];
}

export async function hesapEkle(params: {
  ownerId: string;
  customerId: MusteriId;
  platform: SmPlatform;
  handle: string;
  url?: string | null;
  hesap_tipi?: string | null;
}): Promise<SmHesap> {
  const { ownerId, customerId, platform, handle, url, hesap_tipi } = params;
  const { data, error } = await supabase
    .from(TABLO)
    .insert({
      user_id: ownerId,
      customer_id: customerId,
      platform,
      handle: handle.replace(/^@/, "").trim() || null,
      url: url ?? null,
      hesap_tipi: hesap_tipi ?? null,
      durum: "acildi",
    })
    .select()
    .single();

  if (error) {
    // unique(user_id, platform, handle) — kullanıcıya anlaşılır mesaj ver.
    if (error.code === "23505") {
      throw new Error("Bu handle bu platformda zaten kayıtlı.");
    }
    throw new Error(error.message);
  }
  return data as SmHesap;
}

export async function hesapGuncelle(
  id: string,
  yama: Partial<Pick<SmHesap, "handle" | "url" | "hesap_tipi" | "durum" | "notlar">>,
): Promise<SmHesap> {
  const { data, error } = await supabase
    .from(TABLO).update(yama).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as SmHesap;
}

export async function hesapSil(id: string): Promise<void> {
  // sm_account_credentials FK'si ON DELETE CASCADE → token da gider.
  const { error } = await supabase.from(TABLO).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Edge Function köprüsü ──────────────────────────────────────────

async function fnCagir<T>(gövde: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Oturum bulunamadı.");

  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(gövde),
  });

  const cevap = await res.json().catch(() => ({}));
  if (!res.ok || cevap?.success === false) {
    throw new Error(cevap?.error || `Bağlantı hatası (HTTP ${res.status})`);
  }
  return cevap as T;
}

/**
 * Bu hesaba ÖZEL bir OAuth bağlantısı başlatır ve açılacak URL'i döndürür.
 * Her hesap kendi bağlantısını alır — aynı platformda iki hesap varken
 * ortak bağlantı, ikincisinin birincinin verisini görmesine yol açıyordu.
 */
export function baglantiBaslat(accountId: string) {
  return fnCagir<{ success: true; url: string; baglantiId: string }>({
    action: "baglat", accountId,
  });
}

/** OAuth penceresi kapandıktan sonra bağlantı tamamlandı mı diye yoklar. */
export function baglantiDurumu(accountId: string) {
  return fnCagir<{ success: true; durum: string }>({ action: "durum", accountId });
}

/** Kimlik bilgisini kaydeder (token Edge Function tarafında saklanır). */
export function kimlikKaydet(params: {
  accountId: string;
  saglayici: "composio" | "meta_oauth" | "google_oauth";
  harici_hesap?: string;
}) {
  return fnCagir<{ success: true }>({ action: "kaydet", ...params });
}

/** Hesabı platform API'sine karşı doğrular ve sm_accounts'u günceller. */
export function hesapDogrula(accountId: string) {
  return fnCagir<{ success: true; dogrulandi: boolean; profil?: SmHesapProfili; uyari?: string }>({
    action: "dogrula",
    accountId,
  });
}

export function profilGetir(accountId: string) {
  return fnCagir<{ success: true; profil: SmHesapProfili }>({
    action: "profil",
    accountId,
  });
}

export function baglantiyiKopar(accountId: string) {
  return fnCagir<{ success: true }>({ action: "kopar", accountId });
}

// ── Müşteri listesi (companies) ────────────────────────────────────

export async function musterileriListele(ownerId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, company_name")
    .eq("user_id", ownerId)
    .order("company_name");
  if (error) throw new Error(error.message);
  return (data || []) as { id: string; company_name: string }[];
}
