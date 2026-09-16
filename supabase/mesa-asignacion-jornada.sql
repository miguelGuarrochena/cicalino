-- ===========================================================================
-- Cicalino — Asignación de mesas por jornada (plantilla semanal + turno de hoy)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: staff-roles.sql, liberar-mesas-jornada.sql, modulo-espera.sql,
--           split-payments-module.sql
--
-- La plantilla es el default de la semana. La asignación de la jornada es lo
-- que vale durante el servicio. Reasignar cierra el intervalo anterior: no
-- reescribe pedidos ni pagos. Quién cobró y quién registró un pedido siguen
-- en sus tablas; acá queda quién atendía la mesa en cada momento (propinas).
-- ===========================================================================

create table if not exists public.mesa_plantilla_turno (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  empleado_id uuid not null references public.empleados (id) on delete cascade,
  mesa_desde integer not null check (mesa_desde >= 1),
  mesa_hasta integer not null check (mesa_hasta >= mesa_desde),
  creado_en timestamptz not null default now()
);

create index if not exists idx_mesa_plantilla_local_dia
  on public.mesa_plantilla_turno (local_id, dia_semana);

create table if not exists public.mesa_asignacion (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  jornada_fecha date not null,
  mesa_numero integer not null check (mesa_numero >= 1),
  empleado_id uuid references public.empleados (id) on delete set null,
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  creado_por uuid,
  creado_empleado uuid references public.empleados (id) on delete set null,
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create unique index if not exists uq_mesa_asignacion_vigente
  on public.mesa_asignacion (local_id, jornada_fecha, mesa_numero)
  where vigente_hasta is null;

create index if not exists idx_mesa_asignacion_jornada
  on public.mesa_asignacion (local_id, jornada_fecha, vigente_desde);

alter table public.mesa_plantilla_turno enable row level security;
alter table public.mesa_asignacion enable row level security;

drop policy if exists "plantilla de mi local" on public.mesa_plantilla_turno;
create policy "plantilla de mi local" on public.mesa_plantilla_turno
  for select using (public.puede_ver_local(local_id));

drop policy if exists "asignacion de mi local" on public.mesa_asignacion;
create policy "asignacion de mi local" on public.mesa_asignacion
  for select using (public.puede_ver_local(local_id));

revoke all on public.mesa_plantilla_turno from public, anon, authenticated;
revoke all on public.mesa_asignacion from public, anon, authenticated;
grant select on public.mesa_plantilla_turno to authenticated;
grant select on public.mesa_asignacion to authenticated;

create or replace function public._piso_puede(p_local uuid, p_escribir boolean)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.puede_ver_local(p_local)
     and (
       public.local_tiene_modulo(p_local, 'espera')
       or public.local_tiene_modulo(p_local, 'pagos')
     )
     and (not p_escribir or public.local_operativo(p_local));
$$;
revoke all on function public._piso_puede(uuid, boolean) from public, anon, authenticated;

create or replace function public.jornada_fecha_local(p_local uuid)
returns date
language plpgsql stable security definer set search_path = public as $$
declare
  v_corte integer;
begin
  select coalesce(l.hora_corte, 6) into v_corte from public.locales l where l.id = p_local;
  if v_corte is null then
    return (timezone('America/Argentina/Buenos_Aires', now()))::date;
  end if;
  return (timezone('America/Argentina/Buenos_Aires', public.jornada_inicio_corte(v_corte)))::date;
end;
$$;
revoke all on function public.jornada_fecha_local(uuid) from public, anon, authenticated;

create or replace function public._mesa_asignar_una(
  p_local uuid,
  p_fecha date,
  p_mesa integer,
  p_empleado uuid,
  p_actor uuid
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.mesa_asignacion
     set vigente_hasta = now()
   where local_id = p_local
     and jornada_fecha = p_fecha
     and mesa_numero = p_mesa
     and vigente_hasta is null
     and empleado_id is distinct from p_empleado;

  if not exists (
    select 1 from public.mesa_asignacion
     where local_id = p_local and jornada_fecha = p_fecha
       and mesa_numero = p_mesa and vigente_hasta is null
  ) then
    insert into public.mesa_asignacion (
      local_id, jornada_fecha, mesa_numero, empleado_id, creado_por, creado_empleado
    ) values (
      p_local, p_fecha, p_mesa, p_empleado, auth.uid(), p_actor
    );
  end if;
end;
$$;
revoke all on function public._mesa_asignar_una(uuid, date, integer, uuid, uuid) from public, anon, authenticated;

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
             'empleado_id', p.empleado_id,
             'empleado_nombre', e.nombre,
             'desde', p.mesa_desde,
             'hasta', p.mesa_hasta
           ) order by p.dia_semana, p.mesa_desde)
      from public.mesa_plantilla_turno p
      join public.empleados e on e.id = p.empleado_id
     where p.local_id = p_local
  ), '[]'::json);
end;
$$;

create or replace function public.mesa_plantilla_guardar(
  p_local uuid,
  p_dia smallint,
  p_filas jsonb
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
   where local_id = p_local and dia_semana = p_dia;

  insert into public.mesa_plantilla_turno (local_id, dia_semana, empleado_id, mesa_desde, mesa_hasta)
  select p_local, p_dia, nullif(value->>'empleado_id','')::uuid,
         (value->>'desde')::int, (value->>'hasta')::int
    from jsonb_array_elements(p_filas);

  return json_build_object('ok', true, 'plantilla', public.mesa_plantilla_leer(p_local));
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
  select coalesce(l.cantidad_mesas, 0) into v_max from public.locales l where l.id = p_local;
  v_actor := public.empleado_de_usuario(p_local);

  if p_forzar then
    update public.mesa_asignacion
       set vigente_hasta = now()
     where local_id = p_local and jornada_fecha = v_fecha and vigente_hasta is null;
  end if;

  for rec in
    select empleado_id, mesa_desde, mesa_hasta
      from public.mesa_plantilla_turno
     where local_id = p_local and dia_semana = v_dia
  loop
    for v_n in rec.mesa_desde..least(rec.mesa_hasta, v_max) loop
      if p_forzar then
        perform public._mesa_asignar_una(p_local, v_fecha, v_n, rec.empleado_id, v_actor);
      elsif not exists (
        select 1 from public.mesa_asignacion
         where local_id = p_local and jornada_fecha = v_fecha
           and mesa_numero = v_n and vigente_hasta is null
      ) then
        insert into public.mesa_asignacion (
          local_id, jornada_fecha, mesa_numero, empleado_id, creado_por, creado_empleado
        ) values (
          p_local, v_fecha, v_n, rec.empleado_id, auth.uid(), v_actor
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
begin
  if not public._piso_puede(p_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_fecha := public.jornada_fecha_local(p_local);
  if public.local_operativo(p_local) then
    perform public.mesa_jornada_aplicar_plantilla(p_local, false);
  end if;

  return json_build_object(
    'fecha', v_fecha,
    'dia', extract(isodow from v_fecha)::int,
    'asignaciones', coalesce((
      select json_agg(json_build_object(
               'mesa', a.mesa_numero,
               'empleado_id', a.empleado_id,
               'empleado_nombre', e.nombre
             ) order by a.mesa_numero)
        from public.mesa_asignacion a
        left join public.empleados e on e.id = a.empleado_id
       where a.local_id = p_local and a.jornada_fecha = v_fecha and a.vigente_hasta is null
    ), '[]'::json),
    'plantilla', public.mesa_plantilla_leer(p_local)
  );
end;
$$;

create or replace function public.mesa_jornada_asignar(
  p_local uuid,
  p_mesa integer,
  p_empleado uuid,
  p_empleado_actor uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_fecha date;
  v_max int;
  v_actor uuid;
  v_actual uuid;
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
     and mesa_numero = p_mesa and vigente_hasta is null;

  if not public.auth_gestiona_local(p_local) then
    if v_actual is not null then
      return json_build_object('ok', false, 'reason', 'requiere-encargado');
    end if;
    if p_empleado is distinct from v_actor then
      return json_build_object('ok', false, 'reason', 'sin-permiso');
    end if;
  end if;

  perform public._mesa_asignar_una(p_local, v_fecha, p_mesa, p_empleado, v_actor);
  return json_build_object('ok', true, 'jornada', public.mesa_jornada_leer(p_local));
end;
$$;

create or replace function public.mesa_jornada_asignar_rango(
  p_local uuid,
  p_desde integer,
  p_hasta integer,
  p_empleado uuid,
  p_empleado_actor uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  v_max int;
  v_one json;
begin
  if not public._piso_puede(p_local, true) or not public.auth_gestiona_local(p_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select coalesce(l.cantidad_mesas, 0) into v_max from public.locales l where l.id = p_local;
  if p_desde is null or p_hasta is null or p_desde < 1 or p_hasta < p_desde or p_hasta > v_max then
    return json_build_object('ok', false, 'reason', 'rango-invalido');
  end if;
  for v_n in p_desde..p_hasta loop
    v_one := public.mesa_jornada_asignar(p_local, v_n, p_empleado, p_empleado_actor);
    if coalesce(v_one->>'ok', 'false') <> 'true' then
      return v_one;
    end if;
  end loop;
  return json_build_object('ok', true, 'jornada', public.mesa_jornada_leer(p_local));
end;
$$;

revoke all on function public.mesa_plantilla_leer(uuid) from public, anon;
revoke all on function public.mesa_plantilla_guardar(uuid, smallint, jsonb) from public, anon;
revoke all on function public.mesa_jornada_aplicar_plantilla(uuid, boolean) from public, anon;
revoke all on function public.mesa_jornada_leer(uuid) from public, anon;
revoke all on function public.mesa_jornada_asignar(uuid, integer, uuid, uuid) from public, anon;
revoke all on function public.mesa_jornada_asignar_rango(uuid, integer, integer, uuid, uuid) from public, anon;

grant execute on function public.mesa_plantilla_leer(uuid) to authenticated, service_role;
grant execute on function public.mesa_plantilla_guardar(uuid, smallint, jsonb) to authenticated, service_role;
grant execute on function public.mesa_jornada_aplicar_plantilla(uuid, boolean) to authenticated, service_role;
grant execute on function public.mesa_jornada_leer(uuid) to authenticated, service_role;
grant execute on function public.mesa_jornada_asignar(uuid, integer, uuid, uuid) to authenticated, service_role;
grant execute on function public.mesa_jornada_asignar_rango(uuid, integer, integer, uuid, uuid) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mesa_asignacion'
  ) then
    alter publication supabase_realtime add table public.mesa_asignacion;
  end if;
end $$;
