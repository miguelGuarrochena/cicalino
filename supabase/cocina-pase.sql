-- Cocina en pantalla: el mostrador manda la comanda y marca listo al llevarla.
--
-- creado = todavía en el mostrador. Mandarla pasa a en_preparacion y aparece
-- en la pantalla de cocina. Cocina no cambia el estado al terminar: escribe
-- cocina_hecha_en. El cliente sigue viendo el pedido en preparación. El
-- mostrador pasa a listo cuando puede llevarlo, y ese paso es el que avisa.
--
-- Imprimir no usa esta columna. Requiere plato-aclaracion.sql.

alter table public.pedidos
  add column if not exists cocina_hecha_en timestamptz;

comment on column public.pedidos.cocina_hecha_en is
  'Cocina terminó. El estado sigue en en_preparacion hasta que el mostrador marca listo.';

-- La cuenta de la mesa también dice si cocina ya terminó.
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
        'creado_en', p.creado_en, 'cocina_hecha_en', p.cocina_hecha_en, 'listo_en', p.listo_en,
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

-- El pedido de autoservicio, igual: cocina_hecha_en.
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
    'cocina_hecha_en', p.cocina_hecha_en,
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

-- El tablero de Pedidos: cocina_hecha_en, y lo hecho arriba junto con listo.
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
     order by case
                when f.estado = 'listo' then 0
                when f.estado = 'en_preparacion' and f.cocina_hecha_en is not null then 0
                when f.estado in ('creado', 'en_preparacion') then 1
                when f.estado = 'retirado' then 2
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
        'cocina_hecha_en', p.cocina_hecha_en,
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
