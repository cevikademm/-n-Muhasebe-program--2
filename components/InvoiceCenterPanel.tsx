import React, { useState, useRef, useMemo, useEffect } from "react";
import { useLang } from "../LanguageContext";
import { Invoice, InvoiceItem } from "../types";
import {
  Upload, Search, Loader2, FileText, Calendar, Clock,
  AlertCircle, ChevronDown, ChevronUp, Building2,
  AlertTriangle, Package, TrendingUp, Crown, Trash2, PlusCircle, Copy, Edit3, RefreshCw,
} from "lucide-react";
import { ManualInvoiceModal, ManualInvoiceInitial } from "./ManualInvoiceModal";
// freePlanLimits importları kaldırıldı — abonelik sistemi devre dışı

interface InvoiceCenterPanelProps {
  invoices: Invoice[];
  loading: boolean;
  uploading: boolean;
  selectedInvoice: Invoice | null;
  onSelectInvoice: (invoice: Invoice | null) => void;
  onUpload: (files: File[]) => void;
  fetchItems: (invoiceId: string) => Promise<InvoiceItem[]>;
  onAccountClick?: (item: any) => void;
  onDelete?: (invoice: Invoice) => void | Promise<void>;
  onCreateManual?: (payload: any) => Promise<void>;
  onUpdateInvoice?: (invoiceId: string, updates: Partial<Invoice>) => void;
  onUpdateInvoiceItems?: (invoiceId: string, items: any[]) => void;
  userId?: string;
  userRole?: string;
  onReanalyze?: (invoice: Invoice) => Promise<void>;
}

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " \u20AC";

const STATUS_MAP: Record<string, { label: [string, string]; color: string; bg: string }> = {
  analyzed: { label: ["Analiz Edildi", "Analysiert"], color: "#10b981", bg: "rgba(16,185,129,.12)" },
  check: { label: ["Kontrol Gerekli", "Pr\u00fcfung"], color: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  error: { label: ["Hata", "Fehler"], color: "#ef4444", bg: "rgba(239,68,68,.12)" },
};

export const InvoiceCenterPanel: React.FC<InvoiceCenterPanelProps> = ({
  invoices, loading, uploading, selectedInvoice, onSelectInvoice, onUpload, fetchItems, onAccountClick,
  onDelete, onCreateManual, onUpdateInvoice, onUpdateInvoiceItems, userId, userRole, onReanalyze,
}) => {
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const isAdmin = userRole === "admin";

  const handleReanalyze = async (invoice: Invoice) => {
    if (!onReanalyze) return;
    if (!window.confirm(tr(
      `Bu fatura Claude Haiku 4.5 ile yeniden analiz edilecek. Mevcut alanlar (manuel düzenlemeler dahil) üzerine yazılacak. Devam edilsin mi?\n\n${invoice.fatura_no || "(no)"}`,
      `Diese Rechnung wird mit Claude Haiku 4.5 neu analysiert. Bestehende Werte (auch manuelle Änderungen) werden überschrieben. Fortfahren?\n\n${invoice.fatura_no || "(ohne Nr.)"}`
    ))) return;
    setReanalyzingId(invoice.id);
    try {
      await onReanalyze(invoice);
    } catch (e: any) {
      alert(tr("Tekrar analiz hatası: ", "Re-Analyse Fehler: ") + (e?.message || e));
    } finally {
      setReanalyzingId(null);
    }
  };
  // Inline edit handler for an item's account code
  const handleEditItemAccount = (invoice: Invoice, item: any, idx: number, allItems: any[]) => {
    const desc = item.description || item.urun_adi || "";
    const oldCode = item.account_code || item.hesap_kodu || "";
    const newCode = window.prompt(`'${desc}' icin yeni Hesap Kodu:\n\nOnceki: ${oldCode}`, String(oldCode));
    if (newCode === null) return;
    const trimmed = newCode.trim();
    if (!trimmed || trimmed === oldCode) return;
    const updated = allItems.map((it: any, i: number) => {
      if (i !== idx) return it;
      return {
        ...it,
        account_code: trimmed,
        hesap_kodu: trimmed,
        user_modified: true,
        user_modified_at: new Date().toISOString(),
        user_modified_field: "account_code",
        user_modified_old: oldCode,
      };
    });
    onUpdateInvoiceItems?.(invoice.id, updated);
  };

  // Inline edit handler for an item's gross amount
  const handleEditItemAmount = (invoice: Invoice, item: any, idx: number, allItems: any[]) => {
    const desc = item.description || item.urun_adi || "";
    const oldGross = Number(item.gross_amount ?? item.satir_toplami ?? 0);
    const newStr = window.prompt(`'${desc}' icin yeni Toplam (Brutto, EUR):\n\nOnceki: ${oldGross}`, String(oldGross));
    if (newStr === null) return;
    const newAmt = parseFloat(String(newStr).replace(",", "."));
    if (isNaN(newAmt) || newAmt === oldGross) return;
    const updated = allItems.map((it: any, i: number) => {
      if (i !== idx) return it;
      const qty = Number(it.quantity || it.miktar || 1) || 1;
      const vatRate = Number(it.vat_rate || it.kdv_orani || 0);
      const net = +(newAmt / (1 + vatRate / 100)).toFixed(2);
      const vat = +(newAmt - net).toFixed(2);
      return {
        ...it,
        gross_amount: newAmt,
        satir_toplami: newAmt,
        net_amount: net,
        net_tutar: net,
        vat_amount: vat,
        unit_price: +(net / qty).toFixed(2),
        user_modified: true,
        user_modified_at: new Date().toISOString(),
        user_modified_field: "gross_amount",
        user_modified_old: oldGross,
      };
    });
    onUpdateInvoiceItems?.(invoice.id, updated);
  };

  // Inline edit for invoice totals
  const handleEditTotal = (invoice: Invoice, field: "ara_toplam" | "toplam_kdv" | "genel_toplam", label: string) => {
    const oldVal = Number((invoice as any)[field] || 0);
    const newStr = window.prompt(`${label} icin yeni deger (EUR):\n\nOnceki: ${oldVal}`, String(oldVal));
    if (newStr === null) return;
    const newAmt = parseFloat(String(newStr).replace(",", "."));
    if (isNaN(newAmt) || newAmt === oldVal) return;
    onUpdateInvoice?.(invoice.id, {
      [field]: newAmt,
      user_modified_totals: true,
      user_modified_totals_at: new Date().toISOString(),
    } as any);
  };

  const [manualOpen, setManualOpen] = useState(false);
  const [manualInitial, setManualInitial] = useState<ManualInvoiceInitial | null>(null);

  // Dönem seçim modalı state
  const [periodPickerInvoice, setPeriodPickerInvoice] = useState<Invoice | null>(null);
  const [periodPickerYear, setPeriodPickerYear] = useState<number>(new Date().getFullYear());

  const applyPeriodMonth = (invoice: Invoice, year: number, monthIdx: number) => {
    const start = new Date(Date.UTC(year, monthIdx, 1));
    const end = new Date(Date.UTC(year, monthIdx + 1, 0));
    const ts = start.toISOString().substring(0, 10);
    const te = end.toISOString().substring(0, 10);
    const raw = invoice.raw_ai_response || {};
    const newFb = { ...(raw.fatura_bilgileri || raw.header || {}), period_start: ts, period_end: te };
    const newRaw = {
      ...raw,
      fatura_bilgileri: newFb,
      header: { ...(raw.header || {}), period_start: ts, period_end: te },
    };
    onUpdateInvoice?.(invoice.id, {
      raw_ai_response: newRaw,
      user_modified_period: true,
      user_modified_period_at: new Date().toISOString(),
    } as any);
    setPeriodPickerInvoice(null);
  };

  const clearPeriod = (invoice: Invoice) => {
    const raw = invoice.raw_ai_response || {};
    const newFb = { ...(raw.fatura_bilgileri || raw.header || {}), period_start: null, period_end: null };
    const newRaw = {
      ...raw,
      fatura_bilgileri: newFb,
      header: { ...(raw.header || {}), period_start: null, period_end: null },
    };
    onUpdateInvoice?.(invoice.id, { raw_ai_response: newRaw } as any);
    setPeriodPickerInvoice(null);
  };

  // Manuel fatura için sonraki numarayı üret: YYYYMM### (örn: 202604001)
  // Hedef ay içinde mevcut manuel faturalardan en yüksek sırayı bulup +1.
  const generateManualNumber = (targetDate: string) => {
    const d = targetDate ? new Date(targetDate) : new Date();
    if (isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const prefix = `${yyyy}${mm}`;
    let maxSeq = 0;
    for (const inv of invoices) {
      const isManual = inv.raw_ai_response?.manual === true || inv.raw_ai_response?.fatura_bilgileri?.manual_entry === true;
      if (!isManual) continue;
      const no = inv.fatura_no || "";
      if (no.startsWith(prefix) && no.length >= prefix.length + 1) {
        const seq = parseInt(no.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
  };

  const openManualFresh = () => {
    setManualInitial({ fatura_no: generateManualNumber(new Date().toISOString().substring(0, 10)) });
    setManualOpen(true);
  };

  const openManualCopy = (inv: Invoice) => {
    const fb = inv.raw_ai_response?.fatura_bilgileri || inv.raw_ai_response?.header || {};
    const rawItems = inv.raw_ai_response?.items || inv.raw_ai_response?.kalemler || [];
    const newDate = new Date().toISOString().substring(0, 10);
    setManualInitial({
      fatura_no: generateManualNumber(newDate),
      tarih: newDate,
      donem_baslangic: fb.period_start || "",
      donem_bitis: fb.period_end || "",
      satici_adi: fb.supplier_name || inv.satici_adi || "",
      satici_vkn: fb.supplier_vat_id || inv.satici_vkn || "",
      satici_adres: fb.supplier_address || inv.satici_adres || "",
      alici_adi: fb.buyer_name || inv.alici_adi || "",
      alici_vkn: fb.buyer_vat_id || inv.alici_vkn || "",
      alici_adres: fb.buyer_address || inv.alici_adres || "",
      items: rawItems.map((it: any) => ({
        urun_adi: it.description || it.urun_adi || "",
        miktar: Number(it.quantity || it.miktar || 1),
        kdv_orani: Number(it.vat_rate || it.kdv_orani || 0),
        net: Number(it.net_amount || 0),
        gross: Number(it.gross_amount || it.satir_toplami || 0),
        hesap_kodu: it.account_code || it.hesap_kodu || "",
        hesap_adi: it.account_name || it.account_name_tr || "",
      })),
    });
    setManualOpen(true);
  };
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const fileRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"recent" | "calendar">("recent");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const months = lang === "tr"
    ? ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"]
    : ["Jan", "Feb", "M\u00E4r", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  useEffect(() => {
    if (!selectedInvoice) { setItems([]); return; }
    setItemsLoading(true);
    fetchItems(selectedInvoice.id).then(setItems).finally(() => setItemsLoading(false));
  }, [selectedInvoice?.id, fetchItems]);

  // Faturanin efektif donemi: once raw period_start, sonra tarih
  const getInvoicePeriod = (inv: Invoice): { year: number; month: number } | null => {
    const fb = inv.raw_ai_response?.fatura_bilgileri || inv.raw_ai_response?.header || {};
    const ps = fb.period_start || inv.tarih;
    if (!ps) return null;
    const d = new Date(ps);
    if (isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() };
  };

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    if (viewMode === "calendar") {
      filtered = filtered.filter(inv => {
        const p = getInvoicePeriod(inv);
        if (!p) return false;
        return p.year === selectedYear && p.month === selectedMonth;
      });
    }
    filtered = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(inv =>
        (inv.fatura_no || "").toLowerCase().includes(term) ||
        (inv.satici_vkn || "").toLowerCase().includes(term) ||
        (inv.alici_vkn || "").toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [invoices, searchTerm, viewMode, selectedYear, selectedMonth]);

  const totalAmount = useMemo(() =>
    filteredInvoices.reduce((sum, inv) => sum + (inv.genel_toplam || 0), 0),
    [filteredInvoices]
  );

  // Count invoices per month for the selected year (for badge display)
  const monthCounts = useMemo(() => {
    const counts = new Array(12).fill(0);
    invoices.forEach(inv => {
      const p = getInvoicePeriod(inv);
      if (!p) return;
      if (p.year === selectedYear) counts[p.month]++;
    });
    return counts;
  }, [invoices, selectedYear]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload(Array.from(files));
      e.target.value = "";
    }
  };

  // Abonelik sistemi kaldırıldı — yükleme her zaman açık
  const uploadBlocked = false;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "#111318" }}>

      {/* Abonelik bannerları kaldırıldı — sınırsız erişim */}

      {/* Header */}
      <div className="inv-header" style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", gap: "8px" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
              {tr("Faturalar", "Rechnungen")}
            </h2>
            <p style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "3px" }}>
              {filteredInvoices.length} {tr("fatura", "Rechnung")} &middot; {fmtEur(totalAmount)}
            </p>
          </div>
          {onCreateManual && (
            <button
              onClick={openManualFresh}
              title={tr("Manuel Fatura Ekle", "Rechnung manuell hinzufügen")}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "9px 14px", borderRadius: "10px",
                background: "rgba(139,92,246,.1)",
                border: "1px solid rgba(139,92,246,.3)",
                cursor: "pointer",
                color: "#8b5cf6", fontSize: "12px", fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "all .2s",
                flexShrink: 0, whiteSpace: "nowrap" as const,
              }}
            >
              <PlusCircle size={14} />
              <span className="hidden xs:inline">{tr("Manuel Ekle", "Manuell")}</span>
            </button>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || uploadBlocked}
            title=""
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "9px 14px", borderRadius: "10px",
              background: (uploading || uploadBlocked) ? "rgba(6,182,212,.08)" : "linear-gradient(135deg, #06b6d4, #0891b2)",
              border: "none", cursor: uploadBlocked ? "not-allowed" : uploading ? "wait" : "pointer",
              opacity: uploadBlocked ? 0.5 : 1,
              color: "#fff", fontSize: "12px", fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: uploading ? "none" : "0 4px 16px rgba(6,182,212,.3)",
              transition: "all .2s",
              flexShrink: 0,
              whiteSpace: "nowrap" as const,
            }}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span className="hidden xs:inline">{uploading ? tr("Analiz ediliyor...", "Wird analysiert...") : tr("Fatura Yükle", "Rechnung hochladen")}</span>
            <span className="xs:hidden">{uploading ? "..." : tr("Yükle", "Laden")}</span>
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" onChange={handleFileChange} style={{ display: "none" }} />
        </div>

        {/* Search & View Toggle */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 12px", borderRadius: "10px",
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
          }}>
            <Search size={14} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
            <input
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder={tr("Fatura no, VKN ile ara...", "Suche nach Rechnungsnr., USt-ID...")}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontSize: "13px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            />
          </div>
          <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,.07)" }}>
            {(["recent", "calendar"] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: "7px 12px", border: "none", cursor: "pointer",
                background: viewMode === mode ? "rgba(6,182,212,.15)" : "transparent",
                color: viewMode === mode ? "#06b6d4" : "var(--text-dim)",
                fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px",
              }}>
                {mode === "recent" ? <Clock size={12} /> : <Calendar size={12} />}
                {mode === "recent" ? tr("Son", "Letzte") : tr("Takvim", "Kalender")}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "calendar" && (
          <div style={{ display: "flex", gap: "6px", marginTop: "12px", flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                style={{ padding: "5px 24px 5px 10px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#e2e8f0", cursor: "pointer", appearance: "none" as const }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={10} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" as const }} />
            </div>
            {months.map((m, i) => (
              <button key={i} onClick={() => setSelectedMonth(i)} style={{
                padding: "4px 10px", borderRadius: "6px", fontSize: "10px", fontWeight: 600, border: "none", cursor: "pointer",
                background: selectedMonth === i ? "rgba(6,182,212,.2)" : "rgba(255,255,255,.03)",
                color: selectedMonth === i ? "#06b6d4" : "var(--text-dim)", transition: "all .15s",
                position: "relative",
              }}>
                {m}
                {monthCounts[i] > 0 && (
                  <span style={{
                    position: "absolute", top: "-6px", right: "-4px",
                    minWidth: "16px", height: "16px", borderRadius: "8px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "9px", fontWeight: 700, lineHeight: 1,
                    padding: "0 4px",
                    background: selectedMonth === i ? "#06b6d4" : "rgba(6,182,212,.8)",
                    color: "#fff",
                    fontFamily: "'Space Grotesk', sans-serif",
                    boxShadow: "0 1px 4px rgba(0,0,0,.3)",
                  }}>
                    {monthCounts[i]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Invoice List - scrollable */}
      <div className="inv-list" style={{ flex: 1, overflowY: "auto", padding: "10px 12px", paddingBottom: "80px" }}>
        <style>{`
          @media (max-width: 639px) {
            .inv-parties { grid-template-columns: 1fr !important; }
          }
          @media (min-width: 640px) {
            .inv-header { padding: 20px 24px 16px !important; }
            .inv-list { padding: 12px 16px !important; }
          }
        `}</style>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", gap: "12px" }}>
            <Loader2 size={24} className="animate-spin" style={{ color: "#06b6d4" }} />
            <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{tr("Yukleniyor...", "Laden...")}</span>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", gap: "12px" }}>
            <FileText size={40} style={{ color: "rgba(255,255,255,.08)" }} />
            <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>
              {tr("Henuz fatura yok. Yukle butonuna tiklayarak baslayin.", "Noch keine Rechnungen. Laden Sie eine hoch.")}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {filteredInvoices.map(invoice => {
              const isSelected = selectedInvoice?.id === invoice.id;
              const status = STATUS_MAP[invoice.status] || STATUS_MAP.analyzed;
              const statusLabel = status.label[lang === "tr" ? 0 : 1];
              const hasWarnings = invoice.uyarilar && invoice.uyarilar.length > 0;
              const h = invoice.raw_ai_response?.header;
              const fb = invoice.raw_ai_response?.fatura_bilgileri || h;
              const displayItems = isSelected ? (invoice.raw_ai_response?.items || invoice.raw_ai_response?.kalemler || items) : [];

              return (
                <div key={invoice.id} style={{ position: "relative", marginBottom: "2px" }}>
                  {(() => {
                    const isManual = !invoice.file_url;
                    const accent = isManual ? "#a855f7" : "#06b6d4";
                    const accent2 = isManual ? "#ec4899" : "#0ea5e9";
                    const statusColor = invoice.status === "analyzed" ? "#10b981"
                      : invoice.status === "mükerrer" || invoice.status === "error" ? "#ef4444" : "#f59e0b";
                    const statusLabel2 = invoice.status === "analyzed" ? tr("Analiz Edildi", "Analysiert")
                      : invoice.status === "mükerrer" ? "Mükerrer"
                      : invoice.status === "error" ? tr("Hata", "Fehler") : tr("Bekliyor", "Ausstehend");
                    const supplierName = fb?.satici_adi || h?.supplier_name || invoice.satici_vkn || "---";
                    const initials = (supplierName || "?").trim().split(/\s+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase() || "").join("") || "?";

                    return (
                      <div
                        onClick={() => onSelectInvoice(isSelected ? null : invoice)}
                        style={{
                          position: "relative",
                          cursor: "pointer",
                          borderRadius: isSelected ? "14px 14px 0 0" : "14px",
                          padding: "1px",
                          background: isSelected
                            ? `linear-gradient(135deg, ${accent}, ${accent2})`
                            : "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))",
                          transition: "all .2s",
                          boxShadow: isSelected ? `0 8px 24px ${accent}22` : "0 2px 8px rgba(0,0,0,.25)",
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) e.currentTarget.style.background = `linear-gradient(135deg, ${accent}55, rgba(255,255,255,.04))`;
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) e.currentTarget.style.background = "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))";
                        }}
                      >
                        <div style={{
                          borderRadius: isSelected ? "13px 13px 0 0" : "13px",
                          background: isSelected
                            ? "linear-gradient(135deg, #161b24, #11151c)"
                            : "linear-gradient(135deg, #181c24, #131720)",
                          padding: "10px 88px 10px 14px",
                          display: "flex", alignItems: "center", gap: "12px",
                          position: "relative",
                          overflow: "hidden",
                        }}>
                          {/* Decorative side accent bar */}
                          <div style={{
                            position: "absolute", left: 0, top: 0, bottom: 0, width: "4px",
                            background: `linear-gradient(180deg, ${accent}, ${accent2})`,
                            borderRadius: "13px 0 0 13px",
                            opacity: isSelected ? 1 : .7,
                          }} />
                          {/* Decorative blob */}
                          <div style={{
                            position: "absolute", right: "-30px", top: "-30px",
                            width: "120px", height: "120px", borderRadius: "50%",
                            background: `radial-gradient(circle, ${accent}18, transparent 70%)`,
                            pointerEvents: "none",
                          }} />

                          {/* Avatar */}
                          <div style={{
                            width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: `linear-gradient(135deg, ${accent}, ${accent2})`,
                            color: "#fff", fontSize: "14px", fontWeight: 800,
                            fontFamily: "'Space Grotesk', sans-serif",
                            boxShadow: `0 4px 14px ${accent}55, inset 0 1px 0 rgba(255,255,255,.3)`,
                            letterSpacing: ".5px",
                            position: "relative",
                          }}>
                            {initials}
                            {hasWarnings && (
                              <div style={{
                                position: "absolute", bottom: "-3px", right: "-3px",
                                width: "16px", height: "16px", borderRadius: "50%",
                                background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center",
                                border: "2px solid #131720",
                              }}>
                                <AlertCircle size={9} style={{ color: "#fff" }} />
                              </div>
                            )}
                          </div>

                          {/* Main info */}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px", flexWrap: "wrap" }}>
                              <span style={{
                                fontSize: "14px", fontWeight: 700, color: "#f1f5f9",
                                fontFamily: "'Space Grotesk', sans-serif",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px",
                              }}>
                                {invoice.fatura_no || tr("Fatura No Yok", "Ohne Nr.")}
                              </span>
                              <span style={{
                                fontSize: "8.5px", fontWeight: 800, padding: "2px 7px", borderRadius: "20px",
                                background: `${accent}1f`, color: accent,
                                border: `1px solid ${accent}55`,
                                letterSpacing: ".4px", textTransform: "uppercase",
                              }}>
                                {isManual ? tr("Manuel", "Manuell") : tr("Orijinal", "Original")}
                              </span>
                              <span style={{
                                fontSize: "8.5px", fontWeight: 800, padding: "2px 7px", borderRadius: "20px",
                                background: `${statusColor}1f`, color: statusColor,
                                border: `1px solid ${statusColor}55`,
                                letterSpacing: ".4px", textTransform: "uppercase",
                              }}>
                                {statusLabel2}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "#94a3b8", flexWrap: "wrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Calendar size={11} style={{ color: accent, opacity: .85 }} />
                                {invoice.tarih || fb?.tarih || h?.invoice_date || "---"}
                              </span>
                              <span style={{ opacity: .25 }}>•</span>
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: "4px",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px",
                              }}>
                                <Building2 size={11} style={{ color: accent, opacity: .85, flexShrink: 0 }} />
                                {supplierName}
                              </span>
                              {(() => {
                                const ps = fb?.period_start || h?.period_start || "";
                                const pe = fb?.period_end || h?.period_end || "";
                                const hasPeriod = ps || pe;
                                const fmtMMYYYY = (s: string) => {
                                  if (!s) return "";
                                  const d = new Date(s);
                                  if (isNaN(d.getTime())) return s;
                                  return `${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
                                };
                                const psShort = fmtMMYYYY(ps);
                                const peShort = fmtMMYYYY(pe);
                                const periodLabel = psShort && peShort && psShort !== peShort
                                  ? `${psShort} → ${peShort}`
                                  : (psShort || peShort);
                                return (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const fbRef = invoice.raw_ai_response?.fatura_bilgileri || invoice.raw_ai_response?.header || {};
                                      const seedDate = fbRef.period_start || invoice.tarih || "";
                                      const seedYear = seedDate ? new Date(seedDate).getFullYear() : new Date().getFullYear();
                                      setPeriodPickerYear(isNaN(seedYear) ? new Date().getFullYear() : seedYear);
                                      setPeriodPickerInvoice(invoice);
                                    }}
                                    title={tr("Fatura dönemini düzenle", "Rechnungsperiode bearbeiten")}
                                    style={{
                                      display: "inline-flex", alignItems: "center", gap: "4px",
                                      padding: "2px 8px", borderRadius: "20px",
                                      background: hasPeriod ? `${accent}15` : "rgba(148,163,184,.1)",
                                      border: `1px dashed ${hasPeriod ? `${accent}55` : "rgba(148,163,184,.35)"}`,
                                      color: hasPeriod ? accent : "#94a3b8",
                                      fontSize: "10px", fontWeight: 700, cursor: "pointer",
                                      letterSpacing: ".2px",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = `${accent}25`; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = hasPeriod ? `${accent}15` : "rgba(148,163,184,.1)"; }}
                                  >
                                    <Clock size={10} />
                                    {hasPeriod
                                      ? `${tr("Dönem", "Periode")}: ${periodLabel}`
                                      : tr("Dönem ekle", "Periode setzen")}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Amount */}
                          <div style={{
                            display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px",
                            flexShrink: 0, marginRight: "4px",
                          }}>
                            <span style={{
                              fontSize: "16px", fontWeight: 800,
                              fontFamily: "'Space Grotesk', sans-serif",
                              background: `linear-gradient(135deg, ${accent}, ${accent2})`,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                              letterSpacing: "-.3px",
                              lineHeight: 1.1,
                            }}>
                              {fmtEur(invoice.genel_toplam || 0)}
                            </span>
                            <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>
                              {tr("Toplam", "Gesamt")}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Action buttons — sadece MANUEL faturalar kopyalanabilir */}
                  {onCreateManual && (invoice.raw_ai_response?.manual === true || invoice.raw_ai_response?.fatura_bilgileri?.manual_entry === true) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openManualCopy(invoice); }}
                      title={tr("Bu faturayı kopyala (Manuel)", "Rechnung kopieren (Manuell)")}
                      style={{
                        position: "absolute", top: "10px", right: onDelete ? "44px" : "10px", zIndex: 3,
                        width: "28px", height: "28px", borderRadius: "8px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(139,92,246,.15)", border: "1px solid rgba(139,92,246,.4)",
                        color: "#a78bfa", cursor: "pointer", transition: "all .15s",
                        backdropFilter: "blur(6px)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139,92,246,.3)"; e.currentTarget.style.transform = "scale(1.08)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(139,92,246,.15)"; e.currentTarget.style.transform = "scale(1)"; }}
                    >
                      <Copy size={13} />
                    </button>
                  )}
                  {/* TEKRAR ANALİZ — yalnızca admin */}
                  {isAdmin && onReanalyze && invoice.file_url && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReanalyze(invoice); }}
                      disabled={reanalyzingId === invoice.id}
                      title={tr("Tekrar Analiz Et (Claude Haiku 4.5)", "Neu analysieren (Claude Haiku 4.5)")}
                      style={{
                        position: "absolute", top: "10px", right: onDelete ? "78px" : "44px", zIndex: 3,
                        width: "28px", height: "28px", borderRadius: "8px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(6,182,212,.15)", border: "1px solid rgba(6,182,212,.4)",
                        color: "#22d3ee", cursor: reanalyzingId === invoice.id ? "wait" : "pointer", transition: "all .15s",
                        backdropFilter: "blur(6px)",
                      }}
                      onMouseEnter={(e) => { if (reanalyzingId !== invoice.id) { e.currentTarget.style.background = "rgba(6,182,212,.3)"; e.currentTarget.style.transform = "scale(1.08)"; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(6,182,212,.15)"; e.currentTarget.style.transform = "scale(1)"; }}
                    >
                      {reanalyzingId === invoice.id
                        ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                        : <RefreshCw size={13} />}
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(tr(`Bu faturayı silmek istediğinizden emin misiniz?\n\n${invoice.fatura_no || "(no)"}`, `Möchten Sie diese Rechnung wirklich löschen?\n\n${invoice.fatura_no || "(ohne Nr.)"}`))) {
                          onDelete(invoice);
                        }
                      }}
                      title={tr("Faturayı Sil", "Rechnung löschen")}
                      style={{
                        position: "absolute", top: "10px", right: "10px", zIndex: 3,
                        width: "28px", height: "28px", borderRadius: "8px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.4)",
                        color: "#f87171", cursor: "pointer", transition: "all .15s",
                        backdropFilter: "blur(6px)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,.3)"; e.currentTarget.style.transform = "scale(1.08)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,.15)"; e.currentTarget.style.transform = "scale(1)"; }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}

                  {/* Inline Detail - expands below selected invoice */}
                  {isSelected && (
                    <div style={{
                      border: "1px solid rgba(6,182,212,.3)",
                      borderTop: "none",
                      borderRadius: "0 0 10px 10px",
                      background: "rgba(6,182,212,.02)",
                      overflow: "hidden",
                    }}>
                      {/* Colored accent bar */}
                      <div style={{ height: "2px", background: "linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4)" }} />

                      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>

                        {/* --- Satici / Alici Row --- */}
                        <div className="inv-parties" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          {/* Satici */}
                          <div style={{
                            padding: "10px 12px", borderRadius: "8px",
                            background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)",
                            position: "relative",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                              <Building2 size={12} style={{ color: "#06b6d4" }} />
                              <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                                {tr("Satici", "Verkaufer")}
                              </span>
                              {onUpdateInvoice && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const curName = fb?.satici_adi || h?.supplier_name || "";
                                    const curVkn = invoice.satici_vkn || fb?.satici_vkn || h?.supplier_vat_id || "";
                                    const curAdr = invoice.satici_adres || fb?.satici_adres || h?.supplier_address || "";
                                    const newName = window.prompt(tr("Satici adi:", "Verkaufer Name:"), curName);
                                    if (newName === null) return;
                                    const newVkn = window.prompt(tr("Vergi no (VKN/USt-IdNr):", "Steuernummer (USt-IdNr):"), curVkn);
                                    if (newVkn === null) return;
                                    const newAdr = window.prompt(tr("Adres:", "Adresse:"), curAdr);
                                    if (newAdr === null) return;
                                    const raw = invoice.raw_ai_response || {};
                                    const newRaw = {
                                      ...raw,
                                      header: { ...(raw.header || {}), supplier_name: newName, supplier_vat_id: newVkn, supplier_address: newAdr },
                                      fatura_bilgileri: { ...(raw.fatura_bilgileri || {}), satici_adi: newName, satici_vkn: newVkn, satici_adres: newAdr, supplier_name: newName, supplier_vat_id: newVkn, supplier_address: newAdr },
                                    };
                                    onUpdateInvoice(invoice.id, {
                                      satici_adi: newName,
                                      satici_vkn: newVkn,
                                      satici_adres: newAdr,
                                      raw_ai_response: newRaw,
                                    } as any);
                                  }}
                                  title={tr("Satici bilgilerini duzenle", "Verkaufer bearbeiten")}
                                  style={{
                                    marginLeft: "auto", background: "transparent", border: "none",
                                    color: "#06b6d4", cursor: "pointer", padding: "2px",
                                    display: "flex", alignItems: "center",
                                  }}
                                >
                                  <Edit3 size={11} />
                                </button>
                              )}
                            </div>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", marginBottom: "2px" }}>
                              {invoice.satici_adi || fb?.satici_adi || h?.supplier_name || "---"}
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "'Space Grotesk', sans-serif" }}>
                              {invoice.satici_vkn || fb?.satici_vkn || h?.supplier_vat_id || "---"}
                            </div>
                          </div>
                          {/* Alici */}
                          <div style={{
                            padding: "10px 12px", borderRadius: "8px",
                            background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                              <Building2 size={12} style={{ color: "#8b5cf6" }} />
                              <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                                {tr("Alici", "Kaufer")}
                              </span>
                            </div>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", marginBottom: "2px" }}>
                              {fb?.alici_adi || h?.buyer_name || "---"}
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "'Space Grotesk', sans-serif" }}>
                              {invoice.alici_vkn || fb?.alici_vkn || h?.buyer_vat_id || "---"}
                            </div>
                          </div>
                        </div>

                        {/* --- Kalemler (Items) --- */}
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                            <Package size={12} style={{ color: "#06b6d4" }} />
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", textTransform: "uppercase", letterSpacing: ".06em" }}>
                              {tr("Kalemler", "Positionen")}
                            </span>
                            {!itemsLoading && displayItems.length > 0 && (
                              <span style={{ fontSize: "9px", color: "var(--text-dim)", marginLeft: "2px" }}>({displayItems.length})</span>
                            )}
                          </div>

                          {itemsLoading && displayItems.length === 0 ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 0" }}>
                              <Loader2 size={16} className="animate-spin" style={{ color: "#06b6d4" }} />
                            </div>
                          ) : displayItems.length === 0 ? (
                            <div style={{ fontSize: "11px", color: "var(--text-dim)", padding: "8px 0" }}>
                              {tr("Kalem bulunamadi", "Keine Positionen")}
                            </div>
                          ) : (
                            <div style={{
                              borderRadius: "8px", overflow: "hidden",
                              border: "1px solid rgba(255,255,255,.06)",
                            }}>
                              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", minWidth: "420px" }}>
                                <thead>
                                  <tr style={{ background: "rgba(255,255,255,.03)" }}>
                                    <th style={thStyle}>{tr("Urun/Hizmet", "Artikel")}</th>
                                    <th style={thStyle}>{tr("Hesap", "Konto")}</th>
                                    <th style={{ ...thStyle, textAlign: "right", width: "55px" }}>{tr("Miktar", "Menge")}</th>
                                    <th style={{ ...thStyle, textAlign: "right", width: "55px" }}>KDV</th>
                                    <th style={{ ...thStyle, textAlign: "right", width: "90px" }}>{tr("Toplam", "Summe")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {displayItems.map((item: any, idx: number) => (
                                    <tr key={item.id || idx} style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
                                      <td style={{ padding: "7px 8px", color: "#e2e8f0", fontSize: "11px" }}>
                                        {item.description || item.urun_adi || "---"}
                                        {item.user_modified && (
                                          <span title={tr("Kullanici tarafindan duzenlendi", "Vom Benutzer bearbeitet")} style={{ marginLeft: 6, fontSize: "9px", padding: "1px 5px", borderRadius: 3, background: "rgba(245,158,11,.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.25)" }}>
                                            {tr("Manuel", "Manuell")}
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ padding: "7px 8px", color: "#06b6d4", fontSize: "11px", fontWeight: 600 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          {item.account_code || item.hesap_kodu ? (
                                              <span
                                                title={item.account_name || item.account_name_tr || ""}
                                                onClick={(e) => { e.stopPropagation(); onAccountClick?.(item); }}
                                                style={{
                                                  cursor: onAccountClick ? "pointer" : "default",
                                                  padding: "2px 6px", borderRadius: "4px",
                                                  background: "rgba(6,182,212,.1)", border: "1px solid rgba(6,182,212,.2)",
                                                  transition: "all .15s",
                                                }}
                                                onMouseEnter={e => { if (onAccountClick) { e.currentTarget.style.background = "rgba(6,182,212,.2)"; e.currentTarget.style.borderColor = "rgba(6,182,212,.4)"; }}}
                                                onMouseLeave={e => { e.currentTarget.style.background = "rgba(6,182,212,.1)"; e.currentTarget.style.borderColor = "rgba(6,182,212,.2)"; }}
                                              >
                                                {item.account_code || item.hesap_kodu}
                                              </span>
                                          ) : "---"}
                                          {onUpdateInvoiceItems && (
                                            <button
                                              title={tr("Hesap kodunu duzenle", "Konto bearbeiten")}
                                              onClick={(e) => { e.stopPropagation(); handleEditItemAccount(invoice, item, idx, displayItems); }}
                                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a78bfa", padding: 2, display: "inline-flex" }}
                                            >
                                              <Edit3 size={10} />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                      <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "'Space Grotesk', sans-serif", fontSize: "11px", color: "#94a3b8" }}>{item.quantity || item.miktar || 1}</td>
                                      <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "'Space Grotesk', sans-serif", fontSize: "11px", color: "#94a3b8" }}>%{item.vat_rate || item.kdv_orani || 0}</td>
                                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", fontSize: "11px", color: "#e2e8f0" }}>
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                                          {fmtEur(item.gross_amount || item.satir_toplami || 0)}
                                          {onUpdateInvoiceItems && (
                                            <button
                                              title={tr("Tutari duzenle", "Betrag bearbeiten")}
                                              onClick={(e) => { e.stopPropagation(); handleEditItemAmount(invoice, item, idx, displayItems); }}
                                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a78bfa", padding: 2, display: "inline-flex" }}
                                            >
                                              <Edit3 size={10} />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* --- Finansal Ozet --- */}
                        <div style={{
                          display: "flex", alignItems: "center", gap: "16px",
                          padding: "10px 14px", borderRadius: "8px",
                          background: "rgba(6,182,212,.04)", border: "1px solid rgba(6,182,212,.12)",
                        }}>
                          <TrendingUp size={14} style={{ color: "#06b6d4", flexShrink: 0 }} />
                          <div style={{ display: "flex", gap: "20px", flex: 1, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>
                                {tr("Ara Toplam", "Zwischensumme")}
                              </div>
                              <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                                {fmtEur(invoice.ara_toplam || 0)}
                                {onUpdateInvoice && (
                                  <button title={tr("Duzenle", "Bearbeiten")} onClick={(e) => { e.stopPropagation(); handleEditTotal(invoice, "ara_toplam", tr("Ara Toplam", "Zwischensumme")); }}
                                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a78bfa", padding: 2, display: "inline-flex" }}>
                                    <Edit3 size={10} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>
                                {tr("KDV", "MwSt.")}
                              </div>
                              <div style={{ fontSize: "13px", fontWeight: 600, color: "#f59e0b", fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                                {fmtEur(invoice.toplam_kdv || 0)}
                                {onUpdateInvoice && (
                                  <button title={tr("Duzenle", "Bearbeiten")} onClick={(e) => { e.stopPropagation(); handleEditTotal(invoice, "toplam_kdv", tr("KDV", "MwSt.")); }}
                                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a78bfa", padding: 2, display: "inline-flex" }}>
                                    <Edit3 size={10} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div style={{ marginLeft: "auto" }}>
                              <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>
                                {tr("Genel Toplam", "Gesamtbetrag")}
                              </div>
                              <div style={{ fontSize: "16px", fontWeight: 800, color: "#06b6d4", fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                                {fmtEur(invoice.genel_toplam || 0)}
                                {onUpdateInvoice && (
                                  <button title={tr("Duzenle", "Bearbeiten")} onClick={(e) => { e.stopPropagation(); handleEditTotal(invoice, "genel_toplam", tr("Genel Toplam", "Gesamtbetrag")); }}
                                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a78bfa", padding: 2, display: "inline-flex" }}>
                                    <Edit3 size={10} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* --- Uyarilar --- */}
                        {invoice.uyarilar && invoice.uyarilar.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {invoice.uyarilar.map((w, i) => (
                              <div key={i} style={{
                                display: "flex", alignItems: "center", gap: "8px",
                                padding: "7px 10px", borderRadius: "8px",
                                background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.12)",
                                fontSize: "11px", color: "#fbbf24",
                              }}>
                                <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                                {w}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {onCreateManual && (
        <ManualInvoiceModal
          open={manualOpen}
          onClose={() => { setManualOpen(false); setManualInitial(null); }}
          onSave={onCreateManual}
          initialData={manualInitial}
        />
      )}

      {/* Dönem Seçim Modalı */}
      {periodPickerInvoice && (() => {
        const inv = periodPickerInvoice;
        const fbRef = inv.raw_ai_response?.fatura_bilgileri || inv.raw_ai_response?.header || {};
        const curStart = fbRef.period_start || "";
        const curStartDate = curStart ? new Date(curStart) : null;
        const curMonth = curStartDate && !isNaN(curStartDate.getTime()) ? curStartDate.getMonth() : -1;
        const curYear = curStartDate && !isNaN(curStartDate.getTime()) ? curStartDate.getFullYear() : -1;
        const monthNames = lang === "tr"
          ? ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
          : ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        return (
          <div
            onClick={() => setPeriodPickerInvoice(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: "440px",
                background: "linear-gradient(135deg, #161b24, #11151c)",
                border: "1.5px solid rgba(139,92,246,.3)",
                borderRadius: "16px",
                boxShadow: "0 20px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(139,92,246,.15)",
                overflow: "hidden",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              <div style={{ height: "3px", background: "linear-gradient(90deg, #06b6d4, #8b5cf6, #ec4899)" }} />
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "17px", fontWeight: 800, color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif", textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>
                      {tr("Fatura Dönemi Seç", "Rechnungsperiode wählen")}
                    </div>
                    <div style={{ fontSize: "12px", color: "#ffffff", opacity: .85, marginTop: "4px", fontWeight: 600 }}>
                      {inv.fatura_no || tr("Fatura No Yok", "Ohne Nr.")}
                    </div>
                  </div>
                  <button
                    onClick={() => setPeriodPickerInvoice(null)}
                    style={{
                      width: "30px", height: "30px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.1)",
                      background: "rgba(255,255,255,.05)", color: "#94a3b8", cursor: "pointer", fontSize: "16px",
                    }}
                  >×</button>
                </div>
              </div>

              {/* Yıl seçici */}
              <div style={{ padding: "14px 20px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                <button
                  onClick={() => setPeriodPickerYear(y => y - 1)}
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    background: "rgba(139,92,246,.12)", border: "1px solid rgba(139,92,246,.3)",
                    color: "#a78bfa", cursor: "pointer", fontSize: "16px", fontWeight: 700,
                  }}
                >‹</button>
                <div style={{
                  fontSize: "20px", fontWeight: 800, color: "#f1f5f9",
                  fontFamily: "'Space Grotesk', sans-serif", minWidth: "70px", textAlign: "center",
                  background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>{periodPickerYear}</div>
                <button
                  onClick={() => setPeriodPickerYear(y => y + 1)}
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    background: "rgba(139,92,246,.12)", border: "1px solid rgba(139,92,246,.3)",
                    color: "#a78bfa", cursor: "pointer", fontSize: "16px", fontWeight: 700,
                  }}
                >›</button>
              </div>

              {/* Ay grid */}
              <div style={{
                padding: "10px 20px 18px",
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px",
              }}>
                {monthNames.map((m, i) => {
                  const isCurrent = curYear === periodPickerYear && curMonth === i;
                  return (
                    <button
                      key={i}
                      onClick={() => applyPeriodMonth(inv, periodPickerYear, i)}
                      style={{
                        padding: "14px 8px", borderRadius: "10px",
                        background: isCurrent
                          ? "linear-gradient(135deg, #06b6d4, #8b5cf6)"
                          : "rgba(30,41,59,.95)",
                        border: `1.5px solid ${isCurrent ? "#a78bfa" : "rgba(148,163,184,.45)"}`,
                        color: "#ffffff",
                        cursor: "pointer",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        transition: "all .15s",
                        textShadow: "0 1px 2px rgba(0,0,0,.6)",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) {
                          e.currentTarget.style.background = "rgba(139,92,246,.4)";
                          e.currentTarget.style.borderColor = "#a78bfa";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) {
                          e.currentTarget.style.background = "rgba(30,41,59,.95)";
                          e.currentTarget.style.borderColor = "rgba(148,163,184,.45)";
                        }
                      }}
                    >
                      <span style={{ color: "#ffffff", fontSize: "14px", fontWeight: 800, letterSpacing: ".2px" }}>{m}</span>
                      <span style={{ color: "#ffffff", fontSize: "11px", fontWeight: 700, opacity: .9 }}>
                        {periodPickerYear}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{
                padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.06)",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px",
              }}>
                {curStart ? (
                  <button
                    onClick={() => clearPeriod(inv)}
                    style={{
                      padding: "8px 14px", borderRadius: "8px",
                      background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)",
                      color: "#f87171", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                    }}
                  >{tr("Dönemi Temizle", "Periode löschen")}</button>
                ) : <span />}
                <span style={{ fontSize: "11px", color: "#ffffff", opacity: .85, fontWeight: 600 }}>
                  {tr("Bir ay seç — ayın ilk ve son günü otomatik atanır", "Monat wählen — erster & letzter Tag automatisch")}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── Helpers ────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "6px 8px", fontSize: "9px", fontWeight: 700,
  letterSpacing: ".07em", textTransform: "uppercase",
  color: "var(--text-dim)", fontFamily: "'Space Grotesk', sans-serif",
  textAlign: "left",
};