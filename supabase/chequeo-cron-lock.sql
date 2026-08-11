-- ===========================================================================
-- Cicalino — Chequeo de permisos de cron locks (Critical #3)
-- Correr en: Supabase Dashboard → SQL Editor. SOLO LECTURA.
-- Requiere: security-fixes-06.sql aplicado.
--
-- Esperado:
--   tomar_anon / tomar_authenticated / tomar_public     = false
--   soltar_anon / soltar_authenticated / soltar_public = false
--   tomar_service_role / soltar_service_role           = true
-- ===========================================================================

select
  has_function_privilege('anon', 'public.tomar_cron_lock(text, integer)', 'execute')
    as tomar_anon,
  has_function_privilege('authenticated', 'public.tomar_cron_lock(text, integer)', 'execute')
    as tomar_authenticated,
  has_function_privilege('public', 'public.tomar_cron_lock(text, integer)', 'execute')
    as tomar_public,
  has_function_privilege('service_role', 'public.tomar_cron_lock(text, integer)', 'execute')
    as tomar_service_role,
  has_function_privilege('anon', 'public.soltar_cron_lock(text)', 'execute')
    as soltar_anon,
  has_function_privilege('authenticated', 'public.soltar_cron_lock(text)', 'execute')
    as soltar_authenticated,
  has_function_privilege('public', 'public.soltar_cron_lock(text)', 'execute')
    as soltar_public,
  has_function_privilege('service_role', 'public.soltar_cron_lock(text)', 'execute')
    as soltar_service_role;
