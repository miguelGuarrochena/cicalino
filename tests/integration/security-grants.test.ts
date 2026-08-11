/**
 * Smoke checks de seguridad contra la DB real.
 * Corre solo con RUN_DB_CHECKS=1 y DATABASE_URL (p.ej. desde .env.local).
 *
 *   RUN_DB_CHECKS=1 pnpm test:db
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

describe.skipIf(!enabled)("Integration — security grants smoke", () => {
  let client: pg.Client;

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

  it("purgar_push_viejas solo service_role", async () => {
    const { rows } = await client.query(`
      select
        has_function_privilege('anon', 'public.purgar_push_viejas(integer)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.purgar_push_viejas(integer)', 'execute') as auth,
        has_function_privilege('service_role', 'public.purgar_push_viejas(integer)', 'execute') as service
    `);
    expect(rows[0]).toEqual({ anon: false, auth: false, service: true });
  });

  it("cron locks solo service_role + ownership token", async () => {
    const { rows } = await client.query(`
      select
        has_function_privilege('anon', 'public.tomar_cron_lock(text, integer)', 'execute') as tomar_anon,
        has_function_privilege('service_role', 'public.tomar_cron_lock(text, integer)', 'execute') as tomar_service,
        has_function_privilege('service_role', 'public.soltar_cron_lock(text, text)', 'execute') as soltar_service,
        exists(
          select 1 from information_schema.columns
          where table_schema='public' and table_name='cron_locks' and column_name='token'
        ) as tiene_token,
        not exists(
          select 1 from pg_proc p
          join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='soltar_cron_lock'
            and pg_get_function_identity_arguments(p.oid)='text'
        ) as sin_soltar_viejo
    `);
    expect(rows[0].tomar_anon).toBe(false);
    expect(rows[0].tomar_service).toBe(true);
    expect(rows[0].soltar_service).toBe(true);
    expect(rows[0].tiene_token).toBe(true);
    expect(rows[0].sin_soltar_viejo).toBe(true);
  });

  it("cola_de_espera no ejecutable por authenticated", async () => {
    const { rows } = await client.query(`
      select coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'execute')), false) as auth_ok,
             coalesce(bool_or(has_function_privilege('service_role', p.oid, 'execute')), false) as service_ok
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'cola_de_espera'
    `);
    expect(rows[0].auth_ok).toBe(false);
    expect(rows[0].service_ok).toBe(true);
  });

  it("usuario_sucursal tiene policies de escritura separadas", async () => {
    const { rows } = await client.query(`
      select count(*)::int as n from pg_policies where tablename = 'usuario_sucursal'
    `);
    expect(rows[0].n).toBeGreaterThanOrEqual(4);
  });

  it("sincronizar_mesas chequea local_operativo", async () => {
    const { rows } = await client.query(`
      select pg_get_functiondef('public.sincronizar_mesas(uuid,integer)'::regprocedure)
             ilike '%local_operativo%' as ok
    `);
    expect(rows[0].ok).toBe(true);
  });

  it("crear_pedido existe", async () => {
    const { rows } = await client.query(`
      select exists(
        select 1 from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='crear_pedido'
      ) as ok
    `);
    expect(rows[0].ok).toBe(true);
  });

  it("contrato_token_creado_en existe", async () => {
    const { rows } = await client.query(`
      select exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='organizaciones'
          and column_name='contrato_token_creado_en'
      ) as ok
    `);
    expect(rows[0].ok).toBe(true);
  });

  it("cicalino_schema_migrations existe (tracker)", async () => {
    const { rows } = await client.query(`
      select exists(
        select 1 from information_schema.tables
        where table_schema='public' and table_name='cicalino_schema_migrations'
      ) as ok
    `);
    expect(rows[0].ok).toBe(true);
  });

  it("expirar_reservas_vencidas solo service_role", async () => {
    const { rows } = await client.query(`
      select
        has_function_privilege('anon', 'public.expirar_reservas_vencidas()', 'execute') as anon,
        has_function_privilege('authenticated', 'public.expirar_reservas_vencidas()', 'execute') as auth,
        has_function_privilege('service_role', 'public.expirar_reservas_vencidas()', 'execute') as service
    `);
    expect(rows[0]).toEqual({ anon: false, auth: false, service: true });
  });

  it("tenant tables tienen RLS activo", async () => {
    const { rows } = await client.query(`
      select c.relname as tabla, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and c.relname = any($1::text[])
       order by 1
    `, [[
      "organizaciones",
      "locales",
      "empleados",
      "pedidos",
      "usuarios",
      "usuario_sucursal",
      "esperas",
      "reservas",
      "mesas",
      "pagos",
    ]]);
    expect(rows.length).toBe(10);
    for (const r of rows) {
      expect(r.rls, String(r.tabla)).toBe(true);
    }
  });

  it("tablas server-only: RLS on y sin policies de cliente", async () => {
    const serverOnly = [
      "solicitudes",
      "push_subscriptions",
      "cron_locks",
      "reserva_mesas",
      "cicalino_schema_migrations",
    ];
    const { rows } = await client.query(`
      select c.relname as tabla,
             c.relrowsecurity as rls,
             (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and c.relname = any($1::text[])
       order by 1
    `, [serverOnly]);
    expect(rows.length).toBe(serverOnly.length);
    for (const r of rows) {
      expect(r.rls, String(r.tabla)).toBe(true);
      expect(r.policies, String(r.tabla)).toBe(0);
    }
  });

  it("policies de pedidos/esperas/mesas/reservas usan puede_ver_local", async () => {
    const { rows } = await client.query(`
      select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
        from pg_policies
       where tablename = any($1::text[])
    `, [["pedidos", "esperas", "mesas", "reservas"]]);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(
        String(r.expr).includes("puede_ver_local"),
        `${r.tablename}.${r.policyname}`,
      ).toBe(true);
    }
  });

  it("no quedan policies viejas de mi org en tenant tables", async () => {
    const { rows } = await client.query(`
      select tablename, policyname
        from pg_policies
       where policyname = any($1::text[])
    `, [[
      "esperas de mi org",
      "mesas de mi org",
      "reservas de mi org",
      "pedidos de mi org",
      "empleados de mi org",
    ]]);
    expect(rows).toEqual([]);
  });

  it("verificar_pin_empleado: authenticated sí, public/anon no", async () => {
    const { rows } = await client.query(`
      select
        has_function_privilege('public', 'public.verificar_pin_empleado(uuid, text)', 'execute') as pub,
        has_function_privilege('anon', 'public.verificar_pin_empleado(uuid, text)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.verificar_pin_empleado(uuid, text)', 'execute') as auth,
        has_function_privilege('service_role', 'public.verificar_pin_empleado(uuid, text)', 'execute') as service
    `);
    expect(rows[0].pub).toBe(false);
    expect(rows[0].anon).toBe(false);
    expect(rows[0].auth).toBe(true);
    /* service_role hereda o no según grants; el flujo legítimo no lo usa. */
    expect(typeof rows[0].service).toBe("boolean");
  });
});
