import React, { useState } from "react";
import { Plus, Loader2, Users2, AlertTriangle } from "lucide-react";
import { useSmAccounts } from "../../../services/sosyal/useSmAccounts";
import type { MusteriId } from "../../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK, buton } from "../ortak";
import { HesapKarti } from "./HesapKarti";
import { HesapBaglaModal } from "./HesapBaglaModal";

interface Props {
  ownerId: string | undefined;
  customerId: MusteriId;
  lang: string;
}

export const HesapListesi: React.FC<Props> = ({ ownerId, customerId, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const [modalAcik, setModalAcik] = useState(false);
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);

  const { hesaplar, loading, hata, dogrulanan, getir, ekle, sil, bagla, dogrula, kopar } =
    useSmAccounts(ownerId, customerId);

  // Kart aksiyonları hata fırlatabilir; kullanıcıya sessiz kalmayalım.
  const sar = (fn: (id: string) => Promise<unknown>) => async (id: string) => {
    setIslemHatasi(null);
    try { await fn(id); }
    catch (e: any) { setIslemHatasi(e?.message || tr("İşlem başarısız.", "Vorgang fehlgeschlagen.")); }
  };

  return (
    <div style={{ padding: 15, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK }}>
          {tr("Bağlı sosyal hesaplar", "Verbundene Social-Konten")}
        </span>
        <button onClick={() => setModalAcik(true)} disabled={!ownerId}
          style={{ ...buton(SM_RENK, true), opacity: ownerId ? 1 : 0.5 }}>
          <Plus size={12} /> {tr("Hesap bağla", "Konto verbinden")}
        </button>
      </div>

      {(hata || islemHatasi) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          fontSize: 11.5, color: "var(--red)", fontFamily: FONT_METIN,
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
          borderRadius: 9, padding: "8px 11px",
        }}>
          <AlertTriangle size={13} /> {hata || islemHatasi}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : !hesaplar.length ? (
        <div style={{
          padding: "44px 20px", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <Users2 size={26} style={{ color: "var(--text-3)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)", fontFamily: FONT_METIN }}>
            {tr("Henüz bağlı hesap yok", "Noch keine verbundenen Konten")}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: FONT_BASLIK, maxWidth: 340 }}>
            {tr("Instagram bu fazda uçtan uca doğrulanabiliyor; YouTube ve Facebook kaydedilebilir, otomatik doğrulama sonraki adımda.",
                "Instagram lässt sich bereits vollständig verifizieren; YouTube und Facebook können angelegt werden.")}
          </span>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
          gap: 11,
        }}>
          {hesaplar.map((h) => (
            <HesapKarti
              key={h.id}
              hesap={h}
              lang={lang}
              dogrulanıyor={dogrulanan === h.id}
              onBagla={sar(bagla)}
              onDogrula={sar(dogrula)}
              onKopar={sar(kopar)}
              onSil={sar(sil)}
            />
          ))}
        </div>
      )}

      {modalAcik && (
        <HesapBaglaModal
          lang={lang}
          onKapat={() => setModalAcik(false)}
          onEkle={ekle}
          onBitti={getir}
        />
      )}
    </div>
  );
};
