/**
 * Matriz de privilegios de la Data API contra la DB (supabase/data-api-grants.sql).
 * Solo lectura. Corre con RUN_DB_CHECKS=1 y DATABASE_URL.
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

const esLocal = (url: string) => /@(localhost|127\.0\.0\.1)[:/]/.test(url);

type Rol = "authenticated" | "service_role";
type Privs = { s?: 1; i?: 1; u?: 1; d?: 1 };

/* Privilegios de tabla completa esperados. Lo que no figura, en false. */
const ESPERADO: Record<string, Record<Rol, Privs>> = {
  organizaciones: { authenticated: { s: 1, u: 1 }, service_role: { s: 1, i: 1, u: 1, d: 1 } },
  locales: { authenticated: { s: 1, i: 1, u: 1, d: 1 }, service_role: { s: 1, i: 1, u: 1 } },
  pedidos: { authenticated: { s: 1, u: 1 }, service_role: { s: 1, u: 1 } },
  usuarios: { authenticated: { s: 1 }, service_role: { s: 1, u: 1 } },
  esperas: { authenticated: { s: 1, i: 1, u: 1, d: 1 }, service_role: { s: 1, u: 1 } },
  mesas: { authenticated: { s: 1, u: 1 }, service_role: { s: 1 } },
  reservas: { authenticated: { s: 1, u: 1 }, service_role: {} },
  pagos: { authenticated: { s: 1, i: 1 }, service_role: {} },
  emails_enviados: { authenticated: { s: 1 }, service_role: { i: 1 } },
  usuario_sucursal: { authenticated: {}, service_role: { s: 1, i: 1, u: 1, d: 1 } },
  pedidos_sucursal: { authenticated: {}, service_role: { s: 1, i: 1, u: 1 } },
  solicitudes: { authenticated: {}, service_role: { s: 1, i: 1, u: 1 } },
  push_subscriptions: { authenticated: {}, service_role: { s: 1, i: 1, u: 1, d: 1 } },
  cron_locks: { authenticated: {}, service_role: {} },
  reserva_mesas: { authenticated: {}, service_role: {} },
  cicalino_schema_migrations: { authenticated: {}, service_role: {} },
  /* Solo grants por columna (abajo): sin SELECT/INSERT/UPDATE de tabla. */
  empleados: { authenticated: { d: 1 }, service_role: {} },
};

const COLS_EMPLEADOS = [
  "id", "local_id", "nombre", "rol", "activo", "created_at", "tiene_pin", "usuario_id",
];

/* Tablas que el panel escucha por Realtime (postgres_changes). */
const REALTIME = [
  "pedidos", "mesa_sesiones", "esperas", "mesas", "reservas", "organizaciones", "mesa_asignacion",
];

describe.skipIf(!enabled)("Integration — Data API grants", () => {
  let client: pg.Client;

  beforeAll(async () => {
    loadEnvLocal();
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("RUN_DB_CHECKS=1 requiere DATABASE_URL");
    client = new pg.Client({
      connectionString: url,
      ssl: esLocal(url) ? false : { rejectUnauthorized: false },
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("anon sin privilegios en ninguna tabla ni secuencia de public", async () => {
    const { rows } = await client.query(`
      select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'v', 'm', 'p', 'S')
         and (
           (c.relkind <> 'S' and (
             has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
             or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
           or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE'))
         )
       order by 1
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("authenticated sin TRUNCATE / REFERENCES / TRIGGER en public", async () => {
    const { rows } = await client.query(`
      select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and has_table_privilege('authenticated', c.oid, 'TRUNCATE, REFERENCES, TRIGGER')
       order by 1
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("matriz de tabla para authenticated y service_role", async () => {
    const tablas = Object.keys(ESPERADO);
    const { rows } = await client.query(
      `
      select t.tabla, r.rol,
             has_table_privilege(r.rol, 'public.' || t.tabla, 'SELECT') as s,
             has_table_privilege(r.rol, 'public.' || t.tabla, 'INSERT') as i,
             has_table_privilege(r.rol, 'public.' || t.tabla, 'UPDATE') as u,
             has_table_privilege(r.rol, 'public.' || t.tabla, 'DELETE') as d
        from unnest($1::text[]) as t(tabla)
       cross join unnest(array['authenticated', 'service_role']) as r(rol)
    `,
      [tablas],
    );
    expect(rows.length).toBe(tablas.length * 2);
    for (const r of rows) {
      const exp = ESPERADO[r.tabla][r.rol as Rol];
      expect(
        { s: r.s, i: r.i, u: r.u, d: r.d },
        `${r.tabla} / ${r.rol}`,
      ).toEqual({ s: !!exp.s, i: !!exp.i, u: !!exp.u, d: !!exp.d });
    }
  });

  it("pin y pin_hash: ningún rol de la API los lee ni escribe", async () => {
    const { rows } = await client.query(`
      select a.attname as col, r.rol,
             has_column_privilege(r.rol, 'public.empleados'::regclass, a.attnum, 'SELECT, INSERT, UPDATE, REFERENCES') as algo
        from pg_attribute a
       cross join unnest(array['anon', 'authenticated', 'service_role']) as r(rol)
       where a.attrelid = 'public.empleados'::regclass
         and a.attname in ('pin', 'pin_hash') and not a.attisdropped
    `);
    expect(rows.some((r) => r.col === "pin_hash")).toBe(true);
    for (const r of rows) expect(r.algo, `${r.col} / ${r.rol}`).toBe(false);
  });

  it("empleados: columnas exactas por rol", async () => {
    const { rows } = await client.query(`
      select r.rol, a.attname as col,
             has_column_privilege(r.rol, 'public.empleados'::regclass, a.attnum, 'SELECT') as s,
             has_column_privilege(r.rol, 'public.empleados'::regclass, a.attnum, 'INSERT') as i,
             has_column_privilege(r.rol, 'public.empleados'::regclass, a.attnum, 'UPDATE') as u
        from pg_attribute a
       cross join unnest(array['authenticated', 'service_role']) as r(rol)
       where a.attrelid = 'public.empleados'::regclass
         and a.attnum > 0 and not a.attisdropped
         and a.attname not in ('pin', 'pin_hash')
    `);
    const porRol = (rol: string, p: "s" | "i" | "u") =>
      rows.filter((r) => r.rol === rol && r[p]).map((r) => r.col).sort();
    expect(porRol("authenticated", "s")).toEqual([...COLS_EMPLEADOS].sort());
    expect(porRol("authenticated", "i")).toEqual(["local_id", "nombre", "rol"]);
    expect(porRol("authenticated", "u")).toEqual([]);
    expect(porRol("service_role", "s")).toEqual([...COLS_EMPLEADOS].sort());
    expect(porRol("service_role", "i")).toEqual([]);
    expect(porRol("service_role", "u")).toEqual(["usuario_id"]);
  });

  it("tablas de Realtime legibles por authenticated", async () => {
    const { rows } = await client.query(
      `select t, has_table_privilege('authenticated', 'public.' || t, 'SELECT') as ok
         from unnest($1::text[]) as t`,
      [REALTIME],
    );
    for (const r of rows) expect(r.ok, r.t).toBe(true);
  });

  it("secuencia de mesa_eventos solo para service_role", async () => {
    const { rows } = await client.query(`
      select
        has_sequence_privilege('anon',          'public.mesa_eventos_id_seq', 'USAGE, SELECT, UPDATE') as anon,
        has_sequence_privilege('authenticated', 'public.mesa_eventos_id_seq', 'USAGE, SELECT, UPDATE') as auth,
        has_sequence_privilege('service_role',  'public.mesa_eventos_id_seq', 'USAGE') as service
    `);
    expect(rows[0]).toEqual({ anon: false, auth: false, service: true });
  });

  it("marcar_en_preparacion_pendientes solo service_role", async () => {
    const { rows } = await client.query(`
      select
        has_function_privilege('anon',          'public.marcar_en_preparacion_pendientes()', 'execute') as anon,
        has_function_privilege('authenticated', 'public.marcar_en_preparacion_pendientes()', 'execute') as auth,
        has_function_privilege('service_role',  'public.marcar_en_preparacion_pendientes()', 'execute') as service
    `);
    expect(rows[0]).toEqual({ anon: false, auth: false, service: true });
  });

  it("toda tabla de public es accesible por algún rol de la API o está listada como solo-server", async () => {
    const soloServer = ["cron_locks", "reserva_mesas", "cicalino_schema_migrations"];
    const { rows } = await client.query(
      `
      select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and c.relname <> all($1::text[])
         and not has_any_column_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE')
         and not has_any_column_privilege('service_role', c.oid, 'SELECT, INSERT, UPDATE')
         and not has_table_privilege('authenticated', c.oid, 'DELETE')
         and not has_table_privilege('service_role', c.oid, 'DELETE')
       order by 1
    `,
      [soloServer],
    );
    expect(rows.map((r) => r.relname), "tabla nueva sin GRANT para la Data API").toEqual([]);
  });
});
