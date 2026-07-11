// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// find-customers  (JWT required — logged-in app users)
// ──────────────────────────────────────────────────────────────────
// Müşteri Bulma modülü. Apify "compass~crawler-google-places" aktörü ile
// Google Maps'ten işletme arar, normalize eder, filtreler ve `leads`
// tablosuna (owner bazlı) upsert eder.
//
// İki aşamalı (timeout'a takılmamak için):
//   POST { action:"start", ulke, sehir, kategori, yaricap_km?, max_results?,
//          min_puan?, only_email?, only_phone?, only_website?, lang? }
//        → { success, searchId, runId, status:"running" }
//   POST { action:"poll", searchId }
//        → { success, status:"running" }  (henüz bitmedi)
//        → { success, status:"done", count, leads:[...] }
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

const ACTOR = "compass~crawler-google-places";
const APIFY = "https://api.apify.com/v2";

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
      const ulke = String(body?.ulke || "").trim();
      const sehir = String(body?.sehir || "").trim();
      const kategori = String(body?.kategori || "").trim();
      const yaricap_km = body?.yaricap_km != null ? Number(body.yaricap_km) : null;
      const max_results = Math.min(Math.max(parseInt(body?.max_results ?? 50, 10) || 50, 1), 120);
      const min_puan = body?.min_puan != null ? Number(body.min_puan) : 0;
      const only_email = !!body?.only_email;
      const only_phone = !!body?.only_phone;
      const only_website = !!body?.only_website;
      const lang = String(body?.lang || "de") === "tr" ? "tr" : "de";

      if (!kategori) return json({ success: false, error: "Kategori zorunludur." }, 400);
      if (!sehir && !ulke) return json({ success: false, error: "Şehir veya ülke girin." }, 400);

      // Arama kaydı
      const { data: search, error: sErr } = await admin
        .from("lead_searches")
        .insert({
          user_id: ownerId,
          created_by: caller.id,
          ulke, sehir, kategori, yaricap_km,
          max_results, min_puan, only_email, only_phone, only_website,
          status: "running",
        })
        .select()
        .single();
      if (sErr || !search) return json({ success: false, error: "Arama kaydı oluşturulamadı: " + (sErr?.message || "") }, 500);

      // Apify aktörünü async başlat
      const locationQuery = [sehir, ulke].filter(Boolean).join(", ");
      const input: any = {
        searchStringsArray: [kategori],
        locationQuery,
        maxCrawledPlacesPerSearch: max_results,
        language: lang,
        skipClosedPlaces: true,
      };
      const runRes = await fetch(`${APIFY}/acts/${ACTOR}/runs?token=${APIFY_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!runRes.ok) {
        const detail = await runRes.text().catch(() => "");
        await admin.from("lead_searches").update({ status: "error", error: `Apify başlatılamadı (${runRes.status})` }).eq("id", search.id);
        console.error("Apify start failed", runRes.status, detail);
        return json({ success: false, status: "error", error: "Arama başlatılamadı." }, 502);
      }
      const runData = await runRes.json();
      const runId = runData?.data?.id;
      await admin.from("lead_searches").update({ apify_run_id: runId }).eq("id", search.id);

      return json({ success: true, searchId: search.id, runId, status: "running" });
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
      if (search.status === "done") {
        const { data: existing } = await admin.from("leads").select("*").eq("search_id", searchId).order("puan", { ascending: false });
        return json({ success: true, status: "done", count: existing?.length || 0, leads: existing || [] });
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

      const minPuan = Number(search.min_puan || 0);
      const normalize = (it: any) => {
        const loc = it.location || {};
        const email = it.email || (Array.isArray(it.emails) && it.emails[0]) || null;
        return {
          user_id: ownerId,
          search_id: searchId,
          place_id: it.placeId || it.fid || it.cid || null,
          isim: it.title || it.name || "İsimsiz",
          kategori: it.categoryName || (Array.isArray(it.categories) ? it.categories[0] : null) || null,
          adres: it.address || it.street || null,
          telefon: it.phone || it.phoneUnformatted || null,
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

      let rows = (Array.isArray(items) ? items : []).map(normalize);
      // Filtreler
      rows = rows.filter((r) => {
        if (minPuan > 0 && !(Number(r.puan) >= minPuan)) return false;
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
        .from("leads").select("place_id,isim,adres").eq("user_id", ownerId);
      const exPid = new Set<string>();
      const exKey = new Set<string>();
      for (const e of existingLeads || []) {
        if (e.place_id) exPid.add(String(e.place_id));
        exKey.add(nameKey(e));
      }
      const fresh = rows.filter((r) => !((r.place_id && exPid.has(String(r.place_id))) || exKey.has(nameKey(r))));
      const duplicates = rows.length - fresh.length;

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
      return json({ success: true, status: "done", count: saved.length, duplicates, leads: saved });
    }

    return json({ success: false, error: "Geçersiz action" }, 400);
  } catch (e: any) {
    console.error("find-customers error", e);
    return json({ success: false, error: "Sunucu hatası: " + (e?.message || String(e)) }, 500);
  }
});
