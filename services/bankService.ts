import { supabase } from "./supabaseService";

// ─────────────────────────────────────────────
//  EDGE FUNCTION URL
// ─────────────────────────────────────────────
const getEdgeFunctionUrl = (fn: "super-worker" | "analyze-bank" = "super-worker") => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL tanımlı değil.");
  return `${supabaseUrl}/functions/v1/${fn}`;
};

// ─────────────────────────────────────────────
//  BANKA EKSTRESİ EDGE FUNCTION ÇAĞRISI
// ─────────────────────────────────────────────
const fetchBankAnalysis = async (fileBase64: string, fileType: string): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");

  const edgeUrl = getEdgeFunctionUrl("analyze-bank");
  const res = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "",
    },
    body: JSON.stringify({ fileBase64, fileType }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Edge Function ${res.status}: ${errText.substring(0, 200)}`);
  }

  const json = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || "Edge Function geçersiz yanıt döndürdü");

  // Edge Function zaten parse edilmiş obje döndürüyor; tekrar stringify ediyoruz
  // çünkü analyzeBankStatement JSON string bekliyor
  return JSON.stringify(json.data);
};

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
export interface BankTransaction {
  id: string;
  date: string;           // ISO: YYYY-MM-DD
  description: string;    // Verwendungszweck / Auftraggeber
  amount: number;         // positif = gelir, negatif = gider
  type: "income" | "expense";
  reference: string;      // Referenz-Nr / Mandatsreferenz
  counterpart: string;    // Auftraggeber oder Empfänger
  category: string;       // Almanca kategori (ör: Lastschrift, Gutschrift)
  category_tr: string;    // Türkçe kategori (ör: Otomatik Ödeme, Havale)
  balance?: number;       // İşlem sonrası bakiye (varsa)
}

export interface BankStatement {
  period: string;         // z.B. "Januar 2025"
  accountNumber: string;
  bankName: string;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
  transactions: BankTransaction[];
}

import { analyzeBankStatementLocal } from './bankAnalyzerLocal';

// ─────────────────────────────────────────────
//  LOKAL BANKA EKSTRESİ ANALİZ FONKSİYONU (AI Bypassed)
// ─────────────────────────────────────────────
export const analyzeBankStatement = async (
  fileBase64: string,
  fileType: string
): Promise<BankStatement> => {
  console.log("[BankService] using local PDF parsing logic instead of Edge Function.");
  return await analyzeBankStatementLocal(fileBase64);
};

// ─────────────────────────────────────────────
//  İADE (REFUND) TESPİT FONKSİYONU
//  Gelir işleminin gerçek gelir mi yoksa iade mi
//  olduğunu açıklama/karşı taraf/referans alanlarından tespit eder.
// ─────────────────────────────────────────────
const REFUND_KEYWORDS = [
  // Almanca
  "erstattung", "rückerstattung", "rückzahlung", "rueckerstattung",
  "rueckzahlung", "storno", "stornier", "gutschrift",
  "rücklastschrift", "ruecklastschrift", "rückbuchung", "rueckbuchung",
  "korrektur", "retoure", "rücksendung", "ruecksendung",
  // Türkçe
  "iade", "geri ödeme", "geri odeme", "iptal", "cayma",
  // İngilizce
  "refund", "reversal", "chargeback", "return", "reimburse",
  "reimbursement", "credit note", "cancellation",
];

/**
 * Gelir (income) işleminin iade olup olmadığını tespit eder.
 * description, counterpart ve reference alanlarını kontrol eder.
 */
export const isRefundTransaction = (tx: {
  description?: string | null;
  counterpart?: string | null;
  reference?: string | null;
  type?: string | null;
}): boolean => {
  // Sadece gelir işlemlerinde kontrol et
  if (tx.type !== "income") return false;

  const text = [
    tx.description || "",
    tx.counterpart || "",
    tx.reference || "",
  ].join(" ").toLowerCase();

  return REFUND_KEYWORDS.some(kw => text.includes(kw));
};

// ─────────────────────────────────────────────
//  EŞLEŞTİRME YARDIMCI FONKSİYONLARI
// ─────────────────────────────────────────────

/** Normalize */
const normalize = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ä/g, "a")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Tutar eşleşmesi — kesin (±0.01 €) veya çok küçük oran farkı (±0.5%) */
const amountMatches = (a: number, b: number): boolean => {
  if (a === 0 && b === 0) return false;
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  // Cent-level tolerance (covers rounding in PDF parsing)
  if (Math.abs(absA - absB) <= 0.01) return true;
  // Percentage tolerance: max ±0.5% — prevents loose matches
  const base = Math.max(absA, absB);
  return (Math.abs(absA - absB) / base) <= 0.005;
};

/** Tarih ±7 gün */
const dateNear = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= 7 * 24 * 60 * 60 * 1000;
};

/** Metin içeriyor mu? */
const textContains = (haystack: string, needle: string): boolean => {
  if (!needle || needle.length < 3) return false;
  return normalize(haystack).includes(normalize(needle));
};

/** Metinden sayısal dizileri çıkar (≥4 hane — fatura no, vergi no vb.) */
const extractNumbers = (s: string): string[] =>
  (s.match(/\d{4,}/g) || []);

/** Alman USt-IdNr pattern: DE + 9 rakam */
const extractVatIds = (s: string): string[] =>
  (s.match(/DE\d{9}/gi) || []).map((v: string) => v.toUpperCase());

export interface MatchResult {
  invoiceId: string;
  invoiceNumber: string | null;
  supplierName: string | null;
  score: number;
  reasons: string[];
}

// ─────────────────────────────────────────────
//  SUPABASE KAYIT FONKSİYONLARI
// ─────────────────────────────────────────────

export interface SavedBankStatement {
  id: string;
  period: string;
  account_number: string;
  bank_name: string;
  opening_balance: number;
  closing_balance: number;
  total_income: number;
  total_expense: number;
  file_name: string;
  created_at: string;
}

export const saveBankStatement = async (
  statement: BankStatement,
  matches: { tx: BankTransaction; match: { invoiceId: string; score: number; reasons: string[] } | null }[],
  fileName: string,
  userId: string
): Promise<string> => {
  // 1. Ana kayıt
  const { data: stmtRow, error: stmtErr } = await supabase
    .from("bank_statements")
    .insert({
      user_id: userId,
      period: statement.period,
      account_number: statement.accountNumber,
      bank_name: statement.bankName,
      opening_balance: statement.openingBalance,
      closing_balance: statement.closingBalance,
      total_income: statement.totalIncome,
      total_expense: statement.totalExpense,
      file_name: fileName,
    })
    .select("id")
    .single();

  if (stmtErr) throw new Error("Ekstre kaydedilemedi: " + stmtErr.message);

  const statementId = stmtRow.id;

  // 2. İşlemler
  const txRows = matches.map(({ tx, match }) => ({
    statement_id: statementId,
    user_id: userId,
    transaction_date: tx.date || null,
    description: tx.description,
    counterpart: tx.counterpart,
    reference: tx.reference,
    amount: tx.amount,
    type: tx.type,
    matched_invoice_id: match?.invoiceId ?? null,
    match_score: match?.score ?? null,
    match_reasons: match?.reasons ?? [],
  }));

  const { error: txErr } = await supabase.from("bank_transactions").insert(txRows);
  if (txErr) throw new Error("İşlemler kaydedilemedi: " + txErr.message);

  return statementId;
};

export const fetchBankStatements = async (userId: string): Promise<SavedBankStatement[]> => {
  const { data, error } = await supabase
    .from("bank_statements")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
};

export const deleteBankStatement = async (id: string): Promise<void> => {
  const { error } = await supabase.from("bank_statements").delete().eq("id", id);
  if (error) throw new Error(error.message);
};

// ─────────────────────────────────────────────
//  TÜM KULLANICININ GELİR İŞLEMLERİ
//  (Giden Faturalar Defteri için)
// ─────────────────────────────────────────────
export const fetchUserIncomeTransactions = async (
  userId: string
): Promise<SavedTransaction[]> => {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "income")
    .order("transaction_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as SavedTransaction[];
};

// ─────────────────────────────────────────────
//  KAYITLI EKSTREDEKİ İŞLEMLER
// ─────────────────────────────────────────────

export interface SavedTransaction {
  id: string;
  statement_id: string;
  transaction_date: string | null;
  description: string | null;
  counterpart: string | null;
  reference: string | null;
  amount: number | null;
  type: "income" | "expense" | null;
  matched_invoice_id: string | null;
  match_score: number | null;
  match_reasons: string[] | null;
}

export const fetchStatementTransactions = async (
  statementId: string
): Promise<SavedTransaction[]> => {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("statement_id", statementId)
    .order("transaction_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as SavedTransaction[];
};

// ─────────────────────────────────────────────
//  GELİŞMİŞ EŞLEŞTİRME
//  Puanlama:
//    Tutar (±0.01€ / ±0.5%) → 50 puan  (ZORUNLU)
//    Fatura no               → 35 puan
//    Sayısal ref / no        → 20 puan  (vergi no, sipariş no, vb.)
//    Alman USt-IdNr          → 10 puan  (DE+9 hane)
//    Tedarikçi adı           → 20 puan
//    Tarih (±7 gün)          → 10 puan
//    Minimum eşik: 60 puan   (tutar tek başına YETERSİZ — ek sinyal zorunlu)
// ─────────────────────────────────────────────

export const matchTransactionToInvoices = (
  tx: BankTransaction,
  invoices: {
    id: string;
    invoice_number: string | null;
    supplier_name: string | null;
    invoice_date: string | null;
    total_gross: number | null;
  }[]
): MatchResult | null => {
  let bestMatch: MatchResult | null = null;

  // Banka tarafındaki metin + sayısal veriler
  const txText = `${tx.description} ${tx.reference} ${tx.counterpart}`;
  const txNumbers = extractNumbers(txText);
  const txVatIds = extractVatIds(txText);

  for (const inv of invoices) {
    const reasons: string[] = [];
    let score = 0;

    // ── 1. TUTAR EŞLEŞMESİ (±%2) → 50 puan — ZORUNLU KOŞUL ──
    //    Tutar eşleşmezse bu fatura tamamen atlanır.
    if (!amountMatches(tx.amount, inv.total_gross || 0)) continue;
    score += 50;
    reasons.push("Tutar eşleşti");

    // ── 2. FATURA NUMARASI EŞLEŞMESİ → 35 puan ──────────────
    if (inv.invoice_number && textContains(txText, inv.invoice_number)) {
      score += 35;
      reasons.push("Fatura no eşleşti");
    }

    // ── 3. SAYISAL REFERANS EŞLEŞMESİ → 20 puan ─────────────
    if (inv.invoice_number && score < 85) {
      const invNums = extractNumbers(inv.invoice_number);
      const hasNumMatch = invNums.some(n =>
        n.length >= 4 && txNumbers.some(t => t.includes(n) || n.includes(t))
      );
      if (hasNumMatch) {
        score += 20;
        reasons.push("Referans/vergi no eşleşti");
      }
    }

    // ── 4. ALMAN USt-IdNr EŞLEŞMESİ → 10 puan ───────────────
    if (txVatIds.length > 0) {
      const supplierNorm = normalize(inv.supplier_name || "");
      const hasVatContext = txVatIds.some(v =>
        normalize(txText).includes(supplierNorm.slice(0, 6)) || v.length > 0
      );
      if (hasVatContext) {
        score += 10;
        reasons.push(`USt-IdNr tespit edildi (${txVatIds[0]})`);
      }
    }

    // ── 5. TEDARİKÇİ ADI EŞLEŞMESİ → 20 puan ────────────────
    if (inv.supplier_name) {
      const words = normalize(inv.supplier_name).split(" ").filter(w => w.length > 3);
      const normTxText = normalize(txText);
      const matched = words.filter(w => normTxText.includes(w));
      if (matched.length > 0) {
        const pts = Math.round((matched.length / words.length) * 20);
        score += pts;
        reasons.push(`Tedarikçi adı eşleşti`);
      }
    }

    // ── 6. TARİH YAKINI → 10 puan ─────────────────────────────
    if (inv.invoice_date && dateNear(tx.date, inv.invoice_date)) {
      score += 10;
      reasons.push("Tarih yakın (±7 gün)");
    }

    // Minimum eşik: 60 puan — tutar eşleşmesi tek başına YETERSİZ,
    // en az bir ek sinyal (fatura no, tedarikçi adı veya tarih) gereklidir.
    if (score < 60) continue;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        supplierName: inv.supplier_name,
        score,
        reasons,
      };
    }
  }

  return bestMatch;
};
