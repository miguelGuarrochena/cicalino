-- ===========================================================================
-- Cicalino — Chequeo de permisos de cron locks (Critical #3 + #12)
-- Correr en: Supabase Dashboard → SQL Editor. SOLO LECTURA.
-- Requiere: security-fixes-06.sql y security-fixes-12.sql aplicados.
--
-- Esperado:
--   tomar_anon / tomar_authenticated / tomar_public     = false
--   soltar_anon / soltar_authenticated / soltar_public = false
--   tomar_service_role / soltar_service_role           = true
--   tiene_token = true
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
  has_function_privilege('anon', 'public.soltar_cron_lock(text, text)', 'execute')
    as soltar_anon,
  has_function_privilege('authenticated', 'public.soltar_cron_lock(text, text)', 'execute')
    as soltar_authenticated,
  has_function_privilege('public', 'public.soltar_cron_lock(text, text)', 'execute')
    as soltar_public,
  has_function_privilege('service_role', 'public.soltar_cron_lock(text, text)', 'execute')
    as soltar_service_role,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'cron_locks'
       and column_name = 'token'
  ) as tiene_token,
  /* La firma vieja soltar(text) no debe quedar (evita soltar sin ownership). */
  not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'soltar_cron_lock'
       and pg_get_function_identity_arguments(p.oid) = 'text'
  ) as sin_soltar_sin_token;
