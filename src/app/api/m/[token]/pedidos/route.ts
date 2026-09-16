import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { guestOrderSchema } from "@/lib/schemas";
import {
  fetchGuestState,
  placeGuestOrder,
  readGuestCookie,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "pedido",
    perToken: 60,
    perIp: 60,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const parsed = guestOrderSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return json(
      { ok: false, reason: "items-invalidos", message: parsed.error.issues[0]?.message },
      400,
    );
  }

  const res = await placeGuestOrder(creds, parsed.data.items, parsed.data.key);
  if (!res.ok) return failure(res.reason ?? "db-error");

  const state = await fetchGuestState(creds);
  return json({
    ok: true,
    orderId: res.pedido_id,
    repeated: Boolean(res.repetido),
    bill: state.ok ? state.bill : null,
  });
};
