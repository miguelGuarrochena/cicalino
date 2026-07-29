-- Cicalino — pack de módulos en solicitudes de contrato
-- Corré en Supabase SQL Editor (una vez). Idempotente.

alter table public.solicitudes
  add column if not exists pack text;

alter table public.solicitudes
  drop constraint if exists solicitudes_pack_valido;

alter table public.solicitudes
  add constraint solicitudes_pack_valido
  check (pack is null or pack in ('pedidos', 'espera', 'pack'));

comment on column public.solicitudes.pack is
  'Módulos pedidos en /precios: pedidos | espera | pack (ambos). Null en prueba.';
