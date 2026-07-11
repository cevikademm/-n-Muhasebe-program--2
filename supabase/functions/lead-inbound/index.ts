// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// lead-inbound  (PUBLIC — deploy with --no-verify-jwt)
// ──────────────────────────────────────────────────────────────────
// Gelen müşteri yanıtlarını sınıflandırır ve pipeline'ı günceller.
// İki kullanım:
//
//  1) Otomatik webhook (Resend Inbound):
//     Header: x-inbound-secret: <INBOUND_SECRET>
//     Body:   Resend inbound payload (from/to/subject/text)
//
//  2) Manuel (uygulama içinden, JWT ile):
//     Header: Authorization: Bearer <jwt>
//     Body:   { lead_id, text, subject? }
//
//  → { success, category, lead_id }
//
// Sınıflar: ilgili | ilgisiz | fiyat_soruyor | randevu_istiyor | red | diger
// Env: INBOUND_SECRET?, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-inbound-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const secretHeader = req.headers.get("x-inbound-secret") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const payload = await req.json().catch(() => ({}));

    // ---------- 1) Webhook path ----------
    if (INBOUND_SECRET && secretHeader && secretHeader === INBOUND_SECRET) {
      const d = payload?.data || payload || {};
      const fromRaw = d.from?.address || d.from || d.sender || payload?.from || "";
      const fromEmail = String(fromRaw).match(/[^<\s]+@[^>\s]+/)?.[0]?.toLowerCase() || "";
      const subject = d.subject || payload?.subject || "";
      const text = d.text || d.body || payload?.text || "";
      if (!fromEmail) return json({ success: false, error: "Gönderen e-posta bulunamadı" }, 400);

      // Lead'i bul: önce giden mail kaydından (kesin eşleşme), sonra leads.email
      let lead: any = null;
      const { data: le } = await admin
        .from("lead_emails").select("lead_id,user_id")
        .eq("direction", "outbound").eq("to_email", fromEmail)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (le?.lead_id) {
        const { data } = await admin.from("leads").select("id,user_id").eq("id", le.lead_id).maybeSingle();
        lead = data;
      }
      if (!lead) {
        const { data } = await admin.from("leads").select("id,user_id").eq("email", fromEmail)
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        lead = data;
      }
      if (!lead) return json({ success: true, matched: false, note: "Eşleşen müşteri yok" });

      const category = classify(`${subject}\n${text}`);
      await admin.from("lead_emails").insert({
        user_id: lead.user_id, lead_id: lead.id, direction: "inbound",
        from_email: fromEmail, subject, body: text, status: "received", reply_category: category,
      });
      await admin.from("leads").update({ mail_durumu: "yanit_geldi", yanit_kategorisi: category }).eq("id", lead.id);
      return json({ success: true, matched: true, category, lead_id: lead.id });
    }

    // ---------- 2) Manual path (JWT) ----------
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
