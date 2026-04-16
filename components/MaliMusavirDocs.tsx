import React, { useState, useMemo, useRef, useEffect } from "react";
import { useLang } from "../LanguageContext";
import { Invoice, InvoiceItem } from "../types";
import {
  Briefcase, FileText, BookOpen, AlertTriangle,
  TrendingUp, Building2, Download, ChevronRight,
  Calendar, Printer, CheckCircle2, XCircle, Clock, FileOutput, Sigma,
  Menu, X as XIcon,
} from "lucide-react";
import { supabase } from "../services/supabaseService";
import { SavedTransaction, fetchUserIncomeTransactions, fetchAllUserBankTransactions, isRefundTransaction, isSelfTransferTransaction } from "../services/bankService";

// ── Tx kind override store (income | expense | refund) ──
type TxKind = "income" | "expense" | "refund";
const KIND_KEY = "mm_tx_kind_overrides";
let kindStore: Record<string, TxKind> = (() => {
  try { return JSON.parse(localStorage.getItem(KIND_KEY) || "{}"); } catch { return {}; }
})();
const kindListeners = new Set<() => void>();
const useKindOverrides = (): Record<string, TxKind> => {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    kindListeners.add(fn);
    return () => { kindListeners.delete(fn); };
  }, []);
  return kindStore;
};
const cycleKind = (id: string, current: TxKind) => {
  const order: TxKind[] = ["income", "refund", "expense"];
  const next = order[(order.indexOf(current) + 1) % order.length];
  const updated = { ...kindStore, [id]: next };
  kindStore = updated;
  try { localStorage.setItem(KIND_KEY, JSON.stringify(updated)); } catch {}
  kindListeners.forEach(fn => fn());
};
const getEffectiveKind = (tx: SavedTransaction, overrides: Record<string, TxKind>): TxKind => {
  if (overrides[tx.id]) return overrides[tx.id];
  return isRefundTransaction(tx) ? "refund" : "income";
};

interface Props {
  invoices: Invoice[];
  fetchItems: (invoiceId: string) => Promise<InvoiceItem[]>;
}

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
};

const fmtDateShort = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
  catch { return d; }
};

// ─── Report type definitions ────────────────────────────────────────────────
type ReportKey =
  | "teslim"
  | "eingangsbuch"
  | "ausgangsbuch"
  | "opos"
  | "bwa"
  | "fehlende"
  | "datev"
  | "banka";

interface ReportMeta {
  key: ReportKey;
  icon: React.ReactNode;
  color: string;
  titleTr: string;
  titleDe: string;
  subtitleTr: string;
  subtitleDe: string;
  badge: string;
}

const REPORTS: ReportMeta[] = [
  {
    key: "teslim",
    icon: <FileOutput size={16} />,
    color: "#a78bfa",
    titleTr: "Vergi Danışmanı Teslim Raporu",
    titleDe: "Steuerberater Übergabebericht",
    subtitleTr: "Tüm raporların konsolide özeti",
    subtitleDe: "Konsolidierte Zusammenfassung",
    badge: "TESLİM",
  },
  {
    key: "eingangsbuch",
    icon: <BookOpen size={16} />,
    color: "#06b6d4",
    titleTr: "Gelen Faturalar Defteri",
    titleDe: "Rechnungseingangsbuch",
    subtitleTr: "Gider faturalarının kronolojik listesi",
    subtitleDe: "Eingehende Rechnungen chronologisch",
    badge: "ZORUNLU",
  },
  {
    key: "ausgangsbuch",
    icon: <FileText size={16} />,
    color: "#10b981",
    titleTr: "Giden Faturalar Defteri",
    titleDe: "Rechnungsausgangsbuch",
    subtitleTr: "Kesilen faturaların ardışık listesi",
    subtitleDe: "Ausgehende Rechnungen sequenziell",
    badge: "ZORUNLU",
  },
  {
    key: "opos",
    icon: <Clock size={16} />,
    color: "#f59e0b",
    titleTr: "Açık Kalemler (OPOS)",
    titleDe: "Offene Posten Liste (OPOS)",
    subtitleTr: "Ödenmemiş fatura ve alacaklar",
    subtitleDe: "Offene Forderungen und Verbindlichkeiten",
    badge: "OPOS",
  },
  {
    key: "bwa",
    icon: <TrendingUp size={16} />,
    color: "#8b5cf6",
    titleTr: "Gecici İşletme Analizi (BWA)",
    titleDe: "Betriebswirtschaftliche Auswertung",
    subtitleTr: "Dönem gelir / gider özeti — SKR03/04",
    subtitleDe: "Ergebnis nach SKR03/04-Kontenrahmen",
    badge: "BWA",
  },
  {
    key: "fehlende",
    icon: <AlertTriangle size={16} />,
    color: "#f43f5e",
    titleTr: "Eksik Belgeler Raporu",
    titleDe: "Fehlende Belege",
    subtitleTr: "Hesap kodu atanmamış fatura kalemleri",
    subtitleDe: "Positionen ohne zugewiesenes Konto",
    badge: "DENETİM",
  },
  {
    key: "datev",
    icon: <Building2 size={16} />,
    color: "#a78bfa",
    titleTr: "Steuerberater Export Paketi",
    titleDe: "Steuerberater-Exportpaket",
    subtitleTr: "DATEV + PDF paket ön kontrolü",
    subtitleDe: "DATEV-CSV + Belege Vorabprüfung",
    badge: "DATEV",
  },
  {
    key: "banka",
    icon: <Building2 size={16} />,
    color: "#0ea5e9",
    titleTr: "Banka Hesap Hareketleri",
    titleDe: "Bankkontobewegungen",
    subtitleTr: "Aylık banka işlemleri ve eşleşme durumu",
    subtitleDe: "Monatliche Buchungen und Zuordnungsstatus",
    badge: "BANKA",
  },
];

// ─── Shared doc styles ───────────────────────────────────────────────────────
const DOC: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: "#0f172a",
  fontSize: "11px",
};

const TH: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  fontSize: "9px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#475569",
  background: "#f1f5f9",
  borderBottom: "1px solid #e2e8f0",
};

const TD: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: "11px",
};

const DocHeader: React.FC<{ title: string; subtitle: string; period: string; color: string }> =
  ({ title, subtitle, period, color }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      marginBottom: "16px", paddingBottom: "12px",
      borderBottom: "2px solid #1e293b",
    }}>
      <div>
        <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "4px" }}>
          fikoai.de Smart Accounting · {new Date().toLocaleDateString("de-DE")}
        </div>
        <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", letterSpacing: "0.02em" }}>
          {title}
        </div>
        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>{subtitle}</div>
      </div>
      <div style={{
        padding: "6px 14px", borderRadius: "8px", textAlign: "right",
        background: `${color}18`, border: `1px solid ${color}44`,
      }}>
        <div style={{ fontSize: "9px", color: "#64748b", marginBottom: "2px" }}>Dönem / Zeitraum</div>
        <div style={{ fontSize: "13px", fontWeight: 700, color }}>{period}</div>
      </div>
    </div>
  );

// ─── EINGANGSBUCH ────────────────────────────────────────────────────────────
const EingangsbuchDoc: React.FC<{
  invoices: Invoice[];
  items: InvoiceItem[];
  period: string;
  tr: (a: string, b: string) => string;
}> = ({ invoices: invoicesRaw, items, period, tr }) => {
  const invoices = useMemo(() => {
    const ts = (inv: any) => {
      const d = inv?.tarih || inv?.invoice_date || inv?.raw_ai_response?.fatura_bilgileri?.tarih || inv?.created_at;
      if (!d) return Number.POSITIVE_INFINITY;
      const t = new Date(d).getTime();
      return isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    return [...invoicesRaw].sort((a, b) => ts(a) - ts(b));
  }, [invoicesRaw]);
  const totalNet = invoices.reduce((s, i) => s + (i.ara_toplam || i.total_net || 0), 0);
  const totalVat = invoices.reduce((s, i) => s + (i.toplam_kdv || i.total_vat || 0), 0);
  const totalGross = invoices.reduce((s, i) => s + (i.genel_toplam || i.total_gross || 0), 0);

  return (
    <div style={DOC}>
      <DocHeader
        title={tr("Gelen Faturalar Defteri", "Rechnungseingangsbuch")}
        subtitle={tr("Gider faturalarının kronolojik listesi", "Chronologische Liste der Eingangsrechnungen")}
        period={period}
        color="#06b6d4"
      />

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
        <thead>
          <tr>
            <th style={TH}>{tr("Tarih", "Datum")}</th>
            <th style={TH}>{tr("Fatura No", "Belegnummer")}</th>
            <th style={TH}>{tr("Tedarikçi", "Lieferant")}</th>
            <th style={{ ...TH, textAlign: "right" }}>KDV %</th>
            <th style={{ ...TH, textAlign: "right" }}>{tr("Net", "Netto")}</th>
            <th style={{ ...TH, textAlign: "right" }}>KDV</th>
            <th style={{ ...TH, textAlign: "right" }}>{tr("Brüt", "Brutto")}</th>
            <th style={TH}>SKR03/04</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, idx) => {
            const invItems = items.filter(it => it.invoice_id === inv.id);
            const vatRate = invItems.length > 0
              ? (invItems[0].vat_rate ?? 19)
              : 19;
            const account = invItems.find(it => it.account_code)?.account_code ?? "—";
            return (
              <tr key={inv.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
                <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px" }}>{fmtDateShort(inv.tarih || inv.invoice_date)}</td>
                <td style={{ ...TD, fontWeight: 600 }}>{inv.fatura_no || inv.invoice_number || "—"}</td>
                <td style={TD}>{inv.satici_adi || inv.supplier_name || "—"}</td>
                <td style={{ ...TD, textAlign: "right" }}>{vatRate}%</td>
                <td style={{ ...TD, textAlign: "right", fontFamily: "monospace" }}>{fmt(inv.ara_toplam || inv.total_net || 0)}</td>
                <td style={{ ...TD, textAlign: "right", fontFamily: "monospace" }}>{fmt(inv.toplam_kdv || inv.total_vat || 0)}</td>
                <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmt(inv.genel_toplam || inv.total_gross || 0)}</td>
                <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px", color: "#475569" }}>{account}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: "#1e293b" }}>
            <td colSpan={4} style={{ ...TD, color: "#fff", fontWeight: 700 }}>{tr("TOPLAM", "GESAMT")} ({invoices.length} Pos.)</td>
            <td style={{ ...TD, textAlign: "right", color: "#7dd3fc", fontFamily: "monospace", fontWeight: 700 }}>{fmt(totalNet)}</td>
            <td style={{ ...TD, textAlign: "right", color: "#7dd3fc", fontFamily: "monospace", fontWeight: 700 }}>{fmt(totalVat)}</td>
            <td style={{ ...TD, textAlign: "right", color: "#fff", fontFamily: "monospace", fontWeight: 800 }}>{fmt(totalGross)}</td>
            <td style={TD} />
          </tr>
        </tfoot>
      </table>

      {invoices.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "12px" }}>
          {tr("Bu dönemde fatura bulunamadı.", "Keine Rechnungen im gewählten Zeitraum.")}
        </div>
      )}
    </div>
  );
};

// ─── AUSGANGSBUCH ────────────────────────────────────────────────────────────
interface CompanyInfoSnapshot {
  company_name?: string;
  steuernummer?: string;
  ust_id?: string;
  finanzamt?: string;
}

const AusgangsbuchDoc: React.FC<{
  bankIncomes: SavedTransaction[];
  invoiceItems: InvoiceItem[];
  period: string;
  companyInfo: CompanyInfoSnapshot | null;
  tr: (a: string, b: string) => string;
}> = ({ bankIncomes: rawBankIncomes, invoiceItems, period, companyInfo, tr }) => {
  const overrides = useKindOverrides();
  // Yalnızca eşleşen faturasında 8xxx (gelir) hesap kodu bulunan banka işlemlerini göster
  const has8xxx = (invoiceId: string | null | undefined) => {
    if (!invoiceId) return false;
    return invoiceItems.some(it =>
      it.invoice_id === invoiceId &&
      String(it.account_code || "").trim().startsWith("8")
    );
  };
  const bankIncomes = useMemo(
    () => rawBankIncomes.filter(tx => has8xxx(tx.matched_invoice_id)),
    [rawBankIncomes, invoiceItems]
  );
  // KPI ve toplam: yalnızca effective income olanlar (8xxx filtreli set üzerinden)
  const incomeOnly = useMemo(
    () => bankIncomes.filter(tx => getEffectiveKind(tx, overrides) === "income"),
    [bankIncomes, overrides]
  );
  const totalBankIncome = incomeOnly.reduce((s, tx) => s + (tx.amount || 0), 0);
  const matchedCount = incomeOnly.filter(tx => !!tx.matched_invoice_id).length;

  const hasSteuernummer = !!(companyInfo?.steuernummer?.trim());
  const hasUstId = !!(companyInfo?.ust_id?.trim());
  const taxOk = hasSteuernummer || hasUstId;

  return (
    <div style={DOC}>
      <DocHeader
        title={tr("Giden Faturalar Defteri", "Rechnungsausgangsbuch")}
        subtitle={tr("Banka dökümünden gelen gelir işlemleri (Gutschriften)", "Gutschriften aus Kontoauszügen — Zahlungseingänge")}
        period={period}
        color="#10b981"
      />

      {/* ── Şirket Vergi Kimlik Doğrulama ── */}
      <div style={{
        marginBottom: "14px", padding: "10px 14px", borderRadius: "8px",
        background: taxOk ? "#f0fdf4" : "#fff7ed",
        border: `1px solid ${taxOk ? "#bbf7d0" : "#fde68a"}`,
        display: "flex", alignItems: "flex-start", gap: "12px",
      }}>
        <div style={{
          width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: taxOk ? "#dcfce7" : "#fef3c7",
          fontSize: "12px", fontWeight: 800,
          color: taxOk ? "#16a34a" : "#d97706",
        }}>
          {taxOk ? "✓" : "!"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: taxOk ? "#15803d" : "#92400e", marginBottom: "6px" }}>
            {tr("RAPORLAYAN FİRMA — VERGİ KİMLİK DOĞRULAMASI", "AUSSTELLENDES UNTERNEHMEN — STEUERIDENTIFIKATION")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            {[
              { label: tr("Firma Adı", "Firmenname"), val: companyInfo?.company_name, required: false },
              { label: "Steuernummer", val: companyInfo?.steuernummer, required: true },
              { label: "USt-IdNr", val: companyInfo?.ust_id, required: false },
              { label: "Finanzamt", val: companyInfo?.finanzamt, required: false },
            ].map(field => {
              const missing = field.required && !field.val?.trim();
              return (
                <div key={field.label} style={{
                  padding: "6px 8px", borderRadius: "6px",
                  background: missing ? "#fff1f2" : "#fff",
                  border: `1px solid ${missing ? "#fecdd3" : "#e2e8f0"}`,
                }}>
                  <div style={{ fontSize: "8px", color: missing ? "#be123c" : "#64748b", fontWeight: 700, marginBottom: "2px" }}>
                    {field.label}{field.required && " *"}
                  </div>
                  <div style={{ fontSize: "10px", fontWeight: 600, color: missing ? "#dc2626" : "#0f172a", fontFamily: "monospace" }}>
                    {field.val?.trim() || (missing ? tr("⚠ EKSİK", "⚠ FEHLT") : "—")}
                  </div>
                </div>
              );
            })}
          </div>
          {!taxOk && (
            <div style={{ marginTop: "6px", fontSize: "9px", color: "#d97706", fontWeight: 600 }}>
              {tr(
                "⚠ Steuernummer eksik — Ayarlar > Şirket Bilgileri bölümünden ekleyiniz.",
                "⚠ Steuernummer fehlt — Bitte unter Einstellungen > Firmendaten ergänzen.",
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Kutuları ── */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
        <div style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <div style={{ fontSize: "9px", color: "#1d4ed8", fontWeight: 700, marginBottom: "2px" }}>{tr("İşlem Sayısı", "Anzahl Buchungen")}</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#1e40af" }}>{bankIncomes.length}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <div style={{ fontSize: "9px", color: "#1d4ed8", fontWeight: 700, marginBottom: "2px" }}>{tr("Toplam Gelir", "Summe Gutschriften")}</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#1e40af", fontFamily: "monospace" }}>{fmt(totalBankIncome)}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <div style={{ fontSize: "9px", color: "#15803d", fontWeight: 700, marginBottom: "2px" }}>{tr("Eşleşen", "Zugeordnet")}</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#166534" }}>{matchedCount} / {bankIncomes.length}</div>
        </div>
      </div>

      {/* ── Gelir İşlemleri Tablosu ── */}
      {bankIncomes.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "40px 20px",
          background: "#f8fafc", borderRadius: "8px",
          border: "1px dashed #cbd5e1",
        }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>🏦</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
            {tr("Bu dönemde banka gelir işlemi bulunamadı.", "Keine Gutschriften im gewählten Zeitraum.")}
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
            {tr(
              "Banka Dökümü bölümünden ekstre yükleyerek gelir işlemlerini buraya aktarabilirsiniz.",
              "Laden Sie im Bereich Kontoauszug einen Kontoauszug hoch, um Zahlungseingänge hier anzuzeigen.",
            )}
          </div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>#</th>
              <th style={TH}>{tr("Tarih", "Datum")}</th>
              <th style={TH}>{tr("Karşı Taraf (Auftraggeber)", "Auftraggeber")}</th>
              <th style={TH}>{tr("Açıklama / Referans", "Verwendungszweck")}</th>
              <th style={TH}>{tr("Eşleşme", "Zuordnung")}</th>
              <th style={TH}>{tr("Tip", "Typ")}</th>
              <th style={{ ...TH, textAlign: "right" }}>{tr("Tutar (€)", "Betrag (€)")}</th>
            </tr>
          </thead>
          <tbody>
            {bankIncomes.map((tx, idx) => (
              <tr key={tx.id} style={{ background: idx % 2 === 0 ? "#f0f9ff" : "#fff" }}>
                <td style={{ ...TD, color: "#94a3b8", fontSize: "10px", fontFamily: "monospace" }}>{idx + 1}</td>
                <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px", whiteSpace: "nowrap" }}>
                  {fmtDateShort(tx.transaction_date)}
                </td>
                <td style={{ ...TD, fontWeight: 600, color: "#1e40af" }}>
                  {tx.counterpart || "—"}
                </td>
                <td style={{ ...TD, fontSize: "9px", color: "#475569" }}>
                  <div style={{ maxWidth: "210px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.description || "—"}
                  </div>
                  {tx.reference && (
                    <div style={{ fontSize: "8px", color: "#94a3b8", fontFamily: "monospace", marginTop: "1px" }}>
                      {tx.reference}
                    </div>
                  )}
                </td>
                <td style={{ ...TD, fontSize: "9px" }}>
                  {tx.matched_invoice_id ? (
                    <span style={{
                      padding: "2px 6px", borderRadius: "4px",
                      background: "#dcfce7", color: "#15803d",
                      fontSize: "8px", fontWeight: 700, border: "1px solid #bbf7d0",
                    }}>
                      ✓ {tr("Eşleşti", "Zugeordnet")}
                    </span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: "9px" }}>—</span>
                  )}
                </td>
                <td
                  style={{ ...TD, fontSize: "9px", cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); cycleKind(tx.id, getEffectiveKind(tx, overrides)); }}
                >
                  {(() => {
                    const k = getEffectiveKind(tx, overrides);
                    const cfg: Record<TxKind, { label: [string, string]; bg: string; color: string; border: string }> = {
                      income:  { label: ["Gelir", "Einnahme"],  bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
                      refund:  { label: ["İade",  "Erstattung"], bg: "#fef3c7", color: "#b45309", border: "#fde68a" },
                      expense: { label: ["Gider", "Ausgabe"],   bg: "#fee2e2", color: "#b91c1c", border: "#fecaca" },
                    };
                    const c = cfg[k];
                    return (
                      <span
                        title={tr("Tıklayarak Gelir → İade → Gider arasında değiştir", "Klicken zum Wechseln Einnahme → Erstattung → Ausgabe")}
                        style={{
                          display: "inline-block",
                          padding: "3px 9px", borderRadius: "5px",
                          background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                          fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px",
                          userSelect: "none",
                        }}
                      >
                        {tr(c.label[0], c.label[1])}
                      </span>
                    );
                  })()}
                </td>
                <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: getEffectiveKind(tx, overrides) === "income" ? "#15803d" : "#94a3b8" }}>
                  {fmt(tx.amount || 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#1e40af" }}>
              <td colSpan={6} style={{ ...TD, color: "#fff", fontWeight: 700 }}>
                {tr("TOPLAM GELİR", "SUMME GUTSCHRIFTEN")}
              </td>
              <td style={{ ...TD, textAlign: "right", color: "#93c5fd", fontFamily: "monospace", fontWeight: 800 }}>
                {fmt(totalBankIncome)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
};

// ─── OPOS ────────────────────────────────────────────────────────────────────
const OposDoc: React.FC<{
  invoices: Invoice[];
  period: string;
  tr: (a: string, b: string) => string;
}> = ({ invoices, period, tr }) => {
  const today = new Date();
  const getDate = (inv: Invoice) => inv.tarih || inv.invoice_date;
  const getGross = (inv: Invoice) => inv.genel_toplam || inv.total_gross || 0;
  const getName = (inv: Invoice) => inv.satici_adi || inv.supplier_name || inv.raw_ai_response?.header?.supplier_name || "—";
  const getNo = (inv: Invoice) => inv.fatura_no || inv.invoice_number || "—";

  const overdue = invoices.filter(inv => {
    const d = getDate(inv);
    if (!d) return false;
    const due = new Date(d);
    due.setDate(due.getDate() + 30);
    return due < today;
  });
  const pending = invoices.filter(inv => {
    const d = getDate(inv);
    if (!d) return false;
    const due = new Date(d);
    due.setDate(due.getDate() + 30);
    return due >= today;
  });

  const totalOverdue = overdue.reduce((s, i) => s + getGross(i), 0);
  const totalPending = pending.reduce((s, i) => s + getGross(i), 0);

  const daysPastDue = (inv: Invoice) => {
    const d = getDate(inv);
    if (!d) return 0;
    const due = new Date(d);
    due.setDate(due.getDate() + 30);
    return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div style={DOC}>
      <DocHeader
        title={tr("Açık Kalemler Listesi", "Offene Posten Liste (OPOS)")}
        subtitle={tr("Ödenmemiş fatura ve alacaklar (30 gün vade)", "Offene Forderungen und Verbindlichkeiten (30 Tage Ziel)")}
        period={period}
        color="#f59e0b"
      />

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <div style={{ flex: 1, padding: "12px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca" }}>
          <div style={{ fontSize: "9px", color: "#b91c1c", fontWeight: 700 }}>{tr("VADESİ GEÇMİŞ", "ÜBERFÄLLIG")}</div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#991b1b", fontFamily: "monospace" }}>{fmt(totalOverdue)}</div>
          <div style={{ fontSize: "9px", color: "#b91c1c" }}>{overdue.length} {tr("fatura", "Rechnungen")}</div>
        </div>
        <div style={{ flex: 1, padding: "12px", borderRadius: "8px", background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ fontSize: "9px", color: "#92400e", fontWeight: 700 }}>{tr("BEKLEMEDE", "AUSSTEHEND")}</div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#78350f", fontFamily: "monospace" }}>{fmt(totalPending)}</div>
          <div style={{ fontSize: "9px", color: "#92400e" }}>{pending.length} {tr("fatura", "Rechnungen")}</div>
        </div>
        <div style={{ flex: 1, padding: "12px", borderRadius: "8px", background: "#fafafa", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "9px", color: "#6b7280", fontWeight: 700 }}>{tr("TOPLAM AÇIK", "GESAMT OFFEN")}</div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#111827", fontFamily: "monospace" }}>{fmt(totalOverdue + totalPending)}</div>
          <div style={{ fontSize: "9px", color: "#6b7280" }}>{invoices.length} {tr("fatura", "Rechnungen")}</div>
        </div>
      </div>

      {overdue.length > 0 && (
        <>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", paddingBottom: "4px", borderBottom: "1px solid #fecaca" }}>
            {tr("VADESİ GEÇMİŞ FATURALAR", "ÜBERFÄLLIGE RECHNUNGEN")}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
            <thead>
              <tr>
                <th style={TH}>{tr("Tarih", "Datum")}</th>
                <th style={TH}>{tr("Fatura No", "Rech.-Nr.")}</th>
                <th style={TH}>{tr("Tedarikçi", "Lieferant")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{tr("Brüt", "Brutto")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{tr("Gecikme (gün)", "Tage überfällig")}</th>
              </tr>
            </thead>
            <tbody>
              {overdue.sort((a, b) => daysPastDue(b) - daysPastDue(a)).map((inv, idx) => (
                <tr key={inv.id} style={{ background: idx % 2 === 0 ? "#fff5f5" : "#fef2f2" }}>
                  <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px" }}>{fmtDateShort(getDate(inv))}</td>
                  <td style={{ ...TD, fontWeight: 600 }}>{getNo(inv)}</td>
                  <td style={TD}>{getName(inv)}</td>
                  <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", color: "#dc2626", fontWeight: 600 }}>{fmt(getGross(inv))}</td>
                  <td style={{ ...TD, textAlign: "right", color: "#dc2626", fontWeight: 700 }}>
                    +{daysPastDue(inv)} {tr("gün", "Tage")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {pending.length > 0 && (
        <>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", paddingBottom: "4px", borderBottom: "1px solid #fde68a" }}>
            {tr("VADESİ YAKLAŞAN FATURALAR", "BALD FÄLLIGE RECHNUNGEN")}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>{tr("Tarih", "Datum")}</th>
                <th style={TH}>{tr("Fatura No", "Rech.-Nr.")}</th>
                <th style={TH}>{tr("Tedarikçi", "Lieferant")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{tr("Brüt", "Brutto")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{tr("Vade Tarihi", "Fälligkeitsdatum")}</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((inv, idx) => {
                const due = new Date(getDate(inv)!);
                due.setDate(due.getDate() + 30);
                return (
                  <tr key={inv.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fffbeb" }}>
                    <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px" }}>{fmtDateShort(getDate(inv))}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{getNo(inv)}</td>
                    <td style={TD}>{getName(inv)}</td>
                    <td style={{ ...TD, textAlign: "right", fontFamily: "monospace" }}>{fmt(getGross(inv))}</td>
                    <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", color: "#d97706" }}>
                      {due.toLocaleDateString("de-DE")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

// ─── BWA ─────────────────────────────────────────────────────────────────────
const BwaDoc: React.FC<{
  invoices: Invoice[];
  items: InvoiceItem[];
  period: string;
  tr: (a: string, b: string) => string;
}> = ({ invoices, items, period, tr }) => {
  const totalNet = invoices.reduce((s, i) => s + (i.ara_toplam || i.total_net || 0), 0);
  const totalVat = invoices.reduce((s, i) => s + (i.toplam_kdv || i.total_vat || 0), 0);
  const totalGross = invoices.reduce((s, i) => s + (i.genel_toplam || i.total_gross || 0), 0);

  // Group by account code ranges (SKR03)
  const groups: { label: string; labelDe: string; range: [number, number]; color: string }[] = [
    { label: "Personel Giderleri", labelDe: "Personalkosten", range: [4100, 4199], color: "#8b5cf6" },
    { label: "Kira & Kira Benzeri", labelDe: "Miete & Nebenkosten", range: [4200, 4299], color: "#06b6d4" },
    { label: "Sigorta Giderleri", labelDe: "Versicherungen", range: [4300, 4399], color: "#10b981" },
    { label: "Araç Giderleri (KFZ)", labelDe: "Fahrzeugkosten (KFZ)", range: [4400, 4499], color: "#f59e0b" },
    { label: "Reklam & Tanıtım", labelDe: "Werbung & Repräsentation", range: [4500, 4599], color: "#f43f5e" },
    { label: "Seyahat Giderleri", labelDe: "Reisekosten", range: [4600, 4699], color: "#ec4899" },
    { label: "Büro & Ofis Giderleri", labelDe: "Büro- & Verwaltungskosten", range: [4700, 4899], color: "#64748b" },
    { label: "Finans & Diğer", labelDe: "Finanz- & sonstige Kosten", range: [4900, 4999], color: "#94a3b8" },
  ];

  const groupData = groups.map(g => {
    const groupItems = items.filter(it => {
      const inv = invoices.find(i => i.id === it.invoice_id);
      if (!inv) return false;
      const code = parseInt(it.account_code || "0");
      return (
        (code >= g.range[0] && code <= g.range[1]) ||
        (code >= g.range[0] + 1000 && code <= g.range[1] + 1000) // SKR04
      );
    });
    const net = groupItems.reduce((s, it) => s + (it.net_amount || 0), 0);
    return { ...g, net, count: groupItems.length };
  });

  const uncategorized = totalNet - groupData.reduce((s, g) => s + g.net, 0);
  const maxNet = Math.max(...groupData.map(g => g.net), 0.01);

  return (
    <div style={DOC}>
      <DocHeader
        title={tr("Geçici İşletme Analizi", "Betriebswirtschaftliche Auswertung (BWA)")}
        subtitle={tr("SKR03/04 konumlarına göre gider dağılımı", "Kostenverteilung nach SKR03/04-Kontenrahmen")}
        period={period}
        color="#8b5cf6"
      />

      {/* Summary KPIs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
        {[
          { label: tr("Toplam Gider (Net)", "Gesamtaufwand (Netto)"), val: fmt(totalNet), color: "#8b5cf6" },
          { label: tr("KDV / Vorsteuer", "Umsatzsteuer"), val: fmt(totalVat), color: "#06b6d4" },
          { label: tr("Brüt Toplam", "Brutto gesamt"), val: fmt(totalGross), color: "#10b981" },
          { label: tr("Fatura Sayısı", "Anzahl Rechnungen"), val: String(invoices.length), color: "#f59e0b" },
        ].map(kpi => (
          <div key={kpi.label} style={{
            flex: 1, padding: "10px 12px", borderRadius: "8px",
            background: `${kpi.color}10`, border: `1px solid ${kpi.color}33`,
          }}>
            <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, marginBottom: "3px" }}>{kpi.label}</div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: kpi.color, fontFamily: "monospace" }}>{kpi.val}</div>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      <div style={{ marginBottom: "8px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", paddingBottom: "6px", borderBottom: "1px solid #e2e8f0" }}>
        {tr("KATEGORİ BAZLI GİDER DAĞILIMI", "KOSTENVERTEILUNG NACH KATEGORIEN")}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
        <thead>
          <tr>
            <th style={TH}>{tr("Kategori", "Kategorie")}</th>
            <th style={TH}>{tr("SKR03/04 Kont.", "SKR03/04-Konto")}</th>
            <th style={{ ...TH, textAlign: "right" }}>{tr("Kalem", "Pos.")}</th>
            <th style={{ ...TH, textAlign: "right" }}>{tr("Net Tutar", "Nettobetrag")}</th>
            <th style={{ ...TH, textAlign: "right" }}>%</th>
            <th style={{ ...TH, width: "120px" }}>{tr("Dağılım", "Verteilung")}</th>
          </tr>
        </thead>
        <tbody>
          {groupData.map((g, idx) => (
            <tr key={g.label} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={{ ...TD, fontWeight: 600, color: g.color }}>{tr(g.label, g.labelDe)}</td>
              <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px", color: "#64748b" }}>
                {g.range[0]}–{g.range[1]}
              </td>
              <td style={{ ...TD, textAlign: "right" }}>{g.count}</td>
              <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmt(g.net)}</td>
              <td style={{ ...TD, textAlign: "right", color: "#64748b" }}>
                {totalNet > 0 ? ((g.net / totalNet) * 100).toFixed(1) : "0.0"}%
              </td>
              <td style={{ ...TD, paddingRight: "10px" }}>
                <div style={{ height: "8px", borderRadius: "4px", background: "#f1f5f9", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "4px",
                    width: `${maxNet > 0 ? (g.net / maxNet) * 100 : 0}%`,
                    background: g.color,
                    transition: "width 0.3s",
                  }} />
                </div>
              </td>
            </tr>
          ))}
          {uncategorized > 0.01 && (
            <tr style={{ background: "#f8fafc" }}>
              <td style={{ ...TD, color: "#94a3b8" }}>{tr("Sınıflandırılmamış", "Nicht kategorisiert")}</td>
              <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px", color: "#94a3b8" }}>—</td>
              <td style={{ ...TD, textAlign: "right" }}>—</td>
              <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", color: "#94a3b8" }}>{fmt(uncategorized)}</td>
              <td style={{ ...TD, textAlign: "right", color: "#94a3b8" }}>
                {totalNet > 0 ? ((uncategorized / totalNet) * 100).toFixed(1) : "0.0"}%
              </td>
              <td style={TD} />
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ background: "#1e293b" }}>
            <td colSpan={3} style={{ ...TD, color: "#fff", fontWeight: 700 }}>{tr("TOPLAM NET GİDER", "GESAMTAUFWAND NETTO")}</td>
            <td style={{ ...TD, textAlign: "right", color: "#c4b5fd", fontFamily: "monospace", fontWeight: 800 }}>{fmt(totalNet)}</td>
            <td style={{ ...TD, textAlign: "right", color: "#c4b5fd" }}>100%</td>
            <td style={TD} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── FEHLENDE BELEGE ─────────────────────────────────────────────────────────
const FehlendeDoc: React.FC<{
  invoices: Invoice[];
  items: InvoiceItem[];
  period: string;
  tr: (a: string, b: string) => string;
}> = ({ invoices, items, period, tr }) => {
  const missing = items.filter(it => !it.account_code || it.account_code.trim() === "");
  const missingInvoices = invoices.filter(inv =>
    !items.some(it => it.invoice_id === inv.id && it.account_code)
  );
  const total = missing.reduce((s, it) => s + (it.gross_amount || 0), 0);

  return (
    <div style={DOC}>
      <DocHeader
        title={tr("Eksik Belgeler Raporu", "Fehlende Belege / Kontierungsfehler")}
        subtitle={tr("Hesap kodu atanmamış fatura kalemleri — Steuerberater kontrolü gerekir", "Positionen ohne Kontierung — Steuerberater-Prüfung erforderlich")}
        period={period}
        color="#f43f5e"
      />

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <div style={{ flex: 1, padding: "12px", borderRadius: "8px", background: "#fff1f2", border: "1px solid #fecdd3" }}>
          <div style={{ fontSize: "9px", color: "#be123c", fontWeight: 700 }}>{tr("EKSİK HESAP KODU", "FEHLENDE KONTONUMMER")}</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#9f1239" }}>{missing.length}</div>
          <div style={{ fontSize: "9px", color: "#be123c" }}>{tr("kalem", "Positionen")}</div>
        </div>
        <div style={{ flex: 1, padding: "12px", borderRadius: "8px", background: "#fff1f2", border: "1px solid #fecdd3" }}>
          <div style={{ fontSize: "9px", color: "#be123c", fontWeight: 700 }}>{tr("ETKİLENEN FATURA", "BETROFFENE RECHNUNGEN")}</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#9f1239" }}>{missingInvoices.length}</div>
          <div style={{ fontSize: "9px", color: "#be123c" }}>{tr("fatura", "Rechnungen")}</div>
        </div>
        <div style={{ flex: 1, padding: "12px", borderRadius: "8px", background: "#fff1f2", border: "1px solid #fecdd3" }}>
          <div style={{ fontSize: "9px", color: "#be123c", fontWeight: 700 }}>{tr("ETKİLENEN TUTAR", "BETROFFENER BETRAG")}</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#9f1239", fontFamily: "monospace" }}>{fmt(total)}</div>
          <div style={{ fontSize: "9px", color: "#be123c" }}>{tr("brüt", "Brutto")}</div>
        </div>
      </div>

      {missing.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "32px", borderRadius: "12px",
          background: "#f0fdf4", border: "1px solid #bbf7d0",
        }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>✓</div>
          <div style={{ fontWeight: 700, color: "#15803d", fontSize: "13px" }}>
            {tr("Tüm fatura kalemleri hesap kodu içeriyor!", "Alle Positionen haben eine Kontierung!")}
          </div>
          <div style={{ fontSize: "10px", color: "#16a34a", marginTop: "4px" }}>
            {tr("Bu dönemde eksik hesap kodu bulunmamaktadır.", "Keine fehlenden Kontonummern in diesem Zeitraum.")}
          </div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>{tr("Fatura No", "Rech.-Nr.")}</th>
              <th style={TH}>{tr("Tarih", "Datum")}</th>
              <th style={TH}>{tr("Tedarikçi", "Lieferant")}</th>
              <th style={TH}>{tr("Açıklama", "Beschreibung")}</th>
              <th style={{ ...TH, textAlign: "right" }}>{tr("Brüt", "Brutto")}</th>
              <th style={TH}>{tr("Durum", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {missing.map((it, idx) => {
              const inv = invoices.find(i => i.id === it.invoice_id);
              return (
                <tr key={it.id} style={{ background: idx % 2 === 0 ? "#fff5f5" : "#fff1f2" }}>
                  <td style={{ ...TD, fontWeight: 600 }}>{inv?.fatura_no || inv?.invoice_number || "—"}</td>
                  <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px" }}>{fmtDateShort(inv?.tarih || inv?.invoice_date)}</td>
                  <td style={TD}>{inv?.satici_adi || inv?.supplier_name || inv?.raw_ai_response?.header?.supplier_name || "—"}</td>
                  <td style={{ ...TD, color: "#64748b" }}>{it.description || "—"}</td>
                  <td style={{ ...TD, textAlign: "right", fontFamily: "monospace" }}>{fmt(it.gross_amount || 0)}</td>
                  <td style={TD}>
                    <span style={{
                      fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px",
                      background: "#fecdd3", color: "#be123c",
                    }}>
                      {tr("EKSİK HESAP", "KEIN KONTO")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ─── DATEV EXPORT CONTROL ─────────────────────────────────────────────────────
const DatevExportDoc: React.FC<{
  invoices: Invoice[];
  items: InvoiceItem[];
  period: string;
  tr: (a: string, b: string) => string;
}> = ({ invoices, items, period, tr }) => {
  const withCode = items.filter(it => it.account_code && it.account_code.trim() !== "");
  const withoutCode = items.filter(it => !it.account_code || it.account_code.trim() === "");
  const readyInvoices = invoices.filter(inv =>
    items.some(it => it.invoice_id === inv.id && it.account_code)
  );
  const totalGross = invoices.reduce((s, i) => s + (i.genel_toplam || i.total_gross || 0), 0);
  const completeness = items.length > 0 ? Math.round((withCode.length / items.length) * 100) : 0;

  const checks: { label: string; labelDe: string; ok: boolean; detail?: string }[] = [
    {
      label: "Fatura tarihleri mevcut",
      labelDe: "Rechnungsdaten vorhanden",
      ok: invoices.every(i => !!(i.tarih || i.invoice_date)),
      detail: `${invoices.filter(i => !(i.tarih || i.invoice_date)).length} eksik tarih`,
    },
    {
      label: "Fatura numaraları mevcut",
      labelDe: "Rechnungsnummern vorhanden",
      ok: invoices.every(i => !!(i.fatura_no || i.invoice_number)),
      detail: `${invoices.filter(i => !(i.fatura_no || i.invoice_number)).length} eksik numara`,
    },
    {
      label: "Tedarikçi adları mevcut",
      labelDe: "Lieferantennamen vorhanden",
      ok: invoices.every(i => !!(i.satici_adi || i.supplier_name || i.raw_ai_response?.header?.supplier_name)),
      detail: `${invoices.filter(i => !(i.satici_adi || i.supplier_name || i.raw_ai_response?.header?.supplier_name)).length} eksik ad`,
    },
    {
      label: `Hesap kodu ataması (${completeness}%)`,
      labelDe: `Kontierungsquote (${completeness}%)`,
      ok: completeness >= 80,
      detail: `${withoutCode.length} kalem eksik`,
    },
    {
      label: "Brüt tutarlar mevcut",
      labelDe: "Bruttobeträge vorhanden",
      ok: invoices.every(i => (i.genel_toplam || i.total_gross || 0) > 0),
      detail: `${invoices.filter(i => !(i.genel_toplam || i.total_gross || 0)).length} eksik tutar`,
    },
  ];

  const allOk = checks.every(c => c.ok);

  return (
    <div style={DOC}>
      <DocHeader
        title={tr("Steuerberater Export Ön Kontrolü", "Steuerberater-Exportpaket Vorabprüfung")}
        subtitle={tr("DATEV CSV + Belege aktarım öncesi denetim listesi", "Vorprüfung vor DATEV-Import und Belegübertragung")}
        period={period}
        color="#a78bfa"
      />

      {/* Overall status */}
      <div style={{
        padding: "14px 18px", borderRadius: "10px", marginBottom: "18px",
        background: allOk ? "#f0fdf4" : "#fff7ed",
        border: `1px solid ${allOk ? "#bbf7d0" : "#fed7aa"}`,
        display: "flex", alignItems: "center", gap: "12px",
      }}>
        {allOk
          ? <CheckCircle2 size={22} style={{ color: "#16a34a", flexShrink: 0 }} />
          : <AlertTriangle size={22} style={{ color: "#d97706", flexShrink: 0 }} />
        }
        <div>
          <div style={{ fontWeight: 700, color: allOk ? "#166534" : "#92400e", fontSize: "12px" }}>
            {allOk
              ? tr("✓ Export'a Hazır — DATEV'e aktarım yapılabilir", "✓ Exportbereit — DATEV-Import kann durchgeführt werden")
              : tr("⚠ Eksikler mevcut — Steuerberater kontrolü gerekiyor", "⚠ Mängel vorhanden — Steuerberater-Prüfung erforderlich")
            }
          </div>
          <div style={{ fontSize: "10px", color: allOk ? "#15803d" : "#d97706", marginTop: "2px" }}>
            {tr(`${readyInvoices.length} / ${invoices.length} fatura aktarıma hazır · ${fmt(totalGross)} toplam`,
              `${readyInvoices.length} / ${invoices.length} Rechnungen exportbereit · ${fmt(totalGross)} gesamt`)}
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div style={{ marginBottom: "8px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569" }}>
        {tr("KONTROL LİSTESİ", "CHECKLISTE")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "18px" }}>
        {checks.map(c => (
          <div key={c.label} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "8px 12px", borderRadius: "8px",
            background: c.ok ? "#f0fdf4" : "#fff7ed",
            border: `1px solid ${c.ok ? "#bbf7d0" : "#fed7aa"}`,
          }}>
            {c.ok
              ? <CheckCircle2 size={14} style={{ color: "#16a34a", flexShrink: 0 }} />
              : <XCircle size={14} style={{ color: "#dc2626", flexShrink: 0 }} />
            }
            <span style={{ flex: 1, fontWeight: 500, color: c.ok ? "#166534" : "#92400e" }}>
              {tr(c.label, c.labelDe)}
            </span>
            {!c.ok && c.detail && (
              <span style={{ fontSize: "9px", color: "#dc2626", fontWeight: 600 }}>
                {c.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ marginBottom: "8px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569" }}>
        {tr("EXPORT İSTATİSTİKLERİ", "EXPORTSTATISTIKEN")}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TH}>{tr("Parametre", "Parameter")}</th>
            <th style={{ ...TH, textAlign: "right" }}>{tr("Değer", "Wert")}</th>
          </tr>
        </thead>
        <tbody>
          {[
            [tr("Toplam fatura sayısı", "Gesamtanzahl Rechnungen"), invoices.length],
            [tr("Aktarıma hazır faturalar", "Exportbereite Rechnungen"), readyInvoices.length],
            [tr("Toplam kalem sayısı", "Gesamtanzahl Positionen"), items.length],
            [tr("Hesap kodu olan kalemler", "Positionen mit Kontonummer"), withCode.length],
            [tr("Hesap kodu eksik kalemler", "Positionen ohne Kontonummer"), withoutCode.length],
            [tr("Hesap kodu tamamlanma %", "Kontierungsquote"), `${completeness}%`],
            [tr("Toplam brüt tutar", "Gesamtbetrag Brutto"), fmt(totalGross)],
            ["Format", "DATEV EXTF v700 / Kategorie 21"],
            [tr("Gegenkonto", "Gegenkonto"), "1600 (Verbindlichkeiten L+L / SKR03)"],
          ].map(([label, val], idx) => (
            <tr key={String(label)} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={TD}>{label}</td>
              <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── BANKA HESAP HAREKETLERİ ────────────────────────────────────────────────
const BankaDoc: React.FC<{
  transactions: SavedTransaction[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  companyInfo: CompanyInfoSnapshot | null;
  period: string;
  tr: (a: string, b: string) => string;
}> = ({ transactions, invoices, invoiceItems, companyInfo, period, tr }) => {
  const overrides = useKindOverrides();

  const invMap = useMemo(() => {
    const m = new Map<string, Invoice>();
    invoices.forEach(i => m.set(i.id, i));
    return m;
  }, [invoices]);

  const itemsByInv = useMemo(() => {
    const m = new Map<string, InvoiceItem[]>();
    invoiceItems.forEach(it => {
      const arr = m.get(it.invoice_id) || [];
      arr.push(it);
      m.set(it.invoice_id, arr);
    });
    return m;
  }, [invoiceItems]);

  const accountForTx = (tx: SavedTransaction): { code: string; name: string } => {
    const invId = tx.matched_invoice_id;
    if (invId) {
      const its = itemsByInv.get(invId) || [];
      const withCode = its.find(it => it.account_code);
      if (withCode) {
        return {
          code: String(withCode.account_code || "—"),
          name: withCode.account_name || withCode.account_name_tr || "—",
        };
      }
    }
    const k = getEffectiveKind(tx, overrides);
    if (k === "income") return { code: "8400", name: tr("Gelir (otomatik)", "Erlöse 19% USt") };
    if (k === "refund") return { code: "1576", name: tr("İade / Vorsteuer", "Erstattung / Vorsteuer") };
    return { code: "—", name: tr("Atanmamış", "Nicht zugeordnet") };
  };

  const totalAmount = transactions.reduce((s, tx) => s + (tx.amount || 0), 0);
  const matchedCount = transactions.filter(tx => !!tx.matched_invoice_id).length;

  return (
    <div style={{ ...DOC, padding: "32px 36px" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: "16px", paddingBottom: "12px",
        borderBottom: "2px solid #0ea5e9",
      }}>
        <div>
          <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "4px" }}>
            fikoai.de Smart Accounting · {new Date().toLocaleDateString("de-DE")}
          </div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", letterSpacing: "0.02em" }}>
            {tr("Banka Hesap Hareketleri", "Bankkontobewegungen")}
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a", marginTop: "6px" }}>
            {companyInfo?.company_name || "—"}
          </div>
          <div style={{ fontSize: "9px", color: "#64748b", marginTop: "2px" }}>
            {companyInfo?.steuernummer && <>Steuernummer: <b>{companyInfo.steuernummer}</b> · </>}
            {companyInfo?.ust_id && <>USt-IdNr: <b>{companyInfo.ust_id}</b> · </>}
            {companyInfo?.finanzamt && <>Finanzamt: <b>{companyInfo.finanzamt}</b></>}
          </div>
        </div>
        <div style={{
          padding: "6px 14px", borderRadius: "8px", textAlign: "right",
          background: "#0ea5e918", border: "1px solid #0ea5e944",
        }}>
          <div style={{ fontSize: "9px", color: "#64748b", marginBottom: "2px" }}>{tr("Dönem", "Zeitraum")}</div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0ea5e9" }}>{period}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
        <div style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", background: "#f0f9ff", border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: "9px", color: "#0369a1", fontWeight: 700, marginBottom: "2px" }}>{tr("İşlem Sayısı", "Anzahl Buchungen")}</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#075985" }}>{transactions.length}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", background: "#f0f9ff", border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: "9px", color: "#0369a1", fontWeight: 700, marginBottom: "2px" }}>{tr("Toplam Tutar", "Gesamtbetrag")}</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#075985", fontFamily: "monospace" }}>{fmt(totalAmount)}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <div style={{ fontSize: "9px", color: "#15803d", fontWeight: 700, marginBottom: "2px" }}>{tr("Eşleşen", "Zugeordnet")}</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#166534" }}>{matchedCount} / {transactions.length}</div>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "40px 20px",
          background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1",
        }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
            {tr("Bu dönemde banka işlemi bulunamadı.", "Keine Bankbuchungen im Zeitraum.")}
          </div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>#</th>
              <th style={TH}>{tr("Tarih", "Datum")}</th>
              <th style={TH}>{tr("Hesap Kodu", "Konto")}</th>
              <th style={TH}>{tr("Hesap Açıklaması", "Kontobezeichnung")}</th>
              <th style={{ ...TH, textAlign: "right" }}>{tr("Tutar (€)", "Betrag (€)")}</th>
              <th style={TH}>{tr("Durum", "Typ")}</th>
              <th style={TH}>{tr("Eşleşme", "Zuordnung")}</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, idx) => {
              const acc = accountForTx(tx);
              const k = getEffectiveKind(tx, overrides);
              const matchedInv = tx.matched_invoice_id ? invMap.get(tx.matched_invoice_id) : null;
              const matchedLabel = matchedInv
                ? `${matchedInv.fatura_no || matchedInv.invoice_number || matchedInv.id.slice(0, 6)}`
                : tr("Eşleşmedi", "Offen");
              const kindCfg: Record<string, { label: [string, string]; bg: string; color: string; border: string }> = {
                income:  { label: ["Gelir", "Einnahme"],  bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
                refund:  { label: ["İade",  "Erstattung"], bg: "#fef3c7", color: "#b45309", border: "#fde68a" },
                expense: { label: ["Gider", "Ausgabe"],   bg: "#fee2e2", color: "#b91c1c", border: "#fecaca" },
              };
              const c = kindCfg[k] || kindCfg.expense;
              return (
                <tr key={tx.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
                  <td style={{ ...TD, color: "#94a3b8", fontFamily: "monospace" }}>{idx + 1}</td>
                  <td style={{ ...TD, fontFamily: "monospace", fontSize: "10px", whiteSpace: "nowrap" }}>
                    {fmtDateShort(tx.transaction_date)}
                  </td>
                  <td style={{ ...TD, fontFamily: "monospace", fontWeight: 700 }}>{acc.code}</td>
                  <td style={{ ...TD, fontSize: "10px", color: "#334155" }}>
                    <div style={{ fontWeight: 600 }}>{acc.name}</div>
                    {tx.counterpart && (
                      <div style={{ fontSize: "9px", color: "#64748b", marginTop: "1px" }}>{tx.counterpart}</div>
                    )}
                  </td>
                  <td style={{ ...TD, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: k === "income" ? "#15803d" : k === "refund" ? "#b45309" : "#b91c1c" }}>
                    {fmt(tx.amount || 0)}
                  </td>
                  <td style={TD}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: "4px",
                      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                      fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px",
                    }}>{tr(c.label[0], c.label[1])}</span>
                  </td>
                  <td style={{ ...TD, fontSize: "9px" }}>
                    {tx.matched_invoice_id ? (
                      <span style={{
                        padding: "2px 6px", borderRadius: "4px",
                        background: "#dcfce7", color: "#15803d",
                        fontSize: "9px", fontWeight: 700, border: "1px solid #bbf7d0",
                        fontFamily: "monospace",
                      }}>✓ {matchedLabel}</span>
                    ) : (
                      <span style={{
                        padding: "2px 6px", borderRadius: "4px",
                        background: "#fef2f2", color: "#b91c1c",
                        fontSize: "9px", fontWeight: 700, border: "1px solid #fecaca",
                      }}>{matchedLabel}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#0c4a6e" }}>
              <td colSpan={4} style={{ ...TD, color: "#fff", fontWeight: 700 }}>
                {tr("TOPLAM", "GESAMT")}
              </td>
              <td style={{ ...TD, textAlign: "right", color: "#bae6fd", fontFamily: "monospace", fontWeight: 800 }}>
                {fmt(totalAmount)}
              </td>
              <td colSpan={2} style={{ ...TD, color: "#bae6fd", fontSize: "9px" }}>
                {matchedCount} / {transactions.length} {tr("eşleşti", "zugeordnet")}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
};

// ─── VERGİ DANIŞMANI TESLİM RAPORU ──────────────────────────────────────────
const TeslimRaporuDoc: React.FC<{
  invoices: Invoice[];
  items: InvoiceItem[];
  bankIncomes: SavedTransaction[];
  companyInfo: CompanyInfoSnapshot | null;
  period: string;
  tr: (a: string, b: string) => string;
}> = ({ invoices, items, bankIncomes, companyInfo, period, tr }) => {
  const totalNet = invoices.reduce((s, i) => s + (i.ara_toplam || i.total_net || 0), 0);
  const totalVat = invoices.reduce((s, i) => s + (i.toplam_kdv || i.total_vat || 0), 0);
  const totalGross = invoices.reduce((s, i) => s + (i.genel_toplam || i.total_gross || 0), 0);
  const totalBankIncome = bankIncomes.reduce((s, tx) => s + (tx.amount || 0), 0);

  const today = new Date();
  const overdueInvoices = invoices.filter(inv => {
    const dateStr = inv.tarih || inv.invoice_date;
    if (!dateStr) return false;
    const due = new Date(dateStr);
    due.setDate(due.getDate() + 30);
    return due < today;
  });
  const totalOverdue = overdueInvoices.reduce((s, i) => s + (i.genel_toplam || i.total_gross || 0), 0);

  const missingItems = items.filter(it => !it.account_code || it.account_code.trim() === "");
  const withCode = items.filter(it => it.account_code && it.account_code.trim() !== "");
  const completeness = items.length > 0 ? Math.round((withCode.length / items.length) * 100) : 0;
  const datevReady = completeness >= 80
    && invoices.every(i => !!(i.tarih || i.invoice_date))
    && invoices.every(i => !!(i.fatura_no || i.invoice_number));

  const supplierMap = new Map<string, number>();
  invoices.forEach(inv => {
    const name = inv.satici_adi || inv.supplier_name || inv.raw_ai_response?.header?.supplier_name || tr("Bilinmiyor", "Unbekannt");
    supplierMap.set(name, (supplierMap.get(name) || 0) + (inv.genel_toplam || inv.total_gross || 0));
  });
  const top5 = Array.from(supplierMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const SNum: React.FC<{ n: number; color: string }> = ({ n, color }) => (
    <div style={{
      width: "20px", height: "20px", borderRadius: "50%",
      background: color, color: "#fff", fontSize: "10px", fontWeight: 800,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>{n}</div>
  );

  const STitle: React.FC<{ title: string; color: string; num: number }> = ({ title, color, num }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px",
      marginBottom: "10px", paddingBottom: "6px",
      borderBottom: `2px solid ${color}`,
    }}>
      <SNum n={num} color={color} />
      <div style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </div>
    </div>
  );

  return (
    <div style={{ ...DOC, padding: "40px 48px" }}>
      {/* Başlık */}
      <div style={{ marginBottom: "20px", paddingBottom: "14px", borderBottom: "3px solid #0f172a" }}>
        <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "5px" }}>
          fikoai.de Smart Accounting · {new Date().toLocaleDateString("de-DE")} · {tr("Gizlilik: Yalnızca Vergi Danışmanı'na özel", "Vertraulich: Nur für Steuerberater")}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "19px", fontWeight: 900, color: "#0f172a", letterSpacing: "0.02em" }}>
              {tr("VERGİ DANIŞMANI TESLİM RAPORU", "STEUERBERATER ÜBERGABEBERICHT")}
            </div>
            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "3px" }}>
              {tr("Tüm rapor alanlarının konsolide özeti — Yazdırılabilir resmi belge", "Konsolidierte Zusammenfassung aller Berichtsbereiche — Druckfähiges Dokument")}
            </div>
          </div>
          <div style={{ padding: "8px 16px", borderRadius: "8px", background: "#f1f5f9", border: "1px solid #e2e8f0", textAlign: "right" }}>
            <div style={{ fontSize: "9px", color: "#64748b" }}>{tr("Dönem", "Zeitraum")}</div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>{period}</div>
          </div>
        </div>
        {companyInfo?.company_name && (
          <div style={{ marginTop: "8px", padding: "5px 12px", borderRadius: "6px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "inline-block" }}>
            <span style={{ fontSize: "10px", color: "#475569" }}>
              <strong>{companyInfo.company_name}</strong>
              {companyInfo.steuernummer ? ` · StNr: ${companyInfo.steuernummer}` : ""}
              {companyInfo.finanzamt ? ` · FA: ${companyInfo.finanzamt}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* KPI Özet */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "22px" }}>
        {[
          { label: tr("Gelen Faturalar", "Eingangsrechnungen"), val: String(invoices.length), sub: tr("adet", "Stück"), color: "#06b6d4" },
          { label: tr("Toplam Gider (Brüt)", "Gesamtaufwand Brutto"), val: fmt(totalGross), sub: `Net: ${fmt(totalNet)}`, color: "#8b5cf6" },
          { label: tr("Banka Geliri", "Bankgutschriften"), val: fmt(totalBankIncome), sub: `${bankIncomes.length} ${tr("işlem", "Buchungen")}`, color: "#10b981" },
          { label: tr("KDV / Vorsteuer", "Umsatzsteuer"), val: fmt(totalVat), sub: tr("İndirilecek KDV", "Abzugsfähig"), color: "#f59e0b" },
        ].map(kpi => (
          <div key={kpi.label} style={{ padding: "12px", borderRadius: "8px", background: `${kpi.color}0e`, border: `1px solid ${kpi.color}30` }}>
            <div style={{ fontSize: "8px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{kpi.label}</div>
            <div style={{ fontSize: "15px", fontWeight: 900, color: kpi.color, fontFamily: "monospace" }}>{kpi.val}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8", marginTop: "2px" }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Bölüm 1: Gelen Faturalar */}
      <div style={{ marginBottom: "18px" }}>
        <STitle title={tr("Gelen Faturalar — Eingangsbuch Özeti", "Eingangsrechnungen — Übersicht")} color="#06b6d4" num={1} />
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
          {[
            { label: tr("Fatura Sayısı", "Anzahl"), val: String(invoices.length), color: "#eff6ff", bc: "#bfdbfe", tc: "#1e40af" },
            { label: tr("Net Toplam", "Netto gesamt"), val: fmt(totalNet), color: "#f0f9ff", bc: "#bae6fd", tc: "#0284c7" },
            { label: "KDV / VSt.", val: fmt(totalVat), color: "#f0f9ff", bc: "#bae6fd", tc: "#0284c7" },
            { label: tr("Brüt Toplam", "Brutto gesamt"), val: fmt(totalGross), color: "#e0f2fe", bc: "#7dd3fc", tc: "#0369a1" },
          ].map(k => (
            <div key={k.label} style={{ flex: 1, padding: "8px 10px", borderRadius: "6px", background: k.color, border: `1px solid ${k.bc}` }}>
              <div style={{ fontSize: "8px", color: k.tc, fontWeight: 700 }}>{k.label}</div>
              <div style={{ fontSize: "13px", fontWeight: 800, color: k.tc, fontFamily: "monospace" }}>{k.val}</div>
            </div>
          ))}
        </div>
        {top5.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>#</th>
                <th style={TH}>{tr("En Çok Alım Yapılan Tedarikçi", "Top-Lieferanten")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{tr("Brüt Tutar", "Bruttobetrag")}</th>
                <th style={{ ...TH, textAlign: "right" }}>%</th>
              </tr>
            </thead>
            <tbody>
              {top5.map(([name, amount], idx) => (
                <tr key={name} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
                  <td style={{ ...TD, color: "#94a3b8", fontSize: "10px", fontFamily: "monospace" }}>{idx + 1}</td>
                  <td style={{ ...TD, fontWeight: 600 }}>{name}</td>
                  <td style={{ ...TD, textAlign: "right", fontFamily: "monospace" }}>{fmt(amount)}</td>
                  <td style={{ ...TD, textAlign: "right", color: "#64748b" }}>
                    {totalGross > 0 ? ((amount / totalGross) * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
              ))}
              {invoices.length > 5 && (
                <tr>
                  <td colSpan={4} style={{ ...TD, textAlign: "center", color: "#94a3b8", fontSize: "10px" }}>
                    + {invoices.length - 5} {tr("fatura daha", "weitere Rechnungen")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {invoices.length === 0 && (
          <div style={{ textAlign: "center", padding: "14px", color: "#94a3b8", fontSize: "10px", background: "#f8fafc", borderRadius: "6px" }}>
            {tr("Bu dönemde gelen fatura yok.", "Keine Eingangsrechnungen im Zeitraum.")}
          </div>
        )}
      </div>

      {/* Bölüm 2: Banka Geliri */}
      <div style={{ marginBottom: "18px" }}>
        <STitle title={tr("Banka Geliri — Ausgangsbuch Özeti", "Bankgutschriften — Übersicht")} color="#10b981" num={2} />
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: "8px", color: "#15803d", fontWeight: 700 }}>{tr("İşlem Sayısı", "Buchungen")}</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#166534" }}>{bankIncomes.length}</div>
          </div>
          <div style={{ flex: 2, padding: "8px 12px", borderRadius: "6px", background: "#dcfce7", border: "1px solid #86efac" }}>
            <div style={{ fontSize: "8px", color: "#15803d", fontWeight: 700 }}>{tr("Toplam Gelir", "Gesamtgutschriften")}</div>
            <div style={{ fontSize: "16px", fontWeight: 900, color: "#166534", fontFamily: "monospace" }}>{fmt(totalBankIncome)}</div>
          </div>
          <div style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: "8px", color: "#15803d", fontWeight: 700 }}>{tr("Eşleşen", "Zugeordnet")}</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#166534" }}>
              {bankIncomes.filter(tx => !!tx.matched_invoice_id).length} / {bankIncomes.length}
            </div>
          </div>
        </div>
        {bankIncomes.length === 0 && (
          <div style={{ marginTop: "8px", textAlign: "center", padding: "12px", color: "#94a3b8", fontSize: "10px", background: "#f8fafc", borderRadius: "6px", border: "1px dashed #e2e8f0" }}>
            {tr("Bu dönemde banka gelir işlemi bulunamadı.", "Keine Bankgutschriften im Zeitraum.")}
          </div>
        )}
      </div>

      {/* Bölüm 3: OPOS */}
      <div style={{ marginBottom: "18px" }}>
        <STitle title={tr("Açık Kalemler (OPOS)", "Offene Posten Liste (OPOS)")} color="#f59e0b" num={3} />
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", background: overdueInvoices.length > 0 ? "#fef2f2" : "#f0fdf4", border: `1px solid ${overdueInvoices.length > 0 ? "#fecaca" : "#bbf7d0"}` }}>
            <div style={{ fontSize: "8px", fontWeight: 700, color: overdueInvoices.length > 0 ? "#b91c1c" : "#15803d" }}>{tr("VADESİ GEÇMİŞ", "ÜBERFÄLLIG")}</div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: overdueInvoices.length > 0 ? "#991b1b" : "#166534", fontFamily: "monospace" }}>
              {overdueInvoices.length > 0 ? fmt(totalOverdue) : tr("Yok", "Keine")}
            </div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>{overdueInvoices.length} {tr("fatura", "Rechnungen")}</div>
          </div>
          <div style={{ flex: 2, padding: "8px 12px", borderRadius: "6px", background: "#fffbeb", border: "1px solid #fde68a" }}>
            <div style={{ fontSize: "8px", color: "#92400e", fontWeight: 700 }}>{tr("AÇIK KALEMLER TOPLAMI", "OFFENE POSTEN GESAMT")}</div>
            <div style={{ fontSize: "16px", fontWeight: 900, color: "#78350f", fontFamily: "monospace" }}>{fmt(totalGross)}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>{invoices.length} {tr("toplam fatura", "Rechnungen gesamt")}</div>
          </div>
        </div>
      </div>

      {/* Bölüm 4+5: Eksik Belgeler & DATEV */}
      <div style={{ marginBottom: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <STitle title={tr("Eksik Belgeler", "Fehlende Belege")} color="#f43f5e" num={4} />
          <div style={{ padding: "12px", borderRadius: "8px", background: missingItems.length > 0 ? "#fff1f2" : "#f0fdf4", border: `1px solid ${missingItems.length > 0 ? "#fecdd3" : "#bbf7d0"}` }}>
            <div style={{ fontSize: "26px", fontWeight: 900, color: missingItems.length > 0 ? "#9f1239" : "#166534" }}>
              {missingItems.length}
            </div>
            <div style={{ fontSize: "10px", color: missingItems.length > 0 ? "#be123c" : "#15803d", fontWeight: 600 }}>
              {missingItems.length > 0
                ? tr(`${missingItems.length} kalem hesap kodu bekliyor`, `${missingItems.length} Positionen ohne Kontierung`)
                : tr("Tüm kalemler hesap kodlu", "Alle Positionen kontiert")}
            </div>
          </div>
        </div>
        <div>
          <STitle title={tr("DATEV Hazırlık Durumu", "DATEV-Exportbereitschaft")} color="#a78bfa" num={5} />
          <div style={{ padding: "12px", borderRadius: "8px", background: datevReady ? "#f0fdf4" : "#fff7ed", border: `1px solid ${datevReady ? "#bbf7d0" : "#fed7aa"}` }}>
            <div style={{ fontSize: "26px", fontWeight: 900, color: datevReady ? "#166534" : "#92400e" }}>
              {completeness}%
            </div>
            <div style={{ fontSize: "10px", color: datevReady ? "#15803d" : "#d97706", fontWeight: 600 }}>
              {datevReady
                ? tr("✓ DATEV'e aktarıma hazır", "✓ DATEV-Exportbereit")
                : tr("⚠ Eksikler giderilmeli", "⚠ Mängel zu beseitigen")}
            </div>
          </div>
        </div>
      </div>

      {/* İmza / Onay */}
      <div style={{ marginTop: "28px", paddingTop: "14px", borderTop: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px" }}>
        {[
          { label: tr("Hazırlayan / Erstellt von", "Erstellt von"), sub: "fikoai.de Smart Accounting" },
          { label: tr("Teslim Tarihi / Übergabedatum", "Übergabedatum"), sub: new Date().toLocaleDateString("de-DE") },
          { label: tr("Steuerberater Kaşe & İmza", "Stempel & Unterschrift"), sub: "" },
        ].map(({ label, sub }) => (
          <div key={label}>
            <div style={{ fontSize: "8px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>{label}</div>
            {sub && <div style={{ fontSize: "10px", color: "#0f172a", fontWeight: 600 }}>{sub}</div>}
            <div style={{ marginTop: "26px", borderTop: "1px solid #cbd5e1" }} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: "10px", textAlign: "center", fontSize: "8px", color: "#cbd5e1", letterSpacing: "0.1em" }}>
        fikoai.de Smart Accounting · {new Date().toLocaleDateString("de-DE")} · {tr("Gizli belge — Yetkisiz dağıtım yasaktır.", "Vertraulich — Unbefugte Weitergabe untersagt.")}
      </div>
    </div>
  );
};

// ─── Exports for FormsPanel ──────────────────────────────────────────────────
export {
  EingangsbuchDoc, AusgangsbuchDoc, OposDoc, BwaDoc,
  FehlendeDoc, DatevExportDoc, BankaDoc, TeslimRaporuDoc,
};
export type { CompanyInfoSnapshot };
