// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// sm-seo  (JWT veya ajan secret)
// ──────────────────────────────────────────────────────────────────
// SEO ajanının tek giriş kapısı. sm-uretim ile aynı iki çağıranı vardır:
//
//   1) Uygulama (tarayıcı)  → Authorization: Bearer <JWT>
//   2) Cron / MCP oturumu   → x-ajan-secret: <SM_AJAN_SECRET> + body.ownerId
//
//   POST { action:"profil-al"     }                       → marka profili
//   POST { action:"profil-kaydet", profil }               → upsert
//   POST { action:"trend-tara",    adet?, platformlar? }  → anahtar kelime taraması
//   POST { action:"havuz-uret",    uygula? }              → hashtag havuzu (+ sm_otomasyon'a yaz)
//   POST { action:"oneri-uret",    mediaId|postId, ... }  → başlık/caption/etiket üret
//   POST { action:"oneri-al",      mediaId|postId }       → cache okuma
//
// ⚠ GÜVENLİK: secret yolunda service_role kullanılır ve RLS DEVREDE DEĞİLDİR.
// Bu yüzden her sorgu elle `user_id = ownerId` ile daraltılır. Bu filtreyi
// kaldırmak, secret'ı bilen birine tüm kiracıların verisini açar.
//
// ⚠ MALİYET: her `oneri-uret` / `trend-tara` çağrısı canlı web aramalı bir
// Claude çağrısıdır. `oneri-uret` bu yüzden ÖNCE cache'e bakar; aynı medya
// için ikinci kez para harcamaz (yenile:true ile zorlanır).
//
// Env: ANTHROPIC_API_KEY, SM_AJAN_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, jsonYanit } from "../_shared/http.ts";
import { seoCagrisi } from "../_shared/seo/claude.ts";
import { ONERI_SEMASI, ANAHTAR_SEMASI } from "../_shared/seo/semalar.ts";
import {
  TREND_SISTEM, trendKullanici, ONERI_SISTEM, oneriKullanici,
} from "../_shared/seo/prompt.ts";
import {
  kuralAl, hashtagleriTemizle, hashtagNormalize, kirp, tekille, yasakliIhlalleri,
} from "../_shared/seo/platformlar.ts";

/** Profil hiç kurulmamışsa ajanın çalışabildiği en az bağlam. */
const VARSAYILAN_PROFIL = {
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

const PROFIL_ALANLARI = [
  "sektor", "hedef_kitle", "bolge", "diller", "marka_sesi",
  "cekirdek_kelimeler", "yasakli_kelimeler", "rakip_hesaplar", "cta_havuzu",
  "hashtag_modu", "baslik_uret", "otomatik_uret",
];

const DESTEKLI_PLATFORMLAR = ["instagram", "youtube", "tiktok", "facebook"];
const DESTEKLI_DILLER = ["de", "tr", "en"];

const dizi = (x: unknown): string[] =>
  Array.isArray(x) ? x.map((v) => String(v ?? "").trim()).filter(Boolean) : [];

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

    // ── Kimlik: JWT ya da ajan secret (sm-uretim ile aynı sıra) ────
    let ownerId = "";
    const gelenSecret = req.headers.get("x-ajan-secret") || "";
    const authHeader = req.headers.get("Authorization");

    if (AJAN_SECRET && gelenSecret) {
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
    /** customer_id NULL/NOT NULL ayrımı (sm_* tablolarındaki standart). */
    const musteri = (q: any) =>
      customerId === null ? q.is("customer_id", null) : q.eq("customer_id", customerId);

    /** Marka profilini okur; satır yoksa varsayılanı döner (asla null dönmez). */
    async function profilOku() {
      const { data } = await musteri(sahip(admin.from("sm_seo_profil").select("*")))
        .maybeSingle();
      return { ...VARSAYILAN_PROFIL, ...(data ?? {}) };
    }

    switch (action) {
      // ── profil-al ────────────────────────────────────────────────
      case "profil-al": {
        const profil = await profilOku();
        const { data: anahtarlar } = await musteri(
          sahip(admin.from("sm_seo_anahtarlar").select("*")),
        ).order("skor", { ascending: false, nullsFirst: false }).limit(200);
        return json({ success: true, profil, anahtarlar: anahtarlar ?? [] });
      }

      // ── profil-kaydet ────────────────────────────────────────────
      case "profil-kaydet": {
        const gelen = govde?.profil ?? {};
        const yama: Record<string, unknown> = {};
        for (const alan of PROFIL_ALANLARI) {
          if (gelen?.[alan] !== undefined) yama[alan] = gelen[alan];
        }
        if (yama.hashtag_modu && !["havuz", "gonderi"].includes(String(yama.hashtag_modu))) {
          return json({ success: false, error: "Geçersiz hashtag modu." }, 400);
        }
        if (yama.diller) yama.diller = dizi(yama.diller).filter((d) => DESTEKLI_DILLER.includes(d));

        // Kısmi unique index çifti yüzünden onConflict kullanılamaz
        // (customer_id NULL olduğunda çakışma hedefi eşleşmez) → oku-yaz.
        const { data: mevcut } = await musteri(sahip(admin.from("sm_seo_profil").select("id")))
          .maybeSingle();

        const { data, error } = mevcut
          ? await admin.from("sm_seo_profil").update(yama)
              .eq("id", mevcut.id).eq("user_id", ownerId).select().single()
          : await admin.from("sm_seo_profil")
              .insert({ ...VARSAYILAN_PROFIL, ...yama, user_id: ownerId, customer_id: customerId })
              .select().single();

        if (error) throw new Error(error.message);
        return json({ success: true, profil: data });
      }

      // ── trend-tara: web araması → sm_seo_anahtarlar ───────────────
      case "trend-tara": {
        const profil = await profilOku();
        const platformlar = dizi(govde?.platformlar).filter((p) => DESTEKLI_PLATFORMLAR.includes(p));
        const sonuc = await seoCagrisi<{ kelimeler: any[]; ozet: string }>({
          sistem: TREND_SISTEM,
          kullanici: trendKullanici(profil, {
            adet: Number(govde?.adet) || 40,
            platformlar: platformlar.length ? platformlar : undefined,
          }),
          sema: ANAHTAR_SEMASI,
          efor: "high",
          aramaAzami: 8,
        });

        const simdi = new Date().toISOString();
        // 30 gün sonra bayat sayılır: sosyal medya trendi bundan uzun yaşamıyor.
        const gecerlilik = new Date(Date.now() + 30 * 86400_000).toISOString();
        const yasakli = dizi(profil.yasakli_kelimeler);

        const satirlar = (sonuc.veri?.kelimeler ?? [])
          .map((k: any) => {
            const tur = k?.tur === "anahtar" ? "anahtar" : "hashtag";
            const kelime = tur === "hashtag"
              ? hashtagNormalize(String(k?.kelime ?? ""))
              : String(k?.kelime ?? "").trim();
            return { ...k, tur, kelime };
          })
          .filter((k: any) => k.kelime && !yasakliIhlalleri(k.kelime, yasakli).length)
          .map((k: any) => ({
            user_id: ownerId,
            customer_id: customerId,
            kelime: k.kelime,
            tur: k.tur,
            platform: DESTEKLI_PLATFORMLAR.includes(k?.platform) ? k.platform : "*",
            dil: DESTEKLI_DILLER.includes(k?.dil) ? k.dil : "de",
            skor: Number.isFinite(Number(k?.skor)) ? Number(k.skor) : null,
            hacim_notu: k?.hacim_notu ?? null,
            kaynak: k?.kaynak ?? null,
            gecerlilik,
            son_tarama: simdi,
          }));

        if (!satirlar.length) {
          return json({ success: false, error: "Tarama sonuç döndürmedi." }, 502);
        }

        // Kısmi unique index'ler onConflict ile hedeflenemiyor → aynı kelime
        // varsa güncelle, yoksa ekle. Kelime sayısı (≤80) bunu ucuz kılıyor.
        const { data: eskiler } = await musteri(
          sahip(admin.from("sm_seo_anahtarlar").select("id, kelime, platform, dil")),
        );
        const anahtarla = (r: any) => `${r.platform}|${r.dil}|${r.kelime.toLocaleLowerCase("tr")}`;
        const harita = new Map((eskiler ?? []).map((r: any) => [anahtarla(r), r.id]));

        const yeniler = satirlar.filter((s: any) => !harita.has(anahtarla(s)));
        const guncellenecekler = satirlar.filter((s: any) => harita.has(anahtarla(s)));

        if (yeniler.length) {
          const { error } = await admin.from("sm_seo_anahtarlar").insert(yeniler);
          if (error) throw new Error(error.message);
        }
        for (const g of guncellenecekler) {
          await admin.from("sm_seo_anahtarlar")
            .update({ skor: g.skor, hacim_notu: g.hacim_notu, kaynak: g.kaynak,
                      gecerlilik: g.gecerlilik, son_tarama: g.son_tarama })
            .eq("id", harita.get(anahtarla(g))).eq("user_id", ownerId);
        }

        return json({
          success: true,
          eklenen: yeniler.length,
          guncellenen: guncellenecekler.length,
          ozet: sonuc.veri?.ozet ?? null,
          aramalar: sonuc.aramalar,
        });
      }

      // ── havuz-uret: anahtarlardan hashtag havuzu kur ──────────────
      // Taze anahtar yoksa önce tarama yapılır — kullanıcı iki düğmeye
      // basmak zorunda kalmasın.
      case "havuz-uret": {
        const profil = await profilOku();
        const platform = String(govde?.platform ?? "*");

        let { data: anahtarlar } = await musteri(
          sahip(admin.from("sm_seo_anahtarlar").select("*").eq("tur", "hashtag")),
        ).order("skor", { ascending: false, nullsFirst: false }).limit(120);

        if (!anahtarlar?.length) {
          const tarama = await seoCagrisi<{ kelimeler: any[] }>({
            sistem: TREND_SISTEM,
            kullanici: trendKullanici(profil, { adet: 50 }),
            sema: ANAHTAR_SEMASI,
            efor: "high",
            aramaAzami: 8,
          });
          const gecerlilik = new Date(Date.now() + 30 * 86400_000).toISOString();
          const satirlar = (tarama.veri?.kelimeler ?? [])
            .filter((k: any) => k?.tur === "hashtag")
            .map((k: any) => ({
              user_id: ownerId,
              customer_id: customerId,
              kelime: hashtagNormalize(String(k?.kelime ?? "")),
              tur: "hashtag",
              platform: DESTEKLI_PLATFORMLAR.includes(k?.platform) ? k.platform : "*",
              dil: DESTEKLI_DILLER.includes(k?.dil) ? k.dil : "de",
              skor: Number.isFinite(Number(k?.skor)) ? Number(k.skor) : null,
              hacim_notu: k?.hacim_notu ?? null,
              kaynak: k?.kaynak ?? null,
              gecerlilik,
            }))
            .filter((s: any) => s.kelime);
          if (satirlar.length) await admin.from("sm_seo_anahtarlar").insert(satirlar);
          anahtarlar = satirlar;
        }

        const yasakli = dizi(profil.yasakli_kelimeler);
        const uygunlar = (anahtarlar ?? [])
          .filter((a: any) => platform === "*" || a.platform === "*" || a.platform === platform)
          .sort((a: any, b: any) => (b.skor ?? 0) - (a.skor ?? 0))
          .map((a: any) => hashtagNormalize(a.kelime));

        // Havuz, gönderi başına seçilen etiket sayısından çok daha büyük
        // olmalı: hashtagSec() havuzdan tohuma göre kaydırarak seçiyor,
        // havuz darsa her gönderi aynı bloğu paylaşır (spam sinyali).
        const havuz = tekille(uygunlar)
          .filter((t) => t && !yasakliIhlalleri(t, yasakli).length)
          .slice(0, 50);

        if (!havuz.length) return json({ success: false, error: "Havuz üretilemedi." }, 502);

        // uygula:false → yalnızca öneri döner, kullanıcı panelde görür.
        if (!govde?.uygula) return json({ success: true, havuz, uygulandi: false });

        const { data: kural } = await musteri(
          sahip(admin.from("sm_otomasyon").select("id").eq("platform", "*")),
        ).maybeSingle();

        if (kural) {
          const { error } = await admin.from("sm_otomasyon")
            .update({ hashtag_havuzu: havuz, aktif: true })
            .eq("id", kural.id).eq("user_id", ownerId);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await admin.from("sm_otomasyon").insert({
            user_id: ownerId, customer_id: customerId, platform: "*",
            aktif: true, hashtag_havuzu: havuz,
          });
          if (error) throw new Error(error.message);
        }
        return json({ success: true, havuz, uygulandi: true });
      }

      // ── oneri-uret: içerik için başlık/caption/etiket ─────────────
      case "oneri-uret": {
        const mediaId = govde?.mediaId ? String(govde.mediaId) : null;
        const postId = govde?.postId ? String(govde.postId) : null;
        if (!mediaId && !postId) {
          return json({ success: false, error: "mediaId veya postId gerekli." }, 400);
        }

        const profil = await profilOku();
        const platformlar = dizi(govde?.platformlar).filter((p) => DESTEKLI_PLATFORMLAR.includes(p));
        const hedefPlatformlar = platformlar.length ? platformlar : ["instagram"];
        const diller = dizi(govde?.diller).filter((d) => DESTEKLI_DILLER.includes(d));
        const hedefDiller = diller.length
          ? diller
          : (dizi(profil.diller).length ? dizi(profil.diller) : ["de"]);
        const format = govde?.format ? String(govde.format) : null;

        // 1) Cache — aynı medya için ikinci kez para harcanmaz.
        let mevcutQ = sahip(admin.from("sm_seo_oneriler").select("*"))
          .in("platform", hedefPlatformlar)
          .in("dil", hedefDiller);
        mevcutQ = mediaId ? mevcutQ.eq("media_id", mediaId) : mevcutQ.eq("post_id", postId);
        if (format) mevcutQ = mevcutQ.eq("format", format);
        const { data: mevcut } = await mevcutQ;

        const beklenen = hedefPlatformlar.length * hedefDiller.length;
        if (!govde?.yenile && (mevcut?.length ?? 0) >= beklenen) {
          return json({ success: true, oneriler: mevcut, cache: true });
        }

        // 2) İçerik bağlamı
        let icerik: any = {};
        if (mediaId) {
          const { data: medya } = await sahip(
            admin.from("sm_media")
              .select("baslik, aciklama, prompt, cozunurluk, sure, post_id")
              .eq("id", mediaId),
          ).maybeSingle();
          if (!medya) return json({ success: false, error: "Medya bulunamadı." }, 404);
          icerik = { ...medya, format };
        }

        const bagliPostId = postId ?? icerik?.post_id ?? null;
        if (bagliPostId) {
          const { data: post } = await sahip(
            admin.from("sm_posts")
              .select("hook, format, caption_de, hashtagler, pillar_id")
              .eq("id", bagliPostId),
          ).maybeSingle();
          if (post) {
            icerik.baslik = icerik.baslik || post.hook;
            icerik.format = icerik.format || post.format;
            icerik.gecmisEtiketler = dizi(post.hashtagler);
            if (post.pillar_id) {
              const { data: pillar } = await sahip(
                admin.from("sm_content_pillars")
                  .select("pillar, aciklama, hedef_kitle").eq("id", post.pillar_id),
              ).maybeSingle();
              icerik.pillar = pillar ?? null;
            }
          }
        }

        // 3) Araştırılmış havuz varsa modele bağlam olarak verilir.
        const { data: anahtarlar } = await musteri(
          sahip(admin.from("sm_seo_anahtarlar").select("kelime, skor")),
        ).order("skor", { ascending: false, nullsFirst: false }).limit(60);

        // MALİYET: gönderi başına çalışan bu uç WEB ARAMASI YAPMAZ. Canlı
        // araştırma pahalı kısım ve zaten trend-tara/havuz-uret'te bir kez
        // yapılıp anahtar kelime havuzuna yazılıyor; burada o havuz bağlam
        // olarak modele veriliyor. Böylece her yayında yalnızca ucuz bir
        // Haiku metin çağrısı olur.
        const sonuc = await seoCagrisi<{ oneriler: any[] }>({
          sistem: ONERI_SISTEM,
          kullanici: oneriKullanici(profil, icerik, {
            platformlar: hedefPlatformlar,
            diller: hedefDiller,
            anahtarlar: (anahtarlar ?? []).map((a: any) => a.kelime),
          }),
          sema: ONERI_SEMASI,
          webArama: false,
        });

        // 4) Sınırları modele bırakmadan uygula, sonra yaz.
        const yasakli = dizi(profil.yasakli_kelimeler);
        const yazilan: any[] = [];

        for (const o of sonuc.veri?.oneriler ?? []) {
          const platform = String(o?.platform ?? "");
          if (!hedefPlatformlar.includes(platform)) continue;
          const dil = DESTEKLI_DILLER.includes(o?.dil) ? o.dil : hedefDiller[0];
          const k = kuralAl(platform);

          const caption = kirp(String(o?.caption ?? ""), k.captionSiniri);
          const baslik = k.baslikVar ? kirp(String(o?.baslik ?? ""), k.baslikSiniri) : null;
          const ilkYorum = k.yorumDestekli ? kirp(String(o?.ilk_yorum ?? ""), 2200) : null;

          // Model kurala uymadıysa satır yazılmaz — yasaklı kelime sessizce
          // yayına gitmesin.
          const ihlal = [
            ...yasakliIhlalleri(caption, yasakli),
            ...yasakliIhlalleri(baslik ?? "", yasakli),
            ...yasakliIhlalleri(ilkYorum ?? "", yasakli),
          ];
          if (ihlal.length) {
            console.warn("[sm-seo] yasaklı kelime nedeniyle atlandı:", platform, dil, ihlal);
            continue;
          }

          const satir = {
            user_id: ownerId,
            customer_id: customerId,
            media_id: mediaId,
            post_id: mediaId ? null : bagliPostId,
            platform,
            format: icerik?.format ?? format ?? null,
            dil,
            baslik,
            caption,
            hashtagler: hashtagleriTemizle(o?.hashtagler, platform, yasakli),
            ilk_yorum: ilkYorum || null,
            gerekce: {
              metin: o?.gerekce ?? null,
              anahtar_kelimeler: dizi(o?.anahtar_kelimeler),
              aramalar: sonuc.aramalar,
            },
            model: sonuc.model,
            girdi_token: sonuc.girdiToken,
            cikti_token: sonuc.ciktiToken,
            durum: "taslak",
          };

          // Kısmi unique index'ler onConflict ile hedeflenemez → oku-yaz.
          let eskiQ = sahip(admin.from("sm_seo_oneriler").select("id"))
            .eq("platform", platform).eq("dil", dil);
          eskiQ = mediaId ? eskiQ.eq("media_id", mediaId) : eskiQ.eq("post_id", bagliPostId);
          if (satir.format) eskiQ = eskiQ.eq("format", satir.format);
          else eskiQ = eskiQ.is("format", null);
          const { data: eski } = await eskiQ.maybeSingle();

          const { data, error } = eski
            ? await admin.from("sm_seo_oneriler").update(satir)
                .eq("id", eski.id).eq("user_id", ownerId).select().single()
            : await admin.from("sm_seo_oneriler").insert(satir).select().single();

          if (error) throw new Error(error.message);
          yazilan.push(data);
        }

        if (!yazilan.length) {
          return json({ success: false, error: "Kullanılabilir öneri üretilemedi." }, 502);
        }
        return json({ success: true, oneriler: yazilan, cache: false, aramalar: sonuc.aramalar });
      }

      // ── oneri-al: cache okuma ────────────────────────────────────
      case "oneri-al": {
        const mediaId = govde?.mediaId ? String(govde.mediaId) : null;
        const postId = govde?.postId ? String(govde.postId) : null;
        if (!mediaId && !postId) {
          return json({ success: false, error: "mediaId veya postId gerekli." }, 400);
        }
        let q = sahip(admin.from("sm_seo_oneriler").select("*"));
        q = mediaId ? q.eq("media_id", mediaId) : q.eq("post_id", postId);
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        return json({ success: true, oneriler: data ?? [] });
      }

      default:
        return json({ success: false, error: `Bilinmeyen action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("sm-seo hatası:", e);
    return json({ success: false, error: e?.message || "Beklenmeyen hata." }, 500);
  }
});
