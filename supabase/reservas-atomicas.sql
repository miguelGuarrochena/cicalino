-- ===========================================================================
-- Cicalino — Atomic booking creation and table syncing
-- Requiere: security-fixes-01.sql, modulo-espera.sql, reservas-mesa.sql
-- Orden sugerido: #14 de 39 (ver chequeo-migraciones.sql)
-- Run in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- PROBLEM 1: two hosts could book the same table for the same slot
-- `insertReservation` read the active bookings, ran the conflict check in JS,
-- and then inserted. Classic check-then-act: two people booking table 5 for
-- 21:00 from two devices both read a clean slate, both pass the check, and
-- both inserts succeed. Nothing in the database says no.
--
-- PROBLEM 2: syncing tables raced with itself
-- `syncTables` read which table numbers existed, worked out the missing ones
-- and inserted them. Two tabs opening the panel at the same time computed the
-- same missing list and both tried to insert it. The unique index caught the
-- second one, but the error was discarded and the function carried on as if
-- nothing had happened.
--
-- FIX
-- Both move into functions, which are one transaction each.
--
-- For bookings the lock is `pg_advisory_xact_lock`, scoped to the branch. It's
-- transaction-scoped on purpose: PostgREST pools connections, so a
-- session-scoped lock could be released on a different connection than the one
-- that took it. This one goes away on commit no matter what.
--
-- Bookings are low-frequency, so serialising them per branch costs nothing.
--
-- WHAT THIS DOESN'T FIX
-- A real exclusion constraint would be better than a lock, but `mesas_numeros`
-- is an array and a proper one needs the table list normalised into its own
-- table. Worth doing, but it's a bigger migration than this.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Minimum gap between two bookings on the same table.
--
-- Mirrors MIN_GAP_BETWEEN_RESERVATIONS in src/lib/reservations.ts. Change one
-- and you have to change the other.
-- ---------------------------------------------------------------------------
create or replace function public.reservas_gap_minutos()
returns integer language sql immutable as $$ select 90 $$;


-- ---------------------------------------------------------------------------
-- Create a booking.
--
-- Returns { ok: true, reserva: {...} } or { ok: false, reason: '...' }.
-- Every check runs before any write, so an early return leaves nothing behind.
-- ---------------------------------------------------------------------------
create or replace function public.crear_reserva(
  p_local    uuid,
  p_mesas    integer[],
  p_nombre   text,
  p_personas integer,
  p_horario  timestamptz,
  p_gracia   integer,
  p_empleado uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_mesas    integer[];
  v_existen  integer;
  v_cap      integer;
  v_personas integer;
  v_nombre   text;
  v_gracia   integer;
  v_choque   uuid;
  v_reserva  public.reservas%rowtype;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  select coalesce(array_agg(distinct n order by n), '{}')
    into v_mesas
    from unnest(coalesce(p_mesas, '{}')) as n
   where n >= 1;

  if array_length(v_mesas, 1) is null then
    return json_build_object('ok', false, 'reason', 'sin-mesas');
  end if;

  if p_horario is null then
    return json_build_object('ok', false, 'reason', 'sin-horario');
  end if;

  /* Serialise booking creation for this branch. Everything below — the
   * conflict check and the insert — now happens with nobody else in the
   * middle. Releases on commit. */
  perform pg_advisory_xact_lock(hashtext('reserva:' || p_local::text));

  select count(*), coalesce(sum(capacidad), 0)
    into v_existen, v_cap
    from public.mesas
   where local_id = p_local
     and numero = any(v_mesas);

  if v_existen <> array_length(v_mesas, 1) then
    return json_build_object('ok', false, 'reason', 'mesa-inexistente');
  end if;

  v_personas := greatest(1, least(50, coalesce(nullif(p_personas, 0), 2)));

  if v_cap < v_personas then
    return json_build_object(
      'ok', false, 'reason', 'capacidad-insuficiente', 'capacidad', v_cap);
  end if;

  -- Another active booking too close in time on any of the same tables.
  select r.id into v_choque
    from public.reservas r
   where r.local_id = p_local
     and r.estado = 'activa'
     and (r.mesa_numero = any(v_mesas) or r.mesas_numeros && v_mesas)
     and abs(extract(epoch from (r.horario - p_horario)) / 60)
         < public.reservas_gap_minutos()
   order by r.horario
   limit 1;

  if v_choque is not null then
    return json_build_object('ok', false, 'reason', 'choque', 'reservaId', v_choque);
  end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  v_nombre := left(coalesce(v_nombre, 'Reserva'), 80);
  v_gracia := case when p_gracia = 20 then 20 else 15 end;

  insert into public.reservas (
    local_id, nombre, personas, mesa_numero, mesas_numeros,
    horario, gracia_minutos, estado, empleado_id
  ) values (
    p_local, v_nombre, v_personas, v_mesas[1], v_mesas,
    p_horario, v_gracia, 'activa', p_empleado
  )
  returning * into v_reserva;

  return json_build_object(
    'ok', true,
    'reserva', json_build_object(
      'id', v_reserva.id,
      'nombre', v_reserva.nombre,
      'personas', v_reserva.personas,
      'mesa_numero', v_reserva.mesa_numero,
      'mesas_numeros', v_reserva.mesas_numeros,
      'horario', v_reserva.horario,
      'gracia_minutos', v_reserva.gracia_minutos,
      'estado', v_reserva.estado,
      'creado_en', v_reserva.creado_en,
      'sentado_en', v_reserva.sentado_en,
      'cancelado_en', v_reserva.cancelado_en,
      'expirado_en', v_reserva.expirado_en
    )
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- Sync the table list to `cantidad` tables.
--
-- Creates the missing ones and removes the extras, but only if the extra is
-- actually free. The old version checked `estado = 'libre'` and nothing else,
-- so a table sitting at 'libre' but still linked to a waitlist entry could be
-- deleted out from under it.
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_mesas(
  p_local    uuid,
  p_cantidad integer
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_n         integer;
  v_creadas   integer;
  v_borradas  integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  v_n := greatest(1, least(500, coalesce(p_cantidad, 1)));

  insert into public.mesas (local_id, numero, estado, capacidad)
  select p_local, g, 'libre', 4
    from generate_series(1, v_n) as g
  on conflict (local_id, numero) do nothing;
  get diagnostics v_creadas = row_count;

  delete from public.mesas m
   where m.local_id = p_local
     and m.numero > v_n
     and m.estado = 'libre'
     and m.espera_id is null
     and m.reserva_id is null;
  get diagnostics v_borradas = row_count;

  return json_build_object('ok', true, 'creadas', v_creadas, 'borradas', v_borradas);
end;
$$;


grant execute on function public.reservas_gap_minutos() to authenticated;
grant execute on function public.crear_reserva(uuid, integer[], text, integer, timestamptz, integer, uuid) to authenticated;
grant execute on function public.sincronizar_mesas(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Check: active bookings that already overlap on the same table.
-- These are the ones the old check-then-act let through.
-- ---------------------------------------------------------------------------
select a.local_id,
       a.id as reserva_a, a.horario as horario_a,
       b.id as reserva_b, b.horario as horario_b
from public.reservas a
join public.reservas b
  on b.local_id = a.local_id
 and b.id > a.id
 and b.estado = 'activa'
 and (b.mesa_numero = a.mesa_numero
      or b.mesas_numeros && a.mesas_numeros)
 and abs(extract(epoch from (b.horario - a.horario)) / 60) < 90
where a.estado = 'activa'
order by a.local_id, a.horario;
