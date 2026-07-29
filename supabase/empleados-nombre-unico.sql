-- ===========================================================================
-- Cicalino — Nombre único de empleado por sucursal
-- Correr en: Supabase Dashboard → SQL Editor
-- Idempotente: se puede re-ejecutar.
--
-- En el fichaje se elige por nombre: dos "Lucía" serían indistinguibles.
-- La comparación ignora mayúsculas y espacios de sobra.
-- ===========================================================================

-- Si ya hubiera duplicados, el índice falla: listalos y renombrá/borrá antes.
-- select local_id, lower(trim(nombre)) as n, count(*)
--   from public.empleados
--  group by 1, 2
-- having count(*) > 1;

create unique index if not exists uq_empleados_local_nombre
  on public.empleados (local_id, lower(trim(nombre)));
