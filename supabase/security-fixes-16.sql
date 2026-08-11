-- ===========================================================================
-- Cicalino — Fixes de seguridad #16 (verificar_pin_empleado grants)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: security-fixes-15.sql
--
-- PROBLEMA
-- CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto. #03/#15 solo hacían
-- GRANT a authenticated, así que anon/PUBLIC seguían pudiendo invocar la RPC
-- (aunque pueda_ver_local rechaza sin sesión).
--
-- FIX
-- REVOKE de public/anon. El flujo legítimo (verifyEmployeePinAction →
-- createServerSupabase) corre como authenticated y usa auth.uid() /
-- puede_ver_local: ese rol es el único necesario.
-- ===========================================================================

revoke all on function public.verificar_pin_empleado(uuid, text)
  from public, anon;

grant execute on function public.verificar_pin_empleado(uuid, text)
  to authenticated;

comment on function public.verificar_pin_empleado(uuid, text) is
  'Verifica PIN de empleado. Solo authenticated (server action / panel). Rate-limited por (uid, empleado). SECURITY DEFINER.';
