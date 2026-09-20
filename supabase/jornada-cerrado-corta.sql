-- ===========================================================================
-- Cicalino — En un día cerrado no hay jornada activa
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: dias-cerrados-jornada.sql
--
-- PROBLEMA
-- dias-cerrados-jornada.sql estiraba la jornada del último día abierto sobre
-- el franco: el lunes cerrado seguía siendo "el domingo". El panel mostraba
-- pedidos, mesas y cola de anoche como si fueran la operación de hoy.
--
-- REGLA
-- Si no hay jornada activa, no hay operación activa. Un franco arranca su
-- propio tramo (vacío). Lo anterior queda en historial. El corte de un
-- domingo es el lunes a hora_corte, aunque el lunes esté cerrado: ahí el
-- cron libera mesas y las listas de hoy no traen lo de ayer.
--
-- QUÉ SE REESCRIBE
-- Solo el cálculo de arranque y cierre. El resto (pedidos_pagina, cuentas,
-- liberar_mesas, alta de pedidos) ya llama a estas dos funciones.
-- ===========================================================================


create or replace function public.jornada_inicio_corte(
  p_corte integer,
  p_cerrados integer[] default '{}'::integer[]
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_corte     integer;
  v_local_now timestamp;
  v_dia       date;
begin
  v_corte := coalesce(p_corte, 6);
  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  /* p_cerrados se acepta para no romper la firma. Ya no saltea francos:
   * el día del tramo es el del reloj del negocio, con el corte de siempre. */
  perform p_cerrados;

  v_local_now := timezone('America/Argentina/Buenos_Aires', now());
  if extract(hour from v_local_now)::int < v_corte then
    v_dia := (v_local_now::date - 1);
  else
    v_dia := v_local_now::date;
  end if;

  return ((v_dia::timestamp + make_interval(hours => v_corte))
    at time zone 'America/Argentina/Buenos_Aires');
end;
$$;

revoke all on function public.jornada_inicio_corte(integer, integer[])
  from public, anon, authenticated;

comment on function public.jornada_inicio_corte(integer, integer[]) is
  'Arranque de la jornada actual. Un franco no hereda el día abierto anterior.';


create or replace function public.jornada_fin_corte(
  p_corte integer,
  p_cerrados integer[] default '{}'::integer[]
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_corte integer;
  v_dia   date;
begin
  v_corte := coalesce(p_corte, 6);
  if v_corte < 0 or v_corte > 23 then
    v_corte := 6;
  end if;

  v_dia := (timezone('America/Argentina/Buenos_Aires',
              public.jornada_inicio_corte(v_corte, p_cerrados)))::date + 1;

  return ((v_dia::timestamp + make_interval(hours => v_corte))
    at time zone 'America/Argentina/Buenos_Aires');
end;
$$;

revoke all on function public.jornada_fin_corte(integer, integer[])
  from public, anon, authenticated;

comment on function public.jornada_fin_corte(integer, integer[]) is
  'Cierre de la jornada: el corte del día calendario siguiente, aunque esté cerrado.';
