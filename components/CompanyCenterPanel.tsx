import React from "react";
import { useLang } from "../LanguageContext";
import { Company } from "../types";

interface CompanyCenterPanelProps {
  companies: Company[];
  loading: boolean;
  selectedCompany: Company | null;
  onSelectCompany: (company: Company) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export const CompanyCenterPanel: React.FC<CompanyCenterPanelProps> = ({
  companies,
  loading,
  selectedCompany,
  onSelectCompany,
  searchTerm,
  setSearchTerm,
}) => {
  const { t } = useLang();

  const filteredData = companies.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      (c.company_name || "").toLowerCase().includes(term) ||
      (c.tax_number || "").toLowerCase().includes(term) ||
      (c.city || "").toLowerCase().includes(term) ||
      (c.email || "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden"
      style={{ borderRight: "1px solid #1c1f27", background: "#0d0f15" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid #1c1f27", background: "#0d0f15" }}>
        <div>
          <h2 className="font-syne font-bold text-base text-slate-100 m-0">{t.companies}</h2>
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
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-[200px] text-xs" style={{ color: "#3a3f4a" }}>
            <div className="w-5 h-5 border-2 rounded-full animate-spin mr-3"
              style={{ borderColor: "rgba(6,182,212,.2)", borderTopColor: "#06b6d4" }} />
            {t.loading}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-xs" style={{ color: "#3a3f4a" }}>
            {t.noCompanies}
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {[
                  { key: 'userEmail',   label: t.userEmail   },
                  { key: 'companyName', label: t.companyName },
                  { key: 'city',        label: t.city        },
                  { key: 'phone',       label: t.phone       },
                  { key: 'createdAt',   label: t.createdAt   },
                ].map(col => (
                  <th key={col.key}
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
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row) => {
                const isSelected = selectedCompany?.id === row.id;
                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelectCompany(row)}
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
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap text-slate-300">
                      {row.email || "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-syne font-semibold" style={{ color: "#94a3b8" }}>
                      {row.company_name || "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#64748b" }}>
                      {row.city || "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono" style={{ color: "#3a3f4a" }}>
                      {row.phone || "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono" style={{ color: "#2a3040" }}>
                      {row.created_at ? new Date(row.created_at).toLocaleDateString("de-DE") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
