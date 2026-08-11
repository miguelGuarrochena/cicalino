-- ===========================================================================
-- Cicalino — Fixes de seguridad #06 (cron locks: revoke EXECUTE)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: cron-lock.sql
-- Orden sugerido: #41 (después de cron-lock.sql / security-fixes-05)
--
-- PROBLEMA
-- `tomar_cron_lock` y `soltar_cron_lock` son SECURITY DEFINER y tocan
-- `cron_locks` (tabla sin policies de cliente). Al crearlas en cron-lock.sql
-- quedaron con EXECUTE para PUBLIC (default de Postgres), así que cualquier
-- sesión authenticated podía:
--
--   rpc('tomar_cron_lock', { p_nombre: 'cobros', p_segundos: 999999 })
--     → bloquea el cron diario (cobros, emails, expiraciones, push purge)
--
--   rpc('soltar_cron_lock', { p_nombre: 'cobros' })
--     → libera el lock a mitad de una corrida → mails/procesos duplicados
--
-- El único llamador legítimo es /api/cron/cobros con service_role + CRON_SECRET.
-- Mismo patrón que security-fixes-05 (purgar_push_viejas) y
-- expirar_reservas_vencidas.
--
-- No se cambia la lógica del lock: solo los grants.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Mínimo privilegio: solo service_role (cron). Nadie más.
-- ---------------------------------------------------------------------------
revoke execute on function public.tomar_cron_lock(text, integer)
  from public, anon, authenticated;

revoke execute on function public.soltar_cron_lock(text)
  from public, anon, authenticated;

grant execute on function public.tomar_cron_lock(text, integer) to service_role;

grant execute on function public.soltar_cron_lock(text) to service_role;


-- ---------------------------------------------------------------------------
-- 2) Chequeo de permisos (solo lectura). Esperado:
--      anon / authenticated → false en ambas
--      service_role         → true en ambas
-- ---------------------------------------------------------------------------
select
  has_function_privilege('anon', 'public.tomar_cron_lock(text, integer)', 'execute')
    as tomar_anon,
  has_function_privilege('authenticated', 'public.tomar_cron_lock(text, integer)', 'execute')
    as tomar_authenticated,
  has_function_privilege('service_role', 'public.tomar_cron_lock(text, integer)', 'execute')
    as tomar_service_role,
  has_function_privilege('anon', 'public.soltar_cron_lock(text)', 'execute')
    as soltar_anon,
  has_function_privilege('authenticated', 'public.soltar_cron_lock(text)', 'execute')
    as soltar_authenticated,
  has_function_privilege('service_role', 'public.soltar_cron_lock(text)', 'execute')
    as soltar_service_role;
