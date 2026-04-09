/**
 * Admin → Yeni Kullanıcı Oluşturma Modalı
 * Login ekranındaki kayıt formunun aynısı + "Fatura Kredisi" alanı.
 *
 * Not: Yöneticinin oturumunun bozulmaması için signUp çağrısı,
 * persistSession:false olan ayrı bir Supabase istemcisi üzerinden yapılır.
 */
import React, { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Loader2, X, ArrowRight, ShieldAlert, FileText, Truck, Lock } from "lucide-react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../../constants";
import { supabase } from "../../services/supabaseService";
import { useLang } from "../../LanguageContext";

interface Props {
  onClose: () => void;
  onCreated?: () => void;
}

export const AdminCreateUserModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  // Hesap
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");

  // Şirket
  const [companyName, setCompanyName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");

  // Fatura kredisi (admin tarafından atanır)
  const [invoiceCredits, setInvoiceCredits] = useState<number>(0);

  // Sözleşmeler — admin oluşturduğunda varsayılan onaylı
  const [acceptPrivacy, setAcceptPrivacy] = useState(true);
  const [acceptDistanceSelling, setAcceptDistanceSelling] = useState(true);
  const [acceptDeliveryReturn, setAcceptDeliveryReturn] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Yöneticinin oturumunu bozmamak için ayrı client
  const tmpClient = useMemo(
    () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    []
  );

  const submit = async () => {
    setError("");
    if (!companyName.trim()) { setError(tr("Şirket adı gerekli", "Firmenname erforderlich")); return; }
    if (!regEmail.trim()) { setError(tr("E-posta gerekli", "E-Mail erforderlich")); return; }
    if (regPassword.length < 8) { setError(tr("Şifre en az 8 karakter olmalı", "Passwort min. 8 Zeichen")); return; }
    if (regPassword !== regPassword2) { setError(tr("Şifreler eşleşmiyor", "Passwörter stimmen nicht überein")); return; }
    if (!acceptPrivacy || !acceptDistanceSelling || !acceptDeliveryReturn) {
      setError(tr("Tüm sözleşmeler onaylanmalı", "Alle Vereinbarungen müssen akzeptiert werden"));
      return;
    }
    if (!Number.isFinite(invoiceCredits) || invoiceCredits < 0) {
      setError(tr("Fatura kredisi 0 veya pozitif olmalı", "Rechnungsguthaben muss ≥ 0 sein"));
      return;
    }

    setLoading(true);
    try {
      // 1) Auth kullanıcısı oluştur (ayrı client → admin oturumu etkilenmez)
      const { data, error: signErr } = await tmpClient.auth.signUp({
        email: regEmail.trim(),
        password: regPassword,
      });
      if (signErr) throw signErr;
      const newUserId = data.user?.id;
      if (!newUserId) throw new Error(tr("Kullanıcı oluşturulamadı", "Benutzer konnte nicht erstellt werden"));

      // 2) companies kaydı (admin oturumu → asıl client)
      const { error: coErr } = await supabase.from("companies").insert({
        user_id: newUserId,
        company_name: companyName.trim(),
        tax_number: taxNumber.trim(),
        address: companyAddress.trim(),
        city: companyCity.trim(),
        phone: companyPhone.trim(),
        email: companyEmail.trim() || regEmail.trim(),
        invoice_credits: invoiceCredits,
      });
      if (coErr) throw coErr;

      // 3) Sözleşme onayları
      try {
        await supabase.from("user_agreements").insert([
          { user_id: newUserId, agreement_type: "privacy_policy" },
          { user_id: newUserId, agreement_type: "distance_selling" },
          { user_id: newUserId, agreement_type: "delivery_return" },
        ]);
      } catch (e) {
        console.warn("user_agreements skipped:", e);
      }

      // tmpClient oturumunu temizle
      try { await tmpClient.auth.signOut(); } catch {}

      onCreated?.();
      onClose();
    } catch (e: any) {
      setError(e.message || tr("Hata oluştu", "Fehler"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto",
          borderRadius: 20, border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(13,15,21,0.97)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "24px 28px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          background: "linear-gradient(135deg, rgba(6,182,212,0.06) 0%, transparent 50%)",
        }}>
          <div>
            <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 18, margin: 0, fontFamily: "'Syne', sans-serif" }}>
              {tr("Yeni Kullanıcı Oluştur", "Neuen Benutzer anlegen")}
            </h3>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 }}>
              {tr("Yönetici tarafından hesap oluşturma — kullanıcı doğrudan giriş yapabilir.",
                  "Administrator-Konto­erstellung — Benutzer kann sich direkt anmelden.")}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "rgba(255,255,255,0.5)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px 28px 28px" }}>
          {error && (
            <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#f87171", fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="c-label">{tr("E-posta", "E-Mail")}</label>
              <div className="glow-wrap">
                <input type="email" className="c-input" placeholder="name@firma.de"
                  value={regEmail} onChange={e => setRegEmail(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="c-label">{tr("Şifre", "Passwort")}</label>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#1c1f27" }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "#06b6d4" }}>
                {tr("Şirket Bilgileri", "Firmendaten")}
              </span>
              <div style={{ flex: 1, height: 1, background: "#1c1f27" }} />
            </div>

            <div>
              <label className="c-label">{tr("Şirket Adı", "Firmenname")} *</label>
              <div className="glow-wrap">
                <input type="text" className="c-input" placeholder="GmbH / UG / e.K."
                  value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="c-label">{tr("Vergi No", "Steuernummer")}</label>
                <div className="glow-wrap">
                  <input type="text" className="c-input" placeholder="DE123..."
                    value={taxNumber} onChange={e => setTaxNumber(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="c-label">{tr("Şehir", "Stadt")}</label>
                <div className="glow-wrap">
                  <input type="text" className="c-input" placeholder="Berlin"
                    value={companyCity} onChange={e => setCompanyCity(e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <label className="c-label">{tr("Adres", "Adresse")}</label>
              <div className="glow-wrap">
                <input type="text" className="c-input" placeholder="Musterstraße 1"
                  value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="c-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {tr("Ülke", "Land")}
                <Lock size={9} style={{ color: "#374151" }} />
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, lineHeight: 1, pointerEvents: "none" }}>🇩🇪</span>
                <input type="text" className="c-input" value="Deutschland" readOnly
                  style={{ paddingLeft: 36, cursor: "not-allowed", background: "rgba(6,182,212,.04)", borderColor: "rgba(6,182,212,.15)", color: "#9ca3af", userSelect: "none" }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="c-label">{tr("Telefon", "Telefon")}</label>
                <div className="glow-wrap">
                  <input type="text" className="c-input" placeholder="+49..."
                    value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="c-label">{tr("Şirket E-postası", "Firmen-E-Mail")}</label>
                <div className="glow-wrap">
                  <input type="email" className="c-input" placeholder="info@firma.de"
                    value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#1c1f27" }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "#f59e0b" }}>
                {tr("Fatura Kredisi", "Rechnungsguthaben")}
              </span>
              <div style={{ flex: 1, height: 1, background: "#1c1f27" }} />
            </div>

            <div>
              <label className="c-label">
                {tr("Fatura Kredisi (adet)", "Rechnungsguthaben (Anzahl)")}
              </label>
              <div className="glow-wrap">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="c-input"
                  placeholder="0"
                  value={invoiceCredits}
                  onChange={e => setInvoiceCredits(parseInt(e.target.value || "0", 10))}
                />
              </div>
              <p style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                {tr("Kullanıcının analiz edebileceği fatura adedi. Sonradan düzenlenebilir.",
                    "Anzahl der Rechnungen, die der Benutzer analysieren darf. Später anpassbar.")}
              </p>
            </div>
          </div>

          {/* Sözleşme onayları (admin oluşturduğunda varsayılan onaylı, gizli görünüm) */}
          <div style={{
            marginTop: 18, padding: 14, borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)",
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
              {tr("Sözleşme Onayları", "Vertragsbestätigungen")}
            </p>
            {([
              { state: acceptPrivacy, setter: setAcceptPrivacy, icon: <ShieldAlert size={13} />, label: tr("Gizlilik Sözleşmesi", "Datenschutz") },
              { state: acceptDistanceSelling, setter: setAcceptDistanceSelling, icon: <FileText size={13} />, label: tr("Mesafeli Satış Sözleşmesi", "Fernabsatzvertrag") },
              { state: acceptDeliveryReturn, setter: setAcceptDeliveryReturn, icon: <Truck size={13} />, label: tr("Teslimat ve İade Şartları", "Liefer- und Rückgabe") },
            ]).map((row, i) => (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, fontSize: 12, color: row.state ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                <input type="checkbox" checked={row.state} onChange={e => row.setter(e.target.checked)} style={{ accentColor: "#06b6d4" }} />
                {row.icon}
                <span>{row.label}</span>
              </label>
            ))}
          </div>

          <button
            onClick={submit}
            disabled={loading}
            style={{
              width: "100%", marginTop: 22, padding: 14, borderRadius: 12,
              border: "none",
              background: loading ? "rgba(6,182,212,0.4)" : "linear-gradient(135deg, #06b6d4, #0891b2)",
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 18px rgba(6,182,212,0.3)",
            }}
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> {tr("Oluşturuluyor...", "Wird erstellt...")}</>
              : <>{tr("Kullanıcıyı Oluştur", "Benutzer anlegen")} <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminCreateUserModal;
