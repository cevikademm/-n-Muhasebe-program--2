import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseService";
import { AccountRow, MenuKey } from "../types";

export function useAccountPlans(
  session: any,
  activeMenu: MenuKey,
  userRole: string
) {
  const [data, setData] = useState<AccountRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setDataLoading(true);
    let allData: AccountRow[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;
    try {
      while (hasMore) {
        const { data: batch, error } = await supabase
          .from("account_plans")
          .select("*")
          .range(from, from + batchSize - 1)
          .order("id", { ascending: true });

        if (error || !batch || batch.length === 0) {
          hasMore = false;
        } else {
          allData = [...allData, ...(batch as AccountRow[])];
          if (batch.length < batchSize) hasMore = false;
          else from += batchSize;
        }
        if (allData.length >= 100000) hasMore = false;
      }
      setData(allData);
    } catch (err) {
      console.error("[useAccountPlans]", err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const needsData =
      (activeMenu === "accountPlans" && userRole === "admin") ||
      (activeMenu === "adminView" && userRole === "admin") ||
      activeMenu === "invoices" ||
      activeMenu === "forms";

    if (needsData && data.length === 0) fetchData();
  }, [session, activeMenu, userRole, fetchData, data.length]);

  return { data, dataLoading, fetchData };
}
