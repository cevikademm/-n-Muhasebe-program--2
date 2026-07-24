import React, { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SmMetrikGun, SmPlatform } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK, PLATFORM_META } from "../ortak";

interface Props {
  metrikler: SmMetrikGun[];
  lang: string;
  /** Grafik yüksekliği (px) — dar ekranda düşürülür. */
  yukseklik?: number;
}

/** viewBox koordinat sistemi; kap genişliğinden bağımsız, %100'e ölçeklenir. */
const G = 100;   // genişlik birimi
const Y = 40;    // yükseklik birimi
const PAD = { sol: 1, sag: 1, ust: 3, alt: 3 };

const sayi = (n: number) => new Intl.NumberFormat("de-DE").format(n);

/**
 * Takipçi gelişimi — TEK SERİLİ çizgi.
 *
 * Neden tek seri: platformlar aynı eksende çizilemez (bir kanalın 200
 * abonesiyle bir hesabın 5.000 takipçisi aynı ölçekte anlamsız görünür) ve
 * iki y ekseni kullanmak grafik hatalarının bir numarasıdır. Platform
 * seçilir, her platform kendi ölçeğinde okunur.
 *
 * Kütüphane yok: proje inline-style ve bağımlılıksız ilerliyor, tek çizgi
 * için 100 KB'lık bir grafik paketi eklemek orantısız olurdu.
 */
export const TakipciGrafigi: React.FC<Props> = ({ metrikler, lang, yukseklik = 190 }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const platformlar = useMemo(
    () => Array.from(new Set(metrikler.map((m) => m.platform))) as SmPlatform[],
    [metrikler],
  );
  const [platform, setPlatform] = useState<SmPlatform | null>(null);
  const aktifPlatform = platform && platformlar.includes(platform) ? platform : platformlar[0];

  const noktalar = useMemo(() => {
    if (!aktifPlatform) return [];
    return metrikler
      .filter((m) => m.platform === aktifPlatform && m.takipci != null)
      .map((m) => ({ tarih: m.tarih, deger: Number(m.takipci) }))
      .sort((a, b) => a.tarih.localeCompare(b.tarih));
  }, [metrikler, aktifPlatform]);

  const [vurgu, setVurgu] = useState<number | null>(null);

  if (noktalar.length < 2) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        padding: "26px 16px", borderRadius: 12, textAlign: "center",
        background: "var(--panel-2)", border: "1px dashed var(--border-md)",
      }}>
        <Minus size={18} style={{ color: "var(--text-3)" }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
          {tr("Grafik için en az iki günlük ölçüm gerekiyor",
              "Für den Verlauf sind mindestens zwei Messtage nötig")}
        </span>
        <span style={{
          fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK,
          maxWidth: 340, lineHeight: 1.5,
        }}>
          {tr("Hesap seviyesi takipçi/erişim anlık görüntüsü sm_metrics tablosuna günlük yazılır; iki gün biriktiğinde çizgi burada belirir.",
              "Der tägliche Konto-Snapshot landet in sm_metrics; ab dem zweiten Tag erscheint hier die Kurve.")}
        </span>
      </div>
    );
  }

  const degerler = noktalar.map((n) => n.deger);
  const enAz = Math.min(...degerler);
  const enCok = Math.max(...degerler);
  // Düz çizgide (tüm değerler eşit) sıfıra bölmeyi engelle.
  const aralik = enCok - enAz || 1;

  const x = (i: number) =>
    PAD.sol + (i * (G - PAD.sol - PAD.sag)) / Math.max(1, noktalar.length - 1);
  const y = (v: number) =>
    Y - PAD.alt - ((v - enAz) / aralik) * (Y - PAD.ust - PAD.alt);

  const cizgi = noktalar.map((n, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(n.deger).toFixed(2)}`).join(" ");
  const alan = `${cizgi} L${x(noktalar.length - 1).toFixed(2)},${Y - PAD.alt} L${x(0).toFixed(2)},${Y - PAD.alt} Z`;

  const ilk = degerler[0];
  const son = degerler[degerler.length - 1];
  const fark = son - ilk;
  const yuzde = ilk > 0 ? Math.round((100 * fark) / ilk) : null;
  const YonIkon = fark > 0 ? TrendingUp : fark < 0 ? TrendingDown : Minus;
  const yonRenk = fark > 0 ? "#10b981" : fark < 0 ? "#ef4444" : "var(--text-3)";

  const tarihKisa = (t: string) =>
    new Date(`${t}T12:00:00`).toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE", {
      day: "2-digit", month: "2-digit",
    });

  const vurgulanan = vurgu != null ? noktalar[vurgu] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
      {/* Başlık + değişim + platform seçimi */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-.01em",
          color: "var(--text-1)", fontFamily: FONT_BASLIK,
        }}>
          {sayi(son)}
        </span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 11.5, fontWeight: 700, color: yonRenk, fontFamily: FONT_BASLIK,
        }}>
          <YonIkon size={13} />
          {fark >= 0 ? "+" : ""}{sayi(fark)}
          {yuzde != null && ` (${fark >= 0 ? "+" : ""}${yuzde}%)`}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
          {tr("takipçi", "Follower")} · {noktalar.length} {tr("gün", "Tage")}
        </span>

        {platformlar.length > 1 && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {platformlar.map((p) => {
              const aktif = p === aktifPlatform;
              const [ad] = PLATFORM_META[p] ?? ["—"];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setPlatform(p); setVurgu(null); }}
                  style={{
                    padding: "4px 9px", borderRadius: 8, cursor: "pointer",
                    fontSize: 10.5, fontWeight: 700, fontFamily: FONT_METIN,
                    background: aktif ? `${SM_RENK}18` : "var(--panel-2)",
                    color: aktif ? SM_RENK : "var(--text-2)",
                    border: `1px solid ${aktif ? `${SM_RENK}45` : "var(--border)"}`,
                  }}
                >
                  {ad}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Çizim alanı */}
      <div style={{ position: "relative", width: "100%", height: yukseklik }}>
        <svg
          viewBox={`0 0 ${G} ${Y}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
          role="img"
          aria-label={tr(
            `Takipçi gelişimi: ${sayi(ilk)} → ${sayi(son)}`,
            `Follower-Verlauf: ${sayi(ilk)} → ${sayi(son)}`,
          )}
        >
          <defs>
            <linearGradient id="sm-takipci-dolgu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SM_RENK} stopOpacity="0.22" />
              <stop offset="100%" stopColor={SM_RENK} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Izgara geri planda: veriyle yarışmaz */}
          {[0, 0.5, 1].map((o) => (
            <line
              key={o}
              x1={PAD.sol} x2={G - PAD.sag}
              y1={PAD.ust + o * (Y - PAD.ust - PAD.alt)}
              y2={PAD.ust + o * (Y - PAD.ust - PAD.alt)}
              stroke="var(--border)" strokeWidth="0.15"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={alan} fill="url(#sm-takipci-dolgu)" />
          <path
            d={cizgi}
            fill="none"
            stroke={SM_RENK}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Son nokta her zaman işaretli — "şu an neredeyiz" */}
          <circle
            cx={x(noktalar.length - 1)} cy={y(son)} r="4"
            fill={SM_RENK} stroke="var(--panel)" strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {vurgu != null && (
            <>
              <line
                x1={x(vurgu)} x2={x(vurgu)} y1={PAD.ust} y2={Y - PAD.alt}
                stroke={SM_RENK} strokeWidth="1" strokeDasharray="3 3" opacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(vurgu)} cy={y(noktalar[vurgu].deger)} r="4.5"
                fill={SM_RENK} stroke="var(--panel)" strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* Fare hedefleri: işaretten büyük şeritler — 3px noktayı avlamak zorunda kalma */}
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {noktalar.map((n, i) => (
            <div
              key={n.tarih}
              onMouseEnter={() => setVurgu(i)}
              onFocus={() => setVurgu(i)}
              onMouseLeave={() => setVurgu(null)}
              onBlur={() => setVurgu(null)}
              tabIndex={0}
              aria-label={`${tarihKisa(n.tarih)}: ${sayi(n.deger)}`}
              style={{ flex: 1, cursor: "crosshair", outline: "none" }}
            />
          ))}
        </div>

        {/* İpucu — çizginin üstünde, kabın içinde kalır */}
        {vurgulanan && (
          <div style={{
            position: "absolute", top: 0,
            left: `${(vurgu! / Math.max(1, noktalar.length - 1)) * 100}%`,
            transform: `translateX(${vurgu === 0 ? "0" : vurgu === noktalar.length - 1 ? "-100%" : "-50%"})`,
            padding: "5px 8px", borderRadius: 8, pointerEvents: "none",
            background: "var(--panel)", border: "1px solid var(--border-md)",
            boxShadow: "0 6px 18px rgba(2,6,23,.18)", whiteSpace: "nowrap",
          }}>
            <div style={{ fontSize: 9.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tarihKisa(vurgulanan.tarih)}
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK }}>
              {sayi(vurgulanan.deger)}
            </div>
          </div>
        )}
      </div>

      {/* Uç tarihler — her noktaya etiket basmak yerine yalnızca sınırlar */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
          {tarihKisa(noktalar[0].tarih)}
        </span>
        <span style={{ fontSize: 9.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
          {tarihKisa(noktalar[noktalar.length - 1].tarih)}
        </span>
      </div>
    </div>
  );
};
