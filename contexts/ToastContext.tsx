import React, { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastType = "success" | "error" | "warn" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const COLOR: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
    success: { bg: "rgba(16,185,129,.1)",   border: "rgba(16,185,129,.35)", text: "#10b981", icon: "✓" },
    error:   { bg: "rgba(239,68,68,.1)",    border: "rgba(239,68,68,.35)", text: "#f87171",  icon: "✕" },
    warn:    { bg: "rgba(245,158,11,.1)",   border: "rgba(245,158,11,.35)", text: "#f59e0b", icon: "⚠" },
    info:    { bg: "rgba(6,182,212,.1)",    border: "rgba(6,182,212,.35)", text: "#06b6d4",  icon: "ℹ" },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast stack — fixed top-right */}
      <div
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          pointerEvents: "none",
          maxWidth: "380px",
          width: "calc(100vw - 32px)",
        }}
      >
        {toasts.map(t => {
          const c = COLOR[t.type];
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                padding: "12px 16px",
                borderRadius: "10px",
                border: `1px solid ${c.border}`,
                background: c.bg,
                backdropFilter: "blur(12px)",
                pointerEvents: "auto",
                animation: "fadeUp .25s ease both",
                boxShadow: "0 4px 20px rgba(0,0,0,.3)",
              }}
            >
              <span style={{ color: c.text, fontSize: "14px", fontWeight: 700, flexShrink: 0, lineHeight: 1.4 }}>
                {c.icon}
              </span>
              <span style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.5, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {t.message}
              </span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
