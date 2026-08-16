-- ===========================================================================
-- Cicalino — Fixes de seguridad #17 (pin_hash: el REVOKE por columna no servía)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: security-fixes-03.sql
-- Orden sugerido: después de reservas-horario-local.sql (ver orden.json)
--
-- PROBLEMA
-- security-fixes-03.sql cierra el acceso al PIN así:
--
--     revoke select (pin, pin_hash) on public.empleados from anon, authenticated;
--
-- Corre sin error y no hace absolutamente nada. En Postgres, un REVOKE por
-- COLUMNA no puede restar de un privilegio de TABLA: `anon` y `authenticated`
-- tienen el `grant all on all tables` que Supabase deja puesto por defecto, y
-- ese grant sigue cubriendo todas las columnas, incluidas las revocadas.
--
-- Comprobado contra la base:
--   has_column_privilege('authenticated','public.empleados','pin_hash','SELECT') → true
--   has_column_privilege('authenticated','public.empleados','pin_hash','UPDATE') → true
--   pg_attribute.attacl de pin / pin_hash                                        → null
--
-- QUÉ SE PODÍA HACER (y qué no)
-- `anon` NO leía nada: RLS lo frena antes, porque puede_ver_local() es false
-- sin sesión. No era una fuga pública.
--
-- Un admin/supervisor autenticado sí podía:
--   - leer el hash bcrypt del PIN de los empleados de SU sucursal (cuatro
--     dígitos salen offline en segundos);
--   - escribir pin_hash directo por PostgREST, salteándose las dos reglas que
--     set_empleado_pin sí aplica: formato de 4 dígitos y PIN único por local.
-- No cruza empresa ni escala privilegios — esa persona ya administra a esos
-- empleados. Pero el fix estaba documentado como cerrado y no lo estaba.
--
-- FIX
-- Sacar el privilegio de TABLA y volver a otorgarlo COLUMNA POR COLUMNA, sin
-- pin ni pin_hash. Es la única forma en Postgres: no hay "grant todo menos".
--
-- ⚠️ MANTENIMIENTO: si agregás una columna a `empleados`, hay que sumarla acá
--    o el panel no la va a poder leer/escribir. El bloque de chequeo del final
--    lista las columnas que quedaron afuera, justamente para no olvidarse.
--
-- Nota sobre `tiene_pin`: es GENERATED ALWAYS, así que aparece en el SELECT
-- pero no puede ir en INSERT ni UPDATE (Postgres rechaza escribirla).
-- Nota sobre `pin`: es la columna de texto plano vieja, hoy toda en null. Se
-- deja sin grants junto con pin_hash.
-- ===========================================================================

revoke select, insert, update on public.empleados from anon, authenticated;

grant select (id, local_id, nombre, rol, activo, created_at, tiene_pin, usuario_id)
  on public.empleados to anon, authenticated;

grant insert (id, local_id, nombre, rol, activo, created_at, usuario_id)
  on public.empleados to anon, authenticated;

grant update (id, local_id, nombre, rol, activo, created_at, usuario_id)
  on public.empleados to anon, authenticated;

comment on column public.empleados.pin_hash is
  'Hash bcrypt del PIN. Sin grants para anon/authenticated: se escribe solo por set_empleado_pin y se lee solo por verificar_pin_empleado (ambas SECURITY DEFINER).';

comment on column public.empleados.pin is
  'Columna vieja de PIN en texto plano, migrada a pin_hash en security-fixes-03. Siempre null, sin grants.';

-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado:
--   pin_*  → todos false
--   nombre_select / nombre_update → true (el panel sigue andando)
--   columnas_sin_grant → solo {pin, pin_hash} y, en update/insert, tiene_pin
-- ---------------------------------------------------------------------------
select
  has_column_privilege('anon',          'public.empleados', 'pin_hash', 'SELECT') as pin_hash_anon_select,
  has_column_privilege('authenticated', 'public.empleados', 'pin_hash', 'SELECT') as pin_hash_auth_select,
  has_column_privilege('authenticated', 'public.empleados', 'pin_hash', 'UPDATE') as pin_hash_auth_update,
  has_column_privilege('authenticated', 'public.empleados', 'pin',      'SELECT') as pin_auth_select,
  has_column_privilege('authenticated', 'public.empleados', 'nombre',   'SELECT') as nombre_auth_select,
  has_column_privilege('authenticated', 'public.empleados', 'nombre',   'UPDATE') as nombre_auth_update,
  has_column_privilege('authenticated', 'public.empleados', 'tiene_pin','SELECT') as tiene_pin_auth_select;

-- Columnas de `empleados` que quedaron sin SELECT para authenticated.
-- Tiene que devolver exactamente `pin` y `pin_hash`.
select c.column_name
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name = 'empleados'
   and not has_column_privilege('authenticated', 'public.empleados', c.column_name, 'SELECT')
 order by 1;
