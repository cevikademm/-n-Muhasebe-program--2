// supabase/functions/_shared/types.ts

// ─── VERGİ BİLDİRİM İŞARETLERİ (Tax Flags) ───
export type TaxFlag = "U" | "G" | "K" | "";
/*
  U: Umsatzsteuer / KDV Beyannamesine Tabi (Satışlarda)
  G: Gewerbesteuer / Ticaret Vergisi Beyannamesine Tabi
  K: Körperschaftsteuer / Kurumlar Vergisi Beyannamesine Tabi
*/

// ─── OTOMASYON FONKSİYON KODLARI (Automation Codes) ───
export type AutomationCode = "AV" | "AM" | "KU" | "";
/*
  AV: Otomatik İndirilecek KDV (Gelen Fatura)
  AM: Otomatik Hesaplanan KDV (Giden Fatura / Satış)
  KU: KDV Hesaplanamaz Blokesi (Vergisiz işlemler, Sigorta, Banka vb.)
*/

// ─── FATURA YÖNÜ ───
export type InvoiceDirection = "Gider (Gelen)" | "Gelir (Giden)" | "Bilinmiyor";

// ─── JSON ÇIKTI ŞEMASI ───
export interface InvoiceLineItem {
    description: string;
    account_code: string;
    automation_code: AutomationCode;
    tax_flag: TaxFlag;
    amount: number;
    tax_pool_account: string; // Örn: 1580 (İndirilecek), 1776 (Hesaplanan)
}

export interface InvoiceExtractedData {
    invoice_direction: InvoiceDirection;
    language: string; // NLP ile tespit edilen dil (German, English vb.)
    target_range: string; // Hangi range fonksiyonuna gittiği (ör: range_4)
    lines: InvoiceLineItem[];
}

// [FIX H-2] CORS origin kısıtlaması — wildcard kaldırıldı
const ALLOWED_ORIGINS = [
    "https://fikoai.de",
    "https://www.fikoai.de",
    "https://fibu-de-2.vercel.app",
];

export function getCorsHeaders(req: Request) {
    const origin = req.headers.get("Origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
}

export const jsonResponse = (body: any, status = 200, req?: Request) => {
    const headers = req ? getCorsHeaders(req) : {
        "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, "Content-Type": "application/json" },
    });
};
