-- ===========================================================================
-- Cicalino — Horario de reservas + días cerrados por sucursal
-- Requiere: setup.sql, modulo-espera.sql (y que exista public.locales)
-- Orden sugerido: después de security-fixes-16 (ver orden.json)
-- Run in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- IMPORTANTE: corré esto en el MISMO proyecto de Supabase donde ya anda
-- Cicalino (el que tiene pedidos/espera). Si ves
--   relation "public.locales" does not exist
-- estás en otro proyecto o en una base vacía.
--
-- Chequeo rápido antes:
--   select to_regclass('public.locales');
-- Tiene que devolver `locales`. Si da null, no sigas con este script.
-- ===========================================================================

do $$
begin
  if to_regclass('public.locales') is null then
    raise exception
      'Falta public.locales. Estás en el proyecto/base equivocado, o todavía no corriste el schema de Cicalino (Drizzle 0000 + supabase/setup.sql).';
  end if;
end $$;

alter table public.locales
  add column if not exists reserva_abre_min integer not null default 660;

alter table public.locales
  add column if not exists reserva_cierra_min integer not null default 1380;

alter table public.locales
  add column if not exists dias_cerrados integer[] not null default '{}'::integer[];

comment on column public.locales.reserva_abre_min is
  'Minutos desde medianoche: primera franja ofrecida en + Reserva (default 11:00 = 660).';
comment on column public.locales.reserva_cierra_min is
  'Minutos desde medianoche: última franja ofrecida en + Reserva (default 23:00 = 1380).';
comment on column public.locales.dias_cerrados is
  'Días de la semana cerrados (0=domingo … 6=sábado, igual que Date.getDay). No aparecen en el picker.';

alter table public.locales
  drop constraint if exists locales_reserva_abre_rango;
alter table public.locales
  add constraint locales_reserva_abre_rango
  check (reserva_abre_min >= 0 and reserva_abre_min <= 1439);

alter table public.locales
  drop constraint if exists locales_reserva_cierra_rango;
alter table public.locales
  add constraint locales_reserva_cierra_rango
  check (reserva_cierra_min >= 0 and reserva_cierra_min <= 1439);

alter table public.locales
  drop constraint if exists locales_reserva_ventana;
alter table public.locales
  add constraint locales_reserva_ventana
  check (reserva_abre_min < reserva_cierra_min);

alter table public.locales
  drop constraint if exists locales_dias_cerrados_rango;
alter table public.locales
  add constraint locales_dias_cerrados_rango
  check (dias_cerrados <@ array[0, 1, 2, 3, 4, 5, 6]::integer[]);

-- ---------------------------------------------------------------------------
-- Chequeo
-- ---------------------------------------------------------------------------
-- select reserva_abre_min, reserva_cierra_min, dias_cerrados
-- from public.locales limit 5;
