/* Service Worker de Cicalino
 * - PWA: precache del shell offline + estrategias de caché.
 * - Web Push: muestra el aviso cuando el pedido pasa a "listo".
 */

const CACHE = "cicalino-v7";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/bell-light.png",
  "/bell-dark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no tocar terceros
  if (url.pathname.startsWith("/api/")) return; // datos siempre a la red

  // Navegaciones (páginas): red primero, fallback a caché u offline.
  // Solo se cachean respuestas 200 propias: una 404 o un 500 en caché
  // sería peor que la pantalla de offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Estáticos propios (íconos, imágenes, fuentes locales): caché primero.
  if (/\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
  }
});

const pathFromUrl = (raw) => {
  try {
    return new URL(raw, self.location.origin).pathname;
  } catch {
    return raw || "/";
  }
};

const avisarClientes = async (targetPath) => {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    const clientPath = pathFromUrl(client.url);
    if (!targetPath || clientPath === targetPath) {
      client.postMessage({ type: "cicalino-refresh", url: targetPath || clientPath });
    }
  }
};

/* ---- Web Push ---- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { body: event.data?.text() };
    } catch {
      data = {};
    }
  }
  // Copy calmado + tag estable: Chrome Android marca como spam emojis,
  // urgencia y muchas notificaciones distintas del mismo sitio.
  const titulo = data.titulo || "Cicalino";
  const targetPath = pathFromUrl(data.url || "/");
  const opciones = {
    body: data.body || "Tu pedido está listo para retirar.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    tag: data.tag || "cicalino-pedido",
    renotify: Boolean(data.tag),
    data: { url: targetPath },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(titulo, opciones),
      // Si la pestaña sigue viva en segundo plano, que refresque el estado
      // sin esperar a que el usuario toque la notificación.
      avisarClientes(targetPath),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = pathFromUrl(event.notification.data?.url || "/");
  // Si la pestaña del pedido ya está abierta, enfocarla en vez de abrir otra:
  // la que estaba abierta es la que viene siguiendo el estado.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if (pathFromUrl(client.url) === targetPath && "focus" in client) {
            const focused = await client.focus();
            focused.postMessage({
              type: "cicalino-refresh",
              url: targetPath,
            });
            return focused;
          }
        }
        return self.clients.openWindow(targetPath);
      }),
  );
});
