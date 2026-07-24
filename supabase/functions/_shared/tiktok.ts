// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// TikTok OAuth — KENDİ istemcimiz (Composio TikTok'u yönetmiyor)
// ──────────────────────────────────────────────────────────────────
// Composio'nun TikTok için hazır OAuth uygulaması YOK (test edildi:
// "Composio does not have managed credentials for tiktok"). Ayrıca
// yayın için gereken token'ı da vermiyor. Bu yüzden Login Kit + Content
// Posting API'yi kendi TikTok Developer uygulamamızla kullanıyoruz.
//
// state imzalama google.ts'teki jenerik HMAC ile aynı — tekrar yazmıyoruz.
//
// Env: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
export { stateUret, stateCoz } from "./google.ts";

export const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_API = "https://open.tiktokapis.com/v2";

export const TIKTOK_KAPSAMLAR = ["user.info.basic", "video.publish", "video.upload"];

/** access token süresi dolmadan bu kadar önce yenile. */
const YENILEME_PAYI_SN = 300;

export function yetkilendirmeUrl(p: {
  clientKey: string; redirectUri: string; state: string;
}): string {
  const q = new URLSearchParams({
    client_key: p.clientKey,
    // TikTok scope'ları VİRGÜLLE ayrılır (Google boşlukla).
    scope: TIKTOK_KAPSAMLAR.join(","),
    response_type: "code",
    redirect_uri: p.redirectUri,
    state: p.state,
  });
  return `${TIKTOK_AUTH}?${q.toString()}`;
}

interface TokenYanit {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenIste(govde: Record<string, string>): Promise<TokenYanit> {
  const res = await fetch(TIKTOK_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(govde),
  });
  const d = await res.json().catch(() => ({}));
  // v2 token yanıtı düz JSON; hata `error`/`error_description` alanında.
  if (!res.ok || d?.error || !d?.access_token) {
    throw new Error(d?.error_description || d?.error || `TikTok token hatası (HTTP ${res.status})`);
  }
  return d as TokenYanit;
}

export function koduDegistir(p: {
  code: string; clientKey: string; clientSecret: string; redirectUri: string;
}): Promise<TokenYanit> {
  return tokenIste({
    client_key: p.clientKey,
    client_secret: p.clientSecret,
    code: p.code,
    grant_type: "authorization_code",
    redirect_uri: p.redirectUri,
  });
}

export function tokenYenile(p: {
  refreshToken: string; clientKey: string; clientSecret: string;
}): Promise<TokenYanit> {
  return tokenIste({
    client_key: p.clientKey,
    client_secret: p.clientSecret,
    grant_type: "refresh_token",
    refresh_token: p.refreshToken,
  });
}

/**
 * Kullanıma hazır access token; süresi dolmuşsa yeniler ve DB'ye yazar.
 * (Yenileme adapter'da değil burada — adapter'ın DB erişimi yok.)
 */
export async function gecerliToken(
  admin: any, accountId: string,
  kimlik: { erisim_token?: string | null; yenileme_token?: string | null; gecerlilik?: string | null },
  clientKey: string, clientSecret: string,
): Promise<string> {
  const suresiDoldu =
    !kimlik.gecerlilik ||
    new Date(kimlik.gecerlilik).getTime() - YENILEME_PAYI_SN * 1000 < Date.now();

  if (kimlik.erisim_token && !suresiDoldu) return kimlik.erisim_token;
  if (!kimlik.yenileme_token) {
    throw new Error("TikTok yenileme anahtarı yok. “Yeniden bağla” ile yetkiyi tazeleyin.");
  }

  const yeni = await tokenYenile({
    refreshToken: kimlik.yenileme_token, clientKey, clientSecret,
  });
  await admin.from("sm_account_credentials").update({
    erisim_token: yeni.access_token,
    ...(yeni.refresh_token ? { yenileme_token: yeni.refresh_token } : {}),
    gecerlilik: new Date(Date.now() + (yeni.expires_in ?? 86400) * 1000).toISOString(),
    son_hata: null,
  }).eq("account_id", accountId);

  return yeni.access_token;
}
