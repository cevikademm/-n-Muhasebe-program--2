/**
 * exportService.ts
 * DATEV ASCII Buchungsstapel + Excel/CSV dışa aktarma servisi
 * DATEV Format: EXTF v700 / Buchungsstapel Kategorie 21
 */

import { Invoice, InvoiceItem } from "../types";
import { SavedBankStatement, SavedTransaction } from "./bankService";

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcı fonksiyonlar
// ─────────────────────────────────────────────────────────────────────────────

/** Blob dosyası indir */
function download(content: string, filename: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

/** DATEV Belegdatum: DDMM (ohne Jahr — DATEV standard) */
function datevBelegDatum(isoDate: string): string {
  const d = new Date(isoDate);
  return String(d.getDate()).padStart(2, "0") + String(d.getMonth() + 1).padStart(2, "0");
}

/** Almanca ondalık: 1234.56 → "1234,56" */
function deNum(n: number): string {
  return Math.abs(n).toFixed(2).replace(".", ",");
}

/** DATEV metin alanı temizle (max uzunlukta, özel karaktersiz) */
function datevStr(s: string | null | undefined, maxLen = 60): string {
  return (s ?? "").replace(/[";]/g, " ").replace(/\s+/g, " ").trim().substring(0, maxLen);
}

/** Genel CSV hücre kaçışı (BOM + semicolons — Excel DE uyumlu) */
function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(";");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DATEV ASCII Buchungsstapel Export
// Format: DATEV EXTF v700, Kategorie 21
// Referans: DATEV Schnittstellen — DATEV Format 2024
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BU-Schlüssel belirle:
 * SKR03'te gider faturalarında vergi anahtarı:
 *   0 = Normalversteuerung (Brutto, 19 % VSt automatisch)
 *   2 = Normalversteuerung (Brutto, 7 % VSt automatisch)
 *  40 = Steuerfreie Innenumsätze (0 %)
 */
function buSchluessel(vatRate: number | null): string {
  if (vatRate === 19) return "0";
  if (vatRate === 7)  return "2";
  if (vatRate === 0 || vatRate === null) return "40";
  return "0";
}

/**
 * DATEV Buchungsstapel — tam EXTF header + veri satırları.
 * Yalnızca kayıtlı hesap kodu (account_code) olan fatura kalemleri aktarılır.
 * Gegenkonto: 1600 (SKR03 Verbindlichkeiten aus L+L) — standart gider faturası.
 */
export function exportDATEV(
  invoices: Invoice[],
  invoiceItems: InvoiceItem[],
  fiscalYear: number,
  mandantName = "Mandant"
): void {
  const now = new Date();
  // DATEV timestamp: YYYYMMDDHHMMSSXXX (17 haneli)
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0") +
    String(now.getMilliseconds()).padStart(3, "0");

  const fyStart = `${fiscalYear}0101`;
  const fyEnd   = `${fiscalYear}1231`;

  // ── Header Zeile 1 (DATEV Meta) ──────────────────────────────────────────
  // Sütun sayısı ve sırası DATEV spesifikasyonuna göre sabit:
  // EXTF;Versionsnummer;Kategorie;Kategoriename;Formatversion;Erzeugt am;
  // Importiert;Herkunft;;Exportiert von;;Sachkontenrahmen;WJ-Beginn;
  // Sachkontenlänge;Datumvon;Datumbis;Mandant;Beraternummer;Mandantennummer;
  // WKZ;;Derivatskennzeichen;Sachverhalt;Skontosperre;...
  const h1Parts = [
    '"EXTF"',          // Kennzeichen
    "700",             // Versionsnummer
    "21",              // Kategorie 21 = Buchungsstapel
    '"Buchungsstapel"',// Kategoriename
    "5",               // Formatversion
    ts,                // Erzeugt am (YYYYMMDDHHMMSSXXX)
    "",                // Importiert
    '"MuhaSys AI"',    // Herkunft
    "",                // Exportiert (reserved)
    "",                // leer
    "Buchführung und BU-Schlüssel", // SKR-Hinweis
    fyStart,           // WJ-Beginn YYYYMMDD
    "4",               // Sachkontenlänge
    fyStart,           // Datum von
    fyEnd,             // Datum bis
    `"${datevStr(mandantName, 25)}"`, // Mandant
    "12345",           // Beraternummer (Platzhalter)
    "12345",           // Mandantennummer (Platzhalter)
    '"EUR"',           // WKZ (Währung)
    "",                // leer
    "0",               // Derivatskennzeichen
    "0",               // Sachverhalt
    "0",               // Skontosperre
    "0",               // Anwendungsinfo
    "0",               // Anwendungsinfo 2
    "1",               // Festschreibung (0=nein, 1=ja)
    "",                // leer
    '"MuhaSys-Buchungsstapel"', // Stapelname
    "", "", "", "",    // reservierte Felder
  ];
  const header1 = h1Parts.join(";");

  // ── Header Zeile 2 (Spaltenbezeichnungen) ────────────────────────────────
  const header2 = [
    "Umsatz (ohne Soll/Haben-Kz)",
    "Soll/Haben-Kennzeichen",
    "WKZ Umsatz",
    "Kurs",
    "Basis-Umsatz",
    "WKZ Basis-Umsatz",
    "Konto",
    "Gegenkonto (ohne BU-Schlüssel)",
    "BU-Schlüssel",
    "Belegdatum",
    "Belegfeld 1",
    "Belegfeld 2",
    "Skonto",
    "Buchungstext",
    "Postensperre",
    "Diverse Adressnummer",
    "Geschäftspartnerbank",
    "Sachverhalt",
    "Zinssperre",
    "Beleglink",
    "Beleginfo-Art 1",
    "Beleginfo-Inhalt 1",
    "Beleginfo-Art 2",
    "Beleginfo-Inhalt 2",
  ].join(";");

  // ── Veri Satırları ────────────────────────────────────────────────────────
  const rows: string[] = [];

  for (const item of invoiceItems) {
    const inv = invoices.find(i => i.id === item.invoice_id);
    if (!inv?.invoice_date) continue;
    if (new Date(inv.invoice_date).getFullYear() !== fiscalYear) continue;
    if (!item.account_code) continue;

    const net = Math.abs(item.net_amount ?? 0);
    if (net <= 0) continue;

    const buchungstext = datevStr(
      [inv.supplier_name, item.description].filter(Boolean).join(" – "),
      60
    );

    const row = [
      deNum(net),                        // Umsatz (Netto)
      "S",                               // Soll (Aufwand)
      "EUR",                             // WKZ
      "",                                // Kurs
      "",                                // Basis-Umsatz
      "",                                // WKZ Basis
      item.account_code,                 // Konto (SKR03 Aufwandskonto)
      "1600",                            // Gegenkonto (SKR03 Verbindlichkeiten L+L)
      buSchluessel(item.vat_rate),       // BU-Schlüssel
      datevBelegDatum(inv.invoice_date), // Belegdatum DDMM
      datevStr(inv.invoice_number ?? "", 36), // Belegfeld 1
      "",                                // Belegfeld 2
      "",                                // Skonto
      buchungstext,                      // Buchungstext
      "",                                // Postensperre
      "",                                // Diverse Adressnummer
      "",                                // Geschäftspartnerbank
      "",                                // Sachverhalt
      "",                                // Zinssperre
      "",                                // Beleglink
      "Lieferant",                       // Beleginfo-Art 1
      datevStr(inv.supplier_name ?? "", 36), // Beleginfo-Inhalt 1
      "Rechnungsdatum",                  // Beleginfo-Art 2
      inv.invoice_date,                  // Beleginfo-Inhalt 2
    ].join(";");

    rows.push(row);
  }

  if (rows.length === 0) {
    alert(`${fiscalYear} yılına ait hesap kodu atanmış fatura kalemi bulunamadı.`);
    return;
  }

  // DATEV dosyaları Windows-1252 encoding ister ama modern DATEV sürümleri UTF-8 kabul eder.
  // BOM ekliyoruz.
  const content = "\uFEFF" + [header1, header2, ...rows].join("\r\n");
  download(content, `DATEV_Buchungsstapel_${fiscalYear}.csv`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fatura Excel/CSV Dışa Aktarma (iki bölümlü: Özet + Kalemler)
// ─────────────────────────────────────────────────────────────────────────────
export function exportInvoicesCSV(
  invoices: Invoice[],
  invoiceItems: InvoiceItem[],
  lang: string,
  fiscalYear?: number
): void {
  const tr = (a: string, b: string) => lang === "tr" ? a : b;

  const filteredInv = fiscalYear
    ? invoices.filter(i => i.invoice_date && new Date(i.invoice_date).getFullYear() === fiscalYear)
    : invoices;

  // ── BÖLÜM 1: Fatura Özeti ─────────────────────────────────────────────────
  const sumHeader = [
    tr("Fatura No", "Rechnungsnummer"),
    tr("Tedarikçi / Lieferant", "Lieferant"),
    tr("Fatura Tarihi", "Rechnungsdatum"),
    tr("Net Tutar (€)", "Nettobetrag (€)"),
    tr("KDV / MwSt (€)", "MwSt-Betrag (€)"),
    tr("Brüt Tutar (€)", "Bruttobetrag (€)"),
    tr("Durum", "Status"),
    tr("Kalem Sayısı", "Anzahl Positionen"),
    tr("Hesap Kodları", "Konten"),
  ];

  const sumRows = filteredInv.map(inv => {
    const items = invoiceItems.filter(it => it.invoice_id === inv.id);
    const codes = [...new Set(items.map(it => it.account_code).filter(Boolean))].join(", ");
    return [
      inv.invoice_number ?? "",
      inv.supplier_name ?? "",
      inv.invoice_date ?? "",
      deNum(inv.total_net ?? 0),
      deNum(inv.total_vat ?? 0),
      deNum(inv.total_gross ?? 0),
      inv.status ?? "",
      items.length,
      codes,
    ];
  });

  // ── BÖLÜM 2: Fatura Kalemleri ─────────────────────────────────────────────
  const itemHeader = [
    tr("Fatura No", "Rechnungsnummer"),
    tr("Tedarikçi", "Lieferant"),
    tr("Tarih", "Datum"),
    tr("Açıklama", "Beschreibung"),
    tr("Hesap Kodu", "Konto"),
    tr("Hesap Adı", "Kontobezeichnung"),
    tr("Miktar", "Menge"),
    tr("Birim Fiyat (€)", "Einzelpreis (€)"),
    tr("Net (€)", "Netto (€)"),
    tr("KDV %", "USt %"),
    tr("KDV (€)", "USt (€)"),
    tr("Brüt (€)", "Brutto (€)"),
    tr("Gider Türü", "Aufwandstyp"),
    tr("HGB Referans", "HGB-Referenz"),
  ];

  const filteredInvIds = new Set(filteredInv.map(i => i.id));
  const itemRows = invoiceItems
    .filter(it => it.invoice_id && filteredInvIds.has(it.invoice_id))
    .map(it => {
      const inv = invoices.find(i => i.id === it.invoice_id);
      return [
        inv?.invoice_number ?? "",
        inv?.supplier_name ?? "",
        inv?.invoice_date ?? "",
        it.description ?? "",
        it.account_code ?? "",
        it.account_name ?? "",
        it.quantity ?? "",
        deNum(it.unit_price ?? 0),
        deNum(it.net_amount ?? 0),
        it.vat_rate ?? 0,
        deNum(it.vat_amount ?? 0),
        deNum(it.gross_amount ?? 0),
        it.expense_type ?? "",
        it.hgb_reference ?? "",
      ];
    });

  const sections = [
    // Başlık satırı 1
    [`=== ${tr("FATURA ÖZETİ", "RECHNUNGSÜBERSICHT")} ===`],
    sumHeader,
    ...sumRows,
    // Boş ayraç
    [],
    [`=== ${tr("FATURA KALEMLERİ", "RECHNUNGSPOSITIONEN")} ===`],
    itemHeader,
    ...itemRows,
  ];

  const bom = "\uFEFF";
  const csv = bom + sections.map(r => csvRow(r)).join("\r\n");
  const yearSuffix = fiscalYear ? `_${fiscalYear}` : "";
  download(csv, `Rechnungen_Export${yearSuffix}.csv`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Banka Hareketleri Excel/CSV Dışa Aktarma
// ─────────────────────────────────────────────────────────────────────────────
export function exportBankCSV(
  statements: SavedBankStatement[],
  transactionMap: Record<string, SavedTransaction[]>,
  lang: string
): void {
  const tr = (a: string, b: string) => lang === "tr" ? a : b;

  // ── BÖLÜM 1: Ekstre Özeti ─────────────────────────────────────────────────
  const stmtHeader = [
    tr("Banka", "Bank"),
    tr("Hesap No / IBAN", "Kontonummer / IBAN"),
    tr("Dönem", "Zeitraum"),
    tr("Açılış Bakiyesi (€)", "Anfangssaldo (€)"),
    tr("Kapanış Bakiyesi (€)", "Endsaldo (€)"),
    tr("Toplam Gelir (€)", "Gesamteinnahmen (€)"),
    tr("Toplam Gider (€)", "Gesamtausgaben (€)"),
    tr("İşlem Sayısı", "Anzahl Buchungen"),
    tr("Eşleşen", "Zugeordnet"),
    tr("Eşleşmeyen", "Nicht zugeordnet"),
    tr("Dosya", "Datei"),
  ];

  const stmtRows = statements.map(s => {
    const txs = transactionMap[s.id] ?? [];
    const matched = txs.filter(t => !!t.matched_invoice_id).length;
    return [
      s.bank_name ?? "",
      s.account_number ?? "",
      s.period ?? "",
      deNum(s.opening_balance ?? 0),
      deNum(s.closing_balance ?? 0),
      deNum(s.total_income ?? 0),
      deNum(s.total_expense ?? 0),
      txs.length,
      matched,
      txs.length - matched,
      s.file_name ?? "",
    ];
  });

  // ── BÖLÜM 2: Tüm İşlemler ─────────────────────────────────────────────────
  const txHeader = [
    tr("Banka", "Bank"),
    tr("Hesap No", "Kontonummer"),
    tr("Dönem", "Zeitraum"),
    tr("İşlem Tarihi", "Buchungsdatum"),
    tr("Karşı Taraf", "Auftraggeber/Empfänger"),
    tr("Açıklama / Referans", "Verwendungszweck"),
    tr("Referans No", "Referenznummer"),
    tr("Tutar (€)", "Betrag (€)"),
    tr("Tür", "Typ"),
    tr("Eşleşme Durumu", "Zuordnungsstatus"),
    tr("Eşleşen Fatura", "Zugeordnete Rechnung"),
    tr("Eşleşme Puanı", "Matching-Score"),
  ];

  const txRows: (string | number)[][] = [];
  for (const s of statements) {
    const txs = transactionMap[s.id] ?? [];
    for (const tx of txs) {
      txRows.push([
        s.bank_name ?? "",
        s.account_number ?? "",
        s.period ?? "",
        tx.transaction_date ?? "",
        tx.counterpart ?? "",
        tx.description ?? "",
        tx.reference ?? "",
        deNum(Math.abs(tx.amount ?? 0)),
        tx.type === "income"
          ? tr("Gelir", "Einnahme")
          : tr("Gider", "Ausgabe"),
        tx.matched_invoice_id
          ? tr("Eşleşti", "Zugeordnet")
          : tr("Eşleşmedi", "Nicht zugeordnet"),
        tx.matched_invoice_id ?? "",
        tx.match_score ?? "",
      ]);
    }
  }

  const sections = [
    [`=== ${tr("EKSTRE ÖZETİ", "KONTOAUSZUGSÜBERSICHT")} ===`],
    stmtHeader,
    ...stmtRows,
    [],
    [`=== ${tr("TÜM İŞLEMLER", "ALLE BUCHUNGEN")} ===`],
    txHeader,
    ...txRows,
  ];

  const bom = "\uFEFF";
  const csv = bom + sections.map(r => csvRow(r)).join("\r\n");
  download(csv, `Bankbewegungen_Export_${new Date().getFullYear()}.csv`);
}
