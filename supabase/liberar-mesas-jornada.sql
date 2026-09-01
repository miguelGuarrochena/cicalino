-- ===========================================================================
-- Cicalino — Al corte de jornada, el salón queda libre; las reservas no
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: modulo-espera.sql, reservas-mesa.sql, security-fixes-04.sql
--
-- PROBLEMA
-- Las mesas ocupadas no se liberaban solas. Si el local cerraba sin tocar
-- Liberar, a la mañana el mapa seguía lleno. Las reservas de hoy y de los
-- días siguientes viven en `reservas`, no en el estado de la mesa: no hay
-- que “guardar” una mesa ocupada porque el sábado hay una reserva.
--
-- REGLA
-- Si una mesa sigue `ocupada` y su `actualizado_en` es anterior al arranque
-- de la jornada abierta (locales.hora_corte, TZ Argentina, igual que
-- crear_pedido), pasa a libre. No se escribe `reservas`. No se cancelan
-- esperas: las de ayer ya no salen en el listado del día.
--
-- Van dos funciones por el mismo motivo que reservas-expirar.sql: el panel
-- (una sucursal, usuario logueado) y el cron (todas, service_role). El cron
-- cubre el local que no abre el panel a la mañana.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Arranque de jornada. Misma cuenta que crear_pedido en security-fixes-15.
-- No se otorga a clientes: la usan las dos funciones de abajo.
-- ---------------------------------------------------------------------------
create or replace function public.jornada_inicio_corte(p_corte integer)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_corte     integer;
  v_local_now timestamp;
  v_dia       date;
begin
  v_corte := coalesce(p_corte, 6);
  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  v_local_now := timezone('America/Argentina/Buenos_Aires', now());
  if extract(hour from v_local_now)::int < v_corte then
    v_dia := (v_local_now::date - 1);
  else
    v_dia := v_local_now::date;
  end if;

  return ((v_dia::timestamp + make_interval(hours => v_corte))
    at time zone 'America/Argentina/Buenos_Aires');
end;
$$;

revoke all on function public.jornada_inicio_corte(integer)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 1) Panel: una sucursal, con chequeo de acceso.
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

  v_desde := public.jornada_inicio_corte(v_corte);

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

comment on function public.liberar_mesas_jornada_local(uuid) is
  'Libera mesas ocupadas de jornadas anteriores. No toca reservas.';


-- ---------------------------------------------------------------------------
-- 2) Cron: todas las sucursales. Sin chequeo de sesión porque no hay.
-- ---------------------------------------------------------------------------
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
    select id, hora_corte from public.locales
  loop
    v_desde := public.jornada_inicio_corte(r.hora_corte);

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

comment on function public.liberar_mesas_jornada() is
  'Barrido global al corte: salón libre, reservas intactas. Solo cron.';


-- ---------------------------------------------------------------------------
-- Índice del barrido: ocupadas por sucursal + cuándo se ocuparon.
-- ---------------------------------------------------------------------------
create index if not exists idx_mesas_ocupadas_actualizado
  on public.mesas (local_id, actualizado_en)
  where estado = 'ocupada';
