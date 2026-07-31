import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";

const API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.RESEND_FROM ?? "Cicalino <info@cicalino.net>";

export const resendConfigured = Boolean(API_KEY);

const logEmail = async (row: {
  organizacionId?: string | null;
  destinatario: string;
  tipo: string;
  asunto: string;
  aceptado: boolean;
  error?: string | null;
  proveedorId?: string | null;
}): Promise<void> => {
  const admin = createAdminSupabase();
  if (!admin) return;
  const { error } = await admin.from("emails_enviados").insert({
    organizacion_id: row.organizacionId ?? null,
    destinatario: row.destinatario,
    tipo: row.tipo,
    asunto: row.asunto,
    aceptado: row.aceptado,
    error: row.error ?? null,
    proveedor_id: row.proveedorId ?? null,
  });
  if (error) console.error("logEmail", error.message);
};

export const sendEmail = async (opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  tipo?: string;
  organizacionId?: string | null;
}): Promise<boolean> => {
  const registrar = (aceptado: boolean, error?: string, id?: string) =>
    logEmail({
      organizacionId: opts.organizacionId,
      destinatario: opts.to,
      tipo: opts.tipo ?? "otro",
      asunto: opts.subject,
      aceptado,
      error,
      proveedorId: id,
    });

  if (!API_KEY) {
    await registrar(false, "Falta RESEND_API_KEY");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detalle = await res.text();
      console.error("resend", res.status, detalle);
      await registrar(false, `${res.status} ${detalle}`.slice(0, 300));
      return false;
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    await registrar(true, undefined, data.id);
    return true;
  } catch (err) {
    console.error("resend", err);
    await registrar(false, String(err).slice(0, 300));
    return false;
  }
};
