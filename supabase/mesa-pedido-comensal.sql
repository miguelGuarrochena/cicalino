-- ===========================================================================
-- Cicalino — Pedido de mesa: anotar a mano, cancelar hasta que el local anote
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: split-payments.sql, pedidos-en-preparacion.sql
--
-- El QR de mesa no es la comanda del local. El pedido llega al panel para
-- copiarlo a mano. "en_preparacion" significa "ya lo anoté", no un KDS.
--
-- 1) El barrido automático a en_preparacion (el del mostrador de Pedidos
--    listos, al minuto) no puede tocar pedidos de mesa: si no, el cliente
--    pierde la ventana para cancelar y el panel marca "anotado" solo.
-- 2) El comensal puede cancelar su pedido mientras sigue en `creado`.
--    Después, le pide al mozo.
-- ===========================================================================

create or replace function public.marcar_en_preparacion_local(p_local uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  update public.pedidos
     set estado = 'en_preparacion',
         en_preparacion_en = now()
   where local_id = p_local
     and estado = 'creado'
     and sesion_id is null
     and creado_en <= now() - interval '1 minute';

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.marcar_en_preparacion_pendientes()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  update public.pedidos
     set estado = 'en_preparacion',
         en_preparacion_en = now()
   where estado = 'creado'
     and sesion_id is null
     and creado_en <= now() - interval '1 minute';

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.marcar_en_preparacion_local(uuid) to authenticated;
revoke execute on function public.marcar_en_preparacion_pendientes()
  from public, anon, authenticated;


create or replace function public.pedidos_mesa_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_comprometida integer;
  v_restante integer;
  v_actor text;
begin
  if (new.sesion_id is distinct from old.sesion_id
      or new.comensal_id is distinct from old.comensal_id
      or new.clave_idempotencia is distinct from old.clave_idempotencia)
     and auth.uid() is not null
     and coalesce(public.auth_rol()::text, '') <> 'superadmin' then
    raise exception 'Table order links are read only' using errcode = '42501';
  end if;

  if old.sesion_id is null or new.sesion_id is null then
    return new;
  end if;

  if new.estado = 'cancelado' and old.estado <> 'cancelado' then
    perform 1 from public.mesa_sesiones where id = old.sesion_id for update;
    select coalesce(sum(monto_base), 0) into v_comprometida
      from public.pagos_mesa where sesion_id = old.sesion_id and estado <> 'cancelado';
    select coalesce(sum(i.subtotal), 0) into v_restante
      from public.pedido_items i join public.pedidos p on p.id = i.pedido_id
     where i.sesion_id = old.sesion_id and p.estado <> 'cancelado' and p.id <> old.id;
    if v_comprometida > v_restante then
      raise exception 'Payments already cover this order; cancel a payment first'
        using errcode = 'P0001', hint = 'pagos-exceden';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    v_actor := coalesce(nullif(current_setting('cicalino.actor', true), ''),
      case when auth.uid() is not null then 'personal' else 'sistema' end);
    perform public._mesa_evento(old.local_id, old.sesion_id, 'pedido_' || new.estado::text,
      v_actor, p_pedido => old.id,
      p_comensal => case when v_actor = 'comensal' then old.comensal_id end);
    perform public._tocar_sesion(old.sesion_id);
  end if;
  return new;
end;
$$;


create or replace function public.cancelar_pedido_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_pedido uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_p public.pedidos%rowtype;
  v_hint text;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if not found or v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;

  select * into v_p from public.pedidos
   where id = p_pedido and comensal_id = v_c.id and sesion_id = v_c.sesion_id
     for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_p.estado <> 'creado' then
    return json_build_object('ok', false, 'reason', 'ya-anotado');
  end if;

  perform set_config('cicalino.actor', 'comensal', true);

  update public.pedidos
     set estado = 'cancelado', cancelado_en = now()
   where id = v_p.id and estado = 'creado';
  if not found then
    return json_build_object('ok', false, 'reason', 'ya-anotado');
  end if;

  return json_build_object('ok', true);
exception
  when sqlstate 'P0001' then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint = 'pagos-exceden' then
      return json_build_object('ok', false, 'reason', 'pagos-exceden');
    end if;
    raise;
end;
$$;

revoke all on function public.cancelar_pedido_comensal(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cancelar_pedido_comensal(uuid, text, uuid)
  to service_role;

notify pgrst, 'reload schema';
