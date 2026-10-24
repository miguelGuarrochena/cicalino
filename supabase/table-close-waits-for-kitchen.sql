-- ===========================================================================
-- Cicalino — La mesa pagada no se cierra con la cocina a medio camino
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: mesa-cierre-al-pagar.sql, mesa-consistencia-cobros.sql,
--           cocina-modo.sql, mesa-ocupacion-pedidos.sql
--
-- PROBLEMA
-- mesa-cierre-al-pagar.sql cierra la sesión de la cuenta compartida en cuanto
-- los pagos cubren el consumo y no queda ningún cobro pendiente. No mira los
-- pedidos. El consumo cuenta todo pedido no cancelado, así que una mesa puede
-- quedar cubierta con un pedido que el personal todavía no vio (`creado`) o,
-- con cocina en pantalla, uno que está en cocina o esperando que lo lleven
-- (`en_preparacion`). Pasa con "Pagar todo" apenas se pide el postre, o
-- cuando la caja cobra el total con un pedido recién entrado.
--
-- El panel arma el salón solo con sesiones abiertas o pagadas
-- (tableOps.buildFloor). Cerrada la sesión, ese pedido sale de "Nuevos
-- pedidos" sin que nadie lo anote, y el que cocina ya terminó sale de "Por
-- llevar": queda en la pila "Hecha" de cocina y el cliente nunca recibe el
-- listo. Es la misma regla que ya sigue _archivar_sesion_anterior
-- (mesa-ocupacion-pedidos.sql): con pedidos en curso no se cierra.
--
-- QUÉ CAMBIA
--   _sesion_cocina_pendiente (nueva): ¿hay trabajo de cocina que el salón
--     todavía tiene que mover? `creado` siempre; `en_preparacion` solo con
--     cocina en pantalla (con comanda impresa, "ya lo anoté" es el último
--     paso del pedido en Cicalino y en_preparacion es su estado final).
--   _revisar_cobertura (mesa-cierre-al-pagar.sql): cubierta y con cocina
--     pendiente, la sesión queda `pagada` —el estado que ya existía y que el
--     panel ya muestra— en vez de cerrarse. Sin cobros pendientes y sin
--     cocina pendiente, se cierra igual que antes.
--   trigger pedidos_revisar_cobertura (mesa-consistencia-cobros.sql): además
--     de al cancelar, revisa la cobertura cuando un pedido de la cuenta sale
--     de `creado` o de `en_preparacion`. Así la sesión pagada se cierra sola
--     cuando el salón anota o lleva el último pedido. Bloquea la sesión antes
--     de revisar: anotar y cobrar a la vez (o anotar dos pedidos a la vez)
--     ya no deja la mesa pagada sin cerrar.
--
-- QUÉ NO CAMBIA
--   Pagos, montos, cuándo una mesa queda pagada, Mesa (autoservicio) y el
--   mostrador QR (_revisar_cobertura no los toca), ni el cierre manual: el
--   personal puede seguir cerrando una mesa pagada desde el panel.
--   Una sesión `pagada` no toma pedidos ni comensales nuevos (como siempre):
--   la mesa vuelve a abrirse cuando se cierra esa sesión, o, con Recepción,
--   al liberarla (_archivar_sesion_anterior).
--   Las sesiones ya cerradas no se reabren.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) ¿Queda cocina por mover en esta sesión?
-- ---------------------------------------------------------------------------
create or replace function public._sesion_cocina_pendiente(p_sesion uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.pedidos p
      join public.locales l on l.id = p.local_id
     where p.sesion_id = p_sesion
       and (p.estado = 'creado'
            or (p.estado = 'en_preparacion' and l.cocina_modo = 'pantalla'))
  );
$$;

revoke all on function public._sesion_cocina_pendiente(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2) La cobertura cierra solo sin cobros ni cocina pendientes
-- ---------------------------------------------------------------------------
create or replace function public._revisar_cobertura(p_sesion uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_consumo integer;
  v_pagado integer;
  v_local uuid;
  v_estado public.mesa_sesion_estado;
  v_flujo text;
begin
  select estado, flujo into v_estado, v_flujo from public.mesa_sesiones where id = p_sesion;
  if coalesce(v_flujo, 'cuenta') <> 'cuenta' or v_estado = 'cerrada' then
    return;
  end if;
  v_consumo := public._consumo_sesion(p_sesion);
  select coalesce(sum(monto_base), 0) into v_pagado
    from public.pagos_mesa where sesion_id = p_sesion and estado = 'pagado';

  if v_consumo > 0 and v_pagado >= v_consumo then
    update public.mesa_sesiones
       set estado = 'pagada', pagada_en = now()
     where id = p_sesion and estado = 'abierta'
    returning local_id into v_local;
    if v_local is not null then
      perform public._mesa_evento(v_local, p_sesion, 'mesa_pagada', 'sistema',
        p_datos => json_build_object('consumo', v_consumo, 'pagado', v_pagado)::jsonb);
    end if;
    /* Un cobro en vuelo o un pedido que el salón todavía tiene que mover:
     * queda `pagada` y se vuelve a pasar por acá cuando se resuelve (el pago
     * al confirmarse o cancelarse, el pedido por pedidos_revisar_cobertura). */
    if not exists (
      select 1 from public.pagos_mesa
       where sesion_id = p_sesion and estado = 'pendiente'
    ) and not public._sesion_cocina_pendiente(p_sesion) then
      perform public._cerrar_sesion(p_sesion, 'pagada');
    end if;
  elsif v_estado = 'pagada' then
    update public.mesa_sesiones
       set estado = 'abierta', pagada_en = null, actualizado_en = now()
     where id = p_sesion and estado = 'pagada';
  end if;
end;
$$;

revoke all on function public._revisar_cobertura(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) Un pedido de la cuenta que avanza vuelve a revisar la cobertura
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_revisar_cobertura()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  /* _revisar_cobertura no hace nada con autoservicio, mostrador ni sesiones
   * ya cerradas, y _cerrar_sesion no toca pedidos de la cuenta compartida:
   * no hay forma de volver a entrar acá. Con la sesión abierta y sin cubrir,
   * avanzar un pedido no cambia el consumo y la llamada no hace nada.
   *
   * El lock de la sesión va antes de mirar nada. Sin él, dos cosas al mismo
   * tiempo dejan la mesa pagada para siempre: el mozo anota los dos últimos
   * pedidos a la vez (cada uno ve al otro todavía en `creado`), o anota el
   * último mientras la caja confirma el cobro que cubre la cuenta (el cobro
   * ve el pedido sin anotar y el pedido ve la cuenta sin cubrir). Con la
   * sesión bloqueada, el segundo espera y lee lo que el primero confirmó.
   * Es el mismo orden (fila del pedido, después la sesión) que ya usa
   * pedidos_mesa_guard al cancelar. */
  perform 1 from public.mesa_sesiones where id = new.sesion_id for update;
  perform public._revisar_cobertura(new.sesion_id);
  return null;
end;
$$;

revoke all on function public.pedidos_revisar_cobertura() from public, anon, authenticated;

drop trigger if exists pedidos_revisar_cobertura on public.pedidos;
create trigger pedidos_revisar_cobertura
  after update of estado on public.pedidos
  for each row
  when (new.estado is distinct from old.estado
        and (new.estado = 'cancelado' or old.estado in ('creado', 'en_preparacion'))
        and new.sesion_id is not null and not coalesce(new.autoservicio, false))
  execute function public.pedidos_revisar_cobertura();

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: true, true. La última columna lista las
-- sesiones de hoy que ya se cerraron por "pagada" con un pedido sin anotar:
-- son las que se perdieron antes de este script. No se reabren; si aparece
-- alguna, ese pedido hay que buscarlo en cocina o en el historial de la mesa.
-- ---------------------------------------------------------------------------
select
  to_regprocedure('public._sesion_cocina_pendiente(uuid)') is not null as funcion_cocina,
  exists (select 1 from pg_trigger
           where tgname = 'pedidos_revisar_cobertura'
             and tgrelid = 'public.pedidos'::regclass) as trigger_cobertura,
  (select count(*) from public.mesa_sesiones s
    where s.flujo = 'cuenta' and s.estado = 'cerrada' and s.cerrada_motivo = 'pagada'
      and s.cerrada_en >= public.jornada_inicio_local(s.local_id)
      and exists (select 1 from public.pedidos p
                   where p.sesion_id = s.id and p.estado = 'creado')) as cerradas_con_pedido_sin_anotar;
