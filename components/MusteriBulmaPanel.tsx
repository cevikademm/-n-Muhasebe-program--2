import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLang } from "../LanguageContext";
import { supabase } from "../services/supabaseService";
import {
  KAMPANYALAR, LANGS, ilkKampanya, kampanyaByCode, kampanyaDilleri,
  kampanyaSablon, kampanyaEk, mesajMetni, SITE_HOST,
} from "./musteriBulmaKampanyalar";
import {
  Search, Users, Mail, Download, Loader2, MapPin, Phone, Globe,
  Star, X, Filter, MessageSquareText, Tag, Send, RefreshCw, ExternalLink,
  Copy, Languages, Save, Paperclip, Megaphone, Trash2,
  Instagram, Youtube, UserCircle2, Heart, PlaySquare, StopCircle,
} from "lucide-react";

// ── Kaynaklar (platform sekmeleri) ───────────────────────────────
// Her sekme kendi Apify aktörünü kullanır; edge fonksiyonu `kaynak`
// parametresiyle doğru aktöre yönlendirir.
type Kaynak = "maps" | "instagram" | "youtube";
type Mod = "musteri" | "kendi";

const KAYNAKLAR: {
  id: Kaynak; label: string; color: string; icon: React.FC<any>;
  // Maps'te "kendi hesabım" modu yok — yalnızca müşteri araması.
  kendiVar: boolean;
}[] = [
  { id: "maps", label: "Google Maps", color: "#8b5cf6", icon: MapPin, kendiVar: false },
  { id: "instagram", label: "Instagram", color: "#e1306c", icon: Instagram, kendiVar: true },
  { id: "youtube", label: "YouTube", color: "#ff0000", icon: Youtube, kendiVar: true },
];
const kaynakMeta = (k?: Kaynak | null) => KAYNAKLAR.find((x) => x.id === (k || "maps")) || KAYNAKLAR[0];

// Takipçi/abone sayısını kısaltır: 6650000 → "6,7 Mn"
function kisaSayi(n?: number | null, lang = "tr"): string {
  if (n == null || !isFinite(n)) return "—";
  const m = lang === "tr" ? ["", " B", " Mn", " Mr"] : ["", "K", "M", "B"];
  let i = 0, v = n;
  while (v >= 1000 && i < 3) { v /= 1000; i++; }
  const s = i === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0);
  return s.replace(".", lang === "tr" ? "," : ".") + m[i];
}

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
  // Lead'in hangi platformdan geldiği + sosyal profil alanları
  kaynak?: Kaynak | null;
  kullanici_adi?: string | null;
  takipci?: number | null;
  profil_url?: string | null;
  // Bu lead'in geldiği arama grubu (lead_searches embed) — "aradığım grup"
  search?: {
    kategori: string | null;
    sehir: string | null;
    ulke: string | null;
    kaynak?: Kaynak | null;
    sorgu?: string | null;
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
// Lead başına yazışma özeti: kaç mail attık (kaçıncı mail) + son gelen yanıt.
interface MailStat {
  out: number;                 // gönderilen mail sayısı → sıradaki "n+1. mail"
  lastOut: string | null;      // son gönderim tarihi
  inCount: number;             // gelen yanıt sayısı
  lastIn: { subject: string | null; body: string; category: string | null; at: string } | null;
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
  const src = (s?.kaynak || "maps") as Kaynak;
  // Maps aramasını "kategori", Instagram/YouTube aramasını "sorgu" tanımlar.
  const kat = (s?.kategori || s?.sorgu || "").trim();
  if (!kat) return null;
  const city = (s?.sehir || "").trim();
  const country = (s?.ulke || "").trim();
  const key = `${src}|${kat}|${city}|${country}`.toLowerCase();
  const flags = [
    s?.only_email && tr("E-posta", "E-Mail"),
    s?.only_phone && tr("Telefon", "Telefon"),
    s?.only_website && "Web",
  ].filter(Boolean).join(", ");
  const title = [
    kaynakMeta(src).label,
    kat,
    [city, country].filter(Boolean).join(", "),
    s?.min_puan ? `≥ ${s.min_puan} ★` : "",
    flags && (tr("Filtre: ", "Filter: ") + flags),
  ].filter(Boolean).join(" · ");
  return { key, label: kat, sub: city || country, title };
}

// ── Taslak mesaj şablonları & kampanyalar musteriBulmaKampanyalar.ts'de ──
// Lead'in ülkesinden taslak dilini tahmin eder.
// ── Varsayılan konu + dil ────────────────────────────────────────
// Hedef pazar Almanya: WhatsApp ve detay panelinde konu "AI Ekspertiz
// Platformu", dil "Deutsch" olarak hazır gelir (kullanıcı değiştirebilir).
const VARSAYILAN_KAMPANYA = "ai-ekspertiz";
const VARSAYILAN_DIL = "de";
const varsayilanKampanya = () => kampanyaByCode(VARSAYILAN_KAMPANYA) || ilkKampanya();

// Ülke alanı kaynağa göre ISO kodu ("DE"), İngilizce ("Germany") ya da Türkçe
// ("Almanya") gelebiliyor — üçünü de tanı. Aksanlar NFD ile sadeleştirilir.
const ULKE_KODU_DIL: Record<string, string> = {
  de: "de", at: "de", ch: "de", li: "de",
  tr: "tr", fr: "fr", be: "nl", nl: "nl", it: "it", es: "es",
  gb: "en", uk: "en", us: "en", ie: "en",
};
function guessMsgLang(lead: { ulke?: string | null }, fallback: string): string {
  const u = (lead.ulke || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (u.length === 2 && ULKE_KODU_DIL[u]) return ULKE_KODU_DIL[u];
  if (/deu|german|osterr|austria|schweiz|switz|almanya|avusturya|isvicre/.test(u)) return "de";
  if (/turk/.test(u)) return "tr";
  if (/fran/.test(u)) return "fr";
  if (/nether|nederl|holland|belg|felemenk/.test(u)) return "nl";
  if (/ital/.test(u)) return "it";
  if (/span|espan|ispanya/.test(u)) return "es";
  if (/king|britain|england|usa|united states|ireland|ingiltere|amerika|irlanda/.test(u)) return "en";
  return LANGS.some((t) => t.code === fallback) ? fallback : "de";
}
const fillTpl = (s: string, lead: { isim?: string | null; sehir?: string | null; kategori?: string | null }) =>
  String(s ?? "")
    .replaceAll("{{isim}}", lead.isim || "")
    .replaceAll("{{sehir}}", lead.sehir || "")
    .replaceAll("{{kategori}}", lead.kategori || "");

// ── Kampanya (konu) seçici — Toplu Mail, Toplu WhatsApp ve detay panelinde ortak ──
// Son müşteriye giden (b2c) kampanyalar rozetle ayrılır: bu metinlerde marka
// adı geçmez, imza alanı müşterinin kendi bürosuna aittir.
const CampPicker: React.FC<{ value: string; onPick: (code: string) => void; tr: (t: string, g: string) => string }> = ({ value, onPick, tr }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    {KAMPANYALAR.map((k) => (
      <button key={k.code} type="button" onClick={() => onPick(k.code)}
        className={k.code === value ? "c-btn-primary" : "c-btn-ghost"}
        title={tr(k.aciklama.tr, k.aciklama.de)}
        style={{ padding: "6px 12px", height: 34, fontSize: ".82rem", display: "inline-flex", alignItems: "center", gap: 6, borderLeft: `3px solid ${k.renk}` }}>
        <Megaphone size={13} /> {tr(k.label.tr, k.label.de)}
        {k.hedef === "b2c" && (
          <span style={{ fontSize: ".6rem", fontWeight: 700, padding: "1px 5px", borderRadius: 5, background: "rgba(14,165,233,.16)", color: "#0284c7" }}>
            {tr("SON MÜŞTERİ", "ENDKUNDE")}
          </span>
        )}
      </button>
    ))}
  </div>
);

// Her mail/mesajın sonuna eklenen adres — kullanıcıya görünür not
const ImzaNotu: React.FC<{ tr: (t: string, g: string) => string }> = ({ tr }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "7px 10px", borderRadius: 8, background: "rgba(6,182,212,.07)", border: "1px solid rgba(6,182,212,.22)", fontSize: ".76rem", color: "var(--text-2,#475569)" }}>
    <Globe size={13} color="#06b6d4" />
    {tr("Her mesajın sonuna otomatik eklenir:", "Wird automatisch an jede Nachricht angehängt:")}
    <a href={`https://${SITE_HOST}`} target="_blank" rel="noopener noreferrer" style={{ color: "#06b6d4", fontWeight: 600, textDecoration: "none" }}>{SITE_HOST}</a>
  </div>
);

export const MusteriBulmaPanel: React.FC<Props> = ({ ownerId }) => {
  const { lang } = useLang();
  const tr = (t: string, d: string) => (lang === "tr" ? t : d);

  // Aktif platform sekmesi + mod
  const [kaynak, setKaynak] = useState<Kaynak>("maps");
  const [mod, setMod] = useState<Mod>("musteri");
  const meta = kaynakMeta(kaynak);
  // Maps'te kendi hesap modu yok → sekme değişince güvenli moda düş
  const effMod: Mod = meta.kendiVar ? mod : "musteri";

  // Search form
  const [ulke, setUlke] = useState("Deutschland");
  const [sehir, setSehir] = useState("");
  const [kategori, setKategori] = useState("");
  // Instagram/YouTube serbest sorgusu — her sekme kendi metnini korusun
  const [sorgular, setSorgular] = useState<Record<string, string>>({});
  const sorguKey = `${kaynak}:${effMod}`;
  const sorgu = sorgular[sorguKey] ?? "";
  const setSorgu = (v: string) => setSorgular((s) => ({ ...s, [sorguKey]: v }));
  const [maxResults, setMaxResults] = useState(30);
  const [minPuan, setMinPuan] = useState(0);
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [onlyWebsite, setOnlyWebsite] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  // mod="kendi" sonuçları (leads tablosuna yazılmaz, panelde gösterilir)
  const [kendiSonuc, setKendiSonuc] = useState<any[] | null>(null);

  // Leads
  const [leads, setLeads] = useState<Lead[]>([]);
  // lead_id → yazışma özeti (kaçıncı mail + son gelen yanıt)
  const [mailStats, setMailStats] = useState<Record<string, MailStat>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterDurum, setFilterDurum] = useState<string>("all");
  const [filterMail, setFilterMail] = useState<string>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterKaynak, setFilterKaynak] = useState<string>("all");
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
      .select("*, search:lead_searches(kategori,sehir,ulke,kaynak,sorgu,only_email,only_phone,only_website,min_puan)")
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

  // Yazışma özeti: her lead için kaç mail gitti (→ "kaçıncı mail") ve son gelen
  // yanıtın metni. Giden maillerin gövdesi çekilmez (gereksiz yük), sadece sayılır.
  const fetchMailStats = useCallback(async () => {
    if (!ownerId) return;
    const [outRes, inRes] = await Promise.all([
      supabase.from("lead_emails").select("lead_id,created_at")
        .eq("user_id", ownerId).eq("direction", "outbound")
        .order("created_at", { ascending: true }).limit(10000),
      supabase.from("lead_emails").select("lead_id,subject,body,reply_category,created_at")
        .eq("user_id", ownerId).eq("direction", "inbound")
        .order("created_at", { ascending: true }).limit(2000),
    ]);
    const map: Record<string, MailStat> = {};
    const at = (id: string) => (map[id] ||= { out: 0, lastOut: null, inCount: 0, lastIn: null });
    for (const r of (outRes.data as any[]) || []) {
      if (!r.lead_id) continue;
      const s = at(r.lead_id); s.out++; s.lastOut = r.created_at;
    }
    for (const r of (inRes.data as any[]) || []) {
      if (!r.lead_id) continue;
      const s = at(r.lead_id); s.inCount++;
      s.lastIn = { subject: r.subject, body: r.body || "", category: r.reply_category, at: r.created_at };
    }
    setMailStats(map);
  }, [ownerId]);

  useEffect(() => { fetchLeads(); fetchMailStats(); }, [fetchLeads, fetchMailStats]);

  // Realtime — hem lead kayıtları hem yazışmalar (gelen yanıt anında düşsün)
  useEffect(() => {
    if (!ownerId) return;
    const ch = supabase
      .channel("leads-" + ownerId)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${ownerId}` },
        () => fetchLeads())
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_emails", filter: `user_id=eq.${ownerId}` },
        () => fetchMailStats())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, fetchLeads, fetchMailStats]);

  // ── Search ─────────────────────────────────────────────────────
  // Her arama bir "run" numarası alır. Durdur'a basılınca numara artar →
  // devam eden poll döngüsü kendini geçersiz sayıp sessizce çıkar.
  const runIdRef = useRef(0);
  const pollTimerRef = useRef<any>(null);

  const stopSearch = () => {
    runIdRef.current++;
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    setSearching(false);
    setSearchMsg(tr("Arama durduruldu. Bulunanlar listede.", "Suche gestoppt. Gefundene Einträge sind in der Liste."));
    // Durdurana kadar eklenen leadler görünsün
    if (effMod === "musteri") fetchLeads();
  };

  // Panel kapanırsa bekleyen poll'u temizle
  useEffect(() => () => {
    runIdRef.current++;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  const runSearch = async () => {
    // Kaynağa göre zorunlu alanlar
    if (kaynak === "maps") {
      if (!kategori.trim()) { setSearchMsg(tr("Kategori girin (ör. restoran, kuaför).", "Kategorie eingeben.")); return; }
      if (!sehir.trim() && !ulke.trim()) { setSearchMsg(tr("Şehir veya ülke girin.", "Stadt oder Land eingeben.")); return; }
    } else if (!sorgu.trim()) {
      setSearchMsg(effMod === "kendi"
        ? tr("Hesap adınızı girin.", "Bitte Kontonamen eingeben.")
        : tr("Arama kelimesi girin.", "Bitte Suchbegriff eingeben."));
      return;
    }
    const myRun = ++runIdRef.current;
    const iptal = () => myRun !== runIdRef.current;
    setSearching(true); setKendiSonuc(null);
    setSearchMsg(tr("Arama başlatılıyor…", "Suche wird gestartet…"));
    try {
      const { data, error } = await supabase.functions.invoke("find-customers", {
        body: {
          action: "start", kaynak, mod: effMod, sorgu,
          ulke, sehir, kategori,
          max_results: maxResults, min_puan: minPuan,
          only_email: onlyEmail, only_phone: onlyPhone, only_website: onlyWebsite, lang,
        },
      });
      if (iptal()) return;
      if (error || !data?.success) {
        setSearchMsg(tr("Başlatılamadı: ", "Fehler: ") + (data?.error || error?.message || ""));
        setSearching(false); return;
      }
      const searchId = data.searchId;
      let tries = 0;
      const poll = async () => {
        if (iptal()) return;
        tries++;
        const { data: p } = await supabase.functions.invoke("find-customers", { body: { action: "poll", searchId } });
        if (iptal()) return;
        if (p?.status === "done") {
          if (effMod === "kendi") {
            setKendiSonuc(Array.isArray(p.sonuc) ? p.sonuc : []);
            setSearchMsg(p.sonuc?.length
              ? tr("✓ Hesap verisi çekildi.", "✓ Kontodaten geladen.")
              : tr("Hesap bulunamadı.", "Konto nicht gefunden."));
            setSearching(false); return;
          }
          const dup = p.duplicates ? tr(` · ${p.duplicates} zaten listede`, ` · ${p.duplicates} bereits vorhanden`) : "";
          // Mevcut kayıtların eksik e-posta/telefonu bu aramada dolduysa bildir
          const enr = p.enriched ? tr(` · ${p.enriched} kaydın iletişimi güncellendi`, ` · ${p.enriched} Kontakte ergänzt`) : "";
          setSearchMsg(tr(`✓ ${p.count} yeni müşteri${dup}${enr}.`, `✓ ${p.count} neue Kunden${dup}${enr}.`));
          await fetchLeads(); setSearching(false); return;
        }
        if ((p && p.status === "error") || tries > 45) {
          setSearchMsg(p?.error || tr("Arama tamamlanamadı.", "Suche fehlgeschlagen."));
          // Poll bitmese/timeout olsa bile edge fonksiyonu leadleri arka
          // planda eklemiş olabilir → listeyi yine de tazele ki gizli kalmasın.
          if (effMod === "musteri") await fetchLeads();
          setSearching(false); return;
        }
        setSearchMsg(tr(`${meta.label} taranıyor… (${tries})`, `${meta.label} wird durchsucht… (${tries})`));
        pollTimerRef.current = setTimeout(poll, 5000);
      };
      pollTimerRef.current = setTimeout(poll, 4000);
    } catch (e: any) {
      if (iptal()) return;
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
      if (filterKaynak !== "all" && (l.kaynak || "maps") !== filterKaynak) return false;
      if (filterGroup !== "all") { const g = leadGroup(l, tr); if (!g || g.key !== filterGroup) return false; }
      if (filterMail !== "all") {
        const st = mailStats[l.id];
        const gitti = (st?.out || 0) > 0 || l.mail_durumu !== "gonderilmedi";
        const yanit = (st?.inCount || 0) > 0 || l.mail_durumu === "yanit_geldi";
        if (filterMail === "yanit" && !yanit) return false;                 // cevap verenler
        if (filterMail === "bekliyor" && (!gitti || yanit)) return false;   // mail gitti, cevap yok
        if (filterMail === "gonderilmedi" && gitti) return false;           // hiç mail gitmedi
      }
      if (needle && !(`${l.isim} ${l.adres || ""} ${l.kategori || ""} ${l.email || ""} ${l.kullanici_adi || ""}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [leads, mailStats, filterDurum, filterKaynak, filterGroup, filterMail, q, lang]);

  // Kaynak filtresi yalnızca birden fazla platformdan lead varsa anlamlı
  const kaynakSayilari = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.kaynak || "maps", (m.get(l.kaynak || "maps") || 0) + 1);
    return m;
  }, [leads]);

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
      Platform: kaynakMeta(l.kaynak).label,
      İsim: l.isim, Kategori: l.kategori, Adres: l.adres, Telefon: l.telefon,
      "E-posta": l.email, Website: l.website, Puan: l.puan, "Yorum": l.yorum_sayisi,
      "Kullanıcı adı": l.kullanici_adi, "Takipçi": l.takipci, "Profil": l.profil_url,
      Şehir: l.sehir, Durum: l.durum, "Mail Durumu": l.mail_durumu,
      "Gönderilen mail": mailStats[l.id]?.out ?? 0,
      "Son gönderim": mailStats[l.id]?.lastOut ? kisaTarih(mailStats[l.id]!.lastOut) : "",
      "Yanıt": l.yanit_kategorisi,
      "Yanıt tarihi": mailStats[l.id]?.lastIn ? kisaTarih(mailStats[l.id]!.lastIn!.at) : "",
      "Gelen mesaj": mailStats[l.id]?.lastIn?.body || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Müşteriler");
    XLSX.writeFile(wb, `musteriler_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const stats = useMemo(() => ({
    total: leads.length,
    withEmail: leads.filter((l) => l.email).length,
    contacted: leads.filter((l) => (mailStats[l.id]?.out || 0) > 0 || l.mail_durumu !== "gonderilmedi").length,
    replied: leads.filter((l) => (mailStats[l.id]?.inCount || 0) > 0 || l.mail_durumu === "yanit_geldi").length,
  }), [leads, mailStats]);

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
            {tr("Google Maps, Instagram ve YouTube’dan müşteri bul, pipeline’a ekle, toplu mail at.", "Kunden aus Google Maps, Instagram und YouTube finden und kontaktieren.")}
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

      {/* ── Platform sekmeleri ───────────────────────────────────── */}
      <div style={{ display: "flex", gap: isMobile ? 6 : 8, marginBottom: -1, flexWrap: "wrap" }}>
        {KAYNAKLAR.map((k) => {
          const Ico = k.icon;
          const on = kaynak === k.id;
          return (
            <button key={k.id} onClick={() => { setKaynak(k.id); setKendiSonuc(null); setSearchMsg(null); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
                padding: isMobile ? "9px 12px" : "10px 16px",
                fontSize: isMobile ? ".82rem" : ".88rem", fontWeight: on ? 700 : 600,
                borderRadius: "11px 11px 0 0",
                border: "1px solid var(--line,#e2e8f0)", borderBottom: on ? "1px solid transparent" : undefined,
                background: on ? "var(--card,#fff)" : "transparent",
                color: on ? k.color : "var(--text-3,#64748b)",
                position: "relative", zIndex: on ? 2 : 1,
              }}>
              <Ico size={15} /> {k.label}
            </button>
          );
        })}
      </div>

      {/* Search form */}
      <div className="c-card" style={{ padding: isMobile ? 14 : 18, marginBottom: isMobile ? 14 : 18, borderTopLeftRadius: 0 }}>
        {/* Mod seçici — yalnızca Instagram/YouTube'da iki mod var */}
        {meta.kendiVar ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {([
              { id: "musteri" as Mod, label: tr("Müşteri bul", "Kunden finden"), icon: Users },
              { id: "kendi" as Mod, label: tr("Kendi hesabım", "Mein Konto"), icon: UserCircle2 },
            ]).map((m) => {
              const Ico = m.icon;
              const on = effMod === m.id;
              return (
                <button key={m.id} onClick={() => { setMod(m.id); setKendiSonuc(null); setSearchMsg(null); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
                    padding: "7px 13px", fontSize: ".82rem", fontWeight: 600, borderRadius: 9,
                    border: `1px solid ${on ? meta.color : "var(--line,#e2e8f0)"}`,
                    background: on ? `${meta.color}14` : "transparent",
                    color: on ? meta.color : "var(--text-3,#64748b)",
                  }}>
                  <Ico size={14} /> {m.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontWeight: 600 }}>
            <Search size={16} color={meta.color} /> {tr("Yeni Arama", "Neue Suche")}
          </div>
        )}

        {/* ── Kaynağa özel form ─────────────────────────────────── */}
        {kaynak === "maps" ? (
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
        ) : effMod === "kendi" ? (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 12 }}>
            <Field label={kaynak === "instagram"
              ? tr("Instagram hesabınız *", "Ihr Instagram-Konto *")
              : tr("YouTube kanalınız *", "Ihr YouTube-Kanal *")}>
              <input className="c-input" value={sorgu} onChange={(e) => setSorgu(e.target.value)}
                placeholder={kaynak === "instagram" ? "@fikoai" : "@fikoai"} />
            </Field>
            {kaynak === "instagram" && (
              <Field label={tr("Son gönderi sayısı", "Letzte Beiträge")}>
                <input className="c-input" type="number" min={1} max={120} value={maxResults}
                  onChange={(e) => setMaxResults(Math.min(120, Math.max(1, +e.target.value || 1)))} />
              </Field>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr", gap: 12 }}>
            <Field label={kaynak === "instagram"
              ? tr("Arama kelimesi *", "Suchbegriff *")
              : tr("Niş / anahtar kelime *", "Nische / Keyword *")}>
              <input className="c-input" value={sorgu} onChange={(e) => setSorgu(e.target.value)}
                placeholder={kaynak === "instagram"
                  ? tr("steuerberater köln, kfz gutachter…", "Steuerberater Köln, Kfz-Gutachter…")
                  : tr("steuerberater, buchhaltung…", "Steuerberater, Buchhaltung…")} />
            </Field>
            <Field label={tr("Maks. sonuç", "Max. Ergebnisse")}>
              <input className="c-input" type="number" min={1} max={120} value={maxResults}
                onChange={(e) => setMaxResults(Math.min(120, Math.max(1, +e.target.value || 1)))} />
            </Field>
            <Field label={tr("Filtreler", "Filter")}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", height: 38 }}>
                <Check label={tr("E-posta", "E-Mail")} checked={onlyEmail} onChange={setOnlyEmail} />
                <Check label="Web" checked={onlyWebsite} onChange={setOnlyWebsite} />
              </div>
            </Field>
          </div>
        )}

        {/* Kaynağa özel ipucu */}
        <p style={{ margin: "12px 0 0", fontSize: ".76rem", color: "var(--text-3,#94a3b8)", lineHeight: 1.5 }}>
          {kaynak === "maps"
            ? tr("İşletmenin web sitesi de taranır; e-posta ve telefon oradan çıkarılır.",
                 "Die Website des Unternehmens wird mitgescannt — E-Mail und Telefon werden daraus extrahiert.")
            : kaynak === "instagram"
            ? effMod === "kendi"
              ? tr("Profil bilgileriniz ve son gönderileriniz çekilir; müşteri listesine eklenmez.",
                   "Ihr Profil und Ihre letzten Beiträge werden geladen — nicht zur Kundenliste hinzugefügt.")
              : tr("Instagram profil e-postasını API vermez; e-posta bio metninden çıkarılır. Web sitesi çoğu profilde bulunur.",
                   "Instagram gibt die Profil-E-Mail nicht über die API zurück — sie wird aus der Bio extrahiert.")
            : effMod === "kendi"
            ? tr("Kanal istatistikleriniz (abone, video, görüntülenme) çekilir; müşteri listesine eklenmez.",
                 "Ihre Kanalstatistiken werden geladen — nicht zur Kundenliste hinzugefügt.")
            : tr("Anahtar kelimeyle kanal keşfedilir; kanal hakkında bölümü ve bağlı web sitesi/Linktree taranarak e-posta bulunur.",
                 "Kanäle werden per Keyword gefunden; About-Seite und verlinkte Website/Linktree werden nach E-Mails durchsucht.")}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          <button className="c-btn-primary" onClick={runSearch} disabled={searching} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: isMobile ? "100%" : undefined }}>
            {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
            {searching
              ? tr("Aranıyor…", "Suche läuft…")
              : effMod === "kendi"
              ? tr("Hesabımı Çek", "Konto laden")
              : tr("Müşteri Ara", "Kunden suchen")}
          </button>
          {searching && (
            <button onClick={stopSearch} title={tr("Aramayı durdur", "Suche stoppen")}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: isMobile ? "100%" : undefined, cursor: "pointer",
                padding: "0 16px", height: 38, borderRadius: 10, fontSize: ".86rem", fontWeight: 600,
                border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626",
              }}>
              <StopCircle size={16} /> {tr("Durdur", "Stoppen")}
            </button>
          )}
          {searchMsg && <span style={{ fontSize: ".85rem", color: searching ? meta.color : "var(--text-2,#475569)" }}>{searchMsg}</span>}
        </div>

        {/* mod=kendi sonucu */}
        {kendiSonuc && kendiSonuc.length > 0 && (
          <KendiHesapKarti kaynak={kaynak} items={kendiSonuc} tr={tr} lang={lang} isMobile={isMobile} />
        )}
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
        {/* Mail/yanıt süzgeci — "kim cevap verdi, kim vermedi" hızlı bakışı */}
        <div style={{ position: "relative" }}>
          <Mail size={14} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
          <select className="c-input" style={{ paddingLeft: 30, height: 36 }} value={filterMail} onChange={(e) => setFilterMail(e.target.value)}
            title={tr("Mail ve yanıt durumuna göre süz", "Nach Mail-/Antwortstatus filtern")}>
            <option value="all">{tr("Tüm mailler", "Alle Mails")}</option>
            <option value="yanit">{tr(`Cevap verenler (${stats.replied})`, `Geantwortet (${stats.replied})`)}</option>
            <option value="bekliyor">{tr(`Cevap bekleyenler (${stats.contacted - stats.replied})`, `Wartet auf Antwort (${stats.contacted - stats.replied})`)}</option>
            <option value="gonderilmedi">{tr(`Mail gitmemiş (${stats.total - stats.contacted})`, `Nicht kontaktiert (${stats.total - stats.contacted})`)}</option>
          </select>
        </div>
        {kaynakSayilari.size > 1 && (
          <div style={{ position: "relative" }}>
            <Filter size={14} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
            <select className="c-input" style={{ paddingLeft: 30, height: 36 }} value={filterKaynak} onChange={(e) => setFilterKaynak(e.target.value)}
              title={tr("Platforma göre süz", "Nach Plattform filtern")}>
              <option value="all">{tr("Tüm platformlar", "Alle Plattformen")}</option>
              {KAYNAKLAR.filter((k) => kaynakSayilari.get(k.id)).map((k) => (
                <option key={k.id} value={k.id}>{k.label} ({kaynakSayilari.get(k.id)})</option>
              ))}
            </select>
          </div>
        )}
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
        <button className="c-btn-ghost" onClick={() => { fetchLeads(); fetchMailStats(); }} title={tr("Yenile", "Aktualisieren")} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6 }}>
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
                          <KaynakChip k={l.kaynak} />
                          {g && <GroupChip g={g} max={200} />}
                          <div style={{ fontWeight: 600, fontSize: ".92rem", lineHeight: 1.25 }}>{l.isim}</div>
                        </div>
                        <div style={{ fontSize: ".75rem", color: "var(--text-3,#64748b)", marginTop: 1 }}>
                          {[l.kullanici_adi ? `@${String(l.kullanici_adi).replace(/^@/, "")}` : l.kategori, l.adres]
                            .filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {l.puan != null ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: ".8rem", fontWeight: 600, flexShrink: 0 }}>
                          <Star size={13} color="#f59e0b" fill="#f59e0b" />{l.puan}
                        </span>
                      ) : l.takipci != null ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: ".8rem", fontWeight: 600, flexShrink: 0, color: "var(--text-3,#64748b)" }}>
                          <Users size={13} />{kisaSayi(l.takipci, lang)}
                        </span>
                      ) : null}
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
                      {mailBadge(l.mail_durumu, tr, mailStats[l.id])}
                      {waBadge(l.whatsapp_durumu)}
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setDetail(l)} className="c-btn-ghost" style={{ padding: 7, height: 32 }} title={tr("Detay", "Details")}><ExternalLink size={14} /></button>
                      <button onClick={() => deleteLead(l)} className="c-btn-ghost" style={{ padding: 7, height: 32, color: "#f43f5e" }} title={tr("Sil", "Löschen")}><Trash2 size={14} /></button>
                    </div>
                    {/* Gelen yanıt — kim cevap verdi, ne yazdı */}
                    {(l.yanit_kategorisi || mailStats[l.id]?.lastIn) && (
                      <div style={{ marginLeft: 26, padding: "7px 10px", borderLeft: "3px solid #10b981", background: "var(--panel-2,#f8fafc)", borderRadius: 8 }}>
                        <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#10b981", marginBottom: 2 }}>
                          ↩ {tr("Gelen yanıt", "Antwort")}{mailStats[l.id]?.lastIn ? ` · ${kisaTarih(mailStats[l.id]!.lastIn!.at)}` : ""}
                        </div>
                        <YanitCell lead={l} st={mailStats[l.id]} tr={tr} onOpen={() => setDetail(l)} compact />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="c-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "34px 1.45fr 1.05fr 124px 78px 104px 1.25fr 72px", gap: 0, padding: "10px 14px", borderBottom: "1px solid var(--line,#e2e8f0)", fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-3,#64748b)", alignItems: "center" }}>
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
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "34px 1.45fr 1.05fr 124px 78px 104px 1.25fr 72px", gap: 0, padding: "11px 14px", borderBottom: "1px solid var(--line,#f1f5f9)", fontSize: ".85rem", alignItems: "center" }}>
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <KaynakChip k={l.kaynak} />
                {g && <GroupChip g={g} />}
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.isim}</div>
              </div>
              <div style={{ fontSize: ".76rem", color: "var(--text-3,#64748b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[l.kullanici_adi ? `@${String(l.kullanici_adi).replace(/^@/, "")}` : l.kategori, l.adres]
                  .filter(Boolean).join(" · ")}
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
            {/* Maps → yıldız puanı, sosyal kaynaklar → takipçi/abone */}
            <div>{l.puan != null ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Star size={12} color="#f59e0b" fill="#f59e0b" />{l.puan}</span>
            ) : l.takipci != null ? (
              <span title={tr("Takipçi / abone", "Follower / Abonnenten")} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--text-2,#475569)" }}>
                <Users size={12} />{kisaSayi(l.takipci, lang)}
              </span>
            ) : <span style={{ color: "#cbd5e1" }}>—</span>}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>{mailBadge(l.mail_durumu, tr, mailStats[l.id])}{waBadge(l.whatsapp_durumu)}</div>
            <YanitCell lead={l} st={mailStats[l.id]} tr={tr} onOpen={() => setDetail(l)} />
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button onClick={() => setDetail(l)} className="c-btn-ghost" style={{ padding: 6, height: 30 }} title={tr("Detay", "Details")}><ExternalLink size={13} /></button>
              <button onClick={() => deleteLead(l)} className="c-btn-ghost" style={{ padding: 6, height: 30, color: "#f43f5e" }} title={tr("Sil", "Löschen")}><Trash2 size={13} /></button>
            </div>
          </div>
          );
        })}
      </div>
      )}

      {mailOpen && <MailModal leads={selectedWithEmail} stats={mailStats} onClose={() => setMailOpen(false)} onSent={() => { setMailOpen(false); setSelected(new Set()); fetchLeads(); fetchMailStats(); }} tr={tr} />}
      {waOpen && <WhatsAppModal leads={selectedWithWhatsapp} onClose={() => setWaOpen(false)} onSent={(ids) => { setWaOpen(false); markWhatsappSent(ids); }} tr={tr} />}
      {detail && <DetailModal lead={detail} onClose={() => setDetail(null)} onSaveNotes={saveNotes} onSetDurum={setDurum} onDelete={deleteLead} onChanged={() => { fetchLeads(); fetchMailStats(); }} tr={tr} />}
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
// ── Kaynak rozeti (lead hangi platformdan geldi) ─────────────────
const KaynakChip: React.FC<{ k?: Kaynak | null }> = ({ k }) => {
  const m = kaynakMeta(k);
  const Ico = m.icon;
  return (
    <span title={m.label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        width: 20, height: 20, borderRadius: 6,
        color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}33`,
      }}>
      <Ico size={12} />
    </span>
  );
};

// ── "Kendi hesabım" sonuç kartı ──────────────────────────────────
// Bu sonuçlar leads tablosuna yazılmaz; yalnızca panelde gösterilir.
const KendiHesapKarti: React.FC<{
  kaynak: Kaynak; items: any[]; tr: (t: string, g: string) => string; lang: string; isMobile: boolean;
}> = ({ kaynak, items, tr, lang, isMobile }) => {
  const m = kaynakMeta(kaynak);
  const it = items[0] || {};
  const ig = kaynak === "instagram";

  const stats = ig
    ? [
        { l: tr("Takipçi", "Follower"), v: kisaSayi(it.followersCount, lang) },
        { l: tr("Takip", "Folgt"), v: kisaSayi(it.followsCount, lang) },
        { l: tr("Gönderi", "Beiträge"), v: kisaSayi(it.postsCount, lang) },
      ]
    : [
        { l: tr("Abone", "Abonnenten"), v: String(it.subscriber_count ?? "—") },
        { l: tr("Video", "Videos"), v: String(it.video_count ?? "—") },
        { l: tr("Görüntülenme", "Aufrufe"), v: String(it.total_views ?? "—") },
      ];

  const baslik = ig ? (it.fullName || it.username) : (it.channel_name || it.channel_handle);
  const alt = ig ? (it.username ? `@${it.username}` : "") : (it.channel_handle || "");
  const bio = ig ? it.biography : it.description;
  const link = ig ? it.url : it.channel_url;
  const posts: any[] = ig && Array.isArray(it.latestPosts) ? it.latestPosts.slice(0, 6) : [];

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line,#e2e8f0)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <KaynakChip k={kaynak} />
            <span style={{ fontWeight: 700, fontSize: ".98rem" }}>{baslik || "—"}</span>
            {it.verified && <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#3b82f6" }}>✓</span>}
          </div>
          {alt && <div style={{ fontSize: ".8rem", color: m.color, fontWeight: 600 }}>{alt}</div>}
          {bio && (
            <p style={{ margin: "6px 0 0", fontSize: ".8rem", color: "var(--text-2,#475569)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
              {String(bio).slice(0, 300)}
            </p>
          )}
        </div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="c-btn-ghost"
            style={{ height: 32, display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".8rem", textDecoration: "none" }}>
            <ExternalLink size={13} /> {tr("Aç", "Öffnen")}
          </a>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: isMobile ? 8 : 12, marginTop: 14 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: `${m.color}0d`, border: `1px solid ${m.color}26` }}>
            <div style={{ fontSize: isMobile ? "1rem" : "1.15rem", fontWeight: 700, color: m.color, lineHeight: 1.15 }}>{s.v}</div>
            <div style={{ fontSize: ".72rem", color: "var(--text-3,#64748b)" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {posts.length > 0 && (
        <>
          <div style={{ margin: "16px 0 8px", fontSize: ".78rem", fontWeight: 700, color: "var(--text-2,#475569)" }}>
            {tr("Son gönderiler", "Letzte Beiträge")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10 }}>
            {posts.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line,#e2e8f0)", textDecoration: "none", color: "inherit", minWidth: 0 }}>
                <div style={{ fontSize: ".76rem", color: "var(--text-2,#475569)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {p.caption || tr("(açıklama yok)", "(keine Bildunterschrift)")}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: ".74rem", color: "var(--text-3,#94a3b8)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Heart size={11} />{kisaSayi(p.likesCount, lang)}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MessageSquareText size={11} />{kisaSayi(p.commentsCount, lang)}</span>
                  {p.videoViewCount ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><PlaySquare size={11} />{kisaSayi(p.videoViewCount, lang)}</span> : null}
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

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
  // WhatsApp ikonu: konu her zaman AI Ekspertiz Platformu, dil varsayılan Deutsch
  // (lead açıkça başka bir ülkedeyse o dile düşer).
  const waDil = guessMsgLang(lead, VARSAYILAN_DIL);
  const waK = varsayilanKampanya();
  const waEk = kampanyaEk(waK, waDil);
  const waHref = `https://wa.me/${intl}?text=${encodeURIComponent(mesajMetni(fillTpl(kampanyaSablon(waK, waDil).body, lead), waEk, waDil))}`;
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
// Kısa tarih (gg.aa.yyyy ss:dd) — rozet tooltip'lerinde kullanılır.
const kisaTarih = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

// Mail rozeti — "kaçıncı mail" gönderildiğini gösterir (1. mail, 2. mail…).
// `st` yoksa (eski kayıtlar) yalın "Gönderildi"ye düşer.
function mailBadge(s: string, tr: (t: string, g: string) => string, st?: MailStat) {
  const n = st?.out || 0;
  if (s === "gonderilmedi" && !n) return <span style={{ color: "#cbd5e1" }}>—</span>;
  const hata = s === "hata";
  const txt = hata ? tr("Hata", "Fehler") : n > 0 ? tr(`${n}. mail`, `${n}. Mail`) : tr("Gönderildi", "Gesendet");
  const c = hata ? "#f43f5e" : "#06b6d4";
  const title = hata
    ? tr("Gönderim hatası", "Sendefehler")
    : [n > 0 ? tr(`${n} mail gönderildi`, `${n} Mails gesendet`) : "", st?.lastOut ? tr(`Son: ${kisaTarih(st.lastOut)}`, `Zuletzt: ${kisaTarih(st.lastOut)}`) : ""].filter(Boolean).join(" · ");
  return <span title={title} style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: c, whiteSpace: "nowrap" }}>{txt}</span>;
}

// Gelen yanıt metnini tek satırlık okunur özete indirger: alıntı satırlarını
// (">" ve "… schrieb/wrote:") ve imza/boşlukları atar.
function replySnippet(body?: string | null, max = 110): string {
  const t = String(body || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((ln) => !/^\s*>/.test(ln) && !/(schrieb|wrote|yazdı)\s*:\s*$/i.test(ln))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

// Yanıt hücresi — kategori rozeti + gelen mesajın ilk satırları.
// Tıklayınca lead detayında tam yazışma açılır.
const YanitCell: React.FC<{
  lead: Lead; st?: MailStat; tr: (t: string, g: string) => string; onOpen: () => void; compact?: boolean;
}> = ({ lead, st, tr, onOpen, compact }) => {
  const cat = lead.yanit_kategorisi || st?.lastIn?.category || null;
  const last = st?.lastIn;
  if (!cat && !last) return <span style={{ color: "#cbd5e1" }}>—</span>;
  const snippet = replySnippet(last?.body) || (last?.subject ? String(last.subject) : "");
  const full = [last?.subject, last?.body].filter(Boolean).join("\n\n");
  return (
    <div onClick={onOpen} title={full ? `${kisaTarih(last?.at)}\n\n${full}` : undefined}
      style={{ minWidth: 0, cursor: "pointer", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {cat && <span style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: YANIT_COLOR[cat] || "#94a3b8", whiteSpace: "nowrap" }}>{yanitLabel(cat, tr)}</span>}
        {(st?.inCount || 0) > 1 && <span title={tr("Gelen mesaj sayısı", "Eingegangene Nachrichten")} style={{ fontSize: ".68rem", fontWeight: 700, color: "#10b981" }}>×{st!.inCount}</span>}
      </div>
      {snippet && (
        <div style={{
          fontSize: ".72rem", lineHeight: 1.35, color: "var(--text-3,#64748b)",
          display: "-webkit-box", WebkitLineClamp: compact ? 3 : 2, WebkitBoxOrient: "vertical",
          overflow: "hidden", wordBreak: "break-word",
        }}>“{snippet}”</div>
      )}
    </div>
  );
};
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
const MailModal: React.FC<{ leads: Lead[]; stats: Record<string, MailStat>; onClose: () => void; onSent: () => void; tr: (t: string, g: string) => string }> = ({ leads, stats, onClose, onSent, tr }) => {
  // Seçilen leadlerde en yaygın dili varsayılan al
  const defLang = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) { const g = guessMsgLang(l, "de"); c[g] = (c[g] || 0) + 1; }
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || "de";
  }, [leads]);

  const [campCode, setCampCode] = useState<string>("");   // zorunlu — boşken gönderilemez
  const [langCode, setLangCode] = useState<string>(defLang);
  const [attachOn, setAttachOn] = useState(true);
  // Daha önce mail atılanlar sunucuda varsayılan olarak atlanır (çift gönderim
  // koruması). Bilinçli takip maili için kullanıcı açıkça işaretler.
  const [resendSent, setResendSent] = useState(false);
  const zatenGonderilen = useMemo(() => leads.filter((l) => l.mail_durumu === "gonderildi").length, [leads]);
  // Bu gönderimde kime kaçıncı mail gidecek? (mevcut gönderim sayısı + 1)
  // "Tekrar gönder" işaretli değilse sunucu daha önce mail gidenleri atlar —
  // dağılıma da sadece gerçekten gidecek olanlar girer.
  const siraDagilimi = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of leads) {
      if (!resendSent && l.mail_durumu === "gonderildi") continue;
      const n = (stats[l.id]?.out || 0) + 1;
      m.set(n, (m.get(n) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [leads, stats, resendSent]);
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
      // İmza (www.fikoai.de) her mailin sonuna eklenir; sunum linki mailde ek
      // olarak gittiği için metne ayrıca yazılmaz.
      const { data, error } = await supabase.functions.invoke("send-lead-emails", {
        body: { lead_ids: leads.map((l) => l.id), subject, body: mesajMetni(body, ek, langCode, false), attachments, resend_to_sent: resendSent },
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

      {/* Kaçıncı mail? — seçilenlerin her birine bu gönderim kaçıncı mail olacak */}
      {leads.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12, padding: "8px 11px", borderRadius: 9, background: "var(--panel-2,#f8fafc)", border: "1px solid var(--line,#e2e8f0)", fontSize: ".78rem", color: "var(--text-2,#475569)" }}>
          <Send size={13} color="#8b5cf6" />
          <span>{tr("Bu gönderim:", "Dieser Versand:")}</span>
          {siraDagilimi.length === 0 && <span style={{ color: "#f43f5e", fontWeight: 600 }}>{tr("kimseye gitmeyecek", "kein Empfänger")}</span>}
          {siraDagilimi.map(([n, c]) => (
            <span key={n} style={{ fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: n === 1 ? "#06b6d4" : "#f59e0b", whiteSpace: "nowrap" }}>
              {tr(`${c} kişiye ${n}. mail`, `${c}× ${n}. Mail`)}
            </span>
          ))}
          {!resendSent && zatenGonderilen > 0 && (
            <span style={{ color: "#94a3b8" }}>· {tr(`${zatenGonderilen} kişi atlanacak (daha önce gönderildi)`, `${zatenGonderilen} übersprungen (bereits gesendet)`)}</span>
          )}
        </div>
      )}

      {/* Konu (kampanya) seçimi — zorunlu */}
      <Field label={tr("Konu / kampanya *", "Thema / Kampagne *")}>
        <CampPicker value={campCode} onPick={pickCamp} tr={tr} />
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

          <ImzaNotu tr={tr} />
        </>
      )}

      {/* Çift gönderim koruması — seçimde daha önce mail atılmış kayıt varsa */}
      {zatenGonderilen > 0 && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, padding: "9px 11px", borderRadius: 9, background: "rgba(245,158,11,.09)", border: "1px solid rgba(245,158,11,.3)", fontSize: ".8rem", color: "var(--text-2,#475569)", cursor: "pointer" }}>
          <input type="checkbox" checked={resendSent} onChange={(e) => setResendSent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            {tr(`Seçilenlerden ${zatenGonderilen} tanesine daha önce mail atılmış — varsayılan olarak atlanacak.`,
                `${zatenGonderilen} der Ausgewählten haben bereits eine Mail erhalten — werden standardmäßig übersprungen.`)}
            <br />
            <strong>{tr("Yine de tekrar gönder (takip maili).", "Trotzdem erneut senden (Follow-up).")}</strong>
          </span>
        </label>
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

  // Toplu WhatsApp da AI Ekspertiz Platformu / Deutsch ile hazır açılır
  const [campCode, setCampCode] = useState<string>(VARSAYILAN_KAMPANYA);
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
    const text = mesajMetni(fillTpl(body, l), ek, langCode, attachOn);
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
        <CampPicker value={campCode} onPick={pickCamp} tr={tr} />
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

          <ImzaNotu tr={tr} />

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

  // Kampanya (konu) + çok dilli taslak mesaj — AI Ekspertiz Platformu / Deutsch
  // hazır seçili gelir, kullanıcı isterse değiştirir.
  const [campCode, setCampCode] = useState<string>(VARSAYILAN_KAMPANYA);
  const [msgCode, setMsgCode] = useState<string>(() => guessMsgLang(lead, VARSAYILAN_DIL));
  const [attachOn, setAttachOn] = useState(true);
  const [subject, setSubject] = useState("");
  const [mbody, setMbody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const camp = kampanyaByCode(campCode);
  const ek = camp ? kampanyaEk(camp, msgCode) : null;
  const waIntl = lead.telefon ? toIntlNumber(lead.telefon) : "";
  // WhatsApp, kopyala ve mailto aynı metni kullanır (sunum linki + imza dahil)
  const gonderimMetni = mesajMetni(mbody, ek, msgCode, attachOn);
  const waHref = camp && waIntl ? `https://wa.me/${waIntl}?text=${encodeURIComponent(gonderimMetni)}` : undefined;

  const pickCamp = (code: string) => {
    setCampCode(code);
    const k = kampanyaByCode(code);
    if (k) { const langs = kampanyaDilleri(k); if (!langs.includes(msgCode)) { const g = guessMsgLang(lead, VARSAYILAN_DIL); setMsgCode(langs.includes(g) ? g : langs[0]); } }
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

  // Geçmişteki giden/gelen sayıları — başlıktaki "kaçıncı mail" rozetleri için
  const gidenSayisi = useMemo(() => history.filter((h) => h.direction !== "inbound").length, [history]);
  const gelenSayisi = history.length - gidenSayisi;
  let sira = 0; // render sırasında giden mailleri numaralar (1. mail, 2. mail…)

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
      // Mailde sunum dosya olarak eklendiği için metne link yazılmaz; imza eklenir.
      const { data, error } = await supabase.functions.invoke("send-lead-emails", {
        body: { lead_ids: [lead.id], subject, body: mesajMetni(mbody, ek, msgCode, false), attachments },
      });
      if (error || !data?.success) { setSendResult(tr("Hata: ", "Fehler: ") + (data?.error || error?.message || "")); }
      else if (data.sent) { setSendResult(tr("✓ Gönderildi.", "✓ Gesendet.")); await loadHistory(); onChanged(); }
      else { setSendResult(tr("Gönderilemedi.", "Nicht gesendet.") + (data.skipped ? tr(" (e-posta yok)", " (keine E-Mail)") : "")); }
    } catch (e: any) { setSendResult(String(e?.message || e)); }
    finally { setSending(false); }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${gonderimMetni}`);
      setSendResult(tr("Panoya kopyalandı.", "In Zwischenablage kopiert."));
    } catch { setSendResult(tr("Kopyalanamadı.", "Kopieren fehlgeschlagen.")); }
  };

  const mailtoHref = email.trim()
    ? `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(gonderimMetni)}`
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
        <div style={{ margin: "10px 0 4px" }}>
          <CampPicker value={campCode} onPick={pickCamp} tr={tr} />
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

            <ImzaNotu tr={tr} />

            <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: 8 }}>
              {camp.hedef === "b2c"
                ? tr("Bu metin son müşteriye gider; marka adı geçmez, imza alanına büro bilgilerinizi yazın.",
                     "Dieser Text geht an den Endkunden; ohne Markenname – tragen Sie im Signaturfeld Ihre Bürodaten ein.")
                : tr("Şirket adı otomatik eklenir. WhatsApp'ta sunum linki eklenir.",
                     "Firmenname wird automatisch eingefügt. Bei WhatsApp wird der Präsentationslink angehängt.")}
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

      {/* Email history — giden mailler "n. mail" olarak numaralanır */}
      <div style={{ marginTop: 16, fontSize: ".8rem", fontWeight: 700, color: "var(--text-2,#475569)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <MessageSquareText size={14} /> {tr("Yazışma geçmişi", "Verlauf")}
        {gidenSayisi > 0 && (
          <span style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: "#06b6d4" }}>
            {tr(`${gidenSayisi} mail gönderildi`, `${gidenSayisi} Mails gesendet`)}
          </span>
        )}
        {gelenSayisi > 0 && (
          <span style={{ fontSize: ".72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: "#10b981" }}>
            {tr(`${gelenSayisi} yanıt`, `${gelenSayisi} Antworten`)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0", maxHeight: 260, overflowY: "auto" }}>
        {history.length === 0 && <div style={{ fontSize: ".8rem", color: "#94a3b8" }}>{tr("Henüz yazışma yok.", "Noch kein Verlauf.")}</div>}
        {history.map((h) => {
          const gelen = h.direction === "inbound";
          if (!gelen) sira++;
          const no = sira;
          return (
          <div key={h.id} style={{ borderLeft: `3px solid ${gelen ? "#10b981" : "#8b5cf6"}`, padding: "6px 10px", background: gelen ? "rgba(16,185,129,.07)" : "var(--panel-2,#f8fafc)", borderRadius: 8 }}>
            <div style={{ fontSize: ".72rem", color: "var(--text-3,#64748b)", display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 600, color: gelen ? "#10b981" : "var(--text-3,#64748b)" }}>
                {gelen ? tr("↩ Gelen yanıt", "↩ Antwort") : tr(`↪ ${no}. mail`, `↪ ${no}. Mail`)}
                {h.reply_category ? ` · ${yanitLabel(h.reply_category, tr)}` : ""}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>{kisaTarih(h.created_at)}</span>
            </div>
            {h.subject && <div style={{ fontSize: ".8rem", fontWeight: 600 }}>{h.subject}</div>}
            {h.body && <div style={{ fontSize: ".78rem", color: "var(--text-2,#475569)", whiteSpace: "pre-wrap", maxHeight: gelen ? 220 : 60, overflow: "auto" }}>{h.body}</div>}
          </div>
          );
        })}
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
