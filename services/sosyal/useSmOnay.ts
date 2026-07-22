// ──────────────────────────────────────────────────────────────────
// useSmOnay — onay kutusu state'i
// ──────────────────────────────────────────────────────────────────
// Higgsfield üretimi kütüphaneye `durum='onayda'` düşer ve YAYINA GİTMEZ.
// Bu hook o bekleyenleri, bağlı takvim satırlarını ve bağlı hesapları bir
// arada tutar; onaylandığında MEVCUT yayın hattını (sm-publish) çağırır —
// yeni bir yayınlama yolu açılmaz.
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseService";
import { medyaListele, medyaGuncelle, medyaUrlleri } from "./smMediaService";
import { hesaplariListele } from "./smAccountService";
import { yayinla } from "./smPublishService";
import {
  postlariGetir, postuYayinlandiIsaretle, postuGeriAl, isleriListele, isiSifirla,
} from "./smUretimService";
import type {
  SmMedya, SmPost, SmHesap, SmYayin, SmYayinHedefi, SmUretimIsi, MusteriId,
} from "./types";

export function useSmOnay(ownerId: string | undefined, customerId: MusteriId) {
  const [medyalar, setMedyalar] = useState<SmMedya[]>([]);
  const [urller, setUrller] = useState<Record<string, string>>({});
  const [postlar, setPostlar] = useState<Record<string, SmPost>>({});
  const [hesaplar, setHesaplar] = useState<SmHesap[]>([]);
  const [isler, setIsler] = useState<SmUretimIsi[]>([]);
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  /** O an işlenen medya id'si — kart bazlı buton kilidi için. */
  const [islenen, setIslenen] = useState<string | null>(null);

  const getir = useCallback(async () => {
    if (!ownerId) {
      setMedyalar([]); setUrller({}); setPostlar({}); setHesaplar([]); setIsler([]);
      return;
    }
    setLoading(true);
    setHata(null);
    try {
      const [bekleyen, hesapListe, isListe] = await Promise.all([
        medyaListele(ownerId, customerId, { durum: "onayda" }),
        hesaplariListele(ownerId, customerId),
        // Kuyruğun "hâlâ üretiliyor" kısmı: onay kutusu boşken kullanıcı
        // "hiç iş yok mu?" diye düşünmesin diye ayrıca gösterilir.
        isleriListele(ownerId, customerId, {
          durumlar: ["bekliyor", "alindi", "uretiliyor", "hata"],
        }),
      ]);

      setMedyalar(bekleyen);
      setHesaplar(hesapListe);
      setIsler(isListe);
      setUrller(await medyaUrlleri(bekleyen));
      setPostlar(
        await postlariGetir(bekleyen.map((m) => m.post_id).filter(Boolean) as string[]),
      );
    } catch (e: any) {
      setHata(e?.message || "Onay kutusu okunamadı.");
    } finally {
      setLoading(false);
    }
  }, [ownerId, customerId]);

  useEffect(() => { getir(); }, [getir]);

  /** Yayınlamaya gerçekten hazır (doğrulanmış) hesaplar. */
  const bagliHesaplar = useMemo(
    () => hesaplar.filter((h) => h.dogrulandi),
    [hesaplar],
  );

  /**
   * Onayla ve yayınla.
   *
   * Sıra bilinçli: önce `onaylandi`, sonra yayın. Yayın patlarsa medya
   * `onaylandi` kalır (onay kararı kullanıcınındı, geri alınmaz) ve kullanıcı
   * Yayın Kuyruğu sekmesinden tekrar deneyebilir — üretim baştan yapılmaz.
   */
  const onayla = useCallback(
    async (medya: SmMedya, hedefler: SmYayinHedefi[]): Promise<SmYayin[]> => {
      if (!hedefler.length) throw new Error("Yayınlanacak hedef yok.");
      setIslenen(medya.id);
      setHata(null);
      try {
        await medyaGuncelle(medya.id, { durum: "onaylandi" });
        // Onaylanan kart listeden hemen düşsün — yayın sonucu Yayın
        // Kuyruğu'nda izlenir.
        setMedyalar((önce) => önce.filter((m) => m.id !== medya.id));

        const { yayinlar } = await yayinla({ mediaId: medya.id, hedefler });

        if (medya.post_id) {
          const urlHarita: Record<string, string> = {};
          for (const y of yayinlar) if (y.yayin_url) urlHarita[y.platform] = y.yayin_url;
          // Video işlenmesi sürüyorsa URL'ler henüz boş olabilir; takvim
          // satırı yine de "yayınlandı" sayılır, URL'ler kuyruktan okunur.
          await postuYayinlandiIsaretle(medya.post_id, urlHarita).catch(() => {});
        }
        return yayinlar;
      } catch (e: any) {
        setHata(e?.message || "Yayınlanamadı.");
        await getir();
        throw e;
      } finally {
        setIslenen(null);
      }
    },
    [getir],
  );

  /**
   * Reddet: medya arşive kalkar, takvim satırı yeniden "fikir" olur ve
   * üretim işi (varsa) kuyruğa geri konur → bir sonraki üretim turunda
   * yeniden denenir.
   */
  const reddet = useCallback(
    async (medya: SmMedya, yenidenUret = true) => {
      setIslenen(medya.id);
      setHata(null);
      try {
        await medyaGuncelle(medya.id, { durum: "arsiv" });
        setMedyalar((önce) => önce.filter((m) => m.id !== medya.id));

        if (yenidenUret) {
          if (medya.post_id) await postuGeriAl(medya.post_id).catch(() => {});
          const is = isler.find((i) => i.media_id === medya.id)
            || isler.find((i) => i.post_id && i.post_id === medya.post_id);
          if (is) await isiSifirla(is.id).catch(() => {});
        }
      } catch (e: any) {
        setHata(e?.message || "Reddedilemedi.");
        await getir();
      } finally {
        setIslenen(null);
      }
    },
    [isler, getir],
  );

  return {
    medyalar, urller, postlar, hesaplar: bagliHesaplar, isler,
    loading, hata, islenen,
    getir, onayla, reddet,
    bekleyenSayisi: medyalar.length,
  };
}

/**
 * Sekme rozeti için yalnızca SAYI. Kabuk (SosyalMedyaPanel) bunun için
 * useSmOnay'ı çağırmaz: o hook medyayı, imzalı URL'leri, takvimi ve
 * hesapları da çeker — rozet uğruna dört istek atılmaz.
 */
export function useSmOnaySayaci(ownerId: string | undefined, customerId: MusteriId) {
  const [sayi, setSayi] = useState(0);

  const getir = useCallback(async () => {
    if (!ownerId) { setSayi(0); return; }
    let q = supabase
      .from("sm_media")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ownerId)
      .eq("durum", "onayda");
    q = (customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId)) as any;

    const { count } = await q;
    setSayi(count ?? 0);
  }, [ownerId, customerId]);

  useEffect(() => { getir(); }, [getir]);

  return { sayi, getir };
}
