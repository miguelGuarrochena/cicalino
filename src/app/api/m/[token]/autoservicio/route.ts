import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import { readGuestCookie } from "@/lib/server/tableGuest";
import { fetchPickupState } from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

/* Pedidos en modalidad Mesa: lo que muestra la pantalla del QR. Anda con o
 * sin cookie: sin ella, igual se ven los pedidos vivos de la mesa, que es lo
 * que necesita quien volvió a escanear para saber si el suyo está listo. */
export const GET = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "autoservicio",
    perToken: 240,
    perIp: 600,
    windowMs: 60_000,
    mutating: false,
  });
  if (blocked) return blocked;

  const res = await fetchPickupState(token, await readGuestCookie());
  if (!res.ok) return failure(res.reason);
  return json({ ok: true, state: res.state });
};
