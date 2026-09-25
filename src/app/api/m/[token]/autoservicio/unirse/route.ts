import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { guestNameSchema } from "@/lib/schemas";
import { attachGuestCookie, newGuestSecret } from "@/lib/server/tableGuest";
import {
  fetchPickupState,
  joinCounter,
  joinPickupTable,
  resolvePickupQr,
} from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

/* Mismo alta que la cuenta de la mesa (/unirse): secreto nuevo y cookie
 * httpOnly. En la mesa pide el nombre y la sesión es de autoservicio; en el
 * mostrador no hay nombre (es opcional y va con el pedido) y cada teléfono
 * abre su propia sesión. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "autoservicio-unirse",
    perToken: 40,
    perIp: 20,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const qr = await resolvePickupQr(token);
  if (!qr.ok) return failure(qr.reason);
  if (!qr.operational) return failure("suscripcion-vencida");

  const { secret, hash } = newGuestSecret();
  let res;
  if (qr.flow === "mostrador_qr") {
    res = await joinCounter(token, hash);
  } else {
    const body = (await readJson(req)) as { name?: unknown } | null;
    const parsed = guestNameSchema.safeParse(typeof body?.name === "string" ? body.name : "");
    if (!parsed.success) {
      return json(
        { ok: false, reason: "nombre-invalido", message: parsed.error.issues[0]?.message },
        400,
      );
    }
    res = await joinPickupTable(token, parsed.data, hash);
  }
  if (!res.ok) return failure(res.reason ?? "db-error");

  const guestId = String(res.comensal_id);
  const state = await fetchPickupState(token, { guestId, tokenHash: hash }, qr.flow);
  if (!state.ok) return failure("db-error");
  return attachGuestCookie(
    json({ ok: true, state: state.state, cred: `${guestId}.${secret}` }),
    guestId,
    secret,
  );
};
