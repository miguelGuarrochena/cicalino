import { failure, guardGuestRequest, json } from "@/lib/server/guestApi";
import { callWaiter, fetchGuestState, readGuestCookie } from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

/* Guest pings the floor for anything that isn't an order: extra cutlery,
 * a question, the bill. Stays on until staff taps “Ya voy”. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "llamar",
    perToken: 8,
    perIp: 12,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const res = await callWaiter(creds);
  if (!res.ok) return failure(res.reason ?? "db-error");

  const state = await fetchGuestState(creds);
  return json({ ok: true, bill: state.ok ? state.bill : null });
};
