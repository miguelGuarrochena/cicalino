import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { guestPayAllSchema, paymentDatos } from "@/lib/schemas";
import {
  broadcastTableBill,
  fetchGuestState,
  payAllGuestBill,
  readGuestCookie,
  startGuestMercadoPagoCheckout,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "cuenta-pagar-todo",
    perToken: 20,
    perIp: 20,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const parsed = guestPayAllSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return json(
      { ok: false, reason: "datos-invalidos", message: parsed.error.issues[0]?.message },
      400,
    );
  }

  const res = await payAllGuestBill(creds, paymentDatos({ ...parsed.data, mode: "uno" }));
  if (!res.ok) {
    const { ok: _ok, reason, ...extra } = res;
    return failure(reason ?? "db-error", extra);
  }

  let checkout: string | null = null;
  if (res.metodo === "mercado_pago" && res.estado === "pendiente" && res.pago_id) {
    const mp = await startGuestMercadoPagoCheckout(token, String(res.pago_id));
    if (!mp.ok) return failure(mp.reason);
    checkout = mp.checkoutUrl;
  }

  const state = await fetchGuestState(creds);
  if (state.ok) await broadcastTableBill(state.guest.sessionId);
  return json({
    ok: true,
    paymentId: res.pago_id,
    status: res.estado,
    total: res.monto_total,
    checkoutUrl: checkout,
    bill: state.ok ? state.bill : null,
  });
};
