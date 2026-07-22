import React, { useEffect, useState } from "react";
import {
  LogOut, LayoutDashboard, BarChart3, ClipboardList, Building2, Settings2,
  BookOpen, ShieldCheck, FileText, Calculator, Users, Share2, Building,
} from "lucide-react";
import { useLang } from "../LanguageContext";
import { MenuKey } from "../types";
import { supabase } from "../services/supabaseService";
import { Modul, MODULLER, MODUL_TANIM } from "../services/moduller";
import { NotificationBell, NotificationDrawer } from "./NotificationDrawer";

interface Props {
  activeMenu: MenuKey;
  setActiveMenu: (m: MenuKey) => void;
  userRole: string;
  staffMode?: boolean;
  acikModuller: Set<Modul>;
  onLogout: () => void;
}

const PLATFORM_IKON: Record<Modul, React.ReactNode> = {
  muhasebe: <Calculator size={17} />,
  musteri_bulma: <Users size={17} />,
  sosyal_medya: <Share2 size={17} />,
};

/** Muhasebe modülünün alt menüsü. Sidebar'daki sırayla aynı. */
const MUHASEBE_ALT: { key: MenuKey; ikon: React.ReactNode; renk: string }[] = [
  { key: "invoices",      ikon: <FileText size={15} />,        renk: "#f97316" },
  { key: "dashboard",     ikon: <LayoutDashboard size={15} />, renk: "#06b6d4" },
  { key: "reports",       ikon: <BarChart3 size={15} />,       renk: "#10b981" },
  { key: "forms",         ikon: <ClipboardList size={15} />,   renk: "#f59e0b" },
  { key: "bankDocuments", ikon: <Building2 size={15} />,       renk: "#f43f5e" },
];

// Sidebar'daki "Yönetim" bölümü + şirketler kartının ray karşılığı. Şirketler
// sidebar'da bir liste kartı olduğu için ray sürümünde tek ikona iniyor —
// aksi halde admin tablette Şirketler ekranına hiç ulaşamazdı.
const ADMIN_ALT: { key: MenuKey; ikon: React.ReactNode; renk: string }[] = [
  { key: "accountPlans", ikon: <BookOpen size={15} />,    renk: "#06b6d4" },
  { key: "companies",    ikon: <Building size={15} />,    renk: "#10b981" },
  { key: "adminView",    ikon: <ShieldCheck size={15} />, renk: "#f59e0b" },
];

interface RayButonProps {
  id: string;
  ikon: React.ReactNode;
  etiket: string;
  aktif: boolean;
  renk: string;
  hoverKey: string | null;
  setHoverKey: (k: string | null) => void;
  onClick: () => void;
}

/**
 * Rayın tek düğmesi. Bilinçli olarak modül seviyesinde: TabletRail'in içinde
 * tanımlansaydı her render'da yeni bir bileşen tipi doğar, düğmeler yeniden
 * mount olur ve hover/odak durumu kaybolurdu.
 */
const RayButon: React.FC<RayButonProps> = ({
  id, ikon, etiket, aktif, renk, hoverKey, setHoverKey, onClick,
}) => (
  <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
    <button
      onClick={onClick}
      onMouseEnter={() => setHoverKey(id)}
      onMouseLeave={() => setHoverKey(null)}
      onFocus={() => setHoverKey(id)}
      onBlur={() => setHoverKey(null)}
      aria-label={etiket}
      title={etiket}
      style={{
        width: 42, height: 42, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "all .16s", position: "relative",
        background: aktif ? `${renk}22` : "rgba(255,255,255,.03)",
        border: `1px solid ${aktif ? `${renk}55` : "rgba(255,255,255,.06)"}`,
        color: aktif ? renk : "var(--text-3)",
        boxShadow: aktif ? `0 0 12px ${renk}33` : "none",
      }}
    >
      {aktif && (
        <span style={{
          position: "absolute", left: -9, top: "25%", height: "50%", width: 3,
          borderRadius: "0 3px 3px 0", background: renk, boxShadow: `0 0 8px ${renk}99`,
        }} />
      )}
      {ikon}
    </button>

    {/* Hover etiketi — ikon rayında metin olmadığı için tek ipucu bu. */}
    {hoverKey === id && (
      <span style={{
        position: "absolute", left: 56, top: "50%", transform: "translateY(-50%)",
        padding: "5px 10px", borderRadius: 8, whiteSpace: "nowrap", zIndex: 60,
        background: "rgba(7,10,16,.96)", border: "1px solid rgba(255,255,255,.1)",
        color: "#e2e8f0", fontSize: 11.5, fontWeight: 600, pointerEvents: "none",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        boxShadow: "0 6px 18px rgba(0,0,0,.4)",
      }}>
        {etiket}
      </span>
    )}
  </div>
);

/**
 * Tablet (768–1023px) navigasyonu: 64px'lik dikey ikon rayı.
 *
 * Masaüstü sidebar'ı 228px genişliğiyle tablette içerik alanını boğuyordu,
 * mobil alt bar ise bu genişlikte tuhaf duruyor. Ray ikisinin arasını doldurur:
 * üstte platform (modül) geçişi, altında aktif platformun alt menüsü.
 *
 * Yalnızca AÇIK modüller çizilir — kapalı paket kullanıcıya hiç görünmez.
 */
export const TabletRail: React.FC<Props> = ({
  activeMenu, setActiveMenu, userRole, staffMode, acikModuller, onLogout,
}) => {
  const { t, lang, setLang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // Bildirim çekmecesi rayın kendi içinde yönetilir (LeftPanel'deki kalıbın
  // aynısı) — App'e ek prop taşımaya gerek kalmıyor.
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifUserId, setNotifUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setNotifUserId(session.user.id);
    });
  }, []);

  const platformlar = MODULLER.filter((m) => acikModuller.has(m));
  const aktifPlatform: Modul =
    activeMenu === "musteriBulma" ? "musteri_bulma"
    : activeMenu === "sosyalMedya" ? "sosyal_medya"
    : "muhasebe";

  // Staff yalnızca Fatura Merkezi'ni görür (App'teki yönlendirmeyle aynı kural).
  const altMenu = staffMode
    ? MUHASEBE_ALT.filter((i) => i.key === "invoices")
    : [...MUHASEBE_ALT, ...(userRole === "admin" ? ADMIN_ALT : [])];

  const hover = { hoverKey, setHoverKey };

  return (
    <aside
      className="hidden md:flex lg:hidden flex-col h-full shrink-0"
      style={{
        width: 64, minWidth: 64,
        background: "var(--sidebar)",
        borderRight: "1px solid rgba(255,255,255,.06)",
        alignItems: "center", padding: "12px 0 10px", gap: 8,
        position: "relative", zIndex: 20,
      }}
    >
      <img src="/logo.png" alt="FikoAI" style={{ width: 34, height: 34, borderRadius: 10, objectFit: "contain", flexShrink: 0 }} />

      <div style={{ width: 34, height: 1, background: "rgba(255,255,255,.08)", margin: "4px 0" }} />

      {/* ── Platformlar (yalnızca açık modüller) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", alignItems: "center" }}>
        {platformlar.map((m) => (
          <RayButon
            key={m}
            id={`p-${m}`}
            ikon={PLATFORM_IKON[m]}
            etiket={MODUL_TANIM[m].ad[lang]}
            aktif={aktifPlatform === m}
            renk={MODUL_TANIM[m].renk}
            onClick={() => setActiveMenu(MODUL_TANIM[m].anaMenu)}
            {...hover}
          />
        ))}
      </div>

      {/* ── Aktif platform Muhasebe ise alt menüsü ── */}
      {aktifPlatform === "muhasebe" && acikModuller.has("muhasebe") && (
        <>
          <div style={{ width: 34, height: 1, background: "rgba(255,255,255,.08)", margin: "4px 0" }} />
          <div style={{
            display: "flex", flexDirection: "column", gap: 5, width: "100%",
            alignItems: "center", overflowY: "auto", minHeight: 0,
          }}>
            {altMenu.map((i) => (
              <RayButon
                key={i.key}
                id={`m-${i.key}`}
                ikon={i.ikon}
                etiket={
                  i.key === "adminView"
                    ? tr("Yönetim", "Admin-Panel")
                    : i.key === "companies"
                    ? tr("Şirketler", "Firmen")
                    : (t[i.key as keyof typeof t] as string) || i.key
                }
                aktif={activeMenu === i.key}
                renk={i.renk}
                onClick={() => setActiveMenu(i.key)}
                {...hover}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Alt blok ── */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, width: "100%" }}>
        <div style={{ width: 34, height: 1, background: "rgba(255,255,255,.08)" }} />

        <RayButon
          id="m-settings"
          ikon={<Settings2 size={15} />}
          etiket={t.settings}
          aktif={activeMenu === "settings"}
          renk="#64748b"
          onClick={() => setActiveMenu("settings")}
          {...hover}
        />

        <NotificationBell userId={notifUserId} onClick={() => setNotifOpen((v) => !v)} isOpen={notifOpen} />

        <button
          onClick={() => setLang(lang === "tr" ? "de" : "tr")}
          aria-label={tr("Dil değiştir", "Sprache wechseln")}
          style={{
            width: 34, height: 26, borderRadius: 8, cursor: "pointer",
            border: "1px solid rgba(6,182,212,.25)", background: "rgba(6,182,212,.1)",
            color: "#06b6d4", fontSize: 10, fontWeight: 700,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {lang.toUpperCase()}
        </button>

        <button
          onClick={onLogout}
          aria-label={t.logout}
          title={t.logout}
          style={{
            width: 34, height: 30, borderRadius: 9, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(239,68,68,.22)", background: "rgba(239,68,68,.08)", color: "#f87171",
          }}
        >
          <LogOut size={14} />
        </button>
      </div>

      {notifOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 299, background: "rgba(0,0,0,.4)" }}
            onClick={() => setNotifOpen(false)}
          />
          <NotificationDrawer
            userId={notifUserId}
            onNavigateToInvoices={() => { setNotifOpen(false); setActiveMenu("invoices"); }}
          />
        </>
      )}
    </aside>
  );
};
