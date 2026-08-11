-- ===========================================================================
-- Cicalino — Fixes de seguridad #11 (TTL del token de contrato)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: contrato-aceptacion.sql
-- Orden sugerido: #46 (después de security-fixes-10)
--
-- PROBLEMA
-- contrato_token no tenía fecha de emisión: un link filtrado quedaba válido
-- para siempre.
--
-- FIX
-- Columna contrato_token_creado_en. La app rechaza tokens más viejos que el
-- TTL (7 días) y regenera el token al reenviar el mail.
-- Filas con token pero sin fecha se tratan como vencidas (hay que reenviar).
-- ===========================================================================

alter table public.organizaciones
  add column if not exists contrato_token_creado_en timestamptz;

comment on column public.organizaciones.contrato_token_creado_en is
  'Cuándo se emitió contrato_token. La app valida TTL (~7 días).';

-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: true
-- ---------------------------------------------------------------------------
-- select exists (
--   select 1 from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'organizaciones'
--      and column_name = 'contrato_token_creado_en'
-- ) as tiene_contrato_token_creado_en;
