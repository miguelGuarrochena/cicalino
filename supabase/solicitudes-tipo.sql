-- Cicalino — tipo de solicitud (prueba vs contratar plan)
-- Corré en el SQL Editor de Supabase (una vez).

alter table public.solicitudes
  add column if not exists tipo text not null default 'prueba';

alter table public.solicitudes
  add column if not exists plan text;

alter table public.solicitudes
  add column if not exists cuil text;

alter table public.solicitudes
  add column if not exists telefono text;

alter table public.solicitudes
  add column if not exists direccion text;

alter table public.solicitudes
  drop constraint if exists solicitudes_tipo_valido;

alter table public.solicitudes
  add constraint solicitudes_tipo_valido
  check (tipo in ('prueba', 'contrato'));

alter table public.solicitudes
  drop constraint if exists solicitudes_plan_valido;

alter table public.solicitudes
  add constraint solicitudes_plan_valido
  check (plan is null or plan in ('mensual', 'anual'));

comment on column public.solicitudes.tipo is
  'prueba = mes gratis (/probar); contrato = quiere pagar el plan elegido (/precios).';
comment on column public.solicitudes.plan is
  'Plan pedido en contratar: mensual | anual (null en prueba).';
comment on column public.solicitudes.cuil is
  'CUIL/CUIT (11 dígitos) del contratante; obligatorio en tipo=contrato.';
comment on column public.solicitudes.telefono is
  'Teléfono / WhatsApp; obligatorio en tipo=contrato.';
comment on column public.solicitudes.direccion is
  'Dirección del local; pedida en tipo=contrato.';
