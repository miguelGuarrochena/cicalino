import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/appUrl";
import type { BillingPlanUI } from "@/lib/contract";
import {
  mpAlias,
  contractAmountForBranches,
  billingCycleLabel,
} from "@/lib/contract";
import {
  branchesModuleLabel,
  type ModuleFlags,
} from "@/lib/pricing";

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

const nuevoToken = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/* Helper interno (server-only). Lo llaman sendContractLink (superadmin) y
 * activateLead (superadmin). No es Server Action: no puede invocarse desde el
 * cliente ni devolver el link de contrato a un usuario no autorizado. */
export const sendContractLinkInternal = async (
  organizationId: string,
): Promise<Simple & { url?: string }> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const { data: org } = await admin
    .from("organizaciones")
    .select(
      "id, nombre, dueno_email, plan, cupo, contrato_token, mes_gratis_hasta, responsable, locales(modulo_pedidos, modulo_espera)",
    )
    .eq("id", organizationId)
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
  const plan = (org.plan as BillingPlanUI) ?? "mensual";
  const cupo = org.cupo ?? 1;
  const locales = (org.locales ?? []) as {
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
  const monto = contractAmountForBranches(plan, packs);
  const packLbl = branchesModuleLabel(packs);
  const alias = mpAlias();
  const prueba =
    org.mes_gratis_hasta &&
    new Date(org.mes_gratis_hasta).getTime() > Date.now();
  const nombre = org.responsable || org.nombre;

  const cuerpoPago = prueba
    ? `<p style="margin:0 0 8px;">Mientras dura tu mes gratis no hace falta pagar.
      Al terminar, transferí <b>${money(monto)}</b> (${billingCycleLabel(plan)} · ${esc(packLbl)})
      al alias de Mercado Pago:</p>`
    : `<p style="margin:0 0 8px;">Para activar / continuar el servicio, transferí
      <b>${money(monto)}</b> (${billingCycleLabel(plan)} · ${esc(packLbl)}) al alias de Mercado Pago:</p>`;

  await sendEmail({
    to: org.dueno_email,
    tipo: "condiciones",
    organizacionId: org.id as string,
    subject: "Condiciones y pago · Cicalino",
    html: emailLayout({
      titulo: "Condiciones y pago",
      cuerpoHtml: `<p style="margin:0 0 8px;">¡Hola ${esc(String(nombre))}!</p>
        <p style="margin:0 0 12px;">Para <b>${esc(org.nombre)}</b> necesitamos que aceptes
        las bases y condiciones del servicio.</p>
        ${cuerpoPago}
        <p style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:.02em;color:#2536d4;">${esc(alias)}</p>
        <p style="margin:0;font-size:13px;opacity:.75;">En el concepto podés poner el nombre del local.
        Cuando veamos el pago, lo marcamos al día.</p>`,
      cta: { label: "Ir a condiciones y pago", url },
      pie: "Cicalino · Si no pediste esto, ignorá el mail.",
    }),
  });

  return { ok: true, url };
};
