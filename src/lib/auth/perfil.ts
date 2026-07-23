import { createServerSupabase } from "@/lib/supabase/server";
import type { RolUsuario } from "@/lib/db/schema";

export interface PerfilActual {
  id: string;
  email: string;
  rol: RolUsuario;
  organizacionId: string | null;
  localId: string | null;
}

// Perfil del usuario logueado (rol + organización + sucursal), leído de la
// tabla `usuarios`. null si no hay sesión o Supabase no está configurado.
export const getPerfilActual = async (): Promise<PerfilActual | null> => {
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
    rol: (data?.rol ?? "admin") as RolUsuario,
    organizacionId: (data?.organizacion_id as string | null) ?? null,
    localId: (data?.local_id as string | null) ?? null,
  };
};
