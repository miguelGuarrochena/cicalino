-- ===========================================================================
-- Cicalino — Floor guards after staff-roles
-- Run in: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotent.
-- Requires: staff-roles.sql, split-payments.sql
--
-- split-payments.sql went out first, without waiter vs manager checks.
-- staff-roles.sql then added auth_gestiona_local and empleado_de_usuario, but
-- did not replace the payment functions. This file does: same bodies as the
-- current split-payments.sql, applied as a follow-up so the tracker can run
-- them on databases that already marked split-payments as done.
--
-- WHAT THIS DOES
--   1. sincronizar_mesas: a waiter gets 'sin-permiso' instead of changing
--      how many tables the branch has.
--   2. registrar / confirmar / cancelar / cerrar: attribute to the logged-in
--      employee when nobody picked a PIN; voiding a paid amount or closing
--      with a balance is manager-or-owner only.
-- Nothing is dropped. Tables, columns and QR stay as they are.
-- ===========================================================================

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
begin
  select local_id into v_local from public.mesa_sesiones where id = p_sesion;
  if v_local is null or not public._staff_puede(v_local, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_empleado is not null and not exists (
    select 1 from public.empleados where id = p_empleado and local_id = v_local) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;
  p_empleado := coalesce(p_empleado, public.empleado_de_usuario(v_local));
  v_comensal := nullif(p_datos->>'comensal_id', '')::uuid;
  if v_comensal is not null and not exists (
    select 1 from public.comensales where id = v_comensal and sesion_id = p_sesion) then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  return public._crear_pago_mesa(p_sesion, v_comensal, 'personal', p_datos, p_empleado);
end;
$$;

/* Staff confirms money they actually received. Never for Mercado Pago: that
 * one is confirmed by the webhook only. */
create or replace function public.confirmar_pago_mesa(p_pago uuid, p_empleado uuid default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
begin
  select * into v_p from public.pagos_mesa where id = p_pago;
  if not found or not public._staff_puede(v_p.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_empleado is not null and not exists (
    select 1 from public.empleados where id = p_empleado and local_id = v_p.local_id) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;
  p_empleado := coalesce(p_empleado, public.empleado_de_usuario(v_p.local_id));

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

/* Pending: any staff member can cancel it. Paid: only a manual one, while the
 * table is still open, with a reason, and only a manager or the owner (it's a
 * refund and stays in the audit log). */
create or replace function public.cancelar_pago_mesa(
  p_pago uuid,
  p_motivo text,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
  v_estado_sesion public.mesa_sesion_estado;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_p from public.pagos_mesa where id = p_pago;
  if not found or not public._staff_puede(v_p.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_empleado is not null and not exists (
    select 1 from public.empleados where id = p_empleado and local_id = v_p.local_id) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;
  p_empleado := coalesce(p_empleado, public.empleado_de_usuario(v_p.local_id));

  select estado into v_estado_sesion from public.mesa_sesiones where id = v_p.sesion_id for update;
  select * into v_p from public.pagos_mesa where id = p_pago for update;

  if v_p.estado = 'cancelado' then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  if v_p.estado = 'pagado' then
    if v_p.metodo = 'mercado_pago' then
      return json_build_object('ok', false, 'reason', 'mp-reembolso-externo');
    end if;
    if v_estado_sesion <> 'abierta' then
      return json_build_object('ok', false, 'reason', 'mesa-cerrada');
    end if;
    if not public.auth_gestiona_local(v_p.local_id) then
      return json_build_object('ok', false, 'reason', 'requiere-encargado');
    end if;
    if v_motivo is null then
      return json_build_object('ok', false, 'reason', 'motivo-requerido');
    end if;
  end if;

  update public.pagos_mesa
     set estado = 'cancelado', cancelado_en = now(),
         cancelado_motivo = left(coalesce(v_motivo, 'cancelado-por-personal'), 200),
         actualizado_en = now()
   where id = v_p.id;

  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'personal',
    p_pago => v_p.id, p_empleado => p_empleado,
    p_datos => json_build_object('estado_previo', v_p.estado, 'motivo', v_motivo)::jsonb);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true);
end;
$$;

create or replace function public.cerrar_mesa(
  p_sesion uuid,
  p_motivo text,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_totales json;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  if not found or not public._staff_puede(v_s.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_empleado is not null and not exists (
    select 1 from public.empleados where id = p_empleado and local_id = v_s.local_id) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;
  p_empleado := coalesce(p_empleado, public.empleado_de_usuario(v_s.local_id));
  select * into v_s from public.mesa_sesiones where id = p_sesion for update;
  if v_s.estado = 'cerrada' then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  perform public._expirar_pagos_mp(p_sesion);
  if exists (select 1 from public.pagos_mesa where sesion_id = p_sesion and estado = 'pendiente') then
    return json_build_object('ok', false, 'reason', 'pagos-pendientes');
  end if;

  v_totales := public._cuenta_json(p_sesion)->'totales';
  if (v_totales->>'falta_cubrir')::int > 0 then
    if not public.auth_gestiona_local(v_s.local_id) then
      return json_build_object('ok', false, 'reason', 'requiere-encargado',
        'falta_cubrir', (v_totales->>'falta_cubrir')::int);
    end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      return json_build_object('ok', false, 'reason', 'motivo-requerido',
        'falta_cubrir', (v_totales->>'falta_cubrir')::int);
    end if;
  end if;

  update public.mesa_sesiones
     set estado = 'cerrada', cerrada_en = now(),
         cerrada_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 200),
         version = version + 1, actualizado_en = now()
   where id = p_sesion;

  perform public._mesa_evento(v_s.local_id, p_sesion, 'mesa_cerrada', 'personal',
    p_empleado => p_empleado,
    p_datos => json_build_object('motivo', p_motivo, 'totales', v_totales)::jsonb);
  return json_build_object('ok', true);
end;
$$;

/* Same as security-fixes-09 / split-payments, plus the manager check.
 * The waitlist screen calls this on load for everyone, so a waiter gets a
 * quiet 'sin-permiso' instead of an error. */
create or replace function public.sincronizar_mesas(
  p_local    uuid,
  p_cantidad integer
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_n         integer;
  v_creadas   integer;
  v_borradas  integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;
  if not public.auth_gestiona_local(p_local) then
    return json_build_object('ok', false, 'reason', 'sin-permiso');
  end if;
  if not public.local_operativo(p_local) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  v_n := greatest(1, least(500, coalesce(p_cantidad, 1)));

  insert into public.mesas (local_id, numero, estado, capacidad)
  select p_local, g, 'libre', 4
    from generate_series(1, v_n) as g
  on conflict (local_id, numero) do nothing;
  get diagnostics v_creadas = row_count;

  delete from public.mesas m
   where m.local_id = p_local
     and m.numero > v_n
     and m.estado = 'libre'
     and m.espera_id is null
     and m.reserva_id is null
     and not exists (
       select 1 from public.mesa_sesiones s
        where s.mesa_id = m.id and s.estado = 'abierta'
     );
  get diagnostics v_borradas = row_count;

  return json_build_object('ok', true, 'creadas', v_creadas, 'borradas', v_borradas);
end;
$$;

grant execute on function public.sincronizar_mesas(uuid, integer) to authenticated;
grant execute on function public.registrar_pago_personal(uuid, jsonb, uuid) to authenticated;
grant execute on function public.confirmar_pago_mesa(uuid, uuid) to authenticated;
grant execute on function public.cancelar_pago_mesa(uuid, text, uuid) to authenticated;
grant execute on function public.cerrar_mesa(uuid, text, uuid) to authenticated;

-- Check (read only). Expected: true, true.
select
  pg_get_functiondef('public.sincronizar_mesas(uuid, integer)'::regprocedure)
    like '%auth_gestiona_local%' as sync_guarda,
  pg_get_functiondef('public.cancelar_pago_mesa(uuid, text, uuid)'::regprocedure)
    like '%requiere-encargado%' as anular_guarda;
