-- ===========================================================================
-- Cicalino — Acceso a la app desde la ficha del empleado
-- Correr en: Supabase Dashboard → SQL Editor
-- Idempotente.
--
-- Hasta ahora había dos mundos separados:
--   empleados = nombre + PIN, fichan y atienden, no entran a la app
--   usuarios  = email + contraseña, entran a la app (dueño / encargado)
-- Esto los une: un empleado puede pasar a tener acceso sin cargarlo dos veces.
-- ===========================================================================

-- 1) Vínculo empleado → cuenta de la app.
--    null = ese empleado solo ficha con PIN.
alter table public.empleados
  add column if not exists usuario_id uuid
    references public.usuarios (id) on delete set null;

comment on column public.empleados.usuario_id is
  'Cuenta con la que este empleado entra a la app. null = solo PIN.';

-- Una misma persona puede tener ficha en dos sucursales (dos PIN, dos filas)
-- y entrar con la misma cuenta, así que el índice no es único.
create index if not exists idx_empleados_usuario
  on public.empleados (usuario_id)
  where usuario_id is not null;

-- 2) El dueño necesita ver las cuentas de su empresa para administrarlas.
--    Antes cada uno veía solo su propio perfil, así que la pantalla de equipo
--    le habría mostrado la lista vacía.
drop policy if exists "perfil propio" on public.usuarios;
create policy "perfil propio" on public.usuarios
  for select using (
    id = auth.uid()
    or public.auth_rol() = 'superadmin'
    or (
      public.auth_rol() = 'admin'
      and organizacion_id is not null
      and organizacion_id = public.auth_org()
    )
  );
