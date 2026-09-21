-- ===========================================================================
-- Cicalino — Una sola sesión activa (abierta|pagada) por mesa
-- Run in: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotent.
-- Requires: mesa-launch-blockers.sql, staff-empleado-cobro.sql
--
-- After "pagada sigue ocupada", the unique index still only covered
-- `abierta`. Pagadas de jornadas anteriores quedaban vivas; unirse_mesa
-- cerraba solo UNA y abría otra. Mesa 5 podía verse "Libre" con dos
-- pagadas huérfanas en DB.
-- ===========================================================================

-- 1) Cerrar sesiones de jornadas anteriores (mismo criterio que el cron).
do $$
declare
  r record;
  s record;
  v_desde timestamptz;
begin
  for r in select id from public.locales
  loop
    v_desde := public.jornada_inicio_local(r.id);
    for s in
      select id from public.mesa_sesiones
       where local_id = r.id
         and estado in ('abierta', 'pagada')
         and actualizado_en < v_desde
    loop
      perform public._cerrar_sesion_jornada(s.id);
    end loop;
  end loop;
end;
$$;

-- 2) Si aún hubiera más de una activa en la jornada (dato viejo), dejar
--    la más reciente y cerrar el resto.
do $$
declare
  s record;
begin
  for s in
    select id
      from (
        select id,
               row_number() over (
                 partition by mesa_id
                 order by case estado when 'abierta' then 0 else 1 end,
                          abierta_en desc
               ) as rn
          from public.mesa_sesiones
         where estado in ('abierta', 'pagada')
      ) x
     where rn > 1
  loop
    perform public._cerrar_sesion_jornada(s.id);
  end loop;
end;
$$;

drop index if exists public.uq_mesa_sesion_abierta;

create unique index if not exists uq_mesa_sesion_activa
  on public.mesa_sesiones (mesa_id)
  where estado in ('abierta', 'pagada');

-- 3) unirse: cerrar TODAS las sesiones de jornada previa, no solo una.
create or replace function public.unirse_mesa(
  p_token text,
  p_nombre text,
  p_token_hash text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_m public.mesas%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_comensal uuid;
  v_nuevo boolean := false;
  v_desde timestamptz;
  r record;
begin
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 24 then
    return json_build_object('ok', false, 'reason', 'nombre-invalido');
  end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return json_build_object('ok', false, 'reason', 'token-invalido');
  end if;

  select * into v_m from public.mesas where qr_token = p_token for update;
  if not found or not v_m.qr_activo then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not public.local_tiene_modulo(v_m.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not exists (
    select 1 from public.locales l join public.organizaciones o on o.id = l.organizacion_id
     where l.id = v_m.local_id and o.activo
       and coalesce(o.estado_suscripcion, 'active') <> 'expired') then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  v_desde := public.jornada_inicio_local(v_m.local_id);

  perform 1 from public.mesa_sesiones
   where mesa_id = v_m.id and estado in ('abierta', 'pagada')
   for update;

  for r in
    select id from public.mesa_sesiones
     where mesa_id = v_m.id
       and estado in ('abierta', 'pagada')
       and actualizado_en < v_desde
  loop
    perform public._cerrar_sesion_jornada(r.id);
  end loop;

  select * into v_s from public.mesa_sesiones
   where mesa_id = v_m.id and estado in ('abierta', 'pagada')
   order by case estado when 'abierta' then 0 else 1 end, abierta_en desc
   limit 1;

  if found then
    if v_s.estado = 'pagada' then
      return json_build_object('ok', false, 'reason', 'mesa-ocupada');
    elsif v_s.cuenta_solicitada_en is not null then
      return json_build_object('ok', false, 'reason', 'cuenta-solicitada');
    end if;
  end if;

  if v_s.id is null then
    insert into public.mesa_sesiones (local_id, mesa_id, mesa_numero)
    values (v_m.local_id, v_m.id, v_m.numero)
    returning * into v_s;
    v_nuevo := true;
    perform public._mesa_evento(v_s.local_id, v_s.id, 'mesa_abierta', 'comensal');
  end if;

  insert into public.comensales (sesion_id, local_id, nombre, token_hash)
  values (v_s.id, v_s.local_id, v_nombre, lower(p_token_hash))
  returning id into v_comensal;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'comensal_unido', 'comensal',
    p_comensal => v_comensal, p_datos => json_build_object('nombre', v_nombre)::jsonb);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'sesion_id', v_s.id, 'comensal_id', v_comensal,
    'sesion_nueva', v_nuevo);
end;
$$;

revoke all on function public.unirse_mesa(text, text, text)
  from public, anon, authenticated;
grant execute on function public.unirse_mesa(text, text, text) to service_role;
