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
    expect(board).toContain("markTable");
    expect(board).toContain("saveShiftWeek");
    expect(board).toContain("assignTableRange");
    expect(board).toContain("assignTable(");
    expect(board).toContain("WeekCalendar");
    expect(board).toContain("DayShiftModal");
    expect(board).toContain("RangeAssignModal");
    expect(board).not.toContain("line-clamp-3");
    const day = readFileSync(
      join(root, "src/components/panel/mesas/DayShiftModal.tsx"),
      "utf8",
    );
    expect(day).toContain("marcarCon");
    expect(day).toContain("text-base font-bold");
    const week = readFileSync(
      join(root, "src/components/panel/mesas/WeekCalendar.tsx"),
      "utf8",
    );
    expect(week).toContain("grid-cols-7");
    expect(week).not.toContain('from "@/components/ui/Select"');
    expect(week).not.toContain("MesaChip");
    const range = readFileSync(
      join(root, "src/components/panel/mesas/RangeAssignModal.tsx"),
      "utf8",
    );
    expect(range).toContain("scope");
    expect(range).toContain('"week"');
    expect(range).toContain("dayOpts");
    expect(range).toContain("mesaDesde");
  });
});

describe("helpers de la plantilla visual", () => {
  it("uniqueIds y weekdaysInSpan no duplican gente y envuelven Vie→Lun", async () => {
    const { uniqueIds, weekdaysInSpan, tablesOfOwners } = await import(
      "@/components/panel/mesas/jornadaUi"
    );
    expect(uniqueIds({ 1: "a", 2: "a", 3: "b" })).toEqual(["a", "b"]);
    expect(tablesOfOwners({ 1: "a", 2: "a", 5: "b" }, "a")).toEqual([1, 2]);
    expect(weekdaysInSpan(1, 3)).toEqual([1, 2, 3]);
    expect(weekdaysInSpan(5, 1)).toEqual([5, 6, 7, 1]);
    expect(weekdaysInSpan(4, 4)).toEqual([4]);
  });
});
