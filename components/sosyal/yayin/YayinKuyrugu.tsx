import React, { useState, useMemo } from "react";
import {
  Loader2, AlertTriangle, Send, RefreshCw, Inbox,
} from "lucide-react";
import { useSmYayin } from "../../../services/sosyal/useSmYayin";
import { useSmAccounts } from "../../../services/sosyal/useSmAccounts";
import type { MusteriId, SmYayinDurum } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK, YAYIN_DURUM_META, buton } from "../ortak";
import { useEkran } from "../ekran";
import { YayinSatiri } from "./YayinSatiri";

interface Props {
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
}

type Suzgec = SmYayinDurum | "hepsi";

/**
 * Yayın kuyruğu sekmesi: neyin nereye gittiğinin tek ekranda kaydı.
 * Devam eden işler `useSmYayin` içindeki döngüyle kendiliğinden ilerler,
 * kullanıcı sayfayı yenilemek zorunda kalmaz.
 */
export const YayinKuyrugu: React.FC<Props> = ({ ownerId, customerId, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();
  const [suzgec, setSuzgec] = useState<Suzgec>("hepsi");

  const {
    yayinlar, loading, hata, calisiyor, getir, tekrarDene, iptal, kaydiSil,
  } = useSmYayin(ownerId, customerId);
  const { hesaplar } = useSmAccounts(ownerId, customerId);

  const sayimlar = useMemo(() => {
    const s: Record<string, number> = { hepsi: yayinlar.length };
    for (const y of yayinlar) s[y.durum] = (s[y.durum] ?? 0) + 1;
    return s;
  }, [yayinlar]);

  const gosterilen = suzgec === "hepsi" ? yayinlar : yayinlar.filter((y) => y.durum === suzgec);

  const cipler: Suzgec[] = [
    "hepsi", "yayinlaniyor", "yayinlandi", "hata", "kuyrukta", "iptal",
  ];

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
          <Send size={14} style={{ color: SM_RENK }} />
          {tr("Yayın kuyruğu", "Veröffentlichungs-Queue")}
          {calisiyor && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6,
              background: "rgba(6,182,212,.14)", color: "#06b6d4",
              border: "1px solid rgba(6,182,212,.3)",
            }}>
              <Loader2 size={9} className="spin" /> {tr("çalışıyor", "läuft")}
            </span>
          )}
        </span>
        <button onClick={getir} style={buton(SM_RENK)}>
          <RefreshCw size={12} /> {tr("Yenile", "Aktualisieren")}
        </button>
      </div>

      {/* Süzgeç çipleri */}
      <div style={{
        display: "flex", gap: 6, flexWrap: ekran.mobil ? "nowrap" : "wrap",
        overflowX: ekran.mobil ? "auto" : "visible",
        paddingBottom: ekran.mobil ? 3 : 0,
      }}>
        {cipler.map((c) => {
          const aktif = suzgec === c;
          const renk = c === "hepsi" ? SM_RENK : YAYIN_DURUM_META[c][2];
          const etiket = c === "hepsi"
            ? tr("Hepsi", "Alle")
            : tr(YAYIN_DURUM_META[c][0], YAYIN_DURUM_META[c][1]);
          const adet = sayimlar[c] ?? 0;
          if (c !== "hepsi" && !adet) return null;
          return (
            <button
              key={c}
              onClick={() => setSuzgec(c)}
              style={{
                flexShrink: 0,
                padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                fontSize: 11, fontWeight: 700, fontFamily: FONT_METIN,
                background: aktif ? `${renk}1c` : "var(--panel-2)",
                color: aktif ? renk : "var(--text-2)",
                border: `1px solid ${aktif ? `${renk}45` : "var(--border)"}`,
                transition: "all .15s",
              }}
            >
              {etiket} {adet ? `(${adet})` : ""}
            </button>
          );
        })}
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

      {loading && !yayinlar.length ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : !gosterilen.length ? (
        <div style={{
          padding: "44px 20px", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <Inbox size={26} style={{ color: "var(--text-3)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
            {tr("Kuyruk boş", "Queue ist leer")}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: FONT_BASLIK, maxWidth: 340 }}>
            {tr("Medya Kütüphanesi'nden bir görsel seçip “Yayınla” deyin; hedefleri burada takip edersiniz.",
                "Wählen Sie in der Medienbibliothek ein Motiv und klicken Sie auf „Veröffentlichen“.")}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {gosterilen.map((y) => (
            <YayinSatiri
              key={y.id}
              yayin={y}
              hesap={hesaplar.find((h) => h.id === y.account_id)}
              lang={lang}
              dar={ekran.mobil}
              onTekrar={tekrarDene}
              onIptal={iptal}
              onSil={kaydiSil}
            />
          ))}
        </div>
      )}
    </div>
  );
};
