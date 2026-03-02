/**
 * MuhaSys — Akıllı Kural Motoru
 * ─────────────────────────────────────────────────────
 * 3 katmanlı eşleştirme sistemi:
 *   1. Manuel kurallar  (type:'manual',  öncelik=1, güven=100)
 *   2. Öğrenilen kurallar (type:'learned', öncelik=2, güven=60-95)
 *   3. AI Fallback       (geminiService — değiştirilmez)
 *
 * Öğrenme eşiği: 3 farklı faturada görülürse kural önerilir
 * Manuel override: anında otomatik kaydedilir
 */

import { InvoiceItem, Invoice } from "../types";
import { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────

export interface EnhancedRule {
  id: string;
  type: "manual" | "learned";
  /** Tedarikçi adında arama (OR — büyük/küçük harf duyarsız) */
  supplier_keyword?: string;
  /** Kalem açıklamasında arama (OR — her token ayrı kontrol) */
  description_keywords?: string[];
  account_code: string;
  account_name: string;
  account_name_tr?: string;
  /** 0-100. manual→100, learned→60-95 */
  confidence: number;
  /** Toplam kural tetikleme sayısı */
  hit_count: number;
  /** Kaç farklı faturadan öğrenildi */
  learn_count: number;
  /** Son kullanım ISO tarihi */
  last_used: string;
  /** Kural aktif mi */
  active: boolean;
  note?: string;
  created_at: string;
  updated_at: string;
}

export interface RuleMatchResult {
  matched: boolean;
  rule?: EnhancedRule;
  matchedOn?: "supplier" | "description";
  matchedKeyword?: string;
}

export interface LearnSuggestion {
  rule: EnhancedRule;
  /** Tespit edilen tedarikçi örnekleri */
  supplierExamples: string[];
  /** Tespit edilen açıklama örnekleri */
  descriptionExamples: string[];
}

// ─────────────────────────────────────────
// STOP WORDS (tokenizer'dan çıkarılır)
// ─────────────────────────────────────────

const STOP_WORDS = new Set([
  // Almanca
  "und", "oder", "der", "die", "das", "ein", "eine", "für", "von", "mit", "bei", "in", "an",
  "auf", "zu", "ist", "sind", "wird", "werden", "nach", "aus", "als", "auch", "noch", "nur",
  "alle", "sich", "dem", "den", "des", "vom", "zur", "zum", "bis", "per", "pro", "st",
  // Türkçe
  "ve", "ya", "ile", "bir", "bu", "şu", "o", "için", "de", "da", "ki", "ne", "mi", "mu", "çok",
  "daha", "gibi", "ise", "ama", "fakat", "ancak", "veya", "hem", "adet", "ad", "no", "nr",
  // Sayılar ve tek karakterler
  ...Array.from({ length: 10 }, (_, i) => String(i)),
]);

/** Açıklamayı anlamlı tokenlara böler */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-züöäáéíóúşçığ\s]/gi, " ")
    .split(/\s+/)
    .filter(t => t.length >= 4 && !STOP_WORDS.has(t));
}

/** Geçerli ISO tarih string'i döndürür */
const now = () => new Date().toISOString();

/** UUID benzeri ID */
const uid = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Vorsteuer kodları — hiçbir zaman override edilmez
const VORSTEUER = new Set(["1576", "1571", "1573", "1575", "1570", "1400", "1401"]);

// ─────────────────────────────────────────
// STORAGE HELPERS
// ⚠ GÜVENLİK (DSK-02): localStorage yalnızca önbellek olarak kullanılmalıdır.
// Hassas veriler (kurallar, ayarlar) sunucu tarafında saklanmalıdır.
// XSS saldırısında localStorage verileri çalınabilir.
// ─────────────────────────────────────────

const LS_KEY = "muhasys_settings";

function lsLoad(): { rules?: EnhancedRule[];[key: string]: any } {
  try {
    const r = localStorage.getItem(LS_KEY);
    return r ? JSON.parse(r) : {};
  } catch { return {}; }
}

function lsSave(data: object) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { }
}

export function loadRulesFromLS(): EnhancedRule[] {
  const raw = lsLoad().rules;
  if (!Array.isArray(raw)) return [];
  // Backward compat: eski düz kural formatını EnhancedRule'a çevir
  return raw.map((r: any) => ({
    id: r.id || uid(),
    type: r.type || "manual",
    supplier_keyword: r.supplier_keyword || undefined,
    description_keywords: Array.isArray(r.description_keywords) ? r.description_keywords : [],
    account_code: r.account_code || "",
    account_name: r.account_name || r.account_name_tr || "",
    account_name_tr: r.account_name_tr || r.account_name || "",
    confidence: r.confidence ?? (r.type === "learned" ? 75 : 100),
    hit_count: r.hit_count ?? 0,
    learn_count: r.learn_count ?? 1,
    last_used: r.last_used ?? r.created_at ?? now(),
    active: r.active !== false,
    note: r.note || "",
    created_at: r.created_at || now(),
    updated_at: r.updated_at || now(),
  }));
}

export async function saveRulesToSupabase(
  rules: EnhancedRule[],
  userId: string,
  supabase: SupabaseClient
): Promise<void> {
  // Önce localStorage'a yaz (hızlı)
  const current = lsLoad();
  lsSave({ ...current, rules });

  // Sonra Supabase'e
  try {
    await supabase
      .from("user_settings")
      .upsert({ user_id: userId, rules }, { onConflict: "user_id" });
  } catch (e) {
    console.warn("[RuleEngine] Supabase kayıt hatası:", e);
  }
}

export async function loadRulesFromSupabase(
  userId: string,
  supabase: SupabaseClient
): Promise<EnhancedRule[]> {
  try {
    const { data } = await supabase
      .from("user_settings")
      .select("rules")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.rules && Array.isArray(data.rules)) {
      const loaded = data.rules as EnhancedRule[];
      // Sync to localStorage
      const current = lsLoad();
      lsSave({ ...current, rules: loaded });
      return loaded;
    }
  } catch { }
  return loadRulesFromLS();
}

// ─────────────────────────────────────────
// KURAL EŞLEŞTİRME
// ─────────────────────────────────────────

/**
 * Tek bir kalem için kural arar.
 * Manuel kurallar önce kontrol edilir, sonra öğrenilen.
 */
export function matchRule(
  itemDescription: string,
  supplierName: string,
  rules: EnhancedRule[]
): RuleMatchResult {
  if (!rules.length) return { matched: false };

  const descLower = (itemDescription || "").toLowerCase();
  const supplierLower = (supplierName || "").toLowerCase();

  const ordered = [
    ...rules.filter(r => r.active && r.type === "manual"),
    ...rules.filter(r => r.active && r.type === "learned").sort((a, b) => b.confidence - a.confidence),
  ];

  for (const rule of ordered) {
    // --- Tedarikçi eşleştirme ---
    if (rule.supplier_keyword?.trim()) {
      if (supplierLower.includes(rule.supplier_keyword.toLowerCase().trim())) {
        return { matched: true, rule, matchedOn: "supplier", matchedKeyword: rule.supplier_keyword };
      }
    }

    // --- Açıklama anahtar kelime eşleştirme ---
    if (rule.description_keywords?.length) {
      for (const kw of rule.description_keywords) {
        if (kw && descLower.includes(kw.toLowerCase().trim())) {
          return { matched: true, rule, matchedOn: "description", matchedKeyword: kw };
        }
      }
    }
  }

  return { matched: false };
}

/**
 * Tüm faturaları AI çıktısına UYGULAr (post-process).
 * Vorsteuer satırları dokunulmaz.
 * geminiService'i değiştirmeden description_keywords desteği eklenir.
 */
export function applyRulesToItems(
  items: any[],
  supplierName: string,
  rules: EnhancedRule[]
): any[] {
  if (!rules.filter(r => r.active).length) return items;

  return items.map(item => {
    if (VORSTEUER.has(String(item.account_code || "").trim())) return item;

    const result = matchRule(item.description || "", supplierName, rules);
    if (!result.matched || !result.rule) return item;

    return {
      ...item,
      account_code: result.rule.account_code,
      account_name: result.rule.account_name,
      account_name_tr: result.rule.account_name_tr || result.rule.account_name,
      match_score: result.rule.confidence,
      match_source: result.rule.type === "manual" ? "rule_manual" : "rule_learned",
      match_justification:
        `${item.match_justification || ""} [${result.rule.type === "manual" ? "Manuel kural" : "Öğrenilen kural"}: "${result.matchedKeyword}" → ${result.rule.account_code}]`.trim(),
    };
  });
}

// ─────────────────────────────────────────
// ÖĞRENME: GEÇMİŞ ANALİZİ
// ─────────────────────────────────────────

interface GroupEntry {
  account_code: string;
  account_name: string;
  invoiceIds: Set<string>;    // farklı fatura sayısı için
  examples: string[];
}

const MIN_INVOICE_COUNT = 3;   // en az 3 farklı faturada görülmeli

/**
 * Tüm invoice_items geçmişinden öğrenilen kural önerileri üretir.
 * Tedarikçi bazlı + açıklama token bazlı gruplama yapar.
 */
export function learnFromHistory(
  items: InvoiceItem[],
  invoices: Invoice[],
  existing: EnhancedRule[]
): LearnSuggestion[] {
  const invMap = new Map(invoices.map(i => [i.id, i]));

  // ── Tedarikçi → hesap kodu gruplaması
  const supplierGroups = new Map<string, Map<string, GroupEntry>>();
  // ── Token → hesap kodu gruplaması
  const tokenGroups = new Map<string, Map<string, GroupEntry>>();

  for (const item of items) {
    if (!item.account_code || VORSTEUER.has(item.account_code.trim())) continue;
    if (!item.invoice_id) continue;
    const inv = invMap.get(item.invoice_id);
    const code = item.account_code.trim();
    const name = item.account_name || item.account_name_tr || "";
    const invId = item.invoice_id;

    // Tedarikçi gruplaması
    const supplier = (inv?.supplier_name || "").trim();
    if (supplier) {
      if (!supplierGroups.has(supplier)) supplierGroups.set(supplier, new Map());
      const sg = supplierGroups.get(supplier)!;
      if (!sg.has(code)) sg.set(code, { account_code: code, account_name: name, invoiceIds: new Set(), examples: [] });
      const e = sg.get(code)!;
      e.invoiceIds.add(invId);
      if (e.examples.length < 3) e.examples.push(supplier);
    }

    // Token gruplaması
    const tokens = tokenize(item.description || "");
    for (const token of tokens) {
      if (!tokenGroups.has(token)) tokenGroups.set(token, new Map());
      const tg = tokenGroups.get(token)!;
      if (!tg.has(code)) tg.set(code, { account_code: code, account_name: name, invoiceIds: new Set(), examples: [] });
      const e = tg.get(code)!;
      e.invoiceIds.add(invId);
      if (e.examples.length < 3) e.examples.push(item.description || "");
    }
  }

  const suggestions: LearnSuggestion[] = [];
  const seenKey = new Set<string>();

  // ── Tedarikçi önerileri
  for (const [supplier, codeMap] of supplierGroups) {
    // En çok görülen kodu bul
    let best: GroupEntry | null = null;
    for (const entry of codeMap.values()) {
      if (!best || entry.invoiceIds.size > best.invoiceIds.size) best = entry;
    }
    if (!best || best.invoiceIds.size < MIN_INVOICE_COUNT) continue;

    const key = `supplier:${supplier.toLowerCase()}:${best.account_code}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    // Mevcut kuralla çakışma var mı?
    const alreadyExists = existing.some(
      r => r.supplier_keyword?.toLowerCase() === supplier.toLowerCase() &&
        r.account_code === best!.account_code
    );
    if (alreadyExists) continue;

    const count = best.invoiceIds.size;
    suggestions.push({
      rule: {
        id: uid(),
        type: "learned",
        supplier_keyword: supplier,
        description_keywords: [],
        account_code: best.account_code,
        account_name: best.account_name,
        confidence: Math.min(95, 60 + count * 5),
        hit_count: 0,
        learn_count: count,
        last_used: now(),
        active: true,
        note: "",
        created_at: now(),
        updated_at: now(),
      },
      supplierExamples: [supplier],
      descriptionExamples: best.examples,
    });
  }

  // ── Token önerileri (en az 3 farklı fatura, farklı tedarikçilerden de gelebilir)
  for (const [token, codeMap] of tokenGroups) {
    let best: GroupEntry | null = null;
    for (const entry of codeMap.values()) {
      if (!best || entry.invoiceIds.size > best.invoiceIds.size) best = entry;
    }
    if (!best || best.invoiceIds.size < MIN_INVOICE_COUNT) continue;

    const key = `token:${token}:${best.account_code}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    // Mevcut kurallarda bu token zaten var mı?
    const alreadyExists = existing.some(
      r => r.description_keywords?.includes(token) && r.account_code === best!.account_code
    );
    if (alreadyExists) continue;

    const count = best.invoiceIds.size;
    suggestions.push({
      rule: {
        id: uid(),
        type: "learned",
        supplier_keyword: undefined,
        description_keywords: [token],
        account_code: best.account_code,
        account_name: best.account_name,
        confidence: Math.min(92, 55 + count * 5),
        hit_count: 0,
        learn_count: count,
        last_used: now(),
        active: false,   // önerilen ama aktif değil — kullanıcı onaylamalı
        note: "",
        created_at: now(),
        updated_at: now(),
      },
      supplierExamples: [],
      descriptionExamples: best.examples.slice(0, 2),
    });
  }

  // Güven skoru yüksek önce
  return suggestions.sort((a, b) => b.rule.confidence - a.rule.confidence).slice(0, 50);
}

// ─────────────────────────────────────────
// ÖĞRENME: MANUEL OVERRIDE
// ─────────────────────────────────────────

/**
 * Kullanıcı bir fatura kalemi için manuel kod değiştirince çağrılır.
 * - Tedarikçi bazlı kural günceller/oluşturur
 * - Açıklama token bazlı kural günceller/oluşturur
 * Anında kayıt → geminiService'i değiştirmez
 */
export function learnFromManualOverride(
  item: InvoiceItem & { account_name?: string },
  supplierName: string,
  newAccountCode: string,
  newAccountName: string,
  currentRules: EnhancedRule[]
): EnhancedRule[] {
  let rules = [...currentRules];
  const ts = now();

  // ── Tedarikçi bazlı öğrenme
  if (supplierName) {
    const existing = rules.find(
      r => r.type === "learned" &&
        r.supplier_keyword?.toLowerCase() === supplierName.toLowerCase() &&
        r.account_code === newAccountCode
    );
    if (existing) {
      existing.learn_count = (existing.learn_count || 1) + 1;
      existing.confidence = Math.min(95, (existing.confidence || 75) + 3);
      existing.updated_at = ts;
      existing.last_used = ts;
      existing.active = true;
    } else {
      // Aynı tedarikçi için farklı kod varsa devre dışı bırak
      rules = rules.map(r =>
        r.supplier_keyword?.toLowerCase() === supplierName.toLowerCase() && r.account_code !== newAccountCode
          ? { ...r, active: false, updated_at: ts }
          : r
      );
      rules.push({
        id: uid(),
        type: "learned",
        supplier_keyword: supplierName,
        description_keywords: [],
        account_code: newAccountCode,
        account_name: newAccountName,
        confidence: 78,
        hit_count: 0,
        learn_count: 1,
        last_used: ts,
        active: true,
        note: "Manuel düzeltmeden öğrenildi",
        created_at: ts,
        updated_at: ts,
      });
    }
  }

  // ── Açıklama token bazlı öğrenme
  const tokens = tokenize(item.description || "").slice(0, 5);
  for (const token of tokens) {
    const existing = rules.find(
      r => r.type === "learned" &&
        r.description_keywords?.includes(token) &&
        r.account_code === newAccountCode
    );
    if (existing) {
      existing.learn_count = (existing.learn_count || 1) + 1;
      existing.confidence = Math.min(90, (existing.confidence || 65) + 3);
      existing.updated_at = ts;
      existing.last_used = ts;
      existing.active = true;
    } else {
      rules.push({
        id: uid(),
        type: "learned",
        supplier_keyword: undefined,
        description_keywords: [token],
        account_code: newAccountCode,
        account_name: newAccountName,
        confidence: 65,
        hit_count: 0,
        learn_count: 1,
        last_used: ts,
        active: true,
        note: "Manuel düzeltmeden öğrenildi",
        created_at: ts,
        updated_at: ts,
      });
    }
  }

  return rules;
}

// ─────────────────────────────────────────
// KURAL HIT SAYACI
// ─────────────────────────────────────────

/** Kural kullanıldığında hit_count ve last_used günceller */
export function recordRuleHit(rules: EnhancedRule[], ruleId: string): EnhancedRule[] {
  return rules.map(r => r.id === ruleId
    ? { ...r, hit_count: r.hit_count + 1, last_used: now() }
    : r
  );
}

// ─────────────────────────────────────────
// İSTATİSTİK
// ─────────────────────────────────────────

export interface RuleStats {
  totalRules: number;
  manualRules: number;
  learnedRules: number;
  activeRules: number;
  topAccountCodes: { code: string; name: string; hitCount: number; ruleCount: number }[];
  avgConfidence: number;
}

export function computeRuleStats(rules: EnhancedRule[]): RuleStats {
  const manual = rules.filter(r => r.type === "manual");
  const learned = rules.filter(r => r.type === "learned");
  const active = rules.filter(r => r.active);

  const codeMap = new Map<string, { name: string; hitCount: number; ruleCount: number }>();
  for (const r of rules) {
    const existing = codeMap.get(r.account_code);
    if (existing) {
      existing.hitCount += r.hit_count;
      existing.ruleCount += 1;
    } else {
      codeMap.set(r.account_code, { name: r.account_name, hitCount: r.hit_count, ruleCount: 1 });
    }
  }

  const topAccountCodes = Array.from(codeMap.entries())
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.hitCount - a.hitCount || b.ruleCount - a.ruleCount)
    .slice(0, 10);

  const avgConfidence = rules.length
    ? Math.round(rules.reduce((s, r) => s + r.confidence, 0) / rules.length)
    : 0;

  return {
    totalRules: rules.length,
    manualRules: manual.length,
    learnedRules: learned.length,
    activeRules: active.length,
    topAccountCodes,
    avgConfidence,
  };
}
