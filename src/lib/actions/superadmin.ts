"use server";

import { getPerfilActual } from "@/lib/auth/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Solicitud } from "@/lib/db/schema";

type Resultado = { ok: true; id: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

type SucursalInput = { nombre: string; tipo: string; direccion?: string };

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "sucursal";

// Solo superadmin. Crea la organización + sucursales e invita al dueño por email.
// Usa service_role porque organizaciones no tiene policy de INSERT para anon.
export const crearOrganizacion = async (input: {
  nombre: string;
  responsable: string;
  cuil: string;
  direccion: string;
  duenoEmail: string;
  cupo: number;
  plan?: string;
  mesGratis?: boolean;
  sucursales: SucursalInput[];
}): Promise<Resultado> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  let mesGratisHasta: string | null = null;
  if (input.mesGratis) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    mesGratisHasta = d.toISOString();
  }

  const { data: org, error } = await admin
    .from("organizaciones")
    .insert({
      nombre: input.nombre.trim(),
      responsable: input.responsable.trim() || null,
      cuil: input.cuil.trim() || null,
      direccion: input.direccion.trim() || null,
      dueno_email: input.duenoEmail.trim(),
      cupo: Math.max(1, input.cupo || 1),
      plan: input.plan ?? "mensual",
      mes_gratis_hasta: mesGratisHasta,
    })
    .select("id")
    .single();
  if (error || !org) {
    return { ok: false, error: error?.message ?? "No se pudo crear" };
  }

  if (input.sucursales.length) {
    const rows = input.sucursales.map((b) => ({
      organizacion_id: org.id,
      nombre: b.nombre.trim(),
      tipo_negocio: b.tipo,
      direccion: b.direccion?.trim() || null,
      slug: `${slugify(b.nombre)}-${Math.random().toString(36).slice(2, 7)}`,
    }));
    await admin.from("locales").insert(rows);
  }

  // Invitar al dueño (si el mail ya existe, ignoramos el error).
  await admin.auth.admin.inviteUserByEmail(input.duenoEmail.trim(), {
    data: { rol: "admin", organizacion_id: org.id },
  });

  return { ok: true, id: org.id };
};

// Elimina la organización (cascade borra sucursales y pedidos). Solo superadmin.
export const eliminarOrganizacion = async (
  id: string,
): Promise<SimpleResult> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };
  const { error } = await admin.from("organizaciones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

// --- Solicitudes de prueba (leads) — solo superadmin --------------------------

export const listarSolicitudes = async (): Promise<Solicitud[]> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") return [];
  const admin = createAdminSupabase();
  if (!admin) return [];
  const { data } = await admin
    .from("solicitudes")
    .select("*")
    .order("creado_en", { ascending: false });
  return (data ?? []) as Solicitud[];
};

// Activa una solicitud: crea la organización con 1 mes gratis + invita al dueño,
// y marca la solicitud como atendida.
export const activarSolicitud = async (id: string): Promise<Resultado> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const { data: sol } = await admin
    .from("solicitudes")
    .select("*")
    .eq("id", id)
    .single();
  if (!sol) return { ok: false, error: "Solicitud no encontrada" };

  const res = await crearOrganizacion({
    nombre: sol.local || sol.nombre,
    responsable: sol.nombre,
    cuil: "",
    direccion: sol.ciudad || "",
    duenoEmail: sol.email,
    cupo: 1,
    plan: "mensual",
    mesGratis: true,
    sucursales: [
      { nombre: sol.local || "Principal", tipo: "otro", direccion: sol.ciudad || "" },
    ],
  });
  if (!res.ok) return res;

  await admin.from("solicitudes").update({ estado: "atendida" }).eq("id", id);
  return res;
};

export const descartarSolicitud = async (
  id: string,
): Promise<SimpleResult> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };
  await admin.from("solicitudes").update({ estado: "descartada" }).eq("id", id);
  return { ok: true };
};
