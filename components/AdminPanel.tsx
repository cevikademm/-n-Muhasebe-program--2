/**
 * FikoAI — Admin Yönetim Paneli
 * Tüm şirketlerin faturalarını süzer, hesap kodlarını düzeltir.
 * + Her şirket için SuSa (Summen & Salden) raporu görüntüleme
 * Sadece Admin rolü erişebilir.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "../LanguageContext";
import { supabase } from "../services/supabaseService";
import { Company, AccountRow, Invoice, InvoiceItem } from "../types";
import { SuSaReport } from "./SuSaReport";
import { AdminCreateUserModal } from "./admin/AdminCreateUserModal";

interface AdminPanelProps {
  accountPlans: AccountRow[];
  onReanalyze?: (invoice: Invoice) => Promise<void>;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
const fmt = (n: number | null) =>
  n == null ? "—" :
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M €";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K €";
  return fmt(n);
};

const STATUS_BADGE: Record<string, string> = {
  pending:   "badge-pending",
  analyzed:  "badge-analyzed",
  duplicate: "badge-duplicate",
  check:     "badge-check",
  error:     "badge-error",
};

interface AllCompany {
  id: number;
  user_id: string;
  company_name: string;
  tax_number: string | null;
  email: string | null;
  city: string | null;
  created_at: string;
  // enriched
  invoiceCount?: number;
  totalVolume?: number;
  userEmail?: string;
  pendingEditRequestCount?: number;
}

// ── Admin detail tab type
type AdminDetailTab = "invoices" | "susa" | "requests";

// ── Edit request row (invoice_edit_requests tablosundan)
type EditRequestRow = {
  id: string;
  invoice_id: string;
  user_id: string;
  note: string | null;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
};

// Fatura alan çıkarıcıları — raw_ai_response fallback ile (DB kolonları Türkçe)
const getSupplierName = (inv: Invoice): string => {
  const raw: any = (inv as any).raw_ai_response || {};
  const fb = raw.fatura_bilgileri || {};
  const h  = raw.header || {};
  return (
    (inv as any).satici_adi ||
    fb.satici_adi ||
    h.supplier_name ||
    (inv as any).satici_vkn ||
    ""
  );
};

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export const AdminPanel: React.FC<AdminPanelProps> = ({ accountPlans, onReanalyze }) => {
  const [reanalyzing, setReanalyzing] = useState(false);
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;

  // ── State
  const [companies,        setCompanies]        = useState<AllCompany[]>([]);
  const [selectedCompany,  setSelectedCompany]  = useState<AllCompany | null>(null);
  const [invoices,         setInvoices]         = useState<Invoice[]>([]);
  const [invoiceItems,     setInvoiceItems]     = useState<InvoiceItem[]>([]);
  const [selectedInvoice,  setSelectedInvoice]  = useState<Invoice | null>(null);
  const [editRequests,     setEditRequests]     = useState<EditRequestRow[]>([]);

  // ── Edit request helpers (yeni tabloya göre)
  const getReqFor = useCallback((invoiceId: string): EditRequestRow | null => {
    // En son talebi getir (resolved_at NULL olan öncelikli)
    const rows = editRequests.filter(r => r.invoice_id === invoiceId);
    if (rows.length === 0) return null;
    const open = rows.find(r => r.resolved_at == null);
    if (open) return open;
    return rows.sort((a,b) => (b.requested_at || "").localeCompare(a.requested_at || ""))[0];
  }, [editRequests]);
  const isPendingFor = useCallback((invoiceId: string): boolean => {
    return editRequests.some(r => r.invoice_id === invoiceId && r.resolved_at == null);
  }, [editRequests]);
  const hasAnyFor = useCallback((invoiceId: string): boolean => {
    return editRequests.some(r => r.invoice_id === invoiceId);
  }, [editRequests]);

  const [loadingCo,        setLoadingCo]        = useState(true);
  const [loadingInv,       setLoadingInv]       = useState(false);
  const [saving,           setSaving]           = useState<string | null>(null); // itemId being saved

  const [coSearch,         setCoSearch]         = useState("");
  const [onlyWithRequests, setOnlyWithRequests] = useState(false);
  const [requestFilter,    setRequestFilter]    = useState<"pending" | "resolved" | "all">("pending");
  const [invSearch,        setInvSearch]        = useState("");
  const [statusFilter,     setStatusFilter]     = useState<string>("all");
  const [yearFilter,       setYearFilter]       = useState<string>("all");

  const [editingItem,      setEditingItem]      = useState<string | null>(null); // item id
  const [editCode,         setEditCode]         = useState("");
  const [editCodeSearch,   setEditCodeSearch]   = useState("");
  const [showCodePicker,   setShowCodePicker]   = useState(false);

  const [toast,            setToast]            = useState<{ msg: string; ok: boolean } | null>(null);

  // ★ NEW: Tab state for detail area (invoices vs susa)
  const [detailTab,        setDetailTab]        = useState<AdminDetailTab>("invoices");

  // Yeni kullanıcı oluşturma modalı
  const [showCreateUser,   setShowCreateUser]   = useState(false);

  const flash = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load ALL companies (admin: no user_id filter)
  const loadCompanies = useCallback(async () => {
    setLoadingCo(true);
    try {
      // companies tablosu — tüm kayıtlar
      const { data: cos, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Her şirket için fatura sayısı + hacim (paralel)
      const enriched: AllCompany[] = await Promise.all(
        (cos || []).map(async (co: any) => {
          const { data: invs } = await supabase
            .from("invoices")
            .select("id, genel_toplam")
            .eq("user_id", co.user_id);

          const invoiceCount = invs?.length ?? 0;
          const totalVolume  = invs?.reduce((s: number, i: any) => s + (i.genel_toplam ?? 0), 0) ?? 0;

          // Bekleyen talep sayısı: yeni invoice_edit_requests tablosundan
          const { count: pendingEditRequestCount } = await supabase
            .from("invoice_edit_requests")
            .select("id", { count: "exact", head: true })
            .eq("user_id", co.user_id)
            .is("resolved_at", null);

          // Kullanıcı e-posta: profiles tablosu veya auth.users — profiles'dan dene
          let userEmail = "";
          const { data: prof } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", co.user_id)
            .maybeSingle();
          userEmail = prof?.email || co.email || co.user_id.substring(0, 8) + "…";

          return { ...co, invoiceCount, totalVolume, userEmail, pendingEditRequestCount: pendingEditRequestCount || 0 };
        })
      );

      setCompanies(enriched);
    } catch (e: any) {
      flash(tr("Şirketler yüklenemedi: ","Fehler: ") + e.message, false);
    } finally {
      setLoadingCo(false);
    }
  }, []);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  // ── Load invoices for selected company's user
  const loadInvoices = useCallback(async (userId: string) => {
    setLoadingInv(true);
    setInvoices([]);
    setInvoiceItems([]);
    setEditRequests([]);
    setSelectedInvoice(null);
    try {
      const { data: invs, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", userId)
        .order("tarih", { ascending: false });

      if (error) throw error;
      setInvoices((invs || []) as Invoice[]);

      // Edit requests (yeni tablo)
      const { data: ers } = await supabase
        .from("invoice_edit_requests")
        .select("*")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false });
      setEditRequests((ers || []) as EditRequestRow[]);

      if (invs && invs.length > 0) {
        const ids = invs.map((i: any) => i.id);
        const { data: items } = await supabase
          .from("invoice_items")
          .select("*")
          .in("invoice_id", ids);
        setInvoiceItems((items || []) as InvoiceItem[]);
      }
    } catch (e: any) {
      flash(tr("Faturalar yüklenemedi: ","Fehler: ") + e.message, false);
    } finally {
      setLoadingInv(false);
    }
  }, []);

  const selectCompany = (co: AllCompany) => {
    setSelectedCompany(co);
    setSelectedInvoice(null);
    setEditingItem(null);
    setDetailTab("invoices"); // ★ Şirket değişince varsayılan tab'a dön
    loadInvoices(co.user_id);
  };

  // ── Filtered companies
  const filteredCompanies = useMemo(() =>
    companies.filter(co => {
      if (onlyWithRequests && !(co.pendingEditRequestCount && co.pendingEditRequestCount > 0)) return false;
      if (!coSearch) return true;
      const q = coSearch.toLowerCase();
      return (
        co.company_name.toLowerCase().includes(q) ||
        !!co.userEmail?.toLowerCase().includes(q) ||
        !!co.city?.toLowerCase().includes(q)
      );
    }), [companies, coSearch, onlyWithRequests]);

  const totalPendingRequests = useMemo(
    () => companies.reduce((s, c) => s + (c.pendingEditRequestCount || 0), 0),
    [companies]
  );

  // ── Filtered invoices
  const years = useMemo(() => {
    const ys = new Set(invoices.map(i => (i as any).tarih?.substring(0, 4)).filter(Boolean));
    return Array.from(ys).sort().reverse() as string[];
  }, [invoices]);

  const filteredInvoices = useMemo(() =>
    invoices.filter(inv => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (yearFilter   !== "all" && !(inv as any).tarih?.startsWith(yearFilter)) return false;
      if (invSearch && !(
        getSupplierName(inv)?.toLowerCase().includes(invSearch.toLowerCase()) ||
        inv.fatura_no?.toLowerCase().includes(invSearch.toLowerCase())
      )) return false;
      return true;
    }), [invoices, statusFilter, yearFilter, invSearch]);

  // ── Items for selected invoice
  const selectedItems = useMemo(() =>
    selectedInvoice
      ? invoiceItems.filter(item => item.invoice_id === selectedInvoice.id)
      : [],
    [selectedInvoice, invoiceItems]);

  // ── Account code picker
  const filteredAccounts = useMemo(() => {
    if (!editCodeSearch.trim()) return accountPlans.slice(0, 60);
    const q = editCodeSearch.toLowerCase();
    return accountPlans.filter(a =>
      a.account_code?.toLowerCase().includes(q) ||
      a.account_description?.toLowerCase().includes(q)
    ).slice(0, 60);
  }, [accountPlans, editCodeSearch]);

  // ── Update item account code
  const saveItemCode = async (item: InvoiceItem, newCode: string, newName: string) => {
    setSaving(item.id);
    try {
      const { error } = await supabase
        .from("invoice_items")
        .update({
          account_code:        newCode,
          account_name:        newName,
          match_score:         100,
          match_justification: `Admin tarafından düzeltildi (${new Date().toISOString().substring(0,10)})`,
        })
        .eq("id", item.id);

      if (error) throw error;

      setInvoiceItems(prev =>
        prev.map(i => i.id === item.id
          ? { ...i, account_code: newCode, account_name: newName, match_score: 100 }
          : i
        )
      );
      setEditingItem(null);
      setEditCode("");
      setEditCodeSearch("");
      flash(tr(`✓ Kalem güncellendi → ${newCode}`, `✓ Position aktualisiert → ${newCode}`));
    } catch (e: any) {
      flash(tr("Hata: ","Fehler: ") + e.message, false);
    } finally {
      setSaving(null);
    }
  };

  // ── Admin: talebi resolution ile çözüldü işaretle
  const markRequestResolved = async (invoiceId: string, resolution: "manual" | "reanalyzed", silent = false) => {
    try {
      const open = editRequests.find(r => r.invoice_id === invoiceId && r.resolved_at == null);
      if (!open) return;
      const resolvedAt = new Date().toISOString();
      const { error } = await supabase
        .from("invoice_edit_requests")
        .update({ resolved_at: resolvedAt, resolution })
        .eq("id", open.id);
      if (error) throw error;

      // Local state
      setEditRequests(prev => prev.map(r =>
        r.id === open.id ? { ...r, resolved_at: resolvedAt, resolution } : r
      ));
      // Sol rozet sayısını azalt
      if (selectedCompany) {
        setCompanies(prev => prev.map(c =>
          c.user_id === selectedCompany.user_id
            ? { ...c, pendingEditRequestCount: Math.max(0, (c.pendingEditRequestCount || 1) - 1) }
            : c
        ));
      }
      // Kullanıcı tarafı view'i için JSONB'yi de güncelle (best-effort)
      const inv = invoices.find(i => i.id === invoiceId);
      if (inv) {
        const raw: any = (inv as any).raw_ai_response || {};
        const newRaw = {
          ...raw,
          edit_request: {
            ...(raw.edit_request || {}),
            requested: false,
            resolved_at: resolvedAt,
            resolved_by: resolution === "reanalyzed" ? "reanalyze" : "admin",
          },
        };
        try {
          await supabase.from("invoices").update({ raw_ai_response: newRaw }).eq("id", invoiceId);
          setInvoices(prev => prev.map(i =>
            i.id === invoiceId ? ({ ...i, raw_ai_response: newRaw } as any) : i
          ));
        } catch {}
      }
      if (!silent) flash(tr("✓ Talep çözüldü olarak işaretlendi", "✓ Anfrage als erledigt markiert"));
    } catch (e: any) {
      flash(tr("Hata: ", "Fehler: ") + e.message, false);
    }
  };

  const resolveEditRequest = async (invoice: Invoice) => {
    if (!window.confirm(tr(
      "Bu düzenleme talebini çözüldü olarak işaretle?",
      "Diese Bearbeitungsanfrage als erledigt markieren?"
    ))) return;
    await markRequestResolved(invoice.id, "manual");
  };

  // ── Requests tabı için hesaplanan listeler — yeni tabloya göre
  const editRequestInvoices = useMemo(() => {
    const byInvId = new Map<string, Invoice>(invoices.map(i => [i.id, i] as [string, Invoice]));
    // Tabloda olan invoice_id'leri al; her biri için invoice'a join et
    const seen = new Set<string>();
    const list: Invoice[] = [];
    for (const r of editRequests) {
      if (seen.has(r.invoice_id)) continue;
      const inv = byInvId.get(r.invoice_id);
      if (!inv) continue;
      const pending = r.resolved_at == null;
      if (requestFilter === "pending"  && !pending) continue;
      if (requestFilter === "resolved" &&  pending) continue;
      seen.add(r.invoice_id);
      list.push(inv);
    }
    return list;
  }, [invoices, editRequests, requestFilter]);

  const pendingRequestsForSelected = useMemo(
    () => editRequests.filter(r => r.resolved_at == null).length,
    [editRequests]
  );

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "#111318" }}>

      {/* ── Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-md text-xs font-semibold shadow-lg"
          style={toast.ok
            ? { background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.25)", color:"#10b981" }
            : { background:"rgba(239,68,68,.12)",  border:"1px solid rgba(239,68,68,.25)",  color:"#f87171" }}>
          {toast.msg}
        </div>
      )}

      {/* ── Header */}
      <div className="shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ background:"#0d0f15", borderBottom:"1px solid #1c1f27" }}>
        <div>
          <h1 className="font-syne font-bold text-lg text-slate-100 flex items-center gap-2">
            <span className="font-mono text-sm" style={{ color:"#06b6d4" }}>◉</span>
            {tr("Admin Yönetim Paneli","Admin-Panel")}
            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background:"rgba(239,68,68,.1)", color:"#f87171", border:"1px solid rgba(239,68,68,.2)" }}>
              👑 Admin
            </span>
          </h1>
          <p className="text-xs mt-0.5" style={{ color:"#3a3f4a" }}>
            {tr(
              "Tüm kullanıcıların şirket ve fatura verilerine erişim — sadece yetkili admin görüntüleyebilir",
              "Zugriff auf alle Firmen- und Rechnungsdaten — nur autorisierte Admins"
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono px-3 py-1.5 rounded-full"
            style={{ background:"rgba(6,182,212,.08)", color:"#06b6d4", border:"1px solid rgba(6,182,212,.15)" }}>
            {loadingCo ? "..." : `${companies.length} ${tr("şirket","Firmen")}`}
          </div>
          <button
            onClick={() => setShowCreateUser(true)}
            className="px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 font-semibold"
            style={{
              background: "linear-gradient(135deg, #06b6d4, #0891b2)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(6,182,212,0.25)",
            }}
            title={tr("Yeni kullanıcı oluştur","Neuen Benutzer anlegen")}
          >
            + {tr("Yeni Kullanıcı","Neuer Benutzer")}
          </button>
          <button onClick={loadCompanies}
            className="c-btn-ghost px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5">
            ↺ {tr("Yenile","Aktualisieren")}
          </button>
        </div>
      </div>

      {showCreateUser && (
        <AdminCreateUserModal
          onClose={() => setShowCreateUser(false)}
          onCreated={() => { loadCompanies(); flash(tr("✓ Kullanıcı oluşturuldu","✓ Benutzer erstellt")); }}
        />
      )}

      {/* ── Body: 3 kolon */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ════════════ KOL 1: ŞİRKETLER ════════════ */}
        <div className={`w-full md:w-72 shrink-0 flex-col overflow-hidden ${selectedCompany ? 'hidden md:flex' : 'flex'}`}
          style={{ borderRight:"1px solid #1c1f27", background:"#0d0f15" }}>

          <div className="px-4 py-3 shrink-0" style={{ borderBottom:"1px solid #1c1f27" }}>
            <div className="c-section-title mb-2 flex items-center justify-between">
              <span>{tr("Şirketler","Firmen")}</span>
              {totalPendingRequests > 0 && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono"
                  style={{ background:"rgba(245,158,11,.12)", color:"#f59e0b", border:"1px solid rgba(245,158,11,.25)" }}
                  title={tr("Bekleyen düzenleme talepleri","Offene Bearbeitungsanfragen")}
                >
                  🔔 {totalPendingRequests}
                </span>
              )}
            </div>
            <input
              className="c-input text-xs w-full"
              placeholder={tr("İsim, e-posta veya şehir ara...","Name, E-Mail oder Stadt...")}
              value={coSearch}
              onChange={e => setCoSearch(e.target.value)}
              style={{ padding:"6px 10px" }}
            />
            <label
              className="flex items-center gap-1.5 mt-2 text-[10px] cursor-pointer select-none"
              style={{ color: onlyWithRequests ? "#f59e0b" : "#64748b" }}
            >
              <input
                type="checkbox"
                checked={onlyWithRequests}
                onChange={e => setOnlyWithRequests(e.target.checked)}
                style={{ accentColor:"#f59e0b" }}
              />
              {tr("Sadece talepli şirketler", "Nur Firmen mit Anfragen")}
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingCo ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 rounded-full animate-spin"
                  style={{ borderColor:"rgba(6,182,212,.2)", borderTopColor:"#06b6d4" }} />
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="py-12 text-center text-xs" style={{ color:"#3a3f4a" }}>
                <div className="font-mono text-xl mb-2" style={{ color:"#1c1f27" }}>⬡</div>
                {tr("Şirket bulunamadı","Keine Firmen gefunden")}
              </div>
            ) : (
              filteredCompanies.map(co => {
                const isSelected = selectedCompany?.id === co.id;
                return (
                  <button key={co.id} onClick={() => selectCompany(co)}
                    className="w-full text-left px-4 py-3.5 transition-all border-none cursor-pointer"
                    style={{
                      background: isSelected ? "rgba(6,182,212,.08)" : "transparent",
                      borderBottom: "1px solid #1c1f27",
                      borderLeft:   `2px solid ${isSelected ? "#06b6d4" : "transparent"}`,
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>

                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-syne font-semibold text-sm text-slate-200 leading-tight line-clamp-1">
                        {co.company_name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0" style={{ marginTop:"2px" }}>
                        {!!co.pendingEditRequestCount && co.pendingEditRequestCount > 0 && (
                          <span
                            className="font-mono text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{
                              background:"rgba(245,158,11,.14)",
                              color:"#f59e0b",
                              border:"1px solid rgba(245,158,11,.3)",
                            }}
                            title={tr("Bekleyen düzenleme talebi", "Offene Bearbeitungsanfragen")}
                          >
                            🔔 {co.pendingEditRequestCount}
                          </span>
                        )}
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background:"rgba(6,182,212,.1)", color:"#06b6d4" }}>
                          {co.invoiceCount} {tr("fatura","Rech.")}
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] space-y-0.5">
                      <div className="flex items-center gap-1.5 truncate" style={{ color:"#3a3f4a" }}>
                        <span className="font-mono">@</span>
                        <span className="truncate">{co.userEmail}</span>
                      </div>
                      {co.city && (
                        <div style={{ color:"#2a3040" }}>📍 {co.city}</div>
                      )}
                      <div className="font-syne font-semibold" style={{ color: isSelected ? "#06b6d4" : "#3a3f4a" }}>
                        {fmtShort(co.totalVolume || 0)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ════════════ KOL 2+3: DETAY ALANI (TAB BAZLI) ════════════ */}
        <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${!selectedCompany ? '' : ''}`}>

          {!selectedCompany ? (
            /* ── Şirket seçilmemiş: boş durum */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-8">
                <div className="font-mono text-4xl mb-4" style={{ color:"#1c1f27" }}>◉</div>
                <p className="text-sm font-syne font-semibold text-slate-400 mb-1">
                  {tr("Sol panelden bir şirket seçin","Wählen Sie eine Firma aus")}
                </p>
                <p className="text-xs" style={{ color:"#2a3040" }}>
                  {tr("Seçilen şirketin tüm fatura verileri burada görünür","Alle Rechnungsdaten der Firma werden hier angezeigt")}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* ═══════════════════════════════════════════════
                  ★ TAB BAR: Faturalar | SuSa Raporu
              ═══════════════════════════════════════════════ */}
              <div className="shrink-0 px-4 py-0 flex items-center gap-0"
                style={{ background:"#0d0f15", borderBottom:"1px solid #1c1f27" }}>

                {/* Mobil geri butonu */}
                <button
                  className="md:hidden w-8 h-8 flex items-center justify-center rounded-md mr-2 shrink-0"
                  style={{ background:"rgba(255,255,255,.04)", color:"#94a3b8" }}
                  onClick={() => setSelectedCompany(null)}
                >
                  ←
                </button>

                {/* Şirket bilgisi */}
                <div className="flex-1 min-w-0 py-3 pr-4">
                  <div className="font-syne font-bold text-sm text-slate-100 leading-tight truncate">
                    {selectedCompany.company_name}
                  </div>
                  <div className="text-[10px] mt-0.5 truncate" style={{ color:"#3a3f4a" }}>
                    {selectedCompany.userEmail} · {invoices.length} {tr("fatura","Rechnungen")}
                    {selectedCompany.tax_number && ` · ${tr("VKN","StNr")}: ${selectedCompany.tax_number}`}
                  </div>
                </div>

                {/* Tab butonları */}
                <div className="flex items-center gap-1 shrink-0">
                  {([
                    { key: "invoices" as AdminDetailTab, icon: "◧", label: tr("Faturalar", "Rechnungen"), badge: 0 },
                    { key: "requests" as AdminDetailTab, icon: "🔔", label: tr("Talepler", "Anfragen"), badge: pendingRequestsForSelected },
                    { key: "susa"     as AdminDetailTab, icon: "≡", label: tr("SuSa Raporu", "Summen & Salden"), badge: 0 },
                  ]).map(tab => {
                    const isActive = detailTab === tab.key;
                    const isRequestTab = tab.key === "requests";
                    const activeColor = isRequestTab ? "#f59e0b" : "#06b6d4";
                    const activeBg    = isRequestTab ? "rgba(245,158,11,.1)" : "rgba(6,182,212,.1)";
                    return (
                      <button
                        key={tab.key}
                        onClick={() => {
                          setDetailTab(tab.key);
                          if (tab.key !== "invoices") {
                            setSelectedInvoice(null);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-md transition-all border-none cursor-pointer"
                        style={{
                          background: isActive ? activeBg : "transparent",
                          color:      isActive ? activeColor : "#64748b",
                          borderBottom: isActive ? `2px solid ${activeColor}` : "2px solid transparent",
                          fontWeight:  isActive ? 700 : 500,
                          marginBottom: "-1px",
                        }}
                        onMouseEnter={e => {
                          if (!isActive) (e.currentTarget as HTMLElement).style.color = "#94a3b8";
                        }}
                        onMouseLeave={e => {
                          if (!isActive) (e.currentTarget as HTMLElement).style.color = "#64748b";
                        }}
                      >
                        <span className="font-mono text-xs">{tab.icon}</span>
                        {tab.label}
                        {tab.badge > 0 && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono ml-1"
                            style={{
                              background: "rgba(245,158,11,.18)",
                              color: "#f59e0b",
                              border: "1px solid rgba(245,158,11,.3)",
                            }}
                          >
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {loadingInv && (
                  <div className="w-4 h-4 border-2 rounded-full animate-spin shrink-0 ml-3"
                    style={{ borderColor:"rgba(6,182,212,.2)", borderTopColor:"#06b6d4" }} />
                )}
              </div>

              {/* ═══════════════════════════════════════════════
                  ★ TAB CONTENT
              ═══════════════════════════════════════════════ */}

              {/* ───── TAB: SuSa Raporu ───── */}
              {detailTab === "susa" && (
                <div className="flex-1 overflow-y-auto p-4" style={{ background:"#111318" }}>
                  {loadingInv ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="w-6 h-6 border-2 rounded-full animate-spin"
                        style={{ borderColor:"rgba(6,182,212,.2)", borderTopColor:"#06b6d4" }} />
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="font-mono text-4xl mb-4" style={{ color:"#1c1f27" }}>≡</div>
                      <p className="font-syne font-semibold text-slate-400 mb-1">
                        {tr("Bu şirket için fatura verisi yok","Keine Rechnungsdaten für diese Firma")}
                      </p>
                      <p className="text-xs" style={{ color:"#3a3f4a" }}>
                        {tr("SuSa raporu oluşturmak için önce fatura yükleyin","Bitte Rechnungen hochladen, um SuSa zu generieren")}
                      </p>
                    </div>
                  ) : (
                    <SuSaReport
                      invoices={invoices}
                      invoiceItems={invoiceItems}
                      companyName={selectedCompany.company_name}
                      clientNumber={selectedCompany.tax_number || `${selectedCompany.id}`}
                    />
                  )}
                </div>
              )}

              {/* ───── TAB: Talepler (düzenleme talepleri) ───── */}
              {detailTab === "requests" && (
                <div className="flex-1 overflow-y-auto" style={{ background:"#111318" }}>
                  {/* Filtre bar */}
                  <div className="shrink-0 px-5 py-3 flex items-center gap-2"
                    style={{ background:"#0d0f15", borderBottom:"1px solid #1c1f27" }}>
                    <span className="text-[10px] font-syne font-semibold" style={{ color:"#64748b" }}>
                      {tr("Durum:", "Status:")}
                    </span>
                    {([
                      { key: "pending"  as const, label: tr("Bekleyen",  "Offen")     },
                      { key: "resolved" as const, label: tr("Çözüldü",   "Erledigt")  },
                      { key: "all"      as const, label: tr("Tümü",      "Alle")      },
                    ]).map(f => {
                      const active = requestFilter === f.key;
                      return (
                        <button
                          key={f.key}
                          onClick={() => setRequestFilter(f.key)}
                          className="px-2.5 py-1 text-[10px] rounded-md border-none cursor-pointer font-mono"
                          style={{
                            background: active ? "rgba(245,158,11,.14)" : "rgba(255,255,255,.03)",
                            color:      active ? "#f59e0b" : "#64748b",
                            border:     active ? "1px solid rgba(245,158,11,.3)" : "1px solid transparent",
                            fontWeight: active ? 700 : 500,
                          }}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-4">
                    {loadingInv ? (
                      <div className="flex items-center justify-center py-20">
                        <div className="w-6 h-6 border-2 rounded-full animate-spin"
                          style={{ borderColor:"rgba(245,158,11,.2)", borderTopColor:"#f59e0b" }} />
                      </div>
                    ) : editRequestInvoices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="font-mono text-4xl mb-4" style={{ color:"#1c1f27" }}>🔔</div>
                        <p className="font-syne font-semibold text-slate-400 mb-1">
                          {requestFilter === "pending"
                            ? tr("Bekleyen talep yok", "Keine offenen Anfragen")
                            : requestFilter === "resolved"
                              ? tr("Çözülmüş talep yok", "Keine erledigten Anfragen")
                              : tr("Bu şirkette talep bulunamadı", "Keine Anfragen gefunden")}
                        </p>
                        <p className="text-xs" style={{ color:"#3a3f4a" }}>
                          {tr(
                            "Kullanıcı fatura kartından 'Düzenleme Talebi' gönderdiğinde burada görünür.",
                            "Sobald Nutzer eine Bearbeitung anfordern, erscheinen diese hier."
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {editRequestInvoices.map(inv => {
                          const req = getReqFor(inv.id)!;
                          const pending = isPendingFor(inv.id);
                          const reqAt       = req?.requested_at;
                          const reqNote     = req?.note || "";
                          const reqResolved = req?.resolved_at;
                          const reqResolution = req?.resolution;
                          return (
                            <div key={inv.id}
                              className="rounded-lg p-4"
                              style={{
                                background:"#0d0f15",
                                border: pending
                                  ? "1px solid rgba(245,158,11,.3)"
                                  : "1px solid #1c1f27",
                              }}>

                              {/* Üst satır: fatura meta + durum */}
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0 flex-1">
                                  <div className="font-syne font-bold text-sm text-slate-100 truncate">
                                    {getSupplierName(inv) || tr("Tedarikçisiz", "Ohne Lieferant")}
                                  </div>
                                  <div className="text-[10px] mt-0.5 font-mono flex items-center gap-3 flex-wrap" style={{ color:"#3a3f4a" }}>
                                    {(inv as any).tarih && <span>{(inv as any).tarih}</span>}
                                    {inv.fatura_no && <span>#{inv.fatura_no}</span>}
                                    {inv.genel_toplam != null && (
                                      <span className="font-semibold text-slate-300">{fmt(inv.genel_toplam)}</span>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className="text-[9px] font-bold px-2 py-0.5 rounded-full font-mono shrink-0"
                                  style={pending
                                    ? { background:"rgba(245,158,11,.14)", color:"#f59e0b", border:"1px solid rgba(245,158,11,.3)" }
                                    : { background:"rgba(16,185,129,.12)", color:"#10b981", border:"1px solid rgba(16,185,129,.25)" }}>
                                  {pending ? tr("BEKLİYOR","OFFEN") : tr("ÇÖZÜLDÜ","ERLEDIGT")}
                                </span>
                              </div>

                              {/* Talep notu */}
                              <div className="rounded-md p-3 mb-3"
                                style={{ background:"rgba(255,255,255,.02)", border:"1px solid #1c1f27" }}>
                                <div className="text-[9px] font-syne font-semibold mb-1" style={{ color:"#64748b" }}>
                                  {tr("KULLANICI NOTU", "NUTZERNOTIZ")}
                                </div>
                                <div className="text-xs text-slate-200 whitespace-pre-wrap break-words">
                                  {reqNote.trim() || tr("(not yok)", "(keine Notiz)")}
                                </div>
                              </div>

                              {/* Tarih bilgileri */}
                              <div className="flex items-center gap-4 text-[10px] font-mono mb-3" style={{ color:"#3a3f4a" }}>
                                {reqAt && (
                                  <span>📨 {tr("Talep", "Anfrage")}: {new Date(reqAt).toLocaleString(lang === "tr" ? "tr-TR" : "de-DE")}</span>
                                )}
                                {reqResolved && (
                                  <span style={{ color:"#10b981" }}>
                                    ✓ {tr("Çözüldü", "Erledigt")}: {new Date(reqResolved).toLocaleString(lang === "tr" ? "tr-TR" : "de-DE")}
                                    {reqResolution === "reanalyzed" && " · 🤖 AI"}
                                  </span>
                                )}
                              </div>

                              {/* Aksiyonlar */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setDetailTab("invoices");
                                    setSelectedInvoice(inv);
                                  }}
                                  className="px-3 py-1.5 text-[10px] rounded-md border-none cursor-pointer font-syne font-semibold"
                                  style={{
                                    background:"rgba(6,182,212,.1)",
                                    color:"#06b6d4",
                                    border:"1px solid rgba(6,182,212,.25)",
                                  }}
                                >
                                  ◧ {tr("Faturayı Aç", "Rechnung öffnen")}
                                </button>
                                {onReanalyze && (inv as any).file_url && (
                                  <button
                                    disabled={reanalyzing}
                                    onClick={async () => {
                                      setReanalyzing(true);
                                      try {
                                        await onReanalyze(inv);
                                        // Açık talebi 'reanalyzed' olarak çöz
                                        if (isPendingFor(inv.id)) {
                                          await markRequestResolved(inv.id, "reanalyzed", true);
                                        }
                                        if (selectedCompany) await loadInvoices(selectedCompany.user_id);
                                      } catch (err: any) {
                                        alert(tr("Hata: ","Fehler: ") + (err?.message || err));
                                      } finally {
                                        setReanalyzing(false);
                                      }
                                    }}
                                    className="px-3 py-1.5 text-[10px] rounded-md border-none font-syne font-semibold"
                                    style={{
                                      background:"rgba(168,85,247,.12)",
                                      color:"#a855f7",
                                      border:"1px solid rgba(168,85,247,.3)",
                                      cursor: reanalyzing ? "wait" : "pointer",
                                      opacity: reanalyzing ? .6 : 1,
                                    }}
                                  >
                                    {reanalyzing ? "⏳ " + tr("Analiz...","Analyse...") : "🤖 " + tr("AI ile Analiz","KI-Analyse")}
                                  </button>
                                )}
                                <button
                                  title={tr("Yenile","Aktualisieren")}
                                  onClick={() => { if (selectedCompany) loadInvoices(selectedCompany.user_id); }}
                                  className="px-3 py-1.5 text-[10px] rounded-md border-none cursor-pointer font-syne font-semibold"
                                  style={{
                                    background:"rgba(255,255,255,.04)",
                                    color:"#94a3b8",
                                    border:"1px solid #1c1f27",
                                  }}
                                >
                                  ↻ {tr("Yenile","Aktualisieren")}
                                </button>
                                {pending && (
                                  <button
                                    onClick={() => resolveEditRequest(inv)}
                                    className="px-3 py-1.5 text-[10px] rounded-md border-none cursor-pointer font-syne font-semibold"
                                    style={{
                                      background:"rgba(16,185,129,.1)",
                                      color:"#10b981",
                                      border:"1px solid rgba(16,185,129,.25)",
                                    }}
                                  >
                                    ✓ {tr("Çözüldü İşaretle", "Als erledigt")}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ───── TAB: Faturalar (mevcut 2-kolon yapısı) ───── */}
              {detailTab === "invoices" && (
                <div className="flex-1 flex overflow-hidden">

                  {/* ════ FATURA LİSTESİ ════ */}
                  <div className={`w-full flex-col overflow-hidden ${selectedInvoice ? 'hidden md:flex' : 'flex'}`}
                    style={{
                      width: selectedInvoice ? "340px" : "100%",
                      minWidth:"280px",
                      borderRight: selectedInvoice ? "1px solid #1c1f27" : "none",
                      transition:"width 0.3s ease",
                      flexShrink: 0,
                    }}>

                    {/* Filtreler */}
                    <div className="shrink-0 px-4 py-3 space-y-3"
                      style={{ background:"#0d0f15", borderBottom:"1px solid #1c1f27" }}>
                      <div className="flex gap-2 flex-wrap">
                        <input className="c-input text-xs flex-1 min-w-0"
                          placeholder={tr("Tedarikçi / No ara...","Lieferant / Nr. suchen...")}
                          value={invSearch} onChange={e => setInvSearch(e.target.value)}
                          style={{ padding:"5px 8px" }} />

                        <select className="c-input text-xs font-mono" value={statusFilter}
                          onChange={e => setStatusFilter(e.target.value)}
                          style={{ padding:"5px 8px", width:"90px" }}>
                          <option value="all">{tr("Tümü","Alle")}</option>
                          <option value="pending">{tr("Bekleyen","Wartend")}</option>
                          <option value="analyzed">{tr("Analiz","Analysiert")}</option>
                          <option value="duplicate">{tr("Mükerrer","Doppelt")}</option>
                          <option value="check">{tr("Kontrol","Prüfen")}</option>
                          <option value="error">Hata</option>
                        </select>

                        {years.length > 0 && (
                          <select className="c-input text-xs font-mono" value={yearFilter}
                            onChange={e => setYearFilter(e.target.value)}
                            style={{ padding:"5px 8px", width:"72px" }}>
                            <option value="all">{tr("Tümü","Alle")}</option>
                            {years.map(y => <option key={y}>{y}</option>)}
                          </select>
                        )}
                      </div>

                      {/* KPI mini row */}
                      {invoices.length > 0 && (
                        <div className="flex gap-3 text-[10px] font-mono">
                          {[
                            { label: tr("Toplam","Gesamt"),    val: fmt(invoices.reduce((s,i) => s+(i.genel_toplam||0),0)) },
                            { label: tr("Net","Netto"),        val: fmt(invoices.reduce((s,i) => s+(i.ara_toplam||0),0))   },
                            { label: tr("KDV","USt"),          val: fmt(invoices.reduce((s,i) => s+(i.toplam_kdv||0),0))   },
                          ].map((k,i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span style={{ color:"#3a3f4a" }}>{k.label}:</span>
                              <span className="font-semibold text-slate-300">{k.val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Fatura listesi */}
                    <div className="flex-1 overflow-y-auto">
                      {loadingInv ? (
                        <div className="flex items-center justify-center py-16">
                          <div className="w-5 h-5 border-2 rounded-full animate-spin"
                            style={{ borderColor:"rgba(6,182,212,.2)", borderTopColor:"#06b6d4" }} />
                        </div>
                      ) : filteredInvoices.length === 0 ? (
                        <div className="py-12 text-center text-xs" style={{ color:"#3a3f4a" }}>
                          <div className="font-mono text-xl mb-2" style={{ color:"#1c1f27" }}>◧</div>
                          {tr("Fatura bulunamadı","Keine Rechnungen")}
                        </div>
                      ) : (
                        filteredInvoices.map(inv => {
                          const isSelected = selectedInvoice?.id === inv.id;
                          const items      = invoiceItems.filter(i => i.invoice_id === inv.id);
                          const hasIssues  = items.some(i => (i.match_score || 0) < 80);
                          return (
                            <button key={inv.id} onClick={() => setSelectedInvoice(isSelected ? null : inv)}
                              className="w-full text-left px-4 py-3 transition-all border-none cursor-pointer"
                              style={{
                                background:   isSelected ? "rgba(6,182,212,.06)" : "transparent",
                                borderBottom: "1px solid #1c1f27",
                                borderLeft:   `2px solid ${isSelected ? "#06b6d4" : hasIssues ? "rgba(245,158,11,.4)" : "transparent"}`,
                              }}
                              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"; }}
                              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>

                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className="font-semibold text-sm text-slate-200 truncate leading-tight">
                                  {getSupplierName(inv) || tr("Tedarikçisiz","Ohne Lieferant")}
                                </span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[inv.status] || "badge-pending"}`}>
                                  {inv.status}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[10px]">
                                <div className="flex items-center gap-2" style={{ color:"#3a3f4a" }}>
                                  <span className="font-mono">{(inv as any).tarih || "—"}</span>
                                  {inv.fatura_no && (
                                    <span className="truncate max-w-[80px]">#{inv.fatura_no}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {hasIssues && (
                                    <span style={{ color:"#f59e0b", fontSize:"9px" }}>⚠ {tr("Düşük eşleşme","Niedrige Übereinstimmung")}</span>
                                  )}
                                  <span className="font-syne font-bold text-slate-200">
                                    {inv.genel_toplam != null ? fmt(inv.genel_toplam) : "—"}
                                  </span>
                                </div>
                              </div>

                              {items.length > 0 && (
                                <div className="mt-1 text-[9px] font-mono" style={{ color:"#2a3040" }}>
                                  {items.length} {tr("kalem","Pos.")}
                                  {hasIssues && ` · ${items.filter(i=>(i.match_score||0)<80).length} ${tr("düşük","niedrig")}`}
                                </div>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* ════ KALEMLER & HESAP KODU DÜZENLEME ════ */}
                  {selectedInvoice && (
                    <div className={`w-full md:flex-1 flex-col overflow-hidden min-w-0 ${!selectedInvoice ? 'hidden md:flex' : 'flex'}`}>

                      {/* Header */}
                      <div className="shrink-0 px-5 py-3 flex items-center justify-between"
                        style={{ background:"#0d0f15", borderBottom:"1px solid #1c1f27" }}>
                        <div className="flex items-center gap-3">
                          <button
                            className="md:hidden w-8 h-8 flex items-center justify-center rounded-md bg-slate-800 text-slate-300"
                            onClick={() => setSelectedInvoice(null)}
                          >
                            ←
                          </button>
                          <div>
                            <div className="font-syne font-bold text-sm text-slate-100">
                              {getSupplierName(selectedInvoice) || "—"}
                            </div>
                            <div className="text-[10px] mt-0.5 flex items-center gap-3 font-mono" style={{ color:"#3a3f4a" }}>
                              <span>{(selectedInvoice as any).tarih}</span>
                              {selectedInvoice.fatura_no && <span>#{selectedInvoice.fatura_no}</span>}
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[selectedInvoice.status] || "badge-pending"}`}>
                                {selectedInvoice.status}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-syne font-bold text-slate-100">{fmt(selectedInvoice.genel_toplam)}</div>
                          <div className="text-[10px] font-mono" style={{ color:"#3a3f4a" }}>
                            {tr("Net","Netto")}: {fmt(selectedInvoice.ara_toplam)} · {tr("KDV","USt")}: {fmt(selectedInvoice.toplam_kdv)}
                          </div>
                        </div>
                      </div>

                      {/* PDF / URL / Reanalyze bar */}
                      <div className="shrink-0 px-5 py-3 flex flex-wrap items-center gap-3"
                        style={{ background:"#0a0c11", borderBottom:"1px solid #1c1f27" }}>
                        {(selectedInvoice as any).file_url ? (
                          <>
                            <a
                              href={(selectedInvoice as any).file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 text-[10px] rounded-md font-syne font-semibold"
                              style={{ background:"rgba(6,182,212,.1)", color:"#06b6d4", border:"1px solid rgba(6,182,212,.25)", textDecoration:"none" }}
                            >
                              📄 {tr("PDF'i Aç","PDF öffnen")}
                            </a>
                            <input
                              readOnly
                              value={(selectedInvoice as any).file_url}
                              onClick={(e) => (e.target as HTMLInputElement).select()}
                              className="flex-1 min-w-[200px] px-2 py-1.5 text-[10px] font-mono rounded-md"
                              style={{ background:"#0d0f15", color:"#94a3b8", border:"1px solid #1c1f27" }}
                            />
                            <button
                              onClick={() => { navigator.clipboard.writeText((selectedInvoice as any).file_url); }}
                              className="px-2 py-1.5 text-[10px] rounded-md font-syne font-semibold"
                              style={{ background:"rgba(255,255,255,.04)", color:"#64748b", border:"1px solid #1c1f27", cursor:"pointer" }}
                            >
                              {tr("Kopyala","Kopieren")}
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px]" style={{ color:"#64748b" }}>
                            {tr("Bu fatura için saklı PDF yok (manuel girilmiş olabilir).","Keine PDF-Datei gespeichert (manuell erstellt).")}
                          </span>
                        )}
                        {onReanalyze && (selectedInvoice as any).file_url && (
                          <button
                            disabled={reanalyzing}
                            onClick={async () => {
                              if (!selectedInvoice) return;
                              setReanalyzing(true);
                              try {
                                await onReanalyze(selectedInvoice);
                                alert(tr("Fatura yeniden analiz edildi.","Rechnung wurde neu analysiert."));
                              } catch (err: any) {
                                alert(tr("Hata: ","Fehler: ") + (err?.message || err));
                              } finally {
                                setReanalyzing(false);
                              }
                            }}
                            className="px-3 py-1.5 text-[10px] rounded-md font-syne font-semibold"
                            style={{ background:"rgba(168,85,247,.12)", color:"#a855f7", border:"1px solid rgba(168,85,247,.3)", cursor: reanalyzing ? "wait" : "pointer", opacity: reanalyzing ? .6 : 1 }}
                          >
                            {reanalyzing ? "⏳ " + tr("Analiz ediliyor...","Wird analysiert...") : "🤖 " + tr("AI ile Yeniden Analiz Et","Mit KI neu analysieren")}
                          </button>
                        )}
                      </div>

                      {/* ═════ İçerik: SOL (analiz) | SAĞ (PDF görsel) ═════ */}
                      <div className="flex-1 flex overflow-hidden min-h-0">

                      {/* SOL — analiz sonuçları + kalemler */}
                      <div className="flex-1 overflow-auto min-w-0">
                        {(() => {
                          const raw: any = (selectedInvoice as any).raw_ai_response || {};
                          const fb = raw.fatura_bilgileri || raw.header || {};
                          const saticiAdi = fb.satici_adi || raw.header?.supplier_name || "—";
                          const saticiVkn = (selectedInvoice as any).satici_vkn || fb.satici_vkn || "—";
                          const aliciAdi  = fb.alici_adi  || raw.header?.buyer_name    || "—";
                          const aliciVkn  = (selectedInvoice as any).alici_vkn || fb.alici_vkn || "—";
                          return (
                            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="rounded-lg p-3" style={{ background:"#0d0f15", border:"1px solid #1c1f27" }}>
                                <div className="text-[9px] font-syne font-bold uppercase tracking-wider mb-1" style={{ color:"#06b6d4" }}>
                                  ⬆ {tr("Satıcı","Verkäufer")}
                                </div>
                                <div className="text-xs font-semibold text-slate-200 truncate">{saticiAdi}</div>
                                <div className="text-[10px] font-mono mt-0.5" style={{ color:"#64748b" }}>{saticiVkn}</div>
                              </div>
                              <div className="rounded-lg p-3" style={{ background:"#0d0f15", border:"1px solid #1c1f27" }}>
                                <div className="text-[9px] font-syne font-bold uppercase tracking-wider mb-1" style={{ color:"#a855f7" }}>
                                  ⬇ {tr("Alıcı","Käufer")}
                                </div>
                                <div className="text-xs font-semibold text-slate-200 truncate">{aliciAdi}</div>
                                <div className="text-[10px] font-mono mt-0.5" style={{ color:"#64748b" }}>{aliciVkn}</div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Finansal özet kartı */}
                        <div className="px-5 pb-3">
                          <div className="rounded-lg p-3 flex items-center gap-5 flex-wrap"
                            style={{ background:"rgba(6,182,212,.04)", border:"1px solid rgba(6,182,212,.15)" }}>
                            <div>
                              <div className="text-[9px] font-syne font-bold uppercase tracking-wider" style={{ color:"#64748b" }}>
                                {tr("Ara Toplam","Zwischensumme")}
                              </div>
                              <div className="text-sm font-syne font-bold text-slate-200">{fmt(selectedInvoice.ara_toplam)}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-syne font-bold uppercase tracking-wider" style={{ color:"#64748b" }}>
                                KDV
                              </div>
                              <div className="text-sm font-syne font-bold" style={{ color:"#f59e0b" }}>{fmt(selectedInvoice.toplam_kdv)}</div>
                            </div>
                            <div className="ml-auto">
                              <div className="text-[9px] font-syne font-bold uppercase tracking-wider text-right" style={{ color:"#64748b" }}>
                                {tr("Genel Toplam","Gesamt")}
                              </div>
                              <div className="text-lg font-syne font-bold text-right" style={{ color:"#06b6d4" }}>{fmt(selectedInvoice.genel_toplam)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Kalemler başlığı */}
                        <div className="px-5 pb-2 flex items-center gap-2">
                          <span className="text-[10px] font-syne font-bold uppercase tracking-wider" style={{ color:"#06b6d4" }}>
                            📦 {tr("Kalemler","Positionen")}
                          </span>
                          <span className="text-[10px]" style={{ color:"#3a3f4a" }}>({selectedItems.length})</span>
                        </div>

                      {/* Items table */}
                      <div className="px-5 pb-5">
                        {selectedItems.length === 0 ? (
                          <div className="flex items-center justify-center py-16 text-xs" style={{ color:"#3a3f4a" }}>
                            {tr("Bu faturada kalem bulunamadı","Keine Positionen für diese Rechnung")}
                          </div>
                        ) : (
                          <table className="w-full border-collapse text-xs" style={{ minWidth:"700px" }}>
                            <thead>
                              <tr>
                                {[
                                  tr("Açıklama","Beschreibung"),
                                  tr("Miktar","Menge"),
                                  tr("Brüt","Brutto"),
                                  tr("Hesap Kodu","Konto"),
                                  tr("Eşleşme","Übereinstimmung"),
                                  tr("Kaynak","Quelle"),
                                  tr("İşlem","Aktion"),
                                ].map((h, i) => (
                                  <th key={i} className="px-4 py-3 text-left whitespace-nowrap sticky top-0"
                                    style={{ background:"#0d0f15", color:"#3a3f4a", borderBottom:"1px solid #1c1f27",
                                      fontSize:"9px", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", zIndex:1 }}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedItems.map(item => {
                                const isEditing  = editingItem === item.id;
                                const score      = item.match_score ?? 0;
                                const scoreColor = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";
                                const source     = (item as any).match_source || "ai";

                                return (
                                  <React.Fragment key={item.id}>
                                    {/* Normal row */}
                                    <tr style={{ borderBottom: isEditing ? "none" : "1px solid #1c1f27" }}
                                      onMouseEnter={e => { if (!isEditing) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"; }}
                                      onMouseLeave={e => { if (!isEditing) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>

                                      <td className="px-4 py-3 max-w-[220px]">
                                        <div className="text-slate-300 leading-tight line-clamp-2">{item.description || "—"}</div>
                                        {item.match_justification && (
                                          <div className="text-[9px] mt-0.5 line-clamp-1" style={{ color:"#2a3040" }}
                                            title={item.match_justification}>
                                            {item.match_justification}
                                          </div>
                                        )}
                                      </td>

                                      <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ color:"#64748b" }}>
                                        {item.quantity ?? 1}× {item.unit_price != null ? fmt(item.unit_price) : ""}
                                      </td>

                                      <td className="px-4 py-3 font-syne font-bold text-slate-100 whitespace-nowrap">
                                        {fmt(item.gross_amount)}
                                        <div className="text-[9px] font-mono font-normal" style={{ color:"#3a3f4a" }}>
                                          {item.vat_rate != null ? `%${item.vat_rate} USt` : ""}
                                        </div>
                                      </td>

                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded"
                                            style={{ background:"rgba(6,182,212,.1)", color:"#06b6d4" }}>
                                            {item.account_code || "—"}
                                          </span>
                                          <span className="text-slate-400 text-[10px] max-w-[100px] truncate">
                                            {item.account_name || ""}
                                          </span>
                                        </div>
                                      </td>

                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <div className="w-12 rounded-full h-1.5" style={{ background:"#1c1f27" }}>
                                            <div className="h-1.5 rounded-full transition-all"
                                              style={{ width:`${Math.min(100, score)}%`, background: scoreColor }} />
                                          </div>
                                          <span className="font-mono text-[10px]" style={{ color: scoreColor }}>
                                            %{score}
                                          </span>
                                        </div>
                                      </td>

                                      <td className="px-4 py-3">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                          source === "rule_manual"    ? "badge-check" :
                                          source === "rule_learned"   ? "badge-analyzed" :
                                          source === "admin_override" ? "badge-duplicate" :
                                          "badge-pending"
                                        }`}>
                                          {source === "rule_manual"    ? tr("Manuel Kural","Man. Regel") :
                                           source === "rule_learned"   ? tr("Öğrenilen","Gelernt") :
                                           source === "admin_override" ? "Admin" :
                                           "AI"}
                                        </span>
                                      </td>

                                      <td className="px-4 py-3">
                                        <button
                                          onClick={() => {
                                            if (isEditing) {
                                              setEditingItem(null);
                                              setEditCode("");
                                              setEditCodeSearch("");
                                              setShowCodePicker(false);
                                            } else {
                                              setEditingItem(item.id);
                                              setEditCode(item.account_code || "");
                                              setEditCodeSearch("");
                                              setShowCodePicker(false);
                                            }
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md cursor-pointer border-none transition-all"
                                          style={isEditing
                                            ? { background:"rgba(6,182,212,.15)", color:"#06b6d4", border:"1px solid rgba(6,182,212,.25)" }
                                            : { background:"rgba(255,255,255,.04)", color:"#64748b", border:"1px solid #1c1f27" }}
                                          onMouseEnter={e => { if (!isEditing) (e.currentTarget as HTMLButtonElement).style.color = "#06b6d4"; }}
                                          onMouseLeave={e => { if (!isEditing) (e.currentTarget as HTMLButtonElement).style.color = "#64748b"; }}>
                                          {isEditing ? tr("İptal","Abbruch") : "✎ " + tr("Düzenle","Bearbeiten")}
                                        </button>
                                      </td>
                                    </tr>

                                    {/* Inline edit row */}
                                    {isEditing && (
                                      <tr>
                                        <td colSpan={7} style={{ borderBottom:"1px solid #1c1f27", padding:0 }}>
                                          <div className="px-4 py-4" style={{ background:"rgba(6,182,212,.04)", borderLeft:"2px solid #06b6d4" }}>
                                            <div className="font-syne font-semibold text-xs text-slate-300 mb-3">
                                              ✎ {tr("Hesap Kodu Düzenleme","Kontocode bearbeiten")}
                                              <span className="ml-2 font-mono font-normal" style={{ color:"#3a3f4a" }}>
                                                {tr("Mevcut:","Aktuell:")} {item.account_code || "—"}
                                              </span>
                                            </div>

                                            <div className="flex items-start gap-3 flex-wrap">
                                              {/* Manuel giriş */}
                                              <div className="flex-1 min-w-[140px]">
                                                <label className="c-label">{tr("Hesap Kodu","Kontocode")}</label>
                                                <input className="c-input font-mono text-sm"
                                                  placeholder="4660"
                                                  value={editCode}
                                                  onChange={e => {
                                                    setEditCode(e.target.value);
                                                    setEditCodeSearch(e.target.value);
                                                    setShowCodePicker(true);
                                                  }}
                                                  onFocus={() => setShowCodePicker(true)}
                                                  style={{ padding:"8px 12px" }}
                                                />
                                              </div>

                                              {/* Kaydet */}
                                              <div className="flex items-end gap-2 pb-0.5">
                                                <button
                                                  disabled={!editCode || saving === item.id}
                                                  onClick={() => {
                                                    const acc = accountPlans.find(a => a.account_code === editCode);
                                                    saveItemCode(item, editCode, acc?.account_description || editCode);
                                                  }}
                                                  className="c-btn-primary px-4 py-2 text-xs rounded-md flex items-center gap-2">
                                                  {saving === item.id ? (
                                                    <>
                                                      <span className="w-3 h-3 border-2 rounded-full animate-spin inline-block"
                                                        style={{ borderColor:"rgba(255,255,255,.3)", borderTopColor:"#fff" }} />
                                                      {tr("Kaydediliyor...","Speichern...")}
                                                    </>
                                                  ) : (
                                                    <>✓ {tr("Kaydet","Speichern")}</>
                                                  )}
                                                </button>
                                              </div>
                                            </div>

                                            {/* Autocomplete picker */}
                                            {showCodePicker && (
                                              <div className="mt-3">
                                                <div className="text-[10px] mb-2" style={{ color:"#3a3f4a" }}>
                                                  {tr("Hesap planından seç:","Aus Kontenplan wählen:")}
                                                </div>
                                                <input className="c-input text-xs w-full mb-2"
                                                  placeholder={tr("Kod veya açıklama ile filtrele...","Nach Kontocode oder Name filtern...")}
                                                  value={editCodeSearch}
                                                  onChange={e => setEditCodeSearch(e.target.value)}
                                                  style={{ padding:"6px 10px" }}
                                                />
                                                <div className="rounded-md overflow-hidden"
                                                  style={{ border:"1px solid #1c1f27", maxHeight:"220px", overflowY:"auto" }}>
                                                  {filteredAccounts.map(acc => (
                                                    <button key={acc.id}
                                                      onClick={() => {
                                                        setEditCode(acc.account_code || "");
                                                        setShowCodePicker(false);
                                                        saveItemCode(item, acc.account_code || "", acc.account_description || "");
                                                      }}
                                                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 cursor-pointer border-none transition-colors"
                                                      style={{ borderBottom:"1px solid #1c1f27", background:"transparent" }}
                                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(6,182,212,.06)"}
                                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                                      <span className="font-mono font-bold text-xs shrink-0"
                                                        style={{ color:"#06b6d4", minWidth:"40px" }}>
                                                        {acc.account_code}
                                                      </span>
                                                      <span className="text-xs text-slate-300 truncate">
                                                        {acc.account_description}
                                                      </span>
                                                    </button>
                                                  ))}
                                                  {filteredAccounts.length === 0 && (
                                                    <div className="px-3 py-3 text-xs text-center" style={{ color:"#3a3f4a" }}>
                                                      {tr("Eşleşen hesap yok","Kein passendes Konto")}
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                      </div>{/* /SOL */}

                      {/* SAĞ — PDF görseli */}
                      <div className="hidden lg:flex flex-col shrink-0"
                        style={{ width:"480px", borderLeft:"1px solid #1c1f27", background:"#0a0c11" }}>
                        <div className="px-4 py-2 text-[10px] font-syne font-bold uppercase tracking-wider flex items-center justify-between"
                          style={{ color:"#64748b", borderBottom:"1px solid #1c1f27" }}>
                          <span>📄 {tr("Fatura Görseli","Rechnungsbild")}</span>
                          {(selectedInvoice as any).file_url && (
                            <a href={(selectedInvoice as any).file_url} target="_blank" rel="noreferrer"
                              className="text-[9px] px-2 py-0.5 rounded"
                              style={{ background:"rgba(6,182,212,.1)", color:"#06b6d4", border:"1px solid rgba(6,182,212,.25)", textDecoration:"none" }}>
                              {tr("Yeni sekmede aç","Öffnen")}
                            </a>
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden" style={{ background:"#0d0f15" }}>
                          {(selectedInvoice as any).file_url ? (
                            <iframe
                              key={selectedInvoice.id}
                              src={(selectedInvoice as any).file_url}
                              title="invoice-pdf"
                              className="w-full h-full"
                              style={{ border:"none", background:"#fff" }}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-[11px] px-6 text-center" style={{ color:"#3a3f4a" }}>
                              {tr("Bu fatura için saklı PDF yok (manuel girilmiş olabilir).","Keine PDF-Datei gespeichert.")}
                            </div>
                          )}
                        </div>
                      </div>{/* /SAĞ */}

                      </div>{/* /İçerik flex */}

                      {/* Footer: özet */}
                      <div className="shrink-0 px-5 py-3 flex items-center justify-between"
                        style={{ background:"#0d0f15", borderTop:"1px solid #1c1f27" }}>
                        <div className="flex items-center gap-4 text-[10px] font-mono" style={{ color:"#3a3f4a" }}>
                          <span>{selectedItems.length} {tr("kalem","Positionen")}</span>
                          <span>{tr("Ort. eşleşme","Ø Übereinstimmung")}: %{selectedItems.length > 0
                            ? Math.round(selectedItems.reduce((s,i) => s+(i.match_score||0),0) / selectedItems.length)
                            : 0}
                          </span>
                          {selectedItems.some(i => (i.match_score||0) < 80) && (
                            <span style={{ color:"#f59e0b" }}>
                              ⚠ {selectedItems.filter(i => (i.match_score||0) < 80).length} {tr("düşük eşleşme","niedrige Übereinstimmung")}
                            </span>
                          )}
                        </div>
                        <div className="font-syne font-bold text-slate-100 text-sm">
                          {fmt(selectedItems.reduce((s,i) => s+(i.gross_amount||0), 0))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};