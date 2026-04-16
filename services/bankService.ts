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
  // NOT: "Gutschrift" tek başına Almanca banka ekstresinde "alacak/gelen ödeme"
  // anlamına gelir ve TÜM gelirler için kullanılır → false-positive olur, hariç tutuldu.
  "erstattung", "rückerstattung", "rückzahlung", "rueckerstattung",
  "rueckzahlung", "storno", "stornier",
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
//  KENDİ HESABA PARA TRANSFERİ TESPİTİ
//  (Eigenüberweisung / Umbuchung) — fatura eşleşmesi yapılmamalı
// ─────────────────────────────────────────────
const SELF_TRANSFER_KEYWORDS = [
  // DE
  "eigenuberweisung", "eigenubertrag", "umbuchung", "ubertrag auf",
  "ubertrag eigenes konto", "eigenes konto", "interne buchung",
  "privatentnahme", "privateinlage",
  // TR
  "kendi hesabima", "kendi hesabima transfer", "hesaplar arasi", "hesaplar arası",
  "virman", "kendi hesabim",
  // EN
  "internal transfer", "own account", "to self", "self transfer",
];

/**
 * İşlemin "kendi hesaba transfer" (Eigenüberweisung / Umbuchung / Privat)
 * olup olmadığını tespit eder. Pozitif çıkarsa fatura eşleşmesi YAPILMAMALI.
 *
 * Tetikleyiciler:
 *  - Açıklama "ÜBERWEISUNG" + sonunda "PRIVAT" ipucu (Targo/OLB tarzı)
 *  - "EIGENÜBERWEISUNG", "UMBUCHUNG", "ÜBERTRAG", "PRIVATENTNAHME", vb.
 *  - "Hesaplar arası", "Virman" gibi TR ipuçları
 */
export const isSelfTransferTransaction = (tx: {
  description?: string | null;
  counterpart?: string | null;
  reference?: string | null;
}): boolean => {
  const raw = `${tx.description || ""} ${tx.counterpart || ""} ${tx.reference || ""}`;
  const norm = raw
    .toLowerCase()
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ä/g, "a")
    .replace(/ß/g, "ss");

  // 1) Net anahtar sözcükler
  if (SELF_TRANSFER_KEYWORDS.some(kw => norm.includes(kw))) return true;

  // 2) "ÜBERWEISUNG ... PRIVAT" kalıbı (Targo / OLB / DKB / Sparkasse formatı)
  //    Privat etiketi açıklamanın bir yerinde geçiyor ve bir "Überweisung" türü transferse
  //    bunu kendi hesaba aktarım kabul ediyoruz.
  if (/\buberweisung\b/.test(norm) && /\bprivat\b/.test(norm)) return true;

  // 3) "Privatkonto" / "auf privat" varyasyonları
  if (/\bprivatkonto\b/.test(norm)) return true;
  if (/\bauf privat\b/.test(norm)) return true;

  return false;
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

/** Tutar eşleşmesi — kesin (±0.02 €) veya küçük oran farkı (±1%) */
const amountMatches = (a: number, b: number): boolean => {
  if (a === 0 && b === 0) return false;
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  // Cent-level tolerance (covers rounding in PDF parsing)
  if (Math.abs(absA - absB) <= 0.02) return true;
  // Percentage tolerance: max ±1% — SEPA Lastschrift tutarları bazen yuvarlanır
  const base = Math.max(absA, absB);
  return (Math.abs(absA - absB) / base) <= 0.01;
};

/** Tarih ±7 gün */
const dateNear = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= 7 * 24 * 60 * 60 * 1000;
};

/** Tarih yakınlığı skoru (0..10) — 0 gün = 10, 14+ gün = 0, lineer azalım */
const dateProximityScore = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (isNaN(t1) || isNaN(t2)) return 0;
  const days = Math.abs(t1 - t2) / (24 * 60 * 60 * 1000);
  if (days > 14) return 0;
  return Math.max(0, Math.round((1 - days / 14) * 10));
};

// ─────────────────────────────────────────────
//  SEPA / Alman banka açıklama alanlarından sinyal çıkarıcıları
// ─────────────────────────────────────────────

/** Gläubiger-ID (SEPA Creditor Identifier) — ülke kodu + 2 rakam + 3 karakter + en az 10 karakter */
const extractCreditorIds = (s: string): string[] => {
  if (!s) return [];
  const out = new Set<string>();
  const m1 = s.match(/Gl(?:ä|ae)ubiger[\s\-]?ID[\s:]*([A-Z0-9]{10,})/gi);
  if (m1) m1.forEach(x => {
    const v = x.replace(/Gl(?:ä|ae)ubiger[\s\-]?ID[\s:]*/i, "").trim().toUpperCase();
    if (v.length >= 10) out.add(v);
  });
  // Genel kalıp: DE##ZZZ########## gibi SEPA CI
  const m2 = s.match(/\b[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[0-9A-Z]{10,}\b/g);
  if (m2) m2.forEach(x => out.add(x.toUpperCase()));
  return [...out];
};

const extractMandateRefs = (s: string): string[] => {
  if (!s) return [];
  const out = new Set<string>();
  const re = /Mandat[s]?referenz[\s:]*([A-Z0-9][A-Z0-9\-\.\/]{3,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.add(m[1].toUpperCase());
  const re2 = /Kundenreferenz[\s:]*([A-Z0-9][A-Z0-9\-\.\/]{3,})/gi;
  while ((m = re2.exec(s)) !== null) out.add(m[1].toUpperCase());
  const re3 = /End[\s\-]?to[\s\-]?End[\s\-]?Ref[\s\.\:]*([A-Z0-9][A-Z0-9\-\.\/]{3,})/gi;
  while ((m = re3.exec(s)) !== null) out.add(m[1].toUpperCase());
  return [...out];
};

/** IBAN (DE + 20 rakam, + generic EU shape) */
const extractIbans = (s: string): string[] => {
  if (!s) return [];
  const out = new Set<string>();
  const m1 = s.match(/\bDE\d{20}\b/gi);
  if (m1) m1.forEach(x => out.add(x.toUpperCase().replace(/\s+/g, "")));
  const m2 = s.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi);
  if (m2) m2.forEach(x => out.add(x.toUpperCase().replace(/\s+/g, "")));
  return [...out];
};

// ─────────────────────────────────────────────
//  Fuzzy tedarikçi adı skoru (0..1)
// ─────────────────────────────────────────────
const GERMAN_LEGAL_FORMS = /\b(gmbh\s*&?\s*co\.?\s*kg|gmbh|aktiengesellschaft|ag|kg|ohg|ug|mbh|e\.?\s*v\.?|e\.?\s*k\.?|se|gbr)\b/gi;
const NAME_STOPWORDS = new Set(["der", "die", "das", "und", "von", "der", "fur", "fuer", "mit", "zum", "zur", "the", "and", "for"]);

const stripLegalForms = (s: string): string =>
  (s || "").replace(GERMAN_LEGAL_FORMS, " ").replace(/\s+/g, " ").trim();

const tokenizeName = (s: string): string[] =>
  normalize(stripLegalForms(s))
    .split(" ")
    .filter(t => t.length >= 3 && !NAME_STOPWORDS.has(t));

/** Dice benzerliği (bigram) — 0..1 */
const diceCoefficient = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const arr: string[] = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.substring(i, i + 2));
    return arr;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  const map = new Map<string, number>();
  for (const g of A) map.set(g, (map.get(g) || 0) + 1);
  let hits = 0;
  for (const g of B) {
    const v = map.get(g) || 0;
    if (v > 0) { hits++; map.set(g, v - 1); }
  }
  return (2 * hits) / (A.length + B.length);
};

/**
 * Tedarikçi adı fuzzy skoru (0..1).
 * Tokenize eder, hukuki ekleri atar, token-set overlap + en uzun tokenin Dice katsayısını birleştirir.
 */
const fuzzySupplierScore = (invSupplier: string, txText: string): number => {
  const invToks = tokenizeName(invSupplier);
  const txToks = tokenizeName(txText);
  if (invToks.length === 0 || txToks.length === 0) return 0;

  // Token-set overlap (inv tokenlerinden kaçı tx'te substring olarak geçiyor)
  const txJoined = " " + txToks.join(" ") + " ";
  let hits = 0;
  for (const t of invToks) {
    if (txJoined.includes(" " + t + " ") || txJoined.includes(t)) hits++;
  }
  const overlapRatio = hits / invToks.length;

  // En uzun token için Dice
  const longest = invToks.reduce((a, b) => (b.length > a.length ? b : a), "");
  let bestDice = 0;
  for (const t of txToks) {
    const d = diceCoefficient(longest, t);
    if (d > bestDice) bestDice = d;
  }

  // Ağırlıklı birleşim
  return Math.min(1, overlapRatio * 0.7 + bestDice * 0.3);
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
  /** "confident" ≥85, "probable" 65..84 */
  tier?: "confident" | "probable";
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
  file_url: string | null;
  created_at: string;
  period_year?: number | null;
  period_month?: number | null;
}

export const saveBankStatement = async (
  statement: BankStatement,
  matches: { tx: BankTransaction; match: { invoiceId: string; score: number; reasons: string[] } | null }[],
  fileName: string,
  userId: string,
  file?: File,
  period?: { year: number; month: number }
): Promise<string> => {
  // 0. Dosyayı Storage'a yükle (varsa)
  let storedFileUrl: string | null = null;
  if (file) {
    try {
      const safeName = fileName.replace(/[^\w.\-]/g, "_");
      const path = `${userId}/bank/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        console.warn("[bankService] Storage upload uyarı:", upErr.message);
      } else {
        const { data: pub } = supabase.storage.from("invoices").getPublicUrl(path);
        storedFileUrl = pub?.publicUrl ?? null;
      }
    } catch (e: any) {
      console.warn("[bankService] Storage exception:", e?.message);
    }
  }

  // Kullanıcı dönem seçtiyse `period` metnini üst üste yaz (ör. "Nisan 2026")
  const monthsDe = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const displayPeriod = period && period.year && period.month
    ? `${monthsDe[period.month - 1]} ${period.year}`
    : statement.period;

  // 1. Ana kayıt
  const { data: stmtRow, error: stmtErr } = await supabase
    .from("bank_statements")
    .insert({
      user_id: userId,
      period: displayPeriod,
      period_year: period?.year ?? null,
      period_month: period?.month ?? null,
      account_number: statement.accountNumber,
      bank_name: statement.bankName,
      opening_balance: statement.openingBalance,
      closing_balance: statement.closingBalance,
      total_income: statement.totalIncome,
      total_expense: statement.totalExpense,
      file_name: fileName,
      file_url: storedFileUrl,
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

export const fetchAllUserBankTransactions = async (
  userId: string
): Promise<SavedTransaction[]> => {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("user_id", userId)
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

/**
 * Kayıtlı bir banka ekstresindeki tüm işlemleri, mevcut faturalarla yeniden eşleştirir
 * ve sonuçları veritabanına yazar. Geri dönen sayı: yeni kurulan eşleşme adedi.
 */
export const rematchSavedStatement = async (
  statementId: string,
  invoices: {
    id: string;
    invoice_number: string | null;
    supplier_name: string | null;
    supplier_vat_id?: string | null;
    supplier_iban?: string | null;
    supplier_creditor_id?: string | null;
    invoice_date: string | null;
    total_gross: number | null;
  }[]
): Promise<{ matched: number; total: number }> => {
  const { data: rows, error: fetchErr } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("statement_id", statementId);
  if (fetchErr) throw new Error(fetchErr.message);
  if (!rows || rows.length === 0) return { matched: 0, total: 0 };

  let matched = 0;
  console.log(`[rematch] ${rows.length} tx × ${invoices.length} invoices`);
  const unmatchedDebug: any[] = [];
  for (const row of rows) {
    const tx: BankTransaction = {
      id: row.id,
      date: row.transaction_date || "",
      description: row.description || "",
      amount: Number(row.amount) || 0,
      type: row.type || "expense",
      reference: row.reference || "",
      counterpart: row.counterpart || "",
      category: "",
      category_tr: "",
    };
    const m = matchTransactionToInvoices(tx, invoices);
    if (!m) {
      const cands = debugMatchCandidates(tx, invoices);
      unmatchedDebug.push({
        amount: tx.amount,
        date: tx.date,
        desc: (tx.description || "").slice(0, 80),
        counterpart: (tx.counterpart || "").slice(0, 40),
        topCandidates: cands,
      });
    }
    const { error: updErr } = await supabase
      .from("bank_transactions")
      .update({
        matched_invoice_id: m?.invoiceId ?? null,
        match_score: m?.score ?? null,
        match_reasons: m?.reasons ?? [],
      })
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);
    if (m) matched++;
  }
  console.log(`[rematch] result: ${matched}/${rows.length} matched`);
  console.log(`[rematch] === INVOICES IN SYSTEM (${invoices.length}) ===`);
  invoices.forEach((inv, i) => {
    console.log(`  INV#${i + 1} | ${String(inv.total_gross || 0).padStart(10)}EUR | ${inv.invoice_date || "no-date"} | ${(inv.supplier_name || "?").slice(0, 60)}`);
  });
  const withAmountMatch = unmatchedDebug.filter(d => d.topCandidates.length > 0);
  const noAmountMatch = unmatchedDebug.filter(d => d.topCandidates.length === 0);
  console.log(`[rematch] === NEAR MISS (${withAmountMatch.length} tx — tutar var, skor dusuk) ===`);
  withAmountMatch.forEach((d, i) => {
    console.log(`  NM#${i + 1} | ${d.amount}EUR | ${d.date} | ${d.counterpart} | ${d.desc}`);
    d.topCandidates.forEach((c: any, j: number) => {
      console.log(`       cand${j + 1} score=${c.score} supplier="${(c.supplier || "?").slice(0, 40)}" reasons=[${c.reasons.join(",")}]`);
    });
  });
  console.log(`[rematch] === NO AMOUNT MATCH (${noAmountMatch.length} tx — sistemde bu tutarda fatura yok) ===`);
  noAmountMatch.forEach((d, i) => {
    console.log(`  NA#${i + 1} | ${d.amount}EUR | ${d.date} | ${d.counterpart} | ${d.desc}`);
  });
  return { matched, total: rows.length };
};

/**
 * Tek bir kayıtlı banka işlemine manuel olarak fatura ata (veya kaldır).
 */
export const updateSavedTransactionMatch = async (
  txId: string,
  invoice: { id: string; supplier_name?: string | null } | null
): Promise<void> => {
  const { error } = await supabase
    .from("bank_transactions")
    .update({
      matched_invoice_id: invoice?.id ?? null,
      match_score: invoice ? 100 : null,
      match_reasons: invoice ? ["Manuel eşleştirme"] : [],
    })
    .eq("id", txId);
  if (error) throw new Error(error.message);
};

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
//  EŞLEŞTİRME (otomatik)
//  Kural: TUTAR eşleşmesi ZORUNLU, ek olarak
//         (Tedarikçi VKN/USt-IdNr) VEYA (Fatura/Referans No)
//         eşleşmesi gerekir.
//  Puanlama:
//    Tutar (±0.5%)         → 50 puan  (ZORUNLU)
//    VKN/USt-IdNr eşleşti  → 40 puan  (birincil sinyal)
//    Fatura/Referans no    → 40 puan  (birincil sinyal)
//    Tedarikçi adı         → 15 puan  (yardımcı)
//    Tarih ±7 gün          → 10 puan  (yardımcı)
//  Minimum eşik: 90 puan
//  → Tutar (50) + en az bir birincil sinyal (40) zorunlu.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  YENİ PUANLAMA (v2)
//  Tutar ±0.5%            → 40 puan (ZORUNLU gate)
//  Fuzzy tedarikçi adı     → 0..30 puan
//  Gläubiger-ID            → 25 puan
//  VKN / USt-IdNr          → 25 puan
//  Fatura / Referans no    → 25 puan
//  Mandat / Kundenreferenz → 15 puan
//  IBAN eşleşmesi          → 15 puan
//  Tarih ±14 gün (lineer)  → 0..10 puan
//  Kabul eşikleri:
//    ≥85 → "confident" (yeşil EŞLEŞTİ)
//    65..84 → "probable" (sarı DÜŞÜK GÜVEN — kullanıcı onayı)
//    <65 → reddedilir
// ─────────────────────────────────────────────
export const matchTransactionToInvoices = (
  tx: BankTransaction,
  invoices: {
    id: string;
    invoice_number: string | null;
    supplier_name: string | null;
    supplier_vat_id?: string | null;
    supplier_iban?: string | null;
    supplier_creditor_id?: string | null;
    invoice_date: string | null;
    total_gross: number | null;
  }[]
): MatchResult | null => {
  // Kendi hesaba para transferi (Eigenüberweisung / Umbuchung) → eşleşme YOK
  if (isSelfTransferTransaction(tx)) return null;

  let bestMatch: MatchResult | null = null;

  const txText = `${tx.description} ${tx.reference} ${tx.counterpart}`;
  const normTxText = normalize(txText);
  const txNumbers = extractNumbers(txText);
  const txVatIds = extractVatIds(txText);
  const txCreditorIds = extractCreditorIds(txText);
  const txMandateRefs = extractMandateRefs(txText);
  const txIbans = extractIbans(txText);

  const txVatNorm = txVatIds.map(v => v.replace(/\s+/g, "").toUpperCase());
  const txDigits = txText.replace(/\D/g, "");

  for (const inv of invoices) {
    const reasons: string[] = [];
    let score = 0;

    // ── ZORUNLU KAPI: Tutar eşleşmesi → 40 puan ──
    if (!amountMatches(tx.amount, inv.total_gross || 0)) continue;
    score += 40;
    reasons.push("Tutar eşleşti");

    // ── Fuzzy tedarikçi adı → 0..35 puan ──
    if (inv.supplier_name) {
      const nameRatio = fuzzySupplierScore(inv.supplier_name, txText);
      if (nameRatio > 0.15) {
        const pts = Math.round(nameRatio * 35);
        score += pts;
        reasons.push(`Tedarikçi adı (${Math.round(nameRatio * 100)}%)`);
      }
    }

    // ── Gläubiger-ID (SEPA Creditor ID) → 25 puan ──
    if (inv.supplier_creditor_id && txCreditorIds.length > 0) {
      const invCi = String(inv.supplier_creditor_id).replace(/\s+/g, "").toUpperCase();
      if (invCi.length >= 10 && txCreditorIds.some(c => c === invCi || c.includes(invCi) || invCi.includes(c))) {
        score += 25;
        reasons.push(`Gläubiger-ID eşleşti`);
      }
    }

    // ── VKN / USt-IdNr → 25 puan ──
    if (inv.supplier_vat_id) {
      const invVat = String(inv.supplier_vat_id).replace(/\s+/g, "").toUpperCase();
      const invVatDigits = invVat.replace(/\D/g, "");
      const vatHit =
        (invVat.length >= 6 && (txVatNorm.includes(invVat) || normTxText.toUpperCase().includes(invVat))) ||
        (invVatDigits.length >= 9 && txDigits.includes(invVatDigits));
      if (vatHit) {
        score += 25;
        reasons.push(`Vergi no eşleşti`);
      }
    }

    // ── Fatura / Referans no → 25 puan ──
    if (inv.invoice_number) {
      const refHit =
        textContains(txText, inv.invoice_number) ||
        (() => {
          const invNums = extractNumbers(inv.invoice_number!);
          return invNums.some(n => n.length >= 4 && txNumbers.some(t => t.includes(n) || n.includes(t)));
        })();
      if (refHit) {
        score += 25;
        reasons.push("Fatura/Referans no eşleşti");
      }
    }

    // ── Mandat / Kundenreferenz → 15 puan ──
    if (inv.invoice_number && txMandateRefs.length > 0) {
      const invNumUp = String(inv.invoice_number).toUpperCase();
      if (txMandateRefs.some(m => m.includes(invNumUp) || invNumUp.includes(m))) {
        score += 15;
        reasons.push("Mandatsreferenz eşleşti");
      }
    }

    // ── IBAN → 15 puan ──
    if (inv.supplier_iban && txIbans.length > 0) {
      const invIban = String(inv.supplier_iban).replace(/\s+/g, "").toUpperCase();
      if (invIban.length >= 15 && txIbans.includes(invIban)) {
        score += 15;
        reasons.push("IBAN eşleşti");
      }
    }

    // ── Tarih yakınlığı → 0..10 puan ──
    if (inv.invoice_date) {
      const dPts = dateProximityScore(tx.date, inv.invoice_date);
      if (dPts > 0) {
        score += dPts;
        reasons.push(`Tarih yakın (+${dPts})`);
      }
    }

    // Minimum "probable" eşiği
    if (score < 55) continue;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        supplierName: inv.supplier_name,
        score,
        reasons,
        tier: score >= 80 ? "confident" : "probable",
      };
    }
  }

  return bestMatch;
};

/**
 * Debug: eşik altında kalan en iyi aday dahil tüm adayların skorlarını döner.
 * rematchSavedStatement'tan çağrılır, console'a basılır.
 */
export const debugMatchCandidates = (
  tx: BankTransaction,
  invoices: {
    id: string;
    invoice_number: string | null;
    supplier_name: string | null;
    supplier_vat_id?: string | null;
    supplier_iban?: string | null;
    supplier_creditor_id?: string | null;
    invoice_date: string | null;
    total_gross: number | null;
  }[]
): { invId: string; supplier: string | null; score: number; reasons: string[] }[] => {
  const txText = `${tx.description} ${tx.reference} ${tx.counterpart}`;
  const candidates: { invId: string; supplier: string | null; score: number; reasons: string[] }[] = [];
  for (const inv of invoices) {
    if (!amountMatches(tx.amount, inv.total_gross || 0)) continue;
    let score = 40;
    const reasons: string[] = ["tutar"];
    if (inv.supplier_name) {
      const nameRatio = fuzzySupplierScore(inv.supplier_name, txText);
      if (nameRatio > 0) {
        const pts = Math.round(nameRatio * 35);
        score += pts;
        reasons.push(`ad:${Math.round(nameRatio * 100)}%`);
      }
    }
    if (inv.invoice_date) {
      const d = dateProximityScore(tx.date, inv.invoice_date);
      if (d > 0) { score += d; reasons.push(`tarih+${d}`); }
    }
    candidates.push({ invId: inv.id, supplier: inv.supplier_name, score, reasons });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 3);
};

// ─────────────────────────────────────────────
//  FATURA → BANKA DÖKÜMANI BAĞLANTISI
//  Bir faturaya eşleştirilmiş banka dökümanının
//  file_url'ini döndürür (yoksa null).
// ─────────────────────────────────────────────
export const getBankDocumentUrlForInvoice = async (
  invoiceId: string
): Promise<string | null> => {
  // 1. Bu faturaya eşleşen bank_transactions kaydını bul
  const { data: txRows, error: txErr } = await supabase
    .from("bank_transactions")
    .select("statement_id")
    .eq("matched_invoice_id", invoiceId)
    .limit(1);
  if (txErr || !txRows || txRows.length === 0) return null;

  const statementId = txRows[0].statement_id;

  // 2. İlgili bank_statements'ın file_url'ini al
  const { data: stmt, error: stmtErr } = await supabase
    .from("bank_statements")
    .select("file_url")
    .eq("id", statementId)
    .single();
  if (stmtErr || !stmt?.file_url) return null;

  return stmt.file_url;
};

/**
 * Birden fazla fatura ID'si için eşleşen benzersiz banka dökümanı URL'lerini döndürür.
 */
export const getBankDocumentUrlsForInvoices = async (
  invoiceIds: string[]
): Promise<string[]> => {
  if (invoiceIds.length === 0) return [];

  // bank_transactions tablosunda bu faturaları eşleşen satırları bul
  const { data: txRows, error: txErr } = await supabase
    .from("bank_transactions")
    .select("statement_id")
    .in("matched_invoice_id", invoiceIds);
  if (txErr || !txRows || txRows.length === 0) return [];

  // Benzersiz statement_id'leri al
  const stmtIds = [...new Set(txRows.map(r => r.statement_id))];

  // İlgili bank_statements'ların file_url'lerini al
  const { data: stmts, error: stmtErr } = await supabase
    .from("bank_statements")
    .select("file_url")
    .in("id", stmtIds);
  if (stmtErr || !stmts) return [];

  return stmts.map(s => s.file_url).filter((u): u is string => !!u);
};
