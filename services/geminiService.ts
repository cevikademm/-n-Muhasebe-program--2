import { AccountRow, MatchingRule } from "../types";
import { supabase } from "./supabaseService";
import { ACCOUNT_METADATA } from "../data/skr03Metadata";

// ⚠ GÜVENLİK: Üretim ortamında hassas veri loglanmaz
const isDev = !import.meta.env.PROD;
const devLog = (...args: any[]) => { if (isDev) console.log(...args); };

// Edge Function URL — Supabase URL'si .env'den okunur (public)
const getEdgeFunctionUrl = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  if (!supabaseUrl) {
    console.error("[Fibu.de] VITE_SUPABASE_URL tanımlı değil — Edge Function çağrılamaz.");
    return "";
  }
  return `${supabaseUrl}/functions/v1/invoice-analyzer`;
};

// Edge Function URL (yeni invoice-analyzer)
export const getInvoiceAnalyzerUrl = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  if (!supabaseUrl) return "";
  return `${supabaseUrl}/functions/v1/invoice-analyzer`;
};

// ─────────────────────────────────────────────
// (Eski Kural Motoru Fonksiyonları Tamamen Silindi)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  GÜVENLİ PARSER (Yeni 10'lu Mimari JSON Çıktısı)
// ─────────────────────────────────────────────
const sanitizeInvoiceData = (rawData: any) => {
  // Yeni format: fatura_bilgileri / kalemler / finansal_ozet / uyarilar
  const fb = rawData?.fatura_bilgileri;
  const fo = rawData?.finansal_ozet;

  const invoiceType = fb?.fatura_yonu || rawData?.invoice_direction || "Bilinmiyor";
  const language = fb?.dil || rawData?.language || "Bilinmiyor";

  const safeHeader = {
    invoice_number: fb?.fatura_no || rawData?.invoice_number || "Otomatik Alınmadı",
    supplier_name: fb?.satici_unvani || rawData?.supplier_name || "Bilinmiyor",
    invoice_date: fb?.tarih || rawData?.invoice_date || new Date().toISOString().split("T")[0],
    total_net: fo?.ara_toplam ?? 0,
    total_vat: fo?.toplam_kdv ?? 0,
    total_gross: fo?.genel_toplam ?? 0,
    currency: "EUR",
    invoice_type: invoiceType,
    language: language,
    satici_vkn: fb?.satici_vkn || null,
    alici_vkn: fb?.alici_vkn || null,
    alici_unvani: fb?.alici_unvani || null,
  };

  // Yeni format: kalemler dizisi (Türkçe alan adları)
  const items = Array.isArray(rawData?.kalemler) ? rawData.kalemler :
                Array.isArray(rawData?.lines) ? rawData.lines : [];

  const safeItems = items.map((item: any) => {
    const code = String(item.hesap_kodu || item.account_code || "");
    const meta = ACCOUNT_METADATA[code];

    // AI'dan gelen gerekçe veya metadata'dan oluşturulan fallback
    const aiJustification = item.eslesme_gerekce || item.match_justification || "";
    const itemName = String(item.urun_adi || item.description || "Ürün/Hizmet");
    const fallbackJustification = meta
      ? `Faturada '${itemName}' kalemi tespit edildi. Bu kalem ${meta.kategorie} kategorisinde değerlendirilmektedir. ${code} — ${meta.description} hesabına atanmıştır.${meta.examples.length > 0 ? " Benzer işlemler: " + meta.examples.slice(0, 2).join(", ") + "." : ""}`
      : `Faturada '${itemName}' kalemi tespit edildi. ${code} hesap koduna atanmıştır.`;

    return {
      description: String(item.urun_adi || item.description || "Ürün/Hizmet"),
      quantity: Number(item.miktar || item.quantity) || 1,
      unit_price: Number(item.birim_fiyat || item.unit_price) || 0,
      net_amount: Number(item.net_tutar || item.net_amount) || 0,
      gross_amount: Number(item.brut_tutar || item.gross_amount) || 0,
      vat_rate: Number(item.kdv_orani || item.vat_rate) || 0,
      vat_amount: Number(item.kdv_tutar || item.vat_amount) || 0,

      account_code: code,
      account_name: String(item.hesap_aciklamasi || item.account_name || meta?.description || ""),

      automation_code: String(item.otomasyon_kodu || item.automation_code || ""),
      tax_flag: String(item.vergi_flagi || item.tax_flag || ""),
      tax_pool_account: String(item.vergi_havuz_hesabi || item.tax_pool_account || ""),

      match_score: 95,
      match_justification: aiJustification || fallbackJustification,
      hgb_reference: String(item.hgb_referans || item.hgb_reference || ""),
      tax_note: String(item.vergi_notu || item.tax_note || ""),
      expense_type: String(item.gider_turu || item.expense_type || ""),
      match_source: "ai_router"
    };
  });

  // Uyarıları logla
  const warnings = rawData?.uyarilar || [];
  if (warnings.length > 0) {
    console.warn("[Fibu.de] AI Uyarıları:", warnings);
  }

  return {
    header: safeHeader,
    items: safeItems,
    warnings: warnings,
    context: `Dil: ${language}, Yön: ${invoiceType}`,
  };
};

// ─────────────────────────────────────────────
//  SUPABASE EDGE FUNCTION ÜZERİNDEN ROUTER ANALİZ
// ─────────────────────────────────────────────
const fetchCompanyInfo = async (userId: string): Promise<{ companyName: string; companyVatId: string }> => {
  try {
    const { data } = await supabase
      .from("user_settings")
      .select("company")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.company) {
      return {
        companyName: data.company.company_name || "",
        companyVatId: data.company.ust_id || "",
      };
    }
  } catch { /* fallback to localStorage */ }

  // localStorage fallback
  try {
    const ls = localStorage.getItem("fibu_de_settings");
    if (ls) {
      const parsed = JSON.parse(ls);
      return {
        companyName: parsed?.company?.company_name || "",
        companyVatId: parsed?.company?.ust_id || "",
      };
    }
  } catch { /* ignore */ }

  return { companyName: "", companyVatId: "" };
};

const analyzeViaEdgeFunction = async (
  fileBase64: string,
  fileType: string,
  matchingRules: MatchingRule[],
  accessToken: string,
  userId: string
) => {
  // Kullanıcının şirket bilgilerini al (fatura yönü tespiti için)
  const { companyName, companyVatId } = await fetchCompanyInfo(userId);
  devLog("[Fibu.de] Şirket bilgileri:", { companyName, companyVatId: companyVatId ? "***" : "(boş)" });

  const { data, error } = await supabase.functions.invoke("invoice-router", {
    body: { fileBase64, fileType, companyName, companyVatId },
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (error) {
    throw new Error(`Router Edge Function hatası: ${error.message || JSON.stringify(error)}`);
  }

  if (!data?.success) {
    throw new Error(data?.error || "Router Edge Function geçersiz yanıt döndürdü");
  }
  if (!data?.data) {
    throw new Error("AI yanıtı (Range) boş döndü");
  }

  // Dönen veri artık Range fonksiyonundan (range-4, range-8 vb.) gelen datadır
  data.data.target_range = data.target_range;
  return sanitizeInvoiceData(data.data);
};

// ─────────────────────────────────────────────
// Frontend-Only AI Analysis (Architecture & Prompt Engineer Demo)
// ─────────────────────────────────────────────

export const analyzeInvoiceWithAI = async (
  fileBase64: string,
  fileType: string,
  matchingRules: MatchingRule[] = []
) => {

  // Oturum kontrolü — token expire olmuş olabilir, önce refresh dene
  let { data: { session } } = await supabase.auth.getSession();
  if (session && session.expires_at && session.expires_at * 1000 < Date.now() + 30000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) session = refreshed.session;
  }
  if (!session?.access_token) {
    throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın (SaaS Güvenliği).");
  }

  devLog("[Fibu.de] SaaS Güvenli Edge Function (invoice-router) çağrılıyor...");
  const result = await analyzeViaEdgeFunction(
    fileBase64, fileType, matchingRules, session.access_token, session.user.id
  );
  devLog("[Fibu.de] ✅ Edge Function Analizi başarılı");

  // Şimdilik herhangi bir üstüne yazma yapmıyoruz, result'u doğrudan döndürüyoruz.
  return result;
};

// ─────────────────────────────────────────────
//  YARDIMCI FONKSİYONLAR (Edge Function'a taşınana kadar stub)
// ─────────────────────────────────────────────
export const analyzeAccountRecord = async (_record: AccountRow, _lang: "tr" | "de") => {
  return "Bu özellik şu an güncelleniyor.";
};

export const analyzeInvoiceImage = async (_base64Image: string, _lang: "tr" | "de") => {
  return "Bu özellik şu an güncelleniyor.";
};

export const generateReportCover = async (_p: string, _a: string) => null;

export const getQuickAssistantResponse = async (_query: string, _lang: "tr" | "de") => {
  return "Asistan şu an kullanılamıyor.";
};
