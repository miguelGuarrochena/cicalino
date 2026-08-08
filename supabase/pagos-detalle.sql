-- ===========================================================================
-- Cicalino — Desglose por sucursal en cada pago
-- Correr en: Supabase Dashboard → SQL Editor
-- Requiere: suscripciones.sql
-- Orden sugerido: #25 de 39 (ver chequeo-migraciones.sql)
-- Idempotente.
--
-- El cliente paga una sola vez por el total, pero queda registrado qué parte
-- corresponde a cada sucursal.
--
-- Es una foto del momento del pago, no una relación: si más adelante borrás
-- una sucursal, el pago histórico sigue mostrando que existía y cuánto pagó.
-- Con una foreign key esa fila se perdería.
-- ===========================================================================

alter table public.pagos
  add column if not exists detalle jsonb not null default '[]'::jsonb;

comment on column public.pagos.detalle is
  'Foto del desglose al momento del pago: [{ sucursal_id, nombre, pack, monto }]';
