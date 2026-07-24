// ──────────────────────────────────────────────────────────────────
// useSmTakvim — ay bazlı takvim state'i
// ──────────────────────────────────────────────────────────────────
// Ay değiştikçe yeniden çekilir; gün kovaları memo'lanır ki ızgara her
// karede 42 hücre × N öğe taramasın.
import { useState, useEffect, useCallback, useMemo } from "react";
import { takvimAyiGetir, gunlereBol, gunAnahtari } from "./smTakvimService";
import type { SmTakvimOgesi, MusteriId } from "./types";

export function useSmTakvim(ownerId: string | undefined, customerId: MusteriId) {
  const bugun = useMemo(() => new Date(), []);
  const [yil, setYil] = useState(bugun.getFullYear());
  const [ay, setAy] = useState(bugun.getMonth());

  const [ogeler, setOgeler] = useState<SmTakvimOgesi[]>([]);
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [uyarilar, setUyarilar] = useState<string[]>([]);

  const getir = useCallback(async () => {
    if (!ownerId) { setOgeler([]); return; }
    setLoading(true);
    setHata(null);
    try {
      const sonuc = await takvimAyiGetir(ownerId, customerId, yil, ay);
      setOgeler(sonuc.ogeler);
      setUyarilar(sonuc.uyarilar);
    } catch (e: any) {
      setHata(e?.message || "Takvim okunamadı.");
      setOgeler([]);
    } finally {
      setLoading(false);
    }
  }, [ownerId, customerId, yil, ay]);

  useEffect(() => { getir(); }, [getir]);

  const gunler = useMemo(() => gunlereBol(ogeler), [ogeler]);

  // Updater fonksiyonunun İÇİNDE ikinci bir setState çağrılmaz: React
  // updater'ı (StrictMode'da) iki kez çalıştırabilir ve yıl iki kat kayardı.
  const ayDegistir = useCallback((fark: number) => {
    const d = new Date(yil, ay + fark, 1);
    setYil(d.getFullYear());
    setAy(d.getMonth());
  }, [yil, ay]);

  const buguneDon = useCallback(() => {
    const d = new Date();
    setYil(d.getFullYear());
    setAy(d.getMonth());
  }, []);

  return {
    yil, ay, ogeler, gunler, loading, hata, uyarilar,
    getir, ayDegistir, buguneDon,
    bugunAnahtari: gunAnahtari(bugun),
  };
}
