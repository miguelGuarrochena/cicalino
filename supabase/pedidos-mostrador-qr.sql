-- ===========================================================================
-- Cicalino — Pedidos en modalidad Mostrador QR (un QR para todo el local,
-- el pedido entra a preparación enseguida, se paga ahora o al retirar)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: pedidos-mesa.sql (y todo lo que ese pide)
--
-- QR del local → carta → pedido → (pago ahora o en caja) → preparación →
-- listo → aviso → retiro (+ cobro si eligió caja)
--
-- Tercera modalidad de Pedidos (`locales.pedidos_modalidad = 'mostrador_qr'`).
-- `mostrador` y `mesa` no cambian en nada.
--
-- QUÉ SE REUTILIZA (casi todo lo de pedidos-mesa.sql)
--   comensales           la identidad del teléfono (id + sha256 del secreto).
--   mesa_sesiones        una sesión por teléfono, SIN mesa: flujo =
--                        mostrador_qr, mesa_id y mesa_numero en null. Es lo
--                        que ya ata comensal, pedidos, ítems y cobros.
--   pedidos/pedido_items el pedido es una fila de `pedidos` con autoservicio =
--                        true, con el número de la misma serie de la jornada.
--   pagos_mesa           el cobro, atado al pedido (`pedido_id`).
--   Mercado Pago         la misma preference, el mismo webhook y la misma
--                        mp_confirmar_pago, con una rama para este flujo.
--   cobrar_pedido_autoservicio  la caja cobra con el mismo RPC.
--   pedidos_pagina       el tablero de Pedidos, con pago y método.
--
-- LA DIFERENCIA CON MESA (en la base, no en la UI)
--   * El QR es del local (`locales.mostrador_qr_token`), no de una mesa ni de
--     un pedido. Cada teléfono que pide abre su propia sesión.
--   * El pedido nace en `creado`: entra a preparación sin esperar el pago. El
--     estado de preparación y el pago van por separado; "está pago" es que
--     exista un `pagos_mesa` pagado de ese pedido.
--   * Un pedido se paga una sola vez: uq_pagos_mesa_pedido_activo + los
--     chequeos de cobrar/pagar/mp_confirmar_pago.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) Columnas
-- ---------------------------------------------------------------------------
alter table public.locales
  drop constraint if exists locales_pedidos_modalidad_valida,
  add constraint locales_pedidos_modalidad_valida
    check (pedidos_modalidad in ('mostrador', 'mesa', 'mostrador_qr'));
comment on column public.locales.pedidos_modalidad is
  'Cómo funciona Pedidos: mostrador (la caja carga el pedido), mesa (el cliente pide y paga desde el QR de la mesa) o mostrador_qr (un QR del local; el pedido se prepara enseguida y se paga ahora o al retirar).';

/* El QR del mostrador. Opaco como el de las mesas: el servidor lo resuelve al
 * local. Regenerarlo invalida los carteles impresos. */
alter table public.locales
  add column if not exists mostrador_qr_token text,
  add column if not exists mostrador_qr_generado_en timestamptz;

update public.locales
   set mostrador_qr_token = gen_random_uuid()::text,
       mostrador_qr_generado_en = now()
 where mostrador_qr_token is null;

alter table public.locales
  alter column mostrador_qr_token set default gen_random_uuid()::text,
  alter column mostrador_qr_token set not null,
  alter column mostrador_qr_generado_en set default now();

create unique index if not exists uq_locales_mostrador_qr_token
  on public.locales (mostrador_qr_token);

/* Una sesión de mostrador no tiene mesa. Las de mesa la siguen teniendo. */
alter table public.mesa_sesiones
  drop constraint if exists mesa_sesiones_flujo_valido,
  add constraint mesa_sesiones_flujo_valido
    check (flujo in ('cuenta', 'autoservicio', 'mostrador_qr'));
alter table public.mesa_sesiones
  alter column mesa_numero drop not null;
alter table public.mesa_sesiones
  drop constraint if exists mesa_sesiones_mesa_por_flujo,
  add constraint mesa_sesiones_mesa_por_flujo
    check (case when flujo = 'mostrador_qr'
                then mesa_id is null and mesa_numero is null
                else mesa_numero is not null end);
comment on column public.mesa_sesiones.flujo is
  'cuenta: la cuenta compartida de Pagos. autoservicio: Pedidos en modalidad Mesa. mostrador_qr: Pedidos en modalidad Mostrador QR, una sesión por teléfono y sin mesa.';

/* Mostrador QR: cuándo quedó pago. La verdad es el cobro (`pagos_mesa`); esto
 * lo escribe la base al confirmarlo para que el tablero (realtime de
 * `pedidos`) se entere sin esperar al próximo refresco. */
alter table public.pedidos
  add column if not exists pagado_en timestamptz;
comment on column public.pedidos.pagado_en is
  'Mostrador QR: cuándo se confirmó el cobro (caja o Mercado Pago). Lo escribe solo la base.';

/* En el mostrador el nombre es opcional: el pedido se reconoce por el número. */
alter table public.comensales
  alter column nombre drop not null;


-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.local_pedidos_mostrador_qr(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.local_tiene_modulo(p_local, 'pedidos')
     and coalesce((
       select l.pedidos_modalidad = 'mostrador_qr' from public.locales l where l.id = p_local
     ), false);
$$;

/* La carta, los métodos de cobro y la cuenta de Mercado Pago: Pagos, o
 * Pedidos cuando el cliente pide desde un QR (mesa o mostrador). */
create or replace function public.local_usa_carta(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.local_tiene_modulo(p_local, 'pagos')
      or public.local_pedidos_mesa(p_local)
      or public.local_pedidos_mostrador_qr(p_local);
$$;

/* La caja de los pedidos hechos desde un QR (mesa o mostrador). */
create or replace function public._autoservicio_staff_puede(p_local uuid, p_escribir boolean)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.puede_ver_local(p_local)
     and (public.local_pedidos_mesa(p_local) or public.local_pedidos_mostrador_qr(p_local))
     and (not p_escribir or public.local_operativo(p_local));
$$;

revoke all on function public.local_pedidos_mostrador_qr(uuid) from public, anon;
revoke all on function public.local_usa_carta(uuid) from public, anon;
revoke all on function public._autoservicio_staff_puede(uuid, boolean) from public, anon, authenticated;
grant execute on function public.local_pedidos_mostrador_qr(uuid) to authenticated, service_role;
grant execute on function public.local_usa_carta(uuid) to authenticated, service_role;

/* pedidos-mesa.sql + el flujo, que es lo que le dice a la pantalla si el
 * pago va aparte de la preparación. */
create or replace function public._pedido_autoservicio_json(p_pedido uuid)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id,
    'referencia', p.referencia,
    'alias', p.alias_cliente,
    'estado', p.estado,
    'flujo', s.flujo,
    'mesa_numero', s.mesa_numero,
    'sesion_id', p.sesion_id,
    'comensal_id', p.comensal_id,
    'creado_en', p.creado_en,
    'confirmado_en', p.confirmado_en,
    'en_preparacion_en', p.en_preparacion_en,
    'listo_en', p.listo_en,
    'retirado_en', p.retirado_en,
    'cancelado_en', p.cancelado_en,
    'avisado_en', p.avisado_en,
    'pago_caja_en', p.pago_caja_en,
    'total', public._total_pedido(p.id),
    'items', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'producto_id', i.producto_id, 'nombre', i.nombre,
        'precio_unitario', i.precio_unitario, 'cantidad', i.cantidad,
        'subtotal', i.subtotal
      ) order by i.creado_en, i.nombre)
        from public.pedido_items i where i.pedido_id = p.id
    ), '[]'::json),
    /* El cobro que importa: el pagado si lo hay, si no el último intento. */
    'pago', (
      select json_build_object(
        'id', g.id, 'metodo', g.metodo, 'estado', g.estado,
        'monto_total', g.monto_total, 'expira_en', g.expira_en,
        'mp_estado', g.mp_estado, 'confirmado_en', g.confirmado_en,
        'creado_por', g.creado_por
      )
        from public.pagos_mesa g
       where g.pedido_id = p.id
       order by case g.estado when 'pagado' then 0 when 'pendiente' then 1 else 2 end,
                g.creado_en desc
       limit 1
    )
  )
    from public.pedidos p
    left join public.mesa_sesiones s on s.id = p.sesion_id
   where p.id = p_pedido;
$$;

revoke all on function public._pedido_autoservicio_json(uuid) from public, anon, authenticated;

/* pedidos-mesa.sql, con una diferencia: sin mesa, el cobro se nombra por el
 * pedido. */
create or replace function public._crear_pago_pedido(
  p_pedido uuid,
  p_metodo public.metodo_pago_mesa,
  p_actor text,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pedidos%rowtype;
  v_mesa integer;
  v_total integer;
  v_confirmar boolean;
  v_pago public.pagos_mesa%rowtype;
begin
  select * into v_p from public.pedidos where id = p_pedido;
  if not found or not v_p.autoservicio or v_p.sesion_id is null then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not public._metodo_mesa_habilitado(v_p.local_id, p_metodo, p_actor) then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
  end if;
  v_total := public._total_pedido(v_p.id);
  if v_total <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;
  select mesa_numero into v_mesa from public.mesa_sesiones where id = v_p.sesion_id;

  /* Cobrado por el personal = plata en mano. Mercado Pago confirma solo el
   * webhook (_metodo_mesa_habilitado no lo deja para el personal). */
  v_confirmar := p_actor = 'personal';

  insert into public.pagos_mesa (
    local_id, sesion_id, comensal_id, pedido_id, pagador_nombre, modo, partes,
    monto_base, metodo, estado, creado_por, confirmacion, confirmado_en,
    confirmado_por, confirmado_empleado, expira_en
  ) values (
    v_p.local_id, v_p.sesion_id, v_p.comensal_id, v_p.id,
    left(coalesce(nullif(btrim(v_p.alias_cliente), ''),
                  case when v_mesa is null then 'Pedido ' || v_p.referencia
                       else 'Mesa ' || v_mesa end), 40),
    'uno', 1, v_total, p_metodo,
    case when v_confirmar then 'pagado'::public.pago_mesa_estado else 'pendiente' end,
    p_actor,
    case when v_confirmar then 'manual' end,
    case when v_confirmar then now() end,
    case when v_confirmar then auth.uid() end,
    case when v_confirmar then p_empleado end,
    case when p_metodo = 'mercado_pago' then now() + interval '30 minutes' end
  )
  returning * into v_pago;

  perform public._mesa_evento(v_p.local_id, v_p.sesion_id,
    case when v_confirmar then 'pago_registrado_pagado' else 'pago_creado' end,
    p_actor,
    p_comensal => case when p_actor = 'comensal' then v_p.comensal_id end,
    p_pedido => v_p.id, p_pago => v_pago.id, p_empleado => p_empleado,
    p_datos => json_build_object('metodo', p_metodo, 'monto_base', v_total)::jsonb);

  return json_build_object('ok', true, 'pago_id', v_pago.id, 'metodo', v_pago.metodo,
    'estado', v_pago.estado, 'monto_total', v_pago.monto_total,
    'expira_en', v_pago.expira_en);
end;
$$;

revoke all on function public._crear_pago_pedido(uuid, public.metodo_pago_mesa, text, uuid)
  from public, anon, authenticated;

/* Deja constancia en el pedido de que ya se cobró (ver pedidos.pagado_en). */
create or replace function public._marcar_pedido_pagado(p_pedido uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('cicalino.pedido_pagado', '1', true);
  update public.pedidos set pagado_en = coalesce(pagado_en, now()) where id = p_pedido;
  perform set_config('cicalino.pedido_pagado', '', true);
end;
$$;

revoke all on function public._marcar_pedido_pagado(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2) El token del mostrador solo cambia por regenerar_qr_mostrador.
-- ---------------------------------------------------------------------------
create or replace function public.locales_mostrador_qr_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.mostrador_qr_token is distinct from old.mostrador_qr_token
      or new.mostrador_qr_generado_en is distinct from old.mostrador_qr_generado_en)
     and auth.uid() is not null
     and coalesce(current_setting('cicalino.qr_mostrador', true), '') <> 'regenerar' then
    raise exception 'locales.mostrador_qr_token is read only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.locales_mostrador_qr_guard() from public, anon, authenticated;

drop trigger if exists locales_mostrador_qr_guard on public.locales;
create trigger locales_mostrador_qr_guard
  before update of mostrador_qr_token, mostrador_qr_generado_en on public.locales
  for each row execute function public.locales_mostrador_qr_guard();


-- ---------------------------------------------------------------------------
-- 3) Guardias (pedidos-mesa.sql + el flujo del mostrador)
-- ---------------------------------------------------------------------------

/* Un pedido del mostrador nace en `creado`: entra a preparación sin esperar
 * el pago. Uno de la mesa sigue naciendo en `pendiente_pago`. */
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

    /* Solo la mesa pasa por pendiente_pago: un pedido del mostrador nunca
     * está ahí (chequear_transicion_pedido no deja volver). */
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

create or replace function public.pagos_mesa_flujo_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_flujo text;
  v_ped public.pedidos%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.pedido_id is distinct from old.pedido_id then
      raise exception 'pagos_mesa.pedido_id is read only' using errcode = '42501';
    end if;
    return new;
  end if;

  select flujo into v_flujo from public.mesa_sesiones where id = new.sesion_id;
  if v_flujo in ('autoservicio', 'mostrador_qr') and new.pedido_id is null then
    /* Las funciones de la cuenta compartida sobre una sesión que paga pedido
     * por pedido. */
    raise exception 'Self-service sessions pay each order'
      using errcode = 'P0001', hint = 'flujo-autoservicio';
  end if;
  if coalesce(v_flujo, 'cuenta') = 'cuenta' and new.pedido_id is not null then
    raise exception 'Order payments belong to self-service sessions'
      using errcode = 'P0001', hint = 'flujo-cuenta';
  end if;
  if new.pedido_id is not null then
    select * into v_ped from public.pedidos where id = new.pedido_id;
    if not found or not v_ped.autoservicio or v_ped.sesion_id is distinct from new.sesion_id then
      raise exception 'Payment for an order of another session'
        using errcode = 'P0001', hint = 'pedido-invalido';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.pagos_mesa_flujo_guard() from public, anon, authenticated;

/* Ni la mesa de autoservicio ni el mostrador tienen cuenta compartida, mozo
 * ni "mesa pagada". */
create or replace function public.mesa_sesiones_flujo_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.flujo is distinct from old.flujo then
    raise exception 'mesa_sesiones.flujo is read only' using errcode = '42501';
  end if;
  if new.flujo in ('autoservicio', 'mostrador_qr') and (
       new.estado = 'pagada'
       or new.cuenta_solicitada_en is distinct from old.cuenta_solicitada_en
       or new.cuenta_intencion is distinct from old.cuenta_intencion
       or new.llamado_en is distinct from old.llamado_en
       or new.modo_division is distinct from old.modo_division) then
    raise exception 'Not available on a self-service session'
      using errcode = 'P0001', hint = 'flujo-autoservicio';
  end if;
  return new;
end;
$$;

revoke all on function public.mesa_sesiones_flujo_guard() from public, anon, authenticated;

/* La cobertura por sesión es solo de la cuenta compartida. */
create or replace function public._revisar_cobertura(p_sesion uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_consumo integer;
  v_pagado integer;
  v_local uuid;
  v_estado public.mesa_sesion_estado;
  v_flujo text;
begin
  select estado, flujo into v_estado, v_flujo from public.mesa_sesiones where id = p_sesion;
  if coalesce(v_flujo, 'cuenta') <> 'cuenta' then
    return;
  end if;
  v_consumo := public._consumo_sesion(p_sesion);
  select coalesce(sum(monto_base), 0) into v_pagado
    from public.pagos_mesa where sesion_id = p_sesion and estado = 'pagado';

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

revoke all on function public._revisar_cobertura(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) Cliente (service_role; /api/m/[token]/autoservicio/* los llama)
-- ---------------------------------------------------------------------------

/* A qué local lleva el QR del mostrador. */
create or replace function public.mostrador_qr_por_token(p_token text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_l public.locales%rowtype;
begin
  select * into v_l from public.locales where mostrador_qr_token = p_token;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not public.local_pedidos_mostrador_qr(v_l.id) then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  return json_build_object('ok', true,
    'local_id', v_l.id, 'local_nombre', v_l.nombre,
    'operativo', public._local_suscripcion_activa(v_l.id));
end;
$$;

/* La identidad del teléfono en el mostrador: una sesión propia, sin mesa y
 * sin nombre. Se crea recién cuando va a pedir, no al abrir la carta. */
create or replace function public.unirse_mostrador_qr(
  p_token text,
  p_token_hash text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_l public.locales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_comensal uuid;
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return json_build_object('ok', false, 'reason', 'token-invalido');
  end if;
  select * into v_l from public.locales where mostrador_qr_token = p_token;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not public.local_pedidos_mostrador_qr(v_l.id) then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not public._local_suscripcion_activa(v_l.id) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  insert into public.mesa_sesiones (local_id, mesa_id, mesa_numero, flujo)
  values (v_l.id, null, null, 'mostrador_qr')
  returning * into v_s;

  insert into public.comensales (sesion_id, local_id, nombre, token_hash)
  values (v_s.id, v_s.local_id, null, lower(p_token_hash))
  returning id into v_comensal;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'comensal_unido', 'comensal',
    p_comensal => v_comensal, p_datos => '{"flujo":"mostrador_qr"}'::jsonb);

  return json_build_object('ok', true, 'sesion_id', v_s.id, 'comensal_id', v_comensal,
    'sesion_nueva', true);
end;
$$;

/* Lo que ve quien escanea el QR del mostrador. El QR no dice qué pedido es:
 * los pedidos salen de la credencial del teléfono (cookie). Sin credencial,
 * solo el local. Mismo formato que mesa_autoservicio_estado, con `mesa` en
 * null.
 *
 * QR regenerado: el token viejo ya no abre el local para nadie nuevo, pero
 * los pedidos que ya existen no dependen de él. Con la credencial de un
 * teléfono que pidió en este mostrador, el token viejo sigue mostrando SUS
 * pedidos (seguir, pagar, avisos), con `qr_vigente` en false: desde ahí no
 * se inicia ninguno nuevo (pedir_mostrador_qr exige el token vigente).
 *
 * El link de un pedido (`/m/<pedidos.qr_token>`, adonde lleva el push de
 * "listo") abre ESE pedido, se haya regenerado o no el QR del local. Con la
 * credencial de quien lo pidió se ven todos los suyos; sin ella (o con la de
 * otro teléfono), solo ese, para mirar. Tampoco inicia pedidos. */
create or replace function public.mostrador_qr_estado(
  p_token text,
  p_comensal uuid,
  p_token_hash text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_l public.locales%rowtype;
  v_c public.comensales%rowtype;
  v_cs public.mesa_sesiones%rowtype;
  v_desde timestamptz;
  v_vigente boolean := true;
  v_ped public.pedidos%rowtype;
  v_link boolean := false;
begin
  if p_comensal is not null then
    v_c := public._comensal_valido(p_comensal, p_token_hash);
    if v_c.id is not null then
      select * into v_cs from public.mesa_sesiones where id = v_c.sesion_id;
    end if;
  end if;

  select * into v_l from public.locales where mostrador_qr_token = p_token;
  if not found then
    select p.* into v_ped
      from public.pedidos p
      join public.mesa_sesiones s on s.id = p.sesion_id
     where p.qr_token = p_token and p.autoservicio and s.flujo = 'mostrador_qr';
    if found then
      /* El link de un pedido. */
      select * into v_l from public.locales where id = v_ped.local_id;
      v_link := true;
    elsif v_c.id is null or v_cs.flujo is distinct from 'mostrador_qr' then
      /* Token que no es de ningún local ni pedido: solo le sirve a quien ya
       * pidió en un mostrador, para ver lo suyo. */
      return json_build_object('ok', false, 'reason', 'not-found');
    else
      select * into v_l from public.locales where id = v_cs.local_id;
    end if;
    v_vigente := false;
  end if;
  if not public.local_pedidos_mostrador_qr(v_l.id) then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;

  v_desde := public.jornada_inicio_local(v_l.id);

  /* Un comensal de otro local o de otro flujo no es de acá. */
  if v_c.id is not null
     and (v_cs.local_id is distinct from v_l.id or v_cs.flujo is distinct from 'mostrador_qr') then
    v_c := null;
  end if;
  /* El link de un pedido abierto desde otro teléfono: solo ese pedido. */
  if v_link and v_ped.comensal_id is distinct from v_c.id then
    v_c := null;
  end if;

  if v_c.id is not null then
    perform public._expirar_pagos_mp(v_c.sesion_id);
    update public.comensales set visto_en = now()
     where id = v_c.id and visto_en < now() - interval '1 minute';
  end if;

  return json_build_object('ok', true,
    'mesa', null,
    'local', json_build_object('id', v_l.id, 'nombre', v_l.nombre),
    'operativo', public._local_suscripcion_activa(v_l.id),
    /* false: se entró con un QR regenerado; solo seguimiento. */
    'qr_vigente', v_vigente,
    /* true: se entró por el link de un pedido (el push de "listo"). */
    'pedido_link', v_link,
    'comensal', case when v_c.id is null then null else
      json_build_object('id', v_c.id, 'nombre', v_c.nombre, 'sesion_id', v_c.sesion_id) end,
    /* Puede seguir pidiendo con esta identidad: su sesión es de hoy. Si no,
     * la pantalla abre una nueva al pedir. */
    'sesion_abierta', v_vigente and v_c.id is not null and v_cs.estado = 'abierta'
                      and v_cs.actualizado_en >= v_desde,
    'pedidos', case
      when v_c.id is null and v_link then json_build_array(public._pedido_autoservicio_json(v_ped.id))
      when v_c.id is null then '[]'::json else coalesce((
      select json_agg(public._pedido_autoservicio_json(p.id) order by p.creado_en desc)
        from public.pedidos p
       where p.comensal_id = v_c.id and p.autoservicio
         and (p.creado_en >= v_desde
              or p.estado in ('creado', 'en_preparacion', 'listo')
              or p.id = v_ped.id)
    ), '[]'::json) end,
    'mesa_pedidos', '[]'::json);
end;
$$;

/* Un borrador anterior tenía estas firmas; si quedaron, se van. */
drop function if exists public.mostrador_qr_actual(uuid, text);
drop function if exists public.pedir_mostrador_qr(uuid, text, jsonb, uuid, text, text);

/* Confirmar el pedido. Entra al tablero en el acto; el pago (Mercado Pago
 * ahora, o en caja al retirar) va por separado. El nombre es opcional.
 *
 * Un pedido nuevo sale solo del QR vigente de SU local: con un QR regenerado
 * (o el de otro local) la credencial del teléfono no alcanza. */
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

  if p_metodo = 'mercado_pago'
     and not public._metodo_mesa_habilitado(v_s.local_id, 'mercado_pago', 'comensal') then
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
   * con el mismo lock: no choca con un pedido que cargó la caja. */
  select coalesce(l.hora_corte, 6), coalesce(l.dias_cerrados, '{}'::integer[])
    into v_corte, v_cerrados
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
    v_s.local_id, v_ref, v_nombre, 'creado', gen_random_uuid()::text,
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
      'metodo', p_metodo, 'flujo', 'mostrador_qr')::jsonb);

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

/* Cambiar cómo se paga (pedidos-mesa.sql + mostrador). En la mesa, mientras
 * espera el pago. En el mostrador, mientras no esté pago: el pedido ya puede
 * estar preparándose o listo. */
create or replace function public.pagar_pedido_autoservicio(
  p_comensal uuid,
  p_token_hash text,
  p_pedido uuid,
  p_metodo text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_p public.pedidos%rowtype;
  v_flujo text;
  v_pend public.pagos_mesa%rowtype;
  v_pago json;
  r record;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if coalesce(p_metodo, '') not in ('caja', 'mercado_pago') then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  perform 1 from public.mesa_sesiones where id = v_c.sesion_id for update;
  select * into v_p from public.pedidos
   where id = p_pedido and comensal_id = v_c.id and autoservicio
     for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  select flujo into v_flujo from public.mesa_sesiones where id = v_p.sesion_id;

  if v_p.estado = 'cancelado' then
    return json_build_object('ok', false, 'reason', 'pedido-cancelado');
  end if;
  if v_flujo = 'mostrador_qr' then
    if exists (select 1 from public.pagos_mesa g
                where g.pedido_id = v_p.id and g.estado = 'pagado') then
      return json_build_object('ok', false, 'reason', 'ya-pagado');
    end if;
    if v_p.estado = 'retirado' then
      return json_build_object('ok', false, 'reason', 'ya-retirado');
    end if;
  elsif v_p.estado <> 'pendiente_pago' then
    return json_build_object('ok', false, 'reason', 'ya-confirmado');
  end if;
  if not public._local_suscripcion_activa(v_p.local_id) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  perform public._expirar_pagos_mp(v_p.sesion_id);

  select * into v_pend from public.pagos_mesa
   where pedido_id = v_p.id and estado = 'pendiente'
   order by creado_en desc limit 1;

  if p_metodo = 'mercado_pago' then
    if not public._metodo_mesa_habilitado(v_p.local_id, 'mercado_pago', 'comensal') then
      return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
    end if;
    update public.pedidos set pago_caja_en = null where id = v_p.id and pago_caja_en is not null;
    if v_pend.id is not null then
      perform public._tocar_sesion(v_p.sesion_id);
      return json_build_object('ok', true, 'repetido', true, 'pago_id', v_pend.id,
        'metodo', 'mercado_pago');
    end if;
    v_pago := public._crear_pago_pedido(v_p.id, 'mercado_pago', 'comensal');
    if coalesce(v_pago->>'ok', '') <> 'true' then
      return v_pago;
    end if;
    perform public._tocar_sesion(v_p.sesion_id);
    return json_build_object('ok', true, 'pago_id', (v_pago->>'pago_id')::uuid,
      'metodo', 'mercado_pago');
  end if;

  /* A la caja: el checkout que estaba abierto se suelta. Si Mercado Pago lo
   * aprueba igual después, mp_confirmar_pago lo toma (si nadie cobró antes) o
   * lo deja como excedente para devolver. */
  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'cambio-a-caja', actualizado_en = now()
     where pedido_id = v_p.id and estado = 'pendiente'
    returning id
  loop
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'comensal',
      p_comensal => v_c.id, p_pedido => v_p.id, p_pago => r.id,
      p_datos => '{"motivo":"cambio-a-caja"}'::jsonb);
  end loop;
  update public.pedidos set pago_caja_en = coalesce(pago_caja_en, now()) where id = v_p.id;
  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_en_caja', 'comensal',
    p_comensal => v_c.id, p_pedido => v_p.id);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true, 'metodo', 'caja');
end;
$$;

revoke all on function public.mostrador_qr_por_token(text) from public, anon, authenticated;
revoke all on function public.unirse_mostrador_qr(text, text) from public, anon, authenticated;
revoke all on function public.mostrador_qr_estado(text, uuid, text) from public, anon, authenticated;
revoke all on function public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.pagar_pedido_autoservicio(uuid, text, uuid, text) from public, anon, authenticated;

grant execute on function public.mostrador_qr_por_token(text) to service_role;
grant execute on function public.unirse_mostrador_qr(text, text) to service_role;
grant execute on function public.mostrador_qr_estado(text, uuid, text) to service_role;
grant execute on function public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text) to service_role;
grant execute on function public.pagar_pedido_autoservicio(uuid, text, uuid, text) to service_role;


-- ---------------------------------------------------------------------------
-- 5) Caja (authenticated)
-- ---------------------------------------------------------------------------

/* Cobrar en caja (pedidos-mesa.sql + mostrador). La plata está en la mano del
 * empleado: el cobro queda pagado. En la mesa eso además lo manda a
 * preparación; en el mostrador el pedido ya estaba en el tablero y su estado
 * no se toca (puede estar listo y recién pagarse al retirar). */
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

/* Regenerar el QR del mostrador: el cartel impreso deja de andar. Mismo
 * permiso que regenerar el QR de una mesa (encargado o dueño). */
create or replace function public.regenerar_qr_mostrador(p_local uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if p_local is null
     or not public.puede_ver_local(p_local)
     or not public.auth_gestiona_local(p_local)
     or not public.local_tiene_modulo(p_local, 'pedidos')
     or not public.local_operativo(p_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform set_config('cicalino.qr_mostrador', 'regenerar', true);
  update public.locales
     set mostrador_qr_token = gen_random_uuid()::text,
         mostrador_qr_generado_en = now()
   where id = p_local
  returning mostrador_qr_token into v_token;
  perform set_config('cicalino.qr_mostrador', '', true);
  perform public._mesa_evento(p_local, null, 'qr_regenerado', 'personal',
    p_datos => '{"mostrador":true}'::jsonb);
  return json_build_object('ok', true, 'qr_token', v_token);
end;
$$;

revoke all on function public.regenerar_qr_mostrador(uuid) from public, anon;
grant execute on function public.regenerar_qr_mostrador(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 6) Mercado Pago (pedidos-mesa.sql + mostrador).
--
--    En la mesa, la aprobación confirma el pedido (pendiente_pago → creado).
--    En el mostrador el pedido ya está en el tablero: la aprobación solo lo
--    deja pago. Si el pedido se canceló o alguien ya lo cobró, es excedente
--    para devolver, igual que siempre.
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
-- 7) El tablero de Pedidos (pedidos-mesa.sql + mostrador).
--    Suma el flujo y el estado del pago: el mostrador ve de un vistazo qué
--    está pago y qué se cobra al retirar. Sin mesa, `mesa_numero` va en null.
--    Los pedidos del Mostrador QR abiertos de una jornada anterior siguen a
--    la vista (se cobran y se retiran como cualquier otro).
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_pagina(
  p_local    uuid,
  p_desde    timestamptz,
  p_filtro   text default 'todos',
  p_busqueda text default '',
  p_pagina   integer default 1,
  p_tam      integer default 9
)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_busqueda   text := btrim(coalesce(p_busqueda, ''));
  v_tam        integer := greatest(1, least(100, coalesce(p_tam, 9)));
  v_pag        integer := greatest(1, coalesce(p_pagina, 1));
  v_corte      integer;
  v_cerrados   integer[];
  v_desde      timestamptz;
  v_res        json;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  select coalesce(l.hora_corte, 6), coalesce(l.dias_cerrados, '{}'::integer[])
    into v_corte, v_cerrados
    from public.locales l
   where l.id = p_local;

  if v_corte is null or v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  v_desde := public.jornada_inicio_corte(v_corte, v_cerrados);

  with dia as (
    select p.*, s.mesa_numero, s.flujo
      from public.pedidos p
      left join public.mesa_sesiones s on s.id = p.sesion_id and p.autoservicio
     where p.local_id = p_local
       and p.creado_en >= v_desde
       and (p.sesion_id is null or p.autoservicio)
  ),
  /* Mostrador QR: lo que quedó abierto de una jornada anterior (por ejemplo,
   * listo y sin cobrar al corte) sigue en el tablero hasta que se retire o se
   * cancele. No cuenta para el número de hoy (max_ref sale de `dia`). */
  arrastre as (
    select p.*, s.mesa_numero, s.flujo
      from public.pedidos p
      join public.mesa_sesiones s on s.id = p.sesion_id
     where p.local_id = p_local
       and p.autoservicio
       and s.flujo = 'mostrador_qr'
       and p.creado_en < v_desde
       and p.estado in ('creado', 'en_preparacion', 'listo')
  ),
  tablero as (
    select * from dia where estado <> 'pendiente_pago'
    union all
    select * from arrastre
  ),
  conteos as (
    select
      (select count(*) from tablero)                                   as todos,
      (select count(*) from tablero where estado in ('creado', 'en_preparacion')) as creado,
      (select count(*) from tablero where estado = 'listo')            as listo,
      (select count(*) from tablero where estado = 'retirado')         as retirado,
      (select count(*) from tablero where estado = 'cancelado')        as cancelado,
      coalesce((
        select max(nullif(substring(referencia from '^[0-9]+'), '')::bigint) from dia
      ), 0) as max_ref
  ),
  filtrados as (
    select *
      from tablero
     where (
             p_filtro = 'todos'
          or (p_filtro = 'creado' and estado in ('creado', 'en_preparacion'))
          or (p_filtro <> 'creado' and estado::text = p_filtro)
           )
       and (
             v_busqueda = ''
          or position(lower(v_busqueda) in lower(referencia)) > 0
          or (autoservicio and mesa_numero::text = v_busqueda)
          or (
               position(lower(v_busqueda) in lower(coalesce(alias_cliente, ''))) > 0
               and estado in ('creado', 'en_preparacion', 'listo')
             )
           )
  ),
  pagina as (
    select f.*, e.nombre as empleado_nombre
      from filtrados f
      left join public.empleados e on e.id = f.empleado_id
     order by case f.estado
                when 'listo'          then 0
                when 'creado'         then 1
                when 'en_preparacion' then 1
                when 'retirado'       then 2
                else 3
              end,
              coalesce(f.confirmado_en, f.creado_en) desc
     offset (v_pag - 1) * v_tam
     limit v_tam
  )
  select json_build_object(
    'items', coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'referencia', p.referencia,
        'alias_cliente', p.alias_cliente,
        'estado', p.estado,
        'creado_en', p.creado_en,
        'en_preparacion_en', p.en_preparacion_en,
        'listo_en', p.listo_en,
        'retirado_en', p.retirado_en,
        'cancelado_en', p.cancelado_en,
        'visto_en', p.visto_en,
        'qr_token', p.qr_token,
        'empleado_nombre', p.empleado_nombre,
        'autoservicio', p.autoservicio,
        'flujo', p.flujo,
        'mesa_numero', p.mesa_numero,
        'confirmado_en', p.confirmado_en,
        'pago_caja_en', p.pago_caja_en,
        'total', case when p.autoservicio then public._total_pedido(p.id) end,
        'pago_metodo', case when p.autoservicio then (
          select g.metodo from public.pagos_mesa g
           where g.pedido_id = p.id and g.estado = 'pagado' limit 1) end,
        /* El cliente está en el checkout de Mercado Pago ahora mismo. */
        'pago_mp_pendiente', p.autoservicio and exists (
          select 1 from public.pagos_mesa g
           where g.pedido_id = p.id and g.estado = 'pendiente'
             and g.metodo = 'mercado_pago'
             and (g.expira_en is null or g.expira_en > now())),
        'items', case when p.autoservicio then coalesce((
          select json_agg(json_build_object('nombre', i.nombre, 'cantidad', i.cantidad)
                          order by i.creado_en, i.nombre)
            from public.pedido_items i where i.pedido_id = p.id), '[]'::json) end,
        'avisos_activos', exists (
          select 1
            from public.push_subscriptions ps
           where ps.pedido_id = p.id
              or (p.autoservicio and p.comensal_id is not null
                  and ps.comensal_id = p.comensal_id)
        )
      )) from pagina p
    ), '[]'::json),
    'total', (select count(*) from filtrados),
    'conteos', (
      select json_build_object(
        'todos', c.todos, 'creado', c.creado, 'listo', c.listo,
        'retirado', c.retirado, 'cancelado', c.cancelado
      ) from conteos c
    ),
    'proximoNumero', (select max_ref + 1 from conteos)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.pedidos_pagina(uuid, timestamptz, text, text, integer, integer)
  from public, anon;
grant execute on function public.pedidos_pagina(uuid, timestamptz, text, text, integer, integer)
  to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: todo true salvo los dos últimos.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'locales'
             and column_name = 'mostrador_qr_token') as token_mostrador,
  exists (select 1 from pg_trigger where tgname = 'locales_mostrador_qr_guard') as guardia_token,
  (select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'public' and table_name = 'mesa_sesiones'
      and column_name = 'mesa_numero') as sesion_sin_mesa,
  has_function_privilege('authenticated', 'public.regenerar_qr_mostrador(uuid)', 'EXECUTE') as encargado_regenera,
  has_function_privilege('authenticated',
    'public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text)', 'EXECUTE') as auth_pide_como_cliente,
  has_function_privilege('anon', 'public.mostrador_qr_estado(text, uuid, text)', 'EXECUTE') as anon_lee;
