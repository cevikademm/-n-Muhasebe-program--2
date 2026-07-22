import React from "react";
import { Building2, Sparkles } from "lucide-react";
import type { MusteriId, SmMusteri } from "../../services/sosyal/types";
import { FONT_BASLIK, FONT_METIN, SM_RENK } from "./ortak";

interface Props {
  musteriler: SmMusteri[];
  secili: MusteriId;
  setSecili: (id: MusteriId) => void;
  lang: string;
}

/**
 * Aktif markayı seçer. `null` = "Kendi markam" — sm_* tablolarında
 * customer_id IS NULL olan satırlar, yani /sosyal-medya skill'inin
 * bugüne kadar ürettiği veri. Müşteriler `companies` tablosundan gelir.
 */
export const MusteriSecici: React.FC<Props> = ({ musteriler, secili, setSecili, lang }) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: "var(--text-3)",
        fontFamily: FONT_BASLIK, whiteSpace: "nowrap",
      }}>
        {tr("MARKA", "MARKE")}
      </span>

      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {secili === null
          ? <Sparkles size={12} style={{ position: "absolute", left: 9, color: SM_RENK, pointerEvents: "none" }} />
          : <Building2 size={12} style={{ position: "absolute", left: 9, color: "var(--text-3)", pointerEvents: "none" }} />}
        <select
          value={secili ?? "__kendi__"}
          onChange={(e) => setSecili(e.target.value === "__kendi__" ? null : e.target.value)}
          style={{
            padding: "6px 10px 6px 26px", borderRadius: 8,
            background: "var(--panel-2)", border: "1px solid var(--border)",
            color: "var(--text-1)", fontSize: 11.5, fontWeight: 600,
            fontFamily: FONT_METIN, cursor: "pointer", outline: "none",
            maxWidth: 220,
          }}
        >
          <option value="__kendi__">{tr("Kendi markam", "Meine Marke")}</option>
          {musteriler.map((m) => (
            <option key={m.id} value={m.id}>{m.company_name}</option>
          ))}
        </select>
      </div>

      {!musteriler.length && (
        <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: FONT_BASLIK, whiteSpace: "nowrap" }}>
          {tr("(müşteri eklenmemiş)", "(keine Kunden)")}
        </span>
      )}
    </div>
  );
};
