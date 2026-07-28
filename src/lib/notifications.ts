// Helpers de notificaciones del cliente (Web Push + aviso local).
// En Android/Chrome el aviso sale en la barra del sistema (a menudo con ícono
// de Chrome). Para que llegue en OTRA app hace falta:
//   1) VAPID en el build (NEXT_PUBLIC_VAPID_PUBLIC_KEY)
//   2) permiso concedido
//   3) suscripción guardada en push_subscriptions (este módulo)

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: "no-vapid" | "unsupported" | "denied" | "server" | "error" };

export const registrarServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    // Sin esto, pushManager.subscribe a veces corre antes de que el SW esté activo.
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
};

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const clavesOk = (sub: PushSubscription): boolean => {
  const j = sub.toJSON();
  return Boolean(j.endpoint && j.keys?.p256dh && j.keys?.auth);
};

/**
 * Suscribe este navegador al Web Push del pedido y lo guarda en el server.
 * Devuelve ok solo si quedó persistido (si no, el panel manda 0 pushes).
 */
export const suscribirWebPush = async (
  token: string,
): Promise<PushSubscribeResult> => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, reason: "no-vapid" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  try {
    const reg = await registrarServiceWorker();
    if (!reg) return { ok: false, reason: "unsupported" };

    let sub = await reg.pushManager.getSubscription();
    if (sub && !clavesOk(sub)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        subscription: {
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          },
        },
      }),
    });
    if (!res.ok) {
      console.error("push/subscribe", res.status, await res.text().catch(() => ""));
      return { ok: false, reason: "server" };
    }
    return { ok: true };
  } catch (err) {
    console.error("suscribirWebPush", err);
    // Suscripción vieja con otra clave VAPID: reintentar limpio.
    try {
      const reg = await navigator.serviceWorker.ready;
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          subscription: {
            endpoint: json.endpoint,
            keys: {
              p256dh: json.keys?.p256dh ?? "",
              auth: json.keys?.auth ?? "",
            },
          },
        }),
      });
      return res.ok ? { ok: true } : { ok: false, reason: "server" };
    } catch (err2) {
      console.error("suscribirWebPush/retry", err2);
      return { ok: false, reason: "error" };
    }
  }
};

export const pedirPermisoNotificaciones = async (): Promise<boolean> => {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const permiso = await Notification.requestPermission();
  return permiso === "granted";
};

export const mostrarAvisoListo = async (opts: {
  referencia: string;
  url: string;
  body: string;
}): Promise<void> => {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const titulo = "Cicalino";
  const options = {
    body: opts.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Mismo tag por referencia: un solo aviso, no una pila de spam.
    tag: `cicalino-${opts.referencia}`,
    renotify: true,
    data: { url: opts.url },
    vibrate: [200, 100, 200],
  } as NotificationOptions & { renotify?: boolean; vibrate?: number[] };

  try {
    const reg =
      (await navigator.serviceWorker?.getRegistration()) ??
      (await registrarServiceWorker());
    if (reg) {
      await reg.showNotification(titulo, options);
      return;
    }
  } catch {
    /* fallback abajo */
  }

  try {
    new Notification(titulo, options);
  } catch {
    /* ignore */
  }
};
