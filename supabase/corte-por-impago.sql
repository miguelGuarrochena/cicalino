-- ===========================================================================
-- Cicalino — Stop expired accounts from writing
-- Requiere: setup.sql, security-fixes-01.sql, modulo-espera.sql, reservas-mesa.sql, reservas-atomicas.sql, sentar-walkin.sql
-- Orden sugerido: #16 de 39 (ver chequeo-migraciones.sql)
-- Run in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- ⚠️ THIS ONE CUTS PEOPLE OFF. Run block 0 first and read the list before
--    running anything else.
--
-- PROBLEM
-- The cron marks accounts `estado_suscripcion = 'expired'` once the trial ends
-- and the five grace days run out, the operator can flip `activo = false`, and
-- `savePayment` flips both back on payment. All of that already works.
--
-- What was missing is that none of it did anything. No RLS policy looked at
-- `activo`, `pagado` or `estado_suscripcion`, and no insert checked them
-- either. An account that stopped paying six months ago kept taking orders,
-- notifying customers and using the waitlist exactly like a paying one. The
-- banners in the panel were text.
--
-- FIX
-- Writes need the account to be live. Reads don't.
--
-- Only `with check` gets the new condition, never `using`. That distinction is
-- the whole design: a cut-off shop keeps seeing its history, its metrics and
-- its own data, and gets everything back the moment a payment is registered.
-- Taking their data away would be a different, much worse product decision.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) WHO GETS CUT OFF RIGHT NOW. Run this on its own, first.
--
-- Every branch listed here stops being able to take orders the moment the
-- policies below are in place. Read it before going further: if a name shows
-- up that shouldn't, fix the account (register the payment, or flip `activo`)
-- BEFORE running the rest.
-- ---------------------------------------------------------------------------
select
  o.nombre            as empresa,
  o.dueno_email       as email,
  l.nombre            as sucursal,
  o.activo,
  o.pagado,
  o.estado_suscripcion,
  o.proxima_factura,
  case
    when not o.activo and o.contrato_aceptado_en is null
      then 'nunca activada (falta contrato)'
    when not o.activo then 'pausada a mano'
    when o.estado_suscripcion = 'expired' then 'vencida por falta de pago'
  end as motivo
from public.organizaciones o
join public.locales l on l.organizacion_id = o.id
where not o.activo
   or o.estado_suscripcion = 'expired'
order by motivo, o.nombre, l.nombre;


-- ---------------------------------------------------------------------------
-- 1) Can this branch still write?
--
-- Superadmin always can, so support can keep working on a cut-off account
-- (including while impersonating the owner).
-- ---------------------------------------------------------------------------
create or replace function public.local_operativo(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_rol()::text = 'superadmin'
      or exists (
           select 1
             from public.locales l
             join public.organizaciones o on o.id = l.organizacion_id
            where l.id = p_local
              and o.activo
              and coalesce(o.estado_suscripcion, 'active') <> 'expired'
         );
$$;

grant execute on function public.local_operativo(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 2) Policies.
--
-- `using` stays as it was: same rows visible as before, nothing disappears.
-- `with check` gains the new condition, so inserts and updates stop.
--
-- Note DELETE only consults `using`, so a cut-off account can still delete its
-- own rows. Left as is on purpose — this is about stopping them running the
-- business on an unpaid account, not about locking their data away.
-- ---------------------------------------------------------------------------
drop policy if exists "pedidos de mi scope" on public.pedidos;
create policy "pedidos de mi scope" on public.pedidos
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id)
                   and public.local_operativo(local_id));

drop policy if exists "esperas de mi scope" on public.esperas;
create policy "esperas de mi scope" on public.esperas
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id)
                   and public.local_operativo(local_id));

drop policy if exists "mesas de mi scope" on public.mesas;
create policy "mesas de mi scope" on public.mesas
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id)
                   and public.local_operativo(local_id));

drop policy if exists "reservas de mi scope" on public.reservas;
create policy "reservas de mi scope" on public.reservas
  for all  using (public.puede_ver_local(local_id))
       with check (public.puede_ver_local(local_id)
                   and public.local_operativo(local_id));


-- ---------------------------------------------------------------------------
-- 3) The functions that write with `security definer` bypass RLS entirely, so
--    they need the check spelled out. Otherwise seating a walk-in would still
--    work on a cut-off account while adding an order wouldn't.
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
-- 4) Check: try it against a branch you know is cut off. It should return
--    false for a normal user and true for a superadmin.
-- ---------------------------------------------------------------------------
-- select public.local_operativo('pegar-un-local_id-aca'::uuid);
