import fs from 'fs';
import path from 'path';

const text = fs.readFileSync(path.join(process.cwd(), 'ocr_results.txt'), 'utf8');
const lines = text.split('\n');

// Account map: code -> { name, funktion, abschlusszweck }
const accountMap = new Map();

// ===== FUNCTION PREFIX DEFINITIONS =====
// Zusatzfunktionen (range-based, above a Kontenklasse):
//   KU = Keine Errechnung der Umsatzsteuer möglich
//   V  = Zusatzfunktion "Vorsteuer"
//   M  = Zusatzfunktion "Umsatzsteuer"
// Hauptfunktionen (before individual account):
//   AV = Automatische Errechnung der Vorsteuer
//   AM = Automatische Errechnung der Umsatzsteuer
//   S  = Sammelkonten
//   F  = Konten mit allgemeiner Funktion
//   R  = Reserviert (erst nach Funktionszuteilung bebuchbar)
// Abschlusszweck:
//   [HB]  = Nur Handelsbilanz
//   [SB]  = Nur Steuerbilanz
//   [EÜR] = Gewinnermittlung nach §4 Abs. 3 EStG

// ===== RANGE-BASED ZUSATZFUNKTIONEN from the headers =====
// These appear at the top of each page as "KU 0600-0800" etc.
const rangeZusatzfunktionen = [];

// ===== REGEX PATTERNS =====
const patterns = [
    /(?:^|\s)(\d{4})\s+([A-ZÄÖÜa-zäöüß][A-Za-zäöüÄÖÜßŞşğĞıİçÇ\s\-,.()/&§%+'´`€$£¥°²³]+)/,
    /^[^\w]*(\d{4})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s\-,.()/&§%+'°²³]+)/,
    /(?:[FRKSMUEÜ$\[\]|]\s*)(\d{4})\s+([A-ZÄÖÜa-zäöüß][A-Za-zäöüÄÖÜß\s\-,.()/&§%+'°²³]+)/,
    /(?:\|\|?\s*)(\d{4})\s+([A-ZÄÖÜa-zäöüß][A-Za-zäöüÄÖÜß\s\-,.()/&§%+'°²³]+)/,
];

const badCodes = new Set([
    '2026', '2025', '2024', '2023',
    '1117', '1174',
]);

function isValidAccountName(name) {
    if (!name || name.length < 2) return false;
    const letterCount = (name.match(/[A-Za-zÄÖÜäöüß]/g) || []).length;
    if (letterCount < 2) return false;
    if (/^(Seite|Art|Nr|Programm|Bilanz|Posten|Abschluss|zweck|Klasse)\s*\d*$/i.test(name)) return false;
    if (/^\d+$/.test(name.trim())) return false;
    return true;
}

function cleanAccountName(name) {
    let cleaned = name
        .replace(/\s*\|\|?\s*$/, '')
        .replace(/\s*Art[\.\-].*$/i, '')
        .replace(/\s*Seite\s*\d+.*$/i, '')
        .replace(/\s*Eigenformular.*$/i, '')
        .replace(/\s*Nachdruck.*$/i, '')
        .replace(/[\s]+$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    cleaned = cleaned.replace(/[|\\\/\s\d]+$/, '').trim();
    cleaned = cleaned.replace(/\s+[^\s]{1}$/, '').trim();
    return cleaned;
}

function addAccount(code, name, funktion, abschlusszweck) {
    if (badCodes.has(code)) return;
    name = cleanAccountName(name);
    if (!isValidAccountName(name)) return;
    if (name.length > 120) {
        name = name.substring(0, 120).replace(/\s+\S*$/, '').trim();
    }

    const existing = accountMap.get(code);
    if (!existing || name.length > existing.name.length) {
        accountMap.set(code, {
            name: name,
            funktion: funktion || (existing ? existing.funktion : ''),
            abschlusszweck: abschlusszweck || (existing ? existing.abschlusszweck : ''),
        });
    } else if (existing && (funktion || abschlusszweck)) {
        // Update funktion/abschlusszweck even if name is shorter
        if (funktion && !existing.funktion) existing.funktion = funktion;
        if (abschlusszweck && !existing.abschlusszweck) existing.abschlusszweck = abschlusszweck;
    }
}

// ===== PASS 0: Extract range-based Zusatzfunktionen (KU, V, M) from headers =====
for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Match patterns like "KU 0600-0800" or "V 1372" or "M 1710-1712"
    const rangeMatches = [...line.matchAll(/\b(KU|V|M)\s+(\d{4})(?:\s*[-–]\s*(\d{4}))?\b/g)];
    for (const m of rangeMatches) {
        const zusatz = m[1];
        const start = m[2];
        const end = m[3] || start;
        rangeZusatzfunktionen.push({ zusatz, start, end });
    }
}

console.log(`Found ${rangeZusatzfunktionen.length} range-based Zusatzfunktionen.`);

// Function to look up Zusatzfunktion for a code
function getZusatzfunktion(code) {
    for (const r of rangeZusatzfunktionen) {
        if (code >= r.start && code <= r.end) {
            return r.zusatz;
        }
    }
    return '';
}

// ===== PASS 1: Extract accounts with Hauptfunktion prefix =====
for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line.startsWith('--- FILE:')) continue;

    // Pattern: Hauptfunktion prefix (AV, AM, S, F, R) followed by code and name
    // e.g. "F 1000 Kasse" or "AM 8400 Erlöse" or "AV 1571 Abziehbare Vorsteuer"
    // Also "$" prefix which OCR sometimes produces for "S"
    const hauptMatches = [...line.matchAll(/(?:^|[\s|(\[])(?:(\$\s*|AV|AM|[SFRU])\s+)(\d{4})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s\-,.()/&§%+'°²³´`]+)/g)];
    for (const match of hauptMatches) {
        let funktion = match[1].trim();
        const code = match[2];
        let name = match[3];

        // Normalize $ to S
        if (funktion === '$') funktion = 'S';
        // Map single-letter U to special treatment if needed

        addAccount(code, name, funktion, '');
    }

    // Pattern: Abschlusszweck prefix [HB], [SB], [EÜR], [HE], [SE], [ST] followed by code
    // OCR produces many variants: [HE], /HEI, HE], [EOR], [EOR), [se], SE], etc.
    // Pattern A: Standard bracket format
    const abschlussMatches = [...line.matchAll(/[\[\/|(]([A-ZÄÖÜa-zäöü]{2,3})[\])|]\s*[F]?\s*(\d{4})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s\-,.()/&§%+'°²³´`]+)/g)];
    for (const match of abschlussMatches) {
        let abschluss = match[1].toUpperCase();
        const code = match[2];
        let name = match[3];

        // Normalize OCR variants
        if (abschluss === 'HE' || abschluss === 'HEI' || abschluss === 'CHE' || abschluss === 'HB') abschluss = 'HB';
        else if (abschluss === 'SE' || abschluss === 'E73' || abschluss === 'ST' || abschluss === 'STI' || abschluss === 'SB') abschluss = 'SB';
        else if (abschluss === 'EUR' || abschluss === 'EOR' || abschluss === 'E0R' || abschluss === 'FÜR' || abschluss === 'EÜR') abschluss = 'EÜR';
        else continue; // Not a known Abschlusszweck

        addAccount(code, name, '', abschluss);
    }

    // Pattern B: Broken bracket variants like "HE] (0854" or "/HEI 0046"
    const abschlussMatches2 = [...line.matchAll(/(?:^|[\s|])([/]?)(HE|HEI|SE|SB|HB|EOR|EUR|EÜR|E0R|CHE|ST|STI|FÜR)[)\]|\s]*\s*[F]?\s*[(]?(\d{4})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s\-,.()/&§%+'°²³´`]+)/gi)];
    for (const match of abschlussMatches2) {
        let abschluss = match[2].toUpperCase();
        const code = match[3];
        let name = match[4];

        if (abschluss === 'HE' || abschluss === 'HEI' || abschluss === 'CHE' || abschluss === 'HB') abschluss = 'HB';
        else if (abschluss === 'SE' || abschluss === 'E73' || abschluss === 'ST' || abschluss === 'STI' || abschluss === 'SB') abschluss = 'SB';
        else if (abschluss === 'EUR' || abschluss === 'EOR' || abschluss === 'E0R' || abschluss === 'FÜR' || abschluss === 'EÜR') abschluss = 'EÜR';
        else continue;

        addAccount(code, name, '', abschluss);
    }

    // ===== All other extraction patterns (without prefix) =====
    // Global match for codes on this line
    const globalMatch = line.matchAll(/(?:^|[\s|$FRKSMUE\[\]()\-.,;:'"!?{}])(\d{4})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s\-,.()/&§%+'°²³´`]+)/g);
    for (const match of globalMatch) {
        const code = match[1];
        let name = match[2];
        addAccount(code, name, '', '');
    }

    // Two-column OCR: split at code boundaries
    const allCodesOnLine = [...line.matchAll(/(?:^|[^0-9])(\d{4})\s+([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß\s\-,.()/&§%+'°²³´`]*?)(?=\s+\d{4}\s|$)/g)];
    for (const match of allCodesOnLine) {
        const code = match[1];
        let name = match[2];
        addAccount(code, name, '', '');
    }

    // Restlaufzeit sub-accounts
    const restlaufzeitMatches = [...line.matchAll(/(?:^|[^0-9])(\d{4})\s+(-\s*Restlaufzeit[A-Za-zÄÖÜäöüß\s\-,.()/&§%0-9+'°²³]+)/g)];
    for (const match of restlaufzeitMatches) {
        const code = match[1];
        let name = match[2].trim();
        if (badCodes.has(code)) continue;
        name = cleanAccountName(name);
        if (name.length > 120) name = name.substring(0, 120).replace(/\s+\S*$/, '').trim();
        if (name.length > 3 && !accountMap.has(code)) {
            accountMap.set(code, { name, funktion: '', abschlusszweck: '' });
        }
    }

    // Permissive dash-prefixed names
    const permissiveMatches = [...line.matchAll(/(?:^|[^0-9])(\d{4})\s+([\-–][^\d]{3,})/g)];
    for (const match of permissiveMatches) {
        const code = match[1];
        let name = match[2].trim();
        if (badCodes.has(code)) continue;
        name = cleanAccountName(name);
        if (name.length > 120) name = name.substring(0, 120).replace(/\s+\S*$/, '').trim();
        if (name.length > 3 && !accountMap.has(code)) {
            accountMap.set(code, { name, funktion: '', abschlusszweck: '' });
        }
    }

    // Individual patterns
    for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
            addAccount(match[1], match[2], '', '');
        }
    }
}

// ===== PASS 2: Orphan codes (code on its own line, name on next) =====
for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (line.startsWith('--- FILE:')) continue;

    const codeOnlyMatch = line.match(/^[FRKSMUE$|\[\]\s]*(\d{4})\s*$/);
    if (codeOnlyMatch) {
        const code = codeOnlyMatch[1];
        if (badCodes.has(code)) continue;
        if (accountMap.has(code)) continue;

        if (lineIdx + 1 < lines.length) {
            const nextLine = lines[lineIdx + 1].trim();
            if (nextLine && !nextLine.startsWith('---') && /^[A-ZÄÖÜa-zäöüß\-]/.test(nextLine)) {
                const name = cleanAccountName(nextLine);
                if (isValidAccountName(name) && name.length <= 120) {
                    accountMap.set(code, { name, funktion: '', abschlusszweck: '' });
                }
            }
        }
    }

    // R/F-prefixed codes with no name
    const rCodeMatch = line.match(/[RF]\s*(\d{4})(?:\s|$)/);
    if (rCodeMatch) {
        const code = rCodeMatch[1];
        if (!badCodes.has(code) && !accountMap.has(code)) {
            const funktion = line.match(/^[^0-9]*R/) ? 'R' : (line.match(/^[^0-9]*F/) ? 'F' : '');
            accountMap.set(code, { name: `Reserviert (${code})`, funktion, abschlusszweck: '' });
        }
    }
}

// ===== PASS 3: Apply range-based Zusatzfunktionen where missing =====
for (const [code, data] of accountMap.entries()) {
    if (!data.funktion) {
        const zusatz = getZusatzfunktion(code);
        if (zusatz) {
            // Only set Zusatzfunktion if no Hauptfunktion is present
            // Zusatzfunktionen are stored separately but we can add as metadata
            data.zusatzfunktion = zusatz;
        }
    }
}

// ===== Merge GitHub data =====
try {
    const githubData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'skr03_github.json'), 'utf8'));
    const githubAccounts = githubData.filter(a => a.leaf && typeof a.code === 'string');
    for (const acc of githubAccounts) {
        if (!accountMap.has(acc.code)) {
            accountMap.set(acc.code, { name: acc.name, funktion: '', abschlusszweck: '' });
        }
    }
    console.log(`Merged ${githubAccounts.length} accounts from GitHub JSON.`);
} catch (e) {
    console.log('Could not merge GitHub data:', e.message);
}

console.log(`Total unique accounts extracted: ${accountMap.size}`);

// Stats
let funktionCount = 0;
let abschlussCount = 0;
let zusatzCount = 0;
for (const [, data] of accountMap.entries()) {
    if (data.funktion) funktionCount++;
    if (data.abschlusszweck) abschlussCount++;
    if (data.zusatzfunktion) zusatzCount++;
}
console.log(`  With Hauptfunktion: ${funktionCount}`);
console.log(`  With Abschlusszweck: ${abschlussCount}`);
console.log(`  With Zusatzfunktion: ${zusatzCount}`);

// ===== Group by Klasse =====
const klMap = new Map();
for (let i = 0; i <= 9; i++) {
    let label = `Klasse ${i}`;
    if (i === 0) label = "Anlage- und Kapitalkonten";
    if (i === 1) label = "Finanz- und Privatkonten";
    if (i === 2) label = "Abgrenzungskonten";
    if (i === 3) label = "Wareneingangs- und Bestandskonten";
    if (i === 4) label = "Betriebliche Aufwendungen";
    if (i === 5) label = "Klasse 5 (nicht belegt / Sonderkonten)";
    if (i === 6) label = "Klasse 6 (nicht belegt / Sonderkonten)";
    if (i === 7) label = "Bestände an Erzeugnissen";
    if (i === 8) label = "Erlöskonten";
    if (i === 9) label = "Vortrags-, Kapital-, Korrektur- und statistische Konten";

    klMap.set(i, { klasse: i, label, accounts: [] });
}

const sortedCodes = Array.from(accountMap.keys()).sort();
for (const code of sortedCodes) {
    const k = parseInt(code[0], 10);
    if (klMap.has(k)) {
        klMap.get(k).accounts.push({ code, ...accountMap.get(code) });
    }
}

// Print distribution
for (let i = 0; i <= 9; i++) {
    const k = klMap.get(i);
    console.log(`  Klasse ${i}: ${k.accounts.length} accounts`);
}

// ===== Generate TypeScript =====
let tsContent = `/**
 * DATEV SKR03 Kontenrahmen — Vollständig
 * nach Bilanzrichtlinie-Umsetzungsgesetz (BilRUG)
 * Prozessgliederungsprinzip (SKR 03)
 * Art.-Nr. 11174  2026-01-01
 *
 * Quelle: 37 JPEG-Seiten des offiziellen DATEV-Kontenrahmens (OCR Extracted & Merged)
 * + GitHub SKR03 JSON Daten
 * Total: ${accountMap.size} Konten
 *
 * Kontenfunktionen (Hauptfunktionen):
 *   AV = Automatische Errechnung der Vorsteuer
 *   AM = Automatische Errechnung der Umsatzsteuer
 *   S  = Sammelkonten
 *   F  = Konten mit allgemeiner Funktion
 *   R  = Reserviert (erst nach Funktionszuteilung bebuchbar)
 *
 * Zusatzfunktionen (Kontenklasse):
 *   KU = Keine Errechnung der Umsatzsteuer möglich
 *   V  = Zusatzfunktion "Vorsteuer"
 *   M  = Zusatzfunktion "Umsatzsteuer"
 *
 * Abschlusszweck:
 *   HB  = Nur Handelsbilanz
 *   SB  = Nur Steuerbilanz
 *   EÜR = Gewinnermittlung nach §4 Abs. 3 EStG
 */

export interface SKR03Account {
    code: string;
    name: string;
    /** Hauptfunktion: AV, AM, S, F, R or empty */
    funktion: string;
    /** Abschlusszweck: HB, SB, EÜR or empty */
    abschlusszweck: string;
    /** Zusatzfunktion (range-based): KU, V, M or empty */
    zusatzfunktion?: string;
}

export interface SKR03Group {
    title: string;
    accounts: SKR03Account[];
}

export interface SKR03Klasse {
    klasse: number;
    label: string;
    groups: SKR03Group[];
}

/**
 * Hauptfunktion Labels für UI-Anzeige
 */
export const HAUPTFUNKTION_LABELS: Record<string, string> = {
    'AV': 'Automatische Vorsteuer',
    'AM': 'Automatische Umsatzsteuer',
    'S': 'Sammelkonto',
    'F': 'Allgemeine Funktion',
    'R': 'Reserviert',
};

/**
 * Zusatzfunktion Labels für UI-Anzeige
 */
export const ZUSATZFUNKTION_LABELS: Record<string, string> = {
    'KU': 'Keine USt-Errechnung',
    'V': 'Vorsteuer',
    'M': 'Umsatzsteuer',
};

/**
 * Abschlusszweck Labels für UI-Anzeige
 */
export const ABSCHLUSSZWECK_LABELS: Record<string, string> = {
    'HB': 'Nur Handelsbilanz',
    'SB': 'Nur Steuerbilanz',
    'EÜR': 'Gewinnermittlung §4/3 EStG',
};

export const SKR03_FULL: SKR03Klasse[] = [
`;

for (let i = 0; i <= 9; i++) {
    const k = klMap.get(i);
    if (k.accounts.length === 0) continue;

    tsContent += `    {
        klasse: ${i},
        label: "${k.label}",
        groups: [
            {
                title: "Alle Konten",
                accounts: [
`;
    for (const acc of k.accounts) {
        const escapedName = acc.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const zusatzPart = acc.zusatzfunktion ? `, zusatzfunktion: "${acc.zusatzfunktion}"` : '';
        tsContent += `                    { code: "${acc.code}", name: "${escapedName}", funktion: "${acc.funktion || ''}", abschlusszweck: "${acc.abschlusszweck || ''}"${zusatzPart} },\n`;
    }
    tsContent += `                ],
            },
        ],
    },
`;
}

tsContent += `];

/**
 * Flat lookup: code → name
 * Fatura analizi sırasında hızlı eşleşme için
 */
export function getSkr03AccountName(code: string): string | undefined {
    for (const klasse of SKR03_FULL) {
        for (const group of klasse.groups) {
            const found = group.accounts.find(a => a.code === code);
            if (found) return found.name;
        }
    }
    return undefined;
}

/**
 * Flat lookup: code → full account object
 */
export function getSkr03Account(code: string): SKR03Account | undefined {
    for (const klasse of SKR03_FULL) {
        for (const group of klasse.groups) {
            const found = group.accounts.find(a => a.code === code);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Tüm hesapları düz liste olarak döndür
 */
export function getAllSkr03Accounts(): SKR03Account[] {
    const all: SKR03Account[] = [];
    for (const klasse of SKR03_FULL) {
        for (const group of klasse.groups) {
            all.push(...group.accounts);
        }
    }
    return all;
}

/**
 * Hauptfunktion label döndür
 */
export function getHauptfunktionLabel(funktion: string): string {
    return HAUPTFUNKTION_LABELS[funktion] || '';
}

/**
 * Zusatzfunktion label döndür
 */
export function getZusatzfunktionLabel(zusatzfunktion: string): string {
    return ZUSATZFUNKTION_LABELS[zusatzfunktion] || '';
}

/**
 * Abschlusszweck label döndür
 */
export function getAbschlusszweckLabel(abschlusszweck: string): string {
    return ABSCHLUSSZWECK_LABELS[abschlusszweck] || '';
}
`;

fs.writeFileSync(path.join(process.cwd(), 'data/skr03Full.ts'), tsContent);
console.log(`\nSuccessfully wrote data/skr03Full.ts with ${accountMap.size} accounts.`);
console.log('Fields: code, name, funktion, abschlusszweck, zusatzfunktion');
