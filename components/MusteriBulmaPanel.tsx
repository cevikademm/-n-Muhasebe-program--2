import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "../LanguageContext";
import { supabase } from "../services/supabaseService";
import {
  KAMPANYALAR, LANGS, ilkKampanya, kampanyaByCode, kampanyaDilleri,
  kampanyaSablon, kampanyaEk, sunumSatiri,
} from "./musteriBulmaKampanyalar";
import {
  Search, Users, Mail, Download, Loader2, MapPin, Phone, Globe,
  Star, X, Filter, MessageSquareText, Tag, Send, RefreshCw, ExternalLink,
  Copy, Languages, Save, Paperclip, Megaphone, Trash2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────
interface Lead {
  id: string;
  place_id: string | null;
  isim: string;
  kategori: string | null;
  adres: string | null;
  telefon: string | null;
  email: string | null;
  website: string | null;
  puan: number | null;
  yorum_sayisi: number | null;
  lat: number | null;
  lng: number | null;
  sehir: string | null;
  ulke: string | null;
  durum: string;
  mail_durumu: string;
  whatsapp_durumu?: string;
  yanit_kategorisi: string | null;
  notlar: string | null;
  etiketler: string[] | null;
  created_at: string;
  // Bu lead'in geldiği arama grubu (lead_searches embed) — "aradığım grup"
  search?: {
    kategori: string | null;
    sehir: string | null;
    ulke: string | null;
    only_email?: boolean | null;
    only_phone?: boolean | null;
    only_website?: boolean | null;
    min_puan?: number | null;
  } | null;
}
interface LeadEmail {
  id: string; direction: string; to_email: string | null; from_email: string | null;
  subject: string | null; body: string | null; reply_category: string | null; created_at: string;
}

interface Props { ownerId?: string; }

// ── Pipeline / durum meta ────────────────────────────────────────
const DURUMS = ["yeni", "ilgili", "iletisimde", "teklif", "kazanildi", "kaybedildi"] as const;
const DURUM_COLOR: Record<string, string> = {
  yeni: "#64748b", ilgili: "#06b6d4", iletisimde: "#8b5cf6",
  teklif: "#f59e0b", kazanildi: "#10b981", kaybedildi: "#f43f5e",
};
const YANIT_COLOR: Record<string, string> = {
  ilgili: "#10b981", fiyat_soruyor: "#f59e0b", randevu_istiyor: "#06b6d4",
  red: "#f43f5e", ilgisiz: "#64748b", diger: "#94a3b8",
};

// ── Arama grubu (aradığım kategori/şehir/filtre) etiketi ─────────
// Her lead, onu üreten aramaya (lead_searches) bağlı. "Aradığım grup"
// = o aramanın kategori/şehir/ülke + filtre ayarları.
const GROUP_COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#f43f5e", "#6366f1", "#ec4899", "#14b8a6", "#eab308", "#3b82f6"];
function groupColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}
interface LeadGroup { key: string; label: string; sub: string; title: string; }
function leadGroup(l: { search?: Lead["search"] }, tr: (t: string, g: string) => string): LeadGroup | null {
  const s = l.search;
  const kat = (s?.kategori || "").trim();
  if (!kat) return null;
  const city = (s?.sehir || "").trim();
  const country = (s?.ulke || "").trim();
  const key = `${kat}|${city}|${country}`.toLowerCase();
  const flags = [
    s?.only_email && tr("E-posta", "E-Mail"),
    s?.only_phone && tr("Telefon", "Telefon"),
    s?.only_website && "Web",
  ].filter(Boolean).join(", ");
  const title = [
    kat,
    [city, country].filter(Boolean).join(", "),
    s?.min_puan ? `≥ ${s.min_puan} ★` : "",
    flags && (tr("Filtre: ", "Filter: ") + flags),
  ].filter(Boolean).join(" · ");
  return { key, label: kat, sub: city || country, title };
}

// ── Taslak mesaj şablonları & kampanyalar musteriBulmaKampanyalar.ts'de ──
// Lead'in ülkesinden taslak dilini tahmin eder.
function guessMsgLang(lead: { ulke?: string | null }, fallback: string): string {
  const u = (lead.ulke || "").toLowerCase();
  if (/deu|german|österr|austria|schweiz|switz/.test(u)) return "de";
  if (/türk|turk/.test(u)) return "tr";
  if (/fran/.test(u)) return "fr";
  if (/nether|nederl|holland|belg/.test(u)) return "nl";
  if (/ital/.test(u)) return "it";
  if (/span|españ|espan/.test(u)) return "es";
  if (/king|britain|england|usa|united states|ireland/.test(u)) return "en";
  return LANGS.some((t) => t.code === fallback) ? fallback : "de";
}
const fillTpl = (s: string, lead: { isim?: string | null; sehir?: string | null; kategori?: string | null }) =>
  String(s ?? "")
    .replaceAll("{{isim}}", lead.isim || "")
    .replaceAll("{{sehir}}", lead.sehir || "")
    .replaceAll("{{kategori}}", lead.kategori || "");

export const MusteriBulmaPanel: React.FC<Props> = ({ ownerId }) => {
  const { lang } = useLang();
  const tr = (t: string, d: string) => (lang === "tr" ? t : d);

  // Search form
  const [ulke, setUlke] = useState("Deutschland");
  const [sehir, setSehir] = useState("");
  const [kategori, setKategori] = useState("");
  const [maxResults, setMaxResults] = useState(30);
  const [minPuan, setMinPuan] = useState(0);
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [onlyWebsite, setOnlyWebsite] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  // Leads
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterDurum, setFilterDurum] = useState<string>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [q, setQ] = useState("");

  // Modals
  const [mailOpen, setMailOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [detail, setDetail] = useState<Lead | null>(null);

  // Onay diyaloğu (native confirm yerine)
  const [confirmState, setConfirmState] = useState<{
    title: string; message: React.ReactNode; confirmLabel: string; count?: number; onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Responsive
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setIsMobile(mq.matches);
    on();
    try { mq.addEventListener("change", on); } catch { mq.addListener(on); }
    return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } };
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true); setLoadError(null);
    const { data, error } = await supabase
      .from("leads")
      .select("*, search:lead_searches(kategori,sehir,ulke,only_email,only_phone,only_website,min_puan)")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) setLoadError(error.message);
    else {
      // Güvenlik ağı: aynı place_id'yi iki kez gösterme (sunucu zaten engelliyor)
      const list = (data as Lead[]) || [];
      const seen = new Set<string>();
      setLeads(list.filter((l) => {
        if (!l.place_id) return true;
        if (seen.has(l.place_id)) return false;
        seen.add(l.place_id); return true;
      }));
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Realtime
  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase
      .channel("leads-" + ownerId)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${ownerId}` },
        () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, fetchLeads]);

  // ── Search ─────────────────────────────────────────────────────
  const runSearch = async () => {
    if (!kategori.trim()) { setSearchMsg(tr("Kategori girin (ör. restoran, kuaför).", "Kategorie eingeben.")); return; }
    if (!sehir.trim() && !ulke.trim()) { setSearchMsg(tr("Şehir veya ülke girin.", "Stadt oder Land eingeben.")); return; }
    setSearching(true); setSearchMsg(tr("Arama başlatılıyor…", "Suche wird gestartet…"));
    try {
      const { data, error } = await supabase.functions.invoke("find-customers", {
        body: {
          action: "start", ulke, sehir, kategori,
          max_results: maxResults, min_puan: minPuan,
          only_email: onlyEmail, only_phone: onlyPhone, only_website: onlyWebsite, lang,
        },
      });
      if (error || !data?.success) {
        setSearchMsg(tr("Başlatılamadı: ", "Fehler: ") + (data?.error || error?.message || ""));
        setSearching(false); return;
      }
      const searchId = data.searchId;
      let tries = 0;
      const poll = async () => {
        tries++;
        const { data: p } = await supabase.functions.invoke("find-customers", { body: { action: "poll", searchId } });
        if (p?.status === "done") {
          const dup = p.duplicates ? tr(` · ${p.duplicates} zaten listede`, ` · ${p.duplicates} bereits vorhanden`) : "";
          setSearchMsg(tr(`✓ ${p.count} yeni müşteri${dup}.`, `✓ ${p.count} neue Kunden${dup}.`));
          await fetchLeads(); setSearching(false); return;
        }
        if ((p && p.status === "error") || tries > 45) {
          setSearchMsg(p?.error || tr("Arama tamamlanamadı.", "Suche fehlgeschlagen."));
          // Poll bitmese/timeout olsa bile edge fonksiyonu leadleri arka
          // planda eklemiş olabilir → listeyi yine de tazele ki gizli kalmasın.
          await fetchLeads(); setSearching(false); return;
        }
        setSearchMsg(tr(`Google Maps taranıyor… (${tries})`, `Google Maps wird durchsucht… (${tries})`));
        setTimeout(poll, 5000);
      };
      setTimeout(poll, 4000);
    } catch (e: any) {
      setSearchMsg(tr("Hata: ", "Fehler: ") + (e?.message || String(e)));
      setSearching(false);
    }
  };

  // ── Lead mutations ─────────────────────────────────────────────
  const setDurum = async (lead: Lead, durum: string) => {
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, durum } : l)));
    await supabase.from("leads").update({ durum }).eq("id", lead.id);
  };
  const saveNotes = async (leadId: string, notlar: string) => {
    await supabase.from("leads").update({ notlar }).eq("id", leadId);
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, notlar } : l)));
  };
  const deleteLead = (lead: Lead) => {
    setConfirmState({
      title: tr("Müşteriyi sil", "Kunde löschen"),
      confirmLabel: tr("Sil", "Löschen"),
      message: (
        <>
          <strong style={{ color: "var(--text-1,#0f172a)" }}>“{lead.isim}”</strong>{" "}
          {tr("kalıcı olarak silinecek.", "wird dauerhaft gelöscht.")}
          <br />
          <span style={{ fontSize: ".8rem", color: "var(--text-3,#94a3b8)" }}>{tr("Bu işlem geri alınamaz.", "Dies kann nicht rückgängig gemacht werden.")}</span>
        </>
      ),
      onConfirm: async () => {
        await supabase.from("leads").delete().eq("id", lead.id);
        setSelected((s) => { const n = new Set(s); n.delete(lead.id); return n; });
        setDetail(null);
        fetchLeads();
      },
    });
  };
  // Toplu silme (seçili müşteriler)
  const deleteMany = (ids: string[]) => {
    if (!ids.length) return;
    setConfirmState({
      title: tr("Seçili müşterileri sil", "Ausgewählte Kunden löschen"),
      confirmLabel: tr("Hepsini sil", "Alle löschen"),
      count: ids.length,
      message: (
        <>
          <strong style={{ color: "var(--text-1,#0f172a)" }}>{ids.length}</strong>{" "}
          {tr("müşteri listeden kalıcı olarak silinecek.", "Kunden werden dauerhaft aus der Liste gelöscht.")}
          <br />
          <span style={{ fontSize: ".8rem", color: "var(--text-3,#94a3b8)" }}>{tr("Bu işlem geri alınamaz.", "Dies kann nicht rückgängig gemacht werden.")}</span>
        </>
      ),
      onConfirm: async () => {
        await supabase.from("leads").delete().in("id", ids);
        setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
        fetchLeads();
      },
    });
  };
  const runConfirm = async () => {
    if (!confirmState) return;
    setConfirmBusy(true);
    try { await confirmState.onConfirm(); }
    finally { setConfirmBusy(false); setConfirmState(null); }
  };

  // ── Derived ────────────────────────────────────────────────────
  // Aradığım gruplar (benzersiz) — sol etiket + grup filtresi için
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; sub: string; count: number }>();
    for (const l of leads) {
      const g = leadGroup(l, tr);
      if (!g) continue;
      const ex = m.get(g.key);
      if (ex) ex.count++;
      else m.set(g.key, { key: g.key, label: g.label, sub: g.sub, count: 1 });
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [leads, lang]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (filterDurum !== "all" && l.durum !== filterDurum) return false;
      if (filterGroup !== "all") { const g = leadGroup(l, tr); if (!g || g.key !== filterGroup) return false; }
      if (needle && !(`${l.isim} ${l.adres || ""} ${l.kategori || ""} ${l.email || ""}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [leads, filterDurum, filterGroup, q, lang]);

  const allChecked = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => {
    setSelected((s) => {
      const n = new Set(s);
      if (allChecked) filtered.forEach((l) => n.delete(l.id));
      else filtered.forEach((l) => n.add(l.id));
      return n;
    });
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectedLeads = leads.filter((l) => selected.has(l.id));
  const selectedWithEmail = selectedLeads.filter((l) => l.email);
  const selectedWithWhatsapp = selectedLeads.filter((l) => isWhatsappNumber(l.telefon));

  // WhatsApp gönderim durumunu işaretle (wa.me ile açılan kayıtlar "gönderildi")
  const markWhatsappSent = async (ids: string[]) => {
    if (!ids.length) return;
    await supabase.from("leads").update({ whatsapp_durumu: "gonderildi" }).in("id", ids);
    setLeads((ls) => ls.map((l) => (ids.includes(l.id) ? { ...l, whatsapp_durumu: "gonderildi" } : l)));
  };

  // ── Export ─────────────────────────────────────────────────────
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const rows = (selected.size ? selectedLeads : filtered).map((l) => ({
      İsim: l.isim, Kategori: l.kategori, Adres: l.adres, Telefon: l.telefon,
      "E-posta": l.email, Website: l.website, Puan: l.puan, "Yorum": l.yorum_sayisi,
      Şehir: l.sehir, Durum: l.durum, "Mail Durumu": l.mail_durumu, "Yanıt": l.yanit_kategorisi,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Müşteriler");
    XLSX.writeFile(wb, `musteriler_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const stats = useMemo(() => ({
    total: leads.length,
    withEmail: leads.filter((l) => l.email).length,
    contacted: leads.filter((l) => l.mail_durumu !== "gonderilmedi").length,
    replied: leads.filter((l) => l.mail_durumu === "yanit_geldi").length,
  }), [leads]);

  // ── UI ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? "16px 13px 90px" : "22px 26px", height: "100%", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(139,92,255,.14)", display: "grid", placeItems: "center", color: "#8b5cf6", flexShrink: 0 }}>
          <Users size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: isMobile ? "1.15rem" : "1.35rem", fontWeight: 700, margin: 0 }}>{tr("Müşteri Bulma", "Kundengewinnung")}</h1>
          <p style={{ margin: 0, fontSize: isMobile ? ".78rem" : ".85rem", color: "var(--text-3,#64748b)" }}>
            {tr("Google Maps’ten hedef şehir & kategoride işletme bul, pipeline’a ekle, toplu mail at.", "Unternehmen aus Google Maps finden und kontaktieren.")}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: isMobile ? 9 : 12, margin: isMobile ? "13px 0" : "16px 0" }}>
        {[
          { l: tr("Toplam müşteri", "Kunden gesamt"), v: stats.total, c: "#8b5cf6" },
          { l: tr("E-postası olan", "Mit E-Mail"), v: stats.withEmail, c: "#06b6d4" },
          { l: tr("İletişime geçilen", "Kontaktiert"), v: stats.contacted, c: "#f59e0b" },
          { l: tr("Yanıt veren", "Geantwortet"), v: stats.replied, c: "#10b981" },
        ].map((s, i) => (
          <div key={i} className="c-card" style={{ padding: isMobile ? "12px 13px" : "14px 16px", borderLeft: `3px solid ${s.c}`, position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: isMobile ? "1.3rem" : "1.5rem", fontWeight: 700, color: s.c, lineHeight: 1.1 }}>{s.v}</div>
            <div style={{ fontSize: isMobile ? ".72rem" : ".78rem", color: "var(--text-3,#64748b)" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Search form */}
      <div className="c-card" style={{ padding: isMobile ? 14 : 18, marginBottom: isMobile ? 14 : 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontWeight: 600 }}>
          <Search size={16} color="#8b5cf6" /> {tr("Yeni Arama", "Neue Suche")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
          <Field label={tr("Kategori / sektör *", "Kategorie *")}>
            <input className="c-input" placeholder={tr("restoran, kuaför, avukat…", "Restaurant, Friseur…")} value={kategori} onChange={(e) => setKategori(e.target.value)} />
          </Field>
          <Field label={tr("Şehir", "Stadt")}>
            <input className="c-input" placeholder="Köln" value={sehir} onChange={(e) => setSehir(e.target.value)} />
          </Field>
          <Field label={tr("Ülke", "Land")}>
            <input className="c-input" placeholder="Deutschland" value={ulke} onChange={(e) => setUlke(e.target.value)} />
          </Field>
          <Field label={tr("Maks. sonuç", "Max. Ergebnisse")}>
            <input className="c-input" type="number" min={1} max={120} value={maxResults} onChange={(e) => setMaxResults(Math.min(120, Math.max(1, +e.target.value || 1)))} />
          </Field>
          <Field label={tr("Min. puan", "Min. Bewertung")}>
            <select className="c-input" value={minPuan} onChange={(e) => setMinPuan(+e.target.value)}>
              {[0, 3, 3.5, 4, 4.5].map((v) => <option key={v} value={v}>{v === 0 ? tr("Hepsi", "Alle") : `≥ ${v} ★`}</option>)}
            </select>
          </Field>
          <Field label={tr("Filtreler", "Filter")}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", height: 38 }}>
              <Check label={tr("E-posta", "E-Mail")} checked={onlyEmail} onChange={setOnlyEmail} />
              <Check label={tr("Telefon", "Telefon")} checked={onlyPhone} onChange={setOnlyPhone} />
              <Check label="Web" checked={onlyWebsite} onChange={setOnlyWebsite} />
            </div>
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          <button className="c-btn-primary" onClick={runSearch} disabled={searching} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: isMobile ? "100%" : undefined }}>
            {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
            {searching ? tr("Aranıyor…", "Suche läuft…") : tr("Müşteri Ara", "Kunden suchen")}
          </button>
          {searchMsg && <span style={{ fontSize: ".85rem", color: searching ? "#8b5cf6" : "var(--text-2,#475569)" }}>{searchMsg}</span>}
        </div>
      </div>

      {/* Leads toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <Filter size={14} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
          <select className="c-input" style={{ paddingLeft: 30, height: 36 }} value={filterDurum} onChange={(e) => setFilterDurum(e.target.value)}>
            <option value="all">{tr("Tüm durumlar", "Alle Status")}</option>
            {DURUMS.map((d) => <option key={d} value={d}>{durumLabel(d, tr)}</option>)}
          </select>
        </div>
        {groups.length > 0 && (
          <div style={{ position: "relative" }}>
            <Tag size={14} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
            <select className="c-input" style={{ paddingLeft: 30, height: 36, maxWidth: 220 }} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} title={tr("Arama grubuna göre süz", "Nach Suchgruppe filtern")}>
              <option value="all">{tr("Tüm gruplar", "Alle Gruppen")}</option>
              {groups.map((g) => <option key={g.key} value={g.key}>{g.label}{g.sub ? ` · ${g.sub}` : ""} ({g.count})</option>)}
            </select>
          </div>
        )}
        <div style={{ position: "relative", flex: 1, minWidth: isMobile ? "100%" : 180, maxWidth: isMobile ? "none" : 320 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
          <input className="c-input" style={{ paddingLeft: 30, height: 36, width: "100%" }} placeholder={tr("Ara: isim, adres, e-posta…", "Suchen…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        <button className="c-btn-ghost" onClick={() => fetchLeads()} title={tr("Yenile", "Aktualisieren")} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={14} />
        </button>
        <button className="c-btn-ghost" onClick={exportXlsx} disabled={!filtered.length} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Download size={14} /> {tr("Excel", "Excel")} {selected.size ? `(${selected.size})` : ""}
        </button>
        <button className="c-btn-primary" onClick={() => setMailOpen(true)} disabled={!selectedWithEmail.length}
          style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Mail size={14} /> {tr("Toplu Mail", "Massen-Mail")} {selectedWithEmail.length ? `(${selectedWithEmail.length})` : ""}
        </button>
        <button className="c-btn-ghost" onClick={() => setWaOpen(true)} disabled={!selectedWithWhatsapp.length}
          title={tr("Seçili numaralara WhatsApp", "WhatsApp an ausgewählte Nummern")}
          style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, color: selectedWithWhatsapp.length ? WA_GREEN : undefined, borderColor: selectedWithWhatsapp.length ? "rgba(37,211,102,.45)" : undefined }}>
          <WhatsAppGlyph size={14} /> {tr("Toplu WhatsApp", "Massen-WhatsApp")} {selectedWithWhatsapp.length ? `(${selectedWithWhatsapp.length})` : ""}
        </button>
        <button className="c-btn-ghost" onClick={() => deleteMany([...selected])} disabled={!selected.size}
          title={tr("Seçilenleri sil", "Ausgewählte löschen")}
          style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, color: selected.size ? "#f43f5e" : undefined, borderColor: selected.size ? "rgba(244,63,94,.4)" : undefined }}>
          <Trash2 size={14} /> {tr("Sil", "Löschen")} {selected.size ? `(${selected.size})` : ""}
        </button>
      </div>

      {/* Leads list — mobile: cards, desktop: table */}
      {isMobile ? (
        <div>
          {!loading && !loadError && filtered.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 2px 10px", fontSize: ".8rem", color: "var(--text-3,#64748b)" }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              {tr("Tümünü seç", "Alle wählen")} · {filtered.length}
              {selected.size > 0 && <span style={{ color: "#8b5cf6", fontWeight: 600 }}> · {selected.size} {tr("seçili", "gewählt")}</span>}
            </label>
          )}
          {loading ? (
            <div className="c-card" style={{ padding: 40, textAlign: "center", color: "var(--text-3,#64748b)" }}><Loader2 size={20} className="spin" /></div>
          ) : loadError ? (
            <div className="c-card" style={{ padding: 20, color: "#f43f5e", fontSize: ".85rem" }}>{loadError}</div>
          ) : filtered.length === 0 ? (
            <div className="c-card" style={{ padding: 44, textAlign: "center", color: "var(--text-3,#64748b)" }}>
              <Users size={30} style={{ opacity: .4, marginBottom: 8 }} />
              <div>{leads.length ? tr("Filtreye uyan müşteri yok.", "Keine Treffer.") : tr("Henüz müşteri yok. Yukarıdan arama yapın.", "Noch keine Kunden — starten Sie eine Suche.")}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((l) => {
                const isSel = selected.has(l.id);
                const g = leadGroup(l, tr);
                return (
                  <div key={l.id} className="c-card" style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9, borderLeft: `3px solid ${isSel ? "#8b5cf6" : "transparent"}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggle(l.id)} style={{ marginTop: 3, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {g && <GroupChip g={g} max={200} />}
                          <div style={{ fontWeight: 600, fontSize: ".92rem", lineHeight: 1.25 }}>{l.isim}</div>
                        </div>
                        <div style={{ fontSize: ".75rem", color: "var(--text-3,#64748b)", marginTop: 1 }}>{l.kategori}{l.adres ? ` · ${l.adres}` : ""}</div>
                      </div>
                      {l.puan != null && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: ".8rem", fontWeight: 600, flexShrink: 0 }}>
                          <Star size={13} color="#f59e0b" fill="#f59e0b" />{l.puan}
                        </span>
                      )}
                    </div>
                    {(l.telefon || l.email || l.website) && (
                      <div style={{ paddingLeft: 26 }}>
                        <ContactActions lead={l} tr={tr} />
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 26 }}>
                      <select value={l.durum} onChange={(e) => setDurum(l, e.target.value)}
                        style={{ fontSize: ".76rem", fontWeight: 600, border: "none", borderRadius: 7, padding: "5px 8px", cursor: "pointer", color: "#fff", background: DURUM_COLOR[l.durum] || "#64748b" }}>
                        {DURUMS.map((d) => <option key={d} value={d} style={{ color: "#0f172a", background: "#fff" }}>{durumLabel(d, tr)}</option>)}
                      </select>
                      {mailBadge(l.mail_durumu, tr)}
                      {waBadge(l.whatsapp_durumu)}
                      {l.yanit_kategorisi && <span style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: YANIT_COLOR[l.yanit_kategorisi] || "#94a3b8" }}>{yanitLabel(l.yanit_kategorisi, tr)}</span>}
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setDetail(l)} className="c-btn-ghost" style={{ padding: 7, height: 32 }} title={tr("Detay", "Details")}><ExternalLink size={14} /></button>
                      <button onClick={() => deleteLead(l)} className="c-btn-ghost" style={{ padding: 7, height: 32, color: "#f43f5e" }} title={tr("Sil", "Löschen")}><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="c-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "34px 1.6fr 1.2fr 130px 90px 120px 130px 76px", gap: 0, padding: "10px 14px", borderBottom: "1px solid var(--line,#e2e8f0)", fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-3,#64748b)", alignItems: "center" }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          <div>{tr("İşletme", "Unternehmen")}</div>
          <div>{tr("İletişim", "Kontakt")}</div>
          <div>{tr("Durum", "Status")}</div>
          <div>{tr("Puan", "Bew.")}</div>
          <div>Mail</div>
          <div>{tr("Yanıt", "Antwort")}</div>
          <div />
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-3,#64748b)" }}><Loader2 size={20} className="spin" /></div>
        ) : loadError ? (
          <div style={{ padding: 20, color: "#f43f5e", fontSize: ".85rem" }}>{loadError}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 44, textAlign: "center", color: "var(--text-3,#64748b)" }}>
            <Users size={30} style={{ opacity: .4, marginBottom: 8 }} />
            <div>{leads.length ? tr("Filtreye uyan müşteri yok.", "Keine Treffer.") : tr("Henüz müşteri yok. Yukarıdan arama yapın.", "Noch keine Kunden — starten Sie eine Suche.")}</div>
          </div>
        ) : filtered.map((l) => {
          const g = leadGroup(l, tr);
          return (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "34px 1.6fr 1.2fr 130px 90px 120px 130px 76px", gap: 0, padding: "11px 14px", borderBottom: "1px solid var(--line,#f1f5f9)", fontSize: ".85rem", alignItems: "center" }}>
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {g && <GroupChip g={g} />}
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.isim}</div>
              </div>
              <div style={{ fontSize: ".76rem", color: "var(--text-3,#64748b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.kategori}{l.adres ? ` · ${l.adres}` : ""}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <ContactActions lead={l} tr={tr} />
            </div>
            <div>
              <select value={l.durum} onChange={(e) => setDurum(l, e.target.value)}
                style={{ fontSize: ".76rem", fontWeight: 600, border: "none", borderRadius: 7, padding: "4px 6px", cursor: "pointer", color: "#fff", background: DURUM_COLOR[l.durum] || "#64748b" }}>
                {DURUMS.map((d) => <option key={d} value={d} style={{ color: "#0f172a", background: "#fff" }}>{durumLabel(d, tr)}</option>)}
              </select>
            </div>
            <div>{l.puan != null ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Star size={12} color="#f59e0b" fill="#f59e0b" />{l.puan}</span> : <span style={{ color: "#cbd5e1" }}>—</span>}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>{mailBadge(l.mail_durumu, tr)}{waBadge(l.whatsapp_durumu)}</div>
            <div>{l.yanit_kategorisi ? <span style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: YANIT_COLOR[l.yanit_kategorisi] || "#94a3b8" }}>{yanitLabel(l.yanit_kategorisi, tr)}</span> : <span style={{ color: "#cbd5e1" }}>—</span>}</div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button onClick={() => setDetail(l)} className="c-btn-ghost" style={{ padding: 6, height: 30 }} title={tr("Detay", "Details")}><ExternalLink size={13} /></button>
              <button onClick={() => deleteLead(l)} className="c-btn-ghost" style={{ padding: 6, height: 30, color: "#f43f5e" }} title={tr("Sil", "Löschen")}><Trash2 size={13} /></button>
            </div>
          </div>
          );
        })}
      </div>
      )}

      {mailOpen && <MailModal leads={selectedWithEmail} onClose={() => setMailOpen(false)} onSent={() => { setMailOpen(false); setSelected(new Set()); fetchLeads(); }} tr={tr} />}
      {waOpen && <WhatsAppModal leads={selectedWithWhatsapp} onClose={() => setWaOpen(false)} onSent={(ids) => { setWaOpen(false); markWhatsappSent(ids); }} tr={tr} />}
      {detail && <DetailModal lead={detail} onClose={() => setDetail(null)} onSaveNotes={saveNotes} onSetDurum={setDurum} onDelete={deleteLead} onChanged={fetchLeads} tr={tr} />}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={tr("Vazgeç", "Abbrechen")}
          loading={confirmBusy}
          onCancel={() => { if (!confirmBusy) setConfirmState(null); }}
          onConfirm={runConfirm}
        />
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes drawerIn{from{transform:translateX(24px);opacity:.4}to{transform:translateX(0);opacity:1}}@keyframes confFade{from{opacity:0}to{opacity:1}}@keyframes confPop{from{transform:scale(.92) translateY(8px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}@keyframes confPulse{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.35);opacity:0}}`}</style>
    </div>
  );
};

// ── Small building blocks ────────────────────────────────────────
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="c-label" style={{ display: "block", fontSize: ".76rem", fontWeight: 600, marginBottom: 5, color: "var(--text-2,#475569)" }}>{label}</label>
    {children}
  </div>
);
const Check: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".8rem", cursor: "pointer", color: "var(--text-2,#475569)" }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
  </label>
);

// ── Modern onay diyaloğu (native confirm yerine) ─────────────────
const ConfirmDialog: React.FC<{
  title: string; message: React.ReactNode; confirmLabel: string; cancelLabel: string;
  loading?: boolean; onConfirm: () => void; onCancel: () => void;
}> = ({ title, message, confirmLabel, cancelLabel, loading, onConfirm, onCancel }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, onCancel, onConfirm]);

  return (
    <div onClick={() => { if (!loading) onCancel(); }} role="dialog" aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", padding: 20,
        background: "rgba(2,6,23,.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        animation: "confFade .18s ease",
      }}>
      <div onClick={(e) => e.stopPropagation()} className="c-card"
        style={{
          width: "100%", maxWidth: 396, borderRadius: 22, padding: "30px 26px 22px",
          textAlign: "center", position: "relative", overflow: "hidden",
          boxShadow: "0 30px 70px -18px rgba(2,6,23,.55)",
          animation: "confPop .26s cubic-bezier(.34,1.56,.64,1)",
        }}>
        {/* üstte yumuşak kırmızı ışıma */}
        <div style={{ position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)", width: 260, height: 140, background: "radial-gradient(closest-side, rgba(244,63,94,.30), transparent)", pointerEvents: "none" }} />

        {/* ikon + nabız halkası */}
        <div style={{ position: "relative", width: 66, height: 66, margin: "0 auto 18px" }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: 20, background: "rgba(244,63,94,.4)", animation: "confPulse 1.8s ease-in-out infinite" }} />
          <div style={{ position: "relative", width: 66, height: 66, borderRadius: 20, display: "grid", placeItems: "center", color: "#f43f5e", background: "rgba(244,63,94,.14)", border: "1px solid rgba(244,63,94,.30)" }}>
            <Trash2 size={28} />
          </div>
        </div>

        <h3 style={{ margin: "0 0 10px", fontSize: "1.15rem", fontWeight: 700 }}>{title}</h3>
        <div style={{ fontSize: ".9rem", color: "var(--text-2,#475569)", lineHeight: 1.55, marginBottom: 24 }}>{message}</div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={loading} className="c-btn-ghost"
            style={{ flex: 1, height: 46, fontWeight: 600, borderRadius: 12 }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={loading} className="c-btn-danger"
            style={{ flex: 1, height: 46, fontWeight: 600, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {loading ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// İşletmenin solunda görünen "aradığım grup" etiketi
const GroupChip: React.FC<{ g: LeadGroup; max?: number }> = ({ g, max = 150 }) => {
  const c = groupColor(g.key);
  return (
    <span title={g.title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, maxWidth: max,
        fontSize: ".68rem", fontWeight: 700, lineHeight: 1.2, padding: "2px 7px", borderRadius: 20,
        color: c, background: `${c}1a`, border: `1px solid ${c}40`,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
      <Tag size={10} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{g.label}{g.sub ? ` · ${g.sub}` : ""}</span>
    </span>
  );
};

// ── Telefon türü / WhatsApp tespiti ──────────────────────────────
const WA_GREEN = "#25D366";
const normDigits = (raw?: string | null) => (raw || "").replace(/[^\d+]/g, "");
function toIntlNumber(raw?: string | null): string {
  let p = normDigits(raw);
  if (p.startsWith("+")) p = p.slice(1);
  else if (p.startsWith("00")) p = p.slice(2);
  else if (p.startsWith("0")) p = "49" + p.slice(1); // öneksiz → varsayılan Almanya
  return p;
}
// Cep numarası ≈ WhatsApp'a uygun (ülke önekine göre)
function isWhatsappNumber(raw?: string | null): boolean {
  const p = toIntlNumber(raw);
  if (!p) return false;
  if (p.startsWith("49")) return /^1(5|6|7)\d/.test(p.slice(2)); // DE cep: 015x/016x/017x
  if (p.startsWith("90")) return /^5\d/.test(p.slice(2));        // TR cep: 05xx
  if (p.startsWith("43")) return /^6\d/.test(p.slice(2));        // AT cep
  if (p.startsWith("41")) return /^7[5-9]\d/.test(p.slice(2));   // CH cep
  return false;
}

const WhatsAppGlyph: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.007zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414z"/>
  </svg>
);

// Telefonu tür ikonuyla gösterir: cep → yeşil WhatsApp + telefon; sabit → telefon
const PhoneLinks: React.FC<{ phone: string; tr: (t: string, g: string) => string; iconSize?: number }> = ({ phone, tr, iconSize = 12 }) => {
  const wa = isWhatsappNumber(phone);
  const intl = toIntlNumber(phone);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      {wa && (
        <a href={`https://wa.me/${intl}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
          onClick={(e) => e.stopPropagation()}
          style={{ display: "inline-flex", alignItems: "center", color: WA_GREEN, flexShrink: 0 }}>
          <WhatsAppGlyph size={iconSize + 2} />
        </a>
      )}
      <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()}
        title={wa ? tr("Cep · Ara", "Mobil · Anrufen") : tr("Sabit hat · Ara", "Festnetz · Anrufen")}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "inherit", textDecoration: "none", minWidth: 0 }}>
        <Phone size={iconSize} style={{ flexShrink: 0, opacity: .8 }} /> {phone}
      </a>
    </span>
  );
};

// İletişim ikonları yan yana: mail · WhatsApp · telefon · web (tıkla → iletişime geç)
const ContactActions: React.FC<{ lead: Lead; tr: (t: string, g: string) => string; showNumber?: boolean }> = ({ lead, tr, showNumber = true }) => {
  const wa = lead.telefon ? isWhatsappNumber(lead.telefon) : false;
  const intl = lead.telefon ? toIntlNumber(lead.telefon) : "";
  const waDil = guessMsgLang(lead, tr("tr", "de"));
  const waK = ilkKampanya();
  const waEk = kampanyaEk(waK, waDil);
  const waHref = `https://wa.me/${intl}?text=${encodeURIComponent(fillTpl(kampanyaSablon(waK, waDil).body, lead) + sunumSatiri(waEk, waDil))}`;
  const chip = (bg: string, color: string): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 8, background: bg, color,
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, textDecoration: "none",
  });
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const none = !lead.email && !lead.telefon && !lead.website;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {lead.email && (
          <a href={`mailto:${lead.email}`} onClick={stop} title={`${tr("Mail", "Mail")} · ${lead.email}`} style={chip("rgba(6,182,212,.13)", "#06b6d4")}>
            <Mail size={15} />
          </a>
        )}
        {wa && (
          <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={stop} title={`WhatsApp · ${lead.telefon}`} style={chip("rgba(37,211,102,.15)", WA_GREEN)}>
            <WhatsAppGlyph size={16} />
          </a>
        )}
        {lead.telefon && (
          <a href={`tel:${lead.telefon}`} onClick={stop} title={`${tr("Ara", "Anrufen")} · ${lead.telefon}`} style={chip("rgba(100,116,139,.15)", "#475569")}>
            <Phone size={15} />
          </a>
        )}
        {lead.website && (
          <a href={lead.website} target="_blank" rel="noopener noreferrer" onClick={stop} title={lead.website} style={chip("rgba(139,92,246,.13)", "#8b5cf6")}>
            <Globe size={15} />
          </a>
        )}
        {none && <span style={{ color: "#cbd5e1", fontSize: ".82rem" }}>—</span>}
      </div>
      {showNumber && lead.telefon && (
        <span style={{ fontSize: ".72rem", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.telefon}</span>
      )}
    </div>
  );
};

function durumLabel(d: string, tr: (t: string, g: string) => string) {
  const m: Record<string, [string, string]> = {
    yeni: ["Yeni", "Neu"], ilgili: ["İlgili", "Interessiert"], iletisimde: ["İletişimde", "In Kontakt"],
    teklif: ["Teklif", "Angebot"], kazanildi: ["Kazanıldı", "Gewonnen"], kaybedildi: ["Kaybedildi", "Verloren"],
  };
  return tr(m[d]?.[0] || d, m[d]?.[1] || d);
}
function yanitLabel(y: string, tr: (t: string, g: string) => string) {
  const m: Record<string, [string, string]> = {
    ilgili: ["İlgili", "Interessiert"], fiyat_soruyor: ["Fiyat soruyor", "Preisfrage"], randevu_istiyor: ["Randevu", "Termin"],
    red: ["Red", "Absage"], ilgisiz: ["İlgisiz", "Kein Interesse"], diger: ["Diğer", "Sonstige"],
  };
  return tr(m[y]?.[0] || y, m[y]?.[1] || y);
}
function mailBadge(s: string, tr: (t: string, g: string) => string) {
  const m: Record<string, [string, string, string]> = {
    gonderilmedi: ["—", "—", "#cbd5e1"], gonderildi: [tr("Gönderildi", "Gesendet"), "", "#06b6d4"],
    yanit_geldi: [tr("Yanıt", "Antwort"), "", "#10b981"], hata: [tr("Hata", "Fehler"), "", "#f43f5e"],
  };
  const [txt, , c] = m[s] || m.gonderilmedi;
  if (s === "gonderilmedi") return <span style={{ color: "#cbd5e1" }}>—</span>;
  return <span style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: c }}>{txt}</span>;
}
// WhatsApp gönderim rozeti — sadece gönderildiyse yeşil WhatsApp işareti
function waBadge(s: string | undefined) {
  if (s !== "gonderildi") return null;
  return (
    <span title="WhatsApp" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: ".7rem", fontWeight: 600, padding: "2px 7px", borderRadius: 20, color: "#fff", background: WA_GREEN }}>
      <WhatsAppGlyph size={11} />
    </span>
  );
}

// ── Mail modal ───────────────────────────────────────────────────
const MailModal: React.FC<{ leads: Lead[]; onClose: () => void; onSent: () => void; tr: (t: string, g: string) => string }> = ({ leads, onClose, onSent, tr }) => {
  // Seçilen leadlerde en yaygın dili varsayılan al
  const defLang = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) { const g = guessMsgLang(l, "de"); c[g] = (c[g] || 0) + 1; }
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || "de";
  }, [leads]);

  const [campCode, setCampCode] = useState<string>("");   // zorunlu — boşken gönderilemez
  const [langCode, setLangCode] = useState<string>(defLang);
  const [attachOn, setAttachOn] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const camp = kampanyaByCode(campCode);
  const ek = camp ? kampanyaEk(camp, langCode) : null;

  // Konu/dil değişince şablonu doldur (placeholder'lar edge fonksiyonunda dolar)
  useEffect(() => {
    if (!camp) { setSubject(""); setBody(""); return; }
    const s = kampanyaSablon(camp, langCode);
    setSubject(s.subject); setBody(s.body); setResult(null);
  }, [campCode, langCode]);

  const pickCamp = (code: string) => {
    setCampCode(code);
    const k = kampanyaByCode(code);
    if (k) { const langs = kampanyaDilleri(k); if (!langs.includes(langCode)) setLangCode(langs.includes(defLang) ? defLang : langs[0]); }
  };

  const send = async () => {
    if (!campCode) { setResult(tr("Önce bir konu seçin.", "Bitte zuerst ein Thema wählen.")); return; }
    if (!subject.trim() || !body.trim()) { setResult(tr("Konu ve mesaj gerekli.", "Betreff und Text erforderlich.")); return; }
    setSending(true); setResult(null);
    try {
      const attachments = attachOn && ek ? [{ filename: ek.name, path: ek.url }] : undefined;
      const { data, error } = await supabase.functions.invoke("send-lead-emails", {
        body: { lead_ids: leads.map((l) => l.id), subject, body, attachments },
      });
      if (error || !data?.success) { setResult(tr("Hata: ", "Fehler: ") + (data?.error || error?.message || "")); setSending(false); return; }
      setResult(tr(`✓ ${data.sent} gönderildi, ${data.failed} hata, ${data.skipped} atlandı.`, `✓ ${data.sent} gesendet.`));
      setSending(false);
      setTimeout(onSent, 1200);
    } catch (e: any) { setResult(String(e?.message || e)); setSending(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Mail size={18} color="#8b5cf6" /> {tr("Toplu Mail", "Massen-Mail")} · {leads.length}</h3>
        <button onClick={onClose} className="c-btn-ghost" style={{ padding: 6 }}><X size={16} /></button>
      </div>

      {/* Konu (kampanya) seçimi — zorunlu */}
      <Field label={tr("Konu / kampanya *", "Thema / Kampagne *")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {KAMPANYALAR.map((k) => (
            <button key={k.code} type="button" onClick={() => pickCamp(k.code)}
              className={k.code === campCode ? "c-btn-primary" : "c-btn-ghost"}
              title={tr(k.aciklama.tr, k.aciklama.de)}
              style={{ padding: "6px 12px", height: 34, fontSize: ".82rem", display: "inline-flex", alignItems: "center", gap: 6, borderLeft: `3px solid ${k.renk}` }}>
              <Megaphone size={13} /> {tr(k.label.tr, k.label.de)}
            </button>
          ))}
        </div>
        {!campCode && <div style={{ fontSize: ".75rem", color: "#f43f5e", marginTop: 6 }}>{tr("Devam etmek için bir konu seçin.", "Zum Fortfahren ein Thema wählen.")}</div>}
      </Field>

      {camp && (
        <>
          <div style={{ height: 12 }} />
          {/* Dil */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {kampanyaDilleri(camp).map((code) => {
              const L = LANGS.find((x) => x.code === code)!;
              return (
                <button key={code} type="button" onClick={() => setLangCode(code)}
                  className={code === langCode ? "c-btn-primary" : "c-btn-ghost"}
                  style={{ padding: "3px 9px", height: 28, fontSize: ".76rem", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span>{L.flag}</span> {L.label}
                </button>
              );
            })}
          </div>

          <div style={{ height: 12 }} />
          <p style={{ fontSize: ".8rem", color: "var(--text-3,#64748b)", margin: "0 0 8px" }}>
            {tr("Değişkenler: ", "Variablen: ")}<code>{"{{isim}}"}</code> <code>{"{{sehir}}"}</code> <code>{"{{kategori}}"}</code>
          </p>
          <Field label={tr("Konu", "Betreff")}>
            <input className="c-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <div style={{ height: 12 }} />
          <Field label={tr("Mesaj", "Nachricht")}>
            <textarea className="c-input" style={{ minHeight: 180, resize: "vertical", fontFamily: "inherit" }} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>

          {/* Ek dosya (sunum) */}
          {ek && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: ".82rem", color: "var(--text-2,#475569)", cursor: "pointer" }}>
              <input type="checkbox" checked={attachOn} onChange={(e) => setAttachOn(e.target.checked)} />
              <Paperclip size={14} color={attachOn ? "#8b5cf6" : "#94a3b8"} />
              {tr("Sunumu ekle", "Präsentation anhängen")}:
              <a href={ek.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#06b6d4", textDecoration: "none" }}>{ek.name}</a>
            </label>
          )}
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button className="c-btn-primary" onClick={send} disabled={sending || !campCode} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {tr("Gönder", "Senden")}
        </button>
        {result && <span style={{ fontSize: ".82rem", color: "var(--text-2,#475569)" }}>{result}</span>}
      </div>
    </Overlay>
  );
};

// ── Toplu WhatsApp modal (wa.me ile sırayla aç) ──────────────────
const WhatsAppModal: React.FC<{ leads: Lead[]; onClose: () => void; onSent: (ids: string[]) => void; tr: (t: string, g: string) => string }> = ({ leads, onClose, onSent, tr }) => {
  const defLang = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) { const g = guessMsgLang(l, "de"); c[g] = (c[g] || 0) + 1; }
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || "de";
  }, [leads]);

  const [campCode, setCampCode] = useState<string>("");
  const [langCode, setLangCode] = useState<string>(defLang);
  const [attachOn, setAttachOn] = useState(true);
  const [body, setBody] = useState("");
  const [idx, setIdx] = useState(0);
  const [sentIds, setSentIds] = useState<string[]>([]);

  const camp = kampanyaByCode(campCode);
  const ek = camp ? kampanyaEk(camp, langCode) : null;

  useEffect(() => {
    if (!camp) { setBody(""); return; }
    setBody(kampanyaSablon(camp, langCode).body);
    setIdx(0); setSentIds([]);
  }, [campCode, langCode]);

  const pickCamp = (code: string) => {
    setCampCode(code);
    const k = kampanyaByCode(code);
    if (k) { const langs = kampanyaDilleri(k); if (!langs.includes(langCode)) setLangCode(langs.includes(defLang) ? defLang : langs[0]); }
  };

  const waHrefFor = (l: Lead) => {
    const text = fillTpl(body, l) + (attachOn ? sunumSatiri(ek, langCode) : "");
    return `https://wa.me/${toIntlNumber(l.telefon)}?text=${encodeURIComponent(text)}`;
  };

  const done = idx >= leads.length;
  const cur = !done ? leads[idx] : null;

  const openNext = () => {
    if (!cur) return;
    window.open(waHrefFor(cur), "_blank", "noopener");
    setSentIds((s) => [...s, cur.id]);
    setIdx((i) => i + 1);
  };
  const skip = () => setIdx((i) => i + 1);
  const closeAndMark = () => { if (sentIds.length) onSent(sentIds); else onClose(); };

  return (
    <Overlay onClose={closeAndMark}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, color: WA_GREEN }}><WhatsAppGlyph size={18} /> {tr("Toplu WhatsApp", "Massen-WhatsApp")} · {leads.length}</h3>
        <button onClick={closeAndMark} className="c-btn-ghost" style={{ padding: 6 }}><X size={16} /></button>
      </div>
      <p style={{ fontSize: ".78rem", color: "var(--text-3,#64748b)", marginTop: 0 }}>
        {tr("Numaralar tek tek WhatsApp'ta açılır; her sohbette 'Gönder'e basın. Açılan kayıt 'gönderildi' işaretlenir.", "Nummern werden nacheinander in WhatsApp geöffnet; in jedem Chat auf 'Senden' klicken.")}
      </p>

      {/* Konu (kampanya) seçimi — zorunlu */}
      <Field label={tr("Konu / kampanya *", "Thema / Kampagne *")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {KAMPANYALAR.map((k) => (
            <button key={k.code} type="button" onClick={() => pickCamp(k.code)}
              className={k.code === campCode ? "c-btn-primary" : "c-btn-ghost"}
              title={tr(k.aciklama.tr, k.aciklama.de)}
              style={{ padding: "6px 12px", height: 34, fontSize: ".82rem", display: "inline-flex", alignItems: "center", gap: 6, borderLeft: `3px solid ${k.renk}` }}>
              <Megaphone size={13} /> {tr(k.label.tr, k.label.de)}
            </button>
          ))}
        </div>
        {!campCode && <div style={{ fontSize: ".75rem", color: "#f43f5e", marginTop: 6 }}>{tr("Devam etmek için bir konu seçin.", "Zum Fortfahren ein Thema wählen.")}</div>}
      </Field>

      {camp && (
        <>
          <div style={{ height: 12 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {kampanyaDilleri(camp).map((code) => {
              const L = LANGS.find((x) => x.code === code)!;
              return (
                <button key={code} type="button" onClick={() => setLangCode(code)}
                  className={code === langCode ? "c-btn-primary" : "c-btn-ghost"}
                  style={{ padding: "3px 9px", height: 28, fontSize: ".76rem", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span>{L.flag}</span> {L.label}
                </button>
              );
            })}
          </div>

          <div style={{ height: 12 }} />
          <p style={{ fontSize: ".8rem", color: "var(--text-3,#64748b)", margin: "0 0 8px" }}>
            {tr("Değişkenler: ", "Variablen: ")}<code>{"{{isim}}"}</code> <code>{"{{sehir}}"}</code> <code>{"{{kategori}}"}</code>
          </p>
          <Field label={tr("Mesaj", "Nachricht")}>
            <textarea className="c-input" style={{ minHeight: 150, resize: "vertical", fontFamily: "inherit" }} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>

          {ek && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: ".82rem", color: "var(--text-2,#475569)", cursor: "pointer" }}>
              <input type="checkbox" checked={attachOn} onChange={(e) => setAttachOn(e.target.checked)} />
              <Paperclip size={14} color={attachOn ? "#8b5cf6" : "#94a3b8"} />
              {tr("Sunum linkini ekle", "Präsentationslink anhängen")}
            </label>
          )}

          {/* Sırayla gönderim akışı */}
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(37,211,102,.06)", border: "1px solid rgba(37,211,102,.2)" }}>
            {done ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700, color: WA_GREEN }}>{tr("Tümü açıldı", "Alle geöffnet")} · {sentIds.length}/{leads.length}</div>
                <button className="c-btn-primary" onClick={() => onSent(sentIds)} style={{ marginTop: 10, background: WA_GREEN }}>
                  {tr("Bitir & işaretle", "Fertig & markieren")}
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: ".82rem", marginBottom: 8 }}>
                  {idx + 1}/{leads.length} · <strong>{cur?.isim}</strong> <span style={{ color: "#94a3b8" }}>{cur?.telefon}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="c-btn-primary" onClick={openNext} disabled={!campCode} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: WA_GREEN }}>
                    <WhatsAppGlyph size={14} /> {tr("Aç & sonraki", "Öffnen & weiter")}
                  </button>
                  <button className="c-btn-ghost" onClick={skip} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{tr("Atla", "Überspringen")}</button>
                </div>
                <div style={{ marginTop: 10, height: 6, background: "rgba(148,163,184,.18)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ width: `${(idx / leads.length) * 100}%`, height: "100%", background: WA_GREEN, transition: "width .2s" }} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </Overlay>
  );
};

// ── Detail modal ─────────────────────────────────────────────────
const DetailModal: React.FC<{
  lead: Lead; onClose: () => void; onSaveNotes: (id: string, n: string) => void;
  onSetDurum: (l: Lead, d: string) => void; onDelete: (l: Lead) => void; onChanged: () => void; tr: (t: string, g: string) => string;
}> = ({ lead, onClose, onSaveNotes, onSetDurum, onDelete, onChanged, tr }) => {
  const [notes, setNotes] = useState(lead.notlar || "");
  const [history, setHistory] = useState<LeadEmail[]>([]);
  const [reply, setReply] = useState("");
  const [classifying, setClassifying] = useState(false);

  // Kampanya (konu) + çok dilli taslak mesaj — konu seçilmeden gönderilemez
  const [campCode, setCampCode] = useState<string>("");
  const [msgCode, setMsgCode] = useState<string>(() => guessMsgLang(lead, tr("tr", "de")));
  const [attachOn, setAttachOn] = useState(true);
  const [subject, setSubject] = useState("");
  const [mbody, setMbody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const camp = kampanyaByCode(campCode);
  const ek = camp ? kampanyaEk(camp, msgCode) : null;
  const waIntl = lead.telefon ? toIntlNumber(lead.telefon) : "";
  const waText = mbody + (attachOn ? sunumSatiri(ek, msgCode) : "");
  const waHref = camp && waIntl ? `https://wa.me/${waIntl}?text=${encodeURIComponent(waText)}` : undefined;

  const pickCamp = (code: string) => {
    setCampCode(code);
    const k = kampanyaByCode(code);
    if (k) { const langs = kampanyaDilleri(k); if (!langs.includes(msgCode)) { const g = guessMsgLang(lead, tr("tr", "de")); setMsgCode(langs.includes(g) ? g : langs[0]); } }
  };

  // Manuel e-posta (web sitesinden ekleme)
  const [email, setEmail] = useState(lead.email || "");
  const [savedEmail, setSavedEmail] = useState(lead.email || "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const saveEmail = async () => {
    const v = email.trim();
    if (v === savedEmail) return;
    setSavingEmail(true); setEmailMsg(null);
    const { error } = await supabase.from("leads").update({ email: v || null }).eq("id", lead.id);
    setSavingEmail(false);
    if (error) setEmailMsg(tr("Kaydedilemedi.", "Fehler beim Speichern."));
    else { setSavedEmail(v); setEmailMsg(v ? tr("✓ E-posta kaydedildi.", "✓ E-Mail gespeichert.") : tr("E-posta silindi.", "E-Mail entfernt.")); onChanged(); }
  };

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("lead_emails").select("*").eq("lead_id", lead.id).order("created_at", { ascending: true });
    setHistory((data as LeadEmail[]) || []);
  }, [lead.id]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Konu/dil değişince şablonu şirket adıyla otomatik doldur (konu yoksa boş)
  useEffect(() => {
    const k = kampanyaByCode(campCode);
    if (!k) { setSubject(""); setMbody(""); setSendResult(null); return; }
    const s = kampanyaSablon(k, msgCode);
    setSubject(fillTpl(s.subject, lead));
    setMbody(fillTpl(s.body, lead));
    setSendResult(null);
  }, [campCode, msgCode, lead.id]);

  const sendDraft = async () => {
    if (!campCode) { setSendResult(tr("Önce bir konu seçin.", "Bitte zuerst ein Thema wählen.")); return; }
    const em = email.trim();
    if (!em) { setSendResult(tr("Önce e-posta ekleyin.", "Zuerst E-Mail hinzufügen.")); return; }
    if (!subject.trim() || !mbody.trim()) { setSendResult(tr("Konu ve mesaj gerekli.", "Betreff und Text erforderlich.")); return; }
    setSending(true); setSendResult(null);
    try {
      // Gönderimden önce e-postayı DB'ye yaz (edge fonksiyonu DB'den okur)
      if (em !== savedEmail) {
        await supabase.from("leads").update({ email: em }).eq("id", lead.id);
        setSavedEmail(em); onChanged();
      }
      const attachments = attachOn && ek ? [{ filename: ek.name, path: ek.url }] : undefined;
      const { data, error } = await supabase.functions.invoke("send-lead-emails", {
        body: { lead_ids: [lead.id], subject, body: mbody, attachments },
      });
      if (error || !data?.success) { setSendResult(tr("Hata: ", "Fehler: ") + (data?.error || error?.message || "")); }
      else if (data.sent) { setSendResult(tr("✓ Gönderildi.", "✓ Gesendet.")); await loadHistory(); onChanged(); }
      else { setSendResult(tr("Gönderilemedi.", "Nicht gesendet.") + (data.skipped ? tr(" (e-posta yok)", " (keine E-Mail)") : "")); }
    } catch (e: any) { setSendResult(String(e?.message || e)); }
    finally { setSending(false); }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${mbody}${attachOn ? sunumSatiri(ek, msgCode) : ""}`);
      setSendResult(tr("Panoya kopyalandı.", "In Zwischenablage kopiert."));
    } catch { setSendResult(tr("Kopyalanamadı.", "Kopieren fehlgeschlagen.")); }
  };

  const mailtoHref = email.trim()
    ? `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mbody + (attachOn ? sunumSatiri(ek, msgCode) : ""))}`
    : undefined;

  const classifyReply = async () => {
    if (!reply.trim()) return;
    setClassifying(true);
    try {
      await supabase.functions.invoke("lead-inbound", { body: { lead_id: lead.id, text: reply } });
      setReply(""); await loadHistory(); onChanged();
    } finally { setClassifying(false); }
  };

  return (
    <Drawer onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>{lead.isim}</h3>
          <div style={{ fontSize: ".82rem", color: "var(--text-3,#64748b)" }}>{lead.kategori}{lead.puan != null ? ` · ${lead.puan}★ (${lead.yorum_sayisi || 0})` : ""}</div>
        </div>
        <button onClick={onClose} className="c-btn-ghost" style={{ padding: 6 }}><X size={16} /></button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: ".85rem", margin: "12px 0", color: "var(--text-2,#475569)" }}>
        {lead.adres && <span style={{ display: "inline-flex", gap: 6 }}><MapPin size={13} /> {lead.adres}</span>}
        {lead.telefon && <PhoneLinks phone={lead.telefon} tr={tr} iconSize={13} />}
        {lead.website && <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", gap: 6, color: "#06b6d4" }}><Globe size={13} /> {lead.website}</a>}
        {lead.lat != null && <a href={`https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lng}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", gap: 6, color: "#06b6d4" }}><MapPin size={13} /> {tr("Haritada aç", "Auf Karte")}</a>}
      </div>

      {/* Manuel e-posta ekleme — web sitesinden bulup ekle */}
      <Field label={tr("E-posta", "E-Mail")}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Mail size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94a3b8" }} />
            <input className="c-input" type="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} onBlur={saveEmail}
              placeholder={tr("ornek@firma.de", "beispiel@firma.de")}
              style={{ paddingLeft: 32, width: "100%" }} />
          </div>
          <button type="button" className="c-btn-primary" onClick={saveEmail} disabled={savingEmail || email.trim() === savedEmail}
            title={tr("Kaydet", "Speichern")} style={{ height: 38, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {savingEmail ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: ".72rem", color: emailMsg?.startsWith("✓") ? "#10b981" : "#94a3b8" }}>
            {emailMsg || tr("Firmanın e-postasını web sitesinden bulup buraya ekleyin.", "E-Mail der Firma von der Website hier eintragen.")}
          </span>
          {lead.website && (
            <a href={lead.website} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: ".72rem", color: "#06b6d4", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", whiteSpace: "nowrap" }}>
              <ExternalLink size={11} /> {tr("Web sitesini aç", "Website öffnen")}
            </a>
          )}
        </div>
      </Field>
      <div style={{ height: 12 }} />

      <Field label={tr("Durum", "Status")}>
        <select className="c-input" value={lead.durum} onChange={(e) => onSetDurum(lead, e.target.value)}>
          {DURUMS.map((d) => <option key={d} value={d}>{durumLabel(d, tr)}</option>)}
        </select>
      </Field>
      <div style={{ height: 12 }} />
      <Field label={tr("Notlar", "Notizen")}>
        <textarea className="c-input" style={{ minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onSaveNotes(lead.id, notes)} placeholder={tr("Bu müşteriyle ilgili notlar…", "Notizen…")} />
      </Field>

      {/* Konu (kampanya) + çok dilli taslak mesaj — konu seçilmeden ilerlenemez */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line,#e2e8f0)" }}>
        <div style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--text-2,#475569)", display: "flex", alignItems: "center", gap: 6 }}>
          <Megaphone size={14} /> {tr("Konu / kampanya", "Thema / Kampagne")} <span style={{ color: "#f43f5e" }}>*</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 4px" }}>
          {KAMPANYALAR.map((k) => (
            <button key={k.code} type="button" onClick={() => pickCamp(k.code)}
              className={k.code === campCode ? "c-btn-primary" : "c-btn-ghost"}
              title={tr(k.aciklama.tr, k.aciklama.de)}
              style={{ padding: "6px 12px", height: 34, fontSize: ".82rem", display: "inline-flex", alignItems: "center", gap: 6, borderLeft: `3px solid ${k.renk}` }}>
              <Megaphone size={13} /> {tr(k.label.tr, k.label.de)}
            </button>
          ))}
        </div>

        {!camp ? (
          <div style={{ fontSize: ".8rem", color: "var(--text-3,#64748b)", background: "var(--panel-2,#f8fafc)", border: "1px dashed var(--line,#e2e8f0)", borderRadius: 10, padding: "14px 16px", marginTop: 8 }}>
            {tr("Mesaj taslağı ve ek dosya için önce bir konu seçin.", "Für Textentwurf und Anhang zuerst ein Thema wählen.")}
          </div>
        ) : (
          <>
            {/* Taslak dili */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "12px 0 10px", flexWrap: "wrap" }}>
              <Languages size={13} color="#94a3b8" />
              {kampanyaDilleri(camp).map((code) => {
                const L = LANGS.find((x) => x.code === code)!;
                return (
                  <button key={code} type="button" onClick={() => setMsgCode(code)}
                    className={code === msgCode ? "c-btn-primary" : "c-btn-ghost"}
                    style={{ padding: "4px 10px", height: 30, fontSize: ".78rem", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span>{L.flag}</span> {L.label}
                  </button>
                );
              })}
            </div>
            <Field label={tr("Konu", "Betreff")}>
              <input className="c-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <div style={{ height: 10 }} />
            <Field label={tr("Mesaj", "Nachricht")}>
              <textarea className="c-input" style={{ minHeight: 150, resize: "vertical", fontFamily: "inherit" }} value={mbody} onChange={(e) => setMbody(e.target.value)} />
            </Field>

            {/* Ek dosya (sunum) */}
            {ek && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: ".82rem", color: "var(--text-2,#475569)", cursor: "pointer", flexWrap: "wrap" }}>
                <input type="checkbox" checked={attachOn} onChange={(e) => setAttachOn(e.target.checked)} />
                <Paperclip size={14} color={attachOn ? "#8b5cf6" : "#94a3b8"} />
                {tr("Sunumu ekle", "Präsentation anhängen")}:
                <a href={ek.url} target="_blank" rel="noopener noreferrer" style={{ color: "#06b6d4", textDecoration: "none" }}>{ek.name}</a>
              </label>
            )}

            <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: 8 }}>
              {tr("Şirket adı otomatik eklenir. WhatsApp'ta sunum linki eklenir.", "Firmenname wird automatisch eingefügt. Bei WhatsApp wird der Präsentationslink angehängt.")}
              {!email.trim() && <span style={{ color: "#f43f5e" }}> · {tr("E-posta ile göndermek için yukarıya e-posta ekleyin.", "Zum Senden per E-Mail oben E-Mail hinzufügen.")}</span>}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="c-btn-primary" onClick={sendDraft} disabled={sending || !email.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />} {tr("Mail gönder", "E-Mail senden")}
              </button>
              {waHref && (
                <a className="c-btn-ghost" href={waHref} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: WA_GREEN, borderColor: WA_GREEN }}>
                  <WhatsAppGlyph size={15} /> {tr("WhatsApp'tan gönder", "Per WhatsApp")}
                </a>
              )}
              <button type="button" className="c-btn-ghost" onClick={copyDraft} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Copy size={14} /> {tr("Kopyala", "Kopieren")}
              </button>
              {mailtoHref && (
                <a className="c-btn-ghost" href={mailtoHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                  <Mail size={14} /> {tr("Mail uygulamasında aç", "Im Mail-Programm öffnen")}
                </a>
              )}
              {sendResult && <span style={{ fontSize: ".8rem", color: "var(--text-2,#475569)" }}>{sendResult}</span>}
            </div>
          </>
        )}
      </div>

      {/* Email history */}
      <div style={{ marginTop: 16, fontSize: ".8rem", fontWeight: 700, color: "var(--text-2,#475569)", display: "flex", alignItems: "center", gap: 6 }}>
        <MessageSquareText size={14} /> {tr("Yazışma geçmişi", "Verlauf")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0", maxHeight: 180, overflowY: "auto" }}>
        {history.length === 0 && <div style={{ fontSize: ".8rem", color: "#94a3b8" }}>{tr("Henüz yazışma yok.", "Noch kein Verlauf.")}</div>}
        {history.map((h) => (
          <div key={h.id} style={{ borderLeft: `3px solid ${h.direction === "inbound" ? "#10b981" : "#8b5cf6"}`, padding: "6px 10px", background: "var(--panel-2,#f8fafc)", borderRadius: 8 }}>
            <div style={{ fontSize: ".72rem", color: "var(--text-3,#64748b)", display: "flex", justifyContent: "space-between" }}>
              <span>{h.direction === "inbound" ? tr("↩ Gelen", "↩ Eingang") : tr("↪ Giden", "↪ Ausgang")}{h.reply_category ? ` · ${yanitLabel(h.reply_category, tr)}` : ""}</span>
              <span>{new Date(h.created_at).toLocaleDateString()}</span>
            </div>
            {h.subject && <div style={{ fontSize: ".8rem", fontWeight: 600 }}>{h.subject}</div>}
            {h.body && <div style={{ fontSize: ".78rem", color: "var(--text-2,#475569)", whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{h.body}</div>}
          </div>
        ))}
      </div>

      {/* Manual classify reply */}
      <Field label={tr("Gelen yanıtı yapıştır → sınıflandır", "Antwort einfügen → klassifizieren")}>
        <textarea className="c-input" style={{ minHeight: 60, resize: "vertical", fontFamily: "inherit" }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={tr("Müşterinin yanıtını buraya yapıştırın…", "Antwort hier einfügen…")} />
      </Field>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <button className="c-btn-danger" onClick={() => onDelete(lead)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><X size={14} /> {tr("Sil", "Löschen")}</button>
        <button className="c-btn-primary" onClick={classifyReply} disabled={classifying || !reply.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {classifying ? <Loader2 size={14} className="spin" /> : <Tag size={14} />} {tr("Sınıflandır", "Klassifizieren")}
        </button>
      </div>
    </Drawer>
  );
};

const Overlay: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.55)", display: "grid", placeItems: "center", zIndex: 1000, padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} className="c-card" style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: 22 }}>
      {children}
    </div>
  </div>
);

// ── Sağ panel (drawer) ───────────────────────────────────────────
const Drawer: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.45)", display: "flex", justifyContent: "flex-end", zIndex: 1000 }}>
    <div onClick={(e) => e.stopPropagation()} className="c-card" style={{ width: "100%", maxWidth: 460, height: "100%", borderRadius: 0, overflowY: "auto", padding: 22, boxShadow: "-16px 0 40px rgba(2,6,23,.18)", animation: "drawerIn .22s cubic-bezier(.22,.61,.36,1)" }}>
      {children}
    </div>
  </div>
);
