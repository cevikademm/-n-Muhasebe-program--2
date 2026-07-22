// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Modül (paket) tanımları — Edge Function tarafı
// ──────────────────────────────────────────────────────────────────
// ⚠ Bu dosyanın ikizi: services/moduller.ts
//    (Deno ↔ Vite ayrımı yüzünden tek dosya paylaşılamıyor.) Modül
//    anahtarlarını veya etiketleri değiştirirken İKİSİNİ birden güncelleyin.
//    Anahtarlar ayrıca kullanici_modulleri.modul CHECK kısıtında da geçer.

export type Modul = "muhasebe" | "musteri_bulma" | "sosyal_medya";

export const MODULLER: Modul[] = ["muhasebe", "musteri_bulma", "sosyal_medya"];

export const MODUL_TANIM: Record<Modul, {
  ad: { tr: string; de: string };
  aciklama: { tr: string; de: string };
  renk: string;
}> = {
  muhasebe: {
    ad: { tr: "Muhasebe", de: "Buchhaltung" },
    aciklama: {
      tr: "Fatura yükleme ve AI analizi, banka ekstresi eşleştirme, raporlar ve formlar.",
      de: "Rechnungsupload mit KI-Analyse, Bankabgleich, Berichte und Formulare.",
    },
    renk: "#06b6d4",
  },
  musteri_bulma: {
    ad: { tr: "Müşteri Bulma", de: "Kundengewinnung" },
    aciklama: {
      tr: "Google Maps üzerinden hedef müşteri araması ve toplu e-posta otomasyonu.",
      de: "Zielkundensuche über Google Maps und automatisierte E-Mail-Kampagnen.",
    },
    renk: "#8b5cf6",
  },
  sosyal_medya: {
    ad: { tr: "Sosyal Medya", de: "Social Media" },
    aciklama: {
      tr: "Medya kütüphanesi, hesap bağlantıları, içerik takvimi ve performans analizi.",
      de: "Medienbibliothek, Kontoverbindungen, Content-Kalender und Analysen.",
    },
    renk: "#ec4899",
  },
};

/** Gelen listeyi bilinen modüllere süzer — bilinmeyen anahtar sessizce düşer. */
export function modulleriTemizle(girdi: unknown): Modul[] {
  if (!Array.isArray(girdi)) return [];
  const set = new Set<Modul>();
  for (const m of girdi) {
    if (MODULLER.includes(m as Modul)) set.add(m as Modul);
  }
  return [...set];
}
