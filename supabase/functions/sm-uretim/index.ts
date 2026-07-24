// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// sm-uretim  (JWT veya ajan secret)
// ──────────────────────────────────────────────────────────────────
// Üretim kuyruğunun TEK giriş kapısı. İki farklı çağıranı vardır:
//
//   1) Uygulama (tarayıcı)  → Authorization: Bearer <JWT>
//   2) Claude / MCP oturumu → x-ajan-secret: <SM_AJAN_SECRET> + body.ownerId
//
// (2) yolu neden var: Higgsfield'in tam Reels üretimi (klip + seslendirme +
// altyazılı birleştirme) yalnızca MCP tarafında mümkün. Claude'un tarayıcı
// oturumu yok, dolayısıyla JWT'si de yok; lead-inbound'daki INBOUND_SECRET
// deseninin aynısı kullanılır.
//
//   POST { action:"kuyruk",      motor?, limit? }        → bekleyen işler
//   POST { action:"is-al",       isId }                  → işi kilitle (bekliyor→alindi)
//   POST { action:"is-guncelle", isId, durum?, ... }     → ilerleme yaz
//   POST { action:"ice-aktar",   url, ... }              → üretimi kütüphaneye al
//   POST { action:"plan-uygula", gun? }                  → takvimden iş satırı üret
//
// ⚠ GÜVENLİK: secret yolunda service_role kullanılır ve RLS DEVREDE DEĞİLDİR.
// Bu yüzden her sorgu elle `user_id = ownerId` ile daraltılır. Bu filtreyi
// kaldırmak, secret'ı bilen birine tüm kiracıların verisini açar.
//
// Env: SM_AJAN_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, jsonYanit } from "../_shared/http.ts";

const BUCKET = "sm-media";

/** Kuyruk turunda tek seferde işlenecek en fazla iş. */
const KUYRUK_LIMIT = 20;

/** İndirilecek en büyük dosya (Edge Function belleğinden geçer). */
const MAKS_BOYUT = 300 * 1024 * 1024;

/**
 * services/sosyal/storage/StorageAdapter.ts → medyaYolu() ile AYNI desen.
 * Kaynak gerçek orasıdır; burada tekrarlanmasının sebebi Edge Function'ın
 * frontend modüllerini import edememesi.
 *
 * İlk segment ownerId OLMAK ZORUNDA: storage.objects RLS politikaları yolun
 * ilk parçasına bakıyor. Değiştirirsen kütüphane erişimi kırılır.
 */
function medyaYolu(ownerId: string, customerId: string | null, dosyaAdi: string): string {
  const guvenli = dosyaAdi
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/[^\w.\-]/g, "_")
    .slice(-120);
  return `${ownerId}/${customerId ?? "kendi"}/${Date.now()}_${guvenli}`;
}

const UZANTILAR: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
  "video/mp4": ".mp4", "video/quicktime": ".mov", "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a", "audio/wav": ".wav",
};

/**
 * Higgsfield sonuç URL'leri imzalı ve uzantısız olabiliyor; dosya adını
 * önce URL'den, olmazsa MIME'dan türet.
 */
function dosyaAdiUret(url: string, mime: string, baslik?: string): string {
  const yol = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  const sonPar = yol.split("/").pop() || "";
  if (/\.[a-z0-9]{2,4}$/i.test(sonPar)) return sonPar;
  const uzanti = UZANTILAR[mime.split(";")[0].trim()] || ".bin";
  return `${(baslik || "higgsfield").slice(0, 60)}${uzanti}`;
}

/**
 * Üretim kütüphaneye girer girmez SEO metnini hazırlatır.
 *
 * "gonderi" modunda değilse hiç çağrılmaz: havuz modunda etiketler zaten
 * yayın anında sm_otomasyon havuzundan deterministik seçiliyor, AI çağrısı
 * boşuna para harcardı.
 *
 * ⚠ Bu fonksiyon ASLA atmaz. Metin üretimi bir kolaylıktır; başarısız olursa
 * medya yine kütüphanede durur ve yayın havuz moduyla çalışır.
 */
async function seoOnerisiTetikle(admin: any, o: {
  ownerId: string; customerId: string | null; mediaId: string;
  format: string | null; ajanSecret: string; supabaseUrl: string;
}): Promise<void> {
  try {
    if (!o.ajanSecret || !o.supabaseUrl) return;

    let q = admin.from("sm_seo_profil")
      .select("hashtag_modu, otomatik_uret, diller").eq("user_id", o.ownerId);
    q = o.customerId == null ? q.is("customer_id", null) : q.eq("customer_id", o.customerId);
    const { data: profil } = await q.maybeSingle();
    if (!profil?.otomatik_uret || profil.hashtag_modu !== "gonderi") return;

    // Hangi platformlara üretileceği hesabın varlığına göre belirlenir:
    // bağlı olmayan platform için metin üretmek kredi israfı olurdu.
    let hq = admin.from("sm_accounts")
      .select("platform").eq("user_id", o.ownerId).eq("dogrulandi", true);
    hq = o.customerId == null ? hq.is("customer_id", null) : hq.eq("customer_id", o.customerId);
    const { data: hesaplar } = await hq;
    const platformlar = [...new Set((hesaplar ?? []).map((x: any) => x.platform))];
    if (!platformlar.length) return;

    const cevap = await fetch(`${o.supabaseUrl}/functions/v1/sm-seo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ajan-secret": o.ajanSecret },
      body: JSON.stringify({
        action: "oneri-uret",
        ownerId: o.ownerId,
        customerId: o.customerId,
        mediaId: o.mediaId,
        format: o.format,
        platformlar,
        diller: Array.isArray(profil.diller) && profil.diller.length ? [profil.diller[0]] : ["de"],
      }),
    });
    if (!cevap.ok) console.warn("[sm-uretim] SEO önerisi üretilemedi:", cevap.status);
  } catch (e) {
    console.warn("[sm-uretim] SEO önerisi tetiklenemedi:", e?.message || e);
  }
}

serve(async (req) => {
  const h = cors(req);
  const json = jsonYanit(h);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ success: false, error: "Sadece POST." }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const AJAN_SECRET = Deno.env.get("SM_AJAN_SECRET") ?? "";

    if (!SERVICE_ROLE) return json({ success: false, error: "Sunucu yapılandırma hatası." }, 500);

    const govde = await req.json().catch(() => ({}));
    const action = String(govde?.action ?? "");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // ── Kimlik: JWT ya da ajan secret ──────────────────────────────
    let ownerId = "";
    const gelenSecret = req.headers.get("x-ajan-secret") || "";
    const authHeader = req.headers.get("Authorization");

    if (AJAN_SECRET && gelenSecret) {
      // Sabit uzunlukta karşılaştırma gerekmez: secret tek parça, timing
      // saldırısı için binlerce deneme lazım ve Edge Function rate-limit'li.
      if (gelenSecret !== AJAN_SECRET) return json({ success: false, error: "Yetkisiz." }, 401);
      ownerId = String(govde?.ownerId ?? "");
      if (!ownerId) return json({ success: false, error: "ownerId gerekli." }, 400);
    } else if (authHeader) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) return json({ success: false, error: "Yetkisiz." }, 401);
      ownerId = data.user.id;
    } else {
      return json({ success: false, error: "Oturum bulunamadı." }, 401);
    }

    const customerId = govde?.customerId ?? null;
    /** Her sorguya uygulanan sahiplik filtresi — RLS'in yerini tutar. */
    const sahip = (q: any) => q.eq("user_id", ownerId);

    switch (action) {
      // ── kuyruk: bekleyen işler ───────────────────────────────────
      case "kuyruk": {
        const motor = govde?.motor ? String(govde.motor) : null;
        const limit = Math.min(Number(govde?.limit) || KUYRUK_LIMIT, 100);

        let q = admin
          .from("sm_uretim_isleri")
          .select("*, sm_posts(hook, format, planlanan_tarih, platformlar, caption_de)")
          .in("durum", govde?.durumlar ?? ["bekliyor"])
          .or(`planlanan.is.null,planlanan.lte.${new Date().toISOString()}`)
          .order("sira", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(limit);
        if (motor) q = q.eq("motor", motor);

        const { data, error } = await sahip(q);
        if (error) throw new Error(error.message);
        return json({ success: true, isler: data ?? [] });
      }

      // ── is-al: işi kilitle ───────────────────────────────────────
      // Koşullu update (durum='bekliyor') sayesinde iki oturum aynı işi
      // alamaz: ikincisi 0 satır günceller ve boş döner.
      case "is-al": {
        const isId = String(govde?.isId ?? "");
        if (!isId) return json({ success: false, error: "isId gerekli." }, 400);

        const { data, error } = await sahip(
          admin.from("sm_uretim_isleri")
            .update({ durum: "alindi" })
            .eq("id", isId)
            .eq("durum", "bekliyor"),
        ).select().maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) return json({ success: false, error: "İş başkası tarafından alınmış." }, 409);
        return json({ success: true, is: data });
      }

      // ── is-guncelle: ilerleme ────────────────────────────────────
      case "is-guncelle": {
        const isId = String(govde?.isId ?? "");
        if (!isId) return json({ success: false, error: "isId gerekli." }, 400);

        const yama: Record<string, unknown> = {};
        for (const alan of ["durum", "harici_job_id", "sonuc_url", "hata", "kredi", "model", "params"]) {
          if (govde?.[alan] !== undefined) yama[alan] = govde[alan];
        }
        if (govde?.denemeArtir) {
          const { data: mevcut } = await sahip(
            admin.from("sm_uretim_isleri").select("deneme").eq("id", isId),
          ).maybeSingle();
          yama.deneme = (mevcut?.deneme ?? 0) + 1;
        }
        if (!Object.keys(yama).length) return json({ success: false, error: "Güncellenecek alan yok." }, 400);

        const { data, error } = await sahip(
          admin.from("sm_uretim_isleri").update(yama).eq("id", isId),
        ).select().maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return json({ success: false, error: "İş bulunamadı." }, 404);
        return json({ success: true, is: data });
      }

      // ── ice-aktar: üretilen dosyayı kütüphaneye al ───────────────
      case "ice-aktar": {
        const url = String(govde?.url ?? "");
        if (!/^https?:\/\//i.test(url)) return json({ success: false, error: "Geçerli bir url gerekli." }, 400);

        const isId = govde?.isId ? String(govde.isId) : null;
        const meta = govde?.meta ?? {};
        const hariciJobId = govde?.harici_job_id ?? meta?.harici_job_id ?? null;

        // İş satırı varsa sahiplik ve bağlam oradan gelir.
        let is: any = null;
        if (isId) {
          const { data } = await sahip(
            admin.from("sm_uretim_isleri").select("*").eq("id", isId),
          ).maybeSingle();
          if (!data) return json({ success: false, error: "İş bulunamadı." }, 404);
          is = data;
        }

        const postId = govde?.postId ?? is?.post_id ?? null;
        const musteri = is ? is.customer_id : customerId;

        // Tekrar koruması: aynı job zaten içe aktarılmışsa yeni satır açma.
        if (hariciJobId) {
          const { data: eski } = await sahip(
            admin.from("sm_media").select("*").eq("harici_job_id", hariciJobId),
          ).maybeSingle();
          if (eski) return json({ success: true, medya: eski, tekrar: true });
        }

        // 1) İndir
        const cevap = await fetch(url);
        if (!cevap.ok) return json({ success: false, error: `Dosya indirilemedi (HTTP ${cevap.status}).` }, 502);

        const mime = meta?.mime_tipi || cevap.headers.get("content-type") || "application/octet-stream";
        const veri = new Uint8Array(await cevap.arrayBuffer());
        if (!veri.byteLength) return json({ success: false, error: "İndirilen dosya boş." }, 502);
        if (veri.byteLength > MAKS_BOYUT) {
          return json({ success: false, error: "Dosya çok büyük (300 MB üstü)." }, 413);
        }

        // 2) Depoya yaz (satırdan ÖNCE — smMediaService.medyaYukle ile aynı sıra)
        const yol = medyaYolu(ownerId, musteri, dosyaAdiUret(url, mime, meta?.baslik));
        const { error: yukleHatasi } = await admin.storage
          .from(BUCKET).upload(yol, veri, { contentType: mime, upsert: false });
        if (yukleHatasi) throw new Error(`Depoya yazılamadı: ${yukleHatasi.message}`);

        // 3) Satırı aç — patlarsa dosyayı geri al (öksüz nesne bırakma)
        const satir = {
          user_id: ownerId,
          customer_id: musteri,
          created_by: ownerId,
          depo_surucu: "supabase",
          depo_yolu: yol,
          baslik: meta?.baslik ?? is?.params?.baslik ?? "Higgsfield üretimi",
          aciklama: meta?.aciklama ?? null,
          prompt: meta?.prompt ?? is?.prompt ?? null,
          negative_prompt: meta?.negative_prompt ?? is?.negative_prompt ?? null,
          provider: meta?.provider ?? is?.saglayici ?? "higgsfield",
          model: meta?.model ?? is?.model ?? null,
          mime_tipi: mime,
          boyut: veri.byteLength,
          cozunurluk: meta?.cozunurluk ?? null,
          sure: meta?.sure ?? null,
          fps: meta?.fps ?? null,
          // Üretilen içerik DOĞRUDAN yayına gitmez: onay kutusuna düşer.
          durum: meta?.durum ?? "onayda",
          etiketler: meta?.etiketler ?? [],
          post_id: postId,
          harici_job_id: hariciJobId,
          kaynak_url: url,
        };

        const { data: medya, error: satirHatasi } = await admin
          .from("sm_media").insert(satir).select().single();

        if (satirHatasi) {
          await admin.storage.from(BUCKET).remove([yol]).catch(() => {});
          throw new Error(satirHatasi.message);
        }

        // 4) İşi kapat + takvim satırını "hazir" yap
        if (is) {
          await sahip(
            admin.from("sm_uretim_isleri")
              .update({ durum: "tamam", media_id: medya.id, sonuc_url: url, hata: null })
              .eq("id", is.id),
          );
        }
        // Takvim satırı "hazir"a çekilir ama YAYINLANDI sayılmaz — arada onay var.
        if (postId) {
          await sahip(
            admin.from("sm_posts")
              .update({ durum: "hazir", higgsfield_job: hariciJobId })
              .eq("id", postId).in("durum", ["fikir", "uretimde"]),
          );
        }

        // 5) SEO metni: içerik onay kutusuna düşmeden ÖNCE hazırlansın ki
        // kullanıcı onaylarken caption/başlık zaten yazılmış olsun. Beklenmez
        // ve hata içe aktarmayı BOZMAZ — metin yoksa sistem havuz moduna düşer.
        await seoOnerisiTetikle(admin, {
          ownerId, customerId: musteri, mediaId: medya.id,
          format: is?.params?.format ?? null,
          ajanSecret: AJAN_SECRET, supabaseUrl: SUPABASE_URL,
        });

        return json({ success: true, medya });
      }

      // ── plan-uygula: takvimden iş satırı üret ────────────────────
      // Aynı gönderi için iş zaten varsa YENİDEN AÇILMAZ; bu uç tekrar
      // çağrılabilir (cron her turda çağıracak).
      case "plan-uygula": {
        const gun = Math.min(Number(govde?.gun) || 7, 60);
        const motor = String(govde?.motor ?? "mcp");
        const sinir = new Date(Date.now() + gun * 86400_000).toISOString();

        const { data: postlar, error } = await sahip(
          admin.from("sm_posts")
            .select("id, customer_id, format, hook, planlanan_tarih")
            .in("durum", ["fikir"])
            .lte("planlanan_tarih", sinir)
            .order("planlanan_tarih", { ascending: true })
            .limit(50),
        );
        if (error) throw new Error(error.message);

        const adaylar = postlar ?? [];
        if (!adaylar.length) return json({ success: true, acilan: 0, isler: [] });

        const { data: mevcut } = await sahip(
          admin.from("sm_uretim_isleri").select("post_id")
            .in("post_id", adaylar.map((p: any) => p.id)),
        );
        const varOlan = new Set((mevcut ?? []).map((r: any) => r.post_id));

        const yeni = adaylar
          .filter((p: any) => !varOlan.has(p.id))
          .map((p: any) => ({
            user_id: ownerId,
            customer_id: p.customer_id ?? null,
            post_id: p.id,
            // Video formatları tam Reels zinciri ister → MCP motoru.
            tur: ["reel", "short", "uzun_video"].includes(p.format) ? "reels" : "gorsel",
            motor,
            planlanan: p.planlanan_tarih,
            params: { hook: p.hook, format: p.format },
          }));

        if (!yeni.length) return json({ success: true, acilan: 0, isler: [] });

        const { data: eklenen, error: ekleHatasi } = await admin
          .from("sm_uretim_isleri").insert(yeni).select();
        if (ekleHatasi) throw new Error(ekleHatasi.message);

        await sahip(
          admin.from("sm_posts").update({ durum: "uretimde" })
            .in("id", yeni.map((y: any) => y.post_id)),
        );

        return json({ success: true, acilan: eklenen?.length ?? 0, isler: eklenen ?? [] });
      }

      default:
        return json({ success: false, error: `Bilinmeyen action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("sm-uretim hatası:", e);
    return json({ success: false, error: e?.message || "Beklenmeyen hata." }, 500);
  }
});
