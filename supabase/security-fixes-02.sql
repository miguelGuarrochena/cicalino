-- ===========================================================================
-- Cicalino — Fixes de seguridad #02 (validación y reglas de negocio en la base)
-- Correr DESPUÉS de security-fixes-01.sql. Idempotente.
--
-- Criterio: la validación de Zod corre en el server y en el cliente, pero el
-- panel escribe a Supabase DIRECTO con la anon key. Cualquiera con la sesión de
-- un empleado puede saltear el JS y postear a PostgREST a mano. Las reglas que
-- importan tienen que estar también en la base.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Longitudes. Sin esto, `text` acepta megabytes por campo.
-- ---------------------------------------------------------------------------
alter table public.pedidos
  drop constraint if exists pedidos_referencia_len,
  add  constraint pedidos_referencia_len
    check (char_length(referencia) between 1 and 40);

alter table public.locales
  drop constraint if exists locales_nombre_len,
  add  constraint locales_nombre_len check (char_length(nombre) between 2 and 80),
  drop constraint if exists locales_direccion_len,
  add  constraint locales_direccion_len check (direccion is null or char_length(direccion) <= 160),
  drop constraint if exists locales_whatsapp_len,
  add  constraint locales_whatsapp_len check (whatsapp is null or char_length(whatsapp) <= 30),
  drop constraint if exists locales_hora_corte_rango,
  add  constraint locales_hora_corte_rango check (hora_corte between 0 and 23),
  drop constraint if exists locales_mesas_rango,
  add  constraint locales_mesas_rango
    check (cantidad_mesas is null or cantidad_mesas between 1 and 500);

alter table public.empleados
  drop constraint if exists empleados_nombre_len,
  add  constraint empleados_nombre_len check (char_length(nombre) between 2 and 80),
  drop constraint if exists empleados_rol_len,
  add  constraint empleados_rol_len check (rol is null or char_length(rol) <= 60),
  drop constraint if exists empleados_pin_formato,
  add  constraint empleados_pin_formato check (pin is null or pin ~ '^[0-9]{4}$');

alter table public.organizaciones
  drop constraint if exists org_nombre_len,
  add  constraint org_nombre_len check (char_length(nombre) between 2 and 120),
  drop constraint if exists org_email_formato,
  add  constraint org_email_formato check (dueno_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  drop constraint if exists org_cupo_rango,
  add  constraint org_cupo_rango check (cupo between 1 and 500),
  drop constraint if exists org_plan_valido,
  add  constraint org_plan_valido check (plan in ('mensual','anual','gratis')),
  drop constraint if exists org_cuil_formato,
  add  constraint org_cuil_formato
    check (cuil is null or cuil = '' or char_length(regexp_replace(cuil,'\D','','g')) = 11);

alter table public.solicitudes
  drop constraint if exists solicitudes_nombre_len,
  add  constraint solicitudes_nombre_len check (char_length(nombre) between 2 and 120),
  drop constraint if exists solicitudes_email_len,
  add  constraint solicitudes_email_len check (char_length(email) between 5 and 160),
  drop constraint if exists solicitudes_local_len,
  add  constraint solicitudes_local_len check (local is null or char_length(local) <= 120),
  drop constraint if exists solicitudes_ciudad_len,
  add  constraint solicitudes_ciudad_len check (ciudad is null or char_length(ciudad) <= 80),
  drop constraint if exists solicitudes_estado_valido,
  add  constraint solicitudes_estado_valido check (estado in ('nueva','atendida','descartada'));

alter table public.push_subscriptions
  drop constraint if exists push_endpoint_https,
  add  constraint push_endpoint_https
    check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  drop constraint if exists push_keys_len,
  add  constraint push_keys_len
    check (char_length(p256dh) <= 200 and char_length(auth) <= 100);


-- ---------------------------------------------------------------------------
-- 2) Cupo de sucursales contratado.
-- Hoy el límite se chequea en la UI del superadmin: por PostgREST se podían
-- crear sucursales de más y facturar mal.
-- ---------------------------------------------------------------------------
create or replace function public.chequear_cupo_sucursales()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cupo int;
  v_usadas int;
begin
  select cupo into v_cupo from public.organizaciones
    where id = new.organizacion_id;
  if v_cupo is null then
    raise exception 'La organización no existe';
  end if;

  select count(*) into v_usadas from public.locales
    where organizacion_id = new.organizacion_id
      and (TG_OP = 'INSERT' or id <> new.id);

  if v_usadas + 1 > v_cupo then
    raise exception 'Cupo de sucursales lleno (% de %)', v_usadas, v_cupo;
  end if;
  return new;
end;
$$;

drop trigger if exists locales_cupo on public.locales;
create trigger locales_cupo
  before insert or update of organizacion_id on public.locales
  for each row execute function public.chequear_cupo_sucursales();


-- ---------------------------------------------------------------------------
-- 3) Transiciones de estado del pedido.
-- El flujo es creado → (en_preparacion) → listo → retirado, con cancelado como
-- salida. Sin esto, cualquier caja podía "des-retirar" un pedido o marcarlo
-- listo después de cancelarlo, y las métricas de tiempos quedaban mintiendo.
-- ---------------------------------------------------------------------------
create or replace function public.chequear_transicion_pedido()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
       (old.estado = 'creado'         and new.estado in ('en_preparacion','listo','cancelado'))
    or (old.estado = 'en_preparacion' and new.estado in ('listo','cancelado'))
    or (old.estado = 'listo'          and new.estado in ('retirado','cancelado'))
  ) then
    raise exception 'Transición de pedido no permitida: % → %', old.estado, new.estado;
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_transicion on public.pedidos;
create trigger pedidos_transicion
  before update of estado on public.pedidos
  for each row execute function public.chequear_transicion_pedido();


-- ---------------------------------------------------------------------------
-- 4) El qr_token lo genera el cliente (crypto.randomUUID). Exigimos que sea un
-- UUID de verdad para que nadie inserte un token corto y adivinable.
-- ---------------------------------------------------------------------------
alter table public.pedidos
  drop constraint if exists pedidos_qr_token_uuid,
  add  constraint pedidos_qr_token_uuid
    check (qr_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Y que la expiración no se pueda estirar indefinidamente (máx. 48h).
alter table public.pedidos
  drop constraint if exists pedidos_expira_razonable,
  add  constraint pedidos_expira_razonable
    check (qr_expira_en <= creado_en + interval '48 hours');
