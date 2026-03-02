import React, { useState } from "react";
import { Download, FileText, Building2, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Invoice, InvoiceItem } from "../../types";
import { exportDATEV, exportInvoicesCSV } from "../../services/exportService";

interface Props {
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  yearA: number;
  years: number[];
  lang: string;
  tr: (a: string, b: string) => string;
}

// ─── Kart bileşeni ─────────────────────────────────────────────────────────────
const ExportCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}> = ({ icon, title, description, badge, badgeColor = "#06b6d4", children }) => (
  <div className="c-card p-6 flex flex-col gap-4">
    <div className="flex items-start gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.15)" }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-syne font-semibold text-sm text-slate-100">{title}</span>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44` }}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>{description}</p>
      </div>
    </div>
    {children}
  </div>
);

// ─── Bilgi satırı ──────────────────────────────────────────────────────────────
const InfoRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5"
    style={{ borderBottom: "1px solid #1c1f27" }}>
    <span className="text-xs" style={{ color: "#64748b" }}>{label}</span>
    <span className="text-xs font-mono font-semibold text-slate-200">{value}</span>
  </div>
);

export const ReportsExportTab: React.FC<Props> = ({
  invoices, invoiceItems, yearA, years, lang, tr,
}) => {
  const [datevYear, setDatevYear] = useState(yearA);
  const [invYear, setInvYear] = useState<number | "all">(yearA);
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showSuccess = (key: string) => {
    setSuccess(key);
    setTimeout(() => setSuccess(null), 3000);
  };

  // ── İstatistikler ────────────────────────────────────────────────────────
  const datevItems = invoiceItems.filter(it => {
    const inv = invoices.find(i => i.id === it.invoice_id);
    return inv?.invoice_date &&
      new Date(inv.invoice_date).getFullYear() === datevYear &&
      !!it.account_code;
  });

  const filteredInvForExport = invYear === "all"
    ? invoices
    : invoices.filter(i => i.invoice_date && new Date(i.invoice_date).getFullYear() === (invYear as number));

  const filteredItemsForExport = invoiceItems.filter(it => {
    if (invYear === "all") return true;
    const inv = invoices.find(i => i.id === it.invoice_id);
    return inv?.invoice_date && new Date(inv.invoice_date).getFullYear() === (invYear as number);
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDATEV = async () => {
    setLoading("datev");
    try {
      exportDATEV(invoices, invoiceItems, datevYear);
      showSuccess("datev");
    } finally {
      setLoading(null);
    }
  };

  const handleInvoiceCSV = async () => {
    setLoading("inv");
    try {
      exportInvoicesCSV(
        filteredInvForExport,
        filteredItemsForExport,
        lang,
        invYear === "all" ? undefined : (invYear as number)
      );
      showSuccess("inv");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-syne font-semibold text-sm text-slate-200">
            {tr("Dışa Aktarma", "Export")}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {tr(
              "DATEV muhasebe yazılımı ve Excel/CSV uyumlu dışa aktarma",
              "Export für DATEV-Buchhaltungssoftware und Excel/CSV"
            )}
          </p>
        </div>
      </div>

      {/* ── DATEV Buchungsstapel ─────────────────────────────────────── */}
      <ExportCard
        icon={<Building2 size={18} style={{ color: "#06b6d4" }} />}
        title="DATEV Buchungsstapel"
        badge="DATEV ASCII EXTF"
        badgeColor="#06b6d4"
        description={tr(
          "Fatura kalemlerini DATEV'e aktarılabilir muhasebe kaydı (Buchungsstapel) formatında indirir. SKR03 hesap kodları, BU-Schlüssel ve Belegdatum bilgileri içerir.",
          "Exportiert Rechnungspositionen als DATEV-importierbaren Buchungsstapel. Enthält SKR03-Konten, BU-Schlüssel und Belegdatum."
        )}
      >
        <div className="rounded-md p-3 space-y-1.5" style={{ background: "#0a0d14", border: "1px solid #1c1f27" }}>
          <div className="flex items-center gap-3 mb-2">
            <label className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
              {tr("Hesap Yılı", "Wirtschaftsjahr")}:
            </label>
            <select
              value={datevYear}
              onChange={e => setDatevYear(Number(e.target.value))}
              className="c-input text-xs font-mono"
              style={{ padding: "4px 10px", width: "90px" }}
            >
              {years.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <InfoRow
            label={tr("Aktarılacak kalem sayısı", "Zu exportierende Positionen")}
            value={datevItems.length}
          />
          <InfoRow
            label={tr("Hesap kodu atamalı", "Mit Kontonummer")}
            value={`${datevItems.length} / ${invoiceItems.filter(it => {
              const inv = invoices.find(i => i.id === it.invoice_id);
              return inv?.invoice_date && new Date(inv.invoice_date).getFullYear() === datevYear;
            }).length}`}
          />
          <InfoRow
            label={tr("Format", "Format")}
            value="DATEV EXTF v700 / Kategorie 21"
          />
          <InfoRow
            label={tr("Kodlama", "Zeichensatz")}
            value="UTF-8 BOM"
          />
        </div>

        <div className="flex items-center gap-2 p-3 rounded-md"
          style={{ background: "rgba(251,191,36,.04)", border: "1px solid rgba(251,191,36,.15)" }}>
          <AlertCircle size={13} style={{ color: "#f59e0b", flexShrink: 0 }} />
          <p className="text-[11px] leading-relaxed" style={{ color: "#92400e" }}>
            {tr(
              "Gegenkonto olarak 1600 (Verbindlichkeiten L+L / SKR03) kullanılır. DATEV'e aktarmadan önce verilerinizi steuerberanız ile doğrulayın.",
              "Gegenkonto 1600 (Verbindlichkeiten L+L / SKR03) wird verwendet. Vor dem Import in DATEV mit Ihrem Steuerberater prüfen."
            )}
          </p>
        </div>

        <button
          onClick={handleDATEV}
          disabled={loading === "datev" || datevItems.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold transition-all"
          style={{
            background: datevItems.length === 0 ? "#1c1f27" : "rgba(6,182,212,.12)",
            color: datevItems.length === 0 ? "#3a3f4a" : "#06b6d4",
            border: `1px solid ${datevItems.length === 0 ? "#1c1f27" : "rgba(6,182,212,.3)"}`,
            cursor: datevItems.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {loading === "datev" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : success === "datev" ? (
            <CheckCircle2 size={15} style={{ color: "#10b981" }} />
          ) : (
            <Download size={15} />
          )}
          {success === "datev"
            ? tr("İndirildi!", "Heruntergeladen!")
            : `DATEV_Buchungsstapel_${datevYear}.csv ${tr("indir", "herunterladen")}`}
        </button>
      </ExportCard>

      {/* ── Fatura Excel/CSV ────────────────────────────────────────── */}
      <ExportCard
        icon={<FileText size={18} style={{ color: "#10b981" }} />}
        title={tr("Fatura Listesi", "Rechnungsliste")}
        badge="Excel / CSV"
        badgeColor="#10b981"
        description={tr(
          "Tüm faturaları ve kalemlerini iki bölümlü CSV olarak indirir. Excel'de semicolon ayraçlı, UTF-8 BOM ile açılır.",
          "Exportiert alle Rechnungen und Positionen als zweiseitige CSV-Datei. Öffnet sich direkt in Excel mit Semikolon-Trennzeichen."
        )}
      >
        <div className="rounded-md p-3 space-y-1.5" style={{ background: "#0a0d14", border: "1px solid #1c1f27" }}>
          <div className="flex items-center gap-3 mb-2">
            <label className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
              {tr("Yıl / Dönem", "Jahr / Zeitraum")}:
            </label>
            <select
              value={invYear}
              onChange={e => setInvYear(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="c-input text-xs font-mono"
              style={{ padding: "4px 10px", width: "110px" }}
            >
              <option value="all">{tr("Tümü", "Alle")}</option>
              {years.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <InfoRow
            label={tr("Fatura sayısı", "Anzahl Rechnungen")}
            value={filteredInvForExport.length}
          />
          <InfoRow
            label={tr("Kalem sayısı", "Anzahl Positionen")}
            value={filteredItemsForExport.length}
          />
          <InfoRow label={tr("İçerik", "Inhalt")}
            value={tr("Özet + Kalemler (2 bölüm)", "Übersicht + Positionen (2 Abschnitte)")} />
          <InfoRow label={tr("Ayraç", "Trennzeichen")} value="; (Semikolon)" />
        </div>

        <button
          onClick={handleInvoiceCSV}
          disabled={loading === "inv" || filteredInvForExport.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold transition-all"
          style={{
            background: filteredInvForExport.length === 0 ? "#1c1f27" : "rgba(16,185,129,.1)",
            color: filteredInvForExport.length === 0 ? "#3a3f4a" : "#10b981",
            border: `1px solid ${filteredInvForExport.length === 0 ? "#1c1f27" : "rgba(16,185,129,.3)"}`,
            cursor: filteredInvForExport.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {loading === "inv" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : success === "inv" ? (
            <CheckCircle2 size={15} style={{ color: "#10b981" }} />
          ) : (
            <Download size={15} />
          )}
          {success === "inv"
            ? tr("İndirildi!", "Heruntergeladen!")
            : `Rechnungen_Export${invYear !== "all" ? `_${invYear}` : ""}.csv ${tr("indir", "herunterladen")}`}
        </button>
      </ExportCard>

      {/* ── Bilgi kutusu ─────────────────────────────────────────────── */}
      <div className="c-card p-4 flex gap-3"
        style={{ border: "1px solid rgba(99,102,241,.15)", background: "rgba(99,102,241,.03)" }}>
        <AlertCircle size={16} style={{ color: "#6366f1", flexShrink: 0, marginTop: 1 }} />
        <div className="space-y-1">
          <p className="text-xs font-semibold" style={{ color: "#818cf8" }}>
            {tr("Banka hareketleri için dışa aktarma", "Export der Bankbewegungen")}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
            {tr(
              'Banka hesap ekstrelerini CSV olarak indirmek için "Banka Dökümanı" bölümünü açın ve sağ üst köşedeki CSV İndir butonunu kullanın.',
              'Um Kontoauszüge als CSV herunterzuladen, öffnen Sie den Bereich „Bankdokumente" und verwenden Sie die Schaltfläche „CSV herunterladen" oben rechts.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
