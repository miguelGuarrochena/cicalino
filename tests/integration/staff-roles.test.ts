/**
 * Staff roles against the REAL policies and functions.
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 *
 * Same technique as rls-aislamiento.test.ts: every test is a transaction that
 * ends in ROLLBACK, users are simulated like PostgREST does.
 *
 * What it guards:
 *   - A waiter works without clocking in: orders, waitlist, table payments.
 *   - A waiter can't change how the branch is set up (branch row, employees,
 *     PINs, number of tables, menu) nor void collected money or close a table
 *     with a balance. A manager can.
 *   - Actions are attributed to the logged-in account and its employee record.
 *   - Staff can collect an amount at the venue whatever split the table chose.
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

const MARCA = "zz-staff-test";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
type Json = Record<string, unknown> & { ok?: boolean; reason?: string };

describe.skipIf(!enabled)("Integration — roles del personal", () => {
  let client: pg.Client;
  let local: string;
  let admin: string;
  let encargado: string;
  let mozo: string;
  let empleadoMozo: string;
  let mesaToken: string;
  let producto: string;

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

  const como = async (role: "authenticated" | "service_role", sub: string | null) => {
    await client.query("reset role");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })]);
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

  /* A table with one guest who ordered a pizza (15.000). */
  const mesaConConsumo = async () => {
    await como("service_role", null);
    const secreto = crypto.randomUUID();
    const g = await rpc(`select public.unirse_mesa($1, 'Ana', $2) r`, [mesaToken, sha(secreto)]);
    await rpc(`select public.pedir_como_comensal($1, $2, $3, $4) r`, [
      g.comensal_id,
      sha(secreto),
      JSON.stringify([{ producto_id: producto, cantidad: 1 }]),
      crypto.randomUUID(),
    ]);
    return { sesion: String(g.sesion_id), comensal: String(g.comensal_id), hash: sha(secreto) };
  };

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
        `insert into public.locales (organizacion_id, nombre, slug, modulo_pagos, modulo_espera)
         values ($1, 'Centro', $2, true, true) returning id`,
        [org, `${MARCA}-${crypto.randomUUID().slice(0, 8)}`],
      )
    ).id;
    admin = await crearUsuario("admin", { rol: "admin", organizacion_id: org });
    encargado = await crearUsuario("enc", { rol: "supervisor", organizacion_id: org, local_id: local });
    mozo = await crearUsuario("mozo", { rol: "empleado", organizacion_id: org, local_id: local, nombre: "Juan" });
    await sql(`insert into public.usuario_sucursal (usuario_id, local_id) values ($1, $3), ($2, $3)`, [encargado, mozo, local]);
    empleadoMozo = (
      await uno<{ id: string }>(
        `insert into public.empleados (local_id, nombre, usuario_id) values ($1, 'Juan', $2) returning id`,
        [local, mozo],
      )
    ).id;
    await sql(`insert into public.mesas (local_id, numero) values ($1, 8)`, [local]);
    const qrCol = await sql(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'mesas' and column_name = 'qr_activo'`,
    );
    if (qrCol.length) {
      await sql(`update public.mesas set qr_activo = true where local_id = $1`, [local]);
    }
    mesaToken = (await uno<{ t: string }>(`select qr_token t from public.mesas where local_id = $1`, [local])).t;
    producto = (
      await uno<{ id: string }>(
        `insert into public.productos (local_id, nombre, precio) values ($1, 'Pizza', 15000) returning id`,
        [local],
      )
    ).id;
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  it("el mozo entra con su rol y ve solo su sucursal", async () => {
    const u = await uno<{ rol: string; local_id: string }>(`select rol, local_id from public.usuarios where id = $1`, [mozo]);
    expect(u).toEqual({ rol: "empleado", local_id: local });
    await como("authenticated", mozo);
    expect((await uno<{ ok: boolean }>(`select public.puede_ver_local($1) ok`, [local])).ok).toBe(true);
    expect((await uno<{ ok: boolean }>(`select public.auth_gestiona_local($1) ok`, [local])).ok).toBe(false);
  });

  it("el mozo trabaja sin fichar y todo queda a su nombre", async () => {
    await como("authenticated", mozo);
    const r = await rpc(`select public.crear_pedido($1, null, null, now(), now()) r`, [local]);
    expect(r.ok).toBe(true);
    const pedidoId = (r.pedido as { id: string }).id;
    await comoBase();
    const pedido = await uno<{ empleado_id: string; creado_por: string }>(
      `select empleado_id, creado_por from public.pedidos where id = $1`,
      [pedidoId],
    );
    expect(pedido).toEqual({ empleado_id: empleadoMozo, creado_por: mozo });

    await como("authenticated", mozo);
    expect(
      await filas(
        `insert into public.esperas (local_id, nombre, personas, qr_token, qr_expira_en)
         values ($1, 'García', 2, gen_random_uuid()::text, now() + interval '2 hours')`,
        [local],
      ),
    ).toBe(1);
    await comoBase();
    const espera = await uno<{ empleado_id: string }>(`select empleado_id from public.esperas where local_id = $1`, [local]);
    expect(espera.empleado_id).toBe(empleadoMozo);
  });

  it("el mozo no toca la configuración; el encargado sí", async () => {
    await como("authenticated", mozo);
    expect(await filas(`update public.locales set hora_corte = 4 where id = $1`, [local])).toBe(0);
    expect(await rechaza(`insert into public.empleados (local_id, nombre) values ($1, 'Otro')`, [local])).toBe(true);
    expect(await rechaza(`select public.set_empleado_pin($1, '1234')`, [empleadoMozo])).toBe(true);
    expect((await rpc(`select public.sincronizar_mesas($1, 20) r`, [local])).reason).toBe("sin-permiso");
    expect(await rechaza(`insert into public.productos (local_id, nombre, precio) values ($1, 'X', 1)`, [local])).toBe(true);
    expect((await sql(`select id from public.empleados where local_id = $1`, [local])).length).toBe(1);

    await como("authenticated", encargado);
    expect(await filas(`update public.locales set hora_corte = 4 where id = $1`, [local])).toBe(1);
    expect(await rechaza(`select public.set_empleado_pin($1, '1234')`, [empleadoMozo])).toBe(false);
    expect((await rpc(`select public.sincronizar_mesas($1, 10) r`, [local])).ok).toBe(true);
  });

  it("cualquier mozo cobra cualquier mesa, en efectivo, sin importar cómo dividió la mesa", async () => {
    const t = await mesaConConsumo();
    const p = await pagarComoComensal(t, { modo: "consumo", metodo: "tarjeta_debito", monto_esperado: 15000 });
    expect(p.ok).toBe(true);

    await como("authenticated", mozo);
    /* The guest said "card" on the phone and then paid cash at the counter:
     * the waiter cancels the pending one and collects cash. Mode was
     * 'consumo'; an amount still goes in. */
    const pendiente = await uno<{ id: string }>(`select id from public.pagos_mesa where sesion_id = $1`, [t.sesion]);
    expect((await rpc(`select public.cancelar_pago_mesa($1, null) r`, [pendiente.id])).ok).toBe(true);
    const cobro = await rpc(`select public.registrar_pago_personal($1, $2) r`, [
      t.sesion,
      JSON.stringify({ clave: crypto.randomUUID(), modo: "monto", monto: 15000, metodo: "efectivo", pagador_nombre: "Mesa 8", confirmado: true }),
    ]);
    expect(cobro).toMatchObject({ ok: true, estado: "pagado" });

    const lista = (await rpc(`select public.mesas_cuentas($1) r`, [local])) as unknown as { sesion: { estado: string } }[];
    expect(lista[0]?.sesion.estado).toBe("pagada");

    await comoBase();
    const g = await uno<{ confirmado_por: string; confirmado_empleado: string }>(
      `select confirmado_por, confirmado_empleado from public.pagos_mesa where id = $1`,
      [cobro.pago_id],
    );
    expect(g).toEqual({ confirmado_por: mozo, confirmado_empleado: empleadoMozo });

    await como("authenticated", mozo);
    const historial = (await rpc(`select public.mesa_historial($1) r`, [t.sesion])) as unknown as { tipo: string; quien: string }[];
    expect(historial.find((h) => h.tipo === "pago_registrado_pagado")?.quien).toBe("Juan");
    expect(historial.find((h) => h.tipo === "pago_cancelado")?.quien).toBe("Juan");
  });

  it("anular un cobro o cerrar con saldo es de encargado", async () => {
    const t = await mesaConConsumo();
    await como("authenticated", mozo);
    const cobro = await rpc(`select public.registrar_pago_personal($1, $2) r`, [
      t.sesion,
      JSON.stringify({ clave: crypto.randomUUID(), modo: "monto", monto: 5000, metodo: "efectivo", pagador_nombre: "Ana", confirmado: true }),
    ]);
    expect((await rpc(`select public.cancelar_pago_mesa($1, 'error') r`, [cobro.pago_id])).reason).toBe("requiere-encargado");
    expect((await rpc(`select public.cerrar_mesa($1, 'se fueron') r`, [t.sesion])).reason).toBe("requiere-encargado");

    await como("authenticated", encargado);
    expect((await rpc(`select public.cancelar_pago_mesa($1, 'error de caja') r`, [cobro.pago_id])).ok).toBe(true);
    expect((await rpc(`select public.cerrar_mesa($1, 'invita la casa') r`, [t.sesion])).ok).toBe(true);
  });

  it("un mozo cierra una mesa cubierta", async () => {
    const t = await mesaConConsumo();
    await como("authenticated", mozo);
    await rpc(`select public.registrar_pago_personal($1, $2) r`, [
      t.sesion,
      JSON.stringify({ clave: crypto.randomUUID(), modo: "uno", metodo: "tarjeta_debito", pagador_nombre: "Ana", confirmado: true }),
    ]);
    expect((await rpc(`select public.cerrar_mesa($1, null) r`, [t.sesion])).ok).toBe(true);
  });

  it("el dueño cambia un rol desde el servidor; un cliente no", async () => {
    await como("authenticated", admin);
    /* No UPDATE policy on usuarios: the row is simply not touched. */
    expect(await filas(`update public.usuarios set rol = 'supervisor' where id = $1`, [mozo])).toBe(0);
    await como("service_role", null);
    expect(await filas(`update public.usuarios set rol = 'supervisor' where id = $1`, [mozo])).toBe(1);
  });

  const pagarComoComensal = (t: { comensal: string; hash: string }, datos: Record<string, unknown>) =>
    como("service_role", null).then(() =>
      rpc(`select public.pagar_como_comensal($1, $2, $3) r`, [
        t.comensal,
        t.hash,
        JSON.stringify({ clave: crypto.randomUUID(), ...datos }),
      ]),
    );
});
