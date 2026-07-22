// ──────────────────────────────────────────────────────────────────
// useSmOtomasyon — otomatik hashtag + ilk yorum kuralı
// ──────────────────────────────────────────────────────────────────
// Hem ayar ekranı hem de yayın modali (önizleme için) bu hook'u kullanır:
// modalde gösterilen "şunlar eklenecek" listesi ile sunucunun gerçekten
// ekleyeceği metin aynı kuraldan türer.
import { useState, useEffect, useCallback } from "react";
import { otomasyonListele, otomasyonKaydet } from "./smOtomasyonService";
import { kuralCoz, VARSAYILAN_KURAL } from "./otomasyonMetin";
import type { OtomasyonKurali } from "./otomasyonMetin";
import type { SmOtomasyon, SmOtomasyonGirdi, MusteriId } from "./types";

export function useSmOtomasyon(ownerId: string | undefined, customerId: MusteriId) {
  const [kurallar, setKurallar] = useState<SmOtomasyon[]>([]);
  const [loading, setLoading] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const getir = useCallback(async () => {
    if (!ownerId) { setKurallar([]); return; }
    setLoading(true);
    setHata(null);
    try {
      setKurallar(await otomasyonListele(ownerId, customerId));
    } catch (e: any) {
      setHata(e?.message || "Otomasyon ayarları okunamadı.");
    } finally {
      setLoading(false);
    }
  }, [ownerId, customerId]);

  useEffect(() => { getir(); }, [getir]);

  /** Markanın genel ("*") kuralı; hiç kayıt yoksa null. */
  const genel = kurallar.find((k) => k.platform === "*") ?? null;

  const kaydet = useCallback(async (yama: SmOtomasyonGirdi, platform = "*") => {
    if (!ownerId) throw new Error("Oturum bulunamadı.");
    setKaydediliyor(true);
    setHata(null);
    try {
      const yeni = await otomasyonKaydet(ownerId, customerId, yama, platform);
      setKurallar((önce) => {
        const kalan = önce.filter((k) => k.id !== yeni.id && k.platform !== yeni.platform);
        return [...kalan, yeni].sort((a, b) => a.platform.localeCompare(b.platform));
      });
      return yeni;
    } catch (e: any) {
      setHata(e?.message || "Kaydedilemedi.");
      throw e;
    } finally {
      setKaydediliyor(false);
    }
  }, [ownerId, customerId]);

  /** Bir platform için yürürlükteki kural — kayıt yoksa "kapalı" davranış. */
  const kuralAl = useCallback(
    (platform: string): OtomasyonKurali =>
      kuralCoz<SmOtomasyon>(kurallar, platform) ?? VARSAYILAN_KURAL,
    [kurallar],
  );

  return { kurallar, genel, kuralAl, loading, kaydediliyor, hata, getir, kaydet };
}
