-- ===========================================================================
-- Cicalino — Fixes de seguridad #15 (PIN rate limit + jornada server-side)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: security-fixes-03.sql, security-fixes-10.sql
-- Orden sugerido: #50 (después de security-fixes-14)
--
-- PROBLEMA
-- 1) verificar_pin_empleado es callable por cualquier sesión authenticated
--    vía PostgREST, saltándose el rate limit del server action.
-- 2) crear_pedido confía en p_desde/p_expira del cliente: dos cajas con
--    hora_corte distinta (Zustand desfasado) pueden numerar jornadas distintas.
--
-- FIX
-- 1) Contador de intentos por (auth.uid, empleado) en tabla server-only.
-- 2) crear_pedido calcula la jornada desde locales.hora_corte en TZ Argentina.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Rate limit de PIN (deny-by-default vía RLS sin policies de cliente)
-- ---------------------------------------------------------------------------
create table if not exists public.pin_intentos (
  clave text primary key,
  n int not null default 0,
  ventana_inicio timestamptz not null default now()
);

alter table public.pin_intentos enable row level security;

revoke all on table public.pin_intentos from public, anon, authenticated;
grant all on table public.pin_intentos to service_role;

comment on table public.pin_intentos is
  'Contador de intentos de PIN. Solo SECURITY DEFINER / service_role.';

create or replace function public.verificar_pin_empleado(
  p_empleado uuid,
  p_pin text
)
returns table (id uuid, nombre text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_local uuid;
  v_hash text;
  v_pin text := regexp_replace(coalesce(p_pin,''), '\D', '', 'g');
  v_clave text;
  v_n int;
  v_ventana timestamptz;
  v_max int := 10;
  v_ventana_sec int := 60;
begin
  select e.local_id, e.pin_hash into v_local, v_hash
    from public.empleados e where e.id = p_empleado and e.activo;
  if v_local is null then
    raise exception 'Empleado inexistente';
  end if;
  if not public.puede_ver_local(v_local) then
    raise exception 'No autorizado';
  end if;

  v_clave := coalesce(auth.uid()::text, 'sin-uid') || ':' || p_empleado::text;

  select n, ventana_inicio into v_n, v_ventana
    from public.pin_intentos where clave = v_clave for update;

  if v_ventana is not null
     and v_ventana > now() - make_interval(secs => v_ventana_sec)
     and coalesce(v_n, 0) >= v_max then
    /* Demasiados intentos: misma respuesta que PIN incorrecto. */
    return;
  end if;

  if v_ventana is null or v_ventana <= now() - make_interval(secs => v_ventana_sec) then
    insert into public.pin_intentos (clave, n, ventana_inicio)
    values (v_clave, 1, now())
    on conflict (clave) do update
      set n = 1, ventana_inicio = now();
  else
    insert into public.pin_intentos (clave, n, ventana_inicio)
    values (v_clave, 1, now())
    on conflict (clave) do update
      set n = public.pin_intentos.n + 1;
  end if;

  if v_hash is null then
    return query select e.id, e.nombre from public.empleados e where e.id = p_empleado;
    return;
  end if;

  if v_hash = extensions.crypt(v_pin, v_hash) then
    delete from public.pin_intentos where clave = v_clave;
    return query select e.id, e.nombre from public.empleados e where e.id = p_empleado;
  end if;
  return;
end;
$$;

revoke all on function public.verificar_pin_empleado(uuid, text)
  from public, anon;
grant execute on function public.verificar_pin_empleado(uuid, text) to authenticated;

comment on function public.verificar_pin_empleado(uuid, text) is
  'Verifica PIN de empleado. Solo authenticated (server action / panel). Rate-limited por (uid, empleado). SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- 2) crear_pedido: jornada desde locales.hora_corte (ignora p_desde/p_expira
--    del cliente para unicidad y qr_expira_en).
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
  v_local_now timestamp;
  v_dia    date;
  v_desde  timestamptz;
  v_expira timestamptz;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;
  if not public.local_operativo(p_local) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  /* p_desde/p_expira se ignoran a propósito: la jornada sale de hora_corte.
   * Se mantienen en la firma para no romper el cliente PostgREST. */

  if p_empleado is not null and not exists (
    select 1 from public.empleados e
     where e.id = p_empleado and e.local_id = p_local
  ) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;

  select coalesce(l.hora_corte, 6)
    into v_corte
    from public.locales l
   where l.id = p_local
   for update;

  if not found then
    return json_build_object('ok', false, 'reason', 'local-invalido');
  end if;

  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  v_local_now := timezone('America/Argentina/Buenos_Aires', now());
  if extract(hour from v_local_now)::int < v_corte then
    v_dia := (v_local_now::date - 1);
  else
    v_dia := v_local_now::date;
  end if;

  v_desde := ((v_dia::timestamp + make_interval(hours => v_corte))
    at time zone 'America/Argentina/Buenos_Aires');
  v_expira := (((v_dia + 1)::timestamp + make_interval(hours => v_corte))
    at time zone 'America/Argentina/Buenos_Aires');

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

comment on function public.crear_pedido(uuid, text, uuid, timestamptz, timestamptz) is
  'Crea pedido con referencia atómica. Jornada desde locales.hora_corte (TZ AR).';
