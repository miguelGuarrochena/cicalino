-- ===========================================================================
-- Cicalino — Alta y baja de sucursales sin borrarlas
-- Correr en: Supabase Dashboard → SQL Editor
-- Idempotente.
--
-- Una sucursal dada de baja deja de sumar al cobro del cliente, pero no se
-- borra: conserva su historial y se puede reactivar cuando vuelve a operar.
-- ===========================================================================

alter table public.locales
  add column if not exists activa boolean not null default true,
  add column if not exists baja_en timestamptz;

comment on column public.locales.activa is
  'false = dada de baja: no suma al cobro mensual, pero conserva su historial.';
