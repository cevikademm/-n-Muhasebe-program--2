import React, { useState, useMemo } from "react";
import { Invoice, InvoiceItem } from "../types";
import {
    Download, FileText, FileSpreadsheet, FileCode2,
    Package, Filter, CheckCircle2, AlertCircle,
    TrendingUp, Calendar, ChevronDown,
} from "lucide-react";

interface ExportTabProps {
    invoices: Invoice[];
    invoiceItems: InvoiceItem[];
    tr: (a: string, b: string) => string;
    lang: string;
}

// ─── Formatters ───────────────────────────────────────────────
const fmtDE = (n: number) =>
    new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

const nowStamp = () => {
    const n = new Date();
    return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}_${String(n.getHours()).padStart(2, "0")}${String(n.getMinutes()).padStart(2, "0")}`;
};

// ─── Download helper ─────────────────────────────────────────
const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob(["\uFEFF" + content], { type: mime + ";charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

// ─── DATEV Buchungsstapel CSV ─────────────────────────────────
const buildDatevCSV = (invoices: Invoice[], items: InvoiceItem[]): string => {
    const lines: string[] = [];

    // DATEV Header (Buchungsstapel)
    const today = new Date();
    const datevDate = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}${today.getFullYear()}`;
    lines.push(
        `"EXTF";700;21;"Buchungsstapel";3;${datevDate};;;;"fikoai.de";;0;${today.getFullYear()}0101;${today.getFullYear()}1231;0`
    );
    // Column headers
    lines.push(
        "Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basis-Umsatz;WKZ Basis-Umsatz;Konto;Gegenkonto (ohne BU-Schlüssel);BU-Schlüssel;Belegdatum;Belegfeld 1;Belegfeld 2;Skonto;Buchungstext;Postensperre;Diverse Adressnummer;Geschäftspartnerbank;Sachverhalt;Zinssperre;Beleglink;Beleginfo-Art 1;Beleginfo-Inhalt 1;Beleginfo-Art 2;Beleginfo-Inhalt 2"
    );

    invoices.forEach(inv => {
        const invItems = items.filter(i => i.invoice_id === inv.id);
        const dateStr = inv.invoice_date ? inv.invoice_date.replace(/-/g, "").slice(4, 8) : "";

        if (invItems.length === 0) {
            // Fallback: tek satır fatura
            lines.push(
                [
                    fmtDE(inv.total_gross || 0).replace(".", ""),
                    "S",
                    "EUR",
                    "", "", "",
                    "1600",          // Konto: Verbindlichkeiten
                    "1200",          // Gegenkonto: Bank
                    "",
                    dateStr,
                    inv.invoice_number || "",
                    inv.supplier_name || "",
                    "",
                    (inv.supplier_name || "Fatura").substring(0, 30),
                ].join(";")
            );
        } else {
            invItems.forEach(item => {
                lines.push(
                    [
                        fmtDE(item.gross_amount || 0).replace(".", ""),
                        "S",
                        "EUR",
                        "", "", "",
                        item.account_code || "1600",
                        item.datev_counter_account || "1600",
                        "",
                        dateStr,
                        inv.invoice_number || "",
                        inv.supplier_name || "",
                        "",
                        (item.description || "").substring(0, 30),
                    ].join(";")
                );
            });
        }
    });

    return lines.join("\r\n");
};

// ─── Excel / TSV ─────────────────────────────────────────────
const buildExcelTSV = (invoices: Invoice[], items: InvoiceItem[], lang: string): string => {
    const isDE = lang !== "tr";
    const SEP = "\t";
    const lines: string[] = [];

    // Header
    lines.push([
        isDE ? "Rechnungsnr." : "Fatura No",
        isDE ? "Lieferant" : "Tedarikçi",
        isDE ? "Datum" : "Tarih",
        isDE ? "Netto (€)" : "Net (€)",
        isDE ? "USt (€)" : "KDV (€)",
        isDE ? "Brutto (€)" : "Brüt (€)",
        isDE ? "Konto" : "Hesap Kodu",
        isDE ? "Kontoname" : "Hesap Adı",
        isDE ? "Beschreibung" : "Açıklama",
        isDE ? "USt-Satz" : "KDV Oranı",
        isDE ? "Status" : "Durum",
    ].join(SEP));

    invoices.forEach(inv => {
        const invItems = items.filter(i => i.invoice_id === inv.id);
        if (invItems.length === 0) {
            lines.push([
                inv.invoice_number || "",
                inv.supplier_name || "",
                fmtDate(inv.invoice_date || ""),
                fmtDE(inv.total_net || 0),
                fmtDE(inv.total_vat || 0),
                fmtDE(inv.total_gross || 0),
                "", "", "", "",
                inv.status || "",
            ].join(SEP));
        } else {
            invItems.forEach(item => {
                lines.push([
                    inv.invoice_number || "",
                    inv.supplier_name || "",
                    fmtDate(inv.invoice_date || ""),
                    fmtDE(item.net_amount || 0),
                    fmtDE(item.vat_amount || 0),
                    fmtDE(item.gross_amount || 0),
                    item.account_code || "",
                    item.account_name || "",
                    item.description || "",
                    `%${item.vat_rate || 0}`,
                    inv.status || "",
                ].join(SEP));
            });
        }
    });

    return lines.join("\n");
};

// ─── JSON Export ──────────────────────────────────────────────
const buildJSON = (invoices: Invoice[], items: InvoiceItem[]): string => {
    const data = invoices.map(inv => ({
        ...inv,
        items: items.filter(i => i.invoice_id === inv.id),
    }));
    return JSON.stringify({ exported_at: new Date().toISOString(), count: data.length, invoices: data }, null, 2);
};

// ─── Elster XML Stub ─────────────────────────────────────────
const buildElsterXML = (invoices: Invoice[]): string => {
    const year = new Date().getFullYear();
    const net = invoices.reduce((s, i) => s + (i.total_net || 0), 0);
    const vat = invoices.reduce((s, i) => s + (i.total_vat || 0), 0);
    const gross = invoices.reduce((s, i) => s + (i.total_gross || 0), 0);

    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Elster XML Export — fikoai.de Smart Accounting -->
<!-- Bitte vor der Übermittlung prüfen! -->
<Elster xmlns="http://www.elster.de/elsterxml/schema/v12">
  <TransferHeader>
    <Verfahren>ElsterAnmeldung</Verfahren>
    <DatenArt>UStVA</DatenArt>
    <Vorgang>send-Auth</Vorgang>
    <Erstellungsdatum>${new Date().toISOString()}</Erstellungsdatum>
  </TransferHeader>
  <DatenTeil>
    <Nutzdatenblock>
      <NutzdatenHeader version="11">
        <NutzdatenTicket>1</NutzdatenTicket>
      </NutzdatenHeader>
      <Nutzdaten>
        <Anmeldungssteuern art="UStVA" version="202401">
          <Zeitraum>
            <Veranlagungszeitraum>${year}</Veranlagungszeitraum>
          </Zeitraum>
          <Steuerfall>
            <Umsatzsteuervoranmeldung>
              <!-- Kz. 41: Entgelte §4 Nr. 8-28 UStG -->
              <Kz41>${fmtDE(net)}</Kz41>
              <!-- Kz. 66: Vorsteuerbeträge -->
              <Kz66>${fmtDE(vat)}</Kz66>
              <!-- Kz. 83: Zahllast / Überschuss -->
              <Kz83>${fmtDE(gross)}</Kz83>
            </Umsatzsteuervoranmeldung>
          </Steuerfall>
        </Anmeldungssteuern>
      </Nutzdaten>
    </Nutzdatenblock>
  </DatenTeil>
</Elster>`;
};

// ─── Steuerberater Paket (ZIP-like: multiple files concatenated info) ─
const buildSteuerberaterReport = (invoices: Invoice[], items: InvoiceItem[], lang: string): string => {
    const isDE = lang !== "tr";
    const now = new Date().toLocaleDateString("de-DE");
    const analy = invoices.filter(i => i.status === "analyzed");
    const pend = invoices.filter(i => i.status === "pending");
    const dup = invoices.filter(i => i.status === "duplicate");
    const net = invoices.reduce((s, i) => s + (i.total_net || 0), 0);
    const vat = invoices.reduce((s, i) => s + (i.total_vat || 0), 0);
    const gross = invoices.reduce((s, i) => s + (i.total_gross || 0), 0);

    const lines = [
        "═══════════════════════════════════════════════════════════════",
        isDE ? "STEUERBERATER-ÜBERGABEBERICHT" : "VERGİ DANIŞMANI TESLİM RAPORU",
        `fikoai.de Smart Accounting — Export vom ${now}`,
        "═══════════════════════════════════════════════════════════════",
        "",
        isDE ? "1. ZUSAMMENFASSUNG" : "1. ÖZET",
        "─────────────────────────────────────────────────────",
        `${isDE ? "Rechnungen gesamt" : "Toplam Fatura"}   : ${invoices.length}`,
        `${isDE ? "Analysiert" : "Analiz edildi"}   : ${analy.length}`,
        `${isDE ? "Ausstehend" : "Bekleyen"}         : ${pend.length}`,
        `${isDE ? "Duplikate" : "Mükerrer"}         : ${dup.length}`,
        "",
        `${isDE ? "Nettobetrag gesamt" : "Toplam Net"}     : ${fmtDE(net)} €`,
        `${isDE ? "Vorsteuer gesamt" : "Toplam KDV"}     : ${fmtDE(vat)} €`,
        `${isDE ? "Bruttobetrag gesamt" : "Toplam Brüt"}    : ${fmtDE(gross)} €`,
        "",
        isDE ? "2. RECHNUNGSDETAILS" : "2. FATURA DETAYLARI",
        "─────────────────────────────────────────────────────",
    ];

    invoices.forEach((inv, idx) => {
        const invItems = items.filter(i => i.invoice_id === inv.id);
        lines.push(`\n[${idx + 1}] ${inv.invoice_number || "—"} | ${inv.supplier_name || "—"} | ${fmtDate(inv.invoice_date || "")} | ${fmtDE(inv.total_gross || 0)} € | ${inv.status}`);
        invItems.forEach(item => {
            lines.push(`     → ${item.account_code} ${item.account_name} | ${fmtDE(item.gross_amount || 0)} € | %${item.vat_rate}`);
        });
    });

    lines.push("");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push(isDE ? "Erstellt mit fikoai.de Smart Accounting" : "fikoai.de Smart Accounting ile oluşturuldu");

    return lines.join("\n");
};

const MONTHS_TR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

// ─── ExportTab Component ──────────────────────────────────────
export const ExportTab: React.FC<ExportTabProps> = ({ invoices, invoiceItems, tr, lang }) => {
    const [filterStatus, setFilterStatus] = useState<"all" | "analyzed" | "pending">("all");
    const [filterMode, setFilterMode] = useState<"monthyear" | "daterange">("monthyear");
    const [filterYear, setFilterYear] = useState("");
    const [filterMonth, setFilterMonth] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [preview, setPreview] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState("");
    const [exporting, setExporting] = useState<string | null>(null);

    const availableYears = useMemo(() => {
        const set = new Set<string>();
        invoices.forEach(inv => { if (inv.invoice_date) set.add(inv.invoice_date.substring(0, 4)); });
        const arr = Array.from(set).sort().reverse();
        return arr.length > 0 ? arr : [String(new Date().getFullYear())];
    }, [invoices]);

    const filtered = useMemo(() => {
        return invoices.filter(inv => {
            if (filterStatus !== "all" && inv.status !== filterStatus) return false;
            if (filterMode === "monthyear") {
                if (filterYear && inv.invoice_date && !inv.invoice_date.startsWith(filterYear)) return false;
                if (filterMonth && inv.invoice_date && inv.invoice_date.substring(5, 7) !== filterMonth.padStart(2, "0")) return false;
            } else {
                if (dateFrom && inv.invoice_date && inv.invoice_date < dateFrom) return false;
                if (dateTo && inv.invoice_date && inv.invoice_date > dateTo) return false;
            }
            return true;
        });
    }, [invoices, filterStatus, filterMode, filterYear, filterMonth, dateFrom, dateTo]);

    const filteredItems = useMemo(
        () => invoiceItems.filter(i => filtered.some(inv => inv.id === i.invoice_id)),
        [invoiceItems, filtered]
    );

    const doExport = async (type: "datev" | "excel" | "json" | "elster" | "steuer") => {
        setExporting(type);
        await new Promise(r => setTimeout(r, 400)); // Visual feedback
        try {
            const stamp = nowStamp();
            switch (type) {
                case "datev": {
                    const csv = buildDatevCSV(filtered, filteredItems);
                    downloadBlob(csv, `DATEV_Buchungsstapel_${stamp}.csv`, "text/csv");
                    break;
                }
                case "excel": {
                    const tsv = buildExcelTSV(filtered, filteredItems, lang);
                    downloadBlob(tsv, `FikoAI_Rechnungen_${stamp}.xls`, "application/vnd.ms-excel");
                    break;
                }
                case "json": {
                    const json = buildJSON(filtered, filteredItems);
                    downloadBlob(json, `FikoAI_Export_${stamp}.json`, "application/json");
                    break;
                }
                case "elster": {
                    const xml = buildElsterXML(filtered);
                    downloadBlob(xml, `Elster_UStVA_${stamp}.xml`, "application/xml");
                    break;
                }
                case "steuer": {
                    const txt = buildSteuerberaterReport(filtered, filteredItems, lang);
                    downloadBlob(txt, `Steuerberater_Bericht_${stamp}.txt`, "text/plain");
                    break;
                }
            }
        } catch {
            // silently handle
        } finally {
            setExporting(null);
        }
    };

    const showPreview = (type: "datev" | "excel" | "elster") => {
        let content = "";
        let title = "";
        const sample = filtered.slice(0, 3);
        const sampleItems = filteredItems.filter(i => sample.some(inv => inv.id === i.invoice_id));
        switch (type) {
            case "datev": content = buildDatevCSV(sample, sampleItems).split("\r\n").slice(0, 8).join("\n"); title = "DATEV CSV Önizleme"; break;
            case "excel": content = buildExcelTSV(sample, sampleItems, lang).split("\n").slice(0, 8).join("\n"); title = "Excel Önizleme"; break;
            case "elster": content = buildElsterXML(sample).split("\n").slice(0, 20).join("\n"); title = "Elster XML Önizleme"; break;
        }
        setPreviewTitle(title);
        setPreview(content);
    };

    // Stats
    const analyzed = invoices.filter(i => i.status === "analyzed").length;
    const totalGross = filtered.reduce((s, i) => s + (i.total_gross || 0), 0);
    const totalVat = filtered.reduce((s, i) => s + (i.total_vat || 0), 0);

    const cardStyle = (accent: string, active = false): React.CSSProperties => ({
        borderRadius: "16px",
        border: `1px solid ${active ? accent + "40" : "#111520"}`,
        background: active
            ? `linear-gradient(135deg, ${accent}10 0%, ${accent}04 100%)`
            : "linear-gradient(145deg, #0c0f16 0%, #090c12 100%)",
        padding: "20px",
        position: "relative",
        overflow: "hidden",
        transition: "all .2s",
    });

    const btnStyle = (accent: string, loading = false): React.CSSProperties => ({
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        padding: "10px 18px", borderRadius: "10px",
        border: `1px solid ${accent}35`,
        background: loading ? `${accent}18` : `${accent}12`,
        color: loading ? "#64748b" : accent,
        fontSize: "12px", fontWeight: 700,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        cursor: loading ? "not-allowed" : "pointer",
        transition: "all .2s",
        opacity: loading ? 0.6 : 1,
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

            {/* ── Özet istatistik ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
                {[
                    { icon: <FileText size={16} />, label: tr("Toplam Fatura", "Rechnungen"), val: String(invoices.length), accent: "#06b6d4" },
                    { icon: <CheckCircle2 size={16} />, label: tr("Analiz Edildi", "Analysiert"), val: String(analyzed), accent: "#10b981" },
                    { icon: <TrendingUp size={16} />, label: tr("Seçili Brüt", "Ausgewählt"), val: `${fmtDE(totalGross)} €`, accent: "#8b5cf6" },
                ].map((c, i) => (
                    <div key={i} style={{
                        borderRadius: "12px", border: `1px solid ${c.accent}20`,
                        background: `linear-gradient(135deg, ${c.accent}0c, transparent)`,
                        padding: "14px 16px",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: c.accent }}>
                            {c.icon}
                            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "'DM Sans',sans-serif", color: "#3a3f4a" }}>
                                {c.label}
                            </span>
                        </div>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "18px", color: c.accent }}>
                            {c.val}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Filtreler ── */}
            <div style={{ ...cardStyle("#06b6d4"), padding: "16px 20px" }}>
                {/* Header + mode toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Filter size={13} style={{ color: "#06b6d4" }} />
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#3a3f4a", textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                            {tr("Export Filtresi", "Export-Filter")}
                        </span>
                    </div>
                    {/* Mode toggle pills */}
                    <div style={{ display: "flex", gap: "3px", background: "#080a10", borderRadius: "8px", padding: "3px" }}>
                        {(["monthyear", "daterange"] as const).map(mode => (
                            <button key={mode} onClick={() => setFilterMode(mode)} style={{
                                padding: "5px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                                fontFamily: "'Plus Jakarta Sans',sans-serif", border: "none", cursor: "pointer",
                                transition: "all .15s",
                                background: filterMode === mode ? "#1c2130" : "transparent",
                                color: filterMode === mode ? "#06b6d4" : "#3a3f4a",
                                boxShadow: filterMode === mode ? "0 1px 4px rgba(0,0,0,.4)" : "none",
                            }}>
                                {mode === "monthyear" ? tr("Ay / Yıl", "Monat / Jahr") : tr("Tarih Aralığı", "Zeitraum")}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                    {/* Durum filtresi — always visible */}
                    <div>
                        <label style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans',sans-serif", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                            {tr("Durum", "Status")}
                        </label>
                        <div style={{ position: "relative" }}>
                            <select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value as any)}
                                style={{
                                    width: "100%", padding: "8px 12px", borderRadius: "8px",
                                    border: "1px solid #1c1f27", background: "#0d0f15",
                                    color: "#94a3b8", fontSize: "12px", fontFamily: "'Plus Jakarta Sans',sans-serif",
                                    appearance: "none", cursor: "pointer",
                                }}
                            >
                                <option value="all">{tr("Tümü", "Alle")}</option>
                                <option value="analyzed">{tr("Analiz Edilmiş", "Analysiert")}</option>
                                <option value="pending">{tr("Bekleyen", "Ausstehend")}</option>
                            </select>
                            <ChevronDown size={12} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#3a3f4a", pointerEvents: "none" }} />
                        </div>
                    </div>

                    {filterMode === "monthyear" ? (
                        <>
                            {/* Yıl seçici */}
                            <div>
                                <label style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans',sans-serif", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                                    {tr("Yıl", "Jahr")}
                                </label>
                                <div style={{ position: "relative" }}>
                                    <select
                                        value={filterYear}
                                        onChange={e => setFilterYear(e.target.value)}
                                        style={{
                                            width: "100%", padding: "8px 12px", borderRadius: "8px",
                                            border: "1px solid #1c1f27", background: "#0d0f15",
                                            color: "#94a3b8", fontSize: "12px", fontFamily: "'Plus Jakarta Sans',sans-serif",
                                            appearance: "none", cursor: "pointer",
                                        }}
                                    >
                                        <option value="">{tr("Tüm Yıllar", "Alle Jahre")}</option>
                                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                    <ChevronDown size={12} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#3a3f4a", pointerEvents: "none" }} />
                                </div>
                            </div>
                            {/* Ay seçici */}
                            <div>
                                <label style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans',sans-serif", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                                    {tr("Ay", "Monat")}
                                </label>
                                <div style={{ position: "relative" }}>
                                    <select
                                        value={filterMonth}
                                        onChange={e => setFilterMonth(e.target.value)}
                                        style={{
                                            width: "100%", padding: "8px 12px", borderRadius: "8px",
                                            border: "1px solid #1c1f27", background: "#0d0f15",
                                            color: "#94a3b8", fontSize: "12px", fontFamily: "'Plus Jakarta Sans',sans-serif",
                                            appearance: "none", cursor: "pointer",
                                        }}
                                    >
                                        <option value="">{tr("Tüm Aylar", "Alle Monate")}</option>
                                        {MONTHS_TR.map((m, i) => (
                                            <option key={i + 1} value={String(i + 1)}>
                                                {lang === "tr" ? m : MONTHS_DE[i]}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={12} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#3a3f4a", pointerEvents: "none" }} />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Tarihten */}
                            <div>
                                <label style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans',sans-serif", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                                    {tr("Başlangıç Tarihi", "Von Datum")}
                                </label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={e => setDateFrom(e.target.value)}
                                    style={{
                                        width: "100%", padding: "8px 12px", borderRadius: "8px",
                                        border: "1px solid #1c1f27", background: "#0d0f15",
                                        color: "#94a3b8", fontSize: "12px", fontFamily: "'Plus Jakarta Sans',sans-serif",
                                        colorScheme: "dark",
                                    }}
                                />
                            </div>
                            {/* Tarihe */}
                            <div>
                                <label style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans',sans-serif", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                                    {tr("Bitiş Tarihi", "Bis Datum")}
                                </label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={e => setDateTo(e.target.value)}
                                    style={{
                                        width: "100%", padding: "8px 12px", borderRadius: "8px",
                                        border: "1px solid #1c1f27", background: "#0d0f15",
                                        color: "#94a3b8", fontSize: "12px", fontFamily: "'Plus Jakarta Sans',sans-serif",
                                        colorScheme: "dark",
                                    }}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Filtre sonuç badge */}
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                        {tr("Seçili:", "Ausgewählt:")}
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#06b6d4", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                        {filtered.length} {tr("fatura", "Rechnungen")}
                    </span>
                    <span style={{ fontSize: "11px", color: "#3a3f4a" }}>·</span>
                    <span style={{ fontSize: "11px", color: "#10b981", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                        {fmtDE(totalGross)} € {tr("brüt", "brutto")}
                    </span>
                    <span style={{ fontSize: "11px", color: "#3a3f4a" }}>·</span>
                    <span style={{ fontSize: "11px", color: "#8b5cf6", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                        {fmtDE(totalVat)} € {tr("KDV", "USt")}
                    </span>
                </div>
            </div>

            {/* ── Export Butonları ── */}
            {/* DATEV CSV */}
            <div style={cardStyle("#06b6d4")}>
                <div style={{ position: "absolute", top: 0, left: "15%", right: "15%", height: "1px", background: "linear-gradient(90deg,transparent,rgba(6,182,212,.3),transparent)" }} />
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#06b6d4", flexShrink: 0 }}>
                                <FileText size={17} />
                            </div>
                            <div>
                                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                                    DATEV Buchungsstapel CSV
                                </div>
                                <div style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'DM Sans',sans-serif" }}>
                                    {tr("DATEV uyumlu muhasebe export formatı (§ 146 AO)", "DATEV-konformes Buchungsexportformat (§ 146 AO)")}
                                </div>
                            </div>
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: "#1e2530", padding: "8px 12px", borderRadius: "8px", background: "rgba(6,182,212,.04)", border: "1px solid rgba(6,182,212,.08)", marginTop: "8px" }}>
                            "EXTF";700;21;"Buchungsstapel" · Konto;Gegenkonto;Betrag;Belegdatum...
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
                        <button style={btnStyle("#06b6d4", exporting === "datev")}
                            onClick={() => doExport("datev")}
                            disabled={exporting !== null || filtered.length === 0}
                        >
                            {exporting === "datev" ? (
                                <><span style={{ width: "12px", height: "12px", border: "2px solid rgba(6,182,212,.3)", borderTopColor: "#06b6d4", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} /> {tr("İndiriliyor...", "Lädt...")}</>
                            ) : (
                                <><Download size={13} /> {tr("CSV İndir", "CSV herunterladen")}</>
                            )}
                        </button>
                        <button style={{ ...btnStyle("#06b6d4"), background: "transparent", border: "1px solid #1c1f27", color: "#3a3f4a", fontSize: "11px" }}
                            onClick={() => showPreview("datev")}
                        >
                            {tr("Önizle", "Vorschau")}
                        </button>
                    </div>
                </div>
            </div>

            {/* Excel */}
            <div style={cardStyle("#10b981")}>
                <div style={{ position: "absolute", top: 0, left: "15%", right: "15%", height: "1px", background: "linear-gradient(90deg,transparent,rgba(16,185,129,.3),transparent)" }} />
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981", flexShrink: 0 }}>
                                <FileSpreadsheet size={17} />
                            </div>
                            <div>
                                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                                    {tr("Excel / Tablo", "Excel / Tabelle")}
                                </div>
                                <div style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'DM Sans',sans-serif" }}>
                                    {tr("Microsoft Excel'de açılabilir .xls formatı", "Im Microsoft Excel öffenbares .xls-Format")}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
                        <button style={btnStyle("#10b981", exporting === "excel")}
                            onClick={() => doExport("excel")}
                            disabled={exporting !== null || filtered.length === 0}
                        >
                            {exporting === "excel" ? (
                                <><span style={{ width: "12px", height: "12px", border: "2px solid rgba(16,185,129,.3)", borderTopColor: "#10b981", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} /> {tr("İndiriliyor...", "Lädt...")}</>
                            ) : (
                                <><Download size={13} /> {tr("Excel İndir", "Excel herunterladen")}</>
                            )}
                        </button>
                        <button style={{ ...btnStyle("#10b981"), background: "transparent", border: "1px solid #1c1f27", color: "#3a3f4a", fontSize: "11px" }}
                            onClick={() => showPreview("excel")}
                        >
                            {tr("Önizle", "Vorschau")}
                        </button>
                    </div>
                </div>
            </div>

            {/* Elster XML */}
            <div style={cardStyle("#f59e0b")}>
                <div style={{ position: "absolute", top: 0, left: "15%", right: "15%", height: "1px", background: "linear-gradient(90deg,transparent,rgba(245,158,11,.3),transparent)" }} />
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b", flexShrink: 0 }}>
                                <FileCode2 size={17} />
                            </div>
                            <div>
                                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                                    Elster XML (UStVA)
                                </div>
                                <div style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'DM Sans',sans-serif" }}>
                                    {tr("Finanzamt'a göndermek için XML taslak oluştur", "XML-Vorlage für das Finanzamt generieren")}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
                            <AlertCircle size={11} style={{ color: "#f59e0b", flexShrink: 0 }} />
                            <span style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'DM Sans',sans-serif" }}>
                                {tr("Göndermeden önce vergi danışmanınızla kontrol edin", "Vor der Übermittlung mit Steuerberater prüfen")}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
                        <button style={btnStyle("#f59e0b", exporting === "elster")}
                            onClick={() => doExport("elster")}
                            disabled={exporting !== null || filtered.length === 0}
                        >
                            {exporting === "elster" ? (
                                <><span style={{ width: "12px", height: "12px", border: "2px solid rgba(245,158,11,.3)", borderTopColor: "#f59e0b", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} /> {tr("İndiriliyor...", "Lädt...")}</>
                            ) : (
                                <><Download size={13} /> {tr("XML İndir", "XML herunterladen")}</>
                            )}
                        </button>
                        <button style={{ ...btnStyle("#f59e0b"), background: "transparent", border: "1px solid #1c1f27", color: "#3a3f4a", fontSize: "11px" }}
                            onClick={() => showPreview("elster")}
                        >
                            {tr("Önizle", "Vorschau")}
                        </button>
                    </div>
                </div>
            </div>

            {/* JSON */}
            <div style={cardStyle("#8b5cf6")}>
                <div style={{ position: "absolute", top: 0, left: "15%", right: "15%", height: "1px", background: "linear-gradient(90deg,transparent,rgba(139,92,246,.3),transparent)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(139,92,246,.12)", border: "1px solid rgba(139,92,246,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#8b5cf6", flexShrink: 0 }}>
                            <FileCode2 size={17} />
                        </div>
                        <div>
                            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                                JSON {tr("Ham Veri Export", "Rohdaten-Export")}
                            </div>
                            <div style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'DM Sans',sans-serif" }}>
                                {tr("Tüm fatura ve kalem verisi — geliştirici / entegrasyon için", "Alle Rechnungs- und Positionsdaten — für Entwickler/Integration")}
                            </div>
                        </div>
                    </div>
                    <button style={btnStyle("#8b5cf6", exporting === "json")}
                        onClick={() => doExport("json")}
                        disabled={exporting !== null || filtered.length === 0}
                    >
                        {exporting === "json" ? (
                            <><span style={{ width: "12px", height: "12px", border: "2px solid rgba(139,92,246,.3)", borderTopColor: "#8b5cf6", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} /> {tr("İndiriliyor...", "Lädt...")}</>
                        ) : (
                            <><Download size={13} /> JSON</>
                        )}
                    </button>
                </div>
            </div>

            {/* Steuerberater Paketi */}
            <div style={cardStyle("#06b6d4")}>
                <div style={{ position: "absolute", top: 0, left: "15%", right: "15%", height: "1px", background: "linear-gradient(90deg,transparent,rgba(6,182,212,.25),transparent)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#06b6d4", flexShrink: 0 }}>
                            <Package size={17} />
                        </div>
                        <div>
                            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                                {tr("Steuerberater Teslim Raporu", "Steuerberater-Übergabebericht")}
                            </div>
                            <div style={{ fontSize: "10px", color: "#3a3f4a", fontFamily: "'DM Sans',sans-serif" }}>
                                {tr("Özet rapor + hesap kodu dökümü — vergi danışmanı için", "Übersichtsbericht + Kontenliste — für den Steuerberater")}
                            </div>
                        </div>
                    </div>
                    <button style={btnStyle("#06b6d4", exporting === "steuer")}
                        onClick={() => doExport("steuer")}
                        disabled={exporting !== null || filtered.length === 0}
                    >
                        {exporting === "steuer" ? (
                            <><span style={{ width: "12px", height: "12px", border: "2px solid rgba(6,182,212,.3)", borderTopColor: "#06b6d4", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} /> {tr("İndiriliyor...", "Lädt...")}</>
                        ) : (
                            <><Download size={13} /> {tr("Rapor İndir", "Bericht herunterladen")}</>
                        )}
                    </button>
                </div>
            </div>

            {/* Preview Modal */}
            {preview && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 300,
                    background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "20px",
                }}
                    onClick={() => setPreview(null)}
                >
                    <div
                        style={{
                            maxWidth: "760px", width: "100%",
                            borderRadius: "18px",
                            background: "#0c0f16",
                            border: "1px solid #1c1f27",
                            boxShadow: "0 40px 80px rgba(0,0,0,.6)",
                            overflow: "hidden",
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #1c1f27" }}>
                            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                                {previewTitle}
                            </div>
                            <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: "16px", padding: "4px 8px" }}>✕</button>
                        </div>
                        <div style={{ padding: "16px 20px", maxHeight: "400px", overflowY: "auto" }}>
                            <pre style={{
                                fontFamily: "'JetBrains Mono',monospace", fontSize: "11px",
                                color: "#64748b", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                            }}>
                                {preview}
                            </pre>
                        </div>
                        <div style={{ padding: "12px 20px", borderTop: "1px solid #1c1f27", display: "flex", justifyContent: "flex-end" }}>
                            <button onClick={() => setPreview(null)} style={{
                                padding: "8px 20px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                                fontFamily: "'DM Sans',sans-serif", border: "1px solid #1c1f27",
                                background: "transparent", color: "#64748b", cursor: "pointer",
                            }}>
                                {tr("Kapat", "Schließen")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};
