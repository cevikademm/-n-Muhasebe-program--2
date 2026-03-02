import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  EnhancedRule, LearnSuggestion,
  learnFromHistory, computeRuleStats,
} from "../../services/ruleEngine";
import { Invoice, InvoiceItem } from "../../types";
import { useLang } from "../../LanguageContext";
import { supabase } from "../../services/supabaseService";

interface Props {
  userId: string | undefined;
  userRole: string;
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  flash: (text: string, ok?: boolean) => void;
}

const LS_KEY = "fibu_de_settings";
const lsGet = () => { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
const lsSet = (d: any) => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { } };

export const SettingsMatchingTab: React.FC<Props> = ({ userId, userRole, invoices, invoiceItems, flash }) => {
  const { lang } = useLang();
  const tr = (a: string, b: string) => lang === "tr" ? a : b;

  const [rules, setRules] = useState<EnhancedRule[]>([]);
  const [suggestions, setSuggestions] = useState<LearnSuggestion[]>([]);
  const [learnLoading, setLearnLoading] = useState(false);
  const [ruleSubTab, setRuleSubTab] = useState<"manual" | "learned" | "stats">("manual");
  const [editingRule, setEditingRule] = useState<EnhancedRule | null>(null);
  const [newRule, setNewRule] = useState({ supplier_keyword: "", description_keywords: "", account_code: "", account_name: "", note: "" });
  const [saving, setSaving] = useState(false);

  const now = () => new Date().toISOString();
  const uid = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const loadRules = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("user_settings").select("rules")
        .eq("user_id", userId).maybeSingle();

      const sbRules: EnhancedRule[] = (!error && data && Array.isArray(data.rules))
        ? (data.rules as EnhancedRule[]) : [];

      const local = lsGet();
      const lsRules: EnhancedRule[] = Array.isArray(local?.rules) ? local.rules : [];

      let reRules: EnhancedRule[] = [];
      try {
        const reRaw = localStorage.getItem("fibu_rules") ||
          localStorage.getItem("muhasys_rules") ||
          localStorage.getItem("enhanced_rules");
        if (reRaw) reRules = JSON.parse(reRaw) as EnhancedRule[];
      } catch { /* ignore */ }

      const mergedMap = new Map<string, EnhancedRule>();
      [...reRules, ...lsRules, ...sbRules].forEach(r => { if (r?.id) mergedMap.set(r.id, r); });
      const mergedRules = Array.from(mergedMap.values());

      console.log(`[MatchingTab] Kurallar: SB=${sbRules.length}, LS=${lsRules.length}, RE=${reRules.length}, Birleşik=${mergedRules.length}`);
      setRules(mergedRules);
    } catch (err) {
      console.error("[MatchingTab] loadRules hatası:", err);
      const local = lsGet();
      if (Array.isArray(local?.rules)) setRules(local.rules);
    }
  }, [userId]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const saveRules = async (updated: EnhancedRule[]) => {
    if (!userId) throw new Error("Oturum yok");
    setRules(updated);
    const local = lsGet() || {};
    const merged = { ...local, rules: updated };
    const { error } = await supabase.from("user_settings")
      .upsert({ user_id: userId, ...merged }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    lsSet(merged);
  };

  const addRule = async () => {
    if (!newRule.account_code) { flash(tr("Hesap kodu zorunlu!", "Konto erforderlich!"), false); return; }
    if (!newRule.supplier_keyword && !newRule.description_keywords.trim()) {
      flash(tr("Tedarikçi veya anahtar kelime girin", "Lieferant oder Schlüsselwort eingeben"), false); return;
    }
    setSaving(true);
    try {
      const kwds = newRule.description_keywords.split(",").map(s => s.trim()).filter(Boolean);
      const rule: EnhancedRule = {
        id: uid(), type: "manual",
        supplier_keyword: newRule.supplier_keyword.trim() || undefined,
        description_keywords: kwds,
        account_code: newRule.account_code.trim(),
        account_name: newRule.account_name.trim(),
        confidence: 100, hit_count: 0, learn_count: 0,
        last_used: now(), active: true,
        note: newRule.note.trim(), created_at: now(), updated_at: now(),
      };
      await saveRules([rule, ...rules]);
      setNewRule({ supplier_keyword: "", description_keywords: "", account_code: "", account_name: "", note: "" });
      flash(tr("✓ Kural eklendi", "✓ Regel hinzugefügt"));
    } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const delRule = async (id: string) => {
    setSaving(true);
    try { await saveRules(rules.filter(r => r.id !== id)); flash(tr("Kural silindi", "Regel gelöscht")); }
    catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const toggleRule = async (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, active: !r.active, updated_at: now() } : r);
    try { await saveRules(updated); } catch (e: any) { flash(e.message, false); }
  };

  const saveEditingRule = async () => {
    if (!editingRule) return;
    setSaving(true);
    try {
      const updated = rules.map(r => r.id === editingRule.id ? { ...editingRule, updated_at: now() } : r);
      await saveRules(updated); setEditingRule(null);
      flash(tr("✓ Kural güncellendi", "✓ Regel aktualisiert"));
    } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const acceptSuggestion = async (sug: LearnSuggestion) => {
    setSaving(true);
    try {
      const rule: EnhancedRule = { ...sug.rule, active: true, updated_at: now() };
      await saveRules([...rules, rule]);
      setSuggestions(prev => prev.filter(s => s.rule.id !== sug.rule.id));
      flash(tr("✓ Kural öğrenildi", "✓ Regel gelernt"));
    } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const acceptAllSuggestions = async () => {
    if (!suggestions.length) return;
    setSaving(true);
    try {
      const newRules: EnhancedRule[] = suggestions.map(s => ({ ...s.rule, active: true, updated_at: now() }));
      const existingIds = new Set(rules.map(r => r.id));
      const toAdd = newRules.filter(r => !existingIds.has(r.id));
      await saveRules([...rules, ...toAdd]);
      setSuggestions([]);
      flash(tr(`✓ ${toAdd.length} kural öğrenildi ve aktif edildi`, `✓ ${toAdd.length} Regeln gelernt und aktiviert`));
    } catch (e: any) { flash(e.message, false); } finally { setSaving(false); }
  };

  const dismissSuggestion = (id: string) => {
    setSuggestions(prev => prev.filter(s => s.rule.id !== id));
  };

  const runLearnFromHistory = useCallback(async () => {
    if (!invoices.length || !invoiceItems.length) {
      flash(tr("Öğrenilecek fatura verisi yok", "Keine Rechnungsdaten zum Lernen"), false); return;
    }
    setLearnLoading(true);
    try {
      const sugs = learnFromHistory(invoiceItems, invoices, rules);
      setSuggestions(sugs);
      if (sugs.length === 0) flash(tr("Yeni öneri bulunamadı (eşik: 3 fatura)", "Keine neuen Vorschläge (Schwellenwert: 3 Rechnungen)"));
      else flash(tr(`${sugs.length} yeni öneri bulundu!`, `${sugs.length} neue Vorschläge gefunden!`));
    } finally { setLearnLoading(false); }
  }, [invoices, invoiceItems, rules]);

  const ruleStats = useMemo(() => computeRuleStats(rules), [rules]);

  return (
    <div className="space-y-4 fade-up">

      {/* ── Debug bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 14px", borderRadius: "10px", marginBottom: "4px",
        background: "rgba(6,182,212,.04)", border: "1px solid rgba(6,182,212,.1)",
        fontSize: "11px", color: "#3a3f4a", fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <span style={{ color: "#06b6d4", fontWeight: 700 }}>
          {rules.length} {tr("kural yüklendi", "Regeln geladen")}
        </span>
        <span>·</span>
        <span style={{ color: rules.filter(r => r?.type === "manual").length > 0 ? "#8b5cf6" : "#2a3040" }}>
          {rules.filter(r => r?.type === "manual").length} {tr("manuel", "manuell")}
        </span>
        <span>·</span>
        <span style={{ color: rules.filter(r => r?.type === "learned").length > 0 ? "#10b981" : "#2a3040" }}>
          {rules.filter(r => r?.type === "learned").length} {tr("öğrenilen", "gelernt")}
        </span>
        <span>·</span>
        <span style={{ color: rules.filter(r => r?.active).length > 0 ? "#f59e0b" : "#2a3040" }}>
          {rules.filter(r => r?.active).length} {tr("aktif", "aktiv")}
        </span>
      </div>

      {/* ── Sub-tab bar ── */}
      <div className="flex gap-1 rounded-md overflow-hidden shrink-0 w-fit"
        style={{ border: "1px solid #1c1f27" }}>
        {([
          { key: "manual", icon: "✎", label: tr("Manuel Kurallar", "Manuelle Regeln"), badge: String(rules.filter(r => r?.type === "manual").length) },
          { key: "learned", icon: "◈", label: tr("Öğrenilen", "Gelernte Regeln"), badge: String(rules.filter(r => r?.type === "learned").length) },
          { key: "stats", icon: "⊙", label: tr("İstatistikler", "Statistiken"), badge: null },
        ] as const).map(st => (
          <button key={st.key} onClick={() => setRuleSubTab(st.key)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold cursor-pointer border-none transition-all"
            style={ruleSubTab === st.key
              ? { background: "#06b6d4", color: "#fff" }
              : { background: "rgba(255,255,255,.02)", color: "#3a3f4a" }}>
            <span className="font-mono">{st.icon}</span>
            <span>{st.label}</span>
            {st.badge !== null && (
              <span className="font-mono px-1.5 py-0.5 rounded-full text-[9px]"
                style={{ background: ruleSubTab === st.key ? "rgba(0,0,0,.2)" : "rgba(255,255,255,.06)", minWidth: "18px", textAlign: "center" }}>
                {st.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════ MANUEL KURALLAR ══════════════ */}
      {ruleSubTab === "manual" && (
        <div className="space-y-4">
          <div className="c-card p-5">
            <div className="c-section-title">+ {tr("Yeni Manuel Kural", "Neue Manuelle Regel")}</div>
            <p className="text-xs mb-4" style={{ color: "#3a3f4a" }}>
              {tr(
                "Tedarikçi adı VEYA açıklama anahtar kelimesi eşleşince AI'ye gitmeden %100 güvenle atanır.",
                "Bei Übereinstimmung von Lieferant ODER Schlüsselwort wird direkt zugewiesen (100% Konfidenz)."
              )}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="c-label">{tr("Tedarikçi adı (içerir)", "Lieferantenname (enthält)")} <span style={{ color: "#3a3f4a" }}>— {tr("opsiyonel", "optional")}</span></label>
                <input className="c-input" placeholder="z.B. Shell, Amazon, Telekom"
                  value={newRule.supplier_keyword}
                  onChange={e => setNewRule({ ...newRule, supplier_keyword: e.target.value })} />
                <p className="text-[10px] mt-1" style={{ color: "#3a3f4a" }}>
                  {tr("Bu tedarikçiden gelen tüm kalemlere uygulanır", "Gilt für alle Positionen dieses Lieferanten")}
                </p>
              </div>
              <div>
                <label className="c-label">{tr("Açıklama anahtar kelimeleri", "Beschreibungs-Schlüsselwörter")} <span style={{ color: "#3a3f4a" }}>— {tr("opsiyonel", "optional")}</span></label>
                <input className="c-input" placeholder="benzin, kraftstoff, tanken"
                  value={newRule.description_keywords}
                  onChange={e => setNewRule({ ...newRule, description_keywords: e.target.value })} />
                <p className="text-[10px] mt-1" style={{ color: "#3a3f4a" }}>
                  {tr("Virgülle ayırın — herhangi biri eşleşirse tetiklenir", "Kommagetrennt — trifft bei Übereinstimmung")}
                </p>
              </div>
              <div>
                <label className="c-label">{tr("Hesap Kodu", "Kontocode")} *</label>
                <input className="c-input font-mono" placeholder="4660"
                  value={newRule.account_code}
                  onChange={e => setNewRule({ ...newRule, account_code: e.target.value })} />
              </div>
              <div>
                <label className="c-label">{tr("Hesap Adı", "Kontobezeichnung")}</label>
                <input className="c-input" placeholder="Kfz-Kosten"
                  value={newRule.account_name}
                  onChange={e => setNewRule({ ...newRule, account_name: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="c-label">{tr("Not (opsiyonel)", "Hinweis (optional)")}</label>
                <input className="c-input" placeholder={tr("Açıklama...", "Beschreibung...")}
                  value={newRule.note}
                  onChange={e => setNewRule({ ...newRule, note: e.target.value })} />
              </div>
            </div>
            <button onClick={addRule} disabled={saving} className="c-btn-primary px-5 py-2.5 text-sm rounded-md">
              {saving ? "..." : tr("+ Kural Ekle & Kaydet", "+ Regel hinzufügen")}
            </button>
          </div>

          <div className="c-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
              <div className="c-section-title mb-0">
                {tr(`Manuel Kurallar (${rules.filter(r => r.type === "manual").length})`,
                  `Manuelle Regeln (${rules.filter(r => r.type === "manual").length})`)}
              </div>
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: "rgba(6,182,212,.08)", color: "#06b6d4", border: "1px solid rgba(6,182,212,.15)" }}>
                {tr("Öncelik 1 — %100", "Priorität 1 — 100%")}
              </span>
            </div>

            {rules.filter(r => r?.type === "manual").length === 0 ? (
              <div className="py-10 text-center">
                <div className="font-mono text-3xl mb-3" style={{ color: "#1c1f27" }}>✎</div>
                <div className="text-sm mb-1" style={{ color: "#3a3f4a" }}>
                  {tr("Henüz manuel kural eklenmedi", "Noch keine manuellen Regeln")}
                </div>
                <div className="text-xs" style={{ color: "#1e2530" }}>
                  {tr(`Toplam ${rules.length} kural var, ${rules.filter(r => r?.type === "manual").length} manuel.`,
                    `Gesamt ${rules.length} Regeln, ${rules.filter(r => r?.type === "manual").length} manuell.`)}
                </div>
              </div>
            ) : (
              <div>
                {rules.filter(r => r?.type === "manual").map(rule => (
                  <div key={rule.id}>
                    {editingRule?.id !== rule.id ? (
                      <div className="flex items-start gap-3 px-5 py-4 transition-colors"
                        style={{ borderBottom: "1px solid #1c1f27", borderLeft: `2px solid ${rule.active ? "#06b6d4" : "#2a3040"}` }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {rule.supplier_keyword && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded"
                                style={{ background: "rgba(139,92,246,.1)", color: "#a78bfa", border: "1px solid rgba(139,92,246,.2)" }}>
                                👤 {rule.supplier_keyword}
                              </span>
                            )}
                            {rule.description_keywords?.map((kw, i) => (
                              <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded"
                                style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.2)" }}>
                                🔑 {kw}
                              </span>
                            ))}
                            <span className="font-mono" style={{ color: "#3a3f4a" }}>→</span>
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                              style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
                              {rule.account_code}
                            </span>
                            <span className="text-sm text-slate-300">{rule.account_name}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full badge-analyzed">%100</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: "#3a3f4a" }}>
                            {rule.note && <span>{rule.note}</span>}
                            <span className="font-mono">{tr("Tetiklendi:", "Ausgelöst:")} {rule.hit_count}×</span>
                            {rule.last_used && <span>{tr("Son:", "Zuletzt:")} {rule.last_used.substring(0, 10)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="c-toggle cursor-pointer" onClick={() => toggleRule(rule.id)}>
                            <input type="checkbox" readOnly checked={rule.active} />
                            <span className="c-toggle-track" />
                            <span className="c-toggle-thumb"
                              style={{ left: rule.active ? "19px" : "3px", background: rule.active ? "#fff" : "#3a3f4a" }} />
                          </label>
                          <button onClick={() => setEditingRule({ ...rule })}
                            className="text-xs px-2 py-1 rounded cursor-pointer border-none transition-colors"
                            style={{ background: "rgba(255,255,255,.04)", color: "#64748b" }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#06b6d4"}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#64748b"}>
                            ✎
                          </button>
                          <button onClick={() => delRule(rule.id)} disabled={saving}
                            className="text-xs px-2 py-1 rounded cursor-pointer border-none transition-colors"
                            style={{ background: "rgba(239,68,68,.06)", color: "#3a3f4a" }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#3a3f4a"}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-5 py-4" style={{ borderBottom: "1px solid #1c1f27", background: "rgba(6,182,212,.03)" }}>
                        <div className="c-section-title mb-3">{tr("Kuralı Düzenle", "Regel bearbeiten")}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="c-label">{tr("Tedarikçi", "Lieferant")}</label>
                            <input className="c-input" value={editingRule!.supplier_keyword || ""}
                              onChange={e => setEditingRule(r => r ? { ...r, supplier_keyword: e.target.value } : r)} />
                          </div>
                          <div>
                            <label className="c-label">{tr("Anahtar Kelimeler", "Schlüsselwörter")}</label>
                            <input className="c-input" value={(editingRule!.description_keywords || []).join(", ")}
                              onChange={e => setEditingRule(r => r ? { ...r, description_keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : r)} />
                          </div>
                          <div>
                            <label className="c-label">{tr("Hesap Kodu", "Konto")}</label>
                            <input className="c-input font-mono" value={editingRule!.account_code}
                              onChange={e => setEditingRule(r => r ? { ...r, account_code: e.target.value } : r)} />
                          </div>
                          <div>
                            <label className="c-label">{tr("Hesap Adı", "Kontoname")}</label>
                            <input className="c-input" value={editingRule!.account_name}
                              onChange={e => setEditingRule(r => r ? { ...r, account_name: e.target.value } : r)} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="c-label">{tr("Not", "Hinweis")}</label>
                            <input className="c-input" value={editingRule!.note || ""}
                              onChange={e => setEditingRule(r => r ? { ...r, note: e.target.value } : r)} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEditingRule} disabled={saving} className="c-btn-primary px-4 py-2 text-xs rounded-md">
                            {saving ? "..." : tr("✓ Kaydet", "✓ Speichern")}
                          </button>
                          <button onClick={() => setEditingRule(null)} className="c-btn-ghost px-4 py-2 text-xs rounded-md">
                            {tr("İptal", "Abbrechen")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="c-card c-card-cyan p-4 text-xs" style={{ color: "#3a3f4a", lineHeight: "1.7" }}>
            <div className="font-semibold text-slate-300 mb-1">◈ {tr("Nasıl Çalışır?", "Wie funktioniert es?")}</div>
            <div>{tr("Fatura yüklenince önce manuel kurallar kontrol edilir. Tedarikçi adı VEYA herhangi bir anahtar kelime kalem açıklamasında geçiyorsa AI analizine gerek kalmadan %100 güvenle kod atanır.", "Beim Upload werden manuelle Regeln zuerst geprüft. Wenn Lieferantenname ODER ein Schlüsselwort in der Positionsbeschreibung vorkommt, wird der Code direkt mit 100% zugewiesen.")}</div>
            <div className="mt-2 font-mono text-[10px]" style={{ color: "#2a3040" }}>
              {tr("Örnek: Anahtar kelime='benzin' → Hesap 4660 (KFZ-Kosten)", "Bsp: Schlüsselwort='kraftstoff' → Konto 4660 (Kfz-Kosten)")}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ ÖĞRENİLEN KURALLAR ══════════════ */}
      {ruleSubTab === "learned" && (
        <div className="space-y-4">
          <div className="c-card p-5">
            <div className="c-section-title">{tr("Geçmişten Öğren", "Aus Verlauf lernen")}</div>
            <p className="text-xs mb-4" style={{ color: "#3a3f4a" }}>
              {tr(
                "Şimdiye kadar yüklenen faturalar analiz edilerek tekrar eden tedarikçi → hesap kodu eşleşmeleri otomatik tespit edilir. Min. 3 farklı faturada görülmesi gerekir.",
                "Bisherige Rechnungen werden analysiert, um wiederkehrende Lieferant→Kontozuordnungen zu erkennen. Mindestens 3 verschiedene Rechnungen erforderlich."
              )}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={runLearnFromHistory} disabled={learnLoading || saving}
                className="c-btn-primary flex items-center gap-2 px-5 py-2.5 text-sm rounded-md">
                {learnLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 rounded-full animate-spin inline-block"
                      style={{ borderColor: "rgba(255,255,255,.3)", borderTopColor: "#fff" }} />
                    {tr("Analiz ediliyor...", "Analysiere...")}
                  </>
                ) : (
                  <>◈ {tr(`Geçmişi Analiz Et (${invoices.length} fatura)`, `Verlauf analysieren (${invoices.length} Rechnungen)`)}</>
                )}
              </button>
              <div className="text-xs" style={{ color: "#3a3f4a" }}>
                {invoiceItems.length} {tr("kalem", "Positionen")} · {tr("Eşik: 3 fatura", "Schwellenwert: 3 Rechnungen")}
              </div>
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="c-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
                <div>
                  <div className="c-section-title mb-0.5">
                    {tr(`${suggestions.length} Yeni Kural Önerisi Bulundu`, `${suggestions.length} neue Regelvorschläge gefunden`)}
                  </div>
                  <div className="text-[10px]" style={{ color: "#3a3f4a" }}>
                    {tr("Tümünü kabul edebilir veya tek tek inceleyebilirsiniz", "Sie können alle akzeptieren oder einzeln prüfen")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={acceptAllSuggestions} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md cursor-pointer border-none transition-all"
                    style={{ background: "rgba(16,185,129,.15)", color: "#10b981", border: "1px solid rgba(16,185,129,.25)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,.28)"}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,.15)"}>
                    {saving ? "..." : tr(`✓ Tümünü Ekle (${suggestions.length})`, `✓ Alle hinzufügen (${suggestions.length})`)}
                  </button>
                  <button onClick={() => setSuggestions([])}
                    className="px-3 py-2 text-xs rounded-md cursor-pointer border-none transition-colors"
                    style={{ background: "rgba(239,68,68,.06)", color: "#3a3f4a" }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#3a3f4a"}>
                    {tr("Tümünü Reddet", "Alle ablehnen")}
                  </button>
                </div>
              </div>
              {suggestions.map(sug => (
                <div key={sug.rule.id} className="px-5 py-4 transition-colors"
                  style={{ borderBottom: "1px solid #1c1f27", borderLeft: `2px solid #f59e0b` }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(245,158,11,.03)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {sug.rule.supplier_keyword && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{ background: "rgba(139,92,246,.1)", color: "#a78bfa", border: "1px solid rgba(139,92,246,.2)" }}>
                            👤 {sug.rule.supplier_keyword}
                          </span>
                        )}
                        {sug.rule.description_keywords?.map((kw, i) => (
                          <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.2)" }}>
                            🔑 {kw}
                          </span>
                        ))}
                        <span className="font-mono text-xs" style={{ color: "#3a3f4a" }}>→</span>
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded"
                          style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
                          {sug.rule.account_code}
                        </span>
                        <span className="text-sm text-slate-300">{sug.rule.account_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: "#3a3f4a" }}>
                        <span className={`font-bold px-1.5 py-0.5 rounded-full ${sug.rule.confidence >= 80 ? "badge-analyzed" : "badge-pending"}`}>
                          %{sug.rule.confidence} {tr("güven", "Konfidenz")}
                        </span>
                        <span>{sug.rule.learn_count} {tr("farklı faturadan", "verschiedene Rechnungen")}</span>
                        {sug.descriptionExamples.length > 0 && (
                          <span className="truncate max-w-[200px]" title={sug.descriptionExamples.join(", ")}>
                            {tr("Örn:", "Bsp:")} {sug.descriptionExamples[0].substring(0, 40)}...
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => acceptSuggestion(sug)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer border-none transition-all"
                        style={{ background: "rgba(16,185,129,.12)", color: "#10b981", border: "1px solid rgba(16,185,129,.2)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,.22)"}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,.12)"}>
                        ✓ {tr("Ekle", "Hinzufügen")}
                      </button>
                      <button onClick={() => dismissSuggestion(sug.rule.id)}
                        className="px-2 py-1.5 text-xs cursor-pointer border-none transition-colors bg-transparent"
                        style={{ color: "#3a3f4a" }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#3a3f4a"}>
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="c-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
              <div className="c-section-title mb-0">
                {tr(`Aktif Öğrenilen Kurallar (${rules.filter(r => r && r.type === "learned").length})`,
                  `Aktive gelernte Regeln (${rules.filter(r => r && r.type === "learned").length})`)}
              </div>
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: "rgba(16,185,129,.08)", color: "#10b981", border: "1px solid rgba(16,185,129,.15)" }}>
                {tr("Öncelik 2", "Priorität 2")}
              </span>
            </div>
            {rules.filter(r => r?.type === "learned").length === 0 ? (
              <div className="py-10 text-center">
                <div className="font-mono text-3xl mb-3" style={{ color: "#1c1f27" }}>◈</div>
                <div className="text-sm mb-1" style={{ color: "#3a3f4a" }}>
                  {tr("Henüz öğrenilen kural yok — yukarıdan analiz başlatın", "Noch keine gelernten Regeln — Analyse starten")}
                </div>
                <div className="text-xs" style={{ color: "#1e2530" }}>
                  {tr(`Toplam ${rules.length} kural mevcut.`, `Gesamt ${rules.length} Regeln vorhanden.`)}
                </div>
              </div>
            ) : (
              <div>
                {rules.filter(r => r?.type === "learned")
                  .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
                  .map(rule => (
                    <div key={rule.id} className="flex items-start gap-3 px-5 py-4 transition-colors"
                      style={{ borderBottom: "1px solid #1c1f27", borderLeft: `2px solid ${rule.active ? "#10b981" : "#2a3040"}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {rule.supplier_keyword && (
                            <span className="text-xs px-2 py-0.5 rounded"
                              style={{ background: "rgba(139,92,246,.1)", color: "#a78bfa", border: "1px solid rgba(139,92,246,.2)" }}>
                              👤 {rule.supplier_keyword}
                            </span>
                          )}
                          {rule.description_keywords?.map((kw, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded"
                              style={{ background: "rgba(245,158,11,.08)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.15)" }}>
                              🔑 {kw}
                            </span>
                          ))}
                          <span className="font-mono text-xs" style={{ color: "#3a3f4a" }}>→</span>
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded"
                            style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>
                            {rule.account_code}
                          </span>
                          <span className="text-sm text-slate-300">{rule.account_name}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${rule.confidence >= 80 ? "badge-analyzed" : "badge-pending"}`}>
                            %{rule.confidence}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px]" style={{ color: "#3a3f4a" }}>
                          <span>{rule.learn_count} {tr("faturadan öğrenildi", "Rechnungen gelernt")}</span>
                          <span>{tr("Tetiklendi:", "Ausgelöst:")} {rule.hit_count}×</span>
                          {rule.note && <span>{rule.note}</span>}
                          {rule.last_used && <span>{tr("Son:", "Zuletzt:")} {rule.last_used.substring(0, 10)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="c-toggle cursor-pointer" onClick={() => toggleRule(rule.id)}>
                          <input type="checkbox" readOnly checked={rule.active} />
                          <span className="c-toggle-track" />
                          <span className="c-toggle-thumb"
                            style={{ left: rule.active ? "19px" : "3px", background: rule.active ? "#fff" : "#3a3f4a" }} />
                        </label>
                        <button onClick={() => delRule(rule.id)} disabled={saving}
                          className="text-xs px-2 py-1.5 rounded cursor-pointer border-none transition-colors"
                          style={{ background: "rgba(239,68,68,.06)", color: "#3a3f4a" }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#3a3f4a"}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="c-card c-card-green p-4 text-xs" style={{ color: "#3a3f4a", lineHeight: "1.7" }}>
            <div className="font-semibold text-slate-300 mb-1">◈ {tr("Öğrenme Mantığı", "Lernlogik")}</div>
            <div>{tr("Manuel kod değiştirince sistem anında öğrenir. 3+ farklı faturada aynı tedarikçi veya açıklama tokeni görülürse öneri oluşturulur. Öğrenilen kurallar aktif etmeden uygulanmaz.", "Bei manueller Korrektur lernt das System sofort. Wenn Lieferant oder Beschreibungstoken in 3+ Rechnungen erscheint, wird ein Vorschlag erstellt.")}</div>
          </div>
        </div>
      )}

      {/* ══════════════ İSTATİSTİKLER ══════════════ */}
      {ruleSubTab === "stats" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: tr("Toplam Kural", "Gesamt Regeln"), val: ruleStats.totalRules, color: "#06b6d4", cls: "c-card-cyan" },
              { label: tr("Manuel", "Manuell"), val: ruleStats.manualRules, color: "#8b5cf6", cls: "" },
              { label: tr("Öğrenilen", "Gelernt"), val: ruleStats.learnedRules, color: "#10b981", cls: "c-card-green" },
              { label: tr("Ort. Güven", "Ø Konfidenz"), val: `%${ruleStats.avgConfidence}`, color: "#f59e0b", cls: "" },
            ].map((c, i) => (
              <div key={i} className={`c-card ${c.cls} p-4`}>
                <div className="c-section-title mb-1">{c.label}</div>
                <div className="font-syne font-bold text-xl" style={{ color: c.color }}>{c.val}</div>
              </div>
            ))}
          </div>

          {ruleStats.topAccountCodes.length > 0 && (
            <div className="c-card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
                <div className="c-section-title mb-0">{tr("En Çok Kullanılan Hesap Kodları", "Meistverwendete Konten")}</div>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {["#", tr("Hesap Kodu", "Konto"), tr("Hesap Adı", "Kontoname"),
                      tr("Kural Sayısı", "Anzahl Regeln"), tr("Toplam Tetiklenme", "Gesamt ausgelöst")].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-left whitespace-nowrap"
                          style={{ background: "#0d0f15", color: "#3a3f4a", borderBottom: "1px solid #1c1f27", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {ruleStats.topAccountCodes.map((item, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #1c1f27" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <td className="px-4 py-3 font-mono" style={{ color: "#3a3f4a" }}>{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded"
                          style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4" }}>{item.code}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{item.name}</td>
                      <td className="px-4 py-3 font-mono text-center text-slate-400">{item.ruleCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded-full h-1.5" style={{ background: "#1c1f27", maxWidth: "80px" }}>
                            <div className="h-1.5 rounded-full" style={{
                              width: ruleStats.topAccountCodes[0].hitCount > 0
                                ? `${(item.hitCount / ruleStats.topAccountCodes[0].hitCount * 100)}%` : "0%",
                              background: "#06b6d4"
                            }} />
                          </div>
                          <span className="font-mono text-slate-300">{item.hitCount}×</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="c-card overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #1c1f27" }}>
              <div className="c-section-title mb-0">{tr("Tüm Aktif Kurallar", "Alle aktiven Regeln")}</div>
            </div>
            {rules.filter(r => r.active).length === 0 ? (
              <div className="py-8 text-center text-xs" style={{ color: "#3a3f4a" }}>
                {tr("Aktif kural yok", "Keine aktiven Regeln")}
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {[tr("Tip", "Typ"), tr("Kural", "Regel"), tr("Kod", "Konto"),
                      tr("Güven", "Konf."), tr("Tetiklendi", "Ausgelöst"), tr("Son Kullanım", "Letzter Einsatz")].map((h, i) => (
                        <th key={i} className="px-4 py-2 text-left"
                          style={{ background: "#0d0f15", color: "#3a3f4a", borderBottom: "1px solid #1c1f27", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.filter(r => r.active).map((rule) => (
                    <tr key={rule.id} style={{ borderBottom: "1px solid #1c1f27" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <td className="px-4 py-2.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${rule.type === "manual" ? "badge-check" : "badge-analyzed"}`}>
                          {rule.type === "manual" ? tr("Manuel", "Manuell") : tr("Öğrenilen", "Gelernt")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 max-w-[180px]">
                        <div className="flex flex-wrap gap-1">
                          {rule.supplier_keyword && <span style={{ color: "#a78bfa" }}>👤 {rule.supplier_keyword}</span>}
                          {rule.description_keywords?.slice(0, 2).map((kw, ki) => (
                            <span key={ki} style={{ color: "#f59e0b" }}>🔑 {kw}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs" style={{ color: "#06b6d4" }}>{rule.account_code}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: rule.confidence >= 80 ? "#10b981" : "#f59e0b" }}>
                        %{rule.confidence}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-400">{rule.hit_count}×</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: "#3a3f4a", fontSize: "10px" }}>
                        {rule.last_used ? rule.last_used.substring(0, 10) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
