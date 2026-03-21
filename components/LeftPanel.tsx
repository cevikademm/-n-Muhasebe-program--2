import React, { useState, useEffect, useRef } from "react";
import { useLang } from "../LanguageContext";
import { MenuKey } from "../types";
import {
  LogOut, LayoutDashboard, BarChart3,
  ClipboardList, Building2, Settings2, Crown,
  BookOpen, Building, ShieldCheck, LayoutGrid,
  Zap, ChevronRight, Globe, Briefcase, Users, Tag, FileText,
} from "lucide-react";
import { NotificationBell, NotificationDrawer } from "./NotificationDrawer";
import { supabase } from "../services/supabaseService";
import { SubscriptionCountdown } from "./SubscriptionCountdown";

interface CustomerStatus {
  company_name: string;
  user_id: string;
  status: "active" | "trialing" | "inactive" | "canceled" | null;
  plan: string | null;
}

const PLAN_LABEL: Record<string, [string, string, string]> = {
  free: ["Ücretsiz", "#64748b", "#64748b1a"],
  selected: ["Aylık", "#06b6d4", "#06b6d41a"],
  monthly: ["Aylık", "#06b6d4", "#06b6d41a"],
  quarterly: ["3 Aylık", "#8b5cf6", "#8b5cf61a"],
  yearly: ["Yıllık", "#10b981", "#10b9811a"],
  annual: ["Yıllık", "#10b981", "#10b9811a"],
};

const STATUS_DOT: Record<string, [string, string]> = {
  active: ["#10b981", "0 0 6px #10b981aa"],
  trialing: ["#3b82f6", "0 0 6px #3b82f6aa"],
  inactive: ["#4b5563", "none"],
  canceled: ["#ef4444", "none"],
};

const CustomerRow: React.FC<{ c: CustomerStatus; onClick?: () => void }> = ({ c, onClick }) => {
  const [planLabel, planColor, planBg] = PLAN_LABEL[c.plan || "free"] ?? ["Ücretsiz", "#64748b", "#64748b1a"];
  const [dotColor, dotGlow] = STATUS_DOT[c.status || "inactive"] ?? ["#4b5563", "none"];
  const letter = c.company_name?.[0]?.toUpperCase() ?? "?";
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: "7px",
        padding: "4px 6px", borderRadius: "8px", transition: "all .15s",
        background: hov ? "rgba(6,182,212,.08)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${hov ? "rgba(6,182,212,.18)" : "transparent"}`,
      }}>
      {/* Initial badge */}
      <div style={{
        width: "22px", height: "22px", borderRadius: "6px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "9px", fontWeight: 800, color: "#06b6d4",
        background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.18)",
      }}>{letter}</div>
      {/* Company name */}
      <span style={{
        flex: 1, fontSize: "11px", color: "var(--text-2)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>{c.company_name}</span>
      {/* Plan badge */}
      <span style={{
        fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "5px",
        background: planBg, color: planColor, border: `1px solid ${planColor}33`,
        flexShrink: 0, letterSpacing: ".02em",
        fontFamily: "'Space Grotesk', sans-serif",
      }}>{planLabel}</span>
      {/* Status dot */}
      <div style={{
        width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
        background: dotColor, boxShadow: dotGlow,
      }} />
    </div>
  );
};

interface LeftPanelProps {
  activeMenu: MenuKey;
  setActiveMenu: (menu: MenuKey) => void;
  userEmail: string | undefined;
  userRole: string;
  onLogout: () => void;
  onSelectCustomer?: (userId: string) => void;
  subInfo?: any;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard size={15} />,
  reports: <BarChart3 size={15} />,
  forms: <ClipboardList size={15} />,
  bankDocuments: <Building2 size={15} />,
  invoices: <FileText size={15} />,
  maliMusavir: <Briefcase size={15} />,
  settings: <Settings2 size={15} />,
  subscription: <Crown size={15} />,
  campaigns: <Tag size={15} />,
  accountPlans: <BookOpen size={15} />,
  hesapPlanlari2: <BookOpen size={15} />,
  companies: <Building size={15} />,
  adminView: <ShieldCheck size={15} />,
};

export const LeftPanel: React.FC<LeftPanelProps> = ({
  activeMenu, setActiveMenu, userEmail, userRole, onLogout, onSelectCustomer, subInfo,
}) => {
  const { t, lang, setLang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifUserId, setNotifUserId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerStatus[]>([]);

  // Kullanıcı ID'sini session'dan al
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setNotifUserId(session.user.id);
    });
  }, []);

  // Admin ise şirketleri + abonelik durumlarını çek
  useEffect(() => {
    if (userRole !== "admin") return;
    (async () => {
      const [{ data: comps }, { data: subs }] = await Promise.all([
        supabase.from("companies").select("user_id, company_name").order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("user_id, status, plan"),
      ]);
      if (!comps) return;
      const subMap = new Map((subs || []).map((s: any) => [s.user_id, s]));
      setCustomers(comps.map((c: any) => ({
        company_name: c.company_name,
        user_id: c.user_id,
        status: subMap.get(c.user_id)?.status ?? null,
        plan: subMap.get(c.user_id)?.plan ?? null,
      })));
    })();
  }, [userRole]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── Draggable floating panel ────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setDragPos({
        x: Math.max(0, Math.min(window.innerWidth - 240, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 56, e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => { dragging.current = false; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const userItems: { key: MenuKey; label: string; color: string }[] = [
    { key: "dashboard", label: t.dashboard, color: "#06b6d4" },
    { key: "reports", label: t.reports, color: "#10b981" },
    { key: "forms", label: t.forms, color: "#f59e0b" },
    { key: "bankDocuments", label: t.bankDocuments, color: "#f43f5e" },
    { key: "invoices", label: t.invoices, color: "#f97316" },
    { key: "maliMusavir", label: t.maliMusavir, color: "#a78bfa" },
    { key: "settings", label: t.settings, color: "#64748b" },
    { key: "subscription", label: t.subscription, color: "#a855f7" },
  ];

  const adminItems: { key: MenuKey; label: string; color: string }[] = [
    { key: "accountPlans", label: t.accountPlans, color: "#06b6d4" },
    { key: "hesapPlanlari2", label: tr("Hesap Planları 2", "Kontenrahmen 2"), color: "#8b5cf6" },
    { key: "campaigns", label: tr("Kampanyalar", "Kampagnen"), color: "#a855f7" },
    { key: "adminView", label: tr("Yönetim", "Admin-Panel"), color: "#f59e0b" },
  ];

  const visibleUser = userItems;
  const visibleAdmin = userRole === "admin" ? adminItems : [];
  const allVisible = [...visibleUser, ...visibleAdmin];
  const initials = userEmail ? userEmail[0].toUpperCase() : "U";

  const timeStr = time.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });

  // ─── hex → r,g,b helper ──────────────────────────────────────
  const hexRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  };

  // ─── NavItem ─────────────────────────────────────────────────
  const NavItem = ({
    item, onNavigate,
  }: {
    item: { key: MenuKey; label: string; color: string };
    onNavigate?: () => void;
  }) => {
    const isActive = activeMenu === item.key;
    const rgb = hexRgb(item.color);

    return (
      <button
        onClick={() => { setActiveMenu(item.key); onNavigate?.(); }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          border: "none",
          outline: "none",
          cursor: "pointer",
          textAlign: "left",
          position: "relative",
          padding: "8px 12px 8px 14px",
          borderRadius: "10px",
          transition: "all .18s",
          background: isActive
            ? `rgba(${rgb},.1)`
            : "transparent",
          color: isActive ? item.color : "var(--text-3)",
        }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.background = "rgba(255,255,255,.04)";
            e.currentTarget.style.color = "var(--text-2)";
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-3)";
          }
        }}
      >
        {/* Active left bar */}
        <span style={{
          position: "absolute",
          left: 0, top: "20%", height: "60%",
          width: isActive ? "3px" : "0",
          borderRadius: "0 3px 3px 0",
          background: item.color,
          boxShadow: isActive ? `0 0 8px ${item.color}99` : "none",
          transition: "width .2s",
          flexShrink: 0,
        }} />

        {/* Icon badge */}
        <span style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          flexShrink: 0,
          transition: "all .18s",
          background: isActive
            ? `rgba(${rgb},.18)`
            : "rgba(255,255,255,.04)",
          border: `1px solid ${isActive ? item.color + "44" : "rgba(255,255,255,.06)"}`,
          boxShadow: isActive ? `0 0 10px ${item.color}33` : "none",
          color: isActive ? item.color : "inherit",
        }}>
          {ICON_MAP[item.key]}
        </span>

        {/* Label */}
        <span style={{
          flex: 1,
          fontSize: "13px",
          fontWeight: isActive ? 600 : 500,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          letterSpacing: ".01em",
          lineHeight: 1,
        }}>
          {item.label}
        </span>

        {/* Active chevron */}
        {isActive && (
          <ChevronRight size={12} style={{ color: item.color, flexShrink: 0, opacity: .7 }} />
        )}
      </button>
    );
  };

  // ─── LangSwitch ──────────────────────────────────────────────
  const LangSwitch = () => (
    <div style={{
      display: "flex",
      borderRadius: "10px",
      overflow: "hidden",
      padding: "3px",
      gap: "3px",
      background: "rgba(255,255,255,.03)",
      border: "1px solid rgba(255,255,255,.07)",
    }}>
      {(["tr", "de"] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)} style={{
          flex: 1,
          padding: "6px 0",
          borderRadius: "8px",
          fontSize: "11px",
          fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
          cursor: "pointer",
          border: "none",
          transition: "all .2s",
          background: lang === l
            ? "linear-gradient(135deg,#06b6d4,#0891b2)"
            : "transparent",
          color: lang === l ? "#fff" : "var(--text-3)",
          boxShadow: lang === l ? "0 2px 10px rgba(6,182,212,.3)" : "none",
        }}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );

  // ─── UserCard ────────────────────────────────────────────────
  const UserCard = () => (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "10px 12px",
      borderRadius: "12px",
      background: "rgba(255,255,255,.025)",
      border: "1px solid rgba(255,255,255,.07)",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(6,182,212,.25), transparent)",
      }} />
      <div style={{
        width: "32px", height: "32px", borderRadius: "9px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "13px",
        color: "#06b6d4",
        background: "linear-gradient(135deg, rgba(6,182,212,.18), rgba(8,145,178,.06))",
        border: "1px solid rgba(6,182,212,.22)",
        flexShrink: 0,
        boxShadow: "0 0 12px rgba(6,182,212,.18)",
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "11px", fontWeight: 500, color: "var(--text-2)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginBottom: "2px",
        }}>
          {userEmail}
        </div>
        <div style={{
          fontSize: "10px", fontFamily: "'Space Mono', monospace", fontWeight: 600,
          color: userRole === "admin" ? "#f59e0b" : "var(--text-3)",
        }}>
          {userRole === "admin" ? "⭐ Admin" : "· User"}
        </div>
      </div>
    </div>
  );

  // ─── SidebarContent ──────────────────────────────────────────
  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div style={{ padding: "10px 14px 4px" }}>
        <span style={{
          fontSize: "9px", fontWeight: 700, letterSpacing: ".14em",
          textTransform: "uppercase", color: "var(--text-dim)",
        }}>
          {tr("Menü", "Navigation")}
        </span>
      </div>
      <nav style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: "1px" }}>
        {visibleUser.map(item => (
          <React.Fragment key={item.key}>
            <NavItem item={item} onNavigate={onNavigate} />
          </React.Fragment>
        ))}
      </nav>

      {visibleAdmin.length > 0 && (
        <>
          <div style={{ margin: "8px 14px", height: "1px", background: "linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent)" }} />
          <div style={{ padding: "6px 14px 4px" }}>
            <span style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: ".14em",
              textTransform: "uppercase", color: "var(--text-dim)",
            }}>
              {tr("Yönetim", "Verwaltung")}
            </span>
          </div>
          <nav style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: "1px" }}>
            {visibleAdmin.map(item => (
              <React.Fragment key={item.key}>
                <NavItem item={item} onNavigate={onNavigate} />
              </React.Fragment>
            ))}
          </nav>

          {/* ══ BİRLEŞİK ŞİRKETLER / MÜŞTERİLER KARTI ══ */}
          {(() => {
            const isActive = activeMenu === "companies";
            const activeCount = customers.filter(c => c.status === "active").length;
            const trialCount = customers.filter(c => c.status === "trialing").length;
            const inactiveCount = customers.filter(c => !c.status || c.status === "inactive" || c.status === "canceled").length;
            const stats = [
              { label: tr("Aktif", "Aktiv"), count: activeCount, color: "#10b981" },
              { label: tr("Deneme", "Test"), count: trialCount, color: "#3b82f6" },
              { label: tr("Pasif", "Inaktiv"), count: inactiveCount, color: "#64748b" },
            ].filter(s => s.count > 0);

            return (
              <div style={{
                margin: "6px 8px 4px",
                borderRadius: "12px",
                border: `1px solid ${isActive ? "rgba(16,185,129,.28)" : "rgba(255,255,255,.07)"}`,
                background: isActive
                  ? "linear-gradient(160deg, rgba(16,185,129,.06) 0%, rgba(16,185,129,.02) 100%)"
                  : "rgba(255,255,255,.02)",
                overflow: "hidden",
                transition: "all .2s",
                boxShadow: isActive ? "0 0 18px rgba(16,185,129,.07)" : "none",
              }}>
                {/* ── Başlık satırı (nav butonu) ── */}
                <button
                  onClick={() => { setActiveMenu("companies"); onNavigate?.(); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "8px",
                    padding: "9px 10px 8px", background: "transparent", border: "none",
                    cursor: "pointer", position: "relative", textAlign: "left",
                  }}
                >
                  {/* Aktif sol çubuk */}
                  <span style={{
                    position: "absolute", left: 0, top: "18%", height: "64%",
                    width: isActive ? "3px" : "0", borderRadius: "0 3px 3px 0",
                    background: "#10b981",
                    boxShadow: isActive ? "0 0 8px #10b98199" : "none",
                    transition: "width .2s",
                  }} />
                  {/* İkon */}
                  <span style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: "26px", height: "26px", borderRadius: "8px", flexShrink: 0,
                    background: isActive ? "rgba(16,185,129,.18)" : "rgba(255,255,255,.04)",
                    border: `1px solid ${isActive ? "#10b98144" : "rgba(255,255,255,.07)"}`,
                    color: isActive ? "#10b981" : "var(--text-3)",
                    transition: "all .18s",
                    boxShadow: isActive ? "0 0 10px rgba(16,185,129,.2)" : "none",
                  }}>
                    <Building size={13} />
                  </span>
                  {/* Başlık */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "12px", fontWeight: 600,
                      color: isActive ? "#10b981" : "var(--text-2)",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      lineHeight: 1,
                    }}>
                      {tr("Şirketler", "Firmen")}
                    </div>
                    {customers.length > 0 && (
                      <div style={{
                        fontSize: "9px", color: "var(--text-dim)", marginTop: "2px",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}>
                        {activeCount > 0 && (
                          <span style={{ color: "#10b981" }}>{activeCount} {tr("aktif", "aktiv")}</span>
                        )}
                        {activeCount > 0 && (trialCount > 0 || inactiveCount > 0) && <span style={{ opacity: .4 }}> · </span>}
                        {trialCount > 0 && (
                          <span style={{ color: "#3b82f6" }}>{trialCount} {tr("deneme", "test")}</span>
                        )}
                        {trialCount > 0 && inactiveCount > 0 && <span style={{ opacity: .4 }}> · </span>}
                        {inactiveCount > 0 && (
                          <span style={{ color: "#64748b" }}>{inactiveCount} {tr("pasif", "inaktiv")}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Toplam sayaç */}
                  <span style={{
                    fontSize: "10px", fontWeight: 800,
                    color: isActive ? "#10b981" : "#4b5563",
                    background: isActive ? "rgba(16,185,129,.15)" : "rgba(255,255,255,.05)",
                    border: `1px solid ${isActive ? "rgba(16,185,129,.3)" : "rgba(255,255,255,.08)"}`,
                    padding: "2px 7px", borderRadius: "5px",
                    fontFamily: "'Space Grotesk', sans-serif", flexShrink: 0,
                  }}>{customers.length}</span>
                  <ChevronRight size={12} style={{
                    color: isActive ? "#10b981" : "var(--text-dim)",
                    opacity: .6, flexShrink: 0,
                    transition: "transform .2s",
                    transform: isActive ? "rotate(90deg)" : "none",
                  }} />
                </button>

                {/* ── Şirket listesi ── */}
                {customers.length > 0 && (
                  <>
                    <div style={{
                      height: "1px", margin: "0 10px",
                      background: isActive ? "rgba(16,185,129,.15)" : "rgba(255,255,255,.05)",
                    }} />
                    {/* Sütun başlıkları */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "5px 10px 3px",
                    }}>
                      <span style={{ width: "22px", flexShrink: 0 }} />
                      <span style={{
                        flex: 1, fontSize: "8px", fontWeight: 700, letterSpacing: ".1em",
                        textTransform: "uppercase", color: "var(--text-dim)",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}>{tr("Firma", "Firma")}</span>
                      <span style={{
                        fontSize: "8px", fontWeight: 700, letterSpacing: ".1em",
                        textTransform: "uppercase", color: "var(--text-dim)",
                        fontFamily: "'Space Grotesk', sans-serif", marginRight: "14px",
                      }}>{tr("Plan", "Plan")}</span>
                    </div>
                    {/* Satırlar */}
                    <div style={{ padding: "0 6px 6px", maxHeight: "160px", overflowY: "auto" }}>
                      {customers.map((c, idx) => (
                        <CustomerRow
                          key={`${c.user_id}-${idx}`}
                          c={c}
                          onClick={onSelectCustomer ? () => { onSelectCustomer(c.user_id); onNavigate?.(); } : undefined}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Boş durum */}
                {customers.length === 0 && (
                  <div style={{
                    padding: "10px 12px 12px", textAlign: "center",
                    fontSize: "10px", color: "var(--text-dim)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    {tr("Henüz kayıtlı şirket yok", "Noch keine Firmen registriert")}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </>
  );

  return (
    <>
      {/* ══ FLOATING QUICK-SWITCH (draggable, desktop only) ══ */}
      <div
        ref={containerRef}
        className="hidden md:flex items-center"
        style={{
          position: "fixed",
          zIndex: 200,
          gap: "8px",
          ...(dragPos
            ? { top: dragPos.y, left: dragPos.x }
            : { top: "14px", right: "16px" }),
        }}
      >
        {/* Clock badge – drag handle */}
        <div
          onMouseDown={(e) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            dragging.current = true;
            dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            e.preventDefault();
          }}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 10px", borderRadius: "10px",
            background: "rgba(7,10,16,.88)",
            border: "1px solid rgba(255,255,255,.08)",
            backdropFilter: "blur(16px)",
            cursor: "grab",
            userSelect: "none",
          }}
        >
          {/* Grip dots */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5px", flexShrink: 0, opacity: 0.3 }}>
            {[0, 1, 2].map(r => (
              <div key={r} style={{ display: "flex", gap: "2.5px" }}>
                <div style={{ width: 2, height: 2, borderRadius: 1, background: "#94a3b8" }} />
                <div style={{ width: 2, height: 2, borderRadius: 1, background: "#94a3b8" }} />
              </div>
            ))}
          </div>
          <span style={{ fontSize: "10px", color: "var(--text-3)" }}>{dateStr}</span>
          <span style={{ width: "1px", height: "10px", background: "rgba(255,255,255,.08)" }} />
          <span style={{ fontSize: "11px", color: "#06b6d4", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{timeStr}</span>
        </div>

        {/* Quick-switch button */}
        <button
          onClick={() => setQuickOpen(v => !v)}
          style={{
            width: "36px", height: "36px", borderRadius: "10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            border: `1px solid ${quickOpen ? "rgba(6,182,212,.4)" : "rgba(255,255,255,.08)"}`,
            background: quickOpen ? "rgba(6,182,212,.12)" : "rgba(7,10,16,.88)",
            backdropFilter: "blur(16px)",
            color: quickOpen ? "#06b6d4" : "var(--text-3)",
            transition: "all .2s",
            boxShadow: quickOpen ? "0 0 20px rgba(6,182,212,.2)" : "none",
          }}
          onMouseEnter={e => { if (!quickOpen) { e.currentTarget.style.borderColor = "rgba(6,182,212,.25)"; e.currentTarget.style.color = "#06b6d4"; } }}
          onMouseLeave={e => { if (!quickOpen) { e.currentTarget.style.borderColor = "rgba(255,255,255,.08)"; e.currentTarget.style.color = "var(--text-3)"; } }}
        >
          <LayoutGrid size={15} />
        </button>

        {/* Quick-switch dropdown */}
        {quickOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: -1 }} onClick={() => setQuickOpen(false)} />
            <div className="slide-down" style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0, width: "270px",
              borderRadius: "16px",
              background: "rgba(8,11,18,.96)",
              border: "1px solid rgba(255,255,255,.09)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 24px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(6,182,212,.05)",
              overflow: "hidden",
            }}>
              <div style={{ padding: "13px 16px 10px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Zap size={13} style={{ color: "#06b6d4" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--text-3)" }}>
                  {tr("Hızlı Geçiş", "Schnellwechsel")}
                </span>
              </div>
              <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {allVisible.map(item => {
                  const isActive = activeMenu === item.key;
                  const rgb = hexRgb(item.color);
                  return (
                    <button key={item.key}
                      onClick={() => { setActiveMenu(item.key); setQuickOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "9px 10px", borderRadius: "10px",
                        border: `1px solid ${isActive ? item.color + "44" : "rgba(255,255,255,.07)"}`,
                        background: isActive ? `rgba(${rgb},.1)` : "rgba(255,255,255,.02)",
                        cursor: "pointer", textAlign: "left", transition: "all .15s",
                        color: isActive ? item.color : "var(--text-3)",
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,.05)"; e.currentTarget.style.color = "var(--text-2)"; } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,.02)"; e.currentTarget.style.color = "var(--text-3)"; } }}
                    >
                      <span style={{ flexShrink: 0, color: "inherit" }}>{ICON_MAP[item.key]}</span>
                      <span style={{ fontSize: "11px", fontWeight: isActive ? 600 : 500, lineHeight: 1.2 }}>{item.label}</span>
                      {isActive && <span style={{ marginLeft: "auto", width: "5px", height: "5px", borderRadius: "50%", background: item.color, boxShadow: `0 0 6px ${item.color}`, flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
              <div style={{ padding: "10px 16px 12px", borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                  {tr("Aktif:", "Aktiv:")} <span style={{ color: "#06b6d4" }}>{allVisible.find(i => i.key === activeMenu)?.label}</span>
                </span>
                <button onClick={onLogout} style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  fontSize: "10px", fontWeight: 600, padding: "4px 10px", borderRadius: "7px",
                  border: "1px solid rgba(244,63,94,.22)", background: "rgba(244,63,94,.08)",
                  color: "#f87171", cursor: "pointer", transition: "all .15s",
                }}>
                  <LogOut size={11} /> {t.logout}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ══ DESKTOP SIDEBAR ══ */}
      <aside className="hidden md:flex flex-col h-full shrink-0" style={{
        width: "228px", minWidth: "228px",
        background: "var(--sidebar)",
        borderRight: "1px solid rgba(255,255,255,.06)",
        position: "relative", overflow: "hidden",
      }}>
        {/* Ambient glows */}
        <div style={{ position: "absolute", top: "-60px", left: "-40px", width: "200px", height: "200px", borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,.05) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-50px", right: "-50px", width: "180px", height: "180px", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.04) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "0 18px", height: "62px",
          borderBottom: "1px solid rgba(255,255,255,.06)",
          flexShrink: 0, position: "relative",
        }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: "15px", color: "#fff",
            background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 60%, #0e7490 100%)",
            boxShadow: "0 4px 16px rgba(6,182,212,.35), inset 0 1px 0 rgba(255,255,255,.15)",
            flexShrink: 0,
          }}>
            F
          </div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "15px", color: "#f1f5f9", lineHeight: 1 }}>
              FikoAI
            </div>
            <div style={{ fontSize: "9px", marginTop: "3px", color: "var(--text-dim)", letterSpacing: ".05em" }}>
              Smart Accounting
            </div>
          </div>
          <div style={{
            marginLeft: "auto", width: "7px", height: "7px", borderRadius: "50%",
            background: "#10b981", boxShadow: "0 0 8px rgba(16,185,129,.8)",
            animation: "pulse-dot 2s infinite", flexShrink: 0,
          }} />
        </div>

        {/* Mini clock */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 18px 6px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
        }}>
          <span style={{ fontSize: "10px", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "4px" }}>
            <Globe size={9} style={{ opacity: .5 }} /> {dateStr}
          </span>
          <span style={{ fontSize: "11px", color: "#06b6d4", fontFamily: "'Space Mono', monospace", fontWeight: 700, letterSpacing: ".06em" }}>
            {timeStr}
          </span>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: "auto", paddingTop: "8px" }}>
          <SidebarContent />
        </div>

        {/* Timer fixed above footer */}
        {subInfo && subInfo.plan !== 'free' && (
          <div style={{ paddingBottom: "12px" }}>
            <SubscriptionCountdown plan={subInfo.plan} expiresAt={subInfo.expiresAt} />
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: "14px",
          borderTop: "1px solid rgba(255,255,255,.06)",
          display: "flex", flexDirection: "column", gap: "10px",
          flexShrink: 0, position: "relative",
        }}>
          <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "1px", background: "linear-gradient(90deg,transparent,rgba(6,182,212,.18),transparent)" }} />
          <LangSwitch />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <UserCard />
            <NotificationBell
              userId={notifUserId}
              onClick={() => setNotifOpen(v => !v)}
              isOpen={notifOpen}
            />
          </div>
          <button
            onClick={onLogout}
            className="c-btn-danger"
            style={{
              width: "100%", padding: "10px 0",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              fontSize: "13px",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <LogOut size={15} />
            {t.logout}
          </button>
        </div>
      </aside>

      {/* ══ MOBILE TOP BAR ══ */}
      <div className="md:hidden shrink-0 flex items-center justify-between px-4"
        style={{ height: "52px", background: "var(--sidebar)", borderBottom: "1px solid rgba(255,255,255,.06)", zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "30px", height: "30px", borderRadius: "9px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: "13px",
            color: "#fff", background: "linear-gradient(135deg,#06b6d4,#0891b2)",
            boxShadow: "0 2px 10px rgba(6,182,212,.3)",
          }}>F</div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "14px", color: "#f1f5f9" }}>FikoAI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={() => setLang(lang === "tr" ? "de" : "tr")} style={{
            fontSize: "10px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
            padding: "4px 10px", borderRadius: "7px", cursor: "pointer",
            border: "1px solid rgba(6,182,212,.25)", background: "rgba(6,182,212,.1)", color: "#06b6d4",
          }}>
            {lang.toUpperCase()}
          </button>
          <button onClick={() => setMobileOpen(v => !v)} style={{
            width: "34px", height: "34px", borderRadius: "9px",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: "4px", cursor: "pointer",
            border: "none", background: mobileOpen ? "rgba(6,182,212,.12)" : "rgba(255,255,255,.05)",
            transition: "background .15s",
          }}>
            {[16, 10, 16].map((w, i) => (
              <span key={i} style={{
                display: "block", width: `${w}px`, height: "1.5px", borderRadius: "2px",
                background: mobileOpen ? "#06b6d4" : "var(--text-3)", transition: "background .15s",
              }} />
            ))}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="md:hidden" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }} onClick={() => setMobileOpen(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)" }} />
          <div style={{
            position: "relative", width: "265px", height: "100%",
            display: "flex", flexDirection: "column",
            background: "var(--sidebar)", borderRight: "1px solid rgba(255,255,255,.07)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", height: "62px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: "13px", color: "#fff", background: "linear-gradient(135deg,#06b6d4,#0891b2)" }}>F</div>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "14px", color: "#f1f5f9" }}>FikoAI</span>
              </div>
              <button onClick={() => setMobileOpen(false)} style={{ width: "28px", height: "28px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "rgba(255,255,255,.05)", color: "var(--text-3)", fontSize: "12px" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", paddingTop: "6px" }}>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
            <div style={{ padding: "14px", borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", flexDirection: "column", gap: "10px" }}>
              <LangSwitch />
              <UserCard />
              <button onClick={onLogout} className="c-btn-danger" style={{ width: "100%", padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "13px" }}>
                <LogOut size={15} /> {t.logout}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══ BİLDİRİM ÇEKMECESİ ══ */}
      {notifOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 299, background: "rgba(0,0,0,.4)" }}
            onClick={() => setNotifOpen(false)}
          />
          <NotificationDrawer
            userId={notifUserId}
            onNavigateToInvoices={() => {
              setNotifOpen(false);
              setActiveMenu("dashboard");
            }}
          />
        </>
      )}
    </>
  );
};
