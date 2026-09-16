/**
 * Menu (categorias + productos) against the REAL policies.
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 *
 * Same technique as rls-aislamiento.test.ts: a transaction per test that ends
 * in ROLLBACK, users simulated like PostgREST does.
 *
 * Guards: a manager runs the full CRUD on categories and products (including
 * cost and image); a waiter only reads; a branch without the module can't
 * build a menu; another company sees nothing.
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

const MARCA = "zz-menu-test";

describe.skipIf(!enabled)("Integration — menú", () => {
  let client: pg.Client;
  let local: string;
  let localSinModulo: string;
  let encargado: string;
  let mozo: string;
  let otroAdmin: string;

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

  const como = async (sub: string) => {
    await client.query("reset role");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
  };

  /* Rows affected, or -1 when the statement is rejected outright. */
  const filas = async (q: string, p: unknown[] = []): Promise<number> => {
    await client.query("savepoint intento");
    try {
      const r = await client.query(q, p);
      await client.query("release savepoint intento");
      return r.rowCount ?? 0;
    } catch {
      await client.query("rollback to savepoint intento");
      return -1;
    }
  };

  const crearUsuario = async (etiqueta: string, meta: Record<string, string>) =>
    (
      await uno<{ id: string }>(
        `insert into auth.users (id, email, invited_at, raw_user_meta_data)
         values (gen_random_uuid(), $1, now(), $2::jsonb) returning id`,
        [`${MARCA}-${etiqueta}@test.invalid`, JSON.stringify(meta)],
      )
    ).id;

  beforeEach(async () => {
    await client.query("begin");
    await client.query("reset role");
    const nuevaOrg = async (n: string) =>
      (
        await uno<{ id: string }>(
          `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
           values ($1, $2, true, 'active') returning id`,
          [`${MARCA} ${n}`, `${MARCA}-${n}@test.invalid`],
        )
      ).id;
    const org = await nuevaOrg("org");
    const otra = await nuevaOrg("otra");
    const nuevaSucursal = async (o: string, pagos: boolean) =>
      (
        await uno<{ id: string }>(
          `insert into public.locales (organizacion_id, nombre, slug, modulo_pagos)
           values ($1, 'Suc', $2, $3) returning id`,
          [o, `${MARCA}-${crypto.randomUUID().slice(0, 8)}`, pagos],
        )
      ).id;
    local = await nuevaSucursal(org, true);
    localSinModulo = await nuevaSucursal(org, false);
    await nuevaSucursal(otra, true);
    encargado = await crearUsuario("enc", { rol: "supervisor", organizacion_id: org, local_id: local });
    mozo = await crearUsuario("mozo", { rol: "empleado", organizacion_id: org, local_id: local });
    otroAdmin = await crearUsuario("otro", { rol: "admin", organizacion_id: otra });
    await sql(
      `insert into public.usuario_sucursal (usuario_id, local_id) values ($1, $3), ($2, $3), ($1, $4)`,
      [encargado, mozo, local, localSinModulo],
    );
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  it("el encargado crea, edita, ordena, oculta y borra categorías y productos", async () => {
    await como(encargado);
    const cat = await uno<{ id: string }>(
      `insert into public.categorias (local_id, nombre, orden) values ($1, 'Pizzas', 0) returning id`,
      [local],
    );
    expect(cat.id).toBeTruthy();
    expect(
      await filas(`insert into public.categorias (local_id, nombre, orden) values ($1, ' pizzas ', 1)`, [local]),
    ).toBe(-1);

    const prod = await uno<{ id: string; costo: number; imagen_url: string }>(
      `insert into public.productos (local_id, nombre, descripcion, categoria, precio, costo, imagen_url, activo, orden)
       values ($1, 'Margherita', 'Tomate y mozzarella', 'Pizzas', 12000, 4500, 'https://cdn.example/m.jpg', true, 0)
       returning id, costo, imagen_url`,
      [local],
    );
    expect(prod).toMatchObject({ costo: 4500, imagen_url: "https://cdn.example/m.jpg" });

    expect(await filas(`update public.productos set precio = 13000, activo = false where id = $1`, [prod.id])).toBe(1);
    expect(await filas(`update public.categorias set nombre = 'Pizzas a la piedra', activa = false, orden = 3 where id = $1`, [cat.id])).toBe(1);
    expect(await filas(`update public.productos set categoria = 'Pizzas a la piedra' where id = $1`, [prod.id])).toBe(1);
    expect(await filas(`update public.productos set precio = 0 where id = $1`, [prod.id])).toBe(-1);

    expect(await filas(`delete from public.productos where id = $1`, [prod.id])).toBe(1);
    expect(await filas(`delete from public.categorias where id = $1`, [cat.id])).toBe(1);
  });

  it("el mozo lee la carta pero no la modifica", async () => {
    await como(encargado);
    await sql(`insert into public.categorias (local_id, nombre) values ($1, 'Bebidas')`, [local]);
    await sql(`insert into public.productos (local_id, nombre, categoria, precio) values ($1, 'Agua', 'Bebidas', 2000)`, [local]);

    await como(mozo);
    expect((await sql(`select id from public.productos where local_id = $1`, [local])).length).toBe(1);
    expect((await sql(`select id from public.categorias where local_id = $1`, [local])).length).toBe(1);
    expect(await filas(`insert into public.categorias (local_id, nombre) values ($1, 'Postres')`, [local])).toBe(-1);
    expect(await filas(`insert into public.productos (local_id, nombre, precio) values ($1, 'Flan', 3000)`, [local])).toBe(-1);
    expect(await filas(`update public.productos set precio = 1 where local_id = $1`, [local])).toBe(0);
    expect(await filas(`delete from public.categorias where local_id = $1`, [local])).toBe(0);
  });

  it("sin el módulo no se arma carta, y otra empresa no ve nada", async () => {
    await como(encargado);
    expect(await filas(`insert into public.categorias (local_id, nombre) values ($1, 'Pizzas')`, [localSinModulo])).toBe(-1);
    expect(await filas(`insert into public.productos (local_id, nombre, precio) values ($1, 'Muzza', 1000)`, [localSinModulo])).toBe(-1);
    await sql(`insert into public.categorias (local_id, nombre) values ($1, 'Pizzas')`, [local]);

    await como(otroAdmin);
    expect((await sql(`select id from public.categorias where local_id = $1`, [local])).length).toBe(0);
    expect(await filas(`update public.categorias set nombre = 'X' where local_id = $1`, [local])).toBe(0);
  });
});
