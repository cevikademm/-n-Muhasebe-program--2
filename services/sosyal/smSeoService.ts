// ──────────────────────────────────────────────────────────────────
// smSeoService — sm-seo Edge Function köprüsü
// ──────────────────────────────────────────────────────────────────
// SEO ajanı tarayıcıda ÇALIŞMAZ: Anthropic anahtarı yalnızca Edge tarafında
// bulunur ve asla client'a inmez. Buradaki her fonksiyon tek bir fonksiyon
// çağrısıdır — smPublishService'teki fnCagir() deseninin aynısı.
import { supabase } from "../supabaseService";
import { SUPABASE_URL } from "../../constants";
import type {
  MusteriId, SmSeoProfil, SmSeoProfilGirdi, SmSeoAnahtar, SmSeoOneri,
} from "./types";

const FN_URL = `${SUPABASE_URL}/functions/v1/sm-seo`;

async function fnCagir<T>(govde: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Oturum bulunamadı.");

  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(govde),
  });

  const cevap = await res.json().catch(() => ({}));
  if (!res.ok || cevap?.success === false) {
    throw new Error(cevap?.error || `SEO hatası (HTTP ${res.status})`);
  }
  return cevap as T;
}

export function profilAl(customerId: MusteriId) {
  return fnCagir<{ success: true; profil: SmSeoProfil; anahtarlar: SmSeoAnahtar[] }>({
    action: "profil-al", customerId,
  });
}

export function profilKaydet(customerId: MusteriId, profil: SmSeoProfilGirdi) {
  return fnCagir<{ success: true; profil: SmSeoProfil }>({
    action: "profil-kaydet", customerId, profil,
  });
}

/** Canlı web araması — birkaç on saniye sürebilir, UI beklemeyi göstermeli. */
export function trendTara(customerId: MusteriId, opts: { adet?: number; platformlar?: string[] } = {}) {
  return fnCagir<{
    success: true; eklenen: number; guncellenen: number;
    ozet: string | null; aramalar: string[];
  }>({ action: "trend-tara", customerId, ...opts });
}

/**
 * `uygula: false` → yalnızca öneri döner, kullanıcı panelde görür.
 * `uygula: true`  → doğrudan sm_otomasyon.hashtag_havuzu'na yazılır.
 */
export function havuzUret(customerId: MusteriId, opts: { uygula?: boolean; platform?: string } = {}) {
  return fnCagir<{ success: true; havuz: string[]; uygulandi: boolean }>({
    action: "havuz-uret", customerId, ...opts,
  });
}

export function oneriUret(customerId: MusteriId, params: {
  mediaId?: string;
  postId?: string;
  platformlar?: string[];
  diller?: string[];
  format?: string | null;
  yenile?: boolean;
}) {
  return fnCagir<{ success: true; oneriler: SmSeoOneri[]; cache: boolean }>({
    action: "oneri-uret", customerId, ...params,
  });
}

export function oneriAl(customerId: MusteriId, params: { mediaId?: string; postId?: string }) {
  return fnCagir<{ success: true; oneriler: SmSeoOneri[] }>({
    action: "oneri-al", customerId, ...params,
  });
}
