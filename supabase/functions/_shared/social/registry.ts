// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Adapter kayıt defteri — yeni platform eklemenin TEK dokunma noktası
// ──────────────────────────────────────────────────────────────────
import type { SocialAdapter, Platform } from "./types.ts";
import { instagramAdapter } from "./instagram.ts";
import { youtubeAdapter } from "./youtube.ts";
import { tiktokAdapter } from "./tiktok.ts";
import { taslakAdapter } from "./taslak.ts";

const KAYIT: Record<Platform, SocialAdapter> = {
  instagram: instagramAdapter,
  youtube:   youtubeAdapter,
  // Faz 3 kapsamında iskelet; gerçek OAuth akışları sonraki adımda.
  facebook:  taslakAdapter("facebook"),
  tiktok:    tiktokAdapter,
  linkedin:  taslakAdapter("linkedin"),
  x:         taslakAdapter("x"),
  pinterest: taslakAdapter("pinterest"),
};

export function adapterAl(platform: string): SocialAdapter {
  const a = KAYIT[platform as Platform];
  if (!a) throw new Error(`Bilinmeyen platform: ${platform}`);
  return a;
}

export function hazirPlatformlar(): Platform[] {
  return (Object.keys(KAYIT) as Platform[]).filter((p) => KAYIT[p].hazir);
}
