// ──────────────────────────────────────────────────────────────────
// useSmAccounts — sosyal hesaplar state'i
// ──────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import {
  hesaplariListele, hesapEkle, hesapGuncelle, hesapSil,
  hesapDogrula, baglantiyiKopar, musterileriListele,
  baglantiBaslat, baglantiDurumu,
} from "./smAccountService";
import type { SmHesap, SmPlatform, MusteriId, SmMusteri } from "./types";

export function useSmAccounts(ownerId: string | undefined, customerId: MusteriId) {
  const [hesaplar, setHesaplar] = useState<SmHesap[]>([]);
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  /** Hangi hesap şu an doğrulanıyor — kart bazlı spinner için. */
  const [dogrulanan, setDogrulanan] = useState<string | null>(null);

  const getir = useCallback(async () => {
    if (!ownerId) { setHesaplar([]); return; }
    setLoading(true);
    setHata(null);
    try {
      setHesaplar(await hesaplariListele(ownerId, customerId));
    } catch (e: any) {
      setHata(e?.message || "Hesaplar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [ownerId, customerId]);

  useEffect(() => { getir(); }, [getir]);

  const ekle = useCallback(
    async (p: { platform: SmPlatform; handle: string; url?: string; hesap_tipi?: string }) => {
      if (!ownerId) throw new Error("Oturum bulunamadı.");
      const yeni = await hesapEkle({ ownerId, customerId, ...p });
      setHesaplar((önce) => [...önce, yeni]);
      return yeni;
    },
    [ownerId, customerId],
  );

  const guncelle = useCallback(async (id: string, yama: Parameters<typeof hesapGuncelle>[1]) => {
    const yeni = await hesapGuncelle(id, yama);
    setHesaplar((önce) => önce.map((h) => (h.id === id ? yeni : h)));
    return yeni;
  }, []);

  const sil = useCallback(async (id: string) => {
    await hesapSil(id);
    setHesaplar((önce) => önce.filter((h) => h.id !== id));
  }, []);

  const dogrula = useCallback(async (id: string) => {
    setDogrulanan(id);
    try {
      const sonuc = await hesapDogrula(id);
      // Edge fonksiyonu sm_accounts'u zaten güncelledi; listeyi tazele.
      await getir();
      return sonuc;
    } finally {
      setDogrulanan(null);
    }
  }, [getir]);

  /**
   * OAuth'u yeni sekmede açar, bağlantı ACTIVE olana kadar yoklar, sonra
   * doğrular. Kullanıcı sekmeyi kapatırsa yoklama zaman aşımına düşer —
   * "Doğrula"ya elle basarak da devam edebilir.
   */
  const bagla = useCallback(async (id: string) => {
    setDogrulanan(id);
    try {
      const { url } = await baglantiBaslat(id);
      const pencere = window.open(url, "_blank", "noopener,noreferrer");
      if (!pencere) throw new Error("Açılır pencere engellendi — tarayıcı iznini verin.");

      // ~2 dk boyunca 3 sn'de bir yokla.
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const { durum } = await baglantiDurumu(id).catch(() => ({ durum: "" } as any));
        if (durum === "ACTIVE") {
          const sonuc = await hesapDogrula(id);
          await getir();
          return sonuc;
        }
        if (durum === "FAILED" || durum === "EXPIRED") {
          throw new Error("Bağlantı tamamlanmadı. Yeniden deneyin.");
        }
      }
      throw new Error("Bağlantı zaman aşımına uğradı. Tamamladıysanız “Doğrula”ya basın.");
    } finally {
      setDogrulanan(null);
      await getir();
    }
  }, [getir]);

  const kopar = useCallback(async (id: string) => {
    await baglantiyiKopar(id);
    await getir();
  }, [getir]);

  return { hesaplar, loading, hata, dogrulanan, getir, ekle, guncelle, sil, bagla, dogrula, kopar };
}

/** Müşteri seçici için companies listesi. */
export function useSmMusteriler(ownerId: string | undefined) {
  const [musteriler, setMusteriler] = useState<SmMusteri[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ownerId) { setMusteriler([]); return; }
    let iptal = false;
    setLoading(true);
    musterileriListele(ownerId)
      .then((liste) => { if (!iptal) setMusteriler(liste); })
      .catch(() => { if (!iptal) setMusteriler([]); })
      .finally(() => { if (!iptal) setLoading(false); });
    return () => { iptal = true; };
  }, [ownerId]);

  return { musteriler, loading };
}
