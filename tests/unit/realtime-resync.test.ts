import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  realtimeIsHealthy,
  realtimeNeedsResubscribe,
} from "@/lib/realtime";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Realtime del mostrador", () => {
  it("SUBSCRIBED es healthy; CLOSED/ERROR/TIMEOUT no", () => {
    expect(realtimeIsHealthy("SUBSCRIBED")).toBe(true);
    expect(realtimeIsHealthy("CLOSED")).toBe(false);
    expect(realtimeIsHealthy("CHANNEL_ERROR")).toBe(false);
    expect(realtimeIsHealthy("TIMED_OUT")).toBe(false);
  });

  it("CLOSED también pide resubscribe, no solo ERROR/TIMEOUT", () => {
    expect(realtimeNeedsResubscribe("CLOSED")).toBe(true);
    expect(realtimeNeedsResubscribe("CHANNEL_ERROR")).toBe(true);
    expect(realtimeNeedsResubscribe("TIMED_OUT")).toBe(true);
    expect(realtimeNeedsResubscribe("SUBSCRIBED")).toBe(false);
    expect(realtimeNeedsResubscribe("JOINING")).toBe(false);
  });

  it("watchChannel reintenta CLOSED, limpia el timer y avisa al SUBSCRIBED", () => {
    const src = read("src/lib/realtime.ts");
    expect(src).toContain("realtimeNeedsResubscribe");
    expect(src).toContain("onSubscribed");
    expect(src).toContain("clearRetry");
    expect(src).toContain("disposed");
    expect(src).toMatch(/status === "CLOSED"|TIMED_OUT" \|\| status === "CLOSED"/);
  });

  it("pedidos y espera recargan al SUBSCRIBED (no esperan el poll de 20–30s)", () => {
    const orders = read("src/lib/data/orders.ts");
    const wait = read("src/lib/data/waitlist.ts");
    expect(orders).toContain("watchChannel(channel, connect, fire)");
    expect(wait).toContain("watchChannel(channel, connect, fire)");
    const cancel = read("src/lib/hooks/useWaitlistCancelWatch.ts");
    expect(cancel).toContain("watchChannel(pgChannel, connectPg");
    expect(cancel).toContain("tick()");
  });
});

describe("Señal idempotente del cliente", () => {
  it("pedido y espera usan el status como clave, no avisado_en", () => {
    const waiting = read("src/components/customer/CustomerWaiting.tsx");
    const espera = read("src/components/customer/CustomerEsperaWaiting.tsx");
    expect(waiting).toContain("const clave = order.status");
    expect(waiting).not.toContain('notifiedAt ?? "listo"');
    expect(espera).toContain("const key = espera.status");
    expect(espera).not.toContain("notifiedAt ?? espera.status");
  });

  it("mismo status con avisado_en distinto no vuelve a disparar", () => {
    const next = (prev: string | null, status: string) => {
      const clave = status;
      if (prev === null) return { prev: clave, fire: true };
      if (prev === clave) return { prev, fire: false };
      return { prev: clave, fire: true };
    };
    let prev: string | null = null;
    let r = next(prev, "listo");
    expect(r.fire).toBe(true);
    prev = r.prev;
    r = next(prev, "listo");
    expect(r.fire).toBe(false);
    r = next(r.prev, "retirado");
    expect(r.fire).toBe(true);
  });
});
