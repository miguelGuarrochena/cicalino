-- ===========================================================================
-- Cicalino — Realtime de mesas: el panel tiene que enterarse solo
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: split-payments.sql
--
-- Mesas escucha postgres_changes de mesa_sesiones filtrado por local_id.
-- Con replica identity DEFAULT Postgres solo publica la PK (id) en UPDATE y
-- DELETE, así que el filtro tira el evento. El llamado al mozo, un pedido de
-- mesa y pedir la cuenta tocan la sesión y no llegaban al panel hasta que
-- otra acción recargaba las cuentas.
--
-- FULL incluye local_id en el payload. No cambia el modelo ni las funciones.
-- ===========================================================================

alter table public.mesa_sesiones replica identity full;
