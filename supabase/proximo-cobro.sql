-- Cicalino — próximo cobro + anti-spam de avisos
-- Corré esto en el SQL Editor de Supabase (una vez).

alter table public.organizaciones
  add column if not exists proximo_cobro_en timestamptz;

alter table public.organizaciones
  add column if not exists aviso_cobro_en timestamptz;

comment on column public.organizaciones.proximo_cobro_en is
  'Fecha del próximo cobro (manual). Se setea al marcar Pagado o al dar mes gratis.';
comment on column public.organizaciones.aviso_cobro_en is
  'Última vez que se mandó mail de recordatorio de cobro (anti-spam diario).';

-- Orgs en mes gratis: el próximo cobro es cuando termina la cortesía.
update public.organizaciones
   set proximo_cobro_en = mes_gratis_hasta
 where mes_gratis_hasta is not null
   and mes_gratis_hasta > now()
   and proximo_cobro_en is null
   and plan is distinct from 'gratis';
