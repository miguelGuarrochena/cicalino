-- ===========================================================================
-- Cicalino — Fixes de seguridad #03 (PINs de empleados)
-- Correr DESPUÉS de security-fixes-02.sql. Idempotente.
--
-- PROBLEMA
-- `empleados.pin` estaba en texto plano y el panel lo bajaba entero al
-- navegador (`select id, nombre, rol, pin`). La verificación del fichaje se
-- hacía en el cliente comparando strings, así que:
--   · cualquier empleado veía el PIN de todos sus compañeros,
--   · los PINs quedaban en localStorage de un dispositivo compartido,
--   · saltear el chequeo era abrir devtools.
-- Resultado: fichar como otra persona era trivial, y las métricas por empleado
-- no eran confiables.
--
-- SOLUCIÓN
-- Hash con pgcrypto (bcrypt), la columna deja de ser legible desde el cliente,
-- y la verificación pasa a una función del servidor.
-- ===========================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) Columna de hash + flag público "tiene PIN" (para la UI, sin filtrar nada)
-- ---------------------------------------------------------------------------
alter table public.empleados
  add column if not exists pin_hash text;

alter table public.empleados
  drop column if exists tiene_pin;
alter table public.empleados
  add column tiene_pin boolean
    generated always as (pin_hash is not null) stored;

-- Migrar los PINs en texto plano que ya existan.
update public.empleados
   set pin_hash = extensions.crypt(pin, extensions.gen_salt('bf', 10))
 where pin is not null and pin <> '' and pin_hash is null;

-- Ya migrados: borramos el texto plano.
update public.empleados set pin = null where pin is not null;

-- ---------------------------------------------------------------------------
-- 2) Que el cliente no pueda leer ni escribir el PIN
-- RLS filtra FILAS; los privilegios por columna filtran COLUMNAS. PostgREST
-- respeta ambos, así que un `select *` ya no trae el hash.
-- ---------------------------------------------------------------------------
revoke select (pin, pin_hash) on public.empleados from anon, authenticated;
revoke insert (pin, pin_hash) on public.empleados from anon, authenticated;
revoke update (pin, pin_hash) on public.empleados from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Definir / cambiar el PIN (solo quien ya puede administrar esa sucursal)
-- ---------------------------------------------------------------------------
create or replace function public.set_empleado_pin(p_empleado uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_local uuid;
  v_pin text := nullif(regexp_replace(coalesce(p_pin,''), '\D', '', 'g'), '');
begin
  select local_id into v_local from public.empleados where id = p_empleado;
  if v_local is null then
    raise exception 'Empleado inexistente';
  end if;

  -- Reutiliza el control de acceso de las policies: si no podés ver el local,
  -- no podés tocarle los PINs.
  if not public.puede_ver_local(v_local) then
    raise exception 'No autorizado';
  end if;

  if v_pin is null then
    update public.empleados set pin_hash = null where id = p_empleado;
    return;
  end if;

  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN tiene que ser de 4 dígitos';
  end if;

  -- Dos personas del mismo local no pueden compartir PIN (antes se chequeaba
  -- en el cliente, que era justamente donde no servía).
  if exists (
    select 1 from public.empleados e
    where e.local_id = v_local
      and e.id <> p_empleado
      and e.pin_hash is not null
      and e.pin_hash = extensions.crypt(v_pin, e.pin_hash)
  ) then
    raise exception 'Ese PIN ya está en uso en la sucursal';
  end if;

  update public.empleados
     set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 10))
   where id = p_empleado;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Verificar el PIN al fichar. Devuelve el empleado solo si coincide.
-- El cliente nunca recibe el hash: manda el PIN y recibe sí/no.
-- ---------------------------------------------------------------------------
create or replace function public.verificar_pin_empleado(
  p_empleado uuid,
  p_pin text
)
returns table (id uuid, nombre text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_local uuid;
  v_hash text;
  v_pin text := regexp_replace(coalesce(p_pin,''), '\D', '', 'g');
begin
  select e.local_id, e.pin_hash into v_local, v_hash
    from public.empleados e where e.id = p_empleado and e.activo;
  if v_local is null then
    raise exception 'Empleado inexistente';
  end if;
  if not public.puede_ver_local(v_local) then
    raise exception 'No autorizado';
  end if;

  -- Sin PIN configurado: ficha directo (comportamiento actual).
  if v_hash is null then
    return query select e.id, e.nombre from public.empleados e where e.id = p_empleado;
    return;
  end if;

  if v_hash = extensions.crypt(v_pin, v_hash) then
    return query select e.id, e.nombre from public.empleados e where e.id = p_empleado;
  end if;
  -- PIN incorrecto: devuelve 0 filas (sin decir por qué).
  return;
end;
$$;

grant execute on function public.set_empleado_pin(uuid, text) to authenticated;
grant execute on function public.verificar_pin_empleado(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) La columna vieja ya no se usa. Descomentá cuando confirmes que el deploy
--    nuevo está andando y no necesitás rollback.
-- ---------------------------------------------------------------------------
-- alter table public.empleados drop column pin;
