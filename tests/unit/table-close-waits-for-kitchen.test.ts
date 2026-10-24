import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const leer = (p: string) => readFileSync(join(root, p), "utf8");
const script = leer("supabase/table-close-waits-for-kitchen.sql");
const orden: string[] = JSON.parse(leer("supabase/orden.json"));
const chequeo = leer("supabase/chequeo-migraciones.sql");
const detalle = leer("src/components/panel/mesas/TableDetail.tsx");
const comensal = leer("src/components/customer/table/TableGuestApp.tsx");

/* La última definición de cada función según orden.json. */
const vigente = (nombre: string): { archivo: string; cuerpo: string } => {
  let res = { archivo: "", cuerpo: "" };
  for (const archivo of orden) {
    const texto = leer(`supabase/${archivo}`);
    const inicio = texto.indexOf(`create or replace function public.${nombre}(`);
    if (inicio < 0) continue;
    res = { archivo, cuerpo: texto.slice(inicio, texto.indexOf("\n$$;", inicio)) };
  }
  return res;
};

describe("La mesa pagada espera a la cocina antes de cerrarse", () => {
  it("corre después de lo que reemplaza y antes de los grants", () => {
    const i = orden.indexOf("table-close-waits-for-kitchen.sql");
    for (const previo of [
      "mesa-cierre-al-pagar.sql",
      "mesa-consistencia-cobros.sql",
      "cocina-modo.sql",
      "mesa-ocupacion-pedidos.sql",
    ]) {
      expect(i).toBeGreaterThan(orden.indexOf(previo));
    }
    expect(orden.at(-1)).toBe("data-api-grants.sql");
    expect(chequeo).toContain(
      "('table-close-waits-for-kitchen.sql', 'function', '_sesion_cocina_pendiente', 110)",
    );
    expect(chequeo).toMatch(/\('table-close-waits-for-kitchen\.sql', 'mesa-cierre-al-pagar\.sql/);
  });

  it("la versión vigente de _revisar_cobertura es la de este script", () => {
    expect(vigente("_revisar_cobertura").archivo).toBe("table-close-waits-for-kitchen.sql");
    expect(vigente("pedidos_revisar_cobertura").archivo).toBe("table-close-waits-for-kitchen.sql");
  });

  it("cierra solo sin cobros pendientes y sin cocina pendiente", () => {
    const f = vigente("_revisar_cobertura").cuerpo;
    const cierre = f.indexOf("_cerrar_sesion(p_sesion, 'pagada')");
    expect(cierre).toBeGreaterThan(-1);
    expect(f.indexOf("estado = 'pendiente'")).toBeLessThan(cierre);
    expect(f.indexOf("not public._sesion_cocina_pendiente(p_sesion)")).toBeLessThan(cierre);
    /* Sigue sin tocar autoservicio, mostrador ni sesiones cerradas. */
    expect(f).toContain("coalesce(v_flujo, 'cuenta') <> 'cuenta' or v_estado = 'cerrada'");
  });

  it("cocina pendiente: sin anotar siempre; en preparación solo con cocina en pantalla", () => {
    const f = vigente("_sesion_cocina_pendiente").cuerpo;
    expect(f).toContain("p.estado = 'creado'");
    expect(f).toContain("p.estado = 'en_preparacion' and l.cocina_modo = 'pantalla'");
    expect(f).not.toMatch(/'listo'|'retirado'/);
    expect(script).toContain(
      "revoke all on function public._sesion_cocina_pendiente(uuid) from public, anon, authenticated;",
    );
  });

  it("el trigger revisa al cancelar y cuando un pedido de la cuenta sale de la cocina", () => {
    const trigger = script.slice(script.indexOf("create trigger pedidos_revisar_cobertura"));
    expect(trigger).toContain("after update of estado on public.pedidos");
    expect(trigger).toContain("new.estado = 'cancelado'");
    expect(trigger).toContain("old.estado in ('creado', 'en_preparacion')");
    expect(trigger).toContain("not coalesce(new.autoservicio, false)");
  });

  it("el trigger bloquea la sesión antes de revisar (anotar y cobrar a la vez)", () => {
    const f = vigente("pedidos_revisar_cobertura").cuerpo;
    const lock = f.indexOf("from public.mesa_sesiones where id = new.sesion_id for update");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(f.indexOf("perform public._revisar_cobertura(new.sesion_id)"));
    /* Siempre, no solo con la sesión pagada: el cobro concurrente la ve abierta. */
    expect(f.slice(0, lock)).not.toMatch(/estado = 'pagada'/);
  });

  it("Mesa y el mostrador no pasan por acá: el pago previo sigue en su guardia", () => {
    const trigger = script.slice(script.indexOf("create trigger pedidos_revisar_cobertura"));
    expect(trigger).toContain("not coalesce(new.autoservicio, false)");
    expect(script).not.toMatch(/pedidos_autoservicio_guard|chequear_transicion_pedido/);
    expect(vigente("pedidos_autoservicio_guard").archivo).toBe("mostrador-qr-pago-previo.sql");
  });

  it("no reabre sesiones cerradas: el chequeo final es de solo lectura", () => {
    const chequeoFinal = script.slice(script.lastIndexOf("-- Chequeo"));
    expect(chequeoFinal).not.toMatch(/\b(update|insert|delete)\b/i);
  });
});

describe("El panel y el comensal con la mesa pagada sin cerrar", () => {
  it("anotar, mandar a cocina y marcar listo siguen disponibles con la mesa pagada", () => {
    expect(detalle).toContain("{live && porAnotar && (");
    expect(detalle).toContain(
      '{live && cocinaPantalla && o.status === "en_preparacion" && o.kitchenDoneAt && (',
    );
  });

  it("cancelar y cobrar siguen atados a la cuenta abierta", () => {
    expect(detalle).toContain("const canConfirm = open &&");
    expect(detalle.match(/\{open && porAnotar && \(/g)?.length).toBe(1);
  });

  it("el comensal no ve 'Pedir algo más' hasta que la sesión se cierra", () => {
    const i = comensal.indexOf('t("mesa.nuevaVisita")');
    const antes = comensal.slice(Math.max(0, i - 600), i);
    expect(antes).toContain('bill.session.status === "cerrada" && (');
  });
});
