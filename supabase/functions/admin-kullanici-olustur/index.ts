// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// admin-kullanici-olustur  (JWT zorunlu — yalnızca admin)
// ──────────────────────────────────────────────────────────────────
// Yöneticinin davet göndermeden, şifresini kendi belirleyerek hesap açması
// için. Supabase'de public signup KAPATILDIĞI için AdminCreateUserModal'ın
// eski `auth.signUp` yolu artık çalışmaz; bu fonksiyon aynı işi service-role
// `auth.admin.createUser` ile yapar ve ek olarak modülleri de yazar.
//
// Body: { email, sifre, sirket_adi, tax_number?, address?, city?, phone?,
//         company_email?, invoice_credits?, moduller: string[] }
// → { success, user_id }
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, jsonYanit, gecerliEposta, adminCagiranDogrula } from "../_shared/http.ts";
import { modulleriTemizle } from "../_shared/moduller.ts";

serve(async (req) => {
  const corsHeaders = cors(req);
  const json = jsonYanit(corsHeaders);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ success: false, error: "Sunucu yapılandırma hatası" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const yetki = await adminCagiranDogrula(
      req,
      (authHeader) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      }),
      admin,
    );
    if (!yetki.ok) return json({ success: false, error: yetki.error }, yetki.status);
    const caller = yetki.caller;

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const sifre = String(body?.sifre || "");
    const sirketAdi = String(body?.sirket_adi || "").trim();
    const moduller = modulleriTemizle(body?.moduller);
    const krediHam = parseInt(body?.invoice_credits ?? 0, 10);
    const kredi = Number.isFinite(krediHam) && krediHam >= 0 ? krediHam : 0;

    if (!gecerliEposta(email)) return json({ success: false, error: "Geçerli bir e-posta girin" }, 400);
    if (sifre.length < 8) return json({ success: false, error: "Şifre en az 8 karakter olmalı" }, 400);
    if (!sirketAdi) return json({ success: false, error: "Şirket adı gerekli" }, 400);

    const { data: mevcutId } = await admin.rpc("kullanici_id_bul", { p_email: email });
    if (mevcutId) return json({ success: false, error: "Bu e-posta ile zaten bir hesap var." }, 409);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: sifre,
      email_confirm: true,
      user_metadata: { olusturan: caller.id },
    });
    if (createErr || !created?.user) {
      return json({ success: false, error: "Hesap oluşturulamadı: " + (createErr?.message || "bilinmeyen hata") }, 500);
    }
    const uid = created.user.id;

    const { error: coErr } = await admin.from("companies").insert({
      user_id: uid,
      company_name: sirketAdi,
      tax_number: String(body?.tax_number || "").trim(),
      address: String(body?.address || "").trim(),
      city: String(body?.city || "").trim(),
      phone: String(body?.phone || "").trim(),
      email: String(body?.company_email || "").trim() || email,
      invoice_credits: kredi,
    });
    if (coErr) {
      return json({ success: false, error: "Şirket kaydı oluşturulamadı: " + coErr.message }, 500);
    }

    // Sözleşme onayı hukuki kanıttır — sessizce yutulmaz.
    const { error: agrErr } = await admin.from("user_agreements").insert([
      { user_id: uid, agreement_type: "privacy_policy" },
      { user_id: uid, agreement_type: "distance_selling" },
      { user_id: uid, agreement_type: "delivery_return" },
    ]);
    if (agrErr) {
      console.error("user_agreements insert hatasi", agrErr);
      return json({ success: false, error: "Sözleşme onayları kaydedilemedi: " + agrErr.message }, 500);
    }

    if (moduller.length) {
      const { error: mErr } = await admin.from("kullanici_modulleri").upsert(
        moduller.map((m) => ({
          user_id: uid, modul: m, durum: "aktif", bitis: null,
          kaynak: "admin", veren_user_id: caller.id,
        })),
        { onConflict: "user_id,modul" },
      );
      if (mErr) console.error("kullanici_modulleri upsert hatasi", mErr);
    }

    return json({ success: true, user_id: uid });
  } catch (e: any) {
    console.error("admin-kullanici-olustur error", e);
    return json({ success: false, error: "Sunucu hatası: " + (e?.message || String(e)) }, 500);
  }
});
