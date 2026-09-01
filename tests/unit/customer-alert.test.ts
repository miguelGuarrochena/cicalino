import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_REAVISO_MIN_MS,
  customerAlertKey,
  isNotifyStampRace,
  shouldFireCustomerAlert,
  shouldReplayFromPush,
} from "@/lib/customerAlert";

const t0 = "2026-09-01T12:00:00.000Z";
const tRace = "2026-09-01T12:00:02.000Z";
const tReaviso = "2026-09-01T12:03:00.000Z";

describe("shouldFireCustomerAlert", () => {
  it("el primer snapshot dispara (el caller aplica vioEsperando)", () => {
    const r = shouldFireCustomerAlert({
      prevKey: null,
      status: "avisado",
      notifiedAt: t0,
    });
    expect(r.fire).toBe(true);
    expect(r.key).toBe(customerAlertKey("avisado", t0));
  });

  it("mismo status y mismo avisado_en no vuelve a disparar", () => {
    const first = shouldFireCustomerAlert({
      prevKey: null,
      status: "listo",
      notifiedAt: t0,
    });
    const again = shouldFireCustomerAlert({
      prevKey: first.key,
      status: "listo",
      notifiedAt: t0,
    });
    expect(again.fire).toBe(false);
  });

  it("el stamp del notify (mismo aviso, pocos segundos) no vuelve a disparar", () => {
    const first = shouldFireCustomerAlert({
      prevKey: null,
      status: "avisado",
      notifiedAt: t0,
    });
    const race = shouldFireCustomerAlert({
      prevKey: first.key,
      status: "avisado",
      notifiedAt: tRace,
    });
    expect(isNotifyStampRace(first.key, "avisado", tRace)).toBe(true);
    expect(race.fire).toBe(false);
    expect(race.key).toBe(customerAlertKey("avisado", tRace));
  });

  it("volver a avisar (avisado_en minutos después) sí dispara", () => {
    const first = shouldFireCustomerAlert({
      prevKey: null,
      status: "avisado",
      notifiedAt: t0,
    });
    const armed = shouldFireCustomerAlert({
      prevKey: first.key,
      status: "avisado",
      notifiedAt: tRace,
    });
    const replay = shouldFireCustomerAlert({
      prevKey: armed.key,
      status: "avisado",
      notifiedAt: tReaviso,
    });
    expect(replay.fire).toBe(true);
  });

  it("cambio de estado (listo → retirado, avisado → sentado) dispara", () => {
    const listo = shouldFireCustomerAlert({
      prevKey: null,
      status: "listo",
      notifiedAt: t0,
    });
    const retirado = shouldFireCustomerAlert({
      prevKey: listo.key,
      status: "retirado",
      notifiedAt: t0,
    });
    expect(retirado.fire).toBe(true);
  });
});

describe("shouldReplayFromPush", () => {
  it("ignora el push del primer aviso (recién disparó)", () => {
    expect(
      shouldReplayFromPush({
        alreadyAlerted: true,
        lastFiredAt: Date.now() - 1_000,
        now: Date.now(),
      }),
    ).toBe(false);
  });

  it("reavisa si el último fire fue hace rato", () => {
    expect(
      shouldReplayFromPush({
        alreadyAlerted: true,
        lastFiredAt: Date.now() - CUSTOMER_REAVISO_MIN_MS - 1,
        now: Date.now(),
      }),
    ).toBe(true);
  });

  it("no reavisa si la pestaña todavía no armó el primer aviso", () => {
    expect(
      shouldReplayFromPush({
        alreadyAlerted: false,
        lastFiredAt: null,
      }),
    ).toBe(false);
  });
});

describe("pestaña del cliente usa la clave con avisado_en", () => {
  it("pedido y espera delegan en useCustomerReadyAlert", () => {
    const root = process.cwd();
    const waiting = readFileSync(
      join(root, "src/components/customer/CustomerWaiting.tsx"),
      "utf8",
    );
    const espera = readFileSync(
      join(root, "src/components/customer/CustomerEsperaWaiting.tsx"),
      "utf8",
    );
    const hook = readFileSync(
      join(root, "src/lib/hooks/useCustomerReadyAlert.ts"),
      "utf8",
    );
    expect(waiting).toContain("useCustomerReadyAlert");
    expect(espera).toContain("useCustomerReadyAlert");
    expect(hook).toContain("shouldFireCustomerAlert");
    expect(hook).toContain("shouldReplayFromPush");
    expect(hook).toContain("CUSTOMER_SW_REFRESH");
  });
});
