import React, { useState } from "react";
import {
  Check, X, RefreshCw, Film, Image as ImageIcon, FileWarning,
  CalendarClock, AlertTriangle, Loader2,
} from "lucide-react";
import type { SmMedya, SmPost, SmHesap } from "../../../services/sosyal/types";
import {
  FONT_BASLIK, FONT_METIN, PLATFORM_META, FORMAT_META,
  buton, rozet, sureMetni, videoMu,
} from "../ortak";
import { hedefleriTuret } from "./hedefler";

interface Props {
  medya: SmMedya;
  post?: SmPost;
  hesaplar: SmHesap[];
  url?: string;
  lang: string;
  mesgul: boolean;
  dar: boolean;
  onOnayla: (m: SmMedya, hedefler: ReturnType<typeof hedefleriTuret>["hedefler"]) => void;
  onReddet: (m: SmMedya) => void;
}

/**
 * Tek bir bekleyen üretim. Kart, onaydan önce cevaplaması gereken üç
 * soruyu bir arada gösterir: NE üretildi (önizleme), NEREYE gidecek
 * (hedef rozetleri + atlananlar), NE yazacak (caption).
 */
export const OnayKarti: React.FC<Props> = ({
  medya, post, hesaplar, url, lang, mesgul, dar, onOnayla, onReddet,
}) => {
  const [gorselHata, setGorselHata] = useState(false);
  const [acikMetin, setAcikMetin] = useState(false);
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const video = videoMu(medya.mime_tipi);
  const { hedefler, atlanan } = hedefleriTuret(medya, post, hesaplar);
  const caption = post?.caption_de || post?.caption_tr || medya.aciklama || "";
  const hashtagler = post?.hashtagler ?? [];

  const planlanan = post?.planlanan_tarih
    ? new Date(post.planlanan_tarih).toLocaleString(lang === "tr" ? "tr-TR" : "de-DE", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      overflow: "hidden",
      display: "flex",
      flexDirection: dar ? "column" : "row",
    }}>
      {/* ── Önizleme ── */}
      <div style={{
        position: "relative",
        width: dar ? "100%" : 190,
        flexShrink: 0,
        aspectRatio: dar ? "16 / 10" : "9 / 16",
        maxHeight: dar ? 220 : 330,
        background: "var(--panel-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {url && !gorselHata ? (
          video ? (
            <video
              src={url}
              controls
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
              onError={() => setGorselHata(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            color: "var(--text-3)", fontSize: 10.5, fontFamily: FONT_METIN,
          }}>
            {gorselHata ? <FileWarning size={22} /> : video ? <Film size={22} /> : <ImageIcon size={22} />}
            {gorselHata && tr("Önizleme yok", "Keine Vorschau")}
          </div>
        )}

        {medya.sure != null && (
          <span style={{
            position: "absolute", right: 7, bottom: 7,
            padding: "2px 6px", borderRadius: 6,
            background: "rgba(0,0,0,.62)", color: "#fff",
            fontSize: 10, fontWeight: 700, fontFamily: FONT_BASLIK,
          }}>
            {sureMetni(medya.sure)}
          </span>
        )}
      </div>

      {/* ── Karar alanı ── */}
      <div style={{
        flex: 1, minWidth: 0,
        padding: dar ? "11px 12px 12px" : "13px 15px",
        display: "flex", flexDirection: "column", gap: 9,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 800, fontFamily: FONT_BASLIK,
              color: "var(--text-1)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {post?.hook || medya.baslik || tr("Başlıksız üretim", "Ohne Titel")}
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 3,
              fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_METIN,
              flexWrap: "wrap",
            }}>
              {medya.provider && <span>{medya.provider}{medya.model ? ` · ${medya.model}` : ""}</span>}
              {planlanan && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <CalendarClock size={11} /> {planlanan}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Hedefler */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {hedefler.length ? (
            hedefler.map((h) => {
              const hesap = hesaplar.find((x) => x.id === h.accountId)!;
              const [ad, renk] = PLATFORM_META[hesap.platform];
              const [fmtTr, fmtDe] = FORMAT_META[h.format || "feed"];
              return (
                <span key={h.accountId} style={rozet(renk)}>
                  {ad} · {tr(fmtTr, fmtDe)}
                  {hesap.handle ? ` · @${hesap.handle}` : ""}
                </span>
              );
            })
          ) : (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, color: "#ef4444", fontFamily: FONT_METIN, fontWeight: 700,
            }}>
              <AlertTriangle size={12} />
              {tr("Yayınlanabilecek hedef yok", "Kein veröffentlichbares Ziel")}
            </span>
          )}
        </div>

        {/* Atlananlar — sessizce kaybolmasınlar */}
        {atlanan.length > 0 && (
          <div style={{
            fontSize: 10.5, color: "#f59e0b", fontFamily: FONT_METIN,
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            {atlanan.map((a) => (
              <span key={a.platform}>
                ⚠ {PLATFORM_META[a.platform][0]}: {tr(a.sebepTr, a.sebepDe)}
              </span>
            ))}
          </div>
        )}

        {/* Metin */}
        {caption && (
          <div
            onClick={() => setAcikMetin((v) => !v)}
            title={tr("Tamamını göster/gizle", "Ein-/ausklappen")}
            style={{
              fontSize: 11.5, lineHeight: 1.5, color: "var(--text-2)",
              fontFamily: FONT_METIN, cursor: "pointer",
              background: "var(--panel-2)", border: "1px solid var(--border)",
              borderRadius: 9, padding: "8px 10px",
              whiteSpace: "pre-wrap",
              maxHeight: acikMetin ? "none" : 62,
              overflow: "hidden",
            }}
          >
            {caption}
            {hashtagler.length > 0 && (
              <div style={{ marginTop: 5, color: "var(--text-3)" }}>
                {hashtagler.map((t) => `#${t}`).join(" ")}
              </div>
            )}
          </div>
        )}

        {/* Aksiyonlar */}
        <div style={{ display: "flex", gap: 7, marginTop: "auto", flexWrap: "wrap" }}>
          <button
            onClick={() => onOnayla(medya, hedefler)}
            disabled={mesgul || !hedefler.length}
            style={{
              ...buton("#10b981", true),
              opacity: mesgul || !hedefler.length ? 0.5 : 1,
              cursor: mesgul || !hedefler.length ? "not-allowed" : "pointer",
            }}
          >
            {mesgul ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
            {tr("Onayla ve yayınla", "Freigeben & posten")}
          </button>

          <button
            onClick={() => onReddet(medya)}
            disabled={mesgul}
            style={{ ...buton("#ef4444"), opacity: mesgul ? 0.5 : 1 }}
            title={tr("Arşive kaldır ve yeniden üretim kuyruğuna koy",
                      "Archivieren und neu erzeugen lassen")}
          >
            <X size={13} /> {tr("Reddet", "Ablehnen")}
          </button>

          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, color: "var(--text-3)", fontFamily: FONT_METIN,
          }}>
            <RefreshCw size={10} />
            {tr("Reddedilen içerik yeniden üretilir", "Abgelehntes wird neu erzeugt")}
          </span>
        </div>
      </div>
    </div>
  );
};
