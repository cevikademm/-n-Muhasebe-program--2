// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// lead-inbound  (PUBLIC — deploy with --no-verify-jwt)
// ──────────────────────────────────────────────────────────────────
// fikoai.de'ye GELEN tüm postanın giriş kapısı. Kök MX Resend'e bakar;
// Resend her maili `email.received` webhook'u ile buraya yollar.
//
// Görevleri:
//  1) Mail bir lead cevabıysa → lead_emails'e "inbound" olarak yazar,
//     sınıflandırır (ilgili / fiyat / randevu / red …) ve leads kaydını
//     `yanit_geldi` yapar → panelde YANIT sütununda görünür.
//  2) Her maili (lead cevabı olsun olmasın) LEADS_FORWARD_TO adresine
//     iletir → info@, kontakt@ gibi adreslere gelenler Gmail'e düşmeye
//     devam eder (eskiden ImprovMX'in yaptığı iş).
//
// Üç giriş yolu:
//  1) Resend webhook:  POST ?secret=<INBOUND_SECRET>  (veya x-inbound-secret)
//     Body: { type:"email.received", data:{ email_id, from, to, subject } }
//     Not: Resend webhook'u gövdeyi TAŞIMAZ; gövde Receiving API'den çekilir.
//  2) Eski/basit webhook: aynı secret + { from, subject, text }
//  3) Manuel (uygulama içinden, JWT ile): { lead_id, text, subject? }
//
// Lead eşleştirme sırası:
//  a) Alıcıdaki artı-etiket:  lead+<lead_id>@fikoai.de   (kesin eşleşme)
//  b) Gönderen adresi ↔ daha önce mail attığımız adres
//  c) Gönderen adresi ↔ leads.email
//
// Env: INBOUND_SECRET, RESEND_API_KEY, LEADS_FORWARD_TO?, CONTACT_FROM?,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-inbound-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FORWARD_TO = (Deno.env.get("LEADS_FORWARD_TO") || "").trim();
const FROM = Deno.env.get("CONTACT_FROM") || "fikoai <noreply@fikoai.de>";

function classify(text: string): string {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return "diger";
  if (/(ilgilenmiyor|istemiyoruz?|istemem|hayır teşekk|kein interesse|nicht interessiert|not interested|no,? thank|abbestellen|unsubscribe|listenizden|spam)/i.test(t)) return "red";
  if (/(randevu|görüşme|toplantı|termin|meeting|appointment|aray[ıi]n|call me|arıyalım|buluşalım|treffen|demo)/i.test(t)) return "randevu_istiyor";
  if (/(fiyat|ücret|ne kadar|kaç para|maliyet|teklif|preis|kosten|price|quote|angebot|paket)/i.test(t)) return "fiyat_soruyor";
  if (/(ilgileniyor|ilgimi çekti|olumlu|evet|tabii|memnuniyetle|bilgi (al|verir)|detay|daha fazla|interessiert|interesse|ja,? gerne|interested|mehr infos|sounds good)/i.test(t)) return "ilgili";
  if (/(otomatik yanıt|out of office|abwesenheit|auto-?reply|no-?reply)/i.test(t)) return "ilgisiz";
  return "diger";
}

// "Ad Soyad <a@b.de>" / {address} / dizi → ilk e-posta adresi (küçük harf)
const addr = (v: any): string => {
  const s = Array.isArray(v) ? v.join(" ") : typeof v === "object" && v ? (v.address || v.email || "") : String(v ?? "");
  return String(s).match(/[^<>,;\s]+@[^<>,;\s]+/)?.[0]?.toLowerCase() || "";
};
const addrList = (v: any): string[] => {
  const s = Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? x.address || x.email || "" : x)).join(",") : String(v ?? "");
  return (String(s).match(/[^<>,;\s]+@[^<>,;\s]+/g) || []).map((x) => x.toLowerCase());
};
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Gövde yoksa HTML'den kaba düz metin çıkar
const htmlToText = (h: string) =>
  String(h ?? "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n").trim();

// Alıcılardaki `lead+<uuid>@…` etiketinden lead id'sini çıkarır
const UUID = /\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;
function leadIdFromRecipients(list: string[]): string | null {
  for (const a of list) { const m = a.match(UUID); if (m) return m[1].toLowerCase(); }
  return null;
}

// Resend Receiving API'den maili tam gövdesiyle çeker (webhook gövde taşımaz)
async function fetchReceived(emailId: string) {
  if (!RESEND_API_KEY || !emailId) return null;
  const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!r.ok) { console.error("receiving fetch failed", r.status, await r.text().catch(() => "")); return null; }
  return await r.json().catch(() => null);
}

// Geleni Gmail'e ilet. Orijinal From'u koruyamayız (DMARC), bu yüzden
// noreply@fikoai.de'den gönderip Reply-To'yu gerçek gönderene ayarlıyoruz —
// Gmail'den "Yanıtla" dendiğinde doğrudan müşteriye gider.
async function forwardToInbox(o: { from: string; to: string[]; subject: string; text: string; html?: string }) {
  if (!RESEND_API_KEY || !FORWARD_TO) return;
  // Döngü koruması: kendi ilettiğimiz maili tekrar iletme
  if (!o.from || o.from === FORWARD_TO.toLowerCase() || /noreply@fikoai\.de/i.test(o.from)) return;
  const baslik = `<div style="font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#475569;background:#f8fafc;border-left:3px solid #8b5cf6;padding:8px 12px;margin-bottom:14px">
    <b>fikoai.de gelen posta</b><br>Kimden: ${esc(o.from)}<br>Kime: ${esc(o.to.join(", "))}
  </div>`;
  const govde = o.html || `<div style="white-space:pre-wrap;font:15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">${esc(o.text)}</div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [FORWARD_TO], reply_to: o.from,
        subject: `[fikoai] ${o.subject || "(konusuz)"}`,
        html: baslik + govde,
      }),
    });
    if (!r.ok) console.error("forward failed", r.status, await r.text().catch(() => ""));
  } catch (e) { console.error("forward error", e); }
}

serve(async (req) => {
  const json = (b: any, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const INBOUND_SECRET = Deno.env.get("INBOUND_SECRET") || "";
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ success: false, error: "Sunucu yapılandırma hatası." }, 500);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const url = new URL(req.url);
    const secret = req.headers.get("x-inbound-secret") || url.searchParams.get("secret") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const payload = await req.json().catch(() => ({}));

    // ---------- 1) Webhook (Resend inbound / eski basit format) ----------
    if (INBOUND_SECRET && secret && secret === INBOUND_SECRET) {
      const d = payload?.data || payload || {};

      // Resend "email.received" → gövdeyi Receiving API'den çek
      let full: any = null;
      if (payload?.type === "email.received" && d?.email_id) full = await fetchReceived(d.email_id);

      const fromEmail = addr(full?.from ?? d.from ?? d.sender ?? payload?.from);
      const toList = addrList(full?.to ?? d.to ?? payload?.to);
      const subject = String(full?.subject ?? d.subject ?? payload?.subject ?? "");
      const text = String(full?.text || d.text || d.body || payload?.text || "") ||
        htmlToText(full?.html || d.html || "");

      if (!fromEmail) return json({ success: false, error: "Gönderen e-posta bulunamadı" }, 400);

      // Gelen her posta Gmail'e iletilir (webhook'u bekletmemek için await yok)
      const fwd = forwardToInbox({ from: fromEmail, to: toList, subject, text, html: full?.html });

      // --- Lead eşleştirme ---
      let lead: any = null;
      const taggedId = leadIdFromRecipients(toList);
      if (taggedId) {
        const { data } = await admin.from("leads").select("id,user_id").eq("id", taggedId).maybeSingle();
        lead = data;
      }
      if (!lead) {
        const { data: le } = await admin
          .from("lead_emails").select("lead_id")
          .eq("direction", "outbound").eq("to_email", fromEmail)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (le?.lead_id) {
          const { data } = await admin.from("leads").select("id,user_id").eq("id", le.lead_id).maybeSingle();
          lead = data;
        }
      }
      if (!lead) {
        const { data } = await admin.from("leads").select("id,user_id").eq("email", fromEmail)
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        lead = data;
      }

      if (!lead) {
        await fwd;
        return json({ success: true, matched: false, forwarded: !!FORWARD_TO, note: "Eşleşen müşteri yok — posta Gmail'e iletildi" });
      }

      const category = classify(`${subject}\n${text}`);
      await admin.from("lead_emails").insert({
        user_id: lead.user_id, lead_id: lead.id, direction: "inbound",
        from_email: fromEmail, to_email: toList[0] || null,
        subject, body: text, status: "received", reply_category: category,
      });
      await admin.from("leads").update({ mail_durumu: "yanit_geldi", yanit_kategorisi: category }).eq("id", lead.id);
      await fwd;
      return json({ success: true, matched: true, category, lead_id: lead.id, forwarded: !!FORWARD_TO });
    }

    // ---------- 2) Manuel (JWT) ----------
    if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ success: false, error: "Geçersiz oturum" }, 401);
      const caller = userData.user;
      const { data: membership } = await admin
        .from("team_members").select("owner_user_id")
        .eq("member_user_id", caller.id).eq("status", "active").limit(1).maybeSingle();
      const ownerId = membership?.owner_user_id || caller.id;

      const leadId = String(payload?.lead_id || "");
      const text = String(payload?.text || "");
      const subject = String(payload?.subject || "");
      if (!leadId || !text.trim()) return json({ success: false, error: "lead_id ve text zorunlu" }, 400);

      const { data: lead } = await admin.from("leads").select("id,user_id,email").eq("id", leadId).maybeSingle();
      if (!lead || lead.user_id !== ownerId) return json({ success: false, error: "Müşteri bulunamadı" }, 404);

      const category = classify(`${subject}\n${text}`);
      await admin.from("lead_emails").insert({
        user_id: ownerId, lead_id: lead.id, direction: "inbound",
        from_email: lead.email, subject, body: text, status: "received", reply_category: category,
      });
      await admin.from("leads").update({ mail_durumu: "yanit_geldi", yanit_kategorisi: category }).eq("id", lead.id);
      return json({ success: true, matched: true, category, lead_id: lead.id });
    }

    return json({ success: false, error: "Yetkisiz" }, 401);
  } catch (e: any) {
    console.error("lead-inbound error", e);
    return json({ success: false, error: "Sunucu hatası: " + (e?.message || String(e)) }, 500);
  }
});
