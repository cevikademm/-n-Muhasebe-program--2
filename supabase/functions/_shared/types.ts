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

export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const jsonResponse = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
