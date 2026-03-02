import React, { useState } from "react";
import { Truck, Download } from "lucide-react";
import { fmt, exportCSV, CATEGORIES, SupplierDataItem } from "./reportsHelpers";

interface Props {
  supplierData: SupplierDataItem[];
  yearA: number;
  lang: string;
  tr: (a: string, b: string) => string;
}

export const ReportsSuppliersTab: React.FC<Props> = ({ supplierData, yearA, lang, tr }) => {
  const [supplierSearch, setSupplierSearch] = useState("");

  const filtered = supplierSearch
    ? supplierData.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
    : supplierData;

  const exportSuppliers = () => {
    const header = [tr("Tedarikçi", "Lieferant"), tr("Toplam", "Gesamt"), tr("Fatura", "Rechnungen"), tr("Ortalama", "Durchschnitt"), tr("Son Tarih", "Letztes Datum")];
    const rows = filtered.map(s => [s.name, s.total.toFixed(2), s.count.toString(), (s.total / s.count).toFixed(2), s.lastDate]);
    exportCSV([header, ...rows], `muhasys_tedarikciler_${yearA}.csv`);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="font-syne font-semibold text-sm text-slate-200">
          {tr("Tedarikçi Bazlı Harcama", "Ausgaben nach Lieferant")}
        </div>
        <div className="flex items-center gap-2">
          <input type="text" placeholder={tr("Ara...", "Suche...")}
            value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)}
            className="c-input text-xs" style={{ padding: "5px 10px", width: "160px" }} />
          <button onClick={exportSuppliers}
            className="c-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="c-card p-10 text-center flex flex-col items-center">
          <Truck size={32} className="mb-3 opacity-50" style={{ color: "#1c1f27" }} />
          <p className="text-xs" style={{ color: "#3a3f4a" }}>
            {tr("Tedarikçi bulunamadı", "Kein Lieferant gefunden")}
          </p>
        </div>
      ) : (
        <div className="c-card overflow-hidden fade-up">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {["#",
                  tr("Tedarikçi", "Lieferant"),
                  tr("Toplam Tutar", "Gesamtbetrag"),
                  tr("Fatura Sayısı", "Rechnungen"),
                  tr("Ortalama", "Durchschnitt"),
                  tr("Son Tarih", "Letztes Datum"),
                  tr("Kategoriler", "Kategorien"),
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left whitespace-nowrap"
                    style={{
                      background: "#0d0f15", color: "#3a3f4a", borderBottom: "1px solid #1c1f27",
                      fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em"
                    }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const totalAll = filtered.reduce((acc, x) => acc + x.total, 0);
                const pct = totalAll > 0 ? (s.total / totalAll * 100) : 0;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #1c1f27" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-3 font-mono" style={{ color: "#3a3f4a" }}>{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200 mb-1">{s.name}</div>
                      <div className="w-32 rounded-full h-1" style={{ background: "#1c1f27" }}>
                        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: "#06b6d4" }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-syne font-bold text-slate-100 whitespace-nowrap">
                      {fmt(s.total)}
                      <div className="text-[10px] font-mono font-normal" style={{ color: "#3a3f4a" }}>
                        {pct.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300 text-center">{s.count}</td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ color: "#64748b" }}>
                      {fmt(s.total / s.count)}
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ color: "#64748b" }}>
                      {s.lastDate || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.categories.map(ck => {
                          const cat = CATEGORIES.find(c => c.key === ck);
                          return cat ? (
                            <span key={ck} className="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              style={{ background: cat.color + "18", color: cat.color, border: `1px solid ${cat.color}28` }}>
                              {cat.icon} {lang === "tr" ? cat.labelTr : cat.labelDe}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
