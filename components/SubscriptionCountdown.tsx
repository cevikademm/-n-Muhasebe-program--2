import React from "react";
import { useLang } from "../LanguageContext";
import { AlertTriangle, Calendar } from "lucide-react";
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
}) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const isLastMonth = remainingMonths === 1;
  const isWarning = isLastMonth && !isExpired;

  const planNames: Record<string, string> = {
    free: tr("Ücretsiz", "Kostenlos"),
    monthly: tr("Aylık", "Monatlich"),
    quarterly: tr("3 Aylık", "Quartal"),
    yearly: tr("Yıllık", "Jährlich"),
  };

  const currentPlanName = planNames[plan] || plan;

  const activePeriods = purchasedPeriods
    .filter(p => p >= currentPeriod)
    .sort();

  const totalPurchased = purchasedPeriods.length;
  const usedPeriods = purchasedPeriods.filter(p => p < currentPeriod).length;
  const progressPercent = totalPurchased > 0 ? ((usedPeriods + 1) / totalPurchased) * 100 : 0;

  if (purchasedPeriods.length === 0 && plan === "free") return null;

  const accentColor = isExpired ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981";
  const bgColor = isExpired
    ? "rgba(239,68,68,.06)"
    : isWarning
      ? "rgba(245,158,11,.06)"
      : "rgba(16,185,129,.04)";
  const borderColor = isExpired
    ? "rgba(239,68,68,.15)"
    : isWarning
      ? "rgba(245,158,11,.15)"
      : "rgba(16,185,129,.12)";

  return (
    <div
      style={{
        padding: "8px 20px",
        background: bgColor,
        borderBottom: `1px solid ${borderColor}`,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexShrink: 0,
        flexWrap: "wrap",
        minHeight: "40px",
      }}
    >
      {/* Icon + Status */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        {isExpired ? (
          <AlertTriangle size={14} color={accentColor} />
        ) : (
          <Calendar size={14} color={accentColor} />
        )}
        <span style={{
          fontSize: "11px", fontWeight: 700, color: accentColor,
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          {isExpired
            ? tr("Süre Doldu", "Abgelaufen")
            : tr("Aktif Dönem", "Aktiver Zeitraum")}
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,.08)", flexShrink: 0 }} />

      {/* Plan name */}
      <span style={{ fontSize: "11px", color: "rgba(255,255,255,.45)", flexShrink: 0 }}>
        {currentPlanName}
      </span>

      {!isExpired ? (
        <>
          {/* Divider */}
          <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,.08)", flexShrink: 0 }} />

          {/* Current period */}
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {formatPeriodLabel(currentPeriod, lang as Language)}
          </span>

          {/* Remaining periods pills */}
          {activePeriods.length > 0 && (
            <>
              <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,.08)", flexShrink: 0 }} />
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                {activePeriods.slice(0, 8).map((p) => (
                  <span key={p} style={{
                    fontSize: "9px",
                    fontWeight: 600,
                    color: p === currentPeriod ? "#10b981" : "rgba(255,255,255,0.45)",
                    background: p === currentPeriod
                      ? "rgba(16,185,129,0.15)"
                      : "rgba(255,255,255,0.04)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    border: p === currentPeriod
                      ? "1px solid rgba(16,185,129,0.3)"
                      : "1px solid rgba(255,255,255,0.06)",
                  }}>
                    {formatPeriodAbbr(p, lang as Language)}
                  </span>
                ))}
                {activePeriods.length > 8 && (
                  <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>
                    +{activePeriods.length - 8}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Progress bar + remaining count */}
          {totalPurchased > 1 && (
            <>
              <div style={{ flex: 1, minWidth: "60px", maxWidth: "120px" }}>
                <div style={{
                  height: "3px", borderRadius: "2px",
                  background: "rgba(255,255,255,0.06)", overflow: "hidden",
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
              </div>
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,.3)", flexShrink: 0 }}>
                {usedPeriods + 1}/{totalPurchased}
              </span>
            </>
          )}

          {/* Warning */}
          {isWarning && (
            <span style={{
              fontSize: "10px", fontWeight: 600, color: "#f59e0b",
              background: "rgba(245,158,11,.1)", padding: "2px 8px",
              borderRadius: "8px", border: "1px solid rgba(245,158,11,.2)",
              flexShrink: 0,
            }}>
              {tr("Son dönem", "Letzter Zeitraum")}
            </span>
          )}
        </>
      ) : (
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
          {tr(
            `${formatPeriodLabel(currentPeriod, "tr")} için aboneliğiniz bulunmuyor.`,
            `Kein Abo für ${formatPeriodLabel(currentPeriod, "de")}.`
          )}
        </span>
      )}
    </div>
  );
};
