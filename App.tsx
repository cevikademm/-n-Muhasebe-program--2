import React, { useState, useEffect } from "react";
import { supabase } from "./services/supabaseService";
import { Language, AccountRow, MenuKey, Company, Invoice } from "./types";
import { translations } from "./constants";
import {
  Calculator, Users, Share2,
} from "lucide-react";
import { AuthScreen } from "./components/AuthScreen";
import { DavetEkrani } from "./components/DavetEkrani";
import { LandingPage } from "./components/LandingPage";
import { LeftPanel } from "./components/LeftPanel";
import { TabletRail } from "./components/TabletRail";
import { KapaliModulPanel } from "./components/KapaliModulPanel";
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
import { MusteriBulmaPanel } from "./components/MusteriBulmaPanel";
import { SosyalMedyaPanel } from "./components/sosyal/SosyalMedyaPanel";

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
import { useModuller } from "./services/useModuller";
import { MODULLER, MODUL_TANIM, MENU_MODUL, ilkAcikMenu, menuErisilebilir } from "./services/moduller";

/** Davet linki: /app?davet=<token>. Mount anında bir kez okunur. */
const davetTokeniOku = (): string => {
  try { return new URLSearchParams(window.location.search).get("davet") || ""; } catch { return ""; }
};

export default function App() {
  const [lang, setLang] = useState<Language>("tr");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // /app doğrudan giriş ekranını açar; tanıtım/landing artık fikoai.de kök sayfasıdır.
  const [showLanding, setShowLanding] = useState(false);
  const [initialRegister, setInitialRegister] = useState(false);
  const [davetToken, setDavetToken] = useState<string>(davetTokeniOku);

  // UI States
  // Açılış ekranı, kullanıcının açık modüllerinden türetilir (aşağıdaki effect).
  // Buradaki başlangıç değeri yalnızca modüller yüklenene kadar geçerlidir.
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

  // ─── Modül (paket) yetkileri ──────────────────────────────────────
  // Arayüzü buna göre kısıtlıyoruz; asıl engel veritabanındaki RLS modül
  // kapılarıdır (20260723_paket_yetkileri.sql).
  const modulDurumu = useModuller(session, userRole);
  const {
    acik: acikModuller, talepler: modulTalepleri,
    yukleniyor: modullerYukleniyor, talepEt,
  } = modulDurumu;
  // Modüller yüklenene kadar menü yönlendirmesi yapılmaz, aksi halde kullanıcı
  // bir an "paket kapalı" ekranını görüp sonra yerine oturmuş olurdu.
  const modullerHazir = !!session && !modullerYukleniyor;

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

  // ─── Tema: giriş ekranı koyu-premium, uygulama açık tema ──────────
  // Oturum yoksa auth-dark → muhasebe-app.html'deki light-theme enforcer devre dışı.
  useEffect(() => {
    const el = document.documentElement;
    if (session) el.classList.remove("auth-dark");
    else el.classList.add("auth-dark");
  }, [session]);

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

  // ─── Açılış ekranı: ilk açık modül ────────────────────────────────
  // Oturum açıldığında modüller yüklenir yüklenmez kullanıcıyı sahip olduğu
  // ilk platforma indir. Staff yönlendirmesi (yukarıda) bunun üstüne yazar.
  const [acilisYapildi, setAcilisYapildi] = useState(false);
  useEffect(() => {
    if (!modullerHazir || acilisYapildi) return;
    setAcilisYapildi(true);
    if (teamCtx?.role === "staff") return;
    setActiveMenu(ilkAcikMenu(acikModuller));
  }, [modullerHazir, acilisYapildi, acikModuller, teamCtx?.role]);

  // Oturum kapanınca bir sonraki giriş için açılış yönlendirmesi tekrar çalışsın.
  useEffect(() => { if (!session) setAcilisYapildi(false); }, [session]);

  // ─── Kapalı modüle gidilirse ilk açık modüle düş ──────────────────
  // Admin hariç: admin'in RLS'te modül kapısı yok, menüsü de kısıtlanmaz.
  useEffect(() => {
    if (!modullerHazir || userRole === "admin" || teamCtx?.role === "staff") return;
    if (!menuErisilebilir(activeMenu, acikModuller)) {
      // Kapalı modülün ANA ekranındaysak KapaliModulPanel gösterilecek;
      // sadece alt ekranlarda (örn. muhasebe → raporlar) geri düşürüyoruz.
      const modul = MENU_MODUL[activeMenu];
      const anaEkran = modul ? MODUL_TANIM[modul].anaMenu : null;
      if (activeMenu !== anaEkran) setActiveMenu(ilkAcikMenu(acikModuller));
    }
  }, [modullerHazir, activeMenu, acikModuller, userRole, teamCtx?.role]);

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
    // ── Modül kapısı ──
    // Paketi kapalı bir ekran istenirse içerik yerine bilgilendirme/talep
    // ekranı çizilir. Veri sızıntısına karşı asıl koruma RLS'te; bu yalnızca
    // kullanıcıya ne olduğunu anlatan katman.
    if (modullerHazir) {
      const istenenModul = MENU_MODUL[activeMenu];
      if (istenenModul && !acikModuller.has(istenenModul)) {
        return (
          <KapaliModulPanel
            modul={istenenModul}
            talepler={modulTalepleri}
            onTalep={talepEt}
          />
        );
      }
    }

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
          moduller={modulDurumu}
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

    if (activeMenu === "musteriBulma") {
      return <MusteriBulmaPanel ownerId={teamCtx?.effectiveOwnerId || session?.user?.id} />;
    }

    if (activeMenu === "sosyalMedya") {
      return <SosyalMedyaPanel ownerId={teamCtx?.effectiveOwnerId || session?.user?.id} />;
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
        {/* Davet linki her şeyin önünde gelir: /app?davet=<token> ile gelen
            kullanıcı giriş ekranını değil hesap kurulum ekranını görür.
            Oturum açıkken de gösterilir — yükseltme davetlerine tıklayan
            kullanıcı zaten giriş yapmış oluyor; ekranı kapatınca uygulamaya
            geri döner. */}
        {davetToken ? (
          <DavetEkrani
            token={davetToken}
            onAuth={setSession}
            onGiriseDon={() => {
              setDavetToken("");
              try { window.history.replaceState({}, "", "/app"); } catch {}
            }}
          />
        ) : !session && showLanding ? (
          <LandingPage
            onGoToLogin={() => { setInitialRegister(false); setShowLanding(false); }}
            onGoToRegister={() => { setInitialRegister(true); setShowLanding(false); }}
            lang={lang}
            onLangChange={setLang}
          />
        ) : !session ? (
          <AuthScreen onAuth={setSession} initialRegister={initialRegister} onBack={() => { window.location.href = "/"; }} />
        ) : (
          <div
            className="flex h-screen overflow-hidden flex-col md:flex-row"
            style={{
              background: "#111318",
              color: "#e2e8f0",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {/* Sidebar ≥1024px · ikon rayı 768–1023px · üst bar + drawer <768px.
                LeftPanel her iki uçtaki (sidebar + mobil) parçaları içerir;
                aradaki tablet aralığını TabletRail doldurur. */}
            <LeftPanel
              activeMenu={activeMenu}
              setActiveMenu={handleMenuChange}
              userEmail={session.user.email}
              userRole={userRole}
              onLogout={handleLogout}
              onSelectCustomer={userRole === "admin" ? handleSelectCustomer : undefined}
              staffMode={teamCtx?.role === "staff"}
              acikModuller={acikModuller}
            />

            <TabletRail
              activeMenu={activeMenu}
              setActiveMenu={handleMenuChange}
              userRole={userRole}
              staffMode={teamCtx?.role === "staff"}
              acikModuller={acikModuller}
              onLogout={handleLogout}
            />

            {/* Sağ panel tablette de tam ekran overlay açılır: 64px ray + iki
                panel 1024px altında okunmaz derecede sıkışıyordu. */}
            <div
              className={`flex-1 flex flex-col overflow-hidden pb-0 pt-safe md:pt-0 ${isRightPanelOpen ? "hidden lg:flex" : "flex"
                }`}
              style={{ minWidth: 0, minHeight: 0 }}
            >
              {renderCenterPanel()}
            </div>

            <div
              className={`${isRightPanelOpen
                ? "fixed inset-0 z-50 pt-safe lg:pt-0 lg:static lg:w-auto lg:block"
                : "hidden lg:block"
                }`}
              style={{ background: "#111318", flexShrink: 0 }}
            >
              {renderRightPanel()}
            </div>

            {/* ══ MOBILE BOTTOM NAV (<768px) ══
                Sekmeler MODULLER'den türer ve yalnızca AÇIK paketler çizilir.
                Tek sekme kalıyorsa bar hiç gösterilmez — seçenek sunmayan bir
                gezinme çubuğu ekranın 56px'ini boşuna yer. */}
            {!isRightPanelOpen && (() => {
              const staff = teamCtx?.role === "staff";
              const sekmeler = MODULLER
                .filter((m) => acikModuller.has(m))
                // Staff yalnızca Fatura Merkezi'ne erişir; diğer platformlar
                // ona hiç gösterilmez (App'teki yönlendirmeyle aynı kural).
                .filter((m) => !staff || m === "muhasebe")
                .map((m) => ({
                  modul: m,
                  target: (staff && m === "muhasebe" ? "invoices" : MODUL_TANIM[m].anaMenu) as MenuKey,
                  icon: m === "muhasebe" ? <Calculator size={18} />
                      : m === "musteri_bulma" ? <Users size={18} />
                      : <Share2 size={18} />,
                  label: MODUL_TANIM[m].ad[lang],
                  // Muhasebe, kendi ekranı olan platformların hiçbiri aktif
                  // değilken seçili sayılır (dashboard/fatura/rapor/... hepsi).
                  active: m === "muhasebe"
                    ? MENU_MODUL[activeMenu] !== "musteri_bulma" && MENU_MODUL[activeMenu] !== "sosyal_medya"
                    : activeMenu === MODUL_TANIM[m].anaMenu,
                }));

              if (sekmeler.length < 2) return null;

              return (
              <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe flex items-stretch justify-around"
                style={{
                  background: "rgba(7,10,16,.96)",
                  backdropFilter: "blur(20px)",
                  borderTop: "1px solid rgba(255,255,255,.07)",
                  padding: "0",
                  height: "56px",
                }}>
                {sekmeler.map(item => {
                  const isActive = item.active;
                  return (
                    <button
                      key={item.target}
                      onClick={() => handleMenuChange(item.target)}
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
                        maxWidth: "140px",
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
              );
            })()}
          </div>
        )}
      </LangContext.Provider>
    </ToastProvider>
  );
}
