-- ===========================================================================
-- Cicalino — Staff roles and "who did it"
-- Run in: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotent.
-- Requires: staff-role-enum.sql, security-fixes-01.sql, security-fixes-03.sql,
--           security-fixes-04.sql, security-fixes-17.sql, corte-por-impago.sql
--
-- WHAT WAS THERE
-- Roles in the database: superadmin, admin (owner), supervisor (manager).
-- "Giving an employee app access" created a supervisor account, while the
-- screen told the owner that person wouldn't see settings. A supervisor can
-- unlock /panel/config with their own password and, through RLS, edit the
-- branch, its tables, employees and PINs.
--
-- The "fichaje" is not stored anywhere in the database. It's a PIN pick kept
-- in the device's localStorage, used only to fill empleado_id on new orders,
-- waitlist entries and reservations. Nothing requires it; no metric reads it.
--
-- WHAT THIS DOES
--   1. 'empleado' (waiter) is a real login role, scoped to its branches like a
--      supervisor. It runs the floor (orders, waitlist, reservations, tables,
--      payments) but can't edit the branch, employees or PINs.
--   2. auth_gestiona_local(): the check for "manager or owner of this branch",
--      used by the policies and functions that change configuration.
--   3. Attribution without clocking in: new orders, waitlist entries and
--      reservations record who created them (creado_por = auth.uid()) and, if
--      the device didn't pick an employee, the employee linked to that login.
--   4. proteger_rol_usuario lets the server (service_role) change a role, so
--      the owner can switch someone between waiter and manager. Clients still
--      can't.
--
-- Existing accounts keep their role. Nothing is dropped.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Invitations may create waiters
--    Same function as security-fixes-01.sql plus the 'empleado' branch.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_rol   public.rol_usuario := 'admin';
  v_org   uuid;
  v_local uuid;
  v_meta_rol text;
begin
  -- Metadata is trusted only for service_role invitations (inviteUserByEmail).
  if new.invited_at is not null then
    v_meta_rol := new.raw_user_meta_data ->> 'rol';
    -- 'superadmin' is never taken from metadata.
    if v_meta_rol = 'supervisor' then
      v_rol := 'supervisor';
    elsif v_meta_rol = 'empleado' then
      v_rol := 'empleado';
    end if;

    v_org   := nullif(new.raw_user_meta_data ->> 'organizacion_id', '')::uuid;
    v_local := nullif(new.raw_user_meta_data ->> 'local_id', '')::uuid;

    if v_org is not null
       and not exists (select 1 from public.organizaciones o where o.id = v_org)
    then
      v_org := null;
    end if;

    if v_local is not null
       and not exists (
         select 1 from public.locales l
         where l.id = v_local
           and (v_org is null or l.organizacion_id = v_org)
       )
    then
      v_local := null;
    end if;

    -- A branch-scoped role without a valid branch gets no scope at all.
    if v_rol in ('supervisor', 'empleado') and v_local is null then
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


-- ---------------------------------------------------------------------------
-- 2) Scope: a waiter sees exactly the branches it was given, like a manager.
-- ---------------------------------------------------------------------------
create or replace function public.puede_ver_local(p_local uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.auth_rol()::text
    when 'superadmin' then true
    when 'supervisor' then p_local in (select public.auth_locales())
    when 'empleado' then p_local in (select public.auth_locales())
    when 'admin' then exists (
      select 1 from public.locales l
      where l.id = p_local and l.organizacion_id = public.auth_org()
    )
    else false
  end;
$$;

/* Manager or owner of this branch: may change how the branch is set up. */
create or replace function public.auth_gestiona_local(p_local uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.puede_ver_local(p_local)
     and coalesce(public.auth_rol()::text, '') in ('superadmin', 'admin', 'supervisor');
$$;

/* Callable like puede_ver_local: policies evaluate it for any caller, and for
 * anon it simply returns false. */
grant execute on function public.auth_gestiona_local(uuid) to anon, authenticated, service_role;

/* The employee record linked to the logged-in account at this branch, if any.
 * Lets actions be attributed to a person without picking a PIN first. */
create or replace function public.empleado_de_usuario(p_local uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.id
    from public.empleados e
   where e.local_id = p_local
     and e.usuario_id = auth.uid()
     and e.activo
   order by e.created_at
   limit 1;
$$;

revoke all on function public.empleado_de_usuario(uuid) from public, anon;
grant execute on function public.empleado_de_usuario(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3) Role changes: clients never, the server yes.
-- ---------------------------------------------------------------------------
create or replace function public.proteger_rol_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol is distinct from old.rol
     and coalesce(public.auth_rol()::text, '') <> 'superadmin'
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'No se puede cambiar el rol';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4) Branch setup is for managers and owners
-- ---------------------------------------------------------------------------
drop policy if exists "locales update org/SA" on public.locales;
create policy "locales update org/SA" on public.locales
  for update using (public.auth_gestiona_local(id))
         with check (public.auth_gestiona_local(id));

-- Employees: everyone on the branch reads the list (it's the "who's serving"
-- picker); only managers and owners add, edit or remove people.
-- Separate write policies on purpose: a FOR ALL policy is also evaluated on
-- SELECT, and reads must keep going through puede_ver_local alone.
drop policy if exists "empleados de mi scope" on public.empleados;
drop policy if exists "empleados leer" on public.empleados;
drop policy if exists "empleados gestionar" on public.empleados;
drop policy if exists "empleados alta" on public.empleados;
drop policy if exists "empleados editar" on public.empleados;
drop policy if exists "empleados baja" on public.empleados;
create policy "empleados leer" on public.empleados
  for select using (public.puede_ver_local(local_id));
create policy "empleados alta" on public.empleados
  for insert with check (public.auth_gestiona_local(local_id));
create policy "empleados editar" on public.empleados
  for update using (public.auth_gestiona_local(local_id))
         with check (public.auth_gestiona_local(local_id));
create policy "empleados baja" on public.empleados
  for delete using (public.auth_gestiona_local(local_id));

-- Same function as security-fixes-03.sql, with the manager check.
create or replace function public.set_empleado_pin(p_empleado uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_local uuid;
  v_pin text := nullif(regexp_replace(coalesce(p_pin,''), '\D', '', 'g'), '');
begin
  select local_id into v_local from public.empleados where id = p_empleado;
  if v_local is null then
    raise exception 'Empleado inexistente';
  end if;

  if not public.auth_gestiona_local(v_local) then
    raise exception 'No autorizado';
  end if;

  if v_pin is null then
    update public.empleados set pin_hash = null where id = p_empleado;
    return;
  end if;

  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN tiene que ser de 4 dígitos';
  end if;

  if exists (
    select 1 from public.empleados e
    where e.local_id = v_local
      and e.id <> p_empleado
      and e.pin_hash is not null
      and e.pin_hash = extensions.crypt(v_pin, e.pin_hash)
  ) then
    raise exception 'Ese PIN ya está en uso en la sucursal';
  end if;

  update public.empleados
     set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10))
   where id = p_empleado;
end;
$$;

grant execute on function public.set_empleado_pin(uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 5) Who created it
--
-- creado_por is the account that did it, always available. empleado_id stays
-- what it was (the person picked on a shared device); when nobody was picked,
-- it's filled with the employee linked to the logged-in account.
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists creado_por uuid default auth.uid();
alter table public.esperas
  add column if not exists creado_por uuid default auth.uid();
alter table public.reservas
  add column if not exists creado_por uuid default auth.uid();

comment on column public.pedidos.creado_por is
  'Account that created the order (auth.uid()). Null for guest table orders and older rows.';

create or replace function public.asignar_empleado_actual()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.empleado_id is null and auth.uid() is not null then
    new.empleado_id := public.empleado_de_usuario(new.local_id);
  end if;
  return new;
end;
$$;

revoke all on function public.asignar_empleado_actual() from public, anon, authenticated;

drop trigger if exists pedidos_asignar_empleado on public.pedidos;
create trigger pedidos_asignar_empleado
  before insert on public.pedidos
  for each row execute function public.asignar_empleado_actual();

drop trigger if exists esperas_asignar_empleado on public.esperas;
create trigger esperas_asignar_empleado
  before insert on public.esperas
  for each row execute function public.asignar_empleado_actual();

drop trigger if exists reservas_asignar_empleado on public.reservas;
create trigger reservas_asignar_empleado
  before insert on public.reservas
  for each row execute function public.asignar_empleado_actual();


-- ---------------------------------------------------------------------------
-- Check (read only). Expected: true, true.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = 'rol_usuario' and e.enumlabel = 'empleado') as rol_empleado,
  exists (select 1 from pg_trigger where tgname = 'pedidos_asignar_empleado') as atribucion;
