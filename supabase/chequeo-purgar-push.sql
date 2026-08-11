-- ===========================================================================
-- Cicalino — Chequeo de permisos de purgar_push_viejas (Critical #2)
-- Correr en: Supabase Dashboard → SQL Editor. SOLO LECTURA.
-- Requiere: security-fixes-05.sql aplicado.
--
-- Esperado:
--   anon_puede           = false
--   authenticated_puede  = false
--   public_puede         = false
--   service_role_puede   = true
--   valida_p_dias        = true  (el cuerpo rechaza p_dias < 1)
-- ===========================================================================

select
  has_function_privilege('anon', 'public.purgar_push_viejas(integer)', 'execute')
    as anon_puede,
  has_function_privilege('authenticated', 'public.purgar_push_viejas(integer)', 'execute')
    as authenticated_puede,
  has_function_privilege('public', 'public.purgar_push_viejas(integer)', 'execute')
    as public_puede,
  has_function_privilege('service_role', 'public.purgar_push_viejas(integer)', 'execute')
    as service_role_puede,
  (
    select pg_get_functiondef(p.oid) ilike '%p_dias debe ser >= 1%'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'purgar_push_viejas'
       and pg_get_function_identity_arguments(p.oid) = 'p_dias integer'
  ) as valida_p_dias;
