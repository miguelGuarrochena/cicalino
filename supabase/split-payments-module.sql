-- ===========================================================================
-- Cicalino — Split payments as a third commercial module
-- Run in: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotent.
-- Requires: modulo-espera.sql, modulos-por-sucursal.sql, solicitudes-pack.sql,
--           security-fixes-04.sql
--
-- WHAT
-- Pedidos and Espera are sold per branch through locales.modulo_* (with the
-- organization row holding the OR of its branches). "Pagos divididos" joins
-- them at the same level: same columns, same aggregation, same packs.
--
-- WHY THE TRIGGER
-- The "locales update org/SA" policy lets an owner or supervisor update their
-- own branch row, which is how /panel/config saves hours and table count. The
-- policy can't tell columns apart, so until now an owner could also flip
-- modulo_espera on through PostgREST and get a module they never paid for.
-- With a third module that is billed separately this matters, so the module
-- columns become superadmin-only. Server code using the service role and
-- SECURITY DEFINER functions are not affected (they don't run as
-- anon/authenticated).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------
alter table public.organizaciones
  add column if not exists modulo_pagos boolean not null default false;

alter table public.locales
  add column if not exists modulo_pagos boolean not null default false;

comment on column public.locales.modulo_pagos is
  'Contracted module: split bill / table payments. Only superadmin can change it.';

comment on column public.organizaciones.modulo_pagos is
  'OR of locales.modulo_pagos, kept in sync by the superadmin console.';


-- ---------------------------------------------------------------------------
-- 2) Only superadmin changes contracted modules
-- ---------------------------------------------------------------------------
create or replace function public.proteger_modulos_local()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.modulo_pedidos is distinct from old.modulo_pedidos
      or new.modulo_espera is distinct from old.modulo_espera
      or new.modulo_pagos is distinct from old.modulo_pagos)
     and current_user in ('anon', 'authenticated')
     and coalesce(public.auth_rol()::text, '') <> 'superadmin' then
    raise exception 'Contracted modules can only be changed by Cicalino'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists locales_proteger_modulos on public.locales;
create trigger locales_proteger_modulos
  before update on public.locales
  for each row execute function public.proteger_modulos_local();


-- ---------------------------------------------------------------------------
-- 3) Module check used by RLS and RPCs
--
-- An inactive branch (locales.activa = false) keeps no module: it isn't billed.
-- ---------------------------------------------------------------------------
create or replace function public.local_tiene_modulo(p_local uuid, p_modulo text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select l.activa and case p_modulo
             when 'pedidos' then l.modulo_pedidos
             when 'espera'  then l.modulo_espera
             when 'pagos'   then l.modulo_pagos
             else false
           end
      from public.locales l
     where l.id = p_local
  ), false);
$$;

revoke all on function public.local_tiene_modulo(uuid, text) from public, anon;
grant execute on function public.local_tiene_modulo(uuid, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4) Packs requested from /pricing
--
-- 'pack' stays as the historical Pedidos + Espera id so old rows stay valid.
-- ---------------------------------------------------------------------------
alter table public.solicitudes
  drop constraint if exists solicitudes_pack_valido;

alter table public.solicitudes
  add constraint solicitudes_pack_valido
  check (pack is null or pack in (
    'pedidos', 'espera', 'pagos', 'pack', 'pedidos_pagos', 'espera_pagos', 'completo'
  ));

comment on column public.solicitudes.pack is
  'Requested modules: pedidos | espera | pagos | pack (pedidos+espera) | pedidos_pagos | espera_pagos | completo. Null for trials.';


-- ---------------------------------------------------------------------------
-- Check (read only). Expected: both columns true, trigger present.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'locales'
             and column_name = 'modulo_pagos') as locales_modulo_pagos,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'organizaciones'
             and column_name = 'modulo_pagos') as org_modulo_pagos,
  exists (select 1 from pg_trigger
           where tgname = 'locales_proteger_modulos') as trigger_modulos;
