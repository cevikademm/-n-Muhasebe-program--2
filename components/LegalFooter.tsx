import React, { useState } from "react";
import { ShieldCheck, X, Lock, CheckCircle2, FileCheck, Award } from "lucide-react";
import { AboutUsPanel } from "./AboutUsPanel";
import { DeliveryReturnPanel } from "./DeliveryReturnPanel";
import { PrivacyPolicyPanel } from "./PrivacyPolicyPanel";
import { DistanceSellingPanel } from "./DistanceSellingPanel";
import { useLang } from "../LanguageContext";

interface LegalFooterProps {
  onNavigate: (key: string) => void;
}

export function LegalModal({ onClose, children, title, icon: Icon }: { onClose: () => void, children: React.ReactNode, title?: string, icon?: React.ElementType }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
      style={{ background: "rgba(5, 8, 15, 0.8)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] rounded-[24px] overflow-hidden flex flex-col slide-down shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          background: "linear-gradient(180deg, #11151e 0%, #0a0d14 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(6, 182, 212, 0.1) inset"
        }}
      >
        {/* Glow Effects */}
        <div style={{ position: "absolute", top: -100, left: -100, width: 300, height: 300, background: "radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -100, right: -100, width: 300, height: 300, background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02] relative z-10 shrink-0">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Icon size={20} />
              </div>
            )}
            <h2 className="text-lg md:text-xl font-syne font-bold font-syne text-white tracking-wide">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-slate-400 transition-all flex items-center justify-center cursor-pointer"
            title="Kapat"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 w-full h-full overflow-y-auto px-6 py-6 custom-scrollbar relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
}

export function SecurityCertificatesModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang();
  
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5, 8, 15, 0.8)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl mx-4 rounded-[24px] border border-slate-700/60 p-1 overflow-hidden slide-down"
        style={{ 
          background: "linear-gradient(165deg, #1e2433 0%, #11151e 100%)",
          boxShadow: "0 30px 60px -15px rgba(0,0,0,0.8), 0 0 0 1px rgba(16,185,129,0.1) inset"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="bg-[#0b0e14]/60 backdrop-blur-xl w-full h-full rounded-[22px] p-6 md:p-8 relative z-10 border border-white/5">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-slate-400 hover:text-white bg-white/5 hover:bg-red-500/20 hover:text-red-400 p-2 rounded-full transition-all cursor-pointer"
            title="Kapat"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col items-center text-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-400/20 blur-xl rounded-full" />
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center relative bg-gradient-to-br from-[#10b981] to-[#059669] shadow-[0_0_20px_rgba(16,185,129,0.4)] border border-emerald-300/30">
                <ShieldCheck className="text-white" size={32} />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-bold font-syne text-white tracking-wide">
                {t.certificates}
              </h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto">
                {lang === "tr" 
                  ? "Sistemimiz ve veritabanımız endüstri standartlarında en üst düzey güvenlik sertifikaları ile korunmaktadır." 
                  : "Unser System und unsere Datenbank sind durch branchenübliche Sicherheitszertifikate geschützt."}
              </p>
            </div>

            <div className="w-full grid gap-3 mt-2 text-left">
              {/* SSL */}
              <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-colors">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
                  <Lock size={20} />
                </div>
                <div>
                  <h4 className="text-white font-semibold text-sm mb-1">{t.sslCertificate}</h4>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    <span className="text-emerald-400 font-medium">256-bit TLS 1.3</span> {lang === "tr" ? "şifreleme ile ağ trafiğiniz uçtan uca güven altına alınmıştır. İyzico altyapısıyla ödemeleriniz korunur." : "Verschlüsselung sichert Ihren Netzwerkverkehr. Ihre Zahlungen sind durch die Iyzico-Infrastruktur geschützt."}
                  </p>
                </div>
              </div>

              {/* ISO */}
              <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors">
                <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg shrink-0">
                  <Award size={20} />
                </div>
                <div>
                  <h4 className="text-white font-semibold text-sm mb-1">{t.isoCertificate}</h4>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    {lang === "tr" ? "Bulut altyapımız " : "Unsere Cloud-Infrastruktur ist "} <span className="text-cyan-400 font-medium">ISO/IEC 27001</span> {lang === "tr" ? " bilgi güvenliği yönetimi standartlarına uygun veri merkezlerinde barındırılmaktadır." : "zertifiziert und wird in Rechenzentren gehostet, die den Standards entsprechen."}
                  </p>
                </div>
              </div>

              {/* GDPR */}
              <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-purple-500/30 transition-colors">
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg shrink-0">
                  <FileCheck size={20} />
                </div>
                <div>
                  <h4 className="text-white font-semibold text-sm mb-1">{t.gdprCompliant}</h4>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    {lang === "tr" ? "Verileriniz " : "Ihre Daten sind "}<span className="text-purple-400 font-medium">GDPR (DSGVO) ve KVKK</span> {lang === "tr" ? "standartlarıyla tam uyumlu şekilde, Row Level Security (RLS) katmanıyla sıkı sıkıya izole edilmiştir." : "konform und durch Row Level Security (RLS) streng isoliert."}
                  </p>
                </div>
              </div>

              {/* GoBD */}
              <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-orange-500/30 transition-colors">
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="text-white font-semibold text-sm mb-1">{t.gobdCompliant}</h4>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    {lang === "tr" ? "Muhasebe kayıtlarınız alman vergi yasaları " : "Ihre Buchhaltungsunterlagen entsprechen den deutschen "} <span className="text-orange-400 font-medium">GoBD</span> {lang === "tr" ? " standartlarına uygun şekilde, değiştirilemez ve izlenebilir bir yapıda saklanır." : " Grundsätzen zur Verarbeitungs- und Ordnungsmäßigkeit."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <ShieldCheck className="text-emerald-400" size={16} />
              <span className="text-xs font-bold font-mono tracking-widest text-emerald-400 uppercase">
                {lang === "tr" ? "TAM KORUMA ALTINDASINIZ" : "VOLLSTÄNDIGER SCHUTZ"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LegalFooter({ onNavigate }: LegalFooterProps) {
  const { t, lang } = useLang();
  const [showSSL, setShowSSL] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Ortak stil buton hover için
  const linkStyle = "text-left hover:text-cyan-400 transition-colors w-max cursor-pointer decoration-cyan-400/30 hover:underline underline-offset-4";

  return (
    <div className="w-full mt-auto relative" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "#0a0d14", zIndex: 10 }}>
      {/* Background soft glow */}
      <div className="absolute top-0 inset-x-0 h-[100px] bg-gradient-to-b from-cyan-900/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-10 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-16 items-start md:items-center">

          {/* Links Section */}
          <div className="flex flex-col gap-3 text-sm text-slate-400">
            <h4 className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2 font-syne">{lang === "tr" ? "Yasal" : "Rechtliches"}</h4>
            <button
              onClick={() => setActiveModal("about")}
              className={linkStyle}
            >
              {t.about}
            </button>
            <button
              onClick={() => setActiveModal("deliveryReturn")}
              className={linkStyle}
            >
              {t.deliveryReturn}
            </button>
            <button
              onClick={() => setActiveModal("privacy")}
              className={linkStyle}
            >
              {t.privacy}
            </button>
            <button
              onClick={() => setActiveModal("distanceSelling")}
              className={linkStyle}
            >
              {t.distanceSelling}
            </button>
          </div>

          {/* Badges / Logos Section */}
          <div className="flex flex-col items-center justify-center gap-5">
            {/* Certifications Badge */}
            <button
              onClick={() => setShowSSL(true)}
              className="group relative flex items-center justify-center cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-center gap-2.5 bg-[#11151e] px-5 py-2.5 rounded-full border border-slate-700/80 group-hover:border-emerald-500/40 group-hover:bg-[#151a25] transition-all">
                <ShieldCheck className="text-emerald-400" size={20} />
                <span className="text-[11px] font-bold tracking-widest text-slate-200 uppercase font-syne flex items-center gap-2">
                  <span>{t.certificates}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-600" />
                  <span className="text-emerald-400">SSL</span>
                </span>
              </div>
            </button>

            {showSSL && <SecurityCertificatesModal onClose={() => setShowSSL(false)} />}
            
            <div className="text-xs text-slate-500/80 mt-2 font-mono flex items-center gap-2">
              © {new Date().getFullYear()} FikoAI. <span className="hidden sm:inline">{lang === "tr" ? "Tüm hakları saklıdır." : "Alle Rechte vorbehalten."}</span>
            </div>
          </div>

          {/* Payment Providers Section */}
          <div className="flex flex-col items-end gap-3">
             <h4 className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-2 font-syne">{lang === "tr" ? "Ödeme" : "Zahlung"}</h4>
             <div className="flex flex-wrap items-center justify-end gap-3 opacity-80 hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 shadow-inner" title="Visa">
                <svg width="40" height="13" viewBox="0 0 40 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14.9442 0.334473L9.82227 12.3345H5.85827L7.69627 7.76647L3.48327 0.334473H7.81827L10.3703 6.64347L10.7493 6.64347L13.8863 0.334473H14.9442Z" fill="white"/>
                  <path d="M19.1412 0.334473H15.6592V12.3345H19.1412V0.334473Z" fill="white"/>
                  <path d="M29.6201 12.3345L27.4211 4.75747L27.0541 4.75747L24.3641 12.3345H20.4491L24.5021 0.334473H28.7841L33.4071 12.3345H29.6201ZM27.2401 2.36847L27.1811 2.36847L25.4201 8.86847H28.9481L27.2401 2.36847Z" fill="white"/>
                  <path d="M39.6922 4.19547C39.6922 1.63647 37.4722 0.177473 35.1512 0.177473C33.4732 0.177473 31.8102 0.826473 30.6862 1.95047L32.1642 4.17847C33.0232 3.42447 34.0042 3.01247 35.0682 3.01247C36.1432 3.01247 36.6972 3.51847 36.6972 4.09747C36.6972 6.57847 30.9322 5.56847 30.9322 9.60847C30.9322 11.5545 32.5402 12.5695 34.6972 12.5695C36.4352 12.5695 37.9902 11.9675 39.2992 10.9665L37.9002 8.71847C37.0872 9.42147 36.0082 9.87347 35.0342 9.87347C34.1162 9.87347 33.6842 9.45347 33.6842 8.94147C33.6842 6.13647 39.6922 7.37347 39.6922 4.19547Z" fill="white"/>
                </svg>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 shadow-inner" title="MasterCard">
                <svg width="24" height="15" viewBox="0 0 24 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="7.5" cy="7.5" r="7.5" fill="#FF5F00"/>
                  <circle cx="16.5" cy="7.5" r="7.5" fill="#EB001B"/>
                  <path d="M12 13.5C13.2514 12.0289 14 10.0886 14 8C14 5.9114 13.2514 3.97115 12 2.5C10.7486 3.97115 10 5.9114 10 8C10 10.0886 10.7486 12.0289 12 13.5Z" fill="#FF9E0F"/>
                </svg>
              </div>

              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 shadow-inner h-[29px]" title="iyzico ile Öde">
                <img src="/iyzico-checkout.png" alt="iyzico ile Öde" style={{ height: 18, objectFit: "contain" }} />
              </div>

              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 shadow-inner h-[29px]" title="PayTR ile Öde">
                <svg width="60" height="16" viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <text x="0" y="23" fill="#00C853" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="24">Pay</text>
                  <text x="42" y="23" fill="#ffffff" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="24">TR</text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeModal === "about" && (
        <LegalModal onClose={() => setActiveModal(null)} title={t.about} icon={CheckCircle2}>
          <AboutUsPanel />
        </LegalModal>
      )}
      {activeModal === "deliveryReturn" && (
        <LegalModal onClose={() => setActiveModal(null)} title={t.deliveryReturn} icon={CheckCircle2}>
          <DeliveryReturnPanel />
        </LegalModal>
      )}
      {activeModal === "privacy" && (
        <LegalModal onClose={() => setActiveModal(null)} title={t.privacy} icon={CheckCircle2}>
          <PrivacyPolicyPanel />
        </LegalModal>
      )}
      {activeModal === "distanceSelling" && (
        <LegalModal onClose={() => setActiveModal(null)} title={t.distanceSelling} icon={CheckCircle2}>
          <DistanceSellingPanel />
        </LegalModal>
      )}
    </div>
  );
}
