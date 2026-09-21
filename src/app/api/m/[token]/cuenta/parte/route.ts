import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { guestShareSchema, paymentDatos } from "@/lib/schemas";
import {
  broadcastTableBill,
  defineGuestShare,
  fetchGuestState,
  readGuestCookie,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "cuenta-parte",
    perToken: 40,
    perIp: 40,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const parsed = guestShareSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return json(
      { ok: false, reason: "datos-invalidos", message: parsed.error.issues[0]?.message },
      400,
    );
  }

  const res = await defineGuestShare(creds, paymentDatos(parsed.data));
  if (!res.ok) {
    const { ok: _ok, reason, ...extra } = res;
    return failure(reason ?? "db-error", extra);
  }

  const state = await fetchGuestState(creds);
  if (state.ok) await broadcastTableBill(state.guest.sessionId);
  return json({
    ok: true,
    paymentId: res.pago_id,
    status: res.estado,
    total: res.monto_total,
    bill: state.ok ? state.bill : null,
  });
};
