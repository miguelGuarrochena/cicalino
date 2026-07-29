-- Cicalino — pedidos de sucursal extra (dueño pide +1 cupo)
-- Corré en el SQL Editor de Supabase (una vez).

create table if not exists public.pedidos_sucursal (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  cupo_actual integer not null,
  cupo_pedido integer not null,
  nombre_sucursal text,
  -- nueva | atendida | descartada
  estado text not null default 'nueva',
  creado_en timestamptz not null default now(),
  constraint pedidos_sucursal_estado_valido
    check (estado in ('nueva', 'atendida', 'descartada')),
  constraint pedidos_sucursal_cupo_valido
    check (cupo_pedido > cupo_actual and cupo_actual >= 1)
);

create index if not exists idx_pedidos_sucursal_org
  on public.pedidos_sucursal (organizacion_id);

create index if not exists idx_pedidos_sucursal_estado
  on public.pedidos_sucursal (estado, creado_en desc);

-- Una sola solicitud abierta por empresa.
create unique index if not exists uq_pedidos_sucursal_nueva_por_org
  on public.pedidos_sucursal (organizacion_id)
  where estado = 'nueva';

alter table public.pedidos_sucursal enable row level security;

-- Lectura: dueño de la org o superadmin. Altas/bajas van por service_role
-- (server actions), no por el cliente.
drop policy if exists "pedidos_sucursal_select" on public.pedidos_sucursal;
create policy "pedidos_sucursal_select" on public.pedidos_sucursal
  for select using (
    organizacion_id = public.auth_org()
    or public.auth_rol() = 'superadmin'
  );

comment on table public.pedidos_sucursal is
  'Pedido del dueño para sumar cupo (+1 sucursal). Superadmin aprueba tras el pago.';
