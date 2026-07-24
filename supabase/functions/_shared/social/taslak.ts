// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Henüz uygulanmamış platformlar için iskelet adapter
// ──────────────────────────────────────────────────────────────────
// Registry'nin eksiksiz olması, UI'ın platform listesini tek kaynaktan
// okuyabilmesi ve "yakında" durumunun sessiz bir undefined yerine açık
// bir sözleşme olması için. `hazir: false` → UI bağlanmayı hiç denemez.
import type {
  SocialAdapter, Platform, Kimlik, HesapProfili, DogrulamaSonucu,
  YayinIstegi, YayinSonucu, MetrikOpts,
} from "./types.ts";
import { henuzYok } from "./types.ts";

export function taslakAdapter(platform: Platform): SocialAdapter {
  return {
    platform,
    hazir: false,

    dogrula(_k: Kimlik): Promise<DogrulamaSonucu> {
      return Promise.resolve({
        ok: false,
        sebep: `${platform} bağlantısı bu fazda henüz desteklenmiyor.`,
      });
    },
    profilGetir(_k: Kimlik): Promise<HesapProfili> { return henuzYok(platform, "profilGetir"); },
    yayinla(_k: Kimlik, _i: YayinIstegi): Promise<YayinSonucu> { return henuzYok(platform, "yayinla"); },
    metrikler(_k: Kimlik, _o: MetrikOpts): Promise<unknown> { return henuzYok(platform, "metrikler"); },
  };
}
