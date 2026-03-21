/**
 * SKR03 verilerini Supabase account_plans tablosuna yükler.
 * Kullanım: node seed_account_plans.cjs
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// .env dosyasından oku
const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) env[key.trim()] = rest.join("=").trim();
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("VITE_SUPABASE_URL veya VITE_SUPABASE_ANON_KEY .env dosyasında bulunamadı");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// SKR03 verilerini TypeScript dosyalarından parse et
function extractSKR03() {
  // skr03Full.ts'den hesapları çıkar
  const fullPath = path.join(__dirname, "data", "skr03Full.ts");
  const fullContent = fs.readFileSync(fullPath, "utf-8");

  // Tüm account objeleri: { code: "XXXX", name: "...", funktion: "...", abschlusszweck: "..." }
  const accounts = [];
  const accountRegex = /\{\s*code:\s*['"](\d+)['"]\s*,\s*name:\s*['"]([^'"]*)['"]\s*,\s*funktion:\s*['"]([^'"]*)['"]\s*,\s*abschlusszweck:\s*['"]([^'"]*)['"]/g;
  let match;
  while ((match = accountRegex.exec(fullContent)) !== null) {
    accounts.push({
      code: match[1],
      name: match[2],
      funktion: match[3],
      abschlusszweck: match[4],
    });
  }

  // Klasse bilgisini bul (klasse: X -> sonraki hesaplar o klasse'a ait)
  const klasseMap = {};
  const klasseRegex = /klasse:\s*(\d+)/g;
  const klassePositions = [];
  while ((match = klasseRegex.exec(fullContent)) !== null) {
    klassePositions.push({ klasse: parseInt(match[1]), pos: match.index });
  }

  // Her hesap kodunun ilk hanesinden klasse belirle
  for (const acc of accounts) {
    acc.klasse = parseInt(acc.code.charAt(0));
  }

  // skr03Metadata.ts'den metadata oku
  const metaPath = path.join(__dirname, "data", "skr03Metadata.ts");
  const metaContent = fs.readFileSync(metaPath, "utf-8");

  const metadata = {};
  // Her account entry'yi parse et
  const metaRegex = /'(\d+)':\s*\{[^}]*description:\s*'([^']*)'[^}]*keywords:\s*\[([^\]]*)\][^}]*kategorie:\s*'([^']*)'/g;
  while ((match = metaRegex.exec(metaContent)) !== null) {
    const code = match[1];
    const description = match[2];
    const keywordsRaw = match[3];
    const kategorie = match[4];
    const keywords = keywordsRaw.match(/'([^']*)'/g)?.map((k) => k.replace(/'/g, "")) || [];
    metadata[code] = { description, keywords: keywords.slice(0, 5), kategorie };
  }

  return { accounts, metadata };
}

async function seed() {
  console.log("SKR03 verileri okunuyor...");
  const { accounts, metadata } = extractSKR03();
  console.log(`${accounts.length} hesap kodu bulundu, ${Object.keys(metadata).length} metadata kaydı`);

  // account_plans tablosuna uygun formata dönüştür
  const rows = accounts.map((acc) => {
    const meta = metadata[acc.code];
    let justification = meta?.description || "";
    if (meta?.keywords?.length) {
      justification += ` [${meta.keywords.slice(0, 5).join(", ")}]`;
    }
    if (meta?.kategorie) {
      justification += ` (Kat: ${meta.kategorie})`;
    }

    return {
      account_code: acc.code,
      account_description: acc.name,
      category: meta?.kategorie || `Klasse ${acc.klasse}`,
      analysis_justification: justification || null,
      account_prefix: String(acc.klasse),
      programmverbindung: acc.funktion || null,
      balance_item: acc.abschlusszweck || null,
      guv_posten: null,
    };
  });

  // Mevcut verileri temizle
  console.log("Mevcut account_plans verileri temizleniyor...");
  const { error: delError } = await supabase.from("account_plans").delete().neq("id", 0);
  if (delError) {
    console.error("Silme hatası:", delError.message);
    // Belki tablo boştur, devam et
  }

  // Batch olarak ekle (500'er)
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("account_plans").insert(batch);
    if (error) {
      console.error(`Batch ${i}-${i + batch.length} hatası:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`  ${inserted}/${rows.length} eklendi`);
    }
  }

  console.log(`\nToplam ${inserted} hesap kodu account_plans tablosuna yüklendi.`);
}

seed().catch(console.error);
