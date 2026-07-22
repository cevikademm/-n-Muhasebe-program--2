// ──────────────────────────────────────────────────────────────────
// SupabaseStorageAdapter — StorageAdapter'ın ilk implementasyonu
// ──────────────────────────────────────────────────────────────────
import { supabase } from "../../supabaseService";
import {
  StorageAdapter, StorageHatasi, YuklemeSonucu, IlerlemeCb,
} from "./StorageAdapter";

export const SM_MEDIA_BUCKET = "sm-media";

/** İmzalı URL varsayılan ömrü. Galeri sekmesi açık kalırken yetsin diye 1 saat. */
const VARSAYILAN_SURE = 3600;

export class SupabaseStorageAdapter implements StorageAdapter {
  readonly surucu = "supabase";

  constructor(private readonly bucket: string = SM_MEDIA_BUCKET) {}

  async yukle(
    yol: string,
    dosya: File | Blob,
    opts?: { contentType?: string; onIlerleme?: IlerlemeCb },
  ): Promise<YuklemeSonucu> {
    // supabase-js v2'nin upload'ı ilerleme olayı yaymıyor; sözleşmeyi bozmamak
    // için başlangıç/bitiş bildirilir. Gerçek ilerleme için ileride
    // resumable (TUS) yükleme adaptörü eklenebilir.
    opts?.onIlerleme?.(0);

    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(yol, dosya, {
        contentType: opts?.contentType || (dosya as File).type || undefined,
        upsert: false,
      });

    if (error) throw new StorageHatasi(error.message, error);

    opts?.onIlerleme?.(100);
    return { yol };
  }

  async imzaliUrl(yol: string, saniye = VARSAYILAN_SURE): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(yol, saniye);
    if (error || !data?.signedUrl) {
      throw new StorageHatasi(error?.message || "İmzalı URL üretilemedi", error);
    }
    return data.signedUrl;
  }

  async imzaliUrlToplu(
    yollar: string[],
    saniye = VARSAYILAN_SURE,
  ): Promise<Record<string, string>> {
    if (!yollar.length) return {};

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrls(yollar, saniye);
    if (error) throw new StorageHatasi(error.message, error);

    const harita: Record<string, string> = {};
    for (const kayit of data || []) {
      // Toplu uçta tek tek satırlar hata verebilir (silinmiş dosya vb.);
      // tüm galeriyi düşürmek yerine o dosyayı atla.
      if (kayit?.path && kayit?.signedUrl) harita[kayit.path] = kayit.signedUrl;
    }
    return harita;
  }

  async sil(yollar: string[]): Promise<void> {
    if (!yollar.length) return;
    const { error } = await supabase.storage.from(this.bucket).remove(yollar);
    if (error) throw new StorageHatasi(error.message, error);
  }
}
