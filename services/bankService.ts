import { GoogleGenAI } from "@google/genai";
import { supabase } from "./supabaseService";

// ─────────────────────────────────────────────
//  MODEL CONFIG
// ─────────────────────────────────────────────
const MODEL_SMART = "gemini-2.5-flash";

const getApiKey = (): string => (import.meta.env.VITE_GEMINI_API_KEY as string) || "";

const getAiClient = () => new GoogleGenAI({ apiKey: getApiKey() });

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

// ─────────────────────────────────────────────
//  GEMINI BANKA EKSTRESİ ANALİZ FONKSİYONU
// ─────────────────────────────────────────────
export const analyzeBankStatement = async (
  fileBase64: string,
  fileType: string
): Promise<BankStatement> => {
  const ai = getAiClient();

  const mediaType = fileType || "application/pdf";

  const prompt = `Sen Alman bankacılık uzmanısın. Bu banka ekstresini (Kontoauszug) analiz et.

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

  const response = await ai.models.generateContent({
    model: MODEL_SMART,
    contents: {
      parts: [
        { inlineData: { mimeType: mediaType, data: fileBase64 } },
        { text: prompt },
      ],
    },
    config: { responseMimeType: "application/json" },
  });

  const text = response.text || "";
  let clean = text.replace(/```json|```/g, "").trim();
  const f = clean.indexOf("{");
  const l = clean.lastIndexOf("}");
  if (f !== -1 && l > f) clean = clean.substring(f, l + 1);

  if (!clean) throw new Error("Gemini boş yanıt döndürdü");

  const raw = JSON.parse(clean);

  // Normalize + ID ata
  // RESERV (Reservierung / Vormerkung) girişleri gerçek işlem değildir — hariç tut
  const RESERV_PATTERN = /\bRESERV|\bVORMERK|\bPREAUTH|\bBLOKAJ/i;

  const transactions: BankTransaction[] = (raw.transactions || [])
    .filter((tx: any) => {
      const desc = String(tx.description || "");
      const ref  = String(tx.reference || "");
      const cp   = String(tx.counterpart || "");
      return !RESERV_PATTERN.test(desc) && !RESERV_PATTERN.test(ref) && !RESERV_PATTERN.test(cp);
    })
    .map((tx: any, idx: number) => ({
      id: `tx_${idx}_${Date.now()}`,
      date: String(tx.date || ""),
      description: String(tx.description || ""),
      amount: Number(tx.amount) || 0,
      type: (tx.type === "income" ? "income" : "expense") as "income" | "expense",
      reference: String(tx.reference || ""),
      counterpart: String(tx.counterpart || ""),
    }));

  return {
    period: String(raw.period || ""),
    accountNumber: String(raw.accountNumber || ""),
    bankName: String(raw.bankName || ""),
    openingBalance: Number(raw.openingBalance) || 0,
    closingBalance: Number(raw.closingBalance) || 0,
    totalIncome: Number(raw.totalIncome) || transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
    totalExpense: Math.abs(Number(raw.totalExpense) || transactions.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0)),
    transactions,
  };
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
  (s.match(/DE\d{9}/gi) || []).map(v => v.toUpperCase());

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
