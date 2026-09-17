-- ===========================================================================
-- Cicalino — El PIN de empleado puede repetirse en la sucursal
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: staff-roles.sql
--
-- El fichaje es nombre + PIN de ESA persona. Si el PIN no puede coincidir
-- con el de otro, al anotarlo te enterás de que alguien más lo usa. Los
-- nombres siguen únicos (empleados-nombre-unico.sql).
-- ===========================================================================

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

  update public.empleados
     set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10))
   where id = p_empleado;
end;
$$;

revoke all on function public.set_empleado_pin(uuid, text) from public, anon;
grant execute on function public.set_empleado_pin(uuid, text) to authenticated;
