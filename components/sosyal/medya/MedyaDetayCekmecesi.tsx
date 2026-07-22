import React, { useState, useEffect } from "react";
import { X, Save, Trash2, Star, Loader2, Download, Sparkles, Send } from "lucide-react";
import type { SmMedya, SmMedyaGirdi, SmMedyaDurum } from "../../../services/sosyal/types";
import {
  DURUM_META, FONT_BASLIK, FONT_METIN, SM_RENK,
  boyutMetni, sureMetni, videoMu, buton, girdi, rozet,
} from "../ortak";

interface Props {
  medya: SmMedya;
  url?: string;
  lang: string;
  /** Dar ekranda çekmece yan sütun değil, tam genişlikte örtü olur. */
  dar?: boolean;
  onKapat: () => void;
  onKaydet: (id: string, yama: SmMedyaGirdi) => Promise<unknown>;
  onSil: (m: SmMedya) => Promise<void>;
  onYayinla?: (m: SmMedya) => void;
}

export const MedyaDetayCekmecesi: React.FC<Props> = ({
  medya, url, lang, dar, onKapat, onKaydet, onSil, onYayinla,
}) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const [baslik, setBaslik] = useState(medya.baslik || "");
  const [aciklama, setAciklama] = useState(medya.aciklama || "");
  const [durum, setDurum] = useState<SmMedyaDurum>(medya.durum);
  const [etiketMetni, setEtiketMetni] = useState((medya.etiketler || []).join(", "));
  const [kaydediyor, setKaydediyor] = useState(false);
  const [siliyor, setSiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [silOnay, setSilOnay] = useState(false);

  // Farklı bir medya seçildiğinde formu o kayda göre tazele.
  useEffect(() => {
    setBaslik(medya.baslik || "");
    setAciklama(medya.aciklama || "");
    setDurum(medya.durum);
    setEtiketMetni((medya.etiketler || []).join(", "));
    setHata(null);
    setSilOnay(false);
  }, [medya.id]);

  const kaydet = async () => {
    setKaydediyor(true);
    setHata(null);
    try {
      await onKaydet(medya.id, {
        baslik: baslik.trim() || null,
        aciklama: aciklama.trim() || null,
        durum,
        etiketler: etiketMetni.split(",").map((e) => e.trim()).filter(Boolean),
      });
    } catch (e: any) {
      setHata(e?.message || tr("Kaydedilemedi.", "Speichern fehlgeschlagen."));
    } finally {
      setKaydediyor(false);
    }
  };

  const sil = async () => {
    setSiliyor(true);
    setHata(null);
    try {
      await onSil(medya);
      onKapat();
    } catch (e: any) {
      setHata(e?.message || tr("Silinemedi.", "Löschen fehlgeschlagen."));
      setSiliyor(false);
    }
  };

  const satir = (etiket: string, deger: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0" }}>
      <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>{etiket}</span>
      <span style={{
        fontSize: 10.5, color: "var(--text-2)", fontFamily: FONT_BASLIK,
        textAlign: "right", wordBreak: "break-word",
      }}>{deger}</span>
    </div>
  );

  const [etTr, etDe, renk] = DURUM_META[medya.durum] ?? DURUM_META.taslak;
  const aiVar = !!(medya.prompt || medya.model || medya.seed != null);

  return (
    <aside style={{
      width: dar ? "min(360px, 100vw)" : 330,
      flexShrink: 0, borderLeft: "1px solid var(--border)",
      background: "var(--panel)", display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
      boxShadow: dar ? "-14px 0 40px rgba(2,6,23,.28)" : "none",
    }}>
      {/* Başlık */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "11px 13px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: 800, color: "var(--text-1)",
          fontFamily: FONT_BASLIK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {tr("Medya detayı", "Mediendetails")}
        </span>
        {medya.favori && <Star size={13} fill="#fbbf24" style={{ color: "#fbbf24" }} />}
        <span style={rozet(renk)}>{tr(etTr, etDe)}</span>
        <button onClick={onKapat} aria-label={tr("Kapat", "Schließen")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex" }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 13, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Önizleme */}
        {url && (
          <div style={{
            borderRadius: 11, overflow: "hidden", background: "var(--panel-2)",
            border: "1px solid var(--border)",
          }}>
            {videoMu(medya.mime_tipi)
              ? <video src={url} controls playsInline style={{ width: "100%", display: "block", maxHeight: 250 }} />
              : <img src={url} alt={medya.baslik || ""} style={{ width: "100%", display: "block", maxHeight: 250, objectFit: "contain" }} />}
          </div>
        )}

        {/* Düzenlenebilir alanlar */}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
            {tr("BAŞLIK", "TITEL")}
          </span>
          <input value={baslik} onChange={(e) => setBaslik(e.target.value)} style={girdi} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
            {tr("AÇIKLAMA", "BESCHREIBUNG")}
          </span>
          <textarea value={aciklama} onChange={(e) => setAciklama(e.target.value)} rows={3}
            style={{ ...girdi, resize: "vertical" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
            {tr("DURUM", "STATUS")}
          </span>
          <select value={durum} onChange={(e) => setDurum(e.target.value as SmMedyaDurum)} style={girdi}>
            {(Object.keys(DURUM_META) as SmMedyaDurum[]).map((d) => (
              <option key={d} value={d}>{tr(DURUM_META[d][0], DURUM_META[d][1])}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
            {tr("ETİKETLER (virgülle)", "TAGS (kommagetrennt)")}
          </span>
          <input value={etiketMetni} onChange={(e) => setEtiketMetni(e.target.value)}
            placeholder={tr("reels, tanıtım, mavi", "reels, promo, blau")} style={girdi} />
        </label>

        {/* AI üretim izi — yalnızca varsa */}
        {aiVar && (
          <div style={{
            background: "var(--panel-2)", border: "1px solid var(--border)",
            borderRadius: 11, padding: "9px 11px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
              <Sparkles size={11} style={{ color: SM_RENK }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-2)", fontFamily: FONT_BASLIK }}>
                {tr("AI ÜRETİM İZİ", "AI-HERKUNFT")}
              </span>
            </div>
            {medya.prompt && (
              <p style={{
                fontSize: 10.5, color: "var(--text-2)", fontFamily: FONT_METIN,
                margin: "0 0 6px", lineHeight: 1.5, whiteSpace: "pre-wrap",
              }}>{medya.prompt}</p>
            )}
            {medya.negative_prompt && satir(tr("Negatif", "Negativ"), medya.negative_prompt)}
            {medya.provider && satir(tr("Sağlayıcı", "Anbieter"), medya.provider)}
            {medya.model && satir("Model", medya.model)}
            {medya.seed != null && satir("Seed", String(medya.seed))}
            {medya.cfg != null && satir("CFG", String(medya.cfg))}
            {medya.steps != null && satir("Steps", String(medya.steps))}
          </div>
        )}

        {/* Teknik bilgi */}
        <div style={{
          background: "var(--panel-2)", border: "1px solid var(--border)",
          borderRadius: 11, padding: "9px 11px",
        }}>
          {satir(tr("Tür", "Typ"), medya.mime_tipi || "—")}
          {satir(tr("Boyut", "Größe"), boyutMetni(medya.boyut))}
          {satir(tr("Çözünürlük", "Auflösung"), medya.cozunurluk || "—")}
          {videoMu(medya.mime_tipi) && satir(tr("Süre", "Dauer"), sureMetni(medya.sure))}
          {satir(tr("Depo", "Speicher"), medya.depo_surucu)}
          {satir(tr("Eklenme", "Erstellt"), new Date(medya.created_at).toLocaleString(lang === "tr" ? "tr-TR" : "de-DE"))}
        </div>

        {hata && (
          <div style={{
            fontSize: 11, color: "var(--red)", fontFamily: FONT_METIN,
            background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
            borderRadius: 9, padding: "7px 10px",
          }}>{hata}</div>
        )}
      </div>

      {/* Alt aksiyonlar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
        padding: "10px 13px", borderTop: "1px solid var(--border)", flexShrink: 0,
      }}>
        {onYayinla && (
          <button
            onClick={() => onYayinla(medya)}
            style={{
              ...buton(SM_RENK, true),
              background: `linear-gradient(135deg, ${SM_RENK}, #6228d7)`,
              border: "none",
            }}
          >
            <Send size={12} /> {tr("Yayınla", "Veröffentlichen")}
          </button>
        )}

        <button onClick={kaydet} disabled={kaydediyor}
          style={{ ...buton(SM_RENK), opacity: kaydediyor ? 0.6 : 1 }}>
          {kaydediyor ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
          {tr("Kaydet", "Speichern")}
        </button>

        {url && (
          <a href={url} download target="_blank" rel="noopener noreferrer" style={{ ...buton("#06b6d4"), textDecoration: "none" }}>
            <Download size={12} /> {tr("İndir", "Download")}
          </a>
        )}

        <button
          onClick={() => (silOnay ? sil() : setSilOnay(true))}
          onBlur={() => setSilOnay(false)}
          disabled={siliyor}
          style={{ ...buton("#ef4444", silOnay), marginLeft: "auto", opacity: siliyor ? 0.6 : 1 }}
        >
          {siliyor ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
          {silOnay ? tr("Emin misiniz?", "Sicher?") : tr("Sil", "Löschen")}
        </button>
      </div>
    </aside>
  );
};
