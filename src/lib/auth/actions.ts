"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/profile";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import type { UserRole } from "@/lib/db/schema";

type Resultado = { ok: true } | { ok: false; error: string };

type LoginOk = {
  ok: true;
  rol: UserRole;
  organizationId: string | null;
  localId: string | null;
};
type LoginResultado = LoginOk | { ok: false; error: string };

const traducirError = (m: string): string => {
  if (/invalid login credentials/i.test(m))
    return "Email o contraseña incorrectos.";
  if (/email not confirmed/i.test(m))
    return "Falta confirmar el email de la invitación.";
  return "No pudimos iniciar sesión. Revisá los datos e intentá de nuevo.";
};

export const signIn = async (
  email: string,
  password: string,
): Promise<LoginResultado> => {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "Supabase no configurado" };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
  const cuenta = email.trim().toLowerCase();
  const porCuenta = await sharedRateLimit(`login:mail:${cuenta}`, 8, 10 * 60_000);
  const porIp = await sharedRateLimit(`login:ip:${ip}`, 30, 10 * 60_000);
  if (!porCuenta.ok || !porIp.ok) {
    return {
      ok: false,
      error: "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: traducirError(error.message) };

  const perfil = await getCurrentProfile();
  return {
    ok: true,
    rol: perfil?.rol ?? "admin",
    organizationId: perfil?.organizationId ?? null,
    localId: perfil?.localId ?? null,
  };
};

export const signOut = async () => {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
};

export const invitarAdmin = async (
  email: string,
  organizationId: string,
): Promise<Resultado> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { rol: "admin", organizacion_id: organizationId },
  });
  if (error) {
    console.error("invitarAdmin", error.message);
    return { ok: false, error: "No se pudo enviar la invitación." };
  }
  return { ok: true };
};

export const verifyPasswordDueño = async (
  password: string,
): Promise<Resultado> => {
  const pass = password.trim();
  if (pass.length < 6) {
    return { ok: false, error: "Ingresá la contraseña de tu cuenta." };
  }

  const perfil = await getCurrentProfile();
  if (!perfil) return { ok: false, error: "Sesión vencida. Volvé a entrar." };
  if (perfil.rol !== "admin" && perfil.rol !== "supervisor") {
    return { ok: false, error: "No autorizado." };
  }
  if (!perfil.email) {
    return { ok: false, error: "Tu cuenta no tiene email." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
  const porCuenta = await sharedRateLimit(
    `reauth:mail:${perfil.email.toLowerCase()}`,
    6,
    10 * 60_000,
  );
  const porIp = await sharedRateLimit(`reauth:ip:${ip}`, 20, 10 * 60_000);
  if (!porCuenta.ok || !porIp.ok) {
    return {
      ok: false,
      error: "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
    };
  }

  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "Supabase no configurado" };

  const { error } = await supabase.auth.signInWithPassword({
    email: perfil.email,
    password: pass,
  });
  if (error) return { ok: false, error: traducirError(error.message) };
  return { ok: true };
};
