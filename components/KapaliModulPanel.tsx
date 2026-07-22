import React, { useState } from "react";
import { Lock, Loader2, Check, Clock, ArrowRight } from "lucide-react";
import { useLang } from "../LanguageContext";
import { Modul, MODUL_TANIM } from "../services/moduller";
import { ModulTalebi } from "../services/useModuller";

interface Props {
  modul: Modul;
  talepler: ModulTalebi[];
  onTalep: (m: Modul, mesaj?: string) => Promise<{ ok: boolean; hata?: string }>;
}

/**
 * Paketi kapalı bir modüle girildiğinde çizilen ekran.
 *
 * Not: bu ekran yalnızca bir bilgilendirmedir — asıl engel RLS'te. Kullanıcı
 * istemci kodunu kurcalayıp bu ekranı atlasa bile veritabanı satır döndürmez.
 */
export const KapaliModulPanel: React.FC<Props> = ({ modul, talepler, onTalep }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const t = MODUL_TANIM[modul];

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState("");

  const bekleyen = talepler.find((x) => x.modul === modul && x.durum === "bekliyor");
  const reddedilen = talepler.find((x) => x.modul === modul && x.durum === "reddedildi");

  const gonder = async () => {
    setHata("");
    setGonderiliyor(true);
    const sonuc = await onTalep(modul);
    if (!sonuc.ok) setHata(sonuc.hata || tr("Talep gönderilemedi.", "Anfrage fehlgeschlagen."));
    setGonderiliyor(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6" style={{ background: "var(--panel, #111318)" }}>
      <div
        style={{
          width: "100%", maxWidth: 460, borderRadius: 18, overflow: "hidden",
          border: "1px solid var(--border, rgba(255,255,255,.08))",
          background: "var(--card, rgba(255,255,255,.02))",
        }}
      >
        <div style={{ height: 3, background: `linear-gradient(90deg, ${t.renk}, transparent)` }} />

        <div style={{ padding: "28px 26px" }}>
          <div
            style={{
              width: 46, height: 46, borderRadius: 13, marginBottom: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: `${t.renk}1a`, border: `1px solid ${t.renk}40`, color: t.renk,
            }}
          >
            <Lock size={20} />
          </div>

          <h2 style={{
            fontSize: 19, fontWeight: 800, margin: 0, color: "var(--text-1, #f1f5f9)",
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            {t.ad[lang]}
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--text-3, #64748b)", marginTop: 8, lineHeight: 1.65 }}>
            {t.aciklama[lang]}
          </p>

          <div style={{
            marginTop: 18, padding: "12px 14px", borderRadius: 11,
            background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.2)",
            fontSize: 12.5, color: "#f59e0b", lineHeight: 1.6,
          }}>
            {tr(
              "Bu paket hesabınızda tanımlı değil.",
              "Dieses Paket ist für Ihr Konto nicht freigeschaltet.",
            )}
          </div>

          {/* ── Durum / aksiyon ── */}
          {bekleyen ? (
            <div style={{
              marginTop: 16, padding: "13px 15px", borderRadius: 11,
              background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.22)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <Clock size={16} style={{ color: "#3b82f6", flexShrink: 0 }} />
              <div style={{ fontSize: 12.5, color: "#93c5fd", lineHeight: 1.55 }}>
                {tr(
                  "Talebiniz alındı. Onaylandığında bu alan otomatik olarak açılacak.",
                  "Ihre Anfrage liegt vor. Nach Freigabe wird dieser Bereich automatisch verfügbar.",
                )}
              </div>
            </div>
          ) : (
            <>
              {reddedilen && (
                <div style={{
                  marginTop: 16, padding: "11px 14px", borderRadius: 10,
                  background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)",
                  fontSize: 12, color: "#f87171", lineHeight: 1.55,
                }}>
                  {tr("Önceki talebiniz onaylanmadı.", "Ihre vorherige Anfrage wurde nicht genehmigt.")}
                  {reddedilen.karar_notu ? ` — ${reddedilen.karar_notu}` : ""}
                </div>
              )}

              <button
                onClick={gonder}
                disabled={gonderiliyor}
                style={{
                  width: "100%", marginTop: 18, padding: "13px 0", borderRadius: 11, border: "none",
                  background: gonderiliyor ? `${t.renk}66` : `linear-gradient(135deg, ${t.renk}, ${t.renk}cc)`,
                  color: "#fff", fontSize: 13.5, fontWeight: 700,
                  cursor: gonderiliyor ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {gonderiliyor
                  ? <><Loader2 size={15} className="animate-spin" /> {tr("Gönderiliyor...", "Wird gesendet...")}</>
                  : <>{tr("Paketi Talep Et", "Paket anfragen")} <ArrowRight size={15} /></>}
              </button>

              {hata && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#f87171", textAlign: "center" }}>{hata}</div>
              )}

              <p style={{ fontSize: 11, color: "var(--text-dim, #475569)", marginTop: 12, textAlign: "center", lineHeight: 1.6 }}>
                {tr(
                  "Talebiniz yöneticiye iletilir; onaylandığında ek bir işlem yapmanıza gerek kalmaz.",
                  "Ihre Anfrage geht an den Administrator; nach Freigabe ist kein weiterer Schritt nötig.",
                )}
              </p>
            </>
          )}

          {/* Açık paketlerin nerede görüleceği */}
          <div style={{
            marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border, rgba(255,255,255,.06))",
            fontSize: 11.5, color: "var(--text-dim, #475569)", display: "flex", alignItems: "center", gap: 7,
          }}>
            <Check size={12} style={{ flexShrink: 0 }} />
            {tr(
              "Açık paketlerinizi Ayarlar → Paketlerim sayfasından görebilirsiniz.",
              "Ihre aktiven Pakete finden Sie unter Einstellungen → Meine Pakete.",
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
