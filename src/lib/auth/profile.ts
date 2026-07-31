import { createServerSupabase } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/db/schema";

export interface CurrentProfile {
  id: string;
  email: string;
  rol: UserRole;
  organizationId: string | null;
  localId: string | null;
}

export const getCurrentProfile = async (): Promise<CurrentProfile | null> => {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("rol, organizacion_id, local_id")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? "",
    rol: (data?.rol ?? "admin") as UserRole,
    organizationId: (data?.organizacion_id as string | null) ?? null,
    localId: (data?.local_id as string | null) ?? null,
  };
};
