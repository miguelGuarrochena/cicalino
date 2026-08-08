-- ===========================================================================
-- Cicalino — Índices y retención de push_subscriptions
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: modulo-espera.sql
-- Orden sugerido: #29 de 39 (ver chequeo-migraciones.sql)
--
-- PROBLEMA
-- La tabla solo tenía índice por pedido_id, pero se la consulta por otras dos
-- columnas en los caminos más calientes:
--
--   · /api/push/subscribe hace delete ... where endpoint = $1 en CADA alta de
--     suscripción → seq scan.
--   · /api/push/notify hace select ... where espera_id = $1 en cada aviso del
--     módulo de espera → seq scan.
--
-- Y la tabla solo crece: el on delete cascade limpia cuando se borra el
-- pedido, cosa que no pasa nunca. Con seq scans sobre una tabla que no para
-- de crecer, cada aviso se vuelve más lento que el anterior.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Dedupe previo. El índice único de abajo falla si ya hay endpoints
--    repetidos, y los hay: subscribe borraba e insertaba en dos pasos, así que
--    un corte de red en el medio dejaba duplicados.
--    Nos quedamos con el más reciente de cada endpoint.
-- ---------------------------------------------------------------------------
delete from public.push_subscriptions p
where exists (
  select 1 from public.push_subscriptions q
  where q.endpoint = p.endpoint
    and (q.created_at, q.id) > (p.created_at, p.id)
);


-- ---------------------------------------------------------------------------
-- 2) Índices.
--    El único sobre endpoint además habilita el upsert: un endpoint es un
--    navegador, y un navegador espera un pedido a la vez.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_push_endpoint
  on public.push_subscriptions (endpoint);

create index if not exists idx_push_espera
  on public.push_subscriptions (espera_id)
  where espera_id is not null;


-- ---------------------------------------------------------------------------
-- 3) Integridad: espera_id no tenía foreign key (pedido_id sí). Al borrar una
--    espera quedaban suscripciones apuntando a nada.
-- ---------------------------------------------------------------------------
delete from public.push_subscriptions p
where p.espera_id is not null
  and not exists (select 1 from public.esperas e where e.id = p.espera_id);

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_espera_fk,
  add  constraint push_subscriptions_espera_fk
    foreign key (espera_id) references public.esperas (id) on delete cascade;


-- ---------------------------------------------------------------------------
-- 4) Retención. Una suscripción sirve mientras el cliente espera; después es
--    peso muerto. Los QR vencen en 48h como máximo (ver security-fixes-02),
--    así que a los 3 días no hay nada que avisar.
--
--    Llamar desde el cron. Devuelve cuántas borró.
-- ---------------------------------------------------------------------------
create or replace function public.purgar_push_viejas(p_dias int default 3)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_borradas integer;
begin
  delete from public.push_subscriptions
   where created_at < now() - make_interval(days => p_dias);
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5) Chequeo.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.push_subscriptions) as suscripciones,
  (select count(*) from public.push_subscriptions
    where created_at < now() - interval '3 days') as purgables,
  (select count(*) from pg_indexes
    where schemaname = 'public' and tablename = 'push_subscriptions') as indices;
