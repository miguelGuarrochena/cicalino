-- ===========================================================================
-- Cicalino — Acceso del encargado a varias sucursales
-- Correr en: Supabase Dashboard → SQL Editor
-- Requiere: setup.sql, usuarios-sucursales.sql, modulo-espera.sql, reservas-mesa.sql
-- Orden sugerido: #9 de 39 (ver chequeo-migraciones.sql)
-- Requiere haber corrido antes: usuarios-sucursales.sql
-- (empleados-acceso.sql puede correrse antes o después: no importa el orden)
-- Idempotente.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Las sucursales que puede abrir el usuario logueado.
--
-- Fuente principal: usuario_sucursal. Se mantiene usuarios.local_id como
-- respaldo para que ninguna cuenta vieja se quede afuera si por lo que sea
-- no llegó a tener su fila de acceso.
-- ---------------------------------------------------------------------------
create or replace function public.auth_locales()
returns setof uuid language sql stable security definer set search_path = public as $$
  select local_id from public.usuario_sucursal where usuario_id = auth.uid()
  union
  select local_id from public.usuarios
   where id = auth.uid() and local_id is not null;
$$;

-- ---------------------------------------------------------------------------
-- 2) El chequeo central. Todas las policies pasan por acá, así que este es
--    el único lugar donde cambia la regla del supervisor.
-- ---------------------------------------------------------------------------
create or replace function public.puede_ver_local(p_local uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.auth_rol()::text
    when 'superadmin' then true
    when 'supervisor' then p_local in (select public.auth_locales())
    when 'admin' then exists (
      select 1 from public.locales l
      where l.id = p_local and l.organizacion_id = public.auth_org()
    )
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Vínculo empleado → cuenta. Va acá también para que no importe el orden
--    en que corras los scripts.
--
--    Si corriste una versión anterior de empleados-acceso.sql, ese índice era
--    único y bloqueaba que la misma cuenta tuviera ficha en dos locales.
-- ---------------------------------------------------------------------------
alter table public.empleados
  add column if not exists usuario_id uuid
    references public.usuarios (id) on delete set null;

drop index if exists public.uq_empleados_usuario;
create index if not exists idx_empleados_usuario
  on public.empleados (usuario_id)
  where usuario_id is not null;

-- ---------------------------------------------------------------------------
-- 4) Espera, mesas y reservas seguían filtrando por organización.
--
-- Un encargado de la sucursal Centro podía leer y escribir la lista de
-- espera, las mesas y las reservas de Palermo. Es la misma fuga que se
-- corrigió en el fix 2 para pedidos y empleados, que estas tablas no
-- llegaron a heredar porque son posteriores.
-- ---------------------------------------------------------------------------
drop policy if exists "esperas de mi org" on public.esperas;
drop policy if exists "esperas de mi scope" on public.esperas;
create policy "esperas de mi scope" on public.esperas
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id));

drop policy if exists "mesas de mi org" on public.mesas;
drop policy if exists "mesas de mi scope" on public.mesas;
create policy "mesas de mi scope" on public.mesas
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id));

drop policy if exists "reservas de mi org" on public.reservas;
drop policy if exists "reservas de mi scope" on public.reservas;
create policy "reservas de mi scope" on public.reservas
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id));

-- ---------------------------------------------------------------------------
-- 5) Chequeo. Cada fila es un usuario y las sucursales que puede abrir.
--    Un supervisor con 0 sucursales no ve nada: revisá su acceso.
-- ---------------------------------------------------------------------------
select
  u.email,
  u.rol,
  coalesce(
    (select count(*) from public.usuario_sucursal us where us.usuario_id = u.id),
    0
  ) as sucursales_asignadas,
  u.local_id as sucursal_vieja
from public.usuarios u
where u.rol = 'supervisor'
order by u.email;
