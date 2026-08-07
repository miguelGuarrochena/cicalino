-- ===========================================================================
-- Cicalino — Vencimiento de reservas en la base
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
--
-- PROBLEMA
-- Las reservas vencían así: el panel traía todas las reservas activas de la
-- sucursal, calculaba en JS cuáles pasaron la hora más la gracia, y mandaba
-- un update con esos ids.
--
-- Dos cosas mal:
--
--  1. Solo pasaba si alguien tenía el panel abierto. Si el local cerró con
--     reservas activas, al día siguiente seguían figurando como activas y
--     bloqueando la mesa. El estado de la base dependía de que hubiera una
--     pestaña abierta.
--
--  2. Bajaba filas para filtrarlas afuera, cuando es un solo UPDATE.
--
-- Van dos funciones porque son dos llamadores con permisos distintos: el
-- panel (usuario logueado, una sucursal) y el cron (service_role, todas).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Para el panel: vence las de UNA sucursal, con chequeo de acceso.
-- ---------------------------------------------------------------------------
create or replace function public.expirar_reservas_local(p_local uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  update public.reservas
     set estado = 'expirada',
         expirado_en = now()
   where local_id = p_local
     and estado = 'activa'
     and now() > horario + make_interval(mins => coalesce(gracia_minutos, 15));

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2) Para el cron: todas las sucursales, sin chequeo de sesión porque no hay.
--    Por eso se le revoca el execute a authenticated: solo la llama el
--    service_role, que es quien corre el cron.
-- ---------------------------------------------------------------------------
create or replace function public.expirar_reservas_vencidas()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  update public.reservas
     set estado = 'expirada',
         expirado_en = now()
   where estado = 'activa'
     and now() > horario + make_interval(mins => coalesce(gracia_minutos, 15));

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.expirar_reservas_local(uuid) to authenticated;
revoke execute on function public.expirar_reservas_vencidas() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) El índice que usa el barrido global. El que ya existía
--    (idx_reservas_local_estado) sirve para la versión por sucursal, pero el
--    cron mira todas, así que necesita uno por estado + horario.
-- ---------------------------------------------------------------------------
create index if not exists idx_reservas_activas_horario
  on public.reservas (horario)
  where estado = 'activa';


-- ---------------------------------------------------------------------------
-- 4) Chequeo: cuántas reservas quedaron colgadas sin vencer.
--    Si este número es alto, son las que se acumularon mientras el
--    vencimiento dependía de tener el panel abierto.
-- ---------------------------------------------------------------------------
select count(*) as activas_vencidas
from public.reservas
where estado = 'activa'
  and now() > horario + make_interval(mins => coalesce(gracia_minutos, 15));
