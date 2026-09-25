-- ===========================================================================
-- Cicalino — Modalidades de Pedidos combinables: mostrador (tradicional o QR)
-- y Mesa, por separado
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: pedidos-mostrador-qr-metodos.sql
--
-- Hasta acá `locales.pedidos_modalidad` era una sola elección entre
-- 'mostrador', 'mesa' y 'mostrador_qr': Mesa reemplazaba al mostrador y no se
-- podía tener, por ejemplo, mostrador QR y además pedidos desde la mesa.
--
-- Ahora son dos cosas:
--   pedidos_modalidad  cómo funciona el MOSTRADOR, una sola forma:
--                        mostrador      tradicional: el empleado carga el pedido
--                        mostrador_qr   QR general: el cliente carga el suyo
--                        sin_mostrador  no se toman pedidos de mostrador
--   pedidos_mesa       Mesa prendida o apagada, independiente del mostrador.
--
-- Combinaciones válidas: tradicional · tradicional + Mesa · QR · QR + Mesa ·
-- Mesa. Tradicional + QR no se puede expresar (es una sola columna), y "sin
-- mostrador y sin Mesa" lo impide un constraint.
--
-- La lógica de Mesa y del mostrador QR no cambia: sus funciones siguen
-- preguntando local_pedidos_mesa / local_pedidos_mostrador_qr. Lo único nuevo
-- es que crear_pedido (la carga tradicional) solo anda en modo tradicional.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) Columnas y datos
-- ---------------------------------------------------------------------------
alter table public.locales
  add column if not exists pedidos_mesa boolean not null default false;

alter table public.locales
  drop constraint if exists locales_pedidos_modalidad_valida,
  drop constraint if exists locales_pedidos_alguna_modalidad;

/* Quien tenía "Mesa" la sigue teniendo, sin mostrador (como hasta ahora). */
update public.locales
   set pedidos_mesa = true,
       pedidos_modalidad = 'sin_mostrador'
 where pedidos_modalidad = 'mesa';

alter table public.locales
  add constraint locales_pedidos_modalidad_valida
    check (pedidos_modalidad in ('mostrador', 'mostrador_qr', 'sin_mostrador')),
  add constraint locales_pedidos_alguna_modalidad
    check (pedidos_modalidad <> 'sin_mostrador' or pedidos_mesa);

comment on column public.locales.pedidos_modalidad is
  'Cómo funciona el mostrador de Pedidos: mostrador (tradicional, la caja carga el pedido), mostrador_qr (un QR del local; el cliente carga el suyo) o sin_mostrador (solo Mesa).';
comment on column public.locales.pedidos_mesa is
  'Pedidos en modalidad Mesa (el cliente pide y paga desde el QR de su mesa). Independiente del mostrador.';


-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------

/* Mesa ahora sale de su propia columna. */
create or replace function public.local_pedidos_mesa(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.local_tiene_modulo(p_local, 'pedidos')
     and coalesce((select l.pedidos_mesa from public.locales l where l.id = p_local), false);
$$;

/* El mostrador tradicional: el empleado carga el pedido. */
create or replace function public.local_pedidos_tradicional(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select l.pedidos_modalidad = 'mostrador' from public.locales l where l.id = p_local
  ), false);
$$;

revoke all on function public.local_pedidos_tradicional(uuid) from public, anon;
grant execute on function public.local_pedidos_tradicional(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2) crear_pedido (dias-cerrados-jornada.sql + solo en modo tradicional).
--    En mostrador QR los pedidos de mostrador los carga el cliente, y con solo
--    Mesa no hay mostrador: cargar uno a mano mezclaría los dos mecanismos.
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
  if not public.local_pedidos_tradicional(p_local) then
    return json_build_object('ok', false, 'reason', 'mostrador-no-tradicional');
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

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: true, true, 0.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'locales'
             and column_name = 'pedidos_mesa') as columna_mesa,
  exists (select 1 from pg_constraint where conname = 'locales_pedidos_alguna_modalidad') as alguna_modalidad,
  (select count(*) from public.locales where pedidos_modalidad = 'mesa') as quedan_mesa_viejas;
