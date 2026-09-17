import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-asignacion-tramos.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);
const board = readFileSync(
  join(root, "src/components/panel/mesas/JornadaBoard.tsx"),
  "utf8",
);

describe("mesa-asignacion-tramos", () => {
  it("va después de la jornada y queda en el chequeo", () => {
    expect(orden.indexOf("mesa-asignacion-jornada.sql")).toBeLessThan(
      orden.indexOf("mesa-asignacion-tramos.sql"),
    );
    expect(chequeo).toContain(
      "('mesa-asignacion-tramos.sql', 'column', 'locales.turnos_piso', 75)",
    );
    expect(chequeo).toContain("mesa_plantilla_guardar_semana");
    expect(chequeo).toContain("('mesa-asignacion-tramos.sql', 'mesa-asignacion-jornada.sql')");
  });

  it("un local puede tener uno o dos turnos y la misma mesa en cada tramo", () => {
    expect(sql).toContain("turnos_piso");
    expect(sql).toContain("tramo in ('manana', 'noche')");
    expect(sql).toContain("mesa_numero, tramo");
    expect(sql).toContain("mesa_plantilla_guardar_semana");
    expect(sql).toContain("mesa_local_set_turnos");
  });

  it("el tablero deja marcar mesas, un color por persona y guardar la semana", () => {
    expect(board).toContain("guardarSemana");
    expect(board).toContain("elegiQuien");
    expect(board).toContain("marcarCon");
    expect(board).toContain("text-base font-bold");
    expect(board).toContain("markTable");
    expect(board).not.toContain("line-clamp-3");
  });
});
