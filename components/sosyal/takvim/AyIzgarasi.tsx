import React from "react";
import type { SmTakvimOgesi } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK } from "../ortak";

/** Hafta pazartesi başlar (TR/DE ortak alışkanlığı). */
export const GUN_ADLARI: [string, string][] = [
  ["Pzt", "Mo"], ["Sal", "Di"], ["Çar", "Mi"], ["Per", "Do"],
  ["Cum", "Fr"], ["Cmt", "Sa"], ["Paz", "So"],
];

/** getDay() pazar=0 döner; pazartesi=0 olacak şekilde kaydır. */
const haftaninGunu = (d: Date) => (d.getDay() + 6) % 7;

const iki = (n: number) => String(n).padStart(2, "0");
const anahtar = (d: Date) => `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;

interface Props {
  yil: number;
  ay: number;
  gunler: Record<string, SmTakvimOgesi[]>;
  bugunAnahtari: string;
  seciliGun: string | null;
  onGunSec: (anahtar: string) => void;
  lang: string;
  /** Hücre başına gösterilecek çip sayısı — dar ekranda azalır. */
  azamiCip?: number;
}

/**
 * Ay ızgarası. 6 hafta × 7 gün sabit: satır sayısı aya göre değişirse
 * ızgara her ay geçişinde zıplardı.
 *
 * Hücre bir DÜĞME: takvimde gün seçmek birincil eylem, tıklanabilirliğin
 * klavyeyle de çalışması gerekiyor.
 */
export const AyIzgarasi: React.FC<Props> = ({
  yil, ay, gunler, bugunAnahtari, seciliGun, onGunSec, lang, azamiCip = 3,
}) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  // Izgaranın ilk hücresi: ayın 1'inden önceki pazartesi.
  const ayinIlki = new Date(yil, ay, 1);
  const basla = new Date(yil, ay, 1 - haftaninGunu(ayinIlki));

  const hucreler: Date[] = [];
  for (let i = 0; i < 42; i++) {
    hucreler.push(new Date(basla.getFullYear(), basla.getMonth(), basla.getDate() + i));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      {/* Gün başlıkları */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {GUN_ADLARI.map(([g, d], i) => (
          <span
            key={g}
            style={{
              padding: "2px 4px", textAlign: "center",
              fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em",
              fontFamily: FONT_BASLIK,
              // Hafta sonu daha soluk: ritim, çizgi çekmeden okunur olsun.
              color: i >= 5 ? "var(--text-3)" : "var(--text-2)",
            }}
          >
            {tr(g, d)}
          </span>
        ))}
      </div>

      {/* Hücreler */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {hucreler.map((d) => {
          const k = anahtar(d);
          const ogeler = gunler[k] ?? [];
          const buAy = d.getMonth() === ay;
          const bugun = k === bugunAnahtari;
          const secili = k === seciliGun;

          return (
            <button
              key={k}
              type="button"
              onClick={() => onGunSec(k)}
              aria-label={`${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} — ${ogeler.length} ${tr("kayıt", "Einträge")}`}
              aria-pressed={secili}
              style={{
                display: "flex", flexDirection: "column", gap: 3, minHeight: 84,
                padding: "5px 5px 6px", borderRadius: 10, cursor: "pointer",
                textAlign: "left", overflow: "hidden",
                background: secili ? `${SM_RENK}12` : "var(--panel)",
                border: `1px solid ${secili ? `${SM_RENK}55` : "var(--border)"}`,
                // Ayın dışındaki günler görünür ama geri planda kalır.
                opacity: buAy ? 1 : 0.42,
                transition: "background .15s, border-color .15s",
              }}
            >
              <span style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                alignSelf: "flex-start", minWidth: 19, height: 19, borderRadius: 6,
                fontSize: 10.5, fontWeight: 800, fontFamily: FONT_BASLIK,
                background: bugun ? SM_RENK : "transparent",
                color: bugun ? "#fff" : "var(--text-2)",
              }}>
                {d.getDate()}
              </span>

              {ogeler.slice(0, azamiCip).map((o) => (
                <span
                  key={o.id}
                  title={o.baslik}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, minWidth: 0,
                    padding: "1px 4px", borderRadius: 5,
                    background: `${o.renk}14`,
                    // Gerçekleşmiş öğe soluk: takvim "ne olacak"a odaklı.
                    opacity: o.gerceklesti ? 0.75 : 1,
                  }}
                >
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: o.renk, flexShrink: 0,
                  }} />
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 9.5, lineHeight: 1.35,
                    fontFamily: FONT_METIN, color: "var(--text-2)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {o.baslik}
                  </span>
                </span>
              ))}

              {ogeler.length > azamiCip && (
                <span style={{
                  fontSize: 9, fontWeight: 700, fontFamily: FONT_BASLIK,
                  color: "var(--text-3)", paddingLeft: 4,
                }}>
                  +{ogeler.length - azamiCip} {tr("daha", "mehr")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
