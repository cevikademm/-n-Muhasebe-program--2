import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  matchRule,
  applyRulesToItems,
  learnFromHistory,
  learnFromManualOverride,
  recordRuleHit,
  computeRuleStats,
  loadRulesFromLS,
  EnhancedRule,
} from "../../services/ruleEngine";
import type { Invoice, InvoiceItem } from "../../types";

// ─────────────────────────────────────────
// Yardımcı fabrikalar
// ─────────────────────────────────────────

function makeRule(overrides: Partial<EnhancedRule> = {}): EnhancedRule {
  return {
    id: "r_test_1",
    type: "manual",
    supplier_keyword: undefined,
    description_keywords: [],
    account_code: "4920",
    account_name: "Bürokosten",
    account_name_tr: "Ofis Giderleri",
    confidence: 100,
    hit_count: 0,
    learn_count: 1,
    last_used: new Date().toISOString(),
    active: true,
    note: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeInvoiceItem(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: "item-1",
    invoice_id: "inv-1",
    urun_adi: "Büromaterial",
    miktar: 1,
    kdv_orani: 19,
    satir_toplami: 59.5,
    created_at: new Date().toISOString(),
    description: "Büromaterial",
    quantity: 1,
    unit_price: 50,
    vat_rate: 19,
    vat_amount: 9.5,
    net_amount: 50,
    gross_amount: 59.5,
    account_code: "4920",
    account_name: "Bürokosten",
    account_name_tr: "Ofis Giderleri",
    match_score: 95,
    match_justification: null,
    hgb_reference: null,
    tax_note: null,
    period_note: null,
    expense_type: null,
    datev_counter_account: null,
    match_source: "ai",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    user_id: "user-1",
    fatura_no: "RE-001",
    tarih: "2024-01-15",
    satici_vkn: "",
    alici_vkn: "",
    ara_toplam: 50,
    toplam_kdv: 9.5,
    genel_toplam: 59.5,
    raw_ai_response: null,
    uyarilar: [],
    invoice_number: "RE-001",
    supplier_name: "Staples GmbH",
    invoice_date: "2024-01-15",
    total_net: 50,
    total_vat: 9.5,
    total_gross: 59.5,
    currency: "EUR",
    file_url: null,
    file_type: null,
    status: "analyzed",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────
// matchRule
// ─────────────────────────────────────────

describe("matchRule", () => {
  it("boş kural listesinde eşleşme bulamaz", () => {
    const result = matchRule("Büromaterial", "Staples", []);
    expect(result.matched).toBe(false);
  });

  it("tedarikçi adında eşleşme yapar (büyük/küçük harf duyarsız)", () => {
    const rule = makeRule({ supplier_keyword: "staples" });
    const result = matchRule("herhangi açıklama", "STAPLES GMBH", [rule]);
    expect(result.matched).toBe(true);
    expect(result.matchedOn).toBe("supplier");
    expect(result.matchedKeyword).toBe("staples");
  });

  it("açıklama anahtar kelimesinde eşleşme yapar", () => {
    const rule = makeRule({ description_keywords: ["büromaterial"] });
    const result = matchRule("Büromaterial A4", "BelirsiZ Firma", [rule]);
    expect(result.matched).toBe(true);
    expect(result.matchedOn).toBe("description");
  });

  it("pasif kural eşleştirme yapmaz", () => {
    const rule = makeRule({ supplier_keyword: "staples", active: false });
    const result = matchRule("anything", "Staples GmbH", [rule]);
    expect(result.matched).toBe(false);
  });

  it("manuel kural öğrenilmiş kuraldan önce eşleştirilir", () => {
    const manualRule  = makeRule({ id: "manual", type: "manual", supplier_keyword: "amazon", account_code: "4920" });
    const learnedRule = makeRule({ id: "learned", type: "learned", supplier_keyword: "amazon", account_code: "6900", confidence: 90 });
    const result = matchRule("anything", "amazon.de", [learnedRule, manualRule]);
    expect(result.rule?.id).toBe("manual");
    expect(result.rule?.account_code).toBe("4920");
  });

  it("birden fazla açıklama anahtar kelimesinde ilk eşleşeni döner", () => {
    const rule = makeRule({ description_keywords: ["yazıcı", "büromaterial"] });
    const result = matchRule("büromaterial kağıt", "Herhangi", [rule]);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("büromaterial");
  });

  it("kural eşleşmezse matched=false ve rule=undefined döner", () => {
    const rule = makeRule({ supplier_keyword: "telekom" });
    const result = matchRule("Büromaterial", "Staples", [rule]);
    expect(result.matched).toBe(false);
    expect(result.rule).toBeUndefined();
  });
});

// ─────────────────────────────────────────
// applyRulesToItems
// ─────────────────────────────────────────

describe("applyRulesToItems", () => {
  it("aktif kural yoksa öğeleri değiştirmez", () => {
    const item = makeInvoiceItem({ account_code: "4920" });
    const result = applyRulesToItems([item], "Staples", []);
    expect(result[0].account_code).toBe("4920");
  });

  it("tedarikçi bazlı kural uygulandığında hesap kodunu günceller", () => {
    const rule = makeRule({ supplier_keyword: "staples", account_code: "4980" });
    const item = makeInvoiceItem({ account_code: "9999" });
    const result = applyRulesToItems([item], "Staples GmbH", [rule]);
    expect(result[0].account_code).toBe("4980");
    expect(result[0].match_source).toBe("rule_manual");
  });

  it("Vorsteuer hesapları (1576) kural tarafından override edilmez", () => {
    const rule = makeRule({ supplier_keyword: "staples", account_code: "4920" });
    const item = makeInvoiceItem({ account_code: "1576" });
    const result = applyRulesToItems([item], "Staples GmbH", [rule]);
    expect(result[0].account_code).toBe("1576");
  });

  it("Vorsteuer hesapları tüm kodları korur: 1571, 1573, 1575, 1570, 1400, 1401", () => {
    const rule = makeRule({ supplier_keyword: "test", account_code: "4920" });
    const vorsteuerCodes = ["1571", "1573", "1575", "1570", "1400", "1401"];
    for (const code of vorsteuerCodes) {
      const item = makeInvoiceItem({ account_code: code });
      const result = applyRulesToItems([item], "test gmbh", [rule]);
      expect(result[0].account_code).toBe(code);
    }
  });

  it("öğrenilmiş kural uygulandığında match_source='rule_learned' olur", () => {
    const rule = makeRule({ type: "learned", supplier_keyword: "amazon", account_code: "6850" });
    const item = makeInvoiceItem({ account_code: "9999" });
    const result = applyRulesToItems([item], "amazon.de", [rule]);
    expect(result[0].match_source).toBe("rule_learned");
  });

  it("match_score kural confidence'ı ile güncellenir", () => {
    const rule = makeRule({ supplier_keyword: "otto", account_code: "4800", confidence: 88 });
    const item = makeInvoiceItem({ match_score: 70 });
    const result = applyRulesToItems([item], "Otto Office GmbH", [rule]);
    expect(result[0].match_score).toBe(88);
  });
});

// ─────────────────────────────────────────
// learnFromHistory
// ─────────────────────────────────────────

describe("learnFromHistory", () => {
  it("3'ten az faturada görülen tedarikçi için öneri üretmez", () => {
    const invoices = [makeInvoice({ id: "inv-1" }), makeInvoice({ id: "inv-2" })];
    const items = [
      makeInvoiceItem({ invoice_id: "inv-1", account_code: "4920" }),
      makeInvoiceItem({ invoice_id: "inv-2", account_code: "4920" }),
    ];
    const suggestions = learnFromHistory(items, invoices, []);
    expect(suggestions).toHaveLength(0);
  });

  it("3 farklı faturada görülen tedarikçi için öneri üretir", () => {
    const invoices = [
      makeInvoice({ id: "inv-1", supplier_name: "Staples GmbH" }),
      makeInvoice({ id: "inv-2", supplier_name: "Staples GmbH" }),
      makeInvoice({ id: "inv-3", supplier_name: "Staples GmbH" }),
    ];
    const items = [
      makeInvoiceItem({ invoice_id: "inv-1", account_code: "4920" }),
      makeInvoiceItem({ invoice_id: "inv-2", account_code: "4920" }),
      makeInvoiceItem({ invoice_id: "inv-3", account_code: "4920" }),
    ];
    const suggestions = learnFromHistory(items, invoices, []);
    expect(suggestions.length).toBeGreaterThan(0);
    const supplierSugg = suggestions.find(s => s.rule.supplier_keyword === "Staples GmbH");
    expect(supplierSugg).toBeDefined();
    expect(supplierSugg!.rule.account_code).toBe("4920");
    expect(supplierSugg!.rule.type).toBe("learned");
  });

  it("mevcut kural ile çakışan öneri üretmez", () => {
    const invoices = [
      makeInvoice({ id: "inv-1", supplier_name: "Staples GmbH" }),
      makeInvoice({ id: "inv-2", supplier_name: "Staples GmbH" }),
      makeInvoice({ id: "inv-3", supplier_name: "Staples GmbH" }),
    ];
    const items = [
      makeInvoiceItem({ invoice_id: "inv-1", account_code: "4920" }),
      makeInvoiceItem({ invoice_id: "inv-2", account_code: "4920" }),
      makeInvoiceItem({ invoice_id: "inv-3", account_code: "4920" }),
    ];
    const existing = [makeRule({ supplier_keyword: "Staples GmbH", account_code: "4920" })];
    const suggestions = learnFromHistory(items, invoices, existing);
    const supplierSugg = suggestions.find(
      s => s.rule.supplier_keyword === "Staples GmbH" && s.rule.account_code === "4920"
    );
    expect(supplierSugg).toBeUndefined();
  });

  it("Vorsteuer hesapları için öğrenme önerisi üretmez", () => {
    const invoices = [
      makeInvoice({ id: "inv-1" }),
      makeInvoice({ id: "inv-2" }),
      makeInvoice({ id: "inv-3" }),
    ];
    const items = [
      makeInvoiceItem({ invoice_id: "inv-1", account_code: "1576" }),
      makeInvoiceItem({ invoice_id: "inv-2", account_code: "1576" }),
      makeInvoiceItem({ invoice_id: "inv-3", account_code: "1576" }),
    ];
    const suggestions = learnFromHistory(items, invoices, []);
    expect(suggestions).toHaveLength(0);
  });

  it("güven skoru fatura sayısına göre artar (maks 95)", () => {
    const count = 8;
    const invoices = Array.from({ length: count }, (_, i) =>
      makeInvoice({ id: `inv-${i}`, supplier_name: "BigSupplier" })
    );
    const items = Array.from({ length: count }, (_, i) =>
      makeInvoiceItem({ invoice_id: `inv-${i}`, account_code: "4920" })
    );
    const suggestions = learnFromHistory(items, invoices, []);
    const s = suggestions.find(x => x.rule.supplier_keyword === "BigSupplier");
    expect(s).toBeDefined();
    expect(s!.rule.confidence).toBeLessThanOrEqual(95);
    expect(s!.rule.confidence).toBeGreaterThan(60);
  });
});

// ─────────────────────────────────────────
// learnFromManualOverride
// ─────────────────────────────────────────

describe("learnFromManualOverride", () => {
  it("yeni öğrenilen kural ekler", () => {
    const item = makeInvoiceItem({ description: "Büromaterial bestellen" });
    const result = learnFromManualOverride(item, "Staples GmbH", "4920", "Bürokosten", []);
    const newRule = result.find(r => r.supplier_keyword === "Staples GmbH");
    expect(newRule).toBeDefined();
    expect(newRule!.account_code).toBe("4920");
    expect(newRule!.type).toBe("learned");
    expect(newRule!.active).toBe(true);
  });

  it("aynı tedarikçi için mevcut kuralın learn_count ve confidence'ını artırır", () => {
    const existing = makeRule({
      type: "learned",
      supplier_keyword: "Staples GmbH",
      account_code: "4920",
      confidence: 78,
      learn_count: 1,
    });
    const item = makeInvoiceItem({ description: "Toner cartridge" });
    const result = learnFromManualOverride(item, "Staples GmbH", "4920", "Bürokosten", [existing]);
    const updated = result.find(r => r.id === existing.id);
    expect(updated!.learn_count).toBe(2);
    expect(updated!.confidence).toBeGreaterThan(78);
  });

  it("aynı tedarikçi farklı kod için önceki kuralı pasifleştirir", () => {
    const existing = makeRule({
      type: "learned",
      supplier_keyword: "Staples GmbH",
      account_code: "6900",
    });
    const item = makeInvoiceItem({ description: "Toner" });
    const result = learnFromManualOverride(item, "Staples GmbH", "4920", "Bürokosten", [existing]);
    const old = result.find(r => r.id === existing.id);
    expect(old!.active).toBe(false);
  });

  it("açıklama tokenlarından da öğrenilen kurallar ekler", () => {
    const item = makeInvoiceItem({ description: "Büromaterial A4 Papier bestellen" });
    const result = learnFromManualOverride(item, "", "4920", "Bürokosten", []);
    const tokenRules = result.filter(r => r.description_keywords && r.description_keywords.length > 0);
    expect(tokenRules.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────
// recordRuleHit
// ─────────────────────────────────────────

describe("recordRuleHit", () => {
  it("doğru kural id ile hit_count'u artırır", () => {
    const rules = [
      makeRule({ id: "rule-1", hit_count: 5 }),
      makeRule({ id: "rule-2", hit_count: 2 }),
    ];
    const updated = recordRuleHit(rules, "rule-1");
    expect(updated.find(r => r.id === "rule-1")!.hit_count).toBe(6);
    expect(updated.find(r => r.id === "rule-2")!.hit_count).toBe(2);
  });

  it("yanlış id verilince hiçbir kural değişmez", () => {
    const rules = [makeRule({ id: "rule-1", hit_count: 3 })];
    const updated = recordRuleHit(rules, "non-existent");
    expect(updated[0].hit_count).toBe(3);
  });

  it("last_used güncellenmiş tarih içerir", () => {
    const oldDate = "2020-01-01T00:00:00.000Z";
    const rule = makeRule({ id: "rule-1", last_used: oldDate });
    const updated = recordRuleHit([rule], "rule-1");
    expect(updated[0].last_used).not.toBe(oldDate);
  });
});

// ─────────────────────────────────────────
// computeRuleStats
// ─────────────────────────────────────────

describe("computeRuleStats", () => {
  it("boş kural listesinde sıfır istatistik döner", () => {
    const stats = computeRuleStats([]);
    expect(stats.totalRules).toBe(0);
    expect(stats.manualRules).toBe(0);
    expect(stats.learnedRules).toBe(0);
    expect(stats.activeRules).toBe(0);
    expect(stats.avgConfidence).toBe(0);
    expect(stats.topAccountCodes).toHaveLength(0);
  });

  it("manuel ve öğrenilmiş kural sayısını doğru hesaplar", () => {
    const rules = [
      makeRule({ type: "manual" }),
      makeRule({ id: "r2", type: "learned", confidence: 80 }),
      makeRule({ id: "r3", type: "learned", confidence: 70 }),
    ];
    const stats = computeRuleStats(rules);
    expect(stats.totalRules).toBe(3);
    expect(stats.manualRules).toBe(1);
    expect(stats.learnedRules).toBe(2);
  });

  it("aktif kural sayısını doğru hesaplar", () => {
    const rules = [
      makeRule({ id: "r1", active: true }),
      makeRule({ id: "r2", active: false }),
      makeRule({ id: "r3", active: true }),
    ];
    const stats = computeRuleStats(rules);
    expect(stats.activeRules).toBe(2);
  });

  it("ortalama güven skorunu doğru hesaplar", () => {
    const rules = [
      makeRule({ id: "r1", confidence: 100 }),
      makeRule({ id: "r2", confidence: 80 }),
      makeRule({ id: "r3", confidence: 60 }),
    ];
    const stats = computeRuleStats(rules);
    expect(stats.avgConfidence).toBe(80);
  });

  it("topAccountCodes hit_count'a göre sıralı döner", () => {
    const rules = [
      makeRule({ id: "r1", account_code: "4920", hit_count: 10 }),
      makeRule({ id: "r2", account_code: "6900", hit_count: 25 }),
      makeRule({ id: "r3", account_code: "4980", hit_count: 5 }),
    ];
    const stats = computeRuleStats(rules);
    expect(stats.topAccountCodes[0].code).toBe("6900");
    expect(stats.topAccountCodes[1].code).toBe("4920");
    expect(stats.topAccountCodes[2].code).toBe("4980");
  });
});

// ─────────────────────────────────────────
// loadRulesFromLS
// ─────────────────────────────────────────

describe("loadRulesFromLS", () => {
  beforeEach(() => localStorage.clear());

  it("localStorage boşken boş dizi döner", () => {
    const rules = loadRulesFromLS();
    expect(rules).toEqual([]);
  });

  it("localStorage'dan doğru kuralları yükler", () => {
    const rule = makeRule();
    localStorage.setItem("muhasys_settings", JSON.stringify({ rules: [rule] }));
    const loaded = loadRulesFromLS();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].account_code).toBe("4920");
  });

  it("geçersiz JSON'da boş dizi döner", () => {
    localStorage.setItem("muhasys_settings", "INVALID_JSON");
    const rules = loadRulesFromLS();
    expect(rules).toEqual([]);
  });

  it("eksik alanları varsayılan değerlerle doldurur", () => {
    const partial = { account_code: "4920", account_name: "Test" };
    localStorage.setItem("muhasys_settings", JSON.stringify({ rules: [partial] }));
    const loaded = loadRulesFromLS();
    expect(loaded[0].active).toBe(true);
    expect(loaded[0].hit_count).toBe(0);
    expect(typeof loaded[0].id).toBe("string");
  });
});
