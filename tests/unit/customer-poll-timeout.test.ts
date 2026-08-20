import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createCustomerPollAbort,
  CUSTOMER_POLL_TIMEOUT_MS,
  type CustomerPollAbort,
} from "@/lib/hooks/customerPollWake";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const hang = (signal: AbortSignal): Promise<never> =>
  new Promise((_, reject) => {
    const fail = () => {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      reject(err);
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });

type PollBody =
  | { ok: true; status: string }
  | { ok: false; reason?: string };

/* Mismo contrato que load() en useCustomerOrder / useCustomerWaitlist:
 * timeout → catch → fallos++ → inFlight=false → programar o pendingWake. */
const createPoll = (opts: {
  timeoutMs: number;
  request: (signal: AbortSignal) => Promise<PollBody>;
}) => {
  let snapshot: { status: string } | null = { status: "en_preparacion" };
  let found = true;
  let active = true;
  let inFlight = false;
  let pendingWake = false;
  let fallos = 0;
  let scheduled = 0;
  let loads = 0;
  let pollAbort: CustomerPollAbort | null = null;

  const load = async () => {
    if (!active) return;
    if (inFlight) {
      pendingWake = true;
      return;
    }
    inFlight = true;
    pendingWake = false;
    loads += 1;
    pollAbort = createCustomerPollAbort(opts.timeoutMs);
    try {
      const data = await opts.request(pollAbort.signal);
      if (!active) return;
      if (data.ok) {
        fallos = 0;
        snapshot = { status: data.status };
        found = true;
      } else if (data.reason === "not-found" || data.reason === "expired") {
        fallos = 0;
        snapshot = null;
        found = false;
      } else {
        fallos += 1;
      }
    } catch {
      if (!active) return;
      fallos += 1;
    } finally {
      pollAbort?.abort();
      pollAbort = null;
      inFlight = false;
      if (active) {
        if (pendingWake) {
          pendingWake = false;
          await load();
        } else {
          scheduled += 1;
        }
      }
    }
  };

  return {
    load,
    wake: () => {
      void load();
    },
    unmount: () => {
      active = false;
      pollAbort?.abort();
      pollAbort = null;
    },
    state: () => ({
      snapshot,
      found,
      fallos,
      inFlight,
      pendingWake,
      scheduled,
      loads,
    }),
  };
};

describe("Customer poll timeout", () => {
  it("el tope es 10s: cubre un GET lento y no deja el ciclo trabado", () => {
    expect(CUSTOMER_POLL_TIMEOUT_MS).toBe(10_000);
    expect(CUSTOMER_POLL_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
    expect(CUSTOMER_POLL_TIMEOUT_MS).toBeLessThanOrEqual(12_000);
  });

  it("pedido y espera usan el abort del poll en fetch + cleanup", () => {
    for (const rel of [
      "src/lib/hooks/useCustomerOrder.ts",
      "src/lib/hooks/useCustomerWaitlist.ts",
    ]) {
      const src = read(rel);
      expect(src).toContain("createCustomerPollAbort");
      expect(src).toContain("signal: pollAbort.signal");
      expect(src).toContain("pollAbort?.abort()");
      expect(src).toMatch(/return \(\) => \{[\s\S]*pollAbort\?\.abort\(\)/);
      expect(src).toContain("if (!active) return");
      expect(src).toContain("pendingWake");
    }
  });

  it("timeout no se trata como pedido inexistente / link vencido", () => {
    for (const rel of [
      "src/lib/hooks/useCustomerOrder.ts",
      "src/lib/hooks/useCustomerWaitlist.ts",
    ]) {
      const src = read(rel);
      const catchBlock = src.match(
        /catch \{\s*\/\*[\s\S]*?\*\/\s*if \(!active\) return;\s*fallos\+\+;\s*\}/,
      );
      expect(catchBlock?.[0]).toBeTruthy();
      expect(catchBlock![0]).not.toContain("not-found");
      expect(catchBlock![0]).not.toContain("setRemoteFound(false)");
      expect(catchBlock![0]).not.toContain("setRemote(null)");
    }
  });

  it("abort() corta de inmediato y es idempotente", () => {
    const abort = createCustomerPollAbort(10_000);
    expect(abort.signal.aborted).toBe(false);
    abort.abort();
    expect(abort.signal.aborted).toBe(true);
    abort.abort();
    expect(abort.signal.aborted).toBe(true);
  });

  it("el signal se aborta al vencer el timeout", async () => {
    const abort = createCustomerPollAbort(40);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("timeout signal never aborted")),
        500,
      );
      abort.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
    expect(abort.signal.aborted).toBe(true);
    abort.abort();
  });
});

describe("Customer poll timeout — ciclo", () => {
  it("caso 1: GET 200 actualiza el snapshot y el poll sigue", async () => {
    const poll = createPoll({
      timeoutMs: 200,
      request: async () => ({ ok: true, status: "listo" }),
    });
    await poll.load();
    const s = poll.state();
    expect(s.snapshot).toEqual({ status: "listo" });
    expect(s.found).toBe(true);
    expect(s.fallos).toBe(0);
    expect(s.inFlight).toBe(false);
    expect(s.scheduled).toBe(1);
    expect(s.loads).toBe(1);
  });

  it("caso 2: timeout conserva snapshot, fallos++, inFlight=false y reprograma", async () => {
    const poll = createPoll({
      timeoutMs: 40,
      request: (signal) => hang(signal),
    });
    await poll.load();
    const s = poll.state();
    expect(s.snapshot).toEqual({ status: "en_preparacion" });
    expect(s.found).toBe(true);
    expect(s.fallos).toBe(1);
    expect(s.inFlight).toBe(false);
    expect(s.pendingWake).toBe(false);
    expect(s.scheduled).toBe(1);
  });

  it("caso 3: timeout y luego 200 recupera el snapshot y resetea fallos", async () => {
    let n = 0;
    const poll = createPoll({
      timeoutMs: 40,
      request: (signal) => {
        n += 1;
        if (n === 1) return hang(signal);
        return Promise.resolve({ ok: true, status: "listo" });
      },
    });
    await poll.load();
    expect(poll.state().fallos).toBe(1);
    expect(poll.state().snapshot).toEqual({ status: "en_preparacion" });
    await poll.load();
    const s = poll.state();
    expect(s.snapshot).toEqual({ status: "listo" });
    expect(s.fallos).toBe(0);
    expect(s.inFlight).toBe(false);
    expect(s.loads).toBe(2);
  });

  it("caso 4: unmount aborta el request y no deja inFlight ni retry", async () => {
    const poll = createPoll({
      timeoutMs: 2_000,
      request: (signal) => hang(signal),
    });
    const running = poll.load();
    poll.unmount();
    await running;
    const s = poll.state();
    expect(s.snapshot).toEqual({ status: "en_preparacion" });
    expect(s.fallos).toBe(0);
    expect(s.inFlight).toBe(false);
    expect(s.scheduled).toBe(0);
    expect(s.pendingWake).toBe(false);
  });

  it("caso 5: wake durante request no queda bloqueado tras el timeout", async () => {
    let n = 0;
    const poll = createPoll({
      timeoutMs: 40,
      request: (signal) => {
        n += 1;
        if (n === 1) return hang(signal);
        return Promise.resolve({ ok: true, status: "listo" });
      },
    });
    const first = poll.load();
    poll.wake();
    await first;
    const s = poll.state();
    expect(s.loads).toBe(2);
    expect(s.snapshot).toEqual({ status: "listo" });
    expect(s.fallos).toBe(0);
    expect(s.inFlight).toBe(false);
    expect(s.pendingWake).toBe(false);
  });
});
