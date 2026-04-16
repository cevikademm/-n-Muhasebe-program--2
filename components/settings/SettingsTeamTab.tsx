import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../services/supabaseService";
import { UserPlus, Trash2, Mail, CheckCircle2, Clock, Ban, Loader2, Info, Copy, Check } from "lucide-react";

interface Props {
  userId: string | undefined;
  flash: (text: string, ok?: boolean) => void;
}

interface TeamMember {
  id: string;
  invited_email: string;
  member_user_id: string | null;
  status: "pending" | "active" | "revoked";
  created_at: string;
  activated_at: string | null;
  revoked_at: string | null;
}

export const SettingsTeamTab: React.FC<Props> = ({ userId, flash }) => {
  const [rows, setRows] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const registerUrl = `${window.location.origin}/?invite=1`;

  const copyInvite = async (row: TeamMember) => {
    const msg =
      `Fikoai'de şirket ekibime seni davet ettim.\n\n` +
      `1) Şu adrese git: ${registerUrl}\n` +
      `2) "Kayıt Ol" ile şu e-posta ile kayıt ol: ${row.invited_email}\n` +
      `3) Kendi şifreni oluştur ve giriş yap — sistem seni otomatik olarak ekibime bağlayacak.`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
      flash("Davet metni panoya kopyalandı. Davet edilen kişiye gönderebilirsiniz.", true);
    } catch {
      flash("Panoya kopyalanamadı.", false);
    }
  };

  const fetchRows = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false });
      if (error) {
        const missing = /relation .* does not exist|schema cache|404/i.test(error.message || "");
        setLoadError(
          missing
            ? "Alt Kullanıcılar tablosu henüz kurulmamış. Supabase SQL Editor'de 20260416_team_members.sql migration'ını çalıştırın."
            : "Ekip listesi yüklenemedi: " + error.message
        );
        setRows([]);
      } else {
        setRows((data || []) as TeamMember[]);
      }
    } catch (e: any) {
      setLoadError("Beklenmeyen hata: " + (e?.message || String(e)));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleAdd = async () => {
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      flash("Geçerli bir e-posta girin.", false);
      return;
    }
    if (!userId) return;
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: { email: clean, redirectTo: window.location.origin },
      });
      if (error) {
        // Edge function deploy edilmemişse fallback: sadece tabloya satır ekle
        let fallbackMsg = "";
        try {
          const res = await supabase.from("team_members").insert({
            owner_user_id: userId, invited_email: clean, role: "staff", status: "pending",
          });
          if (res.error) {
            if (res.error.code === "23505") { flash("Bu e-posta zaten davet edilmiş.", false); return; }
            throw res.error;
          }
          fallbackMsg = "Edge function erişilemedi; davet kaydı manuel oluşturuldu. Mail gitmedi — 'Kopyala' ile davet metnini gönderebilirsiniz.";
        } catch (e: any) {
          flash("Davet gönderilemedi: " + (error.message || e?.message || ""), false);
          return;
        }
        setEmail("");
        flash(fallbackMsg, false);
        fetchRows();
        return;
      }
      if (data && data.success === false) {
        flash(data.error || "Davet gönderilemedi.", false);
        return;
      }
      setEmail("");
      flash(data?.message || "Davet maili gönderildi.", true);
      fetchRows();
    } finally {
      setAdding(false);
    }
  };

  const handleRevoke = async (row: TeamMember) => {
    if (!confirm(`${row.invited_email} adlı kullanıcının erişimi iptal edilsin mi?`)) return;
    const { error } = await supabase
      .from("team_members")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      flash("İptal edilemedi: " + error.message, false);
      return;
    }
    flash("Erişim iptal edildi.", true);
    fetchRows();
  };

  const handleDelete = async (row: TeamMember) => {
    if (!confirm(`${row.invited_email} kaydını tamamen silmek istediğinize emin misiniz?`)) return;
    const { error } = await supabase.from("team_members").delete().eq("id", row.id);
    if (error) { flash("Silinemedi: " + error.message, false); return; }
    flash("Silindi.", true);
    fetchRows();
  };

  const badge = (s: TeamMember["status"]) => {
    if (s === "active") return { bg: "rgba(16,185,129,.1)", color: "#10b981", text: "Aktif", Icon: CheckCircle2 };
    if (s === "pending") return { bg: "rgba(234,179,8,.1)", color: "#eab308", text: "Bekliyor", Icon: Clock };
    return { bg: "rgba(239,68,68,.1)", color: "#ef4444", text: "İptal", Icon: Ban };
  };

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Alt Kullanıcılar</h2>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
          Şirketinize personel davet edin. Davet edilen e-posta kendi şifresini oluşturup giriş yapar ve
          yalnızca Fatura Merkezi alanını görür. Sizin şirket verileriniz üzerinde fatura girebilir.
        </p>
      </div>

      <div style={{
        display: "flex", gap: 10, marginBottom: 14, padding: "12px 14px", borderRadius: 10,
        background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.25)",
        alignItems: "flex-start",
      }}>
        <Info size={16} style={{ color: "#60a5fa", flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
          <strong style={{ color: "#e2e8f0" }}>Nasıl çalışır?</strong> E-posta eklediğinizde sistem
          Supabase Auth üzerinden otomatik <strong>davet maili</strong> gönderir. Davet edilen
          kişi maildeki linke tıklayıp şifresini belirler; giriş yapınca sistem onu otomatik olarak
          ekibinize bağlar ve durum <strong>Aktif</strong>'e döner. Mail gitmezse (spam / SMTP
          kapalı) aşağıdaki <em>Kopyala</em> butonu ile hazır davet metnini alıp WhatsApp/mail ile
          manuel iletebilirsiniz.
        </div>
      </div>

      <div style={{
        display: "flex", gap: 8, marginBottom: 20, padding: 12, borderRadius: 10,
        background: "#0d0f15", border: "1px solid #1c1f27",
      }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Mail size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="ornek@sirket.com"
            style={{
              width: "100%", padding: "9px 10px 9px 32px", borderRadius: 8,
              background: "#111318", border: "1px solid #1c1f27", color: "#e2e8f0", fontSize: 13, outline: "none",
            }}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 8, border: "none",
            background: "linear-gradient(135deg,#06b6d4,#0891b2)", color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: adding ? "not-allowed" : "pointer", opacity: adding ? 0.6 : 1,
          }}
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Davet Et
        </button>
      </div>

      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #1c1f27" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 120px 140px 80px", gap: 12,
          padding: "10px 14px", background: "#0d0f15", fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em",
        }}>
          <div>E-posta</div><div>Durum</div><div>Eklendi</div><div></div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Yükleniyor…</div>
        ) : loadError ? (
          <div style={{
            padding: 16, margin: 12, borderRadius: 8,
            background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
            color: "#fca5a5", fontSize: 12, lineHeight: 1.6,
          }}>{loadError}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 13 }}>
            Henüz davet edilmiş kimse yok.
          </div>
        ) : rows.map((row) => {
          const b = badge(row.status);
          return (
            <div key={row.id} style={{
              display: "grid", gridTemplateColumns: "1fr 120px 140px 80px", gap: 12, alignItems: "center",
              padding: "12px 14px", borderTop: "1px solid #1c1f27", background: "#111318", fontSize: 13, color: "#e2e8f0",
            }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.invited_email}</div>
              <div>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999,
                  background: b.bg, color: b.color, fontSize: 11, fontWeight: 600,
                }}>
                  <b.Icon size={11} /> {b.text}
                </span>
              </div>
              <div style={{ color: "#64748b", fontSize: 12 }}>
                {new Date(row.created_at).toLocaleDateString("tr-TR")}
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => copyInvite(row)} title="Davet metnini kopyala" style={{
                  padding: 6, borderRadius: 6, border: "1px solid #1c1f27", background: "transparent",
                  color: copiedId === row.id ? "#10b981" : "#06b6d4", cursor: "pointer",
                }}>
                  {copiedId === row.id ? <Check size={13} /> : <Copy size={13} />}
                </button>
                {row.status === "active" && (
                  <button onClick={() => handleRevoke(row)} title="Erişimi iptal et" style={{
                    padding: 6, borderRadius: 6, border: "1px solid #1c1f27", background: "transparent",
                    color: "#eab308", cursor: "pointer",
                  }}><Ban size={13} /></button>
                )}
                <button onClick={() => handleDelete(row)} title="Sil" style={{
                  padding: 6, borderRadius: 6, border: "1px solid #1c1f27", background: "transparent",
                  color: "#ef4444", cursor: "pointer",
                }}><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: "#64748b", marginTop: 12, lineHeight: 1.6 }}>
        <strong style={{ color: "#94a3b8" }}>Güvenlik:</strong> Alt kullanıcılar yalnızca davet edildikleri
        şirketin verilerini görür. Sistem, her girişte izolasyon denetimi çalıştırır; anormal durumda oturum
        otomatik kapatılır.
      </p>
    </div>
  );
};
