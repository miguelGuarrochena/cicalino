-- ===========================================================================
-- Cicalino — Responsable de sucursal y acceso multi-sucursal
-- Correr en: Supabase Dashboard → SQL Editor
-- Requiere: setup.sql
-- Orden sugerido: #5 de 39 (ver chequeo-migraciones.sql)
-- Idempotente.
--
-- Dos cosas distintas que conviene no mezclar:
--   responsable_id  = a quién le reclamo si pasa algo en este local
--   usuario_sucursal = quién puede abrir la pantalla de este local
-- Una persona puede ser responsable de una y tener acceso a varias.
-- ===========================================================================

-- 1) Responsable de cada sucursal
alter table public.locales
  add column if not exists responsable_id uuid
    references public.usuarios (id) on delete set null;

comment on column public.locales.responsable_id is
  'Encargado del local. No implica permisos: el acceso vive en usuario_sucursal.';

-- 2) Acceso a sucursales.
--    El dueño (rol admin) NO necesita filas acá: ve todas las de su empresa.
--    Solo el supervisor tiene asignaciones explícitas.
create table if not exists public.usuario_sucursal (
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  local_id uuid not null references public.locales (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, local_id)
);

create index if not exists idx_usuario_sucursal_local
  on public.usuario_sucursal (local_id);

alter table public.usuario_sucursal enable row level security;

drop policy if exists "acceso de mi org" on public.usuario_sucursal;
create policy "acceso de mi org" on public.usuario_sucursal
  for all using (
    local_id in (
      select id from public.locales where organizacion_id = public.auth_org()
    )
    or public.auth_rol() = 'superadmin'
  )
  with check (
    local_id in (
      select id from public.locales where organizacion_id = public.auth_org()
    )
    or public.auth_rol() = 'superadmin'
  );

-- 3) Backfill: los supervisores que hoy tienen una sola sucursal en
--    usuarios.local_id pasan a tener esa fila de acceso.
insert into public.usuario_sucursal (usuario_id, local_id)
select u.id, u.local_id
from public.usuarios u
where u.local_id is not null
  and u.rol = 'supervisor'
on conflict do nothing;
