-- ===========================================================================
-- Cicalino — Cobros del panel con monto esperado y cobertura al cancelar
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: staff-empleado-cobro.sql, mesa-cierre-al-pagar.sql
--
-- 1) El panel confirma el importe que ve.
--    Registrar un cobro desde el panel ya pasa por _crear_pago_mesa, que
--    rechaza con monto-cambio si `monto_esperado` no coincide: el panel ahora
--    lo manda (src/lib/schemas, CobrarModal). Confirmar un pago que el
--    comensal dejó pendiente no pasaba por ahí: confirmar_pago_mesa recibe el
--    importe que muestra el botón y responde igual, con monto-cambio y el
--    monto correcto, sin confirmar nada.
--
--    El parámetro es opcional en la base para que un panel abierto con la
--    versión anterior siga confirmando mientras se despliega; el panel nuevo
--    siempre lo manda.
--
-- 2) Cancelar un pedido vuelve a revisar la cobertura.
--    pedidos_mesa_guard ya impide cancelar un pedido si los pagos tomados
--    superarían lo que queda. Pero si lo confirmado queda justo igual al
--    consumo restante, la cuenta queda cubierta y la mesa seguía abierta.
--    Un trigger AFTER (el BEFORE todavía ve el pedido sin cancelar) llama a
--    _revisar_cobertura, la misma regla que usan los pagos.
--
-- QUÉ CAMBIA
--   confirmar_pago_mesa (staff-empleado-cobro.sql) + p_monto_esperado.
--   pedidos_revisar_cobertura (nuevo trigger AFTER UPDATE OF estado).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) confirmar_pago_mesa con monto esperado
-- ---------------------------------------------------------------------------
drop function if exists public.confirmar_pago_mesa(uuid, uuid);

create or replace function public.confirmar_pago_mesa(
  p_pago uuid,
  p_empleado uuid default null,
  p_monto_esperado integer default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos_mesa%rowtype;
  v_attr json;
begin
  select * into v_p from public.pagos_mesa where id = p_pago;
  if not found or not public._staff_puede(v_p.local_id, true) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_attr := public._staff_empleado_cobro(v_p.local_id, p_empleado);
  if coalesce(v_attr->>'ok', '') <> 'true' then
    return json_build_object('ok', false, 'reason', coalesce(v_attr->>'reason', 'empleado-invalido'));
  end if;
  p_empleado := nullif(v_attr->>'empleado', '')::uuid;

  perform 1 from public.mesa_sesiones where id = v_p.sesion_id for update;
  select * into v_p from public.pagos_mesa where id = p_pago for update;

  if v_p.metodo = 'mercado_pago' then
    return json_build_object('ok', false, 'reason', 'mp-solo-webhook');
  end if;
  if v_p.estado = 'pagado' then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  if v_p.estado <> 'pendiente' then
    return json_build_object('ok', false, 'reason', 'no-pendiente', 'estado', v_p.estado);
  end if;
  /* Misma respuesta que _crear_pago_mesa con monto_esperado. */
  if p_monto_esperado is not null and p_monto_esperado <> v_p.monto_total then
    return json_build_object('ok', false, 'reason', 'monto-cambio',
      'monto_base', v_p.monto_base, 'propina', v_p.propina, 'recargo', v_p.recargo,
      'monto_total', v_p.monto_total);
  end if;

  update public.pagos_mesa
     set estado = 'pagado', confirmacion = 'manual', confirmado_en = now(),
         confirmado_por = auth.uid(), confirmado_empleado = p_empleado,
         actualizado_en = now()
   where id = v_p.id;

  perform public._mesa_evento(v_p.local_id, v_p.sesion_id, 'pago_confirmado', 'personal',
    p_pago => v_p.id, p_empleado => p_empleado,
    p_datos => json_build_object('metodo', v_p.metodo, 'monto_total', v_p.monto_total)::jsonb);
  perform public._revisar_cobertura(v_p.sesion_id);
  perform public._tocar_sesion(v_p.sesion_id);
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.confirmar_pago_mesa(uuid, uuid, integer) from public, anon;
grant execute on function public.confirmar_pago_mesa(uuid, uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- 2) Cancelar un pedido de la cuenta compartida revisa la cobertura
-- ---------------------------------------------------------------------------
create or replace function public.pedidos_revisar_cobertura()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  /* _revisar_cobertura no hace nada con autoservicio, mostrador ni sesiones
   * ya cerradas, y _cerrar_sesion no toca pedidos de la cuenta compartida:
   * no hay forma de volver a entrar acá. */
  perform public._revisar_cobertura(new.sesion_id);
  return null;
end;
$$;

revoke all on function public.pedidos_revisar_cobertura() from public, anon, authenticated;

drop trigger if exists pedidos_revisar_cobertura on public.pedidos;
create trigger pedidos_revisar_cobertura
  after update of estado on public.pedidos
  for each row
  when (new.estado = 'cancelado' and old.estado <> 'cancelado'
        and new.sesion_id is not null and not coalesce(new.autoservicio, false))
  execute function public.pedidos_revisar_cobertura();

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: true, false, true.
-- ---------------------------------------------------------------------------
select
  to_regprocedure('public.confirmar_pago_mesa(uuid, uuid, integer)') is not null as confirmar_nuevo,
  to_regprocedure('public.confirmar_pago_mesa(uuid, uuid)') is not null as confirmar_viejo,
  exists (select 1 from pg_trigger
           where tgname = 'pedidos_revisar_cobertura'
             and tgrelid = 'public.pedidos'::regclass) as trigger_cobertura;
