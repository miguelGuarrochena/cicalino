"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPerfilActual } from "@/lib/auth/profile";
import type { UserRole } from "@/lib/db/schema";

type Resultado = { ok: true } | { ok: false; error: string };

type LoginOk = {
  ok: true;
  rol: UserRole;
  organizacionId: string | null;
  localId: string | null;
};
type LoginResultado = LoginOk | { ok: false; error: string };

// Mensajes de Supabase → español, para mostrar al usuario.
const traducirError = (m: string): string => {
  if (/invalid login credentials/i.test(m))
    return "Email o contraseña incorrectos.";
  if (/email not confirmed/i.test(m))
    return "Falta confirmar el email de la invitación.";
  return m;
};

// Login con email + contraseña (usuarios ya invitados por el superadmin/admin).
export const signIn = async (
  email: string,
  password: string,
): Promise<LoginResultado> => {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "Supabase no configurado" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: traducirError(error.message) };

  const perfil = await getPerfilActual();
  return {
    ok: true,
    rol: perfil?.rol ?? "admin",
    organizacionId: perfil?.organizacionId ?? null,
    localId: perfil?.localId ?? null,
  };
};

export const signOut = async () => {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
};

// Invitación de un dueño (admin) por email al dar de alta una organización.
// Solo el superadmin: usa el service_role. El invitado recibe un mail para
// definir su contraseña. No hay registro público.
export const invitarAdmin = async (
  email: string,
  organizationId: string,
): Promise<Resultado> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY" };
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { rol: "admin", organizacion_id: organizationId },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};
