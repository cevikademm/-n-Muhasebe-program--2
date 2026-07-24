// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Meta (Facebook/Instagram) OAuth — KENDİ istemcimiz
// ──────────────────────────────────────────────────────────────────
// Neden Composio değil: Composio Instagram bağlantısı token'ı maskeliyor
// VE hangi Instagram hesabının bağlanacağını SEÇTİRMİYOR (Meta izin ekranında
// ne seçilirse onu alıyor). Aynı Facebook kullanıcısında birden çok IG
// Business hesabı olunca ikincisi bağlanamıyordu.
//
// Kendi OAuth'umuzla: gerçek token bizde olur, `me/accounts` ile TÜM IG
// Business hesaplarını listeleriz ve HANGİSİNİN hangi sm_accounts satırına
// gideceğini handle eşleşmesiyle kesin belirleriz. Ayrıca token maskesi
// kalktığı için ilk yorum da çalışır.
//
// state imzalama google.ts'teki jenerik HMAC ile aynı.
// Env: META_APP_ID, META_APP_SECRET
export { stateUret, stateCoz } from "./google.ts";

const GRAPH_SURUM = "v21.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_SURUM}`;
const FB_DIALOG = `https://www.facebook.com/${GRAPH_SURUM}/dialog/oauth`;

/** IG Business yayını + Sayfa listeleme için gereken izinler. */
export const META_KAPSAMLAR = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

export function yetkilendirmeUrl(p: {
  appId: string; redirectUri: string; state: string; configId?: string;
}): string {
  const q = new URLSearchParams({
    client_id: p.appId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    state: p.state,
  });
  if (p.configId) {
    // "Facebook Login for Business": izinler config'de tanımlı; ham `scope`
    // reddediliyor (Invalid Scopes). config_id ile gidilir.
    q.set("config_id", p.configId);
  } else {
    // Klasik Facebook Login yedeği.
    q.set("scope", META_KAPSAMLAR.join(","));
  }
  return `${FB_DIALOG}?${q.toString()}`;
}

async function grafGet(yol: string, params: Record<string, string>): Promise<any> {
  const q = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}${yol}?${q.toString()}`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d?.error) {
    throw new Error(d?.error?.message || `Meta${yol}: HTTP ${res.status}`);
  }
  return d;
}

/** code → kısa ömürlü kullanıcı token'ı. */
export async function koduDegistir(p: {
  code: string; appId: string; appSecret: string; redirectUri: string;
}): Promise<string> {
  const d = await grafGet("/oauth/access_token", {
    client_id: p.appId,
    client_secret: p.appSecret,
    redirect_uri: p.redirectUri,
    code: p.code,
  });
  if (!d?.access_token) throw new Error("Meta erişim token'ı alınamadı.");
  return String(d.access_token);
}

/** Kısa ömürlü → uzun ömürlü (~60 gün) kullanıcı token'ı. */
export async function uzunOmurluToken(p: {
  kisaToken: string; appId: string; appSecret: string;
}): Promise<{ token: string; gecerlilik: string | null }> {
  const d = await grafGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: p.appId,
    client_secret: p.appSecret,
    fb_exchange_token: p.kisaToken,
  });
  const token = String(d?.access_token ?? "");
  if (!token) throw new Error("Uzun ömürlü token alınamadı.");
  const gecerlilik = d?.expires_in
    ? new Date(Date.now() + Number(d.expires_in) * 1000).toISOString()
    : null; // uzun ömürlü Sayfa token'ları çoğu zaman süresiz
  return { token, gecerlilik };
}

export interface IgHesap {
  ig_user_id: string;
  username: string;
  page_id: string;
  page_adi: string;
  /** Uzun ömürlü Sayfa token'ı — IG yayını bununla yapılır (süresiz). */
  page_token: string;
}

/**
 * Kullanıcının yönettiği Sayfalar → bağlı IG Business hesaplarını listeler.
 * Handle eşleşmesi için username döner; yayın için Sayfa token'ı gelir.
 */
export async function igHesaplariListele(kullaniciToken: string): Promise<IgHesap[]> {
  const d = await grafGet("/me/accounts", {
    fields: "name,access_token,instagram_business_account{id,username}",
    access_token: kullaniciToken,
    limit: "100",
  });
  const out: IgHesap[] = [];
  for (const sayfa of d?.data ?? []) {
    const ig = sayfa?.instagram_business_account;
    if (ig?.id) {
      out.push({
        ig_user_id: String(ig.id),
        username: String(ig.username ?? ""),
        page_id: String(sayfa.id ?? ""),
        page_adi: String(sayfa.name ?? ""),
        page_token: String(sayfa.access_token ?? kullaniciToken),
      });
    }
  }
  return out;
}
