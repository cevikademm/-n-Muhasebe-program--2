import React, { useState } from "react";
import { supabase } from "../services/supabaseService";
import { useLang } from "../LanguageContext";
import { TubesBackground } from "./TubesBackground";
import {
  Bot,
  ClipboardList,
  Cloud,
  Flag,
  ArrowRight,
  Loader2,
  Lock,
} from "lucide-react";

interface AuthScreenProps { onAuth: (session: any) => void; }

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuth }) => {
  const { t, lang, setLang } = useLang();
  const [isLogin, setIsLogin]   = useState(true);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [companyName,    setCompanyName]    = useState("");
  const [taxNumber,      setTaxNumber]      = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCity,    setCompanyCity]    = useState("");
  const [companyPhone,   setCompanyPhone]   = useState("");
  const [companyEmail,   setCompanyEmail]   = useState("");

  const tr = (tr: string, de: string) => lang === "tr" ? tr : de;

  const handleSubmit = async () => {
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth(data.session);
      } else {
        if (!companyName.trim()) throw new Error(t.companyRequired);
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          await supabase.from("companies").insert({
            user_id: data.user.id,
            company_name: companyName.trim(),
            tax_number: taxNumber.trim(),
            address: companyAddress.trim(),
            city: companyCity.trim(),
            phone: companyPhone.trim(),
            email: companyEmail.trim() || email,
          });
        }
        if (data.session) {
          onAuth(data.session);
        } else {
          setSuccess(t.registerSuccess);
        }
      }
    } catch (err: any) {
      setError(err.message || (isLogin ? t.loginError : t.registerError));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-end p-4 md:p-8 relative overflow-hidden" style={{ background: "#0d0f15" }}>

      {/* Tubes Background */}
      <div className="absolute inset-0 z-0 pointer-events-auto">
        <TubesBackground />
      </div>

      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        backgroundImage: "linear-gradient(rgba(6,182,212,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px"
      }} />
      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none z-0" style={{
        background: "radial-gradient(ellipse at center, rgba(6,182,212,.08) 0%, transparent 70%)"
      }} />

      {/* Lang */}
      <div className="absolute top-5 left-5 flex gap-2 z-10">
        {(["tr","de"] as const).map(l => (
          <button key={l} onClick={() => setLang(l)}
            className="font-syne px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer transition-all border"
            style={lang === l
              ? { background: "#06b6d4", color: "#fff", borderColor: "#06b6d4" }
              : { background: "transparent", color: "#3a3f4a", borderColor: "#1c1f27" }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="fade-up w-full max-w-[420px] flex flex-col rounded-2xl overflow-hidden shadow-2xl z-10 relative max-h-[95vh]" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(15, 17, 21, 0.75)", backdropFilter: "blur(20px)" }}>
        
        <div className="flex-1 p-8 flex flex-col overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-syne font-bold text-white text-sm"
              style={{ background: "linear-gradient(135deg,#06b6d4,#0891b2)" }}>F</div>
            <span className="font-syne font-bold text-lg text-slate-100">Fibu.de</span>
          </div>

          <div className="mb-6">
            <h2 className="font-syne font-bold text-2xl text-slate-100 mb-1">
              {isLogin ? tr("Giriş Yap", "Anmelden") : tr("Firma Kaydı", "Firmenregistrierung")}
            </h2>
            <p className="text-xs" style={{ color: "#94a3b8" }}>
              {isLogin
                ? tr("Hesabınıza erişin", "Zugang zu Ihrem Konto")
                : tr("Yeni firma hesabı oluşturun", "Neues Firmenkonto anlegen")}
            </p>
          </div>

          {error   && <div className="mb-4 px-4 py-3 rounded-lg text-xs" style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)", color:"#f87171" }}>{error}</div>}
          {success && <div className="mb-4 px-4 py-3 rounded-lg text-xs" style={{ background:"rgba(16,185,129,.1)", border:"1px solid rgba(16,185,129,.25)", color:"#34d399" }}>{success}</div>}

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
                  onKeyDown={e => e.key === "Enter" && isLogin && handleSubmit()} />
              </div>
            </div>

            {!isLogin && (
              <>
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px" style={{ background: "#1c1f27" }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#06b6d4" }}>{t.companyInfo}</span>
                  <div className="flex-1 h-px" style={{ background: "#1c1f27" }} />
                </div>

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
                    <input
                      type="text"
                      className="c-input"
                      value="Deutschland"
                      readOnly
                      style={{
                        paddingLeft: "36px",
                        cursor: "not-allowed",
                        background: "rgba(6,182,212,.04)",
                        borderColor: "rgba(6,182,212,.15)",
                        color: "#9ca3af",
                        userSelect: "none",
                      }}
                    />
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
              </>
            )}
          </div>

          <div className="mt-6 space-y-3">
            <button onClick={handleSubmit} disabled={loading}
              className="c-btn-primary w-full py-3 text-sm font-semibold rounded-lg flex items-center justify-center gap-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  {t.loading}
                </span>
              ) : isLogin ? <>{tr("Giriş Yap", "Anmelden")} <ArrowRight size={16} /></> : <>{tr("Hesap Oluştur", "Registrieren")} <ArrowRight size={16} /></>}
            </button>

            <button onClick={() => { setIsLogin(!isLogin); setError(""); setSuccess(""); }}
              className="c-btn-ghost w-full py-2.5 text-sm rounded-lg">
              {isLogin
                ? tr("Hesabınız yok mu? Kayıt Ol", "Noch kein Konto? Registrieren")
                : tr("Zaten hesabınız var mı? Giriş Yap", "Bereits registriert? Anmelden")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};