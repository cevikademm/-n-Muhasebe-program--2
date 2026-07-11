// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// send-lead-emails  (JWT required)
// ──────────────────────────────────────────────────────────────────
// Seçilen müşterilere (leads) Resend ile toplu kişiselleştirilmiş
// e-posta gönderir. `{{isim}}` ve `{{sehir}}` placeholder'ları desteklenir.
//
// POST { lead_ids: string[], subject: string, body: string,
//        reply_to?: string }
//   → { success, sent, failed, skipped, results:[{lead_id,status,error?}] }
//
// Env: RESEND_API_KEY, LEADS_REPLY_TO?, CONTACT_FROM?,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://fikoai.de",
  "https://www.fikoai.de",
  "https://fibu-de-2.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
];
function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fill = (tpl: string, lead: any) =>
  String(tpl ?? "")
    .replaceAll("{{isim}}", lead.isim || "")
    .replaceAll("{{sehir}}", lead.sehir || "")
    .replaceAll("{{kategori}}", lead.kategori || "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  const corsHeaders = cors(req);
  const json = (b: any, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...corsHeaders } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const FROM = Deno.env.get("CONTACT_FROM") || "fikoai <noreply@fikoai.de>";
    if (!RESEND_API_KEY) return json({ success: false, error: "E-posta servisi yapılandırılmamış." }, 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ success: false, error: "Sunucu yapılandırma hatası." }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Yetkisiz" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, error: "Geçersiz oturum" }, 401);
    const caller = userData.user;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: membership } = await admin
      .from("team_members").select("owner_user_id")
      .eq("member_user_id", caller.id).eq("status", "active").limit(1).maybeSingle();
    const ownerId = membership?.owner_user_id || caller.id;

    const body = await req.json().catch(() => ({}));
    const leadIds: string[] = Array.isArray(body?.lead_ids) ? body.lead_ids.slice(0, 100) : [];
    const subject = String(body?.subject || "").trim();
    const bodyTpl = String(body?.body || "").trim();
    const reply_to = String(body?.reply_to || Deno.env.get("LEADS_REPLY_TO") || caller.email || "").trim();

    // Ekler (tanıtım PDF'i): yalnızca https + fikoai.de altındaki dosyalara izin
    // ver (SSRF/kötüye kullanım koruması). Resend "path" ile uzak dosyayı çeker.
    const rawAtt = Array.isArray(body?.attachments) ? body.attachments : [];
    const attachments = rawAtt
      .filter((a: any) => a && typeof a.path === "string" && typeof a.filename === "string")
      .filter((a: any) => { try { const u = new URL(a.path); return u.protocol === "https:" && /(^|\.)fikoai\.de$/.test(u.hostname); } catch { return false; } })
      .slice(0, 5)
      .map((a: any) => ({ filename: String(a.filename).slice(0, 120), path: a.path }));

    if (!leadIds.length) return json({ success: false, error: "En az bir müşteri seçin." }, 400);
    if (!subject || !bodyTpl) return json({ success: false, error: "Konu ve mesaj zorunludur." }, 400);

    // Sadece owner'a ait, e-postası olan lead'ler
    const { data: leads } = await admin
      .from("leads").select("id,isim,email,sehir,kategori,user_id")
      .in("id", leadIds).eq("user_id", ownerId);

    let sent = 0, failed = 0, skipped = 0;
    const results: any[] = [];

    for (const lead of leads || []) {
      if (!lead.email) { skipped++; results.push({ lead_id: lead.id, status: "skipped", error: "e-posta yok" }); continue; }
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${esc(fill(bodyTpl, lead))}</div>`;
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM,
            to: [lead.email],
            reply_to,
            subject: fill(subject, lead),
            html,
            ...(attachments.length ? { attachments } : {}),
          }),
        });
        if (r.ok) {
          const rd = await r.json().catch(() => ({}));
          sent++;
          await admin.from("lead_emails").insert({
            user_id: ownerId, lead_id: lead.id, direction: "outbound",
            to_email: lead.email, from_email: FROM, subject: fill(subject, lead),
            body: fill(bodyTpl, lead), resend_id: rd?.id || null, status: "sent",
          });
          await admin.from("leads").update({ mail_durumu: "gonderildi" }).eq("id", lead.id);
          results.push({ lead_id: lead.id, status: "sent" });
        } else {
          failed++;
          const detail = await r.text().catch(() => "");
          console.error("Resend fail", r.status, detail);
          await admin.from("leads").update({ mail_durumu: "hata" }).eq("id", lead.id);
          results.push({ lead_id: lead.id, status: "failed", error: `HTTP ${r.status}` });
        }
      } catch (e: any) {
        failed++;
        results.push({ lead_id: lead.id, status: "failed", error: e?.message || String(e) });
      }
      await sleep(350); // Resend rate-limit dostu
    }

    return json({ success: true, sent, failed, skipped, results });
  } catch (e: any) {
    console.error("send-lead-emails error", e);
    return json({ success: false, error: "Sunucu hatası: " + (e?.message || String(e)) }, 500);
  }
});
