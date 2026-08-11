-- ===========================================================================
-- Cicalino — Chequeo de policies de usuario_sucursal (High: escalación)
-- Correr en: Supabase Dashboard → SQL Editor. SOLO LECTURA.
-- Requiere: security-fixes-07.sql aplicado.
--
-- Esperado:
--   sin_for_all_vieja   = true
--   policies_select     = 1
--   policies_escritura  = 3
--   cmds_escritura      incluye INSERT, UPDATE, DELETE (no ALL)
-- ===========================================================================

select
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'usuario_sucursal'
       and policyname = 'acceso de mi org'
  ) as sin_for_all_vieja,
  (
    select count(*) from pg_policies
     where schemaname = 'public'
       and tablename = 'usuario_sucursal'
       and policyname = 'usuario_sucursal select'
       and cmd = 'SELECT'
  ) as policies_select,
  (
    select count(*) from pg_policies
     where schemaname = 'public'
       and tablename = 'usuario_sucursal'
       and policyname like 'usuario_sucursal %admin'
       and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ) as policies_escritura,
  (
    select string_agg(cmd, ', ' order by cmd)
      from pg_policies
     where schemaname = 'public'
       and tablename = 'usuario_sucursal'
  ) as cmds_presentes;
