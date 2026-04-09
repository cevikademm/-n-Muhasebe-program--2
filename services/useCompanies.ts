import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseService";
import { Company, MenuKey } from "../types";

export function useCompanies(
  session: any,
  activeMenu: MenuKey,
  userRole: string
) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setCompaniesLoading(true);
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setCompanies(data as Company[]);
    setCompaniesLoading(false);
  }, []);

  useEffect(() => {
    if (session && activeMenu === "companies" && userRole === "admin") {
      fetchCompanies();
    }
  }, [session, activeMenu, userRole, fetchCompanies]);

  // Realtime: companies tablosundaki her değişiklik anında yansısın
  useEffect(() => {
    if (!session || userRole !== "admin") return;
    const channel = supabase
      .channel(`companies-rt`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "companies" },
        () => { fetchCompanies(); }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [session, userRole, fetchCompanies]);

  return { companies, companiesLoading, fetchCompanies };
}
