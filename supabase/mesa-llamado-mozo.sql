-- ===========================================================================
-- Cicalino — El comensal llama al mesero/a
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: split-payments.sql, mesa-pedido-comensal.sql
--
-- Un botón en el celular para cualquier cosa (cubiertos, la cuenta, una
-- consulta). Queda prendido en Pedido hasta que el local toca «Ya voy».
-- Elegir efectivo, transferencia o tarjeta desde el celular avisa igual:
-- no está pagado, hay que pasar a confirmar.
-- ===========================================================================

alter table public.mesa_sesiones
  add column if not exists llamado_en timestamptz;


create or replace function public._cuenta_json(p_sesion uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_consumo integer;
  v_res json;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  if not found then
    return null;
  end if;
  v_consumo := public._consumo_sesion(p_sesion);

  select json_build_object(
    'sesion', json_build_object(
      'id', v_s.id, 'local_id', v_s.local_id, 'mesa_id', v_s.mesa_id,
      'mesa_numero', v_s.mesa_numero, 'estado', v_s.estado,
      'modo_division', v_s.modo_division, 'partes', v_s.partes,
      'version', v_s.version, 'abierta_en', v_s.abierta_en,
      'actualizado_en', v_s.actualizado_en, 'pagada_en', v_s.pagada_en,
      'cerrada_en', v_s.cerrada_en, 'cerrada_motivo', v_s.cerrada_motivo,
      'llamado_en', v_s.llamado_en
    ),
    'comensales', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'nombre', c.nombre, 'creado_en', c.creado_en,
        'consumo', coalesce((
          select sum(i.subtotal) from public.pedido_items i
            join public.pedidos p on p.id = i.pedido_id
           where i.comensal_id = c.id and p.estado <> 'cancelado'), 0)
      ) order by c.creado_en)
        from public.comensales c where c.sesion_id = p_sesion
    ), '[]'::json),
    'pedidos', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'comensal_id', p.comensal_id, 'estado', p.estado,
        'creado_en', p.creado_en, 'listo_en', p.listo_en,
        'retirado_en', p.retirado_en, 'cancelado_en', p.cancelado_en,
        'items', coalesce((
          select json_agg(json_build_object(
            'id', i.id, 'comensal_id', i.comensal_id, 'producto_id', i.producto_id,
            'nombre', i.nombre, 'precio_unitario', i.precio_unitario,
            'cantidad', i.cantidad, 'subtotal', i.subtotal
          ) order by i.creado_en, i.nombre)
            from public.pedido_items i where i.pedido_id = p.id
        ), '[]'::json)
      ) order by p.creado_en)
        from public.pedidos p where p.sesion_id = p_sesion
    ), '[]'::json),
    'pagos', coalesce((
      select json_agg(json_build_object(
        'id', g.id, 'comensal_id', g.comensal_id, 'pagador_nombre', g.pagador_nombre,
        'modo', g.modo, 'partes', g.partes, 'monto_base', g.monto_base,
        'propina', g.propina, 'propina_porcentaje', g.propina_porcentaje,
        'recargo', g.recargo, 'recargo_porcentaje', g.recargo_porcentaje,
        'monto_total', g.monto_total, 'metodo', g.metodo, 'estado', g.estado,
        'creado_por', g.creado_por, 'confirmacion', g.confirmacion,
        'creado_en', g.creado_en, 'confirmado_en', g.confirmado_en,
        'cancelado_en', g.cancelado_en, 'cancelado_motivo', g.cancelado_motivo,
        'expira_en', g.expira_en, 'mp_estado', g.mp_estado
      ) order by g.creado_en)
        from public.pagos_mesa g where g.sesion_id = p_sesion
    ), '[]'::json),
    'totales', (
      select json_build_object(
        'consumo', v_consumo,
        'propinas', coalesce(sum(g.propina) filter (where g.estado <> 'cancelado'), 0),
        'recargos', coalesce(sum(g.recargo) filter (where g.estado <> 'cancelado'), 0),
        'total', v_consumo
                 + coalesce(sum(g.propina + g.recargo) filter (where g.estado <> 'cancelado'), 0),
        'pagado', coalesce(sum(g.monto_total) filter (where g.estado = 'pagado'), 0),
        'pendiente_confirmar', coalesce(sum(g.monto_total) filter (where g.estado = 'pendiente'), 0),
        'base_pagada', coalesce(sum(g.monto_base) filter (where g.estado = 'pagado'), 0),
        'base_comprometida', coalesce(sum(g.monto_base) filter (where g.estado <> 'cancelado'), 0),
        'partes_comprometidas', coalesce(sum(g.partes) filter (where g.estado <> 'cancelado' and g.modo = 'iguales'), 0),
        'falta_cubrir', greatest(v_consumo
          - coalesce(sum(g.monto_base) filter (where g.estado = 'pagado'), 0), 0),
        'disponible', greatest(v_consumo
          - coalesce(sum(g.monto_base) filter (where g.estado <> 'cancelado'), 0), 0)
      )
        from public.pagos_mesa g where g.sesion_id = p_sesion
    )
  ) into v_res;

  return v_res;
end;
$$;


create or replace function public.llamar_mozo_comensal(
  p_comensal uuid,
  p_token_hash text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if not found or v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;

  if v_s.llamado_en is not null then
    return json_build_object('ok', true, 'ya-llamado', true);
  end if;

  update public.mesa_sesiones
     set llamado_en = now()
   where id = v_s.id;

  perform public._mesa_evento(
    v_s.local_id, v_s.id, 'mozo_llamado', 'comensal', p_comensal => v_c.id);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.llamar_mozo_comensal(uuid, text)
  from public, anon, authenticated;
grant execute on function public.llamar_mozo_comensal(uuid, text)
  to service_role;


/* Cash, transfer and cards chosen on the phone are not paid yet: someone
 * has to come by. Light Pedido the same way as the explicit call button. */
create or replace function public.pagar_como_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_datos jsonb
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_res json;
  v_metodo text;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if not public.local_tiene_modulo(v_c.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  v_res := public._crear_pago_mesa(v_c.sesion_id, v_c.id, 'comensal', p_datos);
  v_metodo := v_res->>'metodo';
  if coalesce(v_res->>'ok', '') = 'true'
     and v_metodo is not null
     and v_metodo <> 'mercado_pago' then
    update public.mesa_sesiones
       set llamado_en = now()
     where id = v_c.sesion_id and estado = 'abierta' and llamado_en is null;
    if found then
      perform public._mesa_evento(
        v_c.local_id, v_c.sesion_id, 'mozo_llamado', 'comensal', p_comensal => v_c.id);
      perform public._tocar_sesion(v_c.sesion_id);
    end if;
  end if;
  return v_res;
end;
$$;


create or replace function public.atender_llamado_mesa(p_sesion uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  if not found or not public._staff_puede(v_s.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_s from public.mesa_sesiones where id = p_sesion for update;
  if v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;
  if v_s.llamado_en is null then
    return json_build_object('ok', true, 'repetido', true);
  end if;

  update public.mesa_sesiones
     set llamado_en = null
   where id = v_s.id;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'llamado_atendido', 'personal');
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.atender_llamado_mesa(uuid) from public, anon;
grant execute on function public.atender_llamado_mesa(uuid) to authenticated;

notify pgrst, 'reload schema';
