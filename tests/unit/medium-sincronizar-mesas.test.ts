import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fix = readFileSync(join(root, "supabase/security-fixes-09.sql"), "utf8");
const historico = readFileSync(
  join(root, "supabase/reservas-atomicas.sql"),
  "utf8",
);
const corte = readFileSync(join(root, "supabase/corte-por-impago.sql"), "utf8");

describe("Medium — sincronizar_mesas exige local_operativo", () => {
  it("security-fixes-09 chequea local_operativo antes de mutar", () => {
    expect(fix).toMatch(/if not public\.local_operativo\(p_local\)/i);
    expect(fix).toContain("suscripcion-vencida");
    expect(fix).toMatch(
      /create\s+or\s+replace\s+function\s+public\.sincronizar_mesas/i,
    );
  });

  it("sigue el mismo reason que sentar_walkin en corte-por-impago", () => {
    expect(corte).toContain("suscripcion-vencida");
    expect(fix).toContain(
      "json_build_object('ok', false, 'reason', 'suscripcion-vencida')",
    );
  });

  it("no reescribe el histórico reservas-atomicas (fix aditivo)", () => {
    expect(historico).toContain("sincronizar_mesas");
    expect(historico).not.toMatch(
      /sincronizar_mesas[\s\S]*local_operativo/,
    );
  });

  it("chequeo-migraciones registra security-fixes-09", () => {
    const chequeo = readFileSync(
      join(root, "supabase/chequeo-migraciones.sql"),
      "utf8",
    );
    expect(chequeo).toContain(
      "('security-fixes-09.sql', 'reservas-atomicas.sql, corte-por-impago.sql')",
    );
  });
});
