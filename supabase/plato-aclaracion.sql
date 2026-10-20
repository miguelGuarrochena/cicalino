-- ===========================================================================
-- Cicalino — Aclaración y opciones de un plato
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: cocina-modo.sql
--
-- El cliente puede escribir una aclaración ("sin cebolla") en cualquier plato.
-- Si el local cargó dos o tres opciones (tamaño, punto de cocción), elige una.
-- El precio lo pone la opción, no el celular. La comanda muestra las dos cosas.
-- ===========================================================================

alter table public.productos
  add column if not exists opciones jsonb;

alter table public.pedido_items
  add column if not exists opcion text;

alter table public.pedido_items
  add column if not exists nota text;

comment on column public.productos.opciones is
  'Pregunta opcional del plato: {"pregunta","items":[{"nombre","precio"}]}. Dos o tres respuestas. Null = el plato no elige.';

comment on column public.pedido_items.opcion is
  'La respuesta elegida, copiada al pedir. Null si el plato no tiene opciones.';

comment on column public.pedido_items.nota is
  'Aclaración libre del comensal, como "sin cebolla". No cambia el precio.';

create or replace function public.opciones_validas(p jsonb)
returns boolean
language sql
immutable
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and char_length(regexp_replace(btrim(coalesce(p->>'pregunta', '')), '\s+', ' ', 'g')) between 1 and 24
    and jsonb_typeof(p->'items') = 'array'
    and jsonb_array_length(p->'items') between 2 and 3
    and not exists (
      select 1
        from jsonb_array_elements(p->'items') it
       where char_length(regexp_replace(btrim(coalesce(it->>'nombre', '')), '\s+', ' ', 'g')) not between 1 and 24
          or jsonb_typeof(it->'precio') <> 'number'
          or (it->>'precio')::numeric <> trunc((it->>'precio')::numeric)
          or (it->>'precio')::int < 1
          or (it->>'precio')::int > 10000000
    )
    and (
      select count(distinct lower(regexp_replace(btrim(it->>'nombre'), '\s+', ' ', 'g')))
        from jsonb_array_elements(p->'items') it
    ) = jsonb_array_length(p->'items')
  );
$$;

alter table public.productos drop constraint if exists productos_opciones_ok;
alter table public.productos
  add constraint productos_opciones_ok check (public.opciones_validas(opciones));

alter table public.pedido_items drop constraint if exists pedido_items_opcion_ok;
alter table public.pedido_items
  add constraint pedido_items_opcion_ok
  check (opcion is null or char_length(btrim(opcion)) between 1 and 24);

alter table public.pedido_items drop constraint if exists pedido_items_nota_ok;
alter table public.pedido_items
  add constraint pedido_items_nota_ok
  check (nota is null or char_length(btrim(nota)) between 1 and 80);

/* Resuelve el carrito contra la carta de esta sucursal. Si una línea no
 * cierra (producto ajeno, opción que no existe, nota larga, repetida), no
 * devuelve ninguna: el pedido se rechaza entero. El precio sale de la carta. */
create or replace function public._lineas_pedido(p_local uuid, p_items jsonb)
returns table (
  producto_id uuid,
  nombre text,
  precio integer,
  cantidad integer,
  opcion text,
  nota text
)
language sql
stable
security definer
set search_path = public
as $$
  with src as (
    select case
      when jsonb_typeof(p_items) = 'array' then p_items
      else '[]'::jsonb
    end as arr
  ),
  elems as (
    select
      case
        when (elem->>'producto_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (elem->>'producto_id')::uuid
      end as producto_id,
      case
        when jsonb_typeof(elem->'cantidad') = 'number'
         and (elem->>'cantidad')::numeric = trunc((elem->>'cantidad')::numeric)
        then (elem->>'cantidad')::int
      end as cantidad,
      nullif(regexp_replace(btrim(coalesce(elem->>'opcion', '')), '\s+', ' ', 'g'), '') as opcion,
      nullif(
        regexp_replace(
          regexp_replace(btrim(coalesce(elem->>'nota', '')), '[[:cntrl:]]', ' ', 'g'),
          '\s+', ' ', 'g'
        ),
        ''
      ) as nota
    from src, jsonb_array_elements(src.arr) elem
  ),
  resueltas as (
    select
      pr.id as producto_id,
      pr.nombre,
      case when pr.opciones is null then pr.precio else opt.precio end as precio,
      e.cantidad,
      case when pr.opciones is null then null else opt.nombre end as opcion,
      e.nota
    from elems e
    join public.productos pr
      on pr.id = e.producto_id
     and pr.local_id = p_local
     and pr.activo
    left join lateral (
      select
        nullif(regexp_replace(btrim(coalesce(it->>'nombre', '')), '\s+', ' ', 'g'), '') as nombre,
        (it->>'precio')::int as precio
      from jsonb_array_elements(
        case
          when jsonb_typeof(pr.opciones->'items') = 'array' then pr.opciones->'items'
          else '[]'::jsonb
        end
      ) it
      where nullif(regexp_replace(btrim(coalesce(it->>'nombre', '')), '\s+', ' ', 'g'), '') = e.opcion
      limit 1
    ) opt on true
    where e.cantidad between 1 and 50
      and (e.nota is null or char_length(e.nota) <= 80)
      and (
        (pr.opciones is null and e.opcion is null and pr.precio > 0)
        or (
          pr.opciones is not null
          and opt.nombre is not null
          and opt.precio between 1 and 10000000
        )
      )
  )
  select r.producto_id, r.nombre, r.precio, r.cantidad, r.opcion, r.nota
    from resueltas r
   where (select count(*) from elems) between 1 and 30
     and (select count(*) from elems) = (select count(*) from resueltas)
     and (select count(*) from (
            select producto_id, coalesce(opcion, '')
              from resueltas
             group by 1, 2
          ) d) = (select count(*) from resueltas);
$$;

revoke all on function public._lineas_pedido(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._lineas_pedido(uuid, jsonb) to service_role;


-- pedir_como_comensal: la mesa.
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

  select count(*) into v_validas from public._lineas_pedido(v_s.local_id, p_items);
  if v_validas <> v_lineas then
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
    precio_unitario, cantidad, opcion, nota
  )
  select v_pedido, v_s.local_id, v_s.id, v_c.id, l.producto_id, l.nombre,
         l.precio, l.cantidad, l.opcion, l.nota
    from public._lineas_pedido(v_s.local_id, p_items) l;

  select coalesce(sum(subtotal), 0) into v_total from public.pedido_items where pedido_id = v_pedido;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'pedido_creado', 'comensal',
    p_comensal => v_c.id, p_pedido => v_pedido,
    p_datos => json_build_object('lineas', v_lineas, 'total', v_total)::jsonb);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'pedido_id', v_pedido, 'total', v_total);
end;
$$;

-- pedir_autoservicio: QR de mesa con pago.
create or replace function public.pedir_autoservicio(
  p_comensal uuid,
  p_token_hash text,
  p_items jsonb,
  p_clave uuid,
  p_metodo text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_existente public.pedidos%rowtype;
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
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if p_clave is null or coalesce(p_metodo, '') not in ('caja', 'mercado_pago') then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if not found or v_s.estado <> 'abierta' or v_s.flujo <> 'autoservicio'
     or v_s.actualizado_en < public.jornada_inicio_local(v_s.local_id) then
    /* Una sesión de otra jornada: que vuelva a entrar por el QR. */
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;
  if not public.local_pedidos_mesa(v_s.local_id) then
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

  /* Mismas reglas que pedir_como_comensal: cada renglón es un producto activo
   * de esta sucursal, una sola vez, con una cantidad razonable. */
  select count(*) into v_validas from public._lineas_pedido(v_s.local_id, p_items);
  if v_validas <> v_lineas then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  /* El número sale de la misma serie que crear_pedido, con el mismo lock: la
   * caja dice "el 14, mesa 5" y no choca con un pedido del mostrador. */
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
    v_s.local_id, v_ref, v_c.nombre, 'pendiente_pago', gen_random_uuid()::text,
    v_expira, v_s.id, v_c.id, p_clave, true,
    case when p_metodo = 'caja' then now() end
  )
  returning id into v_pedido;

  insert into public.pedido_items (
    pedido_id, local_id, sesion_id, comensal_id, producto_id, nombre,
    precio_unitario, cantidad, opcion, nota
  )
  select v_pedido, v_s.local_id, v_s.id, v_c.id, l.producto_id, l.nombre,
         l.precio, l.cantidad, l.opcion, l.nota
    from public._lineas_pedido(v_s.local_id, p_items) l;

  v_total := public._total_pedido(v_pedido);

  perform public._mesa_evento(v_s.local_id, v_s.id, 'pedido_creado', 'comensal',
    p_comensal => v_c.id, p_pedido => v_pedido,
    p_datos => json_build_object('lineas', v_lineas, 'total', v_total,
      'metodo', p_metodo)::jsonb);

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

-- pedir_mostrador_qr: QR del mostrador.
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
  select count(*) into v_validas from public._lineas_pedido(v_s.local_id, p_items);
  if v_validas <> v_lineas then
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
    precio_unitario, cantidad, opcion, nota
  )
  select v_pedido, v_s.local_id, v_s.id, v_c.id, l.producto_id, l.nombre,
         l.precio, l.cantidad, l.opcion, l.nota
    from public._lineas_pedido(v_s.local_id, p_items) l;

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

-- La cuenta de la mesa lleva la opción y la aclaración.
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
            'cantidad', i.cantidad, 'subtotal', i.subtotal,
            'opcion', i.opcion, 'nota', i.nota
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

-- El pedido de autoservicio, igual.
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
        'subtotal', i.subtotal,
        'opcion', i.opcion, 'nota', i.nota
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

-- El tablero de Pedidos, igual.
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
          select json_agg(json_build_object('nombre', i.nombre, 'cantidad', i.cantidad, 'opcion', i.opcion, 'nota', i.nota)
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

notify pgrst, 'reload schema';
