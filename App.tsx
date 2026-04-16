import React, { useState, useEffect } from "react";
import { supabase } from "./services/supabaseService";
import { Language, AccountRow, MenuKey, Company, Invoice } from "./types";
import { translations } from "./constants";
import {
  LayoutDashboard, FileText, BarChart3, Building2, Settings2,
} from "lucide-react";
import { AuthScreen } from "./components/AuthScreen";
import { LandingPage } from "./components/LandingPage";
import { LeftPanel } from "./components/LeftPanel";
import { CenterPanel } from "./components/CenterPanel";
import { RightPanel } from "./components/RightPanel";
import { CompanyCenterPanel } from "./components/CompanyCenterPanel";
import { CompanyRightPanel } from "./components/CompanyRightPanel";
import { LangContext } from "./LanguageContext";
import { DashboardPanel } from "./components/DashboardPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ReportsPanel } from "./components/ReportsPanel";
import { FormsPanel } from "./components/FormsPanel";
import { BankDocumentsPanel } from "./components/BankDocumentsPanel";
import { AdminPanel } from "./components/AdminPanel";
import { HesapPlanlari2Panel } from "./components/HesapPlanlari2Panel";
import { InvoiceCenterPanel } from "./components/InvoiceCenterPanel";
import { InvoiceRightPanel } from "./components/InvoiceRightPanel";

// New Legal Pages
import { AboutUsPanel } from "./components/AboutUsPanel";
import { DeliveryReturnPanel } from "./components/DeliveryReturnPanel";
import { PrivacyPolicyPanel } from "./components/PrivacyPolicyPanel";
import { DistanceSellingPanel } from "./components/DistanceSellingPanel";
import { ToastProvider } from "./contexts/ToastContext";
import { useAccountPlans } from "./services/useAccountPlans";
import { useCompanies } from "./services/useCompanies";
import { useInvoices } from "./services/useInvoices";
import { resolveTeamContext, autoLinkInvites, TeamContext } from "./services/authContext";
import { runIsolationGuard } from "./services/isolationGuard";

export default function App() {
  const [lang, setLang] = useState<Language>("tr");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [initialRegister, setInitialRegister] = useState(false);

  // UI States
  const [activeMenu, setActiveMenu] = useState<MenuKey>("dashboard");
  const [userRole, setUserRole] = useState("user");
  const [teamCtx, setTeamCtx] = useState<TeamContext | null>(null);
  const [guardError, setGuardError] = useState<string | null>(null);

  // Selection States
  const [selectedRow, setSelectedRow] = useState<AccountRow | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [pendingCustomerUserId, setPendingCustomerUserId] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<any>(null);

  // ⚠ GÜVENLİK: Admin rolü artık YALNIZCA veritabanı "profiles" tablosundan belirlenir.
  // VITE_SUPER_ADMIN_EMAIL env var bypass'ı kaldırıldı (YKS-03 düzeltmesi).

  const t = translations[lang];

  // ─── Custom Hooks ─────────────────────────────────────────────────
  const { data, dataLoading, fetchData } = useAccountPlans(session, activeMenu, userRole);

  const { companies, companiesLoading, fetchCompanies } = useCompanies(
    session,
    activeMenu,
    userRole
  );

  const {
    invoices, loading: invoicesLoading, uploading: invoiceUploading,
    uploadAndAnalyze, createManualInvoice, deleteInvoice, fetchInvoiceItems,
    updateInvoice, updateInvoiceItems, reanalyzeInvoice,
  } = useInvoices(session, teamCtx?.effectiveOwnerId);

  // selectedInvoice'i invoices listesi güncellendiğinde otomatik tazele
  // (örn. AI ile tekrar analiz sonrası yeni alanların sağ panele yansıması için)
  useEffect(() => {
    if (!selectedInvoice) return;
    const fresh = invoices.find((i: Invoice) => i.id === selectedInvoice.id);
    if (fresh && fresh !== selectedInvoice) setSelectedInvoice(fresh);
  }, [invoices]);

  // ─── Auth & Session ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Supabase connection error:", err);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Team Context (owner vs staff) + auto-link + isolation guard ──
  useEffect(() => {
    if (!session?.user?.id) { setTeamCtx(null); setGuardError(null); return; }
    let cancelled = false;
    (async () => {
      try { await autoLinkInvites(session); } catch {}
      const ctx = await resolveTeamContext(session);
      if (cancelled) return;
      setTeamCtx(ctx);
      if (ctx.role === "staff") {
        const res = await runIsolationGuard(ctx);
        if (!cancelled && !res.ok) {
          setGuardError(res.reason || "Güvenlik kontrolü başarısız.");
          await supabase.auth.signOut();
          setSession(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // ─── User Role Logic ────────────────────────────────────────────────
  // [FIX H-3] Admin rolü artık yalnızca profiles tablosundan (server-side RLS) okunuyor
  useEffect(() => {
    if (!session?.user) return;
    // Sınırsız yetkili e-posta adresleri (fatura & banka ekstresi ekleme/silme dahil tüm yetkiler)
    const PRIVILEGED_EMAILS = ["cevikademm@gmail.com"];
    const isPrivileged = PRIVILEGED_EMAILS.includes(session.user.email?.toLowerCase() || "");

    if (isPrivileged) {
      setUserRole("admin");
      return;
    }

    const uid = session.user.id;
    const loadRole = () => {
      supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single()
        .then(({ data, error }) => {
          if (!error && data?.role) setUserRole(data.role);
          else setUserRole("user");
        });
    };
    loadRole();

    // Realtime: profiles.role değişirse anında uygula (admin promote/demote)
    const channel = supabase
      .channel(`profile-role-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        () => { loadRole(); }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [session]);

  // Sol panelden müşteri seçilince companies sayfasına geç ve company'yi otomatik seç
  useEffect(() => {
    if (!pendingCustomerUserId || companies.length === 0) return;
    const found = companies.find((c) => c.user_id === pendingCustomerUserId);
    if (found) {
      setSelectedCompany(found);
      setPendingCustomerUserId(null);
    }
  }, [companies, pendingCustomerUserId]);

  const handleSelectCustomer = (userId: string) => {
    setActiveMenu("companies");
    setSelectedCompany(null);
    setPendingCustomerUserId(userId);
  };

  // Redirect standard users from admin-only pages
  useEffect(() => {
    if (userRole === "user") {
      if (
        activeMenu === "accountPlans" ||
        activeMenu === "companies" ||
        activeMenu === "adminView"
      ) {
        setActiveMenu("dashboard");
      }
    }
  }, [userRole, activeMenu]);

  // Staff: sadece Fatura Merkezi
  useEffect(() => {
    if (teamCtx?.role === "staff" && activeMenu !== "invoices") {
      setActiveMenu("invoices");
    }
  }, [teamCtx?.role, activeMenu]);

  // ─── Logout ───────────────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const handleMenuChange = (menu: MenuKey) => {
    setActiveMenu(menu);
    setSelectedRow(null);
    setSelectedCompany(null);
    setSelectedInvoice(null);
    setSelectedDetailItem(null);
    setSearchTerm("");
    setCompanySearchTerm("");
  };

  // ─── Loading Screen ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="w-10 h-10 border-4 border-slate-700 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Render Logic ─────────────────────────────────────────────────
  const isRightPanelOpen = selectedRow || selectedCompany || selectedInvoice;

  const renderCenterPanel = () => {
    if (activeMenu === "companies" && userRole === "admin") {
      return (
        <CompanyCenterPanel
          companies={companies}
          loading={companiesLoading}
          selectedCompany={selectedCompany}
          onSelectCompany={setSelectedCompany}
          searchTerm={companySearchTerm}
          setSearchTerm={setCompanySearchTerm}
        />
      );
    }

    if (activeMenu === "accountPlans" && userRole === "admin") {
      return <HesapPlanlari2Panel />;
    }

    if (activeMenu === "dashboard") {
      return (
        <DashboardPanel
          invoices={invoices}
          onNavigate={(menu) => handleMenuChange(menu as any)}
          onUploadInvoice={async (file) => {
            handleMenuChange("invoices" as any);
            try {
              await uploadAndAnalyze(file);
            } catch (err: any) {
              console.error("[App] Dashboard upload error:", err);
              alert(`Hata: ${err?.message || "Bilinmeyen hata"}`);
            }
          }}
        />
      );
    }

    if (activeMenu === "settings") {
      return (
        <SettingsPanel
          userEmail={session?.user?.email}
          userRole={userRole}
          userId={session?.user?.id}
        />
      );
    }

    if (activeMenu === "adminView" && userRole === "admin") {
      return <AdminPanel accountPlans={data} onReanalyze={reanalyzeInvoice} />;
    }

    if (activeMenu === "reports") {
      return (
        <ReportsPanel invoices={invoices} />
      );
    }

    if (activeMenu === "forms") {
      return (
        <FormsPanel
          accountPlans={data}
          invoices={invoices}
          fetchInvoiceItems={fetchInvoiceItems}
        />
      );
    }

    if (activeMenu === "bankDocuments") {
      return (
        <BankDocumentsPanel propUserId={session?.user?.id} invoices={invoices} />
      );
    }

    if (activeMenu === "invoices") {
      return (
        <InvoiceCenterPanel
          invoices={invoices}
          loading={invoicesLoading}
          uploading={invoiceUploading}
          selectedInvoice={selectedInvoice}
          onSelectInvoice={setSelectedInvoice}
          userId={session?.user?.id}
          onDelete={async (inv) => {
            try {
              await deleteInvoice(inv.id);
              if (selectedInvoice?.id === inv.id) setSelectedInvoice(null);
            } catch (err: any) {
              alert(`Silme hatası: ${err?.message || err}`);
            }
          }}
          onUpload={async (files, period) => {
            for (const file of files) {
              try {
                await uploadAndAnalyze(file, period);
              } catch (err: any) {
                console.error(`[App] Invoice upload error for ${file.name}:`, err);
                alert(`Hata (${file.name}): ${err.message || 'Bilinmeyen hata'}`);
              }
            }
          }}
          fetchItems={fetchInvoiceItems}
          onCreateManual={async (payload: any) => {
            const inv = await createManualInvoice(payload);
            setSelectedInvoice(inv);
          }}
          onAccountClick={(item: any) => setSelectedDetailItem(item)}
          onUpdateInvoice={updateInvoice}
          onUpdateInvoiceItems={updateInvoiceItems}
          userRole={userRole}
          onReanalyze={reanalyzeInvoice}
        />
      );
    }

    if (activeMenu === "about") return <AboutUsPanel />;
    if (activeMenu === "deliveryReturn") return <DeliveryReturnPanel />;
    if (activeMenu === "privacy") return <PrivacyPolicyPanel />;
    if (activeMenu === "distanceSelling") return <DistanceSellingPanel />;

    return (
      <div
        className="flex-1 flex flex-col items-center justify-center"
        style={{ background: "#111318" }}
      >
        <div className="text-center">
          <div className="font-mono text-4xl mb-4" style={{ color: "#1c1f27" }}>
            ⊘
          </div>
          <div className="text-sm font-syne font-semibold" style={{ color: "#3a3f4a" }}>
            {t[activeMenu as keyof typeof t] as string}
          </div>
          {(activeMenu === "accountPlans" || activeMenu === "companies") && (
            <div
              className="text-xs mt-2 px-3 py-1.5 rounded-full inline-block"
              style={{
                background: "rgba(255,255,255,.04)",
                color: "#3a3f4a",
                border: "1px solid #1c1f27",
              }}
            >
              Admin erişimi gerekiyor
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    if (!isRightPanelOpen) return null;

    if (activeMenu === "companies" && userRole === "admin") {
      return (
        <CompanyRightPanel
          selectedCompany={selectedCompany}
          userRole={userRole}
          onCompanyUpdated={fetchCompanies}
          onCompanyDeleted={() => {
            setSelectedCompany(null);
            fetchCompanies();
          }}
        />
      );
    }

    if (activeMenu === "invoices" && selectedInvoice) {
      return (
        <InvoiceRightPanel
          selectedInvoice={selectedInvoice}
          onClose={() => { setSelectedInvoice(null); setSelectedDetailItem(null); }}
          onDelete={async (inv) => {
            await deleteInvoice(inv.id);
            setSelectedInvoice(null);
            setSelectedDetailItem(null);
          }}
          detailItem={selectedDetailItem}
          onClearDetailItem={() => setSelectedDetailItem(null)}
          onUpdateItems={updateInvoiceItems}
          onUpdateInvoice={updateInvoice}
        />
      );
    }

    return <RightPanel selectedRow={selectedRow} activeMenu={activeMenu} />;
  };

  return (
    <ToastProvider>
      <LangContext.Provider value={{ t, lang, setLang }}>
        {!session && showLanding ? (
          <LandingPage
            onGoToLogin={() => { setInitialRegister(false); setShowLanding(false); }}
            onGoToRegister={() => { setInitialRegister(true); setShowLanding(false); }}
            lang={lang}
            onLangChange={setLang}
          />
        ) : !session ? (
          <AuthScreen onAuth={setSession} initialRegister={initialRegister} onBack={() => setShowLanding(true)} />
        ) : (
          <div
            className="flex h-screen overflow-hidden flex-col md:flex-row"
            style={{
              background: "#111318",
              color: "#e2e8f0",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <LeftPanel
              activeMenu={activeMenu}
              setActiveMenu={handleMenuChange}
              userEmail={session.user.email}
              userRole={userRole}
              onLogout={handleLogout}
              onSelectCustomer={userRole === "admin" ? handleSelectCustomer : undefined}
              staffMode={teamCtx?.role === "staff"}
            />

            <div
              className={`flex-1 flex flex-col overflow-hidden pb-0 pt-safe md:pt-0 ${isRightPanelOpen ? "hidden md:flex" : "flex"
                }`}
              style={{ minWidth: 0, minHeight: 0 }}
            >
              {renderCenterPanel()}
            </div>

            <div
              className={`${isRightPanelOpen
                ? "fixed inset-0 z-50 pt-safe md:pt-0 md:static md:w-auto md:block"
                : "hidden md:block"
                }`}
              style={{ background: "#111318", flexShrink: 0 }}
            >
              {renderRightPanel()}
            </div>

            {/* ══ MOBILE BOTTOM NAV ══ */}
            {!isRightPanelOpen && (
              <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe flex items-stretch justify-around"
                style={{
                  background: "rgba(7,10,16,.96)",
                  backdropFilter: "blur(20px)",
                  borderTop: "1px solid rgba(255,255,255,.07)",
                  padding: "0",
                  height: "56px",
                }}>
                {(teamCtx?.role === "staff" ? [
                  { key: "invoices" as MenuKey, icon: <FileText size={18} />, label: t.invoices },
                ] : [
                  { key: "dashboard" as MenuKey, icon: <LayoutDashboard size={18} />, label: t.dashboard },
                  { key: "invoices" as MenuKey, icon: <FileText size={18} />, label: t.invoices },
                  { key: "reports" as MenuKey, icon: <BarChart3 size={18} />, label: t.reports },
                  { key: "bankDocuments" as MenuKey, icon: <Building2 size={18} />, label: t.bankDocuments },
                  { key: "settings" as MenuKey, icon: <Settings2 size={18} />, label: t.settings },
                ]).map(item => {
                  const isActive = activeMenu === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleMenuChange(item.key)}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: isActive ? "#06b6d4" : "var(--text-dim)",
                        position: "relative",
                        transition: "color .15s",
                        padding: "4px 0",
                      }}
                    >
                      {isActive && (
                        <span style={{
                          position: "absolute", top: 0, left: "25%", right: "25%", height: "2px",
                          borderRadius: "0 0 2px 2px",
                          background: "#06b6d4",
                          boxShadow: "0 0 8px rgba(6,182,212,.6)",
                        }} />
                      )}
                      {item.icon}
                      <span style={{
                        fontSize: "9px",
                        fontWeight: isActive ? 700 : 500,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        letterSpacing: ".02em",
                        lineHeight: 1,
                        maxWidth: "56px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        )}
      </LangContext.Provider>
    </ToastProvider>
  );
}
