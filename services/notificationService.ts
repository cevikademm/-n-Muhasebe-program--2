import { supabase } from "./supabaseService";

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
export interface Notification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    body: string;
    amount: number | null;
    currency: string;
    tx_date: string | null;
    tx_counterpart: string | null;
    statement_id: string | null;
    invoice_id: string | null;
    is_read: boolean;
    is_dismissed: boolean;
    created_at: string;
}

interface UnmatchedTx {
    tx: {
        id: string;
        date: string;
        description: string;
        amount: number;
        type: "income" | "expense";
        counterpart: string;
        reference: string;
    };
    match: any | null;
}

// ─────────────────────────────────────────────
//  EŞLEŞMEYENLERİ TESPİT ET → BİLDİRİM OLUŞTUR
// ─────────────────────────────────────────────
export const createUnmatchedNotifications = async (
    txMatches: UnmatchedTx[],
    statementId: string | null,
    userId: string
): Promise<number> => {
    // Sadece gider + eşleşmeyen + 10€ üstü
    const unmatched = txMatches.filter(
        (t) =>
            t.match === null &&
            t.tx.type === "expense" &&
            Math.abs(t.tx.amount) >= 10
    );

    if (unmatched.length === 0) return 0;

    const rows = unmatched.map((t) => ({
        user_id: userId,
        type: "unmatched_transaction",
        title: t.tx.counterpart || t.tx.description || "Bilinmeyen İşlem",
        body: `${Math.abs(t.tx.amount).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
        })} € tutarında işlem için fatura bulunamadı. Lütfen ilgili belgeyi yükleyin.`,
        amount: Math.abs(t.tx.amount),
        currency: "EUR",
        tx_date: t.tx.date || null,
        tx_counterpart: t.tx.counterpart || null,
        statement_id: statementId,
        is_read: false,
        is_dismissed: false,
    }));

    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
        console.error("[Notifications] Insert error:", error.message);
        return 0;
    }

    return unmatched.length;
};

// ─────────────────────────────────────────────
//  BİLDİRİMLERİ GETİR (okunmamış önce)
// ─────────────────────────────────────────────
export const fetchNotifications = async (
    userId: string,
    limit = 50
): Promise<Notification[]> => {
    const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("[Notifications] Fetch error:", error.message);
        return [];
    }
    return (data || []) as Notification[];
};

// ─────────────────────────────────────────────
//  OKUNMAMIŞ SAYISI
// ─────────────────────────────────────────────
export const fetchUnreadCount = async (userId: string): Promise<number> => {
    const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false)
        .eq("is_dismissed", false);

    if (error) return 0;
    return count || 0;
};

// ─────────────────────────────────────────────
//  OKUNDU İŞARETLE
// ─────────────────────────────────────────────
export const markAsRead = async (id: string): Promise<void> => {
    await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
};

export const markAllAsRead = async (userId: string): Promise<void> => {
    await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
};

// ─────────────────────────────────────────────
//  YOK SAY (dismiss)
// ─────────────────────────────────────────────
export const dismissNotification = async (id: string): Promise<void> => {
    await supabase
        .from("notifications")
        .update({ is_dismissed: true })
        .eq("id", id);
};
