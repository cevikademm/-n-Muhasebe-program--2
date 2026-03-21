import React, { useState, useMemo } from "react";
import { useLang } from "../LanguageContext";
import { SKR03_FULL, getAllSkr03Accounts, SKR03Account, SKR03Klasse, SKR03Group, HAUPTFUNKTION_LABELS, ZUSATZFUNKTION_LABELS, ABSCHLUSSZWECK_LABELS } from "../data/skr03Full";
import { ACCOUNT_METADATA } from "../data/skr03Metadata";
import { Search, ChevronDown, ChevronRight, BookOpen, Hash, Layers, Download } from "lucide-react";
import * as XLSX from "xlsx";

// Badge color maps for Funktionen
const FUNKTION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'AV': { bg: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.3)', text: '#10b981' },
    'AM': { bg: 'rgba(59,130,246,.12)', border: 'rgba(59,130,246,.3)', text: '#3b82f6' },
    'S': { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.3)', text: '#f59e0b' },
    'F': { bg: 'rgba(139,92,246,.12)', border: 'rgba(139,92,246,.3)', text: '#a78bfa' },
    'R': { bg: 'rgba(100,116,139,.12)', border: 'rgba(100,116,139,.3)', text: '#64748b' },
};

const ZUSATZ_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'KU': { bg: 'rgba(244,63,94,.10)', border: 'rgba(244,63,94,.25)', text: '#f43f5e' },
    'V': { bg: 'rgba(16,185,129,.10)', border: 'rgba(16,185,129,.25)', text: '#10b981' },
    'M': { bg: 'rgba(59,130,246,.10)', border: 'rgba(59,130,246,.25)', text: '#3b82f6' },
};

const ABSCHLUSS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'HB': { bg: 'rgba(251,191,36,.10)', border: 'rgba(251,191,36,.25)', text: '#fbbf24' },
    'SB': { bg: 'rgba(168,85,247,.10)', border: 'rgba(168,85,247,.25)', text: '#a855f7' },
    'EÜR': { bg: 'rgba(6,182,212,.10)', border: 'rgba(6,182,212,.25)', text: '#06b6d4' },
};

const FunktionBadge: React.FC<{ value: string; labels: Record<string, string>; colors: Record<string, { bg: string; border: string; text: string }> }> = ({ value, labels, colors }) => {
    if (!value) return <span style={{ color: '#334155', fontSize: '10px' }}>—</span>;
    const c = colors[value] || { bg: 'rgba(255,255,255,.05)', border: 'rgba(255,255,255,.1)', text: '#94a3b8' };
    return (
        <span title={labels[value] || value} style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: 700,
            background: c.bg, border: `1px solid ${c.border}`, color: c.text,
            whiteSpace: 'nowrap', cursor: 'help',
        }}>
            {value}
        </span>
    );
};

const KLASSE_COLORS: Record<number, string> = {
    0: "#8b5cf6", // purple
    1: "#06b6d4", // cyan
    2: "#f59e0b", // amber
    3: "#10b981", // emerald
    4: "#f43f5e", // rose
    8: "#3b82f6", // blue
};

const KATEGORIE_COLORS: Record<string, string> = {
    'Duran Varlık': '#8b5cf6', 'Sermaye': '#6366f1', 'Finans': '#06b6d4',
    'Alacak': '#10b981', 'Borç': '#f43f5e', 'KDV (Giriş)': '#22c55e',
    'KDV (Çıkış)': '#ef4444', 'Özel Hesap': '#f97316', 'Abgrenzung': '#eab308',
    'Mal Alımı': '#14b8a6', 'İndirim': '#a3e635', 'Stok': '#06b6d4',
    'İşletme Gideri': '#fb7185', 'Sonderposten': '#a78bfa', 'Stok Değişim': '#38bdf8',
    'Satış Geliri': '#34d399', 'Gelir İndirimi': '#fbbf24', 'Bedelsiz Kullanım': '#f472b6',
    'Devir': '#94a3b8', 'İstatistik': '#64748b',
};

export const HesapPlanlari2Panel: React.FC = () => {
    const { lang } = useLang();
    const tr = (a: string, b: string) => lang === "tr" ? a : b;

    const [search, setSearch] = useState("");
    const [expandedKlasse, setExpandedKlasse] = useState<number | null>(null);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

    const allAccounts = useMemo(() => getAllSkr03Accounts(), []);

    // Search filter
    const filtered = useMemo(() => {
        if (!search.trim()) return null; // not searching
        const q = search.toLowerCase().trim();
        const results: (SKR03Account & { klassLabel: string; groupTitle: string; klasse: number })[] = [];
        for (const kl of SKR03_FULL) {
            for (const gr of kl.groups) {
                for (const acc of gr.accounts) {
                    if (acc.code.includes(q) || acc.name.toLowerCase().includes(q)) {
                        results.push({ ...acc, klassLabel: kl.label, groupTitle: gr.title, klasse: kl.klasse });
                    } else {
                        // Also search in metadata keywords and description
                        const meta = ACCOUNT_METADATA[acc.code];
                        if (meta) {
                            const inDesc = meta.description.toLowerCase().includes(q);
                            const inKw = meta.keywords.some(k => k.toLowerCase().includes(q));
                            const inEx = meta.examples.some(e => e.toLowerCase().includes(q));
                            if (inDesc || inKw || inEx) {
                                results.push({ ...acc, klassLabel: kl.label, groupTitle: gr.title, klasse: kl.klasse });
                            }
                        }
                    }
                }
            }
        }
        return results;
    }, [search]);

    const toggleKlasse = (k: number) => {
        setExpandedKlasse(expandedKlasse === k ? null : k);
        setExpandedGroup(null);
    };

    const toggleGroup = (key: string) => {
        setExpandedGroup(expandedGroup === key ? null : key);
    };

    const handleExportExcel = () => {
        let exportData: any[] = [];

        if (filtered !== null) {
            exportData = filtered;
        } else {
            // allAccounts does not natively have klasse inside acc unless we get it from code, so let's append it where missing
            exportData = allAccounts.map((acc: any) => ({
                ...acc,
                klasse: parseInt(acc.code.charAt(0), 10) || 0
            }));
        }

        const dataRows = exportData.map(acc => {
            const meta = ACCOUNT_METADATA[acc.code as keyof typeof ACCOUNT_METADATA] as any || {};
            return {
                "Kod (Konto)": acc.code,
                "Hesap Adı (Bezeichnung)": acc.name,
                "Açıklama (Beschreibung)": meta.description || "",
                "Anahtar Kelimeler (Schlüsselwörter)": meta.keywords?.join(", ") || "",
                "Örnekler (Beispiele)": meta.examples?.join("; ") || "",
                "Kategori (Kategorie)": meta.kategorie || "",
                "KDV (USt)": meta.kdvRate || "",
                "Taraf (Seite)": meta.taraf === 'S' ? 'Soll' : (meta.taraf === 'H' ? 'Haben' : ""),
                "Klasse": acc.klasse !== undefined ? acc.klasse : parseInt(acc.code.charAt(0), 10),
                "Fonk. (Funktion)": acc.funktion || "",
                "Ek (Zusatzfunktion)": acc.zusatzfunktion || "",
                "Bilanço (Abschlusszweck)": acc.abschlusszweck || ""
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Hesap Planlari 2");
        XLSX.writeFile(wb, "DATEV_SKR03_Hesap_Planlari.xlsx");
    };

    return (
        <div className="h-full flex flex-col" style={{ background: "#0d0f15", color: "#e2e8f0" }}>
            {/* ══ Header ══ */}
            <div style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid rgba(255,255,255,.06)",
                flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                    <div style={{
                        width: "40px", height: "40px", borderRadius: "12px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "linear-gradient(135deg, rgba(139,92,246,.25), rgba(6,182,212,.15))",
                        border: "1px solid rgba(139,92,246,.4)",
                    }}>
                        <BookOpen size={20} style={{ color: "#a78bfa" }} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0, color: "#f1f5f9" }}>
                            {tr("Hesap Planları 2", "Kontenrahmen 2")}
                        </h2>
                        <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>
                            {tr("DATEV SKR03 — Bilanzrichtlinie-Umsetzungsgesetz (BilRUG)", "DATEV SKR03 — Vollständiger Kontenrahmen")}
                        </p>
                    </div>
                    <div style={{
                        marginLeft: "auto",
                        display: "flex", alignItems: "center", gap: "10px"
                    }}>
                        <div style={{
                            padding: "4px 10px", borderRadius: "8px",
                            background: "rgba(139,92,246,.12)", border: "1px solid rgba(139,92,246,.3)",
                            fontSize: "11px", fontWeight: 700, color: "#a78bfa",
                        }}>
                            {allAccounts.length} {tr("Hesap", "Konten")}
                        </div>
                        <button
                            onClick={handleExportExcel}
                            title={tr("Excel Olarak İndir (Sütun Sütun)", "Als Excel herunterladen (Spaltenweise)")}
                            style={{
                                display: "flex", alignItems: "center", gap: "6px",
                                padding: "4px 12px", borderRadius: "8px", cursor: "pointer",
                                background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)",
                                fontSize: "11px", fontWeight: 700, color: "#10b981", transition: "all 0.2s"
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.25)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.15)" }}
                        >
                            <Download size={14} />
                            {tr("Excel İndir", "Excel Herunterladen")}
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: "10px", padding: "8px 14px",
                }}>
                    <Search size={16} style={{ color: "#64748b", flexShrink: 0 }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={tr("Hesap kodu veya adı ile ara... (ör: 4920, Porto, Telefon)", "Kontonummer oder Name suchen... (z.B. 4920, Porto, Telefon)")}
                        style={{
                            flex: 1, background: "transparent", border: "none", outline: "none",
                            color: "#e2e8f0", fontSize: "13px", fontFamily: "inherit",
                        }}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            style={{
                                background: "rgba(255,255,255,.08)", border: "none", borderRadius: "6px",
                                padding: "2px 8px", color: "#94a3b8", fontSize: "11px", cursor: "pointer",
                            }}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* ══ Content ══ */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

                {/* Search results */}
                {filtered !== null ? (
                    <div>
                        <div style={{
                            fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: "0.12em", color: "#64748b", marginBottom: "12px",
                        }}>
                            {filtered.length} {tr("sonuç bulundu", "Ergebnisse gefunden")}
                        </div>
                        {filtered.length === 0 ? (
                            <div style={{
                                textAlign: "center", padding: "40px 20px",
                                background: "rgba(255,255,255,.02)", borderRadius: "12px",
                                border: "1px dashed rgba(255,255,255,.08)",
                            }}>
                                <div style={{ fontSize: "32px", marginBottom: "8px" }}>🔍</div>
                                <div style={{ fontSize: "13px", color: "#64748b" }}>
                                    {tr("Aradığınız hesap kodu bulunamadı.", "Kein Konto mit diesem Suchbegriff gefunden.")}
                                </div>
                            </div>
                        ) : (
                            <table style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>{tr("Kod", "Konto")}</th>
                                        <th style={thStyle}>{tr("Hesap Adı", "Kontobezeichnung")}</th>
                                        <th style={thStyle}>{tr("Açıklama", "Beschreibung")}</th>
                                        <th style={thStyle}>{tr("Anahtar Kelimeler", "Schlüsselwörter")}</th>
                                        <th style={thStyle}>{tr("Örnekler", "Beispiele")}</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Kategori", "Kategorie")}</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>{tr("KDV", "USt")}</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Taraf", "Seite")}</th>
                                        <th style={thStyle}>{tr("Klasse", "Klasse")}</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Fonk.", "Funkt.")}</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Ek", "Zusatz")}</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Bilanço", "Abschl.")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((acc, idx) => (
                                        <tr key={`${acc.code}-${idx}`} style={{ background: idx % 2 === 0 ? "rgba(255,255,255,.01)" : "transparent" }}>
                                            <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: KLASSE_COLORS[acc.klasse] || "#a78bfa" }}>
                                                {acc.code}
                                            </td>
                                            <td style={tdStyle}>{acc.name}</td>
                                            {(() => {
                                                const meta = ACCOUNT_METADATA[acc.code]; return <>
                                                    <td style={{ ...tdStyle, fontSize: '10px', color: '#94a3b8', maxWidth: '200px' }}>{meta?.description || <span style={{ color: '#334155' }}>—</span>}</td>
                                                    <td style={{ ...tdStyle, maxWidth: '180px' }}>
                                                        {meta?.keywords?.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>{meta.keywords.slice(0, 6).map((k, i) => <span key={i} style={{ padding: '1px 4px', borderRadius: '3px', fontSize: '8px', background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.2)', color: '#a78bfa', whiteSpace: 'nowrap' }}>{k}</span>)}{meta.keywords.length > 6 && <span style={{ fontSize: '8px', color: '#475569' }}>+{meta.keywords.length - 6}</span>}</div> : <span style={{ color: '#334155', fontSize: '10px' }}>—</span>}
                                                    </td>
                                                    <td style={{ ...tdStyle, fontSize: '10px', color: '#64748b', maxWidth: '200px' }}>{meta?.examples?.length ? meta.examples.slice(0, 2).join(', ') : <span style={{ color: '#334155' }}>—</span>}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        {meta?.kategorie ? <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: 600, background: `${KATEGORIE_COLORS[meta.kategorie] || '#64748b'}15`, border: `1px solid ${KATEGORIE_COLORS[meta.kategorie] || '#64748b'}30`, color: KATEGORIE_COLORS[meta.kategorie] || '#64748b', whiteSpace: 'nowrap' }}>{meta.kategorie}</span> : <span style={{ color: '#334155', fontSize: '10px' }}>—</span>}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: meta?.kdvRate ? '#22c55e' : '#334155' }}>{meta?.kdvRate || '—'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        {meta?.taraf ? <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, background: meta.taraf === 'S' ? 'rgba(59,130,246,.12)' : 'rgba(244,63,94,.12)', border: `1px solid ${meta.taraf === 'S' ? 'rgba(59,130,246,.3)' : 'rgba(244,63,94,.3)'}`, color: meta.taraf === 'S' ? '#3b82f6' : '#f43f5e' }}>{meta.taraf === 'S' ? 'Soll' : 'Haben'}</span> : <span style={{ color: '#334155', fontSize: '10px' }}>—</span>}
                                                    </td>
                                                </>;
                                            })()}
                                            <td style={tdStyle}>
                                                <span style={{
                                                    padding: "2px 8px", borderRadius: "6px", fontSize: "9px", fontWeight: 700,
                                                    background: `${KLASSE_COLORS[acc.klasse] || "#64748b"}18`,
                                                    color: KLASSE_COLORS[acc.klasse] || "#64748b",
                                                    border: `1px solid ${KLASSE_COLORS[acc.klasse] || "#64748b"}33`,
                                                }}>
                                                    {acc.klasse}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <FunktionBadge value={acc.funktion} labels={HAUPTFUNKTION_LABELS} colors={FUNKTION_COLORS} />
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <FunktionBadge value={acc.zusatzfunktion || ''} labels={ZUSATZFUNKTION_LABELS} colors={ZUSATZ_COLORS} />
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <FunktionBadge value={acc.abschlusszweck} labels={ABSCHLUSSZWECK_LABELS} colors={ABSCHLUSS_COLORS} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ) : (
                    /* Klasse tree view */
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {SKR03_FULL.map((kl) => {
                            const isOpen = expandedKlasse === kl.klasse;
                            const color = KLASSE_COLORS[kl.klasse] || "#8b5cf6";
                            const totalAccounts = kl.groups.reduce((s, g) => s + g.accounts.length, 0);

                            return (
                                <div key={kl.klasse}>
                                    {/* Klasse header */}
                                    <button
                                        onClick={() => toggleKlasse(kl.klasse)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: "12px", width: "100%",
                                            padding: "14px 16px", borderRadius: "12px",
                                            background: isOpen ? `${color}12` : "rgba(255,255,255,.02)",
                                            border: `1px solid ${isOpen ? color + "40" : "rgba(255,255,255,.06)"}`,
                                            cursor: "pointer", textAlign: "left",
                                            transition: "all .15s",
                                        }}
                                    >
                                        <div style={{
                                            width: "36px", height: "36px", borderRadius: "10px",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            background: `${color}20`, border: `1px solid ${color}40`,
                                            fontSize: "16px", fontWeight: 900, color,
                                            fontFamily: "monospace",
                                        }}>
                                            {kl.klasse}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: "14px", fontWeight: 700, color: isOpen ? color : "#e2e8f0" }}>
                                                {tr(`Klasse ${kl.klasse}`, `Klasse ${kl.klasse}`)}
                                            </div>
                                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                                {kl.label}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <span style={{
                                                padding: "3px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 700,
                                                background: `${color}15`, color, border: `1px solid ${color}30`,
                                            }}>
                                                {totalAccounts} {tr("hesap", "Konten")}
                                            </span>
                                            <span style={{
                                                padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700,
                                                background: `${color}15`, color,
                                            }}>
                                                {kl.groups.length} {tr("grup", "Gruppen")}
                                            </span>
                                            {isOpen ? <ChevronDown size={16} style={{ color }} /> : <ChevronRight size={16} style={{ color: "#64748b" }} />}
                                        </div>
                                    </button>

                                    {/* Groups */}
                                    {isOpen && (
                                        <div style={{ marginLeft: "24px", marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                            {kl.groups.map((gr, gi) => {
                                                const groupKey = `${kl.klasse}-${gi}`;
                                                const isGroupOpen = expandedGroup === groupKey;

                                                return (
                                                    <div key={groupKey}>
                                                        <button
                                                            onClick={() => toggleGroup(groupKey)}
                                                            style={{
                                                                display: "flex", alignItems: "center", gap: "10px", width: "100%",
                                                                padding: "10px 14px", borderRadius: "10px",
                                                                background: isGroupOpen ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.01)",
                                                                border: `1px solid ${isGroupOpen ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)"}`,
                                                                cursor: "pointer", textAlign: "left",
                                                                transition: "all .15s",
                                                            }}
                                                        >
                                                            <Layers size={14} style={{ color: isGroupOpen ? color : "#475569", flexShrink: 0 }} />
                                                            <div style={{ flex: 1, fontSize: "12px", fontWeight: 600, color: isGroupOpen ? "#e2e8f0" : "#94a3b8" }}>
                                                                {gr.title}
                                                            </div>
                                                            <span style={{
                                                                fontSize: "10px", fontWeight: 600, color: "#475569",
                                                                padding: "1px 6px", borderRadius: "4px",
                                                                background: "rgba(255,255,255,.04)",
                                                            }}>
                                                                {gr.accounts.length}
                                                            </span>
                                                            {isGroupOpen ? <ChevronDown size={14} style={{ color: "#64748b" }} /> : <ChevronRight size={14} style={{ color: "#374151" }} />}
                                                        </button>

                                                        {/* Accounts table */}
                                                        {isGroupOpen && (
                                                            <div style={{ marginLeft: "16px", marginTop: "4px", marginBottom: "8px" }}>
                                                                <table style={{ borderCollapse: "collapse" }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={thStyle}><Hash size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {tr("Kod", "Konto")}</th>
                                                                            <th style={thStyle}>{tr("Hesap Adı", "Kontobezeichnung")}</th>
                                                                            <th style={thStyle}>{tr("Açıklama", "Beschreibung")}</th>
                                                                            <th style={thStyle}>{tr("Anahtar Kelimeler", "Schlüsselwörter")}</th>
                                                                            <th style={thStyle}>{tr("Örnekler", "Beispiele")}</th>
                                                                            <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Kat.", "Kat.")}</th>
                                                                            <th style={{ ...thStyle, textAlign: 'center' }}>{tr("KDV", "USt")}</th>
                                                                            <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Taraf", "Seite")}</th>
                                                                            <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Fonk.", "Funkt.")}</th>
                                                                            <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Ek", "Zusatz")}</th>
                                                                            <th style={{ ...thStyle, textAlign: 'center' }}>{tr("Bilanço", "Abschl.")}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {gr.accounts.map((acc, ai) => (
                                                                            <tr key={acc.code} style={{
                                                                                background: ai % 2 === 0 ? "rgba(255,255,255,.015)" : "transparent",
                                                                            }}>
                                                                                <td style={{
                                                                                    ...tdStyle, fontFamily: "monospace", fontWeight: 700,
                                                                                    fontSize: "12px", color, width: "80px",
                                                                                }}>
                                                                                    {acc.code}
                                                                                </td>
                                                                                <td style={{ ...tdStyle, fontSize: "11px" }}>
                                                                                    {acc.name}
                                                                                </td>
                                                                                {(() => {
                                                                                    const meta = ACCOUNT_METADATA[acc.code]; return <>
                                                                                        <td style={{ ...tdStyle, fontSize: '10px', color: '#94a3b8', maxWidth: '200px' }}>{meta?.description || <span style={{ color: '#334155' }}>—</span>}</td>
                                                                                        <td style={{ ...tdStyle, maxWidth: '180px' }}>
                                                                                            {meta?.keywords?.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>{meta.keywords.slice(0, 5).map((k, i) => <span key={i} style={{ padding: '1px 4px', borderRadius: '3px', fontSize: '8px', background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.2)', color: '#a78bfa', whiteSpace: 'nowrap' }}>{k}</span>)}{meta.keywords.length > 5 && <span style={{ fontSize: '8px', color: '#475569' }}>+{meta.keywords.length - 5}</span>}</div> : <span style={{ color: '#334155', fontSize: '10px' }}>—</span>}
                                                                                        </td>
                                                                                        <td style={{ ...tdStyle, fontSize: '10px', color: '#64748b', maxWidth: '200px' }}>{meta?.examples?.length ? meta.examples.slice(0, 2).join(', ') : <span style={{ color: '#334155' }}>—</span>}</td>
                                                                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                                                            {meta?.kategorie ? <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: 600, background: `${KATEGORIE_COLORS[meta.kategorie] || '#64748b'}15`, border: `1px solid ${KATEGORIE_COLORS[meta.kategorie] || '#64748b'}30`, color: KATEGORIE_COLORS[meta.kategorie] || '#64748b', whiteSpace: 'nowrap' }}>{meta.kategorie}</span> : <span style={{ color: '#334155', fontSize: '10px' }}>—</span>}
                                                                                        </td>
                                                                                        <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: meta?.kdvRate ? '#22c55e' : '#334155' }}>{meta?.kdvRate || '—'}</td>
                                                                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                                                            {meta?.taraf ? <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, background: meta.taraf === 'S' ? 'rgba(59,130,246,.12)' : 'rgba(244,63,94,.12)', border: `1px solid ${meta.taraf === 'S' ? 'rgba(59,130,246,.3)' : 'rgba(244,63,94,.3)'}`, color: meta.taraf === 'S' ? '#3b82f6' : '#f43f5e' }}>{meta.taraf === 'S' ? 'Soll' : 'Haben'}</span> : <span style={{ color: '#334155', fontSize: '10px' }}>—</span>}
                                                                                        </td>
                                                                                    </>;
                                                                                })()}
                                                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                                                    <FunktionBadge value={acc.funktion} labels={HAUPTFUNKTION_LABELS} colors={FUNKTION_COLORS} />
                                                                                </td>
                                                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                                                    <FunktionBadge value={acc.zusatzfunktion || ''} labels={ZUSATZFUNKTION_LABELS} colors={ZUSATZ_COLORS} />
                                                                                </td>
                                                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                                                    <FunktionBadge value={acc.abschlusszweck} labels={ABSCHLUSSZWECK_LABELS} colors={ABSCHLUSS_COLORS} />
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

const thStyle: React.CSSProperties = {
    padding: "6px 10px",
    textAlign: "left",
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#475569",
    background: "rgba(255,255,255,.03)",
    borderBottom: "1px solid rgba(255,255,255,.06)",
};

const tdStyle: React.CSSProperties = {
    padding: "6px 10px",
    borderBottom: "1px solid rgba(255,255,255,.03)",
    fontSize: "12px",
    color: "#cbd5e1",
};
