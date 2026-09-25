/**
 * Regenerar QR de mesa (uno o todos) contra las funciones REALES.
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 *
 * Mismo método que pedidos-mesa.test.ts: todo corre en una transacción que
 * termina en ROLLBACK. Si qr-regenerar-mesas.sql todavía no se aplicó, se
 * carga dentro de esa misma transacción (no queda nada en la base).
 *
 * Lo que fija: las reglas de invalidación son las de siempre (el token viejo
 * no abre la mesa para nadie nuevo), "todos" es atómico y de una sola
 * sucursal, y quien ya está en la mesa sigue: su sesión, su cuenta y sus
 * pedidos llegan al QR nuevo. (El mostrador lo cubre pedidos-mostrador-qr.)
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

const MARCA = "zz-qr-regeneracion-test";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
type Json = Record<string, unknown> & { ok?: boolean; reason?: string };

describe.skipIf(!enabled)("Integration — regenerar QR de mesa", () => {
  let client: pg.Client;
  let local: string;
  let otraLocal: string;
  let admin: string;
  let otroAdmin: string;
  let mesas: { id: string; numero: number; token: string }[];
  let mesaAjena: string;

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
  const rpc = async (q: string, p: unknown[] = []): Promise<Json> => (await uno<{ r: Json }>(q, p)).r;

  const como = async (role: "authenticated" | "service_role" | "anon", sub: string | null) => {
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

  const tokens = async () =>
    Object.fromEntries(
      (await sql(`select id, qr_token from public.mesas where local_id = $1`, [local])).map((r) => [
        r.id,
        r.qr_token,
      ]),
    ) as Record<string, string>;

  const preparar = async (modalidad: "mostrador" | "mesa", pagos: boolean) => {
    await client.query("begin");
    await comoBase();
    const existe = await uno<{ n: number }>(
      `select count(*)::int n from pg_proc where proname = 'regenerar_qr_mesas'`,
    );
    if (!existe.n) {
      await client.query(fs.readFileSync(path.join(process.cwd(), "supabase/qr-regenerar-mesas.sql"), "utf8"));
    }
    const org = async (n: string) =>
      (
        await uno<{ id: string }>(
          `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
           values ($1, $2, true, 'active') returning id`,
          [`${MARCA} ${n}`, `${MARCA}-${n}@test.invalid`],
        )
      ).id;
    const o1 = await org("org");
    const o2 = await org("otra");
    const sucursal = async (o: string, n: string) =>
      (
        await uno<{ id: string }>(
          `insert into public.locales (organizacion_id, nombre, slug, modulo_pedidos, modulo_pagos, pedidos_modalidad, pedidos_mesa)
           values ($1, $2, $3, true, $4, $5, $6) returning id`,
          [
            o,
            n,
            `${MARCA}-${n}-${crypto.randomUUID().slice(0, 8)}`,
            pagos,
            modalidad === "mesa" ? "sin_mostrador" : modalidad,
            modalidad === "mesa",
          ],
        )
      ).id;
    local = await sucursal(o1, "centro");
    otraLocal = await sucursal(o2, "otra");
    const usuario = async (e: string, org: string) =>
      (
        await uno<{ id: string }>(
          `insert into auth.users (id, email, invited_at, raw_user_meta_data)
           values (gen_random_uuid(), $1, now(), $2::jsonb) returning id`,
          [`${MARCA}-${e}@test.invalid`, JSON.stringify({ rol: "admin", organizacion_id: org })],
        )
      ).id;
    admin = await usuario("admin", o1);
    otroAdmin = await usuario("otro", o2);
    await sql(
      `insert into public.mesas (local_id, numero, qr_activo) values ($1, 1, true), ($1, 2, true), ($1, 3, false)`,
      [local],
    );
    mesas = (
      await sql(`select id, numero, qr_token from public.mesas where local_id = $1 order by numero`, [local])
    ).map((r) => ({ id: r.id, numero: r.numero, token: r.qr_token }));
    await sql(`insert into public.mesas (local_id, numero, qr_activo) values ($1, 1, true)`, [otraLocal]);
    mesaAjena = (await uno<{ id: string }>(`select id from public.mesas where local_id = $1`, [otraLocal])).id;
    await sql(`insert into public.local_cobros (local_id, acepta_efectivo) values ($1, true)`, [local]);
    await sql(`insert into public.productos (local_id, nombre, precio) values ($1, 'Café', 2500)`, [local]);
  };

  afterEach(async () => {
    await client.query("rollback");
  });

  describe("Pagos (cuenta compartida)", () => {
    beforeEach(async () => {
      await preparar("mostrador", true);
    });

    it("regenerar uno: el token viejo deja de abrir la mesa, el nuevo sí", async () => {
      const [m1] = mesas;
      await como("authenticated", admin);
      const r = await rpc(`select public.regenerar_qr_mesa($1) r`, [m1!.id]);
      expect(r.ok).toBe(true);
      expect(r.qr_token).not.toBe(m1!.token);
      /* mesa_por_qr es del servidor (lo que resuelve la página del QR). */
      await como("service_role", null);
      expect(await rpc(`select public.mesa_por_qr($1) r`, [m1!.token])).toMatchObject({ ok: false, reason: "not-found" });
      expect(await rpc(`select public.mesa_por_qr($1) r`, [r.qr_token])).toMatchObject({ ok: true, mesa_numero: 1 });
    });

    it("regenerar todos: cambian todos a la vez, con el mismo evento que de a uno", async () => {
      const activas = mesas.filter((m) => m.numero !== 3);
      await como("authenticated", admin);
      const r = await rpc(`select public.regenerar_qr_mesas($1, $2) r`, [local, activas.map((m) => m.id)]);
      expect(r.ok).toBe(true);
      const nuevos = r.mesas as { mesa_id: string; qr_token: string }[];
      expect(nuevos.map((x) => x.mesa_id).sort()).toEqual(activas.map((m) => m.id).sort());

      await comoBase();
      const ahora = await tokens();
      for (const m of activas) {
        expect(ahora[m.id]).not.toBe(m.token);
        expect(nuevos.find((x) => x.mesa_id === m.id)?.qr_token).toBe(ahora[m.id]);
        expect(await rpc(`select public.mesa_por_qr($1) r`, [m.token])).toMatchObject({ reason: "not-found" });
      }
      /* La que no estaba en la lista (QR apagado) no se toca. */
      const tercera = mesas.find((m) => m.numero === 3)!;
      expect(ahora[tercera.id]).toBe(tercera.token);
      const eventos = await uno<{ n: number }>(
        `select count(*)::int n from public.mesa_eventos where local_id = $1 and tipo = 'qr_regenerado'`,
        [local],
      );
      expect(eventos.n).toBe(activas.length);
    });

    it("todos es atómico y de una sola sucursal: una mesa ajena lo rechaza entero", async () => {
      const antes = await tokens();
      await como("authenticated", admin);
      expect(
        await rechaza(`select public.regenerar_qr_mesas($1, $2)`, [local, [mesas[0]!.id, mesaAjena]]),
      ).toBe(true);
      await comoBase();
      expect(await tokens()).toEqual(antes);
    });

    it("no lo puede hacer otra empresa ni alguien sin sesión", async () => {
      await como("authenticated", otroAdmin);
      expect(await rechaza(`select public.regenerar_qr_mesas($1, $2)`, [local, [mesas[0]!.id]])).toBe(true);
      expect(await rechaza(`select public.regenerar_qr_mesa($1)`, [mesas[0]!.id])).toBe(true);
      await como("anon", null);
      expect(await rechaza(`select public.regenerar_qr_mesas($1, $2)`, [local, [mesas[0]!.id]])).toBe(true);
      await comoBase();
      expect(
        await uno<{ ok: boolean }>(
          `select has_function_privilege('anon', 'public.regenerar_qr_mesas(uuid, uuid[])', 'EXECUTE') ok`,
        ),
      ).toEqual({ ok: false });
    });

    it("quien ya está sentado sigue: su cuenta apunta al QR nuevo", async () => {
      const [m1] = mesas;
      await como("service_role", null);
      const secreto = crypto.randomUUID();
      const j = await rpc(`select public.unirse_mesa($1, $2, $3) r`, [m1!.token, "Sofía", sha(secreto)]);
      expect(j.ok).toBe(true);

      await como("authenticated", admin);
      await rpc(`select public.regenerar_qr_mesas($1, $2) r`, [local, [m1!.id]]);

      await como("service_role", null);
      const cuenta = await rpc(`select public.cuenta_comensal($1, $2) r`, [j.comensal_id, sha(secreto)]);
      expect(cuenta.ok).not.toBe(false);
      await comoBase();
      expect(cuenta.mesa_token).toBe((await tokens())[m1!.id]);
      /* Nadie nuevo entra con el cartel viejo. */
      await como("service_role", null);
      expect(
        await rpc(`select public.unirse_mesa($1, $2, $3) r`, [m1!.token, "Colado", sha(crypto.randomUUID())]),
      ).toMatchObject({ ok: false });
    });
  });

  describe("Pedidos en modalidad Mesa", () => {
    beforeEach(async () => {
      await preparar("mesa", false);
    });

    it("regenerar todos: los pedidos que ya existen siguen a la vista con el QR nuevo", async () => {
      const [m1] = mesas;
      await como("service_role", null);
      const secreto = crypto.randomUUID();
      const g = await rpc(`select public.unirse_mesa_autoservicio($1, $2, $3) r`, [m1!.token, "Bruno", sha(secreto)]);
      expect(g.ok).toBe(true);
      const producto = await uno<{ id: string }>(`select id from public.productos where local_id = $1`, [local]);
      const p = await rpc(`select public.pedir_autoservicio($1, $2, $3, $4, $5) r`, [
        g.comensal_id,
        sha(secreto),
        JSON.stringify([{ producto_id: producto.id, cantidad: 1 }]),
        crypto.randomUUID(),
        "caja",
      ]);
      expect(p.ok).toBe(true);

      /* En modalidad Mesa entran todas, también la del QR apagado. */
      await como("authenticated", admin);
      const r = await rpc(`select public.regenerar_qr_mesas($1, $2) r`, [local, mesas.map((m) => m.id)]);
      expect((r.mesas as unknown[]).length).toBe(3);

      await comoBase();
      const nuevo = (await tokens())[m1!.id]!;
      await como("service_role", null);
      const estado = await rpc(`select public.mesa_autoservicio_estado($1, $2, $3) r`, [
        nuevo,
        g.comensal_id,
        sha(secreto),
      ]);
      expect(estado.ok).toBe(true);
      expect((estado.pedidos as { id: string }[]).map((x) => x.id)).toContain(p.pedido_id);
      /* Su cuenta también apunta al QR nuevo (la pantalla vieja lo encuentra). */
      const cuenta = await rpc(`select public.cuenta_comensal($1, $2) r`, [g.comensal_id, sha(secreto)]);
      expect(cuenta.mesa_token).toBe(nuevo);
      /* El cartel viejo ya no abre la mesa para nadie nuevo. */
      expect(await rpc(`select public.mesa_autoservicio_estado($1, null, null) r`, [m1!.token])).toMatchObject({
        ok: false,
      });
    });
  });
});
