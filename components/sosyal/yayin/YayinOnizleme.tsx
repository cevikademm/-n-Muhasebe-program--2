import React from "react";
import { Film, Image as ImageIcon, Hash } from "lucide-react";
import type { SmMedya } from "../../../services/sosyal/types";
import {
  FONT_BASLIK, FONT_METIN, SM_RENK, boyutMetni, sureMetni, videoMu,
} from "../ortak";

interface Props {
  medya: SmMedya;
  url?: string;
  caption: string;
  lang: string;
  /** Mobil/tablette önizleme yatay şeride iner. */
  dar: boolean;
}

/**
 * Yayınlanacak varlığın "vitrin" tarafı: çerçeveli önizleme, teknik künye
 * ve metnin gönderi altında nasıl görüneceği. Kullanıcının yayına basmadan
 * önce neyi gönderdiğini görmesi için — modalin güven veren yarısı.
 */
export const YayinOnizleme: React.FC<Props> = ({ medya, url, caption, lang, dar }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const video = videoMu(medya.mime_tipi);

  const kunye = [
    medya.cozunurluk,
    boyutMetni(medya.boyut),
    video ? sureMetni(medya.sure) : null,
  ].filter(Boolean) as string[];

  return (
    <div style={{
      width: dar ? "100%" : 330,
      flexShrink: 0,
      display: "flex",
      flexDirection: dar ? "row" : "column",
      gap: dar ? 12 : 13,
      padding: dar ? 13 : 16,
      background: "var(--panel-2)",
      borderRight: dar ? "none" : "1px solid var(--border)",
      borderBottom: dar ? "1px solid var(--border)" : "none",
      overflowY: dar ? "visible" : "auto",
    }}>
      {/* Çerçeve — gradyan kenarlık kreatifi "ürün" gibi gösterir */}
      <div style={{
        width: dar ? 96 : "100%",
        flexShrink: 0,
        padding: 2,
        borderRadius: dar ? 13 : 17,
        background: `linear-gradient(140deg, ${SM_RENK}, #6228d7 60%, #06b6d4)`,
      }}>
        <div style={{
          borderRadius: dar ? 11 : 15,
          overflow: "hidden",
          background: "#0b1120",
          aspectRatio: dar ? "1 / 1" : "4 / 5",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {url ? (
            video ? (
              <video src={url} controls={!dar} muted playsInline preload="metadata"
                style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <img src={url} alt={medya.baslik || ""}
                style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )
          ) : (
            <span style={{ color: "rgba(255,255,255,.45)" }}>
              {video ? <Film size={26} /> : <ImageIcon size={26} />}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{
            fontSize: 13.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {medya.baslik || tr("(başlıksız)", "(ohne Titel)")}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
            {kunye.join(" · ") || "—"}
          </span>
        </div>

        {!!medya.etiketler?.length && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {medya.etiketler.slice(0, dar ? 3 : 8).map((e) => (
              <span key={e} style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 9.5, padding: "2px 6px", borderRadius: 5,
                background: "var(--panel)", color: "var(--text-2)",
                border: "1px solid var(--border)", fontFamily: FONT_METIN,
              }}>
                <Hash size={8} />{e}
              </span>
            ))}
          </div>
        )}

        {/* Metin önizlemesi — masaüstünde; darda yer kaplamasın */}
        {!dar && (
          <div style={{
            marginTop: 2, padding: "10px 12px", borderRadius: 12,
            background: "var(--panel)", border: "1px solid var(--border)",
            minHeight: 74,
          }}>
            <span style={{
              display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em",
              color: "var(--text-3)", fontFamily: FONT_BASLIK, marginBottom: 5,
            }}>
              {tr("METİN ÖNİZLEME", "TEXTVORSCHAU")}
            </span>
            <p style={{
              margin: 0, fontSize: 11.5, lineHeight: 1.55, fontFamily: FONT_METIN,
              color: caption.trim() ? "var(--text-2)" : "var(--text-3)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {caption.trim() || tr("Henüz metin yazılmadı.", "Noch kein Text.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
