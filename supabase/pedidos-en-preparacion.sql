-- ===========================================================================
-- Cicalino — Paso automático a en_preparacion
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: security-fixes-02.sql, security-fixes-04.sql, metricas-tramos-global.sql
--
-- PROBLEMA
-- `en_preparacion` existía en el enum, en el trigger de transiciones, en las
-- RPC de listado y hasta en el polling del cliente —que le dedica un escalón
-- propio de 3 s contra los 8 s de `creado`— pero nada lo escribía nunca. El
-- único camino real era creado → listo, así que ese escalón era inalcanzable
-- y todo pedido detectaba el "listo" con hasta 8 s de retraso.
--
-- REGLA
-- Si al minuto el pedido sigue sin estar listo, pasa solo a en_preparacion.
-- El que sale antes del minuto nunca pasa por ese estado. El mostrador no
-- toca ningún botón de más: crea y después marca listo, como hasta ahora.
--
-- POR QUÉ ACÁ Y NO EN EL PANEL
-- El panel escribe con la anon key, así que la regla vive en la base. Y va
-- como UPDATE con `where estado = 'creado'`: es un compare-and-swap, dos
-- cajas corriéndolo a la vez no se pisan (la segunda toca 0 filas) y el
-- trigger `pedidos_transicion` sigue validando el salto.
--
-- Van dos funciones por el mismo motivo que en reservas-expirar.sql: son dos
-- llamadores con permisos distintos, el panel (usuario logueado, una
-- sucursal) y el cron (service_role, todas).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Para el panel: una sucursal, con chequeo de acceso.
-- ---------------------------------------------------------------------------
create or replace function public.marcar_en_preparacion_local(p_local uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  update public.pedidos
     set estado = 'en_preparacion',
         en_preparacion_en = now()
   where local_id = p_local
     and estado = 'creado'
     and creado_en <= now() - interval '1 minute';

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2) Para el cron: todas las sucursales. Sin chequeo de sesión porque no hay,
--    por eso se le revoca el execute a authenticated.
--
--    No es solo por prolijidad: el panel puede estar cerrado (una caja que
--    apaga la tablet, un local con el módulo en otro dispositivo) y sin esto
--    esos pedidos se quedarían en `creado` para siempre, que es justo el
--    estado inconsistente que queremos evitar.
-- ---------------------------------------------------------------------------
create or replace function public.marcar_en_preparacion_pendientes()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  update public.pedidos
     set estado = 'en_preparacion',
         en_preparacion_en = now()
   where estado = 'creado'
     and creado_en <= now() - interval '1 minute';

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.marcar_en_preparacion_local(uuid) to authenticated;
revoke execute on function public.marcar_en_preparacion_pendientes()
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) El índice del barrido. `idx_pedidos_local_estado` sirve para la versión
--    por sucursal; el barrido global mira todas, así que necesita uno por
--    creado_en acotado a los que todavía están en `creado`.
-- ---------------------------------------------------------------------------
create index if not exists idx_pedidos_creado_pendientes
  on public.pedidos (creado_en)
  where estado = 'creado';


-- ---------------------------------------------------------------------------
-- 4) Métricas.
--
-- Esto va acá y no en un script aparte porque lo rompe este cambio: `enCurso`
-- contaba solo `estado = 'creado'`, así que apenas los pedidos empiecen a
-- pasar a `en_preparacion` el indicador "En cola ahora" arrancaría a
-- descontarlos y mostraría menos de los que hay.
--
-- De paso quedan registrados los dos tramos que antes no se podían separar:
--
--   colaMin   creado → en_preparacion
--   cocinaMin en_preparacion → listo
--   prepMin   creado → listo (el total, el que ya estaba)
--
-- Y `sinPreparacion`, que es el dato con señal de verdad: cuántos pedidos se
-- resolvieron en el mostrador sin llegar a pasar por preparación. Ojo que
-- solo es confiable para períodos posteriores a esta migración: los pedidos
-- viejos tienen en_preparacion_en en null porque nadie lo escribía.
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
      estado, creado_en, en_preparacion_en, listo_en, retirado_en,
      public.bucket_metrica(creado_en, p_desde, p_periodo, p_tz) as bucket,
      -- null cuando el pedido no llegó a listo o el reloj vino al revés.
      case
        when listo_en is not null and listo_en >= creado_en
          then extract(epoch from (listo_en - creado_en)) / 60
      end as espera_min,
      -- Solo sobre pedidos que llegaron a listo. Uno abandonado en `creado`
      -- toda la noche lo marca el barrido del cron a la mañana siguiente, y
      -- sin este `listo_en is not null` esas horas entrarían al promedio.
      case
        when en_preparacion_en is not null and listo_en is not null
         and en_preparacion_en >= creado_en
          then extract(epoch from (en_preparacion_en - creado_en)) / 60
      end as cola_min,
      case
        when listo_en is not null and en_preparacion_en is not null
         and listo_en >= en_preparacion_en
          then extract(epoch from (listo_en - en_preparacion_en)) / 60
      end as cocina_min
    from public.pedidos
    where local_id = any(p_locales)
      and creado_en >= p_desde
  )
  select json_build_object(
    'total',     count(*),
    'avisados',  count(*) filter (where estado in ('listo', 'retirado')),
    'enCurso',   count(*) filter (where estado in ('creado', 'en_preparacion')),
    -- avg ignora los null, así que prepMin y tramos cuentan las mismas filas.
    'prepMin',   avg(espera_min),
    'colaMin',   avg(cola_min),
    'cocinaMin', avg(cocina_min),
    'sinPreparacion', count(*) filter (
      where espera_min is not null and en_preparacion_en is null
    ),
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
-- 5) Chequeo: cuántos pedidos quedaron en `creado` pasado el minuto.
--    Si este número crece, el barrido no está corriendo.
-- ---------------------------------------------------------------------------
select count(*) as creados_vencidos
from public.pedidos
where estado = 'creado'
  and creado_en <= now() - interval '1 minute';
