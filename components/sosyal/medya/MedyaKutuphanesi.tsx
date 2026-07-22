import React, { useState, useMemo } from "react";
import { Loader2, ImageOff, AlertTriangle } from "lucide-react";
import { useSmMedia } from "../../../services/sosyal/useSmMedia";
import { etiketleriTopla } from "../../../services/sosyal/smMediaService";
import type { SmMedya, SmMedyaFiltre, MusteriId } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN } from "../ortak";
import { useEkran } from "../ekran";
import { MedyaFiltreler } from "./MedyaFiltreler";
import { MedyaYukleyici } from "./MedyaYukleyici";
import { MedyaKarti } from "./MedyaKarti";
import { MedyaDetayCekmecesi } from "./MedyaDetayCekmecesi";
import { YayinModal } from "../yayin/YayinModal";

interface Props {
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
}

export const MedyaKutuphanesi: React.FC<Props> = ({ ownerId, customerId, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const ekran = useEkran();
  const [filtre, setFiltre] = useState<SmMedyaFiltre>({});
  const [secili, setSecili] = useState<SmMedya | null>(null);
  const [yayinlanacak, setYayinlanacak] = useState<SmMedya | null>(null);

  const {
    medyalar, urller, loading, hata,
    yuklemeler, yuklemeleriTemizle, yukle, guncelle, sil, favoriDegistir, getir,
  } = useSmMedia(ownerId, customerId, filtre);

  // Etiket çipleri tüm listeden türetilir; filtre daraldıkça çipler
  // kaybolmasın diye yalnızca liste değiştiğinde yeniden hesaplanır.
  const etiketler = useMemo(() => etiketleriTopla(medyalar), [medyalar]);

  // Seçili kayıt listede güncellendiyse (kaydet sonrası) tazele.
  const seciliGuncel = useMemo(
    () => (secili ? medyalar.find((m) => m.id === secili.id) ?? null : null),
    [secili, medyalar],
  );

  const url = (m: SmMedya) => urller[m.thumbnail_yolu || m.depo_yolu];

  /** Dar ekranda çekmece yan sütun değil, üstte açılan tam ekran örtüdür. */
  const cekmece = seciliGuncel && (
    <MedyaDetayCekmecesi
      medya={seciliGuncel}
      url={url(seciliGuncel)}
      lang={lang}
      dar={ekran.dar}
      onKapat={() => setSecili(null)}
      onKaydet={guncelle}
      onSil={sil}
      onYayinla={setYayinlanacak}
    />
  );

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, position: "relative" }}>
      <div style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        gap: 12, padding: ekran.mobil ? 12 : 15, overflowY: "auto",
      }}>
        <MedyaYukleyici
          lang={lang}
          yuklemeler={yuklemeler}
          onYukle={(d) => yukle(d)}
          onTemizle={yuklemeleriTemizle}
          devreDisi={!ownerId}
        />

        <MedyaFiltreler
          filtre={filtre}
          setFiltre={setFiltre}
          etiketler={etiketler}
          lang={lang}
          toplam={medyalar.length}
        />

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

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
            <Loader2 size={20} className="spin" />
          </div>
        ) : !medyalar.length ? (
          <div style={{
            padding: "44px 20px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <ImageOff size={26} style={{ color: "var(--text-3)" }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
              {tr("Henüz medya yok", "Noch keine Medien")}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: FONT_BASLIK, maxWidth: 320 }}>
              {tr("Yukarıdan dosya yükleyin; AI ile üretilen görseller de metadata'sıyla burada toplanır.",
                  "Laden Sie oben Dateien hoch; auch KI-generierte Bilder sammeln sich hier mit ihren Metadaten.")}
            </span>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${ekran.mobil ? 132 : 158}px, 1fr))`,
            gap: ekran.mobil ? 9 : 11,
          }}>
            {medyalar.map((m) => (
              <MedyaKarti
                key={m.id}
                medya={m}
                url={url(m)}
                lang={lang}
                secili={seciliGuncel?.id === m.id}
                dokunmatik={ekran.dar}
                onAc={setSecili}
                onFavori={favoriDegistir}
                onYayinla={setYayinlanacak}
              />
            ))}
          </div>
        )}
      </div>

      {ekran.dar
        ? seciliGuncel && (
            <div
              onClick={() => setSecili(null)}
              style={{
                position: "absolute", inset: 0, zIndex: 40,
                background: "rgba(2,6,23,.5)", display: "flex", justifyContent: "flex-end",
              }}
            >
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", maxWidth: "100%" }}>
                {cekmece}
              </div>
            </div>
          )
        : cekmece}

      {yayinlanacak && (
        <YayinModal
          medya={yayinlanacak}
          url={url(yayinlanacak)}
          ownerId={ownerId}
          customerId={customerId}
          lang={lang}
          onKapat={() => setYayinlanacak(null)}
          onYayinlandi={getir}
        />
      )}
    </div>
  );
};
