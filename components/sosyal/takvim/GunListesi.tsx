import React from "react";
import {
  ExternalLink, Send, Sparkles, CalendarClock, CircleDashed,
} from "lucide-react";
import type { SmTakvimOgesi, SmTakvimKaynak } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, PLATFORM_META } from "../ortak";

/** Kaynak → [ikon, etiket(tr), etiket(de)] */
const KAYNAK_META: Record<SmTakvimKaynak, [React.FC<any>, string, string]> = {
  post:   [CalendarClock, "İçerik planı", "Content-Plan"],
  uretim: [Sparkles,      "Üretim",       "Produktion"],
  yayin:  [Send,          "Yayın",        "Veröffentlichung"],
};

interface Props {
  /** "2026-07-23" — başlık için; null ise "gün seçin" durumu. */
  gun: string | null;
  ogeler: SmTakvimOgesi[];
  lang: string;
}

const saat = (iso: string, lang: string) =>
  new Date(iso).toLocaleTimeString(lang === "tr" ? "tr-TR" : "de-DE", {
    hour: "2-digit", minute: "2-digit",
  });

const uzunTarih = (gun: string, lang: string) =>
  new Date(`${gun}T12:00:00`).toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE", {
    day: "numeric", month: "long", year: "numeric", weekday: "long",
  });

/**
 * Seçili günün ayrıntısı. Izgara "ne var" der, bu liste "tam olarak ne"
 * der — ızgara hücresine sığmayan platform/durum/link burada durur.
 */
export const GunListesi: React.FC<Props> = ({ gun, ogeler, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  if (!gun) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        padding: "28px 16px", textAlign: "center",
      }}>
        <CircleDashed size={20} style={{ color: "var(--text-3)" }} />
        <span style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
          {tr("Ayrıntı için bir gün seçin.", "Wählen Sie einen Tag für Details.")}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <span style={{
        fontSize: 11.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK,
      }}>
        {uzunTarih(gun, lang)}
      </span>

      {!ogeler.length ? (
        <span style={{
          padding: "14px 12px", borderRadius: 11, textAlign: "center",
          background: "var(--panel-2)", border: "1px dashed var(--border-md)",
          fontSize: 11, color: "var(--text-3)", fontFamily: FONT_BASLIK,
        }}>
          {tr("Bu gün için kayıt yok.", "Für diesen Tag gibt es keine Einträge.")}
        </span>
      ) : (
        ogeler.map((o) => {
          const [Ikon, ktr, kde] = KAYNAK_META[o.kaynak];
          const platformlar = o.platformlar?.length
            ? o.platformlar
            : o.platform ? [o.platform] : [];

          return (
            <div
              key={o.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 9,
                padding: "9px 11px", borderRadius: 11,
                background: "var(--panel)", border: "1px solid var(--border)",
                boxShadow: `inset 3px 0 0 ${o.renk}`,
                opacity: o.gerceklesti ? 0.82 : 1,
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: `${o.renk}18`, color: o.renk,
              }}>
                <Ikon size={13} />
              </span>

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, color: "var(--text-1)",
                  fontFamily: FONT_METIN, lineHeight: 1.4, wordBreak: "break-word",
                }}>
                  {o.baslik}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
                    {saat(o.tarih, lang)} · {tr(ktr, kde)}
                  </span>
                  {/* Durum rengi TEK BAŞINA taşıyıcı değil: adı da yazılır. */}
                  <span style={{
                    fontSize: 9.5, fontWeight: 800, fontFamily: FONT_BASLIK,
                    padding: "1px 6px", borderRadius: 5,
                    background: `${o.renk}1a`, color: o.renk, border: `1px solid ${o.renk}33`,
                  }}>
                    {o.durum}
                  </span>
                  {platformlar.map((p) => {
                    const [ad, renk] = PLATFORM_META[p] ?? ["—", "#64748b"];
                    return (
                      <span key={p} style={{
                        fontSize: 9.5, fontWeight: 700, fontFamily: FONT_BASLIK,
                        padding: "1px 6px", borderRadius: 5,
                        background: `${renk}14`, color: renk, border: `1px solid ${renk}2e`,
                      }}>
                        {ad}
                      </span>
                    );
                  })}
                </div>
              </div>

              {o.url && (
                <a
                  href={o.url} target="_blank" rel="noopener noreferrer"
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
        })
      )}
    </div>
  );
};
