-- ===========================================================================
-- Cicalino — Blockers de producción (cuenta, Mercado Pago, jornada, pagada)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: mesa-cuenta-compartida.sql, dias-cerrados-jornada.sql,
--           split-payments.sql, staff-floor-guards.sql
--
-- 1. Pedidos y joins cortan cuando la cuenta ya se pidió.
-- 2. Un webhook tardío de Mercado Pago no cubre: pago cancelado, sesión
--    pagada/cerrada, o monto que pasaría el consumo. Queda `mp_estado =
--    excedente` para que Cobrar lo vea.
-- 3. Partes iguales: la última se lleva el resto.
-- 4. Si falla el preference, se revierte la solicitud de pago total.
-- 5. Mesa pagada sigue ocupada; anular un cobro manual la puede reabrir.
-- 7. Cierre de jornada cancela definido/pendiente y cierra sesiones.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Cerrar una sesión al corte de jornada (pagos definidos/pendientes + sesión).
-- ---------------------------------------------------------------------------
create or replace function public._cerrar_sesion_jornada(p_sesion uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  r record;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion for update;
  if not found or v_s.estado = 'cerrada' then
    return;
  end if;

  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'jornada-cerrada', actualizado_en = now()
     where sesion_id = v_s.id and estado in ('pendiente', 'definido')
    returning id
  loop
    perform public._mesa_evento(v_s.local_id, v_s.id, 'pago_cancelado', 'sistema',
      p_pago => r.id, p_datos => '{"motivo":"jornada-cerrada"}'::jsonb);
  end loop;

  update public.mesa_sesiones
     set estado = 'cerrada', cerrada_en = now(), cerrada_motivo = 'jornada-cerrada',
         version = version + 1, actualizado_en = now()
   where id = v_s.id;
  perform public._mesa_evento(v_s.local_id, v_s.id, 'mesa_cerrada', 'sistema',
    p_datos => json_build_object('motivo', 'jornada-cerrada',
      'cuenta', public._cuenta_json(v_s.id)->'totales')::jsonb);
end;
$$;

revoke all on function public._cerrar_sesion_jornada(uuid)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 1 + 5 + 7) Unirse: no hay join con cuenta pedida ni sobre mesa pagada.
--     Sesión de jornada anterior: cancela definido/pendiente y cierra.
-- ---------------------------------------------------------------------------
create or replace function public.unirse_mesa(
  p_token text,
  p_nombre text,
  p_token_hash text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_m public.mesas%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_comensal uuid;
  v_nuevo boolean := false;
begin
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 24 then
    return json_build_object('ok', false, 'reason', 'nombre-invalido');
  end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return json_build_object('ok', false, 'reason', 'token-invalido');
  end if;

  select * into v_m from public.mesas where qr_token = p_token for update;
  if not found or not v_m.qr_activo then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not public.local_tiene_modulo(v_m.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not exists (
    select 1 from public.locales l join public.organizaciones o on o.id = l.organizacion_id
     where l.id = v_m.local_id and o.activo
       and coalesce(o.estado_suscripcion, 'active') <> 'expired') then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  perform 1 from public.mesa_sesiones
   where mesa_id = v_m.id and estado in ('abierta', 'pagada')
   for update;

  select * into v_s from public.mesa_sesiones
   where mesa_id = v_m.id and estado in ('abierta', 'pagada')
   order by case estado when 'abierta' then 0 else 1 end, abierta_en desc
   limit 1;

  if found then
    if v_s.actualizado_en < public.jornada_inicio_local(v_m.local_id) then
      perform public._cerrar_sesion_jornada(v_s.id);
      v_s := null;
    elsif v_s.estado = 'pagada' then
      return json_build_object('ok', false, 'reason', 'mesa-ocupada');
    elsif v_s.cuenta_solicitada_en is not null then
      return json_build_object('ok', false, 'reason', 'cuenta-solicitada');
    end if;
  end if;

  if v_s.id is null then
    insert into public.mesa_sesiones (local_id, mesa_id, mesa_numero)
    values (v_m.local_id, v_m.id, v_m.numero)
    returning * into v_s;
    v_nuevo := true;
    perform public._mesa_evento(v_s.local_id, v_s.id, 'mesa_abierta', 'comensal');
  end if;

  insert into public.comensales (sesion_id, local_id, nombre, token_hash)
  values (v_s.id, v_s.local_id, v_nombre, lower(p_token_hash))
  returning id into v_comensal;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'comensal_unido', 'comensal',
    p_comensal => v_comensal, p_datos => json_build_object('nombre', v_nombre)::jsonb);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'sesion_id', v_s.id, 'comensal_id', v_comensal,
    'sesion_nueva', v_nuevo);
end;
$$;

revoke all on function public.unirse_mesa(text, text, text)
  from public, anon, authenticated;
grant execute on function public.unirse_mesa(text, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 1) Pedir con la cuenta ya solicitada.
-- ---------------------------------------------------------------------------
create or replace function public.pedir_como_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_items jsonb,
  p_clave uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_corte integer;
  v_expira timestamptz;
  v_pedido uuid;
  v_lineas integer;
  v_validas integer;
  v_total integer;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if p_clave is null then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;
  if v_s.cuenta_solicitada_en is not null then
    return json_build_object('ok', false, 'reason', 'cuenta-solicitada');
  end if;
  if not public.local_tiene_modulo(v_s.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not exists (
    select 1 from public.locales l join public.organizaciones o on o.id = l.organizacion_id
     where l.id = v_s.local_id and o.activo
       and coalesce(o.estado_suscripcion, 'active') <> 'expired') then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  select id into v_pedido from public.pedidos
   where comensal_id = v_c.id and clave_idempotencia = p_clave;
  if found then
    return json_build_object('ok', true, 'repetido', true, 'pedido_id', v_pedido);
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;
  v_lineas := jsonb_array_length(p_items);
  if v_lineas < 1 or v_lineas > 30 then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  select count(*) into v_validas
    from jsonb_array_elements(p_items) e
    join public.productos pr
      on pr.id = (e->>'producto_id')::uuid
     and pr.local_id = v_s.local_id and pr.activo
   where jsonb_typeof(e->'cantidad') = 'number'
     and (e->>'cantidad')::int between 1 and 50;
  if v_validas <> v_lineas
     or (select count(distinct e->>'producto_id') from jsonb_array_elements(p_items) e) <> v_lineas then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  select coalesce(l.hora_corte, 6) into v_corte from public.locales l where l.id = v_s.local_id;
  v_expira := public.jornada_inicio_corte(v_corte) + interval '1 day';

  insert into public.pedidos (
    local_id, referencia, alias_cliente, estado, qr_token, qr_expira_en,
    sesion_id, comensal_id, clave_idempotencia
  ) values (
    v_s.local_id, 'Mesa ' || v_s.mesa_numero, v_c.nombre, 'creado',
    gen_random_uuid()::text, v_expira, v_s.id, v_c.id, p_clave
  )
  returning id into v_pedido;

  insert into public.pedido_items (
    pedido_id, local_id, sesion_id, comensal_id, producto_id, nombre,
    precio_unitario, cantidad
  )
  select v_pedido, v_s.local_id, v_s.id, v_c.id, pr.id, pr.nombre, pr.precio,
         (e->>'cantidad')::int
    from jsonb_array_elements(p_items) e
    join public.productos pr on pr.id = (e->>'producto_id')::uuid;

  select coalesce(sum(subtotal), 0) into v_total from public.pedido_items where pedido_id = v_pedido;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'pedido_creado', 'comensal',
    p_comensal => v_c.id, p_pedido => v_pedido,
    p_datos => json_build_object('lineas', v_lineas, 'total', v_total)::jsonb);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'pedido_id', v_pedido, 'total', v_total);
end;
$$;

revoke all on function public.pedir_como_comensal(uuid, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.pedir_como_comensal(uuid, text, jsonb, uuid)
  to service_role;


-- ---------------------------------------------------------------------------
-- 3) Definir parte iguales: la última se lleva el resto (igual que _crear_pago_mesa).
-- ---------------------------------------------------------------------------
create or replace function public.definir_parte_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_datos jsonb
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_modo public.division_modo;
  v_metodo public.metodo_pago_mesa;
  v_clave uuid;
  v_existente public.pagos_mesa%rowtype;
  v_mio public.pagos_mesa%rowtype;
  v_consumo integer;
  v_comprometida integer;
  v_disponible integer;
  v_partes integer := 1;
  v_partes_tot integer;
  v_partes_comp integer;
  v_restantes integer;
  v_base integer;
  v_propina integer := 0;
  v_propina_pct integer;
  v_recargo integer := 0;
  v_recargo_pct numeric(4,2) := 0;
  v_esperado integer;
  v_extras record;
  v_pago public.pagos_mesa%rowtype;
  v_mio_consumo integer;
  v_mio_comp integer;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if not public.local_tiene_modulo(v_c.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if not found or v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;
  if v_s.cuenta_solicitada_en is not null then
    return json_build_object('ok', false, 'reason', 'cuenta-solicitada');
  end if;

  perform public._expirar_pagos_mp(v_s.id);

  begin
    v_modo := (p_datos->>'modo')::public.division_modo;
    v_metodo := (p_datos->>'metodo')::public.metodo_pago_mesa;
    v_clave := nullif(p_datos->>'clave', '')::uuid;
  exception when others then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end;
  if v_modo is null or v_metodo is null or v_modo = 'uno' then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  if v_clave is not null then
    select * into v_existente from public.pagos_mesa
     where sesion_id = v_s.id and clave_idempotencia = v_clave;
    if found then
      return json_build_object('ok', true, 'repetido', true, 'pago_id', v_existente.id,
        'monto_total', v_existente.monto_total, 'metodo', v_existente.metodo,
        'estado', v_existente.estado);
    end if;
  end if;

  if not public._metodo_mesa_habilitado(v_s.local_id, v_metodo, 'comensal') then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
  end if;

  select * into v_mio from public.pagos_mesa
   where sesion_id = v_s.id and comensal_id = v_c.id
     and creado_por = 'comensal'
     and estado in ('definido', 'pendiente', 'pagado')
   for update;
  if found and v_mio.estado in ('pendiente', 'pagado') then
    return json_build_object('ok', false, 'reason', 'cuenta-solicitada');
  end if;

  v_consumo := public._consumo_sesion(v_s.id);
  select coalesce(sum(monto_base), 0) into v_comprometida
    from public.pagos_mesa
   where sesion_id = v_s.id and estado <> 'cancelado'
     and id is distinct from v_mio.id;
  v_disponible := greatest(v_consumo - v_comprometida, 0);
  if v_disponible <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;

  if v_modo = 'consumo' then
    select coalesce(sum(i.subtotal), 0) into v_mio_consumo
      from public.pedido_items i join public.pedidos p on p.id = i.pedido_id
     where i.comensal_id = v_c.id and p.estado <> 'cancelado';
    select coalesce(sum(monto_base), 0) into v_mio_comp
      from public.pagos_mesa
     where comensal_id = v_c.id and sesion_id = v_s.id
       and estado <> 'cancelado' and id is distinct from v_mio.id;
    v_base := least(greatest(v_mio_consumo - v_mio_comp, 0), v_disponible);

  elsif v_modo = 'iguales' then
    v_partes := greatest(1, least(50, coalesce(nullif(p_datos->>'partes', '')::int, 1)));
    v_partes_tot := coalesce(
      nullif(p_datos->>'partes_totales', '')::int,
      v_s.partes,
      (select count(*) from public.comensales c where c.sesion_id = v_s.id)::int);
    if v_partes_tot is null or v_partes_tot < 1 or v_partes_tot > 50 then
      return json_build_object('ok', false, 'reason', 'partes-invalidas');
    end if;
    select coalesce(sum(partes) filter (where modo = 'iguales'), 0) into v_partes_comp
      from public.pagos_mesa
     where sesion_id = v_s.id and estado <> 'cancelado'
       and id is distinct from v_mio.id;
    v_restantes := v_partes_tot - v_partes_comp;
    if v_restantes <= 0 then
      v_base := v_disponible;
      v_partes := 1;
    elsif v_partes >= v_restantes then
      v_partes := v_restantes;
      v_base := v_disponible;
    else
      v_base := (v_disponible / v_restantes) * v_partes;
    end if;

  elsif v_modo = 'porcentaje' then
    if nullif(p_datos->>'porcentaje', '') is null
       or (p_datos->>'porcentaje')::numeric <= 0
       or (p_datos->>'porcentaje')::numeric > 100 then
      return json_build_object('ok', false, 'reason', 'porcentaje-invalido');
    end if;
    v_base := round(v_consumo * (p_datos->>'porcentaje')::numeric / 100)::int;
    if v_base > v_disponible then
      return json_build_object('ok', false, 'reason', 'excede', 'disponible', v_disponible);
    end if;

  else -- monto
    if nullif(p_datos->>'monto', '') is null then
      return json_build_object('ok', false, 'reason', 'monto-invalido');
    end if;
    v_base := (p_datos->>'monto')::int;
    if v_base > v_disponible then
      return json_build_object('ok', false, 'reason', 'excede', 'disponible', v_disponible);
    end if;
  end if;

  if v_base is null or v_base <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;

  begin
    select * into v_extras
      from public._propina_y_recargo(v_s.local_id, v_metodo, v_base, p_datos);
  exception when others then
    return json_build_object('ok', false, 'reason', 'propina-invalida');
  end;
  v_propina := v_extras.propina;
  v_propina_pct := v_extras.propina_pct;
  v_recargo := v_extras.recargo;
  v_recargo_pct := v_extras.recargo_pct;

  v_esperado := nullif(p_datos->>'monto_esperado', '')::int;
  if v_esperado is not null and v_esperado <> v_base + v_propina + v_recargo then
    return json_build_object('ok', false, 'reason', 'monto-cambio',
      'monto_base', v_base, 'propina', v_propina, 'recargo', v_recargo,
      'monto_total', v_base + v_propina + v_recargo);
  end if;

  if v_mio.id is not null then
    update public.pagos_mesa
       set modo = v_modo, partes = v_partes, monto_base = v_base,
           propina = v_propina, propina_porcentaje = v_propina_pct,
           recargo = v_recargo, recargo_porcentaje = v_recargo_pct,
           metodo = v_metodo, estado = 'definido',
           clave_idempotencia = coalesce(v_clave, clave_idempotencia),
           cancelado_en = null, cancelado_motivo = null,
           actualizado_en = now()
     where id = v_mio.id
    returning * into v_pago;
  else
    insert into public.pagos_mesa (
      local_id, sesion_id, comensal_id, pagador_nombre, modo, partes, monto_base,
      propina, propina_porcentaje, recargo, recargo_porcentaje, metodo, estado,
      creado_por, clave_idempotencia
    ) values (
      v_s.local_id, v_s.id, v_c.id, v_c.nombre, v_modo, v_partes, v_base,
      v_propina, v_propina_pct, v_recargo, v_recargo_pct, v_metodo,
      'definido', 'comensal', v_clave
    )
    returning * into v_pago;
  end if;

  update public.mesa_sesiones
     set cuenta_intencion = 'dividir',
         partes = case when v_modo = 'iguales' then coalesce(v_partes_tot, partes) else partes end
   where id = v_s.id;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'parte_definida', 'comensal',
    p_comensal => v_c.id, p_pago => v_pago.id,
    p_datos => json_build_object('modo', v_modo, 'metodo', v_metodo,
      'monto_base', v_base)::jsonb);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'pago_id', v_pago.id,
    'monto_base', v_pago.monto_base, 'propina', v_pago.propina,
    'recargo', v_pago.recargo, 'monto_total', v_pago.monto_total,
    'metodo', v_pago.metodo, 'estado', v_pago.estado);
end;
$$;

revoke all on function public.definir_parte_comensal(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.definir_parte_comensal(uuid, text, jsonb)
  to service_role;


-- ---------------------------------------------------------------------------
-- 5) Cobertura: si se anula un cobro, pagada vuelve a abierta.
-- ---------------------------------------------------------------------------
create or replace function public._revisar_cobertura(p_sesion uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_consumo integer;
  v_pagado integer;
  v_local uuid;
  v_estado public.mesa_sesion_estado;
begin
  v_consumo := public._consumo_sesion(p_sesion);
  select coalesce(sum(monto_base), 0) into v_pagado
    from public.pagos_mesa where sesion_id = p_sesion and estado = 'pagado';
  select estado into v_estado from public.mesa_sesiones where id = p_sesion;

  if v_consumo > 0 and v_pagado >= v_consumo then
    update public.mesa_sesiones
       set estado = 'pagada', pagada_en = now()
     where id = p_sesion and estado = 'abierta'
    returning local_id into v_local;
    if v_local is not null then
      perform public._mesa_evento(v_local, p_sesion, 'mesa_pagada', 'sistema',
        p_datos => json_build_object('consumo', v_consumo, 'pagado', v_pagado)::jsonb);
    end if;
  elsif v_estado = 'pagada' then
    update public.mesa_sesiones
       set estado = 'abierta', pagada_en = null, actualizado_en = now()
     where id = p_sesion and estado = 'pagada';
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2) Mercado Pago: no cubre cancelado, sesión cerrada/pagada, ni excedente.
-- ---------------------------------------------------------------------------
create or replace function public.mp_confirmar_pago(
  p_local uuid,
  p_pago uuid,
  p_mp_pago_id text,
  p_mp_estado text,
  p_monto numeric,
  p_moneda text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
  v_sesion public.mesa_sesion_estado;
  v_consumo integer;
  v_pagado integer;
  v_cubrir boolean;
begin
  perform 1 from public.mesa_sesiones s
    join public.pagos_mesa g on g.sesion_id = s.id
   where g.id = p_pago for update of s;

  select * into v_p from public.pagos_mesa where id = p_pago for update;
  if not found or v_p.local_id <> p_local or v_p.metodo <> 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'pago-desconocido');
  end if;

  if v_p.mp_pago_id is not null and v_p.mp_pago_id <> p_mp_pago_id then
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'mp_pago_duplicado', 'mercado_pago',
      p_pago => v_p.id, p_datos => json_build_object('mp_pago_id', p_mp_pago_id,
        'estado', p_mp_estado, 'monto', p_monto)::jsonb);
    return json_build_object('ok', false, 'reason', 'duplicado');
  end if;

  if p_mp_estado = 'approved' then
    if p_moneda <> 'ARS' or p_monto <> v_p.monto_total then
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'mp_monto_inconsistente', 'mercado_pago',
        p_pago => v_p.id, p_datos => json_build_object('mp_pago_id', p_mp_pago_id,
          'monto', p_monto, 'moneda', p_moneda, 'esperado', v_p.monto_total)::jsonb);
      update public.pagos_mesa set mp_pago_id = p_mp_pago_id, mp_estado = 'monto-inconsistente',
             actualizado_en = now() where id = v_p.id;
      perform public._tocar_sesion(v_p.sesion_id);
      return json_build_object('ok', false, 'reason', 'monto-inconsistente');
    end if;

    if v_p.estado = 'pagado' then
      return json_build_object('ok', true, 'repetido', true);
    end if;

    select estado into v_sesion from public.mesa_sesiones where id = v_p.sesion_id;
    v_consumo := public._consumo_sesion(v_p.sesion_id);
    select coalesce(sum(monto_base), 0) into v_pagado
      from public.pagos_mesa
     where sesion_id = v_p.sesion_id and estado = 'pagado';

    v_cubrir := v_p.estado = 'pendiente'
      and v_sesion = 'abierta'
      and (v_consumo <= 0 or v_pagado + v_p.monto_base <= v_consumo);

    if not v_cubrir then
      update public.pagos_mesa
         set mp_pago_id = p_mp_pago_id,
             mp_estado = 'excedente',
             estado = case when estado = 'pendiente' then 'cancelado' else estado end,
             cancelado_en = case when estado = 'pendiente' then now() else cancelado_en end,
             cancelado_motivo = case
               when estado = 'pendiente' then 'mp-excedente'
               else cancelado_motivo
             end,
             actualizado_en = now()
       where id = v_p.id;
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'excedente', 'mercado_pago',
        p_pago => v_p.id,
        p_datos => json_build_object('mp_pago_id', p_mp_pago_id, 'monto', p_monto,
          'estado_previo', v_p.estado, 'sesion', v_sesion)::jsonb);
      perform public._tocar_sesion(v_p.sesion_id);
      return json_build_object('ok', true, 'excedente', true);
    end if;

    update public.pagos_mesa
       set estado = 'pagado', confirmacion = 'webhook', confirmado_en = now(),
           mp_pago_id = p_mp_pago_id, mp_estado = p_mp_estado,
           cancelado_en = null, cancelado_motivo = null, actualizado_en = now()
     where id = v_p.id;

    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_confirmado',
      'mercado_pago', p_pago => v_p.id,
      p_datos => json_build_object('mp_pago_id', p_mp_pago_id, 'monto', p_monto)::jsonb);

    perform public._revisar_cobertura(v_p.sesion_id);
    perform public._tocar_sesion(v_p.sesion_id);
    return json_build_object('ok', true);
  end if;

  if p_mp_estado in ('rejected', 'cancelled', 'refunded', 'charged_back') then
    if v_p.estado = 'pendiente' then
      update public.pagos_mesa
         set estado = 'cancelado', cancelado_en = now(),
             cancelado_motivo = 'mp-' || p_mp_estado,
             mp_pago_id = p_mp_pago_id, mp_estado = p_mp_estado, actualizado_en = now()
       where id = v_p.id;
    else
      update public.pagos_mesa set mp_estado = p_mp_estado, actualizado_en = now()
       where id = v_p.id;
    end if;
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'mp_' || p_mp_estado, 'mercado_pago',
      p_pago => v_p.id, p_datos => json_build_object('mp_pago_id', p_mp_pago_id,
        'estado_previo', v_p.estado)::jsonb);
    perform public._tocar_sesion(v_p.sesion_id);
    return json_build_object('ok', true);
  end if;

  update public.pagos_mesa set mp_estado = p_mp_estado, actualizado_en = now()
   where id = v_p.id;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.mp_confirmar_pago(uuid, uuid, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.mp_confirmar_pago(uuid, uuid, text, text, numeric, text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 4) Preference de Mercado Pago falló: el pago total no deja la mesa trabada.
-- ---------------------------------------------------------------------------
create or replace function public.revertir_solicitud_mp(p_pago uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
  v_s public.mesa_sesiones%rowtype;
begin
  select * into v_p from public.pagos_mesa where id = p_pago;
  if not found or v_p.metodo <> 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'pago-desconocido');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_p.sesion_id for update;
  select * into v_p from public.pagos_mesa where id = p_pago for update;

  if v_p.estado <> 'pendiente' then
    return json_build_object('ok', true, 'repetido', true);
  end if;

  /* Pago total: sin preference no hay cobro. Se cancela el pendiente y se
   * limpia la solicitud para que la mesa no quede trabada. División: las
   * otras partes siguen pendientes; el checkout se reintenta sobre este. */
  if v_s.cuenta_intencion is distinct from 'total' then
    return json_build_object('ok', true, 'intencion', v_s.cuenta_intencion);
  end if;

  update public.pagos_mesa
     set estado = 'cancelado', cancelado_en = now(),
         cancelado_motivo = 'mp-preferencia-fallida', actualizado_en = now()
   where id = v_p.id;
  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'sistema',
    p_pago => v_p.id, p_datos => '{"motivo":"mp-preferencia-fallida"}'::jsonb);

  update public.mesa_sesiones
     set cuenta_intencion = null,
         cuenta_solicitada_en = null,
         cuenta_solicitada_por = null,
         cuenta_pagador_total_id = null,
         cuenta_pagador_total_nombre = null,
         version = version + 1,
         actualizado_en = now()
   where id = v_s.id;

  perform public._tocar_sesion(v_s.id);
  return json_build_object('ok', true, 'intencion', 'total');
end;
$$;

revoke all on function public.revertir_solicitud_mp(uuid)
  from public, anon, authenticated;
grant execute on function public.revertir_solicitud_mp(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 5) Anular cobro manual también con la mesa pagada (sigue ocupada).
-- ---------------------------------------------------------------------------
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
    if v_estado_sesion not in ('abierta', 'pagada') then
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
  perform public._revisar_cobertura(v_p.sesion_id);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.cancelar_pago_mesa(uuid, text, uuid)
  from public, anon;
grant execute on function public.cancelar_pago_mesa(uuid, text, uuid)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 7) Cron / panel: además de liberar mesas, cierra sesiones de la jornada previa.
-- ---------------------------------------------------------------------------
create or replace function public.liberar_mesas_jornada_local(p_local uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n     integer;
  v_corte integer;
  v_desde timestamptz;
  r       record;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  select coalesce(l.hora_corte, 6)
    into v_corte
    from public.locales l
   where l.id = p_local;

  if not found then
    return 0;
  end if;

  v_desde := public.jornada_inicio_local(p_local);

  for r in
    select id from public.mesa_sesiones
     where local_id = p_local
       and estado in ('abierta', 'pagada')
       and actualizado_en < v_desde
  loop
    perform public._cerrar_sesion_jornada(r.id);
  end loop;

  update public.mesas
     set estado = 'libre',
         espera_id = null,
         reserva_id = null,
         actualizado_en = now()
   where local_id = p_local
     and estado = 'ocupada'
     and actualizado_en < v_desde;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.liberar_mesas_jornada_local(uuid)
  from public, anon;
grant execute on function public.liberar_mesas_jornada_local(uuid)
  to authenticated;


create or replace function public.liberar_mesas_jornada()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r     record;
  v_n   integer := 0;
  v_k   integer;
  v_desde timestamptz;
  s     record;
begin
  for r in
    select id, hora_corte, dias_cerrados from public.locales
  loop
    v_desde := public.jornada_inicio_corte(r.hora_corte, r.dias_cerrados);

    for s in
      select id from public.mesa_sesiones
       where local_id = r.id
         and estado in ('abierta', 'pagada')
         and actualizado_en < v_desde
    loop
      perform public._cerrar_sesion_jornada(s.id);
    end loop;

    update public.mesas
       set estado = 'libre',
           espera_id = null,
           reserva_id = null,
           actualizado_en = now()
     where local_id = r.id
       and estado = 'ocupada'
       and actualizado_en < v_desde;

    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.liberar_mesas_jornada()
  from public, anon, authenticated;
grant execute on function public.liberar_mesas_jornada()
  to service_role;

notify pgrst, 'reload schema';
