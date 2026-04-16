// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// invite-team-member
// ──────────────────────────────────────────────────────────────────
// Şirket sahibinin (caller) Ayarlar → Alt Kullanıcılar sekmesinden davet
// etmek istediği e-postaya Supabase Auth davet maili gönderir ve
// team_members tablosuna "pending" kayıt açar.
//
// Body: { email: string, redirectTo?: string }
//
// Güvenlik:
//  - Caller JWT ile doğrulanır (oturum zorunlu).
//  - Caller'ın rolü "staff" ise reddedilir (alt kullanıcı davet edemez).
//  - inviteUserByEmail + team_members INSERT **service-role** ile yapılır
//    (RLS bypass gerekli).
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

const json = (body: any, init: ResponseInit = {}, headers: Record<string,string> = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...headers },
  });

serve(async (req) => {
  const corsHeaders = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Yetkisiz" }, { status: 401 }, corsHeaders);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ success: false, error: "Sunucu yapılandırma hatası: service role key yok" }, { status: 500 }, corsHeaders);
    }

    // 1) Caller doğrulama (anon key + caller JWT)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ success: false, error: "Geçersiz oturum" }, { status: 401 }, corsHeaders);
    }
    const caller = userData.user;

    // Body
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const redirectTo = String(body?.redirectTo || "").trim() || undefined;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ success: false, error: "Geçerli bir e-posta girin" }, { status: 400 }, corsHeaders);
    }
    if (email === (caller.email || "").toLowerCase()) {
      return json({ success: false, error: "Kendinizi davet edemezsiniz" }, { status: 400 }, corsHeaders);
    }

    // 2) Admin client (service role) — RLS bypass
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2a) Caller "staff" olmamalı — alt kullanıcılar davet edemez
    const { data: callerMembership } = await admin
      .from("team_members")
      .select("id")
      .eq("member_user_id", caller.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (callerMembership) {
      return json({ success: false, error: "Alt kullanıcılar davet gönderemez" }, { status: 403 }, corsHeaders);
    }

    // 3) team_members upsert (pending)
    const { data: existing } = await admin
      .from("team_members")
      .select("id, status, member_user_id")
      .eq("owner_user_id", caller.id)
      .eq("invited_email", email)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await admin.from("team_members").insert({
        owner_user_id: caller.id,
        invited_email: email,
        role: "staff",
        status: "pending",
      });
      if (insErr) {
        return json({ success: false, error: "Davet kaydı oluşturulamadı: " + insErr.message }, { status: 500 }, corsHeaders);
      }
    } else if (existing.status === "revoked") {
      await admin.from("team_members")
        .update({ status: "pending", revoked_at: null })
        .eq("id", existing.id);
    }

    // 4) Auth davet maili. Kullanıcı zaten kayıtlıysa inviteUserByEmail
    //    "User already registered" hatası döner → bu durumda magic-link
    //    (generateLink type=magiclink) göndermeyi deneriz, böylece
    //    kullanıcı linke tıklayıp oturum açınca auto-link tetiklenir.
    let emailSent = false;
    let infoMsg = "";

    const inviteRes = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { invited_by: caller.id, invited_by_email: caller.email, role: "staff" },
    });

    if (!inviteRes.error) {
      emailSent = true;
      infoMsg = "Davet maili gönderildi.";
    } else {
      const m = (inviteRes.error.message || "").toLowerCase();
      const alreadyRegistered = m.includes("already") || m.includes("registered") || m.includes("exists");
      if (alreadyRegistered) {
        // Mevcut kullanıcı — magic link ile bildirim gönder
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });
        if (!linkErr) {
          emailSent = true;
          infoMsg = "Bu e-posta zaten kayıtlı. Giriş (magic-link) maili gönderildi; kullanıcı tıklayıp giriş yapınca ekibe otomatik bağlanacak.";
        } else {
          infoMsg = "Bu e-posta zaten kayıtlı. Kullanıcı kendi şifresiyle giriş yapınca ekibe otomatik bağlanacak.";
        }
      } else {
        return json({ success: false, error: "Davet maili gönderilemedi: " + inviteRes.error.message }, { status: 500 }, corsHeaders);
      }
    }

    return json({ success: true, emailSent, message: infoMsg }, { status: 200 }, corsHeaders);
  } catch (e: any) {
    return json({ success: false, error: "Sunucu hatası: " + (e?.message || String(e)) }, { status: 500 }, corsHeaders);
  }
});
