"use client";

export interface NotifyResult {
  ok: boolean;
  /* Entregas de Web Push. Cero no implica que el cliente no se enteró:
   * si abrió el QR, el aviso de la página también cuenta. */
  delivered: number;
}

export type AvisoToastKind = "silent" | "error" | "ok" | "missed";

/* ¿El cliente pudo ser avisado, por cualquier canal?
 *
 *  · `delivered` es solo Web Push (`enviados` de /api/push/notify).
 *  · `seenAt` (`visto_en`) es el canal de la página: el cliente abrió el
 *    link del QR, así que el poll puede mostrar el aviso.
 *
 * El mostrador no distingue canales: le llega o no le llega. */
export const avisoToastKind = (
  r: NotifyResult | null,
  seenAt: string | null | undefined,
): AvisoToastKind => {
  if (!r) return "silent";
  if (!r.ok) return "error";
  if (r.delivered > 0 || Boolean(seenAt)) return "ok";
  return "missed";
};

const FAILED: NotifyResult = { ok: false, delivered: 0 };

const post = async (body: string): Promise<NotifyResult | null> => {
  const res = await fetch("/api/push/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (res.status >= 500 || res.status === 429) return null;
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    enviados?: number;
  };
  if (!data?.ok) return FAILED;
  return { ok: true, delivered: data.enviados ?? 0 };
};

export const notifyCustomer = async (
  target: { orderId: string } | { waitlistId: string },
): Promise<NotifyResult> => {
  const body = JSON.stringify(target);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
    try {
      const r = await post(body);
      if (r) return r;
    } catch {
    }
  }
  return FAILED;
};
