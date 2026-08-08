-- ===========================================================================
-- Cicalino — Seat a walk-in atomically
-- Requiere: security-fixes-01.sql, modulo-espera.sql, reservas-mesa.sql
-- Orden sugerido: #15 de 39 (ver chequeo-migraciones.sql)
-- Run in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- PROBLEM 1: it wasn't atomic
-- `seatWalkIn` was a sequence of separate requests against PostgREST: read the
-- tables, insert the waitlist entry, then mark each table in a loop. If table
-- 3 of 4 failed, it tried to undo the previous ones by hand.
--
-- When that manual rollback failed too (network dropped, the release update
-- errored), tables were left as 'ocupada' pointing at a waitlist entry that no
-- longer existed. Since the FK is `on delete set null`, the table ends up
-- occupied with a null espera_id: occupied forever, with no way to free it
-- from the panel. Someone had to go into the database by hand.
--
-- PROBLEM 2: two counters stepped on each other
-- Between "I read that the table is free" and "I mark it occupied" there was a
-- window where another device could seat someone at the same table. Both
-- requests succeeded and the second entry overwrote the first.
--
-- PROBLEM 3: it ignored reservations
-- It only checked that the table was free. A table booked for 21:00 still
-- looked free at 21:05, so a walk-in could take it right when the person who
-- booked was arriving within their grace period.
--
-- FIX
-- Everything inside one function, which in Postgres is a single transaction:
-- it all happens or none of it does. Plus `for update` on the tables, which is
-- what closes the window between the check and the write.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Is this table held by a reservation currently inside its grace period?
--
-- The rule: from the booking time until booking time + grace, the table
-- belongs to whoever booked it. Once the grace period is over the cron expires
-- the reservation and the table frees up; if the guest shows up after that,
-- they get seated as a new walk-in.
--
-- This is derived state, not stored: no field to maintain and no job to flip
-- `mesas.estado = 'reservada'` on and off.
-- ---------------------------------------------------------------------------
create or replace function public.mesa_en_ventana_de_reserva(
  p_local uuid,
  p_mesas integer[]
)
returns uuid
language sql stable set search_path = public as $$
  select r.id
    from public.reservas r
   where r.local_id = p_local
     and r.estado = 'activa'
     and now() >= r.horario
     and now() <= r.horario + make_interval(mins => coalesce(r.gracia_minutos, 15))
     and (r.mesa_numero = any(p_mesas) or r.mesas_numeros && p_mesas)
   order by r.horario
   limit 1;
$$;


-- ---------------------------------------------------------------------------
-- Seat a walk-in.
--
-- Returns json: { ok: true, espera: {...} } or { ok: false, reason: '...' }.
-- Rejections come back as a reason instead of raising so the panel can tell
-- the user what happened. Every check runs BEFORE any write, so returning
-- early never leaves things half done.
-- ---------------------------------------------------------------------------
create or replace function public.sentar_walkin(
  p_local    uuid,
  p_mesas    integer[],
  p_nombre   text,
  p_personas integer,
  p_empleado uuid,
  p_expira   timestamptz
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_mesas    integer[];
  v_libres   integer;
  v_cap      integer;
  v_personas integer;
  v_nombre   text;
  v_reserva  uuid;
  v_espera   public.esperas%rowtype;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  -- Normalize: no duplicates, no invalid numbers, sorted.
  select coalesce(array_agg(distinct n order by n), '{}')
    into v_mesas
    from unnest(coalesce(p_mesas, '{}')) as n
   where n >= 1;

  if array_length(v_mesas, 1) is null then
    return json_build_object('ok', false, 'reason', 'sin-mesas');
  end if;

  /* The lock is the whole point: it holds these rows from the check until
   * commit, so another counter trying the same tables waits here and then
   * sees the updated state. */
  perform 1
     from public.mesas
    where local_id = p_local
      and numero = any(v_mesas)
    for update;

  select count(*) filter (where estado = 'libre'), coalesce(sum(capacidad), 0)
    into v_libres, v_cap
    from public.mesas
   where local_id = p_local
     and numero = any(v_mesas);

  if v_libres is null or v_libres <> array_length(v_mesas, 1) then
    -- Either one doesn't exist or one isn't free. Same thing for the panel:
    -- reload and pick again.
    return json_build_object('ok', false, 'reason', 'mesa-no-disponible');
  end if;

  v_reserva := public.mesa_en_ventana_de_reserva(p_local, v_mesas);
  if v_reserva is not null then
    return json_build_object(
      'ok', false, 'reason', 'mesa-reservada', 'reservaId', v_reserva);
  end if;

  v_personas := greatest(1, least(50, coalesce(nullif(p_personas, 0), v_cap)));
  v_nombre   := nullif(btrim(coalesce(p_nombre, '')), '');
  v_nombre   := left(coalesce(v_nombre, 'Walk-in'), 80);

  insert into public.esperas (
    local_id, nombre, personas, estado, mesa_numero,
    empleado_id, qr_token, qr_expira_en, sentado_en
  ) values (
    p_local, v_nombre, v_personas, 'sentado', v_mesas[1],
    p_empleado, gen_random_uuid()::text, p_expira, now()
  )
  returning * into v_espera;

  update public.mesas
     set estado = 'ocupada',
         espera_id = v_espera.id,
         reserva_id = null,
         actualizado_en = now()
   where local_id = p_local
     and numero = any(v_mesas);

  return json_build_object(
    'ok', true,
    'espera', json_build_object(
      'id', v_espera.id,
      'nombre', v_espera.nombre,
      'personas', v_espera.personas,
      'estado', v_espera.estado,
      'mesa_numero', v_espera.mesa_numero,
      'qr_token', v_espera.qr_token,
      'creado_en', v_espera.creado_en,
      'avisado_en', v_espera.avisado_en,
      'sentado_en', v_espera.sentado_en,
      'cancelado_en', v_espera.cancelado_en,
      'visto_en', v_espera.visto_en
    )
  );
end;
$$;

grant execute on function public.mesa_en_ventana_de_reserva(uuid, integer[]) to authenticated;
grant execute on function public.sentar_walkin(uuid, integer[], text, integer, uuid, timestamptz) to authenticated;


-- ---------------------------------------------------------------------------
-- Clean up tables stranded by the old bug: occupied, but with no waitlist
-- entry or reservation backing them. There is no way to free these from the
-- panel.
--
-- Check the count first; if the number makes sense, uncomment the update.
-- ---------------------------------------------------------------------------
select count(*) as mesas_ocupadas_sin_respaldo
from public.mesas m
where m.estado = 'ocupada'
  and m.espera_id is null
  and m.reserva_id is null;

-- update public.mesas
--    set estado = 'libre', actualizado_en = now()
--  where estado = 'ocupada' and espera_id is null and reserva_id is null;
