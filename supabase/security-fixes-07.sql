-- ===========================================================================
-- Cicalino — Fixes de seguridad #07 (usuario_sucursal: escritura solo admin)
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
-- Requiere: usuarios-sucursales.sql, setup.sql (auth_rol / auth_org)
-- Orden sugerido: #42 (después de security-fixes-06)
--
-- PROBLEMA
-- La policy "acceso de mi org" era FOR ALL: cualquier authenticated cuya
-- auth_org() coincida con el local podía INSERT/UPDATE/DELETE en
-- usuario_sucursal. Un supervisor podía:
--
--   insert into usuario_sucursal (usuario_id, local_id)
--   values (auth.uid(), '<otra-sucursal-de-la-misma-org>');
--
-- y pasar puede_ver_local / RLS de pedidos, esperas, mesas y reservas de esa
-- sucursal. También podía borrar filas de acceso de otros.
--
-- Las altas/bajas legítimas ya van por service_role en
-- src/lib/actions/team.ts (grantAppAccess / revokeAppAccess), gated a
-- admin/superadmin. El service_role saltea RLS: este fix no rompe ese flujo.
--
-- auth_locales() es SECURITY DEFINER: el supervisor sigue resolviendo sus
-- sucursales sin necesitar SELECT amplio.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Quitar la policy permisiva FOR ALL.
-- ---------------------------------------------------------------------------
drop policy if exists "acceso de mi org" on public.usuario_sucursal;


-- ---------------------------------------------------------------------------
-- 2) SELECT: dueño de la org, superadmin, o las filas propias.
-- ---------------------------------------------------------------------------
drop policy if exists "usuario_sucursal select" on public.usuario_sucursal;
create policy "usuario_sucursal select" on public.usuario_sucursal
  for select using (
    public.auth_rol() = 'superadmin'
    or usuario_id = auth.uid()
    or (
      public.auth_rol() = 'admin'
      and local_id in (
        select id from public.locales
         where organizacion_id = public.auth_org()
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 3) INSERT / UPDATE / DELETE: solo admin (locales de su org) o superadmin.
-- ---------------------------------------------------------------------------
drop policy if exists "usuario_sucursal insert admin" on public.usuario_sucursal;
create policy "usuario_sucursal insert admin" on public.usuario_sucursal
  for insert with check (
    public.auth_rol() = 'superadmin'
    or (
      public.auth_rol() = 'admin'
      and local_id in (
        select id from public.locales
         where organizacion_id = public.auth_org()
      )
    )
  );

drop policy if exists "usuario_sucursal update admin" on public.usuario_sucursal;
create policy "usuario_sucursal update admin" on public.usuario_sucursal
  for update using (
    public.auth_rol() = 'superadmin'
    or (
      public.auth_rol() = 'admin'
      and local_id in (
        select id from public.locales
         where organizacion_id = public.auth_org()
      )
    )
  )
  with check (
    public.auth_rol() = 'superadmin'
    or (
      public.auth_rol() = 'admin'
      and local_id in (
        select id from public.locales
         where organizacion_id = public.auth_org()
      )
    )
  );

drop policy if exists "usuario_sucursal delete admin" on public.usuario_sucursal;
create policy "usuario_sucursal delete admin" on public.usuario_sucursal
  for delete using (
    public.auth_rol() = 'superadmin'
    or (
      public.auth_rol() = 'admin'
      and local_id in (
        select id from public.locales
         where organizacion_id = public.auth_org()
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 4) Chequeo (solo lectura). Esperado tras el fix:
--      policies_escritura = 3  (insert/update/delete admin)
--      policies_select    = 1
--      sin_for_all_vieja  = true  (ya no existe "acceso de mi org")
-- ---------------------------------------------------------------------------
select
  count(*) filter (where policyname like 'usuario_sucursal %admin') as policies_escritura,
  count(*) filter (where policyname = 'usuario_sucursal select') as policies_select,
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'usuario_sucursal'
       and policyname = 'acceso de mi org'
  ) as sin_for_all_vieja
from pg_policies
where schemaname = 'public'
  and tablename = 'usuario_sucursal';
