import React from "react";
import {
  Instagram, Youtube, Facebook, Globe, ExternalLink, RotateCcw,
  Loader2, CheckCircle2, AlertTriangle, Clock3, Ban, Trash2, MessageSquare,
} from "lucide-react";
import type { SmYayin, SmHesap, SmPlatform } from "../../../services/sosyal/types";
import {
  PLATFORM_META, PLATFORM_GRADYAN, YAYIN_DURUM_META, YORUM_DURUM_META, FORMAT_META,
  FONT_BASLIK, FONT_METIN,
} from "../ortak";

const IKON: Partial<Record<SmPlatform, React.FC<any>>> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
};

const DURUM_IKON: Record<SmYayin["durum"], React.FC<any>> = {
  kuyrukta: Clock3,
  yayinlaniyor: Loader2,
  yayinlandi: CheckCircle2,
  hata: AlertTriangle,
  iptal: Ban,
};

interface Props {
  yayin: SmYayin;
  hesap?: SmHesap;
  lang: string;
  /** Mobilde aksiyonlar alt satıra iner. */
  dar?: boolean;
  onTekrar?: (id: string) => void;
  onIptal?: (id: string) => void;
  onSil?: (id: string) => void;
}

/**
 * Tek bir yayın işinin durum satırı. Hem yayın modalinin canlı görünümünde
 * hem de Yayın Kuyruğu sekmesinde kullanılır — iki yerde iki farklı görsel
 * dil olmaması için tek bileşen.
 */
export const YayinSatiri: React.FC<Props> = ({
  yayin, hesap, lang, dar, onTekrar, onIptal, onSil,
}) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const [ad, renk] = PLATFORM_META[yayin.platform] ?? ["—", "#64748b"];
  const Ikon = IKON[yayin.platform] ?? Globe;
  const [dtr, dde, drenk] = YAYIN_DURUM_META[yayin.durum];
  const DurumIkon = DURUM_IKON[yayin.durum];
  const calisiyor = yayin.durum === "yayinlaniyor" || yayin.durum === "kuyrukta";

  // Otomatik ilk yorum yayının kendi durumundan AYRI ilerler: gönderi
  // yayınlanmış olsa da yorum hâlâ bekliyor ya da patlamış olabilir.
  const yorumGoster = yayin.yorum_durum && yayin.yorum_durum !== "yok";
  const [ytr, yde, yrenk] = YORUM_DURUM_META[yayin.yorum_durum] ?? YORUM_DURUM_META.yok;
  // "Tekrar dene" hem yayın hatasını hem de yalnızca yorum hatasını kapsar —
  // ikincisinde sm-publish videoyu yeniden yayınlamaz, sadece yorumu dener.
  const tekrarEdilebilir = yayin.durum === "hata" || yayin.yorum_durum === "hata";

  const aksiyonlar = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {yayin.yayin_url && (
        <a
          href={yayin.yayin_url} target="_blank" rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10.5, fontWeight: 700, fontFamily: FONT_BASLIK,
            color: renk, textDecoration: "none",
            padding: "5px 9px", borderRadius: 8,
            background: `${renk}14`, border: `1px solid ${renk}2e`,
          }}
        >
          <ExternalLink size={11} /> {tr("Gör", "Ansehen")}
        </a>
      )}
      {tekrarEdilebilir && onTekrar && (
        <button
          onClick={() => onTekrar(yayin.id)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer",
            fontSize: 10.5, fontWeight: 700, fontFamily: FONT_BASLIK,
            color: "#f59e0b", padding: "5px 9px", borderRadius: 8,
            background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.3)",
          }}
        >
          <RotateCcw size={11} />
          {yayin.durum === "hata" ? tr("Tekrar dene", "Erneut") : tr("Yorumu dene", "Kommentar erneut")}
        </button>
      )}
      {calisiyor && onIptal && (
        <button
          onClick={() => onIptal(yayin.id)}
          title={tr("İptal", "Abbrechen")}
          aria-label={tr("İptal", "Abbrechen")}
          style={{
            display: "flex", padding: 5, borderRadius: 8, cursor: "pointer",
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)",
          }}
        >
          <Ban size={12} />
        </button>
      )}
      {!calisiyor && onSil && (
        <button
          onClick={() => onSil(yayin.id)}
          title={tr("Kaydı sil", "Eintrag löschen")}
          aria-label={tr("Kaydı sil", "Eintrag löschen")}
          style={{
            display: "flex", padding: 5, borderRadius: 8, cursor: "pointer",
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)",
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );

  return (
    <div style={{
      display: "flex", alignItems: dar ? "flex-start" : "center", gap: 10,
      flexWrap: dar ? "wrap" : "nowrap",
      padding: "10px 12px", borderRadius: 12,
      background: "var(--panel)", border: "1px solid var(--border)",
      // Çalışan iş sol kenarda renkli bir şeritle öne çıkar.
      boxShadow: calisiyor ? `inset 3px 0 0 ${drenk}` : `inset 3px 0 0 ${drenk}55`,
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: PLATFORM_GRADYAN[yayin.platform], color: "#fff",
      }}>
        <Ikon size={16} />
      </span>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 12, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK,
          }}>{ad}</span>
          {hesap?.handle && (
            <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: FONT_METIN }}>
              @{hesap.handle}
            </span>
          )}
          <span style={{
            fontSize: 9.5, fontWeight: 700, fontFamily: FONT_BASLIK,
            padding: "1px 6px", borderRadius: 5,
            background: "var(--panel-2)", color: "var(--text-2)", border: "1px solid var(--border)",
          }}>
            {tr(FORMAT_META[yayin.format]?.[0] ?? yayin.format, FORMAT_META[yayin.format]?.[1] ?? yayin.format)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <DurumIkon
            size={11}
            className={yayin.durum === "yayinlaniyor" ? "spin" : undefined}
            style={{ color: drenk, flexShrink: 0 }}
          />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: drenk, fontFamily: FONT_BASLIK }}>
            {tr(dtr, dde)}
          </span>
          {yayin.deneme > 1 && (
            <span style={{ fontSize: 9.5, color: "var(--text-3)", fontFamily: FONT_BASLIK }}>
              · {yayin.deneme}. {tr("deneme", "Versuch")}
            </span>
          )}
        </div>

        {yorumGoster && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <MessageSquare size={11} style={{ color: yrenk, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: yrenk, fontFamily: FONT_BASLIK }}>
              {tr(ytr, yde)}
            </span>
            {yayin.yorum_durum === "hata" && yayin.yorum_hata && (
              <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: FONT_METIN }}>
                · {yayin.yorum_hata}
              </span>
            )}
          </div>
        )}

        {yayin.hata && yayin.durum !== "yayinlandi" && (
          <span style={{
            fontSize: 10.5, color: yayin.durum === "hata" ? "var(--red)" : "var(--text-3)",
            fontFamily: FONT_METIN, lineHeight: 1.4, wordBreak: "break-word",
          }}>
            {yayin.hata}
          </span>
        )}
      </div>

      {dar ? <div style={{ width: "100%" }}>{aksiyonlar}</div> : aksiyonlar}
    </div>
  );
};
