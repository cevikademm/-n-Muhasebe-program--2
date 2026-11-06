// fikoai.de — oyun indirme koruması (Vercel Routing Middleware)
// /dl/* dosyaları yalnızca game-download edge function'ının verdiği kısa ömürlü biletle (?t=…) açılır.
// Bilet Supabase'de doğrulanır (redeem_download_token: süre + kullanım sayısı). Eski /downloads/* kapalı.
export const config = { matcher: ['/dl/:path*', '/downloads/:path*'] };

const SB_URL = 'https://edlbvezskqbxasqkszvd.supabase.co';
const SB_KEY = 'sb_publishable_n_54_REfovQ_V9OLiDjcCA_tPoxYOeY'; // herkese açık anahtar; yetki RPC içinde

function deny(status, msg) {
  const html = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>İndirme</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#0b0b12;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}' +
    'div{max-width:460px;padding:28px;text-align:center}a{color:#f59e0b}</style></head><body><div><h1>İndirme bağlantısı geçersiz</h1>' +
    '<p>' + msg + '</p><p><a href="https://fikoai.de/#spiele">fikoai.de → Oyunlar</a> sayfasından indirme kodunla tekrar dene.</p></div></body></html>';
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'content-disposition': 'inline' } });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/downloads/')) return deny(410, 'Doğrudan indirme kapatıldı. Oyunlar artık indirme koduyla iniyor.');
  const t = url.searchParams.get('t') || '';
  if (!/^[A-Za-z0-9_-]{32,96}$/.test(t)) return deny(403, 'Bağlantıda indirme bileti yok.');
  try {
    const r = await fetch(SB_URL + '/rest/v1/rpc/redeem_download_token', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: t, p_file: url.pathname }),
    });
    const ok = r.ok && (await r.json()) === true;
    if (!ok) return deny(403, 'Biletin süresi dolmuş ya da kullanım hakkı bitmiş (15 dk).');
  } catch (e) {
    return deny(503, 'Bilet şu an doğrulanamadı, biraz sonra tekrar dene.');
  }
  // Devam: statik dosya sunulur
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
