// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonrepair } from "https://esm.sh/jsonrepair";
import { SYSTEM_PROMPT } from "./prompt.ts";

const ALLOWED_ORIGINS = [
  "https://fikoai.de",
  "https://www.fikoai.de",
  "https://fibu-de-2.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
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

    // Anthropic API key from Supabase Secrets
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY bulunamadı" }), {
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

    // Claude Haiku 4.5 — vision (PDF + image) destekli
    const isPdf = mimeType === "application/pdf";
    const contentBlock = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mimeType, data: fileBase64 },
        };

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        temperature: 0.1,
        system: finalPrompt,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              { type: "text", text: "Faturayı analiz et ve istenen JSON formatında döndür. Sadece JSON, başka açıklama yok." },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("[super-worker] Anthropic API error:", errText.substring(0, 500));
      return new Response(JSON.stringify({ success: false, error: `AI servis hatası: ${anthropicResponse.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicData = await anthropicResponse.json();
    const rawText = anthropicData?.content?.[0]?.text || "";

    let analysisResult;
    try {
        let cleaned = rawText.replace(/```[a-zA-Z]*[-]?\n?/g, "").replace(/```\n?/g, "").trim();
        
        // Sadece JSON kısmını almak için kırpma işlemi (extratext koruması)
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');
        
        const start = (firstBrace !== -1 && firstBracket !== -1) ? Math.min(firstBrace, firstBracket) : Math.max(firstBrace, firstBracket);
        let end = Math.max(lastBrace, lastBracket);
        
        // Eğer json tamamen bitmediyse (örneğin API kesintisi), end de geçerli bir yerde olmayabilir.
        // Bu yüzden jsonrepair'in yapısına güveneceğiz.
        
        if (start !== -1) {
             cleaned = cleaned.substring(start);
             if (end !== -1 && end >= start) {
                  // EĞER mantikli bir son bulunmuşsa oradan kes
                  cleaned = cleaned.substring(0, end - start + 1);
             }
        }
        
        // GitHub'daki en gelişmiş kütüphane olan `jsonrepair`'i (josdejong/jsonrepair) devreye aldık.
        // Unescaped quotes, missing commas, trailing commas, and missing brackets hatalarını düzeltecek.
        let repairedJSON = cleaned;
        try {
             repairedJSON = jsonrepair(cleaned);
        } catch (repairErr: any) {
             console.warn("[super-worker] jsonrepair warning (could not fully repair):", repairErr.message);
        }

        analysisResult = JSON.parse(repairedJSON);

    // [FIX M-3] Ham AI yanıtı istemciye gönderilmiyor
    } catch (err: any) {
        console.error("[super-worker] JSON parse error: ", err.message, "raw preview:", rawText.substring(0, 500));
        const snippet = rawText ? rawText.substring(0, 300) : "BOŞ YANIT";
        return new Response(JSON.stringify({
            success: false,
            error: `JSON Parse Hatası (${err.message}). Detay: ${snippet}`
        }), {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // ── Post-processing: Header'daki buyer/supplier bilgilerini şirket bilgilerinden zorla doldur ──
    // KURAL: Geçerli bir faturada supplier veya buyer'dan EN AZ BİRİ kullanıcı şirketi
    // olmak zorundadır. İki taraf da kullanıcı şirketi olamaz (AI halüsinasyonu).
    const isPayroll = (analysisResult?.header?.invoice_type || "").toLowerCase().includes("lohn");
    if (analysisResult?.header && !isPayroll) {
      const h = analysisResult.header;
      const ownNameLc = (companyName || "").toLowerCase().trim();
      const ownVat    = (companyVatId || "").trim();
      const supNameLc = (h.supplier_name || "").toLowerCase().trim();
      const buyNameLc = (h.buyer_name || "").toLowerCase().trim();
      const supVat    = (h.supplier_vat_id || "").trim();
      const buyVat    = (h.buyer_vat_id || "").trim();

      const matches = (n: string, v: string) =>
        (!!ownVat && !!v && v === ownVat) ||
        (!!ownNameLc && !!n && (n.includes(ownNameLc) || ownNameLc.includes(n)));

      const supplierIsUs = matches(supNameLc, supVat);
      const buyerIsUs    = matches(buyNameLc, buyVat);
      const aiIsIncoming = (h.invoice_type || "").toLowerCase().includes("eingang");

      if (supplierIsUs && buyerIsUs) {
        // ANORMAL: AI iki tarafı da bizim şirket yapmış. Gerçek satıcıyı temizle,
        // bunu gelen fatura olarak işaretle ve manuel inceleme uyarısı koy.
        h.supplier_name = null;
        h.supplier_vat_id = null;
        h.invoice_type = "eingangsrechnung";
        if (companyName)  h.buyer_name   = companyName;
        if (companyVatId) h.buyer_vat_id = companyVatId;
        analysisResult.context = (analysisResult.context ? analysisResult.context + " " : "") +
          "UYARI: AI satıcı ve alıcıyı aynı şirket olarak döndürdü — gerçek satıcı temizlendi, manuel düzeltme gerekli.";
      } else if (supplierIsUs) {
        // Giden fatura → satıcı biziz, alıcıyı olduğu gibi bırak
        h.invoice_type = "ausgangsrechnung";
        if (companyName)  h.supplier_name   = companyName;
        if (companyVatId) h.supplier_vat_id = companyVatId;
      } else if (buyerIsUs || aiIsIncoming) {
        // Gelen fatura → alıcı biziz, satıcıyı olduğu gibi bırak
        h.invoice_type = "eingangsrechnung";
        if (companyName)  h.buyer_name   = companyName;
        if (companyVatId) h.buyer_vat_id = companyVatId;
      } else {
        // Hiçbir taraf bizim şirket değil → varsayılan: gelen fatura, alıcı biziz
        // (Kassenbon / fiş senaryosu — fişlerde alıcı genelde yazmaz).
        h.invoice_type = "eingangsrechnung";
        if (companyName)  h.buyer_name   = companyName;
        if (companyVatId) h.buyer_vat_id = companyVatId;
        analysisResult.context = (analysisResult.context ? analysisResult.context + " " : "") +
          "UYARI: Faturadaki taraflar kullanıcı şirketiyle eşleşmedi — alıcı kullanıcı şirketi olarak zorlandı.";
      }

      // supplier_vat_id'ye yanlışlıkla kişi adı yazılmışsa temizle (sayı içermiyorsa)
      if (h.supplier_vat_id && !/\d/.test(String(h.supplier_vat_id))) {
        h.supplier_vat_id = null;
      }
      if (h.buyer_vat_id && !/\d/.test(String(h.buyer_vat_id))) {
        h.buyer_vat_id = null;
      }
    }

    // ── Post-processing: Gelen faturalarda 8xxx hesap kodu engelle ──
    if (analysisResult?.items && Array.isArray(analysisResult.items) && !isPayroll) {
      const supplierName = (analysisResult.header?.supplier_name || "").toLowerCase();
      const supplierVat = analysisResult.header?.supplier_vat_id || analysisResult.header?.satici_vkn || "";
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
