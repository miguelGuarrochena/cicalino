-- ===========================================================================
-- Cicalino — Los teléfonos de la mesa se enteran al toque de cualquier cambio
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: split-payments.sql
--
-- Cada teléfono escucha el canal público `mesa-cuenta:<sesión>`. Hasta ahora
-- solo avisaban algunas rutas del comensal (dividir, definir parte, pagar,
-- pedir cuenta), y desde el servidor por REST. Lo que hacía el personal
-- (confirmar un cobro, marcar un pedido listo, cerrar la mesa) y lo que
-- confirmaba el webhook de Mercado Pago no avisaba a nadie: el resto de la mesa
-- se enteraba con el polling, o cuando tocaba algo.
--
-- Toda escritura sobre una cuenta sube mesa_sesiones.version (_tocar_sesion),
-- así que un trigger acá cubre todos los caminos de una vez, sin importar
-- quién escribió. El aviso no lleva datos de la cuenta: solo el id de la
-- sesión, y el teléfono vuelve a pedir la cuenta por su ruta autenticada.
--
-- realtime.send entrega el mensaje cuando la transacción confirma. Si falla
-- (proyecto sin el esquema realtime, por ejemplo) no rompe la escritura: el
-- polling del teléfono sigue siendo el piso.
-- ===========================================================================

create or replace function public.mesa_sesiones_avisar_cuenta()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('sessionId', new.id),
      'cambio',
      'mesa-cuenta:' || new.id::text,
      false
    );
  exception when others then
    raise warning 'mesa_sesiones_avisar_cuenta: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.mesa_sesiones_avisar_cuenta() from public, anon, authenticated;

drop trigger if exists mesa_sesiones_avisar_cuenta on public.mesa_sesiones;
create trigger mesa_sesiones_avisar_cuenta
  after update on public.mesa_sesiones
  for each row
  when (old.version is distinct from new.version
        or old.estado is distinct from new.estado)
  execute function public.mesa_sesiones_avisar_cuenta();


-- ---------------------------------------------------------------------------
-- Chequeo (solo lectura). Esperado: true, true.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from pg_trigger
           where tgname = 'mesa_sesiones_avisar_cuenta'
             and tgrelid = 'public.mesa_sesiones'::regclass) as trigger_creado,
  to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null as realtime_send_disponible;
