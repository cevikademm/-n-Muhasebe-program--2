// ──────────────────────────────────────────────────────────────────
// useSmAnaliz — analiz sekmesinin tek veri kaynağı
// ──────────────────────────────────────────────────────────────────
// Üç sorgu paralel gider ve BİRİ PATLASA DA diğerleri gösterilir: metrik
// tabloları henüz boş olabilir ama yayın özeti her zaman doludur; tek bir
// hata yüzünden bütün sekmeyi "yüklenemedi"ye düşürmek yanlış olurdu.
import { useState, useEffect, useCallback } from "react";
import {
  metrikGunleriGetir, gonderiSiralamasiGetir, yayinOzetiGetir, metrikleriSenkronla,
} from "./smAnalizService";
import type {
  SmMetrikGun, SmGonderiSirasi, SmYayinOzeti, MusteriId,
} from "./types";

const BOS_OZET: SmYayinOzeti = {
  toplam: 0, yayinlandi: 0, hata: 0, bekleyen: 0,
  yorumYazildi: 0, sonYayin: null, platformDagilimi: {} as any,
};

export function useSmAnaliz(
  ownerId: string | undefined,
  customerId: MusteriId,
  gun = 30,
) {
  const [metrikler, setMetrikler] = useState<SmMetrikGun[]>([]);
  const [siralama, setSiralama] = useState<SmGonderiSirasi[]>([]);
  const [ozet, setOzet] = useState<SmYayinOzeti>(BOS_OZET);
  const [loading, setLoading] = useState(false);
  const [senkronlaniyor, setSenkronlaniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [uyarilar, setUyarilar] = useState<string[]>([]);

  const getir = useCallback(async () => {
    if (!ownerId) {
      setMetrikler([]); setSiralama([]); setOzet(BOS_OZET);
      return;
    }
    setLoading(true);
    setHata(null);
    const [m, s, o] = await Promise.allSettled([
      metrikGunleriGetir(ownerId, customerId, gun),
      gonderiSiralamasiGetir(ownerId, customerId),
      yayinOzetiGetir(ownerId, customerId),
    ]);
    setMetrikler(m.status === "fulfilled" ? m.value : []);
    setSiralama(s.status === "fulfilled" ? s.value : []);
    setOzet(o.status === "fulfilled" ? o.value : BOS_OZET);
    // Yalnızca HEPSİ patlarsa gerçek bir hata var demektir.
    if (m.status === "rejected" && s.status === "rejected" && o.status === "rejected") {
      setHata((o.reason as Error)?.message || "Analiz verisi okunamadı.");
    }
    setLoading(false);
  }, [ownerId, customerId, gun]);

  useEffect(() => { getir(); }, [getir]);

  /** Instagram'dan taze ölçüm çeker, sonra listeyi tazeler. */
  const senkronla = useCallback(async (accountId?: string) => {
    setSenkronlaniyor(true);
    setHata(null);
    setUyarilar([]);
    try {
      const sonuc = await metrikleriSenkronla(accountId ? { accountId } : {});
      setUyarilar(sonuc.uyarilar ?? []);
      await getir();
      return sonuc;
    } catch (e: any) {
      setHata(e?.message || "Metrikler çekilemedi.");
      throw e;
    } finally {
      setSenkronlaniyor(false);
    }
  }, [getir]);

  return {
    metrikler, siralama, ozet,
    loading, senkronlaniyor, hata, uyarilar,
    getir, senkronla,
  };
}
