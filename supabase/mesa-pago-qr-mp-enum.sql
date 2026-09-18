-- ===========================================================================
-- Cicalino — Valor de enum para QR de Mercado Pago (presencial)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: split-payments.sql
--
-- ADD VALUE no se puede usar en la misma transacción que el resto.
-- Este script va solo; mesa-pago-qr-mp.sql corre después.
-- ===========================================================================

alter type public.metodo_pago_mesa add value if not exists 'qr_mercado_pago';
