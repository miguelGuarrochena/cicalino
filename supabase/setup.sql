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
create policy "perfil propio" on public.usuarios
  for select using (id = auth.uid() or public.auth_rol() = 'superadmin');

-- Organización: el dueño ve/edita la suya; el superadmin, todas.
create policy "org de mi empresa" on public.organizaciones
  for select using (id = public.auth_org() or public.auth_rol() = 'superadmin');
create policy "org update dueño/SA" on public.organizaciones
  for update using (id = public.auth_org() or public.auth_rol() = 'superadmin');

-- Sucursales / empleados / pedidos: dentro de la organización del usuario
-- (o todo, si es superadmin). Afinar por sucursal para supervisor/empleado
-- se hace además en las queries (scope por local_id activo).
create policy "sucursales de mi org" on public.locales
  for all using (organizacion_id = public.auth_org() or public.auth_rol() = 'superadmin')
  with check (organizacion_id = public.auth_org() or public.auth_rol() = 'superadmin');

create policy "empleados de mi org" on public.empleados
  for all using (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  )
  with check (
    local_id in (select id from public.locales where organizacion_id = public.auth_org())
    or public.auth_rol() = 'superadmin'
  );

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
alter publication supabase_realtime add table public.pedidos;
