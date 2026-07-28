// Helpers de notificaciones del cliente (Web Push + aviso local).
// En Android/Chrome el aviso sale en la barra del sistema pero suele
// mostrarse como notificación de Chrome: es lo esperado en la web
// (no es una app nativa). Con VAPID + SW también llega con la pestaña
// en segundo plano.

export const registrarServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
};

// Convierte la clave pública VAPID (base64url) a Uint8Array para el navegador.
const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

// Suscribe el navegador del cliente a Web Push y manda la suscripción al server
// (asociada al pedido por token). Best-effort: si no hay VAPID/SW, no hace nada.
export const suscribirWebPush = async (token: string): Promise<boolean> => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return false;
  const reg = await registrarServiceWorker();
  if (!reg || !("pushManager" in reg)) return false;
  try {
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, subscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
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
    tag: `cicalino-${opts.referencia}-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: { url: opts.url },
    vibrate: [200, 80, 200, 80, 400],
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
