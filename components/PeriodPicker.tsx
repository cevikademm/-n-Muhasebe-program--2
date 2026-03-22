import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { useLang } from "../LanguageContext";
import { ChevronLeft, ChevronRight, Lock, Check } from "lucide-react";
import {
  getMonthAbbr,
  getCurrentPeriod,
  getSelectablePeriods,
  isPeriodPast,
  type Language,
} from "../services/periodUtils";

interface PeriodPickerProps {
  planType: string; // "monthly" | "quarterly" | "yearly"
  purchasedPeriods: string[]; // zaten satın alınmış dönemler
  onPeriodsSelected: (periods: string[]) => void;
  onUpgradeRequest?: () => void; // aylık kullanıcı kilitli aya tıklayınca
}

export const PeriodPicker: React.FC<PeriodPickerProps> = ({
  planType,
  purchasedPeriods,
  onPeriodsSelected,
  onUpgradeRequest,
}) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const currentPeriod = getCurrentPeriod();
  const currentYear = now.getFullYear();

  // Plan tipine göre seçilebilir dönemler (satın alınmış geçmiş dönemler dahil)
  const selectablePeriods = useMemo(() => getSelectablePeriods(planType, purchasedPeriods), [planType, purchasedPeriods]);

  // Seçili dönemler (otomatik hesaplanır)
  const selectedPeriods = useMemo(() => {
    // Sadece görüntülenen yıla ait seçilebilir dönemleri filtrele
    return selectablePeriods.filter(p => {
      const y = parseInt(p.split("-")[0], 10);
      return y === viewYear && !purchasedPeriods.includes(p);
    });
  }, [selectablePeriods, viewYear, purchasedPeriods]);

  const handleConfirm = () => {
    if (selectedPeriods.length > 0) {
      onPeriodsSelected(selectedPeriods);
    }
  };

  const getMonthStatus = (monthIndex: number): "purchased" | "selected" | "locked" | "available" | "future" => {
    const period = `${viewYear}-${String(monthIndex + 1).padStart(2, "0")}`;

    if (purchasedPeriods.includes(period)) return "purchased";
    if (selectedPeriods.includes(period)) return "selected";

    // Geçmiş ay kontrolü
    if (isPeriodPast(period)) {
      if (planType === "monthly") return "locked";
      if (selectablePeriods.includes(period)) return "selected";
      return "locked";
    }

    // Gelecek ay: mevcut plan kapsamında mı?
    if (selectablePeriods.includes(period)) return "selected";

    return "future";
  };

  const getCellStyle = (status: string) => {
    const base: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "4px",
      padding: "12px 8px",
      borderRadius: "12px",
      cursor: status === "locked" ? "pointer" : status === "purchased" ? "default" : "default",
      transition: "all 0.2s ease",
      position: "relative",
    };

    switch (status) {
      case "purchased":
        return {
          ...base,
          background: "rgba(16, 185, 129, 0.15)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
        };
      case "selected":
        return {
          ...base,
          background: "rgba(249, 115, 22, 0.15)",
          border: "2px solid rgba(249, 115, 22, 0.5)",
          boxShadow: "0 0 12px rgba(249, 115, 22, 0.1)",
        };
      case "locked":
        return {
          ...base,
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          opacity: 0.5,
        };
      case "future":
        return {
          ...base,
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          opacity: 0.4,
        };
      default:
        return {
          ...base,
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        };
    }
  };

  const planLabels: Record<string, string> = {
    monthly: tr("Aylık Plan — Mevcut Ay", "Monatsplan — Aktueller Monat"),
    quarterly: tr("3 Aylık Plan — Mevcut Çeyrek", "Quartalsplan — Aktuelles Quartal"),
    yearly: tr("Yıllık Plan — Tüm Yıl", "Jahresplan — Gesamtes Jahr"),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        maxWidth: "480px",
        margin: "0 auto",
        padding: "32px",
        borderRadius: "20px",
        background: "rgba(18, 18, 24, 0.95)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Başlık */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <h2 style={{
          fontSize: "20px", fontWeight: 700, color: "#fff", margin: "0 0 8px 0",
        }}>
          {tr("Dönem Seçin", "Zeitraum wählen")}
        </h2>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
          {planLabels[planType] || ""}
        </p>
      </div>

      {/* Yıl Navigasyonu */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "16px", marginBottom: "20px",
      }}>
        <button
          onClick={() => setViewYear(v => v - 1)}
          disabled={viewYear <= currentYear - 2}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            padding: "6px",
            cursor: viewYear <= currentYear - 2 ? "not-allowed" : "pointer",
            opacity: viewYear <= currentYear - 2 ? 0.3 : 1,
            color: "#fff",
            display: "flex",
          }}
        >
          <ChevronLeft size={18} />
        </button>

        <span style={{
          fontSize: "18px", fontWeight: 700, color: "#fff",
          minWidth: "60px", textAlign: "center",
        }}>
          {viewYear}
        </span>

        <button
          onClick={() => setViewYear(v => v + 1)}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            padding: "6px",
            cursor: "pointer",
            color: "#fff",
            display: "flex",
          }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 12 Aylık Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "8px",
        marginBottom: "24px",
      }}>
        {Array.from({ length: 12 }, (_, i) => {
          const status = getMonthStatus(i);
          const period = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
          const isCurrent = period === currentPeriod;

          return (
            <motion.div
              key={i}
              whileHover={status === "locked" ? { scale: 1.02 } : {}}
              onClick={() => {
                if (status === "locked" && onUpgradeRequest) {
                  onUpgradeRequest();
                }
              }}
              style={getCellStyle(status)}
            >
              {/* Durum ikonu */}
              {status === "purchased" && (
                <Check size={14} color="#10b981" />
              )}
              {status === "locked" && (
                <Lock size={12} color="rgba(255,255,255,0.3)" />
              )}

              <span style={{
                fontSize: "13px",
                fontWeight: isCurrent ? 700 : 500,
                color: status === "purchased" ? "#10b981"
                  : status === "selected" ? "#f97316"
                  : "rgba(255,255,255,0.5)",
              }}>
                {getMonthAbbr(i, lang as Language)}
              </span>

              {isCurrent && (
                <div style={{
                  width: "4px", height: "4px", borderRadius: "50%",
                  background: "#06b6d4",
                }} />
              )}

              {status === "locked" && (
                <span style={{
                  fontSize: "8px", color: "rgba(255,255,255,0.25)",
                  textTransform: "uppercase", letterSpacing: "0.5px",
                }}>
                  {tr("Kilitli", "Gesperrt")}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Lejant */}
      <div style={{
        display: "flex", gap: "16px", justifyContent: "center",
        marginBottom: "24px", flexWrap: "wrap",
      }}>
        {[
          { color: "#10b981", label: tr("Satın Alınmış", "Gekauft") },
          { color: "#f97316", label: tr("Seçili", "Ausgewählt") },
          { color: "rgba(255,255,255,0.2)", label: tr("Kilitli", "Gesperrt") },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: item.color,
            }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Seçili dönem özeti */}
      {selectedPeriods.length > 0 && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "12px",
          background: "rgba(249, 115, 22, 0.08)",
          border: "1px solid rgba(249, 115, 22, 0.2)",
          marginBottom: "20px",
          fontSize: "13px",
          color: "rgba(255,255,255,0.7)",
        }}>
          <span style={{ fontWeight: 600, color: "#f97316" }}>
            {selectedPeriods.length} {tr("dönem seçildi", "Zeiträume ausgewählt")}
          </span>
        </div>
      )}

      {/* Onay Butonu */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleConfirm}
        disabled={selectedPeriods.length === 0}
        style={{
          width: "100%",
          padding: "14px 0",
          borderRadius: "12px",
          border: "none",
          background: selectedPeriods.length > 0
            ? "linear-gradient(135deg, #f97316, #ea580c)"
            : "rgba(255,255,255,0.06)",
          color: selectedPeriods.length > 0 ? "#fff" : "rgba(255,255,255,0.3)",
          fontSize: "15px",
          fontWeight: 600,
          cursor: selectedPeriods.length > 0 ? "pointer" : "not-allowed",
          transition: "all 0.25s ease",
        }}
      >
        {tr("Devam Et", "Weiter")}
      </motion.button>

      {/* Aylık plan uyarısı */}
      {planType === "monthly" && (
        <p style={{
          textAlign: "center",
          fontSize: "11px",
          color: "rgba(255,255,255,0.25)",
          marginTop: "16px",
          lineHeight: 1.5,
        }}>
          {tr(
            "Geçmiş dönemlere erişmek için 3 Aylık veya Yıllık plana geçin.",
            "Für Zugriff auf vergangene Zeiträume wechseln Sie zum Quartals- oder Jahresplan."
          )}
        </p>
      )}
    </motion.div>
  );
};
