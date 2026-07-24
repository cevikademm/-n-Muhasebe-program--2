import React from "react";
import {
  BarChart3, RefreshCw, Loader2, AlertTriangle, Info, TrendingUp, Trophy,
} from "lucide-react";
import { useSmAnaliz } from "../../../services/sosyal/useSmAnaliz";
import type { MusteriId } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK, buton, kart } from "../ortak";
import { useEkran } from "../ekran";
import { OzetKartlari } from "./OzetKartlari";
import { TakipciGrafigi } from "./TakipciGrafigi";
import { EnIyiGonderiler } from "./EnIyiGonderiler";

interface Props {
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
}

/**
 * Analiz sekmesi. İki ayrı soruyu ayrı bölümlerde tutar:
 *
 *   "büyüyor muyuz?"          → sm_metrics       → takipçi çizgisi
 *   "hangi içerik büyütüyor?" → sm_post_ranking  → gönderi sıralaması
 *
 * Üstteki özet kartları `sm_yayinlar`'dan türer, yani metrik tabloları
 * henüz boşken bile ekran boş kalmaz. Metrik bölümleri kendi boş
 * durumlarını ve "şimdi çek" eylemini kendileri taşır.
 */
export const AnalizPaneli: React.FC<Props> = ({ ownerId, customerId, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();
  const {
    metrikler, siralama, ozet, loading, senkronlaniyor, hata, uyarilar, getir, senkronla,
  } = useSmAnaliz(ownerId, customerId);

  const bolumBasligi = (Ikon: React.FC<any>, baslik: string, alt: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{
        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${SM_RENK}14`, color: SM_RENK, border: `1px solid ${SM_RENK}2e`,
      }}>
        <Ikon size={13} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK }}>
          {baslik}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
          {alt}
        </span>
      </span>
    </div>
  );

  if (loading && !ozet.toplam && !metrikler.length) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  return (
    <div style={{
      height: "100%", overflowY: "auto",
      padding: ekran.mobil ? 12 : 16,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Başlık şeridi */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          width: 28, height: 28, borderRadius: 9, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${SM_RENK}14`, color: SM_RENK, border: `1px solid ${SM_RENK}2e`,
        }}>
          <BarChart3 size={14} />
        </span>
        <span style={{
          flex: 1, minWidth: 120, fontSize: 14, fontWeight: 800,
          color: "var(--text-1)", fontFamily: FONT_BASLIK,
        }}>
          {tr("Analiz", "Analyse")}
        </span>
        <button
          onClick={() => senkronla().catch(() => {})}
          disabled={senkronlaniyor}
          style={{
            ...buton(SM_RENK, true),
            background: `linear-gradient(135deg, ${SM_RENK}, #6228d7)`,
            border: "none",
            cursor: senkronlaniyor ? "not-allowed" : "pointer",
            opacity: senkronlaniyor ? 0.6 : 1,
          }}
        >
          {senkronlaniyor ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          {tr("Metrikleri çek", "Metriken abrufen")}
        </button>
        <button
          onClick={getir}
          disabled={loading}
          aria-label={tr("Yenile", "Aktualisieren")}
          style={{
            display: "flex", padding: 7, borderRadius: 9,
            cursor: loading ? "not-allowed" : "pointer",
            background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-2)",
          }}
        >
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      {hata && (
        <div style={kutu("rgba(239,68,68,.08)", "rgba(239,68,68,.25)")}>
          <AlertTriangle size={13} style={{ flexShrink: 0, color: "var(--red)" }} />
          <span style={{ color: "var(--red)" }}>{hata}</span>
        </div>
      )}
      {!!uyarilar.length && (
        <div style={kutu("rgba(245,158,11,.09)", "rgba(245,158,11,.26)")}>
          <AlertTriangle size={13} style={{ flexShrink: 0, color: "#f59e0b" }} />
          <span style={{ color: "var(--text-2)" }}>{uyarilar.join(" · ")}</span>
        </div>
      )}

      {/* 1) Her zaman dolu olan özet */}
      <OzetKartlari ozet={ozet} lang={lang} />

      {/* 2) Büyüyor muyuz? */}
      <div style={{ ...kart, padding: ekran.mobil ? 12 : 14 }}>
        {bolumBasligi(
          TrendingUp,
          tr("Takipçi gelişimi", "Follower-Entwicklung"),
          tr("Son 30 günün günlük hesap ölçümü", "Tägliche Kontomessung der letzten 30 Tage"),
        )}
        <TakipciGrafigi
          metrikler={metrikler}
          lang={lang}
          yukseklik={ekran.mobil ? 150 : 190}
        />
      </div>

      {/* 3) Hangi içerik büyütüyor? */}
      <div style={{ ...kart, padding: ekran.mobil ? 12 : 14 }}>
        {bolumBasligi(
          Trophy,
          tr("En iyi gönderiler", "Beste Beiträge"),
          tr("Yayılma skoruna göre sıralı", "Sortiert nach Verbreitungs-Score"),
        )}

        {siralama.length ? (
          <EnIyiGonderiler siralama={siralama} lang={lang} limit={ekran.mobil ? 5 : 8} />
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
            padding: "22px 16px", borderRadius: 12, textAlign: "center",
            background: "var(--panel-2)", border: "1px dashed var(--border-md)",
          }}>
            <Info size={18} style={{ color: "var(--text-3)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
              {tr("Henüz ölçüm yok", "Noch keine Messwerte")}
            </span>
            <span style={{
              fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK,
              maxWidth: 400, lineHeight: 1.5,
            }}>
              {tr("“Metrikleri çek” Instagram'daki gönderilerinizin erişim, kaydetme ve paylaşım sayılarını okur ve günlük anlık görüntü olarak kaydeder. Ölçüm için doğrulanmış bir Instagram hesabı ve en az bir yayınlanmış gönderi gerekir.",
                  "„Metriken abrufen“ liest Reichweite, Speicherungen und Shares Ihrer Instagram-Beiträge und legt sie als täglichen Snapshot ab. Dafür braucht es ein verifiziertes Instagram-Konto und mindestens einen veröffentlichten Beitrag.")}
            </span>
            <button
              onClick={() => senkronla().catch(() => {})}
              disabled={senkronlaniyor}
              style={{
                ...buton(SM_RENK),
                cursor: senkronlaniyor ? "not-allowed" : "pointer",
                opacity: senkronlaniyor ? 0.6 : 1,
              }}
            >
              {senkronlaniyor ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
              {tr("Metrikleri şimdi çek", "Jetzt abrufen")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const kutu = (bg: string, border: string): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 7,
  fontSize: 11.5, fontFamily: FONT_METIN,
  background: bg, border: `1px solid ${border}`,
  borderRadius: 10, padding: "8px 11px",
});
