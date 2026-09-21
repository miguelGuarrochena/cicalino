-- ===========================================================================
-- Cicalino — Employee attribution on cobros
-- Run in: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotent.
-- Requires: staff-floor-guards.sql, mesa-launch-blockers.sql
--
-- registrar_pago_personal and confirmar_pago_mesa only checked that
-- p_empleado belonged to the branch. A waiter with their own login could
-- attribute a cobro to any coworker. Inactive employees were accepted.
--
-- Fichaje lives in the tablet's localStorage. The database cannot see it.
-- This file encodes the rule that matches that context:
--   · waiter (not manager): only their own active employee row
--   · manager / owner: any active employee of the branch (shared tablet)
-- ===========================================================================

create or replace function public._staff_empleado_cobro(
  p_local uuid,
  p_empleado uuid
)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_self uuid := public.empleado_de_usuario(p_local);
  v_activo boolean;
begin
  if not public.auth_gestiona_local(p_local) then
    if v_self is null then
      return json_build_object('ok', false, 'reason', 'empleado-invalido');
    end if;
    if p_empleado is not null and p_empleado is distinct from v_self then
      return json_build_object('ok', false, 'reason', 'empleado-invalido');
    end if;
    return json_build_object('ok', true, 'empleado', v_self);
  end if;

  if p_empleado is null then
    return json_build_object('ok', true, 'empleado', v_self);
  end if;

  select exists (
    select 1 from public.empleados
     where id = p_empleado and local_id = p_local and activo
  ) into v_activo;
  if not v_activo then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;
  return json_build_object('ok', true, 'empleado', p_empleado);
end;
$$;

revoke all on function public._staff_empleado_cobro(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.registrar_pago_personal(
  p_sesion uuid,
  p_datos jsonb,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_local uuid;
  v_comensal uuid;
  v_attr json;
begin
  select local_id into v_local from public.mesa_sesiones where id = p_sesion;
  if v_local is null or not public._staff_puede(v_local, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_attr := public._staff_empleado_cobro(v_local, p_empleado);
  if coalesce(v_attr->>'ok', '') <> 'true' then
    return json_build_object('ok', false, 'reason', coalesce(v_attr->>'reason', 'empleado-invalido'));
  end if;
  p_empleado := nullif(v_attr->>'empleado', '')::uuid;
  v_comensal := nullif(p_datos->>'comensal_id', '')::uuid;
  if v_comensal is not null and not exists (
    select 1 from public.comensales where id = v_comensal and sesion_id = p_sesion) then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  return public._crear_pago_mesa(p_sesion, v_comensal, 'personal', p_datos, p_empleado);
end;
$$;

create or replace function public.confirmar_pago_mesa(p_pago uuid, p_empleado uuid default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
  v_attr json;
begin
  select * into v_p from public.pagos_mesa where id = p_pago;
  if not found or not public._staff_puede(v_p.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_attr := public._staff_empleado_cobro(v_p.local_id, p_empleado);
  if coalesce(v_attr->>'ok', '') <> 'true' then
    return json_build_object('ok', false, 'reason', coalesce(v_attr->>'reason', 'empleado-invalido'));
  end if;
  p_empleado := nullif(v_attr->>'empleado', '')::uuid;

  perform 1 from public.mesa_sesiones where id = v_p.sesion_id for update;
  select * into v_p from public.pagos_mesa where id = p_pago for update;

  if v_p.metodo = 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'mp-solo-webhook');
  end if;
  if v_p.estado = 'pagado' then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  if v_p.estado <> 'pendiente' then
    return json_build_object('ok', false, 'reason', 'no-pendiente', 'estado', v_p.estado);
  end if;

  update public.pagos_mesa
     set estado = 'pagado', confirmacion = 'manual', confirmado_en = now(),
         confirmado_por = auth.uid(), confirmado_empleado = p_empleado,
         actualizado_en = now()
   where id = v_p.id;

  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_confirmado', 'personal',
    p_pago => v_p.id, p_empleado => p_empleado,
    p_datos => json_build_object('metodo', v_p.metodo, 'monto_total', v_p.monto_total)::jsonb);
  perform public._revisar_cobertura(v_p.sesion_id);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.registrar_pago_personal(uuid, jsonb, uuid) to authenticated;
grant execute on function public.confirmar_pago_mesa(uuid, uuid) to authenticated;
