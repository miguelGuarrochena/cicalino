-- ===========================================================================
-- Cicalino — Ocupación de la mesa y pedidos por QR
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: cocina-pase.sql, pedidos-mesa.sql, sentar-espera-reserva.sql,
--           liberar-mesas-atomico.sql, mesa-launch-blockers.sql,
--           split-payments-module.sql
--
-- Recepción (mesas.estado) y Pedidos/Pagos (mesa_sesiones) compartían la fila
-- de la mesa y no las reglas. Este script las junta solo cuando el local
-- tiene los dos módulos habilitados (locales.modulo_espera y modulo_pedidos,
-- que es lo que lee local_tiene_modulo). Con uno solo, el comportamiento
-- anterior se mantiene.
--
-- La sesión guarda la ocupación con la que se abrió (espera_id / reserva_id
-- de ese momento). Liberar la mesa deja de aceptar pedidos nuevos en esa
-- sesión. Si no hay consumos ni pedidos en curso, la sesión se cierra. Si
-- los hay, queda abierta para cobrar y no se cancela la cocina. La ocupación
-- siguiente abre otra sesión: el índice único solo cubre la que todavía
-- acepta pedidos.
--
-- La ventana de una reserva es la del mapa: 30 minutos antes del horario
-- hasta que termina la gracia. HOLD_BEFORE_MIN en src/lib/reservations.ts.
-- ===========================================================================

alter table public.mesa_sesiones
  add column if not exists ocupacion_espera_id uuid,
  add column if not exists ocupacion_reserva_id uuid,
  add column if not exists acepta_pedidos boolean not null default true;

comment on column public.mesa_sesiones.ocupacion_espera_id is
  'Espera sentada en la mesa cuando se abrió la sesión. Distingue ocupaciones sucesivas.';
comment on column public.mesa_sesiones.ocupacion_reserva_id is
  'Reserva sentada en la mesa cuando se abrió la sesión.';
comment on column public.mesa_sesiones.acepta_pedidos is
  'False: la mesa se liberó y esta sesión ya no toma pedidos nuevos. La cuenta sigue si había consumo.';

/* Sesiones abiertas de una mesa que ya está ocupada quedan atadas a esa
 * ocupación. Una mesa libre no se las atribuye: si no, null = null y la
 * sesión vieja parecería de la ocupación nueva. */
update public.mesa_sesiones s
   set ocupacion_espera_id = m.espera_id,
       ocupacion_reserva_id = m.reserva_id
  from public.mesas m
 where s.mesa_id = m.id
   and s.estado in ('abierta', 'pagada')
   and s.acepta_pedidos
   and s.ocupacion_espera_id is null
   and s.ocupacion_reserva_id is null
   and m.estado = 'ocupada'
   and (m.espera_id is not null or m.reserva_id is not null);

drop index if exists public.uq_mesa_sesion_activa;

create unique index uq_mesa_sesion_activa
  on public.mesa_sesiones (mesa_id)
  where estado in ('abierta', 'pagada') and acepta_pedidos;


-- ---------------------------------------------------------------------------
-- Módulos. La fuente es el local (y que la sucursal esté activa), la misma
-- que usa el resto de las RPC. No se infiere por tener mesas o reservas.
-- ---------------------------------------------------------------------------
create or replace function public.mesa_sync_recepcion_pedidos(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.local_tiene_modulo(p_local, 'espera')
     and public.local_tiene_modulo(p_local, 'pedidos');
$$;

revoke all on function public.mesa_sync_recepcion_pedidos(uuid) from public, anon;
grant execute on function public.mesa_sync_recepcion_pedidos(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Ventana única. Antes la base bloqueaba solo desde el horario; el mapa
-- bloqueaba 30 minutos antes. Las dos tienen que decir lo mismo.
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
     and now() >= r.horario - interval '30 minutes'
     and now() <= r.horario + make_interval(mins => coalesce(r.gracia_minutos, 15))
     and (r.mesa_numero = any(p_mesas) or r.mesas_numeros && p_mesas)
   order by r.horario
   limit 1;
$$;

grant execute on function public.mesa_en_ventana_de_reserva(uuid, integer[]) to authenticated;


create or replace function public._sesion_tiene_pendientes(p_sesion uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.pedidos p
            where p.sesion_id = p_sesion
              and p.estado in ('pendiente_pago', 'creado', 'en_preparacion', 'listo')
         )
      or exists (
           select 1 from public.pagos_mesa g
            where g.sesion_id = p_sesion
              and g.estado in ('pendiente', 'definido')
         )
      or public._consumo_sesion(p_sesion) > coalesce((
           select sum(g.monto_base) from public.pagos_mesa g
            where g.sesion_id = p_sesion and g.estado = 'pagado'
         ), 0);
$$;

revoke all on function public._sesion_tiene_pendientes(uuid) from public, anon, authenticated;


/* Cierra la sesión si no hay nada que resolver. Si hay pedidos o plata en
 * juego, deja de aceptar pedidos nuevos y no toca la cocina ni los cobros. */
create or replace function public._archivar_sesion_anterior(p_sesion uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_sesion is null then
    return;
  end if;
  if public._sesion_tiene_pendientes(p_sesion) then
    update public.mesa_sesiones
       set acepta_pedidos = false,
           version = version + 1,
           actualizado_en = now()
     where id = p_sesion
       and estado in ('abierta', 'pagada')
       and acepta_pedidos;
  else
    perform public._cerrar_sesion(p_sesion, 'mesa-liberada');
  end if;
end;
$$;

revoke all on function public._archivar_sesion_anterior(uuid) from public, anon, authenticated;


create or replace function public._soltar_sesiones_mesa(p_mesa uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_local uuid;
  r record;
begin
  select local_id into v_local from public.mesas where id = p_mesa;
  if v_local is null or not public.mesa_sync_recepcion_pedidos(v_local) then
    return;
  end if;

  for r in
    select id from public.mesa_sesiones
     where mesa_id = p_mesa
       and estado in ('abierta', 'pagada')
       and acepta_pedidos
     order by abierta_en
       for update
  loop
    perform public._archivar_sesion_anterior(r.id);
  end loop;
end;
$$;

revoke all on function public._soltar_sesiones_mesa(uuid) from public, anon, authenticated;


/* Solo cuando estado deja de ser ocupada. Capacidad, qr_activo y el resto
 * no disparan esto. Deja de aceptar pedidos nuevos o cierra la sesión vacía;
 * no cancela cocina ni borra cobros. Sin los dos módulos, _soltar no hace
 * nada. No toca mesas, así que no se llama a sí mismo. El lock es el de
 * siempre: la fila de la mesa ya está tomada y después se toman las sesiones. */
create or replace function public.mesas_soltar_pedidos()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'ocupada' and new.estado is distinct from 'ocupada' then
    perform public._soltar_sesiones_mesa(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.mesas_soltar_pedidos() from public, anon, authenticated;

drop trigger if exists mesas_soltar_pedidos on public.mesas;
create trigger mesas_soltar_pedidos
  after update of estado on public.mesas
  for each row execute function public.mesas_soltar_pedidos();


/* Ocupar solo con una referencia real. Una fila histórica que ya está
 * ocupada y con los dos ids en null se puede seguir editando (capacidad,
 * qr_activo) mientras no cambie esa ocupación. anon, authenticated y
 * service_role no cambian estado ni los ids: eso pasa por las RPC, que
 * corren como dueño de la función. El trigger es security invoker para ver
 * quién escribe. */
create or replace function public.mesas_ocupacion_valida()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if tg_op = 'UPDATE'
     and new.estado is not distinct from old.estado
     and new.espera_id is not distinct from old.espera_id
     and new.reserva_id is not distinct from old.reserva_id
  then
    return new;
  end if;

  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'la ocupacion de la mesa se cambia con sentar o liberar'
      using errcode = '42501';
  end if;

  if new.estado is distinct from 'ocupada' then
    return new;
  end if;

  if (new.espera_id is null) = (new.reserva_id is null) then
    raise exception 'mesa ocupada sin una sola ocupacion'
      using errcode = '23514';
  end if;

  if new.espera_id is not null then
    select exists (
      select 1 from public.esperas e
       where e.id = new.espera_id
         and e.local_id = new.local_id
         and e.estado = 'sentado'
    ) into v_ok;
  else
    select exists (
      select 1 from public.reservas r
       where r.id = new.reserva_id
         and r.local_id = new.local_id
         and r.estado = 'sentada'
    ) into v_ok;
  end if;

  if not coalesce(v_ok, false) then
    raise exception 'la ocupacion no esta sentada en este local'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.mesas_ocupacion_valida() from public, anon, authenticated;

drop trigger if exists mesas_ocupacion_valida on public.mesas;
create trigger mesas_ocupacion_valida
  before insert or update on public.mesas
  for each row execute function public.mesas_ocupacion_valida();


/* null = se puede abrir una sesión de QR. Si no hay sincronización, null. */
create or replace function public._bloqueo_abrir_sesion(p_mesa uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_m public.mesas%rowtype;
  v_reserva uuid;
begin
  select * into v_m from public.mesas where id = p_mesa;
  if not found then
    return 'not-found';
  end if;
  if not public.mesa_sync_recepcion_pedidos(v_m.local_id) then
    return null;
  end if;
  if v_m.estado = 'ocupada' then
    return null;
  end if;
  v_reserva := public.mesa_en_ventana_de_reserva(v_m.local_id, array[v_m.numero]);
  if v_reserva is not null then
    return 'mesa-reservada';
  end if;
  return 'mesa-no-habilitada';
end;
$$;

revoke all on function public._bloqueo_abrir_sesion(uuid) from public, anon, authenticated;


/* null = esta sesión puede sumar un pedido. Mostrador QR y caja no entran. */
create or replace function public._bloqueo_pedido_sesion(p_sesion uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_m public.mesas%rowtype;
begin
  if p_sesion is null then
    return null;
  end if;
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  if not found then
    return 'mesa-cerrada';
  end if;
  if v_s.flujo = 'mostrador_qr' or v_s.mesa_id is null then
    return null;
  end if;
  if not public.mesa_sync_recepcion_pedidos(v_s.local_id) then
    return null;
  end if;
  select * into v_m from public.mesas where id = v_s.mesa_id;
  /* Liberada: aunque la sesión siga abierta por un consumo, el QR de esa
   * ocupación ya no pide. Si la mesa sigue ocupada y la cuenta se pagó, el
   * motivo es el cierre de la sesión, no la liberación. */
  if not found or v_m.estado is distinct from 'ocupada' then
    return 'mesa-liberada';
  end if;
  if v_s.estado <> 'abierta' then
    return 'mesa-cerrada';
  end if;
  if not v_s.acepta_pedidos
     or v_s.ocupacion_espera_id is distinct from v_m.espera_id
     or v_s.ocupacion_reserva_id is distinct from v_m.reserva_id then
    return 'sesion-vencida';
  end if;
  return null;
end;
$$;

revoke all on function public._bloqueo_pedido_sesion(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Liberar. La mesa vuelve a libre como antes. Con los dos módulos, las
-- sesiones de esa ocupación dejan de tomar pedidos.
-- ---------------------------------------------------------------------------
create or replace function public.liberar_mesas(
  p_local     uuid,
  p_numero    integer,
  p_solo_esta boolean default false
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  r record;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  for r in
    with objetivo as (
      select espera_id, reserva_id, estado
        from public.mesas
       where local_id = p_local
         and numero = p_numero
    ),
    liberadas as (
      update public.mesas m
         set estado = 'libre',
             espera_id = null,
             reserva_id = null,
             actualizado_en = now()
        from objetivo o
       where m.local_id = p_local
         and (
           m.numero = p_numero
           or (
             not coalesce(p_solo_esta, false)
             and o.estado = 'ocupada'
             and m.estado = 'ocupada'
             and (
                  (o.espera_id  is not null and m.espera_id  = o.espera_id)
               or (o.reserva_id is not null and m.reserva_id = o.reserva_id)
             )
           )
         )
      returning m.id
    )
    select id from liberadas
  loop
    perform public._soltar_sesiones_mesa(r.id);
    v_n := coalesce(v_n, 0) + 1;
  end loop;

  return coalesce(v_n, 0);
end;
$$;

revoke all on function public.liberar_mesas(uuid, integer, boolean) from public, anon;
grant execute on function public.liberar_mesas(uuid, integer, boolean) to authenticated;


create or replace function public.liberar_mesas_jornada_local(p_local uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_desde timestamptz;
  r record;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.locales l where l.id = p_local) then
    return 0;
  end if;

  v_desde := public.jornada_inicio_local(p_local);

  for r in
    select id from public.mesa_sesiones
     where local_id = p_local
       and estado in ('abierta', 'pagada')
       and actualizado_en < v_desde
  loop
    perform public._cerrar_sesion_jornada(r.id);
  end loop;

  for r in
    update public.mesas
       set estado = 'libre',
           espera_id = null,
           reserva_id = null,
           actualizado_en = now()
     where local_id = p_local
       and estado = 'ocupada'
       and actualizado_en < v_desde
    returning id
  loop
    perform public._soltar_sesiones_mesa(r.id);
    v_n := coalesce(v_n, 0) + 1;
  end loop;

  return coalesce(v_n, 0);
end;
$$;

revoke all on function public.liberar_mesas_jornada_local(uuid) from public, anon;
grant execute on function public.liberar_mesas_jornada_local(uuid) to authenticated;


create or replace function public.liberar_mesas_jornada()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_n integer := 0;
  v_k integer;
  v_desde timestamptz;
  s record;
begin
  for r in
    select id, hora_corte, dias_cerrados from public.locales
  loop
    v_desde := public.jornada_inicio_corte(r.hora_corte, r.dias_cerrados);

    for s in
      select id from public.mesa_sesiones
       where local_id = r.id
         and estado in ('abierta', 'pagada')
         and actualizado_en < v_desde
    loop
      perform public._cerrar_sesion_jornada(s.id);
    end loop;

    for s in
      update public.mesas
         set estado = 'libre',
             espera_id = null,
             reserva_id = null,
             actualizado_en = now()
       where local_id = r.id
         and estado = 'ocupada'
         and actualizado_en < v_desde
      returning id
    loop
      perform public._soltar_sesiones_mesa(s.id);
      v_k := coalesce(v_k, 0) + 1;
    end loop;

    v_n := v_n + coalesce(v_k, 0);
    v_k := 0;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.liberar_mesas_jornada() from public, anon, authenticated;
grant execute on function public.liberar_mesas_jornada() to service_role;


-- ---------------------------------------------------------------------------
-- Red de seguridad: cualquier insert de pedido de mesa pasa por la misma
-- regla, aunque no salga de pedir_autoservicio / pedir_como_comensal.
-- El mostrador (sin sesión, o flujo mostrador_qr) no se toca.
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_ocupacion_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_motivo text;
begin
  if new.sesion_id is null then
    return new;
  end if;
  v_motivo := public._bloqueo_pedido_sesion(new.sesion_id);
  if v_motivo is not null then
    raise exception 'pedido no permitido: %', v_motivo using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.pedidos_ocupacion_guard() from public, anon, authenticated;

drop trigger if exists pedidos_ocupacion_guard on public.pedidos;
create trigger pedidos_ocupacion_guard
  before insert on public.pedidos
  for each row execute function public.pedidos_ocupacion_guard();


/* La sesión abierta se reutiliza solo si es de esta ocupación. Si es de una
 * anterior, se archiva (y deja el índice libre) y el llamador abre otra. */
create or replace function public._reutilizar_sesion_ocupacion(
  p_sesion uuid,
  p_mesa uuid
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_m public.mesas%rowtype;
begin
  if p_sesion is null then
    return false;
  end if;
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  select * into v_m from public.mesas where id = p_mesa;
  if not found or v_s.id is null then
    return false;
  end if;
  if not public.mesa_sync_recepcion_pedidos(v_m.local_id) then
    return true;
  end if;
  if v_m.estado = 'ocupada'
     and v_s.acepta_pedidos
     and v_s.ocupacion_espera_id is not distinct from v_m.espera_id
     and v_s.ocupacion_reserva_id is not distinct from v_m.reserva_id then
    return true;
  end if;
  perform public._archivar_sesion_anterior(v_s.id);
  return false;
end;
$$;

revoke all on function public._reutilizar_sesion_ocupacion(uuid, uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Pagos: unirse_mesa (pedidos-mesa.sql) + ocupación cuando hay Recepción.
-- ---------------------------------------------------------------------------
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
  v_bloqueo text;
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
  if public.local_pedidos_mesa(v_m.local_id)
     or not public.local_tiene_modulo(v_m.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not public._local_suscripcion_activa(v_m.local_id) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  v_bloqueo := public._bloqueo_abrir_sesion(v_m.id);
  if v_bloqueo is not null then
    return json_build_object('ok', false, 'reason', v_bloqueo);
  end if;

  v_desde := public.jornada_inicio_local(v_m.local_id);

  perform 1 from public.mesa_sesiones
   where mesa_id = v_m.id and estado in ('abierta', 'pagada')
   for update;

  for r in
    select id, flujo from public.mesa_sesiones
     where mesa_id = v_m.id
       and estado in ('abierta', 'pagada')
       and (actualizado_en < v_desde or flujo = 'autoservicio')
  loop
    perform public._cerrar_sesion(r.id,
      case when r.flujo = 'autoservicio' then 'cambio-modalidad' else 'jornada-cerrada' end);
  end loop;

  select * into v_s from public.mesa_sesiones
   where mesa_id = v_m.id and estado in ('abierta', 'pagada') and acepta_pedidos
   order by case estado when 'abierta' then 0 else 1 end, abierta_en desc
   limit 1;

  if v_s.id is not null and not public._reutilizar_sesion_ocupacion(v_s.id, v_m.id) then
    v_s := null;
  end if;

  if v_s.id is not null then
    if v_s.estado = 'pagada' then
      return json_build_object('ok', false, 'reason', 'mesa-ocupada');
    elsif v_s.cuenta_solicitada_en is not null then
      return json_build_object('ok', false, 'reason', 'cuenta-solicitada');
    end if;
  end if;

  if v_s.id is null then
    insert into public.mesa_sesiones (
      local_id, mesa_id, mesa_numero, ocupacion_espera_id, ocupacion_reserva_id
    ) values (
      v_m.local_id, v_m.id, v_m.numero, v_m.espera_id, v_m.reserva_id
    )
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

revoke all on function public.unirse_mesa(text, text, text) from public, anon, authenticated;
grant execute on function public.unirse_mesa(text, text, text) to service_role;


create or replace function public.unirse_mesa_autoservicio(
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
  v_bloqueo text;
  r record;
begin
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 24 then
    return json_build_object('ok', false, 'reason', 'nombre-invalido');
  end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return json_build_object('ok', false, 'reason', 'token-invalido');
  end if;

  select * into v_m from public.mesas where qr_token = p_token for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not public.local_pedidos_mesa(v_m.local_id) then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not public._local_suscripcion_activa(v_m.local_id) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  v_bloqueo := public._bloqueo_abrir_sesion(v_m.id);
  if v_bloqueo is not null then
    return json_build_object('ok', false, 'reason', v_bloqueo);
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
    perform public._cerrar_sesion(r.id, 'jornada-cerrada');
  end loop;

  select * into v_s from public.mesa_sesiones
   where mesa_id = v_m.id and estado in ('abierta', 'pagada') and acepta_pedidos
   order by case estado when 'abierta' then 0 else 1 end, abierta_en desc
   limit 1;

  if found and v_s.flujo = 'cuenta' then
    if public._consumo_sesion(v_s.id) = 0
       and not exists (select 1 from public.pagos_mesa g
                        where g.sesion_id = v_s.id and g.estado <> 'cancelado') then
      perform public._cerrar_sesion(v_s.id, 'cambio-modalidad');
      v_s := null;
    else
      return json_build_object('ok', false, 'reason', 'mesa-ocupada');
    end if;
  end if;

  if v_s.id is not null and not public._reutilizar_sesion_ocupacion(v_s.id, v_m.id) then
    v_s := null;
  end if;

  if v_s.id is null then
    insert into public.mesa_sesiones (
      local_id, mesa_id, mesa_numero, flujo, ocupacion_espera_id, ocupacion_reserva_id
    ) values (
      v_m.local_id, v_m.id, v_m.numero, 'autoservicio', v_m.espera_id, v_m.reserva_id
    )
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

revoke all on function public.unirse_mesa_autoservicio(text, text, text) from public, anon, authenticated;
grant execute on function public.unirse_mesa_autoservicio(text, text, text) to service_role;


create or replace function public.mesa_por_qr(p_token text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_m public.mesas%rowtype;
  v_l public.locales%rowtype;
  v_flujo text;
begin
  select * into v_m from public.mesas where qr_token = p_token;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  select * into v_l from public.locales where id = v_m.local_id;
  if public.local_pedidos_mesa(v_l.id) then
    v_flujo := 'autoservicio';
  elsif not v_m.qr_activo then
    return json_build_object('ok', false, 'reason', 'not-found');
  elsif public.local_tiene_modulo(v_l.id, 'pagos') then
    v_flujo := 'cuenta';
  else
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  return json_build_object('ok', true,
    'mesa_id', v_m.id, 'mesa_numero', v_m.numero,
    'local_id', v_l.id, 'local_nombre', v_l.nombre,
    'flujo', v_flujo,
    'operativo', public._local_suscripcion_activa(v_l.id),
    'bloqueo', public._bloqueo_abrir_sesion(v_m.id));
end;
$$;

revoke all on function public.mesa_por_qr(text) from public, anon, authenticated;
grant execute on function public.mesa_por_qr(text) to service_role;



-- pedir_como_comensal / pedir_autoservicio: cuerpo de plato-aclaracion.sql
-- con el chequeo de ocupación antes de insertar el pedido.
create or replace function public.pedir_como_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_items jsonb,
  p_clave uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_corte integer;
  v_expira timestamptz;
  v_pedido uuid;
  v_lineas integer;
  v_validas integer;
  v_total integer;
  v_bloqueo text;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if p_clave is null then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  /* Mesa primero, sesión después: el mismo orden que liberar_mesas, para no
   * deadlockear si el salón libera mientras este teléfono confirma. */
  perform 1
    from public.mesas
   where id = (select s.mesa_id from public.mesa_sesiones s where s.id = v_c.sesion_id)
     for update;
  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;

  select id into v_pedido from public.pedidos
   where comensal_id = v_c.id and clave_idempotencia = p_clave;
  if found then
    return json_build_object('ok', true, 'repetido', true, 'pedido_id', v_pedido);
  end if;
  if v_s.id is null then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;

  v_bloqueo := public._bloqueo_pedido_sesion(v_s.id);
  if v_bloqueo is not null then
    return json_build_object('ok', false, 'reason', v_bloqueo);
  end if;

  if v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;
  if v_s.cuenta_solicitada_en is not null then
    return json_build_object('ok', false, 'reason', 'cuenta-solicitada');
  end if;
  if not public.local_tiene_modulo(v_s.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not exists (
    select 1 from public.locales l join public.organizaciones o on o.id = l.organizacion_id
     where l.id = v_s.local_id and o.activo
       and coalesce(o.estado_suscripcion, 'active') <> 'expired') then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;
  v_lineas := jsonb_array_length(p_items);
  if v_lineas < 1 or v_lineas > 30 then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  select count(*) into v_validas from public._lineas_pedido(v_s.local_id, p_items);
  if v_validas <> v_lineas then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  select coalesce(l.hora_corte, 6) into v_corte from public.locales l where l.id = v_s.local_id;
  v_expira := public.jornada_inicio_corte(v_corte) + interval '1 day';

  insert into public.pedidos (
    local_id, referencia, alias_cliente, estado, qr_token, qr_expira_en,
    sesion_id, comensal_id, clave_idempotencia
  ) values (
    v_s.local_id, 'Mesa ' || v_s.mesa_numero, v_c.nombre, 'creado',
    gen_random_uuid()::text, v_expira, v_s.id, v_c.id, p_clave
  )
  returning id into v_pedido;

  insert into public.pedido_items (
    pedido_id, local_id, sesion_id, comensal_id, producto_id, nombre,
    precio_unitario, cantidad, opcion, nota
  )
  select v_pedido, v_s.local_id, v_s.id, v_c.id, l.producto_id, l.nombre,
         l.precio, l.cantidad, l.opcion, l.nota
    from public._lineas_pedido(v_s.local_id, p_items) l;

  select coalesce(sum(subtotal), 0) into v_total from public.pedido_items where pedido_id = v_pedido;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'pedido_creado', 'comensal',
    p_comensal => v_c.id, p_pedido => v_pedido,
    p_datos => json_build_object('lineas', v_lineas, 'total', v_total)::jsonb);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'pedido_id', v_pedido, 'total', v_total);
end;
$$;

revoke all on function public.pedir_como_comensal(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pedir_como_comensal(uuid, text, jsonb, uuid) to service_role;

create or replace function public.pedir_autoservicio(
  p_comensal uuid,
  p_token_hash text,
  p_items jsonb,
  p_clave uuid,
  p_metodo text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_existente public.pedidos%rowtype;
  v_corte integer;
  v_cerrados integer[];
  v_desde timestamptz;
  v_expira timestamptz;
  v_max bigint;
  v_ref text;
  v_pedido uuid;
  v_lineas integer;
  v_validas integer;
  v_total integer;
  v_bloqueo text;
  v_pago json;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if p_clave is null or coalesce(p_metodo, '') not in ('caja', 'mercado_pago') then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  /* Mesa primero, sesión después: el mismo orden que liberar_mesas, para no
   * deadlockear si el salón libera mientras este teléfono confirma. */
  perform 1
    from public.mesas
   where id = (select s.mesa_id from public.mesa_sesiones s where s.id = v_c.sesion_id)
     for update;
  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;

  /* Reintento del mismo carrito (se cortó la red): el mismo pedido. */
  select * into v_existente from public.pedidos
   where comensal_id = v_c.id and clave_idempotencia = p_clave;
  if found then
    return json_build_object('ok', true, 'repetido', true, 'pedido_id', v_existente.id,
      'referencia', v_existente.referencia, 'total', public._total_pedido(v_existente.id),
      'metodo', case when v_existente.pago_caja_en is not null then 'caja' else 'mercado_pago' end,
      'pago_id', (select g.id from public.pagos_mesa g
                   where g.pedido_id = v_existente.id and g.estado = 'pendiente'
                     and g.metodo = 'mercado_pago'
                   order by g.creado_en desc limit 1));
  end if;

  v_bloqueo := public._bloqueo_pedido_sesion(v_s.id);
  if v_bloqueo is not null then
    return json_build_object('ok', false, 'reason', v_bloqueo);
  end if;

  if v_s.id is null or v_s.estado <> 'abierta' or v_s.flujo <> 'autoservicio'
     or v_s.actualizado_en < public.jornada_inicio_local(v_s.local_id) then
    /* Una sesión de otra jornada: que vuelva a entrar por el QR. */
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;
  if not public.local_pedidos_mesa(v_s.local_id) then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not public._local_suscripcion_activa(v_s.local_id) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  if p_metodo = 'mercado_pago'
     and not public._metodo_mesa_habilitado(v_s.local_id, 'mercado_pago', 'comensal') then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;
  v_lineas := jsonb_array_length(p_items);
  if v_lineas < 1 or v_lineas > 30 then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  /* Mismas reglas que pedir_como_comensal: cada renglón es un producto activo
   * de esta sucursal, una sola vez, con una cantidad razonable. */
  select count(*) into v_validas from public._lineas_pedido(v_s.local_id, p_items);
  if v_validas <> v_lineas then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  /* El número sale de la misma serie que crear_pedido, con el mismo lock: la
   * caja dice "el 14, mesa 5" y no choca con un pedido del mostrador. */
  select coalesce(l.hora_corte, 6), coalesce(l.dias_cerrados, '{}'::integer[])
    into v_corte, v_cerrados
    from public.locales l where l.id = v_s.local_id
   for update;
  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;
  v_desde := public.jornada_inicio_corte(v_corte, v_cerrados);
  v_expira := public.jornada_fin_corte(v_corte, v_cerrados);

  select coalesce(max(nullif(substring(referencia from '^[0-9]+'), '')::bigint), 0)
    into v_max
    from public.pedidos
   where local_id = v_s.local_id and creado_en >= v_desde;
  v_ref := (v_max + 1)::text;

  insert into public.pedidos (
    local_id, referencia, alias_cliente, estado, qr_token, qr_expira_en,
    sesion_id, comensal_id, clave_idempotencia, autoservicio, pago_caja_en
  ) values (
    v_s.local_id, v_ref, v_c.nombre, 'pendiente_pago', gen_random_uuid()::text,
    v_expira, v_s.id, v_c.id, p_clave, true,
    case when p_metodo = 'caja' then now() end
  )
  returning id into v_pedido;

  insert into public.pedido_items (
    pedido_id, local_id, sesion_id, comensal_id, producto_id, nombre,
    precio_unitario, cantidad, opcion, nota
  )
  select v_pedido, v_s.local_id, v_s.id, v_c.id, l.producto_id, l.nombre,
         l.precio, l.cantidad, l.opcion, l.nota
    from public._lineas_pedido(v_s.local_id, p_items) l;

  v_total := public._total_pedido(v_pedido);

  perform public._mesa_evento(v_s.local_id, v_s.id, 'pedido_creado', 'comensal',
    p_comensal => v_c.id, p_pedido => v_pedido,
    p_datos => json_build_object('lineas', v_lineas, 'total', v_total,
      'metodo', p_metodo)::jsonb);

  if p_metodo = 'mercado_pago' then
    v_pago := public._crear_pago_pedido(v_pedido, 'mercado_pago', 'comensal');
    if coalesce(v_pago->>'ok', '') <> 'true' then
      raise exception 'mp payment for new order failed: %', v_pago->>'reason';
    end if;
  end if;

  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'pedido_id', v_pedido, 'referencia', v_ref,
    'total', v_total, 'metodo', p_metodo,
    'pago_id', case when v_pago is null then null else (v_pago->>'pago_id')::uuid end);
end;
$$;

revoke all on function public.pedir_autoservicio(uuid, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.pedir_autoservicio(uuid, text, jsonb, uuid, text) to service_role;

create or replace function public.mesa_autoservicio_estado(
  p_token text,
  p_comensal uuid,
  p_token_hash text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_m public.mesas%rowtype;
  v_c public.comensales%rowtype;
  v_cs public.mesa_sesiones%rowtype;
  v_s public.mesa_sesiones%rowtype;
  v_desde timestamptz;
begin
  select * into v_m from public.mesas where qr_token = p_token;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not public.local_pedidos_mesa(v_m.local_id) then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;

  v_desde := public.jornada_inicio_local(v_m.local_id);

  if p_comensal is not null then
    v_c := public._comensal_valido(p_comensal, p_token_hash);
    if v_c.id is not null then
      select * into v_cs from public.mesa_sesiones where id = v_c.sesion_id;
      /* Un comensal de otra mesa o de la cuenta compartida no es de acá. */
      if v_cs.mesa_id is distinct from v_m.id or v_cs.flujo <> 'autoservicio' then
        v_c := null;
      end if;
    end if;
  end if;

  select * into v_s from public.mesa_sesiones
   where mesa_id = v_m.id and flujo = 'autoservicio' and estado = 'abierta'
     and actualizado_en >= v_desde
   order by abierta_en desc
   limit 1;

  if v_s.id is not null then
    perform public._expirar_pagos_mp(v_s.id);
  end if;
  if v_c.id is not null then
    if v_c.sesion_id is distinct from v_s.id then
      perform public._expirar_pagos_mp(v_c.sesion_id);
    end if;
    update public.comensales set visto_en = now()
     where id = v_c.id and visto_en < now() - interval '1 minute';
  end if;

  return json_build_object('ok', true,
    'mesa', json_build_object('id', v_m.id, 'numero', v_m.numero),
    'operativo', public._local_suscripcion_activa(v_m.local_id),
    'comensal', case when v_c.id is null then null else
      json_build_object('id', v_c.id, 'nombre', v_c.nombre, 'sesion_id', v_c.sesion_id) end,
    /* Puede seguir pidiendo con esta identidad: su sesión es la de hoy. Si no,
     * vuelve a entrar (y la sesión vieja se cierra al hacerlo). */
    'sesion_abierta', v_c.id is not null and v_cs.estado = 'abierta'
                      and v_cs.actualizado_en >= v_desde,
    'puede_pedir', case
         when not public.mesa_sync_recepcion_pedidos(v_m.local_id) then
           v_c.id is not null and v_cs.estado = 'abierta' and v_cs.actualizado_en >= v_desde
         else v_c.id is not null
              and public._bloqueo_pedido_sesion(v_c.sesion_id) is null
              and v_cs.actualizado_en >= v_desde
       end,
    'bloqueo', public._bloqueo_abrir_sesion(v_m.id),
    'sesion_motivo', case
         when v_c.id is null then null
         else public._bloqueo_pedido_sesion(v_c.sesion_id)
       end,
    'pedidos', case when v_c.id is null then '[]'::json else coalesce((
      select json_agg(public._pedido_autoservicio_json(p.id) order by p.creado_en desc)
        from public.pedidos p
       where p.comensal_id = v_c.id and p.autoservicio
         and p.creado_en >= v_desde
    ), '[]'::json) end,
    'mesa_pedidos', coalesce((
      select json_agg(json_build_object(
          'referencia', p.referencia, 'estado', p.estado,
          'creado_en', p.creado_en, 'total', public._total_pedido(p.id))
        order by p.creado_en desc)
        from public.pedidos p
       where p.sesion_id = v_s.id and p.autoservicio
         and p.estado in ('pendiente_pago', 'creado', 'en_preparacion', 'listo')
         and p.comensal_id is distinct from v_c.id
    ), '[]'::json));
end;
$$;

revoke all on function public.mesa_autoservicio_estado(text, uuid, text) from public, anon, authenticated;
grant execute on function public.mesa_autoservicio_estado(text, uuid, text) to service_role;

create or replace function public._cuenta_json(p_sesion uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_consumo integer;
  v_disponible integer;
  v_hay_definido boolean;
  v_res json;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  if not found then
    return null;
  end if;
  v_consumo := public._consumo_sesion(p_sesion);
  select greatest(v_consumo - coalesce(sum(monto_base), 0), 0),
         coalesce(bool_or(estado = 'definido'), false)
    into v_disponible, v_hay_definido
    from public.pagos_mesa
   where sesion_id = p_sesion and estado <> 'cancelado';

  select json_build_object(
    'sesion', json_build_object(
      'id', v_s.id, 'local_id', v_s.local_id, 'mesa_id', v_s.mesa_id,
      'mesa_numero', v_s.mesa_numero, 'estado', v_s.estado,
      'modo_division', v_s.modo_division, 'partes', v_s.partes,
      'version', v_s.version, 'abierta_en', v_s.abierta_en,
      'actualizado_en', v_s.actualizado_en, 'pagada_en', v_s.pagada_en,
      'cerrada_en', v_s.cerrada_en, 'cerrada_motivo', v_s.cerrada_motivo,
      'llamado_en', v_s.llamado_en,
      'acepta_pedidos', public._bloqueo_pedido_sesion(v_s.id) is null
           and v_s.estado = 'abierta',
      'bloqueo', public._bloqueo_pedido_sesion(v_s.id),
      'cuenta_intencion', v_s.cuenta_intencion,
      'cuenta_solicitada_en', v_s.cuenta_solicitada_en,
      'cuenta_solicitada_por', v_s.cuenta_solicitada_por,
      'cuenta_pagador_total_id', v_s.cuenta_pagador_total_id,
      'cuenta_pagador_total_nombre', v_s.cuenta_pagador_total_nombre,
      'cuenta_estado', public._cuenta_estado(
        v_s.cuenta_solicitada_en, v_s.cuenta_intencion,
        v_consumo, v_disponible, v_hay_definido)
    ),
    'comensales', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'nombre', c.nombre, 'creado_en', c.creado_en,
        'consumo', coalesce((
          select sum(i.subtotal) from public.pedido_items i
            join public.pedidos p on p.id = i.pedido_id
           where i.comensal_id = c.id and p.estado <> 'cancelado'), 0)
      ) order by c.creado_en)
        from public.comensales c where c.sesion_id = p_sesion
    ), '[]'::json),
    'pedidos', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'comensal_id', p.comensal_id, 'estado', p.estado,
        'creado_en', p.creado_en, 'cocina_hecha_en', p.cocina_hecha_en, 'listo_en', p.listo_en,
        'retirado_en', p.retirado_en, 'cancelado_en', p.cancelado_en,
        'items', coalesce((
          select json_agg(json_build_object(
            'id', i.id, 'comensal_id', i.comensal_id, 'producto_id', i.producto_id,
            'nombre', i.nombre, 'precio_unitario', i.precio_unitario,
            'cantidad', i.cantidad, 'subtotal', i.subtotal,
            'opcion', i.opcion, 'nota', i.nota
          ) order by i.creado_en, i.nombre)
            from public.pedido_items i where i.pedido_id = p.id
        ), '[]'::json)
      ) order by p.creado_en)
        from public.pedidos p where p.sesion_id = p_sesion
    ), '[]'::json),
    'pagos', coalesce((
      select json_agg(json_build_object(
        'id', g.id, 'comensal_id', g.comensal_id, 'pagador_nombre', g.pagador_nombre,
        'modo', g.modo, 'partes', g.partes, 'monto_base', g.monto_base,
        'propina', g.propina, 'propina_porcentaje', g.propina_porcentaje,
        'recargo', g.recargo, 'recargo_porcentaje', g.recargo_porcentaje,
        'monto_total', g.monto_total, 'metodo', g.metodo, 'estado', g.estado,
        'creado_por', g.creado_por, 'confirmacion', g.confirmacion,
        'creado_en', g.creado_en, 'confirmado_en', g.confirmado_en,
        'cancelado_en', g.cancelado_en, 'cancelado_motivo', g.cancelado_motivo,
        'expira_en', g.expira_en, 'mp_estado', g.mp_estado
      ) order by g.creado_en)
        from public.pagos_mesa g where g.sesion_id = p_sesion
    ), '[]'::json),
    'totales', (
      select json_build_object(
        'consumo', v_consumo,
        'propinas', coalesce(sum(g.propina) filter (where g.estado <> 'cancelado'), 0),
        'recargos', coalesce(sum(g.recargo) filter (where g.estado <> 'cancelado'), 0),
        'total', v_consumo
                 + coalesce(sum(g.propina + g.recargo) filter (where g.estado <> 'cancelado'), 0),
        'pagado', coalesce(sum(g.monto_total) filter (where g.estado = 'pagado'), 0),
        'pendiente_confirmar', coalesce(sum(g.monto_total) filter (where g.estado = 'pendiente'), 0),
        'base_pagada', coalesce(sum(g.monto_base) filter (where g.estado = 'pagado'), 0),
        'base_comprometida', coalesce(sum(g.monto_base) filter (where g.estado <> 'cancelado'), 0),
        'partes_comprometidas', coalesce(sum(g.partes) filter (where g.estado <> 'cancelado' and g.modo = 'iguales'), 0),
        'falta_cubrir', greatest(v_consumo
          - coalesce(sum(g.monto_base) filter (where g.estado = 'pagado'), 0), 0),
        'disponible', greatest(v_consumo
          - coalesce(sum(g.monto_base) filter (where g.estado <> 'cancelado'), 0), 0)
      )
        from public.pagos_mesa g where g.sesion_id = p_sesion
    )
  ) into v_res;

  return v_res;
end;
$$;


-- ---------------------------------------------------------------------------
-- Sentar igual. El modal manda p_forzar cuando la mesa elegida tiene una
-- reserva más tarde, todavía fuera de los 30 minutos: esa reserva no entra
-- en mesa_en_ventana_de_reserva, así que el botón sigue sentando. La ventana
-- no se saltea: el mapa ya no deja elegir una mesa que la reserva está
-- tomando ahora, y una llamada directa no tiene que poder lo que la pantalla
-- no deja. La mesa ocupada se rechaza antes, con las filas tomadas en orden
-- de número, aunque p_forzar venga en true.
-- ---------------------------------------------------------------------------
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

  if not found or v_espera.estado not in ('esperando', 'avisado') then
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

  /* p_forzar no entra en este chequeo. */
  v_reserva := public.mesa_en_ventana_de_reserva(p_local, v_mesas);
  if v_reserva is not null then
    return json_build_object(
      'ok', false, 'reason', 'mesa-reservada', 'reservaId', v_reserva);
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

  return json_build_object('ok', true, 'forzado', coalesce(p_forzar, false));
end;
$$;

revoke all on function public.sentar_espera(uuid, uuid, integer[], boolean) from public, anon;
grant execute on function public.sentar_espera(uuid, uuid, integer[], boolean) to authenticated;

revoke all on function public.sentar_walkin(uuid, integer[], text, integer, uuid, timestamptz) from public, anon;
grant execute on function public.sentar_walkin(uuid, integer[], text, integer, uuid, timestamptz) to authenticated;

revoke all on function public.mesa_en_ventana_de_reserva(uuid, integer[]) from public, anon;
grant execute on function public.mesa_en_ventana_de_reserva(uuid, integer[]) to authenticated;

revoke all on function public._cuenta_json(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
