-- Cicalino — token de aceptación de contrato / condiciones
-- Corré esto en el SQL Editor de Supabase (una vez).

alter table public.organizaciones
  add column if not exists contrato_token text;

alter table public.organizaciones
  add column if not exists contrato_aceptado_en timestamptz;

alter table public.organizaciones
  add column if not exists terminos_version text;

create unique index if not exists uq_organizaciones_contrato_token
  on public.organizaciones (contrato_token)
  where contrato_token is not null;

comment on column public.organizaciones.contrato_token is
  'Token opaco para /aceptar/[token] (condiciones + datos de pago).';
comment on column public.organizaciones.contrato_aceptado_en is
  'Cuándo el dueño aceptó las bases y condiciones vigentes.';
comment on column public.organizaciones.terminos_version is
  'Versión de términos aceptada (ej. 2026-07-29).';
