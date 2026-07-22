// ──────────────────────────────────────────────────────────────────
// Depolama sürücüsü seçimi — tek giriş noktası
// ──────────────────────────────────────────────────────────────────
// Uygulamanın geri kalanı `medyaDepo` dışında hiçbir şey import etmez.
// S3'e geçiş: yeni bir adapter dosyası yaz, aşağıdaki switch'e bir satır
// ekle, VITE_SM_STORAGE_DRIVER=s3 yap. Çağıran kodda değişiklik olmaz.
import { StorageAdapter } from "./StorageAdapter";
import { SupabaseStorageAdapter } from "./supabaseStorage";

const SURUCU = (import.meta.env.VITE_SM_STORAGE_DRIVER as string) || "supabase";

function surucuSec(ad: string): StorageAdapter {
  switch (ad) {
    case "supabase":
      return new SupabaseStorageAdapter();
    default:
      // Yanlış env değeri sessizce yanlış bucket'a yazmaktansa erken patlasın.
      throw new Error(
        `Bilinmeyen depolama sürücüsü: "${ad}". VITE_SM_STORAGE_DRIVER değerini kontrol edin.`,
      );
  }
}

export const medyaDepo: StorageAdapter = surucuSec(SURUCU);

export { medyaYolu, StorageHatasi } from "./StorageAdapter";
export type { StorageAdapter, IlerlemeCb, YuklemeSonucu } from "./StorageAdapter";
export { SM_MEDIA_BUCKET } from "./supabaseStorage";
