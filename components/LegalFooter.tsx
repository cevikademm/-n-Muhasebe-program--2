import React, { useState } from "react";
import { ShieldCheck, X, Lock, CheckCircle2 } from "lucide-react";
import { AboutUsPanel } from "./AboutUsPanel";
import { DeliveryReturnPanel } from "./DeliveryReturnPanel";
import { PrivacyPolicyPanel } from "./PrivacyPolicyPanel";
import { DistanceSellingPanel } from "./DistanceSellingPanel";

interface LegalFooterProps {
  onNavigate: (key: string) => void;
}

export function LegalModal({ onClose, children }: { onClose: () => void, children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] rounded-3xl border border-slate-700 overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#111318" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-red-500/80 transition-all border border-slate-600 shadow-lg cursor-pointer flex items-center justify-center"
          title="Kapat"
        >
          <X size={20} />
        </button>
        <div className="flex-1 w-full h-full overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}

export function SSLModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border border-slate-700 p-6"
        style={{ background: "#1a1d25" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)", border: "2px solid rgba(16,185,129,0.3)" }}>
            <ShieldCheck className="text-green-400" size={32} />
          </div>

          <h3 className="text-lg font-bold text-white">SSL Sertifikası</h3>
          <p className="text-sm text-slate-400">
            Bu site 256-bit SSL şifreleme ile korunmaktadır. Tüm verileriniz güvenli bir şekilde iletilir.
          </p>

          <div className="w-full rounded-xl border border-slate-700 p-4 text-left" style={{ background: "#111318" }}>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-green-400 shrink-0" />
                <span className="text-slate-300">Şifreleme: <span className="text-green-400 font-semibold">256-bit TLS/SSL</span></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                <span className="text-slate-300">Protokol: <span className="text-slate-200 font-semibold">TLS 1.3</span></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                <span className="text-slate-300">Ödeme Altyapısı: <span className="text-slate-200 font-semibold">iyzico Güvencesi</span></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                <span className="text-slate-300">Veri Koruma: <span className="text-slate-200 font-semibold">GDPR / KVKK Uyumlu</span></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                <span className="text-slate-300">Veritabanı: <span className="text-slate-200 font-semibold">Row Level Security (RLS)</span></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1 px-4 py-2 rounded-full" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <ShieldCheck className="text-green-400" size={16} />
            <span className="text-xs font-semibold text-green-400">Bağlantınız Güvende</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LegalFooter({ onNavigate }: LegalFooterProps) {
  const [showSSL, setShowSSL] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  return (
    <div className="w-full mt-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "#111318" }}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">

          {/* Links Section */}
          <div className="flex flex-col gap-2 text-sm text-slate-400">
            <button
              onClick={() => setActiveModal("about")}
              className="text-left hover:text-cyan-400 transition-colors w-max cursor-pointer"
            >
              Hakkımızda
            </button>
            <button
              onClick={() => setShowSSL(true)}
              className="text-left hover:text-cyan-400 transition-colors w-max cursor-pointer"
            >
              SSL Sertifikası
            </button>
            <button
              onClick={() => setActiveModal("deliveryReturn")}
              className="text-left hover:text-cyan-400 transition-colors w-max cursor-pointer"
            >
              Teslimat ve İade Şartları
            </button>
            <button
              onClick={() => setActiveModal("privacy")}
              className="text-left hover:text-cyan-400 transition-colors w-max cursor-pointer"
            >
              Gizlilik Sözleşmesi
            </button>
            <button
              onClick={() => setActiveModal("distanceSelling")}
              className="text-left hover:text-cyan-400 transition-colors w-max cursor-pointer"
            >
              Mesafeli Satış Sözleşmesi
            </button>
          </div>

          {/* Badges / Logos Section */}
          <div className="flex flex-col items-center justify-center gap-4">
            {/* SSL Badge */}
            <button
              onClick={() => setShowSSL(true)}
              className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700 hover:border-green-400/50 hover:bg-slate-800 transition-all cursor-pointer"
            >
              <ShieldCheck className="text-green-400" size={20} />
              <span className="text-xs font-semibold tracking-wide text-slate-300">256-BIT SSL GÜVENLİ ÖDEME</span>
            </button>

          {showSSL && <SSLModal onClose={() => setShowSSL(false)} />}
            
            <div className="text-xs text-slate-500 mt-2">
              © {new Date().getFullYear()} FikoAI. Tüm hakları saklıdır.
            </div>
          </div>

          {/* Payment Providers Section */}
          <div className="flex flex-wrap items-center justify-end gap-3 opacity-90">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded px-3 py-1.5" title="Visa">
              <svg width="40" height="13" viewBox="0 0 40 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.9442 0.334473L9.82227 12.3345H5.85827L7.69627 7.76647L3.48327 0.334473H7.81827L10.3703 6.64347L10.7493 6.64347L13.8863 0.334473H14.9442Z" fill="white"/>
                <path d="M19.1412 0.334473H15.6592V12.3345H19.1412V0.334473Z" fill="white"/>
                <path d="M29.6201 12.3345L27.4211 4.75747L27.0541 4.75747L24.3641 12.3345H20.4491L24.5021 0.334473H28.7841L33.4071 12.3345H29.6201ZM27.2401 2.36847L27.1811 2.36847L25.4201 8.86847H28.9481L27.2401 2.36847Z" fill="white"/>
                <path d="M39.6922 4.19547C39.6922 1.63647 37.4722 0.177473 35.1512 0.177473C33.4732 0.177473 31.8102 0.826473 30.6862 1.95047L32.1642 4.17847C33.0232 3.42447 34.0042 3.01247 35.0682 3.01247C36.1432 3.01247 36.6972 3.51847 36.6972 4.09747C36.6972 6.57847 30.9322 5.56847 30.9322 9.60847C30.9322 11.5545 32.5402 12.5695 34.6972 12.5695C36.4352 12.5695 37.9902 11.9675 39.2992 10.9665L37.9002 8.71847C37.0872 9.42147 36.0082 9.87347 35.0342 9.87347C34.1162 9.87347 33.6842 9.45347 33.6842 8.94147C33.6842 6.13647 39.6922 7.37347 39.6922 4.19547Z" fill="white"/>
              </svg>
            </div>
            
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-3 py-1.5" title="MasterCard">
              <svg width="24" height="15" viewBox="0 0 24 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="7.5" cy="7.5" r="7.5" fill="#FF5F00"/>
                <circle cx="16.5" cy="7.5" r="7.5" fill="#EB001B"/>
                <path d="M12 13.5C13.2514 12.0289 14 10.0886 14 8C14 5.9114 13.2514 3.97115 12 2.5C10.7486 3.97115 10 5.9114 10 8C10 10.0886 10.7486 12.0289 12 13.5Z" fill="#FF9E0F"/>
              </svg>
            </div>

            <div className="flex items-center bg-slate-900 border border-slate-800 rounded px-3 py-1" title="iyzico ile Öde">
              <img src="/iyzico-checkout.png" alt="iyzico ile Öde" style={{ height: 22, objectFit: "contain" }} />
            </div>
          </div>
        </div>
      </div>

      {activeModal === "about" && (
        <LegalModal onClose={() => setActiveModal(null)}>
          <AboutUsPanel />
        </LegalModal>
      )}
      {activeModal === "deliveryReturn" && (
        <LegalModal onClose={() => setActiveModal(null)}>
          <DeliveryReturnPanel />
        </LegalModal>
      )}
      {activeModal === "privacy" && (
        <LegalModal onClose={() => setActiveModal(null)}>
          <PrivacyPolicyPanel />
        </LegalModal>
      )}
      {activeModal === "distanceSelling" && (
        <LegalModal onClose={() => setActiveModal(null)}>
          <DistanceSellingPanel />
        </LegalModal>
      )}
    </div>
  );
}
