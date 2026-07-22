// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// davet-kullan  (JWT YOK — anon çağrılabilir)
// ──────────────────────────────────────────────────────────────────
// Davet token'ını harcar:
//   tip='yeni'      → auth kullanıcısı + companies + user_agreements + modüller
//   tip='yukseltme' → mevcut kullanıcının modüllerine ekleme
//
// Deploy: supabase functions deploy davet-kullan --no-verify-jwt
//
// Body (yeni/şifre):  { token, sifre, sirket_adi, ..., sozlesmeler: true }
// Body (yeni/google): { token, mod:"google", sirket_adi, ..., sozlesmeler: true }
//                     + Authorization: Bearer <kullanıcının access token'ı>
//                     Google ile gelen kullanıcı OAuth sırasında ZATEN
//                     oluşturulmuştur; burada yalnızca şirket/sözleşme/modül
//                     kaydı o kullanıcıya bağlanır.
// Body (yukseltme): { token }
// → { success, email?, moduller? }
//
// Kritik: hesap oluşturma ve yetki yazma tek yerde, service-role ile yapılır.
// İstemci hiçbir aşamada kendi yetkisini yazamaz.
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, jsonYanit } from "../_shared/http.ts";
import { tokenHash, sabitGecikme } from "../_shared/davet.ts";

serve(async (req) => {
  const corsHeaders = cors(req);
  const json = jsonYanit(corsHeaders);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ success: false, error: "Sunucu yapılandırma hatası" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    if (!token || token.length > 200) {
      await sabitGecikme();
      return json({ success: false, error: "Geçersiz veya süresi dolmuş davet bağlantısı." }, 400);
    }

    const hash = await tokenHash(token);
    const { data: davet } = await admin
      .from("davetler")
      .select("id, email, moduller, tip, hedef_user_id, sirket_adi, gecerlilik, kullanildi_at, iptal_at")
      .eq("token_hash", hash)
      .maybeSingle();

    if (!davet || davet.iptal_at || davet.kullanildi_at
        || new Date(davet.gecerlilik).getTime() < Date.now()) {
      await sabitGecikme();
      return json({
        success: false,
        error: davet?.kullanildi_at
          ? "Bu davet daha önce kullanılmış. Lütfen giriş yapın."
          : "Geçersiz veya süresi dolmuş davet bağlantısı.",
      }, 400);
    }

    const simdi = new Date().toISOString();

    // ── Yükseltme: mevcut hesaba modül ekle ──────────────────────
    if (davet.tip === "yukseltme") {
      const hedef = davet.hedef_user_id;
      if (!hedef) return json({ success: false, error: "Davet hedefi bulunamadı." }, 400);

      await modulleriYaz(admin, hedef, davet.moduller, "davet");
      await admin.from("davetler")
        .update({ kullanildi_at: simdi, kullanan_user_id: hedef })
        .eq("id", davet.id);

      // Bu modüller için bekleyen talep varsa kapatılır — kullanıcı Ayarlar'da
      // "bekliyor" rozetiyle baş başa kalmasın.
      await admin.from("modul_talepleri")
        .update({ durum: "onaylandi", karar_at: simdi, karar_notu: "davet ile açıldı" })
        .eq("user_id", hedef).eq("durum", "bekliyor").in("modul", davet.moduller);

      return json({ success: true, email: davet.email, moduller: davet.moduller, tip: "yukseltme" });
    }

    // ── Yeni hesap ───────────────────────────────────────────────
    const mod = String(body?.mod || "sifre");
    const sirketAdi = String(body?.sirket_adi || davet.sirket_adi || "").trim();

    if (!sirketAdi) {
      return json({ success: false, error: "Şirket adı gerekli" }, 400);
    }
    if (body?.sozlesmeler !== true) {
      return json({ success: false, error: "Devam etmek için tüm sözleşmeleri onaylamanız gerekir" }, 400);
    }

    let uid: string;

    if (mod === "google") {
      // Kullanıcı Google OAuth ile zaten oluşturuldu; kimliğini kendi
      // access token'ından çözüyoruz (client'ın gönderdiği id'ye GÜVENİLMEZ).
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: oturum } = await admin.auth.getUser(jwt);
      const kullanici = oturum?.user;
      if (!kullanici?.id) {
        return json({ success: false, error: "Google oturumu doğrulanamadı. Tekrar deneyin." }, 401);
      }

      // KRİTİK: davet belirli bir e-postaya üretildi. Link başkasının eline
      // geçerse kendi Google hesabıyla bu müşteri kaydını üstlenememeli.
      const davetEposta = String(davet.email || "").trim().toLowerCase();
      const googleEposta = String(kullanici.email || "").trim().toLowerCase();
      if (!googleEposta || googleEposta !== davetEposta) {
        await sabitGecikme();
        return json({
          success: false,
          error: `Bu davet ${davet.email} adresine üretildi. Lütfen o Google hesabıyla giriş yapın.`,
        }, 403);
      }

      uid = kullanici.id;
    } else {
      const sifre = String(body?.sifre || "");
      // NIST SP 800-63B — kayıt formundaki kuralla aynı (min 8 karakter).
      if (sifre.length < 8) {
        return json({ success: false, error: "Şifre en az 8 karakter olmalı" }, 400);
      }

      // Davet gönderildikten sonra hesap açılmış olabilir — yarış durumu.
      const { data: mevcutId } = await admin.rpc("kullanici_id_bul", { p_email: davet.email });
      if (mevcutId) {
        return json({
          success: false,
          error: "Bu e-posta ile zaten bir hesap var. Lütfen giriş yapın.",
        }, 409);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: davet.email,
        password: sifre,
        email_confirm: true,   // davet linki zaten adres sahipliğini kanıtlıyor
        user_metadata: { davet_id: davet.id },
      });
      if (createErr || !created?.user) {
        return json({ success: false, error: "Hesap oluşturulamadı: " + (createErr?.message || "bilinmeyen hata") }, 500);
      }
      uid = created.user.id;
    }

    // Bu noktadan sonra bir adım hata verirse hesap açık kalır ama eksik
    // kurulmuş olur; davet harcanmadığı için admin tekrar deneyebilsin diye
    // kullanildi_at EN SONA yazılır.
    const { error: coErr } = await admin.from("companies").insert({
      user_id: uid,
      company_name: sirketAdi,
      tax_number: String(body?.tax_number || "").trim(),
      address: String(body?.address || "").trim(),
      city: String(body?.city || "").trim(),
      phone: String(body?.phone || "").trim(),
      email: String(body?.company_email || "").trim() || davet.email,
    });
    if (coErr) {
      console.error("companies insert hatasi", coErr);
      return json({ success: false, error: "Şirket kaydı oluşturulamadı: " + coErr.message }, 500);
    }

    // Sözleşme onayı hukuki kanıttır — sessizce yutulmaz. Hata olursa
    // hesap açık kalır ama log'a düşer ve davet harcanmaz (aşağıda return).
    const { error: agrErr } = await admin.from("user_agreements").insert([
      { user_id: uid, agreement_type: "privacy_policy" },
      { user_id: uid, agreement_type: "distance_selling" },
      { user_id: uid, agreement_type: "delivery_return" },
    ]);
    if (agrErr) {
      console.error("user_agreements insert hatasi", agrErr);
      return json({ success: false, error: "Sözleşme onayları kaydedilemedi: " + agrErr.message }, 500);
    }

    await modulleriYaz(admin, uid, davet.moduller, "davet");

    await admin.from("davetler")
      .update({ kullanildi_at: simdi, kullanan_user_id: uid })
      .eq("id", davet.id);

    return json({ success: true, email: davet.email, moduller: davet.moduller, tip: "yeni" });
  } catch (e: any) {
    console.error("davet-kullan error", e);
    return json({ success: false, error: "Sunucu hatası: " + (e?.message || String(e)) }, 500);
  }
});

/**
 * Modülleri açar. Daha önce 'pasif' yapılmış bir modül yeniden açılabilsin
 * diye upsert edilir ve durum/bitiş sıfırlanır.
 */
async function modulleriYaz(admin: any, userId: string, moduller: string[], kaynak: string) {
  if (!moduller?.length) return;
  const satirlar = moduller.map((m) => ({
    user_id: userId,
    modul: m,
    durum: "aktif",
    bitis: null,
    kaynak,
    baslangic: new Date().toISOString(),
  }));
  const { error } = await admin
    .from("kullanici_modulleri")
    .upsert(satirlar, { onConflict: "user_id,modul" });
  if (error) console.error("kullanici_modulleri upsert hatasi", error);
}
