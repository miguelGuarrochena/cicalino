-- ===========================================================================
-- Cicalino — Staff role value
-- Run in: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotent.
-- Requires: setup.sql
--
-- Adds 'empleado' (waiter / floor staff) to rol_usuario. It lives in its own
-- script because Postgres doesn't let a transaction use an enum value it just
-- added; staff-roles.sql, which runs next, relies on it.
--
-- Nothing else changes here and no existing account is modified.
-- ===========================================================================

alter type public.rol_usuario add value if not exists 'empleado';
