-- ===========================================================================
-- Cicalino — Buscar por alias solo pedidos abiertos
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: alias-cliente.sql
--
-- Un segundo pedido del mismo cliente es un alta nueva, no reabrir el QR
-- de la mañana. El alias ("Miguel") solo matchea creado/en_preparacion/listo.
-- Por N° de pedido se sigue encontrando lo retirado.
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
