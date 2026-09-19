-- ===========================================================================
-- Cicalino — Historial de mesas cerradas, más allá de la jornada
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: split-payments.sql, liberar-mesas-jornada.sql
--
-- Los datos históricos ya estaban: nada borra mesa_sesiones, pedidos,
-- pagos_mesa ni comensales, y el único purge del cron toca push_subscriptions.
-- Lo que faltaba era una puerta para leerlos: `mesas_cuentas` corta en el
-- inicio de la jornada (`coalesce(cerrada_en, pagada_en) >= v_desde`), así que
-- una mesa cerrada ayer existe en la base pero no hay forma de encontrarla.
--
-- Esto agrega esa puerta SIN tocar `mesas_cuentas`, a propósito: esa función
-- alimenta la pantalla operativa y la capa de alertas, se recarga entera por
-- realtime ante cualquier cambio del salón, y devuelve el `_cuenta_json`
-- completo de cada sesión — once subconsultas por mesa. Servir meses de
-- historia por ahí significaría recargar meses de datos cada vez que alguien
-- llama al mozo.
--
-- Acá van dos funciones nuevas:
--   · mesas_cierres  → la lista, liviana y paginada
--   · mesa_cuenta    → el detalle completo de UNA sesión, bajo demanda
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) El índice de la consulta histórica.
--
--    El que ya existía, `idx_mesa_sesiones_local (local_id, estado,
--    actualizado_en desc)`, no sirve para buscar por rango sobre la fecha de
--    cierre. Este es parcial: solo indexa lo terminado, que es lo único que el
--    historial mira, y así no crece con las mesas abiertas del día.
-- ---------------------------------------------------------------------------
create index if not exists idx_mesa_sesiones_cierre
  on public.mesa_sesiones (local_id, (coalesce(cerrada_en, pagada_en)) desc)
  where estado in ('pagada', 'cerrada');

-- ---------------------------------------------------------------------------
-- 2) La lista.
--
--    Devuelve solo lo que la fila muestra: mesa, hora, estado, consumo,
--    cobrado, métodos y nombres. El detalle no viaja acá.
--
--    `p_estado` filtra por lo que el mozo ve, no por el estado de la sesión:
--    "sin-cobrar" es una mesa cerrada con saldo sin cubrir (invitación de la
--    casa, saldo perdonado), que en la base es `cerrada` igual que una cobrada.
-- ---------------------------------------------------------------------------
create or replace function public.mesas_cierres(
  p_local     uuid,
  p_desde     timestamptz,
  p_hasta     timestamptz,
  p_estado    text default 'todas',
  p_busqueda  text default '',
  p_limite    integer default 20,
  p_offset    integer default 0
)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_q      text := btrim(coalesce(p_busqueda, ''));
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public._staff_puede(p_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return (
    with base as (
      select s.id,
             s.mesa_numero,
             coalesce(s.cerrada_en, s.pagada_en) as cerrado_en,
             s.cerrada_motivo as motivo,
             public._consumo_sesion(s.id) as consumo,
             coalesce((select sum(p.monto_base)
                         from public.pagos_mesa p
                        where p.sesion_id = s.id and p.estado = 'pagado'), 0)::integer as cobrado
        from public.mesa_sesiones s
       where s.local_id = p_local
         and s.estado in ('pagada', 'cerrada')
         and coalesce(s.cerrada_en, s.pagada_en) >= p_desde
         and coalesce(s.cerrada_en, s.pagada_en) < p_hasta
         and (v_q = ''
              or s.mesa_numero::text like v_q || '%'
              or exists (select 1 from public.comensales g
                          where g.sesion_id = s.id and g.nombre ilike '%' || v_q || '%'))
    ),
    filtradas as (
      /* Sin consumo no es una mesa que se pueda revisar: es un escaneo que no
         pidió nada. Mismo criterio que tenía la lista del día. */
      select b.*,
             case when b.cobrado >= b.consumo then 'pagada' else 'sin-cobrar' end as estado
        from base b
       where b.consumo > 0
    ),
    porEstado as (
      select * from filtradas f
       where coalesce(p_estado, 'todas') = 'todas' or f.estado = p_estado
    ),
    pagina as (
      select * from porEstado order by cerrado_en desc limit v_limite offset v_offset
    )
    select json_build_object(
      'total', (select count(*) from porEstado),
      'items', coalesce((
        select json_agg(json_build_object(
                 'id', pg.id,
                 'mesa_numero', pg.mesa_numero,
                 'cerrado_en', pg.cerrado_en,
                 'consumo', pg.consumo,
                 'cobrado', pg.cobrado,
                 'estado', pg.estado,
                 'motivo', pg.motivo,
                 'metodos', (select coalesce(json_agg(distinct p.metodo::text), '[]'::json)
                               from public.pagos_mesa p
                              where p.sesion_id = pg.id and p.estado = 'pagado'),
                 'comensales', (select coalesce(json_agg(g.nombre order by g.creado_en), '[]'::json)
                                  from public.comensales g where g.sesion_id = pg.id))
               order by pg.cerrado_en desc)
          from pagina pg), '[]'::json)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) El detalle de una sesión, bajo demanda.
--
--    `_cuenta_json` ya arma todo —comensales, pedidos con ítems, pagos— desde
--    las tablas vivas, así que una mesa de hace un mes se reconstruye igual
--    que una de hoy. Lo único que faltaba era poder pedirla de a una.
--
--    No expira pagos de Mercado Pago ni toca nada: es de solo lectura, que es
--    justo lo que el historial tiene que ser.
-- ---------------------------------------------------------------------------
create or replace function public.mesa_cuenta(p_sesion uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_local uuid;
begin
  select local_id into v_local from public.mesa_sesiones where id = p_sesion;
  if v_local is null or not public._staff_puede(v_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return public._cuenta_json(p_sesion);
end;
$$;

revoke all on function public.mesas_cierres(uuid, timestamptz, timestamptz, text, text, integer, integer)
  from public, anon;
revoke all on function public.mesa_cuenta(uuid) from public, anon;
grant execute on function public.mesas_cierres(uuid, timestamptz, timestamptz, text, text, integer, integer)
  to authenticated;
grant execute on function public.mesa_cuenta(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: la operativa intacta y las nuevas dadas.
-- ---------------------------------------------------------------------------
select
  has_function_privilege('authenticated', 'public.mesas_cuentas(uuid)', 'EXECUTE') as operativa_intacta,
  has_function_privilege('authenticated',
    'public.mesas_cierres(uuid, timestamptz, timestamptz, text, text, integer, integer)', 'EXECUTE') as historial_ok,
  has_function_privilege('authenticated', 'public.mesa_cuenta(uuid)', 'EXECUTE') as detalle_ok,
  has_function_privilege('anon',
    'public.mesas_cierres(uuid, timestamptz, timestamptz, text, text, integer, integer)', 'EXECUTE') as anon_no_lee;
