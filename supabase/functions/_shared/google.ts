// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Google OAuth — YouTube yayını için KENDİ istemcimiz
// ──────────────────────────────────────────────────────────────────
// Neden Composio değil: Composio bağlı hesap uçlarında OAuth token'larını
// "REDACTED" olarak maskeliyor ve `YOUTUBE_UPLOAD_VIDEO` tool'u videoyu
// KENDİ diskinden okuyor (s3key de URL de kabul etmiyor — ikisi de denendi).
// Yani Composio üzerinden YouTube'a video yüklemek mümkün değil.
//
// Bu dosyayla token gerçekten bizde olur: `sm_account_credentials` içindeki
// erisim_token / yenileme_token / gecerlilik kolonlarına yazılır ve
// resumable upload doğrudan YouTube Data API v3'e yapılır.
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

/** youtube.upload yüklemek, youtube.readonly kanal bilgisi için. */
export const YT_KAPSAMLAR = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** Token süresi dolmadan bu kadar saniye önce yenile (saat kayması payı). */
const YENILEME_PAYI_SN = 120;
/** `state` bu süreden eskiyse reddedilir. */
const STATE_OMRU_MS = 15 * 60 * 1000;

// ── state imzalama ────────────────────────────────────────────────
// state'i veritabanında tutmak yerine imzalıyoruz: ek tablo/kolon
// gerekmiyor ve callback tarafında accountId taklit edilemiyor.

function b64url(veri: Uint8Array): string {
  return btoa(String.fromCharCode(...veri)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlCoz(s: string): Uint8Array {
  const d = s.replace(/-/g, "+").replace(/_/g, "/");
  const ham = atob(d + "=".repeat((4 - (d.length % 4)) % 4));
  return Uint8Array.from(ham, (c) => c.charCodeAt(0));
}

async function imzala(sir: string, mesaj: string): Promise<string> {
  const anahtar = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(sir),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const imza = await crypto.subtle.sign("HMAC", anahtar, new TextEncoder().encode(mesaj));
  return b64url(new Uint8Array(imza));
}

export async function stateUret(sir: string, veri: Record<string, unknown>): Promise<string> {
  const govde = b64url(new TextEncoder().encode(JSON.stringify({ ...veri, ts: Date.now() })));
  return `${govde}.${await imzala(sir, govde)}`;
}

export async function stateCoz(sir: string, state: string): Promise<Record<string, any> | null> {
  const [govde, imza] = String(state || "").split(".");
  if (!govde || !imza) return null;
  if (await imzala(sir, govde) !== imza) return null;   // imza tutmuyor → sahte
  try {
    const veri = JSON.parse(new TextDecoder().decode(b64urlCoz(govde)));
    if (Date.now() - Number(veri.ts || 0) > STATE_OMRU_MS) return null;
    return veri;
  } catch { return null; }
}

// ── OAuth akışı ───────────────────────────────────────────────────

export function yetkilendirmeUrl(p: {
  clientId: string; redirectUri: string; state: string; loginHint?: string;
}): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: YT_KAPSAMLAR.join(" "),
    // offline + consent olmadan refresh_token GELMEZ; ikinci yetkilendirmede
    // Google sessizce yalnızca access_token döndürür ve bir saat sonra kalırız.
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state: p.state,
  });
  if (p.loginHint) q.set("login_hint", p.loginHint);
  return `${GOOGLE_AUTH}?${q.toString()}`;
}

interface TokenYanit {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

async function tokenIste(govde: Record<string, string>): Promise<TokenYanit> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(govde),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.access_token) {
    throw new Error(d?.error_description || d?.error || `Google token hatası (HTTP ${res.status})`);
  }
  return d as TokenYanit;
}

export function koduDegistir(p: {
  code: string; clientId: string; clientSecret: string; redirectUri: string;
}): Promise<TokenYanit> {
  return tokenIste({
    code: p.code,
    client_id: p.clientId,
    client_secret: p.clientSecret,
    redirect_uri: p.redirectUri,
    grant_type: "authorization_code",
  });
}

export function tokenYenile(p: {
  refreshToken: string; clientId: string; clientSecret: string;
}): Promise<TokenYanit> {
  return tokenIste({
    refresh_token: p.refreshToken,
    client_id: p.clientId,
    client_secret: p.clientSecret,
    grant_type: "refresh_token",
  });
}

/**
 * Kullanıma hazır access token döndürür; süresi dolmuşsa yeniler ve
 * yeni değeri veritabanına yazar.
 *
 * Yenileme burada, adapter'da DEĞİL: adapter'ın veritabanı erişimi yok ve
 * olmamalı — tek sorumluluğu platform API'siyle konuşmak.
 */
export async function gecerliToken(
  admin: any,
  accountId: string,
  kimlik: { erisim_token?: string | null; yenileme_token?: string | null; gecerlilik?: string | null },
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const suresiDoldu =
    !kimlik.gecerlilik ||
    new Date(kimlik.gecerlilik).getTime() - YENILEME_PAYI_SN * 1000 < Date.now();

  if (kimlik.erisim_token && !suresiDoldu) return kimlik.erisim_token;

  if (!kimlik.yenileme_token) {
    throw new Error(
      "Google yenileme anahtarı yok. Hesaplar sekmesinden “Yeniden bağla” ile yetkiyi tazeleyin.",
    );
  }

  const yeni = await tokenYenile({
    refreshToken: kimlik.yenileme_token, clientId, clientSecret,
  });

  const gecerlilik = new Date(Date.now() + (yeni.expires_in ?? 3600) * 1000).toISOString();
  await admin.from("sm_account_credentials").update({
    erisim_token: yeni.access_token,
    // Google yenilemede genelde refresh_token döndürmez; eskisini koru.
    ...(yeni.refresh_token ? { yenileme_token: yeni.refresh_token } : {}),
    gecerlilik,
    son_hata: null,
  }).eq("account_id", accountId);

  return yeni.access_token;
}
