-- ===========================================================================
-- Cicalino — Liberar mesas unidas en una sola transacción
-- Correr en: Supabase Dashboard → SQL Editor / pnpm db:sql. Idempotente.
-- Requiere: modulo-espera.sql, reservas-mesa.sql, security-fixes-04.sql
--
-- PROBLEMA
-- Todo el módulo de sala resuelve las operaciones multi-mesa con RPC atómicas
-- (sentar_walkin, sentar_espera, sentar_reserva, sincronizar_mesas). Liberar
-- era la excepción: el panel resolvía el grupo en JavaScript y mandaba un
-- UPDATE por mesa, en serie.
--
-- Un grupo de tres mesas eran tres idas al servidor sin transacción: si
-- fallaba la segunda —la tablet perdió el wifi a mitad de camino, cosa que en
-- un salón pasa— quedaba una mesa libre y dos ocupadas, sin nada que lo
-- revirtiera. El mozo veía media unión liberada y tenía que adivinar cuál era
-- cuál.
--
-- SOLUCIÓN
-- Un único UPDATE. El grupo se arma acá y no en el cliente: así se decide con
-- lo que la base tiene en ese instante y no con el snapshot que la pantalla
-- venía mostrando.
--
-- CONCURRENCIA
-- Es idempotente. Si dos mozos liberan la misma unión a la vez, el segundo
-- encuentra las mesas ya en 'libre': la parte del grupo deja de matchear
-- (pide estado = 'ocupada') y el UPDATE queda en un no-op sobre la mesa que
-- se tocó. Nadie ve un error y no se libera nada de más.
--
-- HISTORIAL
-- Se sella `actualizado_en`, que es lo que el modelo ya tiene para registrar
-- cuándo cambió la mesa. No se agrega ninguna columna nueva.
-- ===========================================================================

create or replace function public.liberar_mesas(
  p_local     uuid,
  p_numero    integer,
  p_solo_esta boolean default false
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.puede_ver_local(p_local) then
    raise exception 'No autorizado';
  end if;

  with objetivo as (
    select espera_id, reserva_id, estado
      from public.mesas
     where local_id = p_local
       and numero = p_numero
  )
  update public.mesas m
     set estado = 'libre',
         espera_id = null,
         reserva_id = null,
         actualizado_en = now()
    from objetivo o
   where m.local_id = p_local
     and (
       m.numero = p_numero
       or (
         -- El resto de la unión: mismas mesas ocupadas por el mismo grupo.
         -- `p_solo_esta` es el botón "liberar solo esta" del panel.
         not coalesce(p_solo_esta, false)
         and o.estado = 'ocupada'
         and m.estado = 'ocupada'
         and (
              (o.espera_id  is not null and m.espera_id  = o.espera_id)
           or (o.reserva_id is not null and m.reserva_id = o.reserva_id)
         )
       )
     );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/* Postgres le da EXECUTE a PUBLIC por defecto, y anon hereda de ahí. La
 * función corta igual con puede_ver_local, pero se revoca como en
 * security-fixes-10: que no dependa de un solo chequeo. */
revoke all on function public.liberar_mesas(uuid, integer, boolean)
  from public, anon;
grant execute on function public.liberar_mesas(uuid, integer, boolean)
  to authenticated;

comment on function public.liberar_mesas(uuid, integer, boolean) is
  'Libera una mesa y, salvo p_solo_esta, el resto de su unión, en una sola transacción.';


-- ---------------------------------------------------------------------------
-- Chequeo: uniones a medio liberar. Mesas ocupadas cuyo grupo ya no tiene a
-- nadie más ocupado, o que apuntan a una espera que ya no está sentada.
-- Con el UPDATE por mesa esto se podía acumular; ahora no debería crecer.
-- ---------------------------------------------------------------------------
-- select m.local_id, m.numero, m.espera_id, m.reserva_id
-- from public.mesas m
-- left join public.esperas e on e.id = m.espera_id
-- where m.estado = 'ocupada'
--   and m.espera_id is not null
--   and (e.id is null or e.estado <> 'sentado')
-- order by m.local_id, m.numero;
