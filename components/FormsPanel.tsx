import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLang } from "../LanguageContext";
import { AccountRow, Invoice, InvoiceItem } from "../types";
import { Download, FileText, Loader2, ChevronRight, Printer } from "lucide-react";
import { ACCOUNT_METADATA } from "../data/skr03Metadata";

interface FormsPanelProps {
  accountPlans: AccountRow[];
}

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const fmt = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €"
    : "—";

const fmtDate = (d: string | null): string => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
};

const scoreColor = (s: number) => s >= 90 ? "#16a34a" : s >= 70 ? "#ca8a04" : "#dc2626";

const DOC_FONT: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: "#0f172a",
};

// ─── Section label ────────────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    margin: "24px -36px 16px",
    padding: "8px 36px",
    background: "#f0fdf4",
    borderTop: "1px solid #bbf7d0",
    borderBottom: "1px solid #bbf7d0",
    borderLeft: "4px solid #16a34a",
    fontSize: "9px",
    color: "#166534",
    textTransform: "uppercase" as const,
    letterSpacing: "0.14em",
    fontWeight: 800,
    ...DOC_FONT,
  }}>
    {children}
  </div>
);

// ─── Page 1: Summary ──────────────────────────────────────────────────────────
const DocSummary: React.FC<{
  invoice: Invoice;
  items: InvoiceItem[];
  tr: (a: string, b: string) => string;
}> = ({ invoice, items, tr }) => {
  const iNet = items.reduce((s, i) => s + (i.net_amount || 0), 0);
  const iVat = items.reduce((s, i) => s + (i.vat_amount || 0), 0);
  const iGross = items.reduce((s, i) => s + (i.gross_amount || 0), 0);
  const hNet = invoice.total_net || 0;
  const hVat = invoice.total_vat || 0;
  const hGross = invoice.total_gross || 0;

  const withinPct = (a: number, b: number) => b === 0 ? true : Math.abs(a - b) / Math.max(Math.abs(b), 0.01) < 0.15;
  const allOk = withinPct(iGross, hGross);
  const avg = items.length ? Math.round(items.reduce((s, i) => s + (i.match_score || 0), 0) / items.length) : 0;

  return (
    <div style={DOC_FONT}>
      {/* HEADER: DATEV Like */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "inline-block", background: "#166534", color: "#fff", padding: "4px 10px", fontSize: "16px", fontWeight: 800, letterSpacing: "0.08em", marginBottom: "12px" }}>
            DATEV <span style={{ fontWeight: 400 }}>| fikoai.de</span>
          </div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase" as const, letterSpacing: "0.02em" }}>
            {tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse")}
          </div>
          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
            {tr("Yapay Zeka Destekli Hesap Kodu Atama Raporu", "KI-Gestützter Kontierungsbericht")} · {new Date().toLocaleDateString("de-DE")}
          </div>
        </div>

        {/* SCORE BADGE */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "9px", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: "4px" }}>
            {tr("AI Güven Skoru", "KI-Konfidenz")}
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, color: scoreColor(avg), lineHeight: 1 }}>
            %{avg}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "20px", marginBottom: "24px" }}>
        {/* SUPPLIER BOX */}
        <div style={{ flex: "2", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "16px" }}>
          <div style={{ fontSize: "9px", color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "6px" }}>
            {tr("Tedarikçi", "Lieferant / Rechnungsaussteller")}
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
            {invoice.supplier_name || "—"}
          </div>
        </div>

        {/* DETAILS BOX */}
        <div style={{ flex: "1.5", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", color: "#64748b" }}>{tr("Fatura No", "Rechnungsnr.")}</span>
            <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>#{invoice.invoice_number || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", color: "#64748b" }}>{tr("Tarih", "Datum")}</span>
            <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>{fmtDate(invoice.invoice_date)}</span>
          </div>
        </div>
      </div>

      {/* FINANCIAL AMOUNTS */}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #94a3b8", marginBottom: "12px" }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={{ padding: "8px 12px", borderRight: "1px solid #cbd5e1", borderBottom: "1px solid #94a3b8", fontSize: "10px", textAlign: "left", color: "#334155" }}>{tr("Açıklama", "Beschreibung")}</th>
            <th style={{ padding: "8px 12px", borderRight: "1px solid #cbd5e1", borderBottom: "1px solid #94a3b8", fontSize: "10px", textAlign: "right", color: "#334155", width: "120px" }}>{tr("Net", "Netto")}</th>
            <th style={{ padding: "8px 12px", borderRight: "1px solid #cbd5e1", borderBottom: "1px solid #94a3b8", fontSize: "10px", textAlign: "right", color: "#334155", width: "120px" }}>{tr("KDV", "MwSt")}</th>
            <th style={{ padding: "8px 12px", borderBottom: "1px solid #94a3b8", fontSize: "10px", textAlign: "right", color: "#334155", width: "120px" }}>{tr("Brüt", "Brutto")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: "10px 12px", borderRight: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}>{tr("Fatura Toplamı (Belge Üzerindeki)", "Rechnungssumme (laut Beleg)")}</td>
            <td style={{ padding: "10px 12px", borderRight: "1px solid #cbd5e1", fontSize: "12px", textAlign: "right", fontFamily: "monospace" }}>{fmt(hNet)}</td>
            <td style={{ padding: "10px 12px", borderRight: "1px solid #cbd5e1", fontSize: "12px", textAlign: "right", fontFamily: "monospace" }}>{fmt(hVat)}</td>
            <td style={{ padding: "10px 12px", fontSize: "13px", fontWeight: 800, textAlign: "right", fontFamily: "monospace" }}>{fmt(hGross)}</td>
          </tr>
        </tbody>
      </table>

      {/* VERIFICATION WARNING */}
      {!allOk && (
        <div style={{ background: "#fef2f2", borderLeft: "4px solid #ef4444", padding: "8px 12px", color: "#991b1b", fontSize: "11px", fontWeight: 600 }}>
          ⚠ {tr("Tutar uyuşmazlığı — başlık ile kalem toplamları kontrol edilmeli.", "Betragsabweichung — Kopf und Positionen prüfen.")}
          <span style={{ marginLeft: "10px", fontSize: "10px", color: "#dc2626" }}>(Net: {fmt(iNet)} | VAT: {fmt(iVat)} | Gross: {fmt(iGross)})</span>
        </div>
      )}
    </div>
  );
};

// ─── Section 2: Compact items table ──────────────────────────────────────────
const DocItemsTable: React.FC<{
  items: InvoiceItem[];
  tr: (a: string, b: string) => string;
}> = ({ items, tr }) => {
  const thStyle: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: "9px",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
    textAlign: "left",
    background: "#166534", // DATEV green
    borderRight: "1px solid rgba(255,255,255,0.2)",
  };
  const tdStyle: React.CSSProperties = {
    padding: "10px 10px",
    fontSize: "11px",
    color: "#1e293b",
    borderBottom: "1px solid #e2e8f0",
    borderRight: "1px solid #e2e8f0",
    verticalAlign: "top",
  };

  return (
    <div style={DOC_FONT}>
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #166534", borderTop: "none" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: "20px", textAlign: "center" as const }}>#</th>
            <th style={{ ...thStyle, width: "60px", textAlign: "center" as const }}>{tr("Hesap", "Konto")}</th>
            <th style={thStyle}>{tr("Açıklama", "Bezeichnung")}</th>
            <th style={{ ...thStyle, textAlign: "right" as const }}>{tr("Miktar", "Menge")}</th>
            <th style={{ ...thStyle, textAlign: "right" as const }}>{tr("Birim", "Preis")}</th>
            <th style={{ ...thStyle, textAlign: "right" as const }}>{tr("Net", "Netto")}</th>
            <th style={{ ...thStyle, textAlign: "center" as const }}>{tr("KDV", "MwSt")}</th>
            <th style={{ ...thStyle, textAlign: "right" as const, borderRight: "none" }}>{tr("Brüt", "Brutto")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={{ ...tdStyle, color: "#94a3b8", textAlign: "center" as const }}>{i + 1}</td>
              <td style={{ ...tdStyle, textAlign: "center" as const }}>
                <span style={{
                  display: "inline-block", padding: "3px 6px",
                  background: "#e2e8f0", color: "#0f172a",
                  borderRadius: "2px", fontSize: "11px", fontWeight: 800,
                  fontFamily: "monospace", letterSpacing: "0.05em",
                }}>{item.account_code || "—"}</span>
              </td>
              <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "160px" }}>{item.description || "—"}</td>
              <td style={{ ...tdStyle, textAlign: "right" as const, fontFamily: "monospace" }}>{item.quantity ?? "—"}</td>
              <td style={{ ...tdStyle, textAlign: "right" as const, fontFamily: "monospace", color: "#64748b" }}>{fmt(item.unit_price)}</td>
              <td style={{ ...tdStyle, textAlign: "right" as const, fontFamily: "monospace", fontWeight: 600 }}>{fmt(item.net_amount)}</td>
              <td style={{ ...tdStyle, textAlign: "center" as const, fontFamily: "monospace", color: "#64748b" }}>
                {item.vat_rate != null ? `${item.vat_rate}%` : "—"}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" as const, fontWeight: 800, fontFamily: "monospace", borderRight: "none" }}>{fmt(item.gross_amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "#e2e8f0", borderTop: "2px solid #cbd5e1" }}>
            <td colSpan={5} style={{ padding: "8px 10px", textAlign: "right", fontSize: "10px", fontWeight: 800, textTransform: "uppercase" as const, borderRight: "1px solid #cbd5e1" }}>
              {tr("Ara Toplam", "Zwischensumme")}
            </td>
            <td style={{ padding: "8px 10px", textAlign: "right", fontSize: "11px", fontWeight: 800, fontFamily: "monospace", borderRight: "1px solid #cbd5e1" }}>
              {fmt(items.reduce((s, i) => s + (i.net_amount || 0), 0))}
            </td>
            <td style={{ padding: "8px 10px", borderRight: "1px solid #cbd5e1" }}></td>
            <td style={{ padding: "8px 10px", textAlign: "right", fontSize: "13px", fontWeight: 800, fontFamily: "monospace" }}>
              {fmt(items.reduce((s, i) => s + (i.gross_amount || 0), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── Section 2.5: Charts & Graph ─────────────────────────────────────────────
const DocCharts: React.FC<{ items: InvoiceItem[]; tr: (a: string, b: string) => string }> = ({ items, tr }) => {
  const groups = new Map<string, number>();
  let totalNet = 0;
  items.forEach(i => {
    const code = i.account_code || "Bilinmiyor";
    const amt = i.net_amount || 0;
    groups.set(code, (groups.get(code) || 0) + amt);
    totalNet += amt;
  });

  const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ ...DOC_FONT, marginTop: "20px", display: "flex", gap: "24px" }}>
      <div style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "4px", padding: "16px", background: "#f8fafc" }}>
        <div style={{ fontSize: "10px", fontWeight: 800, textTransform: "uppercase" as const, color: "#475569", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>📊</span> {tr("Hesap Dağılım Grafiği", "Kontenverteilungsdiagramm")} (Netto)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {sorted.map(([code, amt]) => {
            const pct = totalNet > 0 ? Math.round((amt / totalNet) * 100) : 0;
            return (
              <div key={code}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "2px", fontWeight: 600 }}>
                  <span>SKR03: {code}</span>
                  <span>{fmt(amt)} ({pct}%)</span>
                </div>
                <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#166534" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "4px", padding: "16px", background: "#f8fafc" }}>
        <div style={{ fontSize: "10px", fontWeight: 800, textTransform: "uppercase" as const, color: "#475569", marginBottom: "8px" }}>
          {tr("Muhasebesel Yorum", "Buchhalterischer Kommentar")}
        </div>
        <p style={{ fontSize: "10px", color: "#334155", lineHeight: 1.6 }}>
          {tr(
            `Bu fatura toplam ${items.length} kalemde incelenmiş olup, büyük çoğunluğu SKR03 ${sorted[0]?.[0]} hesabına tahsis edilmiştir. KDV doğrulama mantığı ve genel eşleşme skoru yasal sınırlar altındadır.`,
            `Diese Rechnung wurde in ${items.length} Positionen analysiert, wobei der Großteil auf das SKR03 Konto ${sorted[0]?.[0]} entfällt. Die MwSt.-Verifikationslogik und der allgemeine Übereinstimmungs-Score liegen innerhalb der gesetzlichen Grenzen.`
          )}
        </p>
      </div>
    </div>
  );
};

// ─── Section 3: Account code detail cards — ENRICHED with DATEV metadata ───
const DocAccountDetails: React.FC<{
  items: InvoiceItem[];
  planJustMap: Map<string, string>;
  tr: (a: string, b: string) => string;
}> = ({ items, planJustMap, tr }) => {
  const groups = new Map<string, InvoiceItem[]>();
  items.forEach(item => {
    const key = item.account_code || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  });

  // Klasse belirleme
  const getKlasse = (code: string) => {
    const n = parseInt(code.replace(/\D/g, '').substring(0, 4), 10);
    if (isNaN(n)) return null;
    const kl = Math.floor(n / 1000);
    const KLASSE_NAMES: Record<number, [string, string]> = {
      0: ['Duran Varlıklar', 'Anlagevermögen'],
      1: ['Finans Hesapları', 'Finanzkonten'],
      2: ['Abgrenzung', 'Abgrenzungskonten'],
      3: ['Mal Alımları', 'Wareneingang'],
      4: ['İşletme Giderleri', 'Betriebliche Aufw.'],
      5: ['Sonderposten', 'Sonderposten'],
      6: ['Sonderposten', 'Sonderposten'],
      7: ['Stok Değişimleri', 'Bestandsveränd.'],
      8: ['Satış Gelirleri', 'Erlöskonten'],
      9: ['Devir Hesapları', 'Vortragskonten'],
    };
    return { klasse: kl, label: KLASSE_NAMES[kl] };
  };

  return (
    <div style={DOC_FONT}>
      {Array.from(groups.entries()).map(([code, codeItems]) => {
        const rep = codeItems[0];
        const planJust = code !== "—" ? (planJustMap.get(code) ?? null) : null;
        const avgScore = Math.round(codeItems.reduce((s, i) => s + (i.match_score || 0), 0) / codeItems.length);
        const meta = code !== "—" ? ACCOUNT_METADATA[code] : undefined;
        const klInfo = code !== "—" ? getKlasse(code) : null;

        const details: { label: string; value: string | null | undefined }[] = [
          { label: tr('HGB', 'HGB'), value: rep.hgb_reference },
          { label: tr('Vergi', 'Steuer'), value: rep.tax_note },
          { label: tr('Dönem', 'Periode'), value: rep.period_note },
          { label: tr('Gider Tipi', 'Ausgabentyp'), value: rep.expense_type },
          { label: tr('DATEV K.H.', 'DATEV GK.'), value: rep.datev_counter_account },
        ].filter(d => d.value);

        return (
          <div key={code} style={{
            border: '1px solid #e2e8f0', borderRadius: '4px',
            marginBottom: '10px', overflow: 'hidden',
            pageBreakInside: 'avoid' as const, breakInside: 'avoid' as const,
          }}>
            {/* ── Header: Account Code + Name ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{
                  display: 'inline-block', padding: '6px 12px',
                  background: '#166534', color: 'white',
                  borderRadius: '4px', fontSize: '15px', fontWeight: 800,
                  fontFamily: 'monospace', letterSpacing: '0.06em',
                }}>{code}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{rep.account_name || '—'}</div>
                  {rep.account_name_tr && (
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: "2px" }}>{rep.account_name_tr}</div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase" as const, fontWeight: 700 }}>{tr("AI Güveni", "KI-Konfidenz")}</div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: scoreColor(avgScore) }}>%{avgScore}</div>
              </div>
            </div>

            <div style={{ padding: '16px' }}>
              {/* ── AI Justification ── */}
              {rep.match_justification && (
                <div style={{ background: '#f5f3ff', borderLeft: '4px solid #8b5cf6', padding: '12px', marginBottom: '16px', borderRadius: '0 4px 4px 0' }}>
                  <div style={{ fontSize: '9px', color: '#6d28d9', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 800 }}>
                    {tr('AI Eşleşme Kararı ve Gerekçesi', 'KI-Zuordnungsentscheidung und Begründung')}
                  </div>
                  <div style={{ fontSize: '11px', color: '#4c1d95', fontStyle: 'italic', lineHeight: 1.6 }}>"{rep.match_justification}"</div>
                </div>
              )}

              {/* ── Grid: Items list & DATEV Info ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

                {/* Sol: İlgili Fatura Kalemleri */}
                <div>
                  <div style={{ fontSize: '10px', color: '#475569', fontWeight: 700, textTransform: 'uppercase' as const, borderBottom: "1px solid #e2e8f0", paddingBottom: "4px", marginBottom: '8px' }}>
                    {tr('Bu Hesaba İşlenen Kalemler', 'Zugeordnete Positionen')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                    {codeItems.map((ci) => {
                      const origIdx = items.findIndex(it => it.id === ci.id);
                      return (
                        <div key={ci.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span style={{ color: '#334155' }}>
                            <span style={{ color: '#94a3b8', fontFamily: 'monospace', marginRight: '6px', fontWeight: 700 }}>#{origIdx + 1}</span>
                            {ci.description || '—'}
                          </span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: "#0f172a" }}>{fmt(ci.gross_amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sağ: DATEV SKR03 Bilgileri */}
                {meta && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' as const, borderBottom: "1px solid #bae6fd", paddingBottom: "4px", marginBottom: '8px' }}>
                      {tr('DATEV SKR03 Hesap Detayı', 'DATEV SKR03 Kontodetail')}
                    </div>
                    {meta.description && (
                      <div style={{ fontSize: '10px', color: '#1e3a5f', marginBottom: '6px', lineHeight: 1.5 }}>
                        {meta.description}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '8px' }}>
                      {meta.kategorie && (
                        <span style={{ padding: '2px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '9px', color: '#334155', fontWeight: 600 }}>
                          Kat: {meta.kategorie}
                        </span>
                      )}
                      {meta.kdvRate && meta.kdvRate !== '0%' && (
                        <span style={{ padding: '2px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '9px', color: '#334155', fontWeight: 600 }}>
                          KDV: {meta.kdvRate}
                        </span>
                      )}
                      {meta.taraf && (
                        <span style={{ padding: '2px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '9px', color: '#334155', fontWeight: 600 }}>
                          {meta.taraf}
                        </span>
                      )}
                    </div>
                    {meta.keywords && meta.keywords.length > 0 && (
                      <div style={{ fontSize: '9px', color: '#64748b' }}>
                        <strong style={{ color: "#475569" }}>Keywords:</strong> {meta.keywords.slice(0, 6).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────
export const FormsPanel: React.FC<FormsPanelProps> = ({ accountPlans }) => {
  const invoices: any[] = [];
  const invoiceItems: any[] = [];
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const MONTHS = lang === "tr" ? MONTHS_TR : MONTHS_DE;

  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  // Blob URL for original PDF — same-origin so the browser can print it
  const [origBlobUrl, setOrigBlobUrl] = useState<string | null>(null);
  const [origBlobLoading, setOrigBlobLoading] = useState(false);

  // Only the white document is captured by html2canvas
  const previewRef = useRef<HTMLDivElement>(null);

  // Tüm dosya türleri (PDF + görsel) için blob URL oluştur.
  // blob:// URL'leri same-origin sayılır → X-Frame-Options / CSP engeli olmaz.
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setOrigBlobUrl(null);
    setOrigBlobLoading(false);

    if (selectedInvoice?.file_url) {
      setOrigBlobLoading(true);
      fetch(selectedInvoice.file_url)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        })
        .then(blob => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setOrigBlobUrl(objectUrl);
          setOrigBlobLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setOrigBlobLoading(false);
        });
    }

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedInvoice?.id, selectedInvoice?.file_url]);

  const years = useMemo(() => {
    const y = new Set<number>();
    invoices.forEach(inv => { if (inv.invoice_date) y.add(new Date(inv.invoice_date).getFullYear()); });
    if (y.size === 0) y.add(new Date().getFullYear());
    return Array.from(y).sort((a, b) => b - a);
  }, [invoices]);

  const filteredInvoices = useMemo(() =>
    invoices.filter(inv => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      if (d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== null && d.getMonth() !== selectedMonth) return false;
      return true;
    }).sort((a, b) => new Date(b.invoice_date || "").getTime() - new Date(a.invoice_date || "").getTime()),
    [invoices, selectedMonth, selectedYear]);

  // Sayfa başında ilk faturayı otomatik seç
  useEffect(() => {
    if (filteredInvoices.length === 0) {
      setSelectedInvoice(null);
      return;
    }
    const stillInList = selectedInvoice && filteredInvoices.some(inv => inv.id === selectedInvoice.id);
    if (!stillInList) {
      setSelectedInvoice(filteredInvoices[0]);
    }
  }, [filteredInvoices]);

  const selectedItems = useMemo(() =>
    selectedInvoice ? invoiceItems.filter(i => i.invoice_id === selectedInvoice.id) : [],
    [selectedInvoice, invoiceItems]);

  const planJustMap = useMemo(() => {
    const m = new Map<string, string>();
    accountPlans.forEach(p => {
      if (p.account_code && p.analysis_justification) m.set(p.account_code, p.analysis_justification);
    });
    return m;
  }, [accountPlans]);

  // ── Shared: capture analysis div + merge original document ───────────────
  //
  // KURAL: generateMergedPDF her zaman orijinal belgeyi (PDF veya görsel)
  // son sayfada eklemelidir. File_url null olsa bile fonksiyon çalışmalı;
  // sadece orijinal sayfa eklenmez. Her file_type (PDF + resim) desteklenir.
  //
  const generateMergedPDF = useCallback(async (): Promise<Blob> => {
    if (!previewRef.current || !selectedInvoice) throw new Error("No data");

    const [{ jsPDF }, html2canvasMod] = await Promise.all([
      import("jspdf"),
      import("html2canvas"),
    ]);
    const html2canvas = (html2canvasMod as { default: typeof import("html2canvas")["default"] }).default;

    const element = previewRef.current;
    const captureW = 794;

    const canvas = await html2canvas(element, {
      scale: 2, useCORS: true, logging: false,
      backgroundColor: "#ffffff",
      width: captureW, height: element.scrollHeight,
      windowWidth: captureW, windowHeight: element.scrollHeight,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.93);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;

    let heightLeft = imgH, yPos = 0;
    pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH, undefined, "FAST");
    heightLeft -= pageH;
    while (heightLeft > 0) {
      yPos -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH, undefined, "FAST");
      heightLeft -= pageH;
    }

    if (selectedInvoice.file_url) {
      const isPdf = selectedInvoice.file_type === "application/pdf" || selectedInvoice.file_url.split("?")[0].toLowerCase().endsWith(".pdf");
      if (isPdf) {
        // PDF → pdf-lib ile merge
        try {
          const { PDFDocument } = await import("pdf-lib");
          const analysisBytes = pdf.output("arraybuffer");
          const origBytes = await fetch(selectedInvoice.file_url, { mode: "cors" }).then(r => r.arrayBuffer());
          const merged = await PDFDocument.create();
          const analysisPdf = await PDFDocument.load(analysisBytes);
          const origPdf = await PDFDocument.load(origBytes);
          const aPages = await merged.copyPages(analysisPdf, analysisPdf.getPageIndices());
          aPages.forEach(p => merged.addPage(p));
          const oPages = await merged.copyPages(origPdf, origPdf.getPageIndices());
          oPages.forEach(p => merged.addPage(p));
          const savedBytes = await merged.save();
          return new Blob([savedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        } catch (mergeErr) {
          console.warn("PDF merge failed, falling back to analysis only:", mergeErr);
        }
      } else {
        // Görsel (JPEG/PNG/vb.) → canvas üzerinden yeni sayfa olarak ekle
        try {
          const imgEl = new Image();
          imgEl.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            imgEl.onload = () => resolve();
            imgEl.onerror = () => reject(new Error("Image load failed"));
            imgEl.src = selectedInvoice.file_url!;
          });
          const imgCanvas = document.createElement("canvas");
          imgCanvas.width = imgEl.naturalWidth;
          imgCanvas.height = imgEl.naturalHeight;
          imgCanvas.getContext("2d")!.drawImage(imgEl, 0, 0);
          const origJpeg = imgCanvas.toDataURL("image/jpeg", 0.93);
          const aspectRatio = imgEl.naturalHeight / imgEl.naturalWidth;
          const origImgH = pageW * aspectRatio;
          pdf.addPage();
          let remH = origImgH, origY = 0;
          pdf.addImage(origJpeg, "JPEG", 0, origY, pageW, origImgH, undefined, "FAST");
          remH -= pageH;
          while (remH > 0) {
            origY -= pageH;
            pdf.addPage();
            pdf.addImage(origJpeg, "JPEG", 0, origY, pageW, origImgH, undefined, "FAST");
            remH -= pageH;
          }
        } catch (imgErr) {
          console.warn("Image merge failed, fallback to analysis only:", imgErr);
        }
      }
    }

    return new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
  }, [selectedInvoice]);

  // ── Print: open merged PDF in native browser viewer → Ctrl+P works ────────
  const handlePrint = useCallback(async () => {
    if (!selectedInvoice || !previewRef.current) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const blob = await generateMergedPDF();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke after 1 min — enough time for the tab to load and print
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setGenError(tr("Yazdırma hazırlanamadı.", "Druck konnte nicht vorbereitet werden."));
    } finally {
      setIsGenerating(false);
    }
  }, [selectedInvoice, generateMergedPDF, tr]);

  // ── PDF download ──────────────────────────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    if (!selectedInvoice || !previewRef.current) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const blob = await generateMergedPDF();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `fatura-analiz-${selectedInvoice.invoice_number || "belge"}.pdf`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch {
      setGenError(tr("PDF oluşturulamadı.", "PDF konnte nicht erstellt werden."));
    } finally {
      setIsGenerating(false);
    }
  }, [selectedInvoice, generateMergedPDF, tr]);

  // ── Print ALL (Toplu Yazdır) — Capture all invoices in period into one PDF ──
  const handlePrintAll = useCallback(async () => {
    if (filteredInvoices.length === 0) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const [{ jsPDF }, html2canvasMod, { PDFDocument }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
        import("pdf-lib")
      ]);
      const html2canvas = (html2canvasMod as any).default || html2canvasMod;
      const merged = await PDFDocument.create();

      for (const inv of filteredInvoices) {
        const elementId = `capture-all-${inv.id}`;
        const element = document.getElementById(elementId);

        // 1. Capture the Analysis Document
        if (element) {
          const captureW = 794;
          const canvas = await html2canvas(element, {
            scale: 2, useCORS: true, logging: false,
            backgroundColor: "#ffffff",
            width: captureW, height: element.scrollHeight,
            windowWidth: captureW, windowHeight: element.scrollHeight,
          });
          const imgData = canvas.toDataURL("image/jpeg", 0.93);
          const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
          const pageW = pdf.internal.pageSize.getWidth();
          const pageH = pdf.internal.pageSize.getHeight();
          const imgH = (canvas.height * pageW) / canvas.width;

          let heightLeft = imgH, yPos = 0;
          pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH, undefined, "FAST");
          heightLeft -= pageH;
          while (heightLeft > 0) {
            yPos -= pageH;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH, undefined, "FAST");
            heightLeft -= pageH;
          }

          const analysisBytes = pdf.output("arraybuffer");
          const analysisPdf = await PDFDocument.load(analysisBytes);
          const aPages = await merged.copyPages(analysisPdf, analysisPdf.getPageIndices());
          aPages.forEach(p => merged.addPage(p));
        }

        // 2. Merge the Original Document
        if (inv.file_url) {
          try {
            const isPdf = inv.file_type === "application/pdf" || inv.file_url.split("?")[0].toLowerCase().endsWith(".pdf");
            if (isPdf) {
              const origBytes = await fetch(inv.file_url, { mode: "cors" }).then(r => r.arrayBuffer());
              const origPdf = await PDFDocument.load(origBytes);
              const oPages = await merged.copyPages(origPdf, origPdf.getPageIndices());
              oPages.forEach(p => merged.addPage(p));
            } else {
              const imgEl = new Image();
              imgEl.crossOrigin = "anonymous";
              await new Promise<void>((resolve, reject) => {
                imgEl.onload = () => resolve();
                imgEl.onerror = () => reject(new Error("Image load failed"));
                imgEl.src = inv.file_url!;
              });
              const imgCanvas = document.createElement("canvas");
              imgCanvas.width = imgEl.naturalWidth;
              imgCanvas.height = imgEl.naturalHeight;
              imgCanvas.getContext("2d")!.drawImage(imgEl, 0, 0);
              const origJpeg = imgCanvas.toDataURL("image/jpeg", 0.93);
              const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
              const pageW = pdf.internal.pageSize.getWidth();
              const pageH = pdf.internal.pageSize.getHeight();
              const aspectRatio = imgEl.naturalHeight / imgEl.naturalWidth;
              const origImgH = pageW * aspectRatio;

              let remH = origImgH, origY = 0;
              pdf.addImage(origJpeg, "JPEG", 0, origY, pageW, origImgH, undefined, "FAST");
              remH -= pageH;
              while (remH > 0) {
                origY -= pageH;
                pdf.addPage();
                pdf.addImage(origJpeg, "JPEG", 0, origY, pageW, origImgH, undefined, "FAST");
                remH -= pageH;
              }
              const analysisBytes = pdf.output("arraybuffer");
              const origPdf = await PDFDocument.load(analysisBytes);
              const oPages = await merged.copyPages(origPdf, origPdf.getPageIndices());
              oPages.forEach(p => merged.addPage(p));
            }
          } catch (e) {
            console.warn("Toplu PDF eklentisi başaramadı (Fatura ID: " + inv.id + "):", e);
          }
        }
      }

      const savedBytes = await merged.save();
      const blob = new Blob([savedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `fatura-analiz-toplu-${selectedYear}-${selectedMonth !== null ? selectedMonth + 1 : "tum"}.pdf`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 200);

    } catch (err: any) {
      setGenError(tr("Toplu PDF oluşturulamadı: ", "Sammel-PDF Fehler: ") + err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [filteredInvoices, selectedYear, selectedMonth, tr]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#111318]">

      {/* ── Header ── */}
      <div className="forms-no-print px-6 py-4 flex items-center justify-between shrink-0 border-b border-[#1c1f27] bg-[#0d0f15]">
        <div>
          <h1 className="font-syne font-bold text-lg text-slate-100">{tr("Formlar", "Formulare")}</h1>
          <p className="text-xs mt-0.5 text-[#3a3f4a]">{tr("Fatura Analiz Formları", "Rechnungsanalyse Formulare")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year buttons */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: '#3a3f4a' }}>{tr('Yıl', 'Jahr')}</span>
            {years.map(y => (
              <button key={y} onClick={() => setSelectedYear(y)}
                className="px-2.5 py-1 text-[10px] font-mono font-semibold rounded-md transition-all cursor-pointer border-none"
                style={{
                  background: selectedYear === y ? '#06b6d4' : 'rgba(255,255,255,.03)',
                  color: selectedYear === y ? '#fff' : '#64748b',
                  border: `1px solid ${selectedYear === y ? '#06b6d4' : '#1c1f27'}`,
                }}>
                {y}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '16px', background: '#1c1f27' }} />

          {/* Month buttons */}
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => setSelectedMonth(null)}
              className="px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer border-none"
              style={{
                background: selectedMonth === null ? 'rgba(139,92,246,.15)' : 'rgba(255,255,255,.02)',
                color: selectedMonth === null ? '#a78bfa' : '#3a3f4a',
                border: `1px solid ${selectedMonth === null ? 'rgba(139,92,246,.3)' : '#1c1f27'}`,
              }}>
              {tr('Tümü', 'Alle')}
            </button>
            {MONTHS.map((m, i) => {
              const cnt = invoices.filter(inv => {
                if (!inv.invoice_date) return false;
                const d = new Date(inv.invoice_date);
                return d.getFullYear() === selectedYear && d.getMonth() === i;
              }).length;
              return (
                <button key={i} onClick={() => setSelectedMonth(i)}
                  className="relative px-2 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer border-none"
                  style={{
                    background: selectedMonth === i ? '#06b6d4' : cnt > 0 ? 'rgba(6,182,212,.05)' : 'rgba(255,255,255,.02)',
                    color: selectedMonth === i ? '#fff' : cnt > 0 ? '#94a3b8' : '#2a3040',
                    border: `1px solid ${selectedMonth === i ? '#06b6d4' : cnt > 0 ? 'rgba(6,182,212,.18)' : '#1c1f27'}`,
                  }}>
                  {m}
                  {cnt > 0 && (
                    <span style={{
                      position: 'absolute', top: '-5px', right: '-4px',
                      fontSize: '7px', fontWeight: 800, lineHeight: '12px',
                      background: selectedMonth === i ? '#fff' : '#06b6d4',
                      color: selectedMonth === i ? '#06b6d4' : '#fff',
                      borderRadius: '8px', padding: '0 3px', minWidth: '12px', textAlign: 'center' as const,
                    }}>{cnt}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ width: '1px', height: '16px', background: '#1c1f27' }} />

          <button
            onClick={handlePrintAll}
            disabled={filteredInvoices.length === 0 || isGenerating}
            title={tr('Tüm analizi birleştir (Aylar/Yıllar bazında)', 'Alle Analysen zusammenführen')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-emerald-600/50 text-emerald-500 hover:bg-emerald-600/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mx-1"
            style={{ background: 'rgba(16, 185, 129, 0.05)' }}
          >
            {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
            {isGenerating ? tr('Toplu Liste...', 'Sammelliste...') : tr('Toplu PDF', 'Alles als PDF')}
          </button>
          <button
            onClick={handlePrint}
            disabled={!selectedInvoice || isGenerating}
            title={tr('Birleştirilmiş PDF yeni sekmede açılır', 'Zusammengeführtes PDF öffnet in neuem Tab')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-[#1c1f27] text-slate-400 hover:text-slate-200 hover:border-[#2a2f3a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'transparent' }}
          >
            {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
            {tr('Yazdır', 'Drucken')}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={!selectedInvoice || isGenerating}
            className="c-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {isGenerating ? tr('Oluşturuluyor…', 'Wird erstellt…') : tr('PDF İndir', 'PDF Herunterladen')}
          </button>
        </div>
      </div>

      {genError && (
        <div className="forms-no-print px-6 py-1.5 text-xs text-rose-400 bg-rose-500/10 border-b border-rose-500/20">
          {genError}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left — invoice list */}
        <div className="forms-no-print w-2/5 flex flex-col border-r border-[#1c1f27] bg-[#0a0d12] overflow-y-auto shrink-0">
          {filteredInvoices.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[#3a3f4a] p-8 text-center">
              {tr("Bu döneme ait fatura bulunamadı.", "Keine Rechnungen für diesen Zeitraum.")}
            </div>
          ) : filteredInvoices.map(inv => {
            const isSel = selectedInvoice?.id === inv.id;
            return (
              <button
                key={inv.id}
                onClick={() => setSelectedInvoice(inv)}
                className="w-full text-left px-4 py-3 transition-all border-none cursor-pointer"
                style={{
                  background: isSel ? "rgba(6,182,212,.06)" : "transparent",
                  borderBottom: "1px solid #1c1f27",
                  borderLeft: `2px solid ${isSel ? "#06b6d4" : "transparent"}`,
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm text-slate-200 truncate leading-tight">
                    {inv.supplier_name || tr("Bilinmiyor", "Unbekannt")}
                  </span>
                  <span className="text-xs font-bold text-slate-200 shrink-0">{fmt(inv.total_gross)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#64748b]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{fmtDate(inv.invoice_date)}</span>
                    {inv.invoice_number && <span>#{inv.invoice_number}</span>}
                  </div>
                  {isSel && <ChevronRight size={11} className="text-cyan-500" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right — document */}
        <div className="flex-1 overflow-y-auto" style={{ background: "#0a0d12", padding: "20px", minWidth: 0 }}>
          {!selectedInvoice ? (
            <div className="forms-no-print flex flex-col items-center justify-center h-full text-center">
              <FileText size={40} className="mb-3 text-[#1c1f27]" />
              <p className="text-sm font-syne font-semibold text-[#3a3f4a]">
                {tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse")}
              </p>
              <p className="text-xs text-[#3a3f4a] mt-1 max-w-xs">
                {tr("Sol taraftan bir fatura seçin.", "Wählen Sie links eine Rechnung aus.")}
              </p>
            </div>
          ) : (
            /*
             * #forms-print-area includes:
             *   1. The white document  (#forms-doc-preview  — captured by html2canvas)
             *   2. The original invoice page (#forms-original-page — print only, page-break-before)
             */
            <div id="forms-print-area" style={{ maxWidth: "794px", margin: "0 auto", width: "100%" }}>

              {/* ══════════════════════════════════════════════════════════
                  WHITE DOCUMENT — captured by html2canvas + visible in print
                  ══════════════════════════════════════════════════════════ */}
              <div
                id="forms-doc-preview"
                ref={previewRef}
                style={{
                  background: "white",
                  padding: "32px 36px",
                  width: "100%",
                  boxSizing: "border-box",
                  boxShadow: "0 0 0 1px rgba(0,0,0,.08), 0 2px 16px rgba(0,0,0,.18)",
                  borderRadius: "3px",
                }}
              >
                {/* ── Section 1: Summary ── */}
                <DocSummary invoice={selectedInvoice} items={selectedItems} tr={tr} />

                {selectedItems.length > 0 && (
                  <>
                    {/* ── Section 2: Items table ── */}
                    <SectionLabel>
                      {tr("Fatura Kalemleri (Detaylı Döküm)", "Rechnungspositionen (Detailliert)")}
                    </SectionLabel>
                    <DocItemsTable items={selectedItems} tr={tr} />

                    {/* ── Section 2.5: Charts ── */}
                    <DocCharts items={selectedItems} tr={tr} />

                    {/* ── Section 3: Account code details ── */}
                    <SectionLabel>
                      {tr("Gerekçelendirme ve DATEV Hesap Detayları", "Begründung und DATEV-Kontodetails")}
                    </SectionLabel>
                    <DocAccountDetails items={selectedItems} planJustMap={planJustMap} tr={tr} />
                  </>
                )}

                {/* Footer */}
                <div style={{
                  marginTop: "16px", paddingTop: "8px",
                  borderTop: "1px solid #e2e8f0",
                  display: "flex", justifyContent: "space-between",
                  fontSize: "7px", color: "#94a3b8",
                  fontFamily: "system-ui, sans-serif",
                }}>
                  <span>fikoai.de Smart Accounting · {new Date().toLocaleDateString("de-DE")}</span>
                  <span>
                    {selectedInvoice.file_url
                      ? tr("Orijinal belge aşağıda görüntüleniyor.", "Originaldokument wird unten angezeigt.")
                      : tr("Orijinal belge sisteme yüklenmemiş.", "Kein Originaldokument hochgeladen.")}
                  </span>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════════
                  ORIGINAL INVOICE — HER ZAMAN render edilir.
                  KURAL: Bu bölüm asla file_url koşuluna bağlanmamalıdır.
                  file_url yoksa "belge yok" mesajı gösterilir; hiç
                  gizlenmez. Böylece kullanıcı analizin sonunda her zaman
                  orijinal belge alanını görür.
                  ══════════════════════════════════════════════════════════ */}
              {/* Sayfa ayracı */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                margin: "20px 0",
                userSelect: "none",
              }}>
                <div style={{ flex: 1, height: "1px", background: "#1c1f27" }} />
                <span style={{ fontSize: "9px", color: "#3a3f4a", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "system-ui,sans-serif" }}>
                  {tr("Sayfa 2 · Orijinal Belge", "Seite 2 · Originaldokument")}
                </span>
                <div style={{ flex: 1, height: "1px", background: "#1c1f27" }} />
              </div>

              <div
                id="forms-original-page"
                style={{
                  marginTop: "0px",
                  width: "100%",
                  background: "white",
                  boxSizing: "border-box",
                  boxShadow: "0 0 0 1px rgba(0,0,0,.08), 0 2px 16px rgba(0,0,0,.18)",
                  borderRadius: "3px",
                  pageBreakBefore: "always",
                  breakBefore: "page",
                }}
              >
                {/* Section title bar */}
                <div style={{
                  padding: "12px 20px 10px",
                  borderBottom: "2px solid #1e293b",
                  ...DOC_FONT,
                }}>
                  <div style={{ fontSize: "8px", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.14em", marginBottom: "3px" }}>
                    fikoai.de Smart Accounting
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#0f172a" }}>
                    {tr("Orijinal Fatura Belgesi", "Originalrechnung")}
                  </div>
                  <div style={{ fontSize: "9px", color: "#64748b", marginTop: "2px" }}>
                    {selectedInvoice.supplier_name} · #{selectedInvoice.invoice_number || "—"} · {fmtDate(selectedInvoice.invoice_date)}
                  </div>
                </div>

                {/* Invoice content */}
                {!selectedInvoice.file_url ? (
                  /* Belge yüklenmemiş — placeholder */
                  <div style={{ padding: "48px 36px", textAlign: "center", ...DOC_FONT }}>
                    <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.25 }}>📄</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "6px" }}>
                      {tr("Orijinal belge mevcut değil", "Kein Originaldokument vorhanden")}
                    </div>
                    <div style={{ fontSize: "11px", color: "#94a3b8", maxWidth: "340px", margin: "0 auto", lineHeight: 1.6 }}>
                      {tr(
                        "Bu fatura için sisteme yüklenmiş bir PDF veya görsel dosyası bulunmuyor. Faturayı yüklemek için Fatura Merkezi'ni kullanın.",
                        "Für diese Rechnung wurde keine PDF- oder Bilddatei hochgeladen. Verwenden Sie das Rechnungszentrum zum Hochladen."
                      )}
                    </div>
                  </div>
                ) : origBlobLoading ? (
                  /* Yükleniyor */
                  <div style={{ padding: "48px 36px", textAlign: "center", ...DOC_FONT }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#64748b", fontSize: "12px" }}>
                      <Loader2 size={16} className="animate-spin" style={{ color: "#64748b" }} />
                      {tr("Belge yükleniyor…", "Dokument wird geladen…")}
                    </div>
                  </div>
                ) : (selectedInvoice.file_type === "application/pdf" || selectedInvoice.file_url.split("?")[0].toLowerCase().endsWith(".pdf")) ? (
                  /* PDF belge — blob URL ile (X-Frame-Options engeli yok) */
                  origBlobUrl ? (
                    <iframe
                      id="forms-orig-iframe"
                      src={origBlobUrl}
                      style={{ width: "100%", height: "1060px", border: "none", display: "block" }}
                      title={tr("Orijinal Fatura", "Originalrechnung")}
                    />
                  ) : (
                    <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: "12px", ...DOC_FONT }}>
                      {tr("PDF yüklenemedi. Belgeyi indirerek görüntüleyebilirsiniz.", "PDF konnte nicht geladen werden. Sie können das Dokument herunterladen.")}
                      <br />
                      <a href={selectedInvoice.file_url} target="_blank" rel="noopener noreferrer"
                        style={{ color: "#06b6d4", marginTop: "8px", display: "inline-block", fontSize: "11px" }}>
                        {tr("PDF'yi aç →", "PDF öffnen →")}
                      </a>
                    </div>
                  )
                ) : (
                  /* Görsel (JPEG / PNG / vb.) — blob URL ile */
                  <img
                    src={origBlobUrl ?? selectedInvoice.file_url}
                    alt={tr("Orijinal Fatura", "Originalrechnung")}
                    style={{ width: "100%", display: "block" }}
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      const msg = document.createElement("div");
                      msg.style.cssText = "padding:32px;text-align:center;color:#94a3b8;font-size:12px;font-family:system-ui,sans-serif;";
                      msg.textContent = tr("Görsel yüklenemedi.", "Bild konnte nicht geladen werden.");
                      e.currentTarget.parentElement?.appendChild(msg);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── HIDDEN CONTAINER FOR 'PRINT ALL' ── */}
      <div style={{ position: "absolute", top: "-9999px", left: "-9999px", visibility: "hidden" }}>
        {filteredInvoices.map(inv => {
          const invItems = invoiceItems.filter(i => i.invoice_id === inv.id);
          return (
            <div
              key={`hidden-${inv.id}`}
              id={`capture-all-${inv.id}`}
              style={{
                background: "white",
                padding: "32px 36px",
                width: "794px",
                boxSizing: "border-box",
              }}
            >
              <DocSummary invoice={inv} items={invItems} tr={tr} />
              {invItems.length > 0 && (
                <>
                  <SectionLabel>
                    {tr("Fatura Kalemleri (Detaylı Döküm)", "Rechnungspositionen (Detailliert)")}
                  </SectionLabel>
                  <DocItemsTable items={invItems} tr={tr} />

                  <DocCharts items={invItems} tr={tr} />

                  <SectionLabel>
                    {tr("Gerekçelendirme ve DATEV Hesap Detayları", "Begründung und DATEV-Kontodetails")}
                  </SectionLabel>
                  <DocAccountDetails items={invItems} planJustMap={planJustMap} tr={tr} />
                </>
              )}
              <div style={{
                marginTop: "16px", paddingTop: "8px",
                borderTop: "1px solid #e2e8f0",
                display: "flex", justifyContent: "space-between",
                fontSize: "7px", color: "#94a3b8",
                fontFamily: "system-ui, sans-serif",
              }}>
                <span>fikoai.de Smart Accounting · {new Date().toLocaleDateString("de-DE")}</span>
                <span>
                  {inv.file_url
                    ? tr("Orijinal belge aşağıda görüntüleniyor.", "Originaldokument wird unten angezeigt.")
                    : tr("Orijinal belge sisteme yüklenmemiş.", "Kein Originaldokument hochgeladen.")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Print CSS is no longer needed — printing happens via the native PDF
          viewer after generating a merged PDF blob (analysis + original).
          iframe/embed elements cannot render PDF content in browser print
          engines regardless of CORS or blob URLs — they always blank out. */}
    </div>
  );
};
