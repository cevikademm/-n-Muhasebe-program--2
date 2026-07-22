// ──────────────────────────────────────────────────────────────────
// useSmYayin — yayın kuyruğu state'i + otomatik ilerletme
// ──────────────────────────────────────────────────────────────────
// Instagram videoyu 30-120 sn işleyebiliyor ve Edge Function o kadar
// bekleyemiyor. Açık (kuyrukta/yayinlaniyor) iş kaldığı sürece bu hook
// periyodik olarak `kontrol` çağırıp işi ilerletir; hepsi bitince durur.
import { useState, useEffect, useCallback, useRef } from "react";
import {
  yayinlariListele, yayinla, yayinlariKontrolEt, yeniden, iptalEt,
  yayinKaydiSil, acikMi,
} from "./smPublishService";
import type { SmYayin, SmYayinHedefi, MusteriId } from "./types";

/** Açık iş varken kaç saniyede bir kontrol edilecek. */
const KONTROL_ARALIGI_MS = 9000;

export function useSmYayin(ownerId: string | undefined, customerId: MusteriId) {
  const [yayinlar, setYayinlar] = useState<SmYayin[]>([]);
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const zamanlayici = useRef<number | null>(null);
  const sokuldu = useRef(false);

  useEffect(() => {
    sokuldu.current = false;
    return () => {
      sokuldu.current = true;
      if (zamanlayici.current) window.clearTimeout(zamanlayici.current);
    };
  }, []);

  /** Gelen satırları listeye kaynaştırır (varsa günceller, yoksa başa ekler). */
  const kaynastir = useCallback((gelen: SmYayin[]) => {
    if (!gelen?.length) return;
    setYayinlar((önce) => {
      const harita = new Map<string, SmYayin>(önce.map((y) => [y.id, y] as const));
      for (const y of gelen) harita.set(y.id, y);
      return Array.from(harita.values()).sort(
        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      );
    });
  }, []);

  const getir = useCallback(async () => {
    if (!ownerId) { setYayinlar([]); return; }
    setLoading(true);
    setHata(null);
    try {
      setYayinlar(await yayinlariListele(ownerId, customerId));
    } catch (e: any) {
      setHata(e?.message || "Yayın kuyruğu okunamadı.");
    } finally {
      setLoading(false);
    }
  }, [ownerId, customerId]);

  useEffect(() => { getir(); }, [getir]);

  // ── Açık işleri ilerletme döngüsü ────────────────────────────────
  const acikIdler = yayinlar.filter(acikMi).map((y) => y.id).join(",");

  useEffect(() => {
    if (!acikIdler) return;
    let iptal = false;

    const tur = async () => {
      if (iptal || sokuldu.current) return;
      try {
        const { yayinlar: guncel } = await yayinlariKontrolEt(acikIdler.split(","));
        if (!iptal) kaynastir(guncel);
      } catch {
        // Ağ hatası döngüyü kırmasın; bir sonraki turda yine denenir.
      }
      if (!iptal && !sokuldu.current) {
        zamanlayici.current = window.setTimeout(tur, KONTROL_ARALIGI_MS);
      }
    };

    zamanlayici.current = window.setTimeout(tur, KONTROL_ARALIGI_MS);
    return () => {
      iptal = true;
      if (zamanlayici.current) window.clearTimeout(zamanlayici.current);
    };
  }, [acikIdler, kaynastir]);

  // ── Aksiyonlar ───────────────────────────────────────────────────

  const baslat = useCallback(
    async (mediaId: string, hedefler: SmYayinHedefi[], otomasyon = true) => {
      setGonderiliyor(true);
      setHata(null);
      try {
        const { yayinlar: yeni } = await yayinla({ mediaId, hedefler, otomasyon });
        kaynastir(yeni);
        return yeni;
      } catch (e: any) {
        setHata(e?.message || "Yayınlanamadı.");
        throw e;
      } finally {
        setGonderiliyor(false);
      }
    },
    [kaynastir],
  );

  const tekrarDene = useCallback(async (id: string) => {
    setHata(null);
    try {
      const { yayinlar: guncel } = await yeniden(id);
      kaynastir(guncel);
    } catch (e: any) {
      setHata(e?.message || "Yeniden denenemedi.");
    }
  }, [kaynastir]);

  const iptal = useCallback(async (id: string) => {
    setHata(null);
    try {
      await iptalEt(id);
      setYayinlar((önce) => önce.map((y) => (y.id === id ? { ...y, durum: "iptal" } : y)));
    } catch (e: any) {
      setHata(e?.message || "İptal edilemedi.");
    }
  }, []);

  const kaydiSil = useCallback(async (id: string) => {
    setHata(null);
    try {
      await yayinKaydiSil(id);
      setYayinlar((önce) => önce.filter((y) => y.id !== id));
    } catch (e: any) {
      setHata(e?.message || "Kayıt silinemedi.");
    }
  }, []);

  return {
    yayinlar, loading, hata, gonderiliyor,
    getir, baslat, tekrarDene, iptal, kaydiSil,
    calisiyor: yayinlar.some(acikMi),
  };
}
