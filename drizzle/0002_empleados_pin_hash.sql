-- PIN hasheado (alineado con supabase/security-fixes-03.sql).
-- Preferí correr ese script en el SQL Editor; esta migración es el espejo
-- para Drizzle. No uses `pnpm db:push` contra una base que ya aplicó #03
-- sin revisar el diff (la columna `tiene_pin` es GENERATED).

ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "pin_hash" text;
--> statement-breakpoint
-- Columna legible para la UI (sin filtrar el hash).
ALTER TABLE "empleados" DROP COLUMN IF EXISTS "tiene_pin";
--> statement-breakpoint
ALTER TABLE "empleados" ADD COLUMN "tiene_pin" boolean GENERATED ALWAYS AS (pin_hash IS NOT NULL) STORED;
--> statement-breakpoint
-- Texto plano ya no se usa.
ALTER TABLE "empleados" DROP COLUMN IF EXISTS "pin";
