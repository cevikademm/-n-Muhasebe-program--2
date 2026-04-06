import { useState, useEffect } from "react";
import { supabase } from "./supabaseService";
import { getCurrentPeriod, getPeriodStatus, getExpiresAtFromPeriods } from "./periodUtils";

export interface SubscriptionInfo {
    isActive: boolean;
    isExpired: boolean;
    plan: string;
    purchasedPeriods: string[];
    currentPeriod: string;
    remainingMonths: number;
    expiresAt: Date | null;
}

// Sınırsız yetkili e-posta adresleri
const PRIVILEGED_EMAILS = ["cevikademm@gmail.com"];

export const useSubscriptionTimer = (session: any, userRole: string) => {
    const [subInfo, setSubInfo] = useState<SubscriptionInfo>({
        isActive: false,
        isExpired: false,
        plan: "free",
        purchasedPeriods: [],
        currentPeriod: getCurrentPeriod(),
        remainingMonths: 0,
        expiresAt: null,
    });

    // localStorage'dan dönem bilgisini yükle (DB erişimi yokken fallback)
    const loadFromLocalStorage = (userId: string) => {
        const stored = localStorage.getItem(`periods_${userId}`);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const periods: string[] = parsed.periods || [];
                const planType = parsed.plan || "monthly";
                const status = getPeriodStatus(periods);

                setSubInfo({
                    isActive: status.isActive,
                    isExpired: status.isExpired,
                    plan: planType,
                    purchasedPeriods: periods,
                    currentPeriod: status.currentPeriod,
                    remainingMonths: status.remainingMonths,
                    expiresAt: getExpiresAtFromPeriods(periods),
                });
            } catch {
                setSubInfo({
                    isActive: false, isExpired: false, plan: "free",
                    purchasedPeriods: [], currentPeriod: getCurrentPeriod(),
                    remainingMonths: 0, expiresAt: null,
                });
            }
        } else {
            setSubInfo({
                isActive: false, isExpired: false, plan: "free",
                purchasedPeriods: [], currentPeriod: getCurrentPeriod(),
                remainingMonths: 0, expiresAt: null,
            });
        }
    };

    const fetchSubscription = async () => {
        if (!session?.user?.id) return;

        // Admin veya privileged email — sınırsız erişim
        const isPrivileged = PRIVILEGED_EMAILS.includes(session?.user?.email?.toLowerCase() || "");
        if (userRole === "admin" || isPrivileged) {
            const current = getCurrentPeriod();
            // 2024-01'den 2026-12'ye kadar tüm dönemleri aç
            const allPeriods: string[] = [];
            for (let y = 2024; y <= 2026; y++) {
                for (let m = 1; m <= 12; m++) {
                    allPeriods.push(`${y}-${String(m).padStart(2, "0")}`);
                }
            }
            setSubInfo({
                isActive: true,
                isExpired: false,
                plan: "yearly",
                purchasedPeriods: allPeriods,
                currentPeriod: current,
                remainingMonths: 36,
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            });
            return;
        }

        try {
            const { data, error: queryError } = await supabase
                .from("subscription_periods")
                .select("period_year, period_month, plan_type")
                .eq("user_id", session.user.id)
                .order("period_year", { ascending: true })
                .order("period_month", { ascending: true });

            // Tablo yoksa veya 404 döndüyse localStorage'a düş
            if (queryError) {
                console.warn("[useSubscriptionTimer] DB sorgu hatası:", queryError.message);
                loadFromLocalStorage(session.user.id);
                return;
            }

            if (data && data.length > 0) {
                const periods = data.map((d: any) =>
                    `${d.period_year}-${String(d.period_month).padStart(2, "0")}`
                );
                const lastPlanType = data[data.length - 1].plan_type || "monthly";
                const status = getPeriodStatus(periods);

                const info: SubscriptionInfo = {
                    isActive: status.isActive,
                    isExpired: status.isExpired,
                    plan: lastPlanType,
                    purchasedPeriods: periods,
                    currentPeriod: status.currentPeriod,
                    remainingMonths: status.remainingMonths,
                    expiresAt: getExpiresAtFromPeriods(periods),
                };
                setSubInfo(info);

                // DB verisi başarılı ise localStorage'ı da güncelle (senkron tut)
                try {
                    localStorage.setItem(`periods_${session.user.id}`, JSON.stringify({
                        periods,
                        plan: lastPlanType,
                    }));
                } catch { /* localStorage erişim hatası — görmezden gel */ }
            } else {
                // DB'de kayıt yok — localStorage fallback
                loadFromLocalStorage(session.user.id);
            }
        } catch (err) {
            console.warn("[useSubscriptionTimer] Beklenmeyen hata:", err);
            // DB hatası — localStorage fallback dene
            loadFromLocalStorage(session.user.id);
        }
    };

    useEffect(() => {
        fetchSubscription();
        const handleUpdate = () => fetchSubscription();
        window.addEventListener("subscription_updated", handleUpdate);
        return () => window.removeEventListener("subscription_updated", handleUpdate);
    }, [session, userRole]);

    return subInfo;
};
