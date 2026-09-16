import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createServerSupabase } from "@/lib/supabase/server";
import { uuid } from "@/lib/schemas";
import { mercadoPagoConfigured, startOAuth } from "@/lib/server/mercadopago";

export const dynamic = "force-dynamic";

const back = (req: Request, estado: string) =>
  NextResponse.redirect(new URL(`/panel/config?mp=${estado}#pagos`, req.url));

/* Owner connects the branch's Mercado Pago account. Only the owner (or
 * superadmin): this decides where the money goes. Access to the branch and
 * the contracted module are checked with the user's own session, through the
 * same functions RLS uses. */
export const GET = async (req: Request) => {
  const localId = new URL(req.url).searchParams.get("local");
  if (!uuid.safeParse(localId).success) return back(req, "error");
  if (!mercadoPagoConfigured()) return back(req, "no-configurado");

  const perfil = await getCurrentProfile();
  if (!perfil || (perfil.rol !== "admin" && perfil.rol !== "superadmin")) {
    return back(req, "no-autorizado");
  }

  const supabase = await createServerSupabase();
  const { data: tieneModulo, error } = supabase
    ? await supabase.rpc("local_tiene_modulo", { p_local: localId, p_modulo: "pagos" })
    : { data: false, error: null };
  const { error: errAcceso } = supabase
    ? await supabase.rpc("mp_estado_local", { p_local: localId })
    : { error: { message: "sin supabase" } };
  if (error || errAcceso || !tieneModulo) return back(req, "no-autorizado");

  const url = await startOAuth(localId!, perfil.id);
  if (!url) return back(req, "error");
  return NextResponse.redirect(url);
};
