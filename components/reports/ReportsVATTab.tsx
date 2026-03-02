import React from "react";
import { Download } from "lucide-react";
import { fmt, exportCSV, VatData } from "./reportsHelpers";

interface Props {
  vatData: VatData;
  yearA: number;
  lang: string;
  tr: (a: string, b: string) => string;
}

export const ReportsVATTab: React.FC<Props> = ({ vatData, yearA, lang, tr }) => {
  const exportVAT = () => {
    const header = [tr("Ay", "Monat"), "VSt 19% Netto", "VSt 19%", "VSt 7% Netto", "VSt 7%", tr("Toplam Netto", "Gesamtnetto")];
    const rows = vatData.monthly.map(m => [m.label, m.net.toFixed(2), m.vat19.toFixed(2), "—", m.vat7.toFixed(2), m.net.toFixed(2)]);
    exportCSV([header, ...rows], `muhasys_vorsteuer_${yearA}.csv`);
  };

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 fade-up">
        {[
          { label: tr("Net (%19 matrah)", "Netto VSt 19%"), val: fmt(vatData.vat19Net), sub: tr(`KDV: ${fmt(vatData.vat19Tax)}`, `VSt: ${fmt(vatData.vat19Tax)}`), color: "#06b6d4", cls: "c-card-cyan" },
          { label: tr("Net (%7 matrah)", "Netto VSt 7%"), val: fmt(vatData.vat7Net), sub: tr(`KDV: ${fmt(vatData.vat7Tax)}`, `VSt: ${fmt(vatData.vat7Tax)}`), color: "#10b981", cls: "c-card-green" },
          { label: tr("KDV Muaf Net", "Netto USt-frei"), val: fmt(vatData.vat0Net), sub: "%0", color: "#64748b", cls: "" },
          { label: tr("Toplam Vorsteuer", "Gesamt-Vorsteuer"), val: fmt(vatData.totalVst), sub: tr("İndirim hakkı", "Abziehbar §15 UStG"), color: "#8b5cf6", cls: "" },
        ].map((c, i) => (
          <div key={i} className={`c-card ${c.cls} p-4`}>
            <div className="c-section-title mb-1">{c.label}</div>
            <div className="font-syne font-bold text-base font-mono" style={{ color: c.color }}>{c.val}</div>
            <div className="text-[10px] mt-1 font-mono" style={{ color: "#3a3f4a" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Monthly table */}
      <div className="c-card overflow-hidden fade-up">
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid #1c1f27" }}>
          <div>
            <div className="font-syne font-semibold text-sm text-slate-200">
              {tr("Aylık Vorsteuer Tablosu", "Monatliche Vorsteuer-Übersicht")}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#3a3f4a" }}>
              {tr("USt-Voranmeldung hazırlığı", "Vorbereitung USt-Voranmeldung")} — {yearA}
            </div>
          </div>
          <button onClick={exportVAT}
            className="c-btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md">
            <Download size={14} /> CSV
          </button>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {[
                tr("Ay", "Monat"),
                tr("Net Matrah", "Bemessungsgrundlage"),
                "VSt 19% Netto", "VSt 19%",
                "VSt 7% Netto", "VSt 7%",
                tr("Toplam VSt", "Gesamte VSt"),
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
            {vatData.monthly.map((row, i) => {
              const hasData = row.net > 0 || row.vat19 > 0 || row.vat7 > 0;
              const isCurrentMonth = i === new Date().getMonth() && yearA === new Date().getFullYear();
              return (
                <tr key={i} style={{
                  borderBottom: "1px solid #1c1f27",
                  background: isCurrentMonth ? "rgba(6,182,212,.04)" : "transparent",
                }}
                  onMouseEnter={e => hasData && (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = isCurrentMonth ? "rgba(6,182,212,.04)" : "transparent")}>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: "#94a3b8" }}>{row.label}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {hasData ? fmt(row.net) : <span style={{ color: "#2a3040" }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: "#64748b" }}>
                    {row.net > 0 ? fmt(row.net) : <span style={{ color: "#2a3040" }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-syne font-bold" style={{ color: row.vat19 > 0 ? "#06b6d4" : "#2a3040" }}>
                    {row.vat19 > 0 ? fmt(row.vat19) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: "#64748b" }}>
                    {row.vat7 > 0 ? fmt(row.vat7 * (100 / 7)) : <span style={{ color: "#2a3040" }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-syne font-bold" style={{ color: row.vat7 > 0 ? "#10b981" : "#2a3040" }}>
                    {row.vat7 > 0 ? fmt(row.vat7) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-syne font-bold text-slate-100">
                    {(row.vat19 + row.vat7) > 0 ? fmt(row.vat19 + row.vat7) : <span style={{ color: "#2a3040" }}>—</span>}
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ background: "rgba(6,182,212,.06)", borderTop: "2px solid rgba(6,182,212,.2)" }}>
              <td className="px-4 py-3 font-syne font-bold" style={{ color: "#06b6d4" }}>
                {tr("TOPLAM", "GESAMT")}
              </td>
              <td className="px-4 py-3 font-syne font-bold text-slate-100">
                {fmt(vatData.monthly.reduce((s, r) => s + r.net, 0))}
              </td>
              <td className="px-4 py-3 font-syne font-bold text-slate-100">{fmt(vatData.vat19Net)}</td>
              <td className="px-4 py-3 font-syne font-bold" style={{ color: "#06b6d4" }}>{fmt(vatData.vat19Tax)}</td>
              <td className="px-4 py-3 font-syne font-bold text-slate-100">{fmt(vatData.vat7Net)}</td>
              <td className="px-4 py-3 font-syne font-bold" style={{ color: "#10b981" }}>{fmt(vatData.vat7Tax)}</td>
              <td className="px-4 py-3 font-syne font-bold" style={{ color: "#8b5cf6" }}>{fmt(vatData.totalVst)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* §15 UStG info */}
      <div className="c-card c-card-cyan p-4 text-xs fade-up" style={{ color: "#3a3f4a", lineHeight: "1.6" }}>
        <span className="font-mono" style={{ color: "#06b6d4" }}>§ 15 UStG</span>{" "}
        <span className="text-slate-300 font-semibold">{tr("Vorsteuerabzug hakkı", "Vorsteuerabzugsrecht")}: </span>
        {tr(
          "Tablodaki VSt tutarları, Umsatzsteuer-Voranmeldung'da gider olarak düşülebilir. Aylık/üç aylık beyan yükümlülüğünüze göre kontrol ediniz.",
          "Die in der Tabelle ausgewiesenen Vorsteuerbeträge können in der USt-Voranmeldung als Vorsteuer abgezogen werden."
        )}
      </div>
    </>
  );
};
