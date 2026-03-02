import React, { useMemo, useState } from "react";
import { useLang } from "../LanguageContext";
import { Invoice, InvoiceItem, AccountRow } from "../types";
import { GlowingEffect } from "./GlowingEffect";
import { 
  ArrowLeft, 
  Edit2, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Lightbulb, 
  FileText, 
  ExternalLink, 
  X
} from "lucide-react";

interface InvoiceRightPanelProps {
  selectedInvoice: Invoice | null;
  selectedItem: InvoiceItem | null;
  onBackToPreview: () => void;
  onClose: () => void;
  accountPlans: AccountRow[];
  items?: InvoiceItem[];
  onSelectItem?: (item: InvoiceItem | null) => void;
  userRole?: string;
  onDelete?: (invoice: Invoice) => void;
  onUpdateStatus?: (invoice: Invoice, status: "check" | "analyzed") => void;
  onUpdateItem?: (itemId: string, newAccount: AccountRow) => void;
}

const safe = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return "—"; } }
  return String(v);
};
const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

export const InvoiceRightPanel: React.FC<InvoiceRightPanelProps> = ({
  selectedInvoice, selectedItem, onBackToPreview, onClose,
  accountPlans, items = [], onSelectItem, userRole = "user", onDelete, onUpdateStatus, onUpdateItem,
}) => {
  const { t, lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;

  const [isEditing, setIsEditing]   = useState(false);
  const [codeSearch, setCodeSearch] = useState("");

  // ── Hesap Planından master veri çek (kanun niteliğinde, değiştirilemez) ──
  const masterAccount = useMemo(() => {
    if (!selectedItem || !accountPlans) return null;
    return accountPlans.find(p => p.account_code === selectedItem.account_code) || null;
  }, [selectedItem, accountPlans]);

  const filteredAccounts = useMemo(() => {
    if (!codeSearch) return [];
    const q = codeSearch.toLowerCase();
    return accountPlans.filter(p =>
      (p.account_code || "").includes(q) ||
      (p.account_description || "").toLowerCase().includes(q)
    ).slice(0, 50);
  }, [accountPlans, codeSearch]);

  const handleManualUpdate = (acc: AccountRow) => {
    if (selectedItem && onUpdateItem) {
      onUpdateItem(selectedItem.id, acc);
      setIsEditing(false);
      setCodeSearch("");
    }
  };

  /* ── Empty state ── */
  if (!selectedInvoice) {
    return (
      <div className="w-full md:w-[360px] md:min-w-[360px] flex flex-col h-full items-center justify-center"
        style={{ background: "#0d0f15", borderLeft: "1px solid #1c1f27" }}>
        <FileText size={48} className="mb-3 opacity-50" style={{ color: "#1c1f27" }} />
        <p className="text-xs" style={{ color: "#3a3f4a" }}>{t.selectInvoice}</p>
      </div>
    );
  }

  /* ──────────────────────────────────
     VIEW: Account code / AI analysis
  ────────────────────────────────── */
  if (selectedItem) {
    // Hesap Planları master verisi her zaman öncelikli (kanun niteliğinde)
    const primaryName   = lang === "tr"
      ? (selectedItem.account_name_tr || selectedItem.account_name)
      : selectedItem.account_name;
    const secondaryName = lang === "tr"
      ? selectedItem.account_name
      : selectedItem.account_name_tr;

    const score  = Number(selectedItem.match_score || 0);
    const scoreCls = score >= 90 ? "badge-analyzed" : score >= 70 ? "badge-pending" : "badge-duplicate";

    return (
      <div className="w-full md:w-[360px] md:min-w-[360px] flex flex-col h-full overflow-hidden"
        style={{ background: "#0d0f15", borderLeft: "1px solid #1c1f27" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid #1c1f27", background: "#0d0f15" }}>
          <button onClick={onBackToPreview}
            className="font-mono text-lg cursor-pointer border-none bg-transparent transition-colors"
            style={{ color: "#3a3f4a" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#06b6d4")}
            onMouseLeave={e => (e.currentTarget.style.color = "#3a3f4a")}>
            <ArrowLeft size={20} />
          </button>
          <span className="font-syne font-bold text-sm text-slate-100">{t.accountMatch}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Account card */}
          <div className="m-4 rounded-lg p-5 relative overflow-hidden"
            style={{ 
                background: "#15181f", 
                borderTop: "1px solid #1c1f27",
                borderRight: "1px solid #1c1f27",
                borderBottom: "1px solid #1c1f27",
                borderLeft: "2px solid #06b6d4" 
            }}>

            {/* Edit toggle */}
            {!isEditing && (
              <button onClick={() => setIsEditing(true)}
                className="absolute top-3 right-3 w-7 h-7 rounded-md flex items-center justify-center cursor-pointer border-none transition-colors"
                style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(6,182,212,.2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(6,182,212,.1)")}>
                <Edit2 size={14} />
              </button>
            )}

            {!isEditing ? (
              <div className="text-center">
                <div className="font-syne font-bold text-4xl mb-2" style={{ color: "#06b6d4" }}>
                  {safe(selectedItem.account_code)}
                </div>
                <div className="font-syne font-bold text-base text-slate-100 mb-1">
                  {safe(primaryName)}
                </div>
                {secondaryName && (
                  <div className="text-xs italic mb-3" style={{ color: "#3a3f4a" }}>({safe(secondaryName)})</div>
                )}
                <span className={`inline-block text-[10px] font-bold px-3 py-1 rounded-full ${scoreCls}`}>
                  {t.matchScore}: %{score}
                </span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="c-section-title mb-0">{t.editAccount}</span>
                  <button onClick={() => { setIsEditing(false); setCodeSearch(""); }}
                    className="text-xs cursor-pointer border-none bg-transparent flex items-center gap-1"
                    style={{ color: "#06b6d4" }}>
                    <X size={12} /> {t.cancel}
                  </button>
                </div>
                <input type="text" autoFocus className="c-input text-xs mb-2"
                  placeholder={t.searchAccountPlaceholder}
                  value={codeSearch} onChange={e => setCodeSearch(e.target.value)} />
                <div className="overflow-y-auto rounded-md" style={{ maxHeight: "200px", border: "1px solid #1c1f27" }}>
                  {filteredAccounts.length > 0 ? filteredAccounts.map(acc => (
                    <div key={acc.id} onClick={() => handleManualUpdate(acc)}
                      className="px-3 py-2 cursor-pointer transition-colors"
                      style={{ borderBottom: "1px solid #1c1f27" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(6,182,212,.06)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div className="font-mono font-bold text-xs" style={{ color: "#06b6d4" }}>{acc.account_code}</div>
                      <div className="text-[10px] truncate" style={{ color: "#64748b" }}>{acc.account_description}</div>
                    </div>
                  )) : (
                    <div className="px-3 py-4 text-center text-xs" style={{ color: "#3a3f4a" }}>
                      {codeSearch ? tr("Sonuç yok","Keine Ergebnisse") : tr("Aramak için yazın...","Zum Suchen tippen...")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════
              HESAP PLANI VERİLERİ (Kanun niteliğinde — değiştirilemez)
              Veri kaynağı: account_plans tablosu
          ══════════════════════════════════════════ */}
          <div className="mx-4 mb-4">
            <div className="flex items-center gap-1.5 mb-3">
              <FileText size={14} style={{ color: "#06b6d4" }} />
              <span className="c-section-title mb-0">{tr("Hesap Planı Verileri","Kontenplan-Daten")}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
                style={{ background: "rgba(6,182,212,.12)", color: "#06b6d4" }}>
                {tr("Kanun Niteliğinde","Gesetzlich")}
              </span>
            </div>

            {masterAccount ? (
              <div className="space-y-3">
                {/* KATEGORİ */}
                <div className="p-3.5 rounded-lg"
                  style={{ background: "#15181f", border: "1px solid #1c1f27" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                      {t.category || tr("KATEGORİ","KATEGORIE")}
                    </div>
                  </div>
                  <div className="text-[9px] mb-2" style={{ color: "#64748b" }}>
                    {tr("Bu hesabın ait olduğu ana muhasebe sınıfı (Örn: Gider, Gelir, Varlık).", "Die Hauptbuchhaltungsklasse, zu der dieses Konto gehört.")}
                  </div>
                  <div className="text-sm text-slate-200 leading-snug">
                    {safe(masterAccount.category)}
                  </div>
                </div>

                {/* BİLANÇO KALEMİ */}
                <div className="p-3.5 rounded-lg"
                  style={{ background: "#15181f", border: "1px solid #1c1f27" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                      {t.balanceItem || tr("BİLANÇO KALEMİ","BILANZPOSTEN")}
                    </div>
                  </div>
                  <div className="text-[9px] mb-2" style={{ color: "#64748b" }}>
                    {tr("Yıl sonu bilançosunda veya gelir tablosunda raporlandığı yer.", "Wo es in der Jahresendbilanz oder Gewinn- und Verlustrechnung ausgewiesen wird.")}
                  </div>
                  <div className="text-sm text-slate-200 leading-snug">
                    {safe(masterAccount.balance_item)}
                  </div>
                </div>

                {/* GUV POSTEN */}
                {masterAccount.guv_posten && (
                  <div className="p-3.5 rounded-lg"
                    style={{ background: "#15181f", border: "1px solid #1c1f27" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                        {t.guvPosten || "GUV POSTEN"}
                      </div>
                    </div>
                    <div className="text-[9px] mb-2" style={{ color: "#64748b" }}>
                      {tr("Gelir tablosundaki (GuV) tam karşılığı ve sınıflandırması.", "Die genaue Entsprechung und Klassifizierung in der Gewinn- und Verlustrechnung (GuV).")}
                    </div>
                    <div className="text-sm text-slate-200 leading-snug">
                      {safe(masterAccount.guv_posten)}
                    </div>
                  </div>
                )}

                {/* ANALİZ GEREKÇESİ (Hesap Planından) */}
                <div className="p-3.5 rounded-lg"
                  style={{ 
                    background: "#15181f", 
                    borderTop: "1px solid #1c1f27",
                    borderRight: "1px solid #1c1f27",
                    borderBottom: "1px solid #1c1f27",
                    borderLeft: "2px solid #06b6d4"
                  }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Lightbulb size={14} className="text-cyan-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#06b6d4" }}>
                      {t.analysisJustification || tr("ANALİZ GEREKÇESİ","ANALYSE-BEGRÜNDUNG")}
                    </span>
                  </div>
                  <div className="text-[9px] mb-2" style={{ color: "#64748b" }}>
                    {tr("Bu hesabın hangi durumlarda kullanılacağına dair detaylı kural ve açıklama.", "Detaillierte Regel und Erklärung, in welchen Fällen dieses Konto verwendet wird.")}
                  </div>
                  <p className="text-xs italic leading-relaxed" style={{ color: "#94a3b8", borderLeft: "2px solid #2a3040", paddingLeft: "10px" }}>
                    "{safe(masterAccount.analysis_justification)}"
                  </p>
                </div>

                {/* OLUŞTURMA TARİHİ */}
                {masterAccount.created_at && (
                  <div className="p-3.5 rounded-lg"
                    style={{ background: "#15181f", border: "1px solid #1c1f27" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#3a3f4a" }}>
                      {t.createdAt || tr("OLUŞTURMA TARİHİ","ERSTELLUNGSDATUM")}
                    </div>
                    <div className="text-xs text-slate-400">
                      {new Date(masterAccount.created_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Hesap Planında eşleşme bulunamadıysa */
              <div className="p-4 rounded-lg text-center"
                style={{ background: "#15181f", border: "1px solid rgba(239,68,68,.3)" }}>
                <AlertTriangle size={20} className="mx-auto mb-2 text-red-500" />
                <p className="text-xs font-bold" style={{ color: "#ef4444" }}>
                  {tr(
                    `HESAP KODU BULUNAMADI`,
                    `KONTENCODE NICHT GEFUNDEN`
                  )}
                </p>
                <p className="text-[10px] mt-1" style={{ color: "#f87171" }}>
                  {tr(
                    `Yapay zeka bu kalem için hesap planınızda uygun bir hesap kodu bulamadı. Lütfen manuel olarak bir hesap kodu seçin.`,
                    `Die KI konnte für diese Position keinen passenden Kontencode in Ihrem Kontenplan finden. Bitte wählen Sie manuell einen Kontencode aus.`
                  )}
                </p>
                {/* Fallback: AI analiz varsa göster */}
                {selectedItem.match_justification && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1c1f27" }}>
                    <div className="flex items-center gap-1.5 justify-center mb-2">
                      <Lightbulb size={12} className="text-red-500" />
                      <span className="text-[9px] font-bold uppercase" style={{ color: "#ef4444" }}>
                        {tr("AI Analiz (Geçici)","KI-Analyse (Vorläufig)")}
                      </span>
                    </div>
                    <p className="text-xs italic leading-relaxed text-left" style={{ color: "#64748b" }}>
                      "{safe(selectedItem.match_justification)}"
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail sections */}
          <div className="px-4 pb-6 space-y-3">

            {/* Assigned code */}
            <div className="c-card p-4 relative">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
              <div className="relative z-10">
                <div className="c-section-title">{t.assignedCode}</div>
                <div className="text-sm text-slate-200">
                  <span className="font-mono" style={{ color: "#06b6d4" }}>{safe(selectedItem.account_code)}</span>
                  {" — "}{safe(selectedItem.account_name)}
                </div>
              </div>
            </div>

            {/* Turkish desc */}
            {selectedItem.account_name_tr && (
              <div className="c-card p-4 relative">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                <div className="relative z-10">
                  <div className="c-section-title">{t.turkishDesc}</div>
                  <div className="text-sm text-slate-200">{safe(selectedItem.account_name_tr)}</div>
                </div>
              </div>
            )}

            {/* HGB Analysis */}
            <div className="c-card p-4 relative">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
              <div className="relative z-10">
                <div className="c-section-title flex items-center gap-1"><FileText size={12} /> {t.dbAnalysis}</div>
                <div className="space-y-3">
                  {[
                    { l: t.hgbRef,       v: selectedItem.hgb_reference },
                    { l: t.taxDimension, v: selectedItem.tax_note      },
                    { l: t.periodicity,  v: selectedItem.period_note   },
                  ].map((row, i) => (
                    <div key={i} className="pl-3" style={{ borderLeft: "2px solid #1c1f27" }}>
                      <div className="c-section-title mb-0.5">{row.l}</div>
                      <div className="text-xs text-slate-300">{safe(row.v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Classification */}
            <div className="c-card p-4 relative">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
              <div className="relative z-10">
                <div className="c-section-title flex items-center gap-1"><FileText size={12} /> {t.classification}</div>
                <div className="space-y-3">
                  {[
                    { l: t.expenseType,  v: selectedItem.expense_type          },
                    { l: t.datevCounter, v: selectedItem.datev_counter_account  },
                  ].map((row, i) => (
                    <div key={i} className="pl-3" style={{ borderLeft: "2px solid #1c1f27" }}>
                      <div className="c-section-title mb-0.5">{row.l}</div>
                      <div className="text-xs text-slate-300">{safe(row.v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  /* ──────────────────────────────────
     VIEW: Invoice preview
  ────────────────────────────────── */
  const fileType = selectedInvoice.file_type || "";
  const isImage  = fileType.startsWith("image/");
  const isPdf    = fileType === "application/pdf";
  const displayId = selectedInvoice.id ? String(selectedInvoice.id).substring(0, 8) : "—";

  const statusInfo: Record<string, { cls: string; label: string }> = {
    pending:   { cls: "badge-pending",   label: t.pending   },
    analyzed:  { cls: "badge-analyzed",  label: t.analyzed  },
    duplicate: { cls: "badge-duplicate", label: t.duplicate },
    check:     { cls: "badge-check",     label: t.check     },
    error:     { cls: "badge-error",     label: tr("Hata","Fehler") },
  };
  const si = statusInfo[selectedInvoice.status] || statusInfo.pending;

  return (
    <div className="w-full md:w-[360px] md:min-w-[360px] flex flex-col h-full overflow-hidden"
      style={{ background: "#0d0f15", borderLeft: "1px solid #1c1f27" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 shrink-0"
        style={{ borderBottom: "1px solid #1c1f27", background: "#0d0f15" }}>
        <div className="flex items-center gap-3">
          {/* Mobile back */}
          <button onClick={onClose}
            className="md:hidden font-mono text-lg cursor-pointer border-none bg-transparent"
            style={{ color: "#3a3f4a" }}>
            <ArrowLeft size={20} />
          </button>
          <span className="font-syne font-bold text-sm text-slate-100">{t.invoicePreview}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${si.cls}`}>{si.label}</span>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded"
            style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>#{displayId}</span>
        </div>
      </div>

      <div key={selectedInvoice.id} className="flex-1 overflow-y-auto">

        {/* Action buttons */}
        <div className="px-4 pt-4 flex gap-2">
          {onUpdateStatus && (
            <button
              onClick={() => onUpdateStatus(selectedInvoice, selectedInvoice.status === "check" ? "analyzed" : "check")}
              className="flex-1 py-2 text-xs font-semibold rounded-md cursor-pointer transition-all border-none flex items-center justify-center gap-1.5"
              style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4", border: "1px solid rgba(6,182,212,.2)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(6,182,212,.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(6,182,212,.1)")}>
              {selectedInvoice.status === "check" ? <><Check size={14} /> {t.analyzed}</> : <><AlertTriangle size={14} /> {t.markAsCheck}</>}
            </button>
          )}
          {userRole === "admin" && onDelete && (
            <button onClick={() => onDelete(selectedInvoice)}
              className="py-2 px-3 text-xs font-semibold rounded-md cursor-pointer transition-all border-none flex items-center justify-center"
              style={{ background: "rgba(239,68,68,.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,.15)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,.08)")}>
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Summary card */}
        <div className="m-4 p-5 rounded-lg c-card c-card-cyan relative">
          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
          <div className="relative z-10">
            <div className="text-xs mb-1" style={{ color: "#3a3f4a" }}>
              {safe(selectedInvoice.supplier_name)}
            </div>
            <div className="font-syne font-bold text-2xl text-slate-100 mb-1">
              {selectedInvoice.total_gross ? fmt(Number(selectedInvoice.total_gross)) : "—"}
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: "#3a3f4a" }}>
              <span>{safe(selectedInvoice.invoice_number)}</span>
              <span>·</span>
              <span>{safe(selectedInvoice.invoice_date)}</span>
            </div>
            {selectedInvoice.status === "duplicate" && (
              <div className="mt-3 px-3 py-2 rounded-md text-xs font-medium badge-duplicate flex items-center gap-1.5"
                style={{ border: "1px solid rgba(239,68,68,.2)" }}>
                <AlertTriangle size={12} /> {t.duplicateMessage}
              </div>
            )}
          </div>
        </div>

        {/* File preview */}
        <div className="mx-4 mb-4 overflow-hidden rounded-lg" style={{ border: "1px solid #1c1f27", minHeight: "360px", background: "#15181f" }}>
          {selectedInvoice.file_url ? (
            isImage ? (
              <img src={selectedInvoice.file_url} alt="Invoice"
                className="w-full h-full object-contain p-2" />
            ) : isPdf ? (
              <iframe src={selectedInvoice.file_url} className="w-full border-none"
                style={{ minHeight: "360px" }} title="Invoice PDF" />
            ) : (
              <div className="flex flex-col items-center justify-center h-[360px] gap-3">
                <FileText size={48} style={{ color: "#3a3f4a" }} />
                <a href={selectedInvoice.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold underline flex items-center gap-1" style={{ color: "#06b6d4" }}>
                  {tr("Yeni Sekmede Aç","In neuem Tab öffnen")} <ExternalLink size={12} />
                </a>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-[360px] text-xs" style={{ color: "#3a3f4a" }}>
              {t.noPreview || tr("Önizleme yok","Keine Vorschau")}
            </div>
          )}
        </div>

        {/* Invoice items */}
        {items.length > 0 && (
          <div className="px-4 pb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="c-section-title mb-0">{t.invoiceItems}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const score    = Number(item.match_score || 0);
                const scoreCls = score >= 90 ? "badge-analyzed" : score >= 70 ? "badge-pending" : "badge-duplicate";
                return (
                  <div key={item.id || idx}
                    onClick={() => onSelectItem && onSelectItem(item)}
                    className="c-card px-4 py-3 cursor-pointer transition-all relative"
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(6,182,212,.25)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1c1f27")}>
                    <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                    <div className="relative z-10">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-sm font-medium text-slate-200 line-clamp-2 leading-snug">
                          {safe(item.description)}
                        </span>
                        <span className="font-syne font-bold text-sm text-slate-100 whitespace-nowrap shrink-0">
                          {item.gross_amount ? fmt(Number(item.gross_amount)) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
                            {safe(item.account_code)}
                          </span>
                          {item.match_score && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${scoreCls}`}>
                              %{item.match_score}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-base" style={{ color: "#3a3f4a" }}>›</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};