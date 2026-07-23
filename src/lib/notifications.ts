// Helpers de notificaciones del prototipo (cliente).
// Sin VAPID/servidor todavía: registramos SW y mostramos notificación local
// cuando el pedido pasa a listo (funciona con la pestaña en segundo plano).

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
