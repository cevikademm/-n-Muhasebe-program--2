import React, { useState, useRef, useMemo } from "react";
import { useLang } from "../LanguageContext";
import { Invoice, InvoiceItem } from "../types";
import {
  Calendar, Clock, Upload, Search,
  Loader2, ChevronDown, FileText, ImageIcon,
  TrendingUp, Receipt, AlertCircle, BarChart2,
} from "lucide-react";

interface InvoiceCenterPanelProps {
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  loading: boolean;
  selectedInvoice: Invoice | null;
  onSelectInvoice: (invoice: Invoice | null) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
  selectedItem: InvoiceItem | null;
  onSelectItem: (item: InvoiceItem | null) => void;
}

const safeRender = (value: any) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") { try { return JSON.stringify(value); } catch { return "Error"; } }
  return String(value);
};

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M €";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K €";
  return fmtEur(n);
};

export const InvoiceCenterPanel: React.FC<InvoiceCenterPanelProps> = ({
  invoices, invoiceItems, loading,
  selectedInvoice, onSelectInvoice,
  searchTerm, setSearchTerm,
  onUpload, uploading,
  selectedItem, onSelectItem,
}) => {
  const { t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);

  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const [viewMode, setViewMode]       = useState<"calendar" | "recent">("calendar");
  const [selectedYear, setSelectedYear]   = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    if (viewMode === "recent") {
      filtered = [...filtered]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
    } else {
      filtered = filtered.filter(inv => {
        if (!inv.invoice_date) return false;
        const d = new Date(inv.invoice_date);
        return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
      });
      filtered.sort((a, b) => new Date(b.invoice_date || 0).getTime() - new Date(a.invoice_date || 0).getTime());
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(inv =>
        (inv.supplier_name || "").toLowerCase().includes(term) ||
        (inv.invoice_number || "").toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [invoices, searchTerm, viewMode, selectedYear, selectedMonth]);

  const stats = useMemo(() => {
    const totalCount  = filteredInvoices.length;
    const totalVolume = filteredInvoices.reduce((s, inv) => s + Number(inv.total_gross || 0), 0);
    const pendingCount = filteredInvoices.filter(inv => inv.status !== "analyzed").length;
    const avgAmount   = totalCount > 0 ? totalVolume / totalCount : 0;
    return { totalCount, totalVolume, pendingCount, avgAmount };
  }, [filteredInvoices]);

  const currentItems = selectedInvoice
    ? invoiceItems.filter(item => item.invoice_id === selectedInvoice.id)
    : [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setViewMode("recent"); onUpload(file); e.target.value = ""; }
  };

  const handleRowClick = (inv: Invoice) => {
    if (selectedInvoice?.id === inv.id) { onSelectInvoice(null); }
    else { onSelectInvoice(inv); onSelectItem(null); }
  };

  // Status badge helper
  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      analyzed:  { cls: "badge-analyzed",  label: t.analyzed },
      pending:   { cls: "badge-pending",   label: t.pending },
      duplicate: { cls: "badge-duplicate", label: "Mükerrer" },
      error:     { cls: "badge-error",     label: "Hata" },
      check:     { cls: "badge-check",     label: "Kontrol" },
    };
    const m = map[status] || map.pending;
    return <span className={m.cls}>{m.label}</span>;
  };

  // Score badge
  const scoreBadge = (score: any) => {
    if (!score) return <span style={{ color: "var(--text-dim)" }}>—</span>;
    const n = Number(score);
    const color = n >= 90 ? "#10b981" : n >= 70 ? "#f59e0b" : "#f43f5e";
    return (
      <span style={{
        padding: "2px 8px", borderRadius: "20px", fontSize: "10px", fontWeight: 700,
        background: `${color}15`, color, border: `1px solid ${color}30`,
      }}>
        %{score}
      </span>
    );
  };

  // KPI cards config
  const kpiCards = [
    { icon: <Receipt size={16} />, label: t.totalRows, val: stats.totalCount.toString(), accent: "#06b6d4" },
    { icon: <TrendingUp size={16} />, label: t.totalVolume, val: fmtShort(stats.totalVolume), accent: "#10b981" },
    { icon: <BarChart2 size={16} />, label: t.averageAmount, val: fmtShort(stats.avgAmount), accent: "#8b5cf6" },
    {
      icon: <AlertCircle size={16} />, label: t.waitingAnalysis,
      val: stats.pendingCount.toString(),
      accent: stats.pendingCount > 0 ? "#f59e0b" : "#10b981",
      pulse: stats.pendingCount > 0,
    },
  ];

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
      background: "var(--bg)",
      borderRight: "1px solid rgba(255,255,255,.06)",
    }}>

      {/* ── KPI Stats Row ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px",
        padding: "16px 20px",
        background: "var(--panel)",
        borderBottom: "1px solid rgba(255,255,255,.06)",
        flexShrink: 0,
      }}>
        {kpiCards.map((c, i) => (
          <div key={i} style={{
            padding: "12px 14px", borderRadius: "12px",
            background: `linear-gradient(135deg, ${c.accent}0e 0%, transparent 100%)`,
            border: `1px solid ${c.accent}22`,
            position: "relative", overflow: "hidden",
            transition: "transform .18s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
          >
            {/* Top line */}
            <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "1px", background: `linear-gradient(90deg,transparent,${c.accent}44,transparent)` }} />
            {c.pulse && (
              <div style={{ position: "absolute", top: "10px", right: "10px", width: "7px", height: "7px", borderRadius: "50%", background: c.accent, boxShadow: `0 0 8px ${c.accent}`, animation: "pulse-dot 1.5s infinite" }} />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <span style={{ color: c.accent, opacity: .8 }}>{c.icon}</span>
              <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--text-3)" }}>
                {c.label}
              </span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: "18px", color: c.accent, lineHeight: 1, letterSpacing: "-.3px" }}>
              {c.val}
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        background: "var(--panel-2)",
        borderBottom: "1px solid rgba(255,255,255,.06)",
        flexShrink: 0,
      }}>
        {/* Top row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 20px", gap: "12px",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* View mode toggle */}
            <div style={{
              display: "flex", background: "rgba(255,255,255,.04)", borderRadius: "9px",
              padding: "3px", border: "1px solid rgba(255,255,255,.07)",
            }}>
              {([
                { mode: "calendar", Icon: Calendar, label: t.calendarMode },
                { mode: "recent",   Icon: Clock,    label: t.recentUploads },
              ] as const).map(({ mode, Icon, label }) => (
                <button key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "6px 12px", borderRadius: "7px", border: "none", cursor: "pointer",
                    fontSize: "12px", fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif",
                    transition: "all .18s",
                    background: viewMode === mode ? "linear-gradient(135deg,#06b6d4,#0891b2)" : "transparent",
                    color: viewMode === mode ? "#fff" : "var(--text-3)",
                    boxShadow: viewMode === mode ? "0 2px 10px rgba(6,182,212,.3)" : "none",
                  }}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {/* Year selector */}
            {viewMode === "calendar" && (
              <div style={{ position: "relative" }}>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="c-input"
                  style={{ padding: "7px 32px 7px 12px", width: "86px", fontSize: "12px", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
              </div>
            )}
          </div>

          {/* Search + Upload */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="glow-wrap" style={{ position: "relative" }}>
              <input
                type="text"
                placeholder={t.search}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="c-input"
                style={{ paddingLeft: "34px", width: "180px", fontSize: "12px" }}
              />
              <Search size={13} className="glow-icon" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
            </div>

            <input type="file" ref={fileRef} onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="c-btn-primary"
              style={{
                padding: "8px 16px", fontSize: "12px",
                display: "flex", alignItems: "center", gap: "7px", whiteSpace: "nowrap",
              }}
            >
              {uploading ? (
                <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> {t.analyzing}</>
              ) : (
                <><Upload size={14} /> <span className="hidden xs:inline">{t.uploadInvoice}</span><span style={{ display: "none" }}>Yükle</span></>
              )}
            </button>
          </div>
        </div>

        {/* Month tabs */}
        {viewMode === "calendar" && (
          <div style={{
            display: "flex", overflowX: "auto",
            borderTop: "1px solid rgba(255,255,255,.05)",
          }} className="no-scrollbar">
            {t.months.map((m: string, idx: number) => {
              const isActive = selectedMonth === idx;
              return (
                <button key={idx}
                  onClick={() => setSelectedMonth(idx)}
                  style={{
                    flex: "1 0 72px", minWidth: "72px",
                    padding: "10px 4px",
                    fontSize: "11px", fontWeight: isActive ? 700 : 500,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    border: "none", cursor: "pointer",
                    borderBottom: `2px solid ${isActive ? "#06b6d4" : "transparent"}`,
                    background: isActive ? "rgba(6,182,212,.06)" : "transparent",
                    color: isActive ? "#06b6d4" : "var(--text-3)",
                    transition: "all .15s",
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.background = "rgba(255,255,255,.03)"; }}}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "transparent"; }}}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Invoice List ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "var(--text-3)", fontSize: "13px", gap: "10px" }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> {t.loading}
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", gap: "10px" }}>
            <FileText size={32} style={{ color: "var(--text-dim)" }} />
            <span style={{ color: "var(--text-3)", fontSize: "13px" }}>{t.noInvoices}</span>
          </div>
        ) : (
          <table className="c-table" style={{ minWidth: "700px" }}>
            <thead>
              <tr>
                {[t.invoiceNumber, t.supplier, t.invoiceDate, t.totalNet, t.totalVat, t.totalGross, t.status].map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <React.Fragment key={inv.id}>
                  {/* Invoice row */}
                  <tr
                    onClick={() => handleRowClick(inv)}
                    className={selectedInvoice?.id === inv.id ? "selected" : ""}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "var(--text-2)" }}>
                      {safeRender(inv.invoice_number)}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          width: "26px", height: "26px", borderRadius: "7px",
                          background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          {inv.file_type?.includes("pdf")
                            ? <FileText size={12} style={{ color: "var(--text-3)" }} />
                            : <ImageIcon size={12} style={{ color: "var(--text-3)" }} />}
                        </div>
                        <span style={{ color: "var(--text-1)", fontWeight: 500, fontSize: "12px" }}>{safeRender(inv.supplier_name)}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px" }}>
                      {safeRender(inv.invoice_date)}
                    </td>
                    <td style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px" }}>
                      {inv.total_net ? fmtEur(Number(inv.total_net)) : "—"}
                    </td>
                    <td style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px" }}>
                      {inv.total_vat ? fmtEur(Number(inv.total_vat)) : "—"}
                    </td>
                    <td style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "var(--text-1)", fontSize: "12px" }}>
                      {inv.total_gross ? fmtEur(Number(inv.total_gross)) : "—"}
                    </td>
                    <td>{statusBadge(inv.status)}</td>
                  </tr>

                  {/* Expanded detail row */}
                  {selectedInvoice?.id === inv.id && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, background: "rgba(6,182,212,.03)", borderBottom: "1px solid rgba(6,182,212,.12)" }}>
                        <div style={{ padding: "16px 20px" }}>
                          {currentItems.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-3)", fontSize: "12px" }}>
                              Kalem yok
                            </div>
                          ) : (
                            <div style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,.07)" }}>
                              <table className="c-table" style={{ fontSize: "11px" }}>
                                <thead>
                                  <tr>
                                    {[t.description, t.quantity, t.unitPrice, t.vatRate, t.vatAmount, t.netAmount, t.grossAmount, t.accountCode, t.matchScore].map((h, i) => (
                                      <th key={i} style={{ fontSize: "9px", background: "rgba(0,0,0,.3)" }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {currentItems.map(item => (
                                    <tr key={item.id}
                                      onClick={e => { e.stopPropagation(); onSelectItem(item); }}
                                      className={selectedItem?.id === item.id ? "selected" : ""}
                                    >
                                      <td style={{ maxWidth: "200px" }}>
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }} title={item.description || ""}>
                                          {safeRender(item.description)}
                                        </span>
                                      </td>
                                      <td style={{ fontFamily: "'Space Mono', monospace" }}>{safeRender(item.quantity)}</td>
                                      <td style={{ fontFamily: "'Space Mono', monospace" }}>{item.unit_price ? Number(item.unit_price).toFixed(2) : "—"}</td>
                                      <td>
                                        {item.vat_rate != null
                                          ? <span style={{ padding: "1px 7px", borderRadius: "20px", background: "rgba(6,182,212,.1)", color: "#06b6d4", fontFamily: "'Space Mono', monospace", fontSize: "10px", fontWeight: 700 }}>%{item.vat_rate}</span>
                                          : "—"}
                                      </td>
                                      <td style={{ fontFamily: "'Space Mono', monospace" }}>{item.vat_amount ? Number(item.vat_amount).toFixed(2) : "—"}</td>
                                      <td style={{ fontFamily: "'Space Mono', monospace" }}>{item.net_amount ? Number(item.net_amount).toFixed(2) : "—"}</td>
                                      <td style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "var(--text-1)" }}>
                                        {item.gross_amount ? fmtEur(Number(item.gross_amount)) : "—"}
                                      </td>
                                      <td>
                                        <span style={{ fontFamily: "'Space Mono', monospace", color: "#06b6d4", fontWeight: 700, fontSize: "11px" }}>
                                          {safeRender(item.account_code)}
                                        </span>
                                      </td>
                                      <td>{scoreBadge(item.match_score)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
