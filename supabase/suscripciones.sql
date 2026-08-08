-- ===========================================================================
-- Cicalino — Suscripciones y facturación manual
-- Correr en: Supabase Dashboard → SQL Editor
-- Requiere: setup.sql
-- Orden sugerido: #24 de 39 (ver chequeo-migraciones.sql)
-- Idempotente: se puede re-ejecutar.
--
-- Modelo:
--   Cada organización tiene su propio ciclo, anclado al día de alta.
--   Prueba de 30 días → primera factura al día siguiente → mensual desde ahí.
--   Las sucursales nuevas quedan gratis hasta la próxima fecha de facturación.
-- ===========================================================================

-- 1) Estados de suscripción
do $$ begin
  create type public.estado_suscripcion as enum (
    'trial',
    'active',
    'pending_payment',
    'expired',
    'paused'
  );
exception when duplicate_object then null;
end $$;

-- 2) Campos de suscripción en la organización
alter table public.organizaciones
  add column if not exists estado_suscripcion public.estado_suscripcion
    not null default 'trial',
  add column if not exists prueba_inicio date,
  add column if not exists prueba_fin date,
  add column if not exists proxima_factura date,
  -- Día del mes del ciclo (1-31). Si el mes no lo tiene, se usa el último.
  add column if not exists dia_ciclo integer
    check (dia_ciclo is null or (dia_ciclo >= 1 and dia_ciclo <= 31)),
  add column if not exists ultimo_pago_en date,
  add column if not exists suspendida_en timestamptz,
  -- Marcas de los avisos ya enviados. Sin esto, si el cron corre dos veces
  -- (reintento, redeploy) el cliente recibe el mismo mail repetido.
  add column if not exists bienvenida_en timestamptz,
  add column if not exists aviso_prueba_5d_en timestamptz,
  add column if not exists aviso_prueba_fin_en timestamptz;

-- 3) Las sucursales entran al cobro en una fecha propia.
--    Al crearse: la próxima factura de su organización.
alter table public.locales
  add column if not exists cobro_desde date;

-- 4) Historial de pagos (cobro manual: lo carga el superadmin)
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null
    references public.organizaciones (id) on delete cascade,
  fecha date not null default current_date,
  monto integer not null check (monto >= 0),
  -- Período que cubre el pago, para poder reconstruir el historial.
  periodo_desde date not null,
  periodo_hasta date not null,
  medio text,
  nota text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_pagos_org_fecha
  on public.pagos (organizacion_id, fecha desc);

alter table public.pagos enable row level security;

drop policy if exists "pagos solo superadmin" on public.pagos;
create policy "pagos solo superadmin" on public.pagos
  for all using (public.auth_rol() = 'superadmin')
  with check (public.auth_rol() = 'superadmin');

-- ===========================================================================
-- 5) Backfill de lo que ya existe.
--    Los clientes actuales NO entran en prueba: ya venían operando.
-- ===========================================================================

-- 5a) Fecha de próxima factura: la que ya estaba cargada, o un mes desde el alta.
update public.organizaciones
set proxima_factura = coalesce(
      proximo_cobro_en::date,
      (creado_en + interval '30 days')::date
    )
where proxima_factura is null;

-- 5b) El día de ciclo sale de esa fecha.
update public.organizaciones
set dia_ciclo = extract(day from proxima_factura)::int
where dia_ciclo is null and proxima_factura is not null;

-- 5c) Estado: se deduce de las banderas viejas.
update public.organizaciones
set estado_suscripcion = case
      when plan = 'gratis' then 'active'::public.estado_suscripcion
      when not activo then 'expired'::public.estado_suscripcion
      when not pagado then 'pending_payment'::public.estado_suscripcion
      else 'active'::public.estado_suscripcion
    end
where estado_suscripcion = 'trial';

-- 5d) Las sucursales existentes ya se venían cobrando.
update public.locales
set cobro_desde = created_at::date
where cobro_desde is null;

-- 5e) Prueba: las cuentas viejas no tuvieron, queda registrada la del alta.
update public.organizaciones
set prueba_inicio = creado_en::date,
    prueba_fin = (creado_en + interval '30 days')::date
where prueba_inicio is null;
