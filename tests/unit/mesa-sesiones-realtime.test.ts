import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-sesiones-realtime.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);
const hook = readFileSync(
  join(root, "src/lib/hooks/useTableBills.ts"),
  "utf8",
);
const tables = readFileSync(join(root, "src/lib/data/tables.ts"), "utf8");

describe("Realtime de mesas — el panel se entera solo", () => {
  it("está después de publicar mesa_sesiones", () => {
    expect(orden.indexOf("split-payments.sql")).toBeLessThan(
      orden.indexOf("mesa-sesiones-realtime.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('mesa-sesiones-realtime.sql', 'replica', 'mesa_sesiones', 79)",
    );
    expect(chequeo).toContain(
      "('mesa-sesiones-realtime.sql', 'split-payments.sql')",
    );
    expect(chequeo).toContain("c.relreplident = 'f'");
  });

  it("replica identity FULL para el filtro local_id", () => {
    expect(sql).toMatch(
      /alter table public\.mesa_sesiones replica identity full/i,
    );
  });

  it("Mesas escucha mesa_sesiones y refresca aunque el canal parezca sano", () => {
    expect(tables).toContain('table: "mesa_sesiones"');
    expect(tables).toContain("filter: `local_id=eq.${branchId}`");
    expect(hook).toContain("attachLiveRefresh");
    expect(hook).toContain("ticksSano: 4");
  });
});
