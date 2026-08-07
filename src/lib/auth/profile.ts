import { createServerSupabase } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/db/schema";

export interface CurrentProfile {
  id: string;
  email: string;
  rol: UserRole;
  organizationId: string | null;
  localId: string | null;
}

/* Devuelve null ante cualquier duda: sin perfil no hay permisos.
 *
 * Antes, si la fila de `usuarios` no aparecía (o la consulta fallaba), el
 * usuario quedaba con rol 'admin' por defecto. Eso es fallar abierto en el
 * medio de la autorización. En operación normal la fila siempre existe: la
 * crea el trigger `handle_new_user` en cada alta de Auth, y la policy
 * "perfil propio" deja que cada uno lea la suya. Si no está, es un problema
 * de infraestructura, no un caso legítimo: hay que verlo, no taparlo.
 *
 * Todos los llamadores ya chequean `!perfil`, así que devolver null es
 * simplemente que el chequeo empiece a servir para algo.
 */
export const getCurrentProfile = async (): Promise<CurrentProfile | null> => {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select("rol, organizacion_id, local_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getCurrentProfile: no se pudo leer el perfil", {
      userId: user.id,
      error: error.message,
    });
    return null;
  }

  if (!data) {
    console.error("getCurrentProfile: usuario de Auth sin fila en `usuarios`", {
      userId: user.id,
    });
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? "",
    rol: data.rol as UserRole,
    organizationId: (data.organizacion_id as string | null) ?? null,
    localId: (data.local_id as string | null) ?? null,
  };
};
