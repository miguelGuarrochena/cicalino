"use server";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPerfilActual } from "@/lib/auth/profile";
import { enviarEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/appUrl";
import type { PlanCobroUI } from "@/lib/contrato";
import { parsear, idSchema } from "@/lib/schemas";
import {
  TERMINOS_VERSION,
  mpAlias,
  montoContrato,
  etiquetaCiclo,
} from "@/lib/contrato";

type Simple = { ok: true } | { ok: false; error: string };

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export type ContratoPublico = {
  nombre: string;
  plan: PlanCobroUI;
  cupo: number;
  monto: number;
  ciclo: string;
  alias: string;
  yaAceptado: boolean;
  aceptadoEn: string | null;
  enPrueba: boolean;
  pruebaHasta: string | null;
  terminosVersion: string;
};

const nuevoToken = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Datos públicos del contrato (por token). Sin login. */
export const obtenerContratoPorToken = async (
  token: string,
): Promise<ContratoPublico | null> => {
  const t = token.trim();
  if (t.length < 16) return null;
  const admin = createAdminSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("organizaciones")
    .select(
      "nombre, plan, cupo, contrato_aceptado_en, mes_gratis_hasta, terminos_version",
    )
    .eq("contrato_token", t)
    .maybeSingle();
  if (!data) return null;
  const plan = (data.plan as PlanCobroUI) ?? "mensual";
  const cupo = data.cupo ?? 1;
  const pruebaHasta = data.mes_gratis_hasta;
  const enPrueba =
    !!pruebaHasta && new Date(pruebaHasta).getTime() > Date.now();
  return {
    nombre: data.nombre,
    plan,
    cupo,
    monto: montoContrato(plan, cupo),
    ciclo: etiquetaCiclo(plan),
    alias: mpAlias(),
    yaAceptado: Boolean(data.contrato_aceptado_en),
    aceptadoEn: data.contrato_aceptado_en,
    enPrueba,
    pruebaHasta,
    terminosVersion: data.terminos_version ?? TERMINOS_VERSION,
  };
};

/** Aceptación pública: checkbox en /aceptar/[token]. */
export const aceptarContrato = async (token: string): Promise<Simple> => {
  const t = token.trim();
  if (t.length < 16) return { ok: false, error: "Link inválido." };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Servicio no configurado." };

  const { data: org } = await admin
    .from("organizaciones")
    .select("id, nombre, dueno_email, contrato_aceptado_en")
    .eq("contrato_token", t)
    .maybeSingle();
  if (!org) return { ok: false, error: "Link inválido o vencido." };
  if (org.contrato_aceptado_en) {
    return { ok: true };
  }

  const ahora = new Date().toISOString();
  const { error } = await admin
    .from("organizaciones")
    .update({
      contrato_aceptado_en: ahora,
      terminos_version: TERMINOS_VERSION,
    })
    .eq("id", org.id);
  if (error) {
    console.error("aceptarContrato", error.message);
    return { ok: false, error: "No se pudo registrar la aceptación." };
  }

  const notify = process.env.LEAD_NOTIFY_EMAIL ?? "info@cicalino.net";
  void enviarEmail({
    to: notify,
    subject: `Contrato aceptado — ${org.nombre}`,
    replyTo: org.dueno_email,
    html: emailLayout({
      titulo: "Condiciones aceptadas",
      cuerpoHtml: `<p style="margin:0;"><b>${esc(org.nombre)}</b> aceptó las bases (${TERMINOS_VERSION}).</p>
        <p style="margin:8px 0 0;font-size:14px;">Mail: ${esc(org.dueno_email)}</p>`,
      cta: { label: "Ver en Superadmin", url: `${appBaseUrl()}/admin` },
    }),
  });

  return { ok: true };
};

/**
 * Genera (o reusa) el token y manda el mail con link + alias MP.
 * Solo superadmin. También se llama al activar un lead.
 */
export const enviarLinkContrato = async (
  organizacionId: string,
): Promise<Simple & { url?: string }> => {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parsear(idSchema, { id: organizacionId });
  if (!v.ok) return { ok: false, error: v.error };
  return enviarLinkContratoInterno(v.data.id);
};

/** Uso interno (activar lead): no chequea rol de nuevo. */
export const enviarLinkContratoInterno = async (
  organizacionId: string,
): Promise<Simple & { url?: string }> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const { data: org } = await admin
    .from("organizaciones")
    .select(
      "id, nombre, dueno_email, plan, cupo, contrato_token, mes_gratis_hasta, responsable",
    )
    .eq("id", organizacionId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Empresa no encontrada." };

  let token = org.contrato_token as string | null;
  if (!token) {
    token = nuevoToken();
    const { error } = await admin
      .from("organizaciones")
      .update({ contrato_token: token })
      .eq("id", org.id);
    if (error) {
      console.error("enviarLinkContrato/token", error.message);
      return { ok: false, error: "No se pudo generar el link." };
    }
  }

  const url = `${appBaseUrl()}/aceptar/${token}`;
  const plan = (org.plan as PlanCobroUI) ?? "mensual";
  const cupo = org.cupo ?? 1;
  const monto = montoContrato(plan, cupo);
  const alias = mpAlias();
  const prueba =
    org.mes_gratis_hasta &&
    new Date(org.mes_gratis_hasta).getTime() > Date.now();
  const nombre = org.responsable || org.nombre;

  const cuerpoPago = prueba
    ? `<p style="margin:0 0 8px;">Mientras dura tu mes gratis no hace falta pagar.
      Al terminar, transferí <b>${money(monto)}</b> (${etiquetaCiclo(plan)})
      al alias de Mercado Pago:</p>`
    : `<p style="margin:0 0 8px;">Para activar / continuar el servicio, transferí
      <b>${money(monto)}</b> (${etiquetaCiclo(plan)}) al alias de Mercado Pago:</p>`;

  await enviarEmail({
    to: org.dueno_email,
    subject: "Condiciones y pago — Cicalino",
    html: emailLayout({
      titulo: "Condiciones y pago",
      cuerpoHtml: `<p style="margin:0 0 8px;">¡Hola ${esc(String(nombre))}!</p>
        <p style="margin:0 0 12px;">Para <b>${esc(org.nombre)}</b> necesitamos que aceptes
        las bases y condiciones del servicio.</p>
        ${cuerpoPago}
        <p style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:.02em;color:#2536d4;">${esc(alias)}</p>
        <p style="margin:0;font-size:13px;opacity:.75;">En el concepto podés poner el nombre del local.
        Cuando veamos el pago, lo marcamos al día.</p>`,
      cta: { label: "Aceptar condiciones", url },
      pie: "Cicalino · Si no pediste esto, ignorá el mail.",
    }),
  });

  return { ok: true, url };
};
