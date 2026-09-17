-- ===========================================================================
-- Cicalino — Pedir cuenta no es llamar al mozo
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: mesa-llamado-mozo.sql
--
-- Elegir efectivo, transferencia o tarjeta desde el celular deja el pago
-- pendiente para Cobrar. No prende «Te llaman»: eso es solo el botón de
-- llamar. Mercado Pago sigue cobrando solo, por el checkout.
-- ===========================================================================

create or replace function public.pagar_como_comensal(
  p_comensal uuid,
  p_token_hash text,
  p_datos jsonb
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_c public.comensales%rowtype;
begin
  v_c := public._comensal_valido(p_comensal, p_token_hash);
  if v_c.id is null then
    return json_build_object('ok', false, 'reason', 'comensal-invalido');
  end if;
  if not public.local_tiene_modulo(v_c.local_id, 'pagos') then
    return json_build_object('ok', false, 'reason', 'not-available');
  end if;
  return public._crear_pago_mesa(v_c.sesion_id, v_c.id, 'comensal', p_datos);
end;
$$;

notify pgrst, 'reload schema';
