import React, { useState } from "react";
import { Check, Lock, Clock, Loader2, CalendarClock, XCircle } from "lucide-react";
import { useLang } from "../../LanguageContext";
import { Modul, MODULLER, MODUL_TANIM } from "../../services/moduller";
import { ModulDurumu } from "../../services/useModuller";

interface Props {
  moduller: ModulDurumu;
  flash: (text: string, ok?: boolean) => void;
}

/**
 * "Paketlerim" — kullanıcı hangi alanlara sahip olduğunu görür ve kapalı
 * olanları talep eder. Talep, admin onayına düşer (modul_talepleri).
 */
export const SettingsPaketlerTab: React.FC<Props> = ({ moduller, flash }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const { acik, satirlar, talepler, yukleniyor, talepEt } = moduller;

  const [gonderilen, setGonderilen] = useState<Modul | null>(null);

  const tarih = (s: string | null) =>
    s ? new Date(s).toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE", {
      day: "2-digit", month: "long", year: "numeric",
    }) : null;

  const talep = async (m: Modul) => {
    setGonderilen(m);
    const sonuc = await talepEt(m);
    setGonderilen(null);
    if (sonuc.ok) {
      flash(tr("Talebiniz iletildi. Onaylandığında bu alan otomatik açılacak.",
               "Ihre Anfrage wurde übermittelt. Nach Freigabe wird der Bereich automatisch verfügbar."), true);
    } else {
      flash(sonuc.hata || tr("Talep gönderilemedi.", "Anfrage fehlgeschlagen."), false);
    }
  };

  if (yukleniyor) {
    return (
      <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "#06b6d4" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>
          {tr("Paketlerim", "Meine Pakete")}
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, lineHeight: 1.6 }}>
          {tr(
            "Hesabınıza tanımlı alanlar. Kapalı bir paketi talep ettiğinizde yöneticiye iletilir.",
            "Für Ihr Konto freigeschaltete Bereiche. Angefragte Pakete gehen an den Administrator.",
          )}
        </p>
      </div>

      {MODULLER.map((m) => {
        const t = MODUL_TANIM[m];
        const aktif = acik.has(m);
        const satir = satirlar.find((s) => s.modul === m);
        const bekleyen = talepler.find((x) => x.modul === m && x.durum === "bekliyor");
        const reddedilen = !bekleyen && talepler.find((x) => x.modul === m && x.durum === "reddedildi");
        const bitisStr = satir?.bitis ? tarih(satir.bitis) : null;

        return (
          <div
            key={m}
            style={{
              borderRadius: 13, padding: "14px 16px",
              border: `1px solid ${aktif ? `${t.renk}33` : "var(--border)"}`,
              borderLeft: `3px solid ${aktif ? t.renk : "var(--border-md, rgba(148,163,184,.3))"}`,
              background: aktif ? `${t.renk}0a` : "var(--card, rgba(255,255,255,.02))",
              display: "flex", alignItems: "flex-start", gap: 13, flexWrap: "wrap",
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: aktif ? `${t.renk}1f` : "rgba(148,163,184,.1)",
              border: `1px solid ${aktif ? `${t.renk}44` : "var(--border)"}`,
              color: aktif ? t.renk : "var(--text-dim)",
            }}>
              {aktif ? <Check size={16} strokeWidth={3} /> : <Lock size={15} />}
            </div>

            <div style={{ flex: 1, minWidth: 190 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{t.ad[lang]}</span>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  letterSpacing: ".04em", textTransform: "uppercase",
                  background: aktif ? `${t.renk}1a` : "rgba(148,163,184,.12)",
                  color: aktif ? t.renk : "var(--text-dim)",
                  border: `1px solid ${aktif ? `${t.renk}33` : "transparent"}`,
                }}>
                  {aktif ? tr("Açık", "Aktiv") : tr("Kapalı", "Gesperrt")}
                </span>
              </div>

              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 5, lineHeight: 1.55 }}>
                {t.aciklama[lang]}
              </div>

              {aktif && bitisStr && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5, marginTop: 7,
                  fontSize: 11, color: "#f59e0b",
                }}>
                  <CalendarClock size={11} />
                  {tr("Bitiş:", "Läuft ab:")} {bitisStr}
                </div>
              )}
              {aktif && !bitisStr && (
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 7 }}>
                  {tr("Süresiz", "Unbefristet")}
                </div>
              )}

              {reddedilen?.karar_notu && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7, fontSize: 11, color: "#f87171" }}>
                  <XCircle size={11} /> {reddedilen.karar_notu}
                </div>
              )}
            </div>

            {/* Aksiyon */}
            {!aktif && (
              bekleyen ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, alignSelf: "center",
                  padding: "7px 12px", borderRadius: 9, fontSize: 11.5, fontWeight: 600,
                  background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.25)", color: "#3b82f6",
                }}>
                  <Clock size={12} /> {tr("Onay bekliyor", "Wartet auf Freigabe")}
                </div>
              ) : (
                <button
                  onClick={() => talep(m)}
                  disabled={gonderilen === m}
                  style={{
                    alignSelf: "center", padding: "8px 15px", borderRadius: 9, border: "none",
                    background: gonderilen === m ? `${t.renk}66` : t.renk,
                    color: "#fff", fontSize: 12, fontWeight: 700,
                    cursor: gonderilen === m ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {gonderilen === m
                    ? <><Loader2 size={12} className="animate-spin" /> {tr("Gönderiliyor", "Wird gesendet")}</>
                    : tr("Talep Et", "Anfragen")}
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};
