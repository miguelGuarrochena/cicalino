-- ===========================================================================
-- Cicalino — avisado_en (re-avisar al cliente con la pestaña abierta)
-- Idempotente. Correr en SQL Editor después de setup / security-fixes.
-- ===========================================================================

alter table public.pedidos
  add column if not exists avisado_en timestamptz;

-- Pedidos ya listos: seed con listo_en para no disparar señal al abrir viejos QR.
update public.pedidos
   set avisado_en = coalesce(avisado_en, listo_en)
 where estado = 'listo' and listo_en is not null and avisado_en is null;
