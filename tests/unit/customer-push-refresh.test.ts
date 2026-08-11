import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pushErrorMessageKey } from "@/lib/notifications";
import { CUSTOMER_SW_REFRESH } from "@/lib/hooks/customerPollWake";

const root = process.cwd();

describe("Customer push + refresh", () => {
  it("SW avisa a clientes abiertos y refresca al tocar la notificación", () => {
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    expect(sw).toContain('type: "cicalino-refresh"');
    expect(sw).toContain("avisarClientes");
    expect(sw).toContain("notificationclick");
    expect(sw).toContain("cicalino-v8");
  });

  it("pedido y espera comparten wake + pendingWake", () => {
    const order = readFileSync(
      join(root, "src/lib/hooks/useCustomerOrder.ts"),
      "utf8",
    );
    const wait = readFileSync(
      join(root, "src/lib/hooks/useCustomerWaitlist.ts"),
      "utf8",
    );
    const wake = readFileSync(
      join(root, "src/lib/hooks/customerPollWake.ts"),
      "utf8",
    );
    for (const src of [order, wait]) {
      expect(src).toContain("attachCustomerWake");
      expect(src).toContain("pendingWake");
    }
    expect(wake).toContain("pageshow");
    expect(wake).toContain("cicalino-refresh");
    expect(CUSTOMER_SW_REFRESH).toBe("cicalino-refresh");
  });

  it("mensajes de error de push por razón", () => {
    expect(pushErrorMessageKey("denied")).toBe("pushDenegado");
    expect(pushErrorMessageKey("unsupported")).toBe("pushUnsupported");
    expect(pushErrorMessageKey("expired")).toBe("pushExpired");
    expect(pushErrorMessageKey("rate-limited")).toBe("pushRateLimited");
    expect(pushErrorMessageKey("server")).toBe("pushError");
  });

  it("iOS no ofrece botón de push; muestra mantener pestaña", () => {
    const waiting = readFileSync(
      join(root, "src/components/customer/CustomerWaiting.tsx"),
      "utf8",
    );
    const espera = readFileSync(
      join(root, "src/components/customer/CustomerEsperaWaiting.tsx"),
      "utf8",
    );
    const notif = readFileSync(join(root, "src/lib/notifications.ts"), "utf8");
    expect(notif).toContain("canOfferWebPush");
    expect(notif).toMatch(/isIosDevice[\s\S]*return false/);
    for (const src of [waiting, espera]) {
      expect(src).toContain("canOfferWebPush");
      expect(src).toContain("mantenerPestana");
      expect(src).toContain("pushDisponible");
      expect(src).toContain("notificationPermissionGranted");
      expect(src).toContain("activados");
      expect(src).toMatch(/pushActivo\s*\?\s*\(/);
    }
  });

  it("subscribe no trata 200+ok:false como éxito", () => {
    const src = readFileSync(join(root, "src/lib/notifications.ts"), "utf8");
    expect(src).toContain("!res.ok || !body?.ok");
    expect(src).toContain("serviceWorker.ready");
  });

  it("rate limit no tumba el servicio sin Upstash", () => {
    const src = readFileSync(
      join(root, "src/lib/security/rateLimitShared.ts"),
      "utf8",
    );
    expect(src).toContain("usando límite en memoria");
    expect(src).toContain("fallback a límite en memoria");
    expect(src).not.toMatch(/return denegar/);
  });
});
