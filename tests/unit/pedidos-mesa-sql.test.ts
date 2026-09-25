import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* Pedidos en modalidad Mesa, del lado de la base (supabase/pedidos-mesa.sql).
 *
 * La regla que importa es una: un pedido sin pagar no entra a preparación.
 * Vive en un trigger, no en la pantalla, y estos tests fijan que siga ahí y
 * que ninguna función de la cuenta compartida (Pagos) la pueda esquivar. */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const sql = read("supabase/pedidos-mesa.sql");
const enumSql = read("supabase/pedidos-mesa-enum.sql");
const chequeo = read("supabase/chequeo-migraciones.sql");
const orden: string[] = JSON.parse(read("supabase/orden.json"));

const funcion = (nombre: string): string => {
  const i = sql.indexOf(`create or replace function public.${nombre}(`);
  expect(i, `${nombre} en la migración`).toBeGreaterThan(-1);
  const j = sql.indexOf("\n$$;", i);
  return sql.slice(i, j);
};

describe("pedidos-mesa — orden y registro", () => {
  it("el valor del enum va en su propio script, antes que la migración", () => {
    expect(enumSql).toContain("alter type public.order_status add value if not exists 'pendiente_pago'");
    expect(sql).not.toMatch(/add value if not exists/i);
    expect(orden.indexOf("pedidos-mesa-enum.sql")).toBeGreaterThan(-1);
    expect(orden.indexOf("pedidos-mesa-enum.sql")).toBeLessThan(orden.indexOf("pedidos-mesa.sql"));
    expect(orden.indexOf("mesa-sesion-activa-unica.sql")).toBeLessThan(
      orden.indexOf("pedidos-mesa.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('pedidos-mesa-enum.sql', 'enum_value', 'order_status.pendiente_pago', 90)",
    );
    expect(chequeo).toContain("('pedidos-mesa.sql', 'column', 'locales.pedidos_modalidad', 91)");
    expect(chequeo).toContain("('pedidos-mesa.sql', 'trigger', 'pedidos_autoservicio_guard', 91)");
  });

  it("la modalidad es de la sucursal y la de siempre es el default", () => {
    expect(sql).toContain("add column if not exists pedidos_modalidad text not null default 'mostrador'");
    expect(sql).toContain("check (pedidos_modalidad in ('mostrador', 'mesa'))");
    expect(funcion("local_pedidos_mesa")).toContain("local_tiene_modulo(p_local, 'pedidos')");
  });
});

describe("pedidos-mesa — sin pago no hay preparación", () => {
  const guard = funcion("pedidos_autoservicio_guard");

  it("el pedido de la mesa nace esperando el pago y solo lo crea el QR", () => {
    expect(guard).toContain("if new.estado <> 'pendiente_pago' then");
    expect(guard).toContain("hint = 'pendiente-pago'");
    /* Nadie del panel crea un pedido de autoservicio a mano. */
    expect(guard).toContain("Self-service orders are placed from the table QR");
    expect(sql).toContain("check (estado <> 'pendiente_pago' or autoservicio)");
  });

  it("pasar a preparación exige cobros pagados que cubran el total", () => {
    expect(guard).toContain("if old.estado = 'pendiente_pago' and new.estado <> 'cancelado' then");
    expect(guard).toContain("where pedido_id = old.id and estado = 'pagado'");
    expect(guard).toContain("if v_total <= 0 or v_pagado < v_total then");
    expect(guard).toContain("hint = 'pedido-sin-pagar'");
    expect(guard).toContain("new.confirmado_en := now();");
  });

  it("el trigger corre en insert y en update de pedidos", () => {
    expect(sql).toContain(`create trigger pedidos_autoservicio_guard
  before insert or update on public.pedidos`);
  });

  it("confirmado_en y autoservicio no se tocan desde afuera", () => {
    expect(guard).toContain("pedidos.autoservicio is read only");
    expect(guard).toContain("new.confirmado_en := old.confirmado_en;");
  });

  it("las transiciones: pendiente_pago solo va a creado o cancelado", () => {
    const t = funcion("chequear_transicion_pedido");
    expect(t).toContain("(old.estado = 'pendiente_pago' and new.estado in ('creado','cancelado'))");
    expect(t).not.toMatch(/'pendiente_pago' and new\.estado in \([^)]*'listo'/);
  });

  it("el cliente solo cancela mientras no pagó", () => {
    expect(guard).toContain("= 'comensal'");
    expect(guard).toContain("not (old.estado = 'pendiente_pago' and new.estado = 'cancelado')");
    const f = funcion("cancelar_pedido_autoservicio");
    expect(f).toContain("if v_p.estado <> 'pendiente_pago' then");
    expect(f).toContain("perform set_config('cicalino.actor', 'comensal', true);");
  });

  it("el barrido a en_preparacion no toca pedidos sin pagar", () => {
    for (const f of ["marcar_en_preparacion_local", "marcar_en_preparacion_pendientes"]) {
      const body = funcion(f);
      expect(body).toContain("estado = 'creado'");
      expect(body).toContain("(autoservicio and confirmado_en <= now() - interval '1 minute')");
      expect(body).toContain("(sesion_id is null and creado_en <= now() - interval '1 minute')");
    }
  });
});

describe("pedidos-mesa — la cuenta compartida no se mezcla", () => {
  it("pedir_como_comensal no puede crear un pedido en una mesa de autoservicio", () => {
    const guard = funcion("pedidos_autoservicio_guard");
    expect(guard).toContain("elsif v_flujo = 'autoservicio' then");
    expect(guard).toContain("hint = 'flujo-autoservicio'");
  });

  it("los cobros de una mesa de autoservicio son de un pedido", () => {
    const g = funcion("pagos_mesa_flujo_guard");
    expect(g).toContain("if v_flujo = 'autoservicio' and new.pedido_id is null then");
    expect(g).toContain("if coalesce(v_flujo, 'cuenta') = 'cuenta' and new.pedido_id is not null then");
    expect(g).toContain("v_ped.sesion_id is distinct from new.sesion_id");
    expect(sql).toContain(`create trigger pagos_mesa_flujo_guard
  before insert or update on public.pagos_mesa`);
  });

  it("una mesa de autoservicio no queda pagada, ni pide cuenta ni llama al mozo", () => {
    const g = funcion("mesa_sesiones_flujo_guard");
    for (const campo of ["new.estado = 'pagada'", "cuenta_solicitada_en", "llamado_en", "cuenta_intencion"]) {
      expect(g).toContain(campo);
    }
    expect(funcion("_revisar_cobertura")).toContain("if v_flujo = 'autoservicio' then\n    return;");
  });

  it("unirse_mesa (Pagos) no abre la cuenta en modalidad Mesa", () => {
    const f = funcion("unirse_mesa");
    expect(f).toContain("if public.local_pedidos_mesa(v_m.local_id)");
    expect(f).toContain("'cambio-modalidad'");
  });

  it("la mesa de autoservicio no aparece en el piso ni el historial de Pagos", () => {
    expect(funcion("mesas_cuentas")).toContain("and s.flujo = 'cuenta'");
    expect(funcion("mesas_cierres")).toContain("and s.flujo = 'cuenta'");
  });

  it("una cuenta de Pagos con plata no se pisa al pasar a modalidad Mesa", () => {
    const f = funcion("unirse_mesa_autoservicio");
    expect(f).toContain("if found and v_s.flujo = 'cuenta' then");
    expect(f).toContain("return json_build_object('ok', false, 'reason', 'mesa-ocupada');");
    expect(f).toContain("values (v_m.local_id, v_m.id, v_m.numero, 'autoservicio')");
  });
});

describe("pedidos-mesa — pedir y cobrar", () => {
  it("el monto sale de los ítems del pedido, nunca del cliente", () => {
    const pedir = funcion("pedir_autoservicio");
    expect(pedir).not.toContain("p_monto");
    expect(pedir).toContain("join public.productos pr");
    expect(pedir).toContain("pr.local_id = v_s.local_id and pr.activo");
    expect(funcion("_crear_pago_pedido")).toContain("v_total := public._total_pedido(v_p.id);");
  });

  it("el número sale de la misma serie que el mostrador, con el lock del local", () => {
    const pedir = funcion("pedir_autoservicio");
    expect(pedir).toContain("from public.locales l where l.id = v_s.local_id\n   for update;");
    expect(pedir).toContain("v_ref := (v_max + 1)::text;");
    expect(pedir).toContain("'pendiente_pago'");
  });

  it("reintentar el mismo carrito devuelve el mismo pedido", () => {
    const pedir = funcion("pedir_autoservicio");
    expect(pedir).toContain("where comensal_id = v_c.id and clave_idempotencia = p_clave;");
    expect(pedir).toContain("'repetido', true");
  });

  it("la caja cobra plata en mano: nunca Mercado Pago, y con quién cobró", () => {
    const f = funcion("cobrar_pedido_autoservicio");
    expect(f).toContain("if v_metodo = 'mercado_pago' then");
    expect(f).toContain("'mp-solo-webhook'");
    expect(f).toContain("public._staff_empleado_cobro(v_p.local_id, p_empleado)");
    expect(f).toContain("public._autoservicio_staff_puede(v_p.local_id, true)");
    /* Cobra y confirma en la misma transacción: el trigger verifica el cobro. */
    expect(f.indexOf("_crear_pago_pedido(v_p.id, v_metodo, 'personal', p_empleado)")).toBeLessThan(
      f.indexOf("update public.pedidos set estado = 'creado'"),
    );
  });

  it("un pedido tiene a lo sumo un cobro vivo", () => {
    expect(sql).toContain("create unique index if not exists uq_pagos_mesa_pedido_activo");
    expect(sql).toContain("where pedido_id is not null and estado in ('pendiente', 'pagado');");
  });

  it("cancelar un pedido suelta su checkout y deja rastro si ya estaba pago", () => {
    const f = funcion("pedidos_autoservicio_despues");
    expect(f).toContain("cancelado_motivo = 'pedido-cancelado'");
    expect(f).toContain("'pedido_cancelado_con_pago'");
  });

  it("el cierre de jornada cancela lo que nadie pagó", () => {
    const f = funcion("_cerrar_sesion");
    expect(f).toContain("if v_s.flujo = 'autoservicio' then");
    expect(f).toContain("where sesion_id = v_s.id and estado = 'pendiente_pago';");
    expect(funcion("_cerrar_sesion_jornada")).toContain("_cerrar_sesion(p_sesion, 'jornada-cerrada')");
  });
});

describe("pedidos-mesa — Mercado Pago", () => {
  const mp = funcion("mp_confirmar_pago");

  it("mantiene las validaciones de siempre", () => {
    expect(mp).toContain("if p_moneda <> 'ARS' or p_monto <> v_p.monto_total then");
    expect(mp).toContain("v_p.local_id <> p_local or v_p.metodo <> 'mercado_pago'");
    expect(mp).toContain("if v_p.estado = 'pagado' then\n      return json_build_object('ok', true, 'repetido', true);");
    expect(mp).toContain("'mp_pago_duplicado'");
  });

  it("la aprobación confirma el pedido solo si sigue esperando y nadie más lo pagó", () => {
    expect(mp).toContain("and v_ped.estado = 'pendiente_pago'");
    expect(mp).toContain("g.pedido_id = v_ped.id and g.estado = 'pagado' and g.id <> v_p.id");
    expect(mp).toContain("v_p.monto_base >= public._total_pedido(v_ped.id)");
    expect(mp).toContain("update public.pedidos set estado = 'creado'");
  });

  it("lo que no cubre queda como excedente para devolver", () => {
    expect(mp).toContain("mp_estado = 'excedente'");
    expect(mp).toContain("'excedente', true");
  });

  it("la cuenta compartida sigue revisando la cobertura de la mesa", () => {
    expect(mp).toContain("perform public._revisar_cobertura(v_p.sesion_id);");
  });
});

describe("pedidos-mesa — tablero, métricas y permisos", () => {
  it("el tablero suma los pedidos de la mesa ya pagos, con mesa e ítems", () => {
    const f = funcion("pedidos_pagina");
    expect(f).toContain("and (p.sesion_id is null or p.autoservicio)");
    expect(f).toContain("select * from dia where estado <> 'pendiente_pago'");
    expect(f).toContain("'mesa_numero', p.mesa_numero");
    expect(f).toContain("'items', case when p.autoservicio");
    expect(f).toContain("ps.comensal_id = p.comensal_id");
  });

  it("las métricas no cuentan pedidos que nunca se pagaron", () => {
    const f = funcion("metricas_pedidos_datos");
    expect(f).toContain("and not (autoservicio and confirmado_en is null)");
    expect(f).toContain("coalesce(confirmado_en, creado_en) as inicio");
  });

  it("la carta, los cobros y Mercado Pago también son de la modalidad Mesa", () => {
    expect(funcion("local_usa_carta")).toContain(
      "local_tiene_modulo(p_local, 'pagos') or public.local_pedidos_mesa(p_local)",
    );
    for (const policy of ["productos alta", "productos editar", "categorias alta", "cobros insertar dueno"]) {
      const i = sql.indexOf(`create policy "${policy}"`);
      expect(i, policy).toBeGreaterThan(-1);
      expect(sql.slice(i, i + 400), policy).toContain("local_usa_carta(local_id)");
    }
  });

  it("las funciones del comensal son solo del servidor", () => {
    for (const firma of [
      "unirse_mesa_autoservicio(text, text, text)",
      "mesa_autoservicio_estado(text, uuid, text)",
      "pedir_autoservicio(uuid, text, jsonb, uuid, text)",
      "pagar_pedido_autoservicio(uuid, text, uuid, text)",
      "cancelar_pedido_autoservicio(uuid, text, uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${firma} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${firma} to service_role;`);
    }
  });

  it("la caja entra con su sesión, nunca anon", () => {
    for (const firma of ["pedidos_por_cobrar(uuid)", "cobrar_pedido_autoservicio(uuid, text, uuid)"]) {
      expect(sql).toContain(`revoke all on function public.${firma} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${firma} to authenticated;`);
    }
    expect(funcion("pedidos_por_cobrar")).toContain("_autoservicio_staff_puede(p_local, false)");
  });

  it("el QR de la mesa sabe a qué flujo lleva y en modalidad Mesa no pide activarlo", () => {
    const f = funcion("mesa_por_qr");
    expect(f).toContain("v_flujo := 'autoservicio';");
    expect(f).toContain("'flujo', v_flujo");
    expect(f.indexOf("local_pedidos_mesa(v_l.id)")).toBeLessThan(f.indexOf("not v_m.qr_activo"));
  });
});
