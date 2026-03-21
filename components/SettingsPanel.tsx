import React, { useState } from "react";
import {} from "../types";
import { useLang } from "../LanguageContext";
import { ExportTab } from "./ExportTab";
import { SettingsCompanyTab } from "./settings/SettingsCompanyTab";
import { SettingsMatchingTab } from "./settings/SettingsMatchingTab";
import { SettingsSecurityTab } from "./settings/SettingsSecurityTab";
import { Building2, BookOpen, ArrowLeftRight, ExternalLink, Shield, Cloud, Crown, User, Loader2 } from "lucide-react";

interface SettingsPanelProps {
  userEmail: string | undefined;
  userRole: string;
  userId: string | undefined;
}

type Tab = "company" | "accounting" | "matching" | "export" | "security";

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  userEmail, userRole, userId,
}) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const [tab, setTab] = useState<Tab>("company");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: "company",    icon: <Building2 size={16} />,     label: tr("Şirket", "Firma") },
    { key: "accounting", icon: <BookOpen size={16} />,      label: tr("Muhasebe", "Buchführung") },
    { key: "matching",   icon: <ArrowLeftRight size={16} />, label: tr("Kurallar", "Regeln") },
    { key: "export",     icon: <ExternalLink size={16} />,  label: tr("Export", "Export") },
    { key: "security",   icon: <Shield size={16} />,        label: tr("Güvenlik", "Sicherheit") },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "#111318" }}>

      {/* Header */}
      <div className="px-6 py-4 shrink-0 flex items-center justify-between"
        style={{ background: "#0d0f15", borderBottom: "1px solid #1c1f27" }}>
        <div>
          <h1 className="font-syne font-bold text-lg text-slate-100">{tr("Ayarlar", "Einstellungen")}</h1>
          <p className="text-xs mt-0.5" style={{ color: "#3a3f4a" }}>{tr("Sistem ve şirket yapılandırması", "System- und Firmenkonfiguration")}</p>
        </div>
        <span className="text-[10px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5"
          style={{ background: "rgba(16,185,129,.1)", color: "#10b981", border: "1px solid rgba(16,185,129,.2)" }}>
          <Cloud size={12} /> {tr("Supabase Senkron", "Supabase Synchron")}
        </span>
      </div>

      {/* Toast */}
      {msg && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-md text-xs font-medium shrink-0"
          style={msg.ok
            ? { background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)", color: "#10b981" }
            : { background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#f87171" }}>
          {msg.text}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">

        {/* ── Mobile Tabs ── */}
        <div className="md:hidden flex overflow-x-auto gap-2 p-3 shrink-0 border-b border-[#1c1f27] no-scrollbar"
          style={{ background: "#0d0f15" }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0"
              style={tab === t.key
                ? { background: "rgba(6,182,212,.1)", color: "#06b6d4", border: "1px solid rgba(6,182,212,.2)" }
                : { background: "rgba(255,255,255,.04)", color: "#64748b", border: "1px solid transparent" }}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Sidebar Tabs (Desktop) ── */}
        <div className="hidden md:flex w-[180px] min-w-[180px] flex-col gap-0.5 p-3 overflow-y-auto shrink-0"
          style={{ background: "#0d0f15", borderRight: "1px solid #1c1f27" }}>
          <div className="c-section-title px-2 pt-2 pb-3">{tr("Kategoriler", "Kategorien")}</div>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-left w-full cursor-pointer border-none transition-all"
              style={tab === t.key
                ? { background: "rgba(6,182,212,.1)", color: "#06b6d4" }
                : { background: "transparent", color: "#3a3f4a" }}>
              <span className="font-mono text-base w-5 text-center shrink-0">{t.icon}</span>
              <span className="font-medium">{t.label}</span>
              {tab === t.key && <span className="ml-auto w-1 h-4 rounded-full shrink-0" style={{ background: "#06b6d4" }} />}
            </button>
          ))}

          <div className="mt-auto pt-4 px-2" style={{ borderTop: "1px solid #1c1f27" }}>
            <div className="text-[10px] mb-1.5" style={{ color: "#3a3f4a" }}>{tr("Oturum", "Sitzung")}</div>
            <div className="text-xs text-slate-300 truncate">{userEmail}</div>
            <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={userRole === "admin"
                ? { background: "rgba(6,182,212,.1)", color: "#06b6d4" }
                : { background: "rgba(255,255,255,.04)", color: "#3a3f4a" }}>
              {userRole === "admin" ? <><Crown size={10} /> Admin</> : <><User size={10} /> User</>}
            </span>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">

          {(tab === "company" || tab === "accounting") && (
            <SettingsCompanyTab
              userId={userId}
              flash={flash}
              activeTab={tab}
            />
          )}

          {tab === "matching" && (
            <SettingsMatchingTab
              userId={userId}
              userRole={userRole}
              flash={flash}
            />
          )}

          {tab === "export" && (
            <ExportTab invoices={[]} invoiceItems={[]} tr={tr} lang={lang} />
          )}

          {tab === "security" && (
            <SettingsSecurityTab
              userId={userId}
              userEmail={userEmail}
              userRole={userRole}
              flash={flash}
            />
          )}

        </div>
      </div>
    </div>
  );
};
