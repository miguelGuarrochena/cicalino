"use server";

import { getPerfilActual } from "@/lib/auth/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  crearOrganizacionSchema,
  idSchema,
  parsear,
  type CrearOrganizacionInput,
} from "@/lib/schemas";
import type { Solicitud } from "@/lib/db/schema";

type Resultado = { ok: true; id: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "sucursal";

// Sufijo del slug con randomness criptográfica (Math.random es predecible).
const sufijoAleatorio = (): string => {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

// Solo superadmin. Crea la organización + sucursales e invita al dueño por email.
// Usa service_role porque organizaciones no tiene policy de INSERT para anon.
export const crearOrganizacion = async (input: unknown): Promise<Resultado> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parsear(crearOrganizacionSchema, input);
  if (!v.ok) return { ok: false, error: v.error };
  return crearOrganizacionValidada(v.data);
};

// Alta ya validada. Se reutiliza desde activarSolicitud sin re-parsear.
const crearOrganizacionValidada = async (
  data: CrearOrganizacionInput,
): Promise<Resultado> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  let mesGratisHasta: string | null = null;
  let proximoCobroEn: string | null = null;
  if (data.mesGratis) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    mesGratisHasta = d.toISOString();
    proximoCobroEn = mesGratisHasta;
  }

  // El cupo contratado tiene que alcanzar para las sucursales que se dan de
  // alta: antes se podía crear una empresa con cupo 1 y 10 sucursales.
  if (data.sucursales.length > data.cupo) {
    return {
      ok: false,
      error: `El cupo (${data.cupo}) no alcanza para ${data.sucursales.length} sucursales.`,
    };
  }

  const { data: org, error } = await admin
    .from("organizaciones")
    .insert({
      nombre: data.nombre,
      responsable: data.responsable,
      telefono: data.telefono || null,
      cuil: data.cuil || null,
      direccion: data.direccion ?? null,
      dueno_email: data.duenoEmail,
      cupo: data.cupo,
      plan: data.plan,
      mes_gratis_hasta: mesGratisHasta,
      proximo_cobro_en: proximoCobroEn,
    })
    .select("id")
    .single();
  if (error || !org) {
    console.error("crearOrganizacion", error?.message);
    return { ok: false, error: "No se pudo crear la empresa." };
  }

  if (data.sucursales.length) {
    const rows = data.sucursales.map((b) => ({
      organizacion_id: org.id,
      nombre: b.nombre,
      tipo_negocio: b.tipo,
      direccion: b.direccion ?? null,
      slug: `${slugify(b.nombre)}-${sufijoAleatorio()}`,
    }));
    const { error: errSuc } = await admin.from("locales").insert(rows);
    if (errSuc) console.error("crearOrganizacion/locales", errSuc.message);
  }

  // Invitar al dueño (si el mail ya existe, ignoramos el error).
  await admin.auth.admin.inviteUserByEmail(data.duenoEmail, {
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
  const v = parsear(idSchema, { id });
  if (!v.ok) return { ok: false, error: v.error };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };
  const { error } = await admin
    .from("organizaciones")
    .delete()
    .eq("id", v.data.id);
  if (error) {
    console.error("eliminarOrganizacion", error.message);
    return { ok: false, error: "No se pudo eliminar la empresa." };
  }
  return { ok: true };
};

// En "use server" solo se exportan async actions (no constantes ni types).
const DEMO_ORG_EMAIL = "demo@cicalino.net";
const DEMO_ORG_NOMBRE = "Cicalino Demo";
const DEMO_SUC_NOMBRE = "Mostrador";
const DEMO_SUC_SLUG = "cicalino-demo";

type DemoContexto = {
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
  const v = parsear(idSchema, { id });
  if (!v.ok) return { ok: false, error: v.error };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const { data: sol } = await admin
    .from("solicitudes")
    .select("*")
    .eq("id", v.data.id)
    .single();
  if (!sol) return { ok: false, error: "Solicitud no encontrada" };

  // La solicitud viene de un formulario público: la revalidamos con el mismo
  // esquema que un alta manual antes de convertirla en empresa.
  const alta = parsear(crearOrganizacionSchema, {
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
  if (!alta.ok) return { ok: false, error: alta.error };

  const res = await crearOrganizacionValidada(alta.data);
  if (!res.ok) return res;

  await admin
    .from("solicitudes")
    .update({ estado: "atendida" })
    .eq("id", v.data.id);

  // Mail con bases + alias MP (best-effort).
  if (res.id) {
    const { enviarLinkContratoInterno } = await import("@/lib/actions/contrato");
    await enviarLinkContratoInterno(res.id);
  }
  return res;
};

export const descartarSolicitud = async (
  id: string,
): Promise<SimpleResult> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parsear(idSchema, { id });
  if (!v.ok) return { ok: false, error: v.error };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };
  await admin
    .from("solicitudes")
    .update({ estado: "descartada" })
    .eq("id", v.data.id);
  return { ok: true };
};
