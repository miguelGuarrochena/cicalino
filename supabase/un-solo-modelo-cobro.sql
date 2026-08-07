-- ===========================================================================
-- Cicalino — One source of truth for billing
-- Run in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- PROBLEM
-- Two models answered the same question and could disagree.
--
--   old: pagado, proximo_cobro_en   → the Superadmin Cobros panel
--   new: estado_suscripcion, proxima_factura → the cron and the cut-off
--
-- They diverged from the moment an account was created: signup wrote
-- `proximo_cobro_en` as the end of the courtesy month and `proxima_factura` as
-- the end of the 30-day trial. `savePayment` then wrote both to the same value.
-- So which date was right depended on whether the account had ever paid.
--
-- The app now reads the new model everywhere. This backfills so nothing is
-- lost, and leaves the old column ready to drop.
--
-- ⚠️ Run block 0 first and look at it before going on.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) WHERE THE TWO MODELS DISAGREE TODAY.
--
-- Each row is an account whose billing date depends on which column you read.
-- After the backfill below they all line up on the later of the two.
-- ---------------------------------------------------------------------------
select
  o.nombre               as empresa,
  o.dueno_email          as email,
  o.estado_suscripcion,
  o.pagado,
  o.proximo_cobro_en::date as modelo_viejo,
  o.proxima_factura        as modelo_nuevo,
  case
    when o.proxima_factura is null then 'solo tiene la vieja'
    when o.proximo_cobro_en is null then 'solo tiene la nueva'
    when o.proximo_cobro_en::date > o.proxima_factura then 'la vieja es posterior'
    else 'la nueva es posterior'
  end as cual_manda
from public.organizaciones o
where o.proximo_cobro_en::date is distinct from o.proxima_factura
order by o.nombre;


-- ---------------------------------------------------------------------------
-- 1) Backfill.
--
-- Takes the LATER of the two dates on purpose: erring that way means nobody
-- gets billed sooner than what they'd been told. Costs at most a few days of
-- one invoice; the other direction charges people early, which is a phone call
-- and an apology.
-- ---------------------------------------------------------------------------
update public.organizaciones
   set proxima_factura = greatest(
         coalesce(proxima_factura, proximo_cobro_en::date),
         coalesce(proximo_cobro_en::date, proxima_factura)
       )
 where proximo_cobro_en is not null
   and proximo_cobro_en::date is distinct from proxima_factura;


-- ---------------------------------------------------------------------------
-- 2) `pagado` stops being independent.
--
-- It's still written — the Superadmin "Marcar impago" button sets it — but
-- nothing decides anything from it any more. Line it up with the subscription
-- state so the two don't contradict each other while it's still around.
-- ---------------------------------------------------------------------------
update public.organizaciones
   set pagado = (coalesce(estado_suscripcion::text, 'active')
                 not in ('pending_payment', 'expired'))
 where pagado is distinct from (coalesce(estado_suscripcion::text, 'active')
                                not in ('pending_payment', 'expired'));

comment on column public.organizaciones.pagado is
  'Informational only. The subscription state is estado_suscripcion; nothing branches on this.';

comment on column public.organizaciones.proximo_cobro_en is
  'DEPRECATED — superseded by proxima_factura. No longer read or written by the app. Safe to drop once a deploy has settled.';


-- ---------------------------------------------------------------------------
-- 3) Drop the old column.
--
-- Left commented on purpose: dropping is irreversible, and if a deploy has to
-- roll back, the previous build still reads this column. Run it once the new
-- version has been up for a few days.
-- ---------------------------------------------------------------------------
-- alter table public.organizaciones drop column proximo_cobro_en;


-- ---------------------------------------------------------------------------
-- 4) Check: should come back empty once block 1 has run.
-- ---------------------------------------------------------------------------
select count(*) as siguen_sin_coincidir
from public.organizaciones
where proximo_cobro_en is not null
  and proximo_cobro_en::date is distinct from proxima_factura;
