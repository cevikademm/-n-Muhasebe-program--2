import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseService";
import { Modul, MODULLER } from "./moduller";

export interface ModulSatiri {
  modul: Modul;
  durum: "aktif" | "pasif";
  bitis: string | null;
  kaynak: string;
}

export interface ModulTalebi {
  id: string;
  modul: Modul;
  durum: "bekliyor" | "onaylandi" | "reddedildi";
  created_at: string;
  karar_notu: string | null;
}

export interface ModulDurumu {
  /** Şu an erişilebilir modüller. Yüklenme bitene kadar boş. */
  acik: Set<Modul>;
  /** Bitiş tarihleri dahil ham satırlar — "Paketlerim" ekranı kullanır. */
  satirlar: ModulSatiri[];
  talepler: ModulTalebi[];
  yukleniyor: boolean;
  /** Kullanıcı admin ise her modül açıktır (RLS'teki is_admin() ile aynı kural). */
  modulAcik: (m: Modul) => boolean;
  talepEt: (m: Modul, mesaj?: string) => Promise<{ ok: boolean; hata?: string }>;
  yenile: () => void;
}

/**
 * Kullanıcının açık modüllerini okur ve canlı takip eder.
 *
 * RLS gereği `kullanici_modulleri` zaten yalnızca kendi satırlarını (staff ise
 * bağlı olduğu sahibin satırlarını) döndürür — burada ayrıca filtre gerekmez.
 * Bu, alt kullanıcının sahibinin paketlerini devralmasını da kendiliğinden
 * sağlar.
 *
 * Realtime abonelik: admin panelden bir paket açtığında kullanıcının ekranı
 * sayfa yenilemeden güncellenir (profiles.role için kullanılan kalıbın aynısı).
 */
export function useModuller(session: any, userRole: string): ModulDurumu {
  const uid: string | undefined = session?.user?.id;
  const isAdmin = userRole === "admin";

  const [satirlar, setSatirlar] = useState<ModulSatiri[]>([]);
  const [talepler, setTalepler] = useState<ModulTalebi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [sayac, setSayac] = useState(0);

  const yenile = useCallback(() => setSayac((n) => n + 1), []);

  useEffect(() => {
    if (!uid) {
      setSatirlar([]);
      setTalepler([]);
      setYukleniyor(false);
      return;
    }
    let iptal = false;
    setYukleniyor(true);

    (async () => {
      const [{ data: modulData }, { data: talepData }] = await Promise.all([
        supabase
          .from("kullanici_modulleri")
          .select("modul, durum, bitis, kaynak"),
        supabase
          .from("modul_talepleri")
          .select("id, modul, durum, created_at, karar_notu")
          .order("created_at", { ascending: false }),
      ]);
      if (iptal) return;
      setSatirlar((modulData || []) as ModulSatiri[]);
      setTalepler((talepData || []) as ModulTalebi[]);
      setYukleniyor(false);
    })();

    return () => { iptal = true; };
  }, [uid, sayac]);

  // Paket açılıp kapandığında anında yansısın.
  useEffect(() => {
    if (!uid) return;
    const kanal = supabase
      .channel(`moduller-${uid}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "kullanici_modulleri" },
        () => yenile())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "modul_talepleri", filter: `user_id=eq.${uid}` },
        () => yenile())
      .subscribe();
    return () => { try { supabase.removeChannel(kanal); } catch {} };
  }, [uid, yenile]);

  const acik = useMemo(() => {
    // Admin'in RLS'te modül kapısı yok; arayüz de aynı kuralı izlemeli, aksi
    // halde admin veriyi görebilir ama menüsü gizli kalırdı.
    if (isAdmin) return new Set<Modul>(MODULLER);
    const simdi = Date.now();
    const s = new Set<Modul>();
    for (const r of satirlar) {
      if (r.durum !== "aktif") continue;
      if (r.bitis && new Date(r.bitis).getTime() <= simdi) continue;
      s.add(r.modul);
    }
    return s;
  }, [satirlar, isAdmin]);

  const modulAcik = useCallback((m: Modul) => acik.has(m), [acik]);

  const talepEt = useCallback(async (m: Modul, mesaj?: string) => {
    if (!uid) return { ok: false, hata: "Oturum bulunamadı." };
    const { error } = await supabase.from("modul_talepleri").insert({
      user_id: uid,
      modul: m,
      durum: "bekliyor",
      mesaj: mesaj?.trim() || null,
    });
    if (error) {
      // Partial unique index: aynı modül için ikinci bekleyen talep engellenir.
      const zaten = /duplicate key|unique/i.test(error.message || "");
      return { ok: false, hata: zaten ? "Bu paket için zaten bekleyen bir talebiniz var." : error.message };
    }
    yenile();
    return { ok: true };
  }, [uid, yenile]);

  return { acik, satirlar, talepler, yukleniyor, modulAcik, talepEt, yenile };
}
