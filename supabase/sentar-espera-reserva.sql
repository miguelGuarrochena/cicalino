-- ===========================================================================
-- Cicalino — Sentar espera / reserva de forma atómica
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: sentar-walkin.sql, corte-por-impago.sql, espera-constraints.sql
-- Orden: al final de orden.json (después de espera-constraints-validate.sql)
--
-- PROBLEMA
-- El panel sentaba cola y reservas en dos tiempos: un UPDATE de la espera
-- o reserva, y después N updates de mesas. Entre uno y otro:
--
--   1. Dos cajas podían sentar grupos distintos en la misma mesa. El segundo
--      pisaba espera_id / reserva_id. Un grupo quedaba "sentado" sin mesa.
--   2. Si se cortaba la red a mitad del loop, el grupo ya estaba sentado y
--      solo parte de las mesas ocupadas. El mapa mentía.
--
-- Walk-in ya no tiene este hueco: sentar_walkin es una sola transacción con
-- FOR UPDATE. Cola y reserva seguían el camino viejo.
--
-- FIX
-- sentar_espera y sentar_reserva: lock de la fila + lock de las mesas,
-- chequeo de libre, un solo commit. Si algo falla, no se escribe nada.
--
-- p_forzar en sentar_espera es el "Sentar igual" del modal: saltea la gracia
-- de una reserva. Sin eso, el botón dejaría de funcionar. Las mesas siguen
-- teniendo que estar libres.
-- ===========================================================================


create or replace function public.sentar_espera(
  p_local  uuid,
  p_espera uuid,
  p_mesas  integer[],
  p_forzar boolean default false
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_mesas   integer[];
  v_libres  integer;
  v_reserva uuid;
  v_espera  public.esperas%rowtype;
  v_n       integer;
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

  select * into v_espera
    from public.esperas
   where id = p_espera
     and local_id = p_local
     for update;

  if not found then
    return json_build_object('ok', false, 'reason', 'espera-cerrada');
  end if;

  if v_espera.estado not in ('esperando', 'avisado') then
    return json_build_object('ok', false, 'reason', 'espera-cerrada');
  end if;

  /* Orden estable para no deadlockear con sentar_reserva / sentar_walkin. */
  for v_n in
    select numero
      from public.mesas
     where local_id = p_local
       and numero = any(v_mesas)
     order by numero
       for update
  loop
    null;
  end loop;

  select count(*) filter (where estado = 'libre')
    into v_libres
    from public.mesas
   where local_id = p_local
     and numero = any(v_mesas);

  if v_libres is null or v_libres <> array_length(v_mesas, 1) then
    return json_build_object('ok', false, 'reason', 'mesa-no-disponible');
  end if;

  if not coalesce(p_forzar, false) then
    v_reserva := public.mesa_en_ventana_de_reserva(p_local, v_mesas);
    if v_reserva is not null then
      return json_build_object(
        'ok', false, 'reason', 'mesa-reservada', 'reservaId', v_reserva);
    end if;
  end if;

  update public.esperas
     set estado = 'sentado',
         mesa_numero = v_mesas[1],
         sentado_en = now()
   where id = v_espera.id
     and estado in ('esperando', 'avisado');

  if not found then
    return json_build_object('ok', false, 'reason', 'espera-cerrada');
  end if;

  update public.mesas
     set estado = 'ocupada',
         espera_id = v_espera.id,
         reserva_id = null,
         actualizado_en = now()
   where local_id = p_local
     and numero = any(v_mesas);

  return json_build_object('ok', true);
end;
$$;


create or replace function public.sentar_reserva(
  p_local   uuid,
  p_reserva uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_mesas   integer[];
  v_libres  integer;
  v_reserva public.reservas%rowtype;
  v_n       integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;
  if not public.local_operativo(p_local) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  select * into v_reserva
    from public.reservas
   where id = p_reserva
     and local_id = p_local
     for update;

  if not found then
    return json_build_object('ok', false, 'reason', 'reserva-cerrada');
  end if;

  if v_reserva.estado <> 'activa' then
    return json_build_object('ok', false, 'reason', 'reserva-cerrada');
  end if;

  select coalesce(array_agg(distinct n order by n), '{}')
    into v_mesas
    from unnest(
      case
        when coalesce(array_length(v_reserva.mesas_numeros, 1), 0) > 0
          then v_reserva.mesas_numeros
        else array[v_reserva.mesa_numero]
      end
    ) as n
   where n >= 1;

  if array_length(v_mesas, 1) is null then
    return json_build_object('ok', false, 'reason', 'sin-mesas');
  end if;

  for v_n in
    select numero
      from public.mesas
     where local_id = p_local
       and numero = any(v_mesas)
     order by numero
       for update
  loop
    null;
  end loop;

  select count(*) filter (where estado = 'libre')
    into v_libres
    from public.mesas
   where local_id = p_local
     and numero = any(v_mesas);

  if v_libres is null or v_libres <> array_length(v_mesas, 1) then
    return json_build_object('ok', false, 'reason', 'mesa-no-disponible');
  end if;

  update public.reservas
     set estado = 'sentada',
         sentado_en = now()
   where id = v_reserva.id
     and estado = 'activa';

  if not found then
    return json_build_object('ok', false, 'reason', 'reserva-cerrada');
  end if;

  update public.mesas
     set estado = 'ocupada',
         reserva_id = v_reserva.id,
         espera_id = null,
         actualizado_en = now()
   where local_id = p_local
     and numero = any(v_mesas);

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.sentar_espera(uuid, uuid, integer[], boolean) from public, anon;
revoke all on function public.sentar_reserva(uuid, uuid) from public, anon;
grant execute on function public.sentar_espera(uuid, uuid, integer[], boolean) to authenticated;
grant execute on function public.sentar_reserva(uuid, uuid) to authenticated;
