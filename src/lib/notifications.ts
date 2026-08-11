
export type PushSubscribeResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no-vapid"
        | "unsupported"
        | "denied"
        | "server"
        | "expired"
        | "not-found"
        | "rate-limited"
        | "error";
    };

const isIosSafari = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chromeIos = /CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && !chromeIos;
};

const pushManagerSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    /* En Android a veces subscribe corre mientras el SW sigue installing. */
    if (!reg.active) {
      const worker = reg.installing ?? reg.waiting;
      if (worker) {
        await new Promise<void>((resolve) => {
          if (worker.state === "activated") {
            resolve();
            return;
          }
          const onChange = () => {
            if (worker.state === "activated" || worker.state === "redundant") {
              worker.removeEventListener("statechange", onChange);
              resolve();
            }
          };
          worker.addEventListener("statechange", onChange);
        });
      }
    }
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

const reasonFromServer = (
  status: number,
  body: { ok?: boolean; reason?: string } | null,
): Extract<PushSubscribeResult, { ok: false }>["reason"] => {
  const r = body?.reason;
  if (r === "expired" || status === 410) return "expired";
  if (r === "not-found" || status === 404) return "not-found";
  if (r === "rate-limited" || status === 429) return "rate-limited";
  return "server";
};

const postSubscription = async (
  token: string,
  sub: PushSubscription,
): Promise<PushSubscribeResult> => {
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
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    reason?: string;
  } | null;
  if (!res.ok || !body?.ok) {
    console.error("push/subscribe", res.status, body);
    return { ok: false, reason: reasonFromServer(res.status, body) };
  }
  return { ok: true };
};

export const subscribeWebPush = async (
  token: string,
): Promise<PushSubscribeResult> => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, reason: "no-vapid" };
  if (!pushManagerSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  try {
    const reg = await registerServiceWorker();
    if (!reg?.pushManager) return { ok: false, reason: "unsupported" };

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

    return await postSubscription(token, sub);
  } catch (err) {
    console.error("subscribeWebPush", err);
    try {
      const reg = await navigator.serviceWorker.ready;
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      return await postSubscription(token, sub);
    } catch (err2) {
      console.error("subscribeWebPush/retry", err2);
      /* iOS Safari en pestaña (sin PWA) suele fallar acá. */
      if (isIosSafari() || !pushManagerSupported()) {
        return { ok: false, reason: "unsupported" };
      }
      return { ok: false, reason: "error" };
    }
  }
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const permiso = await Notification.requestPermission();
  return permiso === "granted";
};

export const pushErrorMessageKey = (
  reason: Extract<PushSubscribeResult, { ok: false }>["reason"],
): "pushDenegado" | "pushUnsupported" | "pushExpired" | "pushRateLimited" | "pushError" => {
  if (reason === "denied") return "pushDenegado";
  if (reason === "unsupported" || reason === "no-vapid") return "pushUnsupported";
  if (reason === "expired" || reason === "not-found") return "pushExpired";
  if (reason === "rate-limited") return "pushRateLimited";
  return "pushError";
};

export const showReadyNotice = async (opts: {
  reference: string;
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
    tag: `cicalino-${opts.reference}`,
    renotify: true,
    data: { url: opts.url },
    vibrate: [200, 100, 200],
  } as NotificationOptions & { renotify?: boolean; vibrate?: number[] };

  try {
    const reg =
      (await navigator.serviceWorker?.getRegistration()) ??
      (await registerServiceWorker());
    if (reg) {
      await reg.showNotification(titulo, options);
      return;
    }
  } catch {
  }

  try {
    new Notification(titulo, options);
  } catch {
  }
};
