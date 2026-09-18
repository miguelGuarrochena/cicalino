-- ===========================================================================
-- Cicalino — QR de Mercado Pago como método presencial (como efectivo)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: mesa-pago-qr-mp-enum.sql
--
-- El cliente elige “QR de Mercado Pago”. Cicalino avisa al personal.
-- No genera QR, no abre Checkout Pro, no toca el webhook.
-- ===========================================================================

alter table public.local_cobros
  add column if not exists acepta_qr_mercado_pago boolean not null default false;

comment on column public.local_cobros.acepta_qr_mercado_pago is
  'El comensal puede pedir pagar con el QR/POS de Mercado Pago que acerca el personal. No es Checkout Pro.';

create or replace function public._crear_pago_mesa(
  p_sesion uuid,
  p_comensal uuid,
  p_actor text,
  p_datos jsonb,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_cobros public.local_cobros%rowtype;
  v_modo public.division_modo;
  v_metodo public.metodo_pago_mesa;
  v_clave uuid;
  v_existente public.pagos_mesa%rowtype;
  v_consumo integer;
  v_comprometida integer;
  v_disponible integer;
  v_activos integer;
  v_partes_tot integer;
  v_partes_comp integer;
  v_restantes integer;
  v_partes integer;
  v_base integer;
  v_propina integer := 0;
  v_propina_pct integer;
  v_recargo integer := 0;
  v_recargo_pct numeric(4,2) := 0;
  v_esperado integer;
  v_nombre text;
  v_confirmar boolean;
  v_pago public.pagos_mesa%rowtype;
  v_mio integer;
  v_mio_comp integer;
  v_presencial boolean;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'sesion-inexistente');
  end if;
  if v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;

  perform public._expirar_pagos_mp(p_sesion);

  begin
    v_modo := (p_datos->>'modo')::public.division_modo;
    v_metodo := (p_datos->>'metodo')::public.metodo_pago_mesa;
    v_clave := nullif(p_datos->>'clave', '')::uuid;
  exception when others then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end;
  if v_modo is null or v_metodo is null then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  /* Retries with the same key return the original payment. */
  if v_clave is not null then
    select * into v_existente from public.pagos_mesa
     where sesion_id = p_sesion and clave_idempotencia = v_clave;
    if found then
      return json_build_object('ok', true, 'repetido', true, 'pago_id', v_existente.id,
        'monto_total', v_existente.monto_total, 'metodo', v_existente.metodo,
        'estado', v_existente.estado);
    end if;
  end if;

  /* Method must be enabled for this branch. Staff can't start an online MP
   * checkout on behalf of someone. */
  select * into v_cobros from public.local_cobros where local_id = v_s.local_id;
  if not found then
    v_cobros.acepta_efectivo := true;
    v_cobros.acepta_debito := true;
    v_cobros.acepta_credito := true;
    v_cobros.acepta_transferencia := false;
    v_cobros.acepta_mercado_pago := false;
    v_cobros.acepta_qr_mercado_pago := false;
    v_cobros.recargo_debito_pct := 0;
    v_cobros.recargo_credito_pct := 0;
  end if;

  if (v_metodo = 'mercado_pago' and (p_actor <> 'comensal' or not v_cobros.acepta_mercado_pago
        or not exists (select 1 from public.mp_cuentas m where m.local_id = v_s.local_id)))
     or (v_metodo = 'transferencia' and not v_cobros.acepta_transferencia)
     or (v_metodo = 'efectivo' and not v_cobros.acepta_efectivo)
     or (v_metodo = 'qr_mercado_pago' and not v_cobros.acepta_qr_mercado_pago)
     or (v_metodo = 'tarjeta_debito' and not v_cobros.acepta_debito)
     or (v_metodo = 'tarjeta_credito' and not v_cobros.acepta_credito) then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
  end if;

  /* A payment collected by staff at the venue ("this much, in cash") is an
   * amount, whatever split the guests chose on their phones. It doesn't set or
   * change the table's mode, and it's still capped by what's left, so it can't
   * overpay. Those payments don't count when deciding whether the mode is
   * already fixed. */
  v_presencial := p_actor = 'personal' and v_modo in ('monto', 'uno');

  select count(*) into v_activos from public.pagos_mesa
   where sesion_id = p_sesion and estado <> 'cancelado'
     and not (creado_por = 'personal' and modo in ('monto', 'uno'));

  /* The split mode belongs to the table: the first payment fixes it, and it
   * can change only while nothing is pending or paid. */
  if not v_presencial and v_activos > 0 and v_s.modo_division is not null
     and (v_s.modo_division <> v_modo
          or (v_modo = 'iguales' and p_datos ? 'partes_totales'
              and (p_datos->>'partes_totales')::int is distinct from v_s.partes)) then
    return json_build_object('ok', false, 'reason', 'modo-bloqueado',
      'modo_division', v_s.modo_division, 'partes', v_s.partes);
  end if;

  if v_activos = 0 and not v_presencial then
    if v_modo = 'iguales' then
      v_partes_tot := coalesce(
        nullif(p_datos->>'partes_totales', '')::int,
        (select count(*) from public.comensales c where c.sesion_id = p_sesion)::int);
      if v_partes_tot is null or v_partes_tot < 1 or v_partes_tot > 50 then
        return json_build_object('ok', false, 'reason', 'partes-invalidas');
      end if;
    else
      v_partes_tot := null;
    end if;
    update public.mesa_sesiones
       set modo_division = v_modo, partes = v_partes_tot
     where id = p_sesion;
    v_s.modo_division := v_modo;
    v_s.partes := v_partes_tot;
  end if;

  v_consumo := public._consumo_sesion(p_sesion);
  select coalesce(sum(monto_base), 0),
         coalesce(sum(partes) filter (where modo = 'iguales'), 0)
    into v_comprometida, v_partes_comp
    from public.pagos_mesa where sesion_id = p_sesion and estado <> 'cancelado';
  v_disponible := greatest(v_consumo - v_comprometida, 0);

  if v_disponible <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;

  v_partes := 1;

  if v_modo = 'consumo' then
    if p_comensal is null then
      return json_build_object('ok', false, 'reason', 'comensal-requerido');
    end if;
    select coalesce(sum(i.subtotal), 0) into v_mio
      from public.pedido_items i join public.pedidos p on p.id = i.pedido_id
     where i.comensal_id = p_comensal and p.estado <> 'cancelado';
    select coalesce(sum(monto_base), 0) into v_mio_comp
      from public.pagos_mesa
     where comensal_id = p_comensal and sesion_id = p_sesion and estado <> 'cancelado';
    v_base := least(greatest(v_mio - v_mio_comp, 0), v_disponible);

  elsif v_modo = 'iguales' then
    v_partes := greatest(1, least(50, coalesce(nullif(p_datos->>'partes', '')::int, 1)));
    v_restantes := coalesce(v_s.partes, 1) - v_partes_comp;
    if v_restantes <= 0 then
      /* Parts are all taken but more was ordered afterwards: the remainder
       * goes as a single extra part. */
      v_base := v_disponible;
      v_partes := 1;
    elsif v_partes >= v_restantes then
      v_partes := v_restantes;
      v_base := v_disponible;
    else
      v_base := (v_disponible / v_restantes) * v_partes;
    end if;

  elsif v_modo = 'uno' then
    v_base := v_disponible;

  else -- monto
    if nullif(p_datos->>'monto', '') is not null then
      v_base := (p_datos->>'monto')::int;
    elsif nullif(p_datos->>'porcentaje', '') is not null then
      if (p_datos->>'porcentaje')::numeric <= 0 or (p_datos->>'porcentaje')::numeric > 100 then
        return json_build_object('ok', false, 'reason', 'porcentaje-invalido');
      end if;
      v_base := round(v_consumo * (p_datos->>'porcentaje')::numeric / 100)::int;
    else
      return json_build_object('ok', false, 'reason', 'monto-invalido');
    end if;
    if v_base > v_disponible then
      return json_build_object('ok', false, 'reason', 'excede',
        'disponible', v_disponible);
    end if;
  end if;

  if v_base is null or v_base <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;

  /* Tip: per person, over the consumption this payment covers. */
  if nullif(p_datos->>'propina_porcentaje', '') is not null then
    v_propina_pct := (p_datos->>'propina_porcentaje')::int;
    if v_propina_pct = 0 then
      v_propina_pct := null;
    elsif v_propina_pct not in (5, 10, 15) then
      return json_build_object('ok', false, 'reason', 'propina-invalida');
    else
      v_propina := round(v_base * v_propina_pct / 100.0)::int;
    end if;
  elsif nullif(p_datos->>'propina_monto', '') is not null then
    v_propina := (p_datos->>'propina_monto')::int;
    if v_propina < 0 or v_propina > v_base then
      return json_build_object('ok', false, 'reason', 'propina-invalida');
    end if;
  end if;

  /* Card surcharge, copied at creation so later config changes don't touch it.
   * Applied to consumption only. */
  if v_metodo = 'tarjeta_debito' then
    v_recargo_pct := v_cobros.recargo_debito_pct;
  elsif v_metodo = 'tarjeta_credito' then
    v_recargo_pct := v_cobros.recargo_credito_pct;
  end if;
  if v_recargo_pct > 0 then
    v_recargo := round(v_base * v_recargo_pct / 100)::int;
  end if;

  /* The guest saw an amount before confirming. If the bill moved in between
   * (someone else paid, a new order came in) we don't charge a different
   * number silently: we answer with the new one. */
  v_esperado := nullif(p_datos->>'monto_esperado', '')::int;
  if v_esperado is not null and v_esperado <> v_base + v_propina + v_recargo then
    return json_build_object('ok', false, 'reason', 'monto-cambio',
      'monto_base', v_base, 'propina', v_propina, 'recargo', v_recargo,
      'monto_total', v_base + v_propina + v_recargo);
  end if;

  if p_comensal is not null then
    select nombre into v_nombre from public.comensales where id = p_comensal and sesion_id = p_sesion;
    if v_nombre is null then
      return json_build_object('ok', false, 'reason', 'comensal-invalido');
    end if;
  else
    v_nombre := nullif(btrim(coalesce(p_datos->>'pagador_nombre', '')), '');
    if v_nombre is null or char_length(v_nombre) > 40 then
      return json_build_object('ok', false, 'reason', 'pagador-invalido');
    end if;
  end if;

  v_confirmar := p_actor = 'personal'
                 and coalesce((p_datos->>'confirmado')::boolean, false)
                 and v_metodo <> 'mercado_pago';

  insert into public.pagos_mesa (
    local_id, sesion_id, comensal_id, pagador_nombre, modo, partes, monto_base,
    propina, propina_porcentaje, recargo, recargo_porcentaje, metodo, estado,
    creado_por, clave_idempotencia, confirmacion, confirmado_en, confirmado_por,
    confirmado_empleado, expira_en
  ) values (
    v_s.local_id, p_sesion, p_comensal, v_nombre, v_modo, v_partes, v_base,
    v_propina, v_propina_pct, v_recargo, v_recargo_pct, v_metodo,
    case when v_confirmar then 'pagado'::public.pago_mesa_estado else 'pendiente' end,
    p_actor, v_clave,
    case when v_confirmar then 'manual' end,
    case when v_confirmar then now() end,
    case when v_confirmar then auth.uid() end,
    case when v_confirmar then p_empleado end,
    case when v_metodo = 'mercado_pago' then now() + interval '30 minutes' end
  )
  returning * into v_pago;

  perform public._mesa_evento(v_s.local_id, p_sesion,
    case when v_confirmar then 'pago_registrado_pagado' else 'pago_creado' end,
    p_actor, p_comensal => p_comensal, p_pago => v_pago.id, p_empleado => p_empleado,
    p_datos => json_build_object('modo', v_modo, 'metodo', v_metodo,
      'monto_base', v_base, 'propina', v_propina, 'recargo', v_recargo,
      'partes', v_partes)::jsonb);

  if v_confirmar then
    perform public._revisar_cobertura(p_sesion);
  end if;
  perform public._tocar_sesion(p_sesion);

  return json_build_object('ok', true, 'pago_id', v_pago.id,
    'monto_base', v_pago.monto_base, 'propina', v_pago.propina,
    'recargo', v_pago.recargo, 'monto_total', v_pago.monto_total,
    'metodo', v_pago.metodo, 'estado', v_pago.estado, 'expira_en', v_pago.expira_en);
end;
$$;

notify pgrst, 'reload schema';
