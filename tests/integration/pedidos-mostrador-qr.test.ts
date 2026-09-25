/**
 * Pedidos en modalidad Mostrador QR contra las funciones y triggers REALES.
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 *
 * Mismo método que pedidos-mesa.test.ts: cada test corre dentro de una
 * transacción que termina en ROLLBACK y los usuarios se simulan como lo hace
 * PostgREST (request.jwt.claims + set role).
 *
 * Lo que fija: un QR para todo el local, cada teléfono su pedido, el pedido
 * entra al tablero sin esperar el pago, el pago (Mercado Pago o caja) va
 * aparte de la preparación y no se cobra dos veces, el QR regenerado no
 * inicia pedidos pero los que existen siguen andando (también por su propio
 * link, que es adonde lleva el push), y lo abierto cruza el cierre de jornada.
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

const MARCA = "zz-pedidos-mostrador-qr-test";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

type Json = Record<string, unknown> & { ok?: boolean; reason?: string };
type Telefono = { id: string; sesion: string; hash: string };
type Estado = Json & {
  qr_vigente: boolean;
  pedido_link: boolean;
  sesion_abierta: boolean;
  comensal: { id: string } | null;
  pedidos: { id: string; estado: string; pago: { estado: string; metodo: string } | null }[];
};
type Pagina = {
  items: {
    id: string;
    estado: string;
    flujo: string | null;
    mesa_numero: number | null;
    alias_cliente: string | null;
    total: number | null;
    pago_metodo: string | null;
    pago_caja_en: string | null;
    pago_mp_pendiente: boolean;
  }[];
  proximoNumero: number;
};

describe.skipIf(!enabled)("Integration — Pedidos en modalidad Mostrador QR", () => {
  let client: pg.Client;

  let local: string;
  let otraLocal: string;
  let admin: string;
  let otroAdmin: string;
  let token: string;
  let otroToken: string;
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
  const rpc = async <T = Json>(q: string, p: unknown[] = []): Promise<T> =>
    (await uno<{ r: T }>(q, p)).r;

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

  /* Un teléfono escanea el QR y va a pedir: su identidad, sin nombre. */
  const entrar = async (qr = token): Promise<Telefono & { r: Json }> => {
    const secreto = crypto.randomUUID();
    const r = await rpc(`select public.unirse_mostrador_qr($1, $2) r`, [qr, sha(secreto)]);
    return { id: String(r.comensal_id), sesion: String(r.sesion_id), hash: sha(secreto), r };
  };

  const pedir = (
    t: Telefono,
    items: [string, number][],
    metodo: "caja" | "mercado_pago" = "caja",
    opts: { qr?: string; nombre?: string | null } = {},
  ) =>
    rpc(`select public.pedir_mostrador_qr($1, $2, $3, $4, $5, $6, $7) r`, [
      opts.qr ?? token,
      t.id,
      t.hash,
      JSON.stringify(items.map(([n, c]) => ({ producto_id: productos[n], cantidad: c }))),
      crypto.randomUUID(),
      metodo,
      opts.nombre ?? null,
    ]);

  const estado = (qr: string, t: { id: string; hash: string } | null) =>
    rpc<Estado>(`select public.mostrador_qr_estado($1, $2, $3) r`, [
      qr,
      t?.id ?? null,
      t?.hash ?? null,
    ]);

  const fila = (id: string) =>
    uno<{
      estado: string;
      confirmado_en: string | null;
      pagado_en: string | null;
      pago_caja_en: string | null;
      qr_token: string;
      referencia: string;
    }>(
      `select estado, confirmado_en, pagado_en, pago_caja_en, qr_token, referencia
         from public.pedidos where id = $1`,
      [id],
    );

  const pagados = async (pedido: string) =>
    sql(`select id, metodo, confirmacion from public.pagos_mesa where pedido_id = $1 and estado = 'pagado'`, [
      pedido,
    ]);

  const pagina = () =>
    rpc<Pagina>(`select public.pedidos_pagina($1, now(), 'todos', '', 1, 50) r`, [local]);

  /* El personal mueve el pedido en el tablero como lo hace el panel. */
  const moverA = async (pedido: string, e: string) => {
    await como("authenticated", admin);
    await sql(`update public.pedidos set estado = $2 where id = $1`, [pedido, e]);
  };

  const conMercadoPago = async () => {
    await comoBase();
    await sql(
      `insert into public.mp_cuentas (local_id, mp_user_id, access_token_cifrado, refresh_token_cifrado, expira_en)
       values ($1, 'mp-test', 'x', 'y', now() + interval '30 days')`,
      [local],
    );
    await sql(`update public.local_cobros set acepta_mercado_pago = true where local_id = $1`, [local]);
  };

  const webhook = (pago: string, monto: number, mpId = `mp-${crypto.randomUUID().slice(0, 8)}`) =>
    rpc(`select public.mp_confirmar_pago($1, $2, $3, $4, $5, $6) r`, [
      local, pago, mpId, "approved", monto, "ARS",
    ]);

  beforeEach(async () => {
    await client.query("begin");
    await comoBase();

    const nuevaOrg = async (n: string) =>
      (
        await uno<{ id: string }>(
          `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
           values ($1, $2, true, 'active') returning id`,
          [`${MARCA} ${n}`, `${MARCA}-${n}@test.invalid`],
        )
      ).id;
    const org = await nuevaOrg("org");
    const otraOrg = await nuevaOrg("otra");
    const nuevaSucursal = async (o: string, n: string) =>
      (
        await uno<{ id: string }>(
          `insert into public.locales (organizacion_id, nombre, slug, modulo_pedidos, pedidos_modalidad)
           values ($1, $2, $3, true, 'mostrador_qr') returning id`,
          [o, n, `${MARCA}-${n}-${crypto.randomUUID().slice(0, 8)}`],
        )
      ).id;
    local = await nuevaSucursal(org, "centro");
    otraLocal = await nuevaSucursal(otraOrg, "otra");

    admin = await crearUsuario("admin", { rol: "admin", organizacion_id: org });
    otroAdmin = await crearUsuario("otro", { rol: "admin", organizacion_id: otraOrg });

    token = (
      await uno<{ t: string }>(`select mostrador_qr_token t from public.locales where id = $1`, [local])
    ).t;
    otroToken = (
      await uno<{ t: string }>(`select mostrador_qr_token t from public.locales where id = $1`, [otraLocal])
    ).t;

    const rows = await sql(
      `insert into public.productos (local_id, nombre, precio) values
         ($1, 'Café', 2500), ($1, 'Medialuna', 1200)
       returning id, nombre`,
      [local],
    );
    productos = Object.fromEntries(rows.map((r) => [r.nombre, r.id]));
    await sql(`insert into public.productos (local_id, nombre, precio) values ($1, 'Té', 2000)`, [
      otraLocal,
    ]);
    await sql(
      `insert into public.local_cobros (local_id, acepta_efectivo) values ($1, true), ($2, true)`,
      [local, otraLocal],
    );
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  it("1. QR nuevo → el pedido entra al tablero en el acto, sin mesa y con nombre opcional", async () => {
    await como("service_role", null);
    const qr = await rpc(`select public.mostrador_qr_por_token($1) r`, [token]);
    expect(qr).toMatchObject({ ok: true, local_id: local });

    const tel = await entrar();
    expect(tel.r.ok).toBe(true);
    const sesion = await uno<{ flujo: string; mesa_id: string | null; mesa_numero: number | null }>(
      `select flujo, mesa_id, mesa_numero from public.mesa_sesiones where id = $1`,
      [tel.sesion],
    );
    expect(sesion).toEqual({ flujo: "mostrador_qr", mesa_id: null, mesa_numero: null });

    const sinNombre = await pedir(tel, [["Café", 2], ["Medialuna", 1]]);
    expect(sinNombre).toMatchObject({ ok: true, total: 6200, metodo: "caja" });
    const conNombre = await pedir(tel, [["Café", 1]], "caja", { nombre: "  Sofía  " });
    expect(conNombre.ok).toBe(true);

    const a = await fila(String(sinNombre.pedido_id));
    expect(a.estado).toBe("creado");
    expect(a.confirmado_en).not.toBeNull();
    expect(a.pagado_en).toBeNull();
    expect(a.pago_caja_en).not.toBeNull();

    /* Nombre inválido: se rechaza; vacío es "sin nombre". */
    expect(await pedir(tel, [["Café", 1]], "caja", { nombre: "S" })).toMatchObject({
      ok: false,
      reason: "nombre-invalido",
    });

    await como("authenticated", admin);
    const tablero = await pagina();
    const item = tablero.items.find((i) => i.id === sinNombre.pedido_id)!;
    expect(item).toMatchObject({
      estado: "creado",
      flujo: "mostrador_qr",
      mesa_numero: null,
      alias_cliente: null,
      total: 6200,
      pago_metodo: null,
    });
    expect(item.pago_caja_en).not.toBeNull();
    expect(tablero.items.find((i) => i.id === conNombre.pedido_id)?.alias_cliente).toBe("Sofía");

    /* El personal no crea pedidos de autoservicio a mano. */
    expect(
      await rechaza(
        `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en, sesion_id, comensal_id, autoservicio)
         values ($1, '999', 'creado', gen_random_uuid()::text, now() + interval '1 day', $2, $3, true)`,
        [local, tel.sesion, tel.id],
      ),
    ).toBe(true);
  });

  it("2. Mercado Pago → el webhook registra el pago y pagado_en sin tocar la preparación", async () => {
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();
    const pedido = await pedir(tel, [["Café", 1]], "mercado_pago");
    expect(pedido.ok).toBe(true);
    const pedidoId = String(pedido.pedido_id);
    const pagoId = String(pedido.pago_id);

    /* Entró al tablero aunque todavía no pagó. */
    expect((await fila(pedidoId)).estado).toBe("creado");
    await como("authenticated", admin);
    expect((await pagina()).items.find((i) => i.id === pedidoId)?.pago_mp_pendiente).toBe(true);

    await moverA(pedidoId, "en_preparacion");

    await como("service_role", null);
    expect(await webhook(pagoId, 1, "mp-ok")).toMatchObject({ ok: false, reason: "monto-inconsistente" });
    expect(await webhook(pagoId, 2500, "mp-ok")).toMatchObject({ ok: true });
    expect(await webhook(pagoId, 2500, "mp-ok")).toMatchObject({ ok: true, repetido: true });

    const f = await fila(pedidoId);
    expect(f.estado).toBe("en_preparacion");
    expect(f.pagado_en).not.toBeNull();
    const pagos = await pagados(pedidoId);
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ metodo: "mercado_pago", confirmacion: "webhook" });

    /* pagado_en lo escribe solo la base. */
    await moverA(pedidoId, "listo");
    await sql(`update public.pedidos set pagado_en = null where id = $1`, [pedidoId]);
    await comoBase();
    expect((await fila(pedidoId)).pagado_en).not.toBeNull();

    await como("authenticated", admin);
    const item = (await pagina()).items.find((i) => i.id === pedidoId)!;
    expect(item).toMatchObject({ estado: "listo", pago_metodo: "mercado_pago", pago_mp_pendiente: false });

    /* Ya pago: no se vuelve a pagar ni a cobrar. */
    await como("service_role", null);
    expect(
      await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [
        tel.id, tel.hash, pedidoId, "mercado_pago",
      ]),
    ).toMatchObject({ ok: false, reason: "ya-pagado" });
    await como("authenticated", admin);
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pedidoId, "efectivo"])).toMatchObject(
      { ok: true, repetido: true },
    );
    expect(await pagados(pedidoId)).toHaveLength(1);
  });

  it("2b. Mercado Pago con el pedido ya listo: se paga y sigue listo", async () => {
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();
    const pedidoId = String((await pedir(tel, [["Café", 1]], "caja")).pedido_id);
    await moverA(pedidoId, "listo");

    await como("service_role", null);
    const cambio = await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [
      tel.id, tel.hash, pedidoId, "mercado_pago",
    ]);
    expect(cambio.ok).toBe(true);
    expect((await fila(pedidoId)).pago_caja_en).toBeNull();
    expect(await webhook(String(cambio.pago_id), 2500)).toMatchObject({ ok: true });

    const f = await fila(pedidoId);
    expect(f.estado).toBe("listo");
    expect(f.pagado_en).not.toBeNull();
  });

  it("3. Pagar en caja → se prepara sin pagar → listo → cobrar → retirar; el cliente no cancela", async () => {
    await como("service_role", null);
    const tel = await entrar();
    const pedidoId = String((await pedir(tel, [["Café", 1], ["Medialuna", 2]], "caja")).pedido_id);

    await moverA(pedidoId, "en_preparacion");
    expect((await fila(pedidoId)).pagado_en).toBeNull();
    await moverA(pedidoId, "listo");

    /* El cliente ve que está listo y que paga al retirar. */
    await como("service_role", null);
    const visto = await estado(token, tel);
    const suyo = visto.pedidos.find((p) => p.id === pedidoId)!;
    expect(suyo.estado).toBe("listo");
    expect(suyo.pago).toBeNull();

    /* No puede cancelarlo: eso es del personal. */
    expect(
      await rpc(`select public.cancelar_pedido_autoservicio($1, $2, $3) r`, [tel.id, tel.hash, pedidoId]),
    ).toMatchObject({ ok: false, reason: "ya-confirmado" });

    await como("authenticated", admin);
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pedidoId, "mercado_pago"])).toMatchObject(
      { ok: false, reason: "mp-solo-webhook" },
    );
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pedidoId, "efectivo"])).toMatchObject({
      ok: true,
      monto_total: 4900,
    });
    const f = await fila(pedidoId);
    expect(f.estado).toBe("listo");
    expect(f.pagado_en).not.toBeNull();
    expect(await pagados(pedidoId)).toHaveLength(1);

    await moverA(pedidoId, "retirado");
    expect((await fila(pedidoId)).estado).toBe("retirado");

    /* Retirado ya no se paga desde el teléfono. */
    await como("service_role", null);
    expect(
      await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [
        tel.id, tel.hash, pedidoId, "caja",
      ]),
    ).toMatchObject({ ok: false, reason: "ya-pagado" });
  });

  it("3b. El personal cancela: un pedido pago queda registrado para devolver", async () => {
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();
    const pedido = await pedir(tel, [["Café", 1]], "mercado_pago");
    await webhook(String(pedido.pago_id), 2500);

    await moverA(String(pedido.pedido_id), "cancelado");
    expect((await fila(String(pedido.pedido_id))).estado).toBe("cancelado");
    await comoBase();
    const evento = await sql(
      `select 1 from public.mesa_eventos where pedido_id = $1 and tipo = 'pedido_cancelado_con_pago'`,
      [pedido.pedido_id],
    );
    expect(evento).toHaveLength(1);
  });

  it("4. Regenerar el QR: el viejo no inicia pedidos, los existentes siguen andando", async () => {
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();
    const pedidoId = String((await pedir(tel, [["Café", 1]], "caja")).pedido_id);

    /* El token no se toca a mano, ni siquiera el encargado. */
    await como("authenticated", admin);
    expect(
      await rechaza(`update public.locales set mostrador_qr_token = gen_random_uuid()::text where id = $1`, [local]),
    ).toBe(true);
    expect(await rechaza(`select public.regenerar_qr_mostrador($1)`, [otraLocal])).toBe(true);

    const regen = await rpc(`select public.regenerar_qr_mostrador($1) r`, [local]);
    expect(regen.ok).toBe(true);
    const nuevo = String(regen.qr_token);
    expect(nuevo).not.toBe(token);

    await como("service_role", null);
    /* QR viejo: nadie nuevo entra, y el que ya tiene identidad no pide. */
    expect(await rpc(`select public.mostrador_qr_por_token($1) r`, [token])).toMatchObject({
      ok: false,
      reason: "not-found",
    });
    expect((await entrar(token)).r).toMatchObject({ ok: false, reason: "not-found" });
    expect(await pedir(tel, [["Café", 1]], "caja", { qr: token })).toMatchObject({
      ok: false,
      reason: "qr-vencido",
    });
    expect(await estado(token, null)).toMatchObject({ ok: false, reason: "not-found" });

    /* ...pero sigue viendo y pagando lo suyo. */
    const viejo = await estado(token, tel);
    expect(viejo).toMatchObject({ ok: true, qr_vigente: false, pedido_link: false, sesion_abierta: false });
    expect(viejo.pedidos.map((p) => p.id)).toContain(pedidoId);
    const cambio = await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [
      tel.id, tel.hash, pedidoId, "mercado_pago",
    ]);
    expect(cambio.ok).toBe(true);
    expect(await webhook(String(cambio.pago_id), 2500)).toMatchObject({ ok: true });

    /* Y el personal lo mueve y lo retira como siempre. */
    await moverA(pedidoId, "listo");
    await moverA(pedidoId, "retirado");
    expect((await fila(pedidoId)).estado).toBe("retirado");

    /* QR nuevo: pedidos nuevos, para el mismo teléfono y para uno nuevo. */
    await como("service_role", null);
    expect(await pedir(tel, [["Café", 1]], "caja", { qr: nuevo })).toMatchObject({ ok: true });
    const otro = await entrar(nuevo);
    expect(otro.r.ok).toBe(true);
    expect(await pedir(otro, [["Medialuna", 1]], "caja", { qr: nuevo })).toMatchObject({ ok: true });
    expect(await estado(nuevo, tel)).toMatchObject({ qr_vigente: true, sesion_abierta: true });
  });

  it("5. El link del pedido (destino del push) lo abre aunque el QR se haya regenerado", async () => {
    await como("service_role", null);
    const tel = await entrar();
    const pedidoId = String((await pedir(tel, [["Café", 1]], "caja")).pedido_id);
    const link = (await fila(pedidoId)).qr_token;
    await moverA(pedidoId, "listo");

    await como("authenticated", admin);
    await rpc(`select public.regenerar_qr_mostrador($1) r`, [local]);

    await como("service_role", null);
    /* El teléfono que pidió: su pedido, con su identidad. */
    const propio = await estado(link, tel);
    expect(propio).toMatchObject({ ok: true, pedido_link: true, qr_vigente: false, sesion_abierta: false });
    expect(propio.comensal?.id).toBe(tel.id);
    expect(propio.pedidos.find((p) => p.id === pedidoId)?.estado).toBe("listo");

    /* Sin cookie: ese pedido, para mirar. */
    const anonimo = await estado(link, null);
    expect(anonimo.comensal).toBeNull();
    expect(anonimo.pedidos.map((p) => p.id)).toEqual([pedidoId]);

    /* Otro teléfono con el link: ese pedido y nada suyo. */
    const otro = await entrar(
      (await uno<{ t: string }>(`select mostrador_qr_token t from public.locales where id = $1`, [local])).t,
    );
    const ajeno = await estado(link, otro);
    expect(ajeno.comensal).toBeNull();
    expect(ajeno.pedidos.map((p) => p.id)).toEqual([pedidoId]);

    /* El link no inicia pedidos. */
    expect(await pedir(tel, [["Café", 1]], "caja", { qr: link })).toMatchObject({
      ok: false,
      reason: "qr-vencido",
    });
  });

  it("6. Dos teléfonos con el mismo QR → dos pedidos independientes", async () => {
    await como("service_role", null);
    const a = await entrar();
    const b = await entrar();
    expect(a.sesion).not.toBe(b.sesion);
    expect(a.id).not.toBe(b.id);

    const pa = await pedir(a, [["Café", 1]]);
    const pb = await pedir(b, [["Medialuna", 3]]);
    expect(pa.pedido_id).not.toBe(pb.pedido_id);
    expect(Number(pb.referencia)).toBe(Number(pa.referencia) + 1);

    const va = await estado(token, a);
    const vb = await estado(token, b);
    expect(va.pedidos.map((p) => p.id)).toEqual([pa.pedido_id]);
    expect(vb.pedidos.map((p) => p.id)).toEqual([pb.pedido_id]);

    /* Uno no paga el del otro. */
    expect(
      await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [
        b.id, b.hash, pa.pedido_id, "caja",
      ]),
    ).toMatchObject({ ok: false, reason: "not-found" });
  });

  it("7. Un QR o una identidad de otro local se rechazan", async () => {
    await como("service_role", null);
    const tel = await entrar();
    await pedir(tel, [["Café", 1]]);

    /* La identidad del local A con el QR vigente del local B: no pide. */
    expect(await pedir(tel, [["Café", 1]], "caja", { qr: otroToken })).toMatchObject({
      ok: false,
      reason: "comensal-invalido",
    });
    /* Ni ve sus pedidos por el QR de B. */
    const enOtro = await estado(otroToken, tel);
    expect(enOtro.comensal).toBeNull();
    expect(enOtro.pedidos).toEqual([]);

    /* Un producto de otro local tampoco entra al carrito. */
    const deB = await uno<{ id: string }>(`select id from public.productos where local_id = $1`, [otraLocal]);
    expect(
      await rpc(`select public.pedir_mostrador_qr($1, $2, $3, $4, $5, $6, $7) r`, [
        token, tel.id, tel.hash,
        JSON.stringify([{ producto_id: deB.id, cantidad: 1 }]),
        crypto.randomUUID(), "caja", null,
      ]),
    ).toMatchObject({ ok: false, reason: "items-invalidos" });

    /* Un token que no es de nadie. */
    expect((await entrar(crypto.randomUUID())).r).toMatchObject({ ok: false, reason: "not-found" });

    /* La caja de otra empresa no ve ni cobra. */
    const pedidoId = String((await pedir(tel, [["Café", 1]])).pedido_id);
    await como("authenticated", otroAdmin);
    expect(await rechaza(`select public.cobrar_pedido_autoservicio($1, $2)`, [pedidoId, "efectivo"])).toBe(true);
    expect(await rechaza(`select public.pedidos_pagina($1, now(), 'todos', '', 1, 20)`, [local])).toBe(true);
  });

  it("8. Listo sin cobrar cruza el cierre de jornada: visible, cobrable y retirable", async () => {
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();
    const pedidoId = String((await pedir(tel, [["Café", 1]], "caja")).pedido_id);
    /* Uno con el checkout de Mercado Pago abierto, para ver que el cierre lo suelta. */
    const conMp = await pedir(tel, [["Medialuna", 1]], "mercado_pago");
    await moverA(pedidoId, "listo");

    /* Ayer: el pedido y la sesión quedan antes del inicio de la jornada, y el
     * cierre hace lo que hace el barrido de jornada. */
    await comoBase();
    await sql(
      `update public.pedidos
          set creado_en = now() - interval '3 days',
              qr_expira_en = now() - interval '2 days'
        where id = any($1::uuid[])`,
      [[pedidoId, conMp.pedido_id]],
    );
    await sql(`select public._cerrar_sesion($1, 'jornada-cerrada')`, [tel.sesion]);
    expect(
      (await uno<{ estado: string }>(`select estado from public.mesa_sesiones where id = $1`, [tel.sesion])).estado,
    ).toBe("cerrada");
    expect(
      (await uno<{ estado: string }>(`select estado from public.pagos_mesa where id = $1`, [conMp.pago_id])).estado,
    ).toBe("cancelado");
    expect((await fila(pedidoId)).estado).toBe("listo");

    /* El tablero lo sigue mostrando, sin correr el número de hoy. */
    await como("authenticated", admin);
    const tablero = await pagina();
    expect(tablero.items.map((i) => i.id)).toContain(pedidoId);
    expect(tablero.proximoNumero).toBe(1);

    /* El cliente lo sigue viendo y puede pagarlo por Mercado Pago. */
    await como("service_role", null);
    const visto = await estado(token, tel);
    expect(visto.pedidos.map((p) => p.id)).toContain(pedidoId);
    expect(visto.sesion_abierta).toBe(false);
    const reintento = await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [
      tel.id, tel.hash, conMp.pedido_id, "mercado_pago",
    ]);
    expect(reintento.ok).toBe(true);

    /* La caja lo cobra y lo retira. */
    await como("authenticated", admin);
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pedidoId, "efectivo"])).toMatchObject({
      ok: true,
    });
    expect((await fila(pedidoId)).pagado_en).not.toBeNull();
    await moverA(pedidoId, "retirado");
    expect((await fila(pedidoId)).estado).toBe("retirado");

    /* Retirado, ya no se arrastra. */
    expect((await pagina()).items.map((i) => i.id)).not.toContain(pedidoId);

    /* Y el teléfono pide hoy con una identidad nueva (la vieja cerró). */
    await como("service_role", null);
    expect(await pedir(tel, [["Café", 1]])).toMatchObject({ ok: false, reason: "mesa-cerrada" });
    const hoy = await entrar();
    expect(await pedir(hoy, [["Café", 1]])).toMatchObject({ ok: true, referencia: "1" });
  });

  it("10. Métodos de pago: caja solo con un método presencial, MP solo si está conectado", async () => {
    const cobros = async (campos: Record<string, boolean>) => {
      await comoBase();
      const sets = Object.entries(campos)
        .map(([k, v]) => `${k} = ${v}`)
        .join(", ");
      await sql(`update public.local_cobros set ${sets} where local_id = $1`, [local]);
    };
    const nada = {
      acepta_efectivo: false,
      acepta_debito: false,
      acepta_credito: false,
      acepta_transferencia: false,
      acepta_qr_mercado_pago: false,
      acepta_mercado_pago: false,
    };

    /* Solo Efectivo: caja sí, Mercado Pago no. */
    await cobros({ ...nada, acepta_efectivo: true });
    await como("service_role", null);
    const tel = await entrar();
    expect(await pedir(tel, [["Café", 1]], "caja")).toMatchObject({ ok: true });
    expect(await pedir(tel, [["Café", 1]], "mercado_pago")).toMatchObject({
      ok: false,
      reason: "metodo-no-disponible",
    });

    /* Solo Mercado Pago (conectado): caja no, Mercado Pago sí. */
    await conMercadoPago();
    await cobros({ ...nada, acepta_mercado_pago: true });
    await como("service_role", null);
    expect(await pedir(tel, [["Café", 1]], "caja")).toMatchObject({
      ok: false,
      reason: "metodo-no-disponible",
    });
    const conMp = await pedir(tel, [["Café", 1]], "mercado_pago");
    expect(conMp.ok).toBe(true);
    /* Tampoco se puede pasar a caja después. */
    expect(
      await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [
        tel.id, tel.hash, conMp.pedido_id, "caja",
      ]),
    ).toMatchObject({ ok: false, reason: "metodo-no-disponible" });

    /* Un método presencial cualquiera (débito) vuelve a habilitar la caja. */
    await cobros({ ...nada, acepta_debito: true });
    await como("service_role", null);
    expect(await pedir(tel, [["Café", 1]], "caja")).toMatchObject({ ok: true });

    /* Ninguno: no se abre identidad ni se pide; lo que ya existe se sigue viendo. */
    await cobros(nada);
    await como("service_role", null);
    expect((await entrar()).r).toMatchObject({ ok: false, reason: "sin-metodos" });
    expect(await pedir(tel, [["Café", 1]], "caja")).toMatchObject({ ok: false, reason: "sin-metodos" });
    expect((await estado(token, tel)).pedidos.length).toBeGreaterThan(0);
  });

  it("11. No se activa Mostrador QR sin métodos de pago", async () => {
    await comoBase();
    await sql(`update public.locales set pedidos_modalidad = 'mostrador' where id = $1`, [otraLocal]);
    await sql(
      `update public.local_cobros
          set acepta_efectivo = false, acepta_debito = false, acepta_credito = false,
              acepta_transferencia = false, acepta_qr_mercado_pago = false, acepta_mercado_pago = false
        where local_id = $1`,
      [otraLocal],
    );
    await como("authenticated", otroAdmin);
    expect(
      await rechaza(`update public.locales set pedidos_modalidad = 'mostrador_qr' where id = $1`, [otraLocal]),
    ).toBe(true);

    /* Con Efectivo, sí. */
    await comoBase();
    await sql(`update public.local_cobros set acepta_efectivo = true where local_id = $1`, [otraLocal]);
    await como("authenticated", otroAdmin);
    expect(
      await rechaza(`update public.locales set pedidos_modalidad = 'mostrador_qr' where id = $1`, [otraLocal]),
    ).toBe(false);

    /* Un local sin fila de cobros usa los de siempre (Efectivo incluido). */
    await comoBase();
    await sql(`delete from public.local_cobros where local_id = $1`, [otraLocal]);
    await sql(`update public.locales set pedidos_modalidad = 'mostrador' where id = $1`, [otraLocal]);
    await como("authenticated", otroAdmin);
    expect(
      await rechaza(`update public.locales set pedidos_modalidad = 'mostrador_qr' where id = $1`, [otraLocal]),
    ).toBe(false);
  });

  it("9. Mercado Pago + cobro en caja: nunca dos cobros", async () => {
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();

    /* La caja primero, el webhook después: excedente para devolver. */
    const a = await pedir(tel, [["Café", 1]], "mercado_pago");
    await como("authenticated", admin);
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [a.pedido_id, "efectivo"])).toMatchObject(
      { ok: true },
    );
    await como("service_role", null);
    expect(await webhook(String(a.pago_id), 2500)).toMatchObject({ ok: true, excedente: true });
    const pa = await pagados(String(a.pedido_id));
    expect(pa).toHaveLength(1);
    expect(pa[0]!.metodo).toBe("efectivo");

    /* El webhook primero, la caja después: la caja no cobra de nuevo. */
    const b = await pedir(tel, [["Medialuna", 1]], "mercado_pago");
    expect(await webhook(String(b.pago_id), 1200)).toMatchObject({ ok: true });
    await como("authenticated", admin);
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [b.pedido_id, "efectivo"])).toMatchObject(
      { ok: true, repetido: true },
    );
    const pb = await pagados(String(b.pedido_id));
    expect(pb).toHaveLength(1);
    expect(pb[0]!.metodo).toBe("mercado_pago");

    /* Pasó a caja con el checkout abierto y Mercado Pago lo aprueba igual
     * (nadie cobró): ese pago vale, una sola vez. */
    await como("service_role", null);
    const c = await pedir(tel, [["Café", 1]], "mercado_pago");
    await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [tel.id, tel.hash, c.pedido_id, "caja"]);
    expect(await webhook(String(c.pago_id), 2500)).toMatchObject({ ok: true });
    await como("authenticated", admin);
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [c.pedido_id, "efectivo"])).toMatchObject(
      { ok: true, repetido: true },
    );
    expect(await pagados(String(c.pedido_id))).toHaveLength(1);

    /* Y la base no deja dos cobros vivos del mismo pedido, venga de donde venga. */
    await comoBase();
    expect(
      await rechaza(
        `insert into public.pagos_mesa (local_id, sesion_id, pedido_id, pagador_nombre, modo, monto_base, metodo, estado, creado_por)
         select local_id, sesion_id, id, 'x', 'uno', 2500, 'efectivo', 'pagado', 'personal'
           from public.pedidos where id = $1`,
        [c.pedido_id],
      ),
    ).toBe(true);
  });
});
