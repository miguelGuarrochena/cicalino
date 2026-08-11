-- ===========================================================================
-- Cicalino — Fixes #13 (tracking de migraciones SQL)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Orden sugerido: #48 (después de security-fixes-12)
--
-- PROBLEMA
-- Los scripts de supabase/*.sql se corrían a mano sin registro. No había forma
-- de saber qué faltaba aplicar (salvo chequeo-migraciones.sql, de solo lectura).
--
-- FIX
-- Tabla cicalino_schema_migrations. Los scripts `pnpm db:sql` /
-- `pnpm db:sql:baseline` leen/escri esta tabla. No reemplaza el SQL histórico:
-- solo lo hace auditable y repetible hacia adelante.
-- ===========================================================================

create table if not exists public.cicalino_schema_migrations (
  archivo     text primary key,
  aplicado_en timestamptz not null default now()
);

alter table public.cicalino_schema_migrations enable row level security;

comment on table public.cicalino_schema_migrations is
  'Registro de scripts supabase/*.sql aplicados (vía pnpm db:sql / db:sql:baseline).';

-- Sin policies de cliente: solo service_role / dueño de la DB.
