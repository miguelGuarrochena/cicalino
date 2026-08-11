import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fix = readFileSync(join(root, "supabase/security-fixes-14.sql"), "utf8");
const historico = readFileSync(
  join(root, "supabase/reservas-expirar.sql"),
  "utf8",
);

describe("High — expirar_reservas_vencidas + RLS server-only", () => {
  it("security-fixes-14 otorga service_role y revoca clientes", () => {
    expect(fix).toMatch(
      /revoke execute on function public\.expirar_reservas_vencidas\(\)/i,
    );
    expect(fix).toMatch(
      /grant execute on function public\.expirar_reservas_vencidas\(\)\s+to service_role/i,
    );
  });

  it("no reescribe el histórico reservas-expirar (fix aditivo)", () => {
    expect(historico).toContain("expirar_reservas_vencidas");
    expect(historico).toMatch(/revoke execute[\s\S]*expirar_reservas_vencidas/i);
    expect(historico).not.toMatch(
      /grant execute on function public\.expirar_reservas_vencidas\(\)\s+to service_role/i,
    );
  });

  it("documenta tablas server-only sin policies", () => {
    expect(fix).toContain("solicitudes");
    expect(fix).toContain("push_subscriptions");
    expect(fix).toContain("cron_locks");
    expect(fix).toContain("reserva_mesas");
    expect(fix).toContain("server_only_sin_policies");
    expect(fix).not.toContain("'emails_enviados'");
  });

  it("dropea policies viejas de mi org", () => {
    expect(fix).toMatch(/drop policy if exists "esperas de mi org"/i);
    expect(fix).toMatch(/drop policy if exists "mesas de mi org"/i);
    expect(fix).toMatch(/drop policy if exists "reservas de mi org"/i);
    expect(fix).toMatch(/drop policy if exists "pedidos de mi org"/i);
    expect(fix).toMatch(/drop policy if exists "empleados de mi org"/i);
  });

  it("chequeo-migraciones y orden.json registran #14", () => {
    const chequeo = readFileSync(
      join(root, "supabase/chequeo-migraciones.sql"),
      "utf8",
    );
    const orden = JSON.parse(
      readFileSync(join(root, "supabase/orden.json"), "utf8"),
    ) as string[];
    expect(chequeo).toContain(
      "('security-fixes-14.sql', 'reservas-expirar.sql')",
    );
    expect(orden).toContain("security-fixes-14.sql");
    expect(orden.indexOf("security-fixes-14.sql")).toBeGreaterThan(
      orden.indexOf("reservas-expirar.sql"),
    );
  });
});
