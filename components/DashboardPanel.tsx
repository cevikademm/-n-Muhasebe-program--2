import React, { useMemo, useRef, useEffect, useState } from "react";
import { useLang } from "../LanguageContext";
import { MenuKey } from "../types";
import {
  Upload, FileText, BookOpen, PieChart,
  Settings, Image as ImageIcon, ArrowRight,
  TrendingUp, TrendingDown, Minus, Sparkles,
  Brain, Shield, Zap, CircleDot,
} from "lucide-react";
import { MagicCard } from "./ui/magic-card";

interface DashboardPanelProps {
  onNavigate: (menu: MenuKey) => void;
  onUploadInvoice?: (file: File) => void | Promise<void>;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M €";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K €";
  return fmt(n);
};

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// ─── Animated counter hook ─────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(target * ease));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

export const DashboardPanel: React.FC<DashboardPanelProps> = ({ onNavigate, onUploadInvoice }) => {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const invoices: any[] = [];
  const invoiceItems: any[] = [];
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const MONTHS = lang === "tr" ? MONTHS_TR : MONTHS_DE;
  const scrollRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const total = invoices.length;
    const volume = invoices.reduce((s, i) => s + (i.total_gross || 0), 0);
    const avg = total > 0 ? volume / total : 0;
    const pending = invoices.filter(i => i.status === "pending").length;
    const analyzed = invoices.filter(i => i.status === "analyzed").length;
    const duplicate = invoices.filter(i => i.status === "duplicate").length;
    const aiRate = total > 0 ? Math.round((analyzed / total) * 100) : 0;
    return { total, volume, avg, pending, analyzed, duplicate, aiRate };
  }, [invoices]);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const result = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { label: MONTHS[d.getMonth()], month: d.getMonth(), year: d.getFullYear(), value: 0, count: 0 };
    });
    invoices.forEach(inv => {
      if (!inv.invoice_date) return;
      const d = new Date(inv.invoice_date);
      result.forEach(r => {
        if (d.getFullYear() === r.year && d.getMonth() === r.month) {
          r.value += inv.total_gross || 0;
          r.count++;
        }
      });
    });
    return result;
  }, [invoices, MONTHS]);

  const maxMonthly = Math.max(...monthlyData.map(m => m.value), 1);
  const lastMonth = monthlyData[monthlyData.length - 1];
  const prevMonth = monthlyData[monthlyData.length - 2];
  const trend = prevMonth?.value > 0
    ? Math.round(((lastMonth.value - prevMonth.value) / prevMonth.value) * 100)
    : 0;

  const topSuppliers = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    invoices.forEach(inv => {
      const name = inv.supplier_name || tr("Bilinmiyor", "Unbekannt");
      if (!map[name]) map[name] = { total: 0, count: 0 };
      map[name].total += inv.total_gross || 0;
      map[name].count++;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([name, v]) => ({ name, ...v }));
  }, [invoices]);

  const recent = useMemo(() =>
    [...invoices]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5),
    [invoices]);

  const vatSummary = useMemo(() => {
    const vat19 = invoiceItems.filter(i => i.vat_rate === 19).reduce((s, i) => s + (i.vat_amount || 0), 0);
    const vat7 = invoiceItems.filter(i => i.vat_rate === 7).reduce((s, i) => s + (i.vat_amount || 0), 0);
    const net = invoices.reduce((s, i) => s + (i.total_net || 0), 0);
    const vat = invoices.reduce((s, i) => s + (i.total_vat || 0), 0);
    return { vat19, vat7, net, vat };
  }, [invoices, invoiceItems]);

  const statusMeta = (s: string) => {
    const m: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: tr("Bekliyor", "Ausstehend"), color: "#f59e0b", bg: "rgba(245,158,11,.12)" },
      analyzed: { label: tr("Analiz", "Analysiert"), color: "#10b981", bg: "rgba(16,185,129,.12)" },
      duplicate: { label: tr("Mükerrer", "Duplikat"), color: "#f43f5e", bg: "rgba(244,63,94,.12)" },
      error: { label: tr("Hata", "Fehler"), color: "#ef4444", bg: "rgba(239,68,68,.12)" },
      check: { label: tr("Kontrol", "Prüfung"), color: "#06b6d4", bg: "rgba(6,182,212,.12)" },
    };
    return m[s] || m.pending;
  };

  const animTotal = useCountUp(stats.total);
  const animAiRate = useCountUp(stats.aiRate);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // ─── KPI cards config ──────────────────────────────────────────
  const kpiCards = [
    {
      icon: <FileText size={18} />,
      val: animTotal.toString(),
      label: tr("Toplam Kayıt", "Einträge"),
      sub: tr(`${stats.analyzed} analiz tamamlandı`, `${stats.analyzed} analysiert`),
      accent: "#06b6d4",
      glow: "rgba(6,182,212,.15)",
      gradient: "linear-gradient(135deg, rgba(6,182,212,.1) 0%, rgba(6,182,212,.02) 100%)",
    },
    {
      icon: <TrendingUp size={18} />,
      val: fmtShort(stats.volume),
      label: tr("Toplam Hacim", "Gesamtvolumen"),
      sub: tr("Brüt toplam tutar", "Bruttosumme gesamt"),
      accent: "#10b981",
      glow: "rgba(16,185,129,.15)",
      gradient: "linear-gradient(135deg, rgba(16,185,129,.1) 0%, rgba(16,185,129,.02) 100%)",
    },
    {
      icon: <Brain size={18} />,
      val: animAiRate + "%",
      label: tr("AI Analiz Oranı", "KI-Analyse-Rate"),
      sub: tr("Otomatik sınıflandırma", "Automatische Klassif."),
      accent: "#8b5cf6",
      glow: "rgba(139,92,246,.15)",
      gradient: "linear-gradient(135deg, rgba(139,92,246,.1) 0%, rgba(139,92,246,.02) 100%)",
    },
    {
      icon: <Shield size={18} />,
      val: stats.pending.toString(),
      label: tr("İşlem Bekleyen", "Ausstehend"),
      sub: stats.pending > 0 ? tr("Dikkat gerekiyor", "Aufmerksamkeit nötig") : tr("Hepsi temizlendi ✓", "Alles erledigt ✓"),
      accent: stats.pending > 0 ? "#f59e0b" : "#10b981",
      glow: stats.pending > 0 ? "rgba(245,158,11,.15)" : "rgba(16,185,129,.15)",
      gradient: stats.pending > 0
        ? "linear-gradient(135deg, rgba(245,158,11,.1) 0%, rgba(245,158,11,.02) 100%)"
        : "linear-gradient(135deg, rgba(16,185,129,.1) 0%, rgba(16,185,129,.02) 100%)",
      pulse: stats.pending > 0,
    },
  ];

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        height: "100%", overflowY: "auto",
        background: "linear-gradient(160deg, #ffffff 0%, #f8fafc 50%, #ffffff 100%)",
      }}
    >
      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div className="dp-hero" style={{
        position: "relative", overflow: "hidden",
        padding: "32px 32px 28px",
        borderBottom: "1px solid #e2e8f0",
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
        flexShrink: 0,
      }}>
        {/* Background grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(6,182,212,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,.025) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />
        {/* Glow orbs */}
        <div style={{
          position: "absolute", top: "-40px", right: "10%",
          width: "220px", height: "220px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,182,212,.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-30px", left: "30%",
          width: "160px", height: "160px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Eyebrow */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "4px 10px 4px 8px",
              borderRadius: "20px",
              background: "rgba(6,182,212,.08)",
              border: "1px solid rgba(6,182,212,.15)",
              marginBottom: "12px",
            }}>
              <Sparkles size={11} style={{ color: "#06b6d4" }} />
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: ".08em", textTransform: "uppercase" }}>
                {tr("Canlı Görünüm", "Live-Ansicht")}
              </span>
            </div>

            <h1 className="dp-title" style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800,
              fontSize: "28px", color: "#f1f5f9", lineHeight: 1.1,
              margin: 0,
              background: "linear-gradient(135deg, #f1f5f9 30%, #94a3b8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              {tr("Muhasebe Merkezi", "Buchhaltungs-Hub")}
            </h1>
            <p className="hidden sm:block" style={{ fontSize: "13px", color: "#64748b", marginTop: "6px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {tr("Tüm finansal verileriniz tek ekranda", "Alle Finanzdaten auf einen Blick")}
            </p>
          </div>

          <button
            onClick={() => onNavigate("bankDocuments")}
            className="dp-hero-btn"
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "11px 20px",
              borderRadius: "12px",
              border: "1px solid rgba(6,182,212,.3)",
              background: "linear-gradient(135deg, rgba(6,182,212,.15), rgba(6,182,212,.05))",
              color: "#06b6d4",
              fontSize: "13px", fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              cursor: "pointer",
              transition: "all .2s",
              flexShrink: 0,
              backdropFilter: "blur(10px)",
              boxShadow: "0 0 20px rgba(6,182,212,.1), inset 0 1px 0 rgba(255,255,255,.05)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(6,182,212,.25), rgba(6,182,212,.1))";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 30px rgba(6,182,212,.2), inset 0 1px 0 rgba(255,255,255,.05)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(6,182,212,.15), rgba(6,182,212,.05))";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 20px rgba(6,182,212,.1), inset 0 1px 0 rgba(255,255,255,.05)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            }}
          >
            <Upload size={15} />
            <span className="hidden xs:inline">{tr("Banka Dökümanı", "Bankdokumente")}</span>
            <span className="xs:hidden">{tr("Yükle", "Laden")}</span>
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="dp-content" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", paddingBottom: "32px" }}>

        {/* ── Upload Shortcut (büyük, dikkat çekici, mobil uyumlu) ── */}
        <input
          ref={uploadInputRef}
          type="file"
          accept="application/pdf,image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && onUploadInvoice) onUploadInvoice(f);
            if (e.target) e.target.value = "";
          }}
        />
        <button
          onClick={() => uploadInputRef.current?.click()}
          className="dp-upload-shortcut"
          style={{
            position: "relative", overflow: "hidden",
            width: "100%",
            display: "flex", alignItems: "center", gap: "20px",
            padding: "26px 28px",
            borderRadius: "20px",
            border: "1px solid rgba(6,182,212,.35)",
            background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 45%, #8b5cf6 100%)",
            color: "#ffffff",
            cursor: "pointer",
            textAlign: "left",
            boxShadow: "0 18px 50px rgba(6,182,212,.35), 0 0 0 1px rgba(255,255,255,.08) inset",
            transition: "transform .2s, box-shadow .2s",
            animation: "fadeUp .4s ease both",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-3px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 24px 60px rgba(6,182,212,.5), 0 0 0 1px rgba(255,255,255,.12) inset";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 18px 50px rgba(6,182,212,.35), 0 0 0 1px rgba(255,255,255,.08) inset";
          }}
        >
          {/* parıltı orb */}
          <div style={{
            position: "absolute", top: "-60px", right: "-60px",
            width: "240px", height: "240px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,.25) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: "-50px", left: "20%",
            width: "180px", height: "180px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,.35) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <div className="dp-upload-icon" style={{
            flexShrink: 0,
            width: "64px", height: "64px",
            borderRadius: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,.18)",
            border: "1px solid rgba(255,255,255,.25)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 8px 24px rgba(0,0,0,.18)",
            position: "relative", zIndex: 1,
          }}>
            <Upload size={30} strokeWidth={2.4} />
          </div>

          <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "22px", fontWeight: 800, lineHeight: 1.15,
              letterSpacing: "-.01em",
            }}>
              {tr("Fatura Yükle", "Rechnung hochladen")}
            </div>
            <div className="dp-upload-sub" style={{
              fontSize: "13px", fontWeight: 500, opacity: .92, marginTop: "4px",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              {tr("PDF veya görsel — saniyeler içinde AI ile analiz", "PDF oder Bild — KI-Analyse in Sekunden")}
            </div>
          </div>

          <div className="dp-upload-cta" style={{
            flexShrink: 0,
            display: "flex", alignItems: "center", gap: "8px",
            padding: "12px 18px",
            borderRadius: "12px",
            background: "rgba(255,255,255,.18)",
            border: "1px solid rgba(255,255,255,.3)",
            fontSize: "13px", fontWeight: 700,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            backdropFilter: "blur(12px)",
            position: "relative", zIndex: 1,
          }}>
            {tr("Başla", "Los")} <ArrowRight size={16} />
          </div>
        </button>

        {/* ── KPI Cards ── */}
        <div className="dp-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
          {kpiCards.map((card, i) => (
            <MagicCard
              key={i}
              gradientColor={card.glow}
              style={{
                position: "relative", overflow: "hidden",
                borderRadius: "16px",
                border: `1px solid ${card.accent}22`,
                background: card.gradient,
                padding: "20px",
                transition: "transform .2s, box-shadow .2s",
                cursor: "default",
                animation: `fadeUp .4s ease both`,
                animationDelay: `${i * 60}ms`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 16px 36px ${card.glow}`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
              }}
            >
              {/* Corner glow */}
              <div style={{
                position: "absolute", top: 0, right: 0,
                width: "80px", height: "80px",
                background: `radial-gradient(circle at top right, ${card.glow} 0%, transparent 70%)`,
                pointerEvents: "none",
              }} />
              {/* Top border glow */}
              <div style={{
                position: "absolute", top: 0, left: "15%", right: "15%", height: "1px",
                background: `linear-gradient(90deg, transparent, ${card.accent}55, transparent)`,
              }} />

              {/* Pulse dot */}
              {card.pulse && (
                <div style={{
                  position: "absolute", top: "14px", right: "14px",
                  width: "8px", height: "8px", borderRadius: "50%",
                  background: card.accent,
                  boxShadow: `0 0 10px ${card.accent}`,
                  animation: "pulse-dot 1.5s infinite",
                }} />
              )}

              {/* Icon */}
              <div style={{
                display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                width: "36px", height: "36px",
                borderRadius: "10px",
                background: `${card.accent}18`,
                border: `1px solid ${card.accent}30`,
                color: card.accent,
                marginBottom: "14px",
              }}>
                {card.icon}
              </div>

              {/* Value */}
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 800,
                fontSize: "22px",
                color: card.accent,
                lineHeight: 1,
                marginBottom: "6px",
                letterSpacing: "-.5px",
              }}>
                {card.val}
              </div>

              {/* Label */}
              <div style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#4b5563",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: "4px",
              }}>
                {card.label}
              </div>

              {/* Sub */}
              <div style={{ fontSize: "11px", color: "#475569", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {card.sub}
              </div>
            </MagicCard>
          ))}
        </div>

        {/* ── Middle Row: Chart + VAT ── */}
        <div className="dp-chart" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "16px" }}>

          {/* ── Aylık Hacim Grafiği ── */}
          <MagicCard
            gradientColor="rgba(6, 182, 212, 0.12)"
            style={{
              borderRadius: "18px",
              border: "1px solid #e2e8f0",
              background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
              padding: "24px",
              position: "relative",
              overflow: "hidden",
            }}>
            {/* bg decoration */}
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: "200px", height: "150px",
              background: "radial-gradient(circle at bottom right, rgba(6,182,212,.04) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
              <div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0", marginBottom: "4px" }}>
                  {tr("Aylık Ciro Hacmi", "Monatliches Volumen")}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {tr("Son 6 ay — Brüt €", "Letzte 6 Monate — Brutto €")}
                </div>
              </div>

              {/* Trend badge */}
              <div style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "5px 10px", borderRadius: "20px",
                background: trend > 0 ? "rgba(16,185,129,.12)" : trend < 0 ? "rgba(244,63,94,.12)" : "rgba(100,116,139,.12)",
                border: `1px solid ${trend > 0 ? "rgba(16,185,129,.25)" : trend < 0 ? "rgba(244,63,94,.25)" : "rgba(100,116,139,.2)"}`,
                color: trend > 0 ? "#10b981" : trend < 0 ? "#f43f5e" : "#64748b",
              }}>
                {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {trend > 0 ? "+" : ""}{trend}%
                </span>
              </div>
            </div>

            {/* SVG Sütun (Column) Bar Chart */}
            {(() => {
              const svgH = 110;
              const W = 500;
              const padL = 4;
              const padR = 4;
              const padT = 18;    // value label için üst boşluk
              const padB = 18;    // ay etiketi için alt boşluk
              const chartH = svgH - padT - padB;
              const n = monthlyData.length;
              const slot = n > 0 ? (W - padL - padR) / n : W;
              const barW = Math.max(slot * 0.55, 6);
              const maxV = Math.max(...monthlyData.map(m => m.value), 1);

              const barH = (v: number) =>
                v > 0 ? Math.max((v / maxV) * chartH, 4) : 0;
              const barX = (i: number) =>
                padL + i * slot + (slot - barW) / 2;
              const barY = (v: number) =>
                padT + chartH - barH(v);
              const midX = (i: number) =>
                padL + i * slot + slot / 2;

              return (
                <svg
                  viewBox={`0 0 ${W} ${svgH}`}
                  width="100%"
                  style={{ display: "block", overflow: "visible" }}
                  preserveAspectRatio="none"
                >
                  <defs>
                    {/* Her sütun için aynı gradient — hovered sütun daha parlak */}
                    <linearGradient id="dp-bar-normal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.85" />
                      <stop offset="100%" stopColor="#0891b2" stopOpacity="0.30" />
                    </linearGradient>
                    <linearGradient id="dp-bar-hover" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="1" />
                      <stop offset="100%" stopColor="#0e7490" stopOpacity="0.55" />
                    </linearGradient>
                    <linearGradient id="dp-bar-last" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.95" />
                      <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.35" />
                    </linearGradient>
                    <filter id="dp-bar-glow">
                      <feGaussianBlur stdDeviation="2.5" result="b" />
                      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>

                  {/* Yatay grid çizgileri */}
                  {[0.25, 0.5, 0.75, 1].map(f => {
                    const y = padT + chartH * (1 - f);
                    return (
                      <g key={f}>
                        <line x1={padL} y1={y} x2={W - padR} y2={y}
                          stroke="#e2e8f0" strokeWidth="1" strokeDasharray="5,4" />
                        <text x={padL} y={y - 2}
                          fill="#94a3b8" fontSize="7" fontFamily="monospace">
                          {fmtShort(maxV * f)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Taban çizgisi */}
                  <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH}
                    stroke="#cbd5e1" strokeWidth="1" />

                  {/* Sütunlar */}
                  {monthlyData.map((m, i) => {
                    const isLast = i === n - 1;
                    const isH = hoveredMonth === i;
                    const bH = barH(m.value);
                    const bX = barX(i);
                    const bY = barY(m.value);
                    const cx = midX(i);
                    const grad = isH ? "url(#dp-bar-hover)"
                      : isLast ? "url(#dp-bar-last)"
                        : "url(#dp-bar-normal)";
                    return (
                      <g key={i}
                        onMouseEnter={() => setHoveredMonth(i)}
                        onMouseLeave={() => setHoveredMonth(null)}
                        style={{ cursor: "default" }}
                      >
                        {/* Hit area — tüm sütun yüksekliği boyunca */}
                        <rect x={bX - 2} y={padT} width={barW + 4} height={chartH}
                          fill="transparent" />

                        {/* Sütun gövdesi */}
                        {bH > 0 && (
                          <rect
                            x={bX} y={bY}
                            width={barW} height={bH}
                            rx="3" ry="3"
                            fill={grad}
                            style={{
                              filter: (isH || isLast)
                                ? "drop-shadow(0 0 6px rgba(6,182,212,0.55))"
                                : "none",
                              transition: "filter .15s",
                            }}
                          />
                        )}

                        {/* Sütun üst çizgisi (parlak şerit) */}
                        {bH > 2 && (
                          <rect
                            x={bX} y={bY}
                            width={barW} height={2}
                            rx="2" ry="2"
                            fill={isH ? "#e2e8f0" : isLast ? "#c4b5fd" : "#22d3ee"}
                            opacity={0.9}
                          />
                        )}

                        {/* Değer etiketi — hover veya son ay */}
                        {(isH || isLast) && m.value > 0 && (
                          <text x={cx} y={bY - 5}
                            textAnchor="middle"
                            fill={isLast ? "#a78bfa" : "#06b6d4"}
                            fontSize="8" fontFamily="monospace" fontWeight="bold">
                            {fmtShort(m.value)}
                          </text>
                        )}

                        {/* Ay etiketi */}
                        <text x={cx} y={padT + chartH + 12}
                          textAnchor="middle"
                          fill={isLast || isH ? "#06b6d4" : "#94a3b8"}
                          fontSize="9" fontFamily="monospace"
                          fontWeight={isLast || isH ? "700" : "400"}>
                          {m.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </MagicCard>

          {/* ── Vorsteuer Özeti ── */}
          <MagicCard
            gradientColor="rgba(139, 92, 246, 0.12)"
            style={{
              borderRadius: "18px",
              border: "1px solid #e2e8f0",
              background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: "hidden",
            }}>
            <div style={{
              position: "absolute", top: "-20px", right: "-20px",
              width: "110px", height: "110px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(139,92,246,.06) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0", marginBottom: "4px" }}>
                {tr("Vorsteuer Özeti", "Vorsteuer-Übersicht")}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {tr("İndirilebilir KDV", "Abziehbare Vorsteuer")}
              </div>
            </div>

            {/* SVG Donut Ring */}
            {(() => {
              const cx = 50; const cy = 50; const R = 37;
              const circ = 2 * Math.PI * R;
              const gross = vatSummary.net + vatSummary.vat;
              const GAP = (4 / 360) * circ;
              const vatSegs = gross > 0
                ? [
                  { label: tr("Net", "Netto"), value: vatSummary.net, color: "#06b6d4" },
                  { label: tr("KDV 19%", "USt 19%"), value: vatSummary.vat19, color: "#10b981" },
                  { label: tr("KDV 7%", "USt 7%"), value: vatSummary.vat7, color: "#f59e0b" },
                ].filter(s => s.value > 0)
                : [];
              let cumLen = 0;
              const segs = vatSegs.map(s => {
                const pct = s.value / gross;
                const fullLen = pct * circ;
                const drawLen = Math.max(fullLen - GAP, 0);
                const dashOffset = circ - cumLen;
                cumLen += fullLen;
                return { ...s, pct, drawLen, dashOffset };
              });
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
                  <svg width="100" height="100" viewBox="0 0 100 100" style={{ overflow: "visible" }}>
                    {/* Track */}
                    <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e2e8f0" strokeWidth="8"
                      transform={`rotate(-90 ${cx} ${cy})`} />
                    {/* Arc segments */}
                    {segs.map((s, i) => (
                      <circle key={i} cx={cx} cy={cy} r={R}
                        fill="none" stroke={s.color} strokeWidth="8"
                        strokeDasharray={`${s.drawLen} ${circ - s.drawLen}`}
                        strokeDashoffset={s.dashOffset}
                        strokeLinecap="butt" opacity="0.9"
                        transform={`rotate(-90 ${cx} ${cy})`}
                        style={{ filter: `drop-shadow(0 0 5px ${s.color}80)` }}
                      />
                    ))}
                    {/* Center */}
                    <circle cx={cx} cy={cy} r={27} fill="#ffffff" />
                    <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle"
                      fill="#64748b" fontSize="7" fontFamily="monospace">
                      {tr("Net", "Netto")}
                    </text>
                    <text x={cx} y={cy + 7} textAnchor="middle" dominantBaseline="middle"
                      fill="#06b6d4" fontSize="9" fontFamily="monospace" fontWeight="bold">
                      {fmtShort(vatSummary.net)}
                    </text>
                  </svg>
                </div>
              );
            })()}

            {/* Rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
              {[
                { label: tr("Net Tutar", "Nettobetrag"), value: vatSummary.net, color: "#06b6d4" },
                { label: tr("Toplam KDV", "Gesamt-USt"), value: vatSummary.vat, color: "#8b5cf6" },
                { label: tr("%19 Vorsteuer", "VSt 19%"), value: vatSummary.vat19, color: "#10b981" },
                { label: tr("%7 Vorsteuer", "VSt 7%"), value: vatSummary.vat7, color: "#f59e0b" },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                    <div style={{
                      width: "8px", height: "8px", borderRadius: "2px", flexShrink: 0,
                      background: row.color,
                      boxShadow: `0 0 6px ${row.color}80`,
                    }} />
                    <span style={{ fontSize: "11px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap" }}>
                      {row.label}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>
                    {fmtShort(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </MagicCard>
        </div>

        {/* ── Bottom Row: Suppliers + Recent Invoices ── */}
        <div className="dp-bottom" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

          {/* Top Suppliers */}
          <MagicCard
            gradientColor="rgba(16, 185, 129, 0.12)"
            style={{
              borderRadius: "18px",
              border: "1px solid #e2e8f0",
              background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
              padding: "22px",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                  {tr("Top Tedarikçiler", "Top-Lieferanten")}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: "3px" }}>
                  {tr("Hacme göre sıralı", "Nach Volumen sortiert")}
                </div>
              </div>
              <Zap size={14} style={{ color: "#f59e0b" }} />
            </div>

            {topSuppliers.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center", color: "#475569", fontSize: "12px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {tr("Henüz veri yok", "Noch keine Daten")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {topSuppliers.map((s, i) => {
                  const pct = stats.volume > 0 ? (s.total / stats.volume) * 100 : 0;
                  const colors = ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e"];
                  const color = colors[i % colors.length];
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          <div style={{
                            width: "22px", height: "22px", borderRadius: "6px",
                            background: `${color}18`,
                            border: `1px solid ${color}30`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            <span style={{ fontSize: "9px", fontWeight: 800, color, fontFamily: "'Space Grotesk', sans-serif" }}>
                              {i + 1}
                            </span>
                          </div>
                          <span style={{ fontSize: "12px", color: "#94a3b8", fontFamily: "'Plus Jakarta Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>
                            {s.name}
                          </span>
                          <span style={{ fontSize: "10px", color: "#475569", fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}>
                            {s.count}×
                          </span>
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>
                          {fmtShort(s.total)}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div style={{ height: "3px", borderRadius: "3px", background: "#e2e8f0", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: "3px",
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${color}90, ${color})`,
                          boxShadow: `0 0 8px ${color}50`,
                          transition: "width .8s cubic-bezier(.34,1.56,.64,1)",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </MagicCard>

          {/* Recent Invoices */}
          <MagicCard
            gradientColor="rgba(6, 182, 212, 0.12)"
            style={{
              borderRadius: "18px",
              border: "1px solid #e2e8f0",
              background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
              padding: "22px",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                  {tr("Son İşlemler", "Letzte Aktivitäten")}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: "3px" }}>
                  {tr("Son aktiviteler", "Letzte Aktivitäten")}
                </div>
              </div>
              <button
                onClick={() => onNavigate("dashboard")}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  fontSize: "11px", fontWeight: 600, color: "#06b6d4",
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  padding: "4px 8px", borderRadius: "6px",
                  transition: "background .15s",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(6,182,212,.08)"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "none"}
              >
                {tr("Tümü", "Alle")} <ArrowRight size={11} />
              </button>
            </div>

            {recent.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center", color: "#475569", fontSize: "12px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {tr("Henüz veri yok", "Noch keine Daten")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {recent.map(inv => {
                  const sMeta = statusMeta(inv.status);
                  return (
                    <div
                      key={inv.id}
                      onClick={() => onNavigate("dashboard")}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "9px 10px", borderRadius: "10px",
                        cursor: "pointer",
                        border: "1px solid transparent",
                        transition: "all .15s",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,.025)";
                        (e.currentTarget as HTMLDivElement).style.borderColor = "#cbd5e1";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                        (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: "34px", height: "34px", borderRadius: "9px",
                        background: "#e2e8f0", border: "1px solid #e2e8f0",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {inv.file_type?.includes("pdf")
                          ? <FileText size={14} style={{ color: "#4b5563" }} />
                          : <ImageIcon size={14} style={{ color: "#4b5563" }} />}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: "12px", fontWeight: 500, color: "#94a3b8",
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {inv.supplier_name || tr("Bilinmiyor", "Unbekannt")}
                        </div>
                        <div style={{ fontSize: "10px", color: "#475569", fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: "2px" }}>
                          {inv.invoice_date || "—"}
                        </div>
                      </div>

                      {/* Amount + status */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", fontFamily: "'Space Mono', monospace" }}>
                          {fmtShort(inv.total_gross || 0)}
                        </div>
                        <div style={{
                          display: "inline-block",
                          marginTop: "3px",
                          padding: "2px 7px",
                          borderRadius: "20px",
                          background: sMeta.bg,
                          color: sMeta.color,
                          fontSize: "9px", fontWeight: 700,
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          letterSpacing: ".04em",
                        }}>
                          {sMeta.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </MagicCard>
        </div>

        {/* ── Quick Actions ── */}
        <div className="dp-actions" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {[
            { icon: <Upload size={22} />, label: tr("Raporlar", "Berichte"), desc: tr("Dönem analizi", "Periodenanalyse"), menu: "reports", accent: "#06b6d4" },
            { icon: <BookOpen size={22} />, label: tr("Hesap Planları", "Kontenplan"), desc: tr("SKR03 / SKR04", "SKR03 / SKR04"), menu: "accountPlans", accent: "#8b5cf6" },
            { icon: <PieChart size={22} />, label: tr("Raporlar", "Berichte"), desc: tr("Dönem analizi", "Periodenanalyse"), menu: "reports", accent: "#10b981" },
            { icon: <Settings size={22} />, label: tr("Ayarlar", "Einstellungen"), desc: tr("Şirket & Kurallar", "Firma & Regeln"), menu: "settings", accent: "#f59e0b" },
          ].map((item, i) => (
            <button
              key={i}
              onClick={() => onNavigate(item.menu as MenuKey)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start",
                gap: "12px", padding: "20px",
                borderRadius: "16px",
                border: `1px solid ${item.accent}18`,
                background: `linear-gradient(135deg, ${item.accent}0a 0%, transparent 100%)`,
                cursor: "pointer", textAlign: "left",
                transition: "all .2s",
                position: "relative", overflow: "hidden",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${item.accent}40`;
                (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(135deg, ${item.accent}16 0%, ${item.accent}05 100%)`;
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 12px 30px ${item.accent}18`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${item.accent}18`;
                (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(135deg, ${item.accent}0a 0%, transparent 100%)`;
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
              }}
            >
              {/* Corner decoration */}
              <div style={{
                position: "absolute", top: 0, right: 0,
                width: "60px", height: "60px",
                background: `radial-gradient(circle at top right, ${item.accent}12 0%, transparent 70%)`,
                pointerEvents: "none",
              }} />
              {/* Top stripe */}
              <div style={{
                position: "absolute", top: 0, left: "20%", right: "20%", height: "1px",
                background: `linear-gradient(90deg, transparent, ${item.accent}40, transparent)`,
              }} />

              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "42px", height: "42px", borderRadius: "12px",
                background: `${item.accent}14`,
                border: `1px solid ${item.accent}25`,
                color: item.accent,
              }}>
                {item.icon}
              </div>

              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#c4c9d4", fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: "3px" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: "10px", color: "#64748b", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {item.desc}
                </div>
              </div>

              <CircleDot size={10} style={{ color: item.accent, marginTop: "auto", opacity: 0.5 }} />
            </button>
          ))}
        </div>
      </div>

      {/* CSS */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Mobile responsive ── */
        @media (max-width: 767px) {
          .dp-hero  { padding: 16px 14px 12px !important; }
          .dp-title { font-size: 20px !important; }
          .dp-hero-btn { padding: 9px 14px !important; font-size: 12px !important; }
          .dp-content { padding: 12px !important; gap: 12px !important; padding-bottom: 80px !important; }
          .dp-kpi   { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .dp-chart { grid-template-columns: 1fr !important; }
          .dp-bottom { grid-template-columns: 1fr !important; }
          .dp-actions { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .dp-upload-shortcut { padding: 18px 16px !important; gap: 14px !important; border-radius: 16px !important; }
          .dp-upload-icon { width: 50px !important; height: 50px !important; border-radius: 14px !important; }
          .dp-upload-shortcut .dp-upload-sub { display: none !important; }
          .dp-upload-cta { padding: 9px 12px !important; font-size: 12px !important; }
        }

        /* ── Tablet ── */
        @media (min-width: 768px) and (max-width: 1023px) {
          .dp-kpi   { grid-template-columns: repeat(2, 1fr) !important; }
          .dp-chart { grid-template-columns: 1fr !important; }
          .dp-actions { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div >
  );
};