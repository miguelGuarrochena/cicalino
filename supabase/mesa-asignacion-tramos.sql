-- ===========================================================================
-- Cicalino — Turno mañana / noche en la asignación de mesas
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: mesa-asignacion-jornada.sql
--
-- Un local puede tener un turno (todo el día) o dos (mañana y noche). La
-- misma mesa puede atenderla gente distinta en cada tramo. El default es 1
-- turno: las filas viejas quedan en 'manana'.
-- ===========================================================================

alter table public.locales
  add column if not exists turnos_piso smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'locales_turnos_piso'
  ) then
    alter table public.locales
      add constraint locales_turnos_piso check (turnos_piso in (1, 2));
  end if;
end $$;

alter table public.mesa_plantilla_turno
  add column if not exists tramo text not null default 'manana';

alter table public.mesa_asignacion
  add column if not exists tramo text not null default 'manana';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mesa_plantilla_turno_tramo'
  ) then
    alter table public.mesa_plantilla_turno
      add constraint mesa_plantilla_turno_tramo check (tramo in ('manana', 'noche'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'mesa_asignacion_tramo'
  ) then
    alter table public.mesa_asignacion
      add constraint mesa_asignacion_tramo check (tramo in ('manana', 'noche'));
  end if;
end $$;

drop index if exists public.uq_mesa_asignacion_vigente;
create unique index if not exists uq_mesa_asignacion_vigente
  on public.mesa_asignacion (local_id, jornada_fecha, mesa_numero, tramo)
  where vigente_hasta is null;

create or replace function public._tramo_ok(p_tramo text)
returns text
language sql immutable as $$
  select case when p_tramo = 'noche' then 'noche' else 'manana' end;
$$;
revoke all on function public._tramo_ok(text) from public, anon, authenticated;

drop function if exists public._mesa_asignar_una(uuid, date, integer, uuid, uuid);

create or replace function public._mesa_asignar_una(
  p_local uuid,
  p_fecha date,
  p_mesa integer,
  p_empleado uuid,
  p_actor uuid,
  p_tramo text default 'manana'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tramo text := public._tramo_ok(p_tramo);
begin
  update public.mesa_asignacion
     set vigente_hasta = now()
   where local_id = p_local
     and jornada_fecha = p_fecha
     and mesa_numero = p_mesa
     and tramo = v_tramo
     and vigente_hasta is null
     and empleado_id is distinct from p_empleado;

  if not exists (
    select 1 from public.mesa_asignacion
     where local_id = p_local and jornada_fecha = p_fecha
       and mesa_numero = p_mesa and tramo = v_tramo and vigente_hasta is null
  ) then
    insert into public.mesa_asignacion (
      local_id, jornada_fecha, mesa_numero, empleado_id, tramo, creado_por, creado_empleado
    ) values (
      p_local, p_fecha, p_mesa, p_empleado, v_tramo, auth.uid(), p_actor
    );
  end if;
end;
$$;
revoke all on function public._mesa_asignar_una(uuid, date, integer, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.mesa_plantilla_leer(p_local uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._piso_puede(p_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(json_build_object(
             'id', p.id,
             'dia', p.dia_semana,
             'tramo', p.tramo,
             'empleado_id', p.empleado_id,
             'empleado_nombre', e.nombre,
             'desde', p.mesa_desde,
             'hasta', p.mesa_hasta
           ) order by p.tramo, p.dia_semana, p.mesa_desde)
      from public.mesa_plantilla_turno p
      join public.empleados e on e.id = p.empleado_id
     where p.local_id = p_local
  ), '[]'::json);
end;
$$;

drop function if exists public.mesa_plantilla_guardar(uuid, smallint, jsonb);

create or replace function public.mesa_plantilla_guardar(
  p_local uuid,
  p_dia smallint,
  p_filas jsonb,
  p_tramo text default 'manana'
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_emp uuid;
  v_desde int;
  v_hasta int;
  v_max int;
  v_ocupadas int[] := '{}';
  v_n int;
  v_tramo text := public._tramo_ok(p_tramo);
begin
  if not public._piso_puede(p_local, true) or not public.auth_gestiona_local(p_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_dia is null or p_dia < 1 or p_dia > 7 then
    return json_build_object('ok', false, 'reason', 'dia-invalido');
  end if;
  select coalesce(l.cantidad_mesas, 0) into v_max from public.locales l where l.id = p_local;
  if v_max < 1 then
    return json_build_object('ok', false, 'reason', 'sin-mesas');
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  for r in select value from jsonb_array_elements(p_filas)
  loop
    v_emp := nullif(r->>'empleado_id', '')::uuid;
    v_desde := coalesce((r->>'desde')::int, 0);
    v_hasta := coalesce((r->>'hasta')::int, 0);
    if v_emp is null or not exists (
      select 1 from public.empleados where id = v_emp and local_id = p_local and activo
    ) then
      return json_build_object('ok', false, 'reason', 'empleado-invalido');
    end if;
    if v_desde < 1 or v_hasta < v_desde or v_hasta > v_max then
      return json_build_object('ok', false, 'reason', 'rango-invalido');
    end if;
    for v_n in v_desde..v_hasta loop
      if v_n = any(v_ocupadas) then
        return json_build_object('ok', false, 'reason', 'solape');
      end if;
      v_ocupadas := v_ocupadas || v_n;
    end loop;
  end loop;

  delete from public.mesa_plantilla_turno
   where local_id = p_local and dia_semana = p_dia and tramo = v_tramo;

  insert into public.mesa_plantilla_turno (local_id, dia_semana, tramo, empleado_id, mesa_desde, mesa_hasta)
  select p_local, p_dia, v_tramo, nullif(value->>'empleado_id','')::uuid,
         (value->>'desde')::int, (value->>'hasta')::int
    from jsonb_array_elements(p_filas);

  return json_build_object('ok', true, 'plantilla', public.mesa_plantilla_leer(p_local));
end;
$$;

create or replace function public.mesa_plantilla_guardar_semana(
  p_local uuid,
  p_tramo text,
  p_filas jsonb
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_dia smallint;
  v_emp uuid;
  v_desde int;
  v_hasta int;
  v_n int;
  v_max int;
  v_tramo text := public._tramo_ok(p_tramo);
  v_ocupadas int[];
begin
  if not public._piso_puede(p_local, true) or not public.auth_gestiona_local(p_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select coalesce(l.cantidad_mesas, 0) into v_max from public.locales l where l.id = p_local;
  if v_max < 1 then
    return json_build_object('ok', false, 'reason', 'sin-mesas');
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  for v_dia in 1..7 loop
    v_ocupadas := '{}';
    for r in
      select value from jsonb_array_elements(p_filas)
       where coalesce((value->>'dia')::int, 0) = v_dia
    loop
      v_emp := nullif(r->>'empleado_id', '')::uuid;
      v_desde := coalesce((r->>'desde')::int, 0);
      v_hasta := coalesce((r->>'hasta')::int, 0);
      if v_emp is null or not exists (
        select 1 from public.empleados where id = v_emp and local_id = p_local and activo
      ) then
        return json_build_object('ok', false, 'reason', 'empleado-invalido');
      end if;
      if v_desde < 1 or v_hasta < v_desde or v_hasta > v_max then
        return json_build_object('ok', false, 'reason', 'rango-invalido');
      end if;
      for v_n in v_desde..v_hasta loop
        if v_n = any(v_ocupadas) then
          return json_build_object('ok', false, 'reason', 'solape');
        end if;
        v_ocupadas := v_ocupadas || v_n;
      end loop;
    end loop;
  end loop;

  delete from public.mesa_plantilla_turno
   where local_id = p_local and tramo = v_tramo;

  insert into public.mesa_plantilla_turno (local_id, dia_semana, tramo, empleado_id, mesa_desde, mesa_hasta)
  select p_local,
         (value->>'dia')::smallint,
         v_tramo,
         nullif(value->>'empleado_id','')::uuid,
         (value->>'desde')::int,
         (value->>'hasta')::int
    from jsonb_array_elements(p_filas)
   where coalesce((value->>'dia')::int, 0) between 1 and 7;

  return json_build_object('ok', true, 'plantilla', public.mesa_plantilla_leer(p_local));
end;
$$;

create or replace function public.mesa_local_set_turnos(p_local uuid, p_n smallint)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._piso_puede(p_local, true) or not public.auth_gestiona_local(p_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_n is null or p_n not in (1, 2) then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;
  update public.locales set turnos_piso = p_n, updated_at = now() where id = p_local;
  return json_build_object('ok', true, 'turnos_piso', p_n);
end;
$$;

create or replace function public.mesa_jornada_aplicar_plantilla(
  p_local uuid,
  p_forzar boolean default false
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_fecha date;
  v_dia int;
  v_max int;
  v_actor uuid;
  v_n_turnos int;
  rec record;
  v_n int;
begin
  if not public._piso_puede(p_local, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_forzar and not public.auth_gestiona_local(p_local) then
    return json_build_object('ok', false, 'reason', 'requiere-encargado');
  end if;

  v_fecha := public.jornada_fecha_local(p_local);
  v_dia := extract(isodow from v_fecha)::int;
  select coalesce(l.cantidad_mesas, 0), coalesce(l.turnos_piso, 1)
    into v_max, v_n_turnos
    from public.locales l where l.id = p_local;
  v_actor := public.empleado_de_usuario(p_local);

  if p_forzar then
    update public.mesa_asignacion
       set vigente_hasta = now()
     where local_id = p_local and jornada_fecha = v_fecha and vigente_hasta is null
       and (v_n_turnos = 2 or tramo = 'manana');
  end if;

  for rec in
    select empleado_id, mesa_desde, mesa_hasta, tramo
      from public.mesa_plantilla_turno
     where local_id = p_local and dia_semana = v_dia
       and (v_n_turnos = 2 or tramo = 'manana')
  loop
    for v_n in rec.mesa_desde..least(rec.mesa_hasta, v_max) loop
      if p_forzar then
        perform public._mesa_asignar_una(p_local, v_fecha, v_n, rec.empleado_id, v_actor, rec.tramo);
      elsif not exists (
        select 1 from public.mesa_asignacion
         where local_id = p_local and jornada_fecha = v_fecha
           and mesa_numero = v_n and tramo = rec.tramo and vigente_hasta is null
      ) then
        insert into public.mesa_asignacion (
          local_id, jornada_fecha, mesa_numero, empleado_id, tramo, creado_por, creado_empleado
        ) values (
          p_local, v_fecha, v_n, rec.empleado_id, rec.tramo, auth.uid(), v_actor
        );
      end if;
    end loop;
  end loop;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.mesa_jornada_leer(p_local uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_fecha date;
  v_turnos int;
begin
  if not public._piso_puede(p_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_fecha := public.jornada_fecha_local(p_local);
  select coalesce(l.turnos_piso, 1) into v_turnos from public.locales l where l.id = p_local;
  if public.local_operativo(p_local) then
    perform public.mesa_jornada_aplicar_plantilla(p_local, false);
  end if;

  return json_build_object(
    'fecha', v_fecha,
    'dia', extract(isodow from v_fecha)::int,
    'turnos_piso', v_turnos,
    'asignaciones', coalesce((
      select json_agg(json_build_object(
               'mesa', a.mesa_numero,
               'empleado_id', a.empleado_id,
               'empleado_nombre', e.nombre,
               'tramo', a.tramo
             ) order by a.tramo, a.mesa_numero)
        from public.mesa_asignacion a
        left join public.empleados e on e.id = a.empleado_id
       where a.local_id = p_local and a.jornada_fecha = v_fecha and a.vigente_hasta is null
    ), '[]'::json),
    'plantilla', public.mesa_plantilla_leer(p_local)
  );
end;
$$;

drop function if exists public.mesa_jornada_asignar(uuid, integer, uuid, uuid);

create or replace function public.mesa_jornada_asignar(
  p_local uuid,
  p_mesa integer,
  p_empleado uuid,
  p_empleado_actor uuid default null,
  p_tramo text default 'manana'
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_fecha date;
  v_max int;
  v_actor uuid;
  v_actual uuid;
  v_tramo text := public._tramo_ok(p_tramo);
begin
  if not public._piso_puede(p_local, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_fecha := public.jornada_fecha_local(p_local);
  select coalesce(l.cantidad_mesas, 0) into v_max from public.locales l where l.id = p_local;
  if p_mesa is null or p_mesa < 1 or p_mesa > v_max then
    return json_build_object('ok', false, 'reason', 'mesa-invalida');
  end if;
  if p_empleado is not null and not exists (
    select 1 from public.empleados where id = p_empleado and local_id = p_local and activo
  ) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;

  v_actor := coalesce(p_empleado_actor, public.empleado_de_usuario(p_local));
  select empleado_id into v_actual
    from public.mesa_asignacion
   where local_id = p_local and jornada_fecha = v_fecha
     and mesa_numero = p_mesa and tramo = v_tramo and vigente_hasta is null;

  if not public.auth_gestiona_local(p_local) then
    if v_actual is not null then
      return json_build_object('ok', false, 'reason', 'requiere-encargado');
    end if;
    if p_empleado is distinct from v_actor then
      return json_build_object('ok', false, 'reason', 'sin-permiso');
    end if;
  end if;

  perform public._mesa_asignar_una(p_local, v_fecha, p_mesa, p_empleado, v_actor, v_tramo);
  return json_build_object('ok', true, 'jornada', public.mesa_jornada_leer(p_local));
end;
$$;

drop function if exists public.mesa_jornada_asignar_rango(uuid, integer, integer, uuid, uuid);

create or replace function public.mesa_jornada_asignar_rango(
  p_local uuid,
  p_desde integer,
  p_hasta integer,
  p_empleado uuid,
  p_empleado_actor uuid default null,
  p_tramo text default 'manana'
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  v_max int;
  v_one json;
  v_tramo text := public._tramo_ok(p_tramo);
begin
  if not public._piso_puede(p_local, true) or not public.auth_gestiona_local(p_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select coalesce(l.cantidad_mesas, 0) into v_max from public.locales l where l.id = p_local;
  if p_desde is null or p_hasta is null or p_desde < 1 or p_hasta < p_desde or p_hasta > v_max then
    return json_build_object('ok', false, 'reason', 'rango-invalido');
  end if;
  for v_n in p_desde..p_hasta loop
    v_one := public.mesa_jornada_asignar(p_local, v_n, p_empleado, p_empleado_actor, v_tramo);
    if coalesce(v_one->>'ok', 'false') <> 'true' then
      return v_one;
    end if;
  end loop;
  return json_build_object('ok', true, 'jornada', public.mesa_jornada_leer(p_local));
end;
$$;

revoke all on function public.mesa_plantilla_leer(uuid) from public, anon;
revoke all on function public.mesa_plantilla_guardar(uuid, smallint, jsonb, text) from public, anon;
revoke all on function public.mesa_plantilla_guardar_semana(uuid, text, jsonb) from public, anon;
revoke all on function public.mesa_local_set_turnos(uuid, smallint) from public, anon;
revoke all on function public.mesa_jornada_aplicar_plantilla(uuid, boolean) from public, anon;
revoke all on function public.mesa_jornada_leer(uuid) from public, anon;
revoke all on function public.mesa_jornada_asignar(uuid, integer, uuid, uuid, text) from public, anon;
revoke all on function public.mesa_jornada_asignar_rango(uuid, integer, integer, uuid, uuid, text) from public, anon;

grant execute on function public.mesa_plantilla_leer(uuid) to authenticated, service_role;
grant execute on function public.mesa_plantilla_guardar(uuid, smallint, jsonb, text) to authenticated, service_role;
grant execute on function public.mesa_plantilla_guardar_semana(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.mesa_local_set_turnos(uuid, smallint) to authenticated, service_role;
grant execute on function public.mesa_jornada_aplicar_plantilla(uuid, boolean) to authenticated, service_role;
grant execute on function public.mesa_jornada_leer(uuid) to authenticated, service_role;
grant execute on function public.mesa_jornada_asignar(uuid, integer, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.mesa_jornada_asignar_rango(uuid, integer, integer, uuid, uuid, text) to authenticated, service_role;
