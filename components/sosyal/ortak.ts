// ──────────────────────────────────────────────────────────────────
// Sosyal modülü — paylaşılan stil parçaları ve küçük yardımcılar
// ──────────────────────────────────────────────────────────────────
// Proje inline-style kullanıyor (Tailwind yok). Aynı kart/rozet/buton
// tanımını 8 dosyada tekrarlamamak için ortak parçalar burada.
import React from "react";
import type {
  SmMedyaDurum, SmPlatform, SmYayinDurum, SmYayinFormat, SmYorumDurum,
} from "../../services/sosyal/types";

export const FONT_BASLIK = "'Space Grotesk', sans-serif";
export const FONT_METIN = "'Plus Jakarta Sans', sans-serif";

/** Modülün ana rengi — LeftPanel'deki Sosyal Medya platformuyla aynı. */
export const SM_RENK = "#ec4899";

export const kart: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
};

export const buton = (renk: string, dolu = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 12px", borderRadius: 9,
  fontSize: 12, fontWeight: 700, fontFamily: FONT_METIN,
  cursor: "pointer", whiteSpace: "nowrap",
  background: dolu ? renk : `${renk}14`,
  color: dolu ? "#fff" : renk,
  border: `1px solid ${renk}${dolu ? "" : "33"}`,
  transition: "all .15s",
});

export const rozet = (renk: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 9.5, fontWeight: 800, letterSpacing: ".02em",
  padding: "2px 7px", borderRadius: 6,
  background: `${renk}1a`, color: renk, border: `1px solid ${renk}33`,
  fontFamily: FONT_BASLIK, flexShrink: 0,
});

export const girdi: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 9,
  background: "var(--panel-2)", border: "1px solid var(--border)",
  color: "var(--text-1)", fontSize: 12.5, fontFamily: FONT_METIN,
  outline: "none",
};

/** Medya durumu → [etiket(tr), etiket(de), renk] */
export const DURUM_META: Record<SmMedyaDurum, [string, string, string]> = {
  taslak:     ["Taslak",      "Entwurf",        "#64748b"],
  hazir:      ["Hazır",       "Bereit",         "#06b6d4"],
  onayda:     ["Onayda",      "In Prüfung",     "#f59e0b"],
  onaylandi:  ["Onaylandı",   "Freigegeben",    "#10b981"],
  yayinlandi: ["Yayınlandı",  "Veröffentlicht", "#8b5cf6"],
  arsiv:      ["Arşiv",       "Archiv",         "#475569"],
};

/** Platform → [etiket, renk] */
export const PLATFORM_META: Record<SmPlatform, [string, string]> = {
  instagram: ["Instagram", "#e1306c"],
  youtube:   ["YouTube",   "#ff0000"],
  facebook:  ["Facebook",  "#1877f2"],
  tiktok:    ["TikTok",    "#000000"],
  linkedin:  ["LinkedIn",  "#0a66c2"],
  x:         ["X",         "#111827"],
  pinterest: ["Pinterest", "#e60023"],
};

/** Kart/rozet arka planları için marka gradyanı — düz renkten daha "dolgun". */
export const PLATFORM_GRADYAN: Record<SmPlatform, string> = {
  instagram: "linear-gradient(135deg,#f9ce34 0%,#ee2a7b 50%,#6228d7 100%)",
  youtube:   "linear-gradient(135deg,#ff4e45 0%,#ff0000 100%)",
  facebook:  "linear-gradient(135deg,#4293ff 0%,#0b5fd1 100%)",
  tiktok:    "linear-gradient(135deg,#25f4ee 0%,#000 55%,#fe2c55 100%)",
  linkedin:  "linear-gradient(135deg,#3b9dea 0%,#0a66c2 100%)",
  x:         "linear-gradient(135deg,#4b5563 0%,#111827 100%)",
  pinterest: "linear-gradient(135deg,#ff5a68 0%,#e60023 100%)",
};

/** Bu fazda uçtan uca desteklenen platformlar — diğerleri "yakında". */
export const AKTIF_PLATFORMLAR: SmPlatform[] = ["instagram", "youtube", "tiktok", "facebook"];

/**
 * Yayınlama uçtan uca ÇALIŞAN platformlar. `AKTIF_PLATFORMLAR`'dan ayrı:
 * YouTube/Facebook hesabı kaydedilebiliyor ama adapter'ları henüz taslak
 * (bkz. supabase/functions/_shared/social/registry.ts).
 */
export const YAYIN_PLATFORMLARI: SmPlatform[] = ["instagram", "youtube", "tiktok"];

/** YouTube Shorts üst sınırı (sn) — adapter'daki eşikle aynı tutulmalı. */
export const SHORTS_AZAMI_SN = 180;

/**
 * Videonun YouTube Shorts olarak sayılıp sayılmayacağı.
 *
 * YouTube'da "bu bir Short" diye bir API bayrağı yok: video DİKEY ve
 * ≤180 sn ise otomatik olarak Short sayılır. Bu yüzden kontrol arayüzde
 * yapılır — kullanıcı kuyruğa atmadan önce uyarılsın, hatayı yayın
 * sırasında görmesin.
 *
 * Bilgi eksikse (süre/çözünürlük yoksa) uygun kabul edilir; yanlış
 * pozitifle yayını bloke etmeyelim.
 */
export function shortsUygun(
  sure?: number | null,
  cozunurluk?: string | null,
): { uygun: boolean; sebepTr?: string; sebepDe?: string } {
  if (sure != null && isFinite(sure) && sure > SHORTS_AZAMI_SN) {
    const sn = Math.round(sure);
    return {
      uygun: false,
      sebepTr: `Shorts en fazla ${SHORTS_AZAMI_SN} sn olabilir (bu video ${sn} sn).`,
      sebepDe: `Shorts dürfen max. ${SHORTS_AZAMI_SN} s sein (dieses Video ${sn} s).`,
    };
  }
  const m = String(cozunurluk ?? "").match(/^(\d+)\s*[xX*]\s*(\d+)$/);
  if (m && Number(m[1]) > Number(m[2])) {
    return {
      uygun: false,
      sebepTr: `Shorts dikey video ister (bu video ${m[1]}x${m[2]} — yatay).`,
      sebepDe: `Shorts brauchen Hochformat (dieses Video ${m[1]}x${m[2]} — quer).`,
    };
  }
  return { uygun: true };
}

/** Yayın formatı → [etiket(tr), etiket(de), video mu] */
export const FORMAT_META: Record<SmYayinFormat, [string, string, boolean]> = {
  feed:  ["Gönderi",  "Beitrag", false],
  reel:  ["Reels",    "Reels",   true],
  story: ["Hikâye",   "Story",   false],
  video: ["Video",    "Video",   true],
  short: ["Shorts",   "Shorts",  true],
};

/** Yayın durumu → [etiket(tr), etiket(de), renk] */
export const YAYIN_DURUM_META: Record<SmYayinDurum, [string, string, string]> = {
  kuyrukta:     ["Kuyrukta",    "In Warteschlange", "#64748b"],
  yayinlaniyor: ["Yayınlanıyor", "Wird gepostet",   "#06b6d4"],
  yayinlandi:   ["Yayınlandı",  "Veröffentlicht",   "#10b981"],
  hata:         ["Hata",        "Fehler",           "#ef4444"],
  iptal:        ["İptal",       "Abgebrochen",      "#475569"],
};

/** Otomatik ilk yorumun durumu → [etiket(tr), etiket(de), renk] */
export const YORUM_DURUM_META: Record<SmYorumDurum, [string, string, string]> = {
  yok:            ["—",                  "—",                     "#64748b"],
  bekliyor:       ["Yorum bekliyor",     "Kommentar ausstehend",  "#06b6d4"],
  yazildi:        ["Yorum yazıldı",      "Kommentar gepostet",    "#10b981"],
  hata:           ["Yorum yazılamadı",   "Kommentar fehlgeschlagen", "#ef4444"],
  desteklenmiyor: ["Yorum desteklenmiyor", "Kommentar nicht möglich", "#475569"],
};

/** Platformun bir formatı destekleyip desteklemediği. */
export function formatlar(platform: SmPlatform, video: boolean): SmYayinFormat[] {
  if (platform === "youtube") return video ? ["short", "video"] : [];
  // TikTok bu akışta yalnızca video alıyor (foto karuseli ayrı bir uç).
  if (platform === "tiktok") return video ? ["video"] : [];
  if (platform === "instagram" || platform === "facebook") {
    return video ? ["reel", "story"] : ["feed", "story"];
  }
  return video ? ["video"] : ["feed"];
}

/** Platform başına caption üst sınırı (yaklaşık, uyarı amaçlı). */
export const CAPTION_SINIRI: Record<SmPlatform, number> = {
  instagram: 2200,
  facebook: 5000,
  youtube: 5000,
  tiktok: 2200,
  linkedin: 3000,
  x: 280,
  pinterest: 500,
};

/** 1536000 → "1,5 MB" */
export function boyutMetni(byte?: number | null): string {
  if (byte == null || !isFinite(byte)) return "—";
  const birim = ["B", "KB", "MB", "GB"];
  let i = 0, v = byte;
  while (v >= 1024 && i < birim.length - 1) { v /= 1024; i++; }
  const s = i === 0 ? String(v) : v.toFixed(v < 10 ? 1 : 0);
  return `${s.replace(".", ",")} ${birim[i]}`;
}

/** 96.4 → "1:36" */
export function sureMetni(saniye?: number | null): string {
  if (saniye == null || !isFinite(saniye)) return "—";
  const d = Math.floor(saniye / 60);
  const s = Math.round(saniye % 60);
  return `${d}:${String(s).padStart(2, "0")}`;
}

export const videoMu = (mime?: string | null) => !!mime?.startsWith("video/");
export const gorselMi = (mime?: string | null) => !!mime?.startsWith("image/");
