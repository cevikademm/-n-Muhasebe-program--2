import React, { useState, useRef, useMemo, useEffect } from "react";
import { useLang } from "../LanguageContext";
import { Invoice, InvoiceItem } from "../types";
import {
  Upload, Search, Loader2, FileText, Calendar, Clock,
  AlertCircle, ChevronDown, ChevronUp, Building2,
  AlertTriangle, Package, TrendingUp, Crown,
} from "lucide-react";
import { FREE_PLAN_LIMITS, getInvoiceCount, getRemainingInvoices, canUploadInvoice } from "../services/freePlanLimits";

interface InvoiceCenterPanelProps {
  invoices: Invoice[];
  loading: boolean;
  uploading: boolean;
  selectedInvoice: Invoice | null;
  onSelectInvoice: (invoice: Invoice | null) => void;
  onUpload: (files: File[]) => void;
  fetchItems: (invoiceId: string) => Promise<InvoiceItem[]>;
  onAccountClick?: (item: any) => void;
  isSubscriptionExpired?: boolean;
  subscriptionExpiresAt?: Date | null;
  subscriptionPlan?: string;
  userId?: string;
  onNavigateToSubscription?: () => void;
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
  isSubscriptionExpired, subscriptionExpiresAt, subscriptionPlan, userId, onNavigateToSubscription,
}) => {
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

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    if (viewMode === "calendar") {
      filtered = filtered.filter(inv => {
        if (!inv.tarih) return false;
        const d = new Date(inv.tarih);
        return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
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
      if (!inv.tarih) return;
      const d = new Date(inv.tarih);
      if (d.getFullYear() === selectedYear) {
        counts[d.getMonth()]++;
      }
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

  const isFreePlan = (subscriptionPlan || "free") === "free";
  const freeInvoiceUsed = getInvoiceCount(userId);
  const freeInvoiceRemaining = getRemainingInvoices(userId);
  const freeLimitReached = isFreePlan && !canUploadInvoice(subscriptionPlan || "free", userId);
  const uploadBlocked = isSubscriptionExpired === true || freeLimitReached;
  const subExpDateStr = subscriptionExpiresAt
    ? subscriptionExpiresAt.toLocaleDateString("tr-TR")
    : null;

  const PLAN_LABELS: Record<string, [string, string]> = {
    monthly: ["Aylik", "Monatlich"],
    quarterly: ["3 Aylik", "Vierteljährlich"],
    yearly: ["Yillik", "Jährlich"],
    free: ["Ücretsiz", "Kostenlos"],
  };
  const planLabel = PLAN_LABELS[subscriptionPlan || "free"] || PLAN_LABELS.free;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "#111318" }}>

      {/* Abonelik Uyarı Bannerı */}
      {uploadBlocked && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(239,68,68,.12)",
          borderBottom: "1px solid rgba(239,68,68,.25)",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <AlertTriangle size={18} style={{ color: "#ef4444", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#fca5a5", margin: 0 }}>
              {tr("Abonelik Süresi Doldu", "Abonnement abgelaufen")}
            </p>
            <p style={{ fontSize: "11px", color: "#f87171", margin: "2px 0 0" }}>
              {tr(
                `${planLabel[0]} planınızın süresi ${subExpDateStr || "—"} tarihinde dolmuştur. Fatura yükleyebilmek için aboneliğinizi yenileyin.`,
                `Ihr ${planLabel[1]}-Plan ist am ${subExpDateStr || "—"} abgelaufen. Bitte erneuern Sie Ihr Abonnement.`
              )}
            </p>
          </div>
        </div>
      )}

      {/* Free Plan Counter / Limit Banner */}
      {isFreePlan && (
        <div style={{
          padding: "10px 16px",
          background: freeLimitReached ? "rgba(239,68,68,.10)" : "rgba(6,182,212,.06)",
          borderBottom: `1px solid ${freeLimitReached ? "rgba(239,68,68,.2)" : "rgba(6,182,212,.12)"}`,
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
            background: freeLimitReached ? "rgba(239,68,68,.15)" : "rgba(6,182,212,.12)",
            border: `1px solid ${freeLimitReached ? "rgba(239,68,68,.3)" : "rgba(6,182,212,.2)"}`,
          }}>
            <FileText size={14} style={{ color: freeLimitReached ? "#ef4444" : "#06b6d4" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: freeLimitReached ? "#fca5a5" : "#e2e8f0" }}>
                {tr("Ücretsiz Plan", "Kostenloser Plan")}
              </span>
              <span style={{
                fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px",
                background: freeLimitReached ? "rgba(239,68,68,.15)" : "rgba(249,115,22,.12)",
                color: freeLimitReached ? "#ef4444" : "#f97316",
                border: `1px solid ${freeLimitReached ? "rgba(239,68,68,.3)" : "rgba(249,115,22,.25)"}`,
              }}>
                {freeInvoiceUsed}/{FREE_PLAN_LIMITS.maxInvoices}
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ width: "100%", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
              <div style={{
                width: `${Math.min(100, (freeInvoiceUsed / FREE_PLAN_LIMITS.maxInvoices) * 100)}%`,
                height: "100%", borderRadius: "2px",
                background: freeLimitReached
                  ? "linear-gradient(90deg, #ef4444, #dc2626)"
                  : `linear-gradient(90deg, #06b6d4, ${freeInvoiceRemaining <= 3 ? "#f59e0b" : "#06b6d4"})`,
                transition: "width .3s ease",
              }} />
            </div>
            <span style={{ fontSize: "10px", color: freeLimitReached ? "#f87171" : "rgba(255,255,255,.4)", marginTop: "3px", display: "block" }}>
              {freeLimitReached
                ? tr("Fatura limitinize ulaştınız. Pro plana geçerek sınırsız fatura yükleyin.", "Rechnungslimit erreicht. Upgrade auf Pro für unbegrenzte Rechnungen.")
                : tr(`${freeInvoiceRemaining} fatura hakkınız kaldı`, `${freeInvoiceRemaining} Rechnungen verbleibend`)}
            </span>
          </div>
          {freeLimitReached && onNavigateToSubscription && (
            <button
              onClick={onNavigateToSubscription}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "7px 14px", borderRadius: "8px", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #f97316, #ea580c)",
                color: "#fff", fontSize: "11px", fontWeight: 700,
                boxShadow: "0 2px 8px rgba(249,115,22,.3)",
                flexShrink: 0, whiteSpace: "nowrap" as const,
              }}
            >
              <Crown size={12} />
              {tr("Pro'ya Geç", "Auf Pro upgraden")}
            </button>
          )}
        </div>
      )}

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
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || uploadBlocked}
            title={freeLimitReached ? tr("Fatura limitine ulaşıldı — Pro plana geçin", "Rechnungslimit erreicht") : uploadBlocked ? tr("Abonelik süresi dolmuş — yükleme yapılamaz", "Abonnement abgelaufen") : ""}
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
                <div key={invoice.id}>
                  {/* Invoice Row */}
                  <button onClick={() => onSelectInvoice(isSelected ? null : invoice)}
                    style={{
                      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 14px",
                      borderRadius: isSelected ? "10px 10px 0 0" : "10px",
                      border: `1px solid ${isSelected ? "rgba(6,182,212,.3)" : "rgba(255,255,255,.06)"}`,
                      borderBottom: isSelected ? "none" : undefined,
                      background: isSelected ? "rgba(6,182,212,.06)" : "rgba(255,255,255,.02)",
                      cursor: "pointer", transition: "all .15s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,.04)"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,.02)"; }}
                  >
                    <div style={{
                      width: "34px", height: "34px", borderRadius: "9px", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isSelected ? "rgba(6,182,212,.15)" : "rgba(255,255,255,.04)",
                      border: `1px solid ${isSelected ? "rgba(6,182,212,.25)" : "rgba(255,255,255,.06)"}`,
                    }}>
                      <FileText size={14} style={{ color: isSelected ? "#06b6d4" : "var(--text-dim)" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {invoice.fatura_no || tr("Fatura No Yok", "Ohne Nr.")}
                        </span>
                        {hasWarnings && <AlertCircle size={11} style={{ color: "#f59e0b", flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)", display: "flex", gap: "6px" }}>
                        <span>{invoice.tarih || fb?.tarih || h?.invoice_date || "---"}</span>
                        <span style={{ opacity: .3 }}>&middot;</span>
                        <span>{fb?.satici_adi || h?.supplier_name || invoice.satici_vkn || "---"}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'Space Grotesk', sans-serif", marginBottom: "3px" }}>
                        {fmtEur(invoice.genel_toplam || 0)}
                      </div>
                    <div style={{ flex: "0 0 100px", display: "flex", alignItems: "center" }}>
                      {invoice.status === "analyzed" ? (
                        <span style={{
                          fontSize: "10px", padding: "4px 8px", borderRadius: "20px",
                          background: "rgba(16,185,129,.1)", color: "#10b981", fontWeight: 600
                        }}>
                          {tr("Analiz Edildi", "Analysiert")}
                        </span>
                      ) : invoice.status === "mükerrer" ? (
                        <span style={{
                          fontSize: "10px", padding: "4px 8px", borderRadius: "20px",
                          background: "rgba(239,68,68,.1)", color: "#ef4444", fontWeight: 600
                        }}>
                          Mükerrer
                        </span>
                      ) : invoice.status === "error" ? (
                        <span style={{
                          fontSize: "10px", padding: "4px 8px", borderRadius: "20px",
                          background: "rgba(239,68,68,.1)", color: "#ef4444", fontWeight: 600
                        }}>
                          {tr("Hata", "Fehler")}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: "10px", padding: "4px 8px", borderRadius: "20px",
                          background: "rgba(245,158,11,.1)", color: "#fbbf24", fontWeight: 600
                        }}>
                          {tr("Bekliyor", "Ausstehend")}
                        </span>
                      )}
                    </div>
                    </div>
                    {isSelected
                      ? <ChevronUp size={14} style={{ color: "#06b6d4", flexShrink: 0 }} />
                      : <ChevronDown size={14} style={{ color: "var(--text-dim)", flexShrink: 0, opacity: .4 }} />}
                  </button>

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
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                              <Building2 size={12} style={{ color: "#06b6d4" }} />
                              <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                                {tr("Satici", "Verkaufer")}
                              </span>
                            </div>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", marginBottom: "2px" }}>
                              {fb?.satici_adi || h?.supplier_name || "---"}
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
                                      <td style={{ padding: "7px 8px", color: "#e2e8f0", fontSize: "11px" }}>{item.description || item.urun_adi || "---"}</td>
                                      <td style={{ padding: "7px 8px", color: "#06b6d4", fontSize: "11px", fontWeight: 600 }}>
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
                                      </td>
                                      <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "'Space Grotesk', sans-serif", fontSize: "11px", color: "#94a3b8" }}>{item.quantity || item.miktar || 1}</td>
                                      <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "'Space Grotesk', sans-serif", fontSize: "11px", color: "#94a3b8" }}>%{item.vat_rate || item.kdv_orani || 0}</td>
                                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", fontSize: "11px", color: "#e2e8f0" }}>{fmtEur(item.gross_amount || item.satir_toplami || 0)}</td>
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
                              <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {fmtEur(invoice.ara_toplam || 0)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>
                                {tr("KDV", "MwSt.")}
                              </div>
                              <div style={{ fontSize: "13px", fontWeight: 600, color: "#f59e0b", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {fmtEur(invoice.toplam_kdv || 0)}
                              </div>
                            </div>
                            <div style={{ marginLeft: "auto" }}>
                              <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "2px" }}>
                                {tr("Genel Toplam", "Gesamtbetrag")}
                              </div>
                              <div style={{ fontSize: "16px", fontWeight: 800, color: "#06b6d4", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {fmtEur(invoice.genel_toplam || 0)}
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