import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { pickupOrderSchema } from "@/lib/schemas";
import { readGuestCookie } from "@/lib/server/tableGuest";
import {
  fetchPickupState,
  placeCounterOrder,
  placePickupOrder,
  resolvePickupAccess,
  resolvePickupQr,
  startPickupCheckout,
} from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

/* Confirmar el pedido con la forma de pago elegida. Con Mercado Pago devuelve
 * el checkout; en caja, no hay nada más que hacer acá.
 *
 * En la mesa el pedido queda esperando el pago. En el mostrador entra al
 * tablero en el acto y el pago va aparte. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "autoservicio-pedido",
    perToken: 60,
    perIp: 60,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const parsed = pickupOrderSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    const nombre = parsed.error.issues.some((i) => i.path[0] === "name");
    return json(
      {
        ok: false,
        reason: nombre ? "nombre-invalido" : "items-invalidos",
        message: parsed.error.issues[0]?.message,
      },
      400,
    );
  }

  /* Un pedido nuevo sale solo de un QR vigente. Si es el cartel regenerado
   * de un mostrador donde este teléfono ya pidió, se lo dice claro. */
  const qr = await resolvePickupQr(token);
  if (!qr.ok) {
    const stale = qr.reason === "not-found" && (await resolvePickupAccess(token, creds)).ok;
    return failure(stale ? "qr-vencido" : qr.reason);
  }

  const { items, key, method, name } = parsed.data;
  const res =
    qr.flow === "mostrador_qr"
      ? await placeCounterOrder(token, creds, items, key, method, name ?? null)
      : await placePickupOrder(creds, items, key, method);
  if (!res.ok) return failure(res.reason ?? "db-error");

  let checkoutUrl: string | null = null;
  let checkoutError: string | null = null;
  if (method === "mercado_pago" && res.pago_id) {
    const mp = await startPickupCheckout(token, String(res.pago_id), {
      branchName: qr.branchName,
      reference: String(res.referencia ?? ""),
      tableNumber: qr.tableNumber,
    });
    /* El pedido ya existe: si Mercado Pago no respondió, el cliente puede
     * reintentar o pasar a pagar en caja desde su pantalla. */
    if (mp.ok) checkoutUrl = mp.checkoutUrl;
    else checkoutError = mp.reason;
  }

  const state = await fetchPickupState(token, creds, qr.flow);
  return json({
    ok: true,
    orderId: res.pedido_id,
    reference: res.referencia,
    repeated: Boolean(res.repetido),
    checkoutUrl,
    checkoutError,
    state: state.ok ? state.state : null,
  });
};
