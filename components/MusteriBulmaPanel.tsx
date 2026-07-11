import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "../LanguageContext";
import { supabase } from "../services/supabaseService";
import {
  Search, Users, Mail, Download, Loader2, MapPin, Phone, Globe,
  Star, X, Filter, MessageSquareText, Tag, Send, RefreshCw, ExternalLink,
  Copy, Languages,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────
interface Lead {
  id: string;
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
  yanit_kategorisi: string | null;
  notlar: string | null;
  etiketler: string[] | null;
  created_at: string;
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

// ── Çok dilli taslak mesaj şablonları ────────────────────────────
// {{isim}} = işletme adı (otomatik dolar), {{sehir}}, {{kategori}}
const MSG_TEMPLATES: { code: string; label: string; flag: string; subject: string; body: string }[] = [
  {
    code: "tr", label: "Türkçe", flag: "🇹🇷",
    subject: "{{isim}} için kısa bir tanışma",
    body: "Merhaba {{isim}} ekibi,\n\nBen fikoai'den yazıyorum. İşletmenizin muhasebe ve evrak süreçlerini dijitalleştirip zamandan tasarruf etmenizi sağlayan çözümlerimizi kısaca tanıtmak isterim.\n\nSize uygun bir zamanda 10 dakikalık kısa bir görüşme yapabilir miyiz?\n\nSaygılarımızla,\nfikoai ekibi",
  },
  {
    code: "de", label: "Deutsch", flag: "🇩🇪",
    subject: "Kurze Vorstellung für {{isim}}",
    body: "Hallo Team von {{isim}},\n\nich melde mich von fikoai. Wir helfen Unternehmen dabei, ihre Buchhaltung und Verwaltung zu digitalisieren und dadurch Zeit zu sparen.\n\nHätten Sie Interesse an einem kurzen Gespräch von 10 Minuten?\n\nBeste Grüße,\nIhr fikoai-Team",
  },
  {
    code: "en", label: "English", flag: "🇬🇧",
    subject: "A quick hello to {{isim}}",
    body: "Hello {{isim}} team,\n\nI'm reaching out from fikoai. We help businesses digitalise their accounting and paperwork so they can save time.\n\nWould you be open to a short 10-minute call at a time that suits you?\n\nBest regards,\nThe fikoai team",
  },
  {
    code: "fr", label: "Français", flag: "🇫🇷",
    subject: "Une brève présentation pour {{isim}}",
    body: "Bonjour à l'équipe de {{isim}},\n\nJe vous contacte de la part de fikoai. Nous aidons les entreprises à numériser leur comptabilité et leurs démarches administratives afin de gagner du temps.\n\nSeriez-vous disponible pour un court échange de 10 minutes ?\n\nCordialement,\nL'équipe fikoai",
  },
  {
    code: "nl", label: "Nederlands", flag: "🇳🇱",
    subject: "Een korte kennismaking voor {{isim}}",
    body: "Hallo team van {{isim}},\n\nIk neem contact op namens fikoai. Wij helpen bedrijven hun boekhouding en administratie te digitaliseren en zo tijd te besparen.\n\nZou u openstaan voor een kort gesprek van 10 minuten?\n\nMet vriendelijke groet,\nHet fikoai-team",
  },
  {
    code: "it", label: "Italiano", flag: "🇮🇹",
    subject: "Una breve presentazione per {{isim}}",
    body: "Salve team di {{isim}},\n\nvi scrivo da parte di fikoai. Aiutiamo le aziende a digitalizzare la contabilità e le pratiche amministrative per farvi risparmiare tempo.\n\nAvreste piacere di fare una breve chiamata di 10 minuti?\n\nCordiali saluti,\nIl team fikoai",
  },
  {
    code: "es", label: "Español", flag: "🇪🇸",
    subject: "Una breve presentación para {{isim}}",
    body: "Hola equipo de {{isim}},\n\nles escribo de parte de fikoai. Ayudamos a las empresas a digitalizar su contabilidad y su gestión administrativa para ahorrar tiempo.\n\n¿Tendrían disponibilidad para una breve llamada de 10 minutos?\n\nUn saludo,\nEl equipo fikoai",
  },
];

function guessMsgLang(lead: { ulke?: string | null }, fallback: string): string {
  const u = (lead.ulke || "").toLowerCase();
  if (/deu|german|österr|austria|schweiz|switz/.test(u)) return "de";
  if (/türk|turk/.test(u)) return "tr";
  if (/fran/.test(u)) return "fr";
  if (/nether|nederl|holland|belg/.test(u)) return "nl";
  if (/ital/.test(u)) return "it";
  if (/span|españ|espan/.test(u)) return "es";
  if (/king|britain|england|usa|united states|ireland/.test(u)) return "en";
  return MSG_TEMPLATES.some((t) => t.code === fallback) ? fallback : "de";
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
  const [q, setQ] = useState("");

  // Modals
  const [mailOpen, setMailOpen] = useState(false);
  const [detail, setDetail] = useState<Lead | null>(null);

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
      .from("leads").select("*").eq("user_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) setLoadError(error.message);
    else setLeads((data as Lead[]) || []);
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
          setSearchMsg(tr(`✓ ${p.count} müşteri bulundu / güncellendi.`, `✓ ${p.count} Kunden gefunden.`));
          await fetchLeads(); setSearching(false); return;
        }
        if ((p && p.status === "error") || tries > 45) {
          setSearchMsg(p?.error || tr("Arama tamamlanamadı.", "Suche fehlgeschlagen."));
          setSearching(false); return;
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
  const deleteLead = async (lead: Lead) => {
    if (!confirm(tr(`"${lead.isim}" silinsin mi?`, `"${lead.isim}" löschen?`))) return;
    await supabase.from("leads").delete().eq("id", lead.id);
    setSelected((s) => { const n = new Set(s); n.delete(lead.id); return n; });
    setDetail(null);
    fetchLeads();
  };

  // ── Derived ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (filterDurum !== "all" && l.durum !== filterDurum) return false;
      if (needle && !(`${l.isim} ${l.adres || ""} ${l.kategori || ""} ${l.email || ""}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [leads, filterDurum, q]);

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
                return (
                  <div key={l.id} className="c-card" style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9, borderLeft: `3px solid ${isSel ? "#8b5cf6" : "transparent"}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggle(l.id)} style={{ marginTop: 3, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: ".92rem", lineHeight: 1.25 }}>{l.isim}</div>
                        <div style={{ fontSize: ".75rem", color: "var(--text-3,#64748b)", marginTop: 1 }}>{l.kategori}{l.adres ? ` · ${l.adres}` : ""}</div>
                      </div>
                      {l.puan != null && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: ".8rem", fontWeight: 600, flexShrink: 0 }}>
                          <Star size={13} color="#f59e0b" fill="#f59e0b" />{l.puan}
                        </span>
                      )}
                    </div>
                    {(l.telefon || l.email || l.website) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px", fontSize: ".78rem", color: "var(--text-2,#475569)", paddingLeft: 26 }}>
                        {l.telefon && <a href={`tel:${l.telefon}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "inherit", textDecoration: "none" }}><Phone size={12} />{l.telefon}</a>}
                        {l.email && <a href={`mailto:${l.email}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "inherit", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}><Mail size={12} />{l.email}</a>}
                        {l.website && <a href={l.website} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#06b6d4", textDecoration: "none" }}><Globe size={12} />Web</a>}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 26 }}>
                      <select value={l.durum} onChange={(e) => setDurum(l, e.target.value)}
                        style={{ fontSize: ".76rem", fontWeight: 600, border: "none", borderRadius: 7, padding: "5px 8px", cursor: "pointer", color: "#fff", background: DURUM_COLOR[l.durum] || "#64748b" }}>
                        {DURUMS.map((d) => <option key={d} value={d} style={{ color: "#0f172a", background: "#fff" }}>{durumLabel(d, tr)}</option>)}
                      </select>
                      {mailBadge(l.mail_durumu, tr)}
                      {l.yanit_kategorisi && <span style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: YANIT_COLOR[l.yanit_kategorisi] || "#94a3b8" }}>{yanitLabel(l.yanit_kategorisi, tr)}</span>}
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setDetail(l)} className="c-btn-ghost" style={{ padding: 7, height: 32 }} title={tr("Detay", "Details")}><ExternalLink size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="c-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "34px 1.6fr 1.2fr 130px 90px 120px 130px 40px", gap: 0, padding: "10px 14px", borderBottom: "1px solid var(--line,#e2e8f0)", fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-3,#64748b)", alignItems: "center" }}>
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
        ) : filtered.map((l) => (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "34px 1.6fr 1.2fr 130px 90px 120px 130px 40px", gap: 0, padding: "11px 14px", borderBottom: "1px solid var(--line,#f1f5f9)", fontSize: ".85rem", alignItems: "center" }}>
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.isim}</div>
              <div style={{ fontSize: ".76rem", color: "var(--text-3,#64748b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.kategori}{l.adres ? ` · ${l.adres}` : ""}
              </div>
            </div>
            <div style={{ fontSize: ".78rem", color: "var(--text-2,#475569)", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              {l.telefon && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Phone size={11} />{l.telefon}</span>}
              {l.email && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Mail size={11} />{l.email}</span>}
              {l.website && <a href={l.website} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#06b6d4" }}><Globe size={11} />Web</a>}
            </div>
            <div>
              <select value={l.durum} onChange={(e) => setDurum(l, e.target.value)}
                style={{ fontSize: ".76rem", fontWeight: 600, border: "none", borderRadius: 7, padding: "4px 6px", cursor: "pointer", color: "#fff", background: DURUM_COLOR[l.durum] || "#64748b" }}>
                {DURUMS.map((d) => <option key={d} value={d} style={{ color: "#0f172a", background: "#fff" }}>{durumLabel(d, tr)}</option>)}
              </select>
            </div>
            <div>{l.puan != null ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Star size={12} color="#f59e0b" fill="#f59e0b" />{l.puan}</span> : <span style={{ color: "#cbd5e1" }}>—</span>}</div>
            <div>{mailBadge(l.mail_durumu, tr)}</div>
            <div>{l.yanit_kategorisi ? <span style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: YANIT_COLOR[l.yanit_kategorisi] || "#94a3b8" }}>{yanitLabel(l.yanit_kategorisi, tr)}</span> : <span style={{ color: "#cbd5e1" }}>—</span>}</div>
            <button onClick={() => setDetail(l)} className="c-btn-ghost" style={{ padding: 6, height: 30 }} title={tr("Detay", "Details")}><ExternalLink size={13} /></button>
          </div>
        ))}
      </div>
      )}

      {mailOpen && <MailModal leads={selectedWithEmail} onClose={() => setMailOpen(false)} onSent={() => { setMailOpen(false); setSelected(new Set()); fetchLeads(); }} tr={tr} />}
      {detail && <DetailModal lead={detail} onClose={() => setDetail(null)} onSaveNotes={saveNotes} onSetDurum={setDurum} onDelete={deleteLead} onChanged={fetchLeads} tr={tr} />}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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

// ── Mail modal ───────────────────────────────────────────────────
const MailModal: React.FC<{ leads: Lead[]; onClose: () => void; onSent: () => void; tr: (t: string, g: string) => string }> = ({ leads, onClose, onSent, tr }) => {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(tr("Merhaba {{isim}},\n\n", "Hallo {{isim}},\n\n"));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const send = async () => {
    if (!subject.trim() || !body.trim()) { setResult(tr("Konu ve mesaj gerekli.", "Betreff und Text erforderlich.")); return; }
    setSending(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-lead-emails", {
        body: { lead_ids: leads.map((l) => l.id), subject, body },
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
      <p style={{ fontSize: ".8rem", color: "var(--text-3,#64748b)", marginTop: 0 }}>
        {tr("Değişkenler: ", "Variablen: ")}<code>{"{{isim}}"}</code> <code>{"{{sehir}}"}</code> <code>{"{{kategori}}"}</code>
      </p>
      <Field label={tr("Konu", "Betreff")}>
        <input className="c-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={tr("Örn: {{isim}} için özel web çözümü", "Betreff…")} />
      </Field>
      <div style={{ height: 12 }} />
      <Field label={tr("Mesaj", "Nachricht")}>
        <textarea className="c-input" style={{ minHeight: 180, resize: "vertical", fontFamily: "inherit" }} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <button className="c-btn-primary" onClick={send} disabled={sending} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {tr("Gönder", "Senden")}
        </button>
        {result && <span style={{ fontSize: ".82rem", color: "var(--text-2,#475569)" }}>{result}</span>}
      </div>
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

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("lead_emails").select("*").eq("lead_id", lead.id).order("created_at", { ascending: true });
    setHistory((data as LeadEmail[]) || []);
  }, [lead.id]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const classifyReply = async () => {
    if (!reply.trim()) return;
    setClassifying(true);
    try {
      await supabase.functions.invoke("lead-inbound", { body: { lead_id: lead.id, text: reply } });
      setReply(""); await loadHistory(); onChanged();
    } finally { setClassifying(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>{lead.isim}</h3>
          <div style={{ fontSize: ".82rem", color: "var(--text-3,#64748b)" }}>{lead.kategori}{lead.puan != null ? ` · ${lead.puan}★ (${lead.yorum_sayisi || 0})` : ""}</div>
        </div>
        <button onClick={onClose} className="c-btn-ghost" style={{ padding: 6 }}><X size={16} /></button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: ".85rem", margin: "12px 0", color: "var(--text-2,#475569)" }}>
        {lead.adres && <span style={{ display: "inline-flex", gap: 6 }}><MapPin size={13} /> {lead.adres}</span>}
        {lead.telefon && <a href={`tel:${lead.telefon}`} style={{ display: "inline-flex", gap: 6, color: "inherit" }}><Phone size={13} /> {lead.telefon}</a>}
        {lead.email && <a href={`mailto:${lead.email}`} style={{ display: "inline-flex", gap: 6, color: "#06b6d4" }}><Mail size={13} /> {lead.email}</a>}
        {lead.website && <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", gap: 6, color: "#06b6d4" }}><Globe size={13} /> {lead.website}</a>}
        {lead.lat != null && <a href={`https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lng}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", gap: 6, color: "#06b6d4" }}><MapPin size={13} /> {tr("Haritada aç", "Auf Karte")}</a>}
      </div>

      <Field label={tr("Durum", "Status")}>
        <select className="c-input" value={lead.durum} onChange={(e) => onSetDurum(lead, e.target.value)}>
          {DURUMS.map((d) => <option key={d} value={d}>{durumLabel(d, tr)}</option>)}
        </select>
      </Field>
      <div style={{ height: 12 }} />
      <Field label={tr("Notlar", "Notizen")}>
        <textarea className="c-input" style={{ minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onSaveNotes(lead.id, notes)} placeholder={tr("Bu müşteriyle ilgili notlar…", "Notizen…")} />
      </Field>

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
    </Overlay>
  );
};

const Overlay: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.55)", display: "grid", placeItems: "center", zIndex: 1000, padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} className="c-card" style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: 22 }}>
      {children}
    </div>
  </div>
);
