import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import { uuid } from "@/lib/schemas";
import {
  cancelGuestPayment,
  fetchGuestState,
  readGuestCookie,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

/* A guest withdraws their own pending payment (changed their mind about the
 * method, or the transfer didn't go through). Paid ones can't be undone here. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string; pagoId: string }> },
) => {
  const { token, pagoId } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "cancelar",
    perToken: 30,
    perIp: 30,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;
  if (!uuid.safeParse(pagoId).success) return failure("not-found");

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const res = await cancelGuestPayment(creds, pagoId);
  if (!res.ok) return failure(res.reason ?? "db-error");

  const state = await fetchGuestState(creds);
  return json({ ok: true, bill: state.ok ? state.bill : null });
};
