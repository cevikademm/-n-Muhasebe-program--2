import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseService";
import { SUPABASE_URL } from "../../constants";

/** kota-durumu fonksiyonunun döndürdüğü tek satır. Etiketler burada YOK. */
export interface KotaSatiri {
  anahtar: "instagram_yayin" | "apify" | "eposta" | string;
  /** null = okunamadı (durum "bilinmiyor"). */
  kullanilan: number | null;
  /** null = üst sınır tanımlı değil (sadece sayaç). */
  toplam: number | null;
  /** 24 = son 24 saat; null = aylık. */
  periyotSaat: number | null;
  durum: "ok" | "uyari" | "kritik" | "bilinmiyor";
  not?: string;
}

/**
 * Dış servislerin kalan kullanım hakkını çeker.
 *
 * Sayılar `kota-durumu` Edge Function'ından gelir — Composio/Apify anahtarları
 * sunucuda kalır, tarayıcıya asla düşmez. Bu yüzden doğrudan REST/RPC değil,
 * fonksiyon çağrısı kullanılıyor.
 */
export function useKota(otomatikYenileMs = 0) {
  const [kotalar, setKotalar] = useState<KotaSatiri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [guncelleme, setGuncelleme] = useState<string | null>(null);

  const yenile = useCallback(async () => {
    setHata(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setYukleniyor(false); return; }

      const r = await fetch(`${SUPABASE_URL}/functions/v1/kota-durumu`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: "{}",
      });
      const d = await r.json().catch(() => ({}));
      if (!d?.success) throw new Error(d?.error || "Kotalar alınamadı.");
      setKotalar(Array.isArray(d.kotalar) ? d.kotalar : []);
      setGuncelleme(d.guncelleme ?? null);
    } catch (e: any) {
      setHata(e?.message || String(e));
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { yenile(); }, [yenile]);

  // Instagram kotası 24 saatlik kayan pencere; panel açık kalırsa bayatlar.
  useEffect(() => {
    if (!otomatikYenileMs) return;
    const t = setInterval(yenile, otomatikYenileMs);
    return () => clearInterval(t);
  }, [otomatikYenileMs, yenile]);

  return { kotalar, yukleniyor, hata, guncelleme, yenile };
}
