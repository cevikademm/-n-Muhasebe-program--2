import React, { useState, useEffect } from "react";
import { supabase } from "./services/supabaseService";
import { Language, AccountRow, MenuKey, Company, Invoice, InvoiceItem } from "./types";
import { translations } from "./constants";
import { AuthScreen } from "./components/AuthScreen";
import { LeftPanel } from "./components/LeftPanel";
import { CenterPanel } from "./components/CenterPanel";
import { RightPanel } from "./components/RightPanel";
import { CompanyCenterPanel } from "./components/CompanyCenterPanel";
import { CompanyRightPanel } from "./components/CompanyRightPanel";
import { InvoiceCenterPanel } from "./components/InvoiceCenterPanel";
import { InvoiceRightPanel } from "./components/InvoiceRightPanel";
import { LangContext } from "./LanguageContext";
import { DashboardPanel } from "./components/DashboardPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ReportsPanel } from "./components/ReportsPanel";
import { FormsPanel } from "./components/FormsPanel";
import { BankDocumentsPanel } from "./components/BankDocumentsPanel";
import { MaliMusavirPanel } from "./components/MaliMusavirPanel";
import { AdminPanel } from "./components/AdminPanel";
import { SubscriptionPanel } from "./components/SubscriptionPanel";
import { ToastProvider } from "./contexts/ToastContext";
import { useAccountPlans } from "./services/useAccountPlans";
import { useCompanies } from "./services/useCompanies";
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
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedInvoiceItem, setSelectedInvoiceItem] = useState<InvoiceItem | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState("");
  const [pendingCustomerUserId, setPendingCustomerUserId] = useState<string | null>(null);

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
    invoices,
    invoiceItems,
    invoicesLoading,
    uploading,
    handleUploadInvoice: uploadInvoice,
    handleDeleteInvoice: deleteInvoice,
    handleUpdateStatus: updateStatus,
    handleUpdateInvoiceItem: updateInvoiceItem,
  } = useInvoices({
    session,
    activeMenu,
    accountPlansData: data,
    lang,
    duplicateMessage: t.duplicateMessage,
    deleteConfirm: t.deleteConfirm,
  });

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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── User Role Logic (YKS-01/03 düzeltmesi) ────────────────────────
  // ⚠ GÜVENLİK: Rol YALNIZCA Supabase "profiles" tablosundan okunur.
  // İstemci tarafı e-posta karşılaştırması kaldırıldı.
  useEffect(() => {
    if (session?.user) {
      // Rol kontrolü — yalnızca veritabanı (sunucu tarafı enforced)
      supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single()
        .then(({ data, error }) => {
          if (!error && data?.role) {
            setUserRole(data.role);
          } else {
            setUserRole("user");
          }
        });

      // ⚠ GÜVENLİK (YKS-04): Abonelik durumu Supabase'den kontrol edilir.
      // localStorage yerine sunucu tarafı kontrol kullanılır.
      (async () => {
        try {
          const { data: subData } = await supabase
            .from("subscriptions")
            .select("id, status")
            .eq("user_id", session.user.id)
            .in("status", ["active", "trialing"])
            .maybeSingle();

          const hasPlan = !!subData;
          setHasSubscription(hasPlan);
          if (!hasPlan && userRole !== "admin") {
            setActiveMenu("subscription");
          } else if (activeMenu === "subscription" && hasPlan) {
            setActiveMenu("dashboard");
          }
        } catch {
          // Tablo henüz yoksa veya hata olursa — localStorage fallback (geçici)
          const hasPlan = localStorage.getItem(`plan_${session.user.id}`);
          setHasSubscription(!!hasPlan);
          if (!hasPlan && userRole !== "admin") {
            setActiveMenu("subscription");
          } else if (activeMenu === "subscription" && hasPlan) {
            setActiveMenu("dashboard");
          }
        }
      })();
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
        activeMenu === "companies" ||
        activeMenu === "adminView"
      ) {
        setActiveMenu("invoices");
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
    setSelectedInvoiceItem(null);
    setSearchTerm("");
    setCompanySearchTerm("");
    setInvoiceSearchTerm("");
  };

  // ─── Wrapper Handlers (hook sonuçlarına UI state ekle) ────────────
  const handleUploadInvoice = async (file: File) => {
    const invoice = await uploadInvoice(file);
    if (invoice) setSelectedInvoice(invoice);
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    const ok = await deleteInvoice(invoice);
    if (ok) {
      setSelectedInvoice(null);
      setSelectedInvoiceItem(null);
    }
  };

  const handleUpdateStatus = async (invoice: Invoice, newStatus: string) => {
    const updated = await updateStatus(invoice, newStatus);
    if (updated) setSelectedInvoice(updated);
  };

  const handleUpdateInvoiceItem = async (itemId: string, newAccount: AccountRow) => {
    const updated = await updateInvoiceItem(itemId, newAccount);
    if (updated) setSelectedInvoiceItem(updated);
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

    if (activeMenu === "invoices") {
      return (
        <InvoiceCenterPanel
          invoices={invoices}
          invoiceItems={invoiceItems}
          loading={invoicesLoading}
          selectedInvoice={selectedInvoice}
          onSelectInvoice={setSelectedInvoice}
          searchTerm={invoiceSearchTerm}
          setSearchTerm={setInvoiceSearchTerm}
          onUpload={handleUploadInvoice}
          uploading={uploading}
          selectedItem={selectedInvoiceItem}
          onSelectItem={setSelectedInvoiceItem}
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
          invoices={invoices}
          invoiceItems={invoiceItems}
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
          invoices={invoices}
          invoiceItems={invoiceItems}
        />
      );
    }

    if (activeMenu === "adminView" && userRole === "admin") {
      return <AdminPanel accountPlans={data} />;
    }

    if (activeMenu === "reports") {
      return (
        <ReportsPanel
          invoices={invoices}
          invoiceItems={invoiceItems}
          loading={invoicesLoading}
        />
      );
    }

    if (activeMenu === "forms") {
      return (
        <FormsPanel
          invoices={invoices}
          invoiceItems={invoiceItems}
          accountPlans={data}
        />
      );
    }

    if (activeMenu === "bankDocuments") {
      return <BankDocumentsPanel invoices={invoices} invoiceItems={invoiceItems} />;
    }

    if (activeMenu === "maliMusavir") {
      return <MaliMusavirPanel invoices={invoices} invoiceItems={invoiceItems} />;
    }

    if (activeMenu === "subscription") {
      return (
        <SubscriptionPanel
          onPlanSelected={async () => {
            if (session?.user?.id) {
              // ⚠ GÜVENLİK (YKS-04): Abonelik kaydı Supabase'e yazılır.
              // Ödeme entegrasyonu (Stripe vb.) tamamlanınca bu kayıt
              // webhook üzerinden sunucu tarafında oluşturulmalıdır.
              try {
                await supabase.from("subscriptions").upsert({
                  user_id: session.user.id,
                  status: "active",
                  plan: "selected",
                  updated_at: new Date().toISOString(),
                }, { onConflict: "user_id" });
              } catch (e) {
                // Tablo yoksa geçici fallback
                localStorage.setItem(`plan_${session.user.id}`, "selected");
              }
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
    if (!isRightPanelOpen && activeMenu !== "invoices") return null;

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

    if (activeMenu === "invoices") {
      const currentInvoiceItems = selectedInvoice
        ? invoiceItems.filter((i) => i.invoice_id === selectedInvoice.id)
        : [];

      return (
        <InvoiceRightPanel
          selectedInvoice={selectedInvoice}
          selectedItem={selectedInvoiceItem}
          onBackToPreview={() => setSelectedInvoiceItem(null)}
          onClose={() => setSelectedInvoice(null)}
          accountPlans={data}
          items={currentInvoiceItems}
          onSelectItem={setSelectedInvoiceItem}
          userRole={userRole}
          onDelete={handleDeleteInvoice}
          onUpdateStatus={handleUpdateStatus}
          onUpdateItem={handleUpdateInvoiceItem}
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
                ? "fixed inset-0 z-50 md:static md:w-[360px] md:block"
                : "hidden md:block"
                }`}
              style={{ background: "#111318" }}
            >
              {renderRightPanel()}
            </div>
          </div>
        )}
      </LangContext.Provider>
    </ToastProvider>
  );
}
