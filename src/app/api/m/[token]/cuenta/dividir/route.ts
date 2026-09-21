import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import {
  broadcastTableBill,
  fetchGuestState,
  readGuestCookie,
  startGuestSplit,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "cuenta-dividir",
    perToken: 40,
    perIp: 40,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const res = await startGuestSplit(creds);
  if (!res.ok) return failure(res.reason ?? "db-error");

  const state = await fetchGuestState(creds);
  if (state.ok) await broadcastTableBill(state.guest.sessionId);
  return json({ ok: true, bill: state.ok ? state.bill : null });
};
