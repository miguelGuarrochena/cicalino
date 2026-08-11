-- ===========================================================================
-- Cicalino — Fixes de seguridad #05 (purgar_push_viejas: revoke + p_dias)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: push-indices.sql
-- Orden sugerido: #40 (después de push-indices.sql / chequeo-migraciones)
--
-- PROBLEMA
-- `purgar_push_viejas` es SECURITY DEFINER y borra filas de push_subscriptions.
-- Al crearla en push-indices.sql quedó con EXECUTE para PUBLIC (default de
-- Postgres), así que cualquier sesión authenticated podía llamar
--   rpc('purgar_push_viejas', { p_dias: -1 })
-- y vaciar las suscripciones push de todos los clientes.
--
-- El único llamador legítimo es el cron (/api/cron/cobros) con service_role.
-- Mismo patrón que `expirar_reservas_vencidas` en reservas-expirar.sql.
--
-- Además: `p_dias < 1` convertía el filtro en un borrado masivo
-- (make_interval con días negativos / cero). Se rechaza en la función.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Redefinir con validación defensiva de p_dias.
-- ---------------------------------------------------------------------------
create or replace function public.purgar_push_viejas(p_dias int default 3)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_borradas integer;
begin
  if p_dias is null or p_dias < 1 then
    raise exception 'p_dias debe ser >= 1';
  end if;

  delete from public.push_subscriptions
   where created_at < now() - make_interval(days => p_dias);
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2) Mínimo privilegio: solo service_role (cron). Nadie más.
-- ---------------------------------------------------------------------------
revoke execute on function public.purgar_push_viejas(integer)
  from public, anon, authenticated;

grant execute on function public.purgar_push_viejas(integer) to service_role;


-- ---------------------------------------------------------------------------
-- 3) Chequeo de permisos (solo lectura). Esperado:
--      anon / authenticated / public → false
--      service_role                  → true
-- ---------------------------------------------------------------------------
select
  has_function_privilege('anon', 'public.purgar_push_viejas(integer)', 'execute')
    as anon_puede,
  has_function_privilege('authenticated', 'public.purgar_push_viejas(integer)', 'execute')
    as authenticated_puede,
  has_function_privilege('service_role', 'public.purgar_push_viejas(integer)', 'execute')
    as service_role_puede;
