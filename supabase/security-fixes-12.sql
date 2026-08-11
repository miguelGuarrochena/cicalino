-- ===========================================================================
-- Cicalino — Fixes de seguridad #12 (cron lock: ownership + tope de TTL)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: cron-lock.sql, security-fixes-06.sql
-- Orden sugerido: #47 (después de security-fixes-11)
--
-- PROBLEMA
-- 1) soltar_cron_lock(nombre) liberaba el lock sin comprobar quién lo tomó.
--    Con service_role ya no es un vector de authenticated, pero un segundo
--    job (o un retry) podía soltar el lock de otra corrida a mitad de camino.
-- 2) p_segundos no tenía tope: un valor absurdo dejaba el cron bloqueado
--    horas/días hasta el vencimiento.
--
-- FIX
-- - Columna token en cron_locks; tomar devuelve el token; soltar exige match.
-- - Clamp de p_segundos a [1, 3600].
-- ===========================================================================

alter table public.cron_locks
  add column if not exists token text;

comment on column public.cron_locks.token is
  'Opaco de la corrida que tiene el lock; soltar exige el mismo valor.';

-- Firmas nuevas: hay que dropear las viejas (cambio de retorno / args).
drop function if exists public.tomar_cron_lock(text, integer);
drop function if exists public.soltar_cron_lock(text);

create or replace function public.tomar_cron_lock(p_nombre text, p_segundos int)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_secs  int := greatest(1, least(coalesce(p_segundos, 300), 3600));
  v_token text := gen_random_uuid()::text;
  v_got   text;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    return null;
  end if;

  insert into public.cron_locks (nombre, tomado_en, expira_en, token)
  values (btrim(p_nombre), now(), now() + make_interval(secs => v_secs), v_token)
  on conflict (nombre) do update
     set tomado_en = now(),
         expira_en = now() + make_interval(secs => v_secs),
         token = excluded.token
   where public.cron_locks.expira_en < now()
  returning public.cron_locks.token into v_got;

  return v_got;
end;
$$;

create or replace function public.soltar_cron_lock(p_nombre text, p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_nombre is null or btrim(p_nombre) = '' or p_token is null or btrim(p_token) = '' then
    return false;
  end if;

  update public.cron_locks
     set expira_en = now() - interval '1 second'
   where nombre = btrim(p_nombre)
     and token = btrim(p_token);

  return found;
end;
$$;

revoke all on function public.tomar_cron_lock(text, integer)
  from public, anon, authenticated;
revoke all on function public.soltar_cron_lock(text, text)
  from public, anon, authenticated;

grant execute on function public.tomar_cron_lock(text, integer) to service_role;
grant execute on function public.soltar_cron_lock(text, text) to service_role;

comment on function public.tomar_cron_lock(text, integer) is
  'Toma el lock de un job de cron; devuelve token de ownership o null.';
comment on function public.soltar_cron_lock(text, text) is
  'Libera el lock solo si el token coincide con el dueño actual.';

-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: service_role true; anon/auth false.
-- ---------------------------------------------------------------------------
-- select
--   has_function_privilege('anon', 'public.tomar_cron_lock(text, integer)', 'execute') as tomar_anon,
--   has_function_privilege('service_role', 'public.tomar_cron_lock(text, integer)', 'execute') as tomar_service,
--   has_function_privilege('anon', 'public.soltar_cron_lock(text, text)', 'execute') as soltar_anon,
--   has_function_privilege('service_role', 'public.soltar_cron_lock(text, text)', 'execute') as soltar_service;
