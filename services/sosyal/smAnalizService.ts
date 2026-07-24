// ──────────────────────────────────────────────────────────────────
// smAnalizService — hesap büyümesi + gönderi sıralaması
// ──────────────────────────────────────────────────────────────────
// İki farklı soru, iki farklı kaynak:
//
//   sm_metrics       → "büyüyor muyuz?"   günlük HESAP snapshot'ı
//   sm_post_ranking  → "hangi içerik büyütüyor?"  gönderi başına son ölçüm
//                      + yayilma_skoru ((kaydetme+paylaşım)/erişim) + karar
//
// Sıralamanın omurgası beğeni DEĞİL: Instagram dağıtımı "kaydettim /
// arkadaşıma yolladım" sinyaline tepki veriyor. View bunu zaten hesaplıyor,
// burada yeniden türetilmez.
import { supabase } from "../supabaseService";
import { SUPABASE_URL } from "../../constants";
import type {
  SmMetrikGun, SmGonderiSirasi, SmYayinOzeti, MusteriId, SmPlatform,
} from "./types";

const FN_URL = `${SUPABASE_URL}/functions/v1/ig-metrics-sync`;

function musteriFiltre(q: any, customerId: MusteriId) {
  return customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId);
}

/** Son `gun` günün hesap snapshot'ları (tarihe göre artan). */
export async function metrikGunleriGetir(
  ownerId: string,
  customerId: MusteriId,
  gun = 30,
): Promise<SmMetrikGun[]> {
  const baslangic = new Date();
  baslangic.setDate(baslangic.getDate() - gun);

  const { data, error } = await musteriFiltre(
    supabase.from("sm_metrics")
      .select("tarih, platform, takipci, takipci_artis, erisim, gosterim, etkilesim, profil_ziyaret")
      .eq("user_id", ownerId),
    customerId,
  )
    .gte("tarih", baslangic.toISOString().slice(0, 10))
    .order("tarih", { ascending: true })
    .limit(400);

  if (error) throw new Error(error.message);
  return (data || []) as SmMetrikGun[];
}

/**
 * Gönderi sıralaması. `yeterli_veri` önce gelir: erişimi 50'nin altındaki
 * gönderiler yüksek oran üretip listeyi kirletiyor (5 erişim / 1 kaydetme
 * = %20, ama hiçbir şey ifade etmiyor).
 */
export async function gonderiSiralamasiGetir(
  ownerId: string,
  customerId: MusteriId,
  limit = 20,
): Promise<SmGonderiSirasi[]> {
  const { data, error } = await musteriFiltre(
    supabase.from("sm_post_ranking")
      .select(
        "medya_id, permalink, caption, medya_tipi, urun_tipi, yayin_tarihi, erisim, " +
        "begeni, yorum, kaydetme, paylasim, yayilma_skoru, etkilesim_orani, " +
        "kaydetme_orani, medyan_yayilma, yeterli_veri, karar, yas_gun",
      )
      .eq("user_id", ownerId),
    customerId,
  )
    .order("yeterli_veri", { ascending: false })
    .order("yayilma_skoru", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data || []) as SmGonderiSirasi[];
}

/**
 * Yayın kuyruğundan türetilen özet. Metrik tabloları boşken bile DOLU olan
 * tek kaynak burası — "hiç veri yok" ekranı yerine gerçek bir şey gösterir.
 */
export async function yayinOzetiGetir(
  ownerId: string,
  customerId: MusteriId,
): Promise<SmYayinOzeti> {
  const { data, error } = await musteriFiltre(
    supabase.from("sm_yayinlar")
      .select("platform, durum, yorum_durum, bitis, created_at")
      .eq("user_id", ownerId),
    customerId,
  ).order("created_at", { ascending: false }).limit(500);

  if (error) throw new Error(error.message);
  const satirlar = data || [];

  const platformDagilimi: Record<string, number> = {};
  let yayinlandi = 0, hata = 0, bekleyen = 0, yorumYazildi = 0;
  let sonYayin: string | null = null;

  for (const s of satirlar) {
    if (s.durum === "yayinlandi") {
      yayinlandi++;
      platformDagilimi[s.platform] = (platformDagilimi[s.platform] ?? 0) + 1;
      const t = s.bitis ?? s.created_at;
      if (t && (!sonYayin || +new Date(t) > +new Date(sonYayin))) sonYayin = t;
    } else if (s.durum === "hata") hata++;
    else if (s.durum === "kuyrukta" || s.durum === "yayinlaniyor") bekleyen++;
    if (s.yorum_durum === "yazildi") yorumYazildi++;
  }

  return {
    toplam: satirlar.length,
    yayinlandi,
    hata,
    bekleyen,
    yorumYazildi,
    sonYayin,
    platformDagilimi: platformDagilimi as Record<SmPlatform, number>,
  };
}

// ── ig-metrics-sync köprüsü ────────────────────────────────────────

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
    throw new Error(cevap?.error || `Metrik hatası (HTTP ${res.status})`);
  }
  return cevap as T;
}

/**
 * Instagram'dan taze ölçüm çeker ve `sm_post_metrics`'e günlük snapshot yazar.
 * `accountId` verilmezse fonksiyon doğrulanmış ilk hesabı ölçer ve birden çok
 * hesap varsa bunu `uyarilar` ile bildirir — hangi hesabın ölçüldüğü belirsiz
 * kalmasın.
 */
export function metrikleriSenkronla(params: { accountId?: string; limit?: number } = {}) {
  return fnCagir<{
    success: true; cekilen: number; yazilan: number;
    siralama: SmGonderiSirasi[]; uyarilar: string[];
  }>({ action: "sync", ...params });
}
