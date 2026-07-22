import React, { useState } from "react";
import {
  Instagram, Youtube, Facebook, Globe, Music2, CheckCircle2, AlertCircle,
  Loader2, Link2, Unlink, Trash2, ExternalLink, Plug,
} from "lucide-react";
import type { SmHesap, SmPlatform } from "../../../services/sosyal/types";
import {
  PLATFORM_META, AKTIF_PLATFORMLAR, FONT_BASLIK, FONT_METIN, buton, rozet,
} from "../ortak";

const IKON: Partial<Record<SmPlatform, React.FC<any>>> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  // lucide'de TikTok markası yok; nota ikonu en yakın karşılık.
  tiktok: Music2,
};

interface Props {
  hesap: SmHesap;
  lang: string;
  dogrulanıyor: boolean;
  onBagla: (id: string) => void;
  onDogrula: (id: string) => void;
  onKopar: (id: string) => void;
  onSil: (id: string) => void;
}

export const HesapKarti: React.FC<Props> = ({
  hesap, lang, dogrulanıyor, onBagla, onDogrula, onKopar, onSil,
}) => {
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const [silOnay, setSilOnay] = useState(false);

  const [ad, renk] = PLATFORM_META[hesap.platform] ?? ["—", "#64748b"];
  const Ikon = IKON[hesap.platform] ?? Globe;
  const hazir = AKTIF_PLATFORMLAR.includes(hesap.platform);

  return (
    <div style={{
      background: "var(--panel)", border: "1px solid var(--border)",
      borderRadius: 13, padding: 13,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Üst satır */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${renk}18`, color: renk, border: `1px solid ${renk}2e`,
        }}>
          <Ikon size={17} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{
            fontSize: 12.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK,
          }}>{ad}</span>
          <span style={{
            fontSize: 11, color: "var(--text-3)", fontFamily: FONT_METIN,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {hesap.handle ? `@${hesap.handle}` : tr("(handle yok)", "(kein Handle)")}
          </span>
        </div>

        {hesap.dogrulandi ? (
          <span style={rozet("#10b981")}>
            <CheckCircle2 size={9} /> {tr("Bağlı", "Verbunden")}
          </span>
        ) : hazir ? (
          <span style={rozet("#f59e0b")}>
            <AlertCircle size={9} /> {tr("Bağlı değil", "Nicht verbunden")}
          </span>
        ) : (
          <span style={rozet("#64748b")}>{tr("Yakında", "Bald")}</span>
        )}
      </div>

      {/* Meta */}
      {(hesap.harici_id || hesap.url) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {hesap.harici_id && (
            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: FONT_BASLIK, wordBreak: "break-all" }}>
              ID: {hesap.harici_id}
            </span>
          )}
          {hesap.url && (
            <a href={hesap.url} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 10, color: renk, fontFamily: FONT_BASLIK,
              display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none",
            }}>
              <ExternalLink size={9} /> {tr("Profili aç", "Profil öffnen")}
            </a>
          )}
        </div>
      )}

      {/* Aksiyonlar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* Bağlantı hesap BAŞINA kurulur: aynı platformda iki hesap varsa
            her biri kendi OAuth bağlantısını almalı, yoksa ikincisi
            birincinin verisini görür. */}
        <button
          onClick={() => onBagla(hesap.id)}
          disabled={!hazir || dogrulanıyor}
          style={{
            ...buton(renk, !hesap.dogrulandi && hazir),
            opacity: !hazir || dogrulanıyor ? 0.5 : 1,
            cursor: !hazir || dogrulanıyor ? "not-allowed" : "pointer",
          }}
        >
          {dogrulanıyor ? <Loader2 size={12} className="spin" /> : <Plug size={12} />}
          {hesap.dogrulandi ? tr("Yeniden bağla", "Neu verbinden") : tr("Bağla", "Verbinden")}
        </button>

        <button
          onClick={() => onDogrula(hesap.id)}
          disabled={!hazir || dogrulanıyor}
          title={hazir ? undefined : tr("Bu platform henüz desteklenmiyor", "Diese Plattform wird noch nicht unterstützt")}
          style={{
            ...buton("#64748b"),
            opacity: !hazir || dogrulanıyor ? 0.5 : 1,
            cursor: !hazir || dogrulanıyor ? "not-allowed" : "pointer",
          }}
        >
          {dogrulanıyor ? <Loader2 size={12} className="spin" /> : <Link2 size={12} />}
          {hesap.dogrulandi ? tr("Yeniden doğrula", "Neu prüfen") : tr("Doğrula", "Prüfen")}
        </button>

        {hesap.dogrulandi && (
          <button onClick={() => onKopar(hesap.id)} style={buton("#f59e0b")}>
            <Unlink size={12} /> {tr("Kopar", "Trennen")}
          </button>
        )}

        <button
          onClick={() => (silOnay ? onSil(hesap.id) : setSilOnay(true))}
          onBlur={() => setSilOnay(false)}
          style={{ ...buton("#ef4444", silOnay), marginLeft: "auto" }}
        >
          <Trash2 size={12} />
          {silOnay ? tr("Emin misiniz?", "Sicher?") : tr("Sil", "Löschen")}
        </button>
      </div>
    </div>
  );
};
