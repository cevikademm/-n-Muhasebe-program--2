import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { useLang } from "../LanguageContext";
import { Invoice } from "../types";
import {
  Building2, Upload, Loader2, TrendingUp, TrendingDown,
  CheckCircle2, XCircle, AlertCircle, Search, ChevronDown,
  Banknote, Save, Trash2, RefreshCw, ChevronRight, Download, FileText,
} from "lucide-react";
import { exportBankCSV } from "../services/exportService";
import {
  analyzeBankStatement,
  matchTransactionToInvoices,
  saveBankStatement,
  fetchBankStatements,
  deleteBankStatement,
  fetchStatementTransactions,
  rematchSavedStatement,
  updateSavedTransactionMatch,
  isRefundTransaction,
  isSelfTransferTransaction,
  BankStatement,
  MatchResult,
  SavedBankStatement,
  SavedTransaction,
} from "../services/bankService";
import {
  bankAnalysisStore,
  TxWithMatch,
} from "../services/bankAnalysisStore";
import { supabase } from "../services/supabaseService";
import { createUnmatchedNotifications } from "../services/notificationService";
// freePlanLimits importları kaldırıldı — abonelik sistemi devre dışı

// ─────────────────────────────────────────────
//  PROPS
// ─────────────────────────────────────────────
interface BankDocumentsPanelProps {
  propUserId?: string;
  invoices?: Invoice[];
}

// Invoice nesnesini farklı kaynaklar (top-level TR alanlar, raw_ai_response.fatura_bilgileri,
// raw_ai_response.header) arasında normalize ederek display alanlarını üretir.
const normalizeInvoiceDisplay = (inv: Invoice | null | undefined) => {
  if (!inv) return null;
  const fb = (inv as any).raw_ai_response?.fatura_bilgileri || (inv as any).raw_ai_response?.header || {};
  return {
    id: inv.id,
    invoice_number:
      (inv as any).invoice_number || inv.fatura_no || fb.invoice_number || fb.fatura_no || null,
    invoice_date:
      (inv as any).invoice_date || inv.tarih || fb.invoice_date || fb.tarih || null,
    supplier_name:
      (inv as any).supplier_name || (inv as any).satici_adi || fb.supplier_name || fb.satici_adi || inv.satici_vkn || null,
    total_net:
      (inv as any).total_net ?? inv.ara_toplam ?? fb.total_net ?? fb.ara_toplam ?? null,
    total_vat:
      (inv as any).total_vat ?? inv.toplam_kdv ?? fb.total_vat ?? fb.toplam_kdv ?? null,
    total_gross:
      (inv as any).total_gross ?? inv.genel_toplam ?? fb.total_gross ?? fb.genel_toplam ?? null,
    currency: (inv as any).currency || fb.currency || "EUR",
    status: inv.status,
  };
};

// ─────────────────────────────────────────────
//  YARDIMCILAR
// ─────────────────────────────────────────────
const fmtDE = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ── İşlem kontrol (checked) state — localStorage + subscription ──
const CHECKED_KEY = "muhasys_bank_tx_checked";
let checkedStore: Set<string> = (() => {
  try { return new Set(JSON.parse(localStorage.getItem(CHECKED_KEY) || "[]")); } catch { return new Set(); }
})();
const checkedListeners = new Set<() => void>();
const useCheckedSet = (): Set<string> => {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    checkedListeners.add(fn);
    return () => { checkedListeners.delete(fn); };
  }, []);
  return checkedStore;
};
const toggleChecked = (id: string) => {
  const next = new Set(checkedStore);
  if (next.has(id)) next.delete(id); else next.add(id);
  checkedStore = next;
  try { localStorage.setItem(CHECKED_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  checkedListeners.forEach(fn => fn());
};
const CheckCell: React.FC<{ id: string }> = ({ id }) => {
  const set = useCheckedSet();
  return (
    <input
      type="checkbox"
      checked={set.has(id)}
      onClick={(e) => e.stopPropagation()}
      onChange={() => toggleChecked(id)}
      style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "#10b981" }}
      title="Kontrol edildi"
    />
  );
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

const MONTH_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTH_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Kaydedilmiş ekstreden ay/yıl çıkar — period alanını önce dene
// Uzunluğa göre azalan sırada — kısa kısaltmalar uzun isimlerden sonra denenmeli
const PERIOD_MONTH_NAMES: [string, number][] = [
  // Almanca — uzun
  ["januar", 0], ["februar", 1], ["märz", 2], ["april", 3], ["mai", 4], ["juni", 5],
  ["juli", 6], ["august", 7], ["september", 8], ["oktober", 9], ["november", 10], ["dezember", 11],
  // Türkçe — uzun
  ["ocak", 0], ["şubat", 1], ["mart", 2], ["nisan", 3], ["mayıs", 4], ["haziran", 5],
  ["temmuz", 6], ["ağustos", 7], ["eylül", 8], ["ekim", 9], ["kasım", 10], ["aralık", 11],
  // İngilizce — uzun
  ["january", 0], ["february", 1], ["march", 2], ["june", 5], ["july", 6],
  ["october", 9], ["december", 11],
  // Almanca — kısa
  ["jan", 0], ["feb", 1], ["mär", 2], ["apr", 3], ["jun", 5], ["jul", 6],
  ["aug", 7], ["sep", 8], ["okt", 9], ["nov", 10], ["dez", 11],
  // Türkçe — kısa (oca/şub/nis/haz/tem/ağu/eyl/eki/kas/ara)
  ["oca", 0], ["şub", 1], ["nis", 3], ["haz", 5], ["tem", 6],
  ["ağu", 7], ["eyl", 8], ["eki", 9], ["kas", 10], ["ara", 11],
  // İngilizce / ortak kısa
  ["may", 4], ["mar", 2],
];
// Uzunluğa göre azalan sırala → "september" önce, "sep" sonra (false-positive önleme)
const SORTED_MONTH_NAMES = [...PERIOD_MONTH_NAMES].sort((a, b) => b[0].length - a[0].length);

const parseStmtDate = (s: SavedBankStatement): { year: number; month: number } => {
  const fallback = () => {
    const d = new Date(s.created_at);
    return { year: d.getFullYear(), month: d.getMonth() };
  };
  if (!s.period) return fallback();

  const lower = s.period.toLowerCase();

  // 1. Yıl bul
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (!yearMatch) return fallback();
  const year = parseInt(yearMatch[1]);

  // 2. Ay adı ara (uzun isimler önce)
  for (const [name, idx] of SORTED_MONTH_NAMES) {
    if (lower.includes(name)) return { year, month: idx };
  }

  // 3. "DD.MM.YYYY" veya "DD/MM/YYYY" tarih aralığından ayı çıkar (ör: "01.04.2025 - 30.04.2025")
  const dateRangeM = lower.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})/);
  if (dateRangeM) {
    const m = parseInt(dateRangeM[2]) - 1;
    const y = parseInt(dateRangeM[3]);
    if (m >= 0 && m <= 11) return { year: y, month: m };
  }

  // 4. "MM/YYYY" veya "MM.YYYY" veya "MM-YYYY"
  const mmYYYY = s.period.match(/\b(\d{1,2})[.\/\-](20\d{2})\b/);
  if (mmYYYY) {
    const m = parseInt(mmYYYY[1]) - 1;
    const y = parseInt(mmYYYY[2]);
    if (m >= 0 && m <= 11) return { year: y, month: m };
  }

  // 5. "YYYY-MM" veya "YYYY.MM"
  const yyyyMM = s.period.match(/\b(20\d{2})[.\-](\d{1,2})\b/);
  if (yyyyMM) {
    const m = parseInt(yyyyMM[2]) - 1;
    if (m >= 0 && m <= 11) return { year, month: m };
  }

  return fallback();
};

// ─────────────────────────────────────────────
//  ANA PANEL
// ─────────────────────────────────────────────
export const BankDocumentsPanel: React.FC<BankDocumentsPanelProps> = ({ propUserId, invoices: invoicesProp }) => {
  const invoices: any[] = invoicesProp || [];
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const fileRef = useRef<HTMLInputElement>(null);
  const MONTHS = lang === "tr" ? MONTH_TR : MONTH_DE;

  // ── Kalıcı analiz state (modül store'dan oku)
  const stored = bankAnalysisStore.get();
  const [analyzing, setAnalyzing] = useState(false);
  const [statement, setStatement] = useState<BankStatement | null>(stored.statement);
  const [txMatches, setTxMatches] = useState<TxWithMatch[]>(stored.txMatches);
  const [currentFileName, setCurrentFileName] = useState(stored.fileName);
  const [isSaved, setIsSaved] = useState(stored.isSaved);

  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  // Analiz sırasında 0→98% simülasyon, bitince 100%
  useEffect(() => {
    if (!analyzing) {
      if (progress > 0 && progress < 100) {
        setProgress(100);
        const t = setTimeout(() => setProgress(0), 900);
        return () => clearTimeout(t);
      }
      return;
    }
    setProgress(0);
    const stages: { target: number; step: number; interval: number; msg: string }[] = [
      { target: 15, step: 3, interval: 150, msg: tr("Dosya okunuyor...", "Datei wird gelesen...") },
      { target: 45, step: 2, interval: 220, msg: tr("Gemini AI'ya gönderiliyor...", "Wird an Gemini AI gesendet...") },
      { target: 80, step: 1, interval: 380, msg: tr("İşlemler analiz ediliyor...", "Transaktionen werden analysiert...") },
      { target: 95, step: 0.4, interval: 700, msg: tr("Faturalarla eşleştiriliyor...", "Rechnungen werden abgeglichen...") },
    ];
    let current = 0; let stageIdx = 0; let timerId: ReturnType<typeof setInterval>;
    const runStage = () => {
      if (stageIdx >= stages.length) return;
      const s = stages[stageIdx];
      setProgressMsg(s.msg);
      timerId = setInterval(() => {
        current = Math.min(current + s.step, s.target);
        setProgress(Math.round(current));
        if (current >= s.target) { clearInterval(timerId); stageIdx++; runStage(); }
      }, s.interval);
    };
    runStage();
    return () => clearInterval(timerId);
  }, [analyzing]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "income" | "expense" | "matched" | "unmatched" | "no_invoice">("all");
  const [search, setSearch] = useState("");
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [manualMatchTxId, setManualMatchTxId] = useState<string | null>(null);
  const [txKindOverrides, setTxKindOverrides] = useState<Record<string, "income" | "expense" | "refund">>({});
  const [matchStatusOverrides, setMatchStatusOverrides] = useState<Record<string, "matched" | "none" | "no_invoice">>(() => {
    try { return JSON.parse(localStorage.getItem("bank_match_overrides") || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("bank_match_overrides", JSON.stringify(matchStatusOverrides)); } catch {}
  }, [matchStatusOverrides]);

  // ── Arşiv state
  const [savedStatements, setSavedStatements] = useState<SavedBankStatement[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [expandedStmt, setExpandedStmt] = useState<string | null>(null);
  const [stmtTxs, setStmtTxs] = useState<Record<string, SavedTransaction[]>>({});
  const [loadingTxs, setLoadingTxs] = useState<string | null>(null);

  // ── Otomatik migration: "Kendi Hesap Transferi" (Eigenüberweisung) olan
  // tüm işlemleri — hem canlı analiz hem arşiv — "faturasız" olarak işaretle.
  // (Hook'lar txMatches ve stmtTxs tanımlandıktan SONRA çağrılmalı, aksi
  // halde TDZ ReferenceError → app crash.)
  useEffect(() => {
    setMatchStatusOverrides(prev => {
      const next = { ...prev };
      let changed = false;
      const markIfSelfTransfer = (tx: any) => {
        if (!tx || !tx.id) return;
        try { if (!isSelfTransferTransaction(tx)) return; } catch { return; }
        if (next[tx.id] === "matched") return;
        if (next[tx.id] !== "no_invoice") {
          next[tx.id] = "no_invoice";
          changed = true;
        }
      };
      try {
        (txMatches || []).forEach(t => markIfSelfTransfer(t?.tx));
        Object.values(stmtTxs || {}).forEach(rows => Array.isArray(rows) && rows.forEach(markIfSelfTransfer));
      } catch (e) {
        console.warn("[auto-faturasız] migration skipped:", e);
      }
      return changed ? next : prev;
    });
  }, [txMatches, stmtTxs]);

  // ── Banka Kesin Kurallar (counterpart → supplier eşleştirmesi)
  const BANK_RULES_KEY = "muhasys_bank_match_rules";
  const [bankRules, setBankRules] = useState<Array<{ counterpart: string; supplierKeyword: string; invoiceId: string; createdAt: string }>>(() => {
    try { return JSON.parse(localStorage.getItem("muhasys_bank_match_rules") || "[]"); } catch { return []; }
  });

  const saveAsKesinKural = useCallback((counterpart: string, supplierKeyword: string, invoiceId: string) => {
    setBankRules(prev => {
      const already = prev.some(r => r.counterpart.toLowerCase() === counterpart.toLowerCase());
      if (already) return prev;
      const updated = [...prev, { counterpart: counterpart.trim(), supplierKeyword, invoiceId, createdAt: new Date().toISOString() }];
      localStorage.setItem("muhasys_bank_match_rules", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Store'a sync et
  useEffect(() => {
    bankAnalysisStore.set({ statement, txMatches, fileName: currentFileName, isSaved });
  }, [statement, txMatches, currentFileName, isSaved]);

  // Session + kayıtlı ekstreler
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        loadSaved(session.user.id);
      }
    });
  }, []);

  const loadSaved = async (uid: string) => {
    setLoadingSaved(true);
    try {
      const rows = await fetchBankStatements(uid);
      setSavedStatements(rows);
    } catch { /* sessiz */ }
    finally { setLoadingSaved(false); }
  };

  // ── Fatura listesi (eşleştirme için)
  const invoiceList = useMemo(() =>
    invoices.map(inv => {
      const fb = (inv as any).raw_ai_response?.fatura_bilgileri || (inv as any).raw_ai_response?.header || {};
      return {
        id: inv.id,
        invoice_number: inv.fatura_no ?? (inv as any).invoice_number ?? fb.invoice_number ?? fb.fatura_no ?? null,
        supplier_name: (inv as any).satici_adi ?? (inv as any).supplier_name ?? fb.satici_adi ?? fb.supplier_name ?? null,
        supplier_vat_id: inv.satici_vkn ?? (inv as any).supplier_vat_id ?? fb.supplier_vat_id ?? fb.satici_vkn ?? null,
        supplier_iban: (inv as any).satici_iban ?? (inv as any).supplier_iban ?? fb.supplier_iban ?? fb.satici_iban ?? fb.iban ?? null,
        supplier_creditor_id: (inv as any).satici_glaeubiger_id ?? (inv as any).supplier_creditor_id ?? fb.creditor_id ?? fb.glaeubiger_id ?? fb.glaubiger_id ?? null,
        invoice_date: inv.tarih ?? (inv as any).invoice_date ?? fb.invoice_date ?? fb.tarih ?? null,
        total_gross: inv.genel_toplam ?? (inv as any).total_gross ?? fb.total_gross ?? fb.genel_toplam ?? 0,
      };
    }), [invoices]);

  // ── Dosya işle
  const handleFile = async (file: File) => {
    if (!file) return;

    // Abonelik kontrolleri kaldırıldı — sınırsız erişim

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError(tr("Sadece PDF dosyası yükleyebilirsiniz.", "Nur PDF-Dateien werden unterstützt."));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError(tr("Dosya boyutu 20MB'ı geçemez.", "Max. 20 MB."));
      return;
    }
    setError(null); setSuccessMsg(null);
    setAnalyzing(true); setStatement(null); setTxMatches([]); setIsSaved(false);
    setCurrentFileName(file.name);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await analyzeBankStatement(base64, "application/pdf");
      // Kesin kuralları localStorage'dan oku (güncel liste)
      const savedRules: Array<{ counterpart: string; supplierKeyword: string; invoiceId: string }> =
        JSON.parse(localStorage.getItem("muhasys_bank_match_rules") || "[]");

      const withMatches: TxWithMatch[] = result.transactions.map(tx => {
        // 1. Önce kesin kuralları dene
        if (tx.counterpart) {
          const rule = savedRules.find(r =>
            tx.counterpart.toLowerCase().includes(r.counterpart.toLowerCase())
          );
          if (rule) {
            const inv = invoiceList.find(i =>
              i.id === rule.invoiceId ||
              (i.supplier_name || "").toLowerCase().includes(rule.supplierKeyword.toLowerCase())
            );
            if (inv) {
              return {
                tx,
                match: {
                  invoiceId: String(inv.id),
                  invoiceNumber: inv.invoice_number,
                  supplierName: inv.supplier_name,
                  score: 100,
                  reasons: [tr("Kesin kural", "Feste Regel")],
                },
              };
            }
          }
        }
        // 2. AI tabanlı eşleştirme
        return { tx, match: matchTransactionToInvoices(tx, invoiceList) };
      });
      setStatement(result);
      setTxMatches(withMatches);

      // ── Otomatik kaydet
      const uid = userId ?? (await supabase.auth.getSession()).data.session?.user?.id ?? null;
      if (!uid) {
        setError(tr(
          "Oturum bulunamadı — ekstre kaydedilemedi. Lütfen tekrar giriş yapın.",
          "Keine Session — Kontoauszug nicht gespeichert. Bitte erneut anmelden."
        ));
      }
      if (uid) {
        let savedStmtId: string | null = null;
        try {
          savedStmtId = await saveBankStatement(result, withMatches, file.name, uid, file);
          setIsSaved(true);
          if (!userId) setUserId(uid);
          loadSaved(uid);
          setSuccessMsg(tr("Ekstre analiz edildi ve otomatik kaydedildi.", "Kontoauszug analysiert und automatisch gespeichert."));
        } catch (saveErr: any) {
          console.error("[AutoSave]", saveErr);
          setError(tr(
            `Ekstre kaydedilemedi: ${saveErr?.message || saveErr}`,
            `Kontoauszug konnte nicht gespeichert werden: ${saveErr?.message || saveErr}`
          ));
        }

        // ── Eşleşmeyen işlemler için bildirim oluştur
        try {
          const notifCount = await createUnmatchedNotifications(withMatches, savedStmtId, uid);
          if (notifCount > 0) {
            setSuccessMsg(tr(
              `Ekstre kaydedildi. ${notifCount} eşleşmeyen işlem için bildirim oluşturuldu.`,
              `Kontoauszug gespeichert. ${notifCount} Benachrichtigungen für nicht abgeglichene Transaktionen erstellt.`
            ));
          }
        } catch (notifErr: any) {
          console.error("[Notifications]", notifErr);
        }
      }
    } catch (e: any) {
      setError(e.message || tr("Analiz başarısız.", "Analyse fehlgeschlagen."));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { handleFile(file); e.target.value = ""; }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Kaydet
  const handleSave = async () => {
    if (!statement || !userId) return;
    setSaving(true); setError(null);
    try {
      await saveBankStatement(statement, txMatches, currentFileName, userId);
      setIsSaved(true);
      setSuccessMsg(tr("Ekstre kaydedildi.", "Kontoauszug gespeichert."));
      loadSaved(userId);
    } catch (e: any) {
      setError(e.message);
    } finally { setSaving(false); }
  };

  // ── Manuel eşleştirme güncelle
  const handleUpdateMatch = (txId: string, inv: Invoice | null) => {
    setTxMatches(prev => prev.map(item => {
      if (item.tx.id !== txId) return item;
      if (!inv) return { ...item, match: null };
      const newMatch: MatchResult = {
        invoiceId: String(inv.id),
        invoiceNumber: inv.invoice_number,
        supplierName: inv.supplier_name,
        score: 100,
        reasons: [tr("Manuel eşleştirme", "Manueller Abgleich")],
      };
      return { ...item, match: newMatch };
    }));
    setIsSaved(false);
    setManualMatchTxId(null);
  };

  // ── Kayıtlı ekstreyi mevcut faturalarla yeniden eşleştir
  const [rematchingId, setRematchingId] = useState<string | null>(null);
  const handleRematch = async (id: string) => {
    setRematchingId(id);
    setError(null); setSuccessMsg(null);
    try {
      const res = await rematchSavedStatement(id, invoiceList);
      // Cache'i tazele
      setStmtTxs(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      if (expandedStmt === id) {
        const rows = await fetchStatementTransactions(id);
        setStmtTxs(prev => ({ ...prev, [id]: rows }));
      }
      setSuccessMsg(tr(
        `Yeniden eşleştirme tamamlandı: ${res.matched}/${res.total} işlem eşleşti.`,
        `Neuabgleich abgeschlossen: ${res.matched}/${res.total} Buchungen abgeglichen.`
      ));
    } catch (e: any) {
      setError(e.message || tr("Yeniden eşleştirme başarısız.", "Neuabgleich fehlgeschlagen."));
    } finally {
      setRematchingId(null);
    }
  };

  // ── Sil
  const handleDelete = async (id: string) => {
    try {
      await deleteBankStatement(id);
      setSavedStatements(prev => prev.filter(s => s.id !== id));
      if (expandedStmt === id) setExpandedStmt(null);
    } catch (e: any) { setError(e.message); }
  };

  // ── Ekstre işlemlerini getir (arşivden)
  const loadStmtTxs = useCallback(async (id: string) => {
    if (stmtTxs[id]) { setExpandedStmt(prev => prev === id ? null : id); return; }
    setLoadingTxs(id);
    try {
      const rows = await fetchStatementTransactions(id);
      setStmtTxs(prev => ({ ...prev, [id]: rows }));
      setExpandedStmt(id);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingTxs(null); }
  }, [stmtTxs]);

  // ── Aktif analiz: seçili aya göre işlem filtresi
  // tx.date → YYYY-MM-DD; selectedMonth/Year ile eşleştir
  const monthTxMatches = useMemo(() => {
    if (!statement) return txMatches;
    return txMatches.filter(({ tx }) => {
      if (!tx.date) return true; // tarih yoksa göster
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return true;
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [txMatches, statement, selectedYear, selectedMonth]);

  // ── Aktif analiz: tip/eşleşme/arama filtresi (monthTxMatches üzerine)
  const filtered = useMemo(() => {
    let list = monthTxMatches;
    if (filter === "income") list = list.filter((t: TxWithMatch) => t.tx.type === "income");
    else if (filter === "expense") list = list.filter((t: TxWithMatch) => t.tx.type === "expense");
    else if (filter === "matched") list = list.filter((t: TxWithMatch) => {
      const ov = matchStatusOverrides[t.tx.id];
      if (ov === "matched") return true;
      if (ov === "none" || ov === "no_invoice") return false;
      return t.match !== null;
    });
    else if (filter === "no_invoice") list = list.filter((t: TxWithMatch) => matchStatusOverrides[t.tx.id] === "no_invoice");
    else if (filter === "unmatched") list = list.filter((t: TxWithMatch) => {
      const ov = matchStatusOverrides[t.tx.id];
      if (ov === "matched") return false;
      if (ov === "no_invoice") return false;
      if (ov === "none") return true;
      return t.match === null;
    });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(({ tx }) =>
        tx.description.toLowerCase().includes(q) ||
        tx.counterpart.toLowerCase().includes(q) ||
        tx.reference.toLowerCase().includes(q)
      );
    }
    return list;
  }, [monthTxMatches, filter, search, matchStatusOverrides]);

  // ── Arşiv: yıl/ay grupla
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    // Varsayılan: son 3 yılı her zaman göster (geçmiş ekstrelere erişim için)
    const years = new Set<number>([currentYear, currentYear - 1, currentYear - 2]);
    savedStatements.forEach(s => years.add(parseStmtDate(s).year));
    return Array.from(years).sort((a, b) => b - a);
  }, [savedStatements]);

  const monthCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    savedStatements
      .filter(s => parseStmtDate(s).year === selectedYear)
      .forEach(s => {
        const m = parseStmtDate(s).month;
        counts[m] = (counts[m] || 0) + 1;
      });
    return counts;
  }, [savedStatements, selectedYear]);

  const monthStatements = useMemo(() =>
    savedStatements.filter(s => {
      const p = parseStmtDate(s);
      return p.year === selectedYear && p.month === selectedMonth;
    }),
    [savedStatements, selectedYear, selectedMonth]
  );

  const matchedCount = monthTxMatches.filter((t: TxWithMatch) => {
    const ov = matchStatusOverrides[t.tx.id];
    if (ov === "matched") return true;
    if (ov === "none" || ov === "no_invoice") return false;
    return t.match !== null;
  }).length;
  const noInvoiceCount = monthTxMatches.filter((t: TxWithMatch) => matchStatusOverrides[t.tx.id] === "no_invoice").length;

  // Tüm eşleşmeyenleri faturasız işaretle (bulk)
  const markAllUnmatchedAsNoInvoice = () => {
    if (!window.confirm(tr(
      "Bu ekstredeki tüm eşleşmeyen işlemler 'Faturasız' olarak işaretlensin mi?",
      "Alle nicht abgeglichenen Buchungen als 'Ohne Rechnung' markieren?"
    ))) return;
    setMatchStatusOverrides(p => {
      const next = { ...p };
      monthTxMatches.forEach((t: TxWithMatch) => {
        const cur = next[t.tx.id];
        if (cur === "matched") return;
        // eşleşmeyi otomatik veya none olanları dönüştür
        if (t.match === null || cur === "none") next[t.tx.id] = "no_invoice";
      });
      return next;
    });
  };

  // ─── RENDER ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f1117", overflow: "hidden" }}>

      {/* HEADER */}
      <div style={{
        padding: "13px 16px", background: "#0d0f15",
        borderBottom: "1px solid #1c1f27", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "15px", color: "#cbd5e1" }}>
            <Building2 size={15} style={{ color: "#06b6d4" }} />
            {tr("Banka Dökümanı", "Bankdokumente")}
          </div>
          <div style={{ fontSize: "10px", color: "#374151", marginTop: "1px", fontFamily: "'DM Sans',sans-serif" }}>
            {tr("PDF ekstre yükle · Gemini AI ile analiz et · Faturalarla eşleştir", "Kontoauszug hochladen · Gemini AI analysiert · Rechnungen abgleichen")}
          </div>
        </div>
        <div style={{ display: "flex", gap: "7px" }}>
          {statement && !isSaved && (
            <button onClick={handleSave} disabled={saving} style={btnStyle("#10b981", saving)}>
              {saving ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> {tr("Kaydediliyor...", "Speichert...")}</> : <><Save size={12} /> {tr("Kaydet", "Speichern")}</>}
            </button>
          )}
          <button
            onClick={() => {
              fileRef.current?.click();
            }}
            disabled={analyzing}
            style={btnStyle("#06b6d4", analyzing)}
            title=""
          >
            {analyzing ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> {tr("Analiz...", "Analyse...")}</> : <><Upload size={12} /> {tr("Ekstre Yükle", "Hochladen")}</>}
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={handleFileChange} />
      </div>

      {/* Abonelik bannerları kaldırıldı — sınırsız erişim */}

      {/* İÇERİK */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "14px 16px" }}>

          {/* Mesajlar */}
          {error && <Msg type="error" text={error} />}
          {successMsg && <Msg type="success" text={successMsg} />}

          {/* ══ 1. ARŞİV BAŞLIĞI + YIL/AY FİLTRE SEKMELERİ ══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Arşiv başlığı — belirgin */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderRadius: "9px",
              background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.15)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Banknote size={15} style={{ color: "#06b6d4" }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", fontFamily: "'Syne',sans-serif" }}>
                    {tr("Arşiv", "Archiv")}
                  </div>
                  <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>
                    {tr("Kayıtlı banka ekstreleri", "Gespeicherte Kontoauszüge")} · {savedStatements.length} {tr("adet", "Einträge")}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {savedStatements.length > 0 && (
                  <button
                    onClick={() => exportBankCSV(savedStatements, stmtTxs, lang)}
                    title={tr("Tüm banka hareketlerini CSV olarak indir", "Alle Bankbewegungen als CSV herunterladen")}
                    style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)",
                      color: "#10b981", borderRadius: "6px", padding: "4px 9px",
                      fontSize: "11px", fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <Download size={11} />
                    CSV
                  </button>
                )}
                <button onClick={() => userId && loadSaved(userId)} style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: "3px" }}>
                  <RefreshCw size={11} style={loadingSaved ? { animation: "spin 1s linear infinite" } : {}} />
                </button>
              </div>
            </div>

            {/* YIL SEKMELERİ */}
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {availableYears.map(y => (
                <button key={y} onClick={() => setSelectedYear(y)} style={{
                  padding: "4px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 700,
                  fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
                  border: `1px solid ${selectedYear === y ? "#06b6d4" : "#1c1f27"}`,
                  background: selectedYear === y ? "rgba(6,182,212,.1)" : "transparent",
                  color: selectedYear === y ? "#06b6d4" : "#4b5563",
                }}>{y}</button>
              ))}
            </div>

            {/* AY SEKMELERİ */}
            <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
              {MONTHS.map((m, i) => {
                const cnt = monthCounts[i] || 0;
                const active = selectedMonth === i;
                return (
                  <button key={i} onClick={() => setSelectedMonth(i)} style={{
                    padding: "5px 9px", borderRadius: "6px", fontSize: "10px", fontWeight: 600,
                    fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
                    border: `1px solid ${active ? "#06b6d4" : "#1c1f27"}`,
                    background: active ? "rgba(6,182,212,.1)" : "transparent",
                    color: active ? "#06b6d4" : cnt > 0 ? "#6b7280" : "#2a3040",
                    position: "relative",
                  }}>
                    {m}
                    {cnt > 0 && (
                      <span style={{
                        position: "absolute", top: "-4px", right: "-4px",
                        width: "14px", height: "14px", borderRadius: "50%",
                        background: active ? "#06b6d4" : "#374151",
                        color: active ? "#fff" : "#9ca3af",
                        fontSize: "8px", fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══ 2. AKTİF ANALİZ BÖLÜMÜ ══ */}
          {!analyzing && !statement && (
            <div>
              <DropZone onDrop={handleDrop} onClick={() => { fileRef.current?.click(); }} tr={tr} />
            </div>
          )}
          {analyzing && <LoadingState tr={tr} progress={progress} progressMsg={progressMsg} fileName={currentFileName} />}
          {statement && !analyzing && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <SectionHeader label={tr("Aktif Analiz", "Aktive Analyse")} sub={currentFileName} />

              {/* ── Analiz Kartları ── */}
              <AnalysisCards statement={statement} txMatches={monthTxMatches} matchedCount={matchedCount} tr={tr} />

              {/* Filtreler + arama */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* ── Filtre Kartları ── */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {([
                    { key: "all", label: tr("Tümü", "Alle"), count: monthTxMatches.length, color: "#6b7280" },
                    { key: "income", label: tr("Gelir", "Einnahmen"), count: monthTxMatches.filter((t: TxWithMatch) => t.tx.type === "income").length, color: "#10b981" },
                    { key: "expense", label: tr("Gider", "Ausgaben"), count: monthTxMatches.filter((t: TxWithMatch) => t.tx.type === "expense").length, color: "#ef4444" },
                    { key: "matched", label: tr("Eşleşen", "Abgeglichen"), count: matchedCount, color: "#6366f1" },
                    { key: "no_invoice", label: tr("Faturasız", "Ohne Rg."), count: noInvoiceCount, color: "#3b82f6" },
                    { key: "unmatched", label: tr("Eşleşmeyen", "Nicht abgl."), count: monthTxMatches.length - matchedCount - noInvoiceCount, color: "#f59e0b" },
                  ] as const).map(f => {
                    const isActive = filter === f.key;
                    return (
                      <button key={f.key} onClick={() => setFilter(f.key)} style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start",
                        gap: "4px", padding: "10px 16px", borderRadius: "10px", flex: 1, minWidth: "80px",
                        border: `1px solid ${isActive ? f.color : f.color + "38"}`,
                        background: isActive ? `${f.color}1a` : `${f.color}0a`,
                        cursor: "pointer", transition: "all .15s",
                        boxShadow: isActive ? `0 0 12px ${f.color}22` : "none",
                      }}>
                        <span style={{
                          fontSize: "22px", fontWeight: 800, lineHeight: 1,
                          fontFamily: "'Syne',sans-serif",
                          color: isActive ? f.color : f.color + "bb",
                        }}>{f.count}</span>
                        <span style={{
                          fontSize: "10px", fontWeight: 700, letterSpacing: ".06em",
                          textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif",
                          color: isActive ? f.color : "#4b5563",
                        }}>{f.label}</span>
                      </button>
                    );
                  })}
                </div>
                {/* ── Arama ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={markAllUnmatchedAsNoInvoice}
                    title={tr("Tüm eşleşmeyenleri faturasız işaretle", "Alle nicht abgeglichenen als ohne Rechnung markieren")}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 7,
                      background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.35)",
                      color: "#3b82f6", fontSize: 10, fontWeight: 700,
                      fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
                    }}
                  >
                    <FileText size={11} />
                    {tr("Eşleşmeyenleri 'Faturasız' yap", "Nicht abgl. als 'Ohne Rg.'")}
                  </button>
                  <div className="glow-wrap" style={{ position: "relative", width: "180px" }}>
                    <Search size={10} className="glow-icon" style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
                    <input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                      placeholder={tr("Ara...", "Suchen...")}
                      style={{ paddingLeft: "26px", paddingRight: "8px", paddingTop: "5px", paddingBottom: "5px", color: "#9ca3af", fontSize: "11px", fontFamily: "'DM Sans',sans-serif", width: "100%" }}
                    />
                  </div>
                </div>
              </div>

              {/* İşlem tablosu */}
              <TxTable
                rows={filtered} isLiveAnalysis tr={tr}
                expandedId={expandedTx} onToggle={id => setExpandedTx(expandedTx === id ? null : id)}
                invoices={invoices}
                manualMatchTxId={manualMatchTxId}
                onToggleManualMatch={id => setManualMatchTxId(manualMatchTxId === id ? null : id)}
                onUpdateMatch={handleUpdateMatch}
                bankRules={bankRules}
                onSaveRule={saveAsKesinKural}
                kindOverrides={txKindOverrides}
                onChangeKind={(id, k) => setTxKindOverrides(p => ({ ...p, [id]: k }))}
                matchStatusOverrides={matchStatusOverrides}
                onChangeMatchStatus={(id, s) => setMatchStatusOverrides(p => {
                  const next = { ...p };
                  if (s === null) delete next[id]; else next[id] = s;
                  return next;
                })}
              />
            </div>
          )}

          {/* ══ 3. SEÇİLİ AY ARŞİV KAYITLARI ══ */}
          {monthStatements.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#2a3040", fontSize: "11px", fontFamily: "'DM Sans',sans-serif", border: "1px dashed #1c1f27", borderRadius: "8px" }}>
              {tr(`${MONTHS[selectedMonth]} ${selectedYear} için kayıtlı ekstre yok.`, `Kein Kontoauszug für ${MONTHS[selectedMonth]} ${selectedYear}.`)}
            </div>
          ) : (
            <div style={{ border: "1px solid #1c1f27", borderRadius: "9px", overflow: "hidden" }}>
             <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: "600px" }}>
              {/* Tablo başlığı */}
              <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "#0d0f15", borderBottom: "1px solid #1c1f27" }}>
                {[
                  { w: "130px", label: tr("Dönem", "Zeitraum") },
                  { w: "110px", label: tr("Banka", "Bank") },
                  { w: "110px", label: tr("Gelir", "Einnahmen"), align: "right" as const },
                  { w: "110px", label: tr("Gider", "Ausgaben"), align: "right" as const },
                  { w: "80px", label: tr("Kayıt Tarihi", "Datum") },
                  { w: "30px", label: "" },
                ].map((col, i) => (
                  <div key={i} style={{ width: col.w, textAlign: col.align || "left", fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em", flexShrink: 0 }}>
                    {col.label}
                  </div>
                ))}
              </div>

              {monthStatements.map((s, si) => (
                <div key={s.id}>
                  <div style={{
                    display: "flex", alignItems: "center", padding: "10px 12px",
                    borderBottom: si < monthStatements.length - 1 || expandedStmt === s.id ? "1px solid #141720" : "none",
                    background: expandedStmt === s.id ? "rgba(6,182,212,.04)" : "#0a0c11",
                    cursor: "pointer",
                  }} onClick={() => loadStmtTxs(s.id)}>
                    <div style={{ width: "130px", fontSize: "12px", color: "#9ca3af", fontFamily: "'DM Sans',sans-serif", fontWeight: 500, flexShrink: 0 }}>{s.period || "—"}</div>
                    <div style={{ width: "110px", fontSize: "10px", color: "#4b5563", fontFamily: "'DM Sans',sans-serif", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.bank_name || "—"}</div>
                    <div style={{ width: "110px", textAlign: "right", fontSize: "11px", color: "#10b981", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, flexShrink: 0 }}>+{fmtDE(s.total_income)} €</div>
                    <div style={{ width: "110px", textAlign: "right", fontSize: "11px", color: "#ef4444", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, flexShrink: 0 }}>-{fmtDE(s.total_expense)} €</div>
                    <div style={{ width: "80px", fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>{fmtDate(s.created_at)}</div>
                    <div style={{ width: "30px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                      {loadingTxs === s.id
                        ? <Loader2 size={11} style={{ color: "#374151", animation: "spin 1s linear infinite" }} />
                        : <ChevronDown size={11} style={{ color: "#374151", transform: expandedStmt === s.id ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                      }
                      {s.file_url && (
                        <a
                          href={s.file_url}
                          download={s.file_name || "bank-ekstre.pdf"}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title={tr("PDF indir", "PDF herunterladen")}
                          style={{ color: "#10b981", padding: "2px", lineHeight: 0, display: "inline-flex" }}
                        >
                          <Download size={11} />
                        </a>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleRematch(s.id); }}
                        disabled={rematchingId === s.id}
                        title={tr("Mevcut faturalarla yeniden eşleştir", "Mit aktuellen Rechnungen neu abgleichen")}
                        style={{ background: "none", border: "none", color: "#06b6d4", cursor: "pointer", padding: "2px", lineHeight: 0 }}
                      >
                        {rematchingId === s.id
                          ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                          : <RefreshCw size={11} />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} style={{ background: "none", border: "none", color: "#2a3040", cursor: "pointer", padding: "2px", lineHeight: 0 }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>

                  {expandedStmt === s.id && stmtTxs[s.id] && (
                    <div style={{ background: "#080a0e", borderBottom: si < monthStatements.length - 1 ? "1px solid #141720" : "none" }}>
                      <SavedStmtView
                        rows={stmtTxs[s.id]}
                        stmt={s}
                        tr={tr}
                        invoices={invoices}
                        matchStatusOverrides={matchStatusOverrides}
                        onChangeMatchStatus={(id, st) => setMatchStatusOverrides(p => {
                          const next = { ...p };
                          if (st === null) delete next[id]; else next[id] = st;
                          return next;
                        })}
                        onMarkAllUnmatchedAsNoInvoice={() => {
                          if (!window.confirm(tr(
                            "Bu ekstredeki tüm eşleşmeyen işlemler 'Faturasız' olarak işaretlensin mi?",
                            "Alle nicht abgeglichenen Buchungen als 'Ohne Rechnung' markieren?"
                          ))) return;
                          setMatchStatusOverrides(p => {
                            const next = { ...p };
                            (stmtTxs[s.id] || []).forEach(r => {
                              const cur = next[r.id];
                              if (cur === "matched") return;
                              if (!r.matched_invoice_id || cur === "none") next[r.id] = "no_invoice";
                            });
                            return next;
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
              </div>
             </div>
            </div>
          )}
        </div>{/* inner flex column */}
      </div>{/* scroll container */}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─────────────────────────────────────────────
//  AKTIF ANALİZ İŞLEM TABLOSU
// ─────────────────────────────────────────────
const TxTable: React.FC<{
  rows: TxWithMatch[];
  isLiveAnalysis: boolean;
  tr: (a: string, b: string) => string;
  expandedId: string | null;
  onToggle: (id: string) => void;
  invoices: Invoice[];
  manualMatchTxId: string | null;
  onToggleManualMatch: (id: string) => void;
  onUpdateMatch: (txId: string, inv: Invoice | null) => void;
  bankRules?: Array<{ counterpart: string; supplierKeyword: string; invoiceId: string }>;
  onSaveRule?: (counterpart: string, supplierKeyword: string, invoiceId: string) => void;
  kindOverrides?: Record<string, "income" | "expense" | "refund">;
  onChangeKind?: (id: string, kind: "income" | "expense" | "refund") => void;
  matchStatusOverrides?: Record<string, "matched" | "none" | "no_invoice">;
  onChangeMatchStatus?: (id: string, status: "matched" | "none" | "no_invoice" | null) => void;
}> = ({ rows, tr, expandedId, onToggle, invoices, manualMatchTxId, onToggleManualMatch, onUpdateMatch, bankRules = [], onSaveRule, kindOverrides = {}, onChangeKind, matchStatusOverrides = {}, onChangeMatchStatus }) => {
  const checkedSet = useCheckedSet();
  const usedInvoiceIds = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.match?.invoiceId) s.add(String(r.match.invoiceId)); });
    return s;
  }, [rows]);
  return (
  <div style={{ border: "1px solid #1c1f27", borderRadius: "9px", overflow: "hidden" }}>
   <div style={{ overflowX: "auto" }}>
    <div style={{ minWidth: "720px" }}>
    {/* Başlıklar */}
    <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "#0d0f15", borderBottom: "1px solid #1c1f27" }}>
      <ColHead w="84px">{tr("Tarih", "Datum")}</ColHead>
      <ColHead style={{ flex: 1 }}>{tr("Açıklama / Karşı Taraf", "Beschreibung / Gegenpartei")}</ColHead>
      <ColHead w="110px">{tr("Referans", "Referenz")}</ColHead>
      <ColHead w="105px" align="right" color="#ef4444">{tr("Gider", "Ausgabe")}</ColHead>
      <ColHead w="105px" align="right" color="#10b981">{tr("Gelir", "Einnahme")}</ColHead>
      <ColHead w="80px" align="center">{tr("Durum", "Status")}</ColHead>
      <ColHead w="50px" align="center">{tr("Kontrol", "Geprüft")}</ColHead>
      <div style={{ width: "18px" }} />
    </div>

    {rows.length === 0 && (
      <div style={{ padding: "28px", textAlign: "center", color: "#374151", fontSize: "11px", fontFamily: "'DM Sans',sans-serif" }}>
        {tr("Sonuç bulunamadı.", "Keine Ergebnisse.")}
      </div>
    )}

    {rows.map(({ tx, match }, idx) => {
      const defaultKind: "income" | "expense" | "refund" =
        tx.type === "income" ? (isRefundTransaction(tx) ? "refund" : "income") : "expense";
      const effectiveKind = kindOverrides[tx.id] ?? defaultKind;
      const isIncome = effectiveKind === "income" || effectiveKind === "refund";
      const autoHasMatch = !!match;
      const statusOverride = matchStatusOverrides[tx.id];
      const isSelfTransfer = isSelfTransferTransaction(tx);
      const hasMatch = statusOverride === "matched" ? true : statusOverride === "none" || statusOverride === "no_invoice" ? false : (isSelfTransfer ? false : autoHasMatch);
      const isNoInvoice = statusOverride === "no_invoice" || (!statusOverride && isSelfTransfer);
      const isExpanded = expandedId === tx.id;
      const matchedInvoice = autoHasMatch && match ? invoices.find(inv => String(inv.id) === String(match.invoiceId)) ?? null : null;

      return (
        <React.Fragment key={tx.id}>
          <div
            onClick={() => onToggle(tx.id)}
            style={{
              display: "flex", alignItems: "center", padding: "9px 12px",
              borderBottom: idx < rows.length - 1 || isExpanded ? "1px solid #141720" : "none",
              background: checkedSet.has(tx.id) ? "rgba(16,185,129,.12)" : hasMatch ? "rgba(99,102,241,.04)" : "#0a0c11",
              borderLeft: checkedSet.has(tx.id) ? "3px solid #10b981" : "3px solid transparent",
              cursor: "pointer",
            }}
          >
            <div style={{ width: "84px", fontSize: "10px", color: "#6b7280", fontFamily: "'DM Sans',sans-serif", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {fmtDate(tx.date)}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: "10px" }}>
              <div style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {tx.description || tx.counterpart || "—"}
              </div>
              {tx.counterpart && tx.counterpart !== tx.description && (
                <div style={{ fontSize: "10px", color: "#4b5563", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {tx.counterpart}
                </div>
              )}
            </div>
            <div style={{ width: "110px", fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: "6px" }}>
              {tx.reference || "—"}
            </div>
            <div style={{ width: "105px", textAlign: "right", fontSize: "11px", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: !isIncome ? "#ef4444" : "#1e2330", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {!isIncome ? `${fmtDE(Math.abs(tx.amount))} €` : ""}
            </div>
            <div style={{ width: "105px", textAlign: "right", fontSize: "11px", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: isIncome ? "#10b981" : "#1e2330", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {isIncome ? `${fmtDE(tx.amount)} €` : ""}
            </div>
            <div style={{ width: "80px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <StatusBadge hasMatch={hasMatch} isNoInvoice={isNoInvoice} score={match?.score} tier={match?.tier} tr={tr} isIncome={isIncome} isRefund={effectiveKind === "refund"} currentKind={effectiveKind} onChangeKind={onChangeKind ? (k) => onChangeKind(tx.id, k) : undefined} onChangeMatchStatus={onChangeMatchStatus ? (s) => onChangeMatchStatus(tx.id, s) : undefined} isOverridden={!!statusOverride} />
            </div>
            <div style={{ width: "50px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <CheckCell id={tx.id} />
            </div>
            <div style={{ width: "18px", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
              <ChevronDown size={11} style={{ color: "#374151", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </div>
          </div>

          {isExpanded && (
            <div style={{ padding: "10px 12px 12px", background: "#0d0f15", borderBottom: idx < rows.length - 1 ? "1px solid #141720" : "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
                {[
                  { l: tr("Tarih", "Datum"), v: fmtDate(tx.date) },
                  { l: tr("Tür", "Art"), v: isIncome ? (isRefundTransaction(tx) ? tr("İade", "Erstattung") : tr("Gelir", "Einnahme")) : tr("Gider", "Ausgabe") },
                  { l: tr("Tutar", "Betrag"), v: `${isIncome ? "+" : "-"}${fmtDE(Math.abs(tx.amount))} €` },
                  tx.counterpart ? { l: tr("Karşı Taraf", "Gegenpartei"), v: tx.counterpart } : null,
                  tx.reference ? { l: tr("Referans", "Referenz"), v: tx.reference } : null,
                ].filter(Boolean).map((r: any, i) => (
                  <div key={i}>
                    <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "2px" }}>{r.l}</div>
                    <div style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'DM Sans',sans-serif" }}>{r.v}</div>
                  </div>
                ))}
              </div>
              {tx.description && (
                <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif", padding: "7px 10px", borderRadius: "6px", border: "1px solid #1c1f27", background: "#0a0c11", lineHeight: 1.5 }}>
                  {tx.description}
                </div>
              )}
              {hasMatch && match && (
                <MatchDetail
                  match={match}
                  invoice={matchedInvoice}
                  tr={tr}
                  txCounterpart={tx.counterpart || ""}
                  isKesinKural={bankRules.some(r => (tx.counterpart || "").toLowerCase().includes(r.counterpart.toLowerCase()))}
                  onSaveRule={onSaveRule}
                />
              )}
              {(
                <>
                  {!hasMatch && manualMatchTxId !== tx.id && (
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>
                      <AlertCircle size={10} style={{ color: "#374151" }} />
                      {tr("Eşleşen fatura bulunamadı.", "Keine passende Rechnung gefunden.")}
                    </div>
                  )}
                  {/* Manuel eşleştirme butonu */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <button
                      onClick={e => { e.stopPropagation(); onToggleManualMatch(tx.id); }}
                      style={{ padding: "3px 10px", borderRadius: "5px", border: "1px solid #1c1f27", background: "transparent", color: manualMatchTxId === tx.id ? "#06b6d4" : "#4b5563", fontSize: "9px", fontFamily: "'DM Sans',sans-serif", cursor: "pointer", fontWeight: 600 }}
                    >
                      {manualMatchTxId === tx.id
                        ? tr("✕ Kapat", "✕ Schließen")
                        : hasMatch
                          ? tr("Eşleşmeyi Değiştir", "Abgleich ändern")
                          : tr("Manuel Eşleştir", "Manuell abgleichen")}
                    </button>
                  </div>
                </>
              )}
              {manualMatchTxId === tx.id && (
                <ManualMatchSelector
                  invoices={invoices}
                  tr={tr}
                  hasCurrentMatch={hasMatch}
                  onSelect={inv => onUpdateMatch(tx.id, inv)}
                  onClear={() => onUpdateMatch(tx.id, null)}
                  onClose={() => onToggleManualMatch(tx.id)}
                  usedInvoiceIds={usedInvoiceIds}
                  currentInvoiceId={match?.invoiceId ?? null}
                  txDate={tx.date ?? null}
                />
              )}
            </div>
          )}
        </React.Fragment>
      );
    })}
    </div>
   </div>
  </div>
  );
};

// ─────────────────────────────────────────────
//  ARŞİV EKSTRESİ GENİŞLETİLMİŞ GÖRÜNÜM
//  Özet kartlar + Gelir/Gider/Eşleşen/Eşleşmeyen filtre sekmeleri
// ─────────────────────────────────────────────
const SAVED_RESERV = /\bRESERV|\bVORMERK|\bPREAUTH|\bBLOKAJ/i;

const SavedStmtView: React.FC<{
  rows: SavedTransaction[];
  stmt: SavedBankStatement;
  tr: (a: string, b: string) => string;
  invoices?: Invoice[];
  matchStatusOverrides?: Record<string, "matched" | "none" | "no_invoice">;
  onChangeMatchStatus?: (id: string, status: "matched" | "none" | "no_invoice" | null) => void;
  onMarkAllUnmatchedAsNoInvoice?: () => void;
}> = ({ rows, stmt, tr, invoices = [], matchStatusOverrides = {}, onChangeMatchStatus, onMarkAllUnmatchedAsNoInvoice }) => {
  const [filter, setFilter] = useState<"all" | "income" | "expense" | "matched" | "unmatched" | "no_invoice">("all");

  // RESERV / Vormerkung girişlerini arşiv görünümünden de gizle
  const cleanRows = useMemo(() => rows.filter(r => {
    const desc = r.description || "";
    const ref = r.reference || "";
    const cp = r.counterpart || "";
    return !SAVED_RESERV.test(desc) && !SAVED_RESERV.test(ref) && !SAVED_RESERV.test(cp);
  }), [rows]);

  const isMatchedRow = (r: SavedTransaction) => {
    const ov = matchStatusOverrides[r.id];
    if (ov === "matched") return true;
    if (ov === "none" || ov === "no_invoice") return false;
    return !!r.matched_invoice_id;
  };
  const isNoInvoiceRow = (r: SavedTransaction) => matchStatusOverrides[r.id] === "no_invoice";

  const incomeRows = cleanRows.filter(r => r.type === "income");
  const expenseRows = cleanRows.filter(r => r.type === "expense");
  const matchedCount = cleanRows.filter(isMatchedRow).length;
  const noInvoiceCount = cleanRows.filter(isNoInvoiceRow).length;
  const unmatchedCount = cleanRows.length - matchedCount - noInvoiceCount;

  const filtered = useMemo(() => {
    if (filter === "income") return incomeRows;
    if (filter === "expense") return expenseRows;
    if (filter === "matched") return cleanRows.filter(isMatchedRow);
    if (filter === "no_invoice") return cleanRows.filter(isNoInvoiceRow);
    if (filter === "unmatched") return cleanRows.filter(r => !isMatchedRow(r) && !isNoInvoiceRow(r));
    return cleanRows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanRows, filter, incomeRows, expenseRows, matchStatusOverrides]);

  const FILTER_BTN_STYLE = (active: boolean, color: string): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: "7px",
    padding: "8px 16px", borderRadius: "10px",
    border: `1px solid ${active ? color : color + "55"}`,
    background: active ? `${color}22` : `${color}0d`,
    color: active ? color : color + "bb",
    fontSize: "12px", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
    boxShadow: active ? `0 0 14px ${color}28` : "none",
    transition: "all .15s",
  });
  const BADGE_STYLE = (active: boolean, color: string): React.CSSProperties => ({
    padding: "2px 8px", borderRadius: "6px",
    background: active ? `${color}30` : color + "22",
    fontSize: "12px", fontWeight: 800, fontFamily: "'Syne',sans-serif",
    color: active ? color : color + "cc",
  });

  return (
    <div>
      {/* ── Özet kartlar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "6px", padding: "10px 12px", background: "#07090d", borderBottom: "1px solid #141720" }}>
        {[
          { label: tr("Toplam Gelir", "Einnahmen"), val: `+${fmtDE(stmt.total_income)} €`, count: incomeRows.length, color: "#10b981" },
          { label: tr("Toplam Gider", "Ausgaben"), val: `-${fmtDE(stmt.total_expense)} €`, count: expenseRows.length, color: "#ef4444" },
          { label: tr("Eşleşen", "Abgeglichen"), val: String(matchedCount), count: null, color: "#6366f1" },
          { label: tr("Eşleşmeyen", "Offen"), val: String(unmatchedCount), count: null, color: "#f59e0b" },
        ].map(({ label, val, count, color }) => (
          <div key={label} style={{ padding: "8px 10px", borderRadius: "7px", border: "1px solid #1c1f27", background: "#0d0f15" }}>
            <div style={{ fontSize: "8px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: "4px" }}>
              {label}
            </div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "13px", color }}>{val}</div>
            {count !== null && (
              <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif", marginTop: "2px" }}>
                {count} {tr("işlem", "Buchungen")}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Filtre sekmeleri ── */}
      <div style={{ display: "flex", gap: "8px", padding: "10px 14px", flexWrap: "wrap" as const, background: "#07090d", borderBottom: "1px solid #141720", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
          {([
            { key: "all", label: tr("Tümü", "Alle"), count: cleanRows.length, color: "#6b7280" },
            { key: "income", label: tr("Gelir", "Einnahmen"), count: incomeRows.length, color: "#10b981" },
            { key: "expense", label: tr("Gider", "Ausgaben"), count: expenseRows.length, color: "#ef4444" },
            { key: "matched", label: tr("Eşleşen", "Abgeglichen"), count: matchedCount, color: "#6366f1" },
            { key: "no_invoice", label: tr("Faturasız", "Ohne Rg."), count: noInvoiceCount, color: "#3b82f6" },
            { key: "unmatched", label: tr("Eşleşmeyen", "Offen"), count: unmatchedCount, color: "#f59e0b" },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={FILTER_BTN_STYLE(filter === f.key, f.color)}>
              {f.label}
              <span style={BADGE_STYLE(filter === f.key, f.color)}>{f.count}</span>
            </button>
          ))}
        </div>
        {onMarkAllUnmatchedAsNoInvoice && (
          <button
            onClick={onMarkAllUnmatchedAsNoInvoice}
            title={tr("Tüm eşleşmeyenleri faturasız işaretle", "Alle nicht abgeglichenen als ohne Rechnung markieren")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8,
              background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.45)",
              color: "#3b82f6", fontSize: 11, fontWeight: 700,
              fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
            }}
          >
            <FileText size={12} />
            {tr("Eşleşmeyenleri 'Faturasız' yap", "Nicht abgl. → 'Ohne Rg.'")}
          </button>
        )}
      </div>

      {/* ── İşlem tablosu ── */}
      <SavedTxTable rows={filtered} tr={tr} invoices={invoices} matchStatusOverrides={matchStatusOverrides} onChangeMatchStatus={onChangeMatchStatus} />
    </div>
  );
};

// ─────────────────────────────────────────────
//  ARŞİV İŞLEM TABLOSU (kayıtlı veriden)
// ─────────────────────────────────────────────
const SavedTxTable: React.FC<{
  rows: SavedTransaction[];
  tr: (a: string, b: string) => string;
  invoices?: Invoice[];
  matchStatusOverrides?: Record<string, "matched" | "none" | "no_invoice">;
  onChangeMatchStatus?: (id: string, status: "matched" | "none" | "no_invoice" | null) => void;
}> = ({ rows, tr, invoices = [], matchStatusOverrides = {}, onChangeMatchStatus }) => {
  const checkedSet = useCheckedSet();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualMatchId, setManualMatchId] = useState<string | null>(null);
  // Local override haritası — DB güncellemesinden sonra anında yansıması için.
  const [overrides, setOverrides] = useState<Record<string, { matched_invoice_id: string | null; match_score: number | null; match_reasons: string[] }>>({});

  // Bu ekstrede zaten eşleşmiş fatura id'leri (uyarı göstermek için)
  const savedUsedInvoiceIds = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => {
      const ov = overrides[r.id];
      const id = ov ? ov.matched_invoice_id : r.matched_invoice_id;
      if (id) s.add(String(id));
    });
    return s;
  }, [rows, overrides]);

  const applyManualMatch = async (txId: string, inv: Invoice | null) => {
    try {
      await updateSavedTransactionMatch(txId, inv ? { id: inv.id } : null);
      setOverrides(p => ({
        ...p,
        [txId]: {
          matched_invoice_id: inv?.id ?? null,
          match_score: inv ? 100 : null,
          match_reasons: inv ? ["Manuel eşleştirme"] : [],
        },
      }));
    } catch (e: any) {
      alert(tr("Eşleştirme kaydedilemedi: ", "Abgleich fehlgeschlagen: ") + (e?.message || ""));
    }
  };

  return (
    <div>
      {/* Başlıklar */}
      <div style={{ display: "flex", alignItems: "center", padding: "7px 16px", borderBottom: "1px solid #141720" }}>
        <ColHead w="84px">{tr("Tarih", "Datum")}</ColHead>
        <ColHead style={{ flex: 1 }}>{tr("Açıklama", "Beschreibung")}</ColHead>
        <ColHead w="105px" align="right" color="#ef4444">{tr("Gider", "Ausgabe")}</ColHead>
        <ColHead w="105px" align="right" color="#10b981">{tr("Gelir", "Einnahme")}</ColHead>
        <ColHead w="80px" align="center">{tr("Durum", "Status")}</ColHead>
        <ColHead w="50px" align="center">{tr("Kontrol", "Geprüft")}</ColHead>
        <div style={{ width: "18px" }} />
      </div>
      {rows.map((txOrig, idx) => {
        const ov = overrides[txOrig.id];
        const tx: SavedTransaction = ov ? { ...txOrig, ...ov } : txOrig;
        const isIncome = tx.type === "income";
        const statusOv = matchStatusOverrides[tx.id];
        const autoHasMatch = !!tx.matched_invoice_id;
        const hasMatch = statusOv === "matched" ? true : (statusOv === "none" || statusOv === "no_invoice") ? false : autoHasMatch;
        const isNoInvoice = statusOv === "no_invoice";
        const isExpanded = expandedId === tx.id;
        const matchedInvoice = hasMatch
          ? invoices.find(inv => String(inv.id) === String(tx.matched_invoice_id)) ?? null
          : null;
        const matchedDisplay = normalizeInvoiceDisplay(matchedInvoice);

        return (
          <React.Fragment key={tx.id}>
            <div
              onClick={() => setExpandedId(isExpanded ? null : tx.id)}
              style={{
                display: "flex", alignItems: "center", padding: "8px 16px",
                borderBottom: idx < rows.length - 1 || isExpanded ? "1px solid #0d0f15" : "none",
                background: checkedSet.has(tx.id) ? "rgba(16,185,129,.12)" : isExpanded ? "rgba(99,102,241,.06)" : hasMatch ? "rgba(99,102,241,.03)" : "transparent",
                borderLeft: checkedSet.has(tx.id) ? "3px solid #10b981" : "3px solid transparent",
                cursor: "pointer",
              }}>
              <div style={{ width: "84px", fontSize: "10px", color: "#6b7280", fontFamily: "'DM Sans',sans-serif", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {fmtDate(tx.transaction_date)}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingRight: "10px" }}>
                <div style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {tx.description || tx.counterpart || "—"}
                </div>
                {tx.counterpart && tx.counterpart !== tx.description && (
                  <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{tx.counterpart}</div>
                )}
              </div>
              <div style={{ width: "105px", textAlign: "right", fontSize: "11px", color: !isIncome ? "#ef4444" : "#1e2330", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {!isIncome ? `${fmtDE(Math.abs(tx.amount || 0))} €` : ""}
              </div>
              <div style={{ width: "105px", textAlign: "right", fontSize: "11px", color: isIncome ? "#10b981" : "#1e2330", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {isIncome ? `${fmtDE(tx.amount || 0)} €` : ""}
              </div>
              <div style={{ width: "80px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
                <StatusBadge
                  hasMatch={hasMatch}
                  isNoInvoice={isNoInvoice}
                  score={tx.match_score ?? undefined}
                  tr={tr}
                  isIncome={isIncome}
                  isRefund={isIncome && isRefundTransaction(tx)}
                  onChangeMatchStatus={onChangeMatchStatus ? (s) => onChangeMatchStatus(tx.id, s) : undefined}
                  isOverridden={!!statusOv}
                />
              </div>
              <div style={{ width: "50px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
                <CheckCell id={tx.id} />
              </div>
              <div style={{ width: "18px", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                <ChevronDown size={11} style={{ color: hasMatch ? "#6366f1" : "#4b5563", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </div>
            </div>

            {/* Genişletilmiş alan */}
            {isExpanded && (
              <div style={{ padding: "10px 16px 12px", background: "#080a0e", borderBottom: idx < rows.length - 1 ? "1px solid #0d0f15" : "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                {hasMatch && (
                  <div style={{ padding: "8px 10px", borderRadius: "7px", border: "1px solid rgba(99,102,241,.18)", background: "rgba(99,102,241,.05)", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "9px", fontWeight: 700, color: "#6366f1", fontFamily: "'DM Sans',sans-serif" }}>{tr("Eşleşen Fatura", "Abgeglichene Rechnung")}</span>
                      {tx.match_score != null && (
                        <span style={{ fontSize: "9px", color: "#4b5563", fontFamily: "'DM Sans',sans-serif" }}>%{tx.match_score} {tr("güven", "Konfidenz")}</span>
                      )}
                    </div>
                    {tx.match_reasons && tx.match_reasons.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                        {tx.match_reasons.map((r, i) => (
                          <span key={i} style={{ padding: "1px 6px", borderRadius: "3px", background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.15)", fontSize: "9px", color: "#818cf8", fontFamily: "'DM Sans',sans-serif" }}>{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Fatura detayı */}
                {hasMatch && matchedDisplay ? (
                  <div style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(99,102,241,.2)", background: "#0d0f15", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid #1c1f27" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <CheckCircle2 size={12} style={{ color: "#6366f1" }} />
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#818cf8", fontFamily: "'DM Sans',sans-serif" }}>{matchedDisplay.supplier_name || "—"}</span>
                      </div>
                      <span style={{ padding: "2px 7px", borderRadius: "4px", background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)", fontSize: "9px", fontWeight: 700, color: "#10b981", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase" }}>
                        {matchedDisplay.status}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                      {[
                        { l: tr("Fatura No", "Rech.-Nr."), v: matchedDisplay.invoice_number ? `#${matchedDisplay.invoice_number}` : "—" },
                        { l: tr("Tarih", "Datum"), v: fmtDate(matchedDisplay.invoice_date) },
                        { l: tr("Net", "Netto"), v: matchedDisplay.total_net != null ? `${fmtDE(matchedDisplay.total_net)} €` : "—" },
                        { l: tr("KDV", "MwSt."), v: matchedDisplay.total_vat != null ? `${fmtDE(matchedDisplay.total_vat)} €` : "—" },
                        { l: tr("Brüt", "Brutto"), v: matchedDisplay.total_gross != null ? `${fmtDE(matchedDisplay.total_gross)} €` : "—" },
                        { l: tr("Para Birimi", "Währung"), v: matchedDisplay.currency || "EUR" },
                      ].map((row, i) => (
                        <div key={i}>
                          <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "2px" }}>{row.l}</div>
                          <div style={{ fontSize: "11px", color: i === 4 ? "#818cf8" : "#6b7280", fontFamily: "'DM Sans',sans-serif", fontWeight: i === 4 ? 700 : 400 }}>{row.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !hasMatch ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "#4b5563", fontFamily: "'DM Sans',sans-serif" }}>
                    <AlertCircle size={10} />
                    {tr("Eşleşen fatura bulunamadı.", "Keine passende Rechnung gefunden.")}
                  </div>
                ) : null}

                {/* Manuel eşleştirme — kendi hesap transferleri de faturasız sayılır */}
                {true && (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button
                    onClick={e => { e.stopPropagation(); setManualMatchId(manualMatchId === tx.id ? null : tx.id); }}
                    style={{ padding: "4px 11px", borderRadius: "5px", border: "1px solid rgba(99,102,241,.3)", background: manualMatchId === tx.id ? "rgba(99,102,241,.15)" : "transparent", color: manualMatchId === tx.id ? "#818cf8" : "#6366f1", fontSize: "10px", fontFamily: "'DM Sans',sans-serif", cursor: "pointer", fontWeight: 600 }}
                  >
                    {manualMatchId === tx.id
                      ? tr("✕ Kapat", "✕ Schließen")
                      : hasMatch
                        ? tr("Eşleşmeyi Değiştir", "Abgleich ändern")
                        : tr("Manuel Eşleştir", "Manuell abgleichen")}
                  </button>
                </div>
                )}
                {manualMatchId === tx.id && (
                  <ManualMatchSelector
                    invoices={invoices}
                    tr={tr}
                    hasCurrentMatch={hasMatch}
                    onSelect={(inv) => { applyManualMatch(tx.id, inv); setManualMatchId(null); }}
                    onClear={() => { applyManualMatch(tx.id, null); setManualMatchId(null); }}
                    onClose={() => setManualMatchId(null)}
                    currentInvoiceId={(overrides[tx.id]?.matched_invoice_id ?? tx.matched_invoice_id) ?? null}
                    usedInvoiceIds={savedUsedInvoiceIds}
                    txDate={tx.date ?? null}
                  />
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────
//  KÜÇÜK PAYLAŞILAN COMPONENTLER
// ─────────────────────────────────────────────

const ColHead: React.FC<{ children?: React.ReactNode; w?: string; align?: "left" | "right" | "center"; color?: string; style?: React.CSSProperties }> = ({ children, w, align = "left", color, style: extStyle }) => (
  <div style={{ width: w, textAlign: align, fontSize: "9px", fontWeight: 700, color: color || "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em", flexShrink: 0, ...extStyle }}>
    {children}
  </div>
);

// ─────────────────────────────────────────────
//  MANUEL EŞLEŞTİRME SEÇİCİ
// ─────────────────────────────────────────────
const ManualMatchSelector: React.FC<{
  invoices: Invoice[];
  tr: (a: string, b: string) => string;
  hasCurrentMatch: boolean;
  onSelect: (inv: Invoice) => void;
  onClear: () => void;
  onClose: () => void;
  usedInvoiceIds?: Set<string>;
  currentInvoiceId?: string | null;
  txDate?: string | null;
}> = ({ invoices, tr, hasCurrentMatch, onSelect, onClear, onClose, usedInvoiceIds, currentInvoiceId, txDate }) => {
  const [q, setQ] = useState("");

  // Manuel eşleştirme: kullanıcının kendi seçmesi için TÜM faturalar listelenir
  // (dönem filtresi yok), tutara göre büyükten küçüğe sıralanır.
  const allList = useMemo(() => {
    const valid = invoices.filter(inv => inv.status !== "duplicate");
    const lq = q.trim().toLowerCase();
    const filtered = valid.filter(inv => {
      if (!lq) return true;
      const d = normalizeInvoiceDisplay(inv)!;
      return (d.supplier_name || "").toLowerCase().includes(lq) ||
             (d.invoice_number || "").toLowerCase().includes(lq);
    });
    return filtered.sort((a, b) => {
      const ga = normalizeInvoiceDisplay(a)!.total_gross ?? 0;
      const gb = normalizeInvoiceDisplay(b)!.total_gross ?? 0;
      return gb - ga;
    });
  }, [invoices, q]);

  const renderRow = (inv: Invoice) => {
    const d = normalizeInvoiceDisplay(inv)!;
    const isCurrent = String(inv.id) === String(currentInvoiceId);
    const isUsedElsewhere = !isCurrent && !!usedInvoiceIds && usedInvoiceIds.has(String(inv.id));
    const bg = isCurrent
      ? "rgba(16,185,129,.12)"
      : isUsedElsewhere
        ? "rgba(249,115,22,.08)"
        : "#0d0f15";
    const border = isCurrent
      ? "1px solid rgba(16,185,129,.45)"
      : isUsedElsewhere
        ? "1px solid rgba(249,115,22,.35)"
        : "1px solid #141720";
    return (
      <div
        key={inv.id}
        onClick={() => { onSelect(inv); onClose(); }}
        title={isUsedElsewhere ? tr("Bu fatura başka bir hareketle eşleşmiş", "Diese Rechnung ist bereits einem anderen Vorgang zugeordnet") : ""}
        style={{ padding: "7px 9px", borderRadius: "6px", background: bg, border, cursor: "pointer", display: "flex", flexDirection: "column", gap: "3px", position: "relative" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: isCurrent ? "#10b981" : isUsedElsewhere ? "#fb923c" : "#9ca3af", fontFamily: "'DM Sans',sans-serif", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.supplier_name || "—"}
          </div>
          {isCurrent && (
            <span style={{ fontSize: "8px", fontWeight: 700, color: "#10b981", background: "rgba(16,185,129,.18)", border: "1px solid rgba(16,185,129,.4)", borderRadius: "3px", padding: "1px 5px", textTransform: "uppercase", letterSpacing: ".05em" }}>
              {tr("Seçili", "Aktiv")}
            </span>
          )}
          {isUsedElsewhere && (
            <span style={{ fontSize: "8px", fontWeight: 700, color: "#fb923c", background: "rgba(249,115,22,.15)", border: "1px solid rgba(249,115,22,.35)", borderRadius: "3px", padding: "1px 5px", textTransform: "uppercase", letterSpacing: ".05em" }}>
              {tr("Eşleşti", "Belegt")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {d.invoice_number && (
            <span style={{ fontSize: "9px", color: "#4b5563", fontFamily: "'DM Sans',sans-serif" }}>#{d.invoice_number}</span>
          )}
          <span style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{fmtDate(d.invoice_date)}</span>
          {d.total_gross != null && (
            <span style={{ fontSize: "9px", color: "#6366f1", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, marginLeft: "auto" }}>{fmtDE(d.total_gross)} €</span>
          )}
        </div>
      </div>
    );
  };

  // ESC ile kapat
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)", maxHeight: "82vh",
          border: "1px solid rgba(99,102,241,.35)", borderRadius: "14px",
          background: "#0a0c11",
          boxShadow: "0 24px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(99,102,241,.15)",
          padding: "16px", display: "flex", flexDirection: "column", gap: "10px",
          animation: "fadeIn .15s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#818cf8", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em" }}>
            {tr("Fatura Seç", "Rechnung auswählen")}
          </span>
          <button onClick={onClose} style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(255,255,255,.05)", border: "1px solid #1c1f27", color: "#6b7280", cursor: "pointer", fontSize: "13px", lineHeight: 1 }}>✕</button>
        </div>

      <input
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={tr("Tedarikçi adı veya fatura no...", "Lieferant oder Rechnungsnummer...")}
        style={{ padding: "5px 9px", borderRadius: "5px", border: "1px solid #1c1f27", background: "#080a0e", color: "#9ca3af", fontSize: "11px", fontFamily: "'DM Sans',sans-serif", outline: "none" }}
      />

      {hasCurrentMatch && (
        <button
          onClick={() => { onClear(); onClose(); }}
          style={{ padding: "5px 9px", borderRadius: "5px", border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.05)", color: "#ef4444", fontSize: "10px", fontFamily: "'DM Sans',sans-serif", cursor: "pointer", textAlign: "left", fontWeight: 600 }}
        >
          ✕ {tr("Eşleşmeyi Kaldır", "Abgleich entfernen")}
        </button>
      )}

      {/* Lejant */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "9px", fontFamily: "'DM Sans',sans-serif", color: "#4b5563" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "rgba(16,185,129,.3)", border: "1px solid rgba(16,185,129,.5)" }} />
          {tr("Şu an seçili", "Aktuell")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "rgba(249,115,22,.2)", border: "1px solid rgba(249,115,22,.45)" }} />
          {tr("Başka eşleşme var", "Bereits belegt")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#0d0f15", border: "1px solid #1c1f27" }} />
          {tr("Boşta", "Frei")}
        </span>
      </div>

      <div style={{ maxHeight: "70vh", minHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px" }}>
        {allList.length === 0 && (
          <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif", padding: "10px 0", textAlign: "center" }}>
            {tr("Fatura bulunamadı.", "Keine Rechnung gefunden.")}
          </div>
        )}

        {allList.length > 0 && (
          <div style={{ fontSize: "9px", fontWeight: 700, color: "#6366f1", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 2px 2px" }}>
            {tr(`Tüm faturalar (tutara göre)`, `Alle Rechnungen (nach Betrag)`)} · {allList.length}
          </div>
        )}
        {allList.map(renderRow)}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? ReactDOM.createPortal(modal, document.body)
    : modal;
};

type TxKind = "income" | "expense" | "refund";

const TypeSelect: React.FC<{
  value: TxKind;
  tr: (a: string, b: string) => string;
  onChange: (v: TxKind) => void;
}> = ({ value, tr, onChange }) => {
  const styles: Record<TxKind, { bg: string; border: string; color: string }> = {
    income:  { bg: "rgba(16,185,129,.12)", border: "rgba(16,185,129,.30)", color: "#10b981" },
    expense: { bg: "rgba(239,68,68,.12)",  border: "rgba(239,68,68,.30)",  color: "#ef4444" },
    refund:  { bg: "rgba(249,115,22,.12)", border: "rgba(249,115,22,.30)", color: "#f97316" },
  };
  const s = styles[value];
  return (
    <select
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value as TxKind); }}
      style={{
        appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
        padding: "2px 16px 2px 7px",
        borderRadius: "4px",
        background: `${s.bg} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(s.color)}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 4px center`,
        backgroundSize: "8px 8px",
        border: `1px solid ${s.border}`,
        color: s.color,
        fontSize: "8px",
        fontWeight: 700,
        fontFamily: "'DM Sans',sans-serif",
        cursor: "pointer",
        outline: "none",
      }}
    >
      <option value="income"  style={{ background: "#ffffff", color: "#10b981" }}>{tr("GELİR", "EINN.")}</option>
      <option value="expense" style={{ background: "#ffffff", color: "#ef4444" }}>{tr("GİDER", "AUSG.")}</option>
      <option value="refund"  style={{ background: "#ffffff", color: "#f97316" }}>{tr("İADE",  "ERST.")}</option>
    </select>
  );
};

const StatusBadge: React.FC<{
  hasMatch: boolean;
  isNoInvoice?: boolean;
  score?: number;
  tier?: "confident" | "probable";
  tr: (a: string, b: string) => string;
  isIncome?: boolean;
  isRefund?: boolean;
  currentKind?: TxKind;
  onChangeKind?: (v: TxKind) => void;
  onChangeMatchStatus?: (s: "matched" | "none" | "no_invoice" | null) => void;
  isOverridden?: boolean;
}> = ({ hasMatch, isNoInvoice, score, tier, tr, isIncome, isRefund, currentKind, onChangeKind, onChangeMatchStatus, isOverridden }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const isProbable = hasMatch && tier === "probable" && !isOverridden;
  const badgeBtn = isNoInvoice ? (
    <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "4px", background: "rgba(59,130,246,.14)", border: "1px solid rgba(59,130,246,.45)" }}>
      <FileText size={8} style={{ color: "#3b82f6" }} />
      <span style={{ fontSize: "8px", fontWeight: 800, color: "#3b82f6", fontFamily: "'DM Sans',sans-serif" }}>
        {tr("FATURASIZ", "OHNE RG.")}
      </span>
      {onChangeMatchStatus && <ChevronDown size={8} style={{ color: "#3b82f6" }} />}
    </div>
  ) : hasMatch ? (
    isProbable ? (
      <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "4px", background: "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.45)" }}>
        <AlertCircle size={8} style={{ color: "#f59e0b" }} />
        <span style={{ fontSize: "8px", fontWeight: 800, color: "#f59e0b", fontFamily: "'DM Sans',sans-serif" }}>
          {tr("OLASI", "MÖGL.")}{typeof score === "number" ? ` ${score}` : ""}
        </span>
        {onChangeMatchStatus && <ChevronDown size={8} style={{ color: "#f59e0b" }} />}
      </div>
    ) : (
      <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "4px", background: "rgba(16,185,129,.15)", border: `1px solid ${isOverridden ? "rgba(245,158,11,.55)" : "rgba(16,185,129,.35)"}` }}>
        <CheckCircle2 size={8} style={{ color: "#10b981" }} />
        <span style={{ fontSize: "8px", fontWeight: 800, color: "#10b981", fontFamily: "'DM Sans',sans-serif" }}>
          {tr("EŞLEŞTİ", "ABGL.")}
        </span>
        {onChangeMatchStatus && <ChevronDown size={8} style={{ color: "#10b981" }} />}
      </div>
    )
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "4px", background: "#0d0f15", border: `1px solid ${isOverridden ? "rgba(245,158,11,.55)" : "#1c1f27"}` }}>
      <AlertCircle size={8} style={{ color: "#374151" }} />
      <span style={{ fontSize: "8px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{tr("Yok", "Kein")}</span>
      {onChangeMatchStatus && <ChevronDown size={8} style={{ color: "#374151" }} />}
    </div>
  );

  const opt = (label: string, color: string, bg: string, onClick: () => void) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); setOpen(false); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6,
        width: "100%", padding: "6px 10px", border: "none", background: "transparent",
        color, fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
        cursor: "pointer", textAlign: "left",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = bg)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", position: "relative" }}>
      {/* Gelir/Gider/İade dropdown */}
      {onChangeKind && currentKind ? (
        <TypeSelect value={currentKind} tr={tr} onChange={onChangeKind} />
      ) : isIncome && (
        isRefund ? (
          <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "4px", background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.25)" }}>
            <span style={{ fontSize: "8px", fontWeight: 700, color: "#f97316", fontFamily: "'DM Sans',sans-serif" }}>
              {tr("İADE", "ERST.")}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "4px", background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.25)" }}>
            <span style={{ fontSize: "8px", fontWeight: 700, color: "#10b981", fontFamily: "'DM Sans',sans-serif" }}>
              {tr("GELİR", "EINN.")}
            </span>
          </div>
        )
      )}
      {/* Eşleşme durumu (clickable) */}
      {onChangeMatchStatus ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          {badgeBtn}
        </button>
      ) : badgeBtn}
      {open && onChangeMatchStatus && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 100,
            minWidth: 130, background: "#0d0f15", border: "1px solid #1c1f27",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.45)", overflow: "hidden",
          }}
        >
          {opt("✓ " + tr("EŞLEŞTİ", "ABGL."), "#10b981", "rgba(16,185,129,.1)", () => onChangeMatchStatus("matched"))}
          {opt("📄 " + tr("FATURASIZ", "OHNE RG."), "#3b82f6", "rgba(59,130,246,.1)", () => onChangeMatchStatus("no_invoice"))}
          {onChangeKind && opt("↩ " + tr("İADE", "ERSTATTUNG"), "#f97316", "rgba(249,115,22,.1)", () => onChangeKind("refund"))}
          {opt("○ " + tr("YOK", "KEIN"), "#9ca3af", "rgba(156,163,175,.1)", () => onChangeMatchStatus("none"))}
          {isOverridden && opt("⟲ " + tr("Otomatik", "Auto"), "#6b7280", "rgba(107,114,128,.1)", () => onChangeMatchStatus(null))}
        </div>
      )}
    </div>
  );
};

const MatchDetail: React.FC<{
  match: MatchResult;
  invoice: Invoice | null;
  tr: (a: string, b: string) => string;
  txCounterpart?: string;
  isKesinKural?: boolean;
  onSaveRule?: (counterpart: string, supplierName: string, invoiceId: string) => void;
}> = ({ match, invoice, tr, txCounterpart, isKesinKural, onSaveRule }) => {
  const [saved, setSaved] = useState(false);

  const handleSaveRule = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (txCounterpart && onSaveRule && match.invoiceId) {
      onSaveRule(txCounterpart, match.supplierName || "", match.invoiceId);
      setSaved(true);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Eşleşme özeti satırı */}
      <div style={{ padding: "8px 10px", borderRadius: "7px", border: "1px solid rgba(99,102,241,.18)", background: "rgba(99,102,241,.05)", display: "flex", flexDirection: "column", gap: "5px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "#6366f1", fontFamily: "'DM Sans',sans-serif" }}>{tr("Eşleşen Fatura", "Abgeglichene Rechnung")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "9px", color: "#4b5563", fontFamily: "'DM Sans',sans-serif" }}>%{match.score} {tr("güven", "Konfidenz")}</span>
            {/* Kesin kural durumu */}
            {isKesinKural ? (
              <span style={{ padding: "2px 8px", borderRadius: "4px", background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.25)", fontSize: "9px", fontWeight: 700, color: "#10b981", fontFamily: "'DM Sans',sans-serif" }}>
                ✓ {tr("Kesin Kural", "Feste Regel")}
              </span>
            ) : onSaveRule && txCounterpart ? (
              <button
                onClick={handleSaveRule}
                style={{
                  padding: "2px 8px", borderRadius: "4px", fontSize: "9px", fontWeight: 700,
                  fontFamily: "'DM Sans',sans-serif", cursor: saved ? "default" : "pointer",
                  border: saved ? "1px solid rgba(16,185,129,.3)" : "1px solid rgba(245,158,11,.3)",
                  background: saved ? "rgba(16,185,129,.08)" : "rgba(245,158,11,.08)",
                  color: saved ? "#10b981" : "#f59e0b",
                }}
              >
                {saved ? `✓ ${tr("Kaydedildi", "Gespeichert")}` : `★ ${tr("Kesin Kural Kaydet", "Als feste Regel")}`}
              </button>
            ) : null}
          </div>
        </div>
        <div style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}>
          {match.supplierName || "—"}
          {match.invoiceNumber && <span style={{ color: "#374151", fontWeight: 400, marginLeft: "6px" }}>#{match.invoiceNumber}</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
          {match.reasons.map((r, i) => (
            <span key={i} style={{ padding: "1px 6px", borderRadius: "3px", background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.15)", fontSize: "9px", color: "#818cf8", fontFamily: "'DM Sans',sans-serif" }}>{r}</span>
          ))}
        </div>
      </div>

      {/* Fatura detay — her zaman açık */}
      {invoice ? (() => {
        const d = normalizeInvoiceDisplay(invoice)!;
        return (
        <div style={{ padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(99,102,241,.2)", background: "#0d0f15", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #1c1f27" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={12} style={{ color: "#6366f1" }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#818cf8", fontFamily: "'DM Sans',sans-serif" }}>
                {d.supplier_name || "—"}
              </span>
            </div>
            <span style={{ padding: "2px 8px", borderRadius: "4px", background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)", fontSize: "9px", fontWeight: 700, color: "#10b981", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase" }}>
              {d.status}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
            {[
              { l: tr("Fatura No", "Rech.-Nr."), v: d.invoice_number ? `#${d.invoice_number}` : "—" },
              { l: tr("Fatura Tarihi", "Rechnungsdatum"), v: fmtDate(d.invoice_date) },
              { l: tr("Para Birimi", "Währung"), v: d.currency || "EUR" },
              { l: tr("Net Tutar", "Netto"), v: d.total_net != null ? `${fmtDE(d.total_net)} €` : "—" },
              { l: tr("KDV", "MwSt."), v: d.total_vat != null ? `${fmtDE(d.total_vat)} €` : "—" },
              { l: tr("Brüt Tutar", "Brutto"), v: d.total_gross != null ? `${fmtDE(d.total_gross)} €` : "—" },
            ].map((row, i) => (
              <div key={i}>
                <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "2px" }}>{row.l}</div>
                <div style={{ fontSize: "11px", color: i === 5 ? "#818cf8" : "#6b7280", fontFamily: "'DM Sans',sans-serif", fontWeight: i === 5 ? 700 : 400 }}>{row.v}</div>
              </div>
            ))}
          </div>
        </div>
        );
      })() : (
        <div style={{ padding: "10px 12px", borderRadius: "7px", border: "1px solid #1c1f27", background: "#0d0f15", fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>
          {tr("Fatura detayı bulunamadı.", "Rechnungsdetails nicht gefunden.")}
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; val: string; sub?: string; color: string }> = ({ label, val, sub, color }) => (
  <div style={{ padding: "10px 12px", borderRadius: "9px", border: "1px solid #1c1f27", background: "#0d0f15" }}>
    <div style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "5px" }}>{label}</div>
    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color }}>{val}</div>
    {sub && <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif", marginTop: "2px" }}>{sub}</div>}
  </div>
);

// ─────────────────────────────────────────────
//  GELİŞMİŞ ANALİZ KARTLARI
// ─────────────────────────────────────────────
const AnalysisCards: React.FC<{
  statement: BankStatement;
  txMatches: TxWithMatch[];
  matchedCount: number;
  tr: (a: string, b: string) => string;
}> = ({ statement, txMatches, matchedCount, tr }) => {
  const incomeCount = txMatches.filter(t => t.tx.type === "income").length;
  const expenseCount = txMatches.filter(t => t.tx.type === "expense").length;
  const unmatchedCount = txMatches.length - matchedCount;
  const matchRate = txMatches.length > 0 ? Math.round((matchedCount / txMatches.length) * 100) : 0;
  const netBalance = statement.totalIncome - statement.totalExpense;
  const isPositive = netBalance >= 0;

  // Eşleşen/Eşleşmeyen tutarlar
  const matchedAmount = txMatches.filter(t => t.match !== null).reduce((s, t) => s + Math.abs(t.tx.amount), 0);
  const unmatchedAmount = txMatches.filter(t => t.match === null).reduce((s, t) => s + Math.abs(t.tx.amount), 0);

  // Ortalama güven skoru (eşleşen işlemler)
  const matchedItems = txMatches.filter(t => t.match !== null);
  const avgScore = matchedItems.length > 0
    ? Math.round(matchedItems.reduce((s, t) => s + (t.match?.score || 0), 0) / matchedItems.length)
    : 0;

  // En büyük gider
  const expenseTxs = txMatches.filter(t => t.tx.type === "expense");
  const biggestExpense = expenseTxs.length > 0
    ? expenseTxs.reduce((a, b) => Math.abs(a.tx.amount) > Math.abs(b.tx.amount) ? a : b)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Satır 1 — Ana finansal özet */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
        {/* Dönem + Banka */}
        <div style={{ padding: "12px 14px", borderRadius: "9px", border: "1px solid #1c1f27", background: "#0d0f15", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em" }}>{tr("Dönem", "Zeitraum")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "13px", color: "#9ca3af" }}>{statement.period || "—"}</div>
          <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{statement.bankName || ""}</div>
          {statement.accountNumber && <div style={{ fontSize: "9px", color: "#2a3040", fontFamily: "'DM Sans',sans-serif", marginTop: "2px" }}>{statement.accountNumber}</div>}
          {(statement.openingBalance !== 0 || statement.closingBalance !== 0) && (
            <div style={{ display: "flex", gap: "6px", marginTop: "4px", paddingTop: "6px", borderTop: "1px solid #1c1f27" }}>
              <span style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{fmtDE(statement.openingBalance)} €</span>
              <span style={{ fontSize: "9px", color: "#1c1f27" }}>›</span>
              <span style={{ fontSize: "9px", color: "#9ca3af", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{fmtDE(statement.closingBalance)} €</span>
            </div>
          )}
        </div>

        {/* Gelir */}
        <div style={{ padding: "12px 14px", borderRadius: "9px", border: "1px solid rgba(16,185,129,.15)", background: "rgba(16,185,129,.04)", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
            <TrendingUp size={11} style={{ color: "#10b981" }} />
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em" }}>{tr("Toplam Gelir", "Einnahmen")}</span>
          </div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "16px", color: "#10b981" }}>+{fmtDE(statement.totalIncome)} €</div>
          <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{incomeCount} {tr("işlem", "Buchungen")}</div>
        </div>

        {/* Gider */}
        <div style={{ padding: "12px 14px", borderRadius: "9px", border: "1px solid rgba(239,68,68,.15)", background: "rgba(239,68,68,.04)", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
            <TrendingDown size={11} style={{ color: "#ef4444" }} />
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em" }}>{tr("Toplam Gider", "Ausgaben")}</span>
          </div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "16px", color: "#ef4444" }}>-{fmtDE(statement.totalExpense)} €</div>
          <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{expenseCount} {tr("işlem", "Buchungen")}</div>
        </div>

        {/* Net Bakiye */}
        <div style={{ padding: "12px 14px", borderRadius: "9px", border: `1px solid ${isPositive ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)"}`, background: isPositive ? "rgba(16,185,129,.04)" : "rgba(239,68,68,.04)", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "3px" }}>{tr("Net Bakiye", "Nettosaldo")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "16px", color: isPositive ? "#10b981" : "#ef4444" }}>
            {isPositive ? "+" : ""}{fmtDE(netBalance)} €
          </div>
          <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>
            {tr("Gelir − Gider", "Einnahmen − Ausgaben")}
          </div>
        </div>
      </div>

      {/* Satır 2 — Eşleştirme analizi */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "8px" }}>
        {/* Eşleşme oranı — progress bar'lı geniş kart */}
        <div style={{ padding: "12px 14px", borderRadius: "9px", border: "1px solid #1c1f27", background: "#0d0f15", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em" }}>{tr("Eşleşme Oranı", "Abgleichsquote")}</span>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "15px", color: matchRate >= 70 ? "#10b981" : matchRate >= 40 ? "#f59e0b" : "#ef4444" }}>%{matchRate}</span>
          </div>
          {/* Progress bar */}
          <div style={{ height: "5px", borderRadius: "3px", background: "#1c1f27", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: "3px", transition: "width .4s ease",
              width: `${matchRate}%`,
              background: matchRate >= 70 ? "#10b981" : matchRate >= 40 ? "#f59e0b" : "#ef4444",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <CheckCircle2 size={10} style={{ color: "#6366f1" }} />
              <span style={{ fontSize: "10px", color: "#6366f1", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{matchedCount} {tr("eşleşen", "abgeglichen")} · {fmtDE(matchedAmount)} €</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <AlertCircle size={10} style={{ color: "#f59e0b" }} />
              <span style={{ fontSize: "10px", color: "#f59e0b", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{unmatchedCount} {tr("eşleşmeyen", "offen")} · {fmtDE(unmatchedAmount)} €</span>
            </div>
          </div>
        </div>

        {/* Eşleşmeyen tutarı */}
        <div style={{ padding: "12px 14px", borderRadius: "9px", border: "1px solid rgba(245,158,11,.12)", background: "rgba(245,158,11,.04)", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "3px" }}>{tr("Eşleşmeyen Tutar", "Offene Beträge")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#f59e0b" }}>{fmtDE(unmatchedAmount)} €</div>
          <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{unmatchedCount} {tr("işlem", "Buchungen")}</div>
        </div>

        {/* Ortalama güven skoru */}
        <div style={{ padding: "12px 14px", borderRadius: "9px", border: "1px solid rgba(99,102,241,.12)", background: "rgba(99,102,241,.04)", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "3px" }}>{tr("Ort. Güven Skoru", "Ø Konfidenz")}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#818cf8" }}>%{avgScore}</div>
          <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{tr("eşleşen işlemler", "abgeglichene Buchungen")}</div>
        </div>

        {/* En büyük gider */}
        <div style={{ padding: "12px 14px", borderRadius: "9px", border: "1px solid #1c1f27", background: "#0d0f15", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, color: "#374151", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "3px" }}>{tr("En Büyük Gider", "Größte Ausgabe")}</div>
          {biggestExpense ? (
            <>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "13px", color: "#ef4444" }}>{fmtDE(Math.abs(biggestExpense.tx.amount))} €</div>
              <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {biggestExpense.tx.counterpart || biggestExpense.tx.description || "—"}
              </div>
            </>
          ) : (
            <div style={{ fontSize: "11px", color: "#2a3040", fontFamily: "'DM Sans',sans-serif" }}>—</div>
          )}
        </div>
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ label: string; sub?: string }> = ({ label, sub }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
    <span style={{ fontSize: "11px", fontWeight: 700, color: "#4b5563", fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</span>
    {sub && <span style={{ fontSize: "10px", color: "#2a3040", fontFamily: "'DM Sans',sans-serif" }}>{sub}</span>}
  </div>
);

const DropZone: React.FC<{ onDrop: (e: React.DragEvent) => void; onClick: () => void; tr: (a: string, b: string) => string }> = ({ onDrop, onClick, tr }) => {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onDrop={onDrop}
      onDragOver={(e: React.DragEvent) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        margin: "8px auto", padding: "52px 32px", borderRadius: "16px",
        border: `1.5px dashed ${hover ? "#06b6d4" : "#2a3040"}`,
        background: hover ? "rgba(6,182,212,.05)" : "rgba(6,182,212,.02)",
        cursor: "pointer", gap: "16px",
        transition: "border-color .2s, background .2s",
        maxWidth: "520px", width: "100%",
        boxShadow: hover ? "0 0 28px rgba(6,182,212,.07)" : "none",
      }}
    >
      {/* Glowing icon circle */}
      <div style={{
        width: "64px", height: "64px", borderRadius: "50%",
        background: hover ? "rgba(6,182,212,.12)" : "rgba(6,182,212,.06)",
        border: `1px solid ${hover ? "rgba(6,182,212,.35)" : "rgba(6,182,212,.12)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .2s",
      }}>
        <Banknote size={28} style={{ color: hover ? "#06b6d4" : "#2a3040", transition: "color .2s" }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "15px", color: hover ? "#94a3b8" : "#4b5563", marginBottom: "6px", transition: "color .2s" }}>
          {tr("PDF Ekstrenizi Yükleyin", "Kontoauszug hochladen")}
        </div>
        <div style={{ fontSize: "11px", color: "#374151", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6 }}>
          {tr("Dosyayı buraya sürükleyin veya tıklayarak seçin", "Datei hierher ziehen oder klicken zum Auswählen")}
        </div>
        <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 14px", borderRadius: "6px", border: "1px solid rgba(6,182,212,.2)", background: "rgba(6,182,212,.07)" }}>
          <Upload size={11} style={{ color: "#06b6d4" }} />
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", fontFamily: "'DM Sans',sans-serif", letterSpacing: ".04em" }}>PDF · maks. 20 MB</span>
        </div>
      </div>
    </div>
  );
};

const LoadingState: React.FC<{
  tr: (a: string, b: string) => string;
  progress?: number;
  progressMsg?: string;
  fileName?: string;
}> = ({ tr, progress = 0, progressMsg, fileName }) => (
  <div style={{
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    margin: "8px auto", padding: "52px 32px", borderRadius: "16px",
    border: "1.5px dashed rgba(6,182,212,.25)",
    background: "rgba(6,182,212,.03)",
    maxWidth: "520px", width: "100%",
    gap: "20px",
  }}>
    {/* Circular progress indicator */}
    <div style={{ position: "relative", width: "72px", height: "72px" }}>
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle cx="36" cy="36" r="30" fill="none" stroke="#1c1f27" strokeWidth="4" />
        {/* Progress arc */}
        <circle
          cx="36" cy="36" r="30" fill="none"
          stroke="#06b6d4" strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 30}`}
          strokeDashoffset={`${2 * Math.PI * 30 * (1 - progress / 100)}`}
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      {/* Percentage label */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "15px", color: "#06b6d4",
      }}>
        {progress}%
      </div>
    </div>

    {/* Text area */}
    <div style={{ textAlign: "center", width: "100%", maxWidth: "340px" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>
        {tr("Ekstre Analiz Ediliyor", "Analyse läuft")}
      </div>
      {fileName && (
        <div style={{ fontSize: "10px", color: "#2a3040", fontFamily: "'DM Sans',sans-serif", marginBottom: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fileName}
        </div>
      )}

      {/* Linear progress bar */}
      <div style={{ height: "4px", borderRadius: "2px", background: "#1c1f27", overflow: "hidden", marginBottom: "8px" }}>
        <div style={{
          height: "100%", borderRadius: "2px",
          background: "linear-gradient(90deg, #06b6d4, #6366f1)",
          width: `${progress}%`,
          transition: "width .4s ease",
        }} />
      </div>

      {/* Stage message */}
      <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'DM Sans',sans-serif", minHeight: "14px", transition: "opacity .3s" }}>
        {progressMsg || tr("Gemini AI işlemleri okuyor ve faturalarla eşleştiriyor", "Gemini AI liest Umsätze und gleicht mit Rechnungen ab")}
      </div>
    </div>
  </div>
);

const Msg: React.FC<{ type: "error" | "success"; text: string }> = ({ type, text }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 12px", borderRadius: "7px", border: `1px solid ${type === "error" ? "rgba(239,68,68,.2)" : "rgba(16,185,129,.2)"}`, background: type === "error" ? "rgba(239,68,68,.05)" : "rgba(16,185,129,.05)" }}>
    {type === "error" ? <XCircle size={13} style={{ color: "#ef4444", flexShrink: 0 }} /> : <CheckCircle2 size={13} style={{ color: "#10b981", flexShrink: 0 }} />}
    <span style={{ fontSize: "11px", color: type === "error" ? "#ef4444" : "#10b981", fontFamily: "'DM Sans',sans-serif" }}>{text}</span>
  </div>
);

const filterBtn = (active: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: "4px",
  padding: "4px 9px", borderRadius: "6px",
  border: `1px solid ${active ? "#06b6d4" : "#1c1f27"}`,
  background: active ? "rgba(6,182,212,.08)" : "transparent",
  color: active ? "#06b6d4" : "#374151",
  fontSize: "10px", fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
  cursor: "pointer",
});

const CountBadge: React.FC<{ n: number; active: boolean }> = ({ n, active }) => (
  <span style={{ padding: "0 5px", borderRadius: "3px", background: active ? "rgba(6,182,212,.15)" : "#1c1f27", fontSize: "9px", color: active ? "#06b6d4" : "#374151" }}>{n}</span>
);

const btnStyle = (color: string, disabled: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: "6px",
  padding: "7px 13px", borderRadius: "7px",
  border: `1px solid ${color}35`,
  background: `${color}0a`,
  color: disabled ? "#374151" : color,
  fontSize: "11px", fontWeight: 600,
  fontFamily: "'DM Sans',sans-serif",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
});
