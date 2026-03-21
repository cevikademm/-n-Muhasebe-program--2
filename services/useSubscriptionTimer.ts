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

    const fetchSubscription = async () => {
        if (!session?.user?.id) return;

        // Admin sınırsız erişim
        if (userRole === "admin") {
            const current = getCurrentPeriod();
            setSubInfo({
                isActive: true,
                isExpired: false,
                plan: "yearly",
                purchasedPeriods: [current],
                currentPeriod: current,
                remainingMonths: 12,
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            });
            return;
        }

        try {
            const { data } = await supabase
                .from("subscription_periods")
                .select("period_year, period_month, plan_type")
                .eq("user_id", session.user.id)
                .order("period_year", { ascending: true })
                .order("period_month", { ascending: true });

            if (data && data.length > 0) {
                const periods = data.map((d: any) =>
                    `${d.period_year}-${String(d.period_month).padStart(2, "0")}`
                );
                const lastPlanType = data[data.length - 1].plan_type || "monthly";
                const status = getPeriodStatus(periods);

                setSubInfo({
                    isActive: status.isActive,
                    isExpired: status.isExpired,
                    plan: lastPlanType,
                    purchasedPeriods: periods,
                    currentPeriod: status.currentPeriod,
                    remainingMonths: status.remainingMonths,
                    expiresAt: getExpiresAtFromPeriods(periods),
                });
            } else {
                // localStorage fallback
                const stored = localStorage.getItem(`periods_${session.user.id}`);
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
            }
        } catch {
            // DB hatası — localStorage fallback dene
            const stored = localStorage.getItem(`periods_${session.user.id}`);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    const periods: string[] = parsed.periods || [];
                    const status = getPeriodStatus(periods);
                    setSubInfo({
                        isActive: status.isActive,
                        isExpired: status.isExpired,
                        plan: parsed.plan || "monthly",
                        purchasedPeriods: periods,
                        currentPeriod: status.currentPeriod,
                        remainingMonths: status.remainingMonths,
                        expiresAt: getExpiresAtFromPeriods(periods),
                    });
                } catch { /* ignore */ }
            }
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
