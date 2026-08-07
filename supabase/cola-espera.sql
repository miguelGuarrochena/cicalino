-- ===========================================================================
-- Cicalino — Posición en la cola de espera, calculada en la base
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
--
-- PROBLEMA
-- /api/e/[token] resolvía la posición así: traía TODAS las esperas activas de
-- la sucursal y las recorría en JS contando cuántas entraron antes.
--
-- Cada cliente en la cola pollea su propia pantalla, así que con 40 grupos
-- esperando son 40 requests que bajan 40 filas cada una: O(n²) por ciclo de
-- polling, y justo cuando la cola está larga, que es cuando peor viene.
--
-- Acá se resuelve con un solo agregado sobre idx_esperas_local_estado.
-- ===========================================================================

create or replace function public.cola_de_espera(p_token text)
returns table (
  grupos_delante    integer,
  personas_delante  integer,
  grupos_en_cola    integer,
  personas_en_cola  integer
)
language sql stable security definer set search_path = public as $$
  with mia as (
    select local_id, creado_en, id
      from public.esperas
     where qr_token = p_token
  )
  select
    coalesce(count(*) filter (
      where (e.creado_en, e.id) < (m.creado_en, m.id)
    ), 0)::integer,
    coalesce(sum(e.personas) filter (
      where (e.creado_en, e.id) < (m.creado_en, m.id)
    ), 0)::integer,
    coalesce(count(*), 0)::integer,
    coalesce(sum(e.personas), 0)::integer
  from mia m
  join public.esperas e
    on e.local_id = m.local_id
   and e.estado in ('esperando', 'avisado')
  group by m.creado_en, m.id;
$$;

-- La llama el route handler con el service_role, que saltea RLS igual, pero
-- la dejamos disponible por si en algún momento se expone al cliente.
grant execute on function public.cola_de_espera(text) to authenticated;


-- ---------------------------------------------------------------------------
-- Chequeo: correr con un token real de una espera activa.
-- ---------------------------------------------------------------------------
-- select * from public.cola_de_espera('pegar-un-qr_token-aca');
