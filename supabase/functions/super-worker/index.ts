// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Yetkisiz erişim" }), {
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

    const { fileBase64, fileType, learningRules, settingsRules, companyName, companyVatId } = await req.json();

    if (!fileBase64 || !fileType) {
      return new Response(JSON.stringify({ success: false, error: "fileBase64 ve fileType gerekli" }), {
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("[super-worker] Gemini API error:", errText);
      return new Response(JSON.stringify({ success: false, error: "AI servis hatası: " + errText }), {
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
    } catch {
        return new Response(JSON.stringify({
            success: false,
            error: "AI yanıtı JSON formatında değil",
            raw: rawText
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
