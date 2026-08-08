-- ===========================================================================
-- Cicalino — Capacidad por mesa (módulo espera)
-- Correr en: Supabase Dashboard → SQL Editor
-- Requiere: modulo-espera.sql
-- Orden sugerido: #21 de 39 (ver chequeo-migraciones.sql)
-- Idempotente.
-- ===========================================================================

alter table public.mesas
  add column if not exists capacidad integer not null default 4
    check (capacidad >= 1 and capacidad <= 50);
