// ──────────────────────────────────────────────────────────────────
// useEkran — mobil / tablet / masaüstü kırılımı
// ──────────────────────────────────────────────────────────────────
// Proje inline-style kullanıyor (Tailwind yok) ve app-styles.css'te
// pratikte hiç media query yok. CSS'e paralel bir sınıf sistemi açmak
// yerine kırılımı JS'ten okuyoruz: inline stiller zaten JS'te üretiliyor,
// böylece tek kaynak kalıyor.
//
// `matchMedia` + `change` olayı kullanılır (resize'dan çok daha ucuz:
// yalnızca eşik geçildiğinde tetiklenir, her pikselde değil).
import { useState, useEffect } from "react";

export const KIRILIM = { mobil: 640, tablet: 1024 } as const;

export type EkranBoyu = "mobil" | "tablet" | "masaustu";

export interface Ekran {
  boy: EkranBoyu;
  /** < 640px — tek sütun, tam ekran sayfalar, alt aksiyon çubuğu */
  mobil: boolean;
  /** 640-1023px — iki sütun ama yan çekmece yerine örtü */
  tablet: boolean;
  /** Yan çekmece yerine tam ekran örtü kullanılmalı mı. */
  dar: boolean;
}

function olc(): Ekran {
  // SSR / test ortamında window yok — masaüstü varsayılır.
  const w = typeof window === "undefined" ? 1280 : window.innerWidth;
  const mobil = w < KIRILIM.mobil;
  const tablet = !mobil && w < KIRILIM.tablet;
  return {
    boy: mobil ? "mobil" : tablet ? "tablet" : "masaustu",
    mobil,
    tablet,
    dar: mobil || tablet,
  };
}

export function useEkran(): Ekran {
  const [ekran, setEkran] = useState<Ekran>(olc);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const sorgular = [
      window.matchMedia(`(max-width: ${KIRILIM.mobil - 1}px)`),
      window.matchMedia(`(max-width: ${KIRILIM.tablet - 1}px)`),
    ];
    const guncelle = () => setEkran(olc());

    // Safari 13 ve altı addEventListener desteklemiyor → addListener'a düş.
    for (const s of sorgular) {
      if (s.addEventListener) s.addEventListener("change", guncelle);
      else s.addListener(guncelle);
    }
    guncelle();

    return () => {
      for (const s of sorgular) {
        if (s.removeEventListener) s.removeEventListener("change", guncelle);
        else s.removeListener(guncelle);
      }
    };
  }, []);

  return ekran;
}
