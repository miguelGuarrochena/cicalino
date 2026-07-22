/* Service Worker de Cicalino - Web Push (placeholder) */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const titulo = data.titulo || "Tu pedido esta listo";
  const opciones = {
    body: data.body || "Podes pasar a retirarlo.",
    icon: "/favicon.svg",
    vibrate: [200, 100, 200],
    tag: data.pedidoId || "cicalino-aviso",
  };
  event.waitUntil(self.registration.showNotification(titulo, opciones));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
