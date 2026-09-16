"use server";

import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { uuid } from "@/lib/schemas";
import { mercadoPagoConfigured } from "@/lib/server/mercadopago";

type SimpleResult = { ok: true } | { ok: false; error: string };

export const mercadoPagoAvailable = async (): Promise<boolean> => mercadoPagoConfigured();

/* Removes the stored OAuth tokens. The mp_cuentas_baja trigger also turns the
 * method off for guests. Payments already confirmed stay as they are. */
export const disconnectMercadoPago = async (localId: unknown): Promise<SimpleResult> => {
  if (!uuid.safeParse(localId).success) return { ok: false, error: "Sucursal inválida." };
  const perfil = await getCurrentProfile();
  if (!perfil || (perfil.rol !== "admin" && perfil.rol !== "superadmin")) {
    return { ok: false, error: "No autorizado" };
  }
  /* Access check with the user's own session, same function RLS uses. */
  const supabase = await createServerSupabase();
  const { error: accessError } = supabase
    ? await supabase.rpc("mp_estado_local", { p_local: localId })
    : { error: { message: "sin supabase" } };
  if (accessError) return { ok: false, error: "No autorizado" };

  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };
  const { error } = await admin.from("mp_cuentas").delete().eq("local_id", localId as string);
  if (error) return { ok: false, error: "No se pudo desconectar." };
  return { ok: true };
};
