import React, { useState, useMemo, useEffect } from "react";
import { useLang } from "../LanguageContext";
function loadCompanyFromSettings(): { name: string; vat: string; address: string } {
  try {
    // Per-user key first; user id may be unknown synchronously, so try generic + scan
    const candidates: string[] = ["fibu_de_settings"];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("fibu_de_settings_")) candidates.unshift(k);
    }
    for (const key of candidates) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const c = parsed?.company;
      if (!c) continue;
      const addrParts = [c.address, [c.plz, c.city].filter(Boolean).join(" "), c.phone ? "Tel: " + c.phone : ""].filter(Boolean);
      return {
        name: c.company_name || "",
        vat: c.ust_id || c.steuernummer || c.tax_number || "",
        address: addrParts.join(", "),
      };
    }
  } catch {}
  return { name: "", vat: "", address: "" };
}
import { X, Plus, Trash2, Loader2, FileText, Building2, Package, Calendar } from "lucide-react";

interface Item {
  urun_adi: string;
  miktar: number;
  kdv_orani: number;
  net: number;
  gross: number;
  hesap_kodu?: string;
  hesap_adi?: string;
}

export interface ManualInvoiceInitial {
  fatura_no?: string;
  tarih?: string;
  donem_baslangic?: string;
  donem_bitis?: string;
  satici_adi?: string;
  satici_vkn?: string;
  satici_adres?: string;
  alici_adi?: string;
  alici_vkn?: string;
  alici_adres?: string;
  items?: Item[];
  notlar?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
  initialData?: ManualInvoiceInitial | null;
}

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

const today = () => new Date().toISOString().substring(0, 10);

const emptyItem = (): Item => ({ urun_adi: "", miktar: 1, kdv_orani: 19, net: 0, gross: 0 });

export const ManualInvoiceModal: React.FC<Props> = ({ open, onClose, onSave, initialData }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const [saving, setSaving] = useState(false);
  const [fatura_no, setFaturaNo] = useState("");
  const [tarih, setTarih] = useState(today());
  const [donem_baslangic, setDonemBaslangic] = useState("");
  const [donem_bitis, setDonemBitis] = useState("");
  const [satici_adi, setSaticiAdi] = useState("");
  const [satici_vkn, setSaticiVkn] = useState("");
  const [satici_adres, setSaticiAdres] = useState("");
  const [alici_adi, setAliciAdi] = useState("");
  const [alici_vkn, setAliciVkn] = useState("");
  const [alici_adres, setAliciAdres] = useState("");
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [notlar, setNotlar] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const ara = items.reduce((s, it) => s + (Number(it.net) || 0), 0);
    const gross = items.reduce((s, it) => s + (Number(it.gross) || 0), 0);
    return { ara, kdv: +(gross - ara).toFixed(2), gross };
  }, [items]);

  // initialData değiştiğinde (modal her açılışta) form alanlarını yeniden doldur
  useEffect(() => {
    if (!open) return;
    setFaturaNo(initialData?.fatura_no || "");
    setTarih(initialData?.tarih || today());
    setDonemBaslangic(initialData?.donem_baslangic || "");
    setDonemBitis(initialData?.donem_bitis || "");
    // Satıcı bilgisi her zaman Ayarlar > Şirket Bilgileri'nden gelir
    const ownCompany = loadCompanyFromSettings();
    setSaticiAdi(ownCompany.name || initialData?.satici_adi || "");
    setSaticiVkn(ownCompany.vat || initialData?.satici_vkn || "");
    setSaticiAdres(ownCompany.address || initialData?.satici_adres || "");
    setAliciAdi(initialData?.alici_adi || "");
    setAliciVkn(initialData?.alici_vkn || "");
    setAliciAdres(initialData?.alici_adres || "");
    setItems(initialData?.items && initialData.items.length > 0 ? initialData.items.map(it => ({ ...it })) : [emptyItem()]);
    setNotlar(initialData?.notlar || "");
    setError(null);
  }, [open, initialData]);

  if (!open) return null;

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        // auto-calc gross if net or rate changed and gross not directly edited
        if (patch.net !== undefined || patch.kdv_orani !== undefined) {
          const net = Number(merged.net) || 0;
          const rate = Number(merged.kdv_orani) || 0;
          merged.gross = +(net * (1 + rate / 100)).toFixed(2);
        }
        return merged;
      })
    );
  };

  const addItem = () => setItems((p) => [...p, emptyItem()]);
  const removeItem = (idx: number) => setItems((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p));

  const reset = () => {
    setFaturaNo(""); setTarih(today()); setDonemBaslangic(""); setDonemBitis("");
    setSaticiAdi(""); setSaticiVkn(""); setSaticiAdres("");
    setAliciAdi(""); setAliciVkn(""); setAliciAdres("");
    setItems([emptyItem()]); setNotlar(""); setError(null);
  };

  const handleSave = async () => {
    setError(null);
    if (!fatura_no.trim()) return setError(tr("Fatura numarası gerekli", "Rechnungsnummer erforderlich"));
    if (!tarih) return setError(tr("Fatura tarihi gerekli", "Rechnungsdatum erforderlich"));
    if (!satici_adi.trim()) return setError(tr("Satıcı adı gerekli", "Verkäufername erforderlich"));
    if (!alici_adi.trim()) return setError(tr("Alıcı adı gerekli", "Käufername erforderlich"));
    const validItems = items.filter((it) => it.urun_adi.trim());
    if (validItems.length === 0) return setError(tr("En az bir kalem girin", "Mindestens eine Position eingeben"));
    if (donem_baslangic && donem_bitis && donem_baslangic > donem_bitis) {
      return setError(tr("Başlangıç tarihi bitiş tarihinden sonra olamaz", "Startdatum nach Enddatum"));
    }

    setSaving(true);
    try {
      await onSave({
        fatura_no, tarih,
        donem_baslangic: donem_baslangic || undefined,
        donem_bitis: donem_bitis || undefined,
        satici_adi, satici_vkn, satici_adres,
        alici_adi, alici_vkn, alici_adres,
        items: validItems,
        notlar: notlar || undefined,
      });
      reset();
      onClose();
    } catch (e: any) {
      setError(e?.message || tr("Kayıt başarısız", "Speichern fehlgeschlagen"));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: "8px",
    background: "rgba(255,255,255,.06)", border: "1.5px solid rgba(148,163,184,.35)",
    color: "#f1f5f9", fontSize: "12px", outline: "none",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,.25)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "10px", fontWeight: 700, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px", display: "block",
  };
  const sectionStyle: React.CSSProperties = {
    padding: "16px", borderRadius: "12px",
    background: "rgba(255,255,255,.035)",
    border: "1.5px solid rgba(148,163,184,.22)",
    boxShadow: "0 2px 10px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.04)",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "860px", maxHeight: "92vh",
          background: "#111318", borderRadius: "14px",
          border: "1px solid rgba(255,255,255,.08)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "9px",
              background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FileText size={16} style={{ color: "#06b6d4" }} />
            </div>
            <div>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#f1f5f9", margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
                {tr("Manuel Fatura Ekle", "Rechnung manuell hinzufügen")}
              </h3>
              <p style={{ fontSize: "10px", color: "var(--text-dim)", margin: "2px 0 0" }}>
                {tr("Tüm bilgileri elle girin", "Alle Felder manuell ausfüllen")}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "var(--text-dim)",
            cursor: "pointer", padding: "6px", borderRadius: "6px",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Fatura bilgileri */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <Calendar size={12} style={{ color: "#06b6d4" }} />
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", textTransform: "uppercase", letterSpacing: ".06em" }}>
                {tr("Fatura Bilgileri", "Rechnungsdaten")}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={labelStyle}>{tr("Fatura No", "Rechnungs-Nr.")} *</label>
                <input value={fatura_no} onChange={(e) => setFaturaNo(e.target.value)} style={inputStyle} placeholder="RE-2026-001" />
              </div>
              <div>
                <label style={labelStyle}>{tr("Fatura Tarihi", "Rechnungsdatum")} *</label>
                <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{tr("Dönem Başlangıcı", "Zeitraum von")}</label>
                <input type="date" value={donem_baslangic} onChange={(e) => setDonemBaslangic(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{tr("Dönem Bitişi", "Zeitraum bis")}</label>
                <input type="date" value={donem_bitis} onChange={(e) => setDonemBitis(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Satıcı / Alıcı */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div style={sectionStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <Building2 size={12} style={{ color: "#06b6d4" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {tr("Satıcı (Ayarlar > Şirket)", "Verkäufer (Einstellungen)")}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>
                  <label style={labelStyle}>{tr("Ad", "Name")} *</label>
                  <input value={satici_adi} readOnly style={{ ...inputStyle, opacity: .75, cursor: "not-allowed" }} />
                </div>
                <div>
                  <label style={labelStyle}>VKN / USt-ID</label>
                  <input value={satici_vkn} readOnly style={{ ...inputStyle, opacity: .75, cursor: "not-allowed" }} />
                </div>
                <div>
                  <label style={labelStyle}>{tr("Adres", "Adresse")}</label>
                  <input value={satici_adres} readOnly style={{ ...inputStyle, opacity: .75, cursor: "not-allowed" }} />
                </div>
                {!satici_adi && (
                  <div style={{ fontSize: "10px", color: "#f59e0b" }}>
                    {tr("Lütfen önce Ayarlar > Şirket Bilgileri'ni doldurun.", "Bitte zuerst Einstellungen > Firmendaten ausfüllen.")}
                  </div>
                )}
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <Building2 size={12} style={{ color: "#8b5cf6" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {tr("Alıcı", "Käufer")}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>
                  <label style={labelStyle}>{tr("Ad", "Name")} *</label>
                  <input value={alici_adi} onChange={(e) => setAliciAdi(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>VKN / USt-ID</label>
                  <input value={alici_vkn} onChange={(e) => setAliciVkn(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{tr("Adres", "Adresse")}</label>
                  <input value={alici_adres} onChange={(e) => setAliciAdres(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>
          </div>

          {/* Kalemler */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Package size={12} style={{ color: "#06b6d4" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#06b6d4", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {tr("Kalemler", "Positionen")}
                </span>
              </div>
              <button onClick={addItem} type="button" style={{
                display: "flex", alignItems: "center", gap: "4px",
                padding: "5px 10px", borderRadius: "7px",
                background: "rgba(6,182,212,.1)", border: "1px solid rgba(6,182,212,.25)",
                color: "#06b6d4", fontSize: "10px", fontWeight: 600, cursor: "pointer",
              }}>
                <Plus size={11} /> {tr("Kalem Ekle", "Position hinzufügen")}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {items.map((it, idx) => (
                <div key={idx} style={{
                  padding: "12px", borderRadius: "10px",
                  background: "rgba(255,255,255,.045)",
                  border: "1.5px solid rgba(148,163,184,.25)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.03)",
                  display: "grid", gridTemplateColumns: "2fr 0.7fr 0.7fr 1fr 1fr 1fr auto", gap: "6px", alignItems: "end",
                }}>
                  <div>
                    <label style={labelStyle}>{tr("Ürün/Hizmet", "Artikel")}</label>
                    <input value={it.urun_adi} onChange={(e) => updateItem(idx, { urun_adi: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{tr("Miktar", "Menge")}</label>
                    <input type="number" step="0.01" value={it.miktar} onChange={(e) => updateItem(idx, { miktar: Number(e.target.value) })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>KDV %</label>
                    <input type="number" step="0.01" value={it.kdv_orani} onChange={(e) => updateItem(idx, { kdv_orani: Number(e.target.value) })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Netto €</label>
                    <input type="number" step="0.01" value={it.net} onChange={(e) => updateItem(idx, { net: Number(e.target.value) })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Brutto €</label>
                    <input type="number" step="0.01" value={it.gross} onChange={(e) => updateItem(idx, { gross: Number(e.target.value) })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{tr("Hesap", "Konto")}</label>
                    <input value={it.hesap_kodu || ""} onChange={(e) => updateItem(idx, { hesap_kodu: e.target.value })} style={inputStyle} placeholder="4960" />
                  </div>
                  <button onClick={() => removeItem(idx)} type="button" disabled={items.length === 1} style={{
                    width: "30px", height: "30px", borderRadius: "7px",
                    background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)",
                    color: "#ef4444", cursor: items.length === 1 ? "not-allowed" : "pointer",
                    opacity: items.length === 1 ? 0.4 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div style={{
            display: "flex", gap: "20px", padding: "14px 16px", borderRadius: "12px",
            background: "rgba(6,182,212,.07)",
            border: "1.5px solid rgba(6,182,212,.35)",
            boxShadow: "0 2px 12px rgba(6,182,212,.08)",
            flexWrap: "wrap",
          }}>
            <div>
              <div style={labelStyle}>{tr("Ara Toplam", "Zwischensumme")}</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>{fmtEur(totals.ara)}</div>
            </div>
            <div>
              <div style={labelStyle}>KDV</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#f59e0b", fontFamily: "'Space Grotesk', sans-serif" }}>{fmtEur(totals.kdv)}</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <div style={labelStyle}>{tr("Genel Toplam", "Gesamt")}</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#06b6d4", fontFamily: "'Space Grotesk', sans-serif" }}>{fmtEur(totals.gross)}</div>
            </div>
          </div>

          {/* Notlar */}
          <div>
            <label style={labelStyle}>{tr("Notlar", "Notizen")}</label>
            <textarea value={notlar} onChange={(e) => setNotlar(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          {error && (
            <div style={{
              padding: "10px 12px", borderRadius: "8px",
              background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)",
              color: "#ef4444", fontSize: "12px",
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.06)",
          display: "flex", justifyContent: "flex-end", gap: "8px",
        }}>
          <button onClick={onClose} type="button" disabled={saving} style={{
            padding: "9px 16px", borderRadius: "9px",
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
            color: "#e2e8f0", fontSize: "12px", fontWeight: 600, cursor: "pointer",
          }}>
            {tr("İptal", "Abbrechen")}
          </button>
          <button onClick={handleSave} type="button" disabled={saving} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "9px 18px", borderRadius: "9px",
            background: saving ? "rgba(6,182,212,.2)" : "linear-gradient(135deg, #06b6d4, #0891b2)",
            border: "none", color: "#fff", fontSize: "12px", fontWeight: 700,
            cursor: saving ? "wait" : "pointer",
            boxShadow: saving ? "none" : "0 4px 16px rgba(6,182,212,.3)",
          }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {tr("Faturayı Kaydet", "Rechnung speichern")}
          </button>
        </div>
      </div>
    </div>
  );
};
