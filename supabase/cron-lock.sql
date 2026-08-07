-- ===========================================================================
-- Cicalino — Lock para los jobs del cron
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
--
-- PROBLEMA
-- `/api/cron/cobros` manda mails a los clientes y cambia estados de
-- suscripción. Si se ejecuta dos veces en paralelo (un reintento de Vercel
-- encima del disparo programado, o alguien abriendo la URL a mano mientras
-- corre), los mails salen duplicados: `sweepSubscriptions` manda el mail
-- ANTES de escribir la marca de "ya avisé", así que la segunda corrida ve la
-- marca todavía vacía.
--
-- POR QUÉ UNA TABLA Y NO pg_try_advisory_lock
-- Los advisory locks son por sesión, y PostgREST usa un pool: la llamada que
-- toma el lock y la que lo suelta pueden caer en conexiones distintas. Con una
-- tabla el lock es un dato, no un estado de conexión, así que sobrevive al
-- pool y además se auto-libera por vencimiento si un job se cuelga.
-- ===========================================================================

create table if not exists public.cron_locks (
  nombre    text primary key,
  tomado_en timestamptz not null default now(),
  expira_en timestamptz not null
);

-- Sin policies: solo el service_role la toca (saltea RLS).
alter table public.cron_locks enable row level security;


-- ---------------------------------------------------------------------------
-- Toma el lock si está libre o vencido. Devuelve true si lo consiguió.
--
-- El `on conflict ... where expira_en < now()` es lo que lo hace atómico: dos
-- corridas simultáneas compiten en el mismo UPDATE y solo una afecta la fila.
-- ---------------------------------------------------------------------------
create or replace function public.tomar_cron_lock(p_nombre text, p_segundos int)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cron_locks (nombre, tomado_en, expira_en)
  values (p_nombre, now(), now() + make_interval(secs => p_segundos))
  on conflict (nombre) do update
     set tomado_en = now(),
         expira_en = now() + make_interval(secs => p_segundos)
   where public.cron_locks.expira_en < now();

  return found;
end;
$$;


-- ---------------------------------------------------------------------------
-- Libera el lock al terminar, para no esperar al vencimiento.
-- ---------------------------------------------------------------------------
create or replace function public.soltar_cron_lock(p_nombre text)
returns void
language sql security definer set search_path = public as $$
  update public.cron_locks
     set expira_en = now() - interval '1 second'
   where nombre = p_nombre;
$$;


-- ---------------------------------------------------------------------------
-- Chequeo: estado actual de los locks.
-- ---------------------------------------------------------------------------
select nombre, tomado_en, expira_en, (expira_en > now()) as tomado
from public.cron_locks
order by nombre;
