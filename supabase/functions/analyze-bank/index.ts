// @ts-nocheck
// supabase/functions/analyze-bank/index.ts
// Banka ekstresi analizi — Gemini API anahtarı YALNIZCA bu Deno ortamında kalır.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// [FIX H-2] CORS origin kısıtlaması
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

const MODEL_SMART = "gemini-2.5-flash";

const BANK_PROMPT = `# Banka Ekstresi (Kontoauszug) Analiz Motoru v2.0

Sen Alman bankacılık sistemine hakim bir **Banka Ekstresi Analiz Motoru**sun.
Her türlü Alman bankasından gelen ekstreyi (TARGOBANK, Sparkasse, Commerzbank, Deutsche Bank, ING, DKB, Volksbank vb.) okuyabilir ve analiz edebilirsin.

---

## 1. GÖREV

1. Ekstrenin kapsadığı dönemi, hesap numarasını ve banka adını tespit et
2. Açılış bakiyesi (Anfangssaldo) ve kapanış bakiyesi (Endsaldo/Schlusssaldo) çıkar
3. **Her işlemi (Buchung) tek tek çıkar — hiçbir satırı atlama**
4. Her işleme doğru kategori ata
5. Toplam gelir ve toplam gideri hesapla
6. Sonucu JSON formatında döndür

---

## 2. İŞLEM TÜR TESPİTİ

### Gelir (income) — pozitif tutar:
- GUTSCHRIFT, ECHTZEITGUTSCHRIFT (Havale gelen)
- Überweisung eingehend, Einzahlung
- Gehalt, Lohn (Maaş)
- Mieteinnahme (Kira geliri)
- Rückerstattung, Erstattung (İade)

### Gider (expense) — negatif tutar:
- LASTSCHRIFT, SEPALASTSCHRIFT (Otomatik ödeme)
- ECHTZEITÜBERWEISUNG, Überweisung ausgehend (Havale giden)
- KARTENZAHLUNG, NFCKARTENZAHLUNG, KARTENZAHLUNGMITPIN, KARTENEINSATZ (Kart ödemesi)
- DAUERAUFTRAG (Düzenli ödeme)
- GEBÜHR, GRUNDGEBÜHR, KONTOFÜHRUNG (Banka ücreti)
- AUSLANDSEINSATZ (Yurtdışı işlem ücreti)
- Auszahlung, Bargeldabhebung (Nakit çekim)
- ABSCHLUSS (Dönem kapanışı — ücret ise gider)

### Bilgi (info) — tutar = 0:
- ANFANGSSALDO (Açılış bakiyesi satırı)

---

## 3. KATEGORİZASYON KURALLARI

İşlem açıklamasındaki (Buchungstext / Verwendungszweck) anahtar kelimelere göre kategori belirle:

| Anahtar Kelime(ler) | Kategori | Kategori (TR) |
|---|---|---|
| ECHTZEITGUTSCHRIFT, GUTSCHRIFT | Gutschrift | Havale (Gelen) |
| ECHTZEITÜBERWEISUNG, ÜBERWEISUNG | Überweisung | Havale (Giden) |
| SEPALASTSCHRIFT, LASTSCHRIFT | Lastschrift | Otomatik Ödeme |
| NFCKARTENZAHLUNG | NFC-Kartenzahlung | Kart Ödemesi (NFC) |
| KARTENZAHLUNGMITPIN | PIN-Kartenzahlung | Kart Ödemesi (PIN) |
| KARTENEINSATZ | Online-Kartenzahlung | Online Kart Ödemesi |
| DAUERAUFTRAG | Dauerauftrag | Düzenli Ödeme |
| GEBÜHR, GRUNDGEBÜHR, KONTOFÜHRUNG | Bankgebühr | Banka Ücreti |
| AUSLANDSEINSATZ | Auslandsgebühr | Yurtdışı İşlem Ücreti |
| ABSCHLUSS | Abschluss | Dönem Kapanışı |
| BARGELD, AUSZAHLUNG, GELDAUTOMAT, ATM | Bargeld | Nakit İşlem |
| GEHALT, LOHN | Gehalt | Maaş |
| MIETE | Miete | Kira |
| VERSICHERUNG, KASKO, HAFTPFLICHT | Versicherung | Sigorta |
| STROM, GAS, WASSER, STADTWERKE, ENERGIE | Nebenkosten | Enerji/Yan Giderler |
| TELEKOM, VODAFONE, O2, TELEFON, MOBILFUNK | Telekommunikation | İletişim |
| *(Eşleşme yoksa)* | Sonstige | Diğer |

---

## 4. RESERVASYON / ÖN YETKİ FİLTRESİ

Aşağıdaki kelimeleri içeren satırları transactions listesine **EKLEME** — bunlar henüz gerçekleşmemiş ön yetki işlemleridir:
- RESERV.BETRAG
- Reservierung
- Vormerkung
- Vorausbuchung
- PREAUTH
- Vorgemerkt

---

## 5. TUTAR VE BAKİYE KURALLARI

- Alman sayı formatını (1.234,56) ondalık sayıya çevir: 1234.56
- Gelirler: **pozitif** tutar (ör: 1500.00)
- Giderler: **negatif** tutar (ör: -49.99)
- Bakiye (balance): Her işlemden sonraki güncel hesap bakiyesi (varsa)
- totalIncome: Tüm gelir tutarlarının toplamı (pozitif değer)
- totalExpense: Tüm gider tutarlarının toplamı (pozitif değer olarak, negatif DEĞİL)
- Tarihleri YYYY-MM-DD formatında yaz (ör: 2025-01-15)

---

## 6. KARŞI TARAF (COUNTERPART) TESPİTİ

İşlem açıklamasından karşı tarafı çıkar:
- Auftraggeber / Empfänger adı
- IBAN varsa ayrıca reference alanına yaz
- EREF, MREF, KREF gibi referansları reference alanına ekle
- Karşı taraf bulunamazsa counterpart = "" (boş string)

---

## 7. ÇIKTI FORMATI (JSON) — KESİN UYULACAK FORMAT

🚨 String değerler içerisinde KESİNLİKLE " (unescaped) kullanma! Hepsini tek tırnak yap veya escape et.

SADECE şu JSON formatını döndür (başka hiçbir şey yazma):

{
  "period": "01.01.2025 - 31.01.2025",
  "accountNumber": "DE89 3702 0500 0001 2345 67",
  "bankName": "TARGOBANK",
  "openingBalance": 5230.45,
  "closingBalance": 4812.30,
  "totalIncome": 2150.00,
  "totalExpense": 2568.15,
  "transactions": [
    {
      "date": "2025-01-03",
      "description": "SEPALASTSCHRIFT Vodafone GmbH Mobilfunkrechnung Jan 2025",
      "amount": -39.99,
      "type": "expense",
      "reference": "EREF: RF2025010300123",
      "counterpart": "Vodafone GmbH",
      "category": "Telekommunikation",
      "category_tr": "İletişim",
      "balance": 5190.46
    },
    {
      "date": "2025-01-05",
      "description": "ECHTZEITGUTSCHRIFT Max Mustermann Miete Januar",
      "amount": 1200.00,
      "type": "income",
      "reference": "",
      "counterpart": "Max Mustermann",
      "category": "Gutschrift",
      "category_tr": "Havale (Gelen)",
      "balance": 6390.46
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

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    console.error("[analyze-bank] ANTHROPIC_API_KEY secret tanımlı değil");
    return new Response(
      JSON.stringify({ success: false, error: "AI servisi yapılandırılmamış" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const isPdf = fileType === "application/pdf";
  const contentBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
    : { type: "image", source: { type: "base64", media_type: fileType, data: fileBase64 } };

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 16000,
        temperature: 0.1,
        system: BANK_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              { type: "text", text: "Banka ekstresini analiz et ve istenen JSON formatında döndür. Sadece JSON, başka açıklama yok." },
            ],
          },
        ],
      }),
    });
  } catch (fetchErr) {
    console.error("[analyze-bank] Anthropic bağlantı hatası:", fetchErr);
    return new Response(
      JSON.stringify({ success: false, error: "AI servisine ulaşılamıyor" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    console.error("[analyze-bank] Anthropic hatası:", anthropicResponse.status, errText.substring(0, 500));
    return new Response(
      JSON.stringify({ success: false, error: `AI servisi hatası: ${anthropicResponse.status}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const anthropicData = await anthropicResponse.json();
  const rawText: string = anthropicData?.content?.[0]?.text ?? "";

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
