import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { guestRestoreSchema } from "@/lib/schemas";
import { guestSessionHere } from "@/lib/guestSession";
import {
  attachGuestCookie,
  fetchGuestState,
  parseGuestCookieValue,
  resolveTableQr,
} from "@/lib/server/tableGuest";
import { fetchPickupState } from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

/* Same phone, same table, session still open: put the cookie back without
 * creating another comensal. Camera browsers often drop the httpOnly cookie
 * when the diner leaves and scans again.
 *
 * The counter QR (Pedidos in Mostrador QR mode) has no table: the credential
 * is good if it belongs to a guest of that branch's counter. A regenerated
 * counter QR still restores it (to follow orders already placed; see
 * mostrador_qr_estado). */

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "restaurar",
    perToken: 40,
    perIp: 20,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const body = await readJson(req);
  const parsed = guestRestoreSchema.safeParse(body);
  if (!parsed.success) return failure("no-guest");

  const creds = parseGuestCookieValue(parsed.data.cred);
  if (!creds) return failure("no-guest");

  const mesa = await resolveTableQr(token);
  if (!mesa.ok) {
    const pickup = await fetchPickupState(token, creds, "mostrador_qr");
    if (!pickup.ok) return failure(pickup.reason === "not-found" ? mesa.reason : pickup.reason);
    if (!pickup.state.guest) return failure("no-guest");
    return attachGuestCookie(
      json({ ok: true, guest: pickup.state.guest }),
      creds.guestId,
      creds.secret,
    );
  }

  const state = await fetchGuestState(creds);
  if (!state.ok) return failure(state.reason);
  if (!guestSessionHere(state.bill.session, mesa.tableId)) {
    return failure(state.bill.session.status === "abierta" ? "otra-mesa" : "mesa-cerrada");
  }

  return attachGuestCookie(
    json({ ok: true, guest: state.guest, bill: state.bill }),
    creds.guestId,
    creds.secret,
  );
};
