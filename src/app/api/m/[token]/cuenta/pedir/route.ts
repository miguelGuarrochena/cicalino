import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import {
  broadcastTableBill,
  fetchGuestState,
  readGuestCookie,
  requestGuestBill,
  startGuestMercadoPagoCheckout,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "cuenta-pedir",
    perToken: 20,
    perIp: 20,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const res = await requestGuestBill(creds);
  if (!res.ok) {
    const { ok: _ok, reason, ...extra } = res;
    return failure(reason ?? "db-error", extra);
  }

  let checkout: string | null = null;
  const paymentId = res.pago_id ? String(res.pago_id) : "";
  if (paymentId) {
    const mp = await startGuestMercadoPagoCheckout(token, paymentId);
    if (!mp.ok) {
      const state = await fetchGuestState(creds);
      if (state.ok) await broadcastTableBill(state.guest.sessionId);
      return failure(mp.reason);
    }
    checkout = mp.checkoutUrl;
  }

  const state = await fetchGuestState(creds);
  if (state.ok) await broadcastTableBill(state.guest.sessionId);
  return json({
    ok: true,
    paymentId: paymentId || null,
    checkoutUrl: checkout,
    bill: state.ok ? state.bill : null,
  });
};
