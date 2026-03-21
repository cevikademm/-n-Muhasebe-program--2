import { useState, useEffect } from "react";
import { supabase } from "./supabaseService";

export interface SubscriptionInfo {
    isActive: boolean;
    isExpired: boolean;
    plan: string;
    expiresAt: Date | null;
}

export const useSubscriptionTimer = (session: any, userRole: string) => {
    const [subInfo, setSubInfo] = useState<SubscriptionInfo>({
        isActive: false,
        isExpired: false,
        plan: "free",
        expiresAt: null,
    });

    const fetchSubscription = async () => {
        if (!session?.user?.id) return;
        if (userRole === "admin") {
            // Admins never expire for testing
            setSubInfo({
                isActive: true,
                isExpired: false,
                plan: "yearly",
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            });
            return;
        }

        try {
            const { data } = await supabase
                .from("subscriptions")
                .select("id, status, plan, updated_at")
                .eq("user_id", session.user.id)
                .in("status", ["active", "trialing"])
                .maybeSingle();

            if (data) {
                // Calculate expiresAt depending on plan and updated_at
                let expiresAt = new Date(data.updated_at || Date.now());
                if (data.plan === "yearly") {
                    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
                } else if (data.plan === "quarterly") {
                    expiresAt.setMonth(expiresAt.getMonth() + 3);
                } else {
                    // default monthly or free trial
                    expiresAt.setMonth(expiresAt.getMonth() + 1);
                }

                // --- MOCK TESTER for Developer ---
                const fakeTest = localStorage.getItem("fibu_expires_test");
                if (fakeTest) {
                    expiresAt = new Date(fakeTest);
                }

                const isExpired = Date.now() > expiresAt.getTime();
                setSubInfo({
                    isActive: true,
                    isExpired,
                    plan: data.plan || "monthly",
                    expiresAt,
                });
            } else {
                const localPlan = localStorage.getItem(`plan_${session.user.id}`);
                if (localPlan) {
                    // simulate 30 days from now but we can't reliably know when they actually paid without DB
                    // Let's create a faux date or read from DB again..
                    let expiresAt = new Date();
                    expiresAt.setMonth(expiresAt.getMonth() + 1);

                    const fakeTest = localStorage.getItem("fibu_expires_test");
                    if (fakeTest) expiresAt = new Date(fakeTest);

                    const isExpired = Date.now() > expiresAt.getTime();
                    setSubInfo({
                        isActive: true,
                        isExpired,
                        plan: localPlan,
                        expiresAt,
                    });
                } else {
                    setSubInfo({ isActive: false, isExpired: false, plan: "free", expiresAt: null });
                }
            }
        } catch { }
    };

    useEffect(() => {
        fetchSubscription();
        const handleUpdate = () => fetchSubscription();
        window.addEventListener("subscription_updated", handleUpdate);
        return () => window.removeEventListener("subscription_updated", handleUpdate);
    }, [session, userRole]);

    return subInfo;
};
