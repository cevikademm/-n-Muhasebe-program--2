// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SYSTEM_PROMPT } from "./prompt.ts";

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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // [FIX C-1] JWT doğrulaması — sadece header varlığı değil, token geçerliliği kontrol ediliyor
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Yetkisiz erişim" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Geçersiz veya süresi dolmuş oturum" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gemini API key from Supabase Secrets
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "GEMINI_API_KEY bulunamadı" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // [FIX M-6] İstek gövdesi doğrulaması — boyut ve tip kontrolü
    const bodyText = await req.text();
    if (bodyText.length > 10_000_000) { // ~10MB hard limit
      return new Response(JSON.stringify({ success: false, error: "İstek boyutu çok büyük (maks 10MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { fileBase64, fileType, learningRules, settingsRules, companyName, companyVatId } = JSON.parse(bodyText);

    if (!fileBase64 || !fileType) {
      return new Response(JSON.stringify({ success: false, error: "fileBase64 ve fileType gerekli" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dosya tipi doğrulaması
    const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"]);
    if (!ALLOWED_TYPES.has(fileType)) {
      return new Response(JSON.stringify({ success: false, error: "Desteklenmeyen dosya türü" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Öğrenme kuralları boyut sınırı (prompt injection koruması)
    if (learningRules && Array.isArray(learningRules) && learningRules.length > 200) {
      return new Response(JSON.stringify({ success: false, error: "Çok fazla öğrenme kuralı (maks 200)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (settingsRules && Array.isArray(settingsRules) && settingsRules.length > 100) {
      return new Response(JSON.stringify({ success: false, error: "Çok fazla ayar kuralı (maks 100)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mimeType = fileType.startsWith("image/") ? fileType :
                     fileType === "application/pdf" ? "application/pdf" : "image/jpeg";

    console.log(`[super-worker] Received file. Type: ${mimeType}, Base64 Length: ${fileBase64.length}`);

    if (fileBase64.length > 5_000_000) { // ~5MB
       console.warn("[super-worker] File size is very large! Might timeout or hit limits.");
    }

    let finalPrompt = SYSTEM_PROMPT;

    // 0) Şirket Bilgileri — Fatura yön tespiti ve 8xxx hesap doğrulaması için
    if (companyName || companyVatId) {
      finalPrompt += "\n\n======================================================\n";
      finalPrompt += "ŞİRKET BİLGİLERİ (Own_Company_Name / Own_VAT_ID)\n";
      if (companyName) finalPrompt += `Own_Company_Name: "${companyName}"\n`;
      if (companyVatId) finalPrompt += `Own_VAT_ID: "${companyVatId}"\n`;
      finalPrompt += "\nKRİTİK KURAL: Eğer faturayı KESEN taraf (Rechnungssteller / Von / Satıcı) ";
      finalPrompt += "yukarıdaki şirket bilgileriyle EŞLEŞMIYORSA, bu bir GELEN FATURA'dır (eingangsrechnung). ";
      finalPrompt += "GELEN FATURALARDA KESİNLİKLE Sınıf 8 (8xxx) hesap kodu KULLANILAMAZ. ";
      finalPrompt += "Sınıf 8 hesapları YALNIZCA biz satıcıyken (GİDEN FATURA) kullanılabilir.\n";
      finalPrompt += "======================================================\n";
    }

    // 1) Yeni Nesil Öğrenme Kuralları (Ayarlar Sekmesinden Gelen)
    if (settingsRules && Array.isArray(settingsRules) && settingsRules.length > 0) {
      finalPrompt += "\n\n======================================================\n";
      finalPrompt += "ÖNEMLİ: KULLANICI ÖZEL MANUEL KURALLAR (EN YÜKSEK ÖNCELİK - %100 UYULACAK)\n";
      finalPrompt += "Aşağıdaki kurallar kullanıcının Ayarlar sekmesinde tanımladığı kesin manuel kurallardır. Faturadaki tedarikçi adı VEYA içeriğindeki herhangi bir açıklama aşağıdaki anahtar kelimelerden biriyle eşleşirse KESİNLİKLE kendi SKR03 tahmin algoritmalarını devre dışı bırakıp BURADAKİ HESAP KODUNU kullanacaksın.\n\n";
      
      settingsRules.forEach((rule: any, i: number) => {
        const supp = rule.supplier_keyword ? `Tedarikçi: "${rule.supplier_keyword}"` : "";
        const desc = Array.isArray(rule.description_keywords) && rule.description_keywords.length > 0 
                     ? `İçerik Anahtar Kelimeleri: [${rule.description_keywords.join(", ")}]` : "";
        
        finalPrompt += `${i + 1}. EĞER ${supp} YADA ${desc} eşleşiyorsa --> ZORUNLU HESAP: ${rule.account_code} (Hesap Adı: ${rule.account_name})\n`;
        finalPrompt += `   -> match_justification kısmına 'Manuel Kural Uygulandı' yaz.\n`;
      });
      finalPrompt += "======================================================\n";
    }

    // 2) Eski Nesil Öğrenme Kuralları (Geriye Uyumluluk)
    if (learningRules && Array.isArray(learningRules) && learningRules.length > 0) {
      finalPrompt += "\n\n======================================================\n";
      finalPrompt += "ÖNEMLİ: GEÇMİŞ FATURA ÖĞRENME KURALLARI (2. ÖNCELİK)\n";
      finalPrompt += "Aşağıdaki kurallar kullanıcının geçmişte yaptığı manuel düzeltmelerdir. Eğer faturada bu tedarikçiyi ve (varsa) kalem açıklamasını görürsen, kendi tahminini YASAKLA ve KESİNLİKLE kullanıcının belirttiği hesap kodunu kullan. match_justification kısmına 'Öğrenilmiş kural uygulandı' yaz.\n\n";
      learningRules.forEach((rule: any, i: number) => {
        finalPrompt += `${i + 1}. Tedarikçi: "${rule.supplierName}", Kalem: "${rule.itemDescription || 'Farketmez'}" --> ZORUNLU HESAP: ${rule.accountCode}\n`;
      });
      finalPrompt += "======================================================\n";
    }

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
            { text: finalPrompt },
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

    // [FIX M-2] AI hata detayları istemciye sızdırılmıyor
    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("[super-worker] Gemini API error:", errText.substring(0, 300));
      return new Response(JSON.stringify({ success: false, error: `AI servis hatası: ${geminiResponse.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let analysisResult;
    try {
        const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        analysisResult = JSON.parse(cleaned);
    // [FIX M-3] Ham AI yanıtı istemciye gönderilmiyor
    } catch {
        console.error("[super-worker] JSON parse error, raw preview:", rawText.substring(0, 200));
        return new Response(JSON.stringify({
            success: false,
            error: "AI yanıtı JSON formatında değil"
        }), {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // ── Post-processing: Gelen faturalarda 8xxx hesap kodu engelle ──
    if (analysisResult?.items && Array.isArray(analysisResult.items)) {
      const supplierName = (analysisResult.header?.supplier_name || "").toLowerCase();
      const supplierVat = analysisResult.header?.satici_vkn || "";
      const ownName = (companyName || "").toLowerCase();
      const ownVat = companyVatId || "";

      const isOwnCompanySeller =
        (ownVat && supplierVat && supplierVat === ownVat) ||
        (ownName && supplierName && supplierName.includes(ownName));

      if (!isOwnCompanySeller) {
        for (const item of analysisResult.items) {
          if (item.account_code && String(item.account_code).startsWith("8")) {
            console.warn(`[super-worker] 8xxx blocked: ${item.account_code} → 4960`);
            item.account_code = "4960";
            item.account_name = "Verschiedene betriebliche Aufwendungen";
            item.account_name_tr = "Çeşitli İşletme Giderleri";
            item.match_justification = "Gelen fatura: 8xxx gelir hesabı engellendi, manuel inceleme gerekli";
            item.match_score = 50;
          }
        }
      }
    }

    // Doğrudan veriyi frontend'e döndür (DB işlevleri iptal edildi)
    return new Response(JSON.stringify({
      success: true,
      data: analysisResult
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[super-worker] Catch error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message || "Bilinmeyen hata" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
