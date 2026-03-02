import React, { useState } from "react";
import { InvoiceItem, Invoice } from "../../types";

// ─────────────────────────────────────────
// DATEV SKR03 + SKR04 Kategori Haritası
// ─────────────────────────────────────────

export interface Category {
  key: string;
  icon: string;
  labelTr: string;
  labelDe: string;
  color: string;
  /** SKR03 numeric ranges [lo, hi] (inclusive) */
  skr03: [number, number][];
  /** SKR04 numeric ranges [lo, hi] (inclusive) */
  skr04: [number, number][];
  /** Lowercase German keywords matched against description + account_name + supplier_name */
  keywords: string[];
}

export type EnrichedItem = InvoiceItem & {
  category: Category;
  invoice: Invoice | undefined;
};

export interface CategoryDataItem extends Category {
  total: number;
  items: EnrichedItem[];
}

export interface CategoryCompareItem extends Category {
  a: number;
  b: number;
}

export interface MonthlyDataItem {
  label: string;
  a: number;
  b?: number;
  colorA?: string;
  colorB?: string;
}

export interface StatsData {
  totalNet: number;
  totalVat: number;
  totalGross: number;
  count: number;
  avg: number;
}

export interface SupplierDataItem {
  name: string;
  total: number;
  count: number;
  lastDate: string;
  categories: string[];
}

export interface VatMonthRow {
  label: string;
  vat19: number;
  vat7: number;
  net: number;
}

export interface VatData {
  vat19Net: number;
  vat19Tax: number;
  vat7Net: number;
  vat7Tax: number;
  vat0Net: number;
  totalVst: number;
  monthly: VatMonthRow[];
}

// ─────────────────────────────────────────
// Helper: parse account code to integer
// Strips non-digit chars (e.g. "4210-1" → 4210)
// Returns -1 if unparseable
// ─────────────────────────────────────────
function numericCode(code: string): number {
  const digits = code.replace(/\D/g, "");
  if (!digits) return -1;
  // Take first 4 digits if longer (e.g. "42100" → 4210)
  return parseInt(digits.substring(0, 4), 10);
}

function matchesRanges(code: string, ranges: [number, number][]): boolean {
  if (!ranges.length) return false;
  const n = numericCode(code);
  if (n < 0) return false;
  return ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

// ─────────────────────────────────────────
// CATEGORIES — Correct SKR03 + SKR04 ranges
//
// SKR03 expense accounts (Klasse 4):
//   3000-3999  Wareneinkauf (Klasse 3)
//   4010-4099  Roh-/Hilfs-/Betriebsstoffe
//   4100-4199  Löhne, Gehälter, Sozialabgaben
//   4200-4299  Raumkosten (Miete, Heizung, Strom, Wasser)
//   4300-4399  Versicherungen, Beiträge, Abgaben
//   4400-4499  Kraftfahrzeugkosten
//   4500-4599  Werbekosten, Messen
//   4600-4699  Reisekosten, Bewirtungskosten
//   4700-4899  Bürobedarf, Telekommunikation, Beratung, Abschreibungen
//   4900-4999  Zinsen, Bankgebühren
//
// SKR04 expense accounts (Klasse 5–6):
//   5000-5999  Materialaufwand, Wareneinkauf
//   6000-6099  Abschreibungen
//   6100-6199  Personalkosten
//   6200-6299  Raumkosten
//   6300-6399  Versicherungen
//   6400-6499  KFZ-Kosten
//   6500-6599  Werbekosten
//   6600-6699  Reisekosten, Bewirtung
//   6700-6799  Bürobedarf, Verwaltung
//   6800-6899  Zinsen, Bankgebühren
//   6900-6999  Sonstige Aufwendungen
// ─────────────────────────────────────────

export const CATEGORIES: Category[] = [
  {
    key: "waren",
    icon: "📦",
    labelTr: "Mal & Hammadde",
    labelDe: "Waren & Material",
    color: "#06b6d4",
    skr03: [[3000, 3999], [4010, 4099]],
    skr04: [[5000, 5999]],
    keywords: [
      "ware", "waren", "material", "rohstoff", "handelsware", "einkauf",
      "bestand", "inventar", "produkt", "teile", "zutaten", "lieferung",
      "halbzeug", "fertigware", "hilfs", "betriebsstoff",
    ],
  },
  {
    key: "personal",
    icon: "👥",
    labelTr: "Personel & Maaş",
    labelDe: "Personal & Löhne",
    color: "#a78bfa",
    skr03: [[4100, 4199]],
    skr04: [[6100, 6199]],
    keywords: [
      "lohn", "löhne", "gehalt", "gehälter", "personal", "mitarbeiter",
      "sozial", "sozialabgabe", "arbeitgeberanteil", "urlaubsgeld",
      "weihnachtsgeld", "minijob", "aushilfe", "vergütung",
    ],
  },
  {
    key: "miete",
    icon: "🏢",
    labelTr: "Kira & Mekan Giderleri",
    labelDe: "Miete & Raumkosten",
    color: "#8b5cf6",
    skr03: [[4200, 4299]],
    skr04: [[6200, 6299]],
    keywords: [
      "miete", "mietkosten", "pacht", "raumkosten", "heizung",
      "heizkosten", "strom", "elektrizität", "gas", "gasverbrauch",
      "wasser", "abwasser", "nebenkosten", "reinigung", "gebäude",
    ],
  },
  {
    key: "versicherung",
    icon: "🛡️",
    labelTr: "Sigorta & Aidatlar",
    labelDe: "Versicherung & Beiträge",
    color: "#64748b",
    skr03: [[4300, 4399]],
    skr04: [[6300, 6399]],
    keywords: [
      "versicherung", "versicherungsbeitrag", "beitrag", "beiträge",
      "haftpflicht", "ihk", "berufsgenossenschaft", "kammerbeitrag",
      "steuer", "grundsteuer", "gewerbesteuer", "prämie", "schutz",
    ],
  },
  {
    key: "kfz",
    icon: "⛽",
    labelTr: "Araç & Yakıt",
    labelDe: "Fahrzeug & Kraftstoff",
    color: "#f59e0b",
    skr03: [[4400, 4499]],
    skr04: [[6400, 6499]],
    keywords: [
      "kfz", "kraftfahrzeug", "kraftstoff", "benzin", "diesel",
      "tankstelle", "tanken", "fahrzeug", "auto", "pkw", "lkw",
      "kfz-versicherung", "kfz-steuer", "kfz-reparatur",
      "fahrzeugreparatur", "leasing auto", "mietwagen",
    ],
  },
  {
    key: "werbung",
    icon: "📣",
    labelTr: "Reklam & Pazarlama",
    labelDe: "Werbung & Marketing",
    color: "#ec4899",
    skr03: [[4500, 4599]],
    skr04: [[6500, 6599]],
    keywords: [
      "werbung", "werbekosten", "marketing", "reklame", "anzeige",
      "inserat", "messe", "ausstellung", "werbemittel", "flyer",
      "katalog", "website", "social media", "seo", "werbeartikel",
    ],
  },
  {
    key: "reise",
    icon: "✈️",
    labelTr: "Seyahat & Ağırlama",
    labelDe: "Reise & Bewirtung",
    color: "#10b981",
    skr03: [[4600, 4699]],
    skr04: [[6600, 6699]],
    keywords: [
      "reise", "reisekosten", "hotel", "übernachtung", "bewirtung",
      "restaurant", "gaststätte", "flug", "bahn", "taxi",
      "fahrtkosten", "verpflegung", "dienstreise",
    ],
  },
  {
    key: "buero",
    icon: "💻",
    labelTr: "Ofis & Haberleşme",
    labelDe: "Büro & Telekommunikation",
    color: "#3b82f6",
    // SKR03 4700-4899: Bürobedarf, Telefon, Porto, Beratung, Abschreibungen, Rechtsanwaltskosten
    skr03: [[4700, 4899]],
    skr04: [[6700, 6899]],
    keywords: [
      "büro", "bürobedarf", "büroausstattung", "telefon", "mobilfunk",
      "internet", "porto", "versand", "papier", "drucker",
      "software", "computer", "hardware", "it", "lizenz", "abo",
      "buchhaltung", "buchführung", "beratung", "rechtsanwalt",
      "steuerberater", "notarkosten", "fremdleistung", "dienstleistung",
      "abschreibung",
    ],
  },
  {
    key: "finanz",
    icon: "🏦",
    labelTr: "Faiz & Finansman",
    labelDe: "Zinsen & Finanzierung",
    color: "#0ea5e9",
    skr03: [[4900, 4999]],
    skr04: [[6900, 6999]],
    keywords: [
      "zinsen", "zinsaufwand", "bankgebühr", "kontoführung",
      "kredit", "darlehen", "leasing", "finanzierung",
      "factoring", "disagio",
    ],
  },
  {
    key: "anlagen",
    icon: "🔧",
    labelTr: "Demirbaş & Yatırım",
    labelDe: "Anlagen & Investitionen",
    color: "#f87171",
    // 0xxx codes: Anlagevermögen (numericCode strips leading zero → 100-999)
    skr03: [],
    skr04: [],
    keywords: [
      "maschine", "anlage", "gerät", "fahrzeugkauf", "grundstück",
      "gebäudekauf", "investition", "einrichtung", "mobiliar",
    ],
  },
  {
    key: "sonstige",
    icon: "📋",
    labelTr: "Diğer Giderler",
    labelDe: "Sonstige Aufwendungen",
    color: "#94a3b8",
    skr03: [],
    skr04: [],
    keywords: [],
  },
];

// ─────────────────────────────────────────
// Main categorization function
// Uses: account_code → description/account_name → supplier → fallback
// ─────────────────────────────────────────
export function getCategoryForItem(
  code: string | null | undefined,
  description?: string | null,
  accountName?: string | null,
  supplierName?: string | null
): Category {
  const sonstige = CATEGORIES[CATEGORIES.length - 1];

  if (code) {
    const c = code.trim();

    // Special case: 0xxx = Anlagegüter (starts with "0")
    if (/^0\d/.test(c)) {
      const anlagenCat = CATEGORIES.find(cat => cat.key === "anlagen");
      if (anlagenCat) return anlagenCat;
    }

    // Try SKR03 ranges
    for (const cat of CATEGORIES.slice(0, -1)) {
      if (cat.key === "anlagen") continue; // handled above
      if (matchesRanges(c, cat.skr03)) return cat;
    }

    // Try SKR04 ranges
    for (const cat of CATEGORIES.slice(0, -1)) {
      if (cat.key === "anlagen") continue;
      if (matchesRanges(c, cat.skr04)) return cat;
    }
  }

  // Keyword fallback — match against description + account_name + supplier
  const text = [description, accountName, supplierName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text) {
    for (const cat of CATEGORIES.slice(0, -1)) {
      if (cat.keywords.some(kw => text.includes(kw))) return cat;
    }
  }

  return sonstige;
}

/** Backward-compatible wrapper (code only) */
export function getCategoryForCode(code: string | null): Category {
  return getCategoryForItem(code);
}

// ─────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────
export const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

export const fmtShort = (n: number) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M €";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K €";
  return fmt(n);
};

export const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const MONTHS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function exportCSV(rows: string[][], filename: string) {
  const bom = "\uFEFF";
  const csv = bom + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────
// SVG Bar Chart
// ─────────────────────────────────────────
export interface BarChartProps {
  data: MonthlyDataItem[];
  height?: number;
  showComparison?: boolean;
}

export const BarChart: React.FC<BarChartProps> = ({ data, height = 120, showComparison = false }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxVal = Math.max(...data.map(d => Math.max(d.a, d.b ?? 0)), 1);
  const n = data.length;
  const svgH = height - 22;
  const W = 500;
  const ptX = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const ptY = (v: number) => svgH - Math.max((v / maxVal) * svgH * 0.88, v > 0 ? 4 : 0);
  const ptsA = data.map((d, i) => ({ x: ptX(i), y: ptY(d.a) }));
  const ptsB = showComparison ? data.map((d, i) => ({ x: ptX(i), y: ptY(d.b ?? 0) })) : [];
  const bezier = (pts: { x: number; y: number }[]) => {
    if (pts.length < 1) return "";
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const dx = (pts[i].x - pts[i - 1].x) * 0.38;
      d += ` C${pts[i - 1].x + dx},${pts[i - 1].y} ${pts[i].x - dx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    return d;
  };
  const lineA = bezier(ptsA);
  const areaA = lineA && n > 0 ? `${lineA} L${ptsA[n - 1].x},${svgH} L${ptsA[0].x},${svgH} Z` : "";
  const lineB = bezier(ptsB);
  const areaB = lineB && ptsB.length > 0 ? `${lineB} L${ptsB[ptsB.length - 1].x},${svgH} L${ptsB[0].x},${svgH} Z` : "";

  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <svg
        viewBox={`0 0 ${W} ${svgH}`}
        width="100%" height={svgH}
        style={{ display: "block", overflow: "visible" }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="rc-ga" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="rc-gb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.01" />
          </linearGradient>
          <filter id="rc-glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f}
            x1={0} y1={svgH * (1 - f * 0.88)} x2={W} y2={svgH * (1 - f * 0.88)}
            stroke="#14192a" strokeWidth="1" strokeDasharray="6,5" />
        ))}

        {/* Series B */}
        {showComparison && areaB && (
          <>
            <path d={areaB} fill="url(#rc-gb)" />
            <path d={lineB} fill="none" stroke="#8b5cf6" strokeWidth="1.6"
              strokeLinejoin="round" strokeLinecap="round" opacity="0.6" />
          </>
        )}

        {/* Series A – area + glow + sharp line */}
        <path d={areaA} fill="url(#rc-ga)" />
        <path d={lineA} fill="none" stroke="#06b6d4" strokeWidth="2.4"
          strokeLinejoin="round" strokeLinecap="round" filter="url(#rc-glow)" opacity="0.45" />
        <path d={lineA} fill="none" stroke="#22d3ee" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Hover crosshair */}
        {hovered !== null && (
          <line
            x1={ptsA[hovered].x} y1={4}
            x2={ptsA[hovered].x} y2={svgH}
            stroke="#06b6d4" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.35"
          />
        )}

        {/* Dots + hit areas */}
        {ptsA.map((p, i) => {
          const isH = hovered === i;
          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "default" }}
            >
              <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
              {isH && <circle cx={p.x} cy={p.y} r={8} fill="#06b6d4" opacity="0.1" />}
              <circle
                cx={p.x} cy={p.y} r={isH ? 4 : 2.5}
                fill={isH ? "#e2e8f0" : "#06b6d4"}
                stroke={isH ? "#06b6d4" : "#0d1117"} strokeWidth={isH ? 1.5 : 1}
                style={{ filter: isH ? "drop-shadow(0 0 6px #06b6d4)" : "none" }}
              />
            </g>
          );
        })}

        {/* Tooltip */}
        {hovered !== null && data[hovered].a > 0 && (() => {
          const p = ptsA[hovered];
          const label = showComparison && data[hovered].b !== undefined
            ? `${fmtShort(data[hovered].a)} · ${fmtShort(data[hovered].b!)}`
            : fmtShort(data[hovered].a);
          const tw = showComparison ? 130 : 80;
          const tx = Math.min(Math.max(p.x - tw / 2, 4), W - tw - 4);
          const ty = Math.max(p.y - 34, 4);
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={tx} y={ty} width={tw} height={20} rx={5}
                fill="#0a0c12" stroke="#1a2035" strokeWidth="1" />
              <text x={tx + tw / 2} y={ty + 13} textAnchor="middle"
                fill="#22d3ee" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                {label}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Month labels */}
      <div style={{ display: "flex", marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <span style={{
              fontSize: 9, fontFamily: "monospace",
              color: hovered === i ? "#22d3ee" : "#2a3040",
              transition: "color .15s",
            }}>
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// SVG Donut Chart
// ─────────────────────────────────────────
export interface DonutProps {
  slices: { label: string; value: number; color: string }[];
  size?: number;
}

export const DonutChart: React.FC<DonutProps> = ({ slices, size = 120 }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "#3a3f4a", fontSize: 10 }}>—</span>
    </div>
  );
  const cx = 60; const cy = 60; const R = 42;
  const circ = 2 * Math.PI * R;
  const GAP = (3.5 / 360) * circ;
  let cumLen = 0;
  const segments = slices
    .filter(s => s.value > 0)
    .map(s => {
      const pct = s.value / total;
      const fullLen = pct * circ;
      const drawLen = Math.max(fullLen - GAP, 0);
      const dashOffset = circ - cumLen;
      cumLen += fullLen;
      return { ...s, pct, drawLen, dashOffset };
    });

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ overflow: "visible" }}>
      {/* Track ring */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#12151e" strokeWidth="9"
        transform={`rotate(-90 ${cx} ${cy})`} />

      {/* Arc segments */}
      {segments.map((s, i) => (
        <circle
          key={i} cx={cx} cy={cy} r={R}
          fill="none" stroke={s.color}
          strokeWidth={hovered === i ? 11 : 8}
          strokeDasharray={`${s.drawLen} ${circ - s.drawLen}`}
          strokeDashoffset={s.dashOffset}
          strokeLinecap="butt"
          opacity={hovered !== null && hovered !== i ? 0.2 : 0.9}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            filter: hovered === i ? `drop-shadow(0 0 6px ${s.color})` : "none",
            transition: "stroke-width .2s, opacity .2s",
            cursor: "pointer",
          }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        />
      ))}

      {/* Center hole */}
      <circle cx={cx} cy={cy} r={30} fill="#0f1117" />

      {/* Center text */}
      {hovered !== null ? (
        <>
          <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle"
            fill={segments[hovered]?.color || "#06b6d4"}
            fontSize="10" fontFamily="monospace" fontWeight="bold"
            style={{ filter: `drop-shadow(0 0 4px ${segments[hovered]?.color})` }}>
            {((segments[hovered]?.pct ?? 0) * 100).toFixed(0)}%
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle"
            fill="#64748b" fontSize="6.5" fontFamily="monospace">
            {(segments[hovered]?.label ?? "").length > 10
              ? (segments[hovered]?.label ?? "").slice(0, 10) + "…"
              : (segments[hovered]?.label ?? "")}
          </text>
        </>
      ) : (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill="#2a3040" fontSize="8" fontFamily="monospace">
          {segments.length} Kat.
        </text>
      )}
    </svg>
  );
};
