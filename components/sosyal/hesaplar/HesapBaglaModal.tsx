import React, { useState } from "react";
import { X, Loader2, Plus, Info } from "lucide-react";
import type { SmPlatform } from "../../../services/sosyal/types";
import {
  PLATFORM_META, AKTIF_PLATFORMLAR, FONT_BASLIK, FONT_METIN, SM_RENK, buton, girdi,
} from "../ortak";

interface Props {
  lang: string;
  onKapat: () => void;
  onEkle: (p: { platform: SmPlatform; handle: string; url?: string }) => Promise<{ id: string }>;
  onBitti: () => void;
}

const TUM_PLATFORMLAR = Object.keys(PLATFORM_META) as SmPlatform[];

export const HesapBaglaModal: React.FC<Props> = ({ lang, onKapat, onEkle, onBitti }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const [platform, setPlatform] = useState<SmPlatform>("instagram");
  const [handle, setHandle] = useState("");
  const [url, setUrl] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);

  const hazir = AKTIF_PLATFORMLAR.includes(platform);

  const gonder = async () => {
    if (!handle.trim()) {
      setHata(tr("Handle gerekli.", "Handle erforderlich."));
      return;
    }
    setCalisiyor(true);
    setHata(null);
    setBilgi(null);
    try {
      // Yalnızca kaydı oluştur. Doğrulama, hesabın KENDİ OAuth bağlantısını
      // gerektiriyor — kullanıcı listede "Bağla"ya bastığında kurulur.
      // (Eskiden burada otomatik doğrulanıyordu; ortak bağlantı kullandığı
      //  için ikinci hesabı birincinin verisiyle eşleştiriyordu.)
      await onEkle({ platform, handle: handle.trim(), url: url.trim() || undefined });
      onBitti();
      onKapat();
    } catch (e: any) {
      setHata(e?.message || tr("İşlem başarısız.", "Vorgang fehlgeschlagen."));
      setCalisiyor(false);
    }
  };

  return (
    <div
      onClick={onKapat}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(15,23,42,.45)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, background: "var(--panel)",
          border: "1px solid var(--border)", borderRadius: 15,
          display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 14px", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK }}>
            {tr("Sosyal hesap bağla", "Social-Konto verbinden")}
          </span>
          <button onClick={onKapat} aria-label={tr("Kapat", "Schließen")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          {/* Platform seçimi */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("PLATFORM", "PLATTFORM")}
            </span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {TUM_PLATFORMLAR.map((p) => {
                const [ad, renk] = PLATFORM_META[p];
                const aktif = platform === p;
                const destekli = AKTIF_PLATFORMLAR.includes(p);
                return (
                  <button key={p} onClick={() => setPlatform(p)} style={{
                    fontSize: 11, fontWeight: 700, fontFamily: FONT_METIN,
                    padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                    background: aktif ? `${renk}1f` : "var(--panel-2)",
                    color: aktif ? renk : "var(--text-2)",
                    border: `1px solid ${aktif ? `${renk}44` : "var(--border)"}`,
                    opacity: destekli ? 1 : 0.55,
                  }}>
                    {ad}{!destekli && " ·"}
                  </button>
                );
              })}
            </div>
          </div>

          {hazir && (
            <div style={{
              display: "flex", gap: 7, alignItems: "flex-start",
              fontSize: 11, color: "var(--text-2)", fontFamily: FONT_METIN,
              background: "var(--panel-2)", border: "1px solid var(--border)",
              borderRadius: 9, padding: "8px 10px", lineHeight: 1.5,
            }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: SM_RENK }} />
              {tr("Eklendikten sonra listede “Bağla”ya basın: hesap kendi OAuth bağlantısını alır ve otomatik doğrulanır.",
                  "Nach dem Anlegen auf „Verbinden“ klicken: Das Konto erhält seine eigene OAuth-Verbindung.")}
            </div>
          )}

          {!hazir && (
            <div style={{
              display: "flex", gap: 7, alignItems: "flex-start",
              fontSize: 11, color: "var(--text-2)", fontFamily: FONT_METIN,
              background: "var(--panel-2)", border: "1px solid var(--border)",
              borderRadius: 9, padding: "8px 10px", lineHeight: 1.5,
            }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1, color: "#f59e0b" }} />
              {tr("Bu platform kaydedilebilir ama otomatik doğrulama henüz yok. Hesap listeye 'Yakında' olarak eklenir.",
                  "Diese Plattform kann angelegt werden, eine automatische Prüfung gibt es noch nicht.")}
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("HANDLE", "HANDLE")}
            </span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)}
              placeholder="@fikoai" style={girdi}
              onKeyDown={(e) => { if (e.key === "Enter" && !calisiyor) gonder(); }} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              {tr("PROFİL URL'İ (opsiyonel)", "PROFIL-URL (optional)")}
            </span>
            <input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://instagram.com/fikoai" style={girdi} />
          </label>

          {hata && (
            <div style={{
              fontSize: 11, color: "var(--red)", fontFamily: FONT_METIN,
              background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
              borderRadius: 9, padding: "7px 10px",
            }}>{hata}</div>
          )}
          {bilgi && (
            <div style={{
              fontSize: 11, color: "#b45309", fontFamily: FONT_METIN,
              background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.28)",
              borderRadius: 9, padding: "7px 10px",
            }}>{bilgi}</div>
          )}
        </div>

        <div style={{
          display: "flex", gap: 7, justifyContent: "flex-end",
          padding: "11px 14px", borderTop: "1px solid var(--border)",
        }}>
          <button onClick={onKapat} style={buton("#64748b")}>{tr("Vazgeç", "Abbrechen")}</button>
          <button onClick={gonder} disabled={calisiyor}
            style={{ ...buton(SM_RENK, true), opacity: calisiyor ? 0.6 : 1 }}>
            {calisiyor ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
            {tr("Ekle", "Anlegen")}
          </button>
        </div>
      </div>
    </div>
  );
};
