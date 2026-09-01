-- ===========================================================================
-- Cicalino — Cerrar marcar_en_preparacion_local a public/anon
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: pedidos-en-preparacion.sql
--
-- PROBLEMA
-- Postgres le da EXECUTE a PUBLIC en cada función nueva, y `anon` hereda de
-- ahí. pedidos-en-preparacion.sql otorgaba a `authenticated` pero no revocaba
-- lo heredado, así que la función quedaba invocable desde una request sin
-- sesión.
--
-- No era una fuga: la primera línea del cuerpo es puede_ver_local(p_local), y
-- para anon eso da false y corta con 'No autorizado'. Pero deja la protección
-- colgando de un solo chequeo, y el resto de las funciones que escriben
-- (crear_pedido en security-fixes-10, liberar_mesas) ya revocan además de
-- otorgar. Esto la alinea.
--
-- Va como script aparte y no editando pedidos-en-preparacion.sql porque ese
-- archivo ya está aplicado: el tracker de cicalino_schema_migrations indexa
-- por nombre, así que un cambio ahí adentro no volvería a ejecutarse nunca y
-- el repo diría una cosa y la base otra. Mismo criterio que security-fixes-14
-- con expirar_reservas_vencidas.
--
-- El chequeo de autorización no se toca: sigue siendo puede_ver_local.
-- ===========================================================================

revoke all on function public.marcar_en_preparacion_local(uuid)
  from public, anon;
grant execute on function public.marcar_en_preparacion_local(uuid)
  to authenticated;


-- ---------------------------------------------------------------------------
-- Chequeo: authenticated tiene que poder, anon no.
-- ---------------------------------------------------------------------------
-- select
--   has_function_privilege('authenticated',
--     'public.marcar_en_preparacion_local(uuid)', 'execute') as auth_ok,
--   has_function_privilege('anon',
--     'public.marcar_en_preparacion_local(uuid)', 'execute') as anon_ok;
