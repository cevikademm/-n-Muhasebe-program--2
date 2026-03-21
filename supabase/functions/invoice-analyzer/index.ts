// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// [FIX H-2] CORS origin kısıtlaması
const ALLOWED_ORIGINS = [
  "https://fikoai.de",
  "https://www.fikoai.de",
  "https://fibu-de-2.vercel.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// [FIX M-5] Kullanılmayan SUPABASE_SERVICE_ROLE_KEY kaldırıldı
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

import { SYSTEM_PROMPT } from "./prompt.ts";
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Yetkilendirme gerekli: Authorization header bulunamadı" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Güvenli Supabase Client Oluşturma
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: `Geçersiz oturum: ${authError?.message || "Kullanıcı bulunamadı"}` }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "GEMINI_API_KEY yapılandırılmamış" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileBase64, fileType } = await req.json();

    if (!fileBase64 || !fileType) {
      return new Response(JSON.stringify({ success: false, error: "fileBase64 ve fileType gerekli" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gemini Vision API çağrısı
    const mimeType = fileType.startsWith("image/") ? fileType :
                     fileType === "application/pdf" ? "application/pdf" : "image/jpeg";

    // [FIX H-1] API anahtarı URL yerine header'da gönderiliyor
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: fileBase64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("[invoice-analyzer] Gemini API error:", errText);
      return new Response(JSON.stringify({ success: false, error: "AI analiz hatası" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // JSON parse
    let analysisResult;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysisResult = JSON.parse(cleaned);
    // [FIX M-3] Ham AI yanıtı istemciye gönderilmiyor
    } catch {
      console.error("[invoice-analyzer] JSON parse error, raw preview:", rawText.substring(0, 200));
      return new Response(JSON.stringify({
        success: false,
        error: "AI yanıtı geçerli JSON değil",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Veritabanına kaydet
    const h = analysisResult.header || {};
    const fb = {
      fatura_no: h.invoice_number || null,
      tarih: h.invoice_date || null,
      satici_adi: h.supplier_name || null,
      satici_vkn: h.supplier_vat_id || null,
      alici_vkn: h.buyer_vat_id || null,
      alici_adi: h.buyer_name || null,
    };
    const fo = {
      ara_toplam: h.total_net || 0,
      toplam_kdv: h.total_vat || 0,
      genel_toplam: h.total_gross || 0,
    };
    
    // Map items strictly for DB
    const rawItems = analysisResult.items || [];
    const kalemler = rawItems.map((k: any) => ({
      urun_adi: k.description || "",
      miktar: k.quantity || 1,
      kdv_orani: k.vat_rate || 0,
      satir_toplami: k.gross_amount || k.net_amount || 0,
    }));
    const uyarilar = analysisResult.context ? [analysisResult.context] : [];

    // Attach mapped versions so frontend works without ANY changes!
    const mappedResult = {
      ...analysisResult,
      fatura_bilgileri: fb,
      finansal_ozet: fo,
      kalemler: kalemler,
      uyarilar: uyarilar
    };

    const { data: invoice, error: insertError } = await supabase
      .from("invoices")
      .insert({
        user_id: user.id,
        fatura_no: fb.fatura_no || null,
        tarih: fb.tarih || null,
        satici_vkn: fb.satici_vkn || null,
        alici_vkn: fb.alici_vkn || null,
        ara_toplam: fo.ara_toplam || 0,
        toplam_kdv: fo.toplam_kdv || 0,
        genel_toplam: fo.genel_toplam || 0,
        status: "analyzed",
        raw_ai_response: mappedResult,
        uyarilar: uyarilar,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[invoice-analyzer] Insert error:", insertError);
      return new Response(JSON.stringify({ success: false, error: "Veritabanı kayıt hatası" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Kalemleri kaydet
    if (kalemler.length > 0 && invoice) {
      const items = kalemler.map((k: any) => ({
        invoice_id: invoice.id,
        urun_adi: k.urun_adi || "",
        miktar: k.miktar || 1,
        kdv_orani: k.kdv_orani || 0,
        satir_toplami: k.satir_toplami || 0,
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(items);

      if (itemsError) {
        console.error("[invoice-analyzer] Items insert error:", itemsError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: mappedResult,
      invoice_id: invoice.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[invoice-analyzer] Unexpected error:", err);
    return new Response(JSON.stringify({ success: false, error: "Beklenmeyen hata" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
