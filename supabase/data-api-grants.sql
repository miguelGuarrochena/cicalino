-- ===========================================================================
-- Cicalino — Grants explícitos para la Data API (cambio de Supabase 30/10/2026)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: setup.sql, usuarios-sucursales.sql, modulo-espera.sql,
--           reservas-mesa.sql, suscripciones.sql, emails-enviados.sql,
--           pedidos-sucursal.sql, cron-lock.sql, reservas-sin-solape.sql,
--           security-fixes-13.sql, security-fixes-17.sql, split-payments.sql,
--           mesa-asignacion-jornada.sql, cocina-modo.sql
-- Orden sugerido: último (ver orden.json)
--
-- PROBLEMA
-- Desde el 30/10/2026 Supabase deja de otorgar SELECT/INSERT/UPDATE/DELETE a
-- anon, authenticated y service_role en las tablas nuevas de `public` (y
-- USAGE/SELECT en las secuencias). Los proyectos creados desde el 30/05/2026
-- y el Supabase local ya arrancan así. Las tablas de abajo se crean sin un
-- solo GRANT: en producción andan porque nacieron con el default viejo, pero
-- en una base nueva PostgREST responde 42501 en todas.
--
-- Al revés, el default viejo les dio a anon y authenticated todo
-- (arwdDxtm, TRUNCATE incluido) en tablas que no usan, y RLS es lo único que
-- frena a anon: push_subscriptions, usuarios, pedidos, pagos, etc.
--
-- FIX
-- Por tabla: REVOKE ALL de los tres roles y GRANT solo lo que la app usa
-- (inventario de .from() / .rpc() y Realtime en src/). Mismo patrón que
-- split-payments.sql y menu-categorias.sql. Revocar primero hace que la
-- base actual y una nueva terminen con exactamente los mismos privilegios.
--
--   anon          nada. El cliente sin sesión (QR de pedido/espera/mesa)
--                 entra por route handlers con service_role.
--   authenticated lo que hacen el panel y /admin con la sesión del usuario.
--                 RLS sigue decidiendo qué filas.
--   service_role  lo que hacen server actions, route handlers y el cron.
--                 Saltea RLS, así que acá el GRANT es el único límite.
--
-- No se tocan las tablas que ya tienen grants explícitos y correctos:
-- productos, categorias, local_cobros, mp_cuentas, mp_oauth_estados,
-- mesa_sesiones, comensales, pedido_items, pagos_mesa, mesa_eventos,
-- pin_intentos. Sí mesa_plantilla_turno y mesa_asignacion, solo para sacarle
-- a service_role el default viejo que no usa.
--
-- ⚠️ MANTENIMIENTO: una tabla nueva en public necesita sus GRANT en el mismo
--    script que la crea; sin eso la Data API no la ve. Una columna nueva en
--    `empleados` hay que sumarla abajo (grants por columna, ver #17).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Punto de partida igual en la base actual y en una nueva
-- ---------------------------------------------------------------------------
revoke all on table
  public.organizaciones, public.locales, public.empleados, public.pedidos,
  public.usuarios, public.push_subscriptions, public.solicitudes,
  public.usuario_sucursal, public.esperas, public.mesas, public.reservas,
  public.pagos, public.emails_enviados, public.pedidos_sucursal,
  public.cron_locks, public.reserva_mesas, public.cicalino_schema_migrations
  from public, anon, authenticated, service_role;

-- `empleados` también tiene grants por columna (#17), que un REVOKE de tabla
-- no saca. Columna por columna de las que existan: `pin` sigue en producción
-- pero drizzle/0002 la borra.
do $$
declare
  v_col name;
begin
  for v_col in
    select attname from pg_attribute
     where attrelid = 'public.empleados'::regclass
       and attnum > 0 and not attisdropped
  loop
    execute format(
      'revoke all (%I) on public.empleados from public, anon, authenticated, service_role',
      v_col);
  end loop;
end $$;

revoke all on table public.mesa_plantilla_turno, public.mesa_asignacion
  from service_role;


-- ---------------------------------------------------------------------------
-- 2) Panel y /admin (authenticated)
-- ---------------------------------------------------------------------------
-- Superadmin: alta/edición de organizaciones y sucursales desde /admin; el
-- dueño lee la suya. Realtime de organizaciones (Superadmin).
grant select, update on public.organizaciones to authenticated;
grant select, insert, update, delete on public.locales to authenticated;

-- Pedidos: el alta va por crear_pedido(); el panel lee, cambia estado y
-- marca cocina. Realtime.
grant select, update on public.pedidos to authenticated;

-- Perfil propio, middleware y la lista de dueños / cuentas del equipo.
grant select on public.usuarios to authenticated;

-- Lista de espera: alta, cambio de estado y baja desde el panel. Realtime.
grant select, insert, update, delete on public.esperas to authenticated;

-- Mesas y reservas: el alta va por sincronizar_mesas() / crear_reserva();
-- el panel lee y actualiza. Realtime.
grant select, update on public.mesas, public.reservas to authenticated;

-- Facturación manual: el superadmin carga y lista cobros desde /admin.
grant select, insert on public.pagos to authenticated;

-- Historial de mails en /admin; los escribe el server.
grant select on public.emails_enviados to authenticated;

-- Empleados: nunca pin ni pin_hash. El PIN se escribe con set_empleado_pin()
-- y se verifica con verificar_pin_empleado() (SECURITY DEFINER). El panel
-- da de alta (nombre y rol), lista y borra; no hace UPDATE directo.
grant select (id, local_id, nombre, rol, activo, created_at, tiene_pin, usuario_id)
  on public.empleados to authenticated;
grant insert (local_id, nombre, rol)
  on public.empleados to authenticated;
grant delete on public.empleados to authenticated;


-- ---------------------------------------------------------------------------
-- 3) Server (service_role)
-- ---------------------------------------------------------------------------
-- Alta/baja de organizaciones, demo, contrato, cobros y avisos del cron.
grant select, insert, update, delete on public.organizaciones to service_role;
grant select, insert, update on public.locales to service_role;

-- QR del cliente (/p, /m): leer por token, marcar visto, alias, avisado_en.
grant select, update on public.pedidos to service_role;
-- QR de la espera (/e): leer por token, cancelar, marcar visto y avisado.
grant select, update on public.esperas to service_role;
-- Solo embebida en mesa_sesiones (link del push al QR de la mesa).
grant select on public.mesas to service_role;

-- Accesos del equipo (grantAppAccess / revokeAppAccess / setAppAccessRole).
grant select, update on public.usuarios to service_role;
grant select, insert, update, delete on public.usuario_sucursal to service_role;
grant select (id, local_id, nombre, rol, activo, created_at, tiene_pin, usuario_id)
  on public.empleados to service_role;
grant update (usuario_id) on public.empleados to service_role;

-- Pedido de cupo del dueño y leads del formulario público.
grant select, insert, update on public.pedidos_sucursal to service_role;
grant select, insert, update on public.solicitudes to service_role;

-- Web Push: claves del navegador, solo el server las toca.
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- Registro de mails enviados (solo alta; se lee desde /admin).
grant insert on public.emails_enviados to service_role;

-- cron_locks, reserva_mesas y cicalino_schema_migrations: sin grants. Las
-- tocan funciones SECURITY DEFINER, triggers o `pnpm db:sql` como postgres.

-- Secuencia de mesa_eventos: los inserts van por funciones SECURITY DEFINER.
-- service_role tiene GRANT ALL sobre la tabla (split-payments.sql); sin la
-- secuencia ese grant no podría insertar.
revoke all on sequence public.mesa_eventos_id_seq
  from public, anon, authenticated, service_role;
grant usage, select on sequence public.mesa_eventos_id_seq to service_role;


-- ---------------------------------------------------------------------------
-- 4) RPC del cron que en una base nueva quedaba sin EXECUTE
--
-- cocina-modo.sql la revoca de public/anon/authenticated sin otorgarla:
-- en producción anda por el default viejo de las funciones.
-- ---------------------------------------------------------------------------
grant execute on function public.marcar_en_preparacion_pendientes() to service_role;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado:
--   anon_*                         → false
--   *_pin_hash                     → false
--   auth_empleados_delete, svc_push → true
--   auth_push, svc_reservas        → false
-- ---------------------------------------------------------------------------
-- select
--   has_table_privilege('anon', 'public.pedidos', 'select')                  as anon_pedidos,
--   has_table_privilege('anon', 'public.push_subscriptions', 'select')       as anon_push,
--   has_column_privilege('authenticated', 'public.empleados', 'pin_hash', 'select') as auth_pin_hash,
--   has_column_privilege('service_role', 'public.empleados', 'pin_hash', 'select')  as svc_pin_hash,
--   has_table_privilege('authenticated', 'public.empleados', 'delete')       as auth_empleados_delete,
--   has_table_privilege('authenticated', 'public.push_subscriptions', 'select') as auth_push,
--   has_table_privilege('service_role', 'public.push_subscriptions', 'select')  as svc_push,
--   has_table_privilege('service_role', 'public.reservas', 'select')         as svc_reservas;
