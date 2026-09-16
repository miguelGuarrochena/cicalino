"use server";

import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { parseInput } from "@/lib/schemas";

type SimpleResult = { ok: true } | { ok: false; error: string };

/* "empleado" = waiter (runs the floor), "supervisor" = manager (also branch
 * setup and employees). Owner-only things stay owner-only either way. */
const accessRole = z.enum(["empleado", "supervisor"]);

const grantSchema = z.object({
  employeeId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(120),
  role: accessRole.default("empleado"),
});

const roleSchema = z.object({
  employeeId: z.string().uuid(),
  role: accessRole,
});

const revokeSchema = z.object({
  employeeId: z.string().uuid(),
});

type Admin = NonNullable<ReturnType<typeof createAdminSupabase>>;

const findAuthUser = async (
  admin: Admin,
  email: string,
): Promise<{ id: string } | null> => {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.error("findAuthUser", error.message);
      return null;
    }
    const hit = data?.users?.find((u) => u.email?.toLowerCase() === email);
    if (hit) return { id: hit.id };
    if (!data?.users?.length) break;
  }
  return null;
};

const loadEmployee = async (
  admin: Admin,
  employeeId: string,
): Promise<{
  id: string;
  nombre: string;
  localId: string;
  organizationId: string;
  usuarioId: string | null;
} | null> => {
  const { data } = await admin
    .from("empleados")
    .select("id, nombre, local_id, usuario_id, locales ( organizacion_id )")
    .eq("id", employeeId)
    .maybeSingle();
  if (!data) return null;
  const rel = data.locales as
    | { organizacion_id: string }
    | { organizacion_id: string }[]
    | null;
  const local = Array.isArray(rel) ? rel[0] : rel;
  if (!local?.organizacion_id) return null;
  return {
    id: data.id as string,
    nombre: (data.nombre as string) ?? "",
    localId: data.local_id as string,
    organizationId: local.organizacion_id,
    usuarioId: (data.usuario_id as string | null) ?? null,
  };
};

export const grantAppAccess = async (input: unknown): Promise<SimpleResult> => {
  const v = parseInput(grantSchema, input);
  if (!v.ok) return { ok: false, error: "Revisá el email." };

  const perfil = await getCurrentProfile();
  if (!perfil) return { ok: false, error: "No autorizado" };
  if (perfil.rol !== "admin" && perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const emp = await loadEmployee(admin, v.data.employeeId);
  if (!emp) return { ok: false, error: "No encontramos a esa persona." };
  if (
    perfil.rol === "admin" &&
    emp.organizationId !== perfil.organizationId
  ) {
    return { ok: false, error: "No autorizado" };
  }

  const meta = {
    rol: v.data.role,
    organizacion_id: emp.organizationId,
    local_id: emp.localId,
  };

  let usuarioId: string;
  const existente = await findAuthUser(admin, v.data.email);

  if (existente) {
    const { data: perfilExistente } = await admin
      .from("usuarios")
      .select("organizacion_id, rol")
      .eq("id", existente.id)
      .maybeSingle();
    const orgActual = (perfilExistente?.organizacion_id as string | null) ?? null;
    const rolActual = (perfilExistente?.rol as string | null) ?? null;
    const mismaEmpresa = orgActual === emp.organizationId;

    if (rolActual === "superadmin") {
      return { ok: false, error: "Ese email no puede usarse acá." };
    }
    if (orgActual && !mismaEmpresa) {
      return { ok: false, error: "Ese email ya se usa en otra empresa." };
    }
    const rolDePersonal = rolActual === "supervisor" || rolActual === "empleado";
    if (!rolDePersonal && !mismaEmpresa) {
      return {
        ok: false,
        error: "Ese email ya tiene una cuenta. Usá otro o escribinos.",
      };
    }

    usuarioId = existente.id;
    const cambios: Record<string, string | null> = {
      organizacion_id: emp.organizationId,
      nombre: emp.nombre || null,
    };
    if (rolDePersonal) {
      cambios.local_id = emp.localId;
      cambios.rol = v.data.role;
    }
    await admin.from("usuarios").update(cambios).eq("id", usuarioId);
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      v.data.email,
      { data: meta },
    );
    if (error || !data?.user) {
      console.error("grantAppAccess invite", error?.message);
      return { ok: false, error: "No se pudo enviar la invitación." };
    }
    usuarioId = data.user.id;
    await admin
      .from("usuarios")
      .update({ nombre: emp.nombre || null, local_id: emp.localId })
      .eq("id", usuarioId);
  }

  const { error: accessErr } = await admin
    .from("usuario_sucursal")
    .upsert(
      { usuario_id: usuarioId, local_id: emp.localId },
      { onConflict: "usuario_id,local_id" },
    );
  if (accessErr) {
    console.error("grantAppAccess access", accessErr.message);
    return { ok: false, error: "No se pudo dar el acceso." };
  }

  const { error: linkErr } = await admin
    .from("empleados")
    .update({ usuario_id: usuarioId })
    .eq("id", emp.id);
  if (linkErr) {
    console.error("grantAppAccess link", linkErr.message);
    return { ok: false, error: "No se pudo vincular la cuenta." };
  }

  return { ok: true };
};

export const revokeAppAccess = async (
  input: unknown,
): Promise<SimpleResult> => {
  const v = parseInput(revokeSchema, input);
  if (!v.ok) return { ok: false, error: "Dato inválido." };

  const perfil = await getCurrentProfile();
  if (!perfil) return { ok: false, error: "No autorizado" };
  if (perfil.rol !== "admin" && perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const emp = await loadEmployee(admin, v.data.employeeId);
  if (!emp) return { ok: false, error: "No encontramos a esa persona." };
  if (perfil.rol === "admin" && emp.organizationId !== perfil.organizationId) {
    return { ok: false, error: "No autorizado" };
  }
  if (!emp.usuarioId) return { ok: true };
  if (emp.usuarioId === perfil.id) {
    return { ok: false, error: "No podés quitarte el acceso a vos mismo." };
  }

  await admin
    .from("usuario_sucursal")
    .delete()
    .eq("usuario_id", emp.usuarioId)
    .eq("local_id", emp.localId);

  const { data: restantes } = await admin
    .from("usuario_sucursal")
    .select("local_id")
    .eq("usuario_id", emp.usuarioId);

  const otra = (restantes as { local_id: string }[] | null)?.[0]?.local_id ?? null;
  await admin
    .from("usuarios")
    .update({ local_id: otra })
    .eq("id", emp.usuarioId);

  const { error } = await admin
    .from("empleados")
    .update({ usuario_id: null })
    .eq("id", emp.id);
  if (error) {
    console.error("revokeAppAccess", error.message);
    return { ok: false, error: "No se pudo quitar el acceso." };
  }

  return { ok: true };
};

/* Owner switches a linked account between waiter and manager. Never touches
 * owners or superadmins, nor the caller's own account. */
export const setAppAccessRole = async (input: unknown): Promise<SimpleResult> => {
  const v = parseInput(roleSchema, input);
  if (!v.ok) return { ok: false, error: "Dato inválido." };

  const perfil = await getCurrentProfile();
  if (!perfil || (perfil.rol !== "admin" && perfil.rol !== "superadmin")) {
    return { ok: false, error: "No autorizado" };
  }

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const emp = await loadEmployee(admin, v.data.employeeId);
  if (!emp?.usuarioId) return { ok: false, error: "Esa persona no entra a la app." };
  if (perfil.rol === "admin" && emp.organizationId !== perfil.organizationId) {
    return { ok: false, error: "No autorizado" };
  }
  if (emp.usuarioId === perfil.id) {
    return { ok: false, error: "No podés cambiar tu propio rol." };
  }

  const { data: cuenta } = await admin
    .from("usuarios")
    .select("rol")
    .eq("id", emp.usuarioId)
    .maybeSingle();
  const actual = (cuenta?.rol as string | null) ?? null;
  if (actual !== "empleado" && actual !== "supervisor") {
    return { ok: false, error: "Ese rol no se cambia desde acá." };
  }

  const { error } = await admin
    .from("usuarios")
    .update({ rol: v.data.role })
    .eq("id", emp.usuarioId);
  if (error) {
    console.error("setAppAccessRole", error.message);
    return { ok: false, error: "No se pudo cambiar el rol." };
  }
  return { ok: true };
};
