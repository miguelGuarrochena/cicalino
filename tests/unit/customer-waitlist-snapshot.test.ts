import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  interpretWaitlistPollResponse,
  type CustomerWaitlist,
} from "@/lib/hooks/useCustomerWaitlist";
import {
  createCustomerPollAbort,
  type CustomerPollAbort,
} from "@/lib/hooks/customerPollWake";

const root = process.cwd();
const hookSrc = readFileSync(
  join(root, "src/lib/hooks/useCustomerWaitlist.ts"),
  "utf8",
);

const SAMPLE: CustomerWaitlist = {
  name: "Ana",
  partySize: 2,
  status: "esperando",
  tableNumber: null,
  branchName: "Local",
  notifiedAt: null,
  cola: {
    gruposDelante: 1,
    personasDelante: 3,
    gruposEnCola: 4,
    personasEnCola: 9,
  },
};

const okBody = {
  ok: true,
  name: "Ana",
  partySize: 2,
  status: "avisado",
  tableNumber: 4,
  branchName: "Local",
  notifiedAt: "2026-08-20T12:00:00.000Z",
  cola: {
    gruposDelante: 0,
    personasDelante: 0,
    gruposEnCola: 1,
    personasEnCola: 2,
  },
};

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

type HttpResult = { status: number; body: unknown } | { throw: true };

/* Mismo contrato que load() del hook: gone vacía; transitorio no. */
const createWaitlistPoll = (opts: {
  timeoutMs?: number;
  request: (signal: AbortSignal) => Promise<HttpResult>;
}) => {
  let snapshot: CustomerWaitlist | null = { ...SAMPLE };
  let found = true;
  let fallos = 0;
  let scheduled = 0;
  let inFlight = false;
  let pollAbort: CustomerPollAbort | null = null;
  const active = true;

  const load = async () => {
    if (!active) return;
    inFlight = true;
    pollAbort = createCustomerPollAbort(opts.timeoutMs ?? 200);
    try {
      const result = await opts.request(pollAbort.signal);
      if (!active) return;
      if ("throw" in result) throw new SyntaxError("invalid json");
      const decision = interpretWaitlistPollResponse(result.status, result.body);
      if (decision.kind === "ok") {
        fallos = 0;
        snapshot = decision.espera;
        found = true;
        scheduled += 1;
      } else if (decision.kind === "gone") {
        fallos = 0;
        snapshot = null;
        found = false;
      } else {
        fallos += 1;
        scheduled += 1;
      }
    } catch {
      if (!active) return;
      fallos += 1;
      scheduled += 1;
    } finally {
      pollAbort?.abort();
      pollAbort = null;
      inFlight = false;
    }
  };

  return {
    load,
    state: () => ({ snapshot, found, fallos, scheduled, inFlight }),
  };
};

describe("Waitlist poll — no borrar snapshot transitorio", () => {
  it("el hook solo vacía en gone; transitorio no llama setRemote(null)", () => {
    expect(hookSrc).toContain("interpretWaitlistPollResponse");
    const gone = hookSrc.match(
      /decision\.kind === "gone"[\s\S]*?detenido = true;/,
    );
    expect(gone?.[0]).toContain("setRemote(null)");
    expect(hookSrc).not.toMatch(
      /kind === "transient"[\s\S]{0,80}setRemote\(null\)/,
    );
    const transitorio = hookSrc.match(
      /else \{\s*\/\* 429[\s\S]*?fallos\+\+;\s*\}/,
    );
    expect(transitorio?.[0]).toBeTruthy();
    expect(transitorio![0]).not.toContain("setRemote(null)");
    expect(transitorio![0]).not.toContain("setRemoteFound(false)");
  });

  it("caso 1: 200 actualiza el snapshot", () => {
    const d = interpretWaitlistPollResponse(200, okBody);
    expect(d.kind).toBe("ok");
    if (d.kind !== "ok") return;
    expect(d.espera.status).toBe("avisado");
    expect(d.espera.name).toBe("Ana");
    expect(d.espera.tableNumber).toBe(4);
  });

  it("caso 2: 429 con snapshot existente no lo borra; fallos++ y retry", async () => {
    const poll = createWaitlistPoll({
      request: async () => ({
        status: 429,
        body: { ok: false, reason: "rate-limited" },
      }),
    });
    await poll.load();
    const s = poll.state();
    expect(s.snapshot?.status).toBe("esperando");
    expect(s.snapshot?.name).toBe("Ana");
    expect(s.found).toBe(true);
    expect(s.fallos).toBe(1);
    expect(s.scheduled).toBe(1);
    expect(s.inFlight).toBe(false);
  });

  it("caso 3: 500 con snapshot existente no lo borra", async () => {
    const poll = createWaitlistPoll({
      request: async () => ({ status: 500, body: { ok: false } }),
    });
    await poll.load();
    const s = poll.state();
    expect(s.snapshot?.status).toBe("esperando");
    expect(s.found).toBe(true);
    expect(s.fallos).toBe(1);
    expect(s.scheduled).toBe(1);
  });

  it("caso 4: JSON inesperado conserva el snapshot y reintenta", async () => {
    const poll = createWaitlistPoll({
      request: async () => ({ throw: true }),
    });
    await poll.load();
    const s = poll.state();
    expect(s.snapshot?.status).toBe("esperando");
    expect(s.found).toBe(true);
    expect(s.fallos).toBe(1);
    expect(s.scheduled).toBe(1);

    expect(interpretWaitlistPollResponse(200, { unexpected: true }).kind).toBe(
      "transient",
    );
    expect(interpretWaitlistPollResponse(200, null).kind).toBe("transient");
    expect(
      interpretWaitlistPollResponse(200, { ok: true, status: "nope" }).kind,
    ).toBe("transient");
    expect(
      interpretWaitlistPollResponse(200, {
        ok: false,
        reason: "not-configured",
      }).kind,
    ).toBe("transient");
  });

  it("caso 5: timeout conserva el snapshot y reintenta", async () => {
    const poll = createWaitlistPoll({
      timeoutMs: 40,
      request: (signal) => hang(signal),
    });
    await poll.load();
    const s = poll.state();
    expect(s.snapshot?.status).toBe("esperando");
    expect(s.found).toBe(true);
    expect(s.fallos).toBe(1);
    expect(s.scheduled).toBe(1);
    expect(s.inFlight).toBe(false);
  });

  it("caso 6: not-found / expired sí vacían (link vencido)", async () => {
    const goneFound = createWaitlistPoll({
      request: async () => ({
        status: 200,
        body: { ok: false, reason: "not-found" },
      }),
    });
    await goneFound.load();
    expect(goneFound.state().snapshot).toBeNull();
    expect(goneFound.state().found).toBe(false);
    expect(goneFound.state().fallos).toBe(0);

    const goneExp = createWaitlistPoll({
      request: async () => ({
        status: 200,
        body: { ok: false, reason: "expired" },
      }),
    });
    await goneExp.load();
    expect(goneExp.state().snapshot).toBeNull();
    expect(goneExp.state().found).toBe(false);
  });

  it("caso 7: 429 y luego 200 actualiza y resetea fallos", async () => {
    let n = 0;
    const poll = createWaitlistPoll({
      request: async () => {
        n += 1;
        if (n === 1) {
          return { status: 429, body: { ok: false, reason: "rate-limited" } };
        }
        return { status: 200, body: okBody };
      },
    });
    await poll.load();
    expect(poll.state().snapshot?.status).toBe("esperando");
    expect(poll.state().fallos).toBe(1);
    await poll.load();
    const s = poll.state();
    expect(s.snapshot?.status).toBe("avisado");
    expect(s.snapshot?.tableNumber).toBe(4);
    expect(s.fallos).toBe(0);
    expect(s.found).toBe(true);
  });

  it("sentado y cancelado son estados válidos, no link vencido", () => {
    expect(
      interpretWaitlistPollResponse(200, { ...okBody, status: "sentado" }).kind,
    ).toBe("ok");
    expect(
      interpretWaitlistPollResponse(200, { ...okBody, status: "cancelado" })
        .kind,
    ).toBe("ok");
  });
});
