import React from "react";
import { motion } from "framer-motion";
import { useLang } from "../LanguageContext";
import { AlertTriangle, Calendar, ChevronRight } from "lucide-react";
import { formatPeriodLabel, formatPeriodAbbr, type Language } from "../services/periodUtils";

interface Props {
  plan: string;
  purchasedPeriods: string[];
  currentPeriod: string;
  remainingMonths: number;
  isExpired: boolean;
  onTimerEnd?: () => void;
}

export const SubscriptionCountdown: React.FC<Props> = ({
  plan,
  purchasedPeriods,
  currentPeriod,
  remainingMonths,
  isExpired,
  onTimerEnd,
}) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const isLastMonth = remainingMonths === 1;
  const isWarning = isLastMonth && !isExpired;

  const planNames: Record<string, string> = {
    free: tr("Ücretsiz Plan", "Kostenloser Plan"),
    monthly: tr("Aylık Plan", "Monatlicher Plan"),
    quarterly: tr("3 Aylık Plan", "Auf 3 Monate"),
    yearly: tr("Yıllık Plan", "Jährlicher Plan"),
  };

  const currentPlan = planNames[plan] || plan;

  // Kalan aktif dönemleri hesapla (mevcut ay dahil)
  const activePeriods = purchasedPeriods
    .filter(p => p >= currentPeriod)
    .sort();

  // İlerleme çubuğu: toplam satın alınan / kalan
  const totalPurchased = purchasedPeriods.length;
  const usedPeriods = purchasedPeriods.filter(p => p < currentPeriod).length;
  const progressPercent = totalPurchased > 0 ? ((usedPeriods + 1) / totalPurchased) * 100 : 0;

  if (purchasedPeriods.length === 0 && plan === "free") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="subscription-timer-widget"
      style={{
        margin: "16px 16px 8px 16px",
        padding: "16px",
        borderRadius: "14px",
        background: isExpired
          ? "linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(185, 28, 28, 0.05))"
          : isWarning
            ? "linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05))"
            : "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))",
        border: `1px solid ${isExpired ? "rgba(239, 68, 68, 0.3)" : isWarning ? "rgba(245, 158, 11, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Başlık */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        {isExpired ? (
          <AlertTriangle size={18} color="#ef4444" />
        ) : (
          <Calendar size={18} color={isWarning ? "#f59e0b" : "#10b981"} />
        )}
        <h3
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 700,
            color: isExpired ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {isExpired
            ? tr("Dönem Süresi Doldu", "Zeitraum abgelaufen")
            : tr("Aktif Dönem", "Aktiver Zeitraum")}
        </h3>
      </div>

      {/* Mevcut plan */}
      <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "8px" }}>
        {tr("Mevcut Plan:", "Aktueller Plan:")}{" "}
        <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{currentPlan}</span>
      </div>

      {!isExpired ? (
        <>
          {/* Aktif dönem bilgisi */}
          <div style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#fff",
            marginBottom: "8px",
          }}>
            {formatPeriodLabel(currentPeriod, lang as Language)}
          </div>

          {/* Kalan dönemler */}
          {activePeriods.length > 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "12px",
              flexWrap: "wrap",
            }}>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                {tr("Kalan:", "Verbleibend:")}
              </span>
              {activePeriods.slice(0, 6).map((p, i) => (
                <span key={p} style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: p === currentPeriod ? "#10b981" : "rgba(255,255,255,0.5)",
                  background: p === currentPeriod
                    ? "rgba(16,185,129,0.15)"
                    : "rgba(255,255,255,0.05)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  border: p === currentPeriod
                    ? "1px solid rgba(16,185,129,0.3)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}>
                  {formatPeriodAbbr(p, lang as Language)}
                </span>
              ))}
              {activePeriods.length > 6 && (
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                  +{activePeriods.length - 6}
                </span>
              )}
            </div>
          )}

          {/* İlerleme çubuğu */}
          {totalPurchased > 1 && (
            <div style={{ marginBottom: "4px" }}>
              <div style={{
                height: "4px",
                borderRadius: "2px",
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(progressPercent, 100)}%`,
                  borderRadius: "2px",
                  background: isWarning
                    ? "linear-gradient(90deg, #f59e0b, #d97706)"
                    : "linear-gradient(90deg, #10b981, #059669)",
                  transition: "width 0.3s ease",
                }} />
              </div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "9px",
                color: "rgba(255,255,255,0.25)",
                marginTop: "4px",
              }}>
                <span>{usedPeriods + 1}/{totalPurchased} {tr("ay", "Mon.")}</span>
                <span>{remainingMonths} {tr("kalan", "übrig")}</span>
              </div>
            </div>
          )}

          {/* Son ay uyarısı */}
          {isWarning && (
            <div style={{
              fontSize: "11px",
              color: "#f59e0b",
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}>
              <ChevronRight size={12} />
              {tr("Bu sizin son aktif döneminiz", "Dies ist Ihr letzter aktiver Zeitraum")}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
          {tr(
            `${formatPeriodLabel(currentPeriod, "tr")} için aboneliğiniz bulunmuyor. Lütfen dönem satın alın.`,
            `Kein Abonnement für ${formatPeriodLabel(currentPeriod, "de")}. Bitte kaufen Sie einen Zeitraum.`
          )}
        </div>
      )}
    </motion.div>
  );
};
