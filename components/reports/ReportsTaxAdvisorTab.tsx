/**
 * ReportsTaxAdvisorTab — Vergi Danışmanı Teslim Raporu
 * Mali müşavire / steuerberater'a teslim için profesyonel PDF raporu
 * Kapak + Özet + Fatura Listesi + Kategori + KDV + SuSa
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  FileText, Download, Loader2, Settings, Building2,
  Calendar, ChevronRight, Save, X, AlertCircle,
} from "lucide-react";
import { Invoice, InvoiceItem } from "../../types";
import { SuSaReport } from "../SuSaReport";
import { getCategoryForItem, CATEGORIES } from "./reportsHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────
export interface CompanyInfo {
  name: string;
  address: string;
  city: string;
  taxNumber: string;
  phone: string;
  email: string;
  clientNumber: string;
  advisorName: string;
  advisorAddress: string;
  advisorCity: string;
  advisorPhone: string;
  advisorEmail: string;
}

export const DEFAULT_COMPANY: CompanyInfo = {
  name: "", address: "", city: "", taxNumber: "",
  phone: "", email: "", clientNumber: "",
  advisorName: "", advisorAddress: "", advisorCity: "",
  advisorPhone: "", advisorEmail: "",
};
const LS_KEY = "muhasys_company_info";

const MONTHS_TR_FULL = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const MONTHS_DE_FULL = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const MONTHS_TR_SHORT = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const MONTHS_DE_SHORT = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

interface Props {
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  yearA: number;
  years: number[];
  lang: string;
  tr: (a: string, b: string) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Şirket Bilgisi Formu (modal)
// ─────────────────────────────────────────────────────────────────────────────
const CompanySettingsModal: React.FC<{
  info: CompanyInfo;
  onSave: (info: CompanyInfo) => void;
  onClose: () => void;
  tr: (a: string, b: string) => string;
}> = ({ info, onSave, onClose, tr }) => {
  const [draft, setDraft] = useState<CompanyInfo>(info);
  const set = (k: keyof CompanyInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(d => ({ ...d, [k]: e.target.value }));

  const Field = ({ label, k, placeholder = "" }: { label: string; k: keyof CompanyInfo; placeholder?: string }) => (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: "#94a3b8" }}>{label}</label>
      <input
        className="c-input w-full text-xs"
        value={draft[k]}
        onChange={set(k)}
        placeholder={placeholder}
        style={{ padding: "7px 10px" }}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.7)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl overflow-hidden"
        style={{ background: "#0d0f15", border: "1px solid #1c1f27" }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid #1c1f27" }}>
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: "#06b6d4" }} />
            <span className="font-syne font-bold text-sm text-slate-100">
              {tr("Rapor Bilgileri", "Berichtsinformationen")}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {/* ── Firma Bilgileri ── */}
          <div>
            <div className="text-xs font-bold mb-3 pb-2" style={{ color: "#06b6d4", borderBottom: "1px solid #1c1f27", letterSpacing: ".06em", textTransform: "uppercase" }}>
              {tr("Firma Bilgileri", "Unternehmensdaten")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label={tr("Firma / Unternehmen Adı", "Unternehmensname")} k="name" placeholder="Mustafa GmbH" />
              </div>
              <Field label={tr("Adres (Sokak/Cadde)", "Straße & Hausnummer")} k="address" placeholder="Musterstraße 1" />
              <Field label={tr("Şehir / PLZ Stadt", "PLZ & Stadt")} k="city" placeholder="10115 Berlin" />
              <Field label={tr("Vergi No / Steuernummer", "Steuernummer")} k="taxNumber" placeholder="12/345/67890" />
              <Field label={tr("Müşteri No / Mandantennr.", "Mandantennummer")} k="clientNumber" placeholder="12345" />
              <Field label={tr("Telefon", "Telefon")} k="phone" placeholder="+49 30 12345678" />
              <Field label={tr("E-Posta", "E-Mail")} k="email" placeholder="info@firma.de" />
            </div>
          </div>

          {/* ── Mali Müşavir Bilgileri ── */}
          <div>
            <div className="text-xs font-bold mb-3 pb-2" style={{ color: "#8b5cf6", borderBottom: "1px solid #1c1f27", letterSpacing: ".06em", textTransform: "uppercase" }}>
              {tr("Mali Müşavir / Steuerberater", "Steuerberater-Angaben")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label={tr("Adı / Kanzleiname", "Kanzleiname")} k="advisorName" placeholder="Stb. Max Mustermann" />
              </div>
              <Field label={tr("Adres (Sokak/Cadde)", "Straße & Hausnummer")} k="advisorAddress" placeholder="Kanzleistraße 5" />
              <Field label={tr("Şehir / PLZ Stadt", "PLZ & Stadt")} k="advisorCity" placeholder="10117 Berlin" />
              <Field label={tr("Telefon", "Telefon")} k="advisorPhone" placeholder="+49 30 87654321" />
              <Field label={tr("E-Posta", "E-Mail")} k="advisorEmail" placeholder="kanzlei@steuerberater.de" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: "1px solid #1c1f27" }}>
          <button onClick={onClose} className="c-btn-ghost px-4 py-2 text-xs rounded-md">
            {tr("İptal", "Abbrechen")}
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md"
            style={{ background: "#06b6d4", color: "#fff" }}
          >
            <Save size={13} /> {tr("Kaydet", "Speichern")}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Rapor içeriği — beyaz kağıt görünümü (PDF için yakalanır)
// ─────────────────────────────────────────────────────────────────────────────

export const ReportDoc: React.FC<{
  company: CompanyInfo;
  periodLabel: string;
  periodShortLabel: string;
  periodInvoices: Invoice[];
  periodItems: InvoiceItem[];
  allInvoices: Invoice[];
  allItems: InvoiceItem[];
  selectedMonth: number | null;
  selectedYear: number;
  lang: string;
  tr: (a: string, b: string) => string;
}> = ({
  company, periodLabel, periodInvoices, periodItems,
  allInvoices, allItems, selectedYear, lang, tr,
}) => {
  const MONTHS_FULL = lang === "tr" ? MONTHS_TR_FULL : MONTHS_DE_FULL;

  // Stats
  const totalNet   = periodInvoices.reduce((s, i) => s + (i.total_net ?? 0), 0);
  const totalVat   = periodInvoices.reduce((s, i) => s + (i.total_vat ?? 0), 0);
  const totalGross = periodInvoices.reduce((s, i) => s + (i.total_gross ?? 0), 0);

  // VAT breakdown
  const vatRows = (() => {
    const invMap = new Map(periodInvoices.map(i => [i.id, i]));
    const grouped: Record<number, { net: number; vat: number; gross: number }> = {};
    periodItems.forEach(it => {
      const rate = it.vat_rate ?? 0;
      if (!grouped[rate]) grouped[rate] = { net: 0, vat: 0, gross: 0 };
      grouped[rate].net   += it.net_amount ?? 0;
      grouped[rate].vat   += it.vat_amount ?? 0;
      grouped[rate].gross += it.gross_amount ?? 0;
    });
    // If no items, build from invoice totals
    if (Object.keys(grouped).length === 0 && periodInvoices.length > 0) {
      grouped[19] = { net: totalNet, vat: totalVat, gross: totalGross };
    }
    return Object.entries(grouped)
      .map(([rate, v]) => ({ rate: Number(rate), ...v }))
      .filter(r => r.gross > 0)
      .sort((a, b) => b.rate - a.rate);
  })();

  // Category breakdown
  const categoryRows = (() => {
    const invMap = new Map<string, Invoice>(periodInvoices.map(i => [i.id, i]));
    const map: Record<string, number> = {};
    periodItems.forEach(it => {
      const inv = invMap.get(it.invoice_id ?? "");
      const k = getCategoryForItem(it.account_code, it.description, it.account_name, inv?.supplier_name).key;
      map[k] = (map[k] ?? 0) + (it.net_amount ?? 0);
    });
    return CATEGORIES
      .map(cat => ({ ...cat, total: map[cat.key] ?? 0 }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);
  })();

  // ── Shared styles ───────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    color: "#475569",
    borderBottom: "2px solid #e2e8f0",
    textAlign: "left",
    background: "#f8fafc",
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 10px",
    fontSize: "10px",
    color: "#1e293b",
    borderBottom: "1px solid #f1f5f9",
  };
  const sectionHead: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 700,
    color: "#0f172a",
    borderBottom: "2px solid #06b6d4",
    paddingBottom: "6px",
    marginBottom: "12px",
    marginTop: "28px",
    fontFamily: "sans-serif",
  };

  return (
    <div style={{
      width: "794px",
      background: "#ffffff",
      color: "#1e293b",
      fontFamily: "'DM Sans', 'Segoe UI', Arial, sans-serif",
      fontSize: "11px",
      lineHeight: 1.5,
    }}>
      {/* ══════════ KAPAK SAYFASI ══════════ */}
      <div style={{
        minHeight: "1120px",
        display: "flex",
        flexDirection: "column",
        padding: "60px 60px 40px",
        background: "linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Dekoratif çizgi */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "5px",
          background: "linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4)",
        }} />
        {/* Watermark */}
        <div style={{
          position: "absolute", bottom: 60, right: 40, opacity: 0.04,
          fontSize: "160px", fontWeight: 900, color: "#fff",
          fontFamily: "monospace", lineHeight: 1,
        }}>
          FikoAI
        </div>

        {/* Logo alanı */}
        <div style={{ marginBottom: "auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.3)",
            borderRadius: "8px", padding: "10px 18px",
          }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "6px",
              background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "16px", fontWeight: 900,
            }}>M</div>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#94a3b8", letterSpacing: ".05em" }}>
              FikoAI AI
            </span>
          </div>
        </div>

        {/* Başlık */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: "60px" }}>
          <div style={{
            fontSize: "11px", letterSpacing: ".2em", color: "#06b6d4",
            fontWeight: 600, marginBottom: "16px", textTransform: "uppercase",
          }}>
            {tr("Ön Muhasebe Sistemi — Resmi Teslim Belgesi", "Vorläufige Buchführung — Offizielle Übergabedokumentation")}
          </div>
          <div style={{
            fontSize: "36px", fontWeight: 900, lineHeight: 1.15,
            color: "#f8fafc", marginBottom: "8px",
          }}>
            {lang === "tr" ? "VERGİ DANIŞMANI" : "STEUERBERATER"}
          </div>
          <div style={{
            fontSize: "36px", fontWeight: 900, lineHeight: 1.15,
            color: "#06b6d4",
          }}>
            {lang === "tr" ? "TESLİM RAPORU" : "ÜBERGABEBERICHT"}
          </div>

          <div style={{
            marginTop: "40px", padding: "20px 24px",
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: "8px",
          }}>
            <div style={{ fontSize: "10px", color: "#64748b", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: "6px" }}>
              {tr("Dönem / Zeitraum", "Zeitraum")}
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#e2e8f0" }}>
              {periodLabel}
            </div>
          </div>
        </div>

        {/* Firma bilgileri + Tarih */}
        <div style={{
          marginTop: "60px",
          borderTop: "1px solid rgba(255,255,255,.1)",
          paddingTop: "28px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
        }}>
          {/* Sol: Firma */}
          <div>
            <div style={{ fontSize: "9px", letterSpacing: ".15em", color: "#64748b", textTransform: "uppercase", marginBottom: "10px" }}>
              {tr("Hazırlayan Firma", "Aussteller")}
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", marginBottom: "4px" }}>
              {company.name || tr("(Firma adı girilmemiş)", "(Kein Unternehmensname)")}
            </div>
            {company.address && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{company.address}</div>}
            {company.city && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{company.city}</div>}
            {company.taxNumber && (
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
                {tr("Vergi No:", "Steuernummer:")} {company.taxNumber}
              </div>
            )}
            {company.phone && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{company.phone}</div>}
            {company.email && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{company.email}</div>}
          </div>

          {/* Sağ: Tarih + Mali Müşavir */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "9px", letterSpacing: ".15em", color: "#64748b", textTransform: "uppercase", marginBottom: "10px" }}>
              {tr("Teslim Tarihi", "Übergabedatum")}
            </div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", marginBottom: "20px" }}>
              {today()}
            </div>
            {company.advisorName && (
              <div style={{
                background: "rgba(139,92,246,.08)",
                border: "1px solid rgba(139,92,246,.2)",
                borderRadius: "8px",
                padding: "14px 18px",
                textAlign: "right",
              }}>
                <div style={{ fontSize: "9px", letterSpacing: ".15em", color: "#8b5cf6", textTransform: "uppercase", marginBottom: "10px" }}>
                  {tr("Mali Müşavir", "Steuerberater")}
                </div>
                <div style={{ fontSize: "14px", color: "#f1f5f9", fontWeight: 700, marginBottom: "6px" }}>
                  {company.advisorName}
                </div>
                {company.advisorAddress && (
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>{company.advisorAddress}</div>
                )}
                {company.advisorCity && (
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "6px" }}>{company.advisorCity}</div>
                )}
                {company.advisorPhone && (
                  <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "6px" }}>
                    ☎ {company.advisorPhone}
                  </div>
                )}
                {company.advisorEmail && (
                  <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
                    ✉ {company.advisorEmail}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ SAYFA KIRIMI ══════════ */}
      <div style={{ pageBreakBefore: "always", height: "1px" }} />

      {/* İçerik sayfaları */}
      <div style={{ padding: "40px 60px 60px" }}>

        {/* ── 1. GENEL ÖZET ─────────────────────────────── */}
        <div style={sectionHead}>
          {lang === "tr" ? "1. GENEL ÖZETİ" : "1. ZUSAMMENFASSUNG"}
        </div>

        {periodInvoices.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "12px", background: "#f8fafc", borderRadius: "6px" }}>
            {tr("Bu dönem için fatura bulunamadı.", "Für diesen Zeitraum wurden keine Rechnungen gefunden.")}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
            {[
              { label: tr("Fatura Sayısı", "Rechnungen"), value: String(periodInvoices.length), color: "#06b6d4" },
              { label: tr("Net Tutar", "Nettobetrag"),   value: fmtEur(totalNet),   color: "#10b981" },
              { label: tr("KDV / MwSt",  "MwSt-Betrag"), value: fmtEur(totalVat),   color: "#f59e0b" },
              { label: tr("Brüt Tutar",  "Bruttobetrag"),value: fmtEur(totalGross), color: "#8b5cf6" },
            ].map((c, i) => (
              <div key={i} style={{
                padding: "16px", borderRadius: "6px",
                background: "#f8fafc", border: `2px solid ${c.color}22`,
                borderLeft: `4px solid ${c.color}`,
              }}>
                <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "6px" }}>
                  {c.label}
                </div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── 2. FATURA LİSTESİ ──────────────────────────── */}
        {periodInvoices.length > 0 && (
          <>
            <div style={sectionHead}>
              {lang === "tr" ? "2. FATURA LİSTESİ" : "2. RECHNUNGSLISTE"}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
              <thead>
                <tr>
                  {[
                    tr("Fatura No", "Rechnungsnr."),
                    tr("Tedarikçi / Lieferant", "Lieferant"),
                    tr("Tarih", "Datum"),
                    tr("Net (€)", "Netto (€)"),
                    tr("KDV (€)", "MwSt (€)"),
                    tr("Brüt (€)", "Brutto (€)"),
                  ].map((h, i) => (
                    <th key={i} style={{ ...thStyle, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodInvoices.map((inv, i) => (
                  <tr key={inv.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "#06b6d4" }}>
                      {inv.invoice_number || "—"}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: "180px" }}>
                      {inv.supplier_name || "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {fmtDate(inv.invoice_date)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                      {fmtEur(inv.total_net ?? 0)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                      {fmtEur(inv.total_vat ?? 0)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
                      {fmtEur(inv.total_gross ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#0f172a" }}>
                  <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, color: "#fff", borderBottom: "none" }}>
                    {tr("TOPLAM", "GESAMT")}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#10b981", borderBottom: "none", fontFamily: "monospace" }}>
                    {fmtEur(totalNet)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f59e0b", borderBottom: "none", fontFamily: "monospace" }}>
                    {fmtEur(totalVat)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#06b6d4", borderBottom: "none", fontFamily: "monospace" }}>
                    {fmtEur(totalGross)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        {/* ── 3. KATEGORİ BAZLI HARCAMALAR ──────────────── */}
        {categoryRows.length > 0 && (
          <>
            <div style={{ pageBreakBefore: "auto" }}>
              <div style={sectionHead}>
                {lang === "tr" ? "3. KATEGORİ BAZLI HARCAMALAR" : "3. AUSGABEN NACH KATEGORIEN"}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <thead>
                  <tr>
                    {[
                      tr("Kategori", "Kategorie"),
                      tr("Kalem Sayısı", "Positionen"),
                      tr("Net Tutar (€)", "Nettobetrag (€)"),
                      "%",
                    ].map((h, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalCat = categoryRows.reduce((s, c) => s + c.total, 0);
                    const invMap = new Map<string, Invoice>(periodInvoices.map(i => [i.id, i]));
                    return categoryRows.map((cat, i) => {
                      const itemCount = periodItems.filter(it => {
                        const inv = invMap.get(it.invoice_id ?? "");
                        return getCategoryForItem(it.account_code, it.description, it.account_name, inv?.supplier_name).key === cat.key;
                      }).length;
                      const pct = totalCat > 0 ? (cat.total / totalCat) * 100 : 0;
                      return (
                        <tr key={cat.key} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span>{cat.icon}</span>
                              <span style={{ fontWeight: 600 }}>
                                {lang === "tr" ? cat.labelTr : cat.labelDe}
                              </span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{itemCount}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                            {fmtEur(cat.total)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                              <div style={{
                                width: "50px", height: "4px",
                                background: "#e2e8f0", borderRadius: "2px", overflow: "hidden",
                              }}>
                                <div style={{
                                  width: `${pct}%`, height: "100%",
                                  background: cat.color, borderRadius: "2px",
                                }} />
                              </div>
                              <span style={{ fontFamily: "monospace", minWidth: "35px", textAlign: "right" }}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#0f172a" }}>
                    <td colSpan={2} style={{ ...tdStyle, fontWeight: 700, color: "#fff", borderBottom: "none" }}>
                      {tr("TOPLAM", "GESAMT")}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#10b981", borderBottom: "none", fontFamily: "monospace" }}>
                      {fmtEur(categoryRows.reduce((s, c) => s + c.total, 0))}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#fff", borderBottom: "none" }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* ── 4. KDV / VORSTEUER ÖZETİ ──────────────────── */}
        {vatRows.length > 0 && (
          <>
            <div style={sectionHead}>
              {lang === "tr" ? "4. KDV / VORSTEUERÖZETİ" : "4. VORSTEUER-ÜBERSICHT"}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
              <thead>
                <tr>
                  {[
                    tr("KDV Oranı", "USt-Satz"),
                    tr("Net Tutar (€)", "Nettobetrag (€)"),
                    tr("KDV Tutarı (€)", "Vorsteuer (€)"),
                    tr("Brüt Tutar (€)", "Bruttobetrag (€)"),
                  ].map((h, i) => (
                    <th key={i} style={{ ...thStyle, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vatRows.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>
                      {row.rate === 0
                        ? tr("Vergi Dışı / Steuerfreie", "Steuerfreie")
                        : `${row.rate} % (${row.rate === 19 ? (lang === "tr" ? "Standart" : "Normal") : (lang === "tr" ? "İndirimli" : "Ermäßigt")})`}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{fmtEur(row.net)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#f59e0b", fontWeight: 600 }}>{fmtEur(row.vat)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fmtEur(row.gross)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#0f172a" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#fff", borderBottom: "none" }}>
                    {tr("TOPLAM", "GESAMT")}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#10b981", borderBottom: "none", fontFamily: "monospace" }}>
                    {fmtEur(vatRows.reduce((s, r) => s + r.net, 0))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f59e0b", borderBottom: "none", fontFamily: "monospace" }}>
                    {fmtEur(vatRows.reduce((s, r) => s + r.vat, 0))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#06b6d4", borderBottom: "none", fontFamily: "monospace" }}>
                    {fmtEur(vatRows.reduce((s, r) => s + r.gross, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        {/* ── 5. SUMMEN UND SALDEN (SuSa) ────────────────── */}
        <div style={{ pageBreakBefore: "always", paddingTop: "8px" }}>
          <div style={sectionHead}>
            {lang === "tr" ? "5. SUMMEN UND SALDEN LİSTESİ (SuSa)" : "5. SUMMEN UND SALDEN LISTE"}
          </div>
          <SuSaReport
            invoices={periodInvoices}
            invoiceItems={periodItems}
            companyName={company.name}
            clientNumber={company.clientNumber}
          />
        </div>

        {/* ── Alt bilgi / Fußzeile ────────────────────────── */}
        <div style={{
          marginTop: "60px",
          paddingTop: "16px",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "9px",
          color: "#94a3b8",
        }}>
          <span>FikoAI AI — {tr("Ön Muhasebe Sistemi", "Vorläufige Buchführung")}</span>
          <span>{tr("Hazırlanma Tarihi:", "Erstellt am:")} {today()}</span>
          <span>{company.name || "—"}</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Ana sekme bileşeni
// ─────────────────────────────────────────────────────────────────────────────
export const ReportsTaxAdvisorTab: React.FC<Props> = ({
  invoices, invoiceItems, yearA, years, lang, tr,
}) => {
  const [company, setCompany] = useState<CompanyInfo>(DEFAULT_COMPANY);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedYear, setSelectedYear] = useState(yearA);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const MONTHS_FULL  = lang === "tr" ? MONTHS_TR_FULL  : MONTHS_DE_FULL;
  const MONTHS_SHORT = lang === "tr" ? MONTHS_TR_SHORT : MONTHS_DE_SHORT;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setCompany(JSON.parse(stored));
    } catch {}
  }, []);

  const saveCompany = (info: CompanyInfo) => {
    setCompany(info);
    localStorage.setItem(LS_KEY, JSON.stringify(info));
  };

  // Period filtered data
  const periodInvoices = useMemo(() =>
    invoices.filter(inv => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      if (d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== null && d.getMonth() !== selectedMonth) return false;
      return true;
    }),
    [invoices, selectedYear, selectedMonth]
  );

  const periodItems = useMemo(() => {
    const ids = new Set(periodInvoices.map(i => i.id));
    return invoiceItems.filter(it => it.invoice_id && ids.has(it.invoice_id));
  }, [invoiceItems, periodInvoices]);

  const periodLabel = selectedMonth !== null
    ? `${MONTHS_FULL[selectedMonth]} ${selectedYear}`
    : `${selectedYear}`;

  const periodShortLabel = selectedMonth !== null
    ? `${MONTHS_SHORT[selectedMonth]} ${selectedYear}`
    : `${selectedYear}`;

  // PDF download
  const handleDownloadPDF = useCallback(async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const [{ jsPDF }, html2canvasMod] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = (html2canvasMod as { default: typeof import("html2canvas")["default"] }).default;
      const element = reportRef.current;
      const captureW = 794;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        width: captureW,
        height: element.scrollHeight,
        windowWidth: captureW,
        windowHeight: element.scrollHeight,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH, yPos = 0;
      pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH, undefined, "FAST");
      heightLeft -= pageH;
      while (heightLeft > 0) {
        yPos -= pageH; pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH, undefined, "FAST");
        heightLeft -= pageH;
      }
      const safeName = (company.name || "firma").replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "_");
      pdf.save(`Vergi_Danismani_Raporu_${safeName}_${periodShortLabel.replace(/\s/g,"_")}.pdf`);
    } catch (e) {
      console.error(e);
      setGenError(tr("PDF oluşturulamadı.", "PDF konnte nicht erstellt werden."));
    } finally {
      setIsGenerating(false);
    }
  }, [company, periodShortLabel, tr]);

  return (
    <div className="space-y-4">
      {/* ── Başlık + araçlar ─────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-syne font-bold text-sm text-slate-100">
            {tr("Vergi Danışmanı Teslim Raporu", "Steuerberater-Übergabebericht")}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {tr(
              "Mali müşavire teslim için kapak + fatura + SuSa içeren profesyonel PDF raporu",
              "Professioneller PDF-Bericht mit Deckblatt, Rechnungen und SuSa für den Steuerberater"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold"
            style={{ background: "rgba(255,255,255,.04)", border: "1px solid #1c1f27", color: "#94a3b8" }}
          >
            <Settings size={13} />
            {tr("Rapor Bilgileri", "Berichtsdaten")}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold"
            style={{
              background: isGenerating ? "#1c1f27" : "rgba(6,182,212,.12)",
              border: "1px solid rgba(6,182,212,.3)",
              color: isGenerating ? "#64748b" : "#06b6d4",
              cursor: isGenerating ? "not-allowed" : "pointer",
            }}
          >
            {isGenerating
              ? <><Loader2 size={13} className="animate-spin" /> {tr("Oluşturuluyor...", "Wird erstellt...")}</>
              : <><Download size={13} /> {tr("PDF İndir", "PDF herunterladen")}</>}
          </button>
        </div>
      </div>

      {genError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-md text-xs"
          style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#ef4444" }}>
          <AlertCircle size={14} />
          {genError}
        </div>
      )}

      {!company.advisorName && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-md cursor-pointer"
          style={{ background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.15)" }}
          onClick={() => setShowSettings(true)}>
          <AlertCircle size={14} style={{ color: "#8b5cf6", flexShrink: 0 }} />
          <p className="text-xs" style={{ color: "#a78bfa" }}>
            {tr(
              "Mali müşavir bilgilerini ekleyin — kapak sayfasında gösterilecek →",
              "Steuerberater-Daten hinterlegen — wird auf dem Deckblatt angezeigt →"
            )}
          </p>
          <ChevronRight size={14} style={{ color: "#8b5cf6", marginLeft: "auto", flexShrink: 0 }} />
        </div>
      )}

      {/* ── Dönem seçici ─────────────────────────────── */}
      <div className="c-card p-4 space-y-3">
        {/* Yıl satırı */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Calendar size={13} style={{ color: "#64748b" }} />
            <span className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
              {tr("Yıl:", "Jahr:")}
            </span>
          </div>
          {years.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className="px-3 py-1 text-xs font-mono font-semibold rounded-md transition-all"
              style={{
                background: selectedYear === y ? "#06b6d4" : "rgba(255,255,255,.03)",
                color: selectedYear === y ? "#fff" : "#64748b",
                border: `1px solid ${selectedYear === y ? "#06b6d4" : "#1c1f27"}`,
              }}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Ay tabları */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedMonth(null)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
            style={{
              background: selectedMonth === null ? "#8b5cf6" : "rgba(255,255,255,.03)",
              color: selectedMonth === null ? "#fff" : "#64748b",
              border: `1px solid ${selectedMonth === null ? "#8b5cf6" : "#1c1f27"}`,
            }}
          >
            {tr("Tüm Yıl", "Gesamtes Jahr")}
          </button>
          {MONTHS_SHORT.map((m, i) => {
            const count = invoices.filter(inv => {
              if (!inv.invoice_date) return false;
              const d = new Date(inv.invoice_date);
              return d.getFullYear() === selectedYear && d.getMonth() === i;
            }).length;
            const isSelected = selectedMonth === i;
            return (
              <button
                key={i}
                onClick={() => setSelectedMonth(i)}
                className="px-3 py-1.5 text-xs font-mono rounded-md transition-all relative"
                style={{
                  background: isSelected ? "#06b6d4" : count > 0 ? "rgba(6,182,212,.05)" : "rgba(255,255,255,.02)",
                  color: isSelected ? "#fff" : count > 0 ? "#94a3b8" : "#3a3f4a",
                  border: `1px solid ${isSelected ? "#06b6d4" : count > 0 ? "rgba(6,182,212,.2)" : "#1c1f27"}`,
                }}
              >
                {m}
                {count > 0 && (
                  <span style={{
                    position: "absolute", top: "-5px", right: "-4px",
                    fontSize: "8px", fontWeight: 700,
                    background: isSelected ? "#fff" : "#06b6d4",
                    color: isSelected ? "#06b6d4" : "#fff",
                    borderRadius: "10px", padding: "0 4px", lineHeight: "14px",
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Özet */}
        <div className="flex items-center gap-4 pt-1" style={{ borderTop: "1px solid #1c1f27" }}>
          <span className="text-xs" style={{ color: "#64748b" }}>
            <span className="font-mono font-semibold text-slate-200">{periodLabel}</span>
            {" — "}
            <span className="font-mono" style={{ color: "#06b6d4" }}>{periodInvoices.length}</span>
            {" "}{tr("fatura", "Rechnungen")}
          </span>
        </div>
      </div>

      {/* ── Rapor önizlemesi ─────────────────────────── */}
      <div className="c-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid #1c1f27", background: "#0d0f15" }}>
          <div className="flex items-center gap-2">
            <FileText size={13} style={{ color: "#06b6d4" }} />
            <span className="text-xs font-semibold text-slate-200">
              {tr("Rapor Önizlemesi", "Berichtsvorschau")} — {periodLabel}
            </span>
          </div>
          <span className="text-xs" style={{ color: "#3a3f4a" }}>
            {tr("PDF ile aynı içerik", "Gleicher Inhalt wie PDF")}
          </span>
        </div>
        {/* Scroll container — önizleme */}
        <div style={{ overflowX: "auto", background: "#1a1d25", padding: "20px" }}>
          <div style={{ transform: "scale(0.72)", transformOrigin: "top left", width: "794px" }}>
            <div ref={reportRef}>
              <ReportDoc
                company={company}
                periodLabel={periodLabel}
                periodShortLabel={periodShortLabel}
                periodInvoices={periodInvoices}
                periodItems={periodItems}
                allInvoices={invoices}
                allItems={invoiceItems}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                lang={lang}
                tr={tr}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showSettings && (
        <CompanySettingsModal
          info={company}
          onSave={saveCompany}
          onClose={() => setShowSettings(false)}
          tr={tr}
        />
      )}
    </div>
  );
};
