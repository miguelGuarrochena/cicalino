import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import {
  fetchGuestPaymentOptions,
  fetchGuestState,
  readGuestCookie,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

/* The guest screen polls this. It returns the whole table bill for the guest
 * in the cookie, as long as that guest sits at this table. */
export const GET = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "cuenta",
    perToken: 120,
    perIp: 600,
    windowMs: 60_000,
    mutating: false,
  });
  if (blocked) return blocked;

  const state = await fetchGuestState(await readGuestCookie());
  if (!state.ok) return failure(state.reason);

  /* The QR was regenerated while they were sitting: tell the client where the
   * table lives now instead of kicking them out. */
  if (state.tableToken && state.tableToken !== token) {
    const sesionAbierta = state.bill.session.status === "abierta";
    return failure("otra-mesa", sesionAbierta ? { tableToken: state.tableToken } : {});
  }

  /* `?config=1`: also the branch payment options. The screen asks for them
   * after a "monto-cambio": if the branch changed a surcharge while the table
   * was paying, the preview has to use the new one or it never matches. */
  if (new URL(req.url).searchParams.get("config") === "1") {
    const payment = await fetchGuestPaymentOptions(state.bill.session.branchId);
    return json({ ok: true, guest: state.guest, bill: state.bill, ...payment });
  }

  return json({ ok: true, guest: state.guest, bill: state.bill });
};
