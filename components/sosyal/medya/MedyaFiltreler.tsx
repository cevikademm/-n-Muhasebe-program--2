import React from "react";
import { Search, Star, X } from "lucide-react";
import type { SmMedyaFiltre, SmMedyaDurum } from "../../../services/sosyal/types";
import { DURUM_META, FONT_BASLIK, FONT_METIN, SM_RENK, girdi } from "../ortak";

interface Props {
  filtre: SmMedyaFiltre;
  setFiltre: (f: SmMedyaFiltre) => void;
  etiketler: string[];
  lang: string;
  toplam: number;
}

const TIPLER: { id: "hepsi" | "gorsel" | "video"; tr: string; de: string }[] = [
  { id: "hepsi", tr: "Tümü", de: "Alle" },
  { id: "gorsel", tr: "Görsel", de: "Bild" },
  { id: "video", tr: "Video", de: "Video" },
];

export const MedyaFiltreler: React.FC<Props> = ({ filtre, setFiltre, etiketler, lang, toplam }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const yama = (y: Partial<SmMedyaFiltre>) => setFiltre({ ...filtre, ...y });

  const durumlar = Object.keys(DURUM_META) as SmMedyaDurum[];
  const secilenEtiketler = filtre.etiketler ?? [];

  const cip = (aktif: boolean, renk = SM_RENK): React.CSSProperties => ({
    fontSize: 10.5, fontWeight: 700, fontFamily: FONT_METIN,
    padding: "4px 9px", borderRadius: 7, cursor: "pointer",
    background: aktif ? `${renk}1f` : "var(--panel-2)",
    color: aktif ? renk : "var(--text-2)",
    border: `1px solid ${aktif ? `${renk}44` : "var(--border)"}`,
    transition: "all .12s", whiteSpace: "nowrap",
  });

  const etiketDegistir = (e: string) => {
    const yeni = secilenEtiketler.includes(e)
      ? secilenEtiketler.filter((x) => x !== e)
      : [...secilenEtiketler, e];
    yama({ etiketler: yeni.length ? yeni : undefined });
  };

  const temizVar =
    !!filtre.arama || !!secilenEtiketler.length || filtre.yalnizFavori ||
    (filtre.durum && filtre.durum !== "hepsi") || (filtre.tip && filtre.tip !== "hepsi");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {/* Arama + sayaç */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            color: "var(--text-3)", pointerEvents: "none",
          }} />
          <input
            value={filtre.arama || ""}
            onChange={(e) => yama({ arama: e.target.value || undefined })}
            placeholder={tr("Başlık, açıklama veya prompt'ta ara…", "In Titel, Beschreibung oder Prompt suchen…")}
            style={{ ...girdi, paddingLeft: 30 }}
          />
        </div>

        <button
          onClick={() => yama({ yalnizFavori: !filtre.yalnizFavori })}
          style={cip(!!filtre.yalnizFavori, "#fbbf24")}
        >
          <Star size={11} style={{ verticalAlign: -1, marginRight: 3 }}
            fill={filtre.yalnizFavori ? "#fbbf24" : "none"} />
          {tr("Favoriler", "Favoriten")}
        </button>

        <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK, whiteSpace: "nowrap" }}>
          {toplam} {tr("öğe", "Objekte")}
        </span>

        {temizVar && (
          <button
            onClick={() => setFiltre({})}
            style={{ ...cip(false), display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <X size={11} /> {tr("Temizle", "Zurücksetzen")}
          </button>
        )}
      </div>

      {/* Tip + durum */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {TIPLER.map((t) => (
          <button key={t.id} onClick={() => yama({ tip: t.id })}
            style={cip((filtre.tip ?? "hepsi") === t.id)}>
            {tr(t.tr, t.de)}
          </button>
        ))}

        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 3px" }} />

        <button onClick={() => yama({ durum: "hepsi" })}
          style={cip((filtre.durum ?? "hepsi") === "hepsi")}>
          {tr("Her durum", "Alle Status")}
        </button>
        {durumlar.map((d) => {
          const [a, b, renk] = DURUM_META[d];
          return (
            <button key={d} onClick={() => yama({ durum: d })} style={cip(filtre.durum === d, renk)}>
              {tr(a, b)}
            </button>
          );
        })}
      </div>

      {/* Etiketler */}
      {!!etiketler.length && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {etiketler.map((e) => (
            <button key={e} onClick={() => etiketDegistir(e)}
              style={cip(secilenEtiketler.includes(e), "#8b5cf6")}>
              #{e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
