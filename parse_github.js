import fs from 'fs';
import path from 'path';

const rawData = fs.readFileSync(path.join(process.cwd(), 'skr03_github.json'), 'utf8');
const accountsArr = JSON.parse(rawData);

const actualAccounts = accountsArr.filter(a => a.leaf && typeof a.code === 'string');
console.log(`Extracted ${actualAccounts.length} accounts from GitHub JSON.`);

const klMap = new Map();

for (let i = 0; i <= 9; i++) {
    let label = `Klasse ${i}`;
    if (i === 0) label = "Anlage- und Kapitalkonten";
    if (i === 1) label = "Finanz- und Privatkonten";
    if (i === 2) label = "Abgrenzungskonten";
    if (i === 3) label = "Wareneingangs- und Bestandskonten";
    if (i === 4) label = "Betriebliche Aufwendungen";
    if (i === 7) label = "Bestände an unfertigen Erzeugnissen";
    if (i === 8) label = "Erlöskonten";
    if (i === 9) label = "Vortrags-, Kapital-, Korrektur- und statistische Konten";

    klMap.set(i, {
        klasse: i,
        label: label,
        groupsMap: new Map()
    });
}

actualAccounts.forEach(acc => {
    const k = parseInt(acc.code[0], 10);
    const kData = klMap.get(k);
    if (!kData) return;

    let title = "Alle Konten";
    if (acc.categories && acc.categories.length > 0) {
        title = acc.categories[0];
    }

    if (!kData.groupsMap.has(title)) {
        kData.groupsMap.set(title, []);
    }

    kData.groupsMap.get(title).push({ code: acc.code, name: acc.name });
});

let tsContent = `/**
 * DATEV SKR03 Kontenrahmen — Vollständig
 * 
 * Quelle: DATEV SKR03 JSON (1500+ Konten)
 */

export interface SKR03Account {
    code: string;
    name: string;
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

export const SKR03_FULL: SKR03Klasse[] = [\n`;

for (let i = 0; i <= 9; i++) {
    const kData = klMap.get(i);
    if (kData.groupsMap.size === 0) continue;

    tsContent += `    {
        klasse: ${i},
        label: "${kData.label}",
        groups: [\n`;

    for (let [title, accs] of kData.groupsMap.entries()) {
        accs.sort((a, b) => a.code.localeCompare(b.code));
        tsContent += `            {
                title: "${title.replace(/"/g, '')}",
                accounts: [\n`;

        for (const acc of accs) {
            const escapedName = acc.name.replace(/"/g, '\\"');
            tsContent += `                    { code: "${acc.code}", name: "${escapedName}" },\n`;
        }
        tsContent += `                ],
            },\n`;
    }

    tsContent += `        ],
    },\n`;
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
`;

fs.writeFileSync(path.join(process.cwd(), 'data/skr03Full.ts'), tsContent);
console.log("Updated data/skr03Full.ts using GitHub data.");
