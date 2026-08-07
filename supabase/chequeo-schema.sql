-- ===========================================================================
-- Cicalino — Compare the real database against src/lib/db/schema.ts
-- Run in: Supabase Dashboard → SQL Editor. Read only.
--
-- WHY
-- The Drizzle schema had drifted badly: about fifteen columns and four whole
-- tables existed in the database but not in the file. `pnpm db:push` compares
-- the file against the database and applies the difference, so running it
-- would have dropped every one of them. In production. Without asking.
--
-- The README warned not to do it, but a warning in prose isn't a safeguard
-- when the script sits right there in package.json — so `db:push` is gone.
--
-- The schema file is now written by hand from the scripts in this folder,
-- which means it can drift again. This query is how you find out.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Every column of the tables the app uses.
--    Diff this against src/lib/db/schema.ts when something feels off.
-- ---------------------------------------------------------------------------
select
  c.table_name  as tabla,
  c.column_name as columna,
  c.data_type   as tipo,
  c.is_nullable as acepta_null,
  c.column_default as valor_por_defecto,
  c.is_generated as generada
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'organizaciones', 'locales', 'usuarios', 'empleados', 'pedidos',
    'esperas', 'reservas', 'mesas', 'push_subscriptions', 'solicitudes',
    'pedidos_sucursal', 'pagos', 'emails_enviados', 'usuario_sucursal',
    'cron_locks'
  )
order by c.table_name, c.ordinal_position;


-- ---------------------------------------------------------------------------
-- 2) Tables in public that the list above doesn't mention.
--    If anything shows up here, it was created and never modelled.
-- ---------------------------------------------------------------------------
select t.table_name as tabla_no_modelada
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
  and t.table_name not in (
    'organizaciones', 'locales', 'usuarios', 'empleados', 'pedidos',
    'esperas', 'reservas', 'mesas', 'push_subscriptions', 'solicitudes',
    'pedidos_sucursal', 'pagos', 'emails_enviados', 'usuario_sucursal',
    'cron_locks'
  )
order by t.table_name;


-- ---------------------------------------------------------------------------
-- 3) Tables without RLS. Should always come back empty — anything listed here
--    is reachable with the anon key.
-- ---------------------------------------------------------------------------
select c.relname as tabla_sin_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by c.relname;
