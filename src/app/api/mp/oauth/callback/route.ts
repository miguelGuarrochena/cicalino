import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { finishOAuth } from "@/lib/server/mercadopago";

export const dynamic = "force-dynamic";

const back = (req: Request, estado: string) =>
  NextResponse.redirect(new URL(`/panel/config?mp=${estado}#pagos`, req.url));

/* Mercado Pago sends the owner back here with ?code&state. The state must
 * exist, be fresh, and belong to the user now logged in. */
export const GET = async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || code.length > 512 || state.length > 128) {
    return back(req, "error");
  }

  const perfil = await getCurrentProfile();
  if (!perfil) return back(req, "no-autorizado");

  const res = await finishOAuth({ code, state, usuarioId: perfil.id });
  return back(req, res.ok ? "conectado" : res.reason === "user" ? "no-autorizado" : "error");
};
