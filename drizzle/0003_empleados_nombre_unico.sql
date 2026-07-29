-- Nombre único por sucursal (alineado con supabase/empleados-nombre-unico.sql).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_empleados_local_nombre"
  ON "empleados" ("local_id", lower(trim("nombre")));
