-- ===========================================================================
-- Cicalino — Split the internal billing reminder off aviso_cobro_en
-- Run in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- PROBLEM
-- `aviso_cobro_en` had two owners writing it with different meanings:
--
--   · sendBillingReminders (actions/billing.ts) sends ONE email to
--     LEAD_NOTIFY_EMAIL summarising every account that needs attention, and
--     then stamps the column on all of them. Meaning: "I told the operator
--     about this account today."
--
--   · planDailyActions (subscriptionCron.ts) reads it to decide whether the
--     customer already got their overdue notice for this billing cycle.
--     Meaning: "the customer was told."
--
-- Both run from the same cron, one after the other. So an internal reminder
-- can stamp the column and make the cron think the customer was already
-- notified when they weren't. Whether that happens depends on how two
-- independent schedules line up: the internal one keys off `proximo_cobro_en`
-- (old billing model) and the customer one off `proxima_factura` (new one).
--
-- It doesn't fail every day. It fails quietly and unpredictably, which is
-- worse to diagnose: an account stops getting notices and nothing looks wrong.
--
-- FIX
-- Give the internal reminder its own column. Nothing else changes.
-- ===========================================================================

alter table public.organizaciones
  add column if not exists aviso_interno_en timestamptz;

comment on column public.organizaciones.aviso_interno_en is
  'Last time the operator was emailed about this account (LEAD_NOTIFY_EMAIL). Internal only — has nothing to do with what the customer was told.';

comment on column public.organizaciones.aviso_cobro_en is
  'Last time the CUSTOMER was emailed about an overdue payment. Only subscriptionCron writes this.';


-- ---------------------------------------------------------------------------
-- Backfill so the first run after deploy doesn't re-send today's internal
-- reminder for accounts that already got one.
--
-- Copying aviso_cobro_en across is deliberately conservative: some of those
-- stamps were the internal reminder and some were the customer notice, and
-- there's no way to tell them apart now. Erring towards "already notified"
-- costs one skipped internal email; erring the other way emails the operator
-- about every pending account at once.
-- ---------------------------------------------------------------------------
update public.organizaciones
   set aviso_interno_en = aviso_cobro_en
 where aviso_interno_en is null
   and aviso_cobro_en is not null;


-- ---------------------------------------------------------------------------
-- Check: accounts where the two columns now disagree. Right after running
-- this they should all match; they start diverging from the next cron run.
-- ---------------------------------------------------------------------------
select
  count(*) filter (where aviso_cobro_en is not null) as con_aviso_al_cliente,
  count(*) filter (where aviso_interno_en is not null) as con_aviso_interno,
  count(*) filter (
    where aviso_cobro_en is distinct from aviso_interno_en
  ) as distintos
from public.organizaciones;
