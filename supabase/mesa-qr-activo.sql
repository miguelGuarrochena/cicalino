-- ===========================================================================
-- Cicalino — QR de Pagos es opt-in por mesa
--
-- Configuración define las mesas reales (cantidad). Pagos decide cuáles de
-- esas mesas tienen QR. El token se sigue generando en cada fila para no
-- romper unicidad; qr_activo es lo que habilita el scan de comensales.
--
-- Mesas que ya existían quedan activas (stickers impresos siguen andando).
-- Las mesas nuevas arrancan sin QR hasta que alguien lo active.
-- ===========================================================================

alter table public.mesas
  add column if not exists qr_activo boolean not null default true;

alter table public.mesas
  alter column qr_activo set default false;

create index if not exists idx_mesas_local_qr_activo
  on public.mesas (local_id, qr_activo);


create or replace function public.mesa_por_qr(p_token text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_m public.mesas%rowtype;
  v_l public.locales%rowtype;
begin
  select * into v_m from public.mesas where qr_token = p_token;
  if not found or not v_m.qr_activo then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  select * into v_l from public.locales where id = v_m.local_id;
  if not public.local_tiene_modulo(v_l.id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  return json_build_object('ok', true,
    'mesa_id', v_m.id, 'mesa_numero', v_m.numero,
    'local_id', v_l.id, 'local_nombre', v_l.nombre,
    'operativo', exists (
      select 1 from public.organizaciones o
       where o.id = v_l.organizacion_id and o.activo
         and coalesce(o.estado_suscripcion, 'active') <> 'expired'));
end;
$$;


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
  v_corte integer;
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_comensal uuid;
  v_nuevo boolean := false;
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

  select * into v_s from public.mesa_sesiones
   where mesa_id = v_m.id and estado = 'abierta' for update;

  if found then
    select coalesce(l.hora_corte, 6) into v_corte from public.locales l where l.id = v_m.local_id;
    if v_s.actualizado_en < public.jornada_inicio_corte(v_corte) then
      for r in
        update public.pagos_mesa
           set estado = 'cancelado', cancelado_en = now(),
               cancelado_motivo = 'jornada-cerrada', actualizado_en = now()
         where sesion_id = v_s.id and estado = 'pendiente'
        returning id
      loop
        perform public._mesa_evento(v_s.local_id, v_s.id, 'pago_cancelado', 'sistema',
          p_pago => r.id, p_datos => '{"motivo":"jornada-cerrada"}'::jsonb);
      end loop;
      update public.mesa_sesiones
         set estado = 'cerrada', cerrada_en = now(), cerrada_motivo = 'jornada-cerrada',
             version = version + 1, actualizado_en = now()
       where id = v_s.id;
      perform public._mesa_evento(v_s.local_id, v_s.id, 'mesa_cerrada', 'sistema',
        p_datos => json_build_object('motivo', 'jornada-cerrada',
          'cuenta', public._cuenta_json(v_s.id)->'totales')::jsonb);
      v_s := null;
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


create or replace function public.regenerar_qr_mesa(p_mesa uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_local uuid;
  v_token text;
begin
  select local_id into v_local from public.mesas where id = p_mesa;
  if v_local is null or not public._staff_puede(v_local, true)
     or not public.auth_gestiona_local(v_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.mesas
     set qr_token = gen_random_uuid()::text,
         qr_generado_en = now(),
         qr_activo = true
   where id = p_mesa
  returning qr_token into v_token;
  perform public._mesa_evento(v_local, null, 'qr_regenerado', 'personal',
    p_datos => json_build_object('mesa_id', p_mesa)::jsonb);
  return json_build_object('ok', true, 'qr_token', v_token);
end;
$$;


/* Enable or disable QR on one or more tables of a branch. Null p_ids = all. */
create or replace function public.set_mesas_qr(
  p_local  uuid,
  p_activo boolean,
  p_ids    uuid[] default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public._staff_puede(p_local, true)
     or not public.auth_gestiona_local(p_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not public.local_tiene_modulo(p_local, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not public.local_operativo(p_local) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  update public.mesas
     set qr_activo = p_activo,
         qr_generado_en = case
           when p_activo then coalesce(qr_generado_en, now())
           else qr_generado_en
         end
   where local_id = p_local
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;

  return json_build_object('ok', true, 'n', v_n, 'activo', p_activo);
end;
$$;

revoke all on function public.set_mesas_qr(uuid, boolean, uuid[]) from public, anon;
grant execute on function public.set_mesas_qr(uuid, boolean, uuid[]) to authenticated;
grant execute on function public.mesa_por_qr(text) to service_role;
grant execute on function public.unirse_mesa(text, text, text) to service_role;
grant execute on function public.regenerar_qr_mesa(uuid) to authenticated;
