import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { guestNameSchema } from "@/lib/schemas";
import {
  attachGuestCookie,
  newGuestSecret,
  resolveTableQr,
} from "@/lib/server/tableGuest";
import { fetchPickupState, joinPickupTable } from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

/* Mismo alta que la cuenta de la mesa (/unirse): nombre, secreto nuevo y
 * cookie httpOnly. La sesión que abre es de autoservicio. */
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

  const body = (await readJson(req)) as { name?: unknown } | null;
  const parsed = guestNameSchema.safeParse(typeof body?.name === "string" ? body.name : "");
  if (!parsed.success) {
    return json(
      { ok: false, reason: "nombre-invalido", message: parsed.error.issues[0]?.message },
      400,
    );
  }

  const mesa = await resolveTableQr(token);
  if (!mesa.ok) return failure(mesa.reason);
  if (mesa.flow !== "autoservicio") return failure("not-available");
  if (!mesa.operational) return failure("suscripcion-vencida");

  const { secret, hash } = newGuestSecret();
  const res = await joinPickupTable(token, parsed.data, hash);
  if (!res.ok) return failure(res.reason ?? "db-error");

  const guestId = String(res.comensal_id);
  const state = await fetchPickupState(token, { guestId, tokenHash: hash });
  if (!state.ok) return failure("db-error");
  return attachGuestCookie(
    json({ ok: true, state: state.state, cred: `${guestId}.${secret}` }),
    guestId,
    secret,
  );
};
