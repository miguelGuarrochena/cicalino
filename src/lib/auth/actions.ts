"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Resultado = { ok: true } | { ok: false; error: string };

// Login con email + contraseña (usuarios ya invitados por el superadmin/admin).
export const signIn = async (
  email: string,
  password: string,
): Promise<Resultado> => {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "Supabase no configurado" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
