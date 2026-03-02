import React from "react";
import { GlowingEffect } from "../GlowingEffect";
import {
  BarChart, DonutChart, fmt, fmtShort,
  CategoryDataItem, MonthlyDataItem, StatsData, SupplierDataItem,
} from "./reportsHelpers";

interface Props {
  stats: StatsData;
  monthlyData: MonthlyDataItem[];
  categoryData: CategoryDataItem[];
  supplierData: SupplierDataItem[];
  yearA: number;
  yearB: number;
  compare: boolean;
  lang: string;
  tr: (a: string, b: string) => string;
}

export const ReportsOverviewTab: React.FC<Props> = ({
  stats, monthlyData, categoryData, supplierData, yearA, yearB, compare, lang, tr,
}) => {
  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: tr("Fatura Sayısı", "Rechnungen"), val: stats.count.toString(), color: "#06b6d4", cls: "c-card-cyan" },
          { label: tr("Toplam Brüt", "Gesamtbrutto"), val: fmt(stats.totalGross), color: "#10b981", cls: "c-card-green" },
          { label: tr("Toplam Net", "Gesamtnetto"), val: fmt(stats.totalNet), color: "#e2e8f0", cls: "" },
          { label: tr("Toplam KDV", "Gesamt-USt"), val: fmt(stats.totalVat), color: "#8b5cf6", cls: "" },
          { label: tr("Ortalama", "Durchschnitt"), val: fmt(stats.avg), color: "#f59e0b", cls: "" },
        ].map((c, i) => (
          <div key={i} className={`c-card ${c.cls} p-4 fade-up relative`} style={{ animationDelay: `${i * 50}ms` }}>
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
            <div className="relative z-10">
              <div className="c-section-title mb-1">{c.label}</div>
              <div className="font-syne font-bold text-base font-mono" style={{ color: c.color }}>{c.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Monthly bar chart */}
      <div className="c-card p-5 fade-up relative">
        <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-syne font-semibold text-sm text-slate-200">
                {tr("Aylık Harcama Trendi", "Monatlicher Ausgabentrend")}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "#3a3f4a" }}>
                {yearA}{compare ? ` vs ${yearB}` : ""}
              </div>
            </div>
            {compare && (
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#06b6d4" }} /> {yearA}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "rgba(139,92,246,.5)" }} /> {yearB}
                </span>
              </div>
            )}
          </div>
          <BarChart data={monthlyData} height={140} showComparison={compare} />
        </div>
      </div>

      {/* Category donut + top suppliers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 fade-up">
        {/* Donut */}
        <div className="c-card p-5 relative">
          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
          <div className="relative z-10">
            <div className="font-syne font-semibold text-sm text-slate-200 mb-4">
              {tr("Kategori Dağılımı", "Kategorienverteilung")}
            </div>
            {categoryData.length === 0 ? (
              <div className="py-8 text-center text-xs" style={{ color: "#3a3f4a" }}>
                {tr("Analiz edilmiş fatura verisi yok", "Keine analysierten Rechnungsdaten")}
              </div>
            ) : (
              <div className="flex items-center gap-5">
                <DonutChart
                  slices={categoryData.slice(0, 8).map(c => ({ label: c.labelTr, value: c.total, color: c.color }))}
                  size={110}
                />
                <div className="flex-1 space-y-2">
                  {categoryData.slice(0, 5).map((c, i) => {
                    const total = categoryData.reduce((s, x) => s + x.total, 0);
                    const pct = total > 0 ? (c.total / total * 100) : 0;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="flex items-center gap-1.5">
                            <span>{c.icon}</span>
                            <span style={{ color: "#94a3b8" }}>{lang === "tr" ? c.labelTr : c.labelDe}</span>
                          </span>
                          <span className="font-mono font-semibold text-slate-200">{fmtShort(c.total)}</span>
                        </div>
                        <div className="w-full rounded-full h-1" style={{ background: "#1c1f27" }}>
                          <div className="h-1 rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: c.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top suppliers */}
        <div className="c-card p-5 relative">
          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
          <div className="relative z-10">
            <div className="font-syne font-semibold text-sm text-slate-200 mb-4">
              {tr("Top Tedarikçiler", "Top-Lieferanten")}
            </div>
            {supplierData.length === 0 ? (
              <div className="py-8 text-center text-xs" style={{ color: "#3a3f4a" }}>
                {tr("Veri yok", "Keine Daten")}
              </div>
            ) : (
              <div className="space-y-2.5">
                {supplierData.slice(0, 5).map((s, i) => {
                  const total = supplierData.reduce((acc, x) => acc + x.total, 0);
                  const pct = total > 0 ? (s.total / total * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono w-4 text-center shrink-0" style={{ color: "#3a3f4a" }}>{i + 1}</span>
                          <span className="text-slate-300 truncate max-w-[160px]">{s.name}</span>
                          <span style={{ color: "#3a3f4a" }}>{s.count}×</span>
                        </div>
                        <span className="font-mono text-slate-200 shrink-0">{fmtShort(s.total)}</span>
                      </div>
                      <div className="w-full rounded-full h-1" style={{ background: "#1c1f27" }}>
                        <div className="h-1 rounded-full"
                          style={{ width: `${pct}%`, background: "#06b6d4", opacity: 0.5 + i * 0.1 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
