import React, { useMemo, useState, useCallback } from "react";
import { useLang } from "../LanguageContext";
import { Invoice, InvoiceItem } from "../types";
import { SuSaReport } from "./SuSaReport";
import { LayoutDashboard, Tags, Truck, Percent, FileText, Printer, Download, Menu, X } from "lucide-react";
import {
  CATEGORIES, getCategoryForItem, fmt, MONTHS_TR, MONTHS_DE,
  EnrichedItem, CategoryDataItem, CategoryCompareItem, MonthlyDataItem, StatsData, SupplierDataItem, VatData,
} from "./reports/reportsHelpers";
import { ReportsOverviewTab } from "./reports/ReportsOverviewTab";
import { ReportsCategoriesTab } from "./reports/ReportsCategoriesTab";
import { ReportsSuppliersTab } from "./reports/ReportsSuppliersTab";
import { ReportsVATTab } from "./reports/ReportsVATTab";
import { ReportsExportTab } from "./reports/ReportsExportTab";
import { ReportsSKR03Tab } from "./reports/ReportsSKR03Tab";
import { BookOpen } from "lucide-react";

interface ReportsPanelProps {
  invoices?: Invoice[];
}

type Tab = "overview" | "categories" | "skr03" | "suppliers" | "vat" | "susa" | "export";

export const ReportsPanel: React.FC<ReportsPanelProps> = ({ invoices: rawInvoices = [] }) => {
  // ── Fatura verilerini raporlama formatına dönüştür ──
  const invoices = useMemo(() =>
    rawInvoices.map(inv => ({
      ...inv,
      invoice_date: inv.tarih || null,
      total_net: inv.ara_toplam || 0,
      total_vat: inv.toplam_kdv || 0,
      total_gross: inv.genel_toplam || 0,
      supplier_name: inv.satici_adi || inv.raw_ai_response?.header?.supplier_name || inv.raw_ai_response?.fatura_bilgileri?.satici_adi || inv.satici_vkn || null,
    })),
    [rawInvoices]
  );

  // ── Fatura kalemlerini raw_ai_response'dan çıkar ──
  const invoiceItems = useMemo(() => {
    const items: any[] = [];
    rawInvoices.forEach(inv => {
      const rawItems = inv.raw_ai_response?.items || inv.raw_ai_response?.kalemler || [];
      rawItems.forEach((item: any) => {
        items.push({
          ...item,
          invoice_id: inv.id,
          net_amount: item.net_amount ?? item.satir_toplami ?? 0,
          vat_amount: item.vat_amount ?? ((item.net_amount ?? item.satir_toplami ?? 0) * ((item.vat_rate ?? item.kdv_orani ?? 0) / 100)),
          vat_rate: item.vat_rate ?? item.kdv_orani ?? 0,
          description: item.description ?? item.urun_adi ?? "",
          account_code: item.account_code ?? item.hesap_kodu ?? null,
          account_name: item.account_name ?? item.account_name_tr ?? null,
        });
      });
    });
    return items;
  }, [rawInvoices]);
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const MONTHS = lang === "tr" ? MONTHS_TR : MONTHS_DE;

  const [tab, setTab] = useState<Tab>("overview");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [yearA, setYearA] = useState(new Date().getFullYear());
  const [yearB, setYearB] = useState(new Date().getFullYear() - 1);
  const [compare, setCompare] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [printMode, setPrintMode] = useState(false);
  /** Hızlı filtre: seçili ay (0-11) veya null = tüm yıl, undefined = tüm veri */
  const [quickMonth, setQuickMonth] = useState<number | null | undefined>(undefined);

  const years = [2023, 2024, 2025, 2026, 2027];

  // ── Hızlı filtre yardımcıları ──────────────────────────────────────────────
  const lastDayOfMonth = (y: number, m: number) => {
    return new Date(y, m + 1, 0).getDate();
  };
  const pad2 = (n: number) => String(n).padStart(2, "0");

  /** Yıl sekmesine tıkla */
  const selectYear = (y: number) => {
    setYearA(y);
    if (quickMonth === undefined) {
      // Tüm veri modunda kal
    } else if (quickMonth === null) {
      // Tüm yıl
      setDateFrom(`${y}-01-01`);
      setDateTo(`${y}-12-31`);
    } else {
      // Belirli ay
      setDateFrom(`${y}-${pad2(quickMonth + 1)}-01`);
      setDateTo(`${y}-${pad2(quickMonth + 1)}-${pad2(lastDayOfMonth(y, quickMonth))}`);
    }
  };

  /** Ay sekmesine tıkla */
  const selectMonth = (m: number) => {
    setQuickMonth(m);
    setDateFrom(`${yearA}-${pad2(m + 1)}-01`);
    setDateTo(`${yearA}-${pad2(m + 1)}-${pad2(lastDayOfMonth(yearA, m))}`);
  };

  /** "Tüm Yıl" sekmesine tıkla */
  const selectFullYear = () => {
    setQuickMonth(null);
    setDateFrom(`${yearA}-01-01`);
    setDateTo(`${yearA}-12-31`);
  };

  /** "Tüm Veri" — tüm tarih filtresini kaldır */
  const clearAllFilters = () => {
    setQuickMonth(undefined);
    setDateFrom("");
    setDateTo("");
  };

  /** Manuel tarih değişince hızlı sekmeyi iptal et */
  const onManualDateFrom = (v: string) => { setDateFrom(v); setQuickMonth(undefined); };
  const onManualDateTo = (v: string) => { setDateTo(v); setQuickMonth(undefined); };

  /** Ay için fatura sayısı */
  const monthCount = (m: number) =>
    invoices.filter(inv => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d.getFullYear() === yearA && d.getMonth() === m;
    }).length;

  // ── Date-filtered invoices ──
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (!inv.invoice_date) return true;
      if (dateFrom && inv.invoice_date < dateFrom) return false;
      if (dateTo && inv.invoice_date > dateTo) return false;
      return true;
    });
  }, [invoices, dateFrom, dateTo]);

  // ── Enrich items with category ──
  const enrichedItems = useMemo(() =>
    invoiceItems.map(item => {
      const invoice = filteredInvoices.find(inv => inv.id === item.invoice_id);
      return {
        ...item,
        category: getCategoryForItem(
          item.account_code,
          item.description,
          item.account_name,
          invoice?.supplier_name
        ),
        invoice,
      };
    }).filter(item => item.invoice !== undefined) as EnrichedItem[],
    [invoiceItems, filteredInvoices]);

  // ── Year-split items for comparison ──
  const itemsByYear = useCallback((y: number) =>
    invoiceItems.filter(item => {
      const inv = invoices.find(i => i.id === item.invoice_id);
      if (!inv?.invoice_date) return false;
      return new Date(inv.invoice_date).getFullYear() === y;
    }),
    [invoices, invoiceItems]);

  // ── Overview stats ──
  const stats = useMemo((): StatsData => {
    const totalNet = filteredInvoices.reduce((s, i) => s + (i.total_net ?? 0), 0);
    const totalVat = filteredInvoices.reduce((s, i) => s + (i.total_vat ?? 0), 0);
    const totalGross = filteredInvoices.reduce((s, i) => s + (i.total_gross ?? 0), 0);
    const count = filteredInvoices.length;
    const avg = count > 0 ? totalGross / count : 0;
    return { totalNet, totalVat, totalGross, count, avg };
  }, [filteredInvoices]);

  // ── Monthly data (12 months for yearA) ──
  const monthlyData = useMemo((): MonthlyDataItem[] => {
    return Array.from({ length: 12 }, (_, m) => {
      const invA = filteredInvoices.filter(inv => {
        if (!inv.invoice_date) return false;
        const d = new Date(inv.invoice_date);
        return d.getFullYear() === yearA && d.getMonth() === m;
      });
      const invB = compare ? invoices.filter(inv => {
        if (!inv.invoice_date) return false;
        const d = new Date(inv.invoice_date);
        return d.getFullYear() === yearB && d.getMonth() === m;
      }) : [];
      return {
        label: MONTHS[m],
        a: invA.reduce((s, i) => s + (i.total_gross ?? 0), 0),
        b: compare ? invB.reduce((s, i) => s + (i.total_gross ?? 0), 0) : undefined,
        colorA: "#06b6d4",
        colorB: "rgba(139,92,246,.5)",
      };
    });
  }, [filteredInvoices, invoices, yearA, yearB, compare, MONTHS]);

  // ── Category breakdown ──
  const categoryData = useMemo((): CategoryDataItem[] => {
    const map: Record<string, number> = {};
    enrichedItems.forEach(item => {
      const k = item.category.key;
      map[k] = (map[k] ?? 0) + (item.net_amount ?? 0);
    });
    return CATEGORIES
      .map(cat => ({
        ...cat,
        total: map[cat.key] ?? 0,
        items: enrichedItems.filter(i => i.category.key === cat.key),
      }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [enrichedItems]);

  // ── Category comparison (yearA vs yearB) ──
  const categoryCompare = useMemo((): CategoryCompareItem[] => {
    if (!compare) return [];
    const itemsA = itemsByYear(yearA);
    const itemsB = itemsByYear(yearB);
    const map: Record<string, { a: number; b: number }> = {};
    itemsA.forEach(item => {
      const inv = invoices.find(i => i.id === item.invoice_id);
      const k = getCategoryForItem(item.account_code, item.description, item.account_name, inv?.supplier_name).key;
      if (!map[k]) map[k] = { a: 0, b: 0 };
      map[k].a += item.net_amount ?? 0;
    });
    itemsB.forEach(item => {
      const inv = invoices.find(i => i.id === item.invoice_id);
      const k = getCategoryForItem(item.account_code, item.description, item.account_name, inv?.supplier_name).key;
      if (!map[k]) map[k] = { a: 0, b: 0 };
      map[k].b += item.net_amount ?? 0;
    });
    return CATEGORIES
      .map(cat => ({ ...cat, ...(map[cat.key] ?? { a: 0, b: 0 }) }))
      .filter(c => (c as any).a > 0 || (c as any).b > 0) as CategoryCompareItem[];
  }, [compare, itemsByYear, yearA, yearB]);

  // ── Supplier breakdown (no search filter — handled in tab) ──
  const supplierData = useMemo((): SupplierDataItem[] => {
    const map: Record<string, { total: number; count: number; lastDate: string; categories: Set<string> }> = {};
    filteredInvoices.forEach(inv => {
      const name = inv.supplier_name || tr("Bilinmiyor", "Unbekannt");
      if (!map[name]) map[name] = { total: 0, count: 0, lastDate: "", categories: new Set() };
      map[name].total += inv.total_gross ?? 0;
      map[name].count++;
      if (!map[name].lastDate || (inv.invoice_date && inv.invoice_date > map[name].lastDate))
        map[name].lastDate = inv.invoice_date || "";
    });
    enrichedItems.forEach(item => {
      const inv = item.invoice;
      const name = inv?.supplier_name || tr("Bilinmiyor", "Unbekannt");
      if (map[name]) map[name].categories.add(item.category.key);
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v, categories: Array.from(v.categories) }))
      .sort((a, b) => b.total - a.total);
  }, [filteredInvoices, enrichedItems]);

  // ── VAT summary ──
  const vatData = useMemo((): VatData => {
    const items19 = enrichedItems.filter(i => i.vat_rate === 19);
    const items7 = enrichedItems.filter(i => i.vat_rate === 7);
    const items0 = enrichedItems.filter(i => i.vat_rate === 0 || i.vat_rate === null);
    const sum = (arr: EnrichedItem[], field: keyof InvoiceItem) =>
      arr.reduce((s, i) => s + Number((i as any)[field] || 0), 0);
    const monthly = Array.from({ length: 12 }, (_, m) => {
      const inv = filteredInvoices.filter(i => {
        if (!i.invoice_date) return false;
        const d = new Date(i.invoice_date);
        return d.getFullYear() === yearA && d.getMonth() === m;
      });
      const ids = new Set(inv.map(i => i.id));
      const mItems = enrichedItems.filter(i => i.invoice_id && ids.has(i.invoice_id));
      return {
        label: MONTHS[m],
        vat19: mItems.filter(i => i.vat_rate === 19).reduce((s, i) => s + (i.vat_amount ?? 0), 0),
        vat7: mItems.filter(i => i.vat_rate === 7).reduce((s, i) => s + (i.vat_amount ?? 0), 0),
        net: mItems.reduce((s, i) => s + (i.net_amount ?? 0), 0),
      };
    });
    return {
      vat19Net: sum(items19, "net_amount"), vat19Tax: sum(items19, "vat_amount"),
      vat7Net: sum(items7, "net_amount"), vat7Tax: sum(items7, "vat_amount"),
      vat0Net: sum(items0, "net_amount"),
      totalVst: sum(items19, "vat_amount") + sum(items7, "vat_amount"),
      monthly,
    };
  }, [enrichedItems, filteredInvoices, yearA, MONTHS]);

  const handlePrint = () => {
    setPrintMode(true);
    setTimeout(() => { window.print(); setPrintMode(false); }, 100);
  };

  // ── Susa Report için hedeflenen dönemin takvim filtresinden türetilmesi ──
  const susaTargetYear = useMemo(() => {
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) return d.getFullYear();
    }
    return yearA;
  }, [dateFrom, yearA]);

  const susaTargetMonth = useMemo(() => {
    if (typeof quickMonth === "number") return quickMonth + 1;
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) return d.getMonth() + 1;
    }
    // "Tüm Yıl" modu ya da belirsiz (Tümü) durumunda yıl sonu 12 (Aralık) döndürüyoruz
    return 12;
  }, [quickMonth, dateFrom]);

  // ── Shared filter bar (2 satır) ───────────────────────────────────────────
  const FilterBar = () => (
    <div className="shrink-0" style={{ background: "#0d0f15", borderBottom: "1px solid #1c1f27" }}>

      {/* ── Satır 1: Yıl sekmeler + Karşılaştır + Yazdır ── */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-2.5 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider mr-1"
          style={{ color: "#3a3f4a" }}>{tr("Yıl", "Jahr")}</span>

        {years.map(y => {
          const isActive = yearA === y && quickMonth !== undefined;
          return (
            <button key={y} onClick={() => selectYear(y)}
              className="px-3 py-1 text-xs font-mono font-semibold rounded-md transition-all"
              style={{
                background: isActive ? "#06b6d4" : "rgba(255,255,255,.03)",
                color: isActive ? "#fff" : "#64748b",
                border: `1px solid ${isActive ? "#06b6d4" : "#1c1f27"}`,
              }}>
              {y}
            </button>
          );
        })}

        <div style={{ width: "1px", height: "16px", background: "#1c1f27", margin: "0 4px" }} />

        {/* Karşılaştır */}
        <div className="flex items-center gap-2">
          <label className="c-toggle cursor-pointer" onClick={() => setCompare(v => !v)}>
            <input type="checkbox" readOnly checked={compare} />
            <span className="c-toggle-track" />
            <span className="c-toggle-thumb"
              style={{ left: compare ? "19px" : "3px", background: compare ? "#fff" : "#3a3f4a" }} />
          </label>
          <span className="text-xs" style={{ color: compare ? "#e2e8f0" : "#3a3f4a" }}>
            {tr("Karşılaştır", "Vergleich")}
          </span>
          {compare && (
            <select value={yearB} onChange={e => setYearB(Number(e.target.value))}
              className="c-input text-xs font-mono" style={{ padding: "4px 8px", width: "76px" }}>
              {years.map(y => <option key={y}>{y}</option>)}
            </select>
          )}
        </div>

        <button onClick={handlePrint}
          className="c-btn-ghost px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 ml-auto">
          <Printer size={13} /> {tr("Yazdır", "Drucken")}
        </button>
      </div>

      {/* ── Satır 2: Ay hızlı filtre + Manuel tarih ── */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5">
        {/* Tüm Veri */}
        <button onClick={clearAllFilters}
          className="px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all"
          style={{
            background: quickMonth === undefined ? "rgba(148,163,184,.15)" : "rgba(255,255,255,.02)",
            color: quickMonth === undefined ? "#94a3b8" : "#3a3f4a",
            border: `1px solid ${quickMonth === undefined ? "rgba(148,163,184,.3)" : "#1c1f27"}`,
          }}>
          {tr("Tümü", "Alle")}
        </button>

        {/* Tüm Yıl */}
        <button onClick={selectFullYear}
          className="px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all"
          style={{
            background: quickMonth === null ? "rgba(139,92,246,.15)" : "rgba(255,255,255,.02)",
            color: quickMonth === null ? "#a78bfa" : "#3a3f4a",
            border: `1px solid ${quickMonth === null ? "rgba(139,92,246,.3)" : "#1c1f27"}`,
          }}>
          {tr("Tüm Yıl", "Gesamtes Jahr")} {yearA}
        </button>

        <div style={{ width: "1px", height: "14px", background: "#1c1f27" }} />

        {/* 12 ay */}
        {MONTHS.map((m, i) => {
          const cnt = monthCount(i);
          const isActive = quickMonth === i;
          return (
            <button key={i} onClick={() => selectMonth(i)}
              className="relative px-2.5 py-1 text-[10px] font-mono rounded-md transition-all"
              style={{
                background: isActive ? "#06b6d4" : cnt > 0 ? "rgba(6,182,212,.05)" : "rgba(255,255,255,.02)",
                color: isActive ? "#fff" : cnt > 0 ? "#94a3b8" : "#2a3040",
                border: `1px solid ${isActive ? "#06b6d4" : cnt > 0 ? "rgba(6,182,212,.18)" : "#1c1f27"}`,
              }}>
              {m}
              {cnt > 0 && (
                <span style={{
                  position: "absolute", top: "-5px", right: "-4px",
                  fontSize: "8px", fontWeight: 800, lineHeight: "13px",
                  background: isActive ? "#fff" : "#06b6d4",
                  color: isActive ? "#06b6d4" : "#fff",
                  borderRadius: "8px", padding: "0 3px", minWidth: "13px", textAlign: "center",
                }}>{cnt}</span>
              )}
            </button>
          );
        })}

        <div style={{ width: "1px", height: "14px", background: "#1c1f27" }} />

        {/* Manuel tarih aralığı */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" style={{ color: "#3a3f4a" }}>{tr("Von", "Von")}</span>
          <input type="date" className="c-input text-[10px] font-mono" value={dateFrom}
            onChange={e => onManualDateFrom(e.target.value)}
            style={{ padding: "4px 7px", width: "122px" }} />
          <span className="text-[10px]" style={{ color: "#3a3f4a" }}>–</span>
          <input type="date" className="c-input text-[10px] font-mono" value={dateTo}
            onChange={e => onManualDateTo(e.target.value)}
            style={{ padding: "4px 7px", width: "122px" }} />
          {(dateFrom || dateTo) && quickMonth === undefined && (
            <button onClick={clearAllFilters}
              className="px-2 py-1 text-[10px] rounded-md"
              style={{ background: "rgba(239,68,68,.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}>
              ✕
            </button>
          )}
        </div>

        {/* Aktif filtre etiketi */}
        {(dateFrom || dateTo) && (
          <span className="ml-1 text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ background: "rgba(6,182,212,.08)", color: "#06b6d4", border: "1px solid rgba(6,182,212,.15)" }}>
            {dateFrom} → {dateTo || "…"}
          </span>
        )}
      </div>
    </div>
  );

  const tabs: { key: Tab; icon: React.ReactNode; label: string; sublabel: string }[] = [
    { key: "overview", icon: <LayoutDashboard size={15} />, label: tr("Genel Bakış", "Übersicht"), sublabel: tr("KPI & aylık trend", "KPI & Monatstrend") },
    { key: "categories", icon: <Tags size={15} />, label: tr("Kategoriler", "Kategorien"), sublabel: tr("SKR03/04 gider dağılımı", "Kostenverteilung") },
    { key: "skr03", icon: <BookOpen size={15} />, label: tr("SKR03 Analiz", "SKR03 Analyse"), sublabel: tr("Klasse bazlı DATEV raporu", "Kontenklassen-Bericht") },
    { key: "suppliers", icon: <Truck size={15} />, label: tr("Tedarikçiler", "Lieferanten"), sublabel: tr("Tedarikçi bazlı analiz", "Lieferantenanalyse") },
    { key: "vat", icon: <Percent size={15} />, label: tr("Vergi / KDV", "USt / Vorsteuer"), sublabel: tr("Vorsteuer & KDV özeti", "Vorsteuerzusammenfassung") },
    { key: "susa", icon: <FileText size={15} />, label: tr("SuSa Raporu", "Summen & Salden"), sublabel: tr("Summen & Salden listesi", "Summen-Salden-Liste") },
    { key: "export", icon: <Download size={15} />, label: tr("Dışa Aktar", "Export"), sublabel: tr("CSV / Excel export", "CSV / Excel Export") },
  ];

  const SidebarContent = ({ onSelect }: { onSelect?: () => void }) => (
    <>
      {/* Sidebar header */}
      <div style={{
        padding: "16px 14px 12px",
        borderBottom: "1px solid rgba(255,255,255,.06)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <div style={{
            width: "30px", height: "30px", borderRadius: "8px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.25)",
          }}>
            <LayoutDashboard size={14} style={{ color: "#06b6d4" }} />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#f1f5f9" }}>
              {tr("Raporlar", "Berichte")}
            </div>
            <div style={{ fontSize: "9px", color: "#475569" }}>
              {tr("& Analizler", "& Analysen")}
            </div>
          </div>
        </div>
        <div style={{
          fontSize: "9px", color: "#374151", padding: "4px 6px", borderRadius: "5px",
          background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.1)",
        }}>
          {filteredInvoices.length} {tr("fatura", "Rechnungen")} · {fmt(stats.totalGross)}
        </div>
      </div>

      {/* Tab list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {tabs.map(t => {
            const isActive = tab === t.key;
            const color = "#06b6d4";
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); onSelect?.(); }}
                style={{
                  display: "flex", alignItems: "center", gap: "9px",
                  padding: "9px 9px", borderRadius: "9px",
                  cursor: "pointer", textAlign: "left", width: "100%",
                  background: isActive ? `${color}12` : "rgba(255,255,255,.02)",
                  border: `1px solid ${isActive ? color + "38" : "rgba(255,255,255,.05)"}`,
                  transition: "all .15s",
                }}
              >
                <div style={{
                  width: "28px", height: "28px", borderRadius: "7px", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isActive ? `${color}20` : "rgba(255,255,255,.04)",
                  border: `1px solid ${isActive ? color + "40" : "rgba(255,255,255,.06)"}`,
                  color: isActive ? color : "#475569",
                }}>
                  {t.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "11px", fontWeight: isActive ? 700 : 500,
                    color: isActive ? color : "#94a3b8",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {t.label}
                  </div>
                  <div style={{
                    fontSize: "9px", color: "#374151", marginTop: "1px",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {t.sublabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className={`flex h-full overflow-hidden ${printMode ? "print-mode" : ""}`}
      style={{ background: "#111318", position: "relative" }}>

      {/* ══ MOBILE HAMBURGER ══ */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="md:hidden"
        style={{
          position: "absolute", top: "10px", left: "10px", zIndex: 30,
          width: "36px", height: "36px", borderRadius: "9px",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.25)",
          cursor: "pointer", color: "#06b6d4",
        }}
      >
        <Menu size={18} />
      </button>

      {/* ══ MOBILE SIDEBAR OVERLAY ══ */}
      {mobileSidebarOpen && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 40,
            background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)",
          }}
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            style={{
              width: "260px", height: "100%",
              background: "#0d1017",
              borderRight: "1px solid rgba(255,255,255,.08)",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
              animation: "slideInLeft .2s ease",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 10px 0" }}>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                style={{
                  width: "28px", height: "28px", borderRadius: "7px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,.06)", border: "none",
                  cursor: "pointer", color: "#64748b",
                }}
              >
                <X size={14} />
              </button>
            </div>
            <SidebarContent onSelect={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ══ DESKTOP SIDEBAR ══ */}
      <aside className="hidden md:flex" style={{
        width: "210px", minWidth: "210px",
        background: "#0d1017",
        borderRight: "1px solid rgba(255,255,255,.06)",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <SidebarContent />
      </aside>

      {/* ══ RIGHT CONTENT ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Filter bar ── */}
        <FilterBar />

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 pb-5 space-y-5">

          {tab === "overview" && (
            <ReportsOverviewTab
              stats={stats}
              monthlyData={monthlyData}
              categoryData={categoryData}
              supplierData={supplierData}
              yearA={yearA}
              yearB={yearB}
              compare={compare}
              lang={lang}
              tr={tr}
            />
          )}

          {tab === "categories" && (
            <ReportsCategoriesTab
              filteredInvoices={filteredInvoices}
              categoryData={categoryData}
              categoryCompare={categoryCompare}
              yearA={yearA}
              yearB={yearB}
              compare={compare}
              lang={lang}
              tr={tr}
            />
          )}

          {tab === "skr03" && (
            <ReportsSKR03Tab
              invoices={invoices}
              invoiceItems={invoiceItems}
              filteredInvoices={filteredInvoices}
              yearA={yearA}
              lang={lang}
              tr={tr}
            />
          )}

          {tab === "suppliers" && (
            <ReportsSuppliersTab
              supplierData={supplierData}
              yearA={yearA}
              lang={lang}
              tr={tr}
            />
          )}

          {tab === "vat" && (
            <ReportsVATTab
              vatData={vatData}
              yearA={yearA}
              lang={lang}
              tr={tr}
            />
          )}

          {tab === "susa" && (
            <div style={{ position: "relative" }}>
              <SuSaReport
                invoices={invoices}
                invoiceItems={invoiceItems}
                initialYear={susaTargetYear}
                initialMonth={susaTargetMonth}
                hideControls={true}
              />
            </div>
          )}

          {tab === "export" && (
            <ReportsExportTab
              invoices={invoices}
              invoiceItems={invoiceItems}
              yearA={yearA}
              years={years}
              lang={lang}
              tr={tr}
            />
          )}


        </div>
      </div>
    </div>
  );
};
