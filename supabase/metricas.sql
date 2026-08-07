-- ===========================================================================
-- Cicalino — Métricas agregadas en la base
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
--
-- PROBLEMA
-- El panel de métricas bajaba TODAS las filas del período al navegador y
-- agregaba en JavaScript. Sin limit, sin paginar, sin group by.
--
-- Eso trae dos problemas, y el primero es peor que el segundo:
--
--  1. CORRECCIÓN. La cantidad de filas que devuelve PostgREST está acotada
--     por su config de max-rows. Pasado ese techo la respuesta se corta sin
--     avisar, así que el período "mes" o "año" de un local con volumen se
--     calcula sobre un pedazo de los datos y muestra un número plausible
--     pero falso. El local toma decisiones con eso.
--
--  2. PERFORMANCE. Si no se corta, son decenas de miles de filas por JSON a
--     un celular de mostrador, y el bucketeo en JS es cuadrático (un filter
--     por fila dentro de un loop por bucket).
--
-- Estas funciones devuelven una fila con el resumen y los buckets ya
-- contados: ~12 valores en vez de 100.000 filas.
--
-- SOBRE LA ZONA HORARIA
-- El corte de los días lo hacía el navegador con su reloj local. Para no
-- cambiar el comportamiento en este mismo paso, la zona viaja como parámetro
-- desde el cliente. Queda pendiente moverla a la sucursal (hallazgo I-12).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Índice del bucket dentro del período. Devuelve un entero relativo a la
-- fecha de inicio, para que el cliente arme las etiquetas igual que antes:
--
--   dia    → hora del día          0..23
--   semana → día desde el inicio   0..6
--   mes    → semana desde inicio   0..3
--   ano    → mes desde el inicio   0..11
-- ---------------------------------------------------------------------------
create or replace function public.bucket_metrica(
  p_cuando timestamptz,
  p_desde  timestamptz,
  p_periodo text,
  p_tz text
)
returns integer
language sql immutable set search_path = public as $$
  select case p_periodo
    when 'dia' then
      extract(hour from (p_cuando at time zone p_tz))::int
    when 'semana' then
      ((p_cuando at time zone p_tz)::date - (p_desde at time zone p_tz)::date)
    when 'mes' then
      least(3, greatest(0,
        ((p_cuando at time zone p_tz)::date - (p_desde at time zone p_tz)::date) / 7))
    else
      (extract(year  from (p_cuando at time zone p_tz))::int * 12
     + extract(month from (p_cuando at time zone p_tz))::int)
    - (extract(year  from (p_desde  at time zone p_tz))::int * 12
     + extract(month from (p_desde  at time zone p_tz))::int)
  end;
$$;


-- ---------------------------------------------------------------------------
-- Métricas del módulo de pedidos.
--
-- security definer, así que el chequeo de acceso va a mano: sin él cualquier
-- usuario logueado leería las métricas de cualquier sucursal.
-- ---------------------------------------------------------------------------
create or replace function public.metricas_pedidos(
  p_local uuid,
  p_desde timestamptz,
  p_periodo text,
  p_tz text default 'America/Argentina/Buenos_Aires'
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
      estado, creado_en, listo_en, retirado_en,
      public.bucket_metrica(creado_en, p_desde, p_periodo, p_tz) as bucket
    from public.pedidos
    where local_id = p_local
      and creado_en >= p_desde
  )
  select json_build_object(
    'total',     count(*),
    'avisados',  count(*) filter (where estado in ('listo', 'retirado')),
    'enCurso',   count(*) filter (where estado = 'creado'),
    -- Los negativos se descartan: son relojes desfasados, no tiempos reales.
    'prepMin',   avg(extract(epoch from (listo_en - creado_en)) / 60)
                   filter (where listo_en >= creado_en),
    'retiroMin', avg(extract(epoch from (retirado_en - listo_en)) / 60)
                   filter (where retirado_en >= listo_en),
    'buckets',   coalesce((
      select json_agg(json_build_object('k', b.bucket, 'n', b.n) order by b.bucket)
        from (select bucket, count(*) as n from filas group by bucket) b
    ), '[]'::json)
  ) into v_res
  from filas;

  return v_res;
end;
$$;


-- ---------------------------------------------------------------------------
-- Métricas del módulo de espera. Mismo criterio, más la ocupación de mesas.
-- ---------------------------------------------------------------------------
create or replace function public.metricas_espera(
  p_local uuid,
  p_desde timestamptz,
  p_periodo text,
  p_tz text default 'America/Argentina/Buenos_Aires'
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
      public.bucket_metrica(creado_en, p_desde, p_periodo, p_tz) as bucket
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
    'prepMin',      avg(extract(epoch from (avisado_en - creado_en)) / 60)
                      filter (where avisado_en >= creado_en),
    'mesasTotal',   (select total    from mesas),
    'mesasOcupadas',(select ocupadas from mesas),
    'buckets',      coalesce((
      select json_agg(json_build_object('k', b.bucket, 'n', b.n) order by b.bucket)
        from (select bucket, count(*) as n from filas group by bucket) b
    ), '[]'::json)
  ) into v_res
  from filas;

  return v_res;
end;
$$;


grant execute on function public.metricas_pedidos(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.metricas_espera(uuid, timestamptz, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Chequeo: correr con un local_id real.
-- ---------------------------------------------------------------------------
-- select public.metricas_pedidos(
--   'pegar-un-local_id-aca'::uuid, now() - interval '30 days', 'mes',
--   'America/Argentina/Buenos_Aires');
