-- ===========================================================================
-- Cicalino — Table audit log + menu is not a waiter job
-- Run in: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotent.
-- Requires: staff-roles.sql, split-payments.sql, staff-floor-guards.sql
--
-- split-payments.sql was applied before mesa_historial and the manager-only
-- menu policies existed. This follow-up adds them without touching tables.
-- ===========================================================================

create or replace function public.mesa_historial(p_sesion uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_local uuid;
begin
  select local_id into v_local from public.mesa_sesiones where id = p_sesion;
  if v_local is null or not public.puede_ver_local(v_local) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', ev.id, 'tipo', ev.tipo, 'actor', ev.actor, 'creado_en', ev.creado_en,
      'quien', coalesce(
        emp.nombre,
        nullif(btrim(u.nombre), ''),
        u.email,
        com.nombre
      ),
      'pago_id', ev.pago_id, 'pedido_id', ev.pedido_id,
      'monto', g.monto_total, 'metodo', g.metodo
    ) order by ev.creado_en desc, ev.id desc)
      from public.mesa_eventos ev
      left join public.empleados emp on emp.id = ev.empleado_id
      left join public.usuarios u on u.id = ev.usuario_id
      left join public.comensales com on com.id = ev.comensal_id
      left join public.pagos_mesa g on g.id = ev.pago_id
     where ev.sesion_id = p_sesion
  ), '[]'::json);
end;
$$;

revoke all on function public.mesa_historial(uuid) from public, anon;
grant execute on function public.mesa_historial(uuid) to authenticated;


-- Menu: managers and owners edit it. Waiters read it.
grant select, insert, update, delete on public.productos to authenticated;
drop policy if exists "productos de mi scope" on public.productos;
create policy "productos de mi scope" on public.productos
  for select using (public.puede_ver_local(local_id));
drop policy if exists "productos escribir con modulo" on public.productos;
drop policy if exists "productos alta" on public.productos;
drop policy if exists "productos editar" on public.productos;
drop policy if exists "productos baja" on public.productos;
create policy "productos alta" on public.productos
  for insert with check (public.auth_gestiona_local(local_id)
              and public.local_tiene_modulo(local_id, 'pagos')
              and public.local_operativo(local_id));
create policy "productos editar" on public.productos
  for update using (public.auth_gestiona_local(local_id))
  with check (public.auth_gestiona_local(local_id)
              and public.local_tiene_modulo(local_id, 'pagos')
              and public.local_operativo(local_id));
create policy "productos baja" on public.productos
  for delete using (public.auth_gestiona_local(local_id));

-- Check (read only). Expected: true, productos alta.
select
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'mesa_historial'
  ) as historial,
  exists (
    select 1 from pg_policies
     where tablename = 'productos' and policyname = 'productos alta'
  ) as menu_encargado;
