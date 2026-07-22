import React, { useState } from "react";
import { Star, Film, Image as ImageIcon, FileWarning, Send } from "lucide-react";
import type { SmMedya } from "../../../services/sosyal/types";
import {
  DURUM_META, FONT_BASLIK, FONT_METIN, SM_RENK,
  boyutMetni, sureMetni, videoMu, rozet,
} from "../ortak";

interface Props {
  medya: SmMedya;
  url?: string;
  lang: string;
  secili?: boolean;
  /** Dokunmatik ekranda hover yok → hızlı yayınla düğmesi hep görünür. */
  dokunmatik?: boolean;
  onAc: (m: SmMedya) => void;
  onFavori: (m: SmMedya) => void;
  onYayinla?: (m: SmMedya) => void;
}

export const MedyaKarti: React.FC<Props> = ({
  medya, url, lang, secili, dokunmatik, onAc, onFavori, onYayinla,
}) => {
  const [hov, setHov] = useState(false);
  const [gorselHata, setGorselHata] = useState(false);
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const [etTr, etDe, renk] = DURUM_META[medya.durum] ?? DURUM_META.taslak;
  const video = videoMu(medya.mime_tipi);

  return (
    <div
      onClick={() => onAc(medya)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "var(--panel)",
        border: `1px solid ${secili ? renk : hov ? "var(--border-md)" : "var(--border)"}`,
        borderRadius: 13,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all .15s",
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? "0 6px 18px rgba(0,0,0,.10)" : "none",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Önizleme */}
      <div style={{
        position: "relative", aspectRatio: "1 / 1",
        background: "var(--panel-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {url && !gorselHata ? (
          video ? (
            // Video için <video> etiketi; poster yoksa ilk kare gösterilir.
            <video
              src={url}
              muted
              playsInline
              preload="metadata"
              onError={() => setGorselHata(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <img
              src={url}
              alt={medya.baslik || ""}
              loading="lazy"
              onError={() => setGorselHata(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )
        ) : (
          // İmzalı URL süresi dolmuş ya da dosya silinmiş olabilir.
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            color: "var(--text-3)", fontSize: 10.5, fontFamily: FONT_METIN,
          }}>
            {gorselHata ? <FileWarning size={22} /> : video ? <Film size={22} /> : <ImageIcon size={22} />}
            {gorselHata && tr("Önizleme yok", "Keine Vorschau")}
          </div>
        )}

        {/* Favori */}
        <button
          onClick={(e) => { e.stopPropagation(); onFavori(medya); }}
          title={tr("Favori", "Favorit")}
          aria-label={tr("Favori", "Favorit")}
          style={{
            position: "absolute", top: 7, right: 7,
            width: 26, height: 26, borderRadius: 8, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(15,23,42,.55)", border: "none",
            color: medya.favori ? "#fbbf24" : "rgba(255,255,255,.75)",
            backdropFilter: "blur(4px)",
          }}
        >
          <Star size={13} fill={medya.favori ? "#fbbf24" : "none"} />
        </button>

        {/* Süre (video) */}
        {video && medya.sure != null && (
          <span style={{
            position: "absolute", bottom: 7, right: 7,
            fontSize: 9.5, fontWeight: 700, fontFamily: FONT_BASLIK,
            padding: "2px 6px", borderRadius: 5,
            background: "rgba(15,23,42,.65)", color: "#fff", backdropFilter: "blur(4px)",
          }}>
            {sureMetni(medya.sure)}
          </span>
        )}

        {/* Durum rozeti */}
        <span style={{ ...rozet(renk), position: "absolute", top: 7, left: 7, background: `${renk}e6`, color: "#fff", border: "none" }}>
          {tr(etTr, etDe)}
        </span>

        {/* Hızlı yayınla — kütüphaneden tek dokunuşla yayın akışına geçiş */}
        {onYayinla && (hov || dokunmatik) && (
          <button
            onClick={(e) => { e.stopPropagation(); onYayinla(medya); }}
            title={tr("Yayınla", "Veröffentlichen")}
            style={{
              position: "absolute", left: 7, bottom: 7,
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 8, cursor: "pointer",
              fontSize: 10.5, fontWeight: 800, fontFamily: FONT_BASLIK,
              background: `linear-gradient(135deg, ${SM_RENK}, #6228d7)`,
              color: "#fff", border: "none",
              boxShadow: "0 4px 12px rgba(2,6,23,.35)",
            }}
          >
            <Send size={11} /> {tr("Yayınla", "Posten")}
          </button>
        )}
      </div>

      {/* Alt bilgi */}
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: "var(--text-1)", fontFamily: FONT_METIN,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {medya.baslik || tr("(başlıksız)", "(ohne Titel)")}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
          {medya.cozunurluk || "—"} · {boyutMetni(medya.boyut)}
        </span>
        {!!medya.etiketler?.length && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 1 }}>
            {medya.etiketler.slice(0, 3).map((e) => (
              <span key={e} style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 4,
                background: "var(--panel-2)", color: "var(--text-2)",
                border: "1px solid var(--border)", fontFamily: FONT_METIN,
              }}>{e}</span>
            ))}
            {medya.etiketler.length > 3 && (
              <span style={{ fontSize: 9, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
                +{medya.etiketler.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
