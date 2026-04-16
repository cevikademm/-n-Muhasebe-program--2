import { supabase } from "./supabaseService";
import { TeamContext } from "./authContext";

export interface IsolationCheckResult {
  ok: boolean;
  reason?: string;
}

// Staff oturumları için: RLS'in doğru çalıştığını istemci tarafında doğrula.
// Görülen tüm invoice satırlarının user_id'si effectiveOwnerId'ye eşit olmalı.
// Aksi halde oturumu kapat ve kullanıcıyı uyar.
export async function runIsolationGuard(ctx: TeamContext): Promise<IsolationCheckResult> {
  if (ctx.role !== "staff") return { ok: true };
  if (!ctx.effectiveOwnerId) return { ok: false, reason: "Geçersiz ekip bağlantısı." };

  try {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, user_id")
      .limit(50);

    if (error) {
      return { ok: false, reason: "İzolasyon kontrolü başarısız: " + error.message };
    }

    const leaks = (data || []).filter((r: any) => r.user_id !== ctx.effectiveOwnerId);
    if (leaks.length > 0) {
      await supabase.from("isolation_audit_log").insert({
        check_name: "client_guard_leak",
        severity: "critical",
        member_user_id: (await supabase.auth.getUser()).data.user?.id,
        owner_user_id: ctx.effectiveOwnerId,
        table_name: "invoices",
        detail: { leak_ids: leaks.slice(0, 10).map((r: any) => r.id) },
      }).select();
      return { ok: false, reason: "Güvenlik kontrolü başarısız: yetkisiz veri tespit edildi." };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: "İzolasyon kontrolü hatası: " + (e?.message || String(e)) };
  }
}
