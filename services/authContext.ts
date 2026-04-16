import { supabase } from "./supabaseService";

export type TeamRole = "owner" | "staff";

export interface TeamContext {
  role: TeamRole;
  effectiveOwnerId: string;
  ownerEmail?: string | null;
}

export async function resolveTeamContext(session: any): Promise<TeamContext> {
  const uid = session?.user?.id;
  if (!uid) return { role: "owner", effectiveOwnerId: "" };

  const { data, error } = await supabase
    .from("team_members")
    .select("owner_user_id, status")
    .eq("member_user_id", uid)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { role: "owner", effectiveOwnerId: uid };
  }
  return { role: "staff", effectiveOwnerId: data.owner_user_id };
}

export async function autoLinkInvites(session: any): Promise<void> {
  const uid = session?.user?.id;
  const email = (session?.user?.email || "").toLowerCase();
  if (!uid || !email) return;

  await supabase
    .from("team_members")
    .update({
      member_user_id: uid,
      status: "active",
      activated_at: new Date().toISOString(),
    })
    .ilike("invited_email", email)
    .is("member_user_id", null);
}
