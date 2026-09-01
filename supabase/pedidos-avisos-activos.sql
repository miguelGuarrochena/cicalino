-- ===========================================================================
-- Cicalino — ¿Este pedido va a poder recibir el aviso?
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: alias-busca-activos.sql, push-indices.sql
--
-- PROBLEMA
-- El mostrador se entera de que el cliente no va a recibir el aviso DESPUÉS
-- de tocar "Listo", por un toast que dice "llamalo vos". Justo en el caso en
-- el que el producto falla —el cliente no se entera— el dato llega tarde y se
-- va solo a los cinco segundos.
--
-- Los dos datos que hacen falta ya existen:
--
--   · visto_en          ya viaja en la página; dice si escaneó el QR.
--   · push_subscriptions dice si además dejó los avisos activos.
--
-- Solo faltaba el segundo en el listado. Se devuelve como booleano y nada
-- más: la tabla tiene RLS y guarda el endpoint y las claves de cifrado del
-- navegador, que no tienen por qué salir de la base. `pedidos_pagina` es
-- security definer, así que puede contarlas sin exponerlas.
--
-- El exists va sobre `pagina`, que ya está recortada al tamaño de página
-- (9 filas), no sobre la jornada entera.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) El índice que usa el exists. Viene del baseline de Drizzle
--    (drizzle/0000), que no está en esta carpeta; se fija acá para que la
--    fuente de verdad lo tenga, ahora que hay una consulta que depende de él.
-- ---------------------------------------------------------------------------
create index if not exists idx_push_pedido
  on public.push_subscriptions (pedido_id);


-- ---------------------------------------------------------------------------
-- 2) El listado, con avisos_activos.
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
  v_local_now  timestamp;
  v_dia        date;
  v_desde      timestamptz;
  v_res        json;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  select coalesce(l.hora_corte, 6)
    into v_corte
    from public.locales l
   where l.id = p_local;

  if v_corte is null or v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  v_local_now := timezone('America/Argentina/Buenos_Aires', now());
  if extract(hour from v_local_now)::int < v_corte then
    v_dia := (v_local_now::date - 1);
  else
    v_dia := v_local_now::date;
  end if;

  v_desde := ((v_dia::timestamp + make_interval(hours => v_corte))
    at time zone 'America/Argentina/Buenos_Aires');

  with dia as (
    select *
      from public.pedidos
     where local_id = p_local
       and creado_en >= v_desde
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

grant execute on function public.pedidos_pagina(uuid, timestamptz, text, text, integer, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- 3) Chequeo: de los pedidos abiertos de hoy, cuántos escanearon el QR y
--    cuántos además dejaron los avisos activos.
-- ---------------------------------------------------------------------------
-- select
--   count(*)                                             as abiertos,
--   count(*) filter (where p.visto_en is not null)       as escanearon,
--   count(*) filter (where exists (
--     select 1 from public.push_subscriptions ps where ps.pedido_id = p.id
--   ))                                                   as con_avisos
-- from public.pedidos p
-- where p.estado in ('creado', 'en_preparacion', 'listo')
--   and p.creado_en >= now() - interval '1 day';
