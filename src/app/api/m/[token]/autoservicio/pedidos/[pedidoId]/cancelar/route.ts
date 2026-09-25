import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import { uuid } from "@/lib/schemas";
import { readGuestCookie } from "@/lib/server/tableGuest";
import { cancelPickupOrder, fetchPickupState } from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

/* Cancelar antes de pagar. Una vez pago el pedido está en la cocina y la
 * base ya no deja cancelarlo desde el teléfono. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string; pedidoId: string }> },
) => {
  const { token, pedidoId } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "autoservicio-cancelar",
    perToken: 30,
    perIp: 30,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;
  if (!uuid.safeParse(pedidoId).success) return failure("not-found");

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const res = await cancelPickupOrder(creds, pedidoId);
  if (!res.ok) return failure(res.reason ?? "db-error");

  const state = await fetchPickupState(token, creds);
  return json({ ok: true, state: state.ok ? state.state : null });
};
