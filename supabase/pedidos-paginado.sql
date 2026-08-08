-- ===========================================================================
-- Cicalino — Paginated orders for the panel
-- Requiere: security-fixes-01.sql
-- Orden sugerido: #26 de 39 (ver chequeo-migraciones.sql)
-- Run in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- PROBLEM
-- The panel loaded the whole day's orders and then filtered, searched, sorted
-- and paginated in the browser. That works until the day is big, and then it
-- doesn't tell you: the read was capped at 1000 rows, so past that the list
-- was short, the counters under each filter tab were wrong, and nothing said
-- so. #5 made the cap visible instead of silent; this removes the need for it.
--
-- Everything the panel needs comes back in one call: the page, the count per
-- filter tab, and the next order number. Splitting them would mean three
-- round trips per refresh, and the panel refreshes every 30 seconds plus on
-- every realtime event.
-- ===========================================================================

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
  v_busqueda text := btrim(coalesce(p_busqueda, ''));
  v_tam      integer := greatest(1, least(100, coalesce(p_tam, 9)));
  v_pag      integer := greatest(1, coalesce(p_pagina, 1));
  v_res      json;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  with dia as (
    select *
      from public.pedidos
     where local_id = p_local
       and creado_en >= p_desde
  ),
  conteos as (
    select
      count(*)                                                   as todos,
      count(*) filter (where estado in ('creado', 'en_preparacion')) as creado,
      count(*) filter (where estado = 'listo')                   as listo,
      count(*) filter (where estado = 'retirado')                as retirado,
      count(*) filter (where estado = 'cancelado')               as cancelado,
      /* Mismo criterio que parseInt en JS: los dígitos del principio. Una
       * referencia como "Mesa 4" o "Juan" no aporta número y queda afuera. */
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
       /* position() en vez de ILIKE: es exactamente el .includes() que hacía
        * el navegador, y evita que un % o un _ escritos en el buscador se
        * interpreten como comodines. */
       and (
             v_busqueda = ''
          or position(lower(v_busqueda) in lower(referencia)) > 0
           )
  ),
  pagina as (
    select f.*, e.nombre as empleado_nombre
      from filtrados f
      left join public.empleados e on e.id = f.empleado_id
     /* El mismo orden que tenía el panel: primero lo que hay que entregar,
      * después lo que está en curso, y al final lo cerrado. */
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
        'estado', p.estado,
        'creado_en', p.creado_en,
        'en_preparacion_en', p.en_preparacion_en,
        'listo_en', p.listo_en,
        'retirado_en', p.retirado_en,
        'cancelado_en', p.cancelado_en,
        'visto_en', p.visto_en,
        'qr_token', p.qr_token,
        'empleado_nombre', p.empleado_nombre
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
-- El índice que sostiene esto ya existe (idx_pedidos_local_creado). El orden
-- por estado se resuelve en memoria sobre las filas de la jornada, que es un
-- conjunto chico: no vale un índice propio.
--
-- Chequeo: correr con un local_id real.
-- ---------------------------------------------------------------------------
-- select public.pedidos_pagina(
--   'pegar-un-local_id-aca'::uuid, now() - interval '1 day', 'todos', '', 1, 9);
