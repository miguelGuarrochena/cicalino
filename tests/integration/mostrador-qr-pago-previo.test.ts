/**
 * Mostrador QR con "Requerir pago antes de preparar" contra las funciones y
 * triggers REALES (supabase/mostrador-qr-pago-previo.sql).
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 *
 * Mismo método que pedidos-mostrador-qr.test.ts: cada test corre dentro de
 * una transacción que termina en ROLLBACK y los usuarios se simulan como lo
 * hace PostgREST (request.jwt.claims + set role).
 *
 * Lo que fija: apagada, nada cambia; prendida, el pedido nace en
 * pendiente_pago, no entra al tablero, y pasa a creado solo con un pago
 * confirmado (Mercado Pago o caja). Mientras espera el pago el cliente lo
 * puede cancelar; cancelado (por él o por el cierre de jornada) un pago
 * tardío no lo revive. Lo que ya espera el pago se confirma aunque el dueño
 * apague la opción.
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

const MARCA = "zz-mostrador-qr-pago-previo-test";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

type Json = Record<string, unknown> & { ok?: boolean; reason?: string };
type Telefono = { id: string; sesion: string; hash: string };
type Pagina = { items: { id: string; estado: string }[] };

describe.skipIf(!enabled)("Integration — Mostrador QR con pago previo", () => {
  let client: pg.Client;

  let local: string;
  let admin: string;
  let token: string;
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

  const entrar = async (): Promise<Telefono> => {
    const secreto = crypto.randomUUID();
    const r = await rpc(`select public.unirse_mostrador_qr($1, $2) r`, [token, sha(secreto)]);
    return { id: String(r.comensal_id), sesion: String(r.sesion_id), hash: sha(secreto) };
  };

  const pedir = (t: Telefono, items: [string, number][], metodo: "caja" | "mercado_pago" = "caja") =>
    rpc(`select public.pedir_mostrador_qr($1, $2, $3, $4, $5, $6, $7) r`, [
      token,
      t.id,
      t.hash,
      JSON.stringify(items.map(([n, c]) => ({ producto_id: productos[n], cantidad: c }))),
      crypto.randomUUID(),
      metodo,
      null,
    ]);

  const fila = (id: string) =>
    uno<{ estado: string; confirmado_en: string | null; pagado_en: string | null }>(
      `select estado, confirmado_en, pagado_en from public.pedidos where id = $1`,
      [id],
    );

  const pagoEstado = async (pago: string) =>
    (await uno<{ estado: string; mp_estado: string | null }>(
      `select estado, mp_estado from public.pagos_mesa where id = $1`,
      [pago],
    ));

  const pagina = () =>
    rpc<Pagina>(`select public.pedidos_pagina($1, now(), 'todos', '', 1, 50) r`, [local]);

  const porCobrar = () =>
    rpc<{ id: string; estado: string; flujo: string; mesa_numero: number | null }[]>(
      `select public.pedidos_por_cobrar($1) r`,
      [local],
    );

  const eventos = async (pedido: string, tipo: string) =>
    sql(`select 1 from public.mesa_eventos where pedido_id = $1 and tipo = $2`, [pedido, tipo]);

  const pagoPrevio = async (on: boolean) => {
    await comoBase();
    await sql(`update public.locales set mostrador_qr_pago_previo = $2 where id = $1`, [local, on]);
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

    const org = (
      await uno<{ id: string }>(
        `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
         values ($1, $2, true, 'active') returning id`,
        [`${MARCA} org`, `${MARCA}-org@test.invalid`],
      )
    ).id;
    local = (
      await uno<{ id: string }>(
        `insert into public.locales (organizacion_id, nombre, slug, modulo_pedidos, pedidos_modalidad)
         values ($1, 'centro', $2, true, 'mostrador_qr') returning id`,
        [org, `${MARCA}-centro-${crypto.randomUUID().slice(0, 8)}`],
      )
    ).id;
    admin = await crearUsuario("admin", { rol: "admin", organizacion_id: org });
    token = (
      await uno<{ t: string }>(`select mostrador_qr_token t from public.locales where id = $1`, [local])
    ).t;
    const rows = await sql(
      `insert into public.productos (local_id, nombre, precio) values
         ($1, 'Café', 2500), ($1, 'Medialuna', 1200)
       returning id, nombre`,
      [local],
    );
    productos = Object.fromEntries(rows.map((r) => [r.nombre, r.id]));
    await sql(`insert into public.local_cobros (local_id, acepta_efectivo) values ($1, true)`, [local]);
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  it("1. Apagada (por defecto): el pedido entra al tablero en el acto, como siempre", async () => {
    await comoBase();
    expect(
      (await uno<{ v: boolean }>(`select mostrador_qr_pago_previo v from public.locales where id = $1`, [local])).v,
    ).toBe(false);

    await como("service_role", null);
    const tel = await entrar();
    const pedido = await pedir(tel, [["Café", 1]]);
    const f = await fila(String(pedido.pedido_id));
    expect(f.estado).toBe("creado");
    expect(f.confirmado_en).not.toBeNull();

    await como("authenticated", admin);
    expect((await pagina()).items.map((i) => i.id)).toContain(pedido.pedido_id);
    expect(await porCobrar()).toHaveLength(0);
  });

  it("2. Prendida + caja: espera el pago fuera del tablero; cobrar lo confirma", async () => {
    await pagoPrevio(true);
    await como("service_role", null);
    const tel = await entrar();
    const pedido = await pedir(tel, [["Café", 1], ["Medialuna", 2]], "caja");
    expect(pedido.ok).toBe(true);
    const id = String(pedido.pedido_id);

    let f = await fila(id);
    expect(f.estado).toBe("pendiente_pago");
    expect(f.confirmado_en).toBeNull();
    expect(f.pagado_en).toBeNull();

    await como("authenticated", admin);
    expect((await pagina()).items.map((i) => i.id)).not.toContain(id);
    const cola = await porCobrar();
    expect(cola.map((p) => p.id)).toEqual([id]);
    expect(cola[0]).toMatchObject({ flujo: "mostrador_qr", mesa_numero: null });

    /* Nadie lo saca de pendiente_pago sin un pago que lo cubra. */
    expect(await rechaza(`update public.pedidos set estado = 'creado' where id = $1`, [id])).toBe(true);
    expect(await rechaza(`update public.pedidos set estado = 'listo' where id = $1`, [id])).toBe(true);

    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [id, "efectivo"])).toMatchObject({
      ok: true,
      monto_total: 4900,
    });
    f = await fila(id);
    expect(f.estado).toBe("creado");
    expect(f.confirmado_en).not.toBeNull();
    expect(f.pagado_en).not.toBeNull();
    expect((await pagina()).items.map((i) => i.id)).toContain(id);
    expect(await porCobrar()).toHaveLength(0);

    /* Idempotente: una segunda caja no cobra de nuevo. */
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [id, "efectivo"])).toMatchObject({
      ok: true,
      repetido: true,
    });
    await comoBase();
    expect(await eventos(id, "pedido_confirmado")).toHaveLength(1);

    /* Desde acá, el flujo de siempre. */
    await como("authenticated", admin);
    await sql(`update public.pedidos set estado = 'listo' where id = $1`, [id]);
    await sql(`update public.pedidos set estado = 'retirado' where id = $1`, [id]);
    expect((await fila(id)).estado).toBe("retirado");
  });

  it("3. Prendida + Mercado Pago: solo el webhook válido lo confirma, una vez", async () => {
    await pagoPrevio(true);
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();
    const pedido = await pedir(tel, [["Café", 1]], "mercado_pago");
    const id = String(pedido.pedido_id);
    const pago = String(pedido.pago_id);
    expect((await fila(id)).estado).toBe("pendiente_pago");

    expect(await webhook(pago, 1, "mp-ok")).toMatchObject({ ok: false, reason: "monto-inconsistente" });
    expect((await fila(id)).estado).toBe("pendiente_pago");

    expect(await webhook(pago, 2500, "mp-ok")).toMatchObject({ ok: true });
    const f = await fila(id);
    expect(f.estado).toBe("creado");
    expect(f.confirmado_en).not.toBeNull();
    expect(f.pagado_en).not.toBeNull();
    expect((await pagoEstado(pago)).estado).toBe("pagado");

    expect(await webhook(pago, 2500, "mp-ok")).toMatchObject({ ok: true, repetido: true });
    expect(await webhook(pago, 2500, "mp-otro")).toMatchObject({ ok: false, reason: "duplicado" });
    expect((await fila(id)).estado).toBe("creado");

    /* Ya confirmado: el cliente no lo cancela. */
    expect(
      await rpc(`select public.cancelar_pedido_autoservicio($1, $2, $3) r`, [tel.id, tel.hash, id]),
    ).toMatchObject({ ok: false, reason: "ya-confirmado" });
  });

  it("4. El cliente cancela mientras espera el pago; un pago tardío no lo revive", async () => {
    await pagoPrevio(true);
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();
    const pedido = await pedir(tel, [["Café", 1]], "mercado_pago");
    const id = String(pedido.pedido_id);
    const pago = String(pedido.pago_id);

    expect(
      await rpc(`select public.cancelar_pedido_autoservicio($1, $2, $3) r`, [tel.id, tel.hash, id]),
    ).toMatchObject({ ok: true });
    expect((await fila(id)).estado).toBe("cancelado");
    expect((await pagoEstado(pago)).estado).toBe("cancelado");

    /* Mercado Pago lo aprueba igual: excedente para devolver, sigue cancelado. */
    expect(await webhook(pago, 2500)).toMatchObject({ ok: true, excedente: true });
    expect((await fila(id)).estado).toBe("cancelado");
    expect((await pagoEstado(pago)).mp_estado).toBe("excedente");

    expect(
      await rpc(`select public.pagar_pedido_autoservicio($1, $2, $3, $4) r`, [tel.id, tel.hash, id, "caja"]),
    ).toMatchObject({ ok: false, reason: "pedido-cancelado" });
    await como("authenticated", admin);
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [id, "efectivo"])).toMatchObject({
      ok: false,
      reason: "pedido-cancelado",
    });
    expect(await rechaza(`update public.pedidos set estado = 'creado' where id = $1`, [id])).toBe(true);
  });

  it("5. El cierre de jornada cancela lo que nadie pagó y no toca lo que ya está en el tablero", async () => {
    await pagoPrevio(true);
    await conMercadoPago();
    await como("service_role", null);
    const tel = await entrar();
    const impago = await pedir(tel, [["Café", 1]], "mercado_pago");
    const pago = await pedir(tel, [["Medialuna", 1]], "caja");
    await como("authenticated", admin);
    await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [pago.pedido_id, "efectivo"]);
    await sql(`update public.pedidos set estado = 'listo' where id = $1`, [pago.pedido_id]);

    await comoBase();
    await sql(`select public._cerrar_sesion($1, 'jornada-cerrada')`, [tel.sesion]);
    expect((await fila(String(impago.pedido_id))).estado).toBe("cancelado");
    expect((await pagoEstado(String(impago.pago_id))).estado).toBe("cancelado");
    expect((await fila(String(pago.pedido_id))).estado).toBe("listo");

    await como("service_role", null);
    expect(await webhook(String(impago.pago_id), 2500)).toMatchObject({ ok: true, excedente: true });
    expect((await fila(String(impago.pedido_id))).estado).toBe("cancelado");
  });

  it("6. Apagar la opción no deja colgado lo que ya espera el pago", async () => {
    await pagoPrevio(true);
    await como("service_role", null);
    const tel = await entrar();
    const pedido = await pedir(tel, [["Café", 1]], "caja");
    const id = String(pedido.pedido_id);
    await pagoPrevio(false);

    await como("authenticated", admin);
    expect((await porCobrar()).map((p) => p.id)).toEqual([id]);
    expect(await rpc(`select public.cobrar_pedido_autoservicio($1, $2) r`, [id, "efectivo"])).toMatchObject({
      ok: true,
    });
    expect((await fila(id)).estado).toBe("creado");

    /* Y lo nuevo vuelve a entrar en el acto. */
    await como("service_role", null);
    const nuevo = await pedir(tel, [["Medialuna", 1]], "caja");
    expect((await fila(String(nuevo.pedido_id))).estado).toBe("creado");
  });

  it("7. La guardia solo acepta el estado inicial que corresponde a la opción", async () => {
    await como("service_role", null);
    const tel = await entrar();
    const insertar = (estado: string) =>
      rechaza(
        `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en,
                                     sesion_id, comensal_id, autoservicio)
         values ($1, $2, $3, gen_random_uuid()::text, now() + interval '1 day', $4, $5, true)`,
        [local, `x-${crypto.randomUUID().slice(0, 6)}`, estado, tel.sesion, tel.id],
      );

    await comoBase();
    expect(await insertar("pendiente_pago")).toBe(true);
    await pagoPrevio(true);
    expect(await insertar("creado")).toBe(true);
    expect(await insertar("pendiente_pago")).toBe(false);
  });
});
