import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/liberar-mesas-jornada.sql"),
  "utf8",
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);
const orden = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
) as string[];
const waitlist = readFileSync(
  join(root, "src/lib/data/waitlist.ts"),
  "utf8",
);
const hook = readFileSync(join(root, "src/lib/hooks/useWaitlist.ts"), "utf8");
const cron = readFileSync(
  join(root, "src/app/api/cron/cobros/route.ts"),
  "utf8",
);
const crearPedido = readFileSync(
  join(root, "supabase/security-fixes-15.sql"),
  "utf8",
);

describe("Al corte de jornada el salón queda libre", () => {
  it("solo libera mesas ocupadas de la jornada anterior", () => {
    expect(sql).toMatch(/estado = 'ocupada'/);
    expect(sql).toMatch(/actualizado_en < v_desde/);
    expect(sql).toMatch(/set estado = 'libre'/);
    expect(sql).toMatch(/espera_id = null/);
    expect(sql).toMatch(/reserva_id = null/);
  });

  it("no escribe reservas ni esperas", () => {
    expect(sql).not.toMatch(/update public\.reservas/i);
    expect(sql).not.toMatch(/update public\.esperas/i);
    expect(sql).not.toMatch(/delete from public\.reservas/i);
    expect(sql).toContain("No se escribe `reservas`");
  });

  it("calcula la jornada igual que crear_pedido", () => {
    expect(sql).toContain("America/Argentina/Buenos_Aires");
    expect(sql).toMatch(/coalesce\(l\.hora_corte, 6\)/);
    expect(crearPedido).toContain("America/Argentina/Buenos_Aires");
    expect(sql).toContain("jornada_inicio_corte");
  });

  it("van las dos funciones: la del panel y la del cron", () => {
    expect(sql).toMatch(
      /create or replace function public\.liberar_mesas_jornada_local\(p_local uuid\)/,
    );
    expect(sql).toMatch(
      /create or replace function public\.liberar_mesas_jornada\(\)/,
    );
  });

  it("la del panel chequea acceso; la del cron no la puede llamar un cliente", () => {
    const local = sql.slice(
      sql.indexOf("liberar_mesas_jornada_local"),
      sql.indexOf("create or replace function public.liberar_mesas_jornada()"),
    );
    expect(local).toContain("puede_ver_local(p_local)");
    expect(sql).toMatch(
      /revoke all on function public\.liberar_mesas_jornada_local\(uuid\)\s*\n?\s*from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.liberar_mesas_jornada_local\(uuid\)\s*\n?\s*to authenticated/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.liberar_mesas_jornada\(\)\s*\n?\s*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.liberar_mesas_jornada\(\)\s*\n?\s*to service_role/i,
    );
  });

  it("jornada_inicio_corte no es llamable desde el cliente", () => {
    expect(sql).toMatch(
      /revoke all on function public\.jornada_inicio_corte\(integer\)\s*\n?\s*from public, anon, authenticated/i,
    );
  });

  it("el barrido tiene índice sobre ocupadas", () => {
    expect(sql).toMatch(
      /create index if not exists idx_mesas_ocupadas_actualizado[\s\S]*where estado = 'ocupada'/,
    );
  });

  it("está registrado y después de lo que necesita", () => {
    expect(chequeo).toContain(
      "('liberar-mesas-jornada.sql', 'modulo-espera.sql, reservas-mesa.sql, security-fixes-04.sql')",
    );
    expect(chequeo).toContain(
      "('liberar-mesas-jornada.sql', 'function', 'liberar_mesas_jornada_local', 63)",
    );
    expect(orden).toContain("liberar-mesas-jornada.sql");
    expect(orden.indexOf("liberar-mesas-jornada.sql")).toBeGreaterThan(
      orden.indexOf("modulo-espera.sql"),
    );
    expect(orden.indexOf("liberar-mesas-jornada.sql")).toBeGreaterThan(
      orden.indexOf("security-fixes-04.sql"),
    );
  });
});

describe("Quién dispara el barrido", () => {
  it("el panel llama la versión local y espera a que corra antes de leer mesas", () => {
    expect(waitlist).toContain('rpc("liberar_mesas_jornada_local"');
    expect(waitlist).not.toMatch(/rpc\("liberar_mesas_jornada"\)/);
    expect(hook).toContain("await resetOccupiedTablesForNewDay(branchId)");
    expect(hook).toContain("fetchTables(branchId)");
    const recargar = hook.slice(hook.indexOf("const recargar"));
    expect(
      recargar.indexOf("resetOccupiedTablesForNewDay"),
    ).toBeLessThan(recargar.indexOf("fetchTables"));
  });

  it("el cron llama la versión global, no la del panel", () => {
    expect(cron).toContain('"liberar_mesas_jornada"');
    expect(cron).not.toContain("liberar_mesas_jornada_local");
    const bloque = cron.slice(cron.indexOf("liberar_mesas_jornada"));
    expect(bloque).toMatch(/if \(errMesas\)/);
    expect(bloque).toContain("console.error");
  });
});
