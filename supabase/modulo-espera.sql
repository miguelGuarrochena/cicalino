-- ===========================================================================
-- Cicalino — Módulo Espera de mesa (+ flags de módulos contratados)
-- Correr en: Supabase Dashboard → SQL Editor
-- Idempotente: se puede re-ejecutar.
-- ===========================================================================

-- 1) Módulos contratados a nivel organización (cobro)
alter table public.organizaciones
  add column if not exists modulo_pedidos boolean not null default true,
  add column if not exists modulo_espera boolean not null default false;

-- Al menos un módulo (si alguien apaga ambos, pedidos queda on)
update public.organizaciones
set modulo_pedidos = true
where modulo_pedidos = false and modulo_espera = false;

-- 2) Módulos activos por sucursal (subset de lo contratado)
alter table public.locales
  add column if not exists modulo_pedidos boolean not null default true,
  add column if not exists modulo_espera boolean not null default false;

-- Heredar de la org al aplicar (locales que aún no tenían espera)
update public.locales l
set
  modulo_pedidos = o.modulo_pedidos,
  modulo_espera = o.modulo_espera
from public.organizaciones o
where l.organizacion_id = o.id;

-- 3) Cola de espera de mesa
do $$ begin
  create type public.espera_estado as enum (
    'esperando',
    'avisado',
    'sentado',
    'cancelado'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.esperas (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  nombre text not null,
  personas integer not null default 2
    check (personas >= 1 and personas <= 50),
  estado public.espera_estado not null default 'esperando',
  mesa_numero integer,
  qr_token text not null,
  qr_expira_en timestamptz not null,
  empleado_id uuid references public.empleados (id) on delete set null,
  creado_en timestamptz not null default now(),
  avisado_en timestamptz,
  sentado_en timestamptz,
  cancelado_en timestamptz,
  visto_en timestamptz
);

create unique index if not exists uq_esperas_qr_token on public.esperas (qr_token);
create index if not exists idx_esperas_local_estado on public.esperas (local_id, estado);
create index if not exists idx_esperas_local_creado on public.esperas (local_id, creado_en);

-- 4) Estado de cada mesa física
create table if not exists public.mesas (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  numero integer not null check (numero >= 1),
  estado text not null default 'libre' check (estado in ('libre', 'ocupada')),
  espera_id uuid references public.esperas (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  unique (local_id, numero)
);

create index if not exists idx_mesas_local on public.mesas (local_id);

-- 5) Push: permitir suscripción por espera (además de pedido)
alter table public.push_subscriptions
  alter column pedido_id drop not null;

alter table public.push_subscriptions
  add column if not exists espera_id uuid references public.esperas (id) on delete cascade;

-- 6) RLS
alter table public.esperas enable row level security;
alter table public.mesas enable row level security;

drop policy if exists "esperas de mi org" on public.esperas;
create policy "esperas de mi org" on public.esperas
  for all using (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  )
  with check (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  );

drop policy if exists "mesas de mi org" on public.mesas;
create policy "mesas de mi org" on public.mesas
  for all using (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  )
  with check (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  );

-- 7) Realtime para panel multi-dispositivo
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'esperas'
  ) then
    alter publication supabase_realtime add table public.esperas;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mesas'
  ) then
    alter publication supabase_realtime add table public.mesas;
  end if;
end $$;
