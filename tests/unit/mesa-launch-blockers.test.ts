import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-launch-blockers.sql"), "utf8");
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);

const funcion = (nombre: string): string => {
  const i = sql.indexOf(`create or replace function public.${nombre}`);
  expect(i, `${nombre} en la migración`).toBeGreaterThan(-1);
  const j = sql.indexOf("\n$$;", i);
  return sql.slice(i, j);
};

describe("mesa-launch-blockers — SQL", () => {
  it("queda al final de orden.json y el chequeo lo registra", () => {
    expect(orden.at(-1)).toBe("mesa-launch-blockers.sql");
    expect(orden.indexOf("mesa-cuenta-compartida.sql")).toBeLessThan(
      orden.indexOf("mesa-launch-blockers.sql"),
    );
    expect(chequeo).toContain(
      "('mesa-launch-blockers.sql', 'function', 'revertir_solicitud_mp', 87)",
    );
    expect(chequeo).toContain(
      "('mesa-launch-blockers.sql', 'function', '_cerrar_sesion_jornada', 87)",
    );
  });

  it("pedir y unirse cortan cuando la cuenta ya se pidió", () => {
    expect(funcion("pedir_como_comensal")).toContain(
      "if v_s.cuenta_solicitada_en is not null",
    );
    expect(funcion("pedir_como_comensal")).toContain("'cuenta-solicitada'");
    expect(funcion("unirse_mesa")).toContain("'cuenta-solicitada'");
    expect(funcion("unirse_mesa")).toContain("'mesa-ocupada'");
    expect(funcion("unirse_mesa")).toContain("estado in ('abierta', 'pagada')");
  });

  it("Mercado Pago tardío no cubre: queda excedente", () => {
    const f = funcion("mp_confirmar_pago");
    expect(f).toContain("mp_estado = 'excedente'");
    expect(f).toContain("'excedente', true");
    expect(f).not.toContain("mp_aprobado_tarde");
  });

  it("partes iguales: la última se lleva el resto", () => {
    const f = funcion("definir_parte_comensal");
    expect(f).toContain("v_restantes := v_partes_tot - v_partes_comp");
    expect(f).toContain("v_base := v_disponible");
    expect(f).not.toContain(
      "v_base := least((v_consumo / v_partes_tot) * v_partes, v_disponible)",
    );
  });

  it("preference fallida revierte el pago total", () => {
    const f = funcion("revertir_solicitud_mp");
    expect(f).toContain("mp-preferencia-fallida");
    expect(f).toContain("cuenta_solicitada_en = null");
    expect(f).toContain("cuenta_intencion is distinct from 'total'");
  });

  it("anular cobro manual también con la mesa pagada, y revisa cobertura", () => {
    const f = funcion("cancelar_pago_mesa");
    expect(f).toContain("not in ('abierta', 'pagada')");
    expect(f).toContain("perform public._revisar_cobertura");
    expect(funcion("_revisar_cobertura")).toContain("estado = 'pagada'");
    expect(funcion("_revisar_cobertura")).toContain("estado = 'abierta'");
  });

  it("cierre de jornada cancela definido y pendiente y cierra la sesión", () => {
    const f = funcion("_cerrar_sesion_jornada");
    expect(f).toContain("estado in ('pendiente', 'definido')");
    expect(f).toContain("cerrada_motivo = 'jornada-cerrada'");
    expect(funcion("liberar_mesas_jornada()")).toContain("_cerrar_sesion_jornada");
    expect(funcion("liberar_mesas_jornada_local")).toContain("_cerrar_sesion_jornada");
  });
});

describe("mesa-launch-blockers — API y panel", () => {
  it("el POST legado de cobro está desactivado", () => {
    const route = readFileSync(
      join(root, "src/app/api/m/[token]/pagos/route.ts"),
      "utf8",
    );
    expect(route).toContain("flujo-cuenta");
    expect(route).toContain("mutating: true");
    expect(route).not.toContain("createGuestPayment");
  });

  it("si falla el preference se llama revertir_solicitud_mp", () => {
    const guest = readFileSync(join(root, "src/lib/server/tableGuest.ts"), "utf8");
    expect(guest).toContain('rpc("revertir_solicitud_mp"');
    expect(guest).not.toContain('cancelMercadoPagoPayment(paymentId, "mp-preferencia-fallida")');
  });

  it("una carga fallida no marca ready ni pisa el snapshot", () => {
    const bills = readFileSync(join(root, "src/lib/hooks/useTableBills.ts"), "utf8");
    expect(bills).toContain("shared.ready = true");
    expect(bills).toMatch(/shared\.syncError = res\.error;/);
    expect(bills).not.toMatch(/else \{\s*shared\.syncError = res\.error;\s*\}\s*shared\.ready = true/);
  });

  it("el dock no escribe en el store de Mesas", () => {
    const store = readFileSync(
      join(root, "src/lib/store/panel-alert-store.ts"),
      "utf8",
    );
    expect(store).not.toContain("ackTableAttention");
    expect(store).toContain("sourceReady");
  });
});
