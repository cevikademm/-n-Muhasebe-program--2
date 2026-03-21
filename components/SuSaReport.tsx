/**
 * MuhaSys — Summen und Salden Liste (SuSa)
 * DATEV Kanzlei-Rechnungswesen V.14.24 formatında
 * Aylık Hesap Kodları Özet Raporu — Yazdırılabilir
 */
import React, { useMemo, useState, useRef } from "react";
import { useLang } from "../LanguageContext";
import { Invoice, InvoiceItem } from "../types";

interface SuSaReportProps {
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  companyName?: string;
  clientNumber?: string;
  /** MaliMusavirPanel içine gömüldüğünde kendi kontrol/yazdır satırını gizler */
  hideControls?: boolean;
  /** Gömülü modda dışarıdan gelen yıl/ay seçimi */
  initialYear?: number;
  initialMonth?: number; // 1-12
}

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtDE = (n: number): string =>
  Math.abs(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_SHORT_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// ─── Vorsteuer account mapping by VAT rate ────────────────────────────────────
const VAT_ACCOUNT: Record<number, { code: string; name: string }> = {
  19: { code: "1576", name: "Abziehbare Vorsteuer 19%" },
  7: { code: "1571", name: "Abziehbare Vorsteuer 7%" },
  5: { code: "1571", name: "Abziehbare Vorsteuer 5%" },
  16: { code: "1576", name: "Abziehbare Vorsteuer 16%" },
};

// ─── Klassen labels SKR03 ────────────────────────────────────────────────────
const KLASSEN: Record<number, string> = {
  0: "Anlagevermögen und Kapitalkonten",
  1: "Finanz- und Privatkonten",
  2: "Abgrenzungskonten",
  3: "Wareneingang, Roh-, Hilfs- und Betriebsstoffe",
  4: "Betriebliche Aufwendungen",
  5: "Privatanteile",
  6: "Besondere Aufwendungen",
  7: "Besondere Erträge",
  8: "Erlöskonten",
  9: "Vortragskonten, Statistik",
};

// ─── Data types ───────────────────────────────────────────────────────────────
interface SuSaRow {
  kontoNr: string;
  beschriftung: string;
  ebSoll: number;
  ebHaben: number;
  monatSoll: number;
  monatHaben: number;
  kumSoll: number;
  kumHaben: number;
}

interface KlasseGroup {
  klasse: number;
  rows: SuSaRow[];
  sumSoll: number;
  sumHaben: number;
  kumSoll: number;
  kumHaben: number;
  saldo: number;  // positive = S, negative = H
}

// ─── Core computation ─────────────────────────────────────────────────────────
function computeSuSa(
  invoices: Invoice[],
  items: InvoiceItem[],
  selYear: number,
  selMonth: number, // 1-12
): SuSaRow[] {
  // Build invoice lookup
  const invMap = new Map<string, Invoice>();
  invoices.forEach(inv => invMap.set(inv.id, inv));

  const accounts = new Map<string, { name: string; monatSoll: number; monatHaben: number; kumSoll: number; kumHaben: number }>();

  const ensure = (code: string, name: string) => {
    if (!accounts.has(code)) {
      accounts.set(code, { name, monatSoll: 0, monatHaben: 0, kumSoll: 0, kumHaben: 0 });
    }
    return accounts.get(code)!;
  };

  // Track processed invoices for Verbindlichkeiten (1600)
  const monthInvGross = new Map<string, number>(); // invId → gross (monthly)
  const kumInvGross = new Map<string, number>(); // invId → gross (cumulative)

  items.forEach(item => {
    const inv = invMap.get(item.invoice_id);
    if (!inv || !inv.invoice_date || !item.account_code) return;

    const d = new Date(inv.invoice_date);
    const itemYear = d.getFullYear();
    const itemMonth = d.getMonth() + 1; // 1-12

    if (itemYear !== selYear) return;

    const isInMonth = itemMonth === selMonth;
    const isInKum = itemMonth <= selMonth;

    const netAmt = Math.abs(item.net_amount || 0);
    const vatAmt = Math.abs(item.vat_amount || 0);
    const grossAmt = Math.abs(item.gross_amount || 0);

    const acctCode = item.account_code.trim();
    const acctName = item.account_name || acctCode;

    const acc = ensure(acctCode, acctName);

    // Expense/goods accounts → Soll
    if (isInMonth) { acc.monatSoll += netAmt; }
    if (isInKum) { acc.kumSoll += netAmt; }

    // Vorsteuer account → Soll (only if VAT exists and it's not already a tax account)
    const isVatAcct = acctCode.startsWith("157") || acctCode.startsWith("158") || acctCode === "1400" || acctCode === "1401";
    if (!isVatAcct && vatAmt > 0 && item.vat_rate && item.vat_rate > 0) {
      const vatAcctInfo = VAT_ACCOUNT[item.vat_rate];
      if (vatAcctInfo) {
        const va = ensure(vatAcctInfo.code, vatAcctInfo.name);
        if (isInMonth) { va.monatSoll += vatAmt; }
        if (isInKum) { va.kumSoll += vatAmt; }
      }
    }

    // Verbindlichkeiten 1600 → Haben (per invoice, not per item — track uniquely)
    if (grossAmt > 0 && !isVatAcct) {
      const invGross = inv.total_gross || 0;
      if (!monthInvGross.has(inv.id) && isInMonth) {
        monthInvGross.set(inv.id, invGross);
        const verb = ensure("1600", "Verbindlichkeiten aus Lieferungen+Leist.");
        verb.monatHaben += Math.abs(invGross);
      }
      if (!kumInvGross.has(inv.id) && isInKum) {
        kumInvGross.set(inv.id, invGross);
        const verb = ensure("1600", "Verbindlichkeiten aus Lieferungen+Leist.");
        verb.kumHaben += Math.abs(invGross);
      }
    }
  });

  // Convert to sorted array
  const rows: SuSaRow[] = [];
  const sorted = Array.from(accounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  sorted.forEach(([code, data]) => {
    if (data.monatSoll === 0 && data.monatHaben === 0 && data.kumSoll === 0 && data.kumHaben === 0) return;
    rows.push({
      kontoNr: code,
      beschriftung: data.name,
      ebSoll: 0,
      ebHaben: 0,
      monatSoll: data.monatSoll,
      monatHaben: data.monatHaben,
      kumSoll: data.kumSoll,
      kumHaben: data.kumHaben,
    });
  });

  return rows;
}

function groupByKlasse(rows: SuSaRow[]): KlasseGroup[] {
  const map = new Map<number, SuSaRow[]>();
  rows.forEach(r => {
    const k = parseInt(r.kontoNr[0]) || 0;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  });

  const groups: KlasseGroup[] = [];
  Array.from(map.entries()).sort((a, b) => a[0] - b[0]).forEach(([klasse, rows]) => {
    const sumSoll = rows.reduce((s, r) => s + r.monatSoll, 0);
    const sumHaben = rows.reduce((s, r) => s + r.monatHaben, 0);
    const kumSoll = rows.reduce((s, r) => s + r.kumSoll, 0);
    const kumHaben = rows.reduce((s, r) => s + r.kumHaben, 0);
    const saldo = (kumSoll - kumHaben);
    groups.push({ klasse, rows, sumSoll, sumHaben, kumSoll, kumHaben, saldo });
  });
  return groups;
}

// ─── Amount cell component ────────────────────────────────────────────────────
const AmtCell = ({ soll, haben, isScreen }: { soll: number; haben: number; isScreen?: boolean }) => {
  const saldo = soll - haben;
  const isS = saldo >= 0;
  const abs = Math.abs(saldo);
  if (abs < 0.005) return <td className="susa-td-num" style={{ color: isScreen ? "#64748b" : "#999" }}>0,00</td>;
  return (
    <td className="susa-td-num">
      {fmtDE(abs)} {isS ? "S" : "H"}
    </td>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export const SuSaReport: React.FC<SuSaReportProps> = ({
  invoices, invoiceItems, companyName = "", clientNumber = "",
  hideControls = false, initialYear, initialMonth,
}) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;

  const now = new Date();
  const [selYear, setSelYear] = useState(initialYear ?? now.getFullYear());
  const [selMonth, setSelMonth] = useState(initialMonth ?? (now.getMonth() + 1)); // 1-12

  React.useEffect(() => {
    if (initialYear !== undefined) setSelYear(initialYear);
  }, [initialYear]);

  React.useEffect(() => {
    if (initialMonth !== undefined) setSelMonth(initialMonth);
  }, [initialMonth]);

  const [compName, setCompName] = useState(companyName || "");
  const [clientNr, setClientNr] = useState(clientNumber || "");
  const [showZero, setShowZero] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const printDate = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const periodLabel = `${MONTHS_DE[selMonth - 1]} ${selYear}`;
  const periodShort = `${MONTHS_SHORT_DE[selMonth - 1]} ${selYear}`;

  // Compute SuSa data
  const rows = useMemo(() => computeSuSa(invoices, invoiceItems, selYear, selMonth), [invoices, invoiceItems, selYear, selMonth]);
  const groups = useMemo(() => groupByKlasse(rows), [rows]);

  const totalSoll = groups.reduce((s, g) => s + g.sumSoll, 0);
  const totalHaben = groups.reduce((s, g) => s + g.sumHaben, 0);
  const totalKumS = groups.reduce((s, g) => s + g.kumSoll, 0);
  const totalKumH = groups.reduce((s, g) => s + g.kumHaben, 0);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const handlePrint = () => {
    window.print();
  };

  if (rows.length === 0 && invoiceItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: "#3a3f4a" }}>
        <div className="font-mono text-4xl mb-4" style={{ color: "#1c1f27" }}>≡</div>
        <p className="font-syne font-semibold text-slate-400 mb-1">
          {tr("Gösterilecek veri yok", "Keine Daten vorhanden")}
        </p>
        <p className="text-xs">{tr("Önce fatura yükleyin ve AI analizi çalıştırın", "Bitte Rechnungen hochladen und KI-Analyse starten")}</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Print CSS (only applies when printing) ── */}
      <style>{`
        ${!hideControls ? `@page { size: A4 landscape; margin: 0; }` : ''}

        @media print {
          ${!hideControls ? `
          body > * { display: none !important; }
          .susa-print-root { display: block !important; }

          .susa-print-root {
            position: fixed !important;
            inset: 0 !important;
            background: white !important;
            color: black !important;
            font-family: 'Courier New', Courier, monospace !important;
            font-size: 7pt !important;
            z-index: 99999 !important;
            padding: 8mm 10mm !important;
            overflow: visible !important;
          }
          .susa-blatt { position: fixed !important; top: 8mm !important; right: 10mm !important; font-size: 7pt !important; }
          ` : `
          .susa-print-root {
             background: white !important;
             color: black !important;
             font-family: 'Courier New', Courier, monospace !important;
             font-size: 7pt !important;
          }
          `}

          .susa-header   { font-size: 7pt !important; margin-bottom: 4mm !important; }
          .susa-title    { font-size: 9pt !important; font-weight: bold !important; }
          .susa-subtitle { font-size: 7.5pt !important; }
          .susa-table    { width: 100% !important; border-collapse: collapse !important; font-size: 6.5pt !important; }
          .susa-th       { border-top: 1pt solid black !important; border-bottom: 1pt solid black !important; padding: 1mm 1.5mm !important; text-align: right !important; font-weight: bold !important; white-space: nowrap !important; background: white !important; color: black !important; }
          .susa-th-left  { text-align: left !important; }
          .susa-td       { padding: 0.5mm 1.5mm !important; border-bottom: 0.3pt solid #ccc !important; color: black !important; }
          .susa-td-num   { padding: 0.5mm 1.5mm !important; text-align: right !important; white-space: nowrap !important; font-family: 'Courier New', monospace !important; color: black !important; border-bottom: 0.3pt solid #ccc !important; }
          .susa-klasse-row td { font-weight: bold !important; border-top: 0.5pt solid black !important; border-bottom: 0.5pt solid black !important; background: white !important; color: black !important; padding: 1mm 1.5mm !important; }
          .susa-total-row td  { font-weight: bold !important; border-top: 1pt solid black !important; border-bottom: 1.5pt double black !important; padding: 1mm 1.5mm !important; color: black !important; }
          .susa-footer   { margin-top: 6mm !important; font-size: 6.5pt !important; border-top: 0.5pt solid black !important; padding-top: 2mm !important; color: black !important; }
          .susa-screen-only { display: none !important; }
          .susa-no-print { display: none !important; }
        }

        @media screen {
          .susa-print-root { 
            display: block; 
            background: white; 
            padding: 24px; 
            border-radius: 8px; 
            overflow-x: auto;
            color: black;
          }
        }

        .susa-td-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .susa-td     { vertical-align: top; }
        .susa-th     { text-align: right; white-space: nowrap; }
        .susa-th-left { text-align: left; }
      `}</style>

      {/* ── Screen controls ── */}
      <div className="susa-no-print flex flex-wrap items-center gap-3 mb-5" style={hideControls ? { display: "none" } : undefined}>
        {/* Year */}
        <div>
          <div className="c-label mb-1">{tr("Yıl", "Jahr")}</div>
          <select className="c-input text-xs font-mono" value={selYear} onChange={e => setSelYear(+e.target.value)}
            style={{ padding: "6px 10px", width: "80px" }}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        {/* Month */}
        <div>
          <div className="c-label mb-1">{tr("Ay", "Monat")}</div>
          <select className="c-input text-xs" value={selMonth} onChange={e => setSelMonth(+e.target.value)}
            style={{ padding: "6px 10px", width: "130px" }}>
            {MONTHS_DE.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        {/* Company */}
        <div className="flex-1 min-w-[160px]">
          <div className="c-label mb-1">{tr("Şirket Adı", "Firmenname")}</div>
          <input className="c-input text-xs" value={compName} onChange={e => setCompName(e.target.value)}
            placeholder="Metehan Cevik" style={{ padding: "6px 10px" }} />
        </div>
        {/* Client nr */}
        <div>
          <div className="c-label mb-1">{tr("Müşteri No", "Mandant")}</div>
          <input className="c-input text-xs font-mono" value={clientNr} onChange={e => setClientNr(e.target.value)}
            placeholder="354599/1582" style={{ padding: "6px 10px", width: "130px" }} />
        </div>
        {/* Show zero toggle */}
        <div className="flex items-center gap-2 mt-4">
          <input type="checkbox" id="showZero" checked={showZero} onChange={e => setShowZero(e.target.checked)}
            className="cursor-pointer" />
          <label htmlFor="showZero" className="text-xs cursor-pointer" style={{ color: "#64748b" }}>
            {tr("Sıfır bakiyeleri göster", "Nullsalden anzeigen")}
          </label>
        </div>
        {/* Print button */}
        <button onClick={handlePrint}
          className="c-btn-primary px-5 py-2 text-xs rounded-md flex items-center gap-2 mt-4"
          style={{ background: "rgba(6,182,212,.15)", color: "#06b6d4", border: "1px solid rgba(6,182,212,.3)" }}>
          <span className="font-mono">⎙</span>
          {tr("Yazdır / PDF", "Drucken / PDF")}
        </button>
      </div>

      {/* ════════════════════════════════════════════
          PRINT-READY DOCUMENT
      ════════════════════════════════════════════ */}
      <div ref={printRef} className="susa-print-root">

        {/* ── Blatt (top right) ── */}
        {!hideControls && (
          <div className="susa-blatt" style={{
            position: "absolute", top: "8mm", right: "10mm",
            fontFamily: "'Courier New', monospace", fontSize: "7pt", color: "black", textAlign: "right",
          }}>
            <div>{printDate}</div>
            <div>Blatt 1</div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="susa-header" style={{
          fontFamily: "'Courier New', monospace", color: "black",
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "2mm", marginBottom: "5mm",
        }}>
          {/* Left */}
          <div>
            <div style={{ fontSize: "7pt" }}>{clientNr || "354599/1582/2025"}</div>
            <div style={{ fontSize: "8pt", fontWeight: "bold" }}>{compName || "—"}</div>
          </div>
          {/* Center */}
          <div style={{ textAlign: "center" }}>
            <div className="susa-title" style={{ fontFamily: "'Courier New', monospace", fontWeight: "bold", fontSize: "9pt" }}>
              Kanzlei-Rechnungswesen V.14.24
            </div>
            <div className="susa-subtitle" style={{ fontSize: "7.5pt" }}>
              Summen und Salden (pro Monat)
            </div>
            <div style={{ fontSize: "7pt" }}>Sachkonten</div>
          </div>
          {/* Period top right (visible on screen, hidden when absolute positioned on print) */}
          <div className="susa-screen-only" />
        </div>

        {/* ── Period line ── */}
        <div style={{
          fontFamily: "'Courier New', monospace", fontSize: "7.5pt", color: "black",
          borderTop: "0.5pt solid black", borderBottom: "0.5pt solid black",
          padding: "1mm 0", marginBottom: "3mm",
          display: "flex", justifyContent: "space-between",
        }}>
          <span><b>Zeitraum:</b> {periodLabel}</span>
          <span><b>Auswertung:</b> Summen und Salden (pro Monat)</span>
          <span><b>Status:</b> Stand der Buchführung</span>
        </div>

        {/* ════ TABLE ════ */}
        <table className="susa-table" style={{
          width: "100%", borderCollapse: "collapse",
          fontFamily: "'Courier New', monospace", fontSize: "6.5pt", color: "black",
        }}>
          {/* HEAD */}
          <thead>
            <tr>
              <th className="susa-th susa-th-left" style={{ width: "45mm", paddingLeft: "1.5mm", borderTop: "1pt solid black", borderBottom: "1pt solid black", background: "white", textAlign: "left", fontWeight: "bold" }}>
                Konto Beschriftung
              </th>
              <th className="susa-th" style={{ width: "20mm", borderTop: "1pt solid black", borderBottom: "1pt solid black", background: "white" }}>
                EB-Wert
              </th>
              <th className="susa-th" style={{ width: "18mm", borderTop: "1pt solid black", borderBottom: "1pt solid black", background: "white" }}>
                {periodShort} Soll
              </th>
              <th className="susa-th" style={{ width: "18mm", borderTop: "1pt solid black", borderBottom: "1pt solid black", background: "white" }}>
                {periodShort} Haben
              </th>
              <th className="susa-th" style={{ width: "20mm", borderTop: "1pt solid black", borderBottom: "1pt solid black", background: "white" }}>
                kum. Werte Soll
              </th>
              <th className="susa-th" style={{ width: "20mm", borderTop: "1pt solid black", borderBottom: "1pt solid black", background: "white" }}>
                kum. Werte Haben
              </th>
              <th className="susa-th" style={{ width: "20mm", borderTop: "1pt solid black", borderBottom: "1pt solid black", background: "white" }}>
                Saldo
              </th>
            </tr>
          </thead>

          <tbody>
            {groups.map(group => {
              const visibleRows = showZero
                ? group.rows
                : group.rows.filter(r => r.monatSoll > 0 || r.monatHaben > 0 || r.kumSoll > 0 || r.kumHaben > 0);

              return (
                <React.Fragment key={group.klasse}>
                  {/* Account rows */}
                  {visibleRows.map(row => {
                    const saldo = row.kumSoll - row.kumHaben;
                    const isS = saldo >= 0;
                    const saldoAbs = Math.abs(saldo);
                    const ebSaldo = row.ebSoll - row.ebHaben;
                    const ebAbs = Math.abs(ebSaldo);

                    return (
                      <tr key={row.kontoNr}
                        style={{ borderBottom: "0.3pt solid #ccc" }}
                        onMouseEnter={e => {
                          Array.from((e.currentTarget as HTMLTableRowElement).cells).forEach(
                            c => { (c as HTMLTableCellElement).style.background = "rgba(6,182,212,.06)"; }
                          );
                        }}
                        onMouseLeave={e => {
                          Array.from((e.currentTarget as HTMLTableRowElement).cells).forEach(
                            c => { (c as HTMLTableCellElement).style.background = "transparent"; }
                          );
                        }}
                      >
                        {/* Account nr + name */}
                        <td className="susa-td" style={{ paddingLeft: "2mm" }}>
                          <span style={{ fontWeight: "bold", marginRight: "2mm", display: "inline-block", minWidth: "10mm" }}>
                            {row.kontoNr}
                          </span>
                          <span>{row.beschriftung}</span>
                        </td>

                        {/* EB-Wert */}
                        <td className="susa-td-num" style={{ color: ebAbs === 0 ? "#aaa" : undefined }}>
                          {ebAbs === 0 ? "0,00" : `${fmtDE(ebAbs)} ${ebSaldo >= 0 ? "S" : "H"}`}
                        </td>

                        {/* Monat Soll */}
                        <td className="susa-td-num">
                          {row.monatSoll > 0 ? fmtDE(row.monatSoll) : ""}
                        </td>

                        {/* Monat Haben */}
                        <td className="susa-td-num">
                          {row.monatHaben > 0 ? fmtDE(row.monatHaben) : ""}
                        </td>

                        {/* kum. Soll */}
                        <td className="susa-td-num">
                          {row.kumSoll > 0 ? fmtDE(row.kumSoll) : ""}
                        </td>

                        {/* kum. Haben */}
                        <td className="susa-td-num">
                          {row.kumHaben > 0 ? fmtDE(row.kumHaben) : ""}
                        </td>

                        {/* Saldo */}
                        <td className="susa-td-num" style={{ fontWeight: "bold" }}>
                          {saldoAbs < 0.005 ? "0,00" : `${fmtDE(saldoAbs)} ${isS ? "S" : "H"}`}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Klasse subtotal row */}
                  {visibleRows.length > 0 && (
                    <tr className="susa-klasse-row" style={{
                      borderTop: "0.5pt solid black", borderBottom: "0.5pt solid black",
                      fontWeight: "bold",
                    }}>
                      <td className="susa-td" style={{
                        paddingLeft: "2mm", paddingTop: "1.5mm", paddingBottom: "1.5mm",
                        fontWeight: "bold",
                      }}>
                        Summe Klasse {group.klasse}
                      </td>
                      {/* EB */}
                      <td className="susa-td-num" />
                      {/* Monat Soll */}
                      <td className="susa-td-num">{group.sumSoll > 0 ? fmtDE(group.sumSoll) : ""}</td>
                      {/* Monat Haben */}
                      <td className="susa-td-num">{group.sumHaben > 0 ? fmtDE(group.sumHaben) : ""}</td>
                      {/* kum. Soll */}
                      <td className="susa-td-num">{group.kumSoll > 0 ? fmtDE(group.kumSoll) : ""}</td>
                      {/* kum. Haben */}
                      <td className="susa-td-num">{group.kumHaben > 0 ? fmtDE(group.kumHaben) : ""}</td>
                      {/* Saldo */}
                      <td className="susa-td-num" style={{ fontWeight: "bold" }}>
                        {Math.abs(group.saldo) < 0.005 ? "0,00"
                          : `${fmtDE(Math.abs(group.saldo))} ${group.saldo >= 0 ? "S" : "H"}`}
                      </td>
                    </tr>
                  )}

                  {/* Spacer between Klassen */}
                  {visibleRows.length > 0 && <tr><td colSpan={7} style={{ height: "2mm" }} /></tr>}
                </React.Fragment>
              );
            })}

            {/* ─── Grand total ─── */}
            <tr className="susa-total-row" style={{
              borderTop: "1pt solid black",
              fontWeight: "bold",
            }}>
              <td className="susa-td" style={{ paddingLeft: "2mm", paddingTop: "2mm", paddingBottom: "2mm", fontWeight: "bold" }}>
                Summe Sachkonten
              </td>
              <td className="susa-td-num" />
              <td className="susa-td-num">{totalSoll > 0 ? fmtDE(totalSoll) : ""}</td>
              <td className="susa-td-num">{totalHaben > 0 ? fmtDE(totalHaben) : ""}</td>
              <td className="susa-td-num">{totalKumS > 0 ? fmtDE(totalKumS) : ""}</td>
              <td className="susa-td-num">{totalKumH > 0 ? fmtDE(totalKumH) : ""}</td>
              <td className="susa-td-num" style={{ fontWeight: "bold" }}>
                {(() => {
                  const s = totalKumS - totalKumH;
                  return Math.abs(s) < 0.005 ? "0,00" : `${fmtDE(Math.abs(s))} ${s >= 0 ? "S" : "H"}`;
                })()}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Footer ── */}
        <div className="susa-footer" style={{
          marginTop: "8mm",
          borderTop: "0.5pt solid black",
          paddingTop: "2mm",
          fontFamily: "'Courier New', monospace",
          fontSize: "6.5pt",
          color: "black",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>Die Auswertung entspricht dem derzeitigen Stand der Buchführung.</span>
          <span>Status {selYear}*FBE &nbsp; Werte in: EUR</span>
        </div>

        {/* ── Screen: data summary ── */}
        <div className="susa-screen-only susa-no-print"
          style={{ marginTop: "12px", fontSize: "10px", color: "#3a3f4a" }}>
          {rows.length} {tr("hesap kodu", "Konten")} · {tr("Dönem", "Zeitraum")}: {periodLabel}
        </div>
      </div>
    </>
  );
};
