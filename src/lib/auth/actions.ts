"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPerfilActual } from "@/lib/auth/profile";
import { rateLimitCompartido } from "@/lib/security/rateLimitShared";
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
  // Mensaje genérico: no exponemos detalle interno de Supabase al cliente
  // (evita enumeración de usuarios y fuga de información).
  return "No pudimos iniciar sesión. Revisá los datos e intentá de nuevo.";
};

// Login con email + contraseña (usuarios ya invitados por el superadmin/admin).
export const signIn = async (
  email: string,
  password: string,
): Promise<LoginResultado> => {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "Supabase no configurado" };

  // Anti fuerza bruta: por email y por IP. Sin esto, el action de login es un
  // oráculo de contraseñas sin límite.
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
  const cuenta = email.trim().toLowerCase();
  const porCuenta = await rateLimitCompartido(`login:mail:${cuenta}`, 8, 10 * 60_000);
  const porIp = await rateLimitCompartido(`login:ip:${ip}`, 30, 10 * 60_000);
  if (!porCuenta.ok || !porIp.ok) {
    return {
      ok: false,
      error: "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
    };
  }

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
  // AUTORIZACIÓN: cada export de un archivo "use server" es un endpoint RPC
  // público. Sin este chequeo, cualquiera —incluso sin sesión— podía invitarse
  // a sí mismo como admin de cualquier organización usando el service_role.
  const perfil = await getPerfilActual();
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

/**
 * Re-autentica al dueño con su contraseña de cuenta (no el PIN de 4 dígitos).
 * Sirve para desbloquear Config / Métricas en una tablet compartida.
 */
export const verificarPasswordDueño = async (
  password: string,
): Promise<Resultado> => {
  const pass = password.trim();
  if (pass.length < 6) {
    return { ok: false, error: "Ingresá la contraseña de tu cuenta." };
  }

  const perfil = await getPerfilActual();
  if (!perfil) return { ok: false, error: "Sesión vencida. Volvé a entrar." };
  if (perfil.rol !== "admin" && perfil.rol !== "supervisor") {
    return { ok: false, error: "No autorizado." };
  }
  if (!perfil.email) {
    return { ok: false, error: "Tu cuenta no tiene email." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
  const porCuenta = await rateLimitCompartido(
    `reauth:mail:${perfil.email.toLowerCase()}`,
    6,
    10 * 60_000,
  );
  const porIp = await rateLimitCompartido(`reauth:ip:${ip}`, 20, 10 * 60_000);
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
