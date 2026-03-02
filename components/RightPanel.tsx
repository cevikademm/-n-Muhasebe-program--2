import React, { useState } from "react";
import { useLang } from "../LanguageContext";
import { AccountRow, MenuKey } from "../types";
import { analyzeAccountRecord, analyzeInvoiceImage } from "../services/geminiService";
import {
  ArrowLeft,
  Camera,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react";

interface RightPanelProps {
  selectedRow: AccountRow | null;
  activeMenu: MenuKey;
  onClose?: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({ selectedRow, activeMenu, onClose }) => {
  const { t, lang } = useLang();
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);

  const handleAnalyzeAccount = async () => {
    if (!selectedRow) return;
    setAiLoading(true);
    try {
      const result = await analyzeAccountRecord(selectedRow, lang);
      setAiResult(result || "No response");
    } catch (e: any) {
      setAiResult("Error: " + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleInvoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setInvoiceImage(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeInvoice = async () => {
    if (!invoiceImage) return;
    setAiLoading(true);
    try {
      const base64 = invoiceImage.split(",")[1];
      const result = await analyzeInvoiceImage(base64, lang);
      setAiResult(result || "No response");
    } catch (e: any) {
      setAiResult("Error: " + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const panelStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "320px",
    minWidth: "320px",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflowY: "auto",
    background: "#0d0f15",
    borderLeft: "1px solid #1c1f27",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid #1c1f27",
    background: "#0d0f15",
    flexShrink: 0,
  };

  const fieldStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: "10px",
    background: "#15181f",
    border: "1px solid #1c1f27",
  };

  // 1. Faturalar görünümü
  if (activeMenu === "invoices") {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div className="flex items-center gap-3">
            {onClose && (
              <button onClick={onClose}
                className="md:hidden cursor-pointer border-none bg-transparent"
                style={{ color: "#3a3f4a" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#06b6d4")}
                onMouseLeave={e => (e.currentTarget.style.color = "#3a3f4a")}>
                <ArrowLeft size={20} />
              </button>
            )}
            <h3 className="font-syne font-bold text-sm text-slate-100 m-0">{t.invoices}</h3>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Upload zone */}
          <label style={{
            padding: "24px 16px",
            borderRadius: "12px",
            border: "2px dashed #1c1f27",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            cursor: "pointer", position: "relative", transition: "all .15s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(6,182,212,.4)";
              (e.currentTarget as HTMLElement).style.background = "rgba(6,182,212,.04)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "#1c1f27";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}>
            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleInvoiceUpload} accept="image/*" />
            <Camera size={28} style={{ color: "#3a3f4a", marginBottom: "8px" }} />
            <span className="text-xs font-semibold" style={{ color: "#3a3f4a" }}>{t.uploadInvoice}</span>
          </label>

          {invoiceImage && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1c1f27" }}>
              <img src={invoiceImage} alt="Invoice" className="w-full h-auto object-contain"
                style={{ background: "#15181f" }} />
            </div>
          )}

          {invoiceImage && (
            <button
              onClick={handleAnalyzeInvoice}
              disabled={aiLoading}
              style={{
                width: "100%", padding: "10px", borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(139,92,246,.2), rgba(6,182,212,.15))",
                border: "1px solid rgba(139,92,246,.3)",
                color: "#a78bfa", fontSize: "12px", fontWeight: 700,
                cursor: aiLoading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
              {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {aiLoading ? t.aiThinking : t.analyzeInvoice}
            </button>
          )}

          {aiResult && (
            <div style={fieldStyle}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#8b5cf6" }}>
                {t.aiAnalysisResult}
              </div>
              <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">{aiResult}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. Raporlar
  if (activeMenu === "reports") return null;

  // 3. Hesap Planları — boş durum
  if (!selectedRow) {
    return (
      <div style={{ ...panelStyle, alignItems: "center", justifyContent: "center" }}>
        <FileText size={40} style={{ color: "#1c1f27", marginBottom: "12px" }} />
        <p className="text-xs" style={{ color: "#3a3f4a" }}>{t.selectRow}</p>
      </div>
    );
  }

  const detailFields = [
    { label: t.id,                     value: selectedRow.id },
    { label: t.guvPosten,              value: selectedRow.guv_posten },
    { label: t.programmverbindung,     value: selectedRow.programmverbindung },
    { label: t.accountPrefix,          value: selectedRow.account_prefix },
    { label: t.accountCode,            value: selectedRow.account_code },
    { label: t.accountDescription,     value: selectedRow.account_description },
    { label: t.balanceItem,            value: selectedRow.balance_item },
    { label: t.analysisJustification,  value: selectedRow.analysis_justification },
    { label: t.createdAt,              value: selectedRow.created_at ? new Date(selectedRow.created_at).toLocaleString() : "—" },
  ];

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose}
              className="md:hidden cursor-pointer border-none bg-transparent"
              style={{ color: "#3a3f4a" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#06b6d4")}
              onMouseLeave={e => (e.currentTarget.style.color = "#3a3f4a")}>
              <ArrowLeft size={20} />
            </button>
          )}
          <h3 className="font-syne font-bold text-sm text-slate-100 m-0">{t.detailCard}</h3>
        </div>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded"
          style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
          #{selectedRow.id}
        </span>
      </div>

      {/* Account code hero */}
      <div style={{
        margin: "16px",
        padding: "20px",
        borderRadius: "16px",
        background: "linear-gradient(135deg, rgba(6,182,212,.12) 0%, rgba(6,182,212,.04) 100%)",
        border: "1px solid rgba(6,182,212,.2)",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: "15%", right: "15%", height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(6,182,212,.4), transparent)",
        }} />
        <div className="font-syne font-bold text-3xl mb-1.5" style={{ color: "#06b6d4" }}>
          {selectedRow.account_code || "—"}
        </div>
        <div className="text-xs leading-snug" style={{ color: "#64748b" }}>
          {selectedRow.account_description || "—"}
        </div>
      </div>

      {/* AI Button */}
      <div className="px-4 mb-4">
        <button
          onClick={handleAnalyzeAccount}
          disabled={aiLoading}
          style={{
            width: "100%", padding: "10px", borderRadius: "10px",
            background: "linear-gradient(135deg, rgba(16,185,129,.18), rgba(6,182,212,.12))",
            border: "1px solid rgba(16,185,129,.25)",
            color: "#10b981", fontSize: "12px", fontWeight: 700,
            cursor: aiLoading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            opacity: aiLoading ? 0.6 : 1,
          }}>
          {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {aiLoading ? t.aiThinking : t.analyzeWithAI}
        </button>
      </div>

      {/* AI Result */}
      {aiResult && (
        <div className="px-4 mb-4">
          <div style={fieldStyle}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#10b981" }}>
              {t.aiAnalysisResult}
            </div>
            <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">{aiResult}</p>
          </div>
        </div>
      )}

      {/* Detail Fields */}
      <div className="px-4 pb-6 flex flex-col gap-2.5">
        {detailFields.map((field, idx) => (
          <div key={idx} style={fieldStyle}>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "#3a3f4a" }}>
              {field.label}
            </div>
            <div className="text-xs text-slate-200 break-words leading-snug">
              {field.value || "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
