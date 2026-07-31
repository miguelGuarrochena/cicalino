import { describe, it, expect } from "vitest";
import { planDailyActions, type CronOrg } from "@/lib/subscriptionCron";

const base: CronOrg = {
  id: "o",
  plan: "mensual",
  status: "trial",
  trialEnd: "2026-09-13",
  nextBilling: "2026-09-14",
  aviso5dEn: null,
  avisoFinEn: null,
  avisoCobroEn: null,
};

const nada = { emails: [], newStatus: null };

describe("prueba gratuita", () => {
  it("lejos del vencimiento no hace nada", () => {
    expect(planDailyActions(base, "2026-09-01")).toEqual(nada);
  });

  it("avisa 5 dias antes", () => {
    expect(planDailyActions(base, "2026-09-08")).toEqual({
      emails: ["trial_5d"],
      newStatus: null,
    });
  });

  it("no repite el aviso de 5 dias si ya salio", () => {
    expect(
      planDailyActions({ ...base, aviso5dEn: "2026-09-08" }, "2026-09-09"),
    ).toEqual(nada);
  });

  it("al vencer avisa y pasa a pendiente de pago", () => {
    expect(planDailyActions(base, "2026-09-14")).toEqual({
      emails: ["trial_end"],
      newStatus: "pending_payment",
    });
  });

  it("no repite el aviso de fin de prueba", () => {
    expect(
      planDailyActions({ ...base, avisoFinEn: "2026-09-14" }, "2026-09-15"),
    ).toEqual({ emails: [], newStatus: "pending_payment" });
  });
});

describe("cuentas que el cron no debe tocar", () => {
  it("plan gratis", () => {
    expect(planDailyActions({ ...base, plan: "gratis" }, "2026-12-01")).toEqual(
      nada,
    );
  });

  it("cuenta pausada", () => {
    expect(
      planDailyActions({ ...base, status: "paused" }, "2026-12-01"),
    ).toEqual(nada);
  });

  it("cuenta ya vencida no se vuelve a procesar", () => {
    expect(
      planDailyActions({ ...base, status: "expired" }, "2026-10-01"),
    ).toEqual(nada);
  });
});

describe("atrasos de pago", () => {
  const activa: CronOrg = {
    ...base,
    status: "active",
    trialEnd: null,
    nextBilling: "2026-09-15",
  };

  it("el dia del vencimiento todavia no es atraso", () => {
    expect(planDailyActions(activa, "2026-09-15")).toEqual(nada);
  });

  it("con atraso avisa y marca pendiente", () => {
    expect(planDailyActions(activa, "2026-09-17")).toEqual({
      emails: ["overdue"],
      newStatus: "pending_payment",
    });
  });

  it("no repite el aviso de cobro del mismo ciclo", () => {
    expect(
      planDailyActions(
        { ...activa, status: "pending_payment", avisoCobroEn: "2026-09-17" },
        "2026-09-18",
      ),
    ).toEqual(nada);
  });

  it("pasada la gracia pasa a vencido", () => {
    expect(planDailyActions(activa, "2026-09-21")).toEqual({
      emails: [],
      newStatus: "expired",
    });
  });
});
