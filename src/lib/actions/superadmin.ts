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

  // Queda inactiva hasta que el cliente acepte condiciones (o el
  // superadmin la active a mano desde el popup).
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
      activo: false,
      mes_gratis_hasta: mesGratisHasta,
      proximo_cobro_en: proximoCobroEn,
      modulo_pedidos: data.moduloPedidos !== false,
      modulo_espera: Boolean(data.moduloEspera),
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
      modulo_pedidos: data.moduloPedidos !== false,
      modulo_espera: Boolean(data.moduloEspera),
    }));
    const { error: errSuc } = await admin.from("locales").insert(rows);
    if (errSuc) console.error("crearOrganizacion/locales", errSuc.message);
  }

  // No invitamos acá: el mail de alta va al activar la cuenta.
  // Al preparar un lead solo se manda el link de condiciones.
  return { ok: true, id: org.id };
};

/** ¿Ya existe un usuario Auth con este email? */
const authUserPorEmail = async (
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>,
  email: string,
): Promise<{ id: string } | null> => {
  const mail = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.error("authUserPorEmail", error.message);
      return null;
    }
    const hit = data?.users?.find((u) => u.email?.toLowerCase() === mail);
    if (hit) return { id: hit.id };
    if (!data?.users?.length) break;
  }
  return null;
};

/**
 * Invita al dueño solo si todavía no tiene usuario Auth.
 * Se usa al activar la cuenta (no al crear la org / mandar condiciones).
 */
export const invitarDuenoAlActivar = async (
  organizacionId: string,
): Promise<SimpleResult> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parsear(idSchema, { id: organizacionId });
  if (!v.ok) return { ok: false, error: v.error };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const { data: org } = await admin
    .from("organizaciones")
    .select("id, dueno_email")
    .eq("id", v.data.id)
    .maybeSingle();
  if (!org) return { ok: false, error: "Empresa no encontrada." };

  const email = String(org.dueno_email ?? "").trim();
  if (!email) return { ok: false, error: "La empresa no tiene email de dueño." };

  const ya = await authUserPorEmail(admin, email);
  if (ya) {
    // Asegura vínculo org en el perfil por si quedó suelto.
    await admin
      .from("usuarios")
      .update({ organizacion_id: org.id, rol: "admin" })
      .eq("id", ya.id);
    return { ok: true };
  }

  const meta = { rol: "admin", organizacion_id: org.id };
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: meta,
  });
  if (error) {
    console.error("invitarDuenoAlActivar", error.message);
    return { ok: false, error: "No se pudo enviar la invitación de alta." };
  }
  return { ok: true };
};

/** Activa la cuenta e invita al dueño (mail de alta). */
export const activarOrganizacion = async (
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
    .update({ activo: true })
    .eq("id", v.data.id);
  if (error) {
    console.error("activarOrganizacion", error.message);
    return { ok: false, error: "No se pudo activar la cuenta." };
  }

  const inv = await invitarDuenoAlActivar(v.data.id);
  if (!inv.ok) {
    // La cuenta ya quedó activa; avisamos el fallo del mail.
    return {
      ok: false,
      error: `Cuenta activa, pero falló la invitación: ${inv.error}`,
    };
  }
  return { ok: true };
};

// Elimina la organización (cascade borra sucursales, pedidos y perfiles).
// También libera el mail: Auth + solicitudes previas, para poder volver a contratar.
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

  const { data: org } = await admin
    .from("organizaciones")
    .select("id, dueno_email")
    .eq("id", v.data.id)
    .maybeSingle();
  if (!org) return { ok: false, error: "Empresa no encontrada." };

  const { data: perfiles } = await admin
    .from("usuarios")
    .select("id")
    .eq("organizacion_id", v.data.id);

  const { error } = await admin
    .from("organizaciones")
    .delete()
    .eq("id", v.data.id);
  if (error) {
    console.error("eliminarOrganizacion", error.message);
    return { ok: false, error: "No se pudo eliminar la empresa." };
  }

  const mail = String(org.dueno_email ?? "").trim().toLowerCase();
  if (mail) {
    const { error: solErr } = await admin
      .from("solicitudes")
      .update({ estado: "descartada" })
      .ilike("email", mail)
      .in("estado", ["nueva", "atendida"]);
    if (solErr) console.error("eliminarOrganizacion/solicitudes", solErr.message);
  }

  for (const p of perfiles ?? []) {
    const { error: authErr } = await admin.auth.admin.deleteUser(p.id);
    if (authErr) console.error("eliminarOrganizacion/auth", authErr.message);
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

// Atiende una solicitud: crea la org (inactiva) y manda el link de
// condiciones. El mail de alta (invitar dueño) se manda al activar.
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

  const mail = String(sol.email ?? "").trim().toLowerCase();
  const { data: orgExistente } = await admin
    .from("organizaciones")
    .select("id, nombre")
    .ilike("dueno_email", mail)
    .limit(1)
    .maybeSingle();
  if (orgExistente) {
    return {
      ok: false,
      error: `Este mail ya tiene la empresa «${orgExistente.nombre}». Sumá una sucursal o usá «+ Mes gratis» a mano si corresponde.`,
    };
  }

  // Prueba → 1 mes gratis + pedidos. Contrato → plan/pack elegido.
  const esContrato = sol.tipo === "contrato";
  const planSol =
    sol.plan === "anual" || sol.plan === "mensual" ? sol.plan : "mensual";
  const packSol =
    sol.pack === "espera" || sol.pack === "pack" || sol.pack === "pedidos"
      ? sol.pack
      : "pedidos";
  const moduloPedidos = packSol === "pedidos" || packSol === "pack";
  const moduloEspera = packSol === "espera" || packSol === "pack";

  const alta = parsear(crearOrganizacionSchema, {
    nombre: sol.local || sol.nombre,
    responsable: sol.nombre,
    telefono: typeof sol.telefono === "string" ? sol.telefono : "",
    cuil: typeof sol.cuil === "string" && sol.cuil.replace(/\D/g, "").length === 11
      ? sol.cuil.replace(/\D/g, "")
      : "",
    direccion:
      (typeof sol.direccion === "string" && sol.direccion) ||
      (typeof sol.ciudad === "string" && sol.ciudad) ||
      "",
    duenoEmail: mail,
    cupo: 1,
    plan: esContrato ? planSol : "mensual",
    mesGratis: !esContrato,
    moduloPedidos: esContrato ? moduloPedidos : true,
    moduloEspera: esContrato ? moduloEspera : false,
    sucursales: [
      {
        nombre: sol.local || "Principal",
        tipo: "otro",
        direccion:
          (typeof sol.direccion === "string" && sol.direccion) ||
          (typeof sol.ciudad === "string" && sol.ciudad) ||
          "",
      },
    ],
  });
  if (!alta.ok) return { ok: false, error: alta.error };

  const res = await crearOrganizacionValidada(alta.data);
  if (!res.ok) return res;

  await admin
    .from("solicitudes")
    .update({ estado: "atendida" })
    .eq("id", v.data.id);

  // Mail con bases + alias MP (best-effort: no tumba la activación).
  if (res.id) {
    try {
      const { enviarLinkContratoInterno } = await import("@/lib/actions/contrato");
      const mail = await enviarLinkContratoInterno(res.id);
      if (!mail.ok) console.error("activarSolicitud/contrato", mail.error);
    } catch (e) {
      console.error("activarSolicitud/contrato", e);
    }
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
