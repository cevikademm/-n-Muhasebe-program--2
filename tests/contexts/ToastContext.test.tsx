import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "../../contexts/ToastContext";

// ── useToast hook'unu kullanan test bileşeni ───────────────────────

function ToastTrigger({ message, type }: { message: string; type?: any }) {
  const { toast } = useToast();
  return (
    <button onClick={() => toast(message, type)}>
      Bildirim Göster
    </button>
  );
}

function renderWithToast(message: string, type?: any) {
  return render(
    <ToastProvider>
      <ToastTrigger message={message} type={type} />
    </ToastProvider>
  );
}

// ─────────────────────────────────────────
// Testler
// ─────────────────────────────────────────

describe("ToastContext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers(); // Sahte zamanlayıcıları her testten sonra sıfırla
  });

  it("toast mesajı ekranda görünür", async () => {
    renderWithToast("İşlem başarılı!");
    await userEvent.click(screen.getByText("Bildirim Göster"));
    expect(screen.getByText("İşlem başarılı!")).toBeInTheDocument();
  });

  it("success tipi için ✓ ikonu gösterir", async () => {
    renderWithToast("Kaydedildi", "success");
    await userEvent.click(screen.getByText("Bildirim Göster"));
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("error tipi için ✕ ikonu gösterir", async () => {
    renderWithToast("Hata oluştu", "error");
    await userEvent.click(screen.getByText("Bildirim Göster"));
    expect(screen.getByText("✕")).toBeInTheDocument();
  });

  it("warn tipi için ⚠ ikonu gösterir", async () => {
    renderWithToast("Dikkat!", "warn");
    await userEvent.click(screen.getByText("Bildirim Göster"));
    expect(screen.getByText("⚠")).toBeInTheDocument();
  });

  it("info tipi için ℹ ikonu gösterir", async () => {
    renderWithToast("Bilgi mesajı", "info");
    await userEvent.click(screen.getByText("Bildirim Göster"));
    expect(screen.getByText("ℹ")).toBeInTheDocument();
  });

  it("varsayılan tip 'info' olarak çalışır", async () => {
    renderWithToast("Varsayılan mesaj");  // type belirtilmedi
    await userEvent.click(screen.getByText("Bildirim Göster"));
    expect(screen.getByText("ℹ")).toBeInTheDocument();
  });

  it("3.5 saniye sonra toast otomatik kapanır", () => {
    vi.useFakeTimers();
    renderWithToast("Geçici mesaj");

    // fireEvent.click kullan — userEvent sahte zamanlayıcıyla uyumsuz
    act(() => {
      fireEvent.click(screen.getByText("Bildirim Göster"));
    });

    expect(screen.getByText("Geçici mesaj")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3600);
    });

    expect(screen.queryByText("Geçici mesaj")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("birden fazla toast aynı anda gösterilebilir", () => {
    function MultiTrigger() {
      const { toast } = useToast();
      return (
        <>
          <button onClick={() => toast("Birinci mesaj", "success")}>Birinci Buton</button>
          <button onClick={() => toast("İkinci mesaj", "error")}>İkinci Buton</button>
        </>
      );
    }
    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Birinci Buton"));
    fireEvent.click(screen.getByText("İkinci Buton"));
    expect(screen.getByText("Birinci mesaj")).toBeInTheDocument();
    expect(screen.getByText("İkinci mesaj")).toBeInTheDocument();
  });

  it("ToastProvider dışında useToast varsayılan (no-op) döner", () => {
    // Context dışında kullanım — ToastContext default değeri { toast: () => {} }
    // Hata fırlatmamalı
    function Isolated() {
      const { toast } = useToast();
      return <button onClick={() => toast("test")}>Test</button>;
    }
    expect(() => render(<Isolated />)).not.toThrow();
  });
});
