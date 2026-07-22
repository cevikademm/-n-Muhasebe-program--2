// ──────────────────────────────────────────────────────────────────
// Modül (paket) tanımları — TEK KAYNAK
// ──────────────────────────────────────────────────────────────────
// Platform sekmeleri üç ayrı yerde elle tekrarlanıyordu (LeftPanel'in
// PLATFORMS dizisi, App'in alt bar dizisi, ekran yönlendirmeleri). Yeni bir
// modül eklendiğinde üçünü birden güncellemeyi unutmak kaçınılmazdı; artık
// hepsi buradan türer.
//
// ⚠ Bu dosyanın ikizi: supabase/functions/_shared/moduller.ts
//    (Deno ↔ Vite ayrımı yüzünden import edilemiyor.) Modül anahtarlarını
//    veya etiketleri değiştirirken İKİSİNİ birden güncelleyin.
//    Anahtarlar ayrıca kullanici_modulleri.modul CHECK kısıtında da geçer.
import { MenuKey } from "../types";

export type Modul = "muhasebe" | "musteri_bulma" | "sosyal_medya";

export const MODULLER: Modul[] = ["muhasebe", "musteri_bulma", "sosyal_medya"];

export interface ModulTanim {
  key: Modul;
  /** Bu modülün ana ekranı — platform sekmesine basınca gidilen yer. */
  anaMenu: MenuKey;
  ad: { tr: string; de: string };
  /** Sidebar'daki alt başlık; davet mailinde de bu cümle kullanılır. */
  aciklama: { tr: string; de: string };
  renk: string;
}

export const MODUL_TANIM: Record<Modul, ModulTanim> = {
  muhasebe: {
    key: "muhasebe",
    anaMenu: "dashboard",
    ad: { tr: "Muhasebe", de: "Buchhaltung" },
    aciklama: {
      tr: "Fatura yükleme ve AI analizi, banka ekstresi eşleştirme, raporlar ve formlar.",
      de: "Rechnungsupload mit KI-Analyse, Bankabgleich, Berichte und Formulare.",
    },
    renk: "#06b6d4",
  },
  musteri_bulma: {
    key: "musteri_bulma",
    anaMenu: "musteriBulma",
    ad: { tr: "Müşteri Bulma", de: "Kundengewinnung" },
    aciklama: {
      tr: "Google Maps üzerinden hedef müşteri araması ve toplu e-posta otomasyonu.",
      de: "Zielkundensuche über Google Maps und automatisierte E-Mail-Kampagnen.",
    },
    renk: "#8b5cf6",
  },
  sosyal_medya: {
    key: "sosyal_medya",
    anaMenu: "sosyalMedya",
    ad: { tr: "Sosyal Medya", de: "Social Media" },
    aciklama: {
      tr: "Medya kütüphanesi, hesap bağlantıları, içerik takvimi ve performans analizi.",
      de: "Medienbibliothek, Kontoverbindungen, Content-Kalender und Analysen.",
    },
    renk: "#ec4899",
  },
};

/**
 * Hangi ekran hangi modüle ait. `null` = modülden bağımsız (ayarlar, hukuki
 * sayfalar, admin ekranları) — bunlar paket kapalıyken de açık kalır.
 */
export const MENU_MODUL: Record<MenuKey, Modul | null> = {
  dashboard: "muhasebe",
  invoices: "muhasebe",
  reports: "muhasebe",
  forms: "muhasebe",
  bankDocuments: "muhasebe",
  accountPlans: "muhasebe",
  hesapPlanlari2: "muhasebe",
  campaigns: "muhasebe",
  musteriBulma: "musteri_bulma",
  sosyalMedya: "sosyal_medya",
  // modülden bağımsız
  settings: null,
  companies: null,
  adminView: null,
  about: null,
  deliveryReturn: null,
  privacy: null,
  distanceSelling: null,
};

/** Bir menü anahtarının modülü açık mı? Modülsüz ekranlar her zaman açıktır. */
export const menuErisilebilir = (menu: MenuKey, acikModuller: Set<Modul>): boolean => {
  const m = MENU_MODUL[menu];
  return m === null || m === undefined || acikModuller.has(m);
};

/**
 * Kullanıcının açılışta düşeceği ekran. Sırayı MODULLER belirler; hiç modülü
 * yoksa ayarlara düşer (orada "Paketlerim" sekmesinden talep açabilir).
 */
export const ilkAcikMenu = (acikModuller: Set<Modul>): MenuKey => {
  const ilk = MODULLER.find((m) => acikModuller.has(m));
  return ilk ? MODUL_TANIM[ilk].anaMenu : "settings";
};

export const modulAdi = (m: Modul, lang: "tr" | "de") => MODUL_TANIM[m].ad[lang];
export const modulAciklama = (m: Modul, lang: "tr" | "de") => MODUL_TANIM[m].aciklama[lang];
