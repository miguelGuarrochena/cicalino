-- ===========================================================================
-- Cicalino — Fixes de seguridad #14 (grants service_role + tablas server-only)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: reservas-expirar.sql, setup.sql, cron-lock.sql, reservas-sin-solape.sql
-- Orden sugerido: #49 (después de security-fixes-13)
--
-- PROBLEMA
-- 1) expirar_reservas_vencidas se revocó a anon/authenticated pero nunca se
--    otorgó EXECUTE a service_role de forma explícita. El cron depende de ella.
-- 2) Tablas "solo server" (solicitudes, push_subscriptions, cron_locks,
--    reserva_mesas, cicalino_schema_migrations) tienen RLS sin policies:
--    deny-by-default para anon/authenticated. Correcto.
--
-- FIX
-- GRANT explícito a service_role en expirar_reservas_vencidas.
-- Comentarios + chequeo de que esas tablas siguen sin policies de cliente.
-- ===========================================================================

revoke execute on function public.expirar_reservas_vencidas()
  from public, anon, authenticated;

grant execute on function public.expirar_reservas_vencidas() to service_role;

comment on function public.expirar_reservas_vencidas() is
  'Barrido global de reservas vencidas. Solo service_role (cron).';

-- ---------------------------------------------------------------------------
-- Policies viejas "de mi org" (pre security-fixes-04 / corte-por-impago).
-- En Postgres las policies de mismo cmd se OR-ean: si queda la vieja junto a
-- "de mi scope", un supervisor puede pasar el WITH CHECK sin local_operativo
-- y sin puede_ver_local. Hay que dropearlas.
-- ---------------------------------------------------------------------------
drop policy if exists "esperas de mi org" on public.esperas;
drop policy if exists "mesas de mi org" on public.mesas;
drop policy if exists "reservas de mi org" on public.reservas;
drop policy if exists "pedidos de mi org" on public.pedidos;
drop policy if exists "empleados de mi org" on public.empleados;

-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado:
--   expirar_anon / expirar_auth = false; expirar_service = true
--   server_only_sin_policies = true
--   sin_policies_org_viejas = true
-- ---------------------------------------------------------------------------
-- select
--   has_function_privilege('anon', 'public.expirar_reservas_vencidas()', 'execute') as expirar_anon,
--   has_function_privilege('authenticated', 'public.expirar_reservas_vencidas()', 'execute') as expirar_auth,
--   has_function_privilege('service_role', 'public.expirar_reservas_vencidas()', 'execute') as expirar_service,
--   not exists (
--     select 1 from pg_policies
--      where tablename in (
--        'solicitudes', 'push_subscriptions', 'cron_locks',
--        'reserva_mesas', 'cicalino_schema_migrations'
--      )
--   ) as server_only_sin_policies,
--   not exists (
--     select 1 from pg_policies
--      where policyname in (
--        'esperas de mi org', 'mesas de mi org', 'reservas de mi org',
--        'pedidos de mi org', 'empleados de mi org'
--      )
--   ) as sin_policies_org_viejas;
