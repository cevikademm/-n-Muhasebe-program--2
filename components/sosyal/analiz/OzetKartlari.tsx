import React from "react";
import { Send, CheckCircle2, MessageSquare, Clock3 } from "lucide-react";
import type { SmYayinOzeti, SmPlatform } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, PLATFORM_META } from "../ortak";

interface Props {
  ozet: SmYayinOzeti;
  lang: string;
}

const sayi = (n: number) => new Intl.NumberFormat("de-DE").format(n);

/** "3 gün önce" / "vor 3 Tagen" — kaba ama okunur. */
function gecenSure(iso: string | null, lang: string): string {
  if (!iso) return "—";
  const gun = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  if (gun <= 0) return lang === "tr" ? "bugün" : "heute";
  if (gun === 1) return lang === "tr" ? "dün" : "gestern";
  return lang === "tr" ? `${gun} gün önce` : `vor ${gun} Tagen`;
}

/**
 * Dört başlık sayısı. Bunlar GRAFİK DEĞİL bilinçli olarak: her biri tek bir
 * değer taşıyor ve tek değerin en okunur biçimi büyük rakamın kendisi.
 *
 * Kaynak `sm_yayinlar` — metrik tabloları boşken bile dolu olan tek yer.
 */
export const OzetKartlari: React.FC<Props> = ({ ozet, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const basariOrani = ozet.yayinlandi + ozet.hata > 0
    ? Math.round((100 * ozet.yayinlandi) / (ozet.yayinlandi + ozet.hata))
    : null;

  const kartlar: {
    ikon: React.FC<any>; renk: string; deger: string;
    etiket: string; alt: string;
  }[] = [
    {
      ikon: Send, renk: "#8b5cf6",
      deger: sayi(ozet.yayinlandi),
      etiket: tr("Yayınlanan gönderi", "Veröffentlichte Beiträge"),
      alt: ozet.bekleyen
        ? `${ozet.bekleyen} ${tr("tanesi kuyrukta", "in der Warteschlange")}`
        : tr("kuyruk boş", "Warteschlange leer"),
    },
    {
      ikon: CheckCircle2, renk: "#10b981",
      deger: basariOrani == null ? "—" : `%${basariOrani}`,
      etiket: tr("Yayın başarısı", "Erfolgsquote"),
      alt: ozet.hata
        ? `${ozet.hata} ${tr("hatalı deneme", "fehlgeschlagen")}`
        : tr("hata yok", "keine Fehler"),
    },
    {
      ikon: MessageSquare, renk: "#ec4899",
      deger: sayi(ozet.yorumYazildi),
      etiket: tr("Otomatik ilk yorum", "Automatische Kommentare"),
      alt: tr("gönderi altına yazıldı", "unter Beiträgen gepostet"),
    },
    {
      ikon: Clock3, renk: "#06b6d4",
      deger: gecenSure(ozet.sonYayin, lang),
      etiket: tr("Son yayın", "Letzte Veröffentlichung"),
      alt: tr("en güncel gönderi", "aktuellster Beitrag"),
    },
  ];

  // `?? {}` birleşimi değer tipini unknown'a düşürüyor — açık daraltma şart.
  const platformlar = (Object.entries(ozet.platformDagilimi ?? {}) as [string, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{
        display: "grid", gap: 9,
        gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))",
      }}>
        {kartlar.map((k) => {
          const Ikon = k.ikon;
          return (
            <div
              key={k.etiket}
              style={{
                display: "flex", flexDirection: "column", gap: 5,
                padding: "12px 13px", borderRadius: 13,
                background: "var(--panel)", border: "1px solid var(--border)",
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: `${k.renk}16`, color: k.renk, border: `1px solid ${k.renk}2e`,
              }}>
                <Ikon size={13} />
              </span>
              <span style={{
                fontSize: 22, fontWeight: 800, lineHeight: 1.1,
                color: "var(--text-1)", fontFamily: FONT_BASLIK,
                letterSpacing: "-.01em",
              }}>
                {k.deger}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN,
              }}>
                {k.etiket}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
                {k.alt}
              </span>
            </div>
          );
        })}
      </div>

      {!!platformlar.length && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
            color: "var(--text-3)", fontFamily: FONT_BASLIK,
          }}>
            {tr("PLATFORM DAĞILIMI", "VERTEILUNG")}
          </span>
          {platformlar.map(([p, n]) => {
            const [ad, renk] = PLATFORM_META[p as SmPlatform] ?? ["—", "#64748b"];
            return (
              <span key={p} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 9px", borderRadius: 7,
                background: `${renk}12`, border: `1px solid ${renk}2e`,
                fontSize: 11, fontFamily: FONT_METIN, color: "var(--text-2)",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: renk }} />
                {ad}
                <strong style={{ color: "var(--text-1)", fontFamily: FONT_BASLIK }}>{n}</strong>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
