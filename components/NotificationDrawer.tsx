import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Bell, X, Check, CheckCheck, FileText,
    AlertTriangle, ChevronRight, Loader2, XCircle,
} from "lucide-react";
import {
    Notification,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    dismissNotification,
} from "../services/notificationService";

// ─────────────────────────────────────────────
//  PROPS
// ─────────────────────────────────────────────
interface NotificationDrawerProps {
    userId: string | null;
    onNavigateToInvoices?: () => void;
}

// ─────────────────────────────────────────────
//  YARDIMCILAR
// ─────────────────────────────────────────────
const fmtDE = (n: number) =>
    new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "az önce";
    if (mins < 60) return `${mins} dk önce`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} saat önce`;
    const days = Math.floor(hrs / 24);
    return `${days} gün önce`;
};

// ─────────────────────────────────────────────
//  ZİL İKONU + BADGE
// ─────────────────────────────────────────────
export const NotificationBell: React.FC<{
    userId: string | null;
    onClick: () => void;
    isOpen: boolean;
}> = ({ userId, onClick, isOpen }) => {
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!userId) return;
        const load = () => fetchUnreadCount(userId).then(setUnreadCount);
        load();
        const interval = setInterval(load, 30000); // 30s polling
        return () => clearInterval(interval);
    }, [userId]);

    // Dışarıdan refresh tetiklenebilsin
    useEffect(() => {
        if (!userId) return;
        fetchUnreadCount(userId).then(setUnreadCount);
    }, [isOpen, userId]);

    return (
        <button
            onClick={onClick}
            style={{
                position: "relative",
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                border: `1px solid ${isOpen ? "rgba(245,158,11,.4)" : "rgba(255,255,255,.08)"}`,
                background: isOpen ? "rgba(245,158,11,.12)" : "rgba(255,255,255,.03)",
                color: isOpen ? "#f59e0b" : "#64748b",
                transition: "all .2s",
            }}
            onMouseEnter={(e) => {
                if (!isOpen) {
                    e.currentTarget.style.borderColor = "rgba(245,158,11,.3)";
                    e.currentTarget.style.color = "#f59e0b";
                }
            }}
            onMouseLeave={(e) => {
                if (!isOpen) {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.08)";
                    e.currentTarget.style.color = "#64748b";
                }
            }}
        >
            <Bell size={15} />
            {unreadCount > 0 && (
                <span
                    style={{
                        position: "absolute",
                        top: "-4px",
                        right: "-4px",
                        minWidth: "16px",
                        height: "16px",
                        borderRadius: "8px",
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: "9px",
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 4px",
                        boxShadow: "0 2px 8px rgba(239,68,68,.5)",
                        animation: "pulse-dot 2s infinite",
                    }}
                >
                    {unreadCount > 99 ? "99+" : unreadCount}
                </span>
            )}
        </button>
    );
};

// ─────────────────────────────────────────────
//  BİLDİRİM ÇEKMECESİ (Drawer)
// ─────────────────────────────────────────────
export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
    userId,
    onNavigateToInvoices,
}) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        const data = await fetchNotifications(userId);
        setNotifications(data);
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    const handleMarkRead = async (id: string) => {
        await markAsRead(id);
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
    };

    const handleDismiss = async (id: string) => {
        await dismissNotification(id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    const handleMarkAllRead = async () => {
        if (!userId) return;
        await markAllAsRead(userId);
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    };

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                right: 0,
                width: "380px",
                maxWidth: "100vw",
                height: "100vh",
                zIndex: 300,
                display: "flex",
                flexDirection: "column",
                background: "rgba(9,11,16,.97)",
                borderLeft: "1px solid rgba(255,255,255,.08)",
                backdropFilter: "blur(24px)",
                boxShadow: "-8px 0 40px rgba(0,0,0,.6)",
                animation: "slideInRight .25s ease both",
            }}
        >
            {/* ── HEADER ── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "1px solid rgba(255,255,255,.07)",
                    flexShrink: 0,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                        style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "9px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(245,158,11,.12)",
                            border: "1px solid rgba(245,158,11,.25)",
                        }}
                    >
                        <Bell size={14} style={{ color: "#f59e0b" }} />
                    </div>
                    <div>
                        <div
                            style={{
                                fontSize: "13px",
                                fontWeight: 700,
                                color: "#f1f5f9",
                                fontFamily: "'Syne', sans-serif",
                            }}
                        >
                            Bildirimler
                        </div>
                        <div style={{ fontSize: "10px", color: "#475569" }}>
                            {unreadCount > 0
                                ? `${unreadCount} okunmamış`
                                : "Tüm bildirimler okundu"}
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {unreadCount > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "5px 10px",
                                borderRadius: "7px",
                                border: "1px solid rgba(16,185,129,.2)",
                                background: "rgba(16,185,129,.08)",
                                color: "#10b981",
                                fontSize: "10px",
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            <CheckCheck size={11} /> Tümünü Oku
                        </button>
                    )}
                </div>
            </div>

            {/* ── İÇERİK ── */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                }}
            >
                {loading && (
                    <div
                        style={{
                            padding: "40px 0",
                            display: "flex",
                            justifyContent: "center",
                        }}
                    >
                        <Loader2
                            size={18}
                            style={{ color: "#475569", animation: "spin 1s linear infinite" }}
                        />
                    </div>
                )}

                {!loading && notifications.length === 0 && (
                    <div
                        style={{
                            padding: "60px 20px",
                            textAlign: "center",
                            color: "#374151",
                            fontSize: "12px",
                        }}
                    >
                        <Bell
                            size={28}
                            style={{ color: "#1e293b", marginBottom: "12px" }}
                        />
                        <div style={{ fontWeight: 600 }}>Bildirim bulunmuyor</div>
                        <div style={{ fontSize: "10px", marginTop: "4px", color: "#2a3040" }}>
                            Eşleşmeyen banka işlemleri burada görünecek
                        </div>
                    </div>
                )}

                {!loading &&
                    notifications.map((n) => (
                        <div
                            key={n.id}
                            style={{
                                padding: "14px 16px",
                                borderRadius: "12px",
                                border: `1px solid ${!n.is_read
                                        ? "rgba(245,158,11,.2)"
                                        : "rgba(255,255,255,.06)"
                                    }`,
                                background: !n.is_read
                                    ? "rgba(245,158,11,.04)"
                                    : "rgba(255,255,255,.02)",
                                transition: "all .2s",
                                position: "relative",
                            }}
                        >
                            {/* Okunmamış dot */}
                            {!n.is_read && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "16px",
                                        left: "-2px",
                                        width: "6px",
                                        height: "6px",
                                        borderRadius: "50%",
                                        background: "#f59e0b",
                                        boxShadow: "0 0 6px rgba(245,158,11,.6)",
                                    }}
                                />
                            )}

                            {/* Başlık satırı */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    justifyContent: "space-between",
                                    gap: "8px",
                                    marginBottom: "6px",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        flex: 1,
                                        minWidth: 0,
                                    }}
                                >
                                    <AlertTriangle
                                        size={13}
                                        style={{ color: "#f59e0b", flexShrink: 0 }}
                                    />
                                    <span
                                        style={{
                                            fontSize: "12px",
                                            fontWeight: 600,
                                            color: "#e2e8f0",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {n.title}
                                    </span>
                                </div>
                                <span
                                    style={{
                                        fontSize: "9px",
                                        color: "#475569",
                                        whiteSpace: "nowrap",
                                        flexShrink: 0,
                                    }}
                                >
                                    {timeAgo(n.created_at)}
                                </span>
                            </div>

                            {/* Detay bilgileri */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    marginBottom: "8px",
                                }}
                            >
                                {n.tx_date && (
                                    <span
                                        style={{
                                            fontSize: "10px",
                                            color: "#64748b",
                                            fontFamily: "'DM Sans', sans-serif",
                                        }}
                                    >
                                        📅 {fmtDate(n.tx_date)}
                                    </span>
                                )}
                                {n.amount && (
                                    <span
                                        style={{
                                            fontSize: "11px",
                                            fontWeight: 700,
                                            color: "#ef4444",
                                            fontFamily: "'DM Sans', sans-serif",
                                        }}
                                    >
                                        -{fmtDE(n.amount)} €
                                    </span>
                                )}
                            </div>

                            {/* Açıklama */}
                            <div
                                style={{
                                    fontSize: "11px",
                                    color: "#94a3b8",
                                    lineHeight: 1.5,
                                    marginBottom: "10px",
                                }}
                            >
                                {n.body}
                            </div>

                            {/* Aksiyonlar */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                }}
                            >
                                <button
                                    onClick={() => {
                                        handleMarkRead(n.id);
                                        onNavigateToInvoices?.();
                                    }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "5px",
                                        padding: "5px 12px",
                                        borderRadius: "7px",
                                        border: "1px solid rgba(6,182,212,.25)",
                                        background: "rgba(6,182,212,.1)",
                                        color: "#06b6d4",
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        transition: "all .15s",
                                    }}
                                >
                                    <FileText size={11} /> Fatura Yükle
                                    <ChevronRight size={10} />
                                </button>

                                {!n.is_read && (
                                    <button
                                        onClick={() => handleMarkRead(n.id)}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "4px",
                                            padding: "5px 10px",
                                            borderRadius: "7px",
                                            border: "1px solid rgba(255,255,255,.08)",
                                            background: "rgba(255,255,255,.03)",
                                            color: "#64748b",
                                            fontSize: "10px",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                        }}
                                    >
                                        <Check size={10} /> Okundu
                                    </button>
                                )}

                                <button
                                    onClick={() => handleDismiss(n.id)}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "5px 10px",
                                        borderRadius: "7px",
                                        border: "1px solid rgba(239,68,68,.15)",
                                        background: "rgba(239,68,68,.05)",
                                        color: "#ef4444",
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        marginLeft: "auto",
                                    }}
                                >
                                    <XCircle size={10} /> Yok Say
                                </button>
                            </div>
                        </div>
                    ))}
            </div>

            {/* ── FOOTER ── */}
            <div
                style={{
                    padding: "12px 20px",
                    borderTop: "1px solid rgba(255,255,255,.07)",
                    fontSize: "9px",
                    color: "#374151",
                    textAlign: "center",
                    flexShrink: 0,
                }}
            >
                Eşleşmeyen banka işlemleri otomatik olarak bildirilir
            </div>

            <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
};
