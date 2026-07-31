-- ===========================================================================
-- Cicalino — Reservas que avisan, no bloquean (módulo espera)
-- Correr en: Supabase Dashboard → SQL Editor
-- Idempotente: se puede re-ejecutar.
--
-- Qué cambia:
--   Antes: cargar una reserva para las 21:00 dejaba la mesa "reservada" todo
--          el día y no se podía usar.
--   Ahora: la mesa sigue libre. La reserva solo avisa (en el mapa y al sentar).
-- ===========================================================================

-- 1) La reserva guarda sus propias mesas (antes se deducían de mesas.reserva_id,
--    que ya no se marca al crear la reserva).
alter table public.reservas
  add column if not exists mesas_numeros integer[] not null default '{}';

-- Backfill: primero desde las mesas que apuntan a la reserva.
update public.reservas r
set mesas_numeros = sub.nums
from (
  select reserva_id, array_agg(distinct numero order by numero) as nums
  from public.mesas
  where reserva_id is not null
  group by reserva_id
) sub
where r.id = sub.reserva_id
  and coalesce(array_length(r.mesas_numeros, 1), 0) = 0;

-- Backfill: el resto, con la mesa principal.
update public.reservas
set mesas_numeros = array[mesa_numero]
where coalesce(array_length(mesas_numeros, 1), 0) = 0;

-- 2) Liberar las mesas que hoy están bloqueadas por una reserva futura.
update public.mesas
set estado = 'libre',
    reserva_id = null,
    actualizado_en = now()
where estado = 'reservada';

-- 3) La mesa solo puede estar libre u ocupada. "Reservada" pasa a ser
--    información de la reserva, no un estado de la mesa.
alter table public.mesas
  drop constraint if exists mesas_estado_check;

alter table public.mesas
  add constraint mesas_estado_check
  check (estado in ('libre', 'ocupada'));

-- 4) Índice para buscar reservas activas por horario (avisos del mapa).
create index if not exists idx_reservas_local_estado_horario
  on public.reservas (local_id, estado, horario);
