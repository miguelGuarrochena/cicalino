-- ===========================================================================
-- Cicalino — setup de Supabase (correr DESPUÉS de las migraciones de Drizzle)
-- Pegar en: Supabase Dashboard → SQL Editor → New query → Run
-- Es un punto de partida: revisá las policies según tu caso antes de producción.
-- ===========================================================================

-- 1) Vincular la tabla `usuarios` (perfil) con auth.users -------------------
--    El id del perfil = id del usuario de Supabase Auth.
alter table public.usuarios
  alter column id drop default;

alter table public.usuarios
  drop constraint if exists usuarios_id_auth_fk,
  add constraint usuarios_id_auth_fk
    foreign key (id) references auth.users (id) on delete cascade;

-- 2) Trigger: al crear un usuario en Auth, crear su fila en `usuarios` -------
--    El rol / organizacion vienen del metadata que mandamos en la invitación.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.usuarios (id, email, nombre, rol, organizacion_id, local_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce((new.raw_user_meta_data ->> 'rol')::rol_usuario, 'admin'),
    (new.raw_user_meta_data ->> 'organizacion_id')::uuid,
    (new.raw_user_meta_data ->> 'local_id')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Helpers de sesión (leen el perfil del usuario logueado) ----------------
create or replace function public.auth_rol()
returns rol_usuario language sql stable security definer set search_path = public as $$
  select rol from public.usuarios where id = auth.uid();
$$;

create or replace function public.auth_org()
returns uuid language sql stable security definer set search_path = public as $$
  select organizacion_id from public.usuarios where id = auth.uid();
$$;

-- 4) Row Level Security ------------------------------------------------------
alter table public.organizaciones enable row level security;
alter table public.locales        enable row level security;
alter table public.empleados      enable row level security;
alter table public.pedidos        enable row level security;
alter table public.usuarios       enable row level security;

-- Cada usuario ve su propio perfil.
drop policy if exists "perfil propio" on public.usuarios;
create policy "perfil propio" on public.usuarios
  for select using (id = auth.uid() or public.auth_rol() = 'superadmin');

-- Organización: el dueño ve la suya; el superadmin, todas. (El update de
-- facturación queda solo para el superadmin en la sección 9.)
drop policy if exists "org de mi empresa" on public.organizaciones;
create policy "org de mi empresa" on public.organizaciones
  for select using (id = public.auth_org() or public.auth_rol() = 'superadmin');

-- Empleados / pedidos: dentro de la organización del usuario (o todo, si es SA).
drop policy if exists "empleados de mi org" on public.empleados;
create policy "empleados de mi org" on public.empleados
  for all using (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  )
  with check (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  );

drop policy if exists "pedidos de mi org" on public.pedidos;
create policy "pedidos de mi org" on public.pedidos
  for all using (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  )
  with check (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  );

-- Nota: la vista pública del cliente (/p/[token]) NO usa estas policies.
-- Se resuelve en un route handler del server con el service_role, leyendo el
-- pedido por qr_token y devolviendo solo lo mínimo (referencia, estado, local).

-- 5) Realtime: habilitar cambios en `pedidos` para el panel multi-caja ------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;

-- 6) Web Push: RLS en push_subscriptions (solo el server con service_role la toca)
--    Sin policies => anon/authenticated no acceden; el service_role saltea RLS.
alter table public.push_subscriptions enable row level security;

-- 7) Facturación manual: ciclo de plan (mensual/anual/gratis) + cortesía ------
alter table public.organizaciones
  add column if not exists plan text not null default 'mensual',
  add column if not exists mes_gratis_hasta timestamptz,
  add column if not exists telefono text;

-- 8) Solicitudes de prueba (leads del formulario público) --------------------
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  local text,
  ciudad text,
  estado text not null default 'nueva',
  creado_en timestamptz not null default now()
);
-- RLS: solo el server con service_role la toca (form público inserta por action).
alter table public.solicitudes enable row level security;

-- Marca de "visto": cuándo el cliente abrió el link del QR (cierra el popup).
alter table public.pedidos
  add column if not exists visto_en timestamptz;

-- Hora de corte de la jornada por sucursal (0-23; default 6:00).
alter table public.locales
  add column if not exists hora_corte integer not null default 6;

-- 9) Endurecer RLS de facturación (revisión de seguridad) --------------------
-- El dueño NO debe poder modificar su facturación (pagado/activo/plan/cupo/
-- mes_gratis_hasta): eso es solo del superadmin. La policy vieja dejaba al dueño
-- actualizar su propia fila de organizaciones. La reemplazamos.
drop policy if exists "org update dueño/SA" on public.organizaciones;
drop policy if exists "org update SA" on public.organizaciones;
create policy "org update SA" on public.organizaciones
  for update using (public.auth_rol() = 'superadmin')
  with check (public.auth_rol() = 'superadmin');

-- El dueño ve y edita la config de sus sucursales (SELECT/UPDATE), pero crear o
-- borrar sucursales (impacta el cupo/cobro) queda solo para el superadmin.
drop policy if exists "sucursales de mi org" on public.locales;
drop policy if exists "locales select org/SA" on public.locales;
drop policy if exists "locales update org/SA" on public.locales;
drop policy if exists "locales insert SA" on public.locales;
drop policy if exists "locales delete SA" on public.locales;
create policy "locales select org/SA" on public.locales
  for select using (
    organizacion_id = public.auth_org() or public.auth_rol() = 'superadmin'
  );
create policy "locales update org/SA" on public.locales
  for update using (
    organizacion_id = public.auth_org() or public.auth_rol() = 'superadmin'
  )
  with check (
    organizacion_id = public.auth_org() or public.auth_rol() = 'superadmin'
  );
create policy "locales insert SA" on public.locales
  for insert with check (public.auth_rol() = 'superadmin');
create policy "locales delete SA" on public.locales
  for delete using (public.auth_rol() = 'superadmin');
