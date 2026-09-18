import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { guestNameSchema } from "@/lib/schemas";
import {
  attachGuestCookie,
  fetchGuestState,
  joinTable,
  newGuestSecret,
  resolveTableQr,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "unirse",
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
  if (!mesa.operational) return failure("suscripcion-vencida");

  const { secret, hash } = newGuestSecret();
  const res = await joinTable(token, parsed.data, hash);
  if (!res.ok) return failure(res.reason ?? "db-error");

  const guestId = String(res.comensal_id);
  const state = await fetchGuestState({ guestId, tokenHash: hash });
  if (!state.ok) return failure("db-error");
  return attachGuestCookie(
    json({
      ok: true,
      guest: state.guest,
      bill: state.bill,
      cred: `${guestId}.${secret}`,
    }),
    guestId,
    secret,
  );
};
