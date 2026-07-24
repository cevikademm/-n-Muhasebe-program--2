// ──────────────────────────────────────────────────────────────────
// useSmSeo — SEO ajanı profili, anahtar kelimeler ve öneriler
// ──────────────────────────────────────────────────────────────────
// useSmOtomasyon ile aynı şekil: otomasyon paneli ayarları buradan okur,
// yayın modali ise yalnızca `oneriGetir` ile cache'e bakar.
import { useState, useEffect, useCallback } from "react";
import {
  profilAl, profilKaydet, trendTara, havuzUret, oneriUret, oneriAl,
} from "./smSeoService";
import type {
  MusteriId, SmSeoProfil, SmSeoProfilGirdi, SmSeoAnahtar, SmSeoOneri,
} from "./types";

/** Sunucudaki VARSAYILAN_PROFIL ile aynı — form boş açılmasın. */
export const VARSAYILAN_SEO_PROFIL: SmSeoProfil = {
  sektor: null,
  hedef_kitle: null,
  bolge: "DE",
  diller: ["de"],
  marka_sesi: null,
  cekirdek_kelimeler: [],
  yasakli_kelimeler: [],
  rakip_hesaplar: [],
  cta_havuzu: [],
  hashtag_modu: "havuz",
  baslik_uret: true,
  otomatik_uret: true,
};

export function useSmSeo(ownerId: string | undefined, customerId: MusteriId) {
  const [profil, setProfil] = useState<SmSeoProfil>(VARSAYILAN_SEO_PROFIL);
  const [anahtarlar, setAnahtarlar] = useState<SmSeoAnahtar[]>([]);
  const [loading, setLoading] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  /** Canlı web araması çalışıyor mu — düğmeler kilitlenir. */
  const [uretiliyor, setUretiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const getir = useCallback(async () => {
    if (!ownerId) { setProfil(VARSAYILAN_SEO_PROFIL); setAnahtarlar([]); return; }
    setLoading(true);
    setHata(null);
    try {
      const c = await profilAl(customerId);
      setProfil({ ...VARSAYILAN_SEO_PROFIL, ...(c.profil ?? {}) });
      setAnahtarlar(c.anahtarlar ?? []);
    } catch (e: any) {
      setHata(e?.message || "SEO ayarları okunamadı.");
    } finally {
      setLoading(false);
    }
  }, [ownerId, customerId]);

  useEffect(() => { getir(); }, [getir]);

  const kaydet = useCallback(async (yama: SmSeoProfilGirdi) => {
    if (!ownerId) throw new Error("Oturum bulunamadı.");
    setKaydediliyor(true);
    setHata(null);
    try {
      const c = await profilKaydet(customerId, yama);
      setProfil({ ...VARSAYILAN_SEO_PROFIL, ...(c.profil ?? {}) });
      return c.profil;
    } catch (e: any) {
      setHata(e?.message || "Kaydedilemedi.");
      throw e;
    } finally {
      setKaydediliyor(false);
    }
  }, [ownerId, customerId]);

  const tara = useCallback(async (opts: { adet?: number; platformlar?: string[] } = {}) => {
    if (!ownerId) throw new Error("Oturum bulunamadı.");
    setUretiliyor(true);
    setHata(null);
    try {
      const c = await trendTara(customerId, opts);
      await getir();                       // yeni kelimeler listeye düşsün
      return c;
    } catch (e: any) {
      setHata(e?.message || "Trend taraması yapılamadı.");
      throw e;
    } finally {
      setUretiliyor(false);
    }
  }, [ownerId, customerId, getir]);

  const havuz = useCallback(async (opts: { uygula?: boolean; platform?: string } = {}) => {
    if (!ownerId) throw new Error("Oturum bulunamadı.");
    setUretiliyor(true);
    setHata(null);
    try {
      return await havuzUret(customerId, opts);
    } catch (e: any) {
      setHata(e?.message || "Havuz üretilemedi.");
      throw e;
    } finally {
      setUretiliyor(false);
    }
  }, [ownerId, customerId]);

  return {
    profil, anahtarlar, loading, kaydediliyor, uretiliyor, hata,
    getir, kaydet, tara, havuz,
  };
}

/**
 * Tek bir medyanın SEO önerileri — yayın modali için.
 *
 * İki yol:
 *   · Otomatik (`oto`): profil "gonderi" + otomatik üretim açıksa modal
 *     açılır açılmaz cache'e bakılır, boşsa BİR KEZ üretilir.
 *   · Elle (`uret`):    kullanıcı "AI ile üret" düğmesine basınca çağrılır;
 *     moddan bağımsız çalışır ve üretilen satırları döndürür ki modal her
 *     hedefin caption'ını doldursun.
 *
 * `oto` kapalıyken de mevcut öneri (varsa) sessizce yüklenir — önceden
 * üretilmiş metin kaybolmasın.
 */
export function useSmSeoOneri(
  ownerId: string | undefined,
  customerId: MusteriId,
  mediaId: string | undefined,
  opts: { oto: boolean; platformlar: string[]; format?: string | null },
) {
  const [oneriler, setOneriler] = useState<SmSeoOneri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const { oto, format } = opts;
  // Dizi referansı her render'da değişiyor → efekt döngüsüne girmesin diye
  // bağımlılık olarak sıralı metin hâli kullanılır.
  const platformAnahtari = [...opts.platformlar].sort().join(",");

  /** Elle tetikleme — üretilen satırları döndürür. `yenile` cache'i ezip yeniden üretir. */
  const uret = useCallback(async (yenile = false): Promise<SmSeoOneri[]> => {
    if (!ownerId || !mediaId || !platformAnahtari) return [];
    setYukleniyor(true);
    setHata(null);
    try {
      const c = await oneriUret(customerId, {
        mediaId, platformlar: platformAnahtari.split(","), format: format ?? null, yenile,
      });
      setOneriler(c.oneriler ?? []);
      return c.oneriler ?? [];
    } catch (e: any) {
      setHata(e?.message || "Metin önerisi hazırlanamadı.");
      return [];
    } finally {
      setYukleniyor(false);
    }
  }, [ownerId, customerId, mediaId, platformAnahtari, format]);

  // Otomatik üretim (gonderi + otomatik): cache-first, boşsa üret.
  useEffect(() => {
    let iptal = false;
    if (!ownerId || !mediaId || !oto || !platformAnahtari) return;
    (async () => {
      setYukleniyor(true);
      setHata(null);
      try {
        const mevcut = await oneriAl(customerId, { mediaId });
        if (iptal) return;
        if (mevcut.oneriler?.length) { setOneriler(mevcut.oneriler); return; }
        const uretilen = await oneriUret(customerId, {
          mediaId, platformlar: platformAnahtari.split(","), format: format ?? null,
        });
        if (!iptal) setOneriler(uretilen.oneriler ?? []);
      } catch (e: any) {
        if (!iptal) setHata(e?.message || "Metin önerisi hazırlanamadı.");
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [ownerId, customerId, mediaId, oto, platformAnahtari, format]);

  // Otomatik değilken de mevcut öneriyi sessizce yükle (yeniden üretmeden).
  useEffect(() => {
    let iptal = false;
    if (!ownerId || !mediaId || oto) return;
    (async () => {
      try {
        const c = await oneriAl(customerId, { mediaId });
        if (!iptal && c.oneriler?.length) setOneriler(c.oneriler);
      } catch { /* sessiz — düğme hâlâ elle üretebilir */ }
    })();
    return () => { iptal = true; };
  }, [ownerId, customerId, mediaId, oto]);

  /** Bu platform+format için geçerli öneri; yoksa null. */
  const oneriBul = useCallback(
    (platform: string, fmt?: string | null): SmSeoOneri | null =>
      oneriler.find((o) => o.platform === platform && o.format === fmt)
      ?? oneriler.find((o) => o.platform === platform)
      ?? null,
    [oneriler],
  );

  return { oneriler, oneriBul, yukleniyor, hata, uret };
}
