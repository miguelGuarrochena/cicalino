import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { pickupOrderSchema } from "@/lib/schemas";
import { readGuestCookie, resolveTableQr } from "@/lib/server/tableGuest";
import {
  fetchPickupState,
  placePickupOrder,
  startPickupCheckout,
} from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

/* Confirmar el pedido: sale con la forma de pago elegida y queda esperando el
 * pago. Con Mercado Pago devuelve el checkout; en caja, la caja ya lo ve. */
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
    return json(
      { ok: false, reason: "items-invalidos", message: parsed.error.issues[0]?.message },
      400,
    );
  }

  const res = await placePickupOrder(
    creds,
    parsed.data.items,
    parsed.data.key,
    parsed.data.method,
  );
  if (!res.ok) return failure(res.reason ?? "db-error");

  let checkoutUrl: string | null = null;
  let checkoutError: string | null = null;
  if (parsed.data.method === "mercado_pago" && res.pago_id) {
    const mesa = await resolveTableQr(token);
    const mp = await startPickupCheckout(token, String(res.pago_id), {
      branchName: mesa.ok ? mesa.branchName : "",
      reference: String(res.referencia ?? ""),
      tableNumber: mesa.ok ? mesa.tableNumber : 0,
    });
    /* El pedido ya existe y espera el pago: si Mercado Pago no respondió, el
     * cliente puede reintentar o pasar a pagar en caja desde su pantalla. */
    if (mp.ok) checkoutUrl = mp.checkoutUrl;
    else checkoutError = mp.reason;
  }

  const state = await fetchPickupState(token, creds);
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
