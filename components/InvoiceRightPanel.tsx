import React, { useState, useEffect } from "react";
import { useLang } from "../LanguageContext";
import { Invoice } from "../types";
import {
  X, FileText, Trash2, ImageIcon, Brain,
  ZoomIn, ZoomOut, RotateCw, Edit3,
  ChevronDown, ChevronUp, Target, BarChart3, BookOpen, Tag, AlertTriangle, CheckCircle2,
  Layers, ShoppingCart, Info, ArrowLeft,
} from "lucide-react";
import { saveLearningRule } from "../services/learningEngine";

interface InvoiceRightPanelProps {
  selectedInvoice: Invoice | null;
  onClose: () => void;
  onDelete?: (invoice: Invoice) => void;
  detailItem?: any;
  onClearDetailItem?: () => void;
  onUpdateItems?: (invoiceId: string, items: any[]) => void;
  onUpdateInvoice?: (invoiceId: string, updates: Partial<Invoice>) => void;
}

export const InvoiceRightPanel: React.FC<InvoiceRightPanelProps> = ({
  selectedInvoice, onClose, onDelete, detailItem, onClearDetailItem, onUpdateItems, onUpdateInvoice,
}) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<"preview" | "detail">("preview");

  // When detailItem arrives from center panel, switch to detail tab
  React.useEffect(() => {
    if (detailItem) setRightTab("detail");
  }, [detailItem]);

  // Preview URL management
  // Images: use data: URL directly (CSP allows img-src data:)
  // PDFs: convert to blob: URL (iframes block data: URLs)
  const fileUrl = selectedInvoice?.file_url || null;
  const isPdf = fileUrl?.startsWith("data:application/pdf") || fileUrl?.endsWith(".pdf");
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileUrl || !isPdf || !fileUrl.startsWith("data:")) {
      setPdfBlobUrl(null);
      return;
    }

    let blobUrl: string | null = null;
    try {
      const [header, base64] = fileUrl.split(",");
      const mimeMatch = header.match(/data:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      blobUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(blobUrl);
    } catch {
      setPdfBlobUrl(null);
    }

    return () => {
      if (blobUrl) {
        setTimeout(() => URL.revokeObjectURL(blobUrl!), 1000);
      }
    };
  }, [fileUrl, isPdf]);

  // For images: data URL works directly
  // For PDFs: data: → blob URL (iframe blocks data:), https:// → direct URL
  const previewUrl = isPdf
    ? (fileUrl?.startsWith("data:") ? pdfBlobUrl : fileUrl)
    : fileUrl;

  if (!selectedInvoice) {
    return (
      <div className="w-full md:w-[420px] md:min-w-[420px] flex flex-col h-full items-center justify-center"
        style={{ background: "#0d0f15", borderLeft: "1px solid #1c1f27" }}>
        <FileText size={48} className="mb-3 opacity-50" style={{ color: "#1c1f27" }} />
        <p className="text-xs" style={{ color: "#3a3f4a" }}>
          {tr("Detay gormek icin bir fatura secin", "Wahlen Sie eine Rechnung")}
        </p>
      </div>
    );
  }

  const inv = selectedInvoice;
  const rawResponse = inv.raw_ai_response;
  const hasImage = inv.file_url;

  // Helper: determine account class category
  const getAccountCategory = (code: string) => {
    const cls = code?.charAt(0);
    const categories: Record<string, [string, string, string]> = {
      "0": ["Anlagevermögen", "Duran Varliklar", "#8b5cf6"],
      "1": ["Finanzkonten", "Finans Hesaplari", "#06b6d4"],
      "2": ["Verbindlichkeiten", "Borclar", "#f59e0b"],
      "3": ["Wareneingang", "Mal Alislari", "#10b981"],
      "4": ["Betriebliche Aufwendungen", "Isletme Giderleri", "#ef4444"],
      "5": ["Erträge (Sonstige)", "Diger Gelirler", "#a78bfa"],
      "6": ["Erträge (Sonstige)", "Diger Gelirler", "#a78bfa"],
      "7": ["Bestandsveränderungen", "Stok Degisimleri", "#14b8a6"],
      "8": ["Erlöse / Umsatz", "Gelirler / Ciro", "#22c55e"],
      "9": ["Vorträge / Kapital", "Devirler / Sermaye", "#64748b"],
    };
    return categories[cls] || ["Sonstige", "Diger", "#64748b"];
  };

  // Render detail card for a specific item (from center panel click or from items list)
  const renderDetailCard = (item: any, inList: boolean = false) => {
    if (!item) return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 40 }}>
        <Info size={36} style={{ color: "rgba(255,255,255,.08)" }} />
        <span style={{ fontSize: "12px", color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>
          {tr(
            "Merkez panelde bir hesap koduna tiklayarak detaylari gorun",
            "Klicken Sie auf einen Kontocode im mittleren Panel"
          )}
        </span>
      </div>
    );

    const accountCode = item.account_code || item.hesap_kodu || "---";
    const accountName = item.account_name || "";
    const accountNameTr = item.account_name_tr || "";
    const description = item.description || item.urun_adi || "---";
    const score = item.match_score ?? item.skor ?? null;
    const justification = item.match_justification || item.gerekce || "";
    const source = item.match_source || "";
    const expenseType = item.expense_type || "";
    const hgbRef = item.hgb_reference || "";
    const taxNote = item.tax_note || "";
    // Donem: kullanici secimi varsa onu kullan; yoksa fatura tarihinden otomatik turet
    const monthsTr = ["Ocak","Subat","Mart","Nisan","Mayis","Haziran","Temmuz","Agustos","Eylul","Ekim","Kasim","Aralik"];
    const monthsDe = ["Januar","Februar","Marz","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    const fmtPeriod = (y: number, m: number) => `${(lang === "tr" ? monthsTr : monthsDe)[m]} ${y}`;
    const invDate = selectedInvoice?.tarih ? new Date(selectedInvoice.tarih) : null;
    const autoPeriod = invDate && !isNaN(invDate.getTime()) ? fmtPeriod(invDate.getFullYear(), invDate.getMonth()) : "";
    const periodNote = item.period_note || autoPeriod;
    // Dropdown secenekleri: 2024-2026 yillari, 12 ay
    const periodOptions: { value: string; label: string }[] = [];
    for (let y = 2024; y <= 2026; y++) {
      for (let m = 0; m < 12; m++) periodOptions.push({ value: `${y}-${m}`, label: fmtPeriod(y, m) });
    }
    const currentPeriodValue = (() => {
      // periodNote'tan y-m cikar
      const all = [...monthsTr, ...monthsDe];
      const parts = periodNote.split(" ");
      if (parts.length >= 2) {
        const yr = parseInt(parts[parts.length - 1], 10);
        const mn = parts.slice(0, -1).join(" ");
        const idx = monthsTr.indexOf(mn) >= 0 ? monthsTr.indexOf(mn) : monthsDe.indexOf(mn);
        if (!isNaN(yr) && idx >= 0) return `${yr}-${idx}`;
      }
      return invDate && !isNaN(invDate.getTime()) ? `${invDate.getFullYear()}-${invDate.getMonth()}` : "";
    })();
    const handlePeriodChange = (val: string) => {
      const [yStr, mStr] = val.split("-");
      const y = parseInt(yStr, 10); const m = parseInt(mStr, 10);
      if (isNaN(y) || isNaN(m)) return;
      const newPeriod = fmtPeriod(y, m);
      if (!selectedInvoice || !onUpdateItems) return;
      const all = rawResponse?.items || rawResponse?.kalemler || [];
      const updated = all.map((it: any) => {
        if (it === item) {
          return { ...it, period_note: newPeriod, user_modified: true, user_modified_at: new Date().toISOString(), user_modified_field: "period_note" };
        }
        return it;
      });
      onUpdateItems(selectedInvoice.id, updated);
      // Faturanin tarihini ve raw period_start/period_end'i secilen donemin ilk/son gunune cek
      if (onUpdateInvoice) {
        const mm = String(m + 1).padStart(2, "0");
        const lastDay = new Date(y, m + 1, 0).getDate();
        const newStart = `${y}-${mm}-01`;
        const newEnd = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;
        const inv: any = selectedInvoice;
        const raw = { ...(inv.raw_ai_response || {}) };
        if (raw.fatura_bilgileri) raw.fatura_bilgileri = { ...raw.fatura_bilgileri, period_start: newStart, period_end: newEnd };
        if (raw.header) raw.header = { ...raw.header, period_start: newStart, period_end: newEnd };
        if (!raw.fatura_bilgileri && !raw.header) raw.fatura_bilgileri = { period_start: newStart, period_end: newEnd };
        onUpdateInvoice(selectedInvoice.id, { tarih: newStart, raw_ai_response: raw } as any);
      }
    };
    const counterAccount = item.datev_counter_account || "";
    const category = getAccountCategory(accountCode);
    const vatRate = item.vat_rate || item.kdv_orani || 0;
    const grossAmount = item.gross_amount || item.satir_toplami || 0;
    const netAmount = item.net_amount || item.net_tutar || 0;

    const innerContent = (
      <>
          {/* Back button if from center panel */}
          {!inList && onClearDetailItem && detailItem && (
            <button onClick={onClearDetailItem} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
              borderRadius: "6px", border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(255,255,255,.03)", cursor: "pointer",
              color: "#64748b", fontSize: "11px", fontWeight: 500, alignSelf: "flex-start",
            }}>
              <ArrowLeft size={12} /> {tr("Onizlemeye Don", "Zuruck zur Vorschau")}
            </button>
          )}

          {/* User-modified note */}
          {item.user_modified && (
            <div style={{
              padding: "10px 12px", borderRadius: "10px",
              background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)",
              display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <Edit3 size={13} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
                  {tr("Kullanici Tarafindan Duzenlendi", "Vom Benutzer bearbeitet")}
                </div>
                <div style={{ fontSize: "11px", color: "#fbbf24", lineHeight: 1.5 }}>
                  {tr(
                    "Bu kalem manuel olarak guncellendi. AI analizinin orijinal sonucu degistirilmistir.",
                    "Diese Position wurde manuell aktualisiert. Das ursprungliche KI-Analyseergebnis wurde geandert."
                  )}
                  {item.user_modified_old_account && (
                    <div style={{ marginTop: 4, fontSize: "10px", color: "#fcd34d" }}>
                      {tr("Eski hesap kodu", "Altes Konto")}: <b>{item.user_modified_old_account}</b>
                    </div>
                  )}
                  {item.user_modified_old_net !== undefined && (
                    <div style={{ marginTop: 2, fontSize: "10px", color: "#fcd34d" }}>
                      {tr("Eski net tutar", "Alter Netto-Betrag")}: <b>{item.user_modified_old_net} EUR</b>
                    </div>
                  )}
                  {item.user_modified_old !== undefined && !item.user_modified_old_account && item.user_modified_old_net === undefined && (
                    <div style={{ marginTop: 2, fontSize: "10px", color: "#fcd34d" }}>
                      {tr("Onceki deger", "Vorheriger Wert")}: <b>{String(item.user_modified_old)}</b>
                    </div>
                  )}
                  {item.user_modified_at && (
                    <div style={{ marginTop: 4, fontSize: "9px", color: "#fcd34d", opacity: .8 }}>
                      {new Date(item.user_modified_at).toLocaleString(lang === "tr" ? "tr-TR" : "de-DE")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Item Description Header */}
          <div style={{
            padding: "14px 16px", borderRadius: "12px",
            background: "linear-gradient(135deg, rgba(6,182,212,.08) 0%, rgba(139,92,246,.06) 100%)",
            border: "1px solid rgba(6,182,212,.15)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <ShoppingCart size={14} style={{ color: "#06b6d4" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" }}>
                {tr("Urun / Hizmet", "Artikel / Dienstleistung")}
              </span>
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9", lineHeight: 1.5 }}>
              {description}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
              {grossAmount > 0 && (
                <div>
                  <div style={{ fontSize: "9px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".04em" }}>Brutto</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#06b6d4", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(grossAmount)} EUR
                  </div>
                </div>
              )}
              {netAmount > 0 && (
                <div>
                  <div style={{ fontSize: "9px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".04em" }}>Netto</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(netAmount)} EUR
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: "9px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".04em" }}>MwSt.</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#f59e0b", fontFamily: "'Space Grotesk', sans-serif" }}>%{vatRate}</div>
              </div>
            </div>
          </div>

          {/* Account Code Big Card */}
          <div style={{
            padding: "16px", borderRadius: "12px",
            background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.18)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "14px",
                background: "linear-gradient(135deg, rgba(139,92,246,.2), rgba(6,182,212,.15))",
                border: "1px solid rgba(139,92,246,.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Space Grotesk', monospace", fontSize: "20px", fontWeight: 800, color: "#a78bfa",
              }}>
                {accountCode}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", marginBottom: 3 }}>
                  {accountName || accountCode}
                </div>
                {accountNameTr && accountNameTr !== accountName && (
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: 4 }}>{accountNameTr}</div>
                )}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 8px", borderRadius: "4px",
                  background: `${category[2]}15`, border: `1px solid ${category[2]}30`,
                  fontSize: "10px", fontWeight: 600, color: category[2],
                }}>
                  <Layers size={10} />
                  {tr(`Sinif ${accountCode?.charAt(0)}: ${category[1]}`, `Klasse ${accountCode?.charAt(0)}: ${category[0]}`)}
                </div>
              </div>
            </div>
          </div>

          {/* Confidence Score */}
          {score !== null && (
            <div style={{
              padding: "12px 16px", borderRadius: "10px",
              background: score >= 80 ? "rgba(16,185,129,.06)" : score >= 50 ? "rgba(245,158,11,.06)" : "rgba(239,68,68,.06)",
              border: `1px solid ${score >= 80 ? "rgba(16,185,129,.2)" : score >= 50 ? "rgba(245,158,11,.2)" : "rgba(239,68,68,.2)"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <BarChart3 size={16} style={{ color: score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
                    {tr("Guven Skoru", "Konfidenz")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.min(100, score)}%`, height: "100%", borderRadius: 4,
                        background: score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444",
                        transition: "width .3s",
                      }} />
                    </div>
                    <span style={{
                      fontSize: "16px", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                      color: score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444",
                    }}>
                      %{score}
                    </span>
                  </div>
                </div>
              </div>
              {score >= 90 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <CheckCircle2 size={12} style={{ color: "#10b981" }} />
                  <span style={{ fontSize: "10px", color: "#10b981" }}>
                    {tr("Yuksek guvenle atandi", "Mit hoher Konfidenz zugewiesen")}
                  </span>
                </div>
              )}
              {score < 60 && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8 }}>
                  <AlertTriangle size={12} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: "10px", color: "#fbbf24", lineHeight: 1.4 }}>
                    {tr(
                      "Dusuk guven skoru — manuel dogrulama oneriliyor.",
                      "Niedriger Konfidenzwert — manuelle Uberprufung empfohlen."
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Analysis Justification */}
          {justification && (
            <div style={{
              padding: "14px 16px", borderRadius: "10px",
              background: "rgba(6,182,212,.04)", border: "1px solid rgba(6,182,212,.12)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Target size={13} style={{ color: "#06b6d4", flexShrink: 0 }} />
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  {tr("Neden Bu Hesap Kodu?", "Warum dieses Konto?")}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.7 }}>
                {justification}
              </div>
            </div>
          )}

          {/* Material/Category Analysis */}
          <div style={{
            padding: "14px 16px", borderRadius: "10px",
            background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Brain size={13} style={{ color: "#a78bfa" }} />
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: ".04em" }}>
                {tr("Kategori & Siniflandirma", "Kategorie & Klassifizierung")}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Source */}
              {source && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>{tr("Kaynak", "Quelle")}</span>
                  <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px",
                    background: source === "rule" ? "rgba(167,139,250,.12)" : source === "rule_learned" ? "rgba(16,185,129,.12)" : "rgba(6,182,212,.12)",
                    color: source === "rule" ? "#a78bfa" : source === "rule_learned" ? "#10b981" : "#06b6d4",
                  }}>
                    {source === "ai" ? "AI Analiz" : source === "rule" ? "Manuel Kural" : source === "rule_learned" ? "Ogrenilmis Kural" : source}
                  </span>
                </div>
              )}
              {/* Expense Type */}
              {expenseType && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>{tr("Gider Turu", "Aufwandsart")}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b" }}>{expenseType}</span>
                </div>
              )}
              {/* Counter Account */}
              {counterAccount && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>{tr("Karsi Hesap", "Gegenkonto")}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#8b5cf6", fontFamily: "'Space Grotesk', sans-serif" }}>{counterAccount}</span>
                </div>
              )}
              {/* Account Class */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#64748b" }}>{tr("Hesap Sinifi", "Kontenklasse")}</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: category[2] }}>
                  {tr(`${category[1]} (${accountCode?.charAt(0)})`, `${category[0]} (${accountCode?.charAt(0)})`)}
                </span>
              </div>
              {/* HGB Reference */}
              {hgbRef && hgbRef !== "N/A" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>HGB Referans</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8" }}>{hgbRef}</span>
                </div>
              )}
              {/* Tax Note */}
              {taxNote && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>{tr("Vergi Notu", "Steuerhinweis")}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8" }}>{taxNote}</span>
                </div>
              )}
              {/* Period — kullanici degistirebilir */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#64748b" }}>{tr("Donem", "Periode")}</span>
                <select
                  value={currentPeriodValue}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  style={{
                    fontSize: "11px", fontWeight: 600, color: "#94a3b8",
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 4, padding: "2px 6px", cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {periodOptions.map(opt => (
                    <option key={opt.value} value={opt.value} style={{ background: "#0d0f15", color: "#e2e8f0" }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SKR03 Context Explanation */}
          <div style={{
            padding: "12px 16px", borderRadius: "10px",
            background: "rgba(139,92,246,.04)", border: "1px solid rgba(139,92,246,.1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <BookOpen size={13} style={{ color: "#a78bfa" }} />
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: ".04em" }}>
                SKR03 {tr("Aciklama", "Erklarung")}
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "#94a3b8", lineHeight: 1.7 }}>
              {tr(
                `${accountCode} hesap kodu, SKR03 kontenrahmen sisteminde "${accountName || accountNameTr}" olarak tanimlanmistir. Bu hesap "${category[1]}" sinifina aittir ve genellikle ${
                  accountCode?.startsWith("4") ? "isletme giderleri ve operasyonel masraflar" :
                  accountCode?.startsWith("3") ? "mal ve malzeme alimlari" :
                  accountCode?.startsWith("8") ? "satis gelirleri ve ciro" :
                  accountCode?.startsWith("1") ? "banka ve kasa islemleri" :
                  accountCode?.startsWith("0") ? "duran varlik yatirimlari" :
                  "muhasebe islemleri"
                } icin kullanilir.`,
                `Das Konto ${accountCode} ist im SKR03 als "${accountName}" definiert. Es gehort zur Klasse "${category[0]}" und wird typischerweise fur ${
                  accountCode?.startsWith("4") ? "betriebliche Aufwendungen" :
                  accountCode?.startsWith("3") ? "Wareneinkauf" :
                  accountCode?.startsWith("8") ? "Erlose und Umsatz" :
                  accountCode?.startsWith("1") ? "Bank- und Kassenvorgange" :
                  accountCode?.startsWith("0") ? "Anlagevermogen" :
                  "Buchungsvorgange"
                } verwendet.`
              )}
            </div>
          </div>
      </>
    );

    if (inList) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {innerContent}
        </div>
      );
    }
    return (
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {innerContent}
        </div>
      </div>
    );
  };

  const renderExpenseAnalysis = () => {
    const items: any[] = rawResponse?.items || rawResponse?.kalemler || [];
    if (!items.length) {
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 40 }}>
          <Info size={36} style={{ color: "rgba(255,255,255,.08)" }} />
          <span style={{ fontSize: "12px", color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>
            {tr("Bu faturada kalem bulunamadi", "Keine Positionen in dieser Rechnung")}
          </span>
        </div>
      );
    }
    return (
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* ─── Üst: Kalem listesi (özet) ─── */}
          <div style={{
            borderRadius: "12px",
            background: "rgba(6,182,212,.04)",
            border: "1px solid rgba(6,182,212,.15)",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(6,182,212,.12)",
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(6,182,212,.06)",
            }}>
              <ShoppingCart size={13} style={{ color: "#06b6d4" }} />
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", textTransform: "uppercase", letterSpacing: ".06em" }}>
                {tr("Kalemler", "Positionen")} ({items.length})
              </span>
            </div>
            <div>
              {items.map((it: any, i: number) => {
                const code = it.account_code || it.hesap_kodu || "---";
                const name = it.description || it.urun_adi || "---";
                const gross = it.gross_amount || it.satir_toplami || 0;
                return (
                  <a
                    key={i}
                    href={`#expense-item-${i}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(`expense-item-${i}`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 14px",
                      borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                      textDecoration: "none", cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 36, textAlign: "center",
                      fontFamily: "'Space Grotesk', monospace", fontSize: "11px", fontWeight: 700,
                      color: "#a78bfa", padding: "2px 6px", borderRadius: 4,
                      background: "rgba(139,92,246,.1)", border: "1px solid rgba(139,92,246,.2)",
                    }}>{code}</span>
                    <span style={{ flex: 1, fontSize: "11px", color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#06b6d4", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(gross)} €
                    </span>
                  </a>
                );
              })}
            </div>
          </div>

          {/* ─── Alt: Her kalem için açıklama kartları ─── */}
          {items.map((it: any, i: number) => (
            <div key={i} id={`expense-item-${i}`} style={{
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,.06)",
              background: "rgba(255,255,255,.015)",
              padding: "14px",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 12, paddingBottom: 10,
                borderBottom: "1px solid rgba(255,255,255,.05)",
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "10px", fontWeight: 800, color: "#06b6d4",
                }}>{i + 1}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {tr("Kalem", "Position")} {i + 1} / {items.length}
                </span>
              </div>
              {renderDetailCard(it, true)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full md:w-[420px] md:min-w-[420px] flex flex-col h-full"
      style={{ background: "#0d0f15", borderLeft: "1px solid rgba(255,255,255,.06)" }}>

      {/* Header with Tabs */}
      <div style={{
        padding: "10px 16px 0", borderBottom: "1px solid rgba(255,255,255,.06)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", gap: "8px" }}>
          <button
            onClick={onClose}
            title={tr("Geri", "Zurück")}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 12px", borderRadius: "8px",
              background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.3)",
              cursor: "pointer", color: "#06b6d4", fontSize: "12px", fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0,
            }}
          >
            <ArrowLeft size={14} />
            <span>{tr("Geri", "Zurück")}</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1, justifyContent: "flex-end" }}>
            <ImageIcon size={14} style={{ color: "#06b6d4", flexShrink: 0 }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'Space Grotesk', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {inv.fatura_no || tr("Fatura", "Rechnung")}
            </span>
          </div>
        </div>
        {/* Tab Bar */}
        <div style={{ display: "flex", gap: "2px" }}>
          {([
            { key: "preview" as const, label: tr("Fatura Onizleme", "Vorschau"), icon: <ImageIcon size={12} /> },
            { key: "detail" as const, label: tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse"), icon: <BookOpen size={12} /> },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setRightTab(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "7px 14px", fontSize: "11px", fontWeight: 600,
                border: "none", cursor: "pointer",
                borderBottom: rightTab === tab.key ? "2px solid #06b6d4" : "2px solid transparent",
                background: rightTab === tab.key ? "rgba(6,182,212,.06)" : "transparent",
                color: rightTab === tab.key ? "#06b6d4" : "#64748b",
                borderRadius: "6px 6px 0 0",
                transition: "all .15s",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {tab.icon} {tab.label}
              {tab.key === "detail" && detailItem && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#06b6d4", display: "inline-block", marginLeft: 2,
                }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      {rightTab === "preview" ? (
        <>
          {/* Image Preview Area */}
          <div style={{
            height: "45%", minHeight: "200px", flexShrink: 0,
            background: "rgba(0,0,0,.3)",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            display: "flex", flexDirection: "column",
            position: "relative", overflow: "hidden",
          }}>
            {/* Zoom/Rotate controls */}
            <div style={{
              position: "absolute", top: "8px", right: "8px", zIndex: 2,
              display: "flex", gap: "4px",
            }}>
              <ToolBtn icon={<ZoomIn size={12} />} onClick={() => setZoom(z => Math.min(z + 0.25, 3))} />
              <ToolBtn icon={<ZoomOut size={12} />} onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} />
              <ToolBtn icon={<RotateCw size={12} />} onClick={() => setRotation(r => (r + 90) % 360)} />
            </div>

            {hasImage && previewUrl ? (
              <div style={{
                flex: 1, overflow: "auto",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "10px",
              }}>
                {isPdf ? (
                  <iframe
                    src={previewUrl}
                    title="Fatura PDF"
                    style={{
                      width: "100%", height: "100%", border: "none",
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: "transform .2s",
                    }}
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Fatura"
                    style={{
                      maxWidth: "100%", maxHeight: "100%",
                      objectFit: "contain",
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: "transform .2s",
                      borderRadius: "6px",
                    }}
                  />
                )}
              </div>
            ) : (
              <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: "8px",
              }}>
                <FileText size={36} style={{ color: "rgba(255,255,255,.08)" }} />
                <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                  {tr("Gorsel yuklendiginde burada gorunecek", "Vorschau wird hier angezeigt")}
                </span>
                <span style={{ fontSize: "9px", color: "var(--text-dim)", opacity: .5 }}>
                  {tr("(Gorsel depolama yakilasimda)", "(Bildspeicher in Kurze)")}
                </span>
              </div>
            )}
          </div>

          {/* AI Analysis Data */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {/* Section Header */}
            <div style={{
              padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px",
              borderBottom: "1px solid rgba(255,255,255,.05)",
              background: "rgba(139,92,246,.03)",
            }}>
              <Brain size={14} style={{ color: "#a78bfa" }} />
              <span style={{
                fontSize: "11px", fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", color: "#a78bfa",
                fontFamily: "'Space Grotesk', sans-serif",
              }}>
                {tr("AI Analiz Sonuclari", "KI-Analyseergebnisse")}
              </span>
            </div>

            <div style={{ padding: "12px 16px" }}>
              {rawResponse ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <JsonBlock label={tr("Fatura Bilgileri", "Rechnungsinfo")} data={rawResponse.header || rawResponse.fatura_bilgileri} />
                  <JsonBlock label={tr("Finansal Ozet", "Finanzzusammenfassung")} data={rawResponse.finansal_ozet || { net: rawResponse.header?.total_net, kdv: rawResponse.header?.total_vat, brut: rawResponse.header?.total_gross }} />

                  {(rawResponse.items || rawResponse.kalemler)?.length > 0 && (
                    <div style={{
                      borderRadius: "10px", border: "1px solid rgba(139,92,246,.15)",
                      background: "rgba(139,92,246,.03)", overflow: "hidden",
                    }}>
                      <div style={{
                        padding: "8px 12px", fontSize: "10px", fontWeight: 700,
                        color: "#a78bfa", letterSpacing: ".05em", textTransform: "uppercase",
                        borderBottom: "1px solid rgba(139,92,246,.1)",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}>
                        {tr("Kalemler", "Positionen")} ({(rawResponse.items || rawResponse.kalemler)?.length})
                        <span style={{ fontSize: "9px", fontWeight: 400, marginLeft: 8, opacity: .6, textTransform: "none", letterSpacing: 0 }}>
                          {tr("— detay icin tiklayin", "— klicken fur Details")}
                        </span>
                      </div>
                      <div style={{ padding: "8px 12px" }}>
                        {(rawResponse.items || rawResponse.kalemler)?.map((k: any, i: number) => {
                          const isOpen = selectedItemIdx === i;
                          const kScore = k.match_score ?? k.skor ?? null;
                          const kJustification = k.match_justification || k.gerekce || "";
                          const kSource = k.match_source || "";
                          const kAccountCode = k.account_code || k.hesap_kodu || "---";
                          const kAccountName = k.account_name || "";
                          const kAccountNameTr = k.account_name_tr || "";
                          const kExpenseType = k.expense_type || "";
                          const kHgbRef = k.hgb_reference || "";
                          const kTaxNote = k.tax_note || "";
                          const kPeriodNote = k.period_note || "";
                          const kCounterAccount = k.datev_counter_account || "";
                          const modField = String(k.user_modified_field || "");
                          const isModified = !!k.user_modified && (modField.includes("net_amount") || modField.includes("period_note") || modField.includes("amount") || modField.includes("period"));
                          const modifiedBg = isModified
                            ? "linear-gradient(135deg, rgba(250,204,21,.18) 0%, rgba(234,179,8,.10) 100%)"
                            : (isOpen ? "rgba(139,92,246,.06)" : "transparent");
                          const modifiedHoverBg = isModified
                            ? "linear-gradient(135deg, rgba(250,204,21,.24) 0%, rgba(234,179,8,.14) 100%)"
                            : "rgba(139,92,246,.04)";

                          return (
                            <div key={i} style={isModified ? {
                              border: "1px solid rgba(250,204,21,.45)",
                              borderRadius: "10px",
                              boxShadow: "0 0 0 1px rgba(250,204,21,.15), 0 4px 14px rgba(250,204,21,.08)",
                              margin: "6px 0",
                              overflow: "hidden",
                            } : undefined}>
                              {/* Item row (clickable) */}
                              <div
                                onClick={() => setSelectedItemIdx(isOpen ? null : i)}
                                style={{
                                  padding: "8px 10px",
                                  borderBottom: !isOpen && !isModified && i < (rawResponse.items || rawResponse.kalemler)?.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                  borderRadius: isModified ? "10px" : (isOpen ? "8px 8px 0 0" : "0"),
                                  background: modifiedBg,
                                  transition: "background .15s",
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = modifiedHoverBg; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = modifiedBg; }}
                              >
                                {isModified && (
                                  <div style={{
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                    padding: "2px 8px",
                                    marginBottom: 6,
                                    borderRadius: 999,
                                    background: "linear-gradient(135deg, #facc15 0%, #eab308 100%)",
                                    color: "#1a1505",
                                    fontSize: 9,
                                    fontWeight: 800,
                                    letterSpacing: ".05em",
                                    textTransform: "uppercase",
                                    boxShadow: "0 2px 6px rgba(250,204,21,.35)",
                                  }}>
                                    <Edit3 size={9} /> {modField.includes("period") && modField.includes("amount") ? tr("Tutar & Donem Degisti", "Betrag & Periode geandert") : modField.includes("period") ? tr("Donem Degisti", "Periode geandert") : tr("Tutar Degisti", "Betrag geandert")}
                                  </div>
                                )}
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px", alignItems: "center" }}>
                                  <span style={{ color: "#e2e8f0", fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {k.urun_adi || k.description}
                                  </span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                    <span style={{ color: "#06b6d4", fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", fontSize: "11px" }}>
                                      {typeof (k.satir_toplami || k.gross_amount) === "number" ? (k.satir_toplami || k.gross_amount).toFixed(2) + " \u20AC" : "---"}
                                    </span>
                                    {isOpen
                                      ? <ChevronUp size={12} style={{ color: "#a78bfa" }} />
                                      : <ChevronDown size={12} style={{ color: "#475569" }} />
                                    }
                                  </div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                                    Hesap: <span style={{ color: "#a78bfa", fontWeight: 600 }}>{kAccountCode}</span> &middot; {tr("Miktar", "Menge")}: {k.quantity || k.miktar} &middot; KDV: %{k.vat_rate || k.kdv_orani}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const satici = rawResponse?.header?.supplier_name || rawResponse?.fatura_bilgileri?.satici_adi || "Bilinmeyen Tedarikci";
                                      const desc = k.description || k.urun_adi || "";
                                      const oldCode = k.account_code || k.hesap_kodu || "";
                                      const oldNet = Number(k.net_amount ?? k.net_tutar ?? 0);
                                      const newCode = window.prompt(`'${desc}' kalemi icin yeni Hesap Kodu:\n\nOnceki: ${oldCode}`, String(oldCode));
                                      if (newCode === null) return;
                                      const newAmtStr = window.prompt(`'${desc}' kalemi icin yeni Net Tutar (EUR):\n\nOnceki: ${oldNet}`, String(oldNet));
                                      if (newAmtStr === null) return;
                                      const newAmt = parseFloat(String(newAmtStr).replace(",", "."));
                                      const codeChanged = newCode.trim() && newCode.trim() !== oldCode;
                                      const amtChanged = !isNaN(newAmt) && newAmt !== oldNet;
                                      if (!codeChanged && !amtChanged) return;
                                      if (codeChanged) {
                                        saveLearningRule({
                                          supplierName: satici,
                                          itemDescription: desc,
                                          oldAccountCode: oldCode,
                                          accountCode: newCode.trim()
                                        });
                                      }
                                      if (selectedInvoice && onUpdateItems) {
                                        const allItems = (rawResponse.items || rawResponse.kalemler || []).map((it: any, idx: number) => {
                                          if (idx !== i) return it;
                                          const upd = { ...it };
                                          if (codeChanged) {
                                            upd.account_code = newCode.trim();
                                            upd.hesap_kodu = newCode.trim();
                                          }
                                          if (amtChanged) {
                                            const qty = Number(upd.quantity || upd.miktar || 1) || 1;
                                            const vatRate = Number(upd.vat_rate || upd.kdv_orani || 0);
                                            upd.net_amount = newAmt;
                                            upd.net_tutar = newAmt;
                                            upd.unit_price = +(newAmt / qty).toFixed(2);
                                            upd.vat_amount = +((newAmt * vatRate) / 100).toFixed(2);
                                            upd.gross_amount = +(newAmt + upd.vat_amount).toFixed(2);
                                          }
                                          upd.user_modified = true;
                                          upd.user_modified_at = new Date().toISOString();
                                          upd.user_modified_field = codeChanged && amtChanged ? "account_code,net_amount" : codeChanged ? "account_code" : "net_amount";
                                          if (codeChanged) upd.user_modified_old_account = oldCode;
                                          if (amtChanged) upd.user_modified_old_net = oldNet;
                                          return upd;
                                        });
                                        onUpdateItems(selectedInvoice.id, allItems);
                                      }
                                      alert(tr("Guncellendi.", "Aktualisiert."));
                                    }}
                                    title={tr("Hesap Kodunu Duzelt ve Ogret", "Konto korrigieren und lernen")}
                                    style={{
                                      background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.3)",
                                      borderRadius: "4px", padding: "2px 6px", cursor: "pointer",
                                      color: "#a78bfa", display: "flex", alignItems: "center", gap: "4px", fontSize: "9px"
                                    }}
                                  >
                                    <Edit3 size={9} /> {tr("Duzelt", "Korrigieren")}
                                  </button>
                                </div>
                              </div>

                              {/* Inline Analysis Detail Card */}
                              {isOpen && (
                                <div style={{
                                  margin: "0 0 8px 0",
                                  borderRadius: "0 0 10px 10px",
                                  border: "1px solid rgba(6,182,212,.2)",
                                  borderTop: "none",
                                  background: "linear-gradient(180deg, rgba(6,182,212,.04) 0%, rgba(139,92,246,.03) 100%)",
                                  overflow: "hidden",
                                }}>
                                  <div style={{
                                    padding: "10px 12px 8px",
                                    display: "flex", alignItems: "center", gap: 6,
                                    borderBottom: "1px solid rgba(6,182,212,.1)",
                                  }}>
                                    <BookOpen size={12} style={{ color: "#06b6d4" }} />
                                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", letterSpacing: ".04em", textTransform: "uppercase", fontFamily: "'Space Grotesk', sans-serif" }}>
                                      {tr("Hesap Kodu Analiz Gerekcesi", "Kontozuweisungs-Analyse")}
                                    </span>
                                  </div>

                                  <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                                    {/* Account Code Card */}
                                    <div style={{
                                      display: "flex", alignItems: "center", gap: 10,
                                      padding: "10px 12px", borderRadius: "8px",
                                      background: "rgba(139,92,246,.08)", border: "1px solid rgba(139,92,246,.15)",
                                    }}>
                                      <div style={{
                                        width: 42, height: 42, borderRadius: "10px",
                                        background: "rgba(139,92,246,.15)", border: "1px solid rgba(139,92,246,.25)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontFamily: "'Space Grotesk', monospace", fontSize: "15px", fontWeight: 800, color: "#a78bfa",
                                      }}>
                                        {kAccountCode}
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>
                                          {kAccountName || kAccountCode}
                                        </div>
                                        {kAccountNameTr && kAccountNameTr !== kAccountName && (
                                          <div style={{ fontSize: "10px", color: "#94a3b8" }}>{kAccountNameTr}</div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Score */}
                                    {kScore !== null && (
                                      <div style={{
                                        padding: "8px 12px", borderRadius: "8px",
                                        background: kScore >= 80 ? "rgba(16,185,129,.06)" : kScore >= 50 ? "rgba(245,158,11,.06)" : "rgba(239,68,68,.06)",
                                        border: `1px solid ${kScore >= 80 ? "rgba(16,185,129,.2)" : kScore >= 50 ? "rgba(245,158,11,.2)" : "rgba(239,68,68,.2)"}`,
                                        display: "flex", alignItems: "center", gap: 10,
                                      }}>
                                        <BarChart3 size={13} style={{ color: kScore >= 80 ? "#10b981" : kScore >= 50 ? "#f59e0b" : "#ef4444", flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                          <div style={{ fontSize: "9px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>
                                            {tr("Guven Skoru", "Konfidenz")}
                                          </div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                                              <div style={{
                                                width: `${Math.min(100, kScore)}%`, height: "100%", borderRadius: 3,
                                                background: kScore >= 80 ? "#10b981" : kScore >= 50 ? "#f59e0b" : "#ef4444",
                                                transition: "width .3s",
                                              }} />
                                            </div>
                                            <span style={{
                                              fontSize: "13px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                                              color: kScore >= 80 ? "#10b981" : kScore >= 50 ? "#f59e0b" : "#ef4444",
                                            }}>
                                              %{kScore}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Justification */}
                                    {kJustification && (
                                      <div style={{
                                        padding: "10px 12px", borderRadius: "8px",
                                        background: "rgba(6,182,212,.05)", border: "1px solid rgba(6,182,212,.12)",
                                      }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                          <Target size={11} style={{ color: "#06b6d4", flexShrink: 0 }} />
                                          <span style={{ fontSize: "9px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" }}>
                                            {tr("Atama Gerekcesi", "Zuweisungsbegrundung")}
                                          </span>
                                        </div>
                                        <div style={{ fontSize: "11px", color: "#cbd5e1", lineHeight: 1.6 }}>
                                          {kJustification}
                                        </div>
                                      </div>
                                    )}

                                    {/* Badges */}
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                      {kSource && (
                                        <DetailBadge
                                          icon={<Tag size={9} />}
                                          label={tr("Kaynak", "Quelle")}
                                          value={kSource === "ai" ? "AI Analiz" : kSource === "rule" ? "Manuel Kural" : kSource === "rule_learned" ? "Ogrenilmis Kural" : kSource}
                                          color={kSource === "rule" ? "#a78bfa" : kSource === "rule_learned" ? "#10b981" : "#06b6d4"}
                                        />
                                      )}
                                      {kExpenseType && (
                                        <DetailBadge icon={<Tag size={9} />} label={tr("Tur", "Typ")} value={kExpenseType} color="#f59e0b" />
                                      )}
                                      {kCounterAccount && (
                                        <DetailBadge icon={<Tag size={9} />} label={tr("Karsi Hesap", "Gegenkonto")} value={kCounterAccount} color="#8b5cf6" />
                                      )}
                                    </div>

                                    {/* Extra info */}
                                    {(kHgbRef || kTaxNote || kPeriodNote) && (
                                      <div style={{
                                        padding: "8px 12px", borderRadius: "8px",
                                        background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
                                        display: "flex", flexDirection: "column", gap: 4,
                                      }}>
                                        {kHgbRef && kHgbRef !== "N/A" && (
                                          <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                                            <span style={{ fontWeight: 600, color: "#64748b" }}>HGB: </span>{kHgbRef}
                                          </div>
                                        )}
                                        {kTaxNote && (
                                          <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                                            <span style={{ fontWeight: 600, color: "#64748b" }}>{tr("Vergi Notu", "Steuerhinweis")}: </span>{kTaxNote}
                                          </div>
                                        )}
                                        {kPeriodNote && (
                                          <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                                            <span style={{ fontWeight: 600, color: "#64748b" }}>{tr("Donem", "Periode")}: </span>{kPeriodNote}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Warnings */}
                                    {kScore !== null && kScore < 60 && (
                                      <div style={{
                                        padding: "8px 12px", borderRadius: "8px",
                                        background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.15)",
                                        display: "flex", alignItems: "flex-start", gap: 8,
                                      }}>
                                        <AlertTriangle size={13} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                                        <div style={{ fontSize: "10px", color: "#fbbf24", lineHeight: 1.5 }}>
                                          {tr(
                                            "Dusuk guven skoru — bu hesap kodu atamasi manuel dogrulama gerektirebilir.",
                                            "Niedriger Konfidenzwert — manuelle Uberprufung empfohlen."
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {kScore !== null && kScore >= 90 && (
                                      <div style={{
                                        padding: "6px 12px", borderRadius: "8px",
                                        background: "rgba(16,185,129,.05)", border: "1px solid rgba(16,185,129,.12)",
                                        display: "flex", alignItems: "center", gap: 6,
                                      }}>
                                        <CheckCircle2 size={12} style={{ color: "#10b981" }} />
                                        <span style={{ fontSize: "10px", color: "#10b981" }}>
                                          {tr("Yuksek guvenle atandi", "Mit hoher Konfidenz zugewiesen")}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(rawResponse.context || rawResponse.uyarilar?.length > 0) && (
                    <div style={{
                      borderRadius: "10px", border: "1px solid rgba(245,158,11,.15)",
                      background: "rgba(245,158,11,.03)", padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#fbbf24", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".05em" }}>
                        {tr("Uyarilar / Baglam", "Warnungen / Kontext")}
                      </div>
                      {rawResponse.context && typeof rawResponse.context === "string" ? (
                        <div style={{ fontSize: "11px", color: "#fbbf24", padding: "3px 0", opacity: .85 }}>
                          &bull; {rawResponse.context}
                        </div>
                      ) : (
                        (rawResponse.uyarilar || []).map((w: string, wi: number) => (
                          <div key={wi} style={{ fontSize: "11px", color: "#fbbf24", padding: "3px 0", opacity: .85 }}>
                            &bull; {w}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "30px 0", fontSize: "11px", color: "var(--text-dim)" }}>
                  {tr("AI analiz verisi bulunamadi", "Keine KI-Analysedaten")}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ── DETAIL TAB ── */
        renderExpenseAnalysis()
      )}

      {/* Footer - Delete */}
      {onDelete && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.06)", flexShrink: 0 }}>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { onDelete(inv); setConfirmDelete(false); }}
                style={{ flex: 1, padding: "8px 0", borderRadius: "8px", background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)", color: "#ef4444", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                {tr("Evet, Sil", "Ja, loschen")}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                style={{ flex: 1, padding: "8px 0", borderRadius: "8px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "var(--text-dim)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                {tr("Iptal", "Abbrechen")}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              style={{
                width: "100%", padding: "8px 0", borderRadius: "8px",
                background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)",
                color: "#f87171", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}>
              <Trash2 size={13} />
              {tr("Faturayi Sil", "Rechnung loschen")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Helpers ────────────────────────────────────

const ToolBtn: React.FC<{ icon: React.ReactNode; onClick: () => void }> = ({ icon, onClick }) => (
  <button onClick={onClick} style={{
    width: "26px", height: "26px", borderRadius: "6px",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.1)",
    cursor: "pointer", color: "#94a3b8", backdropFilter: "blur(8px)",
  }}>
    {icon}
  </button>
);

const DetailBadge: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <div style={{
    padding: "5px 10px", borderRadius: "6px",
    background: `${color}10`, border: `1px solid ${color}25`,
    display: "flex", alignItems: "center", gap: 5, fontSize: "10px",
  }}>
    <span style={{ color, display: "flex", alignItems: "center" }}>{icon}</span>
    <span style={{ color: "#64748b", fontWeight: 600 }}>{label}:</span>
    <span style={{ color, fontWeight: 600 }}>{value}</span>
  </div>
);

const JsonBlock: React.FC<{ label: string; data: any }> = ({ label, data }) => {
  if (!data || typeof data !== "object") return null;
  return (
    <div style={{
      borderRadius: "10px", border: "1px solid rgba(139,92,246,.15)",
      background: "rgba(139,92,246,.03)", overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 12px", fontSize: "10px", fontWeight: 700,
        color: "#a78bfa", letterSpacing: ".05em", textTransform: "uppercase",
        borderBottom: "1px solid rgba(139,92,246,.1)",
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        {label}
      </div>
      <div style={{ padding: "8px 12px" }}>
        {Object.entries(data).map(([key, val]) => (
          <div key={key} style={{
            display: "flex", justifyContent: "space-between", padding: "4px 0",
            borderBottom: "1px solid rgba(255,255,255,.03)",
          }}>
            <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{key}</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
              {val === null || val === undefined ? "---" : String(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
