/**
 * Aislamiento entre empresas y sucursales, contra las policies REALES.
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 *
 * CÓMO NO ENSUCIA LA BASE
 * Cada test corre dentro de una transacción que termina en ROLLBACK, siempre,
 * pase o falle. Se crean dos empresas de prueba, sus sucursales, sus usuarios
 * y sus pedidos; se comprueba quién ve qué; y al terminar no queda una sola
 * fila. Por eso puede correr contra la base de verdad sin un proyecto aparte.
 *
 * CÓMO SE SIMULA UN USUARIO LOGUEADO
 * PostgREST hace dos cosas en cada request: pone los claims del JWT en
 * `request.jwt.claims` y cambia el rol de la conexión a `authenticated`. Acá
 * se hace lo mismo a mano, así que `auth.uid()`, `auth_rol()`, `auth_org()` y
 * todas las policies se comportan igual que en producción.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * Que la empresa A no vea los datos de la B es lo de peor consecuencia de todo
 * el sistema, y hasta ahora no lo verificaba nada automáticamente: dependía de
 * que alguien leyera las policies con atención. Esto es la alarma para el día
 * que alguien toque una.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
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

/* Prefijo de todo lo que crea este archivo. Nada debería sobrevivir al
 * rollback; si alguna vez ves filas con esto en la base, algo se comiteó y hay
 * que mirarlo. */
const MARCA = "zz-rls-test";

describe.skipIf(!enabled)("Integration — aislamiento entre empresas", () => {
  let client: pg.Client;

  /* Ids del escenario, recreados en cada test. */
  let orgA: string;
  let orgB: string;
  let sucA1: string;
  let sucA2: string;
  let sucB: string;
  let adminA: string;
  let supervisorA1: string;
  let adminB: string;
  let pedidoA1: string;
  let pedidoB: string;

  beforeAll(async () => {
    loadEnvLocal();
    if (!process.env.DATABASE_URL) {
      throw new Error("RUN_DB_CHECKS=1 requiere DATABASE_URL");
    }
    client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  /* --------------------------------------------------------------------- */

  const sql = async (q: string, p: unknown[] = []) => (await client.query(q, p)).rows;

  const uno = async <T>(q: string, p: unknown[] = []): Promise<T> =>
    (await sql(q, p))[0] as T;

  /** Crea un usuario de Auth. El trigger `handle_new_user` le arma el perfil. */
  const crearUsuario = async (
    etiqueta: string,
    meta: Record<string, string> | null,
  ): Promise<string> => {
    const { id } = await uno<{ id: string }>(
      `insert into auth.users (id, email, invited_at, raw_user_meta_data)
       values (gen_random_uuid(), $1, $2, $3::jsonb)
       returning id`,
      [
        `${MARCA}-${etiqueta}@test.invalid`,
        meta ? new Date() : null,
        JSON.stringify(meta ?? {}),
      ],
    );
    return id;
  };

  /** A partir de acá la conexión se comporta como ese usuario logueado. */
  const comoUsuario = async (userId: string) => {
    await client.query("reset role");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
  };

  /** Un visitante sin sesión: la anon key sin login. */
  const comoAnon = async () => {
    await client.query("reset role");
    await client.query(`select set_config('request.jwt.claims', '', true)`);
    await client.query("set local role anon");
  };

  const comoAdminDeLaBase = async () => {
    await client.query("reset role");
  };

  /* Un error aborta la transacción entera, así que lo que se espera que falle
   * va dentro de un savepoint: si revienta, se vuelve al punto anterior y el
   * test puede seguir comprobando cosas. */
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

  /* --------------------------------------------------------------------- */

  beforeEach(async () => {
    await client.query("begin");
    await comoAdminDeLaBase();

    const nuevaOrg = async (n: string, activo = true) =>
      (
        await uno<{ id: string }>(
          `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
           values ($1, $2, $3, 'active') returning id`,
          [`${MARCA} ${n}`, `${MARCA}-${n}@test.invalid`, activo],
        )
      ).id;

    const nuevaSucursal = async (org: string, n: string) =>
      (
        await uno<{ id: string }>(
          `insert into public.locales (organizacion_id, nombre, slug)
           values ($1, $2, $3) returning id`,
          [org, `Suc ${n}`, `${MARCA}-${n}-${Math.random().toString(16).slice(2, 10)}`],
        )
      ).id;

    const nuevoPedido = async (local: string, ref: string) =>
      (
        await uno<{ id: string }>(
          `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en)
           values ($1, $2, 'creado', gen_random_uuid()::text, now() + interval '6 hours')
           returning id`,
          [local, ref],
        )
      ).id;

    orgA = await nuevaOrg("a");
    orgB = await nuevaOrg("b");
    sucA1 = await nuevaSucursal(orgA, "a1");
    sucA2 = await nuevaSucursal(orgA, "a2");
    sucB = await nuevaSucursal(orgB, "b1");

    adminA = await crearUsuario("admin-a", { rol: "admin", organizacion_id: orgA });
    adminB = await crearUsuario("admin-b", { rol: "admin", organizacion_id: orgB });
    supervisorA1 = await crearUsuario("sup-a1", {
      rol: "supervisor",
      organizacion_id: orgA,
      local_id: sucA1,
    });
    await client.query(
      `insert into public.usuario_sucursal (usuario_id, local_id) values ($1, $2)`,
      [supervisorA1, sucA1],
    );

    pedidoA1 = await nuevoPedido(sucA1, "1");
    await nuevoPedido(sucA2, "1");
    pedidoB = await nuevoPedido(sucB, "1");

    await client.query(
      `insert into public.esperas (local_id, nombre, personas, estado, qr_token, qr_expira_en)
       values ($1, 'Grupo B', 2, 'esperando', gen_random_uuid()::text, now() + interval '6 hours')`,
      [sucB],
    );
    await client.query(
      `insert into public.mesas (local_id, numero, estado, capacidad) values ($1, 1, 'libre', 4)`,
      [sucB],
    );
    await client.query(
      `insert into public.empleados (local_id, nombre) values ($1, 'Empleado B')`,
      [sucB],
    );
  });

  afterEach(async () => {
    /* Siempre, pase o falle. Es lo que hace que esto sea seguro. */
    await client.query("rollback").catch(() => {});
    await client.query("reset role").catch(() => {});
  });

  /* === Control positivo ================================================= */
  /* Si esto fallara, los tests de abajo darían "no ve nada" por el motivo
   * equivocado y pasarían sin probar nada. */

  it("el admin de A sí ve lo suyo (control positivo)", async () => {
    await comoUsuario(adminA);
    const perfil = await uno<{ rol: string; org: string }>(
      `select public.auth_rol()::text as rol, public.auth_org() as org`,
    );
    expect(perfil.rol).toBe("admin");
    expect(perfil.org).toBe(orgA);

    const locales = await sql(`select id from public.locales`);
    expect(locales.map((r) => r.id).sort()).toEqual([sucA1, sucA2].sort());

    const pedidos = await sql(`select id from public.pedidos`);
    expect(pedidos).toHaveLength(2);
  });

  it("el admin de A puede cargar un pedido en su propia sucursal", async () => {
    await comoUsuario(adminA);
    const bloqueado = await rechaza(
      `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en)
       values ($1, '99', 'creado', gen_random_uuid()::text, now() + interval '6 hours')`,
      [sucA1],
    );
    expect(bloqueado).toBe(false);
  });

  /* === Cross-tenant: lectura =========================================== */

  it("el admin de A no ve NADA de la empresa B", async () => {
    await comoUsuario(adminA);

    for (const t of ["pedidos", "esperas", "mesas", "empleados"]) {
      const filas = await sql(
        `select local_id from public.${t} where local_id = $1`,
        [sucB],
      );
      expect(filas, `${t} de la empresa B`).toHaveLength(0);
    }

    /* Estas dos se filtran por su propio id, no por local_id. */
    expect(
      await sql(`select id from public.locales where id = $1`, [sucB]),
      "sucursal de B",
    ).toHaveLength(0);
    expect(
      await sql(`select id from public.organizaciones where id = $1`, [orgB]),
      "organización B",
    ).toHaveLength(0);
  });

  it("el admin de A no ve el pedido de B ni pidiéndolo por id", async () => {
    await comoUsuario(adminA);
    const filas = await sql(`select id from public.pedidos where id = $1`, [pedidoB]);
    expect(filas).toHaveLength(0);
  });

  /* En los dos sentidos: una policy se puede romper en una dirección sola, y
   * mirar solo desde A dejaría pasar justo ese caso. */
  it("el aislamiento vale también de B hacia A", async () => {
    await comoUsuario(adminB);

    const locales = await sql(`select id from public.locales`);
    expect(locales.map((r) => r.id), "B solo ve su sucursal").toEqual([sucB]);

    const pedidos = await sql(`select id from public.pedidos`);
    expect(pedidos.map((r) => r.id), "B solo ve su pedido").toEqual([pedidoB]);

    expect(
      await sql(`select id from public.pedidos where id = $1`, [pedidoA1]),
      "pedido de A por id",
    ).toHaveLength(0);
    expect(
      await sql(`select id from public.organizaciones where id = $1`, [orgA]),
      "organización A",
    ).toHaveLength(0);

    expect(
      await rechaza(
        `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en)
         values ($1, '666', 'creado', gen_random_uuid()::text, now() + interval '6 hours')`,
        [sucA1],
      ),
      "insert en sucursal de A",
    ).toBe(true);
  });

  /* === Cross-tenant: escritura ========================================= */

  it("el admin de A no puede crear un pedido en una sucursal de B", async () => {
    await comoUsuario(adminA);
    const bloqueado = await rechaza(
      `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en)
       values ($1, '666', 'creado', gen_random_uuid()::text, now() + interval '6 hours')`,
      [sucB],
    );
    expect(bloqueado).toBe(true);
  });

  it("el admin de A no puede modificar ni borrar un pedido de B", async () => {
    await comoUsuario(adminA);
    const upd = await sql(
      `update public.pedidos set estado = 'cancelado' where id = $1 returning id`,
      [pedidoB],
    );
    expect(upd, "update").toHaveLength(0);
    const del = await sql(`delete from public.pedidos where id = $1 returning id`, [
      pedidoB,
    ]);
    expect(del, "delete").toHaveLength(0);
  });

  it("el admin de A no puede robarse una sucursal de B cambiándole la empresa", async () => {
    await comoUsuario(adminA);
    const filas = await sql(
      `update public.locales set organizacion_id = $1 where id = $2 returning id`,
      [orgA, sucB],
    );
    expect(filas).toHaveLength(0);
  });

  it("el admin de A no puede mudar un pedido suyo a una sucursal de B", async () => {
    await comoUsuario(adminA);
    const bloqueado = await rechaza(
      `update public.pedidos set local_id = $1 where id = $2`,
      [sucB, pedidoA1],
    );
    expect(bloqueado).toBe(true);
  });

  /* === Scope del supervisor (dentro de la misma empresa) =============== */

  it("el supervisor de A1 no ve los pedidos de A2, aunque sea la misma empresa", async () => {
    await comoUsuario(supervisorA1);
    const perfil = await uno<{ rol: string }>(
      `select public.auth_rol()::text as rol`,
    );
    expect(perfil.rol).toBe("supervisor");

    const locales = await sql(`select id from public.locales`);
    expect(locales.map((r) => r.id)).toEqual([sucA1]);

    const pedidos = await sql(`select local_id from public.pedidos`);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].local_id).toBe(sucA1);
  });

  it("el supervisor de A1 no puede cargar pedidos en A2", async () => {
    await comoUsuario(supervisorA1);
    const bloqueado = await rechaza(
      `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en)
       values ($1, '77', 'creado', gen_random_uuid()::text, now() + interval '6 hours')`,
      [sucA2],
    );
    expect(bloqueado).toBe(true);
  });

  /* === Escalada de privilegios ========================================= */

  it("nadie se puede auto-ascender de rol", async () => {
    await comoUsuario(adminA);
    const filas = await sql(
      `update public.usuarios set rol = 'superadmin' where id = $1 returning id`,
      [adminA],
    );
    expect(filas).toHaveLength(0);

    await comoAdminDeLaBase();
    const { rol } = await uno<{ rol: string }>(
      `select rol::text as rol from public.usuarios where id = $1`,
      [adminA],
    );
    expect(rol).toBe("admin");
  });

  it("el dueño no puede tocar su propia facturación", async () => {
    await comoUsuario(adminA);
    const filas = await sql(
      `update public.organizaciones set pagado = true, cupo = 99, plan = 'gratis'
        where id = $1 returning id`,
      [orgA],
    );
    expect(filas).toHaveLength(0);
  });

  it("un alta de Auth no puede pedir rol superadmin por metadata", async () => {
    await comoAdminDeLaBase();
    const id = await crearUsuario("intruso", {
      rol: "superadmin",
      organizacion_id: orgA,
    });
    const { rol } = await uno<{ rol: string }>(
      `select rol::text as rol from public.usuarios where id = $1`,
      [id],
    );
    expect(rol).toBe("admin");
  });

  it("un signup sin invitación queda sin empresa y sin permisos", async () => {
    await comoAdminDeLaBase();
    /* Sin invited_at: es lo que distingue un alta nuestra de un registro
     * público. El trigger ignora la metadata entera. */
    const { id } = await uno<{ id: string }>(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), $1, $2::jsonb) returning id`,
      [
        `${MARCA}-colado@test.invalid`,
        JSON.stringify({ rol: "supervisor", organizacion_id: orgA, local_id: sucA1 }),
      ],
    );
    const perfil = await uno<{ rol: string; org: string | null; local: string | null }>(
      `select rol::text as rol, organizacion_id as org, local_id as local
         from public.usuarios where id = $1`,
      [id],
    );
    expect(perfil.org).toBeNull();
    expect(perfil.local).toBeNull();

    await comoUsuario(id);
    expect(await sql(`select id from public.pedidos`)).toHaveLength(0);
    expect(await sql(`select id from public.locales`)).toHaveLength(0);
  });

  /* === Corte por impago =============================================== */

  it("una cuenta cortada sigue viendo su historial pero no puede cargar nada", async () => {
    await comoAdminDeLaBase();
    await client.query(
      `update public.organizaciones set estado_suscripcion = 'expired' where id = $1`,
      [orgA],
    );

    await comoUsuario(adminA);
    /* Leer sí: quitarles los datos sería otra decisión, y peor. */
    expect(await sql(`select id from public.pedidos`)).toHaveLength(2);

    const bloqueado = await rechaza(
      `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en)
       values ($1, '5', 'creado', gen_random_uuid()::text, now() + interval '6 hours')`,
      [sucA1],
    );
    expect(bloqueado, "insert con la suscripción vencida").toBe(true);
  });

  it("una cuenta pausada a mano tampoco puede cargar", async () => {
    await comoAdminDeLaBase();
    await client.query(`update public.organizaciones set activo = false where id = $1`, [
      orgA,
    ]);
    await comoUsuario(adminA);
    const bloqueado = await rechaza(
      `insert into public.esperas (local_id, nombre, personas, estado, qr_token, qr_expira_en)
       values ($1, 'Grupo', 2, 'esperando', gen_random_uuid()::text, now() + interval '6 hours')`,
      [sucA1],
    );
    expect(bloqueado).toBe(true);
  });

  /* === Visitante sin sesión =========================================== */

  it("sin sesión no se ve absolutamente nada", async () => {
    await comoAnon();
    for (const t of [
      "pedidos",
      "esperas",
      "reservas",
      "mesas",
      "empleados",
      "locales",
      "organizaciones",
      "usuarios",
      "pagos",
      "solicitudes",
      "push_subscriptions",
    ]) {
      expect(await sql(`select 1 from public.${t} limit 1`), t).toHaveLength(0);
    }
  });

  it("sin sesión tampoco se puede escribir", async () => {
    await comoAnon();
    const bloqueado = await rechaza(
      `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en)
       values ($1, '1', 'creado', gen_random_uuid()::text, now() + interval '6 hours')`,
      [sucA1],
    );
    expect(bloqueado).toBe(true);
  });

  /* === Las RPC no aceptan un local ajeno ============================== */

  it("crear_pedido rechaza una sucursal de otra empresa", async () => {
    await comoUsuario(adminA);
    const bloqueado = await rechaza(
      `select public.crear_pedido($1, null, null, now(), now() + interval '6 hours')`,
      [sucB],
    );
    expect(bloqueado).toBe(true);
  });

  it("las métricas y el listado de pedidos rechazan una sucursal ajena", async () => {
    await comoUsuario(adminA);
    expect(
      await rechaza(`select public.metricas_pedidos($1, now(), 'dia', 'UTC')`, [sucB]),
      "metricas_pedidos",
    ).toBe(true);
    expect(
      await rechaza(`select public.pedidos_pagina($1, now(), 'todos', '', 1, 20)`, [sucB]),
      "pedidos_pagina",
    ).toBe(true);
  });

  it("no se puede leer ni escribir el PIN de un empleado ajeno", async () => {
    await comoUsuario(adminA);
    expect(
      await rechaza(`select pin_hash from public.empleados limit 1`),
      "select pin_hash",
    ).toBe(true);
    expect(
      await rechaza(`select public.set_empleado_pin(
        (select id from public.empleados where local_id = $1), '1234')`, [sucB]),
      "set_empleado_pin en empleado de B",
    ).toBe(true);
  });
});
