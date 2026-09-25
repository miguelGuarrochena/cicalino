/**
 * Pedidos en modalidad Mesa contra las funciones y triggers REALES.
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 *
 * Mismo método que split-payments.test.ts: cada test corre dentro de una
 * transacción que termina en ROLLBACK y los usuarios se simulan como lo hace
 * PostgREST (request.jwt.claims + set role).
 *
 * Lo que fija: un pedido sin pagar no entra a preparación por ningún camino,
 * el importe lo calcula la base, Mercado Pago confirma solo por el webhook,
 * la caja confirma cobrando, y las funciones de la cuenta compartida no
 * pueden operar sobre una mesa de autoservicio.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const enabled = process.env.RUN_DB_CHECKS === "1";

const loadEnvLocal = () => {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i);
    const v = line.slice(i + 1).replace(/^"|"$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
};

const MARCA = "zz-pedidos-mesa-test";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

type Json = Record<string, unknown> & { ok?: boolean; reason?: string };

describe.skipIf(!enabled)("Integration — Pedidos en modalidad Mesa", () => {
  let client: pg.Client;

  let org: string;
  let local: string;
  let otraLocal: string;
  let admin: string;
  let otroAdmin: string;
  let mesaToken: string;
  let productos: Record<string, string>;

  beforeAll(async () => {
    loadEnvLocal();
    if (!process.env.DATABASE_URL) throw new Error("RUN_DB_CHECKS=1 requiere DATABASE_URL");
    client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false },
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  const sql = async (q: string, p: unknown[] = []) => (await client.query(q, p)).rows;
  const uno = async <T>(q: string, p: unknown[] = []): Promise<T> => (await sql(q, p))[0] as T;
  const rpc = async (q: string, p: unknown[] = []): Promise<Json> =>
    (await uno<{ r: Json }>(q, p)).r;

  const crearUsuario = async (etiqueta: string, meta: Record<string, string>) =>
    (
      await uno<{ id: string }>(
        `insert into auth.users (id, email, invited_at, raw_user_meta_data)
         values (gen_random_uuid(), $1, now(), $2::jsonb) returning id`,
        [`${MARCA}-${etiqueta}@test.invalid`, JSON.stringify(meta)],
      )
    ).id;

  const como = async (role: "authenticated" | "service_role", sub: string | null) => {
    await client.query("reset role");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role }),
    ]);
    await client.query(`set local role ${role}`);
  };
  const comoBase = async () => client.query("reset role");

  const rechaza = async (q: string, p: unknown[] = []): Promise<boolean> => {
    await client.query("savepoint intento");
    try {
      await client.query(q, p);
      await client.query("release savepoint intento");
      return false;
    } catch {
      await client.query("rollback to savepoint intento");
      return true;
    }
  };

  const entrar = async (nombre: string) => {
    const secreto = `${nombre}-${crypto.randomUUID()}`;
    const r = await rpc(`select public.unirse_mesa_autoservicio($1, $2, $3) r`, [
      mesaToken,
      nombre,
      sha(secreto),
    ]);
    return { id: String(r.comensal_id), sesion: String(r.sesion_id), hash: sha(secreto), r };
  };

  const pedir = (
    g: { id: string; hash: string },
    items: [string, number][],
    metodo: "caja" | "mercado_pago" = "caja",
  ) =>
    rpc(`select public.pedir_autoservicio($1, $2, $3, $4, $5) r`, [
      g.id,
      g.hash,
      JSON.stringify(items.map(([n, c]) => ({ producto_id: productos[n], cantidad: c }))),
      crypto.randomUUID(),
      metodo,
    ]);

  const estadoPedido = async (id: string) =>
    uno<{ estado: string; confirmado_en: string | null; autoservicio: boolean }>(
      `select estado, confirmado_en, autoservicio from public.pedidos where id = $1`,
      [id],
    );

  beforeEach(async () => {
    await client.query("begin");
    await comoBase();

    org = (
      await uno<{ id: string }>(
        `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
         values ($1, $2, true, 'active') returning id`,
        [`${MARCA} org`, `${MARCA}-org@test.invalid`],
      )
    ).id;
    const otraOrg = (
      await uno<{ id: string }>(
        `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
         values ($1, $2, true, 'active') returning id`,
        [`${MARCA} otra`, `${MARCA}-otra@test.invalid`],
      )
    ).id;
    /* Mesa sola (sin mostrador): pedidos-modalidades-combinables.sql. */
    const nuevaSucursal = async (o: string, n: string) =>
      (
        await uno<{ id: string }>(
          `insert into public.locales (organizacion_id, nombre, slug, modulo_pedidos, pedidos_modalidad, pedidos_mesa)
           values ($1, $2, $3, true, 'sin_mostrador', true) returning id`,
          [o, n, `${MARCA}-${n}-${crypto.randomUUID().slice(0, 8)}`],
        )
      ).id;
    local = await nuevaSucursal(org, "centro");
    otraLocal = await nuevaSucursal(otraOrg, "otra");

    admin = await crearUsuario("admin", { rol: "admin", organizacion_id: org });
    otroAdmin = await crearUsuario("otro", { rol: "admin", organizacion_id: otraOrg });

    await sql(`insert into public.mesas (local_id, numero) values ($1, 4)`, [local]);
    mesaToken = (
      await uno<{ t: string }>(`select qr_token t from public.mesas where local_id = $1`, [local])
    ).t;

    const rows = await sql(
      `insert into public.productos (local_id, nombre, precio) values
         ($1, 'Milanesa', 9000), ($1, 'Agua', 1500)
       returning id, nombre`,
      [local],
    );
    productos = Object.fromEntries(rows.map((r) => [r.nombre, r.id]));
    await sql(
      `insert into public.local_cobros (local_id, acepta_efectivo) values ($1, true)`,
      [local],
    );
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  it("el pedido nace esperando el pago, con su número de la jornada y el total de la carta", async () => {
    await como("service_role", null);
    const sofia = await entrar("Sofía");
    expect(sofia.r.ok).toBe(true);

    const pedido = await pedir(sofia, [["Milanesa", 1], ["Agua", 2]]);
    expect(pedido).toMatchObject({ ok: true, total: 12000, metodo: "caja" });
    expect(String(pedido.referencia)).toMatch(/^\d+$/);

    const fila = await estadoPedido(String(pedido.pedido_id));
    expect(fila).toMatchObject({ estado: "pendiente_pago", autoservicio: true, confirmado_en: null });

    /* El QR del local dice a qué flujo lleva. */
    const qr = await rpc(`select public.mesa_por_qr($1) r`, [mesaToken]);
    expect(qr).toMatchObject({ ok: true, flujo: "autoservicio", mesa_numero: 4 });
  });

  it("sin cobro no entra a preparación por ningún camino", async () => {
    await como("service_role", null);
    const sofia = await entrar("Sofía");
    const pedido = String((await pedir(sofia, [["Milanesa", 1]])).pedido_id);

    await comoBase();
    expect(await rechaza(`update public.pedidos set estado = 'creado' where id = $1`, [pedido])).toBe(true);
    expect(await rechaza(`update public.pedidos set estado = 'listo' where id = $1`, [pedido])).toBe(true);
    expect(await rechaza(`update public.pedidos set estado = 'en_preparacion' where id = $1`, [pedido])).toBe(true);

    /* Un cobro pendiente tampoco alcanza: tiene que estar pagado. */
    await sql(
      `insert into public.pagos_mesa (local_id, sesion_id, pedido_id, pagador_nombre, modo, monto_base, metodo, estado, creado_por)
       select local_id, sesion_id, id, 'Sofía', 'uno', 9000, 'efectivo', 'pendiente', 'personal'
         from public.pedidos where id = $1`,
      [pedido],
    );
    expect(await rechaza(`update public.pedidos set estado = 'creado' where id = $1`, [pedido])).toBe(true);
    expect((await estadoPedido(pedido)).estado).toBe("pendiente_pago");

    /* El barrido automático tampoco lo levanta. */
    await sql(`select public.marcar_en_preparacion_pendientes()`);
    expect((await estadoPedido(pedido)).estado).toBe("pendiente_pago");
  });

  it("cobrar en caja lo confirma, es idempotente y queda quién cobró", async () => {
    await como("service_role", null);
    const sofia = await entrar("Sofía");
    const pedido = String((await pedir(sofia, [["Milanesa", 1], ["Agua", 1]])).pedido_id);

    await como("authenticated", admin);
    const porCobrar = (await rpc(`select public.pedidos_por_cobrar($1) r`, [local])) as unknown as {
      id: string;
      total: number;
      mesa_numero: number;
      pago_caja_en: string | null;
    }[];
    expect(porCobrar).toHaveLength(1);
    expect(porCobrar[0]).toMatchObject({ id: pedido, total: 10500, mesa_numero: 4 });
    expect(porCobrar[0]!.pago_caja_en).not.toBeNull();

    const cobro = await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pedido, "efectivo"]);
    expect(cobro).toMatchObject({ ok: true, monto_total: 10500 });

    const fila = await estadoPedido(pedido);
    expect(fila.estado).toBe("creado");
    expect(fila.confirmado_en).not.toBeNull();

    const pago = await uno<{ estado: string; confirmacion: string; metodo: string }>(
      `select estado, confirmacion, metodo from public.pagos_mesa where pedido_id = $1`,
      [pedido],
    );
    expect(pago).toMatchObject({ estado: "pagado", confirmacion: "manual", metodo: "efectivo" });

    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pedido, "efectivo"])).toMatchObject({
      ok: true,
      repetido: true,
    });

    /* Ya cobrado, no queda nada en la bandeja. */
    expect((await rpc(`select public.pedidos_por_cobrar($1) r`, [local])) as unknown as unknown[]).toHaveLength(0);
  });

  it("la caja de otra empresa no ve ni cobra estos pedidos", async () => {
    await como("service_role", null);
    const sofia = await entrar("Sofía");
    const pedido = String((await pedir(sofia, [["Milanesa", 1]])).pedido_id);

    await como("authenticated", otroAdmin);
    expect(await rechaza(`select public.pedidos_por_cobrar($1)`, [local])).toBe(true);
    expect(await rechaza(`select public.cobrar_pedido_autoservicio($1, $2)`, [pedido, "efectivo"])).toBe(true);
    expect(await rechaza(`select public.pedidos_por_cobrar($1)`, [otraLocal])).toBe(false);
  });

  it("Mercado Pago: confirma el webhook, valida el monto y no cobra dos veces", async () => {
    await comoBase();
    await sql(
      `insert into public.mp_cuentas (local_id, mp_user_id, access_token_cifrado, refresh_token_cifrado, expira_en)
       values ($1, 'mp-test', 'x', 'y', now() + interval '30 days')`,
      [local],
    );
    await sql(`update public.local_cobros set acepta_mercado_pago = true where local_id = $1`, [local]);

    await como("service_role", null);
    const sofia = await entrar("Sofía");
    const pedido = await pedir(sofia, [["Milanesa", 1]], "mercado_pago");
    expect(pedido.ok).toBe(true);
    const pagoId = String(pedido.pago_id);
    expect(pagoId).not.toBe("null");

    /* Un monto distinto no confirma nada. */
    expect(
      await rpc(`select public.mp_confirmar_pago($1, $2, $3, $4, $5, $6) r`, [
        local, pagoId, "mp-1", "approved", 1, "ARS",
      ]),
    ).toMatchObject({ ok: false, reason: "monto-inconsistente" });
    expect((await estadoPedido(String(pedido.pedido_id))).estado).toBe("pendiente_pago");

    /* El aviso bueno confirma el cobro y manda el pedido a preparación. */
    expect(
      await rpc(`select public.mp_confirmar_pago($1, $2, $3, $4, $5, $6) r`, [
        local, pagoId, "mp-1", "approved", 9000, "ARS",
      ]),
    ).toMatchObject({ ok: true });
    expect((await estadoPedido(String(pedido.pedido_id))).estado).toBe("creado");
    const pago = await uno<{ estado: string; confirmacion: string }>(
      `select estado, confirmacion from public.pagos_mesa where id = $1`,
      [pagoId],
    );
    expect(pago).toMatchObject({ estado: "pagado", confirmacion: "webhook" });

    /* Mercado Pago reintenta: no duplica. */
    expect(
      await rpc(`select public.mp_confirmar_pago($1, $2, $3, $4, $5, $6) r`, [
        local, pagoId, "mp-1", "approved", 9000, "ARS",
      ]),
    ).toMatchObject({ ok: true, repetido: true });
  });

  it("una aprobación tardía sobre un pedido cancelado queda como excedente", async () => {
    await comoBase();
    await sql(
      `insert into public.mp_cuentas (local_id, mp_user_id, access_token_cifrado, refresh_token_cifrado, expira_en)
       values ($1, 'mp-test', 'x', 'y', now() + interval '30 days')`,
      [local],
    );
    await sql(`update public.local_cobros set acepta_mercado_pago = true where local_id = $1`, [local]);

    await como("service_role", null);
    const sofia = await entrar("Sofía");
    const pedido = await pedir(sofia, [["Milanesa", 1]], "mercado_pago");
    const pagoId = String(pedido.pago_id);

    expect(
      await rpc(`select public.cancelar_pedido_autoservicio($1, $2, $3) r`, [
        sofia.id, sofia.hash, pedido.pedido_id,
      ]),
    ).toMatchObject({ ok: true });
    /* Cancelar suelta el checkout. */
    expect(
      (await uno<{ estado: string }>(`select estado from public.pagos_mesa where id = $1`, [pagoId])).estado,
    ).toBe("cancelado");

    expect(
      await rpc(`select public.mp_confirmar_pago($1, $2, $3, $4, $5, $6) r`, [
        local, pagoId, "mp-2", "approved", 9000, "ARS",
      ]),
    ).toMatchObject({ ok: true, excedente: true });
    expect((await estadoPedido(String(pedido.pedido_id))).estado).toBe("cancelado");
    expect(
      (await uno<{ mp_estado: string }>(`select mp_estado from public.pagos_mesa where id = $1`, [pagoId]))
        .mp_estado,
    ).toBe("excedente");
  });

  it("el cliente cancela mientras no pagó, y después ya no", async () => {
    await como("service_role", null);
    const sofia = await entrar("Sofía");
    const pedido = String((await pedir(sofia, [["Milanesa", 1]])).pedido_id);

    await como("authenticated", admin);
    await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pedido, "efectivo"]);

    await como("service_role", null);
    expect(
      await rpc(`select public.cancelar_pedido_autoservicio($1, $2, $3) r`, [sofia.id, sofia.hash, pedido]),
    ).toMatchObject({ ok: false, reason: "ya-confirmado" });
    expect((await estadoPedido(pedido)).estado).toBe("creado");

    /* Y el pedido de otro teléfono no es suyo. */
    const otro = await entrar("Bruno");
    expect(
      await rpc(`select public.cancelar_pedido_autoservicio($1, $2, $3) r`, [otro.id, otro.hash, pedido]),
    ).toMatchObject({ ok: false, reason: "not-found" });
  });

  it("la cuenta compartida de Pagos no se puede usar en una mesa de autoservicio", async () => {
    await comoBase();
    await sql(`update public.locales set modulo_pagos = true where id = $1`, [local]);
    await sql(`update public.mesas set qr_activo = true where local_id = $1`, [local]);

    await como("service_role", null);
    const sofia = await entrar("Sofía");
    await pedir(sofia, [["Milanesa", 1]]);

    /* Unirse a la cuenta compartida: no está disponible en esta modalidad. */
    expect(
      await rpc(`select public.unirse_mesa($1, $2, $3) r`, [mesaToken, "Colado", sha("x".repeat(20))]),
    ).toMatchObject({ ok: false, reason: "not-available" });

    /* Y con una credencial válida de la mesa, tampoco se cuelan los pedidos ni
     * los pagos de la cuenta compartida. */
    expect(
      await rechaza(`select public.pedir_como_comensal($1, $2, $3, $4)`, [
        sofia.id,
        sofia.hash,
        JSON.stringify([{ producto_id: productos.Milanesa, cantidad: 1 }]),
        crypto.randomUUID(),
      ]),
    ).toBe(true);
    expect(
      await rechaza(`select public.pagar_como_comensal($1, $2, $3)`, [
        sofia.id,
        sofia.hash,
        JSON.stringify({ clave: crypto.randomUUID(), modo: "uno", metodo: "efectivo" }),
      ]),
    ).toBe(true);

    /* El piso de Pagos no muestra esta mesa. */
    await como("authenticated", admin);
    const piso = (await rpc(`select public.mesas_cuentas($1) r`, [local])) as unknown as unknown[];
    expect(piso).toHaveLength(0);
  });

  it("el tablero muestra el pedido pago con su mesa y sus ítems, y no el que espera", async () => {
    await como("service_role", null);
    const sofia = await entrar("Sofía");
    const esperando = String((await pedir(sofia, [["Agua", 1]])).pedido_id);
    const pagado = String((await pedir(sofia, [["Milanesa", 1]])).pedido_id);

    await como("authenticated", admin);
    await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pagado, "efectivo"]);

    const pagina = (await rpc(`select public.pedidos_pagina($1, now(), 'todos', '', 1, 20) r`, [
      local,
    ])) as unknown as {
      items: { id: string; mesa_numero: number | null; items: { nombre: string }[] | null; total: number | null }[];
      conteos: { todos: number };
    };
    const ids = pagina.items.map((i) => i.id);
    expect(ids).toContain(pagado);
    expect(ids).not.toContain(esperando);
    const fila = pagina.items.find((i) => i.id === pagado)!;
    expect(fila.mesa_numero).toBe(4);
    expect(fila.total).toBe(9000);
    expect(fila.items?.[0]?.nombre).toBe("Milanesa");
  });

  it("el cierre de la jornada cancela lo que nadie pagó", async () => {
    await como("service_role", null);
    const sofia = await entrar("Sofía");
    const pedido = String((await pedir(sofia, [["Milanesa", 1]])).pedido_id);

    await comoBase();
    await sql(`select public._cerrar_sesion($1, 'jornada-cerrada')`, [sofia.sesion]);

    expect((await estadoPedido(pedido)).estado).toBe("cancelado");
    expect(
      (await uno<{ estado: string }>(`select estado from public.mesa_sesiones where id = $1`, [sofia.sesion]))
        .estado,
    ).toBe("cerrada");
  });
});
