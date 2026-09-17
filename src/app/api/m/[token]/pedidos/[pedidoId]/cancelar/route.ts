import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import { uuid } from "@/lib/schemas";
import {
  cancelGuestOrder,
  fetchGuestState,
  readGuestCookie,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

/* Guest cancels their own table order only while it is still `creado` —
 * before staff copied it to their kitchen ticket. After that, the waiter
 * has to cancel it from Mesas. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string; pedidoId: string }> },
) => {
  const { token, pedidoId } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "cancelar-pedido",
    perToken: 30,
    perIp: 30,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;
  if (!uuid.safeParse(pedidoId).success) return failure("not-found");

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const res = await cancelGuestOrder(creds, pedidoId);
  if (!res.ok) return failure(res.reason ?? "db-error");

  const state = await fetchGuestState(creds);
  return json({ ok: true, bill: state.ok ? state.bill : null });
};
