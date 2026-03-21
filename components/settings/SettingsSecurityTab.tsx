import React, { useState, useEffect } from "react";
import { BookOpen, Shield, Landmark, AlertTriangle, Check, Clock, ShieldCheck, Smartphone, Key, Eye, EyeOff } from "lucide-react";
import { useLang } from "../../LanguageContext";
import { supabase } from "../../services/supabaseService";

interface Props {
  userId: string | undefined;
  userEmail: string | undefined;
  userRole: string;
  flash: (text: string, ok?: boolean) => void;
}

// ⚠ GÜVENLİK (ORT-01): Güçlü parola politikası doğrulaması
function validatePassword(pwd: string) {
  const checks = {
    minLength: pwd.length >= 8,
    hasUppercase: /[A-Z]/.test(pwd),
    hasLowercase: /[a-z]/.test(pwd),
    hasNumber: /[0-9]/.test(pwd),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { ...checks, score, isValid: score >= 4 && checks.minLength };
}

export const SettingsSecurityTab: React.FC<Props> = ({ userId, userEmail, userRole, flash }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;

  const [newPwd, setNewPwd] = useState("");
  const [confPwd, setConfPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // ⚠ GÜVENLİK (ORT-03): 2FA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaStep, setMfaStep] = useState<"idle" | "setup" | "verify">("idle");

  const pwdValidation = validatePassword(newPwd);

  // 2FA durumunu kontrol et
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (!error && data) {
          const totp = data.totp || [];
          const verified = totp.find((f: any) => f.status === "verified");
          if (verified) {
            setMfaEnabled(true);
            setMfaFactorId(verified.id);
          }
        }
      } catch {
        // MFA API mevcut değilse sessizce devam et
      }
    })();
  }, []);

  // ── Şifre değiştir (ORT-01 düzeltmesi)
  const changePassword = async () => {
    if (!newPwd || newPwd !== confPwd) {
      flash(tr("Şifreler eşleşmiyor!", "Passwörter stimmen nicht überein!"), false);
      return;
    }
    if (!pwdValidation.isValid) {
      flash(tr(
        "Şifre en az 8 karakter, 1 büyük harf, 1 sayı içermelidir!",
        "Passwort muss mind. 8 Zeichen, 1 Großbuchstabe und 1 Zahl enthalten!"
      ), false);
      return;
    }
    setPwdLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) flash(error.message, false);
    else { flash(tr("✓ Şifre değiştirildi", "✓ Passwort geändert")); setNewPwd(""); setConfPwd(""); }
    setPwdLoading(false);
  };

  // ── 2FA kurulumu başlat (ORT-03 düzeltmesi)
  const startMfaSetup = async () => {
    setMfaLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "FikoAI Authenticator",
      });
      if (error) throw error;
      if (data) {
        setMfaQr(data.totp.qr_code);
        setMfaSecret(data.totp.secret);
        setMfaFactorId(data.id);
        setMfaStep("verify");
      }
    } catch (e: any) {
      flash(tr("2FA kurulumu başarısız: " + e.message, "2FA-Setup fehlgeschlagen: " + e.message), false);
    }
    setMfaLoading(false);
  };

  // 2FA doğrulama
  const verifyMfa = async () => {
    if (!mfaFactorId || mfaVerifyCode.length !== 6) return;
    setMfaLoading(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.data.id,
        code: mfaVerifyCode,
      });
      if (verify.error) throw verify.error;

      setMfaEnabled(true);
      setMfaStep("idle");
      setMfaQr(null);
      setMfaVerifyCode("");
      flash(tr("✓ 2FA başarıyla etkinleştirildi!", "✓ 2FA erfolgreich aktiviert!"));
    } catch (e: any) {
      flash(tr("Doğrulama kodu hatalı!", "Verifizierungscode ungültig!"), false);
    }
    setMfaLoading(false);
  };

  // 2FA kaldır
  const disableMfa = async () => {
    if (!mfaFactorId) return;
    setMfaLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      if (error) throw error;
      setMfaEnabled(false);
      setMfaFactorId(null);
      flash(tr("✓ 2FA devre dışı bırakıldı", "✓ 2FA deaktiviert"));
    } catch (e: any) {
      flash(tr("Hata: " + e.message, "Fehler: " + e.message), false);
    }
    setMfaLoading(false);
  };

  // ── Parola güç göstergesi renkleri
  const strengthColor = pwdValidation.score <= 2 ? "#ef4444" : pwdValidation.score <= 3 ? "#f59e0b" : "#10b981";
  const strengthLabel = pwdValidation.score <= 2
    ? tr("Zayıf", "Schwach")
    : pwdValidation.score <= 3
      ? tr("Orta", "Mittel")
      : tr("Güçlü", "Stark");

  return (
    <div className="max-w-2xl space-y-4 fade-up">
      {/* Hesap Bilgileri */}
      <div className="c-card p-5">
        <div className="c-section-title flex items-center gap-1"><BookOpen size={12} /> {tr("Hesap Bilgileri", "Kontodaten")}</div>
        <div className="space-y-3">
          <div>
            <label className="c-label">E-Mail</label>
            <div className="flex items-center justify-between c-input" style={{ pointerEvents: "none" }}>
              <span className="text-slate-300">{userEmail}</span>
              <span className="text-[10px] font-bold badge-analyzed px-2 py-0.5 rounded-full">✓ {tr("Doğrulandı", "Verifiziert")}</span>
            </div>
          </div>
          <div>
            <label className="c-label">{tr("Rol", "Rolle")}</label>
            <div className="c-input" style={{ pointerEvents: "none", color: userRole === "admin" ? "#06b6d4" : "#64748b" }}>
              {userRole === "admin" ? "👑 Administrator" : "👤 Standard Benutzer"}
            </div>
          </div>
        </div>
      </div>

      {/* Şifre Değiştir — ORT-01 güçlendirilmiş */}
      <div className="c-card p-5">
        <div className="c-section-title flex items-center gap-1"><Shield size={12} /> {tr("Şifre Değiştir", "Passwort ändern")}</div>
        <div className="space-y-3">
          <div>
            <label className="c-label">{tr("Yeni Şifre", "Neues Passwort")}</label>
            <div className="relative">
              <input type={showPwd ? "text" : "password"} className="c-input pr-10" placeholder="••••••••" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 border-none cursor-pointer"
                style={{ background: "transparent", color: "#64748b" }}>
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {/* Parola güç göstergesi */}
            {newPwd && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "#1c1f27" }}>
                    <div className="h-1.5 rounded-full transition-all"
                      style={{ width: `${(pwdValidation.score / 5) * 100}%`, background: strengthColor }} />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: strengthColor }}>{strengthLabel}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  {[
                    { ok: pwdValidation.minLength, label: tr("Min. 8 karakter", "Mind. 8 Zeichen") },
                    { ok: pwdValidation.hasUppercase, label: tr("Büyük harf (A-Z)", "Großbuchstabe (A-Z)") },
                    { ok: pwdValidation.hasNumber, label: tr("Rakam (0-9)", "Zahl (0-9)") },
                    { ok: pwdValidation.hasSpecial, label: tr("Özel karakter (!@#)", "Sonderzeichen (!@#)") },
                  ].map((rule, i) => (
                    <span key={i} className="flex items-center gap-1" style={{ color: rule.ok ? "#10b981" : "#3a3f4a" }}>
                      {rule.ok ? <Check size={10} /> : <span style={{ width: 10, textAlign: "center" }}>○</span>} {rule.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="c-label">{tr("Şifre Tekrar", "Passwort wiederholen")}</label>
            <input type="password" className="c-input" placeholder="••••••••" value={confPwd} onChange={e => setConfPwd(e.target.value)} />
            {newPwd && confPwd && newPwd !== confPwd && (
              <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#ef4444" }}>
                <AlertTriangle size={12} /> {tr("Şifreler eşleşmiyor", "Passwörter stimmen nicht überein")}
              </p>
            )}
          </div>
          <button onClick={changePassword}
            disabled={pwdLoading || !newPwd || newPwd !== confPwd || !pwdValidation.isValid}
            className="c-btn-primary w-full py-3 text-sm rounded-md">
            {pwdLoading ? tr("Değiştiriliyor...", "Wird geändert...") : tr("Şifreyi Değiştir →", "Passwort ändern →")}
          </button>
        </div>
      </div>

      {/* 2FA Panel — ORT-03 düzeltmesi */}
      <div className="c-card p-5">
        <div className="c-section-title flex items-center gap-1"><ShieldCheck size={12} /> {tr("İki Faktörlü Doğrulama (2FA)", "Zwei-Faktor-Authentifizierung (2FA)")}</div>
        <p className="text-xs mb-3" style={{ color: "#64748b" }}>
          {tr(
            "Google Authenticator veya benzeri bir uygulama ile hesabınızı ekstra koruma altına alın.",
            "Schützen Sie Ihr Konto zusätzlich mit Google Authenticator oder einer ähnlichen App."
          )}
        </p>

        {mfaEnabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)" }}>
              <Check size={14} style={{ color: "#10b981" }} />
              <span className="text-sm font-semibold" style={{ color: "#10b981" }}>{tr("2FA Aktif", "2FA Aktiv")}</span>
            </div>
            <button onClick={disableMfa} disabled={mfaLoading}
              className="text-xs px-3 py-2 rounded-md border-none cursor-pointer transition-all"
              style={{ background: "rgba(239,68,68,.08)", color: "#f87171", border: "1px solid rgba(239,68,68,.2)" }}>
              {mfaLoading ? "..." : tr("2FA'yı Devre Dışı Bırak", "2FA deaktivieren")}
            </button>
          </div>
        ) : mfaStep === "verify" && mfaQr ? (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: "#94a3b8" }}>
              {tr("QR kodu Authenticator uygulamanızla tarayın:", "Scannen Sie den QR-Code mit Ihrer Authenticator-App:")}
            </p>
            <div className="flex justify-center p-4 rounded-md" style={{ background: "white" }}>
              <img src={mfaQr} alt="2FA QR" style={{ width: 180, height: 180 }} />
            </div>
            {mfaSecret && (
              <div className="text-center">
                <span className="text-[10px]" style={{ color: "#3a3f4a" }}>{tr("Manuel giriş:", "Manuelle Eingabe:")}</span>
                <code className="block text-xs font-mono mt-1 px-3 py-1.5 rounded" style={{ background: "#1c1f27", color: "#06b6d4", wordBreak: "break-all" }}>
                  {mfaSecret}
                </code>
              </div>
            )}
            <div>
              <label className="c-label">{tr("6 Haneli Doğrulama Kodu", "6-stelliger Verifizierungscode")}</label>
              <input type="text" className="c-input font-mono text-center text-lg tracking-widest"
                placeholder="000000" maxLength={6} value={mfaVerifyCode}
                onChange={e => setMfaVerifyCode(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setMfaStep("idle"); setMfaQr(null); }}
                className="c-btn-ghost flex-1 py-2 text-xs rounded-md">
                {tr("İptal", "Abbrechen")}
              </button>
              <button onClick={verifyMfa} disabled={mfaLoading || mfaVerifyCode.length !== 6}
                className="c-btn-primary flex-1 py-2 text-xs rounded-md">
                {mfaLoading ? "..." : tr("Doğrula ve Etkinleştir", "Verifizieren & Aktivieren")}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={startMfaSetup} disabled={mfaLoading}
            className="c-btn-primary w-full py-3 text-sm rounded-md flex items-center justify-center gap-2">
            <Smartphone size={14} />
            {mfaLoading ? "..." : tr("2FA Kurulumunu Başlat", "2FA-Setup starten")}
          </button>
        )}
      </div>

      {/* Güvenlik Durumu */}
      <div className="c-card p-5">
        <div className="c-section-title flex items-center gap-1"><Landmark size={12} /> {tr("Güvenlik Durumu", "Sicherheitsstatus")}</div>
        <div className="space-y-0">
          {[
            { label: "Supabase Auth", ok: true },
            { label: tr("E-posta Doğrulama", "E-Mail-Verifizierung"), ok: true },
            { label: tr("Bulut Ayar Yedek", "Cloud-Einstellungssicherung"), ok: true },
            { label: tr("2FA Doğrulama", "2-Faktor-Auth"), ok: mfaEnabled },
            { label: tr("Güçlü Parola Politikası", "Starke Passwortrichtlinie"), ok: true },
          ].map((item, i, arr) => (
            <div key={i} className="flex items-center justify-between py-3"
              style={{ borderBottom: i < arr.length - 1 ? "1px solid #1c1f27" : "none" }}>
              <span className="text-sm" style={{ color: "#64748b" }}>{item.label}</span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${item.ok ? "badge-analyzed" : ""} flex items-center gap-1`}
                style={!item.ok ? { background: "rgba(255,255,255,.04)", color: "#3a3f4a" } : {}}>
                {item.ok ? <><Check size={10} /> {tr("Aktif", "Aktiv")}</> : <><Clock size={10} /> {tr("Kapalı", "Inaktiv")}</>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
