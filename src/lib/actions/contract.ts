"use server";

import { headers } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/profile";
import { sendEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/appUrl";
import type { BillingPlanUI } from "@/lib/contract";
import { parseInput, idSchema } from "@/lib/schemas";
import {
  TERMS_VERSION,
  mpAlias,
  contractAmountForBranches,
  billingCycleLabel,
  contractTokenExpired,
} from "@/lib/contract";
import {
  branchesModuleLabel,
  type ModuleFlags,
} from "@/lib/pricing";
import { sendContractLinkInternal } from "@/lib/server/sendContractLink";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";

type Simple = { ok: true } | { ok: false; error: string };

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type PublicContract = {
  name: string;
  plan: BillingPlanUI;
  cupo: number;
  monto: number;
  ciclo: string;
  alias: string;
  yaAceptado: boolean;
  aceptadoEn: string | null;
  enPrueba: boolean;
  pruebaHasta: string | null;
  termsVersion: string;
  modulos: string;
};

const nuevoToken = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

const clientIpFromHeaders = async (): Promise<string> => {
  const hdrs = await headers();
  return (
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip")?.trim() ||
    "sin-ip"
  );
};

const rateLimitContract = async (
  action: "get" | "accept",
  token: string,
): Promise<boolean> => {
  const ip = await clientIpFromHeaders();
  const fingerprint = token.slice(0, 16);
  const porIp = await sharedRateLimit(
    `contrato:${action}:ip:${ip}`,
    action === "get" ? 30 : 10,
    60_000,
  );
  if (!porIp.ok) return false;
  const porToken = await sharedRateLimit(
    `contrato:${action}:tok:${fingerprint}`,
    action === "get" ? 20 : 5,
    60_000,
  );
  return porToken.ok;
};

export const getContractByToken = async (
  token: string,
): Promise<PublicContract | null> => {
  const t = token.trim();
  if (t.length < 16) return null;
  if (!(await rateLimitContract("get", t))) return null;

  const admin = createAdminSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("organizaciones")
    .select(
      "id, nombre, plan, cupo, contrato_aceptado_en, contrato_token_creado_en, mes_gratis_hasta, terminos_version, locales(modulo_pedidos, modulo_espera)",
    )
    .eq("contrato_token", t)
    .maybeSingle();
  if (!data) return null;
  if (
    !data.contrato_aceptado_en &&
    contractTokenExpired(data.contrato_token_creado_en as string | null)
  ) {
    return null;
  }
  const plan = (data.plan as BillingPlanUI) ?? "mensual";
  const cupo = data.cupo ?? 1;
  const locales = (data.locales ?? []) as {
    modulo_pedidos: boolean | null;
    modulo_espera: boolean | null;
  }[];
  const packs: ModuleFlags[] = locales.length
    ? locales.map((l) => ({
        pedidos: l.modulo_pedidos !== false,
        espera: Boolean(l.modulo_espera),
      }))
    : Array.from({ length: Math.max(1, cupo) }, () => ({
        pedidos: true,
        espera: false,
      }));
  const pruebaHasta = data.mes_gratis_hasta;
  const enPrueba =
    !!pruebaHasta && new Date(pruebaHasta).getTime() > Date.now();
  return {
    name: data.nombre,
    plan,
    cupo: packs.length,
    monto: contractAmountForBranches(plan, packs),
    ciclo: billingCycleLabel(plan),
    alias: mpAlias(),
    yaAceptado: Boolean(data.contrato_aceptado_en),
    aceptadoEn: data.contrato_aceptado_en,
    enPrueba,
    pruebaHasta,
    termsVersion: data.terminos_version ?? TERMS_VERSION,
    modulos: branchesModuleLabel(packs),
  };
};

export const acceptContract = async (token: string): Promise<Simple> => {
  const t = token.trim();
  if (t.length < 16) return { ok: false, error: "Link inválido." };
  if (!(await rateLimitContract("accept", t))) {
    return { ok: false, error: "Demasiados intentos. Probá en un minuto." };
  }

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Servicio no configurado." };

  const { data: org } = await admin
    .from("organizaciones")
    .select(
      "id, nombre, dueno_email, contrato_aceptado_en, contrato_token_creado_en",
    )
    .eq("contrato_token", t)
    .maybeSingle();
  if (!org) return { ok: false, error: "Link inválido o vencido." };
  if (org.contrato_aceptado_en) {
    return { ok: true };
  }
  if (contractTokenExpired(org.contrato_token_creado_en as string | null)) {
    return {
      ok: false,
      error: "Este link venció. Pedile uno nuevo a Cicalino.",
    };
  }

  const ahora = new Date().toISOString();
  const { data: stamped, error } = await admin
    .from("organizaciones")
    .update({
      contrato_aceptado_en: ahora,
      terminos_version: TERMS_VERSION,
    })
    .eq("id", org.id)
    .is("contrato_aceptado_en", null)
    .select("id");
  if (error) {
    console.error("aceptarContrato", error.message);
    return { ok: false, error: "No se pudo registrar la aceptación." };
  }
  if (!stamped?.length) {
    return { ok: true };
  }

  const notify = process.env.LEAD_NOTIFY_EMAIL ?? "info@cicalino.net";
  void sendEmail({
    to: notify,
    subject: `Listo para activar: ${org.nombre}`,
    replyTo: org.dueno_email,
    html: emailLayout({
      titulo: "Condiciones aceptadas",
      cuerpoHtml: `<p style="margin:0;"><b>${esc(org.nombre)}</b> aceptó las bases (${TERMS_VERSION}).</p>
        <p style="margin:8px 0 0;font-size:14px;">Mail: ${esc(org.dueno_email)}</p>
        <p style="margin:8px 0 0;font-size:14px;">Ya podés <b>activar</b> la cuenta desde Superadmin
        (ahí se manda el mail de alta al dueño).</p>`,
      cta: { label: "Abrir Superadmin", url: `${appBaseUrl()}/admin` },
    }),
  });

  return { ok: true };
};

export const sendContractLink = async (
  organizationId: string,
): Promise<Simple & { url?: string }> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(idSchema, { id: organizationId });
  if (!v.ok) return { ok: false, error: v.error };
  return sendContractLinkInternal(v.data.id);
};

export const getContractLink = async (
  organizationId: string,
): Promise<Simple & { url?: string }> => {
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
    .select("id, contrato_token, contrato_token_creado_en")
    .eq("id", v.data.id)
    .maybeSingle();
  if (!org) return { ok: false, error: "Empresa no encontrada." };

  let token = org.contrato_token as string | null;
  const vencido = contractTokenExpired(
    org.contrato_token_creado_en as string | null,
  );
  if (!token || vencido) {
    token = nuevoToken();
    const { error } = await admin
      .from("organizaciones")
      .update({
        contrato_token: token,
        contrato_token_creado_en: new Date().toISOString(),
      })
      .eq("id", org.id);
    if (error) return { ok: false, error: "No se pudo generar el link." };
  }

  return { ok: true, url: `${appBaseUrl()}/aceptar/${token}` };
};
