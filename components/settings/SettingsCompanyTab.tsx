import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../services/supabaseService";
import { useLang } from "../../LanguageContext";
import { GlowingEffect } from "../GlowingEffect";
import {
  Building2, BookOpen, ArrowLeftRight, MapPin, Landmark,
  Calendar, Percent, Loader2,
} from "lucide-react";

interface CompanySettings {
  company_name: string; representative: string; tax_number: string; ust_id: string; finanzamt: string;
  steuernummer: string; address: string; city: string; plz: string;
  phone: string; email: string; iban: string; geschaeftsjahr_start: string;
}
interface AccountingSettings {
  skr_type: "SKR03" | "SKR04"; default_vat: "19" | "7" | "0";
  currency: string; kleinunternehmer: boolean; ist_versteuerung: boolean;
}

const LS_KEY = "fibu_de_settings";
const lsGet = () => { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
const lsMerge = (patch: any) => { try { const e = lsGet() || {}; localStorage.setItem(LS_KEY, JSON.stringify({ ...e, ...patch })); } catch { } };

const DEF_COMPANY: CompanySettings = {
  company_name: "", representative: "", tax_number: "", ust_id: "", finanzamt: "",
  steuernummer: "", address: "", city: "", plz: "", phone: "",
  email: "", iban: "", geschaeftsjahr_start: "01",
};
const DEF_ACCOUNTING: AccountingSettings = {
  skr_type: "SKR03", default_vat: "19", currency: "EUR",
  kleinunternehmer: false, ist_versteuerung: false,
};

interface Props {
  userId: string | undefined;
  flash: (text: string, ok?: boolean) => void;
  activeTab: "company" | "accounting";
}

export const SettingsCompanyTab: React.FC<Props> = ({ userId, flash, activeTab }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanySettings>(DEF_COMPANY);
  const [accounting, setAccounting] = useState<AccountingSettings>(DEF_ACCOUNTING);

  const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const MONTHS = lang === "tr" ? MONTHS_TR : MONTHS_DE;

  const loadSettings = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_settings").select("company,accounting")
        .eq("user_id", userId).maybeSingle();
      if (!error && data) {
        if (data.company && Object.keys(data.company).length > 0) setCompany({ ...DEF_COMPANY, ...data.company });
        if (data.accounting && Object.keys(data.accounting).length > 0) setAccounting({ ...DEF_ACCOUNTING, ...data.accounting });
        lsMerge({ company: data.company, accounting: data.accounting });
      } else {
        const local = lsGet();
        if (local?.company) setCompany({ ...DEF_COMPANY, ...local.company });
        if (local?.accounting) setAccounting({ ...DEF_ACCOUNTING, ...local.accounting });
      }
    } catch {
      const local = lsGet();
      if (local?.company) setCompany({ ...DEF_COMPANY, ...local.company });
      if (local?.accounting) setAccounting({ ...DEF_ACCOUNTING, ...local.accounting });
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Realtime: user_settings değişimlerinde (başka cihaz vs.) anında yansıt
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`user-settings-co-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${userId}` },
        () => { loadSettings(); }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [userId, loadSettings]);

  const upsertSettings = async () => {
    if (!userId) throw new Error("Oturum bulunamadı");
    const { error } = await supabase.from("user_settings")
      .upsert({ user_id: userId, company, accounting }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    lsMerge({ company, accounting });
    if (company.company_name) {
      const { data: ex } = await supabase.from("companies").select("id").eq("user_id", userId).limit(1).maybeSingle();
      if (ex) {
        await supabase.from("companies").update({
          company_name: company.company_name,
          tax_number: company.tax_number || company.steuernummer,
          address: company.address, city: company.city, phone: company.phone, email: company.email,
        }).eq("id", ex.id);
      }
    }
  };

  const saveCompany = async () => { setSaving(true); try { await upsertSettings(); flash(tr("✓ Şirket bilgileri kaydedildi", "✓ Firmendaten gespeichert")); } catch (e: any) { flash(e.message, false); } finally { setSaving(false); } };
  const saveAccounting = async () => { setSaving(true); try { await upsertSettings(); flash(tr("✓ Muhasebe ayarları kaydedildi", "✓ Buchh. Einstellungen gespeichert")); } catch (e: any) { flash(e.message, false); } finally { setSaving(false); } };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center" style={{ background: "#111318" }}>
      <div className="text-center">
        <Loader2 size={28} className="animate-spin mx-auto mb-3 text-cyan-500" />
        <p className="text-xs" style={{ color: "#3a3f4a" }}>{tr("Yükleniyor...", "Laden...")}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* ── ŞİRKET ── */}
      {activeTab === "company" && (
        <div className="max-w-2xl space-y-4 fade-up">
          <div className="c-card p-5 relative">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
            <div className="relative z-10">
              <div className="c-section-title flex items-center gap-1"><Building2 size={12} /> {tr("Temel Bilgiler", "Grunddaten")}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="c-label">{tr("Şirket Adı *", "Firmenname *")}</label>
                  <input className="c-input" placeholder="GmbH / UG / e.K." value={company.company_name} onChange={e => setCompany({ ...company, company_name: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="c-label">{tr("Şirket Yetkilisi", "Geschäftsführer / Inhaber")}</label>
                  <input className="c-input" placeholder={tr("Ad Soyad", "Vor- und Nachname")} value={company.representative} onChange={e => setCompany({ ...company, representative: e.target.value })} />
                </div>
                <div>
                  <label className="c-label">Steuernummer</label>
                  <input className="c-input" placeholder="12/345/67890" value={company.steuernummer} onChange={e => setCompany({ ...company, steuernummer: e.target.value })} />
                </div>
                <div>
                  <label className="c-label">USt-IdNr</label>
                  <input className="c-input" placeholder="DE123456789" value={company.ust_id} onChange={e => setCompany({ ...company, ust_id: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="c-label">Finanzamt</label>
                  <input className="c-input" placeholder="Finanzamt Berlin Mitte" value={company.finanzamt} onChange={e => setCompany({ ...company, finanzamt: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="c-card p-5 relative">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
            <div className="relative z-10">
              <div className="c-section-title flex items-center gap-1"><MapPin size={12} /> {tr("Adres ve İletişim", "Adresse & Kontakt")}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="c-label">{tr("Adres", "Adresse")}</label>
                  <input className="c-input" placeholder="Musterstraße 1" value={company.address} onChange={e => setCompany({ ...company, address: e.target.value })} />
                </div>
                <div>
                  <label className="c-label">PLZ</label>
                  <input className="c-input" placeholder="10115" value={company.plz} onChange={e => setCompany({ ...company, plz: e.target.value })} />
                </div>
                <div>
                  <label className="c-label">{tr("Şehir", "Stadt")}</label>
                  <input className="c-input" placeholder="Berlin" value={company.city} onChange={e => setCompany({ ...company, city: e.target.value })} />
                </div>
                <div>
                  <label className="c-label">{tr("Telefon", "Telefon")}</label>
                  <input className="c-input" placeholder="+49 30 12345678" value={company.phone} onChange={e => setCompany({ ...company, phone: e.target.value })} />
                </div>
                <div>
                  <label className="c-label">E-Mail</label>
                  <input className="c-input" type="email" placeholder="info@firma.de" value={company.email} onChange={e => setCompany({ ...company, email: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="c-card p-5 relative">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
            <div className="relative z-10">
              <div className="c-section-title flex items-center gap-1"><Landmark size={12} /> {tr("Banka", "Bank")}</div>
              <label className="c-label">IBAN</label>
              <input className="c-input font-mono" placeholder="DE89 3704 0044 0532 0130 00" value={company.iban} onChange={e => setCompany({ ...company, iban: e.target.value })} />
            </div>
          </div>

          <button onClick={saveCompany} disabled={saving} className="c-btn-primary w-full py-3 text-sm rounded-md">
            {saving ? tr("Kaydediliyor...", "Speichern...") : tr("Değişiklikleri Kaydet →", "Änderungen speichern →")}
          </button>
        </div>
      )}

      {/* ── MUHASEBE ── */}
      {activeTab === "accounting" && (
        <div className="max-w-2xl space-y-4 fade-up">
          <div className="c-card p-5 relative">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
            <div className="relative z-10">
              <div className="c-section-title flex items-center gap-1"><BookOpen size={12} /> {tr("Kontenplan", "Kontenplan")}</div>
              <div className="grid grid-cols-2 gap-3">
                {(["SKR03", "SKR04"] as const).map(skr => (
                  <button key={skr} onClick={() => setAccounting({ ...accounting, skr_type: skr })}
                    className="p-4 rounded-md text-left cursor-pointer w-full border transition-all"
                    style={accounting.skr_type === skr
                      ? { background: "rgba(6,182,212,.08)", borderColor: "rgba(6,182,212,.3)" }
                      : { background: "rgba(255,255,255,.02)", borderColor: "#1c1f27" }}>
                    <div className="font-syne font-bold text-base mb-1"
                      style={{ color: accounting.skr_type === skr ? "#06b6d4" : "#64748b" }}>{skr}</div>
                    <div className="text-xs" style={{ color: "#3a3f4a" }}>
                      {skr === "SKR03" ? tr("Küçük/orta işletmeler", "Kleine/mittlere Betriebe") : tr("Büyük işletmeler", "Großbetriebe")}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="c-card p-5 relative">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
            <div className="relative z-10">
              <div className="c-section-title flex items-center gap-1"><Percent size={12} /> {tr("Varsayılan KDV", "Standard USt-Satz")}</div>
              <div className="flex gap-2">
                {(["19", "7", "0"] as const).map(r => (
                  <button key={r} onClick={() => setAccounting({ ...accounting, default_vat: r })}
                    className="flex-1 py-2.5 rounded-md border text-sm font-bold font-syne cursor-pointer transition-all"
                    style={accounting.default_vat === r
                      ? { background: "#06b6d4", borderColor: "#06b6d4", color: "#fff" }
                      : { background: "transparent", borderColor: "#1c1f27", color: "#3a3f4a" }}>
                    %{r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="c-card p-5 relative">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
            <div className="relative z-10">
              <div className="c-section-title flex items-center gap-1"><ArrowLeftRight size={12} /> {tr("Vergi Yöntemi", "Steuerverfahren")}</div>
              <div className="space-y-3">
                {[
                  { key: "kleinunternehmer" as const, label: "Kleinunternehmer (§ 19 UStG)", desc: tr("KDV'den muaf küçük işletme", "Steuerbefreite Kleinunternehmen") },
                  { key: "ist_versteuerung" as const, label: "Ist-Versteuerung", desc: tr("Tahsilat bazlı KDV", "Besteuerung nach vereinnahmten Entgelten") },
                ].map(opt => (
                  <div key={opt.key} className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid #1c1f27" }}>
                    <div>
                      <div className="text-sm text-slate-300 font-medium">{opt.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#3a3f4a" }}>{opt.desc}</div>
                    </div>
                    <label className="c-toggle ml-4" onClick={() => setAccounting({ ...accounting, [opt.key]: !accounting[opt.key] })}>
                      <input type="checkbox" readOnly checked={accounting[opt.key]} />
                      <span className="c-toggle-track" />
                      <span className="c-toggle-thumb" style={{ left: accounting[opt.key] ? "19px" : "3px", background: accounting[opt.key] ? "#fff" : "#3a3f4a" }} />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="c-card p-5 relative">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
            <div className="relative z-10">
              <div className="c-section-title flex items-center gap-1"><Calendar size={12} /> {tr("Hesap Yılı Başlangıcı", "Geschäftsjahresbeginn")}</div>
              <select className="c-input" value={company.geschaeftsjahr_start}
                onChange={e => setCompany({ ...company, geschaeftsjahr_start: e.target.value })}
                style={{ appearance: "none" }}>
                {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m, i) => (
                  <option key={m} value={m}>{MONTHS[i]}</option>
                ))}
              </select>
            </div>
          </div>

          <button onClick={saveAccounting} disabled={saving} className="c-btn-primary w-full py-3 text-sm rounded-md">
            {saving ? tr("Kaydediliyor...", "Speichern...") : tr("Kaydet →", "Speichern →")}
          </button>
        </div>
      )}
    </>
  );
};
