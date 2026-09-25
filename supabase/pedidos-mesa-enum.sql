-- ===========================================================================
-- Cicalino — Pedidos en modalidad Mesa: estado "pendiente de pago" (enum)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: setup.sql
--
-- Un pedido que el cliente armó desde el QR de la mesa y todavía no pagó.
-- No es trabajo para la cocina: recién sale de acá cuando hay un cobro
-- confirmado (pedidos-mesa.sql lo exige en la base).
--
-- Va en un script aparte porque Postgres no deja usar un valor nuevo de enum
-- en la misma transacción que lo agrega (mismo patrón que mesa-cuenta-enum.sql).
-- ===========================================================================

alter type public.order_status add value if not exists 'pendiente_pago';
