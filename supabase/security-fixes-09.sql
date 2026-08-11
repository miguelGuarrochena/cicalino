-- ===========================================================================
-- Cicalino — Fixes de seguridad #09 (sincronizar_mesas + local_operativo)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: reservas-atomicas.sql, corte-por-impago.sql
-- Orden sugerido: #44 (después de security-fixes-08)
--
-- PROBLEMA
-- corte-por-impago.sql añadió local_operativo a crear_reserva / sentar_walkin
-- y a las policies WITH CHECK, pero sincronizar_mesas solo chequeaba
-- puede_ver_local. Una cuenta cortada por impago seguía pudiendo crear/borrar
-- mesas vía RPC.
--
-- Mismo patrón de respuesta que sentar_walkin: { ok: false, reason: ... }.
-- ===========================================================================

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
     and m.reserva_id is null;
  get diagnostics v_borradas = row_count;

  return json_build_object('ok', true, 'creadas', v_creadas, 'borradas', v_borradas);
end;
$$;

grant execute on function public.sincronizar_mesas(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: el cuerpo menciona local_operativo.
-- ---------------------------------------------------------------------------
select
  (
    select pg_get_functiondef(p.oid) ilike '%local_operativo%'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'sincronizar_mesas'
       and pg_get_function_identity_arguments(p.oid) = 'p_local uuid, p_cantidad integer'
  ) as chequea_local_operativo;
