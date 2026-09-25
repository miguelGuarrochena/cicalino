-- ===========================================================================
-- Cicalino — Regenerar varios QR de mesa de una vez
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: pedidos-mesa.sql (regenerar_qr_mesa vigente)
--
-- "Regenerar todos los QR" desde la pantalla de QR de las mesas (Pagos o
-- Pedidos en modalidad Mesa). No inventa reglas nuevas: llama a
-- regenerar_qr_mesa por cada mesa, así que valen los mismos permisos, el
-- mismo efecto sobre qr_activo y el mismo evento `qr_regenerado`. Todo en una
-- transacción: o se regeneran todas, o ninguna.
--
-- Qué mesas entran lo decide la pantalla (en Pagos, las que tienen el QR
-- activo; en modalidad Mesa, todas). Acá solo se exige que sean de la misma
-- sucursal.
-- ===========================================================================

create or replace function public.regenerar_qr_mesas(p_local uuid, p_mesas uuid[])
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_res json;
  v_out json[] := '{}';
begin
  select coalesce(array_agg(distinct m), '{}') into v_ids
    from unnest(coalesce(p_mesas, '{}'::uuid[])) m;
  if p_local is null or cardinality(v_ids) = 0 then
    return json_build_object('ok', false, 'reason', 'sin-mesas');
  end if;
  /* Todas de esta sucursal: una mesa ajena invalida el pedido entero. */
  if exists (
    select 1 from unnest(v_ids) m
     where not exists (select 1 from public.mesas x where x.id = m and x.local_id = p_local)
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  foreach v_id in array v_ids loop
    v_res := public.regenerar_qr_mesa(v_id);
    v_out := v_out || json_build_object('mesa_id', v_id, 'qr_token', v_res->>'qr_token');
  end loop;

  return json_build_object('ok', true, 'mesas', to_json(v_out));
end;
$$;

revoke all on function public.regenerar_qr_mesas(uuid, uuid[]) from public, anon;
grant execute on function public.regenerar_qr_mesas(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';

-- Chequeo (solo lectura). Esperado: true, false.
select
  has_function_privilege('authenticated', 'public.regenerar_qr_mesas(uuid, uuid[])', 'EXECUTE') as personal_regenera,
  has_function_privilege('anon', 'public.regenerar_qr_mesas(uuid, uuid[])', 'EXECUTE') as anon_regenera;
