import React, { useState, useEffect } from "react";
import { supabase } from "./services/supabaseService";
import { Language, AccountRow, MenuKey, Company, Invoice } from "./types";
import { translations } from "./constants";
import {
  LayoutDashboard, FileText, BarChart3, Building2, Settings2, Briefcase,
} from "lucide-react";
import { AuthScreen } from "./components/AuthScreen";
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
import { MaliMusavirPanel } from "./components/MaliMusavirPanel";
import { AdminPanel } from "./components/AdminPanel";
import { SubscriptionPanel } from "./components/SubscriptionPanel";
import { CampaignsPanel } from "./components/CampaignsPanel";
import { HesapPlanlari2Panel } from "./components/HesapPlanlari2Panel";
import { InvoiceCenterPanel } from "./components/InvoiceCenterPanel";
import { InvoiceRightPanel } from "./components/InvoiceRightPanel";
import { ToastProvider } from "./contexts/ToastContext";
import { useAccountPlans } from "./services/useAccountPlans";
import { useCompanies } from "./services/useCompanies";
import { useSubscriptionTimer } from "./services/useSubscriptionTimer";
import { useInvoices } from "./services/useInvoices";

export default function App() {
  const [lang, setLang] = useState<Language>("tr");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // UI States
  const [activeMenu, setActiveMenu] = useState<MenuKey>("dashboard");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [userRole, setUserRole] = useState("user");

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

  const subInfo = useSubscriptionTimer(session, userRole);

  const {
    invoices, loading: invoicesLoading, uploading: invoiceUploading,
    uploadAndAnalyze, deleteInvoice, fetchInvoiceItems,
    updateInvoice, updateInvoiceItems,
  } = useInvoices(session, subInfo);

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

  // ─── User Role Logic ────────────────────────────────────────────────
  // [FIX H-3] Admin rolü artık yalnızca profiles tablosundan (server-side RLS) okunuyor
  useEffect(() => {
    if (session?.user) {
      // Tüm kullanıcılar — profiles tablosundan rol oku (admin dahil)
      supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single()
        .then(({ data, error }) => {
          if (!error && data?.role) {
            setUserRole(data.role);
            if (data.role === "admin") {
              setHasSubscription(true);
            }
          } else {
            setUserRole("user");
          }
        });

      // Abonelik durumu kontrolü (useSubscriptionTimer içinde ele alınıyor)
      if (userRole !== "admin") {
        if (!subInfo.isActive) {
          setActiveMenu("subscription");
        } else if (activeMenu === "subscription" && subInfo.isActive) {
          setActiveMenu("dashboard");
        }
      }
    }
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
        activeMenu === "hesapPlanlari2" ||
        activeMenu === "companies" ||
        activeMenu === "adminView"
      ) {
        setActiveMenu("dashboard");
      }
    }
  }, [userRole, activeMenu]);

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
      return (
        <CenterPanel
          data={data}
          loading={dataLoading}
          selectedRow={selectedRow}
          onSelectRow={setSelectedRow}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />
      );
    }

    if (activeMenu === "dashboard") {
      return (
        <DashboardPanel
          onNavigate={(menu) => handleMenuChange(menu as any)}
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
      return <AdminPanel accountPlans={data} />;
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
        />
      );
    }

    if (activeMenu === "bankDocuments") {
      return (
        <BankDocumentsPanel
          isSubscriptionExpired={subInfo.isExpired}
          subscriptionExpiresAt={subInfo.expiresAt}
          subscriptionPlan={subInfo.plan}
        />
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
          isSubscriptionExpired={subInfo.isExpired}
          subscriptionExpiresAt={subInfo.expiresAt}
          subscriptionPlan={subInfo.plan}
          onUpload={async (files) => {
            for (const file of files) {
              try {
                await uploadAndAnalyze(file);
              } catch (err: any) {
                console.error(`[App] Invoice upload error for ${file.name}:`, err);
                alert(`Hata (${file.name}): ${err.message || 'Bilinmeyen hata'}`);
              }
            }
          }}
          fetchItems={fetchInvoiceItems}
          onAccountClick={(item: any) => setSelectedDetailItem(item)}
          onUpdateInvoice={updateInvoice}
          onUpdateInvoiceItems={updateInvoiceItems}
        />
      );
    }

    if (activeMenu === "maliMusavir") {
      return (
        <MaliMusavirPanel 
          invoices={invoices} 
          fetchItems={fetchInvoiceItems} 
        />
      );
    }

    if (activeMenu === "campaigns" && userRole === "admin") {
      return <CampaignsPanel />;
    }

    if (activeMenu === "hesapPlanlari2" && userRole === "admin") {
      return <HesapPlanlari2Panel />;
    }

    if (activeMenu === "subscription") {
      return (
        <SubscriptionPanel
          purchasedPeriods={subInfo.purchasedPeriods}
          onPlanSelected={async (plan: any, selectedPeriods?: string[]) => {
            if (session?.user?.id) {
              // ⚠ GÜVENLİK (YKS-04): Abonelik kaydı Supabase'e yazılır.
              // Ödeme entegrasyonu (Stripe vb.) tamamlanınca bu kayıt
              // webhook üzerinden sunucu tarafında oluşturulmalıdır.
              try {
                let dbSuccess = false;
                if (selectedPeriods && selectedPeriods.length > 0) {
                  // Dönemsel kayıtlar oluştur
                  const rows = selectedPeriods.map(p => {
                    const [year, month] = p.split("-").map(Number);
                    return {
                      user_id: session.user.id,
                      period_year: year,
                      period_month: month,
                      plan_type: plan?.key || "monthly",
                      price_paid: (plan?.price || 0) / selectedPeriods.length,
                    };
                  });
                  const { error: upsertError } = await supabase
                    .from("subscription_periods")
                    .upsert(rows, { onConflict: "user_id,period_year,period_month" });

                  if (upsertError) {
                    console.warn("[App] subscription_periods upsert hatası:", upsertError.message);
                  } else {
                    dbSuccess = true;
                  }
                }

                // Geriye uyumluluk: eski subscriptions tablosuna da özet kayıt
                try {
                  await supabase.from("subscriptions").upsert({
                    user_id: session.user.id,
                    status: "active",
                    plan: plan?.key || "monthly",
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "user_id" });
                } catch { /* eski tablo yoksa görmezden gel */ }

                // Her durumda localStorage'ı da güncelle (DB + localStorage senkron)
                localStorage.setItem(`periods_${session.user.id}`, JSON.stringify({
                  periods: selectedPeriods || [],
                  plan: plan?.key || "monthly",
                }));

                if (!dbSuccess) {
                  console.warn("[App] DB yazılamadı, localStorage fallback aktif");
                }
              } catch (e) {
                console.error("[App] Abonelik kayıt hatası:", e);
                // localStorage fallback — her durumda kaydet
                localStorage.setItem(`periods_${session.user.id}`, JSON.stringify({
                  periods: selectedPeriods || [],
                  plan: plan?.key || "monthly",
                }));
              }
              window.dispatchEvent(new Event("subscription_updated"));
              setHasSubscription(true);
              setActiveMenu("dashboard");
            }
          }}
        />
      );
    }

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
        />
      );
    }

    return <RightPanel selectedRow={selectedRow} activeMenu={activeMenu} />;
  };

  return (
    <ToastProvider>
      <LangContext.Provider value={{ t, lang, setLang }}>
        {!session ? (
          <AuthScreen onAuth={setSession} />
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
              subInfo={subInfo}
            />

            <div
              className={`flex-1 flex flex-col overflow-hidden pb-0 ${isRightPanelOpen ? "hidden md:flex" : "flex"
                }`}
              style={{ minWidth: 0, minHeight: 0 }}
            >
              {renderCenterPanel()}
            </div>

            <div
              className={`${isRightPanelOpen
                ? "fixed inset-0 z-50 md:static md:w-auto md:block"
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
                {([
                  { key: "dashboard" as MenuKey, icon: <LayoutDashboard size={18} />, label: t.dashboard },
                  { key: "invoices" as MenuKey, icon: <FileText size={18} />, label: t.invoices },
                  { key: "reports" as MenuKey, icon: <BarChart3 size={18} />, label: t.reports },
                  { key: "bankDocuments" as MenuKey, icon: <Building2 size={18} />, label: t.bankDocuments },
                  { key: "maliMusavir" as MenuKey, icon: <Briefcase size={18} />, label: t.maliMusavir },
                  { key: "settings" as MenuKey, icon: <Settings2 size={18} />, label: t.settings },
                ] as const).map(item => {
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
