import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight, Check, Loader2, Lock, X, FileText, ShieldAlert, Truck, AlertTriangle,
} from "lucide-react";
import { supabase } from "../services/supabaseService";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../constants";
import { useLang } from "../LanguageContext";
import { TubesBackground } from "./TubesBackground";
import { Modul, MODUL_TANIM } from "../services/moduller";
import { PrivacyPolicyPanel as PrivacyPolicyPanelInline } from "./PrivacyPolicyPanel";
import { DistanceSellingPanel as DistanceSellingPanelInline } from "./DistanceSellingPanel";
import { DeliveryReturnPanel as DeliveryReturnPanelInline } from "./DeliveryReturnPanel";

interface Props {
  token: string;
  onAuth: (session: any) => void;
  /** Davet tüketildikten veya geçersiz çıktıktan sonra normal giriş ekranına dön. */
  onGiriseDon: () => void;
}

type Durum = "dogrulaniyor" | "form" | "gecersiz" | "tamam";

const fnUrl = (ad: string) => `${SUPABASE_URL}/functions/v1/${ad}`;

/**
 * Davet linkiyle hesap açma ekranı (/app?davet=<token>).
 *
 * Hesap oluşturma tamamen `davet-kullan` Edge Function'ında, service-role ile
 * yapılır — bu ekran hiçbir yetki yazmaz, yalnızca formu toplar. Supabase'de
 * public signup kapalı olduğu için davetsiz bu ekrana ulaşmanın da bir anlamı
 * yoktur.
 */
export const DavetEkrani: React.FC<Props> = ({ token, onAuth, onGiriseDon }) => {
  const { t, lang, setLang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const [durum, setDurum] = useState<Durum>("dogrulaniyor");
  const [hata, setHata] = useState("");
  const [email, setEmail] = useState("");
  const [moduller, setModuller] = useState<Modul[]>([]);
  const [tip, setTip] = useState<"yeni" | "yukseltme">("yeni");

  // Form alanları — kayıt modalıyla aynı set
  const [sirketAdi, setSirketAdi] = useState("");
  const [vergiNo, setVergiNo] = useState("");
  const [adres, setAdres] = useState("");
  const [sehir, setSehir] = useState("");
  const [telefon, setTelefon] = useState("");
  const [sirketEposta, setSirketEposta] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const [kabulGizlilik, setKabulGizlilik] = useState(false);
  const [kabulMesafeli, setKabulMesafeli] = useState(false);
  const [kabulTeslimat, setKabulTeslimat] = useState(false);
  const [sozlesmeModal, setSozlesmeModal] = useState<"privacy" | "distance" | "delivery" | null>(null);

  const hepsiKabul = kabulGizlilik && kabulMesafeli && kabulTeslimat;

  // ── Token doğrulama ────────────────────────────────────────────
  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const r = await fetch(fnUrl("davet-dogrula"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ token }),
        });
        const d = await r.json().catch(() => ({}));
        if (iptal) return;
        if (!d?.gecerli) {
          setHata(d?.hata || tr("Geçersiz davet bağlantısı.", "Ungültiger Einladungslink."));
          setDurum("gecersiz");
          return;
        }
        setEmail(d.email || "");
        setModuller(Array.isArray(d.moduller) ? d.moduller : []);
        setTip(d.tip === "yukseltme" ? "yukseltme" : "yeni");
        if (d.sirket_adi) setSirketAdi(d.sirket_adi);
        setDurum("form");
      } catch {
        if (!iptal) {
          setHata(tr("Bağlantı kurulamadı.", "Verbindung fehlgeschlagen."));
          setDurum("gecersiz");
        }
      }
    })();
    return () => { iptal = true; };
  }, [token]);

  // ── Google ile devam ───────────────────────────────────────────
  // Müşteri davetlerinde şifre YOK: hesap Google OAuth ile açılır.
  // Form verisi yönlendirme boyunca kaybolmasın diye sessionStorage'a
  // yazılır; dönüşte oradan okunup davet tamamlanır.
  const FORM_ANAHTAR = `davet_form_${token}`;

  const formuTopla = () => ({
    sirket_adi: sirketAdi.trim(),
    tax_number: vergiNo.trim(),
    address: adres.trim(),
    city: sehir.trim(),
    phone: telefon.trim(),
    company_email: sirketEposta.trim(),
  });

  /** Oturum açıkken daveti harcar (OAuth dönüşü ya da zaten girişli kullanıcı). */
  const googleIleTamamla = async (form: Record<string, string>) => {
    setGonderiliyor(true);
    setHata("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setHata(tr("Google oturumu bulunamadı. Tekrar deneyin.", "Google-Sitzung nicht gefunden."));
        setGonderiliyor(false);
        return;
      }

      const r = await fetch(fnUrl("davet-kullan"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Kullanıcının KENDİ token'ı — sunucu kimliği buradan çözer ve
          // davet e-postasıyla eşleşmiyorsa reddeder.
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ...form, token, mod: "google", sozlesmeler: true }),
      });
      const d = await r.json().catch(() => ({}));

      if (!d?.success) {
        setHata(d?.error || tr("İşlem tamamlanamadı.", "Vorgang fehlgeschlagen."));
        setGonderiliyor(false);
        // Yanlış Google hesabıyla girildiyse oturumu bırakma — kullanıcı
        // doğru hesapla yeniden deneyebilsin.
        try {
          sessionStorage.removeItem(FORM_ANAHTAR);
          sessionStorage.removeItem("davet_bekleyen");
        } catch {}
        return;
      }

      try {
        sessionStorage.removeItem(FORM_ANAHTAR);
        sessionStorage.removeItem("davet_bekleyen");
      } catch {}
      try { window.history.replaceState({}, "", "/app"); } catch {}
      onAuth(session);
    } catch (e: any) {
      setHata(e?.message || tr("Beklenmeyen hata.", "Unerwarteter Fehler."));
      setGonderiliyor(false);
    }
  };

  // OAuth dönüşü: oturum var ve bekleyen form varsa daveti otomatik tamamla.
  useEffect(() => {
    if (durum !== "form" || tip !== "yeni") return;
    let iptal = false;
    (async () => {
      let bekleyen: string | null = null;
      try { bekleyen = sessionStorage.getItem(FORM_ANAHTAR); } catch {}
      if (!bekleyen) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (iptal || !session) return;
      googleIleTamamla(JSON.parse(bekleyen));
    })();
    return () => { iptal = true; };
  }, [durum, tip]);

  // ── Gönder ─────────────────────────────────────────────────────
  const gonder = async () => {
    setHata("");

    // Yükseltme davetinde şirket formu ve Google adımı yok.
    if (tip === "yukseltme") {
      setGonderiliyor(true);
      try {
        const r = await fetch(fnUrl("davet-kullan"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ token }),
        });
        const d = await r.json().catch(() => ({}));
        if (!d?.success) {
          setHata(d?.error || tr("İşlem tamamlanamadı.", "Vorgang fehlgeschlagen."));
          setGonderiliyor(false);
          return;
        }
        setDurum("tamam");
        setGonderiliyor(false);
      } catch (e: any) {
        setHata(e?.message || tr("Beklenmeyen hata.", "Unerwarteter Fehler."));
        setGonderiliyor(false);
      }
      return;
    }

    if (!sirketAdi.trim()) { setHata(t.companyRequired); return; }
    if (!hepsiKabul) {
      setHata(tr(
        "Devam etmek için tüm sözleşmeleri onaylamanız gerekmektedir.",
        "Sie müssen alle Vereinbarungen akzeptieren, um fortzufahren.",
      ));
      return;
    }

    const form = formuTopla();

    // Kullanıcı zaten doğru Google hesabıyla girişliyse yönlendirmeye gerek yok.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email?.toLowerCase() === email.toLowerCase()) {
      await googleIleTamamla(form);
      return;
    }

    try {
      sessionStorage.setItem(FORM_ANAHTAR, JSON.stringify(form));
      // Yönlendirme token'ı düşürürse App.tsx buradan kurtarır.
      sessionStorage.setItem("davet_bekleyen", JSON.stringify({ token, ts: Date.now() }));
    } catch {}
    setGonderiliyor(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Token'ı koru: dönüşte aynı davet ekranına düşmeliyiz.
        redirectTo: `${window.location.origin}/app?davet=${encodeURIComponent(token)}`,
        // Davet edilen adresi öner — yanlış hesapla girme ihtimalini azaltır.
        queryParams: { login_hint: email, prompt: "select_account" },
      },
    });
    if (error) {
      setHata(error.message);
      setGonderiliyor(false);
    }
  };

  // ── Ortak kabuk ────────────────────────────────────────────────
  const Kabuk: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: "rgb(7,11,20)" }}>
      <div className="absolute inset-0 z-0 pointer-events-auto"><TubesBackground /></div>
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        backgroundImage: "linear-gradient(rgba(124,92,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,92,255,.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      <div className="absolute top-5 right-5 pt-safe flex items-center gap-2 z-20">
        {(["tr", "de"] as const).map((l) => (
          <button key={l} onClick={() => setLang(l)}
            className="font-syne px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer transition-all border"
            style={lang === l
              ? { background: "#7c5cff", color: "#fff", borderColor: "#7c5cff" }
              : { background: "transparent", color: "#3a3f4a", borderColor: "#1c1f27" }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="relative z-10 w-full min-h-screen flex items-center justify-center p-4 py-10 pt-safe overflow-y-auto">
        {children}
      </div>
    </div>
  );

  const kart = (icerik: React.ReactNode, genislik = 540) => (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      style={{
        width: "100%", maxWidth: genislik, borderRadius: 22, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.11)",
        background: "rgba(13,15,21,0.94)", backdropFilter: "blur(28px)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ height: 4, background: "linear-gradient(90deg,#06b6d4,#8b5cf6,#ec4899)" }} />
      {icerik}
    </motion.div>
  );

  // ── Doğrulanıyor ───────────────────────────────────────────────
  if (durum === "dogrulaniyor") {
    return (
      <Kabuk>
        {kart(
          <div style={{ padding: "44px 32px", textAlign: "center" }}>
            <Loader2 size={26} className="animate-spin" style={{ color: "#06b6d4", margin: "0 auto 14px" }} />
            <div style={{ color: "rgba(255,255,255,.6)", fontSize: 13.5 }}>
              {tr("Davet doğrulanıyor...", "Einladung wird geprüft...")}
            </div>
          </div>, 400)}
      </Kabuk>
    );
  }

  // ── Geçersiz ───────────────────────────────────────────────────
  if (durum === "gecersiz") {
    return (
      <Kabuk>
        {kart(
          <div style={{ padding: "34px 32px", textAlign: "center" }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#f87171",
            }}>
              <AlertTriangle size={20} />
            </div>
            <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 17, margin: 0, fontFamily: "'Syne', sans-serif" }}>
              {tr("Davet kullanılamıyor", "Einladung nicht verwendbar")}
            </h3>
            <p style={{ color: "rgba(255,255,255,.45)", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>{hata}</p>
            <button
              onClick={onGiriseDon}
              className="c-btn-primary"
              style={{ width: "100%", marginTop: 22, padding: "12px 0", borderRadius: 11, fontSize: 13.5, fontWeight: 700 }}
            >
              {tr("Giriş ekranına dön", "Zur Anmeldung")}
            </button>
          </div>, 420)}
      </Kabuk>
    );
  }

  // ── Tamamlandı (otomatik giriş olmadıysa / yükseltme) ──────────
  if (durum === "tamam") {
    return (
      <Kabuk>
        {kart(
          <div style={{ padding: "34px 32px", textAlign: "center" }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.25)", color: "#10b981",
            }}>
              <Check size={22} strokeWidth={3} />
            </div>
            <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 17, margin: 0, fontFamily: "'Syne', sans-serif" }}>
              {tip === "yukseltme"
                ? tr("Paketiniz açıldı", "Ihr Paket ist freigeschaltet")
                : tr("Hesabınız hazır", "Ihr Konto ist bereit")}
            </h3>
            <p style={{ color: "rgba(255,255,255,.45)", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
              {tr("Giriş yaparak devam edebilirsiniz.", "Sie können sich jetzt anmelden.")}
            </p>
            <button
              onClick={onGiriseDon}
              className="c-btn-primary"
              style={{ width: "100%", marginTop: 22, padding: "12px 0", borderRadius: 11, fontSize: 13.5, fontWeight: 700 }}
            >
              {tr("Giriş Yap", "Anmelden")}
            </button>
          </div>, 420)}
      </Kabuk>
    );
  }

  // ── Form ───────────────────────────────────────────────────────
  return (
    <Kabuk>
      {kart(
        <>
          {/* Başlık */}
          <div style={{
            padding: "26px 30px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "linear-gradient(135deg, rgba(6,182,212,0.06) 0%, transparent 55%)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
              <img src="/logo.png" alt="FikoAI" style={{ width: 30, height: 30, borderRadius: 9, objectFit: "contain" }} />
              <span className="font-syne" style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>FikoAI</span>
            </div>
            <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 19, margin: 0, fontFamily: "'Syne', sans-serif" }}>
              {tip === "yukseltme"
                ? tr("Paket onayı", "Paketbestätigung")
                : tr("Hesabınızı oluşturun", "Erstellen Sie Ihr Konto")}
            </h3>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12.5, marginTop: 5 }}>{email}</p>
          </div>

          {/* Açılan modüller */}
          <div style={{ padding: "20px 30px 4px" }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase",
              color: "rgba(255,255,255,.3)", marginBottom: 11,
            }}>
              {tr("Size açılan alanlar", "Für Sie freigeschaltet")}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {moduller.map((m) => {
                const md = MODUL_TANIM[m];
                if (!md) return null;
                return (
                  <div key={m} style={{
                    padding: "11px 13px", borderRadius: 11,
                    border: "1px solid rgba(255,255,255,.07)", borderLeft: `3px solid ${md.renk}`,
                    background: "rgba(255,255,255,.02)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Check size={13} strokeWidth={3} style={{ color: md.renk, flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>{md.ad[lang]}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.4)", marginTop: 4, lineHeight: 1.55, paddingLeft: 20 }}>
                      {md.aciklama[lang]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gövde */}
          <div style={{ padding: "18px 30px 30px" }}>
            {hata && (
              <div style={{
                marginBottom: 14, padding: "10px 14px", borderRadius: 10,
                background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)",
                color: "#f87171", fontSize: 12.5,
              }}>{hata}</div>
            )}

            {tip === "yeni" && (
              <>
                <div style={{
                  marginBottom: 14, padding: "10px 13px", borderRadius: 10,
                  background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.22)",
                  color: "#67e8f9", fontSize: 12, lineHeight: 1.5,
                }}>
                  {tr(
                    `Hesabınız Google ile açılır — şifre belirlemenize gerek yok. ${email} adresine bağlı Google hesabıyla giriş yapın.`,
                    `Ihr Konto wird mit Google erstellt — kein Passwort nötig. Melden Sie sich mit dem Google-Konto von ${email} an.`,
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
                    <div style={{ flex: 1, height: 1, background: "#1c1f27" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".15em", color: "#06b6d4" }}>
                      {t.companyInfo}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "#1c1f27" }} />
                  </div>

                  <div>
                    <label className="c-label">{t.companyName} *</label>
                    <div className="glow-wrap">
                      <input type="text" className="c-input" placeholder="GmbH / UG / e.K."
                        value={sirketAdi} onChange={(e) => setSirketAdi(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="c-label">{t.taxNumber}</label>
                      <div className="glow-wrap">
                        <input type="text" className="c-input" placeholder="DE123..."
                          value={vergiNo} onChange={(e) => setVergiNo(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="c-label">{t.city}</label>
                      <div className="glow-wrap">
                        <input type="text" className="c-input" placeholder="Berlin"
                          value={sehir} onChange={(e) => setSehir(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="c-label">{t.address}</label>
                    <div className="glow-wrap">
                      <input type="text" className="c-input" placeholder="Musterstraße 1"
                        value={adres} onChange={(e) => setAdres(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="c-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {tr("Ülke", "Land")} <Lock size={9} style={{ color: "#374151" }} />
                    </label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, lineHeight: 1, pointerEvents: "none" }}>🇩🇪</span>
                      <input type="text" className="c-input" value="Deutschland" readOnly
                        style={{ paddingLeft: 36, cursor: "not-allowed", background: "rgba(6,182,212,.04)", borderColor: "rgba(6,182,212,.15)", color: "#9ca3af", userSelect: "none" }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="c-label">{t.phone}</label>
                      <div className="glow-wrap">
                        <input type="text" className="c-input" placeholder="+49..."
                          value={telefon} onChange={(e) => setTelefon(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="c-label">{t.companyEmail}</label>
                      <div className="glow-wrap">
                        <input type="email" className="c-input" placeholder="info@firma.de"
                          value={sirketEposta} onChange={(e) => setSirketEposta(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sözleşmeler */}
                <div style={{
                  marginTop: 18, padding: 15, borderRadius: 13,
                  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)",
                }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 11 }}>
                    {tr("Sözleşme Onayları", "Vertragsbestätigungen")}
                  </p>
                  {([
                    { key: "privacy" as const, state: kabulGizlilik, setter: setKabulGizlilik, icon: <ShieldAlert size={13} />, label: tr("Gizlilik ve Kişisel Verilerin Korunması Sözleşmesi", "Datenschutzvereinbarung") },
                    { key: "distance" as const, state: kabulMesafeli, setter: setKabulMesafeli, icon: <FileText size={13} />, label: tr("Mesafeli Satış Sözleşmesi", "Fernabsatzvertrag") },
                    { key: "delivery" as const, state: kabulTeslimat, setter: setKabulTeslimat, icon: <Truck size={13} />, label: tr("Teslimat ve İade Şartları", "Liefer- und Rückgabebedingungen") },
                  ]).map(({ key, state, setter, icon, label }) => (
                    <label key={key} style={{
                      display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 9,
                      cursor: "pointer", fontSize: 12.5,
                      color: state ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)",
                    }}>
                      <input type="checkbox" checked={state} onChange={(e) => setter(e.target.checked)}
                        style={{ marginTop: 2, accentColor: "#06b6d4", cursor: "pointer" }} />
                      <span>
                        {icon}{" "}
                        <button type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSozlesmeModal(key); }}
                          style={{ background: "none", border: "none", color: "#06b6d4", cursor: "pointer", textDecoration: "underline", fontSize: 12.5, padding: 0 }}>
                          {label}
                        </button>
                        {tr("'ni okudum ve kabul ediyorum.", " gelesen und akzeptiert.")}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              onClick={gonder}
              disabled={gonderiliyor || (tip === "yeni" && !hepsiKabul)}
              style={{
                width: "100%", marginTop: 22, padding: 14, borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #06b6d4, #7c5cff)", color: "#fff",
                fontSize: 14, fontWeight: 700,
                cursor: (gonderiliyor || (tip === "yeni" && !hepsiKabul)) ? "not-allowed" : "pointer",
                opacity: (gonderiliyor || (tip === "yeni" && !hepsiKabul)) ? 0.5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: "0 4px 18px rgba(6,182,212,0.25)",
              }}
            >
              {gonderiliyor
                ? <><Loader2 size={16} className="animate-spin" /> {t.loading}</>
                : <>
                    {tip === "yukseltme"
                      ? tr("Onayla ve Aç", "Bestätigen und freischalten")
                      : tr("Google ile devam et", "Mit Google fortfahren")}
                    <ArrowRight size={16} />
                  </>}
            </motion.button>

            <button
              onClick={onGiriseDon}
              style={{
                width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 10,
                background: "transparent", border: "1px solid rgba(255,255,255,.07)",
                color: "rgba(255,255,255,.35)", fontSize: 12, cursor: "pointer",
              }}
            >
              {tr("Zaten hesabım var — giriş yap", "Ich habe bereits ein Konto — anmelden")}
            </button>
          </div>
        </>,
      )}

      {/* Sözleşme önizleme modalı — AuthScreen'dekiyle aynı bileşenler */}
      {sozlesmeModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 60, display: "flex",
            alignItems: "center", justifyContent: "center", padding: 16,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
          }}
          onClick={() => setSozlesmeModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 700, maxHeight: "80vh", overflowY: "auto",
              borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "rgb(17,19,24)",
            }}
          >
            <div style={{
              position: "sticky", top: 0, zIndex: 1, padding: "16px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgb(17,19,24)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
                {sozlesmeModal === "privacy" && tr("Gizlilik Sözleşmesi", "Datenschutzvereinbarung")}
                {sozlesmeModal === "distance" && tr("Mesafeli Satış Sözleşmesi", "Fernabsatzvertrag")}
                {sozlesmeModal === "delivery" && tr("Teslimat ve İade Şartları", "Liefer- und Rückgabebedingungen")}
              </span>
              <button onClick={() => setSozlesmeModal(null)}
                style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex" }}>
                <X size={16} />
              </button>
            </div>
            {sozlesmeModal === "privacy" && <PrivacyPolicyPanelInline />}
            {sozlesmeModal === "distance" && <DistanceSellingPanelInline />}
            {sozlesmeModal === "delivery" && <DeliveryReturnPanelInline />}
          </div>
        </div>
      )}
    </Kabuk>
  );
};
