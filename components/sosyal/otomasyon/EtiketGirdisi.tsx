import React, { useState } from "react";
import { X, Plus } from "lucide-react";
import { hashtagAyristir, hashtagNormalize } from "../../../services/sosyal/otomasyonMetin";
import { FONT_BASLIK, FONT_METIN, SM_RENK } from "../ortak";

interface Props {
  etiketler: string[];
  onDegis: (yeni: string[]) => void;
  placeholder: string;
  lang: string;
  /** Boşken gösterilecek yardımcı cümle. */
  bosMetin?: string;
}

/**
 * Hashtag çipleri. Serbest metin yerine çip kullanılıyor çünkü etiketler
 * girişte NORMALİZE ediliyor ("Buchhaltung!" → "#buchhaltung"): kullanıcı
 * neyin gerçekten kaydedildiğini yayından önce görmeli.
 *
 * Yapıştırma desteklenir — "#a, #b #c" tek hamlede üç çipe dönüşür.
 */
export const EtiketGirdisi: React.FC<Props> = ({
  etiketler, onDegis, placeholder, lang, bosMetin,
}) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const [taslak, setTaslak] = useState("");

  const ekle = (ham: string) => {
    const yeniler = hashtagAyristir(ham);
    if (!yeniler.length) { setTaslak(""); return; }
    const mevcut = new Set(etiketler.map((e) => e.toLocaleLowerCase("tr")));
    onDegis([...etiketler, ...yeniler.filter((e) => !mevcut.has(e.toLocaleLowerCase("tr")))]);
    setTaslak("");
  };

  const sil = (etiket: string) => onDegis(etiketler.filter((e) => e !== etiket));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={taslak}
          onChange={(e) => setTaslak(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); ekle(taslak); }
            // Boş kutuda geri silme son çipi alır — çip arayüzlerinin beklenen davranışı.
            if (e.key === "Backspace" && !taslak && etiketler.length) {
              onDegis(etiketler.slice(0, -1));
            }
          }}
          onBlur={() => ekle(taslak)}
          onPaste={(e) => {
            const metin = e.clipboardData.getData("text");
            if (/[\s,;]/.test(metin)) { e.preventDefault(); ekle(metin); }
          }}
          placeholder={placeholder}
          style={{
            flex: 1, padding: "8px 11px", borderRadius: 9,
            background: "var(--panel-2)", border: "1px solid var(--border)",
            color: "var(--text-1)", fontSize: 12.5, fontFamily: FONT_METIN, outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => ekle(taslak)}
          disabled={!hashtagNormalize(taslak)}
          aria-label={tr("Ekle", "Hinzufügen")}
          style={{
            display: "flex", alignItems: "center", padding: "0 11px", borderRadius: 9,
            background: `${SM_RENK}14`, border: `1px solid ${SM_RENK}33`, color: SM_RENK,
            cursor: hashtagNormalize(taslak) ? "pointer" : "not-allowed",
            opacity: hashtagNormalize(taslak) ? 1 : 0.45,
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {etiketler.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {etiketler.map((e) => (
            <span
              key={e}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 5px 3px 9px", borderRadius: 7,
                fontSize: 11, fontWeight: 700, fontFamily: FONT_METIN,
                background: `${SM_RENK}12`, color: SM_RENK, border: `1px solid ${SM_RENK}2e`,
              }}
            >
              {e}
              <button
                type="button"
                onClick={() => sil(e)}
                aria-label={`${e} ${tr("kaldır", "entfernen")}`}
                style={{
                  display: "flex", padding: 2, borderRadius: 5, cursor: "pointer",
                  background: "transparent", border: "none", color: SM_RENK, opacity: 0.7,
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : bosMetin ? (
        <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
          {bosMetin}
        </span>
      ) : null}
    </div>
  );
};
