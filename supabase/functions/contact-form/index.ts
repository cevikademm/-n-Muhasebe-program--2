// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// contact-form  (PUBLIC — deploy with --no-verify-jwt)
// ──────────────────────────────────────────────────────────────────
// fikoai.de vitrin sayfasındaki iletişim formunu Resend üzerinden
// gerçek e-postaya dönüştürür. Auth GEREKMEZ (herkese açık form).
//
// Body: { name, firma?, email, topic?, message, lang?, hp? }
//   hp = honeypot (bot tuzağı). Doluysa mail gönderilmez, "success" döner.
//
// Env (Supabase Edge Secrets):
//   RESEND_API_KEY  — Resend API anahtarı (zorunlu)
//   CONTACT_TO      — alıcı adres (varsayılan info@fikoai.de)
//   CONTACT_FROM    — gönderen (varsayılan "fikoai <noreply@fikoai.de>")
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clamp = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return json({ success: false, error: "E-Mail-Dienst nicht konfiguriert." }, 500);
    }
    const TO = Deno.env.get("CONTACT_TO") || "info@fikoai.de";
    const FROM = Deno.env.get("CONTACT_FROM") || "fikoai Kontakt <noreply@fikoai.de>";

    const body = await req.json().catch(() => ({}));

    // Honeypot — bot doldurursa sessizce başarı dön (mail gönderme)
    if (clamp(body?.hp, 200)) return json({ success: true });

    const name = clamp(body?.name, 120);
    const firma = clamp(body?.firma, 160);
    const email = clamp(body?.email, 200).toLowerCase();
    const topic = clamp(body?.topic, 160);
    const message = clamp(body?.message, 5000);
    const lang = clamp(body?.lang, 5) || "de";

    if (!name || !message) {
      return json({ success: false, error: "Name und Nachricht sind erforderlich." }, 400);
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ success: false, error: "Bitte geben Sie eine gültige E-Mail-Adresse an." }, 400);
    }

    const rows: [string, string][] = [
      ["Name", name],
      ["Unternehmen", firma || "—"],
      ["E-Mail", email],
      ["Thema", topic || "—"],
      ["Sprache", lang.toUpperCase()],
    ];
    const tableRows = rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 14px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">${esc(
            k,
          )}</td><td style="padding:6px 0;color:#0f172a"><strong>${esc(v)}</strong></td></tr>`,
      )
      .join("");

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <div style="background:#0b1020;padding:22px 28px;color:#fff;font-size:18px;font-weight:700">fikoai — Neue Kontaktanfrage</div>
        <div style="padding:24px 28px">
          <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">${tableRows}</table>
          <div style="color:#64748b;font-size:13px;margin-bottom:6px">Nachricht</div>
          <div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;color:#0f172a;font-size:14px;line-height:1.55">${esc(
            message,
          )}</div>
        </div>
      </div>`;

    const text =
      `Neue Kontaktanfrage — fikoai.de\n\n` +
      rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\nNachricht:\n${message}`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: `[fikoai.de] ${topic || "Kontaktanfrage"} — ${name}`,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => "");
      console.error("Resend error", resendRes.status, detail);
      return json({ success: false, error: "E-Mail konnte nicht gesendet werden." }, 502);
    }

    return json({ success: true });
  } catch (e) {
    console.error("contact-form error", e);
    return json({ success: false, error: "Serverfehler. Bitte später erneut versuchen." }, 500);
  }
});
