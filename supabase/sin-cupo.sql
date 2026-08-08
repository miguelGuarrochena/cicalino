-- ===========================================================================
-- Cicalino — Se elimina el cupo de sucursales
-- Correr en: Supabase Dashboard → SQL Editor
-- Requiere: security-fixes-02.sql
-- Orden sugerido: #34 de 39 (ver chequeo-migraciones.sql)
-- Idempotente.
--
-- El cobro pasó a armarse con el pack de cada sucursal activa, así que el
-- número de "sucursales contratadas" ya no decide nada. El trigger que
-- quedaba seguía rechazando altas por cupo lleno.
-- ===========================================================================

drop trigger if exists locales_cupo on public.locales;
drop function if exists public.chequear_cupo_sucursales();

-- La columna organizaciones.cupo queda como estaba: los pedidos de sucursal
-- viejos la referencian y borrarla no aporta nada.
comment on column public.organizaciones.cupo is
  'Sin uso desde julio 2026. El cobro se arma con los packs de cada sucursal.';
