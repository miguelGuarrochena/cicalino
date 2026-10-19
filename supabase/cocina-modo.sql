-- ===========================================================================
-- Cicalino — Cocina: pantalla o imprimir
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: mesa-pedido-comensal.sql
--
-- imprimir (default) deja el flujo de siempre: el mostrador copia la comanda.
-- pantalla es la sección de cocina. Ahí "en_preparacion" lo marca cocina,
-- no el barrido del minuto: si el barrido siguiera, la comanda saldría de
-- "Nueva" sola.
-- ===========================================================================

alter table public.locales
  add column if not exists cocina_modo text not null default 'imprimir';

alter table public.locales
  drop constraint if exists locales_cocina_modo_valida;

alter table public.locales
  add constraint locales_cocina_modo_valida
    check (cocina_modo in ('imprimir', 'pantalla'));

comment on column public.locales.cocina_modo is
  'imprimir: se copia la comanda (el flujo de siempre). pantalla: cocina la pasa de nueva a preparando a lista.';

create or replace function public.marcar_en_preparacion_local(p_local uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from public.locales l
     where l.id = p_local and l.cocina_modo = 'pantalla'
  ) then
    return 0;
  end if;

  update public.pedidos
     set estado = 'en_preparacion',
         en_preparacion_en = now()
   where local_id = p_local
     and estado = 'creado'
     and sesion_id is null
     and creado_en <= now() - interval '1 minute';

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.marcar_en_preparacion_pendientes()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  update public.pedidos p
     set estado = 'en_preparacion',
         en_preparacion_en = now()
   where p.estado = 'creado'
     and p.sesion_id is null
     and p.creado_en <= now() - interval '1 minute'
     and not exists (
       select 1 from public.locales l
        where l.id = p.local_id and l.cocina_modo = 'pantalla'
     );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.marcar_en_preparacion_local(uuid) to authenticated;
revoke execute on function public.marcar_en_preparacion_pendientes()
  from public, anon, authenticated;
