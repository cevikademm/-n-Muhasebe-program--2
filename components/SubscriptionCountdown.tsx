import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLang } from "../LanguageContext";
import { AlertTriangle, Clock } from "lucide-react";

interface Props {
    plan: string;
    expiresAt: Date | null;
    onTimerEnd?: () => void;
}

export const SubscriptionCountdown: React.FC<Props> = ({ plan, expiresAt, onTimerEnd }) => {
    const { lang } = useLang();
    const tr = (a: string, b: string) => (lang === "tr" ? a : b);

    const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number; expired: boolean }>({
        d: 0, h: 0, m: 0, s: 0, expired: false,
    });

    useEffect(() => {
        if (!expiresAt) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const distance = expiresAt.getTime() - now;

            if (distance <= 0) {
                clearInterval(interval);
                setTimeLeft({ d: 0, h: 0, m: 0, s: 0, expired: true });
                if (onTimerEnd) onTimerEnd();
            } else {
                const d = Math.floor(distance / (1000 * 60 * 60 * 24));
                const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((distance % (1000 * 60)) / 1000);
                setTimeLeft({ d, h, m, s, expired: false });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [expiresAt, onTimerEnd]);

    if (!expiresAt) return null;

    const { d, h, m, s, expired } = timeLeft;
    const isWarning = d === 0 && h < 24;

    const planNames: Record<string, string> = {
        free: tr("Ücretsiz Plan", "Kostenloser Plan"),
        monthly: tr("Aylık Plan", "Monatlicher Plan"),
        quarterly: tr("3 Aylık Plan", "Auf 3 Monate"),
        yearly: tr("Yıllık Plan", "Jährlicher Plan"),
    };

    const currentPlan = planNames[plan] || plan;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="subscription-timer-widget"
            style={{
                margin: "16px 16px 8px 16px",
                padding: "16px",
                borderRadius: "14px",
                background: expired
                    ? "linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(185, 28, 28, 0.05))"
                    : isWarning
                        ? "linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05))"
                        : "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))",
                border: `1px solid ${expired ? "rgba(239, 68, 68, 0.3)" : isWarning ? "rgba(245, 158, 11, 0.3)" : "rgba(16, 185, 129, 0.3)"
                    }`,
                position: "relative",
                overflow: "hidden",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                {expired ? (
                    <AlertTriangle size={18} color="#ef4444" />
                ) : (
                    <Clock size={18} color={isWarning ? "#f59e0b" : "#10b981"} />
                )}
                <h3
                    style={{
                        margin: 0,
                        fontSize: "14px",
                        fontWeight: 700,
                        color: expired ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                    }}
                >
                    {expired ? tr("Abonelik Süresi Doldu", "Abonnement abgelaufen") : tr("Abonelik Süresi", "Abonnementdauer")}
                </h3>
            </div>

            <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "12px" }}>
                {tr("Mevcut Plan:", "Aktueller Plan:")}{" "}
                <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{currentPlan}</span>
            </div>

            {!expired ? (
                <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
                    {[
                        { label: tr("GÜN", "TAG"), value: d },
                        { label: tr("SAAT", "STD"), value: h },
                        { label: tr("DAKİKA", "MIN"), value: m },
                        { label: tr("SANİYE", "SEK"), value: s },
                    ].map((item, i) => (
                        <div
                            key={i}
                            style={{
                                background: "rgba(0, 0, 0, 0.2)",
                                borderRadius: "8px",
                                padding: "8px 0",
                                flex: 1,
                                textAlign: "center",
                                border: "1px solid rgba(255, 255, 255, 0.05)",
                                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "18px",
                                    fontWeight: 800,
                                    fontFamily: "'Space Mono', monospace",
                                    color: "#fff",
                                    lineHeight: 1,
                                }}
                            >
                                {item.value < 10 ? `0${item.value}` : item.value}
                            </div>
                            <div
                                style={{
                                    fontSize: "9px",
                                    color: "var(--text-dim)",
                                    marginTop: "4px",
                                    fontWeight: 600,
                                    letterSpacing: "1px",
                                }}
                            >
                                {item.label}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                    {tr(
                        "Süreniz dolmuştur. Lütfen işlemlere devam edebilmek için paketinizi yenileyin.",
                        "Ihre Zeit ist abgelaufen. Bitte erneuern Sie Ihr Paket, um fortzufahren."
                    )}
                </div>
            )}

            {/* Test Butonu - Geliştirici için */}
            <button
                onClick={() => {
                    localStorage.setItem("fibu_expires_test", new Date(Date.now() - 10000).toISOString());
                    window.dispatchEvent(new Event("subscription_updated"));
                }}
                style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    background: "rgba(255,255,255,0.1)",
                    border: "none",
                    padding: "2px 6px",
                    fontSize: "9px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.5)",
                }}
            >
                Expire Test
            </button>
        </motion.div>
    );
};
