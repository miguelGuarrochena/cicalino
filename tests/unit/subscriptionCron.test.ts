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

/* Why aviso_cobro_en can't be shared with anything else.
 *
 * The customer's overdue notice goes out once per billing cycle, and the only
 * thing deciding that is the stamp on aviso_cobro_en. Anything that writes
 * that column for another reason silently cancels the notice — no error, no
 * log, the account just stops hearing from us.
 *
 * That's exactly what the internal reminder in actions/billing.ts was doing
 * until it got its own column (supabase/aviso-interno.sql). These tests are
 * here so nobody points a second writer at it again. */
describe("aviso_cobro_en tiene un solo dueño", () => {
  const morosa: CronOrg = {
    id: "o1",
    plan: "mensual",
    status: "pending_payment",
    trialEnd: null,
    nextBilling: "2026-09-15",
    aviso5dEn: null,
    avisoFinEn: null,
    avisoCobroEn: null,
  };

  it("sin marca previa, avisa aunque hayan pasado varios días", () => {
    expect(planDailyActions(morosa, "2026-09-18").emails).toEqual(["overdue"]);
  });

  it("una marca anterior al vencimiento no bloquea: es de un ciclo viejo", () => {
    expect(
      planDailyActions({ ...morosa, avisoCobroEn: "2026-09-10" }, "2026-09-18")
        .emails,
    ).toEqual(["overdue"]);
  });

  it("una marca posterior al vencimiento bloquea el aviso del ciclo entero", () => {
    // Este es el caso que rompía: si algo ajeno estampa la columna acá, el
    // cliente no se entera nunca de que debe.
    expect(
      planDailyActions({ ...morosa, avisoCobroEn: "2026-09-16" }, "2026-09-18")
        .emails,
    ).toEqual([]);
  });
});
