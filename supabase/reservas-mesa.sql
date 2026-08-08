-- ===========================================================================
-- Cicalino — Reservas de mesa (módulo espera)
-- Correr en: Supabase Dashboard → SQL Editor
-- Requiere: setup.sql, modulo-espera.sql
-- Orden sugerido: #8 de 39 (ver chequeo-migraciones.sql)
-- Idempotente: se puede re-ejecutar.
-- ===========================================================================

-- 1) Tabla de reservas
do $$ begin
  create type public.reserva_estado as enum (
    'activa',
    'sentada',
    'cancelada',
    'expirada'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  nombre text not null,
  personas integer not null default 2
    check (personas >= 1 and personas <= 50),
  mesa_numero integer not null check (mesa_numero >= 1),
  horario timestamptz not null,
  gracia_minutos integer not null default 15
    check (gracia_minutos in (15, 20)),
  estado public.reserva_estado not null default 'activa',
  empleado_id uuid references public.empleados (id) on delete set null,
  creado_en timestamptz not null default now(),
  sentado_en timestamptz,
  cancelado_en timestamptz,
  expirado_en timestamptz
);

create index if not exists idx_reservas_local_horario
  on public.reservas (local_id, horario);
create index if not exists idx_reservas_local_estado
  on public.reservas (local_id, estado);

-- 2) Mesas: estado reservada + vínculo a reserva
alter table public.mesas
  drop constraint if exists mesas_estado_check;

alter table public.mesas
  add constraint mesas_estado_check
  check (estado in ('libre', 'ocupada', 'reservada'));

alter table public.mesas
  add column if not exists reserva_id uuid references public.reservas (id) on delete set null;

-- 3) RLS
alter table public.reservas enable row level security;

drop policy if exists "reservas de mi org" on public.reservas;
create policy "reservas de mi org" on public.reservas
  for all using (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  )
  with check (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  );

-- 4) Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservas'
  ) then
    alter publication supabase_realtime add table public.reservas;
  end if;
end $$;
