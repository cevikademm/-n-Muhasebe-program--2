import * as pdfjsLib from 'pdfjs-dist';
import { BankStatement, BankTransaction } from './bankService';

// Vite worker setup for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const KATEGORI_MAP: Record<string, [string, string]> = {
  "ECHTZEITGUTSCHRIFT": ["Havale (Gelen)", "Gutschrift (Eingehend)"],
  "GUTSCHRIFT": ["Havale (Gelen)", "Gutschrift (Eingehend)"],
  "ECHTZEITÜBERWEISUNG": ["Havale (Giden)", "Echtzeitüberweisung (Ausgehend)"],
  "SEPALASTSCHRIFT": ["Otomatik Ödeme", "SEPA-Lastschrift"],
  "NFCKARTENZAHLUNG": ["Kart Ödemesi (NFC)", "Kartenzahlung (NFC)"],
  "KARTENZAHLUNGMITPIN": ["Kart Ödemesi (PIN)", "Kartenzahlung (PIN)"],
  "KARTENEINSATZ": ["Online Kart Ödemesi", "Online Kartenzahlung"],
  "RESERV.BETRAG": ["Rezervasyon", "Reservierter Betrag"],
  "GEBÜHR": ["Banka Ücreti", "Bankgebühr"],
  "ANFANGSSALDO": ["Açılış Bakiyesi", "Anfangssaldo"],
  "ABSCHLUSS": ["Dönem Kapanışı", "Abschluss"],
  "GRUNDGEBÜHR": ["Temel Ücret", "Grundgebühr"],
  "REDUZIERTE": ["İndirimli Ücret", "Reduzierte Gebühr"],
  "AUSLANDSEINSATZ": ["Yurtdışı İşlem Ücreti", "Auslandseinsatz"],
  "DAUERAUFTRAG": ["Düzenli Ödeme", "Dauerauftrag"],
};

function parseGermanNumber(s: string | undefined): number {
  if (!s) return 0.0;
  const cleaned = s.trim().replace(/\./g, "").replace(/,/g, ".");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0.0 : val;
}

function kategorize(desc: string): [string, string] {
  const upper = desc.toUpperCase();
  for (const [key, [catTr, catDe]] of Object.entries(KATEGORI_MAP)) {
    if (upper.includes(key)) {
      return [catTr, catDe];
    }
  }
  return ["Diğer", "Sonstige"];
}

function extractDescriptionDetails(lines: string[], startIdx: number): string {
  const details: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^\d{2}\.\d{2}\s+\w{2}\s+/.test(line)) break; // Yeni işlem
    if (!line || line.includes("TARGOBANK") || line.includes("Seite")) break;
    details.push(line);
  }
  return details.join(" ");
}

export async function analyzeBankStatementLocal(
  fileBase64: string
): Promise<BankStatement> {
  const binaryString = window.atob(fileBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    
    // Fallback if formatting is completely lost in standard join, use the heuristic approach from python
    // Actually, PDF.js getTextContent returns multiple strings per line.
    // A better approach to reconstruct lines is to use position data.
    // Luckily, simple join spaces might work, but to preserve newlines precisely:
    const items = textContent.items as any[];
    
    // Group by Y (baseline) rounding to nearest 3 to handle slight shifts
    const groupedLines: Record<number, any[]> = {};
    for (const item of items) {
       const y = Math.round(item.transform[5] / 3) * 3;
       if (!groupedLines[y]) groupedLines[y] = [];
       groupedLines[y].push(item);
    }

    // Sort Y descending (top to bottom)
    const sortedY = Object.keys(groupedLines).map(Number).sort((a, b) => b - a);
    
    const linesArr: string[] = [];
    for (const y of sortedY) {
       // Sort X ascending (left to right)
       const lineItems = groupedLines[y].sort((a: any, b: any) => a.transform[4] - b.transform[4]);
       const lineStr = lineItems.map((i: any) => i.str).join(" ").replace(/\s+/g, ' ').trim();
       if (lineStr) {
           linesArr.push(lineStr);
       }
    }
    
    // Sort array based on the document reading flow if needed, but standard sequential iteration is mostly fine.
    // Let's use the `linesArr` joined by newline to mimic Python's output.
    fullText += linesArr.join("\n") + "\n";
  }

  // ── Dönem Yıl Tespiti ──
  let year = 2025;
  const yearMatch = fullText.match(/vom\s+\d{2}\.\d{2}\.(\d{4})/i);
  if (yearMatch) year = parseInt(yearMatch[1], 10);
  
  let period = "Bilinmiyor";
  const periodMatch = fullText.match(/vom\s+([\d.]+)\s*-\s*([\d.]+)/i);
  if (periodMatch) period = `${periodMatch[1]} - ${periodMatch[2]}`;

  const lines = fullText.split('\n').filter(l => l.trim() !== "");
  const transactions: BankTransaction[] = [];
  let prevBalance: number | null = null;
  
  let openingBalance = 0;
  let closingBalance = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // DD.MM TAG AÇIKLAMA [TUTAR1] [TUTAR2]
    // Regex matches the start line
    const match = line.match(/^(\d{2}\.\d{2})\s+(\w{2})\s+(.+?)(?:\s+([\d.]+,\d{2}))(?:\s+([\d.]+,\d{2}))?$/);
    if (!match) continue;

    const datum = match[1];
    const tag = match[2];
    const buchungstext = match[3].trim();
    const num1 = match[4];
    const num2 = match[5];

    const amount1 = parseGermanNumber(num1);
    const amount2 = num2 ? parseGermanNumber(num2) : null;

    const details = extractDescriptionDetails(lines, i);
    const [dayStr, monthStr] = datum.split(".");
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const dateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    let balance = amount1;
    let tutar = 0;

    if (buchungstext.toUpperCase().includes("ANFANGSSALDO")) {
      balance = amount1;
      openingBalance = balance;
      prevBalance = balance;
      continue; // Skip adding to transactions list
    }

    if (amount2 !== null) {
      tutar = amount1;
      balance = amount2;
    } else {
      balance = amount1;
      tutar = 0; 
    }

    let tur: "income" | "expense" | "info" = "info";

    if (prevBalance !== null && tutar > 0) {
      if (Math.abs(prevBalance + tutar - balance) < 0.05) {
        tur = "income";
      } else if (Math.abs((prevBalance - tutar) - balance) < 0.05) {
        tur = "expense";
      } else if (Math.abs(prevBalance - balance) < 0.05) {
        tur = "info"; // Rezervasyon
      } else {
        const diff = balance - prevBalance;
        if (diff > 0) { tur = "income"; tutar = diff; }
        else { tur = "expense"; tutar = Math.abs(diff); }
      }
    } else if (tutar === 0 && prevBalance !== null) {
      const diff = balance - prevBalance;
      if (Math.abs(diff) < 0.01) tur = "info";
      else if (diff > 0) { tur = "income"; tutar = diff; }
      else { tur = "expense"; tutar = Math.abs(diff); }
    }

    const [categoryTr, categoryDe] = kategorize(buchungstext);
    const fullDesc = details ? `${buchungstext} ${details}` : buchungstext;

    if (tur === "income") totalIncome += tutar;
    if (tur === "expense") totalExpense += tutar;

    // Reject RESERVations, as per existing Edge Function logic
    if (/RESERV|VORMERK|PREAUTH|BLOKAJ/i.test(fullDesc)) {
       prevBalance = balance;
       closingBalance = balance;
       continue;
    }

    if (tur === "income" || tur === "expense") {
      transactions.push({
        id: `tx_${transactions.length}_${Date.now()}`,
        date: dateIso,
        description: fullDesc,
        amount: tutar,
        type: tur,
        reference: details,
        counterpart: buchungstext,
        category: categoryDe,
        category_tr: categoryTr,
        balance: balance
      });
    }

    prevBalance = balance;
    closingBalance = balance;
  }

  return {
    period,
    accountNumber: "TRG-PDF-LOCAL",
    bankName: "TARGOBANK (Local)",
    openingBalance,
    closingBalance,
    totalIncome,
    totalExpense,
    transactions
  };
}
