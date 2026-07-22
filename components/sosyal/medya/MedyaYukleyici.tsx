import React, { useRef, useState } from "react";
import { UploadCloud, Loader2, AlertTriangle, X } from "lucide-react";
import type { YuklemeDurumu } from "../../../services/sosyal/useSmMedia";
import { FONT_BASLIK, FONT_METIN, SM_RENK, buton } from "../ortak";

interface Props {
  lang: string;
  yuklemeler: YuklemeDurumu[];
  onYukle: (dosyalar: File[]) => void;
  onTemizle: () => void;
  devreDisi?: boolean;
}

/** Bucket'ın allowed_mime_types listesiyle aynı tutulmalı (20260722_sm_storage.sql). */
const KABUL =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/quicktime,video/webm";

export const MedyaYukleyici: React.FC<Props> = ({
  lang, yuklemeler, onYukle, onTemizle, devreDisi,
}) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const inputRef = useRef<HTMLInputElement>(null);
  const [surukleniyor, setSurukleniyor] = useState(false);

  const calisiyor = yuklemeler.some((y) => !y.hata && y.yuzde < 100);
  const hatalilar = yuklemeler.filter((y) => y.hata);

  const dosyalariAl = (list: FileList | null) => {
    const dosyalar = Array.from(list || []);
    if (dosyalar.length) onYukle(dosyalar);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!devreDisi) setSurukleniyor(true); }}
        onDragLeave={() => setSurukleniyor(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurukleniyor(false);
          if (!devreDisi) dosyalariAl(e.dataTransfer.files);
        }}
        onClick={() => !devreDisi && inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${surukleniyor ? SM_RENK : "var(--border-md)"}`,
          background: surukleniyor ? `${SM_RENK}0d` : "var(--panel-2)",
          borderRadius: 13, padding: "18px 16px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          // Dar ekranda ikon + metin alt alta düşsün, taşmasın.
          flexWrap: "wrap",
          cursor: devreDisi ? "not-allowed" : "pointer",
          opacity: devreDisi ? 0.55 : 1,
          transition: "all .15s", textAlign: "center",
        }}
      >
        {calisiyor
          ? <Loader2 size={17} className="spin" style={{ color: SM_RENK }} />
          : <UploadCloud size={17} style={{ color: SM_RENK }} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-1)", fontFamily: FONT_METIN }}>
            {calisiyor
              ? tr("Yükleniyor…", "Wird hochgeladen…")
              : tr("Dosyaları sürükleyin veya tıklayın", "Dateien ziehen oder klicken")}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
            {tr("JPG · PNG · WEBP · GIF · MP4 · MOV · WEBM — en fazla 500 MB",
                "JPG · PNG · WEBP · GIF · MP4 · MOV · WEBM — max. 500 MB")}
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={KABUL}
          onChange={(e) => { dosyalariAl(e.target.files); e.target.value = ""; }}
          style={{ display: "none" }}
        />
      </div>

      {/* İlerleme / hata satırları */}
      {!!yuklemeler.length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {yuklemeler.map((y, i) => (
            <div key={`${y.ad}-${i}`} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 9px", borderRadius: 8,
              background: y.hata ? "rgba(239,68,68,.08)" : "var(--panel-2)",
              border: `1px solid ${y.hata ? "rgba(239,68,68,.25)" : "var(--border)"}`,
            }}>
              {y.hata && <AlertTriangle size={12} style={{ color: "var(--red)", flexShrink: 0 }} />}
              <span style={{
                flex: 1, fontSize: 11, color: "var(--text-2)", fontFamily: FONT_METIN,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{y.ad}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: FONT_BASLIK, flexShrink: 0,
                color: y.hata ? "var(--red)" : y.yuzde === 100 ? "var(--green)" : "var(--text-3)",
              }}>
                {y.hata ? y.hata : `${y.yuzde}%`}
              </span>
            </div>
          ))}

          {!!hatalilar.length && !calisiyor && (
            <button onClick={onTemizle} style={{ ...buton("#64748b"), alignSelf: "flex-start" }}>
              <X size={12} /> {tr("Listeyi temizle", "Liste leeren")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
