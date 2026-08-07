-- ===========================================================================
-- Cicalino — Constraints y transiciones para espera, reservas y mesas
-- Correr en: Supabase Dashboard → SQL Editor. Idempotente.
--
-- CONTEXTO
-- security-fixes-02.sql le puso a `pedidos` cuatro defensas: transiciones de
-- estado válidas, formato del qr_token, tope de expiración y largos de campo.
--
-- `esperas` y `reservas` son estructuralmente lo mismo (token QR, expiración,
-- máquina de estados) pero son posteriores y nunca las heredaron. Como el
-- panel escribe directo a PostgREST con la anon key, sin esto alcanza con
-- abrir devtools para que una espera cancelada vuelva a "sentado", o para
-- meter un nombre de un megabyte.
--
-- Lo peor no es el abuso, es el accidente: una espera que pasa de cancelado a
-- sentado deja timestamps incoherentes, y las métricas de tiempo de espera
-- salen negativas o absurdas sin que nadie sepa por qué.
--
-- ⚠️ El editor de Supabase muestra solo el resultado de la última sentencia.
--    Corré el bloque 0 solo primero.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) ANTES DE NADA: ver si hay datos que violen lo que vamos a exigir.
--    Si todo da 0, el resto corre sin drama.
-- ---------------------------------------------------------------------------
select 'esperas: nombre fuera de rango' as chequeo, count(*) as filas
  from public.esperas where char_length(nombre) not between 1 and 80
union all
select 'esperas: personas fuera de 1..50', count(*)
  from public.esperas where personas not between 1 and 50
union all
select 'esperas: qr_token no es uuid', count(*)
  from public.esperas
 where qr_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
union all
select 'esperas: expiracion a mas de 48h', count(*)
  from public.esperas where qr_expira_en > creado_en + interval '48 hours'
union all
select 'esperas: estado incoherente con timestamps', count(*)
  from public.esperas
 where (estado = 'sentado'   and sentado_en   is null)
    or (estado = 'cancelado' and cancelado_en is null)
union all
select 'reservas: nombre fuera de rango', count(*)
  from public.reservas where char_length(nombre) not between 1 and 80
union all
select 'reservas: personas fuera de 1..50', count(*)
  from public.reservas where personas not between 1 and 50
union all
select 'reservas: gracia distinta de 15/20', count(*)
  from public.reservas where gracia_minutos not in (15, 20)
union all
select 'reservas: mesa_numero < 1', count(*)
  from public.reservas where mesa_numero < 1
union all
select 'mesas: estado desconocido', count(*)
  from public.mesas where estado not in ('libre', 'ocupada', 'reservada')
union all
select 'mesas: capacidad fuera de 1..50', count(*)
  from public.mesas where capacidad not between 1 and 50;


-- ---------------------------------------------------------------------------
-- 1) Largos y rangos.
--
-- Van como NOT VALID: aplican a todo lo que se escriba de ahora en adelante,
-- pero no fallan si quedó alguna fila vieja fuera de rango. Si el bloque 0
-- dio todo en cero, al final está el VALIDATE para cerrarlas del todo.
-- ---------------------------------------------------------------------------
alter table public.esperas
  drop constraint if exists esperas_nombre_len,
  add  constraint esperas_nombre_len
    check (char_length(nombre) between 1 and 80) not valid,
  drop constraint if exists esperas_personas_rango,
  add  constraint esperas_personas_rango
    check (personas between 1 and 50) not valid,
  drop constraint if exists esperas_mesa_numero_rango,
  add  constraint esperas_mesa_numero_rango
    check (mesa_numero is null or mesa_numero between 1 and 500) not valid;

alter table public.reservas
  drop constraint if exists reservas_nombre_len,
  add  constraint reservas_nombre_len
    check (char_length(nombre) between 1 and 80) not valid,
  drop constraint if exists reservas_personas_rango,
  add  constraint reservas_personas_rango
    check (personas between 1 and 50) not valid,
  drop constraint if exists reservas_gracia_valida,
  add  constraint reservas_gracia_valida
    check (gracia_minutos in (15, 20)) not valid,
  drop constraint if exists reservas_mesa_numero_rango,
  add  constraint reservas_mesa_numero_rango
    check (mesa_numero between 1 and 500) not valid;

alter table public.mesas
  drop constraint if exists mesas_estado_valido,
  add  constraint mesas_estado_valido
    check (estado in ('libre', 'ocupada', 'reservada')) not valid,
  drop constraint if exists mesas_capacidad_rango,
  add  constraint mesas_capacidad_rango
    check (capacidad between 1 and 50) not valid,
  drop constraint if exists mesas_numero_rango,
  add  constraint mesas_numero_rango
    check (numero between 1 and 500) not valid;


-- ---------------------------------------------------------------------------
-- 2) El qr_token de la espera lo genera el cliente con crypto.randomUUID().
--    Mismo criterio que en pedidos: exigimos que sea un UUID de verdad para
--    que nadie inserte un token corto y adivinable, y que la expiración no se
--    pueda estirar indefinidamente.
-- ---------------------------------------------------------------------------
alter table public.esperas
  drop constraint if exists esperas_qr_token_uuid,
  add  constraint esperas_qr_token_uuid
    check (qr_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    not valid,
  drop constraint if exists esperas_expira_razonable,
  add  constraint esperas_expira_razonable
    check (qr_expira_en <= creado_en + interval '48 hours') not valid;


-- ---------------------------------------------------------------------------
-- 3) Transiciones de estado de la espera.
--
-- El flujo real del panel es:
--   esperando → avisado → sentado
--   esperando/avisado → cancelado   (por el mostrador o por el propio cliente)
--
-- Sentado y cancelado son finales. Si hace falta deshacer, se borra la fila
-- (el panel ya tiene esa acción), no se la revive.
-- ---------------------------------------------------------------------------
create or replace function public.chequear_transicion_espera()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
       (old.estado = 'esperando' and new.estado in ('avisado', 'sentado', 'cancelado'))
    or (old.estado = 'avisado'   and new.estado in ('sentado', 'cancelado'))
  ) then
    raise exception 'Transicion de espera no permitida: % → %', old.estado, new.estado;
  end if;
  return new;
end;
$$;

drop trigger if exists esperas_transicion on public.esperas;
create trigger esperas_transicion
  before update of estado on public.esperas
  for each row execute function public.chequear_transicion_espera();


-- ---------------------------------------------------------------------------
-- 4) Transiciones de la reserva.
--
--   activa → sentada | cancelada | expirada
--
-- Expirada es final: si el cliente aparece tarde, el mostrador lo carga como
-- walk-in. Es lo que ya hace la UI, que solo ofrece "Sentar" en las activas.
-- ---------------------------------------------------------------------------
create or replace function public.chequear_transicion_reserva()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (old.estado = 'activa'
          and new.estado in ('sentada', 'cancelada', 'expirada')) then
    raise exception 'Transicion de reserva no permitida: % → %', old.estado, new.estado;
  end if;
  return new;
end;
$$;

drop trigger if exists reservas_transicion on public.reservas;
create trigger reservas_transicion
  before update of estado on public.reservas
  for each row execute function public.chequear_transicion_reserva();


-- ---------------------------------------------------------------------------
-- 5) Cerrar las constraints del todo.
--
-- Descomentá y corré esto SOLO si el bloque 0 dio todo en cero. VALIDATE
-- recorre la tabla y falla si encuentra una fila que no cumple; no bloquea
-- escrituras mientras corre.
-- ---------------------------------------------------------------------------
-- alter table public.esperas
--   validate constraint esperas_nombre_len,
--   validate constraint esperas_personas_rango,
--   validate constraint esperas_mesa_numero_rango,
--   validate constraint esperas_qr_token_uuid,
--   validate constraint esperas_expira_razonable;
-- alter table public.reservas
--   validate constraint reservas_nombre_len,
--   validate constraint reservas_personas_rango,
--   validate constraint reservas_gracia_valida,
--   validate constraint reservas_mesa_numero_rango;
-- alter table public.mesas
--   validate constraint mesas_estado_valido,
--   validate constraint mesas_capacidad_rango,
--   validate constraint mesas_numero_rango;
