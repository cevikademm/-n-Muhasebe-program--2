import React from "react";
import {
  Loader2, AlertTriangle, RefreshCw, CheckCircle2, Sparkles, Clock,
} from "lucide-react";
import { useSmOnay } from "../../../services/sosyal/useSmOnay";
import type { MusteriId, SmMedya, SmYayinHedefi } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK, buton, rozet } from "../ortak";
import { useEkran } from "../ekran";
import { OnayKarti } from "./OnayKarti";

interface Props {
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
}

/**
 * Onay kutusu: Higgsfield üretimleri buraya `onayda` olarak düşer ve
 * KULLANICI ONAYLAMADAN yayına çıkmaz. Onay tek tıkta takvimdeki
 * platformlara yayınlar — sonrası Yayın Kuyruğu sekmesinde izlenir.
 */
export const OnayKutusu: React.FC<Props> = ({ ownerId, customerId, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();

  const {
    medyalar, urller, postlar, hesaplar, isler,
    loading, hata, islenen, getir, onayla, reddet,
  } = useSmOnay(ownerId, customerId);

  // Kuyrukta hâlâ üretilen işler: onay kutusu boşken "hiç iş yok mu?"
  // sorusunu baştan cevaplar.
  const uretimde = isler.filter((i) => i.durum !== "hata").length;
  const hatali = isler.filter((i) => i.durum === "hata").length;

  const onaylaVeYayinla = async (m: SmMedya, hedefler: SmYayinHedefi[]) => {
    try {
      await onayla(m, hedefler);
    } catch {
      // Hata mesajı hook'ta set edildi, üstte gösteriliyor.
    }
  };

  return (
    <div style={{
      padding: ekran.mobil ? 12 : 15,
      display: "flex", flexDirection: "column", gap: 12,
      overflowY: "auto", height: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{
          flex: 1, minWidth: 130, display: "flex", alignItems: "center", gap: 7,
          fontSize: 12.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK,
        }}>
          <CheckCircle2 size={14} style={{ color: SM_RENK }} />
          {tr("Onay kutusu", "Freigaben")}
          {medyalar.length > 0 && (
            <span style={rozet("#f59e0b")}>{medyalar.length}</span>
          )}
        </span>

        {uretimde > 0 && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 700, fontFamily: FONT_METIN,
            padding: "4px 9px", borderRadius: 8,
            background: "rgba(6,182,212,.12)", color: "#06b6d4",
            border: "1px solid rgba(6,182,212,.28)",
          }}>
            <Clock size={11} /> {uretimde} {tr("üretimde", "in Produktion")}
          </span>
        )}
        {hatali > 0 && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 700, fontFamily: FONT_METIN,
            padding: "4px 9px", borderRadius: 8,
            background: "rgba(239,68,68,.10)", color: "#ef4444",
            border: "1px solid rgba(239,68,68,.28)",
          }}>
            <AlertTriangle size={11} /> {hatali} {tr("üretim hatası", "Produktionsfehler")}
          </span>
        )}

        <button onClick={getir} style={buton(SM_RENK)}>
          <RefreshCw size={12} /> {tr("Yenile", "Aktualisieren")}
        </button>
      </div>

      {hata && (
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          fontSize: 11.5, color: "var(--red)", fontFamily: FONT_METIN,
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
          borderRadius: 9, padding: "8px 11px",
        }}>
          <AlertTriangle size={13} /> {hata}
        </div>
      )}

      {loading && !medyalar.length ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : !medyalar.length ? (
        <div style={{
          padding: "44px 20px", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <Sparkles size={26} style={{ color: "var(--text-3)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
            {tr("Onay bekleyen içerik yok", "Nichts zur Freigabe")}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: FONT_BASLIK, maxWidth: 380, lineHeight: 1.5 }}>
            {uretimde > 0
              ? tr(`${uretimde} içerik hâlâ üretiliyor — bitince burada belirir.`,
                   `${uretimde} Inhalte werden noch erzeugt — sie erscheinen hier.`)
              : tr("Takvime gönderi eklendiğinde üretim başlar; biten içerik onay için buraya düşer.",
                   "Sobald der Kalender gefüllt ist, startet die Produktion; fertige Inhalte landen hier.")}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {medyalar.map((m) => (
            <OnayKarti
              key={m.id}
              medya={m}
              post={m.post_id ? postlar[m.post_id] : undefined}
              hesaplar={hesaplar}
              url={urller[m.thumbnail_yolu || m.depo_yolu]}
              lang={lang}
              dar={ekran.dar}
              mesgul={islenen === m.id}
              onOnayla={onaylaVeYayinla}
              onReddet={reddet}
            />
          ))}
        </div>
      )}
    </div>
  );
};
