import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("FASE 2 — hardening de superficie", () => {
  it("PIN, login, reset, contrato, alias, cancelar y leads usan failClosed", () => {
    for (const rel of [
      "src/lib/actions/pin.ts",
      "src/lib/auth/actions.ts",
      "src/lib/actions/password.ts",
      "src/lib/actions/contract.ts",
      "src/lib/actions/leads.ts",
      "src/app/api/e/[token]/cancelar/route.ts",
      "src/app/api/p/[token]/alias/route.ts",
    ]) {
      expect(read(rel), rel).toContain("failClosed: true");
    }
  });

  it("polls de /api/m, /api/p, /api/e y el webhook MP no usan failClosed", () => {
    for (const rel of [
      "src/lib/server/guestApi.ts",
      "src/app/api/p/[token]/route.ts",
      "src/app/api/e/[token]/route.ts",
      "src/app/api/mp/webhook/route.ts",
    ]) {
      expect(read(rel), rel).not.toContain("failClosed");
    }
  });

  it("POST sensibles chequean sameOrigin", () => {
    for (const rel of [
      "src/lib/server/guestApi.ts",
      "src/app/api/e/[token]/cancelar/route.ts",
      "src/app/api/p/[token]/alias/route.ts",
      "src/app/api/push/subscribe/route.ts",
      "src/app/api/push/notify/route.ts",
    ]) {
      expect(read(rel), rel).toContain("sameOrigin");
    }
    expect(read("src/app/api/mp/webhook/route.ts")).not.toContain("sameOrigin");
  });

  it("el PIN no se lee ni se devuelve en claro", () => {
    const pin = read("src/lib/actions/pin.ts");
    expect(pin).toContain("verificar_pin_empleado");
    expect(pin).toContain("{ id: fila.id, name: fila.nombre }");
    expect(pin).not.toMatch(/pin_hash/);
    expect(pin).not.toMatch(/return .*\.pin\b/);
    expect(read("supabase/security-fixes-17.sql")).toMatch(
      /revoke select, insert, update on public\.empleados\s+from anon, authenticated/i,
    );
  });

  it("Comandas y Mesas no pintan el cambio de pedido antes del UPDATE", () => {
    const pagos = read("src/app/(app)/panel/pagos/page.tsx");
    const move = pagos.slice(pagos.indexOf("const moveRows"));
    expect(move).toContain("updateOrderStatus");
    expect(move.slice(0, move.indexOf("reload();"))).not.toContain("patchTableBills");
    expect(read("src/components/panel/mesas/TableDetail.tsx")).not.toContain(
      'to === "cancelado" ? "pagos-exceden"',
    );
    expect(read("src/lib/data/orders.ts")).toContain('reason: "pagos-exceden"');
    expect(read("src/lib/data/orders.ts")).toContain('reason: "ya-anotado"');
  });
});
