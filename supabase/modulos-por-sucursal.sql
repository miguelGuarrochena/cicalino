-- ===========================================================================
-- Cicalino — Módulos contratados por sucursal (fuente de verdad)
-- Correr en: Supabase Dashboard → SQL Editor
-- Idempotente: se puede re-ejecutar.
--
-- Modelo:
--   locales.modulo_*     = lo contratado / cobrado por esa sucursal
--   organizaciones.modulo_* = agregado (OR) de sus locales (listados / legacy)
-- El dueño NO elige módulos en Config: solo ve lo contratado + preferencia
-- de dispositivo si esa sucursal tiene ambos.
-- ===========================================================================

-- Sincroniza el agregado de la org con lo de sus locales.
update public.organizaciones o
set
  modulo_pedidos = coalesce((
    select bool_or(l.modulo_pedidos)
    from public.locales l
    where l.organizacion_id = o.id
  ), o.modulo_pedidos),
  modulo_espera = coalesce((
    select bool_or(l.modulo_espera)
    from public.locales l
    where l.organizacion_id = o.id
  ), o.modulo_espera);

-- Al menos un módulo por org (si quedó sin locales o ambos off).
update public.organizaciones
set modulo_pedidos = true
where modulo_pedidos = false and modulo_espera = false;

update public.locales
set modulo_pedidos = true
where modulo_pedidos = false and modulo_espera = false;
