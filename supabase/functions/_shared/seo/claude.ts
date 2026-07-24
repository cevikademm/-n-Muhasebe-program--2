// @ts-nocheck
// ──────────────────────────────────────────────────────────────────
// Claude çağrısı — SEO ajanının tek dış bağımlılığı
// ──────────────────────────────────────────────────────────────────
// Anahtar YALNIZCA bu Deno ortamında yaşar; tarayıcıya asla inmez.
// (analyze-bank/index.ts'teki desenin aynısı — orada da ANTHROPIC_API_KEY
// yalnızca Edge tarafında okunuyor.)
//
// Üç şey bu dosyada kilitlenir:
//   1. Model  → claude-haiku-4-5 (EN DÜŞÜK MALİYET tier'ı; $1/$5 per MTok)
//   2. Canlı web araması → sunucu taraflı web_search aracı
//   3. Çıktı biçimi      → structured output (JSON şeması)
//
// ⚠ HAIKU'NUN API FARKLARI (Opus'tan taşırken tökezlenen yerler):
//   · `thinking: {type:"adaptive"}` DESTEKLENMEZ → gönderilmez (Haiku hızlı
//     model; düşünme kapalı, maliyet de düşük kalır).
//   · `output_config.effort` Haiku'da 400 döndürür → gönderilmez.
//   · web arama aracı `web_search_20260209` (dinamik filtreleme) yalnızca
//     Opus/Sonnet tier'ında; Haiku için temel sürüm `web_search_20250305`.
//   · structured output (output_config.format) Haiku 4.5'te DESTEKLİ.
//
// NOT: `citations` AÇILMAZ — structured output ile birlikte 400 döner.
// Kaynak izini şemanın kendi `kaynak` alanı taşır.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

/**
 * Sunucu taraflı arama, bir turda 10 iç döngüyü aşarsa API `pause_turn`
 * döndürür ve turu geri göndermemizi bekler. Sonsuz döngüye girmemek için
 * devam sayısı sınırlanır.
 */
const AZAMI_DEVAM = 3;

export interface ClaudeSonucu<T> {
  veri: T;
  model: string;
  girdiToken: number;
  ciktiToken: number;
  /** Modelin arama yaptığı sorgular — kullanıcıya "neye baktı" diye gösterilir. */
  aramalar: string[];
}

/** Yanıt gövdesinden son metin bloğunu çıkarır (araç blokları arada duruyor). */
function metniTopla(content: any[]): string {
  const metinler = (content ?? [])
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text.trim())
    .filter(Boolean);
  return metinler.length ? metinler[metinler.length - 1] : "";
}

function aramalariTopla(content: any[], biriken: string[]): void {
  for (const b of content ?? []) {
    if (b?.type === "server_tool_use" && b?.name === "web_search") {
      const q = b?.input?.query;
      if (q) biriken.push(String(q));
    }
  }
}

/**
 * Model bazen JSON'u ``` bloğuna sarabiliyor (structured output ile nadir ama
 * mümkün). analyze-bank'teki temizleme mantığının aynısı.
 */
function jsonAyikla(ham: string): unknown {
  let temiz = String(ham ?? "").replace(/```json|```/g, "").trim();
  const ilk = temiz.indexOf("{");
  const son = temiz.lastIndexOf("}");
  if (ilk !== -1 && son > ilk) temiz = temiz.substring(ilk, son + 1);
  if (!temiz) throw new Error("AI boş yanıt döndürdü.");
  return JSON.parse(temiz);
}

export interface CagriSecenekleri {
  sistem: string;
  kullanici: string;
  sema: unknown;
  /** low | medium | high | xhigh | max — gönderi başına 'medium', taramada 'high'. */
  efor?: string;
  /** Canlı web araması yapılsın mı ve en fazla kaç arama. */
  webArama?: boolean;
  aramaAzami?: number;
  maksToken?: number;
}

/**
 * Tek bir yapılandırılmış Claude çağrısı.
 * Hata durumunda ATAR — çağıran fonksiyon kullanıcıya dönecek mesajı kendi seçer.
 */
export async function seoCagrisi<T = unknown>(
  o: CagriSecenekleri,
): Promise<ClaudeSonucu<T>> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!apiKey) throw new Error("AI servisi yapılandırılmamış (ANTHROPIC_API_KEY yok).");

  const araclar = o.webArama === false
    ? []
    // Haiku temel web arama aracını kullanır (dinamik filtrelemeli
    // _20260209 yalnızca Opus/Sonnet tier'ında).
    : [{
        type: "web_search_20250305",
        name: "web_search",
        max_uses: Math.min(Math.max(o.aramaAzami ?? 3, 1), 8),
      }];

  // Haiku için sade gövde: ne thinking, ne effort — ikisi de bu modelde
  // ya yok sayılır ya 400 döndürür. Yalnızca structured output biçimi.
  const govde: Record<string, unknown> = {
    model: MODEL,
    max_tokens: o.maksToken ?? 8000,
    output_config: {
      format: { type: "json_schema", schema: o.sema },
    },
    system: o.sistem,
    messages: [{ role: "user", content: o.kullanici }],
  };
  if (araclar.length) govde.tools = araclar;

  const aramalar: string[] = [];
  const mesajlar: any[] = [...(govde.messages as any[])];
  let girdiToken = 0;
  let ciktiToken = 0;

  for (let devam = 0; devam <= AZAMI_DEVAM; devam++) {
    let cevap: Response;
    try {
      cevap = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ ...govde, messages: mesajlar }),
      });
    } catch (e) {
      console.error("[seo] Anthropic bağlantı hatası:", e);
      throw new Error("AI servisine ulaşılamıyor.");
    }

    if (!cevap.ok) {
      const hataMetni = await cevap.text();
      console.error("[seo] Anthropic hatası:", cevap.status, hataMetni.substring(0, 500));
      if (cevap.status === 429) throw new Error("AI servisi yoğun, biraz sonra tekrar deneyin.");
      throw new Error(`AI servisi hatası (${cevap.status}).`);
    }

    const veri = await cevap.json();
    girdiToken += veri?.usage?.input_tokens ?? 0;
    ciktiToken += veri?.usage?.output_tokens ?? 0;
    aramalariTopla(veri?.content, aramalar);

    // Güvenlik sınıflandırıcısı isteği reddettiyse içerik OKUNMAZ.
    if (veri?.stop_reason === "refusal") {
      throw new Error("AI bu içerik için metin üretmeyi reddetti.");
    }

    // Sunucu taraflı arama döngüsü doldu → turu geri gönderip devam ettir.
    if (veri?.stop_reason === "pause_turn") {
      mesajlar.push({ role: "assistant", content: veri.content });
      continue;
    }

    if (veri?.stop_reason === "max_tokens") {
      throw new Error("AI yanıtı sığmadı; daha az platform/dil seçip tekrar deneyin.");
    }

    return {
      veri: jsonAyikla(metniTopla(veri?.content)) as T,
      model: veri?.model || MODEL,
      girdiToken,
      ciktiToken,
      aramalar,
    };
  }

  throw new Error("AI araması beklenenden uzun sürdü, tekrar deneyin.");
}
