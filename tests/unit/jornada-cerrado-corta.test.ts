import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/jornada-cerrado-corta.sql"), "utf8");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("En un franco la jornada corta, no se estira", () => {
  it("jornada_inicio_corte ya no saltea días cerrados", () => {
    const f = sql.slice(
      sql.indexOf("create or replace function public.jornada_inicio_corte"),
      sql.indexOf("create or replace function public.jornada_fin_corte"),
    );
    expect(f).not.toMatch(/for i in 1\.\.7 loop/);
    expect(f).not.toMatch(/v_dia := v_dia - 1/);
    expect(f).toContain("Un franco no hereda");
  });

  it("jornada_fin_corte es el día calendario siguiente", () => {
    const f = sql.slice(sql.indexOf("create or replace function public.jornada_fin_corte"));
    expect(f).not.toMatch(/for i in 1\.\.7 loop/);
    expect(f).toContain("::date + 1");
  });

  it("el panel operativo no muestra la jornada anterior", () => {
    const pedidos = read("src/app/(app)/panel/pedidos/page.tsx");
    const espera = read("src/app/(app)/panel/espera/page.tsx");
    const pagos = read("src/app/(app)/panel/pagos/page.tsx");
    const hub = read("src/components/panel/ModuleHub.tsx");
    for (const src of [pedidos, espera, pagos, hub]) {
      expect(src).toContain("JornadaInactivaState");
      expect(src).toContain("useJornadaActiva");
      expect(src).not.toContain("cerradoHoy");
    }
  });

  it("el historial de mesas cerradas solo se ofrece desde Pagos", () => {
    const pedidos = read("src/app/(app)/panel/pedidos/page.tsx");
    const espera = read("src/app/(app)/panel/espera/page.tsx");
    const pagos = read("src/app/(app)/panel/pagos/page.tsx");
    const hub = read("src/components/panel/ModuleHub.tsx");
    const empty = read("src/components/panel/JornadaInactivaState.tsx");
    expect(empty).not.toContain("/panel/pagos/historial");
    expect(pedidos).not.toContain("jornadaInactivaHistorial");
    expect(espera).not.toContain("jornadaInactivaHistorial");
    expect(espera).not.toContain("jornadaInactivaReserva");
    expect(espera).toContain("jornadaInactivaEspera");
    expect(pagos).toContain("jornadaInactivaHistorial");
    expect(hub).toContain("jornadaInactivaReserva");
    expect(hub).toContain('href="/panel/espera"');
  });
});
