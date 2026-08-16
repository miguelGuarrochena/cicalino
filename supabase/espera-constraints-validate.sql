-- ===========================================================================
-- Cicalino — Cerrar del todo las constraints de espera / reservas / mesas
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: espera-constraints.sql
-- Orden sugerido: al final (ver orden.json)
--
-- CONTEXTO
-- espera-constraints.sql agregó doce CHECK como NOT VALID, y dejó el VALIDATE
-- comentado en su bloque 5 para no fallar contra filas viejas. NOT VALID ya
-- aplica a todo INSERT/UPDATE nuevo, así que la protección real venía
-- funcionando desde el día uno; lo único que faltaba era confirmar que las
-- filas preexistentes también cumplen.
--
-- Se corrió el bloque 0 de espera-constraints.sql contra la base el
-- 16/08/2026: doce chequeos, cero violaciones. Por eso esto puede ir sin
-- riesgo de que falle.
--
-- POR QUÉ UN ARCHIVO NUEVO Y NO DESCOMENTAR EL BLOQUE 5
-- espera-constraints.sql ya figura como aplicado en cicalino_schema_migrations,
-- así que `pnpm db:sql` no lo vuelve a correr. Editarlo no ejecutaría nada.
--
-- SOBRE EL LOCK
-- VALIDATE CONSTRAINT toma SHARE UPDATE EXCLUSIVE: recorre la tabla pero NO
-- bloquea lecturas ni escrituras. Se puede correr con el local abierto.
--
-- Si alguna fallara, la fila culpable entró después del chequeo: corré el
-- bloque 0 de espera-constraints.sql para encontrarla, arreglala y volvé.
-- ===========================================================================

alter table public.esperas
  validate constraint esperas_nombre_len,
  validate constraint esperas_personas_rango,
  validate constraint esperas_mesa_numero_rango,
  validate constraint esperas_qr_token_uuid,
  validate constraint esperas_expira_razonable;

alter table public.reservas
  validate constraint reservas_nombre_len,
  validate constraint reservas_personas_rango,
  validate constraint reservas_gracia_valida,
  validate constraint reservas_mesa_numero_rango;

alter table public.mesas
  validate constraint mesas_estado_valido,
  validate constraint mesas_capacidad_rango,
  validate constraint mesas_numero_rango;

-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: 0 filas — ninguna constraint de estas
-- tres tablas queda sin validar.
-- ---------------------------------------------------------------------------
select conrelid::regclass::text as tabla, conname
  from pg_constraint
 where connamespace = 'public'::regnamespace
   and conrelid in ('public.esperas'::regclass,
                    'public.reservas'::regclass,
                    'public.mesas'::regclass)
   and not convalidated
 order by 1, 2;
