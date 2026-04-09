import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useLang } from "../LanguageContext";
import { supabase } from "../services/supabaseService";
import { Tag, Save, RotateCcw, Percent, Sparkles } from "lucide-react";

// Sabit ana fiyatlar — asla değişmez
const BASE_PRICES: Record<string, number> = {
    free: 0,
    monthly: 40,
    quarterly: 120,
    yearly: 400,
};

const PLAN_KEYS = ["free", "monthly", "quarterly", "yearly"] as const;

interface Discount {
    plan: string;
    discount_amount: number; // € cinsinden indirim
    active: boolean;
    label_tr: string;
    label_de: string;
}

export const CampaignsPanel: React.FC = () => {
    const { lang } = useLang();
    const tr = (a: string, b: string) => lang === "tr" ? a : b;

    const planLabels: Record<string, string> = {
        free: tr("Ücretsiz", "Kostenlos"),
        monthly: tr("Aylık", "Monatlich"),
        quarterly: tr("3 Aylık", "3 Monate"),
        yearly: tr("Yıllık", "Jährlich"),
    };

    const [discounts, setDiscounts] = useState<Discount[]>(
        PLAN_KEYS.map((key) => ({
            plan: key,
            discount_amount: 0,
            active: false,
            label_tr: "",
            label_de: "",
        }))
    );
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Supabase'den mevcut kampanyaları yükle (+ realtime)
    const loadCampaigns = React.useCallback(async () => {
        try {
            const { data } = await supabase
                .from("campaigns")
                .select("*")
                .order("plan");
            if (data && data.length > 0) {
                setDiscounts(
                    PLAN_KEYS.map((key) => {
                        const found = data.find((d: any) => d.plan === key);
                        return found
                            ? {
                                plan: key,
                                discount_amount: found.discount_amount || 0,
                                active: found.active ?? false,
                                label_tr: found.label_tr || "",
                                label_de: found.label_de || "",
                            }
                            : {
                                plan: key,
                                discount_amount: 0,
                                active: false,
                                label_tr: "",
                                label_de: "",
                            };
                    })
                );
            }
        } catch { /* sessiz */ }
    }, []);

    useEffect(() => {
        loadCampaigns();
        const channel = supabase
            .channel(`campaigns-rt`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "campaigns" },
                () => { loadCampaigns(); }
            )
            .subscribe();
        return () => { try { supabase.removeChannel(channel); } catch {} };
    }, [loadCampaigns]);

    const updateDiscount = (plan: string, field: keyof Discount, value: any) => {
        setDiscounts((prev) =>
            prev.map((d) => (d.plan === plan ? { ...d, [field]: value } : d))
        );
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        // Her zaman localStorage'a kaydet (fallback + anında senkronizasyon)
        localStorage.setItem("fibu_campaigns", JSON.stringify(discounts));

        try {
            for (const d of discounts) {
                await supabase.from("campaigns").upsert(
                    {
                        plan: d.plan,
                        discount_amount: d.discount_amount,
                        active: d.active,
                        label_tr: d.label_tr,
                        label_de: d.label_de,
                        base_price: BASE_PRICES[d.plan],
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "plan" }
                );
            }
        } catch (e) {
            // Supabase hatası olsa bile localStorage'a kaydedildi
        }

        // Diğer bileşenlere güncelleme sinyali gönder
        window.dispatchEvent(new Event("campaigns-updated"));

        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        setSaving(false);
    };

    const handleReset = () => {
        setDiscounts(
            PLAN_KEYS.map((key) => ({
                plan: key,
                discount_amount: 0,
                active: false,
                label_tr: "",
                label_de: "",
            }))
        );
        setSaved(false);
    };

    return (
        <div
            style={{
                flex: 1,
                overflowY: "auto",
                background: "linear-gradient(180deg, #0a0a0f 0%, #111118 50%, #0a0a0f 100%)",
                display: "flex",
                flexDirection: "column",
                fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
            }}
        >
            {/* Ambient glow */}
            <div
                style={{
                    position: "fixed",
                    top: "15%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "500px",
                    height: "350px",
                    background: "radial-gradient(ellipse, rgba(168,85,247,0.06) 0%, transparent 70%)",
                    pointerEvents: "none",
                    zIndex: 0,
                }}
            />

            <div
                style={{
                    maxWidth: "900px",
                    width: "100%",
                    margin: "0 auto",
                    padding: "48px 24px",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{ marginBottom: "40px" }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                        <div
                            style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "12px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))",
                                border: "1px solid rgba(168,85,247,0.3)",
                            }}
                        >
                            <Tag size={20} style={{ color: "#a855f7" }} />
                        </div>
                        <div>
                            <h1
                                style={{
                                    fontSize: "28px",
                                    fontWeight: 800,
                                    color: "#fff",
                                    margin: 0,
                                    letterSpacing: "-0.5px",
                                }}
                            >
                                {tr("Kampanya Yönetimi", "Kampagnenverwaltung")}
                            </h1>
                            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", margin: 0, marginTop: "2px" }}>
                                {tr(
                                    "İndirim kampanyaları oluşturun. Ana fiyatlar sabit kalır, indirimler ayrı gösterilir.",
                                    "Erstellen Sie Rabattkampagnen. Grundpreise bleiben fest, Rabatte werden separat angezeigt."
                                )}
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Plan Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {discounts.map((d, idx) => {
                        const basePrice = BASE_PRICES[d.plan];
                        const finalPrice = Math.max(0, basePrice - d.discount_amount);
                        const hasDiscount = d.active && d.discount_amount > 0;

                        return (
                            <motion.div
                                key={d.plan}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.08 }}
                                style={{
                                    borderRadius: "16px",
                                    border: `1px solid ${hasDiscount ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.08)"}`,
                                    background: hasDiscount
                                        ? "linear-gradient(135deg, rgba(168,85,247,0.06) 0%, rgba(15,15,20,0.95) 50%)"
                                        : "rgba(18,18,24,0.9)",
                                    backdropFilter: "blur(20px)",
                                    overflow: "hidden",
                                    transition: "all 0.3s ease",
                                }}
                            >
                                {/* Card Header */}
                                <div
                                    style={{
                                        padding: "20px 24px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                        {/* Plan name */}
                                        <div>
                                            <h3
                                                style={{
                                                    fontSize: "16px",
                                                    fontWeight: 700,
                                                    color: "#fff",
                                                    margin: 0,
                                                }}
                                            >
                                                {planLabels[d.plan]}
                                            </h3>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "baseline",
                                                    gap: "8px",
                                                    marginTop: "4px",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: "11px",
                                                        color: "rgba(255,255,255,0.35)",
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    {tr("Ana Fiyat:", "Grundpreis:")}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: "18px",
                                                        fontWeight: 800,
                                                        color: hasDiscount ? "rgba(255,255,255,0.35)" : "#fff",
                                                        textDecoration: hasDiscount ? "line-through" : "none",
                                                    }}
                                                >
                                                    {basePrice}€
                                                </span>
                                                {hasDiscount && (
                                                    <>
                                                        <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.3)" }}>→</span>
                                                        <span
                                                            style={{
                                                                fontSize: "22px",
                                                                fontWeight: 800,
                                                                color: "#a855f7",
                                                            }}
                                                        >
                                                            {finalPrice}€
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontSize: "11px",
                                                                fontWeight: 700,
                                                                color: "#10b981",
                                                                background: "rgba(16,185,129,0.1)",
                                                                border: "1px solid rgba(16,185,129,0.25)",
                                                                padding: "2px 8px",
                                                                borderRadius: "6px",
                                                            }}
                                                        >
                                                            -{d.discount_amount}€
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Toggle */}
                                    {d.plan !== "free" && (
                                        <button
                                            onClick={() => updateDiscount(d.plan, "active", !d.active)}
                                            style={{
                                                width: "48px",
                                                height: "26px",
                                                borderRadius: "13px",
                                                border: "none",
                                                cursor: "pointer",
                                                position: "relative",
                                                transition: "all 0.25s",
                                                background: d.active
                                                    ? "linear-gradient(135deg, #a855f7, #7c3aed)"
                                                    : "rgba(255,255,255,0.08)",
                                                boxShadow: d.active ? "0 0 14px rgba(168,85,247,0.4)" : "none",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: "20px",
                                                    height: "20px",
                                                    borderRadius: "50%",
                                                    background: "#fff",
                                                    position: "absolute",
                                                    top: "3px",
                                                    left: d.active ? "25px" : "3px",
                                                    transition: "left 0.25s",
                                                    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                                                }}
                                            />
                                        </button>
                                    )}
                                </div>

                                {/* Edit Fields (only for paid plans) */}
                                {d.plan !== "free" && (
                                    <div style={{ padding: "18px 24px 22px" }}>
                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "1fr 1fr 1fr",
                                                gap: "14px",
                                            }}
                                        >
                                            {/* Discount Amount */}
                                            <div>
                                                <label
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "5px",
                                                        fontSize: "11px",
                                                        fontWeight: 600,
                                                        color: "rgba(255,255,255,0.4)",
                                                        marginBottom: "6px",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.08em",
                                                    }}
                                                >
                                                    <Percent size={11} />
                                                    {tr("İndirim (€)", "Rabatt (€)")}
                                                </label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={basePrice}
                                                    value={d.discount_amount}
                                                    onChange={(e) =>
                                                        updateDiscount(
                                                            d.plan,
                                                            "discount_amount",
                                                            Math.min(basePrice, Math.max(0, Number(e.target.value)))
                                                        )
                                                    }
                                                    style={{
                                                        width: "100%",
                                                        padding: "10px 12px",
                                                        borderRadius: "10px",
                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                        background: "rgba(255,255,255,0.04)",
                                                        color: "#fff",
                                                        fontSize: "14px",
                                                        fontWeight: 600,
                                                        outline: "none",
                                                        transition: "border-color 0.2s",
                                                    }}
                                                    onFocus={(e) => (e.target.style.borderColor = "rgba(168,85,247,0.4)")}
                                                    onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                                                />
                                                {d.discount_amount > 0 && (
                                                    <div
                                                        style={{
                                                            fontSize: "10px",
                                                            color: "#10b981",
                                                            marginTop: "4px",
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        {Math.round((d.discount_amount / basePrice) * 100)}% {tr("indirim", "Rabatt")}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Label TR */}
                                            <div>
                                                <label
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "5px",
                                                        fontSize: "11px",
                                                        fontWeight: 600,
                                                        color: "rgba(255,255,255,0.4)",
                                                        marginBottom: "6px",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.08em",
                                                    }}
                                                >
                                                    <Sparkles size={11} />
                                                    {tr("Kampanya Adı (TR)", "Kampagnenname (TR)")}
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder={tr("ör: Bahar İndirimi", "z.B: Frühlingsrabatt")}
                                                    value={d.label_tr}
                                                    onChange={(e) => updateDiscount(d.plan, "label_tr", e.target.value)}
                                                    style={{
                                                        width: "100%",
                                                        padding: "10px 12px",
                                                        borderRadius: "10px",
                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                        background: "rgba(255,255,255,0.04)",
                                                        color: "#fff",
                                                        fontSize: "13px",
                                                        outline: "none",
                                                        transition: "border-color 0.2s",
                                                    }}
                                                    onFocus={(e) => (e.target.style.borderColor = "rgba(168,85,247,0.4)")}
                                                    onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                                                />
                                            </div>

                                            {/* Label DE */}
                                            <div>
                                                <label
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "5px",
                                                        fontSize: "11px",
                                                        fontWeight: 600,
                                                        color: "rgba(255,255,255,0.4)",
                                                        marginBottom: "6px",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.08em",
                                                    }}
                                                >
                                                    <Sparkles size={11} />
                                                    {tr("Kampanya Adı (DE)", "Kampagnenname (DE)")}
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder={tr("ör: Frühlingsrabatt", "z.B: Frühlingsrabatt")}
                                                    value={d.label_de}
                                                    onChange={(e) => updateDiscount(d.plan, "label_de", e.target.value)}
                                                    style={{
                                                        width: "100%",
                                                        padding: "10px 12px",
                                                        borderRadius: "10px",
                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                        background: "rgba(255,255,255,0.04)",
                                                        color: "#fff",
                                                        fontSize: "13px",
                                                        outline: "none",
                                                        transition: "border-color 0.2s",
                                                    }}
                                                    onFocus={(e) => (e.target.style.borderColor = "rgba(168,85,247,0.4)")}
                                                    onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                {/* Preview */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    style={{
                        marginTop: "32px",
                        padding: "20px 24px",
                        borderRadius: "16px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(18,18,24,0.7)",
                    }}
                >
                    <h4
                        style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.4)",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            margin: "0 0 14px",
                        }}
                    >
                        {tr("Kullanıcı Görünümü Önizleme", "Vorschau der Benutzeransicht")}
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                        {discounts.map((d) => {
                            const basePrice = BASE_PRICES[d.plan];
                            const hasDiscount = d.active && d.discount_amount > 0;
                            const finalPrice = Math.max(0, basePrice - d.discount_amount);
                            const label = d.plan === "free" ? "" : hasDiscount ? (lang === "tr" ? d.label_tr : d.label_de) : "";

                            return (
                                <div
                                    key={d.plan}
                                    style={{
                                        padding: "16px",
                                        borderRadius: "12px",
                                        border: `1px solid ${hasDiscount ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.06)"}`,
                                        background: hasDiscount ? "rgba(168,85,247,0.04)" : "rgba(255,255,255,0.02)",
                                        textAlign: "center",
                                    }}
                                >
                                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: "6px" }}>
                                        {planLabels[d.plan]}
                                    </div>
                                    {hasDiscount && (
                                        <div
                                            style={{
                                                fontSize: "14px",
                                                fontWeight: 700,
                                                color: "rgba(255,255,255,0.3)",
                                                textDecoration: "line-through",
                                                marginBottom: "2px",
                                            }}
                                        >
                                            {basePrice}€
                                        </div>
                                    )}
                                    <div
                                        style={{
                                            fontSize: "24px",
                                            fontWeight: 800,
                                            color: hasDiscount ? "#a855f7" : "#fff",
                                        }}
                                    >
                                        {hasDiscount ? finalPrice : basePrice}€
                                    </div>
                                    {hasDiscount && label && (
                                        <div
                                            style={{
                                                marginTop: "6px",
                                                fontSize: "10px",
                                                fontWeight: 700,
                                                color: "#10b981",
                                                background: "rgba(16,185,129,0.1)",
                                                padding: "3px 8px",
                                                borderRadius: "6px",
                                                display: "inline-block",
                                            }}
                                        >
                                            {label}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "12px", marginTop: "24px", justifyContent: "flex-end" }}>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleReset}
                        style={{
                            padding: "12px 24px",
                            borderRadius: "12px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: "rgba(255,255,255,0.04)",
                            color: "rgba(255,255,255,0.6)",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <RotateCcw size={14} />
                        {tr("Sıfırla", "Zurücksetzen")}
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: "12px 32px",
                            borderRadius: "12px",
                            border: "none",
                            background: saved
                                ? "linear-gradient(135deg, #10b981, #059669)"
                                : "linear-gradient(135deg, #a855f7, #7c3aed)",
                            color: "#fff",
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: saving ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            boxShadow: saved
                                ? "0 4px 18px rgba(16,185,129,0.4)"
                                : "0 4px 18px rgba(168,85,247,0.35)",
                            opacity: saving ? 0.7 : 1,
                            transition: "all 0.3s",
                        }}
                    >
                        <Save size={15} />
                        {saving ? tr("Kaydediliyor...", "Wird gespeichert...") : saved ? tr("Kaydedildi ✓", "Gespeichert ✓") : tr("Kampanyaları Kaydet", "Kampagnen speichern")}
                    </motion.button>
                </div>
            </div>
        </div>
    );
};
