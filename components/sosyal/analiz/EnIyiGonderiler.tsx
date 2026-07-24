import React from "react";
import {
  ExternalLink, Copy, Shield, Eye, Trash2, HelpCircle, Bookmark, Share2,
} from "lucide-react";
import type { SmGonderiSirasi } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK } from "../ortak";

/**
 * `karar` view'de hesaplanıyor (skorun hesabın MEDYANINA oranı). Burada
 * yalnızca sunulur — eşikler iki yerde yaşamasın.
 * Renk tek başına taşıyıcı değil: her rozet ikon + yazı ile gelir.
 */
const KARAR_META: Record<string, [React.FC<any>, string, string, string]> = {
  "çoğalt":  [Copy,       "Çoğalt",   "Mehr davon", "#10b981"],
  "koru":    [Shield,     "Koru",     "Halten",     "#06b6d4"],
  "izle":    [Eye,        "İzle",     "Beobachten", "#64748b"],
  "bırak":   [Trash2,     "Bırak",    "Fallenlassen", "#ef4444"],
  "veri-az": [HelpCircle, "Veri az",  "Wenig Daten", "#94a3b8"],
};

interface Props {
  siralama: SmGonderiSirasi[];
  lang: string;
  /** Kaç satır gösterilecek. */
  limit?: number;
}

const sayi = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("de-DE").format(n);

const kisalt = (m: string | null, n = 70) => {
  const t = String(m ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "(metinsiz)";
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Gönderi sıralaması — yatay çubuk listesi.
 *
 * Ölçüt beğeni DEĞİL: `yayilma_skoru` = (kaydetme + paylaşım) / erişim.
 * Instagram dağıtımı "kaydettim / arkadaşıma yolladım" sinyaline tepki
 * veriyor; beğeniye göre sıralamak yanlış içeriği çoğaltmaya yol açar.
 */
export const EnIyiGonderiler: React.FC<Props> = ({ siralama, lang, limit = 8 }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const liste = siralama.slice(0, limit);
  if (!liste.length) return null;

  // Çubuk uzunlukları listenin en yükseğine göre — mutlak %'ye göre değil,
  // yoksa tüm çubuklar birbirine yapışık kısa çizgilere dönerdi.
  const enYuksek = Math.max(...liste.map((g) => Number(g.yayilma_skoru) || 0), 1);
  const medyan = liste.find((g) => g.medyan_yayilma != null)?.medyan_yayilma ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {liste.map((g, i) => {
        const skor = Number(g.yayilma_skoru) || 0;
        const oran = Math.max(2, (skor / enYuksek) * 100);
        const [Ikon, ktr, kde, krenk] = KARAR_META[g.karar] ?? KARAR_META["izle"];

        return (
          <div
            key={g.medya_id}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "9px 11px", borderRadius: 11,
              background: "var(--panel)", border: "1px solid var(--border)",
              // Örneklemi yetersiz satırlar görünür ama geri planda.
              opacity: g.yeterli_veri ? 1 : 0.62,
            }}
          >
            <span style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--panel-2)", border: "1px solid var(--border)",
              fontSize: 10, fontWeight: 800, color: "var(--text-3)", fontFamily: FONT_BASLIK,
            }}>
              {i + 1}
            </span>

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{
                fontSize: 11.5, fontWeight: 700, color: "var(--text-1)",
                fontFamily: FONT_METIN, lineHeight: 1.4, wordBreak: "break-word",
              }}>
                {kisalt(g.caption)}
              </span>

              {/* Çubuk + değer: sayı yalnızca uçta, her noktada değil */}
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{
                  flex: 1, minWidth: 0, height: 6, borderRadius: 3,
                  background: "var(--panel-2)", overflow: "hidden",
                }}>
                  <span style={{
                    display: "block", height: "100%", width: `${oran}%`,
                    borderRadius: 3, background: SM_RENK,
                  }} />
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 800, color: "var(--text-1)",
                  fontFamily: FONT_BASLIK, flexShrink: 0, minWidth: 42, textAlign: "right",
                }}>
                  {skor ? `%${skor.toFixed(1)}` : "—"}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 9.5, fontWeight: 800, fontFamily: FONT_BASLIK,
                  padding: "1px 6px", borderRadius: 5,
                  background: `${krenk}16`, color: krenk, border: `1px solid ${krenk}33`,
                }}>
                  <Ikon size={10} /> {tr(ktr, kde)}
                </span>
                <span style={olcumStili}>
                  <Eye size={10} /> {sayi(g.erisim)}
                </span>
                <span style={olcumStili}>
                  <Bookmark size={10} /> {sayi(g.kaydetme)}
                </span>
                <span style={olcumStili}>
                  <Share2 size={10} /> {sayi(g.paylasim)}
                </span>
                {g.urun_tipi && (
                  <span style={{ ...olcumStili, textTransform: "lowercase" }}>
                    {g.urun_tipi}
                  </span>
                )}
              </div>
            </div>

            {g.permalink && (
              <a
                href={g.permalink} target="_blank" rel="noopener noreferrer"
                aria-label={tr("Gönderiyi aç", "Beitrag öffnen")}
                style={{
                  display: "flex", padding: 5, borderRadius: 8, flexShrink: 0,
                  background: "var(--panel-2)", border: "1px solid var(--border)",
                  color: "var(--text-2)",
                }}
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        );
      })}

      <span style={{
        fontSize: 10, color: "var(--text-3)", fontFamily: FONT_BASLIK, lineHeight: 1.5,
      }}>
        {tr("Sıralama ölçütü: (kaydetme + paylaşım) / erişim. Beğeni değil — Instagram dağıtımı bu sinyale tepki veriyor.",
            "Sortierkriterium: (Speichern + Teilen) / Reichweite. Nicht Likes — der Instagram-Algorithmus reagiert auf dieses Signal.")}
        {medyan != null && ` ${tr("Hesap medyanı", "Median des Kontos")}: %${Number(medyan).toFixed(1)}.`}
      </span>
    </div>
  );
};

const olcumStili: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 3,
  fontSize: 9.5, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK,
};
