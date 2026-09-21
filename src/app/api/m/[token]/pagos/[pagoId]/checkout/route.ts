import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import { uuid } from "@/lib/schemas";
import {
  fetchGuestState,
  readGuestCookie,
  startGuestMercadoPagoCheckout,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

/* After the table requested the bill, a guest who chose Mercado Pago opens
 * checkout from here. Defining the share never created a preference. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string; pagoId: string }> },
) => {
  const { token, pagoId } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "mp-checkout",
    perToken: 20,
    perIp: 20,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;
  if (!uuid.safeParse(pagoId).success) return failure("not-found");

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const state = await fetchGuestState(creds);
  if (!state.ok) return failure(state.reason);
  const mine = state.bill.payments.find(
    (p) => p.id === pagoId && p.guestId === creds.guestId && p.method === "mercado_pago",
  );
  if (!mine) return failure("not-found");

  const mp = await startGuestMercadoPagoCheckout(token, pagoId);
  if (!mp.ok) return failure(mp.reason);
  return json({ ok: true, checkoutUrl: mp.checkoutUrl, bill: state.bill });
};
