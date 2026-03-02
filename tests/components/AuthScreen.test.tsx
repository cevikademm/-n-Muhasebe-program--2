import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthScreen } from "../../components/AuthScreen";
import { LangContext } from "../../LanguageContext";
import { translations } from "../../constants";

// ── Dış bağımlılıkları mockla ──────────────────────────────────────

vi.mock("../../services/supabaseService", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

// TubesBackground animasyonunu sadece div olarak render et
vi.mock("../../components/TubesBackground", () => ({
  TubesBackground: () => <div data-testid="tubes-bg" />,
}));

// ── Yardımcı: AuthScreen'i TR dil bağlamı ile render et ──────────────

function renderAuthScreen(onAuth = vi.fn(), lang: "tr" | "de" = "tr") {
  const t = translations[lang];
  return render(
    <LangContext.Provider value={{ t, lang, setLang: vi.fn() }}>
      <AuthScreen onAuth={onAuth} />
    </LangContext.Provider>
  );
}

// ─────────────────────────────────────────
// Görünüm testleri
// ─────────────────────────────────────────

describe("AuthScreen — görünüm", () => {
  it("Giriş formunu doğru render eder", () => {
    renderAuthScreen();
    expect(screen.getByPlaceholderText("name@firma.de")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("Fibu.de logosu görünür", () => {
    renderAuthScreen();
    expect(screen.getByText("Fibu.de")).toBeInTheDocument();
  });

  it("Dil butonları (TR, DE) görünür", () => {
    renderAuthScreen();
    expect(screen.getByText("TR")).toBeInTheDocument();
    expect(screen.getByText("DE")).toBeInTheDocument();
  });

  it("Kayıt ol butonuna tıklayınca kayıt formu açılır", async () => {
    renderAuthScreen();
    const toggleBtn = screen.getByText(/Hesabınız yok mu/);
    await userEvent.click(toggleBtn);
    expect(screen.getByPlaceholderText("GmbH / UG / e.K.")).toBeInTheDocument();
  });

  it("Kayıt formunda şirket bilgi alanları görünür", async () => {
    renderAuthScreen();
    await userEvent.click(screen.getByText(/Hesabınız yok mu/));
    expect(screen.getByPlaceholderText("GmbH / UG / e.K.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("DE123...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Berlin")).toBeInTheDocument();
  });

  it("Giriş yap ↔ Kayıt ol arasında geçiş yapılır", async () => {
    renderAuthScreen();
    const toggle = screen.getByText(/Hesabınız yok mu/);
    await userEvent.click(toggle);
    expect(screen.getByText(/Zaten hesabınız var mı/)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Zaten hesabınız var mı/));
    expect(screen.getByText(/Hesabınız yok mu/)).toBeInTheDocument();
  });

  it("DE dilinde Almanca metin görünür", () => {
    renderAuthScreen(vi.fn(), "de");
    expect(screen.getByText("DE")).toBeInTheDocument();
    // "Anmelden" başlıkta ve butonda birden fazla yerde geçer — getAllByText kullan
    const elements = screen.getAllByText("Anmelden");
    expect(elements.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────
// Form etkileşim testleri
// ─────────────────────────────────────────

describe("AuthScreen — form etkileşimleri", () => {
  it("e-posta ve şifre alanına yazılabilir", async () => {
    renderAuthScreen();
    const emailInput    = screen.getByPlaceholderText("name@firma.de");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    await userEvent.type(emailInput, "test@firma.de");
    await userEvent.type(passwordInput, "sifre123");
    expect(emailInput).toHaveValue("test@firma.de");
    expect(passwordInput).toHaveValue("sifre123");
  });

  it("Enter tuşuyla giriş yap tetiklenir (giriş modu)", async () => {
    const { supabase } = await import("../../services/supabaseService");
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { session: { user: { id: "1" } } },
      error: null,
    } as any);

    renderAuthScreen();
    const passwordInput = screen.getByPlaceholderText("••••••••");
    await userEvent.type(passwordInput, "sifre123{Enter}");
    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalled()
    );
  });
});

// ─────────────────────────────────────────
// Kimlik doğrulama akışı testleri
// ─────────────────────────────────────────

describe("AuthScreen — kimlik doğrulama", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("başarılı girişte onAuth çağrılır", async () => {
    const { supabase } = await import("../../services/supabaseService");
    const mockSession = { user: { id: "user-1" }, access_token: "token" };
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { session: mockSession },
      error: null,
    } as any);

    const onAuth = vi.fn();
    renderAuthScreen(onAuth);

    await userEvent.type(screen.getByPlaceholderText("name@firma.de"), "test@test.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Giriş Yap/i }));

    await waitFor(() => expect(onAuth).toHaveBeenCalledWith(mockSession));
  });

  it("giriş hatası mesajı gösterir", async () => {
    const { supabase } = await import("../../services/supabaseService");
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Geçersiz kimlik bilgileri" },
    } as any);

    renderAuthScreen();
    await userEvent.type(screen.getByPlaceholderText("name@firma.de"), "wrong@test.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "yanlis");
    await userEvent.click(screen.getByRole("button", { name: /Giriş Yap/i }));

    await waitFor(() =>
      expect(screen.getByText("Geçersiz kimlik bilgileri")).toBeInTheDocument()
    );
  });

  it("kayıt formunda şirket adı zorunludur", async () => {
    const { supabase } = await import("../../services/supabaseService");

    renderAuthScreen();
    await userEvent.click(screen.getByText(/Hesabınız yok mu/));

    await userEvent.type(screen.getByPlaceholderText("name@firma.de"), "new@test.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    // Şirket adını boş bırak
    await userEvent.click(screen.getByRole("button", { name: /Hesap Oluştur/ }));

    await waitFor(() =>
      expect(screen.getByText("Şirket adı zorunludur")).toBeInTheDocument()
    );
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it("başarılı kayıtta (session yok) başarı mesajı gösterir", async () => {
    const { supabase } = await import("../../services/supabaseService");
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    } as any);

    renderAuthScreen();
    await userEvent.click(screen.getByText(/Hesabınız yok mu/));
    await userEvent.type(screen.getByPlaceholderText("name@firma.de"), "new@test.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.type(screen.getByPlaceholderText("GmbH / UG / e.K."), "Test GmbH");
    await userEvent.click(screen.getByRole("button", { name: /Hesap Oluştur/ }));

    await waitFor(() =>
      expect(
        screen.getByText("Kayıt başarılı! E-postanızı kontrol edin.")
      ).toBeInTheDocument()
    );
  });

  it("kayıt hatası mesajı gösterir", async () => {
    const { supabase } = await import("../../services/supabaseService");
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Email already registered" },
    } as any);

    renderAuthScreen();
    await userEvent.click(screen.getByText(/Hesabınız yok mu/));
    await userEvent.type(screen.getByPlaceholderText("name@firma.de"), "dup@test.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.type(screen.getByPlaceholderText("GmbH / UG / e.K."), "Test GmbH");
    await userEvent.click(screen.getByRole("button", { name: /Hesap Oluştur/ }));

    await waitFor(() =>
      expect(screen.getByText("Email already registered")).toBeInTheDocument()
    );
  });
});
