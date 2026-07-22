import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Send, Copy, Check, Loader2, Ban, Clock, CheckCircle2, XCircle,
  Link2, Mail, RefreshCw, Package, UserPlus,
} from "lucide-react";
import { supabase } from "../../services/supabaseService";
import { SUPABASE_URL } from "../../constants";
import { useLang } from "../../LanguageContext";
import { Modul, MODULLER, MODUL_TANIM } from "../../services/moduller";

interface DavetSatiri {
  id: string;
  email: string;
  moduller: Modul[];
  tip: "yeni" | "yukseltme";
  sirket_adi: string | null;
  gecerlilik: string;
  kullanildi_at: string | null;
  iptal_at: string | null;
  created_at: string;
}

interface ModulSatiri {
  id: string;
  user_id: string;
  modul: Modul;
  durum: "aktif" | "pasif";
  bitis: string | null;
}

interface TalepSatiri {
  id: string;
  user_id: string;
  modul: Modul;
  durum: "bekliyor" | "onaylandi" | "reddedildi";
  mesaj: string | null;
  created_at: string;
}

interface KullaniciSatiri {
  user_id: string;
  ad: string;
}

/**
 * Admin → Paketler & Davetler.
 *
 * Dört iş yapar: davet üret, davetleri izle, kullanıcı×modül matrisini yönet,
 * bekleyen talepleri karara bağla. Yazma işlemleri ya admin RLS'i üzerinden
 * (kullanici_modulleri, modul_talepleri) ya da service-role Edge Function
 * üzerinden (davet-olustur) gider.
 */
export const AdminPaketlerTab: React.FC = () => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => (lang === "tr" ? a : b);

  const [davetler, setDavetler] = useState<DavetSatiri[]>([]);
  const [modulSatirlari, setModulSatirlari] = useState<ModulSatiri[]>([]);
  const [talepler, setTalepler] = useState<TalepSatiri[]>([]);
  const [kullanicilar, setKullanicilar] = useState<KullaniciSatiri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Davet formu
  const [email, setEmail] = useState("");
  const [sirketAdi, setSirketAdi] = useState("");
  const [gun, setGun] = useState(7);
  const [secili, setSecili] = useState<Set<Modul>>(new Set(["muhasebe"]));
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [sonucLink, setSonucLink] = useState("");
  const [mesaj, setMesaj] = useState<{ text: string; ok: boolean } | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  const bildir = (text: string, ok = true) => {
    setMesaj({ text, ok });
    setTimeout(() => setMesaj(null), 5000);
  };

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const [dv, km, mt, co] = await Promise.all([
      supabase.from("davetler")
        .select("id,email,moduller,tip,sirket_adi,gecerlilik,kullanildi_at,iptal_at,created_at")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("kullanici_modulleri").select("id,user_id,modul,durum,bitis"),
      supabase.from("modul_talepleri")
        .select("id,user_id,modul,durum,mesaj,created_at")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("companies").select("user_id,company_name").order("company_name"),
    ]);
    setDavetler((dv.data || []) as DavetSatiri[]);
    setModulSatirlari((km.data || []) as ModulSatiri[]);
    setTalepler((mt.data || []) as TalepSatiri[]);
    setKullanicilar(
      (co.data || [])
        .filter((c: any) => c.user_id)
        .map((c: any) => ({ user_id: c.user_id, ad: c.company_name || c.user_id })),
    );
    setYukleniyor(false);
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  const bekleyenTalepler = useMemo(
    () => talepler.filter((t) => t.durum === "bekliyor"),
    [talepler],
  );

  const kullaniciAdi = useCallback(
    (uid: string) => kullanicilar.find((k) => k.user_id === uid)?.ad || uid.slice(0, 8) + "…",
    [kullanicilar],
  );

  // ── Davet oluştur ──────────────────────────────────────────────
  const davetOlustur = async () => {
    setSonucLink("");
    if (!secili.size) { bildir(tr("En az bir modül seçin.", "Mindestens ein Modul wählen."), false); return; }
    setGonderiliyor(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${SUPABASE_URL}/functions/v1/davet-olustur`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          moduller: [...secili],
          sirket_adi: sirketAdi.trim() || null,
          gun,
          tip: "yeni",
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.success) {
        bildir(d?.error || tr("Davet oluşturulamadı.", "Einladung fehlgeschlagen."), false);
      } else {
        setSonucLink(d.link);
        bildir(
          d.mail_gonderildi
            ? tr("Davet maili gönderildi.", "Einladungs-E-Mail gesendet.")
            : tr(`Davet oluşturuldu, mail gönderilemedi (${d.mail_hatasi || "?"}). Linki elle iletin.`,
                 `Einladung erstellt, E-Mail fehlgeschlagen (${d.mail_hatasi || "?"}). Link manuell senden.`),
          d.mail_gonderildi,
        );
        setEmail(""); setSirketAdi("");
        yukle();
      }
    } catch (e: any) {
      bildir(e?.message || tr("Beklenmeyen hata.", "Unerwarteter Fehler."), false);
    } finally {
      setGonderiliyor(false);
    }
  };

  const linkKopyala = async () => {
    try {
      await navigator.clipboard.writeText(sonucLink);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      bildir(tr("Panoya kopyalanamadı.", "Kopieren fehlgeschlagen."), false);
    }
  };

  const davetIptal = async (id: string) => {
    const { error } = await supabase.from("davetler")
      .update({ iptal_at: new Date().toISOString() }).eq("id", id);
    if (error) bildir(error.message, false);
    else { bildir(tr("Davet iptal edildi.", "Einladung storniert."), true); yukle(); }
  };

  // ── Modül aç / kapat ───────────────────────────────────────────
  const modulDegistir = async (userId: string, modul: Modul, ac: boolean) => {
    const mevcut = modulSatirlari.find((s) => s.user_id === userId && s.modul === modul);
    let error;
    if (mevcut) {
      ({ error } = await supabase.from("kullanici_modulleri")
        .update({ durum: ac ? "aktif" : "pasif", updated_at: new Date().toISOString() })
        .eq("id", mevcut.id));
    } else {
      ({ error } = await supabase.from("kullanici_modulleri")
        .insert({ user_id: userId, modul, durum: ac ? "aktif" : "pasif", kaynak: "admin" }));
    }
    if (error) bildir(error.message, false);
    else yukle();
  };

  // ── Talep kararı ───────────────────────────────────────────────
  const talepKarar = async (t: TalepSatiri, onay: boolean, not?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (onay) {
      // Önce yetkiyi aç; talep kaydı bunun izini tutar.
      await modulDegistir(t.user_id, t.modul, true);
    }
    const { error } = await supabase.from("modul_talepleri").update({
      durum: onay ? "onaylandi" : "reddedildi",
      karar_at: new Date().toISOString(),
      karar_veren: session?.user?.id || null,
      karar_notu: not || null,
    }).eq("id", t.id);
    if (error) bildir(error.message, false);
    else { bildir(onay ? tr("Paket açıldı.", "Paket freigeschaltet.") : tr("Talep reddedildi.", "Anfrage abgelehnt."), onay); yukle(); }
  };

  const tarih = (s: string | null) =>
    s ? new Date(s).toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE",
      { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

  const davetDurum = (d: DavetSatiri) => {
    if (d.iptal_at) return { etiket: tr("İptal", "Storniert"), renk: "#64748b", ikon: <Ban size={11} /> };
    if (d.kullanildi_at) return { etiket: tr("Kullanıldı", "Verwendet"), renk: "#10b981", ikon: <CheckCircle2 size={11} /> };
    if (new Date(d.gecerlilik).getTime() < Date.now()) return { etiket: tr("Süresi doldu", "Abgelaufen"), renk: "#f87171", ikon: <XCircle size={11} /> };
    return { etiket: tr("Bekliyor", "Offen"), renk: "#3b82f6", ikon: <Clock size={11} /> };
  };

  const kart: React.CSSProperties = {
    borderRadius: 14, padding: 18, marginBottom: 16,
    border: "1px solid var(--border, #1c1f27)",
    background: "var(--card, rgba(255,255,255,.02))",
  };
  const baslik: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: "var(--text-1)",
    display: "flex", alignItems: "center", gap: 7, marginBottom: 14,
  };

  return (
    <div style={{ padding: 4 }}>
      {mesaj && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 12.5,
          background: mesaj.ok ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)",
          border: `1px solid ${mesaj.ok ? "rgba(16,185,129,.25)" : "rgba(239,68,68,.25)"}`,
          color: mesaj.ok ? "#10b981" : "#f87171",
        }}>{mesaj.text}</div>
      )}

      {/* ═══ 1) Davet oluştur ═══ */}
      <div style={kart}>
        <div style={baslik}><UserPlus size={14} style={{ color: "#06b6d4" }} />
          {tr("Yeni davet oluştur", "Neue Einladung erstellen")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 11 }}>
          <div>
            <label className="c-label">{tr("E-posta", "E-Mail")} *</label>
            <div className="glow-wrap">
              <input type="email" className="c-input" placeholder="name@firma.de"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="c-label">{tr("Şirket adı", "Firmenname")}</label>
            <div className="glow-wrap">
              <input type="text" className="c-input" placeholder="GmbH / UG"
                value={sirketAdi} onChange={(e) => setSirketAdi(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="c-label">{tr("Geçerlilik (gün)", "Gültigkeit (Tage)")}</label>
            <div className="glow-wrap">
              <input type="number" min={1} max={90} className="c-input"
                value={gun} onChange={(e) => setGun(parseInt(e.target.value || "7", 10))} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="c-label">{tr("Açılacak alanlar", "Freizuschaltende Bereiche")} *</label>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 6 }}>
            {MODULLER.map((m) => {
              const t = MODUL_TANIM[m];
              const on = secili.has(m);
              return (
                <button
                  key={m}
                  onClick={() => setSecili((s) => {
                    const n = new Set(s);
                    n.has(m) ? n.delete(m) : n.add(m);
                    return n;
                  })}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "9px 13px", borderRadius: 10, cursor: "pointer",
                    fontSize: 12.5, fontWeight: 700,
                    background: on ? `${t.renk}1a` : "transparent",
                    border: `1px solid ${on ? `${t.renk}55` : "var(--border, #1c1f27)"}`,
                    color: on ? t.renk : "var(--text-3)",
                  }}
                >
                  <span style={{
                    width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: on ? t.renk : "transparent",
                    border: `1px solid ${on ? t.renk : "var(--border-md, #334155)"}`,
                  }}>
                    {on && <Check size={10} strokeWidth={3} color="#fff" />}
                  </span>
                  {t.ad[lang]}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={davetOlustur}
          disabled={gonderiliyor}
          style={{
            marginTop: 16, padding: "11px 22px", borderRadius: 11, border: "none",
            background: gonderiliyor ? "rgba(6,182,212,.4)" : "linear-gradient(135deg,#06b6d4,#0891b2)",
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: gonderiliyor ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          {gonderiliyor
            ? <><Loader2 size={14} className="animate-spin" /> {tr("Gönderiliyor...", "Wird gesendet...")}</>
            : <><Send size={14} /> {tr("Daveti gönder", "Einladung senden")}</>}
        </button>

        {sonucLink && (
          <div style={{
            marginTop: 14, padding: "11px 13px", borderRadius: 10,
            background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.2)",
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <Link2 size={13} style={{ color: "#06b6d4", flexShrink: 0 }} />
            <code style={{
              flex: 1, minWidth: 180, fontSize: 11, color: "var(--text-2)",
              wordBreak: "break-all", fontFamily: "'Space Mono', monospace",
            }}>{sonucLink}</code>
            <button onClick={linkKopyala} style={{
              padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
              background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.3)", color: "#06b6d4",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {kopyalandi ? <><Check size={11} /> {tr("Kopyalandı", "Kopiert")}</> : <><Copy size={11} /> {tr("Kopyala", "Kopieren")}</>}
            </button>
          </div>
        )}
      </div>

      {/* ═══ 2) Bekleyen talepler ═══ */}
      {bekleyenTalepler.length > 0 && (
        <div style={{ ...kart, borderColor: "rgba(245,158,11,.3)", background: "rgba(245,158,11,.04)" }}>
          <div style={baslik}><Clock size={14} style={{ color: "#f59e0b" }} />
            {tr("Bekleyen paket talepleri", "Offene Paketanfragen")}
            <span style={{
              fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 6,
              background: "rgba(245,158,11,.15)", color: "#f59e0b",
            }}>{bekleyenTalepler.length}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {bekleyenTalepler.map((t) => (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap",
                padding: "11px 13px", borderRadius: 10,
                border: "1px solid var(--border, #1c1f27)", background: "var(--panel, rgba(0,0,0,.15))",
              }}>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-1)" }}>
                    {kullaniciAdi(t.user_id)}
                  </div>
                  <div style={{ fontSize: 11, color: MODUL_TANIM[t.modul]?.renk || "var(--text-3)", marginTop: 3 }}>
                    {MODUL_TANIM[t.modul]?.ad[lang] || t.modul} · {tarih(t.created_at)}
                  </div>
                  {t.mesaj && (
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, fontStyle: "italic" }}>"{t.mesaj}"</div>
                  )}
                </div>
                <button onClick={() => talepKarar(t, true)} style={{
                  padding: "7px 14px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: "#10b981", color: "#fff", fontSize: 11.5, fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <Check size={12} /> {tr("Aç", "Freigeben")}
                </button>
                <button onClick={() => talepKarar(t, false)} style={{
                  padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                  background: "transparent", border: "1px solid rgba(239,68,68,.3)", color: "#f87171",
                }}>
                  {tr("Reddet", "Ablehnen")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 3) Kullanıcı × modül matrisi ═══ */}
      <div style={kart}>
        <div style={{ ...baslik, justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Package size={14} style={{ color: "#8b5cf6" }} />
            {tr("Kullanıcı paketleri", "Benutzerpakete")}
          </span>
          <button onClick={yukle} style={{
            padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontSize: 11,
            background: "transparent", border: "1px solid var(--border, #1c1f27)", color: "var(--text-3)",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <RefreshCw size={11} /> {tr("Yenile", "Aktualisieren")}
          </button>
        </div>

        {yukleniyor ? (
          <div style={{ padding: 20, textAlign: "center" }}>
            <Loader2 size={18} className="animate-spin" style={{ color: "#06b6d4" }} />
          </div>
        ) : kullanicilar.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 16 }}>
            {tr("Henüz kayıtlı şirket yok.", "Noch keine Firmen registriert.")}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "7px 9px", color: "var(--text-dim)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }}>
                    {tr("Firma", "Firma")}
                  </th>
                  {MODULLER.map((m) => (
                    <th key={m} style={{ padding: "7px 9px", color: MODUL_TANIM[m].renk, fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" }}>
                      {MODUL_TANIM[m].ad[lang]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kullanicilar.map((k) => (
                  <tr key={k.user_id} style={{ borderTop: "1px solid var(--border, #1c1f27)" }}>
                    <td style={{ padding: "9px", color: "var(--text-2)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {k.ad}
                    </td>
                    {MODULLER.map((m) => {
                      const satir = modulSatirlari.find((s) => s.user_id === k.user_id && s.modul === m);
                      const acikMi = satir?.durum === "aktif"
                        && (!satir.bitis || new Date(satir.bitis).getTime() > Date.now());
                      return (
                        <td key={m} style={{ padding: "9px", textAlign: "center" }}>
                          <button
                            onClick={() => modulDegistir(k.user_id, m, !acikMi)}
                            title={acikMi ? tr("Kapat", "Sperren") : tr("Aç", "Freigeben")}
                            style={{
                              width: 40, height: 22, borderRadius: 11, cursor: "pointer", position: "relative",
                              background: acikMi ? MODUL_TANIM[m].renk : "rgba(148,163,184,.2)",
                              border: "none", transition: "background .18s",
                            }}
                          >
                            <span style={{
                              position: "absolute", top: 3, left: acikMi ? 21 : 3,
                              width: 16, height: 16, borderRadius: "50%", background: "#fff",
                              transition: "left .18s",
                            }} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ 4) Davet listesi ═══ */}
      <div style={kart}>
        <div style={baslik}><Mail size={14} style={{ color: "#f59e0b" }} />
          {tr("Davetler", "Einladungen")}
        </div>

        {davetler.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 16 }}>
            {tr("Henüz davet oluşturulmadı.", "Noch keine Einladungen erstellt.")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {davetler.map((d) => {
              const s = davetDurum(d);
              const acikMi = !d.iptal_at && !d.kullanildi_at && new Date(d.gecerlilik).getTime() > Date.now();
              return (
                <div key={d.id} style={{
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  padding: "10px 12px", borderRadius: 10,
                  border: "1px solid var(--border, #1c1f27)",
                }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12.5, color: "var(--text-1)", fontWeight: 600 }}>{d.email}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                      {(d.moduller || []).map((m) => (
                        <span key={m} style={{
                          fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 5,
                          background: `${MODUL_TANIM[m]?.renk || "#64748b"}1a`,
                          color: MODUL_TANIM[m]?.renk || "#64748b",
                        }}>{MODUL_TANIM[m]?.ad[lang] || m}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ fontSize: 10.5, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                    {tr("Son:", "Bis:")} {tarih(d.gecerlilik)}
                  </div>

                  <span style={{
                    display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                    fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
                    background: `${s.renk}1a`, color: s.renk, border: `1px solid ${s.renk}33`,
                  }}>{s.ikon} {s.etiket}</span>

                  {acikMi && (
                    <button onClick={() => davetIptal(d.id)} title={tr("İptal et", "Stornieren")} style={{
                      padding: "5px 9px", borderRadius: 8, cursor: "pointer",
                      background: "transparent", border: "1px solid rgba(239,68,68,.25)", color: "#f87171",
                      display: "flex", alignItems: "center",
                    }}>
                      <Ban size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPaketlerTab;
