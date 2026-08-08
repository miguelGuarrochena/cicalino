-- ===========================================================================
-- Cicalino — Registro de emails enviados
-- Correr en: Supabase Dashboard → SQL Editor
-- Requiere: setup.sql
-- Orden sugerido: #18 de 39 (ver chequeo-migraciones.sql)
-- Idempotente.
--
-- Para saber qué se le mandó a cada cliente y cuándo, sin tener que entrar
-- al panel de Resend ni reenviar a ciegas.
-- ===========================================================================

create table if not exists public.emails_enviados (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid references public.organizaciones (id) on delete cascade,
  destinatario text not null,
  tipo text not null,
  asunto text not null,
  -- true = Resend lo aceptó. No significa que haya entrado a la bandeja.
  aceptado boolean not null default false,
  error text,
  -- ID que devuelve Resend, para poder buscarlo en su panel si hace falta.
  proveedor_id text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_emails_org_fecha
  on public.emails_enviados (organizacion_id, creado_en desc);

alter table public.emails_enviados enable row level security;

drop policy if exists "emails solo superadmin" on public.emails_enviados;
create policy "emails solo superadmin" on public.emails_enviados
  for all using (public.auth_rol() = 'superadmin')
  with check (public.auth_rol() = 'superadmin');
