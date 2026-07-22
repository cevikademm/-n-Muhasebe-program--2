// ──────────────────────────────────────────────────────────────────
// useSmMedia — medya kütüphanesi state'i (useInvoices desenini izler)
// ──────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from "react";
import {
  medyaListele, medyaYukle, medyaGuncelle, medyaSil, medyaUrlleri,
} from "./smMediaService";
import type { SmMedya, SmMedyaFiltre, SmMedyaGirdi, MusteriId } from "./types";

export interface YuklemeDurumu {
  ad: string;
  yuzde: number;
  hata?: string;
}

export function useSmMedia(
  ownerId: string | undefined,
  customerId: MusteriId,
  filtre: SmMedyaFiltre,
) {
  const [medyalar, setMedyalar] = useState<SmMedya[]>([]);
  const [urller, setUrller] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [yuklemeler, setYuklemeler] = useState<YuklemeDurumu[]>([]);

  // Filtre nesnesi her render'da yeniden kurulduğu için bağımlılığa
  // referansı değil, serileştirilmiş halini veriyoruz.
  const filtreAnahtar = JSON.stringify(filtre);
  // Hızlı ardışık filtre değişimlerinde geç dönen isteğin taze sonucu
  // ezmesini engelle.
  const istekNo = useRef(0);

  const getir = useCallback(async () => {
    if (!ownerId) { setMedyalar([]); setUrller({}); return; }
    const benim = ++istekNo.current;
    setLoading(true);
    setHata(null);
    try {
      const liste = await medyaListele(ownerId, customerId, JSON.parse(filtreAnahtar));
      if (benim !== istekNo.current) return;
      setMedyalar(liste);
      const harita = await medyaUrlleri(liste);
      if (benim !== istekNo.current) return;
      setUrller(harita);
    } catch (e: any) {
      if (benim === istekNo.current) setHata(e?.message || "Medya yüklenemedi.");
    } finally {
      if (benim === istekNo.current) setLoading(false);
    }
  }, [ownerId, customerId, filtreAnahtar]);

  useEffect(() => { getir(); }, [getir]);

  const yukle = useCallback(
    async (dosyalar: File[], girdi?: SmMedyaGirdi) => {
      if (!ownerId || !dosyalar.length) return;

      setYuklemeler(dosyalar.map((d) => ({ ad: d.name, yuzde: 0 })));

      const ilerlemeYaz = (i: number, yama: Partial<YuklemeDurumu>) =>
        setYuklemeler((önce) => önce.map((y, ix) => (ix === i ? { ...y, ...yama } : y)));

      // Sıralı yükleme: tarayıcı ve Storage'ı aynı anda 20 dosyayla boğmamak,
      // ayrıca ilerlemeyi anlaşılır tutmak için.
      for (let i = 0; i < dosyalar.length; i++) {
        try {
          await medyaYukle({
            ownerId,
            customerId,
            createdBy: ownerId,
            dosya: dosyalar[i],
            girdi,
            onIlerleme: (y) => ilerlemeYaz(i, { yuzde: y }),
          });
          ilerlemeYaz(i, { yuzde: 100 });
        } catch (e: any) {
          // Bir dosyanın hatası kalanları durdurmasın.
          ilerlemeYaz(i, { hata: e?.message || "Yüklenemedi" });
        }
      }

      await getir();
      // Hatalı satırlar kullanıcı görsün diye kalır; temizler hepsi başarılıysa.
      setYuklemeler((önce) => (önce.some((y) => y.hata) ? önce : []));
    },
    [ownerId, customerId, getir],
  );

  const yuklemeleriTemizle = useCallback(() => setYuklemeler([]), []);

  const guncelle = useCallback(async (id: string, yama: SmMedyaGirdi) => {
    const yeni = await medyaGuncelle(id, yama);
    setMedyalar((önce) => önce.map((m) => (m.id === id ? yeni : m)));
    return yeni;
  }, []);

  const sil = useCallback(async (medya: SmMedya) => {
    await medyaSil(medya);
    setMedyalar((önce) => önce.filter((m) => m.id !== medya.id));
  }, []);

  const favoriDegistir = useCallback(
    (medya: SmMedya) => guncelle(medya.id, { favori: !medya.favori }),
    [guncelle],
  );

  return {
    medyalar, urller, loading, hata,
    yuklemeler, yuklemeleriTemizle,
    getir, yukle, guncelle, sil, favoriDegistir,
  };
}
