// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Composio ortak istemcisi
// ──────────────────────────────────────────────────────────────────
// ig-metrics-sync içinde yazılmıştı; sm-account-connect de aynı çağrı
// biçimine ihtiyaç duyunca buraya çıkarıldı. İki kopya tutulmaz —
// Composio yanıt sarmalı ({ successful, data, error }) tek yerde çözülür.

export const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";

export interface ComposioKimlik {
  apiKey: string;
  userId: string;
}

/**
 * Composio tool'unu çalıştırır ve sarmalı açıp `data`yı döndürür.
 * Başarısızlıkta hata fırlatır — çağıran taraf try/catch ile düşüş
 * stratejisini kendi belirler.
 */
export async function composioCalistir(
  tool: string,
  args: Record<string, unknown>,
  kimlik: ComposioKimlik,
  /**
   * HANGİ bağlı hesapla çalıştırılacağı. Verilmezse Composio user_id için
   * kayıtlı bağlantılardan birini KENDİ seçer — aynı platformda birden çok
   * hesap varsa (iki Instagram gibi) yanlış hesaba gider. Çoklu hesap
   * senaryosunda bu alan ZORUNLU sayılmalı.
   */
  connectedAccountId?: string | null,
): Promise<unknown> {
  const govde: Record<string, unknown> = { user_id: kimlik.userId, arguments: args };
  if (connectedAccountId) govde.connected_account_id = connectedAccountId;

  const res = await fetch(`${COMPOSIO_BASE}/tools/execute/${tool}`, {
    method: "POST",
    headers: { "x-api-key": kimlik.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    const msg = body?.error?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`${tool}: ${msg}`);
  }
  if (body?.successful === false) throw new Error(`${tool}: ${body?.error || "başarısız"}`);
  return body?.data ?? body;
}

/** Graph API insights yanıtı: { data: [ {name, values:[{value}]}, ... ] } */
export function insightsToMap(payload: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const list = (payload as any)?.data ?? (payload as any)?.response_data?.data ?? [];
  for (const m of Array.isArray(list) ? list : []) {
    const v = m?.values?.[0]?.value ?? m?.value;
    if (typeof v === "number") out[m.name] = v;
  }
  return out;
}

/** Medya listesi yanıtını normalize eder (sarmal biçimi uca göre değişiyor). */
export function mediaList(payload: unknown): any[] {
  const p = payload as any;
  const list = p?.data ?? p?.response_data?.data ?? p?.media ?? [];
  return Array.isArray(list) ? list : [];
}

/** Tek nesne dönen uçlar için sarmal çözücü (profil bilgisi vb.). */
export function tekNesne(payload: unknown): Record<string, any> {
  const p = payload as any;
  const n = p?.data ?? p?.response_data?.data ?? p?.response_data ?? p;
  return (n && typeof n === "object" && !Array.isArray(n)) ? n : {};
}

// ──────────────────────────────────────────────────────────────────
// Bağlı hesap (connected account) erişimi
// ──────────────────────────────────────────────────────────────────
// Bazı platformlarda Composio'nun hazır tool'u işimizi görmüyor ve API'ye
// DOĞRUDAN gitmemiz gerekiyor. Örnek: YOUTUBE_UPLOAD_VIDEO `videoFilePath`
// (yerel dosya yolu) istiyor — Edge Function'da yerel disk yok, videomuz
// Storage'da. Bu durumda OAuth'u yine Composio yapar, biz yalnızca
// access_token'ı alıp isteği kendimiz kurarız.

async function composioGet(yol: string, kimlik: ComposioKimlik): Promise<any> {
  const res = await fetch(`${COMPOSIO_BASE}${yol}`, {
    headers: { "x-api-key": kimlik.apiKey },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`composio${yol}: ${msg}`);
  }
  return body;
}

/**
 * Kullanıcının verilen toolkit'teki AKTİF bağlı hesabını bulur.
 * `tercihEdilenId` doluysa önce o denenir (kayıtta saklanan bağlantı).
 */
export async function baglantiBul(
  toolkit: string,
  kimlik: ComposioKimlik,
  tercihEdilenId?: string | null,
): Promise<{ id: string; status: string } | null> {
  if (tercihEdilenId) {
    try {
      const a = await composioGet(`/connected_accounts/${tercihEdilenId}`, kimlik);
      if (a?.id) return { id: a.id, status: String(a.status ?? "") };
    } catch {
      // Bağlantı silinmiş olabilir — aşağıdaki listeden tazesini bul.
    }
  }

  const liste = await composioGet(
    `/connected_accounts?user_ids=${encodeURIComponent(kimlik.userId)}&toolkit_slugs=${encodeURIComponent(toolkit)}`,
    kimlik,
  );
  const items: any[] = liste?.items ?? liste?.data ?? [];
  // Aynı toolkit'te birden çok bağlantı olabilir (biri EXPIRED); aktif olanı seç.
  const aktif = items.find((a) => String(a?.status).toUpperCase() === "ACTIVE");
  const secilen = aktif ?? items[0];
  return secilen?.id ? { id: secilen.id, status: String(secilen.status ?? "") } : null;
}

/**
 * Bağlı hesabın OAuth access token'ını döndürür.
 * Composio yanıtı sürüme göre `data` / `state.val` / `params` altında
 * taşıyor — üçünü de tolere et.
 */
export async function baglantiTokeni(
  connectedAccountId: string,
  kimlik: ComposioKimlik,
): Promise<string> {
  const a = await composioGet(`/connected_accounts/${connectedAccountId}`, kimlik);

  const durum = String(a?.status ?? "").toUpperCase();
  if (durum && durum !== "ACTIVE") {
    throw new Error(`Bağlantı aktif değil (${durum}). Hesabı yeniden bağlayın.`);
  }

  const token =
    a?.data?.access_token ??
    a?.state?.val?.access_token ??
    a?.params?.access_token ??
    null;

  if (!token) throw new Error("Bağlantıdan access token alınamadı.");
  return String(token);
}

/** Platform → Composio toolkit slug'ı. */
export const TOOLKIT: Record<string, string> = {
  instagram: "instagram",
  youtube: "youtube",
  facebook: "facebook",
  tiktok: "tiktok",
  linkedin: "linkedin",
  x: "twitter",
  pinterest: "pinterest",
};

async function composioPost(yol: string, govde: unknown, kimlik: ComposioKimlik): Promise<any> {
  const res = await fetch(`${COMPOSIO_BASE}${yol}`, {
    method: "POST",
    headers: { "x-api-key": kimlik.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`composio${yol}: ${msg}`);
  }
  return body;
}

/** Toolkit için kayıtlı auth config; yoksa Composio yönetimli bir tane açar. */
async function authConfigAl(toolkit: string, kimlik: ComposioKimlik): Promise<string> {
  const liste = await composioGet(
    `/auth_configs?toolkit_slug=${encodeURIComponent(toolkit)}`, kimlik,
  ).catch(() => ({}));
  const items: any[] = liste?.items ?? liste?.data ?? [];
  const mevcut = items.find((a) => a?.id && !a?.deprecated);
  if (mevcut?.id) return mevcut.id;

  const yeni = await composioPost("/auth_configs", {
    toolkit: { slug: toolkit },
    auth_config: { type: "use_composio_managed_auth", name: `fikoai-${toolkit}` },
  }, kimlik);
  const id = (yeni?.auth_config ?? yeni)?.id;
  if (!id) throw new Error(`${toolkit} için auth config oluşturulamadı.`);
  return id;
}

/**
 * Yeni bir OAuth bağlantısı başlatır.
 *
 * Her sosyal hesap KENDİ bağlı hesabını alır: aynı platformda iki hesap
 * varken (iki Instagram) tek bağlantıyı paylaşmak, ikinci hesabın
 * birincininkine yazmasına yol açıyordu.
 *
 * → { id, url }  — url kullanıcıya açtırılır, dönüşte bağlantı ACTIVE olur.
 */
export async function baglantiBaslat(
  platform: string,
  kimlik: ComposioKimlik,
): Promise<{ id: string; url: string }> {
  const toolkit = TOOLKIT[platform];
  if (!toolkit) throw new Error(`${platform} için Composio toolkit tanımlı değil.`);

  const authConfigId = await authConfigAl(toolkit, kimlik);
  const d = await composioPost("/connected_accounts", {
    auth_config: { id: authConfigId },
    connection: { user_id: kimlik.userId },
  }, kimlik);

  const url = d?.redirect_url ?? d?.redirectUrl ?? d?.connectionData?.redirect_url ?? null;
  if (!d?.id || !url) throw new Error("Bağlantı bağlantısı (OAuth URL) alınamadı.");
  return { id: String(d.id), url: String(url) };
}

/** Bağlantının anlık durumu — OAuth tamamlandı mı diye yoklamak için. */
export async function baglantiDurumu(
  connectedAccountId: string,
  kimlik: ComposioKimlik,
): Promise<string> {
  const a = await composioGet(`/connected_accounts/${connectedAccountId}`, kimlik);
  return String(a?.status ?? "").toUpperCase();
}

/**
 * Composio "user_id"sini MÜŞTERİ bazında kapsar.
 *
 * Composio'da user_id, bağlantıların kiracı anahtarıdır. Ajans modunda
 * tüm müşterilerin hesapları tek bir user_id altında toplanırsa
 * `baglantiBul()` bir müşterinin bağlantısını diğerine verebilir —
 * yani A müşterisinin videosu B'nin hesabına düşebilir.
 *
 *   customer_id yok  → sahibin kendi markası (mevcut kurulum korunur)
 *   customer_id var  → "<taban>__m_<customer_id>"
 *
 * Taban değerin korunması şart: fikoai.de bağlantısı bugün `cevikadem`
 * altında duruyor, kapsam değişirse bulunamaz hâle gelirdi.
 */
export function composioKullanici(taban: string, customerId?: string | null): string {
  return customerId ? `${taban}__m_${customerId}` : taban;
}
