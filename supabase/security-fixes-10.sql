-- ===========================================================================
-- Cicalino — Fixes de seguridad #10 (crear_pedido atómico)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: security-fixes-01.sql, security-fixes-04.sql, corte-por-impago.sql,
--           pedidos-paginado.sql
-- Orden sugerido: #45 (después de security-fixes-09)
--
-- PROBLEMA
-- El panel leía proximoNumero vía pedidos_pagina y después hacía INSERT desde
-- el cliente. Dos cajas concurrentes podían leer el mismo número e insertar
-- la misma referencia en la jornada.
--
-- FIX
-- crear_pedido asigna (o valida) la referencia bajo advisory lock de la
-- sucursal, en la misma transacción que el INSERT. Si p_referencia viene
-- vacía, calcula max(dígitos iniciales)+1 como pedidos_pagina.
-- ===========================================================================

create or replace function public.crear_pedido(
  p_local      uuid,
  p_referencia text,
  p_empleado   uuid,
  p_desde      timestamptz,
  p_expira     timestamptz
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_ref   text;
  v_max   bigint;
  v_row   public.pedidos%rowtype;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;
  if not public.local_operativo(p_local) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;
  if p_desde is null or p_expira is null then
    return json_build_object('ok', false, 'reason', 'parametros-invalidos');
  end if;
  if p_expira <= p_desde then
    return json_build_object('ok', false, 'reason', 'parametros-invalidos');
  end if;

  if p_empleado is not null and not exists (
    select 1 from public.empleados e
     where e.id = p_empleado and e.local_id = p_local
  ) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;

  /* Un solo número por local a la vez: cierra la race entre dos cajas. */
  if not exists (
    select 1 from public.locales where id = p_local for update
  ) then
    return json_build_object('ok', false, 'reason', 'local-invalido');
  end if;

  v_ref := nullif(btrim(coalesce(p_referencia, '')), '');

  if v_ref is null then
    select coalesce(
      max(nullif(substring(referencia from '^[0-9]+'), '')::bigint), 0
    )
      into v_max
      from public.pedidos
     where local_id = p_local
       and creado_en >= p_desde;
    v_ref := (v_max + 1)::text;
  end if;

  if char_length(v_ref) < 1 or char_length(v_ref) > 40 then
    return json_build_object('ok', false, 'reason', 'referencia-invalida');
  end if;

  /* Evita duplicar el mismo número (o texto) en la jornada aunque el cliente
   * lo haya mandado a mano. */
  if exists (
    select 1 from public.pedidos
     where local_id = p_local
       and creado_en >= p_desde
       and lower(referencia) = lower(v_ref)
  ) then
    return json_build_object('ok', false, 'reason', 'referencia-duplicada');
  end if;

  insert into public.pedidos (
    local_id, referencia, estado, empleado_id, qr_token, qr_expira_en
  ) values (
    p_local,
    v_ref,
    'creado',
    p_empleado,
    gen_random_uuid()::text,
    p_expira
  )
  returning * into v_row;

  return json_build_object(
    'ok', true,
    'pedido', json_build_object(
      'id', v_row.id,
      'referencia', v_row.referencia,
      'estado', v_row.estado,
      'creado_en', v_row.creado_en,
      'en_preparacion_en', v_row.en_preparacion_en,
      'listo_en', v_row.listo_en,
      'retirado_en', v_row.retirado_en,
      'cancelado_en', v_row.cancelado_en,
      'visto_en', v_row.visto_en,
      'qr_token', v_row.qr_token,
      'empleado_nombre', (
        select e.nombre from public.empleados e where e.id = v_row.empleado_id
      )
    )
  );
end;
$$;

revoke all on function public.crear_pedido(uuid, text, uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.crear_pedido(uuid, text, uuid, timestamptz, timestamptz)
  to authenticated;

comment on function public.crear_pedido(uuid, text, uuid, timestamptz, timestamptz) is
  'Crea un pedido con referencia atómica por jornada (advisory lock por local).';

-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: existe y solo authenticated/service_role.
-- ---------------------------------------------------------------------------
-- select
--   has_function_privilege('anon', 'public.crear_pedido(uuid,text,uuid,timestamptz,timestamptz)', 'execute') as anon_ok,
--   has_function_privilege('authenticated', 'public.crear_pedido(uuid,text,uuid,timestamptz,timestamptz)', 'execute') as auth_ok;
