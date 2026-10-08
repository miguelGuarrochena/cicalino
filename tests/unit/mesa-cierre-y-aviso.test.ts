import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const leer = (p: string) => readFileSync(join(root, p), "utf8");
const cierre = leer("supabase/mesa-cierre-al-pagar.sql");
const aviso = leer("supabase/mesa-cuenta-broadcast.sql");
const orden: string[] = JSON.parse(leer("supabase/orden.json"));
const chequeo = leer("supabase/chequeo-migraciones.sql");
const tableGuest = leer("src/lib/server/tableGuest.ts");
const hook = leer("src/lib/hooks/useTableBillLive.ts");

describe("La mesa se cierra sola cuando queda pagada", () => {
  it("va después de las versiones que reemplaza y usa", () => {
    const i = orden.indexOf("mesa-cierre-al-pagar.sql");
    expect(i).toBeGreaterThan(orden.indexOf("pedidos-mostrador-qr.sql"));
    expect(i).toBeGreaterThan(orden.indexOf("mostrador-qr-pago-previo.sql"));
    expect(chequeo).toContain(
      "('mesa-cierre-al-pagar.sql', 'function', '_revisar_cobertura', 98)",
    );
  });

  it("cierra con motivo 'pagada' solo si no queda ningún pago pendiente", () => {
    expect(cierre).toContain("estado = 'pendiente'");
    expect(cierre).toContain("perform public._cerrar_sesion(p_sesion, 'pagada')");
    expect(cierre.indexOf("estado = 'pendiente'")).toBeLessThan(
      cierre.indexOf("_cerrar_sesion(p_sesion, 'pagada')"),
    );
  });

  it("no toca sesiones ya cerradas ni las de autoservicio", () => {
    expect(cierre).toContain("coalesce(v_flujo, 'cuenta') <> 'cuenta' or v_estado = 'cerrada'");
  });
});

/* La versión vigente de cada función que llega a _revisar_cobertura: la última
 * definición según orden.json. */
const vigente = (nombre: string): string => {
  let cuerpo = "";
  for (const archivo of orden) {
    let texto: string;
    try {
      texto = leer(`supabase/${archivo}`);
    } catch {
      continue;
    }
    const inicio = texto.indexOf(`create or replace function public.${nombre}(`);
    if (inicio < 0) continue;
    const fin = texto.indexOf("\n$$;", inicio);
    cuerpo = texto.slice(inicio, fin);
  }
  return cuerpo;
};

describe("Cierre automático con pagos concurrentes", () => {
  /* Dos cobros que terminan de cubrir la mesa al mismo tiempo: cada uno toma
   * el lock de la sesión antes de leer los pagos, así el segundo espera y ve
   * el primero ya confirmado. Si alguno sumara antes del lock, ninguno de los
   * dos vería la mesa cubierta y quedaría abierta. */
  it.each([
    "confirmar_pago_mesa",
    "cancelar_pago_mesa",
    "_crear_pago_mesa",
    "mp_confirmar_pago",
  ])("%s bloquea la sesión antes de revisar la cobertura", (nombre) => {
    const f = vigente(nombre);
    expect(f).not.toBe("");
    const lock = f.search(/mesa_sesiones[^;]*for update/i);
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(f.indexOf("_revisar_cobertura"));
    expect(lock).toBeLessThan(f.search(/(update|insert into) public\.pagos_mesa/));
  });

  it("_cerrar_sesion es idempotente: una sesión ya cerrada no se vuelve a cerrar", () => {
    expect(vigente("_cerrar_sesion")).toContain("v_s.estado = 'cerrada' then\n    return;");
  });

  it("pedir con la mesa ya cerrada se rechaza bajo el mismo lock", () => {
    const f = vigente("pedir_como_comensal");
    const lock = f.search(/mesa_sesiones[^;]*for update/i);
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(f.indexOf("estado <> 'abierta'"));
  });
});

describe("Sin loops ni avisos de más", () => {
  it("el trigger no escribe en mesa_sesiones (no se dispara a sí mismo)", () => {
    const cuerpo = aviso.slice(
      aviso.indexOf("create or replace function public.mesa_sesiones_avisar_cuenta"),
      aviso.indexOf("$$;"),
    );
    expect(cuerpo).not.toMatch(/update public\.mesa_sesiones/i);
    expect(aviso).toContain("after update on public.mesa_sesiones");
    expect(aviso).not.toMatch(/after (insert|update)[^;]*on realtime\./i);
  });

  it("el teléfono junta los avisos de una misma transacción en una sola recarga", () => {
    expect(hook).toContain("debounced(");
  });
});

describe("Los teléfonos de la mesa se enteran de cualquier cambio", () => {
  it("la base avisa al canal que escucha el teléfono", () => {
    expect(aviso).toContain("'mesa-cuenta:' || new.id::text");
    expect(hook).toContain("`mesa-cuenta:${sessionId}`");
    expect(aviso).toMatch(/after update on public\.mesa_sesiones/);
    expect(aviso).toContain("old.version is distinct from new.version");
  });

  it("un aviso que falla no rompe la escritura", () => {
    expect(aviso).toContain("exception when others");
    expect(aviso).toContain("to_regprocedure('realtime.send(jsonb, text, text, boolean)')");
  });

  it("chequeo-migraciones lo registra", () => {
    expect(orden.indexOf("split-payments.sql")).toBeLessThan(
      orden.indexOf("mesa-cuenta-broadcast.sql"),
    );
    expect(chequeo).toContain(
      "('mesa-cuenta-broadcast.sql', 'trigger', 'mesa_sesiones_avisar_cuenta', 99)",
    );
  });

  it("el broadcast REST usa el topic sin prefijo realtime:", () => {
    expect(tableGuest).toContain("topic: `mesa-cuenta:${sessionId}`");
    expect(tableGuest).not.toContain("realtime:mesa-cuenta:");
  });

  it("al reconectar, el teléfono recarga lo que se pudo haber perdido", () => {
    expect(hook).toContain("watchChannel(channel, connect, fire)");
  });
});

describe("mesa-consistencia-cobros.sql", () => {
  const sql = leer("supabase/mesa-consistencia-cobros.sql");

  it("va al final y el chequeo lo registra", () => {
    expect(orden.indexOf("mesa-consistencia-cobros.sql")).toBeGreaterThan(
      orden.indexOf("mesa-cierre-al-pagar.sql"),
    );
    expect(chequeo).toContain(
      "('mesa-consistencia-cobros.sql', 'trigger', 'pedidos_revisar_cobertura', 100)",
    );
  });

  it("confirmar_pago_mesa: una sola firma, con el monto esperado opcional para el panel viejo", () => {
    expect(sql).toContain("drop function if exists public.confirmar_pago_mesa(uuid, uuid);");
    expect(sql).toContain("p_monto_esperado integer default null");
    /* Misma respuesta que _crear_pago_mesa: el panel la maneja igual. */
    expect(sql).toContain("'reason', 'monto-cambio'");
    const f = vigente("confirmar_pago_mesa");
    expect(f.indexOf("p_monto_esperado <> v_p.monto_total")).toBeLessThan(
      f.indexOf("update public.pagos_mesa"),
    );
  });

  it("cancelar un pedido de la cuenta compartida revisa la cobertura después (AFTER)", () => {
    expect(sql).toMatch(/after update of estado on public\.pedidos/);
    expect(sql).toContain("new.estado = 'cancelado' and old.estado <> 'cancelado'");
    expect(sql).toContain("not coalesce(new.autoservicio, false)");
    expect(sql).toContain("perform public._revisar_cobertura(new.sesion_id)");
  });
});
