import React, { useState } from "react";
import {
  Images, Share2, CalendarDays, BarChart3, Send, Wand2, CheckCircle2,
} from "lucide-react";
import { useLang } from "../../LanguageContext";
import { useSmMusteriler } from "../../services/sosyal/useSmAccounts";
import { useSmOnaySayaci } from "../../services/sosyal/useSmOnay";
import type { MusteriId } from "../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK } from "./ortak";
import { useEkran } from "./ekran";
import { MusteriSecici } from "./MusteriSecici";
import { MedyaKutuphanesi } from "./medya/MedyaKutuphanesi";
import { HesapListesi } from "./hesaplar/HesapListesi";
import { YayinKuyrugu } from "./yayin/YayinKuyrugu";
import { OnayKutusu } from "./onay/OnayKutusu";
import { OtomasyonPaneli } from "./otomasyon/OtomasyonPaneli";

type Sekme = "medya" | "onay" | "yayin" | "otomasyon" | "hesaplar" | "takvim" | "analiz";

interface Props {
  ownerId: string | undefined;
}

/**
 * Sosyal Medya OS'un kabuğu. Yalnızca sekme yönlendirmesi ve aktif marka
 * seçimi yapar — iş mantığı alt modüllerde. Sekmeler MenuKey'e taşınmadı:
 * modül içi gezinme uygulamanın ana menüsünü şişirmemeli.
 */
export const SosyalMedyaPanel: React.FC<Props> = ({ ownerId }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();

  const [sekme, setSekme] = useState<Sekme>("medya");
  const [musteriId, setMusteriId] = useState<MusteriId>(null);
  const { musteriler } = useSmMusteriler(ownerId);
  // Onay bekleyen üretim sayısı — rozet sekmede durur ki kullanıcı
  // Sosyal Medya'ya girdiği an "bir şey beni bekliyor" görsün.
  const { sayi: onayBekleyen } = useSmOnaySayaci(ownerId, musteriId);

  const SEKMELER: {
    id: Sekme; tr: string; de: string; kisa: string;
    ikon: React.FC<any>; hazir: boolean; rozet?: number;
  }[] = [
    { id: "medya",    tr: "Medya Kütüphanesi", de: "Medienbibliothek", kisa: "Medya",    ikon: Images,       hazir: true },
    { id: "onay",     tr: "Onay",              de: "Freigaben",        kisa: "Onay",     ikon: CheckCircle2, hazir: true, rozet: onayBekleyen },
    { id: "yayin",    tr: "Yayın Kuyruğu",     de: "Queue",            kisa: "Yayın",    ikon: Send,         hazir: true },
    { id: "otomasyon", tr: "Otomasyon",        de: "Automatik",        kisa: "Otomasyon", ikon: Wand2,       hazir: true },
    { id: "hesaplar", tr: "Hesaplar",          de: "Konten",           kisa: "Hesaplar", ikon: Share2,       hazir: true },
    { id: "takvim",   tr: "Takvim",            de: "Kalender",         kisa: "Takvim",   ikon: CalendarDays, hazir: false },
    { id: "analiz",   tr: "Analiz",            de: "Analyse",          kisa: "Analiz",   ikon: BarChart3,    hazir: false },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Üst çubuk: sekmeler + marka seçici.
          Dar ekranda sekmeler yatay kayar, marka seçici alt satıra iner. */}
      <div style={{
        display: "flex", alignItems: ekran.mobil ? "stretch" : "center",
        flexDirection: ekran.mobil ? "column" : "row",
        gap: ekran.mobil ? 8 : 10,
        padding: ekran.mobil ? "9px 12px" : "10px 15px",
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)", flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          flexWrap: ekran.dar ? "nowrap" : "wrap",
          overflowX: ekran.dar ? "auto" : "visible",
          // Dar ekranda kaydırma çubuğu yer kaplamasın — jest yeterli.
          scrollbarWidth: "none",
        }}>
          {SEKMELER.map((s) => {
            const aktif = sekme === s.id;
            const Ikon = s.ikon;
            return (
              <button
                key={s.id}
                onClick={() => s.hazir && setSekme(s.id)}
                disabled={!s.hazir}
                title={s.hazir ? undefined : tr("Sonraki fazda", "In der nächsten Phase")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
                  padding: ekran.mobil ? "7px 10px" : "6px 11px", borderRadius: 9,
                  fontSize: 12, fontWeight: 700, fontFamily: FONT_METIN,
                  cursor: s.hazir ? "pointer" : "not-allowed",
                  background: aktif ? `${SM_RENK}1a` : "transparent",
                  color: aktif ? SM_RENK : "var(--text-2)",
                  border: `1px solid ${aktif ? `${SM_RENK}38` : "transparent"}`,
                  opacity: s.hazir ? 1 : 0.45,
                  whiteSpace: "nowrap",
                  transition: "all .15s",
                }}
              >
                <Ikon size={13} /> {ekran.dar ? s.kisa : tr(s.tr, s.de)}
                {!!s.rozet && (
                  <span style={{
                    minWidth: 15, padding: "0 4px", borderRadius: 999,
                    background: "#f59e0b", color: "#fff",
                    fontSize: 9.5, fontWeight: 800, lineHeight: "15px",
                    textAlign: "center", fontFamily: FONT_BASLIK,
                  }}>
                    {s.rozet}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: ekran.mobil ? 0 : "auto" }}>
          <MusteriSecici
            musteriler={musteriler}
            secili={musteriId}
            setSecili={setMusteriId}
            lang={lang}
          />
        </div>
      </div>

      {/* İçerik */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {sekme === "medya" && (
          <MedyaKutuphanesi ownerId={ownerId} customerId={musteriId} lang={lang} />
        )}
        {sekme === "onay" && (
          <OnayKutusu ownerId={ownerId} customerId={musteriId} lang={lang} />
        )}
        {sekme === "yayin" && (
          <YayinKuyrugu ownerId={ownerId} customerId={musteriId} lang={lang} />
        )}
        {sekme === "otomasyon" && (
          <OtomasyonPaneli ownerId={ownerId} customerId={musteriId} lang={lang} />
        )}
        {sekme === "hesaplar" && (
          <HesapListesi ownerId={ownerId} customerId={musteriId} lang={lang} />
        )}
        {(sekme === "takvim" || sekme === "analiz") && (
          <div style={{
            height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 6,
            padding: 20, textAlign: "center",
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
              {tr("Sonraki fazda", "In der nächsten Phase")}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("Zamanlanmış takvim ve analitik Faz 5'te açılacak.",
                  "Geplanter Kalender und Analytics folgen in Phase 5.")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
