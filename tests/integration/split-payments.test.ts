/**
 * Split payments against the REAL functions and policies.
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 *
 * Same approach as rls-aislamiento.test.ts: every test runs inside a
 * transaction that ends in ROLLBACK, users are simulated the way PostgREST
 * does it (request.jwt.claims + set role), and nothing survives the run.
 *
 * What it guards: the amounts are computed and capped in SQL, payments can't
 * be overpaid, Mercado Pago is confirmed only by the webhook function, the
 * transfer alias is owner-only, and a branch without the module can't use any
 * of it.
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

const MARCA = "zz-split-test";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

type Json = Record<string, unknown> & { ok?: boolean; reason?: string };

describe.skipIf(!enabled)("Integration — pagos divididos", () => {
  let client: pg.Client;

  let org: string;
  let local: string;
  let localSinModulo: string;
  let otraLocal: string;
  let admin: string;
  let supervisor: string;
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

  const unirse = async (nombre: string) => {
    const secreto = `${nombre}-${crypto.randomUUID()}`;
    const r = await rpc(`select public.unirse_mesa($1, $2, $3) r`, [mesaToken, nombre, sha(secreto)]);
    return { id: String(r.comensal_id), sesion: String(r.sesion_id), hash: sha(secreto), r };
  };

  const pedir = (g: { id: string; hash: string }, items: [string, number][]) =>
    rpc(`select public.pedir_como_comensal($1, $2, $3, $4) r`, [
      g.id,
      g.hash,
      JSON.stringify(items.map(([n, c]) => ({ producto_id: productos[n], cantidad: c }))),
      crypto.randomUUID(),
    ]);

  const pagar = (g: { id: string; hash: string }, datos: Record<string, unknown>) =>
    rpc(`select public.pagar_como_comensal($1, $2, $3) r`, [
      g.id,
      g.hash,
      JSON.stringify({ clave: crypto.randomUUID(), ...datos }),
    ]);

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
    const nuevaSucursal = async (o: string, n: string, pagos: boolean) =>
      (
        await uno<{ id: string }>(
          `insert into public.locales (organizacion_id, nombre, slug, modulo_pagos)
           values ($1, $2, $3, $4) returning id`,
          [o, n, `${MARCA}-${n}-${crypto.randomUUID().slice(0, 8)}`, pagos],
        )
      ).id;
    local = await nuevaSucursal(org, "centro", true);
    localSinModulo = await nuevaSucursal(org, "norte", false);
    otraLocal = await nuevaSucursal(otraOrg, "otra", true);

    admin = await crearUsuario("admin", { rol: "admin", organizacion_id: org });
    otroAdmin = await crearUsuario("otro", { rol: "admin", organizacion_id: otraOrg });
    supervisor = await crearUsuario("sup", { rol: "supervisor", organizacion_id: org, local_id: local });
    await sql(`insert into public.usuario_sucursal (usuario_id, local_id) values ($1, $2)`, [supervisor, local]);

    await sql(`insert into public.mesas (local_id, numero) values ($1, 1)`, [local]);
    const qrCol = await sql(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'mesas' and column_name = 'qr_activo'`,
    );
    if (qrCol.length) {
      await sql(`update public.mesas set qr_activo = true where local_id = $1`, [local]);
    }
    mesaToken = (await uno<{ t: string }>(`select qr_token t from public.mesas where local_id = $1`, [local])).t;

    const rows = await sql(
      `insert into public.productos (local_id, nombre, precio) values
         ($1, 'Hamburguesa', 10000), ($1, 'Coca-Cola', 2000), ($1, 'Pizza', 15000), ($1, 'Agua', 2000)
       returning id, nombre`,
      [local],
    );
    productos = Object.fromEntries(rows.map((r) => [r.nombre, r.id]));
    await sql(
      `insert into public.local_cobros (local_id, acepta_transferencia, transferencia_alias, transferencia_titular)
       values ($1, true, 'resto.test', 'Resto SA')`,
      [local],
    );
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  it("los comensales comparten la sesión y cada ítem guarda quién lo pidió, con el precio del momento", async () => {
    await como("service_role", null);
    const juan = await unirse("Juan");
    const maria = await unirse("María");
    expect(juan.sesion).toBe(maria.sesion);

    expect((await pedir(juan, [["Hamburguesa", 1], ["Coca-Cola", 1]])).total).toBe(12000);
    expect((await pedir(maria, [["Pizza", 1], ["Agua", 1]])).total).toBe(17000);

    await comoBase();
    await sql(`update public.productos set precio = 1 where local_id = $1`, [local]);
    await como("service_role", null);

    const c = await rpc(`select public.cuenta_comensal($1, $2) r`, [juan.id, juan.hash]);
    const cuenta = c.cuenta as { totales: { consumo: number }; comensales: { id: string; consumo: number }[] };
    expect(cuenta.totales.consumo).toBe(29000);
    expect(cuenta.comensales.find((x) => x.id === juan.id)?.consumo).toBe(12000);

    const ajeno = await rpc(`select public.cuenta_comensal($1, $2) r`, [juan.id, maria.hash]);
    expect(ajeno.ok).toBe(false);
  });

  it("mi consumo con propina individual, sin sobrepago y con confirmación manual", async () => {
    await como("service_role", null);
    const juan = await unirse("Juan");
    const maria = await unirse("María");
    await pedir(juan, [["Hamburguesa", 1], ["Coca-Cola", 1]]);
    await pedir(maria, [["Pizza", 1], ["Agua", 1]]);

    const pj = await pagar(juan, { modo: "consumo", metodo: "efectivo", propina_porcentaje: 10 });
    expect(pj).toMatchObject({ ok: true, monto_base: 12000, propina: 1200, monto_total: 13200, estado: "pendiente" });
    expect((await pagar(juan, { modo: "consumo", metodo: "efectivo" })).reason).toBe("nada-que-pagar");
    expect((await pagar(maria, { modo: "iguales", metodo: "efectivo" })).reason).toBe("modo-bloqueado");

    const pm = await pagar(maria, { modo: "consumo", metodo: "transferencia", propina_porcentaje: 5, monto_esperado: 17850 });
    expect(pm).toMatchObject({ ok: true, monto_total: 17850 });

    await como("authenticated", admin);
    expect((await rpc(`select public.confirmar_pago_mesa($1) r`, [pj.pago_id])).ok).toBe(true);
    let lista = (await rpc(`select public.mesas_cuentas($1) r`, [local])) as unknown as { sesion: { estado: string } }[];
    expect(lista[0]?.sesion.estado).toBe("abierta");
    expect((await rpc(`select public.confirmar_pago_mesa($1) r`, [pm.pago_id])).ok).toBe(true);
    lista = (await rpc(`select public.mesas_cuentas($1) r`, [local])) as unknown as { sesion: { estado: string } }[];
    expect(lista[0]?.sesion.estado).toBe("pagada");
  });

  it("partes iguales cierra exacto y monto/porcentaje no deja pasar de lo que falta", async () => {
    await como("service_role", null);
    const a = await unirse("Ana");
    const b = await unirse("Beto");
    const c = await unirse("Caro");
    await pedir(a, [["Pizza", 1], ["Coca-Cola", 1]]);
    await pedir(b, [["Agua", 1]]);

    const p1 = await pagar(a, { modo: "iguales", metodo: "efectivo" });
    expect(p1.monto_base).toBe(Math.floor(19000 / 3));
    await pagar(b, { modo: "iguales", metodo: "efectivo" });
    const p3 = await pagar(c, { modo: "iguales", metodo: "efectivo" });
    expect(Number(p1.monto_base) * 2 + Number(p3.monto_base)).toBe(19000);
    expect((await pagar(c, { modo: "iguales", metodo: "efectivo" })).reason).toBe("nada-que-pagar");
  });

  it("monto o porcentaje: rechaza lo que supera el saldo", async () => {
    await como("service_role", null);
    const x = await unirse("Xime");
    await pedir(x, [["Pizza", 2]]);
    expect((await pagar(x, { modo: "monto", porcentaje: 40, metodo: "efectivo" })).monto_base).toBe(12000);
    const excede = await pagar(x, { modo: "monto", monto: 18001, metodo: "efectivo" });
    expect(excede).toMatchObject({ ok: false, reason: "excede", disponible: 18000 });
  });

  it("recargo de tarjeta: requiere declaración y queda congelado en el pago", async () => {
    await como("authenticated", admin);
    expect(
      await rechaza(`update public.local_cobros set recargo_credito_pct = 3 where local_id = $1`, [local]),
    ).toBe(true);
    await sql(
      `update public.local_cobros set recargo_credito_pct = 3, recargo_declarado = true where local_id = $1`,
      [local],
    );

    await como("service_role", null);
    const j = await unirse("Juan");
    await pedir(j, [["Pizza", 1], ["Agua", 1], ["Coca-Cola", 1], ["Hamburguesa", 1]]);
    const p = await pagar(j, { modo: "uno", metodo: "tarjeta_credito" });
    expect(p).toMatchObject({ ok: true, monto_base: 29000, recargo: 870, monto_total: 29870 });

    await comoBase();
    await sql(`update public.local_cobros set recargo_credito_pct = 10 where local_id = $1`, [local]);
    const g = await uno<{ recargo: number }>(`select recargo from public.pagos_mesa where id = $1`, [p.pago_id]);
    expect(g.recargo).toBe(870);
  });

  it("Mercado Pago: solo el webhook confirma, validando sucursal y monto exacto", async () => {
    await comoBase();
    await sql(
      `insert into public.mp_cuentas (local_id, mp_user_id, access_token_cifrado, refresh_token_cifrado, expira_en)
       values ($1, '1', 'x', 'y', now() + interval '90 days')`,
      [local],
    );
    await sql(`update public.local_cobros set acepta_mercado_pago = true where local_id = $1`, [local]);

    await como("service_role", null);
    const j = await unirse("Juan");
    await pedir(j, [["Hamburguesa", 1]]);
    const p = await pagar(j, { modo: "uno", metodo: "mercado_pago", propina_porcentaje: 10 });
    expect(p).toMatchObject({ ok: true, monto_total: 11000, estado: "pendiente" });

    await como("authenticated", admin);
    expect((await rpc(`select public.confirmar_pago_mesa($1) r`, [p.pago_id])).reason).toBe("mp-solo-webhook");
    expect(await rechaza(`select public.mp_confirmar_pago($1, $2, '9', 'approved', 11000, 'ARS')`, [local, p.pago_id])).toBe(true);

    await como("service_role", null);
    expect((await rpc(`select public.mp_confirmar_pago($1, $2, '9', 'approved', 10000, 'ARS') r`, [local, p.pago_id])).reason).toBe("monto-inconsistente");
    expect((await rpc(`select public.mp_confirmar_pago($1, $2, '9', 'approved', 11000, 'ARS') r`, [otraLocal, p.pago_id])).ok).toBe(false);
    expect((await rpc(`select public.mp_confirmar_pago($1, $2, '9', 'approved', 11000, 'ARS') r`, [local, p.pago_id])).ok).toBe(true);
    expect((await rpc(`select public.mp_confirmar_pago($1, $2, '9', 'approved', 11000, 'ARS') r`, [local, p.pago_id])).repetido).toBe(true);
  });

  it("permisos: alias solo del dueño, nada sin módulo, nada de otra empresa, escrituras solo por funciones", async () => {
    await como("authenticated", supervisor);
    /* Positive check first: if the fixture left the supervisor without scope,
     * every "rejected" below would pass for the wrong reason. */
    const visible = await sql(`select transferencia_alias from public.local_cobros where local_id = $1`, [local]);
    expect(visible[0]?.transferencia_alias).toBe("resto.test");
    const r = await sql(
      `update public.local_cobros set transferencia_alias = 'sup.alias' where local_id = $1 returning local_id`,
      [local],
    ).catch(() => null);
    expect(r === null || r.length === 0).toBe(true);

    await como("authenticated", admin);
    expect(await rechaza(`update public.locales set modulo_pagos = true where id = $1`, [localSinModulo])).toBe(true);
    expect(await rechaza(`insert into public.productos (local_id, nombre, precio) values ($1, 'X', 1)`, [localSinModulo])).toBe(true);
    expect(
      await rechaza(
        `insert into public.pagos_mesa (local_id, sesion_id, pagador_nombre, modo, monto_base, metodo, creado_por)
         values ($1, gen_random_uuid(), 'x', 'uno', 1, 'efectivo', 'personal')`,
        [local],
      ),
    ).toBe(true);
    expect(await rechaza(`select token_hash from public.comensales`)).toBe(true);
    expect(await rechaza(`select * from public.mp_cuentas`)).toBe(true);
    expect(await rechaza(`select public.unirse_mesa('x', 'Juan', $1)`, [sha("x")])).toBe(true);

    await como("authenticated", otroAdmin);
    expect(await rechaza(`select public.mesas_cuentas($1)`, [otraLocal])).toBe(false);
    expect(await rechaza(`select public.mesas_cuentas($1)`, [local])).toBe(true);
  });

  it("un pedido ya cubierto por pagos no se puede cancelar", async () => {
    await como("service_role", null);
    const j = await unirse("Juan");
    await pedir(j, [["Pizza", 1]]);
    await pagar(j, { modo: "uno", metodo: "efectivo" });

    await como("authenticated", admin);
    const pedido = await uno<{ id: string }>(`select id from public.pedidos where comensal_id = $1`, [j.id]);
    expect(
      await rechaza(`update public.pedidos set estado = 'cancelado', cancelado_en = now() where id = $1`, [pedido.id]),
    ).toBe(true);
  });
});
