"use server";

import { headers } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/appUrl";
import { enviarEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { verificarTurnstile } from "@/lib/security/turnstile";
import { rateLimitCompartido } from "@/lib/security/rateLimitShared";
import { parsear, solicitudSchema } from "@/lib/schemas";

type Resultado = { ok: true } | { ok: false; error: string };

// Escapa el input del usuario antes de meterlo en el HTML del email.
const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Alta de una solicitud de prueba desde el formulario público "Probá gratis".
// Es pública (sin login): inserta con service_role. Manda mails si hay Resend.
export const crearSolicitud = async (input: unknown): Promise<Resultado> => {
  // Validación de esquema: rechaza por defecto, acota longitudes y normaliza.
  const v = parsear(solicitudSchema, input);
  if (!v.ok) return { ok: false, error: v.error };
  const { nombre, email, turnstileToken } = v.data;

  // Anti-bot (Cloudflare Turnstile).
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const humano = await verificarTurnstile(turnstileToken, ip);
  if (!humano) {
    return { ok: false, error: "No pudimos verificar que sos humano. Reintentá." };
  }

  // Un mismo visitante no debería poder inundar la tabla de leads.
  const porIp = await rateLimitCompartido(`lead:ip:${ip ?? "sin-ip"}`, 5, 60 * 60_000);
  if (!porIp.ok) {
    return { ok: false, error: "Ya recibimos tu pedido. Te escribimos en breve." };
  }

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Backend no configurado." };

  const local = v.data.local ?? null;
  const ciudad = v.data.ciudad ?? null;
  const mail = email.trim().toLowerCase();

  // Una sola prueba autoservicio por email. Más locales / otra cortesía = a mano.
  const porMail = await rateLimitCompartido(`lead:mail:${mail}`, 3, 24 * 60 * 60_000);
  if (!porMail.ok) {
    return {
      ok: false,
      error: "Ya pediste una prueba con este mail. Escribinos a info@cicalino.net.",
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
        "Este mail ya tiene una cuenta Cicalino. Si querés otra sucursal o un mes de cortesía, escribinos a info@cicalino.net.",
    };
  }

  const { data: solPrevias } = await admin
    .from("solicitudes")
    .select("id, estado")
    .ilike("email", mail)
    .in("estado", ["nueva", "atendida"])
    .limit(5);
  if (solPrevias?.some((s) => s.estado === "nueva")) {
    return {
      ok: false,
      error: "Ya recibimos tu pedido con este mail. Te escribimos en breve.",
    };
  }
  if (solPrevias?.some((s) => s.estado === "atendida")) {
    return {
      ok: false,
      error:
        "Este mail ya usó la prueba gratis. Para otro local escribinos a info@cicalino.net y lo vemos.",
    };
  }

  const { error } = await admin
    .from("solicitudes")
    .insert({ nombre, email: mail, local, ciudad });
  if (error) {
    console.error("crearSolicitud", error.message);
    return { ok: false, error: "No pudimos registrar tu solicitud. Reintentá." };
  }

  // Mails (best-effort): aviso a Cicalino + confirmación al lead.
  // Si falta RESEND_API_KEY, la solicitud igual queda en Superadmin → Solicitudes.
  const notify = process.env.LEAD_NOTIFY_EMAIL ?? "info@cicalino.net";
  const avisos = await Promise.all([
    enviarEmail({
      to: notify,
      subject: `Nueva solicitud de prueba — ${nombre}`,
      replyTo: email,
      html: emailLayout({
        titulo: "Nueva solicitud",
        cuerpoHtml: `<p style="margin:0 0 6px;"><b>${esc(nombre)}</b> quiere probar Cicalino.</p>
        <p style="margin:0;font-size:14px;">${esc(mail)}${
          local ? ` · ${esc(local)}` : ""
        }${ciudad ? ` · ${esc(ciudad)}` : ""}</p>`,
        cta: { label: "Activar en el panel", url: `${appBaseUrl()}/admin` },
        pie: "Panel de Superadmin → Solicitudes",
      }),
    }),
    enviarEmail({
      to: mail,
      subject: "¡Recibimos tu pedido! — Cicalino",
      html: emailLayout({
        titulo: "¡Recibimos tu pedido!",
        cuerpoHtml: `<p style="margin:0 0 8px;">¡Hola ${esc(nombre)}! 🎉</p>
        <p style="margin:0;">Recibimos tu pedido para probar Cicalino. Te
        escribimos a este mail para activarte <b>1 mes gratis</b>, normalmente
        en el día. Tu cliente nunca paga.</p>`,
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
