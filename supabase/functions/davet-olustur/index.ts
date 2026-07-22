// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// davet-olustur  (JWT zorunlu — yalnızca admin)
// ──────────────────────────────────────────────────────────────────
// Tek kullanımlık davet linki üretir, davetler tablosuna token'ın SHA-256
// özetini yazar ve Resend ile bilgilendirme maili gönderir. Mail, açılan
// modülleri isim + açıklamalarıyla listeler.
//
// Body: {
//   email: string,
//   moduller: ('muhasebe'|'musteri_bulma'|'sosyal_medya')[],
//   tip?: 'yeni' | 'yukseltme',      // varsayılan: yeni
//   hedef_user_id?: string,          // tip='yukseltme' için zorunlu
//   sirket_adi?: string,
//   gun?: number                     // geçerlilik, varsayılan 7
// }
// → { success, link, davet_id, mail_gonderildi }
//
// Env: RESEND_API_KEY, CONTACT_FROM?, SITE_URL?,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, jsonYanit, SITE_URL, gecerliEposta, adminCagiranDogrula } from "../_shared/http.ts";
import { modulleriTemizle } from "../_shared/moduller.ts";
import { tokenUret, tokenHash, davetMailiHtml, davetMailiGonder } from "../_shared/davet.ts";

serve(async (req) => {
  const corsHeaders = cors(req);
  const json = jsonYanit(corsHeaders);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const FROM = Deno.env.get("CONTACT_FROM") || "fikoai <noreply@fikoai.de>";

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ success: false, error: "Sunucu yapılandırma hatası: service role key yok" }, 500);
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

    // ── Girdi ────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const moduller = modulleriTemizle(body?.moduller);
    const tip = body?.tip === "yukseltme" ? "yukseltme" : "yeni";
    const hedefUserId = String(body?.hedef_user_id || "").trim() || null;
    const sirketAdi = String(body?.sirket_adi || "").trim() || null;
    const gun = Math.min(90, Math.max(1, parseInt(body?.gun ?? 7, 10) || 7));

    if (!gecerliEposta(email)) return json({ success: false, error: "Geçerli bir e-posta girin" }, 400);
    if (!moduller.length) return json({ success: false, error: "En az bir modül seçin" }, 400);
    if (tip === "yukseltme" && !hedefUserId) {
      return json({ success: false, error: "Yükseltme daveti için hedef kullanıcı gerekir" }, 400);
    }

    // Yeni hesap daveti gönderilen adres zaten kayıtlıysa, davet-kullan
    // aşamasında "kullanıcı zaten var" hatasına düşerdi. Burada erken yakalanır
    // ki admin doğru akışa (yükseltme daveti) yönlensin.
    if (tip === "yeni") {
      const { data: mevcutId } = await admin.rpc("kullanici_id_bul", { p_email: email });
      if (mevcutId) {
        return json({
          success: false,
          error: "Bu e-posta zaten kayıtlı. Mevcut kullanıcıya paket eklemek için 'Yükseltme daveti' kullanın.",
          mevcut_user_id: mevcutId,
        }, 409);
      }
    }

    // Aynı adrese açık bir davet duruyorsa yenisini üretmeden önce eskisi
    // iptal edilir — iki geçerli link dolaşımda kalmasın.
    await admin
      .from("davetler")
      .update({ iptal_at: new Date().toISOString() })
      .eq("email", email)
      .is("kullanildi_at", null)
      .is("iptal_at", null);

    // ── Token + kayıt ────────────────────────────────────────────
    const token = tokenUret();
    const hash = await tokenHash(token);
    const gecerlilik = new Date(Date.now() + gun * 86400_000).toISOString();

    const { data: davet, error: insErr } = await admin
      .from("davetler")
      .insert({
        token_hash: hash,
        email,
        moduller,
        tip,
        hedef_user_id: hedefUserId,
        sirket_adi: sirketAdi,
        gecerlilik,
        olusturan_user_id: caller.id,
      })
      .select("id")
      .single();

    if (insErr) {
      return json({ success: false, error: "Davet kaydı oluşturulamadı: " + insErr.message }, 500);
    }

    const link = `${SITE_URL}/app?davet=${token}`;

    // ── Mail ─────────────────────────────────────────────────────
    let mailGonderildi = false;
    let mailHatasi: string | undefined;
    if (RESEND_API_KEY) {
      const sonuc = await davetMailiGonder({
        apiKey: RESEND_API_KEY,
        from: FROM,
        to: email,
        konu: tip === "yukseltme"
          ? "FikoAI — hesabınıza yeni paket tanımlandı"
          : "FikoAI — hesabınız hazır",
        html: davetMailiHtml({ link, moduller, tip, sirketAdi, gecerlilikGun: gun }),
      });
      mailGonderildi = sonuc.gonderildi;
      mailHatasi = sonuc.hata;
    } else {
      mailHatasi = "RESEND_API_KEY tanımlı değil";
    }

    // Mail gitmese bile davet geçerlidir; admin linki elle iletebilsin diye
    // link her durumda döndürülür.
    return json({
      success: true,
      davet_id: davet.id,
      link,
      mail_gonderildi: mailGonderildi,
      mail_hatasi: mailHatasi,
    });
  } catch (e: any) {
    console.error("davet-olustur error", e);
    return json({ success: false, error: "Sunucu hatası: " + (e?.message || String(e)) }, 500);
  }
});
