-- ===========================================================================
-- Cicalino — Estados de la cuenta compartida (enums)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: split-payments.sql, mesa-pago-qr-mp-enum.sql
--
-- `definido` es la parte que un comensal ya eligió, todavía no pedida al
-- local. `porcentaje` es una forma de calcular esa parte. Van en un script
-- aparte porque Postgres no deja usar un valor nuevo de enum en la misma
-- transacción que lo agrega (mismo patrón que mesa-pago-qr-mp-enum.sql).
-- ===========================================================================

alter type public.pago_mesa_estado add value if not exists 'definido';
alter type public.division_modo add value if not exists 'porcentaje';
