"use server";

import { headers } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/appUrl";
import { sendEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { parseInput, leadSchema } from "@/lib/schemas";

type Resultado = { ok: true } | { ok: false; error: string };

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const createLead = async (input: unknown): Promise<Resultado> => {
  const v = parseInput(leadSchema, input);
  if (!v.ok) return { ok: false, error: v.error };
  const { name: nombre, email, turnstileToken } = v.data;
  const tipo = v.data.tipo ?? "prueba";
  const plan = v.data.plan ?? null;
  const pack = v.data.pack ?? null;

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const humano = await verifyTurnstile(turnstileToken, ip);
  if (!humano) {
    return { ok: false, error: "No pudimos verificar que sos humano. Reintentá." };
  }

  const porIp = await sharedRateLimit(`lead:ip:${ip ?? "sin-ip"}`, 5, 60 * 60_000);
  if (!porIp.ok) {
    return { ok: false, error: "Ya recibimos tu pedido. Te escribimos en breve." };
  }

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Backend no configurado." };

  const local = v.data.local ?? null;
  const ciudad = v.data.ciudad ?? null;
  const direccion = v.data.direccion || null;
  const telefonoVal = v.data.telefono || null;
  const cuilVal = v.data.cuil && v.data.cuil.length === 11 ? v.data.cuil : null;
  const mail = email.trim().toLowerCase();

  const porMail = await sharedRateLimit(`lead:mail:${mail}`, 3, 24 * 60 * 60_000);
  if (!porMail.ok) {
    return {
      ok: false,
      error: "Ya enviaste una solicitud con este mail. Escribinos a info@cicalino.net.",
    };
  }

  const { data: orgExistente } = await admin
    .from("organizaciones")
    .select("id")
    .ilike("dueno_email", mail)
    .limit(1)
    .maybeSingle();
  if (orgExistente) {
    return {
      ok: false,
      error:
        "Este mail ya tiene una cuenta Cicalino. Si querés otra sucursal, pedila desde el panel (Configuración).",
      };
  }

  const { data: solPrevias } = await admin
    .from("solicitudes")
    .select("id, estado")
    .ilike("email", mail)
    .eq("estado", "nueva")
    .limit(1);
  if (solPrevias?.length) {
    return {
      ok: false,
      error: "Ya recibimos tu pedido con este mail. Te escribimos en breve.",
    };
  }

  const { error } = await admin.from("solicitudes").insert({
    nombre,
    email: mail,
    local,
    ciudad: tipo === "contrato" ? null : ciudad,
    direccion: tipo === "contrato" ? direccion : null,
    telefono: tipo === "contrato" ? telefonoVal : null,
    cuil: tipo === "contrato" ? cuilVal : null,
    tipo,
    plan: tipo === "contrato" ? plan : null,
    pack: tipo === "contrato" ? pack : null,
  });
  if (error) {
    console.error("crearSolicitud", error.message);
    if (/column|schema cache|does not exist/i.test(error.message)) {
      return {
        ok: false,
        error:
          "El alta aún no está lista en el servidor. Escribinos a info@cicalino.net.",
      };
    }
    return { ok: false, error: "No pudimos registrar tu solicitud. Reintentá." };
  }

  const notify = process.env.LEAD_NOTIFY_EMAIL ?? "info@cicalino.net";
  const esContrato = tipo === "contrato";
  const planTxt = plan === "anual" ? "Anual" : "Mensual";
  const packTxt =
    pack === "pack"
      ? "Pack (Pedidos + Espera)"
      : pack === "espera"
        ? "Solo espera"
        : pack === "pedidos"
          ? "Solo pedidos"
          : "";
  const detalleContrato = [
    mail,
    telefonoVal,
    local,
    direccion,
    cuilVal ? `CUIL ${cuilVal}` : null,
    packTxt || null,
  ]
    .filter(Boolean)
    .map((x) => esc(String(x)))
    .join(" · ");

  const avisos = await Promise.all([
    sendEmail({
      to: notify,
      subject: esContrato
        ? `Quiere contratar ${planTxt}${packTxt ? ` · ${packTxt}` : ""}: ${nombre}`
        : `Nueva solicitud de prueba: ${nombre}`,
      replyTo: mail,
      html: emailLayout({
        titulo: esContrato ? "Contratar plan" : "Nueva solicitud",
        cuerpoHtml: esContrato
          ? `<p style="margin:0 0 6px;"><b>${esc(nombre)}</b> quiere contratar el plan <b>${planTxt}</b>${packTxt ? ` · <b>${esc(packTxt)}</b>` : ""}.</p>
            <p style="margin:0;font-size:14px;">${detalleContrato}</p>`
          : `<p style="margin:0 0 6px;"><b>${esc(nombre)}</b> quiere probar Cicalino.</p>
            <p style="margin:0;font-size:14px;">${esc(mail)}${
              local ? ` · ${esc(local)}` : ""
            }${ciudad ? ` · ${esc(ciudad)}` : ""}</p>`,
        cta: { label: "Ver en Superadmin", url: `${appBaseUrl()}/admin` },
        pie: "Panel de Superadmin → Solicitudes",
      }),
    }),
    sendEmail({
      to: mail,
      subject: esContrato
        ? "Recibimos tu pedido de contratación · Cicalino"
        : "¡Recibimos tu pedido! · Cicalino",
      html: emailLayout({
        titulo: esContrato ? "Datos recibidos" : "¡Recibimos tu pedido!",
        cuerpoHtml: esContrato
          ? `<p style="margin:0 0 8px;">¡Hola ${esc(nombre)}!</p>
            <p style="margin:0;">Recibimos tu pedido para el plan <b>${planTxt}</b>${packTxt ? ` (${esc(packTxt)})` : ""}.
            A la brevedad te activamos la cuenta y te mandamos el link de
            condiciones y pago.</p>`
          : `<p style="margin:0 0 8px;">¡Hola ${esc(nombre)}! 🎉</p>
            <p style="margin:0;">Recibimos tu pedido para probar Cicalino. Te
            escribimos a este mail para activarte <b>1 mes gratis</b>, normalmente
            en el día.</p>`,
      }),
    }),
  ]);
  if (!avisos[0] || !avisos[1]) {
    console.warn(
      "crearSolicitud: mail no enviado (¿falta RESEND_API_KEY / dominio verificado?)",
      { notifyOk: avisos[0], leadOk: avisos[1] },
    );
  }

  return { ok: true };
};
