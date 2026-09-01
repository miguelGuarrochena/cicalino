-- ===========================================================================
-- Cicalino — Distribución de tiempos real + métricas por organización
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: metricas.sql, security-fixes-04.sql
--
-- Dos cosas que el panel de Métricas mostraba mal.
--
-- 1) DISTRIBUCIÓN DE TIEMPOS
-- El gráfico "Tiempos de espera" salía de un array fijo en el código
-- (0-5 → 34%, 5-10 → 41%, …). Los mismos cuatro números para todos los
-- locales, todos los períodos y los dos módulos. Se agregan acá, con el
-- mismo criterio que prepMin: se cuenta el pedido que llegó a listo (la
-- espera que llegó a avisado), descartando los tiempos negativos, que son
-- relojes desfasados y no esperas reales.
--
-- 2) SUCURSAL / GLOBAL
-- El selector existía pero metricas_pedidos siempre recibió un solo local,
-- así que "Global" cambiaba el subtítulo y nada más. La agregación pasa a
-- una función interna que toma un arreglo de locales, y arriba quedan dos
-- entradas: una por sucursal (la de siempre, misma firma) y otra por
-- organización.
--
-- Espera queda por sucursal: el panel no ofrece Global para ese módulo, y
-- las mesas ocupadas no se suman entre locales de forma útil.
--
-- SOBRE EL PERMISO EN GLOBAL
-- No se agrega una regla nueva: se listan los locales de la organización y
-- se filtran con puede_ver_local(), que es el chequeo central de
-- security-fixes-04. Un admin ve su organización, un supervisor solo sus
-- sucursales, y si no queda ninguno la función corta con 'No autorizado'.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- La agregación, sobre uno o varios locales.
--
-- security invoker a propósito: si alguien la llamara de afuera, RLS filtra
-- y no ve nada ajeno. El permiso de verdad lo hacen los envoltorios de
-- abajo, que sí son security definer. Sin grant a authenticated: no es una
-- función para PostgREST.
-- ---------------------------------------------------------------------------
create or replace function public.metricas_pedidos_datos(
  p_locales uuid[],
  p_desde   timestamptz,
  p_periodo text,
  p_tz      text
)
returns json
language sql stable set search_path = public as $$
  with filas as (
    select
      estado, creado_en, listo_en, retirado_en,
      public.bucket_metrica(creado_en, p_desde, p_periodo, p_tz) as bucket,
      -- null cuando el pedido no llegó a listo o el reloj vino al revés.
      case
        when listo_en is not null and listo_en >= creado_en
          then extract(epoch from (listo_en - creado_en)) / 60
      end as espera_min
    from public.pedidos
    where local_id = any(p_locales)
      and creado_en >= p_desde
  )
  select json_build_object(
    'total',     count(*),
    'avisados',  count(*) filter (where estado in ('listo', 'retirado')),
    'enCurso',   count(*) filter (where estado = 'creado'),
    -- avg ignora los null, así que prepMin y tramos cuentan las mismas filas.
    'prepMin',   avg(espera_min),
    'retiroMin', avg(extract(epoch from (retirado_en - listo_en)) / 60)
                   filter (where retirado_en >= listo_en),
    'buckets',   coalesce((
      select json_agg(json_build_object('k', b.bucket, 'n', b.n) order by b.bucket)
        from (select bucket, count(*) as n from filas group by bucket) b
    ), '[]'::json),
    -- Siempre los cuatro tramos, incluso en cero: el eje del gráfico es fijo
    -- y el cliente decide si hay datos suficientes mirando la suma.
    'tramos', json_build_array(
      json_build_object('k', 0, 'n', count(*) filter (where espera_min <  5)),
      json_build_object('k', 1, 'n', count(*) filter (where espera_min >=  5 and espera_min < 10)),
      json_build_object('k', 2, 'n', count(*) filter (where espera_min >= 10 and espera_min < 15)),
      json_build_object('k', 3, 'n', count(*) filter (where espera_min >= 15))
    )
  )
  from filas;
$$;

revoke all on function public.metricas_pedidos_datos(uuid[], timestamptz, text, text) from public;
revoke all on function public.metricas_pedidos_datos(uuid[], timestamptz, text, text) from anon;
revoke all on function public.metricas_pedidos_datos(uuid[], timestamptz, text, text) from authenticated;


-- ---------------------------------------------------------------------------
-- Pedidos de una sucursal. Misma firma que en metricas.sql: el cliente que
-- ya estaba andando no cambia, solo le llega un campo más.
-- ---------------------------------------------------------------------------
create or replace function public.metricas_pedidos(
  p_local   uuid,
  p_desde   timestamptz,
  p_periodo text,
  p_tz      text default 'America/Argentina/Buenos_Aires'
)
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;
  if p_periodo not in ('dia', 'semana', 'mes', 'ano') then
    raise exception 'Periodo invalido: %', p_periodo;
  end if;

  return public.metricas_pedidos_datos(
    array[p_local], p_desde, p_periodo, p_tz);
end;
$$;


-- ---------------------------------------------------------------------------
-- Pedidos de toda la organización, con el alcance recortado a lo que el
-- usuario puede ver.
-- ---------------------------------------------------------------------------
create or replace function public.metricas_pedidos_org(
  p_organizacion uuid,
  p_desde        timestamptz,
  p_periodo      text,
  p_tz           text default 'America/Argentina/Buenos_Aires'
)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_locales uuid[];
begin
  if p_periodo not in ('dia', 'semana', 'mes', 'ano') then
    raise exception 'Periodo invalido: %', p_periodo;
  end if;

  select array_agg(l.id)
    into v_locales
    from public.locales l
   where l.organizacion_id = p_organizacion
     and public.puede_ver_local(l.id);

  if v_locales is null or array_length(v_locales, 1) is null then
    raise exception 'No autorizado';
  end if;

  return public.metricas_pedidos_datos(
    v_locales, p_desde, p_periodo, p_tz);
end;
$$;


-- ---------------------------------------------------------------------------
-- Espera: sigue siendo por sucursal, ahora con los tramos reales. El tiempo
-- que se mide es el que le importa al grupo: desde que entró a la cola hasta
-- que se le avisó que había mesa.
-- ---------------------------------------------------------------------------
create or replace function public.metricas_espera(
  p_local   uuid,
  p_desde   timestamptz,
  p_periodo text,
  p_tz      text default 'America/Argentina/Buenos_Aires'
)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_res json;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;
  if p_periodo not in ('dia', 'semana', 'mes', 'ano') then
    raise exception 'Periodo invalido: %', p_periodo;
  end if;

  with filas as (
    select
      estado, creado_en, avisado_en, sentado_en,
      public.bucket_metrica(creado_en, p_desde, p_periodo, p_tz) as bucket,
      case
        when avisado_en is not null and avisado_en >= creado_en
          then extract(epoch from (avisado_en - creado_en)) / 60
      end as espera_min
    from public.esperas
    where local_id = p_local
      and creado_en >= p_desde
  ),
  mesas as (
    select
      count(*) as total,
      count(*) filter (where estado = 'ocupada') as ocupadas
    from public.mesas
    where local_id = p_local
  )
  select json_build_object(
    'total',        count(*),
    'avisados',     count(*) filter (where estado in ('avisado', 'sentado')),
    'enCurso',      count(*) filter (where estado in ('esperando', 'avisado')),
    'prepMin',      avg(espera_min),
    'mesasTotal',   (select total    from mesas),
    'mesasOcupadas',(select ocupadas from mesas),
    'buckets',      coalesce((
      select json_agg(json_build_object('k', b.bucket, 'n', b.n) order by b.bucket)
        from (select bucket, count(*) as n from filas group by bucket) b
    ), '[]'::json),
    'tramos', json_build_array(
      json_build_object('k', 0, 'n', count(*) filter (where espera_min <  5)),
      json_build_object('k', 1, 'n', count(*) filter (where espera_min >=  5 and espera_min < 10)),
      json_build_object('k', 2, 'n', count(*) filter (where espera_min >= 10 and espera_min < 15)),
      json_build_object('k', 3, 'n', count(*) filter (where espera_min >= 15))
    )
  ) into v_res
  from filas;

  return v_res;
end;
$$;


grant execute on function public.metricas_pedidos(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.metricas_pedidos_org(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.metricas_espera(uuid, timestamptz, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Chequeo: correr con un local_id / organizacion_id reales.
--
-- Los tramos tienen que sumar la misma cantidad de pedidos que se usó para
-- prepMin, y esa suma nunca puede pasar el total del período.
-- ---------------------------------------------------------------------------
-- select
--   m->>'total' as total,
--   m->>'prepMin' as prep_min,
--   m->'tramos' as tramos
-- from (
--   select public.metricas_pedidos(
--     'pegar-un-local_id-aca'::uuid, now() - interval '30 days', 'mes',
--     'America/Argentina/Buenos_Aires') as m
-- ) t;
--
-- select public.metricas_pedidos_org(
--   'pegar-una-organizacion_id-aca'::uuid, now() - interval '30 days', 'mes',
--   'America/Argentina/Buenos_Aires');
