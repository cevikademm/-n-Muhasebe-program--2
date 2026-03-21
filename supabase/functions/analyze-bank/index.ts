// @ts-nocheck
// supabase/functions/analyze-bank/index.ts
// Banka ekstresi analizi — Gemini API anahtarı YALNIZCA bu Deno ortamında kalır.

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

const MODEL_SMART = "gemini-2.5-flash";

const BANK_PROMPT = `Sen Alman bankacılık uzmanısın. Bu banka ekstresini (Kontoauszug) analiz et.

GÖREV:
1. Tüm işlemleri (Buchungen) çıkar
2. Her işlem için: tarih, açıklama, tutar, işlem türü (gelir/gider), karşı taraf bilgilerini çıkar
3. Hesap özetini çıkar (dönem, açılış/kapanış bakiyesi vb.)

ÖNEMLI KURALLAR:
- Giderler (Lastschrift, Überweisung ausgehend, Auszahlung): negatif tutar
- Gelirler (Gutschrift, Überweisung eingehend, Einzahlung): pozitif tutar
- Tarihleri YYYY-MM-DD formatında yaz
- Tutarları ondalık sayı olarak ver (virgül değil nokta)
- description: Verwendungszweck veya açıklama metni
- counterpart: Auftraggeber veya Empfänger adı
- reference: Referenznummer, EREF, MREF, oder leer
- RESERV / Reservierung / Vormerkung / Vorausbuchung girişlerini transactions listesine EKLEME — bunlar gerçek işlem değildir

SADECE şu JSON formatını döndür (başka hiçbir şey yazma):
{
  "period": "Monat Jahr",
  "accountNumber": "IBAN veya hesap no",
  "bankName": "Banka adı",
  "openingBalance": 0.00,
  "closingBalance": 0.00,
  "totalIncome": 0.00,
  "totalExpense": 0.00,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Verwendungszweck / açıklama",
      "amount": -99.99,
      "type": "expense",
      "reference": "REF123",
      "counterpart": "Firma GmbH"
    }
  ]
}`;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // JWT doğrulama
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ success: false, error: "Yetkisiz erişim" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ success: false, error: "Geçersiz veya süresi dolmuş oturum" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // İstek gövdesi
  let body: { fileBase64: string; fileType: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Geçersiz istek formatı" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { fileBase64, fileType } = body;
  if (!fileBase64 || !fileType) {
    return new Response(
      JSON.stringify({ success: false, error: "fileBase64 ve fileType zorunludur" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
  if (!ALLOWED_TYPES.has(fileType)) {
    return new Response(
      JSON.stringify({ success: false, error: "Desteklenmeyen dosya türü" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY_2");
  if (!geminiApiKey) {
    console.error("[analyze-bank] GEMINI_API_KEY_2 secret tanımlı değil");
    return new Response(
      JSON.stringify({ success: false, error: "AI servisi yapılandırılmamış" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // [FIX H-1] API anahtarı URL yerine header'da gönderiliyor
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_SMART}:generateContent`;

  const geminiPayload = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: fileType, data: fileBase64 } },
          { text: BANK_PROMPT },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify(geminiPayload),
    });
  } catch (fetchErr) {
    console.error("[analyze-bank] Gemini bağlantı hatası:", fetchErr);
    return new Response(
      JSON.stringify({ success: false, error: "AI servisine ulaşılamıyor" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text();
    console.error("[analyze-bank] Gemini hatası:", geminiResponse.status, errText.substring(0, 300));
    return new Response(
      JSON.stringify({ success: false, error: `AI servisi hatası: ${geminiResponse.status}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const geminiData = await geminiResponse.json();
  const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: unknown;
  try {
    let clean = rawText.replace(/```json|```/g, "").trim();
    const f = clean.indexOf("{");
    const l = clean.lastIndexOf("}");
    if (f !== -1 && l > f) clean = clean.substring(f, l + 1);
    if (!clean) throw new Error("AI boş yanıt döndürdü");
    parsed = JSON.parse(clean);
  } catch (parseErr) {
    console.error("[analyze-bank] JSON parse hatası:", parseErr, "ham:", rawText.substring(0, 200));
    return new Response(
      JSON.stringify({ success: false, error: "AI yanıtı işlenemedi" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data: parsed }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
