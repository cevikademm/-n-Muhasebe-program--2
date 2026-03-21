import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../services/supabaseService";
import { useLang } from "../LanguageContext";
import { TubesBackground } from "./TubesBackground";
import { getPlans, PlanCard, useCampaignDiscounts } from "./SubscriptionPanel";
import {
  ArrowRight,
  Loader2,
  Lock,
  X,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { PeriodPicker } from "./PeriodPicker";
import { UpgradePrompt } from "./UpgradePrompt";
import { formatPeriodLabel, type Language } from "../services/periodUtils";

interface AuthScreenProps { onAuth: (session: any) => void; }

type ScreenState = "auth" | "register-modal" | "period-select" | "payment";

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuth }) => {
  const { t, lang, setLang } = useLang();
  const campaignDiscounts = useCampaignDiscounts();

  // ─── Auth Form ────────────────────────────────────────
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // ─── Plan / Modal ─────────────────────────────────────
  const [screenState, setScreenState] = useState<ScreenState>("auth");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // ─── Registration Modal Fields ────────────────────────
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const plans = getPlans(tr, campaignDiscounts);

  // ─── Login Submit ─────────────────────────────────────
  const handleLoginSubmit = async () => {
    setError(""); setSuccess(""); setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        onAuth(data.session);
        return;
      }
      if (error) {
        const msg = error.message?.toLowerCase() ?? "";
        if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
          throw new Error(tr(
            "E-posta veya şifre hatalı.",
            "E-Mail oder Passwort falsch."
          ));
        }
        if (msg.includes("email not confirmed")) {
          throw new Error(tr(
            "E-postanız henüz onaylanmamış. Gelen kutunuzu kontrol edin.",
            "Ihre E-Mail wurde noch nicht bestätigt. Bitte überprüfen Sie Ihren Posteingang."
          ));
        }
        throw error;
      }
    } catch (err: any) {
      setError(err.message || t.loginError);
    } finally { setLoading(false); }
  };

  // ─── Plan Selected → open modal ───────────────────────
  const handlePlanSelect = (plan: any) => {
    setSelectedPlan(plan);
    setModalError("");
    setScreenState("register-modal");
  };

  // ─── Register (modal) + goto payment ─────────────────
  const handleRegisterAndPay = async () => {
    setModalError("");
    if (!companyName.trim()) { setModalError(t.companyRequired); return; }
    if (!regEmail.trim()) { setModalError(tr("E-posta gerekli", "E-Mail ist erforderlich")); return; }
    // [FIX L-2] Şifre politikası NIST SP 800-63B'ye uygun hale getirildi (min 8 karakter)
    if (regPassword.length < 8) { setModalError(tr("Şifre en az 8 karakter olmalı", "Passwort muss mindestens 8 Zeichen haben")); return; }
    if (regPassword !== regPassword2) { setModalError(tr("Şifreler eşleşmiyor", "Passwörter stimmen nicht überein")); return; }

    setModalLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: regEmail, password: regPassword });
      if (error) throw error;
      if (data.user) {
        await supabase.from("companies").insert({
          user_id: data.user.id,
          company_name: companyName.trim(),
          tax_number: taxNumber.trim(),
          address: companyAddress.trim(),
          city: companyCity.trim(),
          phone: companyPhone.trim(),
          email: companyEmail.trim() || regEmail,
        });
      }
      // Free plan → direkt payment, diğerleri → dönem seçimi
      if (selectedPlan?.key === "free") {
        setScreenState("payment");
      } else {
        setScreenState("period-select");
      }
    } catch (err: any) {
      setModalError(err.message || t.registerError);
    } finally { setModalLoading(false); }
  };

  // ─── Period Selection Screen ──────────────────────────
  if (screenState === "period-select" && selectedPlan) {
    return (
      <div className="min-h-screen flex relative overflow-hidden" style={{ background: "#0d0f15" }}>
        <div className="absolute inset-0 z-0 pointer-events-auto"><TubesBackground /></div>
        <div className="absolute inset-0 pointer-events-none z-0" style={{
          backgroundImage: "linear-gradient(rgba(6,182,212,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        <div className="relative z-10 flex flex-col items-center justify-center w-full min-h-screen p-4 sm:p-6">
          {/* Seçili plan bilgisi */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginBottom: "24px", textAlign: "center" }}
          >
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
              {tr("Seçili Plan:", "Ausgewählter Plan:")}
            </span>
            <span style={{
              fontSize: "15px", fontWeight: 700, color: "#f97316", marginLeft: "8px",
            }}>
              {selectedPlan.title} — {selectedPlan.price}€{selectedPlan.period}
            </span>
          </motion.div>

          <PeriodPicker
            planType={selectedPlan.key}
            purchasedPeriods={[]}
            onPeriodsSelected={(periods) => {
              setSelectedPeriods(periods);
              setScreenState("payment");
            }}
            onUpgradeRequest={() => setShowUpgradePrompt(true)}
          />

          <UpgradePrompt
            visible={showUpgradePrompt}
            onClose={() => setShowUpgradePrompt(false)}
            onSelectPlan={(planKey) => {
              setShowUpgradePrompt(false);
              const plan = plans.find(p => p.key === planKey);
              if (plan) {
                setSelectedPlan(plan);
              }
            }}
            currentPlanType={selectedPlan.key}
          />

          <button
            onClick={() => setScreenState("register-modal")}
            style={{
              marginTop: "16px", background: "none", border: "none",
              color: "rgba(255,255,255,0.3)", fontSize: "12px", cursor: "pointer",
            }}
          >
            ← {tr("Geri dön", "Zurück")}
          </button>
        </div>
      </div>
    );
  }

  // ─── Payment Screen ───────────────────────────────────
  if (screenState === "payment") {
    return (
      <div className="min-h-screen flex relative overflow-hidden" style={{ background: "#0d0f15" }}>
        <div className="absolute inset-0 z-0 pointer-events-auto"><TubesBackground /></div>
        <div className="absolute inset-0 pointer-events-none z-0" style={{
          backgroundImage: "linear-gradient(rgba(6,182,212,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        <div className="relative z-10 flex flex-col items-center justify-center w-full min-h-screen p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
            style={{
              width: "100%",
              maxWidth: "480px",
              borderRadius: "24px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(15, 17, 21, 0.88)",
              backdropFilter: "blur(28px)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(15,15,20,0.0) 60%)",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              padding: "32px 36px 28px",
            }}>
              <div className="flex items-center gap-3 mb-6">
                <img src="/logo.png" alt="FikoAI" className="w-8 h-8 rounded-lg object-contain" />
                <span className="font-syne font-bold text-lg text-slate-100">FikoAI</span>
              </div>

              <div className="flex items-center gap-3 mb-1">
                <CreditCard size={20} style={{ color: "#f97316" }} />
                <h2 className="font-syne font-bold text-xl text-white">
                  {tr("Güvenli Ödeme", "Sichere Zahlung")}
                </h2>
              </div>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)", marginLeft: "32px" }}>
                {tr("Seçilen plan:", "Gewählter Plan:")} <span style={{ color: "#f97316", fontWeight: 600 }}>
                  {selectedPlan?.title} — {selectedPlan?.price === 0 ? tr("Ücretsiz", "Kostenlos") : `${selectedPlan?.price}€${selectedPlan?.period}`}
                </span>
              </p>
              {selectedPeriods.length > 0 && (
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)", marginLeft: "32px", marginTop: "4px" }}>
                  {tr("Dönemler:", "Zeiträume:")}{" "}
                  <span style={{ color: "#06b6d4" }}>
                    {selectedPeriods.map(p => formatPeriodLabel(p, lang as Language)).join(", ")}
                  </span>
                </p>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: "28px 36px 36px" }}>
              {/* [FIX C-2] Güvenli ödeme bildirimi — ham kart girişi kaldırıldı */}
              <div style={{
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
                padding: "20px",
                marginBottom: "20px",
                textAlign: "center",
              }}>
                <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "12px" }}>
                  {tr("Kart Bilgileri", "Kartendaten")}
                </p>
                <div style={{
                  padding: "16px",
                  borderRadius: "10px",
                  background: "rgba(249,115,22,0.06)",
                  border: "1px dashed rgba(249,115,22,0.3)",
                }}>
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                    {tr(
                      "Odeme islemi Stripe guvenli odeme altyapisi uzerinden gerceklestirilecektir. Kayit olduktan sonra guvenli odeme sayfasina yonlendirileceksiniz.",
                      "Die Zahlung wird uber die sichere Stripe-Zahlungsinfrastruktur abgewickelt. Nach der Registrierung werden Sie zur sicheren Zahlungsseite weitergeleitet."
                    )}
                  </p>
                  <div style={{ marginTop: "10px", display: "flex", justifyContent: "center", gap: "8px", opacity: 0.4 }}>
                    <span style={{ fontSize: "20px" }}>VISA</span>
                    <span style={{ fontSize: "20px" }}>MC</span>
                    <span style={{ fontSize: "20px" }}>AMEX</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div style={{
                borderRadius: "12px",
                border: "1px solid rgba(249,115,22,0.2)",
                background: "rgba(249,115,22,0.05)",
                padding: "14px 16px",
                marginBottom: "20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>
                  {selectedPlan?.title}
                </span>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "#f97316" }}>
                  {selectedPlan?.price === 0 ? tr("Ücretsiz", "Kostenlos") : `${selectedPlan?.price}€`}
                </span>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: "100%",
                  padding: "15px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #f97316, #ea580c)",
                  color: "#fff",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  letterSpacing: "0.3px",
                  boxShadow: "0 4px 20px rgba(249,115,22,0.35)",
                }}
              >
                <CreditCard size={17} />
                {selectedPlan?.price === 0
                  ? tr("Ücretsiz Başla", "Kostenlos starten")
                  : tr("Ödemeyi Tamamla", "Zahlung abschließen")}
              </motion.button>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "14px" }}>
                <CheckCircle2 size={13} style={{ color: "#22c55e" }} />
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
                  {tr("256-bit SSL ile güvenli şifreleme", "256-bit SSL-Verschlüsselung")}
                </span>
              </div>
            </div>
          </motion.div>

          <button
            onClick={() => setScreenState("auth")}
            style={{
              marginTop: "16px",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.3)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            ← {tr("Geri dön", "Zurück")}
          </button>
        </div>
      </div>
    );
  }

  // ─── Main Auth Screen (with plans) ────────────────────
  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: "#0d0f15" }}>

      {/* Neon Tubes Background */}
      <div className="absolute inset-0 z-0 pointer-events-auto"><TubesBackground /></div>

      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        backgroundImage: "linear-gradient(rgba(6,182,212,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px"
      }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] pointer-events-none z-0" style={{
        background: "radial-gradient(ellipse at center, rgba(6,182,212,.08) 0%, transparent 70%)"
      }} />

      {/* Language switcher */}
      <div className="absolute top-5 left-5 flex gap-2 z-20">
        {(["tr", "de"] as const).map(l => (
          <button key={l} onClick={() => setLang(l)}
            className="font-syne px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer transition-all border"
            style={lang === l
              ? { background: "#06b6d4", color: "#fff", borderColor: "#06b6d4" }
              : { background: "transparent", color: "#3a3f4a", borderColor: "#1c1f27" }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Layout ── */}
      <div className="relative z-10 flex flex-col lg:flex-row w-full min-h-screen overflow-y-auto">

        {/* LEFT: Login form */}
        <div className="flex items-center justify-center p-4 sm:p-6 lg:p-10 lg:w-[380px] xl:w-[420px] flex-shrink-0">
          <div
            className="fade-up w-full max-w-[380px] flex flex-col rounded-2xl overflow-hidden shadow-2xl max-h-[95vh]"
            style={{
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(15, 17, 21, 0.82)",
              backdropFilter: "blur(24px)",
            }}
          >
            <div className="flex-1 p-8 flex flex-col overflow-y-auto">
              <div className="flex items-center gap-3 mb-8">
                <img src="/logo.png" alt="FikoAI" className="w-8 h-8 rounded-lg object-contain" />
                <span className="font-syne font-bold text-lg text-slate-100">FikoAI</span>
              </div>

              <div className="mb-6">
                <h2 className="font-syne font-bold text-2xl text-slate-100 mb-1">
                  {tr("Giriş Yap", "Anmelden")}
                </h2>
                <p className="text-xs" style={{ color: "#94a3b8" }}>
                  {tr("Hesabınıza erişin", "Zugang zu Ihrem Konto")}
                </p>
              </div>

              {error && <div className="mb-4 px-4 py-3 rounded-lg text-xs" style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#f87171" }}>{error}</div>}

              <div className="flex-1 space-y-4">
                <div>
                  <label className="c-label">{t.email}</label>
                  <div className="glow-wrap">
                    <input type="email" className="c-input" placeholder="name@firma.de"
                      autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="c-label">{t.password}</label>
                  <div className="glow-wrap">
                    <input type="password" className="c-input" placeholder="••••••••"
                      autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleLoginSubmit()} />
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <button onClick={handleLoginSubmit} disabled={loading}
                  className="c-btn-primary w-full py-3 text-sm font-semibold rounded-lg flex items-center justify-center gap-2">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      {t.loading}
                    </span>
                  ) : <>{tr("Giriş Yap", "Anmelden")} <ArrowRight size={16} /></>}
                </button>
              </div>

              <p className="text-xs text-center mt-4" style={{ color: "rgba(255,255,255,0.25)" }}>
                {tr("Hesabınız yok mu? Bir plan seçin.", "Kein Konto? Wählen Sie einen Plan.")}
              </p>
            </div>
          </div>
        </div>

        {/* CENTER: Subscription plans */}
        <div className="flex-1 flex flex-col justify-center px-4 xl:px-6 py-8 lg:py-16 overflow-y-auto">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#06b6d4", letterSpacing: "0.2em" }}>
              {tr("Abonelik Planları", "Abonnementpläne")}
            </p>
            <h2 style={{
              fontSize: "clamp(20px, 2.4vw, 32px)",
              fontWeight: 800,
              color: "#fff",
              margin: 0,
              letterSpacing: "-0.5px",
              lineHeight: 1.25,
            }}>
              {tr("Planınızı Seçin", "Wählen Sie Ihren Plan")}
            </h2>
            <p style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.4)",
              marginTop: "8px",
              maxWidth: "380px",
              marginLeft: "auto",
              marginRight: "auto",
              lineHeight: 1.6,
            }}>
              {tr(
                "İhtiyacınıza uygun planı seçin, hemen kullanmaya başlayın.",
                "Wählen Sie den passenden Plan und legen Sie sofort los."
              )}
            </p>
          </div>

          <div className="auth-plans-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
            maxWidth: "820px",
            margin: "0 auto",
            width: "100%",
          }}>
            {plans.map((plan, index) => (
              <PlanCard
                key={plan.title}
                plan={plan}
                index={index}
                tr={tr}
                lang={lang}
                onSelect={() => handlePlanSelect(plan)}
              />
            ))}
          </div>

          <p style={{
            textAlign: "center",
            fontSize: "11px",
            color: "rgba(255,255,255,0.2)",
            marginTop: "24px",
          }}>
            {tr(
              "Tüm fiyatlara KDV dahildir. İstediğiniz zaman iptal edebilirsiniz.",
              "Alle Preise verstehen sich inkl. MwSt. Jederzeit kündbar."
            )}
          </p>
        </div>

        {/* RIGHT: Promo card */}
        <div className="hidden xl:flex items-center justify-center p-6 xl:p-8 xl:w-[380px] flex-shrink-0">
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
            style={{
              width: "100%",
              maxWidth: "360px",
              borderRadius: "24px",
              border: "1px solid rgba(6,182,212,0.2)",
              background: "rgba(15, 17, 21, 0.85)",
              backdropFilter: "blur(24px)",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(6,182,212,0.05)",
            }}
          >
            {/* Card header accent */}
            <div style={{
              height: "4px",
              background: "linear-gradient(90deg, #06b6d4, #0891b2, #f97316)",
            }} />

            <div style={{ padding: "32px 28px" }}>
              {/* Domain badge */}
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                background: "rgba(6,182,212,0.1)",
                border: "1px solid rgba(6,182,212,0.2)",
                marginBottom: "20px",
              }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#06b6d4", letterSpacing: "0.05em" }}>fikoai.de</span>
              </div>

              {/* Tagline */}
              <h3 style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "20px",
                fontWeight: 800,
                color: "#fff",
                lineHeight: 1.3,
                margin: "0 0 16px 0",
              }}>
                {tr(
                  "Muhasebe artık düşünüyor.",
                  "Buchhaltung denkt jetzt mit."
                )}
              </h3>

              {/* Feature list */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "20px",
              }}>
                {[
                  tr("Faturayı yükle.", "Rechnung hochladen."),
                  tr("Banka dökümanları ile eşleştir.", "Mit Bankbelegen abgleichen."),
                  tr("SKR03/SKR04 sınıflandırıldı.", "SKR03/SKR04 klassifiziert."),
                  tr("DATEV'e aktarıldı.", "An DATEV exportiert."),
                  tr("Hepsi saniyeler içinde.", "Alles in Sekunden."),
                ].map((item, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}>
                    <div style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: i === 4 ? "#f97316" : "#06b6d4",
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: "13px",
                      color: i === 4 ? "rgba(249,115,22,0.9)" : "rgba(255,255,255,0.55)",
                      fontWeight: i === 4 ? 600 : 400,
                    }}>{item}</span>
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "16px 0" }} />

              {/* Description */}
              <p style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.4)",
                lineHeight: 1.7,
                margin: "0 0 16px 0",
              }}>
                {tr(
                  "Ön muhasebe dönemi bitti. Evraklarını doğrudan muhasebecine ilet — tam, eksiksiz, yapay zeka destekli.",
                  "Die Vorbuchhaltung ist vorbei. Belege direkt an den Steuerberater — vollständig, lückenlos, KI-gestützt."
                )}
              </p>

              {/* Divider */}
              <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "16px 0" }} />

              {/* Acronym explanation */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                marginBottom: "16px",
              }}>
                {[
                  { key: "fi", val: "Finanzbuchhaltung" },
                  { key: "ko", val: "Kontierung" },
                  { key: "ai", val: tr("Yapay Zeka", "Künstliche Intelligenz") },
                ].map(({ key, val }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 800, color: "#06b6d4", fontFamily: "'Syne', sans-serif", minWidth: "20px" }}>{key}</span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>=</span>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{
                padding: "12px 16px",
                borderRadius: "12px",
                background: "rgba(249,115,22,0.06)",
                border: "1px solid rgba(249,115,22,0.12)",
              }}>
                <p style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.35)",
                  margin: 0,
                  lineHeight: 1.6,
                  textAlign: "center",
                }}>
                  {tr(
                    "Alman KOBİ'leri için tasarlandı. Türk girişimciler tarafından inşa edildi.",
                    "Für deutsche KMUs entwickelt. Von türkischen Gründern gebaut."
                  )}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────
          REGISTRATION MODAL — centered on top of everything
      ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {screenState === "register-modal" && (
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(6px)",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setScreenState("auth"); }}
          >
            <motion.div
              key="modal-card"
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              style={{
                width: "100%",
                maxWidth: "520px",
                maxHeight: "90vh",
                overflowY: "auto",
                borderRadius: "24px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(13, 15, 21, 0.96)",
                backdropFilter: "blur(32px)",
                boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
              }}
            >
              {/* Modal Header */}
              <div style={{
                padding: "28px 32px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                background: "linear-gradient(135deg, rgba(249,115,22,0.06) 0%, transparent 50%)",
              }}>
                <div>
                  <h3 style={{ color: "#fff", fontWeight: 800, fontSize: "20px", margin: 0, fontFamily: "'Syne', sans-serif" }}>
                    {tr("Hesap Oluştur", "Konto erstellen")}
                  </h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "4px" }}>
                    {tr("Seçilen plan:", "Gewählter Plan:")} <span style={{ color: "#f97316", fontWeight: 600 }}>
                      {selectedPlan?.title} {selectedPlan?.price > 0 && `— ${selectedPlan?.price}€${selectedPlan?.period}`}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setScreenState("auth")}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "6px",
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.5)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: "24px 32px 32px" }}>
                {modalError && (
                  <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "10px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#f87171", fontSize: "13px" }}>
                    {modalError}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Account credentials */}
                  <div>
                    <label className="c-label">{t.email}</label>
                    <div className="glow-wrap">
                      <input type="email" className="c-input" placeholder="name@firma.de"
                        value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="c-label">{t.password}</label>
                      <div className="glow-wrap">
                        <input type="password" className="c-input" placeholder="••••••••"
                          value={regPassword} onChange={e => setRegPassword(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="c-label">{tr("Şifre Tekrar", "Passwort wiederholen")}</label>
                      <div className="glow-wrap">
                        <input type="password" className="c-input" placeholder="••••••••"
                          value={regPassword2} onChange={e => setRegPassword2(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "2px 0" }}>
                    <div style={{ flex: 1, height: "1px", background: "#1c1f27" }} />
                    <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "#06b6d4" }}>{t.companyInfo}</span>
                    <div style={{ flex: 1, height: "1px", background: "#1c1f27" }} />
                  </div>

                  {/* Company fields */}
                  <div>
                    <label className="c-label">{t.companyName} *</label>
                    <div className="glow-wrap">
                      <input type="text" className="c-input" placeholder="GmbH / UG / e.K."
                        value={companyName} onChange={e => setCompanyName(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="c-label">{t.taxNumber}</label>
                      <div className="glow-wrap">
                        <input type="text" className="c-input" placeholder="DE123..."
                          value={taxNumber} onChange={e => setTaxNumber(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="c-label">{t.city}</label>
                      <div className="glow-wrap">
                        <input type="text" className="c-input" placeholder="Berlin"
                          value={companyCity} onChange={e => setCompanyCity(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="c-label">{t.address}</label>
                    <div className="glow-wrap">
                      <input type="text" className="c-input" placeholder="Musterstraße 1"
                        value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="c-label" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      {tr("Ülke", "Land")}
                      <Lock size={9} style={{ color: "#374151" }} />
                    </label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "15px", lineHeight: 1, pointerEvents: "none" }}>🇩🇪</span>
                      <input type="text" className="c-input" value="Deutschland" readOnly
                        style={{ paddingLeft: "36px", cursor: "not-allowed", background: "rgba(6,182,212,.04)", borderColor: "rgba(6,182,212,.15)", color: "#9ca3af", userSelect: "none" }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="c-label">{t.phone}</label>
                      <div className="glow-wrap">
                        <input type="text" className="c-input" placeholder="+49..."
                          value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="c-label">{t.companyEmail}</label>
                      <div className="glow-wrap">
                        <input type="email" className="c-input" placeholder="info@firma.de"
                          value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleRegisterAndPay}
                  disabled={modalLoading}
                  style={{
                    width: "100%",
                    marginTop: "24px",
                    padding: "14px",
                    borderRadius: "12px",
                    border: "none",
                    background: "linear-gradient(135deg, #f97316, #ea580c)",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: modalLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    opacity: modalLoading ? 0.7 : 1,
                    boxShadow: "0 4px 18px rgba(249,115,22,0.3)",
                    letterSpacing: "0.3px",
                  }}
                >
                  {modalLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> {t.loading}</>
                  ) : (
                    <>{tr("Ödeme Adımına Geç", "Weiter zur Zahlung")} <ArrowRight size={16} /></>
                  )}
                </motion.button>

                <p style={{ textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.2)", marginTop: "12px" }}>
                  {tr("Kayıt olarak hizmet şartlarını kabul etmiş olursunuz.", "Mit der Registrierung akzeptieren Sie die Nutzungsbedingungen.")}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile responsive styles */}
      <style>{`
        @media (max-width: 1023px) {
          .auth-plans-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10px !important;
          }
        }
        @media (max-width: 479px) {
          .auth-plans-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
        }
      `}</style>
    </div>
  );
};