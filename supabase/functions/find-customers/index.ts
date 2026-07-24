// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// find-customers  (JWT required — logged-in app users)
// ──────────────────────────────────────────────────────────────────
// Müşteri Bulma modülü. Üç kaynaktan (Google Maps / Instagram / YouTube)
// Apify aktörleriyle veri çeker, normalize eder, filtreler ve `leads`
// tablosuna (owner bazlı) upsert eder.
//
// İki boyut:
//   kaynak: "maps" | "instagram" | "youtube"
//   mod:    "musteri" (lead üretimi → leads tablosu)
//         | "kendi"   (kendi hesap analizi → lead_searches.sonuc)
//
// İki aşamalı (timeout'a takılmamak için):
//   POST { action:"start", kaynak, mod, ... }
//        → { success, searchId, runId, status:"running" }
//   POST { action:"poll", searchId }
//        → { success, status:"running" }  (henüz bitmedi)
//        → { success, status:"done", count, leads:[...] }        (mod=musteri)
//        → { success, status:"done", mod:"kendi", sonuc:[...] }  (mod=kendi)
//        → { success:false, status:"error", error }
//
// Env: APIFY_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ──────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://fikoai.de",
  "https://www.fikoai.de",
  "https://fibu-de-2.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
];

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const APIFY = "https://api.apify.com/v2";

// Kaynak → Apify aktörü
//   maps      : Google Maps Scraper'ın "Email Extractor" varyantı — aynı input
//               şeması, ek olarak işletme sitesini gezip e-posta/telefon çıkarır.
//   instagram : resmi Apify Instagram Scraper.
//   youtube   : anahtar kelimeden kanal keşfi + kanal e-posta/telefon çıkarımı.
const ACTORS: Record<string, string> = {
  maps: "lukaskrivka~google-maps-with-contact-details",
  instagram: "apify~instagram-scraper",
  youtube: "khadinakbar~youtube-channel-email-extractor",
};

const KAYNAKLAR = ["maps", "instagram", "youtube"];
const MODLAR = ["musteri", "kendi"];

// ── Yardımcılar ───────────────────────────────────────────────────
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Bio/açıklama metninden ilk e-postayı çıkarır (Instagram profil e-postasını
// API vermiyor; işletmeler bio'ya yazıyor).
function emailFromText(...parts: any[]): string | null {
  for (const p of parts) {
    const m = String(p ?? "").match(EMAIL_RE);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

// "6.65M subscribers" / "1.2K" / "12,345" → sayı
function parseCount(v: any): number | null {
  if (typeof v === "number") return Math.round(v);
  const s = String(v ?? "").replace(/,/g, "").trim();
  const m = s.match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] ?? 1;
  return Math.round(n * mult);
}

// Instagram kullanıcı adını serbest girdiden ayıklar (@ad, tam URL, düz ad)
function igHandle(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
}

// YouTube kanal URL'ini serbest girdiden üretir (@handle, tam URL, kanal adı)
function ytChannelUrl(raw: string): string {
  const s = String(raw || "").trim();
  if (/^https?:\/\//i.test(s)) return s;
  const handle = s.replace(/^@/, "");
  return `https://www.youtube.com/@${handle}`;
}

serve(async (req) => {
  const corsHeaders = cors(req);
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!APIFY_TOKEN) return json({ success: false, error: "APIFY_TOKEN yapılandırılmamış." }, 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ success: false, error: "Sunucu yapılandırma hatası." }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Yetkisiz" }, 401);

    // Caller doğrulama
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, error: "Geçersiz oturum" }, 401);
    const caller = userData.user;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Owner çözümü: caller aktif bir alt kullanıcıysa owner'ın id'si, değilse kendisi
    const { data: membership } = await admin
      .from("team_members")
      .select("owner_user_id")
      .eq("member_user_id", caller.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const ownerId = membership?.owner_user_id || caller.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "start");

    // ================= START =================
    if (action === "start") {
      const kaynak = KAYNAKLAR.includes(String(body?.kaynak)) ? String(body.kaynak) : "maps";
      const mod = MODLAR.includes(String(body?.mod)) ? String(body.mod) : "musteri";
      // Maps'te "kendi hesabım" modu yok — sessizce müşteri moduna düşer.
      const effMod = kaynak === "maps" ? "musteri" : mod;

      const ulke = String(body?.ulke || "").trim();
      const sehir = String(body?.sehir || "").trim();
      const kategori = String(body?.kategori || "").trim();
      const sorgu = String(body?.sorgu || "").trim();
      const yaricap_km = body?.yaricap_km != null ? Number(body.yaricap_km) : null;
      const max_results = Math.min(Math.max(parseInt(body?.max_results ?? 50, 10) || 50, 1), 120);
      const min_puan = body?.min_puan != null ? Number(body.min_puan) : 0;
      const only_email = !!body?.only_email;
      const only_phone = !!body?.only_phone;
      const only_website = !!body?.only_website;
      const lang = String(body?.lang || "de") === "tr" ? "tr" : "de";

      // Kaynağa göre zorunlu alan doğrulaması
      if (kaynak === "maps") {
        if (!kategori) return json({ success: false, error: "Kategori zorunludur." }, 400);
        if (!sehir && !ulke) return json({ success: false, error: "Şehir veya ülke girin." }, 400);
      } else if (!sorgu) {
        return json(
          {
            success: false,
            error:
              effMod === "kendi"
                ? "Hesap adı zorunludur."
                : "Arama kelimesi zorunludur.",
          },
          400,
        );
      }

      // Arama kaydı
      const { data: search, error: sErr } = await admin
        .from("lead_searches")
        .insert({
          user_id: ownerId,
          created_by: caller.id,
          kaynak, mod: effMod, sorgu: sorgu || null,
          ulke, sehir, kategori: kategori || null, yaricap_km,
          max_results, min_puan, only_email, only_phone, only_website,
          status: "running",
        })
        .select()
        .single();
      if (sErr || !search) return json({ success: false, error: "Arama kaydı oluşturulamadı: " + (sErr?.message || "") }, 500);

      // ── Apify input'unu kaynağa göre kur ────────────────────────
      let input: any;
      if (kaynak === "maps") {
        const locationQuery = [sehir, ulke].filter(Boolean).join(", ");
        input = {
          searchStringsArray: [kategori],
          locationQuery,
          maxCrawledPlacesPerSearch: max_results,
          language: lang,
          skipClosedPlaces: true,
          // Sosyal medya profili / lead enrichment add-on'ları ücretli;
          // aktörün varsayılanı zaten kapalı, bilinçli olarak açmıyoruz.
        };
      } else if (kaynak === "instagram") {
        // DİKKAT: directUrls'in varsayılanı ["…/humansofny/"] — arama modunda
        // açıkça [] geçmezsek sonuçlara o profil de karışır.
        input =
          effMod === "kendi"
            ? {
                directUrls: [`https://www.instagram.com/${igHandle(sorgu)}/`],
                search: "",
                resultsType: "details",
                resultsLimit: max_results,
              }
            : {
                directUrls: [],
                search: sorgu,
                searchType: "user",
                resultsType: "details",
                searchLimit: max_results,
                resultsLimit: max_results,
              };
      } else {
        // DİKKAT: bu aktörün hem channelUrls hem searchQueries alanının
        // dolu bir varsayılanı var (@aliabdaal, @mkbhd … / "fitness youtube
        // channels" …). Kullanmadığımız alanı açıkça [] geçmezsek Apify
        // varsayılanı uygular ve sonuçlara alakasız kanallar karışır.
        input =
          effMod === "kendi"
            ? {
                channelUrls: [ytChannelUrl(sorgu)],
                searchQueries: [],
                maxResults: 1,
                scrapeWebsite: false,
                followLinkAggregators: false,
              }
            : {
                channelUrls: [],
                searchQueries: [sorgu],
                maxResults: max_results,
                scrapeWebsite: true,
                followLinkAggregators: true,
              };
      }

      // Apify aktörünü async başlat
      const runRes = await fetch(`${APIFY}/acts/${ACTORS[kaynak]}/runs?token=${APIFY_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!runRes.ok) {
        const detail = await runRes.text().catch(() => "");
        await admin.from("lead_searches").update({ status: "error", error: `Apify başlatılamadı (${runRes.status})` }).eq("id", search.id);
        console.error("Apify start failed", kaynak, runRes.status, detail);
        return json({ success: false, status: "error", error: "Arama başlatılamadı." }, 502);
      }
      const runData = await runRes.json();
      const runId = runData?.data?.id;
      await admin.from("lead_searches").update({ apify_run_id: runId }).eq("id", search.id);

      return json({ success: true, searchId: search.id, runId, kaynak, mod: effMod, status: "running" });
    }

    // ================= POLL =================
    if (action === "poll") {
      const searchId = String(body?.searchId || "");
      if (!searchId) return json({ success: false, error: "searchId gerekli" }, 400);

      const { data: search } = await admin.from("lead_searches").select("*").eq("id", searchId).maybeSingle();
      if (!search) return json({ success: false, error: "Arama bulunamadı" }, 404);
      // Yetki: bu arama caller'ın erişebildiği owner'a mı ait?
      if (search.user_id !== ownerId && search.created_by !== caller.id) {
        return json({ success: false, error: "Bu aramaya erişiminiz yok" }, 403);
      }

      const kaynak = String(search.kaynak || "maps");
      const mod = String(search.mod || "musteri");

      if (search.status === "done") {
        if (mod === "kendi") {
          return json({ success: true, status: "done", mod, kaynak, sonuc: search.sonuc || [] });
        }
        const { data: existing } = await admin.from("leads").select("*").eq("search_id", searchId).order("puan", { ascending: false });
        return json({ success: true, status: "done", mod, kaynak, count: existing?.length || 0, leads: existing || [] });
      }
      if (!search.apify_run_id) return json({ success: true, status: "running" });

      const runRes = await fetch(`${APIFY}/actor-runs/${search.apify_run_id}?token=${APIFY_TOKEN}`);
      if (!runRes.ok) return json({ success: true, status: "running" });
      const runJson = await runRes.json();
      const runStatus = runJson?.data?.status;
      const datasetId = runJson?.data?.defaultDatasetId;

      if (runStatus === "RUNNING" || runStatus === "READY") {
        return json({ success: true, status: "running" });
      }
      if (runStatus !== "SUCCEEDED") {
        await admin.from("lead_searches").update({ status: "error", error: `Apify durumu: ${runStatus}` }).eq("id", searchId);
        // 200 döndür ki client invoke() ile temiz okusun
        return json({ success: false, status: "error", error: `Arama tamamlanamadı (${runStatus}).` }, 200);
      }

      // Dataset'i çek
      const itemsRes = await fetch(`${APIFY}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true`);
      const items = (await itemsRes.json().catch(() => [])) as any[];
      const list = Array.isArray(items) ? items : [];

      // ── mod=kendi: leads'e yazma, ham sonucu aramaya iliştir ────
      if (mod === "kendi") {
        await admin
          .from("lead_searches")
          .update({ status: "done", result_count: list.length, sonuc: list })
          .eq("id", searchId);
        return json({ success: true, status: "done", mod, kaynak, count: list.length, sonuc: list });
      }

      // ── mod=musteri: kaynağa göre normalize et ──────────────────
      const minPuan = Number(search.min_puan || 0);

      const normalizeMaps = (it: any) => {
        const loc = it.location || {};
        const email =
          it.email ||
          (Array.isArray(it.emails) && it.emails[0]) ||
          null;
        return {
          user_id: ownerId,
          search_id: searchId,
          kaynak: "maps",
          place_id: it.placeId || it.fid || it.cid || null,
          isim: it.title || it.name || "İsimsiz",
          kategori: it.categoryName || (Array.isArray(it.categories) ? it.categories[0] : null) || null,
          adres: it.address || it.street || null,
          telefon: it.phone || it.phoneUnformatted || (Array.isArray(it.phones) && it.phones[0]) || null,
          email,
          website: it.website || null,
          puan: typeof it.totalScore === "number" ? it.totalScore : null,
          yorum_sayisi: typeof it.reviewsCount === "number" ? it.reviewsCount : null,
          lat: loc.lat ?? null,
          lng: loc.lng ?? null,
          sehir: it.city || search.sehir || null,
          ulke: it.countryCode || search.ulke || null,
          raw: it,
        };
      };

      const normalizeInstagram = (it: any) => ({
        user_id: ownerId,
        search_id: searchId,
        kaynak: "instagram",
        place_id: it.id ? `ig:${it.id}` : it.username ? `ig:${it.username}` : null,
        isim: it.fullName || it.username || "İsimsiz",
        kategori: it.businessCategoryName || null,
        adres: null,
        // Instagram profil e-postasını API dönmüyor → bio'dan çıkarıyoruz.
        telefon: null,
        email: emailFromText(it.biography),
        website: it.externalUrl || null,
        kullanici_adi: it.username || null,
        takipci: parseCount(it.followersCount),
        profil_url: it.url || (it.username ? `https://www.instagram.com/${it.username}` : null),
        puan: null,
        yorum_sayisi: null,
        sehir: search.sehir || null,
        ulke: search.ulke || null,
        raw: it,
      });

      const normalizeYoutube = (it: any) => ({
        user_id: ownerId,
        search_id: searchId,
        kaynak: "youtube",
        place_id: it.channel_handle
          ? `yt:${it.channel_handle}`
          : it.channel_url
          ? `yt:${it.channel_url}`
          : null,
        isim: it.channel_name || it.channel_handle || "İsimsiz",
        kategori: null,
        adres: null,
        telefon: it.phone || null,
        email: it.email || (Array.isArray(it.all_emails) && it.all_emails[0]) || emailFromText(it.description),
        website: it.website || null,
        kullanici_adi: it.channel_handle || null,
        takipci: parseCount(it.subscriber_count),
        profil_url: it.channel_url || null,
        puan: null,
        yorum_sayisi: parseCount(it.video_count),
        sehir: search.sehir || null,
        ulke: it.country || search.ulke || null,
        raw: it,
      });

      const normalize =
        kaynak === "instagram" ? normalizeInstagram : kaynak === "youtube" ? normalizeYoutube : normalizeMaps;

      let rows = list.map(normalize);
      // Filtreler (min. puan yalnızca Maps'te anlamlı)
      rows = rows.filter((r) => {
        if (kaynak === "maps" && minPuan > 0 && !(Number(r.puan) >= minPuan)) return false;
        if (search.only_email && !r.email) return false;
        if (search.only_phone && !r.telefon) return false;
        if (search.only_website && !r.website) return false;
        return true;
      });

      // ── Tekilleştirme (dedup) ─────────────────────────────────────
      // Bir işletme "aynı" sayılır: aynı place_id VEYA aynı normalize
      // isim+adres. Böylece Google'da mükerrer kayıt (farklı place_id)
      // ya da Apify'ın tekrar döndürdüğü kayıtlar tek kez listelenir.
      const norm = (s: any) =>
        String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
      const nameKey = (r: any) => `${norm(r.isim)}|${norm(r.adres)}`;

      // 1) Batch içi tekilleştirme (Apify aynı yeri iki kez verebilir → aksi
      //    halde upsert "cannot affect row a second time" hatası verir)
      const seenPid = new Set<string>();
      const seenKey = new Set<string>();
      rows = rows.filter((r) => {
        const pid = r.place_id ? String(r.place_id) : "";
        const k = nameKey(r);
        if ((pid && seenPid.has(pid)) || seenKey.has(k)) return false;
        if (pid) seenPid.add(pid);
        seenKey.add(k);
        return true;
      });

      // 2) Owner'ın MEVCUT tüm leadlerine karşı tekilleştirme (önceki
      //    aramalarda bulunmuş müşteriyi tekrar ekleme/listeleme)
      const { data: existingLeads } = await admin
        .from("leads").select("id,place_id,isim,adres,email,telefon,website").eq("user_id", ownerId);
      const exPid = new Map<string, any>();
      const exKey = new Map<string, any>();
      for (const e of existingLeads || []) {
        if (e.place_id) exPid.set(String(e.place_id), e);
        exKey.set(nameKey(e), e);
      }
      const eslesen = (r: any) =>
        (r.place_id && exPid.get(String(r.place_id))) || exKey.get(nameKey(r)) || null;

      const fresh = rows.filter((r) => !eslesen(r));
      const duplicates = rows.length - fresh.length;

      // 2b) İLETİŞİM ZENGİNLEŞTİRME — mükerrer sayılan kayıtlar boşuna
      //     atılmasın. Eski aramalar (e-posta döndürmeyen aktör) ile gelmiş
      //     bir lead'in şimdi e-postası/telefonu bulunduysa mevcut satırı
      //     güncelle. Sadece BOŞ alanlar doldurulur — elle girilen veri ezilmez.
      let enriched = 0;
      for (const r of rows) {
        const e = eslesen(r);
        if (!e) continue;
        const patch: any = {};
        if (!e.email && r.email) patch.email = r.email;
        if (!e.telefon && r.telefon) patch.telefon = r.telefon;
        if (!e.website && r.website) patch.website = r.website;
        if (!Object.keys(patch).length) continue;
        const { error: uErr } = await admin.from("leads").update(patch).eq("id", e.id);
        if (uErr) console.error("lead enrich error", uErr.message);
        else enriched++;
      }

      // 3) Yalnızca yeni olanları ekle. onConflict DO NOTHING (ignoreDuplicates)
      //    → yarış durumunda bile mükerrer oluşmaz ve mevcut satır (elle
      //    girilen e-posta vb.) EZİLMEZ.
      let saved: any[] = [];
      if (fresh.length) {
        const { data, error } = await admin
          .from("leads")
          .upsert(fresh, { onConflict: "user_id,place_id", ignoreDuplicates: true })
          .select();
        if (error) console.error("leads insert error", error.message);
        if (data) saved = data;
      }

      await admin.from("lead_searches").update({ status: "done", result_count: saved.length }).eq("id", searchId);
      return json({ success: true, status: "done", mod, kaynak, count: saved.length, duplicates, enriched, leads: saved });
    }

    return json({ success: false, error: "Geçersiz action" }, 400);
  } catch (e: any) {
    console.error("find-customers error", e);
    return json({ success: false, error: "Sunucu hatası: " + (e?.message || String(e)) }, 500);
  }
});
