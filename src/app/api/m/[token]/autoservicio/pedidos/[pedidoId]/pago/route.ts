import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { pickupPaySchema, uuid } from "@/lib/schemas";
import { readGuestCookie } from "@/lib/server/tableGuest";
import {
  changePickupPayment,
  fetchPickupState,
  resolvePickupAccess,
  startPickupCheckout,
} from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

/* Pagar un pedido que todavía no está pago: abrir (o reabrir) Mercado Pago, o
 * pasar a pagar en caja. Solo el teléfono que lo pidió. En el mostrador anda
 * aunque el QR se haya regenerado: el pedido ya existe. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string; pedidoId: string }> },
) => {
  const { token, pedidoId } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "autoservicio-pago",
    perToken: 30,
    perIp: 30,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;
  if (!uuid.safeParse(pedidoId).success) return failure("not-found");

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const parsed = pickupPaySchema.safeParse(await readJson(req));
  if (!parsed.success) return failure("datos-invalidos");

  const qr = await resolvePickupAccess(token, creds);
  if (!qr.ok) return failure(qr.reason);

  const res = await changePickupPayment(creds, pedidoId, parsed.data.method);
  if (!res.ok) return failure(res.reason ?? "db-error");

  let checkoutUrl: string | null = null;
  if (parsed.data.method === "mercado_pago" && res.pago_id) {
    const before = await fetchPickupState(token, creds, qr.flow);
    const order = before.ok ? before.state.orders.find((o) => o.id === pedidoId) : undefined;
    const mp = await startPickupCheckout(token, String(res.pago_id), {
      branchName: qr.branchName,
      reference: order?.reference ?? "",
      tableNumber: qr.tableNumber,
    });
    if (!mp.ok) return failure(mp.reason);
    checkoutUrl = mp.checkoutUrl;
  }

  const state = await fetchPickupState(token, creds, qr.flow);
  return json({ ok: true, checkoutUrl, state: state.ok ? state.state : null });
};
