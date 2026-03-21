import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLang } from "../LanguageContext";
import { Lock, ArrowUpRight, X, Sparkles } from "lucide-react";

interface UpgradePromptProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlan: (planKey: string) => void;
  currentPlanType?: string;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  visible,
  onClose,
  onSelectPlan,
  currentPlanType = "monthly",
}) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  if (!visible) return null;

  const upgradeOptions = [
    ...(currentPlanType === "monthly"
      ? [
          {
            key: "quarterly",
            title: tr("3 Aylık Plan", "Quartalsplan"),
            price: "120€",
            period: tr("/3 ay", "/3 Mon."),
            desc: tr(
              "Mevcut çeyreğin tüm aylarına erişin",
              "Zugriff auf alle Monate des aktuellen Quartals"
            ),
            highlight: false,
          },
        ]
      : []),
    {
      key: "yearly",
      title: tr("Yıllık Plan", "Jahresplan"),
      price: "400€",
      period: tr("/yıl", "/Jahr"),
      desc: tr(
        "Yılın tüm 12 ayına tam erişim",
        "Voller Zugriff auf alle 12 Monate des Jahres"
      ),
      highlight: true,
    },
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(8px)",
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "440px",
              width: "90%",
              borderRadius: "24px",
              background: "linear-gradient(165deg, rgba(25, 25, 35, 0.98) 0%, rgba(15, 15, 22, 0.98) 100%)",
              border: "1px solid rgba(249, 115, 22, 0.2)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* Kapatma butonu */}
            <button
              onClick={onClose}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "8px",
                padding: "6px",
                cursor: "pointer",
                color: "rgba(255,255,255,0.4)",
                display: "flex",
                zIndex: 2,
              }}
            >
              <X size={16} />
            </button>

            {/* Başlık */}
            <div style={{
              padding: "32px 28px 0",
              textAlign: "center",
            }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.05))",
                border: "1px solid rgba(249,115,22,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <Lock size={22} color="#f97316" />
              </div>

              <h2 style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#fff",
                margin: "0 0 8px",
                lineHeight: 1.3,
              }}>
                {tr("Geçmiş Dönemlere Erişim", "Zugriff auf vergangene Zeiträume")}
              </h2>

              <p style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.45)",
                margin: "0 0 24px",
                lineHeight: 1.6,
              }}>
                {tr(
                  "Geçmiş aylara ait muhasebe verilerinizi girebilmek için planınızı yükseltin.",
                  "Aktualisieren Sie Ihren Plan, um Buchhaltungsdaten für vergangene Monate eingeben zu können."
                )}
              </p>
            </div>

            {/* Plan seçenekleri */}
            <div style={{
              padding: "0 28px 28px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}>
              {upgradeOptions.map((opt) => (
                <motion.button
                  key={opt.key}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => onSelectPlan(opt.key)}
                  style={{
                    width: "100%",
                    padding: "16px 20px",
                    borderRadius: "14px",
                    border: opt.highlight
                      ? "2px solid rgba(249,115,22,0.4)"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: opt.highlight
                      ? "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(249,115,22,0.03))"
                      : "rgba(255,255,255,0.03)",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}>
                      <span style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: opt.highlight ? "#f97316" : "#fff",
                      }}>
                        {opt.title}
                      </span>
                      {opt.highlight && <Sparkles size={14} color="#f97316" />}
                    </div>
                    <span style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.4)",
                    }}>
                      {opt.desc}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "2px" }}>
                    <span style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      color: opt.highlight ? "#f97316" : "#fff",
                    }}>
                      {opt.price}
                    </span>
                    <span style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.35)",
                    }}>
                      {opt.period}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Alt bilgi */}
            <div style={{
              padding: "16px 28px 24px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}>
              <ArrowUpRight size={12} color="rgba(255,255,255,0.25)" />
              <span style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.25)",
              }}>
                {tr(
                  "Yıllık plan ile tüm yıla ait dönemlere erişebilirsiniz",
                  "Mit dem Jahresplan erhalten Sie Zugang zu allen Zeiträumen des Jahres"
                )}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
