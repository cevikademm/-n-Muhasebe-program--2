import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLang } from "../LanguageContext";
import { AccountRow } from "../types";

interface CenterPanelProps {
  data: AccountRow[];
  loading: boolean;
  selectedRow: AccountRow | null;
  onSelectRow: (row: AccountRow) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export const CenterPanel: React.FC<CenterPanelProps> = ({
  data,
  loading,
  selectedRow,
  onSelectRow,
  searchTerm,
  setSearchTerm,
}) => {
  const { t } = useLang();

  const [displayedLimit, setDisplayedLimit] = useState(100);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return data;
    return data.filter((row) =>
      (row.guv_posten || "").toLowerCase().includes(term) ||
      (row.account_code || "").toLowerCase().includes(term) ||
      (row.account_description || "").toLowerCase().includes(term) ||
      (row.analysis_justification || "").toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  useEffect(() => {
    setDisplayedLimit(100);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [searchTerm, data]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 500) {
        setDisplayedLimit((prev) => Math.min(prev + 100, filteredData.length));
      }
    }
  };

  const visibleData = filteredData.slice(0, displayedLimit);

  return (
    <div className="flex-1 flex flex-col overflow-hidden"
      style={{ borderRight: "1px solid #1c1f27", background: "#0d0f15" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid #1c1f27", background: "#0d0f15" }}>
        <div>
          <h2 className="font-syne font-bold text-base text-slate-100 m-0">{t.accountPlans}</h2>
          <p className="text-xs mt-0.5" style={{ color: "#3a3f4a" }}>
            {t.totalRows}: {filteredData.length}
          </p>
        </div>
        <input
          type="text"
          placeholder={t.search}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="c-input text-xs"
          style={{ width: "200px", padding: "7px 12px" }}
        />
      </div>

      {/* Table */}
      <div
        className="flex-1 overflow-auto"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {loading ? (
          <div className="flex items-center justify-center h-[200px] text-xs" style={{ color: "#3a3f4a" }}>
            <div className="w-5 h-5 border-2 rounded-full animate-spin mr-3"
              style={{ borderColor: "rgba(6,182,212,.2)", borderTopColor: "#06b6d4" }} />
            {t.loading}
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {['id', 'guvPosten', 'accountCode', 'accountDescription', 'analysisJustification', 'balanceItem'].map(key => (
                  <th key={key}
                    className="sticky top-0 text-left whitespace-nowrap"
                    style={{
                      background: "#080b10",
                      color: "#3a3f4a",
                      borderBottom: "1px solid #1c1f27",
                      padding: "10px 14px",
                      fontSize: "9px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      zIndex: 10,
                    }}>
                    {t[key as keyof typeof t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleData.map((row) => {
                const isSelected = selectedRow?.id === row.id;
                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelectRow(row)}
                    style={{
                      borderBottom: "1px solid #111520",
                      background: isSelected ? "rgba(6,182,212,.06)" : "transparent",
                      borderLeft: `2px solid ${isSelected ? "#06b6d4" : "transparent"}`,
                      cursor: "pointer",
                      transition: "background .12s",
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,.025)";
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                    }}
                  >
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: "#3a3f4a" }}>{row.id}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#64748b" }}>{row.guv_posten || "—"}</td>
                    <td className="px-4 py-2.5 font-mono font-bold whitespace-nowrap" style={{ color: "#06b6d4" }}>{row.account_code || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap max-w-[250px] overflow-hidden text-ellipsis text-slate-300">
                      {row.account_description || "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap max-w-[250px] overflow-hidden text-ellipsis"
                      style={{ color: "#3a3f4a" }}
                      title={row.analysis_justification || ""}>
                      {row.analysis_justification || "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#64748b" }}>{row.balance_item || "—"}</td>
                  </tr>
                );
              })}
              {visibleData.length < filteredData.length && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-xs italic" style={{ color: "#2a3040" }}>
                    {visibleData.length} / {filteredData.length} · {t.loading || "Yükleniyor..."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
