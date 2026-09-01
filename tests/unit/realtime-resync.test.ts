import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  realtimeIsHealthy,
  realtimeNeedsResubscribe,
} from "@/lib/realtime";
import { shouldFireCustomerAlert } from "@/lib/customerAlert";

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
  it("pedido y espera reavisan con avisado_en, no solo con el status", () => {
    const waiting = read("src/components/customer/CustomerWaiting.tsx");
    const espera = read("src/components/customer/CustomerEsperaWaiting.tsx");
    const hook = read("src/lib/hooks/useCustomerReadyAlert.ts");
    const logic = read("src/lib/customerAlert.ts");
    expect(waiting).toContain("useCustomerReadyAlert");
    expect(espera).toContain("useCustomerReadyAlert");
    expect(hook).toContain("shouldFireCustomerAlert");
    expect(logic).toContain("CUSTOMER_REAVISO_MIN_MS");
    expect(logic).toContain("notifiedAt");
  });

  it("mismo status con avisado_en distinto a los pocos segundos no dispara", () => {
    const t0 = "2026-09-01T12:00:00.000Z";
    const t2 = "2026-09-01T12:00:02.000Z";
    const tLater = "2026-09-01T12:03:00.000Z";
    const first = shouldFireCustomerAlert({
      prevKey: null,
      status: "listo",
      notifiedAt: t0,
    });
    expect(first.fire).toBe(true);
    const race = shouldFireCustomerAlert({
      prevKey: first.key,
      status: "listo",
      notifiedAt: t2,
    });
    expect(race.fire).toBe(false);
    const replay = shouldFireCustomerAlert({
      prevKey: race.key,
      status: "listo",
      notifiedAt: tLater,
    });
    expect(replay.fire).toBe(true);
    const same = shouldFireCustomerAlert({
      prevKey: first.key,
      status: "listo",
      notifiedAt: t0,
    });
    expect(same.fire).toBe(false);
  });
});
