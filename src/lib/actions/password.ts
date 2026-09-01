"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/appUrl";
import { email as emailSchema, parseInput } from "@/lib/schemas";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { PASSWORD_MIN, type ResetResult } from "@/lib/auth/password";

/* Recuperación de contraseña.
 *
 * POR QUÉ NO SE USA resetPasswordForEmail
 * Con @supabase/ssr el cliente de servidor arma el link en modo PKCE: guarda
 * un verificador en una cookie y el link solo sirve en el navegador que lo
 * pidió. El dueño que pide el reset desde el celular del mostrador y abre el
 * mail en la compu de la oficina se queda afuera, que es el caso más común.
 *
 * generateLink no manda mail: devuelve el `hashed_token`, que es un OTP de un
 * solo uso y no depende de ninguna cookie. Con eso armamos nuestro propio
 * link y lo mandamos por Resend, que ya es por donde salen todos los mails
 * del producto. Del otro lado, verifyOtp canjea ese token por una sesión.
 *
 * No se cambia el mecanismo de autenticación: sigue siendo Supabase Auth.
 */

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN)
  .max(72, "La contraseña es demasiado larga.");

const tokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9._~+/=-]+$/, "Token inválido.");

const clientIp = async (): Promise<string> => {
  const hdrs = await headers();
  return (
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip")?.trim() ||
    "sin-ip"
  );
};

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* Pide el mail con el link para elegir una contraseña nueva.
 *
 * Devuelve ok tanto si la cuenta existe como si no: si contestara distinto,
 * cualquiera podría usar este formulario para averiguar qué direcciones
 * tienen cuenta en Cicalino. */
export const requestPasswordReset = async (
  emailInput: string,
): Promise<ResetResult> => {
  const v = parseInput(emailSchema, emailInput);
  if (!v.ok) return { ok: false, reason: "invalido" };
  const mail = v.data;

  const ip = await clientIp();
  const porCuenta = await sharedRateLimit(`reset:mail:${mail}`, 3, 15 * 60_000);
  const porIp = await sharedRateLimit(`reset:ip:${ip}`, 10, 15 * 60_000);
  if (!porCuenta.ok || !porIp.ok) return { ok: false, reason: "rate-limited" };

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "no-configurado" };

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: mail,
    options: { redirectTo: `${appBaseUrl()}/recuperar` },
  });

  /* Cuenta inexistente: generateLink devuelve error. Se registra y se
   * contesta ok igual, para no delatar qué mails están dados de alta. */
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) {
    console.info("requestPasswordReset: sin link", {
      motivo: error?.message ?? "sin hashed_token",
    });
    return { ok: true };
  }

  const url = `${appBaseUrl()}/recuperar?token=${encodeURIComponent(hashed)}`;
  await sendEmail({
    to: mail,
    subject: "Cambiar tu contraseña de Cicalino",
    tipo: "recuperacion",
    html: emailLayout({
      titulo: "Cambiar tu contraseña",
      cuerpoHtml: `
        <p style="margin:0 0 12px;">Pediste cambiar la contraseña de <b>${esc(mail)}</b>.</p>
        <p style="margin:0;">Tocá el botón y elegí una nueva. El link sirve una sola vez.</p>
      `,
      cta: { label: "Elegir contraseña nueva", url },
      pie: "Si no fuiste vos, podés ignorar este mail: tu contraseña actual sigue funcionando.",
    }),
  });

  return { ok: true };
};

/* Canjea el token del mail y deja la contraseña nueva.
 *
 * Al final cierra la sesión a propósito. verifyOtp deja al usuario logueado,
 * pero el store del cliente (rol, organización, sucursal) solo lo llena
 * signIn: dejarlo entrar por acá lo mandaría al panel a medio inicializar.
 * Que entre por la puerta de siempre con la contraseña nueva. */
export const resetPassword = async (
  token: string,
  password: string,
): Promise<ResetResult> => {
  const t = parseInput(tokenSchema, token);
  if (!t.ok) return { ok: false, reason: "invalido" };

  const p = passwordSchema.safeParse(password);
  if (!p.success) return { ok: false, reason: "corta" };

  const ip = await clientIp();
  /* Por token y por IP: el token es de un solo uso, pero sin techo alguien
   * podría probar tokens ajenos a repetición desde la misma conexión. */
  const porToken = await sharedRateLimit(
    `reset-otp:${t.data.slice(0, 24)}`,
    5,
    15 * 60_000,
  );
  const porIp = await sharedRateLimit(`reset-otp:ip:${ip}`, 20, 15 * 60_000);
  if (!porToken.ok || !porIp.ok) return { ok: false, reason: "rate-limited" };

  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, reason: "no-configurado" };

  const { error: otpError } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: t.data,
  });
  if (otpError) {
    /* Vencido, ya usado o adulterado. Supabase no siempre los distingue, así
     * que el mensaje de la pantalla cubre los tres con una sola salida:
     * pedir otro link. */
    console.info("resetPassword: token rechazado", otpError.message);
    return { ok: false, reason: "expirado" };
  }

  const { error: updError } = await supabase.auth.updateUser({
    password: p.data,
  });
  if (updError) {
    console.error("resetPassword: updateUser", updError.message);
    await supabase.auth.signOut();
    /* Supabase rechaza la contraseña por su propia política (largo mínimo,
     * o que sea igual a la anterior). */
    return { ok: false, reason: "corta" };
  }

  await supabase.auth.signOut();
  return { ok: true };
};
