import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { guestPaymentSchema, paymentDatos } from "@/lib/schemas";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/appUrl";
import { createPreference } from "@/lib/server/mercadopago";
import {
  attachPreference,
  cancelMercadoPagoPayment,
  callWaiter,
  createGuestPayment,
  fetchGuestState,
  readGuestCookie,
  resolveTableQr,
} from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

const checkoutUrl = (preferenceId: string) =>
  `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${encodeURIComponent(preferenceId)}`;

/* Creates a payment for the guest in the cookie. The amount is computed in
 * SQL; `expectedTotal` is what the guest saw, and a mismatch comes back as
 * `monto-cambio` with the new amounts.
 *
 * Mercado Pago: the payment row is created first (it reserves its share of
 * the bill), then the checkout preference. If MP refuses, the row is
 * cancelled so the reservation doesn't linger. Coming back from the checkout
 * confirms nothing — only /api/mp/webhook does. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "pago",
    perToken: 40,
    perIp: 40,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const parsed = guestPaymentSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return json(
      { ok: false, reason: "datos-invalidos", message: parsed.error.issues[0]?.message },
      400,
    );
  }

  const res = await createGuestPayment(creds, paymentDatos(parsed.data));
  if (!res.ok) {
    const { ok: _ok, reason, ...extra } = res;
    return failure(reason ?? "db-error", extra);
  }

  const paymentId = String(res.pago_id);
  let checkout: string | null = null;

  if (res.metodo === "mercado_pago" && res.estado === "pendiente") {
    const admin = createAdminSupabase();
    const { data: row } = admin
      ? await admin
          .from("pagos_mesa")
          .select("local_id, mp_preferencia_id, monto_total, expira_en")
          .eq("id", paymentId)
          .maybeSingle()
      : { data: null };
    if (!row) return failure("db-error");

    if (row.mp_preferencia_id) {
      checkout = checkoutUrl(row.mp_preferencia_id as string);
    } else {
      const mesa = await resolveTableQr(token);
      const pref = await createPreference({
        localId: row.local_id as string,
        pagoId: paymentId,
        title: mesa.ok
          ? `${mesa.branchName} · Mesa ${mesa.tableNumber}`
          : "Cuenta de la mesa",
        amount: row.monto_total as number,
        expiresAt: row.expira_en as string,
        returnUrl: `${appBaseUrl()}/m/${token}?pago=${paymentId}`,
      });
      if (!pref) {
        await cancelMercadoPagoPayment(paymentId, "mp-preferencia-fallida");
        return failure("mp-error");
      }
      await attachPreference(paymentId, pref.id);
      checkout = pref.initPoint;
    }
  }

  if (res.metodo && res.metodo !== "mercado_pago") {
    /* Cash, transfer and cards at the table need someone to come by. */
    await callWaiter(creds);
  }

  const state = await fetchGuestState(creds);
  return json({
    ok: true,
    paymentId,
    status: res.estado,
    total: res.monto_total,
    checkoutUrl: checkout,
    bill: state.ok ? state.bill : null,
  });
};
