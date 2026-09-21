-- ===========================================================================
-- Cicalino — Cuenta compartida: definir primero, pedir después
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: mesa-cuenta-enum.sql, mesa-llamado-mozo.sql, mesa-pedir-cuenta.sql,
--           mesa-pago-qr-mp.sql, staff-floor-guards.sql
--
-- La cuenta de la mesa es una sola. Varios teléfonos ven y tocan el mismo
-- estado. Definir "yo pago $12.000 con Mercado Pago" no cobra ni avisa al
-- local: reserva la parte. Recién cuando el total está cubierto (o alguien
-- confirma pagar todo) se manda UNA solicitud a Cobrar.
--
--   abierta  →  dividiendo  →  lista  →  solicitada
--   abierta  →  (pago total)  →  solicitada
--
-- `pagos_mesa.estado = definido` es la reserva. Al pedir la cuenta pasa a
-- `pendiente` y ahí sí aparece en Cobrar. Mercado Pago no abre checkout
-- mientras la parte esté solo definida.
-- ===========================================================================

alter table public.mesa_sesiones
  add column if not exists cuenta_intencion text
    check (cuenta_intencion is null or cuenta_intencion in ('total', 'dividir')),
  add column if not exists cuenta_solicitada_en timestamptz,
  add column if not exists cuenta_solicitada_por uuid
    references public.comensales (id) on delete set null,
  add column if not exists cuenta_pagador_total_id uuid
    references public.comensales (id) on delete set null,
  add column if not exists cuenta_pagador_total_nombre text
    check (cuenta_pagador_total_nombre is null
           or char_length(btrim(cuenta_pagador_total_nombre)) between 1 and 40);

comment on column public.mesa_sesiones.cuenta_intencion is
  'Cómo está armándose la cuenta: dividir entre la mesa, o una persona el total.';
comment on column public.mesa_sesiones.cuenta_solicitada_en is
  'Cuándo se mandó la solicitud única al local. Después no se redefine.';

create unique index if not exists uq_pagos_mesa_comensal_definido
  on public.pagos_mesa (sesion_id, comensal_id)
  where estado = 'definido' and comensal_id is not null;


-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public._expirar_pagos_mp(p_sesion uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  r record;
  v_solicitada timestamptz;
begin
  select cuenta_solicitada_en into v_solicitada
    from public.mesa_sesiones where id = p_sesion;
  /* Pedida al local: la reserva ya es el plan de cobro, no se suelta sola. */
  if v_solicitada is not null then
    return 0;
  end if;

  v_n := 0;
  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'mp-expirado', actualizado_en = now()
     where sesion_id = p_sesion
       and metodo = 'mercado_pago'
       and estado = 'pendiente'
       and expira_en is not null
       and expira_en < now()
    returning id, local_id
  loop
    v_n := v_n + 1;
    perform public._mesa_evento(r.local_id, p_sesion, 'pago_expirado', 'sistema',
                                p_pago => r.id);
  end loop;
  if v_n > 0 then
    perform public._tocar_sesion(p_sesion);
  end if;
  return v_n;
end;
$$;

create or replace function public._cuenta_estado(
  p_solicitada timestamptz,
  p_intencion text,
  p_consumo integer,
  p_disponible integer,
  p_hay_definido boolean
)
returns text
language sql immutable as $$
  select case
    when p_solicitada is not null then 'solicitada'
    when p_consumo > 0 and p_disponible = 0
         and (p_intencion = 'dividir' or p_hay_definido) then 'lista'
    when p_intencion = 'dividir' or p_hay_definido then 'dividiendo'
    else 'abierta'
  end;
$$;

create or replace function public._metodo_mesa_habilitado(
  p_local uuid,
  p_metodo public.metodo_pago_mesa,
  p_actor text
)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_cobros public.local_cobros%rowtype;
begin
  select * into v_cobros from public.local_cobros where local_id = p_local;
  if not found then
    v_cobros.acepta_efectivo := true;
    v_cobros.acepta_debito := true;
    v_cobros.acepta_credito := true;
    v_cobros.acepta_transferencia := false;
    v_cobros.acepta_mercado_pago := false;
    v_cobros.acepta_qr_mercado_pago := false;
  end if;
  if p_metodo = 'mercado_pago' then
    return p_actor = 'comensal' and v_cobros.acepta_mercado_pago
       and exists (select 1 from public.mp_cuentas m where m.local_id = p_local);
  elsif p_metodo = 'transferencia' then
    return v_cobros.acepta_transferencia;
  elsif p_metodo = 'efectivo' then
    return v_cobros.acepta_efectivo;
  elsif p_metodo = 'qr_mercado_pago' then
    return v_cobros.acepta_qr_mercado_pago;
  elsif p_metodo = 'tarjeta_debito' then
    return v_cobros.acepta_debito;
  elsif p_metodo = 'tarjeta_credito' then
    return v_cobros.acepta_credito;
  end if;
  return false;
end;
$$;

create or replace function public._cuenta_json(p_sesion uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_consumo integer;
  v_disponible integer;
  v_hay_definido boolean;
  v_res json;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  if not found then
    return null;
  end if;
  v_consumo := public._consumo_sesion(p_sesion);
  select greatest(v_consumo - coalesce(sum(monto_base), 0), 0),
         coalesce(bool_or(estado = 'definido'), false)
    into v_disponible, v_hay_definido
    from public.pagos_mesa
   where sesion_id = p_sesion and estado <> 'cancelado';

  select json_build_object(
    'sesion', json_build_object(
      'id', v_s.id, 'local_id', v_s.local_id, 'mesa_id', v_s.mesa_id,
      'mesa_numero', v_s.mesa_numero, 'estado', v_s.estado,
      'modo_division', v_s.modo_division, 'partes', v_s.partes,
      'version', v_s.version, 'abierta_en', v_s.abierta_en,
      'actualizado_en', v_s.actualizado_en, 'pagada_en', v_s.pagada_en,
      'cerrada_en', v_s.cerrada_en, 'cerrada_motivo', v_s.cerrada_motivo,
      'llamado_en', v_s.llamado_en,
      'cuenta_intencion', v_s.cuenta_intencion,
      'cuenta_solicitada_en', v_s.cuenta_solicitada_en,
      'cuenta_solicitada_por', v_s.cuenta_solicitada_por,
      'cuenta_pagador_total_id', v_s.cuenta_pagador_total_id,
      'cuenta_pagador_total_nombre', v_s.cuenta_pagador_total_nombre,
      'cuenta_estado', public._cuenta_estado(
        v_s.cuenta_solicitada_en, v_s.cuenta_intencion,
        v_consumo, v_disponible, v_hay_definido)
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


-- Un INSERT de comensal no entra si la cuenta ya se pidió. Confirmar cobros
-- (UPDATE a pagado) y el personal siguen pudiendo escribir.
create or replace function public.pagos_mesa_cuenta_solicitada_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_solicitada timestamptz;
begin
  if new.creado_por <> 'comensal' then
    return new;
  end if;
  select cuenta_solicitada_en into v_solicitada
    from public.mesa_sesiones where id = new.sesion_id;
  if v_solicitada is not null then
    raise exception 'La cuenta ya fue pedida'
      using errcode = 'P0001', hint = 'cuenta-solicitada';
  end if;
  return new;
end;
$$;

drop trigger if exists pagos_mesa_cuenta_solicitada on public.pagos_mesa;
create trigger pagos_mesa_cuenta_solicitada
  before insert on public.pagos_mesa
  for each row execute function public.pagos_mesa_cuenta_solicitada_guard();


create or replace function public._propina_y_recargo(
  p_local uuid,
  p_metodo public.metodo_pago_mesa,
  p_base integer,
  p_datos jsonb
)
returns table(propina integer, propina_pct integer, recargo integer, recargo_pct numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_propina integer := 0;
  v_propina_pct integer;
  v_recargo integer := 0;
  v_recargo_pct numeric(4,2) := 0;
  v_cobros public.local_cobros%rowtype;
begin
  if nullif(p_datos->>'propina_porcentaje', '') is not null then
    v_propina_pct := (p_datos->>'propina_porcentaje')::int;
    if v_propina_pct = 0 then
      v_propina_pct := null;
    elsif v_propina_pct not in (5, 10, 15) then
      raise exception 'propina-invalida' using errcode = 'P0001', hint = 'propina-invalida';
    else
      v_propina := round(p_base * v_propina_pct / 100.0)::int;
    end if;
  elsif nullif(p_datos->>'propina_monto', '') is not null then
    v_propina := (p_datos->>'propina_monto')::int;
    if v_propina < 0 or v_propina > p_base then
      raise exception 'propina-invalida' using errcode = 'P0001', hint = 'propina-invalida';
    end if;
  end if;

  select * into v_cobros from public.local_cobros where local_id = p_local;
  if found then
    if p_metodo = 'tarjeta_debito' then
      v_recargo_pct := v_cobros.recargo_debito_pct;
    elsif p_metodo = 'tarjeta_credito' then
      v_recargo_pct := v_cobros.recargo_credito_pct;
    end if;
  end if;
  if v_recargo_pct > 0 then
    v_recargo := round(p_base * v_recargo_pct / 100)::int;
  end if;

  return query select v_propina, v_propina_pct, v_recargo, v_recargo_pct;
end;
$$;


-- ---------------------------------------------------------------------------
-- Comensal: iniciar división / definir parte / pedir / pagar todo
-- ---------------------------------------------------------------------------

create or replace function public.iniciar_division_comensal(
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

  update public.mesa_sesiones
     set cuenta_intencion = 'dividir'
   where id = v_s.id
     and cuenta_intencion is distinct from 'dividir';
  if found then
    perform public._mesa_evento(v_s.local_id, v_s.id, 'cuenta_division_iniciada',
      'comensal', p_comensal => v_c.id);
    perform public._tocar_sesion(v_s.id);
  end if;

  return json_build_object('ok', true);
end;
$$;


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
    v_base := least((v_consumo / v_partes_tot) * v_partes, v_disponible);

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


create or replace function public.pedir_cuenta_comensal(
  p_comensal uuid,
  p_token_hash text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_consumo integer;
  v_comprometida integer;
  v_n integer;
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
    return json_build_object('ok', true, 'repetido', true);
  end if;

  perform public._expirar_pagos_mp(v_s.id);

  v_consumo := public._consumo_sesion(v_s.id);
  if v_consumo <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;
  select coalesce(sum(monto_base), 0) into v_comprometida
    from public.pagos_mesa
   where sesion_id = v_s.id and estado <> 'cancelado';
  if v_consumo - v_comprometida > 0 then
    return json_build_object('ok', false, 'reason', 'falta-definir',
      'disponible', v_consumo - v_comprometida);
  end if;

  update public.pagos_mesa
     set estado = 'pendiente',
         expira_en = case
           when metodo = 'mercado_pago' then now() + interval '30 minutes'
           else expira_en
         end,
         actualizado_en = now()
   where sesion_id = v_s.id and estado = 'definido';
  get diagnostics v_n = row_count;

  update public.mesa_sesiones
     set cuenta_intencion = coalesce(cuenta_intencion, 'dividir'),
         cuenta_solicitada_en = now(),
         cuenta_solicitada_por = v_c.id
   where id = v_s.id;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'cuenta_solicitada', 'comensal',
    p_comensal => v_c.id,
    p_datos => json_build_object('partes', v_n)::jsonb);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'pago_id', (
    select id from public.pagos_mesa
     where sesion_id = v_s.id and comensal_id = v_c.id
       and estado = 'pendiente' and metodo = 'mercado_pago'
     order by creado_en desc limit 1
  ));
end;
$$;


create or replace function public.pagar_todo_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_datos jsonb
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_res json;
  r record;
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
    if not public._metodo_mesa_habilitado(
         v_s.local_id,
         (p_datos->>'metodo')::public.metodo_pago_mesa,
         'comensal') then
      return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
    end if;
  exception when others then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end;

  /* La división en curso pierde: se cancelan las partes solo definidas. */
  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'pago-total', actualizado_en = now()
     where sesion_id = v_s.id
       and creado_por = 'comensal'
       and estado = 'definido'
    returning id, local_id
  loop
    perform public._mesa_evento(r.local_id, v_s.id, 'pago_cancelado', 'sistema',
      p_pago => r.id, p_datos => jsonb_build_object('motivo', 'pago-total'));
  end loop;

  v_res := public._crear_pago_mesa(
    v_s.id, v_c.id, 'comensal',
    jsonb_set(coalesce(p_datos, '{}'::jsonb), '{modo}', '"uno"'),
    null);
  if coalesce(v_res->>'ok', '') <> 'true' then
    return v_res;
  end if;

  update public.mesa_sesiones
     set cuenta_intencion = 'total',
         cuenta_solicitada_en = now(),
         cuenta_solicitada_por = v_c.id,
         cuenta_pagador_total_id = v_c.id,
         cuenta_pagador_total_nombre = v_c.nombre
   where id = v_s.id;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'cuenta_pago_total', 'comensal',
    p_comensal => v_c.id, p_pago => (v_res->>'pago_id')::uuid);
  perform public._tocar_sesion(v_s.id);

  return v_res;
end;
$$;


create or replace function public.cancelar_pago_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_pago uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_p public.pagos_mesa%rowtype;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_s.cuenta_solicitada_en is not null then
    return json_build_object('ok', false, 'reason', 'cuenta-solicitada');
  end if;

  select * into v_p from public.pagos_mesa
   where id = p_pago and comensal_id = v_c.id for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_p.estado not in ('pendiente', 'definido') then
    return json_build_object('ok', false, 'reason', 'no-pendiente', 'estado', v_p.estado);
  end if;
  update public.pagos_mesa
     set estado = 'cancelado', cancelado_en = now(),
         cancelado_motivo = 'cancelado-por-comensal', actualizado_en = now()
   where id = v_p.id;
  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'comensal',
    p_comensal => v_c.id, p_pago => v_p.id);
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
  if exists (
    select 1 from public.pagos_mesa
     where sesion_id = p_sesion and estado in ('pendiente', 'definido')
  ) then
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


revoke all on function public._cuenta_estado(timestamptz, text, integer, integer, boolean)
  from public, anon, authenticated;
revoke all on function public._metodo_mesa_habilitado(uuid, public.metodo_pago_mesa, text)
  from public, anon, authenticated;
revoke all on function public._propina_y_recargo(uuid, public.metodo_pago_mesa, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.iniciar_division_comensal(uuid, text)
  from public, anon, authenticated;
revoke all on function public.definir_parte_comensal(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.pedir_cuenta_comensal(uuid, text)
  from public, anon, authenticated;
revoke all on function public.pagar_todo_comensal(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.cancelar_pago_comensal(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.iniciar_division_comensal(uuid, text) to service_role;
grant execute on function public.definir_parte_comensal(uuid, text, jsonb) to service_role;
grant execute on function public.pedir_cuenta_comensal(uuid, text) to service_role;
grant execute on function public.pagar_todo_comensal(uuid, text, jsonb) to service_role;
grant execute on function public.cancelar_pago_comensal(uuid, text, uuid) to service_role;
grant execute on function public.cerrar_mesa(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
