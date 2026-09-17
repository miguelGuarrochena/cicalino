import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compactRanges,
  formatTableRange,
  rangesOverlap,
  staffOnShift,
  unassignedTables,
} from "@/lib/floorShift";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-asignacion-jornada.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("mesa-asignacion-jornada", () => {
  it("va después del menú y queda en el chequeo", () => {
    expect(orden.indexOf("menu-categorias.sql")).toBeLessThan(
      orden.indexOf("mesa-asignacion-jornada.sql"),
    );
    expect(chequeo).toContain("('mesa-asignacion-jornada.sql', 'table', 'mesa_plantilla_turno'");
    expect(chequeo).toContain("('mesa-asignacion-jornada.sql', 'table', 'mesa_asignacion'");
    expect(chequeo).toContain("mesa_jornada_leer");
    expect(sql).toContain("vigente_hasta");
    expect(sql).toContain("requiere-encargado");
    expect(sql).not.toContain("create table public.empleados");
  });
});

describe("rangos de mesas", () => {
  it("detecta solape y compacta para leer de un vistazo", () => {
    expect(rangesOverlap([{ from: 1, to: 6 }, { from: 7, to: 12 }])).toBe(false);
    expect(rangesOverlap([{ from: 1, to: 6 }, { from: 6, to: 8 }])).toBe(true);
    expect(formatTableRange([1, 2, 3, 7, 8, 12])).toBe("1–3, 7–8, 12");
    expect(compactRanges([5, 4, 4, 6])).toEqual([{ from: 4, to: 6 }]);
    expect(unassignedTables(6, [{ tableNumber: 2, employeeId: "a", employeeName: "A" }])).toEqual([
      1, 3, 4, 5, 6,
    ]);
    expect(
      staffOnShift([
        { tableNumber: 1, employeeId: "a", employeeName: "Juan" },
        { tableNumber: 2, employeeId: "a", employeeName: "Juan" },
        { tableNumber: 8, employeeId: "b", employeeName: "Pedro" },
      ]).map((s) => `${s.name}:${formatTableRange(s.tables)}`),
    ).toEqual(["Juan:1–2", "Pedro:8"]);
  });
});
