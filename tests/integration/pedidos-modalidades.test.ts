/**
 * Modalidades de Pedidos combinables, contra la base REAL.
 *
 *   RUN_DB_CHECKS=1 pnpm test:db   (requiere pedidos-modalidades-combinables.sql)
 *
 * El mostrador funciona de una sola forma (tradicional o QR) y Mesa va aparte.
 * Válidas: tradicional · tradicional + Mesa · QR · QR + Mesa · Mesa.
 * Tradicional + QR no se puede guardar, y sin mostrador exige Mesa.
 *
 * Cada test corre en una transacción que termina en ROLLBACK.
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

const MARCA = "zz-pedidos-modalidades-test";
type Json = Record<string, unknown> & { ok?: boolean; reason?: string };
type Modalidad = "mostrador" | "mostrador_qr" | "sin_mostrador";

const VALIDAS: { nombre: string; modalidad: Modalidad; mesa: boolean }[] = [
  { nombre: "Tradicional", modalidad: "mostrador", mesa: false },
  { nombre: "Tradicional + Mesa", modalidad: "mostrador", mesa: true },
  { nombre: "QR", modalidad: "mostrador_qr", mesa: false },
  { nombre: "QR + Mesa", modalidad: "mostrador_qr", mesa: true },
  { nombre: "Mesa", modalidad: "sin_mostrador", mesa: true },
];

describe.skipIf(!enabled)("Integration — modalidades de Pedidos combinables", () => {
  let client: pg.Client;
  let local: string;
  let admin: string;
  let mesaToken: string;
  let counterToken: string;

  beforeAll(async () => {
    loadEnvLocal();
    if (!process.env.DATABASE_URL) throw new Error("RUN_DB_CHECKS=1 requiere DATABASE_URL");
    client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false },
    });
    await client.connect();
    const { rows } = await client.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'locales' and column_name = 'pedidos_mesa'`,
    );
    if (!rows.length) {
      throw new Error("Falta aplicar supabase/pedidos-modalidades-combinables.sql (pnpm db:sql).");
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  const sql = async (q: string, p: unknown[] = []) => (await client.query(q, p)).rows;
  const uno = async <T>(q: string, p: unknown[] = []): Promise<T> => (await sql(q, p))[0] as T;
  const rpc = async (q: string, p: unknown[] = []): Promise<Json> => (await uno<{ r: Json }>(q, p)).r;

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

  /* Como Configuración → Pedidos: el dueño guarda las dos cosas juntas. */
  const guardar = (modalidad: string, mesa: boolean) =>
    sql(`update public.locales set pedidos_modalidad = $2, pedidos_mesa = $3 where id = $1`, [
      local,
      modalidad,
      mesa,
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
        `insert into public.locales (organizacion_id, nombre, slug, modulo_pedidos)
         values ($1, 'centro', $2, true) returning id`,
        [org, `${MARCA}-${crypto.randomUUID().slice(0, 8)}`],
      )
    ).id;
    admin = (
      await uno<{ id: string }>(
        `insert into auth.users (id, email, invited_at, raw_user_meta_data)
         values (gen_random_uuid(), $1, now(), $2::jsonb) returning id`,
        [`${MARCA}-admin@test.invalid`, JSON.stringify({ rol: "admin", organizacion_id: org })],
      )
    ).id;
    await sql(`insert into public.local_cobros (local_id, acepta_efectivo) values ($1, true)`, [local]);
    await sql(`insert into public.mesas (local_id, numero) values ($1, 1)`, [local]);
    mesaToken = (await uno<{ t: string }>(`select qr_token t from public.mesas where local_id = $1`, [local])).t;
    counterToken = (
      await uno<{ t: string }>(`select mostrador_qr_token t from public.locales where id = $1`, [local])
    ).t;
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  it("un local nuevo arranca en tradicional, sin Mesa", async () => {
    expect(
      await uno(`select pedidos_modalidad, pedidos_mesa from public.locales where id = $1`, [local]),
    ).toEqual({ pedidos_modalidad: "mostrador", pedidos_mesa: false });
  });

  for (const c of VALIDAS) {
    it(`${c.nombre}: se guarda y habilita exactamente lo suyo`, async () => {
      await como("authenticated", admin);
      await guardar(c.modalidad, c.mesa);

      await comoBase();
      const flags = await uno<{ tradicional: boolean; qr: boolean; mesa: boolean }>(
        `select public.local_pedidos_tradicional($1) tradicional,
                public.local_pedidos_mostrador_qr($1) qr,
                public.local_pedidos_mesa($1) mesa`,
        [local],
      );
      expect(flags).toEqual({
        tradicional: c.modalidad === "mostrador",
        qr: c.modalidad === "mostrador_qr",
        mesa: c.mesa,
      });
      /* Nunca tradicional y QR a la vez. */
      expect(flags.tradicional && flags.qr).toBe(false);

      /* La carga del empleado, solo en tradicional. */
      await como("authenticated", admin);
      const creado = await rpc(`select public.crear_pedido($1, null, null, now(), now()) r`, [local]);
      if (c.modalidad === "mostrador") expect(creado.ok).toBe(true);
      else expect(creado).toMatchObject({ ok: false, reason: "mostrador-no-tradicional" });

      /* El QR del mostrador, solo en QR; el de la mesa, solo con Mesa. */
      await como("service_role", null);
      const mostrador = await rpc(`select public.mostrador_qr_por_token($1) r`, [counterToken]);
      expect(mostrador.ok).toBe(c.modalidad === "mostrador_qr");
      const mesa = await rpc(`select public.mesa_por_qr($1) r`, [mesaToken]);
      if (c.mesa) expect(mesa).toMatchObject({ ok: true, flujo: "autoservicio" });
      else expect(mesa.ok).toBe(false);
    });
  }

  it("QR + Mesa: los dos QR toman pedidos a la vez, cada uno con su flujo", async () => {
    await como("authenticated", admin);
    await guardar("mostrador_qr", true);
    await comoBase();
    const producto = (
      await uno<{ id: string }>(
        `insert into public.productos (local_id, nombre, precio) values ($1, 'Café', 2500) returning id`,
        [local],
      )
    ).id;
    const items = JSON.stringify([{ producto_id: producto, cantidad: 1 }]);
    const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

    await como("service_role", null);
    const a = crypto.randomUUID();
    const enMostrador = await rpc(`select public.unirse_mostrador_qr($1, $2) r`, [counterToken, hash(a)]);
    const p1 = await rpc(`select public.pedir_mostrador_qr($1, $2, $3, $4, $5, $6, $7) r`, [
      counterToken, enMostrador.comensal_id, hash(a), items, crypto.randomUUID(), "caja", null,
    ]);
    expect(p1.ok).toBe(true);

    const b = crypto.randomUUID();
    const enMesa = await rpc(`select public.unirse_mesa_autoservicio($1, $2, $3) r`, [mesaToken, "Ana", hash(b)]);
    const p2 = await rpc(`select public.pedir_autoservicio($1, $2, $3, $4, $5) r`, [
      enMesa.comensal_id, hash(b), items, crypto.randomUUID(), "caja",
    ]);
    expect(p2.ok).toBe(true);

    await comoBase();
    const estados = await sql(`select id, estado from public.pedidos where id = any($1::uuid[])`, [
      [p1.pedido_id, p2.pedido_id],
    ]);
    const de = (id: unknown) => estados.find((r) => r.id === id)?.estado;
    /* Cada uno con sus reglas de siempre. */
    expect(de(p1.pedido_id)).toBe("creado");
    expect(de(p2.pedido_id)).toBe("pendiente_pago");
  });

  it("sin mostrador y sin Mesa no se puede guardar", async () => {
    await como("authenticated", admin);
    expect(
      await rechaza(`update public.locales set pedidos_modalidad = 'sin_mostrador', pedidos_mesa = false where id = $1`, [
        local,
      ]),
    ).toBe(true);
  });

  it("tradicional + QR no se puede guardar: no hay forma de expresarlo", async () => {
    await como("authenticated", admin);
    for (const valor of ["mostrador,mostrador_qr", "mostrador+mostrador_qr", "ambos", "mesa"]) {
      expect(
        await rechaza(`update public.locales set pedidos_modalidad = $2 where id = $1`, [local, valor]),
        valor,
      ).toBe(true);
    }
    await comoBase();
    const col = await uno<{ data_type: string }>(
      `select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'locales' and column_name = 'pedidos_modalidad'`,
    );
    expect(col.data_type).toBe("text");
  });

  it("Mesa se apaga sin tocar el mostrador, y el mostrador cambia sin tocar Mesa", async () => {
    await como("authenticated", admin);
    await guardar("mostrador_qr", true);
    await sql(`update public.locales set pedidos_mesa = false where id = $1`, [local]);
    await comoBase();
    expect(
      await uno(`select pedidos_modalidad, pedidos_mesa from public.locales where id = $1`, [local]),
    ).toEqual({ pedidos_modalidad: "mostrador_qr", pedidos_mesa: false });
    await como("authenticated", admin);
    await sql(`update public.locales set pedidos_mesa = true, pedidos_modalidad = 'mostrador' where id = $1`, [local]);
    await comoBase();
    expect(
      await uno(`select pedidos_modalidad, pedidos_mesa from public.locales where id = $1`, [local]),
    ).toEqual({ pedidos_modalidad: "mostrador", pedidos_mesa: true });
  });
});
