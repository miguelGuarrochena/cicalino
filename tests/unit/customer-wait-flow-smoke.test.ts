import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  canOfferWebPush,
  notificationPermissionGranted,
  pushErrorMessageKey,
} from "@/lib/notifications";
import { CUSTOMER_SW_REFRESH } from "@/lib/hooks/customerPollWake";
import { WAITLIST_POLL_MS } from "@/lib/hooks/useCustomerWaitlist";
import { translate } from "@/lib/i18n";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * Smoke de negocio: lo que el cliente y el mostrador necesitan para que
 * "el pedido/mesa está listo" se note solo, sin refrescar a mano.
 *
 * Cubre contrato estructural (no e2e de browser): si alguien vuelve a meter
 * fail-closed de rate limit, saca el CTA de activados, o corta el notify al
 * marcar listo, este archivo tiene que ponerse rojo.
 */
describe("Customer wait flow — negocio debe seguir vivo", () => {
  const waiting = read("src/components/customer/CustomerWaiting.tsx");
  const espera = read("src/components/customer/CustomerEsperaWaiting.tsx");
  const orderHook = read("src/lib/hooks/useCustomerOrder.ts");
  const waitHook = read("src/lib/hooks/useCustomerWaitlist.ts");
  const wake = read("src/lib/hooks/customerPollWake.ts");
  const notif = read("src/lib/notifications.ts");
  const rate = read("src/lib/security/rateLimitShared.ts");
  const sw = read("public/sw.js");
  const subscribeRoute = read("src/app/api/push/subscribe/route.ts");
  const notifyRoute = read("src/app/api/push/notify/route.ts");
  const pRoute = read("src/app/api/p/[token]/route.ts");
  const eRoute = read("src/app/api/e/[token]/route.ts");
  const ordersHook = read("src/lib/hooks/useOrders.ts");
  const waitlistHook = read("src/lib/hooks/useWaitlist.ts");
  const notifyClient = read("src/lib/notify.ts");

  it("rate limit sin Upstash no tumba poll ni subscribe", () => {
    expect(rate).toContain("usando límite en memoria");
    expect(rate).toContain("fallback a límite en memoria");
    expect(rate).not.toMatch(/return denegar\(/);
    /* Primer request tiene que poder pasar: no hay denegar inmediato. */
    expect(rate).not.toMatch(/exigeRedis && !distributedRateLimit[\s\S]{0,120}return \{/);
  });

  it("poll de pedido y espera se retoma al volver / al push del SW", () => {
    for (const src of [orderHook, waitHook]) {
      expect(src).toContain("attachCustomerWake");
      expect(src).toContain("pendingWake");
      expect(src).toContain("tabVisible");
      expect(src).toMatch(/status === 429|httpStatus === 429/);
    }
    expect(wake).toContain("pageshow");
    expect(wake).toContain("visibilitychange");
    expect(wake).toContain("cicalino-refresh");
    expect(wake).toContain("createCustomerPollAbort");
    expect(wake).toContain("AbortSignal.timeout");
    expect(wake).toContain("attachCustomerVisit");
    for (const src of [orderHook, waitHook]) {
      expect(src).toContain("createCustomerPollAbort");
      expect(src).toContain("signal: pollAbort.signal");
    }
    expect(CUSTOMER_SW_REFRESH).toBe("cicalino-refresh");
    expect(sw).toContain('type: "cicalino-refresh"');
    expect(sw).toContain("avisarClientes");
  });

  it("endpoints públicos del QR usan rate limit holgado + admin", () => {
    for (const src of [pRoute, eRoute]) {
      expect(src).toContain("sharedRateLimit");
      expect(src).toContain("createAdminSupabase");
      expect(src).toContain("rate-limited");
    }
    /* Cupo por token: 40 / 10s — alcanza para poll adaptativo (~3–8s). */
    expect(pRoute).toMatch(/sharedRateLimit\(`p:\$\{token\}`,\s*40,\s*10_000\)/);
    expect(pRoute).toContain("alias_cliente");
    expect(pRoute).toContain("alias:");
    expect(eRoute).toMatch(/sharedRateLimit\(`e:\$\{token\}`,\s*40,\s*10_000\)/);
  });

  it("subscribe guarda por endpoint (pedido o espera) y valida QR vencido", () => {
    expect(subscribeRoute).toContain("push_subscriptions");
    expect(subscribeRoute).toContain("onConflict: \"endpoint\"");
    expect(subscribeRoute).toContain("pedido_id");
    expect(subscribeRoute).toContain("espera_id");
    expect(subscribeRoute).toContain("qr_expira_en");
    expect(subscribeRoute).toContain("expired");
    expect(subscribeRoute).toMatch(/sharedRateLimit\(`sub:\$\{token\}`,\s*12,/);
  });

  it("marcar listo / avisar mesa dispara push al cliente", () => {
    expect(ordersHook).toContain("notifyCustomer");
    expect(ordersHook).toMatch(
      /status !== \"listo\" && status !== \"retirado\"[\s\S]*notifyCustomer\(\{\s*orderId/,
    );
    expect(waitlistHook).toContain("notifyCustomer");
    expect(waitlistHook).toMatch(/waitlistId/);
    expect(notifyClient).toContain("/api/push/notify");
    expect(notifyRoute).toContain("webpush.sendNotification");
    expect(notifyRoute).toContain("pedido_id");
    expect(notifyRoute).toContain("espera_id");
    expect(notifyRoute).toContain("avisado_en");
    expect(notifyRoute).toContain("esRetirado");
    expect(notifyRoute).toContain("retirado");
  });

  it("cliente alerta también al pasar a retirado", () => {
    expect(waiting).toContain("notifRetirado");
    expect(waiting).toContain('order.status === "retirado"');
    expect(waiting).toContain("senalPedido");
    expect(waiting).toContain("useCustomerReadyAlert");
  });

  it("Android: con push activo no queda el botón; dice notificaciones activadas", () => {
    for (const src of [waiting, espera]) {
      expect(src).toContain("pushActivo");
      expect(src).toContain("activados");
      /* CTA solo si NO está activo. */
      expect(src).toMatch(/pushActivo\s*\?\s*\([\s\S]*?activados[\s\S]*?\)\s*:\s*\([\s\S]*?activar/);
      expect(src).not.toMatch(/pushActivo\s*\?\s*`\$\{t\([^)]*activados[^)]*\)\} 🔔`/);
    }
    expect(translate("es", "cliente.activados")).toBe("Notificaciones activadas");
    expect(translate("es", "clienteMesa.activados")).toBe(
      "Notificaciones activadas",
    );
  });

  it("re-bind silencioso si el permiso ya está granted (sin error rojo al abrir)", () => {
    for (const src of [waiting, espera]) {
      expect(src).toContain("notificationPermissionGranted");
      expect(src).toContain("subscribeWebPush(token)");
      const mount = src.match(
        /useEffect\(\(\) => \{\s*if \(!pushDisponible\) return;[\s\S]*?\}, \[token, pushDisponible\]\);/,
      );
      expect(mount?.[0]).toBeTruthy();
      expect(mount![0]).toContain("notificationPermissionGranted");
      expect(mount![0]).toMatch(
        /if \(r\.ok\) \{\s*setPushActivo\(true\);\s*setPushError\(null\);/,
      );
      /* Solo limpia error en éxito; no setea mensaje de fallo en el mount. */
      expect(mount![0]).not.toContain("pushErrorMessageKey");
      expect(mount![0]).not.toMatch(/setPushError\(\s*r\.ok\s*\?/);
    }
    expect(typeof notificationPermissionGranted).toBe("function");
    expect(typeof canOfferWebPush).toBe("function");
  });

  it("iOS no ofrece Web Push; explica dejar la pestaña abierta", () => {
    expect(notif).toMatch(/isIosDevice[\s\S]*return false/);
    expect(notif).toContain("canOfferWebPush");
    for (const src of [waiting, espera]) {
      expect(src).toContain("mantenerPestana");
      expect(src).toContain("canOfferWebPush");
      expect(src).toContain("attachLeaveGuard");
      expect(src).toContain("siCerras");
    }
    expect(waiting).toContain("CustomerAliasForm");
    expect(waiting).toContain("CustomerOtherTab");
    expect(waiting).toContain("useCustomerTabLock");
    expect(espera).toContain("CustomerOtherTab");
    expect(espera).toContain("useCustomerTabLock");
    expect(waiting).not.toContain("otroPedido");
    expect(espera).not.toContain("otraEspera");
    expect(translate("es", "cliente.mantenerPestana").length).toBeGreaterThan(20);
    expect(translate("es", "clienteMesa.mantenerPestana").length).toBeGreaterThan(
      20,
    );
    expect(translate("es", "cliente.siCerras", { n: "42" })).toContain("42");
    expect(translate("es", "clienteMesa.siCerras", { n: "García" })).toContain(
      "García",
    );
  });

  it("cola de espera: el primero es el próximo; el resto ve quién hay antes", () => {
    expect(espera).toContain("colaPrimero");
    expect(espera).toContain("colaDelante");
    expect(espera).not.toContain("colaTotal");
    expect(translate("es", "clienteMesa.colaPrimero")).toMatch(/próximo/i);
    expect(
      translate("es", "clienteMesa.colaDelante", {
        g: "1",
        gLabel: "grupo",
        be: "is",
      }),
    ).toContain("antes");
    expect(
      translate("es", "clienteMesa.colaDelante", {
        g: "2",
        gLabel: "grupos",
        be: "are",
      }),
    ).toContain("2");
  });

  it("al pasar a listo/avisado hay señal local si no hay push activo", () => {
    expect(waiting).toContain("senalPedido");
    expect(waiting).toContain("notifLocal: !pushActivo");
    expect(espera).toContain("senalMesa");
    expect(espera).toContain("notifLocal: !pushActivo");
    expect(notif).toContain("showReadyNotice");
    expect(notif).toContain("showNotification");
  });

  it("mensajes de error de push siguen mapeados", () => {
    expect(pushErrorMessageKey("denied")).toBe("pushDenegado");
    expect(pushErrorMessageKey("unsupported")).toBe("pushUnsupported");
    expect(pushErrorMessageKey("no-vapid")).toBe("pushUnsupported");
    expect(pushErrorMessageKey("expired")).toBe("pushExpired");
    expect(pushErrorMessageKey("not-found")).toBe("pushExpired");
    expect(pushErrorMessageKey("rate-limited")).toBe("pushRateLimited");
    expect(pushErrorMessageKey("server")).toBe("pushError");
    expect(pushErrorMessageKey("error")).toBe("pushError");
  });

  it("poll de espera es adaptativo (no martilla cada 1s)", () => {
    expect(WAITLIST_POLL_MS.esperando).toBeGreaterThanOrEqual(3_000);
    expect(WAITLIST_POLL_MS.avisado).toBeGreaterThanOrEqual(2_000);
    expect(WAITLIST_POLL_MS.avisado).toBeLessThanOrEqual(3_000);
    expect(WAITLIST_POLL_MS.sentado).toBe(0);
    expect(WAITLIST_POLL_MS.cancelado).toBe(0);
    expect(orderHook).toMatch(/en_preparacion:\s*3_000/);
    expect(orderHook).toMatch(/creado:\s*8_000/);
    expect(orderHook).toMatch(/listo:\s*2_000/);
  });

  it("panel cierra el QR cuando visto_en cambia (reescaneo incluido)", () => {
    const panel = read("src/app/(app)/panel/page.tsx");
    const esperaPanel = read("src/app/(app)/panel/espera/page.tsx");
    const ordersData = read("src/lib/data/orders.ts");
    const waitData = read("src/lib/data/waitlist.ts");
    const customerOrder = read("src/lib/data/customer-order.ts");
    const customerEspera = read("src/lib/data/customer-espera.ts");
    const pPage = read("src/app/(customer)/p/[token]/page.tsx");
    const ePage = read("src/app/(customer)/e/[token]/page.tsx");
    /* El mecanismo era el mismo copiado en las dos pantallas y ahora vive en
     * useQrSeenClose; cada panel sigue aportando su lector de visto_en. */
    const qrHook = read("src/lib/hooks/useQrSeenClose.ts");
    expect(ordersData).toContain("fetchOrderSeenAt");
    expect(waitData).toContain("fetchEsperaSeenAt");
    expect(panel).toContain("fetchOrderSeenAt");
    expect(esperaPanel).toContain("fetchEsperaSeenAt");
    expect(panel).toContain("useQrSeenClose");
    expect(esperaPanel).toContain("useQrSeenClose");
    expect(qrHook).toMatch(/setInterval\(check,\s*1_200\)/);
    expect(qrHook).toContain("seenAtNewer");
    /* Las dos formas de abrir siguen distinguiéndose: el alta cierra al primer
     * visto, "Ver QR" primero fija la referencia contra el servidor. */
    expect(qrHook).toContain("primedRef");
    expect(qrHook).toContain("abrirNuevo");
    expect(qrHook).toContain("abrirVerQr");
    expect(panel).toContain("qr.abrirNuevo");
    expect(panel).toContain("qr.abrirVerQr");
    expect(esperaPanel).toContain("qr.abrirNuevo");
    expect(esperaPanel).toContain("qr.abrirVerQr");
    /* Poll periódico no reescribe visto_en; carga SSR o volver de otra app sí. */
    expect(customerOrder).toContain('mode: "first" | "visit"');
    expect(customerEspera).toContain('mode: "first" | "visit"');
    expect(pPage).toContain('markCustomerOrderSeen(res.id, "visit")');
    expect(ePage).toContain('markCustomerEsperaSeen(res.id, "visit")');
    expect(orderHook).toContain("attachCustomerVisit");
    expect(waitHook).toContain("attachCustomerVisit");
    expect(orderHook).toContain("load({ visit: true })");
    expect(waitHook).toContain("load({ visit: true })");
    expect(pRoute).toContain('searchParams.get("visit")');
    expect(eRoute).toContain('searchParams.get("visit")');
    /* Alias del QR abierto sale de la lista viva, no del snapshot. */
    expect(panel).toContain("qrLive.alias");
  });

  it("cliente vibra y suena al pasar a listo", () => {
    const waiting = read("src/components/customer/CustomerWaiting.tsx");
    const espera = read("src/components/customer/CustomerEsperaWaiting.tsx");
    const sound = read("src/lib/sound.ts");
    expect(sound).toContain("alertCustomerReady");
    expect(sound).toContain("vibrate");
    for (const src of [waiting, espera]) {
      expect(src).toContain("alertCustomerReady");
      expect(src).toContain("unlockAudio");
    }
  });

  it("espera marca visto_en al abrir el SSR (como pedidos)", () => {
    const ePage = read("src/app/(customer)/e/[token]/page.tsx");
    const pPage = read("src/app/(customer)/p/[token]/page.tsx");
    expect(pPage).toContain("markCustomerOrderSeen");
    expect(ePage).toContain("markCustomerEsperaSeen");
    expect(ePage).toContain("after(");
  });

  it("orden.json y scripts SQL de supabase están alineados", () => {
    const orden = JSON.parse(read("supabase/orden.json")) as string[];
    const files = readdirSync(join(root, "supabase")).filter(
      (f) => f.endsWith(".sql") && !f.startsWith("chequeo-"),
    );
    for (const f of orden) {
      expect(files, `falta ${f} listado en orden.json`).toContain(f);
    }
    expect(orden).toContain("security-fixes-13.sql");
    expect(orden).toContain("push-indices.sql");
    expect(orden).toContain("security-fixes-05.sql");
    expect(orden).toContain("avisado-en.sql");
  });
});
