import React, { useState, useEffect } from "react";
import { useLang } from "../LanguageContext";
import { CalendarDays, X, Loader2, CheckCircle2, Upload } from "lucide-react";

export interface SelectedPeriod {
  year: number;
  month: number; // 1-12
}

interface PeriodPickerModalProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  defaultYear?: number;
  defaultMonth?: number; // 1-12
  /** true iken "Yükleniyor..." görünümü. false'a dönünce modal otomatik kapanır. */
  uploading?: boolean;
  onConfirm: (period: SelectedPeriod) => void;
  onClose: () => void;
}

const MONTHS_TR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

export const PeriodPickerModal: React.FC<PeriodPickerModalProps> = ({
  open, title, subtitle, defaultYear, defaultMonth, uploading, onConfirm, onClose,
}) => {
  const { lang } = useLang();
  const tr = (t: string, d: string) => (lang === "tr" ? t : d);
  const months = lang === "tr" ? MONTHS_TR : MONTHS_DE;

  const now = new Date();
  const [year, setYear] = useState<number>(defaultYear ?? now.getFullYear());
  const [month, setMonth] = useState<number>(defaultMonth ?? (now.getMonth() + 1));
  const [hasStartedUpload, setHasStartedUpload] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  // Her açılışta state reset
  useEffect(() => {
    if (open) {
      setYear(defaultYear ?? now.getFullYear());
      setMonth(defaultMonth ?? (now.getMonth() + 1));
      setHasStartedUpload(false);
      setJustCompleted(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // uploading true olduğunda yükleme başladı olarak işaretle
  useEffect(() => {
    if (uploading) setHasStartedUpload(true);
  }, [uploading]);

  // Yükleme bittiğinde kısa "başarılı" flash göster ve modal'ı kapat
  useEffect(() => {
    if (hasStartedUpload && !uploading && open) {
      setJustCompleted(true);
      const t = setTimeout(() => {
        setJustCompleted(false);
        onClose();
      }, 900);
      return () => clearTimeout(t);
    }
  }, [hasStartedUpload, uploading, open, onClose]);

  if (!open) return null;

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear - 4 + i);

  const handleConfirm = () => {
    onConfirm({ year, month });
  };

  const busy = (uploading || justCompleted) === true;

  return (
    <div
      onClick={() => { if (!busy) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(5,8,14,.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
        animation: "ppm-fade .18s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "460px",
          position: "relative",
          background: "linear-gradient(160deg, #181c26 0%, #11141b 100%)",
          border: "1px solid rgba(6,182,212,.18)",
          borderRadius: "18px",
          padding: "0",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          boxShadow: "0 24px 60px -12px rgba(6,182,212,.22), 0 8px 24px rgba(0,0,0,.5)",
          overflow: "hidden",
          animation: "ppm-pop .22s cubic-bezier(.2,.9,.3,1.2)",
        }}
      >
        {/* dekoratif üst ışıldama */}
        <div style={{
          position: "absolute", top: "-80px", left: "-40px", right: "-40px", height: "160px",
          background: "radial-gradient(ellipse at 50% 100%, rgba(6,182,212,.25), transparent 65%)",
          pointerEvents: "none",
        }} />

        {/* HEADER */}
        <div style={{
          position: "relative", padding: "22px 22px 14px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          display: "flex", alignItems: "flex-start", gap: "14px",
        }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, rgba(6,182,212,.2), rgba(14,165,233,.15))",
            border: "1px solid rgba(6,182,212,.35)",
            boxShadow: "0 6px 18px rgba(6,182,212,.18)",
            flexShrink: 0,
          }}>
            <CalendarDays size={20} style={{ color: "#22d3ee" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              margin: 0, fontSize: "16px", fontWeight: 800, letterSpacing: ".01em",
              color: "#f1f5f9", fontFamily: "'Space Grotesk', sans-serif",
            }}>
              {title || tr("Dönem Seçin", "Zeitraum auswählen")}
            </h3>
            <p style={{
              margin: "4px 0 0", fontSize: "11.5px", lineHeight: 1.45,
              color: "#94a3b8",
            }}>
              {subtitle || tr(
                "Yüklenen dosyalar seçilen dönem altında kaydedilecek ve listelenecek.",
                "Dateien werden unter dem gewählten Zeitraum gespeichert."
              )}
            </p>
          </div>
          {!busy && (
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.06)",
                borderRadius: "8px", padding: "6px", cursor: "pointer",
                color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* BODY */}
        <div style={{ padding: "18px 22px 22px" }}>
          {/* Seçili dönem özet çipi */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            padding: "14px 16px", borderRadius: "12px",
            background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.18)",
            marginBottom: "16px",
          }}>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "20px", fontWeight: 800, color: "#22d3ee",
              letterSpacing: ".01em",
            }}>
              {months[month - 1]} {year}
            </span>
          </div>

          {/* Ay/Yıl seçiciler */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{
                fontSize: "10.5px", color: "#64748b", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: ".08em",
              }}>{tr("Ay", "Monat")}</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                disabled={busy}
                style={{
                  width: "100%", marginTop: "6px", padding: "11px 12px", borderRadius: "10px",
                  background: "#0c0f15", border: "1px solid rgba(255,255,255,.07)",
                  color: "#e2e8f0", fontSize: "13px", fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? .55 : 1,
                }}
              >
                {months.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{
                fontSize: "10.5px", color: "#64748b", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: ".08em",
              }}>{tr("Yıl", "Jahr")}</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={busy}
                style={{
                  width: "100%", marginTop: "6px", padding: "11px 12px", borderRadius: "10px",
                  background: "#0c0f15", border: "1px solid rgba(255,255,255,.07)",
                  color: "#e2e8f0", fontSize: "13px", fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? .55 : 1,
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Aksiyonlar */}
          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            {!busy && (
              <button
                onClick={onClose}
                style={{
                  flex: "0 0 auto", padding: "11px 18px", borderRadius: "10px",
                  background: "transparent", border: "1px solid rgba(255,255,255,.08)",
                  color: "#94a3b8", fontSize: "12.5px", fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {tr("İptal", "Abbrechen")}
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={busy}
              style={{
                flex: 1, padding: "12px 18px", borderRadius: "10px",
                background: justCompleted
                  ? "linear-gradient(135deg, #10b981, #059669)"
                  : "linear-gradient(135deg, #06b6d4, #0891b2)",
                border: "none", color: "#fff",
                fontSize: "12.5px", fontWeight: 800, letterSpacing: ".01em",
                cursor: busy ? "wait" : "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: justCompleted
                  ? "0 8px 24px rgba(16,185,129,.35)"
                  : "0 8px 24px rgba(6,182,212,.32)",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "all .2s",
              }}
            >
              {justCompleted ? (
                <>
                  <CheckCircle2 size={15} />
                  {tr("Tamamlandı", "Fertig")}
                </>
              ) : busy ? (
                <>
                  <Loader2 size={15} style={{ animation: "ppm-spin 1s linear infinite" }} />
                  {tr("Yükleniyor...", "Wird hochgeladen...")}
                </>
              ) : (
                <>
                  <Upload size={14} />
                  {tr("Devam Et ve Dosya Seç", "Weiter & Datei auswählen")}
                </>
              )}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes ppm-fade { from { opacity: 0 } to { opacity: 1 } }
          @keyframes ppm-pop {
            from { opacity: 0; transform: translateY(8px) scale(.97) }
            to   { opacity: 1; transform: translateY(0)   scale(1) }
          }
          @keyframes ppm-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
};
