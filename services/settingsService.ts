import { supabase } from "./supabaseService";
import { UserSettings, MatchingRule } from "../types";

export const fetchUserSettings = async (userId: string): Promise<UserSettings | null> => {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error("Error fetching settings:", error);
    return null;
  }
  
  // Return default if no settings exist
  if (!data) {
      return {
          id: "",
          user_id: userId,
          company: {},
          accounting: {},
          rules: [],
          updated_at: new Date().toISOString()
      };
  }

  return data as UserSettings;
};

export const updateUserSettings = async (userId: string, updates: Partial<UserSettings>) => {
  // Check if exists
  const { data } = await supabase.from("user_settings").select("id").eq("user_id", userId).single();

  if (data) {
    return await supabase.from("user_settings").update(updates).eq("user_id", userId);
  } else {
    // Insert new
    return await supabase.from("user_settings").insert({
        user_id: userId,
        company: updates.company || {},
        accounting: updates.accounting || {},
        rules: updates.rules || []
    });
  }
};

export const addMatchingRule = async (userId: string, rule: MatchingRule, currentRules: MatchingRule[]) => {
    const newRules = [...currentRules, rule];
    return await updateUserSettings(userId, { rules: newRules });
};

export const deleteMatchingRule = async (userId: string, ruleId: string, currentRules: MatchingRule[]) => {
    const newRules = currentRules.filter(r => r.id !== ruleId);
    return await updateUserSettings(userId, { rules: newRules });
};