// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Edge Function ortak HTTP yardımcıları
// ──────────────────────────────────────────────────────────────────
// CORS listesi ve json() sarmalayıcısı bugüne kadar her fonksiyonun başına
// kopyalanıyordu. Paket/davet fonksiyonları dört tane birden olduğu için
// buraya çıkarıldı — yeni bir origin eklendiğinde tek yer güncellenir.
// (Eski fonksiyonlar kendi kopyalarıyla çalışmaya devam ediyor; onları
// dokunmadan bırakmak, çalışan davranışı riske atmamak için bilinçli.)

export const ALLOWED_ORIGINS = [
  "https://fikoai.de",
  "https://www.fikoai.de",
  "https://fibu-de-2.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
];

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function jsonYanit(corsHeaders: Record<string, string>) {
  return (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
}

/** Uygulamanın canlı adresi — davet linkleri buradan üretilir. */
export const SITE_URL = Deno.env.get("SITE_URL") || "https://fikoai.de";

/** Basit e-posta biçim kontrolü (kayıt formlarındakiyle aynı desen). */
export const gecerliEposta = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/**
 * Çağıranın oturumunu doğrular ve admin olup olmadığını **service-role ile**
 * profiles'tan okur. İstemciden gelen role bilgisine asla güvenilmez.
 */
export async function adminCagiranDogrula(
  req: Request,
  userClientFactory: (authHeader: string) => any,
  admin: any,
): Promise<{ ok: true; caller: any } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Yetkisiz" };
  }
  const { data, error } = await userClientFactory(authHeader).auth.getUser();
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Geçersiz oturum" };
  }
  const { data: profil } = await admin
    .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profil?.role !== "admin") {
    return { ok: false, status: 403, error: "Bu işlem için yönetici yetkisi gerekir" };
  }
  return { ok: true, caller: data.user };
}
