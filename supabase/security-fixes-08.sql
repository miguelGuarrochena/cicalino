-- ===========================================================================
-- Cicalino — Fixes de seguridad #08 (cola_de_espera: solo service_role)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: cola-espera.sql
-- Orden sugerido: #43 (después de security-fixes-07)
--
-- PROBLEMA
-- cola-espera.sql hacía GRANT EXECUTE a authenticated. La función es
-- SECURITY DEFINER y, con solo un qr_token, devolvía tamaño/posición de la
-- cola sin pasar por el rate limit de /api/e/[token].
--
-- El único llamador legítimo es src/app/api/e/[token]/route.ts con
-- createAdminSupabase() (service_role). No hace falta que authenticated
-- pueda invocarla.
-- ===========================================================================

revoke execute on function public.cola_de_espera(text)
  from public, anon, authenticated;

grant execute on function public.cola_de_espera(text) to service_role;


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado:
--   anon / authenticated / public → false
--   service_role                  → true
-- ---------------------------------------------------------------------------
select
  has_function_privilege('anon', 'public.cola_de_espera(text)', 'execute')
    as anon_puede,
  has_function_privilege('authenticated', 'public.cola_de_espera(text)', 'execute')
    as authenticated_puede,
  has_function_privilege('public', 'public.cola_de_espera(text)', 'execute')
    as public_puede,
  has_function_privilege('service_role', 'public.cola_de_espera(text)', 'execute')
    as service_role_puede;
