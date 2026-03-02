import { GoogleGenAI } from "@google/genai";
import { AccountRow, MatchingRule } from "../types";
import { supabase } from "./supabaseService";

// ⚠ GÜVENLİK (DSK-01): Üretim ortamında hassas veri loglanmaz
const isDev = !import.meta.env.PROD;
const devLog = (...args: any[]) => { if (isDev) console.log(...args); };
const devWarn = (...args: any[]) => { if (isDev) console.warn(...args); };

// ─────────────────────────────────────────────
//  MODEL CONFIG
// ─────────────────────────────────────────────
const MODEL_FAST = "gemini-2.5-flash-lite-preview-06-17";
const MODEL_SMART = "gemini-2.5-flash";

// ⚠ GÜVENLİK: Üretim ortamında API anahtarı istemci tarafında kullanılmamalıdır.
// Tüm AI işlemleri önce Supabase Edge Function üzerinden yapılır.
// Edge Function başarısız olursa VITE_GEMINI_API_KEY ile fallback yapılır.
const getApiKey = (): string => (import.meta.env.VITE_GEMINI_API_KEY as string) || "";

const getAiClient = () => new GoogleGenAI({ apiKey: getApiKey() });

// Edge Function URL — Supabase URL'si .env'den okunur
const getEdgeFunctionUrl = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  if (!supabaseUrl) {
    console.error("[Fibu.de] VITE_SUPABASE_URL tanımlı değil — Edge Function çağrılamaz.");
    return "";
  }
  return `${supabaseUrl}/functions/v1/analyze-invoice`;
};

// ─────────────────────────────────────────────
//  KURAL EŞLEŞTİRME
// ─────────────────────────────────────────────
const applyMatchingRules = (
  supplierName: string,
  rules: MatchingRule[]
): { account_code: string; account_name: string } | null => {
  if (!supplierName || !rules?.length) return null;
  const lower = supplierName.toLowerCase();
  for (const rule of rules) {
    if (rule.supplier_keyword && lower.includes(rule.supplier_keyword.toLowerCase())) {
      return { account_code: rule.account_code, account_name: rule.account_name };
    }
  }
  return null;
};

// ─────────────────────────────────────────────
//  GÜVENLİ PARSER
// ─────────────────────────────────────────────
const sanitizeInvoiceData = (rawData: any) => {
  const header = rawData?.header || {};
  const safeHeader = {
    invoice_number: String(header.invoice_number || ""),
    supplier_name: String(header.supplier_name || "Bilinmiyor"),
    invoice_date: String(header.invoice_date || new Date().toISOString().split("T")[0]),
    total_net: Number(header.total_net) || 0,
    total_vat: Number(header.total_vat) || 0,
    total_gross: Number(header.total_gross) || 0,
    currency: String(header.currency || "EUR"),
  };
  const items = Array.isArray(rawData?.items) ? rawData.items : [];
  const safeItems = items.map((item: any) => ({
    description: String(item.description || "Ürün/Hizmet"),
    quantity: Number(item.quantity) || 1,
    unit_price: Number(item.unit_price) || 0,
    vat_rate: Number(item.vat_rate) || 0,
    vat_amount: Number(item.vat_amount) || 0,
    net_amount: Number(item.net_amount) || 0,
    gross_amount: Number(item.gross_amount) || 0,
    account_code: String(item.account_code || "").replace(/^0+/, "").length > 0
      ? String(item.account_code || "").replace(/^0+/, "").padStart(4, "0") : "",
    account_name: String(item.account_name || ""),
    account_name_tr: String(item.account_name_tr || ""),
    match_score: Number(item.match_score) || 0,
    match_justification: String(item.match_justification || ""),
    hgb_reference: String(item.hgb_reference || ""),
    tax_note: String(item.tax_note || ""),
    period_note: String(item.period_note || ""),
    expense_type: String(item.expense_type || ""),
    datev_counter_account: String(item.datev_counter_account || ""),
    match_source: String(item.match_source || "ai"),
  }));
  return {
    header: safeHeader,
    items: safeItems,
    context: String(rawData?.context || "Otomatik analiz tamamlandı."),
  };
};

// ─────────────────────────────────────────────
//  PROMPT BUILDER
// ─────────────────────────────────────────────
const buildSystemPrompt = (accountList: AccountRow[]): string => {
  const formattedAccounts = accountList
    .map(a => `${(a.account_code || "").padEnd(6)} | ${(a.account_description || "").substring(0, 60).padEnd(60)} | ${(a.analysis_justification || "").substring(0, 100)}`)
    .join("\n");

  return `Sen Almanya'nın en uzman Vergi Danışmanı ve DATEV Uzmanısın (Wirtschaftsprüfer).

═══ HESAP PLANI (SKR03) - SADECE BU KODLARI KULLAN ═══
HESAP KODU | HESAP ADI | ANALİZ GEREKÇESİ
${formattedAccounts}

═══ GÖREV ═══
Fatura görselini analiz et. Her kalem için yukarıdaki hesap planında yer alan "ANALİZ GEREKÇESİ" sütununa göre EN UYGUN hesap kodunu seç.

═══ ZORUNLU KURALLAR ═══
1. SADECE listede olan kodları kullan.
2. Hesap kodları KESİNLİKLE 4 haneli olmalıdır.
3. KDV kalemleri için doğru Vorsteuer hesabını ata.
4. account_name: listede yer alan HESAP ADI ile birebir aynı olmalıdır.
5. match_justification: MUTLAKA TÜRKÇE + HGB paragrafı.
6. match_score: 95-100 arası.
7. datev_counter_account: Banka→1200, Tedarikçi borcu→1600

═══ ÇIKTI (Sadece JSON) ═══
{"header":{"invoice_number":"","supplier_name":"","invoice_date":"YYYY-MM-DD","total_net":0,"total_vat":0,"total_gross":0,"currency":"EUR"},"items":[{"description":"","quantity":1,"unit_price":0,"vat_rate":19,"vat_amount":0,"net_amount":0,"gross_amount":0,"account_code":"4900","account_name":"","account_name_tr":"","match_score":97,"match_justification":"Türkçe gerekçe...","hgb_reference":"§ 255 HGB","tax_note":"Vorsteuer abzugsfähig gem. § 15 UStG","period_note":"Sofortaufwand","expense_type":"Operative Kosten","datev_counter_account":"1600","match_source":"ai"}],"context":"Analiz özeti..."}`;
};

// ─────────────────────────────────────────────
//  YARDIMCI: JSON PARSE
// ─────────────────────────────────────────────
const parseJsonResponse = (text: string) => {
  let clean = (text || "").replace(/```json|```/g, "").trim();
  const f = clean.indexOf("{");
  const l = clean.lastIndexOf("}");
  if (f !== -1 && l > f) clean = clean.substring(f, l + 1);
  if (!clean) throw new Error("AI boş yanıt döndürdü");
  return JSON.parse(clean);
};

// ─────────────────────────────────────────────
//  YÖNTEM A: Doğrudan Gemini API
// ─────────────────────────────────────────────
const analyzeViaDirectGemini = async (
  fileBase64: string,
  fileType: string,
  allAccountPlans: AccountRow[]
) => {
  const ai = getAiClient();
  const mediaType = fileType || "image/jpeg";

  // Hızlı ön-çıkarım
  let supplierName = "";
  try {
    const quickRes = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: {
        parts: [
          { inlineData: { mimeType: mediaType, data: fileBase64 } },
          { text: `Sadece bu JSON'u döndür:\n{"supplier_name":"","item_descriptions":"tüm ürün/hizmet açıklamaları"}\nBaşka hiçbir şey yazma.` },
        ],
      },
      config: { responseMimeType: "application/json" },
    });
    const qt = (quickRes.text || "").replace(/```json|```/g, "").trim();
    const qd = JSON.parse(qt);
    supplierName = qd.supplier_name || "";
  } catch {
    // ön-çıkarım başarısız → devam et
  }

  devLog(`[Fibu.de] Doğrudan Gemini analizi — Tedarikçi: "${supplierName}"`);

  // Ana analiz
  const systemPrompt = buildSystemPrompt(allAccountPlans);
  const response = await ai.models.generateContent({
    model: MODEL_SMART,
    contents: {
      parts: [
        { inlineData: { mimeType: mediaType, data: fileBase64 } },
        { text: systemPrompt },
      ],
    },
    config: { responseMimeType: "application/json" },
  });

  const parsed = parseJsonResponse(response.text || "");
  return sanitizeInvoiceData(parsed);
};

// ─────────────────────────────────────────────
//  YÖNTEM B: Supabase Edge Function
// ─────────────────────────────────────────────
const analyzeViaEdgeFunction = async (
  fileBase64: string,
  fileType: string,
  allAccountPlans: AccountRow[],
  matchingRules: MatchingRule[],
  accessToken: string
) => {
  const edgeUrl = getEdgeFunctionUrl();
  const response = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "apikey": (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "",
    },
    body: JSON.stringify({ fileBase64, fileType, accountPlans: allAccountPlans, matchingRules }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Edge Function ${response.status}: ${errText.substring(0, 200)}`);
  }

  const json = await response.json();
  if (!json.success || !json.data) {
    throw new Error(json.error || "Edge Function geçersiz yanıt");
  }
  return sanitizeInvoiceData(json.data);
};

// ─────────────────────────────────────────────
//  ANA FONKSİYON — Önce Edge Function, sonra Direct Gemini
// ─────────────────────────────────────────────
export const analyzeInvoiceWithAI = async (
  fileBase64: string,
  fileType: string,
  allAccountPlans: AccountRow[],
  matchingRules: MatchingRule[] = []
) => {
  const VORSTEUER_CODES = new Set(["1570", "1571", "1573", "1575", "1576"]);

  const applyRuleToResult = (result: ReturnType<typeof sanitizeInvoiceData>, ruleName: string) => {
    const supplierName = result.header?.supplier_name || "";
    const ruleMatch = applyMatchingRules(supplierName, matchingRules);
    if (!ruleMatch) return result;
    result.items = result.items.map((item: any) => {
      if (VORSTEUER_CODES.has(item.account_code)) return item;
      return {
        ...item,
        account_code: ruleMatch.account_code,
        account_name: ruleMatch.account_name,
        match_score: 100,
        match_source: "rule_manual",
        match_justification: `${item.match_justification} [${ruleName}: "${supplierName}" → ${ruleMatch.account_code}]`,
      };
    });
    return result;
  };

  try {
    // ── Supabase oturumu al
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    // ── YÖNTEM 1: Edge Function (deploy edilmişse)
    if (accessToken) {
      try {
        devLog("[Fibu.de] Edge Function deneniyor...");
        const result = await analyzeViaEdgeFunction(
          fileBase64, fileType, allAccountPlans, matchingRules, accessToken
        );
        devLog("[Fibu.de] ✅ Edge Function başarılı");
        return applyRuleToResult(result, "EdgeFunc kural");
      } catch (edgeErr: any) {
        devWarn("[Fibu.de] ⚠️ Edge Function başarısız, doğrudan Gemini'ye geçiliyor:", edgeErr.message);
      }
    }

    // ── YÖNTEM 2: Doğrudan Gemini API (fallback)
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        "Gemini API anahtarı bulunamadı.\n" +
        "• Supabase Edge Function henüz deploy edilmemiş olabilir.\n" +
        "• Veya VITE_GEMINI_API_KEY .env'e eklenmemiş.\n" +
        "Çözüm: .env dosyasına VITE_GEMINI_API_KEY=... ekleyin ve sunucuyu yeniden başlatın."
      );
    }

    devLog("[Fibu.de] Doğrudan Gemini API kullanılıyor...");
    const result = await analyzeViaDirectGemini(fileBase64, fileType, allAccountPlans);
    devLog("[Fibu.de] ✅ Doğrudan Gemini analizi başarılı");
    return applyRuleToResult(result, "Direkt kural");

  } catch (err: any) {
    console.error("[Fibu.de] ❌ Analiz tamamen başarısız:", err);
    throw err; // useInvoices'a ilet — UI'da gösterilsin
  }
};

// ─────────────────────────────────────────────
//  YARDIMCI FONKSİYONLAR
// ─────────────────────────────────────────────
export const analyzeAccountRecord = async (record: AccountRow, lang: "tr" | "de") => {
  try {
    const ai = getAiClient();
    const res = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: `Uzman Alman muhasebecisi olarak şu kaydı analiz et: ${JSON.stringify(record, null, 2)}\n1. guv_posten ile account_description tutarlı mı?\n2. SKR03/SKR04'teki amacı nedir?\nYanıtı ${lang === "tr" ? "Türkçe" : "Almanca"} ver.`,
    });
    return res.text;
  } catch (e: any) {
    return "Analiz servisi yanıt veremiyor: " + e.message;
  }
};

export const analyzeInvoiceImage = async (base64Image: string, lang: "tr" | "de") => {
  try {
    const ai = getAiClient();
    const res = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: `Faturayı analiz et: tedarikçi, tarih, toplam tutar, fatura no. Alman muhasebe kategorisine yerleştir. Yanıt: ${lang === "tr" ? "Türkçe" : "Almanca"}` },
        ],
      },
    });
    return res.text;
  } catch (e: any) {
    return "Görüntü analiz edilemedi: " + e.message;
  }
};

export const generateReportCover = async (_p: string, _a: string) => null;

export const getQuickAssistantResponse = async (query: string, lang: "tr" | "de") => {
  try {
    const ai = getAiClient();
    const res = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: `Muhasebe asistanı olarak kısa yanıt ver (${lang === "tr" ? "Türkçe" : "Almanca"}). Soru: ${query}`,
    });
    return res.text;
  } catch {
    return "Asistan şu an kullanılamıyor.";
  }
};