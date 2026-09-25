import { failure, guardGuestRequest, json, readJson } from "@/lib/server/guestApi";
import { pushSubscribeSchema } from "@/lib/schemas";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { readGuestCookie } from "@/lib/server/tableGuest";
import { fetchPickupState } from "@/lib/server/tablePickup";

export const dynamic = "force-dynamic";

const subscriptionSchema = pushSubscribeSchema.shape.subscription;

/* Web Push para Pedidos en modalidad Mesa.
 *
 * El aviso es del comensal y no de un pedido: el que pidió dos veces en la
 * mesa se entera de los dos. Mismo upsert por endpoint que /api/push/subscribe
 * (un navegador, una suscripción), apuntado al comensal. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "autoservicio-avisos",
    perToken: 12,
    perIp: 40,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;

  const creds = await readGuestCookie();
  if (!creds) return failure("no-guest");

  const body = (await readJson(req)) as { subscription?: unknown } | null;
  const parsed = subscriptionSchema.safeParse(body?.subscription);
  if (!parsed.success) return failure("datos-invalidos");

  const state = await fetchPickupState(token, creds);
  if (!state.ok) return failure(state.reason);
  if (!state.state.guest) return failure("no-guest");

  const admin = createAdminSupabase();
  if (!admin) return failure("not-configured");
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      pedido_id: null,
      espera_id: null,
      comensal_id: state.state.guest.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("m.autoservicio.avisos", error.message);
    return failure("db-error");
  }
  return json({ ok: true });
};
