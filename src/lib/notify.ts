"use client";

export interface NotifyResult {
  ok: boolean;
  delivered: number;
}

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
  target: { orderId: string } | { esperaId: string },
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
