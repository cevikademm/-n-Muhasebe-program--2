import React, { useState, useMemo } from "react";
import { Invoice, InvoiceItem } from "../../types";
import { fmt, fmtShort, exportCSV, MONTHS_TR, MONTHS_DE, BarChart, DonutChart } from "./reportsHelpers";
import { ACCOUNT_METADATA } from "../../data/skr03Metadata";
import { Download } from "lucide-react";
import { GlowingEffect } from "../GlowingEffect";

interface Props {
    invoices: Invoice[];
    invoiceItems: InvoiceItem[];
    filteredInvoices: Invoice[];
    yearA: number;
    lang: string;
    tr: (a: string, b: string) => string;
}

// ═══════════════ SKR03 KLASSE TANIMLARI ═══════════════
// DATEV SKR03 hesap planındaki 10 ana sınıf (datev.pdf)
const KLASSEN: Array<{
    klasse: number;
    labelTr: string;
    labelDe: string;
    icon: string;
    color: string;
    beschreibungTr: string;
    beschreibungDe: string;
    ranges: [number, number][];
}> = [
        {
            klasse: 0, labelTr: "Duran Varlıklar", labelDe: "Anlagevermögen", icon: "🏗️", color: "#8b5cf6",
            beschreibungTr: "Arsa, bina, makine, araç, yazılım ve diğer sabit kıymetler",
            beschreibungDe: "Grundstücke, Gebäude, Maschinen, Fahrzeuge, Software und Sachanlagen",
            ranges: [[0, 999]]
        },
        {
            klasse: 1, labelTr: "Finans Hesapları", labelDe: "Finanzkonten", icon: "🏦", color: "#06b6d4",
            beschreibungTr: "Kasa, banka, alacaklar, borçlar ve KDV hesapları",
            beschreibungDe: "Kasse, Bank, Forderungen, Verbindlichkeiten, Vorsteuer/Umsatzsteuer",
            ranges: [[1000, 1999]]
        },
        {
            klasse: 2, labelTr: "Abgrenzung", labelDe: "Abgrenzungskonten", icon: "📊", color: "#f59e0b",
            beschreibungTr: "Dönemsellik, erteleme ve olağandışı gelir/gider hesapları",
            beschreibungDe: "Rechnungsabgrenzung, periodefremde Erträge und Aufwendungen",
            ranges: [[2000, 2999]]
        },
        {
            klasse: 3, labelTr: "Mal Alımları", labelDe: "Wareneingang", icon: "📦", color: "#14b8a6",
            beschreibungTr: "Ticari mal, hammadde alımları, fason hizmetler ve stok",
            beschreibungDe: "Wareneinkauf, Rohstoffe, Fremdleistungen, Lagerbestand",
            ranges: [[3000, 3999]]
        },
        {
            klasse: 4, labelTr: "İşletme Giderleri", labelDe: "Betriebliche Aufwendungen", icon: "💼", color: "#f43f5e",
            beschreibungTr: "Kira, personel, araç, reklam, seyahat, kırtasiye, danışmanlık",
            beschreibungDe: "Miete, Personal, KFZ, Werbung, Reise, Büro, Beratung",
            ranges: [[4000, 4999]]
        },
        {
            klasse: 5, labelTr: "Sonderposten 5", labelDe: "Sonderposten 5", icon: "📑", color: "#a78bfa",
            beschreibungTr: "Özel kalemler (Klasse 5)", beschreibungDe: "Sonderposten Klasse 5",
            ranges: [[5000, 5999]]
        },
        {
            klasse: 6, labelTr: "Sonderposten 6", labelDe: "Sonderposten 6", icon: "📑", color: "#818cf8",
            beschreibungTr: "Özel kalemler (Klasse 6)", beschreibungDe: "Sonderposten Klasse 6",
            ranges: [[6000, 6999]]
        },
        {
            klasse: 7, labelTr: "Stok Değişimleri", labelDe: "Bestandsveränderungen", icon: "🔄", color: "#38bdf8",
            beschreibungTr: "Yarı mamul ve mamul stok değişimleri",
            beschreibungDe: "Bestandsveränderungen an fertigen und unfertigen Erzeugnissen",
            ranges: [[7000, 7999]]
        },
        {
            klasse: 8, labelTr: "Satış Gelirleri", labelDe: "Erlöskonten", icon: "💰", color: "#22c55e",
            beschreibungTr: "Yurt içi/dışı satışlar, hizmet gelirleri, AB içi teslimatlar",
            beschreibungDe: "Umsatzerlöse Inland/Ausland, Dienstleistungen, innergemeinschaftliche Lieferungen",
            ranges: [[8000, 8999]]
        },
        {
            klasse: 9, labelTr: "Devir & İstatistik", labelDe: "Vortragskonten", icon: "📈", color: "#94a3b8",
            beschreibungTr: "Bilanço devir bakiyeleri ve istatistik hesapları",
            beschreibungDe: "Saldenvorträge und statistische Konten",
            ranges: [[9000, 9999]]
        },
    ];

// İşletme Giderleri (Klasse 4) alt kategorileri — DATEV SKR03 detaylı ayrım
const KLASSE4_SUBGROUPS: Array<{
    key: string;
    labelTr: string;
    labelDe: string;
    icon: string;
    color: string;
    ranges: [number, number][];
}> = [
        { key: "4000", labelTr: "Hammadde & Yardımcı", labelDe: "Roh-/Hilfsstoffe", icon: "🧱", color: "#06b6d4", ranges: [[4000, 4099]] },
        { key: "4100", labelTr: "Personel & Maaş", labelDe: "Personal & Löhne", icon: "👥", color: "#a78bfa", ranges: [[4100, 4199]] },
        { key: "4200", labelTr: "Kira & Mekan", labelDe: "Miete & Raumkosten", icon: "🏢", color: "#8b5cf6", ranges: [[4200, 4299]] },
        { key: "4300", labelTr: "Sigorta & Aidatlar", labelDe: "Versicherung & Beiträge", icon: "🛡️", color: "#64748b", ranges: [[4300, 4399]] },
        { key: "4400", labelTr: "Amortisman", labelDe: "Abschreibungen", icon: "📉", color: "#ef4444", ranges: [[4400, 4499]] },
        { key: "4500", labelTr: "Araç Giderleri", labelDe: "Kfz-Kosten", icon: "⛽", color: "#f59e0b", ranges: [[4500, 4599]] },
        { key: "4600", labelTr: "Reklam & Pazarlama", labelDe: "Werbekosten", icon: "📣", color: "#ec4899", ranges: [[4600, 4699]] },
        { key: "4650", labelTr: "Seyahat & Ağırlama", labelDe: "Reise & Bewirtung", icon: "✈️", color: "#10b981", ranges: [[4650, 4699]] },
        { key: "4700", labelTr: "Ofis & İletişim", labelDe: "Büro & Kommunikation", icon: "💻", color: "#3b82f6", ranges: [[4700, 4899]] },
        { key: "4900", labelTr: "Faiz & Banka", labelDe: "Zinsen & Bankgebühren", icon: "🏦", color: "#0ea5e9", ranges: [[4900, 4999]] },
    ];

function codeToNum(code: string): number {
    const d = (code || "").replace(/\D/g, "");
    return d ? parseInt(d.substring(0, 4), 10) : -1;
}

function inRanges(code: string, ranges: [number, number][]): boolean {
    const n = codeToNum(code);
    if (n < 0) return false;
    return ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

type AccSummary = { code: string; name: string; net: number; vat: number; gross: number; count: number };

export const ReportsSKR03Tab: React.FC<Props> = ({
    invoices, invoiceItems, filteredInvoices, yearA, lang, tr,
}) => {
    const [expandedKlasse, setExpandedKlasse] = useState<number | null>(4);
    const MONTHS = lang === "tr" ? MONTHS_TR : MONTHS_DE;

    // Hesap kodu bazlı toplam net/brüt/kdv
    const accountSummary = useMemo((): Record<string, AccSummary> => {
        const invIds = new Set(filteredInvoices.map(i => i.id));
        const filtered = invoiceItems.filter(it => it.invoice_id && invIds.has(it.invoice_id));

        const map: Record<string, AccSummary> = {};
        filtered.forEach(item => {
            const code = item.account_code || "????";
            if (!map[code]) map[code] = { code, name: item.account_name || "", net: 0, vat: 0, gross: 0, count: 0 };
            map[code].net += item.net_amount ?? 0;
            map[code].vat += item.vat_amount ?? 0;
            map[code].gross += (item.net_amount ?? 0) + (item.vat_amount ?? 0);
            map[code].count++;
        });
        return map;
    }, [invoiceItems, filteredInvoices]);

    // Klasse bazlı toplamlar
    const klasseData = useMemo(() => {
        const allAccounts = Object.values(accountSummary) as AccSummary[];
        return KLASSEN.map(kl => {
            const accounts = allAccounts.filter(a => inRanges(a.code, kl.ranges));
            const net = accounts.reduce((s, a) => s + a.net, 0);
            const vat = accounts.reduce((s, a) => s + a.vat, 0);
            const gross = accounts.reduce((s, a) => s + a.gross, 0);
            const count = accounts.reduce((s, a) => s + a.count, 0);
            return { ...kl, accounts: accounts.sort((a, b) => Math.abs(b.net) - Math.abs(a.net)), net, vat, gross, count };
        });
    }, [accountSummary]);

    // Klasse 4 alt grupları
    const klasse4Sub = useMemo(() => {
        const allAccounts = Object.values(accountSummary) as AccSummary[];
        return KLASSE4_SUBGROUPS.map(sg => {
            const accounts = allAccounts.filter(a => inRanges(a.code, sg.ranges));
            const net = accounts.reduce((s, a) => s + a.net, 0);
            return { ...sg, accounts, net };
        }).filter(sg => sg.net !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    }, [accountSummary]);

    // Aylık kırılım (Klasse 4 yoğunluğu)
    const monthlyKlasse = useMemo(() => {
        const invIds = new Set(filteredInvoices.map(i => i.id));
        return Array.from({ length: 12 }, (_, m) => {
            const monthInvs = filteredInvoices.filter(inv => {
                if (!inv.invoice_date) return false;
                const d = new Date(inv.invoice_date);
                return d.getFullYear() === yearA && d.getMonth() === m;
            });
            const monthInvIds = new Set(monthInvs.map(i => i.id));
            const items = invoiceItems.filter(it => it.invoice_id && monthInvIds.has(it.invoice_id));
            const gider = items.filter(it => inRanges(it.account_code || "", [[4000, 4999]])).reduce((s, it) => s + (it.net_amount ?? 0), 0);
            const gelir = items.filter(it => inRanges(it.account_code || "", [[8000, 8999]])).reduce((s, it) => s + (it.net_amount ?? 0), 0);
            return { label: MONTHS[m], a: gider, b: gelir, colorA: "#f43f5e", colorB: "#22c55e" };
        });
    }, [filteredInvoices, invoiceItems, yearA, MONTHS]);

    // Donut veri
    const donutData = useMemo(() => {
        return klasseData
            .filter(k => k.net !== 0)
            .map(k => ({ label: lang === "tr" ? k.labelTr : k.labelDe, value: Math.abs(k.net), color: k.color }));
    }, [klasseData, lang]);

    // CSV export
    const exportSKR03 = () => {
        const header = ["Klasse", "Hesap Kodu", "Hesap Adı", "Kategori", "Net", "KDV", "Brüt", "Adet"];
        const rows = [header];
        klasseData.forEach(kl => {
            kl.accounts.forEach(a => {
                const meta = ACCOUNT_METADATA[a.code];
                rows.push([
                    String(kl.klasse),
                    a.code,
                    a.name,
                    meta?.kategorie || "",
                    a.net.toFixed(2),
                    a.vat.toFixed(2),
                    a.gross.toFixed(2),
                    String(a.count),
                ]);
            });
        });
        exportCSV(rows, `SKR03_Rapor_${yearA}.csv`);
    };

    return (
        <div className="space-y-5">

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: tr("Gider (Kl.4)", "Aufwand (Kl.4)"), val: fmt(klasseData[4]?.net || 0), color: "#f43f5e", cls: "" },
                    { label: tr("Gelir (Kl.8)", "Erlöse (Kl.8)"), val: fmt(klasseData[8]?.net || 0), color: "#22c55e", cls: "c-card-green" },
                    { label: tr("Mal Alımı (Kl.3)", "Wareneingang (Kl.3)"), val: fmt(klasseData[3]?.net || 0), color: "#14b8a6", cls: "" },
                    { label: tr("Duran V. (Kl.0)", "Anlagen (Kl.0)"), val: fmt(klasseData[0]?.net || 0), color: "#8b5cf6", cls: "" },
                    { label: tr("Aktif Hesap", "Aktive Konten"), val: String(Object.keys(accountSummary).length), color: "#06b6d4", cls: "c-card-cyan" },
                ].map((c, i) => (
                    <div key={i} className={`c-card ${c.cls} p-4 fade-up relative`} style={{ animationDelay: `${i * 50}ms` }}>
                        <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                        <div className="relative z-10">
                            <div className="c-section-title mb-1">{c.label}</div>
                            <div className="font-syne font-bold text-base font-mono" style={{ color: c.color }}>{c.val}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Aylık Gider vs Gelir */}
            <div className="c-card p-5 fade-up relative">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="font-syne font-semibold text-sm text-slate-200">
                                {tr("Aylık Gider vs Gelir (SKR03)", "Monatliche Aufwendungen vs Erlöse")}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: "#3a3f4a" }}>{yearA}</div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#f43f5e" }} /> {tr("Gider (Kl.4)", "Aufwand")}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#22c55e" }} /> {tr("Gelir (Kl.8)", "Erlöse")}
                            </span>
                        </div>
                    </div>
                    <BarChart data={monthlyKlasse} height={140} showComparison={true} />
                </div>
            </div>

            {/* Donut + İşletme Gideri Detay */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 fade-up">
                <div className="c-card p-5 relative">
                    <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                    <div className="relative z-10">
                        <div className="font-syne font-semibold text-sm text-slate-200 mb-4">
                            {tr("Hesap Sınıfı Dağılımı", "Kontenklassen-Verteilung")}
                        </div>
                        {donutData.length === 0 ? (
                            <div className="py-8 text-center text-xs" style={{ color: "#3a3f4a" }}>
                                {tr("Veri yok", "Keine Daten")}
                            </div>
                        ) : (
                            <div className="flex items-center gap-5">
                                <DonutChart slices={donutData.slice(0, 8)} size={110} />
                                <div className="flex-1 space-y-2">
                                    {donutData.slice(0, 6).map((d, i) => (
                                        <div key={i}>
                                            <div className="flex items-center justify-between text-xs mb-0.5">
                                                <span style={{ color: "#94a3b8" }}>{d.label}</span>
                                                <span className="font-mono font-semibold text-slate-200">{fmtShort(d.value)}</span>
                                            </div>
                                            <div className="w-full rounded-full h-1" style={{ background: "#1c1f27" }}>
                                                <div className="h-1 rounded-full" style={{
                                                    width: `${(d.value / (donutData[0]?.value || 1)) * 100}%`,
                                                    background: d.color,
                                                }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Klasse 4 Alt Grupları */}
                <div className="c-card p-5 relative">
                    <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                    <div className="relative z-10">
                        <div className="font-syne font-semibold text-sm text-slate-200 mb-4">
                            {tr("İşletme Gideri Detayı (Klasse 4)", "Betriebliche Aufwendungen Detail")}
                        </div>
                        {klasse4Sub.length === 0 ? (
                            <div className="py-8 text-center text-xs" style={{ color: "#3a3f4a" }}>
                                {tr("Veri yok", "Keine Daten")}
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {klasse4Sub.slice(0, 8).map((sg, i) => {
                                    const maxNet = klasse4Sub[0]?.net || 1;
                                    return (
                                        <div key={sg.key}>
                                            <div className="flex items-center justify-between text-xs mb-0.5">
                                                <span className="flex items-center gap-1.5">
                                                    <span>{sg.icon}</span>
                                                    <span style={{ color: "#94a3b8" }}>{lang === "tr" ? sg.labelTr : sg.labelDe}</span>
                                                </span>
                                                <span className="font-mono font-semibold text-slate-200">{fmtShort(Math.abs(sg.net))}</span>
                                            </div>
                                            <div className="w-full rounded-full h-1" style={{ background: "#1c1f27" }}>
                                                <div className="h-1 rounded-full" style={{
                                                    width: `${(Math.abs(sg.net) / Math.abs(maxNet)) * 100}%`,
                                                    background: sg.color,
                                                }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Klasse bazlı ayrıntılı rapor tabloları */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="font-syne font-semibold text-sm text-slate-200">
                        {tr("SKR03 Hesap Sınıfları Detay", "SKR03 Kontenklassen Detail")}
                    </div>
                    <button onClick={exportSKR03}
                        className="c-btn-ghost px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5">
                        <Download size={13} /> {tr("CSV İndir", "CSV Export")}
                    </button>
                </div>

                {klasseData.map(kl => {
                    if (kl.count === 0) return null;
                    const isOpen = expandedKlasse === kl.klasse;
                    return (
                        <div key={kl.klasse} className="c-card overflow-hidden">
                            <button
                                onClick={() => setExpandedKlasse(isOpen ? null : kl.klasse)}
                                className="w-full flex items-center gap-3 px-5 py-4 cursor-pointer border-none text-left transition-colors"
                                style={{
                                    background: isOpen ? `${kl.color}08` : "transparent",
                                    borderBottom: isOpen ? `1px solid ${kl.color}20` : "none",
                                    borderLeft: `3px solid ${kl.color}`,
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${kl.color}0a`}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isOpen ? `${kl.color}08` : "transparent"}
                            >
                                <span style={{ fontSize: "20px" }}>{kl.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded"
                                            style={{ background: `${kl.color}15`, color: kl.color, border: `1px solid ${kl.color}30` }}>
                                            Kl.{kl.klasse}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-200">
                                            {lang === "tr" ? kl.labelTr : kl.labelDe}
                                        </span>
                                        <span className="text-[10px]" style={{ color: "#475569" }}>
                                            {kl.accounts.length} {tr("hesap", "Konten")}
                                        </span>
                                    </div>
                                    <div className="text-[10px]" style={{ color: "#475569" }}>
                                        {lang === "tr" ? kl.beschreibungTr : kl.beschreibungDe}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-mono font-bold text-sm" style={{ color: kl.color }}>
                                        {fmt(kl.net)}
                                    </div>
                                    <div className="text-[10px] font-mono" style={{ color: "#475569" }}>
                                        {kl.count} {tr("kalem", "Pos.")}
                                    </div>
                                </div>
                                <span style={{ color: "#475569", fontSize: "14px", transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                            </button>

                            {isOpen && (
                                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr>
                                                {[tr("Kod", "Konto"), tr("Hesap Adı", "Kontobezeichnung"), tr("Kategori", "Kategorie"),
                                                tr("Net", "Netto"), tr("KDV", "USt"), tr("Brüt", "Brutto"), tr("Adet", "Anzahl")].map((h, i) => (
                                                    <th key={i} className="px-4 py-2 text-left"
                                                        style={{
                                                            background: "#0d0f15", color: "#3a3f4a", borderBottom: "1px solid #1c1f27",
                                                            fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
                                                            position: "sticky", top: 0, zIndex: 1,
                                                        }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {kl.accounts.map((acc, ai) => {
                                                const meta = ACCOUNT_METADATA[acc.code];
                                                return (
                                                    <tr key={acc.code} style={{ borderBottom: "1px solid #1c1f27" }}
                                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                                        <td className="px-4 py-2.5">
                                                            <span className="font-mono font-bold" style={{ color: kl.color }}>{acc.code}</span>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-slate-300">{acc.name}</td>
                                                        <td className="px-4 py-2.5">
                                                            {meta?.kategorie ? (
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                                                                    style={{ background: "rgba(139,92,246,.08)", color: "#a78bfa", border: "1px solid rgba(139,92,246,.15)" }}>
                                                                    {meta.kategorie}
                                                                </span>
                                                            ) : <span style={{ color: "#334155" }}>—</span>}
                                                        </td>
                                                        <td className="px-4 py-2.5 font-mono text-right" style={{ color: acc.net >= 0 ? "#10b981" : "#f43f5e" }}>{fmt(acc.net)}</td>
                                                        <td className="px-4 py-2.5 font-mono text-right text-slate-400">{fmt(acc.vat)}</td>
                                                        <td className="px-4 py-2.5 font-mono text-right text-slate-200">{fmt(acc.gross)}</td>
                                                        <td className="px-4 py-2.5 font-mono text-center text-slate-400">{acc.count}</td>
                                                    </tr>
                                                );
                                            })}
                                            {/* Alt toplam */}
                                            <tr style={{ borderTop: `2px solid ${kl.color}30`, background: `${kl.color}06` }}>
                                                <td className="px-4 py-2.5 font-bold" style={{ color: kl.color }} colSpan={3}>
                                                    {tr("TOPLAM", "SUMME")} — {lang === "tr" ? kl.labelTr : kl.labelDe}
                                                </td>
                                                <td className="px-4 py-2.5 font-mono font-bold text-right" style={{ color: kl.color }}>{fmt(kl.net)}</td>
                                                <td className="px-4 py-2.5 font-mono font-bold text-right text-slate-400">{fmt(kl.vat)}</td>
                                                <td className="px-4 py-2.5 font-mono font-bold text-right text-slate-200">{fmt(kl.gross)}</td>
                                                <td className="px-4 py-2.5 font-mono font-bold text-center text-slate-400">{kl.count}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
