-- ===========================================================================
-- Cicalino — Mostrador QR: requerir el pago antes de preparar el pedido
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: pedidos-modalidades-combinables.sql
--
-- Una opción por sucursal (`locales.mostrador_qr_pago_previo`, apagada por
-- defecto). Apagada, el Mostrador QR queda exactamente como estaba: el pedido
-- nace en `creado` y el pago va aparte. Prendida, el pedido nace en
-- `pendiente_pago` y entra al local recién cuando el pago está confirmado,
-- igual que en la modalidad Mesa:
--
--   pedido → pendiente_pago → (Mercado Pago o caja) → creado → flujo de siempre
--
-- No hay estado ni mecanismo nuevo: se reutiliza lo de Mesa
-- (pedidos-mesa.sql). La guarda que exige pagos que cubran el total para
-- salir de `pendiente_pago`, el trigger que suelta el cobro pendiente al
-- cancelar, cancelar_pedido_autoservicio, pedidos_por_cobrar y el tablero que
-- no muestra `pendiente_pago` ya andaban para cualquier pedido de un QR.
--
-- QUÉ CAMBIA (cada función parte de su versión vigente)
--   pedir_mostrador_qr          (pedidos-mostrador-qr-metodos.sql) elige el
--                               estado inicial según la opción del local.
--   pedidos_autoservicio_guard  (pedidos-mostrador-qr.sql) acepta el estado
--                               inicial que corresponde a la opción, y solo
--                               ese.
--   mp_confirmar_pago           (pedidos-mostrador-qr.sql) y
--   cobrar_pedido_autoservicio  (pedidos-mostrador-qr.sql) además de dejarlo
--                               pago, lo pasan de pendiente_pago a creado.
--   _cerrar_sesion              (pedidos-mesa.sql) cancela también los del
--                               mostrador que nadie pagó.
--
-- La liberación depende del ESTADO del pedido, no de la opción del local:
-- si el dueño la cambia con pedidos esperando el pago, esos se siguen
-- confirmando al pagarse.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) La opción
-- ---------------------------------------------------------------------------
alter table public.locales
  add column if not exists mostrador_qr_pago_previo boolean not null default false;
comment on column public.locales.mostrador_qr_pago_previo is
  'Mostrador QR: el pedido nace en pendiente_pago y entra al local recién cuando el pago (Mercado Pago o caja) está confirmado. Apagado, entra en el acto y se paga aparte.';


-- ---------------------------------------------------------------------------
-- 1) Confirmar el pedido (pedidos-mostrador-qr-metodos.sql + estado inicial)
-- ---------------------------------------------------------------------------
create or replace function public.pedir_mostrador_qr(
  p_token text,
  p_comensal uuid,
  p_token_hash text,
  p_items jsonb,
  p_clave uuid,
  p_metodo text,
  p_nombre text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_local uuid;
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_existente public.pedidos%rowtype;
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_corte integer;
  v_cerrados integer[];
  v_desde timestamptz;
  v_expira timestamptz;
  v_max bigint;
  v_ref text;
  v_pedido uuid;
  v_lineas integer;
  v_validas integer;
  v_total integer;
  v_pago json;
  v_pago_previo boolean;
begin
  select id into v_local from public.locales where mostrador_qr_token = p_token;
  if v_local is null then
    return json_build_object('ok', false, 'reason', 'qr-vencido');
  end if;
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if p_clave is null or coalesce(p_metodo, '') not in ('caja', 'mercado_pago') then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;
  if v_nombre is not null and char_length(v_nombre) not between 2 and 24 then
    return json_build_object('ok', false, 'reason', 'nombre-invalido');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if not found or v_s.flujo <> 'mostrador_qr' or v_s.local_id <> v_local then
    /* La identidad es de otro local (o de una mesa): la pantalla abre una de
     * este mostrador y reintenta. */
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if v_s.estado <> 'abierta'
     or v_s.actualizado_en < public.jornada_inicio_local(v_s.local_id) then
    /* Una sesión de otra jornada: la pantalla abre otra y reintenta. */
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;
  if not public.local_pedidos_mostrador_qr(v_s.local_id) then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not public._local_suscripcion_activa(v_s.local_id) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  /* Reintento del mismo carrito (se cortó la red): el mismo pedido. */
  select * into v_existente from public.pedidos
   where comensal_id = v_c.id and clave_idempotencia = p_clave;
  if found then
    return json_build_object('ok', true, 'repetido', true, 'pedido_id', v_existente.id,
      'referencia', v_existente.referencia, 'total', public._total_pedido(v_existente.id),
      'metodo', case when v_existente.pago_caja_en is not null then 'caja' else 'mercado_pago' end,
      'pago_id', (select g.id from public.pagos_mesa g
                   where g.pedido_id = v_existente.id and g.estado = 'pendiente'
                     and g.metodo = 'mercado_pago'
                   order by g.creado_en desc limit 1));
  end if;

  if not public._mostrador_metodos_ok(v_s.local_id) then
    return json_build_object('ok', false, 'reason', 'sin-metodos');
  end if;
  if p_metodo = 'mercado_pago'
     and not public._metodo_mesa_habilitado(v_s.local_id, 'mercado_pago', 'comensal') then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
  end if;
  /* "Pagar en caja" no es un método: es pagar al retirar con alguno de los
   * que el local cobra en persona. Sin ninguno, no se ofrece. */
  if p_metodo = 'caja' and not public._mostrador_caja_habilitada(v_s.local_id) then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;
  v_lineas := jsonb_array_length(p_items);
  if v_lineas < 1 or v_lineas > 30 then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  /* Mismas reglas que pedir_autoservicio: cada renglón es un producto activo
   * de esta sucursal, una sola vez, con una cantidad razonable. */
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

  /* El número sale de la misma serie que crear_pedido y pedir_autoservicio,
   * con el mismo lock: no choca con un pedido que cargó la caja.
   *
   * La opción de pago previo se lee con ese mismo lock: no puede cambiar
   * entre esta lectura y el INSERT, que la guardia vuelve a comprobar. La
   * decide la base; lo que diga la pantalla del cliente no cuenta. */
  select coalesce(l.hora_corte, 6), coalesce(l.dias_cerrados, '{}'::integer[]),
         coalesce(l.mostrador_qr_pago_previo, false)
    into v_corte, v_cerrados, v_pago_previo
    from public.locales l where l.id = v_s.local_id
   for update;
  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;
  v_desde := public.jornada_inicio_corte(v_corte, v_cerrados);
  v_expira := public.jornada_fin_corte(v_corte, v_cerrados);

  select coalesce(max(nullif(substring(referencia from '^[0-9]+'), '')::bigint), 0)
    into v_max
    from public.pedidos
   where local_id = v_s.local_id and creado_en >= v_desde;
  v_ref := (v_max + 1)::text;

  insert into public.pedidos (
    local_id, referencia, alias_cliente, estado, qr_token, qr_expira_en,
    sesion_id, comensal_id, clave_idempotencia, autoservicio, pago_caja_en
  ) values (
    /* Con pago previo espera el pago, como un pedido de Mesa: el tablero no
     * lo muestra hasta que el cobro lo pasa a `creado`. */
    v_s.local_id, v_ref, v_nombre,
    case when v_pago_previo then 'pendiente_pago' else 'creado' end::public.order_status,
    gen_random_uuid()::text,
    v_expira, v_s.id, v_c.id, p_clave, true,
    case when p_metodo = 'caja' then now() end
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

  v_total := public._total_pedido(v_pedido);

  /* El nombre queda para el próximo pedido de este teléfono. */
  if v_nombre is not null then
    update public.comensales set nombre = v_nombre where id = v_c.id;
  end if;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'pedido_creado', 'comensal',
    p_comensal => v_c.id, p_pedido => v_pedido,
    p_datos => json_build_object('lineas', v_lineas, 'total', v_total,
      'metodo', p_metodo, 'flujo', 'mostrador_qr', 'pago_previo', v_pago_previo)::jsonb);

  if p_metodo = 'mercado_pago' then
    v_pago := public._crear_pago_pedido(v_pedido, 'mercado_pago', 'comensal');
    if coalesce(v_pago->>'ok', '') <> 'true' then
      raise exception 'mp payment for new order failed: %', v_pago->>'reason';
    end if;
  end if;

  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'pedido_id', v_pedido, 'referencia', v_ref,
    'total', v_total, 'metodo', p_metodo,
    'pago_id', case when v_pago is null then null else (v_pago->>'pago_id')::uuid end);
end;
$$;

revoke all on function public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 2) Guardia de pedidos de un QR (pedidos-mostrador-qr.sql + pago previo)
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_autoservicio_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_flujo text;
  v_total integer;
  v_pagado integer;
  v_personal boolean := auth.uid() is not null
    and coalesce(public.auth_rol()::text, '') <> 'superadmin';
begin
  if tg_op = 'INSERT' then
    if new.sesion_id is not null then
      select flujo into v_flujo from public.mesa_sesiones where id = new.sesion_id;
    end if;
    if new.autoservicio then
      /* Solo lo crean pedir_autoservicio / pedir_mostrador_qr (service_role). */
      if v_personal then
        raise exception 'Self-service orders are placed from the QR'
          using errcode = '42501';
      end if;
      if v_flujo = 'mostrador_qr' then
        if new.comensal_id is null then
          raise exception 'Counter QR order without a guest'
            using errcode = 'P0001', hint = 'autoservicio-invalido';
        end if;
        /* El estado inicial lo fija la opción del local, y solo ese vale:
         * con pago previo espera el pago; sin él entra al tablero. */
        if coalesce((select l.mostrador_qr_pago_previo from public.locales l
                      where l.id = new.local_id), false) then
          if new.estado <> 'pendiente_pago' then
            raise exception 'This counter QR order must be paid first'
              using errcode = 'P0001', hint = 'mostrador-pago-previo';
          end if;
          /* Se confirma al salir de pendiente_pago (más abajo), con el pago. */
          new.confirmado_en := null;
          return new;
        end if;
        if new.estado <> 'creado' then
          raise exception 'A counter QR order goes straight to the counter'
            using errcode = 'P0001', hint = 'mostrador-creado';
        end if;
        /* Entró al tablero ahora: la espera se cuenta desde acá. */
        new.confirmado_en := now();
        return new;
      end if;
      if v_flujo is distinct from 'autoservicio' or new.comensal_id is null then
        raise exception 'Self-service order without a self-service table session'
          using errcode = 'P0001', hint = 'autoservicio-invalido';
      end if;
      if new.estado <> 'pendiente_pago' then
        raise exception 'A self-service order starts waiting for payment'
          using errcode = 'P0001', hint = 'pendiente-pago';
      end if;
      new.confirmado_en := null;
    elsif v_flujo in ('autoservicio', 'mostrador_qr') then
      /* pedir_como_comensal (la cuenta de Pagos) sobre una sesión que no es
       * de cuenta compartida. */
      raise exception 'This session takes orders from its own flow'
        using errcode = 'P0001', hint = 'flujo-autoservicio';
    end if;
    return new;
  end if;

  if new.autoservicio is distinct from old.autoservicio then
    raise exception 'pedidos.autoservicio is read only' using errcode = '42501';
  end if;
  /* pagado_en lo escriben solo cobrar_pedido_autoservicio y mp_confirmar_pago. */
  if new.pagado_en is distinct from old.pagado_en
     and coalesce(current_setting('cicalino.pedido_pagado', true), '') <> '1' then
    new.pagado_en := old.pagado_en;
  end if;
  if not old.autoservicio then
    return new;
  end if;

  /* confirmado_en lo escribe solo esta función. */
  if new.confirmado_en is distinct from old.confirmado_en then
    new.confirmado_en := old.confirmado_en;
  end if;

  if new.estado is distinct from old.estado then
    if coalesce(nullif(current_setting('cicalino.actor', true), ''), '') = 'comensal'
       and not (old.estado = 'pendiente_pago' and new.estado = 'cancelado') then
      raise exception 'The order is already confirmed'
        using errcode = 'P0001', hint = 'ya-confirmado';
    end if;

    /* Mesa, y el mostrador con pago previo: salir de pendiente_pago (salvo
     * cancelado) exige cobros pagados que cubran el total, venga de quien
     * venga. Nadie vuelve a pendiente_pago ni sale de cancelado
     * (chequear_transicion_pedido). */
    if old.estado = 'pendiente_pago' and new.estado <> 'cancelado' then
      v_total := public._total_pedido(old.id);
      select coalesce(sum(monto_base), 0) into v_pagado
        from public.pagos_mesa
       where pedido_id = old.id and estado = 'pagado';
      if v_total <= 0 or v_pagado < v_total then
        raise exception 'The order is not paid yet'
          using errcode = 'P0001', hint = 'pedido-sin-pagar';
      end if;
      new.confirmado_en := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.pedidos_autoservicio_guard() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) Mercado Pago (pedidos-mostrador-qr.sql + pago previo)
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
  v_ped public.pedidos%rowtype;
  v_ped_ok boolean := false;
  v_flujo text;
  v_sesion public.mesa_sesion_estado;
  v_consumo integer;
  v_pagado integer;
  v_cubrir boolean;
  r record;
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

    select flujo, estado into v_flujo, v_sesion from public.mesa_sesiones where id = v_p.sesion_id;

    if v_p.pedido_id is not null then
      select * into v_ped from public.pedidos where id = v_p.pedido_id for update;
      v_ped_ok := found;
      v_cubrir := v_ped_ok
        and (case when v_flujo = 'mostrador_qr'
                  then v_ped.estado <> 'cancelado'
                  else v_ped.estado = 'pendiente_pago' end)
        and v_p.estado in ('pendiente', 'cancelado')
        and v_p.monto_base >= public._total_pedido(v_ped.id)
        and not exists (
          select 1 from public.pagos_mesa g
           where g.pedido_id = v_ped.id and g.estado = 'pagado' and g.id <> v_p.id);
    else
      v_consumo := public._consumo_sesion(v_p.sesion_id);
      select coalesce(sum(monto_base), 0) into v_pagado
        from public.pagos_mesa
       where sesion_id = v_p.sesion_id and estado = 'pagado';

      v_cubrir := v_p.estado = 'pendiente'
        and v_sesion = 'abierta'
        and (v_consumo <= 0 or v_pagado + v_p.monto_base <= v_consumo);
    end if;

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
        p_pago => v_p.id, p_pedido => v_p.pedido_id,
        p_datos => json_build_object('mp_pago_id', p_mp_pago_id, 'monto', p_monto,
          'estado_previo', v_p.estado, 'sesion', v_sesion,
          'pedido', v_ped.estado)::jsonb);
      perform public._tocar_sesion(v_p.sesion_id);
      return json_build_object('ok', true, 'excedente', true);
    end if;

    if v_p.pedido_id is not null then
      /* Otro intento del mismo pedido que seguía abierto (el cliente volvió a
       * tocar "Pagar"): se suelta, este es el que pagó. */
      for r in
        update public.pagos_mesa
           set estado = 'cancelado', cancelado_en = now(),
               cancelado_motivo = 'otro-pago-aprobado', actualizado_en = now()
         where pedido_id = v_p.pedido_id and estado = 'pendiente' and id <> v_p.id
        returning id
      loop
        perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'sistema',
          p_pago => r.id, p_pedido => v_p.pedido_id,
          p_datos => '{"motivo":"otro-pago-aprobado"}'::jsonb);
      end loop;
    end if;

    update public.pagos_mesa
       set estado = 'pagado', confirmacion = 'webhook', confirmado_en = now(),
           mp_pago_id = p_mp_pago_id, mp_estado = p_mp_estado,
           cancelado_en = null, cancelado_motivo = null, actualizado_en = now()
     where id = v_p.id;

    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_confirmado',
      'mercado_pago', p_pago => v_p.id, p_pedido => v_p.pedido_id,
      p_datos => json_build_object('mp_pago_id', p_mp_pago_id, 'monto', p_monto,
        'tarde', v_p.estado = 'cancelado')::jsonb);

    if v_p.pedido_id is not null and v_flujo = 'mostrador_qr' then
      perform public._marcar_pedido_pagado(v_p.pedido_id);
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pedido_pagado',
        'mercado_pago', p_pedido => v_p.pedido_id, p_pago => v_p.id,
        p_datos => json_build_object('estado', v_ped.estado)::jsonb);
      /* Pago previo: recién ahora entra al local. Lo decide el estado del
       * pedido, no la opción actual del local. La guardia vuelve a comprobar
       * que los cobros pagados cubren el total y fija confirmado_en. */
      update public.pedidos set estado = 'creado'
       where id = v_p.pedido_id and estado = 'pendiente_pago';
      if found then
        perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pedido_confirmado',
          'mercado_pago', p_pedido => v_p.pedido_id, p_pago => v_p.id);
      end if;
    elsif v_p.pedido_id is not null then
      update public.pedidos set estado = 'creado'
       where id = v_p.pedido_id and estado = 'pendiente_pago';
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pedido_confirmado',
        'mercado_pago', p_pedido => v_p.pedido_id, p_pago => v_p.id);
    else
      perform public._revisar_cobertura(v_p.sesion_id);
    end if;
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
      p_pago => v_p.id, p_pedido => v_p.pedido_id,
      p_datos => json_build_object('mp_pago_id', p_mp_pago_id,
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
-- 4) Cobrar en caja (pedidos-mostrador-qr.sql + pago previo)
-- ---------------------------------------------------------------------------
create or replace function public.cobrar_pedido_autoservicio(
  p_pedido uuid,
  p_metodo text,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pedidos%rowtype;
  v_flujo text;
  v_metodo public.metodo_pago_mesa;
  v_attr json;
  v_pago json;
  r record;
begin
  select * into v_p from public.pedidos where id = p_pedido;
  if not found or not v_p.autoservicio
     or not public._autoservicio_staff_puede(v_p.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  begin
    v_metodo := p_metodo::public.metodo_pago_mesa;
  exception when others then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end;
  if v_metodo = 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'mp-solo-webhook');
  end if;

  v_attr := public._staff_empleado_cobro(v_p.local_id, p_empleado);
  if coalesce(v_attr->>'ok', '') <> 'true' then
    return json_build_object('ok', false, 'reason', coalesce(v_attr->>'reason', 'empleado-invalido'));
  end if;
  p_empleado := nullif(v_attr->>'empleado', '')::uuid;

  perform 1 from public.mesa_sesiones where id = v_p.sesion_id for update;
  select * into v_p from public.pedidos where id = p_pedido for update;
  select flujo into v_flujo from public.mesa_sesiones where id = v_p.sesion_id;

  if v_p.estado = 'cancelado' then
    return json_build_object('ok', false, 'reason', 'pedido-cancelado');
  end if;
  if v_flujo = 'mostrador_qr' then
    /* Otra caja (o Mercado Pago) se adelantó: ya está pago. */
    if exists (select 1 from public.pagos_mesa g
                where g.pedido_id = v_p.id and g.estado = 'pagado') then
      return json_build_object('ok', true, 'repetido', true);
    end if;
  elsif v_p.estado <> 'pendiente_pago' then
    return json_build_object('ok', true, 'repetido', true);
  end if;

  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'cobrado-en-caja', actualizado_en = now()
     where pedido_id = v_p.id and estado = 'pendiente'
    returning id
  loop
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'personal',
      p_pedido => v_p.id, p_pago => r.id, p_empleado => p_empleado,
      p_datos => '{"motivo":"cobrado-en-caja"}'::jsonb);
  end loop;

  v_pago := public._crear_pago_pedido(v_p.id, v_metodo, 'personal', p_empleado);
  if coalesce(v_pago->>'ok', '') <> 'true' then
    return v_pago;
  end if;

  if v_flujo = 'mostrador_qr' then
    perform public._marcar_pedido_pagado(v_p.id);
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pedido_pagado', 'personal',
      p_pedido => v_p.id, p_pago => (v_pago->>'pago_id')::uuid, p_empleado => p_empleado,
      p_datos => json_build_object('metodo', v_metodo, 'estado', v_p.estado)::jsonb);
    /* Pago previo: cobrado, entra al local. Igual que en la mesa, y por el
     * estado del pedido, no por la opción actual del local. */
    update public.pedidos set estado = 'creado' where id = v_p.id and estado = 'pendiente_pago';
    if found then
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pedido_confirmado', 'personal',
        p_pedido => v_p.id, p_pago => (v_pago->>'pago_id')::uuid, p_empleado => p_empleado,
        p_datos => json_build_object('metodo', v_metodo)::jsonb);
    end if;
  else
    update public.pedidos set estado = 'creado' where id = v_p.id and estado = 'pendiente_pago';
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pedido_confirmado', 'personal',
      p_pedido => v_p.id, p_pago => (v_pago->>'pago_id')::uuid, p_empleado => p_empleado,
      p_datos => json_build_object('metodo', v_metodo)::jsonb);
  end if;
  perform public._tocar_sesion(v_p.sesion_id);

  return json_build_object('ok', true, 'pago_id', (v_pago->>'pago_id')::uuid,
    'monto_total', (v_pago->>'monto_total')::int);
end;
$$;

revoke all on function public.cobrar_pedido_autoservicio(uuid, text, uuid) from public, anon;
grant execute on function public.cobrar_pedido_autoservicio(uuid, text, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 5) Cerrar una sesión (pedidos-mesa.sql + mostrador). La llaman el cron
--    diario (liberar_mesas_jornada) y el barrido por sucursal, que ya cierran
--    las sesiones del mostrador de jornadas anteriores.
-- ---------------------------------------------------------------------------
create or replace function public._cerrar_sesion(p_sesion uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'jornada-cerrada');
  r record;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion for update;
  if not found or v_s.estado = 'cerrada' then
    return;
  end if;

  /* Lo que nadie pagó no queda colgado para mañana: Mesa y el mostrador con
   * pago previo. pedidos_autoservicio_despues suelta su cobro pendiente; un
   * Mercado Pago que se apruebe después queda como excedente
   * (mp_confirmar_pago no revive un pedido cancelado). Lo que ya estaba en
   * el tablero (creado, en preparación, listo) no se toca. */
  if v_s.flujo in ('autoservicio', 'mostrador_qr') then
    update public.pedidos
       set estado = 'cancelado', cancelado_en = now()
     where sesion_id = v_s.id and estado = 'pendiente_pago';
  end if;

  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = v_motivo, actualizado_en = now()
     where sesion_id = v_s.id and estado in ('pendiente', 'definido')
    returning id
  loop
    perform public._mesa_evento(v_s.local_id, v_s.id, 'pago_cancelado', 'sistema',
      p_pago => r.id, p_datos => json_build_object('motivo', v_motivo)::jsonb);
  end loop;

  update public.mesa_sesiones
     set estado = 'cerrada', cerrada_en = now(), cerrada_motivo = v_motivo,
         version = version + 1, actualizado_en = now()
   where id = v_s.id;
  perform public._mesa_evento(v_s.local_id, v_s.id, 'mesa_cerrada', 'sistema',
    p_datos => json_build_object('motivo', v_motivo,
      'cuenta', public._cuenta_json(v_s.id)->'totales')::jsonb);
end;
$$;

revoke all on function public._cerrar_sesion(uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: true, false, false.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'locales'
             and column_name = 'mostrador_qr_pago_previo') as columna_pago_previo,
  exists (select 1 from public.locales where mostrador_qr_pago_previo) as alguno_prendido,
  has_function_privilege('authenticated',
    'public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text)', 'EXECUTE') as auth_pide_como_cliente;
