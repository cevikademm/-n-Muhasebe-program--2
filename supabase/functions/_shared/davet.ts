// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Davet token'ı + bilgilendirme maili
// ──────────────────────────────────────────────────────────────────
// davet-olustur / davet-dogrula / davet-kullan üçü de aynı token ve mail
// kurallarını paylaşır; kurallar tek yerde dursun diye buraya alındı.

import { MODUL_TANIM, type Modul } from "./moduller.ts";

/**
 * 32 baytlık kriptografik token. Base64url — linkte kaçış gerektirmez.
 * Ham token yalnızca mailde ve oluşturma yanıtında görünür; veritabanına
 * yalnızca sha256 özeti yazılır (davetler.token_hash).
 */
export function tokenUret(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function tokenHash(token: string): Promise<string> {
  const veri = new TextEncoder().encode(token);
  const ozet = await crypto.subtle.digest("SHA-256", veri);
  return [...new Uint8Array(ozet)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Token karşılaştırması hash üzerinden ve tek sorguyla yapılır; ayrıca
 * hatalı denemelerde sabit gecikme uygulanır ki geçerli/geçersiz token
 * yanıt süresinden ayırt edilemesin.
 */
export const sabitGecikme = () => new Promise((r) => setTimeout(r, 400));

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Davet maili — kullanıcıya HANGİ ALANLARIN açıldığını açıkça söyler.
 * TR ve DE metni aynı mailde alt alta verilir; müşterinin dilini bilmiyoruz.
 */
export function davetMailiHtml(opts: {
  link: string;
  moduller: Modul[];
  tip: "yeni" | "yukseltme";
  sirketAdi?: string | null;
  gecerlilikGun: number;
}): string {
  const { link, moduller, tip, sirketAdi, gecerlilikGun } = opts;

  const modulKarti = (m: Modul) => {
    const t = MODUL_TANIM[m];
    return `
      <tr><td style="padding:0 0 10px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-left:3px solid ${t.renk};border-radius:10px">
          <tr><td style="padding:12px 14px">
            <div style="font-size:14px;font-weight:700;color:#0f172a">${esc(t.ad.tr)} &nbsp;·&nbsp; <span style="font-weight:500;color:#64748b">${esc(t.ad.de)}</span></div>
            <div style="font-size:12px;color:#64748b;line-height:1.55;margin-top:4px">${esc(t.aciklama.tr)}</div>
            <div style="font-size:12px;color:#94a3b8;line-height:1.55;margin-top:2px">${esc(t.aciklama.de)}</div>
          </td></tr>
        </table>
      </td></tr>`;
  };

  const baslik = tip === "yukseltme"
    ? "Hesabınıza yeni paket tanımlandı"
    : "FikoAI hesabınız hazır";
  const baslikDe = tip === "yukseltme"
    ? "Neues Paket für Ihr Konto freigeschaltet"
    : "Ihr FikoAI-Konto ist bereit";
  const giris = tip === "yukseltme"
    ? "Aşağıdaki alanlar hesabınıza eklendi. Onaylamak için bağlantıya tıklayın."
    : "Aşağıdaki alanlar sizin için açıldı. Hesabınızı oluşturmak için bağlantıya tıklayın.";
  const girisDe = tip === "yukseltme"
    ? "Die folgenden Bereiche wurden Ihrem Konto hinzugefügt. Bitte bestätigen Sie über den Link."
    : "Die folgenden Bereiche wurden für Sie freigeschaltet. Bitte erstellen Sie Ihr Konto über den Link.";
  const buton = tip === "yukseltme" ? "Onayla ve Aç / Bestätigen" : "Hesabımı Oluştur / Konto erstellen";

  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;padding:28px 12px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
    <tr><td style="height:4px;background:linear-gradient(90deg,#06b6d4,#8b5cf6,#ec4899)"></td></tr>
    <tr><td style="padding:26px 28px 6px">
      <div style="font-size:19px;font-weight:800;color:#0f172a">${esc(baslik)}</div>
      <div style="font-size:14px;font-weight:600;color:#64748b;margin-top:2px">${esc(baslikDe)}</div>
      ${sirketAdi ? `<div style="font-size:13px;color:#94a3b8;margin-top:8px">${esc(sirketAdi)}</div>` : ""}
    </td></tr>
    <tr><td style="padding:14px 28px 0">
      <div style="font-size:13.5px;color:#334155;line-height:1.6">${esc(giris)}</div>
      <div style="font-size:13px;color:#64748b;line-height:1.6;margin-top:4px">${esc(girisDe)}</div>
    </td></tr>
    <tr><td style="padding:18px 28px 0">
      <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px">
        Açılan alanlar / Freigeschaltete Bereiche
      </div>
      <table width="100%" cellpadding="0" cellspacing="0">${moduller.map(modulKarti).join("")}</table>
    </td></tr>
    <tr><td style="padding:8px 28px 26px" align="center">
      <a href="${esc(link)}" style="display:inline-block;padding:13px 26px;border-radius:11px;background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;font-size:14px;font-weight:700;text-decoration:none">
        ${esc(buton)}
      </a>
      <div style="font-size:11.5px;color:#94a3b8;margin-top:14px;line-height:1.6">
        Bu bağlantı ${gecerlilikGun} gün geçerlidir ve yalnızca bir kez kullanılabilir.<br>
        Dieser Link ist ${gecerlilikGun} Tage gültig und nur einmal verwendbar.
      </div>
      <div style="font-size:11px;color:#cbd5e1;margin-top:10px;word-break:break-all">${esc(link)}</div>
    </td></tr>
    <tr><td style="padding:14px 28px;border-top:1px solid #f1f5f9" align="center">
      <a href="https://fikoai.de" style="color:#0ea5e9;text-decoration:none;font-size:12px">fikoai.de</a>
    </td></tr>
  </table>
</div>`;
}

/** Resend üzerinden davet maili gönderir. Hata fırlatmaz; sonucu döndürür. */
export async function davetMailiGonder(opts: {
  apiKey: string;
  from: string;
  to: string;
  konu: string;
  html: string;
}): Promise<{ gonderildi: boolean; hata?: string }> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.konu, html: opts.html }),
    });
    if (r.ok) return { gonderildi: true };
    const detay = await r.text().catch(() => "");
    console.error("davet maili gonderilemedi", r.status, detay);
    return { gonderildi: false, hata: `HTTP ${r.status}` };
  } catch (e) {
    return { gonderildi: false, hata: e?.message || String(e) };
  }
}
