-- ===========================================================================
-- Cicalino — Capacidad por mesa (módulo espera)
-- Correr en: Supabase Dashboard → SQL Editor
-- Idempotente.
-- ===========================================================================

alter table public.mesas
  add column if not exists capacidad integer not null default 4
    check (capacidad >= 1 and capacidad <= 50);
