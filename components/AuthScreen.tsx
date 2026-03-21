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

interface AuthScreenProps { onAuth: (session: any) => void; }

type ScreenState = "auth" | "register-modal" | "payment";

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
    if (regPassword.length < 6) { setModalError(tr("Şifre en az 6 karakter olmalı", "Passwort muss mindestens 6 Zeichen haben")); return; }
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
      // Go to payment screen regardless of e-mail confirmation
      setScreenState("payment");
    } catch (err: any) {
      setModalError(err.message || t.registerError);
    } finally { setModalLoading(false); }
  };

  // ─── Payment Screen ───────────────────────────────────
  if (screenState === "payment") {
    return (
      <div className="min-h-screen flex relative overflow-hidden" style={{ background: "#0d0f15" }}>
        <div className="absolute inset-0 z-0 pointer-events-auto"><TubesBackground /></div>
        <div className="absolute inset-0 pointer-events-none z-0" style={{
          backgroundImage: "linear-gradient(rgba(6,182,212,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        <div className="relative z-10 flex flex-col items-center justify-center w-full min-h-screen p-6">
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
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-syne font-bold text-white text-sm"
                  style={{ background: "linear-gradient(135deg,#06b6d4,#0891b2)" }}>F</div>
                <span className="font-syne font-bold text-lg text-slate-100">Fibu.de</span>
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
            </div>

            {/* Body */}
            <div style={{ padding: "28px 36px 36px" }}>
              {/* Stripe-like placeholder */}
              <div style={{
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
                padding: "20px",
                marginBottom: "20px",
              }}>
                <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "12px" }}>
                  {tr("Kart Bilgileri", "Kartendaten")}
                </p>
                <div style={{ marginBottom: "12px" }}>
                  <label className="c-label">{tr("Kart Numarası", "Kartennummer")}</label>
                  <div className="glow-wrap">
                    <input type="text" className="c-input" placeholder="1234 5678 9012 3456" maxLength={19} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="c-label">{tr("Son Kullanma", "Ablaufdatum")}</label>
                    <div className="glow-wrap">
                      <input type="text" className="c-input" placeholder="MM/YY" maxLength={5} />
                    </div>
                  </div>
                  <div>
                    <label className="c-label">CVV</label>
                    <div className="glow-wrap">
                      <input type="text" className="c-input" placeholder="•••" maxLength={4} />
                    </div>
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
      <div className="relative z-10 flex flex-col lg:flex-row w-full min-h-screen">

        {/* LEFT: Login form */}
        <div className="flex items-center justify-center p-6 lg:p-10 lg:w-[420px] xl:w-[460px] flex-shrink-0">
          <div
            className="fade-up w-full max-w-[420px] flex flex-col rounded-2xl overflow-hidden shadow-2xl max-h-[95vh]"
            style={{
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(15, 17, 21, 0.82)",
              backdropFilter: "blur(24px)",
            }}
          >
            <div className="flex-1 p-8 flex flex-col overflow-y-auto">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-syne font-bold text-white text-sm"
                  style={{ background: "linear-gradient(135deg,#06b6d4,#0891b2)" }}>F</div>
                <span className="font-syne font-bold text-lg text-slate-100">Fibu.de</span>
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
                      value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="c-label">{t.password}</label>
                  <div className="glow-wrap">
                    <input type="password" className="c-input" placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)}
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
                {tr("Hesabınız yok mu? Sağdaki bir plan seçin.", "Kein Konto? Wählen Sie rechts einen Plan.")}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT: Subscription plans */}
        <div className="flex-1 hidden lg:flex flex-col justify-center px-6 xl:px-10 py-16 overflow-y-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#06b6d4", letterSpacing: "0.2em" }}>
              {tr("Abonelik Planları", "Abonnementpläne")}
            </p>
            <h2 style={{
              fontSize: "clamp(22px, 2.8vw, 36px)",
              fontWeight: 800,
              color: "#fff",
              margin: 0,
              letterSpacing: "-0.5px",
              lineHeight: 1.25,
            }}>
              {tr("Planınızı Seçin", "Wählen Sie Ihren Plan")}
            </h2>
            <p style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.4)",
              marginTop: "10px",
              maxWidth: "420px",
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

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            maxWidth: "900px",
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
            fontSize: "12px",
            color: "rgba(255,255,255,0.2)",
            marginTop: "28px",
          }}>
            {tr(
              "Tüm fiyatlara KDV dahildir. İstediğiniz zaman iptal edebilirsiniz.",
              "Alle Preise verstehen sich inkl. MwSt. Jederzeit kündbar."
            )}
          </p>
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
    </div>
  );
};