import React, { useState } from "react";
import { Tags, Download } from "lucide-react";
import { Invoice } from "../../types";
import {
  fmt, fmtShort, exportCSV, MONTHS_TR, MONTHS_DE,
  CategoryDataItem, CategoryCompareItem,
} from "./reportsHelpers";

interface Props {
  filteredInvoices: Invoice[];
  categoryData: CategoryDataItem[];
  categoryCompare: CategoryCompareItem[];
  yearA: number;
  yearB: number;
  compare: boolean;
  lang: string;
  tr: (a: string, b: string) => string;
}

export const ReportsCategoriesTab: React.FC<Props> = ({
  filteredInvoices, categoryData, categoryCompare, yearA, yearB, compare, lang, tr,
}) => {
  const [selCategory, setSelCategory] = useState<string | null>(null);
  const MONTHS = lang === "tr" ? MONTHS_TR : MONTHS_DE;

  const exportCategories = () => {
    const header = ["Kategori", "İkon", "Tutar (Net)", "Kalem Sayısı", "%"];
    const total = categoryData.reduce((s, c) => s + c.total, 0);
    const rows = categoryData.map(c => [
      lang === "tr" ? c.labelTr : c.labelDe,
      c.icon,
      c.total.toFixed(2),
      c.items.length.toString(),
      total > 0 ? ((c.total / total) * 100).toFixed(1) : "0",
    ]);
    exportCSV([header, ...rows], `muhasys_kategoriler_${yearA}.csv`);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="font-syne font-semibold text-sm text-slate-200">
          {tr("Kategori Bazlı Harcama", "Ausgaben nach Kategorie")}
        </div>
        <button onClick={exportCategories}
          className="c-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md">
          <Download size={14} /> CSV
        </button>
      </div>

      {categoryData.length === 0 ? (
        <div className="c-card p-10 text-center flex flex-col items-center">
          <Tags size={32} className="mb-3 opacity-50" style={{ color: "#1c1f27" }} />
          <p className="text-xs" style={{ color: "#3a3f4a" }}>
            {tr("Analiz edilmiş fatura bulunamadı", "Keine analysierten Rechnungen")}
          </p>
        </div>
      ) : (
        <>
          {/* Category bar list */}
          <div className="c-card p-5 fade-up">
            <div className="space-y-3">
              {categoryData.map((cat, i) => {
                const totalAll = categoryData.reduce((s, c) => s + c.total, 0);
                const pct = totalAll > 0 ? (cat.total / totalAll * 100) : 0;
                const cmpItem = compare ? categoryCompare.find(c => c.key === cat.key) : null;
                const isSelected = selCategory === cat.key;
                return (
                  <div key={i}>
                    <div
                      className="px-4 py-3 rounded-md cursor-pointer transition-all"
                      style={{
                        background: isSelected ? "rgba(6,182,212,.06)" : "rgba(255,255,255,.01)",
                        borderTop: `1px solid ${isSelected ? "rgba(6,182,212,.2)" : "#1c1f27"}`,
                        borderRight: `1px solid ${isSelected ? "rgba(6,182,212,.2)" : "#1c1f27"}`,
                        borderBottom: `1px solid ${isSelected ? "rgba(6,182,212,.2)" : "#1c1f27"}`,
                        borderLeft: `3px solid ${cat.color}`,
                      }}
                      onClick={() => setSelCategory(isSelected ? null : cat.key)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <span>{cat.icon}</span>
                          <span className="text-sm font-medium text-slate-200">
                            {lang === "tr" ? cat.labelTr : cat.labelDe}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(255,255,255,.04)", color: "#64748b" }}>
                            {cat.items.length} {tr("kalem", "Pos.")}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {compare && cmpItem && (
                            <div className="text-right">
                              <div className="font-mono text-xs" style={{ color: "rgba(139,92,246,.8)" }}>
                                {yearB}: {fmtShort(cmpItem.b || 0)}
                              </div>
                              {(() => {
                                const diff = cmpItem.b > 0 ? ((cat.total - cmpItem.b) / cmpItem.b * 100) : 0;
                                const up = diff >= 0;
                                return (
                                  <div className={`text-[10px] font-bold ${up ? "badge-duplicate" : "badge-analyzed"}`}
                                    style={{ padding: "1px 6px", borderRadius: "20px" }}>
                                    {up ? "▲" : "▼"} {Math.abs(diff).toFixed(0)}%
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          <div className="text-right">
                            <div className="font-syne font-bold text-sm text-slate-100">{fmt(cat.total)}</div>
                            <div className="text-[10px] font-mono" style={{ color: "#3a3f4a" }}>
                              {pct.toFixed(1)}%
                            </div>
                          </div>
                          <span className="font-mono text-xs" style={{ color: "#3a3f4a" }}>{isSelected ? "▼" : "›"}</span>
                        </div>
                      </div>
                      <div className="w-full rounded-full h-1.5" style={{ background: "#1c1f27" }}>
                        <div className="h-1.5 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: cat.color }} />
                      </div>
                    </div>

                    {/* Drill-down */}
                    {isSelected && (
                      <div className="mt-2 mb-1 rounded-md overflow-hidden" style={{ border: "1px solid #1c1f27" }}>
                        <div className="px-4 py-2" style={{ background: "#0d0f15", borderBottom: "1px solid #1c1f27" }}>
                          <span className="c-section-title mb-0">
                            {lang === "tr" ? cat.labelTr : cat.labelDe} — {tr("Detaylar", "Details")}
                          </span>
                        </div>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ background: "#0d0f15" }}>
                              {[tr("Tedarikçi", "Lieferant"), tr("Tarih", "Datum"), tr("Açıklama", "Beschreibung"),
                                tr("Hesap Kodu", "Konto"), tr("Net", "Netto"), tr("KDV", "USt"), tr("Brüt", "Brutto")
                              ].map((h, hi) => (
                                <th key={hi} className="px-3 py-2 text-left whitespace-nowrap"
                                  style={{ color: "#3a3f4a", borderBottom: "1px solid #1c1f27", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cat.items.slice(0, 20).map((item, ii) => (
                              <tr key={ii} style={{ borderBottom: "1px solid #1c1f27" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                <td className="px-3 py-2 text-slate-300 max-w-[120px] truncate">
                                  {item.invoice?.supplier_name || "—"}
                                </td>
                                <td className="px-3 py-2 font-mono" style={{ color: "#64748b" }}>
                                  {item.invoice?.invoice_date || "—"}
                                </td>
                                <td className="px-3 py-2 text-slate-400 max-w-[160px] truncate">
                                  {item.description || "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                                    style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
                                    {item.account_code || "—"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "#64748b" }}>
                                  {item.net_amount ? fmt(item.net_amount) : "—"}
                                </td>
                                <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "#64748b" }}>
                                  {item.vat_amount ? fmt(item.vat_amount) : "—"}
                                </td>
                                <td className="px-3 py-2 font-syne font-bold text-slate-100 whitespace-nowrap">
                                  {item.gross_amount ? fmt(item.gross_amount) : "—"}
                                </td>
                              </tr>
                            ))}
                            {cat.items.length > 20 && (
                              <tr>
                                <td colSpan={7} className="px-3 py-2 text-center text-xs" style={{ color: "#3a3f4a" }}>
                                  +{cat.items.length - 20} {tr("daha fazla kalem", "weitere Positionen")}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Heatmap: month × category */}
          <div className="c-card p-5 fade-up">
            <div className="font-syne font-semibold text-sm text-slate-200 mb-4">
              {tr("Aylık Isı Haritası", "Monatliche Heatmap")} — {yearA}
            </div>
            <div className="overflow-x-auto">
              <table className="text-[9px] w-full border-collapse" style={{ minWidth: "600px" }}>
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left" style={{ color: "#3a3f4a", width: "120px" }}>
                      {tr("Kategori", "Kategorie")}
                    </th>
                    {MONTHS.map((m, i) => (
                      <th key={i} className="px-1 py-1 text-center font-mono font-semibold"
                        style={{ color: "#3a3f4a" }}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categoryData.slice(0, 8).map((cat, ci) => {
                    const monthVals = Array.from({ length: 12 }, (_, m) => {
                      const ids = new Set(
                        filteredInvoices.filter(inv => {
                          if (!inv.invoice_date) return false;
                          const d = new Date(inv.invoice_date);
                          return d.getFullYear() === yearA && d.getMonth() === m;
                        }).map(i => i.id)
                      );
                      return cat.items.filter(item => item.invoice_id && ids.has(item.invoice_id))
                        .reduce((s, item) => s + (item.net_amount ?? 0), 0);
                    });
                    const maxV = Math.max(...monthVals, 1);
                    return (
                      <tr key={ci}>
                        <td className="px-2 py-1.5 flex items-center gap-1.5 whitespace-nowrap">
                          <span>{cat.icon}</span>
                          <span style={{ color: "#64748b" }} className="truncate max-w-[90px]">
                            {lang === "tr" ? cat.labelTr : cat.labelDe}
                          </span>
                        </td>
                        {monthVals.map((v, mi) => {
                          const intensity = v > 0 ? Math.max(0.1, v / maxV) : 0;
                          return (
                            <td key={mi} className="px-1 py-1 text-center">
                              <div className="w-full rounded-sm mx-auto flex items-center justify-center"
                                style={{
                                  height: "22px",
                                  background: v > 0
                                    ? `rgba(${parseInt(cat.color.slice(1, 3), 16)},${parseInt(cat.color.slice(3, 5), 16)},${parseInt(cat.color.slice(5, 7), 16)},${intensity * 0.7})`
                                    : "#1c1f27",
                                  minWidth: "28px",
                                }}
                                title={v > 0 ? fmtShort(v) : "—"}>
                                {v > 0 && (
                                  <span className="font-mono"
                                    style={{ color: intensity > 0.4 ? "#fff" : "#94a3b8", fontSize: "8px" }}>
                                    {fmtShort(v)}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
};
