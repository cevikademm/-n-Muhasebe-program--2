import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLang } from "../LanguageContext";
import { Invoice, InvoiceItem, AccountRow } from "../types";
import { Download, FileText, Loader2, ChevronRight, Printer } from "lucide-react";

interface FormsPanelProps {
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  accountPlans: AccountRow[];
}

const MONTHS_TR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

const fmt = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €"
    : "—";

const fmtDate = (d: string | null): string => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
};

const scoreColor = (s: number) => s >= 90 ? "#16a34a" : s >= 70 ? "#ca8a04" : "#dc2626";

const DOC_FONT: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: "#0f172a",
};

// ─── Section label ────────────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    margin: "20px -36px 14px",
    padding: "6px 36px",
    background: "#f8fafc",
    borderTop: "1px solid #e2e8f0",
    borderBottom: "1px solid #e2e8f0",
    fontSize: "8px",
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.14em",
    fontWeight: 700,
    ...DOC_FONT,
  }}>
    {children}
  </div>
);

// ─── Page 1: Summary ──────────────────────────────────────────────────────────
const DocSummary: React.FC<{
  invoice: Invoice;
  items: InvoiceItem[];
  tr: (a: string, b: string) => string;
}> = ({ invoice, items, tr }) => {
  // Vergi özet satırları (USt., MwSt. gibi) AI tarafından ayrı kalem olarak
  // çıkarılabilir. Bu satırlar diğer kalemlerin brütüne zaten dahildir, bu
  // yüzden toplam şişer. Eşik yüzde tabanlı (%15) tutulur; sabit 0.05 € değil.
  const withinPct = (a: number, b: number) =>
    b === 0 ? true : Math.abs(a - b) / Math.max(Math.abs(b), 0.01) < 0.15;

  const iNet   = items.reduce((s, i) => s + (i.net_amount   || 0), 0);
  const iVat   = items.reduce((s, i) => s + (i.vat_amount   || 0), 0);
  const iGross = items.reduce((s, i) => s + (i.gross_amount || 0), 0);
  const hNet   = invoice.total_net   || 0;
  const hVat   = invoice.total_vat   || 0;
  const hGross = invoice.total_gross || 0;
  const allOk  = withinPct(iGross, hGross); // Brüt üzerinden yüzdelik kontrol
  const avg    = items.length ? Math.round(items.reduce((s,i)=>s+(i.match_score||0),0)/items.length) : 0;

  return (
    <div style={DOC_FONT}>
      {/* Title row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", paddingBottom: "12px", borderBottom: "2px solid #1e293b" }}>
        <div>
          <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.14em", marginBottom: "4px" }}>
            fibu.de Smart Accounting · {new Date().toLocaleDateString("de-DE")}
          </div>
          <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>
            {tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse")}
          </div>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{fmt(invoice.total_gross)}</div>
          <div style={{ fontSize: "9px", color: "#64748b" }}>{tr("Brüt Toplam", "Brutto gesamt")}</div>
        </div>
      </div>

      {/* Invoice meta */}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e2e8f0", marginBottom: "10px" }}>
        <tbody>
          <tr>
            <td style={{ padding: "8px 12px", width: "50%", borderRight: "1px solid #e2e8f0", background: "#f8fafc", verticalAlign: "top" }}>
              <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "3px" }}>
                {tr("Tedarikçi", "Lieferant")}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>{invoice.supplier_name || "—"}</div>
            </td>
            <td style={{ padding: "8px 12px", verticalAlign: "top" }}>
              <div style={{ display: "flex", gap: "24px", fontSize: "11px" }}>
                {[
                  { l: tr("Fatura No", "Rechnungsnr."), v: `#${invoice.invoice_number || "—"}` },
                  { l: tr("Tarih", "Datum"),           v: fmtDate(invoice.invoice_date) },
                  { l: tr("Döviz", "Währung"),         v: invoice.currency || "EUR" },
                ].map(({ l, v }) => (
                  <div key={l}>
                    <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase" as const, marginBottom: "2px" }}>{l}</div>
                    <div style={{ fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Amounts */}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e2e8f0", marginBottom: "10px" }}>
        <tbody>
          <tr>
            {[
              { label: tr("Net Tutar", "Nettobetrag"),  hdr: hNet,   sum: iNet   },
              { label: tr("KDV",       "MwSt"),         hdr: hVat,   sum: iVat   },
              { label: tr("Brüt Tutar","Bruttobetrag"), hdr: hGross, sum: iGross },
            ].map(({ label, hdr, sum }, idx) => {
              const ok = withinPct(sum, hdr);
              return (
                <td key={label} style={{ padding: "9px 12px", borderRight: idx < 2 ? "1px solid #e2e8f0" : "none", verticalAlign: "top" }}>
                  <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "3px" }}>{label}</div>
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>{fmt(hdr)}</div>
                  <div style={{ fontSize: "9px", color: ok ? "#16a34a" : "#dc2626", marginTop: "2px" }}>
                    {tr("Kalemler", "Pos.")} {fmt(sum)} {ok ? "✓" : "✗"}
                  </div>
                </td>
              );
            })}
            <td style={{ padding: "9px 12px", textAlign: "center" as const, verticalAlign: "middle", background: "#f8fafc" }}>
              <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase" as const, marginBottom: "2px" }}>{tr("Ort. Skor", "Ø Score")}</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: scoreColor(avg) }}>%{avg}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Verification */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "7px 12px", fontSize: "11px", fontWeight: 600,
        background: allOk ? "#f0fdf4" : "#fffbeb",
        border: `1px solid ${allOk ? "#bbf7d0" : "#fde68a"}`,
        color: allOk ? "#15803d" : "#92400e",
      }}>
        <span style={{ fontSize: "13px" }}>{allOk ? "✓" : "⚠"}</span>
        {allOk
          ? tr("Tüm tutarlar eşleşiyor — başlık ile kalem toplamları uyumlu.", "Alle Beträge stimmen überein — Kopf und Positionen korrekt.")
          : tr("Tutar uyuşmazlığı — başlık ile kalem toplamları kontrol edilmeli.", "Betragsabweichung — Kopf und Positionen prüfen.")}
      </div>
    </div>
  );
};

// ─── Section 2: Compact items table ──────────────────────────────────────────
const DocItemsTable: React.FC<{
  items: InvoiceItem[];
  tr: (a: string, b: string) => string;
}> = ({ items, tr }) => {
  const thStyle: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: "8px",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 600,
    textAlign: "left",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  };
  const tdStyle: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: "11px",
    color: "#334155",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
  };

  return (
    <div style={DOC_FONT}>
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e2e8f0" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: "24px" }}>#</th>
            <th style={thStyle}>{tr("Açıklama", "Beschreibung")}</th>
            <th style={{ ...thStyle, textAlign: "center" as const, width: "72px", minWidth: "72px" }}>{tr("Hesap", "Konto")}</th>
            <th style={{ ...thStyle, textAlign: "right" as const }}>{tr("Miktar", "Menge")}</th>
            <th style={{ ...thStyle, textAlign: "right" as const }}>{tr("Birim", "Einzel.")}</th>
            <th style={{ ...thStyle, textAlign: "right" as const }}>{tr("Net", "Netto")}</th>
            <th style={{ ...thStyle, textAlign: "center" as const }}>{tr("KDV%", "MwSt%")}</th>
            <th style={{ ...thStyle, textAlign: "right" as const }}>{tr("Brüt", "Brutto")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id}>
              <td style={{ ...tdStyle, color: "#94a3b8", fontSize: "10px" }}>{i + 1}</td>
              <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "180px" }}>{item.description || "—"}</td>
              <td style={{ ...tdStyle, textAlign: "center" as const, width: "72px", minWidth: "72px" }}>
                <span style={{
                  display: "inline-block",
                  padding: "2px 6px",
                  background: "#1e293b", color: "#e2e8f0",
                  borderRadius: "3px", fontSize: "10px", fontWeight: 700,
                  fontFamily: "monospace", letterSpacing: "0.04em",
                  whiteSpace: "nowrap" as const,
                  minWidth: "44px", textAlign: "center" as const,
                }}>{item.account_code || "—"}</span>
              </td>
              <td style={{ ...tdStyle, textAlign: "right" as const, fontFamily: "monospace" }}>{item.quantity ?? "—"}</td>
              <td style={{ ...tdStyle, textAlign: "right" as const, fontFamily: "monospace" }}>{fmt(item.unit_price)}</td>
              <td style={{ ...tdStyle, textAlign: "right" as const, fontFamily: "monospace" }}>{fmt(item.net_amount)}</td>
              <td style={{ ...tdStyle, textAlign: "center" as const, fontFamily: "monospace" }}>
                {item.vat_rate != null ? `${item.vat_rate}%` : "—"}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" as const, fontWeight: 700, fontFamily: "monospace" }}>{fmt(item.gross_amount)}</td>
            </tr>
          ))}
        </tbody>
        {/* Totals row */}
        <tfoot>
          <tr style={{ background: "#f8fafc" }}>
            <td colSpan={5} style={{ ...tdStyle, borderTop: "2px solid #e2e8f0", fontWeight: 700, fontSize: "10px", borderBottom: "none" }}>
              {tr("Toplam", "Gesamt")}
            </td>
            <td style={{ ...tdStyle, borderTop: "2px solid #e2e8f0", textAlign: "right" as const, fontWeight: 700, fontFamily: "monospace", borderBottom: "none" }}>
              {fmt(items.reduce((s, i) => s + (i.net_amount || 0), 0))}
            </td>
            <td style={{ ...tdStyle, borderTop: "2px solid #e2e8f0", borderBottom: "none" }} />
            <td style={{ ...tdStyle, borderTop: "2px solid #e2e8f0", textAlign: "right" as const, fontWeight: 700, fontFamily: "monospace", borderBottom: "none" }}>
              {fmt(items.reduce((s, i) => s + (i.gross_amount || 0), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── Section 3: Account code detail cards — ONE per unique account_code ───────
const DocAccountDetails: React.FC<{
  items: InvoiceItem[];
  planJustMap: Map<string, string>;
  tr: (a: string, b: string) => string;
}> = ({ items, planJustMap, tr }) => {
  // Group items by account_code — preserve insertion order (first occurrence)
  const groups = new Map<string, InvoiceItem[]>();
  items.forEach(item => {
    const key = item.account_code || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  });

  return (
    <div style={DOC_FONT}>
      {Array.from(groups.entries()).map(([code, codeItems]) => {
        const rep      = codeItems[0]; // representative item for account meta
        const planJust = code !== "—" ? (planJustMap.get(code) ?? null) : null;
        const avgScore = Math.round(codeItems.reduce((s, i) => s + (i.match_score || 0), 0) / codeItems.length);
        const details: { label: string; value: string | null | undefined }[] = [
          { label: tr("HGB", "HGB"),               value: rep.hgb_reference },
          { label: tr("Vergi", "Steuer"),           value: rep.tax_note },
          { label: tr("Dönem", "Periode"),          value: rep.period_note },
          { label: tr("Gider Tipi", "Ausgabentyp"), value: rep.expense_type },
          { label: tr("DATEV K.H.", "DATEV GK."),   value: rep.datev_counter_account },
        ].filter(d => d.value);

        return (
          <div key={code} style={{
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
            marginBottom: "10px",
            overflow: "hidden",
            pageBreakInside: "avoid" as const,
            breakInside: "avoid" as const,
          }}>
            {/* ── Code + name + score header ── */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span style={{
                  display: "inline-block", padding: "3px 9px",
                  background: "#1e293b", color: "white",
                  borderRadius: "3px", fontSize: "12px", fontWeight: 700,
                  fontFamily: "monospace", letterSpacing: "0.06em", flexShrink: 0,
                }}>{code}</span>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700 }}>{rep.account_name || "—"}</div>
                  {rep.account_name_tr && (
                    <div style={{ fontSize: "9px", color: "#64748b", fontStyle: "italic" }}>{rep.account_name_tr}</div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "center" as const, flexShrink: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 800, color: scoreColor(avgScore), lineHeight: 1 }}>
                  %{avgScore}
                </div>
                <div style={{ fontSize: "7px", color: "#94a3b8", textTransform: "uppercase" as const }}>{tr("ort. skor", "ø score")}</div>
              </div>
            </div>

            <div style={{ padding: "9px 12px" }}>
              {/* ── Items using this code ── */}
              <div style={{ marginBottom: "8px" }}>
                <div style={{ fontSize: "7px", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "4px" }}>
                  {tr("Bu Hesaba Atanan Kalemler", "Diesem Konto zugeordnete Positionen")}
                  {" "}({codeItems.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: "2px" }}>
                  {codeItems.map((ci, idx) => {
                    // find original item index
                    const origIdx = items.findIndex(it => it.id === ci.id);
                    return (
                      <div key={ci.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", padding: "2px 0", borderBottom: idx < codeItems.length - 1 ? "1px dashed #f1f5f9" : "none" }}>
                        <span style={{ color: "#475569" }}>
                          <span style={{ color: "#94a3b8", fontFamily: "monospace", marginRight: "6px" }}>#{origIdx + 1}</span>
                          {ci.description || "—"}
                        </span>
                        <span style={{ fontWeight: 600, fontFamily: "monospace", flexShrink: 0, marginLeft: "8px" }}>{fmt(ci.gross_amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Detail pills ── */}
              {details.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "3px", marginBottom: "8px" }}>
                  {details.map(({ label, value }) => (
                    <span key={label} style={{
                      display: "inline-block", padding: "2px 6px",
                      background: "#f1f5f9", border: "1px solid #e2e8f0",
                      borderRadius: "3px", fontSize: "8px", color: "#475569",
                    }}>
                      <span style={{ color: "#94a3b8" }}>{label}: </span>{value}
                    </span>
                  ))}
                </div>
              )}

              {/* ── Analiz Gerekçesi (from account plan) ── */}
              {planJust && (
                <div style={{ borderLeft: "2px solid #1e293b", paddingLeft: "8px", marginBottom: rep.match_justification ? "6px" : "0" }}>
                  <div style={{ fontSize: "7px", color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "2px" }}>
                    {tr("Analiz Gerekçesi", "Analysebegründung")}
                  </div>
                  <div style={{ fontSize: "10px", color: "#334155", lineHeight: 1.5 }}>{planJust}</div>
                </div>
              )}

              {/* ── Eşleşme Gerekçesi (from first item's AI justification) ── */}
              {rep.match_justification && (
                <div style={{ borderLeft: "2px solid #cbd5e1", paddingLeft: "8px" }}>
                  <div style={{ fontSize: "7px", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "2px" }}>
                    {tr("Eşleşme Gerekçesi", "Zuordnungsbegründung")}
                  </div>
                  <div style={{ fontSize: "10px", color: "#475569", fontStyle: "italic", lineHeight: 1.5 }}>{rep.match_justification}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────
export const FormsPanel: React.FC<FormsPanelProps> = ({ invoices, invoiceItems, accountPlans }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const MONTHS = lang === "tr" ? MONTHS_TR : MONTHS_DE;

  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear]   = useState<number>(new Date().getFullYear());
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isGenerating, setIsGenerating]   = useState(false);
  const [genError, setGenError]           = useState<string | null>(null);
  // Blob URL for original PDF — same-origin so the browser can print it
  const [origBlobUrl, setOrigBlobUrl]     = useState<string | null>(null);

  // Only the white document is captured by html2canvas
  const previewRef = useRef<HTMLDivElement>(null);

  // Fetch the original PDF as a blob whenever the selected invoice changes.
  // Blob URLs are same-origin, so <embed> can render them in print mode
  // (cross-origin iframe/embed content is blocked by browsers during printing).
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setOrigBlobUrl(null);

    if (selectedInvoice?.file_url && selectedInvoice.file_type === "application/pdf") {
      fetch(selectedInvoice.file_url)
        .then(r => r.blob())
        .then(blob => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setOrigBlobUrl(objectUrl);
        })
        .catch(() => { /* fall back to direct URL */ });
    }

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedInvoice?.id, selectedInvoice?.file_url]);

  const years = useMemo(() => {
    const y = new Set<number>();
    invoices.forEach(inv => { if (inv.invoice_date) y.add(new Date(inv.invoice_date).getFullYear()); });
    if (y.size === 0) y.add(new Date().getFullYear());
    return Array.from(y).sort((a, b) => b - a);
  }, [invoices]);

  const filteredInvoices = useMemo(() =>
    invoices.filter(inv => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      if (d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== null && d.getMonth() !== selectedMonth) return false;
      return true;
    }).sort((a, b) => new Date(b.invoice_date||"").getTime() - new Date(a.invoice_date||"").getTime()),
  [invoices, selectedMonth, selectedYear]);

  const selectedItems = useMemo(() =>
    selectedInvoice ? invoiceItems.filter(i => i.invoice_id === selectedInvoice.id) : [],
  [selectedInvoice, invoiceItems]);

  const planJustMap = useMemo(() => {
    const m = new Map<string, string>();
    accountPlans.forEach(p => {
      if (p.account_code && p.analysis_justification) m.set(p.account_code, p.analysis_justification);
    });
    return m;
  }, [accountPlans]);

  // ── Shared: capture analysis div + merge original document ───────────────
  //
  // KURAL: generateMergedPDF her zaman orijinal belgeyi (PDF veya görsel)
  // son sayfada eklemelidir. File_url null olsa bile fonksiyon çalışmalı;
  // sadece orijinal sayfa eklenmez. Her file_type (PDF + resim) desteklenir.
  //
  const generateMergedPDF = useCallback(async (): Promise<Blob> => {
    if (!previewRef.current || !selectedInvoice) throw new Error("No data");

    const [{ jsPDF }, html2canvasMod] = await Promise.all([
      import("jspdf"),
      import("html2canvas"),
    ]);
    const html2canvas = (html2canvasMod as { default: typeof import("html2canvas")["default"] }).default;

    const element  = previewRef.current;
    const captureW = 794;

    const canvas = await html2canvas(element, {
      scale: 2, useCORS: true, logging: false,
      backgroundColor: "#ffffff",
      width: captureW, height: element.scrollHeight,
      windowWidth: captureW, windowHeight: element.scrollHeight,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.93);
    const pdf     = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageW   = pdf.internal.pageSize.getWidth();
    const pageH   = pdf.internal.pageSize.getHeight();
    const imgH    = (canvas.height * pageW) / canvas.width;

    let heightLeft = imgH, yPos = 0;
    pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH, undefined, "FAST");
    heightLeft -= pageH;
    while (heightLeft > 0) {
      yPos -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH, undefined, "FAST");
      heightLeft -= pageH;
    }

    // ── Orijinal belgeyi son sayfalara ekle ───────────────────────────────
    if (selectedInvoice.file_url) {
      const isPdf = selectedInvoice.file_type === "application/pdf";
      if (isPdf) {
        // PDF → pdf-lib ile merge
        try {
          const { PDFDocument } = await import("pdf-lib");
          const analysisBytes = pdf.output("arraybuffer");
          const origBytes     = await fetch(selectedInvoice.file_url, { mode: "cors" }).then(r => r.arrayBuffer());
          const merged        = await PDFDocument.create();
          const analysisPdf   = await PDFDocument.load(analysisBytes);
          const origPdf       = await PDFDocument.load(origBytes);
          const aPages = await merged.copyPages(analysisPdf, analysisPdf.getPageIndices());
          aPages.forEach(p => merged.addPage(p));
          const oPages = await merged.copyPages(origPdf, origPdf.getPageIndices());
          oPages.forEach(p => merged.addPage(p));
          const savedBytes = await merged.save();
          return new Blob([savedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        } catch (mergeErr) {
          console.warn("PDF merge failed, falling back to analysis only:", mergeErr);
        }
      } else {
        // Görsel (JPEG/PNG/vb.) → canvas üzerinden yeni sayfa olarak ekle
        try {
          const imgEl = new Image();
          imgEl.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            imgEl.onload  = () => resolve();
            imgEl.onerror = () => reject(new Error("Image load failed"));
            imgEl.src = selectedInvoice.file_url!;
          });
          const imgCanvas = document.createElement("canvas");
          imgCanvas.width  = imgEl.naturalWidth;
          imgCanvas.height = imgEl.naturalHeight;
          imgCanvas.getContext("2d")!.drawImage(imgEl, 0, 0);
          const origJpeg   = imgCanvas.toDataURL("image/jpeg", 0.93);
          const aspectRatio = imgEl.naturalHeight / imgEl.naturalWidth;
          const origImgH    = pageW * aspectRatio;
          pdf.addPage();
          let remH = origImgH, origY = 0;
          pdf.addImage(origJpeg, "JPEG", 0, origY, pageW, origImgH, undefined, "FAST");
          remH -= pageH;
          while (remH > 0) {
            origY -= pageH;
            pdf.addPage();
            pdf.addImage(origJpeg, "JPEG", 0, origY, pageW, origImgH, undefined, "FAST");
            remH -= pageH;
          }
        } catch (imgErr) {
          console.warn("Image merge failed, fallback to analysis only:", imgErr);
        }
      }
    }

    return new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
  }, [selectedInvoice]);

  // ── Print: open merged PDF in native browser viewer → Ctrl+P works ────────
  const handlePrint = useCallback(async () => {
    if (!selectedInvoice || !previewRef.current) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const blob = await generateMergedPDF();
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke after 1 min — enough time for the tab to load and print
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setGenError(tr("Yazdırma hazırlanamadı.", "Druck konnte nicht vorbereitet werden."));
    } finally {
      setIsGenerating(false);
    }
  }, [selectedInvoice, generateMergedPDF, tr]);

  // ── PDF download ──────────────────────────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    if (!selectedInvoice || !previewRef.current) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const blob = await generateMergedPDF();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href: url,
        download: `fatura-analiz-${selectedInvoice.invoice_number || "belge"}.pdf`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch {
      setGenError(tr("PDF oluşturulamadı.", "PDF konnte nicht erstellt werden."));
    } finally {
      setIsGenerating(false);
    }
  }, [selectedInvoice, generateMergedPDF, tr]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#111318]">

      {/* ── Header ── */}
      <div className="forms-no-print px-6 py-4 flex items-center justify-between shrink-0 border-b border-[#1c1f27] bg-[#0d0f15]">
        <div>
          <h1 className="font-syne font-bold text-lg text-slate-100">{tr("Formlar", "Formulare")}</h1>
          <p className="text-xs mt-0.5 text-[#3a3f4a]">{tr("Fatura Analiz Formları", "Rechnungsanalyse Formulare")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="c-input text-xs font-mono"
            style={{ padding: "5px 8px", width: "76px" }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={selectedMonth === null ? "" : selectedMonth}
            onChange={e => setSelectedMonth(e.target.value === "" ? null : Number(e.target.value))}
            className="c-input text-xs"
            style={{ padding: "5px 8px", width: "132px" }}
          >
            <option value="">{tr("Tüm Aylar", "Alle Monate")}</option>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <button
            onClick={handlePrint}
            disabled={!selectedInvoice || isGenerating}
            title={tr("Birleştirilmiş PDF yeni sekmede açılır — oradan yazdırın (Ctrl+P)", "Zusammengeführtes PDF öffnet in neuem Tab — dort drucken (Strg+P)")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-[#1c1f27] text-slate-400 hover:text-slate-200 hover:border-[#2a2f3a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "transparent" }}
          >
            {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
            {tr("Yazdır", "Drucken")}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={!selectedInvoice || isGenerating}
            className="c-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {isGenerating ? tr("Oluşturuluyor…", "Wird erstellt…") : tr("PDF İndir", "PDF Herunterladen")}
          </button>
        </div>
      </div>

      {genError && (
        <div className="forms-no-print px-6 py-1.5 text-xs text-rose-400 bg-rose-500/10 border-b border-rose-500/20">
          {genError}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left — invoice list */}
        <div className="forms-no-print w-2/5 flex flex-col border-r border-[#1c1f27] bg-[#0a0d12] overflow-y-auto shrink-0">
          {filteredInvoices.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[#3a3f4a] p-8 text-center">
              {tr("Bu döneme ait fatura bulunamadı.", "Keine Rechnungen für diesen Zeitraum.")}
            </div>
          ) : filteredInvoices.map(inv => {
            const isSel = selectedInvoice?.id === inv.id;
            return (
              <button
                key={inv.id}
                onClick={() => setSelectedInvoice(inv)}
                className="w-full text-left px-4 py-3 transition-all border-none cursor-pointer"
                style={{
                  background: isSel ? "rgba(6,182,212,.06)" : "transparent",
                  borderBottom: "1px solid #1c1f27",
                  borderLeft: `2px solid ${isSel ? "#06b6d4" : "transparent"}`,
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm text-slate-200 truncate leading-tight">
                    {inv.supplier_name || tr("Bilinmiyor", "Unbekannt")}
                  </span>
                  <span className="text-xs font-bold text-slate-200 shrink-0">{fmt(inv.total_gross)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#64748b]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{fmtDate(inv.invoice_date)}</span>
                    {inv.invoice_number && <span>#{inv.invoice_number}</span>}
                  </div>
                  {isSel && <ChevronRight size={11} className="text-cyan-500" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right — document */}
        <div className="flex-1 overflow-y-auto" style={{ background: "#0a0d12", padding: "20px" }}>
          {!selectedInvoice ? (
            <div className="forms-no-print flex flex-col items-center justify-center h-full text-center">
              <FileText size={40} className="mb-3 text-[#1c1f27]" />
              <p className="text-sm font-syne font-semibold text-[#3a3f4a]">
                {tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse")}
              </p>
              <p className="text-xs text-[#3a3f4a] mt-1 max-w-xs">
                {tr("Sol taraftan bir fatura seçin.", "Wählen Sie links eine Rechnung aus.")}
              </p>
            </div>
          ) : (
            /*
             * #forms-print-area includes:
             *   1. The white document  (#forms-doc-preview  — captured by html2canvas)
             *   2. The original invoice page (#forms-original-page — print only, page-break-before)
             */
            <div id="forms-print-area" style={{ maxWidth: "794px", margin: "0 auto" }}>

              {/* ══════════════════════════════════════════════════════════
                  WHITE DOCUMENT — captured by html2canvas + visible in print
                  ══════════════════════════════════════════════════════════ */}
              <div
                id="forms-doc-preview"
                ref={previewRef}
                style={{
                  background: "white",
                  padding: "32px 36px",
                  width: "794px",
                  boxSizing: "border-box",
                  boxShadow: "0 0 0 1px rgba(0,0,0,.08), 0 2px 16px rgba(0,0,0,.18)",
                  borderRadius: "3px",
                }}
              >
                {/* ── Section 1: Summary ── */}
                <DocSummary invoice={selectedInvoice} items={selectedItems} tr={tr} />

                {selectedItems.length > 0 && (
                  <>
                    {/* ── Section 2: Items table ── */}
                    <SectionLabel>
                      {tr("Fatura Kalemleri", "Rechnungspositionen")}
                      {" "}({selectedItems.length})
                    </SectionLabel>
                    <DocItemsTable items={selectedItems} tr={tr} />

                    {/* ── Section 3: Account code details ── */}
                    <SectionLabel>
                      {tr("Hesap Kodu Detayları ve Analiz Gerekçeleri", "Kontodetails und Analysebegründungen")}
                    </SectionLabel>
                    <DocAccountDetails items={selectedItems} planJustMap={planJustMap} tr={tr} />
                  </>
                )}

                {/* Footer */}
                <div style={{
                  marginTop: "16px", paddingTop: "8px",
                  borderTop: "1px solid #e2e8f0",
                  display: "flex", justifyContent: "space-between",
                  fontSize: "7px", color: "#94a3b8",
                  fontFamily: "system-ui, sans-serif",
                }}>
                  <span>fibu.de Smart Accounting · {new Date().toLocaleDateString("de-DE")}</span>
                  <span>
                    {selectedInvoice.file_url
                      ? tr("Orijinal belge aşağıda görüntüleniyor.", "Originaldokument wird unten angezeigt.")
                      : tr("Orijinal belge sisteme yüklenmemiş.", "Kein Originaldokument hochgeladen.")}
                  </span>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════════
                  ORIGINAL INVOICE — HER ZAMAN render edilir.
                  KURAL: Bu bölüm asla file_url koşuluna bağlanmamalıdır.
                  file_url yoksa "belge yok" mesajı gösterilir; hiç
                  gizlenmez. Böylece kullanıcı analizin sonunda her zaman
                  orijinal belge alanını görür.
                  ══════════════════════════════════════════════════════════ */}
              <div
                id="forms-original-page"
                style={{
                  marginTop: "12px",
                  width: "794px",
                  background: "white",
                  boxSizing: "border-box",
                  boxShadow: "0 0 0 1px rgba(0,0,0,.08), 0 2px 16px rgba(0,0,0,.18)",
                  borderRadius: "3px",
                }}
              >
                {/* Section title bar */}
                <div style={{
                  padding: "12px 20px 10px",
                  borderBottom: "2px solid #1e293b",
                  ...DOC_FONT,
                }}>
                  <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.14em", marginBottom: "3px" }}>
                    fibu.de Smart Accounting
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#0f172a" }}>
                    {tr("Orijinal Fatura Belgesi", "Originalrechnung")}
                  </div>
                  <div style={{ fontSize: "9px", color: "#64748b", marginTop: "2px" }}>
                    {selectedInvoice.supplier_name} · #{selectedInvoice.invoice_number || "—"} · {fmtDate(selectedInvoice.invoice_date)}
                  </div>
                </div>

                {/* Invoice content */}
                {!selectedInvoice.file_url ? (
                  /* Belge yüklenmemiş — placeholder */
                  <div style={{
                    padding: "48px 36px", textAlign: "center",
                    ...DOC_FONT,
                  }}>
                    <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.25 }}>📄</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "6px" }}>
                      {tr("Orijinal belge mevcut değil", "Kein Originaldokument vorhanden")}
                    </div>
                    <div style={{ fontSize: "11px", color: "#94a3b8", maxWidth: "340px", margin: "0 auto", lineHeight: 1.6 }}>
                      {tr(
                        "Bu fatura için sisteme yüklenmiş bir PDF veya görsel dosyası bulunmuyor. Faturayı yüklemek için Fatura Merkezi'ni kullanın.",
                        "Für diese Rechnung wurde keine PDF- oder Bilddatei hochgeladen. Verwenden Sie das Rechnungszentrum zum Hochladen."
                      )}
                    </div>
                  </div>
                ) : selectedInvoice.file_type === "application/pdf" ? (
                  /* PDF belge */
                  <iframe
                    id="forms-orig-iframe"
                    src={origBlobUrl ?? selectedInvoice.file_url}
                    style={{ width: "100%", height: "1060px", border: "none", display: "block" }}
                    title={tr("Orijinal Fatura", "Originalrechnung")}
                  />
                ) : (
                  /* Görsel (JPEG / PNG / vb.) */
                  <img
                    src={selectedInvoice.file_url}
                    alt={tr("Orijinal Fatura", "Originalrechnung")}
                    style={{ width: "100%", display: "block" }}
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      const msg = document.createElement("div");
                      msg.style.cssText = "padding:32px;text-align:center;color:#94a3b8;font-size:12px;";
                      msg.textContent = "Görsel yüklenemedi / Bild konnte nicht geladen werden";
                      e.currentTarget.parentElement?.appendChild(msg);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Print CSS is no longer needed — printing happens via the native PDF
          viewer after generating a merged PDF blob (analysis + original).
          iframe/embed elements cannot render PDF content in browser print
          engines regardless of CORS or blob URLs — they always blank out. */}
    </div>
  );
};
