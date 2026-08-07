"use server";

import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { startTrial, toDateOnly } from "@/lib/subscription";
import { sendWelcomeEmail } from "@/lib/actions/subscriptionSweep";
import {
  createOrganizationSchema,
  idSchema,
  parseInput,
  type CreateOrgInput,
} from "@/lib/schemas";
import { leadToOrgPayload, type LeadRow } from "@/lib/leadToOrg";
import type { Lead } from "@/lib/db/schema";

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

const sufijoAleatorio = (): string => {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

export const createOrganization = async (input: unknown): Promise<Resultado> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(createOrganizationSchema, input);
  if (!v.ok) return { ok: false, error: v.error };
  return createOrganizationValidated(v.data);
};

const createOrganizationValidated = async (
  data: CreateOrgInput,
): Promise<Resultado> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  /* El mes de cortesía corre la primera factura. Antes escribía además
   * `proximo_cobro_en`, que quedaba distinto de `proxima_factura` desde el
   * alta misma: una decía fin de la cortesía y la otra fin de la prueba. */
  let freeMonthUntil: string | null = null;
  if (data.mesGratis) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    freeMonthUntil = d.toISOString();
  }


  const trial = startTrial(toDateOnly(new Date()));

  const { data: org, error } = await admin
    .from("organizaciones")
    .insert({
      nombre: data.name,
      responsable: data.responsable,
      telefono: data.telefono || null,
      cuil: data.cuil || null,
      direccion: data.direccion ?? null,
      dueno_email: data.ownerEmail,
      cupo: data.cupo,
      plan: data.plan,
      activo: false,
      mes_gratis_hasta: freeMonthUntil,
      estado_suscripcion: "trial",
      prueba_inicio: trial.trialStart,
      prueba_fin: trial.trialEnd,
      proxima_factura: freeMonthUntil
        ? freeMonthUntil.slice(0, 10)
        : trial.nextBilling,
      dia_ciclo: trial.cycleDay,
      modulo_pedidos: data.moduloPedidos !== false,
      modulo_espera: Boolean(data.moduloEspera),
    })
    .select("id")
    .single();
  if (error || !org) {
    console.error("crearOrganizacion", error?.message);
    return { ok: false, error: "No se pudo crear la empresa." };
  }

  void sendWelcomeEmail({
    orgId: org.id,
    nombre: data.name,
    email: data.ownerEmail,
    pruebaFin: trial.trialEnd,
    primeraFactura: trial.nextBilling,
  }).catch(() => {});

  if (data.sucursales.length) {
    const rows = data.sucursales.map((b) => {
      let pedidos = b.moduloPedidos !== false;
      const espera = Boolean(b.moduloEspera);
      if (!pedidos && !espera) pedidos = true;
      return {
        organizacion_id: org.id,
        cobro_desde: trial.nextBilling,
        nombre: b.name,
        tipo_negocio: b.tipo,
        direccion: b.direccion ?? null,
        slug: `${slugify(b.name)}-${sufijoAleatorio()}`,
        modulo_pedidos: pedidos,
        modulo_espera: espera,
      };
    });
    const { error: errSuc } = await admin.from("locales").insert(rows);
    if (errSuc) console.error("crearOrganizacion/locales", errSuc.message);
    else {
      const pedidos = rows.some((r) => r.modulo_pedidos);
      const espera = rows.some((r) => r.modulo_espera);
      await admin
        .from("organizaciones")
        .update({
          modulo_pedidos: pedidos || !espera,
          modulo_espera: espera,
        })
        .eq("id", org.id);
    }
  }

  return { ok: true, id: org.id };
};

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

export const inviteOwnerOnActivate = async (
  organizationId: string,
): Promise<SimpleResult> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(idSchema, { id: organizationId });
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

export const activateOrg = async (
  id: string,
): Promise<SimpleResult> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(idSchema, { id });
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

  const inv = await inviteOwnerOnActivate(v.data.id);
  if (!inv.ok) {
    return {
      ok: false,
      error: `Cuenta activa, pero falló la invitación: ${inv.error}`,
    };
  }
  return { ok: true };
};

export const deleteOrg = async (
  id: string,
): Promise<SimpleResult> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(idSchema, { id });
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

const DEMO_ORG_EMAIL = "demo@cicalino.net";
const DEMO_ORG_NAME = "Cicalino Demo";
const DEMO_BRANCH_NAME = "Mostrador";
const DEMO_SUC_SLUG = "cicalino-demo";

type DemoContexto = {
  organizationId: string;
  organizationName: string;
  sucursalId: string;
  branchName: string;
};

export const ensureDemoOrg = async (): Promise<
  { ok: true; demo: DemoContexto } | { ok: false; error: string }
> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const aplicarModulosDemo = async (orgId: string, sucId: string) => {
    await admin
      .from("organizaciones")
      .update({
        modulo_pedidos: true,
        modulo_espera: true,
        plan: "gratis",
        pagado: true,
        activo: true,
      })
      .eq("id", orgId);
    await admin
      .from("locales")
      .update({
        modulo_pedidos: true,
        modulo_espera: true,
        cantidad_mesas: 12,
      })
      .eq("id", sucId);
  };

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
          nombre: DEMO_BRANCH_NAME,
          tipo_negocio: "cafeteria",
          slug: DEMO_SUC_SLUG,
          modulo_pedidos: true,
          modulo_espera: true,
          cantidad_mesas: 12,
        })
        .select("id, nombre")
        .single();
      if (error || !creada) {
        return { ok: false, error: error?.message ?? "No se pudo crear sucursal demo" };
      }
      suc = creada;
    }
    await aplicarModulosDemo(existente.id, suc.id);
    return {
      ok: true,
      demo: {
        organizationId: existente.id,
        organizationName: existente.nombre,
        sucursalId: suc.id,
        branchName: suc.nombre,
      },
    };
  }

  const { data: org, error } = await admin
    .from("organizaciones")
    .insert({
      nombre: DEMO_ORG_NAME,
      responsable: "Cicalino",
      telefono: "1100000000",
      dueno_email: DEMO_ORG_EMAIL,
      cupo: 1,
      plan: "gratis",
      pagado: true,
      activo: true,
      modulo_pedidos: true,
      modulo_espera: true,
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
      nombre: DEMO_BRANCH_NAME,
      tipo_negocio: "cafeteria",
      slug: DEMO_SUC_SLUG,
      modulo_pedidos: true,
      modulo_espera: true,
      cantidad_mesas: 12,
    })
    .select("id, nombre")
    .single();
  if (errSuc || !suc) {
    return { ok: false, error: errSuc?.message ?? "No se pudo crear sucursal demo" };
  }

  return {
    ok: true,
    demo: {
      organizationId: org.id,
      organizationName: org.nombre,
      sucursalId: suc.id,
      branchName: suc.nombre,
    },
  };
};

export const listLeads = async (): Promise<Lead[]> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") return [];
  const admin = createAdminSupabase();
  if (!admin) return [];
  const { data } = await admin
    .from("solicitudes")
    .select("*")
    .order("creado_en", { ascending: false });
  return (data ?? []) as Lead[];
};

export const activateLead = async (id: string): Promise<Resultado> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(idSchema, { id });
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

  const payload = leadToOrgPayload({ ...(sol as LeadRow), email: mail });

  const alta = parseInput(createOrganizationSchema, payload);
  if (!alta.ok) return { ok: false, error: alta.error };

  const res = await createOrganizationValidated(alta.data);
  if (!res.ok) return res;

  await admin
    .from("solicitudes")
    .update({ estado: "atendida" })
    .eq("id", v.data.id);

  if (res.id) {
    try {
      const { sendContractLinkInternal } = await import("@/lib/actions/contract");
      const mail = await sendContractLinkInternal(res.id);
      if (!mail.ok) console.error("activarSolicitud/contrato", mail.error);
    } catch (e) {
      console.error("activarSolicitud/contrato", e);
    }
  }
  return res;
};

export const dismissLead = async (
  id: string,
): Promise<SimpleResult> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(idSchema, { id });
  if (!v.ok) return { ok: false, error: v.error };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };
  await admin
    .from("solicitudes")
    .update({ estado: "descartada" })
    .eq("id", v.data.id);
  return { ok: true };
};
