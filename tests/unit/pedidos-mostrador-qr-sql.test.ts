import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* Pedidos en modalidad Mostrador QR, del lado de la base
 * (supabase/pedidos-mostrador-qr.sql).
 *
 * Lo que importa: el pedido entra al tablero sin esperar el pago, el pago va
 * aparte y se cobra una sola vez, y nada de esto cambia la modalidad Mesa. */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const sql = read("supabase/pedidos-mostrador-qr.sql");
const chequeo = read("supabase/chequeo-migraciones.sql");
const orden: string[] = JSON.parse(read("supabase/orden.json"));

const funcion = (nombre: string): string => {
  const i = sql.indexOf(`create or replace function public.${nombre}(`);
  expect(i, `${nombre} en la migración`).toBeGreaterThan(-1);
  const j = sql.indexOf("\n$$;", i);
  return sql.slice(i, j);
};

describe("pedidos-mostrador-qr — orden y registro", () => {
  it("corre después de pedidos-mesa.sql", () => {
    expect(orden.indexOf("pedidos-mostrador-qr.sql")).toBeGreaterThan(
      orden.indexOf("pedidos-mesa.sql"),
    );
    expect(orden.indexOf("pedidos-mesa.sql")).toBeGreaterThan(-1);
  });

  it("chequeo-migraciones lo registra con su requisito", () => {
    expect(chequeo).toContain(
      "('pedidos-mostrador-qr.sql', 'column', 'locales.mostrador_qr_token', 92)",
    );
    expect(chequeo).toContain(
      "('pedidos-mostrador-qr.sql', 'function', 'pedir_mostrador_qr', 92)",
    );
    expect(chequeo).toContain("('pedidos-mostrador-qr.sql', 'pedidos-mesa.sql')");
  });

  it("es una tercera modalidad: mostrador y mesa siguen valiendo", () => {
    expect(sql).toContain("check (pedidos_modalidad in ('mostrador', 'mesa', 'mostrador_qr'))");
    expect(funcion("local_pedidos_mostrador_qr")).toContain(
      "local_tiene_modulo(p_local, 'pedidos')",
    );
    /* La carta y los cobros se habilitan también para el mostrador. */
    expect(funcion("local_usa_carta")).toContain("local_pedidos_mostrador_qr(p_local)");
    expect(funcion("local_usa_carta")).toContain("local_pedidos_mesa(p_local)");
  });
});

describe("pedidos-mostrador-qr — un QR para todo el local", () => {
  it("el token es del local, único y regenerable", () => {
    expect(sql).toContain("add column if not exists mostrador_qr_token text");
    expect(sql).toContain("create unique index if not exists uq_locales_mostrador_qr_token");
    const regen = funcion("regenerar_qr_mostrador");
    expect(regen).toContain("public.auth_gestiona_local(p_local)");
    expect(regen).toContain("mostrador_qr_token = gen_random_uuid()::text");
  });

  it("nadie cambia el token a mano desde el panel", () => {
    const guard = funcion("locales_mostrador_qr_guard");
    expect(guard).toContain("locales.mostrador_qr_token is read only");
    expect(guard).toContain("current_setting('cicalino.qr_mostrador', true)");
  });

  it("no usa mesas: la sesión es del teléfono y va sin mesa", () => {
    expect(sql).toContain("check (flujo in ('cuenta', 'autoservicio', 'mostrador_qr'))");
    expect(sql).toContain("then mesa_id is null and mesa_numero is null");
    const unirse = funcion("unirse_mostrador_qr");
    expect(unirse).toContain("values (v_l.id, null, null, 'mostrador_qr')");
    expect(unirse).not.toContain("public.mesas");
  });

  it("el nombre es opcional", () => {
    expect(sql).toContain("alter column nombre drop not null");
    const pedir = funcion("pedir_mostrador_qr");
    expect(pedir).toContain("char_length(v_nombre) not between 2 and 24");
    expect(pedir).toContain("'nombre-invalido'");
  });

  it("el QR no identifica el pedido: los pedidos salen de la credencial", () => {
    const estado = funcion("mostrador_qr_estado");
    expect(estado).toContain("public._comensal_valido(p_comensal, p_token_hash)");
    expect(estado).toContain(
      "v_cs.local_id is distinct from v_l.id or v_cs.flujo is distinct from 'mostrador_qr'",
    );
    expect(estado).toContain("when v_c.id is null then '[]'::json else coalesce((");
  });
});

describe("pedidos-mostrador-qr — el pedido no espera el pago", () => {
  const guard = funcion("pedidos_autoservicio_guard");
  const pedir = funcion("pedir_mostrador_qr");

  it("nace en `creado` y entra al tablero con la espera corriendo", () => {
    expect(guard).toContain("if v_flujo = 'mostrador_qr' then");
    expect(guard).toContain("if new.estado <> 'creado' then");
    expect(guard).toContain("new.confirmado_en := now();");
    expect(pedir).toMatch(/v_s\.local_id, v_ref, v_nombre, 'creado'/);
    expect(pedir).not.toContain("'pendiente_pago'");
  });

  it("la mesa sigue naciendo esperando el pago", () => {
    expect(guard).toContain("if new.estado <> 'pendiente_pago' then");
    expect(guard).toContain("hint = 'pedido-sin-pagar'");
  });

  it("el número es de la misma serie de la jornada, bajo el mismo lock", () => {
    expect(pedir).toMatch(/from public\.locales l where l\.id = v_s\.local_id\s+for update/);
    expect(pedir).toContain("v_ref := (v_max + 1)::text;");
  });

  it("guarda cómo eligió pagar; Mercado Pago abre el cobro de siempre", () => {
    expect(pedir).toContain("case when p_metodo = 'caja' then now() end");
    expect(pedir).toContain("public._crear_pago_pedido(v_pedido, 'mercado_pago', 'comensal')");
    expect(pedir).toContain("where comensal_id = v_c.id and clave_idempotencia = p_clave");
  });
});

describe("pedidos-mostrador-qr — el pago va aparte y una sola vez", () => {
  it("Mercado Pago lo deja pago sin tocar la preparación", () => {
    const mp = funcion("mp_confirmar_pago");
    expect(mp).toContain("then v_ped.estado <> 'cancelado'");
    expect(mp).toContain("else v_ped.estado = 'pendiente_pago' end");
    expect(mp).toContain("g.pedido_id = v_ped.id and g.estado = 'pagado' and g.id <> v_p.id");
    const rama = mp.slice(mp.indexOf("if v_p.pedido_id is not null and v_flujo = 'mostrador_qr' then"));
    expect(rama.slice(0, rama.indexOf("elsif"))).not.toContain("update public.pedidos set estado");
  });

  it("la caja cobra con el mismo RPC, sin cambiar el estado ni cobrar dos veces", () => {
    const cobrar = funcion("cobrar_pedido_autoservicio");
    expect(cobrar).toContain("public._staff_empleado_cobro(v_p.local_id, p_empleado)");
    expect(cobrar).toContain("return json_build_object('ok', true, 'repetido', true);");
    expect(cobrar).toContain("where g.pedido_id = v_p.id and g.estado = 'pagado'");
    expect(cobrar).toContain("'mp-solo-webhook'");
    const rama = cobrar.slice(cobrar.indexOf("if v_flujo = 'mostrador_qr' then\n    perform public._marcar_pedido_pagado"));
    expect(rama.slice(0, rama.indexOf("else"))).not.toContain("set estado");
  });

  it("el cliente puede cambiar cómo paga mientras no esté pago", () => {
    const pagar = funcion("pagar_pedido_autoservicio");
    expect(pagar).toContain("'ya-pagado'");
    expect(pagar).toContain("'ya-retirado'");
    expect(pagar).toContain("elsif v_p.estado <> 'pendiente_pago' then");
  });

  it("pagado_en lo escribe solo la base", () => {
    expect(funcion("pedidos_autoservicio_guard")).toContain("new.pagado_en := old.pagado_en;");
    expect(funcion("_marcar_pedido_pagado")).toContain(
      "set_config('cicalino.pedido_pagado', '1', true)",
    );
  });

  it("el tablero ve si está pago y cómo eligió pagar", () => {
    const pagina = funcion("pedidos_pagina");
    expect(pagina).toContain("'flujo', p.flujo");
    expect(pagina).toContain("'pago_caja_en', p.pago_caja_en");
    expect(pagina).toContain("'pago_mp_pendiente'");
  });
});

describe("pedidos-mostrador-qr — QR regenerado", () => {
  const estado = funcion("mostrador_qr_estado");
  const pedir = funcion("pedir_mostrador_qr");

  it("el QR viejo no inicia pedidos: pedir exige el token vigente del mismo local", () => {
    expect(pedir).toContain("where mostrador_qr_token = p_token");
    expect(pedir).toContain("'qr-vencido'");
    expect(pedir).toContain("v_s.local_id <> v_local");
    expect(sql).not.toContain("create or replace function public.mostrador_qr_actual");
    expect(sql).toContain("drop function if exists public.mostrador_qr_actual(uuid, text);");
  });

  it("quien ya pidió sigue viendo lo suyo con el QR viejo, sin poder pedir de nuevo", () => {
    expect(estado).toContain("select * into v_l from public.locales where id = v_cs.local_id;");
    expect(estado).toContain("v_vigente := false;");
    expect(estado).toContain("'qr_vigente', v_vigente");
    expect(estado).toContain("'sesion_abierta', v_vigente and");
    /* Sin credencial de ese mostrador, el token viejo no es de nadie. */
    expect(estado).toContain("if v_c.id is null or v_cs.flujo is distinct from 'mostrador_qr' then");
  });

  it("el link del pedido (destino del push) abre ese pedido aunque el QR cambie", () => {
    expect(estado).toContain("where p.qr_token = p_token and p.autoservicio and s.flujo = 'mostrador_qr';");
    expect(estado).toContain("'pedido_link', v_link");
    /* Otro teléfono con el link: solo ese pedido, sin su identidad. */
    expect(estado).toContain("if v_link and v_ped.comensal_id is distinct from v_c.id then");
    expect(estado).toContain("json_build_array(public._pedido_autoservicio_json(v_ped.id))");
    expect(estado).toContain("or p.id = v_ped.id");
    /* Desde el link no se inicia un pedido: no es el QR del local. */
    expect(pedir).toContain("where mostrador_qr_token = p_token");
  });

  it("pagar y cobrar un pedido existente no dependen del QR", () => {
    expect(funcion("pagar_pedido_autoservicio")).not.toContain("mostrador_qr_token");
    expect(funcion("cobrar_pedido_autoservicio")).not.toContain("mostrador_qr_token");
  });
});

describe("pedidos-mostrador-qr — cierre de jornada", () => {
  const pagina = funcion("pedidos_pagina");

  it("lo que quedó abierto del mostrador QR sigue en el tablero", () => {
    expect(pagina).toContain("arrastre as (");
    expect(pagina).toContain("and s.flujo = 'mostrador_qr'");
    expect(pagina).toContain("and p.creado_en < v_desde");
    expect(pagina).toContain("and p.estado in ('creado', 'en_preparacion', 'listo')");
    expect(pagina).toContain("select * from arrastre");
  });

  it("el número de hoy no cuenta los arrastrados", () => {
    expect(pagina).toMatch(/max\(nullif\(substring\(referencia from '\^\[0-9\]\+'\), ''\)::bigint\) from dia/);
  });

  it("consultar, pagar y cobrar no miran si la sesión sigue abierta", () => {
    const estado = funcion("mostrador_qr_estado");
    expect(estado).toContain("or p.estado in ('creado', 'en_preparacion', 'listo')");
    expect(funcion("pagar_pedido_autoservicio")).not.toContain("v_s.estado");
    expect(funcion("cobrar_pedido_autoservicio")).not.toMatch(/estado\s*=\s*'abierta'/);
  });
});

describe("pedidos-mostrador-qr — permisos", () => {
  it("las funciones del cliente son solo del servidor", () => {
    for (const firma of [
      "mostrador_qr_por_token(text)",
      "unirse_mostrador_qr(text, text)",
      "mostrador_qr_estado(text, uuid, text)",
      "pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${firma} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${firma} to service_role;`);
    }
  });

  it("regenerar el QR es del personal autenticado, no de anon", () => {
    expect(sql).toContain("revoke all on function public.regenerar_qr_mostrador(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.regenerar_qr_mostrador(uuid) to authenticated;");
  });
});
