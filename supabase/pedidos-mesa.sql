-- ===========================================================================
-- Cicalino — Pedidos en modalidad Mesa (sin mozo, pago primero, retiro en
-- mostrador)
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: pedidos-mesa-enum.sql, mesa-sesion-activa-unica.sql,
--           staff-empleado-cobro.sql, mesa-launch-blockers.sql,
--           mesa-pedido-comensal.sql, mesas-historial.sql,
--           dias-cerrados-jornada.sql, pedidos-en-preparacion.sql
--
-- QR de mesa → carta → pedido → pago/confirmación → preparación → listo → retiro
--
-- Es una modalidad de Pedidos, no de Pagos: `locales.pedidos_modalidad`. La
-- de siempre (`mostrador`) no cambia en nada.
--
-- QUÉ SE REUTILIZA
--   mesas + qr_token     el QR impreso es el de la mesa, el mismo de siempre.
--   mesa_sesiones        una sesión por mesa y jornada, con flujo = autoservicio.
--   comensales           la identidad del teléfono (id + sha256 del secreto).
--   pedidos/pedido_items el pedido es una fila más de `pedidos`, con ítems.
--   pagos_mesa           cada cobro, ahora atado a un pedido (`pedido_id`).
--   Mercado Pago         la misma preference, el mismo webhook y la misma
--                        mp_confirmar_pago, con una rama por pedido.
--   pedidos_pagina       el tablero de Pedidos muestra estos pedidos con su
--                        mesa y sus ítems cuando ya están pagos.
--
-- INVARIANTES (en la base, no en la UI)
--   * Un pedido de autoservicio nace en `pendiente_pago`.
--   * `pendiente_pago → creado` solo si hay cobros `pagado` de ese pedido que
--     cubren su total. Ningún otro camino lo saca de ahí salvo cancelarlo.
--   * El comensal solo puede cancelar mientras está `pendiente_pago`.
--   * Las funciones de la cuenta compartida (Pagos) no operan sobre una
--     sesión de autoservicio, y al revés.
--   * Mercado Pago confirma solo por el webhook verificado; en caja confirma
--     el personal al cobrar.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) Columnas
-- ---------------------------------------------------------------------------
alter table public.locales
  add column if not exists pedidos_modalidad text not null default 'mostrador';
alter table public.locales
  drop constraint if exists locales_pedidos_modalidad_valida,
  add constraint locales_pedidos_modalidad_valida
    check (pedidos_modalidad in ('mostrador', 'mesa'));
comment on column public.locales.pedidos_modalidad is
  'Cómo funciona Pedidos: mostrador (la caja carga el pedido) o mesa (el cliente pide y paga desde el QR de la mesa y retira en el mostrador).';

alter table public.mesa_sesiones
  add column if not exists flujo text not null default 'cuenta';
alter table public.mesa_sesiones
  drop constraint if exists mesa_sesiones_flujo_valido,
  add constraint mesa_sesiones_flujo_valido
    check (flujo in ('cuenta', 'autoservicio'));
comment on column public.mesa_sesiones.flujo is
  'cuenta: la cuenta compartida de Pagos. autoservicio: Pedidos en modalidad Mesa, cada pedido se paga antes de prepararse.';

alter table public.pedidos
  add column if not exists autoservicio boolean not null default false,
  add column if not exists confirmado_en timestamptz,
  add column if not exists pago_caja_en timestamptz;
alter table public.pedidos
  drop constraint if exists pedidos_pendiente_pago_autoservicio,
  add constraint pedidos_pendiente_pago_autoservicio
    check (estado <> 'pendiente_pago' or autoservicio);
comment on column public.pedidos.confirmado_en is
  'Autoservicio: cuándo quedó pago y entró a preparación. Lo escribe solo el trigger.';
comment on column public.pedidos.pago_caja_en is
  'Autoservicio: cuándo el cliente eligió pagar en caja (el aviso de la caja).';

create index if not exists idx_pedidos_autoservicio
  on public.pedidos (local_id, estado, creado_en)
  where autoservicio;

alter table public.pagos_mesa
  add column if not exists pedido_id uuid references public.pedidos (id) on delete set null;
create index if not exists idx_pagos_mesa_pedido
  on public.pagos_mesa (pedido_id) where pedido_id is not null;
/* Un pedido tiene a lo sumo un cobro vivo. Dos aprobaciones del mismo pedido
 * no pueden quedar las dos como pagadas. */
create unique index if not exists uq_pagos_mesa_pedido_activo
  on public.pagos_mesa (pedido_id)
  where pedido_id is not null and estado in ('pendiente', 'pagado');

/* Un teléfono que pidió dos veces en la mesa recibe el aviso de los dos: la
 * suscripción es del comensal, no de un pedido. */
alter table public.push_subscriptions
  add column if not exists comensal_id uuid references public.comensales (id) on delete cascade;
create index if not exists idx_push_comensal
  on public.push_subscriptions (comensal_id) where comensal_id is not null;


-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.local_pedidos_mesa(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.local_tiene_modulo(p_local, 'pedidos')
     and coalesce((
       select l.pedidos_modalidad = 'mesa' from public.locales l where l.id = p_local
     ), false);
$$;

/* La carta, los métodos de cobro y la cuenta de Mercado Pago los usan Pagos y
 * Pedidos en modalidad Mesa. */
create or replace function public.local_usa_carta(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.local_tiene_modulo(p_local, 'pagos') or public.local_pedidos_mesa(p_local);
$$;

revoke all on function public.local_pedidos_mesa(uuid) from public, anon;
revoke all on function public.local_usa_carta(uuid) from public, anon;
grant execute on function public.local_pedidos_mesa(uuid) to authenticated, service_role;
grant execute on function public.local_usa_carta(uuid) to authenticated, service_role;

create or replace function public._autoservicio_staff_puede(p_local uuid, p_escribir boolean)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.puede_ver_local(p_local)
     and public.local_pedidos_mesa(p_local)
     and (not p_escribir or public.local_operativo(p_local));
$$;

create or replace function public._local_suscripcion_activa(p_local uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.locales l join public.organizaciones o on o.id = l.organizacion_id
     where l.id = p_local and o.activo
       and coalesce(o.estado_suscripcion, 'active') <> 'expired');
$$;

create or replace function public._total_pedido(p_pedido uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(i.subtotal), 0)::integer
    from public.pedido_items i where i.pedido_id = p_pedido;
$$;

/* Un pedido de autoservicio tal como lo ven el cliente, la caja y la cocina. */
create or replace function public._pedido_autoservicio_json(p_pedido uuid)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id,
    'referencia', p.referencia,
    'alias', p.alias_cliente,
    'estado', p.estado,
    'mesa_numero', s.mesa_numero,
    'sesion_id', p.sesion_id,
    'comensal_id', p.comensal_id,
    'creado_en', p.creado_en,
    'confirmado_en', p.confirmado_en,
    'en_preparacion_en', p.en_preparacion_en,
    'listo_en', p.listo_en,
    'retirado_en', p.retirado_en,
    'cancelado_en', p.cancelado_en,
    'avisado_en', p.avisado_en,
    'pago_caja_en', p.pago_caja_en,
    'total', public._total_pedido(p.id),
    'items', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'producto_id', i.producto_id, 'nombre', i.nombre,
        'precio_unitario', i.precio_unitario, 'cantidad', i.cantidad,
        'subtotal', i.subtotal
      ) order by i.creado_en, i.nombre)
        from public.pedido_items i where i.pedido_id = p.id
    ), '[]'::json),
    /* El cobro que importa: el pagado si lo hay, si no el último intento. */
    'pago', (
      select json_build_object(
        'id', g.id, 'metodo', g.metodo, 'estado', g.estado,
        'monto_total', g.monto_total, 'expira_en', g.expira_en,
        'mp_estado', g.mp_estado, 'confirmado_en', g.confirmado_en,
        'creado_por', g.creado_por
      )
        from public.pagos_mesa g
       where g.pedido_id = p.id
       order by case g.estado when 'pagado' then 0 when 'pendiente' then 1 else 2 end,
                g.creado_en desc
       limit 1
    )
  )
    from public.pedidos p
    left join public.mesa_sesiones s on s.id = p.sesion_id
   where p.id = p_pedido;
$$;

revoke all on function public._autoservicio_staff_puede(uuid, boolean) from public, anon, authenticated;
revoke all on function public._local_suscripcion_activa(uuid) from public, anon, authenticated;
revoke all on function public._total_pedido(uuid) from public, anon, authenticated;
revoke all on function public._pedido_autoservicio_json(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2) Carta y cobros: los edita también un local con Pedidos en modalidad Mesa.
--    Mismas policies que split-payments.sql / menu-categorias.sql, cambiando
--    solo el chequeo del módulo.
-- ---------------------------------------------------------------------------
drop policy if exists "productos alta" on public.productos;
drop policy if exists "productos editar" on public.productos;
create policy "productos alta" on public.productos
  for insert with check (public.auth_gestiona_local(local_id)
              and public.local_usa_carta(local_id)
              and public.local_operativo(local_id));
create policy "productos editar" on public.productos
  for update using (public.auth_gestiona_local(local_id))
  with check (public.auth_gestiona_local(local_id)
              and public.local_usa_carta(local_id)
              and public.local_operativo(local_id));

drop policy if exists "categorias alta" on public.categorias;
drop policy if exists "categorias editar" on public.categorias;
create policy "categorias alta" on public.categorias
  for insert with check (
    public.auth_gestiona_local(local_id)
    and public.local_usa_carta(local_id)
    and public.local_operativo(local_id)
  );
create policy "categorias editar" on public.categorias
  for update using (public.auth_gestiona_local(local_id))
  with check (
    public.auth_gestiona_local(local_id)
    and public.local_usa_carta(local_id)
    and public.local_operativo(local_id)
  );

drop policy if exists "cobros insertar dueno" on public.local_cobros;
drop policy if exists "cobros actualizar dueno" on public.local_cobros;
create policy "cobros insertar dueno" on public.local_cobros
  for insert with check (public.puede_ver_local(local_id)
              and public.auth_rol()::text in ('admin', 'superadmin')
              and public.local_usa_carta(local_id)
              and public.local_operativo(local_id));
create policy "cobros actualizar dueno" on public.local_cobros
  for update using (public.puede_ver_local(local_id)
                    and public.auth_rol()::text in ('admin', 'superadmin'))
  with check (public.puede_ver_local(local_id)
              and public.auth_rol()::text in ('admin', 'superadmin')
              and public.local_usa_carta(local_id)
              and public.local_operativo(local_id));


-- ---------------------------------------------------------------------------
-- 3) Transiciones: pendiente_pago solo va a creado (pago) o cancelado.
-- ---------------------------------------------------------------------------
create or replace function public.chequear_transicion_pedido()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
       (old.estado = 'pendiente_pago' and new.estado in ('creado','cancelado'))
    or (old.estado = 'creado'         and new.estado in ('en_preparacion','listo','cancelado'))
    or (old.estado = 'en_preparacion' and new.estado in ('listo','cancelado'))
    or (old.estado = 'listo'          and new.estado in ('retirado','cancelado'))
  ) then
    raise exception 'Transición de pedido no permitida: % → %', old.estado, new.estado;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4) Guardia de pedidos de autoservicio.
--
--    Es la garantía de que un pedido sin pagar no entra a preparación: la
--    pantalla puede equivocarse, la base no deja.
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_autoservicio_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_flujo text;
  v_total integer;
  v_pagado integer;
  v_personal boolean := auth.uid() is not null
    and coalesce(public.auth_rol()::text, '') <> 'superadmin';
begin
  if tg_op = 'INSERT' then
    if new.sesion_id is not null then
      select flujo into v_flujo from public.mesa_sesiones where id = new.sesion_id;
    end if;
    if new.autoservicio then
      /* Solo lo crea pedir_autoservicio (service_role), desde el QR. */
      if v_personal then
        raise exception 'Self-service orders are placed from the table QR'
          using errcode = '42501';
      end if;
      if v_flujo is distinct from 'autoservicio' or new.comensal_id is null then
        raise exception 'Self-service order without a self-service table session'
          using errcode = 'P0001', hint = 'autoservicio-invalido';
      end if;
      if new.estado <> 'pendiente_pago' then
        raise exception 'A self-service order starts waiting for payment'
          using errcode = 'P0001', hint = 'pendiente-pago';
      end if;
      new.confirmado_en := null;
    elsif v_flujo = 'autoservicio' then
      /* pedir_como_comensal (la cuenta de Pagos) sobre una mesa que cobra
       * antes de preparar: sería un pedido que entra a cocina sin pagar. */
      raise exception 'This table pays before the order is prepared'
        using errcode = 'P0001', hint = 'flujo-autoservicio';
    end if;
    return new;
  end if;

  if new.autoservicio is distinct from old.autoservicio then
    raise exception 'pedidos.autoservicio is read only' using errcode = '42501';
  end if;
  if not old.autoservicio then
    return new;
  end if;

  /* confirmado_en lo escribe solo esta función, al confirmar. */
  if new.confirmado_en is distinct from old.confirmado_en then
    new.confirmado_en := old.confirmado_en;
  end if;

  if new.estado is distinct from old.estado then
    if coalesce(nullif(current_setting('cicalino.actor', true), ''), '') = 'comensal'
       and not (old.estado = 'pendiente_pago' and new.estado = 'cancelado') then
      raise exception 'The order is already confirmed'
        using errcode = 'P0001', hint = 'ya-confirmado';
    end if;

    if old.estado = 'pendiente_pago' and new.estado <> 'cancelado' then
      v_total := public._total_pedido(old.id);
      select coalesce(sum(monto_base), 0) into v_pagado
        from public.pagos_mesa
       where pedido_id = old.id and estado = 'pagado';
      if v_total <= 0 or v_pagado < v_total then
        raise exception 'The order is not paid yet'
          using errcode = 'P0001', hint = 'pedido-sin-pagar';
      end if;
      new.confirmado_en := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.chequear_transicion_pedido() from public, anon, authenticated;

drop trigger if exists pedidos_autoservicio_guard on public.pedidos;
create trigger pedidos_autoservicio_guard
  before insert or update on public.pedidos
  for each row execute function public.pedidos_autoservicio_guard();

/* Cancelar un pedido de autoservicio suelta su cobro pendiente. Si ya estaba
 * pago, la plata es real: queda un evento para devolverla. */
create or replace function public.pedidos_autoservicio_despues()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_pagado integer;
begin
  if not new.autoservicio or new.estado <> 'cancelado' or old.estado = 'cancelado' then
    return null;
  end if;

  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'pedido-cancelado', actualizado_en = now()
     where pedido_id = new.id and estado = 'pendiente'
    returning id, local_id, sesion_id
  loop
    perform public._mesa_evento(r.local_id, r.sesion_id, 'pago_cancelado', 'sistema',
      p_pago => r.id, p_pedido => new.id,
      p_datos => '{"motivo":"pedido-cancelado"}'::jsonb);
  end loop;

  select coalesce(sum(monto_total), 0) into v_pagado
    from public.pagos_mesa where pedido_id = new.id and estado = 'pagado';
  if v_pagado > 0 and new.sesion_id is not null then
    perform public._mesa_evento(new.local_id, new.sesion_id, 'pedido_cancelado_con_pago',
      case when auth.uid() is not null then 'personal' else 'sistema' end,
      p_pedido => new.id,
      p_datos => json_build_object('pagado', v_pagado, 'estado_previo', old.estado)::jsonb);
  end if;
  return null;
end;
$$;

drop trigger if exists pedidos_autoservicio_despues on public.pedidos;
create trigger pedidos_autoservicio_despues
  after update of estado on public.pedidos
  for each row execute function public.pedidos_autoservicio_despues();

/* mesa-pedido-comensal.sql, con una sola diferencia: en autoservicio cada
 * pedido tiene su propio cobro, así que cancelar uno no se mide contra la
 * cuenta de toda la mesa. */
create or replace function public.pedidos_mesa_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_comprometida integer;
  v_restante integer;
  v_actor text;
begin
  if (new.sesion_id is distinct from old.sesion_id
      or new.comensal_id is distinct from old.comensal_id
      or new.clave_idempotencia is distinct from old.clave_idempotencia)
     and auth.uid() is not null
     and coalesce(public.auth_rol()::text, '') <> 'superadmin' then
    raise exception 'Table order links are read only' using errcode = '42501';
  end if;

  if old.sesion_id is null or new.sesion_id is null then
    return new;
  end if;

  if new.estado = 'cancelado' and old.estado <> 'cancelado' and not old.autoservicio then
    perform 1 from public.mesa_sesiones where id = old.sesion_id for update;
    select coalesce(sum(monto_base), 0) into v_comprometida
      from public.pagos_mesa where sesion_id = old.sesion_id and estado <> 'cancelado';
    select coalesce(sum(i.subtotal), 0) into v_restante
      from public.pedido_items i join public.pedidos p on p.id = i.pedido_id
     where i.sesion_id = old.sesion_id and p.estado <> 'cancelado' and p.id <> old.id;
    if v_comprometida > v_restante then
      raise exception 'Payments already cover this order; cancel a payment first'
        using errcode = 'P0001', hint = 'pagos-exceden';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    v_actor := coalesce(nullif(current_setting('cicalino.actor', true), ''),
      case when auth.uid() is not null then 'personal' else 'sistema' end);
    /* Pago confirmado → preparación: el evento con el cobro lo escribe quien
     * confirmó (caja o Mercado Pago), no se repite acá como "pedido_creado". */
    if not (old.estado = 'pendiente_pago' and new.estado = 'creado') then
      perform public._mesa_evento(old.local_id, old.sesion_id, 'pedido_' || new.estado::text,
        v_actor, p_pedido => old.id,
        p_comensal => case when v_actor = 'comensal' then old.comensal_id end);
    end if;
    perform public._tocar_sesion(old.sesion_id);
  end if;
  return new;
end;
$$;

revoke all on function public.pedidos_autoservicio_guard() from public, anon, authenticated;
revoke all on function public.pedidos_autoservicio_despues() from public, anon, authenticated;
revoke all on function public.pedidos_mesa_guard() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5) Cobros y sesiones: cada flujo con lo suyo.
-- ---------------------------------------------------------------------------
create or replace function public.pagos_mesa_flujo_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_flujo text;
  v_ped public.pedidos%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.pedido_id is distinct from old.pedido_id then
      raise exception 'pagos_mesa.pedido_id is read only' using errcode = '42501';
    end if;
    return new;
  end if;

  select flujo into v_flujo from public.mesa_sesiones where id = new.sesion_id;
  if v_flujo = 'autoservicio' and new.pedido_id is null then
    /* pagar_como_comensal, definir_parte, pagar_todo o registrar_pago_personal
     * sobre una mesa de autoservicio: ahí no hay cuenta compartida. */
    raise exception 'Self-service tables pay each order'
      using errcode = 'P0001', hint = 'flujo-autoservicio';
  end if;
  if coalesce(v_flujo, 'cuenta') = 'cuenta' and new.pedido_id is not null then
    raise exception 'Order payments belong to self-service tables'
      using errcode = 'P0001', hint = 'flujo-cuenta';
  end if;
  if new.pedido_id is not null then
    select * into v_ped from public.pedidos where id = new.pedido_id;
    if not found or not v_ped.autoservicio or v_ped.sesion_id is distinct from new.sesion_id then
      raise exception 'Payment for an order of another table'
        using errcode = 'P0001', hint = 'pedido-invalido';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pagos_mesa_flujo_guard on public.pagos_mesa;
create trigger pagos_mesa_flujo_guard
  before insert or update on public.pagos_mesa
  for each row execute function public.pagos_mesa_flujo_guard();

/* Una mesa de autoservicio no se "paga" entera, no se pide la cuenta ni se
 * llama al mozo: no hay mozo. */
create or replace function public.mesa_sesiones_flujo_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.flujo is distinct from old.flujo then
    raise exception 'mesa_sesiones.flujo is read only' using errcode = '42501';
  end if;
  if new.flujo = 'autoservicio' and (
       new.estado = 'pagada'
       or new.cuenta_solicitada_en is distinct from old.cuenta_solicitada_en
       or new.cuenta_intencion is distinct from old.cuenta_intencion
       or new.llamado_en is distinct from old.llamado_en
       or new.modo_division is distinct from old.modo_division) then
    raise exception 'Not available on a self-service table'
      using errcode = 'P0001', hint = 'flujo-autoservicio';
  end if;
  return new;
end;
$$;

drop trigger if exists mesa_sesiones_flujo_guard on public.mesa_sesiones;
create trigger mesa_sesiones_flujo_guard
  before update on public.mesa_sesiones
  for each row execute function public.mesa_sesiones_flujo_guard();

revoke all on function public.pagos_mesa_flujo_guard() from public, anon, authenticated;
revoke all on function public.mesa_sesiones_flujo_guard() from public, anon, authenticated;

/* mesa-launch-blockers.sql + autoservicio: la cobertura es de cada pedido, no
 * de la sesión, así que una mesa de autoservicio nunca queda "pagada". */
create or replace function public._revisar_cobertura(p_sesion uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_consumo integer;
  v_pagado integer;
  v_local uuid;
  v_estado public.mesa_sesion_estado;
  v_flujo text;
begin
  select estado, flujo into v_estado, v_flujo from public.mesa_sesiones where id = p_sesion;
  if v_flujo = 'autoservicio' then
    return;
  end if;
  v_consumo := public._consumo_sesion(p_sesion);
  select coalesce(sum(monto_base), 0) into v_pagado
    from public.pagos_mesa where sesion_id = p_sesion and estado = 'pagado';

  if v_consumo > 0 and v_pagado >= v_consumo then
    update public.mesa_sesiones
       set estado = 'pagada', pagada_en = now()
     where id = p_sesion and estado = 'abierta'
    returning local_id into v_local;
    if v_local is not null then
      perform public._mesa_evento(v_local, p_sesion, 'mesa_pagada', 'sistema',
        p_datos => json_build_object('consumo', v_consumo, 'pagado', v_pagado)::jsonb);
    end if;
  elsif v_estado = 'pagada' then
    update public.mesa_sesiones
       set estado = 'abierta', pagada_en = null, actualizado_en = now()
     where id = p_sesion and estado = 'pagada';
  end if;
end;
$$;

revoke all on function public._revisar_cobertura(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6) Cerrar una sesión (jornada, o cambio de modalidad del local).
--    Igual que mesa-launch-blockers.sql, y además los pedidos de
--    autoservicio que nadie pagó se cancelan: no quedan colgados para mañana.
-- ---------------------------------------------------------------------------
create or replace function public._cerrar_sesion(p_sesion uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'jornada-cerrada');
  r record;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion for update;
  if not found or v_s.estado = 'cerrada' then
    return;
  end if;

  if v_s.flujo = 'autoservicio' then
    update public.pedidos
       set estado = 'cancelado', cancelado_en = now()
     where sesion_id = v_s.id and estado = 'pendiente_pago';
  end if;

  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = v_motivo, actualizado_en = now()
     where sesion_id = v_s.id and estado in ('pendiente', 'definido')
    returning id
  loop
    perform public._mesa_evento(v_s.local_id, v_s.id, 'pago_cancelado', 'sistema',
      p_pago => r.id, p_datos => json_build_object('motivo', v_motivo)::jsonb);
  end loop;

  update public.mesa_sesiones
     set estado = 'cerrada', cerrada_en = now(), cerrada_motivo = v_motivo,
         version = version + 1, actualizado_en = now()
   where id = v_s.id;
  perform public._mesa_evento(v_s.local_id, v_s.id, 'mesa_cerrada', 'sistema',
    p_datos => json_build_object('motivo', v_motivo,
      'cuenta', public._cuenta_json(v_s.id)->'totales')::jsonb);
end;
$$;

create or replace function public._cerrar_sesion_jornada(p_sesion uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._cerrar_sesion(p_sesion, 'jornada-cerrada');
end;
$$;

revoke all on function public._cerrar_sesion(uuid, text) from public, anon, authenticated;
revoke all on function public._cerrar_sesion_jornada(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7) El QR de la mesa sabe a qué flujo lleva.
--    En modalidad Mesa cada mesa tiene QR: `qr_activo` es el opt-in de Pagos.
-- ---------------------------------------------------------------------------
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
    'operativo', public._local_suscripcion_activa(v_l.id));
end;
$$;

revoke all on function public.mesa_por_qr(text) from public, anon, authenticated;
grant execute on function public.mesa_por_qr(text) to service_role;

/* mesa-sesion-activa-unica.sql, más: en modalidad Mesa la cuenta compartida
 * no se abre; y una sesión de autoservicio que quedó de antes de cambiar de
 * modalidad se cierra en vez de trabar la mesa. */
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
  if public.local_pedidos_mesa(v_m.local_id)
     or not public.local_tiene_modulo(v_m.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  if not public._local_suscripcion_activa(v_m.local_id) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  v_desde := public.jornada_inicio_local(v_m.local_id);

  perform 1 from public.mesa_sesiones
   where mesa_id = v_m.id and estado in ('abierta', 'pagada')
   for update;

  /* Lo de otra jornada se cierra como siempre. Una sesión de autoservicio
   * quedó de cuando el local estaba en modalidad Mesa: la mesa vuelve a ser
   * de la cuenta compartida. */
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

revoke all on function public.unirse_mesa(text, text, text) from public, anon, authenticated;
grant execute on function public.unirse_mesa(text, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 8) Comensal (service_role; /api/m/[token]/autoservicio/* los llama)
-- ---------------------------------------------------------------------------

/* Entrar a la mesa: una sesión de autoservicio por mesa y jornada, un
 * comensal por teléfono. Mismas reglas de nombre y secreto que unirse_mesa. */
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
   where mesa_id = v_m.id and estado in ('abierta', 'pagada')
   order by case estado when 'abierta' then 0 else 1 end, abierta_en desc
   limit 1;

  if found and v_s.flujo = 'cuenta' then
    /* Una cuenta de Pagos abierta de antes de pasar a modalidad Mesa. Si no
     * tiene nada, se cierra; si tiene consumo o cobros, es plata: la cierra
     * el personal desde Pagos. */
    if public._consumo_sesion(v_s.id) = 0
       and not exists (select 1 from public.pagos_mesa g
                        where g.sesion_id = v_s.id and g.estado <> 'cancelado') then
      perform public._cerrar_sesion(v_s.id, 'cambio-modalidad');
      v_s := null;
    else
      return json_build_object('ok', false, 'reason', 'mesa-ocupada');
    end if;
  end if;

  if v_s.id is null then
    insert into public.mesa_sesiones (local_id, mesa_id, mesa_numero, flujo)
    values (v_m.local_id, v_m.id, v_m.numero, 'autoservicio')
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

/* Lo que ve quien escanea el QR de la mesa.
 *
 * Sin credencial (primera vez, o el navegador perdió la cookie): la mesa y
 * los pedidos de hoy que siguen vivos, con número y estado — para poder
 * volver y ver si el suyo está listo. Con credencial: además los pedidos de
 * ese teléfono, con ítems y cobro. */
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

/* Crea un cobro de un pedido. Quien llama ya autorizó al actor y tiene la
 * sesión bloqueada. El monto sale de los ítems del pedido, nunca del cliente.
 * Sin propina ni recargo: el cliente vio un total y paga ese total. */
create or replace function public._crear_pago_pedido(
  p_pedido uuid,
  p_metodo public.metodo_pago_mesa,
  p_actor text,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pedidos%rowtype;
  v_mesa integer;
  v_total integer;
  v_confirmar boolean;
  v_pago public.pagos_mesa%rowtype;
begin
  select * into v_p from public.pedidos where id = p_pedido;
  if not found or not v_p.autoservicio or v_p.sesion_id is null then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not public._metodo_mesa_habilitado(v_p.local_id, p_metodo, p_actor) then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
  end if;
  v_total := public._total_pedido(v_p.id);
  if v_total <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;
  select mesa_numero into v_mesa from public.mesa_sesiones where id = v_p.sesion_id;

  /* Cobrado por el personal = plata en mano. Mercado Pago confirma solo el
   * webhook (_metodo_mesa_habilitado no lo deja para el personal). */
  v_confirmar := p_actor = 'personal';

  insert into public.pagos_mesa (
    local_id, sesion_id, comensal_id, pedido_id, pagador_nombre, modo, partes,
    monto_base, metodo, estado, creado_por, confirmacion, confirmado_en,
    confirmado_por, confirmado_empleado, expira_en
  ) values (
    v_p.local_id, v_p.sesion_id, v_p.comensal_id, v_p.id,
    left(coalesce(nullif(btrim(v_p.alias_cliente), ''), 'Mesa ' || v_mesa), 40),
    'uno', 1, v_total, p_metodo,
    case when v_confirmar then 'pagado'::public.pago_mesa_estado else 'pendiente' end,
    p_actor,
    case when v_confirmar then 'manual' end,
    case when v_confirmar then now() end,
    case when v_confirmar then auth.uid() end,
    case when v_confirmar then p_empleado end,
    case when p_metodo = 'mercado_pago' then now() + interval '30 minutes' end
  )
  returning * into v_pago;

  perform public._mesa_evento(v_p.local_id, v_p.sesion_id,
    case when v_confirmar then 'pago_registrado_pagado' else 'pago_creado' end,
    p_actor,
    p_comensal => case when p_actor = 'comensal' then v_p.comensal_id end,
    p_pedido => v_p.id, p_pago => v_pago.id, p_empleado => p_empleado,
    p_datos => json_build_object('metodo', p_metodo, 'monto_base', v_total)::jsonb);

  return json_build_object('ok', true, 'pago_id', v_pago.id, 'metodo', v_pago.metodo,
    'estado', v_pago.estado, 'monto_total', v_pago.monto_total,
    'expira_en', v_pago.expira_en);
end;
$$;

/* Armar el pedido y elegir cómo pagarlo, en un solo paso: no queda un pedido
 * sin forma de pago en el medio. Nace esperando el pago. */
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
  v_pago json;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if p_clave is null or coalesce(p_metodo, '') not in ('caja', 'mercado_pago') then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if not found or v_s.estado <> 'abierta' or v_s.flujo <> 'autoservicio'
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
  select count(*) into v_validas
    from jsonb_array_elements(p_items) e
    join public.productos pr
      on pr.id = (e->>'producto_id')::uuid
     and pr.local_id = v_s.local_id and pr.activo
   where jsonb_typeof(e->'cantidad') = 'number'
     and (e->>'cantidad')::int between 1 and 50;
  if v_validas <> v_lineas
     or (select count(distinct e->>'producto_id') from jsonb_array_elements(p_items) e) <> v_lineas then
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
    precio_unitario, cantidad
  )
  select v_pedido, v_s.local_id, v_s.id, v_c.id, pr.id, pr.nombre, pr.precio,
         (e->>'cantidad')::int
    from jsonb_array_elements(p_items) e
    join public.productos pr on pr.id = (e->>'producto_id')::uuid;

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

/* Cambiar cómo se paga un pedido que sigue esperando: Mercado Pago no anduvo
 * y va a la caja, o al revés. */
create or replace function public.pagar_pedido_autoservicio(
  p_comensal uuid,
  p_token_hash text,
  p_pedido uuid,
  p_metodo text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_p public.pedidos%rowtype;
  v_pend public.pagos_mesa%rowtype;
  v_pago json;
  r record;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if coalesce(p_metodo, '') not in ('caja', 'mercado_pago') then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  perform 1 from public.mesa_sesiones where id = v_c.sesion_id for update;
  select * into v_p from public.pedidos
   where id = p_pedido and comensal_id = v_c.id and autoservicio
     for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_p.estado = 'cancelado' then
    return json_build_object('ok', false, 'reason', 'pedido-cancelado');
  end if;
  if v_p.estado <> 'pendiente_pago' then
    return json_build_object('ok', false, 'reason', 'ya-confirmado');
  end if;
  if not public._local_suscripcion_activa(v_p.local_id) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
  end if;

  perform public._expirar_pagos_mp(v_p.sesion_id);

  select * into v_pend from public.pagos_mesa
   where pedido_id = v_p.id and estado = 'pendiente'
   order by creado_en desc limit 1;

  if p_metodo = 'mercado_pago' then
    if not public._metodo_mesa_habilitado(v_p.local_id, 'mercado_pago', 'comensal') then
      return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
    end if;
    update public.pedidos set pago_caja_en = null where id = v_p.id and pago_caja_en is not null;
    if v_pend.id is not null then
      perform public._tocar_sesion(v_p.sesion_id);
      return json_build_object('ok', true, 'repetido', true, 'pago_id', v_pend.id,
        'metodo', 'mercado_pago');
    end if;
    v_pago := public._crear_pago_pedido(v_p.id, 'mercado_pago', 'comensal');
    if coalesce(v_pago->>'ok', '') <> 'true' then
      return v_pago;
    end if;
    perform public._tocar_sesion(v_p.sesion_id);
    return json_build_object('ok', true, 'pago_id', (v_pago->>'pago_id')::uuid,
      'metodo', 'mercado_pago');
  end if;

  /* A la caja: el checkout que estaba abierto se suelta. Si Mercado Pago lo
   * aprueba igual después, mp_confirmar_pago lo toma (si el pedido sigue
   * esperando) o lo deja como excedente para devolver. */
  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'cambio-a-caja', actualizado_en = now()
     where pedido_id = v_p.id and estado = 'pendiente'
    returning id
  loop
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'comensal',
      p_comensal => v_c.id, p_pedido => v_p.id, p_pago => r.id,
      p_datos => '{"motivo":"cambio-a-caja"}'::jsonb);
  end loop;
  update public.pedidos set pago_caja_en = coalesce(pago_caja_en, now()) where id = v_p.id;
  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_en_caja', 'comensal',
    p_comensal => v_c.id, p_pedido => v_p.id);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true, 'metodo', 'caja');
end;
$$;

/* El cliente se arrepiente antes de pagar. Después de pagar, ya no. */
create or replace function public.cancelar_pedido_autoservicio(
  p_comensal uuid,
  p_token_hash text,
  p_pedido uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_p public.pedidos%rowtype;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;

  perform 1 from public.mesa_sesiones where id = v_c.sesion_id for update;
  select * into v_p from public.pedidos
   where id = p_pedido and comensal_id = v_c.id and autoservicio
     for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_p.estado = 'cancelado' then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  if v_p.estado <> 'pendiente_pago' then
    return json_build_object('ok', false, 'reason', 'ya-confirmado');
  end if;

  perform set_config('cicalino.actor', 'comensal', true);
  update public.pedidos
     set estado = 'cancelado', cancelado_en = now()
   where id = v_p.id and estado = 'pendiente_pago';
  perform set_config('cicalino.actor', '', true);
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.unirse_mesa_autoservicio(text, text, text) from public, anon, authenticated;
revoke all on function public.mesa_autoservicio_estado(text, uuid, text) from public, anon, authenticated;
revoke all on function public._crear_pago_pedido(uuid, public.metodo_pago_mesa, text, uuid) from public, anon, authenticated;
revoke all on function public.pedir_autoservicio(uuid, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.pagar_pedido_autoservicio(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.cancelar_pedido_autoservicio(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.unirse_mesa_autoservicio(text, text, text) to service_role;
grant execute on function public.mesa_autoservicio_estado(text, uuid, text) to service_role;
grant execute on function public.pedir_autoservicio(uuid, text, jsonb, uuid, text) to service_role;
grant execute on function public.pagar_pedido_autoservicio(uuid, text, uuid, text) to service_role;
grant execute on function public.cancelar_pedido_autoservicio(uuid, text, uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 9) Caja (authenticated)
-- ---------------------------------------------------------------------------

/* Lo que la caja tiene que cobrar: pedidos de la jornada esperando el pago,
 * con mesa, importe y lo que eligió el cliente. */
create or replace function public.pedidos_por_cobrar(p_local uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_desde timestamptz;
  r record;
begin
  if not public._autoservicio_staff_puede(p_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_desde := public.jornada_inicio_local(p_local);

  for r in
    select distinct g.sesion_id
      from public.pagos_mesa g
      join public.pedidos p on p.id = g.pedido_id
     where p.local_id = p_local and p.autoservicio and p.estado = 'pendiente_pago'
       and g.estado = 'pendiente' and g.metodo = 'mercado_pago'
  loop
    perform public._expirar_pagos_mp(r.sesion_id);
  end loop;

  return coalesce((
    select json_agg(public._pedido_autoservicio_json(p.id)
             order by (p.pago_caja_en is null), coalesce(p.pago_caja_en, p.creado_en))
      from public.pedidos p
     where p.local_id = p_local and p.autoservicio
       and p.estado = 'pendiente_pago'
       and p.creado_en >= v_desde
  ), '[]'::json);
end;
$$;

/* Cobrar en caja. La plata está en la mano del empleado: el cobro queda
 * pagado y el pedido entra a preparación en la misma transacción. */
create or replace function public.cobrar_pedido_autoservicio(
  p_pedido uuid,
  p_metodo text,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pedidos%rowtype;
  v_metodo public.metodo_pago_mesa;
  v_attr json;
  v_pago json;
  r record;
begin
  select * into v_p from public.pedidos where id = p_pedido;
  if not found or not v_p.autoservicio
     or not public._autoservicio_staff_puede(v_p.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  begin
    v_metodo := p_metodo::public.metodo_pago_mesa;
  exception when others then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end;
  if v_metodo = 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'mp-solo-webhook');
  end if;

  v_attr := public._staff_empleado_cobro(v_p.local_id, p_empleado);
  if coalesce(v_attr->>'ok', '') <> 'true' then
    return json_build_object('ok', false, 'reason', coalesce(v_attr->>'reason', 'empleado-invalido'));
  end if;
  p_empleado := nullif(v_attr->>'empleado', '')::uuid;

  perform 1 from public.mesa_sesiones where id = v_p.sesion_id for update;
  select * into v_p from public.pedidos where id = p_pedido for update;

  if v_p.estado = 'cancelado' then
    return json_build_object('ok', false, 'reason', 'pedido-cancelado');
  end if;
  if v_p.estado <> 'pendiente_pago' then
    /* Otra caja (o Mercado Pago) se adelantó: ya está pago. */
    return json_build_object('ok', true, 'repetido', true);
  end if;

  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'cobrado-en-caja', actualizado_en = now()
     where pedido_id = v_p.id and estado = 'pendiente'
    returning id
  loop
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'personal',
      p_pedido => v_p.id, p_pago => r.id, p_empleado => p_empleado,
      p_datos => '{"motivo":"cobrado-en-caja"}'::jsonb);
  end loop;

  v_pago := public._crear_pago_pedido(v_p.id, v_metodo, 'personal', p_empleado);
  if coalesce(v_pago->>'ok', '') <> 'true' then
    return v_pago;
  end if;

  update public.pedidos set estado = 'creado' where id = v_p.id and estado = 'pendiente_pago';
  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pedido_confirmado', 'personal',
    p_pedido => v_p.id, p_pago => (v_pago->>'pago_id')::uuid, p_empleado => p_empleado,
    p_datos => json_build_object('metodo', v_metodo)::jsonb);
  perform public._tocar_sesion(v_p.sesion_id);

  return json_build_object('ok', true, 'pago_id', (v_pago->>'pago_id')::uuid,
    'monto_total', (v_pago->>'monto_total')::int);
end;
$$;

revoke all on function public.pedidos_por_cobrar(uuid) from public, anon;
revoke all on function public.cobrar_pedido_autoservicio(uuid, text, uuid) from public, anon;
grant execute on function public.pedidos_por_cobrar(uuid) to authenticated;
grant execute on function public.cobrar_pedido_autoservicio(uuid, text, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 10) Mercado Pago: mesa-launch-blockers.sql + una rama por pedido.
--
--     Para un cobro de autoservicio, lo que decide es el pedido: si sigue
--     esperando y nadie más lo pagó, la aprobación lo confirma (aunque llegue
--     tarde: la plata es real y el cliente está esperando). Si no, queda como
--     excedente para devolver, igual que en la cuenta compartida.
-- ---------------------------------------------------------------------------
create or replace function public.mp_confirmar_pago(
  p_local uuid,
  p_pago uuid,
  p_mp_pago_id text,
  p_mp_estado text,
  p_monto numeric,
  p_moneda text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
  v_ped public.pedidos%rowtype;
  v_sesion public.mesa_sesion_estado;
  v_consumo integer;
  v_pagado integer;
  v_cubrir boolean;
  r record;
begin
  perform 1 from public.mesa_sesiones s
    join public.pagos_mesa g on g.sesion_id = s.id
   where g.id = p_pago for update of s;

  select * into v_p from public.pagos_mesa where id = p_pago for update;
  if not found or v_p.local_id <> p_local or v_p.metodo <> 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'pago-desconocido');
  end if;

  if v_p.mp_pago_id is not null and v_p.mp_pago_id <> p_mp_pago_id then
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'mp_pago_duplicado', 'mercado_pago',
      p_pago => v_p.id, p_datos => json_build_object('mp_pago_id', p_mp_pago_id,
        'estado', p_mp_estado, 'monto', p_monto)::jsonb);
    return json_build_object('ok', false, 'reason', 'duplicado');
  end if;

  if p_mp_estado = 'approved' then
    if p_moneda <> 'ARS' or p_monto <> v_p.monto_total then
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'mp_monto_inconsistente', 'mercado_pago',
        p_pago => v_p.id, p_datos => json_build_object('mp_pago_id', p_mp_pago_id,
          'monto', p_monto, 'moneda', p_moneda, 'esperado', v_p.monto_total)::jsonb);
      update public.pagos_mesa set mp_pago_id = p_mp_pago_id, mp_estado = 'monto-inconsistente',
             actualizado_en = now() where id = v_p.id;
      perform public._tocar_sesion(v_p.sesion_id);
      return json_build_object('ok', false, 'reason', 'monto-inconsistente');
    end if;

    if v_p.estado = 'pagado' then
      return json_build_object('ok', true, 'repetido', true);
    end if;

    if v_p.pedido_id is not null then
      select * into v_ped from public.pedidos where id = v_p.pedido_id for update;
      v_cubrir := found
        and v_ped.estado = 'pendiente_pago'
        and v_p.estado in ('pendiente', 'cancelado')
        and v_p.monto_base >= public._total_pedido(v_ped.id)
        and not exists (
          select 1 from public.pagos_mesa g
           where g.pedido_id = v_ped.id and g.estado = 'pagado' and g.id <> v_p.id);
    else
      select estado into v_sesion from public.mesa_sesiones where id = v_p.sesion_id;
      v_consumo := public._consumo_sesion(v_p.sesion_id);
      select coalesce(sum(monto_base), 0) into v_pagado
        from public.pagos_mesa
       where sesion_id = v_p.sesion_id and estado = 'pagado';

      v_cubrir := v_p.estado = 'pendiente'
        and v_sesion = 'abierta'
        and (v_consumo <= 0 or v_pagado + v_p.monto_base <= v_consumo);
    end if;

    if not v_cubrir then
      update public.pagos_mesa
         set mp_pago_id = p_mp_pago_id,
             mp_estado = 'excedente',
             estado = case when estado = 'pendiente' then 'cancelado' else estado end,
             cancelado_en = case when estado = 'pendiente' then now() else cancelado_en end,
             cancelado_motivo = case
               when estado = 'pendiente' then 'mp-excedente'
               else cancelado_motivo
             end,
             actualizado_en = now()
       where id = v_p.id;
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'excedente', 'mercado_pago',
        p_pago => v_p.id, p_pedido => v_p.pedido_id,
        p_datos => json_build_object('mp_pago_id', p_mp_pago_id, 'monto', p_monto,
          'estado_previo', v_p.estado, 'sesion', v_sesion,
          'pedido', v_ped.estado)::jsonb);
      perform public._tocar_sesion(v_p.sesion_id);
      return json_build_object('ok', true, 'excedente', true);
    end if;

    if v_p.pedido_id is not null then
      /* Otro intento del mismo pedido que seguía abierto (el cliente volvió a
       * tocar "Pagar"): se suelta, este es el que pagó. */
      for r in
        update public.pagos_mesa
           set estado = 'cancelado', cancelado_en = now(),
               cancelado_motivo = 'otro-pago-aprobado', actualizado_en = now()
         where pedido_id = v_p.pedido_id and estado = 'pendiente' and id <> v_p.id
        returning id
      loop
        perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'sistema',
          p_pago => r.id, p_pedido => v_p.pedido_id,
          p_datos => '{"motivo":"otro-pago-aprobado"}'::jsonb);
      end loop;
    end if;

    update public.pagos_mesa
       set estado = 'pagado', confirmacion = 'webhook', confirmado_en = now(),
           mp_pago_id = p_mp_pago_id, mp_estado = p_mp_estado,
           cancelado_en = null, cancelado_motivo = null, actualizado_en = now()
     where id = v_p.id;

    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_confirmado',
      'mercado_pago', p_pago => v_p.id, p_pedido => v_p.pedido_id,
      p_datos => json_build_object('mp_pago_id', p_mp_pago_id, 'monto', p_monto,
        'tarde', v_p.estado = 'cancelado')::jsonb);

    if v_p.pedido_id is not null then
      update public.pedidos set estado = 'creado'
       where id = v_p.pedido_id and estado = 'pendiente_pago';
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pedido_confirmado',
        'mercado_pago', p_pedido => v_p.pedido_id, p_pago => v_p.id);
    else
      perform public._revisar_cobertura(v_p.sesion_id);
    end if;
    perform public._tocar_sesion(v_p.sesion_id);
    return json_build_object('ok', true);
  end if;

  if p_mp_estado in ('rejected', 'cancelled', 'refunded', 'charged_back') then
    if v_p.estado = 'pendiente' then
      update public.pagos_mesa
         set estado = 'cancelado', cancelado_en = now(),
             cancelado_motivo = 'mp-' || p_mp_estado,
             mp_pago_id = p_mp_pago_id, mp_estado = p_mp_estado, actualizado_en = now()
       where id = v_p.id;
    else
      update public.pagos_mesa set mp_estado = p_mp_estado, actualizado_en = now()
       where id = v_p.id;
    end if;
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'mp_' || p_mp_estado, 'mercado_pago',
      p_pago => v_p.id, p_pedido => v_p.pedido_id,
      p_datos => json_build_object('mp_pago_id', p_mp_pago_id,
        'estado_previo', v_p.estado)::jsonb);
    perform public._tocar_sesion(v_p.sesion_id);
    return json_build_object('ok', true);
  end if;

  update public.pagos_mesa set mp_estado = p_mp_estado, actualizado_en = now()
   where id = v_p.id;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.mp_confirmar_pago(uuid, uuid, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.mp_confirmar_pago(uuid, uuid, text, text, numeric, text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 11) El tablero de Pedidos (dias-cerrados-jornada.sql).
--     Suma los pedidos de autoservicio ya pagos, con su mesa y sus ítems.
--     Los que esperan el pago no son trabajo de la cocina: van por
--     pedidos_por_cobrar. El número correlativo sigue siendo uno solo.
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_pagina(
  p_local    uuid,
  p_desde    timestamptz,
  p_filtro   text default 'todos',
  p_busqueda text default '',
  p_pagina   integer default 1,
  p_tam      integer default 9
)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_busqueda   text := btrim(coalesce(p_busqueda, ''));
  v_tam        integer := greatest(1, least(100, coalesce(p_tam, 9)));
  v_pag        integer := greatest(1, coalesce(p_pagina, 1));
  v_corte      integer;
  v_cerrados   integer[];
  v_desde      timestamptz;
  v_res        json;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  select coalesce(l.hora_corte, 6), coalesce(l.dias_cerrados, '{}'::integer[])
    into v_corte, v_cerrados
    from public.locales l
   where l.id = p_local;

  if v_corte is null or v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  v_desde := public.jornada_inicio_corte(v_corte, v_cerrados);

  with dia as (
    select p.*, s.mesa_numero
      from public.pedidos p
      left join public.mesa_sesiones s on s.id = p.sesion_id and p.autoservicio
     where p.local_id = p_local
       and p.creado_en >= v_desde
       and (p.sesion_id is null or p.autoservicio)
  ),
  tablero as (
    select * from dia where estado <> 'pendiente_pago'
  ),
  conteos as (
    select
      (select count(*) from tablero)                                   as todos,
      (select count(*) from tablero where estado in ('creado', 'en_preparacion')) as creado,
      (select count(*) from tablero where estado = 'listo')            as listo,
      (select count(*) from tablero where estado = 'retirado')         as retirado,
      (select count(*) from tablero where estado = 'cancelado')        as cancelado,
      coalesce((
        select max(nullif(substring(referencia from '^[0-9]+'), '')::bigint) from dia
      ), 0) as max_ref
  ),
  filtrados as (
    select *
      from tablero
     where (
             p_filtro = 'todos'
          or (p_filtro = 'creado' and estado in ('creado', 'en_preparacion'))
          or (p_filtro <> 'creado' and estado::text = p_filtro)
           )
       and (
             v_busqueda = ''
          or position(lower(v_busqueda) in lower(referencia)) > 0
          or (autoservicio and mesa_numero::text = v_busqueda)
          or (
               position(lower(v_busqueda) in lower(coalesce(alias_cliente, ''))) > 0
               and estado in ('creado', 'en_preparacion', 'listo')
             )
           )
  ),
  pagina as (
    select f.*, e.nombre as empleado_nombre
      from filtrados f
      left join public.empleados e on e.id = f.empleado_id
     order by case f.estado
                when 'listo'          then 0
                when 'creado'         then 1
                when 'en_preparacion' then 1
                when 'retirado'       then 2
                else 3
              end,
              coalesce(f.confirmado_en, f.creado_en) desc
     offset (v_pag - 1) * v_tam
     limit v_tam
  )
  select json_build_object(
    'items', coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'referencia', p.referencia,
        'alias_cliente', p.alias_cliente,
        'estado', p.estado,
        'creado_en', p.creado_en,
        'en_preparacion_en', p.en_preparacion_en,
        'listo_en', p.listo_en,
        'retirado_en', p.retirado_en,
        'cancelado_en', p.cancelado_en,
        'visto_en', p.visto_en,
        'qr_token', p.qr_token,
        'empleado_nombre', p.empleado_nombre,
        'autoservicio', p.autoservicio,
        'mesa_numero', p.mesa_numero,
        'confirmado_en', p.confirmado_en,
        'total', case when p.autoservicio then public._total_pedido(p.id) end,
        'pago_metodo', case when p.autoservicio then (
          select g.metodo from public.pagos_mesa g
           where g.pedido_id = p.id and g.estado = 'pagado' limit 1) end,
        'items', case when p.autoservicio then coalesce((
          select json_agg(json_build_object('nombre', i.nombre, 'cantidad', i.cantidad)
                          order by i.creado_en, i.nombre)
            from public.pedido_items i where i.pedido_id = p.id), '[]'::json) end,
        'avisos_activos', exists (
          select 1
            from public.push_subscriptions ps
           where ps.pedido_id = p.id
              or (p.autoservicio and p.comensal_id is not null
                  and ps.comensal_id = p.comensal_id)
        )
      )) from pagina p
    ), '[]'::json),
    'total', (select count(*) from filtrados),
    'conteos', (
      select json_build_object(
        'todos', c.todos, 'creado', c.creado, 'listo', c.listo,
        'retirado', c.retirado, 'cancelado', c.cancelado
      ) from conteos c
    ),
    'proximoNumero', (select max_ref + 1 from conteos)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.pedidos_pagina(uuid, timestamptz, text, text, integer, integer)
  from public, anon;
grant execute on function public.pedidos_pagina(uuid, timestamptz, text, text, integer, integer)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 12) Paso automático a en_preparacion (mesa-pedido-comensal.sql).
--     Un pedido de autoservicio se comporta como uno del mostrador desde que
--     quedó pago: el minuto se cuenta desde la confirmación, no desde que el
--     cliente armó el carrito.
-- ---------------------------------------------------------------------------
create or replace function public.marcar_en_preparacion_local(p_local uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  update public.pedidos
     set estado = 'en_preparacion',
         en_preparacion_en = now()
   where local_id = p_local
     and estado = 'creado'
     and (
           (sesion_id is null and creado_en <= now() - interval '1 minute')
        or (autoservicio and confirmado_en <= now() - interval '1 minute')
         );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.marcar_en_preparacion_pendientes()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  update public.pedidos
     set estado = 'en_preparacion',
         en_preparacion_en = now()
   where estado = 'creado'
     and (
           (sesion_id is null and creado_en <= now() - interval '1 minute')
        or (autoservicio and confirmado_en <= now() - interval '1 minute')
         );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.marcar_en_preparacion_local(uuid) from public, anon;
grant execute on function public.marcar_en_preparacion_local(uuid) to authenticated;
revoke execute on function public.marcar_en_preparacion_pendientes()
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 13) Pagos (la cuenta compartida) no ve las mesas de autoservicio.
-- ---------------------------------------------------------------------------
create or replace function public.mesas_cuentas(p_local uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_desde timestamptz;
  r record;
begin
  if not public._staff_puede(p_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_desde := public.jornada_inicio_local(p_local);

  for r in select id from public.mesa_sesiones
            where local_id = p_local and estado = 'abierta' and flujo = 'cuenta'
  loop
    perform public._expirar_pagos_mp(r.id);
  end loop;

  return coalesce((
    select json_agg(public._cuenta_json(s.id) order by
             case s.estado when 'abierta' then 0 else 1 end, s.mesa_numero, s.abierta_en desc)
      from public.mesa_sesiones s
     where s.local_id = p_local
       and s.flujo = 'cuenta'
       and (s.estado = 'abierta' or coalesce(s.cerrada_en, s.pagada_en) >= v_desde)
  ), '[]'::json);
end;
$$;

revoke all on function public.mesas_cuentas(uuid) from public, anon;
grant execute on function public.mesas_cuentas(uuid) to authenticated;

create or replace function public.mesas_cierres(
  p_local     uuid,
  p_desde     timestamptz,
  p_hasta     timestamptz,
  p_estado    text default 'todas',
  p_busqueda  text default '',
  p_limite    integer default 20,
  p_offset    integer default 0
)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_q      text := btrim(coalesce(p_busqueda, ''));
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public._staff_puede(p_local, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return (
    with base as (
      select s.id,
             s.mesa_numero,
             coalesce(s.cerrada_en, s.pagada_en) as cerrado_en,
             s.cerrada_motivo as motivo,
             public._consumo_sesion(s.id) as consumo,
             coalesce((select sum(p.monto_base)
                         from public.pagos_mesa p
                        where p.sesion_id = s.id and p.estado = 'pagado'), 0)::integer as cobrado
        from public.mesa_sesiones s
       where s.local_id = p_local
         and s.flujo = 'cuenta'
         and s.estado in ('pagada', 'cerrada')
         and coalesce(s.cerrada_en, s.pagada_en) >= p_desde
         and coalesce(s.cerrada_en, s.pagada_en) < p_hasta
         and (v_q = ''
              or s.mesa_numero::text like v_q || '%'
              or exists (select 1 from public.comensales g
                          where g.sesion_id = s.id and g.nombre ilike '%' || v_q || '%'))
    ),
    filtradas as (
      select b.*,
             case when b.cobrado >= b.consumo then 'pagada' else 'sin-cobrar' end as estado
        from base b
       where b.consumo > 0
    ),
    porEstado as (
      select * from filtradas f
       where coalesce(p_estado, 'todas') = 'todas' or f.estado = p_estado
    ),
    pagina as (
      select * from porEstado order by cerrado_en desc limit v_limite offset v_offset
    )
    select json_build_object(
      'total', (select count(*) from porEstado),
      'items', coalesce((
        select json_agg(json_build_object(
                 'id', pg.id,
                 'mesa_numero', pg.mesa_numero,
                 'cerrado_en', pg.cerrado_en,
                 'consumo', pg.consumo,
                 'cobrado', pg.cobrado,
                 'estado', pg.estado,
                 'motivo', pg.motivo,
                 'metodos', (select coalesce(json_agg(distinct p.metodo::text), '[]'::json)
                               from public.pagos_mesa p
                              where p.sesion_id = pg.id and p.estado = 'pagado'),
                 'comensales', (select coalesce(json_agg(g.nombre order by g.creado_en), '[]'::json)
                                  from public.comensales g where g.sesion_id = pg.id))
               order by pg.cerrado_en desc)
          from pagina pg), '[]'::json)
    )
  );
end;
$$;

revoke all on function public.mesas_cierres(uuid, timestamptz, timestamptz, text, text, integer, integer)
  from public, anon;
grant execute on function public.mesas_cierres(uuid, timestamptz, timestamptz, text, text, integer, integer)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 14) QR: en modalidad Mesa el encargado también puede regenerar el de una
--     mesa (mesa-qr-activo.sql pedía el módulo Pagos).
-- ---------------------------------------------------------------------------
create or replace function public.regenerar_qr_mesa(p_mesa uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_local uuid;
  v_token text;
begin
  select local_id into v_local from public.mesas where id = p_mesa;
  if v_local is null
     or not (public._staff_puede(v_local, true) or public._autoservicio_staff_puede(v_local, true))
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

revoke all on function public.regenerar_qr_mesa(uuid) from public, anon;
grant execute on function public.regenerar_qr_mesa(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 15) Métricas (pedidos-en-preparacion.sql): un pedido que nunca se pagó no
--     es un pedido del local, y la espera se cuenta desde que quedó pago.
-- ---------------------------------------------------------------------------
create or replace function public.metricas_pedidos_datos(
  p_locales uuid[],
  p_desde   timestamptz,
  p_periodo text,
  p_tz      text
)
returns json
language sql stable set search_path = public as $$
  with base as (
    select
      estado, creado_en, en_preparacion_en, listo_en, retirado_en,
      coalesce(confirmado_en, creado_en) as inicio
    from public.pedidos
    where local_id = any(p_locales)
      and creado_en >= p_desde
      and not (autoservicio and confirmado_en is null)
  ),
  filas as (
    select
      estado, inicio, en_preparacion_en, listo_en, retirado_en,
      public.bucket_metrica(creado_en, p_desde, p_periodo, p_tz) as bucket,
      case
        when listo_en is not null and listo_en >= inicio
          then extract(epoch from (listo_en - inicio)) / 60
      end as espera_min,
      case
        when en_preparacion_en is not null and listo_en is not null
         and en_preparacion_en >= inicio
          then extract(epoch from (en_preparacion_en - inicio)) / 60
      end as cola_min,
      case
        when listo_en is not null and en_preparacion_en is not null
         and listo_en >= en_preparacion_en
          then extract(epoch from (listo_en - en_preparacion_en)) / 60
      end as cocina_min
    from base
  )
  select json_build_object(
    'total',     count(*),
    'avisados',  count(*) filter (where estado in ('listo', 'retirado')),
    'enCurso',   count(*) filter (where estado in ('creado', 'en_preparacion')),
    'prepMin',   avg(espera_min),
    'colaMin',   avg(cola_min),
    'cocinaMin', avg(cocina_min),
    'sinPreparacion', count(*) filter (
      where espera_min is not null and en_preparacion_en is null
    ),
    'retiroMin', avg(extract(epoch from (retirado_en - listo_en)) / 60)
                   filter (where retirado_en >= listo_en),
    'buckets',   coalesce((
      select json_agg(json_build_object('k', b.bucket, 'n', b.n) order by b.bucket)
        from (select bucket, count(*) as n from filas group by bucket) b
    ), '[]'::json),
    'tramos', json_build_array(
      json_build_object('k', 0, 'n', count(*) filter (where espera_min <  5)),
      json_build_object('k', 1, 'n', count(*) filter (where espera_min >=  5 and espera_min < 10)),
      json_build_object('k', 2, 'n', count(*) filter (where espera_min >= 10 and espera_min < 15)),
      json_build_object('k', 3, 'n', count(*) filter (where espera_min >= 15))
    )
  )
  from filas;
$$;

revoke all on function public.metricas_pedidos_datos(uuid[], timestamptz, text, text) from public;
revoke all on function public.metricas_pedidos_datos(uuid[], timestamptz, text, text) from anon;
revoke all on function public.metricas_pedidos_datos(uuid[], timestamptz, text, text) from authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: todo true salvo los dos últimos.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'locales'
             and column_name = 'pedidos_modalidad') as modalidad,
  exists (select 1 from pg_trigger where tgname = 'pedidos_autoservicio_guard') as guardia_pedidos,
  exists (select 1 from pg_trigger where tgname = 'pagos_mesa_flujo_guard') as guardia_pagos,
  has_function_privilege('authenticated', 'public.pedidos_por_cobrar(uuid)', 'EXECUTE') as caja_lee,
  has_function_privilege('authenticated',
    'public.pedir_autoservicio(uuid, text, jsonb, uuid, text)', 'EXECUTE') as auth_pide_como_comensal,
  has_function_privilege('anon', 'public.cobrar_pedido_autoservicio(uuid, text, uuid)', 'EXECUTE') as anon_cobra;
