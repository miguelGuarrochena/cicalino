"use server";

import { headers } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { enviarEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { verificarTurnstile } from "@/lib/security/turnstile";
import { isEmail } from "@/lib/validations";

type Resultado = { ok: true } | { ok: false; error: string };

const appUrl = (): string => {
  const u = process.env.NEXT_PUBLIC_APP_URL;
  return u && !u.includes("localhost") ? u : "https://cicalino.net";
};

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
export const crearSolicitud = async (input: {
  nombre: string;
  email: string;
  local?: string;
  ciudad?: string;
  turnstileToken?: string;
}): Promise<Resultado> => {
  const nombre = input.nombre?.trim();
  const email = input.email?.trim();
  if (!nombre || !isEmail(email)) {
    return { ok: false, error: "Completá tu nombre y un email válido." };
  }
  // Anti-bot (Cloudflare Turnstile). Si no está configurado, no bloquea.
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const humano = await verificarTurnstile(input.turnstileToken, ip);
  if (!humano) {
    return { ok: false, error: "No pudimos verificar que sos humano. Reintentá." };
  }
  // Límites de longitud (defensa básica contra payloads gigantes).
  if (nombre.length > 120 || email.length > 160) {
    return { ok: false, error: "Datos demasiado largos." };
  }

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Backend no configurado." };

  const local = input.local?.trim() || null;
  const ciudad = input.ciudad?.trim() || null;

  const { error } = await admin
    .from("solicitudes")
    .insert({ nombre, email, local, ciudad });
  if (error) {
    console.error("crearSolicitud", error.message);
    return { ok: false, error: "No pudimos registrar tu solicitud. Reintentá." };
  }

  // Mails (best-effort, opcionales si hay Resend): aviso a Cicalino + una
  // confirmación linda al cliente. La activación real se la mandás a mano vos.
  const notify = process.env.LEAD_NOTIFY_EMAIL ?? "info@cicalino.net";
  void enviarEmail({
    to: notify,
    subject: `Nueva solicitud de prueba — ${nombre}`,
    replyTo: email,
    html: emailLayout({
      titulo: "Nueva solicitud",
      cuerpoHtml: `<p style="margin:0 0 6px;"><b>${esc(nombre)}</b> quiere probar Cicalino.</p>
        <p style="margin:0;font-size:14px;">${esc(email)}${
          local ? ` · ${esc(local)}` : ""
        }${ciudad ? ` · ${esc(ciudad)}` : ""}</p>`,
      cta: { label: "Activar en el panel", url: `${appUrl()}/admin` },
      pie: "Panel de Superadmin → Solicitudes",
    }),
  });
  void enviarEmail({
    to: email,
    subject: "¡Recibimos tu pedido! — Cicalino",
    html: emailLayout({
      titulo: "¡Recibimos tu pedido!",
      cuerpoHtml: `<p style="margin:0 0 8px;">¡Hola ${esc(nombre)}! 🎉</p>
        <p style="margin:0;">Recibimos tu pedido para probar Cicalino. Te
        escribimos a este mail para activarte <b>1 mes gratis</b>, normalmente
        en el día. Tu cliente nunca paga.</p>`,
    }),
  });

  return { ok: true };
};
