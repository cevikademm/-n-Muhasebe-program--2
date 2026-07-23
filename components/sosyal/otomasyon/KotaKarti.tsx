import React from "react";
import { Gauge, RotateCcw, Loader2, AlertTriangle, Instagram, Search, Mail, Info } from "lucide-react";
import { useKota, type KotaSatiri } from "../../../services/sosyal/useKota";
import { FONT_BASLIK, FONT_METIN, kart } from "../ortak";

interface Props {
  lang: string;
}

/** Etiketler burada durur; Edge Function yalnızca anahtar + sayı döndürür. */
const ETIKET: Record<string, {
  ad: { tr: string; de: string };
  aciklama: { tr: string; de: string };
  birim: { tr: string; de: string };
  ikon: React.ReactNode;
  renk: string;
}> = {
  instagram_yayin: {
    ad: { tr: "Instagram paylaşımı", de: "Instagram-Beiträge" },
    aciklama: {
      tr: "Dolduğunda yeni gönderiler reddedilir; sınır 24 saatte bir kayar.",
      de: "Bei Erreichen werden neue Beiträge abgelehnt; Limit gleitet über 24 Std.",
    },
    birim: { tr: "gönderi", de: "Beiträge" },
    ikon: <Instagram size={14} />,
    renk: "#ec4899",
  },
  apify: {
    ad: { tr: "Müşteri arama bütçesi", de: "Lead-Suchbudget" },
    aciklama: {
      tr: "Google Maps taramaları bu bütçeden düşer. Bittiğinde arama yapılamaz.",
      de: "Google-Maps-Suchen zehren dieses Budget. Ist es leer, sind keine Suchen möglich.",
    },
    birim: { tr: "USD", de: "USD" },
    ikon: <Search size={14} />,
    renk: "#8b5cf6",
  },
  eposta: {
    ad: { tr: "Gönderilen e-posta", de: "Gesendete E-Mails" },
    aciklama: {
      tr: "Bu ay müşterilere gönderilen e-posta sayısı. Sağlayıcı üst sınırı API'den okunamıyor.",
      de: "Diesen Monat versendete E-Mails. Das Anbieterlimit ist per API nicht abrufbar.",
    },
    birim: { tr: "e-posta", de: "E-Mails" },
    ikon: <Mail size={14} />,
    renk: "#06b6d4",
  },
};

const DURUM_RENK: Record<string, string> = {
  ok: "#10b981",
  uyari: "#f59e0b",
  kritik: "#ef4444",
  bilinmiyor: "#64748b",
};

/**
 * Otomasyonun bağlı olduğu servislerin kalan kullanım hakkı.
 *
 * Composio'nun KENDİ abonelik kotası burada yok: v3 API'sinde plan/kota ucu
 * bulunmuyor (proje anahtarı /auth/session/info'ya kabul edilmiyor), o bilgi
 * yalnızca Composio panelinden görülebiliyor. Buradakiler otomasyonu
 * gerçekten durduran kotalar.
 */
export const KotaKarti: React.FC<Props> = ({ lang }) => {
  const dil = lang === "de" ? "de" : "tr";
  const tr = (a: string, b: string) => (dil === "tr" ? a : b);
  // Instagram kotası 24 saatlik kayan pencere — panel açık kalırsa bayatlar.
  const { kotalar, yukleniyor, hata, guncelleme, yenile } = useKota(5 * 60 * 1000);

  const satirCiz = (k: KotaSatiri) => {
    const meta = ETIKET[k.anahtar];
    if (!meta) return null;

    const bilinmiyor = k.durum === "bilinmiyor" || k.kullanilan == null;
    const sinirsiz = !bilinmiyor && k.toplam == null;
    const oran = !bilinmiyor && k.toplam ? Math.min(100, (k.kullanilan! / k.toplam) * 100) : 0;
    const kalan = !bilinmiyor && k.toplam != null ? Math.max(0, k.toplam - k.kullanilan!) : null;
    const renk = DURUM_RENK[k.durum] ?? DURUM_RENK.bilinmiyor;

    return (
      <div
        key={k.anahtar}
        style={{
          padding: "12px 13px", borderRadius: 11,
          border: "1px solid var(--border)",
          background: "var(--card, rgba(255,255,255,.02))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `${meta.renk}1a`, border: `1px solid ${meta.renk}33`, color: meta.renk,
          }}>{meta.ikon}</span>

          <span style={{
            flex: 1, minWidth: 120, fontSize: 13, fontWeight: 700,
            color: "var(--text-1)", fontFamily: FONT_METIN,
          }}>
            {meta.ad[dil]}
          </span>

          {/* Sayı bloğu */}
          {bilinmiyor ? (
            <span style={{ fontSize: 11.5, color: DURUM_RENK.bilinmiyor, fontWeight: 600 }}>
              {tr("okunamadı", "nicht abrufbar")}
            </span>
          ) : sinirsiz ? (
            <span style={{ fontSize: 13, fontWeight: 800, color: meta.renk, fontFamily: FONT_BASLIK }}>
              {k.kullanilan} <span style={{ fontSize: 10.5, fontWeight: 500, color: "var(--text-3)" }}>{meta.birim[dil]}</span>
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 800, color: renk, fontFamily: FONT_BASLIK, whiteSpace: "nowrap" }}>
              {kalan} <span style={{ fontSize: 10.5, fontWeight: 500, color: "var(--text-3)" }}>
                {tr("hak kaldı", "übrig")} · {k.kullanilan}/{k.toplam}
              </span>
            </span>
          )}
        </div>

        {/* Doluluk çubuğu — üst sınır varsa */}
        {!bilinmiyor && !sinirsiz && (
          <div style={{
            height: 5, borderRadius: 3, marginTop: 9, overflow: "hidden",
            background: "rgba(148,163,184,.18)",
          }}>
            <div style={{
              width: `${oran}%`, height: "100%", borderRadius: 3,
              background: renk, transition: "width .3s",
            }} />
          </div>
        )}

        <div style={{
          fontSize: 10.5, color: "var(--text-dim)", marginTop: 7, lineHeight: 1.5,
          fontFamily: FONT_METIN,
        }}>
          {k.periyotSaat ? tr(`Son ${k.periyotSaat} saat · `, `Letzte ${k.periyotSaat} Std. · `) : tr("Bu ay · ", "Diesen Monat · ")}
          {meta.aciklama[dil]}
        </div>

        {k.not && (
          <div style={{ fontSize: 10.5, color: "#f59e0b", marginTop: 5, fontFamily: FONT_METIN }}>
            {k.not}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ ...kart, padding: 15 }}>
      {/* Başlık */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13, flexWrap: "wrap" }}>
        <Gauge size={15} style={{ color: "#10b981" }} />
        <span style={{
          fontSize: 13.5, fontWeight: 800, color: "var(--text-1)", fontFamily: FONT_BASLIK,
        }}>
          {tr("Kullanım haklarım", "Meine Kontingente")}
        </span>

        <button
          onClick={yenile}
          disabled={yukleniyor}
          title={tr("Yenile", "Aktualisieren")}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
            cursor: yukleniyor ? "not-allowed" : "pointer", fontFamily: FONT_METIN,
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)",
          }}
        >
          {yukleniyor
            ? <Loader2 size={11} className="animate-spin" />
            : <RotateCcw size={11} />}
          {tr("Yenile", "Aktualisieren")}
        </button>
      </div>

      {hata && (
        <div style={{
          padding: "9px 12px", borderRadius: 9, marginBottom: 11,
          display: "flex", alignItems: "center", gap: 7,
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.22)",
          color: "#f87171", fontSize: 11.5, fontFamily: FONT_METIN,
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0 }} /> {hata}
        </div>
      )}

      {yukleniyor && kotalar.length === 0 ? (
        <div style={{ padding: 18, textAlign: "center" }}>
          <Loader2 size={16} className="animate-spin" style={{ color: "#10b981" }} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {kotalar.map(satirCiz)}
        </div>
      )}

      {/* Composio kotası neden yok — kullanıcı panelde arayıp bulamasın. */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 7, marginTop: 12, paddingTop: 11,
        borderTop: "1px solid var(--border)",
        fontSize: 10.5, color: "var(--text-dim)", lineHeight: 1.55, fontFamily: FONT_METIN,
      }}>
        <Info size={11} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          {tr(
            "Composio abonelik kotası bu listede yok: Composio API'si plan/kota bilgisi vermiyor, o rakam yalnızca Composio panelinden görülebiliyor.",
            "Das Composio-Abo-Kontingent fehlt hier: Die Composio-API liefert keine Plandaten; diese Zahl ist nur im Composio-Dashboard sichtbar.",
          )}
          {guncelleme && (
            <> {" · "}{tr("Son güncelleme", "Zuletzt aktualisiert")}:{" "}
              {new Date(guncelleme).toLocaleTimeString(dil === "tr" ? "tr-TR" : "de-DE",
                { hour: "2-digit", minute: "2-digit" })}
            </>
          )}
        </span>
      </div>
    </div>
  );
};
