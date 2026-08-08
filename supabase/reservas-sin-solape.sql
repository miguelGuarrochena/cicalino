-- ===========================================================================
-- Cicalino — Stop two bookings landing on the same table, for good
-- Requiere: security-fixes-01.sql, modulo-espera.sql, reservas-mesa.sql, reservas-atomicas.sql, corte-por-impago.sql
-- Orden sugerido: #33 de 39 (ver chequeo-migraciones.sql)
-- Run in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- WHERE WE LEFT IT
-- `crear_reserva` takes a per-branch advisory lock, so the conflict check and
-- the insert can't interleave. That closed the race, but it only protects the
-- one code path: anything writing to `reservas` some other way — the SQL
-- editor, a future endpoint, a fixup script — walks straight past it.
--
-- WHY IT COULDN'T BE A CONSTRAINT BEFORE
-- The tables of a booking live in `mesas_numeros`, an integer[]. An exclusion
-- constraint needs one row per (table, time window) to compare, and it can't
-- reach inside an array to do it.
--
-- WHAT THIS DOES
-- Adds `reserva_mesas`: one row per table per booking, with the window the
-- booking blocks. It's derived, not a second source of truth — a trigger keeps
-- it in step with `reservas`, which stays the table people read and write.
--
-- The window is the booking time ±45 minutes, half the 90-minute gap. Two
-- bookings exactly 90 apart give ranges that touch but don't overlap; at 89
-- they overlap and the database says no.
--
-- ⚠️ Run block 0 first. If it comes back with rows, the constraint in block 4
--    will fail — and it should, because those are bookings that shouldn't
--    coexist.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) Bookings that already clash. These got in before there was anything
--    stopping them.
-- ---------------------------------------------------------------------------
select
  l.nombre as sucursal,
  a.id as reserva_a, a.nombre as nombre_a, a.horario as horario_a,
  b.id as reserva_b, b.nombre as nombre_b, b.horario as horario_b,
  round(abs(extract(epoch from (b.horario - a.horario)) / 60)) as minutos_de_diferencia
from public.reservas a
join public.reservas b
  on b.local_id = a.local_id
 and b.id > a.id
 and b.estado = 'activa'
 and (b.mesa_numero = a.mesa_numero or b.mesas_numeros && a.mesas_numeros)
 and abs(extract(epoch from (b.horario - a.horario)) / 60) < 90
join public.locales l on l.id = a.local_id
where a.estado = 'activa'
order by l.nombre, a.horario;


-- ---------------------------------------------------------------------------
-- 1) btree_gist: lets an exclusion constraint mix plain equality (local_id,
--    numero) with range overlap (&&) in the same index.
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;


-- ---------------------------------------------------------------------------
-- 2) The derived table.
-- ---------------------------------------------------------------------------
create table if not exists public.reserva_mesas (
  reserva_id uuid not null
    references public.reservas (id) on delete cascade,
  local_id   uuid not null
    references public.locales (id) on delete cascade,
  numero     integer not null,
  ventana    tstzrange not null,
  primary key (reserva_id, numero)
);

-- Nobody reads this from the client; it exists for the constraint.
alter table public.reserva_mesas enable row level security;


-- ---------------------------------------------------------------------------
-- 3) Keep it in step with `reservas`.
--
-- Only active bookings get rows: cancelling or expiring one frees its tables,
-- which is what deleting the rows expresses.
-- ---------------------------------------------------------------------------
create or replace function public.sync_reserva_mesas()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_nums  integer[];
  v_media integer := public.reservas_gap_minutos() / 2;
begin
  delete from public.reserva_mesas where reserva_id = new.id;

  if new.estado <> 'activa' then
    return new;
  end if;

  v_nums := case
    when coalesce(array_length(new.mesas_numeros, 1), 0) > 0
      then new.mesas_numeros
    else array[new.mesa_numero]
  end;

  insert into public.reserva_mesas (reserva_id, local_id, numero, ventana)
  select
    new.id,
    new.local_id,
    n,
    tstzrange(
      new.horario - make_interval(mins => v_media),
      new.horario + make_interval(mins => v_media),
      '[)'
    )
  from unnest(v_nums) as n
  where n >= 1;

  return new;
end;
$$;

drop trigger if exists reservas_sync_mesas on public.reservas;
create trigger reservas_sync_mesas
  after insert or update of estado, mesa_numero, mesas_numeros, horario, local_id
  on public.reservas
  for each row execute function public.sync_reserva_mesas();


-- Backfill. Safe to re-run: it rebuilds every row from `reservas`.
truncate public.reserva_mesas;
insert into public.reserva_mesas (reserva_id, local_id, numero, ventana)
select
  r.id,
  r.local_id,
  n,
  tstzrange(
    r.horario - make_interval(mins => public.reservas_gap_minutos() / 2),
    r.horario + make_interval(mins => public.reservas_gap_minutos() / 2),
    '[)'
  )
from public.reservas r
cross join lateral unnest(
  case
    when coalesce(array_length(r.mesas_numeros, 1), 0) > 0 then r.mesas_numeros
    else array[r.mesa_numero]
  end
) as n
where r.estado = 'activa'
  and n >= 1
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 4) The constraint.
--
-- ⚠️ Run this block on its own, after checking block 0 is empty. If there are
--    existing clashes it fails — cancel or move one of each pair first, then
--    come back.
-- ---------------------------------------------------------------------------
alter table public.reserva_mesas
  drop constraint if exists reserva_mesas_sin_solape;

alter table public.reserva_mesas
  add constraint reserva_mesas_sin_solape
  exclude using gist (
    local_id with =,
    numero   with =,
    ventana  with &&
  );


-- ---------------------------------------------------------------------------
-- 5) crear_reserva translates the constraint into an answer the panel can
--    show. The check it already does stays: it catches the common case with a
--    friendlier message and without burning a failed insert. The constraint is
--    what makes it a guarantee rather than a convention.
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
  if not public.local_operativo(p_local) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
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

  begin
    insert into public.reservas (
      local_id, nombre, personas, mesa_numero, mesas_numeros,
      horario, gracia_minutos, estado, empleado_id
    ) values (
      p_local, v_nombre, v_personas, v_mesas[1], v_mesas,
      p_horario, v_gracia, 'activa', p_empleado
    )
    returning * into v_reserva;
  exception
    -- 23P01 = exclusion_violation. Got past the check above, so something
    -- wrote to `reservas` outside this function.
    when exclusion_violation then
      return json_build_object('ok', false, 'reason', 'choque');
  end;

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
-- 6) Check: the derived table should have one row per table of every active
--    booking, and nothing else.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.reservas where estado = 'activa') as reservas_activas,
  (select count(distinct reserva_id) from public.reserva_mesas) as reservas_en_el_indice,
  (select count(*) from public.reserva_mesas) as filas_mesa_reserva,
  (select count(*) from public.reserva_mesas rm
     left join public.reservas r on r.id = rm.reserva_id
    where r.id is null or r.estado <> 'activa') as filas_huerfanas;
