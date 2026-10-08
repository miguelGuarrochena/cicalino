-- ===========================================================================
-- Cicalino — La mesa se cierra sola cuando la cuenta queda pagada
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: pedidos-mostrador-qr.sql, mostrador-qr-pago-previo.sql
--
-- Hasta ahora, cubrir el total pasaba la sesión a `pagada` y la mesa seguía
-- ocupada hasta que alguien tocaba "Cerrar mesa" en el panel. Con la cuenta
-- pagada no hay nada más que hacer con esa sesión: se cierra sola. Si la gente
-- se queda un rato más no pasa nada; si alguien vuelve a escanear para pedir
-- otra cosa, arranca una cuenta nueva.
--
-- Se cierra solo cuando no queda ningún pago `pendiente` (un Mercado Pago en
-- vuelo, un efectivo sin confirmar). En ese caso queda `pagada`, como antes, y
-- se cierra cuando ese pago se confirma o se cancela: los dos caminos vuelven
-- a pasar por acá. Las partes `definido` que nadie llegó a pagar ya no tienen
-- sentido con la cuenta cubierta; _cerrar_sesion las cancela y deja el evento.
--
-- QUÉ CAMBIA (parte de su versión vigente)
--   _revisar_cobertura (pedidos-mostrador-qr.sql) además de marcar `pagada`,
--                      cierra la sesión con motivo 'pagada' vía _cerrar_sesion
--                      (mostrador-qr-pago-previo.sql). Ya la llaman
--                      confirmar_pago_mesa, _crear_pago_mesa, mp_confirmar_pago
--                      y cancelar_pago_mesa.
-- ===========================================================================

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
    if not exists (
      select 1 from public.pagos_mesa
       where sesion_id = p_sesion and estado = 'pendiente'
    ) then
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

notify pgrst, 'reload schema';
