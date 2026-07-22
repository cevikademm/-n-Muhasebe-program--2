import React from "react";
import {
  Instagram, Youtube, Facebook, Globe, Check, ShieldAlert, Clock3, PenLine,
} from "lucide-react";
import type { SmHesap, SmPlatform, SmYayinFormat } from "../../../services/sosyal/types";
import {
  PLATFORM_META, PLATFORM_GRADYAN, FORMAT_META, CAPTION_SINIRI,
  FONT_BASLIK, FONT_METIN, formatlar, shortsUygun,
} from "../ortak";

const IKON: Partial<Record<SmPlatform, React.FC<any>>> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
};

export interface HedefDurumu {
  secili: boolean;
  format: SmYayinFormat;
  /** null → ortak metni kullan; string → bu platforma özel metin. */
  ozelCaption: string | null;
}

interface Props {
  hesap: SmHesap;
  durum: HedefDurumu;
  video: boolean;
  /** YouTube Shorts uygunluk kontrolü için kaynak medyanın ölçüleri. */
  sure?: number | null;
  cozunurluk?: string | null;
  /** Doluysa kart seçilemez ve sebep gösterilir. */
  engel: string | null;
  ortakCaption: string;
  lang: string;
  onDegis: (yama: Partial<HedefDurumu>) => void;
}

/**
 * Tek bir yayın hedefi. Seçilince platformun marka gradyanıyla "yanar" ve
 * altında format seçimi + isteğe bağlı özel metin alanı açılır.
 */
export const HedefKarti: React.FC<Props> = ({
  hesap, durum, video, sure, cozunurluk, engel, ortakCaption, lang, onDegis,
}) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const [ad, renk] = PLATFORM_META[hesap.platform] ?? ["—", "#64748b"];
  const Ikon = IKON[hesap.platform] ?? Globe;

  const secilebilir = !engel;
  const secili = durum.secili && secilebilir;
  const olasiFormatlar = formatlar(hesap.platform, video);
  const sinir = CAPTION_SINIRI[hesap.platform] ?? 2200;
  const metin = durum.ozelCaption ?? ortakCaption;

  // Shorts seçiliyse videonun gerçekten Short sayılıp sayılmayacağını
  // kuyruğa atmadan ÖNCE söyle — yoksa hata yayın anında çıkardı.
  const shortsUyari =
    hesap.platform === "youtube" && durum.format === "short"
      ? shortsUygun(sure, cozunurluk)
      : { uygun: true as const };

  return (
    <div
      style={{
        borderRadius: 15,
        // Seçili kartın kenarı marka gradyanı; 1.5px'lik "padding çerçevesi"
        // tekniğiyle — border-image inline stilde güvenilir değil.
        padding: secili ? 1.5 : 1,
        background: secili ? PLATFORM_GRADYAN[hesap.platform] : "var(--border)",
        boxShadow: secili ? `0 8px 24px ${renk}33` : "none",
        transition: "box-shadow .18s",
        opacity: secilebilir ? 1 : 0.55,
      }}
    >
      <div style={{
        background: "var(--panel)", borderRadius: 14, overflow: "hidden",
      }}>
        <button
          type="button"
          onClick={() => secilebilir && onDegis({ secili: !durum.secili })}
          disabled={!secilebilir}
          title={engel ?? undefined}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 11,
            padding: "12px 13px", background: "none", border: "none",
            cursor: secilebilir ? "pointer" : "not-allowed", textAlign: "left",
          }}
        >
          <span style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: secili ? PLATFORM_GRADYAN[hesap.platform] : `${renk}16`,
            color: secili ? "#fff" : renk,
            border: secili ? "none" : `1px solid ${renk}30`,
            transition: "all .18s",
          }}>
            <Ikon size={19} />
          </span>

          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{
              fontSize: 13, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK,
            }}>{ad}</span>
            <span style={{
              fontSize: 11, color: "var(--text-3)", fontFamily: FONT_METIN,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {hesap.handle ? `@${hesap.handle}` : tr("(handle yok)", "(kein Handle)")}
            </span>
          </span>

          {engel ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 9.5, fontWeight: 800, fontFamily: FONT_BASLIK,
              color: "var(--text-3)", flexShrink: 0, maxWidth: 108, textAlign: "right",
              lineHeight: 1.25,
            }}>
              {engel.includes("Yakında") ? <Clock3 size={11} /> : <ShieldAlert size={11} />}
              {engel}
            </span>
          ) : (
            <span style={{
              width: 23, height: 23, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: secili ? PLATFORM_GRADYAN[hesap.platform] : "transparent",
              border: secili ? "none" : "1.5px solid var(--border-md)",
              color: "#fff", transition: "all .18s",
            }}>
              {secili && <Check size={13} strokeWidth={3} />}
            </span>
          )}
        </button>

        {/* Seçiliyken açılan ayrıntılar */}
        {secili && (
          <div style={{
            padding: "0 13px 12px", display: "flex", flexDirection: "column", gap: 9,
          }}>
            {olasiFormatlar.length > 1 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {olasiFormatlar.map((f) => {
                  const aktif = durum.format === f;
                  const [ftr, fde] = FORMAT_META[f];
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onDegis({ format: f })}
                      style={{
                        padding: "5px 11px", borderRadius: 8, cursor: "pointer",
                        fontSize: 11, fontWeight: 700, fontFamily: FONT_METIN,
                        background: aktif ? `${renk}18` : "var(--panel-2)",
                        color: aktif ? renk : "var(--text-2)",
                        border: `1px solid ${aktif ? `${renk}45` : "var(--border)"}`,
                        transition: "all .15s",
                      }}
                    >
                      {tr(ftr, fde)}
                    </button>
                  );
                })}
              </div>
            )}

            {!shortsUyari.uygun && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 6,
                padding: "7px 9px", borderRadius: 9,
                background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.28)",
                fontSize: 10.5, lineHeight: 1.45, color: "#b45309",
                fontFamily: FONT_METIN,
              }}>
                <ShieldAlert size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  {tr(shortsUyari.sebepTr!, shortsUyari.sebepDe!)}{" "}
                  {tr('Bu haliyle gönderilirse reddedilir — "Video" formatını seçin.',
                      'So wird der Upload abgelehnt — bitte „Video" wählen.')}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => onDegis({ ozelCaption: durum.ozelCaption === null ? ortakCaption : null })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, alignSelf: "flex-start",
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontSize: 10.5, fontWeight: 700, fontFamily: FONT_BASLIK,
                color: durum.ozelCaption === null ? "var(--text-3)" : renk,
              }}
            >
              <PenLine size={11} />
              {durum.ozelCaption === null
                ? tr("Bu platforma özel metin yaz", "Eigenen Text für diese Plattform")
                : tr("Ortak metne dön", "Zurück zum gemeinsamen Text")}
            </button>

            {durum.ozelCaption !== null && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <textarea
                  value={durum.ozelCaption}
                  onChange={(e) => onDegis({ ozelCaption: e.target.value })}
                  rows={3}
                  placeholder={tr("Bu platform için metin…", "Text für diese Plattform…")}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 9, resize: "vertical",
                    background: "var(--panel-2)", border: "1px solid var(--border)",
                    color: "var(--text-1)", fontSize: 12, fontFamily: FONT_METIN, outline: "none",
                  }}
                />
                <span style={{
                  alignSelf: "flex-end", fontSize: 9.5, fontFamily: FONT_BASLIK,
                  color: metin.length > sinir ? "var(--red)" : "var(--text-3)",
                }}>
                  {metin.length} / {sinir}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
