import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLang } from "../LanguageContext";
import { supabase } from "../services/supabaseService";
import { PeriodPicker } from "./PeriodPicker";
import { UpgradePrompt } from "./UpgradePrompt";
import { ArrowLeft } from "lucide-react";

// ─── Sabit ana fiyatlar ───────────────────────────────────────
const BASE_PRICES: Record<string, number> = {
  free: 0,
  monthly: 40,
  quarterly: 120,
  yearly: 400,
};

export interface PlanDiscount {
  plan: string;
  discount_amount: number;
  active: boolean;
  label_tr: string;
  label_de: string;
}

export const getPlans = (tr: (a: string, b: string) => string, discounts?: PlanDiscount[]) => {
  const getDiscount = (planKey: string) => {
    const d = discounts?.find((x) => x.plan === planKey);
    return d && d.active && d.discount_amount > 0 ? d : null;
  };

  const freeDisc = getDiscount("free");
  const monthlyDisc = getDiscount("monthly");
  const quarterlyDisc = getDiscount("quarterly");
  const yearlyDisc = getDiscount("yearly");

  return [
    {
      key: "free",
      title: tr("Ücretsiz", "Kostenlos"),
      basePrice: 0,
      price: 0,
      discount: freeDisc,
      period: "",
      desc: tr("Başlangıç için ideal", "Ideal für den Einstieg"),
      highlight: false,
      features: [
        { text: tr("10 Fatura İşleme", "10 Rechnungen verarbeiten"), included: true },
        { text: tr("1 Banka Dökümü", "1 Kontoauszug"), included: true },
        { text: tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse"), included: true },
        { text: tr("Aylık Rapor", "Monatlicher Bericht"), included: true },
        { text: tr("Kurallar", "Regeln"), included: false },
        { text: tr("Export", "Exportieren"), included: false },
        { text: tr("Online Destek", "Online-Support"), included: false },
      ],
      buttonText: tr("Ücretsiz Başla", "Kostenlos starten"),
      badge: null,
    },
    {
      key: "monthly",
      title: tr("Aylık", "Monatlich"),
      basePrice: 40,
      price: monthlyDisc ? Math.max(0, 40 - monthlyDisc.discount_amount) : 40,
      discount: monthlyDisc,
      period: tr("/ay", "/Monat"),
      desc: tr("Sadece mevcut ay için erişim", "Zugriff nur auf den aktuellen Monat"),
      highlight: false,
      features: [
        { text: tr("Sınırsız Fatura İşleme", "Unbegrenzte Rechnungen"), included: true },
        { text: tr("Aylık Banka Dökümü", "Monatlicher Kontoauszug"), included: true },
        { text: tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse"), included: true },
        { text: tr("Aylık Rapor", "Monatlicher Bericht"), included: true },
        { text: tr("Kurallar", "Regeln"), included: true },
        { text: tr("Export", "Exportieren"), included: true },
        { text: tr("Online Destek", "Online-Support"), included: true },
        { text: tr("Sadece Mevcut Ay", "Nur aktueller Monat"), included: true },
        { text: tr("Geçmiş Dönemlere Erişim", "Zugriff auf vergangene Zeiträume"), included: false },
      ],
      buttonText: tr("Planı Seç", "Plan wählen"),
      badge: null,
    },
    {
      key: "quarterly",
      title: tr("3 Aylık", "3 Monate"),
      basePrice: 120,
      price: quarterlyDisc ? Math.max(0, 120 - quarterlyDisc.discount_amount) : 120,
      discount: quarterlyDisc,
      period: tr("/3 ay", "/3 Mon."),
      desc: tr("Çeyrek içi geçmiş dönemlere erişim", "Zugriff auf vergangene Monate im Quartal"),
      highlight: false,
      features: [
        { text: tr("Sınırsız Fatura İşleme", "Unbegrenzte Rechnungen"), included: true },
        { text: tr("3 Aylık Banka Dökümü", "3 Monate Kontoauszug"), included: true },
        { text: tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse"), included: true },
        { text: tr("Aylık Rapor", "Monatlicher Bericht"), included: true },
        { text: tr("Kurallar", "Regeln"), included: true },
        { text: tr("Export", "Exportieren"), included: true },
        { text: tr("Online Destek", "Online-Support"), included: true },
        { text: tr("Çeyrek İçi Geçmiş Dönemlere Erişim", "Zugriff auf vergangene Quartalsmonate"), included: true },
      ],
      buttonText: tr("Planı Seç", "Plan wählen"),
      badge: null,
    },
    {
      key: "yearly",
      title: tr("Yıllık", "Jährlich"),
      basePrice: 400,
      price: yearlyDisc ? Math.max(0, 400 - yearlyDisc.discount_amount) : 400,
      discount: yearlyDisc,
      period: tr("/yıl", "/Jahr"),
      desc: tr("En avantajlı plan — aylık ~33€", "Bester Plan — ~33€ monatlich"),
      highlight: true,
      features: [
        { text: tr("Sınırsız Fatura İşleme", "Unbegrenzte Rechnungen"), included: true },
        { text: tr("12 Aylık Banka Dökümü", "12 Monate Kontoauszug"), included: true },
        { text: tr("Fatura Gider Analizi", "Rechnungsausgabenanalyse"), included: true },
        { text: tr("Aylık Rapor", "Monatlicher Bericht"), included: true },
        { text: tr("Kurallar", "Regeln"), included: true },
        { text: tr("Export", "Exportieren"), included: true },
        { text: tr("Online Destek", "Online-Support"), included: true },
        { text: tr("Yıl İçi Tüm Geçmiş Dönemlere Erişim", "Zugriff auf alle vergangenen Jahresmonate"), included: true },
      ],
      buttonText: tr("Planı Seç", "Plan wählen"),
      badge: tr("En Popüler", "Beliebtest"),
    },
  ];
};

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.3 4.3L6.5 11.1L2.7 7.3" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4L12 12M12 4L4 12" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const PlanCard = ({ plan, index, tr, onSelect, lang }: { key?: React.Key; plan: any; index: number; tr: any; onSelect?: () => void; lang?: string }) => {
  const [hovered, setHovered] = useState(false);
  const hasDiscount = plan.discount && plan.discount.active && plan.discount.discount_amount > 0;
  const campaignLabel = hasDiscount
    ? (lang === "de" ? plan.discount.label_de : plan.discount.label_tr) || ""
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.23, 1, 0.32, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        borderRadius: "20px",
        border: plan.highlight ? "2px solid #f97316" : "1px solid rgba(255,255,255,0.08)",
        background: plan.highlight
          ? "linear-gradient(165deg, rgba(249,115,22,0.08) 0%, rgba(15,15,20,0.95) 40%)"
          : "rgba(18,18,24,0.9)",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        transition: "all 0.35s cubic-bezier(0.23,1,0.32,1)",
        transform: hovered ? "translateY(-6px)" : "translateY(0)",
        boxShadow: plan.highlight
          ? "0 0 40px rgba(249,115,22,0.12), 0 20px 60px rgba(0,0,0,0.4)"
          : hovered
            ? "0 20px 50px rgba(0,0,0,0.35)"
            : "0 4px 20px rgba(0,0,0,0.2)",
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* Campaign Badge */}
      {hasDiscount && campaignLabel && (
        <div style={{
          position: "absolute",
          top: "14px",
          left: "14px",
          background: "linear-gradient(135deg, #10b981, #059669)",
          color: "#fff",
          fontSize: "10px",
          fontWeight: 700,
          padding: "3px 9px",
          borderRadius: "8px",
          letterSpacing: "0.3px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          zIndex: 2,
        }}>
          {campaignLabel}
        </div>
      )}

      {/* Plan Badge */}
      {plan.badge && (
        <div style={{
          position: "absolute",
          top: "14px",
          right: "14px",
          background: "linear-gradient(135deg, #f97316, #ea580c)",
          color: "#fff",
          fontSize: "11px",
          fontWeight: 700,
          padding: "4px 10px",
          borderRadius: "20px",
          letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}>
          {plan.badge}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: hasDiscount && campaignLabel ? "42px 24px 0" : "28px 24px 0" }}>
        <h2 style={{
          fontSize: "14px",
          fontWeight: 500,
          color: plan.highlight ? "#f97316" : "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
          letterSpacing: "1.5px",
          margin: 0,
        }}>
          {plan.title}
        </h2>

        <div style={{ marginTop: "16px", display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
          {hasDiscount && (
            <span style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.3)",
              textDecoration: "line-through",
              lineHeight: 1,
            }}>
              {plan.basePrice}€
            </span>
          )}
          <span style={{
            fontSize: "44px",
            fontWeight: 800,
            color: hasDiscount ? "#10b981" : "#fff",
            lineHeight: 1,
            letterSpacing: "-2px",
          }}>
            {plan.price === 0 ? "0" : plan.price}€
          </span>
          {plan.period && (
            <span style={{ fontSize: "15px", color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
              {plan.period}
            </span>
          )}
        </div>

        {hasDiscount && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "8px",
            fontSize: "11px",
            fontWeight: 700,
            color: "#10b981",
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.2)",
            padding: "3px 10px",
            borderRadius: "8px",
          }}>
          -{plan.discount.discount_amount}€ {tr("indirim", "Rabatt")}
          </div>
        )}

        <p style={{
          fontSize: "13px",
          color: "rgba(255,255,255,0.4)",
          marginTop: "8px",
          lineHeight: 1.5,
        }}>
          {plan.desc}
        </p>
      </div>

      {/* Button */}
      <div style={{ padding: "20px 24px" }}>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelect}
          style={{
            width: "100%",
            padding: "13px 0",
            borderRadius: "12px",
            border: plan.highlight ? "none" : "1px solid rgba(255,255,255,0.12)",
            background: plan.highlight
              ? "linear-gradient(135deg, #f97316, #ea580c)"
              : "rgba(255,255,255,0.04)",
            color: plan.highlight ? "#fff" : "rgba(255,255,255,0.8)",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.25s ease",
            letterSpacing: "0.3px",
          }}
        >
          {plan.buttonText}
        </motion.button>
      </div>

      {/* Divider */}
      <div style={{
        height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
        margin: "0 24px",
      }} />

      {/* Features */}
      <div style={{ padding: "20px 24px 28px", display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
        <span style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.3)",
          textTransform: "uppercase",
          letterSpacing: "1px",
          fontWeight: 600,
          marginBottom: "4px",
        }}>
          {tr("Özellikler", "Funktionen")}
        </span>
        {plan.features.map((feature: any, i: number) => (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            opacity: feature.included ? 1 : 0.35,
          }}>
            {feature.included ? <CheckIcon /> : <XIcon />}
            <span style={{
              fontSize: "13.5px",
              color: feature.included ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)",
              textDecoration: feature.included ? "none" : "line-through",
              lineHeight: 1.4,
            }}>
              {feature.text}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

// ─── Custom hook: Kampanya indirimlerini yükle + canlı güncelle ─────
export const useCampaignDiscounts = () => {
  const [discounts, setDiscounts] = useState<PlanDiscount[]>([]);

  const fetchDiscounts = async () => {
    try {
      const { data } = await supabase.from("campaigns").select("*").eq("active", true);
      if (data && data.length > 0) {
        setDiscounts(
          data.map((d: any) => ({
            plan: d.plan,
            discount_amount: d.discount_amount || 0,
            active: d.active ?? false,
            label_tr: d.label_tr || "",
            label_de: d.label_de || "",
          }))
        );
        return;
      }
    } catch { /* Supabase hatası — localStorage fallback */ }

    // localStorage fallback
    try {
      const stored = localStorage.getItem("fibu_campaigns");
      if (stored) {
        const parsed = JSON.parse(stored);
        setDiscounts(parsed.filter((d: any) => d.active && d.discount_amount > 0));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchDiscounts();

    const handler = () => fetchDiscounts();
    window.addEventListener("campaigns-updated", handler);
    return () => window.removeEventListener("campaigns-updated", handler);
  }, []);

  return discounts;
};

// ─── Ana Bileşen ────────────────────────────────────────────────
export const SubscriptionPanel: React.FC<{
  onPlanSelected?: (plan?: any, selectedPeriods?: string[]) => void;
  purchasedPeriods?: string[];
}> = ({ onPlanSelected, purchasedPeriods = [] }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const discounts = useCampaignDiscounts();
  const plans = getPlans(tr, discounts);

  const [step, setStep] = useState<"plan" | "period" | "processing">("plan");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const handleSelectPlan = (plan: any) => {
    if (plan.key === "free") {
      // Free plan — dönem seçimi yok, direkt devam
      if (onPlanSelected) onPlanSelected(plan, []);
      return;
    }
    setSelectedPlan(plan);
    setStep("period");
  };

  const handlePeriodsSelected = (periods: string[]) => {
    setStep("processing");
    // Ödeme simülasyonu
    setTimeout(() => {
      setStep("plan");
      if (onPlanSelected) onPlanSelected(selectedPlan, periods);
    }, 2500);
  };

  const handleUpgradeSelect = (planKey: string) => {
    setShowUpgradePrompt(false);
    const plan = plans.find(p => p.key === planKey);
    if (plan) {
      setSelectedPlan(plan);
      setStep("period");
    }
  };

  // Ödeme işleniyor ekranı
  if (step === "processing") {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "linear-gradient(180deg, #0a0a0f 0%, #111118 50%, #0a0a0f 100%)" }}>
        <div className="text-center p-8 rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(15, 17, 21, 0.75)", backdropFilter: "blur(20px)" }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-white mb-2">
              {tr("Güvenli Ödeme Sayfasına Yönlendiriliyorsunuz...", "Weiterleitung zur sicheren Zahlungsseite...")}
            </h2>
            <p className="text-slate-400 text-sm">
              {tr("Lütfen bekleyin, işleminiz tamamlanıyor.", "Bitte warten Sie, Ihre Transaktion wird abgeschlossen.")}
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Dönem seçimi adımı
  if (step === "period" && selectedPlan) {
    return (
      <div style={{
        flex: 1,
        overflowY: "auto",
        background: "linear-gradient(180deg, #0a0a0f 0%, #111118 50%, #0a0a0f 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
      }}>
        {/* Geri butonu */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => { setStep("plan"); setSelectedPlan(null); }}
          style={{
            position: "absolute",
            top: "24px",
            left: "24px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "10px",
            padding: "8px 14px",
            cursor: "pointer",
            color: "rgba(255,255,255,0.6)",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} />
          {tr("Geri", "Zurück")}
        </motion.button>

        {/* Seçili plan bilgisi */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: "24px",
            textAlign: "center",
          }}
        >
          <span style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.4)",
          }}>
            {tr("Seçili Plan:", "Ausgewählter Plan:")}
          </span>
          <span style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#f97316",
            marginLeft: "8px",
          }}>
            {selectedPlan.title} — {selectedPlan.price}€{selectedPlan.period}
          </span>
        </motion.div>

        <PeriodPicker
          planType={selectedPlan.key}
          purchasedPeriods={purchasedPeriods}
          onPeriodsSelected={handlePeriodsSelected}
          onUpgradeRequest={() => setShowUpgradePrompt(true)}
        />

        <UpgradePrompt
          visible={showUpgradePrompt}
          onClose={() => setShowUpgradePrompt(false)}
          onSelectPlan={handleUpgradeSelect}
          currentPlanType={selectedPlan.key}
        />
      </div>
    );
  }

  // Plan seçimi adımı (varsayılan)
  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      background: "linear-gradient(180deg, #0a0a0f 0%, #111118 50%, #0a0a0f 100%)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "fixed",
        top: "20%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "600px",
        height: "400px",
        background: "radial-gradient(ellipse, rgba(249,115,22,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      <div style={{ maxWidth: "1100px", width: "100%", margin: "0 auto", padding: "60px 24px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: "56px" }}
        >
          <h1 style={{
            fontSize: "clamp(28px, 4vw, 42px)",
            fontWeight: 800,
            color: "#fff",
            margin: 0,
            letterSpacing: "-1px",
            lineHeight: 1.2,
          }}>
            {tr("Planınızı Seçin", "Wählen Sie Ihren Plan")}
          </h1>
          <p style={{
            fontSize: "16px",
            color: "rgba(255,255,255,0.4)",
            marginTop: "12px",
            maxWidth: "460px",
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.6,
          }}>
            {tr(
              "Muhasebe dönemlerinize uygun planı seçin, ilgili ayların verilerini girin.",
              "Wählen Sie den Plan passend zu Ihren Buchhaltungszeiträumen und geben Sie die Daten der relevanten Monate ein."
            )}
          </p>

          {/* Active campaigns banner */}
          {discounts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "16px",
                padding: "8px 18px",
                borderRadius: "12px",
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
                fontSize: "13px",
                fontWeight: 600,
                color: "#10b981",
              }}
            >
              {tr("Aktif kampanya mevcut! İndirimli fiyatlardan yararlanın.", "Aktive Kampagne! Profitieren Sie von reduzierten Preisen.")}
            </motion.div>
          )}
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan, index) => (
            <PlanCard key={plan.title} plan={plan} index={index} tr={tr} lang={lang} onSelect={() => handleSelectPlan(plan)} />
          ))}
        </div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          style={{
            textAlign: "center",
            fontSize: "13px",
            color: "rgba(255,255,255,0.25)",
            marginTop: "40px",
          }}
        >
          {tr(
            "Tüm fiyatlara KDV dahildir. Dönemsel abonelik modeli — satın aldığınız aylara erişim sağlarsınız.",
            "Alle Preise verstehen sich inklusive MwSt. Periodisches Abonnementmodell — Sie erhalten Zugang zu den gekauften Monaten."
          )}
        </motion.p>
      </div>
    </div>
  );
};
