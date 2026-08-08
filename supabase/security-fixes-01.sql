-- ===========================================================================
-- Cicalino — Fixes de seguridad #01 (auditoría, parte 1: RLS + autorización)
-- Requiere: setup.sql
-- Orden sugerido: #2 de 39 (ver chequeo-migraciones.sql)
-- Correr DESPUÉS de supabase/setup.sql, en: Dashboard → SQL Editor → Run
-- Es idempotente: se puede correr varias veces.
-- ===========================================================================

-- Chequeo previo: el enum de roles tiene que existir en `public`. Si esto
-- devuelve 0 filas, todavía no corriste las migraciones de Drizzle.
select n.nspname as schema, t.typname as tipo
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where t.typname = 'rol_usuario';


-- ---------------------------------------------------------------------------
-- 🔴 FIX 1 — Escalación de privilegios vía raw_user_meta_data
--
-- El trigger original confiaba en `new.raw_user_meta_data ->> 'rol'` y
-- '...organizacion_id'. Ese objeto lo controla el cliente: con el signup
-- público de Supabase Auth habilitado (viene ON por defecto), cualquiera podía
-- hacer
--     supabase.auth.signUp({ email, password,
--                            options: { data: { rol: 'superadmin' } } })
-- y quedar con rol superadmin, que en las policies ve y edita TODAS las
-- organizaciones, sucursales, pedidos y la facturación.
--
-- Dos defensas:
--   a) 'superadmin' NUNCA se acepta desde metadata (se asigna a mano en la DB).
--   b) El rol/organización de metadata solo se respeta si el usuario fue
--      INVITADO (auth.users.invited_at no es null). En un signUp propio,
--      invited_at es null → el usuario queda sin organización y sin permisos.
--   c) organizacion_id / local_id se validan contra la base (el local tiene que
--      pertenecer a esa organización).
--
-- ➕ Además: en Supabase Dashboard → Authentication → Providers → Email,
--    desactivá "Enable sign ups". La app no tiene registro público.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  -- El tipo va calificado con el schema: al compilar el cuerpo de la función,
  -- Postgres usa el search_path de la sesión, no el del SET de la función.
  v_rol   public.rol_usuario := 'admin';
  v_org   uuid;
  v_local uuid;
  v_meta_rol text;
begin
  -- Solo confiamos en la metadata si el alta vino de una invitación del
  -- service_role (inviteUserByEmail). Un signUp público no setea invited_at.
  if new.invited_at is not null then
    v_meta_rol := new.raw_user_meta_data ->> 'rol';
    -- 'superadmin' jamás se toma de metadata.
    if v_meta_rol = 'supervisor' then
      v_rol := 'supervisor';
    end if;

    v_org   := nullif(new.raw_user_meta_data ->> 'organizacion_id', '')::uuid;
    v_local := nullif(new.raw_user_meta_data ->> 'local_id', '')::uuid;

    -- La organización tiene que existir.
    if v_org is not null
       and not exists (select 1 from public.organizaciones o where o.id = v_org)
    then
      v_org := null;
    end if;

    -- La sucursal tiene que existir y pertenecer a esa organización.
    if v_local is not null
       and not exists (
         select 1 from public.locales l
         where l.id = v_local
           and (v_org is null or l.organizacion_id = v_org)
       )
    then
      v_local := null;
    end if;

    -- Un supervisor sin sucursal válida no tiene sentido: lo dejamos sin scope.
    if v_rol = 'supervisor' and v_local is null then
      v_org := null;
    end if;
  end if;

  insert into public.usuarios (id, email, nombre, rol, organizacion_id, local_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    v_rol,
    v_org,
    v_local
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Red de seguridad: nadie debería poder cambiarse el rol a mano. `usuarios` no
-- tiene policies de UPDATE (RLS lo bloquea para authenticated), pero dejamos
-- también un trigger que impide auto-promoverse si en el futuro se agrega una.
create or replace function public.proteger_rol_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol is distinct from old.rol
     and coalesce(public.auth_rol()::text, '') <> 'superadmin' then
    raise exception 'No se puede cambiar el rol';
  end if;
  return new;
end;
$$;

drop trigger if exists usuarios_proteger_rol on public.usuarios;
create trigger usuarios_proteger_rol
  before update on public.usuarios
  for each row execute function public.proteger_rol_usuario();


-- ---------------------------------------------------------------------------
-- 🟡 FIX 2 — El supervisor veía toda la organización, no solo su sucursal
--
-- Las policies de `pedidos` y `empleados` filtraban por auth_org(), así que un
-- supervisor (rol pensado para UNA sucursal) leía y escribía los pedidos y el
-- personal de TODAS las sucursales de la empresa. Fuga de datos entre locales.
-- ---------------------------------------------------------------------------
create or replace function public.auth_local()
returns uuid language sql stable security definer set search_path = public as $$
  select local_id from public.usuarios where id = auth.uid();
$$;

-- ¿Este local_id es visible para el usuario logueado?
create or replace function public.puede_ver_local(p_local uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.auth_rol()::text
    when 'superadmin' then true
    when 'supervisor' then p_local = public.auth_local()
    when 'admin' then exists (
      select 1 from public.locales l
      where l.id = p_local and l.organizacion_id = public.auth_org()
    )
    else false
  end;
$$;

drop policy if exists "empleados de mi org" on public.empleados;
drop policy if exists "empleados de mi scope" on public.empleados;
create policy "empleados de mi scope" on public.empleados
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id));

drop policy if exists "pedidos de mi org" on public.pedidos;
drop policy if exists "pedidos de mi scope" on public.pedidos;
create policy "pedidos de mi scope" on public.pedidos
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id));

-- Mismo criterio para ver/editar la ficha de la sucursal.
drop policy if exists "locales select org/SA" on public.locales;
drop policy if exists "locales update org/SA" on public.locales;
create policy "locales select org/SA" on public.locales
  for select using (public.puede_ver_local(id));
create policy "locales update org/SA" on public.locales
  for update using (public.puede_ver_local(id))
         with check (public.puede_ver_local(id));


-- ---------------------------------------------------------------------------
-- 🟢 FIX 3 — Chequeo: ninguna tabla de public sin RLS
-- Si esta consulta devuelve filas, esas tablas están expuestas a la anon key.
-- ---------------------------------------------------------------------------
-- select tablename from pg_tables
--   where schemaname = 'public'
--     and tablename not in (select tablename from pg_tables
--                           where schemaname='public' and rowsecurity);
select c.relname as tabla_sin_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
