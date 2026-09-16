-- ===========================================================================
-- Cicalino — Split payments: menu, table sessions, guests, orders, payments
-- Run in: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotent.
-- Requires: split-payments-module.sql, security-fixes-09.sql,
--           pedidos-avisos-activos.sql, liberar-mesas-jornada.sql,
--           corte-por-impago.sql
--
-- MODEL
--   mesas            existing table; gains a regenerable qr_token.
--   productos        the branch menu. Orders copy name and price.
--   mesa_sesiones    one open bill per table (partial unique index).
--   comensales       a guest in a session. The id is the real identity; the
--                    name is display only. The browser keeps a random secret
--                    and the database only stores its sha256 (token_hash).
--   pedidos          existing table; table orders are regular rows with
--                    sesion_id/comensal_id set. They are kept out of the
--                    counter board (pedidos_pagina) because it can't show
--                    items, but metrics still count them.
--   pedido_items     what each guest ordered, with name/price snapshot.
--   pagos_mesa       each payment: covered consumption (monto_base), tip and
--                    card surcharge kept apart, method, status, MP ids.
--   local_cobros     which methods a branch accepts + transfer details +
--                    card surcharges.
--   mp_cuentas       Mercado Pago OAuth tokens (encrypted by the app). No
--                    grants for anon/authenticated at all.
--   mesa_eventos     append-only audit log, written only by these functions.
--
-- INVARIANTS (enforced here, not in the UI)
--   * sum(monto_base) of pending + paid payments never exceeds consumption.
--     Every payment is created with the session row locked (FOR UPDATE).
--   * The amount of a payment is computed server-side from the split mode.
--   * Mercado Pago payments become 'pagado' only through mp_confirmar_pago,
--     callable by service_role after the webhook was verified.
--   * Transfer, cash and cards become 'pagado' only when staff confirms.
--   * The session is 'pagada' once confirmed monto_base covers consumption.
--
-- WHO CALLS WHAT
--   Guests never talk to PostgREST. /api/m/* runs with service_role, hashes the
--   guest cookie and calls the *_comensal functions, which check the hash.
--   Staff use their normal session; functions check puede_ver_local,
--   local_tiene_modulo('pagos') and local_operativo.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.mesa_sesion_estado as enum ('abierta', 'pagada', 'cerrada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.division_modo as enum ('consumo', 'iguales', 'uno', 'monto');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.metodo_pago_mesa as enum (
    'mercado_pago', 'transferencia', 'efectivo', 'tarjeta_debito', 'tarjeta_credito'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.pago_mesa_estado as enum ('pendiente', 'pagado', 'cancelado');
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- 1) Table QR
--
-- The QR carries an opaque token, not the ids: the server resolves it to
-- (local_id, mesa_id). Regenerating it invalidates printed copies without
-- touching guests already sitting at the table (they authenticate with their
-- own secret, not with the QR).
-- ---------------------------------------------------------------------------
alter table public.mesas
  add column if not exists qr_token text,
  add column if not exists qr_generado_en timestamptz;

update public.mesas
   set qr_token = gen_random_uuid()::text,
       qr_generado_en = now()
 where qr_token is null;

alter table public.mesas
  alter column qr_token set default gen_random_uuid()::text,
  alter column qr_token set not null,
  alter column qr_generado_en set default now();

create unique index if not exists uq_mesas_qr_token on public.mesas (qr_token);


-- ---------------------------------------------------------------------------
-- 2) Menu
-- ---------------------------------------------------------------------------
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  descripcion text check (descripcion is null or char_length(descripcion) <= 200),
  categoria text check (categoria is null or char_length(categoria) <= 40),
  precio integer not null check (precio > 0 and precio <= 10000000),
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_productos_local on public.productos (local_id, activo, orden);


-- ---------------------------------------------------------------------------
-- 3) Payment methods per branch
-- ---------------------------------------------------------------------------
create table if not exists public.local_cobros (
  local_id uuid primary key references public.locales (id) on delete cascade,
  acepta_mercado_pago boolean not null default false,
  acepta_transferencia boolean not null default false,
  acepta_efectivo boolean not null default true,
  acepta_debito boolean not null default true,
  acepta_credito boolean not null default true,
  transferencia_alias text check (transferencia_alias is null or char_length(transferencia_alias) <= 60),
  transferencia_titular text check (transferencia_titular is null or char_length(transferencia_titular) <= 80),
  transferencia_cbu text check (transferencia_cbu is null or transferencia_cbu ~ '^[0-9]{22}$'),
  recargo_debito_pct numeric(4,2) not null default 0
    check (recargo_debito_pct >= 0 and recargo_debito_pct <= 20),
  recargo_credito_pct numeric(4,2) not null default 0
    check (recargo_credito_pct >= 0 and recargo_credito_pct <= 20),
  /* The owner states that a surcharge is allowed for their business. Cicalino
   * can't know the rules of each jurisdiction and payment method, so without
   * that statement no surcharge can be saved. Stamped by trigger. */
  recargo_declarado boolean not null default false,
  recargo_declarado_en timestamptz,
  recargo_declarado_por uuid,
  actualizado_en timestamptz not null default now(),
  constraint local_cobros_transferencia_completa check (
    not acepta_transferencia
    or (nullif(btrim(transferencia_alias), '') is not null
        and nullif(btrim(transferencia_titular), '') is not null)
  ),
  constraint local_cobros_recargo_declarado check (
    (recargo_debito_pct = 0 and recargo_credito_pct = 0) or recargo_declarado
  )
);


-- ---------------------------------------------------------------------------
-- 4) Mercado Pago accounts (OAuth). Server only.
-- ---------------------------------------------------------------------------
create table if not exists public.mp_cuentas (
  local_id uuid primary key references public.locales (id) on delete cascade,
  mp_user_id text not null,
  access_token_cifrado text not null,
  refresh_token_cifrado text not null,
  expira_en timestamptz not null,
  live_mode boolean,
  conectado_en timestamptz not null default now(),
  conectado_por uuid,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.mp_oauth_estados (
  state_hash text primary key,
  local_id uuid not null references public.locales (id) on delete cascade,
  usuario_id uuid not null,
  code_verifier text not null,
  expira_en timestamptz not null default now() + interval '10 minutes'
);


-- ---------------------------------------------------------------------------
-- 5) Sessions and guests
-- ---------------------------------------------------------------------------
create table if not exists public.mesa_sesiones (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  mesa_id uuid references public.mesas (id) on delete set null,
  mesa_numero integer not null,
  estado public.mesa_sesion_estado not null default 'abierta',
  modo_division public.division_modo,
  partes integer check (partes is null or (partes >= 1 and partes <= 50)),
  version bigint not null default 1,
  abierta_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  pagada_en timestamptz,
  cerrada_en timestamptz,
  cerrada_motivo text check (cerrada_motivo is null or char_length(cerrada_motivo) <= 200)
);

create unique index if not exists uq_mesa_sesion_abierta
  on public.mesa_sesiones (mesa_id) where estado = 'abierta';
create index if not exists idx_mesa_sesiones_local
  on public.mesa_sesiones (local_id, estado, actualizado_en desc);

create table if not exists public.comensales (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.mesa_sesiones (id) on delete cascade,
  local_id uuid not null references public.locales (id) on delete cascade,
  /* Same rule as pedidos.alias_cliente (alias-cliente.sql): the name is
   * copied there on every order. */
  nombre text not null check (char_length(nombre) between 2 and 24),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  creado_en timestamptz not null default now(),
  visto_en timestamptz not null default now()
);

create unique index if not exists uq_comensales_token on public.comensales (token_hash);
create index if not exists idx_comensales_sesion on public.comensales (sesion_id);


-- ---------------------------------------------------------------------------
-- 6) Orders
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists sesion_id uuid references public.mesa_sesiones (id) on delete set null,
  add column if not exists comensal_id uuid references public.comensales (id) on delete set null,
  add column if not exists clave_idempotencia uuid;

create index if not exists idx_pedidos_sesion
  on public.pedidos (sesion_id) where sesion_id is not null;
create unique index if not exists uq_pedidos_comensal_clave
  on public.pedidos (comensal_id, clave_idempotencia)
  where clave_idempotencia is not null;

create table if not exists public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  local_id uuid not null references public.locales (id) on delete cascade,
  sesion_id uuid not null references public.mesa_sesiones (id) on delete cascade,
  comensal_id uuid not null references public.comensales (id) on delete cascade,
  producto_id uuid references public.productos (id) on delete set null,
  nombre text not null,
  precio_unitario integer not null check (precio_unitario > 0),
  cantidad integer not null check (cantidad between 1 and 50),
  subtotal integer generated always as (precio_unitario * cantidad) stored,
  creado_en timestamptz not null default now()
);

create index if not exists idx_pedido_items_sesion on public.pedido_items (sesion_id);
create index if not exists idx_pedido_items_pedido on public.pedido_items (pedido_id);


-- ---------------------------------------------------------------------------
-- 7) Payments
-- ---------------------------------------------------------------------------
create table if not exists public.pagos_mesa (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  sesion_id uuid not null references public.mesa_sesiones (id) on delete cascade,
  comensal_id uuid references public.comensales (id) on delete set null,
  pagador_nombre text not null check (char_length(btrim(pagador_nombre)) between 1 and 40),
  modo public.division_modo not null,
  partes integer not null default 1 check (partes between 1 and 50),
  monto_base integer not null check (monto_base > 0),
  propina integer not null default 0 check (propina >= 0),
  propina_porcentaje integer check (propina_porcentaje is null or propina_porcentaje in (5, 10, 15)),
  recargo integer not null default 0 check (recargo >= 0),
  recargo_porcentaje numeric(4,2) not null default 0,
  monto_total integer generated always as (monto_base + propina + recargo) stored,
  metodo public.metodo_pago_mesa not null,
  estado public.pago_mesa_estado not null default 'pendiente',
  creado_por text not null check (creado_por in ('comensal', 'personal')),
  clave_idempotencia uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  confirmacion text check (confirmacion is null or confirmacion in ('manual', 'webhook')),
  confirmado_en timestamptz,
  confirmado_por uuid,
  confirmado_empleado uuid references public.empleados (id) on delete set null,
  cancelado_en timestamptz,
  cancelado_motivo text check (cancelado_motivo is null or char_length(cancelado_motivo) <= 200),
  expira_en timestamptz,
  mp_preferencia_id text,
  mp_pago_id text,
  mp_estado text,
  constraint pagos_mesa_propina_tope check (propina <= monto_base),
  constraint pagos_mesa_confirmacion_coherente check (
    estado <> 'pagado'
    or (confirmado_en is not null
        and confirmacion = case when metodo = 'mercado_pago' then 'webhook' else 'manual' end)
  )
);

create index if not exists idx_pagos_mesa_sesion on public.pagos_mesa (sesion_id, estado);
create unique index if not exists uq_pagos_mesa_clave
  on public.pagos_mesa (sesion_id, clave_idempotencia) where clave_idempotencia is not null;
create unique index if not exists uq_pagos_mesa_mp_pago
  on public.pagos_mesa (mp_pago_id) where mp_pago_id is not null;


-- ---------------------------------------------------------------------------
-- 8) Audit
-- ---------------------------------------------------------------------------
create table if not exists public.mesa_eventos (
  id bigint generated always as identity primary key,
  local_id uuid not null references public.locales (id) on delete cascade,
  sesion_id uuid references public.mesa_sesiones (id) on delete cascade,
  tipo text not null,
  actor text not null check (actor in ('comensal', 'personal', 'sistema', 'mercado_pago')),
  comensal_id uuid,
  usuario_id uuid,
  empleado_id uuid,
  pedido_id uuid,
  pago_id uuid,
  datos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists idx_mesa_eventos_sesion on public.mesa_eventos (sesion_id, creado_en);
create index if not exists idx_mesa_eventos_local on public.mesa_eventos (local_id, creado_en desc);


-- ===========================================================================
-- 9) Internal helpers (no grants to clients)
-- ===========================================================================

create or replace function public._mesa_evento(
  p_local uuid, p_sesion uuid, p_tipo text, p_actor text,
  p_comensal uuid default null, p_pedido uuid default null,
  p_pago uuid default null, p_empleado uuid default null,
  p_datos jsonb default '{}'::jsonb
)
returns void
language sql security definer set search_path = public as $$
  insert into public.mesa_eventos (
    local_id, sesion_id, tipo, actor, comensal_id, usuario_id, empleado_id,
    pedido_id, pago_id, datos
  ) values (
    p_local, p_sesion, p_tipo, p_actor, p_comensal,
    case when p_actor = 'personal' then auth.uid() end,
    p_empleado, p_pedido, p_pago, coalesce(p_datos, '{}'::jsonb)
  );
$$;

create or replace function public._tocar_sesion(p_sesion uuid)
returns void
language sql security definer set search_path = public as $$
  update public.mesa_sesiones
     set version = version + 1, actualizado_en = now()
   where id = p_sesion;
$$;

/* Mercado Pago payments reserve part of the bill while the guest is in the
 * checkout. The preference expires at expira_en; past that the reservation is
 * released so the rest of the table can pay. A late approval is still
 * recorded by mp_confirmar_pago (the money is real). */
create or replace function public._expirar_pagos_mp(p_sesion uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  r record;
begin
  v_n := 0;
  for r in
    update public.pagos_mesa
       set estado = 'cancelado', cancelado_en = now(),
           cancelado_motivo = 'mp-expirado', actualizado_en = now()
     where sesion_id = p_sesion
       and metodo = 'mercado_pago'
       and estado = 'pendiente'
       and expira_en is not null
       and expira_en < now()
    returning id, local_id
  loop
    v_n := v_n + 1;
    perform public._mesa_evento(r.local_id, p_sesion, 'pago_expirado', 'sistema',
                                p_pago => r.id);
  end loop;
  if v_n > 0 then
    perform public._tocar_sesion(p_sesion);
  end if;
  return v_n;
end;
$$;

create or replace function public._consumo_sesion(p_sesion uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(i.subtotal), 0)::integer
    from public.pedido_items i
    join public.pedidos p on p.id = i.pedido_id
   where i.sesion_id = p_sesion
     and p.estado <> 'cancelado';
$$;

/* Full bill as JSON. The single source for every total shown anywhere. */
create or replace function public._cuenta_json(p_sesion uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_consumo integer;
  v_res json;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  if not found then
    return null;
  end if;
  v_consumo := public._consumo_sesion(p_sesion);

  select json_build_object(
    'sesion', json_build_object(
      'id', v_s.id, 'local_id', v_s.local_id, 'mesa_id', v_s.mesa_id,
      'mesa_numero', v_s.mesa_numero, 'estado', v_s.estado,
      'modo_division', v_s.modo_division, 'partes', v_s.partes,
      'version', v_s.version, 'abierta_en', v_s.abierta_en,
      'actualizado_en', v_s.actualizado_en, 'pagada_en', v_s.pagada_en,
      'cerrada_en', v_s.cerrada_en, 'cerrada_motivo', v_s.cerrada_motivo
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
        'creado_en', p.creado_en, 'listo_en', p.listo_en,
        'retirado_en', p.retirado_en, 'cancelado_en', p.cancelado_en,
        'items', coalesce((
          select json_agg(json_build_object(
            'id', i.id, 'comensal_id', i.comensal_id, 'producto_id', i.producto_id,
            'nombre', i.nombre, 'precio_unitario', i.precio_unitario,
            'cantidad', i.cantidad, 'subtotal', i.subtotal
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
        'partes_comprometidas', coalesce(sum(g.partes) filter (where g.estado <> 'cancelado'), 0),
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

/* Marks the session paid once confirmed consumption covers the bill. */
create or replace function public._revisar_cobertura(p_sesion uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_consumo integer;
  v_pagado integer;
  v_local uuid;
begin
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
  end if;
end;
$$;

/* Validates a guest by id + sha256 of their secret. */
create or replace function public._comensal_valido(p_comensal uuid, p_token_hash text)
returns public.comensales
language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
begin
  select * into v_c from public.comensales
   where id = p_comensal and token_hash = lower(coalesce(p_token_hash, ''));
  if not found then
    return null;
  end if;
  return v_c;
end;
$$;

/* Computes and inserts a payment. Caller has already authorized the actor and
 * must hold no lock on the session (this function takes it). */
create or replace function public._crear_pago_mesa(
  p_sesion uuid,
  p_comensal uuid,
  p_actor text,
  p_datos jsonb,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_cobros public.local_cobros%rowtype;
  v_modo public.division_modo;
  v_metodo public.metodo_pago_mesa;
  v_clave uuid;
  v_existente public.pagos_mesa%rowtype;
  v_consumo integer;
  v_comprometida integer;
  v_disponible integer;
  v_activos integer;
  v_partes_tot integer;
  v_partes_comp integer;
  v_restantes integer;
  v_partes integer;
  v_base integer;
  v_propina integer := 0;
  v_propina_pct integer;
  v_recargo integer := 0;
  v_recargo_pct numeric(4,2) := 0;
  v_esperado integer;
  v_nombre text;
  v_confirmar boolean;
  v_pago public.pagos_mesa%rowtype;
  v_mio integer;
  v_mio_comp integer;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'sesion-inexistente');
  end if;
  if v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
  end if;

  perform public._expirar_pagos_mp(p_sesion);

  begin
    v_modo := (p_datos->>'modo')::public.division_modo;
    v_metodo := (p_datos->>'metodo')::public.metodo_pago_mesa;
    v_clave := nullif(p_datos->>'clave', '')::uuid;
  exception when others then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end;
  if v_modo is null or v_metodo is null then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  /* Retries with the same key return the original payment. */
  if v_clave is not null then
    select * into v_existente from public.pagos_mesa
     where sesion_id = p_sesion and clave_idempotencia = v_clave;
    if found then
      return json_build_object('ok', true, 'repetido', true, 'pago_id', v_existente.id,
        'monto_total', v_existente.monto_total, 'metodo', v_existente.metodo,
        'estado', v_existente.estado);
    end if;
  end if;

  /* Method must be enabled for this branch. Staff can't start an online MP
   * checkout on behalf of someone. */
  select * into v_cobros from public.local_cobros where local_id = v_s.local_id;
  if not found then
    v_cobros.acepta_efectivo := true;
    v_cobros.acepta_debito := true;
    v_cobros.acepta_credito := true;
    v_cobros.acepta_transferencia := false;
    v_cobros.acepta_mercado_pago := false;
    v_cobros.recargo_debito_pct := 0;
    v_cobros.recargo_credito_pct := 0;
  end if;

  if (v_metodo = 'mercado_pago' and (p_actor <> 'comensal' or not v_cobros.acepta_mercado_pago
        or not exists (select 1 from public.mp_cuentas m where m.local_id = v_s.local_id)))
     or (v_metodo = 'transferencia' and not v_cobros.acepta_transferencia)
     or (v_metodo = 'efectivo' and not v_cobros.acepta_efectivo)
     or (v_metodo = 'tarjeta_debito' and not v_cobros.acepta_debito)
     or (v_metodo = 'tarjeta_credito' and not v_cobros.acepta_credito) then
    return json_build_object('ok', false, 'reason', 'metodo-no-disponible');
  end if;

  select count(*) into v_activos from public.pagos_mesa
   where sesion_id = p_sesion and estado <> 'cancelado';

  /* The split mode belongs to the table: the first payment fixes it, and it
   * can change only while nothing is pending or paid. */
  if v_activos > 0 and v_s.modo_division is not null
     and (v_s.modo_division <> v_modo
          or (v_modo = 'iguales' and p_datos ? 'partes_totales'
              and (p_datos->>'partes_totales')::int is distinct from v_s.partes)) then
    return json_build_object('ok', false, 'reason', 'modo-bloqueado',
      'modo_division', v_s.modo_division, 'partes', v_s.partes);
  end if;

  if v_activos = 0 then
    if v_modo = 'iguales' then
      v_partes_tot := coalesce(
        nullif(p_datos->>'partes_totales', '')::int,
        (select count(*) from public.comensales c where c.sesion_id = p_sesion)::int);
      if v_partes_tot is null or v_partes_tot < 1 or v_partes_tot > 50 then
        return json_build_object('ok', false, 'reason', 'partes-invalidas');
      end if;
    else
      v_partes_tot := null;
    end if;
    update public.mesa_sesiones
       set modo_division = v_modo, partes = v_partes_tot
     where id = p_sesion;
    v_s.modo_division := v_modo;
    v_s.partes := v_partes_tot;
  end if;

  v_consumo := public._consumo_sesion(p_sesion);
  select coalesce(sum(monto_base), 0), coalesce(sum(partes), 0)
    into v_comprometida, v_partes_comp
    from public.pagos_mesa where sesion_id = p_sesion and estado <> 'cancelado';
  v_disponible := greatest(v_consumo - v_comprometida, 0);

  if v_disponible <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;

  v_partes := 1;

  if v_modo = 'consumo' then
    if p_comensal is null then
      return json_build_object('ok', false, 'reason', 'comensal-requerido');
    end if;
    select coalesce(sum(i.subtotal), 0) into v_mio
      from public.pedido_items i join public.pedidos p on p.id = i.pedido_id
     where i.comensal_id = p_comensal and p.estado <> 'cancelado';
    select coalesce(sum(monto_base), 0) into v_mio_comp
      from public.pagos_mesa
     where comensal_id = p_comensal and sesion_id = p_sesion and estado <> 'cancelado';
    v_base := least(greatest(v_mio - v_mio_comp, 0), v_disponible);

  elsif v_modo = 'iguales' then
    v_partes := greatest(1, least(50, coalesce(nullif(p_datos->>'partes', '')::int, 1)));
    v_restantes := coalesce(v_s.partes, 1) - v_partes_comp;
    if v_restantes <= 0 then
      /* Parts are all taken but more was ordered afterwards: the remainder
       * goes as a single extra part. */
      v_base := v_disponible;
      v_partes := 1;
    elsif v_partes >= v_restantes then
      v_partes := v_restantes;
      v_base := v_disponible;
    else
      v_base := (v_disponible / v_restantes) * v_partes;
    end if;

  elsif v_modo = 'uno' then
    v_base := v_disponible;

  else -- monto
    if nullif(p_datos->>'monto', '') is not null then
      v_base := (p_datos->>'monto')::int;
    elsif nullif(p_datos->>'porcentaje', '') is not null then
      if (p_datos->>'porcentaje')::numeric <= 0 or (p_datos->>'porcentaje')::numeric > 100 then
        return json_build_object('ok', false, 'reason', 'porcentaje-invalido');
      end if;
      v_base := round(v_consumo * (p_datos->>'porcentaje')::numeric / 100)::int;
    else
      return json_build_object('ok', false, 'reason', 'monto-invalido');
    end if;
    if v_base > v_disponible then
      return json_build_object('ok', false, 'reason', 'excede',
        'disponible', v_disponible);
    end if;
  end if;

  if v_base is null or v_base <= 0 then
    return json_build_object('ok', false, 'reason', 'nada-que-pagar');
  end if;

  /* Tip: per person, over the consumption this payment covers. */
  if nullif(p_datos->>'propina_porcentaje', '') is not null then
    v_propina_pct := (p_datos->>'propina_porcentaje')::int;
    if v_propina_pct = 0 then
      v_propina_pct := null;
    elsif v_propina_pct not in (5, 10, 15) then
      return json_build_object('ok', false, 'reason', 'propina-invalida');
    else
      v_propina := round(v_base * v_propina_pct / 100.0)::int;
    end if;
  elsif nullif(p_datos->>'propina_monto', '') is not null then
    v_propina := (p_datos->>'propina_monto')::int;
    if v_propina < 0 or v_propina > v_base then
      return json_build_object('ok', false, 'reason', 'propina-invalida');
    end if;
  end if;

  /* Card surcharge, copied at creation so later config changes don't touch it.
   * Applied to consumption only. */
  if v_metodo = 'tarjeta_debito' then
    v_recargo_pct := v_cobros.recargo_debito_pct;
  elsif v_metodo = 'tarjeta_credito' then
    v_recargo_pct := v_cobros.recargo_credito_pct;
  end if;
  if v_recargo_pct > 0 then
    v_recargo := round(v_base * v_recargo_pct / 100)::int;
  end if;

  /* The guest saw an amount before confirming. If the bill moved in between
   * (someone else paid, a new order came in) we don't charge a different
   * number silently: we answer with the new one. */
  v_esperado := nullif(p_datos->>'monto_esperado', '')::int;
  if v_esperado is not null and v_esperado <> v_base + v_propina + v_recargo then
    return json_build_object('ok', false, 'reason', 'monto-cambio',
      'monto_base', v_base, 'propina', v_propina, 'recargo', v_recargo,
      'monto_total', v_base + v_propina + v_recargo);
  end if;

  if p_comensal is not null then
    select nombre into v_nombre from public.comensales where id = p_comensal and sesion_id = p_sesion;
    if v_nombre is null then
      return json_build_object('ok', false, 'reason', 'comensal-invalido');
    end if;
  else
    v_nombre := nullif(btrim(coalesce(p_datos->>'pagador_nombre', '')), '');
    if v_nombre is null or char_length(v_nombre) > 40 then
      return json_build_object('ok', false, 'reason', 'pagador-invalido');
    end if;
  end if;

  v_confirmar := p_actor = 'personal'
                 and coalesce((p_datos->>'confirmado')::boolean, false)
                 and v_metodo <> 'mercado_pago';

  insert into public.pagos_mesa (
    local_id, sesion_id, comensal_id, pagador_nombre, modo, partes, monto_base,
    propina, propina_porcentaje, recargo, recargo_porcentaje, metodo, estado,
    creado_por, clave_idempotencia, confirmacion, confirmado_en, confirmado_por,
    confirmado_empleado, expira_en
  ) values (
    v_s.local_id, p_sesion, p_comensal, v_nombre, v_modo, v_partes, v_base,
    v_propina, v_propina_pct, v_recargo, v_recargo_pct, v_metodo,
    case when v_confirmar then 'pagado'::public.pago_mesa_estado else 'pendiente' end,
    p_actor, v_clave,
    case when v_confirmar then 'manual' end,
    case when v_confirmar then now() end,
    case when v_confirmar then auth.uid() end,
    case when v_confirmar then p_empleado end,
    case when v_metodo = 'mercado_pago' then now() + interval '30 minutes' end
  )
  returning * into v_pago;

  perform public._mesa_evento(v_s.local_id, p_sesion,
    case when v_confirmar then 'pago_registrado_pagado' else 'pago_creado' end,
    p_actor, p_comensal => p_comensal, p_pago => v_pago.id, p_empleado => p_empleado,
    p_datos => json_build_object('modo', v_modo, 'metodo', v_metodo,
      'monto_base', v_base, 'propina', v_propina, 'recargo', v_recargo,
      'partes', v_partes)::jsonb);

  if v_confirmar then
    perform public._revisar_cobertura(p_sesion);
  end if;
  perform public._tocar_sesion(p_sesion);

  return json_build_object('ok', true, 'pago_id', v_pago.id,
    'monto_base', v_pago.monto_base, 'propina', v_pago.propina,
    'recargo', v_pago.recargo, 'monto_total', v_pago.monto_total,
    'metodo', v_pago.metodo, 'estado', v_pago.estado, 'expira_en', v_pago.expira_en);
end;
$$;

revoke all on function public._mesa_evento(uuid, uuid, text, text, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._tocar_sesion(uuid) from public, anon, authenticated;
revoke all on function public._expirar_pagos_mp(uuid) from public, anon, authenticated;
revoke all on function public._consumo_sesion(uuid) from public, anon, authenticated;
revoke all on function public._cuenta_json(uuid) from public, anon, authenticated;
revoke all on function public._revisar_cobertura(uuid) from public, anon, authenticated;
revoke all on function public._comensal_valido(uuid, text) from public, anon, authenticated;
revoke all on function public._crear_pago_mesa(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;


-- ===========================================================================
-- 10) Guest functions (service_role only; /api/m/* calls them)
-- ===========================================================================

/* Resolves a table QR for the landing screen. No session data. */
create or replace function public.mesa_por_qr(p_token text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_m public.mesas%rowtype;
  v_l public.locales%rowtype;
begin
  select * into v_m from public.mesas where qr_token = p_token;
  if not found then
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

  /* Locking the table serializes two guests scanning at the same time, so
   * they end up in the same session instead of opening two. */
  select * into v_m from public.mesas where qr_token = p_token for update;
  if not found then
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

  /* A session left open from a previous business day is closed, so tonight's
   * guests don't inherit this morning's bill. Pending payments are cancelled;
   * the event keeps what was left unpaid. */
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

/* Current state for a guest: who they are and the whole table bill. */
create or replace function public.cuenta_comensal(p_comensal uuid, p_token_hash text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_mesa_token text;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  perform public._expirar_pagos_mp(v_c.sesion_id);
  update public.comensales set visto_en = now()
   where id = v_c.id and visto_en < now() - interval '1 minute';
  select m.qr_token into v_mesa_token
    from public.mesa_sesiones s join public.mesas m on m.id = s.mesa_id
   where s.id = v_c.sesion_id;
  return json_build_object('ok', true,
    'comensal', json_build_object('id', v_c.id, 'nombre', v_c.nombre, 'sesion_id', v_c.sesion_id),
    'mesa_token', v_mesa_token,
    'cuenta', public._cuenta_json(v_c.sesion_id));
end;
$$;

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
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if p_clave is null then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;

  select * into v_s from public.mesa_sesiones where id = v_c.sesion_id for update;
  if v_s.estado <> 'abierta' then
    return json_build_object('ok', false, 'reason', 'mesa-cerrada');
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

  select id into v_pedido from public.pedidos
   where comensal_id = v_c.id and clave_idempotencia = p_clave;
  if found then
    return json_build_object('ok', true, 'repetido', true, 'pedido_id', v_pedido);
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    return json_build_object('ok', false, 'reason', 'datos-invalidos');
  end if;
  v_lineas := jsonb_array_length(p_items);
  if v_lineas < 1 or v_lineas > 30 then
    return json_build_object('ok', false, 'reason', 'items-invalidos');
  end if;

  /* Every line must point to an active product of this branch, once, with a
   * sane quantity. Anything else rejects the whole order. */
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
    precio_unitario, cantidad
  )
  select v_pedido, v_s.local_id, v_s.id, v_c.id, pr.id, pr.nombre, pr.precio,
         (e->>'cantidad')::int
    from jsonb_array_elements(p_items) e
    join public.productos pr on pr.id = (e->>'producto_id')::uuid;

  select coalesce(sum(subtotal), 0) into v_total from public.pedido_items where pedido_id = v_pedido;

  perform public._mesa_evento(v_s.local_id, v_s.id, 'pedido_creado', 'comensal',
    p_comensal => v_c.id, p_pedido => v_pedido,
    p_datos => json_build_object('lineas', v_lineas, 'total', v_total)::jsonb);
  perform public._tocar_sesion(v_s.id);

  return json_build_object('ok', true, 'pedido_id', v_pedido, 'total', v_total);
end;
$$;

create or replace function public.pagar_como_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_datos jsonb
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_local uuid;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if not public.local_tiene_modulo(v_c.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  return public._crear_pago_mesa(v_c.sesion_id, v_c.id, 'comensal', p_datos);
end;
$$;

create or replace function public.cancelar_pago_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_pago uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
  v_p public.pagos_mesa%rowtype;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  perform 1 from public.mesa_sesiones where id = v_c.sesion_id for update;
  select * into v_p from public.pagos_mesa
   where id = p_pago and comensal_id = v_c.id for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_p.estado <> 'pendiente' then
    return json_build_object('ok', false, 'reason', 'no-pendiente', 'estado', v_p.estado);
  end if;
  update public.pagos_mesa
     set estado = 'cancelado', cancelado_en = now(),
         cancelado_motivo = 'cancelado-por-comensal', actualizado_en = now()
   where id = v_p.id;
  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'comensal',
    p_comensal => v_c.id, p_pago => v_p.id);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true);
end;
$$;


-- ===========================================================================
-- 11) Mercado Pago (service_role only)
-- ===========================================================================

create or replace function public.mp_asociar_preferencia(p_pago uuid, p_preferencia text)
returns void
language sql security definer set search_path = public as $$
  update public.pagos_mesa
     set mp_preferencia_id = p_preferencia, actualizado_en = now()
   where id = p_pago and metodo = 'mercado_pago';
$$;

create or replace function public.mp_cancelar_pago(p_pago uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
begin
  update public.pagos_mesa
     set estado = 'cancelado', cancelado_en = now(),
         cancelado_motivo = left(p_motivo, 200), actualizado_en = now()
   where id = p_pago and metodo = 'mercado_pago' and estado = 'pendiente'
  returning * into v_p;
  if v_p.id is not null then
    perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'sistema',
      p_pago => v_p.id, p_datos => json_build_object('motivo', p_motivo)::jsonb);
    perform public._tocar_sesion(v_p.sesion_id);
  end if;
end;
$$;

/* Called by the webhook AFTER it verified the signature and fetched the
 * payment from Mercado Pago with the seller's token. Everything that decides
 * "paid" is checked again here: our payment id in external_reference, the
 * branch, the exact amount and the currency. Idempotent: MP retries. */
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
begin
  perform 1 from public.mesa_sesiones s
    join public.pagos_mesa g on g.sesion_id = s.id
   where g.id = p_pago for update of s;

  select * into v_p from public.pagos_mesa where id = p_pago for update;
  if not found or v_p.local_id <> p_local or v_p.metodo <> 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'pago-desconocido');
  end if;

  if v_p.mp_pago_id is not null and v_p.mp_pago_id <> p_mp_pago_id then
    /* A second MP payment for the same bill share (e.g. the guest paid twice).
     * Not applied: logged for staff to refund. */
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

    update public.pagos_mesa
       set estado = 'pagado', confirmacion = 'webhook', confirmado_en = now(),
           mp_pago_id = p_mp_pago_id, mp_estado = p_mp_estado,
           cancelado_en = null, cancelado_motivo = null, actualizado_en = now()
     where id = v_p.id;

    perform public._mesa_evento(v_p.local_id, v_p.sesion_id,
      case when v_p.estado = 'cancelado' then 'mp_aprobado_tarde' else 'pago_confirmado' end,
      'mercado_pago', p_pago => v_p.id,
      p_datos => json_build_object('mp_pago_id', p_mp_pago_id, 'monto', p_monto)::jsonb);

    /* An approval that arrives after the reservation expired can push the
     * table over its bill. The money is real, so it's recorded as paid and
     * flagged for staff. */
    if v_p.estado = 'cancelado'
       and (select coalesce(sum(monto_base), 0) from public.pagos_mesa
             where sesion_id = v_p.sesion_id and estado <> 'cancelado')
           > public._consumo_sesion(v_p.sesion_id) then
      perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'excedente', 'sistema',
        p_pago => v_p.id);
    end if;

    perform public._revisar_cobertura(v_p.sesion_id);
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
      p_pago => v_p.id, p_datos => json_build_object('mp_pago_id', p_mp_pago_id,
        'estado_previo', v_p.estado)::jsonb);
    perform public._tocar_sesion(v_p.sesion_id);
    return json_build_object('ok', true);
  end if;

  update public.pagos_mesa set mp_estado = p_mp_estado, actualizado_en = now()
   where id = v_p.id;
  return json_build_object('ok', true);
end;
$$;


-- ===========================================================================
-- 12) Staff functions (authenticated)
-- ===========================================================================

create or replace function public._staff_puede(p_local uuid, p_escribir boolean)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.puede_ver_local(p_local)
     and public.local_tiene_modulo(p_local, 'pagos')
     and (not p_escribir or public.local_operativo(p_local));
$$;
revoke all on function public._staff_puede(uuid, boolean) from public, anon, authenticated;

/* Open tables plus the ones closed during the current business day. */
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
  select public.jornada_inicio_corte(coalesce(l.hora_corte, 6)) into v_desde
    from public.locales l where l.id = p_local;

  for r in select id from public.mesa_sesiones
            where local_id = p_local and estado = 'abierta'
  loop
    perform public._expirar_pagos_mp(r.id);
  end loop;

  return coalesce((
    select json_agg(public._cuenta_json(s.id) order by
             case s.estado when 'abierta' then 0 else 1 end, s.mesa_numero, s.abierta_en desc)
      from public.mesa_sesiones s
     where s.local_id = p_local
       and (s.estado = 'abierta' or coalesce(s.cerrada_en, s.pagada_en) >= v_desde)
  ), '[]'::json);
end;
$$;

create or replace function public.registrar_pago_personal(
  p_sesion uuid,
  p_datos jsonb,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_local uuid;
  v_comensal uuid;
begin
  select local_id into v_local from public.mesa_sesiones where id = p_sesion;
  if v_local is null or not public._staff_puede(v_local, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_empleado is not null and not exists (
    select 1 from public.empleados where id = p_empleado and local_id = v_local) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;
  v_comensal := nullif(p_datos->>'comensal_id', '')::uuid;
  if v_comensal is not null and not exists (
    select 1 from public.comensales where id = v_comensal and sesion_id = p_sesion) then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  return public._crear_pago_mesa(p_sesion, v_comensal, 'personal', p_datos, p_empleado);
end;
$$;

/* Staff confirms money they actually received. Never for Mercado Pago: that
 * one is confirmed by the webhook only. */
create or replace function public.confirmar_pago_mesa(p_pago uuid, p_empleado uuid default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
begin
  select * into v_p from public.pagos_mesa where id = p_pago;
  if not found or not public._staff_puede(v_p.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_empleado is not null and not exists (
    select 1 from public.empleados where id = p_empleado and local_id = v_p.local_id) then
    return json_build_object('ok', false, 'reason', 'empleado-invalido');
  end if;

  perform 1 from public.mesa_sesiones where id = v_p.sesion_id for update;
  select * into v_p from public.pagos_mesa where id = p_pago for update;

  if v_p.metodo = 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'mp-solo-webhook');
  end if;
  if v_p.estado = 'pagado' then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  if v_p.estado <> 'pendiente' then
    return json_build_object('ok', false, 'reason', 'no-pendiente', 'estado', v_p.estado);
  end if;

  update public.pagos_mesa
     set estado = 'pagado', confirmacion = 'manual', confirmado_en = now(),
         confirmado_por = auth.uid(), confirmado_empleado = p_empleado,
         actualizado_en = now()
   where id = v_p.id;

  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_confirmado', 'personal',
    p_pago => v_p.id, p_empleado => p_empleado,
    p_datos => json_build_object('metodo', v_p.metodo, 'monto_total', v_p.monto_total)::jsonb);
  perform public._revisar_cobertura(v_p.sesion_id);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true);
end;
$$;

/* Pending: staff can cancel any. Paid: only a manual one, while the table is
 * still open, with a reason (it's a refund and stays in the audit log). */
create or replace function public.cancelar_pago_mesa(
  p_pago uuid,
  p_motivo text,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
  v_estado_sesion public.mesa_sesion_estado;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_p from public.pagos_mesa where id = p_pago;
  if not found or not public._staff_puede(v_p.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select estado into v_estado_sesion from public.mesa_sesiones where id = v_p.sesion_id for update;
  select * into v_p from public.pagos_mesa where id = p_pago for update;

  if v_p.estado = 'cancelado' then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  if v_p.estado = 'pagado' then
    if v_p.metodo = 'mercado_pago' then
      return json_build_object('ok', false, 'reason', 'mp-reembolso-externo');
    end if;
    if v_estado_sesion <> 'abierta' then
      return json_build_object('ok', false, 'reason', 'mesa-cerrada');
    end if;
    if v_motivo is null then
      return json_build_object('ok', false, 'reason', 'motivo-requerido');
    end if;
  end if;

  update public.pagos_mesa
     set estado = 'cancelado', cancelado_en = now(),
         cancelado_motivo = left(coalesce(v_motivo, 'cancelado-por-personal'), 200),
         actualizado_en = now()
   where id = v_p.id;

  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_cancelado', 'personal',
    p_pago => v_p.id, p_empleado => p_empleado,
    p_datos => json_build_object('estado_previo', v_p.estado, 'motivo', v_motivo)::jsonb);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true);
end;
$$;

create or replace function public.cerrar_mesa(
  p_sesion uuid,
  p_motivo text,
  p_empleado uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_s public.mesa_sesiones%rowtype;
  v_totales json;
begin
  select * into v_s from public.mesa_sesiones where id = p_sesion;
  if not found or not public._staff_puede(v_s.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_s from public.mesa_sesiones where id = p_sesion for update;
  if v_s.estado = 'cerrada' then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  perform public._expirar_pagos_mp(p_sesion);
  if exists (select 1 from public.pagos_mesa where sesion_id = p_sesion and estado = 'pendiente') then
    return json_build_object('ok', false, 'reason', 'pagos-pendientes');
  end if;

  v_totales := public._cuenta_json(p_sesion)->'totales';
  if (v_totales->>'falta_cubrir')::int > 0
     and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return json_build_object('ok', false, 'reason', 'motivo-requerido',
      'falta_cubrir', (v_totales->>'falta_cubrir')::int);
  end if;

  update public.mesa_sesiones
     set estado = 'cerrada', cerrada_en = now(),
         cerrada_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 200),
         version = version + 1, actualizado_en = now()
   where id = p_sesion;

  perform public._mesa_evento(v_s.local_id, p_sesion, 'mesa_cerrada', 'personal',
    p_empleado => p_empleado,
    p_datos => json_build_object('motivo', p_motivo, 'totales', v_totales)::jsonb);
  return json_build_object('ok', true);
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
  if v_local is null or not public._staff_puede(v_local, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.mesas
     set qr_token = gen_random_uuid()::text, qr_generado_en = now()
   where id = p_mesa
  returning qr_token into v_token;
  perform public._mesa_evento(v_local, null, 'qr_regenerado', 'personal',
    p_datos => json_build_object('mesa_id', p_mesa)::jsonb);
  return json_build_object('ok', true, 'qr_token', v_token);
end;
$$;

create or replace function public.mp_estado_local(p_local uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return coalesce((
    select json_build_object('conectado', true, 'mp_user_id', m.mp_user_id,
             'expira_en', m.expira_en, 'conectado_en', m.conectado_en,
             'live_mode', m.live_mode)
      from public.mp_cuentas m where m.local_id = p_local
  ), json_build_object('conectado', false));
end;
$$;


-- ===========================================================================
-- 13) Guards on existing tables
-- ===========================================================================

/* Table orders move through the same states as counter orders, updated by the
 * panel. Cancelling one must not leave the table with more consumption
 * committed in payments than it now has. */
create or replace function public.pedidos_mesa_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_comprometida integer;
  v_restante integer;
begin
  /* The link between an order and a table bill is set once, by
   * pedir_como_comensal. A panel user editing it through PostgREST could move
   * consumption between bills. FK cascades (branch deleted by superadmin) run
   * with a superadmin uid or none, so they pass. */
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

  if new.estado = 'cancelado' and old.estado <> 'cancelado' then
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
    perform public._mesa_evento(old.local_id, old.sesion_id, 'pedido_' || new.estado::text,
      case when auth.uid() is not null then 'personal' else 'sistema' end,
      p_pedido => old.id);
    perform public._tocar_sesion(old.sesion_id);
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_mesa_guard on public.pedidos;
create trigger pedidos_mesa_guard
  before update on public.pedidos
  for each row execute function public.pedidos_mesa_guard();

/* MP can only be enabled once an account is connected; surcharge statements
 * are stamped with who and when. */
create or replace function public.local_cobros_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.acepta_mercado_pago
     and not exists (select 1 from public.mp_cuentas m where m.local_id = new.local_id) then
    raise exception 'Connect a Mercado Pago account first' using errcode = 'P0001';
  end if;
  if new.recargo_declarado
     and (tg_op = 'INSERT' or not old.recargo_declarado
          or new.recargo_debito_pct is distinct from old.recargo_debito_pct
          or new.recargo_credito_pct is distinct from old.recargo_credito_pct) then
    new.recargo_declarado_en := now();
    new.recargo_declarado_por := auth.uid();
  end if;
  if not new.recargo_declarado then
    new.recargo_declarado_en := null;
    new.recargo_declarado_por := null;
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists local_cobros_guard on public.local_cobros;
create trigger local_cobros_guard
  before insert or update on public.local_cobros
  for each row execute function public.local_cobros_guard();

create or replace function public.productos_touch()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists productos_touch on public.productos;
create trigger productos_touch
  before update on public.productos
  for each row execute function public.productos_touch();

/* Disconnecting MP turns the method off. */
create or replace function public.mp_cuentas_baja()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.local_cobros set acepta_mercado_pago = false
   where local_id = old.local_id and acepta_mercado_pago;
  return old;
end;
$$;

drop trigger if exists mp_cuentas_baja on public.mp_cuentas;
create trigger mp_cuentas_baja
  after delete on public.mp_cuentas
  for each row execute function public.mp_cuentas_baja();


-- ===========================================================================
-- 14) Existing functions that need to know about table sessions
-- ===========================================================================

/* Same as security-fixes-09, but a table with an open bill is never deleted:
 * its QR is in the guests' hands. */
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
  if not public.local_operativo(p_local) then
    return json_build_object('ok', false, 'reason', 'suscripcion-vencida');
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
     and m.reserva_id is null
     and not exists (
       select 1 from public.mesa_sesiones s
        where s.mesa_id = m.id and s.estado = 'abierta'
     );
  get diagnostics v_borradas = row_count;

  return json_build_object('ok', true, 'creadas', v_creadas, 'borradas', v_borradas);
end;
$$;

grant execute on function public.sincronizar_mesas(uuid, integer) to authenticated;

/* Same as pedidos-avisos-activos.sql, excluding table orders: they are run
 * from /panel/mesas where their items are visible. */
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
  v_local_now  timestamp;
  v_dia        date;
  v_desde      timestamptz;
  v_res        json;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  select coalesce(l.hora_corte, 6)
    into v_corte
    from public.locales l
   where l.id = p_local;

  if v_corte is null or v_corte < 0 or v_corte > 23 then
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

  with dia as (
    select *
      from public.pedidos
     where local_id = p_local
       and creado_en >= v_desde
       and sesion_id is null
  ),
  conteos as (
    select
      count(*)                                                   as todos,
      count(*) filter (where estado in ('creado', 'en_preparacion')) as creado,
      count(*) filter (where estado = 'listo')                   as listo,
      count(*) filter (where estado = 'retirado')                as retirado,
      count(*) filter (where estado = 'cancelado')               as cancelado,
      coalesce(
        max(nullif(substring(referencia from '^[0-9]+'), '')::bigint), 0
      ) as max_ref
    from dia
  ),
  filtrados as (
    select *
      from dia
     where (
             p_filtro = 'todos'
          or (p_filtro = 'creado' and estado in ('creado', 'en_preparacion'))
          or (p_filtro <> 'creado' and estado::text = p_filtro)
           )
       and (
             v_busqueda = ''
          or position(lower(v_busqueda) in lower(referencia)) > 0
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
              f.creado_en desc
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
        'avisos_activos', exists (
          select 1
            from public.push_subscriptions ps
           where ps.pedido_id = p.id
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

grant execute on function public.pedidos_pagina(uuid, timestamptz, text, text, integer, integer) to authenticated;


-- ===========================================================================
-- 15) RLS and grants
--
-- Supabase grants ALL on new public tables to anon/authenticated by default,
-- and a column REVOKE can't subtract from a table grant (see
-- security-fixes-17.sql). So: revoke at table level, then grant exactly what
-- the panel needs.
-- ===========================================================================

alter table public.productos     enable row level security;
alter table public.local_cobros  enable row level security;
alter table public.mp_cuentas    enable row level security;
alter table public.mp_oauth_estados enable row level security;
alter table public.mesa_sesiones enable row level security;
alter table public.comensales    enable row level security;
alter table public.pedido_items  enable row level security;
alter table public.pagos_mesa    enable row level security;
alter table public.mesa_eventos  enable row level security;

revoke all on table public.productos, public.local_cobros, public.mp_cuentas,
  public.mp_oauth_estados, public.mesa_sesiones, public.comensales,
  public.pedido_items, public.pagos_mesa, public.mesa_eventos
  from anon, authenticated;

grant all on table public.productos, public.local_cobros, public.mp_cuentas,
  public.mp_oauth_estados, public.mesa_sesiones, public.comensales,
  public.pedido_items, public.pagos_mesa, public.mesa_eventos
  to service_role;

-- Menu: staff edit it directly, but only with the module and a live account.
grant select, insert, update, delete on public.productos to authenticated;
drop policy if exists "productos de mi scope" on public.productos;
create policy "productos de mi scope" on public.productos
  for select using (public.puede_ver_local(local_id));
drop policy if exists "productos escribir con modulo" on public.productos;
create policy "productos escribir con modulo" on public.productos
  for all using (public.puede_ver_local(local_id))
  with check (public.puede_ver_local(local_id)
              and public.local_tiene_modulo(local_id, 'pagos')
              and public.local_operativo(local_id));

-- Payment methods decide where the money goes (transfer alias), so only the
-- owner (or superadmin) edits them. Supervisors can read them.
grant select, insert, update on public.local_cobros to authenticated;
drop policy if exists "cobros de mi scope" on public.local_cobros;
create policy "cobros de mi scope" on public.local_cobros
  for select using (public.puede_ver_local(local_id));
drop policy if exists "cobros escribir con modulo" on public.local_cobros;
drop policy if exists "cobros insertar dueno" on public.local_cobros;
drop policy if exists "cobros actualizar dueno" on public.local_cobros;
create policy "cobros insertar dueno" on public.local_cobros
  for insert with check (public.puede_ver_local(local_id)
              and public.auth_rol()::text in ('admin', 'superadmin')
              and public.local_tiene_modulo(local_id, 'pagos')
              and public.local_operativo(local_id));
create policy "cobros actualizar dueno" on public.local_cobros
  for update using (public.puede_ver_local(local_id)
                    and public.auth_rol()::text in ('admin', 'superadmin'))
  with check (public.puede_ver_local(local_id)
              and public.auth_rol()::text in ('admin', 'superadmin')
              and public.local_tiene_modulo(local_id, 'pagos')
              and public.local_operativo(local_id));

-- Read-only for staff; every write goes through the functions above.
grant select on public.mesa_sesiones, public.pedido_items, public.pagos_mesa,
  public.mesa_eventos to authenticated;

drop policy if exists "sesiones de mi scope" on public.mesa_sesiones;
create policy "sesiones de mi scope" on public.mesa_sesiones
  for select using (public.puede_ver_local(local_id));

drop policy if exists "items de mi scope" on public.pedido_items;
create policy "items de mi scope" on public.pedido_items
  for select using (public.puede_ver_local(local_id));

drop policy if exists "pagos mesa de mi scope" on public.pagos_mesa;
create policy "pagos mesa de mi scope" on public.pagos_mesa
  for select using (public.puede_ver_local(local_id));

drop policy if exists "eventos de mi scope" on public.mesa_eventos;
create policy "eventos de mi scope" on public.mesa_eventos
  for select using (public.puede_ver_local(local_id));

-- Guests: staff see names, never the token hash.
grant select (id, sesion_id, local_id, nombre, creado_en, visto_en)
  on public.comensales to authenticated;
drop policy if exists "comensales de mi scope" on public.comensales;
create policy "comensales de mi scope" on public.comensales
  for select using (public.puede_ver_local(local_id));

-- mp_cuentas / mp_oauth_estados: no policies, no grants. Service role only.

-- Function grants
revoke all on function public.mesa_por_qr(text) from public, anon, authenticated;
revoke all on function public.unirse_mesa(text, text, text) from public, anon, authenticated;
revoke all on function public.cuenta_comensal(uuid, text) from public, anon, authenticated;
revoke all on function public.pedir_como_comensal(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.pagar_como_comensal(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.cancelar_pago_comensal(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.mp_asociar_preferencia(uuid, text) from public, anon, authenticated;
revoke all on function public.mp_cancelar_pago(uuid, text) from public, anon, authenticated;
revoke all on function public.mp_confirmar_pago(uuid, uuid, text, text, numeric, text) from public, anon, authenticated;

grant execute on function public.mesa_por_qr(text) to service_role;
grant execute on function public.unirse_mesa(text, text, text) to service_role;
grant execute on function public.cuenta_comensal(uuid, text) to service_role;
grant execute on function public.pedir_como_comensal(uuid, text, jsonb, uuid) to service_role;
grant execute on function public.pagar_como_comensal(uuid, text, jsonb) to service_role;
grant execute on function public.cancelar_pago_comensal(uuid, text, uuid) to service_role;
grant execute on function public.mp_asociar_preferencia(uuid, text) to service_role;
grant execute on function public.mp_cancelar_pago(uuid, text) to service_role;
grant execute on function public.mp_confirmar_pago(uuid, uuid, text, text, numeric, text) to service_role;

revoke all on function public.mesas_cuentas(uuid) from public, anon;
revoke all on function public.registrar_pago_personal(uuid, jsonb, uuid) from public, anon;
revoke all on function public.confirmar_pago_mesa(uuid, uuid) from public, anon;
revoke all on function public.cancelar_pago_mesa(uuid, text, uuid) from public, anon;
revoke all on function public.cerrar_mesa(uuid, text, uuid) from public, anon;
revoke all on function public.regenerar_qr_mesa(uuid) from public, anon;
revoke all on function public.mp_estado_local(uuid) from public, anon;

grant execute on function public.mesas_cuentas(uuid) to authenticated;
grant execute on function public.registrar_pago_personal(uuid, jsonb, uuid) to authenticated;
grant execute on function public.confirmar_pago_mesa(uuid, uuid) to authenticated;
grant execute on function public.cancelar_pago_mesa(uuid, text, uuid) to authenticated;
grant execute on function public.cerrar_mesa(uuid, text, uuid) to authenticated;
grant execute on function public.regenerar_qr_mesa(uuid) to authenticated;
grant execute on function public.mp_estado_local(uuid) to authenticated;

revoke all on function public.proteger_modulos_local() from public, anon, authenticated;
revoke all on function public.pedidos_mesa_guard() from public, anon, authenticated;
revoke all on function public.local_cobros_guard() from public, anon, authenticated;
revoke all on function public.mp_cuentas_baja() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 16) Realtime: every write bumps mesa_sesiones.version, so the panel only
--     needs to listen to this table.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'mesa_sesiones'
  ) then
    alter publication supabase_realtime add table public.mesa_sesiones;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Check (read only). Expected: every column false except the last one.
-- ---------------------------------------------------------------------------
select
  has_table_privilege('anon', 'public.pagos_mesa', 'SELECT')              as anon_lee_pagos,
  has_table_privilege('authenticated', 'public.pagos_mesa', 'INSERT')     as auth_inserta_pagos,
  has_table_privilege('authenticated', 'public.mp_cuentas', 'SELECT')     as auth_lee_mp,
  has_column_privilege('authenticated', 'public.comensales', 'token_hash', 'SELECT') as auth_lee_hash,
  has_function_privilege('authenticated', 'public.pagar_como_comensal(uuid, text, jsonb)', 'EXECUTE') as auth_paga_como_comensal,
  has_function_privilege('authenticated', 'public.mp_confirmar_pago(uuid, uuid, text, text, numeric, text)', 'EXECUTE') as auth_confirma_mp,
  has_function_privilege('authenticated', 'public.confirmar_pago_mesa(uuid, uuid)', 'EXECUTE') as auth_confirma_manual;
