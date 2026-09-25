-- ===========================================================================
-- Cicalino — Mostrador QR: los métodos de pago del local deciden qué se ofrece
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: pedidos-mostrador-qr.sql
--
-- Las opciones salen de la configuración real del local (local_cobros +
-- mp_cuentas, con los mismos defaults que _metodo_mesa_habilitado):
--
--   Mercado Pago   es un método propio: solo si está habilitado y conectado.
--   Pagar en caja  NO es un método: es pagar al retirar, en persona, con
--                  alguno de los otros (efectivo, débito, crédito,
--                  transferencia, QR de Mercado Pago en caja). Se ofrece si
--                  hay al menos uno habilitado.
--
--   Solo Efectivo           → Pagar en caja
--   Efectivo + MP           → Pagar en caja + Mercado Pago
--   Solo MP                 → Mercado Pago
--   Ninguno                 → Mostrador QR no se puede activar ni usar
--
-- La modalidad Mesa no cambia.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------

/* ¿Se le puede ofrecer "Pagar en caja"? Algún método presencial habilitado. */
create or replace function public._mostrador_caja_habilitada(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from unnest(array['efectivo', 'tarjeta_debito', 'tarjeta_credito',
                        'transferencia', 'qr_mercado_pago']::public.metodo_pago_mesa[]) m
     where public._metodo_mesa_habilitado(p_local, m, 'personal')
  );
$$;

/* ¿Tiene el local al menos una forma de pagar un pedido del mostrador? */
create or replace function public._mostrador_metodos_ok(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public._mostrador_caja_habilitada(p_local)
      or public._metodo_mesa_habilitado(p_local, 'mercado_pago', 'comensal');
$$;

revoke all on function public._mostrador_caja_habilitada(uuid) from public, anon, authenticated;
revoke all on function public._mostrador_metodos_ok(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2) Activar Mostrador QR exige al menos un método de pago
-- ---------------------------------------------------------------------------
create or replace function public.locales_mostrador_qr_metodos_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pedidos_modalidad = 'mostrador_qr'
     and old.pedidos_modalidad is distinct from 'mostrador_qr'
     and not public._mostrador_metodos_ok(new.id) then
    raise exception 'Mostrador QR needs at least one enabled payment method'
      using errcode = 'P0001', hint = 'sin-metodos';
  end if;
  return new;
end;
$$;

revoke all on function public.locales_mostrador_qr_metodos_guard() from public, anon, authenticated;

drop trigger if exists locales_mostrador_qr_metodos on public.locales;
create trigger locales_mostrador_qr_metodos
  before update of pedidos_modalidad on public.locales
  for each row execute function public.locales_mostrador_qr_metodos_guard();


-- ---------------------------------------------------------------------------
-- 3) Cliente (pedidos-mostrador-qr.sql + métodos)
--    Sin ningún método no se inicia nada; "caja" solo si hay un método
--    presencial. Los pedidos que ya existen se siguen viendo y cobrando.
-- ---------------------------------------------------------------------------

/* pedidos-mostrador-qr.sql + sin métodos no se abre identidad nueva. */
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
  if not public._mostrador_metodos_ok(v_l.id) then
    return json_build_object('ok', false, 'reason', 'sin-metodos');
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

/* pedidos-mostrador-qr.sql + los métodos del local. */
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

/* pedidos-mostrador-qr.sql + en el mostrador, pasar a caja exige un método
 * presencial. La mesa no cambia. */
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

  if v_flujo = 'mostrador_qr' and not public._mostrador_caja_habilitada(v_p.local_id) then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
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

revoke all on function public.unirse_mostrador_qr(text, text) from public, anon, authenticated;
revoke all on function public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.pagar_pedido_autoservicio(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.unirse_mostrador_qr(text, text) to service_role;
grant execute on function public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text) to service_role;
grant execute on function public.pagar_pedido_autoservicio(uuid, text, uuid, text) to service_role;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: true, true, false.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from pg_trigger where tgname = 'locales_mostrador_qr_metodos') as guardia_activar,
  exists (select 1 from pg_proc where proname = '_mostrador_caja_habilitada') as helper_caja,
  has_function_privilege('authenticated', 'public._mostrador_metodos_ok(uuid)', 'EXECUTE') as auth_ve_helper;
