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
  telefono: string;
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
      telefono: input.telefono.trim() || null,
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

/** Email fijo de la org demo (no se invita a nadie). */
export const DEMO_ORG_EMAIL = "demo@cicalino.net";
const DEMO_ORG_NOMBRE = "Cicalino Demo";
const DEMO_SUC_NOMBRE = "Mostrador";
const DEMO_SUC_SLUG = "cicalino-demo";

export type DemoContexto = {
  organizacionId: string;
  organizacionNombre: string;
  sucursalId: string;
  sucursalNombre: string;
};

/**
 * Asegura la org + sucursal de demo para el superadmin.
 * Idempotente: si ya existe, la reutiliza. No invita usuario.
 */
export const asegurarOrgDemo = async (): Promise<
  { ok: true; demo: DemoContexto } | { ok: false; error: string }
> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const { data: existente } = await admin
    .from("organizaciones")
    .select("id, nombre, locales(id, nombre)")
    .eq("dueno_email", DEMO_ORG_EMAIL)
    .maybeSingle();

  if (existente) {
    const locales = (existente.locales ?? []) as {
      id: string;
      nombre: string;
    }[];
    let suc = locales[0];
    if (!suc) {
      const { data: creada, error } = await admin
        .from("locales")
        .insert({
          organizacion_id: existente.id,
          nombre: DEMO_SUC_NOMBRE,
          tipo_negocio: "cafeteria",
          slug: DEMO_SUC_SLUG,
        })
        .select("id, nombre")
        .single();
      if (error || !creada) {
        return { ok: false, error: error?.message ?? "No se pudo crear sucursal demo" };
      }
      suc = creada;
    }
    return {
      ok: true,
      demo: {
        organizacionId: existente.id,
        organizacionNombre: existente.nombre,
        sucursalId: suc.id,
        sucursalNombre: suc.nombre,
      },
    };
  }

  const { data: org, error } = await admin
    .from("organizaciones")
    .insert({
      nombre: DEMO_ORG_NOMBRE,
      responsable: "Cicalino",
      telefono: "1100000000",
      dueno_email: DEMO_ORG_EMAIL,
      cupo: 1,
      plan: "gratis",
      pagado: true,
      activo: true,
    })
    .select("id, nombre")
    .single();
  if (error || !org) {
    return { ok: false, error: error?.message ?? "No se pudo crear la demo" };
  }

  const { data: suc, error: errSuc } = await admin
    .from("locales")
    .insert({
      organizacion_id: org.id,
      nombre: DEMO_SUC_NOMBRE,
      tipo_negocio: "cafeteria",
      slug: DEMO_SUC_SLUG,
    })
    .select("id, nombre")
    .single();
  if (errSuc || !suc) {
    return { ok: false, error: errSuc?.message ?? "No se pudo crear sucursal demo" };
  }

  return {
    ok: true,
    demo: {
      organizacionId: org.id,
      organizacionNombre: org.nombre,
      sucursalId: suc.id,
      sucursalNombre: suc.nombre,
    },
  };
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
    telefono: "",
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
