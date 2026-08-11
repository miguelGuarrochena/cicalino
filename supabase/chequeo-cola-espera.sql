-- ===========================================================================
-- Cicalino — Chequeo de permisos de cola_de_espera (Medium)
-- Correr en: Supabase Dashboard → SQL Editor. SOLO LECTURA.
-- Requiere: security-fixes-08.sql aplicado.
--
-- Esperado: anon/authenticated/public = false, service_role = true
-- ===========================================================================

select
  has_function_privilege('anon', 'public.cola_de_espera(text)', 'execute')
    as anon_puede,
  has_function_privilege('authenticated', 'public.cola_de_espera(text)', 'execute')
    as authenticated_puede,
  has_function_privilege('public', 'public.cola_de_espera(text)', 'execute')
    as public_puede,
  has_function_privilege('service_role', 'public.cola_de_espera(text)', 'execute')
    as service_role_puede;
