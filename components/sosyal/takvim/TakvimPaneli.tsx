import React, { useState, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, CalendarDays, RefreshCw,
} from "lucide-react";
import { useSmTakvim } from "../../../services/sosyal/useSmTakvim";
import type { MusteriId } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK, buton, kart } from "../ortak";
import { useEkran } from "../ekran";
import { AyIzgarasi } from "./AyIzgarasi";
import { GunListesi } from "./GunListesi";

interface Props {
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
}

/** Kaynak renklerinin ne anlama geldiği — ızgara altındaki mini gösterge. */
const EFSANE: [string, string, string][] = [
  ["#8b5cf6", "Planlandı",  "Geplant"],
  ["#06b6d4", "Sürüyor",    "Läuft"],
  ["#10b981", "Yayınlandı", "Veröffentlicht"],
  ["#ef4444", "Hata",       "Fehler"],
];

/**
 * Takvim sekmesi. Üç kuyruğu (içerik planı / üretim / yayın) tek ay
 * görünümünde birleştirir — "bu hafta ne çıkıyor?" sorusunun cevabı üç
 * ayrı sekmeye bakmayı gerektirmesin.
 *
 * Dar ekranda ızgara yerine AJANDA gösterilir: 7 sütunlu ızgara telefonda
 * hücre başına tek harf bile sığdıramıyor.
 */
export const TakvimPaneli: React.FC<Props> = ({ ownerId, customerId, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();
  const {
    yil, ay, ogeler, gunler, loading, hata, uyarilar,
    getir, ayDegistir, buguneDon, bugunAnahtari,
  } = useSmTakvim(ownerId, customerId);

  const [seciliGun, setSeciliGun] = useState<string | null>(null);

  // Ay değişince eski günün seçili kalması kafa karıştırır: içinde bulunulan
  // ay ise bugüne, değilse seçimi temizle.
  useEffect(() => {
    const bugun = new Date();
    setSeciliGun(
      bugun.getFullYear() === yil && bugun.getMonth() === ay ? bugunAnahtari : null,
    );
  }, [yil, ay, bugunAnahtari]);

  const ayAdi = new Date(yil, ay, 1).toLocaleDateString(
    lang === "tr" ? "tr-TR" : "de-DE", { month: "long", year: "numeric" },
  );

  /** Ajanda: yalnızca kaydı olan günler, tarih sırasıyla. */
  const doluGunler = Object.keys(gunler).sort();

  return (
    <div style={{
      height: "100%", overflowY: "auto",
      padding: ekran.mobil ? 12 : 16,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Başlık şeridi */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 9, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${SM_RENK}14`, color: SM_RENK, border: `1px solid ${SM_RENK}2e`,
        }}>
          <CalendarDays size={14} />
        </span>
        <span style={{
          flex: 1, minWidth: 120, fontSize: 14, fontWeight: 800,
          color: "var(--text-1)", fontFamily: FONT_BASLIK, textTransform: "capitalize",
        }}>
          {ayAdi}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <button
            onClick={() => ayDegistir(-1)}
            aria-label={tr("Önceki ay", "Vorheriger Monat")}
            style={okStili}
          >
            <ChevronLeft size={14} />
          </button>
          <button onClick={buguneDon} style={buton(SM_RENK)}>
            {tr("Bugün", "Heute")}
          </button>
          <button
            onClick={() => ayDegistir(1)}
            aria-label={tr("Sonraki ay", "Nächster Monat")}
            style={okStili}
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={getir}
            disabled={loading}
            aria-label={tr("Yenile", "Aktualisieren")}
            style={{ ...okStili, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          </button>
        </div>
      </div>

      {hata && (
        <div style={uyariKutusu("rgba(239,68,68,.08)", "rgba(239,68,68,.25)")}>
          <AlertTriangle size={13} style={{ flexShrink: 0, color: "var(--red)" }} />
          <span style={{ color: "var(--red)" }}>{hata}</span>
        </div>
      )}
      {!!uyarilar.length && !hata && (
        <div style={uyariKutusu("rgba(245,158,11,.09)", "rgba(245,158,11,.26)")}>
          <AlertTriangle size={13} style={{ flexShrink: 0, color: "#f59e0b" }} />
          <span style={{ color: "var(--text-2)" }}>{uyarilar.join(" · ")}</span>
        </div>
      )}

      {/* Gövde */}
      <div style={{
        display: "flex", gap: 12, alignItems: "flex-start",
        flexDirection: ekran.dar ? "column" : "row",
      }}>
        <div style={{ flex: 1, minWidth: 0, width: ekran.dar ? "100%" : undefined }}>
          {ekran.mobil ? (
            /* Ajanda görünümü */
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {!doluGunler.length ? (
                <BosAy lang={lang} />
              ) : (
                doluGunler.map((g) => (
                  <GunListesi key={g} gun={g} ogeler={gunler[g]} lang={lang} />
                ))
              )}
            </div>
          ) : (
            <AyIzgarasi
              yil={yil}
              ay={ay}
              gunler={gunler}
              bugunAnahtari={bugunAnahtari}
              seciliGun={seciliGun}
              onGunSec={setSeciliGun}
              lang={lang}
              azamiCip={ekran.tablet ? 2 : 3}
            />
          )}

          {/* Renk göstergesi — renk tek başına anlam taşımasın diye adları yazılı */}
          {!ekran.mobil && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 10,
            }}>
              {EFSANE.map(([renk, t, d]) => (
                <span key={renk} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 10, fontFamily: FONT_BASLIK, color: "var(--text-3)",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: renk }} />
                  {tr(t, d)}
                </span>
              ))}
            </div>
          )}
        </div>

        {!ekran.mobil && (
          <div style={{
            ...kart, padding: 12,
            width: ekran.dar ? "100%" : 320, flexShrink: 0,
          }}>
            <GunListesi
              gun={seciliGun}
              ogeler={seciliGun ? (gunler[seciliGun] ?? []) : []}
              lang={lang}
            />
          </div>
        )}
      </div>

      {!loading && !ogeler.length && !ekran.mobil && <BosAy lang={lang} />}
    </div>
  );
};

const okStili: React.CSSProperties = {
  display: "flex", padding: 7, borderRadius: 9, cursor: "pointer",
  background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text-2)",
};

const uyariKutusu = (bg: string, border: string): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 7,
  fontSize: 11.5, fontFamily: FONT_METIN,
  background: bg, border: `1px solid ${border}`,
  borderRadius: 10, padding: "8px 11px",
});

const BosAy: React.FC<{ lang: string }> = ({ lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
      padding: "20px 16px", borderRadius: 12, textAlign: "center",
      background: "var(--panel-2)", border: "1px dashed var(--border-md)",
    }}>
      <CalendarDays size={20} style={{ color: "var(--text-3)" }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
        {tr("Bu ayda kayıt yok", "Keine Einträge in diesem Monat")}
      </span>
      <span style={{
        fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK,
        maxWidth: 340, lineHeight: 1.5,
      }}>
        {tr("Takvim; içerik planını, üretim kuyruğunu ve yayınları birlikte gösterir. Bir medya yayınladığınızda ya da takvime gönderi eklendiğinde burada belirir.",
            "Der Kalender zeigt Content-Plan, Produktions-Queue und Veröffentlichungen zusammen. Sobald etwas veröffentlicht oder geplant wird, erscheint es hier.")}
      </span>
    </div>
  );
};
