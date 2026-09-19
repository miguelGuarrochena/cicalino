-- ===========================================================================
-- Cicalino — La jornada no cambia en un día cerrado
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: reservas-horario-local.sql (locales.dias_cerrados),
--           liberar-mesas-jornada.sql, mesa-asignacion-jornada.sql,
--           security-fixes-15.sql, split-payments.sql, mesa-qr-activo.sql
--
-- PROBLEMA
-- Los días cerrados (locales.dias_cerrados) se marcan una vez en
-- Configuración y el panel ya los respeta en todas sus pantallas. Acá abajo,
-- en cambio, `jornada_inicio_corte` seguía cortando todos los días: si el
-- local cierra los lunes, el lunes a las 6 de la mañana el cron liberaba las
-- mesas que habían quedado ocupadas el domingo a la noche y las cuentas
-- cerradas de ese domingo dejaban de venir en `mesas_cuentas`. El panel decía
-- "seguís en la jornada del domingo" y la base ya la había dado por terminada.
--
-- REGLA
-- En un día que el local no abre, la jornada no cambia: se queda en la del
-- último día trabajado y recién corta cuando arranca el próximo día abierto.
-- Es la misma cuenta que hace el panel en src/lib/businessDay.ts.
--
-- QUÉ SE REESCRIBE
-- Las funciones que deciden a qué jornada pertenece algo: el barrido de mesas
-- del cron, la fecha de la plantilla de mozos, las cuentas de la sala, la
-- sesión vieja al escanear el QR, el alta de pedidos y la lista de pedidos.
-- Van copiadas tal cual están en su archivo original, con el cálculo de la
-- jornada como único cambio.
--
-- QUÉ NO TOCA
-- `pedir_como_comensal` usa la jornada solo para vencer el QR del pedido un
-- día después del corte. Ahí el franco no cambia nada útil y la función es
-- larga, así que se deja con el corte plano antes que copiarla entera.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Arranque de jornada, ahora con los días cerrados del local.
--
-- La firma vieja de un solo argumento se borra a propósito. Si conviviera con
-- esta, una llamada `jornada_inicio_corte(v_corte)` quedaría ambigua y
-- Postgres la rechazaría; con el default, las funciones ya instaladas que
-- llaman con un solo argumento siguen andando igual que siempre.
--
-- `p_cerrados` numera los días como `Date.getDay()`: 0 = domingo … 6 = sábado,
-- igual que la columna locales.dias_cerrados.
-- ---------------------------------------------------------------------------
drop function if exists public.jornada_inicio_corte(integer);

create or replace function public.jornada_inicio_corte(
  p_corte integer,
  p_cerrados integer[] default '{}'::integer[]
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_corte     integer;
  v_cerrados  integer[];
  v_local_now timestamp;
  v_dia       date;
  i           integer;
begin
  v_corte := coalesce(p_corte, 6);
  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  v_cerrados := coalesce(p_cerrados, '{}'::integer[]);
  /* Los siete días cerrados no existen —el panel no deja guardarlo— pero si
   * llegara una fila así, mejor tratarla como abierta que colgar el bucle. */
  if array_length(array(select distinct unnest(v_cerrados)), 1) >= 7 then
    v_cerrados := '{}'::integer[];
  end if;

  v_local_now := timezone('America/Argentina/Buenos_Aires', now());
  if extract(hour from v_local_now)::int < v_corte then
    v_dia := (v_local_now::date - 1);
  else
    v_dia := v_local_now::date;
  end if;

  for i in 1..7 loop
    exit when not (extract(dow from v_dia)::int = any (v_cerrados));
    v_dia := v_dia - 1;
  end loop;

  return ((v_dia::timestamp + make_interval(hours => v_corte))
    at time zone 'America/Argentina/Buenos_Aires');
end;
$$;

revoke all on function public.jornada_inicio_corte(integer, integer[])
  from public, anon, authenticated;

comment on function public.jornada_inicio_corte(integer, integer[]) is
  'Arranque de la jornada abierta. Saltea los días cerrados del local (0=domingo).';


-- ---------------------------------------------------------------------------
-- 2) Lo mismo pero para una sucursal, que es como lo pide todo el resto.
--    Una sola lectura de `locales` en vez de repetir el coalesce por ahí.
-- ---------------------------------------------------------------------------
create or replace function public.jornada_inicio_local(p_local uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_corte    integer;
  v_cerrados integer[];
begin
  select coalesce(l.hora_corte, 6), coalesce(l.dias_cerrados, '{}'::integer[])
    into v_corte, v_cerrados
    from public.locales l
   where l.id = p_local;

  if not found then
    return public.jornada_inicio_corte(6);
  end if;

  return public.jornada_inicio_corte(v_corte, v_cerrados);
end;
$$;

revoke all on function public.jornada_inicio_local(uuid)
  from public, anon, authenticated;

comment on function public.jornada_inicio_local(uuid) is
  'Arranque de la jornada de esa sucursal, con su hora de corte y sus días cerrados.';


-- ---------------------------------------------------------------------------
-- 2 bis) El cierre de la jornada: cuando arranca la siguiente, que con un
--        franco de por medio no es mañana sino el próximo día abierto.
-- ---------------------------------------------------------------------------
create or replace function public.jornada_fin_corte(
  p_corte integer,
  p_cerrados integer[] default '{}'::integer[]
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_corte    integer;
  v_cerrados integer[];
  v_dia      date;
  i          integer;
begin
  v_corte := coalesce(p_corte, 6);
  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  v_cerrados := coalesce(p_cerrados, '{}'::integer[]);
  if array_length(array(select distinct unnest(v_cerrados)), 1) >= 7 then
    v_cerrados := '{}'::integer[];
  end if;

  v_dia := (timezone('America/Argentina/Buenos_Aires',
              public.jornada_inicio_corte(v_corte, v_cerrados)))::date + 1;

  for i in 1..7 loop
    exit when not (extract(dow from v_dia)::int = any (v_cerrados));
    v_dia := v_dia + 1;
  end loop;

  return ((v_dia::timestamp + make_interval(hours => v_corte))
    at time zone 'America/Argentina/Buenos_Aires');
end;
$$;

revoke all on function public.jornada_fin_corte(integer, integer[])
  from public, anon, authenticated;

comment on function public.jornada_fin_corte(integer, integer[]) is
  'Cierre de la jornada abierta: el corte del próximo día que el local abre.';

-- ---------------------------------------------------------------------------
-- 3) Barrido de mesas al corte (liberar-mesas-jornada.sql).
--    Lo único que cambia es de dónde sale `v_desde`.
-- ---------------------------------------------------------------------------
create or replace function public.liberar_mesas_jornada_local(p_local uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n     integer;
  v_corte integer;
  v_desde timestamptz;
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
begin
  for r in
    select id, hora_corte, dias_cerrados from public.locales
  loop
    v_desde := public.jornada_inicio_corte(r.hora_corte, r.dias_cerrados);

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


-- ---------------------------------------------------------------------------
-- 4) La fecha de jornada de la plantilla de mesas (mesa-asignacion-jornada.sql).
--    En un franco sigue siendo la del último día trabajado, así que el tablero
--    muestra el mismo día que el panel.
-- ---------------------------------------------------------------------------
create or replace function public.jornada_fecha_local(p_local uuid)
returns date
language plpgsql stable security definer set search_path = public as $$
declare
  v_corte integer;
begin
  select coalesce(l.hora_corte, 6) into v_corte from public.locales l where l.id = p_local;
  if v_corte is null then
    return (timezone('America/Argentina/Buenos_Aires', now()))::date;
  end if;
  return (timezone('America/Argentina/Buenos_Aires', public.jornada_inicio_local(p_local)))::date;
end;
$$;
revoke all on function public.jornada_fecha_local(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5) Las cuentas de la jornada (split-payments.sql).
--    Las mesas abiertas siempre vinieron; lo que se perdía en el franco eran
--    las cerradas de la última noche.
-- ---------------------------------------------------------------------------
create or replace function public.mesas_cuentas(p_local uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_desde timestamptz;
  r record;
begin
  if not public._staff_puede(p_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_desde := public.jornada_inicio_local(p_local);

  for r in select id from public.mesa_sesiones
            where local_id = p_local and estado = 'abierta'
  loop
    perform public._expirar_pagos_mp(r.id);
  end loop;

  return coalesce((
    select json_agg(public._cuenta_json(s.id) order by
             case s.estado when 'abierta' then 0 else 1 end, s.mesa_numero, s.abierta_en desc)
      from public.mesa_sesiones s
     where s.local_id = p_local
       and (s.estado = 'abierta' or coalesce(s.cerrada_en, s.pagada_en) >= v_desde)
  ), '[]'::json);
end;
$$;

revoke all on function public.mesas_cuentas(uuid) from public, anon;
grant execute on function public.mesas_cuentas(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 6) Sesión vieja al escanear el QR (mesa-qr-activo.sql).
--    Si el comensal entra en un día cerrado, la mesa de la última noche
--    trabajada sigue abierta en vez de cerrarse sola por "jornada-cerrada".
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
  r record;
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

  select * into v_s from public.mesa_sesiones
   where mesa_id = v_m.id and estado = 'abierta' for update;

  if found then
    if v_s.actualizado_en < public.jornada_inicio_local(v_m.local_id) then
      for r in
        update public.pagos_mesa
           set estado = 'cancelado', cancelado_en = now(),
               cancelado_motivo = 'jornada-cerrada', actualizado_en = now()
         where sesion_id = v_s.id and estado = 'pendiente'
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
      v_s := null;
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

revoke all on function public.unirse_mesa(text, text, text) from public, anon, authenticated;
grant execute on function public.unirse_mesa(text, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 7) El alta de pedidos (security-fixes-15.sql).
--    El número correlativo se cuenta dentro de la jornada: si el corte pasara
--    igual en un día cerrado, el pedido del franco volvería a ser el 1 y
--    chocaría con el 1 de la jornada que el panel sigue mostrando.
-- ---------------------------------------------------------------------------
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
  v_ref    text;
  v_max    bigint;
  v_row    public.pedidos%rowtype;
  v_corte  int;
  v_cerrados integer[];
  v_desde  timestamptz;
  v_expira timestamptz;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;
  if not public.local_operativo(p_local) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  /* p_desde/p_expira se ignoran a propósito: la jornada sale de hora_corte.
   * Se mantienen en la firma para no romper el cliente PostgREST. */

  if p_empleado is not null and not exists (
    select 1 from public.empleados e
     where e.id = p_empleado and e.local_id = p_local
  ) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;

  select coalesce(l.hora_corte, 6), coalesce(l.dias_cerrados, '{}'::integer[])
    into v_corte, v_cerrados
    from public.locales l
   where l.id = p_local
   for update;

  if not found then
    return json_build_object('ok', false, 'reason', 'local-invalido');
  end if;

  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  /* La jornada sale de las funciones compartidas: en un día cerrado no
   * cambia, así que el número correlativo del pedido sigue la serie de la
   * última jornada trabajada en vez de volver a 1. */
  v_desde := public.jornada_inicio_corte(v_corte, v_cerrados);
  v_expira := public.jornada_fin_corte(v_corte, v_cerrados);

  v_ref := nullif(btrim(coalesce(p_referencia, '')), '');

  if v_ref is null then
    select coalesce(
      max(nullif(substring(referencia from '^[0-9]+'), '')::bigint), 0
    )
      into v_max
      from public.pedidos
     where local_id = p_local
       and creado_en >= v_desde;
    v_ref := (v_max + 1)::text;
  end if;

  if char_length(v_ref) < 1 or char_length(v_ref) > 40 then
    return json_build_object('ok', false, 'reason', 'referencia-invalida');
  end if;

  if exists (
    select 1 from public.pedidos
     where local_id = p_local
       and creado_en >= v_desde
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
    v_expira
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


-- ---------------------------------------------------------------------------
-- 8) La lista de pedidos de la jornada (split-payments.sql).
--    Es la que decide qué ve la pantalla de Pedidos, así que sin esto el
--    franco seguía empezando lista nueva por más que el panel dijera otra cosa.
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
    select *
      from public.pedidos
     where local_id = p_local
       and creado_en >= v_desde
       and sesion_id is null
  ),
  conteos as (
    select
      count(*)                                                   as todos,
      count(*) filter (where estado in ('creado', 'en_preparacion')) as creado,
      count(*) filter (where estado = 'listo')                   as listo,
      count(*) filter (where estado = 'retirado')                as retirado,
      count(*) filter (where estado = 'cancelado')               as cancelado,
      coalesce(
        max(nullif(substring(referencia from '^[0-9]+'), '')::bigint), 0
      ) as max_ref
    from dia
  ),
  filtrados as (
    select *
      from dia
     where (
             p_filtro = 'todos'
          or (p_filtro = 'creado' and estado in ('creado', 'en_preparacion'))
          or (p_filtro <> 'creado' and estado::text = p_filtro)
           )
       and (
             v_busqueda = ''
          or position(lower(v_busqueda) in lower(referencia)) > 0
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
              f.creado_en desc
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
        'avisos_activos', exists (
          select 1
            from public.push_subscriptions ps
           where ps.pedido_id = p.id
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

-- ---------------------------------------------------------------------------
-- Chequeo
-- ---------------------------------------------------------------------------
-- select l.nombre, l.hora_corte, l.dias_cerrados,
--        public.jornada_inicio_local(l.id) as jornada_desde
--   from public.locales l
--  order by l.nombre;
